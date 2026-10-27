// Word timings from the voice model. Kokoro predicts a duration for every input token (start pad,
// phoneme characters, end pad) in frames of 600 samples at 24 kHz. Phoneme words are separated by
// spaces, but espeak sometimes joins short function words ("on the" arrives as one group), so words
// are aligned to groups with a small dynamic programme that allows merges and splits, using each
// word's own phoneme length. When that fails, proportionalTimes() spreads the line's words over its
// measured length by their phoneme lengths: good enough for captions, not for cutting to a word.
// Kokoro's punctuation tokens (its vocabulary includes the em dash and the ellipsis).
const PUNCT = new Set([...';:,.!?\u2014\u2026"()\u201C\u201D\u00A1\u00BF\u00AB\u00BB']);
const STRESS = /[\u02C8\u02CC]/g;

export const tokenSpans = (durations, {totalSamples, sampleRate = 24000, samplesPerFrame = 600} = {}) => {
	const sum = durations.reduce((a, b) => a + b, 0);
	const scale = totalSamples && sum > 0 ? totalSamples / (sum * samplesPerFrame) : 1;
	const secPerFrame = (samplesPerFrame / sampleRate) * scale;
	let t = 0;
	return durations.map((d) => {
		const s = t;
		t += d * secPerFrame;
		return [s, t];
	});
};

// phonemes[i] belongs to token i + 1 (token 0 is the start pad).
export const phonemeGroups = (phonemes, spans) => {
	const groups = [];
	let cur = null;
	const close = () => {
		if (cur && cur.tokens.length) groups.push({ph: cur.ph, start: cur.tokens[0][0], end: cur.tokens.at(-1)[1], tokens: cur.tokens});
		cur = null;
	};
	[...phonemes].forEach((ch, i) => {
		if (ch === ' ') return close();
		cur ??= {ph: '', tokens: []};
		if (PUNCT.has(ch)) return;
		cur.ph += ch;
		cur.tokens.push(spans[i + 1]);
	});
	close();
	return groups;
};

export const phonemeLength = (ph) => [...ph.replace(STRESS, '')].filter((c) => !PUNCT.has(c) && c !== ' ').length;

const lenCost = (a, b) => Math.abs(Math.log((a + 1) / (b + 1)));

// Split one group's tokens between k words in proportion to their expected lengths.
const share = (group, expected) => {
	const T = group.tokens.length;
	const total = expected.reduce((a, b) => a + b, 0) || expected.length;
	const bounds = [0];
	let cum = 0;
	for (let i = 0; i < expected.length - 1; i++) {
		cum += expected[i] || 1;
		const lo = bounds.at(-1) + 1;
		const hi = T - (expected.length - 1 - i);
		bounds.push(Math.min(hi, Math.max(lo, Math.round((cum / total) * T))));
	}
	bounds.push(T);
	return expected.map((_, i) => {
		const a = Math.min(bounds[i], T - 1);
		const b = Math.max(a + 1, bounds[i + 1]);
		return {start: group.tokens[a][0], end: group.tokens[b - 1][1]};
	});
};

// words: [{expected}] (the phoneme length of each word said alone). Returns [{start, end}] or null.
export const alignWordsToGroups = (words, groups, {maxMeanCost = 0.6} = {}) => {
	const n = words.length;
	const m = groups.length;
	if (!n) return [];
	if (!m) return null;
	// No one-to-one shortcut when the counts match: a merged group plus a split group also gives
	// equal counts. The programme includes the one-to-one path, so a clean line still takes it, and
	// the mean-cost check applies to every line.
	const glen = groups.map((g) => phonemeLength(g.ph));
	const dp = Array.from({length: n + 1}, () => new Array(m + 1).fill(Infinity));
	const back = Array.from({length: n + 1}, () => new Array(m + 1).fill(null));
	dp[0][0] = 0;
	for (let i = 0; i <= n; i++) {
		for (let j = 0; j <= m; j++) {
			const base = dp[i][j];
			if (base === Infinity) continue;
			for (let k = 1; k <= 3 && i + k <= n && j + 1 <= m; k++) {
				const exp = words.slice(i, i + k).reduce((a, w) => a + w.expected, 0);
				const c = base + lenCost(exp, glen[j]) + 0.1 * (k - 1);
				if (c < dp[i + k][j + 1]) {
					dp[i + k][j + 1] = c;
					back[i + k][j + 1] = {i, j, kind: 'merge', k};
				}
			}
			if (i + 1 <= n && j + 2 <= m) {
				const c = base + lenCost(words[i].expected, glen[j] + glen[j + 1]) + 0.3;
				if (c < dp[i + 1][j + 2]) {
					dp[i + 1][j + 2] = c;
					back[i + 1][j + 2] = {i, j, kind: 'split'};
				}
			}
		}
	}
	if (dp[n][m] === Infinity || dp[n][m] / n > maxMeanCost) return null;
	const out = new Array(n);
	for (let i = n, j = m; i > 0; ) {
		const b = back[i][j];
		if (b.kind === 'split') out[b.i] = {start: groups[b.j].start, end: groups[b.j + 1].end};
		else {
			const parts = b.k === 1 ? [{start: groups[b.j].start, end: groups[b.j].end}] : share(groups[b.j], words.slice(b.i, i).map((w) => w.expected));
			parts.forEach((p, q) => (out[b.i + q] = p));
		}
		i = b.i;
		j = b.j;
	}
	return out;
};

// The fallback: spread a line's words over its length by their phoneme lengths, in order, gapless.
export const proportionalTimes = (words, duration) => {
	const weights = words.map((w) => Math.max(1, w.expected || 1));
	const total = weights.reduce((a, b) => a + b, 0);
	let t = 0;
	return weights.map((w, i) => {
		const start = t;
		t = i === weights.length - 1 ? duration : t + (duration * w) / total;
		return {start, end: t};
	});
};

// Kokoro gives the pause before punctuation (and the silence at the end of a line) to the last
// phoneme of the word, not to the punctuation token. So where a group's last token is long, end the
// word where the audio first stays below thresholdDb for holdMs inside that token.
export const refineGroupEnds = (groups, samples, sampleRate, {minTokenS = 0.12, thresholdDb = -40, holdMs = 30, windowMs = 5} = {}) => {
	const thr = 10 ** (thresholdDb / 20);
	const win = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
	const need = Math.max(1, Math.round(holdMs / windowMs));
	return groups.map((g) => {
		const [ts, te] = g.tokens.at(-1);
		if (te - ts < minTokenS) return g;
		const a = Math.round(ts * sampleRate);
		const b = Math.min(samples.length, Math.round(te * sampleRate));
		let quiet = 0;
		for (let s = a; s + win <= b; s += win) {
			let peak = 0;
			for (let i = s; i < s + win; i++) peak = Math.max(peak, Math.abs(samples[i]));
			quiet = peak < thr ? quiet + 1 : 0;
			if (quiet === need) {
				const end = Math.max(ts + 0.02, (s - (need - 1) * win) / sampleRate);
				if (end >= te) return g;
				return {...g, end, tokens: [...g.tokens.slice(0, -1), [ts, end]]};
			}
		}
		return g;
	});
};
