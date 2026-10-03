// Runs film-gen as a real child process: the bin entry, exit codes, and what
// reaches the terminal. The mock lives in this process, so the child is run
// asynchronously; a blocking spawn would freeze the mock and time out.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { KEYS, setup } from './helpers.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'film-gen.mjs');
let h;
before(async () => {
  h = await setup();
});
after(async () => {
  await h?.close();
});

function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { env: { SYSTEMROOT: process.env.SYSTEMROOT ?? '', PATH: process.env.PATH ?? '', ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill(), 60_000);
    child.on('error', reject);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

describe('film-gen as a process', () => {
  test('help and an unknown command', async () => {
    const help = await run(['help'], {});
    assert.equal(help.status, 0);
    assert.match(help.stdout, /estimate/);
    const bad = await run(['frobnicate'], {});
    assert.equal(bad.status, 1);
  });

  test('generate end to end against the mock, then ledger and models', async () => {
    const root = h.newRoot();
    const env = h.env(root);
    const r = await run(['generate', '--kind', 'image', '--provider', 'google', '--model', 'gemini-3.1-flash-image', '--prompt-file', 'prompts/shot.txt', '--film', 'proc', '--name', 'still'], env);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /done {2}public\/films\/proc\/media\/still\.png/);
    const led = await run(['ledger', '--film', 'proc'], env);
    assert.equal(led.status, 0);
    assert.match(led.stdout, /proc: \$0\.067 over 1 job/);
    const models = await run(['models', '--provider', 'google', '--json'], env);
    const list = JSON.parse(models.stdout);
    assert.ok(list.some((m) => m.model === 'gemini-omni-1.1-flash'));
    for (const out of [r.stdout, r.stderr, led.stdout, models.stdout]) for (const k of Object.values(KEYS)) assert.ok(!out.includes(k));
  });

  test('exit code 2 for a refusal and 3 for a provider error', async () => {
    const root = h.newRoot();
    const refused = await run(['generate', '--kind', 'image', '--provider', 'fal', '--model', 'fal-ai/nano-banana-2', '--prompt-file', 'prompts/shot.txt', '--film', 'proc', '--name', 'x'], { ...h.env(root), FILM_GEN_BUDGET_USD: '' });
    assert.equal(refused.status, 2);
    h.mock.setFault('fal', { type: 'auth', on: 'submit' });
    const failed = await run(['generate', '--kind', 'image', '--provider', 'fal', '--model', 'fal-ai/nano-banana-2', '--prompt-file', 'prompts/shot.txt', '--film', 'proc', '--name', 'y'], h.env(root));
    h.mock.setFault('fal', null);
    assert.equal(failed.status, 3);
    assert.match(failed.stderr, /fal auth/);
    assert.ok(!failed.stderr.includes(KEYS.fal));
  });

  test('doctor reports keys as set or not set, never their values', async () => {
    const root = h.newRoot();
    const r = await run(['doctor'], { ...h.env(root), GEMINI_API_KEY: '' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /FAL_KEY\s+set \(environment\)/);
    assert.match(r.stdout, /GEMINI_API_KEY\s+not set/);
    assert.match(r.stdout, /NOT listed in \.gitignore/);
    for (const k of Object.values(KEYS)) assert.ok(!r.stdout.includes(k));
  });
});
