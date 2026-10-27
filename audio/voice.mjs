// The voice leads and the bed sits under it. A narrated film's score.mjs calls duckUnderSpeech()
// on its finished mix with the words from the film's data/narration.json (written by
// `npm run narrate`), so the music dips under every spoken phrase and comes back up in the pauses.
// The duck is computed from the word timings, sample by sample, so it is exact and the same every
// run, which a sidechain compressor reacting to the voice's level is not. A film with no narration
// gets no words, and its score is left exactly as it was.
//
// How deep: 10 dB by default (sound-design guidance is 6 to 12). The release gate then measures
// the stems and fails a film whose voice does not lead its bed by at least 10 dB under speech.
import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {speechSpans} from '../tools/lib/narration/spans.mjs';
import {SR, dbToGain} from './dsp.mjs';

export {speechSpans};

// The words of a film's narration, or [] when it has none. Takes a file URL or a path.
export const narrationWords = (file) => {
	const p = file instanceof URL ? fileURLToPath(file) : String(file);
	if (!existsSync(p)) return [];
	return JSON.parse(readFileSync(p, 'utf8')).words ?? [];
};

// Per-sample gain: `depthDb` under each span, reached `pre` seconds before the first word after an
// `attack`-long cosine ramp, held `hold` seconds past the last word, then a `release`-long ramp up.
export const duckGain = (spans, {n, sampleRate = SR, depthDb = -10, pre = 0.08, attack = 0.25, hold = 0.1, release = 0.6} = {}) => {
	const g = new Float32Array(n).fill(1);
	const floor = dbToGain(depthDb);
	const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
	for (const s of spans) {
		const a0 = s.start - pre - attack;
		const a1 = s.start - pre;
		const r0 = s.end + hold;
		const r1 = r0 + release;
		const i0 = Math.max(0, Math.floor(a0 * sampleRate));
		const i1 = Math.min(n, Math.ceil(r1 * sampleRate) + 1);
		for (let i = i0; i < i1; i++) {
			const t = i / sampleRate;
			const depth = t < a1 ? ease((t - a0) / attack) : t <= r0 ? 1 : 1 - ease((t - r0) / release);
			const v = 1 - (1 - floor) * depth;
			if (v < g[i]) g[i] = v;
		}
	}
	return g;
};

// Duck a stereo bus (audio/dsp.mjs Bus, or anything with L, R and n) under the spoken phrases.
export const duckUnderSpeech = (bus, words, opts = {}) => {
	if (!words?.length) return bus;
	const g = duckGain(speechSpans(words, opts), {n: bus.n ?? bus.L.length, ...opts});
	for (let i = 0; i < g.length; i++) {
		bus.L[i] *= g[i];
		bus.R[i] *= g[i];
	}
	return bus;
};
