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

const IMAGE = ['generate', '--kind', 'image', '--provider', 'google', '--model', 'gemini-3.1-flash-image', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'g-img', '--resolution', '2K'];
const VEO = ['generate', '--kind', 'video', '--provider', 'google', '--model', 'veo-3.1-fast-generate-preview', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'g-veo', '--image', 'frames/start.png', '--duration', '4'];
const OMNI = ['generate', '--kind', 'video', '--provider', 'google', '--model', 'gemini-omni-1.1-flash', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'g-omni', '--image', 'frames/start.png'];

describe('google adapter', () => {
  test('image: generateContent with responseFormat.image, inline data decoded', async () => {
    h.mock.reset();
    const r = await h.cli(IMAGE);
    assert.equal(r.code, 0, r.err);
    const file = h.media(r.root, 'demo', 'g-img.png');
    assert.deepEqual(fs.readFileSync(file), h.fx.png);
    const side = readSidecar(file);
    assert.equal(side.estimate.usd, 0.101);
    assert.deepEqual(side.request.generationConfig.responseFormat.image, { aspectRatio: '16:9', imageSize: '2K' });
    assert.deepEqual(side.request.generationConfig.responseModalities, ['TEXT', 'IMAGE']);
    assert.equal(side.extra.text, 'Here is the image.');
    const call = h.requests((l) => l.path === '/google/v1beta/models/gemini-3.1-flash-image:generateContent')[0];
    assert.ok(call.headers['x-goog-api-key'], 'key in the x-goog-api-key header');
    assert.ok(!call.path.includes('key='), 'never in the URL');
    h.assertNoKeys(r.root, r);
  });

  test('Veo: predictLongRunning, operation polled, file state polled, download redirected without the key', async () => {
    h.mock.reset();
    const r = await h.cli(VEO);
    assert.equal(r.code, 0, r.err);
    const file = h.media(r.root, 'demo', 'g-veo.mp4');
    assert.deepEqual(fs.readFileSync(file), h.fx.mp4);
    const side = readSidecar(file);
    assert.equal(side.request.parameters.durationSeconds, '4');
    assert.ok(side.request.instances[0].image.inlineData);
    assert.equal(side.estimate.usd, 0.4, '4 s at $0.10/s, 720p, audio always on');
    assert.ok(h.requests((l) => l.path.includes('/operations/')).length >= 2, 'operation polled');
    const dl = h.requests((l) => l.host === 'api' && l.path.includes(':download'))[0];
    assert.ok(dl.headers['x-goog-api-key'], 'the key goes to the Gemini API download URL');
    assert.ok(h.requests((l) => l.host === 'cdn').length >= 1, 'followed the redirect to the file host');
    h.cdnSawNoAuth();
    h.assertNoKeys(r.root, r);
  });

  test('Veo previews are refused from their shutdown date', async () => {
    h.mock.reset();
    const r = await h.cli(VEO, { envExtra: { FILM_GEN_TODAY: '2026-10-22' } });
    assert.equal(r.code, 2);
    assert.match(r.err, /retired/);
    assert.equal(h.requests((l) => l.path.startsWith('/google/')).length, 0);
  });

  test('Veo at 1080p must be 8 seconds', async () => {
    const r = await h.cli([...VEO, '--resolution', '1080p']);
    assert.equal(r.code, 1);
    assert.match(r.err, /needs --duration 8/);
  });

  test('Omni: Interactions API in the background, polled by id, inline video decoded', async () => {
    h.mock.reset();
    const r = await h.cli(OMNI);
    assert.equal(r.code, 0, r.err);
    const file = h.media(r.root, 'demo', 'g-omni.mp4');
    assert.deepEqual(fs.readFileSync(file), h.fx.mp4);
    const side = readSidecar(file);
    assert.equal(side.request.background, true);
    assert.equal(side.request.response_format.type, 'video');
    assert.equal(side.request.input[0].type, 'image');
    assert.equal(side.estimate.usd, 1.0136, 'the model sets the length; estimated at its 10 s maximum');
    const create = h.requests((l) => l.method === 'POST' && l.path === '/google/v1beta/interactions')[0];
    assert.equal(create.headers['api-revision'], '2026-05-20');
    assert.ok(h.requests((l) => l.method === 'GET' && l.path.startsWith('/google/v1beta/interactions/')).length >= 2);
  });

  test('Omni: a video delivered by URI is waited for (file state) and downloaded', async () => {
    h.mock.reset();
    h.mock.setVariant('google', 'interaction-uri');
    const r = await h.cli(OMNI);
    h.mock.setVariant('google', null);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(fs.readFileSync(h.media(r.root, 'demo', 'g-omni.mp4')), h.fx.mp4);
    assert.ok(h.requests((l) => /\/google\/v1beta\/files\/[0-9a-f]+$/.test(l.path)).length >= 2, 'file state polled until ACTIVE');
    h.cdnSawNoAuth();
  });

  test('Omni at 1080p has no published price: refused unless accepted', async () => {
    const r = await h.cli([...OMNI, '--resolution', '1080p']);
    assert.equal(r.code, 2);
    assert.match(r.err, /unknown-price/);
  });

  test('Omni failure and the Interactions auth error (a JSON array) are both read', async () => {
    h.mock.reset();
    h.mock.setFault('google', { type: 'failed-job' });
    const failed = await h.cli(OMNI);
    h.mock.setFault('google', null);
    assert.equal(failed.code, 3);
    assert.match(failed.err, /google failed/);
    assert.equal(h.lastEvent(failed.root, 'demo').event, 'failed');
    h.mock.setFault('google', { type: 'auth', on: 'submit' });
    const auth = await h.cli(OMNI);
    h.mock.setFault('google', null);
    assert.equal(auth.code, 3);
    assert.match(auth.err, /google auth/);
    assert.match(auth.err, /API key not valid/);
  });

  test('music: Lyria 3.5 asks for WAV and keeps the lyrics text', async () => {
    h.mock.reset();
    const r = await h.cli(['generate', '--kind', 'music', '--provider', 'google', '--model', 'lyria-3.5', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'g-cue']);
    assert.equal(r.code, 0, r.err);
    const file = h.media(r.root, 'demo', 'g-cue.wav');
    assert.deepEqual(fs.readFileSync(file), h.fx.wav);
    const side = readSidecar(file);
    assert.equal(side.request.generationConfig.responseFormat.audio.mimeType, 'audio/wav');
    assert.match(side.extra.text, /Instrumental/);
    assert.equal(side.estimate.usd, 0.08);
  });

  test('speech: WAV passes through; bare PCM from an older model is wrapped into WAV', async () => {
    const args = ['generate', '--kind', 'speech', '--provider', 'google', '--model', 'gemini-3.8-flash-tts', '--prompt-file', 'prompts/line.txt', '--film', 'demo', '--name', 'g-vo', '--voice', 'Kore'];
    h.mock.reset();
    const r = await h.cli(args);
    assert.equal(r.code, 0, r.err);
    const wav = fs.readFileSync(h.media(r.root, 'demo', 'g-vo.wav'));
    assert.deepEqual(wav, h.fx.wav);
    const side = readSidecar(h.media(r.root, 'demo', 'g-vo.wav'));
    assert.equal(side.request.generationConfig.speechConfig.voiceConfig.voice, 'Kore');
    assert.equal(side.estimate.usd, 0.000675, '30 characters is about 3 s at $0.000225/s');

    h.mock.setVariant('google', 'pcm');
    const p = await h.cli(args.map((a) => (a === 'g-vo' ? 'g-vo-pcm' : a)), { root: r.root });
    h.mock.setVariant('google', null);
    assert.equal(p.code, 0, p.err);
    const wrapped = fs.readFileSync(h.media(r.root, 'demo', 'g-vo-pcm.wav'));
    assert.equal(wrapped.subarray(0, 4).toString('latin1'), 'RIFF');
    assert.equal(wrapped.readUInt32LE(24), 24000, 'wrapped at 24 kHz');
    assert.deepEqual(wrapped.subarray(44), h.fx.wav.subarray(44), 'samples unchanged');
  });

  describe('fault matrix, generateContent (one request)', () => {
    for (const c of faultCases({ provider: 'google', async: false, urlOutput: false })) {
      test(c.name, async () => {
        await runFaultCase(h, c, IMAGE);
      });
    }
  });

  describe('fault matrix, Veo (queued job with a file link)', () => {
    for (const c of faultCases({ provider: 'google', async: true, urlOutput: true })) {
      test(c.name, async () => {
        await runFaultCase(h, c, VEO);
      });
    }
  });
});
