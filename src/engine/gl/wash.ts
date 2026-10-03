// Example shader: a slow colour wash. Domain-warped fbm decides where the light colour shows
// through the dark one, a soft pool of light sits low on the left, and the whole thing drifts so
// slowly that a held frame still reads as held. A starting point to change, not a finished look.
//
// Uniforms (pass linear colours: srgbToLinear in src/engine/color.ts converts a hex):
//   u_low    the shadow colour            u_high   the light colour
//   u_light  exposure, about 0.6 to 1.4   u_flare  extra light in the pool, 0 normally, up on a hit
//   u_drift  how fast the pattern moves (0.05 is calm, 0.2 is weather)
//   u_clock  the wash's own time in seconds. Pass the frame's time to keep it moving, or a clock
//            that slows to a stop so a held frame really holds (raw time can never stop).

export const WASH_FRAG = /* glsl */ `
uniform vec3 u_low;
uniform vec3 u_high;
uniform float u_light;
uniform float u_flare;
uniform float u_drift;
uniform float u_clock;

vec4 shade(vec2 uv, vec2 px) {
  vec2 p = (px - 0.5 * u_resolution) / u_resolution.y; // centred, aspect-correct
  float t = u_clock * u_drift;
  float n = warped(vec3(p * 1.15, t), 5) * 0.5 + 0.5;
  float pool = exp(-length(p - vec2(-0.42, -0.30)) * 1.7);
  vec3 col = mix(u_low, u_high, smoothstep(0.30, 0.95, n) * (0.35 + 0.65 * pool));
  col *= u_light * (0.75 + 0.5 * pool);
  col += u_high * u_flare * pool;
  col *= vignette(uv, 0.45);
  // Khronos Neutral holds the hues you chose; agx() is the moodier alternative.
  col = toSRGB(neutral(col));
  // a static dither: it stops banding without making a held frame shimmer
  return vec4(dither(col, px, 0.0), 1.0);
}
`;
