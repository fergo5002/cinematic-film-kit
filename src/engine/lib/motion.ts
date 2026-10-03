import {Easing, interpolate, spring} from 'remotion';

// Six spring presets, named by intent. Do not invent configs per element.
// Pass durationInFrames to pin a spring's length to the beat grid while keeping its physical shape.
export const SPR = {
	arrive: {mass: 1, damping: 200, stiffness: 120, overshootClamping: true}, // workhorse, no wobble
	settle: {mass: 1, damping: 26, stiffness: 170}, // text and small elements, ~3% overshoot
	pop: {mass: 0.6, damping: 14, stiffness: 320}, // ticks, badges, counters landing, ~9%
	weight: {mass: 3.2, damping: 42, stiffness: 90}, // heavy things land slowly, ~2%
	glide: {mass: 1.4, damping: 60, stiffness: 40, overshootClamping: true}, // camera moves
	whip: {mass: 0.4, damping: 11, stiffness: 480}, // one or two moments per film at most
} as const;

export type SpringName = keyof typeof SPR;

// Apple's model: a perceptual duration (seconds) and a bounce (0 = no overshoot, 0.15 = brisk,
// 0.3 = noticeably bouncy, be cautious above 0.4). Mapping corrected from the WWDC23 transcript
// and verified against Remotion's spring(): bounce 0.15 overshoots 0.63%, 0.3 overshoots 4.6%.
// Remotion's own default config overshoots 16.3% (Apple bounce 0.5): never ship it by accident.
export const appleSpring = (duration: number, bounce = 0) => {
	const stiffness = Math.pow((2 * Math.PI) / duration, 2);
	const damping = bounce >= 0 ? ((1 - bounce) * 4 * Math.PI) / duration : (4 * Math.PI) / (duration * (1 + bounce));
	return {mass: 1, stiffness, damping};
};

export const sp = (
	frame: number,
	fps: number,
	at: number,
	preset: SpringName,
	durationInFrames?: number,
): number => spring({frame: frame - at, fps, config: SPR[preset], durationInFrames});

// Bezier presets for things that must stay perceptually linear-ish (fades, sweeps, progress)
// or where a spring would lie. Entrances ease out, exits ease in, state changes ease in-out.
export const EASE = {
	out: Easing.bezier(0.16, 1, 0.3, 1),
	in: Easing.bezier(0.7, 0, 0.84, 0),
	inOut: Easing.bezier(0.65, 0, 0.35, 1),
	hero: Easing.bezier(0.83, 0, 0.17, 1),
} as const;

// interpolate with clamping on by default, because unclamped extrapolation is the most common
// source of elements flying off after their move.
export const lerp = (
	frame: number,
	input: [number, number],
	output: [number, number],
	easing: (t: number) => number = EASE.inOut,
): number =>
	interpolate(frame, input, output, {
		easing,
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
