import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {ShaderCanvas} from './gl/ShaderCanvas';

// Deterministic film grain over everything. Mid-grey plus signed noise, composited with
// mix-blend-mode: overlay, so 0.5 grey is invisible and only the grain shows.
//
// Static by default: one grain texture for the whole film, which reads as paper or film stock and
// lets a held frame hold. Grain that regenerates every frame (animated) is constant motion to the
// audit and to the eye; it was one of the causes of a film the viewer called messy, and at the
// kit's delivery quality it survives the encode. Turn it on only when the film needs it, and expect
// the stillness bands to say so.

const GRAIN_FRAG = /* glsl */ `
uniform float u_amount;
uniform float u_seed;
vec4 shade(vec2 uv, vec2 px) {
  // two scales of grain read as film rather than as digital noise
  float g = grain(px, u_seed) * 0.7 + grain(floor(px / 2.0), u_seed + 13.0) * 0.3;
  return vec4(vec3(0.5 + g * u_amount), 1.0);
}
`;

export const Grain: React.FC<{amount?: number; animated?: boolean}> = ({amount = 0.12, animated = false}) => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{mixBlendMode: 'overlay', pointerEvents: 'none'}}>
			<ShaderCanvas fragment={GRAIN_FRAG} uniforms={{u_amount: amount, u_seed: animated ? frame : 0}} />
		</AbsoluteFill>
	);
};
