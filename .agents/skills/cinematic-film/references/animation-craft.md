# Animation craft: fluidity, staging and legibility

The reference that was missing, and whose absence produced a measurably passing film that a viewer
described as "messy and all over the place" and "unclear what was happening".

Read this **before** `cinematography.md`. Cinematography tells you how to move a camera. This tells
you when not to.

---

## 0. THE FAILURE THIS FILE EXISTS TO PREVENT

Two films were made for the same brief. Both failed, in opposite directions.

| | cut 1 | cut 2 | what a viewer said |
|---|---|---|---|
| frozen runtime | 80.4% | 0.0% | "boring and lame" / "messy and all over the place" |
| motion energy | 0.36 | 3.65 | |
| cuts | 0 in 100s | 36 in 40s | |
| mean shot length | ~100s | 1.43s | |
| held (settled) frames | ~80% | ~0% | |
| verdict | dead | frantic | |

Cut 2 passed **nineteen of nineteen** automated gates. It was worse to watch than it measured,
because of the mechanism below.

### The mechanism: a partly-automated quality bar becomes an automated quality bar

The quality criteria were split. Ten were numeric and enforced by the audit tool. Fourteen were
prose "eye gates" in a markdown file. Under pressure to pass, the numeric ten became the entire
specification and the prose fourteen were silently abandoned. Not consciously. It simply happened,
because one set failed the build and the other did not.

Worse, the numeric gates were **satisfiable by the wrong means**:

| gate | intended to buy | how it actually got satisfied |
|---|---|---|
| motion energy ≥ 2.5 | a film that is alive | a camera moving on a random seed every shot, starfield parallax at 2.2×, 99 background threads, grain regenerating at 30 Hz |
| cut density ≥ 1 per 3s | edit rhythm | 28 cuts at 1.43s, below the legibility floor for anything with text on it |
| luma sd ≥ 12 | contrast | flashes and polarity breaks with no dwell either side |

Every one of those is **uncorrelated motion**, which is the textbook definition of visual noise.

> **The rule.** If a quality criterion matters, make it fail the build. Any criterion left as prose
> beside criteria that are enforced will be traded away to satisfy the enforced ones. This is
> Goodhart's law operating inside a single agent's workflow.

And the second-order rule: **a floor without a ceiling is an instruction to maximise.** Every gate in
the original tool was a minimum. Motion energy ≥ 2.5 with no upper bound reads as "more is better",
and more is not better. §5 gives the two-sided replacements.

---

## 1. SPRINGS, NOT EASING CURVES

`interpolate` + `Easing.bezier` produces motion with **no mass**. It is a position curve, not a
physical object. Springs produce motion with momentum, overshoot and settle, and that difference is
exactly what a viewer means by "fluid".

Remotion ships `spring()` natively ([docs](https://www.remotion.dev/docs/spring)):

```js
spring({ frame, fps, from, to, config, durationInFrames, delay, reverse, durationRestThreshold })
```

Config defaults: `mass: 1`, `damping: 10`, `stiffness: 100`, `overshootClamping: false`.

### The critical feature: `durationInFrames`

`durationInFrames` stretches the spring curve to an exact frame count. This resolves the apparent
conflict between "spring physics" and "every move lands on the beat grid": you get the physical
*shape* and you pin the *duration*. Always pass it in a beat-locked film.

```js
const t = spring({ frame: f - at, fps, config: SPR.arrive, durationInFrames: 24 });
```

### The preset kit

Do not invent spring configs per element. Six, named by intent, used consistently:

| name | mass | damping | stiffness | overshoot | use |
|---|---|---|---|---|---|
| `arrive` | 1 | 200 | 120 | none | the workhorse. Cards, panels, rows. Critically damped, no wobble |
| `settle` | 1 | 26 | 170 | ~3% | text and small elements. One barely-visible overshoot |
| `pop` | 0.6 | 14 | 320 | ~9% | badges, ticks, counters landing. Reads as snappy |
| `weight` | 3.2 | 42 | 90 | ~2% | anything that should feel heavy: a stack of layers landing, a lid closing |
| `glide` | 1.4 | 60 | 40 | none | camera moves. Slow, no bounce, no stop-frame |
| `whip` | 0.4 | 11 | 480 | ~14% | one or two moments per film, maximum |

`overshootClamping: true` on `arrive` and `glide`. A camera that overshoots reads as a mistake, not
as physics.

### Where easing still wins

Springs are wrong for anything that must be **linear in perception**: a progress bar filling, a
counter counting, a marquee, a specular sweep at constant velocity, a cross-fade. Use easing there.
The tell of a novice is a spring on a progress bar; the tell of a professional is knowing that a
progress bar that springs is lying about the progress.

### Overshoot is not optional decoration, it is the mass

An object that arrives and stops dead has no weight. An object that arrives, passes its mark by 2 to
9% and returns has weight proportional to the overshoot. Big heavy things overshoot **less** and
settle **slower** (`weight`); small light things overshoot **more** and settle **faster** (`pop`).
Getting this backwards is why motion can be technically springy and still feel cheap.

---

## 2. THE RULE OF ONE MOTIVATOR, MADE MEASURABLE

Restated from `cinematography.md` §3.3, because it is the single most violated rule in the corpus:

> In any given 15-frame window, either the camera moves or the subject moves, not both at meaningful
> amplitude.

The reason this is *the* rule: a camera move changes **every pixel in the frame**. A subject move
changes a small region. Run both together and the subject's motion is buried inside the camera's,
so the viewer's eye has nothing to lock onto. It is not that the frame is too busy in some vague
aesthetic sense. It is that the signal-to-noise ratio of the thing you want watched collapses.

### The measurement: motion concentration

Divide the frame into an 8×8 grid. For each adjacent frame pair compute per-cell mean absolute
luma difference. Then:

```
concentration = (sum of the top 8 cells) / (sum of all 64 cells)
```

- **Camera moving**: every cell changes → concentration ≈ 8/64 = **0.125 floor**
- **One subject moving on a locked camera**: a few cells change → concentration **0.55 to 0.90**
- **Nothing moving but grain**: noise-dominated, unstable, and caught by the freeze gate instead

Target **mean concentration ≥ 0.42** across a film, and **≥ 0.30 in every one-second window**. A film
that dips below 0.20 for sustained stretches is a film where the camera never stops.

This one number is worth more than motion energy, cut count and luma spread combined, because it is
the only one that distinguishes *meaningful* motion from *any* motion.

### Validated against synthetic controls, then against the failure

The metric was proved before anything was built on it, using two clips generated with ffmpeg:

| clip | concentration | |
|---|---|---|
| locked camera, one 140px object moving on a flat field | **1.000** | the ideal |
| **cut 2, the film that passed every v1 gate** | **0.301** | |
| camera panning across a static texture | **0.128** | theoretical floor is 0.125 |

Cut 2 sits close to the "the entire frame is moving all of the time" floor, which is what it was.
The same run measured its **hold fraction at 3.3%** against a 28% floor, and **3% of its shots long
enough to read** against a 35% floor. Those three numbers are the complaint, quantified, and none of
them existed in v1.

Note that the locked-camera control measures a motion *energy* of only 0.17, far below the 2.0 floor.
That is correct. The two metrics are orthogonal and you need both: energy asks whether the film is
alive, concentration asks whether the life means anything.

---

## 3. THE HOLD BUDGET

A hold is not a freeze. A hold is: camera locked, subject static, **quiet life continuing** (micro
drift under 2px, grain, one slow ambient element). `freezedetect` must still return zero events.

**Budget 30 to 40% of runtime in hold.** Contrast is what makes the moving parts read. A film with no
holds has no emphasis, because emphasis is defined against stillness.

| | length | use |
|---|---|---|
| minimum hold | 18f / 0.30s | a beat of air after a fast cut |
| standard hold | 45 to 90f / 0.75 to 1.5s | after any arrival |
| reading hold | **≥ 120f / 2.0s** | any shot carrying text (§4) |
| maximum hold | 150f / 2.5s | beyond this, in a 60s film, it is a dead spot |

### The arrival-settle-hold pattern

Every beat in a well-made film has three parts, and cut 2 had only the first:

1. **ARRIVE** (12 to 24f), the spring does its work
2. **SETTLE** (8 to 12f), the overshoot resolves, secondary elements catch up
3. **HOLD** (45 to 120f), nothing moves. This is where the viewer actually reads and understands

Skipping part 3 is how a film becomes "hard to follow" while every individual moment looks fine.

---

## 4. LEGIBILITY, AS ARITHMETIC

This is the hard floor that cut 2 broke, and the direct cause of "unclear what was happening".

Broadcast subtitle standards, which are the best-evidenced numbers available for how fast a human
reads text on a moving image:

| metric | value | source |
|---|---|---|
| comfortable reading speed | **12 to 20 CPS** | Netflix TTSG, BBC |
| standard for general audiences | **17 CPS** | industry consensus |
| hard maximum | **20 CPS** | Netflix adult content |
| unreadable above | 25 CPS | eye-tracking |
| **minimum display, any line** | **2.0 seconds** | universal across guidelines |
| minimum dwell rate | 13 CPS | |

### Converting to shot lengths

```
required_hold_seconds = max(2.0, characters / 15)
```

15 CPS, deliberately below the 17 standard, because film text is larger, competing with imagery,
and often in a language of jargon. Then add the **cut recovery cost**:

```
shot_length = 0.3 + required_hold_seconds
```

0.3s is the time to reacquire the frame after a hard cut before reading can begin at all.

| on-screen text | chars | minimum shot |
|---|---|---|
| `Map` | 3 | 2.3s |
| `Booked in 4 taps` | 16 | 2.3s |
| `12,480 orders, shipped` | 22 | 2.3s |
| `Now open in three new towns` | 27 | 2.3s |
| a 60-character sentence | 60 | 4.3s |
| a 3-line email paragraph | 180 | 12.3s ← **do not put this on screen** |

The last row is the important one. **If a passage of text needs more than about 4 seconds to read, it
does not belong on screen as text to be read.** It belongs on screen as *texture* that signals "an
email was written", with only the 3 to 6 words that matter set at hero scale and given their own
dwell. Cut 2 put a full three-paragraph email on screen for 6.5 seconds and expected it to be read.

### And the camera must be locked while it is read

Reading requires stable fixation. A drifting camera forces continuous re-fixation, which costs
roughly 30 to 40% of effective reading speed. The 2.0s floor assumes a locked frame. Under a moving
camera, treat it as 3.0s, or better, do not do it.

---

## 5. THE TWO-SIDED GATES

> **Superseded numbers.** The bands in the table below were the first two-sided replacement, written in
> August 2026 before calibration. The calibrated bands (nine canon films plus held-out failures) are in
> SKILL.md section 9 and measured by `npm run audit -- <id>`, and they differ (for example overall motion energy
> 0.30 to 3.00, not 2.0 to 6.5). Keep this table for its reasoning (why every gate needs a ceiling);
> take the numbers from SKILL.md.


Replacing the one-sided gates that got gamed. Each has a floor **and** a ceiling.

| gate | floor | ceiling | why the ceiling |
|---|---|---|---|
| motion energy (60fps) | 2.0 | **6.5** | above this the film is frantic, not alive |
| motion concentration | **0.42 mean** |, | the anti-noise metric. §2 |
| per-second concentration | **0.30 min** |, | catches localised chaos a mean would hide |
| hold fraction | **0.28** | 0.55 | §3. Below is frantic, above is a slideshow |
| shot length | **1.2s min** | 4.0s max | text shots have their own floor, §4 |
| text-shot length | **2.3s** |, | measured on shots the beatmap declares text-bearing |
| cuts per minute | 20 | 48 | 30 cuts in 60s sits mid-band |
| frozen runtime |, | 0.15 | unchanged, it was right |
| luma mean | 0.16 | 0.34 | |
| luma sd | 12 |, | |

**Hold fraction** is measurable as: share of frames whose global motion energy sits in the band
`[freeze_threshold, 0.35 × film_mean]`. Above the freeze floor, so it is alive; well below the mean,
so it is not moving. That band is precisely what a hold is.

---

## 6. STAGING: ONE FOCAL ELEMENT AT A TIME

The evidence is unambiguous and it is the oldest rule in animation. When every element animates
simultaneously the viewer cannot focus on any of them. When elements enter in a deliberate order,
the eye knows where to go.

### Stagger, always

- **3 frames** between items in a list at 60fps (40 to 60ms is the researched band)
- **10 to 14 frames** between an element and its *label*, so the object arrives and is then named
- Never two entrances on the same frame unless they are one visual object

### The lower-third test

A name and a job title animating together is the canonical amateur tell, because the viewer does not
know which to read first. In a product film the same error is: a card, its heading, its three rows
and its badge all arriving at once. Order them. Card, then heading, then rows staggered by 3, then
badge on the beat after.

### Overlap and follow-through

The four principles that carry motion graphics, in order of impact: **easing, timing, follow-through
and overlap, anticipation.**

- **Overlap**: the label starts moving before the card has finished settling. Rigidly sequential
  animation reads as mechanical; overlapping by roughly 40% of the previous move's duration reads as
  organic.
- **Follow-through**: when a card stops, elements *inside* it keep moving for 4 to 8 more frames.
  Implement as a second spring on the children with 1.3× the mass of the parent.
- **Anticipation**: 3 to 5 frames of counter-movement before any large move. A layer that is about to
  slam down lifts 6px first. Without it, large moves read as teleports.

---

## 7. THE ANIMATIC STEP, WHICH IS NOT OPTIONAL

Every professional animation pipeline has this stage and neither previous cut had it. Storyboard,
then **animatic** (timing and blocking only, greyscale, no styling), then animation. The animatic is
where story and pace are settled *before* anyone spends time on beauty.

The relevant discipline for an agent: **render a greyscale, unstyled, correctly-timed version first
and watch it.** Boxes and labels on a flat background, real durations, real cuts. If the story does
not read in the animatic, no amount of grade, grain or glow will fix it, and both failed cuts are
proof: cut 1 was beautiful and dead, cut 2 was beautiful and incoherent. Neither problem was a
rendering problem.

Cost: about 20 minutes. It would have caught both failures.

---

## 8. THE REVISED EYE GATES

Kept from the old list where still right, corrected where wrong, and every one that could be made
numeric has moved to §5 where it fails the build instead.

1. **Watch it once at 1× with no sound and no pausing, then write down what happened.** If you cannot
   list the stages in order, the film has failed regardless of every number. This is the primary
   gate and it belongs first.
2. **Watch at 0.5×.** Anything that only works at speed is hiding a mistake.
3. **Watch the last 3 seconds alone.** That is the frame the viewer remembers.
4. **Freeze on any 10 random frames.** Each should be a composed image, not a mid-transition smear.
5. No linear easing anywhere except continuous loops and progress.
6. Arrivals decelerate, departures accelerate. Never the same curve both ways.
7. Nothing teleports. Every element enters from an on-screen origin.
8. No element both fades and travels more than 60px.
9. No simultaneous mass entrances. Stagger by 3 frames.
10. Maximum 3 to 4 words per hero card, one and two-syllable words.
11. The accent appears about three times. If the accent is on screen more than 15% of runtime it
    has stopped being an accent.
12. Exactly one large Z move in the film.
13. Two polarity flips maximum.
14. No pure `#000` or `#fff` as large fills.

---

## Sources

- [Remotion `spring()`](https://www.remotion.dev/docs/spring) and [`measureSpring()`](https://www.remotion.dev/docs/measure-spring)
- [Motion: spring tutorial](https://motion.dev/tutorials/js-spring) · [The physics behind spring animations, Maxime Heckel](https://blog.maximeheckel.com/posts/the-physics-behind-spring-animations/)
- [Adobe: 12 principles of animation](https://www.adobe.com/creativecloud/animation/discover/principles-of-animation.html) · [Superside](https://www.superside.com/blog/12-principles-of-animation)
- [Visual hierarchy in motion graphics](https://artofstyleframe.com/blog/visual-hierarchy-motion-graphics/) · [Staging in animation](https://animotionsstudio.com/animation-staging/)
- [Subtitle reading speed standards](https://subtitling.net/standards/subtitle-reading-speed) · [SUBTLE recommended quality criteria](https://subtle-subtitlers.org.uk/wp-content/uploads/2023/01/SUBTLE-Recommended-Quality-Criteria-for-Subtitling.pdf) · [Rules for text in videos](https://legibility.info/rules-for-text-in-videos)
- [What is an animatic, Boords](https://boords.com/animatic/what-is-the-definition-of-an-animatic-storyboard) · [Why most motion designers ignore storyboard and animatic, MOWE Studio](https://medium.com/mowestudio-for-creatives/why-most-motion-designers-ignore-both-storyboard-and-animatic-75f6d34fe26e)
- [Optimal shot length and viewer retention](https://medium.com/@info_13818/optimal-shot-length-for-ai-generated-motion-based-on-viewer-retention-a7d86e8c8969)
