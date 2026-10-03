import {FONT} from '../../engine/fonts';

// The film's own tokens. Replace them with the brand's: one dark ground, one light for type and
// line, one muted tone for small print, and ONE accent that is saved for the moment that matters.
// CSS takes these hex values; shaders take srgbToLinear(hex) from src/engine/color.ts.

export const COLOR = {
	ground: '#0F1215', // the frame behind everything
	washLow: '#141A21', // the wash's shadow
	washHigh: '#455569', // the wash's light: a cool slate
	line: '#E9ECEF', // type and the ring
	muted: '#8C96A2', // the caption and the tick marks
	accent: '#E4704F', // the hand's tip, and nothing else
} as const;

export const TYPE = {
	phrase: {fontFamily: FONT.serif, fontWeight: 380, fontSize: 128, letterSpacing: '-0.02em', lineHeight: 1},
	caption: {fontFamily: FONT.sans, fontWeight: 520, fontSize: 25, letterSpacing: '0.18em', lineHeight: 1, textTransform: 'uppercase'},
} as const;
