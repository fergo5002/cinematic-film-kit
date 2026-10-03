# Procedural graphics: premium imagery drawn in code, free, on a local machine

How to make shaders, 3D and generative 2D look photographed or hand-made instead of computer-made,
render them deterministically in Remotion, and stay inside commercial licences. Evidence: the
public sources in [sources.md](../sources.md) under "Procedural graphics", plus a render probe and
renders measured on a 2023 laptop with integrated graphics. Rendering facts (the `--gl` backend, TDR
strips, WebGPU, colour) are in `toolchain.md` sections 3 and 4.

## 1. The ceiling is set by technique, not by paid tools

What separates premium from cheap is all free: the lighting rig, tone mapping, dithering and lens
finish. The core toolkit:

- **SDF raymarching** (Inigo Quilez's articles; learn from them, never paste his code): soft shadows
  with the inner-penumbra variant, smooth minimum to blend shapes, fbm and domain warping for organic
  form, the tetrahedron normal (4 map calls; keep the loop un-inlinable with a uniform zero, or ANGLE
  compiles take seconds and can crash).
- **Volumetrics** (Maxime Heckel's write-ups): constant-step march, Beer-Lambert absorption about
  0.9, a short nested light march (4 to 6 steps), Henyey-Greenstein phase (g 0.3 to 0.6 so steam
  glows when backlit), start offset jittered with blue or interleaved-gradient noise seeded by the
  frame, half resolution then upscale. Blue-noise jitter took one march from 250 to 50 steps.
- **Three.js r186 physical materials**: `MeshPhysicalMaterial` with clearcoat, sheen, transmission
  (thickness, attenuation colour), iridescence, dispersion, anisotropy for brushed metal. Data maps
  stay `NoColorSpace`; colour maps `SRGBColorSpace`.
- **Procedural lighting without HDR files**: three's `RoomEnvironment` through a PMREM generator, or
  emissive cards ("lightformers") rendered into an environment once. No downloaded HDRIs needed.
- **Post chain** (pmndrs `postprocessing`, driven by hand, see `toolchain.md`): HalfFloat buffers,
  renderer tone mapping off, bloom and depth of field in linear, tone map last (AgX for mood, Khronos
  PBR Neutral when brand colour must hold), then chromatic aberration, vignette, grain, triangular
  dither.

## 2. What makes code-drawn work look cheap, and the fix for each

| Tell | Fix |
|---|---|
| Banding in dark gradients (steam, fog, dusk) | HalfFloat buffers; triangular-PDF dither of ±1 LSB as the very last op (Gjøl); PNG frames, not JPEG 80; 10-bit HEVC or AV1 delivery |
| Aliasing, shimmering noise | supersample (2x is 4x the cost); anti-alias procedural edges with `fwidth` and `smoothstep` |
| Plastic speculars, uniform light | albedo near 0.2 and brightness from lights, not materials; one key with a coloured soft penumbra (warm, more saturated at the shadow edge), a sky fill and a bounce opposite the key; no AO on the key light (IQ's outdoor rig) |
| Hue-shifting highlights, crushed darks | AgX or Neutral; ACES darkens and shifts hue (oranges and brass drift) |
| Perfect noise | warp it, mix two or three frequencies, give every object its own seed |
| Perfect motion | ease everything; a slow handheld drift from two or three low-frequency noise channels on the camera; 180° shutter motion blur |
| Pure black and pure white | tone map, then a slight lift of blacks in the grade |
| Wide soft glow | a high bloom threshold so only HDR highlights bloom; few mip levels. A wide glow reads as fog and turns a dark brand ground muddy (measured: a dark green ground lifted towards olive beside a bright metallic object) |
| Grain identical frame to frame | seed grain from the frame; luminance-weighted so it lives in the midtones |
| Over-strong effects | heat shimmer of 1 to 3 px at 1080p; chromatic aberration of about 0.001 of the frame; anything stronger reads as a filter |

**The "shader hello world" is itself slop**: a noise-gradient blob with bloom, an orbit camera left
running, default chrome. Every procedural element must be motivated by the subject.

## 3. Rendering deterministically

- Every frame is a pure function of `useCurrentFrame()`. Remotion renders out of order in several tabs.
- Raw shaders: the kit's `src/engine/gl/ShaderCanvas.tsx` compiles once, draws in
  `useLayoutEffect`, and puts the compiler log on the error's first line (a bare "compile failed" cost
  a debugging round once). Uniforms passed as props are auto-declared unless the fragment declares them.
- Stateful simulations (fluids, feedback, particle integration, drops on glass) must be closed form in
  time, replayed from frame 0 with a fixed seed inside a memoised pure function, or baked to an image
  sequence first and played with `<OffthreadVideo>`.
- One sampling loop buys both anti-aliasing and motion blur: N samples, each with its own sub-pixel
  offset and shutter time `t = (frame + (shutterAngle / 360) * ((i + 0.5) / N - 0.5)) / fps`,
  accumulated in a float target, dithered once. Cost is linear in N (observed: 4 samples cost 3.1 to
  4.1x one).
- Budget from measurements (a 2023 laptop with integrated graphics, Intel Iris Xe): a heavy raymarched
  1080p frame costs about 0.2s per sample; a 10s 30fps shot at 8 samples is roughly 8 to 10 minutes of
  GPU time. A 16 s test film (type, an fbm steam shader, a PBR knot, grain) ran at 172 to 199 ms per
  frame with two tabs. Measure your own machine before budgeting a long film.

## 4. Recipes for a world of heat, stone, wood, water and light

Starting points built from cited techniques, for any subject with steam, heat, wood, stone or water
in it (a kitchen, a forge, a workshop, a coast). Every number is a guess to tune by eye against
reference.

- **Hero steam**: full-frame raymarch, 32 to 64 steps; density
  `max(fbm(warp(p * 1.5 + vec3(0, -t * 0.4, 0))) - 0.45, 0.0) * plumeMask * heightFade`; blue-noise
  jitter seeded by the frame; absorption near 0.9; 4 to 6 light steps toward the heat source; HG g
  0.3 to 0.6; half resolution. Warm from below (the heat source), cool from the window side; room
  haze far thinner than the plume. Too much density flattens the image (the probe's test frame proved it).
- **Background steam**: 6 to 20 camera-facing planes with a precomputed noise texture, remapped,
  edge-faded, twisted with height, scrolling slowly upward. Cheap, deterministic.
- **Heat shimmer**: post pass `uv += (noise(vec3(uv * vec2(6, 3), t * 1.5)) - 0.5) * strengthPx / res * mask`,
  mask a column above the heat source fading with height; 1 to 3 px.
- **Hot stones or coals**: smooth-min blended spheres or rounded boxes with 2 to 4% fbm displacement,
  dark albedo 0.04 to 0.08, rough dielectric; cracks from exact Voronoi border distance
  (`crack = 1 - smoothstep(0, width * (0.6 + 0.8 * noise), d)`), emission in HDR above 1 so only cracks
  bloom, breathing over 1 to 3s. Red only becomes "just visible" at about 525°C (the colour facts
  below), so for anything cooler keep any glow dull red at most, or it is stylisation.
- **Planks** (spruce, cedar, thermally modified aspen): per-plank seed; rings
  `fract(length(p.yz + 0.15 * fbm(p * vec3(0.3, 2, 2))) * ringFreq)`; fibres from noise stretched about
  40x along the plank; knots only for spruce; thermally modified aspen darker, even caramel; cedar
  red-brown with stronger rings; roughness 0.6 to 0.8 (untreated wood is matte); 5 to 10 mm rounded
  edges that catch a low warm backlight; dark gaps between boards.
- **A burst of steam (water hitting a hot surface)**: impact frame `f0`, `tau = (frame - f0) / fps`;
  plume radius `r0 + k * sqrt(tau)`, density `A * exp(-tau / 0.8)` added to the steam field and
  advected upward; droplets as closed-form ballistic arcs from seeded random; crack emission dips for
  half a second then recovers. All closed form, so any frame renders alone.
- **Lake or sea at dawn**: three's `Water` and `Sky` with sun elevation 0 to 3°, turbidity 8 to 10 for
  sea haze, PMREM-baked environment, AgX; replace the example's `waternormals.jpg` with procedural
  normals so no third-party asset ships. Still water in a pool or tank: refraction plus caustics by
  the area-ratio method on a slow noise-displaced surface, so the pattern drifts, never flickers.
- **First light on a coast**: sun -4° to +2°; Rayleigh and Mie (Mie raised for sea-salt haze), ozone on
  for the violet band; a low cloud deck lit from below; headlands as 3 to 5 silhouette layers with
  rising aerial perspective; cool shadows against a warm horizon.
- **Firelight**: `I(t) = I0 * (1 + 0.15 n(3t) + 0.07 n(11t) + 0.03 n(23t))` with `@remotion/noise`,
  1,850 to 2,000 K, light position jitter of a few centimetres so shadows breathe.
- **Condensation on glass**: a frosted layer (blurred background modulated by fbm) with sharp refracted
  background through drops; drops replayed from frame 0 with a fixed seed; wipe streaks reveal the view.
- **Thermal false colour** (an instrument view; a declared style that suits heat): map a scalar heat
  field through a brand-built ramp (for example the brand's darkest colour for cold, its accent for
  warm and its lightest for hottest), never the stock inferno ramp with its purple.
- **People**: silhouettes against bright steam or a window, rim light only; a figure's shadow cast on
  the wood; hands as shapes; wet footprints, a towel on a rail, steam that parts around an unseen
  body. Never a lit, frontal CG face. Apple's 2003 iPod silhouettes are the precedent.

Reference colour facts: heated steel is "just visible" red at 525°C, dull red 699°C, cherry 800 to
900°C; candle and sunrise about 1,850 K, incandescent 2,400 K, horizon daylight 5,000 K.

## 5. 2D that looks hand-made

Hand-made is controlled imperfection at several scales, all seedable:
- **Flow fields** (Tyler Hobbs): grid about 0.5% of image width, grid 50% larger than the canvas,
  noise scaled about 0.005 to angles, step 0.1 to 0.5% of width, collision-checked spacing; quantised
  angles for rocky forms.
- **Watercolour** (Hobbs): recursive Gaussian-jittered midpoint deformation, 30 to 100 layers at about
  4% opacity, textured masks per layer, interleaved colours.
- **Rough.js** (MIT): `roughness` 1, `bowing` 1, hachure fills, and a `seed` for exact re-generation.
  Boil a line by changing the seed every 2 or 3 frames (on twos, like cel animation).
- **Paper and grain**: SVG `feTurbulence` with a seed; push contrast for "grainy gradients".
- **Halftone**: CMYK screens at 15°, 75°, 0°, 45°; dot radius `max * sqrt(coverage)`; `fwidth`
  anti-aliasing; alternate rows offset half a cell.
- **Painterly**: Kuwahara filter (radius about 6; 8-sector generalised; anisotropic from a structure tensor).
- **Riso look**: 2 to 3 spot colours, a few pixels of per-layer misregistration, grain inside each layer.

Caution from the slop research: faking hand-made texture with a paper shader is the 2026 version of
the grain overlay. Use these when the idea is about hand and craft, not to borrow its look.

## 6. When to leave the browser

Only for what WebGL cannot fake: true global illumination, caustics through glass, liquids with
correct refraction, dense multiple scattering. Blender Cycles on CPU is the practical choice (an
i7-13700H laptop CPU scores about 186 samples per minute on Blender Open Data); expect many seconds to minutes per
denoised 1080p frame, so keep it to a few hero shots, render to a PNG or EXR sequence, and bring it
into Remotion so edit, type and grade stay in one deterministic pipeline. Mitsuba 3 only for physically
exact light. Not Taichi (stalled) or POV-Ray (frozen). None of these is a kit prerequisite.

## 7. Safe sources

MIT and friends: three.js, pmndrs (`postprocessing`, drei, R3F), three-gpu-pathtracer (now
WebGPU-only from v0.0.25; stay on the deprecated WebGL tracer here), webgl-noise and psrdnoise
(Gustavson, MIT), simplex-noise, Rough.js, regl, twgl, OGL, n8ao, Mitsuba. Learn from, but never paste:
Shadertoy, Inigo Quilez, Lygia, The Book of Shaders. The kit's `src/engine/gl/glsl.ts` is written from
published maths with attributions (Hoskins' hash, Narkowicz's ACES fit, three's AgX, Khronos Neutral).

## Flat-style atmosphere: steam, smoke and cloud in a drawn film (1 October 2026)

In a line-drawing film, a soft alpha fade of a light colour over a dark one reads as grey smoke or
dirt, never as steam, and a noise-edged wipe reads as torn paper. Three rounds of style frames on
one drawn film established what does read:

- **Draw the cloud as a union of growing discs** (40 or so), emitted along the gas's real route
  (up from the source, along the ceiling, down the far wall, back along the floor) and growing and
  drifting with age. Take the union's signed distance `min(length(p - c) - r)`; fill with a crisp,
  anti-aliased edge; draw a thin outline on the union boundary; add faint inner arcs on the lower
  edge of each disc for volume. Close the last corners with a short fade only when the uncovered
  area is tiny.
- **Lead with drawn arrows**: an architect's airflow arrows draw first and the cloud follows them.
- **Crossfade line ink through a mid tone** when the ground changes under it (a pale ground to a
  dark one), so lines stay visible on both grounds during the change rather than popping.
- Cost: 44 discs per pixel added well under a second per 1080p frame on a 2023 laptop with
  integrated graphics.
