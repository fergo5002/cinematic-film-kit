// One HTTP helper for every adapter: timeouts, retries with backoff, Retry-After,
// provider-specific error classification and redaction of anything a provider
// sends back. Uses the global fetch in Node 22.18+, no packages.

import { ProviderError } from './errors.mjs';
import { redact } from './redact.mjs';

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('aborted'));
    const t = setTimeout(resolve, Math.max(0, ms));
    signal?.addEventListener?.('abort', () => {
      clearTimeout(t);
      reject(signal.reason ?? new Error('aborted'));
    }, { once: true });
  });
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Timing knobs. The defaults suit real providers; the tests shorten them.
export function timingFrom(env, timeoutSec) {
  return {
    httpTimeoutMs: num(env.FILM_GEN_HTTP_TIMEOUT_MS, 120_000),
    // Synchronous generation calls (images, speech, music) can take minutes.
    generateTimeoutMs: num(env.FILM_GEN_GENERATE_TIMEOUT_MS, 600_000),
    downloadTimeoutMs: num(env.FILM_GEN_DOWNLOAD_TIMEOUT_MS, 600_000),
    backoffMs: num(env.FILM_GEN_BACKOFF_MS, 1000),
    pollMs: num(env.FILM_GEN_POLL_MS, 2000),
    pollMaxMs: num(env.FILM_GEN_POLL_MAX_MS, 15_000),
    maxRetryAfterMs: num(env.FILM_GEN_MAX_RETRY_AFTER_MS, 300_000),
    retries: num(env.FILM_GEN_RETRIES, 3),
    jobTimeoutMs: Math.round(num(timeoutSec, 1800) * 1000),
  };
}

// Retry-After as seconds or an HTTP date; Google also puts a RetryInfo
// retryDelay such as "30s" in the error details.
export function parseRetryAfter(headers, body) {
  const h = headers?.get?.('retry-after');
  if (h) {
    const secs = Number(h);
    if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
    const at = Date.parse(h);
    if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  }
  const details = (Array.isArray(body) ? body[0] : body)?.error?.details;
  if (Array.isArray(details)) {
    for (const d of details) {
      const m = /^(\d+(?:\.\d+)?)s$/.exec(String(d?.retryDelay ?? ''));
      if (m) return Number(m[1]) * 1000;
    }
  }
  return null;
}

export function tryJson(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function backoffFor(attempt, base) {
  return Math.min(30_000, base * 2 ** attempt);
}

// classify(status, body, headers) must return { kind, message, code }.
// Kinds rate and server are retried (server only for GET, because a repeated
// submit could be charged twice); everything else is thrown at once.
//
// billable marks a request that may start paid work (every submit). When such a
// request is cancelled, times out, comes back unreadable or gets a 5xx, the
// provider may already have the job, so the error is marked uncertain and the
// ledger counts it at its estimate. Only a definite 4xx means it was not taken.
//
// Redirects are never followed: fetch would carry headers such as xi-api-key or
// x-goog-api-key to the new address. A 3xx is an error, unless the caller asks
// for it back (download does, and handles each hop itself).
export async function httpRequest(opts) {
  const {
    provider,
    url,
    method = 'GET',
    headers = {},
    body,
    timeoutMs,
    responseType = 'json',
    classify,
    secrets = [],
    timing,
    returnRedirects = false,
    billable = true,
    signal,
    onRetry,
  } = opts;
  const maxAttempts = 1 + (timing?.retries ?? 3);
  const isGet = method === 'GET' || method === 'HEAD';
  const mayBeCharged = !isGet && billable;
  const where = `${method} ${new URL(url).pathname}`;
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      const timeoutSignal = AbortSignal.timeout(timeoutMs ?? timing?.httpTimeoutMs ?? 120_000);
      const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
      res = await fetch(url, { method, headers, body, redirect: 'manual', signal: combined });
    } catch (e) {
      const aborted = Boolean(signal?.aborted);
      const timedOut = !aborted && (e?.name === 'TimeoutError' || e?.name === 'AbortError');
      if (isGet && !aborted && attempt + 1 < maxAttempts) {
        onRetry?.({ attempt, reason: timedOut ? 'timeout' : 'network' });
        await sleep(backoffFor(attempt, timing?.backoffMs ?? 1000), signal);
        continue;
      }
      const why = aborted ? 'cancelled' : timedOut ? 'no reply before the timeout' : `network error (${e?.cause?.code ?? e?.message ?? 'unknown'})`;
      throw new ProviderError({
        provider,
        kind: aborted ? 'aborted' : timedOut ? 'timeout' : 'network',
        message: redact(`${where}: ${why}`, secrets),
        uncertain: mayBeCharged,
        cause: e,
      });
    }

    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel?.();
      if (returnRedirects) return { status: res.status, headers: res.headers, location: res.headers.get('location'), data: null };
      throw new ProviderError({
        provider,
        kind: 'redirect',
        status: res.status,
        message: `${where} answered with a redirect (HTTP ${res.status}); it was not followed, so no key went to another address`,
      });
    }

    if (res.ok) {
      if (responseType === 'bytes') {
        const buf = Buffer.from(await res.arrayBuffer());
        return { status: res.status, headers: res.headers, data: buf };
      }
      const text = await res.text();
      if (responseType === 'text') return { status: res.status, headers: res.headers, data: text };
      const parsed = tryJson(text);
      if (parsed === null) {
        if (isGet && attempt + 1 < maxAttempts) {
          onRetry?.({ attempt, reason: 'malformed' });
          await sleep(backoffFor(attempt, timing?.backoffMs ?? 1000), signal);
          continue;
        }
        throw new ProviderError({
          provider,
          kind: 'malformed',
          status: res.status,
          message: `${where}: the reply was not valid JSON`,
          uncertain: mayBeCharged,
        });
      }
      return { status: res.status, headers: res.headers, data: parsed };
    }

    const text = await res.text().catch(() => '');
    const parsed = tryJson(text);
    const c = classify(res.status, parsed, res.headers, text) ?? {};
    const kind = c.kind ?? (res.status >= 500 ? 'server' : 'client');
    const retryAfter = parseRetryAfter(res.headers, parsed);
    const canRetry = (kind === 'rate' || (kind === 'server' && isGet)) && attempt + 1 < maxAttempts;
    if (canRetry) {
      const wait = retryAfter ?? backoffFor(attempt, timing?.backoffMs ?? 1000);
      if (wait <= (timing?.maxRetryAfterMs ?? 300_000)) {
        onRetry?.({ attempt, reason: kind, waitMs: wait });
        await sleep(wait, signal);
        continue;
      }
    }
    throw new ProviderError({
      provider,
      kind,
      status: res.status,
      code: c.code ?? null,
      message: redact(c.message || `${where} returned HTTP ${res.status}`, secrets),
      requestId: c.requestId ?? null,
      // A 5xx does not say whether the job was taken; a 4xx says it was not.
      uncertain: mayBeCharged && res.status >= 500,
    });
  }
}

// Polls check() until it reports done, growing the wait by half each time.
export async function pollUntil({ provider, check, timing, deadline, signal, onWait }) {
  let wait = timing.pollMs;
  for (;;) {
    const r = await check();
    if (r.done) return r;
    if (Date.now() + wait > deadline) {
      throw new ProviderError({
        provider,
        kind: 'timeout',
        message: `gave up waiting after the job timeout; the job may still finish and be charged${r.requestId ? ` (request ${r.requestId})` : ''}`,
        requestId: r.requestId ?? null,
        uncertain: true,
      });
    }
    onWait?.(r);
    await sleep(wait, signal);
    wait = Math.min(Math.round(wait * 1.5), timing.pollMaxMs);
  }
}

// Downloads a provider output. Credentials are only sent to the origin they
// belong to: redirects are followed by hand and the auth header is dropped
// on any hop to another origin.
export async function download({ provider, url, authHeaders = {}, authOrigin = null, timing, secrets, classify, signal }) {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    if (current.startsWith('data:')) {
      const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(current);
      if (!m) throw new ProviderError({ provider, kind: 'malformed', message: 'unreadable data URI in the output' });
      const bytes = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]));
      return { bytes, contentType: m[1] ?? null };
    }
    const origin = new URL(current).origin;
    const headers = authOrigin && origin === authOrigin ? authHeaders : {};
    const r = await httpRequest({
      provider,
      url: current,
      method: 'GET',
      headers,
      responseType: 'bytes',
      timeoutMs: timing.downloadTimeoutMs,
      classify: (status, b, h, t) => {
        if (status === 403 || status === 404 || status === 410) {
          return { kind: 'expired', message: `output download returned HTTP ${status}; the link has expired or the file is gone` };
        }
        return classify ? classify(status, b, h, t) : { kind: status >= 500 ? 'server' : 'client' };
      },
      secrets,
      timing,
      returnRedirects: true,
      billable: false,
      signal,
    });
    if (r.location) {
      current = new URL(r.location, current).toString();
      continue;
    }
    return { bytes: r.data, contentType: r.headers.get('content-type') };
  }
  throw new ProviderError({ provider, kind: 'malformed', message: 'too many redirects while downloading the output' });
}
