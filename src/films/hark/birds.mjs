// Synthesised birdsong from tonal syllables. Each species is a phrase generator that writes into
// its own bus (so the film can draw each bird's song separately) and returns the phrase's
// syllables, which become the film's picture data.
//
// A real songbird's syrinx makes a nearly pure tone that sweeps fast, so each syllable here is one
// sine with a pitch contour, weak 2nd and 3rd harmonics, a short attack and release, and small
// seeded variation in pitch, level and timing so no two phrases are identical.
import {Biquad, SR, mulberry32, pan} from '../../../audio/dsp.mjs';

const smooth = (x) => x * x * (3 - 2 * x);

// contour: [[u, hz], ...] with u from 0 to 1; geometric interpolation, eased between points
export const contourAt = (c, u) => {
	if (u <= c[0][0]) return c[0][1];
	for (let k = 1; k < c.length; k++) {
		if (u <= c[k][0]) {
			const [u0, f0] = c[k - 1];
			const [u1, f1] = c[k];
			const x = (u - u0) / Math.max(1e-9, u1 - u0);
			return f0 * Math.pow(f1 / f0, smooth(x));
		}
	}
	return c[c.length - 1][1];
};

// One syllable. Writes into bus; returns {t0, t1, contour} for the picture.
export const syllable = (bus, t0, dur, contour, o = {}) => {
	const {amp = 0.2, p = 0, h2 = 0.06, h3 = 0.02, attack = 0.004, release = 0.012, vibRate = 0, vibCents = 0, breath = 0, rnd, swell = 0} = o;
	const n0 = Math.round(t0 * SR);
	const n = Math.max(8, Math.round(dur * SR));
	const [gl, gr] = pan(p);
	let ph = rnd();
	const bp = breath > 0 ? new Biquad('bandpass', contourAt(contour, 0.5), 3) : null;
	const vibPhase = rnd() * Math.PI * 2;
	for (let i = 0; i < n; i++) {
		const u = i / n;
		const ts = i / SR;
		let f = contourAt(contour, u);
		if (vibCents) f *= Math.pow(2, (vibCents / 1200) * Math.sin(2 * Math.PI * vibRate * ts + vibPhase));
		ph += f / SR;
		ph -= Math.floor(ph);
		const a = Math.min(1, ts / attack) * Math.min(1, (n - i) / SR / release);
		const body = swell ? Math.pow(Math.sin(Math.PI * u), swell) : 1;
		let s = Math.sin(2 * Math.PI * ph) + h2 * Math.sin(4 * Math.PI * ph) + h3 * Math.sin(6 * Math.PI * ph);
		if (bp) s += breath * bp.process(rnd() * 2 - 1) * 3;
		const v = s * a * body * amp;
		bus.add(n0 + i, v * gl, v * gr);
	}
	return {t0, t1: t0 + dur, contour};
};

// Seeded variation helpers
const vary = (rnd, x, frac) => x * (1 + (rnd() * 2 - 1) * frac);
const jit = (rnd, s) => (rnd() * 2 - 1) * s;

// ---------- species ----------
// Each returns {t0, t1, syllables}. `p` is the pan (where the bird perches), `level` its loudness.

export const SPECIES = {
	// European robin: thin, high, liquid phrases of short notes with sudden pitch jumps
	robin(bus, t0, seed, {p = -0.2, level = 1, notes: fixed} = {}) {
		const rnd = mulberry32(seed);
		const out = [];
		let t = t0;
		const drawn = 8 + Math.floor(rnd() * 3);
		const notes = fixed ?? drawn;
		for (let k = 0; k < notes; k++) {
			const dur = 0.05 + rnd() * 0.08;
			const lo = 3000 + rnd() * 2300;
			const hi = lo + 700 + rnd() * 2100;
			const kind = Math.floor(rnd() * 4);
			const c = kind === 0 ? [[0, lo], [1, hi]] : kind === 1 ? [[0, hi], [1, lo]] : kind === 2 ? [[0, lo], [0.5, hi], [1, lo * 1.05]] : [[0, hi], [0.4, lo], [1, hi * 0.97]];
			out.push(syllable(bus, t, dur, c, {amp: vary(rnd, 0.07, 0.2) * level, p, h2: 0.04, h3: 0.01, rnd, vibRate: kind === 3 ? 55 : 0, vibCents: kind === 3 ? 130 : 0}));
			t += dur + 0.025 + rnd() * 0.05;
		}
		return {t0, t1: t, syllables: out};
	},

	// Wren: loud, fast; clear notes, a rapid trill, more notes, a lower trill
	wren(bus, t0, seed, {p = 0.5, level = 1} = {}) {
		const rnd = mulberry32(seed);
		const out = [];
		let t = t0;
		const amp = 0.06 * level;
		for (let k = 0; k < 5; k++) {
			const f = vary(rnd, k % 2 ? 5200 : 6100, 0.03);
			out.push(syllable(bus, t, 0.045, [[0, f * 1.05], [1, f * 0.93]], {amp, p, rnd}));
			t += 0.08 + jit(rnd, 0.006);
		}
		for (let k = 0; k < 18; k++) {
			out.push(syllable(bus, t, 0.022, [[0, vary(rnd, 7200, 0.02)], [1, vary(rnd, 5000, 0.02)]], {amp: amp * 0.9, p, rnd, release: 0.006}));
			t += 0.036;
		}
		for (let k = 0; k < 6; k++) {
			const f = 4200 + rnd() * 3000;
			out.push(syllable(bus, t, 0.03 + rnd() * 0.04, [[0, f], [0.5, f * (1.1 + rnd() * 0.2)], [1, f * 0.9]], {amp, p, rnd}));
			t += 0.07 + jit(rnd, 0.008);
		}
		for (let k = 0; k < 14; k++) {
			out.push(syllable(bus, t, 0.02, [[0, vary(rnd, 4800, 0.02)], [1, vary(rnd, 3700, 0.02)]], {amp: amp * 0.9, p, rnd, release: 0.006}));
			t += 0.034;
		}
		return {t0, t1: t, syllables: out};
	},

	// Blackbird: low, fluty, slurred notes, then a quiet scratchy twitter
	blackbird(bus, t0, seed, {p = 0.3, level = 1} = {}) {
		const rnd = mulberry32(seed);
		const out = [];
		let t = t0;
		const phrases = [
			[[1750, 2100], [2100, 1900], [2400, 2250, 2600], [1900, 1650]],
			[[1600, 1950, 1800], [2300, 2050], [2050, 2450, 2150], [1700, 1550]],
		];
		const melody = phrases[seed % phrases.length];
		for (const m of melody) {
			const dur = 0.16 + rnd() * 0.14;
			const c = m.map((f, i) => [i / (m.length - 1), vary(rnd, f, 0.02)]);
			out.push(syllable(bus, t, dur, c, {amp: 0.1 * level, p, h2: 0.12, h3: 0.04, attack: 0.02, release: 0.05, vibRate: 7, vibCents: 25, rnd, swell: 0.6}));
			t += dur + 0.05 + rnd() * 0.06;
		}
		t += 0.04;
		for (let k = 0; k < 6; k++) {
			const f = 5200 + rnd() * 2400;
			out.push(syllable(bus, t, 0.03, [[0, f], [1, f * (0.8 + rnd() * 0.4)]], {amp: 0.035 * level, p, rnd, breath: 0.05}));
			t += 0.055 + jit(rnd, 0.008);
		}
		return {t0, t1: t, syllables: out};
	},

	// Great tit: "tea-cher" repeated, a clear high note then a lower one
	greatTit(bus, t0, seed, {p = -0.5, level = 1} = {}) {
		const rnd = mulberry32(seed);
		const out = [];
		let t = t0;
		for (let k = 0; k < 4; k++) {
			out.push(syllable(bus, t, 0.09, [[0, vary(rnd, 5400, 0.015)], [1, vary(rnd, 5000, 0.015)]], {amp: 0.07 * level, p, rnd}));
			t += 0.12;
			out.push(syllable(bus, t, 0.11, [[0, vary(rnd, 3700, 0.015)], [1, vary(rnd, 3250, 0.015)]], {amp: 0.08 * level, p, rnd}));
			t += 0.19 + jit(rnd, 0.01);
		}
		return {t0, t1: t, syllables: out};
	},

	// Chaffinch: a descending, accelerating run that ends in a flourish
	chaffinch(bus, t0, seed, {p = 0.75, level = 1} = {}) {
		const rnd = mulberry32(seed);
		const out = [];
		let t = t0;
		const parts = [
			{n: 4, gap: 0.15, f: 5800},
			{n: 5, gap: 0.105, f: 4700},
			{n: 6, gap: 0.072, f: 3900},
		];
		for (const part of parts) {
			for (let k = 0; k < part.n; k++) {
				const f = vary(rnd, part.f, 0.02);
				out.push(syllable(bus, t, Math.min(0.06, part.gap * 0.6), [[0, f * 1.15], [1, f * 0.85]], {amp: 0.065 * level, p, rnd}));
				t += part.gap;
			}
		}
		out.push(syllable(bus, t, 0.26, [[0, 3000], [0.35, 5600], [0.6, 4200], [1, 2500]], {amp: 0.08 * level, p, rnd, vibRate: 40, vibCents: 60, release: 0.03}));
		return {t0, t1: t + 0.26, syllables: out};
	},

	// Woodpigeon: a low, breathy five-note coo, the second note longest (`short`: the first three)
	woodpigeon(bus, t0, seed, {p = -0.7, level = 1, short = false} = {}) {
		const rnd = mulberry32(seed);
		const out = [];
		let t = t0;
		// five notes, the second longest, a short pause before the last two; `short` is a quicker five
		for (const d of short ? [0.24, 0.4, 0.22, -0.14, 0.22, 0.22] : [0.3, 0.5, 0.28, -0.22, 0.28, 0.28]) {
			if (d < 0) {
				t += -d;
				continue;
			}
			const f = vary(rnd, 470, 0.015);
			out.push(syllable(bus, t, d, [[0, f * 0.94], [0.4, f * 1.06], [1, f * 0.92]], {amp: 0.14 * level, p, h2: 0.3, h3: 0.12, attack: 0.06, release: 0.12, breath: 0.12, rnd, swell: 0.8}));
			t += d + (short ? 0.045 : 0.07);
		}
		return {t0, t1: t, syllables: out};
	},
};
