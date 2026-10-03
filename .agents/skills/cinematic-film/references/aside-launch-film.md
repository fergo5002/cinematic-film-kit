# Reference film: "Introducing Aside" (dissected)

The launch film for **Aside**, an AI-agent browser, and a benchmark for demo and launch films.
This note is the full breakdown so the next film can copy specifics, not just the vibe.

- **Source:** https://www.youtube.com/watch?v=Q-f0dQ764so (channel: Aside, 23 Jun 2026, ~111k views when read).
- **Spec:** 88s · 1280×720 · ~30fps.
- **Product line:** *"a browser that gets complex work done across your websites, accounts, and history."*
- **Close:** *"Aside, the browser that does your work."* → `aside.com`.
- **Frames:** the shot map below was read from a contact sheet at 1 frame every 2 s. No frames ship
  with this kit; to read it yourself, download it with `yt-dlp` (optional, not a kit prerequisite)
  and sample frames with ffmpeg.

## Shot map (1 frame / 2s read)

1. **Cold open, problem-agitation (0 to 12s).** Type-only. *"They **promised us** to do [everything]"*
   (single blue accent on "promised us") → *"Instead, they bury you in [apps]"* over a row of app
   icons (Safari, Gemini, a trash bin) → *"they stop when it gets real"* → a chat failing out:
   *"I can't do that / Please approve action / I can't sign in to websites / I can't do sensitive
   tasks."* Names the enemy hard: today's AI agents choke on real work.
2. **Reveal (16 to 24s).** The one motion-graphics flourish: a blue 3D funnel resolves into
   *"Introducing"* → a frosted grey **Aside** wordmark → a product panel, *"A browser that gets
   complex work done"*, with the kinetic list *"across ⊕ websites [lock] accounts ↺ history"* (a lock glyph before "accounts").
3. **The demo: the heart (24 to 56s).** A real task typed into the Ask AI bar:
   *"cancel all unused subscriptions and request refunds."* The agent then reasons and acts, one
   legible line at a time, in faithful UI recreations: check the credit-card statement → search
   browsing history → sign in to Chase with "Jun's Chase Passkey" → open last month's statement →
   *"You paid for Netflix, Amazon Prime, and LinkedIn Premium"* → check usage in parallel →
   *"You didn't use LinkedIn for the last 3 months; I'll ask for a refund"* → start a support chat
   → ask for the refund → *"Your $120 refund will be processed within this week!"* Then the human
   beat, delivered as dialogue over a circular wipe: *"Hmmm, how did you just do that?"* /
   *"Because I'm a frontier model trained to handle your complex tasks."*
4. **Proof (56 to 60s).** A clean, designed bar chart, *"Browsing Agent Benchmark · Online-Mind2Web,
   300 tasks including impossible tasks"*: **Aside GPT 5.5 99%**, Browser use 97%, GPT 5.4 Computer
   use 92%, Claude Opus 4.7 86%, ChatGPT Atlas 70%.
5. **Capability + privacy montage (60 to 78s).** *"Anything you can do in a browser, Aside can do"* →
   *"everything"* → *"is [lock] private"* → a MacBook product shot → *"Everything runs locally"* → a
   `read_your_passwords` field staying masked (privacy shown, not claimed).
6. **Close (78 to 88s).** Polarity flip to black, *"...that does your work."* → `aside.com`.

## What to steal

1. **Type carries the narration**: big geometric-grotesque sans, tight tracking, mostly
   monochrome, **polarity flips (black↔white) mark the chapters**, one idea per card, generous
   negative space, a **single blue accent** used maybe three times in 88s.
2. **It shows the product actually working, and stays gripping.** The middle 30s is a real
   multi-step agent demo, but it never becomes a screen-record dump: every step is one short line
   of the agent's reasoning, revealed in rhythm, inside clean floating UI recreations. This is the
   reference for **making an agent or app demo cinematic**, which a pure concept film does not do.
3. **Problem-agitation open with a named enemy.** Competitors literally say *"I can't do that."*
   Sharper and more confident than a soft "before".
4. **Product-truth rails** (`SKILL.md` section 7, here in practice): real labels (GPT-5.5, Local/Guard
   chips, Passkey, Chase, and named benchmark rivals incl. "Claude Opus 4.7"), a fictional demo
   world (Jun's Chase, the $120 refund, a `MEMORY.md` row), numbers internally consistent.
5. **Inline glyphs set into the words** (⊕ websites, a lock before accounts, ↺ history, a key before subscription) as a
   repeating motif: cheap, distinctive, on-brand.
6. **A light dialogue wrapper** ("how did you just do that?") voices the viewer's own reaction and
   adds warmth without a voiceover.
7. **Restraint on spectacle.** Only ~3 hero GFX moments (funnel, frosted wordmark, circular wipe,
   the MacBook). Everything else is type + UI. Proof is rendered as a *designed beat*, not a slide.

## Concept film or agent demo: pick by brief

| | Concept film | Agent demo (Aside) |
|---|---|---|
| Method | The film's mechanics embody the product truth; no UI, no demo, no dialogue | Problem → real demo in faithful UI → proof → privacy, wrapped in light dialogue |
| Use when | Selling a feeling or a position | Showing an app actually do a multi-step job |

Both can share kinetic type, monochrome with one accent, product-truth labelling and one idea per
shot, so you can **blend** them. Don't reach for the abstract concept film by reflex when the brief
is "show it working": that's an Aside-shaped job. On-screen copy follows the cliché ban in
`SKILL.md` section 3.
