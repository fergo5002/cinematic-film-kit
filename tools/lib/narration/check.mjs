// The release gate's narration step. A film is narrated when it has a narration.txt, a
// data/narration.json or a public/films/<id>/narration/ record. Then, after the master:
//   - everything narrate writes is there, and was voiced from narration.txt as it is now;
//   - the film plays the voice (its source mentions narration/narration.wav);
//   - the master's comment tag holds the AI-voice disclosure, and its captions sit beside it;
//   - the voice leads the bed by at least MIN_VOICE_LEAD_DB under speech, measured on the two
//     stems (narration.wav and score.wav) as the film plays them at full volume. A volume prop on
//     either <Audio> in the film is not seen by this measurement.
// No on-screen "AI-generated voice" credit is a note, not a failure: the post text may carry it.
// A film with no narration passes as "no narration", exactly as before narration existed.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {speechSpans} from './spans.mjs';
import {DISCLOSURE_PREFIX} from './meta.mjs';

export const MIN_VOICE_LEAD_DB = 10;
const SR = 48000;

const paths = (root, id) => {
	const film = path.join(root, 'src', 'films', id);
	const pub = path.join(root, 'public', 'films', id);
	const out = path.join(root, 'out', id);
	return {
		film,
		script: path.join(film, 'narration.txt'),
		data: path.join(film, 'data', 'narration.json'),
		dir: path.join(pub, 'narration'),
		wav: path.join(pub, 'narration', 'narration.wav'),
		meta: path.join(pub, 'narration', 'meta.json'),
		score: path.join(pub, 'score.wav'),
		master: path.join(out, `${id}.mp4`),
		out,
	};
};

const decodeMono = (file) => {
	const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], {maxBuffer: 1 << 30});
	if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${String(r.stderr).trim().split('\n').at(-1)}`);
	return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4);
};

const energyIn = (x, spans) => {
	let e = 0;
	for (const s of spans) for (let i = Math.max(0, Math.floor(s.start * SR)); i < Math.min(x.length, Math.ceil(s.end * SR)); i++) e += x[i] * x[i];
	return e;
};

// How far the voice sits above the bed while it speaks, in dB (unweighted RMS over the spoken phrases).
export const voiceLead = (root, id) => {
	const p = paths(root, id);
	const words = JSON.parse(readFileSync(p.data, 'utf8')).words ?? [];
	const spans = speechSpans(words);
	const voice = energyIn(decodeMono(p.wav), spans);
	if (!existsSync(p.score)) return {leadDb: Infinity, spans: spans.length, bed: false};
	const bed = energyIn(decodeMono(p.score), spans);
	return {leadDb: bed > 0 ? 10 * Math.log10(voice / bed) : Infinity, spans: spans.length, bed: true};
};

const filmSources = (dir) => {
	const out = [];
	const walk = (d) => {
		for (const f of readdirSync(d)) {
			const q = path.join(d, f);
			if (statSync(q).isDirectory()) walk(q);
			else if (/\.(tsx?|jsx?)$/.test(f)) out.push(readFileSync(q, 'utf8'));
		}
	};
	if (existsSync(dir)) walk(dir);
	return out.join('\n');
};

export const checkNarration = (root, id) => {
	const p = paths(root, id);
	if (![p.script, p.data, p.meta].some(existsSync)) return {status: 'PASS', detail: 'no narration', problems: [], notes: []};
	const problems = [];
	const notes = [];
	const missing = [p.script, p.data, p.wav, p.meta, path.join(p.dir, 'captions.srt'), path.join(p.dir, 'captions.vtt')].filter((f) => !existsSync(f));
	if (missing.length) {
		const list = missing.map((f) => path.relative(root, f).split(path.sep).join('/'));
		return {status: 'FAIL', detail: `missing ${list.join(', ')}: run npm run narrate -- ${id}`, problems: list.map((f) => `${f} is missing`), notes};
	}
	const meta = JSON.parse(readFileSync(p.meta, 'utf8'));
	const disclosure = meta.disclosure;
	if (meta.ai_generated !== true || typeof disclosure !== 'string' || !disclosure.startsWith(DISCLOSURE_PREFIX)) problems.push(`public/films/${id}/narration/meta.json has no AI-voice disclosure: run npm run narrate -- ${id}`);
	const sha = createHash('sha256').update(readFileSync(p.script)).digest('hex');
	if (meta.script?.sha256 !== sha) problems.push(`src/films/${id}/narration.txt has changed since it was voiced: run npm run narrate -- ${id}, then npm run score -- ${id}`);
	const data = JSON.parse(readFileSync(p.data, 'utf8'));
	if (data.disclosure !== disclosure) problems.push(`src/films/${id}/data/narration.json and the narration record disagree: run npm run narrate -- ${id}`);
	const src = filmSources(p.film);
	if (!/narration\/narration\.wav|<Narration\b/.test(src)) problems.push(`the film never plays its voice: add <Audio src={staticFile('films/${id}/narration/narration.wav')} /> (or <Narration>) to the composition`);
	if (!/AI-generated voice/i.test(src)) notes.push('no "AI-generated voice" credit on screen: put it on the end card, or in the text the film is posted with');
	if (!existsSync(p.master)) problems.push(`out/${id}/${id}.mp4 is missing: run npm run master -- ${id}`);
	else {
		const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags=comment', '-of', 'json', p.master], {encoding: 'utf8'});
		const comment = r.status === 0 ? JSON.parse(r.stdout).format?.tags?.comment : undefined;
		if (comment !== disclosure) problems.push(`out/${id}/${id}.mp4 does not carry the disclosure in its comment tag: run npm run master -- ${id}`);
		for (const ext of ['srt', 'vtt']) {
			const beside = path.join(p.out, `${id}.${ext}`);
			if (!existsSync(beside) || !readFileSync(beside).equals(readFileSync(path.join(p.dir, `captions.${ext}`)))) problems.push(`out/${id}/${id}.${ext} is missing or out of date: run npm run master -- ${id}`);
		}
	}
	const lead = voiceLead(root, id);
	if (lead.bed && lead.leadDb < MIN_VOICE_LEAD_DB) problems.push(`the voice leads the bed by only ${lead.leadDb.toFixed(1)} dB under speech; it needs at least ${MIN_VOICE_LEAD_DB} dB. Duck the score under the voice (audio/voice.mjs duckUnderSpeech in score.mjs) and run npm run score -- ${id}`);
	const leadText = lead.bed ? `voice leads the bed by ${lead.leadDb.toFixed(1)} dB under speech` : 'no score.wav under the voice';
	return problems.length
		? {status: 'FAIL', detail: problems.slice(0, 2).join('; ') + (problems.length > 2 ? ` (and ${problems.length - 2} more)` : ''), problems, notes}
		: {status: 'PASS', detail: `disclosed in the master and captions beside it; ${leadText}${notes.length ? `; note: ${notes[0]}` : ''}`, problems, notes};
};
