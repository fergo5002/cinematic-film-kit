// OpenAI adapter: GPT Image generation and edits, and speech. Both answer in
// one request, so submit does the work. There is no video: OpenAI removed the
// Videos API and Sora 2 from its API on 2026-09-24.
//
// Evidence, all read 2026-10-01 (UTC):
//   Images API (generations, JSON edits with images[].image_url, sizes, quality)
//     https://developers.openai.com/api/reference/resources/images
//   Image prices per 1M tokens and the GPT Image 2 per-image table
//     https://developers.openai.com/api/docs/pricing.md
//     https://developers.openai.com/api/docs/guides/image-generation.md
//   Speech: POST /audio/speech, voices, formats
//     https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create
//   Errors: 429 credit_balance_exhausted (type insufficient_quota), 503 server_is_overloaded
//     https://developers.openai.com/api/docs/guides/error-codes.md
//   Deprecations (Sora 2 and the Videos API gone 2026-09-24; gpt-image-1 ends
//   2026-10-23; gpt-image-1.5 ends 2026-12-01)   https://developers.openai.com/api/docs/deprecations.md
//   401 with a fake key, observed 2026-10-01: Content-Type text/plain, a JSON
//   body that echoes the first five and last four characters of the key.

import { ProviderError } from '../lib/errors.mjs';
import { httpRequest } from '../lib/http.mjs';
import { dataUri } from '../lib/media.mjs';
import { estimateCost } from '../lib/prices.mjs';
import { writeOutput } from '../lib/output.mjs';

export const id = 'openai';
export const envKey = 'OPENAI_API_KEY';
export const defaultBaseUrl = 'https://api.openai.com/v1';
export const termsUrl = 'https://openai.com/policies/services-agreement/';

// The three sizes with a published per-image price for gpt-image-2. A 16:9
// request maps to 1536x1024 (3:2); pass --param size=1536x864 for an exact
// 16:9 frame, which has no published price.
const SIZE_FOR = {
  '1:1': '1024x1024',
  '16:9': '1536x1024',
  '3:2': '1536x1024',
  '4:3': '1536x1024',
  '9:16': '1024x1536',
  '2:3': '1024x1536',
  '3:4': '1024x1536',
};

const image = (qualities, defaultQuality) => ({
  kind: 'image',
  image: 'optional',
  qualities,
  defaultQuality,
  aspects: Object.keys(SIZE_FOR),
  defaultAspect: '16:9',
  seed: false,
  sizeFor: (aspect) => SIZE_FOR[aspect],
  build: (n, c, modelId) => ({
    model: modelId,
    prompt: c.prompt,
    ...(c.imageRef ? { images: [{ image_url: c.imageRef }] } : {}),
    size: n.size,
    quality: n.quality,
    n: 1,
    output_format: 'png',
  }),
});

const speech = {
  kind: 'speech',
  voice: 'required',
  voiceHint: 'a built-in voice such as alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse, marin or cedar',
  seed: false,
  build: (n, c, modelId) => ({ model: modelId, input: c.prompt, voice: n.voice, response_format: 'wav' }),
};

export const models = {
  'gpt-image-2': image(['low', 'medium', 'high'], 'medium'),
  'gpt-image-2.5-flare': image(['low', 'medium', 'high', 'xhigh', 'max'], 'medium'),
  'gpt-image-2.5-sunburst': image(['low', 'medium', 'high', 'xhigh', 'max'], 'medium'),
  'tts-1-hd': speech,
  'tts-1': speech,
  'gpt-4o-mini-tts': speech,
};

export function authHeaders(key) {
  return { authorization: `Bearer ${key}` };
}

// --param keys that would change what is billed, or that film-gen sets itself.
// size is the exception: the estimate reads it (see sizeFor in spec.mjs), so a
// size with no published price is reported as unknown rather than guessed.
export const PRICE_KEYS = Object.freeze([
  'model', 'prompt', 'input', 'n', 'size', 'quality', 'images', 'image', 'mask', 'partial_images', 'stream',
  'stream_format', 'response_format', 'voice',
]);
export const ESTIMATED_PARAM_KEYS = Object.freeze(['size']);

export function builtKeys(plan) {
  return Object.keys(models[plan.model].build(plan.n, { prompt: plan.prompt, imageRef: plan.image ? 'image' : null }, plan.model));
}

export function classify(status, body) {
  const e = body?.error ?? null;
  const code = e?.code ?? null;
  const type = e?.type ?? null;
  const text = typeof e?.message === 'string' ? e.message : null;
  const msg = (s) => `openai: ${s}${text ? `: ${text}` : ''}`;
  const billing = ['credit_balance_exhausted', 'insufficient_quota', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded'];
  if (status === 401) return { kind: 'auth', message: msg('the key was rejected (HTTP 401)'), code };
  if (billing.includes(code) || type === 'insufficient_quota') return { kind: 'credit', message: msg('out of credit or over a spend limit'), code };
  if (status === 403) return { kind: 'auth', message: msg('access denied (HTTP 403)'), code };
  if (code === 'moderation_blocked' || type === 'image_generation_user_error') return { kind: 'policy', message: msg('the request was blocked'), code };
  if (status === 404) return { kind: 'not-found', message: msg('not found (HTTP 404)'), code };
  if (status === 429) return { kind: 'rate', message: msg('rate limited (HTTP 429)'), code };
  if (status >= 500) return { kind: 'server', message: msg(`server error (HTTP ${status})`), code };
  return { kind: 'client', message: msg(`request rejected (HTTP ${status})`), code };
}

export function estimate(plan, prices, env) {
  return estimateCost(prices.models.find((m) => m.provider === id && m.model === plan.model) ?? null, plan.n, env);
}

function prepareImage(ctx) {
  const img = ctx.plan.image;
  if (!img) return null;
  if (img.kind === 'url') return img.url;
  if (ctx.dryRun) return `<local file ${img.source}, ${img.size} bytes, sent as a data URL>`;
  return dataUri(img);
}

export function buildRequest(ctx, imageRef = prepareImage(ctx)) {
  const spec = models[ctx.plan.model];
  const body = { ...spec.build(ctx.plan.n, { prompt: ctx.plan.prompt, imageRef }, ctx.plan.model), ...(ctx.plan.params ?? {}) };
  let path = '/audio/speech';
  if (spec.kind === 'image') path = imageRef ? '/images/edits' : '/images/generations';
  return { method: 'POST', url: `${ctx.baseUrl}${path}`, body };
}

export async function preview(ctx) {
  return buildRequest(ctx);
}

// Cost from the usage block, using the token rates in prices.json. This is a
// calculation from what OpenAI reported, not a figure OpenAI billed.
function costFromUsage(usage, rates) {
  if (!usage || !rates) return null;
  const inText = usage.input_tokens_details?.text_tokens;
  const inImage = usage.input_tokens_details?.image_tokens;
  const out = usage.output_tokens;
  if (![inText, inImage, out].every(Number.isFinite)) return null;
  const usd = (inText * rates.inputText + inImage * rates.inputImage + out * rates.outputImage) / 1e6;
  return Math.round(usd * 1e6) / 1e6;
}

export async function submit(ctx) {
  const req = buildRequest(ctx);
  ctx.sent = req.body;
  const spec = models[ctx.plan.model];
  const r = await httpRequest({
    provider: id,
    url: req.url,
    method: 'POST',
    headers: { ...authHeaders(ctx.key), 'content-type': 'application/json' },
    body: JSON.stringify(req.body),
    responseType: spec.kind === 'image' ? 'json' : 'bytes',
    timeoutMs: ctx.timing.generateTimeoutMs,
    classify,
    secrets: ctx.secrets,
    timing: ctx.timing,
    signal: ctx.signal,
  });
  const requestId = r.headers.get('x-request-id');
  if (spec.kind !== 'image') {
    if (!r.data?.length) throw new ProviderError({ provider: id, kind: 'malformed', message: 'OpenAI returned an empty audio body', requestId, uncertain: true });
    return { requestId, bytes: r.data, contentType: r.headers.get('content-type'), usage: null };
  }
  const b64 = r.data?.data?.[0]?.b64_json;
  if (typeof b64 !== 'string' || !b64) {
    throw new ProviderError({ provider: id, kind: 'malformed', message: 'OpenAI returned no image data', requestId, uncertain: true });
  }
  return { requestId, bytes: Buffer.from(b64, 'base64'), contentType: `image/${r.data.output_format ?? 'png'}`, usage: r.data.usage ?? null };
}

export async function poll(_ctx, state) {
  return state;
}

export async function fetch(ctx, state) {
  const entry = ctx.priceEntry;
  const actual = costFromUsage(state.usage, entry?.tokenRates);
  return {
    bytes: state.bytes,
    contentType: state.contentType,
    requestId: state.requestId,
    seedReturned: null,
    providerUsage: state.usage,
    actualUsd: actual,
    actualBasis: actual != null ? `computed from the usage tokens OpenAI returned, at the token rates in prices.json (read ${entry.read})` : null,
    extra: null,
    fallbackExt: models[ctx.plan.model].kind === 'image' ? 'png' : 'wav',
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
