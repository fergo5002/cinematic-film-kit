# Cinematic Film Kit

Short films, made with code and your coding agent. Remotion and WebGL draw the picture, a score is
synthesised from the same timing, an optional local voice can narrate it, and a set of tools
renders, masters and checks the result.

[Watch Hark](examples/hark/hark.mp4), a 22 second demo for a fictional birdwatching app.

[![A still from Hark](examples/hark/poster.png)](examples/hark/hark.mp4)

[Watch Neap](examples/neap/neap.mp4), a 21 second narrated demo for a fictional tide app, with an
AI-generated voice made on the laptop that rendered it.

The default workflow draws and synthesises everything locally. Narration is optional and also
local; paid generation is optional too. The kit's own code is MIT licensed;
[Remotion has separate terms](https://www.remotion.dev/license).

## What you need

- A computer running Windows 10 or 11, macOS 13 or newer, or Linux, with about 5 GB free.
- **Node.js 22.18 or newer** and **ffmpeg**. Setup below.
- A coding agent that can run commands on your machine: Claude Code, Codex CLI, Cursor, Gemini
  CLI, GitHub Copilot (agent mode in VS Code), Windsurf, Cline, OpenCode or Aider. Any of them
  will do; the kit tells each one how to work. A chat model without a terminal also works if you
  run the commands yourself (see `CHAT.md`).

## Set up (about ten minutes)

1. Install Node.js and ffmpeg:
   - **Windows** (PowerShell): `winget install OpenJS.NodeJS.LTS` and `winget install Gyan.FFmpeg`,
     then open a new terminal.
   - **macOS** ([Homebrew](https://brew.sh)): `brew install node ffmpeg-full`, then
     `export PATH="$(brew --prefix ffmpeg-full)/bin:$PATH"` and add that line to `~/.zprofile`.
     Homebrew's plain `ffmpeg` lacks `drawtext`, which the contact sheets need.
   - **Linux** (Debian or Ubuntu): `sudo apt install ffmpeg`, and Node 22 or newer from
     [nodejs.org](https://nodejs.org) or your package manager.
   - **Or Docker**, which needs nothing else: see `docker/README.md`.
2. Clone this repository or unzip a [release](https://github.com/fergo5002/cinematic-film-kit/releases).
3. Open the folder in your agent (or open a terminal in it and start the agent there).
4. Say: **"Set this kit up and check it works."** The agent runs `npm run doctor`, installs the
   dependencies with `npm ci`, downloads Chrome Headless Shell with `npx remotion browser ensure`
   (about 110 MB) and checks your graphics setup.

If you would rather do it yourself:

```sh
npm ci
npx remotion browser ensure
npm run doctor
```

## Make your first film

Tell the agent what you want, in plain words. For example:

> Make a 20 second launch film for my bakery, Crumb & Co. We bake sourdough overnight and you can
> order by 9pm for collection at 7am. Sound on. Here are our logo and colours.

> Make a 30 second product film for our scheduling app. Here are screenshots of the real screens
> it should show, and the three things it does better than a spreadsheet.

The agent will write a brief, propose concepts, show you style frames as stills, then render,
score, master and review the film, and hand you `out/<name>/<name>.mp4` with a short report. Give
it notes like you would give an editor: what feels slow, what is unclear, what you love. A
person's reaction to the moving film is the most valuable review there is.

## How each agent picks up the instructions

Everything an agent needs is in `AGENTS.md` and the skill in `.agents/skills/cinematic-film/`.
As of October 2026:

| Agent | What it reads | Anything to do |
|---|---|---|
| Claude Code | `CLAUDE.md`, which imports `AGENTS.md` | nothing |
| Codex CLI | `AGENTS.md`; skills in `.agents/skills` | nothing |
| Cursor | `AGENTS.md` | nothing |
| Gemini CLI | `GEMINI.md`, which imports `AGENTS.md` | nothing |
| GitHub Copilot (VS Code agent mode) | `AGENTS.md` and `.github/copilot-instructions.md` | nothing |
| Windsurf | `AGENTS.md` | nothing |
| Cline | `AGENTS.md` | make sure AGENTS.md support is on |
| OpenCode | `AGENTS.md` | nothing |
| Aider | `.aider.conf.yml`, which loads `AGENTS.md` and the skill | start `aider` from this folder |
| A chat model with no terminal | `CHAT.md` | upload it, then run the commands it gives you |

Agents change fast. If yours does not seem to have read the instructions, say "Read AGENTS.md and
follow it" at the start of the session.

## Free, narrated, or with connectors

**Free** is the default and needs nothing more. Everything is drawn and synthesised in code.

**Narration** gives a film a voice, made on your machine with Kokoro-82M, an open text-to-speech
model: no account and no key. The kit times every word, so the picture can key on them, writes
captions, ducks the score under the voice and marks the result as an AI-generated voice. Set it up
only if you want it (`npm run narrate -- --setup`, about 750 MB, all inside the kit's folder):
`docs/narration.md`. A film without a script works exactly as before.

**Connectors** add paid generation (images, video, sound effects, music, speech) from fal,
Replicate, ElevenLabs, OpenAI and Google, behind one command with a hard spending cap and a record
of every file generated. Set it up only if you want it: `connectors/README.md`. Generated media is
held to the same checks as drawn work.

## What is in the box

| Path | What |
|---|---|
| `AGENTS.md` | the operating manual every agent follows |
| `.agents/skills/cinematic-film/` | the craft: motion, structure, sound, type, colour, the checks, and the research behind them |
| `src/films/` | one folder per film; `hark` and `neap` (narrated) are the examples, `template` is where new films start |
| `src/engine/`, `audio/` | shared drawing, shader and sound code |
| `tools/` | doctor, rendering, stills, contact sheets, narration, the audit, the slop lint, review packets, release |
| `narration/` | the optional local voice's packages and engine (installed on request) |
| `reviews/prompts/` | the cold explain-back and the critic |
| `connectors/` | optional paid generation, with mocks and tests |
| `docker/` | a Linux render box |
| `examples/hark/`, `examples/neap/` | the example films and their review records |
| `docs/` | longer guides: per-agent notes, troubleshooting |

## Maintaining a release

Commit source changes, then run `python tools/package-source.py` (Python 3.11 or newer).
Commit the generated `MANIFEST.json` before tagging. `python tools/package-source.py --check`
checks the committed manifest against the committed source. The packager refuses dirty source
and writes a ZIP and checksum under `dist/`. Python is only needed for this maintainer step.

## Licences

The kit's own code and writing are MIT licensed (`LICENSE`). It installs third-party software
with its own terms, listed in `THIRD_PARTY_NOTICES.md`. One matters for business use:
**Remotion**, the video engine, is free for individuals, for companies of up to three employees,
for non-profits and for evaluation; other companies need a Remotion company licence (see
remotion.dev/license). The bundled fonts
are SIL Open Font Licence, which covers video.

## What has and has not been tested

Version 0.2 was tested on a Mac with an Apple M5 chip, from a fresh clone: set-up, the
doctor, the template, Hark and the narrated Neap example end to end through every release gate,
Kokoro narration, and every tool's own test suite. Continuous integration runs the tests on Linux
and macOS and renders in a clean Linux container. Version 0.1 was tested on a 2023 Windows 11
laptop and in that container; the 0.2 changes were not re-run on Windows by hand, only through the
tests that run everywhere. Not tested yet: a fresh agent making a film from this folder alone,
agents other than the ones the author uses, and the narration engine itself on Windows or Linux.
Nobody has listened to the example's voice; it was checked by measurement. The connectors are
tested against local mocks built from each provider's documentation, because no keys were used.
The details are in `docs/testing.md`.
