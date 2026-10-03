import {useEffect, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {BIRDS} from './beatmap';
import meta from './data/phrases.json';
import {FMAX_PANEL, LANE_H, LANE_SPAN, ROWS, CELL} from './world';

// The card's halftone is computed from public/films/hark/spectra.bin, which score.mjs writes from
// the exact audio. Here it is reduced once to cells: for every video frame, every bird, every row
// of the card (250 Hz each), the loudest value (0 to 1). Pure data, so every render is identical.

export type Phrase = {bird: string; role: string; t0: number; t1: number; contour: [number, number, number][]};
export const PHRASES = meta.phrases as Phrase[];
export const SPEC = meta as unknown as {sr: number; hop: number; fft: number; bins: number; cols: number; birds: string[]};

const COLS_PER_FRAME = 4; // hop 500 at 48 kHz, 24 fps
const LANE_ROWS = Math.floor(LANE_H / CELL); // 7

export type Cells = {
	frames: number;
	// shared[(bi * frames + f) * ROWS + r], r = 0 is the lowest row
	shared: Float32Array;
	// lane[(bi * frames + f) * LANE_ROWS + j], j = 0 is the lowest row of that bird's lane
	lane: Float32Array;
};

const reduce = (bin: Uint8Array): Cells => {
	const {bins, cols, sr, fft} = SPEC;
	const hzPerBin = sr / fft;
	const frames = Math.floor(cols / COLS_PER_FRAME);
	const nb = BIRDS.length;
	const shared = new Float32Array(nb * frames * ROWS);
	const lane = new Float32Array(nb * frames * LANE_ROWS);
	const maxOver = (bi: number, f: number, k0: number, k1: number) => {
		let m = 0;
		for (let c = f * COLS_PER_FRAME; c < (f + 1) * COLS_PER_FRAME; c++) {
			const base = (bi * cols + c) * bins;
			for (let k = Math.max(1, k0); k <= Math.min(bins - 1, k1); k++) m = Math.max(m, bin[base + k]);
		}
		return m / 255;
	};
	for (let bi = 0; bi < nb; bi++) {
		const id = SPEC.birds[bi];
		const [lo, hi] = LANE_SPAN[id];
		for (let f = 0; f < frames; f++) {
			for (let r = 0; r < ROWS; r++) {
				const f0 = (r * FMAX_PANEL) / ROWS;
				const f1 = ((r + 1) * FMAX_PANEL) / ROWS;
				shared[(bi * frames + f) * ROWS + r] = maxOver(bi, f, Math.floor(f0 / hzPerBin), Math.ceil(f1 / hzPerBin) - 1);
			}
			for (let j = 0; j < LANE_ROWS; j++) {
				const f0 = lo * Math.pow(hi / lo, j / LANE_ROWS);
				const f1 = lo * Math.pow(hi / lo, (j + 1) / LANE_ROWS);
				lane[(bi * frames + f) * LANE_ROWS + j] = maxOver(bi, f, Math.floor(f0 / hzPerBin), Math.ceil(f1 / hzPerBin) - 1);
			}
		}
	}
	return {frames, shared, lane};
};

let cache: Cells | null = null;
let pending: Promise<Cells> | null = null;

export const useCells = (): Cells | null => {
	const [cells, setCells] = useState<Cells | null>(cache);
	const [handle] = useState(() => (cache ? null : delayRender('Loading the spectrogram')));
	useEffect(() => {
		if (cache) return;
		pending ??= fetch(staticFile('films/hark/spectra.bin'))
			.then((r) => {
				if (!r.ok) throw new Error(`spectra.bin: HTTP ${r.status}. Run: node src/films/hark/score.mjs`);
				return r.arrayBuffer();
			})
			.then((b) => {
				cache = reduce(new Uint8Array(b));
				return cache;
			});
		pending
			.then((c) => {
				setCells(c);
				if (handle !== null) continueRender(handle);
			})
			.catch((e) => cancelRender(e));
	}, [handle]);
	return cells;
};

export {LANE_ROWS};
