// A stand-in for the Kokoro engine, so the narration pipeline can be tested without the 330 MB
// model or its packages. It "says" each letter as 100 ms of tone and each punctuation mark as
// silence, and reports phonemes and per-token durations the way the real engine does, so engine
// timings align exactly. Voice "bf_flat" returns no durations, which forces the fallback timings.
// tools/narrate.mjs loads it when NARRATION_ENGINE points here.
const SR = 24000;
const FRAME = 600; // samples per duration frame, as Kokoro
const VOICES = {
	bf_test: {name: 'Test', language: 'en-gb', gender: 'Female', overallGrade: 'B'},
	am_test: {name: 'Test', language: 'en-us', gender: 'Male', overallGrade: 'C'},
	bf_flat: {name: 'Flat', language: 'en-gb', gender: 'Female', overallGrade: 'D'},
};

export const loadEngine = async () => ({
	name: 'fake-engine',
	describe: () => ({
		engine: {name: 'fake-engine', version: '0.0.0', licence: 'MIT'},
		model: {name: 'Fake-1', version: 'test', licence: 'MIT'},
		runtime: {node: process.version},
	}),
	voices: VOICES,
	sampleRate: SR,
	phonemeLength: async (word) => word.replace(/[^\p{L}\p{N}]/gu, '').length,
	synth: async (text, {voice, speed = 1}) => {
		if (!VOICES[voice]) throw new Error(`unknown voice ${voice}`);
		const phonemes = text.toLowerCase().replace(/[^a-z0-9 ,.;:!?]/g, '').replace(/\s+/g, ' ').trim();
		const durations = [2];
		for (const ch of phonemes) durations.push(ch === ' ' ? 1 : /[,.;:!?]/.test(ch) ? 4 : 2);
		durations.push(2);
		const scaled = durations.map((d) => d / speed);
		const total = Math.round(scaled.reduce((a, b) => a + b, 0) * FRAME);
		const samples = new Float32Array(total);
		let at = scaled[0] * FRAME;
		[...phonemes].forEach((ch, i) => {
			const len = scaled[i + 1] * FRAME;
			if (/[a-z0-9]/.test(ch)) for (let k = 0; k < len; k++) samples[Math.floor(at + k)] = 0.3 * Math.sin((2 * Math.PI * (160 + 7 * (ch.charCodeAt(0) % 13)) * k) / SR);
			at += len;
		});
		return {samples, sampleRate: SR, phonemes, durations: voice === 'bf_flat' ? null : scaled, tokens: durations.length};
	},
});
