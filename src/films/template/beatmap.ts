// The template film's single source of timing. Template.tsx AND score.mjs import this file, so
// picture and sound cannot drift. Keep it import-free and use only erasable TypeScript (type
// annotations; no enums, namespaces or parameter properties): Node 22.18+ strips the types, so
// plain `node src/films/template/score.mjs` can load it.
//
// 30 fps at 120 BPM: a beat is 15 frames (0.5 s), a bar is 60 frames (2 s). Put every moment on
// a beat (or a known fraction of one) and the score lands on the same frame by construction.

export const FPS = 30;
export const BPM = 120;
export const FRAMES_PER_BEAT = (FPS * 60) / BPM; // 15
export const BEATS_PER_BAR = 4;

export const beat = (n: number): number => Math.round(n * FRAMES_PER_BEAT);
export const bar = (n: number): number => beat(n * BEATS_PER_BAR);
export const sec = (frames: number): number => frames / FPS;

export type Section = {id: string; from: number; to: number};

// Sections on GLOBAL film time. Scenes mount on these ranges and return null outside them.
// Never mix an offset <Sequence>'s local frames with these global ones.
export const SECTIONS: Section[] = [
	{id: 'draw', from: 0, to: bar(1)}, // the ring draws itself; a chord swells in
	{id: 'words', from: bar(1), to: bar(2)}, // four phrases land, one a beat; the clock starts ticking
	{id: 'hold', from: bar(2), to: bar(3) + beat(1)}, // the words hold to be read while the clock ticks under a riser; then it stops dead
	{id: 'mark', from: bar(3) + beat(1), to: bar(4.5)}, // the hit: the hand comes home, the light flares
];

export const DURATION: number = SECTIONS[SECTIONS.length - 1].to; // 270 frames, 9 s

// Named moments. The score places its sounds on these; the scenes animate from these.
export const M = {
	ringStart: beat(0.5),
	ringDone: bar(1) - beat(0.5),
	words: [bar(1), bar(1) + beat(1), bar(1) + beat(2), bar(1) + beat(3)], // "Picture", "and sound", "share", "one clock."
	ticks: [0, 1, 2, 3, 4, 5, 6, 7].map((k) => bar(1) + beat(k)), // the clock ticks on every beat, 2.0 to 5.5 s
	riser: bar(2) + beat(1),
	breath: bar(3), // the clock stops and the music with it
	hit: bar(3) + beat(1), // and comes back on this frame
	caption: bar(3) + beat(2),
	cut: bar(4.5) - beat(0.5), // cut to black
	end: DURATION,
};

// What the audit should hold this film to (tools/film-audit.mjs reads it). A dark film.
export const AUDIT = {profile: 'dark'};

export const section = (id: string): Section => {
	const s = SECTIONS.find((x) => x.id === id);
	if (!s) throw new Error(`Unknown section ${id}`);
	return s;
};
