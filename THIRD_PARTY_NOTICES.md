# Third-party notices

The kit's own code and writing are MIT licensed (`LICENSE`). It also bundles some third-party
files and installs third-party packages through npm. Each keeps its own licence, summarised here;
the licence texts ship inside each package in `node_modules` after `npm ci`, and beside each font.

## The one that matters for business use

**Remotion** (`remotion` and the `@remotion/*` packages it depends on for rendering) is not open
source in the usual sense. Its licence (`node_modules/remotion/LICENSE.md` after `npm ci`) makes it
free for individuals, for-profit organisations with up to three employees, non-profits, and for
evaluation; any other organisation needs a paid company licence from remotion.pro. Read the terms
before using the kit for paid work. The licence says it will change slightly in Remotion 5.0; the
kit pins 4.0.539.

## Packages installed by `npm ci`

| Package | Licence |
|---|---|
| remotion, @remotion/cli, @remotion/bundler, @remotion/renderer, @remotion/media, @remotion/lottie, and @remotion/sdk (installed with them) | Remotion licence (see above) |
| @remotion/fonts, @remotion/paths, @remotion/noise, @remotion/three, @remotion/motion-blur, @remotion/layout-utils, @remotion/shapes | MIT |
| react, react-dom | MIT |
| three, @react-three/fiber | MIT |
| postprocessing | Zlib |
| lottie-web | MIT |
| typescript (development only) | Apache-2.0 |

The exact list and versions are in `package.json` and `package-lock.json`, which are the source of
truth if this table and they ever disagree. The optional connectors (`connectors/`) have their own
`package.json`; the MCP SDK they install is MIT. The optional narration has its own too (below).

The first render downloads Chrome Headless Shell through Remotion (from Google, or Remotion's own
build of it on macOS arm64 and most Linux). It is covered by Chrome's own terms.

## Optional: narration

Nothing below is installed or downloaded unless you run `npm run narrate -- --setup`. It then
installs `narration/package.json` into `narration/node_modules` and downloads one model into
`.cache/narration/`, both inside the kit and left out of git and release zips.

| Part | Version | Licence |
|---|---|---|
| Kokoro-82M, the voice model (hexgrad/Kokoro-82M), as the timestamped ONNX export `onnx-community/Kokoro-82M-v1.0-ONNX-timestamped` | v1.0, revision `dd4401a9`, fp32 weights pinned by sha256 | Apache-2.0 (both model cards) |
| kokoro-js, including the voice files it ships | 1.2.1 | Apache-2.0 |
| @huggingface/transformers | 3.8.1 | Apache-2.0 |
| onnxruntime-node, onnxruntime-web | 1.21.0, 1.22.0-dev | MIT |
| phonemizer | 1.2.1 | declares Apache-2.0, and embeds eSpeak NG, which is GPL-3.0 |
| sharp (installed with transformers, not used by the kit) | 0.34.5 | Apache-2.0; its prebuilt libvips binaries are LGPL-3.0-or-later |
| the other packages they install | see `narration/package-lock.json` | MIT, ISC, BSD-3-Clause, Apache-2.0, BlueOak-1.0.0 |

Two of these carry copyleft terms. eSpeak NG (inside phonemizer) is GPL-3.0 and libvips (inside
sharp's binaries) is LGPL-3.0. The kit does not ship either: npm downloads them onto your machine
when you ask for narration. If you redistribute a folder that has them installed, read those
licences first. Audio the voice produces is output, not the program; that reading is the kit
author's, not legal advice.

The narration code in `tools/lib/narration/`, `narration/engine.mjs` and `audio/voice.mjs` is the
kit's own and MIT licensed. No voice is cloned and nobody is recorded.

## Bundled files

| File | Licence |
|---|---|
| `public/fonts/Newsreader.woff2`, `public/fonts/Newsreader-Italic.woff2` | SIL Open Font Licence 1.1 (`public/fonts/Newsreader-OFL.txt`), The Newsreader Project Authors |
| `public/fonts/Commissioner.woff2` | SIL Open Font Licence 1.1 (`public/fonts/Commissioner-OFL.txt`), The Commissioner Project Authors |
| `tools/fonts/` | SIL Open Font Licence 1.1, see the licence file beside the font |

The OFL allows these fonts in rendered video without credit. It does not allow selling the font
files on their own.

## Shader code in `src/engine/gl/glsl.ts`

Each snippet is attributed where it appears:

- "Hash without Sine", Dave Hoskins: MIT.
- AgX tone mapping, as published in three.js r186: MIT.
- Khronos PBR Neutral tone mapping: Apache-2.0.
- The ACES filmic fit (Krzysztof Narkowicz), exact sRGB transfer, triangular-PDF dither and
  interleaved gradient noise (Jorge Jimenez): published formulas, used as such.

## Things the kit does not include

No third-party film frames, images, music or sound. The example narration
(`public/films/neap/narration/`) was synthesised with Kokoro-82M by the kit and is labelled as an
AI-generated voice. The research in `.agents/skills/cinematic-film/sources.md` links to public
sources and quotes measurements and short excerpts only.
