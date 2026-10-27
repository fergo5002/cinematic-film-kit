// A minimal mono 32-bit float WAV writer, for the intermediate 24 kHz stem.
import {writeFileSync} from 'node:fs';

export const writeWavFloat = (file, samples, sampleRate) => {
	const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
	const h = Buffer.alloc(44);
	h.write('RIFF', 0);
	h.writeUInt32LE(36 + data.length, 4);
	h.write('WAVE', 8);
	h.write('fmt ', 12);
	h.writeUInt32LE(16, 16);
	h.writeUInt16LE(3, 20); // IEEE float
	h.writeUInt16LE(1, 22); // mono
	h.writeUInt32LE(sampleRate, 24);
	h.writeUInt32LE(sampleRate * 4, 28);
	h.writeUInt16LE(4, 32);
	h.writeUInt16LE(32, 34);
	h.write('data', 36);
	h.writeUInt32LE(data.length, 40);
	writeFileSync(file, Buffer.concat([h, data]));
};
