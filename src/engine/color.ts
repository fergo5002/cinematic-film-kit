// Colour helpers. CSS takes sRGB hex; shaders and three.js lighting maths want LINEAR values.
// Feeding hex values straight into a shader that then applies a transfer curve washes everything
// out, which is the commonest reason a shader's colours do not match the rest of the frame.

const channels = (hex: string): [number, number, number] => {
	const h = hex.replace('#', '');
	const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
	const n = parseInt(full, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Exact sRGB transfer, not a 2.2 power: the same curve the browser and the encoder assume.
export const srgbToLinear = (hex: string): [number, number, number] => {
	const [r, g, b] = channels(hex).map((v) => {
		const s = v / 255;
		return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	});
	return [r, g, b];
};

// Mix two hex colours in sRGB space, t from 0 to 1 (clamped). For a gradient that must look even,
// mix the linear values instead.
export const mixHex = (a: string, b: string, t: number): string => {
	const ca = channels(a);
	const cb = channels(b);
	const k = Math.max(0, Math.min(1, t));
	const out = ca.map((v, i) => Math.round(v + (cb[i] - v) * k));
	return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
