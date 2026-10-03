// Kit root, .env loading and key lookup. Keys come only from the environment
// or from a git-ignored .env at the kit root. The environment wins over .env.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEY_NAMES } from './redact.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CONNECTORS_DIR = path.resolve(HERE, '..');
export const DEFAULT_ROOT = path.resolve(CONNECTORS_DIR, '..');

export const PROVIDER_KEYS = Object.freeze({
  fal: 'FAL_KEY',
  replicate: 'REPLICATE_API_TOKEN',
  elevenlabs: 'ELEVENLABS_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GEMINI_API_KEY',
});

export function kitRoot(env, flagRoot) {
  const r = flagRoot || env.FILM_GEN_ROOT;
  return r ? path.resolve(r) : DEFAULT_ROOT;
}

// Parses KEY=VALUE lines. Supports blank lines, # comments, an optional
// "export " prefix and single or double quotes. No variable expansion.
export function parseDotEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2) || (v.startsWith("'") && v.endsWith("'") && v.length >= 2)) {
      v = v.slice(1, -1);
    } else {
      const hash = v.indexOf(' #');
      if (hash >= 0) v = v.slice(0, hash);
      v = v.trim();
    }
    out[m[1]] = v;
  }
  return out;
}

// Returns a new env object: the process environment plus any .env values the
// environment does not already set, and a map of where each key came from.
export function loadEnv(baseEnv, root) {
  const env = { ...baseEnv };
  const source = {};
  const file = path.join(root, '.env');
  let fileVars = {};
  if (fs.existsSync(file)) {
    try {
      fileVars = parseDotEnv(fs.readFileSync(file, 'utf8'));
    } catch {
      fileVars = {};
    }
  }
  for (const [k, v] of Object.entries(fileVars)) {
    if (env[k] === undefined || env[k] === '') {
      env[k] = v;
      source[k] = '.env';
    } else {
      source[k] = 'environment';
    }
  }
  for (const k of [...KEY_NAMES, 'FILM_GEN_BUDGET_USD', 'FILM_GEN_BUDGET_TOTAL_USD']) {
    if (!source[k] && env[k]) source[k] = 'environment';
  }
  return { env, source, envFile: fs.existsSync(file) ? file : null };
}

// True when the kit's .gitignore lists .env (an exact line, or a pattern that
// clearly covers it). This is a plain text check, not a git call.
export function envIsGitIgnored(root) {
  const gi = path.join(root, '.gitignore');
  if (!fs.existsSync(gi)) return false;
  const lines = fs.readFileSync(gi, 'utf8').split(/\r?\n/).map((l) => l.trim());
  return lines.some((l) => ['.env', '/.env', '.env*', '*.env', '**/.env'].includes(l));
}

// True when file, after following links, is inside root. Used to keep prompt
// and image paths inside the kit.
export function insideKit(root, file) {
  let realRoot;
  let realFile;
  try {
    realRoot = fs.realpathSync(root);
    realFile = fs.realpathSync(file);
  } catch {
    return false;
  }
  const rel = path.relative(realRoot, realFile);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function nodeVersionOk(version = process.versions.node) {
  const [maj, min] = version.split('.').map(Number);
  return maj > 22 || (maj === 22 && min >= 18);
}

export function baseUrlFor(providerId, env, flag) {
  if (flag) return flag.replace(/\/+$/, '');
  const v = env[`FILM_GEN_${providerId.toUpperCase()}_BASE_URL`];
  return v ? v.replace(/\/+$/, '') : null;
}

// Origin only, without any user:password part, for display.
export function safeOrigin(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return '(unparseable URL)';
  }
}
