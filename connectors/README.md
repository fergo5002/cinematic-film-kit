# Connectors: optional paid generation

This kit's default is free. Every film is drawn, animated and scored in code, with no accounts, no
keys and no spending, and that is enough for most films. Connectors are the exception: one command,
`film-gen`, that can buy images, video, sound effects, music and speech from fal, Replicate,
ElevenLabs, OpenAI and Google, inside a budget you set, with a record of every file and every cent.

Use connectors when a shot needs something code cannot draw well: a photographic plate, a texture
from the real world, a voice. Do not use them for the brand's mark, its type, product interface,
any words in the picture, or anything that has to be exact. Those stay in code, composited on top.

Nothing here was tested against a live provider. No keys were available when this was built, so
every request shape was written from the providers' documentation and checked against a local mock
of their APIs (see [What was tested](#what-was-tested-and-what-was-not)).

## Contents

- [Set up](#set-up)
- [Commands](#commands)
- [Models and prices](#models-and-prices)
- [Cost rules](#cost-rules)
- [Quality rules](#quality-rules)
- [Using generated media in a film](#using-generated-media-in-a-film)
- [What each run writes](#what-each-run-writes)
- [Licences and terms](#licences-and-terms)
- [The MCP server](#the-mcp-server)
- [Vendor MCP servers (not recommended)](#vendor-mcp-servers-not-recommended)
- [The mock, for trying it free](#the-mock-for-trying-it-free)
- [What was tested, and what was not](#what-was-tested-and-what-was-not)

## Set up

You need Node 22.18 or later (the kit already needs it). The `film-gen` command itself uses no
packages. Only the MCP server needs two, installed inside this folder.

### 1. Keys

Get a key from each provider you want to use and put it in a file called `.env` at the kit root
(the folder that holds `package.json`), one per line. Only the ones you use:

```
FAL_KEY=...
REPLICATE_API_TOKEN=...
ELEVENLABS_API_KEY=...
OPENAI_API_KEY=...
GEMINI_API_KEY=...
FILM_GEN_BUDGET_USD=5
FILM_GEN_BUDGET_TOTAL_USD=20
```

The kit's `.gitignore` lists `.env`, so it stays out of git; `film-gen` refuses to use a key from a
`.env` that git does not ignore. Never put a key in any other file, never paste one into a chat or a
prompt. Keys set in your shell win over `.env`.

The Gemini key is a Google AI Studio key for the Gemini API, not a Vertex AI credential.

### 2. Two budgets

`FILM_GEN_BUDGET_USD` is the most one film may spend, in US dollars; the spend so far is the total
of that film's ledger (`public/films/<id>/media/ledger.jsonl`). `FILM_GEN_BUDGET_TOTAL_USD` is the
most the whole kit may spend, across every film's ledger. Both must be set above zero, and a job
must fit under both, or it is refused. A film must exist (`src/films/<id>/film.ts`) before anything
is generated for it, so a made-up film id cannot start a fresh budget.

### 3. Check it

From the kit root:

| System | Command |
|---|---|
| Windows (PowerShell) | `node connectors\film-gen.mjs doctor` |
| macOS, Linux | `node connectors/film-gen.mjs doctor` |

`doctor` says which keys are set and where from, never their values; whether `.env` is ignored by
git; both budgets; any base URL overrides; price entries due a re-check; and whether the MCP
packages are installed.

If you prefer the shell to a file: PowerShell `$env:FAL_KEY = "..."`, bash or zsh
`export FAL_KEY=...`. These last for that window only.

### 4. Only for the MCP server

```
cd connectors
npm install
```

This installs `@modelcontextprotocol/sdk` 1.31.0 and `zod` 4.6.5, pinned, into
`connectors/node_modules`. Then see [The MCP server](#the-mcp-server).

## Commands

Run from the kit root. Every command takes `--json` for machine-readable output and `--root <dir>`
to point at another kit. `node connectors/film-gen.mjs help` prints the summary.

### estimate

```
node connectors/film-gen.mjs estimate --kind video --provider fal \
  --model google/gemini-omni-flash/v1.1/image-to-video \
  --prompt-file <prompt file> --film <id> --name shot-03 \
  --image <start frame png> --duration 4 --resolution 360p
```

Prices the request from `prices.json`, shows where and when the price was read, and lists every
reason the request would be refused (a budget not set, over the film's budget or the kit's, a film
that does not exist, a missing key, a key read from a `.env` that git does not ignore, an unknown
price, a licence, a model past its shutdown date, an existing file). Spends nothing and sends nothing.

### generate

The same options, and it runs: estimate, budget check, a reservation in the ledger, the provider
call, polling, the download, the file, its sidecar and the closing ledger line.

| Option | Meaning |
|---|---|
| `--kind` | `image`, `video`, `sfx`, `music` or `speech` |
| `--provider` | `fal`, `replicate`, `elevenlabs`, `openai` or `google` |
| `--model` | a model id from the table below (`film-gen models` lists them) |
| `--prompt-file` | a text file inside the kit holding the prompt; never `.env`, never anything that contains a key |
| `--film`, `--name` | output goes to `public/films/<film>/media/<name>.<ext>` |
| `--image` | a start frame or reference: a file inside the kit or an `https` URL |
| `--duration` | seconds, where the model takes a length |
| `--aspect`, `--resolution`, `--quality` | checked against what the model accepts |
| `--audio` | ask a video model for sound. Off by default: the kit scores in code |
| `--seed` | sent where the model takes one; otherwise noted and dropped |
| `--voice` | speech only: an ElevenLabs voice id, an OpenAI voice name or a Gemini voice name |
| `--param key=value` | a provider-native field, repeatable, for anything the flags do not cover; refused if it is a field film-gen sets itself or one that changes the price (duration, resolution, number of outputs and the like), because the estimate cannot see it |
| `--dry-run` | show the exact request (keys and image data elided) and send nothing |
| `--base-url` | send this provider's calls somewhere else, such as the mock |
| `--accept-unknown-price` | run a model whose price the table does not know |
| `--accept-licence` | run a model whose terms need your decision (see licences) |
| `--overwrite` | replace a file with the same name; without it, an existing name is refused |
| `--timeout` | seconds to wait for a queued job (default 1800) |

Exit codes: 0 done; 1 a usage mistake; 2 refused before anything was sent; 3 the provider returned
an error; 4 the outcome is uncertain (a request timed out or came back unreadable after it may have
been accepted). On 4, check the provider's dashboard before retrying: the job may have run and been
charged, and the ledger counts it at its estimate.

What it does on errors: a rate limit (HTTP 429) is waited out using the provider's Retry-After and
retried; a server error while polling is retried; a server error on the submit is not retried,
because a second submit could be charged twice, and it counts as uncertain at the estimate, as does a
submit that times out or is cancelled; only a definite 4xx counts as nothing spent. An auth or credit
error stops at once. A redirect is never followed with a key attached: it is reported as an error.

### ledger

`node connectors/film-gen.mjs ledger --film <id>` lists every job for the film with its spend and
how that figure was arrived at; without `--film` it covers every film.

### models

`node connectors/film-gen.mjs models --kind video` lists what this kit knows, straight from
`prices.json`, with shutdown dates and re-check flags.

### doctor

See [Check it](#3-check-it).

### mcp-install

`node connectors/film-gen.mjs mcp-install --agent claude` writes the MCP server into that agent's
project config. Agents: `claude`, `codex`, `cursor`, `gemini`, `vscode`, `opencode`. Add `--print`
to see the snippet without writing it. See [The MCP server](#the-mcp-server).

### Environment variables

| Name | Use |
|---|---|
| `FAL_KEY`, `REPLICATE_API_TOKEN`, `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` | provider keys |
| `FILM_GEN_BUDGET_USD` | the most one film may spend; required for any paid call |
| `FILM_GEN_BUDGET_TOTAL_USD` | the most the whole kit may spend, across every film; also required |
| `FILM_GEN_<PROVIDER>_BASE_URL` | send that provider's calls elsewhere (for example `FILM_GEN_FAL_BASE_URL`) |
| `FILM_GEN_FAL_STORAGE_BASE_URL` | fal's upload host, when the fal base URL is overridden |
| `FILM_GEN_ROOT` | the kit root, when running from somewhere else |
| `FILM_GEN_HTTP_TIMEOUT_MS`, `FILM_GEN_GENERATE_TIMEOUT_MS`, `FILM_GEN_DOWNLOAD_TIMEOUT_MS`, `FILM_GEN_POLL_MS`, `FILM_GEN_RETRIES` | timing; the defaults suit the real providers |

## Models and prices

List prices in US dollars, read on 1 October 2026 (UTC) from each provider's own page, which
`prices.json` names model by model. Prices move often. When today is past an entry's re-check
date, estimates still work but warn you to re-read the source. When a provider has announced a
shutdown date, the model is refused from that day.

"Unknown" means the provider bills by tokens and publishes no figure this kit can turn into a price
before the call; those need `--accept-unknown-price`, and OpenAI's image calls then record a cost
worked out from the token counts OpenAI returns.

### Video

| Provider | Model | List price | Re-check after | Notes |
|---|---|---|---|---|
| fal | `google/gemini-omni-flash/v1.1/text-to-video` | $0.03/s 360p, $0.10 720p, $0.15 1080p, $0.30 4k | 2026-11-01 | 3 to 10 s, audio always |
| fal | `google/gemini-omni-flash/v1.1/image-to-video` | as above | 2026-11-01 | start frame |
| fal | `fal-ai/veo3.1/fast/image-to-video` | $0.10/s (audio $0.15), 4k $0.30 ($0.35) | 2026-10-22 | Google ends the Veo 3.1 previews on 22 October |
| fal | `fal-ai/kling-video/v3/pro/image-to-video` | $0.112/s, audio $0.168 | 2026-11-01 | licence gate: written permission |
| fal | `bytedance/seedance-2.5/image-to-video` | about $0.22/s 480p, $0.47 720p, $1.16 1080p | 2026-11-01 | token-billed, approximate |
| fal | `alibaba/wan-3.0/image-to-video` | $0.05/s 480p, $0.10 720p, $0.20 1080p | 2026-11-01 | |
| fal | `blackforestlabs/flux-3/image-to-video` | $0.17/s 720p, $0.29 1080p | 2026-11-01 | 5 to 20 s |
| replicate | `google/gemini-omni-1.1` | $0.05/s 360p, $0.15 720p, $0.23 1080p, $0.45 4k | 2026-11-01 | length set by the model, priced at 10 s |
| replicate | `google/veo-3.1-fast` | $0.10/s, audio $0.15 | 2026-10-22 | upstream preview ends 22 October |
| replicate | `kwaivgi/kling-v3-video` | $0.168/s 720p, $0.224 1080p, $0.42 4k (more with audio) | 2026-11-01 | licence gate: written permission |
| replicate | `bytedance/seedance-2.5` | $0.1028/s 480p, $0.2312 720p | 2026-11-01 | up to 30 s |
| replicate | `black-forest-labs/flux-3` | $0.17/s 720p, $0.29 1080p | 2026-11-01 | early access preview |
| google | `gemini-omni-1.1-flash` | about $0.10/s at 720p; other sizes unknown | 2026-11-01 | Google's default video model; priced at 10 s |
| google | `veo-3.1-fast-generate-preview` | $0.10/s 720p, $0.12 1080p, $0.30 4k | 2026-10-22 | refused from 2026-10-22 |
| google | `veo-3.1-generate-preview` | $0.40/s, 4k $0.60 | 2026-10-22 | refused from 2026-10-22 |
| google | `veo-3.1-lite-generate-preview` | $0.05/s 720p, $0.08 1080p | 2026-10-22 | refused from 2026-10-22 |

### Images

| Provider | Model | List price | Re-check after | Notes |
|---|---|---|---|---|
| fal | `fal-ai/nano-banana-2`, `fal-ai/nano-banana-2/edit` | $0.06 0.5K, $0.08 1K, $0.12 2K, $0.16 4K | 2026-11-01 | Gemini 3.1 Flash Image |
| fal | `blackforestlabs/flux-3/text-to-image`, `blackforestlabs/flux-3/edit-image` | $0.048 | 2026-10-08 | launch price $0.024 until 8 October |
| replicate | `google/nano-banana-2` | $0.067 1K, $0.101 2K, $0.151 4K | 2026-11-01 | |
| replicate | `black-forest-labs/flux-3-image` | $0.0205 to $0.3035 by size | 2026-11-01 | web grounding off by default |
| replicate | `openai/gpt-image-2.5-flare` | $0.012 low to $0.50 max | 2026-11-01 | |
| openai | `gpt-image-2` | $0.005 to $0.211 by quality and size | 2026-11-01 | 16:9 maps to 1536x1024 |
| openai | `gpt-image-2.5-flare`, `gpt-image-2.5-sunburst` | unknown (tokens) | 2026-11-01 | OpenAI's named successors to GPT Image 1.x |
| google | `gemini-3.1-flash-image` | $0.045 512, $0.067 1K, $0.101 2K, $0.151 4K | 2026-11-01 | Nano Banana 2 |
| google | `gemini-3-pro-image` | $0.134 1K or 2K, $0.24 4K | 2026-11-01 | Nano Banana Pro |
| google | `gemini-3.1-flash-lite-image` | $0.0336 1K | 2026-11-01 | 1K only |

### Sound effects, music, speech

| Provider | Model | Kind | List price | Re-check after | Notes |
|---|---|---|---|---|---|
| fal | `fal-ai/elevenlabs/sound-effects/v2` | sfx | $0.002/s | 2026-11-01 | up to 22 s |
| fal | `fal-ai/stable-audio-3/small/sfx/text-to-audio` | sfx | $0.0206 a clip | 2026-11-01 | |
| fal | `fal-ai/stable-audio-3/medium/text-to-audio` | music | $0.0376 a clip | 2026-11-01 | up to 380 s |
| fal | `elevenlabs/music/v2.5` | music | $0.60/min, rounded up | 2026-11-01 | licence gate: film use |
| fal | `google/lyria-3.5` | music | $0.10 | 2026-11-01 | |
| replicate | `elevenlabs/music` | music | $0.0083/s | 2026-11-01 | licence gate: film use |
| replicate | `google/lyria-3-pro`, `google/lyria-3` | music | $0.08, $0.04 | 2026-11-01 | |
| replicate | `stability-ai/stable-audio-2.5` | music, sfx | $0.20 | 2026-11-01 | up to 190 s |
| elevenlabs | `eleven_text_to_sound_v2` | sfx | $0.12/min | 2026-11-01 | up to 30 s |
| elevenlabs | `music_v2_5`, `music_v2` | music | $0.15/min | 2026-11-01 | licence gate: film use |
| elevenlabs | `eleven_v4` | speech | $0.08 per 1,000 characters | 2026-10-12 | $0.022 until 12 October |
| elevenlabs | `eleven_multilingual_v2`, `eleven_flash_v2_5` | speech | $0.08, $0.04 per 1,000 characters | 2026-11-01 | |
| openai | `tts-1-hd`, `tts-1` | speech | $0.03, $0.015 per 1,000 characters | 2026-11-01 | |
| openai | `gpt-4o-mini-tts` | speech | unknown (tokens) | 2026-11-01 | |
| google | `lyria-3.5`, `lyria-3-clip-preview` | music | $0.08, $0.04 | 2026-11-01 | |
| google | `gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts` | speech | $0.00225, $0.0015 per 10 s | 2026-12-31 | doubles on 1 January 2027 |

Speech priced per second is estimated at 12 characters a second, which is a rule of thumb.

### Left out on purpose

- OpenAI Sora 2 and the Videos API: removed from OpenAI's API on 24 September 2026.
- Imagen 4: shut down on the Gemini API on 17 August 2026. The original Nano Banana
  (`gemini-2.5-flash-image`) shuts on 2 October 2026.
- `gpt-image-1` ends on 23 October 2026 and `gpt-image-1.5` on 1 December 2026.
- MMAudio and MusicGen: their weights are CC BY-NC 4.0, so not for commercial work, whatever a
  platform's badge says.
- HunyuanVideo-Foley: its licence excludes the EU, the UK and South Korea, outputs included.

## Cost rules

1. **Estimate before spending.** Run `estimate` first and show the figure to whoever is paying.
   For a batch, add up shots times takes times seconds times price, and get a yes for that total.
2. **Stills before motion.** Approve a start frame (and an end frame where the model takes one) as
   a still, which costs cents, before paying for any video, which costs dollars.
3. **Short, low-resolution tests before finals.** Test at the shortest length and lowest
   resolution the model offers (360p or 480p, four or five seconds), then make the final only for
   takes that worked.
4. **Three tries per shot, then change the plan.** Three failed takes mean the shot or the prompt
   is wrong. Re-board it, draw it in code, or cut it. Do not keep buying takes.
5. **Only through film-gen.** Every paid call goes through `film-gen` (or its MCP server), never an
   agent's own tools or a hand-written API call, so the estimate, the budget and the ledger stay in
   one place.

## Quality rules

- Generated media passes the same gates as drawn work: the audit, the stills, the contact sheet,
  the critic. Nothing gets a pass for being expensive.
- Read the frames at every cut, at full size, for the tells of generated video: hands and faces
  that drift, text that melts, objects that merge or swap, physics that cheats, a camera move that
  stalls or slides.
- Cut on the beatmap grid. Never speed up or slow down a clip to fit a beat; trim it or make the
  shot again at the right length.
- Grade it into the film's colour script. A generated plate arrives with its own colour and
  contrast; match it to the drawn shots around it.
- Never generate the mark, the type, product interface, any text in the picture, or a real
  person's likeness or voice. Those are built in code and composited on top, or left out.

## Using generated media in a film

Files land in `public/films/<id>/media/`, so a composition reaches them with `staticFile`. Stills
use `Img` from `remotion`; video and audio use `Video` and `Audio` from `@remotion/media`, which
the kit already installs.

```tsx
import {Video} from '@remotion/media';
import {AbsoluteFill, Img, Sequence, staticFile} from 'remotion';
import {bar, beat} from './beatmap';

const FILM_ID = 'your-film-id';
const media = (file: string) => staticFile(`films/${FILM_ID}/media/${file}`);

// Each plate starts and ends on the beat grid; the clip is trimmed, never retimed.
export const Plates = () => (
  <AbsoluteFill>
    <Sequence from={bar(2)} durationInFrames={bar(1)}>
      <Video src={media('shot-03.mp4')} muted objectFit="cover" />
    </Sequence>
    <Sequence from={bar(3)} durationInFrames={beat(2)}>
      <Img src={media('still-04.png')} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
    </Sequence>
  </AbsoluteFill>
);
```

Keep video `muted` unless its sound is meant to be in the mix; the score is built in code. Use
`trimBefore` and `trimAfter` (in frames) to choose the part of a clip you want, never
`playbackRate`.

## What each run writes

- `public/films/<id>/media/<name>.<ext>`: the file, extension from its content (png, jpg, webp,
  mp4, mov, wav, mp3).
- `<name>.<ext>.prov.json` beside it: provider, model, kind, the full prompt and its hash, every
  parameter, the request as sent (image data elided), input image hashes, seed requested and
  returned, the provider's request id, the estimate with its price source and date, the actual cost
  if one is known, the output's size and SHA-256, the terms URL and licence note, and a timestamp.
- `public/films/<id>/media/ledger.jsonl`: one JSON line when a job is reserved (before anything is
  sent) and one when it ends (`done`, `failed`, `uncertain` or `released`). A job's spend is on its
  latest line. A failed or uncertain job counts at its estimate, because some providers charge for
  those; only a job the provider definitely turned away counts at zero. Two runs at once, on one film
  or on several, cannot both spend the same headroom. Keys are redacted from everything written to
  sidecars and the ledger.

Keep the sidecars. They are how anyone can later tell which frames were generated, by what, and
under which terms.

## Licences and terms

Read the terms yourself before anything goes into commercial work; this section is a summary of
what was read on 1 October 2026, not legal advice. Platform labels such as fal's "commercial"
badge are the platform's label, not the model maker's licence. Where they disagree, the maker's
terms are the stricter reading.

- **fal** ([terms](https://fal.ai/legal/terms-of-service)): no clause grants you ownership of
  output; each model carries its own licence. fal marks most models for commercial use.
- **Replicate** ([terms](https://replicate.com/terms)): grants you rights in output, including
  commercial use, subject to the model maker's terms, and names Black Forest Labs, Ideogram and
  Stability AI terms that pass through.
- **ElevenLabs** ([terms](https://elevenlabs.io/terms-of-use)): free accounts may use output only
  non-commercially; paid plans may use it commercially. Eleven Music has its own
  [terms](https://elevenlabs.io/eleven-music-model-specific-terms): every self-serve plan excludes
  film, TV, radio and studio games, and only Enterprise Music covers them, which is why the music
  models need `--accept-licence`. ElevenLabs watermarks its audio. Use only voices you have the
  right to use.
- **OpenAI** ([services agreement](https://openai.com/policies/services-agreement/)): you own the
  output. Its usage policies require telling listeners that a TTS voice is AI-generated. Its
  content provenance guide says images carry C2PA metadata and images and audio a SynthID watermark.
- **Google, Gemini API** ([terms](https://ai.google.dev/gemini-api/terms)): Google claims no
  ownership of generated content and may generate similar content for others. Apps serving people
  in the EEA, Switzerland or the UK must use paid services. Gemini Omni Flash cannot edit or extend
  uploaded video, or take uploaded images of minors, in those regions. Images, video and music
  carry a SynthID watermark.
- **Kling** ([terms](https://kling.ai/docs/user-policy), read through a summarising fetch):
  commercial use of output needs Kling's written permission and Kling branding. The terms do not
  mention resellers, so the licence gate applies on fal and Replicate too.
- **Seedance, Wan, FLUX 3, Gemini models through a reseller**: the makers' own terms for use through
  fal or Replicate were not read. Treat them as unverified.
- **Disclosure**: the EU AI Act's transparency duties (Article 50), which apply from 2 August
  2026, cover generated or altered images, video and audio that look real. Check them before
  publishing in the EU.

## The MCP server

`connectors/mcp/server.mjs` gives an agent three tools over stdio: `estimate`, `generate` and
`ledger`. It reads the kit's `.env` itself, so no agent config ever holds a key. `generate` only
runs with the token that `estimate` returned for exactly the same arguments, used once within 15
minutes, so an agent has to price a job, and can show you the price, before it spends anything. If
the agent cancels a call after the provider has the job, the ledger counts it at its estimate.

Install the packages (see [Set up](#4-only-for-the-mcp-server)), then:

```
node connectors/film-gen.mjs mcp-install --agent claude
```

| Agent | Writes | Format checked against |
|---|---|---|
| Claude Code | `.mcp.json` (asks you to approve the server once) | code.claude.com/docs/en/mcp |
| Codex CLI | `.codex/config.toml` (trusted projects only; otherwise copy the block to `~/.codex/config.toml`) | developers.openai.com/codex/mcp |
| Cursor | `.cursor/mcp.json` | cursor.com/docs/mcp |
| Gemini CLI | `.gemini/settings.json` | the Gemini CLI MCP server docs on GitHub |
| VS Code | `.vscode/mcp.json` | code.visualstudio.com/docs/copilot/reference/mcp-configuration |
| OpenCode | `opencode.json` | opencode.ai/docs/mcp-servers |

Each format was checked against that documentation on 1 October 2026; none was loaded into the
agent itself. The server reads `.env` when it starts, so restart the agent after changing a key or
the budget. The config holds absolute paths to your Node and to the server, so run
`mcp-install` again after moving the kit or changing Node. Video jobs can take minutes: the Claude
Code, Codex and Gemini entries carry a 30-minute tool timeout; Cursor, VS Code and OpenCode
document no such setting. Gemini CLI strips variables named like `*KEY*` or `*TOKEN*` from a
server's environment, which is one more reason the keys live in `.env`.

## Vendor MCP servers (not recommended)

These exist and work with their own keys or sign-in, but they bypass this kit's estimate, budget,
ledger and sidecars. If you use one, you lose the spending cap and the record of what was made.

- **fal**: hosted at `https://mcp.fal.ai/mcp`, with your key as a Bearer header, for example
  `claude mcp add --transport http fal-ai https://mcp.fal.ai/mcp --header "Authorization: Bearer <FAL_KEY>"`.
- **Replicate**: hosted at `https://mcp.replicate.com/sse` (you sign in on Replicate's page), or
  the npm package run as `npx -y replicate-mcp` with `REPLICATE_API_TOKEN` in its environment.
- **ElevenLabs**: hosted at `https://api.elevenlabs.io/v1/mcp` with OAuth sign-in; it mostly
  manages ElevenLabs agents and can make speech. The older local Python server is deprecated.
- **Google**: the Genmedia MCP servers from Google Cloud cover Gemini image, Veo, Lyria and TTS
  through Vertex AI (a Google Cloud project, not a Gemini API key), installed as prebuilt binaries
  from the `GoogleCloudPlatform/genmedia-creative-studio` repository.
- **OpenAI**: no MCP server for image or speech generation was found in OpenAI's documentation.

## The mock, for trying it free

`connectors/mock/server.mjs` imitates all five providers on your machine, including their error
replies, and serves small real media files made with ffmpeg. Start it, then point `film-gen` at it
with the variables it prints:

```
node connectors/mock/server.mjs --port 8787
```

Every route in the mock says what it imitates: the provider's documentation, an error reply seen
with a fake key, or, where neither exists, a guess that is marked as one.

## What was tested, and what was not

Tested, with no network and no keys (`npm test` inside `connectors/`; the MCP server tests skip
themselves when its packages are not installed): every adapter
against the mock for success, polling, and these failures: rejected key, out of credit, rate
limiting with Retry-After (waited out, and given up on), server errors on submit (not retried) and
while polling (retried), a timeout, a failed job, an expired output link and unreadable JSON. Also
budget refusals (per film and kit-wide, including two runs racing for the same headroom), films that
do not exist, unknown-price and licence refusals, models past their shutdown date, a `--param` that
would change the price, prompt files outside the kit or holding a key, cancelled requests, redirects
(never followed with a key), the sidecar and ledger contents, a scan of every output and file for key
text, the MCP server over stdio through the official SDK client, and each agent's config file.

Not tested: any live provider. No key was used and nothing was spent, so these are unconfirmed
until someone runs them for real:

- that each provider accepts the request shapes written here (field names come from each model's
  published schema, read on 1 October 2026);
- the bodies of most failure replies (only the rejected-key replies were seen for real; the rest
  come from documentation or are guesses, as marked in the mock);
- Google's image settings: the REST documentation shows `generationConfig.responseFormat.image`
  while the SDKs call the same settings `imageConfig`;
- whether fal and Replicate keep serving Veo 3.1 after Google's 22 October shutdown;
- the prices themselves, which were read once and include several promotions.

The first real run with each provider should be a single cheap test, watched, with `--dry-run`
first to see exactly what will be sent.
