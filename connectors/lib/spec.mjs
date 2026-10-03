// Checks the CLI or MCP options against an adapter's model spec and returns
// normalised options. Every value that changes the price is made explicit
// here, so the estimate and the request always describe the same job.

import { UsageError } from './errors.mjs';

export const KINDS = Object.freeze(['image', 'video', 'sfx', 'music', 'speech']);

function canon(list, value, what, model) {
  const hit = list.find((v) => String(v).toLowerCase() === String(value).toLowerCase());
  if (hit === undefined) throw new UsageError(`${model}: ${what} must be one of ${list.join(', ')} (got ${value})`);
  return hit;
}

export function kindsOf(spec) {
  return Array.isArray(spec.kind) ? spec.kind : [spec.kind];
}

export function normalise(spec, opts, modelId) {
  const n = { notes: [] };
  if (!kindsOf(spec).includes(opts.kind)) {
    throw new UsageError(`${modelId} makes ${kindsOf(spec).join(' or ')}, not ${opts.kind}`);
  }

  const imageMode = spec.image ?? 'none';
  if (imageMode === 'required' && !opts.image) throw new UsageError(`${modelId} needs --image (a start frame or reference)`);
  if (imageMode === 'none' && opts.image) throw new UsageError(`${modelId} takes no --image`);
  n.inputImages = opts.image ? 1 : 0;

  if (spec.resolutions) {
    n.resolution = canon(spec.resolutions, opts.resolution ?? spec.defaultResolution, 'resolution', modelId);
  } else if (opts.resolution) {
    throw new UsageError(`${modelId} has no resolution option`);
  }

  if (spec.qualities) {
    n.quality = canon(spec.qualities, opts.quality ?? spec.defaultQuality, 'quality', modelId);
  } else if (opts.quality) {
    throw new UsageError(`${modelId} has no quality option`);
  }

  if (spec.aspects) {
    n.aspect = canon(spec.aspects, opts.aspect ?? spec.defaultAspect, 'aspect', modelId);
  } else if (opts.aspect) {
    n.notes.push(`this model takes the aspect ratio from its input or has none; --aspect ${opts.aspect} was not sent`);
  }

  const d = spec.duration;
  if (d) {
    let secs = opts.duration;
    if (secs == null) {
      if (d.required) throw new UsageError(`${modelId} needs --duration in seconds (${d.min} to ${d.max})`);
      secs = d.default ?? null;
    }
    if (secs != null) {
      if (!Number.isFinite(secs)) throw new UsageError(`--duration must be a number of seconds`);
      if (d.allowed) {
        if (!d.allowed.includes(secs)) throw new UsageError(`${modelId}: --duration must be one of ${d.allowed.join(', ')} seconds`);
      } else {
        if (secs < d.min || secs > d.max) throw new UsageError(`${modelId}: --duration must be from ${d.min} to ${d.max} seconds`);
        if (d.integer && !Number.isInteger(secs)) throw new UsageError(`${modelId}: --duration must be a whole number of seconds`);
      }
      n.duration = secs;
      n.billedSeconds = secs;
    } else {
      // Optional duration left to the model: estimate at the most it can bill.
      n.duration = null;
      n.billedSeconds = d.max;
      n.secondsNote = `no --duration given, so the model picks the length; priced at its maximum of ${d.max} s`;
    }
  } else {
    if (opts.duration != null) n.notes.push(`this model sets its own length; --duration ${opts.duration} was not sent`);
    if (spec.maxSeconds) {
      n.billedSeconds = spec.maxSeconds;
      n.secondsNote = `the model sets the length, up to ${spec.maxSeconds} s, so this is the most it can cost`;
    } else if (spec.fixedSeconds) {
      n.billedSeconds = spec.fixedSeconds;
    }
  }
  if (spec.check) spec.check(n, modelId);

  const audio = spec.audio ?? 'never';
  if (audio === 'optional') n.audio = Boolean(opts.audio);
  else if (audio === 'always') n.audio = true;
  else {
    if (opts.audio) throw new UsageError(`${modelId} cannot add audio`);
    n.audio = false;
  }

  if (spec.voice === 'required') {
    if (!opts.voice) throw new UsageError(`${modelId} needs --voice (${spec.voiceHint ?? 'a voice id or name'})`);
    n.voice = opts.voice;
  } else if (opts.voice) {
    throw new UsageError(`${modelId} takes no --voice`);
  }

  if (opts.seed != null) {
    if (!Number.isInteger(opts.seed) || opts.seed < 0) throw new UsageError('--seed must be a whole number, zero or more');
    if (spec.seed === false) {
      n.seed = null;
      n.notes.push(`this model takes no seed; --seed ${opts.seed} was not sent${spec.seedHint ? ` (${spec.seedHint})` : ''}`);
    } else {
      n.seed = opts.seed;
    }
  } else {
    n.seed = null;
  }

  if (spec.sizeFor) n.size = opts.params?.size ?? spec.sizeFor(n.aspect);
  n.chars = [...(opts.prompt ?? '')].length;
  return n;
}
