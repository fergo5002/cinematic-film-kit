import React from 'react';
import {useCurrentFrame} from 'remotion';
import {ShaderCanvas} from '../../engine/gl/ShaderCanvas';
import {M, bar, beat} from './beatmap';
import {camera} from './world';

// The sky is a watercolour wash in WORLD space: the camera's position goes in as a uniform, so the
// tilt up at the end reveals higher, deeper sky instead of sliding a flat picture. Dawn warms from
// pre-dawn blue to sunrise as the birds arrive; the sun's rim shows in the breath.

const FRAG = /* glsl */ `
uniform float u_dawn;   // 0 pre-dawn, 1 full morning
uniform vec3 u_cam;     // cx, cy, scale
uniform float u_sun;    // 0 below the trees, 1 up

vec3 lin(vec3 c) { return pow(c, vec3(2.2)); } // colours below are written as display (sRGB) values

vec3 sky(float wy, float dawn) {
  // colours by world height: horizon near y = 900, zenith far above the page
  float h = clamp((900.0 - wy) / 1700.0, 0.0, 1.0);
  vec3 preTop = lin(vec3(0.106, 0.137, 0.208)), preLow = lin(vec3(0.290, 0.333, 0.420));
  vec3 dawnTop = lin(vec3(0.275, 0.353, 0.510)), dawnMid = lin(vec3(0.780, 0.580, 0.560)), dawnLow = lin(vec3(0.980, 0.720, 0.580));
  vec3 dayTop = lin(vec3(0.560, 0.700, 0.840)), dayLow = lin(vec3(0.975, 0.905, 0.760));
  vec3 pre = mix(preLow, preTop, pow(h, 0.7));
  vec3 dw = h < 0.35 ? mix(dawnLow, dawnMid, h / 0.35) : mix(dawnMid, dawnTop, pow((h - 0.35) / 0.65, 0.8));
  vec3 day = mix(dayLow, dayTop, pow(h, 0.8));
  vec3 c = dawn < 0.6 ? mix(pre, dw, dawn / 0.6) : mix(dw, day, (dawn - 0.6) / 0.4);
  return c;
}

vec4 shade(vec2 uv, vec2 px) {
  // screen px (y up) -> world (y down)
  vec2 sp = vec2(px.x, u_resolution.y - px.y) / (u_resolution / vec2(1920.0, 1080.0));
  vec2 w = (sp - vec2(960.0, 540.0)) / u_cam.z + u_cam.xy;
  // watercolour: the wash pools unevenly; edges bloom where two washes meet
  float n = fbm(vec3(w * 0.0021 + vec2(3.1, 7.7), 0.5), 5);
  float n2 = fbm(vec3(w * 0.0038 + vec2(n * 1.7, 2.3), 1.5), 5);
  float wy = w.y + (n - 0.5) * 140.0;
  vec3 c = sky(wy, u_dawn);
  // pigment pooling: slightly darker blooms with soft rims
  float bloom = smoothstep(0.52, 0.6, n2) - smoothstep(0.6, 0.72, n2);
  c *= 1.0 - 0.03 * bloom - 0.03 * (n2 - 0.5);
  // the sun: a soft disc rising behind the wood, then a wide warm glow
  vec2 sunP = vec2(1420.0, mix(1010.0, 0.0, u_sun));
  float d = length(w - sunP);
  float disc = smoothstep(118.0, 110.0, d);
  float glow = exp(-d / 520.0) * 0.55 + exp(-d / 160.0) * 0.35;
  vec3 sunCol = lin(vec3(1.0, 0.86, 0.62));
  c = mix(c, sunCol, clamp(glow * u_dawn, 0.0, 1.0) * 0.6);
  c = mix(c, lin(vec3(1.0, 0.95, 0.84)), disc * smoothstep(0.0, 0.25, u_sun));
  // paper tooth and granulation
  float g = hash12(floor(sp * 1.0)) - 0.5;
  float tooth = fbm(vec3(sp * 0.35, 2.5), 3) - 0.5;
  c *= 1.0 + tooth * 0.05 + g * 0.025;
  // a static dither: it stops banding without making a held frame shimmer
  return vec4(dither(toSRGB(c), px, 0.0), 1.0);
}
`;

export const dawnAt = (frame: number) => {
	// pre-dawn through the listening; warming as each bird is named; sunrise from the breath on
	const k = [
		[0, 0.05],
		[bar(1), 0.12],
		[bar(3.5), 0.48],
		[bar(3.75), 0.6],
		[bar(6), 0.78],
		[bar(8), 0.86],
		[bar(9), 1.0],
	];
	for (let i = 1; i < k.length; i++) {
		if (frame <= k[i][0]) {
			const t = (frame - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
			const e = t * t * (3 - 2 * t);
			return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * e;
		}
	}
	return 1;
};

export const sunAt = (frame: number) => {
	const t = Math.max(0, Math.min(1, (frame - M.breath) / (bar(9) - M.breath)));
	return t * t * (3 - 2 * t);
};

export const Sky: React.FC = () => {
	const frame = useCurrentFrame();
	const cam = camera(frame);
	return <ShaderCanvas fragment={FRAG} uniforms={{u_dawn: dawnAt(frame), u_cam: [cam.cx, cam.cy, cam.s], u_sun: sunAt(frame)}} supersample={1} />;
};

export {beat};
