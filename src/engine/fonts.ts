import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

// The kit's two bundled faces, both SIL Open Font License (licences beside them in public/fonts).
// @remotion/fonts holds the render until each face has loaded, so no frame can be captured in a
// fallback system font. Both are variable: any weight in the range, and Newsreader also has an
// optical-size axis that the browser sets from the font size.

export const FONT = {
	serif: 'Newsreader', // weights 200 to 800, roman and italic
	sans: 'Commissioner', // weights 100 to 900
} as const;

let pending: Promise<unknown> | null = null;

// Idempotent: call it from as many modules as you like, the faces load once.
export const loadKitFonts = (): Promise<unknown> => {
	pending ??= Promise.all([
		loadFont({family: FONT.serif, url: staticFile('fonts/Newsreader.woff2'), weight: '200 800', style: 'normal'}),
		loadFont({family: FONT.serif, url: staticFile('fonts/Newsreader-Italic.woff2'), weight: '200 800', style: 'italic'}),
		loadFont({family: FONT.sans, url: staticFile('fonts/Commissioner.woff2'), weight: '100 900'}),
	]);
	return pending;
};

export const fontsReady = loadKitFonts();
