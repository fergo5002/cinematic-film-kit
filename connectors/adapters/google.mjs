// Google Gemini API adapter (an API key from Google AI Studio, not Vertex AI).
//   Images (Nano Banana), music (Lyria) and speech: generateContent, one request.
//   Video, Gemini Omni Flash: the Interactions API with background execution,
//   polled by id.
//   Video, Veo 3.1 previews: predictLongRunning, polled by operation name.
//   These preview IDs shut down on 2026-10-22, after which they are refused.
//
// Evidence, read 2026-10-01 (UTC) from ai.google.dev/gemini-api/docs/...:
//   omni.md.txt                 Omni REST body, steps[] output, response_format
//                               (aspect_ratio, resolution, delivery), 3 to 10 s output, SynthID
//   background-execution.md.txt background: true, GET /v1beta/interactions/{id},
//                               statuses in_progress, requires_action, completed, failed, cancelled;
//                               Api-Revision: 2026-05-20 header
//   api-errors.md.txt           Interactions errors {"error": {"code": "snake_case", "message"}}
//   generate-content/api-errors.md.txt  generateContent errors {"error": {code, message, status}},
//                               402 RESOURCE_EXHAUSTED when the prepay balance is gone
//   pricing.md.txt              all prices used in prices.json
//   generate-content/image-generation  REST shows
//                               generationConfig.responseFormat.image {aspectRatio, imageSize};
//                               the SDKs call the same settings imageConfig. Untested here.
//   generate-content/music-generation  lyria-3.5, WAV via responseFormat.audio
//   generate-content/speech-generation  gemini-3.8 TTS returns WAV on unary calls
//   veo.md    predictLongRunning, operation polling, video.uri download
//   deprecations (updated 2026-10-01)  veo-3.1-*-preview shut down 2026-10-22
//   Observed with a fake key on 2026-10-01: generateContent answers 400 INVALID_ARGUMENT
//   with reason API_KEY_INVALID; the Interactions endpoint answers the same body
//   wrapped in a JSON array.

import { ProviderError, UsageError } from '../lib/errors.mjs';
import { httpRequest, pollUntil, download } from '../lib/http.mjs';
import { pcmToWav, sniff } from '../lib/media.mjs';
import { estimateCost } from '../lib/prices.mjs';
import { writeOutput } from '../lib/output.mjs';

export const id = 'google';
export const envKey = 'GEMINI_API_KEY';
export const defaultBaseUrl = 'https://generativelanguage.googleapis.com';
export const termsUrl = 'https://ai.google.dev/gemini-api/terms';
const API_REVISION = '2026-05-20';

const NB_ASPECTS = ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'];

const veo = (resolutions) => ({
  kind: 'video',
  api: 'veo',
  image: 'optional',
  resolutions,
  defaultResolution: '720p',
  duration: { allowed: [4, 6, 8], default: 4 },
  aspects: ['16:9', '9:16'],
  defaultAspect: '16:9',
  audio: 'always',
  check: (n, modelId) => {
    if (n.resolution !== '720p' && n.duration !== 8) {
      throw new UsageError(`${modelId}: ${n.resolution} needs --duration 8`);
    }
  },
});

const nanoBanana = (resolutions, aspects = NB_ASPECTS) => ({
  kind: 'image',
  api: 'generate',
  image: 'optional',
  resolutions,
  defaultResolution: '1K',
  aspects,
  defaultAspect: '16:9',
  seed: false,
  responseModalities: ['TEXT', 'IMAGE'],
  generationConfig: (n) => ({ responseFormat: { image: { aspectRatio: n.aspect, imageSize: n.resolution } } }),
});

const tts = {
  kind: 'speech',
  api: 'generate',
  voice: 'required',
  voiceHint: 'a Gemini voice name such as Kore, Puck, Zephyr, Charon, Fenrir or Leda',
  seed: false,
  responseModalities: ['AUDIO'],
  generationConfig: (n) => ({ speechConfig: { voiceConfig: { voice: n.voice } } }),
};

export const models = {
  'gemini-omni-1.1-flash': {
    kind: 'video',
    api: 'interactions',
    image: 'optional',
    resolutions: ['360p', '720p', '1080p', '4k'],
    defaultResolution: '720p',
    maxSeconds: 10,
    aspects: ['16:9', '9:16'],
    defaultAspect: '16:9',
    audio: 'always',
    seed: false,
  },
  'veo-3.1-fast-generate-preview': veo(['720p', '1080p', '4k']),
  'veo-3.1-generate-preview': veo(['720p', '1080p', '4k']),
  'veo-3.1-lite-generate-preview': veo(['720p', '1080p']),
  'gemini-3.1-flash-image': nanoBanana(['512', '1K', '2K', '4K']),
  'gemini-3-pro-image': nanoBanana(['1K', '2K', '4K']),
  'gemini-3.1-flash-lite-image': nanoBanana(['1K'], ['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']),
  'lyria-3.5': {
    kind: 'music',
    api: 'generate',
    image: 'optional',
    seed: false,
    responseModalities: ['AUDIO', 'TEXT'],
    generationConfig: () => ({ responseFormat: { audio: { mimeType: 'audio/wav' } } }),
  },
  'lyria-3-clip-preview': {
    kind: 'music',
    api: 'generate',
    image: 'optional',
    fixedSeconds: 30,
    seed: false,
    responseModalities: ['AUDIO', 'TEXT'],
  },
  'gemini-3.8-flash-tts': tts,
  'gemini-3.8-flash-lite-tts': tts,
};

export function authHeaders(key) {
  return { 'x-goog-api-key': key };
}

// --param keys that would change what is billed, or that film-gen sets itself,
// at the level --param merges into for each API: generationConfig for
// generateContent, parameters for Veo, the request body for Interactions.
const PRICE_KEYS_BY_API = Object.freeze({
  generate: ['responseModalities', 'responseFormat', 'imageConfig', 'candidateCount', 'speechConfig', 'responseMimeType', 'thinkingConfig'],
  veo: ['aspectRatio', 'durationSeconds', 'resolution', 'sampleCount', 'numberOfVideos'],
  interactions: ['model', 'input', 'response_format', 'background', 'generation_config', 'previous_interaction_id', 'tools', 'stream'],
});
export const PRICE_KEYS = Object.freeze([...new Set(Object.values(PRICE_KEYS_BY_API).flat())]);

export function priceKeysFor(plan) {
  return PRICE_KEYS_BY_API[models[plan.model].api];
}

export function builtKeys(plan) {
  const spec = models[plan.model];
  if (spec.api === 'interactions') return ['model', 'input', 'response_format', 'background'];
  if (spec.api === 'veo') return ['aspectRatio', 'durationSeconds', 'resolution', ...(plan.n.seed != null ? ['seed'] : [])];
  return ['responseModalities', ...Object.keys(spec.generationConfig ? spec.generationConfig(plan.n) : {})];
}

export function classify(status, body) {
  const e = (Array.isArray(body) ? body[0] : body)?.error ?? null;
  const code = e?.status ?? e?.code ?? null;
  const text = typeof e?.message === 'string' ? e.message : null;
  const reason = Array.isArray(e?.details) ? e.details.find((d) => d?.reason)?.reason ?? null : null;
  const msg = (s) => `google: ${s}${text ? `: ${text}` : ''}`;
  if (reason === 'API_KEY_INVALID' || status === 401 || code === 'authentication') return { kind: 'auth', message: msg('the key was rejected'), code: reason ?? code };
  if (status === 402 || code === 'payment_required') return { kind: 'credit', message: msg('the prepay credit balance is used up'), code };
  if (status === 403) return { kind: 'auth', message: msg('permission denied (HTTP 403)'), code };
  if (status === 404) return { kind: 'not-found', message: msg('not found (HTTP 404)'), code };
  if (status === 429) return { kind: 'rate', message: msg('rate or quota limit (HTTP 429)'), code };
  if (status >= 500) return { kind: 'server', message: msg(`server error (HTTP ${status})`), code };
  if (code === 'FAILED_PRECONDITION' || code === 'failed_precondition') return { kind: 'client', message: msg('a precondition failed (often billing not enabled)'), code };
  return { kind: 'client', message: msg(`request rejected (HTTP ${status})`), code };
}

export function estimate(plan, prices, env) {
  return estimateCost(prices.models.find((m) => m.provider === id && m.model === plan.model) ?? null, plan.n, env);
}

// Google takes images inline as base64. A URL given as --image is fetched
// first (no key goes with it) and then sent inline.
async function prepareImage(ctx) {
  const img = ctx.plan.image;
  if (!img) return null;
  if (ctx.dryRun) return { mime: img.mime ?? 'image/*', data: `<${img.kind === 'url' ? img.url : `local file ${img.source}`} sent inline as base64>` };
  if (img.kind === 'url') {
    const f = await download({ provider: id, url: img.url, timing: ctx.timing, secrets: ctx.secrets, signal: ctx.signal });
    const s = sniff(f.bytes);
    return { mime: s?.mime ?? f.contentType ?? 'image/png', data: f.bytes.toString('base64') };
  }
  return { mime: img.mime, data: img.bytes.toString('base64') };
}

export function buildRequest(ctx, inline) {
  const { plan, baseUrl } = ctx;
  const spec = models[plan.model];
  const n = plan.n;
  const params = plan.params ?? {};
  if (spec.api === 'interactions') {
    const input = [];
    if (inline) input.push({ type: 'image', mime_type: inline.mime, data: inline.data });
    input.push({ type: 'text', text: plan.prompt });
    return {
      method: 'POST',
      url: `${baseUrl}/v1beta/interactions`,
      body: {
        model: plan.model,
        input,
        response_format: { type: 'video', aspect_ratio: n.aspect, resolution: n.resolution },
        background: true,
        ...params,
      },
    };
  }
  if (spec.api === 'veo') {
    const instance = { prompt: plan.prompt };
    if (inline) instance.image = { inlineData: { mimeType: inline.mime, data: inline.data } };
    return {
      method: 'POST',
      url: `${baseUrl}/v1beta/models/${plan.model}:predictLongRunning`,
      body: {
        instances: [instance],
        parameters: {
          aspectRatio: n.aspect,
          // Quoted on purpose: the parameter table lists "4", "6", "8".
          durationSeconds: String(n.duration),
          resolution: n.resolution,
          ...(n.seed != null ? { seed: n.seed } : {}),
          ...params,
        },
      },
    };
  }
  const parts = [{ text: plan.prompt }];
  if (inline) parts.push({ inline_data: { mime_type: inline.mime, data: inline.data } });
  return {
    method: 'POST',
    url: `${baseUrl}/v1beta/models/${plan.model}:generateContent`,
    body: {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: spec.responseModalities,
        ...(spec.generationConfig ? spec.generationConfig(n) : {}),
        ...params,
      },
    },
  };
}

// The request as it would be sent, with images described rather than inlined.
export async function preview(ctx) {
  return buildRequest(ctx, await prepareImage(ctx));
}

function headersFor(ctx, spec) {
  return {
    ...authHeaders(ctx.key),
    'content-type': 'application/json',
    ...(spec.api === 'interactions' ? { 'api-revision': API_REVISION } : {}),
  };
}

const BLOCKED = new Set(['SAFETY', 'IMAGE_SAFETY', 'PROHIBITED_CONTENT', 'IMAGE_PROHIBITED_CONTENT', 'BLOCKLIST', 'RECITATION', 'IMAGE_RECITATION', 'SPII']);

function parseGenerate(data, requestId) {
  const block = data?.promptFeedback?.blockReason;
  if (block) throw new ProviderError({ provider: id, kind: 'policy', code: block, message: `google: the prompt was blocked (${block})`, requestId });
  const cand = data?.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  const media = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
  const text = parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('\n').trim();
  if (!media) {
    const reason = cand?.finishReason ?? 'no media in the response';
    const kind = BLOCKED.has(reason) ? 'policy' : 'failed';
    throw new ProviderError({ provider: id, kind, code: cand?.finishReason ?? null, message: `google: no media was returned (${reason})`, requestId });
  }
  const blob = media.inlineData ?? media.inline_data;
  return { bytes: Buffer.from(blob.data, 'base64'), mime: blob.mimeType ?? blob.mime_type ?? null, text };
}

export async function submit(ctx) {
  const spec = models[ctx.plan.model];
  const inline = await prepareImage(ctx);
  const req = buildRequest(ctx, inline);
  ctx.sent = req.body;
  const r = await httpRequest({
    provider: id,
    url: req.url,
    method: 'POST',
    headers: headersFor(ctx, spec),
    body: JSON.stringify(req.body),
    timeoutMs: spec.api === 'generate' ? ctx.timing.generateTimeoutMs : ctx.timing.httpTimeoutMs,
    classify,
    secrets: ctx.secrets,
    timing: ctx.timing,
    signal: ctx.signal,
  });
  if (spec.api === 'interactions') {
    const iid = r.data?.id;
    if (!iid) throw new ProviderError({ provider: id, kind: 'malformed', message: 'the Interactions API sent no id', uncertain: true });
    return { requestId: iid, interaction: r.data };
  }
  if (spec.api === 'veo') {
    const name = r.data?.name;
    if (!name) throw new ProviderError({ provider: id, kind: 'malformed', message: 'predictLongRunning sent no operation name', uncertain: true });
    return { requestId: name, operation: r.data };
  }
  const requestId = r.data?.responseId ?? null;
  const out = parseGenerate(r.data, requestId);
  return { requestId, generated: out, usage: r.data?.usageMetadata ?? null };
}

function videoFromInteraction(it) {
  const steps = Array.isArray(it?.steps) ? it.steps : [];
  for (const s of steps) {
    for (const c of s?.content ?? []) {
      if (c?.type === 'video' && (c.data || c.uri)) return c;
    }
  }
  // Older shape, kept for safety: outputs[] at the top level.
  for (const c of it?.outputs ?? []) if (c?.type === 'video' && (c.data || c.uri)) return c;
  return null;
}

export async function poll(ctx, state) {
  const spec = models[ctx.plan.model];
  if (spec.api === 'generate') return state;
  if (spec.api === 'interactions') {
    let it = state.interaction;
    const done = (x) => ['completed', 'failed', 'cancelled', 'requires_action'].includes(x?.status);
    if (!done(it)) {
      await pollUntil({
        provider: id,
        timing: ctx.timing,
        deadline: ctx.deadline,
        signal: ctx.signal,
        onWait: () => ctx.progress?.('google interaction in progress'),
        check: async () => {
          const g = await httpRequest({
            provider: id,
            url: `${ctx.baseUrl}/v1beta/interactions/${encodeURIComponent(state.requestId)}`,
            headers: headersFor(ctx, spec),
            classify,
            secrets: ctx.secrets,
            timing: ctx.timing,
            signal: ctx.signal,
          });
          it = g.data;
          return done(it) ? { done: true } : { done: false, requestId: state.requestId };
        },
      });
    }
    if (it.status !== 'completed') {
      // The failed body is not documented; this reads error.message when present (guess).
      throw new ProviderError({ provider: id, kind: 'failed', message: `google interaction ${it.status}${it.error?.message ? `: ${it.error.message}` : ''}`, requestId: state.requestId });
    }
    return { ...state, interaction: it };
  }
  // Veo long-running operation.
  let op = state.operation;
  if (!op?.done) {
    await pollUntil({
      provider: id,
      timing: ctx.timing,
      deadline: ctx.deadline,
      signal: ctx.signal,
      onWait: () => ctx.progress?.('google video operation running'),
      check: async () => {
        const g = await httpRequest({
          provider: id,
          url: `${ctx.baseUrl}/v1beta/${state.requestId}`,
          headers: authHeaders(ctx.key),
          classify,
          secrets: ctx.secrets,
          timing: ctx.timing,
          signal: ctx.signal,
        });
        op = g.data;
        return op?.done ? { done: true } : { done: false, requestId: state.requestId };
      },
    });
  }
  if (op.error) {
    throw new ProviderError({ provider: id, kind: 'failed', code: op.error.code ?? null, message: `google video operation failed: ${op.error.message ?? 'no message'}`, requestId: state.requestId });
  }
  const gvr = op.response?.generateVideoResponse;
  if (gvr?.raiMediaFilteredCount > 0 || gvr?.raiMediaFilteredReasons?.length) {
    throw new ProviderError({ provider: id, kind: 'policy', message: `google filtered the video: ${(gvr.raiMediaFilteredReasons ?? []).join('; ') || 'no reason given'}`, requestId: state.requestId });
  }
  return { ...state, operation: op };
}

async function waitForFile(ctx, uri) {
  // Files API URIs look like .../v1beta/files/<id>:download?alt=media.
  const m = /\/v1beta\/files\/([^/:?]+)/.exec(uri);
  if (!m || new URL(uri).origin !== new URL(ctx.baseUrl).origin) return;
  await pollUntil({
    provider: id,
    timing: ctx.timing,
    deadline: ctx.deadline,
    signal: ctx.signal,
    check: async () => {
      const g = await httpRequest({
        provider: id,
        url: `${ctx.baseUrl}/v1beta/files/${m[1]}`,
        headers: authHeaders(ctx.key),
        classify,
        secrets: ctx.secrets,
        timing: ctx.timing,
        signal: ctx.signal,
      });
      const st = g.data?.state;
      if (st === 'FAILED') throw new ProviderError({ provider: id, kind: 'failed', message: 'google: the generated file failed processing' });
      return { done: st === 'ACTIVE' || st == null };
    },
  });
}

export async function fetch(ctx, state) {
  const spec = models[ctx.plan.model];
  const authOrigin = new URL(ctx.baseUrl).origin;
  if (spec.api === 'generate') {
    let { bytes, mime, text } = state.generated;
    let note = null;
    if (spec.kind === 'speech' && !sniff(bytes)) {
      // Older TTS models sent bare 24 kHz mono 16-bit PCM; wrap it so it plays.
      bytes = pcmToWav(bytes, { sampleRate: 24000, channels: 1, bitsPerSample: 16 });
      mime = 'audio/wav';
      note = 'raw PCM wrapped as 24 kHz mono 16-bit WAV';
    }
    return {
      bytes,
      contentType: mime,
      requestId: state.requestId,
      seedReturned: null,
      providerUsage: state.usage,
      actualUsd: null,
      extra: { ...(text ? { text } : {}), ...(note ? { note } : {}) },
      fallbackExt: spec.kind === 'image' ? 'png' : spec.kind === 'speech' ? 'wav' : 'mp3',
    };
  }
  let item = null;
  if (spec.api === 'interactions') {
    item = videoFromInteraction(state.interaction);
    if (!item) throw new ProviderError({ provider: id, kind: 'malformed', message: 'the completed interaction has no video', requestId: state.requestId });
    if (item.data) {
      return {
        bytes: Buffer.from(item.data, 'base64'),
        contentType: item.mime_type ?? 'video/mp4',
        requestId: state.requestId,
        seedReturned: null,
        providerUsage: state.interaction.usage ?? null,
        actualUsd: null,
        extra: null,
        fallbackExt: 'mp4',
      };
    }
  } else {
    const uri = state.operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!uri) throw new ProviderError({ provider: id, kind: 'malformed', message: 'the finished operation has no video uri', requestId: state.requestId });
    item = { uri };
  }
  await waitForFile(ctx, item.uri);
  // The key goes only to the Gemini API origin; redirects are followed without it.
  const file = await download({
    provider: id,
    url: item.uri,
    authHeaders: authHeaders(ctx.key),
    authOrigin,
    timing: ctx.timing,
    secrets: ctx.secrets,
    classify,
    signal: ctx.signal,
  });
  return {
    bytes: file.bytes,
    contentType: file.contentType,
    requestId: state.requestId,
    seedReturned: null,
    providerUsage: null,
    actualUsd: null,
    extra: null,
    fallbackExt: 'mp4',
  };
}

export function write(ctx, fetched, sidecar) {
  return writeOutput({
    root: ctx.root,
    film: ctx.plan.film,
    stem: ctx.plan.name,
    bytes: fetched.bytes,
    contentType: fetched.contentType,
    fallbackExt: fetched.fallbackExt,
    overwrite: ctx.overwrite,
    sidecar,
  });
}
