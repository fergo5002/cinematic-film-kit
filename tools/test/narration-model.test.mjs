// The Kokoro snapshot check that runs before every load, and where the model lives: inside the
// kit's own git-ignored .cache folder, never somewhere else on the machine.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {ROOT} from '../lib/kit.mjs';
import {MODEL_FILES, MODEL_REPO, modelRoot, snapshotDir, verifySnapshot} from '../lib/narration/model.mjs';
import {tempDir} from './helpers.mjs';

const fakeSnapshot = (t, files) => {
	const dir = tempDir(t, 'narr-model-');
	for (const [name, body] of Object.entries(files)) {
		const p = path.join(dir, name);
		mkdirSync(path.dirname(p), {recursive: true});
		writeFileSync(p, body);
	}
	return dir;
};
const sha = (b) => createHash('sha256').update(b).digest('hex');

test('a complete snapshot passes', async (t) => {
	const body = Buffer.from('weights');
	const dir = fakeSnapshot(t, {'onnx/model.onnx': body, 'config.json': '{}'});
	const r = await verifySnapshot(dir, {'onnx/model.onnx': {size: body.length, sha256: sha(body)}, 'config.json': {size: 2}});
	assert.equal(r.ok, true, r.problems.join('; '));
});

test('a truncated, missing, half-downloaded or altered weight file fails', async (t) => {
	const body = Buffer.from('weights');
	assert.match((await verifySnapshot(fakeSnapshot(t, {'onnx/model.onnx': 'short'}), {'onnx/model.onnx': {size: 999}})).problems.join(' '), /size/);
	assert.match((await verifySnapshot(fakeSnapshot(t, {}), {'onnx/model.onnx': {size: 1}})).problems.join(' '), /missing/);
	assert.match((await verifySnapshot(fakeSnapshot(t, {'onnx/model.onnx': body, 'onnx/model.onnx.incomplete': 'x'}), {'onnx/model.onnx': {size: body.length}})).problems.join(' '), /incomplete/);
	assert.match((await verifySnapshot(fakeSnapshot(t, {'onnx/model.onnx': body}), {'onnx/model.onnx': {size: body.length, sha256: 'ab'.repeat(32)}})).problems.join(' '), /sha256/);
	const sizeOnly = await verifySnapshot(fakeSnapshot(t, {'onnx/model.onnx': body}), {'onnx/model.onnx': {size: body.length, sha256: 'ab'.repeat(32)}}, {hash: false});
	assert.equal(sizeOnly.ok, true, 'hash: false checks sizes only (the quick check the doctor uses)');
});

test('the pinned manifest pins the full-size fp32 weights by hash', () => {
	assert.equal(MODEL_FILES['onnx/model.onnx'].size, 325532171);
	assert.match(MODEL_FILES['onnx/model.onnx'].sha256, /^[0-9a-f]{64}$/);
});

test('the model lives in the kit\'s .cache folder unless NARRATION_MODEL_DIR says otherwise', () => {
	const saved = process.env.NARRATION_MODEL_DIR;
	try {
		delete process.env.NARRATION_MODEL_DIR;
		assert.equal(modelRoot(), path.join(ROOT, '.cache', 'narration', 'models'));
		process.env.NARRATION_MODEL_DIR = path.join(ROOT, 'elsewhere');
		assert.equal(modelRoot(), path.join(ROOT, 'elsewhere'));
		assert.equal(snapshotDir(), path.join(ROOT, 'elsewhere', ...MODEL_REPO.split('/')));
	} finally {
		if (saved === undefined) delete process.env.NARRATION_MODEL_DIR;
		else process.env.NARRATION_MODEL_DIR = saved;
	}
});
