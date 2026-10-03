// A real render, kept short: --frames writes its own file and never replaces the film's render,
// and the bundle carries only the shared assets and this film's own public folder.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {node, tempKit} from './helpers.mjs';

test('a --frames render writes its own file, and the bundle sees only its own public files', {timeout: 300000}, (t) => {
	const kit = tempKit(t, {withSrc: true, withPublic: true, nodeModules: true});
	// another film's generated media, which this film's bundle must not carry
	mkdirSync(path.join(kit, 'public', 'films', 'other', 'media'), {recursive: true});
	writeFileSync(path.join(kit, 'public', 'films', 'other', 'media', 'plate.bin'), Buffer.alloc(1024));

	const r = node([path.join(kit, 'tools', 'render.mjs'), 'template', '--preview', '--frames', '0-5'], {cwd: kit});
	assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
	const out = path.join(kit, 'out', 'template');
	const fragment = path.join(out, 'preview-frames-0-5.mp4');
	assert.ok(existsSync(fragment), `no preview-frames-0-5.mp4 in ${readdirSync(out).join(', ')}`);
	assert.ok(!existsSync(path.join(out, 'preview.mp4')), 'a few frames were written over the preview');
	assert.ok(!existsSync(path.join(out, 'raw.mp4')), 'a few frames were written over the render');
	const frames = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', fragment], {encoding: 'utf8'}).stdout.trim();
	assert.equal(frames, '6');

	const bundled = path.join(kit, 'out', '.entry', 'template', 'public');
	assert.deepEqual(readdirSync(bundled).sort(), ['films', 'fonts', 'test']);
	assert.deepEqual(readdirSync(path.join(bundled, 'films')), ['template']);
});
