# The canon: what the best films do, measured, and what each costs in code

Steal principles, never surfaces. Reference imagery is a tool, not a product: Elizabeth Goodspeed's
warning that art directors "only propose ideas that they can find existing photographic examples
of" is how every startup ended up with the same floating phone. Before borrowing anything, run the
swap test: if the borrowed move would work just as well for a competitor, it is surface.

Sources: the public sources are listed in [sources.md](../sources.md), under "Consumer-tech
product films", "Software and AI launch films" and "Slop and novelty". The 19 consumer-tech films
were measured frame by frame on 1 October 2026; the per-film measurements ship in `corpus/` (index:
[corpus/consumer-2026-10-summary.json](corpus/consumer-2026-10-summary.json)). The older measured
corpora are in [reference-films.md](reference-films.md) (brand films),
[product-demo-standard.md](product-demo-standard.md) and [watching-video.md](watching-video.md)
(software demos).

**Instrument caveat.** Shot counts are hard cuts at an ffmpeg scene threshold of 0.35. The detector
found every hard cut on a synthetic control and missed a dissolve entirely, so films with dissolves
and continuous CG moves have more shots than reported.

---

## 1. Apple: an argument plus restraint

The Apple feel is not a look. It is one engineering argument told calmly, fragments before the
whole, the complete product withheld until the end, a quiet master, and silence.

### The measured grammar (observed, 2025 and 2026 launch films)

| Film | Runtime | Hard cuts | Mean shot | First cut | Hero from | Hero held | LUFS | Closing silence |
|---|---|---|---|---|---|---|---|---|
| [iPhone 18 Pro (2026)](https://www.youtube.com/watch?v=Q3zwkxqh1t0) | 177s | 79 | 2.25s | 10.8s | 90% | 18.2s | -16.0 | 5.1s |
| [iPhone Duo (2026)](https://www.youtube.com/watch?v=FUfGcZ092b0) | 187s | 21 | 8.89s | 64.3s | from frame one (demo grammar) | | -16.2 | 8.1s |
| [Watch Series 12 (2026)](https://www.youtube.com/watch?v=MO9HJsUxEEk) | 100s | 86 | 1.16s | 1.7s | end lockup | | -16.3 | 7.3s |
| [iPhone 17 Pro (2025)](https://www.youtube.com/watch?v=9tgw8M8T2nc) | 243s | 19 | 12.8s | 18.3s | 83% | 28.4s | -16.1 | 11.2s |
| [iPhone Air (2025)](https://www.youtube.com/watch?v=BeoJC9Thl9I) | 150s | 33 | 4.54s | 15.1s | 84% | 19.5s | -15.0 | 5.4s |
| [AirPods Pro 3 spot](https://www.youtube.com/watch?v=EMmKs8vMKhU) | 48s | 9 | 5.33s | 2.5s | | | -15.6 | 5.1s |
| [iPhone 17 Pro spot](https://www.youtube.com/watch?v=TNhX1uR2vO8) | 60s | 21 | 2.84s | 3.0s | | | -16.2 | 5.0s |

Rules of thumb derived from these (estimates, not laws):
- **Open on one held shot of 8 to 15s**, with the first spoken line inside 4s. The hook is verbal
  while the picture holds ("Once you've been to the moon...").
- **Fragments first**: parts, process, people, evidence (knolled components, exploded views, die
  drawings as line art, thermal false-colour, wireframes). The complete clean hero arrives at **83
  to 90% of runtime** and holds **15 to 28s**. Peers show and name the product in the first 0 to
  11%. Withholding is the measurable signature that separates Apple from everyone else.
- **The script is a causal chain**, each sentence starting from the end of the last: "More power
  creates more heat. So you give the vapour chamber three times more surface area... The longest
  battery life in iPhone history." Or negation then reveal: "It's not the first iPhone to... It is
  the first iPhone to do this." Then a three-line recap and a callback to the first line.
- **Product sounds are written into the script**: "this satisfying snap" lands on the hinge's
  [SNAP]. Spots are music plus diegetic foley, no VO.
- **Almost no supers.** A designer's name super at the start, diegetic text, small type at the end.
- **Quiet master, -15 to -16.3 LUFS**, below YouTube's -14 reference so nothing gets turned down
  and transients keep their punch. Samsung's 2026 films master at -10.7 and -12.7 with a 2.6 LU
  range and arrive flat after normalisation.
- **Every Apple film ends on 5 to 11s of silence** on a minimal card.
- **VO density** 1.2 to 2.2 words per second when there is VO.
- **Springs**: Apple parameterises motion as duration and bounce, bounce 0 to 0.15 for product
  motion, "cautious" above 0.4. Mapping (corrected from the WWDC23 transcript, verified in
  Remotion): `stiffness = (2π / duration)²`, `damping = ((1 - bounce) × 4π) / duration` for
  bounce ≥ 0, mass 1. Duration 0.5s, bounce 0 is `{mass: 1, stiffness: 157.91, damping: 25.13}`.
  **Remotion's default spring overshoots 16.3%** (Apple bounce 0.5): never ship the default.
- **SF Pro is not licensable** for this use. Never use it.

### The grammar with code-only verdicts

| Technique | Code-only equivalent | Verdict |
|---|---|---|
| One argument, not a feature list | writing: draft the causal chain first, cut every feature that does not serve it | full |
| Held opening | one Three.js dolly or 2D push on a critically damped spring | full |
| Fragments before the whole | exploded views (groups offset along normals, sprung back), knolling (orthographic top-down), line drawings (`stroke-dashoffset`), thermal (false-colour shader) | full for grammar, partial for photoreal parts |
| Withheld hero, long hold | timeline structure | full |
| Material macro, rim light, light sweep | `MeshPhysicalMaterial` (anisotropy, clearcoat) under a moving area light or HDR environment; or a 2D sheen mask | partial |
| Object to UI | real React UI in a device frame, then the screen scales to full frame matching its rounded rectangle | **full, and the strongest fit for software** |
| Lifestyle in real places; process documentary; in-camera practical | none honest | none: choose a declared graphic style instead |
| Licensed contemporary track | none; procedural music can do a minimal pulse bed, not a single | partial |
| Quiet master, closing silence | `loudnorm` to -16, silent end card | full |

### Apple-like versus Apple-imitation

Imitation copies the surface: a phone floating in a white void, an orbiting camera, glows, a stock
whoosh, constant motion, spec supers. The 2023 to 2025 launches mocked for wearing Apple's manner
without its substance (Humane's Ai Pin film; OpenAI's "Sam & Jony") are the warning. Tests:

- **Swap**: if the logo can change and the film still works, it is imitation.
- **One sentence with a "but" and a "so"**: if the film is a list, it is a Samsung film (fine, but not Apple).
- **Motivation**: every move and light change has a nameable cause. Shane Griffin (M1 Max film):
  "where is the motivation of this thing emanating from? What's its core source of power?"
  Optical Arts: "a camera move is used to enhance and not to hide; three lights can be reduced to
  one considered light."
- **Fragments, then the whole**, held late. Imitation opens on the full hero spin and repeats it.
- **One human, one real place.** In code, the honest substitute is the real UI with real-looking
  data in real use, never fake people.
- **Restraint in text.** No feature supers in a hero film.
- **Sound**: quiet with dynamics, foley the script names, silence at the end.
- **Declare a style when photoreal is out of reach.** A weak photoreal render reads as cheap
  imitation; diagrammatic, typographic, instrument-like work (Nothing, Dyson) reads as confident.

## 2. Peers, by fingerprint

| Brand | Fingerprint you can name | Code equivalent | Verdict |
|---|---|---|---|
| Samsung keynote film | rim-lit silhouette open, extruded 3D wordmark with light sweep, product named in the first 11%, bold numeric supers, dense VO, loud master | `TextGeometry` with a moving area light; count-ups; bold supers | full |
| Samsung "Ultra Unfolds" | product side-on in darkness, light through the gap as it opens | one back light behind a dark mesh, or a 2D silhouette with light leaking through a mask | full |
| Google Pixel | the whole world in the product's colour; bracketed lockup at both ends; short supers; music only | colour token from the product, SVG lockup, spring type | full |
| Nothing | small typewriter or serif annotations on hairline leader lines; dot-matrix display as protagonist; one orange accent; music only; a silence beat before the payoff | SVG leader lines drawn on; dot-grid shader or an OFL dot-matrix face (Doto); a deliberate 0.3s silence | full |
| Dyson | translucent cutaways, sectioned mechanisms, simulated liquids and particles, ALL-CAPS number supers, no VO | clipping planes for sections, transmission materials, instanced particles, SVG flow lines | partial (fluids and hair fall short) |
| DJI | footage shot on the product, countdown hook, perspective spec supers | supers full, footage none | partial |
| B&O | fashion film: landscapes, faces, textures, whispered VO, tiny supers, quiet dynamic master (-20.4 LUFS, 9.3 LU) | textures only | none to partial |
| Teenage Engineering | deadpan documentary of an odd object, lowercase type, rules ("I stick to rules... because then I can become free again") | none for documentary | none |

Motion designers make unpaid spec films for Nothing and Teenage Engineering: the clearest sign of
what the craft admires.

## 3. What the juries rewarded, 2025 to 2026

- **Cannes Film Craft Grand Prix 2025**: Telstra's 26 stop-motion films ("Tactile, intimate, and
  deeply human"), in a year the jury described as dominated by AI and digital gloss.
- **Cannes Film Craft Grand Prix 2026 and two D&AD Black Pencils**: Coinbase "Your Way Out"
  (Isle of Any, dir. Oscar Hudson): a low-poly game world built in camera, no CGI or AI; the
  grade and camera move from fixed game angles to free cinematography as the hero breaks out.
- **Cannes Film Grand Prix 2026**: Claude's Super Bowl films (Mother London): "an AI making fun of
  AI... the execution was immaculate."
- **Cannes Design Grand Prix 2026**: Apple TV's ident, real glass shot in camera (Optical Arts).
- **D&AD 2026 Black Pencil, art direction**: The Ordinary's "Periodic Fable" (Uncommon): 49 beauty
  buzzwords in Mendeleev's table.
- Apple: Cannes Creative Marketer of the Year 2025, D&AD Brand of the Year 2026. Its awards came
  from craft films (puppets, an accessibility musical), an in-camera ident and Shot on iPhone, not
  from its CG product films. **The product films are the canon for grammar, not for awards.**

**Implication for free, code-drawn work**: it cannot compete on "in camera". It competes on idea,
structure, type, behaviour and sound, in a declared style. Cannes now requires AI disclosure and
added an AI Craft category in 2026.

## 4. Motion identities that are behaviour, not decoration

| Studio and brand | The behaviour | Rule worth stealing |
|---|---|---|
| DIA (Mitch Paone) | "Time is the primary material"; design the behaviour, statics are evidence | typography as the smallest unit of a kinetic system |
| Collins, OFFF (2025) | magnetism: attraction (slow start, accelerating pull) and projection | "Move too fast, and the pull is lost; too slow and the energy fades" |
| Studio Dumbar, Instagram (2024) | imperfect human movement, physics, swipe-like camera | the platform's native behaviour as the motion law |
| Studio Dumbar, North Sea Jazz (2024) | type that flexes like a soundwave, in custom code | physics as the rule system |
| Pentagram, PayPal (2024) | tapping, clicking, flipping, swiping | the product's own gestures become the identity |
| Pentagram, MIND (2025) | parametric brainwave oscillations | a signal as the shape |
| Koto, Stack Overflow / MassiveMusic / GoFundMe (2025) | generative systems shipped as tools (one built with Claude) | the identity is a tool, not a set of files |
| ManvsMachine, Robinhood | kinetic nature environments as trading floors | an unexpected world for a familiar task |
| Mastercard sonic brand | a three-second hummable melody re-orchestrated across genres | the sound twin: one motif, many arrangements |

## 5. Software and product films

Measured 1 October 2026: 23 software and AI launch films from 2025 to 2026, same instrument as the
Apple table (hard cuts at a 0.35 threshold, proven on a test clip with three cuts and a dissolve).
Sources: [sources.md](../sources.md), under "Software and AI launch films" (the full 23-film
measurement table was not carried into this kit). The 2026-08 corpus (Notion, Linear, Claude Code,
Raycast, Figma, Stripe) and its two poles are in `watching-video.md` section 3; the demo register's
numbers are in `product-demo-standard.md`.

**Five registers, and the best films commit to one:**

| Register | Examples (shots, LUFS, closing silence) | The principle worth taking |
|---|---|---|
| Wordless UI, one move | [Linear Agent](https://www.youtube.com/watch?v=mRql2VJ99gM) (1 shot in 55 s, -28.9), [Cursor 2.0](https://www.youtube.com/watch?v=An8IM-kPyms) (2 in 64 s, -29.2) | treat the UI as a lit surface, cut nothing, reduce the product to its one interaction |
| UI as an object in the story's light | [Dia](https://www.youtube.com/watch?v=YVOw0TAO9ok) (40 shots, median 1.25 s), [GPT-6 Astra](https://www.youtube.com/watch?v=1QNsdr-Qx_I) (UI projected wall-sized behind people) | grade the screen with the scene; make the interface big enough to share a frame with people |
| Essay, no UI | [Notion "Think Together"](https://www.youtube.com/watch?v=vkpYpWfEK5s) (argues against the category's lonely-AI story with archive), [Anthropic "Keep thinking"](https://www.youtube.com/watch?v=FDNkDBNR7AM) (Mother, Daniel Wolfe), [OpenAI Super Bowl 2026](https://www.youtube.com/watch?v=aCN9iCXNJqQ) (one point of view carries decades) | argue with the category's dominant story; one continuous device |
| Customer documentary | [Linear INSPECT](https://www.youtube.com/watch?v=bRCaSP9x614) (in-house, 237 s; lower thirds as terminal lines; the agent's work drawn as box diagrams in the room) | draw the data model into the real place |
| Launch or identity montage | [Figma Config 2025](https://www.youtube.com/watch?v=NHodnYFUT_I) (55 cuts), [Superhuman identity film](https://www.youtube.com/watch?v=NcCQPOAKNV8), [Raycast](https://www.youtube.com/watch?v=Mi173xGb0ZA) (39 s, 13.5 LU, best like ratio) | macro on one control; tiny captions as chapter marks |

**Six ways to show UI** recur: real capture full-frame with pushes; rebuilt UI as a lit plane in 3D;
UI shot as an object in live action; the data model abstracted into diagrams; one control blown up to
poster scale (Claude Design's chips with a giant cursor); no UI at all. Pick the treatment from the
story, not the feature list. Koto names "faceless, UI-driven storytelling" as the category's problem
and Buck names "sparkles and magic" as the AI cliché.

**Sound in this register.** Demos run music-only and very quiet (Cursor and Linear at -27 to -29 LUFS,
which plays noticeably quiet on YouTube); brand films sit at -11.9 to -15.1. Closing silence of 2 s or
more appears in only 5 of 23 ([Claude Design](https://www.youtube.com/watch?v=t_LBECIQQqs) 4.8 s, [Sora 2](https://www.youtube.com/watch?v=lEcg6AJ6DVY) 4.6 s), against 5 to 11 s in every Apple
film. So a quiet master near -16 with a real closing silence is itself a break from the software
category.

**Studios with confirmed credits:** Mother London (Anthropic), Builders Club with Accenture Song
(OpenAI "The Intelligence Age", 2D hand animation plus procedural 3D, Sora used for previs), Studio
Dumbar/DEPT (OpenAI brand film: one sound layer per identity element), Oddfellows (Figma Config 2026
opener), Buck (Airbnb's 2025 relaunch; Notion AI's character, cel-animated and shipped as a Rive state
machine), Giant Ant (Duolingo), Koto (Microsoft Copilot), and BBH Dublin ([Monzo's one-shot Ireland
film](https://www.youtube.com/watch?v=J9iG_Q5YJdU), 30 s, a third-party upload).

**Evidence of admiration is thin**: view counts mostly measure ad spend ([Granola](https://www.youtube.com/watch?v=ekSyfD7uoiU):
1.93 million views, 12 likes). Like ratios, Campaign's "Ad of the Week" and studio case studies are the usable signals.

## 6. Where to look

- **Measured, not admired**: download with `yt-dlp` (optional, not a kit prerequisite; update it
  first if downloads return 403), measure with ffmpeg as [watching-video.md](watching-video.md)
  describes, read the numbers and the contact sheets. Query platforms for engagement instead of
  trusting listicles.
- **Craft press**: Motionographer, Stash, It's Nice That, Creative Review, Shots, LBB (credits and
  interviews), AIGA Eye on Design, Brand New, Fonts In Use.
- **Juries**: Cannes Lions (Film, Film Craft, Design), D&AD, One Show, CICLOPE (craft categories).
- **Makers worth studying**: Optical Arts, ManvsMachine, Grif Studio, Buck, DIA, Collins, Studio
  Dumbar, Koto, Pentagram, Isle of Any, Oscar Hudson, Mark Molloy, Kim Gehrig.
