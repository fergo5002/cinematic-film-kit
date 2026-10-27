// npm run narrate -- <id>: the film's narration.txt becomes its voice track, captions and timing
// data in the places the film, the score and the master read them, or nothing changes at all.
import assert from 'node:assert/strict';
import {appendFileSync, existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {KIT, node, tempKit, writeBeatmap} from './helpers.mjs';

const FAKE = path.join(KIT, 'tools', 'test', 'fixtures', 'narration', 'fake-engine.mjs');
const env = {...process.env, NARRATION_ENGINE: FAKE};
const SCRIPT = 'The sea keeps its own time.\n[pause 0.6]\nTwice a day, between the tides, it stops.\n';

const film = (t, {frames = 30 * 12, narration = "{voice: 'bf_test', at: 45}"} = {}) => {
	const kit = tempKit(t);
	const dir = writeBeatmap(kit, 'tide', {frames});
	if (narration) appendFileSync(path.join(dir, 'beatmap.ts'), `export const NARRATION = ${narration};\n`);
	writeFileSync(path.join(dir, 'narration.txt'), SCRIPT);
	return {kit, dir, pub: path.join(kit, 'public', 'films', 'tide', 'narration')};
};

test('narrate writes the voice, captions and record to public/, and the timings to the film\'s data/', (t) => {
	const {kit, dir, pub} = film(t);
	const r = node([path.join(kit, 'tools', 'narrate.mjs'), 'tide'], {cwd: kit, env});
	assert.equal(r.status, 0, r.stderr + r.stdout);
	for (const f of ['narration.wav', 'captions.srt', 'captions.vtt', 'meta.json']) assert.ok(existsSync(path.join(pub, f)), `${f} missing`);
	const data = JSON.parse(readFileSync(path.join(dir, 'data', 'narration.json'), 'utf8'));
	assert.equal(data.voice, 'bf_test');
	assert.match(data.disclosure, /^AI-generated voice/);
	assert.ok(Math.abs(data.words[0].start - 1.5) < 0.05, `the voice starts at the beatmap's NARRATION.at (frame 45 = 1.5 s), got ${data.words[0].start}`);
	assert.ok(data.cues.length >= 2 && data.cues[0].lines.length >= 1);
	const meta = JSON.parse(readFileSync(path.join(pub, 'meta.json'), 'utf8'));
	assert.equal(meta.script.path, 'src/films/tide/narration.txt', 'paths in the record are relative to the kit, never a person\'s folders');
	assert.match(r.stdout, /AI-generated voice/);
	assert.ok(!existsSync(path.join(kit, 'out', 'tide', '.narration-tmp')), 'the staging folder is cleaned up');
});

test('flags override the beatmap, and the speed can never go above 1.0', (t) => {
	const {kit, dir} = film(t);
	const r = node([path.join(kit, 'tools', 'narrate.mjs'), 'tide', '--voice', 'am_test', '--speed', '0.9'], {cwd: kit, env});
	assert.equal(r.status, 0, r.stderr);
	assert.equal(JSON.parse(readFileSync(path.join(dir, 'data', 'narration.json'), 'utf8')).voice, 'am_test');
	const fast = node([path.join(kit, 'tools', 'narrate.mjs'), 'tide', '--speed', '1.2'], {cwd: kit, env});
	assert.notEqual(fast.status, 0);
	assert.match(fast.stderr, /never sped up/);
});

test('a narration longer than the film is refused, and the film keeps the narration it had', (t) => {
	const {kit, dir, pub} = film(t, {frames: 30 * 3});
	const r = node([path.join(kit, 'tools', 'narrate.mjs'), 'tide'], {cwd: kit, env});
	assert.notEqual(r.status, 0);
	assert.match(r.stderr, /runs to .* but the film is 3(\.0+)? s/);
	assert.match(r.stderr, /cut words or give the picture more time/);
	assert.ok(!existsSync(pub) && !existsSync(path.join(dir, 'data', 'narration.json')), 'nothing written');
});

test('a film without narration.txt, or a kit without the narration packages, says what to do', (t) => {
	const {kit, dir} = film(t);
	writeFileSync(path.join(dir, 'narration.txt'), '');
	const empty = node([path.join(kit, 'tools', 'narrate.mjs'), 'tide'], {cwd: kit, env});
	assert.equal(empty.status, 1);
	assert.match(empty.stderr, /no speech/);

	const kit2 = tempKit(t);
	writeBeatmap(kit2, 'tide');
	const none = node([path.join(kit2, 'tools', 'narrate.mjs'), 'tide'], {cwd: kit2, env});
	assert.equal(none.status, 2);
	assert.match(none.stderr, /src\/films\/tide\/narration\.txt/);

	writeFileSync(path.join(kit2, 'src', 'films', 'tide', 'narration.txt'), SCRIPT);
	const {NARRATION_ENGINE: _, ...plain} = env;
	const missing = node([path.join(kit2, 'tools', 'narrate.mjs'), 'tide'], {cwd: kit2, env: plain});
	assert.equal(missing.status, 2);
	assert.match(missing.stderr, /optional.*not installed/i);
	assert.match(missing.stderr, /npm run narrate -- --setup/);
});

test('--voices lists the engine\'s voices', (t) => {
	const kit = tempKit(t);
	const r = node([path.join(kit, 'tools', 'narrate.mjs'), '--voices'], {cwd: kit, env});
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /bf_test\s+en-gb/);
});
