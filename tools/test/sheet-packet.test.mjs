// The contact sheet and the review packet, made from a synthetic film in a throwaway kit.
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {makeSyntheticFilm, node, probe, tempKit, writeBeatmap} from './helpers.mjs';

const setup = (t) => {
	const kit = tempKit(t);
	writeBeatmap(kit, 'demo');
	makeSyntheticFilm(path.join(kit, 'out', 'demo', 'demo.mp4'));
	return kit;
};
const size = (file) => {
	const s = probe(file).streams[0];
	return [s.width, s.height];
};

test('sheet tiles the master into one timestamped PNG', (t) => {
	const kit = setup(t);
	const sheet = path.join(kit, 'out', 'demo', 'sheet.png');
	const r = node([path.join(kit, 'tools', 'sheet.mjs'), 'demo'], {cwd: kit});
	assert.equal(r.status, 0, r.stderr);
	assert.ok(existsSync(sheet));
	// 6 s, one cell every 0.5 s: 12 cells of 480 x 270 in 4 columns and 3 rows, 8 px gaps.
	assert.deepEqual(size(sheet), [4 * 480 + 5 * 8, 3 * 270 + 4 * 8]);
	const coarse = node([path.join(kit, 'tools', 'sheet.mjs'), 'demo', '1.5'], {cwd: kit});
	assert.equal(coarse.status, 0, coarse.stderr);
	assert.deepEqual(size(sheet), [4 * 480 + 5 * 8, 1 * 270 + 2 * 8]);
});

test('packet writes sheets every 1.25 s, a waveform, the sound-events stub and the prompts', (t) => {
	const kit = setup(t);
	mkdirSync(path.join(kit, 'reviews', 'prompts'), {recursive: true});
	writeFileSync(path.join(kit, 'reviews', 'prompts', 'critic.md'), '# Critic\n');
	const r = node([path.join(kit, 'tools', 'packet.mjs'), 'demo'], {cwd: kit});
	assert.equal(r.status, 0, r.stderr);
	const dir = path.join(kit, 'out', 'demo', 'packet');
	const files = readdirSync(dir).sort();
	// 6 s at one frame per 1.25 s is five frames: one sheet, and only one.
	assert.deepEqual(files, ['critic.md', 'sheet00.png', 'sound-events.md', 'waveform.png']);
	// tile always draws its whole 3 x 4 grid; unused cells stay background.
	assert.deepEqual(size(path.join(dir, 'sheet00.png')), [3 * 640 + 4 * 8, 4 * 360 + 5 * 8]);
	const stub = readFileSync(path.join(dir, 'sound-events.md'), 'utf8');
	assert.match(stub, /^# Sound events: demo/);
	assert.match(stub, /\| 2\.00 \| 60 \| \(hint: `M\.firstCut`\)/);
});

test('both refuse a film that has not been rendered yet', (t) => {
	const kit = tempKit(t);
	writeBeatmap(kit, 'unrendered');
	for (const tool of ['sheet.mjs', 'packet.mjs']) {
		const r = node([path.join(kit, 'tools', tool), 'unrendered'], {cwd: kit});
		assert.equal(r.status, 2, `${tool}: ${r.stderr}`);
		assert.match(r.stderr, /Nothing rendered for unrendered yet/);
	}
});
