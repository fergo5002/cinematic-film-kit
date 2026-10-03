// Loads prices.json and turns a normalised request into a dated estimate.
// A price the table does not know is reported as unknown, never guessed.

import fs from 'node:fs';
import path from 'node:path';
import { CONNECTORS_DIR } from './env.mjs';

export const PRICES_FILE = path.join(CONNECTORS_DIR, 'prices.json');

export function loadPrices(file = PRICES_FILE) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(data.models)) throw new Error('prices.json has no models array');
  return data;
}

export function findPrice(prices, provider, model) {
  return prices.models.find((m) => m.provider === provider && m.model === model) ?? null;
}

export function today(env) {
  const forced = env?.FILM_GEN_TODAY;
  if (forced && /^\d{4}-\d{2}-\d{2}$/.test(forced)) return forced;
  return new Date().toISOString().slice(0, 10);
}

function pick(value, key) {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && key != null) {
    const want = String(key).toLowerCase();
    for (const [k, v] of Object.entries(value)) if (k.toLowerCase() === want) return v;
  }
  return null;
}

function money(v) {
  return formatUsd(v);
}

function round(v) {
  return Math.round(v * 1e6) / 1e6;
}

// n: { resolution, quality, size, audio, billedSeconds, chars, inputImages }
export function estimateCost(entry, n, env) {
  const t = today(env);
  const out = {
    usd: null,
    known: false,
    approximate: false,
    basis: '',
    source: entry?.source ?? null,
    read: entry?.read ?? null,
    recheckAfter: entry?.recheckAfter ?? null,
    recheckDue: false,
    retires: entry?.retires ?? null,
    retired: false,
    warnings: [],
  };
  if (!entry) {
    out.basis = 'this model is not in prices.json, so its price is unknown';
    return out;
  }
  out.recheckDue = Boolean(entry.recheckAfter && t > entry.recheckAfter);
  out.retired = Boolean(entry.retires && t >= entry.retires);
  if (out.recheckDue) out.warnings.push(`price and availability were read on ${entry.read}; the table says re-check after ${entry.recheckAfter}. Re-read ${entry.source}`);
  const p = entry.price ?? { type: 'unknown' };
  out.approximate = Boolean(p.approximate);
  let usd = null;
  switch (p.type) {
    case 'per_call': {
      const by = p.by ?? 'resolution';
      const u = pick(p.usd, n[by]);
      if (u != null) {
        usd = u;
        out.basis = `${money(u)} per call${typeof p.usd === 'object' ? ` at ${by} ${n[by]}` : ''}`;
      }
      break;
    }
    case 'per_image': {
      let u = null;
      if (p.table) {
        const row = pick(p.table, n.quality);
        u = row ? pick(row, n.size) : null;
        if (u != null) out.basis = `${money(u)} per image at quality ${n.quality}, size ${n.size}`;
      } else {
        const by = p.by ?? 'resolution';
        u = pick(p.usd, n[by]);
        if (u != null) out.basis = `${money(u)} per image${typeof p.usd === 'object' ? ` at ${by} ${n[by]}` : ''}`;
      }
      if (u != null) usd = u;
      break;
    }
    case 'per_second': {
      const table = n.audio && p.audioUsd != null ? p.audioUsd : p.usd;
      const rate = pick(table, n.resolution);
      if (rate != null && Number.isFinite(n.billedSeconds)) {
        usd = rate * n.billedSeconds;
        out.basis = `${n.billedSeconds} s x ${money(rate)}/s${typeof table === 'object' ? ` at ${n.resolution}` : ''}${p.audioUsd != null ? (n.audio ? ', audio on' : ', audio off') : ''}`;
        if (n.secondsNote) out.basis += `; ${n.secondsNote}`;
      }
      break;
    }
    case 'per_minute': {
      if (Number.isFinite(n.billedSeconds)) {
        const minutes = p.roundUp ? Math.ceil(n.billedSeconds / 60) : n.billedSeconds / 60;
        usd = minutes * p.usd;
        out.basis = `${p.roundUp ? `${minutes} min (rounded up)` : `${n.billedSeconds} s`} at ${money(p.usd)}/min`;
      }
      break;
    }
    case 'per_1k_chars': {
      if (Number.isFinite(n.chars)) {
        usd = (n.chars / 1000) * p.usd;
        out.basis = `${n.chars} characters at ${money(p.usd)} per 1,000`;
      }
      break;
    }
    case 'per_second_speech': {
      if (Number.isFinite(n.chars)) {
        const secs = Math.max(1, Math.ceil(n.chars / (p.charsPerSecond ?? 12)));
        usd = secs * p.usd;
        out.basis = `about ${secs} s of speech (${n.chars} characters at ${p.charsPerSecond ?? 12} per second, a heuristic) x ${money(p.usd)}/s`;
        out.approximate = true;
      }
      break;
    }
    default:
      break;
  }
  if (usd == null) {
    out.basis = p.note ? `price unknown: ${p.note}` : out.basis || 'price unknown for these options';
    return out;
  }
  if (p.perInputImageUsd && n.inputImages) {
    usd += p.perInputImageUsd * n.inputImages;
    out.basis += ` + ${money(p.perInputImageUsd)} per input image (allowance)`;
  }
  if (p.extraPerCallUsd) {
    usd += p.extraPerCallUsd;
    out.basis += ` + ${money(p.extraPerCallUsd)} per call`;
  }
  out.usd = round(usd);
  out.known = true;
  return out;
}

// Two decimals at least, more only when they carry information: $0.40, $0.067, $0.000675.
export function formatUsd(v) {
  if (v == null) return 'unknown';
  const s = Number(v).toFixed(6).replace(/0+$/, '');
  const [whole, frac = ''] = s.split('.');
  return `$${whole}.${frac.padEnd(2, '0')}`;
}
