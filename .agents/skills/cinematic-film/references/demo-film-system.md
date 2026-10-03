# Demo film system: what `npm run release -- <id>` enforces, and what it cannot

Use this when a film must be repeatable and releasable rather than a one-off: a product demo, a
launch film, anything that will be re-rendered when the product changes. It covers the release
command, the film folder it reads, the product-truth evidence, the bands, and the review the
command cannot do for you.

## 1. The release command

From a clean checkout, after `npm ci` and `npm run doctor`:

```bash
npm run release -- <id>
```

It runs, in order: **typecheck, slop-lint, score, render, master, audit, delivery checks**, and
writes `out/<id>/report.md`. A step that did not run reports **NOT RUN, never PASS**. Read the
report, not the console: the film is released only when every step reads PASS. Anything else,
including a NOT RUN, means it is not.

The individual commands exist for diagnosis (`npm run render -- <id>`, `npm run audit -- <id>` and
so on). A film rendered and mastered by hand is a candidate, never a release, however good it looks.
Uploading or sending the film anywhere is a separate step the person decides on.

## 2. What the command cannot judge: the review layer

Numbers cannot judge story, originality, hierarchy, beauty, product meaning, or whether a screen is
the right screen. So a green report is **permission to review the film as a finished candidate**,
not proof that it works. The review uses the packet:

```bash
npm run packet -- <id>    # out/<id>/packet/: contact sheets every 1.25 s, sound-events.md, the two prompts
```

The two prompts (from `reviews/prompts/`) are the **explain-back** and the **critic**. Rules for both:

- **The reviewer is fresh.** Not the agent or person who made the film, and with no access to the
  brief, the repo, the treatment or `expected.md`. A self-attestation, a checkbox or a recorded
  "looks good" beside executable checks is not independent judgement; it is the Goodhart failure in
  `lessons.md` again.
- **Explain-back**: the reviewer reads the packet once and states the product, the audience, exactly
  three claims and the order of events. Only then is that matched against `expected.md`, which stays
  hidden until matching. Any miss or uncertainty blocks release; fix the film, not the expectations.
- **Critic, five lenses**: composition, comprehension, pacing, sound and brand truth. Give the
  critic equal, opaque evidence for the candidate and for the canon films it is compared with (the
  same packet treatment for each, labels removed). It ranks the candidate in every lens; a pass is a rank at or above the
  middle of the canon (`floor((canon count + 1) / 2)`) in every lens, and no film's own settings can
  weaken that rule.
- **Then watch it**: once at 1x in its real playback surface, once at 0.5x, once with the sound off.
  A reviewer reading stills cannot feel a transition (see `lessons.md`): on a moment whose value is
  motion, a person's reaction to the moving film outranks a still-based critique.
- **Any byte change starts a new candidate.** If the master changes after review (a re-encode, a
  trim, a copy made into a deck), hash it again and review again.

## 3. Choose the mode from the evidence

| Evidence in the brief | Mode |
|---|---|
| The claim is proved by a real interface completing a specific task | Product demo |
| The claim is abstract and can be proved by the film's physical or editorial mechanic | Concept film |
| A concept beat creates the need, then a real interface supplies the proof | Blend |

Do not choose from taste. The resolved mode must agree with the shot mixture: product contains
only product shots, concept contains only concept shots, and blend contains both.

## 4. The film folder

`npm run new-film -- <id>` copies the starter into `src/films/<id>/`. Everything specific to the film
lives there; the shared engine in `src/engine/` is never edited for one film.

| File | Holds |
|---|---|
| `film.ts` | the composition: id, title, component, duration, fps, size |
| `beatmap.ts` | the single source of timing: fps, BPM, sections, named moments |
| `score.mjs` | writes `public/films/<id>/score.wav` from the same beatmap |
| `brief.md` | the brief paragraph, the facts sheet, the claims and their evidence |
| `treatment.md` | the one-page treatment (`direction.md` section 3.8) |
| `expected.md` | what a cold viewer must recover: product, audience, three claims, event order |

Rules that keep it honest:

- **Visible product copy lives in the film's own files or in an evidence image**, never hidden in
  shared engine code.
- **Release-visible copy is evidence-bound.** Each line names a verified claim, each claim names
  hashed evidence, and the line matches the claim text exactly or a declared variant of it. Concept
  mode cannot be used to claim a product state or behaviour that has not been proved.
- **Unknown names fail before render.** A scene, preset or claim the film refers to but does not
  define is an error, not a default.

## 5. Product truth

Every load-bearing product shot uses a current, authenticated, privacy-safe capture of its exact
screen and state. Keep one evidence record per state with the film (a table in `brief.md` is
enough): screen, state, capture time, source, file path, SHA-256 hash and privacy status. The
render uses the exact evidence image as the product layer, with optional crop, focus, highlight,
cursor and neutral framing around it.

A general design-token note cannot support an unseen page. A mascot, marketing palette or public
landing page cannot support private navigation or product state. Generated product UI is
forbidden. A handcrafted reconstruction is a prototype until a side-by-side comparison proves it
against every captured state; tracing a screenshot into React and matching its labels is not that
proof.

Keep demo data obviously fictional. Use reserved domains (`example.com`). Do not attach invented
figures or events to a real company. Inspect every capture for customer, personal and account data
before marking it privacy-safe.

### Public documentary concept films

If private UI is unavailable, do not weaken the product-demo evidence rules. Resolve a different
concept brief only when dated public pages and attributed testimony can carry the story without
simulating operation: public claims only, no product UI shown, and every source rail derived from
the evidence. Render public claim captures as exact documentary pixels. Classify public artwork as
artwork or a concept object. Forbid controls, cursors, workflow states and causal transitions that
the source does not establish.

Publisher material proves only what the publisher said. Testimony proves only the speaker's
attributed words. When the evidence runs out, stop until new privacy-safe operational evidence or
independent proof exists. Reframing the same evidence is not a substitute for proof.

## 6. Motion and sound

Use the named motion presets in `src/engine/lib/motion.ts`. A camera move is one correlated root
transform, not several independently drifting layers. A cursor's state never changes before the
visible click.

Resolve one beatmap for picture and sound. Score events refer to the beatmap's named moments, so a
timing change moves both together. Preview and master audio come from the same `score.mjs`.

## 7. The bands the audit measures

The calibrated bands (version 4 of the audit policy) came from ten independent positive pictures,
nine audio observations and five held-out rejected cuts. Hard picture bands:

| Metric | Band |
|---|---:|
| Frame rate | 23.9 to 60.1 fps |
| Longest settled run | 0.25 to 5.25s |
| Settled fraction | 0.04 to 0.88 |
| Overall energy, 60fps equivalent | 0.30 to 3.00 |
| Active energy, 60fps equivalent | 0.45 to 3.50 |
| Active-frame fraction | 0.25 to 0.98 |
| Motion concentration | 0.42 to 0.90 |
| Mean luma, dark | 24 to 85 |
| Mean luma, standard | 70 to 125 |
| Mean luma, light | 125 to 195 |
| Mean luma, light-mode UI | 195 to 245 (`product-demo-standard.md` section 2.1) |

A full pass also requires audible audio at -16 to -13 LUFS, LRA 6 to 13 LU and true peak -3 to -1
dBTP. Detected cuts, detector-derived mean shot length and detector-derived reading fraction are
diagnostics only: they confuse flashes, morphs, lighting changes and state replacement with
editorial cuts. Gate cuts and text holds on the authored shot list in the beatmap instead.

## 8. Known limits

- Numeric picture checks cannot judge story, originality, hierarchy, beauty, product meaning or
  whether a screen is the right screen.
- Platform copies of canon films are not delivery masters. Their audio measurements describe the
  source files, whilst the release audio bands are mastering targets.
- Scene detection is not an authored edit list.
- A green report is permission to review the film as a finished candidate, not proof that a
  hostile, experienced viewer will love it.
