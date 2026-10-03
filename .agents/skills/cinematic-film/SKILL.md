---
name: cinematic-film
description: Use when the deliverable is moving image or time-based animation, such as a film, trailer, promo, product demo, launch film, teaser, explainer, social cut, logo sting, hero loop, motion graphics, kinetic type, or a Lottie or Rive animation, or a bare request to make a video or animate something. Also use when something must look cinematic or premium, and when judging, critiquing or fixing an existing video.
---

# Cinematic film: you are the director

You are not rendering a video. You are directing a piece that has to hold its own beside the
best work in the world, and the person asking is relying on you to have the idea, defend it,
and make every frame and every sound earn its place. Be the director: decide, push back, commit.

This skill ships inside the cinematic film kit. Paths in `code format` are relative to the kit's
root; links are relative to this file. Every command is one of the kit's npm scripts, takes the
film's id first, and runs the same on Windows, macOS and Linux.

## The four laws

1. **One truth, acted out.** Find the single true thing and make the film's form (camera, edit,
   motion, sound) enact it. A film about speed that moves slowly is a lie the audience feels
   before they can name it.
2. **Nothing from the centre.** Every default (face, colour, move, sound, phrase) is the middle
   of the distribution and reads as slop, whoever or whatever made it. Each choice needs a reason
   from the brand's own world. `npm run lint:slop -- <id>` enforces the detectable ones.
3. **Provenance over spectacle.** True pixels (the real product), true data, true rules (motion
   derived from a real process), designed sound. Fake dashboards, invented numbers, decorative
   metadata and mock billboards are out.
4. **See it before you claim it.** Rendered style frames before motion, an animatic before
   polish, frames read before shipping, loudness measured before "it sounds fine". You cannot
   watch video; you can read stills and numbers ([references/watching-video.md](references/watching-video.md)).

## Seven ways a film dies

Each of these failed a real film between July and October 2026 (one of them only in hindsight).
Know them before you start; the gate in section 9 exists to catch them. The full record is in
[lessons.md](lessons.md).

1. **Dead.** Frozen frames, no cuts, flat light, flat or no sound. A 100 s deck film had zero cuts,
   80% frozen frames, mean luma 7.5% and flat audio. Guard: the settled-run and energy bands, an
   exposure arc in the colour script, a sound arc (section 6.5).
2. **Frantic.** Motion everywhere because a number rewarded it. The next cut of that film was built
   to pass ten numeric floors, scored 19 of 19, and a viewer found it messy and hard to follow: a
   camera on a random seed every shot, 99 background threads, grain regenerating at 30 Hz. Guard:
   two-sided bands, motion concentration, the hold budget, one motivator per 15 frames.
3. **Slop.** The look of the distribution's centre. Dark frosted glass tilted 56 degrees with neon
   glows was rejected on sight while it passed every numeric gate. Guard: section 3 and
   `npm run lint:slop -- <id>`.
4. **Cuts that change nothing.** A rejected cut cut sixteen times and never changed more than a
   quarter of the frame (maximum cut strength 24.2%, where films that cut well score 40 to 82).
   Another ran 21 shots of one picture with the data swapped. Guard: the 40% rule (section 6.2) and
   an authored shot list.
5. **The lie.** A cut reached an investor deck with an invented product world that did not match
   the real application. Guard: the product-truth rails (section 7).
6. **The costume.** Disciplined but default, or the same film for everyone. A tidy 54 s product
   film read, three months on, as a 2024 template: default tech faces, decorative chrome, a flat
   ground, no frame anyone would remember. Then the same six scenes went out to twenty-odd brands
   with the colours swapped. Guard: the swap test and the novelty tests (section 4).
7. **Slow and unclear.** The unknown brand that withholds what it does. A young product's first
   brand film ran 87 s and showed the name at 1:22; the founder called it slow and unclear. A 34 s
   cut that said what the product does in the first two seconds read correctly to a cold viewer.
   Guard: section 6.4, and the cold explain-back before anyone else sees the cut.

---

## 0. Stance

**Direct.** Take the brief, find the truth, propose the film. **Ask at most one question**, the one
whose answer changes the film most; state every other unknown as an assumption you will act on
([references/direction.md](references/direction.md) section 3.1). A list of questions hands the
directing back to the person.

**Push back on bad direction, then commit.** Name what the person actually wants, say which
requested elements work against it and why (one specific reason each), offer the better route
concretely, and if they still want theirs, make theirs well. Say the disagreement once. Never
refuse, sulk, relitigate or sandbag. **Do not block on the answer**: say which version you are
making by default and by when, and how to switch you to theirs.

**Name the technique.** Every plan names its method and why it beats the obvious alternative, in a
clause: "domain-warped fbm in three depth layers, because wisps read as steam and a uniform fog
reads as haze", not "a steam shader". Every type choice names a face and its reason; if the brand's
faces are not to hand yet, name the one you would start from until they are. The table of common
bad requests and what to offer is in `direction.md` section 4.

**Restraint over spectacle.** One object moving with perfect easing across generous space beats
ten things flying around. Most things in a great film hold still.

---

## 1. Route the job

### Tier: scale the process to the piece

| Tier | What | Process | Gate |
|---|---|---|---|
| **S** | Up to ~15s or a loop: logo sting, animated mark, hero loop, UI micro-animation, Lottie/Rive asset, end card | brief, two or three motion ideas as rendered key frames, motion test, final | slop-lint, frame read at every key moment, motion law, loop seam, delivery spec |
| **M** | 15 to 60s: social cut, teaser, launch short, feature clip | + facts sheet, three concepts, treatment, style frames, animatic, designed sound | + numeric audit, one-view explain-back |
| **L** | 45s to 3min: brand film, product or demo film, launch film, investor film | the full process in section 2 | the full gate in section 9 |

When unsure, go up a tier. A tier S piece still gets an idea; it just does not get a committee.

### Register: which film is this

- **Brand or launch film**: mood and meaning; can cut fast; the reveal is an object or an idea.
  Measured canon: [references/reference-films.md](references/reference-films.md) and
  [references/canon.md](references/canon.md).
- **Product or demo film**: a buyer must understand a working product. Barely cuts (4 to 45s mean
  shot), often light, real UI. [references/product-demo-standard.md](references/product-demo-standard.md)
  and `watching-video.md`.
- **Concept film**: abstract the data model, not the logo. Linear's converging branches are the
  model; a logo pun can open or close a film but cannot carry its middle.
- **Ambient loop** (a website hero or background behind type): the idea is a state, not an event.
  One slow cycle, nothing that marks the seam, nothing that pulls the eye off the headline; an event
  every loop grates by the third play. Make the seam exact by construction (noise periodic in time,
  sampled on a circle), frame-driven and seeded. Ship it as `autoplay muted loop playsinline` with a
  poster that is the first frame, a reduced-motion still, and a size budget (about 2.5 MB desktop,
  under 1 MB phone; AV1 or HEVC with an H.264 fallback).

Pick the pole (one long take or montage) deliberately; do not inherit a cut rate by reflex.

### Engine: the free stack is the default

The kit's default is **free**: drawn and scored in code by you, rendered on the machine in front of
you. Paid generation is optional and runs only under the cost rules in
[references/ai-generation.md](references/ai-generation.md).

| Need | Engine | Where |
|---|---|---|
| Spine: edit, type, 2D motion, sync, sound | Remotion (React, deterministic) | `npm run new-film -- <id>` copies `src/films/template/`; shared code in `src/engine/` |
| Real product UI | Authenticated captures of the live product on a demo or synthetic account, composited | section 7 |
| Steam, smoke, water, fire, light, texture, atmosphere | WebGL2 fragment shaders (`src/engine/gl/ShaderCanvas.tsx`) | [references/procedural-graphics.md](references/procedural-graphics.md) |
| Objects, materials, light and camera in 3D | Three.js via `@remotion/three`, PBR, IBL, postprocessing (`src/engine/three/`) | `procedural-graphics.md` |
| Marks and line drawing | SVG paths + `@remotion/paths` | [references/typography-motion.md](references/typography-motion.md) |
| The brand's own marks | Import the approved SVG and geometry with a hash; never redraw | [lessons.md](lessons.md) |
| Lottie or Rive assets | `@remotion/lottie`, `@remotion/rive` | [references/toolchain.md](references/toolchain.md) |
| Score and sound design | Offline DSP from the beatmap (`audio/dsp.mjs`, the film's `score.mjs`) | [references/sound-design.md](references/sound-design.md), [references/dsp-cookbook.md](references/dsp-cookbook.md) |
| Finishing and delivery | ffmpeg: loudness master, colour tags, encode, variants | `toolchain.md` |

The worked example in `src/films/hark/` (a made-up brand) shows the whole pattern; read it, never
edit it.

---

## 2. The process

Each stage has an output. Do not start the next stage without it. Detail and examples:
`direction.md`. Start with `npm run new-film -- <id>`; the paper trail lives in the film's folder.

1. **Brief** (`brief.md`). One paragraph: who watches, where, sound on or off, crop, length, the one
   action after, what is fixed, the deadline.
2. **Gather** (`brief.md`). A facts sheet of twenty or more specific nouns (product, screens,
   numbers, materials, places, rituals, people, brand assets) and a list of the category's ten
   clichés. Read the brand pack and the live product before inventing anything, and read the
   product's **source** for its own rules and copy: on one product a single comment in its code
   stated the film's idea better than a concept round, and the code settled every state and label
   the film needed.
3. **The one truth.** One sentence a customer would recognise as true. If it needs "and", there
   are two films.
4. **Concepts.** Ten loglines, at least three from outside the category. Kill the first idea and
   the remake. Develop three (mechanic, beats, the one frame, sound, risk). Choose one and write
   why the others lost. Run the novelty tests (`direction.md` 3.6): no adjectives, swap, one-line
   prompt, forbids something, silhouette, thirty years, category.
5. **Motion identity and treatment** (`treatment.md`). The behavioural metaphor, its rules and its
   never list, its sound twin; then one page: logline, beats on the grid, colour script, type
   behaviour, sound plan, the poster frame, the risk. Write `expected.md` now too: the product, the
   audience, three claims and the order of events a cold viewer must recover.
6. **Style frames** (`npm run stills -- <id> <frame>...`). Three to five stills rendered in the real
   engine at full resolution: the opening, the poster frame, a product frame, the end. Each passes
   pause-anywhere, squint, 160px thumbnail and slop-lint. Compare side by side with two canon
   references at the same size. **When colour carries state, render every state on every ground it
   will meet**: on one film the accent that marked a finished item vanished the moment the
   background's fill reached the same step of its ramp, and only a frame at that step showed it. Expect three or four
   rounds; each round fixes what only pixels show.
7. **Animatic** (`npm run preview -- <id>`). Greyscale boxes and labels on the real beat grid with a
   scratch pulse. If the story does not read here, no grade will save it. Run the one-view
   explain-back on it.
8. **Build.** The signature move first, as a motion test. Then the film, on the engineering pattern
   (section 8).
9. **Sound** (`npm run score -- <id>`). Score and effects generated from the same beatmap; the sound
   twin of the motion rules; mix; master (section 6.5).
10. **Finish** (`npm run render -- <id>`, then `npm run master -- <id>`). Grade, grain, dither,
    encode, every delivery variant.
11. **Gate.** By tier (section 9): `npm run release -- <id>`, then the review packet
    (`npm run packet -- <id>`) for the explain-back and the critic. Then the crit
    (`direction.md` section 5) in writing.
12. **Record.** What worked and what failed goes into the film's folder; anything that would help
    the next film goes into [lessons.md](lessons.md) as a rule with the situation that taught it.

---

## 3. Taste: the cliché ban

Slop is a position in a distribution, not a tool. The full taxonomy with replacements and free
code-drawn routes: [references/slop-taxonomy.md](references/slop-taxonomy.md). The tells that matter
most:

| Domain | Tell | Instead |
|---|---|---|
| Colour | purple to blue gradients, "AI yellow", beige Canva palettes | one dominant colour and one sharp accent, each named after a real referent |
| Light | glowing orbs, neon glow, noise blob plus bloom, aurora meshes | light only what emits light; motivated light with direction and falloff |
| Surface | glassmorphism and Liquid Glass imitations, default chrome | opaque surfaces; a material only when the brand is that material |
| Layout | tilted floating UI cards, spinning device mock-ups, centred hero plus three cards, bento | the real product flat and true; asymmetric composition, one dominant element |
| Motion | everything fades up with a stagger and overshoots; motion for its own sake; orbit cameras | one signature curve and move; most things hold; script the camera like a character |
| Type | Inter, Roboto, Poppins, Space Grotesk, Geist and friends by default; gradient headline text; typewriter and "Introducing X" reveals | a face chosen for a reason; type behaviour derived from the brand's own rule |
| Transitions | lens flares, zoom blur, glitch and RGB-split wipes, light leaks, liquid blob morphs | the hard cut on rhythm, or the brand's own gesture |
| Sound | stock uplifting beds, risers into the logo, a whoosh on every move, AI voice cadence | a motif someone could hum, designed sound, a real voice, or silence |
| Copy | "Introducing", seamless, unlock, elevate, "not just X, it's Y", emoji | concrete nouns, one truth, a line only this brand could say |
| Chrome | monospace timecodes, coordinates and corner metadata as decoration | only information that is true and useful |
| Generated video | morphing, texture swim, weightless physics, broken cause and effect, plastic skin, uncanny people | one consistent world with rules; never photoreal people in code-drawn work |

Run `npm run lint:slop -- <id>` before every preview render. It fails the build on
non-determinism, wall-clock time and em dashes, and warns on the rest. A suppression needs a reason
on the line it covers (`// slop-lint-ignore <rule> -- <reason>`); a suppression without one is
itself an error.

---

## 4. Novelty and a brand's own motion

`direction.md` sections 3.4 to 3.7. In short: the idea is a **mechanic** (what the form does), not a
look. Diverge to ten, three from outside the category, kill the first, develop three, choose one. A
motion identity is **behaviour, not decoration**: one true physical or behavioural metaphor,
written as rules with timing ranges and a never list, with a sound twin. For a new brand the first
films are asset-building films, so consistency across films matters more than novelty within one.

The three free sources of provenance: true pixels, true data, true rules.

## 5. Type in motion

Choose a face for a reason in the brand's world (its era, material, voice, place), never from a
list, including the lists in this skill. Two families at most on screen, two sizes at most per
frame. Use the brand's own faces when it has them. Variable axes animate (weight, width, optical
size) but only as a meaning, never as a wobble. Check the licence covers video. Load fonts so no
frame can render in a fallback face. Method and catalogue:
[references/type-library.md](references/type-library.md). Entrances, odometers, RSVP and layout
safety: `typography-motion.md`.

---

## 6. Craft law (the non-negotiables)

### 6.1 Motion
- **Linear motion is banned** except continuous loops and progress. Entrances ease out, exits ease
  in, state changes ease in-out. Never the same curve both ways.
- **Springs give mass; curves do not.** Use the six presets in `src/engine/lib/motion.ts` (`arrive`,
  `settle`, `pop`, `weight`, `glide`, `whip`) with `durationInFrames` to pin them to the grid. Heavy
  things overshoot less and settle slower. A spring on a progress bar lies about the progress.
  [references/animation-craft.md](references/animation-craft.md).
- **Never enter from scale(0)**; enter at 0.9 to 0.97 with opacity.
- **Motion blur on every fast move**: real sub-frame accumulation for 3D and shaders, velocity blur
  or `@remotion/motion-blur` for DOM (call `useCurrentFrame()` inside its children).
- **One motivator per 15 frames**: the camera moves or the subject moves, not both.
- **Arrive, settle, hold.** Holds are 30 to 40% of runtime; emphasis is defined against stillness.
- **Follow-through** 40 to 120ms; **anticipation** before any big move; **arcs**, not lines.
- **One z-axis move per film.** Budget it like the accent colour.

### 6.2 Timing

| Beat | Duration |
|---|---|
| Micro-interaction | 120 to 200ms |
| Element transition | 200 to 300ms |
| Scene transition | 300 to 500ms |
| Hero reveal | 600 to 900ms, then let it breathe |
| Stagger per item | 30 to 80ms |

**Legibility is arithmetic.** Any text-bearing shot holds `0.3 + max(2.0, characters / 15)`
seconds with the camera locked. Text that needs more than about four seconds to read is texture,
not copy: set only the three to six words that matter at hero scale.

**The grid.** Lock BPM before placing a cut. At 120 BPM a beat is 15 frames at 30fps, 30 at
60fps, 12 at 24fps. Cuts land on the beat or deliberately on the half-beat. If you cut, the cut
must change the picture (roughly 40% `scdet` cut strength); below that it wants to be a camera move.

### 6.3 Composition and light

One focal point per frame; scale contrast; negative space as a decision; asymmetric over centred;
motivated light with direction, temperature and falloff; one accent, rationed, and in a film with
acts, one colour reserved for one moment. Two type sizes on screen. **The specificity rule**: through
the body of a product film every frame carries a readable specific thing (a proper noun, a name with
a title, a number with its unit). [references/cinematography.md](references/cinematography.md) for
camera, lenses, depth, grade.

### 6.4 Structure

Default arc, scale the lengths and keep the shape: **cold hook** (the striking frame inside two
seconds, no logo, no fade from black), **tension**, **reveal** (best light, best easing, longest
breath), **proof** (two to four beats, one idea each, accelerating), **lift and close** on stillness.
Two breaths per film at most: one near-silence immediately before the biggest reveal, and the last
two seconds. A blank, empty frame just before the lockup is not a breath but an exit: a cold viewer
said it would have stopped watching at one ([lessons.md](lessons.md), lesson 4).

**A brand nobody knows yet says what it does inside two seconds, and keeps saying it.** Apple can
withhold its reveal because everyone already knows Apple. A young product's first brand film ran
87 s at 72 BPM with its name first seen at 1:22, and its founder found it slow and unclear about what
the product does. The recut put the brand's own descriptor on screen from the first frame and built
the product's own list of what it does as each thing happened. **A code-drawn film drifts slow**,
because every element is placed by hand and so arrives one at a time: start at 100 to 120 BPM and
let several things move at once. Run the cold explain-back on the first full cut, before anyone else
sees it; on that film it predicted every one of the founder's points.

Lean right-brain (Orlando Wood, System1): a character or creature, a place, a melody, humour,
something unsaid. Words on screen, voiceover and a rhythmic bed are left-brain features linked to
weaker long-term effect: use them because they are needed, not by habit.

### 6.5 Sound

Sound is half the film; the failure is audio with no arc. Expensive means minimal plus weight:
one filtered pulse, a pad that breathes because it is sidechained (2 to 4 dB), rare enormous
sub hits with a 100 to 200Hz harmonic layer for laptop speakers, saturation as glue, a real reverb
tail, one motif at most. Three-layer effects (transient, body, air); pitch maps to size and
direction; whooshes stop one or two frames before the hit. Every event is placed from the beatmap.
Hits land on the cut frame, erring late. J-cut sections. Master with `npm run master -- <id>` (gain,
an oversampled limiter, then a linear trim that must report "linear"), never plain two-pass
`loudnorm`, which silently goes dynamic on a film with real range. Target -16 LUFS for web brand
films, -14 social-first, -1.5 dBTP; verify integrated, LRA (below 6 LU means no dynamics) and true
peak on the delivered file. Check sync on stems, not the mix: a short window on a low room tone
jitters by 8 dB and fakes early onsets. `sound-design.md`, `dsp-cookbook.md`.

---

## 7. Product truth

[references/product-demo-standard.md](references/product-demo-standard.md) and
[references/demo-film-system.md](references/demo-film-system.md) carry the full contract. The rails:

- **The product pixels are evidence.** Capture the real, current, authenticated product, on a demo
  or synthetic account, never real customer data. Animate editorial crops, focus, highlights, cursor
  paths and framing around those pixels. Generated or invented interface states never ship, and
  calling an invented screen "simulated" does not make it true.
- **One state, one proof record**: screen, state, evidence file, capture time, source, privacy
  status, hash.
- **Show only what is live.** A parked or unbuilt feature does not appear as working.
- **Fictional people, real nouns.** Never attach invented figures to a real named business.
- **Numbers reconcile.** Funnel times value equals revenue; counters sum to the total shown.
- **Never film latency.** Compress the work into the edit; the machine's speed becomes the cut's speed.
- **Show the machine saying no** once; a system that only succeeds reads as a mock-up.
- **Lock the camera and move the data** on UI beats.

---

## 8. The engineering pattern (free stack)

Start every film with `npm run new-film -- <id>`, which copies the neutral starter in
`src/films/template/` and registers the composition. Check `package.json` for the pinned versions
(at the time of writing: Remotion 4.0.532, Three 0.186, React 19). The rules that keep it
reproducible:

- **One beatmap** (`src/films/<id>/beatmap.ts`) owns every frame number. Scenes and the score import
  it. Scenes mount on **global** frames and return null outside their section; never mix offset
  `<Sequence>` frames with beatmap frames.
- **Determinism.** Seeded PRNG only (`src/engine/lib/prng.ts`); never `Math.random()`, `Date.now()` or
  R3F `useFrame` deltas (wall-clock under Remotion). Postprocessing `<Noise>` is wall-clock too:
  grain comes from the deterministic `<Grain>` pass (`src/engine/Grain.tsx`), static unless a film
  asks for `animated`: grain that regenerates every frame is constant motion to the audit and the eye.
- **Shaders** draw synchronously in `useLayoutEffect` and compile once (stable uniform signature);
  compile errors fail the render. Colours go into shaders as **linear** values (`srgbToLinear` in
  `src/engine/color.ts`); tone-map (AgX, or Khronos Neutral when brand colours must hold) and dither
  before 8-bit, or dark gradients band.
- **Fonts** load through `@remotion/fonts`, so no frame renders in a fallback face. Open faces and
  their licence files live in `public/fonts/`.
- **The GPU backend is per machine.** `npm run doctor` checks Node, npm, ffmpeg and ffprobe, disk
  and Chrome Headless Shell, picks the `--gl` backend that works on the machine and writes it to
  `film.local.json` (`FILM_GL` overrides it). `npm run preview -- <id>` renders at half scale; `npm run render -- <id>` renders
  the full master (CRF 12, BT.709, PNG frames; flat, drawn films need the bitrate to keep gradients clean) to `out/<id>/raw.mp4`. Codecs, delivery specs,
  colour tags and platform loudness: `toolchain.md`.
- **Budget renders from measurements, not hope.** Measured on a 2023 laptop with integrated
  graphics: a 16 s test film (type, a full-frame shader, a PBR object, grain) rendered at 172 to 199
  ms per frame at 1080p30; a still costs 0.9 to 2.6 s; a heavy raymarch about 0.2 s per sample per
  frame. On the wrong backend the same heavy frame took 5.7 to 7.9 s. Time a preview on your own
  machine before promising a deadline.

---

## 9. The gate

Nothing ships until the gate for its tier passes, in order. A manual note beside an executable
check is not a gate. A recorded self-attestation is not independent judgement.

**Why the gate is built like this.** A film satisfied a prose checklist and was dead (no cuts in
100 s, 80% frozen). The next film was built to pass ten numeric floors, scored 19 of 19, and the
viewer found it messy: every gate was a floor with no ceiling, and the criteria left as prose were
traded away for the enforced ones (Goodhart inside one agent). Then a cut reached a deck with an
invented product world. **Rules that follow:** gate a band wherever more is not better; make every
criterion that matters fail the build; product truth needs screen-specific evidence. Full record:
[lessons.md](lessons.md).

| Layer | S | M | L | How |
|---|---|---|---|---|
| slop-lint clean | yes | yes | yes | `npm run lint:slop -- <id>` |
| Structural lint before render (holds, text floors, evidence, claims) | | yes | yes | the shot list as data in the beatmap; `demo-film-system.md` |
| Frames read at every load-bearing beat and the longest copy | yes | yes | yes | `npm run stills -- <id> <frame>...`, `npm run sheet -- <id>`; `watching-video.md` |
| Loop seam check (first and last frames match) | loops | | | stills of the first and last frame, compared |
| Numeric bands (settled runs, energy, concentration, luma profile, audio) | | yes | yes | `npm run audit -- <id>` |
| One-view explain-back | | yes | yes | `npm run packet -- <id>`, the explain-back prompt, a fresh reviewer matched against `expected.md` |
| Blind five-lens panel against the canon | | | yes | the packet's critic prompt: composition, comprehension, pacing, sound, brand truth |
| Delivery contract (dimensions, fps, audio, posters, safe zones, crop) | yes | yes | yes | `npm run release -- <id>` |
| The crit, in writing, with frame numbers | yes | yes | yes | `direction.md` section 5 |

`npm run release -- <id>` runs typecheck, slop-lint, score, render, master, audit and the delivery
checks in order and writes `out/<id>/report.md`; a step that did not run reports NOT RUN, never PASS.
A green report is permission to review the film, not a verdict on it
(`demo-film-system.md` section 2).

Numeric bands for the measured layer (calibrated on nine canon films plus held-out failures):
longest settled run 0.25 to 5.25s; settled fraction 0.04 to 0.88; overall motion energy 0.30 to
3.00 (60fps-equivalent); concentration 0.42 to 0.90 on moving frames; mean luma 24 to 85 dark,
70 to 125 standard, 125 to 195 light, 195 to 245 light-mode UI; audio -16 to -13 LUFS, LRA 6 to 13
LU, true peak -3 to -1 dBTP. Detector cut counts are diagnostic only; gate the authored shot
manifest. Never gate luma spread on a film under about three shots.

If it is not beautiful, it is not done. Go to easing and sound first: that is where most "cheap"
comes from. Then go back to the idea: that is where most "forgettable" comes from.

---

## 10. References

| Read | When |
|---|---|
| [references/direction.md](references/direction.md) | **Every job.** Brief, facts, one truth, concepts, novelty tests, motion identity, pushback, the crit, composition |
| [references/slop-taxonomy.md](references/slop-taxonomy.md) | Choosing any colour, face, move, transition, sound or phrase; reviewing anyone's video |
| [references/canon.md](references/canon.md) | Before concepting: what the best films do and what each technique costs in code |
| [references/procedural-graphics.md](references/procedural-graphics.md) | Any shader, 3D, steam, water, light, material or texture work |
| [references/sound-design.md](references/sound-design.md) | Any score or effects; with [references/dsp-cookbook.md](references/dsp-cookbook.md) for the DSP itself |
| [references/type-library.md](references/type-library.md) | Choosing faces |
| [references/toolchain.md](references/toolchain.md) | Engines, formats (Lottie, Rive), finishing, codecs, delivery specs, asset sources and licences |
| [references/ai-generation.md](references/ai-generation.md) | Only when paid generation is wanted, and then its cost rules first |
| [references/animation-craft.md](references/animation-craft.md) | Springs, staging, holds, legibility arithmetic |
| [references/cinematography.md](references/cinematography.md) | Camera, lenses, depth, parallax, cuts, light, grade |
| [references/typography-motion.md](references/typography-motion.md) | Kinetic type, variable fonts, odometers, layout safety |
| [references/watching-video.md](references/watching-video.md) | Before judging any film, including your own |
| [references/reference-films.md](references/reference-films.md) | Measured brand and launch corpus |
| [references/product-demo-standard.md](references/product-demo-standard.md) | Measured demo corpus and the demo register |
| [references/aside-launch-film.md](references/aside-launch-film.md) | An agent demo made cinematic, shot by shot |
| [references/demo-film-system.md](references/demo-film-system.md) | The release command, the film folder, evidence, the review layer |
| `references/corpus/` | Per-film measurements behind the canon and demo tables (JSON) |
| [lessons.md](lessons.md) | What real productions taught, as rules |
| [sources.md](sources.md) | The public sources behind the numbers |
