// Keys must never reach a log, an error, a sidecar or the ledger. Everything
// that prints or stores text from a provider goes through redact() first.

export const KEY_NAMES = Object.freeze([
  'FAL_KEY',
  'REPLICATE_API_TOKEN',
  'ELEVENLABS_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
]);

// Header names that carry credentials for the five providers.
const SECRET_HEADERS = new Set(['authorization', 'xi-api-key', 'x-goog-api-key', 'x-api-key', 'proxy-authorization', 'cookie']);

// Shapes that look like provider keys, caught even when the value is not one
// we hold (for example OpenAI echoes a masked copy of a wrong key in its 401).
const KEY_PATTERNS = [
  /\bsk-[A-Za-z0-9_*\-]{6,}/g, // OpenAI style, including masked echoes
  /\br8_[A-Za-z0-9]{8,}/g, // Replicate
  /\bAIza[0-9A-Za-z_\-]{20,}/g, // Google API keys
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{16,}\b/gi, // fal id:secret
];

export function secretsFrom(env) {
  const out = [];
  for (const name of KEY_NAMES) {
    const v = env?.[name];
    if (typeof v === 'string' && v.trim().length >= 4) out.push(v.trim());
  }
  return out;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redact(value, secrets = []) {
  if (value == null) return value;
  let text = typeof value === 'string' ? value : String(value);
  // Longest first so a key that contains another key is removed whole.
  for (const s of [...secrets].sort((a, b) => b.length - a.length)) {
    if (!s) continue;
    text = text.replace(new RegExp(escapeRegExp(s), 'g'), '[redacted]');
  }
  for (const re of KEY_PATTERNS) text = text.replace(re, '[redacted]');
  text = text.replace(/((?:api[_-]?key|token|authorization)["']?\s*[:=]\s*["']?)([^"'\s,&}]{6,})/gi, '$1[redacted]');
  text = text.replace(/([?&](?:key|api_key|token)=)[^&\s"']+/gi, '$1[redacted]');
  return text;
}

// Deep copy of a JSON-like value with every string redacted.
export function redactDeep(value, secrets = []) {
  if (typeof value === 'string') return redact(value, secrets);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, secrets));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_HEADERS.has(k.toLowerCase()) ? '[redacted]' : redactDeep(v, secrets);
    }
    return out;
  }
  return value;
}

export function redactHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    out[k] = SECRET_HEADERS.has(k.toLowerCase()) ? '[redacted]' : v;
  }
  return out;
}
