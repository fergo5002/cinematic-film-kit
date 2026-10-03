import {Lottie, type LottieAnimationData} from '@remotion/lottie';
import {noise2D} from '@remotion/noise';
import {evolvePath} from '@remotion/paths';
import React, {useEffect, useState} from 'react';
import {AbsoluteFill, cancelRender, continueRender, delayRender, staticFile, useCurrentFrame} from 'remotion';
import {FONT} from '../engine/fonts'; // importing it starts loading the kit's faces
import {EASE, lerp} from '../engine/lib/motion';

// Integration tests: one composition per import, so a broken integration fails on its own and
// is obvious. Registered in src/tests/Root.tsx (entry src/tests/index.ts), never in a film.

const INK = '#15171A';
const LINE = '#E6E8EB';

export const LottieTest: React.FC = () => {
	const [data, setData] = useState<LottieAnimationData | null>(null);
	const [handle] = useState(() => delayRender('Loading Lottie JSON'));
	useEffect(() => {
		fetch(staticFile('test/pulse.json'))
			.then((r) => r.json())
			.then((json) => {
				setData(json);
				continueRender(handle);
			})
			.catch((err) => cancelRender(err));
	}, [handle]);
	return (
		<AbsoluteFill style={{backgroundColor: INK}}>
			{data ? <Lottie animationData={data} style={{width: '100%', height: '100%'}} /> : null}
		</AbsoluteFill>
	);
};

// A line drawn on along its own path: the cheapest way to make a mark feel authored.
const LOOP_PATH =
	'M 300 120 C 420 120 470 260 380 330 C 290 400 160 330 170 220 C 180 110 330 60 410 150 C 490 240 400 400 270 380 C 140 360 120 200 230 150';

export const PathTest: React.FC = () => {
	const frame = useCurrentFrame();
	const p = lerp(frame, [0, 45], [0, 1], EASE.hero);
	const {strokeDasharray, strokeDashoffset} = evolvePath(p, LOOP_PATH);
	const wobble = noise2D('seed-1', frame * 0.02, 0) * 4;
	return (
		<AbsoluteFill style={{backgroundColor: INK, justifyContent: 'center', alignItems: 'center'}}>
			<svg width={600} height={480} viewBox="0 0 600 480" style={{transform: `translateY(${wobble}px)`}}>
				<path
					d={LOOP_PATH}
					fill="none"
					stroke={LINE}
					strokeWidth={14}
					strokeLinecap="round"
					strokeDasharray={strokeDasharray}
					strokeDashoffset={strokeDashoffset}
				/>
			</svg>
			<div style={{fontFamily: FONT.sans, fontWeight: 450, fontSize: 40, color: LINE, position: 'absolute', bottom: 120}}>evolvePath and noise2D</div>
		</AbsoluteFill>
	);
};
