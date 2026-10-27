#!/usr/bin/env node
// Local narration, optional. Kokoro-82M speaks the film's script on this machine: no account, no
// key, no network once it is set up.
//
//   npm run narrate -- --setup      install the narration packages (narration/) and fetch the
//                                   pinned model into .cache/: about 750 MB, once
//   npm run narrate -- --voices     list the voices
//   npm run narrate -- <id>         voice src/films/<id>/narration.txt
//
// Writes public/films/<id>/narration/ (narration.wav: 48 kHz, 24-bit, mono, -16 LUFS, and
// captions.srt, captions.vtt, meta.json) and src/films/<id>/data/narration.json (every word, cue
// and pause in film seconds, for the picture and the score). The voice starts at the beatmap's
// NARRATION.at frame, so narration.wav lines up with the film from frame 0.
//
// Settings: the beatmap's optional `export const NARRATION = {voice: 'af_heart', speed: 1, at: 15}`
// and these flags, which win: --voice, --speed (0.85 to 1.0: narration is never sped up), --gap
// (silence between lines without a pause mark, default 0.45 s), --tail, --timings
// auto|engine|proportional.
//
// Nothing is written unless the whole run succeeds. A narration that runs past the end of the
// film is refused: cut words or give the picture more time.
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT, UsageError, filmDir, filmPublicDir, loadBeatmap, main, outDir, parseArgs, rel, requireFilm} from './lib/kit.mjs';
import {fetchModel} from './lib/narration/model.mjs';
import {narrate} from './lib/narration/pipeline.mjs';

export const DEFAULT_VOICE = 'af_heart';
const NARRATION_DIR = path.join(ROOT, 'narration');
const SETUP = 'npm run narrate -- --setup';
// Spoken words a minute from the first word to the last, pauses included: what a viewer hears.
// Calm film narration sits around 140 to 170.
const PACE = {min: 120, max: 175};

const loadEngine = async () => {
	if (process.env.NARRATION_ENGINE) return (await import(pathToFileURL(path.resolve(process.env.NARRATION_ENGINE)).href)).loadEngine();
	if (!existsSync(path.join(NARRATION_DIR, 'node_modules', 'kokoro-js', 'package.json'))) {
		throw new UsageError(`Narration is optional and is not installed in this kit. To add it, run: ${SETUP}\n(about 750 MB, all inside this folder: 410 MB of packages in narration/node_modules and the 326 MB Kokoro-82M model in .cache/)`);
	}
	return (await import(pathToFileURL(path.join(NARRATION_DIR, 'engine.mjs')).href)).loadEngine();
};

const setup = async () => {
	if (!existsSync(path.join(NARRATION_DIR, 'package.json'))) throw new UsageError('narration/package.json is missing: this kit has no narration folder.');
	console.log('Installing the narration packages into narration/node_modules (about 410 MB)');
	const npm = spawnSync('npm ci --no-audit --no-fund', {cwd: NARRATION_DIR, stdio: 'inherit', shell: true});
	if (npm.status !== 0) throw new Error('npm ci in narration/ failed (see above)');
	console.log('Fetching the pinned Kokoro-82M model into .cache/narration (326 MB)');
	await fetchModel();
	const engine = await loadEngine();
	console.log(`Narration is ready: ${Object.keys(engine.voices).length} voices. List them with npm run narrate -- --voices`);
	return 0;
};

const num = (x, name) => {
	if (x === undefined) return undefined;
	const n = Number(x);
	if (!Number.isFinite(n)) throw new UsageError(`--${name} takes a number`);
	return n;
};

main(async () => {
	const {positional, flags} = parseArgs(process.argv.slice(2), {booleans: ['setup', 'voices']});
	if (flags.setup) return setup();
	if (flags.voices) {
		const engine = await loadEngine();
		for (const [id, d] of Object.entries(engine.voices)) console.log(`${id.padEnd(12)} ${d.language.padEnd(6)} ${String(d.gender).padEnd(7)} grade ${d.overallGrade}`);
		return 0;
	}
	const id = requireFilm(positional[0]);
	const scriptFile = path.join(filmDir(id), 'narration.txt');
	if (!existsSync(scriptFile)) throw new UsageError(`src/films/${id}/narration.txt does not exist. Write the script there first: one sentence or phrase per line, [pause 0.6] for a set silence (docs/narration.md).`);
	const beat = await loadBeatmap(id);
	const cfg = beat.module.NARRATION ?? {};
	const voice = typeof flags.voice === 'string' ? flags.voice : (cfg.voice ?? DEFAULT_VOICE);
	const at = Number(cfg.at ?? Math.round(0.2 * beat.fps));
	if (!Number.isFinite(at) || at < 0 || at >= beat.duration) throw new UsageError(`NARRATION.at in src/films/${id}/beatmap.ts must be a frame inside the film (0 to ${beat.duration - 1})`);
	const engine = await loadEngine();

	const stage = path.join(outDir(id), '.narration-tmp');
	rmSync(stage, {recursive: true, force: true});
	let r;
	try {
		r = await narrate({
			scriptText: readFileSync(scriptFile, 'utf8'),
			scriptPath: rel(scriptFile),
			voice,
			outDir: stage,
			engine,
			log: (m) => console.error(`  ${m}`),
			lead: at / beat.fps,
			speed: num(flags.speed, 'speed') ?? cfg.speed,
			gap: num(flags.gap, 'gap') ?? cfg.gap,
			tail: num(flags.tail, 'tail') ?? cfg.tail,
			timings: typeof flags.timings === 'string' ? flags.timings : cfg.timings,
		});
		const lastWord = r.words.at(-1).end;
		if (lastWord > beat.seconds - 0.3) {
			throw new Error(`the narration runs to ${lastWord.toFixed(2)} s but the film is ${beat.seconds} s long, and the last word needs to end at least 0.3 s before the end. Narration is never sped up: cut words or give the picture more time (DURATION in beatmap.ts), or start it earlier (NARRATION.at).`);
		}
	} catch (err) {
		rmSync(stage, {recursive: true, force: true});
		console.error(`narrate: ${err.message}`);
		return 1;
	}

	// Only now replace the film's narration: a failed run above leaves the old one in place.
	const pub = path.join(filmPublicDir(id), 'narration');
	rmSync(pub, {recursive: true, force: true});
	mkdirSync(path.dirname(pub), {recursive: true});
	renameSync(stage, pub);
	const data = path.join(filmDir(id), 'data', 'narration.json');
	mkdirSync(path.dirname(data), {recursive: true});
	const record = {
		version: 1,
		note: `Written by npm run narrate -- ${id} from narration.txt. Times are film seconds. Do not edit by hand.`,
		voice,
		disclosure: r.disclosure,
		duration: r.duration,
		words: r.words.map(({text, start, end, line, source}) => ({text, start, end, line, source})),
		cues: r.cues,
		pauses: r.pauses,
	};
	writeFileSync(data, `${JSON.stringify(record, null, 1)}\n`);

	const m = r.meta;
	console.log(`${rel(pub)}/narration.wav: ${m.speech.spoken_words} spoken words, from ${r.words[0].start.toFixed(2)} s to ${r.words.at(-1).end.toFixed(2)} s; the film runs ${beat.seconds} s`);
	console.log(`  voice ${voice}, speed ${m.settings.speed}; pace ${m.speech.pace_wpm} words a minute with the pauses (${m.speech.words_per_minute} within lines); made in ${m.speech.synth_seconds} s`);
	console.log(`  loudness ${m.loudness.output.I} LUFS, true peak ${m.loudness.output.TP} dBTP; word timings from ${m.timing.sources.join(', ')}`);
	const A = m.timing.anchor_check;
	if (A.anchors) console.log(`  word edges against the audio's silences: median ${A.median_abs_ms} ms, worst ${A.max_abs_ms} ms over ${A.anchors} edges`);
	if (m.speech.pace_wpm > PACE.max) console.log(`  note: ${m.speech.pace_wpm} words a minute is quick for film narration (aim for 140 to 170). Add [pause] marks or try --speed 0.9; never cut the pauses to fit.`);
	if (m.speech.pace_wpm < PACE.min) console.log(`  note: ${m.speech.pace_wpm} words a minute is slow; check the pauses are where the picture needs them.`);
	console.log(`  ${rel(data)}: ${r.words.length} written words and ${r.cues.length} caption cues for the picture and the score`);
	console.log(`  ${m.disclosure}`);
	console.log(`Next: npm run score -- ${id} (the bed ducks under the new lines), then preview. Nobody has listened to this yet: a person must, before it ships.`);
	return 0;
});
