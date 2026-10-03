// Offline DSP kit for film scores. Pure JS, deterministic, no dependencies.
// Everything renders into Float32Array stereo buses at SR. Times are in seconds.

export const SR = 48000;

export const mulberry32 = (seed) => {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

export const dbToGain = (db) => Math.pow(10, db / 20);
export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Bus {
	constructor(seconds) {
		this.n = Math.ceil(seconds * SR);
		this.L = new Float32Array(this.n);
		this.R = new Float32Array(this.n);
	}
	add(i, l, r) {
		if (i >= 0 && i < this.n) {
			this.L[i] += l;
			this.R[i] += r;
		}
	}
	mixInto(dest, gain = 1) {
		for (let i = 0; i < Math.min(this.n, dest.n); i++) {
			dest.L[i] += this.L[i] * gain;
			dest.R[i] += this.R[i] * gain;
		}
	}
}

// Equal-power pan, p in [-1, 1].
export const pan = (p) => {
	const a = ((p + 1) * Math.PI) / 4;
	return [Math.cos(a), Math.sin(a)];
};

// ADSR, times in seconds, returns gain at time t since note start. The release starts at `len`
// from whatever level the envelope has reached by then, so a note shorter than its attack and
// decay still ends when it should (it used to keep rising, then drop to silence in one sample).
export const adsr = (t, len, a, d, s, r) => {
	if (t < 0) return 0;
	const held = (x) => (x < a ? x / a : x < a + d ? 1 - (1 - s) * ((x - a) / d) : s);
	if (t < len) return held(t);
	const rt = t - len;
	return rt < r ? held(len) * (1 - rt / r) * (1 - rt / r) : 0;
};

// RBJ biquad. Coefficients clamp the cutoff below Nyquist, and a blow-up stops the score: an
// unstable filter writes NaN that silently poisons the whole master (seen in August 2026), and
// quietly zeroing it only hid the broken filter behind a stretch of silence.
export class Biquad {
	constructor(type, freq, q = 0.707, gainDb = 0) {
		this.type = type;
		this.x1 = this.x2 = this.y1 = this.y2 = 0;
		this.set(freq, q, gainDb);
	}
	set(freq, q = this.q ?? 0.707, gainDb = this.gainDb ?? 0) {
		this.q = q;
		this.gainDb = gainDb;
		const f = Math.min(Math.max(freq, 10), SR * 0.45);
		const w = (2 * Math.PI * f) / SR;
		const cs = Math.cos(w);
		const sn = Math.sin(w);
		const alpha = sn / (2 * q);
		const A = Math.pow(10, gainDb / 40);
		let b0, b1, b2, a0, a1, a2;
		switch (this.type) {
			case 'lowpass':
				b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
				break;
			case 'highpass':
				b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
				break;
			case 'bandpass':
				b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
				break;
			case 'peak':
				b0 = 1 + alpha * A; b1 = -2 * cs; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cs; a2 = 1 - alpha / A;
				break;
			default:
				throw new Error(`Unknown biquad ${this.type}`);
		}
		this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
	}
	process(x) {
		const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
		if (!Number.isFinite(y)) {
			throw new Error(`Biquad ${this.type} (${this.q.toFixed(2)} Q) produced a non-finite sample from input ${x}: the input is NaN or the filter is unstable`);
		}
		this.x2 = this.x1; this.x1 = x; this.y2 = this.y1;
		this.y1 = y;
		return y;
	}
}

// PolyBLEP saw: band-limited enough that pads do not alias into a buzz.
const polyBlep = (t, dt) => {
	if (t < dt) { t /= dt; return t + t - t * t - 1; }
	if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
	return 0;
};
export const sawAt = (phase, dt) => 2 * phase - 1 - polyBlep(phase, dt);

// Feedback delay network reverb: 8 lines, Householder mixing, damped. A send bus, never per voice.
export const fdnReverb = (input, {seconds = 2.8, damp = 6500, predelay = 0.018, mix = 1} = {}) => {
	const lens = [1433, 1601, 1867, 2053, 2251, 2399, 2687, 2903].map((l) => Math.round(l * 1.3));
	const g = Math.pow(10, (-3 * (lens.reduce((a, b) => a + b) / lens.length / SR)) / seconds);
	const lines = lens.map((l) => ({buf: new Float32Array(l), idx: 0, lp: 0}));
	const lpCoef = Math.exp((-2 * Math.PI * damp) / SR);
	const pre = Math.round(predelay * SR);
	const out = new Bus(input.n / SR);
	const N = lines.length;
	const outs = new Float32Array(N);
	for (let i = 0; i < input.n; i++) {
		const j = i - pre;
		const inL = j >= 0 ? input.L[j] : 0;
		const inR = j >= 0 ? input.R[j] : 0;
		let sum = 0;
		for (let k = 0; k < N; k++) {
			const ln = lines[k];
			outs[k] = ln.buf[ln.idx];
			sum += outs[k];
		}
		const h = (2 / N) * sum; // Householder: y = x - (2/N) * sum(x)
		let wl = 0, wr = 0;
		for (let k = 0; k < N; k++) {
			const ln = lines[k];
			let fb = (outs[k] - h) * g;
			ln.lp = fb * (1 - lpCoef) + ln.lp * lpCoef; // one-pole damping in the loop
			fb = ln.lp;
			const inj = k % 2 === 0 ? inL : inR;
			ln.buf[ln.idx] = fb + inj * 0.5;
			ln.idx = (ln.idx + 1) % ln.buf.length;
			if (k % 2 === 0) wl += outs[k]; else wr += outs[k];
		}
		out.L[i] = (wl / (N / 2)) * mix;
		out.R[i] = (wr / (N / 2)) * mix;
	}
	return out;
};

export const softClip = (x, drive = 1.2) => Math.tanh(x * drive) / Math.tanh(drive);

// Fail loudly on any non-finite sample instead of shipping a silent or corrupt master.
export const assertFinite = (bus, label) => {
	for (let i = 0; i < bus.n; i++) {
		if (!Number.isFinite(bus.L[i]) || !Number.isFinite(bus.R[i])) {
			throw new Error(`${label}: non-finite sample at ${(i / SR).toFixed(4)}s`);
		}
	}
};

export const writeWav24 = async (path, bus) => {
	const {writeFile} = await import('node:fs/promises');
	const n = bus.n;
	const data = Buffer.alloc(n * 2 * 3);
	let o = 0;
	for (let i = 0; i < n; i++) {
		for (const ch of [bus.L, bus.R]) {
			const v = Math.max(-1, Math.min(1, ch[i]));
			let s = Math.round(v * 8388607);
			if (s < 0) s += 1 << 24;
			data[o++] = s & 255;
			data[o++] = (s >> 8) & 255;
			data[o++] = (s >> 16) & 255;
		}
	}
	const h = Buffer.alloc(44);
	h.write('RIFF', 0);
	h.writeUInt32LE(36 + data.length, 4);
	h.write('WAVE', 8);
	h.write('fmt ', 12);
	h.writeUInt32LE(16, 16);
	h.writeUInt16LE(1, 20);
	h.writeUInt16LE(2, 22);
	h.writeUInt32LE(SR, 24);
	h.writeUInt32LE(SR * 2 * 3, 28);
	h.writeUInt16LE(6, 32);
	h.writeUInt16LE(24, 34);
	h.write('data', 36);
	h.writeUInt32LE(data.length, 40);
	await writeFile(path, Buffer.concat([h, data]));
};
