# Operating manual for the agent

You are working inside the Cinematic Film Kit: a Remotion project, a craft skill and a set of
tools for making short brand and product films to a high standard, drawn, animated and scored in
code. The person who owns this folder will ask you for films. This file is how you work here.
Read it all once, then read the skill before any film work.

## 1. What is here

- `.agents/skills/cinematic-film/SKILL.md`: the craft. Read it before you write a beat, and read
  the references it points to when a task needs them. It is the standard you are held to.
- `src/films/<id>/`: one folder per film. `src/films/hark/` is the worked example (a made-up
  birdsong app, 22 s) and `src/films/template/` is the starting point `new-film` copies.
- `src/engine/`, `audio/`, `tools/`: shared code. Do not edit these, the example or the template
  unless the person asks. If a film needs a change to shared code, copy the file into the film's
  folder and change the copy.
- `connectors/`: optional paid generation (see section 7). Off unless the person turns it on.
- `reviews/prompts/`: the cold explain-back and the critic.
- `examples/hark/`: the example's finished film and its review records. Watch it before your
  first film: it is the bar.

## 2. First run on a new machine

1. `npm run doctor`. It checks Node (22.18 or newer), ffmpeg and its filters, disk and the browser,
   and prints the exact install command for anything missing. Install what it asks for, with the
   person's permission, then run it again.
2. `npm ci` (or `npm install`), then `npx remotion browser ensure` to download Chrome Headless
   Shell. Run `npm run doctor` once more: after install it tests WebGL with
   each graphics backend and records the one that works in `film.local.json`.
3. If the folder is not a git repository, `git init` and commit, so every film has history.

## 3. Making a film: the process

Work in this order. Each step leaves a file behind, so the person can see the work and you can
pick it up later. Ask at most one question up front, only if the answer changes the film; for
everything else make a sensible choice, write it down in the brief and proceed.

| Step | Leaves behind | Command |
|---|---|---|
| Brief: product, audience, the one action, length, format, sound on or off | `src/films/<id>/brief.md` | `npm run new-film -- <id>` first |
| Facts: what is true about the product, with sources; real UI evidence if it is a product film | `facts.md` | |
| Concept: three directions, each with its mechanic (how the form argues the thesis); pick one and say why | `concept.md` | |
| Treatment: beats with timings at the chosen BPM, what is on screen and what is heard | `treatment.md` | |
| Timing: sections and named moments | `beatmap.ts` | |
| Style frames: the key frames, built in code, reviewed as stills before any full render | `out/<id>/stills/` | `npm run stills -- <id> <frames>` |
| Score: synthesised from the same beatmap, so sync is structural | `score.mjs` | `npm run score -- <id>` |
| Preview, then render and master | `out/<id>/<id>.mp4` | `npm run preview -- <id>`, `npm run render -- <id>`, `npm run master -- <id>` |
| Audit and slop lint | `out/<id>/audit.json` | `npm run audit -- <id>`, `npm run lint:slop -- <id>` |
| Reviews: cold explain-back and critic (section 5) | `reviews.md` | `npm run packet -- <id>` |
| Release: every gate, one report | `out/<id>/report.md` | `npm run release -- <id>` |

Look at your own frames. Render stills at every beat and open them before you render the film;
render contact sheets (`npm run sheet -- <id>`) after. Most defects are invisible in code and
obvious in a picture. Iterate in rounds: stills, fix, stills.

## 4. The gates

`npm run release -- <id>` runs them in order and writes `out/<id>/report.md`. A gate that did not
run is reported NOT RUN, never PASS. The bands (settled runs, motion energy, luminance, loudness
-16 to -13 LUFS, loudness range 6 to 13 LU, true peak -3 to -1 dBTP) and the reasons for them are
in the skill. Passing the gates is the floor, not the bar: the reviews and the person decide
whether the film is good.

## 5. Reviews: independent or labelled

Before any review, write `expected.md` in the film's folder: the product in one sentence, the
audience, the claims in order, the order of events. Then `npm run packet -- <id>` builds
`out/<id>/packet/`: contact sheets every 1.25 s, a `sound-events.md` you must fill in (what is
audible, when, plainly, since reviewers cannot listen), and the two prompts.

The reviewer must not have seen the brief or the build. Use the first of these you can:

1. A subagent, if your harness has them, told to read only the packet folder.
2. A second agent session started inside the packet folder with this project's instructions off,
   for example `claude -p "$(cat explain-back.md)"` run from `out/<id>/packet`, or
   `codex exec --cd out/<id>/packet --skip-git-repo-check "<prompt>"`.
3. Ask the person to upload the sheets and `sound-events.md` to a fresh chat with the prompt.

If none is possible, write "self-review, not independent" at the top of `reviews.md`. Compare the
explain-back with `expected.md`, record both reviews and what you changed because of them. A
reviewer reading stills cannot feel motion: when the person reacts to the moving film, their
reaction outranks the critique.

## 6. Talking to the person

- Show style frames early. Show the preview before the final render.
- Report with numbers: duration, loudness, the audit result, what the reviews said.
- Every claim of done says what was not checked. "The audit passed" means the audit passed, not
  that the film is good. Nobody has listened to a score you synthesised until a person does.
- Prove the instrument before you blame the film. A browser tab in the background stops
  animation frames; a loudness meter on a quiet passage jitters. Take a control reading on
  something known to be good first.
- When the person corrects you, change the rule that let it happen (in the film's notes), not
  only the frame.

## 7. Two modes: free by default

**Free** (default): everything is drawn, animated and scored in code with this kit. No accounts,
no keys, no spending. This is how the example was made and it is enough for most films.

**Connectors** (only when the person asks and has set it up): paid image, video, music, sound and
speech generation through `connectors/film-gen.mjs`, never by calling providers directly. Read
`connectors/README.md` first. Rules:

- Keys live in the environment or a git-ignored `.env`. Never write a key into any file you
  create, never print one, never paste one into a prompt.
- Nothing is spent unless both caps are set: `FILM_GEN_BUDGET_USD` (per film) and
  `FILM_GEN_BUDGET_TOTAL_USD` (all films). Show the estimate and get the person's yes before any
  batch. Stills before motion; short low-resolution tests before finals; three
  tries per shot, then change the plan rather than the prompt.
- Generated media passes the same gates as drawn work, is cut on the beatmap grid and graded into
  the film's colour. Never generate the brand's mark, its type, product interface, text in the
  picture or a real person's likeness.
- Run `node connectors/film-gen.mjs estimate ...` first and show the person the number; through
  MCP, `generate` refuses without the token `estimate` returned for the identical request.
- Never pass `--accept-licence`, `--accept-unknown-price` or `--overwrite` without the person's
  explicit yes for that file. Some models' own terms forbid film use on self-serve plans.
- Exit code 4 means the provider may already have charged for the job: do not retry; tell the
  person.
- The budget and ledger are per film (`public/films/<id>/media/ledger.jsonl`). Never edit the
  ledger or a `.prov.json` sidecar; the release gate fails on media without them.

## 8. Never

- `Math.random()` or wall-clock time in anything that renders. Use the seeded helpers in
  `src/engine/lib/prng.ts`; every frame must be a pure function of its number.
- An invented interface presented as a real product's. A product film shows the real product,
  from current, privacy-safe captures or code the person provides. A made-up brand gets a made-up
  interface, and the film says nothing that implies otherwise.
- Real customers' data, real people's faces or voices without their consent.
- Fonts or assets without a licence that covers video. The bundled fonts are OFL.
- Em dashes or en dashes in on-screen copy. They read as machine-written.
- Writing outside this folder, deleting the person's files, or committing secrets.

## 9. If you are a chat model without a terminal

Read `CHAT.md` instead: it explains how to work through the person, one command at a time.
