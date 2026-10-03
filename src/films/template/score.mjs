// The template film's score, synthesised from the SAME beatmap the picture renders from, so every
// sound lands on its frame by construction. Run: npm run score -- template
// Writes public/films/template/score.wav (48 kHz, 24-bit, exactly the film's length).
//
// The shape is the point: a quiet chord, a tick on every beat while the words land, a riser, a
// dead stop for the breath, then the hit and a long resolve. Quiet against loud is what gives the
// mix its loudness range (the audit wants 6 to 13 LU); a level loop measures about 2.
import {mkdir} from 'node:fs/promises';
import {DURATION, M, sec} from './beatmap.ts';
import {Biquad, Bus, SR, adsr, assertFinite, dbToGain, fdnReverb, midiToHz, mulberry32, pan, sawAt, softClip, writeWav24} from '../../../audio/dsp.mjs';

const LEN = sec(DURATION);
const rnd = mulberry32(1729); // seeded: the same score every run
const at = (frames) => sec(frames);

const dry = new Bus(LEN);
const send = new Bus(LEN); // the reverb send
const pad = new Bus(LEN);

// ---- the chord: D major nine, detuned saws through a slowly opening low-pass ----
const voice = (bus, midi, t0, t1, gain, p, {attack = 1.6, release = 0.12, from = 300, to = 1600} = {}) => {
	for (let d = 0; d < 2; d++) {
		const f = midiToHz(midi + (d ? 0.07 : -0.07));
		const dt = f / SR;
		const [gl, gr] = pan(Math.max(-1, Math.min(1, p + (d ? 0.18 : -0.18))));
		const lp = new Biquad('lowpass', from, 0.6);
		let ph = rnd();
		const n0 = Math.floor(t0 * SR);
		const n1 = Math.min(bus.n, Math.floor((t1 + release) * SR));
		const len = t1 - t0;
		for (let i = n0; i < n1; i++) {
			const t = (i - n0) / SR;
			if (i % 64 === 0) lp.set(from + (to - from) * Math.min(1, t / len));
			ph += dt;
			if (ph >= 1) ph -= 1;
			const v = lp.process(0.7 * sawAt(ph, dt) + 0.3 * Math.sin(2 * Math.PI * ph)) * adsr(t, len, attack, 0.3, 0.9, release) * gain;
			bus.add(i, v * gl, v * gr);
		}
	}
};
[[38, 0.03], [45, 0.024], [52, 0.018], [54, 0.016], [57, 0.013], [61, 0.01]].forEach(([m, g], k) => voice(pad, m, 0.05, at(M.breath) - 0.12, g, (k - 2.5) * 0.3, {attack: 2.4}));

// ---- the clock you can hear: a tick on every beat until the breath ----
const ticks = M.ticks.map(at);
for (const t0 of ticks) {
	const bp = new Biquad('bandpass', 2600, 3);
	const n0 = Math.floor(t0 * SR);
	for (let i = 0; i < 0.09 * SR; i++) {
		const t = i / SR;
		const v = (bp.process(rnd() * 2 - 1) * 0.9 + Math.sin(2 * Math.PI * 1650 * t) * 0.35) * Math.exp(-t * 70) * 0.34;
		dry.add(n0 + i, v * 0.85, v);
		send.add(n0 + i, v * 0.3, v * 0.3);
	}
}

// ---- each word: a plucked note climbing the chord, with a soft low thump under it ----
const pluck = (t0, midi, gain, p) => {
	const f = midiToHz(midi);
	const [gl, gr] = pan(p);
	const n0 = Math.floor(t0 * SR);
	for (let i = 0; i < 1.6 * SR; i++) {
		const t = i / SR;
		const env = Math.min(1, t / 0.003) * Math.exp(-t * 3.2);
		const v = (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * 2 * f * t) * Math.exp(-t * 6) + 0.12 * Math.sin(2 * Math.PI * 3 * f * t) * Math.exp(-t * 9)) * env * gain;
		dry.add(n0 + i, v * gl, v * gr);
		send.add(n0 + i, v * gl * 0.5, v * gr * 0.5);
	}
};
const thump = (t0, gain) => {
	const n0 = Math.floor(t0 * SR);
	let ph = 0;
	for (let i = 0; i < 0.45 * SR; i++) {
		const t = i / SR;
		ph += (48 + 40 * Math.exp(-t * 30)) / SR;
		const v = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 9) * gain;
		dry.add(n0 + i, v, v);
	}
};
[78, 81, 85, 88].forEach((midi, k) => {
	pluck(at(M.words[k]), midi, 0.1, -0.3 + 0.2 * k);
	thump(at(M.words[k]), 0.14);
});

// ---- duck the chord under each word, so the words read in the sound as well ----
for (let i = 0; i < pad.n; i++) {
	let g = 1;
	for (const w of M.words) {
		const t = i / SR - at(w);
		if (t >= 0 && t < 0.6) g = Math.min(g, 1 - (1 - dbToGain(-4)) * Math.exp(-t * 7));
	}
	pad.L[i] *= g;
	pad.R[i] *= g;
}

// ---- the riser: filtered noise sweeping up into the breath, and stopping dead on it ----
{
	const end = at(M.breath);
	const start = at(M.riser);
	const bpL = new Biquad('bandpass', 300, 2.4);
	const bpR = new Biquad('bandpass', 300, 2.4);
	const n0 = Math.floor(start * SR);
	const n1 = Math.floor(end * SR);
	for (let i = n0; i < n1; i++) {
		const p = (i - n0) / (n1 - n0);
		if (i % 32 === 0) {
			bpL.set(300 * Math.pow(22, p), 2.4);
			bpR.set(320 * Math.pow(21, p), 2.4);
		}
		const g = p * p * 0.32;
		dry.add(i, bpL.process(rnd() * 2 - 1) * g, bpR.process(rnd() * 2 - 1) * g);
	}
}

// ---- the hit: transient, body and sub (one layer alone always sounds cheap) ----
{
	const t0 = at(M.hit);
	const n0 = Math.floor(t0 * SR);
	const hp = new Biquad('bandpass', 3800, 1.1);
	for (let i = 0; n0 + i < dry.n; i++) {
		const t = i / SR;
		const transient = t < 0.01 ? hp.process(rnd() * 2 - 1) * (1 - t / 0.01) * 0.8 : 0;
		const body = Math.sin(2 * Math.PI * 165 * t) * Math.exp(-t * 16) * 0.3;
		const sub = Math.sin(2 * Math.PI * (36 + 24 * Math.exp(-t * 7)) * t) * Math.exp(-t * 1.5) * 0.62;
		const harm = Math.sin(2 * Math.PI * 2 * (36 + 24 * Math.exp(-t * 7)) * t) * Math.exp(-t * 2.4) * 0.2; // audible on laptop speakers
		const v = softClip(transient + body + sub + harm, 1.3) * 0.85;
		dry.add(n0 + i, v, v);
		send.add(n0 + i, (transient + body) * 0.6, (transient + body) * 0.6);
	}
	// the chord resolves, voiced higher and brighter, and rings almost to the cut
	[[50, 0.05], [57, 0.042], [62, 0.034], [66, 0.028], [69, 0.022], [76, 0.012]].forEach(([m, g], k) =>
		voice(pad, m, t0, at(M.cut) - 0.9, g, (k - 2.5) * 0.3, {attack: 0.02, release: 0.8, from: 2600, to: 900}),
	);
	pluck(t0 + 0.02, 93, 0.09, 0.25);
	pluck(t0 + 0.13, 88, 0.07, -0.25);
}

// ---- mix: chord into the dry bus and the send, one reverb for everything ----
pad.mixInto(dry, 1);
pad.mixInto(send, 0.45);
const verb = fdnReverb(send, {seconds: 2.4, damp: 5600, predelay: 0.02});
const master = new Bus(LEN);
dry.mixInto(master, 1);
verb.mixInto(master, 0.4);

// The breath must be silent, so the reverb tail is cut with the music; the end fades out before
// the picture cuts to black.
const breath0 = Math.floor(at(M.breath) * SR);
const breath1 = Math.floor(at(M.hit) * SR);
const cut = Math.floor(at(M.cut) * SR);
const fade = Math.floor(0.05 * SR);
let peak = 0;
for (let i = 0; i < master.n; i++) {
	let g = 1;
	if (i >= breath0 - fade && i < breath1) g = i < breath0 ? (breath0 - i) / fade : 0;
	if (i >= cut - Math.floor(0.6 * SR)) g *= Math.max(0, (cut - i) / Math.floor(0.6 * SR));
	master.L[i] = softClip(master.L[i] * g, 1.1);
	master.R[i] = softClip(master.R[i] * g, 1.1);
	peak = Math.max(peak, Math.abs(master.L[i]), Math.abs(master.R[i]));
}
// Peak-normalise to -3 dBFS. Loudness is set later by the master (npm run master).
const norm = dbToGain(-3) / (peak || 1);
for (let i = 0; i < master.n; i++) {
	master.L[i] *= norm;
	master.R[i] *= norm;
}
assertFinite(master, 'score');
await mkdir(new URL('../../../public/films/template/', import.meta.url), {recursive: true});
await writeWav24(new URL('../../../public/films/template/score.wav', import.meta.url), master);
console.log(`public/films/template/score.wav: ${LEN.toFixed(2)} s, ${ticks.length} ticks, ${M.words.length} words, peak normalised from ${peak.toFixed(3)}`);
