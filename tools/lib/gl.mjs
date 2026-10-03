// Which Chromium --gl backend renders WebGL on this machine. Read by tools/render.mjs,
// tools/stills.mjs and remotion.config.ts, written by tools/doctor.mjs. Built-ins only, and no
// import.meta: remotion.config.ts bundles this file with esbuild into CommonJS.
import fs from 'node:fs';
import path from 'node:path';

export const VALID_GL = ['angle', 'swangle', 'angle-egl', 'vulkan', 'egl', 'swiftshader'];

// The backends that run in software by design. Everything else claims a GPU.
export const SOFTWARE_GL = ['swangle', 'swiftshader'];

// The safe default before the doctor has run: ANGLE on a desktop, SwiftShader-on-ANGLE on Linux,
// where a server or container usually has no GPU (Remotion's own recommendation).
export const defaultGl = (platform = process.platform) => (platform === 'linux' ? 'swangle' : 'angle');

// What the doctor tries, fastest-likely first. A container with no GPU only gets swangle.
export const glCandidates = (platform = process.platform, {docker = false} = {}) => {
	if (docker) return ['swangle'];
	if (platform === 'win32') return ['angle', 'vulkan', 'swangle'];
	if (platform === 'darwin') return ['angle', 'swangle'];
	return ['angle-egl', 'angle', 'swangle'];
};

export const isDocker = () => {
	try {
		if (fs.existsSync('/.dockerenv')) return true;
		const cg = fs.readFileSync('/proc/1/cgroup', 'utf8');
		return /docker|containerd|kubepods|podman/.test(cg);
	} catch {
		return false;
	}
};

export const LOCAL_FILE = 'film.local.json';

export const readLocal = (root) => {
	try {
		return JSON.parse(fs.readFileSync(path.join(root, LOCAL_FILE), 'utf8'));
	} catch {
		return null;
	}
};

// FILM_GL wins, then the doctor's choice in film.local.json, then the platform default.
export const resolveGl = (root, {env = process.env, platform = process.platform} = {}) => {
	const forced = env.FILM_GL?.trim();
	if (forced) {
		if (!VALID_GL.includes(forced)) throw new Error(`FILM_GL=${forced} is not a --gl value. Use one of: ${VALID_GL.join(', ')}`);
		return {gl: forced, source: 'FILM_GL'};
	}
	const local = readLocal(root);
	if (local && VALID_GL.includes(local.gl)) return {gl: local.gl, source: LOCAL_FILE};
	return {gl: defaultGl(platform), source: 'default (run npm run doctor)'};
};

// The WebGL renderer string decides whether a backend really reached the GPU. A backend that
// claims hardware but reports SwiftShader (or Mesa's llvmpipe) fell back to the CPU silently.
export const classifyRenderer = (renderer) => {
	const r = String(renderer ?? '');
	const software = /swiftshader|llvmpipe|softpipe|lavapipe|microsoft basic render/i.test(r);
	return {software, hardware: !software && r.length > 0};
};

// Pick from probe results: [{gl, ok, ms, renderer}], in the platform's order of preference.
// Real hardware beats software; a hardware claim that reports a software renderer is rejected.
// Among the rest the earliest-listed backend wins unless a later one is more than `margin`
// faster: one probe's timing is too noisy to swap a recommended default for a 10% difference.
export const chooseGl = (results, {margin = 0.25} = {}) => {
	const judged = results.map((r) => {
		if (!r.ok) return {...r, verdict: 'failed'};
		const {software} = classifyRenderer(r.renderer);
		if (!SOFTWARE_GL.includes(r.gl) && software) return {...r, verdict: 'rejected', why: 'claims a GPU but WebGL ran on the CPU'};
		return {...r, verdict: 'usable', software};
	});
	const usable = judged.filter((r) => r.verdict === 'usable');
	const pick = (list) => {
		if (!list.length) return null;
		const fastest = Math.min(...list.map((r) => r.ms));
		return list.find((r) => r.ms <= fastest * (1 + margin));
	};
	const best = pick(usable.filter((r) => !r.software)) ?? pick(usable.filter((r) => r.software));
	return {choice: best ? best.gl : null, results: judged.map((r) => ({...r, chosen: best ? r.gl === best.gl : false}))};
};
