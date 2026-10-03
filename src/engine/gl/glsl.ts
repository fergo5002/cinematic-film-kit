// Helpers prepended to every ShaderCanvas fragment. Licences matter in a commercial film:
// Shadertoy defaults to CC BY-NC-SA, Inigo Quilez's shaders carry no licence, Lygia is
// Prosperity (non-commercial), The Book of Shaders is all rights reserved. Learn from them, write
// your own. Everything here is either standard published maths or MIT/Apache code, attributed.

export const GLSL_COMMON = /* glsl */ `
#define PI 3.14159265359
#define TAU 6.28318530718

// ---- hashing: "Hash without Sine", Dave Hoskins (MIT). Stable on ANGLE/D3D, no sin() precision drift ----
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

// ---- value noise 3D with quintic fade ----
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1, 0, 0));
  float n010 = hash13(i + vec3(0, 1, 0));
  float n110 = hash13(i + vec3(1, 1, 0));
  float n001 = hash13(i + vec3(0, 0, 1));
  float n101 = hash13(i + vec3(1, 0, 1));
  float n011 = hash13(i + vec3(0, 1, 1));
  float n111 = hash13(i + vec3(1, 1, 1));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z) * 2.0 - 1.0;
}

// ---- fBM with a rotation between octaves (kills grid alignment) ----
const mat3 OCT = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
float fbm(vec3 p, int octaves) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    s += a * vnoise(p);
    p = OCT * p * 2.02;
    a *= 0.5;
  }
  return s;
}

// ---- domain warp: the difference between "noise" and "smoke" ----
float warped(vec3 p, int octaves) {
  vec3 q = vec3(fbm(p, 4), fbm(p + vec3(5.2, 1.3, 2.8), 4), 0.0);
  return fbm(p + 1.7 * q, octaves);
}

// ---- tone mapping: never ship a linear clamp ----
// AgX (three.js r186, MIT; Filament/Blender lineage): holds hue in highlights. Default for mood.
const mat3 LIN_REC2020_TO_SRGB = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
const mat3 LIN_SRGB_TO_REC2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
vec3 agxContrast(vec3 x) {
  vec3 x2 = x * x; vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agx(vec3 color) {
  const mat3 inset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
  const mat3 outset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
  const float minEv = -12.47393, maxEv = 4.026069;
  color = inset * (LIN_SRGB_TO_REC2020 * color);
  color = clamp((log2(max(color, 1e-10)) - minEv) / (maxEv - minEv), 0.0, 1.0);
  color = outset * agxContrast(color);
  color = pow(max(vec3(0.0), color), vec3(2.2));
  return clamp(LIN_REC2020_TO_SRGB * color, 0.0, 1.0);
}
// Khronos PBR Neutral (Apache-2.0): 1:1 below the knee, no hue shift. Use when brand colours must hold.
vec3 neutral(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
// ACES fit (Narkowicz 2015): contrasty, darkens and shifts hue (oranges and golds drift). Use knowingly.
vec3 acesFilm(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
// exact sRGB transfer, not pow(1/2.2): matches what the browser and the encoder assume
vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// ---- anti-banding: triangular-PDF dither in [-1, 1) LSB, the very last op before 8-bit (Gjol) ----
float ign(vec2 px) { return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715)))); }
vec3 dither(vec3 c, vec2 px, float frame) {
  float r1 = hash13(vec3(px, frame));
  float r2 = hash13(vec3(px + 17.31, frame + 3.7));
  return c + (r1 + r2 - 1.0) / 255.0;
}

// ---- film grain, deterministic per frame; luminance-aware so it lives in the midtones ----
float grain(vec2 px, float frame) { return hash13(vec3(px, mod(frame, 997.0))) - 0.5; }
vec3 addGrain(vec3 c, vec2 px, float frame, float amount) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float w = 4.0 * l * (1.0 - l); // peaks in midtones, fades at black and white
  return c + grain(px, frame) * amount * (0.35 + 0.65 * w);
}

// ---- lens: elliptical vignette ----
float vignette(vec2 uv, float strength) {
  vec2 d = uv - 0.5;
  d.x *= 0.85;
  return 1.0 - strength * smoothstep(0.25, 0.75, length(d) * 1.2);
}
`;
