// Shared plumbing for the kit's command-line tools: where things live, film ids, argument
// parsing and child processes. Node built-ins only, so every tool that imports this still runs
// before `npm ci` (the doctor depends on that).
import {spawnSync} from 'node:child_process';
import {existsSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// The kit root is two folders above this file (tools/lib/kit.mjs). Copy the tools folder into
// another kit and it works there: nothing below depends on the current directory.
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const FILMS_DIR = path.join(ROOT, 'src', 'films');
export const OUT_DIR = path.join(ROOT, 'out');
export const PUBLIC_DIR = path.join(ROOT, 'public');

// Composition ids are the film folder names: lowercase letters, digits and single hyphens.
export const FILM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isFilmId = (id) => typeof id === 'string' && FILM_ID.test(id);

export const filmDir = (id) => path.join(FILMS_DIR, id);
export const outDir = (id) => path.join(OUT_DIR, id);
export const filmPublicDir = (id) => path.join(PUBLIC_DIR, 'films', id);

// The rendered files every command agrees on (CONTRACT.md, "out/").
export const outputs = (id) => ({
	dir: outDir(id),
	raw: path.join(outDir(id), 'raw.mp4'),
	master: path.join(outDir(id), `${id}.mp4`),
	preview: path.join(outDir(id), 'preview.mp4'),
	stills: path.join(outDir(id), 'stills'),
	sheet: path.join(outDir(id), 'sheet.png'),
	packet: path.join(outDir(id), 'packet'),
	audit: path.join(outDir(id), 'audit.json'),
	report: path.join(outDir(id), 'report.md'),
	renderLog: path.join(outDir(id), 'render.json'),
});

// The newest stage of a film that exists: master, then raw render, then preview. `wanted` forces one.
export const pickRendered = (id, wanted) => {
	const o = outputs(id);
	const all = {master: o.master, raw: o.raw, preview: o.preview};
	if (wanted !== undefined && wanted !== true) {
		if (!all[wanted]) throw new UsageError('--source is master, raw or preview');
		if (!existsSync(all[wanted])) throw new UsageError(`${rel(all[wanted])} does not exist yet.`);
		return all[wanted];
	}
	for (const k of ['master', 'raw', 'preview']) if (existsSync(all[k])) return all[k];
	throw new UsageError(`Nothing rendered for ${id} yet. Run: npm run preview -- ${id}   or   npm run render -- ${id}`);
};

export const listFilms = () => {
	if (!existsSync(FILMS_DIR)) return [];
	return readdirSync(FILMS_DIR)
		.filter((name) => isFilmId(name) && statSync(path.join(FILMS_DIR, name)).isDirectory())
		.filter((name) => existsSync(path.join(FILMS_DIR, name, 'film.ts')))
		.sort();
};

export class UsageError extends Error {}

// Every command takes the film id first. Fail with the list of real films, not a stack trace.
export const requireFilm = (id) => {
	if (!id) throw new UsageError(`Give a film id. Films here: ${listFilms().join(', ') || '(none)'}`);
	if (!isFilmId(id)) throw new UsageError(`"${id}" is not a film id: use lowercase letters, digits and hyphens.`);
	if (!existsSync(path.join(filmDir(id), 'film.ts'))) {
		throw new UsageError(`No film "${id}" (expected src/films/${id}/film.ts). Films here: ${listFilms().join(', ') || '(none)'}`);
	}
	return id;
};

// Minimal argument parser: positionals, --flag, --flag value and --flag=value. `booleans` lists
// the flags that never take a value, so `--preview template` keeps "template" positional.
export const parseArgs = (argv, {booleans = []} = {}) => {
	const positional = [];
	const flags = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--') {
			positional.push(...argv.slice(i + 1));
			break;
		}
		if (a.startsWith('--')) {
			const eq = a.indexOf('=');
			if (eq !== -1) {
				flags[a.slice(2, eq)] = a.slice(eq + 1);
			} else {
				const name = a.slice(2);
				const next = argv[i + 1];
				if (booleans.includes(name) || next === undefined || next.startsWith('--')) flags[name] = true;
				else {
					flags[name] = next;
					i++;
				}
			}
		} else positional.push(a);
	}
	return {positional, flags};
};

// Run a child with the terminal attached. Returns the exit status (null when it could not start).
export const runInherit = (cmd, args, opts = {}) => {
	const r = spawnSync(cmd, args, {stdio: 'inherit', cwd: ROOT, ...opts});
	if (r.error) return {status: null, error: r.error};
	return {status: r.status, signal: r.signal};
};

// Run a child and capture both streams. ffmpeg reports its measurements on stderr even on
// success, so callers that parse output always want both.
export const capture = (cmd, args, opts = {}) => {
	const r = spawnSync(cmd, args, {encoding: 'utf8', maxBuffer: 1 << 28, cwd: ROOT, ...opts});
	return {status: r.status, error: r.error ?? null, stdout: r.stdout ?? '', stderr: r.stderr ?? '', all: `${r.stdout ?? ''}\n${r.stderr ?? ''}`};
};

// Load a film's beatmap.ts. It is import-free, erasable TypeScript, so Node 22.18+ strips the
// types and imports it directly; tools read FPS, DURATION, M and the optional AUDIT settings.
export const loadBeatmap = async (id) => {
	const file = path.join(filmDir(id), 'beatmap.ts');
	if (!existsSync(file)) throw new UsageError(`src/films/${id}/beatmap.ts is missing: every film keeps its timing there.`);
	const mod = await import(pathToFileURL(file).href);
	const fps = Number(mod.FPS);
	const duration = Number(mod.DURATION);
	if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(duration) || duration <= 0) {
		throw new UsageError(`src/films/${id}/beatmap.ts must export FPS and DURATION (frames) as positive numbers.`);
	}
	return {fps, duration, seconds: duration / fps, moments: mod.M ?? {}, sections: mod.SECTIONS ?? [], audit: mod.AUDIT ?? {}, module: mod};
};

// A tool's main(): usage errors print one line and exit 2; anything else keeps its stack.
export const main = (fn) => {
	Promise.resolve()
		.then(fn)
		.then((code) => {
			if (typeof code === 'number') process.exitCode = code;
		})
		.catch((err) => {
			if (err instanceof UsageError) {
				console.error(err.message);
				process.exitCode = 2;
			} else {
				console.error(err?.stack ?? String(err));
				process.exitCode = 1;
			}
		});
};

export const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

export const fmtBytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} kB`);
