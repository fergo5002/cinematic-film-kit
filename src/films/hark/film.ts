import {DURATION, FPS} from './beatmap';
import {Hark} from './Hark';
import {BirdSheet} from './tests/BirdSheet';

// Every film exports one of these; src/films/registry.ts (written by tools/new-film.mjs) lists them.
// `extras` are extra compositions for Studio only: here, a sheet of every bird in every pose.
export const film = {
	id: 'hark',
	title: "Hark: Who's singing",
	component: Hark,
	durationInFrames: DURATION,
	fps: FPS,
	width: 1920,
	height: 1080,
	extras: [{id: 'hark-bird-sheet', component: BirdSheet, durationInFrames: 1, fps: 24, width: 1920, height: 1080}],
};
