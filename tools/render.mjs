#!/usr/bin/env node
// Render a film with the --gl backend the doctor chose for this machine.
//
//   npm run render -- <id>    full quality to out/<id>/raw.mp4: H.264 CRF 12, x264 slow, PNG
//                             frames, BT.709, AAC 320k (the master re-encodes the audio later)
//   npm run preview -- <id>   half scale, CRF 28, ultrafast, JPEG frames to out/<id>/preview.mp4
//
// Flags: --gl <backend> (else FILM_GL, else film.local.json, else the platform default),
//        --concurrency <n>, --frames <from>-<to> (a range, for checking one passage; it goes to
//        out/<id>/raw-frames-<from>-<to>.mp4 or preview-frames-<from>-<to>.mp4, never over the
//        film's own render, so a fragment can never be mastered or audited as the film).
import {existsSync, mkdirSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {UsageError, filmDir, filmPublicDir, fmtBytes, main, outputs, parseArgs, rel, requireFilm} from './lib/kit.mjs';
import {bundleEntry, chromiumOptionsFor, filmPublic, glFor, loadRemotion, openKitBrowser, selectFilm, shortError, writeFilmEntry} from './lib/remotion.mjs';

const RENDER_SETTINGS = {
	full: {codec: 'h264', crf: 12, x264Preset: 'slow', colorSpace: 'bt709', imageFormat: 'png', pixelFormat: 'yuv420p', audioCodec: 'aac', audioBitrate: '320k', scale: 1},
	preview: {codec: 'h264', crf: 28, x264Preset: 'ultrafast', colorSpace: 'bt709', imageFormat: 'jpeg', jpegQuality: 80, pixelFormat: 'yuv420p', audioCodec: 'aac', audioBitrate: '192k', scale: 0.5},
};

// A film that has a score.mjs needs its score.wav before it renders, and a stale one lies.
const checkScore = (id) => {
	const script = path.join(filmDir(id), 'score.mjs');
	if (!existsSync(script)) return null;
	const wav = path.join(filmPublicDir(id), 'score.wav');
	if (!existsSync(wav)) return {fatal: `public/films/${id}/score.wav is missing. Run: npm run score -- ${id}`};
	const newest = Math.max(...['score.mjs', 'beatmap.ts'].map((f) => path.join(filmDir(id), f)).filter(existsSync).map((f) => statSync(f).mtimeMs));
	if (statSync(wav).mtimeMs < newest) return {warn: `public/films/${id}/score.wav is older than score.mjs or beatmap.ts. Run: npm run score -- ${id}`};
	return null;
};

const parseFrames = (s) => {
	const m = String(s).match(/^(\d+)-(\d+)$/);
	if (!m) throw new UsageError('--frames takes a range like 90-180');
	return [Number(m[1]), Number(m[2])];
};

main(async () => {
	const {positional, flags} = parseArgs(process.argv.slice(2), {booleans: ['preview']});
	const id = requireFilm(positional[0]);
	const mode = flags.preview ? 'preview' : 'full';
	const s = RENDER_SETTINGS[mode];
	const out = outputs(id);
	const frameRange = flags.frames ? parseFrames(flags.frames) : null;
	const target = frameRange
		? path.join(out.dir, `${mode === 'preview' ? 'preview' : 'raw'}-frames-${frameRange[0]}-${frameRange[1]}.mp4`)
		: mode === 'preview'
			? out.preview
			: out.raw;
	mkdirSync(out.dir, {recursive: true});

	const score = checkScore(id);
	if (score?.fatal) throw new UsageError(score.fatal);
	if (score?.warn) console.warn(`warning: ${score.warn}`);

	const {gl, source} = glFor(flags);
	const {bundle, renderer} = await loadRemotion();
	console.log(`${mode === 'preview' ? 'preview' : 'render'} ${id} with --gl=${gl} (${source})`);

	const serveUrl = await bundleEntry(bundle, writeFilmEntry(id), {publicDir: filmPublic(id)});
	const browser = await openKitBrowser(renderer, gl);
	const t0 = Date.now();
	let composition;
	try {
		composition = await selectFilm(renderer, {serveUrl, id, browser, gl});
		if (frameRange && (frameRange[0] > frameRange[1] || frameRange[1] >= composition.durationInFrames)) {
			throw new UsageError(`--frames ${flags.frames} is outside ${id} (frames 0 to ${composition.durationInFrames - 1})`);
		}
		const total = frameRange ? frameRange[1] - frameRange[0] + 1 : composition.durationInFrames;
		let lastTenth = -1;
		await renderer.renderMedia({
			composition,
			serveUrl,
			// renderMedia takes outputLocation (renderStill takes output). A wrong key is ignored
			// silently and the film renders into memory and vanishes.
			outputLocation: target,
			puppeteerInstance: browser,
			chromiumOptions: chromiumOptionsFor(gl),
			codec: s.codec,
			crf: s.crf,
			x264Preset: s.x264Preset,
			colorSpace: s.colorSpace,
			imageFormat: s.imageFormat,
			...(s.jpegQuality ? {jpegQuality: s.jpegQuality} : {}),
			pixelFormat: s.pixelFormat,
			audioCodec: s.audioCodec,
			audioBitrate: s.audioBitrate,
			scale: s.scale,
			frameRange,
			overwrite: true,
			logLevel: 'error',
			...(flags.concurrency ? {concurrency: Number(flags.concurrency)} : {}),
			onProgress: ({renderedFrames}) => {
				const tenth = Math.floor((renderedFrames / total) * 10);
				if (tenth > lastTenth) {
					lastTenth = tenth;
					process.stdout.write(`${tenth * 10}% `);
				}
			},
		});
		process.stdout.write('\n');
		const ms = Date.now() - t0;
		const size = statSync(target).size;
		const record = {
			film: id,
			mode,
			output: rel(target),
			gl,
			glSource: source,
			frames: total,
			fps: composition.fps,
			width: Math.round(composition.width * s.scale),
			height: Math.round(composition.height * s.scale),
			settings: s,
			seconds: +(ms / 1000).toFixed(1),
			msPerFrame: Math.round(ms / total),
			bytes: size,
		};
		if (mode === 'full' && !frameRange) writeFileSync(out.renderLog, JSON.stringify(record, null, 2));
		console.log(`${rel(target)}: ${total} frames in ${record.seconds} s (${record.msPerFrame} ms per frame), ${fmtBytes(size)}`);
	} catch (err) {
		if (err instanceof UsageError) throw err;
		console.error(`render failed: ${shortError(err, 6)}`);
		if (/WebGL|webgl|context lost|GPU/i.test(String(err?.message))) console.error(`The --gl backend (${gl}) may not work here. Run: npm run doctor`);
		return 1;
	} finally {
		await browser.close({silent: true});
	}
	return 0;
});
