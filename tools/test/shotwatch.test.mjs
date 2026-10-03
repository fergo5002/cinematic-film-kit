// shotwatch's loudness comes from ebur128's final Summary block. Reading the tail of the log
// instead once reported -48.0 LUFS for a file whose Summary said -39.0: the last per-frame row is
// a running value, not the answer. A film that gets louder at the end is the case that tells them
// apart, and no Summary at all must be an error, not a null.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {parseEbur128Summary, requireSummary} from '../lib/ffmpeg.mjs';
import {KIT, node, tempDir} from './helpers.mjs';

test('shotwatch reports the Summary loudness even when the last second is much louder', (t) => {
	const dir = tempDir(t, 'shotwatch-');
	const film = path.join(dir, 'crescendo.mkv');
	// Quiet, then loud for the last 0.2 s: every per-frame row before the jump reads the quiet value.
	const tone = "aevalsrc='if(lt(t,5.8),0.03,0.3)*sin(2*PI*997*t)|if(lt(t,5.8),0.03,0.3)*sin(2*PI*997*t)':s=48000:d=6";
	const made = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x334455:s=320x180:r=30:d=6', '-f', 'lavfi', '-i', tone, '-c:v', 'ffv1', '-c:a', 'pcm_s16le', '-shortest', film], {encoding: 'utf8'});
	assert.equal(made.status, 0, made.stderr);
	const truth = parseEbur128Summary(spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', film, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {encoding: 'utf8'}).stderr);
	assert.ok(Number.isFinite(truth.integratedLoudness));

	const r = node([path.join(KIT, 'tools', 'shotwatch.mjs'), film, '--out', dir]);
	assert.equal(r.status, 0, r.stderr);
	const report = JSON.parse(readFileSync(path.join(dir, 'crescendo', 'report.json'), 'utf8'));
	assert.equal(report.audio.integrated_lufs, truth.integratedLoudness);
	assert.equal(report.audio.loudness_range_lu, truth.loudnessRange);
	assert.equal(report.audio.true_peak_dbtp, truth.truePeak);
});

test('a log without a Summary block is an error, never a null reading', () => {
	const rows = '[Parsed_ebur128_0 @ 0x1] t: 5.9  TARGET:-23 LUFS    M: -18.0 S: -30.0     I: -48.0 LUFS       LRA:  20.0 LU';
	assert.throws(() => requireSummary(rows, 'film.mp4'), /no ebur128 Summary/);
	const good = requireSummary(`${rows}\n  Summary:\n    I:         -39.0 LUFS\n    LRA:         8.1 LU\n    Peak:       -2.0 dBFS\n`, 'film.mp4');
	assert.deepEqual(good, {integratedLoudness: -39, loudnessRange: 8.1, truePeak: -2});
});
