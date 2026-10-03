# Reference films: forensic dissection

Written in August 2026 for a 40-second product film brief (the worked example throughout): Remotion,
1920x1080, 60fps, 120 BPM (1 beat = 30 frames). The measurements are general; anything specific to
that brief is labelled as the worked example.

**Method note, read this first.** Rather than describe films from memory, the reference assets that
are self-hosted on company CDNs were downloaded and measured with ffmpeg 8.1.2. Every number in §1
and §2 marked **MEASURED** is a real measurement; §0 names the ffmpeg filters, so you can reproduce
them (the original scripts and the 28 downloaded files are not part of this kit). Films that could
not be obtained are marked **DESCRIBED** and their structure is reasoned from written breakdowns,
cited inline. YouTube media download was blocked from the measuring machine (403 on all media URLs;
only storyboard tiles were served), so Apple "Don't Blink", the Aside film, the Vercel Ship opener
and the Arc films could not be measured directly. No timestamp was invented for those.

---

## 0. The one metric that explained a failed film

The autopsy of the failed cut says: 100s, zero cuts, ~80% frozen frames, mean luminance 7.5%.
The obvious inference is "it was too dark". **That inference is wrong, and acting on it would make
the film worse.** Here is the evidence.

Apple's own dark product films, measured off apple.com's CDN in August 2026:

| Apple asset | dur | mean luma | motion energy | frozen frames | cuts |
|---|---|---|---|---|---|
| `macbook-pro/2025/.../anim/pv-hero/large.mp4` | 2.6s | **7.8%** | 0.47 | 81.8% | 0 |
| `macbook-pro/2025/.../anim/hero/xlarge_2x.mp4` | 3.6s | **9.8%** | 1.22 | 51.9% | 0 |
| `macbook-pro/2026/.../anim/performance-c4d/large_2x.mp4` | 2.7s | 22.5% | 4.30 | **0.0%** | 0 |
| `macbook-pro/2025/.../anim/performance-chip-background/large.mp4` | 7.0s | 32.5% | 9.20 | **0.0%** | 0 |

Apple ships a hero film at **7.8% mean luminance**, darker than the failure, and it looks
expensive. So darkness is not the sin.

The sin is **darkness held at a constant state for 100 seconds**. Apple's 7.8% film is 2.6 seconds
long. The moment Apple needs a shot to run 7 seconds, motion energy goes to 9.20 and frozen frames
go to **0.0%**.

**Motion energy** (defined here as mean absolute inter-frame luma difference, 0-255 scale, via
`format=gray,tblend=all_mode=difference,signalstats`) is the metric that actually separates premium
from amateur, and it is the metric the failed cut lost on. Measured across the corpus:

| Asset | motion energy | frozen frames | verdict |
|---|---|---|---|
| `linear_now3` (Linear macro montage) | **21.01** | 0.0% | alive |
| `apple_mbp_chipbg` | 9.20 | 0.0% | alive |
| `apple_airpods_hero` | 7.54 | 29.5% | alive |
| `basement1` (basement.studio) | 6.03 | 44.8% | alive |
| `framer2` (47s film) | 5.33 | 30.4% | alive |
| `framer1` (21s film) | 4.70 | 23.3% | alive |
| `apple_mbp_c4d` | 4.30 | 0.0% | alive |
| `rive_territory` | 3.64 | 25.6% | alive |
| `framer3` (16s, uncut) | 2.85 | 3.4% | borderline |
| `family_01` (60fps UI clip) | 1.36 | 72.7% | UI loop, not film |
| `clay_hero` (17s hero loop) | 0.41 | **95.4%** | dead |
| `linear_refresh` (9s screen capture) | 0.05 | **99.3%** | dead |

Note `clay_hero` and `linear_refresh`: these are real assets shipped by good companies, and they are
statistically dead (95-99% frozen). They get away with it because they are 9-17 second silent loops
sitting behind text on a web page. **A 40-second film with sound cannot borrow that licence.**

**Important fps caveat.** Motion energy is frame-rate dependent: at 60fps consecutive frames are
closer together, so per-frame differences are roughly half those of the same motion at 30fps. Almost
every reference above is 24-30fps. **60fps targets must therefore be halved from the 30fps
reference figures.** Targets for the worked example, stated in 60fps terms:

- motion energy **≥ 2.5** mean (equivalent to ~5.0 at 30fps)
- frozen frames **< 15%**
- mean luma **15-30%** (Apple's dark register, but sustained films sit higher than 2s hero loops)
- luma standard deviation **≥ 12**, luma range **≥ 55** (see §1: the dead assets have sd 0.0-0.2)

---

## 1. MEASURED corpus (full table)

All measured in August 2026. Scene threshold 0.12. Luma sampled 2/s, 0-255 scale reported as % of 255.

| Film | dur (s) | fps | cuts | cuts/min | mean ASL | luma % | luma sd | luma range |
|---|---|---|---|---|---|---|---|---|
| apple_airpods_hero | 7.5 | 30 | 3 | 24.0 | 1.53 | 82.2 | 15.6 | 58.9 |
| apple_mbp_hero | 3.6 | 30 | 0 | 0.0 |, | 9.8 | 3.7 | 9.5 |
| apple_mbp_pvhero | 2.6 | 30 | 0 | 0.0 |, | 7.8 | 1.6 | 3.9 |
| apple_mbp_c4d | 2.7 | 30 | 0 | 0.0 |, | 22.5 | 2.7 | 8.3 |
| apple_mbp_chipbg | 7.0 | 30 | 0 | 0.0 |, | 32.5 | 7.3 | 28.8 |
| framer1 | 21.0 | 30 | 8 | 22.8 | 2.55 | 14.2 | 12.6 | 58.0 |
| framer2 | 47.4 | 30 | 11 | 13.9 | 2.81 | 30.4 | 36.8 | 139.9 |
| framer3 | 16.0 | 30 | 0 | 0.0 |, | 11.6 | 2.9 | 11.2 |
| basement1 | 8.0 | 30 | 8 | 60.0 | 0.80 | 70.4 | 13.5 | 41.9 |
| basement2 | 8.0 | 30 | 2 | 15.0 | 1.90 | 56.7 | 57.2 | 158.5 |
| linear_now1 | 4.2 | 24 | 2 | 28.5 | 1.50 | 51.5 | 20.6 | 59.1 |
| linear_now2 | 6.0 | 24 | 1 | 9.9 |, | 26.7 | 12.0 | 25.5 |
| linear_now2b | 4.9 | 24 | 3 | 36.9 | 1.25 | 31.0 | 21.6 | 53.8 |
| linear_now3 | 6.2 | 24 | 15 | **145.8** | **0.33** | 37.7 | 26.5 | 85.2 |
| linear_refresh | 9.0 | 60 | 0 | 0.0 |, | 19.8 | 0.2 | 0.5 |
| clay_hero | 17.1 | 14 | 0 | 0.0 |, | 46.7 | 0.0 | 0.2 |
| clay_hero2 | 6.0 | 24 | 4 | 39.9 | 1.50 | 49.8 | 21.5 | 73.3 |
| rive_territory | 5.2 | 50 | 2 | 23.2 | 0.62 | 23.8 | 5.7 | 14.5 |
| rive_broadcast | 2.5 | 60 | 1 | 23.8 |, | 33.8 | 13.8 | 31.8 |
| rive_joel | 2.8 | 60 | 1 | 21.6 |, | 29.7 | 3.1 | 8.9 |
| family_01 … family_53 (10 clips) | 2.7-11.5 | 60 | 0-1 | 0-5.2 |, | 12.6-87.9 | 0.2-12.0 | 0.8-36.9 |

**What this table says, bluntly:**

1. **Nothing premium sits still.** Every single narrative asset (as opposed to a UI loop) cuts at
   **13.9 to 145.8 cuts/min**. The median across narrative assets is ~24 cuts/min. The failed film
   ran 0.0 cuts/min for 100 seconds. Even Apple's *7.5-second* AirPods hero animation contains
   **3 cuts** (24.0 cuts/min).
2. **Luma range is the tell, not luma mean.** The two assets with essentially zero luma variance
   (`clay_hero` sd 0.0, `linear_refresh` sd 0.2) are the two deadest. The best long-form assets are
   dark *and* wide-range: `framer1` at 14.2% mean carries sd 12.6 / range 58.0, and `framer2` at
   30.4% mean carries **sd 36.8 / range 139.9**. Dark plus dynamic, never dark plus flat.
3. **Fast opens are real and measurable.** See §2 for the two accelerando patterns.

---

## 2. Film-by-film dissection

### 2.1 Framer long-form film (`framer2`), MEASURED, 47.4s, the single most structurally relevant asset

Self-hosted at `framerusercontent.com/assets/CgG06QT8BUlSAEO3d4bWJgF0YgI.mp4`. HEVC, 1192x688, 30fps,
silent. Contact sheet read: a scroll-narrative for a fictional aerospace brand ("Cowboy Space Corp").

**Verified cut list (seconds):** 1.83, 3.57, 4.53, 5.00, 6.27, 6.30, 6.43, 7.87, 10.57, 11.47, 29.97

**Verified shot lengths (seconds):** 1.73, 0.97, 0.47, 1.27, 0.03, 0.13, 1.43, 2.70, 0.90, **18.50**

This is the most important structural finding in the whole corpus. The film is **front-loaded with a
montage and back-loaded with a sustain**: eleven cuts inside the first 11.5 seconds (ASL ≈ 1.05s,
including a 0.03s and a 0.13s flash-frame pair at 6.27-6.43), then **one unbroken 18.5-second shot**.

Mean ASL 2.81s is therefore a lie about the experience. The film is really two films: a 0-11.5s
trailer at ~57 cuts/min, and an 11.5-30s sustained passage at 0 cuts/min. Motion energy stays at
5.33 with only 30.4% frozen frames across the whole thing, so the long shot is a *moving* shot.

**Type treatment (from contact sheet):** massive condensed grotesque, all-caps, near-white on
near-black. "LOW EARTH ORBIT" and "POWERING HUMANITY FROM THE HIGH FRONTIER" run edge-to-edge:
cap-height ≈ **11-14% of frame height** for the hero lines, tracking visibly negative (approx
-0.02em UNVERIFIED, read off the sheet not from CSS). Copy blocks sit at roughly 1.5-2% frame height.

**Colour discipline:** background is a dark olive-tinted near-black, *not* pure #000. Exactly **one**
accent (a saturated orange) and it appears only on small CTA chips, perhaps 6 appearances in 47s,
each occupying well under 1% of frame area. Final act flips polarity to a white card for the wordmark.

**The ONE structural idea:** *earn the long shot*. Spend cuts early to buy attention, then stop
cutting entirely and let one move play. Most amateur films do the reverse, slow open, panicky end.

### 2.2 Linear macro montage (`linear_now3`), MEASURED, 6.2s, the fastest cutting in the corpus

`webassets.linear.app/.../e7800c833c05c533f9c2e87d379148ef64e05002.mp4`. 24fps, 720p, silent.

**Verified cut list (seconds):** 0.04, 0.17, 0.21, 0.38, 0.54, 0.88, 1.13, 1.21, 2.17, 2.46, 2.50,
2.71, 3.17, 3.63, 4.67

**Verified shot lengths (seconds):** 0.13, 0.04, 0.17, 0.16, 0.34, 0.25, 0.08, 0.96, 0.29, 0.04,
0.21, 0.46, 0.46, 1.04

145.8 cuts/min. ASL 0.33s. Motion energy **21.01** with **0.0% frozen frames**, the liveliest asset
measured, by a factor of two.

I read the contact sheet directly: it is **black-and-white archival macro B-roll**, a hand at a
workbench, solder wire coiling in a metal bowl, a Weller soldering station, extreme-close keycaps
(`%5`, `6`, `T`, `Y`), engineering tables. Shallow depth of field, heavy grain, monochrome
throughout. No type, no UI. It is pure texture used as rhythmic punctuation.

Note the shape of the list: seven cuts in the first 1.21 seconds (down to a **single-frame** 0.04s
shot), then a 0.96s breath, then another burst, then progressively longer shots ending at 1.04s.
That is a **decelerando**: burst, breathe, burst, settle.

**The ONE structural idea:** *texture at a cadence the eye cannot resolve reads as craft.* You are
not meant to see what any individual frame is. You are meant to feel that someone made a thing.

### 2.3 basement.studio reel cut (`basement1`), MEASURED, 8.0s

`cdn.sanity.io/files/9syto90m/production/2fc2a045e5e06690d2c68a574c779cce91075a37.mp4`, 30fps.

**Verified cut list (s):** 1.37, 1.53, 1.73, 1.90, 2.47, 3.80, 5.80, 6.97
**Verified shot lengths (s):** 0.17, 0.20, 0.17, 0.57, 1.33, 2.00, 1.17

A textbook **accelerando-into-decelerando**: a 1.37s establishing hold, then three cuts at
0.17/0.20/0.17s (5-6 frames each at 30fps = **10-12 frames at 60fps**), then each subsequent shot
roughly doubles: 0.57 → 1.33 → 2.00. 60.0 cuts/min overall.

`basement2` from the same reel is the dynamic-range champion: luma sd **57.2**, range **158.5** in
8 seconds, it travels from near-black (47) to near-white (205.5) and back.

**The ONE structural idea:** *cut lengths should follow a geometric progression, not a random walk.*
0.17, 0.17, 0.17, 0.57, 1.33, 2.00 is ×1, ×1, ×3.3, ×2.3, ×1.5. The ear predicts it; the eye relaxes.

### 2.4 Apple product films, MEASURED (assets) + DESCRIBED (editorial)

Measured hero assets are in §0 and §1. The headline craft facts:

- **Apple's dark register is 7.8-9.8% mean luma** and it is used only on 2.6-3.6s single-move shots.
- **Apple's abstract tech films** (`performance-chip-background`, `performance-c4d`) sit at
  **22.5-32.5% mean luma with 0.0% frozen frames**. This is the register for a dark, abstract film:
  dark, constantly moving, never frozen.
- Even a 7.5-second hero animation carries **3 cuts** (`apple_airpods_hero`, 24.0 cuts/min), and its
  motion energy peaks at **81.17**, Apple punches hard at least once.
- `apple_airpods_hero` luma range is **58.9** in 7.5 seconds. Range is deliberate, always.

### 2.5 Apple "Don't Blink" (2016), DESCRIBED, not measured

107 seconds, by Gretel (NY). YouTube blocked; I could not measure it. Verified numbers from
Motionographer's breakdown ([source](https://motionographer.com/2016/09/14/4-ways-dont-blink-is-a-masterclass-of-type-and-rhythm/)):

- **Words hold 5-7 frames each at 29.97fps** = 0.167-0.234s per word. **At 60fps that is 10-14
  frames per word.**
- Reading pace calibrated to **300 words per minute** (5 words/second), deliberately *above* the
  180-220wpm comfortable-reading band, which is the joke and the point.
- Copy is "almost entirely one- and two-syllable words". Words animate one at a time.
- Nearly all action is **2D on the XY plane**; Z-space is broken exactly **once** (the "nits" gag).
- Monochrome discipline; percussion-heavy score; text is cut to the beat.

The four enumerated techniques: (1) animating at perception speed, (2) animating the signified
(visual puns), (3) time as character (pacing variation), (4) breaking the plane, once.

**The ONE structural idea:** *one rule, broken once.* Establish an absolute constraint (2D, XY only)
for 100 seconds so that a single violation of it becomes the most expensive-feeling moment in the film.

**Caution:** 300wpm is right for a comedy recap aimed at fans. A deck film that must be legible on
a projector should sit at **200-260wpm**, and no card should carry more than
3-4 words. General guidance puts comfortable reading at 180-220wpm and a seven-word line at 1.8-2.5s
([source](https://vertex.art/blogs/typography-animation-kinetic-typography)).

### 2.6 Aside launch film, DESCRIBED (full breakdown in [aside-launch-film.md](aside-launch-film.md))

88s, 1280x720, ~30fps. The closest **structural analogue** found for an AI-agent product film: a
real multi-step job, made cinematic, no voiceover.

Its act structure, as a proportion of runtime (this is the transferable part):

| Act | Aside timing | % of film | 40s equivalent |
|---|---|---|---|
| Problem-agitation, named enemy | 0-12s | 13.6% | 0-5.5s |
| Reveal / wordmark | 16-24s | 9.1% | 6.4-9.6s |
| **The demo (the heart)** | 24-56s | **36.4%** | 9.6-24.2s |
| Proof (designed data beat) | 56-60s | 4.5% | 22.4-24.2s |
| Capability + trust montage | 60-78s | 20.5% | 24.2-32.4s |
| Close, polarity flip, URL | 78-88s | 11.4% | 32.4-40s |

Key craft rules confirmed there: type carries the narration; **polarity flips (black↔white) mark
chapter boundaries**; one idea per card; a **single blue accent used about three times in 88 seconds**;
real product-truth labels inside a fictional demo world; only ~3 hero GFX moments in the whole film.

### 2.7 Vercel Ship 2025 opening film, DESCRIBED (studio write-up)

By basement.studio, for the Glass House NYC, mastered for 4K
([source](https://basement.studio/post/behind-the-ship)). Runtime not published; I could not measure it.

The one genuinely stealable technique, quoted from the studio: they animated **"on twos, holding each
pose for two frames," producing 12fps character movement inside 24fps environments**, hand-posed with
no motion libraries, to read "closer to hand-drawn animation" and like "moving comics".

Pipeline: Blender (EEVEE + Cycles), ZBrush, Substance Painter, DaVinci Resolve (Color + Fusion),
After Effects; EXR passes with Cryptomatte for per-layer control. Custom liquid shader built from
position-based masks, procedural noise and layered shaders, flattening every object to **uniform
black silhouettes**. Creative north star: "liquid".

Their companion WebGL piece ([source](https://basement.studio/post/shipping-ship-behind-the-particle-shader-effect-for-vercels-conf))
drives a particle grid from a single RGB control texture: **R = where the logo is, G = how much
movement is allowed (0 disables), B = a gradient that grows the magnet effect** so disconnected
regions blend instead of reading as a circular mask. That three-channel mask idea ports directly to
a canvas or WebGL background of many small objects.

**The ONE structural idea:** *quantise the frame rate of your "machine" elements.* Smoothness is free
in code and therefore reads as cheap; deliberate stepping reads as authored.

### 2.8 Linear's marketing motion, MEASURED (assets) + a structural finding

Measured Linear assets sit at 24fps, 720p, silent, 9.9-145.8 cuts/min, luma 19.8-51.5%.

The more useful finding is negative and I verified it in a headless browser: **linear.app/agents,
/coding-sessions, /plan, /build, /diffs and /insights contain no `<video>` elements at all.** Linear's
product motion is real-time rendered (WebGL/Rive/canvas), not video. The same is true of
**igloo.inc** (Awwwards SOTY), I captured its full network trace and there is not one media file.

**Why this matters:** the current top tier of "film-grade" product marketing is *deterministic
real-time rendering*, which is precisely what Remotion is, so code-drawn film is the right medium.
It also means there are no shot maps to steal from these, their craft lives in easing and state
transitions.

### 2.9 Rive site films, MEASURED, 2.4-5.5s each

`cdn.rive.app/framer/*.mp4`, mostly 60fps native. luma 23.8-76.3%, 0-23.8 cuts/min, motion energy
3.64 on `territory_sequence` with 25.6% frozen. `rive_territory` cut list: 2.00, 2.62 (a 0.62s shot
between two ~2s shots, the short-shot-as-accent pattern again).

**The ONE structural idea:** *a single short shot sandwiched between two long ones is the cheapest
accent in editing.* It costs 0.6s and it makes the surrounding shots feel deliberate.

### 2.10 Family "Family Values", MEASURED (10 clips), the motion-vocabulary reference

benji.org/family-values. Fifty-five clips, **all 1180x2556 at 60fps native**, silent, 2.7-11.5s,
almost all with **zero cuts**, because they are UI interaction recordings, not film. Luma spans
12.6% (dark mode) to 87.9% (light mode) across the set.

The essay is the value, not the shot maps. Its three stated principles are **simplicity, fluidity,
delight**, and the operative one here is fluidity: *"static transitions disrupt the user's sense of
flow and orientation… a lifeless product feels like a dead product, and a dead product feels uncared
for."*

The single most transferable detail: the page ships a **1x / 0.5x speed toggle** on its clips. The
work is built to survive being watched at half speed. That is a QA gate worth adopting directly.

**The ONE structural idea:** *nothing teleports.* Every element that appears must come from somewhere
that was already on screen, and every element that leaves must go somewhere.

### 2.11 Clay, MEASURED, the cautionary tale

`clay_hero` is 17.1s at **14fps**, luma sd **0.0**, motion energy **0.41**, **95.4% frozen frames**.
It is a near-static hero loop. `clay_hero2` by contrast is 6.0s, 4 cuts (39.9/min), ASL 1.50s, luma
sd 21.5, range 73.3, a properly cut piece.

Both ship on the same site. The difference is that one is wallpaper behind a headline and the other
is content. **A film with sound is content.** Do not build wallpaper.

### 2.12 Films in the original brief that could not be verified, stated honestly

**Arc "Arc is here" / Arc Max / Arc Search**, **Cognition/Devin**, **Cursor**, **Lovable**, **Attio**,
**Raycast**, **Superhuman**, **Notion AI**, **Cash App**, **Stripe Sessions**, **Figma Config openers**.
YouTube media is blocked from this environment and none of these self-host a downloadable launch film
that I could find; arc.net, attio.com, cursor.com, raycast.com, superhuman.com, lovable.dev,
cognition.ai and devin.ai all returned **zero** video URLs on scrape. Searches for written shot-level
breakdowns of them returned nothing usable, the Arc searches in particular returned only press
coverage and no motion analysis.

**No timestamps are invented for these.** The only thing asserted about them, from general coverage
rather than measurement, is that Arc's 2022 announcement film was emotive and founder-led rather
than UI-led, which is the opposite of an agent-demo brief and therefore not a model to copy for one.

---

## 3. Ranked transferable devices, with Remotion implementation notes

Ranked by expected impact on the failure mode in §0 (a dark film frozen for 100 seconds).

**1. Never let the frame freeze. Ever.**
Every composition gets a continuous background driver, even under a static foreground. In the worked
example that was one `useCurrentFrame()`-driven parallax starfield + slow nebula drift that runs for
all 2400 frames and is never unmounted. Target motion energy ≥ 2.5 at 60fps, frozen frames < 15%.
```tsx
const drift = (frame * 0.06) % 1920;            // continuous, never resets visibly
const neb   = 1 + 0.04 * Math.sin(frame / 240); // 4s breathing scale
```

**2. Front-load the cuts, earn one long shot.** (framer2: 11 cuts in 11.5s, then 18.5s unbroken.)
Sequence the first 6 seconds at ASL ≤ 0.75s, then let the hero passage run 2-3s per shot.

**3. Geometric cut progression, never a random walk.** (basement1: 0.17, 0.17, 0.17, 0.57, 1.33, 2.00.)
Pick shot lengths from the set {15, 30, 60, 90, 120, 180, 240} frames only. Nothing in between.

**4. Luma range is the budget you must spend.** Target sd ≥ 12, range ≥ 55 across the film. Build in
at least two near-white moments (a polarity-flip card, a bloom peak) to buy the range back.
```tsx
// one full polarity flip, Aside-style, marking the act boundary
const flip = interpolate(frame, [1380, 1395], [0, 1], {extrapolateRight: 'clamp'});
background: `rgb(${4 + flip*246}, ${4 + flip*246}, ${10 + flip*245})`
```

**5. Quantise machine motion; spring human motion.** (Vercel Ship "on twos".)
At 60fps, hold poses 5 frames for a 12fps effective rate on counters, agent status lines and data
glyphs. Keep the hero lead card on a smooth spring. The contrast is the craft.
```tsx
const stepped = Math.floor(frame / 5) * 5;      // 12fps "on fives" at 60fps
const n = Math.round(interpolate(stepped, [720, 810], [0, 87], {extrapolateRight:'clamp'}));
```

**6. Apple expo-out for every arrival.** `cubic-bezier(0.16, 1, 0.3, 1)` is the Apple-smooth curve;
`cubic-bezier(0.4, 0, 0.2, 1)` is the Material standard for the 80% case
([source](https://kitlab.app/en/blog/cubic-bezier-css-easing-guide-2026)). Arrivals ease *out*,
departures ease *in*, never the same curve for both.
```tsx
import {Easing, interpolate} from 'remotion';
const EXPO_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const y = interpolate(frame, [f0, f0+24], [40, 0], {easing: EXPO_OUT, extrapolateRight:'clamp'});
```

**7. Texture bursts as punctuation.** (linear_now3 at 145.8 cuts/min.) Between acts, drop 4-6 shots of
**10-15 frames each** of abstract macro detail (starfield macro, UI micro-crops, data glyphs),
desaturated. Costs under a second, reads as enormous effort.

**8. One accent, roughly three times in the film.** (Aside: one blue, ~3 uses in 88s.) In the
worked example the brand's gradient was the hero and appeared at **exactly three moments**: the
turn, the key action, and the wordmark. Everywhere else, single colours at low area coverage.

**9. Polarity flips mark chapters.** Two flips maximum in 40s. Each is 15 frames.

**10. Type at hero scale.** (framer2 sheet.) Hero lines at **cap-height 11-14% of frame height** , 
at 1080p that is a cap height of **119-151px**, so a face with a cap-height ratio near 0.72 at
roughly **165-210px font-size** (UNVERIFIED for any specific face; measure with
`@remotion/layout-utils` `fitText` rather than trusting this). All-caps for hero lines, tracking -0.02em. Sentence case and
~1.5-2% frame height for supporting copy.

**11. 10-14 frames per word at 60fps** for burst type, 200-260wpm for legible cards. One to three
words per card. One- and two-syllable words only.

**12. Nothing teleports.** (Family.) Every element enters from an on-screen origin.

**13. One rule, broken once.** (Don't Blink.) Keep the whole film on the XY plane, then break into Z
exactly once, at the pull-back that reveals scale, so the reveal costs the viewer something.

**14. Single short shot between two long ones as an accent.** (rive_territory.) Cheapest emphasis available.

**15. Survive 0.5x.** (Family's speed toggle.) Render at half speed and re-watch before shipping.

---

## 4. The 40-second skeleton (the worked example)

A shot list written for the worked example (a product that finds one item in a flood and acts on
it), kept because its frame arithmetic is reusable. The shot descriptions are generic stand-ins.

2400 frames at 60fps. 120 BPM → beat = 30f, bar = 120f, film = 80 beats = 20 bars.
**Every cut below lands on a multiple of 15 frames (an eighth note), so all of them are score-syncable.**

28 shots, 27 cuts. **Mean ASL 85.7f = 1.43s. 40.5 cuts/min.** That sits between Linear's `linear_now1`
(28.5) and `clay_hero2` (39.9), and well inside the measured premium band.

| # | in (f) | out (f) | len (f) | len (s) | t (s) | Shot |
|---|---|---|---|---|---|---|
| **ACT I, THE PROBLEM** | | | | | **0.0-6.0** | *burst open, ASL 0.75s* |
| 1 | 0 | 15 | 15 | 0.25 | 0.00 | Void. One point of light ignites, hard bloom |
| 2 | 15 | 30 | 15 | 0.25 | 0.25 | Second flash, different quadrant |
| 3 | 30 | 45 | 15 | 0.25 | 0.50 | Third flash, third quadrant |
| 4 | 45 | 60 | 15 | 0.25 | 0.75 | A field resolves from the three |
| 5 | 60 | 120 | 60 | 1.00 | 1.00 | Wide: thousands of points drifting |
| 6 | 120 | 180 | 60 | 1.00 | 2.00 | Type: the problem's one number |
| 7 | 180 | 270 | 90 | 1.50 | 3.00 | The people who cannot keep up, greyed, static |
| 8 | 270 | 360 | 90 | 1.50 | 4.50 | Points go dark one by one. The miss |
| **ACT II, THE TURN** | | | | | **6.0-9.0** | *ignition* |
| 9 | 360 | 420 | 60 | 1.00 | 6.00 | Accent sweep ignites the field **(accent 1 of 3)** |
| 10 | 420 | 540 | 120 | 2.00 | 7.00 | Wordmark and the product's own descriptor |
| **ACT III, ONE ITEM'S JOURNEY** | | | | | **9.0-28.0** | *the heart, 47.5% of runtime* |
| 11 | 540 | 630 | 90 | 1.50 | 9.00 | One item's card forms from the field |
| 12 | 630 | 720 | 90 | 1.50 | 10.50 | Its fields populate (stepped, on fives) |
| 13 | 720 | 810 | 90 | 1.50 | 12.00 | A score counts 0 → 87 (stepped) |
| 14 | 810 | 900 | 90 | 1.50 | 13.50 | A chip fires: the event that matters |
| 15 | 900 | 1020 | 120 | 2.00 | 15.00 | Message drafts, type-on at 10-14f/word |
| 16 | 1020 | 1110 | 90 | 1.50 | 17.00 | Send. Light trail leaves frame **(accent 2 of 3)** |
| 17 | 1110 | 1200 | 90 | 1.50 | 18.50 | Reply lands, warm bloom |
| 18 | 1200 | 1320 | 120 | 2.00 | 20.00 | The outcome: a calendar block snaps in |
| 19 | 1320 | 1440 | 120 | 2.00 | 22.00 | **Z-BREAK.** Camera pulls back, the scale revealed |
| 20 | 1440 | 1560 | 120 | 2.00 | 24.00 | At scale: thousands running in parallel |
| 21 | 1560 | 1740 | 180 | 3.00 | 26.00 | The earned long shot: constellation wide, drifting |
| **ACT IV, PROOF** | | | | | **29.0-35.0** | *designed data beat, re-accelerate* |
| 22 | 1740 | 1800 | 60 | 1.00 | 29.00 | Metric 1 |
| 23 | 1800 | 1860 | 60 | 1.00 | 30.00 | Metric 2 |
| 24 | 1860 | 1920 | 60 | 1.00 | 31.00 | Metric 3 |
| 25 | 1920 | 2040 | 120 | 2.00 | 32.00 | All three assemble into one proof card |
| 26 | 2040 | 2100 | 60 | 1.00 | 34.00 | Punch: polarity flip to near-white |
| **ACT V, CLOSE** | | | | | **35.0-40.0** | |
| 27 | 2100 | 2220 | 120 | 2.00 | 35.00 | Closing line, back to void |
| 28 | 2220 | 2400 | 180 | 3.00 | 37.00 | Wordmark + URL, starfield still drifting |

*(Arithmetic verified: 28 shots, contiguous, sum exactly 2400f; every boundary a multiple of 15f;
mean ASL 85.7f = 1.429s; 40.5 cuts/min.)*

**Structural checks against the measured references:**
- Act III is **50.0%** of runtime; Aside gives its demo 36.4%. This skeleton is more demo-heavy
  because it has 40s not 88s and no problem-agitation budget to spare. Acceptable, and it is the
  right bias: the demo is the asset.
- Shot lengths use only **{15, 60, 90, 120, 180}**, geometric, per device #3. Nothing in between.
- Act I ASL = **0.75s**, within 0.05s of `basement1`'s measured 0.80s.
- Shot 21 at 3.0s is the "earned long shot", a compressed version of framer2's measured 18.5s.
- Shot 28 at 3.0s holds the wordmark, **it must still drift**, or it reproduces the frozen failure
  in the last three seconds, and that is the frame a viewer remembers.

**Score alignment at 120 BPM.** Downbeats fall every 120f. Verified against the cut list:
- **On the downbeat** (put kicks and the biggest transients here): f120, f360, f720, f1200, f1320,
  f1440, f1560, f1800, f1920, f2040.
- **On the beat but not the downbeat** (snares, ticks, UI clicks): f180, f270, f420, f540, f630,
  f810, f900, f1020, f1110, f1740, f1860, f2100, f2220.
- **Off-beat eighth notes** (the only two syncopations in the film, both in the opening burst):
  **f15 and f45**. Use hats or risers here, never a kick.

Silence should be used once, hard: **drop everything but a sub for f1320-1380** (the Z-break
pull-back), so the scale reveal lands in a hole. That is the film's one moment of held breath.

---

## 5. The amateur tells: a testable checklist

Each item is either measurable with ffmpeg or checkable by eye in one pass.

**Read this before using the thresholds.** The ten automated gates below are floors written for the
worked example's 40-second brief. A later cut built to pass ten floor-only numeric gates scored 19 of
19 and a viewer called it "messy and all over the place" (see [lessons.md](../lessons.md)): a floor
with no ceiling is an instruction to maximise. The kit's gate now uses two-sided bands
(`SKILL.md` section 9, measured by `npm run audit -- <id>`). Keep this list for its eye checks and
its reasoning, and take thresholds from the bands.

**Automated gates (ffmpeg on the final master):**

| # | Gate | Threshold | Why (evidence) |
|---|---|---|---|
| A1 | Frozen frames | **< 15%** | `clay_hero` 95.4% and `linear_refresh` 99.3% are the dead assets; the failed film was ~80% |
| A2 | Motion energy (60fps) | **≥ 2.5** mean | ≈ 5.0 at 30fps, the median of every live asset measured |
| A3 | Cut count | **25-30 in 40s** | 37-45 cuts/min; measured premium band is 13.9-145.8 |
| A4 | Mean ASL | **1.2-1.7s** | `linear_now1` 1.50, `clay_hero2` 1.50, `apple_airpods_hero` 1.53 |
| A5 | Longest shot | **≤ 180f (3.0s)** | and it must pass A1 locally, within the shot |
| A6 | Mean luma | **15-30%** | Apple's abstract tech register is 22.5-32.5% |
| A7 | Luma sd | **≥ 12** | dead assets measure 0.0-0.2; `framer1` measures 12.6 |
| A8 | Luma range | **≥ 55** | `framer1` 58.0, `apple_airpods_hero` 58.9, `framer2` 139.9 |
| A9 | Every cut on a multiple of 15f | 100% | eighth-note grid at 120 BPM |
| A10 | Audio LRA | **≥ 6** | the failed film was 2.8; flat audio reads as a loop, not a film |

**Eye gates (one pass each):**

11. **No linear easing anywhere.** Linear motion "doesn't exist in the physical world and appears
    halting". If any `interpolate` lacks an `easing`, it is a bug.
12. **Arrivals ease out, departures ease in.** Never the same curve both ways.
13. **Nothing teleports.** Every element enters from an on-screen origin and exits to somewhere.
14. **No element both fades and slides more than 60px.** Amateur work animates every property at once.
15. **No simultaneous mass entrances.** Stagger everything; **40-60ms per item** (2.4-3.6 frames at
    60fps, so use **3 frames**).
16. **Type is legible at first frame.** If a key word cannot be read within 1 second, it is too small
    or too low-contrast.
17. **Max 3-4 words per card**, one- and two-syllable words.
18. **The accent appears about three times.** Count them. If the gradient is on screen more than ~15%
    of the runtime it has stopped being an accent.
19. **Exactly one Z-break** in the whole film.
20. **Two polarity flips maximum.**
21. **No pure #000 and no pure #fff** as large fills: in the worked example the void was `#04040a`
    and white cards sat near `#f7f7fa`.
22. **Watch it at 0.5x.** Family ships a 0.5x toggle on every clip. Anything that only works at speed
    is hiding a mistake.
23. **Watch it with sound off.** If the structure disappears, the picture is doing no work.
24. **Watch the last 3 seconds alone.** That is the frame a viewer remembers, and it is where the
    failed cut died. Run A1 on frames 2220-2400 in isolation: frozen frames must still be < 15%.

---

## 6. Sources

- Motionographer, "4 ways 'Don't Blink' is a masterclass of type and rhythm", https://motionographer.com/2016/09/14/4-ways-dont-blink-is-a-masterclass-of-type-and-rhythm/
- basement.studio, "Behind the Ship", https://basement.studio/post/behind-the-ship
- basement.studio, "Shipping Ship: Behind the Particle Shader Effect", https://basement.studio/post/shipping-ship-behind-the-particle-shader-effect-for-vercels-conf
- Benji Taylor, "Family Values", https://benji.org/family-values
- Kitlab, cubic-bezier CSS easing guide 2026, https://kitlab.app/en/blog/cubic-bezier-css-easing-guide-2026
- Vertex, typography animation / kinetic typography guide, https://vertex.art/blogs/typography-animation-kinetic-typography
- Toptal, motion design principles, https://www.toptal.com/designers/ux/motion-design-principles
- World of Reel, average shot length by director, https://www.worldofreel.com/blog/2026/7/25/film-directors-and-average-shot-length
- Aside launch film dissection: [aside-launch-film.md](aside-launch-film.md)
- Measured assets: apple.com/105/media/*, webassets.linear.app, cdn.rive.app, framerusercontent.com,
  cdn.sanity.io (basement.studio), assets.clayrun.dev, benji.org/media/family-values
