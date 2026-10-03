import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { kitContext, makePlan, runGenerate } from '../lib/core.mjs';
import { loadPrices } from '../lib/prices.mjs';
import { FAKE_FAL_KEY, setup } from './helpers.mjs';

let h;
before(async () => {
  h = await setup();
});
after(async () => {
  await h?.close();
});

// 4 s of Gemini Omni Flash at 720p on fal: $0.40.
const req = (name) => ['generate', '--kind', 'video', '--provider', 'fal', '--model', 'google/gemini-omni-flash/v1.1/text-to-video', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', name, '--duration', '4'];
const sentToFal = () => h.requests((l) => l.path.startsWith('/fal'));

describe('budget, price and safety refusals (nothing is sent when refused)', () => {
  test('no FILM_GEN_BUDGET_USD: refused before any request', async () => {
    h.mock.reset();
    const r = await h.cli(req('b-01'), { unset: ['FILM_GEN_BUDGET_USD'] });
    assert.equal(r.code, 2);
    assert.match(r.err, /budget-unset/);
    assert.equal(sentToFal().length, 0);
    assert.equal(h.ledger(r.root, 'demo').length, 0);
  });

  test('a zero or negative budget is the same as none', async () => {
    for (const v of ['0', '-3', 'abc']) {
      const r = await h.cli(req('b-02'), { envExtra: { FILM_GEN_BUDGET_USD: v } });
      assert.equal(r.code, 2, v);
      assert.match(r.err, /budget-unset/);
    }
  });

  test('an estimate above the budget is refused', async () => {
    h.mock.reset();
    const r = await h.cli(req('b-03'), { envExtra: { FILM_GEN_BUDGET_USD: '0.30' } });
    assert.equal(r.code, 2);
    assert.match(r.err, /would pass the budget/);
    assert.equal(sentToFal().length, 0);
  });

  test('spend in the ledger counts: the second job that would pass the budget is refused', async () => {
    h.mock.reset();
    const first = await h.cli(req('b-04'), { envExtra: { FILM_GEN_BUDGET_USD: '0.70' } });
    assert.equal(first.code, 0, first.err);
    const second = await h.cli(req('b-05'), { root: first.root, envExtra: { FILM_GEN_BUDGET_USD: '0.70' } });
    assert.equal(second.code, 2);
    assert.match(second.err, /\$0\.40 already spent/);
  });

  test('a budget is the .env value when the environment has none', async () => {
    const root = h.newRoot();
    fs.writeFileSync(path.join(root, '.env'), '# budget for this film\nFILM_GEN_BUDGET_USD=0.10\n');
    const r = await h.cli(req('b-06'), { root, unset: ['FILM_GEN_BUDGET_USD'] });
    assert.equal(r.code, 2);
    assert.match(r.err, /budget of \$0\.10\b/);
  });

  test('two runs planned before either reserves cannot both spend the same headroom', async () => {
    // Both plans are made first, so both pass the plan-time check; only the
    // re-check under the ledger lock can stop the second one.
    const root = h.newRoot();
    const kctx = kitContext(h.env(root, { FILM_GEN_BUDGET_USD: '0.50' }));
    const prices = loadPrices();
    const opts = (name) => ({ kind: 'video', provider: 'fal', model: 'google/gemini-omni-flash/v1.1/text-to-video', promptFile: 'prompts/shot.txt', film: 'demo', name, duration: 4, params: {} });
    const a = makePlan(opts('b-07'), kctx, prices, { cwd: root });
    const b = makePlan(opts('b-08'), kctx, prices, { cwd: root });
    assert.deepEqual([a.refusals, b.refusals], [[], []]);
    const results = await Promise.allSettled([runGenerate(a, kctx), runGenerate(b, kctx)]);
    assert.deepEqual(results.map((x) => x.status).sort(), ['fulfilled', 'rejected']);
    const rejected = results.find((x) => x.status === 'rejected').reason;
    assert.equal(rejected.reason, 'budget');
    assert.equal(h.ledger(root, 'demo').filter((l) => l.event === 'done').length, 1);
    assert.equal(h.ledger(root, 'demo').filter((l) => l.event === 'reserved').length, 1, 'the refused run reserved nothing');
  });

  test('estimate reports a budget that the request would pass', async () => {
    const r = await h.cli(['estimate', '--json', ...req('est-b').slice(1)], { envExtra: { FILM_GEN_BUDGET_USD: '0.25' } });
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(JSON.parse(r.out).refusals.map((x) => x.reason), ['budget']);
  });

  test('a key from a .env that git does not ignore is refused until .gitignore lists it', async () => {
    const root = h.newRoot();
    fs.writeFileSync(path.join(root, '.env'), `FAL_KEY=${FAKE_FAL_KEY}\n`);
    h.mock.reset();
    const refused = await h.cli(req('b-env'), { root, unset: ['FAL_KEY'] });
    assert.equal(refused.code, 2);
    assert.match(refused.err, /env-not-ignored/);
    assert.equal(sentToFal().length, 0);
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n.env\n');
    const ok = await h.cli(req('b-env'), { root, unset: ['FAL_KEY'] });
    assert.equal(ok.code, 0, ok.err);
    h.assertNoKeys(root, refused, ok);
  });

  test('a missing key is refused, naming the variable, never a value', async () => {
    h.mock.reset();
    const r = await h.cli(req('b-09'), { unset: ['FAL_KEY'] });
    assert.equal(r.code, 2);
    assert.match(r.err, /FAL_KEY is not set/);
    assert.equal(sentToFal().length, 0);
  });

  test('an existing file with the same stem is protected unless --overwrite', async () => {
    const first = await h.cli(req('b-10'));
    assert.equal(first.code, 0, first.err);
    const again = await h.cli(req('b-10'), { root: first.root });
    assert.equal(again.code, 2);
    assert.match(again.err, /exists/);
    const forced = await h.cli([...req('b-10'), '--overwrite'], { root: first.root });
    assert.equal(forced.code, 0, forced.err);
  });

  test('dry run sends nothing, writes nothing and shows the request with images elided', async () => {
    h.mock.reset();
    const r = await h.cli(['generate', '--dry-run', '--json', '--kind', 'video', '--provider', 'fal', '--model', 'google/gemini-omni-flash/v1.1/image-to-video', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'dry', '--image', 'frames/start.png']);
    assert.equal(r.code, 0, r.err);
    const j = JSON.parse(r.out);
    assert.equal(j.dryRun, true);
    assert.match(j.request.url, /\/fal\/google\/gemini-omni-flash\/v1\.1\/image-to-video$/);
    assert.match(j.request.body.image_url, /^<local file frames\/start\.png/);
    assert.equal(j.request.headers.authorization, '[redacted]');
    assert.equal(h.mock.log.length, 0, 'no request reached any provider');
    assert.ok(!fs.existsSync(h.media(r.root, 'demo')), 'nothing written');
  });

  test('--base-url wins over the environment for that run', async () => {
    const r = await h.cli(['generate', '--dry-run', '--json', ...req('dry3').slice(1), '--base-url', 'https://queue.example.test/']);
    assert.equal(r.code, 0, r.err);
    assert.equal(JSON.parse(r.out).request.url, 'https://queue.example.test/google/gemini-omni-flash/v1.1/text-to-video');
  });

  test('dry run with refusals exits 2 and says why', async () => {
    const r = await h.cli(['generate', '--dry-run', ...req('dry2').slice(1)], { unset: ['FILM_GEN_BUDGET_USD', 'FAL_KEY'] });
    assert.equal(r.code, 2);
    assert.match(r.out, /refuse/);
  });

  test('estimate shows every refusal at once and spends nothing', async () => {
    h.mock.reset();
    const r = await h.cli(['estimate', '--json', ...req('est').slice(1)], { unset: ['FILM_GEN_BUDGET_USD', 'FAL_KEY'] });
    assert.equal(r.code, 0, r.err);
    const j = JSON.parse(r.out);
    assert.equal(j.estimate.usd, 0.4);
    assert.deepEqual(j.refusals.map((x) => x.reason).sort(), ['budget-unset', 'key-missing']);
    assert.equal(h.mock.log.length, 0);
  });

  test('bad arguments are usage errors (exit 1) before anything else', async () => {
    const cases = [
      [['generate', '--kind', 'film', '--provider', 'fal', '--model', 'x', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'a'], /--kind/],
      [['generate', '--kind', 'video', '--provider', 'fal', '--model', 'not-a-model', '--prompt-file', 'prompts/shot.txt', '--film', 'demo', '--name', 'a'], /no model/],
      [['generate', ...req('a').slice(1).map((x) => (x === 'demo' ? 'Demo Film' : x))], /--film/],
      [['generate', ...req('../escape').slice(1)], /--name/],
      [['generate', ...req('a').slice(1), '--duration', '45'], /--duration must be from 3 to 10/],
      [['generate', ...req('a').slice(1), '--resolution', '8k'], /resolution must be one of/],
      [['generate', ...req('a').slice(1).map((x) => (x === 'prompts/shot.txt' ? 'prompts/missing.txt' : x))], /no such file/],
      [['generate', '--bogus'], /Unknown option/],
    ];
    for (const [args, re] of cases) {
      const r = await h.cli(args);
      assert.equal(r.code, 1, `${args.join(' ')}\n${r.err}`);
      assert.match(r.err, re);
    }
  });

  test('a price past its re-check date still estimates, with a warning', async () => {
    const r = await h.cli(['estimate', '--json', ...req('rc').slice(1)], { envExtra: { FILM_GEN_TODAY: '2027-01-15' } });
    const j = JSON.parse(r.out);
    assert.equal(j.estimate.recheckDue, true);
    assert.ok(j.warnings.some((w) => /re-check after/.test(w)));
  });
});
