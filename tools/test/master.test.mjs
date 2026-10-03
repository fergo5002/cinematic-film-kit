// audio/master.mjs reads loudness through the shared ebur128 Summary reader: no Summary is an
// error, and the Summary's own spacing does not matter. End to end, it lands on its target.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {test} from 'node:test';
import {loudnessOf} from '../../audio/master.mjs';
import {parseEbur128Summary} from '../lib/ffmpeg.mjs';
import {KIT, makeSyntheticFilm, node, tempDir} from './helpers.mjs';

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
