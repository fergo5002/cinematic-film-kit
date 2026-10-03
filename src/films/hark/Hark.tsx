import {Audio} from '@remotion/media';
import React from 'react';
import {AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {M, beat} from './beatmap';
import {Card} from './Card';
import {Flock} from './Flock';
import {Mark} from './Mark';
import {Sky} from './Sky';
import {C, FONT, fontsReady} from './theme';
import {Wood} from './Wood';
import {camera} from './world';

// "Who's singing": the example film for the kit. One continuous shot: close on the Hark card as a
// robin is named, back to the whole wood as five more birds are named and fly to their branches,
// in on the card as the full chorus pulls apart, and up into the sky where the robin's song
// becomes the word. Every dot on the card is computed from the soundtrack (see score.mjs).

void fontsReady;
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const RISE = Easing.bezier(0.16, 1, 0.3, 1);

const LINES = ['Hark names', 'every bird', 'that sings.'];

const OpeningLine: React.FC = () => {
	const frame = useCurrentFrame();
	// slop-lint-ignore no-linear-motion -- the line's opacity as the camera pulls back, not motion
	const out = interpolate(frame, [M.pullBack + beat(0.5), M.pullBack + beat(2)], [1, 0], clamp);
	if (out <= 0) return null;
	return (
		<div style={{position: 'absolute', left: 80, top: 360, opacity: out}}>
			{LINES.map((l, i) => {
				const t = interpolate(frame, [M.line + i * 3, M.line + i * 3 + 14], [0, 1], {...clamp, easing: RISE});
				return (
					<div key={l} style={{overflow: 'hidden', height: 86}}>
						<div
							style={{
								transform: `translateY(${(1 - t) * 86}px)`,
								fontFamily: FONT.guide,
								fontWeight: 440,
								fontSize: 66,
								lineHeight: '86px',
								letterSpacing: '-0.012em',
								color: C.chalk,
								fontVariationSettings: '"opsz" 72',
							}}
						>
							{l}
						</div>
					</div>
				);
			})}
		</div>
	);
};

const DIARY = ['And it keeps', 'a diary of', 'your mornings.'];

const DiaryLine: React.FC = () => {
	const frame = useCurrentFrame();
	// slop-lint-ignore no-linear-motion -- the line's opacity as the camera leaves for the sky, not motion
	const out = interpolate(frame, [M.robinTakeOff - beat(0.5), M.robinTakeOff + beat(0.5)], [1, 0], clamp);
	if (frame < M.diaryLine || out <= 0) return null;
	return (
		<div style={{position: 'absolute', left: 72, top: 360, opacity: out}}>
			{DIARY.map((l, i) => {
				const t = interpolate(frame, [M.diaryLine + i * 3, M.diaryLine + i * 3 + 14], [0, 1], {...clamp, easing: RISE});
				return (
					<div key={l} style={{overflow: 'hidden', height: 70}}>
						<div style={{transform: `translateY(${(1 - t) * 70}px)`, fontFamily: FONT.guide, fontWeight: 450, fontSize: 52, lineHeight: '70px', letterSpacing: '-0.01em', color: C.ink, fontVariationSettings: '"opsz" 52'}}>
							{l}
						</div>
					</div>
				);
			})}
		</div>
	);
};

export const Hark: React.FC = () => {
	const frame = useCurrentFrame();
	const cam = camera(frame);
	return (
		<AbsoluteFill style={{backgroundColor: C.night}}>
			<Sky />
			<AbsoluteFill style={{transformOrigin: '0 0', transform: `translate(960px, 540px) scale(${cam.s}) translate(${-cam.cx}px, ${-cam.cy}px)`}}>
				<Wood />
				<Card />
				<Flock />
				<Mark />
			</AbsoluteFill>
			<OpeningLine />
			<DiaryLine />
			<Audio src={staticFile('films/hark/score.wav')} />
		</AbsoluteFill>
	);
};
