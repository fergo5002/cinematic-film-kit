// The score for "Who's singing", synthesised from the same beatmap the picture renders from.
// Run: node src/films/hark/score.mjs   (writes three files)
//   public/films/hark/score.wav     the soundtrack
//   public/films/hark/spectra.bin   each bird's spectrogram, computed from the exact audio
//   src/films/hark/data/phrases.json  every phrase: who, when, and its pitch contour
// The card in the film draws the spectrogram, so every ink dot on screen is a sound you hear.
import {mkdir, writeFile} from 'node:fs/promises';
import {BIRDS, DURATION, M, beat, sec} from './beatmap.ts';
import {SPECIES} from './birds.mjs';
import {Biquad, Bus, SR, adsr, assertFinite, fdnReverb, midiToHz, mulberry32, pan, sawAt, softClip, writeWav24} from '../../../audio/dsp.mjs';

const LEN = sec(DURATION) + 2.5;
const rnd = mulberry32(2604);
const at = (frames) => sec(frames);
const byId = Object.fromEntries(BIRDS.map((b) => [b.id, b]));

// ---------- the birds ----------
// One dry bus per bird for everything the card draws; distant birds (the diary) go to their own bus.
const birdBus = Object.fromEntries(BIRDS.map((b) => [b.id, new Bus(LEN)]));
const distant = new Bus(LEN);
const phrases = [];
const sing = (id, t, role, {level = 1, seed = 0, short = false, bus = null, p = null, notes} = {}) => {
	const b = byId[id];
	const r = SPECIES[id](bus ?? birdBus[id], t, b.seed + seed, {p: p ?? b.pan, level, short, notes});
	phrases.push({bird: id, role, t0: r.t0, t1: r.t1});
	return r;
};

// 1. Each bird's first phrase; Hark names it while it sings (beatmap: sing, named)
for (const b of BIRDS) sing(b.id, at(b.sing), 'first', {short: b.id === 'woodpigeon'});
// 2. The chorus builds: named birds sing again from their perches, a little quieter
sing('robin', 3.0, 'chorus', {level: 0.7, seed: 1});
sing('wren', 4.3, 'chorus', {level: 0.6, seed: 1});
sing('blackbird', 5.05, 'chorus', {level: 0.75, seed: 1});
sing('greatTit', 5.62, 'chorus', {level: 0.6, seed: 1});
// 3. The knot: all six at once, staggered by a few milliseconds
BIRDS.forEach((b, k) => sing(b.id, at(M.knot) + 0.035 * k, 'knot', {seed: 2, level: 0.8}));
// 4. The lanes: each bird sings again as its lane pulls out of the knot (one a beat)
for (const b of BIRDS) sing(b.id, at(b.again), 'lane', {seed: 3, short: b.id === 'woodpigeon'});
// 5. The diary: the wood keeps singing, further away
[['robin', 12.4], ['blackbird', 13.1], ['wren', 13.9], ['greatTit', 14.7], ['chaffinch', 15.0]].forEach(([id, t], k) =>
	sing(id, t, 'distant', {level: 0.85, seed: 4 + k, bus: distant}),
);
// 6. The mark: the robin, close and centred, nine notes: one for each stroke of the word it becomes
sing('robin', at(M.robinLast), 'last', {seed: 9, p: 0, level: 1.15, notes: 9});

// The breath must be a real breath: nothing may still be singing when it starts.
for (const ph of phrases) {
	if (ph.t0 < at(M.breath) && ph.t1 > at(M.breath) - 0.03) {
		throw new Error(`${ph.bird} (${ph.role}) sings into the breath: ${ph.t0.toFixed(2)} to ${ph.t1.toFixed(2)} s`);
	}
}

// ---------- the wood: air in the leaves, under everything until the mark ----------
const air = new Bus(LEN);
{
	const lp = new Biquad('lowpass', 1400, 0.6);
	const hp = new Biquad('highpass', 180, 0.7);
	const lp2 = new Biquad('lowpass', 1100, 0.6);
	const hp2 = new Biquad('highpass', 220, 0.7);
	const end = at(M.wordmark) + 1.0;
	let gust = 0.5;
	let target = 0.5;
	for (let i = 0; i < Math.floor(end * SR); i++) {
		const t = i / SR;
		if (i % 4800 === 0) target = 0.35 + 0.65 * rnd();
		gust += (target - gust) * 0.00004;
		const fade = Math.min(1, t / 0.6) * Math.min(1, (end - t) / 1.6);
		// the breath: the air thins too, so the silence reads
		const breath = t > at(M.breath) - 0.15 && t < at(M.knot) ? 0.35 : 1;
		const g = 0.012 * gust * fade * breath;
		air.add(i, lp.process(hp.process(rnd() * 2 - 1)) * g, lp2.process(hp2.process(rnd() * 2 - 1)) * g);
	}
}

// ---------- the dawn: one chord that warms with the sky ----------
const music = new Bus(LEN);
const pad = (midi, t0, t1, gain, p, {attack = 1.2, release = 1.8, bright = 1.6} = {}) => {
	for (let d = 0; d < 2; d++) {
		const f = midiToHz(midi + (d ? 0.06 : -0.06));
		const dt = f / SR;
		const [gl, gr] = pan(Math.max(-1, Math.min(1, p + (d ? 0.15 : -0.15))));
		const lp = new Biquad('lowpass', f * bright, 0.6);
		let ph = rnd();
		const n0 = Math.floor(t0 * SR);
		const len = t1 - t0;
		const n1 = Math.floor((t1 + release) * SR);
		for (let i = n0; i < n1; i++) {
			const t = (i - n0) / SR;
			ph += dt;
			if (ph >= 1) ph -= 1;
			const v = lp.process(0.6 * sawAt(ph, dt) + 0.4 * Math.sin(2 * Math.PI * ph)) * adsr(t, len, attack, 0.4, 0.85, release) * gain;
			music.add(i, v * gl, v * gr);
		}
	}
};
// pre-dawn: an open fifth, swelling as the birds arrive; it stops for the breath
[[38, 0.05], [45, 0.035], [52, 0.02], [64, 0.012]].forEach(([m, g], k) => pad(m, 0.1, at(M.breath) - 0.25, g, (k - 1.5) * 0.3, {attack: 2.5, release: 0.25}));
// the untangling: the third arrives and the voicing opens
[[38, 0.045], [50, 0.03], [57, 0.024], [62, 0.018], [66, 0.014], [69, 0.01], [76, 0.006]].forEach(([m, g], k) =>
	pad(m, at(M.knot), at(M.today) + 0.3, g, (k - 3) * 0.25, {attack: 0.6, release: 1.4, bright: 2.2}),
);
// the diary: settles a step down, quieter
[[35, 0.06], [47, 0.04], [54, 0.032], [62, 0.022], [66, 0.016]].forEach(([m, g], k) => pad(m, at(M.today), at(M.robinLast), g, (k - 2) * 0.3, {attack: 1.0, release: 1.2}));
// the mark: it resolves when the robin's song becomes the mark, and rings almost to the end
[[31, 0.085], [43, 0.055], [50, 0.044], [55, 0.036], [59, 0.028], [62, 0.022], [69, 0.014]].forEach(([m, g], k) =>
	pad(m, at(M.morph), at(M.silence) - 1.6, g, (k - 3) * 0.25, {attack: 0.25, release: 1.5, bright: 2.0}),
);
// a glass note when the song becomes the mark, and one when the line lands
const glass = (t, midi, gain, p) => {
	const [gl, gr] = pan(p);
	const f = midiToHz(midi);
	for (let i = Math.floor(t * SR), n = 0; n < SR * 2.2; i++, n++) {
		const x = n / SR;
		const v = (Math.sin(2 * Math.PI * f * x) * Math.exp(-x * 2.2) + 0.3 * Math.sin(2 * Math.PI * f * 2.76 * x) * Math.exp(-x * 5)) * Math.min(1, x / 0.002) * gain;
		music.add(i, v * gl, v * gr);
	}
};
// each name lands on a glass note: six birds, six rising notes, panned to where the bird will perch
BIRDS.forEach((b, k) => glass(at(b.named), [79, 81, 83, 86, 88, 91][k], 0.034, b.pan * 0.6));
// the month fills backwards from today, one morning a frame: tiny falling ticks, every other morning
for (let k = 0; k < 20; k += 2) glass(at(M.month + k), 98 - k * 0.5, 0.009, (k / 19 - 0.5) * 0.8);
// the note: a soft pair as "19 mornings running" lands
glass(at(M.note), 86, 0.022, 0.15);
glass(at(M.note) + 0.09, 90, 0.018, 0.25);
glass(at(M.morph), 86, 0.08, -0.2);
glass(at(M.morph) + 0.11, 91, 0.065, 0.2);
glass(at(M.endLine), 83, 0.05, 0);

// two low blooms, rare and deep: the chorus returning after the breath, and the song becoming the
// word. A 110 to 165 Hz layer and a soft contact click carry them on laptop speakers.
const bloom = (t, hz, gain, decay) => {
	const n0 = Math.floor(t * SR);
	const lp = new Biquad('lowpass', 1800, 0.7);
	for (let n = 0; n < SR * (decay * 4); n++) {
		const x = n / SR;
		const env = Math.min(1, x / 0.018) * Math.exp(-x / decay);
		const body = Math.sin(2 * Math.PI * hz * x) + 0.5 * Math.sin(2 * Math.PI * hz * 2 * x) + 0.22 * Math.sin(2 * Math.PI * hz * 3 * x);
		const click = n < SR * 0.004 ? lp.process(rnd() * 2 - 1) * (1 - n / (SR * 0.004)) * 0.6 : 0;
		const v = (body * env + click) * gain;
		music.add(n0 + n, v, v);
	}
};
bloom(at(M.knot), 55, 0.3, 0.9);
bloom(at(M.morph), 73.4, 0.24, 1.1);

// ---------- mix ----------
const master = new Bus(LEN);
const send = new Bus(LEN);
for (const b of BIRDS) {
	birdBus[b.id].mixInto(master, 1);
	birdBus[b.id].mixInto(send, 0.35);
}
{
	// distance: duller and wetter
	const lpL = new Biquad('lowpass', 5200, 0.7);
	const lpR = new Biquad('lowpass', 5200, 0.7);
	for (let i = 0; i < distant.n; i++) {
		const l = lpL.process(distant.L[i]);
		const r = lpR.process(distant.R[i]);
		master.add(i, l * 0.7, r * 0.7);
		send.add(i, l * 0.9, r * 0.9);
	}
}
air.mixInto(master, 1);
music.mixInto(master, 1);
music.mixInto(send, 0.25);
const verb = fdnReverb(send, {seconds: 1.7, damp: 5200, predelay: 0.022});
verb.mixInto(master, 0.32);
// the end is silent: a short fade where the last chord has gone
{
	const cut = Math.floor(at(M.silence) * SR);
	const fadeN = Math.floor(0.4 * SR);
	for (let i = 0; i < master.n; i++) {
		const g = i < cut - fadeN ? 1 : i < cut ? (cut - i) / fadeN : 0;
		master.L[i] = softClip(master.L[i] * g, 1.1);
		master.R[i] = softClip(master.R[i] * g, 1.1);
	}
}
assertFinite(master, 'master');
const total = new Bus(sec(DURATION));
master.mixInto(total, 1);
await mkdir(new URL('../../../public/films/hark/', import.meta.url), {recursive: true});
await writeWav24(new URL('../../../public/films/hark/score.wav', import.meta.url), total);

// ---------- the picture's data: each bird's spectrogram, from the dry bird buses ----------
const N = 1024;
const HOP = SR / 24 / 4; // 500 samples: exactly four columns per video frame
const FMAX = 10000;
const KMAX = Math.round(FMAX / (SR / N)); // 213 bins up to 10 kHz
const COLS = Math.ceil((sec(DURATION) * SR) / HOP);
const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
// a real FFT by brute DFT over the bins we keep is too slow; use a radix-2 FFT
const fftMag = (re) => {
	const n = re.length;
	const im = new Float64Array(n);
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) [re[i], re[j]] = [re[j], re[i]];
	}
	for (let len = 2; len <= n; len <<= 1) {
		const ang = (-2 * Math.PI) / len;
		const wr = Math.cos(ang);
		const wi = Math.sin(ang);
		for (let i = 0; i < n; i += len) {
			let cr = 1;
			let ci = 0;
			for (let k = 0; k < len / 2; k++) {
				const ur = re[i + k];
				const ui = im[i + k];
				const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
				const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
				re[i + k] = ur + vr;
				im[i + k] = ui + vi;
				re[i + k + len / 2] = ur - vr;
				im[i + k + len / 2] = ui - vi;
				const nr = cr * wr - ci * wi;
				ci = cr * wi + ci * wr;
				cr = nr;
			}
		}
	}
	const out = new Float32Array(KMAX + 1);
	for (let k = 0; k <= KMAX; k++) out[k] = Math.hypot(re[k], im[k]);
	return out;
};
const mags = BIRDS.map((b) => {
	const bus = birdBus[b.id];
	const cols = [];
	for (let c = 0; c < COLS; c++) {
		const frame = new Float64Array(N);
		const s0 = c * HOP - N / 2;
		for (let i = 0; i < N; i++) {
			const j = s0 + i;
			frame[i] = j >= 0 && j < bus.n ? (bus.L[j] + bus.R[j]) * 0.5 * win[i] : 0;
		}
		cols.push(fftMag(frame));
	}
	return cols;
});
let ref = 1e-9;
for (const cols of mags) for (const col of cols) for (const v of col) ref = Math.max(ref, v);
const RANGE_DB = 60;
const bin = new Uint8Array(BIRDS.length * COLS * (KMAX + 1));
mags.forEach((cols, bi) => {
	cols.forEach((col, c) => {
		for (let k = 0; k <= KMAX; k++) {
			const db = 20 * Math.log10(col[k] / ref + 1e-12);
			bin[(bi * COLS + c) * (KMAX + 1) + k] = Math.max(0, Math.min(255, Math.round(((db + RANGE_DB) / RANGE_DB) * 255)));
		}
	});
});
await writeFile(new URL('../../../public/films/hark/spectra.bin', import.meta.url), bin);

// each phrase's pitch contour: the loudest bin in each column while it sings, where it is loud enough
const contourOf = (bi, t0, t1) => {
	const pts = [];
	for (let c = Math.floor((t0 * SR) / HOP); c <= Math.ceil((t1 * SR) / HOP) && c < COLS; c++) {
		const base = (bi * COLS + c) * (KMAX + 1);
		let best = 0;
		let bk = 0;
		for (let k = 2; k <= KMAX; k++) if (bin[base + k] > best) [best, bk] = [bin[base + k], k];
		if (best > 150) pts.push([+((c * HOP) / SR).toFixed(4), Math.round((bk * SR) / N), +(best / 255).toFixed(3)]);
	}
	return pts;
};
const birdIndex = Object.fromEntries(BIRDS.map((b, i) => [b.id, i]));
const data = {
	note: 'Generated by score.mjs. Do not edit.',
	sr: SR,
	hop: HOP,
	fft: N,
	fmax: FMAX,
	bins: KMAX + 1,
	cols: COLS,
	rangeDb: RANGE_DB,
	birds: BIRDS.map((b) => b.id),
	phrases: phrases
		.filter((p) => p.role !== 'distant')
		.map((p) => ({...p, t0: +p.t0.toFixed(4), t1: +p.t1.toFixed(4), contour: contourOf(birdIndex[p.bird], p.t0, p.t1)})),
};
await mkdir(new URL('./data/', import.meta.url), {recursive: true});
await writeFile(new URL('./data/phrases.json', import.meta.url), JSON.stringify(data));
console.log(`score.wav ${sec(DURATION).toFixed(2)} s; spectra.bin ${(bin.length / 1e6).toFixed(2)} MB (${BIRDS.length} birds x ${COLS} columns x ${KMAX + 1} bins); ${data.phrases.length} phrases`);
for (const p of data.phrases) console.log(`  ${p.bird.padEnd(10)} ${p.role.padEnd(7)} ${p.t0.toFixed(2)} to ${p.t1.toFixed(2)} s, ${p.contour.length} contour points`);
