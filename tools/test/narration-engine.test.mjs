// The picture's side of narration (src/engine/narration.ts): finding the moment a word is spoken,
// and the caption on screen at a time. Plain TypeScript, loaded here with Node's type stripping.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {cueAt, toFrame, wordAt} from '../../src/engine/narration.ts';

const words = [
	{text: 'Twice', start: 1.0, end: 1.3, line: 1, source: 'engine'},
	{text: 'a', start: 1.32, end: 1.4, line: 1, source: 'engine'},
	{text: 'day,', start: 1.45, end: 1.8, line: 1, source: 'engine'},
	{text: 'it', start: 2.6, end: 2.7, line: 1, source: 'engine'},
	{text: 'stops.', start: 2.75, end: 3.2, line: 1, source: 'engine'},
	{text: 'A', start: 4.0, end: 4.1, line: 2, source: 'engine'},
	{text: 'day', start: 4.15, end: 4.5, line: 2, source: 'engine'},
];

test('wordAt finds a word whatever its case and punctuation, and the nth repeat of it', () => {
	assert.equal(wordAt(words, 'stops').start, 2.75);
	assert.equal(wordAt(words, 'DAY').start, 1.45);
	assert.equal(wordAt(words, 'day', 1).start, 4.15);
	assert.equal(wordAt(words, 'a', 1).text, 'A');
});

test('wordAt fails loudly when the script no longer has the word the picture keys on', () => {
	assert.throws(() => wordAt(words, 'tide'), /no "tide"/);
	assert.throws(() => wordAt(words, 'day', 2), /only 2 "day", not number 3/);
});

test('cueAt gives the cue on screen, and nothing between cues', () => {
	const cues = [{start: 1, end: 3.6, lines: ['Twice a day, it stops.']}, {start: 4, end: 4.9, lines: ['A day']}];
	assert.equal(cueAt(cues, 0.5), null);
	assert.deepEqual(cueAt(cues, 1), cues[0]);
	assert.equal(cueAt(cues, 3.6), null, 'a cue ends where it says');
	assert.deepEqual(cueAt(cues, 4.2), cues[1]);
	assert.equal(toFrame(2.75, 30), 83);
});
