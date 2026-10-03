# Type for film: choose by reason, set by measurement, animate with restraint

Evidence: Google Fonts metadata, the Fontshare API, Fonts In Use counts, foundry licence texts and
the real font files inspected with fontTools, all read on or before 1 October 2026; the public
sources are in [sources.md](../sources.md) under "Typography for motion". The rule
that governs this file: **any list of faces, including the examples below, becomes the next default
once it is used as a menu.** Anthropic's November 2025 frontend post named Space Grotesk as a
convergence trap and recommended it in the same piece. So this is a method first and a catalogue
second, and every named face is a dated example.

## 1. What "overused" means (October 2026)

Measured three ways, which disagree:
- **Serving volume** (Google Fonts rank of 1,950 families): Roboto 2, Open Sans 3, Inter 5, Montserrat 7,
  Poppins 8, Lato 9, DM Sans 21, Playfair Display 25, Manrope 30, Outfit 33, Plus Jakarta Sans 40, JetBrains
  Mono 46, Bricolage Grotesque 52, IBM Plex Sans 53, Space Grotesk 59, Inter Tight 75, Instrument Serif 84,
  Fraunces 92, Geist 104. All nine of Anthropic's 2025 "alternatives" sit in the top 12%.
- **Free-catalogue attention** (Fontshare): Satoshi, Clash Display, General Sans and Cabinet Grotesk take
  34% of all views. **One style guide recommended exactly these four as the alternatives to the
  defaults, and the products built from it ship them**: the escape list became the house default.
- **Designer archives** (Fonts In Use): Söhne, ABC Diatype and PP Neue Montreal appear as often as Inter;
  the Fontshare four barely register.

Lay viewers almost never name a font (0.4% of comments in a study of why AI sites look alike) but often
name the sameness (6.1%). The cost of a default face is cumulative recognisability. "Overused" means
overused in the audience's context: someone watching a software film has looked at Inter, Geist and
Satoshi in product UIs all day. `npm run lint:slop -- <id>` flags the default faces unless a reason
is given (see `SKILL.md` section 3).

## 2. The method (do it before browsing)

1. **Write the reason in one sentence**: era, material, place, voice or job. If it would fit ten other
   brands, it is not a reason yet.
2. **Start from what the brand owns**: its drawn wordmark, its faces, the lettering in its world
   (signage, a machine's control panel, a menu board). A new face needs a job the existing ones cannot do.
3. **Cast, don't decorate.** Who is speaking in each moment (the brand, the system, a customer, the
   place)? One face per speaker. Two faces doing one job is a casting error.
4. **Swap test**: replace the candidate with the nearest default (Inter, Satoshi, Playfair, Space
   Grotesk). If the shot means the same, the choice is not working.
5. **Context check**: Google Fonts rank, Fontshare views, Fonts In Use count. Top hundred or the Fontshare
   four means the audience saw it today; you need a strong reason.
6. **Set the real sentences**: the actual lines, prices with their currency symbol, times with colons,
   units such as °C, place names with their accents, the call to action. Check tabular figures for anything that changes in place,
   case-sensitive punctuation for capitals, arrows, fractions, and missing glyphs (a missing glyph falls
   back to another font mid-word).
7. **Test in motion at delivery size**: enter, hold and exit at 1080p and on a phone; check reflow under
   weight animation, thin strokes after an H.264 encode, accents against tight leading.
8. **Pair by contrasting skeletons, one job each.** Loud display, quiet text. One family with range beats
   two near-twins.
9. **Licence check before the first frame** (section 4), including paid ads and automated rendering.
10. **The brand's drawn lettering owns the hero moment.** Never retype a wordmark in a font.

## 3. A bench of open faces, by character (dated examples, OFL, acute-accented vowels confirmed)

Organise by job, never by name. Low popularity rank is a freshness signal, not a quality signal.
- **Flared, near-glyphic humanist**: Commissioner (its FLAR axis).
- **Weight that animates without text moving** (uniwidth): Host Grotesk, Recursive, any mono.
- **Early-20th-century gothic grit with width range**: Special Gothic, Science Gothic.
- **A serif that reads well at film sizes** (real `opsz` axes swap in display drawings): Newsreader,
  Literata, Source Serif 4.
- **Warm, heavy, bookish titles**: Young Serif.
- **The quietest mono** (a system voice under a grotesque): Fragment Mono. **A machine voice with OCR
  character**, width-stable across weights: Azeret Mono.
- **An axis tied to data**: Climate Crisis (weight is the data). The reference case for meaningful axes.
- **Diegetic displays only**: DSEG (segments), Doto (dot matrix). Off-screen dot-matrix now reads as Nothing.
- Worn as of 2026: JetBrains Mono, Space Mono, Geist Mono for "technical" voices; Fraunces and Instrument
  Serif rising fast.
- Other free sources: Velvetyne, Collletttivo, UNCUT.wtf, Open Foundry, League of Moveable Type (check
  each face's own licence file).

## 4. Licences for video

- **SIL OFL covers rendered video outright** (FAQ 1.1, 1.1.1); no credit required by the licence. If a face
  declares a Reserved Font Name (some do; read its licence file), use the official files unmodified:
  subsetting or converting it under the same name breaks the condition.
- **Fontshare licence v2.0 (17 August 2026)**: video and broadcast still fine, but it now forbids
  subsetting or converting the files, sending them to contractors (they download their own), and offering
  the fonts as a choice inside software for other people's content. A font-inlining script that subsets
  Fontshare files breaks this. (Reading of the text, not legal advice.)
- **Paid foundries draw the line differently**: Grilli Type and Commercial Type let a desktop licence on
  the production machines cover video; Klim covers non-broadcast video and your own social channels, not
  paid ads or broadcast; Dinamo, Displaay and Production Type need a separate video licence. **OH no Type
  and Production Type have clauses against automated rendering** that a literal reading would apply to a
  Remotion film: get written confirmation first.
- **SF Pro** is licensed only for mock-ups of Apple-platform UI. Never in a film.

## 5. Type in motion

- **Budget reading time first.** At about 20 characters per second, a 42-character super needs about 2.1s
  of complete, still legibility after its reveal finishes; the skill's floor is `0.3 + max(2.0, chars/15)`
  seconds with the camera locked. Any reveal spends that budget, which is why typewriter reveals of whole
  sentences feel slow.
- **Choose the reveal unit by job**: per line or phrase for supers and claims (the line arrives whole and
  holds); per word only when synced to speech; per character only for short display words where the
  letters are the subject (a wordmark build).
- **Masked baseline reveals look expensive** because letter shapes never distort: the line rises from behind
  a mask at its own baseline, travelling at most the cap height, over 300 to 600 ms on an expressive
  ease-out, then stops dead and holds. Set the mask above the tallest accent (in one measured grotesque,
  accented capitals reach 0.928 em).
- **Track by measurement, not by rule.** Apple's SF tracking goes negative only around 13 to 23 pt and is
  zero at 80 pt and above; apple.com ships -0.015em at 80 px. A -0.07 to -0.08em display setting is about
  five times tighter than anything Apple ships, and leaves no room for per-letter motion or blur.
- **Don't animate weight in running text** unless the face is uniwidth (one measured grotesque widens about
  8% from 300 to 700, so a weight change shoves the line sideways).
- **Give an axis a meaning or leave it still.** Weight "breathing" on a tagline says nothing.
- **Optical size keys off composition pixels**, not the viewer's screen: set `opsz` by hand for text that
  will be small on a phone.
- **Compression**: contrast that lives in luma survives 4:2:0; contrast that lives in hue loses half its edge.
- **Confident type arrives once and stays.** Longer holds read as more assured (Panic Room's titles).
- **Clichés**: typewriter reveals of full sentences; karaoke word-by-word captions in a TikTok face;
  per-letter bounce or overshoot; staggered fade-ups on everything; scramble or glitch "decode" reveals;
  spinning extruded 3D type; non-diegetic dot-matrix readouts.
- **Remotion hygiene**: load fonts in one module through `@remotion/fonts`, wait before measuring, use
  `fitText` for titles that must fill a width.

## 6. A worked brand setup (anonymised)

One brand's film type, written up as a pattern. The faces are not named; the method and the
numbers carry over.

- **Two faces, fixed jobs, no third by default.** A decorative display face is the brand's speaking
  voice: one or two title phrases per film, set large (it was a 300-weight face with fine detail). A
  plain grotesque does everything else: supers, labels, numbers, all UI. The drawn wordmark owns the
  end card. When the product's own interface uses one face for every role, rebuilt UI in a film uses
  that face only.
- **Text-face settings**: `tabular-nums` for anything that changes in place; `zero` for codes; `case` on
  all-caps labels; the face's own arrows (a stylistic set) rather than a fallback glyph; weight 450 text,
  600 to 700 emphasis. That family stopped at 300 and 700, so contrast came from scale (3x jumps), the
  display face, colour and timing.
- **Display-face settings**: read its stylistic sets before setting capitals (in that face `ss01`
  swapped unusual forms of A and E, and the bold's `ss01` covered E only). Never put changing numbers,
  ®, arrows or fractions in a display face without checking for tabular figures and missing glyphs.
  Switch ligatures off for URLs (in that face `www` became a single glyph).
- **Leading with accented capitals**: at least 1.14 (the text face) or 1.21 (the display face) for
  mixed-case lines with accented capitals; the brand's 0.95 display leading only for all-caps lines or
  lines with no accents.
- **Colour**: a pale ink or a metallic accent on a dark ground kept strong luma contrast (12.63:1 and
  7.06:1); **the metallic accent on the pale ground measured 1.79:1**, mostly chroma, and 4:2:0 halves
  chroma edges, so never set accent type on a pale ground without measuring.
- **If a system voice is needed**: Fragment Mono (quietest) or Azeret Mono. Never JetBrains or Space Mono.
- **Credit**: credit an open face's designer and foundry in the film's description or credits when the
  foundry asks (Velvetyne does).
