# Slop taxonomy (October 2026)

What reads as AI slop or template-ware, why, and what to do instead, including the free code-drawn
route. The public sources behind it are listed in [sources.md](../sources.md), under "Slop and
novelty". Rows marked
*judgement* rest on practitioner consensus rather than a citable study; treat them as strong
defaults, not laws.

## The principle

**Slop is a position in a distribution, not a tool.** Directionless generation (by a model or a
person under deadline) returns the safe centre: Anthropic calls it distributional convergence.
A code-drawn noise blob with bloom is the AI look with no AI in it. And any published escape list
becomes the next centre (Anthropic recommended Space Grotesk in 2025; it is a tell by 2026).

The audience reaction is about intent and provenance more than the tool. Every pulled or panned AI
ad from 2024 to 2026 shared three traits: **the tool was the news, the idea was borrowed or
cynical, and the physical logic of the world broke.** The premium signal of 2026 is provenance:
work that was demonstrably made, or a crafted idea.

Two findings worth carrying into any argument:
- System1 tested Coca-Cola's AI holiday ads at the top of its scale, while NielsenIQ's neuro study
  found AI ads, even good ones, leave **weaker memories**. Both can be true. Coca-Cola had thirty
  years of trucks, jingle and red to borrow; **a new brand has no memory structures to borrow, so
  it must build distinctive assets on purpose**, and the NIQ warning is the relevant one.
- Orlando Wood (System1, *Lemon*): right-brain features (characters, place, dialogue, humour,
  melody, the unsaid) predict stronger long-term growth; left-brain features (flatness, words on
  screen, voiceover, rhythmic beds) predict weaker.

## Generative-video tells

| Tell | Looks like | Do instead | Free code route |
|---|---|---|---|
| Morphing, identity drift | faces, limbs, products melt or change between shots | one consistent world; transformation only by a stated rule | deterministic geometry, explicit interpolation, fixed seeds |
| Texture swimming | surface detail crawls frame to frame | texture locked to the object, or hand boil on twos as a style | world- or UV-locked noise; step on twos on purpose |
| Broken physical logic | wheels glide, fireplace without a chimney, light direction changes | cause and effect hold; continuity is craft | real kinematics (angle = distance / radius), one light rig per film |
| Plastic skin, beauty light | glossy, poreless, evenly lit, bokeh everywhere, no grain | motivated light, hard shadows, material variation, calibrated grain | PBR roughness, one key with shadows, bloom off by default; no photoreal humans |
| Weightless physics | floaty, objects slow mid-air | anticipation, contact, settle | springs with mass, gravity at scene scale; check every landing frame |
| Generic camera (*judgement*) | slow push-in on everything, drone orbit, dolly-zoom for nothing | a camera grammar that means something and changes at the story turn | script the camera; lock off by default; never leave an orbit running |
| "Cinematic 8k epic" look | teal and orange, god rays, flares, shallow focus on every shot | a grade taken from the brand's real place and materials | palette and LUT from real reference |
| Uncanny lip sync, dead eyes | mouth drift, eyes not tracking | no faked talking humans: voice off screen, type, hands, objects | do not attempt photoreal people in code at all |
| AI voice cadence | flat pitch, missing pauses, even stress, misread names | no VO, or a real human voice (a real local accent can be an asset) | no VO; type and picture carry it |
| Stock-feeling bed (*judgement*) | inspirational piano and strings, four-on-the-floor build, riser into logo | a motif someone could hum, diegetic sound, or silence | designed motif, physical-modelling plucks, filtered-noise textures |
| Stitched montage | many 4 to 8s clips with no through-line | fewer, longer shots in one continuous space | long takes cost nothing in code |
| The remake | a loved ad redone by a tool | idea first | not a tool problem |

## Motion graphics, design, type, sound and copy tells

| Domain | Tell | Basis | Do instead |
|---|---|---|---|
| Colour | purple to blue / violet to indigo gradients ("AI purple") | Wathan's apology for `bg-indigo-500`; Reddit dataset; Anthropic | one dominant colour and one sharp accent, each named after a real referent ("oven-door red", "harbour grey") |
| Colour | "AI yellow" golden hue; beige and flesh Canva palettes; soft pastels | Creative Boom poll 2026; RGD | commit to contrast; a palette that forbids something |
| Light | glowing orbs, neon glow, aurora and mesh blobs, noise-plus-bloom | dataset (glow strong) | light only what emits light |
| Surface | glassmorphism, Liquid Glass imitation | Creative Boom; MacRumors on Liquid Glass | opaque surfaces; a material only if the brand is that material |
| Layout | tilted floating 3D UI cards, spinning device mock-ups, fake billboards | *judgement*; "dishonesty" in Creative Boom | the real product doing a real task |
| Layout | centred hero plus three cards; bento grids | dataset; Creative Boom | asymmetric composition, one dominant element |
| Motion | everything fades up with a stagger and overshoots | Anthropic; Remotion's default spring overshoots 16% | one signature curve and one signature move; most things hold |
| Motion | motion for its own sake | Creative Boom ("dishonesty") | every move is cause, consequence or state change |
| Motion | particle swarms, plexus networks for "AI/data" | *judgement* | if it is data, show the true data |
| Type | Inter, Roboto, Arial, system fonts; Poppins, Space Grotesk, Geist, DM Sans, Manrope and friends | Anthropic; *judgement* for the rest | a face chosen for a reason in the brand's world; custom lettering where it pays |
| Type | gradient headline text | dataset | solid colour; size, weight, timing |
| Type | typewriter reveals, "Introducing X", clones of Apple keynote kinetic type | *judgement* | type behaviour derived from the brand's own rule |
| Transitions | lens flares, zoom blur, glitch, RGB split, light leaks, liquid blob morphs, Ken Burns | *judgement* | the hard cut on rhythm, or the brand's own gesture |
| Chrome | monospace timecodes, coordinates, crosshairs, corner metadata as decoration | Linear-style tech look | only true, useful information. (One otherwise disciplined product film's timecode chrome now reads as exactly this tell.) |
| Sound | AI voice; stock uplifting beds; a whoosh on every transition | ElevenLabs on its own failure modes; Wood | melody, diegetic sound, a real voice, silence |
| Copy | "It's not just X, it's Y"; Introducing; unlock, elevate, seamless, delve; signposted takeaways; emoji | Ström-Awn; *judgement* | concrete nouns; one truth; a line only this brand could say |
| Web | shadcn defaults, emoji icons, the "Linear look" dark gradient hero | dataset; LogRocket | commit to a direction with one orchestrated moment |

`npm run lint:slop -- <id>` detects the statically detectable rows (fonts, gradients, glass, glow, gradient
text, tilted cards, scale(0), linear and default easing, orbit cameras, typewriter carets, copy
phrases, emoji, em dashes, non-determinism, wall-clock time).

## The 2026 saturation ladder

| State | Styles |
|---|---|
| **Saturated: avoid by default** | purple and blue gradients; glass and Liquid Glass imitations; glowing orbs; bento grids; AI caricature, action-figure and Ghibli looks; beige Canva minimalism; Linear-style dark gradient SaaS; Y2K; animated guideline pages; copies of Kalshi's "unhinged" AI ad |
| **Tipping: only when the idea needs it** | dithering and pixel work; grain gradients; chrome; variable-font morphing; 3D type; kinetic grids; lo-fi UGC style (now flooded by AI avatars); stop-motion and collage looks faked in post |
| **Durable when real** | physical craft actually done; real voices; true data; behaviour-led kinetic identities; right-brain features (character, place, dialogue, melody, humour) |

"Tactile, handmade, anti-AI" is itself the mainstream 2026 trend, so its *look* is already being
templated. Faking hand-made texture with a paper shader is the 2026 version of the 2015 grain
overlay. **The move is provenance, not the look of provenance.** Trend half-life is now shorter
than a production cycle for anything a model can reproduce.

## Case file (what each taught)

| Case | Lesson |
|---|---|
| Toys"R"Us, Sora, 2024 | Never let the tool be the news. Synthetic humans are checked first and fail first. Sentiment went from 12% positive to 3%. |
| Coca-Cola, 2024 and 2025 | AI borrows memory structures; it does not build them. "70,000 clips" and "the genie is out of the bottle" became the story; a fireplace with no chimney became the joke. |
| Kalshi, Veo 3, 2025 | Glitch works only when chaos is the brand; its copies are slop. |
| Guess in Vogue, 2025 | Synthetic perfection on people is judged morally; small-print disclosure reads as deception. |
| McDonald's Netherlands, 2025 | Audiences judge the output, never the effort. A cynical idea in an uncanny medium compounds. Pulled in three days. |
| Super Bowl LX, 2026 | AI as subject plus human craft (Claude, Cannes Film Grand Prix) beat AI as maker. |
| Valentino, 2026 | When the medium contradicts the brand's promise (couture craft), the medium becomes the message. |
| Apple "Crush!", 2024 | A metaphor must add to what the audience values, never destroy it. Apple apologised and pulled the TV run. |
| Apple, Coinbase, Polaroid, Aerie, 2025 to 2026 | Provenance and craft made explicit, sometimes as the whole idea. |
| A product film, 2026 (anonymised) | Disciplined but default: Space Grotesk and JetBrains Mono, decorative timecode chrome, flat ground, a hairline phone. Passed its own gates; reads as a 2024 SaaS template in hindsight. |
| A deck film, third cut, 2026 (anonymised) | Dark frosted glass at `rotateX(56deg)` with neon glows: rejected on sight as AI slop while passing 19 of 19 numeric gates. |
