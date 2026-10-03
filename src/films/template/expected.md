# Expected: Template ("One clock")

Written before the render, then checked against `npm run release -- template`. The check is what
makes a prediction worth writing: where they disagree, one of them is wrong, and you find out which.

## The audit

| What | Predicted | Measured (2 October 2026) |
|---|---|---|
| Profile | dark (set in `beatmap.ts` as `AUDIT`) | dark |
| Mean luminance | low, 30 to 45 of 255 | 32.0 |
| Loudness range | about 8 LU: the quiet chord against the hit | 7.5 LU (the score alone measures 9.6; the limiter on the hit takes the rest) |
| Integrated loudness | -16 LUFS, set by the master | -16.0 LUFS, true peak -1.8 dBTP |
| Active frame fraction | over half: the light pulses on every tick | 61% |
| Motion concentration | high: the type and the clock move, the frame does not | 0.526 |

## What changed on the way

The first cut held still from 4 to 6.5 s while the riser played. The audit failed it: freezedetect
counts a frame as moving only when the whole picture changes by more than 2.55 levels, which type
landing on a 1080p frame never does, so 85% of the film read as frozen. The clock now keeps ticking
through the riser and the light pulses on each tick, then everything stops for the breath. That
also says the film's one idea better: the clock you see is the clock you hear.

## A first-time viewer

- What they can say it is about: picture and sound are timed from one clock.
- The moment they will remember: the hand whipping home on the hit after the silence.
