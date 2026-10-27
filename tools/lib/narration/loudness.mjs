// Mastering the voice stem, by the same rule as the film master (audio/master.mjs): never plain
// two-pass loudnorm, which silently goes dynamic when the gain needed would push true peak past
// the ceiling. Instead: (1) measure; (2) gain, plus a 4x-oversampled limiter only if the peaks need
// it, iterated to the target; (3) a final linear loudnorm trim that must report "linear" or the run
// fails; (4) measure the written file through the kit's one ebur128 Summary reader. If its true
// peak is still over the ceiling, go back to (2) with the limiter on and a wider margin, never
// repeating a pass that already overshot. The resampler is ffmpeg's own (swr): soxr is missing from
// some builds, Homebrew's among them.
import {spawnSync} from 'node:child_process';
import {requireSummary} from '../ffmpeg.mjs';

const ff = (args) => {
	const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], {encoding: 'utf8', maxBuffer: 1 << 26});
	if (r.status !== 0) throw new Error(`ffmpeg failed:\n${(r.stderr || '').slice(-3000)}`);
	return `${r.stdout}\n${r.stderr}`;
};

export const parseLoudnormJson = (text) => JSON.parse(text.slice(text.lastIndexOf('{'), text.lastIndexOf('}') + 1));

export const assertLinear = (report) => {
	if (report.normalization_type !== 'linear') throw new Error(`loudnorm fell back to ${report.normalization_type} normalisation, which would compress the voice. Failing the run.`);
};

export const measureFile = (file, run = ff) => {
	const s = requireSummary(run(['-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']), file);
	return {I: s.integratedLoudness, LRA: s.loudnessRange, TP: s.truePeak};
};

// runFfmpeg(args) returns ffmpeg's stdout and stderr as text; the tests pass a fake.
export const masterVoice = (input, output, {target = -16, ceiling = -1.5, comment = '', sampleRate = 48000, codec = 'pcm_s24le', runFfmpeg = ff} = {}) => {
	const LRA = 20; // permissive: loudnorm is not being asked to compress the range
	const measure = (pre = '') => parseLoudnormJson(runFfmpeg(['-i', input, '-af', `${pre}loudnorm=I=${target}:TP=${ceiling}:LRA=${LRA}:print_format=json`, '-f', 'null', '-']));
	const finite = (j, label) => {
		for (const k of ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset']) if (!Number.isFinite(Number(j[k]))) throw new Error(`${label}: loudnorm measured ${k}=${j[k]}; is the audio silent?`);
	};

	const m1 = measure();
	finite(m1, 'pass 1');
	const startGain = target - Number(m1.input_i);
	const peaksNeedLimiter = Number(m1.input_tp) + startGain > ceiling - 0.2;
	const margins = [0.4, 0.8, 1.2];
	const attempts = peaksNeedLimiter ? margins : [null, ...margins];
	for (const margin of attempts) {
		const needsLimiter = margin !== null;
		let gain = startGain;
		const limitLin = needsLimiter ? 10 ** ((ceiling - margin) / 20) : 1;
		const stageFor = (g) => (needsLimiter ? `volume=${g.toFixed(2)}dB,aresample=192000,alimiter=limit=${limitLin.toFixed(4)}:attack=0.5:release=60:level=disabled,aresample=48000,` : `volume=${g.toFixed(2)}dB,`);
		let stage = stageFor(gain);
		let m2 = measure(stage);
		finite(m2, 'pass 2');
		for (let k = 0; needsLimiter && k < 4 && Math.abs(target - Number(m2.input_i)) > 0.2; k++) {
			gain += target - Number(m2.input_i);
			stage = stageFor(gain);
			m2 = measure(stage);
			finite(m2, `pass 2.${k + 1}`);
		}
		const af =
			`${stage}loudnorm=I=${target}:TP=${ceiling}:LRA=${LRA}:measured_I=${m2.input_i}:measured_TP=${m2.input_tp}` +
			`:measured_LRA=${m2.input_lra}:measured_thresh=${m2.input_thresh}:offset=${m2.target_offset}:linear=true:print_format=json,` +
			`aresample=${sampleRate}`;
		const meta = comment ? ['-metadata', `comment=${comment}`] : [];
		const report = parseLoudnormJson(runFfmpeg(['-y', '-i', input, '-af', af, '-ar', String(sampleRate), '-ac', '1', '-c:a', codec, ...meta, output]));
		assertLinear(report);
		const out = measureFile(output, runFfmpeg);
		if (out.TP <= ceiling) {
			return {
				input: {I: Number(m1.input_i), TP: Number(m1.input_tp), LRA: Number(m1.input_lra)},
				gain_db: Number(gain.toFixed(2)),
				limiter: needsLimiter,
				limiter_margin_db: needsLimiter ? margin : 0,
				normalization_type: report.normalization_type,
				output: out,
				target: {I: target, TP: ceiling},
			};
		}
	}
	throw new Error(`true peak stayed above ${ceiling} dBTP after ${attempts.length} attempts (limiter margins ${margins.join(', ')} dB)`);
};
