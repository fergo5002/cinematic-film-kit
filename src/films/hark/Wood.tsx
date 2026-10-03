import React from 'react';
import {useCurrentFrame} from 'remotion';
import {mix} from './theme';
import {dawnAt} from './Sky';
import {GROUND_Y} from './world';

// The wood: constructed trees, each built around the branch a bird will land on, drawn like a
// printed field-guide plate: an ink line over a wash that sits a few pixels off it. Before dawn everything sits close to a blue silhouette; it takes its colour as the light comes.

const NIGHT = '#141B26';
const tint = (hex: string, dawn: number) => mix(hex, NIGHT, 0.66 * (1 - dawn));

type Circle = [number, number, number];
const CANOPY_A: Circle[] = [[250, 130, 105], [330, 215, 150], [470, 125, 128], [205, 335, 108], [622, 150, 96], [140, 210, 90]];
const CANOPY_B: Circle[] = [[1206, 245, 96], [1276, 300, 66], [1135, 268, 58]];
const LEAVES_C: Circle[] = [[1462, 330, 34], [1556, 382, 40], [1470, 468, 30], [1548, 522, 27], [1528, 280, 24]];
const CANOPY_D: Circle[] = [[1753, 262, 142], [1627, 330, 70], [1775, 430, 80]];
const BUSH: Circle[] = [[1510, 942, 74], [1592, 926, 70], [1642, 962, 56], [1560, 906, 50], [1456, 975, 46]];
const FAR: Circle[] = Array.from({length: 22}, (_, i) => [-200 + i * 112, 905 + ((i * 37) % 50), 62 + ((i * 53) % 40)] as Circle);

const poly = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ') + ' Z';
const line = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ');

export const Wood: React.FC = () => {
	const frame = useCurrentFrame();
	const dawn = dawnAt(frame);
	const t = (hex: string) => tint(hex, dawn);
	const OUT = {stroke: t('#1D2129'), strokeWidth: 2.2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const};
	const circles = (cs: Circle[], fills: string[], ink = true) =>
		cs.map(([x, y, r], i) => (
			<g key={i}>
				<circle cx={x - 4} cy={y + 3} r={r} fill={t(fills[i % fills.length])} />
				{ink ? <circle cx={x} cy={y} r={r} fill="none" stroke={t('#1D2129')} strokeWidth={2} opacity={0.85} /> : null}
			</g>
		));
	return (
		<svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
			{/* the far wood: soft, lighter, no outlines */}
			<g opacity={0.9}>{circles(FAR, ['#5F7466', '#6B7F70', '#56695C'], false)}</g>
			{/* tree A, behind the card: the woodpigeon's limb */}
			{circles(CANOPY_A, ['#33481F', '#41592A', '#2C3E1B', '#5A7A33'])}
			<path d={poly([[408, 1012], [472, 1012], [463, 700], [452, 430], [441, 430], [424, 700]])} fill={t('#4A4038')} {...OUT} />
			<path d={line([[452, 520], [500, 392], [560, 343], [700, 300]])} fill="none" stroke={t('#4A4038')} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
			{/* tree B: the great tit's branch and the robin's */}
			{circles(CANOPY_B, ['#5A7A33', '#6C8C3E', '#41592A'])}
			<path d={poly([[1184, 1012], [1218, 1012], [1209, 600], [1201, 300], [1194, 300], [1190, 600]])} fill={t('#574A3F')} {...OUT} />
			<path d={line([[1199, 395], [1150, 352], [1098, 337], [1046, 334]])} fill="none" stroke={t('#574A3F')} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
			<path d={line([[1206, 700], [1262, 646], [1336, 638]])} fill="none" stroke={t('#574A3F')} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
			{/* tree C, a birch: the blackbird sings from its very top */}
			{circles(LEAVES_C, ['#9DBA58', '#8DAA4E', '#AFC66C'])}
			<path d={poly([[1490, 1012], [1517, 1012], [1512, 600], [1510, 222], [1506, 222], [1494, 600]])} fill={t('#E3DED2')} {...OUT} />
			{[300, 360, 430, 505, 590, 680, 760, 850, 930].map((y, i) => (
				<line key={y} x1={1496 + (i % 2) * 6} y1={y} x2={1506 + (i % 2) * 6} y2={y + 2} stroke={t('#2B2F2D')} strokeWidth={3} strokeLinecap="round" />
			))}
			<path d={line([[1488, 217], [1508, 214], [1530, 216]])} fill="none" stroke={t('#3B3A36')} strokeWidth={5} strokeLinecap="round" />
			{/* tree D at the right edge: the chaffinch's twig */}
			{circles(CANOPY_D, ['#41592A', '#5A7A33', '#33481F'])}
			<path d={poly([[1699, 1012], [1743, 1012], [1731, 600], [1721, 280], [1711, 280], [1695, 600]])} fill={t('#4A4038')} {...OUT} />
			<path d={line([[1713, 505], [1660, 459], [1611, 452]])} fill="none" stroke={t('#4A4038')} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
			{/* the bush and the wren's twig */}
			{circles(BUSH, ['#41592A', '#5A7A33', '#33481F', '#6C8C3E'])}
			<path d={line([[1526, 912], [1564, 880], [1594, 874]])} fill="none" stroke={t('#3B3A36')} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
			{/* the ground */}
			<rect x={-600} y={GROUND_Y - 8} width={3200} height={420} fill={t('#2C3F1F')} />
			{Array.from({length: 60}, (_, i) => {
				const x = -300 + i * 44 + ((i * 17) % 13);
				return <line key={i} x1={x} y1={GROUND_Y - 6} x2={x + 6} y2={GROUND_Y - 20 - ((i * 29) % 12)} stroke={t('#41592A')} strokeWidth={3} strokeLinecap="round" />;
			})}
		</svg>
	);
};
