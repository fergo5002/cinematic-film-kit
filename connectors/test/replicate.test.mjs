import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { faultCases, readSidecar, runFaultCase, setup } from './helpers.mjs';

let h;
before(async () => {
  h = await setup();
});
after(async () => {
  await h?.close();
});

const VIDEO = ['generate', '--kind', 'video', '--provider', 'replicate', '--model', 'google/veo-3.1-fast', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'rep-01', '--image', 'frames/start.png', '--duration', '6'];

describe('replicate adapter', () => {
  test('video: creates an official-model prediction, polls to succeeded, downloads the output', async () => {
    h.mock.reset();
    const r = await h.cli(VIDEO);
    assert.equal(r.code, 0, r.err);
    const file = h.media(r.root, 'demo', 'rep-01.mp4');
    assert.deepEqual(fs.readFileSync(file), h.fx.mp4);
    const side = readSidecar(file);
    assert.equal(side.estimate.usd, 0.6, '6 s at $0.10/s, audio off');
    assert.equal(side.request.input.generate_audio, false);
    assert.equal(side.request.input.duration, 6);
    assert.match(side.request.input.image, /^data:image\/png;base64,/);
    assert.ok(side.actual.providerUsage.metrics.predict_time > 0);
    const create = h.requests((l) => l.method === 'POST' && l.path === '/replicate/v1/models/google/veo-3.1-fast/predictions')[0];
    assert.ok(create, 'used the official-model route');
    assert.equal(create.headers.authorization.startsWith('Bearer '), true);
    assert.match(create.headers['cancel-after'], /^\d+s$/, 'a Cancel-After deadline is sent');
    assert.ok(h.requests((l) => l.method === 'GET' && l.path.startsWith('/replicate/v1/predictions/')).length >= 2, 'polled');
    const lines = h.ledger(r.root, 'demo');
    assert.deepEqual(lines.map((l) => l.event), ['reserved', 'done']);
    h.cdnSawNoAuth();
    h.assertNoKeys(r.root, r);
  });

  test('audio switches the price tier and the request field', async () => {
    const r = await h.cli([...VIDEO.slice(0, -2), '--duration', '4', '--audio', '--name', 'rep-02'].map((a) => (a === 'rep-01' ? 'rep-02' : a)));
    assert.equal(r.code, 0, r.err);
    const side = readSidecar(h.media(r.root, 'demo', 'rep-02.mp4'));
    assert.equal(side.estimate.usd, 0.6, '4 s at $0.15/s with audio');
    assert.equal(side.request.input.generate_audio, true);
  });

  test('GPT Image on Replicate: output array, price by quality, and no OpenAI key is ever forwarded', async () => {
    h.mock.reset();
    const base = ['generate', '--kind', 'image', '--provider', 'replicate', '--model', 'openai/gpt-image-2.5-flare', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--quality', 'low'];
    const refused = await h.cli([...base, '--name', 'rep-key', '--param', 'openai_api_key=should-never-be-sent']);
    assert.equal(refused.code, 1, 'an OpenAI key in --param is refused, not forwarded');
    assert.equal(h.requests((l) => l.path.startsWith('/replicate/')).length, 0);
    const r = await h.cli([...base, '--name', 'rep-img'], { root: refused.root });
    assert.equal(r.code, 0, r.err);
    const side = readSidecar(h.media(r.root, 'demo', 'rep-img.png'));
    assert.equal(side.estimate.usd, 0.012);
    assert.equal(side.request.input.openai_api_key, undefined);
    const create = h.requests((l) => l.method === 'POST' && l.path.includes('gpt-image-2.5-flare'))[0];
    assert.ok(create);
  });

  test('a local image over 256 KB goes through the Files API', async () => {
    h.mock.reset();
    const r = await h.cli(['generate', '--kind', 'image', '--provider', 'replicate', '--model', 'google/nano-banana-2', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'rep-edit', '--image', 'frames/big.png']);
    assert.equal(r.code, 0, r.err);
    assert.equal(h.requests((l) => l.method === 'POST' && l.path === '/replicate/v1/files').length, 1);
    const side = readSidecar(h.media(r.root, 'demo', 'rep-edit.png'));
    assert.match(side.request.input.image_input[0], /\/replicate\/v1\/files\//);
  });

  test('Kling is refused without --accept-licence, and runs with it', async () => {
    const args = ['generate', '--kind', 'video', '--provider', 'replicate', '--model', 'kwaivgi/kling-v3-video', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'kling-01', '--resolution', '1080p', '--duration', '5'];
    h.mock.reset();
    const refused = await h.cli(args);
    assert.equal(refused.code, 2, refused.err);
    assert.match(refused.err, /licence/);
    assert.equal(h.requests((l) => l.path.startsWith('/replicate/')).length, 0, 'nothing was sent');
    const ok = await h.cli([...args, '--accept-licence'], { root: refused.root });
    assert.equal(ok.code, 0, ok.err);
    const side = readSidecar(h.media(ok.root, 'demo', 'kling-01.mp4'));
    assert.equal(side.request.input.mode, 'pro');
    assert.equal(side.estimate.usd, 1.12, '5 s at $0.224/s');
  });

  for (const c of faultCases({ provider: 'replicate', async: true, urlOutput: true })) {
    test(c.name, async () => {
      await runFaultCase(h, c, VIDEO);
    });
  }
});
