import {Audio} from '@remotion/media';
import {evolvePath} from '@remotion/paths';
import React from 'react';
import {AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {srgbToLinear} from '../../engine/color';
import {Grain} from '../../engine/Grain';
import {ShaderCanvas} from '../../engine/gl/ShaderCanvas';
import {WASH_FRAG} from '../../engine/gl/wash';
import {EASE, lerp, sp} from '../../engine/lib/motion';
import {M, beat, section} from './beatmap';
import {COLOR, TYPE} from './theme';

// "One clock": the starter film. Nine seconds, one shot, four patterns worth copying:
//   a shader wash behind everything (ShaderCanvas + src/engine/gl/wash.ts),
//   a line that draws itself (evolvePath on an SVG path),
//   kinetic type that lands on the beat, letter by letter (springs from src/engine/lib/motion.ts),
//   and a score synthesised from the same beatmap (score.mjs), so every sound is on its frame.
// Every value below is a pure function of the frame: no state, no wall clock, no Math.random().
//
// `Audio` comes from @remotion/media: the `Audio` and `Video` exported by 'remotion' itself are the
// deprecated HTML5 tags and are not frame-accurate.

const RING = {cx: 1490, cy: 530, r: 226};
// Clockwise from twelve o'clock, as two half circles, so the draw-on starts where a clock starts.
const RING_PATH = `M ${RING.cx} ${RING.cy - RING.r} A ${RING.r} ${RING.r} 0 1 1 ${RING.cx} ${RING.cy + RING.r} A ${RING.r} ${RING.r} 0 1 1 ${RING.cx} ${RING.cy - RING.r}`;

// The clock: one tick of the hand on every beat from the first word, a stop for the breath, then
// home to twelve on the hit. The light in the wash pulses on the same ticks.
const TICKS: number[] = M.ticks;

// The wash's own clock: it runs at normal speed, eases to a stop over the beat before the breath
// and stays stopped, so the breath and the closing hold are genuinely still. Integrated frame by
// frame, so slowing down never makes the pattern jump.
const washClock = (frame: number, fps: number) => {
	let t = 0;
	for (let f = 0; f < frame; f++) {
		const u = Math.min(1, Math.max(0, (M.breath - f) / beat(1)));
		t += (u * u * (3 - 2 * u)) / fps;
	}
	return t;
};

const Wash: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	// The light in the pool pulses on every tick, flares on the hit and settles a little brighter.
	let flare = 0;
	for (const t of TICKS) if (frame >= t) flare += 0.28 * Math.exp(-(frame - t) / 5);
	const k = frame - M.hit;
	if (k >= 0) flare += 1.15 * Math.exp(-k / 8) + 0.3 * (1 - Math.exp(-k / 8)); // settles inside a second, so the end holds
	return (
		<ShaderCanvas
			fragment={WASH_FRAG}
			uniforms={{
				u_low: srgbToLinear(COLOR.washLow),
				u_high: srgbToLinear(COLOR.washHigh),
				u_light: lerp(frame, [0, M.ringDone], [0.82, 1], EASE.out),
				u_flare: flare,
				u_drift: 0.05,
				u_clock: washClock(frame, fps),
			}}
		/>
	);
};

const Clock: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const drawn = lerp(frame, [M.ringStart, M.ringDone], [0, 1], EASE.hero);
	const {strokeDasharray, strokeDashoffset} = evolvePath(drawn, RING_PATH);
	const kick = frame >= M.hit ? Math.exp(-(frame - M.hit) / 6) : 0;

	let angle = 0;
	for (const f of TICKS) angle += 30 * sp(frame, fps, f, 'pop', 9);
	angle += (360 - 30 * TICKS.length) * sp(frame, fps, M.hit, 'whip', 14);
	const handIn = lerp(frame, [M.words[0] - 6, M.words[0]], [0, 1], EASE.out);
	const rad = (angle * Math.PI) / 180;
	const tip = {x: RING.cx + Math.sin(rad) * (RING.r - 46), y: RING.cy - Math.cos(rad) * (RING.r - 46)};

	// On the hit an echo of the ring travels outwards and fades: the tick, made visible.
	const echo = lerp(frame, [M.hit, M.hit + 26], [0, 1], EASE.out);
	const echoOn = frame >= M.hit && echo < 1;

	return (
		<svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
			{echoOn ? <circle cx={RING.cx} cy={RING.cy} r={RING.r + 190 * echo} fill="none" stroke={COLOR.line} strokeWidth={8 * (1 - echo) + 1} opacity={0.85 * (1 - echo)} /> : null}
			{Array.from({length: 12}, (_, i) => {
				const a = (i * Math.PI) / 6;
				const shown = Math.max(0, Math.min(1, (drawn - i / 12) * 12));
				const r0 = RING.r - 30;
				const r1 = RING.r - (i % 3 === 0 ? 8 : 14);
				return (
					<line
						key={i}
						x1={RING.cx + Math.sin(a) * r0}
						y1={RING.cy - Math.cos(a) * r0}
						x2={RING.cx + Math.sin(a) * r1}
						y2={RING.cy - Math.cos(a) * r1}
						stroke={COLOR.muted}
						strokeWidth={i % 3 === 0 ? 4 : 2.5}
						strokeLinecap="round"
						opacity={shown}
					/>
				);
			})}
			<path d={RING_PATH} fill="none" stroke={COLOR.line} strokeWidth={7 + 9 * kick} strokeLinecap="round" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} />
			<g opacity={handIn}>
				<line x1={RING.cx} y1={RING.cy} x2={tip.x} y2={tip.y} stroke={COLOR.line} strokeWidth={6} strokeLinecap="round" />
				<circle cx={tip.x} cy={tip.y} r={10 + 4 * kick} fill={COLOR.accent} />
				<circle cx={RING.cx} cy={RING.cy} r={8} fill={COLOR.line} />
			</g>
		</svg>
	);
};

// A word lands letter by letter, each letter a frame behind the last, on a spring that settles
// with a little overshoot. Letters keep their space before they arrive, so the line never reflows.
const Word: React.FC<{text: string; at: number; italic?: boolean}> = ({text, at, italic = false}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	return (
		<span style={{display: 'inline-block', whiteSpace: 'pre', fontStyle: italic ? 'italic' : 'normal'}}>
			{text.split('').map((ch, i) => {
				const p = sp(frame, fps, at + i * 2, 'settle', 26);
				return (
					<span key={i} style={{display: 'inline-block', opacity: Math.min(1, p * 1.6), transform: `translateY(${(1 - p) * 110}px)`}}>
						{ch}
					</span>
				);
			})}
		</span>
	);
};

const Phrase: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	// On the hit the whole phrase lifts to make room for the caption, and the first line steps back,
	// so the conclusion carries the frame.
	const back = sp(frame, fps, M.hit, 'arrive', 18);
	return (
		<div style={{position: 'absolute', left: 176, top: 372, color: COLOR.line, transform: `translateY(${-64 * back}px)`, ...TYPE.phrase}}>
			<div style={{opacity: 1 - 0.6 * back}}>
				<Word text="Picture " at={M.words[0]} />
				<Word text="and sound" at={M.words[1]} italic />
			</div>
			<div style={{marginTop: 22}}>
				<Word text="share " at={M.words[2]} />
				<Word text="one clock." at={M.words[3]} italic />
			</div>
		</div>
	);
};

// Mounted on the global frames of its section, null outside it: the pattern every scene follows.
const Caption: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const s = section('mark');
	if (frame < s.from || frame >= s.to) return null;
	const p = sp(frame, fps, M.caption, 'arrive', 20);
	return (
		<div style={{position: 'absolute', left: 182, top: 650, color: COLOR.muted, opacity: p, transform: `translateY(${(1 - p) * 14}px)`, ...TYPE.caption}}>
			beatmap.ts · 120 bpm · 30 fps
		</div>
	);
};

export const Template: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{backgroundColor: COLOR.ground}}>
			<Wash />
			<Clock />
			<Phrase />
			<Caption />
			<Grain amount={0.045} />
			{/* Cut to black on a beat, after the last chord has gone. */}
			{frame >= M.cut ? <AbsoluteFill style={{backgroundColor: '#000000'}} /> : null}
			<Audio src={staticFile('films/template/score.wav')} />
		</AbsoluteFill>
	);
};
