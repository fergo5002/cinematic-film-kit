import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {FONT} from './fonts';
import {type NarrationCue, cueAt, toFrame} from './narration';

// Burned-in captions from a film's narration (data/narration.json, written by npm run narrate).
// One cue at a time, as the caption files carry them: at most two lines of 42 characters, placed
// in the lower title-safe area, on a plate so they read over any picture. Each cue fades over a
// few frames rather than cutting, and a cue never overlaps the next.
//
//   import narration from './data/narration.json';
//   <Captions cues={narration.cues} />
//
// The same cues ship as out/<id>/<id>.srt and .vtt beside the master, for platforms that show
// their own captions: burn them in only when the film will play muted or the brief asks for it.

type Props = {
	cues: NarrationCue[];
	// distance from the bottom of the frame, in pixels at the film's size
	bottom?: number;
	fontSize?: number;
	color?: string;
	plate?: string;
	fadeFrames?: number;
	style?: React.CSSProperties;
};

export const Captions: React.FC<Props> = ({cues, bottom, fontSize, color = '#F4F1EA', plate = 'rgba(8, 10, 12, 0.62)', fadeFrames = 3, style}) => {
	const frame = useCurrentFrame();
	const {fps, height} = useVideoConfig();
	const cue = cueAt(cues, frame / fps);
	if (!cue) return null;
	const a = toFrame(cue.start, fps);
	const b = toFrame(cue.end, fps);
	const opacity = Math.min(interpolate(frame, [a, a + fadeFrames], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), interpolate(frame, [b - fadeFrames, b], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
	const size = fontSize ?? Math.round(height * 0.04);
	return (
		<AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: bottom ?? Math.round(height * 0.08), pointerEvents: 'none'}}>
			<div
				style={{
					opacity,
					maxWidth: '80%',
					padding: `${Math.round(size * 0.28)}px ${Math.round(size * 0.55)}px`,
					borderRadius: Math.round(size * 0.18),
					background: plate,
					color,
					fontFamily: FONT.sans,
					fontWeight: 480,
					fontSize: size,
					lineHeight: 1.3,
					textAlign: 'center',
					...style,
				}}
			>
				{cue.lines.map((l, i) => (
					<div key={i}>{l}</div>
				))}
			</div>
		</AbsoluteFill>
	);
};
