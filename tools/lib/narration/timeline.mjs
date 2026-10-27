// Lays the voiced lines end to end. A pause mark sets the silence between the lines either side of
// it exactly (several in a row add up); lines with no pause mark between them get the default gap.
// Each line's audio is trimmed to its speech first, so a gap is a gap.
export const assemble = (items, {gap = 0.45, lead = 0.2, tail = 0.5} = {}) => {
	let t = lead;
	let pending = null;
	let pendingLine = null;
	let spoken = false;
	const segments = [];
	const words = [];
	const pauses = [];
	const flushPause = () => {
		pauses.push({start: t, end: t + pending, seconds: pending, line: pendingLine});
		t += pending;
		pending = null;
	};
	for (const it of items) {
		if (it.type === 'pause') {
			pending = (pending ?? 0) + it.seconds;
			pendingLine ??= it.line;
			continue;
		}
		if (pending !== null) flushPause();
		else if (spoken) t += gap;
		pendingLine = null;
		segments.push({...it, offset: t});
		for (const w of it.words) words.push({...w, start: w.start + t, end: w.end + t, line: it.line});
		t += it.duration;
		spoken = true;
	}
	if (pending !== null) flushPause();
	return {segments, words, pauses, duration: t + tail};
};

// First and last sample of speech (a window's peak above thresholdDb), widened by padMs.
export const trimSilence = (samples, sampleRate, {thresholdDb = -50, padMs = 20, windowMs = 10} = {}) => {
	const thr = 10 ** (thresholdDb / 20);
	const win = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
	const pad = Math.round((sampleRate * padMs) / 1000);
	let first = -1;
	let last = -1;
	for (let s = 0; s < samples.length; s += win) {
		let peak = 0;
		const e = Math.min(samples.length, s + win);
		for (let i = s; i < e; i++) peak = Math.max(peak, Math.abs(samples[i]));
		if (peak >= thr) {
			if (first < 0) first = s;
			last = e;
		}
	}
	if (first < 0) return {start: 0, end: 0};
	return {start: Math.max(0, first - pad), end: Math.min(samples.length, last + pad)};
};
