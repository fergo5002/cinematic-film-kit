// fal.ai adapter: queue API (submit, status, result) and the storage upload
// for local images over 1 MB.
//
// Evidence, read 2026-10-01 unless marked:
//   Auth "Authorization: Key <FAL_KEY>"        https://fal.ai/docs/documentation/setting-up/authentication/index.md
//   Queue submit, status, result, statuses     https://fal.ai/docs/documentation/model-apis/inference/queue.md
//   Status and result on the app path only (owner/alias, no sub-path): fal-js
//   queue.ts on GitHub (main, 2026-09-30) and an unauthenticated probe in which
//   the sub-path status URL answered 405 while the app path answered 404.
//   Errors (detail arrays, error_type)        https://fal.ai/docs/documentation/model-apis/errors.md
//                                             https://fal.ai/docs/documentation/model-apis/request-errors.md
//   Storage upload (initiate, then PUT)       fal-js storage.ts on GitHub (main, 2026-09-30)
//   Model inputs and prices                   https://fal.ai/models/<endpoint>/llms.txt for each model below

import path from 'node:path';
import { ProviderError } from '../lib/errors.mjs';
import { httpRequest, pollUntil, download } from '../lib/http.mjs';
import { dataUri } from '../lib/media.mjs';
import { estimateCost } from '../lib/prices.mjs';
import { writeOutput } from '../lib/output.mjs';

export const id = 'fal';
export const envKey = 'FAL_KEY';
export const defaultBaseUrl = 'https://queue.fal.run';
export const defaultStorageUrl = 'https://rest.fal.ai';
export const termsUrl = 'https://fal.ai/legal/terms-of-service';
const INLINE_LIMIT = 1024 * 1024; // fal's hosted MCP advises base64 only under 1 MB

const ASPECT_15 = ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16', '4:1', '1:4', '8:1', '1:8'];
const FLUX3_ASPECTS = ['auto', '21:9', '2:1', '16:9', '3:2', '7:5', '4:3', '5:4', '1:1', '4:5', '3:4', '5:7', '2:3', '9:16', '1:2'];

const omni = (withImage) => ({
  kind: 'video',
  image: withImage ? 'required' : 'none',
  resolutions: ['360p', '720p', '1080p', '4k'],
  defaultResolution: '720p',
  duration: { min: 3, max: 10, default: 5, integer: true },
  aspects: ['16:9', '9:16'],
  defaultAspect: '16:9',
  audio: 'always',
  seed: false,
  output: 'video',
  build: (n, c) => ({
    prompt: c.prompt,
    ...(withImage ? { image_url: c.imageRef } : {}),
    aspect_ratio: n.aspect,
    resolution: n.resolution,
    duration: n.duration,
  }),
});

const flux3Image = (edit) => ({
  kind: 'image',
  image: edit ? 'required' : 'none',
  resolutions: ['512sq', '768sq', '1k', '2k', '4k'],
  defaultResolution: '1k',
  aspects: FLUX3_ASPECTS,
  defaultAspect: '16:9',
  seed: false,
  output: 'images',
  build: (n, c) => ({
    prompt: c.prompt,
    ...(edit ? { image_urls: [c.imageRef] } : {}),
    aspect_ratio: n.aspect,
    resolution: n.resolution,
    output_format: 'png',
  }),
});

const nanoBanana2 = (edit) => ({
  kind: 'image',
  image: edit ? 'required' : 'none',
  resolutions: ['0.5K', '1K', '2K', '4K'],
  defaultResolution: '1K',
  aspects: ASPECT_15,
  defaultAspect: '16:9',
  output: 'images',
  build: (n, c) => ({
    prompt: c.prompt,
    ...(edit ? { image_urls: [c.imageRef] } : {}),
    num_images: 1,
    aspect_ratio: n.aspect,
    resolution: n.resolution,
    output_format: 'png',
    ...(n.seed != null ? { seed: n.seed } : {}),
  }),
});

export const models = {
  'google/gemini-omni-flash/v1.1/text-to-video': omni(false),
  'google/gemini-omni-flash/v1.1/image-to-video': omni(true),
  'fal-ai/veo3.1/fast/image-to-video': {
    kind: 'video',
    image: 'required',
    resolutions: ['720p', '1080p', '4k'],
    defaultResolution: '720p',
    duration: { allowed: [4, 6, 8], default: 4 },
    aspects: ['auto', '16:9', '9:16'],
    defaultAspect: '16:9',
    audio: 'optional',
    output: 'video',
    build: (n, c) => ({
      prompt: c.prompt,
      image_url: c.imageRef,
      aspect_ratio: n.aspect,
      duration: `${n.duration}s`,
      resolution: n.resolution,
      generate_audio: n.audio,
      ...(n.seed != null ? { seed: n.seed } : {}),
    }),
  },
  'fal-ai/kling-video/v3/pro/image-to-video': {
    kind: 'video',
    image: 'required',
    duration: { min: 3, max: 15, default: 5, integer: true },
    audio: 'optional',
    seed: false,
    output: 'video',
    build: (n, c) => ({
      prompt: c.prompt,
      start_image_url: c.imageRef,
      duration: String(n.duration),
      generate_audio: n.audio,
    }),
  },
  'bytedance/seedance-2.5/image-to-video': {
    kind: 'video',
    image: 'required',
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    duration: { min: 4, max: 30, default: 5, integer: true },
    audio: 'optional',
    seed: false,
    output: 'video',
    build: (n, c) => ({
      prompt: c.prompt,
      image_url: c.imageRef,
      resolution: n.resolution,
      duration: String(n.duration),
      generate_audio: n.audio,
    }),
  },
  'alibaba/wan-3.0/image-to-video': {
    kind: 'video',
    image: 'required',
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    duration: { min: 2, max: 30, default: 5, integer: true },
    aspects: ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16'],
    defaultAspect: '16:9',
    audio: 'optional',
    seed: false,
    output: 'video',
    build: (n, c) => ({
      prompt: c.prompt,
      start_image_url: c.imageRef,
      resolution: n.resolution,
      aspect_ratio: n.aspect,
      duration: n.duration,
      audio: n.audio,
    }),
  },
  'blackforestlabs/flux-3/image-to-video': {
    kind: 'video',
    image: 'required',
    resolutions: ['720p', '1080p'],
    defaultResolution: '720p',
    duration: { min: 5, max: 20, default: 5, integer: true },
    aspects: ['auto', '21:9', '2:1', '16:9', '4:3', '1:1', '3:4', '9:16'],
    defaultAspect: '16:9',
    audio: 'optional',
    seed: false,
    output: 'video',
    build: (n, c) => ({
      prompt: c.prompt,
      image_url: c.imageRef,
      aspect_ratio: n.aspect,
      resolution: n.resolution,
      duration: n.duration,
      generate_audio: n.audio,
    }),
  },
  'fal-ai/nano-banana-2': nanoBanana2(false),
  'fal-ai/nano-banana-2/edit': nanoBanana2(true),
  'blackforestlabs/flux-3/text-to-image': flux3Image(false),
  'blackforestlabs/flux-3/edit-image': flux3Image(true),
  'fal-ai/elevenlabs/sound-effects/v2': {
    kind: 'sfx',
    duration: { min: 0.5, max: 22 },
    seed: false,
    output: 'audio',
    build: (n, c) => ({
      text: c.prompt,
      ...(n.duration != null ? { duration_seconds: n.duration } : {}),
      output_format: 'mp3_44100_128',
    }),
  },
  'fal-ai/stable-audio-3/small/sfx/text-to-audio': {
    kind: 'sfx',
    duration: { min: 1, max: 30, default: 5 },
    output: 'audio',
    build: (n, c) => ({
      prompt: c.prompt,
      duration: n.duration,
      output_format: 'wav',
      ...(n.seed != null ? { seed: n.seed } : {}),
    }),
  },
  'fal-ai/stable-audio-3/medium/text-to-audio': {
    kind: 'music',
    duration: { min: 1, max: 380, default: 30 },
    output: 'audio',
    build: (n, c) => ({
      prompt: c.prompt,
      duration: n.duration,
      output_format: 'wav',
      ...(n.seed != null ? { seed: n.seed } : {}),
    }),
  },
  'elevenlabs/music/v2.5': {
    kind: 'music',
    duration: { min: 3, max: 600, required: true },
    seed: false,
    seedHint: 'Eleven Music only takes a seed with a composition plan',
    output: 'audio',
    build: (n, c) => ({
      prompt: c.prompt,
      music_length_ms: Math.round(n.duration * 1000),
      output_format: 'mp3_48000_192',
    }),
  },
  'google/lyria-3.5': {
    kind: 'music',
    image: 'optional',
    seed: false,
    output: 'audio',
    build: (n, c) => ({ prompt: c.prompt, ...(c.imageRef ? { image_url: c.imageRef } : {}) }),
  },
};

export function authHeaders(key) {
  return { authorization: `Key ${key}` };
}

// --param keys that would change what is billed, or that film-gen sets itself.
// The estimate never sees a --param, so these are refused (see core.mjs).
export const PRICE_KEYS = Object.freeze([
  'model', 'prompt', 'text', 'n', 'num_images', 'num_samples', 'duration', 'duration_seconds', 'music_length_ms',
  'resolution', 'image_size', 'aspect_ratio', 'generate_audio', 'audio', 'draft', 'enable_web_search', 'thinking_level',
  'multi_prompt', 'elements', 'voice_ids', 'composition_plan', 'video_url', 'video_urls', 'reference_video_urls',
  'audio_url', 'audio_urls', 'reference_audio_urls', 'bitrate_mode', 'fps',
]);

// The fields this adapter fills in for a plan, at the level --param merges into.
export function builtKeys(plan) {
  return Object.keys(models[plan.model].build(plan.n, { prompt: plan.prompt, imageRef: plan.image ? 'image' : null }));
}

// fal error bodies: {"detail": "..."} or {"detail": [ {loc,msg,type} ]}, with
// error_type in the body or the X-Fal-Error-Type header.
export function classify(status, body, headers) {
  let detail = null;
  if (typeof body?.detail === 'string') detail = body.detail;
  else if (Array.isArray(body?.detail)) detail = body.detail.map((d) => `${(d.loc ?? []).join('.')}: ${d.msg}`).join('; ');
  const type = body?.error_type ?? headers?.get?.('x-fal-error-type') ?? (Array.isArray(body?.detail) ? body.detail[0]?.type : null);
  const msg = (s) => `fal: ${s}${detail ? `: ${detail}` : ''}`;
  if (status === 401) return { kind: 'auth', message: msg('the key was rejected (HTTP 401)'), code: type };
  if (status === 403 && /balance|locked|billing|credit|top up/i.test(detail ?? '')) return { kind: 'credit', message: msg('the account is locked or out of credit (HTTP 403)'), code: type };
  if (status === 403) return { kind: 'auth', message: msg('access denied (HTTP 403)'), code: type };
  if (status === 404) return { kind: 'not-found', message: msg('not found (HTTP 404)'), code: type };
  if (status === 422 && type === 'content_policy_violation') return { kind: 'policy', message: msg('blocked by content policy'), code: type };
  if (status === 429) return { kind: 'rate', message: msg('rate or concurrency limit (HTTP 429)'), code: type };
  if (status >= 500) return { kind: 'server', message: msg(`server error (HTTP ${status})`), code: type };
  return { kind: 'client', message: msg(`request rejected (HTTP ${status})`), code: type };
}

function appPath(endpoint) {
  const [owner, alias] = endpoint.split('/');
  return `${owner}/${alias}`;
}

export function estimate(plan, prices, env) {
  return estimateCost(prices.models.find((m) => m.provider === id && m.model === plan.model) ?? null, plan.n, env);
}

// Turns --image into something fal accepts: a URL as is, a small file as a
// data URI, a larger one through the storage upload.
export async function prepareImage(ctx) {
  const img = ctx.plan.image;
  if (!img) return null;
  if (img.kind === 'url') return img.url;
  if (ctx.dryRun) return `<local file ${img.source}, ${img.size} bytes, sent as ${img.size <= INLINE_LIMIT ? 'a data URI' : 'a storage upload'}>`;
  if (img.size <= INLINE_LIMIT) return dataUri(img);
  const init = await httpRequest({
    provider: id,
    url: `${ctx.storageUrl}/storage/upload/initiate?storage_type=fal-cdn-v3`,
    method: 'POST',
    headers: { ...authHeaders(ctx.key), 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ content_type: img.mime, file_name: path.basename(img.file) }),
    classify,
    secrets: ctx.secrets,
    timing: ctx.timing,
    billable: false,
  });
  const { upload_url: uploadUrl, file_url: fileUrl } = init.data ?? {};
  if (!uploadUrl || !fileUrl) throw new ProviderError({ provider: id, kind: 'malformed', message: 'fal storage did not return upload_url and file_url' });
  // The upload URL is pre-signed, so no key goes with the bytes.
  await httpRequest({
    provider: id,
    url: uploadUrl,
    method: 'PUT',
    headers: { 'content-type': img.mime },
    body: img.bytes,
    responseType: 'text',
    classify,
    secrets: ctx.secrets,
    timing: ctx.timing,
    billable: false,
  });
  return fileUrl;
}

export function buildRequest(ctx, imageRef) {
  const spec = models[ctx.plan.model];
  const input = { ...spec.build(ctx.plan.n, { prompt: ctx.plan.prompt, imageRef }), ...(ctx.plan.params ?? {}) };
  return { method: 'POST', url: `${ctx.baseUrl}/${ctx.plan.model}`, body: input };
}

// The request as it would be sent, with local images described, not uploaded.
export async function preview(ctx) {
  return buildRequest(ctx, await prepareImage(ctx));
}

export async function submit(ctx) {
  const imageRef = await prepareImage(ctx);
  const req = buildRequest(ctx, imageRef);
  ctx.sent = req.body;
  const r = await httpRequest({
    provider: id,
    url: req.url,
    method: 'POST',
    headers: { ...authHeaders(ctx.key), 'content-type': 'application/json' },
    body: JSON.stringify(req.body),
    classify,
    secrets: ctx.secrets,
    timing: ctx.timing,
    signal: ctx.signal,
  });
  const requestId = r.data?.request_id;
  if (!requestId) {
    throw new ProviderError({ provider: id, kind: 'malformed', message: 'fal accepted the submit but sent no request_id', uncertain: true });
  }
  return { requestId };
}

export async function poll(ctx, state) {
  const base = `${ctx.baseUrl}/${appPath(ctx.plan.model)}/requests/${encodeURIComponent(state.requestId)}`;
  await pollUntil({
    provider: id,
    timing: ctx.timing,
    deadline: ctx.deadline,
    signal: ctx.signal,
    onWait: (r) => ctx.progress?.(`fal ${r.status ?? 'waiting'}${r.position != null ? `, queue position ${r.position}` : ''}`),
    check: async () => {
      const s = await httpRequest({
        provider: id,
        url: `${base}/status?logs=0`,
        headers: authHeaders(ctx.key),
        classify,
        secrets: ctx.secrets,
        timing: ctx.timing,
        signal: ctx.signal,
      });
      const st = s.data?.status;
      if (st === 'COMPLETED') {
        if (s.data.error) {
          throw new ProviderError({
            provider: id,
            kind: s.data.error_type === 'content_policy_violation' ? 'policy' : 'failed',
            code: s.data.error_type ?? null,
            message: `fal job failed: ${s.data.error}${s.data.error_type ? ` (${s.data.error_type})` : ''}`,
            requestId: state.requestId,
          });
        }
        return { done: true };
      }
      if (st === 'IN_QUEUE' || st === 'IN_PROGRESS') return { done: false, status: st, position: s.data.queue_position ?? null, requestId: state.requestId };
      throw new ProviderError({ provider: id, kind: 'malformed', message: `fal sent an unknown status: ${String(st)}`, requestId: state.requestId });
    },
  });
  const result = await httpRequest({
    provider: id,
    url: base,
    headers: authHeaders(ctx.key),
    classify,
    secrets: ctx.secrets,
    timing: ctx.timing,
    signal: ctx.signal,
  });
  return { ...state, result: result.data, billableUnits: result.headers.get('x-fal-billable-units') };
}

function outputUrl(result, kind) {
  if (kind === 'video') return result?.video?.url ?? null;
  if (kind === 'images') return result?.images?.[0]?.url ?? result?.image?.url ?? null;
  if (kind === 'audio') return typeof result?.audio === 'string' ? result.audio : result?.audio?.url ?? null;
  return null;
}

export async function fetch(ctx, state) {
  const spec = models[ctx.plan.model];
  const url = outputUrl(state.result, spec.output);
  if (!url) throw new ProviderError({ provider: id, kind: 'malformed', message: `fal result has no ${spec.output} URL`, requestId: state.requestId });
  // fal output files are public links, so no key is sent with the download.
  const file = await download({ provider: id, url, timing: ctx.timing, secrets: ctx.secrets, signal: ctx.signal });
  return {
    bytes: file.bytes,
    contentType: file.contentType,
    requestId: state.requestId,
    seedReturned: Number.isInteger(state.result?.seed) ? state.result.seed : null,
    providerUsage: state.billableUnits ? { billableUnits: state.billableUnits } : null,
    actualUsd: null,
    extra: state.result?.lyrics ? { lyrics: state.result.lyrics } : null,
    fallbackExt: spec.output === 'video' ? 'mp4' : spec.output === 'images' ? 'png' : 'mp3',
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
