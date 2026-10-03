// The offline DSP kit (audio/dsp.mjs): envelopes that honour the note length, and filters that
// fail loudly instead of hiding a NaN.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Biquad, Bus, SR, adsr, assertFinite} from '../../audio/dsp.mjs';

test('adsr releases from wherever the envelope is when a short note ends', () => {
	// A 0.1 s note whose attack is 0.2 s: at 0.1 s it has reached 0.5, so release starts there.
	const [len, a, d, s, r] = [0.1, 0.2, 0.1, 0.5, 0.05];
	assert.ok(Math.abs(adsr(0.1, len, a, d, s, r) - 0.5) < 1e-9);
	assert.ok(Math.abs(adsr(0.125, len, a, d, s, r) - 0.5 * 0.25) < 1e-9, 'halfway through the release is a quarter of the level');
	assert.ok(adsr(0.15, len, a, d, s, r) < 1e-12, 'silent once the release has run');
	assert.equal(adsr(0.29, len, a, d, s, r), 0, 'the old envelope was still sounding here, at 0.55');
	// No step anywhere: consecutive samples never move faster than the attack or release slopes.
	const limit = (Math.max(1 / a, 2 / r) / SR) * 1.5;
	let prev = 0;
	for (let i = 0; i < 0.4 * SR; i++) {
		const v = adsr(i / SR, len, a, d, s, r);
		assert.ok(Math.abs(v - prev) < limit, `jump of ${Math.abs(v - prev).toFixed(4)} at ${(i / SR).toFixed(4)} s`);
		prev = v;
	}
	// A long note is unchanged: attack, decay, sustain, release from the sustain level.
	assert.equal(adsr(1.0, 2, 0.2, 0.1, 0.5, 0.5), 0.5);
	assert.ok(Math.abs(adsr(2.25, 2, 0.2, 0.1, 0.5, 0.5) - 0.5 * 0.25) < 1e-9);
});

test('a filter that goes non-finite fails loudly instead of writing silence', () => {
	const f = new Biquad('lowpass', 1000, 0.7);
	assert.throws(() => f.process(NaN), /non-finite/);
	// and assertFinite still catches anything else that slips into a bus
	const bus = new Bus(0.01);
	bus.L[10] = NaN;
	assert.throws(() => assertFinite(bus, 'test'), /non-finite sample/);
	// a healthy filter is untouched
	const g = new Biquad('highpass', 200, 0.7);
	for (let i = 0; i < 1000; i++) assert.ok(Number.isFinite(g.process(Math.sin(i / 10))));
});
