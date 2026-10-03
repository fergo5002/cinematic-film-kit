#!/usr/bin/env node
// npm run score -- <id>
// Runs src/films/<id>/score.mjs, which synthesises public/films/<id>/score.wav from the film's
// beatmap. Node 22.18 and later strip the beatmap's TypeScript types, so no build step.
import {existsSync} from 'node:fs';
import path from 'node:path';
import {UsageError, filmDir, main, parseArgs, requireFilm, runInherit} from './lib/kit.mjs';

main(() => {
	const {positional} = parseArgs(process.argv.slice(2));
	const id = requireFilm(positional[0]);
	const script = path.join(filmDir(id), 'score.mjs');
	if (!existsSync(script)) throw new UsageError(`src/films/${id}/score.mjs does not exist: this film has no synthesised score.`);
	const [major, minor] = process.versions.node.split('.').map(Number);
	if (major < 22 || (major === 22 && minor < 18)) throw new UsageError(`Node ${process.versions.node} cannot import beatmap.ts. Install Node 22.18 or later (npm run doctor says how).`);
	const r = runInherit(process.execPath, ['--disable-warning=ExperimentalWarning', script]);
	if (r.status === null) throw new Error(`could not start node: ${r.error?.message}`);
	return r.status;
});
