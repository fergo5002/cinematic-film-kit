// Test helpers: a mock per test file, a throwaway kit root, fake keys, and a
// way to run the CLI in-process with captured output. No network, no real keys.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../film-gen.mjs';
import { makeFixtures } from '../mock/fixtures.mjs';
import { startMock } from '../mock/server.mjs';

// Fake keys shaped like the real ones, so redaction is tested on realistic text. They are joined
// at run time so that no file in the kit contains anything a secret scanner would match.
const j = (...parts) => parts.join('');
export const FAKE_FAL_KEY = j('0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9', ':', '0123456789abcdef', '0123456789abcdef');
export const KEYS = Object.freeze({
  fal: FAKE_FAL_KEY,
  replicate: j('r8', '_', 'TestReplicateToken0000000000000000000'),
  elevenlabs: j('sk', '_test_eleven_4d2c8b6a0e1f3a5c7e9b'),
  openai: j('sk', '-test-openai-key-9e8d7c6b5a4f3e2d1c0b'),
  google: j('AI', 'za', 'TestGoogleKey00000000000000000000000'),
});

export const PROVIDER_ENV = Object.freeze({
  fal: 'FAL_KEY',
  replicate: 'REPLICATE_API_TOKEN',
  elevenlabs: 'ELEVENLABS_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GEMINI_API_KEY',
});

// Film ids the tests generate for. A film exists when src/films/<id>/film.ts does.
export const FILMS = Object.freeze(['demo', 'leak', 'proc', 'mcp', 'other']);

export function addFilm(root, film) {
  const dir = path.join(root, 'src', 'films', film);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'film.ts'), `export const film = {id: '${film}'};\n`);
}

export async function setup({ pollsBeforeDone = 2 } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'film-gen-test-'));
  const fx = makeFixtures(path.join(tmp, 'fixtures'));
  const mock = await startMock({ fixtures: fx, keys: KEYS, pollsBeforeDone });
  let n = 0;

  function newRoot() {
    n += 1;
    const root = path.join(tmp, `kit-${n}`);
    fs.mkdirSync(path.join(root, 'prompts'), { recursive: true });
    fs.mkdirSync(path.join(root, 'frames'), { recursive: true });
    fs.writeFileSync(path.join(root, 'prompts', 'shot.txt'), 'Slow push in on a lit window at dusk, rain on the glass, no people, no text.\n');
    fs.writeFileSync(path.join(root, 'prompts', 'line.txt'), 'The light came back on at six.\n');
    fs.copyFileSync(fx.pngPath, path.join(root, 'frames', 'start.png'));
    fs.copyFileSync(fx.bigPngPath, path.join(root, 'frames', 'big.png'));
    for (const film of FILMS) addFilm(root, film);
    return root;
  }

  function env(root, extra = {}) {
    return {
      FILM_GEN_ROOT: root,
      FAL_KEY: KEYS.fal,
      REPLICATE_API_TOKEN: KEYS.replicate,
      ELEVENLABS_API_KEY: KEYS.elevenlabs,
      OPENAI_API_KEY: KEYS.openai,
      GEMINI_API_KEY: KEYS.google,
      FILM_GEN_BUDGET_USD: '5',
      FILM_GEN_BUDGET_TOTAL_USD: '50',
      FILM_GEN_FAL_BASE_URL: mock.bases.fal,
      FILM_GEN_FAL_STORAGE_BASE_URL: mock.bases.falStorage,
      FILM_GEN_REPLICATE_BASE_URL: mock.bases.replicate,
      FILM_GEN_ELEVENLABS_BASE_URL: mock.bases.elevenlabs,
      FILM_GEN_OPENAI_BASE_URL: mock.bases.openai,
      FILM_GEN_GOOGLE_BASE_URL: mock.bases.google,
      FILM_GEN_POLL_MS: '5',
      FILM_GEN_POLL_MAX_MS: '20',
      FILM_GEN_BACKOFF_MS: '5',
      FILM_GEN_HTTP_TIMEOUT_MS: '4000',
      FILM_GEN_GENERATE_TIMEOUT_MS: '4000',
      FILM_GEN_DOWNLOAD_TIMEOUT_MS: '4000',
      FILM_GEN_TODAY: '2026-10-02',
      ...extra,
    };
  }

  async function cli(args, { root, envExtra = {}, unset = [] } = {}) {
    const r = root ?? newRoot();
    const e = env(r, envExtra);
    for (const k of unset) delete e[k];
    let out = '';
    let err = '';
    const started = Date.now();
    const code = await main(args, { env: e, cwd: r, out: (s) => (out += `${s}\n`), err: (s) => (err += `${s}\n`) });
    return { code, out, err, root: r, ms: Date.now() - started };
  }

  function media(root, film, file = '') {
    return path.join(root, 'public', 'films', film, 'media', file);
  }

  function ledger(root, film) {
    const f = media(root, film, 'ledger.jsonl');
    if (!fs.existsSync(f)) return [];
    return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }

  function lastEvent(root, film) {
    const lines = ledger(root, film);
    return lines[lines.length - 1] ?? null;
  }

  // Every string the run produced, plus every file it wrote under media/.
  function everything(root, ...runs) {
    let text = runs.map((r) => `${r.out}\n${r.err}`).join('\n');
    const dir = path.join(root, 'public');
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir, { recursive: true })) {
        const full = path.join(dir, f);
        if (fs.statSync(full).isFile() && /\.(json|jsonl)$/.test(full)) text += `\n${fs.readFileSync(full, 'utf8')}`;
      }
    }
    return text;
  }

  function assertNoKeys(root, ...runs) {
    const text = everything(root, ...runs);
    for (const [p, k] of Object.entries(KEYS)) {
      assert.ok(!text.includes(k), `the ${p} key leaked into output or files`);
      // Also no long fragment of a key (12 characters or more).
      for (let i = 0; i + 12 <= k.length; i += 6) {
        assert.ok(!text.includes(k.slice(i, i + 12)), `a fragment of the ${p} key leaked`);
      }
    }
  }

  function requests(filter) {
    return mock.log.filter(filter);
  }

  function cdnSawNoAuth() {
    for (const l of mock.log.filter((x) => x.host === 'cdn')) {
      for (const h of ['authorization', 'x-goog-api-key', 'xi-api-key']) {
        assert.equal(l.headers[h], undefined, `the file host received a ${h} header on ${l.path}`);
      }
    }
  }

  async function close() {
    await mock.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  return { tmp, fx, mock, newRoot, env, cli, media, ledger, lastEvent, assertNoKeys, requests, cdnSawNoAuth, close };
}

export function readSidecar(file) {
  return JSON.parse(fs.readFileSync(`${file}.prov.json`, 'utf8'));
}

// The fault matrix shared by every adapter test. base is the CLI request for a
// representative model; async says whether the provider queues jobs.
export function faultCases({ provider, async: isAsync, urlOutput }) {
  const cases = [
    { name: 'auth: 401 is reported, nothing retried, nothing spent', fault: { type: 'auth', on: 'submit' }, code: 3, kind: 'auth', event: 'released', spend: 0, submits: 1 },
    { name: 'credit: out of credit is reported, not retried', fault: { type: 'credit', on: 'submit' }, code: 3, kind: 'credit', event: 'released', spend: 0, submits: 1 },
    { name: 'rate: a 429 with Retry-After is waited out and then succeeds', fault: { type: 'rate', on: 'submit', times: 1 }, code: 0, event: 'done', submits: 2, minMs: 900 },
    { name: 'rate: a 429 that never clears gives up and spends nothing', fault: { type: 'rate', on: 'submit', times: 99 }, code: 3, kind: 'rate', event: 'released', spend: 0, submits: 2, envExtra: { FILM_GEN_RETRIES: '1' } },
    // A 5xx after the provider received the submit may still have been billed, so
    // it is not retried (no double charge) and counts at the estimate.
    { name: 'server: a 500 on submit is not retried and counts as uncertain spend', fault: { type: 'server', on: 'submit' }, code: 4, kind: 'server', event: 'uncertain', spend: 'estimate', submits: 1 },
    { name: 'timeout: no reply to submit counts as uncertain spend', fault: { type: 'timeout', on: 'submit' }, code: 4, kind: 'timeout', event: 'uncertain', spend: 'estimate', envExtra: { FILM_GEN_HTTP_TIMEOUT_MS: '300', FILM_GEN_GENERATE_TIMEOUT_MS: '300', FILM_GEN_RETRIES: '0' } },
    { name: 'malformed: unreadable JSON after submit counts as uncertain spend', fault: { type: 'malformed', on: 'submit' }, code: 4, kind: 'malformed', event: 'uncertain', spend: 'estimate' },
  ];
  if (isAsync) {
    cases.push(
      { name: 'failed job: a failure after acceptance counts at the estimate', fault: { type: 'failed-job' }, code: 3, kind: 'failed', event: 'failed', spend: 'estimate' },
      { name: 'server: a 500 while polling is retried and then succeeds', fault: { type: 'server', on: 'poll', times: 1 }, code: 0, event: 'done' },
      { name: 'malformed: unreadable JSON while polling is retried', fault: { type: 'malformed', on: 'poll', times: 1 }, code: 0, event: 'done' },
    );
  } else {
    cases.push({ name: 'failed job: a rejected or blocked generation spends nothing', fault: { type: 'failed-job' }, code: 3, event: 'released', spend: 0 });
  }
  if (urlOutput) {
    cases.push({ name: 'expired output: a dead file link is reported and the job counts as spent', fault: { type: 'expired-output', on: 'download' }, code: 3, kind: 'expired', event: 'failed', spend: 'estimate' });
  }
  return cases.map((c) => ({ ...c, provider }));
}

export async function runFaultCase(h, c, args) {
  h.mock.reset();
  h.mock.setFault(c.provider, c.fault);
  const r = await h.cli(args, { envExtra: c.envExtra ?? {} });
  h.mock.setFault(c.provider, null);
  assert.equal(r.code, c.code, `exit code\n${r.err}${r.out}`);
  if (c.kind) assert.match(r.err, new RegExp(`${c.provider} ${c.kind}`), r.err);
  const film = args[args.indexOf('--film') + 1];
  const last = h.lastEvent(r.root, film);
  assert.ok(last, 'a ledger line was written');
  assert.equal(last.event, c.event, JSON.stringify(last));
  if (c.spend === 'estimate') assert.equal(last.spendUsd, last.estimateUsd);
  else if (c.spend != null) assert.equal(last.spendUsd, c.spend);
  if (c.submits != null) {
    const submits = h.requests((l) => l.host === 'api' && l.method === 'POST' && l.path.startsWith(`/${c.provider}/`) && !l.path.includes('/files') && !l.path.includes('/upload')).length;
    assert.equal(submits, c.submits, 'number of submit attempts');
  }
  if (c.minMs) assert.ok(r.ms >= c.minMs, `waited ${r.ms} ms, expected at least ${c.minMs}`);
  if (c.code !== 0) {
    const name = args[args.indexOf('--name') + 1];
    const dir = h.media(r.root, film);
    const left = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith(name)) : [];
    assert.deepEqual(left, [], 'no media file is left behind on failure');
  }
  h.assertNoKeys(r.root, r);
  h.cdnSawNoAuth();
  return r;
}
