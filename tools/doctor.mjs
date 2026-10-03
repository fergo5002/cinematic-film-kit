#!/usr/bin/env node
// npm run doctor            check this machine, before and after `npm ci`
// npm run doctor -- --fix   also run the two project-local installs if they are missing:
//                           `npm ci` and the Chrome Headless Shell download
//
// Before install it checks Node 22.18+, npm, git, free disk, ffmpeg and ffprobe, that ffmpeg has
// every filter the tools call, and that the loudness meter reads a known tone correctly. After
// install it checks Chrome Headless Shell, then renders a small WebGL probe with each --gl backend
// this OS can use, reads which renderer really ran it, checks the pixels, times it, and writes the
// winner to film.local.json. FILM_GL overrides the choice everywhere.
//
// It never installs anything without --fix, and never installs system software at all: it prints
// the command for your OS instead. Other flags: --gl <a,b> (probe only these), --no-gl (skip the
// probe), --proof (render a still of every integration test), --json (machine-readable report).
import {spawnSync} from 'node:child_process';
import {mkdirSync, readFileSync, readdirSync, rmSync, statSync, statfsSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {REQUIRED, checkCapabilities, ff, firstLineVersion, parseBsfList, parseDeviceList, parseEbur128Summary, parseEncoderList, parseFilterList} from './lib/ffmpeg.mjs';
import {LOCAL_FILE, VALID_GL, chooseGl, classifyRenderer, glCandidates, isDocker, readLocal} from './lib/gl.mjs';
import {ROOT, capture, fmtBytes, main, parseArgs} from './lib/kit.mjs';
import {publicFor} from './lib/remotion.mjs';

const MIN_NODE = [22, 18];
const REMOTION_VERSION = '4.0.532';
const PROBE_LEFT = [204, 51, 102]; // keep in step with src/tests/GlProbe.tsx
const PROBE_RIGHT = [51, 102, 204];

const platform = process.platform;
const os_ = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux';

// Exact install commands, per OS, for anything missing. Printed, never run.
const INSTALL = {
	node: {windows: 'winget install OpenJS.NodeJS.LTS', macos: 'brew install node@22', linux: 'curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs'},
	git: {windows: 'winget install Git.Git', macos: 'xcode-select --install', linux: 'sudo apt-get install -y git'},
	ffmpeg: {windows: 'winget install Gyan.FFmpeg', macos: 'brew install ffmpeg', linux: 'sudo apt-get install -y ffmpeg'},
	chromeLibs: {
		windows: null,
		macos: null,
		linux: 'sudo apt-get install -y libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2',
	},
};

const rows = [];
const fixes = [];
const row = (check, status, detail, fix = null) => {
	rows.push({check, status, detail});
	if (fix && !fixes.includes(fix)) fixes.push(fix);
};

// npm is a .cmd script on Windows, which Node only starts through a shell; give the shell one
// command string rather than an argument list, which it would join without escaping.
const versionOf = (cmd, args = ['--version']) => {
	const r = cmd === 'npm' ? spawnSync(`npm ${args.join(' ')}`, {encoding: 'utf8', shell: true}) : spawnSync(cmd, args, {encoding: 'utf8'});
	if (r.error || r.status !== 0) return null;
	return `${r.stdout}${r.stderr}`.trim().split('\n')[0];
};

// ---------- before install ----------

const checkNode = () => {
	const [maj, min] = process.versions.node.split('.').map(Number);
	const ok = maj > MIN_NODE[0] || (maj === MIN_NODE[0] && min >= MIN_NODE[1]);
	row('node', ok ? 'ok' : 'FAIL', `${process.versions.node} (needs ${MIN_NODE.join('.')} or later: it strips the types from beatmap.ts)`, ok ? null : INSTALL.node[os_]);
};

const checkNpm = () => {
	const v = versionOf('npm');
	row('npm', v ? 'ok' : 'FAIL', v ?? 'not found on PATH', v ? null : INSTALL.node[os_]);
};

const checkGit = () => {
	const v = versionOf('git');
	row('git', v ? 'ok' : 'warn', v ? v.replace(/^git version /, '') : 'not found (optional: only for keeping films under version control)', v ? null : INSTALL.git[os_]);
};

const checkDisk = () => {
	const seen = new Set();
	for (const [label, dir] of [['disk (kit)', ROOT], ['disk (temp)', os.tmpdir()]]) {
		let free;
		let device;
		try {
			const s = statfsSync(dir);
			free = s.bavail * s.bsize;
			device = statSync(dir).dev;
		} catch {
			row(label, 'warn', `could not read free space for ${dir}`);
			continue;
		}
		if (seen.has(device)) continue; // the temp folder is on the same volume as the kit
		seen.add(device);
		// A 1080p render writes its PNG frames to the temp folder first: about 1.5 GB a minute.
		const status = free < 2e9 ? 'FAIL' : free < 8e9 ? 'warn' : 'ok';
		row(label, status, `${fmtBytes(free)} free${status === 'ok' ? '' : ' (renders want 8 GB or more; frames go to the temp folder first)'}`);
	}
};

const ffmpegCaps = {};
const checkFfmpeg = () => {
	const ffv = versionOf('ffmpeg', ['-hide_banner', '-version']);
	const fpv = versionOf('ffprobe', ['-hide_banner', '-version']);
	// 5.1 or later: the sheets use -fps_mode, which older builds do not know.
	const ver = ffv ? firstLineVersion(ffv) : null;
	const [maj, min] = (ver?.match(/^(\d+)\.(\d+)/) ?? []).slice(1).map(Number);
	const recent = maj > 5 || (maj === 5 && min >= 1);
	row('ffmpeg', !ffv ? 'FAIL' : recent ? 'ok' : Number.isFinite(maj) ? 'FAIL' : 'warn', !ffv ? 'not found on PATH' : `${ver}${recent ? '' : Number.isFinite(maj) ? ' (needs 5.1 or later)' : ' (could not read the version; needs 5.1 or later)'}`, ffv && (recent || !Number.isFinite(maj)) ? null : INSTALL.ffmpeg[os_]);
	row('ffprobe', fpv ? 'ok' : 'FAIL', fpv ? firstLineVersion(fpv) : 'not found on PATH', fpv ? null : INSTALL.ffmpeg[os_]);
	if (!ffv) {
		for (const c of ['ffmpeg filters', 'ffmpeg encoders', 'loudness meter']) row(c, 'NOT RUN', 'needs ffmpeg');
		return false;
	}
	const filters = parseFilterList(capture('ffmpeg', ['-hide_banner', '-filters']).stdout);
	const bsfs = parseBsfList(capture('ffmpeg', ['-hide_banner', '-bsfs']).stdout);
	const encoders = parseEncoderList(capture('ffmpeg', ['-hide_banner', '-encoders']).stdout);
	const devices = parseDeviceList(capture('ffmpeg', ['-hide_banner', '-devices']).all);
	Object.assign(ffmpegCaps, {filters, bsfs, encoders, devices});
	const miss = checkCapabilities({filters, bsfs, encoders});
	const needed = REQUIRED.filters.length + REQUIRED.bsfs.length;
	const missing = [...miss.missingFilters, ...miss.missingBsfs];
	row('ffmpeg filters', missing.length ? 'FAIL' : 'ok', missing.length ? `missing: ${missing.join(', ')}` : `all ${needed} present (${[...REQUIRED.filters, ...REQUIRED.bsfs].join(', ')})`, missing.length ? `${INSTALL.ffmpeg[os_]}   (a full build: drawtext needs libfreetype)` : null);
	if (miss.missingEncoders.length) row('ffmpeg encoders', 'FAIL', `missing: ${miss.missingEncoders.join(', ')}`, INSTALL.ffmpeg[os_]);
	else if (miss.missingOptional.length) row('ffmpeg encoders', 'warn', `aac present; no libx264 (tests fall back to mpeg4; Remotion renders with its own encoder)`);
	else row('ffmpeg encoders', 'ok', 'aac, libx264');
	return true;
};

// Prove the instrument before trusting any loudness it reports: a stereo 997 Hz sine at peak 0.1
// is -20.0 LUFS by the BS.1770 definition, so the meter must read that back.
const checkMeter = () => {
	if (ffmpegCaps.devices && !ffmpegCaps.devices.has('lavfi')) {
		row('loudness meter', 'FAIL', 'ffmpeg has no lavfi input device, so the meter cannot be tested', INSTALL.ffmpeg[os_]);
		return;
	}
	const tone = 'aevalsrc=0.1*sin(2*PI*997*t)|0.1*sin(2*PI*997*t):s=48000:d=4';
	const r = ff(['-f', 'lavfi', '-i', tone, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
	const m = parseEbur128Summary(r.all);
	const ok = Number.isFinite(m.integratedLoudness) && Math.abs(m.integratedLoudness - -20) <= 0.5;
	row('loudness meter', ok ? 'ok' : 'FAIL', Number.isFinite(m.integratedLoudness) ? `read ${m.integratedLoudness} LUFS from a -20.0 LUFS test tone` : 'ebur128 produced no summary', ok ? null : INSTALL.ffmpeg[os_]);
};

// ---------- after install ----------

const pkgVersion = (name) => {
	try {
		return JSON.parse(readFileSync(path.join(ROOT, 'node_modules', ...name.split('/'), 'package.json'), 'utf8')).version;
	} catch {
		return null;
	}
};

const checkDeps = (fix) => {
	let v = pkgVersion('@remotion/renderer');
	if (!v && fix) {
		console.log('--fix: running npm ci (this downloads the packages in package-lock.json)');
		const r = spawnSync('npm ci', {cwd: ROOT, stdio: 'inherit', shell: true});
		if (r.status !== 0) row('npm packages', 'FAIL', 'npm ci failed (see above)');
		v = pkgVersion('@remotion/renderer');
	}
	if (!v) {
		row('npm packages', 'FAIL', 'not installed', 'npm ci');
		return false;
	}
	const ok = v === REMOTION_VERSION;
	row('npm packages', ok ? 'ok' : 'warn', ok ? `installed (Remotion ${v})` : `Remotion ${v} installed, the kit is tested with ${REMOTION_VERSION}: run npm ci`);
	return true;
};

// The browser Remotion drives, looked up WITHOUT downloading it.
const browserStatus = () => {
	const dir = path.join(ROOT, 'node_modules', '.remotion', 'chrome-headless-shell');
	let version = null;
	try {
		version = readFileSync(path.join(dir, 'VERSION'), 'utf8').trim();
	} catch {
		return {present: false};
	}
	let expected = null;
	try {
		const src = readFileSync(path.join(ROOT, 'node_modules', '@remotion', 'renderer', 'dist', 'browser', 'get-chrome-download-url.js'), 'utf8');
		expected = src.match(/TESTED_VERSION\s*=\s*'([^']+)'/)?.[1] ?? null;
	} catch {
		// an internal file moved: skip the version comparison rather than guess
	}
	const exe = readdirSync(dir, {recursive: true}).some((f) => /chrome-headless-shell(\.exe)?$/.test(String(f)));
	return {present: exe, version, expected, matches: !expected || expected === version};
};

const checkBrowser = async (fix) => {
	let s = browserStatus();
	if ((!s.present || !s.matches) && fix) {
		console.log('--fix: downloading Chrome Headless Shell (about 110 MB), the same as: npx remotion browser ensure');
		const {ensureBrowser} = await import('@remotion/renderer');
		await ensureBrowser({logLevel: 'info'});
		s = browserStatus();
	}
	if (!s.present) {
		row('Chrome Headless Shell', 'FAIL', 'not downloaded yet (about 110 MB)', 'npx remotion browser ensure   (or: npm run doctor -- --fix)');
		return false;
	}
	if (!s.matches) {
		row('Chrome Headless Shell', 'FAIL', `version ${s.version}, this Remotion expects ${s.expected}`, 'npx remotion browser ensure   (or: npm run doctor -- --fix)');
		return false;
	}
	// Whether its shared libraries are present only shows when the probe launches it; if that
	// fails on Linux, the --gl row below prints the apt line for them.
	row('Chrome Headless Shell', 'ok', s.version ?? 'present');
	return true;
};

// Read one pixel of a PNG through ffmpeg: no image library needed.
const pixelAt = (file, x, y) => {
	const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-i', file, '-vf', `crop=1:1:${x}:${y},format=rgb24`, '-f', 'rawvideo', '-'], {encoding: 'buffer'});
	return r.status === 0 && r.stdout.length >= 3 ? [r.stdout[0], r.stdout[1], r.stdout[2]] : null;
};
const close = (a, b, tol = 4) => a && a.every((v, i) => Math.abs(v - b[i]) <= tol);

const probeGl = async (candidates) => {
	const {bundle} = await import('@remotion/bundler');
	const renderer = await import('@remotion/renderer');
	const dir = path.join(ROOT, 'out', '.doctor');
	mkdirSync(dir, {recursive: true});
	process.stdout.write('bundling the GL probe (src/tests/index.ts)... ');
	// The tests need only the shared fonts and test assets, never a film's generated media.
	const serveUrl = await bundle({entryPoint: path.join(ROOT, 'src', 'tests', 'index.ts'), rootDir: ROOT, publicDir: publicFor(path.join(ROOT, 'out', '.entry', '_shared', 'public'))});
	console.log('done');
	const results = [];
	for (const gl of candidates) {
		const file = path.join(dir, `probe-${gl}.png`);
		rmSync(file, {force: true});
		const logs = [];
		const chromiumOptions = {gl, ...(platform === 'linux' ? {enableMultiProcessOnLinux: true} : {})};
		const result = {gl, ok: false, ms: null, renderer: null, still: path.relative(ROOT, file).split(path.sep).join('/')};
		process.stdout.write(`  --gl=${gl.padEnd(10)} `);
		let browser = null;
		try {
			browser = await renderer.openBrowser('chrome', {chromiumOptions, logLevel: 'error'});
			const composition = await renderer.selectComposition({serveUrl, id: 'gl-probe', puppeteerInstance: browser, chromiumOptions, logLevel: 'error'});
			// Remotion echoes every browser console line to the terminal. The probe's line is read from
			// onBrowserLog below, so keep it out of the doctor's own output.
			const echo = console.log;
			console.log = (...args) => {
				if (!args.some((a) => String(a).includes('GLPROBE'))) echo(...args);
			};
			const t0 = Date.now();
			try {
				await renderer.renderStill({
					composition,
					serveUrl,
					frame: 0,
					output: file,
					imageFormat: 'png',
					puppeteerInstance: browser,
					chromiumOptions,
					overwrite: true,
					logLevel: 'error',
					onBrowserLog: (log) => logs.push(String(log.text ?? '')),
				});
			} finally {
				console.log = echo;
			}
			result.ms = Date.now() - t0;
			const line = logs.find((l) => l.includes('GLPROBE '));
			const info = line ? JSON.parse(line.slice(line.indexOf('GLPROBE ') + 8)) : null;
			result.renderer = info?.renderer ?? null;
			result.webgl2 = info?.webgl2 ?? null;
			const left = pixelAt(file, 40, 360);
			const right = pixelAt(file, 1240, 360);
			result.pixels = {left, right};
			if (!info) result.error = 'the probe never logged its renderer';
			else if (!info.webgl2) result.error = 'no WebGL2 context';
			else if (!close(left, PROBE_LEFT) || !close(right, PROBE_RIGHT)) result.error = `wrong pixels in the still: ${JSON.stringify(left)} and ${JSON.stringify(right)}`;
			else result.ok = true;
		} catch (err) {
			result.error = String(err?.message ?? err).split('\n')[0].slice(0, 200);
		} finally {
			if (browser) await browser.close({silent: true}).catch(() => {});
		}
		const kind = result.renderer ? (classifyRenderer(result.renderer).software ? 'software' : 'GPU') : '';
		console.log(result.ok ? `${String(result.ms).padStart(6)} ms  ${kind.padEnd(8)} ${result.renderer}` : `failed: ${result.error}`);
		results.push(result);
	}
	return {results, serveUrl, renderer, dir};
};

// --proof: a still of each integration test with the chosen backend, checked for not being blank.
const proof = async ({serveUrl, renderer, dir}, gl) => {
	const chromiumOptions = {gl, ...(platform === 'linux' ? {enableMultiProcessOnLinux: true} : {})};
	const browser = await renderer.openBrowser('chrome', {chromiumOptions, logLevel: 'error'});
	try {
		for (const [id, frame] of [['lottie', 30], ['path-draw', 40], ['three-example', 45]]) {
			const file = path.join(dir, `proof-${id}.png`);
			try {
				const composition = await renderer.selectComposition({serveUrl, id, puppeteerInstance: browser, chromiumOptions, logLevel: 'error'});
				await renderer.renderStill({composition, serveUrl, frame, output: file, imageFormat: 'png', puppeteerInstance: browser, chromiumOptions, overwrite: true, logLevel: 'error'});
				const stats = capture('ffmpeg', ['-hide_banner', '-v', 'error', '-i', file, '-vf', 'signalstats,metadata=print:file=-', '-f', 'null', '-']).all;
				const ymax = Number(stats.match(/YMAX=(\d+)/)?.[1]);
				const ymin = Number(stats.match(/YMIN=(\d+)/)?.[1]);
				const blank = !(ymax - ymin > 20);
				row(`proof: ${id}`, blank ? 'FAIL' : 'ok', `${path.relative(ROOT, file).split(path.sep).join('/')}${blank ? ' is blank' : ''}`);
			} catch (err) {
				row(`proof: ${id}`, 'FAIL', String(err?.message ?? err).split('\n')[0].slice(0, 160));
			}
		}
	} finally {
		await browser.close({silent: true}).catch(() => {});
	}
};

const printTable = () => {
	const w = Math.max(...rows.map((r) => r.check.length)) + 2;
	console.log('');
	console.log(`${'CHECK'.padEnd(w)}${'RESULT'.padEnd(9)}DETAIL`);
	console.log('-'.repeat(Math.min(110, w + 9 + 60)));
	for (const r of rows) console.log(`${r.check.padEnd(w)}${r.status.padEnd(9)}${r.detail}`);
	if (fixes.length) {
		console.log('\nTo fix, run:');
		for (const f of fixes) console.log(`  ${f}`);
	}
};

main(async () => {
	const {flags} = parseArgs(process.argv.slice(2), {booleans: ['fix', 'no-gl', 'proof', 'json']});
	const fix = flags.fix === true;
	const docker = isDocker();
	console.log(`film kit doctor: ${platform} ${os.arch()}${docker ? ' (container)' : ''}, kit at ${ROOT}`);

	checkNode();
	checkNpm();
	checkGit();
	checkDisk();
	if (checkFfmpeg()) checkMeter();

	const forced = process.env.FILM_GL?.trim();
	let choice = null;
	const depsOk = checkDeps(fix);
	const browserOk = depsOk ? await checkBrowser(fix) : (row('Chrome Headless Shell', 'NOT RUN', 'needs the npm packages'), false);

	if (flags['no-gl']) row('--gl backend', 'NOT RUN', '--no-gl');
	else if (!depsOk || !browserOk) row('--gl backend', 'NOT RUN', 'needs the npm packages and Chrome Headless Shell');
	else {
		if (forced && !VALID_GL.includes(forced)) {
			row('--gl backend', 'FAIL', `FILM_GL=${forced} is not one of ${VALID_GL.join(', ')}`);
		} else {
			const candidates = forced ? [forced] : typeof flags.gl === 'string' ? flags.gl.split(',').map((s) => s.trim()) : glCandidates(platform, {docker});
			const bad = candidates.filter((c) => !VALID_GL.includes(c));
			if (bad.length) throw new Error(`not --gl values: ${bad.join(', ')} (use ${VALID_GL.join(', ')})`);
			console.log(`\nWebGL probe, one still per backend${forced ? ` (FILM_GL=${forced} forces this one)` : ''}:`);
			const probe = await probeGl(candidates);
			const picked = chooseGl(probe.results);
			choice = picked.choice;
			for (const r of picked.results.filter((x) => x.verdict === 'rejected')) console.log(`  rejected --gl=${r.gl}: ${r.why} (${r.renderer})`);
			if (choice) {
				const best = picked.results.find((r) => r.chosen);
				const software = classifyRenderer(best.renderer).software;
				row('--gl backend', software ? 'warn' : 'ok', `${choice}: ${best.renderer}, ${best.ms} ms for the probe${software ? ' (software: renders will be slow)' : ''}${forced ? ' (forced by FILM_GL)' : ''}`);
				const record = {
					gl: choice,
					chosenBy: forced ? 'FILM_GL' : 'doctor',
					renderer: best.renderer,
					software,
					platform,
					arch: os.arch(),
					container: docker,
					remotion: pkgVersion('@remotion/renderer'),
					checked: new Date().toISOString(),
					candidates: picked.results.map(({gl, ok, ms, renderer, verdict, why, error, still}) => ({gl, ok, ms, renderer, verdict, ...(why ? {why} : {}), ...(error ? {error} : {}), still})),
				};
				writeFileSync(path.join(ROOT, LOCAL_FILE), JSON.stringify(record, null, 2) + '\n');
				console.log(`  chose --gl=${choice}; wrote ${LOCAL_FILE}`);
				if (flags.proof) await proof(probe, choice);
			} else {
				row('--gl backend', 'FAIL', `no backend rendered the probe correctly (tried ${candidates.join(', ')})`, platform === 'linux' ? INSTALL.chromeLibs.linux : 'update the graphics driver, then run npm run doctor again');
			}
		}
	}

	const previous = readLocal(ROOT);
	if (!choice && previous?.gl) console.log(`\n${LOCAL_FILE} still says --gl=${previous.gl} from ${previous.checked ?? 'an earlier run'}.`);

	printTable();
	const failed = rows.filter((r) => r.status === 'FAIL').length;
	const notRun = rows.filter((r) => r.status === 'NOT RUN').length;
	console.log(`\n${failed ? `${failed} check${failed === 1 ? '' : 's'} failed` : 'every check that ran passed'}${notRun ? `; ${notRun} not run` : ''}.`);
	if (flags.json) console.log(JSON.stringify({platform, container: docker, gl: choice, rows, fixes}, null, 2));
	return failed ? 1 : 0;
});
