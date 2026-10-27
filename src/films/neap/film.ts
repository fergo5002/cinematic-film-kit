import {DURATION, FPS} from './beatmap';
import {Neap} from './Neap';

// Every film exports one of these; src/films/registry.ts (written by tools/new-film.mjs) lists them.
export const film = {id: 'neap', title: 'Neap: slack water', component: Neap, durationInFrames: DURATION, fps: FPS, width: 1920, height: 1080};
