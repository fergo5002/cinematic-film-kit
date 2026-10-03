import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import { ADAPTERS } from '../lib/core.mjs';
import { estimateCost, loadPrices } from '../lib/prices.mjs';
import { kindsOf } from '../lib/spec.mjs';

const prices = loadPrices();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// Built from code points so this file holds no dash characters itself.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);

describe('prices.json', () => {
  test('every adapter model has exactly one dated, sourced price entry, and every entry has a model', () => {
    const seen = new Set();
    for (const m of prices.models) {
      const key = `${m.provider}/${m.model}`;
      assert.ok(!seen.has(key), `duplicate ${key}`);
      seen.add(key);
      const spec = ADAPTERS[m.provider]?.models?.[m.model];
      assert.ok(spec, `${key} has no adapter model`);
      assert.deepEqual([].concat(m.kind).sort(), [...kindsOf(spec)].sort(), `${key} kind`);
      assert.match(m.source, /^https:\/\//, `${key} source`);
      assert.match(m.read, DATE, `${key} read`);
      assert.match(m.recheckAfter, DATE, `${key} recheckAfter`);
      if (m.retires) assert.match(m.retires, DATE);
      assert.match(m.terms, /^https:\/\//, `${key} terms`);
      assert.ok(m.licence && typeof m.licence.note === 'string', `${key} licence`);
      assert.ok(m.price?.type, `${key} price type`);
    }
    for (const [pid, a] of Object.entries(ADAPTERS)) for (const mid of Object.keys(a.models)) assert.ok(seen.has(`${pid}/${mid}`), `${pid}/${mid} missing from prices.json`);
  });

  test('the README model table names every model in prices.json', () => {
    const readme = fs.readFileSync(path.join(DIR, 'README.md'), 'utf8');
    const tick = String.fromCharCode(96);
    for (const m of prices.models) assert.ok(readme.includes(tick + m.model + tick), `README is missing ${m.provider} ${m.model}`);
  });

  test('known shutdowns are encoded: Veo 3.1 previews retire 2026-10-22', () => {
    for (const id of ['veo-3.1-fast-generate-preview', 'veo-3.1-generate-preview', 'veo-3.1-lite-generate-preview']) {
      assert.equal(prices.models.find((m) => m.provider === 'google' && m.model === id).retires, '2026-10-22');
    }
    const ids = prices.models.map((m) => m.model);
    for (const gone of ['sora-2', 'sora-2-pro', 'gpt-image-1', 'gpt-image-1.5', 'imagen-4.0-generate-001', 'gemini-2.5-flash-image']) {
      assert.ok(!ids.includes(gone), `${gone} should not be offered`);
    }
  });

  test('estimate arithmetic for each price type', () => {
    const e = (price, n) => estimateCost({ price, source: 'https://x', read: '2026-10-01', recheckAfter: '2026-11-01' }, n, { FILM_GEN_TODAY: '2026-10-02' });
    assert.equal(e({ type: 'per_second', usd: { '720p': 0.1 } }, { resolution: '720p', billedSeconds: 8 }).usd, 0.8);
    assert.equal(e({ type: 'per_second', usd: 0.1, audioUsd: 0.15 }, { audio: true, billedSeconds: 4 }).usd, 0.6);
    assert.equal(e({ type: 'per_minute', usd: 0.6, roundUp: true }, { billedSeconds: 61 }).usd, 1.2);
    assert.equal(e({ type: 'per_minute', usd: 0.15 }, { billedSeconds: 30 }).usd, 0.075);
    assert.equal(e({ type: 'per_1k_chars', usd: 0.08 }, { chars: 500 }).usd, 0.04);
    assert.equal(e({ type: 'per_second_speech', usd: 0.000225, charsPerSecond: 12 }, { chars: 120 }).usd, 0.00225);
    assert.equal(e({ type: 'per_image', by: 'quality', usd: { low: 0.012 } }, { quality: 'low' }).usd, 0.012);
    assert.equal(e({ type: 'per_image', table: { low: { '1024x1024': 0.006 } }, perInputImageUsd: 0.02 }, { quality: 'low', size: '1024x1024', inputImages: 1 }).usd, 0.026);
    assert.equal(e({ type: 'per_call', usd: 0.08 }, {}).usd, 0.08);
    const unknown = e({ type: 'unknown', note: 'tokens' }, {});
    assert.equal(unknown.known, false);
    assert.equal(unknown.usd, null);
    const missingTier = e({ type: 'per_second', usd: { '720p': 0.1 } }, { resolution: '4k', billedSeconds: 5 });
    assert.equal(missingTier.known, false, 'a tier with no price is unknown, not guessed');
  });
});

describe('shipping rules for connectors/', () => {
  const files = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      if (f === 'node_modules' || f === 'package-lock.json') continue;
      const full = path.join(d, f);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (/\.(mjs|json|md)$/.test(f)) files.push(full);
    }
  };
  walk(DIR);

  test('no em or en dashes anywhere, code comments included', () => {
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      assert.ok(!DASHES.test(text), `${path.relative(DIR, f)} has an em or en dash`);
    }
  });

  test('no local paths or key-looking strings in shipped files', () => {
    for (const f of files) {
      if (f.includes(`${path.sep}test${path.sep}`)) continue;
      const text = fs.readFileSync(f, 'utf8');
      assert.ok(!/[A-Z]:\\(Users|Dev|Brain)/i.test(text), `${path.relative(DIR, f)} has a local path`);
      assert.ok(!/\b(sk-[A-Za-z0-9]{20,}|r8_[A-Za-z0-9]{30,}|AIza[0-9A-Za-z_-]{35})\b/.test(text), `${path.relative(DIR, f)} has a key-shaped string`);
    }
  });
});
