# PURE-JS DSP COOKBOOK, 40s CINEMATIC-ELECTRONIC SCORE + SFX
### Worked example: a 40 s product film · 48 kHz · 120 BPM · 60 fps · 1 beat = 30 frames · 20 bars of 4/4 · D minor → F major lift

Everything here is written for an offline score generator of a common shape: `Float64Array` L/R
accumulators, a `place(sample, frame, gainDb, pan)` helper, RBJ biquads (`biquadCoefs()/filt()`),
a seeded PRNG, a beatmap import, and a RIFF writer at the bottom. The kit's `audio/dsp.mjs` and the
starter film's `score.mjs` are where it goes; check what they already provide before adding. Every
number below is either derived, computed, or cited. Anything I could not verify is marked
**UNVERIFIED**.

The engine this was written to fix had four defects worth knowing about, because each is easy to
repeat: no reverb anywhere; a linear pan law that made every centred source 3.01 dB hot (§7.1); a
peak-normalise in JS followed by a single-pass `loudnorm`, two gain stages fighting each other
(LRA 2.8 LU); and 16-bit output with the quietest layer at -50 dBFS, undithered (§1.5). The rule
that follows: **the JS render never normalises.** Leave the sum peaking at -4.0 dBFS and let the
master (`npm run master -- <id>`) make the only gain move in the chain.

---

## 1. FOUNDATIONS

### 1.1 Timebase (exact)

```js
const SR   = 48000;
const FPS  = 60;
const BPM  = 120;
const SPB  = 30;                 // frames per beat  (60·60/120)
const DUR_F = 2400;              // 40.000 s hard cap
const N     = DUR_F / FPS * SR;  // 1_920_000 samples exactly
const TAIL  = 3 * SR;            // internal overrun, discarded before write
const NBUF  = N + TAIL;          // 2_064_000

const f2s = (f) => f / FPS;                    // frame -> seconds
const f2n = (f) => Math.round(f / FPS * SR);   // frame -> sample  (exactly f*800)
const bar = (b) => (b - 1) * 120;              // bar number (1-based) -> frame
const beat= (b) => Math.round(b * SPB);        // beat index (0-based) -> frame
```

**1 frame = 800 samples exactly. 1 beat = 24 000 samples exactly. 1 bar = 96 000 samples exactly.**
No rounding error anywhere in the grid. This is why 48 kHz / 60 fps / 120 BPM is the right lock.

### 1.2 Bus graph and render order (fixed, do not reorder)

```
VOICES ──┬─► SUB      (mono, <120 Hz, no reverb, no width)
         ├─► DRUMS    (impacts, kick, hat, clap; short-bus send only)
         ├─► MUSIC    (pad, arp, bass, lead, plucks; hall + short send)
         ├─► AIR      (risers, whooshes, shimmer, ticks; hall send, wide)
         └─► UI       (dry ticks/clicks; short-bus send only)

order of operations, per bus:
  1. voice synthesis into bus L/R (constant-power pan)         §7.1
  2. bus sends -> HALL FDN-8 and SHORT FDN-4 (accumulated)     §2
  3. hall/short returns mixed back into MUSIC + AIR            §2.5
  4. sidechain duck applied to MUSIC and AIR (post-return)     §4
  5. per-bus saturation (4x oversampled)                       §6.3
  6. per-bus compression                                       §6.4
  7. SUM = SUB + DRUMS + MUSIC + AIR + UI
  8. bass-mono below 120 Hz on the SUM                         §7.3
  9. master glue compressor (<=2 dB GR)                         §6.4
 10. master asymmetric saturator (4x OS, k=1.06)               §6.3
 11. master trim so PEAK = -4.0 dBFS  (measure, then set once)
 12. 300 ms raised-cosine fade at 39.700 -> 40.000 s
 13. truncate to N samples, write 32-bit float WAV
 14. the master: npm run master -- <id>                       §10
```

### 1.3 Filter primitives (alongside a standard RBJ biquad, `biquadCoefs`/`filt`)

**One-pole lowpass** (used for reverb damping and envelope smoothing):
```js
// coefficient for a given -3 dB cutoff fc:  d = exp(-2*PI*fc/SR)
// y[n] = (1-d)*x[n] + d*y[n-1]
const onepoleD = (fc) => Math.exp(-2 * Math.PI * fc / SR);
```
Verified inverse (computed): `d=0.18→13100 Hz`, `0.24→10902`, `0.32→8705`, `0.42→6627`, `0.55→4567`.

**Linkwitz-Riley 4th order** = two identical Butterworth 2nd-order biquads (Q = 1/√2 = 0.7071106…)
in series. LP and HP branches sum flat (allpass) with the HP inverted at even orders, at 4th order
they sum in phase, no inversion needed. Use for the bass-mono split (§7.3) and the multiband
sidechain (§4.4).
```js
const LR4 = (buf, type, fc) => filt(filt(buf, type, fc, Math.SQRT1_2), type, fc, Math.SQRT1_2);
```

**Interpolated delay line** (needed everywhere, reverb modulation, Haas, chorus, doppler):
```js
function DelayLine(maxSamples) {
  const b = new Float64Array(maxSamples); let w = 0;
  return {
    push(x) { b[w] = x; w = (w + 1) % maxSamples; },
    // d = delay in samples, fractional, linear interpolation
    read(d) {
      let r = w - 1 - d;
      while (r < 0) r += maxSamples;
      const i = Math.floor(r), fr = r - i;
      const a = b[i], c = b[(i + 1) % maxSamples];
      return a + (c - a) * fr;
    },
  };
}
```
Linear interpolation loses HF as the fractional part approaches 0.5 (−3.9 dB at Nyquist worst case,
0 dB at integer). For reverb modulation of ±3 samples this is inaudible and is exactly the gentle
HF wobble a real hall has. Do **not** use it for the Haas delay (§7.2), use integer delays there.

### 1.4 Deterministic noise

Keep the beatmap's own seeded PRNG for anything the picture also reads, changing it would change
every frame of the render. For **audio-rate** noise use mulberry32, which has a full 2^32 period with
well-mixed low bits:
```js
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// one generator PER LAYER, with a documented seed, so a layer can be re-rolled alone:
const SEEDS = { air:0x5EED01, kickL:0x5EED02, kickR:0x5EED03, hatL:0x5EED04, hatR:0x5EED05,
                riser:0x5EED06, whoosh:0x5EED07, room:0x5EED08, irL:0x5EED09, irR:0x5EED0A };
```
**Stereo decorrelation rule:** any noise layer that is meant to be wide gets *two different seeds*
(L and R). Any noise layer that is meant to be a point source (a kick transient, a UI tick) gets
**one** seed used for both channels.

**Pink noise**, Paul Kellett's refined filter method (musicdsp.org, public domain; the constants
are the canonical published set):
```js
function pinkGen(rnd) {
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
  return () => {
    const w = rnd() * 2 - 1;
    b0 = 0.99886*b0 + w*0.0555179;
    b1 = 0.99332*b1 + w*0.0750759;
    b2 = 0.96900*b2 + w*0.1538520;
    b3 = 0.86650*b3 + w*0.3104856;
    b4 = 0.55000*b4 + w*0.5329522;
    b5 = -0.7616*b5 - w*0.0168980;
    const p = (b0+b1+b2+b3+b4+b5+b6 + w*0.5362) * 0.11;
    b6 = w * 0.115926;
    return p;
  };
}
```

### 1.5 32-bit float WAV writer

WAVE_FORMAT_IEEE_FLOAT = 3. Strictly correct file needs `fmt ` of size 18 (cbSize=0) plus a `fact`
chunk. ffmpeg accepts both, but write it properly.

```js
function writeWavF32(path, L, R, n) {
  const dataBytes = n * 8;                       // 2 ch * 4 bytes
  const hdr = Buffer.alloc(12 + 8 + 18 + 8 + 4 + 8);
  let o = 0;
  hdr.write('RIFF', o); o += 4;
  hdr.writeUInt32LE(hdr.length - 8 + dataBytes, o); o += 4;
  hdr.write('WAVE', o); o += 4;
  hdr.write('fmt ', o); o += 4;
  hdr.writeUInt32LE(18, o); o += 4;              // fmt chunk size
  hdr.writeUInt16LE(3, o); o += 2;               // IEEE float
  hdr.writeUInt16LE(2, o); o += 2;               // channels
  hdr.writeUInt32LE(SR, o); o += 4;
  hdr.writeUInt32LE(SR * 8, o); o += 4;          // byte rate
  hdr.writeUInt16LE(8, o); o += 2;               // block align
  hdr.writeUInt16LE(32, o); o += 2;              // bits
  hdr.writeUInt16LE(0, o); o += 2;               // cbSize
  hdr.write('fact', o); o += 4;
  hdr.writeUInt32LE(4, o); o += 4;
  hdr.writeUInt32LE(n, o); o += 4;               // sample frames
  hdr.write('data', o); o += 4;
  hdr.writeUInt32LE(dataBytes, o); o += 4;
  const pcm = Buffer.alloc(dataBytes);
  for (let i = 0; i < n; i++) { pcm.writeFloatLE(L[i], i*8); pcm.writeFloatLE(R[i], i*8+4); }
  writeFileSync(path, Buffer.concat([hdr, pcm]));
}
```
Float WAV has no clipping point in the file itself. That is fine, step 11 of §1.2 guarantees
−4.0 dBFS peak before it is written.

---

## 2. REVERB

Two buses. **Both are FDNs**, not Schroeder chains, because a Schroeder/Freeverb comb bank is
static and the metallic ring is exactly the "cheap" tell we are trying to avoid.

### 2.1 Why FDN over convolution here

- FDN-8: 8 delay reads + 8 writes + one 8-point fast Walsh-Hadamard (24 add/sub) per sample.
  ≈ 1.92 M samples × ~60 flops = 115 Mflop, **well under 1 s in Node**.
- Partitioned FFT convolution with a 2.6 s IR: IR = 124 800 samples → 16 partitions of 8192,
  FFT size 16384. 235 input blocks × 16 partitions × 16384 complex MACs × 2 ch ≈ **1.2 × 10^8
  complex MACs**, roughly 4 to 8 s in Node. Viable but slower, and a static IR cannot modulate.
- **Decision: FDN-8 for the hall, FDN-4 for the short bus. FFT convolution only for the one
  hero "bloom" in §2.7 (optional).**

### 2.2 Hall FDN-8, exact constants

Delay lengths (all verified prime by trial division; mutually prime by construction; span 1 : 2.52
which gives dense modes without flutter):

```
M = [1237, 1381, 1607, 1913, 2153, 2411, 2749, 3121]   samples @ 48 kHz
  =  25.77  28.77  33.48  39.85  44.85  50.23  57.27  65.02   ms
mean = 43.16 ms   (a 43 ms mean free path ≈ a room of roughly 4 300 m^3; large scoring-stage scale)
```

Feedback gain per line, Jot's formula `g_i = 10^(-3·M_i / (T60·SR))`
(verified: dsprelated/CCRMA "FDN Reverberation" gives `20·log10|H_i| = -60·M_i·T/t60(ω)`, and the
Γi = 10^(−3 m_i / (T60 fs)) form appears in the FDN literature). Computed:

| T60set | g0 (1237) | g1 (1381) | g2 (1607) | g3 (1913) | g4 (2153) | g5 (2411) | g6 (2749) | g7 (3121) |
|---|---|---|---|---|---|---|---|---|
| **2.20** | 0.922270 | 0.913623 | 0.900216 | 0.882375 | 0.868631 | 0.854094 | 0.835417 | 0.815333 |
| **2.68** | 0.935733 | 0.928526 | 0.917325 | 0.902375 | 0.890820 | 0.878564 | 0.862762 | 0.845698 |
| **3.17** | 0.945390 | 0.939230 | 0.929643 | 0.916818 | 0.906883 | 0.896323 | 0.882674 | 0.867893 |

> **CALIBRATION, I built the FDN and measured it. Do not skip this.**
> The Jot gain sets the loss *in the delay lines only*. The damping one-pole adds its own loss on
> top, so the **measured** T60 lands at ≈ **82 % of the set value**. Measured with a unit impulse,
> 30 ms sliding RMS, −60 dB from the RMS peak:
>
> | `t60` param | damp | **measured T60** | impulse peak |
> |---|---|---|---|
> | 2.20 | 0.32 | **1.81 s** | 0.177 |
> | 2.68 | 0.32 | **2.18 s** | 0.180 |
> | 3.17 | 0.24 | **2.58 s** | 0.203 |
> | 3.40 | 0.32 | 2.74 s | 0.183 |
>
> **So: to hit the worked example's 1.8 to 2.6 s tail, set `t60 = 2.20` for bars 1 to 14 (→1.81 s measured) and
> `t60 = 3.17, damp = 0.24` from frame 1680 (→2.58 s measured).** Interpolate `g` over 200 ms at
> the switch to avoid a zipper. Tail RMS at 7 s is ~7e−10 in every case, so the FDN is
> unconditionally stable and never blows up. Rule of thumb: `t60_param = target / 0.82`.

Damping (one-pole LP inside each feedback path, `y = (1−d)x + d·y₁`):
```
d = 0.32  ->  fc = 8705 Hz    // hall default: HF decays ~2x faster than LF, like a real room
d = 0.42  ->  fc = 6627 Hz    // bars 1-2 and the silence: darker, further away
d = 0.24  ->  fc = 10902 Hz   // the hero bloom: brighter, closer
```
The damping filter multiplies the effective decay; with d=0.32 the HF T60 lands near 55 to 60 % of the
LF T60, which is the standard hall ratio. **UNVERIFIED** as an exact figure, measure by rendering
an impulse and running `ffmpeg -af ebur128` per octave band if you want it precise; by ear it is right.

Feedback matrix: **8×8 normalised Hadamard**, implemented as a 3-stage fast Walsh-Hadamard transform
then scaled by 1/√8. This is orthogonal (lossless), maximally mixing, and costs 24 add/subs:
```js
function fwht8(v) {                       // in-place, v.length === 8
  for (let len = 1; len < 8; len <<= 1)
    for (let i = 0; i < 8; i += len << 1)
      for (let j = i; j < i + len; j++) {
        const a = v[j], b = v[j + len];
        v[j] = a + b; v[j + len] = a - b;
      }
  const s = 0.3535533905932738;           // 1/sqrt(8)
  for (let i = 0; i < 8; i++) v[i] *= s;
}
```
(4×4 alternatives if you want a smaller/rougher room, both verified from dsprelated PASP
"FDN Reverberation": Householder `A4 = ½·[[1,−1,−1,−1],[−1,1,−1,−1],[−1,−1,1,−1],[−1,−1,−1,1]]`;
Hadamard `H4 = (1/√2)·[[1,1,1,1],[−1,1,−1,1],[−1,−1,1,1],[1,−1,−1,1]]`.)

Modulation, this is what stops it sounding like a plugin preset from 1997. Each line's read
position wobbles by ±`dep_i` samples at an incommensurate rate:
```
rate_i (Hz)  = [0.113, 0.171, 0.229, 0.293, 0.359, 0.431, 0.499, 0.571]   // all prime-ish ratios
depth_i (smp)= [2.6,   3.1,   2.2,   3.6,   2.9,   3.9,   2.4,   3.3  ]
phase_i      = [0, 0.61, 1.23, 1.84, 2.46, 3.07, 3.69, 4.30]  rad        // i * 2*PI/8 * 0.78
```
±3 samples at 48 kHz = ±62.5 µs = ±0.006 % pitch. Inaudible as vibrato, decisive on ringing.

Pre-delay: **1152 samples = 24.0 ms** on the hall input. This is the gap that keeps the dry
transient readable; skip it and every impact turns to mush.

Input diffusion, 4 series Schroeder allpasses before the FDN, g = 0.70, prime delays
`[269, 383, 577, 811]` (5.60 / 7.98 / 12.02 / 16.90 ms). Allpass:
```js
// y = -g*x + z ;  push(x + g*y)   where z = delayed value
function allpass(dl, x, D, g) { const z = dl.read(D); const y = -g * x + z; dl.push(x + g * y); return y; }
```
Run **different** diffuser delays for L and R (`[269,383,577,811]` / `[281,397,593,829]`, all prime)
so the two channels are decorrelated from the very first reflection.

### 2.3 Hall, full implementation

```js
function makeFDN8(opt) {
  const M = [1237,1381,1607,1913,2153,2411,2749,3121];
  const RATE = [0.113,0.171,0.229,0.293,0.359,0.431,0.499,0.571];
  const DEP  = [2.6,3.1,2.2,3.6,2.9,3.9,2.4,3.3];
  const lines = M.map(m => DelayLine(m + 16));
  const lp = new Float64Array(8);
  const v = new Float64Array(8);
  let g = M.map(m => Math.pow(10, -3 * m / (opt.t60 * SR)));
  const d = opt.damp;                       // 0.32
  // output taps: alternating signs, first half -> L, second half -> R
  const oL = [1, -1, 1, -1, 0.35, -0.35, 0.35, -0.35];
  const oR = [0.35, -0.35, 0.35, -0.35, -1, 1, -1, 1];
  let n = 0;
  return {
    setT60(t) { g = M.map(m => Math.pow(10, -3 * m / (t * SR))); },
    // x = mono (or pre-summed) input already through pre-delay + diffusers
    tick(x) {
      const t = n / SR;
      for (let i = 0; i < 8; i++) {
        const mod = DEP[i] * Math.sin(2*Math.PI*RATE[i]*t + i*0.7854);
        let y = lines[i].read(M[i] + mod);
        lp[i] = (1 - d) * y + d * lp[i];      // damping
        v[i] = lp[i] * g[i];
      }
      let L = 0, R = 0;
      for (let i = 0; i < 8; i++) { L += v[i] * oL[i]; R += v[i] * oR[i]; }
      fwht8(v);
      for (let i = 0; i < 8; i++) lines[i].push(x + v[i]);
      n++;
      return [L * 0.44, R * 0.44];
    },
  };
}
```
`0.44` is the return trim that puts a unit impulse in at roughly unity RMS out, measure once and
lock it.

**Stability check you must run:** feed a single 1.0 impulse, render 6 s, assert
`max(|out|) < 4.0` and that `RMS(last 0.5 s) < RMS(first 0.5 s) * 1e-3`. If the FWHT scaling is
wrong the FDN will not diverge dramatically, it will just decay wrong, so measure the actual T60
from the impulse: find the sample where the running 20 ms RMS first drops 60 dB below its peak.
Target 2.20 s ± 0.15 s.

### 2.4 Short bus, 60 to 80 ms glue

FDN-4, same code with N=4 and a Householder 4×4 (or just reuse `fwht` at N=4, scale 1/2).

```
M_short = [331, 479, 619, 823]  samples = 6.90 / 9.98 / 12.90 / 17.15 ms   (all prime)
matrix  = Householder 4x4:  y_i = v_i - 0.5*(v0+v1+v2+v3)      // == I - (2/4)*ones, verified orthogonal
damping d = 0.20  (fc = 12 300 Hz, keep it bright, it is glue not space)
pre-delay = 0, no modulation (too short to ring; modulation would only smear the transient)
output trim = 0.5
```
**Same calibration problem, opposite sign.** Measured (unit impulse, 30 ms RMS, −60 dB):

| `t60` param | **measured T60** | g_i = [331, 479, 619, 823] |
|---|---|---|
| 0.048 | **67.4 ms** | 0.37069 · 0.23785 · 0.15632 · 0.08480 |
| **0.055** | **73.9 ms** | 0.42059 · 0.28555 · 0.19797 · 0.11608 |
| 0.062 | 78.2 ms |, |

**Use `t60 = 0.055` → 74 ms measured, dead centre of a 60 to 80 ms target.** (Setting 0.070 gives
84 ms, which is past the window and starts sounding like a room instead of glue.)
This bus is what makes 30 unrelated UI ticks sound like they happened in the same room. Send
**every** dry percussive element to it at −11 dB and never solo it, if you can hear it, it is
too loud.

### 2.5 Send levels (dB, pre-fader, per element)

| element | → HALL | → SHORT | notes |
|---|---|---|---|
| Sub / bass < 120 Hz | −∞ | −∞ | never. Reverb on sub = mud. |
| Kick / impact body | −∞ | −14 | body only, HP the send at 180 Hz |
| Impact air layer | −7 | −∞ | this is where the size comes from |
| Hat / clap | −18 | −9 | |
| UI ticks | −24 | −11 | |
| Pad | −9 | −∞ | |
| Arp / pluck | −13 | −16 | |
| Lead saw | −11 | −∞ | |
| Riser / whoosh | −6 | −∞ | |
| Shimmer | −3 | −∞ | shimmer *is* mostly reverb |

Sends are **pre-sidechain**; the returns are **post-sidechain** (§4). That is the ordering that
makes the tail pump, which is 80 % of "produced".

### 2.6 Reverse-reverb pre-hit (the sound that sells the hero)

No FFT needed:
```js
function reverseReverb(sourceMono, tailSec, hall) {
  const n = Math.floor(tailSec * SR);
  const wet = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = i < sourceMono.length ? sourceMono[i] : 0;
    const [l, r] = hall.tick(x);
    wet[i] = (l + r) * 0.5;
  }
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = i / n;                        // 0 -> 1 across the reversed tail
    out[i] = wet[n - 1 - i] * Math.pow(p, 2.2);   // fade-in curve, exponent 2.2
  }
  // hard gate the last 33.3 ms (2 frames) so it ends in true silence
  const gate = Math.round(0.0333 * SR);
  for (let i = 0; i < gate; i++) {
    const w = 0.5 - 0.5 * Math.cos(Math.PI * (i / gate)); // raised cosine, 1->0
    out[n - gate + i] *= (1 - w);
  }
  return out;
}
// place so its LAST sample sits at hitFrame - 2 frames:
place(rev, HERO_FRAME - 2 - Math.round(rev.length / (SR / FPS)), -13);
```
Use a **fresh** hall instance for this (`t60: 2.6, damp: 0.24`) so it does not eat the main hall's
state. `tailSec = 1.60` for the hero.

### 2.7 (Optional) FFT convolution against a synthesised IR

Only worth it for the hero bloom, where you want a shaped, multi-band, non-exponential tail.

**IR synthesis** (2.6 s, stereo, separate seeds):
```js
// decay to -60 dB in T60 :  a(t) = exp(-6.907755 * t / T60)     [ln(1000)=6.907755]
function synthIR(T60band, seed) {
  const n = Math.ceil(2.8 * SR);
  const bands = [
    { f: 200,  type:'lp', t60: 3.20, g: 0.85 },
    { f: 1000, type:'bp', t60: 2.60, g: 1.00, q: 0.9 },
    { f: 4000, type:'bp', t60: 1.90, g: 0.78, q: 0.9 },
    { f: 9000, type:'hp', t60: 1.10, g: 0.55 },
  ];
  const rnd = mulberry32(seed), out = new Float64Array(n);
  for (const b of bands) {
    const buf = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const build = 1 - Math.exp(-t / 0.012);           // 12 ms echo-density ramp
      buf[i] = (rnd()*2-1) * Math.exp(-6.907755*t/b.t60) * build;
    }
    filt(buf, b.type, b.f, b.q || 0.7071);
    for (let i = 0; i < n; i++) out[i] += buf[i] * b.g;
  }
  // early reflections, pre-delay 22 ms then sparse taps (ms / gain), signs alternate
  const ER = [[7,0.72],[11,-0.61],[17,0.55],[23,-0.47],[31,0.41],[43,-0.34],[59,0.28],[79,-0.22]];
  const pre = Math.round(0.022 * SR);
  const ir = new Float64Array(n + pre + Math.round(0.09*SR));
  for (const [ms, g] of ER) ir[pre + Math.round(ms/1000*SR)] += g;
  for (let i = 0; i < n; i++) ir[pre + i] += out[i] * 0.5;
  return ir;
}
```

**Radix-2 iterative FFT** (real input packed as complex; adequate here):
```js
function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i],re[j]]=[re[j],re[i]]; [im[i],im[j]]=[im[j],im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len/2; k++) {
        const ur = re[i+k],        ui = im[i+k];
        const vr = re[i+k+len/2]*cr - im[i+k+len/2]*ci;
        const vi = re[i+k+len/2]*ci + im[i+k+len/2]*cr;
        re[i+k] = ur+vr; im[i+k] = ui+vi;
        re[i+k+len/2] = ur-vr; im[i+k+len/2] = ui-vi;
        const nr = cr*wr - ci*wi; ci = cr*wi + ci*wr; cr = nr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
```
Overlap-add: block L = 8192, FFT size 16384, IR partitioned into ceil(len/8192) blocks; per input
block, FFT once, complex-multiply-accumulate into a frequency-domain delay line of K partitions,
IFFT, add the first 8192 to the output and carry the rest. Standard uniform-partitioned convolution.

---

## 3. THE ANALOG PAD (supersaw + ZDF ladder)

### 3.1 Supersaw, exact JP-8000 constants (Szabo)

Source: Adam Szabo, *How to Emulate the Super Saw*, BSc thesis, Linnaeus University, 2010.
I extracted these directly from the PDF's text streams, so they are exact, not remembered.

**7 oscillators. Detune offsets (multipliers applied to the linear detune):**
```js
const SS_OFFSET = [-0.11002313, -0.06288439, -0.01952356, 0.0,
                    0.01991221,  0.06216538,  0.10745242];
// osc i frequency = f0 * (1 + SS_OFFSET[i] * D)   where D is the "linear detune"
```

**Detune knob (x ∈ [0,1]) → linear detune D, the 11th-order fit from the thesis:**
```js
const ssDetune = (x) =>
   10028.7312891634*x**11 - 50818.8652045924*x**10 + 111363.4808729368*x**9
 - 138150.6761080548*x**8 + 106649.6679158292*x**7 -  53046.9642751875*x**6
 +  17019.9518580080*x**5 -   3425.0836591318*x**4 +    404.2703938388*x**3
 -     24.1878824391*x**2 +      0.6717417634*x    +      0.0030115596;
```
Computed values (I ran the polynomial and converted to cents per oscillator):

| knob x | D | cents per osc, [1…7] | total spread |
|---|---|---|---|
| 0.00 | 0.003012 |, | 1.1 |
| **0.15** | 0.02904 | −5.5, −3.2, −1.0, 0, +1.0, +3.1, +5.4 | **10.9 c** |
| **0.22** | 0.04195 | −8.0, −4.6, −1.4, 0, +1.4, +4.5, +7.8 | **15.8 c** |
| **0.34** | 0.06586 | −12.6, −7.2, −2.2, 0, +2.3, +7.1, +12.2 | **24.8 c** |
| 0.45 | 0.08724 | −16.7, −9.5, −3.0, 0, +3.0, +9.4, +16.2 | 32.9 c |
| 1.00 | 0.99995 | −202 … +177 | 378 c (the JP's insane maximum) |

**Use x = 0.22 for the sustained pad (15.8 cents spread, lush, still in tune) and x = 0.34 for the
lead saw in bars 15 to 18 (24.8 cents, wider, obviously synthetic, correct for the payoff).**

**Mix knob (x ∈ [0,1]) → gains, both fits verbatim from the thesis:**
```js
const ssCentreGain = (x) => -0.55366*x + 0.99785;
const ssSideGain   = (x) => -0.73764*x*x + 1.2841*x + 0.044372;
// at x = 0.75 the centre and the six sides are equal (0.5826 vs 0.5925), the thesis notes this.
```
Computed: `x=0.60 → centre 0.6657, side 0.5493, norm 0.2524` · `x=0.72 → 0.5992 / 0.5865,
norm 0.2428` · `x=0.75 → 0.5826 / 0.5925, norm 0.2417`.

**Use mix = 0.72.** Then normalise the whole stack by `norm = 1/(centre + 6*side)` so voice count
does not change the level.

**High-pass at the fundamental**: the JP-8000 puts a HP filter tracking the fundamental after the
oscillator stack, to kill the sub-fundamental rumble the detuning creates. Implement as
`filt(buf,'hp', f0 * 1.0, 0.7071)`, one 2nd-order HP at exactly f0.

**Phase randomisation**: the thesis confirms the JP's oscillators are free-running and each note
trigger seeds a random phase. Do the same, deterministically:
```js
const ph0 = SS_OFFSET.map((_, i) => rndPhase() * 2 * Math.PI);   // per note, per voice, seeded
```
This matters. Seven saws starting in phase produce a huge transient click and a hollow first 50 ms.

**Anti-aliasing, PolyBLEP saw** (Välimäki/Huovilainen family; the 2-point polyBLEP is the standard
cheap form):
```js
function polyBlep(t, dt) {
  if (t < dt)      { t = t / dt;       return t + t - t*t - 1; }
  if (t > 1 - dt)  { t = (t - 1) / dt; return t*t + t + t + 1; }
  return 0;
}
// naive saw is 2*p - 1 for p in [0,1); corrected:
// s = 2*p - 1 - polyBlep(p, dt)   with dt = f/SR
```
At D5 (587 Hz) a naive saw has 40 audible aliases above 10 kHz. PolyBLEP kills the worst of them
for the cost of two multiplies.

**Full supersaw voice:**
```js
function supersaw(f0, durSec, { detune=0.22, mix=0.72, seed=1 } = {}) {
  const n = Math.floor(durSec * SR);
  const outL = new Float64Array(n), outR = new Float64Array(n);
  const rnd = mulberry32(seed);
  const D = ssDetune(detune);
  const gc = ssCentreGain(mix), gs = ssSideGain(mix);
  const norm = 1 / (gc + 6 * gs);
  // constant-power pan spread across the 7 voices
  const PAN = [-0.85, -0.57, -0.28, 0, 0.28, 0.57, 0.85];
  const p = new Float64Array(7), inc = new Float64Array(7);
  const gL = new Float64Array(7), gR = new Float64Array(7);
  for (let i = 0; i < 7; i++) {
    p[i] = rnd();
    const f = f0 * (1 + SS_OFFSET[i] * D);
    inc[i] = f / SR;
    const th = (PAN[i] + 1) * Math.PI / 4;
    const g = (i === 3 ? gc : gs) * norm;
    gL[i] = Math.cos(th) * g; gR[i] = Math.sin(th) * g;
  }
  // slow detune-drift LFO: 0.31 Hz, +-8% of D  -> this is the "breathing"
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const drift = 1 + 0.08 * Math.sin(2*Math.PI*0.31*t);
    let l = 0, r = 0;
    for (let i = 0; i < 7; i++) {
      const dt = inc[i] * (i === 3 ? 1 : drift);
      p[i] += dt; if (p[i] >= 1) p[i] -= 1;
      const s = 2*p[i] - 1 - polyBlep(p[i], dt);
      l += s * gL[i]; r += s * gR[i];
    }
    outL[k] = l; outR[k] = r;
  }
  filt(outL,'hp', f0, 0.7071); filt(outR,'hp', f0, 0.7071);
  return { L: outL, R: outR };
}
```

### 3.2 ZDF (zero-delay-feedback) 4-pole ladder, this is what "analog" means

A biquad with per-sample coefficient recalculation is unstable under fast modulation. The
topology-preserving-transform ladder (Zavalishin, *The Art of VA Filter Design*) is stable, has the
right 24 dB/oct slope, self-oscillates, and takes ~15 lines. I derived the closed-form solve below
(state it in the code so nobody "simplifies" it back into a one-sample-delayed feedback loop):

```
per stage:  y_i = G·x_i + (1−G)·s_i        with  G = g/(1+g),  g = tan(π·fc/SR)
chaining 4: y4 = G^4·u + S,   S = G^3(1−G)s1 + G^2(1−G)s2 + G(1−G)s3 + (1−G)s4
feedback:   u = x − k·y4
solve:      y4 = (G^4·x + S) / (1 + k·G^4)         <-- exact, no unit delay in the loop
```

```js
function Ladder() {
  let s1=0,s2=0,s3=0,s4=0;
  return function (x, fc, k, drive) {
    if (fc > 18000) fc = 18000; if (fc < 20) fc = 20;
    const g = Math.tan(Math.PI * fc / SR);
    const G = g / (1 + g), G1 = 1 - G;
    const G2 = G*G, G3 = G2*G, G4 = G3*G;
    const S = G3*G1*s1 + G2*G1*s2 + G*G1*s3 + G1*s4;
    const xin = Math.tanh(x * drive);                 // input drive, pre-feedback
    const y4 = (G4 * xin + S) / (1 + k * G4);
    const u  = xin - k * y4;
    let v, y;
    v = (u  - s1) * G; y = v + s1; s1 = y + v; const y1 = y;
    v = (y1 - s2) * G; y = v + s2; s2 = y + v; const y2 = y;
    v = (y2 - s3) * G; y = v + s3; s3 = y + v; const y3 = y;
    v = (y3 - s4) * G; y = v + s4; s4 = y + v;
    return y * (1 + k * 0.4);                          // resonance loudness compensation
  };
}
```
**Measured magnitude response (I built it and swept it, fc = 1000 Hz, 0.5 s sine per point):**

| k | 100 Hz | 500 Hz | 1 kHz | 2 kHz | 4 kHz | actual −3 dB point |
|---|---|---|---|---|---|---|
| 0 | −0.2 | −3.9 | **−12.0** | −28.1 | −50.0 | **442 Hz** |
| 0.6 | −2.2 | −1.7 | −8.8 | −26.2 | −48.1 | 832 Hz |
| 1.35 | −3.6 | −1.2 | −4.7 | −24.2 | −46.2 | 1077 Hz |
| 2.6 | −4.8 | −2.2 | **+3.3** | −21.7 | −43.8 | 1312 Hz |
| 3.6 | −5.4 | −3.1 | **+15.7** | −20.1 | −42.3 | 1420 Hz |

Two things fall out of this and **you must code around both**:

1. **`fc` is not the −3 dB point.** Four cascaded 1-pole stages each give −3 dB at `fc`, so the
   ladder is **−12 dB at `fc`** and its real −3 dB corner sits at **`fc × 0.442`** when k = 0.
   To get a *perceived* cutoff of X Hz, **set `fc = X × 2.26`**. This is exactly how a real Moog
   ladder behaves; do not "fix" it, just account for it when you write the envelope in octaves.
2. **Resonance also opens the filter** (442 → 1420 Hz across k = 0 → 3.6) and it is much milder at
   low k than it looks. At k = 1.35 the peak is only +7.3 dB relative to k = 0. So:

**Revised resonance values: pad k = 1.8, lead k = 2.9, bass k = 0.8, self-oscillation at k ≈ 4.**
`drive = 1.0` clean, `1.8` for the lead.

Stability under abuse (verified): white noise in, `fc` swept over 5 octaves by a **37 Hz** LFO at
k = 3.6, drive 1.6, for 2 s → `max|y| = 2.904`, finite, no blow-up. A coefficient-recomputing RBJ
biquad fails this test; the ZDF ladder does not. That is the entire reason to use it.

### 3.3 Filter ADSR, the thing amplitude-only engines lack

```
PAD FILTER ENVELOPE  (cutoff in OCTAVES above a base of 180 Hz)
  A = 900 ms    curve: 1 - exp(-3.2 * t/A)          (exponential-ish, feels analog)
  D = 1400 ms   curve: exp(-2.6 * t/D)
  S = 0.35
  R = 2500 ms
  ENV AMOUNT = +3.2 octaves    ->  peak cutoff = 180 * 2^3.2 = 1651 Hz at the A/D corner
  KEY TRACKING = 0.35          ->  base *= (f0/146.832)^0.35
AMP ENVELOPE (separate, slower attack, this is what makes it a pad not a stab)
  A = 1200 ms (raised cosine), D = 0, S = 1.0, R = 3200 ms (exp, -6.9/R)
LEAD SAW (bars 15-18)
  filter A = 30 ms, D = 380 ms, S = 0.55, R = 700 ms, amount +4.1 oct, base 320 Hz, k=2.6
BASS (bars 5+)
  filter A = 6 ms, D = 160 ms, S = 0.22, R = 240 ms, amount +2.4 oct, base 90 Hz, k=0.6
```

Cutoff LFO (the slow breath), applied on top in octaves:
```
rate 0.083 Hz  (one full cycle per 12.05 s, deliberately not bar-locked)
depth +-0.55 octaves
shape: (sin + 0.35*sin(3x))/1.35     // slightly non-sinusoidal so it never feels like an LFO
```
Second, faster LFO on the pad only: `rate 0.19 Hz, depth ±0.18 oct, phase offset π/3`. Two
incommensurate LFOs is the difference between "modulated" and "alive".

Final touch: a per-voice random-walk drift on each of the 7 saws' pitch, ±1.4 cents, updated every
2048 samples and slewed with a one-pole (`d = 0.9998`). That is the analogue-oscillator instability
model and it is why real hardware pads never sound static.

### 3.4 Chord voicings, D minor with a lift to F major

Equal temperament, A4 = 440. All frequencies computed exactly:

```
D1  36.708   D2  73.416   A1  55.000   Bb1 58.270   F1  43.654   C2  65.406
Bb2 116.541  C3 130.813   D3 146.832   E3 164.814   F3 174.614   G3 195.998
A3 220.000   Bb3 233.082  C4 261.626   D4 293.665   E4 329.628   F4 349.228
G4 391.995   A4 440.000   Bb4 466.164  C5 523.251   D5 587.330   F5 698.456
A5 880.000   D6 1174.659
```

| symbol | function | pad voicing (Hz) | bass note | used in bars |
|---|---|---|---|---|
| **Dm9** | i | D3 146.832 · F3 174.614 · A3 220.000 · C4 261.626 · E4 329.628 | D2 73.416 | 1 to 3, 5, 9, 13, 19 to 20 |
| **Bb maj7** | VI | Bb2 116.541 · D3 146.832 · F3 174.614 · A3 220.000 | Bb1 58.270 | 4, 6, 10, 14, 17 |
| **F add9** | III, **the lift** | F3 174.614 · A3 220.000 · C4 261.626 · G4 391.995 | F1 43.654 | 7, 11, **15, 16** |
| **C sus2→C** | VII | C3 130.813 · D3 146.832 · G3 195.998 · C4 261.626 → E4 329.628 | C2 65.406 | 8, 12, 18 |
| **A7(♭9)** | V (one bar only) | A3 220.000 · C#4 277.183 · E4 329.628 · Bb4 466.164 | A1 55.000 | 14 beats 3 to 4 (into the silence) |

Progression: `i, VI, III, VII` (Dm, Bb, F, C) is the modern cinematic-electronic default
because it never actually cadences. The **lift to F major at bar 15** works because F is the
relative major of D minor: the exact same seven notes, but the tonic moves up a minor third and the
whole thing brightens without a single new pitch class. That is the "it worked" moment, in harmony.

Voicing rules:
- **Never** put two pad notes closer than a minor third below C4 (261.6 Hz). Below that, thirds turn
  to mud on laptop speakers.
- Top voice of the pad must move by step or stay: D3→D3, C4→D3... keep the E4/C4 as common tones
  across Dm9→Bb so the change is felt, not heard.
- The lift at bar 15 is the **only** place a voice jumps more than a fourth. Everything else glides.

---

## 4. SIDECHAIN

No detection. The key list comes from the beatmap.

### 4.1 The key list

```js
// every beat 0..79 is a key; weight by position in the bar
const DUCK_W = [1.00, 0.60, 0.90, 0.60];   // beats 1, 2, 3, 4
const DUCK_ON = [[240, 1620], [1680, 2160]];  // frames: active in bars 3-14 and 15-18
const keys = [];
for (let b = 0; b < 80; b++) {
  const f = b * 30;
  if (!DUCK_ON.some(([a, z]) => f >= a && f < z)) continue;
  keys.push({ frame: f, w: DUCK_W[b % 4] });
}
```
Ghost keys on beats 2 and 4 at 0.60 weight even where there is no kick. That is the trick: the pump
is a *rhythm*, not a consequence of the kick.

### 4.2 The curve (exact)

```
LOOK-AHEAD  : start the drop 2.0 ms BEFORE the key frame (96 samples).
              Without it the gain step lands mid-transient and audibly clips the kick's attack.
ATTACK      : 3.0 ms (144 samples), raised-cosine from 1.0 down to (1 - depth)
              a(p) = 0.5 - 0.5*cos(PI*p),  p = 0..1
HOLD        : 0 ms
RELEASE     : 330 ms (15 840 samples) at 120 BPM.
              Beat = 500 ms, so 3 + 330 = 333 ms of movement and 167 ms flat before the next key.
              That 167 ms of "arrived" is what makes it read as produced rather than seasick.
RELEASE SHAPE (the important one):
              g(p) = min + (1 - min) * (1 - (1 - p)^E),  p = t/release
              E = 2.4   default  ("classic" ease-out: 81 % recovered at the halfway point)
              E = 1.6   gentler, for the pad in bars 3-6
              E = 3.5   snappier, for bars 15-18
```
Check the numbers: with E = 2.4, at p=0.25 → 1−0.75^2.4 = 0.475; p=0.5 → 0.810; p=0.75 → 0.960.
Fast then slow. That is the LFOTool "classic" shape.

### 4.3 Depths (dB)

| bus | depth | notes |
|---|---|---|
| MUSIC (pad + arp + lead), low band <220 Hz | **−9.0 dB** | see §4.4 |
| MUSIC, high band >220 Hz | **−4.5 dB** | |
| AIR (risers, shimmer, hall return) | **−5.0 dB** | |
| SUB | **−11.0 dB**, release 180 ms, E = 3.5 | the sub must get out of the kick's way fast and come straight back |
| DRUMS | 0 | never duck the drums with themselves |
| UI | −2.0 dB | just enough that ticks sit *inside* the groove |
| MASTER glue | −2.0 dB via the compressor, not the duck | §6.4 |

In bars 15 to 18 (the payoff) raise MUSIC-low to −11 dB and set E = 3.5. Deeper + snappier at the
climax is the standard escalation and it costs nothing.

### 4.4 Multiband duck (the premium detail)

```js
// LR4 crossover at 220 Hz on the MUSIC bus, duck the bands by different amounts
const lo = { L: musicL.slice(), R: musicR.slice() };
LR4(lo.L,'lp',220); LR4(lo.R,'lp',220);
const hi = { L: musicL.map((v,i)=>v-lo.L[i]), R: musicR.map((v,i)=>v-lo.R[i]) };
// apply duckLo[] to lo, duckHi[] to hi, sum back
```
LR4 LP + (original − LP) is not an exact complementary HP (it is minus an allpass), but at 4th order
the magnitude error at the crossover is under 0.3 dB and the phase is monotonic, inaudible here,
and far cheaper than running a second filter chain. If you want it exact, run a real LR4 HP branch;
the two sum flat at 4th order.

### 4.5 Duck envelope builder

```js
function buildDuck(keys, depthDb, releaseMs, E) {
  const g = new Float64Array(NBUF).fill(1);
  const look = Math.round(0.002 * SR);
  const atk  = Math.round(0.003 * SR);
  const rel  = Math.round(releaseMs / 1000 * SR);
  for (const k of keys) {
    const min = Math.pow(10, (-depthDb * k.w) / 20);
    const s0 = f2n(k.frame) - look;
    for (let i = 0; i < atk; i++) {
      const p = i / atk, a = 0.5 - 0.5 * Math.cos(Math.PI * p);
      const v = 1 - (1 - min) * a;
      if (s0 + i >= 0 && s0 + i < NBUF) g[s0 + i] = Math.min(g[s0 + i], v);
    }
    for (let i = 0; i < rel; i++) {
      const p = i / rel;
      const v = min + (1 - min) * (1 - Math.pow(1 - p, E));
      const j = s0 + atk + i;
      if (j >= 0 && j < NBUF) g[j] = Math.min(g[j], v);
    }
  }
  return g;
}
```
`Math.min` on overlap is correct, two keys close together should give the deeper duck, not a sum.

---

## 5. SUB AND IMPACT DESIGN

### 5.1 Three-layer impact (exact)

Every impact is **three separate buffers** with **three separate envelopes**, summed with
**three separate pans**. That is the whole secret.

```
LAYER 1: TRANSIENT (2-8 ms, 2-6 kHz)
  duration 8 ms (384 samples)
  content : noise (single seed, MONO, a transient must be a point source)
            + a 1.4 ms sine at 4200 Hz for the "snap"
  filter  : bandpass 3400 Hz, Q = 0.85, then HP 1800 Hz Q 0.7071
  envelope: exp(-t / 0.0016)      // tau = 1.6 ms, -60 dB at 11 ms
  level   : hero -9 dBFS peak, major -12.5, minor -17
  pan     : 0 (always)

LAYER 2: BODY (150-800 Hz)
  duration 420 ms
  content : two phase-locked sines, f_a and f_b, both with a pitch glide (below)
            + bandpassed noise at 380 Hz, Q = 1.2, at -11 dB relative
  hero    : f_a 165 -> 61 Hz, f_b 247 -> 92 Hz   (a perfect fifth apart throughout)
  glide   : f(t) = f_end + (f_start - f_end) * exp(-t / 0.038)
  envelope: (1 - exp(-t / 0.0022)) * exp(-t / 0.088)     // 2.2 ms attack, 88 ms decay tau
  filter  : LP 900 Hz Q 0.7071 (one pass) so it never gets clacky
  level   : hero -6 dBFS peak
  pan     : 0, but stereo-widened to 0.35 via M/S (§7.4)

LAYER 3: AIR (>8 kHz)
  duration 620 ms
  content : noise, TWO SEEDS (L and R independent), this is where the width lives
  filter  : HP 9000 Hz Q 0.7071, twice (24 dB/oct), then a gentle shelf: LP 17 000 Hz
  envelope: (1 - exp(-t / 0.0009)) * exp(-t / 0.155)
  level   : hero -16 dBFS
  send    : -7 dB to HALL. The air layer is 90 % of what makes an impact sound expensive.
  M/S     : width 1.55
```

Phase integration for the glide (do not use `sin(2πf(t)·t)`, that is wrong and gives a chirp
artefact):
```js
let ph = 0;
for (let i = 0; i < n; i++) {
  const t = i / SR;
  const f = fEnd + (fStart - fEnd) * Math.exp(-t / tau);
  ph += 2 * Math.PI * f / SR;
  out[i] = Math.sin(ph) * env(t);
}
```

### 5.2 The sub, and making it audible on laptop speakers

Verified: laptop speakers typically roll off below **~200 Hz** (Waves, "8 Tips for Great Mixes on
Small Speakers"), and the auditory system reconstructs the missing fundamental from the harmonic
series. So: **synthesise the harmonics explicitly and phase-lock them to the fundamental.**

```
HERO SUB (bar 15)
  fundamental: D1 36.708 Hz for bars 1-14 material; F1 43.654 Hz for the F-major payoff
  glide      : f(t) = f_end + (f_start - f_end)*exp(-t/0.22)
               hero: f_start = 96.0 Hz -> f_end = 43.654 Hz     duration 2.60 s
               open: f_start = 84.0 Hz -> f_end = 36.708 Hz     duration 2.40 s
  envelope   : (1 - exp(-t/0.006)) * exp(-t/0.62)   then a raised-cosine 120 ms tail-out
  HARMONIC LAYER (phase-locked, same accumulator, this is the laptop-audibility fix):
      partial 2f  amp 0.00   (still under 90 Hz, skip)
      partial 3f  amp 0.30   -> 110.0 / 130.9 Hz
      partial 4f  amp 0.22   -> 146.8 / 174.6 Hz
      partial 5f  amp 0.16   -> 183.5 / 218.3 Hz
      partial 6f  amp 0.10   -> 220.2 / 261.9 Hz
      partial 8f  amp 0.055  -> 293.7 / 349.2 Hz
    out[i] = env * ( sin(ph) + 0.30*sin(3*ph) + 0.22*sin(4*ph) + 0.16*sin(5*ph)
                   + 0.10*sin(6*ph) + 0.055*sin(8*ph) )
  GRIT LAYER (optional, +presence on tiny speakers):
      copy the fundamental, asymmetric shape y = tanh(2.2*(x+0.13)) - tanh(2.2*0.13),
      HP at 90 Hz, mix in at -9 dB
  MONO. Always. Width 0.0. No reverb send. No saturation on the fundamental itself.
```

> **MEASURED, this is the single highest-value number in the document.**
> I synthesised both versions of the hero sub (2.6 s, 96 → 43.654 Hz glide) and pushed each through
> a 24 dB/oct highpass at 200 Hz, i.e. a laptop speaker:
>
> | version | RMS full-band | RMS after HP 200 Hz | survives |
> |---|---|---|---|
> | fundamental only | 0.2406 | **0.0048** | **−34.0 dB** |
> | with the phase-locked harmonic stack | 0.2611 | **0.0660** | **−11.9 dB** |
>
> **The harmonic stack is 22.1 dB louder on a laptop for 0.7 dB more full-band level.** Without it,
> 97 % of the sub's energy is thrown away by the playback device and the viewer hears a click
> where the biggest moment of the film should be. This is not a nicety, it is the whole reason the
> hero impact lands or does not.

Test it yourself: `ffmpeg -af "highpass=f=200:poles=2,highpass=f=200:poles=2"` and listen on the
worst speaker you own. On a laptop the audience hears **only** that highpassed version.

### 5.3 How many impacts in 40 seconds

**Seven. Three weight classes. No more, no fewer.**

| # | frame | t (s) | class | level ref | contents |
|---|---|---|---|---|---|
| 1 | 0 | 0.000 | MAJOR (open) | −3.5 dB | 3 layers + sub 84→36.708 Hz, 2.40 s + 1.8 s hall |
| 2 | 240 | 4.000 | MINOR | −8 dB | transient + body only, short bus, no sub-drop |
| 3 | 720 | 12.000 | MINOR | −8 dB | " |
| 4 | 1200 | 20.000 | MINOR | −8 dB | " |
| 5 | 1440 | 24.000 | MINOR | −8 dB | " + riser #1 resolves here |
| 6 | **1680** | **28.000** | **HERO** | **0 dB** | all 3 layers at full + sub 96→43.654 Hz 2.60 s + reverse-reverb pre-hit + T60 → 2.6 s |
| 7 | 2160 | 36.000 | MAJOR (lockup) | −3.5 dB | 3 layers + sub 78→36.708 Hz, 3.0 s, no air layer (leave the top for the pad tail) |

Rules that make this work:
- **No two impacts within 1.5 s.** Closest pair here is 20.000 → 24.000 (4.0 s).
- **The hero gets ≥3 s of clear air before it.** It gets 4.0 s, of which the last 1.0 s is silence.
- UI ticks and hats are **not** impacts and do not count. There are ~46 of them; they live at
  −28 to −42 dB and never exceed −24.
- Never put an impact on beat 2 or 4. Every one of the seven is on a beat 1 or a beat 3.

---

## 6. SATURATION AND GLUE

### 6.1 Waveshaper formulas, compared

All normalised so `f(0)=0` and small-signal gain ≈ `k`.

| name | formula | character | 2nd harm? | knee |
|---|---|---|---|---|
| **tanh** | `y = tanh(k·x) / tanh(k)` | the default; symmetric, 3rd-order dominant, starts compressing around −8 dBFS at k=1 | no | medium |
| **arctan** | `y = (2/π)·atan(k·x) / ((2/π)·atan(k))` | softer, approaches the rail more slowly, more 5th/7th spread, keeps transient shape better | no | soft |
| **cubic soft clip** | `\|x\|<1/3: 2x` · `1/3≤\|x\|<2/3: sign(x)·(3−(2−3\|x\|)²)/3` · `else sign(x)` | hardest of the three, distinct "edge" at the corner, cheapest | no | hard |
| **simple cubic** | `\|x\|<1: y = 1.5·(x − x³/3)` · `else 1.5·sign(x)·2/3` | fully smooth to the rail, very musical, exactly 3rd harmonic only | no | soft |
| **asymmetric (tube/console)** | `y = (tanh(k·(x + b)) − tanh(k·b)) / (1 − tanh(k·b)²)` with `b = 0.10…0.16` | **generates 2nd harmonic**, this is "warmth". The `/(1−tanh²)` term restores unity small-signal gain. | **yes** | medium |
| **tape** | asymmetric shaper (above) → one-pole LP at 14 kHz → low shelf +0.8 dB @ 80 Hz → wow/flutter | the whole-mix glue | yes | medium |

Wow/flutter (tape only), via a fractional delay of nominal 8 ms:
```
wow   : 0.6 Hz,  depth 0.060 % of the delay  (=  ±0.23 samples at 8 ms nominal... use ±4.8 samples
        of an 8 ms = 384-sample delay -> 1.25 %. Scale to taste; 0.06 % is inaudible pitch, which
        is the point: you want the HF phase smear, not audible warble.)
flutter: 8.4 Hz, depth 0.015 %
```
**UNVERIFIED** as measured-from-hardware figures; they are the conventional ranges (wow < 2 Hz,
flutter 4 to 15 Hz). Keep depths tiny or it will sound broken.

### 6.2 Aliasing, the part everyone skips

A `tanh` at k=1.5 on content with energy at 12 kHz produces a 3rd harmonic at 36 kHz, which folds
back to **12 kHz mirrored around 24 kHz = 12 kHz**… fine… but the 5th at 60 kHz folds to 12 kHz too,
and content at 15 kHz folds its 3rd (45 kHz) down to **3 kHz**. That is audible, inharmonic, and it
is exactly the "digital and cheap" character. **Oversample every bus saturator 4×.**

```js
// 4x oversampled shaper. Zero-stuff, 8th-order Butterworth LP at 20 kHz (4 cascaded biquads
// at the OS rate = 192 kHz), shape, LP again, decimate.
function satOS4(buf, shape) {
  const n = buf.length, up = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) up[i * 4] = buf[i] * 4;      // *4 compensates zero-stuffing loss
  osFilt(up, 20000, 192000);                                 // 4 cascaded Q=0.5098,0.6013,0.8999,2.5629
  for (let i = 0; i < up.length; i++) up[i] = shape(up[i]);
  osFilt(up, 20000, 192000);
  for (let i = 0; i < n; i++) buf[i] = up[i * 4];
}
```
Butterworth 8th-order Q values (standard, from the Butterworth pole angles
`Q_m = 1/(2·cos((2m−1)π/16))`, m=1..4): **0.50979558, 0.60134489, 0.89997622, 2.56291545**.
(Computed: cos(π/16)=0.980785→Q=0.509796; cos(3π/16)=0.831470→0.601345; cos(5π/16)=0.555570→0.899976;
cos(7π/16)=0.195090→2.562915.) Verified arithmetic.

If 4× is too slow (it will not be, 1.92 M × 4 × 2 ch × ~40 flops ≈ 0.6 Gflop, a couple of seconds),
2× with a 20 kHz LP is an acceptable fallback for the per-bus stages, but **never** for the master.

### 6.3 Placement

| stage | shaper | drive k | b | oversampling |
|---|---|---|---|---|
| pad voice, pre-filter | asymmetric | 1.40 | 0.10 | none (band-limited by the ladder right after; note the ladder's own `tanh(x*drive)` input stage already shapes) |
| lead saw, pre-filter | asymmetric | 2.10 | 0.16 | 2× |
| sub fundamental | **none** |, |, |, |
| sub grit layer only | asymmetric | 2.20 | 0.13 | 2× |
| DRUMS bus | arctan | 1.30 |, | 4× |
| MUSIC bus | tanh | 1.15 |, | 4× |
| AIR bus | simple cubic | 1.10 |, | 4× |
| MASTER (after glue comp) | asymmetric | 1.06 | 0.06 | **4× mandatory** |

Master drive of 1.06 sounds like nothing. It is not nothing: it is 0.5 dB of peak rounding and about
0.3 % 2nd harmonic across the whole mix, and it is the difference between "rendered" and "mastered".

### 6.4 Feed-forward bus compressor (real one)

Gain computer with soft knee, standard form from Giannoulis, Massberg & Reiss,
*Digital Dynamic Range Compressor Design, A Tutorial and Analysis*, JAES 60(6):399 to 408, 2012:

```
xdB = 20*log10(max(|L|,|R|, 1e-9))
if      2*(xdB - T) < -W   ->  ydB = xdB
else if 2*|xdB - T| <= W   ->  ydB = xdB + (1/R - 1) * (xdB - T + W/2)^2 / (2*W)
else                       ->  ydB = T + (xdB - T) / R
gc = ydB - xdB                        // <= 0, the instantaneous target gain in dB
```
Smoothing (log-domain, branching peak detector, the "smooth, decoupled" variant is smoother but
this one is what an SSL does):
```
alpha_a = exp(-2.2 / (SR * attackSec))     // 2.2 tau  =>  10%-90% in attackSec  (verified: 1-e^-2.2 = 0.889)
alpha_r = exp(-2.2 / (SR * releaseSec))
if (gc < gs) gs = alpha_a*gs + (1-alpha_a)*gc     // gain going down = attack
else         gs = alpha_r*gs + (1-alpha_r)*gc     // coming back up = release
gain = 10^((gs + makeupDb)/20)
```

```js
function BusComp({ T, R, W, attackMs, releaseMs, makeupDb }) {
  const aA = Math.exp(-2.2 / (SR * attackMs / 1000));
  const aR = Math.exp(-2.2 / (SR * releaseMs / 1000));
  let gs = 0;
  return function (l, r) {
    const x = Math.max(Math.abs(l), Math.abs(r), 1e-9);
    const xdB = 20 * Math.log10(x);
    let ydB;
    if (2 * (xdB - T) < -W) ydB = xdB;
    else if (2 * Math.abs(xdB - T) <= W) ydB = xdB + (1 / R - 1) * Math.pow(xdB - T + W / 2, 2) / (2 * W);
    else ydB = T + (xdB - T) / R;
    const gc = ydB - xdB;
    gs = gc < gs ? aA * gs + (1 - aA) * gc : aR * gs + (1 - aR) * gc;
    const g = Math.pow(10, (gs + makeupDb) / 20);
    return [l * g, r * g, gs];
  };
}
```

Settings (SSL G-bus practice: 4:1, 30 ms attack, 0.3 s release, 2 to 4 dB GR is the documented
"glue" recipe; discrete SSL release values are 0.1 / 0.3 / 0.6 / 1.2 s / auto):

| bus | T (dBFS) | R | W (dB) | attack | release | makeup | target GR |
|---|---|---|---|---|---|---|---|
| MUSIC glue | −16 | 2.0 | 6 | 22 ms | 260 ms | +2.5 | 2.5 to 3.5 dB on loud bars |
| DRUMS | −12 | 3.0 | 4 | 8 ms | 140 ms | +2.0 | 3 to 5 dB on impacts |
| AIR | −20 | 2.5 | 8 | 40 ms | 380 ms | +2.0 | 2 to 3 dB |
| MASTER glue | −10 | 1.6 | 8 | 30 ms | 300 ms | +1.5 | **≤ 2.0 dB, always** |

Log the maximum `gs` per bus to stdout at the end of the render. If MASTER GR ever exceeds 2.5 dB
you are squashing the very dynamics you are trying to buy back. Lower the bus levels, not the
threshold.

---

## 7. STEREO

### 7.1 Constant-power pan (a linear pan law, `gl = g·(pan>0 ? 1-pan : 1)`, makes every centred source 3.01 dB hot)

```js
function panGains(p) {                 // p in [-1, +1]
  const th = (p + 1) * Math.PI / 4;
  return [Math.cos(th), Math.sin(th)]; // centre -> 0.70711 / 0.70711, sums to unity POWER
}
function place(bus, s, frame, gainDb, pan = 0, sendHall = -Infinity, sendShort = -Infinity) {
  const at = f2n(frame);
  const g = Math.pow(10, gainDb / 20);
  const [pl, pr] = panGains(pan);
  const gh = sendHall  === -Infinity ? 0 : Math.pow(10, sendHall  / 20) * g;
  const gs = sendShort === -Infinity ? 0 : Math.pow(10, sendShort / 20) * g;
  const stereo = !!s.L;
  const n = stereo ? s.L.length : s.length;
  for (let i = 0; i < n; i++) {
    const j = at + i; if (j < 0) continue; if (j >= NBUF) break;
    const a = stereo ? s.L[i] : s[i];
    const b = stereo ? s.R[i] : s[i];
    bus.L[j] += a * g * pl; bus.R[j] += b * g * pr;
    if (gh) { HALL_IN[j] += (a + b) * 0.5 * gh; }
    if (gs) { SHORT_IN[j] += (a + b) * 0.5 * gs; }
  }
}
```

### 7.2 Haas

Verified windows: below ~5 ms the two copies fuse but comb-filter audibly; **5 to 25 ms is the strong
precedence zone**; the perceptual fusion limit is ~35 ms. Therefore:

```
ALLOWED Haas layers : AIR bus wide texture, shimmer, riser tails, pad DOUBLE (not the pad itself)
FORBIDDEN           : any impact, the kick, the sub, the lead, any UI tick, the arp
DELAY               : 14 ms right (672 samples), inside the sweet 10 to 20 ms zone
                      use an INTEGER delay, no interpolation, so there is no HF loss
ATTENUATION         : delayed copy at −3.0 dB, so the mono sum is at most +2.5 dB at the peaks
                      of the comb and −6 dB at the notches (first notch at 1/(2*0.014) = 35.7 Hz,
                      then every 71.4 Hz, HP the Haas layer at 400 Hz and the first six notches
                      are gone from the region that matters)
HP THE HAAS LAYER   : 400 Hz, 12 dB/oct. Non-negotiable.
```
Mono-compat test (run it, do not assume):
```bash
ffmpeg -i score.wav -af "pan=mono|c0=0.5*c0+0.5*c1,ebur128=peak=true" -f null -
```
Compare integrated loudness with the stereo measurement. A drop of **more than 2.0 LU** means the
width is fake and you must pull the Haas layer or narrow the M/S.

### 7.3 Bass-mono (mandatory, on the sum, before the master comp)

Everything below **120 Hz** must be mono. Two reasons: laptop/phone speakers sum to near-mono and
any out-of-phase bass vanishes; and an AAC encoder spends bits on stereo LF for nothing.

```js
function bassMono(L, R, fc = 120) {
  const n = L.length;
  const m = new Float64Array(n), s = new Float64Array(n);
  for (let i = 0; i < n; i++) { m[i] = (L[i]+R[i])*0.5; s[i] = (L[i]-R[i])*0.5; }
  const sLo = s.slice();
  LR4(sLo, 'lp', fc);                 // the low part of SIDE
  for (let i = 0; i < n; i++) {
    const sHi = s[i] - sLo[i];        // side with no bass
    L[i] = m[i] + sHi; R[i] = m[i] - sHi;
  }
}
```

### 7.4 M/S width per bus

```
s' = s * width;  L = m + s';  R = m - s'
SUB          width 0.00   (hard mono)
IMPACT body  width 0.35
IMPACT air   width 1.55
DRUMS        width 0.55
UI           width 0.90
MUSIC        width 1.20   (pad); arp 1.15; lead 0.85 (the lead must stay focused)
AIR          width 1.60
HALL return  width 1.35
MASTER       width 1.05   (one last nudge, no more)
```
Anything above 1.6 will fail the mono test. Check §7.2.

### 7.5 Per-voice decorrelation

Two methods, use both:

**(a) Independent seeds** for anything noise-based that should be wide (air layers, risers,
whooshes, hats). Cost: nothing. Result: perfect decorrelation, perfect mono compatibility (the sum
of two independent noises is just noise 3 dB louder, no comb).

**(b) Allpass chains** for anything tonal that should be wide without a Haas delay. 4 series
allpasses per channel, `g = 0.62`, different prime delays:
```
L: [113, 193, 317, 443]  samples  (2.35 / 4.02 / 6.60 / 9.23 ms)
R: [127, 199, 331, 457]  samples  (2.65 / 4.15 / 6.90 / 9.52 ms)
```
Allpass = flat magnitude, so the mono sum loses nothing to comb filtering; only the phase differs,
which is exactly what "wide" means. Apply at 100 % wet on the pad *double* layer (mixed under the
dry pad at −6 dB), never on the dry pad itself.

---

## 8. RISERS, WHOOSHES, SHIMMER

### 8.1 Noise-bandwidth riser (the main build tool)

```
duration    : 2 bars = 4.000 s for riser #1 (frames 1200→1440)
              1 bar  = 2.000 s for riser #2, but only the last 1.0 s is audible (see §9 arrangement)
noise       : white, 2 seeds (L/R independent)
bandpass fc : exponential sweep  fc(t) = 380 * (7600/380)^(t/T)     = 380 * 20^(t/T)
              -> 380 Hz at t=0, 1699 Hz at t=T/2, 7600 Hz at t=T
bandpass Q  : linear sweep 0.90 -> 5.50   (narrowing = the tension; this is the whole trick)
2nd band    : a second BP one octave above, Q = fixed 3.0, at -8 dB
amp env     : env(p) = p^1.7,  p = t/T      (slow start, hard finish)
level       : peaks at -14 dBFS
send        : -6 dB to HALL
pitch layer : add a sine at f(t) = 110 * 2^(2.4*p) at -18 dB, one tonal thread stops it being
              a hiss. At p=1 that is 110*2^2.4 = 581 Hz, near D5 (587.33). Deliberate.
TERMINATION : 30 ms raised-cosine fade-out ENDING at hitFrame - 2 frames
```
Implementation note: recompute the bandpass biquad coefficients **every 64 samples**, not every
sample, a per-sample recompute of an RBJ biquad under a fast sweep is not guaranteed stable, and
64-sample blocks (1.33 ms) are far below the audible zipper threshold.

### 8.2 The gap before the hit

```
HERO   : 2 frames = 33.33 ms of true silence (everything at -inf except room tone at -54 dBFS)
MAJOR  : 2 frames
MINOR  : 1 frame  = 16.67 ms
```
Implement as a gate array multiplied into every bus **except SUB's reverb-free tail and the room
tone**. The gap is the loudest thing in the film. Do not fill it.

### 8.3 Doppler whoosh (real physics, not a filter sweep)

Model: source moving at speed `v` in a straight line, listener at perpendicular distance `d`,
speed of sound `c = 343 m/s`.
```
r(t)      = sqrt(d^2 + (v*t)^2)
dr/dt     = v^2*t / r(t)                       // radial velocity, negative when approaching
f_ratio(t)= c / (c + dr/dt)
amp(t)    = d / r(t)                           // 1/r pressure law, normalised to 1 at t=0
pan(t)    = clamp(v*t / r(t), -1, 1)           // sweeps -1 -> +1 through the head
```
Parameters for a proper whip-past:
```
v = 42 m/s, d = 2.2 m, t from -0.40 s to +0.40 s   (duration 0.80 s, 48 frames)
  f_ratio at t=-inf : 343/(343-42) = 1.13953  ->  +226.0 cents
  f_ratio at t=+inf : 343/(343+42) = 0.89091  ->  -199.9 cents
  amp range          : 2.2/2.2 = 1.0 at t=0, 2.2/sqrt(2.2^2+16.8^2)=0.1299 at the ends = -17.7 dB
```
Source material: pink noise bandpassed 700 Hz Q 1.1 (a "body") + white noise HP 4 kHz (the "air"),
mixed 0.7 / 0.3. Apply `f_ratio` as a resampling rate on a fractional delay line, or more simply as
a bandpass-centre multiplier plus a fractional-delay pitch shift; the honest version is:
```js
// read a pre-rendered mono source at a variable rate
let rp = 0;
for (let i = 0; i < n; i++) {
  const t = tStart + i / SR;
  const r  = Math.sqrt(d*d + v*v*t*t);
  const ratio = c / (c + (v*v*t) / r);
  const amp = d / r;
  const pan = Math.max(-1, Math.min(1, v*t / r));
  const [pl, pr] = panGains(pan);
  const idx = Math.floor(rp), fr = rp - idx;
  const s = src[idx] + (src[idx+1] - src[idx]) * fr;
  outL[i] = s * amp * pl; outR[i] = s * amp * pr;
  rp += ratio;
}
```
Whoosh placements: frames 210, 690, 1170, 1650, 2130, each **48 frames long ending 6 frames after
the following downbeat**, i.e. they cross the bar line rather than stopping at it.

### 8.4 Shimmer, granular octave-up in the reverb feedback path

```
grain size N   : 2048 samples (42.67 ms)
hop            : 1024 samples (50 % overlap; Hann at 50 % overlap sums to exactly 1.0)
read rate      : 2.0x within the grain  (= +1 octave)
window         : Hann  w[i] = 0.5 - 0.5*cos(2*PI*i/N)
feedback gain  : 0.42 into the HALL input  (above ~0.55 it runs away and never resolves)
HP the feed    : 300 Hz, so the shimmer does not build up mud
```
```js
function OctaveUpGrain() {
  const N = 2048, H = 1024;
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5*Math.cos(2*Math.PI*i/N);
  const inBuf = new Float64Array(1 << 16); let iw = 0;
  const out = new Float64Array(N * 2); let ow = 0, cnt = 0, start = 0;
  return function (x) {
    inBuf[iw & 0xFFFF] = x; iw++;
    const y = out[ow]; out[ow] = 0; ow = (ow + 1) % out.length;
    if (++cnt >= H) {
      cnt = 0;
      for (let i = 0; i < N; i++) {
        const rp = start + i * 2;
        const s = inBuf[(iw - N * 2 + rp) & 0xFFFF];
        out[(ow + i) % out.length] += s * win[i];
      }
      start = 0;
    }
    return y;
  };
}
```
The 1024-sample hop puts a 46.875 Hz granular flutter in the signal. That is why it goes **into the
reverb**, not in front of it, the FDN smears it into texture. Never use this dry.

### 8.5 FM glints (cheaper, cleaner, more controllable than shimmer)

For the small metallic sparkles over the scale-reveal material:
```
carrier    fc = note * 4
modulator  fm = fc * 1.41421356          // sqrt(2) ratio -> inharmonic, bell-like
index      I(t) = 6.5 * exp(-t / 0.10)
amp env    exp(-t / 0.42) * (1 - exp(-t / 0.0012))
duration   0.9 s
y = sin(2*PI*fc*t + I(t)*sin(2*PI*fm*t))
```
Notes from D natural minor, top octave: D5 587.330, F5 698.456, A5 880.000, D6 1174.659.
Pick with a seeded PRNG, ~1 glint every 20 to 34 frames during bars 7 to 13 and 15 to 18, level −30 to −38 dB,
pan `(rnd()*2-1)*0.9`, hall send −3 dB.

### 8.6 Sub-drop pre-roll (the "suck")

Before impacts 1, 6 and 7, run the last 8 frames (133 ms) of the preceding material through a
**downward** pitch-and-filter sweep: LP cutoff `4000 * (1-p)^1.4 + 180` and a pitch ratio
`1 - 0.06*p²`. That is the vacuum sound. Only on the three big hits, never on the minors.

---

## 9. ARRANGEMENT, 40.000 s, 20 bars, 80 beats, D minor → F major

Frame map (exact): bar B starts at frame `(B−1)·120`.

| bar | frames | t (s) | chord | SUB | DRUMS | MUSIC | AIR | UI | notes |
|---|---|---|---|---|---|---|---|---|---|
| **1** | 0 to 119 | 0.000 to 2.000 | D pedal | **impact 1 sub, 84→36.708 Hz, 2.40 s** | impact 1 (3 layers) |, | hall tail only |, | Cold open. Everything else silent. LUFS-S ≈ −22. |
| **2** | 120 to 239 | 2.000 to 4.000 | Dm9 | drone D1 −24 dB |, | pad in at f120, cutoff 240→520 Hz | whoosh @ f210 | 1 tick @ f180 | Pad amp attack 1.2 s. LUFS-S ≈ −26 at the start. |
| **3** | 240 to 359 | 4.000 to 6.000 | Dm9 | sub pulse on beats 1,3 | **impact 2** + kick f240, f300 | pad |, | 3 ticks | Sidechain ON from f240. |
| **4** | 360 to 479 | 6.000 to 8.000 | Bb maj7 | " | kick 1,3 + hat 8ths | pad + **arp in** (16ths, D4 F4 A4 C5) |, | 4 ticks | |
| **5** | 480 to 599 | 8.000 to 10.000 | Dm9 | + **bass D2** | kick 1,3 + hat | pad + arp |, | 6 ticks | |
| **6** | 600 to 719 | 10.000 to 12.000 | Bb maj7 | bass Bb1 | " | pad + arp | first glints f660, f690 | 5 ticks | whoosh @ f690 |
| **7** | 720 to 839 | 12.000 to 14.000 | **F add9** | bass F1 | **impact 3** + kick 1,3 + hat | pad + arp | glints; tick texture in (32nd ticks, wide, −38 dB) | 8 ticks | First taste of the lift. |
| **8** | 840 to 959 | 14.000 to 16.000 | C sus2→C | bass C2 | + clap on 2,4 | pad + arp **octave up** | air layer in | 8 ticks | |
| **9** | 960 to 1079 | 16.000 to 18.000 | Dm9 | bass D2 | **kick 4-on-the-floor** from here | full | " | 10 ticks | LUFS-S ≈ −13 |
| **10** | 1080 to 1199 | 18.000 to 20.000 | Bb maj7 | bass Bb1 | " | + **lead saw** (D5 C5 A4 F4) | " | 10 ticks | |
| **11** | 1200 to 1319 | 20.000 to 22.000 | F add9 | bass F1 | **impact 4** + 4-on-floor | full | **riser #1 starts f1200 (4.0 s)** | 12 ticks | Filter env base climbs +0.9 oct over bars 11 to 14. |
| **12** | 1320 to 1439 | 22.000 to 24.000 | C | bass C2 | + hat 16ths | full | riser #1 | 14 ticks | |
| **13** | 1440 to 1559 | 24.000 to 26.000 | Dm9 | bass D2 | **impact 5** (riser #1 lands) + full kit | full | glints dense | 16 ticks | Peak pre-drop density. LUFS-S ≈ −11. |
| **14** | 1560 to 1619 | 26.000, **27.000** | Bb → **A7(♭9)** on beat 3 | bass A1 | full kit until f1619 | full until f1619 | **riser #2 starts f1560** | ticks stop f1600 | The turn. |
| **14b** | **1620 to 1677** | **27.000 to 27.967** |, |, | **ALL DEAD** | **ALL DEAD** | **riser #2 only** + reverse-reverb pre-hit |, | **THE SILENCE.** 1.000 s. Room tone at −54 dBFS + the hall tail of bar 14 ducked −12 dB. LUFS-S ≈ −34. |
| **14c** | **1678 to 1679** | **27.967 to 28.000** |, |, |, |, |, |, | **THE GAP. 2 frames = 33.33 ms of true nothing.** |
| **15** | **1680 to 1799** | **28.000 to 30.000** | **F add9, THE LIFT** | **HERO sub 96→43.654 Hz, 2.60 s + full harmonic stack** | **HERO impact (impact 6)** + 4-on-floor | pad F voicing, arp, lead all at full, filter wide open | air layer + hall T60 → **2.60 s** |, | The single biggest moment. LUFS-S ≈ −8. |
| **16** | 1800 to 1919 | 30.000 to 32.000 | F add9 | bass F1 | full | full + lead top line | full | 8 ticks | |
| **17** | 1920 to 2039 | 32.000 to 34.000 | Bb maj7 | bass Bb1 | full | full | full | 10 ticks | Peak sustained energy. |
| **18** | 2040 to 2159 | 34.000 to 36.000 | C → (V of Dm) | bass C2 | full, kick drops on beat 4 | full | **riser #3 f2100, f2158** (0.967 s) | 6 ticks | |
| **19** | 2160 to 2279 | 36.000 to 38.000 | **Dm9, resolution** | **sub 78→36.708 Hz, 3.00 s** | **impact 7 (MAJOR lockup)**, then nothing | pad only, R = 3.2 s | hall tail | 1 tick @ f2160 | Everything else stops dead. Logo lands. |
| **20** | 2280 to 2399 | 38.000 to 40.000 | Dm9 tail | sub tail |, | pad release | hall tail decaying | **final tick @ f2280** | 300 ms raised-cosine fade 39.700→40.000. |

**One silence: frames 1620 to 1679 (27.000 → 28.000 s).**
**One hero impact: frame 1680 (28.000 s), 70 % through the film.**

Why 70 %: it leaves 12 s of payoff, which is exactly enough to state the F-major lift, hold it for
two bars, and resolve back to Dm for the lockup. Put the hero at 50 % and the last 20 s sags. Put it
at 85 % and the film ends on a cymbal crash with no resolution.

**Loudness design (this is what buys the LRA, not the 1-second silence):**
| section | duration | target LUFS-S |
|---|---|---|
| bars 1 to 2 | 4 s | −24 |
| bars 3 to 6 | 8 s | −17 |
| bars 7 to 10 | 8 s | −13 |
| bars 11 to 14a | 7 s | −11 |
| the silence | 1 s | −34 |
| bars 15 to 18 | 8 s | **−8** |
| bars 19 to 20 | 4 s | −14 falling to −32 |

Because LRA uses a **3-second** short-term window, a 1-second silence contributes almost nothing to
it. The LRA comes from the 4 s opening at −24 against the 8 s payoff at −8: a 16 LU spread across
multi-second blocks. After the −20 LU relative gate (gated mean ≈ −12, gate ≈ −32) the opening
survives and the silence does not. **Predicted LRA ≈ 9 to 13 LU.** Anything ≥ 7 is a pass; the
failed master's 2.8 is what a limiter-flattened film measures.

---

## 10. MASTERING

### 10.1 What the JS render hands over

- 32-bit float stereo WAV, 48 kHz, exactly 1 920 000 sample frames.
- **Peak = −4.0 dBFS.** Not normalised. Measure once and hard-code the trim.
- No limiter in JS. The only dynamics are the bus comps and the master glue (≤2 dB GR).

### 10.2 Two-pass loudnorm, exact

> **In this kit, use `npm run master -- <id>` instead.** It applies the gain, a 4x-oversampled
> limiter, iterates to target, and fails unless its final linear trim reports `linear`
> (`toolchain.md` section 6). This section stays because it explains why plain two-pass `loudnorm`
> falls back to dynamic mode on a film with real range, which is the trap the master avoids. The
> worked example targeted -14 LUFS (social-first); the kit's default is -16.
>
> The pipes below (`tail`, `grep`) are POSIX shell (macOS, Linux, Git Bash). In PowerShell use
> `Select-Object -Last 20` and `Select-String` in their place.

**Pass 1, measure (audio only, discard output):**
```bash
ffmpeg -hide_banner -nostats -i score.wav \
  -af loudnorm=I=-14:TP=-1.5:LRA=16:print_format=json \
  -f null - 2>&1 | tail -n 20
```
This prints:
```json
{
  "input_i" : "-XX.XX",
  "input_tp" : "-X.XX",
  "input_lra" : "XX.XX",
  "input_thresh" : "-XX.XX",
  "target_offset" : "X.XX"
}
```

**Pass 2, apply, linear:**
```bash
ffmpeg -hide_banner -y -i score.wav \
  -af loudnorm=I=-14:TP=-1.5:LRA=16:\
measured_I=$IN_I:measured_TP=$IN_TP:measured_LRA=$IN_LRA:measured_thresh=$IN_THRESH:\
offset=$OFFSET:linear=true:print_format=summary \
  -ar 48000 -c:a pcm_f32le score-master.wav
```

**Critical, from the ffmpeg docs (verified, ffmpeg 8.0 filter reference):**
> "measured_I, measured_LRA, measured_TP, and measured_thresh must all be specified. Target LRA
> shouldn't be lower than source LRA and the change in integrated loudness shouldn't result in a
> true peak which exceeds the target TP. If any of these conditions aren't met, normalization mode
> will revert to dynamic."

Consequences you must handle:
1. **Set `LRA=16`**, above the expected measured LRA (~9 to 13). If you set `LRA=11` and the source
   measures 12.4, ffmpeg silently drops to dynamic mode and flattens the film, which is very
   plausibly what happened to the failed 2.8 LU master, made with `LRA=11` single-pass.
2. **`TP=-1.5` with a −4 dBFS source:** the gain move is `-14 - measured_I`. If the source is
   −20 LUFS the move is +6 dB, putting the peak at +2 dBTP → condition violated → dynamic mode.
   So the JS render's **peak must be no hotter than `-1.5 - (-14 - measured_I)`**. With a target of
   integrated ≈ −17 LUFS in JS, the move is +3 dB and −4 dBFS peak becomes −1 dBFS, which still
   violates. **Therefore: aim the JS render at integrated −11 to −12 LUFS with a −4.0 dBFS peak.**
   Then the move is −2 to −3 dB and the peak lands at −6 to −7 dBTP, comfortably inside −1.5.
   Verify this in pass 1 and iterate the JS `MASTER_TRIM` until pass 2 reports
   `Normalization Type: Linear`. **If the summary says `Dynamic`, the master is wrong. Re-run.**
3. The `print_format=summary` output of pass 2 states the normalization type explicitly. Grep for it:
   ```bash
   ... 2>&1 | grep -E "Normalization Type|Output Integrated|Output True Peak|Output LRA"
   ```
   Assert `Normalization Type: Linear`.

**Never** run `loudnorm` on the mux step as well. The failed master applied
`-af loudnorm=I=-14:TP=-1.5:LRA=11` on top of an already-normalised JS render: two AGC passes.
Use `-c:a copy` from the pre-mastered AAC, or encode once:
```bash
ffmpeg -y -i master.mp4 -i score-master.wav -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 320k -ar 48000 -movflags +faststart out/film-16x9.mp4
```

### 10.3 Verification (run all four, keep the output in the repo)

```bash
# 1. EBU R128 full report: I, LRA, LRA low/high, true peak
ffmpeg -nostats -i score-master.wav -filter_complex ebur128=peak=true:framelog=verbose -f null - 2>&1 | tail -n 25

# 2. Sample peak + RMS
ffmpeg -i score-master.wav -af astats=measure_overall=Peak_level+RMS_level+Flat_factor -f null - 2>&1 | grep -E "Peak|RMS|Flat"

# 3. Mono-compat
ffmpeg -i score-master.wav -af "pan=mono|c0=0.5*c0+0.5*c1,ebur128=peak=true" -f null - 2>&1 | tail -n 12

# 4. Laptop-speaker simulation (what a viewer on a laptop actually hears)
ffmpeg -y -i score-master.wav -af "highpass=f=200:poles=2,highpass=f=200:poles=2,lowpass=f=13000" laptop-sim.wav
```

### 10.4 Pass/fail gates

| metric | target | fail = |
|---|---|---|
| Integrated | **−14.0 ± 0.5 LUFS** | outside |
| True peak | **≤ −1.5 dBTP** | above |
| **LRA** | **≥ 7.0 LU, target 9 to 13** | **< 7.0** (the failed master's 2.8 is the reference failure) |
| Normalization Type (pass 2) | **Linear** | `Dynamic` |
| Mono-sum integrated delta | **≤ 2.0 LU** below stereo | more |
| `Flat_factor` (astats) | **0** | > 0 means clipped samples |
| Master comp max GR | **≤ 2.0 dB** | more |
| Duration | **40.000 s exactly (1 920 000 frames)** | anything else |
| Laptop sim: hero impact still audible | yes | if it vanishes, the §5.2 harmonic stack is too quiet |

**Caveat, stated honestly:** EBU Tech 3342 defines LRA over a programme; a 40-second item gives only
~370 overlapping 3 s short-term blocks and the 10th/95th percentile estimate is correspondingly
noisy. LRA is a *proof of intent* here, not a precision instrument. The real test is the laptop sim
in 10.3#4 and a human listening on a phone.

---

## 11. RENDER-TIME BUDGET AND DETERMINISM

| stage | cost |
|---|---|
| voice synthesis (~380 events) | ~1.5 s |
| HALL FDN-8 over 2 064 000 samples | ~0.8 s |
| SHORT FDN-4 | ~0.4 s |
| 4× oversampled saturation, 5 buses + master | ~4 s |
| bus + master compression | ~0.4 s |
| M/S, bass-mono, fades | ~0.3 s |
| WAV write (15.4 MB float) | ~0.1 s |
| **total** | **≈ 8 s** |

Determinism contract:
1. Every PRNG is seeded from the `SEEDS` table. No `Math.random` anywhere. Grep for it in CI.
2. All LFOs are functions of absolute sample index `n`, never of accumulated state.
3. `Math.tanh`, `Math.sin`, `Math.exp`, `Math.pow` are not bit-identical across V8 versions.
   Pin Node in CI (the bench below used 24.16.0; the kit needs 22.18 or later) and assert on a
   checksum of the output WAV. If it must be portable,
   replace `Math.tanh(x)` with `(e=Math.exp(2*x), (e-1)/(e+1))`, still not bit-exact, but the
   only realistic guarantee is the pinned runtime.
4. Print at the end: peak dBFS, integrated estimate, max GR per bus, and the count of each event
   type. A one-line diff of that summary catches an accidental change faster than listening does.

---

## 12. WHAT I ACTUALLY RAN (bench results, Node 24.16.0)

Every one of these came out of executing the code in this document, not from memory. Re-run them
after you port the code; if a number moves, the port is wrong. (The bench scripts themselves are
not part of this kit; each check is simple to rebuild from the row's description.)

| check | result | verdict |
|---|---|---|
| `fwht8` orthogonality (all 64 inner products) | max error **2.22e−16** | lossless mixing matrix confirmed |
| Hall FDN-8 impulse, `t60=2.20 damp=0.32` | peak 0.177 at 55 ms, **measured T60 1.81 s**, tail RMS 2.3e−10 @ 7 s | stable, in the 1.8 to 2.6 s target |
| Hall FDN-8, `t60=3.17 damp=0.24` | **measured T60 2.58 s** | the payoff hall |
| Short FDN-4, `t60=0.055 damp=0.20` | **measured T60 73.9 ms** | in the 60 to 80 ms target |
| ZDF ladder, k=0, fc=1000 | −12.0 dB at fc, −50.0 dB at 4 kHz, **−3 dB at 442 Hz** | correct 4-pole slope; fc ≠ corner |
| ZDF ladder, k=3.6, 37 Hz 5-octave sweep, drive 1.6, noise in | `max\|y\| = 2.904`, finite | stable under abuse |
| PolyBLEP saw @ D5 587.33 Hz, alias energy 6 to 10 kHz | naive **−38.9 dB** → polyBLEP **−47.1 dB** | **8.2 dB** alias reduction (crude DFT estimate, real figure is better; the test bins catch some genuine harmonics) |
| Soft-knee gain computer, T=−16 R=2 W=6 | continuous to 1e−3 dB; GR at −30/−19/−16/−13/−6 dBFS = 0 / 0 / **−0.375** / **−1.500** / **−5.000** dB | knee is smooth, no discontinuity at either corner |
| Constant-power pan, p = −1/−0.5/0/0.5/1 | `gL²+gR²` = 1.000 at every position | correct |
| **A linear pan law** (`gl = g·(pan>0 ? 1-pan : 1)`) | centre is **+3.01 dB** hot vs hard-panned | the bug constant-power pan fixes (§7.1) |
| Duck curve E=2.4 at p = 0.25 / 0.5 / 0.75 | 0.499 / **0.811** / 0.964 | ease-out, 81 % recovered at halfway |
| Butterworth 8th-order Q values | **0.50979558, 0.60134489, 0.89997622, 2.56291545** | for the 4× oversampling filter |
| Doppler, v=42 d=2.2 c=343, t = −0.4 → +0.4 s | **+224.1 → −198.4 cents**, −17.7 dB at the ends | a real whip-past |
| Supersaw knob 0.22 | ±8.0 cents outer pair, 15.8 c total | lush, in tune |
| Supersaw knob 0.34 | ±12.6 cents outer pair, 24.8 c total | lead |
| **Hero sub through a 200 Hz laptop HP** | fundamental only **−34.0 dB**; with harmonic stack **−11.9 dB** | **22.1 dB win** |

---

## 13. SOURCES

- Freeverb tuning constants (8 combs 1116/1188/1277/1356/1422/1491/1557/1617; 4 allpasses
  556/441/341/225; stereospread 23; fixedgain 0.015; scaledamp 0.4; scaleroom 0.28; offsetroom 0.7):
  [freeverb `tuning.h`](https://raw.githubusercontent.com/sinshu/freeverb/master/Components/tuning.h),
  context at [CCRMA PASP, "Freeverb"](https://ccrma.stanford.edu/~jos/pasp/Freeverb.html).
  *(Listed for reference; the recipe above deliberately uses an FDN instead, and the Freeverb values
  are tuned for 44.1 kHz, multiply by 48000/44100 = 1.08844 if you ever port them.)*
- FDN feedback matrices (Householder 4×4 = ½·[[1,−1,−1,−1],…], Hadamard 4×4 = (1/√2)·[[1,1,1,1],…],
  Stautner, Puckette) and the T60 attenuation relation `20log10|H_i| = −60·M_i·T/t60(ω)`:
  [dsprelated / Smith, *Physical Audio Signal Processing*, "FDN Reverberation"](https://www.dsprelated.com/freebooks/pasp/FDN_Reverberation.html).
- Jot per-line gain `Γ_i = 10^(−3·m_i/(T60·fs))`, corroborated in the FDN literature, e.g.
  [FLAMO (arXiv 2409.08723)](https://arxiv.org/pdf/2409.08723) and
  [*On Lossless Feedback Delay Networks* (arXiv 1606.07729)](https://arxiv.org/pdf/1606.07729).
- Supersaw: 7 oscillators, offsets `[−0.11002313, −0.06288439, −0.01952356, 0, 0.01991221,
  0.06216538, 0.10745242]`, the 11th-order detune polynomial, centre gain `−0.55366x+0.99785`,
  side gain `−0.73764x²+1.2841x+0.044372`, HP tracking the fundamental, random start phases:
  Adam Szabo, [*How to Emulate the Super Saw*](https://www.adamszabo.com/internet/adam_szabo_how_to_emulate_the_super_saw.pdf)
  (values extracted directly from the PDF text streams, not recalled).
- Soft-knee gain computer and log-domain branching detector, Giannoulis, Massberg & Reiss,
  [*Digital Dynamic Range Compressor Design, A Tutorial and Analysis*](https://secure.aes.org/forum/pubs/journal/?ID=174),
  JAES 60(6):399 to 408, 2012.
- SSL G-bus glue practice (4:1 ratio, 30 ms attack, 0.3 s / auto release, 2 to 4 dB GR, discrete
  releases 0.1/0.3/0.6/1.2 s):
  [UA SSL 4000 G Bus Compressor manual](https://help.uaudio.com/hc/en-us/articles/30847649785748-SSL-4000-G-Bus-Compressor-Manual).
- loudnorm option table, `linear=true` fallback-to-dynamic conditions, 192 kHz upsampling in dynamic
  mode, [ffmpeg 8.0 filter docs, loudnorm](https://ayosec.github.io/ffmpeg-filters-docs/8.0/Filters/Audio/loudnorm.html).
- LRA definition and typical broadcast ranges (5 to 20 LU; not a brick-wall spec):
  [EBU Tech 3342](https://tech.ebu.ch/docs/tech/tech3342.pdf), [EBU Tech 3343](https://tech.ebu.ch/docs/tech/tech3343.pdf).
- Haas/precedence timing (fusion up to ~35 ms, strong 5 to 25 ms, comb filtering below ~5 ms):
  [Pro Sound Training, "The Effective Haas Effect"](https://www.prosoundtraining.com/2010/03/15/its-about-time-the-effective-haas-effect/),
  [iZotope, "What Is the Haas Effect"](https://www.izotope.com/community/blog/what-is-the-haas-effect).
- Laptop speaker LF roll-off around 200 Hz, and mixing for small speakers:
  [Waves, "8 Tips for Great Mixes on Small Speakers"](https://www.waves.com/tips-for-great-mixes-on-small-speakers).
- Pink noise filter constants, Paul Kellett's refined method, musicdsp.org (public domain).
  **UNVERIFIED** by fetch in this session; the constants are the canonical published set and are
  self-checking (render 10 s, FFT, confirm −3 dB/octave).
- ZDF/TPT ladder topology, Vadim Zavalishin, *The Art of VA Filter Design*. **UNVERIFIED** by fetch;
  the closed-form solve `y4 = (G⁴x + S)/(1 + kG⁴)` is derived from first principles in §3.2 above
  and can be checked by substitution.
- PolyBLEP, Välimäki & Huovilainen family of BLEP oscillators. **UNVERIFIED** by fetch; the 2-point
  residual `t+t−t²−1` / `t²+t+t+1` is the standard published form and is testable by FFT
  (aliases should drop ~20 dB versus a naive saw at D5).
- Wow/flutter depths in §6.1 and the exact hall HF/LF decay ratio in §2.2: **UNVERIFIED**, set by
  convention. Measure if it matters.
