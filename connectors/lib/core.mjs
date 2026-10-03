// The shared engine behind the CLI and the MCP server: check a request,
// estimate it, guard the budget, run the adapter, write the file, its sidecar
// and the ledger.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as fal from '../adapters/fal.mjs';
import * as replicate from '../adapters/replicate.mjs';
import * as elevenlabs from '../adapters/elevenlabs.mjs';
import * as openai from '../adapters/openai.mjs';
import * as google from '../adapters/google.mjs';
import { CONNECTORS_DIR, envIsGitIgnored, insideKit, kitRoot, loadEnv, baseUrlFor } from './env.mjs';
import { ProviderError, RefusedError, UsageError } from './errors.mjs';
import { timingFrom } from './http.mjs';
import { appendLine, FILM_ID, kitLockPath, ledgerPath, STEM, summarise, summariseKit, withLedgerLock } from './ledger.mjs';
import { elideData, readInputImage, sha256 } from './media.mjs';
import { existingOutputs } from './output.mjs';
import { estimateCost, findPrice, formatUsd, loadPrices } from './prices.mjs';
import { redact, redactDeep, redactHeaders, secretsFrom } from './redact.mjs';
import { KINDS, kindsOf, normalise } from './spec.mjs';

export const ADAPTERS = Object.freeze({ fal, replicate, elevenlabs, openai, google });
export const VERSION = JSON.parse(fs.readFileSync(path.join(CONNECTORS_DIR, 'package.json'), 'utf8')).version;

export function kitContext(baseEnv, rootFlag) {
  const root = kitRoot(baseEnv, rootFlag);
  const { env, source, envFile } = loadEnv(baseEnv, root);
  return { root, env, source, envFile, secrets: secretsFrom(env) };
}

// A prompt is sent to a provider and kept in a sidecar under public/, so it
// must never carry a key.
function refuseKeys(text, secrets, what) {
  if (secrets.some((s) => s && text.includes(s))) {
    throw new UsageError(`${what} contains the value of an API key. Prompts are sent to providers and kept in sidecars, so a key never belongs in one.`);
  }
}

// Prompts come from files inside the kit only, never from .env or anything
// outside it.
function readPromptText(opts, root, cwd, secrets) {
  if (opts.prompt != null && opts.promptFile) throw new UsageError('give the prompt either as a file or as text, not both');
  if (opts.prompt != null) {
    const text = String(opts.prompt).trim();
    if (!text) throw new UsageError('the prompt is empty');
    refuseKeys(text, secrets, 'the prompt');
    return { text, file: null };
  }
  if (!opts.promptFile) throw new UsageError('--prompt-file is required (a text file holding the prompt)');
  const candidates = path.isAbsolute(opts.promptFile) ? [opts.promptFile] : [path.resolve(cwd, opts.promptFile), path.resolve(root, opts.promptFile)];
  const found = candidates.filter((f) => fs.existsSync(f) && fs.statSync(f).isFile());
  if (!found.length) throw new UsageError(`--prompt-file: no such file: ${opts.promptFile}`);
  const file = found.find((f) => insideKit(root, f));
  if (!file) throw new UsageError(`--prompt-file must be a file inside the kit (keep prompts with the film); ${opts.promptFile} is outside it`);
  if (/^\.env/i.test(path.basename(file))) throw new UsageError('--prompt-file cannot be a .env file: it holds keys');
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) throw new UsageError(`--prompt-file: ${opts.promptFile} is empty`);
  refuseKeys(text, secrets, `--prompt-file ${opts.promptFile}`);
  return { text, file: path.relative(fs.realpathSync(root), fs.realpathSync(file)).split(path.sep).join('/') };
}

// --param goes straight into the request, after film-gen's own fields, and the
// estimate never sees it. So a --param may not set a field film-gen fills in,
// or one that changes what is billed (the adapter lists those). The exception
// is a key the estimate reads itself, such as OpenAI's size.
function paramClashes(adapter, planLike, params) {
  const keys = Object.keys(params ?? {});
  if (!keys.length) return [];
  const priceKeys = adapter.priceKeysFor ? adapter.priceKeysFor(planLike) : adapter.PRICE_KEYS ?? [];
  const reserved = new Set([...adapter.builtKeys(planLike), ...priceKeys]);
  for (const k of adapter.ESTIMATED_PARAM_KEYS ?? []) reserved.delete(k);
  return keys.filter((k) => reserved.has(k));
}

// Both caps must be set, and the estimate must fit under both: this film's
// FILM_GEN_BUDGET_USD and the kit's FILM_GEN_BUDGET_TOTAL_USD across all films.
function budgetRefusals(est, filmSpent, budget, kitSpent, totalCap, film) {
  const out = [];
  if (!(budget > 0)) out.push({ reason: 'budget-unset', message: 'FILM_GEN_BUDGET_USD is not set above zero. Every paid call needs a per-film budget: put FILM_GEN_BUDGET_USD=5 (or your limit) in .env.' });
  if (!(totalCap > 0)) out.push({ reason: 'budget-total-unset', message: 'FILM_GEN_BUDGET_TOTAL_USD is not set above zero. It caps spending across every film in the kit: put FILM_GEN_BUDGET_TOTAL_USD=20 (or your limit) in .env.' });
  if (out.length) return out;
  if (est.known) {
    if (filmSpent + est.usd > budget + 1e-9) out.push({ reason: 'budget', message: `the estimate ${formatUsd(est.usd)} plus ${formatUsd(filmSpent)} already spent on film ${film} would pass the budget of ${formatUsd(budget)}.` });
    else if (kitSpent + est.usd > totalCap + 1e-9) out.push({ reason: 'budget-total', message: `the estimate ${formatUsd(est.usd)} plus ${formatUsd(kitSpent)} already spent across the kit would pass FILM_GEN_BUDGET_TOTAL_USD of ${formatUsd(totalCap)}.` });
  } else if (filmSpent >= budget) {
    out.push({ reason: 'budget', message: `${formatUsd(filmSpent)} is already spent on film ${film}, which meets the budget of ${formatUsd(budget)}.` });
  } else if (kitSpent >= totalCap) {
    out.push({ reason: 'budget-total', message: `${formatUsd(kitSpent)} is already spent across the kit, which meets FILM_GEN_BUDGET_TOTAL_USD of ${formatUsd(totalCap)}.` });
  }
  return out;
}

export function listModels(prices, filter = {}) {
  const rows = [];
  for (const [pid, adapter] of Object.entries(ADAPTERS)) {
    if (filter.provider && filter.provider !== pid) continue;
    for (const [mid, spec] of Object.entries(adapter.models)) {
      const kinds = kindsOf(spec);
      if (filter.kind && !kinds.includes(filter.kind)) continue;
      rows.push({ provider: pid, model: mid, kinds, spec, price: findPrice(prices, pid, mid) });
    }
  }
  return rows;
}

// Builds a plan without spending anything. Usage problems throw; reasons to
// refuse are collected so estimate can show all of them at once.
export function makePlan(opts, kctx, prices, { cwd = process.cwd() } = {}) {
  const { root, env } = kctx;
  if (!opts.kind || !KINDS.includes(opts.kind)) throw new UsageError(`--kind must be one of ${KINDS.join(', ')}`);
  if (!opts.provider || !ADAPTERS[opts.provider]) throw new UsageError(`--provider must be one of ${Object.keys(ADAPTERS).join(', ')}`);
  if (!opts.model) throw new UsageError('--model is required (see: film-gen models)');
  if (!opts.film || !FILM_ID.test(opts.film)) throw new UsageError('--film must be a film id: lowercase letters, digits and single hyphens');
  if (!opts.name || !STEM.test(opts.name)) throw new UsageError('--name must be a file stem: lowercase letters, digits, dots, hyphens or underscores, starting with a letter or digit');

  const adapter = ADAPTERS[opts.provider];
  const spec = adapter.models[opts.model];
  if (!spec) {
    const known = Object.entries(adapter.models).filter(([, s]) => kindsOf(s).includes(opts.kind)).map(([m]) => m);
    throw new UsageError(`${opts.provider} has no model ${opts.model} in this kit. Models for ${opts.kind}: ${known.join(', ') || 'none'}`);
  }
  const prompt = readPromptText(opts, root, cwd, kctx.secrets ?? []);
  const image = readInputImage(opts.image, root);
  const params = opts.params ?? {};
  const n = normalise(spec, { ...opts, prompt: prompt.text, params }, opts.model);
  const clash = paramClashes(adapter, { model: opts.model, n, prompt: prompt.text, image }, params);
  if (clash.length) {
    throw new UsageError(
      `--param ${clash.join(', ')}: film-gen sets ${clash.length > 1 ? 'these fields' : 'this field'} itself or ${clash.length > 1 ? 'they change' : 'it changes'} what is billed, and the estimate cannot see a --param. ` +
        'Use --duration, --resolution, --quality, --aspect, --audio, --seed or --voice instead, or leave it out.',
    );
  }
  const entry = findPrice(prices, opts.provider, opts.model);
  const est = estimateCost(entry, n, env);

  const refusals = [];
  const warnings = [...est.warnings, ...n.notes];
  if (est.retired) refusals.push({ reason: 'retired', message: `${opts.model} was due to shut down on ${est.retires}. Pick a current model (film-gen models).` });
  if (!est.known && !opts.acceptUnknownPrice) {
    refusals.push({ reason: 'unknown-price', message: `the price is unknown (${est.basis}). Pass --accept-unknown-price to run it anyway; the ledger will record an unknown cost.` });
  }
  const licence = entry?.licence ?? null;
  if (licence?.gate && !opts.acceptLicence) {
    refusals.push({ reason: 'licence', message: `${licence.note} Pass --accept-licence once you have checked that your use is covered.` });
  }

  // Budgets belong to real films: a made-up film id would otherwise start a
  // fresh per-film budget. The kit-wide cap covers every film together.
  if (!fs.existsSync(path.join(root, 'src', 'films', opts.film, 'film.ts'))) {
    refusals.push({ reason: 'unknown-film', message: `there is no film ${opts.film} in this kit (src/films/${opts.film}/film.ts does not exist). Make it first: npm run new-film -- ${opts.film}` });
  }
  const budget = Number(env.FILM_GEN_BUDGET_USD);
  const totalCap = Number(env.FILM_GEN_BUDGET_TOTAL_USD);
  const ledgerFile = ledgerPath(root, opts.film);
  const summary = summarise(ledgerFile);
  const kit = summariseKit(root);
  refusals.push(...budgetRefusals(est, summary.spent, budget, kit.spent, totalCap, opts.film));
  if (kit.unknown > 0) warnings.push(`${kit.unknown} earlier job(s) in this kit have an unknown cost, so the spend so far is a lower bound`);

  const key = env[adapter.envKey];
  if (!key) refusals.push({ reason: 'key-missing', message: `${adapter.envKey} is not set. Put it in the kit's .env (git-ignored) or the environment.` });
  else if (kctx.source?.[adapter.envKey] === '.env' && !envIsGitIgnored(root)) {
    refusals.push({ reason: 'env-not-ignored', message: `${adapter.envKey} comes from .env, but the kit's .gitignore does not list .env, so the key could be committed. Add a line ".env" to .gitignore first.` });
  }

  const existing = existingOutputs(root, opts.film, opts.name);
  if (existing.length && !opts.overwrite) {
    refusals.push({ reason: 'exists', message: `public/films/${opts.film}/media already has ${existing.join(', ')}. Choose another --name, or pass --overwrite.` });
  }

  return {
    provider: opts.provider,
    model: opts.model,
    kind: opts.kind,
    film: opts.film,
    name: opts.name,
    prompt: prompt.text,
    promptFile: prompt.file,
    image,
    params,
    n,
    entry,
    estimate: est,
    budget: budget > 0 ? budget : null,
    spent: summary.spent,
    totalCap: totalCap > 0 ? totalCap : null,
    kitSpent: kit.spent,
    unknownJobs: kit.unknown,
    ledgerFile,
    refusals,
    warnings,
    adapter,
    keyPresent: Boolean(key),
    keySource: kctx.source?.[adapter.envKey] ?? null,
  };
}

// Stable identity of a request, for the MCP estimate token.
export function requestFingerprint(plan) {
  const sorted = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sorted(o[k])])) : o);
  const ident = {
    provider: plan.provider,
    model: plan.model,
    kind: plan.kind,
    film: plan.film,
    name: plan.name,
    prompt: sha256(Buffer.from(plan.prompt, 'utf8')),
    image: plan.image ? { source: plan.image.source, sha256: plan.image.sha256 } : null,
    n: { duration: plan.n.duration ?? null, resolution: plan.n.resolution ?? null, aspect: plan.n.aspect ?? null, quality: plan.n.quality ?? null, size: plan.n.size ?? null, audio: plan.n.audio, voice: plan.n.voice ?? null, seed: plan.n.seed },
    params: sorted(plan.params ?? {}),
    estimateUsd: plan.estimate.usd,
  };
  return sha256(Buffer.from(JSON.stringify(sorted(ident)), 'utf8'));
}

function adapterContext(plan, kctx, extra = {}) {
  const env = kctx.env;
  const adapter = plan.adapter;
  const baseUrl = baseUrlFor(plan.provider, env, extra.baseUrl) ?? adapter.defaultBaseUrl;
  const storageUrl = (env.FILM_GEN_FAL_STORAGE_BASE_URL || adapter.defaultStorageUrl || '').replace(/\/+$/, '');
  const timing = timingFrom(env, extra.timeoutSec);
  return {
    plan,
    root: kctx.root,
    key: env[adapter.envKey],
    secrets: kctx.secrets,
    baseUrl,
    storageUrl,
    timing,
    deadline: Date.now() + timing.jobTimeoutMs,
    signal: extra.signal,
    progress: extra.progress,
    overwrite: Boolean(extra.overwrite),
    priceEntry: plan.entry,
    dryRun: Boolean(extra.dryRun),
  };
}

export async function previewRequest(plan, kctx, extra = {}) {
  const ctx = adapterContext(plan, kctx, { ...extra, dryRun: true });
  const req = await plan.adapter.preview(ctx);
  const headerNames = Object.keys({ ...plan.adapter.authHeaders('x'), 'content-type': 'application/json' });
  return {
    method: req.method,
    url: redact(req.url, kctx.secrets),
    headers: redactHeaders(Object.fromEntries(headerNames.map((h) => [h, h === 'content-type' ? 'application/json' : '[key]']))),
    body: elideData(redactDeep(req.body, kctx.secrets)),
  };
}

function sidecarFor(plan, ctx, fetched, job) {
  const n = plan.n;
  const sidecar = {
    tool: { name: 'film-gen', version: VERSION },
    job,
    timestamp: new Date().toISOString(),
    provider: plan.provider,
    model: plan.model,
    kind: plan.kind,
    film: plan.film,
    name: plan.name,
    prompt: plan.prompt,
    promptFile: plan.promptFile,
    promptSha256: sha256(Buffer.from(plan.prompt, 'utf8')),
    parameters: {
      duration: n.duration ?? null,
      billedSeconds: n.billedSeconds ?? null,
      resolution: n.resolution ?? null,
      aspect: n.aspect ?? null,
      quality: n.quality ?? null,
      size: n.size ?? null,
      audio: n.audio,
      voice: n.voice ?? null,
      extra: plan.params,
      notes: n.notes,
    },
    request: elideData(redactDeep(ctx.sent ?? null, ctx.secrets)),
    inputs: plan.image ? [{ role: 'image', source: plan.image.source, sha256: plan.image.sha256, bytes: plan.image.size }] : [],
    seed: { requested: n.seed ?? null, returned: fetched.seedReturned ?? null },
    requestId: fetched.requestId ?? null,
    estimate: {
      usd: plan.estimate.usd,
      known: plan.estimate.known,
      approximate: plan.estimate.approximate,
      basis: plan.estimate.basis,
      priceSource: plan.estimate.source,
      priceRead: plan.estimate.read,
      recheckAfter: plan.estimate.recheckAfter,
    },
    actual: {
      usd: fetched.actualUsd ?? null,
      basis: fetched.actualBasis ?? 'the provider does not return a cost for this call',
      providerUsage: redactDeep(fetched.providerUsage ?? null, ctx.secrets),
    },
    extra: fetched.extra ?? null,
    terms: { url: plan.entry?.terms ?? plan.adapter.termsUrl, licence: plan.entry?.licence ?? null },
  };
  // Anything a provider sent back (lyrics, notes, usage) may echo a key.
  return redactDeep(sidecar, ctx.secrets);
}

// Every ledger line goes through redaction, whatever it carries.
function ledgerAppend(file, line, secrets) {
  appendLine(file, redactDeep(line, secrets));
}

// Turns whatever was thrown into a fresh error with a redacted message. The
// original is never changed (a DOMException's message cannot be set) and is
// kept as the cause.
function wrapRunError(raw, { plan, state, uncertain, aborted, secrets }) {
  const message = redact(String(raw?.message ?? raw ?? 'unknown error'), secrets);
  if (raw instanceof UsageError) return new UsageError(message);
  if (raw instanceof RefusedError) return new RefusedError(message, raw.reason);
  const ours = raw instanceof ProviderError;
  return new ProviderError({
    provider: ours ? raw.provider : plan.provider,
    kind: ours ? raw.kind : aborted ? 'aborted' : 'error',
    status: ours ? raw.status : null,
    code: ours ? raw.code : null,
    message,
    requestId: (ours ? raw.requestId : null) ?? state?.requestId ?? null,
    uncertain,
    cause: raw,
  });
}

export async function runGenerate(plan, kctx, extra = {}) {
  if (plan.refusals.length) {
    const r = plan.refusals[0];
    throw new RefusedError(plan.refusals.map((x) => x.message).join('\n'), r.reason);
  }
  const ctx = adapterContext(plan, kctx, extra);
  const job = crypto.randomUUID();
  const est = plan.estimate;
  const secrets = kctx.secrets;
  const base = { v: 1, job, film: plan.film, provider: plan.provider, model: plan.model, kind: plan.kind, name: plan.name, estimateUsd: est.usd };

  // Check both caps again under one kit-wide lock, then reserve the estimate,
  // so two runs (on one film or on several) cannot spend the same headroom.
  await withLedgerLock(kitLockPath(kctx.root), async () => {
    const film = summarise(plan.ledgerFile);
    const kit = summariseKit(kctx.root);
    const problem = budgetRefusals(est, film.spent, plan.budget, kit.spent, plan.totalCap, plan.film)[0];
    if (problem) throw new RefusedError(problem.message, problem.reason);
    ledgerAppend(plan.ledgerFile, { ...base, event: 'reserved', ts: new Date().toISOString(), spendUsd: est.usd, spendBasis: est.known ? 'estimate, reserved before sending' : 'unknown, reserved before sending' }, secrets);
  });

  let accepted = false;
  let state = null;
  try {
    state = await plan.adapter.submit(ctx);
    accepted = true;
    ctx.progress?.(`accepted${state.requestId ? `, request ${state.requestId}` : ''}`);
    state = await plan.adapter.poll(ctx, state);
    const fetched = await plan.adapter.fetch(ctx, state);
    const sidecar = sidecarFor(plan, ctx, fetched, job);
    const written = plan.adapter.write(ctx, fetched, sidecar);
    // What the provider reports as billed where it says (OpenAI usage), otherwise
    // the estimate, which was made from the same fields that were sent.
    const spendUsd = fetched.actualUsd ?? est.usd;
    const spendBasis = fetched.actualUsd != null ? 'computed from usage the provider returned' : est.known ? 'estimate (the provider returns no cost)' : 'unknown';
    ledgerAppend(plan.ledgerFile, { ...base, event: 'done', ts: new Date().toISOString(), requestId: fetched.requestId ?? null, file: written.rel, sha256: written.sha256, spendUsd, spendBasis }, secrets);
    const after = summarise(plan.ledgerFile);
    return { job, ...written, requestId: fetched.requestId ?? null, estimate: est, actualUsd: fetched.actualUsd ?? null, spendUsd, spentOnFilm: after.spent, spentInKit: summariseKit(kctx.root).spent, budget: plan.budget, totalCap: plan.totalCap, warnings: plan.warnings };
  } catch (raw) {
    // A cancel after the provider took the job does not stop the bill.
    const aborted = Boolean(ctx.signal?.aborted) || raw?.kind === 'aborted' || raw?.name === 'AbortError';
    const uncertain = Boolean(raw?.uncertain) || (accepted && aborted);
    let event;
    let spendUsd;
    let spendBasis;
    if (uncertain) {
      event = 'uncertain';
      spendUsd = est.usd;
      spendBasis = 'estimate: the outcome is unknown and may be charged';
    } else if (!accepted) {
      event = 'released';
      spendUsd = 0;
      spendBasis = 'not accepted by the provider';
    } else {
      event = 'failed';
      spendUsd = est.usd;
      spendBasis = 'estimate: failed after the provider accepted it; some providers charge for these';
    }
    const err = wrapRunError(raw, { plan, state, uncertain, aborted, secrets });
    ledgerAppend(plan.ledgerFile, { ...base, event, ts: new Date().toISOString(), requestId: err.requestId ?? null, spendUsd, spendBasis, error: { kind: err.kind ?? err.name ?? 'error', message: err.message } }, secrets);
    throw err;
  }
}

export function loadPriceTable() {
  return loadPrices();
}
