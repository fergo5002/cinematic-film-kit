// The voice stem's loudness: the same rule as the film master (never plain two-pass loudnorm,
// which silently compresses), read through the kit's one ebur128 Summary reader.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {test} from 'node:test';
import {assertLinear, masterVoice, parseLoudnormJson} from '../lib/narration/loudness.mjs';
import {tempDir} from './helpers.mjs';

test('parseLoudnormJson takes the last JSON block', () => {
	assert.equal(parseLoudnormJson('noise {"a":1}\nmore\n{\n "input_i" : "-23.10",\n "normalization_type" : "linear"\n}\n').input_i, '-23.10');
});

test('assertLinear fails a run where loudnorm went dynamic', () => {
	assert.throws(() => assertLinear({normalization_type: 'dynamic'}), /dynamic/);
	assert.doesNotThrow(() => assertLinear({normalization_type: 'linear'}));
});

test('masterVoice lands on -16 LUFS under a -1.5 dBTP ceiling, 48 kHz mono, disclosure tagged', (t) => {
	const dir = tempDir(t, 'narr-loud-');
	const src = path.join(dir, 'in.wav');
	const out = path.join(dir, 'out.wav');
	// A bursty, peaky signal at 24 kHz: a pulsed buzz with harmonics and quiet gaps, well under target.
	const expr = '0.25*(sin(2*PI*180*t)+0.5*sin(2*PI*360*t)+0.3*sin(2*PI*1260*t))*gt(sin(2*PI*1.3*t),0)*(0.4+0.6*abs(sin(2*PI*0.21*t)))';
	const r = spawnSync('ffmpeg', ['-hide_banner', '-y', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=24000:d=8`, '-c:a', 'pcm_f32le', src], {encoding: 'utf8'});
	assert.equal(r.status, 0, r.stderr);
	const rep = masterVoice(src, out, {target: -16, ceiling: -1.5, comment: 'AI-generated voice: test'});
	assert.equal(rep.normalization_type, 'linear');
	assert.ok(Math.abs(rep.output.I - -16) <= 0.5, `I ${rep.output.I}`);
	assert.ok(rep.output.TP <= -1.5, `TP ${rep.output.TP}`);
	const info = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=sample_rate,channels:format_tags=comment', '-of', 'json', out], {encoding: 'utf8'}).stdout);
	assert.equal(info.streams[0].sample_rate, '48000');
	assert.equal(info.streams[0].channels, 1);
	assert.match(info.format.tags.comment, /AI-generated voice/);
});

// A fake ffmpeg for the retry logic. Pass 1 reads the raw stem; any measurement with a gain stage
// lands on target. The written file peaks at `bareTP` without the limiter, and with it at the
// limiter's ceiling plus `overshoot` dB.
const fakeFfmpeg = ({passOne, bareTP, overshoot}) => {
	const log = {passOne: 0, applied: []};
	let lastLimit = null;
	const run = (args) => {
		const af = args[args.indexOf('-af') + 1];
		if (af.startsWith('ebur128')) {
			const tp = lastLimit === null ? bareTP : 20 * Math.log10(lastLimit) + overshoot;
			return `[Parsed_ebur128_0] Summary:\n  Integrated loudness:\n    I:         -16.0 LUFS\n  Loudness range:\n    LRA:         3.0 LU\n  True peak:\n    Peak:       ${tp.toFixed(1)} dBFS`;
		}
		if (args.includes('-y')) {
			log.applied.push(af);
			const m = af.match(/alimiter=limit=([\d.]+)/);
			lastLimit = m ? Number(m[1]) : null;
			return '{\n "normalization_type" : "linear"\n}';
		}
		if (af.startsWith('loudnorm=')) {
			log.passOne++;
			return JSON.stringify({...passOne, input_lra: '3.0', input_thresh: '-36.0', target_offset: '0.00'});
		}
		return JSON.stringify({input_i: '-16.00', input_tp: '-3.00', input_lra: '3.0', input_thresh: '-26.0', target_offset: '0.00'});
	};
	return {run, log};
};

test('a file that peaks over the ceiling without the limiter is retried with the limiter on, not rerun unchanged', () => {
	const {run, log} = fakeFfmpeg({passOne: {input_i: '-26.00', input_tp: '-14.00'}, bareTP: -1.2, overshoot: 0.3});
	const rep = masterVoice('in.wav', 'out.wav', {target: -16, ceiling: -1.5, runFfmpeg: run});
	assert.equal(rep.limiter, true);
	assert.equal(rep.limiter_margin_db, 0.4);
	assert.ok(rep.output.TP <= -1.5, `TP ${rep.output.TP}`);
	assert.equal(log.applied.length, 2, 'one pass without the limiter, then one with it');
	assert.ok(!log.applied[0].includes('alimiter') && log.applied[1].includes('alimiter'));
});

test('pass 1 is measured once however many limiter margins are tried', () => {
	const {run, log} = fakeFfmpeg({passOne: {input_i: '-26.00', input_tp: '-3.00'}, bareTP: 5, overshoot: 0.5});
	const rep = masterVoice('in.wav', 'out.wav', {target: -16, ceiling: -1.5, runFfmpeg: run});
	assert.equal(rep.limiter_margin_db, 0.8);
	assert.equal(log.passOne, 1);
});

test('a written file with no ebur128 Summary is an error, never a reading', () => {
	const run = (args) => {
		const af = args[args.indexOf('-af') + 1];
		if (af.startsWith('ebur128')) return '[Parsed_ebur128_0] t: 1.0 M: -20.0 S: -20.0 I: -48.0 LUFS LRA: 0.0 LU';
		if (args.includes('-y')) return '{\n "normalization_type" : "linear"\n}';
		return JSON.stringify({input_i: '-26.00', input_tp: '-14.00', input_lra: '3.0', input_thresh: '-36.0', target_offset: '0.00'});
	};
	assert.throws(() => masterVoice('in.wav', 'out.wav', {runFfmpeg: run}), /no ebur128 Summary/);
});
