# Cinematography and grade reference
### Remotion / React / CSS 3D, 1920x1080, 60fps, 120 BPM (1 beat = 30 frames)

Read this while writing production code. Every section is numbers first, theory second. The numbers
were worked out for one brief, kept here as the worked example: a dark, 40-second product film for a
deck slot of about 2.05:1, with a pastel accent palette and a void-black space as its world. Lenses,
easing, depth, cuts and grade carry over to any film; the luminance targets and the crop are that
brief's, so recompute them for yours.

Global constants used throughout:
```
FPS       = 60
DURATION  = 2400 frames (40.000s)
BPM       = 120  -> 1 beat = 30f = 0.500s, 1 bar (4/4) = 120f = 2.000s, film = 20 bars
STAGE_W   = 1920, STAGE_H = 1080
FILM_W_MM = 36 (full-frame sensor width, used for focal-length equivalence)
```

Beat grid (memorise, all cuts land on these or on the 15f half-beat):
```
beat  0  4  8 12 16 20 24 28 32 36 40 44 48 52 56 60 64 68 72 76 80
frame 0 120 240 360 480 600 720 840 960 1080 1200 1320 1440 1560 1680 1800 1920 2040 2160 2280 2400
```
Every 30 frames is a beat. Every 120 frames is a bar. 2400 frames = exactly 80 beats = 20 bars.

---

# 1. CAMERA

## 1.1 The perspective / focal length identity (exact, verified)

CSS `perspective: P` places the eye P pixels in front of the z=0 plane. A camera with focal length `f` on a sensor of width `S` has horizontal field of view `2·atan(S / 2f)`. Setting these equal for a stage of width `W`:

```
P_px = W · f_mm / S_mm            (S = 36 for full-frame)
f_mm = P_px · S_mm / W
hFOV = 2 · atan( (W/2) / P )      == 2 · atan(18 / f_mm)   [identity holds exactly]
```
Source: [gist turbodrive/dede2748fadb7e8dfb13](https://gist.github.com/turbodrive/dede2748fadb7e8dfb13) (`cssPerspective = viewportWidth / (filmWidth/focalLength)`), consistent with [MDN perspective](https://developer.mozilla.org/en-US/docs/Web/CSS/perspective). I verified the FOV identity numerically; it is exact, not an approximation.

For W = 1920, S = 36: **P = 53.3333 × f_mm**.

| Lens | `perspective` | hFOV | vFOV | Character |
|---|---|---|---|---|
| 14mm | 747px | 104.3° | 71.7° | Grotesque. Never. |
| 18mm | 960px | 90.0° | 58.7° | Only for a deliberate "inside the machine" shot |
| 24mm | 1280px | 73.7° | 45.7° | Wide establisher, strong divergence |
| 28mm | 1493px | 65.5° | 39.8° | Widest usable for UI. Cards visibly keystone |
| **35mm** | **1867px** | **54.4°** | **32.3°** | **Default wide / establishing shots** |
| 40mm | 2133px | 48.5° | 28.4° | Neutral-wide |
| **50mm** | **2667px** | **39.6°** | **22.9°** | **Default hero lens. Use for 60-70% of the film** |
| 60mm | 3200px | 33.4° | 19.2° | Slight compression |
| **85mm** | **4533px** | **23.9°** | **13.6°** | **Portrait/detail lens. Flat, compressed, premium** |
| 100mm | 5333px | 20.4° | 11.6° | Very flat |
| 135mm | 7200px | 15.2° | 8.6° | The "graphic" look, almost orthographic |
| 200mm | 10667px | 10.3° | 5.8° | Effectively 2D |

**Lens plan for the worked example (3 lenses only, like a real prime kit):**
- 35mm (`perspective: 1867px`) for the two establishing wides and the shot that reveals scale.
- 50mm (`perspective: 2667px`) for everything in the main sequence.
- 85mm (`perspective: 4533px`) for the two detail inserts and the endcard.

Changing perspective mid-shot is a lens change and reads as one. **Never animate `perspective` inside a shot** unless you are deliberately doing a dolly-zoom (§1.4). Change it only across a cut.

## 1.2 The rig: one component, five channels

Everything lives in one 3D world. Do not scatter `perspective()` into individual transforms; the desandro rule is that `perspective` belongs on the shared parent so all children share one vanishing point, otherwise "the effect breaks" because each element gets its own ([David DeSandro, Intro to CSS 3D transforms](https://3dtransforms.desandro.com/perspective)).

```tsx
// Camera.tsx
type Cam = {
  fl: number;      // focal length mm -> perspective
  x: number;       // truck  (px, world moves -x)
  y: number;       // pedestal (px, world moves -y)
  z: number;       // dolly  (px, +z = camera moves IN)
  yaw: number;     // pan    (deg, rotateY on world = -yaw)
  pitch: number;   // tilt   (deg)
  roll: number;    // roll   (deg, rotateZ)
  originX: number; // perspective-origin % (0-100)
  originY: number;
};

export const Camera: React.FC<{cam: Cam; children: React.ReactNode}> = ({cam, children}) => (
  <div style={{
    position:'absolute', inset:0,
    perspective: `${cam.fl * (1920/36)}px`,
    perspectiveOrigin: `${cam.originX}% ${cam.originY}%`,
    transformStyle: 'preserve-3d',
  }}>
    <div style={{
      position:'absolute', inset:0,
      transformStyle: 'preserve-3d',
      // ORDER MATTERS. Read right-to-left as camera ops.
      transform: [
        `rotate(${cam.roll}deg)`,
        `translate3d(${-cam.x}px, ${-cam.y}px, ${cam.z}px)`,
        `rotateX(${-cam.pitch}deg)`,
        `rotateY(${-cam.yaw}deg)`,
      ].join(' '),
      willChange: 'transform',
    }}>{children}</div>
  </div>
);
```

Note the sign flip: to move the camera right you translate the world left. Roll goes outermost so it rotates the final image, which is what a camera roll actually does.

## 1.3 The single most important rule: dolly ≠ zoom

With perspective P, an element at depth z is drawn at apparent scale

```
s(z) = P / (P - z)
```

and, critically, **a world translate of Δx displaces that element on screen by Δx · s(z)**. So parallax is not something you add; in a correct 3D scene it falls out of `translateZ` for free. This is the whole reason to build a real camera instead of animating `scale`.

Apparent scale table (verified numerically):

| z | s @ P=1493 (28mm) | s @ P=1867 (35mm) | s @ P=2667 (50mm) | s @ P=4533 (85mm) |
|---|---|---|---|---|
| -1200 | 0.554 | 0.609 | 0.690 | 0.791 |
| -800 | 0.651 | 0.700 | 0.769 | 0.850 |
| -400 | 0.789 | 0.824 | 0.870 | 0.919 |
| -200 | 0.882 | 0.903 | 0.930 | 0.958 |
| 0 | 1.000 | 1.000 | 1.000 | 1.000 |
| +200 | 1.155 | 1.120 | 1.081 | 1.046 |
| +400 | 1.366 | 1.273 | 1.176 | 1.097 |
| +600 | 1.672 | 1.474 | 1.290 | 1.153 |
| +800 | 2.154 | 1.750 | 1.428 | 1.214 |

**Why the difference reads on screen.** A `scale()` grows every layer by the same factor, so the frame stays a flat plane sliding towards you and the brain calls it a zoom. A `translateZ` grows the near layer by 1.176 while the layer at z=-800 grows only 1.176/0.769 relative... the layers *diverge*, the vanishing point opens, occlusion edges shift, and the brain calls it movement through space. In a dolly the perspective of the image changes; in a zoom it does not ([wolfcrow, zoom vs dolly](https://wolfcrow.com/zoom-shot-dolly-shot-or-the-dolly-zoom-shot-when-to-use-which/); [Beverly Boy](https://beverlyboy.com/film-technology/zoom-smart-a-filmmakers-guide-to-dolly-zooms-vs-traditional-zooms/)).

**Hard rule: there is no `scale()` on any camera move. Ever.** `scale()` is permitted only on individual UI elements as a *material* property (a card popping in), never as a *camera* property. The frozen, flat feel of a failed earlier cut is exactly what a scale-only camera produces.

## 1.4 Push-in (the Apple reveal move)

The push-in is a slow dolly forward onto a subject that is already static, timed so the settle lands on a beat. Numbers that work at 1920x1080:

| Move | Lens | z range | Frames | Growth | Easing |
|---|---|---|---|---|---|
| Hero reveal push | 50mm (P=2667) | 0 → +220 | 36f (0.600s, 1.2 beats) | 9.0% | `Easing.bezier(0.16, 1, 0.3, 1)` (easeOutExpo) |
| Slow creep (under a hold) | 85mm (P=4533) | 0 → +420 | 120f (2.000s, 1 bar) | 10.2% | `Easing.bezier(0.37, 0, 0.63, 1)` (inOutSine) |
| Aggressive slam-in | 35mm (P=1867) | 0 → +260 | 30f (0.500s, 1 beat) | 16.2% | `Easing.bezier(0.22, 1, 0.36, 1)` (easeOutQuint) |
| Pull-back to reveal scale | 50mm | -120 → +180 reversed, i.e. +180 → -520 | 48f (0.800s) | -21% | `Easing.bezier(0.05, 0.7, 0.1, 1)` (M3 emphasized decelerate) |

Per-frame z delta stays under ~9px in all of these. Above roughly 12px/frame at 60fps a translateZ move starts to strobe on card edges and you must add motion blur (§4.5).

**Never push in more than 12% on a single shot.** Beyond that the audience feels the camera, which is the failure mode. Two 9% pushes on two different shots read as more movement than one 20% push.

## 1.5 Truck, pedestal, orbit, roll

```
TRUCK    translateX on world. 120-260px over 45-90f. Reveals parallax best when
         the subject sits at z=0 and there is content at z=-800 and z=+300.
PEDESTAL translateY on world. 60-140px. Use sparingly; vertical moves fight the
         2.05:1 crop (§7) because you only have 937 visible pixels of height.
ORBIT    rotateY on world, 6-14 degrees, with the pivot pushed behind the subject:
         transform-origin: 50% 50% -900px  (900px behind the card plane).
         An orbit without an offset origin is a pan, not an orbit.
ROLL     rotateZ, -1.2deg to +1.2deg. Anything past 2deg reads as a mistake unless
         it is a deliberate whip (§4.3). Roll should NEVER be static; it is either
         settling to 0 or drifting by <0.3deg over the shot.
```

**Handheld micro-drift (the thing that kills "frozen frames").** Every shot, including holds, carries this. It is not a camera move; it is the absence of a tripod.

```tsx
const drift = (f: number, seed: string, ampPx = 6, hz = 0.11) => ({
  x: ampPx * Math.sin(f * hz * 0.0431 + random(seed + 'x') * 6.283)
       + ampPx * 0.35 * Math.sin(f * hz * 0.1137 + random(seed + 'x2') * 6.283),
  y: ampPx * 0.7 * Math.sin(f * hz * 0.0367 + random(seed + 'y') * 6.283),
  roll: 0.22 * Math.sin(f * hz * 0.0289 + random(seed + 'r') * 6.283),
});
```
Amplitude 6px translate and 0.22° roll at ~0.1Hz. That is 0.31% of frame width, invisible as motion, but it means no two consecutive frames are ever identical, which is what `ffmpeg freezedetect` was catching. Use Remotion's `random(seed)` and **never `Math.random()`**: Remotion renders across multiple threads and opens the page multiple times, so `Math.random()` returns different values per thread and the animation desyncs ([Remotion random()](https://www.remotion.dev/docs/random)).

## 1.6 Whip pan and speed ramp

**Whip pan** (used as a cut hider, §4.3):
```
rotateY on world: 0 -> -34deg over 5 frames (83ms) = 408 deg/s
simultaneously   filter: blur(0px -> 34px) with easeInQuad
CUT at frame 5
incoming shot:   rotateY -34 -> 0 over 5 frames, blur 34 -> 0
```
Total 10 frames (167ms). The direction must be consistent: if the outgoing whips left, the incoming enters from the right. Motion blur "is integral to making the transition work since it helps to hide the cut" ([No Film School](https://nofilmschool.com/how-to-do-a-whip-pan)).

**Speed ramp** on a code-rendered scene means remapping the frame index, not `playbackRate`. Remotion evaluates every frame independently so an interpolated rate does not accumulate; you must integrate it ([Remotion accelerated-video snippet](https://www.remotion.dev/docs/miscellaneous/snippets/accelerated-video)):

```tsx
// Integrate a speed curve into a warped frame index.
const remapSpeed = (frame: number, speed: (f: number) => number) => {
  let t = 0;
  for (let i = 0; i <= frame; i++) t += speed(i);
  return t;
};

// Ramp: 1.0x -> 0.25x over 18f, hold 12f, 0.25x -> 1.0x over 18f
const speed = (f: number) =>
  interpolate(f, [0, 18, 30, 48], [1, 0.25, 0.25, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.65, 0, 0.35, 1),
  });

const warped = remapSpeed(frame, speed);   // feed this to the scene, not `frame`
```
Wrap the loop in `useMemo` keyed on frame ranges, or precompute the whole 2400-entry table once at module scope. Remotion's perf guidance is explicit about eliminating JS bottlenecks and using `useMemo` ([Remotion performance](https://www.remotion.dev/docs/performance)).

Use exactly **one** speed ramp in the film, on its turning moment. A second ramp makes the first one meaningless.

## 1.7 The killer gotcha: filters flatten 3D

Per the CSS Transforms 2 grouping-property rules, an element with `transform-style: preserve-3d` is forced to a used value of `flat` if it has any of: `overflow` other than `visible`/`clip`, `opacity < 1`, `filter` other than `none`, `clip-path` other than `none`, `mask-image`, `mix-blend-mode` other than `normal`, `isolation: isolate`, or paint containment ([MDN transform-style](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style)).

**Consequence for this build:**
- The grade, vignette, grain, bloom and chromatic aberration are all `filter`/`mix-blend-mode`. They must live in sibling or ancestor layers **outside** the 3D stage, never on the stage or on any element between the stage and the cards.
- Per-layer depth-of-field blur (§2.4) therefore cannot be applied to a `preserve-3d` child that itself contains 3D children. Blur the *leaf* layer only.
- Recommended tree:

```
<AbsoluteFill>                        <- GRADE layer: filter: url(#grade) contrast() saturate()
  <AbsoluteFill>                      <- 2D compositing root, transformStyle: flat
    <Camera>                          <- perspective + preserve-3d
      <Layer z={-2600} blur/>         <- LEAF, may carry filter: blur()
      <Layer z={-900}  blur/>         <- LEAF
      <Layer z={0}>  cards </Layer>   <- LEAF, sharp
      <Layer z={+400} blur/>          <- LEAF
    </Camera>
    <BloomPass/>                      <- mix-blend-mode: screen, OUTSIDE Camera
    <LightShafts/>                    <- mix-blend-mode: screen
  </AbsoluteFill>
  <Vignette/>  <Grain/>  <CAPass/>    <- top of stack
</AbsoluteFill>
```

---

# 2. DEPTH

## 2.1 Depth ladder (the worked example's)

Fix these z values as constants. Do not invent new ones per scene.

```ts
export const Z = {
  DUST:      -4000,   // slowest nebula wash
  STARS_FAR: -2600,
  STARS_MID: -1600,
  STARS_NEAR: -900,
  BOKEH:      -450,   // out-of-focus motes, the depth "join"
  BG_UI:      -320,   // background cards running behind the story
  SUBJECT:       0,   // the subject card. Focal plane.
  FG_UI:      +260,   // a chip or badge that flies past the lens
  FG_BOKEH:   +700,   // near motes, heavily blurred, brief
};
```

## 2.2 Parallax maths, two cases

**Case A, real 3D (preferred).** Put the layer at `translateZ(z)` and pre-scale it by `1/s(z)` so it occupies the same screen area it would at z=0:
```
transform: translateZ(-2600px) scale(5.267)     // 1/s(-2600) at P=2667 = 1/0.5062
```
Then parallax, correct scale-with-distance and correct occlusion all happen automatically for any camera move. This is the right way and it is why the `<Camera>` rig exists.

**Case B, fake 3D (for the starfield only, because it needs `filter: blur` and would flatten the stage).** Apply explicit multipliers. Parallax factor equals the apparent-scale factor:
```
k(z) = P / (P - z)
screenDx = cameraDx · k(z)
```

Star layers at P=2667 (verified numerically):

| Layer | z | k (parallax + size) | Opacity | Blur | Star count | Star size |
|---|---|---|---|---|---|---|
| DUST | -4000 | 0.400 | 0.55 | 15.6px | n/a (gradient wash) | n/a |
| STARS_FAR | -2600 | 0.506 | 0.63 | 12.8px → use **0.6px** | 260 | 0.8px |
| STARS_MID | -1600 | 0.625 | 0.72 | 9.7px → use **0.0px** | 140 | 1.3px |
| STARS_NEAR | -900 | 0.748 | 0.81 | 6.6px → use **0.0px** | 60 | 2.1px |
| BOKEH | -450 | 0.856 | 0.89 | **3.8px** | 14 | 14-34px discs |

Note the correction: the raw CoC formula wants heavy blur on the far stars, but a blurred star just disappears. Real long-lens starfields render stars as *points* and only the near out-of-focus elements (the bokeh motes) as discs. So: stars stay sharp, bokeh discs get the blur. This is the difference between physically correct and correct-looking.

## 2.3 Atmospheric perspective, exact per-layer numbers

Distant objects lose contrast and saturation and shift towards the atmosphere colour ([aerial perspective overview](https://grokipedia.com/page/Aerial_perspective); [D5 Render](https://www.d5render.com/posts/atmospheric-perspective-for-aerial-rendering)). In a void-black nebula the "atmosphere" is not white haze, it is a faint lavender/cyan glow, so lifting blacks towards `#0e0c1c` rather than grey is what sells it.

Per-layer, as a function of normalised distance `d = (0 - z) / 4000` clamped to [0,1]:

```
saturation  = 1 - 0.55·d          // -55% at the farthest layer
contrast    = 1 - 0.42·d          // -42%
blackLift   = 0.055·d             // add rgba(150,140,255, 0.055·d) as a screen overlay
opacity     = 1 - 0.35·d
```

Concrete values:

| Layer | d | `filter: saturate()` | `filter: contrast()` | Haze overlay alpha | Layer opacity |
|---|---|---|---|---|---|
| DUST -4000 | 1.00 | 0.45 | 0.58 | 0.055 | 0.65 |
| STARS_FAR -2600 | 0.65 | 0.64 | 0.73 | 0.036 | 0.77 |
| STARS_MID -1600 | 0.40 | 0.78 | 0.83 | 0.022 | 0.86 |
| STARS_NEAR -900 | 0.23 | 0.87 | 0.90 | 0.013 | 0.92 |
| BG_UI -320 | 0.08 | 0.96 | 0.97 | 0.004 | 0.97 |
| SUBJECT 0 | 0 | 1.00 | 1.00 | 0 | 1.00 |
| FG_UI +260 | 0 | 1.00 | 1.06 | 0 | 1.00 |

Haze overlay colour: `rgba(157, 148, 255, α)` with `mix-blend-mode: screen`. This is the palette's lavender accent `#CCC4F9` pulled darker; it keeps the void from going neutral-grey.

## 2.4 Depth of field that does not look like a uniform blur

Wrong: one `blur(8px)` on "the background". Right: a hyperbolic circle-of-confusion falloff, so near-focus layers are almost sharp and the falloff is fast near the plane and asymptotic far from it.

```
blurPx(z) = C · | 1/(P - z_focus) - 1/(P - z) |
```
`C` is the aperture constant in px². **C = 69,300** at P = 2667 gives a look equivalent to roughly a 50mm at f/2.0 (UNVERIFIED as an exact f-stop equivalence; it is tuned by eye to give 6px at z=-800).

Verified table (P=2667, z_focus=0, C=69300):

| z | scale | blur |
|---|---|---|
| -2400 | 0.526 | 12.31px |
| -1800 | 0.597 | 10.47px |
| -1400 | 0.656 | 8.94px |
| -1000 | 0.727 | 7.09px |
| -700 | 0.792 | 5.40px |
| -400 | 0.870 | 3.39px |
| -200 | 0.930 | 1.81px |
| -80 | 0.971 | 0.76px |
| **0** | **1.000** | **0.00px** |
| +80 | 1.031 | 0.80px |
| +200 | 1.081 | 2.11px |
| +400 | 1.176 | 4.58px |
| +700 | 1.356 | 9.25px |
| +1000 | 1.600 | 15.59px |
| +1400 | 2.105 | 28.71px |

Two things this buys you that a uniform blur cannot:
1. **The asymmetry.** Foreground blur grows far faster than background blur (at |z|=1000, near = 15.6px, far = 7.1px). That asymmetry is the single strongest signal that a shot came out of a lens.
2. **Rack focus.** Animate `z_focus` from -900 to 0 over 24 frames with `Easing.bezier(0.4, 0, 0.2, 1)` and recompute every layer's blur per frame. Every layer changes at a different rate. Do this exactly once in the film, on the moment the subject card takes focus.

Clamp `blurPx` to 24px max. Remotion lists `filter: blur()` among the GPU-accelerated properties that are slow to render without a GPU ([Remotion GPU](https://www.remotion.dev/docs/gpu), [performance](https://www.remotion.dev/docs/performance)). Render with the GPU backend `npm run doctor` picked for your machine; `angle` is Remotion's desktop recommendation and the Remotion 5.0 default ([Remotion gl-options](https://www.remotion.dev/docs/gl-options)). Note the documented caveat: memory leaks are a known problem with `angle` on 4.0, so split long renders.

---

# 3. MOVE DESIGN

## 3.1 Move durations (frames at 60fps)

| Move | Frames | Seconds | Beats | Notes |
|---|---|---|---|---|
| Micro-settle after a cut | 8-12 | 0.13-0.20 |, | The overshoot resolving |
| Element entrance | 15-20 | 0.25-0.33 | 0.5-0.67 | Cards, chips, text |
| Whip half | 5 | 0.083 |, | See §4.3 |
| Fast push (accent) | 24-30 | 0.40-0.50 | 0.8-1 | Lands on a beat |
| Standard push-in | 36-45 | 0.60-0.75 | 1.2-1.5 | The workhorse |
| Truck / lateral | 60-90 | 1.00-1.50 | 2-3 | Needs parallax to justify itself |
| Slow creep under a hold | 90-120 | 1.50-2.00 | 3-4 | Camera "breathing" |
| Pull-back reveal | 45-60 | 0.75-1.00 | 1.5-2 | Faster than the push it undoes |

**Rule: every move starts and ends on a frame that is a multiple of 15** (the half-beat). A move that resolves off the grid feels like a mistake even when the viewer cannot say why.

## 3.2 Easing table (exact control points, all verified)

Remotion's `Easing.bezier(x1,y1,x2,y2)` is documented as "equivalent to CSS Transitions' `transition-timing-function`", so CSS cubic-bezier values drop in unchanged ([Remotion Easing](https://www.remotion.dev/docs/easing)).

| Name | cubic-bezier | Use it for |
|---|---|---|
| easeOutExpo | `0.16, 1, 0.3, 1` | **Push-ins, hero reveals.** The premium default. 80% of the move happens in the first 25% of time |
| easeOutQuint | `0.22, 1, 0.36, 1` | Slam-settles, card arrivals. Slightly less extreme than expo |
| easeOutQuart | `0.25, 1, 0.5, 1` | Text and small element entrances |
| easeOutCirc | `0, 0.55, 0.45, 1` | Specular sweeps across glass. Constant-feeling then abrupt stop |
| easeOutCubic | `0.33, 1, 0.68, 1` | Gentle, when expo is too showy |
| M3 emphasized | `0.2, 0, 0, 1` | Anything that begins and ends on screen |
| M3 emphasized decelerate | `0.05, 0.7, 0.1, 1` | **Entering the frame.** Best-in-class entrance curve |
| M3 emphasized accelerate | `0.3, 0, 0.8, 0.15` | **Leaving the frame.** Exits should accelerate away |
| M3 standard | `0.2, 0, 0, 1` | Utility |
| M3 standard decelerate | `0, 0, 0, 1` | Pure decel, no ease-in at all |
| M3 standard accelerate | `0.3, 0, 1, 1` | Pure accel |
| inOutSine | `0.37, 0, 0.63, 1` | **Camera creeps and drift.** The only curve that reads as "no one is easing" |
| inOutQuint | `0.83, 0, 0.17, 1` | Speed-ramp shape, whip sweeps |
| easeInQuad (for blur ramps) | `0.11, 0, 0.5, 0` | Blur going up during a whip |

Sources: [easings.net](https://easings.net/) via [search-confirmed values](https://www.npmjs.com/package/easings-css); [Material Design 3 easing tokens](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs).

**Prohibited:** `linear` for anything except a continuous loop (marquee, orbiting particle). `ease` (the CSS default `0.25,0.1,0.25,1`) for anything, because it is the visual signature of an unstyled web page. Symmetric ease-in-out on an entrance, because objects arriving in frame should decelerate, not accelerate then decelerate.

## 3.3 Move the camera or move the subject?

| Situation | Move |
|---|---|
| Establishing the world | Camera. The world is fixed; you are entering it |
| A new UI element appearing | Subject. It arrives; the camera does not chase it |
| Emphasis on something already present | Camera push. This is the reveal move |
| Comparing two things | Camera truck between them, or a cut. Never both |
| Something becoming true (a status flipping) | Subject only. Camera holds dead still except drift |
| Scale / "it happens at volume" | Camera pull-back. Only a camera move can express scale |

**The rule of one motivator.** In any given 15-frame window, either the camera moves or the subject moves, not both at meaningful amplitude. Simultaneous camera and subject motion is the most common reason cheap motion graphics look busy rather than expensive. Micro-drift (§1.5) does not count as camera motion.

## 3.4 Holds

A hold is not a freeze. In a 40s film budget roughly **35% of frames in dead hold** (camera drift only, subject static), because contrast is what makes the moving parts read. But every held frame still carries: micro-drift, grain regenerating (§6.5), starfield twinkle, and any looping background telemetry. `ffmpeg freezedetect` must return zero events across the whole 2400 frames.

Hold lengths: 18f minimum (0.30s, half a beat), 45f typical, 90f maximum. A hold longer than 90 frames in a 40-second film is a dead spot.

## 3.5 The one-z-move rule

**Exactly one shot in the film gets a large z-axis move.** Everything else is truck, pedestal, orbit, micro-push (<9%), or hold. The reason is that translateZ is the most expensive gesture in the vocabulary; used twice it stops meaning anything, and used five times the film reads as a screensaver.

In the worked example the big z-move is the **pull-back that reveals scale**: 50mm, z from +180 to -520 over 48 frames (frames 1560→1608, landing on bar 13), `Easing.bezier(0.05, 0.7, 0.1, 1)`. Everything before it is at most a 9% push. That contrast is what makes the reveal land.

---

# 4. CUTS

## 4.1 Cut budget

Average shot length in English-language film has fallen from ~12s in 1930 to ~2.5s today ([Cinemetrics / Barry Salt, via StoryAlity](https://storyality.wordpress.com/2013/08/23/storyality-71b-cinemetrics/)). Brand and launch films cut faster than narrative. This is launch-film pacing: software product demos barely cut (4 to 45 s mean shot), so read `watching-video.md` section 3 before applying it to a demo. For 40 seconds:

| ASL | Shots | Avg frames |
|---|---|---|
| 1.2s | 33 | 72 |
| **1.4s** | **29** | **84** |
| **1.6s** | **25** | **96** |
| 1.8s | 22 | 108 |
| 2.5s | 16 | 150 |

**Target for the worked example: 24-28 hard cuts, ASL 1.43-1.67s.** A failed earlier cut had zero cuts in 100 seconds; in this register, anything under 14 cuts repeats that failure.

Distribute unevenly, not uniformly. Suggested rhythm in bars (1 bar = 120f):
- Bars 0-3 (0-8s): 4 cuts, ASL ~2.0s. Establishing, let it breathe.
- Bars 4-9 (8-20s): 9 cuts, ASL ~1.33s. The journey accelerates.
- Bars 10-13 (20-28s): 7 cuts, ASL ~1.14s. Peak density.
- Bars 14-16 (28-34s): 3 cuts, ASL ~2.0s. The pull-back reveal, room to land.
- Bars 17-19 (34-40s): 3 cuts. Endcard, decelerating to a 90f final hold.

## 4.2 Structure in Remotion

Two viable structures. Use **A** for hard cuts and **B** only where a transition genuinely needs to overlap.

**A. Global timeline with absolute `<Sequence>`.** `<Sequence from={n}>` shifts `useCurrentFrame()` for children by `from`, so each scene component sees frame 0 at its own start ([Remotion Sequence](https://www.remotion.dev/docs/sequence)).

```tsx
const CUT = [0, 120, 240, 330, 420, 510, 600, 690, 780, 870, ...] as const;

<AbsoluteFill>
  {SHOTS.map((S, i) => (
    <Sequence key={i} from={CUT[i]} durationInFrames={CUT[i+1] - CUT[i]}
              name={`S${i} ${S.name}`} premountFor={30}>
      <S.Component />
    </Sequence>
  ))}
</AbsoluteFill>
```
`premountFor={30}` mounts the scene half a second early (invisible) so fonts, gradients and layout are settled before the first visible frame. This prevents the one-frame flash of an unlaid-out card on the cut, which is the classic Remotion hard-cut artefact.

**B. `<TransitionSeries>`** from `@remotion/transitions` (v4.0.53+) when you need a real overlap, with `springTiming`/`linearTiming` and `fade`/`slide`/`wipe`/`clockWipe`/`none` presentations ([Remotion transitions](https://www.remotion.dev/docs/transitions/)). Use it for at most 2 moments in a 40 s film. Cross-dissolves are what an earlier failed cut leaned on.

## 4.3 The five cut types, built

### Hard cut (default, ~20 of the 24-28)
No transition object at all. Adjacent Sequences. The cut is intentional because of what is on either side of it:
- **Change at least two of**: lens, subject scale in frame, dominant screen quadrant, colour accent.
- If the camera was moving before the cut, it must be moving after it, in a *different* axis. A cut from moving to static reads as a mistake; a cut from truck-left to push-in reads as an edit.

### Slam-settle (the hard cut that feels deliberate)
The incoming shot arrives 3.5% overshot and settles in 10 frames. This is what makes a hard cut land like a hit rather than a jump.
```tsx
const settle = interpolate(frame, [0, 10], [1.035, 1.000], {
  extrapolateRight: 'clamp',
  easing: Easing.bezier(0.22, 1, 0.36, 1),   // easeOutQuint
});
const settleRoll = interpolate(frame, [0, 14], [0.9, 0], {
  extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1),
});
// applied as camera z, NOT scale:  z = 2667 * (1 - 1/settle)
```
Convert the 1.035 overshoot to a z offset so it is still a dolly: `z = P·(1 − 1/1.035) = 2667 × 0.0338 = 90px`. So the camera starts 90px forward and pulls back to 0 over 10 frames. Pair with a 2-frame `filter: brightness(1.10)` flash-frame on the first frame only, and a 1-frame 3px chromatic aberration spike.

### Match cut
The same shape occupies the same screen position and roughly the same area on both sides of the cut, and it changes meaning. Concretely:
- Frame N-1: a circular avatar at (x=1280, y=470), diameter 96px.
- Frame N: a circular progress ring at (x=1280, y=470), diameter 96px.
- Both must be within ±4px position and ±6% diameter. Compute these from shared constants, do not eyeball them.

### Graphic match
Weaker than a match cut and cheaper. Preserve the *composition* (a strong diagonal from lower-left to upper-right) while changing everything else. Preserve the dominant accent hue across the cut so the eye tracks colour continuity: e.g. the outgoing shot's brightest element is `#9CEBFF` at x=1400; the incoming shot's brightest element is `#9CEBFF` at x=1420.

### Whip-pan cut
See §1.6. Implementation:
```tsx
// outgoing shot, last 5 frames of its Sequence
const t = (frame - (dur - 5)) / 5;              // 0..1
const yaw  = interpolate(t, [0,1], [0, -34], {easing: Easing.bezier(0.11,0,0.5,0)});
const blur = interpolate(t, [0,1], [0, 34],  {easing: Easing.bezier(0.11,0,0.5,0)});
// incoming shot, first 5 frames: mirror it, yaw -34 -> 0, blur 34 -> 0
```
The blur here must go on a wrapper outside the 3D stage (§1.7) or it will flatten the scene. Simplest: render the whole shot to a flat layer during the whip by disabling `preserve-3d` for those 5 frames, which is fine because at 34px blur nobody can see the geometry anyway.

### Invisible cut
End the outgoing shot and start the incoming shot on a frame whose content is identical, most usefully a full-frame element: a 1-frame white flash, a card face filling frame, or (the classic) pure black. "If the end of your shot is completely black and the beginning of your next shot is completely black, there's no way to tell where the cut was made" ([Plotwit, invisible editing](https://plotwit.com/invisible-editing-techniques/)). **Use this exactly once**, at the film's change of scale.

Do NOT use black for the invisible cut in a dark film. A dark film that goes to black is measured as a dark film that went darker, and it hurts the mean-luminance number. Use a **white-hot 2-frame flash** instead: frames N-1 and N are both `#FFFFFF` at 92% opacity over the frame. It hides the cut, it costs 2 frames, and it lifts the film's mean luminance.

### Speed-ramp cut
The ramp (§1.6) decelerates into the cut and the incoming shot starts at full speed. Ramp down over 18f, hold slow for 12f, then **cut on the slowest frame**. The velocity discontinuity at the cut is the point.

## 4.4 Hiding a cut behind a fast element
Put a foreground object at `Z.FG_UI` (+260) or `Z.FG_BOKEH` (+700) travelling across frame at 90-160px/frame. For 3-4 frames it covers 55-80% of frame width. Cut while it is at maximum coverage. At +700 the CoC blur is 9.25px, so it reads as a soft foreground wipe rather than an object, which is exactly what you want.

Candidates: a gradient bar in the accent colour, a stack of 3 out-of-focus card silhouettes, a light streak.

## 4.5 Motion blur on cuts and fast moves
`@remotion/motion-blur` `<CameraMotionBlur>` has `shutterAngle` default **180** and `samples` default **10**; shutterAngle must be 0-360 and is internally converted to `shutterAngle/360` ([source](https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/motion-blur/src/CameraMotionBlur.tsx)).

- 180° at 60fps = a 1/120s exposure, the film-standard shutter. Use `shutterAngle={180} samples={12}` for whip pans and slam-settles.
- Do **not** wrap the whole film in it. It multiplies render cost by `samples` and adds nothing on holds.
- Apply it to: the 10 whip frames, the 4 frames either side of the speed-ramp cut, and any element moving faster than 12px/frame.

---

# 5. LIGHT

## 5.1 The measurement targets (the worked example's real test)

A failed earlier cut measured mean luminance 7.5% and peak 14.7%. Interpreting those as per-frame mean luma Y′ (0-255) averaged over the film, and the brightest single frame's mean:

| Metric | Failed cut | **Target** | Hard floor |
|---|---|---|---|
| Film-wide mean Y′ | 7.5% (Y′≈19) | **15-18%** (Y′ 38-46) | ≥12% |
| Brightest frame mean Y′ | 14.7% (Y′≈37) | **34-40%** (Y′ 87-102) | ≥30% |
| Darkest frame mean Y′ |, | 6-9% | ≥5% (never true black) |
| Per-frame YMAX | probably ~200 | **≥250 on ≥85% of frames** | ≥245 |
| Per-frame YHIGH (90th pct) |, | ≥55 on hero shots, ≥28 film-wide |, |
| Frames with mean >25% | ~0 | **≥360 frames (15% of film)** | ≥240 |
| `freezedetect` events | many | **0** | 0 |
| `scdet` detections | 0 | **24-28** | ≥14 |

Measure with:
```bash
ffmpeg -i out.mp4 -vf "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=yavg.txt" -f null -
ffmpeg -i out.mp4 -vf "signalstats,metadata=print:key=lavfi.signalstats.YMAX:file=ymax.txt" -f null -
ffmpeg -i out.mp4 -vf "freezedetect=n=0.003:d=0.25,metadata=mode=print" -f null -
ffmpeg -i out.mp4 -vf "scdet=threshold=8:sc_pass=0,metadata=mode=print" -f null -
```
`signalstats` emits `YMIN`, `YLOW` (10th pct), `YAVG`, `YHIGH` (90th pct), `YMAX`, `YDIF` in 0-255 ([signalstats docs](https://ayosec.github.io/ffmpeg-filters-docs/8.0/Filters/Video/signalstats.html)). `scdet` has `threshold`/`t` default 10 (range 0-100) and `sc_pass`/`s` default 0, and sets `lavfi.scd.mafd`, `lavfi.scd.score`, `lavfi.scd.time` ([scdet docs](https://ayosec.github.io/ffmpeg-filters-docs/8.0/Filters/Video/scdet.html)). `freezedetect` `noise_threshold` defaults to -60dB / 0.001 and sets `lavfi.freezedetect.freeze_start` ([freezedetect docs](https://ayosec.github.io/ffmpeg-filters-docs/8.0/Filters/Video/freezedetect.html)).

Note the colour-range trap: encode with `-color_range tv` and `-colorspace bt709`, in which case Y′ ranges 16-235 and the percentages above shift. If you encode full-range (`yuvj420p`), Y′ is 0-255. **Pick one and state it when reporting numbers.** The targets above are stated in full-range 0-255.

## 5.2 Luminance of the worked example's palette (computed, Rec.709)

| Token | Hex | Linear Y | Y′ (0-255) | Y′ % |
|---|---|---|---|---|
| void | `#04040a` | 0.13% | 4.4 | 1.7% |
| panel | `#0d0d18` | 0.44% | 13.8 | 5.4% |
| panel lit | `#12121f` | 0.66% | 18.9 | 7.4% |
| lavender | `#CCC4F9` | 59.2% | 201.5 | 79.0% |
| pink | `#FAC4DE` | 65.1% | 209.4 | 82.1% |
| cyan | `#9CEBFF` | 73.7% | 219.6 | 86.1% |
| mint | `#B8FFDC` | 86.9% | 237.4 | 93.1% |
| lime | `#E4FF75` | 89.3% | 239.3 | 93.8% |
| white | `#FFFFFF` | 100% | 255 | 100% |

**The arithmetic that matters:** with a void background at Y′=4.4, hitting a frame mean of 16% needs 17.3% of the frame covered by accent-brightness pixels (Y′≈215), or equivalently a very large area of mid-luminance panel. Panels at Y′=34 cannot get you there alone (you would need >120% coverage). **Luminance in this film must come from accent-bright elements and glow, not from lifting the background.** Lifting the background is what makes a dark film soupy.

## 5.3 Verified per-shot luminance budget

Modelled coverage → resulting mean Y′:

| Shot type | Composition | Mean Y′ | % |
|---|---|---|---|
| A. Cold open, void + stars | 35% dim nebula, 0.4% stars, 1% dim text | 8.8 | 3.5% |
| B. UI card establish | 18% mid nebula, 22% lit panel, 3% edge, 2% accent, 4% text | 26.0 | 10.2% |
| C. Hero card push-in | 20% nebula, 30% lit panel, 5% edge, 5% accent, 5% bright text, 8% glow | 48.5 | 19.0% |
| D. Fleet grid at scale | 42% lit panel, 6% edge, 6% accent, 5% text, 15% nebula, 5% glow | 46.7 | 18.3% |
| E. Flash frame / slam | 16% white, 25% glow, 10% accent, 25% panel, 15% nebula | 97.6 | **38.3%** |
| F. Logo endcard | 5% bright text, 10% glow, 25% nebula, 3% accent | 35.0 | 13.7% |

Shot A is deliberately below the floor and must be short (≤90 frames) or the film-wide mean collapses. Shot E is the peak and there should be 3-5 such moments.

## 5.4 Key / rim / fill in a 2D compositing sense

A "light" here is a gradient layer, not a light source. Every card gets three:

**Key**, a large soft radial from the upper-left, baked into the card background:
```css
background:
  radial-gradient(120% 90% at 22% -10%,
    rgba(204,196,249,0.16) 0%,
    rgba(204,196,249,0.05) 38%,
    rgba(0,0,0,0) 70%),
  linear-gradient(160deg, #14142a 0%, #0a0a16 62%, #06060e 100%);
```

**Rim**, a 1px hairline on the edges facing the key, brighter at the top-left corner:
```css
/* 1px gradient border via mask-composite */
border: 1px solid transparent;
background-image:
  linear-gradient(#0a0a16, #0a0a16),
  linear-gradient(135deg,
    rgba(204,196,249,0.55) 0%,
    rgba(156,235,255,0.28) 28%,
    rgba(255,255,255,0.06) 55%,
    rgba(255,255,255,0.02) 100%);
background-origin: border-box;
background-clip: padding-box, border-box;
```
Rim opacity 0.55 at the lit corner falling to 0.02 opposite. A uniform 1px `rgba(255,255,255,0.1)` border is the tell of an unlit card.

**Fill**, the bounce, a very low-amplitude cool wash from below that stops the unlit side from going to pure void:
```css
box-shadow: inset 0 -80px 90px -70px rgba(156,235,255,0.20);
```

**Ambient occlusion**, the contact shadow that makes a card sit *on* something:
```css
box-shadow:
  0 1px 0 rgba(255,255,255,0.06) inset,          /* top light catch */
  0 24px 48px -12px rgba(0,0,0,0.85),            /* contact */
  0 2px 6px -2px rgba(0,0,0,0.9);                /* tight contact */
```
The tight one matters more than the big one. Cards without a tight contact shadow float.

## 5.5 Specular sweep across glass

```tsx
// child of the card, position:absolute, inset:0, overflow hidden on the card
const t = interpolate(frame, [start, start + 20], [0, 1], {
  extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  easing: Easing.bezier(0, 0.55, 0.45, 1),   // easeOutCirc
});
style = {
  transform: `translateX(${interpolate(t, [0,1], [-140, 140])}%) skewX(-18deg)`,
  background: `linear-gradient(90deg,
      rgba(255,255,255,0)    0%,
      rgba(255,255,255,0.03) 34%,
      rgba(255,255,255,0.16) 47%,
      rgba(255,255,255,0.22) 50%,
      rgba(255,255,255,0.16) 53%,
      rgba(255,255,255,0.03) 66%,
      rgba(255,255,255,0)   100%)`,
  mixBlendMode: 'plus-lighter',   // Chrome 111+. Fallback: 'screen'
  width: '60%', height: '140%',
  filter: 'blur(6px)',
}
```
Peak alpha 0.22, band width 60% of card, skew -18°, 20 frames, easeOutCirc. Above alpha 0.30 it stops reading as glass and starts reading as a wipe. `plus-lighter` is additive and avoids the milky lift that `screen` gives on dark surfaces; it is Chrome 111+, and Remotion renders in Chrome so it is safe here, but keep `screen` as the fallback string.

Fire the sweep on a beat, once per card, never on more than 2 cards simultaneously.

## 5.6 Bloom threshold discipline

Bloom threshold is "the minimum brightness at which bloom starts having an effect", default 1.0 in Unreal, and the documented reason to raise it is "to reduce the bloom in darker areas, thereby concentrating effects on brighter highlights"; lowering it below default increases bloom on dark pixels ([Unreal bloom](https://dev.epicgames.com/documentation/unreal-engine/bloom-in-unreal-engine?lang=en-US)). The mechanism that makes dark films soupy: "by adding the bloom, bright pixels become even brighter, and since the blur makes them bleed across multiple pixels, it ends up brightening other areas of the image as well, which can skew how scene content looks and is tricky to balance in dark ambiances" ([Froyok, custom bloom in UE4](https://www.froyok.fr/blog/2021-12-ue4-custom-bloom/)).

Translation for this film: with a void at Y′=4.4 and panels at Y′=14-34, **any threshold below ~0.55 will bloom the panels themselves**, turning every card into a grey smear and every black into charcoal. That is the "murk".

**Threshold in CSS.** A `brightness(B) contrast(C)` chain gives `out = (c·B − 0.5)·C + 0.5`, so the black point is `T = 0.5(1 − 1/C)/B` and the white point is `W = 0.5(1 + 1/C)/B`. CSS shorthand filter functions operate in sRGB (unlike raw SVG filters, which default to linearRGB).

Verified knee table:

| Filter | Knee starts | Knee ends |
|---|---|---|
| `brightness(0.694) contrast(6)` | 0.60 | 0.84 |
| `brightness(0.641) contrast(6)` | 0.65 | 0.91 |
| **`brightness(0.595) contrast(6)`** | **0.70** | **0.98** |
| `brightness(0.556) contrast(6)` | 0.75 | 1.05 |
| `brightness(0.625) contrast(8)` | 0.70 | 0.90 |
| `brightness(0.663) contrast(14)` | 0.70 | 0.81 |

At threshold 0.70 (Y′≥179) the only things that bloom are bright text, the pastel accents, the hero element and pure white. Stars at Y′=150 do not bloom, which is correct: they get their glow from a `text-shadow`/`box-shadow` instead.

**Two-tap bloom pass (outside the 3D stage):**
```tsx
<AbsoluteFill style={{
  filter: 'brightness(0.595) contrast(6) blur(9px)',
  mixBlendMode: 'screen', opacity: 0.55, pointerEvents:'none',
}}>{sceneClone}</AbsoluteFill>
<AbsoluteFill style={{
  filter: 'brightness(0.595) contrast(6) blur(38px)',
  mixBlendMode: 'screen', opacity: 0.30, pointerEvents:'none',
}}>{sceneClone}</AbsoluteFill>
```
Tight tap 9px at 0.55 gives the "hot" core; wide tap 38px at 0.30 gives the halo. Two taps at different radii is what separates a real bloom from a `blur()` overlay. Total bloom contribution to frame mean: roughly +1.5 to +3 Y′ points, which is a bonus, not the plan.

**Never lower the threshold to make the film brighter.** Brighten by adding bright *content* (§5.2 arithmetic), not by blooming dark content.

## 5.7 Volumetric light shafts in CSS

Two builds, use the second.

**Cheap (single shaft, for the endcard):**
```css
background: conic-gradient(from 198deg at 50% -20%,
  transparent 0deg,
  rgba(204,196,249,0.00) 8deg,
  rgba(204,196,249,0.13) 11deg,
  rgba(156,235,255,0.05) 14deg,
  transparent 18deg,
  transparent 26deg,
  rgba(250,196,222,0.09) 29deg,
  transparent 34deg,
  transparent 360deg);
filter: blur(22px);
mix-blend-mode: screen;
mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0) 92%);
```
The `conic-gradient` from a point above frame gives genuine radiating rays, the `blur(22px)` gives the volumetric softness, the vertical `mask-image` gives the falloff with distance from the source. Technique basis: [Pure CSS light rays, fabiovergani](https://codepen.io/fabiovergani/pen/yLOORex), [conic-gradient rays of light](https://codepen.io/yisi/pen/jmEGRB).

**Correct (shafts that respond to the camera):** put the shaft layer inside the `<Camera>` at `Z.STARS_MID` and let the world transform move it. Because it is a leaf you can still blur it. Rotate the conic `from` angle by `-0.6 × cam.yaw` so the light source appears fixed in world space while the shafts sweep.

Peak alpha never above **0.13** on a shaft. Above that it stops being volumetric and becomes a graphic wedge.

**Dust in the shaft.** 30-50 1px particles inside the shaft mask, `opacity: 0.10-0.35`, drifting at 0.15-0.4 px/frame, seeded with `random()`. This is the detail that makes a shaft read as light through atmosphere rather than a gradient. It costs almost nothing.

---

# 6. GRADE

Everything in this section goes on layers **above** the 3D stage (§1.7).

## 6.1 Lift / gamma / gain as an SVG filter

CSS `filter` has no gamma. `feComponentTransfer type="gamma"` does exactly `C′ = amplitude·C^exponent + offset` ([MDN feComponentTransfer](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feComponentTransfer)), which is precisely gain / gamma / lift:

```
gain  = amplitude
gamma = 1 / exponent
lift  = offset
```

Inline this once in the composition and reference it with `filter: url(#grade)`:

```html
<svg width="0" height="0" style="position:absolute">
  <filter id="grade" color-interpolation-filters="sRGB"
          x="0" y="0" width="100%" height="100%">
    <!-- lift blacks slightly cool, crush a touch, gain a touch -->
    <feComponentTransfer>
      <feFuncR type="gamma" amplitude="1.04" exponent="1.06" offset="0.012"/>
      <feFuncG type="gamma" amplitude="1.02" exponent="1.05" offset="0.014"/>
      <feFuncB type="gamma" amplitude="1.06" exponent="0.98" offset="0.022"/>
    </feComponentTransfer>
  </filter>
</svg>
```

Read the numbers: blue lift 0.022 vs red 0.012 puts a cool cast in the shadows. Blue exponent 0.98 (gamma 1.02) lifts blue midtones slightly. Red amplitude 1.04 and blue 1.06 keeps highlights from going green. `color-interpolation-filters="sRGB"` is mandatory here; the SVG default is `linearRGB` and your numbers will not mean what you think.

**Do not stack this with a CSS `brightness()`.** Pick one grade path.

## 6.2 Tone curve (S-curve, filmic)

Apply after the lift/gamma/gain, as a second `feComponentTransfer` with `type="table"`. A 5-point table is enough and interpolates linearly between points:

```html
<feComponentTransfer>
  <feFuncR type="table" tableValues="0.000 0.055 0.235 0.560 0.845 1.000"/>
  <feFuncG type="table" tableValues="0.000 0.050 0.230 0.558 0.845 1.000"/>
  <feFuncB type="table" tableValues="0.006 0.070 0.250 0.565 0.840 0.985"/>
</feComponentTransfer>
```
Input 0, 0.2, 0.4, 0.6, 0.8, 1.0 maps to those values. Read it: 0.2→0.055 crushes the low midtones (contrast in the void), 0.4→0.235 and 0.6→0.560 is near-linear through the mids (the UI stays readable), 0.8→0.845 rolls the highlights off so accents do not clip. Blue starts at 0.006 (the lifted cool black) and tops at 0.985 (highlights go slightly warm, which is what film does).

**Do not crush harder than 0.2→0.045.** Below that your panels at Y′=14 disappear entirely and you are back at mean 7.5%.

## 6.3 Halation

Real halation is a reddish glow around bright highlights caused by light scattering through the emulsion and reflecting off the film base; it starts red because red scatters most and shifts towards yellow/orange as intensity rises ([Dehancer](https://blog.dehancer.com/articles/halation/), [Color Finale](https://colorfinale.com/blog/post/cf-halation-11-24)). It is threshold → blur → tint → additive composite.

Fully self-contained SVG:
```html
<filter id="halation" color-interpolation-filters="sRGB" x="-10%" y="-10%" width="120%" height="120%">
  <!-- 1. threshold at ~0.72 -->
  <feComponentTransfer in="SourceGraphic" result="hi">
    <feFuncR type="linear" slope="6" intercept="-4.32"/>
    <feFuncG type="linear" slope="6" intercept="-4.32"/>
    <feFuncB type="linear" slope="6" intercept="-4.32"/>
  </feComponentTransfer>
  <!-- 2. scatter -->
  <feGaussianBlur in="hi" stdDeviation="14" result="halo"/>
  <!-- 3. tint red-orange, kill blue -->
  <feColorMatrix in="halo" type="matrix" result="tinted"
    values="1.00 0.28 0.10 0 0
            0.14 0.34 0.05 0 0
            0.02 0.03 0.06 0 0
            0    0    0    0.42 0"/>
  <!-- 4. additive -->
  <feBlend in="SourceGraphic" in2="tinted" mode="screen"/>
</filter>
```
`slope=6, intercept=-4.32` puts the threshold at 4.32/6 = 0.72. `stdDeviation=14` at 1080p is the scatter radius. The colour matrix alpha row `0.42` is the strength dial: **0.30-0.45 is premium, above 0.60 is an Instagram filter.** Chrome supports the full set of CSS blend modes on `feBlend` including `screen`, `overlay` and `soft-light` ([feBlend blend modes reference](https://oreillymedia.github.io/Using_SVG/guide/blend-modes.html); [Chrome feBlend all CSS blend modes](https://codepen.io/yoksel/pen/rNQJBK)).

Because the worked example's accents are pastel and cool, halation is the one warm element in the film. That is deliberate: it keeps 40 seconds of cyan/lavender from feeling clinical. Apply it only on frames where something crosses 0.72 (the accent-bright and white-flash moments), not globally, or you pay the blur cost on every frame for nothing.

## 6.4 Chromatic aberration

Real lens CA is zero at the optical centre and grows towards the corners. Uniform CA across the frame is the tell of a cheap plugin. Tools offer up to 20px of channel shift, but at 1080p only 1-3px is plausible and even that is barely visible at viewing size ([Boris FX](https://borisfx.com/blog/create-chromatic-aberration-in-after-effects/), [ProVideo Coalition](https://www.provideocoalition.com/chromatic-aberration-fix/)).

**Amounts:**
| Context | Corner shift | Reads as |
|---|---|---|
| Baseline, whole film | **0.6px** | Nothing, subliminal, correct |
| Hero shots | **1.2px** | Premium glass |
| Whip pan frames | 3.0px | Motion energy |
| Slam-settle frame 0 only | 4.0px for 1 frame | Impact |
| Anything ≥6px sustained |, | Cheap, VHS, amateur |

Implementation, radial, with a mask so the centre stays clean:
```html
<filter id="ca" color-interpolation-filters="sRGB">
  <feColorMatrix in="SourceGraphic" type="matrix" result="R"
    values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/>
  <feColorMatrix in="SourceGraphic" type="matrix" result="G"
    values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"/>
  <feColorMatrix in="SourceGraphic" type="matrix" result="B"
    values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"/>
  <feOffset in="R" dx="-1.2" dy="0" result="Ro"/>
  <feOffset in="B" dx="1.2"  dy="0" result="Bo"/>
  <feComposite in="Ro" in2="G" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="RG"/>
  <feComposite in="RG" in2="Bo" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
</filter>
```
Then apply the filtered copy over the clean frame with a radial mask so it only shows at the edges:
```css
mask-image: radial-gradient(ellipse 62% 62% at 50% 50%,
  rgba(0,0,0,0) 0%, rgba(0,0,0,0) 42%, rgba(0,0,0,1) 100%);
```
The `dx` value is animated per frame from a `caAmount` constant.

## 6.5 Film grain

Published practice is 30-70% strength, blended `Overlay` (more contrast) or `Soft Light` (subtler) ([Video Milkshake](https://www.videomilkshake.com/blogs/news/film-grain-overlays-in-video-editing), [WeVideo](https://www.wevideo.com/blog/film-grain-overlay), [Cine Source](https://cinesource.nl/what-is-film-grain-add-to-video/)). For a dark synthetic film, `overlay` is wrong: overlay does nothing in the shadows (it multiplies below 0.5), so a dark frame gets no grain and the banding stays. Use **`soft-light` for midtones plus a low-alpha `screen` pass for the shadows**.

Generate the grain, do not ship a PNG:
```html
<filter id="grain" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="1"
                seed={grainSeed} stitchTiles="stitch" result="n"/>
  <feColorMatrix in="n" type="saturate" values="0"/>
</filter>
```
[MDN feTurbulence](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feTurbulence). `baseFrequency="0.55"` gives ~1.8px grain at 1080p, which is 35mm-like. `numOctaves="1"` is essential: higher octaves add low-frequency clumping that reads as dirt or compression noise, not grain. `type="fractalNoise"` (not `turbulence`) gives a Gaussian-ish distribution centred on mid-grey, which is what you want for a blend-mode overlay.

**Animate it correctly:**
```tsx
const grainSeed = Math.floor(frame / 2) % 24;   // regenerate at 30Hz, not 60Hz
```
Grain regenerating every frame at 60fps reads as electronic video noise. Regenerating every 2 frames (30Hz) reads as film. This is a real and audible-to-the-eye difference.

**Amount by frame brightness** (grain is a function of exposure; underexposed film is grainier):
```tsx
const grainAlpha = interpolate(frameMeanLuma, [0.03, 0.12, 0.25, 0.45],
                               [0.085, 0.062, 0.040, 0.026],
                               {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
```
Two passes:
```tsx
<AbsoluteFill style={{filter:'url(#grain)', mixBlendMode:'soft-light', opacity: grainAlpha}}/>
<AbsoluteFill style={{filter:'url(#grain)', mixBlendMode:'screen',     opacity: grainAlpha*0.35}}/>
```
The `screen` pass is what puts texture into the void and kills gradient banding, which a 1920x1080 8-bit nebula on `#04040a` will absolutely show without it.

`stitchTiles="stitch"` prevents seams if you tile the noise.

## 6.6 Vignette

```css
background: radial-gradient(ellipse 76% 74% at 50% 47%,
  rgba(0,0,0,0)    0%,
  rgba(0,0,0,0)   46%,
  rgba(0,0,0,0.10) 66%,
  rgba(0,0,0,0.30) 84%,
  rgba(0,0,0,0.52) 100%);
mix-blend-mode: multiply;
```
Corner strength **0.52**, onset at 46% radius, centre offset to 47% vertically (slightly above centre, which compensates for the 2.05:1 crop taking equally from top and bottom while the eye reads the lower two-thirds).

Because the crop removes 72px top and bottom, a vignette tuned on the full 1920x1080 will lose its top and bottom darkening entirely. **Tune the vignette to the visible band**: the ellipse should be 76% × 74%, where 74% of 1080 = 799px, sitting inside the 937px visible band. Verify by cropping a still to 1920x937 before judging.

Vignette costs you mean luminance. At 0.52 corners it drops frame mean by roughly 6-9%. Budget for it: if you need mean Y′ 16% after grade, the ungraded scene needs about 17.5%.

## 6.7 Keeping the pastels from going muddy

The pastels are all high-luminance (Y′ 201-239) and low-saturation. Three specific hazards:

1. **The tone curve highlight roll-off (§6.2) desaturates them.** Compensate with a targeted saturation boost *after* the curve: `filter: saturate(1.14)`. Not before, or you amplify the nebula noise too.
2. **Bloom at `screen` blend washes them towards white.** Cyan `#9CEBFF` screened with its own blur goes to `#C8F4FF` and loses identity. Fix: tint the bloom pass towards the *source* hue rather than white, by adding `saturate(1.35)` inside the bloom filter chain before the blur: `brightness(0.595) contrast(6) saturate(1.35) blur(9px)`.
3. **The cool black lift (§6.1, blue offset 0.022) pulls pink `#FAC4DE` towards lilac.** If the pink reads wrong, drop the blue offset to 0.016 and add the coolness back via the haze overlay (§2.3) which only affects the depth layers, not the foreground cards.

**Never apply a global `hue-rotate`.** A brand's gradient or accent must survive the grade indistinguishably close to spec. Sample it after grading and check each stop is within ΔE 4 of the original (UNVERIFIED tolerance, chosen as a working threshold).

## 6.8 Full stack order (top to bottom)

```
1. Chromatic aberration  (radial mask, 0.6-1.2px)
2. Grain                 (soft-light 0.026-0.085 + screen ×0.35)
3. Vignette              (multiply, 0.52 corners)
4. Halation              (screen, only on hot frames)
5. Tone curve            (feComponentTransfer table)
6. Lift/gamma/gain       (feComponentTransfer gamma)
7. saturate(1.14)
--- scene root ---
8. Bloom wide  (screen 0.30, blur 38px)
9. Bloom tight (screen 0.55, blur 9px)
10. Light shafts (screen, ≤0.13)
11. 3D stage (Camera + layers)
```
Order 5 before 4 in filter-chain terms means the halation reads the *graded* highlights, which is correct: halation happened at the negative, before the print. Getting this backwards makes the halation threshold behave unpredictably.

---

# 7. FRAMING

## 7.1 The crop (computed, exact)

The worked example is 1920x1080 (1.778:1) and its deck slot is ~2.05:1 with `object-fit: cover`. Cover scales to fill width and crops height.

```
visible height = 1920 / 2.05 = 936.6px
crop = (1080 - 936.6) / 2 = 71.7px  top AND bottom
VISIBLE BAND: y ∈ [72, 1008]
```

Reference table for other slot ratios:

| Slot ratio | Kept height | Crop each side | Visible band |
|---|---|---|---|
| 1.85:1 | 1038px | 21px | y ∈ [21, 1059] |
| 2.00:1 | 960px | 60px | y ∈ [60, 1020] |
| **2.05:1** | **937px** | **72px** | **y ∈ [72, 1008]** |
| 2.10:1 | 914px | 83px | y ∈ [83, 997] |
| 2.20:1 | 873px | 104px | y ∈ [104, 976] |
| 2.35:1 | 817px | 131px | y ∈ [131, 949] |
| 2.39:1 | 803px | 138px | y ∈ [138, 942] |

**Design to 2.20:1 (y ∈ [104, 976]) for safety.** That gives 32px of tolerance on each edge if the slot is measured slightly differently or if a browser rounds differently.

## 7.2 Safe areas

EBU R 95 specifies 3.5% action safe and 5% graphics safe on each edge for 16:9 ([EBU R 95](https://tech.ebu.ch/files/live/sites/tech/files/shared/r/r095-2016_2.pdf)). Applied **inside the 2.05:1 crop**, not to the full raster:

```
GRAPHICS SAFE (all text, logos, numbers):  x ∈ [96, 1824]   y ∈ [119, 961]
ACTION SAFE  (any element that must be whole): x ∈ [67, 1853]  y ∈ [104, 976]
DEAD ZONE (guaranteed never seen):         y < 72  or  y > 1008
```

Use the dead zone deliberately: put the light-shaft source, the far-edge nebula, and elements that enter or exit vertically up there. Nothing informational.

## 7.3 Thirds and where the hero line sits

Inside the visible band (y 72→1008, height 937):
```
Upper third line:  y = 384
Lower third line:  y = 696
Vertical centre:   y = 540
"Upper optical" (0.45 of band, where the eye actually rests): y = 493
Left third:        x = 640
Right third:       x = 1280
```

**Hero line placement.** In a 40-second film with no voiceover the text carries the argument, so it must be findable in under 200ms.
- The **primary claim line** (one line, the display face, weight 600-700, 76-92px, tracking -0.02em) sits with its **baseline on y = 696** (lower third). Not centred. Centred text in a 2.05:1 letterbox reads as a title card, and title cards read as filler.
- The **subline** (the text face at 400, 26-30px, tracking 0.01em, opacity 0.62) sits 34px below, baseline y = 730.
- The **hero UI element** occupies the upper-left or upper-right quadrant, its optical centre at (x=640 or 1280, y=430).

Exception: the **endcard only** is centred, on x = 960 with the logo optical centre at y = 470 (slightly above the band centre of 540, because a logo centred by geometry reads as low).

## 7.4 Thirds versus centre

| Shot | Composition |
|---|---|
| Cold open | Centre. One point of light on x=960, y=493. Symmetry establishes the world |
| The subject card | Right third, x=1280. Text left, in the negative space |
| Detail inserts (85mm) | Centre-weighted. Long lenses flatten, and thirds on a flat frame look arbitrary |
| The scale reveal | Centre, with radial symmetry. Scale needs symmetry to read as scale |
| The turning moment | Left third x=640, so the eye travels right into empty frame, which is where the next shot's subject arrives |
| Endcard | Dead centre, both axes near-optical |

**Screen-direction continuity.** Once the story has a direction (left to right), every element that represents progress moves left to right and every element that represents a problem moves right to left. This is free and it is the difference between a sequence and a slideshow.

## 7.5 Negative space discipline

- **Minimum 42% of the visible band empty** on every frame except the scale-reveal shot. Empty means void or nebula, no UI, no text.
- **The hero element never exceeds 46% of visible frame area.** At 1920x937 that is 842,000px², so a card larger than roughly 1120x750 is too big.
- **One focal point per frame.** If two elements are within 12% of each other in both area and luminance, one of them must be blurred (§2.4) or dimmed to <0.55 opacity.
- **Margin between the hero element and the graphics-safe edge: 72px minimum.** Elements that touch the safe-area boundary read as cropped by accident.
- **Never place a bright element in the top or bottom 130px of the visible band.** The vignette is at 0.30-0.52 there, so it will be dimmed and look like a mistake, and it is also the region most at risk if the crop ratio moves.

## 7.6 Type in motion

- A variable display face for the claim lines, weight animated 500→700 over 12 frames on entrance (a variable-font weight ramp is a motion device almost nobody uses and it looks expensive; check first that the face's cap height holds across the weight axis, `typography-motion.md` section 2).
- Never animate `letter-spacing` and `opacity` together on the same element; pick one. Tracking-in from 0.06em to -0.02em over 16 frames with `Easing.bezier(0.16,1,0.3,1)` while opacity is already at 1 is stronger than a fade.
- Per-character stagger: **1.5 frames per character** (25ms), capped at 18 frames total for the whole line. A line longer than 12 characters must stagger by word, not character.
- Text must never be blurred by the DOF pass. Keep all copy at `Z.SUBJECT` (z=0).

---

# 8. Render and verification commands

```bash
# Render and master with the kit (same commands on Windows, macOS and Linux)
npm run render -- <id>     # out/<id>/raw.mp4: CRF 12, BT.709, PNG frames, the doctor's --gl
npm run master -- <id>     # out/<id>/<id>.mp4: -16 LUFS with dynamics kept, BT.709 tags re-applied
npm run audit -- <id>      # the calibrated bands in SKILL.md section 9, JSON to out/<id>/audit.json

# The worked example's extra luminance checks, run on the master with ffmpeg
ffmpeg -i out/<id>/<id>.mp4 -vf "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=qa_yavg.txt" -f null -
ffmpeg -i out/<id>/<id>.mp4 -vf "signalstats,metadata=print:key=lavfi.signalstats.YMAX:file=qa_ymax.txt" -f null -
ffmpeg -i out/<id>/<id>.mp4 -vf "freezedetect=n=0.003:d=0.25,metadata=mode=print" -f null - 2> qa_freeze.txt
ffmpeg -i out/<id>/<id>.mp4 -vf "scdet=threshold=8,metadata=mode=print" -f null - 2> qa_cuts.txt
```

The worked example's pass criteria (floors and a cut band written for that dark 40 s film; the
kit's general gate is the band table in `SKILL.md` section 9):
```
mean(YAVG)/255           >= 0.15  (target 0.15-0.18)
max(frame YAVG)/255      >= 0.34
min(frame YAVG)/255      >= 0.05
count(YMAX >= 250)/N     >= 0.85
count(YAVG/255 > 0.25)   >= 360 frames
freeze events            == 0
scdet detections         >= 24 and <= 30
```

Note: `-color_range tv` means Y′ is stored 16-235. If you compute percentages as `YAVG/255` on a tv-range file, everything shifts up by ~6.3%. **Either encode `-color_range pc` for QA or normalise: `pct = (YAVG - 16) / 219`.** State which one you used. The failed cut's 7.5% and 14.7% figures are almost certainly raw `YAVG/255`, so use raw `YAVG/255` for the comparison and normalise separately if you want the true photometric number.

---

# 9. Things marked UNVERIFIED

- The exact aperture constant `C = 69,300 px²` corresponds to some real f-stop at 50mm. I tuned it to give 6px blur at z=-800 and 3.4px at z=-400. The f-stop equivalence is **UNVERIFIED**.
- "Real whip pans exceed ~200 deg/s" is a working threshold I chose; I found no published number. **UNVERIFIED**.
- Apple's internal shot-length and hold conventions are not published; I searched and found nothing authoritative. The 1.4-1.7s ASL target is derived from the general Cinemetrics 2.5s film ASL adjusted down for product films. **UNVERIFIED as an Apple-specific figure.**
- ΔE 4 as the acceptable drift for brand gradient stops after grading is a working tolerance, not a cited standard. **UNVERIFIED**.
- The film-wide mean luminance target of 15-18% is derived from my own coverage model (§5.3) plus the requirement to beat the failed cut's 7.5% by a clear margin. I did not measure a reference Apple/Linear/Stripe film to confirm that 15-18% is where premium dark films actually sit. **UNVERIFIED against a real reference.** If a reference film is available on disk, measure it with the `signalstats` command above and re-anchor.
- `mix-blend-mode: plus-lighter` is Chrome 111+; I did not verify the exact Chromium version Remotion 5 ships. Keep `screen` as a fallback. **UNVERIFIED for this Remotion version.**

---

## Sources
- [Remotion: Easing](https://www.remotion.dev/docs/easing) · [interpolate()](https://www.remotion.dev/docs/interpolate) · [Sequence](https://www.remotion.dev/docs/sequence) · [random()](https://www.remotion.dev/docs/random) · [transitions](https://www.remotion.dev/docs/transitions/) · [accelerated video / speed ramp](https://www.remotion.dev/docs/miscellaneous/snippets/accelerated-video) · [GPU](https://www.remotion.dev/docs/gpu) · [gl-options](https://www.remotion.dev/docs/gl-options) · [performance](https://www.remotion.dev/docs/performance) · [CameraMotionBlur source](https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/motion-blur/src/CameraMotionBlur.tsx)
- [MDN: perspective](https://developer.mozilla.org/en-US/docs/Web/CSS/perspective) · [transform-style](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style) · [feComponentTransfer](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feComponentTransfer) · [feTurbulence](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feTurbulence)
- [CSS perspective from focal length (gist)](https://gist.github.com/turbodrive/dede2748fadb7e8dfb13) · [DeSandro, Intro to CSS 3D transforms](https://3dtransforms.desandro.com/perspective)
- [FFmpeg signalstats](https://ayosec.github.io/ffmpeg-filters-docs/8.0/Filters/Video/signalstats.html) · [scdet](https://ayosec.github.io/ffmpeg-filters-docs/8.0/Filters/Video/scdet.html) · [freezedetect](https://ayosec.github.io/ffmpeg-filters-docs/8.0/Filters/Video/freezedetect.html) · [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html)
- [Material Design 3 easing and duration tokens](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs) · [easings.net](https://easings.net/) · [easings-css](https://www.npmjs.com/package/easings-css)
- [Unreal Engine: Bloom](https://dev.epicgames.com/documentation/unreal-engine/bloom-in-unreal-engine?lang=en-US) · [Froyok: custom bloom in UE4](https://www.froyok.fr/blog/2021-12-ue4-custom-bloom/)
- [Dehancer: halation](https://blog.dehancer.com/articles/halation/) · [Color Finale: film emulation part 2, halation](https://colorfinale.com/blog/post/cf-halation-11-24)
- [Boris FX: chromatic aberration in After Effects](https://borisfx.com/blog/create-chromatic-aberration-in-after-effects/) · [ProVideo Coalition: chromatic aberration](https://www.provideocoalition.com/chromatic-aberration-fix/)
- [Video Milkshake: film grain rules](https://www.videomilkshake.com/blogs/news/film-grain-overlays-in-video-editing) · [WeVideo: film grain overlays](https://www.wevideo.com/blog/film-grain-overlay) · [Cine Source: film grain](https://cinesource.nl/what-is-film-grain-add-to-video/)
- [No Film School: whip pan](https://nofilmschool.com/how-to-do-a-whip-pan) · [Plotwit: invisible editing](https://plotwit.com/invisible-editing-techniques/) · [wolfcrow: zoom vs dolly](https://wolfcrow.com/zoom-shot-dolly-shot-or-the-dolly-zoom-shot-when-to-use-which/) · [Beverly Boy: dolly zoom vs zoom](https://beverlyboy.com/film-technology/zoom-smart-a-filmmakers-guide-to-dolly-zooms-vs-traditional-zooms/)
- [EBU R 95: safe areas for 16:9](https://tech.ebu.ch/files/live/sites/tech/files/shared/r/r095-2016_2.pdf)
- [Cinemetrics / Barry Salt ASL data via StoryAlity](https://storyality.wordpress.com/2013/08/23/storyality-71b-cinemetrics/) · [Barry Salt database](https://cinemetrics.uchicago.edu/barry-salt-database)
- [Pure CSS light rays](https://codepen.io/fabiovergani/pen/yLOORex) · [conic-gradient rays of light](https://codepen.io/yisi/pen/jmEGRB) · [SVG blend modes reference](https://oreillymedia.github.io/Using_SVG/guide/blend-modes.html)
- [Aerial perspective](https://grokipedia.com/page/Aerial_perspective) · [D5 Render: atmospheric perspective](https://www.d5render.com/posts/atmospheric-perspective-for-aerial-rendering)
