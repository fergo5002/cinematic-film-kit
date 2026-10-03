// Media helpers: content sniffing, hashing, input images and WAV wrapping.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { insideKit } from './env.mjs';
import { UsageError } from './errors.mjs';

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Returns { ext, mime } from the first bytes, or null.
export function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  const b = buf;
  const ascii = (s, e) => b.subarray(s, e).toString('latin1');
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return { ext: 'png', mime: 'image/png' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return { ext: 'wav', mime: 'audio/wav' };
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand === 'qt  ') return { ext: 'mov', mime: 'video/quicktime' };
    if (brand.startsWith('M4A')) return { ext: 'm4a', mime: 'audio/mp4' };
    return { ext: 'mp4', mime: 'video/mp4' };
  }
  if (ascii(0, 4) === '\x1aE\xdf\xa3') return { ext: 'webm', mime: 'video/webm' };
  if (ascii(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { ext: 'mp3', mime: 'audio/mpeg' };
  if (ascii(0, 4) === 'fLaC') return { ext: 'flac', mime: 'audio/flac' };
  if (ascii(0, 4) === 'OggS') return { ext: 'ogg', mime: 'audio/ogg' };
  if (ascii(0, 5) === '<?xml' || ascii(0, 4) === '<svg') return { ext: 'svg', mime: 'image/svg+xml' };
  return null;
}

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/flac': 'flac',
  'audio/ogg': 'ogg',
};

export function extFor(buf, contentType, fallback) {
  const s = sniff(buf);
  if (s) return s;
  const ct = (contentType ?? '').split(';')[0].trim().toLowerCase();
  if (MIME_EXT[ct]) return { ext: MIME_EXT[ct], mime: ct };
  return { ext: fallback, mime: contentType ?? 'application/octet-stream' };
}

// Wraps headerless 16-bit little-endian PCM in a WAV container.
export function pcmToWav(pcm, { sampleRate = 24000, channels = 1, bitsPerSample = 16 } = {}) {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'latin1');
  header.write('fmt ', 12, 'latin1');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE((channels * bitsPerSample) / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'latin1');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// An --image argument is either an http(s) URL, passed through untouched, or
// a local file, read here and described by its hash.
export function readInputImage(arg, root) {
  if (!arg) return null;
  if (/^https?:\/\//i.test(arg)) {
    return { kind: 'url', url: arg, source: arg, sha256: null, bytes: null, mime: null, size: null };
  }
  const file = path.isAbsolute(arg) ? arg : path.resolve(root, arg);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new UsageError(`--image: no such file: ${arg}`);
  }
  if (!insideKit(root, file)) throw new UsageError(`--image must be a file inside the kit or an https URL; ${arg} is outside the kit`);
  const bytes = fs.readFileSync(file);
  const s = sniff(bytes);
  if (!s || !s.mime.startsWith('image/')) {
    throw new UsageError(`--image: ${arg} is not a PNG, JPEG or WebP image`);
  }
  return {
    kind: 'file',
    file,
    source: path.relative(fs.realpathSync(root), fs.realpathSync(file)).split(path.sep).join('/'),
    sha256: sha256(bytes),
    bytes,
    mime: s.mime,
    size: bytes.length,
  };
}

export function dataUri(img) {
  return `data:${img.mime};base64,${img.bytes.toString('base64')}`;
}

// Replaces long base64 payloads with a short marker so a sidecar records what
// was sent without carrying megabytes of image data.
export function elideData(value) {
  if (typeof value === 'string') {
    if (value.startsWith('data:') && value.length > 200) {
      return `${value.slice(0, value.indexOf(',') + 1)}[${value.length} characters elided]`;
    }
    if (value.length > 2000 && /^[A-Za-z0-9+/=\s]+$/.test(value)) return `[base64, ${value.length} characters elided]`;
    return value;
  }
  if (Array.isArray(value)) return value.map(elideData);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = elideData(v);
    return out;
  }
  return value;
}
