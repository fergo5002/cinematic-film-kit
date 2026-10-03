# Sound design: score, foley, sonic logo and mix, made in code and checked by numbers

Sound is half the film, and you cannot hear it. So every decision here comes with a measurement
you can run. Evidence: the public sources in [sources.md](../sources.md) under "Sound design",
and a test bench used for the research (a Node script that rendered the recipes below in under a
second, and an analysis script that measured band balance, centroid and RT60; neither ships with
this kit). Nobody has listened to these sounds yet: the numbers say what they measurably are, not
that they are good. The DSP primitives (reverb, filters, saturation, mastering detail) are in
`dsp-cookbook.md`; the kit's own DSP is `audio/dsp.mjs`.

## 1. What makes film sound expensive

A system, not a track:

1. **One motif with a reason.** Mastercard, Intel and YouTube all take the melody or rhythm from the
   brand (the syllables of "Intel Inside", the two syllables of "YouTube"). A three-syllable brand
   name maps onto a three-note cell with a long last note.
2. **Real-world sound as musical material.** Netflix's "ta-dum" is a wedding ring knocking on a
   cabinet; Nils Frahm kept the creak of the piano's hammers. A brand's own physical world is its
   sound palette (for a bakery: the oven door, the crust cracking as it cools, the bench, the bell
   over the shop door).
3. **Restraint and space.** Few voices, wide voicings, one colour tone. The two famous logos with
   documented harmony use a wide major chord (Mac) and a major 7th pad (YouTube).
4. **Hits on few cuts.** Three to five sync points (the reveal, the logo, one physical moment); let
   everything else breathe across the beat. Cutting every shot on the beat makes a music video.
5. **Unrepeatable.** Stock is interchangeable by design. A score generated from a seed per film (THX's
   Deep Note is 355 lines of C) is the opposite, and it is free.
6. **Silence at the end.** Apple's launch films end on 5 to 11s of it.

Lean right-brain (Orlando Wood): melody beats a rhythmic bed. Avoid the stock tells: uplifting
piano-and-strings swell, four-on-the-floor build, a riser into the logo, a whoosh on every transition.

## 2. The sonic logo

- **Length**: 1.6 to 3s (Mastercard's acceptance burst 1.6s and ad mnemonic 3s; Intel 3s; YouTube 3s;
  Joel Beckerman: the best are "usually no more than two seconds", cut down from a 45s to 3min anthem).
- **Build it from your own synthesis or recordings only.** CC0 material gives no exclusivity, Pixabay
  audio may not be part of a trademark, and the Mac chime and Deep Note are registered marks.
- **Deep Note method**: a seeded cloud of voices gliding from random pitches into a chord, over a low-pass
  that opens. An example structure (unrendered): 0 to 0.15s a physical tap from the brand's world, such
  as wood on wood (modal, Q about 30); 0.15 to 1.2s a rising hiss with 12 to 20 sine voices gliding into
  a three-note chord; 1.2 to 2.8s the brand name's three-note cell on a glass-like modal voice (Q 400 to
  900), resolving to a wide voicing with an added 9th, the hiss decaying under it. Plus a 1s variant
  for app confirmations.

## 3. Tempo that locks to the frame grid

Frames per beat = fps × 60 / BPM. Whole-frame beats only at:
- **24 fps**: 60 (24 frames), 72 (20), 80 (18), 90 (16), 96 (15), 120 (12), 144 (10) BPM
- **25 fps**: 60 (25), 75 (20), 100 (15), 125 (12), 150 (10)
- **30 fps**: 60 (30), 72 (25), 75 (24), 90 (20), 100 (18), 120 (15), 150 (12)

Pick one of these so hit points never drift by a sub-frame. Cut times are quantised to frames (41.7 ms
at 24 fps), which is the same order as the whole sync tolerance.

## 4. Physical models that matter

| Family | Use | Key parameters |
|---|---|---|
| Extended Karplus-Strong | plucks, strings | pick-direction low-pass, pick-position comb, damping filter, tuning all-pass (Jaffe and Smith via J.O. Smith) |
| Modal synthesis | wood, glass, metal knocks and chimes | sum of decaying sines; **material is set by decay, not pitch**: q = π f t_e; wood q about 15 to 130, glass and steel 190 to 5,000 (Avanzini and Rocchesso). Free-free bar mode ratios 1 : 2.757 : 5.404 : 8.933 |
| Contact spectrum | how hard or soft the strike | a half-sine contact of T seconds puts the first spectral zero at 1.5/T: a 1.5 ms knuckle is dull (zero at 1 kHz), a 0.2 ms metal tap bright (7.5 kHz) |
| Minnaert bubbles | water, drips, pours | f0 × r0 ≈ 3 m/s; damping β0 = π f0 δ; rising chirp f(t) = f0 (1 + 0.1 β0 t); hot water makes bigger, more numerous bubbles (lower) |
| Filtered-noise process models (Farnell, *Designing Sound*) | fire, steam, creaks, footsteps | stick-slip friction into a wood band-pass bank (62.5 to 790 Hz); fire as hiss + 30 Hz lapping + Poisson crackle |
| FM bells | chimes | inharmonic carrier:modulator such as 1:1.4 or 1:3.5 with a decaying index |

Building blocks to add to any score generator: a seeded PRNG, a per-sample-modulatable state-variable
filter (no clicks on sweeps), a Poisson event scheduler (`t += -ln(1 - r) / rate`), and a smooth random
control source. The research bench had all four; check which `audio/dsp.mjs` already has before adding.

## 5. Recipes: heat, water, wood and small rooms (measured starting points)

- **Water on hot stone** (a burst of steam), four layers: (1) splash, 30 ms noise band-passed at 2.5 kHz, Q 0.8, 6 ms
  decay; (2) crackle (the Leidenfrost "beats"), Poisson grains at `900 e^(-t/0.4) + 60 e^(-t/2)` per
  second, each 0.5 to 3 ms of noise in a half-sine window band-passed at random 2 to 7 kHz, Q 2 to 4,
  heavy-tailed amplitude, panned ±0.8; (3) steam hiss, white noise band-passed with a rising centre
  `1800 + 3400 (1 - e^(-t/0.35))` Hz, Q 0.9, attack 0.12s, hold to 0.45s, decay 1.1s, 3 Hz ±25%
  wobble, independent noise per channel; (4) body, noise low-passed at 140 Hz, about 14 dB under the
  hiss. Measured: 80% of energy above 2 kHz, centroid 6.1 kHz, 200 to 500 Hz nearly empty. If it reads
  thin or harsh, raise the body and lower the hiss Q.
- **Knuckle on a spruce bench**: modal, f1 180 Hz, Q 22, contact 1.5 ms (centroid 783 Hz).
- **A ladle tapping a wooden bucket rim**: f1 420 Hz, Q 30, contact 0.35 ms.
- **Glass-like ping**: 1,250 Hz, Q 900, ratios 1, 2.32, 4.25, 6.63.
- **Drip into still water**: a 1.2 ms noise tick high-passed at 1.5 kHz, one bubble r0 1 to 3.5 mm,
  sometimes a satellite bubble 12 to 22 ms later.
- **Bench creak**: stick-slip at `10 + 300 × force²` Hz with ±7.5% jitter into Farnell's door bank,
  high-passed at 60 Hz (centroid 1.18 kHz).
- **Wood-burning stove fire**: Farnell's model is all air and sub (centroid 10.3 kHz) with hollow mids;
  add a low-mid roar (noise band-passed 150 to 400 Hz, slowly modulated).
- **UI tap** (80 ms): 0.4 ms noise transient high-passed at 3 kHz, modes at 2.3 and 3.45 kHz, a 190 Hz
  body about 10 dB down. On a phone the body vanishes and the modes carry it, by design.
- **Payment confirmation** (about 0.8s): two notes a perfect fourth apart (E6 then A6, 90 ms later),
  partials 1, 2, 3 at 1, 0.22, 0.06, glass Q 500, a 3 ms attack and a 6 ms tactile tick; 99% of the
  energy in 500 Hz to 2 kHz, so it survives phone speakers. Keep it under 1.6s.
- **Lake at dawn**: no reverb tail. Direct sound, a water-surface reflection a few ms later, one or two
  far-shore reflections (delay = 2 × distance / 343 s; 100 m is 0.58s) 20 to 30 dB down and low-passed
  at 2 to 4 kHz; large bubbles lapping at 0.3 to 1.5 per second.
- **Avoid**: singing bowls (a wellness cliché), wind chimes, generic "spa" pads.

## 6. Space: a small wooden room

- **Algorithmic** (FDN, for music and pads): per-line gain `g = 10^(-3 M T / T60)`; damp highs more
  than lows with a one-pole in each line; Householder or Hadamard mixing.
- **Convolution** (for diegetic sound in a real space): ffmpeg `afir` with a synthesised impulse response.
  **Set `gtype=none:irnorm=-1`**: the defaults rescaled a test IR to -48.7 dBFS, so wet levels are
  meaningless otherwise. `afir` outputs wet only; mix dry and wet with `asplit` and `amix`.
- **What reads as "small wooden box"**: a dense cluster of early reflections only 2 to 3 ms behind the
  direct sound, and a short, mid-heavy decay of 0.2 to 0.35s with people in it (up to about 0.6s
  empty; longer reads as a hall). Hot air (85°C) raises the speed of sound to 379 m/s, which moves a
  small room's axial modes up about 10% (to 86 to 95 Hz in the room modelled). Critical distance is
  about 0.3 m, so close sounds (a breath, a tool in hand) are drier than a knock across the room.
- If you synthesise a small-room IR, check its low end separately. The one built for this research
  matched its Sabine targets from 500 Hz to 8 kHz, but its 125 Hz behaviour stayed unexplained after
  two failed explanations. Trust such an IR from 250 Hz up; add low resonances explicitly and check
  them on a spectrogram.
- Real rooms (Traer and McDermott, 271 spaces): exponential tails, longest between 200 Hz and 2 kHz;
  unnatural reverb stops sounding like a room and is mistaken for a source.

## 7. Mixing and mastering by numbers

**Targets**: web brand film -16 LUFS integrated (Apple measures -15 to -16.3), true peak ≤ -1.5 dBTP on
the WAV and ≤ -1.0 on the encoded file; social-first -14; broadcast EBU R128 s1 -23 LUFS, max short-term
-18, -1 dBTP. YouTube turns loud masters down to about -14 and never raises quiet ones.

**Three ffmpeg defaults that ship broken audio** (all observed):
1. `loudnorm` with `linear=true` silently goes dynamic when the gain would breach the ceiling (LRA 21.5 to
   14.6 in one test, 7.5 to 2.1 in another), and outputs 192 kHz unless you resample. Use
   `npm run master -- <id>`: gain, a 4x-oversampled limiter, iterate to target, a final trim that must
   report `linear`.
2. `afir` rescales impulse responses by default (`gtype=none:irnorm=-1` to stop it).
3. `alimiter` misses inter-sample peaks unless oversampled: `aresample=192000,alimiter=limit=<linear>:level=0,aresample=48000`
   (its `limit` is linear, and `level` defaults to auto make-up gain).

**QC checklist** (run in order, on the delivered file):
1. Loudness: `ebur128=peak=true`; read I, LRA and Peak from the Summary (grep enough lines to catch the
   true-peak line).
2. Balance: band shares against a slope of about -5 dB per octave from 100 Hz to 4 kHz (772 commercial
   recordings). Flag 200 to 500 Hz more than about 4 dB above the line (mud), 2 to 5 kHz more than about
   3 dB above (harsh), 10 to 16 kHz more than about 10 dB below (no air). Heuristics.
3. Mono: fold down (`pan=mono|c0=0.5*c0+0.5*c1`); about -3 LU is mono-safe, about -6 LU wide but fine,
   beyond that something cancels.
4. Phone: `highpass=f=800:p=2,highpass=f=300:p=2,lowpass=f=15000`, then the band analysis. **LUFS barely
   moves on a phone; band shares show what vanishes.** Every story-critical sound must keep its identity
   between 500 Hz and 2 kHz; the low end is decoration.
5. Sync: `scdet=t=10` for cuts and `silencedetect=n=-50dB:d=0.05` for onsets; pair each designed hit with
   its cut; keep audio within one frame early to one frame late (detectability is +45 ms early, -125 ms
   late). A planted 40 ms error came back as exactly 40 ms.
6. Ending: confirm the closing silence with `silencedetect`.
7. Eyes: `showspectrumpic=s=1200x500:legend=1:fscale=log:start=20:stop=20000:drange=100` for the mix and
   each stem, then read the image. Any narrow steady line or beating band you did not design is a bug.

**Mix levels**: with voiceover, duck music 6 to 12 dB under speech (`sidechaincompress`, attack 30 to 80
ms, release 250 to 700 ms). With no voiceover, let diegetic sound and score trade places; never run them
at equal level.

## 8. Tools

Best quality per hour: plain Node for synthesis (nine of the recipes above rendered in 0.73s), ffmpeg
8.1.2 for convolution, dynamics, loudness, spectrograms and sync checks. The research also used Python
with numpy and scipy for band analysis; the kit does not need Python, and the spectrogram check in
section 7 works with ffmpeg alone. Upgrade path for physical models: `@grame/faustwasm` (LGPL, renders
Faust to WAV from Node; untested here). Not used: SuperCollider, Pure Data, Csound, sox. Keep
essentia.js (AGPL) out of shipped code.

**No open music model fits a commercial film on a laptop CPU**: MusicGen and MMAudio weights are
non-commercial; Stable Audio Open Small is usable under $1M revenue but SFX-oriented and capped at 11s;
ACE-Step is MIT but GPU-first. Composition in code is the realistic free path.

## 9. Sources and licences for samples

Order of preference: (1) your own code-made or recorded sound (fully owned); (2) Freesound CC0; (3)
Sonniss GDC bundles (royalty-free, no attribution, no redistribution, **no AI training**); (4) Freesound
CC BY with credits; (5) Pixabay or Mixkit effects for web delivery only (Pixabay: never in a logo;
Mixkit music: no TV or radio). Avoid BBC Sound Effects (RemArc: personal, educational, research only),
anything CC BY-NC, and FMA tracks under NC or ND (sync to picture is a derivative work). Keep a ledger
per file: URL, author, licence and version, date, where used.

## 10. Paid and AI audio (optional; follow the cost rules in `ai-generation.md`)

- **ElevenLabs Music**: every plan below Enterprise excludes "film, TV, radio, & Studio Games" (terms of
  26 May 2026). Get a written answer before using it for a brand film. Sound Effects v2: up to 30s, 48 kHz,
  seamless loops.
- **Safest for a brand film**: Adobe Firefly audio (licensed and public-domain training, claimed safe for
  national campaigns, broadly available since 20 Aug 2026) and Stable Audio 2.5 (licensed data, enterprise
  terms).
- **Suno v6** (9 Sep 2026): commercial on Pro and Premier, downloads capped (20 or 60 a month), label-tied;
  a poor fit for a signature film. **Udio** cannot export since its 2025 settlements.
- **Google Lyria 3 / 3.5**: up to 3 minutes, every track SynthID-watermarked; check indemnity.
- More than half of Deezer's daily uploads are AI music (July 2026), and it labels them. The practical AI
  tell is now the label a platform attaches, which a code-composed or human score avoids.
