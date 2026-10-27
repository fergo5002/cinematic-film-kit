// Energy anchors: the one timing reference the voice model does not control. Wherever the
// narration falls silent (between lines, at pause marks, at most commas), the word before the
// silence must end at its start and the word after must begin at its end. Measuring word edges
// against those points says how far the timings sit from the audio, at pauses only: boundaries
// between words spoken without a gap cannot be checked this way.
export const findSilences = (x, sr, {thresholdDb = -45, minS = 0.06, windowMs = 10} = {}) => {
	const thr = 10 ** (thresholdDb / 20);
	const win = Math.max(1, Math.round((sr * windowMs) / 1000));
	const out = [];
	let runStart = -1;
	for (let s = 0; s < x.length; s += win) {
		let peak = 0;
		const e = Math.min(x.length, s + win);
		for (let i = s; i < e; i++) peak = Math.max(peak, Math.abs(x[i]));
		if (peak < thr) {
			if (runStart < 0) runStart = s;
		} else if (runStart >= 0) {
			if ((s - runStart) / sr >= minS) out.push({start: runStart / sr, end: s / sr});
			runStart = -1;
		}
	}
	if (runStart >= 0 && (x.length - runStart) / sr >= minS) out.push({start: runStart / sr, end: x.length / sr});
	return out;
};

// Each silence is credited to exactly one word boundary: the gap it overlaps most, or failing that
// the nearest gap within slackS. Within a boundary the previous word's end is checked against the
// first silence and the next word's start against the last. Silences under minS (the closure of a
// stop consonant) are ignored.
export const anchorCheck = (words, x, sr, {slackS = 0.3, minS = 0.1, ...opts} = {}) => {
	const duration = x.length / sr;
	const sil = findSilences(x, sr, {minS, ...opts});
	const gaps = [];
	for (let i = 0; i <= words.length; i++) gaps.push({prev: words[i - 1], next: words[i], a: i ? words[i - 1].end : 0, b: i < words.length ? words[i].start : duration, sil: []});
	for (const q of sil) {
		let best = null;
		for (const g of gaps) {
			const overlap = Math.min(q.end, g.b) - Math.max(q.start, g.a);
			const dist = Math.max(0, g.a - q.end, q.start - g.b);
			const score = overlap > 0 ? -overlap : dist;
			if (dist <= slackS && (!best || score < best.score)) best = {g, score};
		}
		if (best) best.g.sil.push(q);
	}
	const points = [];
	for (const g of gaps) {
		if (!g.sil.length) continue;
		const first = g.sil[0];
		const last = g.sil.at(-1);
		if (g.prev && first.start > 0) points.push({word: g.prev.text, edge: 'end', energy: first.start, error_ms: Math.round((g.prev.end - first.start) * 1000)});
		if (g.next && last.end < duration) points.push({word: g.next.text, edge: 'start', energy: last.end, error_ms: Math.round((g.next.start - last.end) * 1000)});
	}
	const abs = points.map((p) => Math.abs(p.error_ms)).sort((a, b) => a - b);
	const mean = (edge) => {
		const e = points.filter((p) => p.edge === edge);
		return e.length ? Math.round(e.reduce((a, p) => a + p.error_ms, 0) / e.length) : null;
	};
	return {
		anchors: points.length,
		median_abs_ms: abs.length ? abs[Math.floor((abs.length - 1) / 2)] : null,
		max_abs_ms: abs.length ? abs.at(-1) : null,
		mean_start_ms: mean('start'),
		mean_end_ms: mean('end'),
		note: `error = word timing minus the energy boundary (silence below -45 dBFS for ${minS * 1000} ms or more); positive means late.`,
		points,
	};
};
