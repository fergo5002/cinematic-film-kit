// The release gate's bookkeeping: a step that did not run is NOT RUN and never PASS, a release
// with any such step is INCOMPLETE, and the delivery checks catch a file that would not play right.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {STATUS, STEPS, checkProvenance, complete, deliveryChecks, reportMarkdown, topLevelAtoms, verdict} from '../lib/release.mjs';
import {makeSyntheticFilm, node, tempDir, tempKit, writeBeatmap} from './helpers.mjs';

const pass = (name) => ({name, status: STATUS.PASS, detail: 'ok'});

test('the verdict is PASS only when every step ran and passed', () => {
	assert.equal(verdict(STEPS.map(pass)), 'PASS');
	assert.equal(verdict(complete(STEPS.slice(0, 3).map(pass), 'not run')), 'INCOMPLETE');
	assert.equal(verdict([...STEPS.slice(0, -1).map(pass), {name: 'delivery', status: STATUS.FAIL}]), 'FAIL');
	assert.equal(verdict([{name: 'typecheck', status: STATUS.FAIL}, ...complete([], 'x').slice(1)]), 'FAIL');
});

test('steps that never ran are reported NOT RUN, with the reason', () => {
	const steps = complete([pass('typecheck'), {name: 'slop-lint', status: STATUS.FAIL, detail: '1 errors'}], 'not run: slop-lint failed first');
	assert.deepEqual(steps.map((s) => s.status), ['PASS', 'FAIL', 'NOT RUN', 'NOT RUN', 'NOT RUN', 'NOT RUN', 'NOT RUN', 'NOT RUN']);
	const md = reportMarkdown({id: 'demo', steps, when: 'now'});
	assert.match(md, /Verdict: \*\*FAIL\*\*/);
	assert.match(md, /\| render \| NOT RUN \| not run: slop-lint failed first \|/);
	assert.doesNotMatch(md, /\| (provenance|score|render|master|audit|delivery) \| PASS/);
});

// Generated media written the way connectors/lib/output.mjs and core.mjs write it.
const generate = (kit, id, name, bytes, {sidecar = true, done = true, tamper = false} = {}) => {
	const dir = path.join(kit, 'public', 'films', id, 'media');
	mkdirSync(dir, {recursive: true});
	writeFileSync(path.join(dir, name), bytes);
	const sha = createHash('sha256').update(bytes).digest('hex');
	const rel = `public/films/${id}/media/${name}`;
	if (sidecar) writeFileSync(path.join(dir, `${name}.prov.json`), JSON.stringify({provider: 'mock', file: rel, output: {bytes: bytes.length, sha256: sha}}));
	appendFileSync(path.join(dir, 'ledger.jsonl'), `${JSON.stringify({job: name, event: 'reserved', spendUsd: 0.01})}\n`);
	if (done) appendFileSync(path.join(dir, 'ledger.jsonl'), `${JSON.stringify({job: name, event: 'done', file: rel, sha256: sha, spendUsd: 0.01})}\n`);
	if (tamper) writeFileSync(path.join(dir, name), Buffer.concat([bytes, Buffer.from('edited')]));
};

test('provenance: every generated file needs a matching sidecar and a done line', (t) => {
	const kit = tempDir(t, 'prov-');
	assert.equal(checkProvenance(kit, 'demo').status, 'PASS', 'no media folder passes');
	generate(kit, 'demo', 'plate.png', Buffer.from('png bytes'));
	assert.deepEqual(checkProvenance(kit, 'demo'), {status: 'PASS', detail: '1 generated file, each with a matching sidecar and ledger line', problems: []});

	generate(kit, 'demo', 'loose.png', Buffer.from('dropped in by hand'), {sidecar: false, done: false});
	generate(kit, 'demo', 'edited.png', Buffer.from('original'), {tamper: true});
	generate(kit, 'demo', 'crashed.mp4', Buffer.from('half a job'), {done: false});
	const r = checkProvenance(kit, 'demo');
	assert.equal(r.status, 'FAIL');
	assert.deepEqual(r.problems.sort(), [
		'public/films/demo/media/crashed.mp4 has no "done" line with its sha256 in ledger.jsonl',
		'public/films/demo/media/edited.png has changed since it was generated (its sidecar records a different sha256)',
		'public/films/demo/media/edited.png has no "done" line with its sha256 in ledger.jsonl',
		'public/films/demo/media/loose.png has no "done" line with its sha256 in ledger.jsonl',
		'public/films/demo/media/loose.png has no loose.png.prov.json',
	]);
});

test('release fails at the provenance step, and reports everything after it NOT RUN', (t) => {
	const kit = tempKit(t);
	writeBeatmap(kit, 'demo');
	generate(kit, 'demo', 'plate.png', Buffer.from('no ledger line'), {done: false});
	const r = node([path.join(kit, 'tools', 'release.mjs'), 'demo', '--from', 'provenance'], {cwd: kit});
	assert.equal(r.status, 1);
	const report = readFileSync(path.join(kit, 'out', 'demo', 'report.md'), 'utf8');
	assert.match(report, /Verdict: \*\*FAIL\*\*/);
	assert.match(report, /\| provenance \| FAIL \| public\/films\/demo\/media\/plate\.png has no "done" line/);
	for (const step of ['score', 'render', 'master', 'audit', 'delivery']) assert.match(report, new RegExp(`\\| ${step} \\| NOT RUN \\|`));
});

test('delivery checks pass a proper master and catch an unplayable one', (t) => {
	const film = {fps: 30, frames: 270, width: 1920, height: 1080};
	const good = {duration: 9, video: {codec: 'h264', pixFmt: 'yuv420p', width: 1920, height: 1080, fps: 30, frames: 270, colorPrimaries: 'bt709', colorTransfer: 'bt709', colorSpace: 'bt709'}, audio: {codec: 'aac', sampleRate: 48000, channels: 2}};
	assert.ok(deliveryChecks({media: good, film, atoms: ['ftyp', 'moov', 'mdat']}).every((c) => c.ok));
	const bad = {...good, video: {...good.video, pixFmt: 'yuv444p', colorPrimaries: null}, audio: null};
	const failed = deliveryChecks({media: bad, film, atoms: ['ftyp', 'mdat', 'moov']}).filter((c) => !c.ok).map((c) => c.name);
	assert.deepEqual(failed, ['pixel format', 'colour primaries', 'audio codec', 'audio sample rate', 'audio channels', 'fast start']);

	// The atom reader on real files: with and without +faststart.
	const dir = tempDir(t, 'release-');
	const src = makeSyntheticFilm(path.join(dir, 'src.mp4'));
	const fast = path.join(dir, 'fast.mp4');
	const slow = path.join(dir, 'slow.mp4');
	spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-c', 'copy', '-movflags', '+faststart', fast]);
	spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-c', 'copy', slow]);
	const order = (atoms) => atoms.indexOf('moov') < atoms.indexOf('mdat');
	assert.ok(order(topLevelAtoms(fast)), `faststart file: ${topLevelAtoms(fast).join(' > ')}`);
	assert.ok(!order(topLevelAtoms(slow)), `plain file: ${topLevelAtoms(slow).join(' > ')}`);
});
