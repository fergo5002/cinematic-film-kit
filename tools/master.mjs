#!/usr/bin/env node
// npm run master -- <id> [targetLUFS] [ceilingDBTP]
// Runs audio/master.mjs out/<id>/raw.mp4 out/<id>/<id>.mp4: -16 LUFS by default, dynamics kept,
// BT.709 tags written losslessly. See audio/master.mjs for why it is not plain loudnorm.
//
// A narrated film (public/films/<id>/narration/meta.json, written by npm run narrate) also gets
// its AI-voice disclosure in the master's comment tag, and its captions beside the master as
// out/<id>/<id>.srt and <id>.vtt, ready to upload with it.
import {copyFileSync, existsSync, readFileSync, rmSync} from 'node:fs';
import path from 'node:path';
import {ROOT, UsageError, filmPublicDir, main, outputs, parseArgs, rel, requireFilm, runInherit} from './lib/kit.mjs';

main(() => {
	const {positional} = parseArgs(process.argv.slice(2));
	const id = requireFilm(positional[0]);
	const o = outputs(id);
	if (!existsSync(o.raw)) throw new UsageError(`${rel(o.raw)} does not exist yet. Run: npm run render -- ${id}`);
	const narration = path.join(filmPublicDir(id), 'narration');
	const metaFile = path.join(narration, 'meta.json');
	let disclosure = '';
	if (existsSync(metaFile)) {
		disclosure = JSON.parse(readFileSync(metaFile, 'utf8')).disclosure ?? '';
		if (!disclosure.startsWith('AI-generated voice')) throw new UsageError(`${rel(metaFile)} has no AI-voice disclosure. Run: npm run narrate -- ${id}`);
	}
	const r = runInherit(process.execPath, [path.join(ROOT, 'audio', 'master.mjs'), rel(o.raw), rel(o.master), ...positional.slice(1), ...(disclosure ? ['--comment', disclosure] : [])]);
	if (r.status === null) throw new Error(`could not start node: ${r.error?.message}`);
	for (const ext of ['srt', 'vtt']) {
		const dest = path.join(o.dir, `${id}.${ext}`);
		rmSync(dest, {force: true});
		if (r.status === 0 && disclosure && existsSync(path.join(narration, `captions.${ext}`))) copyFileSync(path.join(narration, `captions.${ext}`), dest);
	}
	if (r.status === 0 && disclosure) console.log(`narrated: the master's comment tag says "${disclosure}"; captions at ${rel(o.dir)}/${id}.srt and ${id}.vtt`);
	return r.status;
});
