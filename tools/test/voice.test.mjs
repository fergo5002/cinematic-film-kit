// The bed ducks under the voice (audio/voice.mjs): spoken words become phrases, the score's gain
// dips by the set depth under each phrase with smooth ramps, and a film with no narration is not
// touched at all, so its score stays byte for byte what it was.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import {Bus, SR, dbToGain} from '../../audio/dsp.mjs';
import {duckGain, duckUnderSpeech, narrationWords, speechSpans} from '../../audio/voice.mjs';
import {tempDir} from './helpers.mjs';

const w = (text, start, end) => ({text, start, end});

test('words closer than the join gap become one phrase; a real pause starts a new one', () => {
	const spans = speechSpans([w('The', 1.0, 1.2), w('sea', 1.25, 1.5), w('keeps', 1.6, 1.9), w('Twice', 3.0, 3.3), w('a', 3.35, 3.4)], {join: 0.35});
	assert.deepEqual(spans, [{start: 1.0, end: 1.9}, {start: 3.0, end: 3.4}]);
	assert.deepEqual(speechSpans([]), []);
});

test('the gain sits at the depth under speech, at unity well away from it, and never jumps', () => {
	const g = duckGain([{start: 2, end: 4}], {n: 7 * SR, sampleRate: SR, depthDb: -10});
	const at = (t) => g[Math.round(t * SR)];
	assert.ok(Math.abs(at(3) - dbToGain(-10)) < 1e-6, `mid-phrase ${at(3)}`);
	assert.ok(Math.abs(at(2) - dbToGain(-10)) < 1e-6, 'fully down by the first word');
	assert.equal(at(0.5), 1);
	assert.equal(at(6.5), 1);
	let worst = 0;
	for (let i = 1; i < g.length; i++) worst = Math.max(worst, Math.abs(g[i] - g[i - 1]));
	assert.ok(worst < 1e-4, `largest step between samples ${worst}`);
});

test('ducking a bus scales both channels by the gain, and no words leaves it untouched', () => {
	const bus = new Bus(5);
	bus.L.fill(0.5);
	bus.R.fill(-0.25);
	const before = {L: Float32Array.from(bus.L), R: Float32Array.from(bus.R)};
	assert.equal(duckUnderSpeech(bus, []), bus);
	assert.deepEqual(bus.L, before.L);
	assert.deepEqual(bus.R, before.R);
	duckUnderSpeech(bus, [w('Go', 2, 2.4), w('now.', 2.45, 3)], {depthDb: -12});
	const mid = Math.round(2.5 * SR);
	assert.ok(Math.abs(bus.L[mid] - 0.5 * dbToGain(-12)) < 1e-6);
	assert.ok(Math.abs(bus.R[mid] + 0.25 * dbToGain(-12)) < 1e-6);
	assert.equal(bus.L[Math.round(0.2 * SR)], 0.5);
});

test('narrationWords reads a film\'s data/narration.json, and a film without one has no words', (t) => {
	const dir = tempDir(t, 'voice-');
	const file = path.join(dir, 'narration.json');
	assert.deepEqual(narrationWords(pathToFileURL(file)), []);
	writeFileSync(file, JSON.stringify({words: [w('Go', 1, 1.2)]}));
	assert.deepEqual(narrationWords(pathToFileURL(file)), [w('Go', 1, 1.2)]);
	assert.deepEqual(narrationWords(file), [w('Go', 1, 1.2)], 'a plain path works too');
});
