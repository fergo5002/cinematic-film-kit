import React from 'react';
import {C} from './theme';

// Constructed birds: each species is an ellipse body, a circle head, a beak, a tail, a folded wing
// and its field marks, in flat colour with an ink outline. Built in units of R, facing right, with
// the feet at the origin. Proportions follow each bird's field guide silhouette: the round upright
// robin, the tiny wren with its cocked tail, the long-tailed blackbird, the big small-headed pigeon.

type Spec = {
	body: {x: number; y: number; rx: number; ry: number; rot: number};
	head: {x: number; y: number; r: number};
	beak: {len: number; w: number; dir: number; color: string};
	tail: {angle: number; len: number; w: number; color: string};
	wing: {from: [number, number]; to: [number, number]; bulge: number; color: string};
	back: string; // upperparts
	under: string; // belly
	legs: number;
	marks: (breast?: string) => React.ReactNode; // field marks, drawn over the body and head
	flightWing: string;
};


export const SPECS: Record<string, Spec> = {
	robin: {
		body: {x: 0, y: -1.3, rx: 1.05, ry: 0.95, rot: -25},
		head: {x: 0.62, y: -2.15, r: 0.6},
		beak: {len: 0.42, w: 0.1, dir: 12, color: '#2A2724'},
		tail: {angle: 142, len: 1.05, w: 0.36, color: '#7E6E52'},
		wing: {from: [0.25, -1.75], to: [-1.0, -0.95], bulge: 0.35, color: '#7E6E52'},
		back: '#8B7B5E',
		under: '#EDE6D6',
		legs: 0.55,
		marks: (breast) => <path d="M 1.17 -2.25 C 1.25 -1.8 1.05 -1.05 0.55 -0.55 C 0.3 -0.42 0.05 -0.5 -0.05 -0.75 C 0.1 -1.3 0.35 -1.7 0.5 -2.05 C 0.62 -2.35 0.95 -2.55 1.17 -2.25 Z" fill={breast ?? C.robinMuted} />,
		flightWing: '#7E6E52',
	},
	wren: {
		body: {x: 0, y: -1.0, rx: 0.95, ry: 0.75, rot: -5},
		head: {x: 0.78, y: -1.45, r: 0.5},
		beak: {len: 0.5, w: 0.07, dir: 8, color: '#3A2F27'},
		tail: {angle: 232, len: 1.0, w: 0.3, color: '#7A5A3A'},
		wing: {from: [0.3, -1.25], to: [-0.75, -0.85], bulge: 0.28, color: '#7A5A3A'},
		back: '#8E6A45',
		under: '#CFAE9A',
		legs: 0.35,
		marks: () => (
			<g stroke="#4B3A28" strokeWidth={0.05} strokeLinecap="round" fill="none">
				{[0, 1, 2, 3].map((i) => (
					<line key={i} x1={-0.55 + i * 0.22} y1={-1.2} x2={-0.65 + i * 0.22} y2={-0.95} />
				))}
				<path d="M 0.55 -1.68 Q 0.85 -1.85 1.12 -1.62" stroke="#E9DCC0" strokeWidth={0.07} />
			</g>
		),
		flightWing: '#7A5A3A',
	},
	blackbird: {
		body: {x: 0, y: -1.3, rx: 1.35, ry: 0.85, rot: -12},
		head: {x: 1.15, y: -1.95, r: 0.52},
		beak: {len: 0.58, w: 0.13, dir: 6, color: '#E0A82E'},
		tail: {angle: 162, len: 1.75, w: 0.42, color: '#232624'},
		wing: {from: [0.6, -1.65], to: [-1.25, -1.0], bulge: 0.3, color: '#3A3F3C'},
		back: '#2C302E',
		under: '#2C302E',
		legs: 0.6,
		marks: () => <circle cx={1.32} cy={-2.02} r={0.13} fill="none" stroke="#E0A82E" strokeWidth={0.06} />,
		flightWing: '#3A3F3C',
	},
	greatTit: {
		body: {x: 0, y: -1.2, rx: 1.0, ry: 0.85, rot: -15},
		head: {x: 0.78, y: -1.95, r: 0.55},
		beak: {len: 0.3, w: 0.09, dir: 6, color: '#222'},
		tail: {angle: 152, len: 1.15, w: 0.32, color: '#5E6E7E'},
		wing: {from: [0.3, -1.6], to: [-0.95, -0.95], bulge: 0.3, color: '#6E7F8F'},
		back: '#7C8C4E',
		under: '#D9B53A',
		legs: 0.5,
		marks: () => (
			<g>
				<circle cx={0.78} cy={-1.95} r={0.55} fill="#1F1F1D" />
				<ellipse cx={0.92} cy={-1.82} rx={0.28} ry={0.2} fill="#FFFFFF" />
				<path d="M 0.62 -1.42 C 0.55 -1.05 0.4 -0.75 0.2 -0.5 C 0.28 -0.85 0.38 -1.15 0.45 -1.45 Z" fill="#1F1F1D" />
				<line x1={-0.3} y1={-1.25} x2={-0.75} y2={-1.05} stroke="#FFFFFF" strokeWidth={0.07} strokeLinecap="round" />
			</g>
		),
		flightWing: '#6E7F8F',
	},
	chaffinch: {
		body: {x: 0, y: -1.2, rx: 1.05, ry: 0.85, rot: -15},
		head: {x: 0.8, y: -1.9, r: 0.55},
		beak: {len: 0.38, w: 0.16, dir: 10, color: '#8B98A6'},
		tail: {angle: 153, len: 1.2, w: 0.34, color: '#3D3A37'},
		wing: {from: [0.3, -1.6], to: [-1.0, -0.95], bulge: 0.32, color: '#3D3A37'},
		back: '#8C6A55',
		under: '#C08C79',
		legs: 0.5,
		marks: () => (
			<g>
				<path d="M 0.3 -2.15 C 0.5 -2.55 1.05 -2.55 1.28 -2.1 C 1.05 -2.2 0.7 -2.1 0.42 -1.85 Z" fill="#7D8FA3" />
				<path d="M 0.62 -1.55 C 0.95 -1.45 1.1 -1.05 0.75 -0.6 C 0.45 -0.4 0.1 -0.5 0.0 -0.8 C 0.2 -1.1 0.4 -1.35 0.62 -1.55 Z" fill="#C08C79" />
				<line x1={-0.15} y1={-1.38} x2={-0.55} y2={-1.15} stroke="#FFFFFF" strokeWidth={0.09} strokeLinecap="round" />
				<line x1={-0.4} y1={-1.2} x2={-0.8} y2={-0.98} stroke="#FFFFFF" strokeWidth={0.07} strokeLinecap="round" />
			</g>
		),
		flightWing: '#3D3A37',
	},
	woodpigeon: {
		body: {x: 0, y: -1.4, rx: 1.6, ry: 1.0, rot: 2},
		head: {x: 1.55, y: -2.05, r: 0.42},
		beak: {len: 0.32, w: 0.08, dir: 14, color: '#D9A7A0'},
		tail: {angle: 172, len: 1.6, w: 0.5, color: '#6F7885'},
		wing: {from: [0.7, -1.8], to: [-1.4, -1.15], bulge: 0.38, color: '#77818E'},
		back: '#8E97A3',
		under: '#A98F98',
		legs: 0.35,
		marks: () => (
			<g>
				<ellipse cx={1.15} cy={-1.75} rx={0.2} ry={0.12} fill="#F0EDE6" transform="rotate(-30 1.15 -1.75)" />
				<path d="M 1.0 -1.95 Q 1.25 -1.55 1.6 -1.7" stroke="#5E8C84" strokeWidth={0.08} fill="none" strokeLinecap="round" />
				<line x1={0.1} y1={-1.35} x2={-0.6} y2={-1.05} stroke="#F0EDE6" strokeWidth={0.09} strokeLinecap="round" />
			</g>
		),
		flightWing: '#77818E',
	},
};

const rad = (d: number) => (d * Math.PI) / 180;

// A point on the body ellipse at parametric angle a (degrees), in local units
const onBody = (s: Spec, a: number): [number, number] => {
	const {x, y, rx, ry, rot} = s.body;
	const px = rx * Math.cos(rad(a));
	const py = ry * Math.sin(rad(a));
	return [x + px * Math.cos(rad(rot)) - py * Math.sin(rad(rot)), y + px * Math.sin(rad(rot)) + py * Math.cos(rad(rot))];
};

export type BirdPose = {
	fly?: number; // 0 perched, 1 flying
	flap?: number; // wing phase in turns while flying
	sing?: number; // 0 closed, 1 beak open
	headTilt?: number; // degrees, positive looks up
};

export const Bird: React.FC<{species: string; x: number; y: number; scale: number; face?: 1 | -1; pose?: BirdPose; opacity?: number; R?: number; breast?: string; outline?: string}> = ({
	species,
	x,
	y,
	scale,
	face = 1,
	pose = {},
	opacity = 1,
	R = 20,
	breast,
	outline = C.ink,
}) => {
	const s = SPECS[species];
	const {fly = 0, flap = 0, sing = 0, headTilt = 0} = pose;
	const k = R * scale;

	// tail: from two points on the rear of the body to a squared tip
	const tA = onBody(s, 180 + 22);
	const tB = onBody(s, 180 - 18);
	const ta = rad(s.tail.angle - fly * 15 * Math.sign(Math.cos(rad(s.tail.angle))));
	const tc: [number, number] = [(tA[0] + tB[0]) / 2 + Math.cos(ta) * s.tail.len, (tA[1] + tB[1]) / 2 + Math.sin(ta) * s.tail.len];
	const perp: [number, number] = [-Math.sin(ta) * s.tail.w, Math.cos(ta) * s.tail.w];
	const tail = `M ${tA[0]} ${tA[1]} L ${tc[0] + perp[0]} ${tc[1] + perp[1]} L ${tc[0] - perp[0]} ${tc[1] - perp[1]} L ${tB[0]} ${tB[1]} Z`;

	// beak: two halves that part when singing
	const h = s.head;
	const bd = rad(s.beak.dir - headTilt);
	const bx = h.x + Math.cos(bd) * h.r * 0.92;
	const by = h.y + Math.sin(bd) * h.r * 0.92;
	const open = sing * 0.22;
	const upper = `M ${bx - Math.sin(bd) * s.beak.w} ${by + Math.cos(bd) * -s.beak.w} L ${bx + Math.cos(bd - open) * s.beak.len} ${by + Math.sin(bd - open) * s.beak.len} L ${bx} ${by} Z`;
	const lower = `M ${bx} ${by} L ${bx + Math.cos(bd + open) * s.beak.len} ${by + Math.sin(bd + open) * s.beak.len} L ${bx + Math.sin(bd) * s.beak.w} ${by + Math.cos(bd) * s.beak.w} Z`;

	// folded wing: a lens from shoulder to tip
	const [w0x, w0y] = s.wing.from;
	const [w1x, w1y] = s.wing.to;
	const nx = -(w1y - w0y);
	const ny = w1x - w0x;
	const nl = Math.hypot(nx, ny);
	const bulge = s.wing.bulge;
	const wing = `M ${w0x} ${w0y} Q ${(w0x + w1x) / 2 + (nx / nl) * bulge} ${(w0y + w1y) / 2 + (ny / nl) * bulge} ${w1x} ${w1y} Q ${(w0x + w1x) / 2 - (nx / nl) * bulge * 0.35} ${(w0y + w1y) / 2 - (ny / nl) * bulge * 0.35} ${w0x} ${w0y} Z`;

	// flight wings: a blade from the shoulder that swings from above the back to below the belly
	const sh = onBody(s, -60);
	const span = s.body.rx * 1.75;
	const wingBlade = (far: boolean) => {
		const ph = Math.cos(flap * Math.PI * 2 + (far ? 0.35 : 0)); // 1 = up, -1 = down
		const tipX = sh[0] - span * 0.45;
		const tipY = sh[1] - span * ph * (far ? 0.85 : 1);
		const midX = sh[0] - span * 0.15;
		const midY = sh[1] - span * ph * 0.55;
		const w = 0.32;
		return `M ${sh[0] + w} ${sh[1]} Q ${midX + w} ${midY} ${tipX} ${tipY} Q ${midX - w * 1.6} ${midY + w * ph} ${sh[0] - w * 1.6} ${sh[1] + 0.05} Z`;
	};

	const lean = -fly * (s.body.rot * 0.8);
	const W0 = 0.085; // outline width, in R
	const bodyEl = (props: React.SVGProps<SVGEllipseElement>) => (
		<ellipse cx={s.body.x} cy={s.body.y} rx={s.body.rx} ry={s.body.ry} transform={`rotate(${s.body.rot} ${s.body.x} ${s.body.y})`} {...props} />
	);
	const headT = `rotate(${-headTilt} ${h.x} ${h.y})`;
	// the silhouette: drawn once fat in ink, then again in colour, so only its outer edge shows
	const silhouette = (ink: boolean) => (
		<g>
			<path d={tail} fill={ink ? outline : s.tail.color} stroke={ink ? outline : 'none'} strokeWidth={W0 * 2} strokeLinejoin="round" />
			{bodyEl({fill: ink ? outline : s.back, stroke: ink ? outline : 'none', strokeWidth: W0 * 2})}
			<g transform={headT}>
				<path d={upper} fill={ink ? outline : s.beak.color} stroke={ink ? outline : 'none'} strokeWidth={W0 * 1.2} strokeLinejoin="round" />
				<path d={lower} fill={ink ? outline : s.beak.color} stroke={ink ? outline : 'none'} strokeWidth={W0 * 1.2} strokeLinejoin="round" />
				<circle cx={h.x} cy={h.y} r={h.r} fill={ink ? outline : s.back} stroke={ink ? outline : 'none'} strokeWidth={W0 * 2} />
			</g>
		</g>
	);
	const clipId = `sil-${species}`;
	return (
		<g transform={`translate(${x} ${y}) scale(${face * k} ${k})`} opacity={opacity}>
			<defs>
				<clipPath id={clipId}>
					{bodyEl({})}
					<circle cx={h.x} cy={h.y} r={h.r} transform={headT} />
				</clipPath>
			</defs>
			<g transform={`rotate(${lean} 0 ${s.body.y})`}>
				{fly > 0.01 ? <path d={wingBlade(true)} fill={s.flightWing} stroke={C.ink} strokeWidth={W0} strokeLinejoin="round" opacity={fly} /> : null}
				{fly < 0.99 ? (
					<g opacity={1 - fly} stroke={C.ink} strokeWidth={W0} strokeLinecap="round">
						<line x1={0.12} y1={0} x2={0.05} y2={-s.legs} />
						<line x1={-0.18} y1={0} x2={-0.15} y2={-s.legs} />
					</g>
				) : null}
				{silhouette(true)}
				{silhouette(false)}
				<g clipPath={`url(#${clipId})`}>
					<ellipse cx={s.body.x + 0.25} cy={s.body.y + s.body.ry * 0.62} rx={s.body.rx * 0.95} ry={s.body.ry * 0.62} fill={s.under} />
					<g transform={headT}>{s.marks(breast)}</g>
				</g>
				{fly < 0.99 ? <path d={wing} fill={s.wing.color} stroke={C.ink} strokeWidth={W0 * 0.8} strokeLinejoin="round" opacity={1 - fly} /> : null}
				<g transform={headT}>
					<circle cx={h.x + h.r * 0.35} cy={h.y - h.r * 0.12} r={0.075} fill={species === 'blackbird' || species === 'greatTit' ? '#FFFFFF' : C.ink} />
					{species === 'blackbird' || species === 'greatTit' ? <circle cx={h.x + h.r * 0.35} cy={h.y - h.r * 0.12} r={0.045} fill={C.ink} /> : null}
				</g>
				{fly > 0.01 ? <path d={wingBlade(false)} fill={s.flightWing} stroke={C.ink} strokeWidth={W0} strokeLinejoin="round" opacity={fly} /> : null}
			</g>
		</g>
	);
};
