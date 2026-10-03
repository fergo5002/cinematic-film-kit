# How the kit was tested

What was run before this release, on what, and what each result means. Everything here was
observed; anything not run is listed as not tested.

## Machines

- A 2023 Windows 11 laptop with integrated graphics (Intel Iris Xe), Node 24.16, ffmpeg 8.1.
- A clean Linux container (`docker/Dockerfile`, Debian bookworm, Node 22.23.3), built from the
  released zip alone, with no GPU (software WebGL). Its first run found two faults that the build
  machine could not (a test that assumed git was installed, and a template that never held still
  once rendered at full quality); both were fixed before this release.

## Automated tests

- `npm test` (tools): 40 of 40 pass. Among them: the slop lint fires every rule on a planted
  fixture and none on a clean one, with near-miss cases; the audit finds hard cuts within one frame
  and reads loudness within 0.5 LU on a synthetic film; a film that ends on a held frame is scored
  correctly; loudness is read from ffmpeg's summary, never a running value; `new-film` creates a
  film that typechecks.
- `npm test` inside `connectors/`: 145 of 145 pass, with no network and no keys, including the MCP
  server over stdio through the official client (137 of 137 when its optional packages are not
  installed, with the MCP tests skipping themselves).
- The build's own gate tests: 17 of 17 pass.

## Independent code reviews

Two reviews by a separate agent that had not written the code. The first, of the original tools,
found a loudness parser reading a running value instead of ffmpeg's summary and slop-lint rules
that could be bypassed. The second, of the whole kit before release, found three faults in the
paid connectors (a parameter that could raise the price past the budget, a cancelled request
booked at zero, and a prompt file that could carry the keys) and gaps in the build's gates. Every
finding was fixed with a test that failed before the fix and passes after.

## Films, end to end

- `npm run release -- template` passes every step on Windows: 16 audit gates, no warnings.
- `npm run release -- hark` passed every step on Windows: 528 frames rendered in 72 s, audit 15
  passed, 1 warning, 0 failed (see `examples/hark/reviews.md`).
- `npm run score -- hark` gives byte-identical files on repeated runs.

## The zip

`node build/build.mjs` (in the source repository, not shipped) stages the kit, runs every gate
(private names, absolute paths, colours, secrets, dashes, links, the size of `AGENTS.md`, skill
frontmatter, banned files, total size, render-code determinism), runs the tests in the staged
copy, zips it deterministically, builds a second time from scratch and compares the checksums,
then unzips the result and runs the gates again on what actually ships.

## Not tested

- macOS, a Linux machine with a GPU, and arm64.
- `npm run studio` used by a person, beyond loading its configuration.
- The doctor's `--fix` installs.
- Node 22.18 exactly (22.23 and 24.16 were used).
- The connectors against any live provider (see `connectors/README.md`).
- An agent making a film from this folder alone, from a brief, with nobody to answer its
  questions.
- Nobody has listened to the scores on speakers; they were checked as measurements and
  spectrograms.
