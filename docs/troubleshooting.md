# Troubleshooting

Start with `npm run doctor`. It checks everything below and prints the fix. These are the
problems it cannot fix for you.

**A render or still fails with "WebGL2 unavailable" or a black frame.** The graphics backend is
wrong for this machine. Run `npm run doctor` again after `npm ci`; it tests each backend and
records the one that works in `film.local.json`. To force one: set `FILM_GL` to `angle`,
`swangle`, `angle-egl` or `vulkan`. `swangle` works everywhere, slowly, because it draws on the
processor.

**"Shader compile failed".** The message's first line is the compiler's own error with a line
number; the full numbered source is in the log above it. A uniform declared twice is the usual
cause.

**Fonts look wrong, or the render stops at "Failed to load font".** A film's theme points at a
file that is not in `public/fonts`. Fonts must be files in the folder with a licence that covers
video; a font loaded from the web will not be there at render time.

**The film is silent.** The score is generated, not stored: run `npm run score -- <id>` before
rendering. `npm run release -- <id>` does it for you.

**The audit fails loudness or true peak.** `npm run master -- <id>` sets loudness to -16 LUFS
without squashing the dynamics. If true peak then sits below -3 dBTP, the mix has no transients
reaching up (common with high, bright material such as birdsong): add a few rare low events
rather than compressing. If loudness range is under 6 LU, the score has no arc.

**Renders are slow.** Close other heavy programs, render a preview first
(`npm run preview -- <id>`), and keep shaders cheap. On a 2023 laptop with integrated graphics,
the 22 second example renders at full quality in about two minutes.

**Animation freezes when you look at it in Remotion Studio in a background tab.** Browsers stop
animation frames in hidden tabs. Bring the tab to the front before judging anything.

**Windows: "running scripts is disabled on this system".** PowerShell's script policy blocks
`npm`. Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use Command Prompt.

**Out of memory during a long render.** Lower the concurrency
(`npm run render -- <id> --concurrency=1`) or split the film into sections.
