// Word timings from the voice model's own phoneme durations, and the fallback when they do not
// line up with the script's words.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {alignWordsToGroups, phonemeGroups, proportionalTimes, refineGroupEnds, tokenSpans} from '../lib/narration/align.mjs';

// Phonemes "ab cd." with a pad token at each end: tokens = [pad, a, b, ' ', c, d, '.', pad]
test('token spans follow the durations and scale to the real sample count', () => {
	const spans = tokenSpans([2, 1, 1, 1, 1, 1, 1, 2], {totalSamples: 6000, sampleRate: 1000, samplesPerFrame: 500});
	// 10 frames x 500 = 5000 predicted samples against 6000 real ones, so a frame lasts 0.6 s
	assert.equal(spans.length, 8);
	assert.ok(Math.abs(spans[0][1] - 1.2) < 1e-9);
	assert.ok(Math.abs(spans.at(-1)[1] - 6) < 1e-9);
});

test('phoneme groups split on spaces and drop punctuation from their edges', () => {
	const spans = tokenSpans([2, 1, 1, 1, 1, 1, 1, 2], {totalSamples: 5000, sampleRate: 1000, samplesPerFrame: 500});
	const g = phonemeGroups('ab cd.', spans);
	assert.deepEqual(g.map((x) => x.ph), ['ab', 'cd']);
	assert.ok(Math.abs(g[0].start - 1) < 1e-9 && Math.abs(g[0].end - 2) < 1e-9);
	assert.ok(Math.abs(g[1].start - 2.5) < 1e-9 && Math.abs(g[1].end - 3.5) < 1e-9);
});

const groupsOf = (list) => {
	let t = 0;
	return list.map((ph) => {
		const tokens = [...ph].map(() => [t, (t += 0.1)]);
		t += 0.05;
		return {ph, start: tokens[0][0], end: tokens.at(-1)[1], tokens};
	});
};

test('a long last token that holds a pause is cut where the audio goes silent', () => {
	// Kokoro gives the pause before a comma to the last phoneme of the word, not to the comma.
	const sr = 1000;
	const x = new Float32Array(3000);
	for (let i = 0; i < 1100; i++) x[i] = 0.3 * Math.sin(i * 0.7);
	for (let i = 1600; i < 3000; i++) x[i] = 0.3 * Math.sin(i * 0.7);
	const groups = [
		{ph: 'hˈɑːbə', start: 0.5, end: 1.5, tokens: [[0.5, 0.8], [0.8, 1.0], [1.0, 1.5]]},
		{ph: 'fɹɒm', start: 1.6, end: 2.0, tokens: [[1.6, 1.7], [1.7, 2.0]]},
	];
	const out = refineGroupEnds(groups, x, sr);
	assert.ok(out[0].end >= 1.1 && out[0].end <= 1.13, `end ${out[0].end}`);
	assert.equal(out[0].tokens.at(-1)[1], out[0].end);
	assert.equal(out[1].end, 2.0, 'a group with no silence inside keeps its end');
});

test('one group per word maps one to one', () => {
	const g = groupsOf(['wˈʌn', 'tˈaɪdəl', 'lˈaɪn']);
	const r = alignWordsToGroups([{expected: 3}, {expected: 6}, {expected: 4}], g);
	assert.equal(r.length, 3);
	assert.equal(r[1].start, g[1].start);
	assert.equal(r[2].end, g[2].end);
});

test('a merged group ("on the" as one group) is shared between its words in order', () => {
	const g = groupsOf(['ɹɪtˈɜːnz', 'ɒnðə', 'ɹˈɪðəm']);
	const r = alignWordsToGroups([{expected: 6}, {expected: 2}, {expected: 2}, {expected: 5}], g);
	assert.ok(r, 'alignment returned null');
	assert.equal(r[1].start, g[1].start);
	assert.equal(r[2].end, g[1].end);
	assert.ok(r[1].end <= r[2].start + 1e-9 && r[1].end > r[1].start);
	assert.equal(r[3].start, g[2].start);
});

test('a hopeless mismatch returns null so the caller can fall back', () => {
	assert.equal(alignWordsToGroups([{expected: 5}, {expected: 5}, {expected: 5}, {expected: 5}, {expected: 5}], groupsOf(['a'])), null);
});

test('equal word and group counts still go through the cost check', () => {
	// Three words, three groups, lengths reversed: a one-to-one map would be confidently wrong.
	assert.equal(alignWordsToGroups([{expected: 1}, {expected: 1}, {expected: 20}], groupsOf(['abcdefghijklmnopqrst', 'a', 'b'])), null);
});

test('equal counts from a merge and a split together still give each word its own sound', () => {
	// espeak joins "on the" and splits "everywhere": four words meet four groups.
	const g = groupsOf(['ɹɪtˈɜːnz', 'ɒnðə', 'ɛvɹi', 'wɛə']);
	const r = alignWordsToGroups([{expected: 6}, {expected: 2}, {expected: 2}, {expected: 8}], g);
	assert.ok(r, 'alignment returned null');
	assert.equal(r[0].start, g[0].start);
	assert.equal(r[1].start, g[1].start);
	assert.equal(r[2].end, g[1].end, '"the" ends with the merged group');
	assert.equal(r[3].start, g[2].start, '"everywhere" starts on the first half of the split');
	assert.equal(r[3].end, g[3].end);
});

test('the proportional fallback spreads a line by each word\'s length, in order, edge to edge', () => {
	const r = proportionalTimes([{expected: 2}, {expected: 6}, {expected: 2}], 2.0);
	assert.equal(r.length, 3);
	assert.equal(r[0].start, 0);
	assert.ok(Math.abs(r.at(-1).end - 2) < 1e-9);
	for (let i = 1; i < r.length; i++) assert.ok(Math.abs(r[i].start - r[i - 1].end) < 1e-9, 'gapless and in order');
	assert.ok(r[1].end - r[1].start > 2.5 * (r[0].end - r[0].start), 'the long word gets more time');
	assert.deepEqual(proportionalTimes([], 1), []);
});
