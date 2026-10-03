#!/usr/bin/env node
// MCP server for film-gen: three tools, estimate, generate and ledger, over
// stdio. It reads the kit's .env itself, so no agent config ever holds a key.
// generate only runs with the token that estimate returned for the identical
// request, so an agent has to price a job (and can show the price) before it
// can spend anything.
//
// Needs the packages in connectors/package.json: npm install inside connectors/.

import crypto from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { VERSION, kitContext, makePlan, requestFingerprint, runGenerate } from '../lib/core.mjs';
import { ledgerPath, summarise } from '../lib/ledger.mjs';
import { formatUsd, loadPrices } from '../lib/prices.mjs';
import { redact } from '../lib/redact.mjs';
import fs from 'node:fs';
import path from 'node:path';

const kctx = kitContext(process.env);
const TOKENS = new Map();
const TTL_MS = 15 * 60 * 1000;

const request = {
  kind: z.enum(['image', 'video', 'sfx', 'music', 'speech']).describe('What to make'),
  provider: z.enum(['fal', 'replicate', 'elevenlabs', 'openai', 'google']),
  model: z.string().describe('A model id from the kit table (film-gen models)'),
  film: z.string().describe('Film id: lowercase letters, digits and hyphens'),
  name: z.string().describe('File stem for public/films/<film>/media/<name>.<ext>'),
  prompt: z.string().optional().describe('Prompt text (or give promptFile)'),
  promptFile: z.string().optional().describe('Path to a prompt file, relative to the kit root'),
  image: z.string().optional().describe('Start frame or reference: a path in the kit or an https URL'),
  duration: z.number().optional().describe('Seconds, where the model takes a duration'),
  aspect: z.string().optional(),
  resolution: z.string().optional(),
  quality: z.string().optional(),
  audio: z.boolean().optional().describe('Ask a video model for sound (off by default)'),
  seed: z.number().int().optional(),
  voice: z.string().optional(),
  params: z.record(z.string(), z.any()).optional().describe('Provider-native extra fields'),
};

function toOpts(args) {
  return {
    kind: args.kind,
    provider: args.provider,
    model: args.model,
    film: args.film,
    name: args.name,
    prompt: args.prompt,
    promptFile: args.promptFile,
    image: args.image,
    duration: args.duration,
    aspect: args.aspect,
    resolution: args.resolution,
    quality: args.quality,
    audio: Boolean(args.audio),
    seed: args.seed,
    voice: args.voice,
    params: args.params ?? {},
    acceptUnknownPrice: Boolean(args.acceptUnknownPrice),
    acceptLicence: Boolean(args.acceptLicence),
    overwrite: Boolean(args.overwrite),
  };
}

function text(s) {
  return { type: 'text', text: s };
}

function failure(e) {
  const msg = redact(e?.message ?? String(e), kctx.secrets);
  const kind = e?.reason ?? e?.kind ?? e?.name ?? 'error';
  return { isError: true, content: [text(`${kind}: ${msg}`)] };
}

function sweep() {
  const now = Date.now();
  for (const [k, v] of TOKENS) if (v.expires < now) TOKENS.delete(k);
}

const server = new McpServer(
  { name: 'film-gen', version: VERSION },
  {
    instructions:
      'Paid media generation for this film kit. Always call estimate first and tell the user the price before calling generate. ' +
      'generate needs the token from estimate for exactly the same arguments. The kit default is free, code-drawn work: only generate when the user asked for it.',
  },
);

server.registerTool(
  'estimate',
  {
    title: 'Estimate a generation',
    description: 'Prices a request from the dated table in prices.json and lists anything that would stop it (budget, missing key, unknown price, licence, shut-down model). Spends nothing. Returns a token that generate needs.',
    inputSchema: request,
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async (args) => {
    try {
      sweep();
      const plan = makePlan(toOpts(args), kctx, loadPrices(), { cwd: kctx.root });
      const token = crypto.randomBytes(16).toString('hex');
      const expires = Date.now() + TTL_MS;
      TOKENS.set(token, { fp: requestFingerprint(plan), expires });
      const e = plan.estimate;
      const summary = {
        estimateUsd: e.usd,
        priceKnown: e.known,
        approximate: e.approximate,
        basis: e.basis,
        priceSource: e.source,
        priceRead: e.read,
        recheckAfter: e.recheckAfter,
        budgetUsd: plan.budget,
        spentOnFilmUsd: plan.spent,
        budgetTotalUsd: plan.totalCap,
        spentInKitUsd: plan.kitSpent,
        keySet: plan.keyPresent,
        licence: plan.entry?.licence ?? null,
        refusals: plan.refusals.map((r) => r.message),
        warnings: plan.warnings,
        token,
        tokenExpires: new Date(expires).toISOString(),
      };
      const lines = [
        `${plan.provider} ${plan.model} (${plan.kind}): ${e.known ? formatUsd(e.usd) : 'price unknown'}${e.approximate ? ' (approximate)' : ''}. ${e.basis}`,
        `Price read ${e.read ?? 'n/a'} from ${e.source ?? 'n/a'}.`,
        `Budget ${plan.budget != null ? formatUsd(plan.budget) : 'not set'} for ${plan.film}, spent so far ${formatUsd(plan.spent)}; ${plan.totalCap != null ? formatUsd(plan.totalCap) : 'no cap set'} across the kit, spent so far ${formatUsd(plan.kitSpent)}.`,
        ...(plan.entry?.licence ? [`Licence (${plan.entry.licence.commercial}): ${plan.entry.licence.note}`] : []),
        ...plan.warnings.map((w) => `Note: ${w}`),
        ...(plan.refusals.length ? plan.refusals.map((r) => `Would refuse: ${r.message}`) : ['Nothing stops this request.']),
        `Token for generate (single use, 15 minutes): ${token}`,
      ];
      return { content: [text(lines.join('\n'))], structuredContent: summary };
    } catch (err) {
      return failure(err);
    }
  },
);

server.registerTool(
  'generate',
  {
    title: 'Generate media (paid)',
    description: 'Runs a paid generation inside the budget and writes public/films/<film>/media/<name>.<ext> with a provenance sidecar and a ledger line. Needs the token that estimate returned for identical arguments.',
    inputSchema: {
      ...request,
      token: z.string().describe('The token from estimate for these exact arguments'),
      acceptUnknownPrice: z.boolean().optional(),
      acceptLicence: z.boolean().optional(),
      overwrite: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async (args, extra) => {
    try {
      sweep();
      const held = TOKENS.get(args.token);
      if (!held) return failure(new Error('no valid token: call estimate with the same arguments first (tokens last 15 minutes and work once)'));
      const plan = makePlan(toOpts(args), kctx, loadPrices(), { cwd: kctx.root });
      if (requestFingerprint(plan) !== held.fp) {
        return failure(new Error('these arguments differ from the ones that were estimated, or the price table changed: call estimate again'));
      }
      TOKENS.delete(args.token);
      const progressToken = extra?._meta?.progressToken;
      let step = 0;
      const progress =
        progressToken !== undefined
          ? (message) => {
              step += 1;
              extra.sendNotification({ method: 'notifications/progress', params: { progressToken, progress: step, message } }).catch(() => {});
            }
          : null;
      const r = await runGenerate(plan, kctx, { progress, signal: extra?.signal, overwrite: Boolean(args.overwrite) });
      const out = {
        file: r.rel,
        sidecar: r.sidecarRel,
        sha256: r.sha256,
        bytes: r.bytes,
        requestId: r.requestId,
        estimateUsd: r.estimate.usd,
        actualUsd: r.actualUsd,
        spentOnFilmUsd: r.spentOnFilm,
        budgetUsd: r.budget,
      };
      return {
        content: [text(`Wrote ${r.rel} (${r.bytes} bytes). Sidecar ${r.sidecarRel}. Estimate ${formatUsd(r.estimate.usd)}; ${formatUsd(r.spentOnFilm)} spent on ${plan.film} of ${formatUsd(r.budget)}.`)],
        structuredContent: out,
      };
    } catch (err) {
      return failure(err);
    }
  },
);

server.registerTool(
  'ledger',
  {
    title: 'Show the spend ledger',
    description: 'Spend per job from public/films/<film>/media/ledger.jsonl, for one film or all of them.',
    inputSchema: { film: z.string().optional() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async (args) => {
    try {
      const films = [];
      if (args.film) films.push(args.film);
      else {
        const dir = path.join(kctx.root, 'public', 'films');
        if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (fs.existsSync(ledgerPath(kctx.root, f))) films.push(f);
      }
      const report = films.map((film) => {
        const s = summarise(ledgerPath(kctx.root, film));
        return {
          film,
          spentUsd: s.spent,
          unknownCostJobs: s.unknown,
          jobs: s.jobs.map((j) => ({ when: j.ts, event: j.event, provider: j.provider, model: j.model, file: j.file ?? null, spendUsd: j.spendUsd ?? null, basis: j.spendBasis ?? null })),
        };
      });
      const lines = report.length ? report.map((r) => `${r.film}: ${formatUsd(r.spentUsd)} over ${r.jobs.length} job(s)`) : ['No ledger yet: nothing has been generated.'];
      return { content: [text(lines.join('\n'))], structuredContent: { films: report } };
    } catch (err) {
      return failure(err);
    }
  },
);

await server.connect(new StdioServerTransport());
