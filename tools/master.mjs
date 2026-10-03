#!/usr/bin/env node
// npm run master -- <id> [targetLUFS] [ceilingDBTP]
// Runs audio/master.mjs out/<id>/raw.mp4 out/<id>/<id>.mp4: -16 LUFS by default, dynamics kept,
// BT.709 tags written losslessly. See audio/master.mjs for why it is not plain loudnorm.
import {existsSync} from 'node:fs';
import path from 'node:path';
import {ROOT, UsageError, main, outputs, parseArgs, rel, requireFilm, runInherit} from './lib/kit.mjs';

main(() => {
	const {positional} = parseArgs(process.argv.slice(2));
	const id = requireFilm(positional[0]);
	const o = outputs(id);
	if (!existsSync(o.raw)) throw new UsageError(`${rel(o.raw)} does not exist yet. Run: npm run render -- ${id}`);
	const r = runInherit(process.execPath, [path.join(ROOT, 'audio', 'master.mjs'), rel(o.raw), rel(o.master), ...positional.slice(1)]);
	if (r.status === null) throw new Error(`could not start node: ${r.error?.message}`);
	return r.status;
});
