import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

// Hark is a made-up brand. Its look is a field guide come to life: constructed, flat-colour birds
// and trees with ink outlines under a watercolour dawn. The app itself is a night card, because you
// use it at five in the morning: dark, with each bird's song in its own colour. One saturated
// colour, the robin's red, is kept for the mark at the end. There is no cream ground anywhere.

export const C = {
	ink: '#1D2129', // outlines, and the wordmark on the morning sky: a cool blue-black
	night: '#12161D', // the card
	nightRule: '#2B313B',
	chalk: '#ECEFF2', // text on the card: a cool white, never cream
	chalkSoft: '#A2AAB6',
	leaf: '#5A7A33', // May greens: fresh and yellow, not a sage or a forest green
	leafLight: '#8DAA4E',
	leafDark: '#33481F',
	bark: '#4A4038',
	birch: '#E9E4D8',
	robinRed: '#D9532C', // the one saturated accent: the mark
	robinMuted: '#C27454', // the robin's breast in the wood
} as const;

// Each bird's colour on the night card (its dots, its name, its lane): six hues at a similar
// lightness so no bird outshouts another, all above 7:1 against the card.
export const BIRD_COLOR: Record<string, string> = {
	robin: '#F08155',
	wren: '#DDA07E',
	blackbird: '#E9BE4A',
	greatTit: '#A9CF6E',
	chaffinch: '#EFA3B4',
	woodpigeon: '#A9BEDD',
};

export const FONT = {
	guide: 'Newsreader', // the field guide: bird names, the line
	app: 'Commissioner', // Hark's own interface
} as const;

export const fontsReady = Promise.all([
	loadFont({family: FONT.guide, url: staticFile('fonts/Newsreader.woff2'), weight: '200 800', style: 'normal'}),
	loadFont({family: FONT.guide, url: staticFile('fonts/Newsreader-Italic.woff2'), weight: '200 800', style: 'italic'}),
	loadFont({family: FONT.app, url: staticFile('fonts/Commissioner.woff2'), weight: '100 900'}),
]);

export const srgbToLinear = (hex: string): [number, number, number] => {
	const n = parseInt(hex.slice(1), 16);
	const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
		const s = v / 255;
		return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	});
	return [c[0], c[1], c[2]];
};

export const mix = (a: string, b: string, t: number): string => {
	const pa = parseInt(a.slice(1), 16);
	const pb = parseInt(b.slice(1), 16);
	const ch = (p: number, s: number) => (p >> s) & 255;
	const k = Math.max(0, Math.min(1, t));
	const r = Math.round(ch(pa, 16) + (ch(pb, 16) - ch(pa, 16)) * k);
	const g = Math.round(ch(pa, 8) + (ch(pb, 8) - ch(pa, 8)) * k);
	const bl = Math.round(ch(pa, 0) + (ch(pb, 0) - ch(pa, 0)) * k);
	return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
};
