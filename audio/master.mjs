// Loudness mastering that keeps the film's dynamics.
//
// Two traps this exists to avoid.
//
// 1. Two-pass loudnorm with linear=true SILENTLY falls back to dynamic compression whenever the
//    gain needed to reach the target would push true peak past the ceiling, i.e. whenever the
//    peak-to-loudness ratio is more than (TP - I). A dynamic film mix (rare big sub hits, quiet
//    passages) always trips it: a score with LRA 7.5 LU came out at 2.1 (observed 1 October 2026).
//
// 2. loudnorm's own meter can disagree with ebur128 on short, dynamic material. On a 9 second
//    film with silences (observed 2 October 2026) loudnorm read -16.1 LUFS where ebur128 and an
//    independent BS.1770-4 implementation both read -17.4, so a master steered by loudnorm missed
//    its target by 1.3 LU. The audit measures with ebur128, so the master now steers by ebur128,
//    read through the kit's one Summary reader (tools/lib/ffmpeg.mjs requireSummary).
//
// So: (1) measure with ebur128; (2) apply a plain gain, plus an oversampled peak limiter only if
// the peaks would pass the ceiling, and iterate the gain until ebur128 reads 0 to 0.2 LU above
// the target; (3) encode; (4) verify the delivered file with the same meter, and correct once if
// the AAC encode moved it. Nothing here compresses anything except the few peaks above the
// ceiling. Default target -16 LUFS integrated, -1.5 dBTP: Apple's launch films sit at -15 to
// -16.3, below YouTube's -14 reference, so nothing is turned down and transients keep their punch.
//
// Usage: node audio/master.mjs in.mp4 out.mp4 [targetLUFS=-16] [ceilingDBTP=-1.5]
//        (npm run master -- <id> runs it on out/<id>/raw.mp4 and writes out/<id>/<id>.mp4)
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireSummary} from '../tools/lib/ffmpeg.mjs';

// Integrated loudness, loudness range and true peak from ebur128's Summary block. The per-frame
// rows above it are running values, so a log without a Summary is an error, never a reading.
export const loudnessOf = (text, label = 'the audio') => {
	const s = requireSummary(text, label);
	return {i: s.integratedLoudness, lra: s.loudnessRange, tp: s.truePeak};
};

const ff = (args) => {
	const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], {encoding: 'utf8', maxBuffer: 1 << 26});
	if (r.status !== 0) throw new Error(`ffmpeg failed:\n${(r.stderr || '').slice(-3000)}`);
	return `${r.stdout}\n${r.stderr}`;
};

export const master = (input, output, targetArg = '-16', ceilingArg = '-1.5') => {
	const I = Number(targetArg);
	const TP = Number(ceilingArg);
	const measure = (stage = '') => {
		const m = loudnessOf(ff(['-i', input, '-af', `${stage}ebur128=peak=true`, '-f', 'null', '-']), path.basename(input));
		if (m.i <= -60) throw new Error(`measured ${m.i} LUFS: is the audio silent?`);
		return m;
	};

	// 1. measure the mix as rendered
	const m1 = measure();
	let gain = I - m1.i;

	// 2. gain plus a 4x-oversampled limiter (so inter-sample peaks are caught), only if needed. The
	// limiter sits 0.4 dB under the ceiling because the AAC encode adds a little overshoot.
	const limitLin = Math.pow(10, (TP - 0.4) / 20);
	const needsLimiter = m1.tp + gain > TP - 0.2;
	const stageFor = (g) =>
		needsLimiter
			? `volume=${g.toFixed(2)}dB,aresample=192000,alimiter=limit=${limitLin.toFixed(4)}:attack=0.5:release=60:level=disabled,aresample=48000,`
			: `volume=${g.toFixed(2)}dB,`;
	let stage = stageFor(gain);
	let m2 = measure(stage);
	// Limiting lowers integrated loudness, so iterate the pre-limiter gain until the result reads the
	// target. Aim 0.1 LU above it and accept 0 to 0.2 above: the audit's band starts AT the target,
	// so a master that lands 0.1 under it fails delivery. Below the limiter each step is linear in
	// dB, so this converges in two or three passes.
	const aim = I + 0.1;
	const onTarget = (x) => x >= I && x <= I + 0.2;
	for (let k = 0; k < 6 && !onTarget(m2.i); k++) {
		gain += aim - m2.i;
		stage = stageFor(gain);
		m2 = measure(stage);
	}
	if (!onTarget(m2.i)) throw new Error(`could not reach ${I} LUFS: ended at ${m2.i} LUFS with ${gain.toFixed(1)} dB of gain`);

	// 3. encode. Remotion v4 drops the BT.709 primaries and transfer tags even with
	// --color-space=bt709 (and the default is untagged BT.601). Re-tag losslessly so players decode
	// the matrix that was encoded.
	const vcodec = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', input], {encoding: 'utf8'}).stdout.trim();
	const bsf =
		vcodec === 'h264'
			? ['-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0']
			: vcodec === 'hevc'
				? ['-bsf:v', 'hevc_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0']
				: [];
	const encode = () => ff(['-y', '-i', input, '-c:v', 'copy', ...bsf, '-af', `${stage}aresample=48000`, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', output]);
	encode();

	// 4. verify the delivered file with the same meter the audit uses. The AAC encode can move the
	// reading by a tenth or so; if it lands under the target, nudge the gain and encode once more.
	const verify = () => loudnessOf(ff(['-i', output, '-af', 'ebur128=peak=true', '-f', 'null', '-']), path.basename(output));
	let v = verify();
	for (let k = 0; k < 2 && !onTarget(v.i); k++) {
		gain += aim - v.i;
		stage = stageFor(gain);
		encode();
		v = verify();
	}
	const tags = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=color_space,color_transfer,color_primaries', '-of', 'csv=p=0', output], {encoding: 'utf8'}).stdout.trim();
	console.log(
		`colour tags ${tags}; mastered ${output}: I ${v.i} LUFS, LRA ${v.lra} LU (mix was ${m1.lra}), true peak ${v.tp} dBFS, ` +
			`gain ${gain.toFixed(1)} dB, limiter ${needsLimiter ? 'on' : 'off'}, no compression`,
	);
	if (!onTarget(v.i)) throw new Error(`the delivered file reads ${v.i} LUFS, not ${I} to ${I + 0.2}: the AAC encode moved it`);
	if (v.tp > TP + 0.5) throw new Error(`the delivered file peaks at ${v.tp} dBTP, over the ${TP} dBTP ceiling`);
	if (v.lra < 6) console.warn('LRA below 6 LU: the film has little dynamic range (check the mix, or the film is very short).');
	return v;
};

// Run only as a command: importing this file (the tests do) must not master anything.
const invoked = process.argv[1] && path.relative(path.resolve(process.argv[1]), fileURLToPath(import.meta.url)) === '';
if (invoked) {
	const [, , input, output, targetArg, ceilingArg] = process.argv;
	if (!input || !output) {
		console.error('usage: node audio/master.mjs in.mp4 out.mp4 [targetLUFS] [ceilingDBTP]');
		process.exitCode = 1;
	} else {
		try {
			master(input, output, targetArg, ceilingArg);
		} catch (err) {
			console.error(err.message);
			process.exitCode = 1;
		}
	}
}
