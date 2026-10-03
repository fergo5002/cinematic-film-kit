// film-audit against an instrument whose answers are known by construction: hard cuts on known
// frames and a tone of known loudness. If these drift, the audit is measuring something else.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {parseEncoderList, testVideoEncoder} from '../lib/ffmpeg.mjs';
import {KIT, SYNTHETIC, makeSyntheticFilm, node, tempDir, tempKit, writeBeatmap} from './helpers.mjs';

const audit = path.join(KIT, 'tools', 'film-audit.mjs');

test('cuts land within one frame and loudness within 0.5 LU on a synthetic film', (t) => {
	const dir = tempDir(t, 'film-audit-');
	const film = makeSyntheticFilm(path.join(dir, 'instrument.mp4'));
	const json = path.join(dir, 'audit.json');
	const r = node([audit, film, '--baseline', '--target-duration', String(SYNTHETIC.seconds), '--json', json]);
	assert.equal(r.status, 0, `baseline run should exit 0:\n${r.stderr}`);
	const out = JSON.parse(readFileSync(json, 'utf8'));

	const frame = 1 / SYNTHETIC.fps;
	const expected = SYNTHETIC.cutFrames.map((f) => f / SYNTHETIC.fps);
	assert.equal(out.measured.cuts.times.length, expected.length, `cuts found: ${out.measured.cuts.times.join(', ')}`);
	expected.forEach((t0, i) => assert.ok(Math.abs(out.measured.cuts.times[i] - t0) <= frame + 1e-6, `cut ${i}: ${out.measured.cuts.times[i]} s, expected ${t0} s`));

	const lufs = out.measured.audio.integratedLufs;
	assert.ok(Math.abs(lufs - SYNTHETIC.expectedLufs) <= 0.5, `integrated loudness ${lufs} LUFS, expected ${SYNTHETIC.expectedLufs}`);
	assert.ok(Math.abs(out.fps - SYNTHETIC.fps) < 0.01);
	assert.ok(Math.abs(out.duration - SYNTHETIC.seconds) < 0.1);
});

test('the gates fail a film that breaks them (a flat tone has no loudness range)', (t) => {
	const dir = tempDir(t, 'film-audit-');
	const film = makeSyntheticFilm(path.join(dir, 'instrument.mp4'));
	const json = path.join(dir, 'audit.json');
	const r = node([audit, film, '--target-duration', String(SYNTHETIC.seconds), '--json', json]);
	assert.equal(r.status, 1, 'a failing gate must exit 1');
	const out = JSON.parse(readFileSync(json, 'utf8'));
	assert.equal(out.verdict, 'FAIL');
	const lra = out.results.find((g) => g.name === 'loudness range');
	assert.equal(lra.status, 'FAIL');
	// -20 LUFS is outside the -16 to -13 delivery band, so this gate must fail too.
	assert.equal(out.results.find((g) => g.name === 'integrated loudness').status, 'FAIL');
});

// ffmpeg's freezedetect prints freeze_start for a freeze that runs to the end of the file, but no
// freeze_end or freeze_duration. A film that ends on a held card must still have that hold counted.
test('a freeze that runs to the end of the file is counted as still', (t) => {
	const dir = tempDir(t, 'film-audit-');
	const film = path.join(dir, 'ends-on-a-hold.mp4');
	// A large box moves for 3 s (every frame changes well past -40 dB), then stops for the last 2 s.
	const graph = [
		'color=c=0x203040:s=640x360:r=30:d=5[bg]',
		'color=c=white:s=300x300:r=30:d=5[box]',
		"[bg][box]overlay=x='if(lt(t,3),20+t*90,290)':y=30:eval=frame,format=yuv420p[v]",
	].join(';');
	const encoders = parseEncoderList(spawnSync('ffmpeg', ['-hide_banner', '-encoders'], {encoding: 'utf8'}).stdout);
	const made = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-filter_complex', graph, '-map', '[v]', ...testVideoEncoder(encoders), film], {encoding: 'utf8'});
	assert.equal(made.status, 0, made.stderr);
	const json = path.join(dir, 'audit.json');
	const r = node([audit, film, '--baseline', '--target-duration', '5', '--json', json]);
	assert.equal(r.status, 0, r.stderr);
	const out = JSON.parse(readFileSync(json, 'utf8'));
	const last = out.measured.freezes.spans.at(-1);
	assert.ok(last, 'no freeze found at all');
	assert.ok(Math.abs(last[0] - 3) <= 0.2, `the final hold should start near 3 s, got ${last[0]}`);
	assert.ok(Math.abs(last[1] - out.duration) <= 0.05, `the final hold should run to the end (${out.duration} s), got ${last[1]}`);
	assert.ok(out.measured.motion.activeFraction < 0.75, `two of five seconds are held, so at most 75% active; got ${out.measured.motion.activeFraction}`);
});

// signalstats reports luma on the stream's own scale, 0 to 1023 for 10-bit video, which read 4x
// too bright. The same picture must measure the same at either bit depth.
test('luminance is measured on the 8-bit scale whatever the bit depth', (t) => {
	const dir = tempDir(t, 'film-audit-');
	const mean = (pixFmt, file) => {
		const made = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x606060:s=320x180:r=30:d=2', '-pix_fmt', pixFmt, '-c:v', 'ffv1', path.join(dir, file)], {encoding: 'utf8'});
		assert.equal(made.status, 0, made.stderr);
		const json = path.join(dir, `${file}.json`);
		const r = node([audit, path.join(dir, file), '--baseline', '--target-duration', '2', '--json', json]);
		assert.equal(r.status, 0, r.stderr);
		return JSON.parse(readFileSync(json, 'utf8')).measured.luma.mean;
	};
	const eight = mean('yuv420p', 'eight.mkv');
	const ten = mean('yuv420p10le', 'ten.mkv');
	assert.ok(eight > 80 && eight < 110, `0x606060 should read about 96 of 255, got ${eight}`);
	assert.ok(Math.abs(ten - eight) < 1.5, `10-bit read ${ten}, 8-bit read ${eight}`);
});

// When the audio runs longer than the picture, a freeze open at the end still closes where the
// PICTURE ends, not where the container ends.
test('a freeze open at the end closes at the end of the video stream, not a longer audio track', (t) => {
	const dir = tempDir(t, 'film-audit-');
	const film = path.join(dir, 'long-audio.mkv');
	const graph = [
		'color=c=0x203040:s=640x360:r=30:d=5[bg]',
		'color=c=white:s=300x300:r=30:d=5[box]',
		"[bg][box]overlay=x='if(lt(t,3),20+t*90,290)':y=30:eval=frame,format=yuv420p[v]",
		'aevalsrc=0.1*sin(2*PI*997*t)|0.1*sin(2*PI*997*t):s=48000:d=7[a]',
	].join(';');
	const made = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-c:v', 'ffv1', '-c:a', 'pcm_s16le', film], {encoding: 'utf8'});
	assert.equal(made.status, 0, made.stderr);
	const json = path.join(dir, 'audit.json');
	const r = node([audit, film, '--baseline', '--target-duration', '7', '--json', json]);
	assert.equal(r.status, 0, r.stderr);
	const out = JSON.parse(readFileSync(json, 'utf8'));
	assert.ok(out.duration > 6.9, `the container should run 7 s with its audio, got ${out.duration}`);
	const last = out.measured.freezes.spans.at(-1);
	assert.ok(Math.abs(last[1] - 5) <= 0.1, `the final hold should end with the picture at 5 s, got ${last[1]}`);
});

// A render of a few frames must not pass as the film: when the film's length is known, the
// duration gate has a floor (the beatmap's length less one frame) as well as a ceiling.
test('a master shorter than the beatmap fails the duration gate; the full length passes', (t) => {
	const kit = tempKit(t);
	writeBeatmap(kit, 'demo');
	const full = makeSyntheticFilm(path.join(kit, 'out', 'demo', 'full.mp4'));
	const master = path.join(kit, 'out', 'demo', 'demo.mp4');
	const gateOf = () => {
		const r = node([path.join(kit, 'tools', 'film-audit.mjs'), 'demo'], {cwd: kit});
		assert.ok(r.status === 0 || r.status === 1, r.stderr);
		return JSON.parse(readFileSync(path.join(kit, 'out', 'demo', 'audit.json'), 'utf8')).results.find((g) => g.name === 'duration');
	};
	const cut = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', full, '-t', '3', '-c', 'copy', master], {encoding: 'utf8'});
	assert.equal(cut.status, 0, cut.stderr);
	const short = gateOf();
	assert.equal(short.status, 'FAIL', `a 3 s file passed as a ${SYNTHETIC.seconds} s film: ${JSON.stringify(short)}`);
	copyFileSync(full, master);
	assert.equal(gateOf().status, 'PASS');
});

test('an unknown film id or file is a usage error, not a crash', () => {
	const r = node([audit, 'no-such-film-here']);
	assert.equal(r.status, 2);
	assert.match(r.stderr, /No such film id or file|No film "no-such-film-here"/);
});
