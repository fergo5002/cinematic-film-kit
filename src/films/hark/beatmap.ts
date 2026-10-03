// "Who's singing": the example film for Hark, a made-up app that listens to birdsong and names
// every bird that sings. The single source of timing: the scenes AND ./score.mjs import this file,
// so picture and sound cannot drift. Import-free, erasable TypeScript only (Node strips the types).
//
// 24 fps at 120 BPM: a beat is 12 frames (0.5 s), a bar 48 frames (2 s).

export const FPS = 24;
export const BPM = 120;
export const FRAMES_PER_BEAT = (FPS * 60) / BPM; // 12
export const BEATS_PER_BAR = 4;

export const beat = (n: number): number => Math.round(n * FRAMES_PER_BEAT);
export const bar = (n: number): number => beat(n * BEATS_PER_BAR);
export const sec = (frames: number): number => frames / FPS;

export type Section = {id: string; from: number; to: number};

// Movements on GLOBAL film time. Scenes mount on these and return null outside them.
export const SECTIONS: Section[] = [
	{id: 'listen', from: 0, to: bar(1)}, // close on the Hark card: a robin sings and is named
	{id: 'chorus', from: bar(1), to: bar(3.5)}, // five more birds, each named, each flies out to its perch
	{id: 'breath', from: bar(3.5), to: bar(3.75)}, // every bird stops for half a second
	{id: 'untangle', from: bar(3.75), to: bar(6)}, // all six at once; the knot of song pulls apart into six lanes
	{id: 'diary', from: bar(6), to: bar(8)}, // today becomes one column in a month of mornings
	{id: 'mark', from: bar(8), to: bar(11)}, // the robin sings once more and its song becomes the mark
];

export const DURATION: number = SECTIONS[SECTIONS.length - 1].to;

export const section = (id: string): Section => {
	const s = SECTIONS.find((x) => x.id === id);
	if (!s) throw new Error(`Unknown section ${id}`);
	return s;
};

// The six birds, in the order Hark names them. `sing` is when the first phrase starts, `named`
// when its name lands (on a beat, a second apart), `again` when it sings during the untangling
// (one lane a beat). `pan` is where it perches, left to right.
export type Bird = {id: string; name: string; latin: string; seed: number; sing: number; named: number; again: number; pan: number};

export const BIRDS: Bird[] = [
	{id: 'robin', name: 'Robin', latin: 'Erithacus rubecula', seed: 3, sing: beat(0.25), named: beat(3), again: bar(4.25), pan: 0.15},
	{id: 'wren', name: 'Wren', latin: 'Troglodytes troglodytes', seed: 5, sing: bar(1) - beat(0.5), named: bar(1) + beat(1), again: bar(4.5), pan: 0.7},
	{id: 'blackbird', name: 'Blackbird', latin: 'Turdus merula', seed: 0, sing: bar(1) + beat(1.5), named: bar(1) + beat(3), again: bar(4.75), pan: 0.35},
	{id: 'greatTit', name: 'Great tit', latin: 'Parus major', seed: 7, sing: bar(2) - beat(0.25), named: bar(2) + beat(1), again: bar(5), pan: -0.25},
	{id: 'chaffinch', name: 'Chaffinch', latin: 'Fringilla coelebs', seed: 9, sing: bar(2) + beat(1.25), named: bar(2) + beat(3), again: bar(5.25), pan: 0.85},
	{id: 'woodpigeon', name: 'Woodpigeon', latin: 'Columba palumbus', seed: 4, sing: bar(2.5) + beat(0.5), named: bar(3) + beat(1), again: bar(5.5), pan: -0.6},
];

// Named moments: picture and sound both read these.
export const M = {
	line: 0, // "Hark names every bird that sings." from the first frame
	pullBack: beat(3.5), // after the first name the camera eases back to the whole wood
	breath: bar(3.5), // every bird stops
	knot: bar(3.75), // all six sing at once
	lanes: bar(4.25), // the first lane pulls out of the knot; one more each beat
	today: bar(6), // the lanes fold into today's column, over a beat and a half
	diaryLine: bar(6) + beat(1), // "And it keeps a diary of your mornings."
	month: bar(6) + beat(2.5), // the month of mornings fills
	note: bar(7), // one note on the month: the wren's streak
	robinTakeOff: bar(8) - beat(1), // the robin leaves its branch; the camera follows it up into the sky
	robinLands: bar(8) + beat(1.5), // it lands where the mark will be
	robinLast: bar(8) + beat(1.5), // and sings once more, close: its song draws across the sky
	morph: bar(9), // the drawn song settles into the word: hark
	wordmark: bar(9) + beat(2), // the word is whole; the robin's breast goes to full red
	endLine: bar(9) + beat(3), // "Know who's singing."
	silence: bar(10) + beat(3), // the last chord has gone
	end: DURATION,
};

// Audit settings for `npm run audit` and `npm run release`: a dawn film sits in the standard luma band.
export const AUDIT = {profile: 'standard'};
