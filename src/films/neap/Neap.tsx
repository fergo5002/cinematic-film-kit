import {Audio} from '@remotion/media';
import {evolvePath} from '@remotion/paths';
import React from 'react';
import {AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Captions} from '../../engine/Captions';
import {srgbToLinear} from '../../engine/color';
import {Grain} from '../../engine/Grain';
import {ShaderCanvas} from '../../engine/gl/ShaderCanvas';
import {WASH_FRAG} from '../../engine/gl/wash';
import {EASE, lerp, sp} from '../../engine/lib/motion';
import narration from './data/narration.json';
import {END} from './beatmap';
import {MOMENT} from './moments';
import {COLOR, TYPE} from './theme';

// "Slack water": an 18 second narrated film for Neap, a made-up tide app. The voice leads and the
// picture keys on its words (moments.ts): the day's tide draws itself, a light rides it and stops
// dead at high water on the word "stops", the turning points get their times, other harbours'
// tides appear behind, and the time the water stops becomes the hero. The sea's own drift stops
// with the water. Every value is a pure function of the frame.

// The day as a line: x is the hour (0 to 24), y the height of the water. A semi-diurnal tide, high
// water at 14:52 and a period of 12 h 25 min, so the other turning points fall where they would.
const X0 = 170;
const X1 = 1750;
const BASE = 560;
const AMP = 150;
const HIGH = 14 + 52 / 60;
const PERIOD = 12.42;
const xOf = (h: number) => X0 + ((X1 - X0) * h) / 24;
const yOf = (h: number, shift = 0, amp = 1) => BASE - AMP * amp * Math.cos((2 * Math.PI * (h - HIGH - shift)) / PERIOD);
const curve = (shift = 0, amp = 1) => {
	const pts: string[] = [];
	for (let i = 0; i <= 240; i++) {
		const h = (24 * i) / 240;
		pts.push(`${i ? 'L' : 'M'} ${xOf(h).toFixed(1)} ${yOf(h, shift, amp).toFixed(1)}`);
	}
	return pts.join(' ');
};
const TIDE = curve();
// Other harbours on the same coast: the same tide, earlier or later, a little higher or lower.
const HARBOURS = [
	{shift: -1.6, amp: 0.82},
	{shift: -0.8, amp: 1.08},
	{shift: 0.7, amp: 0.9},
	{shift: 1.4, amp: 1.12},
	{shift: 2.2, amp: 0.76},
].map((h) => ({...h, d: curve(h.shift, h.amp)}));
const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const TURNS = [HIGH - PERIOD, HIGH - PERIOD / 2, HIGH, HIGH + PERIOD / 2].map((h, i) => ({h, high: i % 2 === 0, label: hhmm(h)}));

// The sea's clock: it runs, eases to a stop as the water stops, starts again when the
// narration moves on, and stops for good on the end card. Integrated frame by frame, so slowing
// down never makes the pattern jump.
const seaSpeed = (f: number) => {
	const down = (at: number, len: number) => Math.min(1, Math.max(0, (at - f) / len));
	const up = (at: number, len: number) => Math.min(1, Math.max(0, (f - at) / len));
	if (f >= MOMENT.go) return 0;
	if (f >= MOMENT.when) return up(MOMENT.when, 30);
	return down(MOMENT.stops, 14);
};
const seaClock = (frame: number, fps: number) => {
	let t = 0;
	for (let f = 0; f < frame; f++) {
		const u = seaSpeed(f);
		t += (u * u * (3 - 2 * u)) / fps;
	}
	return t;
};

const Sea: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const k = frame - MOMENT.stops;
	return (
		<ShaderCanvas
			fragment={WASH_FRAG}
			uniforms={{
				u_low: srgbToLinear(COLOR.washLow),
				u_high: srgbToLinear(COLOR.washHigh),
				u_light: lerp(frame, [0, MOMENT.drawn], [0.7, 0.95], EASE.out),
				u_flare: k >= 0 && frame < MOMENT.go ? 0.35 * Math.exp(-k / 12) : 0,
				u_drift: 0.36,
				u_clock: seaClock(frame, fps),
			}}
		/>
	);
};

// The water in the harbour: its surface rises and falls with the light as it rides the tide, the
// swell goes flat calm the moment the water stops, a little swell comes back while the voice
// explains, and it is calm again for the time it names. The light floats on the surface.
const smooth = (u: number) => {
	const x = Math.min(1, Math.max(0, u));
	return x * x * (3 - 2 * x);
};
const swell = (f: number) => {
	if (f < MOMENT.stops) return 72 * (1 - smooth((f - (MOMENT.stops - 16)) / 16));
	if (f < MOMENT.when) return 0;
	if (f < MOMENT.slack) return 48 * smooth((f - MOMENT.when) / 30);
	return 48 * (1 - smooth((f - MOMENT.slack) / 20));
};
const surfaceY = (frame: number) => {
	const ride = lerp(frame, [MOMENT.ride, MOMENT.stops], [0, 1], EASE.out);
	return yOf(HIGH * ride);
};

const Water: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	if (frame >= MOMENT.go) return null;
	const level = surfaceY(frame);
	const a = swell(frame);
	const t = seaClock(frame, fps) * 3.6;
	const pts: string[] = [];
	for (let x = -1200; x <= 3100; x += 16) pts.push(`L ${x} ${(level + a * (0.6 * Math.sin((2 * Math.PI * x) / 520 - 2.1 * t) + 0.4 * Math.sin((2 * Math.PI * x) / 310 + 1.3 * t))).toFixed(1)}`);
	const d = `M -1200 1700 ${pts.join(' ')} L 3100 1700 Z`;
	const back = sp(frame, fps, MOMENT.slack, 'arrive', 18);
	return (
		<svg width={1920} height={1080} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
			<defs>
				<linearGradient id="neap-water" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor={COLOR.washHigh} stopOpacity={0.55} />
					<stop offset="0.35" stopColor={COLOR.washLow} stopOpacity={0.5} />
					<stop offset="1" stopColor={COLOR.ground} stopOpacity={0.7} />
				</linearGradient>
			</defs>
			<path d={d} fill="url(#neap-water)" opacity={1 - 0.4 * back} />
			<path d={`M ${pts.join(' ').slice(2)}`} fill="none" stroke={COLOR.washHigh} strokeWidth={4} opacity={1 - 0.5 * back} />
		</svg>
	);
};

const Day: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	if (frame >= MOMENT.go) return null;
	const drawn = lerp(frame, [MOMENT.draw, MOMENT.drawn + 6], [0, 1], EASE.hero);
	const {strokeDasharray, strokeDashoffset} = evolvePath(drawn, TIDE);
	// From "Slack" on, everything but the afternoon's high water steps back.
	const back = sp(frame, fps, MOMENT.slack, 'arrive', 18);
	// The light rides the tide from midnight and decelerates into high water, arriving on "stops".
	const ride = lerp(frame, [MOMENT.ride, MOMENT.stops], [0, 1], EASE.out);
	const h = HIGH * ride;
	const markerIn = lerp(frame, [MOMENT.draw, MOMENT.draw + 10], [0, 1], EASE.out);
	const slack = sp(frame, fps, MOMENT.stops, 'settle', 20);
	return (
		<svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
			{HARBOURS.map((hb, i) => {
				const p = lerp(frame, [MOMENT.every + 3 * i, MOMENT.every + 3 * i + 16], [0, 1], EASE.out);
				return <path key={i} d={hb.d} fill="none" stroke={COLOR.faint} strokeWidth={2} opacity={0.55 * p * (1 - 0.7 * back)} />;
			})}
			{[0, 6, 12, 18, 24].map((hr) => (
				<g key={hr} opacity={Math.max(0, Math.min(1, (drawn - Math.min(hr / 24, 0.9)) * 6)) * (1 - lerp(frame, [MOMENT.when - 10, MOMENT.when + 10], [0, 1], EASE.inOut))}>
					<line x1={xOf(hr)} y1={BASE + AMP + 42} x2={xOf(hr)} y2={BASE + AMP + 54} stroke={COLOR.muted} strokeWidth={2} />
					<text x={xOf(hr)} y={BASE + AMP + 92} fill={COLOR.line} fillOpacity={0.75} textAnchor="middle" style={TYPE.label}>
						{String(hr).padStart(2, '0')}
					</text>
				</g>
			))}
			<path d={TIDE} fill="none" stroke={COLOR.line} strokeWidth={4} strokeLinecap="round" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} opacity={1 - 0.55 * back} />
			{TURNS.map((t, i) => {
				const p = sp(frame, fps, MOMENT.when + 7 * i, 'settle', 22);
				const isHero = Math.abs(t.h - HIGH) < 1e-6;
				const fade = isHero ? 1 - sp(frame, fps, MOMENT.time, 'arrive', 14) : 1 - back;
				const y = yOf(t.h) + (t.high ? -40 : 58);
				return (
					<g key={i} opacity={p * fade} transform={`translate(0 ${(1 - p) * (t.high ? 12 : -12)})`}>
						<circle cx={xOf(t.h)} cy={yOf(t.h)} r={6} fill={isHero ? COLOR.accent : COLOR.line} />
						<text x={xOf(t.h)} y={y} fill={isHero ? COLOR.accent : COLOR.line} textAnchor="middle" style={TYPE.label}>
							{t.label}
						</text>
					</g>
				);
			})}
			{/* slack water: a short level line through the high water, the moment the tide stops */}
			<line x1={xOf(HIGH) - 70 * slack} y1={yOf(HIGH)} x2={xOf(HIGH) + 70 * slack} y2={yOf(HIGH)} stroke={COLOR.accent} strokeWidth={3} strokeLinecap="round" opacity={frame >= MOMENT.stops ? 0.9 : 0} />
			<circle cx={xOf(h)} cy={yOf(h)} r={11} fill={COLOR.accent} opacity={markerIn} />
		</svg>
	);
};

// "14:52" grows out of its label into the hero, above the high water it names. It is drawn in
// screen space, outside the camera, so the push-in never crops it.
const Hero: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	if (frame < MOMENT.time - 2 || frame >= MOMENT.go) return null;
	const p = sp(frame, fps, MOMENT.time, 'settle', 24);
	return (
		<div style={{position: 'absolute', left: xOf(HIGH) + cameraAt(frame).x - 400, width: 800, top: yOf(HIGH) - 340, textAlign: 'center', opacity: Math.min(1, p * 1.4), transform: `translateY(${(1 - p) * 60}px) scale(${0.94 + 0.06 * p})`}}>
			<div style={{color: COLOR.muted, marginBottom: 18, ...TYPE.kicker}}>Slack water</div>
			<div style={{color: COLOR.accent, ...TYPE.hero}}>14:52</div>
		</div>
	);
};

// The end card arrives as a cut on "Go": the name and what it is, then the slack-water line drawn
// under the name when the music takes the room, and the credit the voice needs.
const EndCard: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	if (frame < MOMENT.go) return null;
	const p = sp(frame, fps, MOMENT.go, 'arrive', 16);
	const rule = lerp(frame, [MOMENT.close, MOMENT.close + 16], [0, 1], EASE.out);
	return (
		<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
			<div style={{color: COLOR.line, opacity: p, transform: `translateY(${(1 - p) * 18}px)`, marginTop: -80, ...TYPE.mark}}>Neap</div>
			<div style={{width: 220 * rule, height: 3, borderRadius: 2, background: COLOR.accent, marginTop: 34}} />
			<div style={{color: COLOR.muted, opacity: p, marginTop: 30, ...TYPE.tagline}}>The tide app for small boats</div>
			<div style={{position: 'absolute', right: 64, bottom: 54, color: COLOR.muted, opacity: p, ...TYPE.credit}}>AI-generated voice</div>
		</AbsoluteFill>
	);
};

// The camera: it drifts with the tide while the light rides it, holds still while the water
// stands, then pushes slowly in towards the afternoon's high water as the voice explains, and holds
// again for the time it names. Holds are where the film rests; they are meant to be still.
const cameraAt = (frame: number) => {
	const drift = lerp(frame, [MOMENT.draw, MOMENT.stops], [0, 1], EASE.inOut);
	const push = lerp(frame, [MOMENT.when, MOMENT.slack + 12], [0, 1], EASE.inOut);
	return {x: -300 * drift, scale: 1 + 0.08 * drift + 0.22 * push};
};

const Camera: React.FC<{children: React.ReactNode}> = ({children}) => {
	const {x, scale} = cameraAt(useCurrentFrame());
	return <AbsoluteFill style={{transform: `translateX(${x}px) scale(${scale})`, transformOrigin: `${xOf(HIGH)}px ${yOf(HIGH)}px`}}>{children}</AbsoluteFill>;
};

export const Neap: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{backgroundColor: COLOR.ground}}>
			<Sea />
			<Camera>
				<Water />
				<Day />
			</Camera>
			<Hero />
			<EndCard />
			<Captions cues={narration.cues} />
			<Grain amount={0.04} />
			{frame >= END.black ? <AbsoluteFill style={{backgroundColor: '#000000'}} /> : null}
			<Audio src={staticFile('films/neap/score.wav')} />
			<Audio src={staticFile('films/neap/narration/narration.wav')} />
		</AbsoluteFill>
	);
};
