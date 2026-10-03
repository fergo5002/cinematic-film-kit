// Small real media files for the mock, made with ffmpeg's lavfi sources so the
// kit ships no binary fixtures: a PNG, a 1 s MP4, a WAV and an MP3, plus a
// noisy PNG over 1 MB to exercise the upload paths.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function ffmpeg(args, label) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.error) throw new Error(`ffmpeg is needed for the connector tests (${label}): ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg failed making ${label}: ${(r.stderr ?? '').slice(-400)}`);
}

export const FIXTURE_FILES = Object.freeze({
  png: 'image.png',
  mp4: 'video.mp4',
  wav: 'audio.wav',
  mp3: 'audio.mp3',
  bigPng: 'big.png',
});

export function makeFixtures(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const p = (f) => path.join(dir, f);
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x3a5f8a:s=64x64', '-frames:v', '1', p(FIXTURE_FILES.png)], 'a PNG');
  try {
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=128x72:r=24', '-t', '1', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', p(FIXTURE_FILES.mp4)], 'an MP4 (libx264)');
  } catch {
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=128x72:r=24', '-t', '1', '-pix_fmt', 'yuv420p', '-c:v', 'mpeg4', p(FIXTURE_FILES.mp4)], 'an MP4 (mpeg4)');
  }
  // bitexact keeps the WAV header at the plain 44 bytes (no LIST chunk).
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-c:a', 'pcm_s16le', p(FIXTURE_FILES.wav)], 'a WAV');
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=1', '-c:a', 'libmp3lame', '-b:a', '64k', p(FIXTURE_FILES.mp3)], 'an MP3');
  ffmpeg(['-f', 'lavfi', '-i', 'nullsrc=s=1024x1024,geq=r=random(1)*255:g=random(2)*255:b=random(3)*255', '-frames:v', '1', p(FIXTURE_FILES.bigPng)], 'a noisy PNG');
  return loadFixtures(dir);
}

export function loadFixtures(dir) {
  const read = (f) => fs.readFileSync(path.join(dir, f));
  return {
    dir,
    png: read(FIXTURE_FILES.png),
    mp4: read(FIXTURE_FILES.mp4),
    wav: read(FIXTURE_FILES.wav),
    mp3: read(FIXTURE_FILES.mp3),
    bigPngPath: path.join(dir, FIXTURE_FILES.bigPng),
    pngPath: path.join(dir, FIXTURE_FILES.png),
  };
}
