#!/usr/bin/env node
/**
 * shotwatch: turn a video into things a language model can actually perceive.
 *
 * A model cannot watch video. It can read images and numbers. So "watching" means:
 *   1. find the real shot boundaries (numbers)
 *   2. sample a representative frame per shot (images)
 *   3. tile them at a density that stays LEGIBLE (images)
 *   4. measure luminance, motion energy and audio dynamics over time (numbers)
 *
 * Usage: node tools/shotwatch.mjs <film-id | video> [--out DIR] [--grid 3x2] [--scene 0.15]
 *                                 [--every 3] [--cellw 640] [--source master|raw|preview]
 * A film id reads its newest render and writes to out/<id>/shotwatch/. Any other video writes
 * to _scope/<name>/ beside it.
 */
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {LABEL_FONT, requireSummary, safeLabel} from './lib/ffmpeg.mjs';
import {ROOT, UsageError, isFilmId, main, outputs, parseArgs, pickRendered, requireFilm} from './lib/kit.mjs';

main(() => {
	const {positional, flags} = parseArgs(process.argv.slice(2));
	const target = positional[0];
	if (!target) throw new UsageError('usage: node tools/shotwatch.mjs <film-id | video> [--out DIR] [--grid CxR] [--scene N]');
	let src;
	let OUT;
	const slugOf = (p) => path.basename(p).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
	if (!existsSync(target) && isFilmId(target)) {
		const id = requireFilm(target);
		src = pickRendered(id, flags.source);
		OUT = path.resolve(typeof flags.out === 'string' ? flags.out : path.join(outputs(id).dir, 'shotwatch'));
	} else {
		if (!existsSync(target)) throw new UsageError(`No such film id or file: ${target}`);
		src = path.resolve(target);
		OUT = path.resolve(typeof flags.out === 'string' ? flags.out : path.join(path.dirname(src), '_scope'), slugOf(src));
	}
	const [GC, GR] = String(flags.grid ?? '3x2').split('x').map(Number);
	const SCENE = Number(flags.scene ?? 0.15);
	const CELL_W = Number(flags.cellw ?? 640);
	const EVERY = Number(flags.every ?? 3);

	mkdirSync(OUT, {recursive: true});
	// cwd is the kit root, so the label font's relative path resolves and never needs escaping.
	const sh = (cmd, a) => execFileSync(cmd, a, {encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT});
	// ffmpeg writes filter logs (scdet, ebur128, volumedetect) to STDERR, and execFileSync returns
	// stdout only. Every measurement below needs both streams.
	const shq = (cmd, a) => {
		const r = spawnSync(cmd, a, {encoding: 'utf8', maxBuffer: 1 << 28, cwd: ROOT});
		return (r.stdout || '') + '\n' + (r.stderr || '');
	};

	// ---------- 1. container facts ----------
	const probe = JSON.parse(sh('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', src]));
	const v = probe.streams.find((s) => s.codec_type === 'video');
	const a = probe.streams.find((s) => s.codec_type === 'audio');
	if (!v) throw new UsageError(`${src} has no video stream`);
	const dur = Number(probe.format.duration);
	const fps = (() => {
		const [n, d] = (v.r_frame_rate || '0/1').split('/').map(Number);
		return d ? n / d : 0;
	})();

	const meta = {
		file: path.basename(src),
		duration_s: +dur.toFixed(3),
		width: v.width,
		height: v.height,
		fps: +fps.toFixed(3),
		vcodec: v.codec_name,
		pix_fmt: v.pix_fmt,
		bitrate_kbps: probe.format.bit_rate ? Math.round(probe.format.bit_rate / 1000) : null,
		has_audio: !!a,
		acodec: a ? a.codec_name : null,
		asample_rate: a ? Number(a.sample_rate) : null,
		achannels: a ? a.channels : null,
	};

	// ---------- 2. shot boundaries (real cuts) ----------
	// scdet logs "lavfi.scd.score: S, lavfi.scd.time: T" for every frame at or over its own
	// threshold. Run it LOW and threshold here, so the number stays checkable.
	const scdetRaw = shq('ffmpeg', ['-hide_banner', '-nostats', '-i', src, '-vf', 'scdet=threshold=4', '-an', '-f', 'null', '-']);
	const scores = [];
	for (const line of scdetRaw.split(/\r?\n/)) {
		const m = line.match(/lavfi\.scd\.score:\s*([0-9.]+),\s*lavfi\.scd\.time:\s*([0-9.]+)/);
		if (m) scores.push([Number(m[2]), Number(m[1])]);
	}
	scores.sort((p, q) => p[0] - q[0]);
	// scdet score is 0..100 percentage-of-change. Convert the threshold.
	const thresh = SCENE * 100;
	const cuts = [0];
	for (const [t, s] of scores) {
		if (s >= thresh && t - cuts[cuts.length - 1] > 0.25) cuts.push(+t.toFixed(3));
	}
	const shots = cuts.map((start, i) => {
		const end = i + 1 < cuts.length ? cuts[i + 1] : dur;
		return {i, start: +start.toFixed(3), end: +end.toFixed(3), len: +(end - start).toFixed(3), mid: +((start + end) / 2).toFixed(3)};
	});

	// ---------- 3. per-frame luminance + motion energy ----------
	// Downscale hard first: kills grain so we measure content, not noise.
	const series = (vf) => {
		const raw = shq('ffmpeg', ['-hide_banner', '-nostats', '-i', src, '-vf', vf, '-an', '-f', 'null', '-']);
		const out = [];
		let t = null;
		for (const line of raw.split(/\r?\n/)) {
			let m = line.match(/pts_time:([0-9.]+)/);
			if (m) {
				t = Number(m[1]);
				continue;
			}
			m = line.match(/lavfi\.signalstats\.YAVG=([0-9.]+)/);
			if (m && t !== null) out.push([+t.toFixed(2), Number(m[1])]);
		}
		return out;
	};
	// format=yuv420p first: signalstats reports 10-bit luma on 0 to 1023, which would read 4x bright.
	const luma = series('fps=10,scale=240:-2,format=yuv420p,signalstats,metadata=print:file=-');
	// motion energy: mean absolute frame difference on the downscaled stream
	const energy = series('fps=10,scale=240:-2,format=gray,tblend=all_mode=difference,signalstats,metadata=print:file=-');
	const lumaVals = luma.map((x) => x[1]);
	const eVals = energy.map((x) => x[1]);
	const mean = (arr) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1);
	const sd = (arr) => {
		const m = mean(arr);
		return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
	};
	const SETTLED = 0.6; // on a 0-255 diff scale at 10fps
	const settledFrac = eVals.length ? eVals.filter((x) => x < SETTLED).length / eVals.length : null;

	// ---------- 4. audio ----------
	let audio = null;
	if (a) {
		// The Summary block only: the per-frame rows before it are running values.
		const eb = requireSummary(shq('ffmpeg', ['-hide_banner', '-nostats', '-i', src, '-af', 'ebur128=peak=true', '-f', 'null', '-']), path.basename(src));
		audio = {
			integrated_lufs: eb.integratedLoudness,
			loudness_range_lu: eb.loudnessRange,
			true_peak_dbtp: eb.truePeak,
		};
		// is it actually audible, or a silent track?
		const vol = shq('ffmpeg', ['-hide_banner', '-nostats', '-i', src, '-af', 'volumedetect', '-f', 'null', '-']);
		const mm = vol.match(/mean_volume:\s*(-?[0-9.]+) dB/);
		audio.mean_volume_db = mm ? Number(mm[1]) : null;
		audio.silent = audio.mean_volume_db === null || audio.mean_volume_db < -70;
		try {
			sh('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-filter_complex', 'showwavespic=s=1600x300:colors=white', '-frames:v', '1', path.join(OUT, 'waveform.png')]);
		} catch {
			// the numbers above still stand without the picture
		}
	}

	// ---------- 5. frames: one per shot, at a LEGIBLE size ----------
	const frameDir = path.join(OUT, 'frames');
	if (existsSync(frameDir)) rmSync(frameDir, {recursive: true, force: true});
	mkdirSync(frameDir, {recursive: true});

	// Sample at shot boundaries AND on a fixed cadence, then merge. The best product films barely
	// cut at all (one widely praised 90-second film has two shots), so shot-based sampling alone
	// would hand back two frames and call that "watching it". Time-based sampling sees the film.
	const marks = new Map();
	for (const s of shots) marks.set(+(s.start + Math.min(0.6, s.len * 0.45)).toFixed(2), {i: s.i, start: s.start, len: s.len, kind: 'cut'});
	for (let t = 0; t < dur - 0.2; t += EVERY) {
		const k = +t.toFixed(2);
		if (![...marks.keys()].some((m) => Math.abs(m - k) < EVERY * 0.5)) {
			const s = shots.find((x) => k >= x.start && k < x.end) || shots[0];
			marks.set(k, {i: s.i, start: s.start, len: s.len, kind: 'time'});
		}
	}
	const picked = [...marks.entries()].sort((x, y) => x[0] - y[0]).map(([at, m], n) => ({...m, n, at}));
	picked.forEach((p, k) => {
		// Burn the label at extraction time: per-cell text is known here, which keeps the tiling step
		// a single dumb filter that cannot go wrong.
		const label = safeLabel(`${p.at.toFixed(1)}s  sh#${p.i} (${p.len.toFixed(1)}s) ${p.kind}`);
		const f = path.join(frameDir, `f${String(k).padStart(4, '0')}.jpg`);
		p.file = path.basename(f);
		try {
			sh('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(p.at), '-i', src, '-frames:v', '1', '-q:v', '2', '-vf', `scale=${CELL_W}:-2,drawtext=fontfile=${LABEL_FONT}:text='${label}':x=12:y=12:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.8:boxborderw=7`, f]);
		} catch {
			try {
				sh('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(p.at), '-i', src, '-frames:v', '1', '-q:v', '2', '-vf', `scale=${CELL_W}:-2`, f]);
			} catch {
				// a frame that cannot be read is simply missing from the sheet
			}
		}
	});

	// ---------- 6. contact sheets at a density that stays readable ----------
	// tile emits one sheet per GC*GR inputs automatically.
	const sheets = [];
	try {
		sh('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-start_number', '0', '-i', path.join(frameDir, 'f%04d.jpg'), '-vf', `tile=${GC}x${GR}:padding=6:margin=6:color=0x111111`, '-fps_mode', 'passthrough', '-q:v', '3', '-start_number', '0', path.join(OUT, 'sheet%02d.jpg')]);
		for (const n of readdirSync(OUT)) if (/^sheet\d+\.jpg$/.test(n)) sheets.push(n);
		sheets.sort();
	} catch {
		// no sheets: the report says so
	}

	// ---------- 7. report ----------
	const shotLens = shots.map((s) => s.len);
	const report = {
		meta,
		edit: {
			detected_shots: shots.length,
			cuts_per_min: +(shots.length / (dur / 60)).toFixed(1),
			mean_shot_s: +mean(shotLens).toFixed(2),
			median_shot_s: +[...shotLens].sort((x, y) => x - y)[Math.floor(shotLens.length / 2)].toFixed(2),
			min_shot_s: +Math.min(...shotLens).toFixed(2),
			max_shot_s: +Math.max(...shotLens).toFixed(2),
			shots_over_2_3s_pct: +((100 * shotLens.filter((x) => x >= 2.3).length) / shotLens.length).toFixed(1),
			scene_threshold_pct: thresh,
			// How much the frame actually CHANGES at a cut. A real hard cut between two different
			// setups scores 40-90. If the max across a whole film is about 24, every shot looks like
			// every other shot: that is "samey" as a number.
			cut_strength_max: scores.length ? +Math.max(...scores.map((s) => s[1])).toFixed(1) : null,
			cut_strength_mean: scores.length ? +mean(scores.map((s) => s[1])).toFixed(1) : null,
			cut_candidates_over_40: scores.filter((s) => s[1] >= 40).length,
		},
		picture: {
			mean_luma_0_255: +mean(lumaVals).toFixed(1),
			mean_luma_pct: +((100 * mean(lumaVals)) / 255).toFixed(1),
			luma_sd: +sd(lumaVals).toFixed(1),
			luma_min: +Math.min(...lumaVals).toFixed(1),
			luma_max: +Math.max(...lumaVals).toFixed(1),
			luma_range: +(Math.max(...lumaVals) - Math.min(...lumaVals)).toFixed(1),
			mean_motion_energy: +mean(eVals).toFixed(3),
			settled_fraction: settledFrac === null ? null : +settledFrac.toFixed(3),
		},
		audio,
		shots,
		sheets,
		series: {luma, energy},
	};
	writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

	// human summary
	const L = [];
	L.push(`FILE      ${path.basename(src)}`);
	L.push(`FORMAT    ${meta.width}x${meta.height} @ ${meta.fps}fps  ${meta.duration_s}s  ${meta.vcodec} ${meta.bitrate_kbps}kbps`);
	L.push(
		`AUDIO     ${meta.has_audio ? `${meta.acodec} ${meta.asample_rate}Hz ${meta.achannels}ch` : 'NONE'}` +
			(audio ? `  | I ${audio.integrated_lufs} LUFS  LRA ${audio.loudness_range_lu} LU  peak ${audio.true_peak_dbtp} dBFS  mean ${audio.mean_volume_db} dB${audio.silent ? '  *** SILENT ***' : ''}` : ''),
	);
	L.push(`CUTSTR    max ${report.edit.cut_strength_max}%  mean ${report.edit.cut_strength_mean}%  candidates>=40%: ${report.edit.cut_candidates_over_40}`);
	L.push(`EDIT      ${report.edit.detected_shots} shots  ${report.edit.cuts_per_min}/min  mean ${report.edit.mean_shot_s}s  median ${report.edit.median_shot_s}s  range ${report.edit.min_shot_s}-${report.edit.max_shot_s}s  |  ${report.edit.shots_over_2_3s_pct}% readable-length`);
	L.push(`PICTURE   luma ${report.picture.mean_luma_pct}% (sd ${report.picture.luma_sd}, range ${report.picture.luma_range})  motion ${report.picture.mean_motion_energy}  settled ${report.picture.settled_fraction}`);
	L.push(`SHEETS    ${sheets.length} contact sheets, ${GC}x${GR} @ ${CELL_W}px cells -> ${OUT}`);
	const txt = L.join('\n');
	writeFileSync(path.join(OUT, 'summary.txt'), txt);
	console.log(txt);
	return 0;
});
