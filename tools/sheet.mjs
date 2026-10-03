#!/usr/bin/env node
// A timestamped contact sheet: one frame every `step` seconds, each labelled with its time and
// frame number, tiled into one PNG. A language model cannot watch a video; it can read this.
//
//   npm run sheet -- <id> [step]     to out/<id>/sheet.png
//
// It reads the master (out/<id>/<id>.mp4), or the raw render, or the preview, whichever exists
// first; --source master|raw|preview picks one. Other flags: --cols <n>, --width <px per cell>.
// Without a step it picks one that gives at most 24 cells.
import {existsSync, mkdirSync, rmSync} from 'node:fs';
import path from 'node:path';
import {drawLabel, ff, labelFontExists, probeMedia, timeLabel} from './lib/ffmpeg.mjs';
import {UsageError, main, outputs, parseArgs, pickRendered, rel, requireFilm} from './lib/kit.mjs';

main(async () => {
	const {positional, flags} = parseArgs(process.argv.slice(2));
	const id = requireFilm(positional[0]);
	const src = pickRendered(id, flags.source);
	if (!labelFontExists()) throw new UsageError('tools/fonts/CommissionerLabel.ttf is missing: the sheet labels need it.');
	const media = probeMedia(src);
	if (!media.video) throw new UsageError(`${rel(src)} has no video stream.`);
	const {fps} = media.video;
	const cols = Math.max(1, Number(flags.cols ?? 4));
	const width = Math.max(160, Number(flags.width ?? 480));

	let step = positional[1] !== undefined ? Number(positional[1]) : Math.max(0.5, Math.ceil(media.duration / 24 / 0.25) * 0.25);
	if (!(step > 0)) throw new UsageError('step is a number of seconds, for example 0.5');
	let every = Math.max(1, Math.round(step * fps));
	let cells = Math.ceil((media.duration * fps) / every);
	if (cells > 60) {
		every = Math.ceil((media.duration * fps) / 60);
		cells = Math.ceil((media.duration * fps) / every);
		console.warn(`warning: that step gives more than 60 cells; using every ${every} frames instead`);
	}
	step = every / fps;
	const rows = Math.ceil(cells / cols);

	const out = outputs(id);
	mkdirSync(out.dir, {recursive: true});
	if (existsSync(out.sheet)) rmSync(out.sheet);
	const vf = [`select='not(mod(n\\,${every}))'`, `scale=${width}:-2`, drawLabel(timeLabel(fps), {size: Math.round(width / 22)}), `tile=${cols}x${rows}:padding=8:margin=8:color=0x101010`].join(',');
	const r = ff(['-v', 'error', '-y', '-i', src, '-vf', vf, '-frames:v', '1', '-update', '1', out.sheet]);
	if (r.status !== 0 || !existsSync(out.sheet)) {
		console.error(`ffmpeg could not make the sheet:\n${r.stderr.trim().split('\n').slice(-6).join('\n')}`);
		return 1;
	}
	const done = probeMedia(out.sheet);
	console.log(`${rel(out.sheet)}: ${cells} frames of ${path.basename(src)}, one every ${step.toFixed(3)} s (${every} frames), ${cols} x ${rows}, ${done.video.width} x ${done.video.height} px`);
	return 0;
});
