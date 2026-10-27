// The Kokoro-82M model snapshot: where it lives, what a complete one looks like, the check that
// runs before every load, and the one-off download. The sizes and hashes are pinned here, in code,
// so a damaged snapshot cannot vouch for itself. Node built-ins only.
//
// The model lives in the kit's own .cache folder (git-ignored and left out of release zips), so
// the kit writes nothing outside its folder. NARRATION_MODEL_DIR moves it, for example to share
// one copy between several kits.
import {createHash} from 'node:crypto';
import {createReadStream, createWriteStream} from 'node:fs';
import {mkdir, readdir, rename, rm, stat} from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {ROOT, fmtBytes} from '../kit.mjs';

// The timestamped ONNX export adds a `durations` output (predicted frames per input token) beside
// the waveform, which is where the word timings come from. Same weights as the plain
// onnx-community/Kokoro-82M-v1.0-ONNX export that kokoro-js loads by default.
export const MODEL_REPO = 'onnx-community/Kokoro-82M-v1.0-ONNX-timestamped';
export const MODEL_REVISION = 'dd4401a9add81ac692d20e240d22ec9dda82cc29';
export const MODEL_LICENCE = 'Apache-2.0 (the model cards of hexgrad/Kokoro-82M and of this ONNX export)';
export const MODEL_DTYPE = 'fp32';

// Sizes and LFS sha256 from the Hugging Face API at the pinned revision. The small JSON files have
// no LFS hash, so they are checked by size.
export const MODEL_FILES = {
	'config.json': {size: 44},
	'tokenizer.json': {size: 3497},
	'tokenizer_config.json': {size: 113},
	'onnx/model.onnx': {size: 325532171, sha256: '651ea8291843a92276a4a003581a215cb07d15e47dde6fcfb1b768f9a1682054'},
};

export const modelRoot = () => process.env.NARRATION_MODEL_DIR || path.join(ROOT, '.cache', 'narration', 'models');
export const snapshotDir = (root = modelRoot()) => path.join(root, ...MODEL_REPO.split('/'));

export const sha256File = (file) =>
	new Promise((resolve, reject) => {
		const h = createHash('sha256');
		createReadStream(file)
			.on('data', (c) => h.update(c))
			.on('error', reject)
			.on('end', () => resolve(h.digest('hex')));
	});

const walk = async (dir) => {
	let entries;
	try {
		entries = await readdir(dir, {withFileTypes: true});
	} catch {
		return [];
	}
	const out = [];
	for (const e of entries) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) out.push(...(await walk(p)));
		else out.push(p);
	}
	return out;
};

// {ok, problems}: every pinned file present at full size (and hash when pinned and `hash` is on),
// and no `.incomplete` file anywhere in the snapshot.
export const verifySnapshot = async (dir, manifest = MODEL_FILES, {hash = true} = {}) => {
	const problems = [];
	for (const p of await walk(dir)) if (p.endsWith('.incomplete')) problems.push(`incomplete download present: ${path.relative(dir, p)}`);
	for (const [name, want] of Object.entries(manifest)) {
		const p = path.join(dir, ...name.split('/'));
		let s;
		try {
			s = await stat(p);
		} catch {
			problems.push(`missing: ${name}`);
			continue;
		}
		if (s.size !== want.size) {
			problems.push(`size mismatch: ${name} is ${s.size} bytes, expected ${want.size}`);
			continue;
		}
		if (hash && want.sha256) {
			const got = await sha256File(p);
			if (got !== want.sha256) problems.push(`sha256 mismatch: ${name} is ${got}, expected ${want.sha256}`);
		}
	}
	return {ok: problems.length === 0, problems};
};

// Download the pinned snapshot once. Each file goes to `<name>.incomplete` and is renamed only
// after its size (and hash, where pinned) checks out.
export const fetchModel = async ({dir = snapshotDir(), log = console.log} = {}) => {
	for (const [name, want] of Object.entries(MODEL_FILES)) {
		const dest = path.join(dir, ...name.split('/'));
		try {
			if ((await stat(dest)).size === want.size) {
				log(`have ${name}`);
				continue;
			}
		} catch {
			// not downloaded yet
		}
		await mkdir(path.dirname(dest), {recursive: true});
		const part = `${dest}.incomplete`;
		const url = `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_REVISION}/${name}`;
		log(`downloading ${name} (${fmtBytes(want.size)})`);
		const res = await fetch(url);
		if (!res.ok) throw new Error(`${name}: HTTP ${res.status} from ${url}`);
		await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
		const got = (await stat(part)).size;
		if (got !== want.size) {
			await rm(part, {force: true});
			throw new Error(`${name}: downloaded ${got} bytes, expected ${want.size}`);
		}
		if (want.sha256 && (await sha256File(part)) !== want.sha256) {
			await rm(part, {force: true});
			throw new Error(`${name}: sha256 mismatch after download`);
		}
		await rename(part, dest);
	}
	const r = await verifySnapshot(dir);
	if (!r.ok) throw new Error(`the downloaded snapshot does not check out:\n  ${r.problems.join('\n  ')}`);
	return dir;
};
