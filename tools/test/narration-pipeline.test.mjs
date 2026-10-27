// The narration pipeline end to end on a stand-in engine: script to a mastered 48 kHz voice track,
// word timings, captions and a record with the disclosure, laid out exactly as the script says.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {narrate} from '../lib/narration/pipeline.mjs';
import {loadEngine} from './fixtures/narration/fake-engine.mjs';
import {tempDir} from './helpers.mjs';

const SCRIPT = 'The sea keeps its own time.\n[pause 0.8]\nTwice a day, between the tides, it stops.\nGo when the water rests.\n';

test('a script becomes a mastered voice track, word timings, captions and a disclosed record', async (t) => {
	const out = tempDir(t, 'narr-pipe-');
	const engine = await loadEngine();
	const r = await narrate({scriptText: SCRIPT, voice: 'bf_test', outDir: out, engine, lead: 1.5});
	for (const f of ['narration.wav', 'captions.srt', 'captions.vtt', 'meta.json']) assert.ok(existsSync(path.join(out, f)), `${f} missing`);
	const probe = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=sample_rate,channels,codec_name:format=duration:format_tags=comment', '-of', 'json', path.join(out, 'narration.wav')], {encoding: 'utf8'}).stdout);
	assert.equal(probe.streams[0].sample_rate, '48000');
	assert.equal(probe.streams[0].channels, 1);
	assert.equal(probe.streams[0].codec_name, 'pcm_s24le');
	assert.match(probe.format.tags.comment, /^AI-generated voice/);
	assert.ok(Math.abs(Number(probe.format.duration) - r.duration) < 0.01, `file ${probe.format.duration} s, timeline ${r.duration} s`);

	// every written word, in order, with times inside the file; the first one after the lead
	assert.deepEqual(r.words.map((w) => w.text), SCRIPT.replace('[pause 0.8]', '').split(/\s+/).filter(Boolean));
	assert.ok(Math.abs(r.words[0].start - 1.5) < 0.05, `first word at ${r.words[0].start}`);
	for (const w of r.words) assert.ok(w.end > w.start && w.end <= r.duration, JSON.stringify(w));
	assert.deepEqual([...new Set(r.words.map((w) => w.source))], ['engine']);
	// the pause mark is exact: 0.8 s plus the trim pad either side, as measured on the real voice
	const gap = r.words[6].start - r.words[5].end;
	assert.ok(gap > 0.79 && gap < 0.9, `pause ${gap}`);

	const meta = JSON.parse(readFileSync(path.join(out, 'meta.json'), 'utf8'));
	assert.equal(meta.ai_generated, true);
	assert.match(meta.disclosure, /^AI-generated voice/);
	assert.equal(meta.voice, 'bf_test');
	assert.match(meta.script.sha256, /^[0-9a-f]{64}$/);
	// -19 LUFS mono: the voice reads -16 LUFS, the film's delivery target, once it plays on both
	// channels of a stereo film, so the master has nothing to turn down
	assert.ok(Math.abs(meta.loudness.output.I - -19) <= 0.5, `I ${meta.loudness.output.I}`);
	assert.ok(meta.loudness.output.TP <= -1.5);
	assert.ok(meta.timing.anchor_check.anchors > 0);
	assert.match(readFileSync(path.join(out, 'captions.vtt'), 'utf8'), /^WEBVTT\n\nNOTE AI-generated voice/);
	assert.ok(r.cues.length >= 3);
	assert.ok(Math.abs(r.cues[0].start - r.words[0].start) < 1e-9);
});

test('narration is never sped up, and slowed by no more than 0.85', async (t) => {
	const out = tempDir(t, 'narr-speed-');
	const engine = await loadEngine();
	await assert.rejects(narrate({scriptText: SCRIPT, voice: 'bf_test', outDir: out, engine, speed: 1.1}), /never sped up/);
	await assert.rejects(narrate({scriptText: SCRIPT, voice: 'bf_test', outDir: out, engine, speed: 0.8}), /0\.85 to 1/);
	assert.ok(!existsSync(path.join(out, 'narration.wav')), 'a refused run writes nothing');
});

test('when the engine gives no usable timings, words are spread over each line and say so', async (t) => {
	const out = tempDir(t, 'narr-flat-');
	const engine = await loadEngine();
	const logs = [];
	const r = await narrate({scriptText: SCRIPT, voice: 'bf_flat', outDir: out, engine, log: (m) => logs.push(m)});
	assert.deepEqual([...new Set(r.words.map((w) => w.source))], ['proportional']);
	assert.ok(logs.some((m) => /proportional/.test(m)), logs.join('\n'));
	for (let i = 1; i < r.words.length; i++) assert.ok(r.words[i].start >= r.words[i - 1].start, 'still in order');
	await assert.rejects(narrate({scriptText: SCRIPT, voice: 'bf_flat', outDir: tempDir(t, 'narr-flat2-'), engine, timings: 'engine'}), /no engine timings/);
});

test('an unknown voice or an empty script is refused with what to do instead', async (t) => {
	const engine = await loadEngine();
	await assert.rejects(narrate({scriptText: SCRIPT, voice: 'xx_nobody', outDir: tempDir(t, 'narr-v-'), engine}), /unknown voice "xx_nobody".*bf_test/);
	await assert.rejects(narrate({scriptText: '# only a comment\n', voice: 'bf_test', outDir: tempDir(t, 'narr-e-'), engine, log: () => {}}), /no speech/);
});

test('a written word with no sound of its own sits where the voice is, not at the start of the file', async (t) => {
	const engine = await loadEngine();
	const r = await narrate({scriptText: '/ the sea keeps its own time.\n', voice: 'bf_test', outDir: tempDir(t, 'narr-sym-'), engine, lead: 1.5});
	assert.equal(r.words[0].text, '/');
	assert.ok(r.words[0].start >= 1.45, `"/" placed at ${r.words[0].start} s, before the voice starts`);
	assert.ok(r.cues[0].start >= 1.45, `first cue at ${r.cues[0].start} s`);
});
