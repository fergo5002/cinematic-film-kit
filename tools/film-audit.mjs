#!/usr/bin/env node
/**
 * film-audit.mjs: the QA gate that actually fails.
 *
 * ---------------------------------------------------------------------------
 * VERSION 4 CALIBRATION. Read this before changing a threshold.
 *
 * Version 1 replaced a prose checklist with ten numeric gates, because a
 * genuinely abysmal film had passed the prose: 100 seconds, zero hard cuts,
 * 80% frozen, mean luminance 7.5%, audio LRA 2.8 LU.
 *
 * The film built to pass version 1 scored 19 of 19 and a viewer called it
 * "messy and all over the place" and "unclear what was happening". That is a
 * worse failure than the first one, because it was invisible to the tool.
 *
 * The cause was structural, not a wrong number:
 *
 *   1. EVERY GATE WAS A FLOOR. A floor with no ceiling is an instruction to
 *      maximise. "Motion energy >= 2.5" was satisfied by a camera moving on a
 *      random seed every shot, starfield parallax, 99 background threads and
 *      grain regenerating at 30Hz. All of it uncorrelated, which is the
 *      definition of visual noise. The gate cannot tell noise from life.
 *
 *   2. THE UNMEASURED CRITERIA WERE ABANDONED. Ten criteria failed the build
 *      and fourteen sat in a markdown file. The ten became the whole spec.
 *      Goodhart's law, operating inside one agent's workflow.
 *
 * Version 4 adds evidence from nine independent canon films and one approved
 * film. It compares frame-difference energy at a 60fps equivalent, uses
 * two-sided motion bands, and requires audible audio for a full pass.
 *
 * Scene-change detections are diagnostic. They are not asserted editorial
 * cuts, because morphs, flashes, lighting, UI replacement, and wipes can create
 * or hide detections. Mean detector interval and reading-length fraction inherit
 * that limitation. Use authored cut and text manifests for those gates.
 *
 * Known implementation limits retained to keep the calibration evidence valid:
 * the worst concentration window is 30 moving frames rather than fixed time,
 * and active energy inherits classification errors from freezedetect.
 * tools/release.mjs reads the JSON this writes; keep its shape stable.
 *
 * This tool still cannot judge story clarity, originality, or product meaning.
 * ---------------------------------------------------------------------------
 *
 * Usage:
 *   node tools/film-audit.mjs <film-id | video> [--profile dark|standard|light|ui-light]
 *        [--target-duration 60] [--scene-threshold 0.05] [--json out.json] [--baseline]
 *        [--source master|raw|preview] [--lufs-min -16] [--lufs-max -13]
 *
 * With a film id it audits out/<id>/<id>.mp4 (the master), takes the target
 * duration from the film's beatmap, takes the profile from the beatmap's
 * optional `export const AUDIT = {profile: 'dark'}`, and writes
 * out/<id>/audit.json. Flags override all of these.
 *
 * --baseline prints the measurements and exits 0 without gating. Use it to
 * characterise a reference film rather than to judge your own.
 *
 * Exit 0 = every gate passed. 1 = at least one FAIL. 2 = it could not measure.
 * Warnings never fail. Requires ffmpeg + ffprobe on PATH.
 */

import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';

import {parseEbur128Summary} from './film-audit-audio.mjs';
import {ROOT, UsageError, isFilmId, loadBeatmap, main, outputs, parseArgs, requireFilm} from './lib/kit.mjs';

const PROFILES = ['dark', 'standard', 'light', 'ui-light'];

// Paths inside the kit are written relative to it, so reports carry no one's folder names.
const shownPath = (p) => {
	const r = path.relative(ROOT, path.resolve(p));
	return r.startsWith('..') || path.isAbsolute(r) ? p : r.split(path.sep).join('/');
};

main(async () => {
	const {positional, flags} = parseArgs(process.argv.slice(2), {booleans: ['baseline']});
	const target0 = positional[0];
	if (!target0) throw new UsageError('usage: npm run audit -- <film-id> [--profile dark|standard|light|ui-light]   or   node tools/film-audit.mjs <video>');

	// ---- what to audit: a film id, or any video file
	let file;
	let film = null;
	let TARGET = flags['target-duration'] !== undefined ? Number(flags['target-duration']) : 60;
	let PROFILE = flags.profile ?? 'dark';
	let JSON_OUT = typeof flags.json === 'string' ? flags.json : null;
	let lufsMin = flags['lufs-min'] !== undefined ? Number(flags['lufs-min']) : -16;
	let lufsMax = flags['lufs-max'] !== undefined ? Number(flags['lufs-max']) : -13;
	let SCENE = flags['scene-threshold'] !== undefined ? Number(flags['scene-threshold']) : 0.05;

	if (!existsSync(target0) && isFilmId(target0)) {
		film = requireFilm(target0);
		const out = outputs(film);
		const source = flags.source ?? 'master';
		file = source === 'raw' ? out.raw : source === 'preview' ? out.preview : out.master;
		if (!existsSync(file)) {
			const how = source === 'master' ? `npm run master -- ${film}` : `npm run ${source === 'raw' ? 'render' : 'preview'} -- ${film}`;
			throw new UsageError(`${path.relative(process.cwd(), file)} does not exist yet. Make it first: ${how}`);
		}
		const beat = await loadBeatmap(film);
		if (flags['target-duration'] === undefined) TARGET = beat.seconds;
		if (flags.profile === undefined && beat.audit.profile) PROFILE = beat.audit.profile;
		if (flags['lufs-min'] === undefined && beat.audit.lufsMin !== undefined) lufsMin = Number(beat.audit.lufsMin);
		if (flags['lufs-max'] === undefined && beat.audit.lufsMax !== undefined) lufsMax = Number(beat.audit.lufsMax);
		if (flags['scene-threshold'] === undefined && beat.audit.sceneThreshold !== undefined) SCENE = Number(beat.audit.sceneThreshold);
		if (JSON_OUT === null && source === 'master') JSON_OUT = out.audit;
		if (JSON_OUT === null) JSON_OUT = path.join(out.dir, `audit-${source}.json`);
	} else {
		file = target0;
		if (!existsSync(file)) throw new UsageError(`No such film id or file: ${target0}`);
	}
	if (!PROFILES.includes(PROFILE)) throw new UsageError(`--profile must be one of ${PROFILES.join(', ')}`);
	const BASELINE = flags.baseline === true;

	// Picture bands use measured positive and rejected films. Audio bands are
	// delivery targets. Downloaded reference audio is observation, not a master.
	const T = {
		durationMax: TARGET * 1.125,

		// ---- detector diagnostics
		// Broadcast subtitle standards: 17 CPS typical, 20 CPS maximum, and a 2.0s
		// minimum display for any line. Add 0.3s to reacquire the frame after a cut
		// and a text-bearing shot needs 2.3s. A film whose shots are mostly shorter
		// than that cannot be read, which is exactly what "unclear what was
		// happening" means.
		readingShotSeconds: 2.3,

		// ---- stillness. THE TWO-SIDED GATE, and the most useful one in the file.
		//
		// v1 gated "total frozen time <= 25%" as a one-sided ceiling. That is wrong in
		// a way that took three films to see. MEASURED, at freezedetect's own -40dB:
		//
		//     cut 1, dead and unwatchable        80.4%   too still
		//     cut 2, frantic and unwatchable      0.0%   NEVER HOLDS
		//     cut 3, holds and moves             50.1%   right
		//
		// Cut 2 scored a perfect zero and was the worst film of the three. A one-sided
		// ceiling rewards a camera that never stops, which is precisely the failure it
		// was supposed to prevent.
		//
		// It is also arithmetically impossible to hold a frame and pass a 25% ceiling.
		// -40dB means every frame must change by 2.55 of 255 or it counts as frozen.
		// Measured on rendered PNGs, with no encoder involved: a 5px sinusoidal drift
		// gives 0.2, tasteful film grain at 3.5% gives 0.5, and both together give
		// 0.7. To clear 2.55 you have to MOVE THE CAMERA, which is what cut 2 did.
		// Meanwhile the research floor for reading a line of text is 2.0s of STABLE
		// frame. The two requirements are opposed and the film always loses.
		//
		// So it is a band. Too little stillness is frantic, too much is a slideshow,
		// and both of the failed cuts fall outside it.
		// A frame is SETTLED when its energy is under this. Holds measure 0.15 to
		// 0.35; anything actually moving measures 1.5 or more, so the boundary is
		// wide and not sensitive to where exactly it sits.
		settledLevel: 0.3,
		settledRunMinSeconds: 0.25,
		settledRunMaxSeconds: 5.25,
		settledMin: 0.04,
		settledMax: 0.88,

		// ---- luminance, 0-255
		//
		// FOUR PROFILES, because the tool cannot judge exposure without knowing what
		// the film is trying to be. Running a high-key film against the dark bands
		// reports six failures that all reduce to "this film is bright", and the only
		// way to satisfy them is to make it dark again.
		//
		//   dark      a night film. 18-34% mean. Murk is the failure mode.
		//   standard  a mixed film. 27-47%.
		//   light     a high-key film on a pale or saturated ground. 47-78%. Here the
		//             failure mode is the opposite one, washing out to white. Only
		//             mean luminance is gated; subordinate values are diagnostics.
		//   ui-light  a light-mode product interface, which is brighter than any
		//             cinematic register. 76-96% mean. Added because the light band
		//             failed four independent light-mode product demos purely for
		//             being a white UI: their mean luminance measured 219 to 235.
		//             Four positive films clears the two-film rule.
		lumaMeanMin: PROFILE === 'dark' ? 24 : PROFILE === 'ui-light' ? 195 : PROFILE === 'light' ? 125 : 70,
		lumaMeanMax: PROFILE === 'dark' ? 85 : PROFILE === 'ui-light' ? 245 : PROFILE === 'light' ? 195 : 125,
		lumaBrightLevel: PROFILE === 'ui-light' ? 210 : PROFILE === 'light' ? 140 : 64,

		// ---- motion, in 8-bit-equivalent units of mean absolute inter-frame
		// difference. Raw values are scaled by source fps divided by 60 before gates.
		// Measured on the frames that are NOT in a freeze segment, which is the only
		// way active energy means anything once a film holds deliberately. Overall
		// energy, active energy, and active-frame share are gated together.
		//
		// KNOWN LIMITATION. This gate averages over frames that are NOT in a freeze
		// segment, so a film that adds a proper MOVING HOLD (the animation principle:
		// a held pose keeps a slow secondary motion or it reads as dead) moves frames
		// out of the frozen set and into the active set at low energy, which drags
		// the mean DOWN. On one measured cut the moving hold took the share of moving
		// frames from 34% to 46% and the active mean from 1.14 to 0.98. The film got
		// better and the number got worse.
		//
		// So: read this gate together with the share figure printed beside it. A low
		// mean over a HIGH share is a calm film. A low mean over a LOW share is a dead
		// one. Do not add motion to satisfy this number alone; that is the exact
		// Goodhart failure this file was rewritten to prevent.
		overallEnergyMin: 0.3,
		overallEnergyMax: 3.0,
		activeEnergyMin: 0.45,
		activeEnergyMax: 3.5,
		activeFrameFractionMin: 0.25,
		activeFrameFractionMax: 0.98,
		// Share of total inter-frame change living in the 8 busiest cells of an 8x8
		// grid. Uniform change over the whole frame gives 8/64 = 0.125, the floor.
		// One subject moving against a locked camera gives 0.55 to 0.90.
		concentrationMin: 0.42,
		concentrationMax: 0.9,
		concentrationWorstSecondMin: 0.3,

		// ---- audio
		lufsMin,
		lufsMax,
		truePeakMin: -3.0,
		truePeakMax: -1.0,
		lraMin: 6.0,
		lraMax: 13.0,
	};

	/* ----------------------------------------------------------------- helpers */

	// ffmpeg writes freezedetect and ebur128 reports to STDERR even on success, and
	// execFileSync discards stderr when the exit code is 0. That silently produced
	// "no freezes, NaN loudness" on a film that had plenty of both, so always take
	// both streams.
	const ff = (argv) => {
		const r = spawnSync('ffmpeg', argv, {encoding: 'utf8', maxBuffer: 1 << 28});
		return `${r.stdout ?? ''}${r.stderr ?? ''}`;
	};
	const probeCmd = (argv) => {
		const r = spawnSync('ffprobe', argv, {encoding: 'utf8', maxBuffer: 1 << 28});
		return {ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, stdout: r.stdout ?? ''};
	};

	const results = [];
	const gate = (name, ok, actual, expected, note = '') => results.push({name, status: BASELINE ? 'INFO' : ok ? 'PASS' : 'FAIL', actual, expected, note});
	const warn = (name, ok, actual, expected, note = '') => results.push({name, status: BASELINE ? 'INFO' : ok ? 'PASS' : 'WARN', actual, expected, note});
	const info = (name, actual, note = '') => results.push({name, status: 'INFO', actual, expected: '-', note});
	const measured = {};

	/* -------------------------------------------------------------- 1. format */

	const pr = probeCmd(['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,pix_fmt,sample_aspect_ratio,color_primaries,color_transfer,duration,nb_frames:stream_tags=DURATION', '-show_entries', 'format=duration,bit_rate', '-of', 'json', file]);
	let probe = {};
	try {
		probe = JSON.parse(pr.stdout);
	} catch {
		console.error('ffprobe failed:\n' + pr.out);
		return 2;
	}
	const vs = (probe.streams || [])[0] || {};
	const duration = Number(probe.format?.duration ?? 0);
	const bitrate = Number(probe.format?.bit_rate ?? 0);
	const [rfn, rfd] = String(vs.r_frame_rate || '0/1').split('/').map(Number);
	const fps = rfd ? rfn / rfd : 0;
	const sar = vs.sample_aspect_ratio || '1:1';
	if (!fps || !duration) {
		console.error(`ffprobe found no video stream with a frame rate in ${file}`);
		return 2;
	}
	// The picture's own length: the container's can be longer when the audio outlasts the video.
	// MP4 carries it on the stream, Matroska in a DURATION tag; failing both, frames over rate.
	const tagSeconds = (t) => {
		const m = String(t ?? '').match(/^(\d+):(\d+):([\d.]+)$/);
		return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
	};
	const videoDuration = [Number(vs.duration), tagSeconds(vs.tags?.DURATION), Number(vs.nb_frames) / fps, duration].find((x) => Number.isFinite(x) && x > 0) ?? duration;
	measured.format = {width: vs.width, height: vs.height, fps, duration, videoDuration, bitrate, pixFmt: vs.pix_fmt, colourPrimaries: vs.color_primaries ?? null};

	// A ceiling, and when the film's length is known (its beatmap, or --target-duration) a floor of
	// that length less one frame, checked on the picture itself: a render of a few frames, or a
	// picture cut short under a longer audio track, must not pass as the film.
	const targetKnown = film !== null || flags['target-duration'] !== undefined;
	const floor = targetKnown ? TARGET - 1 / fps : 0;
	const longEnough = videoDuration >= floor - 1e-6;
	const shown = `${duration.toFixed(2)}s${Math.abs(videoDuration - duration) > 0.05 ? ` (picture ${videoDuration.toFixed(2)}s)` : ''}`;
	gate('duration', duration <= T.durationMax && duration > 0 && longEnough, shown, targetKnown ? `${floor.toFixed(2)} to ${T.durationMax.toFixed(1)}s` : `<= ${T.durationMax.toFixed(1)}s`, `brief was ${Number(TARGET.toFixed(2))}s`);
	gate('square pixels', sar === '1:1' || sar === 'N/A', sar, '1:1');
	gate('frame rate', fps >= 23.9 && fps <= 60.1, `${fps.toFixed(2)}`, '23.9 to 60.1');
	warn('bitrate', bitrate === 0 || bitrate >= 6e6, `${(bitrate / 1e6).toFixed(2)} Mbps`, '>= 6 Mbps at 1080p', 'low bitrate bands gradients');
	warn('colour', (vs.color_primaries ?? '') === 'bt709', vs.color_primaries ?? 'unset', 'bt709');

	/* --------------------------------------------------------------- 2. cuts */

	// Scene score is RELATIVE to the frame's overall change, so a grain-heavy or
	// starfield-heavy master raises the baseline and hides real cuts underneath it.
	// The same film measured 28 cuts at half resolution and 19 at full resolution;
	// dropping the threshold to 0.05 recovered 27 of the 28 placed cuts on their
	// exact frames. So the threshold is a parameter, and lowering it for a textured
	// master is reading the instrument correctly rather than lowering the bar.
	const sceneRaw = ff(['-v', 'error', '-i', file, '-vf', `select='gt(scene,${SCENE})',metadata=print:file=-`, '-an', '-f', 'null', '-']);
	const rawCutTimes = [...sceneRaw.matchAll(/pts_time:([0-9.]+)/g)].map((m) => Number(m[1]));

	// A whole-frame flash produces TWO scene detections a frame or two apart, one
	// going in and one coming out. They are one event, not two shots, and left
	// unmerged they report a 0.02-second shot and drag the mean shot length down.
	// Detections closer together than this are collapsed to the first, and the
	// count is reported so the collapse can never hide a real fast-cut passage.
	const CUT_MERGE = flags['cut-merge'] !== undefined ? Number(flags['cut-merge']) : 0.3;
	const cutTimes = rawCutTimes.filter((t, i) => i === 0 || t - rawCutTimes[i - 1] > CUT_MERGE);
	const merged = rawCutTimes.length - cutTimes.length;
	const nCuts = cutTimes.length;
	if (merged) info('cut detections merged', `${merged} within ${CUT_MERGE}s`, 'flashes read as two cuts');
	const cutsPerMinute = duration ? (nCuts / duration) * 60 : 0;
	measured.cuts = {threshold: SCENE, times: cutTimes, frames: cutTimes.map((t) => Math.round(t * fps)), raw: rawCutTimes, merged};

	info('scene-change detections', `${cutsPerMinute.toFixed(1)} candidates/min (${nCuts} merged detections)`, 'diagnostic only; these are not asserted editorial cuts');

	const shots = [];
	if (nCuts > 0) {
		const marks = [0, ...cutTimes, duration];
		for (let i = 1; i < marks.length; i++) shots.push({start: marks[i - 1], len: marks[i] - marks[i - 1]});

		// The final shot is excluded from the max-length rule. An end card is meant
		// to be held, and a video element with no `loop` leaves that frame up for the
		// rest of the meeting regardless.
		const body = shots.slice(0, -1);
		const tail = shots[shots.length - 1];
		const longest = body.reduce((a, s) => (s.len > a.len ? s : a), body[0] ?? tail);
		const shortest = body.reduce((a, s) => (s.len < a.len ? s : a), body[0] ?? tail);

		info('longest detector interval', `${longest.len.toFixed(2)}s at t=${longest.start.toFixed(1)}s`, `final detector interval ${tail.len.toFixed(2)}s, excluded`);
		info('shortest detector interval', `${shortest.len.toFixed(2)}s at t=${shortest.start.toFixed(1)}s`, 'scene detection can mistake a landing or flash for a cut');

		// This is a detector observation. It cannot see text, state replacement, or
		// whether a transition is an editorial cut.
		const reading = shots.filter((s) => s.len >= T.readingShotSeconds).length / shots.length;
		info('reading-length detector intervals', `${(reading * 100).toFixed(0)}% run >= ${T.readingShotSeconds}s`, 'diagnostic only; use an authored cut and text manifest for a reading gate');

		const asl = shots.reduce((a, s) => a + s.len, 0) / shots.length;
		info('mean detector interval', `${asl.toFixed(2)}s over ${shots.length} shots`, 'diagnostic only; detections are not verified shot boundaries');
		info('detector tail interval', `${tail.len.toFixed(2)}s`, 'diagnostic only');
	}

	/* ------------------------------------------------------------- 3. freezes */

	const freezeRaw = ff(['-v', 'info', '-i', file, '-vf', 'freezedetect=n=-40dB:d=1', '-map', '0:v', '-f', 'null', '-']);
	const freezeStarts = [...freezeRaw.matchAll(/freeze_start:\s*([0-9.]+)/g)].map((m) => Number(m[1]));
	const freezeDurations = [...freezeRaw.matchAll(/freeze_duration:\s*([0-9.]+)/g)].map((m) => Number(m[1]));
	// A freeze that runs to the end of the file is reported with freeze_start but
	// never freeze_end or freeze_duration (observed with ffmpeg 8.1: the same file
	// with a second of black appended reports the duration). Dropping it scored a
	// film that ends on a held card as 100% active, so close it at the end here.
	const openAtEnd = freezeStarts.length > freezeDurations.length ? freezeStarts[freezeStarts.length - 1] : null;
	if (openAtEnd !== null) freezeDurations.push(Math.max(0, videoDuration - openAtEnd));
	const longestFreeze = freezeDurations.length ? Math.max(...freezeDurations) : 0;
	const stillness = duration ? freezeDurations.reduce((a, b) => a + b, 0) / duration : 0;

	// The intervals, so motion energy can be measured on the frames that move.
	const stillSpans = freezeStarts.map((s, i) => [s, s + (freezeDurations[i] ?? 0)]);
	measured.freezes = {spans: stillSpans, fraction: stillness, longest: longestFreeze, openAtEnd};

	// freezedetect is reported for reference only. It is NOT gated, because it was
	// caught measuring something other than what it claims.
	//
	// THE EVIDENCE: it reported one continuous 3.70-second freeze from 2.50s to
	// 6.20s on a passage containing four separate events, including a hard cut.
	// Frame 299 of that span measures an inter-frame energy of 5.03, twice its own
	// 2.55 threshold, in the encoded file it was given. It spans the spike anyway.
	// So it does not reset on a single large-change frame, and "longest freeze"
	// does not mean "nothing happened for that long".
	//
	// The gates below are computed from the per-frame energy array further down,
	// where the threshold is explicit, the arithmetic is visible and the result can
	// be checked by hand. Same three films, same order, and it discriminates:
	//
	//     cut 1, dead        4.15s longest settled run, 73.5% settled
	//     cut 2, frantic     0.00s,                      0.0% settled
	//     cut 3, composed    2.17s,                     65.4% settled
	//
	// 2.17s is one reading hold, which is the correct answer.
	info('freezedetect (reference)', `${(stillness * 100).toFixed(1)}% of runtime, longest ${longestFreeze.toFixed(2)}s`, 'not gated: spans a 5.03-energy spike, see the note above');

	/* ----------------------------------------------------------- 4. luminance */

	const lumaRaw = ff(['-v', 'error', '-i', file, '-vf', 'fps=4,format=yuv420p,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-an', '-f', 'null', '-']);
	const luma = [...lumaRaw.matchAll(/YAVG=([0-9.]+)/g)].map((m) => Number(m[1]));
	if (luma.length) {
		const mean = luma.reduce((a, b) => a + b, 0) / luma.length;
		const peak = Math.max(...luma);
		const floor = Math.min(...luma);
		const bright = luma.filter((v) => v >= T.lumaBrightLevel).length / luma.length;
		const sd = Math.sqrt(luma.reduce((a, v) => a + (v - mean) ** 2, 0) / luma.length);
		const pct = (v) => `${((v / 255) * 100).toFixed(1)}%`;
		measured.luma = {mean, peak, floor, sd, brightShare: bright, samples: luma.length};

		gate('mean luminance', mean >= T.lumaMeanMin && mean <= T.lumaMeanMax, `${mean.toFixed(1)} (${pct(mean)})`, `${T.lumaMeanMin} to ${T.lumaMeanMax} (${pct(T.lumaMeanMin)} to ${pct(T.lumaMeanMax)})`, 'dark is fine, murky is not, and washed out is not either');
		info('peak luminance', `${peak.toFixed(1)} (${pct(peak)})`, 'diagnostic only');
		info('bright frame share', `${(bright * 100).toFixed(1)}% above ${pct(T.lumaBrightLevel)}`, 'diagnostic only');
		info('darkest frame', `${floor.toFixed(1)} (${pct(floor)})`, 'diagnostic only');
		info('luminance spread', `sd ${sd.toFixed(1)}`, 'diagnostic only');
		info('luminance range', (peak - floor).toFixed(1), 'diagnostic only');
	} else {
		gate('mean luminance', false, 'not measured', 'signalstats output', 'ffmpeg returned no YAVG values');
	}

	/* ------------------------------------------ 5. motion energy + CONCENTRATION
	 *
	 * One pass gives both. The frame difference is taken at 16-bit precision and
	 * area-averaged down to an 8x8 grid, so each cell is the mean absolute
	 * inter-frame difference over its block. 8-bit would quantise a typical cell
	 * value of 3 to the nearest integer and destroy the ratio.
	 *
	 *   energy        = mean of the 64 cells, in 8-bit-equivalent units
	 *   concentration = (sum of the 8 largest cells) / (sum of all 64)
	 *
	 * Uniform change across the whole frame, which is what ANY camera move
	 * produces, gives 8/64 = 0.125. That is the floor and it is the signature of
	 * the failure this metric exists to catch. One subject moving against a locked
	 * camera concentrates its change into a few cells and scores 0.55 to 0.90.
	 */
	const GRID = 8;
	const TOPN = 8;
	const grab = (vf) => {
		const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', vf, '-an', '-f', 'rawvideo', '-pix_fmt', 'gray16le', '-'], {maxBuffer: 1 << 29, encoding: 'buffer'});
		return r.stdout ?? Buffer.alloc(0);
	};

	// TWO PASSES, because the two questions need different signals. Both of these
	// were got wrong once and the corrections are the most useful thing in the file.
	//
	// ENERGY: difference at full resolution, then average. Film grain contributes a
	// positive term, which is correct here: grain is genuinely inter-frame change
	// and it is what keeps a held frame from being a frozen one.
	//
	// CONCENTRATION: downscale to 240x135 FIRST, which averages each 8x8 pixel
	// neighbourhood and cancels grain, THEN difference, THEN aggregate to 8x8.
	// Without the pre-blur the metric measures grain rather than composition: the
	// same film scored 0.556 at half resolution, where the downscale had already
	// averaged the grain away, and 0.366 at full resolution where it had not. Same
	// edit, same shots, same staging. That is the instrument moving, not the film.
	//
	// Differencing must stay FIRST. Averaging first and differencing after was
	// tried and it destroys the discrimination completely: the frantic cut and the
	// composed cut both scored 0.47.
	const rawEnergy = grab(`format=gray16le,tblend=all_mode=difference,scale=${GRID}:${GRID}:flags=area`);
	const rawConc = grab(`format=gray16le,scale=240:135:flags=area,tblend=all_mode=difference,scale=${GRID}:${GRID}:flags=area`);

	const raw = rawEnergy;
	const cells = GRID * GRID;
	const nFrames = Math.floor(raw.length / (cells * 2));
	const energy = [];
	const concentration = [];

	// tblend emits the first frame unchanged, so frame 0 is the picture itself and
	// not a difference. Skip it or it reads as an enormous false transient.
	for (let i = 1; i < nFrames; i++) {
		const off = i * cells * 2;
		let sum = 0;
		for (let c = 0; c < cells; c++) sum += raw.readUInt16LE(off + c * 2) / 257;
		energy.push(sum / cells);

		// concentration off its own, grain-cancelled pass
		const v = new Array(cells);
		let csum = 0;
		for (let c = 0; c < cells; c++) {
			const x = off + c * 2 + 1 <= rawConc.length ? rawConc.readUInt16LE(off + c * 2) / 257 : 0;
			v[c] = x;
			csum += x;
		}
		if (csum > 0.02) {
			v.sort((a, b) => b - a);
			let top = 0;
			for (let k = 0; k < TOPN; k++) top += v[k];
			concentration.push(top / csum);
		} else {
			concentration.push(NaN); // nothing moved; there is no direction to measure
		}
	}

	if (energy.length) {
		const meanE = energy.reduce((a, b) => a + b, 0) / energy.length;

		// Energy on the frames the film is actually moving. Once a film holds on
		// purpose, the overall mean mostly measures how much of it is held, which is
		// already gated above as stillness. What matters here is whether the moving
		// parts move with conviction.
		const inStill = (frameIdx) => {
			const t = frameIdx / fps;
			for (const [a, b] of stillSpans) if (t >= a && t <= b) return true;
			return false;
		};
		const active = energy.filter((_, i) => !inStill(i + 1));
		const meanA = active.length ? active.reduce((a, b) => a + b, 0) / active.length : meanE;
		const energyScaleTo60Fps = fps / 60;
		const meanE60 = meanE * energyScaleTo60Fps;
		const meanA60 = meanA * energyScaleTo60Fps;

		// STILLNESS, computed here where the threshold is explicit and checkable.
		let run = 0;
		let best = 0;
		let bestAt = 0;
		let settledCount = 0;
		for (let i = 0; i < energy.length; i++) {
			if (energy[i] < T.settledLevel) {
				run++;
				settledCount++;
				if (run > best) {
					best = run;
					bestAt = i - run + 1;
				}
			} else run = 0;
		}
		const settledFrac = settledCount / energy.length;
		const activeFraction = active.length / energy.length;
		measured.motion = {energyRaw: meanE, energy60: meanE60, activeEnergyRaw: meanA, activeEnergy60: meanA60, activeFraction, settledFraction: settledFrac, longestSettledRun: best / fps, longestSettledAt: bestAt / fps, frames: energy.length};

		gate('longest settled run', best / fps >= T.settledRunMinSeconds && best / fps <= T.settledRunMaxSeconds, `${(best / fps).toFixed(2)}s at t=${(bestAt / fps).toFixed(1)}s`, `${T.settledRunMinSeconds} to ${T.settledRunMaxSeconds}s`, 'both ends are bounded by independent positive films');
		gate('settled fraction', settledFrac >= T.settledMin && settledFrac <= T.settledMax, `${(settledFrac * 100).toFixed(1)}%`, `${(T.settledMin * 100).toFixed(0)} to ${(T.settledMax * 100).toFixed(0)}%`, 'too little is relentless and too much is static');

		info('motion energy (raw)', meanE.toFixed(2), `measured at ${fps.toFixed(2)}fps`);
		gate('motion energy (60fps equivalent)', meanE60 >= T.overallEnergyMin && meanE60 <= T.overallEnergyMax, meanE60.toFixed(2), `${T.overallEnergyMin} to ${T.overallEnergyMax}`, 'too little is dead and too much is frantic');
		info('active motion energy (raw)', meanA.toFixed(2), `measured at ${fps.toFixed(2)}fps`);
		gate('active motion energy (60fps equivalent)', meanA60 >= T.activeEnergyMin && meanA60 <= T.activeEnergyMax, meanA60.toFixed(2), `${T.activeEnergyMin} to ${T.activeEnergyMax}`, 'measured only where the film moves; a ceiling as well as a floor');
		gate('active frame fraction', activeFraction >= T.activeFrameFractionMin && activeFraction <= T.activeFrameFractionMax, `${(activeFraction * 100).toFixed(0)}%`, `${(T.activeFrameFractionMin * 100).toFixed(0)} to ${(T.activeFrameFractionMax * 100).toFixed(0)}%`, 'active energy alone cannot separate a dead film from a calm one');

		// Concentration is measured only where the film is moving, and never on a
		// scene-change detection.
		//
		// On a HELD frame there is no content motion at all, so "where is the motion"
		// has no answer: the measurement returns the spatial distribution of grain,
		// which is uniform, which reads as a failure. Per-shot analysis made this
		// unmistakable. Every locked-camera hold scored 0.25 to 0.34 and every
		// CAMERA-MOVING dive scored 0.39 to 0.49, exactly backwards from what the
		// metric is supposed to say, and concentration tracked energy almost perfectly.
		//
		// Measured on moving frames only, it separates cleanly and in the right
		// direction:  frantic cut 0.301, composed cut 0.518, on identical crops.
		//
		// A scene-change candidate changes much of the frame, so those frames are
		// dropped from concentration. This does not assert that the candidate is a cut.
		const cutFrames = new Set();
		for (const t of cutTimes) {
			const cf = Math.round(t * fps);
			for (let d = -2; d <= 2; d++) cutFrames.add(cf + d);
		}
		const MOVING = 0.6; // 8-bit-equivalent energy: the floor for "something happened"
		const conc = [];
		const concAt = []; // frame index, so the worst-window report can name a time
		for (let i = 0; i < concentration.length; i++) {
			if (!Number.isNaN(concentration[i]) && !cutFrames.has(i + 1) && energy[i] >= MOVING) {
				conc.push(concentration[i]);
				concAt.push(i + 1);
			}
		}

		if (conc.length) {
			const meanC = conc.reduce((a, b) => a + b, 0) / conc.length;
			measured.motion.concentration = meanC;
			measured.motion.concentrationFrames = conc.length;
			gate('motion concentration', meanC >= T.concentrationMin && meanC <= T.concentrationMax, meanC.toFixed(3), `${T.concentrationMin} to ${T.concentrationMax}`, 'share of frame change in the 8 busiest cells of 64; a moving camera floors this at 0.125');

			// Worst run of 30 moving frames. This is deliberately unchanged from the
			// calibrated evidence, so its wall-clock length varies with frame rate.
			// A healthy mean hides a stretch where the camera roams over animating
			// content, which is precisely the failure mode. Indexed over the MOVING
			// frames, not wall-clock, because the held frames in between carry no
			// measurement.
			const win = 30;
			let worst = Infinity;
			let worstAt = 0;
			for (let i = 0; i + win <= conc.length; i += 5) {
				let s = 0;
				for (let k = 0; k < win; k++) s += conc[i + k];
				const m = s / win;
				if (m < worst) {
					worst = m;
					worstAt = concAt[i] / fps;
				}
			}
			if (Number.isFinite(worst)) {
				// A WARNING, not a gate, and the reason is a real limitation.
				// This cannot tell a legal camera move from an illegal one. A dive with
				// static content and a roaming camera over animating content both change
				// every pixel, so both score at the floor. The composed cut's worst run
				// lands at 19.0s, which is a deliberate 1.5-second push with nothing else
				// moving: correct film-making, flagged. The MEAN carries the real
				// discrimination (0.291 frantic against 0.538 composed) because a film
				// that only moves the camera for six seconds in sixty averages out and a
				// film that never stops does not.
				measured.motion.concentrationWorst = worst;
				warn('worst run (concentration)', worst >= T.concentrationWorstSecondMin, `${worst.toFixed(3)} at t=${worstAt.toFixed(1)}s`, `>= ${T.concentrationWorstSecondMin}`, 'cannot distinguish a legal camera move; the mean is the gate');
			}
		} else {
			info('motion concentration', 'no moving frames', 'nothing moved above 0.6, so there is no direction to measure');
		}
	} else {
		gate('motion energy (60fps equivalent)', false, 'not measured', 'frame differences', 'ffmpeg returned no frames');
	}

	/* --------------------------------------------------------------- 6. audio */

	const hasAudio = probeCmd(['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', file]).stdout.trim();
	if (!hasAudio) {
		measured.audio = null;
		gate('audio present', false, 'none', 'an audible mixed score');
	} else {
		const ebu = ff(['-nostats', '-v', 'info', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
		const {integratedLoudness: I, loudnessRange: LRA, truePeak: TP} = parseEbur128Summary(ebu);
		measured.audio = {integratedLufs: I, lraLu: LRA, truePeakDbtp: TP};

		// A muxer that emits a silent track is not the same as a bad mix. Remotion
		// writes a silent AAC stream when a composition has no Audio component, so
		// the stream EXISTS and ebur128 dutifully reports -70 LUFS, NaN peak and 0 LU.
		// Reporting that as three separate mix failures buries the one thing worth
		// saying, which is that the film has no score yet.
		if (!Number.isFinite(I) || I <= -60) {
			gate('audio', false, 'silent track', 'an audible mixed score', 'the stream exists but carries no signal; not a mix failure');
		} else {
			gate('integrated loudness', I >= T.lufsMin && I <= T.lufsMax, `${I} LUFS`, `${T.lufsMin} to ${T.lufsMax} LUFS`);
			gate('true peak', TP >= T.truePeakMin && TP <= T.truePeakMax, `${TP} dBTP`, `${T.truePeakMin} to ${T.truePeakMax} dBTP`);
			gate('loudness range', LRA >= T.lraMin && LRA <= T.lraMax, `${LRA} LU`, `${T.lraMin} to ${T.lraMax} LU`, 'the first failure measured 2.8 LU, a flat loop with no arc');
		}
	}

	/* --------------------------------------------------------------- report */

	const pad = (s, n) => String(s).padEnd(n);
	const fails = results.filter((r) => r.status === 'FAIL');
	const warns = results.filter((r) => r.status === 'WARN');
	const passes = results.filter((r) => r.status === 'PASS');

	console.log(`\nFILM AUDIT v4  ${path.basename(file)}   profile=${PROFILE}  brief=${Number(TARGET.toFixed(2))}s  scene=${SCENE}${BASELINE ? '  [BASELINE, not gating]' : ''}\n`);
	console.log(pad('', 6) + pad('GATE', 40) + pad('MEASURED', 32) + 'REQUIRED');
	console.log('-'.repeat(116));
	for (const r of results) {
		const mark = r.status === 'PASS' ? ' ok ' : r.status === 'WARN' ? ' !! ' : r.status === 'INFO' ? ' -- ' : 'FAIL';
		console.log(pad(mark, 6) + pad(r.name, 40) + pad(r.actual, 32) + r.expected + (r.note ? `   (${r.note})` : ''));
	}
	console.log('-'.repeat(116));
	console.log(`${passes.length} passed, ${warns.length} warnings, ${fails.length} failed\n`);

	if (JSON_OUT) {
		mkdirSync(path.dirname(path.resolve(JSON_OUT)), {recursive: true});
		const verdict = BASELINE ? 'BASELINE' : fails.length ? 'FAIL' : 'PASS';
		writeFileSync(JSON_OUT, JSON.stringify({version: 4, file: shownPath(file), film, profile: PROFILE, target: TARGET, scene: SCENE, duration, fps, verdict, counts: {pass: passes.length, warn: warns.length, fail: fails.length}, results, measured}, null, 2));
		console.log(`json written to ${JSON_OUT}`);
	}

	return fails.length && !BASELINE ? 1 : 0;
});
