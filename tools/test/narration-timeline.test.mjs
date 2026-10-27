// Laying the voiced lines out in time: pause marks are exact, other lines get the default gap,
// and each line is trimmed to its speech first.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assemble, trimSilence} from '../lib/narration/timeline.mjs';

const seg = (duration, n) => ({type: 'speech', duration, words: Array.from({length: n}, (_, i) => ({text: `w${i}`, start: (i * duration) / n, end: ((i + 1) * duration) / n}))});
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test('a pause mark gives exactly that gap between the last word and the next', () => {
	const t = assemble([seg(2, 4), {type: 'pause', seconds: 0.6}, seg(1.5, 3)], {gap: 0.45, lead: 0, tail: 0});
	close(t.words[4].start - t.words[3].end, 0.6, 'gap');
	close(t.segments[1].offset, 2.6, 'offset');
	close(t.duration, 4.1, 'duration');
});

test('lines with no pause mark get the default gap', () => {
	const t = assemble([seg(1, 2), seg(1, 2)], {gap: 0.45, lead: 0, tail: 0});
	close(t.words[2].start - t.words[1].end, 0.45, 'default gap');
});

test('pause marks in a row add up and replace the default gap', () => {
	const t = assemble([seg(1, 1), {type: 'pause', seconds: 0.5}, {type: 'pause', seconds: 0.3}, seg(1, 1)], {gap: 0.45, lead: 0, tail: 0});
	close(t.words[1].start - t.words[0].end, 0.8, 'summed pauses');
});

test('lead, tail and edge pauses lengthen the file without changing word order', () => {
	const t = assemble([{type: 'pause', seconds: 0.4}, seg(1, 2), {type: 'pause', seconds: 1}], {gap: 0.45, lead: 0.2, tail: 0.5});
	close(t.words[0].start, 0.6, 'first word after lead and opening pause');
	close(t.duration, 0.6 + 1 + 1 + 0.5, 'duration');
	assert.equal(t.pauses.length, 2);
});

test('trimSilence finds the speech inside quiet edges and keeps a short pad', () => {
	const x = new Float32Array(1000);
	for (let i = 300; i < 700; i++) x[i] = 0.5 * Math.sin(i);
	const {start, end} = trimSilence(x, 1000, {thresholdDb: -50, padMs: 20, windowMs: 10});
	assert.ok(start >= 270 && start <= 300, `start ${start}`);
	assert.ok(end >= 700 && end <= 730, `end ${end}`);
});

test('trimSilence on pure silence returns an empty span instead of throwing', () => {
	const {start, end} = trimSilence(new Float32Array(500), 1000, {});
	assert.equal(end - start, 0);
});
