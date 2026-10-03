import {getLength, getPointAtLength} from '@remotion/paths';
import React, {useMemo} from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {M} from './beatmap';
import {Bird} from './Bird';
import {PHRASES} from './spectra';
import {C, FONT, mix} from './theme';
import {Wordmark, WORDMARK_STROKE, WORDMARK_STROKES} from './Wordmark';
import {MARK} from './world';

// The ending argues the product: Hark turns song into names. The robin lands, sings once more, its
// song is drawn across the sky as an ink line, and that line settles into the word "hark". The
// robin's breast takes the film's one saturated colour as the word completes.

const SONG = {x0: 868, x1: 1480, yLow: -430, yHigh: -730, fLow: 2600, fHigh: 8600};

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const OUT = Easing.bezier(0.16, 1, 0.3, 1);
const SETTLE = Easing.bezier(0.65, 0, 0.35, 1);
const MORPH = 14; // each stroke's settle
const STAGGER = 1.5; // frames between strokes, left to right

type Pt = [number, number];

const songPoints = (): {t: number; p: Pt; v: number}[] => {
	const ph = PHRASES.find((x) => x.bird === 'robin' && x.role === 'last');
	if (!ph) return [];
	return ph.contour.map(([t, f, v0]) => {
		const u = (t - ph.t0) / (ph.t1 - ph.t0);
		const v = Math.max(0, Math.min(1, (f - SONG.fLow) / (SONG.fHigh - SONG.fLow)));
		return {t, v: v0, p: [SONG.x0 + u * (SONG.x1 - SONG.x0), SONG.yLow + v * (SONG.yHigh - SONG.yLow)] as Pt};
	});
};

// split the contour into syllables wherever there is a gap in time
const syllables = (pts: {t: number; p: Pt; v: number}[]) => {
	const out: {t: number; p: Pt; v: number}[][] = [];
	for (const q of pts) {
		const last = out[out.length - 1];
		if (!last || q.t - last[last.length - 1].t > 0.016) out.push([q]);
		else last.push(q);
	}
	return out;
};

const toWorld = (x: number, y: number): Pt => [MARK.wordX + x * MARK.xHeight, MARK.baseY + y * MARK.xHeight];

const resample = (pts: Pt[], n: number): Pt[] => {
	if (pts.length === 1) return Array.from({length: n}, () => pts[0]);
	const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
	const total = seg.reduce((a, b) => a + b, 0) || 1;
	const out: Pt[] = [];
	for (let k = 0; k < n; k++) {
		let d = (k / (n - 1)) * total;
		let i = 0;
		while (i < seg.length - 1 && d > seg[i]) d -= seg[i++];
		const t = seg[i] ? d / seg[i] : 0;
		out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
	}
	return out;
};

const path = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');

export const Mark: React.FC = () => {
	const frame = useCurrentFrame();
	const pts = useMemo(songPoints, []);
	const sylls = useMemo(() => syllables(pts), [pts]);
	// the robin sings nine notes; the word has nine strokes: note k becomes stroke k
	const plan = useMemo(() => {
		return WORDMARK_STROKES.map((d, i) => {
			const syl = sylls[Math.min(i, sylls.length - 1)] ?? [];
			const n = 32;
			const pts2 = syl.map((q) => q.p);
			const from = resample(pts2.length > 1 ? pts2 : [pts2[0] ?? [0, 0], pts2[0] ?? [0, 0]], n);
			const L = getLength(d);
			const to = Array.from({length: n}, (_, k) => {
				const pt = getPointAtLength(d, (k / (n - 1)) * L) ?? {x: 0, y: 0};
				return toWorld(pt.x, pt.y);
			});
			const v = syl.length ? syl.reduce((a, q) => a + q.v * q.v, 0) / syl.length : 0.5;
			return {from, to, w0: 3 + 9 * v};
		});
	}, [sylls]);

	if (frame < M.robinLands) return null;
	const now = frame / 24;
	const strokeT = (i: number) => interpolate(frame, [M.morph + i * STAGGER, M.morph + i * STAGGER + MORPH], [0, 1], {...clamp, easing: SETTLE});
	const m = strokeT(0);
	const last = M.morph + (WORDMARK_STROKES.length - 1) * STAGGER + MORPH;
	const done = interpolate(frame, [last - 2, last + 2], [0, 1], clamp); // slop-lint-ignore no-linear-motion -- crossfade from the sampled strokes to the exact word, four frames
	const breast = mix(C.robinMuted, C.robinRed, interpolate(frame, [M.wordmark, M.wordmark + 10], [0, 1], {...clamp, easing: OUT}));
	const lineT = interpolate(frame, [M.endLine, M.endLine + 14], [0, 1], {...clamp, easing: OUT});
	const robinSinging = now >= (pts[0]?.t ?? 1e9) && now <= (pts[pts.length - 1]?.t ?? 0) + 0.05;
	const W1 = MARK.xHeight * WORDMARK_STROKE;
	return (
		<svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
			{/* the twig the mark sits on */}
			<line x1={MARK.robinX - 70} y1={MARK.robinY + 3} x2={MARK.robinX + 60} y2={MARK.robinY + 3} stroke={C.ink} strokeWidth={7} strokeLinecap="round" />
			<Bird
				species="robin"
				x={MARK.robinX}
				y={MARK.robinY}
				scale={MARK.robinScale}
				face={1}
				pose={{sing: robinSinging ? 0.55 + 0.45 * Math.abs(Math.sin(frame * 1.9)) : 0, headTilt: robinSinging ? 14 : 4 * Math.sin(frame / 15) * (1 - interpolate(frame, [M.wordmark, M.wordmark + 12], [0, 1], {...clamp, easing: SETTLE}))}}
				breast={breast}
			/>
			{/* the song, drawn as it is heard; then it settles into the word */}
			{m <= 0
				? sylls.map((s, i) => {
						const shown = s.filter((q) => q.t <= now);
						if (shown.length < 2) return null;
						return (
							<g key={i}>
								{shown.slice(1).map((q, k) => (
									<line key={k} x1={shown[k].p[0]} y1={shown[k].p[1]} x2={q.p[0]} y2={q.p[1]} stroke={C.ink} strokeWidth={3 + 9 * Math.pow((q.v + shown[k].v) / 2, 2)} strokeLinecap="round" />
								))}
							</g>
						);
					})
				: null}
			{m > 0 && done < 1
				? plan.map((st, i) => {
						const t = strokeT(i);
						return (
							<path
								key={i}
								d={path(st.from.map((p, k) => [p[0] + (st.to[k][0] - p[0]) * t, p[1] + (st.to[k][1] - p[1]) * t] as Pt))}
								fill="none"
								stroke={C.ink}
								strokeWidth={st.w0 + (W1 - st.w0) * t}
								strokeLinecap="round"
								strokeLinejoin="round"
								opacity={1 - done}
							/>
						);
					})
				: null}
			{done > 0 ? (
				<g opacity={done}>
					<Wordmark x={MARK.wordX} y={MARK.baseY} xHeight={MARK.xHeight} color={C.ink} />
				</g>
			) : null}
			{lineT > 0 ? (
				<text
					x={960}
					y={-212 + 18 * (1 - lineT)}
					textAnchor="middle"
					fontFamily={FONT.guide}
					fontWeight={430}
					fontSize={64}
					fill={C.ink}
					opacity={lineT}
					style={{fontVariationSettings: '"opsz" 60'}}
				>
					Know who's singing.
				</text>
			) : null}
			{lineT > 0 ? (
				<text x={960} y={-140 + 12 * (1 - lineT)} textAnchor="middle" fontFamily={FONT.app} fontWeight={500} fontSize={38} fill={C.ink} opacity={lineT * 0.8}>
					The Hark app, for iPhone and Android
				</text>
			) : null}
		</svg>
	);
};
