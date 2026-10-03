import React, {useLayoutEffect, useRef} from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {BIRDS, M, beat} from './beatmap';
import {Bird} from './Bird';
import {type Cells, LANE_ROWS, PHRASES, useCells} from './spectra';
import {BIRD_COLOR, C, FONT, mix} from './theme';
import {Wordmark} from './Wordmark';
import {
	CARD, CELL, CHIP_H, CHIP_ROW_GAP, CHIPS_GAP, COLS, FMAX_PANEL, HEADER_Y, LANE_GAP, LANE_H, LANE_ORDER, LANE_SPAN, LANES_H, PANEL_H, PANEL_W, PANEL_Y, ROWS, SUB_Y,
} from './world';

// The Hark card: the product. A live halftone of what it hears (every dot computed from the
// soundtrack), each bird's name as Hark finds it, then the chorus pulled apart into lanes, then
// today folded into a month of mornings.

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const OUT = Easing.bezier(0.16, 1, 0.3, 1);
const IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
const smooth = (a: number, b: number, x: number) => {
	const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

const THRESH = 0.42; // below this (about -35 dB) a cell is room noise, not song
const MAX_R = 3.7;
const SHARED_H = ROWS * CELL; // 288
const GUTTER = 232; // lane labels sit left of this
const byId = Object.fromEntries(BIRDS.map((b) => [b.id, b]));

// ---------- frame state ----------
export const cardState = (frame: number) => {
	const first = BIRDS[0].named;
	const open = interpolate(frame, [first + 1, first + 11], [0, 1], {...clamp, easing: OUT}); // the name list opens with the first name
	const fade = interpolate(frame, [M.knot, M.knot + 8], [1, 0], clamp); // slop-lint-ignore no-linear-motion -- opacity of the name list as the lanes take over
	const chips = Math.min(open, fade);
	const grow = interpolate(frame, [M.knot, M.knot + 16], [0, 1], {...clamp, easing: IN_OUT});
	const panelH = PANEL_H + (LANES_H - PANEL_H) * grow;
	const height = PANEL_Y + panelH + chips * (CHIPS_GAP + 2 * CHIP_H + CHIP_ROW_GAP) + CARD.pad;
	return {chips, panelH, height};
};
const laneT = (frame: number, id: string) => interpolate(frame, [byId[id].again, byId[id].again + 16], [0, 1], {...clamp, easing: OUT});
const foldT = (frame: number) => interpolate(frame, [M.today, M.today + 30], [0, 1], {...clamp, easing: IN_OUT});

// ---------- the diary's data: which birds were heard on each May morning (today is the 21st) ----------
export const TODAY = 21;
const heard = (id: string, day: number): boolean => {
	if (day === TODAY) return true;
	if (day > TODAY) return false;
	const h = ((day * 2654435761) ^ (id.length * 40503) ^ (id.charCodeAt(0) * 69069)) >>> 0;
	const r = (h % 1000) / 1000;
	switch (id) {
		case 'robin':
			return day !== 10;
		case 'wren':
			return day >= 3 || day === 1; // nineteen mornings running: the 3rd to the 21st
		case 'blackbird':
			return day !== 5 && day !== 12;
		case 'greatTit':
			return r < 0.62;
		case 'chaffinch':
			return r < 0.5;
		default:
			return r < 0.8;
	}
};
const DAY_X0 = GUTTER + 18;
const DAY_STEP = (PANEL_W - 12 - DAY_X0) / 30;
const dayX = (d: number) => DAY_X0 + (d - 1) * DAY_STEP;
const laneTop = (id: string) => LANE_ORDER.indexOf(id) * (LANE_H + LANE_GAP);
const laneMid = (id: string) => laneTop(id) + LANE_H / 2;

// ---------- what Hark hears, and what it understands ----------
// Two layers. The raw sound is a faint halftone of chalk dots, one cell per video frame. When Hark
// names a bird it traces that bird's song through the dots as a pen line in the bird's colour,
// thick where the song is loud: the dots are the hearing, the line is the knowing.
const TRACE_PHRASES = PHRASES.filter((p) => p.role !== 'distant' && p.role !== 'last');

const Halftone: React.FC<{cells: Cells; frame: number; height: number}> = ({cells, frame, height}) => {
	const ref = useRef<HTMLCanvasElement>(null);
	const S = 2.5; // canvas pixels per world pixel: stays sharp under the camera's 1.45x push
	useLayoutEffect(() => {
		const cv = ref.current;
		if (!cv) return;
		const ctx = cv.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, cv.width, cv.height);
		ctx.setTransform(S, 0, 0, S, 0, 0);
		const fold = foldT(frame);
		if (fold >= 1) return;
		const now = frame / 24;
		const xOf = (t: number) => (t * 24 - scrollOf(frame)) * CELL + CELL / 2;
		// where a frequency sits for bird `id` at lane progress lt
		const yOf = (id: string, f: number, lt: number) => {
			const ys = SHARED_H - (Math.min(f, FMAX_PANEL) / FMAX_PANEL) * SHARED_H;
			if (lt <= 0) return ys;
			const [lo, hi] = LANE_SPAN[id];
			const u = Math.max(0, Math.min(1, Math.log(f / lo) / Math.log(hi / lo)));
			const yl = laneTop(id) + LANE_H - u * LANE_H;
			return ys + (yl - ys) * lt;
		};
		const ageFade = (x: number) => (scrollOf(frame) > 0 ? smooth(-20, 120, x) : 1);
		const lanesOn = smooth(M.lanes - 6, M.lanes + 4, frame);
		const gutter = (x: number) => 1 - lanesOn * (1 - smooth(GUTTER - 24, GUTTER + 8, x));
		// 1. the raw sound: chalk dots, dimmer once a bird is known, gone in the lanes
		BIRDS.forEach((b, bi) => {
			const known = smooth(b.named, b.named + 8, frame);
			const lt = laneT(frame, b.id);
			const base = (0.78 - 0.5 * known) * (1 - lt);
			if (base <= 0.01) return;
			ctx.fillStyle = C.chalk;
			for (let j = 0; j < COLS; j++) {
				const f = j + scrollOf(frame);
				if (f > frame || f >= cells.frames) continue;
				let x = j * CELL + CELL / 2;
				let alpha = base * ageFade(x) * gutter(x);
				if (fold > 0) {
					x += (dayX(TODAY) - x) * fold;
					alpha *= 1 - fold;
				}
				if (alpha <= 0.01) continue;
				for (let r = 0; r < ROWS; r++) {
					const v = cells.shared[(bi * cells.frames + f) * ROWS + r];
					if (v < THRESH) continue;
					const m = (v - THRESH) / (1 - THRESH);
					ctx.globalAlpha = alpha;
					ctx.beginPath();
					ctx.arc(x, SHARED_H - (r + 0.5) * CELL, MAX_R * 0.8 * Math.pow(m, 0.7), 0, Math.PI * 2);
					ctx.fill();
				}
			}
		});
		// 2. the traces: each named bird's song as a pen line
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		for (const ph of TRACE_PHRASES) {
			const b = byId[ph.bird];
			const known = smooth(b.named, b.named + 6, frame);
			if (known <= 0 || ph.t0 > now) continue;
			const lt = laneT(frame, ph.bird);
			ctx.strokeStyle = BIRD_COLOR[ph.bird];
			const pts = ph.contour;
			for (let k = 1; k < pts.length; k++) {
				const [t0, f0, v0] = pts[k - 1];
				const [t1, f1, v1] = pts[k];
				if (t1 > now || t1 - t0 > 0.016) continue;
				let x0 = xOf(t0);
				let x1 = xOf(t1);
				if (x1 < -10) continue;
				let alpha = known * ageFade(x0) * gutter(x0);
				let y0 = yOf(ph.bird, f0, lt);
				let y1 = yOf(ph.bird, f1, lt);
				if (fold > 0) {
					x0 += (dayX(TODAY) - x0) * fold;
					x1 += (dayX(TODAY) - x1) * fold;
					y0 += (laneMid(ph.bird) - y0) * fold;
					y1 += (laneMid(ph.bird) - y1) * fold;
					alpha *= 1 - fold;
				}
				if (alpha <= 0.01) continue;
				ctx.globalAlpha = alpha;
				ctx.lineWidth = (1.6 + 4.2 * Math.pow((v0 + v1) / 2, 2)) * (1 - 0.25 * lt);
				ctx.beginPath();
				ctx.moveTo(x0, y0);
				ctx.lineTo(x1, y1);
				ctx.stroke();
			}
		}
		ctx.globalAlpha = 1;
	});
	return <canvas ref={ref} width={Math.round(PANEL_W * S)} height={Math.round(height * S)} style={{position: 'absolute', left: 0, top: 0, width: PANEL_W, height}} />;
};

// ---------- the name that lands on a bird's song ----------
// x of a time (seconds) in the panel at this frame. Until the panel is full, sound is written from
// the left behind a moving cursor; after that it scrolls, with now at the right edge.
const scrollOf = (frame: number) => Math.max(0, frame - (COLS - 1));
export const cursorX = (frame: number) => Math.min(frame, COLS - 1) * CELL + CELL / 2;
const timeX = (frame: number, t: number) => (t * 24 - scrollOf(frame)) * CELL + CELL / 2;

const firstPhrase = (id: string) => PHRASES.find((p) => p.bird === id && p.role === 'first');

export const tagAnchor = (frame: number, id: string): [number, number] => {
	// the top of the bird's first phrase, at its loudest point: where the name sits
	const ph = firstPhrase(id);
	if (!ph || ph.contour.length === 0) return [PANEL_W - 60, 40];
	const fmax = Math.max(...ph.contour.map((p) => Math.min(FMAX_PANEL, p[1])));
	const tmid = (ph.t0 + ph.t1) / 2;
	return [timeX(frame, tmid), SHARED_H - (fmax / FMAX_PANEL) * SHARED_H - 34];
};

const Tag: React.FC<{frame: number; id: string}> = ({frame, id}) => {
	const b = byId[id];
	const inT = interpolate(frame, [b.named, b.named + 7], [0, 1], {...clamp, easing: OUT});
	const outT = interpolate(frame, [b.named + beat(1.6), b.named + beat(2)], [1, 0], clamp); // slop-lint-ignore no-linear-motion -- the tag's opacity as it leaves
	if (inT <= 0 || outT <= 0 || frame >= M.knot) return null;
	const [x, y] = tagAnchor(frame, id);
	const label = b.name;
	const w = 44 + label.length * 21;
	return (
		<g transform={`translate(${Math.max(w / 2 + 4, Math.min(PANEL_W - w / 2 - 4, x))} ${Math.max(36, y)}) scale(${0.92 + 0.08 * inT})`} opacity={inT * outT}>
			<rect x={-w / 2} y={-32} width={w} height={62} rx={31} fill={BIRD_COLOR[id]} />
			<text x={0} y={13} textAnchor="middle" fontFamily={FONT.app} fontWeight={650} fontSize={40} fill={C.night}>
				{label}
			</text>
		</g>
	);
};

// ---------- the diary ----------
const Diary: React.FC<{frame: number}> = ({frame}) => {
	const fold = foldT(frame);
	if (fold <= 0) return null;
	const noteT = interpolate(frame, [M.note, M.note + 12], [0, 1], {...clamp, easing: OUT});
	return (
		<g>
			{/* future mornings: empty rings */}
			{LANE_ORDER.map((id) =>
				Array.from({length: 31 - TODAY}, (_, i) => TODAY + 1 + i).map((d) => (
					<circle key={`${id}-${d}`} cx={dayX(d)} cy={laneMid(id)} r={5} fill="none" stroke={C.nightRule} strokeWidth={1.5} opacity={smooth(M.month, M.month + 10, frame)} />
				)),
			)}
			{/* today: each lane folds into one dot */}
			{LANE_ORDER.map((id) => (
				<circle key={`today-${id}`} cx={dayX(TODAY)} cy={laneMid(id)} r={9 * smooth(0.4, 1, fold)} fill={BIRD_COLOR[id]} />
			))}
			{/* the month fills backwards from today, one morning a frame */}
			{LANE_ORDER.map((id) =>
				Array.from({length: TODAY - 1}, (_, i) => TODAY - 1 - i).map((d, k) => {
					if (!heard(id, d)) return null;
					const t = interpolate(frame, [M.month + k, M.month + k + 6], [0, 1], {...clamp, easing: OUT});
					if (t <= 0) return null;
					return <circle key={`${id}-${d}`} cx={dayX(d)} cy={laneMid(id)} r={7 * t} fill={BIRD_COLOR[id]} opacity={0.9} />;
				}),
			)}
			{/* day labels */}
			<g opacity={smooth(M.month, M.month + 10, frame)} fontFamily={FONT.app} fontSize={19} fill={C.chalkSoft}>
				{[1, 8, 15].map((d) => (
					<text key={d} x={dayX(d)} y={LANES_H + 24} textAnchor="middle">
						{d}
					</text>
				))}
				<text x={dayX(TODAY)} y={LANES_H + 24} textAnchor="middle" fontWeight={700} fill={C.chalk}>
					Today
				</text>
				<text x={dayX(31)} y={LANES_H + 24} textAnchor="middle">
					31
				</text>
			</g>
			<line x1={dayX(TODAY)} x2={dayX(TODAY)} y1={-8} y2={LANES_H + 4} stroke={C.chalk} strokeWidth={1.2} opacity={0.35 * smooth(M.month, M.month + 10, frame)} />
			{/* the note: the wren's streak */}
			{noteT > 0 ? (
				<g opacity={noteT}>
					<path
						d={`M ${dayX(3) - 8} ${laneMid('wren') - 15} L ${dayX(3) - 8} ${laneMid('wren') - 21} L ${dayX(TODAY) + 8} ${laneMid('wren') - 21} L ${dayX(TODAY) + 8} ${laneMid('wren') - 15}`}
						fill="none"
						stroke={C.chalk}
						strokeWidth={1.8}
						strokeDasharray={`${(dayX(TODAY) - dayX(3) + 28) * noteT} 2000`}
					/>
				</g>
			) : null}
		</g>
	);
};

// ---------- the card ----------
export const Card: React.FC = () => {
	const frame = useCurrentFrame();
	const cells = useCells();
	const {chips, panelH, height} = cardState(frame);
	const named = BIRDS.filter((b) => frame >= b.named);
	const listening = frame < M.today;
	const pulse = 0.55 + 0.45 * Math.cos((frame / 24) * Math.PI * 2);
	const noteT = interpolate(frame, [M.note, M.note + 12], [0, 1], {...clamp, easing: OUT});
	return (
		<div
			style={{
				position: 'absolute',
				left: CARD.x,
				top: CARD.y,
				width: CARD.w,
				height,
				borderRadius: CARD.radius,
				backgroundColor: C.night,
				border: `1.5px solid ${C.nightRule}`,
				boxShadow: '0 40px 80px rgba(8, 12, 10, 0.45), 0 8px 18px rgba(8, 12, 10, 0.3)',
				overflow: 'hidden',
			}}
		>
			{/* header: the mark, the wordmark, and what it is doing */}
			<svg width={CARD.w} height={140} style={{position: 'absolute', left: 0, top: 0}}>
				<Bird species="robin" x={CARD.pad + 22} y={HEADER_Y + 44} scale={0.86} R={18} outline={C.chalk} />
				<Wordmark x={CARD.pad + 64} y={HEADER_Y + 42} xHeight={22} color={C.chalk} />
				<g transform={`translate(${CARD.w - CARD.pad} ${HEADER_Y + 30})`} fontFamily={FONT.app}>
					<circle cx={-136} cy={-8} r={6.5} fill={C.robinMuted} opacity={listening ? pulse : 0.25} />
					{listening ? <circle cx={-136} cy={-8} r={6.5 + 9 * (1 - pulse)} fill="none" stroke={C.robinMuted} strokeWidth={1.4} opacity={0.5 * pulse} /> : null}
					<text x={0} y={0} textAnchor="end" fontSize={25} fontWeight={600} fill={C.chalk}>
						{listening ? 'Listening' : 'May mornings'}
					</text>
				</g>
				<text x={CARD.pad} y={SUB_Y + 20} fontFamily={FONT.app} fontSize={22} fill={C.chalkSoft} opacity={1 - foldT(frame)}>
					Back garden · 21 May · 05:42
				</text>
			</svg>
			{/* the panel */}
			<div style={{position: 'absolute', left: CARD.pad, top: PANEL_Y, width: PANEL_W, height: panelH + 40}}>
				{cells ? <Halftone cells={cells} frame={frame} height={panelH + 40} /> : null}
				<svg width={PANEL_W} height={panelH + 40} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
					{/* now: the right edge, where sound arrives */}
					<line x1={cursorX(frame) + CELL / 2} x2={cursorX(frame) + CELL / 2} y1={0} y2={SHARED_H} stroke={C.chalk} strokeWidth={1.5} opacity={0.22 * (1 - foldT(frame)) * (1 - laneT(frame, 'robin'))} />
					{BIRDS.map((b) => (
						<Tag key={b.id} frame={frame} id={b.id} />
					))}
					{/* lane labels, as each lane pulls out */}
					{LANE_ORDER.map((id) => {
						const t = laneT(frame, id);
						if (t <= 0) return null;
						return (
							<g key={id} opacity={t} transform={`translate(${-12 * (1 - t)} 0)`}>
								<Bird species={id} x={22} y={laneMid(id) + 16} scale={0.62} R={18} outline={BIRD_COLOR[id]} />
								<text x={54} y={laneMid(id) + 10} fontFamily={FONT.guide} fontWeight={560} fontSize={31} fill={BIRD_COLOR[id]}>
									{byId[id].name}
								</text>
							</g>
						);
					})}
					<Diary frame={frame} />
					{noteT > 0 ? (
						<text x={(dayX(3) + dayX(TODAY)) / 2} y={laneMid('wren') - 30} textAnchor="middle" fontFamily={FONT.guide} fontStyle="italic" fontSize={32} fill={C.chalk} opacity={noteT}>
							Wren · 19 mornings running
						</text>
					) : null}
				</svg>
			</div>
			{/* the names Hark has found, in the order it found them */}
			{chips > 0 ? (
				<div style={{position: 'absolute', left: CARD.pad, top: PANEL_Y + panelH + CHIPS_GAP, width: PANEL_W, opacity: chips, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', columnGap: 12, rowGap: CHIP_ROW_GAP}}>
					{named.map((b) => {
						const t = interpolate(frame, [b.named + 3, b.named + 11], [0, 1], {...clamp, easing: OUT});
						return (
							<div
								key={b.id}
								style={{
									height: CHIP_H,
									borderRadius: 16,
									backgroundColor: mix(BIRD_COLOR[b.id], C.night, 0.84),
									border: `1.5px solid ${mix(BIRD_COLOR[b.id], C.night, 0.45)}`,
									display: 'flex',
									alignItems: 'center',
									opacity: t,
									transform: `translateY(${(1 - t) * 10}px) scale(${0.96 + 0.04 * t})`,
								}}
							>
								<svg width={58} height={CHIP_H} style={{flex: 'none'}}>
									<Bird species={b.id} x={31} y={52} scale={b.id === 'woodpigeon' ? 0.6 : 0.78} R={18} outline={BIRD_COLOR[b.id]} />
								</svg>
								<span style={{fontFamily: FONT.guide, fontWeight: 600, fontSize: 34, color: C.chalk, lineHeight: 1}}>{b.name}</span>
							</div>
						);
					})}
				</div>
			) : null}
		</div>
	);
};

export {LANE_ROWS};
