# The worked example: Hark, "Who's singing"

A 22 second film for a made-up app that names the birds singing at dawn. Read it before your first
film, and never edit it: copy what you want into your own film's folder instead.

Watch it: `examples/hark/hark.mp4`. Open it in Remotion Studio with `npm run studio` and pick
the `hark` composition.

## How it argues its claim

Hark turns sound into names, so the film is built from its own sound. `score.mjs` synthesises each
bird's song, mixes the soundtrack and, from the same audio, writes every bird's spectrogram and
pitch contour. The card in the film draws those: faint dots for what it hears, and a coloured pen
line through the dots once it names the bird. Every name lands on its beat, every bird flies out
of its own name, the robin's last nine notes become the nine strokes of the word "hark", and the
picture and the sound cannot drift because both come from `beatmap.ts`.

## Files

| File | What |
|---|---|
| `brief.md`, `facts.md`, `concept.md`, `treatment.md`, `expected.md` | the paper trail, in the order they were written |
| `beatmap.ts` | every frame number: sections, the six birds' timings, named moments |
| `birds.mjs` | synthesised birdsong: one function per species, tonal syllables with pitch contours |
| `score.mjs` | the soundtrack, plus the picture's data: `public/films/hark/score.wav`, `public/films/hark/spectra.bin`, `data/phrases.json` |
| `world.ts` | geometry, perches and the camera (one continuous shot, which follows the robin up at the end) |
| `Sky.tsx` | a watercolour dawn in world space, so the camera's tilt reveals higher sky |
| `Wood.tsx` | constructed trees, each built around the branch a bird lands on |
| `Bird.tsx` | six constructed birds: perched, singing and flying |
| `Card.tsx` | the app: the sweep and scroll of what it hears, names, lanes and the month of mornings |
| `Flock.tsx` | each bird's flight out of its name and its singing on the branch |
| `Mark.tsx`, `Wordmark.tsx` | the ending: the drawn song settling into the drawn wordmark |
| `Hark.tsx`, `film.ts` | the composition and its registration |
| `theme.ts` | colours and type (Newsreader and Commissioner, both OFL) |
| `tests/BirdSheet.tsx` | a test sheet of every bird in every pose |

The generated files (`public/films/hark/score.wav`, `public/films/hark/spectra.bin` and
`data/phrases.json`) ship with the kit so the example opens straight away in Studio. Running
`npm run score -- hark` rebuilds them identically.

## How it was made, briefly

Seven rounds of style frames and two independent reviews, each fixing something only the pictures
or a fresh viewer showed. The first card drew raw sound as a halftone, which read as a bar chart
rather than birdsong; it became faint dots plus a pen trace once a bird is named. The camera lost
the robin on its way up, so it now follows the bird. The drawn song read as scribble when it was cut
into the word by length, so the robin sings exactly nine notes and each note becomes one stroke.
The first master sat at -5.4 dBTP true peak because birdsong is all high frequencies, which the
loudness meter weights up; two rare, deep low notes with a 110 to 165 Hz layer fixed it musically
instead of with compression. Then a cold explain-back and a five-lens critic changed the names,
the framing, the woodpigeon's song (five notes, not three), the diary's pace and its line, and
the garden's drawing. The reviews and what changed because of each are in
`examples/hark/reviews.md`.
