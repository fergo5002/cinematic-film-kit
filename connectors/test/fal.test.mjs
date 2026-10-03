import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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

const I2V = ['generate', '--kind', 'video', '--provider', 'fal', '--model', 'google/gemini-omni-flash/v1.1/image-to-video', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'shot-01', '--image', 'frames/start.png', '--duration', '4', '--resolution', '720p'];

describe('fal adapter', () => {
  test('image to video: submits, polls the app path, fetches, writes file, sidecar and ledger', async () => {
    h.mock.reset();
    const r = await h.cli(I2V);
    assert.equal(r.code, 0, r.err);
    const file = h.media(r.root, 'demo', 'shot-01.mp4');
    assert.ok(fs.existsSync(file), 'the video was written');
    assert.deepEqual(fs.readFileSync(file), h.fx.mp4, 'bytes match what the provider served');

    const side = readSidecar(file);
    assert.equal(side.provider, 'fal');
    assert.equal(side.model, 'google/gemini-omni-flash/v1.1/image-to-video');
    assert.equal(side.kind, 'video');
    assert.match(side.prompt, /lit window at dusk/);
    assert.equal(side.promptFile, 'prompts/shot.txt');
    assert.equal(side.parameters.duration, 4);
    assert.equal(side.parameters.resolution, '720p');
    assert.equal(side.estimate.usd, 0.4);
    assert.equal(side.estimate.known, true);
    assert.equal(side.estimate.priceRead, '2026-10-01');
    assert.match(side.estimate.priceSource, /^https:\/\/fal\.ai\/models\//);
    assert.equal(side.actual.usd, null);
    assert.equal(side.output.sha256, crypto.createHash('sha256').update(h.fx.mp4).digest('hex'));
    assert.equal(side.output.contentType, 'video/mp4');
    assert.equal(side.file, 'public/films/demo/media/shot-01.mp4');
    assert.match(side.requestId, /^[0-9a-f-]{36}$/);
    assert.equal(side.terms.url, 'https://fal.ai/legal/terms-of-service');
    assert.ok(side.timestamp);
    assert.equal(side.inputs[0].source, 'frames/start.png');
    assert.match(side.request.image_url, /^data:image\/png;base64,/, 'a small local image goes as a data URI');

    const lines = h.ledger(r.root, 'demo');
    assert.deepEqual(lines.map((l) => l.event), ['reserved', 'done']);
    assert.equal(lines[1].spendUsd, 0.4);
    assert.equal(lines[1].file, 'public/films/demo/media/shot-01.mp4');
    assert.equal(lines[1].sha256, side.output.sha256);

    const statusPolls = h.requests((l) => l.method === 'GET' && /\/fal\/google\/gemini-omni-flash\/requests\/[^/]+\/status/.test(l.path));
    assert.ok(statusPolls.length >= 2, `polled ${statusPolls.length} times`);
    const subPath = h.requests((l) => l.method === 'GET' && l.path.includes('/v1.1/image-to-video/requests/'));
    assert.equal(subPath.length, 0, 'status and result use the app path, never the sub-path');
    const submit = h.requests((l) => l.method === 'POST' && l.path.startsWith('/fal/'))[0];
    assert.equal(submit.headers.authorization.startsWith('Key '), true, 'fal auth scheme is Key');
    h.cdnSawNoAuth();
    h.assertNoKeys(r.root, r);
  });

  test('text to image and edit: images[0] is fetched; seed is sent where the model takes one', async () => {
    h.mock.reset();
    const r = await h.cli(['generate', '--kind', 'image', '--provider', 'fal', '--model', 'fal-ai/nano-banana-2', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'still-01', '--resolution', '2K', '--seed', '77']);
    assert.equal(r.code, 0, r.err);
    const side = readSidecar(h.media(r.root, 'demo', 'still-01.png'));
    assert.equal(side.request.seed, 77);
    assert.equal(side.request.resolution, '2K');
    assert.equal(side.estimate.usd, 0.12);
    assert.equal(side.seed.returned, 1234);

    const e = await h.cli(['generate', '--kind', 'image', '--provider', 'fal', '--model', 'fal-ai/nano-banana-2/edit', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'still-02', '--image', 'frames/start.png'], { root: r.root });
    assert.equal(e.code, 0, e.err);
    assert.ok(Array.isArray(readSidecar(h.media(r.root, 'demo', 'still-02.png')).request.image_urls));
  });

  test('a local image over 1 MB goes through the storage upload, and the signed PUT carries no key', async () => {
    h.mock.reset();
    const r = await h.cli(['generate', '--kind', 'video', '--provider', 'fal', '--model', 'blackforestlabs/flux-3/image-to-video', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'big-01', '--image', 'frames/big.png']);
    assert.equal(r.code, 0, r.err);
    const init = h.requests((l) => l.path.startsWith('/fal-rest/storage/upload/initiate'));
    assert.equal(init.length, 1);
    const uploads = [...h.mock.uploads.values()];
    assert.equal(uploads.length, 1);
    assert.deepEqual(uploads[0].bytes, fs.readFileSync(h.fx.bigPngPath), 'uploaded bytes match the file');
    assert.equal(uploads[0].auth, null, 'no key on the signed upload');
    const side = readSidecar(h.media(r.root, 'demo', 'big-01.mp4'));
    assert.match(side.request.image_url, /\/uploads\//, 'the request used the uploaded file URL');
    h.assertNoKeys(r.root, r);
  });

  test('audio: Lyria returns the audio as a bare URL string, lyrics land in the sidecar', async () => {
    h.mock.reset();
    const r = await h.cli(['generate', '--kind', 'music', '--provider', 'fal', '--model', 'google/lyria-3.5', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'cue-01']);
    assert.equal(r.code, 0, r.err);
    const side = readSidecar(h.media(r.root, 'demo', 'cue-01.mp3'));
    assert.equal(side.extra.lyrics, '[Instrumental]');
    assert.equal(side.estimate.usd, 0.1);
  });

  test('sound effects with no duration are estimated at the model maximum', async () => {
    const r = await h.cli(['estimate', '--json', '--kind', 'sfx', '--provider', 'fal', '--model', 'fal-ai/elevenlabs/sound-effects/v2', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'sfx-01']);
    assert.equal(r.code, 0, r.err);
    const s = JSON.parse(r.out);
    assert.equal(s.estimate.usd, 0.044);
    assert.match(s.estimate.basis, /22 s/);
  });

  for (const c of faultCases({ provider: 'fal', async: true, urlOutput: true })) {
    test(c.name, async () => {
      await runFaultCase(h, c, I2V);
    });
  }
});
