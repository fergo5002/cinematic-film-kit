import {evolvePath} from '@remotion/paths';
import React from 'react';

// The Hark wordmark, drawn rather than typed: monoline geometric lowercase built from stems and
// arcs, in units of the x-height (baseline at y = 0, x-height at y = -1, ascenders at y = -1.75).
export const WORDMARK_STROKES = [
	'M 0 -1.75 L 0 0', // h stem
	'M 0 -0.55 A 0.45 0.45 0 0 1 0.9 -0.55 L 0.9 0', // h arch
	'M 2.22 -0.5 A 0.5 0.5 0 1 0 2.22 -0.499', // a bowl
	'M 2.22 -1.0 L 2.22 0', // a stem
	'M 2.56 -1.0 L 2.56 0', // r stem
	'M 2.56 -0.5 A 0.52 0.52 0 0 1 3.12 -0.98', // r shoulder
	'M 3.42 -1.75 L 3.42 0', // k stem
	'M 4.12 -1.0 L 3.47 -0.38', // k arm
	'M 3.72 -0.6 L 4.17 0', // k leg
];
export const WORDMARK_WIDTH = 4.17;
export const WORDMARK_STROKE = 0.2;

// progress 0..1 draws the strokes on in order, overlapping; 1 is the finished mark
export const Wordmark: React.FC<{x: number; y: number; xHeight: number; color: string; progress?: number}> = ({x, y, xHeight, color, progress = 1}) => {
	const n = WORDMARK_STROKES.length;
	return (
		<g transform={`translate(${x} ${y}) scale(${xHeight})`}>
			{WORDMARK_STROKES.map((d, i) => {
				const p = Math.max(0, Math.min(1, progress * (n * 0.55 + 1) - i * 0.55));
				if (p <= 0) return null;
				const {strokeDasharray, strokeDashoffset} = evolvePath(p, d);
				return (
					<path
						key={i}
						d={d}
						fill="none"
						stroke={color}
						strokeWidth={WORDMARK_STROKE}
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeDasharray={p < 1 ? strokeDasharray : undefined}
						strokeDashoffset={p < 1 ? strokeDashoffset : undefined}
					/>
				);
			})}
		</g>
	);
};
