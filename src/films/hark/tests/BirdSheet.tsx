import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Bird} from '../Bird';
import {C, FONT} from '../theme';

// A test sheet: every species perched, singing and in two flight phases. Not part of the film.
const IDS = ['robin', 'wren', 'blackbird', 'greatTit', 'chaffinch', 'woodpigeon'];

export const BirdSheet: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{backgroundColor: '#EEF0EA'}}>
			<svg width={1920} height={1080}>
				{IDS.map((id, i) => {
					const x = 170 + i * 300;
					return (
						<g key={id}>
							<line x1={x - 90} y1={300} x2={x + 90} y2={300} stroke={C.bark} strokeWidth={6} strokeLinecap="round" />
							<Bird species={id} x={x} y={297} scale={2.4} />
							<line x1={x - 90} y1={560} x2={x + 90} y2={560} stroke={C.bark} strokeWidth={6} strokeLinecap="round" />
							<Bird species={id} x={x} y={557} scale={2.4} face={-1} pose={{sing: 1, headTilt: 18}} />
							<Bird species={id} x={x} y={800} scale={2.4} pose={{fly: 1, flap: 0 + frame * 0.0}} />
							<Bird species={id} x={x} y={1010} scale={2.4} pose={{fly: 1, flap: 0.5}} />
							<text x={x} y={60} textAnchor="middle" fontFamily={FONT.guide} fontSize={34} fill={C.ink}>{id}</text>
						</g>
					);
				})}
			</svg>
		</AbsoluteFill>
	);
};
