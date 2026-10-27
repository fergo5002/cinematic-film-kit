// Captions timed from the word timings: line and cue limits, pauses and sentence ends start a new
// cue, and the SRT and VTT files say the same thing in their own formats.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildCues, toSRT, toVTT} from '../lib/narration/captions.mjs';

// Words at a steady 0.3 s each with no gaps.
const wordsFrom = (text, {t0 = 0, step = 0.3} = {}) => text.split(/\s+/).map((w, i) => ({text: w, start: t0 + i * step, end: t0 + (i + 1) * step - 0.02}));
const LONG =
	'The sea keeps its own time, and twice a day it stops between the tides for a few quiet minutes. Neap tells you when, to the minute, for every harbour on the coast, so you can launch, moor or cross the bar while the water rests and the current has nothing left to say about it.';

test('every caption line is at most 42 characters and every cue at most two lines', () => {
	const cues = buildCues(wordsFrom(LONG));
	assert.ok(cues.length > 3);
	for (const c of cues) {
		assert.ok(c.lines.length >= 1 && c.lines.length <= 2, `lines ${c.lines.length}`);
		for (const l of c.lines) assert.ok(l.length <= 42, `"${l}" is ${l.length}`);
	}
});

test('cue times come from the words: start at the first word, end at or after the last', () => {
	const words = wordsFrom(LONG);
	const cues = buildCues(words);
	let k = 0;
	for (const [i, c] of cues.entries()) {
		assert.equal(c.start, words[k].start);
		assert.ok(c.end >= words[k + c.wordCount - 1].end, 'cue ends before its last word');
		if (cues[i + 1]) assert.ok(c.end <= cues[i + 1].start, 'cues overlap');
		assert.equal(c.lines.join(' '), words.slice(k, k + c.wordCount).map((w) => w.text).join(' '));
		k += c.wordCount;
	}
	assert.equal(k, words.length, 'every word appears exactly once');
});

test('a pause starts a new cue, and so does the end of a sentence', () => {
	const words = [...wordsFrom('Twice a day', {t0: 0}), ...wordsFrom('between the tides, it stops.', {t0: 2}), ...wordsFrom('Then it turns', {t0: 4})];
	assert.deepEqual(buildCues(words).map((c) => c.lines.join(' ')), ['Twice a day', 'between the tides, it stops.', 'Then it turns']);
});

test('no cue runs past seven seconds', () => {
	const words = wordsFrom('a b c d e f g h i j k l m n o p q r s t u v w x y z a b c d e f', {step: 0.5});
	for (const c of buildCues(words)) assert.ok(c.end - c.start <= 7 + 1e-9, `${c.end - c.start}`);
});

test('SRT and VTT carry the same cues in their own formats', () => {
	const cues = buildCues(wordsFrom('Go when the water rests.', {t0: 1.23}));
	assert.match(toSRT(cues), /^1\n00:00:01,230 --> 00:00:0\d,\d{3}\nGo when the water rests\.\n/);
	assert.match(toVTT(cues), /^WEBVTT\n\n00:00:01\.230 --> 00:00:0\d\.\d{3}\nGo when the water rests\.\n/);
});

test('VTT escapes &, < and >, as WebVTT requires; SRT keeps the text as written', () => {
	const cues = buildCues(wordsFrom('Ebb&Flow <b> 3>2 here.', {t0: 0.5}));
	const vtt = toVTT(cues, {note: 'AI-generated voice'});
	assert.match(vtt, /\nEbb&amp;Flow &lt;b&gt; 3&gt;2 here\.\n/);
	assert.match(vtt, /^WEBVTT\n\nNOTE AI-generated voice\n\n/);
	assert.match(toSRT(cues), /\nEbb&Flow <b> 3>2 here\.\n/);
});

test('a two-line cue breaks after a clause rather than between "the" and its noun', () => {
	const cues = buildCues(wordsFrom('Twice a day, between the tides, the water stops.'));
	assert.deepEqual(cues[0].lines, ['Twice a day, between the tides,', 'the water stops.']);
	const plain = buildCues(wordsFrom('The light rides the long slow tide up towards the afternoon high'));
	for (const c of plain) assert.doesNotMatch(c.lines[0], /\b(the|a|an|to|of|and|in|on|at|for|with|your|its)$/i, `"${c.lines[0]}" ends on a word that leads into the next`);
});
