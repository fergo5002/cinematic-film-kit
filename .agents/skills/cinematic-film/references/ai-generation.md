# AI generation: video, images and critique (optional, paid)

**The kit's default is free and code-drawn.** Everything in this file costs money, so it runs only
under the cost rules in section 1. The landscape in sections 2 to 7 is the state on 1 October 2026,
taken from vendor docs, pricing pages, terms, Artificial Analysis boards and statutes; no test
generations were run. Prices, models and terms move monthly: re-check anything you rely on, and
treat every item marked **[re-check]** (dated after October 2026) as unconfirmed. Public sources:
[sources.md](../sources.md), under "AI image and video generation".

## 1. The cost rules

1. **Estimate before spending.** Before any paid call, write down the shots, takes per shot, seconds
   per take, the model and its list price, and the total. Show that number to the person paying and
   get a yes for that number. A batch that would go over the agreed figure stops and asks again.
2. **Stills before motion.** Approve a keyframe (a first and a last frame per shot) as a still
   before paying for any video. A still costs cents; a video take costs dollars.
3. **Short tests before finals.** Test each shot at the shortest duration and lowest resolution the
   model offers, then generate the final only for the takes that worked.
4. **Three tries per shot, then change the plan.** If three takes of a shot fail, the prompt or the
   shot is wrong. Re-board it, draw it in code, or cut it. Do not keep buying takes.
5. **Connectors only through `connectors/film-gen.mjs`.** Every paid call in this kit goes through
   that script and its adapters (list prices live in `connectors/prices.json`), never through an
   agent's own tools or an ad hoc API call, so the estimate and the spend stay in one place.
6. **Exact things stay in code.** The logo, prices, product UI and every word are composited in
   Remotion on top; a video model never renders type or interface (section 4).

**Cost arithmetic, for scale** (a 30s film of ten 3s shots at 20 takes per shot, list prices on
1 October 2026): Veo 3.1 Standard 200 × $3.20 = $640; Veo 3.1 Fast at 1080p 200 × $0.96 = $192;
Kling 3.0 Pro with audio 200 × $0.84 = $168, before keyframes and upscaling. The rules above exist
because a real film made the naive way costs hundreds of dollars.

## 2. What changed between June and October 2026

- **OpenAI left video.** The Sora app closed on 26 April 2026; Sora 2 and the Videos API left the API on
  24 September 2026. Anything that names Sora as an option is out of date.
- **Google's default video model is now Gemini Omni Flash 1.1** (GA 27 August 2026; conversational
  editing; about $0.10 a second at 720p). It cannot edit or extend uploaded video in the EEA. **Veo
  3.1**: Standard $0.40 a second, Fast $0.10 to $0.30, Lite $0.05 to $0.08; in the EU it generates
  adults only.
- **The leaderboard top tier is new**: Wan 3.0, MiniMax H3 and H3 Max, Seedance 2.5 (30s single clips),
  with FLUX 3 and Gemini Omni close (Artificial Analysis, August boards). Runway, Luma, Midjourney, Adobe,
  Moonvalley and Pika compete on control or licensed data instead: Luma Ray 3.2 (16-bit EXR frames, up to
  16 keyframes, no native audio), Runway Aleph and Act-Two (Runway now also resells other labs' models).
- **Images**: GPT Image 2 and 2.5 (Sunburst, Flare; September 2026) lead, strongest on dense text and UI;
  Nano Banana 2 is the price-performance pick ($0.067 per 1K image, up to 14 references); Nano Banana Pro
  for reasoning and 4K. **OpenAI announced it will switch off `gpt-image-1.5` on 1 December 2026
  [re-check]**: anything still calling it stops working then.

## 3. Which model for which job (inference from features and prices, untested)

| Need | Pick | Watch out |
|---|---|---|
| First and last frame control, 4K at 8s, three references | Veo 3.1 | adults only in the EU |
| Cheap exploration, conversational re-takes | Gemini Omni Flash | no edit or extend of uploads in the EEA |
| Scripted multi-shot in one generation, bound characters | Kling 3.0 | **terms forbid commercial use without written permission and require Kling branding**; clear it in writing first |
| A 30s continuous take with heavy referencing | Seedance 2.5 | Hollywood IP dispute; never anything resembling a real person |
| Plates you will grade and composite | Luma Ray 3.2 (EXR, keyframes) | commercial use only for outputs made during an active paid subscription |
| Style frames with legible type, packaging or UI | GPT Image 2 or 2.5 | |
| Character and location sheets | Nano Banana 2 | |
| Plate repair from inside the EEA (checked from an EU account) | Runway Aleph, Luma Modify, Higgsfield | Runway may train on your inputs and outputs |
| Open weights | Wan 2.2 (Apache-2.0), LTX-2.5 | needs a rented GPU (a laptop with integrated graphics cannot run them); **HunyuanVideo's licence excludes the EU, UK and South Korea** |
| Avoid for a brand | Grok Imagine (deepfake and CSAM record), Seedance for anything person-like | reputational, not just legal |

Leaderboard rank measures anonymous preference for single clips. A premium film is cut from many clips
with sound and type done separately, so control (keyframes, EXR, references, multi-shot) matters more
than 20 Elo points.

## 4. A pipeline that does not produce slop

1. **The idea and script are written first, by people**, with one physical truth the film must obey
   (weight, heat, wet surfaces, the direction of light). The model is a camera department, not the
   idea. Never let the tool be the story (the case file in `slop-taxonomy.md`).
2. **Shot list in camera language** with timings.
3. **Reference sheets**: real photographs of the real place first; generated sheets only where nothing
   real exists.
4. **Keyframes as approved stills**: a first and last frame per shot (cost rule 2).
5. **Animate between keyframes.** Professional work used many takes per shot (Kalshi needed 300 to 400
   generations for 15 usable clips; Coca-Cola's 2025 ad was 70,000 clips from five people in 30 days),
   which is exactly why this kit caps tries per shot (cost rule 4) and plans around what can be drawn.
6. **Edit, sound and every exact element stay in code**: the logo, prices, product UI and words are
   composited in Remotion on top; never ask a video model to render type or UI.
7. **One shared grain and grade** over generated and drawn elements so they sit in one world.
8. **Disclose** (section 7) and keep provenance metadata (C2PA) intact through the encode.

**Use generation only where it adds what code cannot draw** (photoreal water, weather, skin, people)
and keep everything that must be exact in code. That also keeps the deep-fake question narrow.

## 5. Finishing generated footage

Generate at native resolution; upscale only the selects (Topaz Starlight or Astra in the cloud, or the
model's own upscaler); grade generated plates and code-rendered graphics into one colour space; type,
UI and logos on top in Remotion; one grain layer over everything at the end; encode with the tagging and
grain rules in `toolchain.md`. Generated clips arrive at 24 fps natively (Veo, Omni).

## 6. Agent access and AI critique

- **What exists (1 October 2026)**: Higgsfield's hosted MCP, Replicate's hosted MCP, Google's genmedia
  MCP servers (Veo, Omni, Nano Banana), ElevenLabs' hosted MCP (the local one was archived on 20 August
  2026), and plain REST for fal, Runway, Luma and the Gemini API. No official fal, Runway, Luma or Kling
  MCP was found. Whatever access an agent has, paid calls in this kit go through
  `connectors/film-gen.mjs` (cost rule 5).
- **AI critique**: Gemini can watch a finished film with its audio for pennies (about $0.04 on Gemini 3.1
  Pro for 60s at 1 fps; about $0.16 at 5 fps). By default it samples **one frame a second** and hears
  audio at **1 Kbps mono**: it can judge story, continuity, legibility and sync with timestamps, not the
  mix, loudness, stereo or fast-cut rhythm. Raise `fps` for fast edits; keep the measured audio checks in
  `sound-design.md`. Its free tier uploads the film to Google and unpaid content may be used to improve
  Google's products: the film's owner decides whether that is acceptable. The free route that is always
  allowed: frames, contact sheets and numbers (`npm run packet -- <id>`, `watching-video.md`).

## 7. Law and disclosure (the EU, with Ireland as the worked example; not legal advice)

- **EU AI Act Article 50 applies from 2 August 2026.** Providers must mark synthetic output machine-
  readably; deployers (the brand, when it publishes) must disclose deep fakes "at the latest at the time
  of the first interaction or exposure". A **deep fake** covers generated content resembling real
  persons, objects, places or events that "would falsely appear to a person to be authentic": a
  photoreal generated scene of a real-looking place in an ad is in scope. The artistic exception softens
  how the label is shown, not whether. Disclose in the video from the first frame (an "AI-generated"
  card or mark) plus the platform's label. **Clearly stylised, non-realistic animation is the safest way
  to stay outside the definition**, which also matches this kit's code-drawn default.
- The EU Code of Practice was finalised on 10 June 2026 (EU icons optional, the duty is not). Ireland
  established an AI Office on 2 August 2026; which regulator enforces deployer duties is unverified.
  Penalties for small companies are capped at €15M or 3% of turnover, whichever is lower.
- A business that ships a tool generating imagery for its own customers may become a **provider** with
  the machine-readable marking duty. Get a legal read before building one.
- **Irish copyright**: section 21(f) of the 2000 Act names the person who made the arrangements as author
  of a computer-generated work (70 years), but EU originality law may not let that stand; untested. The
  hand-made parts (script, edit, type, sound, code-drawn graphics) are on firmer ground.
- **Awards**: declare all AI use; Cannes withdraws entries for omission and added an AI Craft category in 2026.
