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

const SFX = ['generate', '--kind', 'sfx', '--provider', 'elevenlabs', '--model', 'eleven_text_to_sound_v2', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'sfx-01', '--duration', '3'];

describe('elevenlabs adapter', () => {
  test('sound effect: one request, audio bytes back, character-cost kept in the sidecar', async () => {
    h.mock.reset();
    const r = await h.cli(SFX);
    assert.equal(r.code, 0, r.err);
    const file = h.media(r.root, 'demo', 'sfx-01.mp3');
    assert.deepEqual(fs.readFileSync(file), h.fx.mp3);
    const side = readSidecar(file);
    assert.equal(side.estimate.usd, 0.006, '3 s at $0.002/s');
    assert.equal(side.request.duration_seconds, 3);
    assert.equal(side.actual.providerUsage.characterCost, '120');
    const call = h.requests((l) => l.method === 'POST' && l.path.startsWith('/elevenlabs/v1/sound-generation'))[0];
    assert.equal(call.headers['xi-api-key'] != null, true, 'key goes in xi-api-key');
    assert.equal(call.headers.authorization, undefined);
    assert.match(call.path, /output_format=mp3_44100_128/);
    h.assertNoKeys(r.root, r);
  });

  test('speech needs --voice, puts it in the path and prices by characters', async () => {
    const base = ['generate', '--kind', 'speech', '--provider', 'elevenlabs', '--model', 'eleven_v4', '--prompt-file', 'prompts/line.txt', '--film', 'demo', '--name', 'vo-01'];
    const missing = await h.cli(base);
    assert.equal(missing.code, 1);
    assert.match(missing.err, /--voice/);
    h.mock.reset();
    const r = await h.cli([...base, '--voice', 'VoiceId123', '--seed', '9']);
    assert.equal(r.code, 0, r.err);
    assert.ok(h.requests((l) => l.path === '/elevenlabs/v1/text-to-speech/VoiceId123').length === 1);
    const side = readSidecar(h.media(r.root, 'demo', 'vo-01.mp3'));
    assert.equal(side.request.seed, 9);
    assert.equal(side.estimate.usd, 0.0024, '30 characters at $0.08 per 1,000');
  });

  test('music needs --duration, is licence-gated for film use, and drops a seed it cannot take', async () => {
    const base = ['generate', '--kind', 'music', '--provider', 'elevenlabs', '--model', 'music_v2_5', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'cue-01'];
    const noDur = await h.cli(base);
    assert.equal(noDur.code, 1);
    assert.match(noDur.err, /--duration/);
    const gated = await h.cli([...base, '--duration', '45']);
    assert.equal(gated.code, 2);
    assert.match(gated.err, /film, TV, radio/);
    h.mock.reset();
    const r = await h.cli([...base, '--duration', '45', '--seed', '3', '--accept-licence'], { root: gated.root });
    assert.equal(r.code, 0, r.err);
    const side = readSidecar(h.media(r.root, 'demo', 'cue-01.mp3'));
    assert.equal(side.request.music_length_ms, 45000);
    assert.equal(side.request.seed, undefined);
    assert.ok(side.parameters.notes.some((n) => /takes no seed/.test(n)));
    assert.equal(side.estimate.usd, 0.15, '45 s rounds up to one minute at $0.15');
    assert.match(side.actual.providerUsage.songId, /^song_/);
  });

  for (const c of faultCases({ provider: 'elevenlabs', async: false, urlOutput: false })) {
    test(c.name, async () => {
      await runFaultCase(h, c, SFX);
    });
  }
});
