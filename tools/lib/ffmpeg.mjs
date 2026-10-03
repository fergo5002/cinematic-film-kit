// ffmpeg and ffprobe helpers shared by the tools, and the parsers the doctor uses to read
// ffmpeg's own capability lists. Pure functions where possible, so tests can feed them canned
// output instead of a real binary.
import {existsSync} from 'node:fs';
import path from 'node:path';
import {parseEbur128Summary} from '../film-audit-audio.mjs';
import {ROOT, capture} from './kit.mjs';

export {parseEbur128Summary};

// The loudness of a file, from ebur128's final Summary block only. The per-frame rows above it
// are running values (one tool once reported a row's -48.0 LUFS for a file whose Summary said
// -39.0), so no Summary is an error, never a null or a guess.
export const requireSummary = (text, label = 'the file') => {
	const s = parseEbur128Summary(text);
	if (!String(text).includes('Summary:') || !Number.isFinite(s.integratedLoudness)) {
		throw new Error(`no ebur128 Summary for ${label}: ffmpeg did not finish measuring it, so there is no loudness to report`);
	}
	return s;
};

// The OFL label face for drawtext, as a path RELATIVE to the kit root. Every ffmpeg call here runs
// with cwd set to the kit root, so the filter string never contains a drive letter or a space,
// which are the two things drawtext's option escaping gets wrong most often.
export const LABEL_FONT = 'tools/fonts/CommissionerLabel.ttf';
export const labelFontExists = () => existsSync(path.join(ROOT, LABEL_FONT));

// Run ffmpeg (or ffprobe) and return both streams joined: measurement filters log to stderr.
export const ff = (args, opts = {}) => capture('ffmpeg', ['-hide_banner', '-nostats', ...args], opts);
export const ffprobe = (args, opts = {}) => capture('ffprobe', ['-v', 'error', ...args], opts);

export const firstLineVersion = (text) => {
	const m = String(text).match(/version\s+(\S+)/i);
	return m ? m[1] : null;
};

const rate = (r) => {
	const [n, d] = String(r || '0/1').split('/').map(Number);
	return d ? n / d : 0;
};

// What a delivery check needs to know about a media file, from one ffprobe call.
export const probeMedia = (file) => {
	const r = ffprobe(['-show_entries', 'format=duration,bit_rate,size:format_tags:stream=index,codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,sample_rate,channels,channel_layout,color_space,color_transfer,color_primaries,color_range,sample_aspect_ratio,duration,bit_rate', '-of', 'json', file]);
	if (r.status !== 0) throw new Error(`ffprobe could not read ${file}: ${r.stderr.trim().split('\n').slice(-2).join(' ')}`);
	const j = JSON.parse(r.stdout);
	const v = (j.streams ?? []).find((s) => s.codec_type === 'video');
	const a = (j.streams ?? []).find((s) => s.codec_type === 'audio');
	return {
		duration: Number(j.format?.duration ?? 0),
		bitrate: Number(j.format?.bit_rate ?? 0),
		size: Number(j.format?.size ?? 0),
		video: v
			? {
					codec: v.codec_name,
					profile: v.profile,
					width: v.width,
					height: v.height,
					pixFmt: v.pix_fmt,
					fps: rate(v.r_frame_rate),
					avgFps: rate(v.avg_frame_rate),
					frames: v.nb_frames ? Number(v.nb_frames) : null,
					sar: v.sample_aspect_ratio ?? null,
					colorSpace: v.color_space ?? null,
					colorTransfer: v.color_transfer ?? null,
					colorPrimaries: v.color_primaries ?? null,
					colorRange: v.color_range ?? null,
				}
			: null,
		audio: a ? {codec: a.codec_name, sampleRate: Number(a.sample_rate), channels: a.channels, layout: a.channel_layout ?? null} : null,
	};
};

// ---------- capability parsers (the doctor) ----------

// `ffmpeg -filters`: " TS aap   AA->A   description". Older builds print three flag columns
// (" TSC ..."), newer ones two, so accept both. Header lines ("  T.. = Timeline support") fail
// the I/O column test and drop out.
export const parseFilterList = (text) => {
	const names = new Set();
	for (const line of String(text).split(/\r?\n/)) {
		const m = line.match(/^\s*[A-Z.|]{2,3}\s+(\S+)\s+(\S*->\S*)\s/);
		if (m) names.add(m[1]);
	}
	return names;
};

// `ffmpeg -bsfs`: one name per line after the "Bitstream filters:" heading.
export const parseBsfList = (text) => {
	const names = new Set();
	let on = false;
	for (const line of String(text).split(/\r?\n/)) {
		if (/^Bitstream filters:/i.test(line.trim())) {
			on = true;
			continue;
		}
		if (on && /^[a-z0-9_]+$/i.test(line.trim())) names.add(line.trim());
	}
	return names;
};

// `ffmpeg -encoders`: " V....D libx264   description". The legend lines (" V..... = Video")
// have "=" where the name goes.
export const parseEncoderList = (text) => {
	const names = new Map();
	for (const line of String(text).split(/\r?\n/)) {
		const m = line.match(/^\s*([VAS])[F.][S.][X.][B.][D.]\s+(\S+)\s/);
		if (m && m[2] !== '=') names.set(m[2], m[1] === 'V' ? 'video' : m[1] === 'A' ? 'audio' : 'subtitle');
	}
	return names;
};

// `ffmpeg -devices`: " D  lavfi           Libavfilter virtual input device". The legend lines
// (" D. = Demuxing supported") carry a dot and drop out.
export const parseDeviceList = (text) => {
	const names = new Set();
	for (const line of String(text).split(/\r?\n/)) {
		const m = line.match(/^ ([D ])([E ]) (\S+)\s+\S/);
		if (m && (m[1] === 'D' || m[2] === 'E')) for (const n of m[3].split(',')) names.add(n);
	}
	return names;
};

// Every filter, bitstream filter and encoder a tool in this kit calls. Keep in step with the
// tools: the doctor fails on anything missing here, so a tool never dies half way through.
export const REQUIRED = {
	filters: [
		'ebur128', // film-audit, master, shotwatch, doctor
		'loudnorm', // master
		'alimiter', // master
		'aresample', // master
		'volume', // master
		'volumedetect', // shotwatch
		'freezedetect', // film-audit
		'signalstats', // film-audit, shotwatch
		'tblend', // film-audit, shotwatch
		'select', // film-audit, sheet, packet
		'metadata', // film-audit, shotwatch
		'scdet', // shotwatch
		'showwavespic', // packet, shotwatch
		'drawtext', // sheet, packet, shotwatch labels
		'tile', // sheet, packet, shotwatch
		'scale', // everything that samples frames
		'fps', // film-audit, shotwatch
		'format', // film-audit
	],
	bsfs: ['h264_metadata'], // master re-tags BT.709 losslessly
	encoders: ['aac'], // master
	optionalEncoders: ['libx264'], // tests encode synthetic films with it (mpeg4 is the fallback)
};

export const checkCapabilities = ({filters, bsfs, encoders}) => ({
	missingFilters: REQUIRED.filters.filter((f) => !filters.has(f)),
	missingBsfs: REQUIRED.bsfs.filter((f) => !bsfs.has(f)),
	missingEncoders: REQUIRED.encoders.filter((f) => !encoders.has(f)),
	missingOptional: REQUIRED.optionalEncoders.filter((f) => !encoders.has(f)),
});

// ---------- drawtext ----------

// drawtext's text= goes through three rounds of unescaping (filtergraph, option string, text
// expansion). Rather than escape for all three, labels keep to characters none of them treat
// specially; anything else becomes a space.
export const safeLabel = (s) => String(s).replace(/[^A-Za-z0-9 .#()/+-]/g, ' ');

// A timestamp label: "00:00:01.250  f37". The frame number comes from the frame's own time, so
// it stays correct after select= has dropped frames.
export const timeLabel = (fps) => `%{pts\\:hms}  f%{eif\\:floor(t*${fps}+0.5)\\:d}`;

export const drawLabel = (text, {size = 22, x = 10, y = 10} = {}) =>
	`drawtext=fontfile=${LABEL_FONT}:text='${text}':x=${x}:y=${y}:fontsize=${size}:fontcolor=white:box=1:boxcolor=black@0.72:boxborderw=6`;

// Pick an encoder for synthetic test films: libx264 when present, otherwise mpeg4.
export const testVideoEncoder = (encoders) => (encoders.has('libx264') ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18'] : ['-c:v', 'mpeg4', '-q:v', '3']);
