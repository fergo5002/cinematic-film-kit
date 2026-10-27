// Neap's score: a bed under the voice, written from the same word timings the picture keys on, so
// every sound lands on its moment by construction. Run: npm run score -- neap (after narrate).
// Writes public/films/neap/score.wav (48 kHz, 24-bit, exactly the film's length).
//
// The shape: the sea is heard alone before the first word and swells as the light rides the tide,
// then stops dead with the water on "stops"; a single low bell rings in the pause after it; a
// quieter sea returns while the voice explains; and after the last word the music takes the room
// with a hit and the chord opening up, then fades before the cut to black. Everything is
// ducked 10 dB under the voice (audio/voice.mjs), and the sounds that mark a moment sit in the
// pauses, never on top of a word.
import {mkdir} from 'node:fs/promises';
import {DURATION, END, FPS} from './beatmap.ts';
import {Biquad, Bus, SR, adsr, assertFinite, dbToGain, fdnReverb, midiToHz, mulberry32, pan, sawAt, softClip, writeWav24} from '../../../audio/dsp.mjs';
import {duckUnderSpeech, narrationWords} from '../../../audio/voice.mjs';

const LEN = DURATION / FPS;
const rnd = mulberry32(2152);
const words = narrationWords(new URL('./data/narration.json', import.meta.url));
if (!words.length) throw new Error('src/films/neap/data/narration.json is missing: run npm run narrate -- neap first');
const bare = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const word = (text) => {
	const w = words.find((x) => bare(x.text) === bare(text));
	if (!w) throw new Error(`the narration has no "${text}"`);
	return w;
};
const T = {
	ride: word('Twice').start,
	stops: word('stops').start,
	stopsEnd: word('stops').end,
	when: word('when').start,
	go: word('Go').start,
	close: word('rests').end + END.close,
	black: END.black / FPS,
};

const dry = new Bus(LEN);
const send = new Bus(LEN);
const pad = new Bus(LEN);

// ---- the chord: F major nine, detuned saws through a slowly opening low-pass ----
const voice = (bus, midi, t0, t1, gain, p, {attack = 2, release = 0.8, from = 260, to = 1100} = {}) => {
	for (let d = 0; d < 2; d++) {
		const f = midiToHz(midi + (d ? 0.06 : -0.06));
		const dt = f / SR;
		const [gl, gr] = pan(Math.max(-1, Math.min(1, p + (d ? 0.2 : -0.2))));
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
			const v = lp.process(0.6 * sawAt(ph, dt) + 0.4 * Math.sin(2 * Math.PI * ph)) * adsr(t, len, attack, 0.4, 0.85, release) * gain;
			bus.add(i, v * gl, v * gr);
		}
	}
};
const CHORD = [[41, 0.16], [48, 0.128], [52, 0.09], [55, 0.08], [57, 0.064], [60, 0.048]];
CHORD.forEach(([m, g], k) => voice(pad, m, 0.05, T.close - 0.2, g, (k - 2.5) * 0.28, {attack: 3}));

// ---- the sea: two bands of filtered noise breathing slowly, swelling as the light rides the
// tide, then stopping dead with the water; a quieter sea comes back for the explanation ----
{
	const lowL = new Biquad('bandpass', 420, 0.7);
	const lowR = new Biquad('bandpass', 460, 0.7);
	const hiL = new Biquad('bandpass', 2200, 1.4);
	const hiR = new Biquad('bandpass', 2400, 1.4);
	const stop0 = Math.floor((T.stops + 0.02) * SR);
	const stop1 = Math.floor((T.stops + 0.32) * SR);
	const back0 = Math.floor(T.when * SR);
	const end0 = Math.floor((T.go - 0.4) * SR);
	for (let i = 0; i < dry.n; i++) {
		const t = i / SR;
		const breath = 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.13 * t - 1.2);
		let g;
		// heard alone before the first word, then swelling as the light rides the tide
		if (i < stop0) g = 0.64 * Math.min(1, t / 1.2) + 0.64 * Math.min(1, Math.max(0, (t - T.ride + 1.5) / (T.stops - T.ride + 1.5)));
		else if (i < stop1) g = (1.28 * (stop1 - i)) / (stop1 - stop0);
		else if (i < back0) g = 0;
		else if (i < end0) g = 0.45 * Math.min(1, (i - back0) / (1.5 * SR));
		else g = Math.max(0, 0.45 * (1 - (i - end0) / (0.4 * SR)));
		if (g <= 0) {
			lowL.process(0);
			lowR.process(0);
			hiL.process(0);
			hiR.process(0);
			continue;
		}
		const a = breath * g;
		dry.add(i, (lowL.process(rnd() * 2 - 1) + 0.25 * hiL.process(rnd() * 2 - 1)) * a, (lowR.process(rnd() * 2 - 1) + 0.25 * hiR.process(rnd() * 2 - 1)) * a);
	}
}

// ---- one low bell, in the pause after "stops" ----
const bell = (t0, midi, gain, p) => {
	const f = midiToHz(midi);
	const [gl, gr] = pan(p);
	const n0 = Math.floor(t0 * SR);
	for (let i = 0; i < 3.2 * SR; i++) {
		const t = i / SR;
		const env = Math.min(1, t / 0.004) * Math.exp(-t * 1.6);
		const v = (Math.sin(2 * Math.PI * f * t) + 0.42 * Math.sin(2 * Math.PI * 2.76 * f * t) * Math.exp(-t * 3) + 0.2 * Math.sin(2 * Math.PI * 5.4 * f * t) * Math.exp(-t * 6)) * env * gain;
		dry.add(n0 + i, v * gl, v * gr);
		send.add(n0 + i, v * gl * 0.6, v * gr * 0.6);
	}
};
bell(T.stopsEnd + 0.08, 72, 0.24, 0.15);

// ---- the close: once the voice has finished, the music takes the room. A hit (transient, body,
// sub, and a harmonic so laptops hear the sub), the chord opening up brighter and fuller, a bell,
// and a fade before the cut to black. The loudest moment of the film, and the only one the voice
// does not lead, because the voice is done.
{
	const t0 = T.close;
	const t1 = T.black - 0.75;
	[[36, 0.3], [48, 0.54], [55, 0.47], [60, 0.39], [64, 0.33], [67, 0.26], [72, 0.15], [76, 0.09]].forEach(([m, g], k) => voice(pad, m, t0, t1, g, (k - 3) * 0.28, {attack: 0.35, release: 0.6, from: 900, to: 3200}));
	bell(t0 + 0.02, 60, 0.2, -0.1);
	bell(t0 + 0.4, 67, 0.12, 0.2);
	const n0 = Math.floor(t0 * SR);
	const hp = new Biquad('bandpass', 3600, 1.1);
	for (let i = 0; n0 + i < dry.n && i < 3 * SR; i++) {
		const t = i / SR;
		const transient = t < 0.012 ? hp.process(rnd() * 2 - 1) * (1 - t / 0.012) * 0.9 : 0;
		const body = Math.sin(2 * Math.PI * 150 * t) * Math.exp(-t * 14) * 0.32;
		const sub = Math.sin(2 * Math.PI * (38 + 22 * Math.exp(-t * 6)) * t) * Math.exp(-t * 1.4) * 0.3;
		const harm = Math.sin(2 * Math.PI * 2 * (38 + 22 * Math.exp(-t * 6)) * t) * Math.exp(-t * 2.2) * 0.22;
		const v = softClip(transient + body + sub + harm, 1.3) * 0.62;
		dry.add(n0 + i, v, v);
		send.add(n0 + i, (transient + body) * 0.5, (transient + body) * 0.5);
	}
}

// ---- mix: chord into the dry bus and the send, one reverb for everything ----
pad.mixInto(dry, 1);
pad.mixInto(send, 0.45);
const verb = fdnReverb(send, {seconds: 3, damp: 5200, predelay: 0.024});
const master = new Bus(LEN);
dry.mixInto(master, 1);
verb.mixInto(master, 0.38);

// Silent before the cut to black. A narrated film's score is NOT peak-normalised: its level is set
// against the voice (which narrate puts at the film's loudness), so the bed sits where it was
// designed to under speech and the close opens up above it. The master sets the final loudness.
const GAIN = 0.72;
const fadeEnd = Math.floor((T.black - 0.05) * SR);
const fadeLen = Math.floor(0.7 * SR);
let peak = 0;
for (let i = 0; i < master.n; i++) {
	const g = i >= fadeEnd ? 0 : i >= fadeEnd - fadeLen ? (fadeEnd - i) / fadeLen : 1;
	master.L[i] = softClip(master.L[i] * g * GAIN, 1.1);
	master.R[i] = softClip(master.R[i] * g * GAIN, 1.1);
	peak = Math.max(peak, Math.abs(master.L[i]), Math.abs(master.R[i]));
}
if (peak > dbToGain(-1)) throw new Error(`the score peaks at ${(20 * Math.log10(peak)).toFixed(1)} dBFS: turn GAIN down`);
// The voice leads: the bed dips under every spoken phrase and comes back in the pauses.
duckUnderSpeech(master, words);
assertFinite(master, 'score');
await mkdir(new URL('../../../public/films/neap/', import.meta.url), {recursive: true});
await writeWav24(new URL('../../../public/films/neap/score.wav', import.meta.url), master);
console.log(`public/films/neap/score.wav: ${LEN.toFixed(2)} s, ducked under ${words.length} spoken words, peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS`);
