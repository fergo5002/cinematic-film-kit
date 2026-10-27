// The narration pipeline: script -> the voice, one line at a time -> word timings -> lines trimmed
// and laid out with their pauses -> a mastered 48 kHz WAV -> captions and a record with the
// disclosure. The engine is passed in (narration/engine.mjs is Kokoro; the tests use a stand-in),
// so everything here runs on Node built-ins and ffmpeg.
//
// engine: {voices, synth(text, {voice, speed}) -> {samples, sampleRate, phonemes, durations},
//          phonemeLength(word, lang) -> number, describe() -> {engine, model, runtime},
//          samplesPerFrame (600 for Kokoro)}
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {alignWordsToGroups, phonemeGroups, proportionalTimes, refineGroupEnds, tokenSpans} from './align.mjs';
import {anchorCheck} from './anchors.mjs';
import {buildCues, toSRT, toVTT} from './captions.mjs';
import {masterVoice} from './loudness.mjs';
import {assertDisclosure, buildMeta, disclosureLine} from './meta.mjs';
import {parseScript} from './script.mjs';
import {assemble, trimSilence} from './timeline.mjs';
import {writeWavFloat} from './wav.mjs';

// The voice is mastered to -19 LUFS: it is mono, and a mono voice playing on both channels of a
// stereo film reads 3 LU louder, so it lands on the film's -16 LUFS delivery target and the master
// has nothing to turn down. (The same pairing as the common -16 stereo, -19 mono rule for speech.)
export const DEFAULTS = {gap: 0.45, lead: 0.2, tail: 0.5, speed: 1, timings: 'auto', target: -19, ceiling: -1.5};
export const SPEED = {min: 0.85, max: 1};
const FADE_S = 0.005;
const r3 = (x) => Math.round(x * 1000) / 1000;

// American voices (a*) are phonemised as en-us, British ones (b*) as en, as kokoro-js does.
export const voiceLanguage = (voice) => (voice.startsWith('b') ? 'en' : 'en-us');

// Spoken words that carry sound, each remembering which written word it belongs to.
const flatWords = (words) => {
	const flat = [];
	words.forEach((w, display) => {
		for (const sw of w.spoken.split(/\s+/)) {
			const core = sw.replace(/[^\p{L}\p{N}'\u2019-]/gu, '');
			if (core) flat.push({display, word: core});
		}
	});
	return flat;
};

const fade = (x, sr) => {
	const n = Math.min(Math.round(FADE_S * sr), Math.floor(x.length / 2));
	for (let i = 0; i < n; i++) {
		x[i] *= i / n;
		x[x.length - 1 - i] *= i / n;
	}
	return x;
};

export const narrate = async ({scriptText, scriptPath = null, voice, outDir, engine, log = () => {}, ...opts}) => {
	const o = {...DEFAULTS, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined))};
	if (!voice) throw new Error('a voice is required, for example --voice bf_emma');
	if (o.speed > SPEED.max) throw new Error(`speed ${o.speed} refused: narration is never sped up. If the script is too long for the picture, cut words or give the picture more time.`);
	if (!(o.speed >= SPEED.min)) throw new Error(`speed ${o.speed} refused: use ${SPEED.min} to 1.0`);
	if (!['auto', 'engine', 'proportional'].includes(o.timings)) throw new Error('--timings is auto, engine or proportional');
	if (!engine.voices[voice]) throw new Error(`unknown voice "${voice}"; one of: ${Object.keys(engine.voices).join(', ')}`);
	const script = parseScript(scriptText, {warn: log});
	if (!script.items.some((i) => i.type === 'speech')) throw new Error('the script has no speech in it');
	const lang = voiceLanguage(voice);
	const lengthCache = new Map();
	const expectedLength = async (word) => {
		const key = word.toLowerCase();
		if (!lengthCache.has(key)) lengthCache.set(key, await engine.phonemeLength(word, lang));
		return lengthCache.get(key);
	};

	// 1. voice each line, take its word timings, trim it to its speech
	let synthMs = 0;
	let rawSeconds = 0;
	let SR = null;
	const seq = [];
	for (const item of script.items) {
		if (item.type === 'pause') {
			seq.push(item);
			continue;
		}
		const t0 = performance.now();
		const r = await engine.synth(item.spokenText, {voice, speed: o.speed});
		synthMs += performance.now() - t0;
		SR ??= r.sampleRate;
		if (r.sampleRate !== SR) throw new Error(`the engine changed sample rate mid-script (${SR} then ${r.sampleRate} Hz)`);
		rawSeconds += r.samples.length / SR;
		const flat = flatWords(item.words);
		const expected = [];
		for (const f of flat) expected.push({expected: await expectedLength(f.word)});
		const {start, end} = trimSilence(r.samples, SR);
		const audio = fade(r.samples.slice(start, end), SR);
		const shift = start / SR;
		const dur = audio.length / SR;
		let times = null;
		let source = 'engine';
		if (o.timings !== 'proportional' && r.durations) {
			const spans = tokenSpans(r.durations, {totalSamples: r.samples.length, sampleRate: SR, samplesPerFrame: engine.samplesPerFrame ?? 600});
			times = alignWordsToGroups(expected, refineGroupEnds(phonemeGroups(r.phonemes, spans), r.samples, SR));
			if (times) times = times.map((x) => ({start: x.start - shift, end: x.end - shift}));
		}
		if (!times) {
			if (o.timings === 'engine') throw new Error(`no engine timings for line ${item.line} ("${item.text}"), and --timings engine does not allow the proportional fallback`);
			if (o.timings === 'auto') log(`line ${item.line}: the engine's timings did not line up with the words, so they are spread over the line (proportional: fine for captions, not for cutting picture to a word)`);
			times = proportionalTimes(expected, dur);
			source = 'proportional';
		}
		const clamp = (t) => Math.min(dur, Math.max(0, t));
		const words = item.words.map((w, di) => {
			const mine = flat.map((f, i) => (f.display === di ? times[i] : null)).filter(Boolean);
			if (!mine.length) return {text: w.text, spoken: w.spoken, start: NaN, end: NaN, source: null};
			return {text: w.text, spoken: w.spoken, start: clamp(Math.min(...mine.map((m) => m.start))), end: clamp(Math.max(...mine.map((m) => m.end))), source};
		});
		seq.push({type: 'speech', line: item.line, text: item.text, spokenText: item.spokenText, duration: dur, words, audio, flat});
	}

	// 2. lay the lines out
	const tl = assemble(seq, o);
	// a written word with no sound of its own (a lone symbol) sits between its neighbours
	for (let i = 0; i < tl.words.length; i++) {
		if (Number.isFinite(tl.words[i].start)) continue;
		const next = tl.words.slice(i + 1).find((w) => Number.isFinite(w.start))?.start;
		const at = i > 0 ? tl.words[i - 1].end : (next ?? o.lead);
		Object.assign(tl.words[i], {start: at, end: at, source: 'interpolated'});
	}
	const buf = new Float32Array(Math.round(tl.duration * SR));
	for (const s of tl.segments) {
		const at = Math.round(s.offset * SR);
		buf.set(s.audio.subarray(0, Math.min(s.audio.length, buf.length - at)), at);
	}
	mkdirSync(outDir, {recursive: true});
	const stem = path.join(outDir, '.narration-stem.tmp.wav');
	writeWavFloat(stem, buf, SR);

	// 3. master the voice, then check the word timings against the silences in the file that ships
	const disclosure = disclosureLine(voice, engine.describe().model.name);
	const wavPath = path.join(outDir, 'narration.wav');
	let loudness;
	try {
		loudness = masterVoice(stem, wavPath, {target: o.target, ceiling: o.ceiling, comment: disclosure});
	} finally {
		rmSync(stem, {force: true});
	}
	const dec = spawnSync('ffmpeg', ['-v', 'error', '-i', wavPath, '-f', 'f32le', '-ac', '1', '-'], {maxBuffer: 1 << 28});
	if (dec.status !== 0) throw new Error(`could not decode ${wavPath} for the timing check`);
	const shipped = new Float32Array(dec.stdout.buffer, dec.stdout.byteOffset, dec.stdout.byteLength / 4);
	const anchors = anchorCheck(tl.words, shipped, 48000);

	// 4. words, captions, record
	const words = tl.words.map((w) => ({text: w.text, spoken: w.spoken, start: r3(w.start), end: r3(w.end), line: w.line, source: w.source}));
	const pauses = tl.pauses.map((p) => ({start: r3(p.start), end: r3(p.end), seconds: p.seconds, line: p.line}));
	const cues = buildCues(words).map((c) => ({start: r3(c.start), end: r3(c.end), lines: c.lines}));
	writeFileSync(path.join(outDir, 'captions.srt'), toSRT(cues));
	writeFileSync(path.join(outDir, 'captions.vtt'), toVTT(cues, {note: disclosure}));
	const sources = [...new Set(words.map((w) => w.source))];
	const spoken = tl.segments.reduce((a, s) => a + s.flat.length, 0);
	const speechSeconds = tl.segments.reduce((a, s) => a + s.duration, 0);
	const {engine: engineInfo, model, runtime} = engine.describe();
	const sha = createHash('sha256').update(scriptText, 'utf8').digest('hex');
	const meta = assertDisclosure(
		buildMeta({
			voice,
			engine: engineInfo,
			model,
			runtime,
			script: scriptPath ? {path: scriptPath, sha256: sha} : {sha256: sha},
			settings: {gap: o.gap, lead: o.lead, tail: o.tail, speed: o.speed, timings: o.timings, target: o.target, ceiling: o.ceiling},
			timing: {sources, anchor_check: anchors},
			speech: {
				spoken_words: spoken,
				speech_seconds: r3(speechSeconds),
				words_per_minute: Math.round((spoken / speechSeconds) * 60),
				// first word to last, pauses included: the pace a viewer hears
				pace_wpm: Math.round((spoken / (tl.words.at(-1).end - tl.words[0].start)) * 60),
				synth_seconds: r3(synthMs / 1000),
				engine_audio_seconds: r3(rawSeconds),
				real_time_factor: Number((synthMs / 1000 / rawSeconds).toFixed(3)),
			},
			duration: r3(tl.duration),
			loudness,
			outputs: {audio: 'narration.wav (48 kHz, 24-bit PCM, mono)', captions: ['captions.srt', 'captions.vtt']},
		}),
	);
	writeFileSync(path.join(outDir, 'meta.json'), `${JSON.stringify(meta, null, 1)}\n`);
	return {meta, words, cues, pauses, duration: r3(tl.duration), disclosure};
};
