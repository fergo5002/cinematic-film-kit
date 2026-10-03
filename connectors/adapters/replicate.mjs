// Replicate adapter: official-model predictions, polling, output download, and
// the Files API for local images over 256 KB.
//
// Evidence, read 2026-10-01:
//   Auth "Authorization: Bearer <token>"     https://replicate.com/docs/topics/security/api-tokens.md
//   Endpoints, prediction object, Files API  https://api.replicate.com/openapi.json
//   Statuses incl. aborted, billing rules     https://replicate.com/docs/topics/predictions/lifecycle.md
//   Cancel-After header                       https://replicate.com/docs/topics/predictions/create-a-prediction.md
//   Data URLs up to 256 KB                    https://api.replicate.com/openapi.json (file input guidance)
//   Outputs expire after one hour             https://replicate.com/docs/topics/predictions/output-files.md
//   429 text                                   https://replicate.com/docs/topics/predictions/rate-limits.md
//   401 bodies: observed without a key in an unauthenticated probe (problem+json).
//   Model inputs and prices                    https://replicate.com/<owner>/<name> page JSON for each model below

import path from 'node:path';
import { ProviderError } from '../lib/errors.mjs';
import { httpRequest, pollUntil, download } from '../lib/http.mjs';
import { dataUri } from '../lib/media.mjs';
import { estimateCost } from '../lib/prices.mjs';
import { writeOutput } from '../lib/output.mjs';

export const id = 'replicate';
export const envKey = 'REPLICATE_API_TOKEN';
export const defaultBaseUrl = 'https://api.replicate.com/v1';
export const termsUrl = 'https://replicate.com/terms';
const INLINE_LIMIT = 256 * 1024;

const VIDEO_ASPECTS = ['16:9', '9:16'];
const NB2_ASPECTS = ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'];
const FLUX3_ASPECTS = ['auto', '21:9', '2:1', '16:9', '3:2', '7:5', '4:3', '5:4', '1:1', '4:5', '3:4', '5:7', '2:3', '9:16', '1:2', '9:21'];

export const models = {
  'google/gemini-omni-1.1': {
    kind: 'video',
    image: 'optional',
    resolutions: ['360p', '720p', '1080p', '4k'],
    defaultResolution: '720p',
    maxSeconds: 10,
    aspects: VIDEO_ASPECTS,
    defaultAspect: '16:9',
    audio: 'always',
    seed: false,
    build: (n, c) => ({
      prompt: c.prompt,
      ...(c.imageRef ? { image: c.imageRef } : {}),
      aspect_ratio: n.aspect,
      resolution: n.resolution,
    }),
  },
  'google/veo-3.1-fast': {
    kind: 'video',
    image: 'optional',
    resolutions: ['720p', '1080p'],
    defaultResolution: '720p',
    duration: { allowed: [4, 6, 8], default: 4 },
    aspects: VIDEO_ASPECTS,
    defaultAspect: '16:9',
    audio: 'optional',
    build: (n, c) => ({
      prompt: c.prompt,
      ...(c.imageRef ? { image: c.imageRef } : {}),
      aspect_ratio: n.aspect,
      duration: n.duration,
      resolution: n.resolution,
      generate_audio: n.audio,
      ...(n.seed != null ? { seed: n.seed } : {}),
    }),
  },
  'kwaivgi/kling-v3-video': {
    kind: 'video',
    image: 'optional',
    // Kling's own names: standard is 720p, pro is 1080p.
    resolutions: ['720p', '1080p', '4k'],
    defaultResolution: '720p',
    duration: { min: 3, max: 15, default: 5, integer: true },
    aspects: ['16:9', '9:16', '1:1'],
    defaultAspect: '16:9',
    audio: 'optional',
    seed: false,
    build: (n, c) => ({
      prompt: c.prompt,
      ...(c.imageRef ? { start_image: c.imageRef } : {}),
      mode: { '720p': 'standard', '1080p': 'pro', '4k': '4k' }[n.resolution],
      aspect_ratio: n.aspect,
      duration: n.duration,
      generate_audio: n.audio,
    }),
  },
  'bytedance/seedance-2.5': {
    kind: 'video',
    image: 'optional',
    resolutions: ['480p', '720p'],
    defaultResolution: '720p',
    duration: { min: 4, max: 30, default: 5, integer: true },
    aspects: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
    defaultAspect: '16:9',
    audio: 'optional',
    build: (n, c) => ({
      prompt: c.prompt,
      ...(c.imageRef ? { image: c.imageRef } : {}),
      duration: n.duration,
      resolution: n.resolution,
      // First-frame mode needs the adaptive ratio, per the model's schema.
      aspect_ratio: c.imageRef ? 'adaptive' : n.aspect,
      generate_audio: n.audio,
      watermark: false,
      ...(n.seed != null ? { seed: n.seed } : {}),
    }),
  },
  'black-forest-labs/flux-3': {
    kind: 'video',
    image: 'optional',
    resolutions: ['720p', '1080p'],
    defaultResolution: '720p',
    duration: { min: 5, max: 20, default: 5, integer: true },
    aspects: ['auto', '21:9', '2:1', '16:9', '4:3', '1:1', '3:4', '9:16'],
    defaultAspect: '16:9',
    audio: 'optional',
    seed: false,
    build: (n, c) => ({
      prompt: c.prompt,
      ...(c.imageRef ? { images: [c.imageRef] } : {}),
      aspect_ratio: n.aspect,
      resolution: n.resolution,
      duration: String(n.duration),
      generate_audio: n.audio,
    }),
  },
  'google/nano-banana-2': {
    kind: 'image',
    image: 'optional',
    resolutions: ['1K', '2K', '4K'],
    defaultResolution: '1K',
    aspects: NB2_ASPECTS,
    defaultAspect: '16:9',
    seed: false,
    build: (n, c) => ({
      prompt: c.prompt,
      ...(c.imageRef ? { image_input: [c.imageRef] } : {}),
      aspect_ratio: n.aspect,
      resolution: n.resolution,
      output_format: 'png',
    }),
  },
  'black-forest-labs/flux-3-image': {
    kind: 'image',
    image: 'optional',
    resolutions: ['768sq', '1k', '1.5k', '2k', '4k'],
    defaultResolution: '1k',
    aspects: FLUX3_ASPECTS,
    defaultAspect: '16:9',
    seed: false,
    build: (n, c) => ({
      prompt: c.prompt,
      ...(c.imageRef ? { images: [c.imageRef] } : {}),
      aspect_ratio: n.aspect,
      resolution: n.resolution,
      // Off by default: web search can pull real people and real marks into a frame.
      grounding: false,
      output_format: 'png',
    }),
  },
  'openai/gpt-image-2.5-flare': {
    kind: 'image',
    image: 'optional',
    qualities: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultQuality: 'medium',
    aspects: ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'],
    defaultAspect: '16:9',
    seed: false,
    // The schema also has openai_api_key. It is never sent: it would hand an
    // OpenAI key to a third party.
    build: (n, c) => ({
      prompt: c.prompt,
      ...(c.imageRef ? { input_images: [c.imageRef] } : {}),
      aspect_ratio: n.aspect,
      quality: n.quality,
      number_of_images: 1,
      output_format: 'png',
    }),
  },
  'elevenlabs/music': {
    kind: 'music',
    duration: { min: 5, max: 300, default: 30 },
    seed: false,
    build: (n, c) => ({ prompt: c.prompt, music_length_ms: Math.round(n.duration * 1000) }),
  },
  'google/lyria-3-pro': {
    kind: 'music',
    image: 'optional',
    build: (n, c) => ({ prompt: c.prompt, ...(c.imageRef ? { images: [c.imageRef] } : {}), ...(n.seed != null ? { seed: n.seed } : {}) }),
  },
  'google/lyria-3': {
    kind: 'music',
    image: 'optional',
    fixedSeconds: 30,
    build: (n, c) => ({ prompt: c.prompt, ...(c.imageRef ? { images: [c.imageRef] } : {}), ...(n.seed != null ? { seed: n.seed } : {}) }),
  },
  'stability-ai/stable-audio-2.5': {
    kind: ['music', 'sfx'],
    duration: { min: 1, max: 190, default: 30, integer: true },
    build: (n, c) => ({ prompt: c.prompt, duration: n.duration, ...(n.seed != null ? { seed: n.seed } : {}) }),
  },
};

export function authHeaders(key) {
  return { authorization: `Bearer ${key}` };
}

// --param keys (inside input) that would change what is billed, or that film-gen
// sets itself. The estimate never sees a --param, so these are refused.
export const PRICE_KEYS = Object.freeze([
  'prompt', 'duration', 'resolution', 'mode', 'aspect_ratio', 'generate_audio', 'number_of_images', 'num_outputs',
  'num_images', 'quality', 'music_length_ms', 'draft', 'video', 'start_video', 'reference_videos', 'reference_audios',
  'openai_api_key',
]);

export function builtKeys(plan) {
  return Object.keys(models[plan.model].build(plan.n, { prompt: plan.prompt, imageRef: plan.image ? 'image' : null }));
}

// Replicate errors are problem details: {type, title, status, detail}; some
// routes send a bare {"detail": "..."}.
export function classify(status, body) {
  const detail = typeof body?.detail === 'string' ? body.detail : null;
  const title = typeof body?.title === 'string' ? body.title : null;
  const text = [title, detail].filter(Boolean).join(': ');
  const msg = (s) => `replicate: ${s}${text ? `: ${text}` : ''}`;
  if (status === 401) return { kind: 'auth', message: msg('the token was rejected (HTTP 401)') };
  if (status === 402 || /insufficient credit|billing/i.test(text)) return { kind: 'credit', message: msg('out of credit') };
  if (status === 403) return { kind: 'auth', message: msg('access denied (HTTP 403)') };
  if (status === 404) return { kind: 'not-found', message: msg('not found (HTTP 404)') };
  if (status === 429) return { kind: 'rate', message: msg('rate limited (HTTP 429)') };
  if (status >= 500) return { kind: 'server', message: msg(`server error (HTTP ${status})`) };
  return { kind: 'client', message: msg(`request rejected (HTTP ${status})`) };
}

export function estimate(plan, prices, env) {
  return estimateCost(prices.models.find((m) => m.provider === id && m.model === plan.model) ?? null, plan.n, env);
}

export async function prepareImage(ctx) {
  const img = ctx.plan.image;
  if (!img) return null;
  if (img.kind === 'url') return img.url;
  if (ctx.dryRun) return `<local file ${img.source}, ${img.size} bytes, sent as ${img.size <= INLINE_LIMIT ? 'a data URL' : 'a Files API upload'}>`;
  if (img.size <= INLINE_LIMIT) return dataUri(img);
  const form = new FormData();
  form.append('content', new Blob([img.bytes], { type: img.mime }), path.basename(img.file));
  const r = await httpRequest({
    provider: id,
    url: `${ctx.baseUrl}/files`,
    method: 'POST',
    headers: authHeaders(ctx.key),
    body: form,
    classify,
    secrets: ctx.secrets,
    timing: ctx.timing,
    billable: false,
  });
  const url = r.data?.urls?.get;
  if (!url) throw new ProviderError({ provider: id, kind: 'malformed', message: 'the Files API did not return urls.get' });
  return url;
}

export function buildRequest(ctx, imageRef) {
  const spec = models[ctx.plan.model];
  const input = { ...spec.build(ctx.plan.n, { prompt: ctx.plan.prompt, imageRef }), ...(ctx.plan.params ?? {}) };
  delete input.openai_api_key;
  return { method: 'POST', url: `${ctx.baseUrl}/models/${ctx.plan.model}/predictions`, body: { input } };
}

// The request as it would be sent, with local images described, not uploaded.
export async function preview(ctx) {
  return buildRequest(ctx, await prepareImage(ctx));
}

export async function submit(ctx) {
  const imageRef = await prepareImage(ctx);
  const req = buildRequest(ctx, imageRef);
  ctx.sent = req.body;
  const cancelAfter = Math.max(5, Math.ceil(ctx.timing.jobTimeoutMs / 1000));
  const r = await httpRequest({
    provider: id,
    url: req.url,
    method: 'POST',
    headers: { ...authHeaders(ctx.key), 'content-type': 'application/json', 'cancel-after': `${cancelAfter}s` },
    body: JSON.stringify(req.body),
    classify,
    secrets: ctx.secrets,
    timing: ctx.timing,
    signal: ctx.signal,
  });
  const requestId = r.data?.id;
  if (!requestId) throw new ProviderError({ provider: id, kind: 'malformed', message: 'Replicate accepted the prediction but sent no id', uncertain: true });
  return { requestId, prediction: r.data };
}

export async function poll(ctx, state) {
  let last = state.prediction;
  const terminal = (p) => ['succeeded', 'failed', 'canceled', 'aborted'].includes(p?.status);
  if (!terminal(last)) {
    await pollUntil({
      provider: id,
      timing: ctx.timing,
      deadline: ctx.deadline,
      signal: ctx.signal,
      onWait: (r) => ctx.progress?.(`replicate ${r.status}`),
      check: async () => {
        const g = await httpRequest({
          provider: id,
          url: `${ctx.baseUrl}/predictions/${encodeURIComponent(state.requestId)}`,
          headers: authHeaders(ctx.key),
          classify,
          secrets: ctx.secrets,
          timing: ctx.timing,
          signal: ctx.signal,
        });
        last = g.data;
        if (terminal(last)) return { done: true };
        if (last?.status === 'starting' || last?.status === 'processing') return { done: false, status: last.status, requestId: state.requestId };
        throw new ProviderError({ provider: id, kind: 'malformed', message: `Replicate sent an unknown status: ${String(last?.status)}`, requestId: state.requestId });
      },
    });
  }
  if (last.status !== 'succeeded') {
    const why = last.status === 'aborted' ? 'aborted before it started (Replicate does not charge for these)' : `${last.status}${last.error ? `: ${String(last.error)}` : ''}`;
    throw new ProviderError({ provider: id, kind: 'failed', message: `replicate prediction ${why}`, requestId: state.requestId });
  }
  return { ...state, prediction: last };
}

export async function fetch(ctx, state) {
  const out = state.prediction.output;
  const url = Array.isArray(out) ? out[0] : out;
  if (typeof url !== 'string') {
    throw new ProviderError({ provider: id, kind: state.prediction.data_removed ? 'expired' : 'malformed', message: 'the prediction has no output URL', requestId: state.requestId });
  }
  // Output links are on replicate.delivery; the token is not sent there.
  const file = await download({ provider: id, url, timing: ctx.timing, secrets: ctx.secrets, signal: ctx.signal });
  const kind = ctx.plan.kind;
  return {
    bytes: file.bytes,
    contentType: file.contentType,
    requestId: state.requestId,
    seedReturned: null,
    providerUsage: state.prediction.metrics ? { metrics: state.prediction.metrics } : null,
    actualUsd: null,
    extra: null,
    fallbackExt: kind === 'video' ? 'mp4' : kind === 'image' ? 'png' : 'mp3',
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
