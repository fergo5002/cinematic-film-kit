#!/usr/bin/env node
// npm run new-film -- <id> [--title "Spring launch"]
//   Copies src/films/template to src/films/<id>, renames its ids, gives it a blank brief,
//   treatment and expected, and regenerates src/films/registry.ts.
// npm run new-film -- --registry
//   Only regenerates src/films/registry.ts (after you rename or delete a film folder by hand).
//
// Film ids are folder names and composition ids: lowercase letters, digits and hyphens.
import {cpSync, existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {STUBS, componentName, jsString, titleFrom, writeRegistry} from './lib/films.mjs';
import {FILM_ID, UsageError, filmDir, main, parseArgs, rel, runInherit} from './lib/kit.mjs';

const rewrite = (dir, id, name, title) => {
	const changed = [];
	const walk = (d) => {
		for (const f of readdirSync(d)) {
			const p = path.join(d, f);
			if (statSync(p).isDirectory()) {
				walk(p);
				continue;
			}
			if (!/\.(tsx?|mjs|js|json|md)$/.test(f)) continue;
			const before = readFileSync(p, 'utf8');
			let after = before
				.replaceAll('films/template/', `films/${id}/`)
				.replace(/id: 'template'/g, `id: '${id}'`)
				.replace(/title: 'Template'/g, () => `title: ${jsString(title)}`);
			if (/\.(tsx?|mjs|js)$/.test(f)) after = after.replace(/\bTemplate\b/g, name);
			if (after !== before) {
				writeFileSync(p, after);
				changed.push(rel(p));
			}
		}
	};
	walk(dir);
	return changed;
};

main(() => {
	const {positional, flags} = parseArgs(process.argv.slice(2), {booleans: ['registry', 'no-score']});
	if (flags.registry) {
		const ids = writeRegistry();
		console.log(`src/films/registry.ts lists ${ids.length} film${ids.length === 1 ? '' : 's'}: ${ids.join(', ')}`);
		return 0;
	}
	const id = positional[0];
	if (!id) throw new UsageError('usage: npm run new-film -- <id> [--title "Spring launch"]   (id: lowercase letters, digits, hyphens)');
	if (!FILM_ID.test(id)) throw new UsageError(`"${id}" is not a film id: use lowercase letters, digits and single hyphens, like spring-launch`);
	const template = filmDir('template');
	if (id === 'template') throw new UsageError('"template" is the starter itself; pick a name for your film.');
	if (!existsSync(path.join(template, 'film.ts'))) throw new UsageError('src/films/template is missing: new films are copies of it.');
	const dir = filmDir(id);
	if (existsSync(dir)) throw new UsageError(`src/films/${id} already exists. Nothing was changed.`);

	const title = typeof flags.title === 'string' ? flags.title : titleFrom(id);
	// The template's README describes the template, so it stays behind.
	cpSync(template, dir, {recursive: true, filter: (src) => !(path.dirname(src) === template && path.basename(src) === 'README.md')});
	const taken = readdirSync(dir).map((f) => f.replace(/\.[^.]+$/, ''));
	const name = componentName(id, taken.filter((t) => t !== 'Template'));
	renameSync(path.join(dir, 'Template.tsx'), path.join(dir, `${name}.tsx`));
	const changed = rewrite(dir, id, name, title);
	for (const [file, stub] of Object.entries(STUBS)) writeFileSync(path.join(dir, file), stub(title));

	const ids = writeRegistry();
	console.log(`Made src/films/${id} from the template (component ${name} in ${name}.tsx; rewrote ${changed.length} files).`);
	console.log(`src/films/registry.ts now lists: ${ids.join(', ')}`);

	// Write the copy's score straight away, so the new film opens in Studio without a missing file.
	let scored = false;
	if (existsSync(path.join(dir, 'score.mjs')) && !flags['no-score']) {
		const r = runInherit(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(dir, 'score.mjs')]);
		scored = r.status === 0;
		if (!scored) console.warn(`warning: the new film's score.mjs did not run cleanly; run npm run score -- ${id} after fixing it`);
	}
	console.log(`\nNext:\n  fill in src/films/${id}/brief.md, then treatment.md and expected.md${scored ? '' : `\n  npm run score -- ${id}`}\n  npm run studio\n  npm run preview -- ${id}`);
	return 0;
});
