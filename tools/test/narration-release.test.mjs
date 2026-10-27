// The release gate's narration step: a narrated film must carry its disclosure everywhere, be
// voiced from the script as it is now, play its voice, and keep the bed under the voice. A film
// with no narration passes untouched.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyFileSync, mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {Bus, SR, writeWav24} from '../../audio/dsp.mjs';
import {duckUnderSpeech} from '../../audio/voice.mjs';
import {MIN_VOICE_LEAD_DB, checkNarration, voiceLead} from '../lib/narration/check.mjs';
import {writeWavFloat} from '../lib/narration/wav.mjs';
import {makeSyntheticFilm, tempDir} from './helpers.mjs';
import {spawnSync} from 'node:child_process';

const DISCLOSURE = "AI-generated voice: narration synthesised with Kokoro-82M (voice bf_emma). No person's voice was recorded or cloned.";
const SCRIPT = 'The sea keeps its own time.\nGo when the water rests.\n';
const WORDS = [
	{text: 'The', start: 1.0, end: 1.2}, {text: 'sea', start: 1.25, end: 1.5}, {text: 'keeps', start: 1.55, end: 1.9}, {text: 'its', start: 1.95, end: 2.1}, {text: 'own', start: 2.15, end: 2.4}, {text: 'time.', start: 2.45, end: 2.9},
	{text: 'Go', start: 3.6, end: 3.8}, {text: 'when', start: 3.85, end: 4.0}, {text: 'the', start: 4.05, end: 4.15}, {text: 'water', start: 4.2, end: 4.5}, {text: 'rests.', start: 4.55, end: 5.0},
];

// A voice track that sounds exactly where the words are, and a bed of steady noise.
const voiceWav = (file) => {
	const x = new Float32Array(6 * SR);
	for (const w of WORDS) for (let i = Math.round(w.start * SR); i < Math.round(w.end * SR); i++) x[i] = 0.25 * Math.sin((2 * Math.PI * 180 * i) / SR);
	writeWavFloat(file, x, SR);
};
const bedWav = async (file, {duck, level = 0.2}) => {
	const bus = new Bus(6);
	let s = 7;
	for (let i = 0; i < bus.n; i++) {
		s = (s * 16807) % 2147483647;
		bus.L[i] = bus.R[i] = level * ((s / 2147483647) * 2 - 1);
	}
	if (duck) duckUnderSpeech(bus, WORDS, {depthDb: -14});
	await writeWav24(file, bus);
};

const narratedFilm = async (t, {duck = true, comment = DISCLOSURE, captionsBeside = true, plays = true, credit = true, script = SCRIPT} = {}) => {
	const kit = tempDir(t, 'narr-rel-');
	const film = path.join(kit, 'src', 'films', 'tide');
	const pub = path.join(kit, 'public', 'films', 'tide');
	const out = path.join(kit, 'out', 'tide');
	for (const d of [path.join(film, 'data'), path.join(pub, 'narration'), out]) mkdirSync(d, {recursive: true});
	writeFileSync(path.join(film, 'narration.txt'), script);
	writeFileSync(path.join(film, 'Tide.tsx'), `${plays ? "<Audio src={staticFile('films/tide/narration/narration.wav')} />" : ''}\n${credit ? '<div>AI-generated voice</div>' : ''}\n`);
	writeFileSync(path.join(film, 'data', 'narration.json'), JSON.stringify({voice: 'bf_emma', disclosure: DISCLOSURE, words: WORDS}));
	writeFileSync(path.join(pub, 'narration', 'meta.json'), JSON.stringify({ai_generated: true, disclosure: DISCLOSURE, script: {sha256: createHash('sha256').update(SCRIPT).digest('hex')}}));
	for (const ext of ['srt', 'vtt']) {
		writeFileSync(path.join(pub, 'narration', `captions.${ext}`), `${ext} captions\n`);
		if (captionsBeside) copyFileSync(path.join(pub, 'narration', `captions.${ext}`), path.join(out, `tide.${ext}`));
	}
	voiceWav(path.join(pub, 'narration', 'narration.wav'));
	await bedWav(path.join(pub, 'score.wav'), {duck});
	const raw = makeSyntheticFilm(path.join(out, 'raw.mp4'));
	spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-c', 'copy', ...(comment ? ['-metadata', `comment=${comment}`] : []), path.join(out, 'tide.mp4')]);
	return kit;
};

test('a film with no narration passes, and says so', (t) => {
	const kit = tempDir(t, 'narr-none-');
	assert.deepEqual(checkNarration(kit, 'quiet'), {status: 'PASS', detail: 'no narration', problems: [], notes: []});
});

test('a properly narrated, ducked and labelled film passes, with the voice lead in the detail', async (t) => {
	const kit = await narratedFilm(t);
	const r = checkNarration(kit, 'tide');
	assert.equal(r.status, 'PASS', r.problems.join('; '));
	assert.match(r.detail, /voice leads the bed by \d+(\.\d)? dB under speech/);
	assert.deepEqual(r.notes, []);
});

test('the voice lead is measured, and an unducked bed at the same level fails', async (t) => {
	const ducked = await narratedFilm(t);
	const flat = await narratedFilm(t, {duck: false});
	const a = voiceLead(ducked, 'tide');
	const b = voiceLead(flat, 'tide');
	assert.ok(a.leadDb - b.leadDb > 12 && a.leadDb - b.leadDb < 16, `a 14 dB duck moved the lead by ${(a.leadDb - b.leadDb).toFixed(1)} dB`);
	const r = checkNarration(flat, 'tide');
	assert.equal(r.status, 'FAIL');
	assert.match(r.problems.join(' '), new RegExp(`at least ${MIN_VOICE_LEAD_DB} dB`));
});

test('a stale narration, a missing disclosure, missing captions or a silent film each fail', async (t) => {
	const stale = checkNarration(await narratedFilm(t, {script: 'The sea keeps its own time.\nGo now.\n'}), 'tide');
	assert.match(stale.problems.join(' '), /narration\.txt has changed since it was voiced/);
	const untagged = checkNarration(await narratedFilm(t, {comment: ''}), 'tide');
	assert.match(untagged.problems.join(' '), /comment tag/);
	const bare = checkNarration(await narratedFilm(t, {captionsBeside: false}), 'tide');
	assert.match(bare.problems.join(' '), /out\/tide\/tide\.srt/);
	const silent = checkNarration(await narratedFilm(t, {plays: false}), 'tide');
	assert.match(silent.problems.join(' '), /never plays/);
	for (const r of [stale, untagged, bare, silent]) assert.equal(r.status, 'FAIL');
});

test('no on-screen credit is a note, not a failure: the post text may carry it instead', async (t) => {
	const r = checkNarration(await narratedFilm(t, {credit: false}), 'tide');
	assert.equal(r.status, 'PASS');
	assert.match(r.notes.join(' '), /AI-generated voice/);
});

test('narration.txt with nothing voiced yet fails with the command to run', (t) => {
	const kit = tempDir(t, 'narr-unvoiced-');
	mkdirSync(path.join(kit, 'src', 'films', 'tide'), {recursive: true});
	writeFileSync(path.join(kit, 'src', 'films', 'tide', 'narration.txt'), SCRIPT);
	const r = checkNarration(kit, 'tide');
	assert.equal(r.status, 'FAIL');
	assert.match(r.detail, /npm run narrate -- tide/);
});

test('a damaged narration record fails the step with a reason instead of crashing the release', async (t) => {
	const kit = await narratedFilm(t);
	writeFileSync(path.join(kit, 'public', 'films', 'tide', 'narration', 'meta.json'), '{"ai_generated": tr');
	const r = checkNarration(kit, 'tide');
	assert.equal(r.status, 'FAIL');
	assert.match(r.detail, /meta\.json/);
});

test('changing the voice, speed or start in the beatmap after voicing fails until it is voiced again', async (t) => {
	const kit = await narratedFilm(t);
	const data = path.join(kit, 'src', 'films', 'tide', 'data', 'narration.json');
	writeFileSync(data, JSON.stringify({voice: 'bf_emma', disclosure: DISCLOSURE, words: WORDS, settings: {voice: 'bf_emma', speed: 0.92, at: 30}}));
	assert.equal(checkNarration(kit, 'tide', {narration: {voice: 'bf_emma', speed: 0.92, at: 30}, fps: 30}).status, 'PASS');
	const moved = checkNarration(kit, 'tide', {narration: {voice: 'bf_emma', speed: 0.92, at: 45}, fps: 30});
	assert.equal(moved.status, 'FAIL');
	assert.match(moved.problems.join(' '), /NARRATION\.at in beatmap\.ts is 45 but the narration was voiced with 30/);
	const other = checkNarration(kit, 'tide', {narration: {voice: 'am_michael', speed: 0.92, at: 30}, fps: 30});
	assert.match(other.problems.join(' '), /voice/);
});
