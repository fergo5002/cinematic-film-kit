// Tests for the five findings of the independent code review of connectors/.
// Each was written to fail against the code as it stood before the fix.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { kitContext, makePlan, runGenerate } from '../lib/core.mjs';
import { loadPrices } from '../lib/prices.mjs';
import { KEYS, readSidecar, setup } from './helpers.mjs';

let h;
before(async () => {
  h = await setup();
});
after(async () => {
  await h?.close();
});

const sent = (prefix) => h.requests((l) => l.host === 'api' && l.path.startsWith(prefix));

async function waitFor(check, ms = 3000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out waiting for the mock');
    await new Promise((r) => setTimeout(r, 10));
  }
}

const OMNI_T2V = (name) => ['generate', '--kind', 'video', '--provider', 'fal', '--model', 'google/gemini-omni-flash/v1.1/text-to-video', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', name, '--duration', '4'];

describe('review 1: --param cannot change what is billed behind the estimate', () => {
  test('fal: resolution and duration in --param are refused', async () => {
    h.mock.reset();
    const r = await h.cli(['generate', '--kind', 'video', '--provider', 'fal', '--model', 'google/gemini-omni-flash/v1.1/text-to-video', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'p-fal', '--resolution', '360p', '--duration', '3', '--param', 'resolution=4k', '--param', 'duration=10'], { envExtra: { FILM_GEN_BUDGET_USD: '1' } });
    assert.equal(r.code, 1, `${r.out}${r.err}`);
    assert.match(r.err, /resolution/);
    assert.equal(sent('/fal/').length, 0, 'nothing was sent');
  });

  test('replicate: duration in --param is refused', async () => {
    h.mock.reset();
    const r = await h.cli(['generate', '--kind', 'video', '--provider', 'replicate', '--model', 'google/veo-3.1-fast', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'p-rep', '--duration', '4', '--param', 'duration=8']);
    assert.equal(r.code, 1, `${r.out}${r.err}`);
    assert.equal(sent('/replicate/').length, 0);
  });

  test('openai: n in --param is refused (it would buy eight images priced as one)', async () => {
    h.mock.reset();
    const r = await h.cli(['generate', '--kind', 'image', '--provider', 'openai', '--model', 'gpt-image-2', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'p-oa', '--quality', 'low', '--param', 'n=8']);
    assert.equal(r.code, 1, `${r.out}${r.err}`);
    assert.equal(sent('/openai/').length, 0);
  });

  test('elevenlabs: music_length_ms in --param is refused', async () => {
    h.mock.reset();
    const r = await h.cli(['generate', '--kind', 'music', '--provider', 'elevenlabs', '--model', 'music_v2_5', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'p-el', '--duration', '30', '--accept-licence', '--param', 'music_length_ms=600000']);
    assert.equal(r.code, 1, `${r.out}${r.err}`);
    assert.equal(sent('/elevenlabs/').length, 0);
  });

  test('google: candidateCount and numberOfVideos in --param are refused', async () => {
    h.mock.reset();
    const img = await h.cli(['generate', '--kind', 'image', '--provider', 'google', '--model', 'gemini-3.1-flash-image', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'p-g1', '--param', 'candidateCount=4']);
    assert.equal(img.code, 1, `${img.out}${img.err}`);
    const veo = await h.cli(['generate', '--kind', 'video', '--provider', 'google', '--model', 'veo-3.1-fast-generate-preview', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'p-g2', '--param', 'numberOfVideos=4']);
    assert.equal(veo.code, 1, `${veo.out}${veo.err}`);
    assert.equal(sent('/google/').length, 0);
  });

  test('a param that does not touch the price still goes through, and one the estimate reads is priced', async () => {
    h.mock.reset();
    const ok = await h.cli(['generate', '--kind', 'image', '--provider', 'fal', '--model', 'fal-ai/nano-banana-2', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'p-ok', '--param', 'safety_tolerance=2']);
    assert.equal(ok.code, 0, ok.err);
    assert.equal(readSidecar(h.media(ok.root, 'demo', 'p-ok.png')).request.safety_tolerance, 2);
    const size = await h.cli(['estimate', '--json', '--kind', 'image', '--provider', 'openai', '--model', 'gpt-image-2', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'p-size', '--param', 'size=1536x864']);
    assert.equal(size.code, 0, size.err);
    assert.equal(JSON.parse(size.out).estimate.known, false, 'the estimate saw the size and has no price for it');
  });
});

describe('review 2: an abort, a timeout or a 5xx after a POST counts as uncertain spend', () => {
  test('an abort while the provider holds a synchronous POST is uncertain at the estimate, and the real error survives', async () => {
    const root = h.newRoot();
    const kctx = kitContext(h.env(root));
    const plan = makePlan({ kind: 'sfx', provider: 'elevenlabs', model: 'eleven_text_to_sound_v2', promptFile: 'prompts/shot.txt', film: 'demo', name: 'abort-1', duration: 2, params: {} }, kctx, loadPrices(), { cwd: root });
    h.mock.reset();
    h.mock.setFault('elevenlabs', { type: 'timeout', on: 'submit' });
    const ac = new AbortController();
    const run = runGenerate(plan, kctx, { signal: ac.signal });
    await waitFor(() => h.mock.log.some((l) => l.method === 'POST' && l.path.startsWith('/elevenlabs/')));
    ac.abort();
    const err = await run.then(() => null, (e) => e);
    h.mock.setFault('elevenlabs', null);
    assert.ok(err, 'the run failed');
    assert.notEqual(err.name, 'TypeError', `the real error was replaced: ${err.message}`);
    assert.equal(err.uncertain, true);
    const last = h.lastEvent(root, 'demo');
    assert.equal(last.event, 'uncertain');
    assert.equal(last.spendUsd, last.estimateUsd);
  });

  test('an abort while polling an accepted job is uncertain, not failed', async () => {
    const root = h.newRoot();
    const kctx = kitContext(h.env(root));
    const plan = makePlan({ kind: 'video', provider: 'fal', model: 'google/gemini-omni-flash/v1.1/text-to-video', promptFile: 'prompts/shot.txt', film: 'demo', name: 'abort-2', duration: 4, params: {} }, kctx, loadPrices(), { cwd: root });
    h.mock.reset();
    h.mock.setFault('fal', { type: 'timeout', on: 'poll' });
    const ac = new AbortController();
    const run = runGenerate(plan, kctx, { signal: ac.signal });
    await waitFor(() => h.mock.log.some((l) => l.method === 'GET' && l.path.includes('/status')));
    ac.abort();
    const err = await run.then(() => null, (e) => e);
    h.mock.setFault('fal', null);
    assert.ok(err);
    assert.notEqual(err.name, 'TypeError', `the real error was replaced: ${err.message}`);
    const last = h.lastEvent(root, 'demo');
    assert.equal(last.event, 'uncertain');
    assert.equal(last.spendUsd, 0.4);
  });
});

describe('review 3: prompts only from files inside the kit, never carrying a key', () => {
  test('--prompt-file .env is refused and nothing is sent', async () => {
    const root = h.newRoot();
    fs.writeFileSync(path.join(root, '.env'), `FAL_KEY=${KEYS.fal}\nGEMINI_API_KEY=${KEYS.google}\n`);
    fs.writeFileSync(path.join(root, '.gitignore'), '.env\n');
    h.mock.reset();
    const r = await h.cli([...OMNI_T2V('env-1').map((a) => (a === 'prompts/shot.txt' ? '.env' : a))], { root });
    assert.equal(r.code, 1, `${r.out}${r.err}`);
    assert.equal(sent('/fal/').length, 0);
    h.assertNoKeys(root, r);
  });

  test('a prompt file outside the kit is refused, by absolute path or by ..', async () => {
    const root = h.newRoot();
    const outside = path.join(h.tmp, `outside-${Date.now()}.txt`);
    fs.writeFileSync(outside, 'A harmless prompt that lives outside the kit.\n');
    const abs = await h.cli(OMNI_T2V('out-1').map((a) => (a === 'prompts/shot.txt' ? outside : a)), { root });
    assert.equal(abs.code, 1, abs.err);
    const rel = await h.cli(OMNI_T2V('out-2').map((a) => (a === 'prompts/shot.txt' ? path.relative(root, outside) : a)), { root });
    assert.equal(rel.code, 1, rel.err);
  });

  test('a prompt whose text contains a loaded key is refused, from a file or as MCP text', async () => {
    const root = h.newRoot();
    fs.writeFileSync(path.join(root, 'prompts', 'leaky.txt'), `Use this: ${KEYS.openai}\n`);
    h.mock.reset();
    const r = await h.cli(OMNI_T2V('leak-1').map((a) => (a === 'prompts/shot.txt' ? 'prompts/leaky.txt' : a)), { root });
    assert.equal(r.code, 1, `${r.out}${r.err}`);
    assert.equal(sent('/fal/').length, 0);
    const kctx = kitContext(h.env(root));
    assert.throws(() => makePlan({ kind: 'image', provider: 'google', model: 'gemini-3.1-flash-image', prompt: `draw ${KEYS.google}`, film: 'demo', name: 'leak-2', params: {} }, kctx, loadPrices(), { cwd: root }), /key/);
  });

  test('a key a provider echoes back is redacted in the sidecar', async () => {
    h.mock.reset();
    h.mock.setVariant('google', 'echo-key');
    const r = await h.cli(['generate', '--kind', 'image', '--provider', 'google', '--model', 'gemini-3.1-flash-image', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'echo']);
    h.mock.setVariant('google', null);
    assert.equal(r.code, 0, r.err);
    assert.match(readSidecar(h.media(r.root, 'demo', 'echo.png')).extra.text, /\[redacted\]/);
    h.assertNoKeys(r.root, r);
  });
});

describe('review 4: budgets cannot be dodged with a new film id', () => {
  test('a film without src/films/<id>/film.ts is refused', async () => {
    h.mock.reset();
    const r = await h.cli(OMNI_T2V('nf').map((a) => (a === 'demo' ? 'hark-b' : a)));
    assert.equal(r.code, 2, `${r.out}${r.err}`);
    assert.match(r.err, /unknown-film/);
    assert.equal(sent('/fal/').length, 0);
  });

  test('FILM_GEN_BUDGET_TOTAL_USD is required for a paid call', async () => {
    const r = await h.cli(OMNI_T2V('tot-0'), { unset: ['FILM_GEN_BUDGET_TOTAL_USD'] });
    assert.equal(r.code, 2, `${r.out}${r.err}`);
    assert.match(r.err, /budget-total-unset/);
  });

  test('the kit-wide total counts every film', async () => {
    const root = h.newRoot();
    const env = { FILM_GEN_BUDGET_TOTAL_USD: '0.70' };
    const first = await h.cli(OMNI_T2V('tot-1'), { root, envExtra: env });
    assert.equal(first.code, 0, first.err);
    const second = await h.cli(OMNI_T2V('tot-2').map((a) => (a === 'demo' ? 'other' : a)), { root, envExtra: env });
    assert.equal(second.code, 2, `${second.out}${second.err}`);
    assert.match(second.err, /budget-total/);
  });

  test('two films planned before either reserves cannot both pass the total', async () => {
    const root = h.newRoot();
    const kctx = kitContext(h.env(root, { FILM_GEN_BUDGET_TOTAL_USD: '0.50' }));
    const prices = loadPrices();
    const opts = (film, name) => ({ kind: 'video', provider: 'fal', model: 'google/gemini-omni-flash/v1.1/text-to-video', promptFile: 'prompts/shot.txt', film, name, duration: 4, params: {} });
    const a = makePlan(opts('demo', 't-a'), kctx, prices, { cwd: root });
    const b = makePlan(opts('other', 't-b'), kctx, prices, { cwd: root });
    assert.deepEqual([a.refusals, b.refusals], [[], []]);
    const results = await Promise.allSettled([runGenerate(a, kctx), runGenerate(b, kctx)]);
    assert.deepEqual(results.map((x) => x.status).sort(), ['fulfilled', 'rejected']);
    assert.equal(results.find((x) => x.status === 'rejected').reason.reason, 'budget-total');
  });
});

describe('review 5: no redirect is followed while a key is attached', () => {
  test('elevenlabs: a 307 on the POST is not followed, so the file host never sees the key', async () => {
    h.mock.reset();
    h.mock.setFault('elevenlabs', { type: 'redirect', on: 'submit' });
    const r = await h.cli(['generate', '--kind', 'sfx', '--provider', 'elevenlabs', '--model', 'eleven_text_to_sound_v2', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'redir-1', '--duration', '2']);
    h.mock.setFault('elevenlabs', null);
    assert.notEqual(r.code, 0, 'a redirect is an error');
    assert.equal(h.requests((l) => l.host === 'cdn' && l.path === '/redirected').length, 0, 'the redirect was not followed');
    h.cdnSawNoAuth();
  });

  test('google: a 307 while polling is not followed', async () => {
    h.mock.reset();
    h.mock.setFault('google', { type: 'redirect', on: 'poll', times: 1 });
    const r = await h.cli(['generate', '--kind', 'video', '--provider', 'google', '--model', 'veo-3.1-fast-generate-preview', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'redir-2', '--timeout', '20']);
    h.mock.setFault('google', null);
    assert.equal(h.requests((l) => l.host === 'cdn' && l.path === '/redirected').length, 0, 'the redirect was not followed');
    assert.notEqual(r.code, 0, 'a redirect is an error');
    h.cdnSawNoAuth();
  });
});
