#!/usr/bin/env node
// npm run release -- <id> [--from <step>]
//
// The gates in order: typecheck, slop-lint, provenance (generated media must carry its sidecar and
// ledger line), score, render, master, audit, delivery. The first
// failure stops the run; every later step is reported NOT RUN, never PASS. The report goes to
// out/<id>/report.md. --from <step> starts part way (for example --from master after a render you
// trust); the skipped steps are NOT RUN too, so that release reads INCOMPLETE rather than PASS.
import {spawn} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {firstLineVersion, probeMedia} from './lib/ffmpeg.mjs';
import {ROOT, UsageError, capture, filmDir, loadBeatmap, main, outputs, parseArgs, rel, requireFilm} from './lib/kit.mjs';
import {STATUS, STEPS, checkProvenance, complete, deliveryChecks, reportMarkdown, topLevelAtoms, verdict} from './lib/release.mjs';
import {glFor, writeFilmEntry} from './lib/remotion.mjs';

// Run a child, show its output live, keep the tail for the report.
const runChild = (args, label) =>
	new Promise((resolve) => {
		const child = spawn(process.execPath, args, {cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe']});
		let tail = '';
		const keep = (chunk, stream) => {
			stream.write(chunk);
			tail = (tail + chunk.toString()).slice(-4000);
		};
		child.stdout.on('data', (c) => keep(c, process.stdout));
		child.stderr.on('data', (c) => keep(c, process.stderr));
		child.on('error', (err) => resolve({code: null, tail: `${label} could not start: ${err.message}`}));
		child.on('close', (code) => resolve({code, tail}));
	});

const lastLines = (text, n = 3) =>
	text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean)
		.slice(-n)
		.join(' / ');

main(async () => {
	const {positional, flags} = parseArgs(process.argv.slice(2));
	const id = requireFilm(positional[0]);
	const from = flags.from ? String(flags.from) : STEPS[0];
	if (!STEPS.includes(from)) throw new UsageError(`--from takes one of: ${STEPS.join(', ')}`);
	const o = outputs(id);
	mkdirSync(o.dir, {recursive: true});
	const beat = await loadBeatmap(id);
	const tool = (name) => path.join(ROOT, 'tools', name);
	const steps = [];
	let audit = null;
	let delivery = null;

	const run = async (name, fn) => {
		if (STEPS.indexOf(name) < STEPS.indexOf(from)) {
			steps.push({name, status: STATUS.NOT_RUN, detail: `skipped: --from ${from}`});
			return true;
		}
		console.log(`\n=== ${name} ===`);
		const t0 = Date.now();
		const r = await fn();
		steps.push({...r, name, seconds: ((Date.now() - t0) / 1000).toFixed(1)});
		return r.status !== STATUS.FAIL;
	};

	const sequence = [
		['typecheck', async () => {
			const tsconfig = path.join(path.dirname(writeFilmEntry(id)), 'tsconfig.json');
			const tsc = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
			if (!existsSync(tsc)) return {status: STATUS.FAIL, detail: 'typescript is not installed: run npm ci'};
			const r = await runChild([tsc, '--noEmit', '-p', tsconfig], 'tsc');
			return r.code === 0 ? {status: STATUS.PASS, detail: `src/films/${id} and everything it imports`} : {status: STATUS.FAIL, detail: lastLines(r.tail, 4)};
		}],
		['slop-lint', async () => {
			const r = capture(process.execPath, [tool('slop-lint.mjs'), id, '--json']);
			let report;
			try {
				report = JSON.parse(r.stdout);
			} catch {
				return {status: STATUS.FAIL, detail: lastLines(r.all)};
			}
			for (const f of report.findings) console.log(`${f.sev.toUpperCase().padEnd(5)} ${f.rule.padEnd(24)} ${f.file}:${f.line}  ${f.msg}`);
			const {error, warn, note} = report.counts;
			console.log(`slop-lint: ${error} errors, ${warn} warnings, ${note} notes`);
			return {status: error ? STATUS.FAIL : STATUS.PASS, detail: `${error} errors, ${warn} warnings, ${note} notes`};
		}],
		['provenance', async () => {
			const r = checkProvenance(ROOT, id);
			for (const p of r.problems) console.log(`FAIL  ${p}`);
			console.log(r.detail);
			return {status: r.status === 'PASS' ? STATUS.PASS : STATUS.FAIL, detail: r.detail};
		}],
		['score', async () => {
			if (!existsSync(path.join(filmDir(id), 'score.mjs'))) return {status: STATUS.NOT_RUN, detail: 'the film has no score.mjs (its sound must come from somewhere else)'};
			const r = await runChild([tool('score.mjs'), id], 'score');
			return r.code === 0 ? {status: STATUS.PASS, detail: lastLines(r.tail, 1)} : {status: STATUS.FAIL, detail: lastLines(r.tail)};
		}],
		['render', async () => {
			const r = await runChild([tool('render.mjs'), id], 'render');
			return r.code === 0 ? {status: STATUS.PASS, detail: lastLines(r.tail, 1)} : {status: STATUS.FAIL, detail: lastLines(r.tail)};
		}],
		['master', async () => {
			const r = await runChild([tool('master.mjs'), id], 'master');
			return r.code === 0 ? {status: STATUS.PASS, detail: lastLines(r.tail, 1)} : {status: STATUS.FAIL, detail: lastLines(r.tail)};
		}],
		['audit', async () => {
			const r = await runChild([tool('film-audit.mjs'), id], 'audit');
			try {
				audit = JSON.parse(readFileSync(o.audit, 'utf8'));
			} catch {
				return {status: STATUS.FAIL, detail: `no ${rel(o.audit)}: ${lastLines(r.tail)}`};
			}
			const fails = audit.results.filter((g) => g.status === 'FAIL').map((g) => g.name);
			if (r.code === 0 && !fails.length) return {status: STATUS.PASS, detail: `${audit.counts.pass} gates passed, ${audit.counts.warn} warnings (profile ${audit.profile})`};
			return {status: STATUS.FAIL, detail: fails.length ? `failed: ${fails.join(', ')}` : lastLines(r.tail)};
		}],
		['delivery', async () => {
			if (!existsSync(o.master)) return {status: STATUS.FAIL, detail: `${rel(o.master)} is missing`};
			let size = {width: 1920, height: 1080};
			try {
				const log = JSON.parse(readFileSync(o.renderLog, 'utf8'));
				size = {width: log.width, height: log.height};
			} catch {
				// no render.json (an outside render): fall back to the standard frame
			}
			delivery = deliveryChecks({media: probeMedia(o.master), film: {fps: beat.fps, frames: beat.duration, ...size}, atoms: topLevelAtoms(o.master)});
			for (const d of delivery) console.log(`${d.ok ? ' ok ' : 'FAIL'}  ${d.name.padEnd(18)} ${d.actual}   (${d.expected})`);
			const bad = delivery.filter((d) => !d.ok).map((d) => d.name);
			return bad.length ? {status: STATUS.FAIL, detail: `failed: ${bad.join(', ')}`} : {status: STATUS.PASS, detail: `${delivery.length} checks on ${rel(o.master)}`};
		}],
	];

	let stopped = null;
	for (const [name, fn] of sequence) {
		if (!(await run(name, fn))) {
			stopped = name;
			break;
		}
	}
	const all = complete(steps, stopped ? `not run: ${stopped} failed first` : 'not run');
	if (!audit && existsSync(o.audit) && all.find((s) => s.name === 'audit').status !== STATUS.NOT_RUN) audit = JSON.parse(readFileSync(o.audit, 'utf8'));

	let renderInfo = {};
	try {
		renderInfo = JSON.parse(readFileSync(o.renderLog, 'utf8'));
	} catch {
		// no render this time
	}
	const env = {
		platform: `${process.platform} ${os.arch()}`,
		node: process.versions.node,
		ffmpeg: firstLineVersion(capture('ffmpeg', ['-hide_banner', '-version']).stdout) ?? 'not found',
		'--gl': renderInfo.gl ? `${renderInfo.gl} (${renderInfo.glSource})` : `${glFor({}).gl} (not used: no render this run)`,
		render: renderInfo.seconds ? `${renderInfo.frames} frames in ${renderInfo.seconds} s, ${renderInfo.msPerFrame} ms per frame` : 'not run',
	};
	writeFileSync(o.report, reportMarkdown({id, steps: all, audit, delivery, env, when: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'}));

	const v = verdict(all);
	console.log('\n=== release ===');
	for (const s of all) console.log(`${s.status.padEnd(8)} ${s.name.padEnd(10)} ${s.detail ?? ''}`);
	console.log(`\n${v}: ${rel(o.report)}`);
	return v === 'PASS' ? 0 : 1;
});
