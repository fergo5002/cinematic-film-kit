// Neap's timing. A narrated film times its picture from the voice, so this file holds only what the
// voice cannot: the frame rate, the length, where the voice starts and how the film ends. Every
// other moment comes from the word timings in data/narration.json (see moments.ts), so re-voicing
// the script moves the picture with it. Import-free and erasable TypeScript, like every beatmap:
// score.mjs and the kit's tools load it with plain Node.

export const FPS = 30;

// Where the voice starts (frame 66, 2.2 s, after the sea has been heard alone) and how it speaks.
// npm run narrate -- neap reads this.
export const NARRATION = {voice: 'af_heart', speed: 0.92, at: 66};

// The last word ends about 17.5 s in; the music opens up over the end card after it, then the film
// cuts to black.
export const DURATION: number = 30 * 21; // 630 frames
export const END = {
	close: 0.75, // seconds after the last word: the music takes the room, the end card's line draws
	black: DURATION - 12, // the last 0.4 s are black, after the bed has faded
};

export type Section = {id: string; from: number; to: number};
// Coarse sections for Studio and the audit. Scenes key on words, not on these.
export const SECTIONS: Section[] = [
	{id: 'sea', from: 0, to: 66},
	{id: 'tide', from: 66, to: 30 * 8},
	{id: 'when', from: 30 * 8, to: 30 * 16},
	{id: 'end', from: 30 * 16, to: DURATION},
];

// Named moments the kit's tools can read. The film's own moments are in moments.ts.
export const M = {black: END.black, end: DURATION};

// A dark film, measured as one.
export const AUDIT = {profile: 'dark'};
