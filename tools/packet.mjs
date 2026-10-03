#!/usr/bin/env node
// The review packet: everything a fresh reviewer (a person, or a model that has never seen the
// film) needs to judge it cold, in out/<id>/packet/.
//
//   npm run packet -- <id>
//
//   sheet00.png, sheet01.png ...  one frame every 1.25 s, in order, each with its time and frame
//                                 number, twelve to a sheet (3 x 4)
//   waveform.png                  the whole soundtrack, so the arc of the mix is visible
//   sound-events.md               a stub YOU fill: every sound a viewer could notice, with times
//   *.md                          copies of reviews/prompts/*.md (the explain-back and the critic)
//
// It reads the master if it exists, else the raw render, else the preview (--source picks one).
import {copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {drawLabel, ff, labelFontExists, probeMedia, timeLabel} from './lib/ffmpeg.mjs';
import {ROOT, UsageError, loadBeatmap, main, outputs, parseArgs, pickRendered, rel, requireFilm} from './lib/kit.mjs';

const STEP_SECONDS = 1.25;
const COLS = 3;
const ROWS = 4;
const CELL = 640;

const soundEventsStub = ({id, src, media, beat, audit}) => {
	const fps = media.video.fps;
	const lines = [
		`# Sound events: ${id}`,
		'',
		'Fill this in before anyone reviews the film. One row per sound a viewer could notice, in the',
		'order they happen. The critic checks every row against the picture, so write what is in the',
		'score you rendered, not what the plan said. Delete the hint rows that carry no sound.',
		'',
		`Film: \`${rel(src)}\`, ${media.duration.toFixed(2)} s at ${Number(fps.toFixed(3))} fps.`,
	];
	if (audit?.measured?.audio) {
		const a = audit.measured.audio;
		lines.push(`Loudness from \`${rel(outputs(id).audit)}\`: ${a.integratedLufs} LUFS integrated, ${a.lraLu} LU range, ${a.truePeakDbtp} dBTP true peak.`);
	}
	lines.push('', '| Time (s) | Frame | Sound | What the picture does then | In sync? |', '|---|---|---|---|---|');
	const moments = Object.entries(beat.moments)
		.flatMap(([name, f]) => (Array.isArray(f) ? f.map((x, i) => [`${name}[${i}]`, x]) : [[name, f]]))
		.filter(([, f]) => Number.isFinite(f))
		.sort((a, b) => a[1] - b[1]);
	for (const [name, f] of moments) lines.push(`| ${(f / beat.fps).toFixed(2)} | ${f} | (hint: \`M.${name}\`) |  |  |`);
	if (!moments.length) lines.push('|  |  |  |  |  |');
	lines.push('', 'The hint rows are the named moments in the film\'s beatmap.ts. A sound with no row here is a', 'sound nobody planned; say so.', '');
	return lines.join('\n');
};

main(async () => {
	const {positional, flags} = parseArgs(process.argv.slice(2));
	const id = requireFilm(positional[0]);
	const src = pickRendered(id, flags.source);
	if (!labelFontExists()) throw new UsageError('tools/fonts/CommissionerLabel.ttf is missing: the sheet labels need it.');
	const media = probeMedia(src);
	if (!media.video) throw new UsageError(`${rel(src)} has no video stream.`);
	const fps = media.video.fps;
	const beat = await loadBeatmap(id);

	const dir = outputs(id).packet;
	rmSync(dir, {recursive: true, force: true});
	mkdirSync(dir, {recursive: true});

	// Frame-exact sample points: the middle of each 1.25 s interval, as a frame index.
	const total = Math.max(1, Math.round(media.duration * fps));
	const picks = [];
	for (let k = 0; (k + 0.5) * STEP_SECONDS < media.duration; k++) picks.push(Math.min(total - 1, Math.round((k + 0.5) * STEP_SECONDS * fps)));
	const select = `select='${picks.map((n) => `eq(n\\,${n})`).join('+')}'`;
	const vf = [select, `scale=${CELL}:-2`, drawLabel(timeLabel(fps), {size: 26}), `tile=${COLS}x${ROWS}:padding=8:margin=8:color=0x101010`].join(',');
	// passthrough: without it the image muxer repeats a sheet to fill the gap in timestamps.
	const sheets = ff(['-v', 'error', '-y', '-i', src, '-vf', vf, '-fps_mode', 'passthrough', '-start_number', '0', path.join(dir, 'sheet%02d.png')]);
	if (sheets.status !== 0) {
		console.error(`ffmpeg could not make the sheets:\n${sheets.stderr.trim().split('\n').slice(-6).join('\n')}`);
		return 1;
	}
	const made = readdirSync(dir).filter((f) => /^sheet\d+\.png$/.test(f)).sort();

	let wave = 'no audio stream';
	if (media.audio) {
		const w = ff(['-v', 'error', '-y', '-i', src, '-filter_complex', 'showwavespic=s=1920x360:split_channels=1:colors=0xd8dce2|0x9aa3ad', '-frames:v', '1', path.join(dir, 'waveform.png')]);
		wave = w.status === 0 ? 'waveform.png' : `waveform failed: ${w.stderr.trim().split('\n').pop()}`;
	}

	let audit = null;
	try {
		audit = JSON.parse(readFileSync(outputs(id).audit, 'utf8'));
	} catch {
		// no audit yet: the stub simply leaves the loudness line out
	}
	writeFileSync(path.join(dir, 'sound-events.md'), soundEventsStub({id, src, media, beat, audit}));

	const promptsDir = path.join(ROOT, 'reviews', 'prompts');
	const prompts = existsSync(promptsDir) ? readdirSync(promptsDir).filter((f) => f.endsWith('.md')).sort() : [];
	for (const f of prompts) copyFileSync(path.join(promptsDir, f), path.join(dir, f));

	console.log(`${rel(dir)}/`);
	console.log(`  ${made.length} contact sheet${made.length === 1 ? '' : 's'}: ${picks.length} frames of ${path.basename(src)}, one every ${STEP_SECONDS} s`);
	console.log(`  ${wave}`);
	console.log('  sound-events.md: a stub. Fill it in before the review.');
	console.log(prompts.length ? `  prompts: ${prompts.join(', ')}` : '  warning: reviews/prompts/ has no .md files to copy');
	return made.length ? 0 : 1;
});
