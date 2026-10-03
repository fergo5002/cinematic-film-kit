# Kinetic typography and numerals
### Production reference. Every number below is measured, not estimated, unless marked UNVERIFIED.

Written for a worked example: a 40-second film at 60fps and 120 BPM, set in a variable grotesque
(Archivo, OFL, with `wght` and `wdth` axes). Film constants: **2400 frames @ 60fps = 40.000s. 120 BPM → 1 beat = 30 frames = 0.5s. 1/2 beat = 15f. 1/4 beat = 7.5f (use 7 or 8, never fractional).**

Everything here was verified two ways:
1. **Font tables**, read directly out of the Archivo variable font file with fontTools (14 August 2026).
2. **Rendered stills** at 1920×1080, read back as images.

The code imports `C`, `DISPLAY` and `ease` from the film's theme module (its colours, the display
family, and the easing curves of §1.0). Rename them to match your film's `theme.ts`.

**Before you animate any variable face, read its tables.** Two facts measured on Archivo change how
the code is written, and you must check both on your own face: (a) its cap height (686) and x-height
(526) stayed constant across 36 combinations of weight and width, so animating the axes never moved
a baseline; (b) its default figures are proportional, and even its tabular figures change width with
weight (592 → 714 units across `wght` 100 → 900 at `wdth` 108, a 20.6% swing). The measured tables
below (`TAB_ADV`, `COMMA_ADV`, `OPT_TRIM`) are Archivo's; measure your own face before reusing them.

---

## 1. ENTRANCES, the full vocabulary, with frame counts

### 1.0 First: what the house curve actually does

I sampled `cubic-bezier(0.16, 1, 0.30, 1)` and the rest of the worked example's curves numerically. **This is the single most useful table in this document, because it tells you the real perceived duration of an entrance.**

| curve | t=.10 | t=.25 | t=.33 | t=.50 | t=.75 | reaches 50% at | reaches 90% at | reaches 99% at | peak |
|---|---|---|---|---|---|---|---|---|---|
| `out` (0.16,1,0.30,1) | 0.494 | 0.826 | **0.901** | 0.972 | 0.998 | **10.2%** | **33.0%** | 62.0% | 1.000 |
| `in` (0.70,0,0.84,0) | 0.000 | 0.002 | 0.006 | 0.028 | 0.174 | 89.8% | 98.4% | 99.9% | 1.000 |
| `soft` (0.34,1.14,0.36,1) | 0.326 | 0.729 | 0.866 | 0.987 | 1.005 | 15.9% | 35.9% | 51.3% | **1.005** |
| `swell` (0.22,0.61,0.20,1) | 0.302 | 0.678 | 0.788 | 0.913 | 0.984 | 16.8% | 47.4% | 79.7% | 1.000 |
| `hero` (0.22,1,0.36,1) | 0.401 | 0.765 | 0.864 | 0.961 | 0.997 | 13.2% | 37.4% | 65.0% | 1.000 |
| `inOut` (0.65,0,0.35,1) | 0.009 | 0.071 | 0.145 | 0.500 | 0.929 | 50.0% | 71.4% | 89.5% | 1.000 |

**Two hard consequences for a 40-second film:**

1. **`out` is visually over at one third of its nominal duration.** A `dur=26f` entrance looks finished at **frame 9 (150 ms)**. The remaining 17 frames are an imperceptible settle. So you can write generous `dur` values and still get a fast film, but you *cannot* count on the tail to fill time. **If a shot needs to feel like it lasts, the motion must be `swell` or `inOut`, not `out`.** Front-loading is what made a failed 100s cut feel frozen: `out` finished in 150ms and then nothing moved for the rest of the shot.
2. **`soft` (0.34,1.14,0.36,1) peaks at 1.005, a 0.5% overshoot, which is nothing.** On a translate of 118% at 96px that is 0.57px. **It is not a visible overshoot.** If you want a visible bounce you must overshoot the *value range*, e.g. `interpolate(t,[0,0.62,1],[0.90,1.035,1.0])`, not rely on the curve. Treat `soft` as "slightly softer ease-out", not as a spring.

Frame-accurate landings (60fps):

```
out    dur=18f → 50% at f2,  90% at f6  (100ms)
out    dur=22f → 50% at f3,  90% at f8  (133ms)
out    dur=26f → 50% at f3,  90% at f9  (150ms)   <- house default
out    dur=30f → 50% at f4,  90% at f10 (167ms)   <- one beat
soft   dur=26f → 50% at f5,  90% at f10 (167ms)
swell  dur=26f → 50% at f5,  90% at f13 (217ms)   <- the count-up curve, genuinely slower
```

### 1.1 The vocabulary, pick per shot, not per taste

| # | Device | Duration | Easing | Stagger | Use it when | Cheap tell? |
|---|---|---|---|---|---|---|
| **A** | **Masked rise** (`overflow:hidden` + `translateY 118%→0`) | **26f** | `out` | **3f per word** | Default for every display headline. The workhorse. | No, but only if the mask is tight (see 1.2) |
| **B** | **Clip-path wipe** (angled polygon) | **20f** | `out` | line-level, no stagger | A line that must appear *fast* and *whole*, the last card of the film, a stat label | No, if the angle is ≤6° |
| **C** | **Weight-axis reveal** (`wght` 120→800) | **30f** | `out` | 0 (whole line) | Once, on the one word the film is about. It is the film's signature. | Only if used more than twice |
| **D** | **Width-axis stretch** (`wdth` 74→108 or 118→108) | **30 to 40f** | `out` | 0 | Once. Pairs with C. On a closing line about ease it *means* relaxing. | Yes if used on more than one line |
| **E** | **Per-character blur-in** | **18f** each | `out` | **1.5f per char** | Short words only (≤8 chars). Data labels and short numbers. | **Yes on long strings.** Over ~10 chars it reads as a template. |
| **F** | **Scale-settle** (0.90 → 1.0 with value overshoot to 1.035) | **22f** | `soft` + range overshoot | 0 | Numbers landing on a beat. Never on words. | Yes if the scale start is below 0.85 |
| **G** | **Line-mask + counter-translate** (mask rises, text falls half as far) | **28f** | `out` | 4f | The one "expensive-looking" entrance. Use twice max. | No |

### 1.2 CHEAP TELLS, do not ship these

- **A blur-in with no positional movement.** Blur alone is the single loudest After-Effects-preset tell. Blur must always ride *on top of* a translate or a scale, and must be gone (`filter:'none'`) by t=0.98 so the final frame is razor sharp.
- **Per-character animation on strings longer than ~10 characters.** It stops reading as "designed" and starts reading as "the tool did this". Per-word is the flagship default; per-character is a spice.
- **Uniform stagger across an entire paragraph.** Stagger the first 3 items at 3f, then compress to 1.5f. Human-authored staggers decelerate.
- **`translateY` in `%` on a `span` with default `lineHeight`.** The percentage resolves against the *element's own height*, which for `lineHeight:1.02` at 96px is 98px, not the cap height. It looks like it works, then breaks the moment you change `lineHeight`. Use an explicit `lineHeight` and a mask padded by `0.08em` top / `0.14em` bottom (descenders in Archivo reach −210/1000em).
- **`gap` in `em` inside a flex row of words.** A known trap: `em` resolves against the *container's* inherited font-size (16px), not the 96px words, and every headline collapses into one run-on word. **Gaps in px only.** For a headline at size `S`, word gap = `S * 0.26`.
- **Both a fade and a translate and a blur and a scale on the same element.** Two channels maximum. Three is a preset.
- **Every entrance being the same entrance.** Assign devices per shot in the beatmap so you can audit them; the goal is ~3 devices used repeatedly and 2 used once each.

### 1.3 Code, the entrance set (all verified rendering)

```jsx
import React from 'react';
import { useCurrentFrame, interpolate, Easing } from 'remotion';
import { C, DISPLAY, ease } from './theme';

// A: MASKED RISE. Default headline. 26f, `out`, 3f/word.
export const MaskRise = ({
  text, at, size = 96, stagger = 3, dur = 26,
  colour = C.ink, wght = 800, wdth = 108, tracking = '-0.032em',
}) => {
  const f = useCurrentFrame();
  return (
    <div style={{ display: 'flex', gap: size * 0.26, alignItems: 'flex-end' }}>
      {text.split(' ').map((w, i) => {
        const t = interpolate(f - at - i * stagger, [0, dur], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.out,
        });
        return (
          // The mask. paddingTop 0.08em clears Archivo's cap overshoot,
          // paddingBottom 0.14em clears the -210/1000em descender.
          <span key={i} style={{
            display: 'block', overflow: 'hidden',
            paddingTop: size * 0.08, paddingBottom: size * 0.14,
          }}>
            <span style={{
              display: 'block', fontFamily: DISPLAY,
              fontVariationSettings: `'wght' ${wght}, 'wdth' ${wdth}`, fontWeight: wght,
              fontSize: size, lineHeight: 1.0, letterSpacing: tracking,
              textTransform: 'uppercase', color: colour,
              transform: `translate3d(0,${((1 - t) * 118).toFixed(2)}%,0)`,
              willChange: 'transform',
            }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
};

// B: CLIP-PATH WIPE. 20f, `out`, angle 4°. One line, no stagger.
export const ClipWipe = ({ text, at, size = 96, dur = 20, colour = C.ink, angle = 4 }) => {
  const f = useCurrentFrame();
  const t = interpolate(f - at, [0, dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.out,
  });
  const x = t * 108; // overshoot to 108% so the trailing edge fully clears
  return (
    <div style={{
      fontFamily: DISPLAY, fontVariationSettings: "'wght' 800, 'wdth' 108", fontWeight: 800,
      fontSize: size, lineHeight: 1.0, letterSpacing: '-0.032em',
      textTransform: 'uppercase', color: colour, whiteSpace: 'pre',
      clipPath: `polygon(0 0, ${x}% 0, ${x - angle}% 100%, 0 100%)`,
    }}>{text}</div>
  );
};

// E: PER-CHARACTER BLUR-IN. 18f each, 1.5f stagger. ≤8 chars ONLY.
export const CharStagger = ({ text, at, size = 96, stagger = 1.5, dur = 18, colour = C.ink }) => {
  const f = useCurrentFrame();
  if (text.length > 10 && process.env.NODE_ENV !== 'production') {
    console.warn(`CharStagger on ${text.length} chars: that is a cheap tell.`);
  }
  return (
    <div style={{ display: 'flex', whiteSpace: 'pre' }}>
      {[...text].map((ch, i) => {
        const t = interpolate(f - at - i * stagger, [0, dur], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.out,
        });
        return (
          <span key={i} style={{
            fontFamily: DISPLAY, fontVariationSettings: "'wght' 800, 'wdth' 108", fontWeight: 800,
            fontSize: size, lineHeight: 1.0, letterSpacing: '-0.032em',
            textTransform: 'uppercase', color: colour,
            opacity: t,
            filter: t < 0.98 ? `blur(${((1 - t) * 9).toFixed(2)}px)` : 'none',
            transform: `translate3d(0,${((1 - t) * 0.10 * size).toFixed(2)}px,0)`,
          }}>{ch}</span>
        );
      })}
    </div>
  );
};

// F: SCALE-SETTLE with a REAL overshoot (the curve alone gives only 0.5%).
export const ScaleSettle = ({ children, at, dur = 22 }) => {
  const f = useCurrentFrame();
  const t = interpolate(f - at, [0, dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.out,
  });
  // Overshoot the VALUE, not the curve. 0.90 -> 1.035 -> 1.000
  const s = interpolate(t, [0, 0.58, 1], [0.90, 1.035, 1.0], { easing: Easing.linear });
  return (
    <div style={{ transform: `scale(${s.toFixed(4)})`, transformOrigin: 'left bottom', willChange: 'transform' }}>
      {children}
    </div>
  );
};

// G: LINE-MASK + COUNTER-TRANSLATE. The mask rises at full speed, the text
// falls at half, so the glyphs appear to be revealed by something passing over
// them rather than pushed up by something underneath. Use twice, maximum.
export const CounterRise = ({ text, at, size = 96, dur = 28, stagger = 4, colour = C.ink }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ display: 'flex', gap: size * 0.26 }}>
      {text.split(' ').map((w, i) => {
        const t = interpolate(f - at - i * stagger, [0, dur], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.out,
        });
        return (
          <span key={i} style={{
            display: 'block', overflow: 'hidden',
            paddingTop: size * 0.08, paddingBottom: size * 0.14,
            transform: `translate3d(0,${((1 - t) * -22).toFixed(2)}%,0)`,
          }}>
            <span style={{
              display: 'block', fontFamily: DISPLAY,
              fontVariationSettings: "'wght' 800, 'wdth' 108", fontWeight: 800,
              fontSize: size, lineHeight: 1.0, letterSpacing: '-0.032em',
              textTransform: 'uppercase', color: colour,
              transform: `translate3d(0,${((1 - t) * 100 + (1 - t) * 22).toFixed(2)}%,0)`,
            }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
};
```

### 1.4 Exits

Exits use `in` = `(0.70, 0, 0.84, 0)`, which reaches only **2.8% at half its duration**, nothing happens, then everything happens. That is correct for an exit: the eye should not track it.

- **Exit duration = 12f**, never longer. At 40s you cannot afford a 20f exit.
- Exit *travel* is the reverse of the entrance travel **× 0.55**. A word that rose 118% leaves by 65%. Symmetric exits look like a rewind.
- **Never fade a headline out on its own.** Either mask it out (same mask it came in through) or cut. A 12f opacity fade on 96px display type is the second loudest amateur tell after missing motion blur.

---

## 2. VARIABLE-FONT MOTION, animating `wght` and `wdth` safely

### 2.1 Does it reflow? Yes. MDN is wrong about this.

MDN's page on `font-variation-settings` says variable fonts "update glyphs without triggering reflows". **That is false for Archivo**, and I proved it from the font tables: the advance widths change on both axes. At `wdth 108`, the tabular digit advance runs **592 → 714 units across `wght` 100→900 (a 20.6% swing)**; `H` runs 736 → 833 across `wght` 400→900. Archivo has **no `GRAD` axis** (the axis that changes apparent weight with fixed advance), only `wght` and `wdth`. So every frame of a weight animation re-shapes the line and re-lays-out everything after it.

What is *not* affected: **vertical metrics.** Cap height (686) and x-height (526) are identical at all 36 instances I tested. So the animation never moves a baseline, never changes a line box height, never breaks a mask.

### 2.2 The three rules

1. **Reserve the final width.** Measure the line at its *end-state* axis values once, put that width on a wrapping element, and let the animating span sit inside it. Then nothing downstream ever moves.
2. **Quantise `wght` to integers and `wdth` to 2 decimals.** Chrome re-instances the font on every distinct value. Rounding `wght` to whole numbers cuts the number of distinct instances over a 30-frame animation from 30 to ~28, and more importantly it stops sub-unit values producing sub-pixel width flicker. UNVERIFIED: the actual render-time saving; I did not benchmark it, but the flicker reduction is real.
3. **Set both `fontVariationSettings` and `fontWeight` to the same value.** `font-variation-settings` wins for `wght`, but `fontWeight` is what `measureText`, `fitText` and any fallback face will use. Keeping them in sync means a missing font degrades to the right weight rather than to 400.

Do **not** animate `wght` on:
- Anything with a live number in it (the digits change width, see §4).
- Anything inside a flex row with siblings after it.
- More than one element at a time. Two simultaneous axis animations read as a wobble.

### 2.3 Working component

```jsx
import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { measureText } from '@remotion/layout-utils';
import { C, DISPLAY, ease } from './theme';

/**
 * AxisReveal: the film's signature entrance. The line is already in position;
 * only its weight and width resolve. Width is reserved at the END state so no
 * reflow ever escapes this component.
 *
 * `ready` must be true (see §6.1) before this can measure. Pass it down.
 */
export const AxisReveal = ({
  text, at, size = 96, dur = 30, colour = C.ink, ready,
  wghtFrom = 120, wghtTo = 800,
  wdthFrom = 74,  wdthTo = 108,
  tracking = '-0.032em', align = 'left',
}) => {
  const f = useCurrentFrame();
  const p = interpolate(f - at, [0, dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.out,
  });

  const wght = Math.round(wghtFrom + (wghtTo - wghtFrom) * p);   // integers only
  const wdth = +(wdthFrom + (wdthTo - wdthFrom) * p).toFixed(2); // 2dp only

  // Reserve the END-STATE width. Measured once, cached by layout-utils.
  const reserve = ready ? measureText({
    text, fontFamily: DISPLAY, fontSize: size, fontWeight: wghtTo,
    letterSpacing: tracking, textTransform: 'uppercase',
    additionalStyles: { fontVariationSettings: `'wght' ${wghtTo}, 'wdth' ${wdthTo}` },
  }).width : 0;

  return (
    <div style={{ width: reserve, whiteSpace: 'pre', textAlign: align }}>
      <span style={{
        display: 'inline-block',
        fontFamily: DISPLAY,
        fontVariationSettings: `'wght' ${wght}, 'wdth' ${wdth}`,
        fontWeight: wght,                 // keep in sync with the axis
        fontSize: size, lineHeight: 1.0,
        letterSpacing: tracking, textTransform: 'uppercase', color: colour,
        opacity: interpolate(p, [0, 0.22], [0, 1], { extrapolateRight: 'clamp' }),
        willChange: 'font-variation-settings',
      }}>{text}</span>
    </div>
  );
};
```

### 2.4 The two axis moves worth having in a film

| Move | From | To | Duration | Reads as |
|---|---|---|---|---|
| **Condense-in** | `wght 120, wdth 74` | `wght 800, wdth 108` | 30f | The word gathering itself, arriving with force. Use on the one word the film is about. |
| **Relax-out** | `wght 800, wdth 118` | `wght 740, wdth 108` | 40f | Tension leaving. Use exactly once, on a closing line about ease, at the end. |

The relax-out is the better idea because it is semantic (§5). Its amplitude is deliberately small (10 units of width, 60 of weight) so it reads as a settle, not a stretch.

---

## 3. RSVP AND FAST TYPE

### 3.1 The evidence, and why the naive reading of it is wrong

RSVP research on **continuous novel prose**: comprehension is statistically indistinguishable from normal reading at **250, 300 and 350 wpm**, and declines significantly at **400 and 450 wpm**, a threshold near **350 wpm** ([PLOS One, "Perceptual and Cognitive Factors Imposing 'Speed Limits' on Reading Rate"](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0153786); [Rapid serial visual presentation: degradation of inferential reading comprehension as a function of speed](https://www.researchgate.net/publication/328925418)). Skilled readers manage 250 to 300 wpm normally and up to ~650 wpm with RSVP at reduced comprehension.

**5 to 7 words per second is 300 to 420 wpm.** So a brief that asks for 7 words a second is past the prose threshold.

But the constraint that actually binds here is different, and lower-level:
- Average fixation in reading is **200 to 250 ms**, and a fixation can be as short as **60 ms** ([Rayner, *Eye Movements in Reading and Information Processing*](http://andrewd.ces.clemson.edu/courses/cpsc881/papers/reading/Ray98_readingSurvey.pdf)).
- **Lexical properties begin to influence fixation duration at 120 to 140 ms from fixation onset**; neurophysiological lexical access lands around **127 to 172 ms** ([Rayner survey; SWIFT-model literature](https://arxiv.org/pdf/1901.11110)).

So a *known, short, high-frequency word in a fixed screen position*, which is exactly the RSVP case in a film, is recognised in about **130 to 170 ms**, or **8 to 10 frames at 60fps**. The 350 wpm prose limit is about *inferential comprehension of novel text*, which is not what a film's flashed words ask of anyone. The worked example's words were 4 to 7 letters, all high-frequency, and the viewer already had the context from the picture.

### 3.2 The numbers to build to

| | frames @60 | ms | effective wpm |
|---|---|---|---|
| **Absolute floor, do not go below** | **8f** | 133 | 450 |
| **Short high-frequency word** (≤5 chars: FIND, OPEN, SENT, DONE) | **9f** | 150 | 400 |
| **Medium word** (6 to 9 chars: LIBRARY, SCHEDULE, DELIVERY) | **11f** | 183 | 327 |
| **Long or unfamiliar** (10+ chars, proper nouns, numbers) | **14f** | 233 | 257 |
| **Word ending a clause** (carries `.` or `,`) | **+4f** | +67 |, |
| **Final word of the film** | **hold ≥45f** | 750 |, |

Rule of thumb, implementable: `hold = 9 + ceil((letters - 4) / 4) + (endsClause ? 4 : 0)` frames.

A 4-word phrase at these rates costs 9+11+9+15 ≈ 44 frames ≈ 0.73s ≈ **1.5 beats**. That is affordable in a 40s film. Eight such phrases = 12 beats. Budget accordingly.

### 3.3 Readability requirements (all four are non-negotiable at these speeds)

1. **Position is fixed.** The word does not move, does not fade in from an offset, does not scale. The eye must not have to re-acquire. Any positional animation costs a fresh saccade, 20 to 80 ms plus a fixation, and destroys the budget.
2. **Optimal Recognition Point (ORP).** The word is offset horizontally so that the pivot letter sits on a fixed rail. Pivot index = `round(len * 0.36) - 1`, clamped. Tint the pivot letter with the accent colour (a pale lime, `#E2F98B`, in the worked example) at ~70% opacity, enough to anchor the eye, not enough to read as decoration. Verified rendering: the ORP offset requires measuring the prefix, so it is a `measureText` call per word (cached).
3. **Contrast.** White on `#04040a` is ~20:1. Do not drop below **#C9C9D2** (≈11:1) for an RSVP word. A failed dark cut's mean luminance of 7.5% shows the failure mode: at 9-frame holds there is no time for the eye to adapt. **Every RSVP word should be at or near full white.**
4. **Size.** 64 to 84px at 1920 wide. Below 56px the word needs a second fixation for its tail. Above 110px a 9-letter word exceeds the foveal span (~7 to 9 letter spaces at normal reading distance) and again needs two fixations. **72px is the sweet spot** for 4 to 8 letter uppercase Archivo at `wdth 108`.

Cross-fade: **3f in, 2f out**, opacity only, no blur, no movement. That leaves a 1-frame gap of near-black between words which reads as a shutter and *helps*, it resets the fixation.

### 3.4 Working component (verified rendering; ORP centring confirmed on a still)

```jsx
import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { measureText } from '@remotion/layout-utils';
import { C, DISPLAY } from './theme';

const holdFor = (w) => {
  const letters = w.replace(/[^A-Za-z0-9]/g, '').length;
  return 9 + Math.max(0, Math.ceil((letters - 4) / 4)) + (/[.,!?;:]$/.test(w) ? 4 : 0);
};

/** Total cost in frames: call this from the beatmap so timings are derived, not guessed. */
export const rsvpDuration = (words) => words.reduce((a, w) => a + holdFor(w), 0);

export const RSVP = ({
  words, at, size = 72, colour = '#FFFFFF', pivotColour = C.accent,
  ready, showRails = true, anchorFrac = 0.36,
}) => {
  const f = useCurrentFrame();
  const mw = (s) => (ready && s ? measureText({
    text: s, fontFamily: DISPLAY, fontSize: size, fontWeight: 800,
    letterSpacing: '-0.028em', textTransform: 'uppercase',
    additionalStyles: { fontVariationSettings: "'wght' 800, 'wdth' 108" },
  }).width : 0);

  const spans = [];
  let t = at;
  for (const w of words) { const h = holdFor(w); spans.push({ w, from: t, to: t + h }); t += h; }
  const cur = spans.find((s) => f >= s.from && f < s.to);
  if (!cur) return null;

  const age = f - cur.from, life = cur.to - cur.from;
  const o = Math.min(
    interpolate(age, [0, 3], [0, 1], { extrapolateRight: 'clamp' }),
    interpolate(age, [life - 2, life], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  );

  const letters = [...cur.w];
  const pivot = Math.max(0, Math.min(letters.length - 1, Math.round(letters.length * anchorFrac) - 1));
  // Shift so the pivot glyph's CENTRE lands on x = 0 (the rail).
  const dx = -(mw(cur.w.slice(0, pivot)) + mw(cur.w[pivot]) / 2);

  return (
    <div style={{ position: 'relative', height: size * 1.2 }}>
      {showRails && <>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 2, height: size * 0.16, background: C.ink24 }} />
        <div style={{ position: 'absolute', left: 0, bottom: 0, width: 2, height: size * 0.16, background: C.ink24 }} />
      </>}
      <div style={{
        position: 'absolute', left: 0, top: size * 0.18,
        display: 'flex', whiteSpace: 'pre', opacity: o,
        transform: `translate3d(${dx.toFixed(1)}px,0,0)`,
      }}>
        {letters.map((ch, i) => (
          <span key={i} style={{
            fontFamily: DISPLAY, fontVariationSettings: "'wght' 800, 'wdth' 108", fontWeight: 800,
            fontSize: size, lineHeight: 1, letterSpacing: '-0.028em', textTransform: 'uppercase',
            color: i === pivot ? pivotColour : colour,
          }}>{ch}</span>
        ))}
      </div>
    </div>
  );
};
```

Mount it with `left` set to where the rail should be (e.g. `left: 960` for centre-frame).

### 3.5 Type-on (a machine writing) is a different thing and has different numbers

A type-on helper in an earlier build ran `cps = 2.1` characters per frame = **126 cps**. That is far too fast to read and far too fast to look like typing. For a beat where a message is composed on screen:

- **Human typing feel: 0.28 to 0.40 chars/frame (17 to 24 cps).** A fast human is ~90 wpm ≈ 7.5 cps; a machine writing "fast but visible" is 2 to 3× that.
- **AI-writing feel (a machine writing, fast but visible): 0.9 to 1.2 chars/frame (54 to 72 cps)**, with a jitter: `cps * (0.85 + 0.3 * fract(sin(charIndex*12.9898)*43758.5453))`. Constant-rate typing is a tell.
- **Caret blink: 30f period** (1 beat), not 14. Lock it to the music.
- **Never type past the end of a line.** Pre-measure and wrap manually with `fillTextBox` so the caret never jumps.

---

## 4. NUMERALS, the odometer

### 4.1 The five things that separate a flagship counter from a template one

1. **Tabular figures, and a hard-coded column width.** `font-variant-numeric: tabular-nums` plus `fontFeatureSettings: "'tnum' 1"`, *and* an explicit `width` on each column taken from `TAB_ADV[wdth][wght] * size`. Belt and braces because the feature is silently dropped if the font falls back.
2. **Real mechanical carry.** Higher wheels do not spin continuously; they turn only during the last ~30% of the wheel below them.
3. **Motion blur only on moving columns, and only vertically.** A CSS `blur()` is isotropic and smears the digit sideways into its neighbours. The correct tool is an SVG `feGaussianBlur` with `stdDeviation="0 N"`, vertical only. **This single detail is the difference between "designed" and "template" on a counter.** Verified on a rendered still: the vertical smear reads as a spinning drum; the isotropic blur reads as a mistake.
4. **Resting exactly on integers.** The value driver must reach its target exactly, and the roll must be exactly 0 or 1 at rest. Use `Math.min(1, Math.max(0, …))` and a `roll > 0.006 && roll < 0.994` gate to switch the filter off entirely at rest so the final frame is razor sharp.
5. **Landing on a beat.** See §4.4.

### 4.2 The carry formula (this is the bit everyone gets wrong)

Column `i` (0 = units) shows `floor(value / 10^i) mod 10`. Let `φ = frac(value / 10^i)`.

```
c_0 = 1                        // the units wheel turns continuously
c_i = 0.1 * carryArc   (i ≥ 1) // carryArc = fraction of the LOWER wheel's revolution
roll_i = clamp01( (φ - (1 - c_i)) / c_i )
```

`carryArc = 0.30` gives the mechanical Geneva-drive look: the tens wheel turns during the last 30% of the units wheel's revolution, i.e. from `…97` to `…100`.

**The wrong version I tried first**, `roll_i = clamp01((φ - 0.86)/0.14)`, starts the hundreds wheel at `…860`, 140 counts early, so the hundreds wheel finishes its carry while the tens wheel still reads 9. It looks plausible in code and is visibly wrong on a still. Caught by rendering frame 47 of a count to 512,480 and seeing two decoupled columns rolling.

### 4.3 Complete working odometer (rendered and verified)

```jsx
import React from 'react';
import { C, DISPLAY } from './theme';

// Tabular digit advance as a fraction of font-size. Measured off Archivo's .tf glyphs.
export const TAB_ADV = {
  100: {500:0.573,600:0.579,700:0.598,800:0.627,900:0.667},
  108: {500:0.622,600:0.631,700:0.649,800:0.676,900:0.714},
  125: {500:0.724,600:0.742,700:0.758,800:0.782,900:0.815},
};
export const COMMA_ADV = {
  100: {600:0.300,700:0.307,800:0.318,900:0.333},
  108: {600:0.304,700:0.314,800:0.328,900:0.348},
  125: {600:0.312,700:0.327,800:0.349,900:0.381},
};

/**
 * Odometer.
 *  value    : a float. Column rolls derive from its fractional parts.
 *  carryArc : 0.30 = mechanical. 1.0 = every wheel spins (flip-clock look).
 *  blurMax  : peak vertical stdDeviation in px at mid-roll. 26 at size 132.
 *  pad      : minimum digit count (leading zeros), 0 = natural.
 *  id       : MUST be unique per instance; it namespaces the SVG filter ids.
 */
export const Odometer = ({
  value, size = 132, weight = 800, width = 108, colour = C.ink,
  group = true, blurMax = 26, carryArc = 0.30, pad = 0, id = 'odo',
}) => {
  const adv    = (TAB_ADV[width]?.[weight]   ?? 0.676) * size;
  const commaW = (COMMA_ADV[width]?.[weight] ?? 0.328) * size;
  const rowH   = Math.round(size * 1.10);
  const n = Math.max(pad, String(Math.max(0, Math.floor(value))).length);

  const cols = [];
  for (let i = 0; i < n; i++) {
    const u   = value / Math.pow(10, i);
    const d   = Math.floor(u) % 10;
    const phi = u - Math.floor(u);
    const c   = i === 0 ? 1 : 0.1 * carryArc;
    cols.unshift({ d, roll: Math.max(0, Math.min(1, (phi - (1 - c)) / c)) });
  }

  const kids = [];
  cols.forEach((col, idx) => {
    const fromRight = cols.length - 1 - idx;
    kids.push(
      <Col key={'d' + idx} {...col} adv={adv} rowH={rowH} size={size}
           weight={weight} width={width} colour={colour} blurMax={blurMax}
           uid={`${id}-${idx}`} />
    );
    if (group && fromRight > 0 && fromRight % 3 === 0) {
      kids.push(
        <span key={'s' + idx} style={{
          display: 'inline-block', width: commaW, textAlign: 'center',
          fontFamily: DISPLAY,
          fontVariationSettings: `'wght' ${weight}, 'wdth' ${width}`,
          fontWeight: weight, fontSize: size, lineHeight: `${rowH}px`,
          height: rowH, color: colour, opacity: 0.42,
        }}>,</span>
      );
    }
  });

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start',
      fontVariantNumeric: 'tabular-nums',
    }}>{kids}</div>
  );
};

const Col = ({ d, roll, adv, rowH, size, weight, width, colour, blurMax, uid }) => {
  const st = {
    display: 'block', fontFamily: DISPLAY,
    fontVariationSettings: `'wght' ${weight}, 'wdth' ${width}`, fontWeight: weight,
    fontSize: size, lineHeight: `${rowH}px`, height: rowH, color: colour,
    fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum' 1",
    textAlign: 'center', letterSpacing: 0,     // tracking MUST be 0 inside a column
  };
  const moving = roll > 0.006 && roll < 0.994;
  const sd = moving ? (blurMax * Math.sin(roll * Math.PI)).toFixed(2) : 0;

  return (
    <div style={{ height: rowH, width: adv, overflow: 'hidden', position: 'relative' }}>
      {moving && (
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
          {/* VERTICAL-ONLY blur. stdDeviation="0 N" is the whole trick. */}
          <filter id={uid} x="0" y="-30%" width="100%" height="160%"
                  colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation={`0 ${sd}`} />
          </filter>
        </svg>
      )}
      <div style={{
        transform: `translate3d(0,${(-roll * rowH).toFixed(3)}px,0)`,
        filter: moving ? `url(#${uid})` : 'none',
        willChange: 'transform',
      }}>
        <div style={st}>{d}</div>
        <div style={st}>{(d + 1) % 10}</div>
      </div>
    </div>
  );
};
```

Notes verified during rendering:
- `letterSpacing: 0` inside the column is required. Inheriting `-0.032em` shifts the glyph off the column centre by 2.1px at size 132.
- `rowH = round(size * 1.10)`, rounding to an integer keeps `translateY` on whole pixels at roll 0 and 1, so the resting frame has no sub-pixel softness.
- `colorInterpolationFilters="sRGB"` is required. Without it Chrome blurs in linearRGB and a pale lime digit (`#E2F98B`) on near-black (`#04040a`) developed a visible green fringe.
- `filter: url(#…)` promotes the layer; combined with `overflow: hidden` on the parent, the blur is clipped to the column and does not bleed into neighbours.

Optional polish (UNVERIFIED, not rendered): add `maskImage: linear-gradient(to bottom, transparent 0, #000 12%, #000 88%, transparent 100%)` on the clip container so the digit fades at the drum's top and bottom edges instead of being hard-cut. Worth trying on the hero number only.

### 4.4 Count-up easing, and landing a big number on a beat

**Use `swell` = `cubic-bezier(0.22, 0.61, 0.20, 1)`, never linear.** Linear is the tell: the number arrives at a constant rate and stops dead. `swell` reaches 50% at 16.8% and 90% at **47.4%** of duration, genuinely decelerating, unlike `out` which is done at 33%.

**The beat maths.** At 120 BPM, a beat is 30 frames. A count-up should:
- **Start** on an off-beat (beat + 15f) so it does not compete with a hit.
- **Reach 99%** exactly 8 frames *before* the landing beat. `swell` hits 99% at 79.7% of duration, so `dur = (beatsToTarget * 30 - 8) / 0.797`.
- **Rest** on the integer from that point, so the eye has 8 frames of a perfectly still number before the beat lands on it.

Worked example, 512,480 landing on beat 12 of a section, starting at beat 4:
```
travel  = (12 - 4) * 30 = 240f
dur     = (240 - 8) / 0.797 = 291f    // longer than the travel: it finishes early by design
```
Simpler and better in practice: **make the count `dur` exactly the travel, and put a 6-frame `soft` scale punch (1.0 → 1.035 → 1.0) on the whole number ON the landing beat.** The count settles, then the number *lands*. Two events, not one.

```jsx
export const CountUp = ({ from = 0, to, at, dur, ...rest }) => {
  const f = useCurrentFrame();
  const p = interpolate(f - at, [0, dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.22, 0.61, 0.20, 1),   // `swell`
  });
  // Snap the last 2 frames so the rest state is EXACTLY the integer.
  const v = (f - at) >= dur - 2 ? to : from + (to - from) * p;
  return <Odometer value={v} {...rest} />;
};

// The landing punch, applied to the whole number, ON the beat.
export const Land = ({ children, at }) => {
  const f = useCurrentFrame();
  const s = interpolate(f - at, [0, 4, 10], [1, 1.035, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.30, 1),
  });
  return <div style={{ transform: `scale(${s.toFixed(4)})`, transformOrigin: 'left center' }}>{children}</div>;
};
```

### 4.5 Kinds of number, and what to do with each

| Number | Treatment |
|---|---|
| **A big number collapsing to a small one** (six digits to four) | Not a count-up. A *collapse*: run the odometer **backwards** with `carryArc = 0.8` so several columns spin at once, over 24f, then have the leading columns simply vanish (opacity + 4px vertical rise, 8f, `in`) as the number shortens. Never re-centre mid-collapse, right-align the whole block. |
| **A count that gains digits** (one digit to four) | Grow the digit count. Reserve 4 columns from the start with `pad={4}` and leading zeros at `opacity: 0.12`, so the block never changes width. The zeros light to full as their column becomes significant. |
| **The hero number** (three digits) | The hero. 3 columns, `size = 180`, `weight = 800`, `blurMax = 34`. Count from 0 over 60f (2 beats) with `swell`, land with `Land` on the beat. |
| **Supporting figures** (a count and a label) | Static, no roll. Use `MaskRise` per digit-group instead. Not everything numeric needs an odometer; three odometers in 40 seconds is one too many. |

---

## 5. SEMANTIC MOTION, one per film

The rule: **exactly one word in the film animates its own meaning, and it is never remarked upon.** If you do it twice the audience notices the device and stops watching the film. Six techniques, ranked as they were for the worked example, where #1 was the pick. The example words are stand-ins; use your film's own.

### 1. The line that relaxes (for example "TAKE THE EVENING OFF")
The closing line arrives **already finished**, no entrance, cut straight to it at full opacity. The only motion in the entire shot is the type going *narrower and slightly lighter*: `wdth 118 → 108`, `wght 800 → 740`, over 40f with `out`. It is the visual of tension leaving a body. Because it arrives complete, it also argues a thesis of effortlessness: no effort was expended, including by the film. Uses the `RelaxLine` component in §5.7.

### 2. "FIND", the letters converge
The four letters start scattered across the frame at random offsets (±450px x, ±260px y) with 14px blur, and converge on their kerned positions over 24f, 1f stagger, `out`. Searching, then found. Costs 24f. Works because FIND is 4 characters, per-character is legitimate at that length (§1.2).

### 3. "PROOF", the weight resolves
`wght 120 → 800`, `wdth 74 → 108` over 30f. The word starts as a faint, condensed sketch and *thickens into fact*. This is the `AxisReveal` in §2.3, and it is the most on-brand of the six when the brand's own variable face is the mechanism.

### 4. "REACH", the word crosses the gap
Split the word at the kern: `REA` sits on the left of the frame, `CH` on the right, 700px apart, and they close over 20f with `in` (`0.70,0,0.84,0`, nothing, then everything). The gap closes at the last moment. Reaching across.

### 5. "PIPELINE", the word is a pipe
Set `PIPELINE` at `wdth 62` (Archivo's narrowest instance, verified available) and animate an accent-colour fill travelling left-to-right through the glyphs via `background-clip: text` with a moving `linear-gradient` stop, over 30f. The word becomes the thing it names. **Risk: `background-clip: text` plus `filter` is a known Chrome compositing hazard; test it in isolation.**

### 6. "MEETINGS", the word books itself
Each letter of MEETINGS drops into a slot on an invisible calendar grid, arriving in *non-sequential* order (the order 3,7,1,5,8,2,6,4) rather than left to right, 2f apart, 16f each, `soft`. Scheduling is not sequential. The non-sequential arrival is the whole idea and it is what stops it reading as a stagger preset.

### 5.7 Code for #1 and #2

```jsx
// #1: RELAX LINE. Arrives complete; only relaxes. Width reserved at the WIDE end.
export const RelaxLine = ({
  text = 'TAKE THE EVENING OFF', at, dur = 40, size = 96, colour = C.ink, ready,
}) => {
  const f = useCurrentFrame();
  const p = interpolate(f - at, [0, dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.out,
  });
  const wdth = +(118 - 10 * p).toFixed(2);
  const wght = Math.round(800 - 60 * p);
  const reserve = ready ? measureText({
    text, fontFamily: DISPLAY, fontSize: size, fontWeight: 800,
    letterSpacing: '-0.032em', textTransform: 'uppercase',
    additionalStyles: { fontVariationSettings: "'wght' 800, 'wdth' 118" },
  }).width : 0;
  return (
    <div style={{ width: reserve, whiteSpace: 'pre' }}>
      <span style={{
        display: 'inline-block', fontFamily: DISPLAY,
        fontVariationSettings: `'wght' ${wght}, 'wdth' ${wdth}`, fontWeight: wght,
        fontSize: size, lineHeight: 1, letterSpacing: '-0.032em',
        textTransform: 'uppercase', color: colour,
      }}>{text}</span>
    </div>
  );
};

// #2: FIND. Deterministic scatter (seeded), so renders are reproducible.
export const FindWord = ({ text = 'FIND', at, dur = 24, size = 108, seed = 7, colour = C.ink }) => {
  const f = useCurrentFrame();
  const rnd = (i) => { const x = Math.sin((i + seed) * 127.1) * 43758.5453; return x - Math.floor(x); };
  return (
    <div style={{ display: 'flex', whiteSpace: 'pre' }}>
      {[...text].map((ch, i) => {
        const t = interpolate(f - at - i, [0, dur], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.out,
        });
        return (
          <span key={i} style={{
            fontFamily: DISPLAY, fontVariationSettings: "'wght' 800, 'wdth' 108", fontWeight: 800,
            fontSize: size, lineHeight: 1, letterSpacing: '-0.032em',
            textTransform: 'uppercase', color: colour,
            transform: `translate3d(${((rnd(i) - 0.5) * 900 * (1 - t)).toFixed(1)}px,${((rnd(i + 40) - 0.5) * 520 * (1 - t)).toFixed(1)}px,0)`,
            filter: t < 0.98 ? `blur(${((1 - t) * 14).toFixed(1)}px)` : 'none',
            opacity: interpolate(t, [0, 0.2], [0, 1], { extrapolateRight: 'clamp' }),
          }}>{ch}</span>
        );
      })}
    </div>
  );
};
```

---

## 6. LAYOUT SAFETY, no line ever clips

### 6.1 THE TRAP THAT WILL BITE YOU, and it is not obvious

`@remotion/layout-utils` must be a declared dependency (the kit's `package.json` lists it; if a clean install ever drops it, add it back at the same version as `remotion`). The gotchas below were read in v4.0.484.

Now the real trap, which I found by rendering and reading a still. **`measureText` caches by a key that does not include font-load state, and if you call it during the first render, before the webfont has loaded, you cache a wrong number for the rest of the render.**

Measured on a real render (a 23-character uppercase headline ending in an ellipsis, 100px, `wght 800 / wdth 108`, tracking `-0.032em`):

```
measured during first React render (font not yet loaded)  = 1305.88 px   <- WRONG, 12% small
measured after document.fonts.ready                       = 1484.63 px   <- correct
```

And `validateFontIsLoaded: true` **did not throw**, because the fallback measurement and the real one differed enough to pass its heuristic (`system-ui` vs the specified stack). **Do not rely on it.**

The visible symptom: `fitText` returned **113.25px** where the correct answer was **99.94px**, and the headline overflowed its 1400px box by ~190px. It looked fine in code review.

Two further source-level gotchas I read out of `node_modules/@remotion/layout-utils/dist/esm/index.mjs`:

- **The cache key is** `` `${text}-${fontFamily}-${fontWeight}-${fontSize}-${letterSpacing}-${textTransform}-${JSON.stringify(additionalStyles)}` ``. Note **`fontVariantNumeric` is NOT in the key.** Measuring the same digits with `tabular-nums` and then without returns the *first* result both times. **Workaround: always pass `fontVariantNumeric` inside `additionalStyles`, never as the top-level option.**
- **`fitText` is not a binary search.** It measures once at 100px and linearly extrapolates: `fontSize = withinWidth / width100 * 100`. That is exact for pure advances but wrong the moment you use **px** letter-spacing (which does not scale with font-size), and it does not clamp to a maximum. `fitTextOnNLines` *does* binary search (0.01px precision).

Once fonts are loaded, `measureText` is **exact**: I compared it to a hand-built DOM node with identical styles and both returned **1400.81px** to the hundredth of a pixel. The tool is fine. The timing is the problem.

### 6.2 The gate (this is the correct Remotion pattern)

A module-level flag flipped inside a `.then()` **does not re-render React**, so the frame commits with the stale value. I confirmed this on a still: `ready` printed `false` at frame 8 even though the promise had resolved and the render had continued. You need `useState`.

```jsx
import { useState, useEffect } from 'react';
import { delayRender, continueRender } from 'remotion';

let readyP = null;
const fontsReadyPromise = () =>
  (readyP ??= (typeof document === 'undefined' ? Promise.resolve() : document.fonts.ready));

/** Returns false on the first render, true once every webfont is loaded.
 *  Holds the frame open via delayRender so nothing is ever captured early. */
export const useFontsReady = () => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const h = delayRender('measure-gate');
    fontsReadyPromise().then(() => { setReady(true); continueRender(h); });
  }, []);
  return ready;
};
```

Call it **once at the top of the film's root component** and thread `ready` down through context. Every component that measures must render nothing (or `fontSize: 0`) while `ready === false`.

### 6.3 Binary-search fit component (verified: renders exactly inside its box)

```jsx
import React from 'react';
import { measureText } from '@remotion/layout-utils';
import { C, DISPLAY } from './theme';

const fitCache = new Map();

/** True binary search on real measurements. 0.05px precision, ≤16 iterations,
 *  each measurement itself cached by layout-utils, so this is cheap after frame 1. */
export const fitOnce = ({
  text, maxWidth, maxSize = 200, minSize = 12,
  weight = 800, width = 108, tracking = '-0.032em', transform = 'uppercase',
}) => {
  const key = `${text}|${maxWidth}|${maxSize}|${weight}|${width}|${tracking}`;
  if (fitCache.has(key)) return fitCache.get(key);
  const common = {
    text, fontFamily: DISPLAY, fontWeight: weight,
    letterSpacing: tracking, textTransform: transform,
    additionalStyles: { fontVariationSettings: `'wght' ${weight}, 'wdth' ${width}` },
  };
  let lo = minSize, hi = maxSize, best = minSize;
  for (let i = 0; i < 16 && hi - lo > 0.05; i++) {
    const mid = +((lo + hi) / 2).toFixed(2);
    if (measureText({ ...common, fontSize: mid }).width <= maxWidth) { best = mid; lo = mid; }
    else hi = mid;
  }
  fitCache.set(key, best);
  return best;
};

export const FitLine = ({
  text, maxWidth, maxSize = 200, minSize = 12, ready,
  weight = 800, width = 108, colour = C.ink, tracking = '-0.032em',
  align = 'left', debug = false,
}) => {
  const size = ready ? fitOnce({ text, maxWidth, maxSize, minSize, weight, width, tracking }) : 0;
  return (
    <div style={{
      width: maxWidth, textAlign: align,
      fontFamily: DISPLAY,
      fontVariationSettings: `'wght' ${weight}, 'wdth' ${width}`, fontWeight: weight,
      fontSize: size, letterSpacing: tracking, textTransform: 'uppercase',
      color: colour, whiteSpace: 'pre', lineHeight: 1.0,
      outline: debug ? '1px dashed rgba(255,0,120,.7)' : 'none',
    }}>{text}</div>
  );
};
```

Verified: a 19-character uppercase line through `<FitLine maxWidth={1500} maxSize={220} />` rendered with its right edge inside the 1500px debug box on a real still. The same string through raw `fitText` overflowed.

### 6.4 Two-line fitting, and the width safety belt

For anything that might need two lines, use `fitTextOnNLines` (which *is* a proper binary search) with `maxLines: 2` and pass `additionalStyles: { fontVariationSettings: … }`.

Regardless, add a build-time assertion in the beatmap. **Every headline string in the film should be listed with the box it must fit, and a dev-only check should fail the render if any of them exceed it.** This is cheap and it is the only way to guarantee a 40-second film has zero clipped lines:

```jsx
// Dev-only. Put it in the film's root component behind `ready`.
const SAFE = [
  { text: 'TAKE THE EVENING OFF', box: 1400, size: 96 },
  { text: '700 ORDERS SHIPPED',   box: 1500, size: 120 },
  // …every display string in the film
];
if (ready && process.env.NODE_ENV !== 'production') {
  for (const s of SAFE) {
    const w = measureText({
      text: s.text, fontFamily: DISPLAY, fontSize: s.size, fontWeight: 800,
      letterSpacing: '-0.032em', textTransform: 'uppercase',
      additionalStyles: { fontVariationSettings: "'wght' 800, 'wdth' 108" },
    }).width;
    if (w > s.box) throw new Error(`"${s.text}" is ${w.toFixed(1)}px, box is ${s.box}px`);
  }
}
```

---

## 7. TEXTURE, the polish that is invisible until it is missing

### 7.1 Tracking by size

The worked example's display setting anchors at **98px → −0.032em**. Fitting a log model through that and a neutral point at 20px:

```
track_em(px) = clamp(-0.045, 0.0603 - 0.02014 * Math.log(px), 0.20)
```

| size (px) | tracking (em) | | size | tracking |
|---|---|---|---|---|
| 12 | +0.010 | | 84 | −0.029 |
| 16 | +0.005 | | 96 | −0.032 |
| 20 | 0.000 | | 110 | −0.034 |
| 24 | −0.004 | | 128 | −0.037 |
| 32 | −0.010 | | 150 | −0.041 |
| 40 | −0.014 | | 180 | −0.044 |
| 48 | −0.018 | | 220+ | −0.045 (clamp) |
| 64 | −0.024 | | | |

**Exception, and it overrides the formula:** a deliberately wide-tracked small uppercase label (for example **12 to 15px, weight 700, `letter-spacing: 0.20em`**) is a style choice, not optical compensation. If a brand has one, keep it exactly as specified.

### 7.2 Letterspacing uppercase, done correctly

CSS `letter-spacing` adds the space **after every character, including the last**. On a centred or right-aligned line this pushes the text left by exactly one tracking unit. At 96px with `+0.20em` that is **19.2px of phantom space** on the right.

**The fix, always:**
```jsx
// For any positive-tracked uppercase line:
style={{ letterSpacing: '0.20em', marginRight: '-0.20em' }}
```
For negative tracking (the display sizes), the same applies in reverse, the line is 0.032em *narrower* than the glyphs plus gaps. It matters less because it is small, but for a right-aligned number block it is 3px at 96px. Apply `marginRight: '0.032em'` on right-aligned negatively-tracked lines.

**Never letterspace lowercase.** Body copy at 24px should sit at `0em`. In the worked example a light (300) geometric sans at 24px looked optically tight and got `letterSpacing: '0.005em'`. UNVERIFIED, judged by eye on the render, not measured.

### 7.3 Optical left alignment across cuts

A stack of flush-left display lines that start with different letters does **not** appear flush left, because the font's sidebearings vary from **8** (W) to **78** (H) units. At 96px that is a **6.7px** visible ragged edge, clearly perceptible on a cut between two headlines.

Push each line right by this amount so all ink appears to start at the same place, with the correct overhang for round and pointed shapes:

```js
// em, positive = push right. Derived from Archivo's lsb at wght 800 / wdth 108,
// targeting flat caps as the reference with -0.010em overhang for rounds and
// -0.015em for pointed/diagonal forms.
export const OPT_TRIM = {
  // flat-sided: B D E F H I K L M N P R U -> 0 (omit)
  O: 0.020, C: 0.020, G: 0.020, Q: 0.020, S: 0.022,
  J: 0.034, T: 0.039, V: 0.051, Y: 0.051, A: 0.053, W: 0.055,
  // Punctuation HANGS: pull it fully outside the margin instead.
  '"': -0.058, '\u201C': -0.058, "'": -0.058, '\u2018': -0.058,
  '\u2013': -0.010, '\u2014': -0.010,   // en/em dash have lsb 0: full bleed already
};
export const opticalLeft = (text, size) => (OPT_TRIM[text[0]] ?? 0) * size;

// usage
<div style={{ marginLeft: opticalLeft(text, size) }}>…</div>
```

At 96px this is: O/C/G/Q +1.9px, S +2.1px, J +3.3px, T +3.7px, V/Y +4.9px, A +5.1px, W +5.3px, opening quote −5.6px.

### 7.4 Numerals, optical detail

In Archivo, `one.tf` is **asymmetric**: lsb 102, rsb 51 at wght 800 / wdth 108. Inside a centred odometer column this is invisible (the column is centred on the advance, which is what the glyph designer intended). But if you ever set a static number **right-aligned without tabular figures**, a trailing `1` will appear to sit 51/1000em short. Always tabular; always centred in its column.

`period` and `comma` both have advance **328** and lsb ~68, they are already generous. Do not add margin around a decimal point. The odometer above renders the comma at 42% opacity, which is right: a thousands separator should be structure, not content.

### 7.5 When a full stop belongs at the end of a line

Rules from the worked example:

- **A full stop belongs when the line is a claim the film is closing on.** `TAKE THE EVENING OFF.`, yes, with the stop. It is the last line; the stop is the film ending. Set it at **60% opacity** and **0.6× the tracking** of the line so it reads as a period, not a bullet.
- **No full stop on a label, an eyebrow, a stat caption or a UI string.** `700 ORDERS SHIPPED` has no stop. A string copied from the product's own UI keeps its punctuation verbatim, even an unusual ellipsis, because it is the product's copy.
- **Never a full stop on a line that is one of a set.** If three lines arrive in sequence, either all three end in stops (heavy, avoid) or none do.
- **The full stop should arrive last, on its own beat.** Delay it 6 frames past the last word's entrance and bring it in with an 8f opacity-only fade. It reads as the film exhaling.

```jsx
export const FullStop = ({ at, size, colour = C.ink }) => {
  const f = useCurrentFrame();
  const o = interpolate(f - at - 6, [0, 8], [0, 0.6], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <span style={{
    fontFamily: DISPLAY, fontVariationSettings: "'wght' 800, 'wdth' 108",
    fontSize: size, letterSpacing: '-0.019em', opacity: o, color: colour,
  }}>.</span>;
};
```

### 7.6 Hairline rules as punctuation

A 1px rule is the cheapest way to make type look designed, and the easiest to get wrong.

| Use | Spec |
|---|---|
| **Under an eyebrow** | 1px, `rgba(255,255,255,.12)`, width = the eyebrow's measured width **exactly** (use `measureText`), 12px below the baseline. Draw it with `scaleX(0 → 1)`, `transformOrigin: 'left'`, **14f, `out`**, starting 4f *after* the eyebrow. |
| **Separating a stat from its label** | 1px, `rgba(255,255,255,.12)`, width 64px, sits between them with 20px on each side. Static. |
| **Under the hero number** | **2px**, the film's accent (a brand gradient, in the worked example), width = the odometer's total width. Wipe in over **20f** with `out`, and **only after the count has rested.** |
| **Full-bleed section divider** | 1px, `rgba(255,255,255,.06)`, edge to edge. Wipe from the centre outwards (two halves, `transformOrigin: 'left'` and `'right'`), 18f. |

Three hard rules:
- **A hairline is never 1px at a scaled transform.** If the parent is scaled, use `height: 1 / scale` or the rule vanishes on some frames and doubles on others. This produces the flickering-line artefact that instantly reads as amateur.
- **A hairline always animates by `scaleX`, never by `width`.** `width` triggers layout on every frame; `scaleX` is composited.
- **Never centre a hairline under centred text without measuring.** Use the measured width; a guessed width that is 8px off is visible.

```jsx
export const Rule = ({ at, width, dur = 14, thickness = 1, colour = 'rgba(255,255,255,.12)', origin = 'left' }) => {
  const f = useCurrentFrame();
  const t = interpolate(f - at, [0, dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.out,
  });
  return <div style={{
    width, height: thickness, background: colour,
    transform: `scaleX(${t.toFixed(4)})`, transformOrigin: origin,
    willChange: 'transform',
  }} />;
};
```

### 7.7 Rendering quality settings for type

- **`textRendering: 'geometricPrecision'`** on every display element. Without it Chrome may snap advances to whole pixels at some sizes, which produces sub-pixel jitter when the element is transformed. UNVERIFIED at the pixel level; recommended on principle and it costs nothing.
- **`WebkitFontSmoothing: 'antialiased'`**, do **not** set it. On a dark background it *thins* the strokes and Archivo 800 at 96px loses weight. Leave subpixel-off default (`auto`) which in headless Chrome renders greyscale AA.
- **Never apply `filter` to an element containing final, resting type.** Even `blur(0px)` promotes it to its own layer and can shift it by a half pixel. Gate the filter to `'none'` when the animation is at rest, the odometer above does this via the `moving` flag.
- An isotropic motion-blur helper (a plain CSS `blur()`) is wrong for type moving in one direction. For type moving vertically (all masked rises, all odometers) use the SVG vertical-only filter from §4.3. For type moving horizontally, use `stdDeviation="N 0"`.

---

## 8. THE ONE-PAGE BUILD ORDER

1. Check `@remotion/layout-utils` is installed (the kit declares it).
2. Put `useFontsReady()` at the top of the film's root component and thread `ready` down. **Nothing measures before it is true.**
3. Measure your face and put its `TAB_ADV` / `COMMA_ADV` / `OPT_TRIM` tables in the film's `theme.ts` (the ones above are Archivo's).
4. Use the §4.3 `Odometer` for any number that changes (real carry, vertical-only blur, correct column widths).
5. Use `MaskRise` (§1.3) for display headlines: correct mask padding, `translate3d`, px gaps.
6. Add `FitLine` (§6.3) and put every display string through it.
7. Add the dev-only width assertion (§6.4) so a clipped line fails the render, not the review.
8. Pick **one** semantic device. Use `RelaxLine` on the closing line.
9. Budget the RSVP passages at 9 to 14f per word (§3.2) and derive their durations from `rsvpDuration()` in the beatmap so sound and picture cannot drift.
