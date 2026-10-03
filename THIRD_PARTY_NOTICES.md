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
kit pins 4.0.532.

## Packages installed by `npm ci`

| Package | Licence |
|---|---|
| remotion, @remotion/cli, @remotion/bundler, @remotion/renderer, @remotion/media, @remotion/lottie | Remotion licence (see above) |
| @remotion/fonts, @remotion/paths, @remotion/noise, @remotion/three, @remotion/motion-blur, @remotion/layout-utils, @remotion/shapes | MIT |
| react, react-dom | MIT |
| three, @react-three/fiber | MIT |
| postprocessing | Zlib |
| lottie-web | MIT |
| typescript (development only) | Apache-2.0 |

The exact list and versions are in `package.json` and `package-lock.json`, which are the source of
truth if this table and they ever disagree. The optional connectors (`connectors/`) have their own
`package.json`; the MCP SDK they install is MIT.

The first render downloads Chrome Headless Shell from Google through Remotion. It is covered by
Chrome's own terms.

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

No third-party film frames, images, music or sound. The research in
`.agents/skills/cinematic-film/sources.md` links to public sources and quotes measurements and
short excerpts only.
