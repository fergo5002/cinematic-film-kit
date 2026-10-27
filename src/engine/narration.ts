// Reading a film's narration from the picture. `npm run narrate -- <id>` writes
// src/films/<id>/data/narration.json; import it in the film and time the picture from the voice:
//
//   import narration from './data/narration.json';
//   const stops = toFrame(wordAt(narration.words, 'stops').start, fps); // the frame "stops" begins
//
// Every time here is film seconds (the voice is placed at the beatmap's NARRATION.at). Import-free
// and erasable TypeScript, so the kit's Node tests can load it too.

export type NarrationWord = {text: string; start: number; end: number; line: number; source: string};
export type NarrationCue = {start: number; end: number; lines: string[]};
export type NarrationData = {voice: string; disclosure: string; duration: number; words: NarrationWord[]; cues: NarrationCue[]};

const bare = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// The nth (from 0) spoken word whose letters match `text`, ignoring case and punctuation. Throws
// when there is none, so a script edit that removes a word the picture keys on fails loudly at
// render time instead of silently moving a cut.
export const wordAt = (words: NarrationWord[], text: string, nth = 0): NarrationWord => {
	const hits = words.filter((w) => bare(w.text) === bare(text));
	const w = hits[nth];
	if (!w) throw new Error(`the narration has ${hits.length ? `only ${hits.length}` : 'no'} "${text}"${hits.length ? `, not number ${nth + 1}` : ''}: update the film after editing narration.txt`);
	return w;
};

// The caption cue on screen at `seconds`, or null between cues.
export const cueAt = (cues: NarrationCue[], seconds: number): NarrationCue | null => cues.find((c) => seconds >= c.start && seconds < c.end) ?? null;

export const toFrame = (seconds: number, fps: number): number => Math.round(seconds * fps);
