#!/usr/bin/env node
// film-gen: the only door to paid generation in this kit. Estimate first, then
// generate inside a budget, with a provenance sidecar and a ledger line for
// every file. No packages: Node 22.18+ and its built-in fetch.
//
//   node connectors/film-gen.mjs help

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ADAPTERS, VERSION, kitContext, listModels, makePlan, previewRequest, runGenerate } from './lib/core.mjs';
import { CONNECTORS_DIR, PROVIDER_KEYS, baseUrlFor, envIsGitIgnored, nodeVersionOk, safeOrigin } from './lib/env.mjs';
import { EXIT, ProviderError, RefusedError, UsageError, hintFor } from './lib/errors.mjs';
import { ledgerPath, summarise } from './lib/ledger.mjs';
import { installMcp, AGENTS } from './lib/mcp-install.mjs';
import { formatUsd, loadPrices, today } from './lib/prices.mjs';
import { redact, secretsFrom } from './lib/redact.mjs';

const OPTIONS = {
  kind: { type: 'string' },
  provider: { type: 'string' },
  model: { type: 'string' },
  'prompt-file': { type: 'string' },
  film: { type: 'string' },
  name: { type: 'string' },
  image: { type: 'string' },
  duration: { type: 'string' },
  aspect: { type: 'string' },
  seed: { type: 'string' },
  voice: { type: 'string' },
  resolution: { type: 'string' },
  quality: { type: 'string' },
  audio: { type: 'boolean' },
  param: { type: 'string', multiple: true },
  'dry-run': { type: 'boolean' },
  'base-url': { type: 'string' },
  'accept-unknown-price': { type: 'boolean' },
  'accept-licence': { type: 'boolean' },
  overwrite: { type: 'boolean' },
  timeout: { type: 'string' },
  json: { type: 'boolean' },
  agent: { type: 'string' },
  print: { type: 'boolean' },
  root: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
};

const HELP = `film-gen ${VERSION}: paid generation for the film kit, inside a budget.

Commands
  estimate     price a request and show what would stop it (spends nothing)
  generate     run a request: estimate, budget check, call, file, sidecar, ledger
  ledger       show spend per job (--film <id>, or every film)
  models       list the models this kit knows (--provider, --kind)
  doctor       which keys are set (never their values), budget, .env, MCP SDK
  mcp-install  write the MCP config for --agent claude|codex|cursor|gemini|vscode|opencode

Request options (estimate and generate)
  --kind image|video|sfx|music|speech   --provider fal|replicate|elevenlabs|openai|google
  --model <id>   --prompt-file <path>   --film <id>   --name <stem>
  --image <path|url>   --duration <s>   --aspect <w:h>   --resolution <r>   --quality <q>
  --audio (ask a video model for sound)   --seed <n>   --voice <id>   --param key=value (repeatable)

Generate only
  --dry-run   --base-url <url>   --accept-unknown-price   --accept-licence   --overwrite   --timeout <s>

Every command takes --json and --root <kit root>. Keys come from the environment or the kit's .env.
A paid call needs FILM_GEN_BUDGET_USD above zero and refuses to pass it.
Exit codes: 0 done, 1 usage, 2 refused, 3 provider error, 4 outcome uncertain (may be charged).`;

function parseNumber(v, flag) {
  if (v == null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new UsageError(`${flag} must be a number`);
  return n;
}

function parseParams(list) {
  const out = {};
  for (const p of list ?? []) {
    const i = p.indexOf('=');
    if (i <= 0) throw new UsageError(`--param must look like key=value (got ${p})`);
    const k = p.slice(0, i);
    const raw = p.slice(i + 1);
    let v = raw;
    try {
      v = JSON.parse(raw);
    } catch {
      v = raw;
    }
    out[k] = v;
  }
  return out;
}

function requestOptions(values) {
  const seed = values.seed == null ? undefined : parseNumber(values.seed, '--seed');
  return {
    kind: values.kind,
    provider: values.provider,
    model: values.model,
    promptFile: values['prompt-file'],
    film: values.film,
    name: values.name,
    image: values.image,
    duration: parseNumber(values.duration, '--duration'),
    aspect: values.aspect,
    seed,
    voice: values.voice,
    resolution: values.resolution,
    quality: values.quality,
    audio: Boolean(values.audio),
    params: parseParams(values.param),
    acceptUnknownPrice: Boolean(values['accept-unknown-price']),
    acceptLicence: Boolean(values['accept-licence']),
    overwrite: Boolean(values.overwrite),
  };
}

function describeOptions(n) {
  const bits = [];
  if (n.resolution) bits.push(n.resolution);
  if (n.quality) bits.push(`quality ${n.quality}`);
  if (n.size) bits.push(n.size);
  if (n.duration != null) bits.push(`${n.duration} s`);
  if (n.aspect) bits.push(n.aspect);
  if (n.voice) bits.push(`voice ${n.voice}`);
  bits.push(n.audio ? 'audio on' : 'no audio');
  if (n.seed != null) bits.push(`seed ${n.seed}`);
  return bits.join(', ');
}

function planSummary(plan) {
  const e = plan.estimate;
  return {
    provider: plan.provider,
    model: plan.model,
    kind: plan.kind,
    film: plan.film,
    name: plan.name,
    options: describeOptions(plan.n),
    estimate: {
      usd: e.usd,
      known: e.known,
      approximate: e.approximate,
      basis: e.basis,
      source: e.source,
      read: e.read,
      recheckAfter: e.recheckAfter,
      recheckDue: e.recheckDue,
      retires: e.retires,
    },
    budget: plan.budget,
    spentOnFilm: plan.spent,
    headroom: plan.budget != null ? Math.round((plan.budget - plan.spent) * 1e6) / 1e6 : null,
    budgetTotal: plan.totalCap,
    spentInKit: plan.kitSpent,
    key: { name: plan.adapter.envKey, set: plan.keyPresent, source: plan.keySource },
    licence: plan.entry?.licence ?? null,
    refusals: plan.refusals,
    warnings: plan.warnings,
  };
}

function printPlan(out, s, label) {
  const e = s.estimate;
  const lines = [
    `${label}  ${s.provider}  ${s.model}  (${s.kind})`,
    `  options    ${s.options}`,
    `  estimate   ${e.known ? `${formatUsd(e.usd)}${e.approximate ? ', approximate' : ''}` : 'unknown'}`,
    `  basis      ${e.basis || 'n/a'}`,
    `  price      read ${e.read ?? 'n/a'} from ${e.source ?? 'n/a'}${e.recheckAfter ? `; re-check after ${e.recheckAfter}${e.recheckDue ? ' (due now)' : ''}` : ''}${e.retires ? `; shuts down ${e.retires}` : ''}`,
    `  budget     ${s.budget != null ? `${formatUsd(s.budget)} for ${s.film}, spent so far ${formatUsd(s.spentOnFilm)}` : 'FILM_GEN_BUDGET_USD not set'}; ${s.budgetTotal != null ? `${formatUsd(s.budgetTotal)} across the kit, spent so far ${formatUsd(s.spentInKit)}` : 'FILM_GEN_BUDGET_TOTAL_USD not set'}`,
    `  key        ${s.key.name} ${s.key.set ? `set (${s.key.source ?? 'environment'})` : 'not set'}`,
  ];
  if (s.licence) lines.push(`  licence    ${s.licence.commercial}${s.licence.gate ? ', needs --accept-licence' : ''}: ${s.licence.note}`);
  for (const w of s.warnings) lines.push(`  note       ${w}`);
  if (s.refusals.length) {
    for (const r of s.refusals) lines.push(`  refuse     ${r.message}`);
  } else {
    lines.push('  ready      nothing stops this request');
  }
  out(lines.join('\n'));
}

async function cmdEstimate(values, io, kctx, prices) {
  const plan = makePlan(requestOptions(values), kctx, prices, { cwd: io.cwd });
  const s = planSummary(plan);
  if (values.json) io.out(JSON.stringify(s, null, 2));
  else printPlan(io.out, s, 'estimate');
  return EXIT.OK;
}

async function cmdGenerate(values, io, kctx, prices) {
  const opts = requestOptions(values);
  const plan = makePlan(opts, kctx, prices, { cwd: io.cwd });
  const baseUrl = values['base-url'];
  const timeoutSec = parseNumber(values.timeout, '--timeout');
  if (values['dry-run']) {
    const req = await previewRequest(plan, kctx, { baseUrl, timeoutSec });
    const s = planSummary(plan);
    if (values.json) io.out(JSON.stringify({ dryRun: true, ...s, request: req }, null, 2));
    else {
      printPlan(io.out, s, 'dry run');
      io.out(`  request    ${req.method} ${req.url}\n  headers    ${Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('; ')}\n  body       ${JSON.stringify(req.body)}`);
      io.out('  nothing was sent and nothing was written');
    }
    return plan.refusals.length ? EXIT.REFUSED : EXIT.OK;
  }
  if (plan.refusals.length) {
    const s = planSummary(plan);
    if (values.json) io.out(JSON.stringify({ refused: true, ...s }, null, 2));
    throw new RefusedError(plan.refusals.map((r) => r.message).join('\n'), plan.refusals[0].reason);
  }
  if (!values.json) {
    io.err(`generate  ${plan.provider}  ${plan.model}: ${describeOptions(plan.n)}; estimate ${formatUsd(plan.estimate.usd)}${plan.estimate.known ? '' : ' (unknown price accepted)'}`);
    const lic = plan.entry?.licence;
    if (lic && lic.commercial !== 'allowed') io.err(`  licence ${lic.commercial}: ${lic.note}`);
    for (const w of plan.warnings) io.err(`  note ${w}`);
  }
  const result = await runGenerate(plan, kctx, {
    baseUrl,
    timeoutSec,
    overwrite: opts.overwrite,
    progress: values.json ? null : (m) => io.err(`  ${m}`),
  });
  if (values.json) {
    io.out(JSON.stringify({ ok: true, file: result.rel, sidecar: result.sidecarRel, sha256: result.sha256, bytes: result.bytes, requestId: result.requestId, estimateUsd: result.estimate.usd, actualUsd: result.actualUsd, spendUsd: result.spendUsd, spentOnFilm: result.spentOnFilm, budget: result.budget, spentInKit: result.spentInKit, budgetTotal: result.totalCap, renamed: result.renamed }, null, 2));
  } else {
    io.out([
      `done  ${result.rel}  (${result.bytes} bytes, sha256 ${result.sha256.slice(0, 16)}...)`,
      `  sidecar    ${result.sidecarRel}`,
      `  request    ${result.requestId ?? 'n/a'}`,
      `  cost       estimate ${formatUsd(result.estimate.usd)}; actual ${result.actualUsd != null ? `${formatUsd(result.actualUsd)} (computed from returned usage)` : 'not returned by the provider'}`,
      `  ledger     ${formatUsd(result.spentOnFilm)} spent on ${plan.film} of ${formatUsd(result.budget)}; ${formatUsd(result.spentInKit)} across the kit of ${formatUsd(result.totalCap)}`,
      ...(result.renamed ? ['  note       the stem was taken while this ran, so the file got a numbered name'] : []),
    ].join('\n'));
  }
  return EXIT.OK;
}

function cmdLedger(values, io, kctx) {
  const films = [];
  if (values.film) films.push(values.film);
  else {
    const dir = path.join(kctx.root, 'public', 'films');
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (fs.existsSync(ledgerPath(kctx.root, f))) films.push(f);
  }
  const report = films.map((film) => {
    const file = ledgerPath(kctx.root, film);
    const s = summarise(file);
    return { film, ledger: path.relative(kctx.root, file).split(path.sep).join('/'), spentUsd: s.spent, unknownCostJobs: s.unknown, openJobs: s.open, unreadableLines: s.bad, jobs: s.jobs };
  });
  const total = Math.round(report.reduce((a, r) => a + r.spentUsd, 0) * 1e6) / 1e6;
  if (values.json) {
    io.out(JSON.stringify({ films: report, totalUsd: total }, null, 2));
    return EXIT.OK;
  }
  if (!report.length) {
    io.out('no ledger yet: nothing has been generated');
    return EXIT.OK;
  }
  const lines = [];
  for (const r of report) {
    lines.push(`${r.film}: ${formatUsd(r.spentUsd)} over ${r.jobs.length} job(s)${r.unknownCostJobs ? `, ${r.unknownCostJobs} at unknown cost` : ''}${r.openJobs ? `, ${r.openJobs} still reserved` : ''}  (${r.ledger})`);
    for (const j of r.jobs) {
      lines.push(`  ${String(j.ts ?? '').slice(0, 19)}  ${String(j.event).padEnd(9)} ${j.provider}/${j.model}  ${j.file ?? j.name ?? ''}  ${j.spendUsd == null ? 'unknown' : formatUsd(j.spendUsd)}  ${j.spendBasis ?? ''}`);
    }
  }
  lines.push(`total ${formatUsd(total)}`);
  io.out(lines.join('\n'));
  return EXIT.OK;
}

function cmdModels(values, io, prices, env) {
  const rows = listModels(prices, { provider: values.provider, kind: values.kind });
  const t = today(env);
  const out = rows.map((r) => ({
    provider: r.provider,
    model: r.model,
    kinds: r.kinds,
    price: r.price?.price ?? { type: 'unknown' },
    read: r.price?.read ?? null,
    recheckAfter: r.price?.recheckAfter ?? null,
    recheckDue: Boolean(r.price?.recheckAfter && t > r.price.recheckAfter),
    retires: r.price?.retires ?? null,
    retired: Boolean(r.price?.retires && t >= r.price.retires),
    licence: r.price?.licence?.commercial ?? 'unverified',
    licenceGate: Boolean(r.price?.licence?.gate),
  }));
  if (values.json) {
    io.out(JSON.stringify(out, null, 2));
    return EXIT.OK;
  }
  const fmtPrice = (p) => {
    const v = (x) => (typeof x === 'number' ? formatUsd(x) : x && typeof x === 'object' ? Object.entries(x).map(([k, y]) => `${k} ${formatUsd(y)}`).join(', ') : '?');
    switch (p.type) {
      case 'per_second': return `${v(p.usd)} per s${p.audioUsd != null ? `; with audio ${v(p.audioUsd)}` : ''}`;
      case 'per_image': return p.table ? 'per image by quality and size' : `${v(p.usd)} per image`;
      case 'per_call': return `${v(p.usd)} per call`;
      case 'per_minute': return `${v(p.usd)} per min${p.roundUp ? ' (rounded up)' : ''}`;
      case 'per_1k_chars': return `${v(p.usd)} per 1k chars`;
      case 'per_second_speech': return `${v(p.usd)} per s of speech`;
      default: return 'unknown';
    }
  };
  io.out(out.map((r) => `${r.provider.padEnd(10)} ${r.model.padEnd(46)} ${r.kinds.join('/').padEnd(9)} ${fmtPrice(r.price)}  [read ${r.read}${r.retired ? `, SHUT DOWN ${r.retires}` : r.retires ? `, shuts ${r.retires}` : ''}${r.recheckDue ? ', re-check due' : ''}${r.licenceGate ? ', licence gate' : ''}]`).join('\n'));
  return EXIT.OK;
}

function cmdDoctor(values, io, kctx, prices) {
  const env = kctx.env;
  const t = today(env);
  const keys = Object.entries(PROVIDER_KEYS).map(([provider, name]) => ({ provider, name, set: Boolean(env[name]), source: env[name] ? kctx.source[name] ?? 'environment' : null }));
  const budget = Number(env.FILM_GEN_BUDGET_USD);
  const total = Number(env.FILM_GEN_BUDGET_TOTAL_USD);
  const overrides = Object.keys(ADAPTERS)
    .map((p) => [p, baseUrlFor(p, env)])
    .filter(([, u]) => u)
    .map(([p, u]) => ({ provider: p, url: safeOrigin(u) }));
  const sdkPkg = path.join(CONNECTORS_DIR, 'node_modules', '@modelcontextprotocol', 'sdk', 'package.json');
  const sdk = fs.existsSync(sdkPkg) ? JSON.parse(fs.readFileSync(sdkPkg, 'utf8')).version : null;
  const recheck = prices.models.filter((m) => m.recheckAfter && t > m.recheckAfter).map((m) => `${m.provider}/${m.model}`);
  const retired = prices.models.filter((m) => m.retires && t >= m.retires).map((m) => `${m.provider}/${m.model}`);
  const report = {
    node: { version: process.versions.node, ok: nodeVersionOk() },
    root: kctx.root,
    envFile: { found: Boolean(kctx.envFile), gitIgnored: envIsGitIgnored(kctx.root) },
    keys,
    budget: { set: budget > 0, usd: budget > 0 ? budget : null, source: kctx.source.FILM_GEN_BUDGET_USD ?? null },
    budgetTotal: { set: total > 0, usd: total > 0 ? total : null, source: kctx.source.FILM_GEN_BUDGET_TOTAL_USD ?? null },
    baseUrlOverrides: overrides,
    prices: { updated: prices.updated, entries: prices.models.length, recheckDue: recheck, retired },
    mcpSdk: sdk,
  };
  if (values.json) {
    io.out(JSON.stringify(report, null, 2));
    return EXIT.OK;
  }
  const lines = [
    `node       ${report.node.version} ${report.node.ok ? 'ok' : 'TOO OLD: needs 22.18 or later'}`,
    `kit root   ${report.root}`,
    `.env       ${report.envFile.found ? 'found' : 'not found (keys only from the environment)'}; ${report.envFile.gitIgnored ? 'listed in .gitignore' : 'NOT listed in .gitignore: add a line ".env" before you put keys in it'}`,
    ...keys.map((k) => `key        ${k.name.padEnd(20)} ${k.set ? `set (${k.source})` : 'not set'}`),
    `budget     ${report.budget.set ? `FILM_GEN_BUDGET_USD = ${report.budget.usd} (${report.budget.source})` : 'FILM_GEN_BUDGET_USD not set: every paid call will be refused'}`,
    `total cap  ${report.budgetTotal.set ? `FILM_GEN_BUDGET_TOTAL_USD = ${report.budgetTotal.usd} (${report.budgetTotal.source})` : 'FILM_GEN_BUDGET_TOTAL_USD not set: every paid call will be refused'}`,
    `base URLs  ${overrides.length ? overrides.map((o) => `${o.provider} -> ${o.url}`).join('; ') : 'none overridden'}`,
    `prices     prices.json updated ${prices.updated}, ${prices.models.length} entries; re-check due: ${recheck.length ? recheck.join(', ') : 'none'}; shut down: ${retired.length ? retired.join(', ') : 'none'}`,
    `MCP SDK    ${sdk ? `installed (${sdk})` : 'not installed: run npm install inside connectors/ to use the MCP server'}`,
  ];
  io.out(lines.join('\n'));
  return EXIT.OK;
}

function cmdMcpInstall(values, io, kctx) {
  if (!values.agent || !AGENTS.includes(values.agent)) throw new UsageError(`--agent must be one of ${AGENTS.join(', ')}`);
  const r = installMcp({ agent: values.agent, root: kctx.root, print: Boolean(values.print) });
  if (values.json) io.out(JSON.stringify(r, null, 2));
  else {
    io.out(r.written ? `wrote ${r.file}` : `config for ${values.agent} (${r.file}), not written:`);
    if (!r.written) io.out(r.snippet);
    for (const n of r.notes) io.out(`  note ${n}`);
  }
  return r.written || values.print ? EXIT.OK : EXIT.REFUSED;
}

export async function main(argv, io0 = {}) {
  const io = {
    env: io0.env ?? process.env,
    cwd: io0.cwd ?? process.cwd(),
    out: io0.out ?? ((s) => process.stdout.write(`${s}\n`)),
    err: io0.err ?? ((s) => process.stderr.write(`${s}\n`)),
  };
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true }));
  } catch (e) {
    io.err(`film-gen: ${e.message}\n\n${HELP}`);
    return EXIT.USAGE;
  }
  const cmd = positionals[0] ?? 'help';
  if (values.help || cmd === 'help') {
    io.out(HELP);
    return EXIT.OK;
  }
  const kctx = kitContext(io.env, values.root);
  try {
    const prices = loadPrices();
    switch (cmd) {
      case 'estimate':
        return await cmdEstimate(values, io, kctx, prices);
      case 'generate':
        return await cmdGenerate(values, io, kctx, prices);
      case 'ledger':
        return cmdLedger(values, io, kctx);
      case 'models':
        return cmdModels(values, io, prices, kctx.env);
      case 'doctor':
        return cmdDoctor(values, io, kctx, prices);
      case 'mcp-install':
        return cmdMcpInstall(values, io, kctx);
      default:
        throw new UsageError(`unknown command ${cmd}`);
    }
  } catch (e) {
    const msg = redact(e?.message ?? String(e), kctx.secrets);
    if (e instanceof UsageError) io.err(`film-gen: ${msg}`);
    else if (e instanceof RefusedError) io.err(`film-gen refused (${e.reason}):\n${msg}`);
    else if (e instanceof ProviderError) {
      io.err(`film-gen: ${e.provider} ${e.kind}${e.status ? ` (HTTP ${e.status})` : ''}: ${msg}`);
      const hint = hintFor(e.kind);
      if (hint) io.err(`  ${hint}`);
      if (e.requestId) io.err(`  request ${redact(e.requestId, kctx.secrets)}`);
      if (e.uncertain) io.err('  the job may have been accepted and charged; the ledger counts it at its estimate. Check the provider dashboard before retrying.');
    } else io.err(`film-gen: ${msg}`);
    return e?.exitCode ?? EXIT.PROVIDER;
  }
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      process.stderr.write(`film-gen: ${e?.message ?? e}\n`);
      process.exitCode = EXIT.PROVIDER;
    },
  );
}

