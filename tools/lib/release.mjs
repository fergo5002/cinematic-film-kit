// The release gate's bookkeeping, kept pure so it can be tested: which steps exist, how their
// results combine, and the report. A step that did not run is NOT RUN, never PASS, and a release
// with any step NOT RUN is INCOMPLETE, never PASS.
import {createHash} from 'node:crypto';
import {closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';

export const STEPS = ['typecheck', 'slop-lint', 'provenance', 'score', 'render', 'master', 'audit', 'delivery'];

export const STATUS = {PASS: 'PASS', FAIL: 'FAIL', NOT_RUN: 'NOT RUN'};

export const verdict = (steps) => {
	if (steps.some((s) => s.status === STATUS.FAIL)) return 'FAIL';
	if (steps.length < STEPS.length || steps.some((s) => s.status !== STATUS.PASS)) return 'INCOMPLETE';
	return 'PASS';
};

// Fill in every step that has no result as NOT RUN, with the reason.
export const complete = (steps, reason) => {
	const byName = new Map(steps.map((s) => [s.name, s]));
	return STEPS.map((name) => byName.get(name) ?? {name, status: STATUS.NOT_RUN, detail: reason});
};

// Delivery checks on the master. `media` is tools/lib/ffmpeg.mjs probeMedia() output, `film` is
// what the film declares (fps, frames, width, height), `head` is the file's first top-level atoms.
export const deliveryChecks = ({media, film, atoms}) => {
	const v = media.video ?? {};
	const a = media.audio ?? {};
	const checks = [];
	const c = (name, ok, actual, expected) => checks.push({name, ok: Boolean(ok), actual: String(actual), expected: String(expected)});
	c('video codec', v.codec === 'h264', v.codec ?? 'none', 'h264');
	c('pixel format', v.pixFmt === 'yuv420p', v.pixFmt ?? 'none', 'yuv420p (plays everywhere)');
	c('frame size', v.width === film.width && v.height === film.height, `${v.width}x${v.height}`, `${film.width}x${film.height}`);
	c('frame rate', Math.abs((v.fps ?? 0) - film.fps) < 0.01, Number((v.fps ?? 0).toFixed(3)), film.fps);
	c('frame count', v.frames === null || v.frames === undefined ? Math.abs(media.duration * film.fps - film.frames) <= 1 : Math.abs(v.frames - film.frames) <= 1, v.frames ?? `${(media.duration * film.fps).toFixed(1)} from duration`, film.frames);
	c('colour primaries', v.colorPrimaries === 'bt709', v.colorPrimaries ?? 'unset', 'bt709');
	c('transfer', v.colorTransfer === 'bt709', v.colorTransfer ?? 'unset', 'bt709');
	c('matrix', v.colorSpace === 'bt709', v.colorSpace ?? 'unset', 'bt709');
	c('audio codec', a.codec === 'aac', a.codec ?? 'none', 'aac');
	c('audio sample rate', a.sampleRate === 48000, a.sampleRate ?? 'none', 48000);
	c('audio channels', a.channels === 2, a.channels ?? 'none', 2);
	const moov = atoms.indexOf('moov');
	const mdat = atoms.indexOf('mdat');
	c('fast start', moov !== -1 && (mdat === -1 || moov < mdat), atoms.join(' > '), 'moov before mdat (starts playing before it has downloaded)');
	return checks;
};

const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ');

export const reportMarkdown = ({id, steps, audit, delivery, env, when}) => {
	const v = verdict(steps);
	const out = [
		`# Release report: ${id}`,
		'',
		`Verdict: **${v}**${v === 'INCOMPLETE' ? ' (at least one step did not run, so this film is not released)' : ''}`,
		'',
		`Written by \`npm run release -- ${id}\` on ${when}.`,
		'',
		'| Step | Result | Detail | Seconds |',
		'|---|---|---|---|',
		...steps.map((s) => `| ${s.name} | ${s.status} | ${cell(s.detail)} | ${s.seconds ?? ''} |`),
		'',
	];
	if (audit?.results) {
		out.push('## Audit', '', `Profile ${audit.profile}, target ${Number(Number(audit.target).toFixed(2))} s, measured on \`${cell(audit.file)}\`.`, '', '| Gate | Status | Measured | Required |', '|---|---|---|---|');
		for (const r of audit.results) out.push(`| ${cell(r.name)} | ${r.status} | ${cell(r.actual)} | ${cell(r.expected)} |`);
		out.push('');
	}
	if (delivery?.length) {
		out.push('## Delivery', '', '| Check | Result | Measured | Required |', '|---|---|---|---|');
		for (const d of delivery) out.push(`| ${d.name} | ${d.ok ? 'PASS' : 'FAIL'} | ${cell(d.actual)} | ${cell(d.expected)} |`);
		out.push('');
	}
	if (env) {
		out.push('## Machine', '');
		for (const [k, val] of Object.entries(env)) out.push(`- ${k}: ${cell(val)}`);
		out.push('');
	}
	out.push('## What this report cannot tell you', '', 'The gates measure the file. They cannot judge whether the film is clear, true or good: that is the', 'explain-back and the critic (`npm run packet`). A PASS here means every step ran and every gate held.', '');
	return out.join('\n');
};

// Generated media must say where it came from. Every file the connectors wrote into
// public/films/<id>/media/ needs its <file>.prov.json sidecar, whose output.sha256 matches the
// file as it is now, and a "done" line in that folder's ledger.jsonl naming the file and the same
// hash (connectors/lib/output.mjs and core.mjs write both). A film with no media folder passes.
export const checkProvenance = (root, id) => {
	const dir = path.join(root, 'public', 'films', id, 'media');
	if (!existsSync(dir)) return {status: 'PASS', detail: 'no generated media', problems: []};
	const done = [];
	const ledger = path.join(dir, 'ledger.jsonl');
	if (existsSync(ledger)) {
		for (const raw of readFileSync(ledger, 'utf8').split(/\r?\n/)) {
			if (!raw.trim()) continue;
			try {
				const line = JSON.parse(raw);
				if (line.event === 'done') done.push(line);
			} catch {
				// a torn line cannot vouch for anything
			}
		}
	}
	const problems = [];
	const media = readdirSync(dir).filter((f) => statSync(path.join(dir, f)).isFile() && !/^ledger\.jsonl(\.lock)?$|\.prov\.json$|\.part$/.test(f)).sort();
	for (const f of media) {
		const rel = `public/films/${id}/media/${f}`;
		const hash = createHash('sha256').update(readFileSync(path.join(dir, f))).digest('hex');
		const sidecar = path.join(dir, `${f}.prov.json`);
		if (!existsSync(sidecar)) problems.push(`${rel} has no ${f}.prov.json`);
		else {
			let prov = null;
			try {
				prov = JSON.parse(readFileSync(sidecar, 'utf8'));
			} catch {
				problems.push(`${rel}: ${f}.prov.json is not valid JSON`);
			}
			if (prov && prov.output?.sha256 !== hash) problems.push(`${rel} has changed since it was generated (its sidecar records a different sha256)`);
		}
		if (!done.some((l) => l.file === rel && l.sha256 === hash)) problems.push(`${rel} has no "done" line with its sha256 in ledger.jsonl`);
	}
	return problems.length
		? {status: 'FAIL', detail: problems.slice(0, 3).join('; ') + (problems.length > 3 ? ` (and ${problems.length - 3} more)` : ''), problems}
		: {status: 'PASS', detail: `${media.length} generated file${media.length === 1 ? '' : 's'}, each with a matching sidecar and ledger line`, problems};
};

// The top-level atoms of an MP4, in order, reading only each atom's 16-byte header.
export const topLevelAtoms = (file, limit = 12) => {
	const fd = openSync(file, 'r');
	const atoms = [];
	try {
		const size = fstatSync(fd).size;
		const head = Buffer.alloc(16);
		let off = 0;
		while (off + 8 <= size && atoms.length < limit) {
			readSync(fd, head, 0, 16, off);
			let len = head.readUInt32BE(0);
			const type = head.toString('latin1', 4, 8);
			if (len === 1) len = Number(head.readBigUInt64BE(8));
			if (!/^[a-z0-9 ]{4}$/i.test(type) || (len < 8 && len !== 0)) break;
			atoms.push(type.trim());
			if (len === 0) break; // runs to the end of the file
			off += len;
		}
	} finally {
		closeSync(fd);
	}
	return atoms;
};
