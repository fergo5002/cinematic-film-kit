// audio/master.mjs reads loudness through the shared ebur128 Summary reader: no Summary is an
// error, and the Summary's own spacing does not matter. End to end, it lands on its target.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {loudnessOf} from '../../audio/master.mjs';
import {parseEbur128Summary} from '../lib/ffmpeg.mjs';
import {KIT, makeSyntheticFilm, node, tempDir, tempKit, writeBeatmap} from './helpers.mjs';

test('the master reads loudness only from the ebur128 Summary, and fails without one', () => {
	const rows = '[Parsed_ebur128_0 @ 0x1] t: 5.9  TARGET:-23 LUFS    M: -18.0 S: -30.0     I: -48.0 LUFS       LRA:  20.0 LU';
	assert.throws(() => loudnessOf(rows, 'raw.mp4'), /no ebur128 Summary/);
	// two spaces before the units: the master's old private parser read this as NaN
	const summary = `${rows}\n  Summary:\n    I:  -16.0  LUFS\n    LRA:  7.5  LU\n    Peak:  -1.8  dBFS\n`;
	assert.deepEqual(loudnessOf(summary, 'raw.mp4'), {i: -16, lra: 7.5, tp: -1.8});
});

test('mastering a film lands on the target, from above, with BT.709 tags', (t) => {
	const dir = tempDir(t, 'master-');
	const raw = makeSyntheticFilm(path.join(dir, 'raw.mp4'));
	const out = path.join(dir, 'master.mp4');
	const r = node([path.join(KIT, 'audio', 'master.mjs'), raw, out]);
	assert.equal(r.status, 0, r.stderr);
	const m = parseEbur128Summary(spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', out, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {encoding: 'utf8'}).stderr);
	assert.ok(m.integratedLoudness >= -16 && m.integratedLoudness <= -15.8, `${m.integratedLoudness} LUFS`);
	const tags = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=color_primaries,color_transfer,color_space', '-of', 'csv=p=0', out], {encoding: 'utf8'}).stdout.trim();
	assert.equal(tags, 'bt709,bt709,bt709');
});

test('a narrated film\'s master carries the AI-voice disclosure in its tags, with its captions beside it', (t) => {
	const kit = tempKit(t, {withSrc: false});
	cpSync(path.join(KIT, 'audio'), path.join(kit, 'audio'), {recursive: true});
	writeBeatmap(kit, 'tide');
	makeSyntheticFilm(path.join(kit, 'out', 'tide', 'raw.mp4'));
	const disclosure = "AI-generated voice: narration synthesised with Kokoro-82M (voice bf_emma). No person's voice was recorded or cloned.";
	const pub = path.join(kit, 'public', 'films', 'tide', 'narration');
	mkdirSync(pub, {recursive: true});
	writeFileSync(path.join(pub, 'meta.json'), JSON.stringify({ai_generated: true, disclosure}));
	writeFileSync(path.join(pub, 'captions.srt'), '1\n00:00:01,000 --> 00:00:02,000\nGo when the water rests.\n');
	writeFileSync(path.join(pub, 'captions.vtt'), 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nGo when the water rests.\n');
	const r = node([path.join(kit, 'tools', 'master.mjs'), 'tide'], {cwd: kit});
	assert.equal(r.status, 0, r.stderr + r.stdout);
	const master = path.join(kit, 'out', 'tide', 'tide.mp4');
	const tags = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags=comment', '-of', 'json', master], {encoding: 'utf8'}).stdout).format.tags;
	assert.equal(tags.comment, disclosure);
	assert.equal(readFileSync(path.join(kit, 'out', 'tide', 'tide.srt'), 'utf8'), readFileSync(path.join(pub, 'captions.srt'), 'utf8'));
	assert.equal(readFileSync(path.join(kit, 'out', 'tide', 'tide.vtt'), 'utf8'), readFileSync(path.join(pub, 'captions.vtt'), 'utf8'));
	assert.match(r.stdout, /AI-generated voice/);
});

test('a film without narration is mastered with no comment tag and no caption files, as before', (t) => {
	const kit = tempKit(t);
	cpSync(path.join(KIT, 'audio'), path.join(kit, 'audio'), {recursive: true});
	writeBeatmap(kit, 'quiet');
	makeSyntheticFilm(path.join(kit, 'out', 'quiet', 'raw.mp4'));
	const r = node([path.join(kit, 'tools', 'master.mjs'), 'quiet'], {cwd: kit});
	assert.equal(r.status, 0, r.stderr);
	const tags = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags=comment', '-of', 'json', path.join(kit, 'out', 'quiet', 'quiet.mp4')], {encoding: 'utf8'}).stdout).format.tags ?? {};
	assert.equal(tags.comment, undefined);
	assert.ok(!existsSync(path.join(kit, 'out', 'quiet', 'quiet.srt')));
});
