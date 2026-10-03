#!/usr/bin/env node
// Style frames: bundle once, open one browser, render the given frames as PNG.
//
//   npm run stills -- <id> <frame> [<frame>...]    to out/<id>/stills/f0045.png and so on
//
// A frame can also be a time in seconds with an "s" ("2.5s"). Flags: --gl <backend>, --scale <n>.
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {UsageError, main, outputs, parseArgs, rel, requireFilm} from './lib/kit.mjs';
import {bundleEntry, chromiumOptionsFor, filmPublic, glFor, loadRemotion, openKitBrowser, selectFilm, shortError, writeFilmEntry} from './lib/remotion.mjs';

main(async () => {
	const {positional, flags} = parseArgs(process.argv.slice(2));
	const id = requireFilm(positional[0]);
	const asked = positional.slice(1);
	if (!asked.length) throw new UsageError(`usage: npm run stills -- ${id} <frame> [<frame>...]   (frames, or seconds like 2.5s)`);
	const out = outputs(id);
	mkdirSync(out.stills, {recursive: true});

	const {gl, source} = glFor(flags);
	const {bundle, renderer} = await loadRemotion();
	const serveUrl = await bundleEntry(bundle, writeFilmEntry(id), {publicDir: filmPublic(id)});
	const browser = await openKitBrowser(renderer, gl);
	let failed = 0;
	try {
		const composition = await selectFilm(renderer, {serveUrl, id, browser, gl});
		const frames = asked.map((a) => {
			const m = a.match(/^(\d+(?:\.\d+)?)s$/);
			const f = m ? Math.round(Number(m[1]) * composition.fps) : Number(a);
			if (!Number.isInteger(f) || f < 0 || f >= composition.durationInFrames) {
				throw new UsageError(`"${a}" is not a frame of ${id} (0 to ${composition.durationInFrames - 1} at ${composition.fps} fps)`);
			}
			return f;
		});
		console.log(`stills of ${id} with --gl=${gl} (${source})`);
		const pad = Math.max(4, String(composition.durationInFrames - 1).length);
		for (const frame of frames) {
			const file = path.join(out.stills, `f${String(frame).padStart(pad, '0')}.png`);
			const t = Date.now();
			try {
				await renderer.renderStill({
					composition,
					serveUrl,
					frame,
					output: file,
					puppeteerInstance: browser,
					chromiumOptions: chromiumOptionsFor(gl),
					imageFormat: 'png',
					scale: flags.scale ? Number(flags.scale) : 1,
					overwrite: true,
					logLevel: 'error',
				});
				console.log(`  frame ${frame} (${(frame / composition.fps).toFixed(2)} s): ${rel(file)} in ${Date.now() - t} ms`);
			} catch (err) {
				failed++;
				console.log(`  frame ${frame}: FAILED ${shortError(err)}`);
			}
		}
	} finally {
		await browser.close({silent: true});
	}
	return failed ? 1 : 0;
});
