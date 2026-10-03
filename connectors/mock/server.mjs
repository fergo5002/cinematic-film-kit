#!/usr/bin/env node
// A local stand-in for the five providers, for tests and for trying the CLI
// with no key and no spend. Two listeners: an API host that imitates each
// provider's documented routes and bodies, and a separate "CDN" host for output
// files, so tests can check that no key ever travels to a file host.
//
// Every route names what it imitates. "observed" means seen in an
// unauthenticated probe with a fake key on 2026-10-01; "doc" means the
// provider's documentation read on 2026-10-01; "guess" means neither, and the
// shape is this mock's best reading. Treat guesses as placeholders.
//
// Fault switches per provider: auth, credit, rate (429 with Retry-After, once
// by default), server (500), timeout (never answers), failed-job, expired-output
// (the file host answers 404), malformed (200 with broken JSON), redirect (a 307
// to the file host). Each fault can be limited to one phase (submit, poll,
// result, download, upload) and a count.
//
//   node connectors/mock/server.mjs --port 8787 --fixtures <dir>

import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadFixtures, makeFixtures } from './fixtures.mjs';

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

const rid = (n = 16) => crypto.randomBytes(n).toString('hex');
const b32 = () => crypto.randomBytes(16).toString('base64').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 26).padEnd(26, 'q');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseJson(buf) {
  try {
    return JSON.parse(buf.toString('utf8') || 'null');
  } catch {
    return undefined;
  }
}

export async function startMock({ fixturesDir, fixtures: given, keys = {}, pollsBeforeDone = 2, host = '127.0.0.1', port = 0 } = {}) {
  const fx = given ?? loadFixtures(fixturesDir);
  const state = {
    faults: {},
    variants: {},
    jobs: new Map(),
    files: new Map(),
    uploads: new Map(),
    log: [],
    held: new Set(),
  };

  // ---- shared helpers -------------------------------------------------------

  function takeFault(provider, phase) {
    const f = state.faults[provider];
    if (!f) return null;
    if (f.on && f.on !== 'any' && f.on !== phase) return null;
    if (f.times != null) {
      if (f.times <= 0) return null;
      f.times -= 1;
    }
    return f.type;
  }

  function hold(res) {
    // The "timeout" fault: never answer. Closed when the mock stops.
    state.held.add(res);
  }

  function malformed(res) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"status": "IN_PROGRESS", "unterminated');
  }

  // The "redirect" fault: a 307 to the file host, which is another origin. A
  // client that followed it would send its credentials to the wrong place.
  function redirectAway(res) {
    res.writeHead(307, { location: `${cdnUrl()}/redirected` });
    res.end();
  }

  let api;
  let cdn;
  const apiUrl = () => `http://${host}:${api.address().port}`;
  const cdnUrl = () => `http://${host}:${cdn.address().port}`;

  function cdnFile(kind) {
    const id = rid(8);
    const ext = { video: 'mp4', image: 'png', wav: 'wav', mp3: 'mp3' }[kind];
    state.files.set(id, kind);
    return `${cdnUrl()}/files/${id}.${ext}`;
  }

  // ---- fal (queue host under /fal, storage under /fal-rest) -----------------
  // doc: https://fal.ai/docs/documentation/model-apis/inference/queue.md
  // doc: https://fal.ai/docs/documentation/model-apis/errors.md, request-errors.md

  function falAuthOk(req) {
    return req.headers.authorization === `Key ${keys.fal}`;
  }

  function falError(res, type) {
    switch (type) {
      case 'auth':
        return json(res, 401, { detail: 'invalid key credentials' }); // observed
      case 'credit':
        // guess: the status (403) and the words "Exhausted balance" come from an
        // earlier local note, not from fal's docs.
        return json(res, 403, { detail: 'User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing.' });
      case 'rate':
        // doc: 429 with X-Fal-Needs-Retry; body text and Retry-After are guesses.
        return json(res, 429, { detail: 'Concurrent requests limit exceeded', error_type: 'concurrent_requests_limit' }, { 'x-fal-needs-retry': '1', 'retry-after': '1' });
      case 'server':
        return json(res, 500, { detail: 'Internal server error', error_type: 'internal_error' }, { 'x-fal-error-type': 'internal_error' }); // doc shape
      default:
        return null;
    }
  }

  function falOutput(job) {
    const e = job.endpoint;
    if (/to-video/.test(e)) return { video: { url: cdnFile('video'), content_type: 'video/mp4', file_name: 'output.mp4', file_size: fx.mp4.length }, seed: 42 };
    if (/lyria/.test(e)) return { audio: cdnFile('mp3'), lyrics: '[Instrumental]' }; // schema example: audio as a bare URL
    if (/sound-effects|audio|music/.test(e)) {
      const wav = job.input?.output_format === 'wav';
      return { audio: { url: cdnFile(wav ? 'wav' : 'mp3'), content_type: wav ? 'audio/wav' : 'audio/mpeg', file_name: wav ? 'out.wav' : 'out.mp3' }, ...(wav ? { seed: 7 } : {}) };
    }
    return { images: [{ url: cdnFile('image'), content_type: 'image/png', file_name: 'out.png', width: 64, height: 64 }], description: '', seed: 1234 };
  }

  async function handleFal(req, res, rest) {
    const q = new URL(req.url, 'http://x');
    const parts = rest.split('/').filter(Boolean);
    const reqIdx = parts.indexOf('requests');
    if (req.method === 'POST' && reqIdx === -1) {
      const body = await readBody(req);
      if (!falAuthOk(req)) return falError(res, 'auth');
      const f = takeFault('fal', 'submit');
      if (f === 'redirect') return redirectAway(res);
      if (f === 'timeout') return hold(res);
      if (f === 'malformed') return malformed(res);
      if (f && falError(res, f) !== null) return;
      const input = parseJson(body);
      if (input === undefined) return json(res, 422, { detail: [{ loc: ['body'], msg: 'invalid JSON', type: 'value_error' }] });
      if (parts.length < 2) return json(res, 404, { detail: `Application "${parts[0] ?? ''}" not found` });
      const id = crypto.randomUUID();
      const app = `${parts[0]}/${parts[1]}`;
      state.jobs.set(id, { provider: 'fal', endpoint: parts.join('/'), app, input, polls: 0, failed: f === 'failed-job' });
      const base = `${apiUrl()}/fal/${app}/requests/${id}`;
      // doc fields plus gateway_request_id (webhooks doc); URLs on the app path (fal-js, observed)
      return json(res, 200, { status: 'IN_QUEUE', request_id: id, gateway_request_id: id, response_url: base, status_url: `${base}/status`, cancel_url: `${base}/cancel`, queue_position: 0 });
    }
    if (reqIdx !== 2) {
      // observed: a sub-path such as owner/alias/v3/pro/requests/<id>/status answers 405
      res.writeHead(405, { allow: 'POST' });
      return res.end();
    }
    const id = parts[3];
    const tail = parts.slice(4).join('/');
    if (!falAuthOk(req)) return falError(res, 'auth');
    const job = state.jobs.get(id);
    if (req.method === 'GET' && tail === 'status') {
      const f = takeFault('fal', 'poll');
      if (f === 'redirect') return redirectAway(res);
      if (f === 'timeout') return hold(res);
      if (f === 'malformed') return malformed(res);
      if (f && falError(res, f) !== null) return;
      if (!job) return json(res, 404, { status: 'NOT_FOUND' }); // observed
      job.polls += 1;
      const base = { request_id: id, response_url: `${apiUrl()}/fal/${job.app}/requests/${id}` };
      if (job.polls === 1) return json(res, 200, { status: 'IN_QUEUE', queue_position: 0, ...base });
      if (job.polls < pollsBeforeDone + 1) return json(res, 200, { status: 'IN_PROGRESS', logs: [], ...base });
      if (job.failed) return json(res, 200, { status: 'COMPLETED', logs: [], metrics: { inference_time: null }, error: 'Request timed out', error_type: 'request_timeout', ...base }); // doc fields
      job.done = true;
      return json(res, 200, { status: 'COMPLETED', logs: [], metrics: { inference_time: 1.5 }, ...base });
    }
    if (req.method === 'GET' && tail === '') {
      const f = takeFault('fal', 'result');
      if (f === 'timeout') return hold(res);
      if (f === 'malformed') return malformed(res);
      if (f && falError(res, f) !== null) return;
      if (!job) return json(res, 404, { detail: 'Request not found' }); // observed
      if (!job.done) return json(res, 400, { detail: 'Request is still in progress' }); // guess
      job.output = job.output ?? falOutput(job);
      return json(res, 200, job.output, { 'x-fal-billable-units': '1' });
    }
    if (req.method === 'PUT' && tail === 'cancel') {
      if (!job) return json(res, 404, { status: 'NOT_FOUND' });
      return json(res, job.done ? 400 : 202, { status: job.done ? 'ALREADY_COMPLETED' : 'CANCELLATION_REQUESTED' }); // doc
    }
    res.writeHead(405, { allow: 'POST' });
    return res.end();
  }

  async function handleFalRest(req, res, rest) {
    // src: fal-js storage.ts (initiate, then a PUT to the signed upload_url)
    if (req.method === 'POST' && rest.startsWith('storage/upload/initiate')) {
      const body = parseJson(await readBody(req));
      if (!falAuthOk(req)) return json(res, 401, { detail: 'Authorization header is required' }); // observed without a key
      const f = takeFault('fal', 'upload');
      if (f && falError(res, f) !== null) return;
      const token = rid(8);
      state.uploads.set(token, { name: body?.file_name ?? 'upload.bin', type: body?.content_type ?? 'application/octet-stream', bytes: null });
      return json(res, 200, { upload_url: `${apiUrl()}/fal-rest/upload/${token}`, file_url: `${cdnUrl()}/uploads/${token}/${encodeURIComponent(body?.file_name ?? 'upload.bin')}` });
    }
    if (req.method === 'PUT' && rest.startsWith('upload/')) {
      const token = rest.split('/')[1];
      const up = state.uploads.get(token);
      const bytes = await readBody(req);
      if (!up) return json(res, 404, { detail: 'unknown upload' });
      up.bytes = bytes;
      up.auth = req.headers.authorization ?? null;
      res.writeHead(200);
      return res.end();
    }
    return json(res, 404, { detail: 'not found' });
  }

  // ---- Replicate (/replicate/v1) --------------------------------------------
  // doc: https://api.replicate.com/openapi.json; lifecycle and rate-limit topics

  function repAuthOk(req) {
    return req.headers.authorization === `Bearer ${keys.replicate}` || req.headers.authorization === `Token ${keys.replicate}`;
  }

  function repError(res, type) {
    const problem = { 'content-type': 'application/problem+json' };
    switch (type) {
      case 'auth':
        return json(res, 401, { status: 401, detail: 'Invalid or expired API token.', title: 'Authentication required' }, problem); // observed
      case 'credit':
        return json(res, 402, { title: 'Insufficient credit', detail: 'You have insufficient credit to run this model. Go to https://replicate.com/account/billing#billing to purchase credit. Once you purchase credit, please wait a few minutes before retrying.', status: 402 }, problem); // guess
      case 'rate':
        return json(res, 429, { detail: 'Request was throttled. Your rate limit resets in ~30s.' }, { 'retry-after': '1' }); // doc text; header per the JS client source
      case 'server':
        return json(res, 500, { title: 'Internal Server Error', detail: 'An unexpected error occurred.', status: 500 }, problem); // guess
      default:
        return null;
    }
  }

  function repKind(model) {
    if (/gpt-image|nano-banana|flux-3-image/.test(model)) return 'image';
    if (/music|lyria|stable-audio/.test(model)) return 'mp3';
    return 'video';
  }

  function prediction(job) {
    const base = `${apiUrl()}/replicate/v1/predictions/${job.id}`;
    return {
      id: job.id,
      model: job.model,
      version: 'hidden',
      input: job.input,
      logs: '',
      output: job.output ?? null,
      data_removed: false,
      error: job.error ?? null,
      status: job.status,
      source: 'api',
      created_at: job.created,
      ...(job.status === 'succeeded' ? { completed_at: new Date().toISOString(), metrics: { predict_time: 2.1, total_time: 2.4 } } : {}),
      urls: { web: `https://replicate.com/p/${job.id}`, get: base, cancel: `${base}/cancel` },
    };
  }

  async function handleReplicate(req, res, rest) {
    const parts = rest.split('/').filter(Boolean);
    if (parts[0] !== 'v1') return json(res, 404, { detail: 'Not found.' });
    if (req.method === 'POST' && parts[1] === 'models' && parts[4] === 'predictions') {
      const body = await readBody(req);
      if (!req.headers.authorization) return json(res, 401, { detail: 'Authorization header required' }); // observed
      if (!repAuthOk(req)) return repError(res, 'auth');
      const f = takeFault('replicate', 'submit');
      if (f === 'redirect') return redirectAway(res);
      if (f === 'timeout') return hold(res);
      if (f === 'malformed') return malformed(res);
      if (f && repError(res, f) !== null) return;
      const payload = parseJson(body);
      if (!payload?.input) return json(res, 422, { title: 'Input validation failed', detail: '- input: input is required', status: 422 }, { 'content-type': 'application/problem+json' }); // guess
      const id = b32();
      const job = { id, model: `${parts[2]}/${parts[3]}`, input: payload.input, status: 'starting', polls: 0, created: new Date().toISOString(), failed: f === 'failed-job', cancelAfter: req.headers['cancel-after'] ?? null };
      state.jobs.set(id, job);
      return json(res, 201, prediction(job), { location: `${apiUrl()}/replicate/v1/predictions/${id}` });
    }
    if (req.method === 'GET' && parts[1] === 'predictions' && parts[2]) {
      if (!repAuthOk(req)) return json(res, 401, { title: 'Unauthenticated', detail: 'You did not pass a valid authentication token', status: 401 }, { 'content-type': 'application/problem+json' }); // observed
      const f = takeFault('replicate', 'poll');
      if (f === 'redirect') return redirectAway(res);
      if (f === 'timeout') return hold(res);
      if (f === 'malformed') return malformed(res);
      if (f && repError(res, f) !== null) return;
      const job = state.jobs.get(parts[2]);
      if (!job) return json(res, 404, { title: 'Not found', detail: 'The requested resource could not be found.', status: 404 }, { 'content-type': 'application/problem+json' }); // guess
      job.polls += 1;
      if (job.polls < pollsBeforeDone) job.status = 'processing';
      else if (job.failed) {
        job.status = 'failed';
        job.error = 'E6716: Timeout starting prediction'; // code from the error-codes doc; formatting is a guess
      } else {
        job.status = 'succeeded';
        const kind = repKind(job.model);
        const url = cdnFile(kind === 'image' ? 'image' : kind);
        job.output = /gpt-image/.test(job.model) ? [url] : url; // schema: array for GPT Image, string for most
      }
      return json(res, 200, prediction(job));
    }
    if (req.method === 'POST' && parts[1] === 'files') {
      const body = await readBody(req);
      if (!repAuthOk(req)) return repError(res, 'auth');
      const f = takeFault('replicate', 'upload');
      if (f && repError(res, f) !== null) return;
      if (!/^multipart\/form-data/.test(req.headers['content-type'] ?? '') || body.length === 0) return json(res, 400, { detail: 'expected multipart content' });
      const id = b32();
      const now = new Date();
      // doc: Files API 201 file object
      return json(res, 201, {
        id,
        urls: { get: `${apiUrl()}/replicate/v1/files/${id}` },
        content_type: 'image/png',
        size: body.length,
        checksums: { sha256: crypto.createHash('sha256').update(body).digest('hex') },
        metadata: {},
        created_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 3600_000).toISOString(),
      });
    }
    return json(res, 404, { detail: 'Not found.' });
  }

  // ---- ElevenLabs (/elevenlabs/v1) ------------------------------------------
  // doc: api-reference pages for sound-generation, music, text-to-speech; errors page

  function elError(res, type) {
    const d = (status, type2, code, message) => json(res, status, { detail: { type: type2, code, message, status: code, request_id: rid() } });
    switch (type) {
      case 'auth':
        return json(res, 401, { detail: { type: 'authentication_error', code: 'unauthorized', message: 'Invalid API key', status: 'invalid_api_key', request_id: rid() } }); // observed
      case 'credit':
        return d(402, 'payment_required', 'insufficient_credits', 'Your account does not have enough credits for this operation.'); // composed from the doc tables
      case 'rate':
        res.setHeader('retry-after', '1'); // guess: Retry-After is not documented
        return d(429, 'rate_limit_error', 'rate_limit_exceeded', 'Too many requests. Wait before retrying.');
      case 'server':
        return d(500, 'internal_error', 'internal_error', 'An unexpected error occurred. Contact support if this persists.');
      case 'failed-job':
        return json(res, 422, { detail: [{ loc: ['body', 'text'], msg: 'the request could not be completed', type: 'value_error' }] }); // doc schema
      default:
        return null;
    }
  }

  async function handleElevenLabs(req, res, rest) {
    const body = await readBody(req);
    if (req.method !== 'POST') return json(res, 405, { detail: 'Method Not Allowed' });
    if (!req.headers['xi-api-key']) return json(res, 401, { detail: { type: 'authentication_error', code: 'unauthorized', message: 'Neither authorization header nor xi-api-key received, please provide one.', status: 'needs_authorization', request_id: rid() } }); // observed
    if (req.headers['xi-api-key'] !== keys.elevenlabs) return elError(res, 'auth');
    const f = takeFault('elevenlabs', 'submit');
    if (f === 'redirect') return redirectAway(res);
    if (f === 'timeout') return hold(res);
    if (f === 'malformed') {
      res.writeHead(200, { 'content-type': 'audio/mpeg' });
      return res.end();
    }
    if (f && elError(res, f) !== null) return;
    const payload = parseJson(body);
    if (payload === undefined) return json(res, 422, { detail: [{ loc: ['body'], msg: 'invalid JSON', type: 'value_error' }] });
    const id = rid();
    if (rest === 'v1/sound-generation') {
      if (!payload?.text) return json(res, 422, { detail: [{ loc: ['body', 'text'], msg: 'field required', type: 'missing' }] });
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'character-cost': String(payload.duration_seconds ? Math.round(payload.duration_seconds * 40) : 100), 'request-id': id }); // character-cost: OpenAPI; request-id: guess
      return res.end(fx.mp3);
    }
    if (rest === 'v1/music') {
      const ms = payload?.music_length_ms;
      if (!payload?.prompt || (ms != null && (ms < 3000 || ms > 600000))) return json(res, 422, { detail: [{ loc: ['body', 'music_length_ms'], msg: 'must be between 3000 and 600000', type: 'value_error' }] });
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'song-id': `song_${id}` }); // song-id: OpenAPI
      return res.end(fx.mp3);
    }
    if (rest.startsWith('v1/text-to-speech/')) {
      if (!payload?.text) return json(res, 422, { detail: [{ loc: ['body', 'text'], msg: 'field required', type: 'missing' }] });
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'request-id': id });
      return res.end(fx.mp3);
    }
    return json(res, 404, { detail: { type: 'not_found', code: 'not_found', message: 'Not found', status: 'not_found' } });
  }

  // ---- OpenAI (/openai/v1) --------------------------------------------------
  // doc: images and audio speech references; error-codes guide

  function oaError(res, type, presented) {
    switch (type) {
      case 'auth': {
        // observed: text/plain, and the key echoed as its first 5 and last 4 characters
        const k = String(presented ?? '');
        const masked = k.length > 9 ? `${k.slice(0, 5)}${'*'.repeat(Math.max(3, k.length - 9))}${k.slice(-4)}` : '****';
        res.writeHead(401, { 'content-type': 'text/plain', 'x-request-id': `req_${rid()}` });
        return res.end(JSON.stringify({ error: { message: `Incorrect API key provided: ${masked}. You can find your API key at https://platform.openai.com/account/api-keys.`, type: 'invalid_request_error', code: 'invalid_api_key', param: null }, status: 401 }, null, 2));
      }
      case 'credit':
        return json(res, 429, { error: { message: 'You exceeded your current quota, please check your plan and billing details.', type: 'insufficient_quota', param: null, code: 'credit_balance_exhausted' } }); // code and type: doc; message: guess
      case 'rate':
        return json(res, 429, { error: { message: 'Rate limit reached for requests', type: 'requests', param: null, code: 'rate_limit_exceeded' } }, { 'retry-after': '1' }); // guess body
      case 'server':
        return json(res, 500, { error: { message: 'The server had an error while processing your request.', type: 'server_error', param: null, code: null } }); // guess body
      case 'failed-job':
        return json(res, 400, { error: { message: 'Your request was rejected by the safety system.', type: 'image_generation_user_error', param: null, code: 'moderation_blocked', moderation_details: { moderation_stage: 'input', categories: ['violence'] } } }); // doc shape
      default:
        return null;
    }
  }

  async function handleOpenAI(req, res, rest) {
    const body = await readBody(req);
    const presented = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!req.headers.authorization) return json(res, 401, { error: { message: 'Missing bearer or basic authentication in header', type: 'invalid_request_error', param: null, code: null } }); // observed
    if (presented !== keys.openai) return oaError(res, 'auth', presented);
    const f = takeFault('openai', 'submit');
    if (f === 'redirect') return redirectAway(res);
    if (f === 'timeout') return hold(res);
    if (f === 'malformed') return malformed(res);
    if (f && oaError(res, f) !== null) return;
    const payload = parseJson(body);
    if (payload === undefined) return json(res, 400, { error: { message: 'We could not parse the JSON body of your request.', type: 'invalid_request_error', param: null, code: null } });
    const reqId = `req_${rid()}`;
    if (rest === 'v1/images/generations' || rest === 'v1/images/edits') {
      if (!payload?.prompt) return json(res, 400, { error: { message: "Missing required parameter: 'prompt'.", type: 'invalid_request_error', param: 'prompt', code: 'missing_required_parameter' } });
      const edit = rest.endsWith('edits');
      if (edit && !payload?.images?.[0]?.image_url) return json(res, 400, { error: { message: "Missing required parameter: 'images'.", type: 'invalid_request_error', param: 'images', code: 'missing_required_parameter' } });
      return json(
        res,
        200,
        {
          created: Math.floor(Date.now() / 1000),
          background: 'opaque',
          data: [{ b64_json: fx.png.toString('base64') }],
          output_format: 'png',
          quality: payload.quality ?? 'auto',
          size: payload.size ?? '1024x1024',
          usage: { input_tokens: edit ? 1250 : 50, input_tokens_details: { text_tokens: 50, image_tokens: edit ? 1200 : 0 }, output_tokens: 1056, total_tokens: edit ? 2306 : 1106 },
        },
        { 'x-request-id': reqId },
      );
    }
    if (rest === 'v1/audio/speech') {
      if (!payload?.input || !payload?.voice) return json(res, 400, { error: { message: 'input and voice are required', type: 'invalid_request_error', param: null, code: null } });
      const wav = payload.response_format === 'wav';
      res.writeHead(200, { 'content-type': wav ? 'audio/wav' : 'audio/mpeg', 'x-request-id': reqId });
      return res.end(wav ? fx.wav : fx.mp3);
    }
    return json(res, 404, { error: { message: 'Invalid URL', type: 'invalid_request_error', param: null, code: null } });
  }

  // ---- Google Gemini API (/google/v1beta) ------------------------------------
  // doc: ai.google.dev/gemini-api/docs pages named in adapters/google.mjs

  function gError(res, type, api) {
    const interactions = api === 'interactions';
    switch (type) {
      case 'auth': {
        // observed: 400 INVALID_ARGUMENT, reason API_KEY_INVALID; the Interactions
        // endpoint wraps the same object in an array.
        const err = { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID', domain: 'googleapis.com', metadata: { service: 'generativelanguage.googleapis.com' } }] } };
        return json(res, 400, interactions ? [err] : err);
      }
      case 'credit':
        return interactions
          ? json(res, 402, { error: { code: 'payment_required', message: 'Your Prepay credit balance is depleted.' } }) // doc
          : json(res, 402, { error: { code: 402, message: 'Your Prepay credit balance is depleted.', status: 'RESOURCE_EXHAUSTED' } }); // doc
      case 'rate':
        // guess for the message; RetryInfo with retryDelay is the standard google.rpc detail
        return json(res, 429, { error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).', status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '1s' }] } });
      case 'server':
        return json(res, 500, { error: { code: 500, message: 'An internal error has occurred.', status: 'INTERNAL' } }); // guess message
      default:
        return null;
    }
  }

  function gKeyOk(req) {
    return req.headers['x-goog-api-key'] === keys.google;
  }

  async function handleGoogle(req, res, rest) {
    const body = await readBody(req);
    const parts = rest.split('/').filter(Boolean);
    if (parts[0] !== 'v1beta' && parts[0] !== 'v1') return json(res, 404, { error: { code: 404, message: 'Not found', status: 'NOT_FOUND' } });
    const isInteractions = parts[1] === 'interactions';
    if (!gKeyOk(req)) return gError(res, 'auth', isInteractions ? 'interactions' : 'generate');

    // POST models/<model>:generateContent | :predictLongRunning
    if (req.method === 'POST' && parts[1] === 'models') {
      const [model, method] = (parts[2] ?? '').split(':');
      const f = takeFault('google', 'submit');
      if (f === 'redirect') return redirectAway(res);
      if (f === 'timeout') return hold(res);
      if (f === 'malformed') return malformed(res);
      if (f && f !== 'failed-job' && gError(res, f, 'generate') !== null) return;
      const payload = parseJson(body);
      if (payload === undefined) return json(res, 400, { error: { code: 400, message: 'Invalid JSON payload received.', status: 'INVALID_ARGUMENT' } });
      if (method === 'predictLongRunning') {
        const id = rid(6);
        state.jobs.set(id, { provider: 'google', model, polls: 0, failed: f === 'failed-job' });
        return json(res, 200, { name: `models/${model}/operations/${id}` }); // doc
      }
      if (method !== 'generateContent') return json(res, 404, { error: { code: 404, message: 'method not found', status: 'NOT_FOUND' } });
      if (f === 'failed-job') {
        // doc: finishReason values; no media part when blocked
        return json(res, 200, { candidates: [{ content: { role: 'model', parts: [] }, finishReason: 'IMAGE_SAFETY' }], responseId: rid(8) });
      }
      let part;
      let text = null;
      if (/tts/.test(model)) {
        const pcm = state.variants.google === 'pcm';
        // doc: 3.8 TTS returns a WAV with a RIFF header on unary calls; older models sent raw PCM
        part = { inlineData: { mimeType: pcm ? 'audio/L16;codec=pcm;rate=24000' : 'audio/wav', data: (pcm ? fx.wav.subarray(44) : fx.wav).toString('base64') } };
      } else if (/lyria/.test(model)) {
        const wav = payload?.generationConfig?.responseFormat?.audio?.mimeType === 'audio/wav';
        text = '[Intro]\n[Instrumental]';
        part = { inlineData: { mimeType: wav ? 'audio/wav' : 'audio/mpeg', data: (wav ? fx.wav : fx.mp3).toString('base64') } };
      } else {
        // The echo-key variant imitates a provider that repeats the key in its reply text.
        text = state.variants.google === 'echo-key' ? `Here is the image. Key used: ${req.headers['x-goog-api-key']}` : 'Here is the image.';
        part = { inlineData: { mimeType: 'image/png', data: fx.png.toString('base64') } };
      }
      return json(res, 200, {
        candidates: [{ content: { role: 'model', parts: [...(text ? [{ text }] : []), part] }, finishReason: 'STOP', index: 0 }],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 1120, totalTokenCount: 1132 },
        modelVersion: model,
        responseId: rid(8),
      });
    }

    // GET models/<model>/operations/<id>
    if (req.method === 'GET' && parts[1] === 'models' && parts[3] === 'operations') {
      const f = takeFault('google', 'poll');
      if (f === 'redirect') return redirectAway(res);
      if (f === 'timeout') return hold(res);
      if (f === 'malformed') return malformed(res);
      if (f && gError(res, f, 'generate') !== null) return;
      const job = state.jobs.get(parts[4]);
      const name = `models/${parts[2]}/operations/${parts[4]}`;
      if (!job) return json(res, 404, { error: { code: 404, message: 'Operation not found', status: 'NOT_FOUND' } });
      job.polls += 1;
      if (job.polls < pollsBeforeDone) return json(res, 200, { name, done: false });
      if (job.failed) return json(res, 200, { name, done: true, error: { code: 13, message: 'Video generation failed.' } }); // guess message; google.rpc.Status shape
      const fid = rid(6);
      state.files.set(`g-${fid}`, 'video');
      return json(res, 200, {
        name,
        done: true,
        response: {
          '@type': 'type.googleapis.com/google.ai.generativelanguage.v1beta.PredictLongRunningResponse',
          generateVideoResponse: { generatedSamples: [{ video: { uri: `${apiUrl()}/google/v1beta/files/${fid}:download?alt=media` } }] },
        },
      }); // doc path: response.generateVideoResponse.generatedSamples[0].video.uri
    }

    // Interactions API
    if (isInteractions && req.method === 'POST' && !parts[2]) {
      const f = takeFault('google', 'submit');
      if (f === 'redirect') return redirectAway(res);
      if (f === 'timeout') return hold(res);
      if (f === 'malformed') return malformed(res);
      if (f && f !== 'failed-job' && gError(res, f, 'interactions') !== null) return;
      const payload = parseJson(body);
      if (!payload?.model || !payload?.input) return json(res, 400, { error: { code: 'invalid_request', message: 'model and input are required' } });
      const id = `v1_${rid(8)}`;
      state.jobs.set(id, { provider: 'google', model: payload.model, polls: 0, failed: f === 'failed-job', apiRevision: req.headers['api-revision'] ?? null });
      return json(res, 200, { id, status: 'in_progress', object: 'interaction', model: payload.model }); // doc: background returns an id at once
    }
    if (isInteractions && req.method === 'GET' && parts[2]) {
      const f = takeFault('google', 'poll');
      if (f === 'redirect') return redirectAway(res);
      if (f === 'timeout') return hold(res);
      if (f === 'malformed') return malformed(res);
      if (f && gError(res, f, 'interactions') !== null) return;
      const job = state.jobs.get(parts[2]);
      if (!job) return json(res, 404, { error: { code: 'not_found', message: 'Interaction not found' } });
      job.polls += 1;
      if (job.polls < pollsBeforeDone) return json(res, 200, { id: parts[2], status: 'in_progress', object: 'interaction', model: job.model });
      if (job.failed) return json(res, 200, { id: parts[2], status: 'failed', object: 'interaction', model: job.model, error: { code: 'api_error', message: 'Video generation failed.' } }); // guess
      let video;
      if (state.variants.google === 'interaction-uri') {
        const fid = rid(6);
        state.files.set(`g-${fid}`, 'video');
        video = { type: 'video', mime_type: 'video/mp4', uri: `${apiUrl()}/google/v1beta/files/${fid}:download?alt=media` };
      } else {
        video = { type: 'video', mime_type: 'video/mp4', data: fx.mp4.toString('base64') };
      }
      return json(res, 200, {
        id: parts[2],
        status: 'completed',
        object: 'interaction',
        model: job.model,
        steps: [
          { type: 'user_input', content: [{ type: 'text', text: '...' }] },
          { type: 'model_output', content: [video] },
        ],
      }); // doc: REST response schema in omni.md
    }

    // Files API: state, then download (redirects to the file host)
    if (req.method === 'GET' && parts[1] === 'files' && parts[2]) {
      const [fid, verb] = parts[2].split(':');
      if (!state.files.has(`g-${fid}`)) return json(res, 404, { error: { code: 404, message: 'File not found', status: 'NOT_FOUND' } });
      if (verb === 'download') {
        const f = takeFault('google', 'download');
        if (f === 'expired-output') return json(res, 404, { error: { code: 404, message: 'File not found or expired', status: 'NOT_FOUND' } }); // guess
        if (f === 'timeout') return hold(res);
        // guess: the docs use curl -L, so a redirect to storage is expected
        res.writeHead(302, { location: cdnFile('video') });
        return res.end();
      }
      const seen = (state.fileChecks ??= new Map());
      const n = (seen.get(fid) ?? 0) + 1;
      seen.set(fid, n);
      return json(res, 200, { name: `files/${fid}`, mimeType: 'video/mp4', state: n < 2 ? 'PROCESSING' : 'ACTIVE' }); // doc: poll until ACTIVE
    }
    return json(res, 404, { error: { code: 404, message: 'Not found', status: 'NOT_FOUND' } });
  }

  // ---- the two listeners ----------------------------------------------------

  function record(server, req) {
    state.log.push({ host: server, method: req.method, path: req.url, headers: { ...req.headers } });
  }

  api = http.createServer(async (req, res) => {
    record('api', req);
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/__mock/fault' && req.method === 'POST') {
        const b = parseJson(await readBody(req));
        if (b?.provider) state.faults[b.provider] = b.fault ?? null;
        return json(res, 200, { ok: true });
      }
      const [, provider, ...rest] = url.pathname.split('/');
      const tail = rest.join('/') + (url.search && provider === 'fal-rest' ? url.search : '');
      if (provider === 'fal') return await handleFal(req, res, rest.join('/'));
      if (provider === 'fal-rest') return await handleFalRest(req, res, tail);
      if (provider === 'replicate') return await handleReplicate(req, res, rest.join('/'));
      if (provider === 'elevenlabs') return await handleElevenLabs(req, res, rest.join('/'));
      if (provider === 'openai') return await handleOpenAI(req, res, rest.join('/'));
      if (provider === 'google') return await handleGoogle(req, res, rest.join('/'));
      return json(res, 404, { error: 'unknown mock route' });
    } catch (e) {
      if (!res.headersSent) json(res, 500, { error: `mock error: ${e.message}` });
      else res.end();
    }
  });

  cdn = http.createServer((req, res) => {
    record('cdn', req);
    const url = new URL(req.url, 'http://x');
    const m = /^\/files\/([0-9a-f]+)\.(mp4|png|wav|mp3)$/.exec(url.pathname);
    if (m) {
      for (const p of ['fal', 'replicate', 'google']) {
        const f = state.faults[p];
        if (f?.type === 'expired-output' && (f.on ?? 'download') === 'download' && state.files.has(m[1])) {
          res.writeHead(404, { 'content-type': 'text/plain' }); // guess: expired links answer 404
          return res.end('Not Found');
        }
      }
      const kind = state.files.get(m[1]);
      if (!kind) {
        res.writeHead(404);
        return res.end();
      }
      const body = { video: fx.mp4, image: fx.png, wav: fx.wav, mp3: fx.mp3 }[kind];
      const type = { video: 'video/mp4', image: 'image/png', wav: 'audio/wav', mp3: 'audio/mpeg' }[kind];
      res.writeHead(200, { 'content-type': type, 'content-length': body.length });
      return res.end(body);
    }
    if (url.pathname === '/redirected') {
      // Only reached if a client followed the "redirect" fault.
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{}');
    }
    const u = /^\/uploads\/([0-9a-f]+)\//.exec(url.pathname);
    if (u && state.uploads.get(u[1])?.bytes) {
      res.writeHead(200, { 'content-type': state.uploads.get(u[1]).type });
      return res.end(state.uploads.get(u[1]).bytes);
    }
    res.writeHead(404);
    return res.end();
  });

  const sockets = new Set();
  for (const s of [api, cdn]) s.on('connection', (c) => {
    sockets.add(c);
    c.on('close', () => sockets.delete(c));
  });
  await new Promise((r) => api.listen(port, host, r));
  await new Promise((r) => cdn.listen(0, host, r));

  const url = apiUrl();
  return {
    url,
    cdnUrl: cdnUrl(),
    bases: {
      fal: `${url}/fal`,
      falStorage: `${url}/fal-rest`,
      replicate: `${url}/replicate/v1`,
      elevenlabs: `${url}/elevenlabs`,
      openai: `${url}/openai/v1`,
      google: `${url}/google`,
    },
    keys,
    log: state.log,
    uploads: state.uploads,
    jobs: state.jobs,
    setFault(provider, fault) {
      if (!fault) delete state.faults[provider];
      else state.faults[provider] = { times: fault.type === 'rate' ? 1 : null, ...fault };
    },
    setVariant(provider, variant) {
      if (variant) state.variants[provider] = variant;
      else delete state.variants[provider];
    },
    reset() {
      state.faults = {};
      state.variants = {};
      state.log.length = 0;
    },
    async close() {
      for (const r of state.held) r.destroy?.();
      for (const c of sockets) c.destroy();
      await Promise.all([new Promise((r) => api.close(r)), new Promise((r) => cdn.close(r))]);
    },
  };
}

// Standalone: node connectors/mock/server.mjs [--port 8787] [--fixtures dir]
const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : dflt;
  };
  const dir = arg('fixtures', path.join(os.tmpdir(), 'film-gen-mock-fixtures'));
  const fixtures = makeFixtures(dir);
  const keys = { fal: 'mock-fal-key', replicate: 'mock-replicate-token', elevenlabs: 'mock-elevenlabs-key', openai: 'mock-openai-key', google: 'mock-gemini-key' };
  const m = await startMock({ fixtures, keys, port: Number(arg('port', 8787)) });
  process.stdout.write(
    [
      `mock providers on ${m.url} (files on ${m.cdnUrl})`,
      'Point film-gen at it with these environment variables:',
      `  FILM_GEN_FAL_BASE_URL=${m.bases.fal}`,
      `  FILM_GEN_FAL_STORAGE_BASE_URL=${m.bases.falStorage}`,
      `  FILM_GEN_REPLICATE_BASE_URL=${m.bases.replicate}`,
      `  FILM_GEN_ELEVENLABS_BASE_URL=${m.bases.elevenlabs}`,
      `  FILM_GEN_OPENAI_BASE_URL=${m.bases.openai}`,
      `  FILM_GEN_GOOGLE_BASE_URL=${m.bases.google}`,
      `  and the mock keys: FAL_KEY=${keys.fal} REPLICATE_API_TOKEN=${keys.replicate} ELEVENLABS_API_KEY=${keys.elevenlabs} OPENAI_API_KEY=${keys.openai} GEMINI_API_KEY=${keys.google}`,
      'Set a fault: POST /__mock/fault {"provider":"fal","fault":{"type":"rate"}}',
      '',
    ].join('\n'),
  );
}
