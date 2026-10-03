# The product demo standard

The demo register, measured. Read this when the deliverable is a **product demo**: a film whose
job is to make a buyer understand a working product well enough to act. Read
`reference-films.md` instead when the deliverable is a **brand or launch film**. They are
different registers and the numbers below prove it.

Source of the brief: Vidico, "12 Best SaaS Product Demo Videos in 2026"
(`youtube.com/watch?v=Hf9jmzI1c9Q`), and the guide it points at,
`vidico.com/news/best-product-demo-video-examples/`.

---

## 0. What the source is, honestly

A 5 minute 8 second lead-generation video from Vidico, a video production agency. Uploaded
26 March 2026, presented by "Brandon", **2,235 views and 13 likes** when measured. It names
twelve films, spends about six seconds on each, and finishes with a quiz funnel and two
content offers. It is a sales asset, not a craft breakdown.

The written guide behind it is much better, and it is the thing worth keeping. Author Laura
Chaves, published 30 July 2026, updated 5 August 2026, roughly 27 minutes of reading, with
four external sources cited.

**The video and its own guide do not agree on the list.** Six of the twelve differ:

| In both | Video only | Guide only |
|---|---|---|
| Square, Slack, Grammarly, Xero, Nutrislice, Office 365 | QuickBooks, Semrush, Rosetta Stone, eBay, Box, "Archaeologic" | Notion, RemSense, Canva, Ring, SurveyMonkey, animated end-of-life demo |

"Archaeologic" is what the presenter says at 1:38 for entry five. It matches no company in the
guide and I could not identify it. Treat the video's list as unreliable and work from the guide,
which links every film and states its runtime.

**Three claims in the video do not survive checking.** Detail in §3. The short version: the
headline "1.8x trial signups" appears nowhere in the guide and is in none of its four cited
sources, and two of the films are described as doing something they visibly do not do.

So: take the framework, verify every example, and never quote the 1.8x figure.

---

## 1. The framework, fairly stated

This is Vidico's argument, cleaned up and de-duplicated across the video and the guide. It is
sound. Most of it is not new, but it is correctly ordered, and the ordering is the useful part.

**The thesis.** A demo's job is to reduce how much work the viewer has to do. Every edit
decision either lowers or raises the effort needed to understand what the product does and
whether it applies to them.

**The nine rules, in their working order:**

1. Define the one decision the video has to move. Not "explain the product". Something like
   "get a technical evaluator comfortable enough to start a trial".
2. Pick the single workflow that maps to that decision. If two workflows compete, make two
   films. One film covering both converts on neither.
3. Write the problem before the product. The first ten seconds establish a situation the
   viewer already recognises. The product arrives as the resolution.
4. Choose the format from the product, not from taste. Real interface and a technical buyer
   means screen capture. Abstract or sensitive subject means animation. Physical product means
   live action.
5. Build a realistic data set. Placeholder names and empty dashboards undercut everything else
   in the film.
6. Script to the runtime, then cut 20%. Pacing comes from the cut.
7. Design for sound off first. If it only works with narration, it only works in half the
   places it will be watched.
8. Produce the cutdowns beside the master. Aspect ratios retrofitted later cost more and look it.
9. End on one specific action. "Start your 14-day trial" beats "learn more" because it names
   what happens next.

**Runtime by placement.** Their table, and it is a reasonable starting point:

| Placement | Runtime | Job |
|---|---|---|
| Social feed | 15 to 30s | One feature or one moment |
| Homepage | 60 to 90s | The category and the core value |
| Product page | 90s to 3min | One full workflow |
| Sales enablement | 3 to 5min | Pausable, discussed viewing |
| Onboarding | 2 to 4min, or a series | New user to first value |

**The six failure modes.** These are the best part of the guide and they are all real:

- **The feature tour.** Moves through the nav menu in build order rather than use order. Covers
  everything, holds nobody.
- **The demo that outruns the product.** Shows a workflow that technically exists but is
  slower and rougher than the edit implies. Converts well, retains badly.
- **The 40-second warm-up.** Company history, logo animation, mission statement, then finally
  the product. The viewer left at second twelve.
- **The unreadable dashboard.** Dense analytics screen-recorded at full resolution, watched on
  a phone. Accurate and useless.
- **The demo with no next step.** Persuades, then stops.
- **The one-format master.** One 16:9 file pushed everywhere. Underperforms in every placement
  but the one it was cut for.

**The evergreen argument.** Build the demo as modular segments over a reusable library of
interface assets and motion templates, so a single section can be re-rendered when a feature
changes. Vidico calls this an "asset bank". The kit is built the same way: shared engine code in
`src/engine/`, one folder per film in `src/films/`, every film re-renderable from its own files.

**Their sourced data**, worth keeping because it is checkable:

- Gartner, 646 B2B buyers: 67% prefer a rep-free buying experience.
- Vidyard benchmarks: 65% of viewers finish a video under one minute, 20% for over twenty minutes.
- Wistia, 13M+ videos: almost 40% of companies spend under $5,000 on video production.
- Vidico's own survey, 230+ B2B tech marketing leaders: 42.7% name customer outcomes as the
  most persuasive proof type.

---

## 2. MEASURED corpus

The twelve films from the guide. **YouTube media was 403-blocked from the measuring machine**, so
these were not measured from video streams. What YouTube does serve is subtitle tracks, metadata and
storyboard sprite sheets, and all three were pulled and measured on 19 August 2026.

**Method, and its limits.** Runtimes are exact, cross-checked between `og:video:duration` on
the publisher page and yt-dlp metadata. Word counts are exact, taken from the subtitle tracks
with YouTube's rolling-caption duplicates removed and bracketed cues such as `[Music]` dropped.
Luminance comes from storyboard tiles carved out of the sprite sheets as raw JPEGs.

Two cautions I have to state rather than bury:

- **Cut rate is not measurable here and is deliberately absent from the table.** Storyboard
  sampling intervals range from 0.24s to 1.24s across these twelve films, so any per-film cut
  count is an artefact of sampling density, not of editing. I computed it, saw it track the
  sampling interval almost perfectly, and threw it away. Do not reintroduce it.
- **Decode the sprite sheets by carving JPEGs between the `FFD8FF` and `FFD9` markers.**
  Python's `email` module normalises line endings on binary MIME parts and silently corrupts
  the images. The first pass produced a luminance table that was pure decode noise and looked
  entirely plausible. Every number below is from the corrected pass.

| Film | dur (s) | luma % | luma sd | luma range % | words | words/min of runtime | narration |
|---|---|---|---|---|---|---|---|
| Canva, background removal | 16 | 45.3 | 62.0 | 79.6 | 26 | 97.5 | VO |
| Nutrislice | 23 | 88.6 | 22.1 | 32.0 | 1 | 2.6 | **none** |
| Slack quick start | 46 | 58.3 | 68.5 | 79.8 | 142 | **185.2** | VO |
| Ring Door View Cam | 57 | 35.2 | 28.3 | 53.0 | 40 | 42.1 | diegetic only |
| Square for Retail | 79 | 35.4 | **87.7** | **98.4** | 166 | 126.1 | VO |
| Animated end-of-life | 92 | 40.8 | 49.0 | 73.9 | 212 | 138.3 | VO |
| Grammarly | 100 | 43.5 | 40.2 | 80.6 | 231 | 138.6 | VO + dialogue |
| RemSense | 102 | 57.5 | 71.9 | 99.9 | 158 | 92.9 | VO |
| SurveyMonkey | 115 | 62.4 | 64.2 | 87.4 | 9 | 4.7 | **none** |
| Office 365 | 120 | **85.7** | 42.2 | 100.0 | 273 | 136.5 | VO |
| Notion | 154 | **92.2** | 22.7 | 48.0 | 343 | 133.6 | VO |
| Xero | **699** | 89.2 | 33.5 | 99.0 | 1473 | 126.4 | VO |

Luma % is mean frame luminance as a share of full scale. Luma sd is in 0-255 units, matching
the convention in `reference-films.md`.

### 2.1 The three findings that matter

**Finding 1: the demo register is LIGHT, and the audit had no profile for it.**

Mean luminance across these twelve runs **35.2% to 92.2%**, median about 57%. The brand-film
corpus in `reference-films.md` runs **7.8% to 51.5%**. Those are different worlds, and the
reason is obvious once measured: a demo shows a light-mode SaaS interface, and a launch film
shows a lit object in a dark room.

Converted to the 0-255 scale the audit tool gates on, four films sit **above** the ceiling of
the tool's most permissive profile:

| Film | mean luma (0-255) | `light` profile band | verdict |
|---|---|---|---|
| Notion | 235 | 125 to 195 | **fails** |
| Xero | 227 | 125 to 195 | **fails** |
| Nutrislice | 226 | 125 to 195 | **fails** |
| Office 365 | 219 | 125 to 195 | **fails** |

All four are light-mode UI films, and all four are the exact register a booking product's
demo would live in. A gate that fails Notion is not measuring quality, it is measuring
darkness. The audit therefore gained a fourth profile, `ui-light`, band **195 to 245**,
with positive support from these four independent films. That clears the rule that every
luminance profile needs at least two independent positive films.

**Finding 2: demos narrate at roughly half of comfortable speech.**

The nine narrated films run **92.9 to 138.6 words per minute of runtime**, with Slack's
onboarding tour at 185.2 as the single outlier. Comfortable speech sits at 180 to 220 wpm.
Apple's "Don't Blink" runs kinetic type at 300 wpm.

So a product demo talks at **about half the rate a person reads comfortably**, and it is not an
accident. The viewer is decoding an interface at the same time as listening. Every word per
minute you add above about 140 is taken directly out of the viewer's ability to read the screen.

**Target: 95 to 140 words per minute of runtime. Above 150, cut the script, not the runtime.**

**Finding 3: a quarter of the corpus has no narration at all.**

Nutrislice (23s, one word), SurveyMonkey (115s, nine words) and Ring (57s, diegetic household
dialogue only) carry no explanatory voiceover. SurveyMonkey going wordless for 1:55 is the
aggressive case and it is instructive: with nobody to assert the benefit, every point has to be
demonstrated, which forces the edit to show the product rather than describe it.

This is the strongest argument in the whole corpus for defaulting to no voiceover. It is not a
limitation to work around. Three of twelve of the best demos in a production agency's own list
do the same thing on purpose.

### 2.2 What the frames show

Read from the storyboard contact sheets, not from the guide's descriptions.

- **Square** is kinetic typography on pure black. Single words at enormous scale ("Like",
  "Free", "Plus") filling roughly half the frame width, with small live-action video insets.
  Luma sd 87.7 and range 98.4 are the widest in the corpus, from hard polarity flips between
  black and white cards. It is the set's nearest relative of a kinetic-type launch film.
- **Notion, Xero** are near-continuous light-mode screen capture with real product data.
- **Grammarly** is a live-action narrative with UI cards composited in, warm and cinematic,
  shallow depth of field.
- **Animated end-of-life, Office 365, Nutrislice** are flat 2D illustration, each committed to
  one dominant brand colour field (violet, cyan, pale blue).
- **Ring** is live action with real shallow-DOF cinematography and phone screens held in hand.
- Almost every film in the set **ends on a brand card**. Square closes on the Square mark,
  Canva on a gradient wordmark, Grammarly on "Grammarly, Write Your Way" plus app icons,
  Nutrislice on "that just works".

---

## 3. Where the source fails its own test

Flagged so nobody quotes them as fact later.

**Xero runs 11 minutes 39 seconds.** 699 seconds, confirmed twice, in a list whose entire
thesis is that short demos hold attention and whose own cited Vidyard data says videos over
twenty minutes finish at 20%. The guide prints a runtime for every other film and is the one
entry where the runtime is silently omitted. The video calls it "another iconic example of
clutter versus clarity". It is an eleven-minute feature tour, which is failure mode one in
their own list.

**The 1.8x claim is unsourced.** "Adding a high quality demo to your landing page can increase
trial signups by a whopping 1.8 times" is the headline number of the video and a chapter title.
It appears nowhere in the guide and in none of the guide's four cited sources. Do not repeat it.

**Two films are described as doing something they do not do.**

- The video calls Grammarly a film that "avoids the trap of using messy screen recordings" and
  uses "stylised UI". The frames show a live-action narrative film with UI insets. The guide
  repeats the error, listing its format as "Stylised UI animation".
- The video credits Square with "contextual overlays to show the hardware and software in the
  same frame". The frames show kinetic type on black, and one card carrying a wall of eleven
  feature names at once (inventory counting tool, stock forecasts, COGS reports, auto purchase
  orders, multi-location stock transfers, barcode printing, and more). That is a feature wall,
  which is the anti-pattern the guide condemns two thousand words later.

The lesson generalises past this one video. **An agency's description of a film is marketing
about marketing.** Watch the film.

---

## 4. The standard

What a product demo made with this kit has to do. The craft law and product-truth rails in
`SKILL.md` apply in full; where they and this file disagree about a demo, this file wins.

### 4.1 Bands

| Gate | Band | Evidence |
|---|---|---|
| Runtime, product page | 60 to 120s | corpus median 96s; ten of twelve are 16 to 154s |
| Runtime, social cutdown | 15 to 30s | Canva 16s, Nutrislice 23s |
| Narration | 95 to 140 wpm of runtime | nine narrated films measure 92.9 to 138.6 |
| Narration, or none | zero words is a first-class option | three of twelve carry no VO |
| Mean luminance, light UI demo | 195 to 245 (0-255) | Notion 235, Xero 227, Nutrislice 226, Office 365 219 |
| Mean luminance, mixed demo | 90 to 160 | Square 90, Ring 90, EOL 104, Grammarly 111, Canva 116 |
| Luma range | at least 48% of full scale | lowest in corpus is Notion at 48.0 |
| First product frame | inside 10s | rule 3, and the 40-second warm-up failure mode |
| Closing card | one named action | rule 9 |

### 4.2 Rules, in priority order

1. **One workflow, end to end.** Not a tour. For a booking product that means one of "take a
   booking", "fill a cancelled slot", or "close the till at the end of the day". Not all three.
2. **The problem is on screen before the product is.** Ten seconds maximum, and it must be a
   situation the target customer recognises without being told.
3. **Realistic data, never placeholder.** Real slot times, prices in the local currency, real
   place names, a realistic week's activity, all on a demo or synthetic account. An empty
   dashboard kills a demo faster than bad motion. The product-truth rails in `SKILL.md` section 7
   apply in full: current authenticated captures of the exact screen and state, hashed, or the
   film does not ship.
4. **Design sound-off first, then decide whether it needs a voice at all.** Default to no
   voiceover. If the film only works when narrated, the picture is not doing its job.
5. **Legible at the size it will be watched.** If it runs on a phone, crop into the region that
   matters or rebuild the interface at a readable scale. Broadcast floor still applies: 2.3
   seconds with the camera locked for any text-bearing shot.
6. **Show the machine saying no.** One declined booking, one slot that cannot be filled. A
   system that only ever succeeds reads as a mockup.
7. **Never film latency.** Compress the wait into the cut.
8. **Cutdowns beside the master.** 16:9, 1:1, 9:16, plus a 15s and a 6s, from the same build.
   Plan them in the beatmap from the start; a 9:16 cut is recomposed, never cropped from 16:9.
9. **End on one action.** Name it.
10. **All craft law in `SKILL.md` and `animation-craft.md` still applies.** Easing, motion blur,
    the beat grid, the hold budget. A demo is not an excuse for lazy motion.

### 4.3 What does not transfer from the brand-film corpus

- **Do not target the dark register.** 7.8% mean luma is right for a MacBook hero and wrong for
  a booking screen.
- **Do not target 25 to 30 cuts in 40 seconds.** That is trailer pacing. A demo has to hold a UI
  still long enough to be read, and the legibility floor beats the motion-energy floor every time.
- **Do keep** the geometric cut progression, the one-accent rule, nothing teleports, arrivals
  ease out and departures ease in, and the earned long shot.

---

## 5. Tooling: what to build this with

Checked against the GitHub API on 19 August 2026. Star counts and last-push ages are real, and
they correct two things the search results got wrong.

### 5.1 The spine stays Remotion

`remotion-dev/remotion`, 56,806 stars, pushed on the day of checking. Nothing else is close for
deterministic, re-renderable, config-driven film, which is why the kit is built on it. A
re-renderable pipeline is the "asset bank" Vidico charges $10,000 to $20,000 to build.

### 5.2 Screen capture, for the product-truth layer

The demo register needs real product pixels, which a brand film never needs. **Most Screen
Studio clones are macOS only**, so on Windows or Linux most of the list goes before quality is
even considered. The table records Windows support only, as checked on 19 August 2026; check
macOS and Linux support on each project's page.

| Repo | Stars | Last push | Windows | Licence | Verdict |
|---|---|---|---|---|---|
| `getopenscreen/openscreen` | 1,728 | same day | **yes** | MIT | **First choice.** Auto-zoom with adjustable depth and easing, cursor smoothing and click effects, motion blur, on-device captions, per-segment speed. |
| `webadderallorg/Recordly` | 21,562 | 4 days | yes | open source, Electron | Solid fallback, larger community. |
| `CapSoftware/Cap` | 20,995 | same day | yes | AGPLv3, some crates MIT | Best-known project. AGPL matters only if you embed it, not to use it. |
| `alyssaxuu/screenity` | 18,487 | 1 day | browser extension | open source | Lightweight, no auto-zoom polish. |
| `siddharthvaddem/openscreen` | 39,869 | 63 days | n/a | n/a | **ARCHIVED. Do not use.** It is the top search hit for this query and it is dead. |

The `siddharthvaddem` trap is worth remembering. It has twenty times the stars of the
maintained project and ranks first, and it is archived.

### 5.3 Deterministic capture beats hand-recording

For a demo that has to be re-rendered every time the product UI changes, hand-recording is the
wrong primitive. Drive the real app with **Playwright** (`microsoft/playwright`, 94,730 stars,
pushed on the day of checking), scripted, seeded and headed, and capture that. You get:

- the same take every time, so a re-render after a UI change is a re-run, not a re-shoot
- real product pixels, which satisfies the product-truth rails
- cursor paths and timings authored as data, on the same beatmap the score comes from

Playwright is not part of the kit; it is the piece worth adding when a demo must be re-shot often.

### 5.4 Everything else, ranked and dated

- `motiondivision/motion` (Framer Motion), 33,281 stars, pushed on the day of checking. For
  real-time UI motion.
- `greensock/GSAP`, 27,833 stars, 128 days. Fully free since 3.13 including SplitText and
  MorphSVG. Drive it manually under Remotion with `tl.seek(frame / fps)`, never `play()`.
- `rive-app/rive-wasm`, 965 stars, pushed the day before. Real-time interactive UI motion, which is
  what Linear and igloo.inc actually ship instead of video.
- `midrender/revideo`, 3,988 stars, 35 days. The maintained fork of Motion Canvas.
- `motion-canvas/motion-canvas`, 18,971 stars, 48 days. Effectively abandoned upstream. Skip.
- `theatre-js/theatre`, 12,616 stars, **735 days**. Dormant. Skip, as `toolchain.md` also says.
- `airbnb/lottie-web`, 32,055 stars, 352 days. Only if an existing After Effects asset must ship.

### 5.5 What the kit gives a demo

- **This skill and the kit's commands.** Craft law, the product-truth rails, and the gate:
  `npm run audit -- <id>` (with the `ui-light` profile for a light-mode product) and
  `npm run release -- <id>` (see `demo-film-system.md`).
- **Generative video** (optional, paid, `ai-generation.md`). Useful for texture and B-roll, never
  for interface plates. Generated product screens are a product-truth violation and do not ship.

---

## 6. The one-line version

A product demo is one workflow, opened on a problem, shown in real product pixels, narrated at
half speaking speed or not at all, legible on a phone, ended on a named action. It is light
where a brand film is dark, and it holds still where a brand film cuts. Everything else in
`SKILL.md` still applies.

---

## 7. Sources

- Vidico video, "12 Best SaaS Product Demo Videos in 2026": https://www.youtube.com/watch?v=Hf9jmzI1c9Q
- Vidico guide, "12 Best Product Demo Video Examples in 2026": https://vidico.com/news/best-product-demo-video-examples/
- Gartner, B2B buyers prefer a rep-free experience: https://www.gartner.com/en/newsroom/press-releases/2026-03-09-gartner-sales-survey-finds-67-percent-of-b2b-buyers-prefer-a-rep-free-experience
- Vidyard, Video in Business Benchmark Report: https://www.vidyard.com/business-video-benchmarks/
- Wistia, State of Video Report: https://wistia.com/learn/marketing/video-marketing-statistics
- The twelve films, measured 19 August 2026 from YouTube metadata, subtitle tracks and
  storyboard sprite sheets. §2.2 was read from a board of eight sampled frames per film. The
  measurement scripts and the frame board are not part of this kit (the kit ships no
  third-party frames); the guide above links every film.
