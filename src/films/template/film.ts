import {DURATION, FPS} from './beatmap';
import {Template} from './Template';

// Every film exports one of these; src/films/registry.ts (written by tools/new-film.mjs) lists them.
export const film = {id: 'template', title: 'Template', component: Template, durationInFrames: DURATION, fps: FPS, width: 1920, height: 1080};
