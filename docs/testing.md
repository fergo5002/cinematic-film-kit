# How the kit was tested

What was run before each release, on what, and what each result means. Everything here was
observed; anything not run is listed as not tested.

## Version 0.2

Run on a Mac with an Apple M5 chip (macOS 26, Node 24.21, Homebrew `ffmpeg-full` 9.0.2), from a
fresh clone of the release branch. Everything below was observed there.

- `npm ci`, `npx remotion browser ensure` and `npm run doctor`: every check passed, with
  `--gl=angle` on the Apple GPU (Metal). With Homebrew's plain `ffmpeg` the doctor fails on the
  missing `drawtext` filter and prints the `ffmpeg-full` fix; the README now says to install that.
- Remotion moved from 4.0.532 to 4.0.539. Its release notes for 4.0.533 to 4.0.539 list no change
  to the APIs the kit calls. One thing did change under the kit: Remotion now marks its own Chrome
  Headless Shell builds `157.0.8080.0-remotion-v3`, which the 0.1 doctor read as the wrong version
  and failed. The doctor now accepts that form, with a test.
- `npm test`: every tool test and all 145 connector tests pass. The narration tests run the whole
  pipeline on a stand-in engine, so they need neither the model nor its packages and run in CI.
- `npm run narrate -- --setup` installed the narration packages and downloaded the model, whose
  size and sha256 matched the pins. `npm run narrate -- neap` voiced the example with Kokoro-82M
  (`af_heart`): word timings from the engine on every line, the word edges a median of about 20 ms
  from the silences in the delivered audio. Running it again gave the same timings.
- `npm run release -- hark`, `npm run release -- neap` and `npm run release -- template`: every
  step passed. Neap: 16 audit gates, the voice 15.5 dB over the bed under speech. Hark: 15 gates
  and the 1 warning it had on Windows. `npm run score` rebuilt Hark's and the template's files
  byte for byte the same as the ones committed from Windows.
- Continuous integration runs the tests on Ubuntu and macOS, and builds the Docker image, runs the
  doctor and renders frames of the template and of Neap in it.
- The release zip is built with `python tools/package-source.py` from the merged commit. The
  published zip's own checks (checksum, manifest, a fresh unzip set up and rendered) are recorded
  with the release, after it is published.
- A cold explain-back of Neap (`examples/neap/reviews.md`); its findings changed the film.

Not tested in 0.2: the Kokoro engine on Windows or Linux (only the stand-in engine runs there, in
CI), voices other than `af_heart` and `bf_emma`, any language but English, listening to the voice
or any score, and Windows by hand (only the tests in CI touch the changed tools there, and CI does
not run Windows).

## Version 0.1

### Machines

- A 2023 Windows 11 laptop with integrated graphics (Intel Iris Xe), Node 24.16, ffmpeg 8.1.
- A clean Linux container (`docker/Dockerfile`, Debian bookworm, Node 22.23.3), built from the
  released zip alone, with no GPU (software WebGL). Its first run found two faults that the build
  machine could not (a test that assumed git was installed, and a template that never held still
  once rendered at full quality); both were fixed before this release.

### Automated tests

- `npm test` (tools): 40 of 40 pass. Among them: the slop lint fires every rule on a planted
  fixture and none on a clean one, with near-miss cases; the audit finds hard cuts within one frame
  and reads loudness within 0.5 LU on a synthetic film; a film that ends on a held frame is scored
  correctly; loudness is read from ffmpeg's summary, never a running value; `new-film` creates a
  film that typechecks.
- `npm test` inside `connectors/`: 145 of 145 pass, with no network and no keys, including the MCP
  server over stdio through the official client (137 of 137 when its optional packages are not
  installed, with the MCP tests skipping themselves).
- The build's own gate tests: 17 of 17 pass.

### Independent code reviews

Two reviews by a separate agent that had not written the code. The first, of the original tools,
found a loudness parser reading a running value instead of ffmpeg's summary and slop-lint rules
that could be bypassed. The second, of the whole kit before release, found three faults in the
paid connectors (a parameter that could raise the price past the budget, a cancelled request
booked at zero, and a prompt file that could carry the keys) and gaps in the build's gates. Every
finding was fixed with a test that failed before the fix and passes after.

### Films, end to end

- `npm run release -- template` passes every step on Windows: 16 audit gates, no warnings.
- `npm run release -- hark` passed every step on Windows: 528 frames rendered in 72 s, audit 15
  passed, 1 warning, 0 failed (see `examples/hark/reviews.md`).
- `npm run score -- hark` gives byte-identical files on repeated runs.

### The zip

`node build/build.mjs` (in the source repository, not shipped) stages the kit, runs every gate
(private names, absolute paths, colours, secrets, dashes, links, the size of `AGENTS.md`, skill
frontmatter, banned files, total size, render-code determinism), runs the tests in the staged
copy, zips it deterministically, builds a second time from scratch and compares the checksums,
then unzips the result and runs the gates again on what actually ships.

### Not tested

- macOS, a Linux machine with a GPU, and arm64.
- `npm run studio` used by a person, beyond loading its configuration.
- The doctor's `--fix` installs.
- Node 22.18 exactly (22.23 and 24.16 were used).
- The connectors against any live provider (see `connectors/README.md`).
- An agent making a film from this folder alone, from a brief, with nobody to answer its
  questions.
- Nobody has listened to the scores on speakers; they were checked as measurements and
  spectrograms.
