import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { redact, redactDeep } from '../lib/redact.mjs';
import { KEYS, PROVIDER_ENV, setup } from './helpers.mjs';

let h;
before(async () => {
  h = await setup();
});
after(async () => {
  await h?.close();
});

const REQUESTS = {
  fal: ['--kind', 'image', '--provider', 'fal', '--model', 'fal-ai/nano-banana-2'],
  replicate: ['--kind', 'image', '--provider', 'replicate', '--model', 'google/nano-banana-2'],
  elevenlabs: ['--kind', 'sfx', '--provider', 'elevenlabs', '--model', 'eleven_text_to_sound_v2', '--duration', '2'],
  openai: ['--kind', 'image', '--provider', 'openai', '--model', 'gpt-image-2', '--quality', 'low'],
  google: ['--kind', 'image', '--provider', 'google', '--model', 'gemini-3.1-flash-image'],
};

describe('keys never appear in output, errors, sidecars or the ledger', () => {
  test('redact() removes held keys and key-shaped text', () => {
    const secrets = Object.values(KEYS);
    const text = `Authorization: Bearer ${KEYS.replicate}; xi=${KEYS.elevenlabs}; url?key=${KEYS.google}&x=1; Incorrect API key provided: sk-ab*****************wxyz.`;
    const out = redact(text, secrets);
    for (const k of secrets) assert.ok(!out.includes(k));
    assert.ok(!out.includes('sk-ab'));
    assert.ok(!out.includes('wxyz'));
    const deep = redactDeep({ headers: { authorization: 'Key abc', 'x-goog-api-key': 'k' }, nested: [`token=${KEYS.fal}`] }, secrets);
    assert.equal(deep.headers.authorization, '[redacted]');
    assert.equal(deep.headers['x-goog-api-key'], '[redacted]');
    assert.ok(!JSON.stringify(deep).includes(KEYS.fal));
  });

  for (const [provider, args] of Object.entries(REQUESTS)) {
    test(`${provider}: success, a wrong key, and a doctor run leak nothing`, async () => {
      const base = ['generate', ...args, '--prompt-file', 'prompts/shot.txt', '--film', 'leak'];
      h.mock.reset();
      const ok = await h.cli([...base, '--name', `${provider}-ok`]);
      assert.equal(ok.code, 0, ok.err);
      const wrong = await h.cli([...base, '--name', `${provider}-bad`], { root: ok.root, envExtra: { [PROVIDER_ENV[provider]]: `${KEYS[provider]}-wrong` } });
      assert.equal(wrong.code, 3, wrong.err);
      const json = await h.cli([...base, '--name', `${provider}-json`, '--json'], { root: ok.root });
      assert.equal(json.code, 0, json.err);
      const doctor = await h.cli(['doctor', '--json'], { root: ok.root });
      const doc = JSON.parse(doctor.out);
      assert.ok(doc.keys.every((k) => k.set === true && !('value' in k)));
      h.assertNoKeys(ok.root, ok, wrong, json, doctor);
      h.cdnSawNoAuth();
    });
  }
});
