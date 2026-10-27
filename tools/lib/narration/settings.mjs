// A film's narration settings, from its beatmap's optional `export const NARRATION = {voice, speed,
// at}`, with the kit's defaults filled in. narrate uses them (flags may override, for trying things
// out) and records what it used; the release gate compares that record with the beatmap.
export const DEFAULT_VOICE = 'af_heart';

export const resolveSettings = (cfg = {}, fps = 30) => ({
	voice: cfg.voice ?? DEFAULT_VOICE,
	speed: cfg.speed ?? 1,
	at: Number(cfg.at ?? Math.round(0.2 * fps)),
});
