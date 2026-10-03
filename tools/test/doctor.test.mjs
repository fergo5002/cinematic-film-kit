// The doctor's parsers and its choice of --gl backend, on canned output, plus one run of the real
// doctor in a copy of the kit with no packages installed (it must say so, and install nothing).
import assert from 'node:assert/strict';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {REQUIRED, checkCapabilities, parseBsfList, parseDeviceList, parseEbur128Summary, parseEncoderList, parseFilterList} from '../lib/ffmpeg.mjs';
import {chooseGl, classifyRenderer, defaultGl, glCandidates, resolveGl} from '../lib/gl.mjs';
import {node, tempDir, tempKit} from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const canned = (f) => readFileSync(path.join(here, 'fixtures', 'ffmpeg', f), 'utf8');

test('filter lists parse in both the two-column and the older three-column format', () => {
	const now = parseFilterList(canned('filters-8.txt'));
	for (const f of REQUIRED.filters) assert.ok(now.has(f), `${f} missing from the ffmpeg 8 listing`);
	assert.ok(!now.has('='), 'legend lines must not parse as filters');
	const old = parseFilterList(canned('filters-5-missing.txt'));
	assert.ok(old.has('alimiter') && old.has('scale') && old.has('signalstats'), 'three flag columns must parse');
	const miss = checkCapabilities({filters: old, bsfs: parseBsfList(canned('bsfs-8.txt')), encoders: parseEncoderList(canned('encoders-8.txt'))});
	assert.deepEqual(miss.missingFilters.sort(), ['drawtext', 'scdet']);
	assert.deepEqual(miss.missingBsfs, []);
	assert.deepEqual(miss.missingEncoders, []);
});

test('bitstream filters, encoders and devices parse', () => {
	const bsfs = parseBsfList(canned('bsfs-8.txt'));
	assert.ok(bsfs.has('h264_metadata'));
	assert.ok(!bsfs.has('Bitstream'));
	const enc = parseEncoderList(canned('encoders-8.txt'));
	assert.equal(enc.get('libx264'), 'video');
	assert.equal(enc.get('aac'), 'audio');
	assert.ok(!enc.has('='));
	const noX264 = new Map([...enc].filter(([k]) => k !== 'libx264'));
	assert.deepEqual(checkCapabilities({filters: new Set(REQUIRED.filters), bsfs, encoders: noX264}).missingOptional, ['libx264']);
	const dev = parseDeviceList(canned('devices-8.txt'));
	assert.ok(dev.has('lavfi'));
	assert.ok(!dev.has('='));
});

test('the ebur128 summary parser reads the final block, not the running values', () => {
	const text = [
		'[Parsed_ebur128_0 @ 0x1] t: 3.9  TARGET:-23 LUFS    M: -23.0 S: -23.0     I: -23.0 LUFS       LRA:  20.0 LU  FTPK: -20.0 dBFS  TPK: -20.0 dBFS',
		'[Parsed_ebur128_0 @ 0x1] Summary:',
		'',
		'  Integrated loudness:',
		'    I:         -16.0 LUFS',
		'    Threshold: -26.4 LUFS',
		'',
		'  Loudness range:',
		'    LRA:         7.5 LU',
		'    Threshold: -36.1 LUFS',
		'    LRA low:   -21.2 LUFS',
		'    LRA high:  -13.7 LUFS',
		'',
		'  True peak:',
		'    Peak:       -1.8 dBFS',
	].join('\n');
	assert.deepEqual(parseEbur128Summary(text), {integratedLoudness: -16, loudnessRange: 7.5, truePeak: -1.8});
	assert.ok(Number.isNaN(parseEbur128Summary('no summary here').integratedLoudness));
});

const GPU_D3D = 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x0000A7A0) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const GPU_VK = 'ANGLE (Intel, Vulkan 1.4.311 (Intel(R) Iris(R) Xe Graphics (0x0000A7A0)), Intel Corporation)';
const SWIFT = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';

test('renderer strings say whether WebGL ran on a GPU', () => {
	assert.deepEqual(classifyRenderer(GPU_D3D), {software: false, hardware: true});
	assert.equal(classifyRenderer(SWIFT).software, true);
	assert.equal(classifyRenderer('llvmpipe (LLVM 15.0.6, 256 bits)').software, true);
	assert.equal(classifyRenderer('').hardware, false);
});

test('the backend choice prefers the recommended GPU backend, and never a fake one', () => {
	const r = (gl, ms, renderer, ok = true) => ({gl, ms, renderer, ok});
	// within 25% of the fastest: the earlier-listed backend wins
	assert.equal(chooseGl([r('angle', 1000, GPU_D3D), r('vulkan', 900, GPU_VK), r('swangle', 3200, SWIFT)]).choice, 'angle');
	// clearly faster: it wins
	assert.equal(chooseGl([r('angle', 1000, GPU_D3D), r('vulkan', 700, GPU_VK), r('swangle', 3200, SWIFT)]).choice, 'vulkan');
	// a hardware backend that reports SwiftShader is rejected, however fast it looked
	const faked = chooseGl([r('angle', 400, SWIFT), r('swangle', 3200, SWIFT)]);
	assert.equal(faked.choice, 'swangle');
	assert.equal(faked.results.find((x) => x.gl === 'angle').verdict, 'rejected');
	// nothing works: no choice
	assert.equal(chooseGl([r('angle', 0, null, false), r('swangle', 0, null, false)]).choice, null);
});

test('candidates per platform, and a container only gets software', () => {
	assert.deepEqual(glCandidates('win32'), ['angle', 'vulkan', 'swangle']);
	assert.deepEqual(glCandidates('darwin'), ['angle', 'swangle']);
	assert.deepEqual(glCandidates('linux'), ['angle-egl', 'angle', 'swangle']);
	assert.deepEqual(glCandidates('linux', {docker: true}), ['swangle']);
	assert.equal(defaultGl('linux'), 'swangle');
	assert.equal(defaultGl('win32'), 'angle');
});

test('FILM_GL beats film.local.json, which beats the default', (t) => {
	const dir = tempDir(t, 'gl-');
	assert.equal(resolveGl(dir, {env: {}, platform: 'darwin'}).gl, 'angle');
	writeFileSync(path.join(dir, 'film.local.json'), JSON.stringify({gl: 'vulkan'}));
	assert.deepEqual(resolveGl(dir, {env: {}, platform: 'darwin'}), {gl: 'vulkan', source: 'film.local.json'});
	assert.deepEqual(resolveGl(dir, {env: {FILM_GL: 'swangle'}, platform: 'darwin'}), {gl: 'swangle', source: 'FILM_GL'});
	assert.throws(() => resolveGl(dir, {env: {FILM_GL: 'opengl'}}), /not a --gl value/);
});

test('before npm ci the doctor checks the machine, says what to run, and installs nothing', (t) => {
	const kit = tempKit(t);
	const r = node([path.join(kit, 'tools', 'doctor.mjs'), '--no-gl'], {cwd: kit});
	assert.equal(r.status, 1, 'missing packages must fail the doctor');
	assert.match(r.stdout, /npm packages\s+FAIL\s+not installed/);
	assert.match(r.stdout, /--gl backend\s+NOT RUN/);
	assert.match(r.stdout, /loudness meter\s+ok\s+read -20(\.0)? LUFS/);
	// other fixes (git, for example) may be listed first; npm ci must be among them
	assert.match(r.stdout, /To fix, run:[\s\S]*?\n\s+npm ci\b/);
	assert.ok(!existsSync(path.join(kit, 'node_modules')), 'the doctor installed something without --fix');
});
