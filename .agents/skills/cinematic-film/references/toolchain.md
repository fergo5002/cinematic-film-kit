# Toolchain: engines, formats, finishing and delivery (verified October 2026)

Every fact here was checked on 1 October 2026 against docs, release notes or renders measured on a
2023 laptop with integrated graphics (Intel i7-13700H, Iris Xe, no discrete GPU, Windows 11). The
public sources are in [sources.md](../sources.md), under "Engines, finishing and delivery" and
"Procedural graphics". Re-check versions before relying on them; Remotion ships almost daily.

## 1. Engines

| Engine | Status | Verdict |
|---|---|---|
| **Remotion 4.0.532** (React, headless Chrome + ffmpeg) | releasing daily; 5.0 documented, not published | **primary**. Free licence covers organisations of up to 3 people (under 5.0 terms contractors count; check your own case on remotion.dev). Agent skills (`npx remotion skills add`), Claude Code plugin; the Remotion MCP is deprecated |
| **HyperFrames** (HeyGen, plain HTML + GSAP, Apache-2.0) | open-sourced April 2026, v0.8.104 on 1 Oct, about 55k stars, Claude Code plugin with 21 skills | credible second engine for plain-HTML scenes; 0.x, expect churn; check its colour tags with ffprobe before trusting it |
| Revideo | alive, small, moved to `midrender/revideo` | niche, no advantage here |
| Motion Canvas | no stable release since December 2024 | do not start new work on it |
| Theatre.js | untouched since August 2024 | dormant, avoid |
| editly | stale | quick slideshows only |
| Blender 5.2 LTS | current | the free route to real GI, glass, caustics and HDR masters. **Cycles is CPU-only on Intel Iris Xe** (oneAPI needs Arc); EEVEE headless is unsupported on headless Windows; `bpy` 5.2.2 needs Python 3.13 exactly. Not a kit prerequisite |
| After Effects + nexrender | paid | outside the free stack |
| DaVinci Resolve 21.1 | free edition lost Python scripting | manual grading only |

## 2. Remotion: what is current

- **`@remotion/gsap`** (since 4.0.517, 25 Aug 2026): `useGsapTimeline(build)` returns a scope ref; the
  timeline is paused and seeked from the frame; it **throws** on `play()`, callbacks (`onUpdate`,
  `onComplete`, `call()`), tweens on plain objects, unseeded randomness and free-standing `gsap.to()`.
  Use it instead of hand-seeking. GSAP 3.13+ is free including SplitText, MorphSVG, DrawSVG.
- **Effects system** (since 4.0.465): about 80 GPU effects via an `effects={[...]}` prop on `<Solid>`,
  `<HtmlInCanvas>`, `<Video>`, `<Img>`, `<CanvasImage>`, `<AnimatedImage>`, `<Gif>`, `<RemotionRiveCanvas>`
  and `@remotion/shapes`: `noise` (film grain, **static unless `seed` follows the frame**), `glow`,
  `chromaticAberration`, `lightLeak`, `vignette`, `blur`, progressive and radial blur, `duotone`,
  `colorCorrection` (exposure, contrast, temperature, tint, saturation), `levels`, `whiteBalance`, `lut`
  (inline `.cube`), `halftone`, `scanlines`, `starburst`. Applied in array order. WebGL effects need
  `--gl=angle`. Custom effects via `createEffect()`.
- **`<HtmlInCanvas>`** wraps DOM for effects. Experimental Chrome API; cannot be nested; preview needs
  Chrome 149+ with a flag, rendering works with Remotion's own Chrome. The API changed on 30 Sep 2026:
  pin the Remotion version per film.
- **Media**: use `@remotion/media` `<Video>` and `<Audio>` (stable, frame-perfect). **`Video` and `Audio`
  imported from `'remotion'` are deprecated aliases of the old HTML5 tags.** This trap is silent.
- **Motion blur**: `<HtmlInCanvasMotionBlur>` (4.0.529, `samples` 8, `shutterAngle` 180) is the
  recommended way for DOM; `<CameraMotionBlur>` still works (destructive to colours). Both need
  `useCurrentFrame()` called inside a child. For shaders and 3D, accumulate sub-frame samples yourself.
- **Three.js**: `<ThreeCanvas>` (explicit width and height; animate from `useCurrentFrame()`, never
  `useFrame` deltas, which are wall-clock; `<Sequence>` inside needs `layout="none"`).
  `<ThreeWebGPUCanvas>` exists (experimental). Under rendering the frameloop is `never` and Remotion
  calls `advance()` per frame.
- **`@react-three/postprocessing`'s `<EffectComposer>` renders an EMPTY frame under `<ThreeCanvas>`**
  (observed 1 Oct 2026: R3F 9.8.1, postprocessing 6.39.5, three 0.186.1; any single effect blanks the
  frame, the bare scene renders). Drive `postprocessing`'s `EffectComposer` yourself, sized from the
  video config, with tone mapping as the last effect: the kit's `src/engine/three/Post.tsx` does this.
- **Rendering API**: `renderMedia({outputLocation})` but `renderStill({output})`. A wrong key is silently
  ignored and the film renders into memory and vanishes (observed).
- **Other 2026 packages**: `@remotion/captions`, `@remotion/whisper-webgpu`, `@remotion/video-matting`,
  `@remotion/sfx`, `@remotion/lottie`, `@remotion/rive` (Rive takes effects), `@remotion/noise`,
  `@remotion/paths`, `@remotion/transitions`, `@remotion/layout-utils`, `@remotion/fonts`.
- **First render downloads Chrome Headless Shell** (about 113 MB) into the project.

## 3. Rendering, measured on a 2023 laptop with integrated graphics

The measurements below come from one machine (Intel Iris Xe, no discrete GPU, Windows 11). The GPU
backend is the setting that matters most, and it differs by machine: `npm run doctor` tries the
backends, picks the `--gl` value that works on yours and writes it to `film.local.json` (the
`FILM_GL` environment variable overrides it). `npm run preview` and `npm run render` use it.

- **On the measured laptop, `--gl=angle` was the right backend** (or `chromiumOptions: {gl: 'angle'}`
  for API renders). The default silently ran WebGL on the CPU: a heavy raymarched 1080p frame took
  5.7 to 7.9s against 0.1 to 0.26s per sample with `angle`. `vulkan` was as fast; `egl`, `angle-egl`
  and `swiftshader` landed on Microsoft WARP at 21 to 38s (observed). Not measured on macOS or Linux,
  which is why the doctor tests rather than assumes.
- **Measured**: a 16 s test film (type, a full-frame fbm shader, a PBR knot, grain overlay) at
  1080p30 rendered at **172 to 199 ms per frame** with concurrency 2. Stills cost 0.9 to 2.6s each
  including setup. A heavy raymarch costs about 0.2s per sample per frame and scales linearly with samples.
- **Windows resets the GPU if one draw runs past 2 seconds** (TDR). Split heavy shaders into strips of
  about 150 ms each whatever your OS, so the same film renders on Windows too.
- **WebGPU** failed in Remotion's headless shell on the measured Windows laptop: `requestDevice()`
  needed `dxil.dll` and `dxcompiler.dll`, which the shell lacks. Copying both from desktop Chrome
  made it work (observed). Not tested on macOS or Linux; WebGL2 is the safe default everywhere.
- **Determinism**: Remotion renders frames out of order in several tabs. Everything is a pure function
  of the frame. Stateful effects (fluid solvers, feedback buffers, particle integration) must be closed
  form, replayed from frame 0 with a fixed seed, or baked to an image sequence first.
- **Memory**: `angle` leaks on very long renders; split feature-length work. Run one heavy render at a
  time and bundle once per batch (Remotion's Node API: `bundle()` once, then `renderMedia()` per
  composition). On a loaded machine Chrome can fail to connect within Remotion's 25s limit; retry
  once, then lower concurrency.
- **Grain costs bitrate**: baked grain took a synthetic x264 encode from 372 kbps to 77 Mbps; the 16s
  test film with grain was 87 MB at CRF 18. Decide master grain and delivery grain separately.

## 4. Colour (where films silently go wrong)

- A browser render is 8-bit sRGB. **Remotion 4 defaults to the BT.601 matrix and an untagged file**: a
  BT.709 player turns pure green 255 into 215 and pushes reds toward orange. **Always render with
  `--color-space=bt709`**.
- Tags: with `--color-space=bt709` the 4.0.532 render here wrote all three tags (bt709 matrix,
  transfer, primaries). A researcher reproduced missing primaries and transfer with Remotion's bundled
  ffmpeg 7.1 arguments on 4.0.524. Check with
  `ffprobe -v error -select_streams v:0 -show_entries stream=color_space,color_transfer,color_primaries -of csv=p=0 file.mp4`;
  repair losslessly with `-c copy -bsf:v h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0`
  (`hevc_metadata` for HEVC). `npm run master -- <id>` does this and prints the tags.
- **JPEG frames plus BT.709** rendered darker before a fix merged on 18 Sep 2026; final renders use
  `--image-format=png` anyway (JPEG 80 also blocks gradients).
- **In shaders**: hex colours are sRGB, not linear. Convert with `srgbToLinear` before lighting, tone
  map (AgX for mood, Khronos PBR Neutral when brand colours must hold; ACES shifts hue and darkens),
  encode with the exact sRGB curve, triangular-dither as the very last operation.
- **HDR**: skip it. Remotion renders SDR; Apple's own product films ship SDR-only. Use Blender only if a
  shot genuinely needs HDR highlights.
- **LUTs**: in-render with the `lut()` effect, or in ffmpeg `lut3d=file=look.cube:interp=tetrahedral`,
  or `libplacebo` (it ran on the GPU of the measured laptop).

## 5. Codecs and delivery

| Deliverable | Spec |
|---|---|
| Master | PNG frames or ProRes 4444 from Remotion; or H.264 CRF 12 slow, BT.709, PNG frames |
| Web hero loop | `<video autoplay muted loop playsinline preload="metadata" poster=...>`; sources AV1 (`av01.0.08M.10`), then HEVC tagged `hvc1`, then H.264 High 1080p as the guaranteed fallback; **no audio track**; about 5 Mbps HEVC at 1080p (Apple's ladder: HEVC 1080p 5.07 Mbps average, 2160p 13.7; H.264 1080p 6.0); `prefers-reduced-motion` swaps to the poster |
| YouTube | MP4, faststart, H.264 High, closed GOP of half the frame rate, 1080p 8 Mbps / 2160p 35 to 45 Mbps SDR, AAC 48 kHz stereo 384 kbps, BT.709 tags |
| Reels, TikTok, Shorts | 1080x1920, 30fps; keep key text out of the top 14% and bottom 20% (secondary source); recompose, never crop; burn captions in |
| LinkedIn | 1920x1080 or 1080x1350 |
| Decks | H.264 High 1080p MP4, AAC, faststart; no AV1 or VP9 |
| Transparent overlay | VP9 alpha WebM for Chromium and Firefox (**Safari cannot play alpha WebM**); ProRes 4444 for editors; HEVC alpha could not be made on Windows (not tested on macOS) |
| Drafts | a hardware encoder for speed: on Intel, `hevc_qsv` or `h264_qsv` (Quick Sync worked on the measured Iris Xe; its AV1 hardware encode did not); on macOS `h264_videotoolbox` or `hevc_videotoolbox`; on Linux `h264_vaapi` or `hevc_vaapi`. Only the Intel route was tested here; check `ffmpeg -encoders` for what your build has |
| Final web encodes | software x265 10-bit or SVT-AV1 preset 4 to 6; AV1 film-grain synthesis (`-svtav1-params film-grain=8:film-grain-denoise=1`) adds grain at playback instead of baking it |

Browser support (caniuse, 1 Oct 2026): AV1 everywhere except Safari on devices without a hardware
decoder; HEVC solid only in Safari; so H.264 remains mandatory as the fallback.

## 6. Loudness and captions

- **Default master: -16 LUFS integrated, -1.5 dBTP** (Apple's launch films measure -15 to -16.3; YouTube
  turns loud uploads down and never quiet ones up). -14 LUFS for social-first cuts. Broadcast is EBU R128
  -23 LUFS ±0.5. ffmpeg's `loudnorm` defaults to -24, so always set `I` and `TP` explicitly.
- **The loudnorm trap** (observed): `linear=true` silently falls back to dynamic compression whenever the
  gain would push true peak past the ceiling. A score with LRA 7.5 LU came out at 2.1. Fix: gain plus a
  4x-oversampled limiter first, iterate until on target, then a tiny linear trim that must report
  `normalization_type: linear`. `npm run master -- <id>` does this and fails loudly otherwise.
- **Captions**: ffmpeg 8's `whisper` filter writes an SRT in one pass
  (`-af "whisper=model=ggml-small.en.bin:language=en:format=srt:destination=out.srt"`, run from the
  model's folder, because a Windows drive path such as `C:` needs escaping inside a filter string;
  macOS and Linux paths do not). It misheard a two-word brand name as one invented word: always fix
  brand names by hand. Remotion has `@remotion/captions` and a Studio "Generate captions" action.

## 7. Formats and sources inside Remotion

- **Lottie**: `@remotion/lottie` with `lottie-web` 5.13 (slow-moving); dotLottie web player is the active
  project. Route from After Effects is Bodymovin JSON. Verified rendering a hand-written Lottie.
- **Rive**: `<RemotionRiveCanvas src fit artboard animation>`, synced to Remotion time, takes effects.
  Verified rendering Rive's sample file.
- **SVG**: `@remotion/paths` (`evolvePath` for draw-on); verified.
- **Fonts**: `@remotion/fonts` `loadFont({family, url: staticFile(...), weight: '100 900'})` holds the
  render until the face is ready; verified with a variable woff2.
- **Real UI**: capture the live product (screenshots or a recording) and composite it; or render the
  product's own React components with fixture data when their code is available.

## 8. Licences for code you borrow

Build on MIT, Zlib, ISC, BSD, Apache, CC0 or Unlicense: three.js, pmndrs (`postprocessing`, drei, R3F),
three-gpu-pathtracer, webgl-noise, psrdnoise, simplex-noise, Rough.js, regl, twgl, OGL, n8ao, Mitsuba.
**Do not paste** Shadertoy code (default CC BY-NC-SA, no commercial use), Inigo Quilez's shaders (no
licence, plus a non-NFT clause), Lygia (Prosperity: non-commercial unless sponsored or licensed) or The
Book of Shaders (all rights reserved): learn the technique, write your own from the maths. Codrops
demos may be used commercially but not republished as-is. Blender output is yours. p5.js is LGPL.
Not legal advice.

## 9. Assets: where to get them legally, and the import traps

Evidence: licence texts and the Remotion and three source were read on 1 October 2026; the public
sources are in [sources.md](../sources.md) under "Software and AI launch films". Nothing here was
test-rendered unless it says so. Not legal advice.

**Rule zero: nothing borrowed carries the brand.** Stock motion, icons, models and LUTs are shared by
everyone; they can dress a scene but never become a logo, a sonic logo or the film's signature device.

| Source | Licence | Credit | Watch for |
|---|---|---|---|
| LottieFiles free | Lottie Simple License (Design Barn) | not required | share-alike wording on "display" of the files; keep the licence in the credits file |
| IconScout free | IconScout Simple License | not required | Digital licence caps video budgets at $10,000; no use in a logo |
| Lordicon free | CC BY-ND 4.0 with commercial use | required | PRO removes the credit |
| Rive Community and Marketplace | CC BY 4.0 | required | see the Rive traps below |
| Poly Haven, ambientCG, Kenney | CC0 | not required | Poly Haven's API wants a unique user agent (for example `my-film/1.0`) |
| Sketchfab | ten licence types | depends | take CC0 or CC BY only; never NC, ND (if modified) or Editorial |
| Fab Standard | commercial, any tool | not required | no standalone redistribution |
| colour-science, OpenColorIO, OCIO ACES configs | BSD-3-Clause | n/a | generate your own `.cube`; it is then your asset |
| three.js example LUTs, AgX repos | no licence stated | n/a | do not ship them |
| IWLTBAP LUTs, Holygrain grain (paid) | commercial use, no redistribution | n/a | never in a public repo or a web bundle |

**Import traps (read in source, 1 October 2026):**
- **Lottie frame rate.** `@remotion/lottie` advances one Lottie frame per composition frame with no
  conversion, so a 30 fps Lottie in a 24 fps film plays at 0.8x and ends late. Match the composition
  to `getLottieMetadata().fps`, or retime. Memoise `animationData` or it re-initialises every render.
- **Lottie fonts.** lottie-web waits at most 5 s for a text layer's font, then renders in whatever
  fallback headless Chromium has, silently. Load the face with `@remotion/fonts` first, or convert
  text layers to shapes before export. Bake After Effects expressions to keyframes.
- **dotLottie** is a zip: pass `a/<name>.json` to `<Lottie>` and serve `i/` through `assetsPath`;
  state machines (`s/`) and themes (`t/`) are ignored.
- **Rive in Remotion plays one timeline animation, never a state machine**, and fetches its WASM
  from unpkg at render time, so an offline render fails. Bake states into timelines in the Rive
  editor; vendor the WASM before a deadline render.
- **three r186**: `RGBELoader` is deprecated (use `HDRLoader`); an equirectangular texture on
  `scene.environment` is PMREM-filtered automatically; `GLTFLoader` tags colour textures sRGB itself,
  but hand-built materials need `SRGBColorSpace` on base colour and emissive maps only. Point Draco
  and KTX2 decoders at `staticFile()` paths so a render never fetches a decoder from a CDN.
  `<ThreeCanvas>` already holds each frame until Suspense resolves.
- **Music libraries are paid and per-person**: Soundstripe and Storyblocks individual plans license a
  person, not a company; Soundstripe's single-use Digital licence ($199) is the cleanest for one
  signature film; Splice covers sync but you never own the sounds; Epidemic Sound covers ads only on
  Pro or Enterprise. A score made in code (`sound-design.md`) needs none of this.
