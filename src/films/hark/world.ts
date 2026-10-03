import {Easing} from 'remotion';
import {BIRDS, M, bar, beat} from './beatmap';

// World geometry, in world pixels on a 1920 x 1080 page, and the camera as a pure function of
// the frame. The sky extends above the page (negative y) for the tilt up at the end.

export const W = 1920;
export const H = 1080;
export const GROUND_Y = 1010;

// ---------- the Hark card ----------
export const CARD = {x: 120, y: 372, w: 940, pad: 40, radius: 28};
export const HEADER_Y = 40; // local to the card
export const SUB_Y = 104;
export const PANEL_Y = 150;
export const PANEL_H = 290; // listening: 0 to 9 kHz
export const LANES_H = 378; // untangled: six lanes
export const CHIPS_GAP = 26;
export const CHIP_H = 64;
export const CHIP_ROW_GAP = 12;
export const CELL = 8; // one halftone cell: 8 x 8 world px
export const PANEL_W = CARD.w - CARD.pad * 2; // 860
export const COLS = Math.floor(PANEL_W / CELL); // 107 columns: one per video frame
export const ROWS = Math.floor(PANEL_H / CELL); // 36 rows of 250 Hz
export const FMAX_PANEL = 9000;

export const cardHeight = (panelH: number, chips: number) =>
	PANEL_Y + panelH + (chips > 0 ? CHIPS_GAP + 2 * CHIP_H + CHIP_ROW_GAP : 0) * chips + CARD.pad;

// Lanes, top to bottom by pitch, and the frequency span each lane shows (log scale within a lane).
export const LANE_ORDER = ['wren', 'robin', 'chaffinch', 'greatTit', 'blackbird', 'woodpigeon'];
export const LANE_SPAN: Record<string, [number, number]> = {
	wren: [3200, 8200],
	robin: [2600, 8400],
	chaffinch: [2300, 7200],
	greatTit: [2700, 6200],
	blackbird: [1300, 8000],
	woodpigeon: [300, 1700],
};
export const LANE_H = 58;
export const LANE_GAP = (LANES_H - LANE_ORDER.length * LANE_H) / (LANE_ORDER.length - 1);

// ---------- where each bird perches (world px), and which way it faces ----------
export const PERCH: Record<string, {x: number; y: number; face: 1 | -1; size: number}> = {
	robin: {x: 1262, y: 640, face: -1, size: 1.25},
	wren: {x: 1564, y: 874, face: -1, size: 1.0},
	blackbird: {x: 1508, y: 212, face: -1, size: 1.4},
	greatTit: {x: 1098, y: 330, face: 1, size: 1.2},
	chaffinch: {x: 1660, y: 452, face: -1, size: 1.2},
	woodpigeon: {x: 560, y: 334, face: 1, size: 1.6},
};

// ---------- the camera ----------
export type Cam = {cx: number; cy: number; s: number};
type Key = {f: number; cam: Cam; ease?: (t: number) => number};

const GLIDE = Easing.bezier(0.65, 0, 0.35, 1);
const CLOSE: Cam = {cx: 453, cy: 660, s: 1.32}; // the card on the right with margins all round; the line sits left
const WIDE: Cam = {cx: 830, cy: 590, s: 1.12}; // a medium shot: the card and every branch a bird lands on
const ON_CARD: Cam = {cx: 530, cy: 640, s: 1.18}; // room on the left for the diary's line
const DRIFT: Cam = {cx: 538, cy: 634, s: 1.23};
const SKY: Cam = {cx: 960, cy: -400, s: 1.0};

export const CAM_KEYS: Key[] = [
	{f: 0, cam: CLOSE},
	{f: M.pullBack, cam: CLOSE},
	{f: bar(2), cam: WIDE},
	{f: M.knot - beat(0.5), cam: WIDE},
	{f: M.knot + beat(1.5), cam: ON_CARD},
	{f: M.today, cam: ON_CARD},
	{f: bar(8) - beat(1.25), cam: DRIFT, ease: (t) => t},
	{f: bar(8) + beat(2.25), cam: SKY},
];

// ---------- the mark, and the robin's flight up to it ----------
export const MARK = {robinX: 742, robinY: -380, robinScale: 3.1, wordX: 872, baseY: -380, xHeight: 92};
const ROBIN_EASE = Easing.bezier(0.45, 0, 0.25, 1);
export const robinFlight = (frame: number) => {
	const p = PERCH.robin;
	const from = [p.x, p.y];
	const ctrl = [p.x - 320, p.y - 520];
	const to = [MARK.robinX, MARK.robinY];
	const u = Math.max(0, Math.min(1, (frame - M.robinTakeOff) / (M.robinLands - M.robinTakeOff)));
	const e = ROBIN_EASE(u);
	const b = (i: number) => (1 - e) * (1 - e) * from[i] + 2 * (1 - e) * e * ctrl[i] + e * e * to[i];
	return {u, x: b(0), y: b(1), from, ctrl, to};
};

const smoothRamp = (a: number, b: number, x: number) => {
	const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

const keyed = (frame: number): Cam => {
	if (frame <= CAM_KEYS[0].f) return CAM_KEYS[0].cam;
	for (let k = 1; k < CAM_KEYS.length; k++) {
		const a = CAM_KEYS[k - 1];
		const b = CAM_KEYS[k];
		if (frame <= b.f) {
			const t = (b.ease ?? GLIDE)((frame - a.f) / Math.max(1, b.f - a.f));
			// scale interpolates in log space so a zoom feels even
			const s = Math.exp(Math.log(a.cam.s) + (Math.log(b.cam.s) - Math.log(a.cam.s)) * t);
			return {cx: a.cam.cx + (b.cam.cx - a.cam.cx) * t, cy: a.cam.cy + (b.cam.cy - a.cam.cy) * t, s};
		}
	}
	return CAM_KEYS[CAM_KEYS.length - 1].cam;
};

// The camera follows the robin up: while it flies, the keyed tilt is pulled towards keeping the
// bird a little above the centre of frame, then lets go as it lands.
export const camera = (frame: number): Cam => {
	const base = keyed(frame);
	const w = smoothRamp(M.robinTakeOff - 6, M.robinTakeOff + 6, frame) * (1 - smoothRamp(M.robinLands, M.robinLands + 18, frame));
	if (w <= 0) return base;
	const r = robinFlight(frame);
	const target = r.y - 60 + 70 / base.s;
	return {...base, cy: base.cy + (target - base.cy) * w};
};

// world point -> screen point
export const toScreen = (cam: Cam, x: number, y: number): [number, number] => [(x - cam.cx) * cam.s + W / 2, (y - cam.cy) * cam.s + H / 2];

export const birdIndex = Object.fromEntries(BIRDS.map((b, i) => [b.id, i]));
