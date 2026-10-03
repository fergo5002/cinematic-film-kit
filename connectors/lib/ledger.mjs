// The spend ledger: public/films/<id>/media/ledger.jsonl, one JSON object per
// line, append only. Each generation is a job: a "reserved" line is written
// before anything is sent (so two runs at once both see the money as spoken
// for) and a closing line ("done", "failed", "uncertain" or "released") when it
// ends. The spend of a job is the spendUsd on its latest line. A job that never
// closed (a crash) stays reserved at its estimate, which errs on the safe side.

import fs from 'node:fs';
import path from 'node:path';
import { sleep } from './http.mjs';

export const FILM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const STEM = /^[a-z0-9][a-z0-9._-]{0,99}$/;

export function mediaDir(root, film) {
  return path.join(root, 'public', 'films', film, 'media');
}

export function ledgerPath(root, film) {
  return path.join(mediaDir(root, film), 'ledger.jsonl');
}

export function readLedger(file) {
  if (!fs.existsSync(file)) return { lines: [], bad: 0 };
  const lines = [];
  let bad = 0;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!raw.trim()) continue;
    try {
      lines.push(JSON.parse(raw));
    } catch {
      bad += 1;
    }
  }
  return { lines, bad };
}

// Latest line per job, in first-seen order.
export function jobsFrom(lines) {
  const order = [];
  const latest = new Map();
  for (const l of lines) {
    const id = l.job ?? `line-${order.length}`;
    if (!latest.has(id)) order.push(id);
    latest.set(id, { ...(latest.get(id) ?? {}), ...l });
  }
  return order.map((id) => latest.get(id));
}

export function summarise(file) {
  const { lines, bad } = readLedger(file);
  const jobs = jobsFrom(lines);
  let spent = 0;
  let unknown = 0;
  let open = 0;
  for (const j of jobs) {
    if (typeof j.spendUsd === 'number') spent += j.spendUsd;
    else if (j.event !== 'released') unknown += 1;
    if (j.event === 'reserved') open += 1;
  }
  return { jobs, spent: Math.round(spent * 1e6) / 1e6, unknown, open, bad };
}

// Spend across every film's ledger, for the kit-wide cap.
export function summariseKit(root) {
  const dir = path.join(root, 'public', 'films');
  let spent = 0;
  let unknown = 0;
  if (fs.existsSync(dir)) {
    for (const film of fs.readdirSync(dir)) {
      const file = ledgerPath(root, film);
      if (!fs.existsSync(file)) continue;
      const s = summarise(file);
      spent += s.spent;
      unknown += s.unknown;
    }
  }
  return { spent: Math.round(spent * 1e6) / 1e6, unknown };
}

// One lock for the whole kit, so the kit-wide cap holds across films too.
export function kitLockPath(root) {
  return path.join(root, 'public', 'films', '.film-gen');
}

export function appendLine(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(obj)}\n`, 'utf8');
}

// A short lock around "check the budget, then reserve" so two runs cannot
// both pass the check on the same headroom.
export async function withLedgerLock(file, fn) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  const started = Date.now();
  for (;;) {
    try {
      const fd = fs.openSync(lock, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > 60_000) fs.rmSync(lock, { force: true });
      } catch {
        /* the other run removed it */
      }
      if (Date.now() - started > 15_000) throw new Error(`the ledger is locked by another run (${lock}); wait for it, or delete the lock file if no run is going`);
      await sleep(50);
    }
  }
  try {
    return await fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}
