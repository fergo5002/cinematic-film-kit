import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { KEYS, faultCases, readSidecar, runFaultCase, setup } from './helpers.mjs';

let h;
before(async () => {
  h = await setup();
});
after(async () => {
  await h?.close();
});

const IMG = ['generate', '--kind', 'image', '--provider', 'openai', '--model', 'gpt-image-2', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'oa-01', '--quality', 'low'];

describe('openai adapter', () => {
  test('gpt-image-2: priced from the per-image table, b64 decoded, actual cost computed from usage', async () => {
    h.mock.reset();
    const r = await h.cli(IMG);
    assert.equal(r.code, 0, r.err);
    const file = h.media(r.root, 'demo', 'oa-01.png');
    assert.deepEqual(fs.readFileSync(file), h.fx.png);
    const side = readSidecar(file);
    assert.equal(side.estimate.usd, 0.005, 'low quality, 16:9 maps to 1536x1024');
    assert.equal(side.request.size, '1536x1024');
    assert.equal(side.request.model, 'gpt-image-2');
    // (50 text tokens x $5 + 1056 image tokens x $30) per 1M
    assert.equal(side.actual.usd, 0.03193);
    assert.match(side.actual.basis, /computed from the usage tokens/);
    assert.match(side.requestId, /^req_/);
    const last = h.lastEvent(r.root, 'demo');
    assert.equal(last.spendUsd, 0.03193, 'the ledger prefers the computed actual over the estimate');
    h.assertNoKeys(r.root, r);
  });

  test('an edit sends images[].image_url as a data URL to /images/edits and adds the input allowance', async () => {
    h.mock.reset();
    const r = await h.cli([...IMG, '--image', 'frames/start.png'].map((a) => (a === 'oa-01' ? 'oa-02' : a)));
    assert.equal(r.code, 0, r.err);
    assert.equal(h.requests((l) => l.path === '/openai/v1/images/edits').length, 1);
    const side = readSidecar(h.media(r.root, 'demo', 'oa-02.png'));
    assert.match(side.request.images[0].image_url, /^data:image\/png;base64,/);
    assert.equal(side.estimate.usd, 0.025);
  });

  test('GPT Image 2.5 has no published per-image price: refused unless accepted', async () => {
    const args = ['generate', '--kind', 'image', '--provider', 'openai', '--model', 'gpt-image-2.5-flare', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'oa-25'];
    h.mock.reset();
    const refused = await h.cli(args);
    assert.equal(refused.code, 2);
    assert.match(refused.err, /unknown-price/);
    assert.equal(h.requests((l) => l.path.startsWith('/openai/')).length, 0);
    const ok = await h.cli([...args, '--accept-unknown-price'], { root: refused.root });
    assert.equal(ok.code, 0, ok.err);
    const last = h.lastEvent(ok.root, 'demo');
    assert.equal(last.estimateUsd, null);
    assert.equal(last.spendUsd, 0.03193, 'cost computed from the returned usage');
  });

  test('speech: WAV from /audio/speech, priced per character', async () => {
    h.mock.reset();
    const r = await h.cli(['generate', '--kind', 'speech', '--provider', 'openai', '--model', 'tts-1-hd', '--prompt-file', 'prompts/line.txt', '--film', 'demo', '--name', 'oa-vo', '--voice', 'marin']);
    assert.equal(r.code, 0, r.err);
    const file = h.media(r.root, 'demo', 'oa-vo.wav');
    assert.deepEqual(fs.readFileSync(file), h.fx.wav);
    const side = readSidecar(file);
    assert.equal(side.request.voice, 'marin');
    assert.equal(side.request.response_format, 'wav');
    assert.equal(side.estimate.usd, 0.0009);
  });

  test('a wrong key: OpenAI echoes a masked copy, and even that is redacted', async () => {
    h.mock.reset();
    const r = await h.cli(IMG, { envExtra: { OPENAI_API_KEY: 'sk-wrongkey-0000000000000000zzzz' } });
    assert.equal(r.code, 3);
    assert.match(r.err, /openai auth/);
    assert.ok(!r.err.includes('sk-wr'), 'the masked prefix is redacted too');
    assert.ok(!r.err.includes('zzzz'), 'the masked suffix is redacted too');
    assert.ok(!r.err.includes(KEYS.openai));
  });

  for (const c of faultCases({ provider: 'openai', async: false, urlOutput: false })) {
    test(c.name, async () => {
      await runFaultCase(h, c, IMG);
    });
  }
});
