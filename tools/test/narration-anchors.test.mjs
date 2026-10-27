// The timing self-check: word edges measured against the silences in the delivered audio.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {anchorCheck, findSilences} from '../lib/narration/anchors.mjs';

const SR = 1000;
const signal = (spans, total) => {
	const x = new Float32Array(total);
	for (const [a, b] of spans) for (let i = a; i < b; i++) x[i] = 0.3 * Math.sin(i * 0.9);
	return x;
};

test('findSilences returns quiet stretches of at least the minimum length', () => {
	const s = findSilences(signal([[200, 900], [1300, 1800]], 2000), SR, {thresholdDb: -45, minS: 0.06});
	assert.equal(s.length, 3);
	assert.ok(Math.abs(s[1].start - 0.9) < 0.011 && Math.abs(s[1].end - 1.3) < 0.011, JSON.stringify(s[1]));
});

test('anchorCheck measures word edges against the silences either side of them', () => {
	const x = signal([[200, 900], [1300, 1800]], 2000);
	const words = [{text: 'one', start: 0.25, end: 0.5}, {text: 'two,', start: 0.5, end: 0.88}, {text: 'three', start: 1.33, end: 1.79}];
	const r = anchorCheck(words, x, SR);
	assert.equal(r.anchors, 4);
	const by = Object.fromEntries(r.points.map((p) => [`${p.word}:${p.edge}`, p.error_ms]));
	assert.ok(Math.abs(by['one:start'] - 50) <= 11, JSON.stringify(by));
	assert.ok(Math.abs(by['two,:end'] - -20) <= 11);
	assert.ok(Math.abs(by['three:start'] - 30) <= 11);
	assert.ok(Math.abs(by['three:end'] - -10) <= 11);
});

test('noise inside a pause gives one end anchor and one start anchor, never a word edge twice', () => {
	const x = signal([[200, 900], [1020, 1040], [1170, 1190], [1500, 1800]], 2000);
	const r = anchorCheck([{text: 'rests.', start: 0.25, end: 0.89}, {text: 'Neap', start: 1.52, end: 1.79}], x, SR);
	const keys = r.points.map((p) => `${p.word}:${p.edge}`);
	assert.equal(new Set(keys).size, keys.length, `an edge was used twice: ${keys}`);
	const by = Object.fromEntries(r.points.map((p) => [`${p.word}:${p.edge}`, p.error_ms]));
	assert.ok(Math.abs(by['rests.:end'] - -10) <= 11, JSON.stringify(by));
	assert.ok(Math.abs(by['Neap:start'] - 20) <= 11, JSON.stringify(by));
});
