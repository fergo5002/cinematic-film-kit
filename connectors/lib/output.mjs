// Writes a generated file, its provenance sidecar, and nothing else. The
// ledger line is written by core.mjs once the file is safely on disk.

import fs from 'node:fs';
import path from 'node:path';
import { extFor, sha256 } from './media.mjs';
import { mediaDir } from './ledger.mjs';

const IGNORED = /\.prov\.json$|^ledger\.jsonl(\.lock)?$/;

// Files that already use this stem (any extension), so a paid run never
// silently replaces earlier media.
export function existingOutputs(root, film, stem) {
  const dir = mediaDir(root, film);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => !IGNORED.test(f))
    .filter((f) => f === stem || (f.startsWith(`${stem}.`) && !f.slice(stem.length + 1).includes('.')));
}

function freeName(dir, stem, ext) {
  let file = path.join(dir, `${stem}.${ext}`);
  for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${stem}-${i}.${ext}`);
  return file;
}

export function writeOutput({ root, film, stem, bytes, contentType, fallbackExt, overwrite, sidecar }) {
  const dir = mediaDir(root, film);
  fs.mkdirSync(dir, { recursive: true });
  const { ext, mime } = extFor(bytes, contentType, fallbackExt);
  let file = path.join(dir, `${stem}.${ext}`);
  let renamed = false;
  if (fs.existsSync(file) && !overwrite) {
    // The stem was free when the run started; something wrote it meanwhile.
    file = freeName(dir, stem, ext);
    renamed = true;
  }
  const tmp = `${file}.part`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, file);
  const hash = sha256(bytes);
  const rel = path.relative(root, file).split(path.sep).join('/');
  const sidecarFile = `${file}.prov.json`;
  const full = {
    ...sidecar,
    file: rel,
    output: { bytes: bytes.length, sha256: hash, contentType: mime, extension: ext },
  };
  fs.writeFileSync(sidecarFile, `${JSON.stringify(full, null, 2)}\n`, 'utf8');
  return {
    file,
    rel,
    sidecarFile,
    sidecarRel: path.relative(root, sidecarFile).split(path.sep).join('/'),
    sha256: hash,
    bytes: bytes.length,
    ext,
    mime,
    renamed,
  };
}
