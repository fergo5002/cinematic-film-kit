// Shared test fixtures. Everything here is generated at run time from ffmpeg's lavfi sources, so
// the kit ships no third-party frames and the tests need no network.
import {spawnSync} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEncoderList, testVideoEncoder} from '../lib/ffmpeg.mjs';

export const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const tempDir = (t, prefix) => {
	const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
	t.after(() => rmSync(dir, {recursive: true, force: true}));
	return dir;
};

const encoders = () => parseEncoderList(spawnSync('ffmpeg', ['-hide_banner', '-encoders'], {encoding: 'utf8'}).stdout);

// The instrument film: three flat colour shots with hard cuts at known frames, a small box moving
// across them (so it is not a slideshow), and a 997 Hz sine of known peak level on both channels.
// A stereo sine at peak amplitude a reads 20*log10(a) LUFS under BS.1770, so 0.1 is -20.0 LUFS.
export const SYNTHETIC = {fps: 30, seconds: 6, cutFrames: [60, 120], amplitude: 0.1, expectedLufs: -20};

export const makeSyntheticFilm = (file, {fps = SYNTHETIC.fps, width = 640, height = 360} = {}) => {
	const shot = SYNTHETIC.cutFrames.length + 1;
	const len = SYNTHETIC.seconds / shot;
	const colours = ['0x2a3f5f', '0x7a2f2f', '0x2f6a3a'];
	const graph = [
		...colours.map((c, i) => `color=c=${c}:s=${width}x${height}:r=${fps}:d=${len}[s${i}]`),
		`${colours.map((_, i) => `[s${i}]`).join('')}concat=n=${shot}:v=1:a=0[bg]`,
		`color=c=white:s=48x48:r=${fps}:d=${SYNTHETIC.seconds}[box]`,
		`[bg][box]overlay=x='40+t*80':y=${Math.round(height / 2 - 24)}:eval=frame:shortest=1,format=yuv420p[v]`,
		`aevalsrc=${SYNTHETIC.amplitude}*sin(2*PI*997*t)|${SYNTHETIC.amplitude}*sin(2*PI*997*t):s=48000:d=${SYNTHETIC.seconds}[a]`,
	].join(';');
	mkdirSync(path.dirname(file), {recursive: true});
	const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-filter_complex', graph, '-map', '[v]', '-map', '[a]', ...testVideoEncoder(encoders()), '-c:a', 'aac', '-b:a', '192k', '-shortest', file], {encoding: 'utf8'});
	if (r.status !== 0) throw new Error(`ffmpeg could not make the synthetic film: ${r.stderr}`);
	return file;
};

// A throwaway copy of the kit's tools (and whatever else a test needs) with its own root, so a
// test can run the real scripts without touching the real src/films or out/.
export const tempKit = (t, {withSrc = false, withPublic = false, nodeModules = false, films = []} = {}) => {
	const dir = tempDir(t, 'film-kit-');
	const tools = path.join(KIT, 'tools');
	cpSync(tools, path.join(dir, 'tools'), {recursive: true, filter: (src) => path.relative(tools, src).split(path.sep)[0] !== 'test'});
	cpSync(path.join(KIT, 'package.json'), path.join(dir, 'package.json'));
	if (withSrc) {
		cpSync(path.join(KIT, 'tsconfig.json'), path.join(dir, 'tsconfig.json'));
		cpSync(path.join(KIT, 'audio'), path.join(dir, 'audio'), {recursive: true});
		for (const p of ['src/index.ts', 'src/Root.tsx', 'src/engine', 'src/tests']) cpSync(path.join(KIT, p), path.join(dir, p), {recursive: true});
		for (const id of ['template', ...films]) cpSync(path.join(KIT, 'src', 'films', id), path.join(dir, 'src', 'films', id), {recursive: true});
	}
	if (withPublic) {
		for (const p of ['public/fonts', 'public/test', 'public/films/template']) cpSync(path.join(KIT, p), path.join(dir, p), {recursive: true});
	}
	if (nodeModules) {
		// A directory junction on Windows needs no special rights; elsewhere it is a symlink.
		symlinkSync(path.join(KIT, 'node_modules'), path.join(dir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
		t.after(() => rmSync(path.join(dir, 'node_modules'), {force: true, recursive: false}));
	}
	return dir;
};

export const writeBeatmap = (kitDir, id, {fps = SYNTHETIC.fps, frames = SYNTHETIC.fps * SYNTHETIC.seconds} = {}) => {
	const dir = path.join(kitDir, 'src', 'films', id);
	mkdirSync(dir, {recursive: true});
	writeFileSync(path.join(dir, 'beatmap.ts'), `export const FPS = ${fps};\nexport const DURATION: number = ${frames};\nexport const M = {start: 0, firstCut: ${SYNTHETIC.cutFrames[0]}, secondCut: ${SYNTHETIC.cutFrames[1]}};\n`);
	writeFileSync(path.join(dir, 'film.ts'), `export const film = {id: '${id}'};\n`);
	return dir;
};

export const node = (args, opts = {}) => spawnSync(process.execPath, args, {encoding: 'utf8', ...opts});

export const probe = (file) => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height,codec_type', '-show_entries', 'format=duration', '-of', 'json', file], {encoding: 'utf8'}).stdout);
