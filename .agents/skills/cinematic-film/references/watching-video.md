# Watching video, and the product-film corpus

Written 2026-08-20 after five rejected cuts of one deck film and one accepted
build. Two things live here: **how to actually perceive a film you cannot watch**,
and **what the best product films measure**, because the numbers overturn
cut-rate guidance written for brand films (section 3, finding 1).

---

## 1. You cannot watch video. Say so, then build the instrument.

A language model reads still images and numbers. Nothing else. Every confident
claim about a film that is not grounded in one of those two things is a guess,
and guessing is precisely how five cuts got made and rejected.

"Watching a film" therefore means exactly four operations:

1. **Find the real shot boundaries.** Numbers.
2. **Sample frames** at those boundaries *and* on a fixed cadence. Images.
3. **Tile them at a density that stays legible.** Images.
4. **Measure luminance, motion and audio over time.** Numbers.

For your own film, the kit's commands cover all four:

```bash
npm run audit -- <id>             # numbers: settled runs, motion, luma, loudness; out/<id>/audit.json
npm run sheet -- <id> [step]      # a timestamped contact sheet of the master: out/<id>/sheet.png
npm run stills -- <id> <frame>    # full-size frames to out/<id>/stills/
npm run packet -- <id>            # contact sheets every 1.25 s and sound events, for a reviewer
```

For a reference film you downloaded, use ffmpeg directly (the detectors and
filters below). Measure the candidate **and** every reference at identical
settings, or the comparison is worthless.

### Validate the instrument before you trust it

Run it first against a film whose ground truth is already written down. On a
rejected cut whose mean luma was already recorded (`60.8%`), the instrument
matched it to the decimal and correctly reported the audio stream as absent. Only
then were its other numbers worth anything.

### Four bugs the first instrument shipped with, all of which produce confident nonsense

- **ffmpeg writes filter output to stderr.** `scdet`, `ebur128` and `volumedetect`
  all log to stderr, and `execFileSync` returns stdout only. Every cut count and
  every audio figure came back empty, and the summary printed `null` rather than
  failing. Use `spawnSync` and concatenate both streams.
- **Shot-based sampling assumes cuts exist.** The best product films barely cut.
  Notion 3.0 has two shots in ninety seconds, so one-frame-per-shot returned two
  frames and called the film watched. Sample on boundaries **and** every N seconds.
- **Contact sheet density trades directly against legibility.** A 48-cell sheet of
  a 1920-wide film renders each cell about 200px across, at which product copy is
  unreadable. That is why nobody caught, by looking, that one rejected cut had no
  product in it. 3x2 at 640px cells reads. Anything denser is a thumbnail index,
  not evidence.
- **Give `drawtext` an explicit `fontfile` on every OS.** On Windows, without it,
  the labels silently vanished and the sheet lost its timecodes.

### `scdet` is the right detector, used correctly

Run it at a low threshold and threshold yourself, so the number stays checkable:

```
ffmpeg -i in.mp4 -vf scdet=threshold=4 -an -f null -
# logs: lavfi.scd.score: 51.203, lavfi.scd.time: 12.417
```

Do **not** use `freezedetect` as a gate. It has already reported a continuous
3.70s freeze over a passage whose middle frame measured twice its own threshold.

---

## 2. Cut strength: the metric that was missing

`scdet`'s score is how much of the frame changed, 0 to 100. Take the **maximum
across the whole film** and it answers a question no other number does: *when
this film cuts, does the picture actually change?*

| | cuts | max cut strength | cuts over 40% |
|---|---|---|---|
| A rejected cut (deck film, cut 5) | 16 | **24.2%** | **0** |
| Stripe S700 | 37 | 81.9% | 1 |
| Figma Motion | 17 | 62.9% | 3 |
| Claude Code | 28 | 51.0% | 3 |
| Raycast | 27 | 40.2% | 1 |

Every film that cuts scores 40 to 82. The rejected cut cut sixteen times and never moved
more than a quarter of the frame. The viewer reported this as *"it flowed really
badly"*, and that is exactly what it is: the cost of a montage with none of the
benefit.

> **The rule.** If you cut, the cut must clear roughly 40% cut strength. If it
> cannot, it wants to be a camera move, not a cut. Films with 0 cuts are exempt;
> the metric only indicts films that cut without changing the picture.

---

## 3. The measured corpus (2026-08-20)

Six reference films, downloaded and measured on one instrument. The per-film
reports ship as `corpus/product-2026-08-*.json` (for example
[corpus/product-2026-08-notion3-agents.json](corpus/product-2026-08-notion3-agents.json));
their source URLs were not recorded at the time.

| Film | Runtime | Shots | Mean shot | Luma | Luma SD | Motion | LUFS / LRA |
|---|---|---|---|---|---|---|---|
| Notion 3.0: Agents | 90s | 2 | 45.02s | 87.4% | 7.9 | 2.56 | -15.2 / 7.4 |
| Linear Releases | 30s | 1 | 30.07s | 9.8% | 6.2 | 2.22 | -24.7 / 8.4 |
| What is Claude Code? | 175s | 28 | 6.26s | 36.8% | 45.5 | 4.08 | -14.7 / 3.5 |
| Raycast: It's out | 161s | 27 | 5.95s | 35.1% | 37.2 | 3.77 | -14.2 / 2.1 |
| Figma Motion | 68s | 17 | 4.01s | 50.9% | 51.5 | 13.11 | -13.4 / 1.8 |
| Stripe Reader S700 | 74s | 37 | 2.00s | 50.7% | 35.7 | 9.68 | -19.6 / 4.4 |

### Finding 1: fast-cut guidance is brand-film guidance

"Budget roughly 1.5s mean shot length for a fast 40s piece, that is ~27 cuts" (the
cut budget in `cinematography.md` section 4.1) is correct for a **brand or launch** film. It is wrong for a **software product**
film, and following it is how a demo ends up feeling chopped.

- Software product films cluster at **4 to 45 seconds** mean shot length.
- The two highest-performing (Notion, 15.7M views; Linear) have **one or two
  shots in the entire film**.
- The only film in the corpus at 2.0s mean is Stripe's, and that is a **hardware**
  brand film, a different register entirely.

Pick the pole deliberately. Do not inherit the montage rate by reflex.

### Finding 2: luminance is not the differentiator

The corpus spans `9.8%` to `87.4%` mean luma and every one of them works. Notion
is bright because the product's own UI is light. Linear is near-black because it
is an abstract 3D piece. **Darkness is not the sin, and neither is brightness.**
What matters is that the choice follows from the subject.

### Finding 3: luma SD is a proxy for cutting, so never gate it unconditionally

Look at the two columns together. Films that cut have luma SD **35 to 51**,
because cutting between different setups necessarily swings the exposure.
Single-take films measure **6 to 8** and are not flat, they are coherent.

> **Correction to the audit policy.** A luminance-spread floor applied to a
> single-take film indicts it for the crime of not cutting. Condition any
> spread gate on the detected cut count, or drop it for films under ~3 shots.

### Finding 4: everything has sound

All six carry audio, `-13.4` to `-24.7 LUFS`, LRA `1.8` to `8.4`. Every rejected
cut of that deck film had no audio stream at all. Silence is not a style here, it is an
unfinished deliverable, and it is the single clearest gap between the rejected
work and the corpus.

---

## 4. How the good ones are actually rendered

The two techniques that dominate are both **cheaper** than building a bespoke
vector world, not more expensive.

### Pole A: record the real product, move a camera over it
*Notion, Claude Code, Raycast.*

Notion's film is one continuous screen recording of the real application, framed
in browser chrome on a flat blue ground, with a visible cursor. The "camera" is
scale and position keyframes over that footage: punch in to read the agent panel,
pull back for the page, punch into the table. Trivial to reproduce in Remotion by
embedding the capture and animating a transform.

What makes it read as true:
- Real cursor, real chrome, real UI type at real UI sizes.
- Shows the machine **thinking** in product UI: "Thought", "62 results",
  "Notion 27 / Slack 14", "Updating database...".
- Dense with real nouns: assignees, P0/P1 priorities, actual issue titles.
- The mascot appears only as the agent's own avatar, **inside** the product.

### Pole B: abstract it, but abstract the data model
*Linear.*

Thirty seconds, one unbroken move, near-black, no cuts. Branch lines converge into
a release. Every label is a real issue ID. It is abstract, but the abstraction *is*
the product: that is what a release does to a set of branches.

> **The test that separates the two poles from a screensaver.** Does the object
> encode something true about the thing being sold? Linear's converging branches
> do. The logo's object rebuilt literally is a logo pun, so it can open or close
> a film but it cannot carry the middle.

---

## 5. Directing a field, not simulating one

Building the accepted 20s film produced one lesson worth more than the rest.

The first pass placed ~30 objects with a seeded PRNG across a depth range and
pushed a camera through them. It measured fine. It looked like blurry debris in
the dark, and the opening nine seconds had **no subject at all**, which is the
same dead-frame failure the audit had just found in an earlier rejected cut.

A random field is not direction. The fix was to split the world in two:

- **STAGED**: a handful of hand-placed objects, each positioned so the camera
  meets it as a composed subject at a known beat. These carry every moment.
- **FIELD**: background objects, small and pushed wide, whose only job is parallax.

And a detail that matters more than it sounds: staged objects need some entries
placed **near the lens axis** (`x` around ±0.7). Everything further out exits the
frame before it grows large, which leaves the centre of the picture permanently
empty while the numbers still say the frame is busy.

### Five craft bugs from that build, all found by looking at stills

- **A full-frame screen-blended colour flash reads as a colour cast, not a light
  beat.** A 0.10 lime overlay across the whole frame turned one beat green. If you
  want a breath before a reveal, put it in the sound.
- **An inset `box-shadow` vignette produces a visible rectangular edge.** Use a
  real elliptical `radial-gradient`.
- **A wide, soft glow reads as fog.** A 90px lime spread around the hero hazed the
  whole picture. Tight bloom (about 34px) reads as light; wide spread reads as haze.
- **Depth of field applied hard leaves nothing for the eye to hold.** Blur
  coefficient 1.9 put the entire frame out of focus. Around 0.95 with a 13px cap
  keeps a subject.
- **A tonally flat film has no reveal.** First render measured luma SD 2.0 against
  6.2 for Linear. An explicit exposure arc, opening deeper and lifting into the
  hero, took it to 3.7. If the ending is not brighter or darker than the opening,
  nothing has happened.

---

## 6. Two build traps that kill renders

- **Module-scope `delayRender` waiting on a `FontFace` promise hangs under
  concurrency.** It timed out at frame 203 of 1200 with no useful error. Inline
  the font as a base64 data URI and register `@font-face` synchronously. There is
  then no async load to hang, and the type can never silently fall back to a
  system sans, which is the failure that looks fine in preview and wrong in the
  render.
- **An unstable filter produces NaN that silently poisons an entire audio master.**
  A Chamberlin state-variable filter goes unstable as its coefficient approaches 1,
  which at 48kHz happens around an 8kHz cutoff, well below Nyquist. The output
  measured `+0.80 LUFS`, ffmpeg rejected `measured_I` as out of range, and the
  cause was thirty seconds of DSP earlier. Clamp the coefficient, clamp the filter
  state, and **fail the build on any non-finite sample** rather than muting it.

---

## 7. Getting the references in the first place

ffmpeg is a kit prerequisite; `yt-dlp` is optional and not part of the kit. If
downloads return `HTTP 403`, the yt-dlp build is stale: `yt-dlp -U`. Going from `2026.07.04` to `2026.08.19` turned five
of six failures into successes, and no amount of `--extractor-args` client
switching fixed it beforehand.

Do not build a corpus from SEO listicles. Query the platform directly for real
engagement figures and pick from that:

```bash
yt-dlp --skip-download --flat-playlist -J "ytsearch3:<query>"
```
