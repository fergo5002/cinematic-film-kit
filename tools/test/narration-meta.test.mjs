// The record that travels with a narration, and the AI-voice disclosure no caller can remove.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DISCLOSURE_PREFIX, assertDisclosure, buildMeta} from '../lib/narration/meta.mjs';

const base = {voice: 'bf_emma', engine: {name: 'kokoro-js', version: '1.2.1'}, model: {name: 'Kokoro-82M', repo: 'x/y', revision: 'abc', dtype: 'fp32'}};

test('meta always carries the AI-generated voice disclosure', () => {
	const m = buildMeta(base);
	assert.ok(m.disclosure.startsWith(DISCLOSURE_PREFIX));
	assert.equal(m.ai_generated, true);
	assert.match(m.disclosure, /bf_emma/);
	assert.match(m.disclosure, /Kokoro-82M/);
});

test('a caller cannot remove or replace the disclosure', () => {
	const m = buildMeta({...base, disclosure: '', ai_generated: false});
	assert.ok(m.disclosure.startsWith(DISCLOSURE_PREFIX));
	assert.equal(m.ai_generated, true);
});

test('meta records engine, model, voice and date', () => {
	const m = buildMeta({...base, now: new Date('2026-10-10T12:00:00Z')});
	assert.equal(m.voice, 'bf_emma');
	assert.equal(m.engine.version, '1.2.1');
	assert.equal(m.model.revision, 'abc');
	assert.equal(m.date, '2026-10-10');
});

test('assertDisclosure rejects meta without the line', () => {
	assert.throws(() => assertDisclosure({voice: 'x'}), /disclosure/);
	assert.throws(() => assertDisclosure({disclosure: 'synthetic'}), /disclosure/);
	assert.doesNotThrow(() => assertDisclosure(buildMeta(base)));
});
