# Narration

The kit can give a film a voice, made on your own machine. Kokoro-82M, an open text-to-speech
model, speaks the film's script; the kit times every word, writes captions, masters the voice,
ducks the score under it and labels the result as an AI-generated voice. No account, no key and
no network once it is set up. It is optional: a film without a `narration.txt` works exactly as it
always did, and the kit never downloads the voice unless you ask for it.

`src/films/neap/` is the worked example: a 21 second narrated film for a made-up tide app, with
its picture keyed to the words.

## When to narrate

Most short films do not need a voice. Words on screen, a score and the picture carry a brand film
better than a voice reading over it, and a voice that repeats what the screen says is the commonest
way to make a film feel like an advert. Narrate when the brief asks for a voice, when the film has
to explain something in more words than the screen can hold, or when it will be watched by people
who cannot read the screen. If you narrate, the voice leads: the picture and the type support what
is being said, and the music sits under it.

## Set up (once)

```sh
npm run narrate -- --setup
```

This installs four packages into `narration/node_modules` (about 410 MB) and downloads the pinned
Kokoro-82M model (326 MB) into `.cache/narration/` inside the kit, then checks it. Both folders are
git-ignored and left out of release zips. `npm run doctor` shows whether narration is set up;
"off" means it is not, which is fine. `NARRATION_MODEL_DIR` moves the model somewhere else if you
want one copy for several kits.

## Make the narration

1. Write the script in `src/films/<id>/narration.txt` (the format is below).
2. Tell the beatmap where the voice starts and how it speaks:

   ```ts
   export const NARRATION = {voice: 'af_heart', speed: 1, at: 18}; // at: the frame of the first word
   ```

   Without it the kit uses `af_heart` at speed 1, starting at 0.2 s. `npm run narrate -- --voices`
   lists the 28 voices: names starting `a` are American, `b` British; `f` and `m` are the
   gender; the grade is Kokoro's own.
3. `npm run narrate -- <id>`. Flags win over the beatmap: `--voice`, `--speed`, `--gap`, `--tail`,
   `--timings auto|engine|proportional`.
4. `npm run score -- <id>`, so the bed ducks under the new lines.
5. Use it in the film (below), then preview, render, master and release as usual.

It writes:

| File | What |
|---|---|
| `public/films/<id>/narration/narration.wav` | the voice: mono, 48 kHz, 24-bit, -16 LUFS, true peak at or under -1.5 dBTP, starting at film time 0 so it lines up with frame 0; the disclosure in its comment tag |
| `public/films/<id>/narration/captions.srt`, `captions.vtt` | captions in film time, at most two lines of 42 characters; the VTT carries the disclosure as a `NOTE` |
| `public/films/<id>/narration/meta.json` | what made it (engine, model, revision and hash, voice, settings, versions), the script's hash, pace, loudness, timing checks and the disclosure |
| `src/films/<id>/data/narration.json` | every written word, caption cue and pause in film seconds, for the picture and the score |

Nothing is written unless the whole run succeeds. A narration whose last word ends later than
0.3 s before the end of the film is refused.

## The script

One sentence or phrase per line.

- `[pause 0.6]` on its own line or inline sets an exact silence between two lines (0.05 to 5 s).
  Lines with no pause mark between them get 0.45 s. Commas already give a short breath.
- A line that starts `# ` (hash, space) or is a bare `#` is a comment, skipped and reported.
- `{display|spoken}` sets how something is said while the captions keep what is written:
  `{14:52|two fifty-two}`, `{FAQ|F A Q}`.
- Money, percentages, years and plain numbers are spoken in full, the British way:

| Written | Spoken |
|---|---|
| `$50k` | fifty thousand dollars |
| `$1.5m` | one point five million dollars |
| `£250` | two hundred and fifty pounds |
| `$12.50` | twelve dollars fifty |
| `$0.50` | fifty cents |
| `12%` | twelve per cent |
| `2026` | twenty twenty-six |
| `1,500` | one thousand, five hundred |

A bare four-digit number from 1100 to 2099 is read as a year, so write `1,500` for a quantity. Use
"to" for a range, not a dash. Times, ordinals, fractions and phone numbers are left to the voice:
spell them with `{display|spoken}`.

## Direction

The voice cannot fix a line that is wrong on the page. Read every line aloud before you voice it.

- **Pace.** Aim for 140 to 170 words a minute from the first word to the last, pauses included.
  The command reports it and warns above 175. Slow a voice with `--speed` (0.85 to 1.0).
- **Never speed speech up.** Speeds above 1.0 are refused, and the edit must never time-compress
  the voice. If the script is too long for the picture, cut words or give the picture more time.
- **Pauses on beat changes.** `[pause 0.8]` at a new scene or a new idea, `[pause 0.4]` to
  `[pause 0.6]` before a number or a name that has to land.
- **Line length.** Kokoro is weakest on very short lines and rushes long ones, so lines under three
  words or over 30 are flagged. Aim for about 8 to 30. A line over Kokoro's 510-token limit fails
  rather than being cut off silently.
- **Names.** Write names as their owners say them; respell with `{display|spoken}` when the voice
  gets one wrong, then listen to it.
- **Emphasis.** Kokoro has no emphasis control: get stress from the writing. Short sentences, the key
  word last. No capitals for emphasis.
- **No dashes.** An em or en dash shows in the captions and reads as machine-written. The command
  warns and `npm run lint:slop` fails the film.
- **Nothing over key words.** No swell, hit or whoosh on top of a number, a name or the offer. Put
  them in the pauses.
- **Listen.** "AI voice cadence" is a slop tell: flat pitch, missing pauses, even stress, misread
  names. A person listens to the whole track with the captions off before anything ships. The
  numbers in `meta.json` say where to listen; they cannot hear.

## Using it in the film

The voice starts at film time 0 (silence until `NARRATION.at`), so play it at the top level:

```tsx
import {Audio} from '@remotion/media';
import {staticFile} from 'remotion';
import {Captions} from '../../engine/Captions';
import {toFrame, wordAt} from '../../engine/narration';
import narration from './data/narration.json';

const stops = toFrame(wordAt(narration.words, 'stops').start, 30); // the frame "stops" begins

<Audio src={staticFile('films/<id>/narration/narration.wav')} />
<Captions cues={narration.cues} /> // burned-in captions, optional
```

Time the picture from the words, not the other way round (`src/films/neap/moments.ts`): re-voicing
the script then moves the picture with it, and `wordAt` throws at render time if an edit removed a
word the picture keys on. Burn captions in when the film will play muted or the brief asks for it;
otherwise the `.srt` and `.vtt` beside the master are enough.

## The bed under the voice

A narrated film's `score.mjs` ducks its finished mix under the spoken phrases:

```js
import {duckUnderSpeech, narrationWords} from '../../../audio/voice.mjs';
duckUnderSpeech(master, narrationWords(new URL('./data/narration.json', import.meta.url)));
```

The template's `score.mjs` already does this, so every new film does it as soon as it has a
narration, and does nothing without one. The duck is 10 dB by default, computed sample by sample from
the word timings: down 80 ms before the first word of a phrase, back up over 0.6 s after it. Gaps
under 0.35 s stay ducked, so the bed does not pump between words. `npm run render` warns when
`score.wav` is older than the narration.

## Master and release

`npm run master -- <id>` writes the disclosure into the master's comment tag and puts the captions
beside it as `out/<id>/<id>.srt` and `.vtt`. The release gate's `narration` step then checks that:

- everything narrate writes is there and was voiced from `narration.txt` as it is now;
- the film plays `narration.wav`;
- the master carries the disclosure and its captions sit beside it;
- the voice leads the bed by at least 10 dB under speech, measured on the two stems. A `volume`
  prop on either `<Audio>` is not seen by this measurement.

No on-screen "AI-generated voice" credit is a note, not a failure, because the text the film is
posted with can carry it instead. A film with no narration passes this step as "no narration".

## Disclosure

Say that the voice is AI-generated wherever the film is published: a credit line on the end card
or in the post text. The files keep their machine-readable marks (`meta.json`, the WAV comment tag,
the VTT `NOTE`, the master's comment tag). This kit never clones a voice and never records anyone.

## How it works

1. The script is parsed into lines and pauses, and each written word gets its spoken form.
2. Kokoro-82M v1.0 (the timestamped ONNX export, pinned to one revision, fp32) speaks one line at a
   time through kokoro-js, offline. Before every load the model files are checked against sizes and
   a sha256 pinned in `tools/lib/narration/model.mjs`; downloads are switched off while it loads.
3. Word timings come from the model's own predicted duration for every phoneme (one frame is 600
   samples at 24 kHz). Phonemes are grouped into words and aligned to the script with a small
   dynamic programme that allows for short words run together. A long last phoneme holding a pause
   is cut where the audio goes quiet. If a line does not align, its words are spread over the line
   by their length and marked `proportional`: fine for captions, not for cutting picture to a word.
4. Each line is trimmed to its speech, faded over 5 ms at each end, and laid out with its pauses.
5. The voice is mastered the same way as the film (never plain two-pass `loudnorm`, which silently
   compresses): gain, an oversampled limiter only if the peaks need it, then a linear trim that must
   report "linear", measured through the kit's one ebur128 Summary reader.
6. Every run checks the word edges against the silences in the delivered file
   (`timing.anchor_check` in `meta.json`). Only edges next to a silence can be checked this way.

## What is not verified

- Nobody can hear a track by measuring it. Pace, pauses, loudness and timing are measured; whether a
  voice sounds natural, calm or like a machine is for a person to judge.
- Word boundaries inside a phrase, with no silence between the words, are the model's prediction
  and unchecked.
- The narration was run end to end on macOS (Apple Silicon) only. The stand-in engine the tests use
  runs everywhere CI runs; Kokoro itself was not run on Windows or Linux for this release.
- Voices other than `af_heart` and `bf_emma` were not tried, and only English is supported.
- Number formats beyond the table above are left to the voice.
