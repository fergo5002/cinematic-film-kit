// The Kokoro-82M voice, through kokoro-js, offline only. tools/narrate.mjs loads this after
// `npm run narrate -- --setup` has installed this folder's packages and fetched the model.
//
// Before every load the model snapshot is checked (every file at full size, the weights' sha256
// matching the value pinned in tools/lib/narration/model.mjs, no half-finished download), then it
// loads local files only, with the remote host pointed at a dead address so any download attempt
// fails loudly instead of quietly fetching something else.
//
// kokoro-js does not expose the model's predicted durations, which is where the word timings come
// from, so the model call is wrapped to capture them. kokoro-js 1.2.1's stream() never finishes on
// a plain string, so this uses generate() only.
import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {env} from '@huggingface/transformers';
import {KokoroTTS} from 'kokoro-js';
import {phonemize} from 'phonemizer';
import {phonemeLength} from '../tools/lib/narration/align.mjs';
import {MODEL_DTYPE, MODEL_FILES, MODEL_LICENCE, MODEL_REPO, MODEL_REVISION, modelRoot, snapshotDir, verifySnapshot} from '../tools/lib/narration/model.mjs';

const version = (name) => JSON.parse(readFileSync(new URL(`./node_modules/${name}/package.json`, import.meta.url), 'utf8')).version;
export const VERSIONS = {
	'kokoro-js': version('kokoro-js'),
	'@huggingface/transformers': version('@huggingface/transformers'),
	'onnxruntime-node': version('onnxruntime-node'),
	phonemizer: version('phonemizer'),
};
// One predicted duration frame is 600 samples at 24 kHz (hexgrad/kokoro's KPipeline: "Multiply by
// 600 to go from pred_dur frames to sample_rate 24000").
const SAMPLES_PER_FRAME = 600;
const MAX_TOKENS = 510;

export const loadEngine = async ({verifyHash = true} = {}) => {
	const dir = snapshotDir();
	const check = await verifySnapshot(dir, undefined, {hash: verifyHash});
	if (!check.ok) throw new Error(`the Kokoro model is not ready (${dir}):\n  ${check.problems.join('\n  ')}\nFetch it with: npm run narrate -- --setup`);
	env.allowRemoteModels = false;
	env.allowLocalModels = true;
	env.localModelPath = modelRoot() + path.sep;
	env.remoteHost = 'http://127.0.0.1:9/';

	const vocab = JSON.parse(await readFile(path.join(dir, 'tokenizer.json'), 'utf8')).model.vocab;
	const idToChar = new Map(Object.entries(vocab).map(([ch, id]) => [id, ch]));
	const tts = await KokoroTTS.from_pretrained(MODEL_REPO, {dtype: MODEL_DTYPE});
	const callModel = tts.model;
	let last = null;
	tts.model = async (inputs) => {
		const out = await callModel(inputs);
		last = {ids: Array.from(inputs.input_ids.data, Number), durations: out.durations ? Array.from(out.durations.data, Number) : null};
		return out;
	};

	return {
		name: 'kokoro',
		voices: tts.voices,
		samplesPerFrame: SAMPLES_PER_FRAME,
		describe: () => ({
			engine: {name: 'kokoro-js', version: VERSIONS['kokoro-js'], licence: 'Apache-2.0', source: 'https://www.npmjs.com/package/kokoro-js'},
			model: {name: 'Kokoro-82M', version: 'v1.0', repo: MODEL_REPO, revision: MODEL_REVISION, file: 'onnx/model.onnx', dtype: MODEL_DTYPE, sha256: MODEL_FILES['onnx/model.onnx'].sha256, licence: MODEL_LICENCE},
			runtime: {
				node: process.version,
				...VERSIONS,
				phonemizer_note: 'The phonemizer package declares Apache-2.0 but embeds eSpeak NG compiled to WebAssembly, and eSpeak NG is GPL-3.0. See THIRD_PARTY_NOTICES.md.',
			},
		}),
		phonemeLength: async (word, lang) => phonemeLength((await phonemize(word, lang)).join(' ')),
		synth: async (text, {voice, speed = 1}) => {
			if (!tts.voices[voice]) throw new Error(`unknown Kokoro voice "${voice}"; one of: ${Object.keys(tts.voices).join(', ')}`);
			last = null;
			const audio = await tts.generate(text, {voice, speed});
			if (!last) throw new Error('the model call was not captured, so there are no timings');
			if (last.ids.length - 2 >= MAX_TOKENS) throw new Error(`a line is ${last.ids.length - 2} phoneme tokens, at or over Kokoro's ${MAX_TOKENS} limit, where it is cut off silently. Split it: "${text.slice(0, 60)}..."`);
			const phonemes = last.ids.slice(1, -1).map((id) => idToChar.get(id) ?? '').join('');
			return {samples: audio.audio, sampleRate: audio.sampling_rate, phonemes, durations: last.durations};
		},
	};
};
