import {FONT} from '../../engine/fonts';

// Neap's tokens: the sea at dusk, one light for line and type, and the amber of a harbour light
// saved for the moment that matters (the marker, and then the time it stops at).
export const COLOR = {
	ground: '#081114',
	washLow: '#0B1A1F',
	washHigh: '#2C5560',
	line: '#E6EDEE',
	muted: '#8EA3A8',
	faint: '#4C6970',
	accent: '#EDB45C',
} as const;

export const TYPE = {
	label: {fontFamily: FONT.sans, fontWeight: 540, fontSize: 30, letterSpacing: '0.08em', lineHeight: 1},
	kicker: {fontFamily: FONT.sans, fontWeight: 560, fontSize: 26, letterSpacing: '0.2em', lineHeight: 1, textTransform: 'uppercase'},
	hero: {fontFamily: FONT.serif, fontWeight: 360, fontSize: 220, letterSpacing: '-0.02em', lineHeight: 1},
	mark: {fontFamily: FONT.serif, fontWeight: 420, fontSize: 168, letterSpacing: '-0.015em', lineHeight: 1},
	credit: {fontFamily: FONT.sans, fontWeight: 480, fontSize: 20, letterSpacing: '0.12em', lineHeight: 1, textTransform: 'uppercase'},
	tagline: {fontFamily: FONT.sans, fontWeight: 460, fontSize: 34, letterSpacing: '0.01em', lineHeight: 1},
} as const;
