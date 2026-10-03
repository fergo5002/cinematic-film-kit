// Deterministic randomness. Never call Math.random() in a film: frame-by-frame QA is worthless if
// a re-render produces different pixels. Every particle's state is a pure function of
// (seed, index, frame), never accumulated across frames.

export const mulberry32 = (seed: number) => {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

// Stateless hash to [0, 1): use when you need "random" per (seed, i) without a generator.
export const hash01 = (seed: number, i: number): number => {
	let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(i + 0x632be5ab, 0xc2b2ae35);
	h ^= h >>> 16;
	h = Math.imul(h, 0x7feb352d);
	h ^= h >>> 15;
	h = Math.imul(h, 0x846ca68b);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
};

export const range = (seed: number, i: number, min: number, max: number): number =>
	min + hash01(seed, i) * (max - min);
