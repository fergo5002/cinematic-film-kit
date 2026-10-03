import React from 'react';
import {AbsoluteFill, Composition} from 'remotion';
import {SpheresScene} from '../engine/three/Spheres';
import {GlProbe} from './GlProbe';
import {LottieTest, PathTest} from './Imports';

// Integration tests, not films. tools/doctor.mjs bundles this entry (src/tests/index.ts): it
// renders gl-probe once per --gl backend, and with --proof renders a still of each of the others
// to show every integration works on this machine. Look at them with:
//   npx remotion studio src/tests/index.ts

const ThreeTest: React.FC = () => (
	<AbsoluteFill style={{backgroundColor: '#121417'}}>
		<SpheresScene from={0} to={90} />
	</AbsoluteFill>
);

export const TestsRoot: React.FC = () => (
	<>
		<Composition id="gl-probe" component={GlProbe} durationInFrames={1} fps={30} width={1280} height={720} />
		<Composition id="lottie" component={LottieTest} durationInFrames={60} fps={30} width={1920} height={1080} />
		<Composition id="path-draw" component={PathTest} durationInFrames={60} fps={30} width={1920} height={1080} />
		<Composition id="three-example" component={ThreeTest} durationInFrames={90} fps={30} width={1920} height={1080} />
	</>
);
