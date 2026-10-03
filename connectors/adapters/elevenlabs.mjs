// ElevenLabs adapter: sound effects, music and speech. Each call answers with
// the audio bytes directly, so submit does the work and poll has nothing to wait for.
//
// Evidence:
//   Auth header xi-api-key                https://elevenlabs.io/docs/api-reference/authentication (read 2026-10-01)
//   POST /v1/sound-generation             https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert (read 2026-10-01)
//   POST /v1/music                        https://elevenlabs.io/docs/api-reference/music/compose (read 2026-10-01)
//   POST /v1/text-to-speech/{voice_id}    https://elevenlabs.io/docs/api-reference/text-to-speech/convert (read 2026-10-01)
//   Response headers character-cost (sound effects) and song-id (music): the
//   official OpenAPI file https://api.elevenlabs.io/openapi.json (read 2026-10-01)
//   Error shape {"detail": {type, code, message, status, request_id}} and the
//   type and code tables       https://elevenlabs.io/docs/eleven-api/resources/errors (read 2026-10-01)
//   401 body observed with a fake key on 2026-10-01 (code "unauthorized", status "invalid_api_key").
//   Prices                     https://elevenlabs.io/pricing/api (read 2026-10-01)

import { ProviderError } from '../lib/errors.mjs';
import { httpRequest } from '../lib/http.mjs';
import { estimateCost } from '../lib/prices.mjs';
import { writeOutput } from '../lib/output.mjs';

export const id = 'elevenlabs';
export const envKey = 'ELEVENLABS_API_KEY';
export const defaultBaseUrl = 'https://api.elevenlabs.io';
export const termsUrl = 'https://elevenlabs.io/terms-of-use';

const music = (modelId) => ({
  kind: 'music',
  duration: { min: 3, max: 600, required: true },
  seed: false,
  seedHint: 'Eleven Music only takes a seed with a composition plan',
  path: () => '/v1/music',
  build: (n, c) => ({ prompt: c.prompt, music_length_ms: Math.round(n.duration * 1000), model_id: modelId }),
});

const speech = (modelId) => ({
  kind: 'speech',
  voice: 'required',
  voiceHint: 'an ElevenLabs voice_id from your voice library',
  path: (n) => `/v1/text-to-speech/${encodeURIComponent(n.voice)}`,
  build: (n, c) => ({ text: c.prompt, model_id: modelId, ...(n.seed != null ? { seed: n.seed } : {}) }),
});

export const models = {
  eleven_text_to_sound_v2: {
    kind: 'sfx',
    duration: { min: 0.5, max: 30 },
    seed: false,
    path: () => '/v1/sound-generation',
    query: { output_format: 'mp3_44100_128' },
    build: (n, c) => ({
      text: c.prompt,
      model_id: 'eleven_text_to_sound_v2',
      ...(n.duration != null ? { duration_seconds: n.duration } : {}),
    }),
  },
  music_v2_5: music('music_v2_5'),
  music_v2: music('music_v2'),
  eleven_v4: speech('eleven_v4'),
  eleven_multilingual_v2: speech('eleven_multilingual_v2'),
  eleven_flash_v2_5: speech('eleven_flash_v2_5'),
};

export function authHeaders(key) {
  return { 'xi-api-key': key };
}

// --param keys that would change what is billed, or that film-gen sets itself.
export const PRICE_KEYS = Object.freeze(['text', 'prompt', 'model_id', 'duration_seconds', 'music_length_ms', 'composition_plan']);

export function builtKeys(plan) {
  return Object.keys(models[plan.model].build(plan.n, { prompt: plan.prompt }));
}

export function classify(status, body) {
  const d = body?.detail;
  let text = null;
  let code = null;
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    text = d.message ?? null;
    code = d.code ?? d.status ?? null;
  } else if (Array.isArray(d)) {
    text = d.map((e) => `${(e.loc ?? []).join('.')}: ${e.msg}`).join('; ');
  } else if (typeof d === 'string') {
    text = d;
  }
  const type = d?.type ?? null;
  const msg = (s) => `elevenlabs: ${s}${text ? `: ${text}` : ''}`;
  if (status === 401 || type === 'authentication_error') return { kind: 'auth', message: msg('the key was rejected'), code };
  if (status === 402 || type === 'payment_required' || code === 'insufficient_credits' || code === 'quota_exceeded') return { kind: 'credit', message: msg('not enough credits'), code };
  if (status === 403) return { kind: 'auth', message: msg('access denied (HTTP 403)'), code };
  if (status === 404) return { kind: 'not-found', message: msg('not found (HTTP 404)'), code };
  if (status === 429) return { kind: 'rate', message: msg('rate or concurrency limit (HTTP 429)'), code };
  if (status >= 500) return { kind: 'server', message: msg(`server error (HTTP ${status})`), code };
  return { kind: 'client', message: msg(`request rejected (HTTP ${status})`), code };
}

export function estimate(plan, prices, env) {
  return estimateCost(prices.models.find((m) => m.provider === id && m.model === plan.model) ?? null, plan.n, env);
}

export function buildRequest(ctx) {
  const spec = models[ctx.plan.model];
  const qs = new URLSearchParams(spec.query ?? {}).toString();
  const body = { ...spec.build(ctx.plan.n, { prompt: ctx.plan.prompt }), ...(ctx.plan.params ?? {}) };
  return { method: 'POST', url: `${ctx.baseUrl}${spec.path(ctx.plan.n)}${qs ? `?${qs}` : ''}`, body };
}

export async function preview(ctx) {
  return buildRequest(ctx);
}

export async function submit(ctx) {
  const req = buildRequest(ctx);
  ctx.sent = req.body;
  const r = await httpRequest({
    provider: id,
    url: req.url,
    method: 'POST',
    headers: { ...authHeaders(ctx.key), 'content-type': 'application/json', accept: 'audio/*' },
    body: JSON.stringify(req.body),
    responseType: 'bytes',
    timeoutMs: ctx.timing.generateTimeoutMs,
    classify,
    secrets: ctx.secrets,
    timing: ctx.timing,
    signal: ctx.signal,
  });
  const h = r.headers;
  const requestId = h.get('request-id') ?? h.get('x-request-id') ?? h.get('x-trace-id') ?? h.get('song-id') ?? null;
  if (!r.data?.length) throw new ProviderError({ provider: id, kind: 'malformed', message: 'ElevenLabs returned an empty body', requestId, uncertain: true });
  const usage = {};
  if (h.get('character-cost')) usage.characterCost = h.get('character-cost');
  if (h.get('song-id')) usage.songId = h.get('song-id');
  return { requestId, bytes: r.data, contentType: h.get('content-type'), usage };
}

export async function poll(_ctx, state) {
  return state;
}

export async function fetch(_ctx, state) {
  return {
    bytes: state.bytes,
    contentType: state.contentType,
    requestId: state.requestId,
    seedReturned: null,
    providerUsage: Object.keys(state.usage).length ? state.usage : null,
    actualUsd: null,
    extra: null,
    fallbackExt: 'mp3',
  };
}

export function write(ctx, fetched, sidecar) {
  return writeOutput({
    root: ctx.root,
    film: ctx.plan.film,
    stem: ctx.plan.name,
    bytes: fetched.bytes,
    contentType: fetched.contentType,
    fallbackExt: fetched.fallbackExt,
    overwrite: ctx.overwrite,
    sidecar,
  });
}
