import React from 'react';
import {Easing, useCurrentFrame} from 'remotion';
import {BIRDS, M} from './beatmap';
import {Bird} from './Bird';
import {tagAnchor} from './Card';
import {PHRASES} from './spectra';
import {CARD, MARK, PANEL_Y, PERCH, robinFlight} from './world';

// Every bird is born from its own name: the moment Hark names it, it lifts out of the card at the
// tag and flies to its perch. Once perched it opens its beak whenever its song is playing, so the
// picture and the sound agree to the frame. At the end the robin flies up to become the mark.

const LIFT = 6; // frames after the name lands
const FLY = 22;
const INOUT = Easing.bezier(0.45, 0, 0.25, 1);

const bez = (p0: number[], c: number[], p1: number[], t: number) => [
	(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0],
	(1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1],
];

type Flight = {from: number[]; ctrl: number[]; to: number[]; f0: number; f1: number; s0: number; s1: number};

const cardFlight = (id: string): Flight => {
	const b = BIRDS.find((x) => x.id === id)!;
	const f0 = b.named + LIFT;
	const [tx, ty] = tagAnchor(f0, id);
	const from = [CARD.x + CARD.pad + tx, CARD.y + PANEL_Y + ty];
	const p = PERCH[id];
	const to = [p.x, p.y];
	const ctrl = [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - 240];
	return {from, ctrl, to, f0, f1: f0 + FLY, s0: 0.35, s1: p.size};
};

const robinUp = (): Flight => {
	const r = robinFlight(M.robinTakeOff);
	return {from: r.from, ctrl: r.ctrl, to: r.to, f0: M.robinTakeOff, f1: M.robinLands, s0: PERCH.robin.size, s1: MARK.robinScale};
};

const singing = (id: string, frame: number) => {
	const t = frame / 24;
	const ph = PHRASES.find((p) => p.bird === id && p.role !== 'first' && t >= p.t0 && t <= p.t1 + 0.05);
	if (!ph) return 0;
	return 0.55 + 0.45 * Math.abs(Math.sin(frame * 1.9));
};

const FlyingBird: React.FC<{id: string; fl: Flight; frame: number; face: 1 | -1; breast?: string}> = ({id, fl, frame, face, breast}) => {
	const at = (f: number) => {
		const u = Math.max(0, Math.min(1, (f - fl.f0) / (fl.f1 - fl.f0)));
		const e = INOUT(u);
		return {u, pos: bez(fl.from, fl.ctrl, fl.to, e)};
	};
	const {u, pos} = at(frame);
	const prev = at(frame - 1).pos;
	const dir: 1 | -1 = pos[0] - prev[0] >= 0 ? 1 : -1;
	const grow = Math.min(1, u / 0.35);
	const scale = fl.s0 + (fl.s1 - fl.s0) * (grow * grow * (3 - 2 * grow));
	const fly = u < 0.82 ? 1 : 1 - (u - 0.82) / 0.18;
	const flapRate = id === 'woodpigeon' ? 7 : 5;
	const pose = {fly, flap: (frame - fl.f0) / flapRate};
	const ghosts = [2, 1];
	return (
		<g>
			{u < 0.9 && scale > 1.5
				? ghosts.map((g) => {
						const gp = at(frame - g).pos;
						return <Bird key={g} species={id} x={gp[0]} y={gp[1]} scale={scale} face={u > 0.85 ? face : dir} pose={{...pose, flap: (frame - g - fl.f0) / flapRate}} opacity={(0.1 + 0.08 * (2 - g)) / Math.max(1, scale)} breast={breast} />;
					})
				: null}
			<Bird species={id} x={pos[0]} y={pos[1]} scale={scale} face={u > 0.85 ? face : dir} pose={pose} breast={breast} />
		</g>
	);
};

export const Flock: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
			{BIRDS.map((b) => {
				const fl = cardFlight(b.id);
				const p = PERCH[b.id];
				if (frame < fl.f0) return null;
				if (b.id === 'robin' && frame >= M.robinTakeOff) {
					if (frame >= M.robinLands) return null; // the mark draws the robin from here
					return <FlyingBird key={b.id} id="robin" fl={robinUp()} frame={frame} face={1} />;
				}
				if (frame < fl.f1) return <FlyingBird key={b.id} id={b.id} fl={fl} frame={frame} face={p.face} />;
				const idle = 4 * Math.sin(frame / 13 + b.seed);
				const sing = singing(b.id, frame);
				return <Bird key={b.id} species={b.id} x={p.x} y={p.y} scale={p.size} face={p.face} pose={{sing, headTilt: idle + sing * 12}} />;
			})}
		</svg>
	);
};
