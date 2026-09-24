// Doodle Voyager audio: hold music, combat music, effects and loops, all
// synthesised with Web Audio. Instrument notes, drum hits and effects are
// drawn from maths into small AudioBuffers once (mostly at 24 kHz, in idle
// time), then every sound plays as one buffer source plus one gain. That keeps
// both the main thread and the audio thread light enough for a Chromebook.
// Music runs on a lookahead scheduler against AudioContext.currentTime.

const LOOKAHEAD = 0.3;      // seconds of music scheduled ahead of the clock
const TICK_MS = 60;
const SLICE_MS = 8;         // longest a deck may spend drawing samples in one tick
const MAX_SFX = 28;         // effects sounding at once before minor ones are dropped
const MUSIC_TRIM = 1.8;
const SFX_TRIM = 1;
const POST_GAIN = 1;
const RISER_LEVEL = 0.35;
const RISER_CYCLE = 12;     // seconds for one riser voice to climb four octaves
const RISER_STEP = 3;
const LO = 24000;           // draw rate for mellow buffers; cymbals and clicks use the context rate
const TAU = Math.PI * 2;

let ctx = null;
let SR = 48000;
let RR = LO;                // rate of the buffer being drawn right now
let G = null;
let timer = 0;
let decks = [];
let riser = null;
let worker = null;
let warned = false;
let deckNo = 0;
const bank = new Map();
const live = [];
const prefs = { music: 0.45, sfx: 0.7, sel: 0, base: 'cruise', warp: false };
const session = (Math.random() * 2 ** 32) >>> 0;

// ---------- small helpers ----------
const clamp01 = (v) => { const n = Number(v); return n > 0 ? (n < 1 ? n : 1) : 0; };
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const pc12 = (m) => ((m % 12) + 12) % 12;
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function warnOnce(e) {
  if (warned) return;
  warned = true;
  console.warn('[audio]', e);
}

// ---------- offline DSP (runs once per buffer) ----------
const SINT = new Float32Array(4097);
for (let i = 0; i <= 4096; i++) SINT[i] = Math.sin((TAU * i) / 4096);
// Sine of a phase given in cycles, from the table.
function sn(p) {
  const x = (p - Math.floor(p)) * 4096, i = x | 0;
  return SINT[i] + (SINT[i + 1] - SINT[i]) * (x - i);
}
const tanh = (x) => (x < -3 ? -1 : x > 3 ? 1 : (x * (27 + x * x)) / (27 + 9 * x * x));
const decay = (tau) => Math.exp(-1 / (tau * RR));
function coef(type, f, q) {
  const w = (TAU * Math.min(Math.max(f, 20), RR * 0.45)) / RR;
  const c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  return [b0 / a0, b1 / a0, b2 / a0, (-2 * c) / a0, (1 - al) / a0];
}
// In-place biquad; f may be a function of time for sweeps.
function filt(d, type, f, q = 0.707) {
  const dyn = typeof f === 'function';
  let k = dyn ? coef(type, f(0), q) : coef(type, f, q), x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let b0 = k[0], b1 = k[1], b2 = k[2], a1 = k[3], a2 = k[4];
  for (let i = 0; i < d.length; i++) {
    if (dyn && (i & 31) === 0) { k = coef(type, f(i / RR), q); b0 = k[0]; b1 = k[1]; b2 = k[2]; a1 = k[3]; a2 = k[4]; }
    const x = d[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    d[i] = y;
  }
  return d;
}
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
// polyBLEP saw and square for a phase p in [0, 1) advancing dt per sample
const saw = (p, dt) => 2 * p - 1 - blep(p, dt);
const sq = (p, dt) => (p < 0.5 ? 1 : -1) + blep(p, dt) - blep(p < 0.5 ? p + 0.5 : p - 0.5, dt);
const arr = (sec) => new Float32Array(Math.max(2, Math.ceil(sec * RR)));
let NZ = null;
// White noise copied from one shared table at a random offset.
function white(d, r, a = 1) {
  if (!NZ) {
    NZ = new Float32Array(1 << 17);
    const g = rng(777);
    for (let i = 0; i < NZ.length; i++) NZ[i] = g() * 2 - 1;
  }
  const m = NZ.length - 1;
  let j = Math.floor(r() * NZ.length);
  for (let i = 0; i < d.length; i++) { d[i] = NZ[j] * a; j = (j + 1) & m; }
  return d;
}
function shape(d, att, dec) {
  const ka = att > 0 ? decay(att) : 0, kd = decay(dec);
  let ea = 1, ed = 1;
  for (let i = 0; i < d.length; i++) { d[i] *= (1 - ea) * ed; ea *= ka; ed *= kd; }
  return d;
}
function mix(dst, src, g = 1, at = 0) {
  const o = Math.round(at * RR);
  for (let i = 0; i < src.length && i + o < dst.length; i++) dst[i + o] += src[i] * g;
  return dst;
}
function norm(d, peak = 1) {
  let m = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > m) m = a; }
  const k = m > 1e-9 ? peak / m : 0;
  for (let i = 0; i < d.length; i++) d[i] *= k;
  return d;
}
// Normalise and fade the last few ms so no buffer ends on a click.
function finish(d, peak = 0.9, fade = 0.008) {
  norm(d, peak);
  const f = Math.min(d.length, Math.round(fade * RR));
  for (let i = 0; i < f; i++) d[d.length - 1 - i] *= i / f;
  return d;
}
// Run a drawing function at a given rate.
function at(rate, fn) {
  const prev = RR;
  RR = rate;
  try { return fn(); } finally { RR = prev; }
}
// Sum of decaying sine partials: [ratio, amp, decay seconds].
function additive(f, len, parts, att = 0.0015) {
  const d = arr(len), P = parts.filter(([m]) => m * f < RR * 0.45), n = P.length;
  const inc = P.map(([m]) => (m * f) / RR), amp = P.map((p) => p[1]), k = P.map((p) => decay(p[2]));
  const e = amp.slice(), ph = new Float64Array(n), ka = decay(att);
  let ea = 1;
  for (let i = 0; i < d.length; i++) {
    let y = 0;
    for (let j = 0; j < n; j++) {
      y += e[j] * sn(ph[j]);
      ph[j] += inc[j];
      if (ph[j] >= 1) ph[j] -= 1;
      e[j] *= k[j];
    }
    d[i] = y * (1 - ea);
    ea *= ka;
  }
  return d;
}
// Sine whose pitch falls from base + extra toward base: kicks, booms, thuds.
function thump(len, base, extra, ftau, tau, att = 0.001) {
  const d = arr(len), kf = decay(ftau), kd = decay(tau), ka = decay(att);
  let ef = 1, ed = 1, ea = 1, p = 0;
  for (let i = 0; i < d.length; i++) {
    p += (base + extra * ef) / RR;
    d[i] = sn(p) * ed * (1 - ea);
    ef *= kf; ed *= kd; ea *= ka;
  }
  return d;
}
function bubble(r, f0, tau = 0.035) {
  const b = arr(tau * 4), n = tau * 1.7 * RR, kd = decay(tau), ka = decay(0.002);
  let p = 0, ed = 1, ea = 1;
  for (let i = 0; i < b.length; i++) {
    p += (f0 * (1 + 2.2 * Math.min(1, i / n))) / RR;
    b[i] = sn(p) * ed * (1 - ea);
    ed *= kd; ea *= ka;
  }
  return b;
}
const tick = (r, sec, type, f, dec) => shape(filt(white(arr(sec), r), type, f), 0.0003, dec);

// ---------- instruments (drawn at a few roots, pitched by playbackRate) ----------
// Electric piano: 1:1 FM with a decaying index, plus a short tine ping.
function iEP(f) {
  const d = arr(2.6), inc = f / RR, bright = 0.45 + 0.75 * Math.min(1, 200 / f), tine = 14 * f < RR * 0.45;
  const k1 = decay(0.5), k2 = decay(2.6), ki = decay(0.3), kt = decay(0.035), ka = decay(0.0025);
  let e1 = 1, e2 = 1, ei = 1, et = 1, ea = 1, p = 0, pt = 0;
  for (let i = 0; i < d.length; i++) {
    let y = sn(p + ((1.7 * ei + 0.22) * bright * sn(p)) / TAU);
    if (tine) { y += 0.07 * et * sn(pt); pt += 14 * inc; if (pt >= 1) pt -= 1; }
    d[i] = y * (0.6 * e1 + 0.4 * e2) * (1 - ea);
    p += inc;
    if (p >= 1) p -= 1;
    e1 *= k1; e2 *= k2; ei *= ki; et *= kt; ea *= ka;
  }
  return { d, f };
}
// Vibraphone bars ring at 1x, 4x and 10x.
const iVib = (f) => ({ d: additive(f, 3, [[1, 1, 3.0], [4, 0.3, 0.55], [10, 0.07, 0.1]]), f });
const iCel = (f) => ({ d: additive(f, 2.4, [[1, 1, 1.3], [2, 0.25, 0.4], [4.2, 0.16, 0.1], [9.1, 0.06, 0.03]]), f });
function iFlute(f) {
  const d = arr(2.4), br = filt(white(arr(2.4), rng(11)), 'bp', Math.min(f * 2, RR * 0.4), 1.2);
  const kb = decay(0.035), k6 = decay(6), kq = decay(0.25), att = 0.07 * RR, bra = 0.008 * RR, v0 = 0.28 * RR, v1 = 0.35 * RR;
  let p = 0, vp = 0, eb = 1, e6 = 1, eq = 1;
  for (let i = 0; i < d.length; i++) {
    const vib = 1 + 0.0045 * Math.min(1, Math.max(0, (i - v0) / v1)) * sn(vp);
    vp += 5.2 / RR;
    p += (f * vib) / RR;
    if (p >= 1) p -= 1;
    const s = sn(p) + 0.2 * sn(2 * p) + 0.06 * sn(3 * p);
    d[i] = s * Math.min(1, i / att) * (0.8 + 0.2 * eq) * e6 + br[i] * (0.08 + 0.5 * eb) * Math.min(1, i / bra);
    eb *= kb; e6 *= k6; eq *= kq;
  }
  return { d, f };
}
// Nylon string, Karplus-Strong. The averaging loop has a period of N - 0.5.
function iGtr(f) {
  const N = Math.max(4, Math.round(RR / f + 0.5)), ring = new Float32Array(N), r = rng(hash('g' + N));
  let lp = 0, mean = 0;
  for (let i = 0; i < N; i++) { lp += 0.6 * (r() * 2 - 1 - lp); ring[i] = lp; mean += lp; }
  mean /= N;
  for (let i = 0; i < N; i++) ring[i] -= mean;
  const d = arr(2.2);
  let p = 0;
  for (let i = 0; i < d.length; i++) {
    const n = p + 1 === N ? 0 : p + 1, a = ring[p];
    d[i] = a;
    ring[p] = 0.5 * (a + ring[n]) * 0.9968;
    p = n;
  }
  return { d: filt(d, 'lp', 3500), f: RR / (N - 0.5) };
}
function iBass(f) {
  const d = arr(2.2), inc = f / RR, r = rng(5), c = 1 - Math.exp((-TAU * 700) / RR);
  const k1 = decay(0.9), k2 = decay(0.35), k3 = decay(0.16), kL = decay(3), kt = decay(0.012), ka = decay(0.004);
  let e1 = 1, e2 = 1, e3 = 1, eL = 1, et = 1, ea = 1, lp = 0, p = 0;
  for (let i = 0; i < d.length; i++) {
    let y = sn(p) + 0.5 * e2 * sn(2 * p) + 0.22 * e3 * sn(3 * p);
    y *= 0.65 * e1 + 0.35 * eL;
    lp += c * (r() * 2 - 1 - lp);
    d[i] = (y + 0.6 * et * lp) * (1 - ea);
    p += inc;
    if (p >= 1) p -= 1;
    e1 *= k1; e2 *= k2; e3 *= k3; eL *= kL; et *= kt; ea *= ka;
  }
  return { d, f };
}
function iSBass(f) {
  const d = arr(0.7), dt1 = f / RR, dt2 = (f * 1.006) / RR, ka = decay(0.002), kd = decay(0.25);
  let p1 = 0, p2 = 0.3;
  for (let i = 0; i < d.length; i++) {
    p1 += dt1; if (p1 >= 1) p1 -= 1;
    p2 += dt2; if (p2 >= 1) p2 -= 1;
    d[i] = 0.6 * saw(p1, dt1) + 0.4 * saw(p2, dt2);
  }
  filt(d, 'lp', (t) => 380 + 2400 * Math.exp(-t / 0.09), 1.4);
  let ea = 1, ed = 1;
  for (let i = 0; i < d.length; i++) { d[i] *= (1 - ea) * (0.55 + 0.45 * ed); ea *= ka; ed *= kd; }
  return { d, f };
}
function iLead(f) {
  const d = arr(2), v0 = 0.18 * RR, v1 = 0.3 * RR, ka = decay(0.004), kd = decay(0.2), k5 = decay(5);
  let p1 = 0, p2 = 0.5, vp = 0;
  for (let i = 0; i < d.length; i++) {
    const vib = 1 + 0.006 * Math.min(1, Math.max(0, (i - v0) / v1)) * sn(vp);
    vp += 5.6 / RR;
    const dt1 = (f * vib) / RR, dt2 = dt1 * 1.005;
    p1 += dt1; if (p1 >= 1) p1 -= 1;
    p2 += dt2; if (p2 >= 1) p2 -= 1;
    d[i] = 0.7 * sq(p1, dt1) + 0.3 * saw(p2, dt2);
  }
  filt(d, 'lp', 3600, 0.9);
  let ea = 1, ed = 1, e5 = 1;
  for (let i = 0; i < d.length; i++) { d[i] *= (1 - ea) * (0.75 + 0.25 * ed) * e5; ea *= ka; ed *= kd; e5 *= k5; }
  return { d, f };
}
function iPluck(f) {
  const d = arr(0.5), dt = f / RR;
  let p = 0;
  for (let i = 0; i < d.length; i++) { p += dt; if (p >= 1) p -= 1; d[i] = sq(p, dt); }
  filt(d, 'lp', (t) => 700 + 4200 * Math.exp(-t / 0.05), 1.2);
  return { d: shape(d, 0.001, 0.11), f };
}
// String pad, a seamless 2 s loop: every oscillator fits a whole number of
// cycles, and the first 0.1 s (filter settling) is drawn and thrown away.
function iStr(f) {
  const L = Math.round(2 * RR), W = Math.round(0.1 * RR), tmp = new Float32Array(L + W);
  const whole = (x) => (Math.max(1, Math.round((x * L) / RR)) * RR) / L;
  const fs = [whole(f * 0.9962), whole(f), whole(f * 1.0041), whole(f * 2.003)];
  const gs = [0.33, 0.33, 0.33, 0.12], dts = fs.map((x) => x / RR), ph = [0, 0.21, 0.42, 0.63];
  for (let i = 0; i < tmp.length; i++) {
    let y = 0;
    for (let j = 0; j < 4; j++) {
      ph[j] += dts[j];
      if (ph[j] >= 1) ph[j] -= 1;
      y += gs[j] * saw(ph[j], dts[j]);
    }
    tmp[i] = y;
  }
  filt(tmp, 'lp', 1500, 0.6);
  filt(tmp, 'lp', 2400, 0.6);
  return { d: tmp.slice(W, W + L), f: fs[1] };
}
const INST = {
  ep: { roots: [48, 60, 72], rel: 0.3, make: iEP },
  vib: { roots: [60, 72, 84], rel: 0.5, make: iVib },
  cel: { roots: [72, 84], rel: 0.4, make: iCel },
  flute: { roots: [72, 84], rel: 0.1, make: iFlute },
  gtr: { roots: [48, 60, 72], rel: 0.1, make: iGtr },
  bass: { roots: [36, 48], rel: 0.08, make: iBass },
  sbass: { roots: [36, 48], rel: 0.04, make: iSBass },
  lead: { roots: [60, 72, 84], rel: 0.07, make: iLead },
  pluck: { roots: [60, 72], rel: 0.04, make: iPluck },
  str: { roots: [48, 60], rel: 0.9, att: 0.4, loop: true, make: iStr },
};
function rootFor(name, m) {
  const R = INST[name].roots;
  let root = R[0];
  for (const r of R) if (Math.abs(m - r) < Math.abs(m - root)) root = r;
  return root;
}

// ---------- drum hits (hi: drawn at the context rate for the cymbal air) ----------
const DRUM = {
  hat: { g: 0.35, hi: 1, make: (r) => shape(filt(white(arr(0.12), r), 'hp', 7000), 0.0008, 0.022) },
  ride: { g: 0.3, hi: 1, make: (r) => shape(filt(filt(white(arr(0.5), r), 'hp', 4200), 'lp', 11000), 0.001, 0.1) },
  swish: { g: 0.35, hi: 1, make: (r) => shape(filt(white(arr(0.34), r), 'bp', 3000, 0.6), 0.05, 0.09) },
  rim: { g: 0.45, make: (r) => mix(additive(1750, 0.08, [[1, 1, 0.007], [520 / 1750, 0.6, 0.012]], 0.0002), tick(r, 0.03, 'bp', 3500, 0.003), 0.8) },
  shaker: { g: 0.3, hi: 1, make: (r) => shape(filt(white(arr(0.1), r), 'bp', 6500, 1.1), 0.006, 0.022) },
  kickS: { g: 0.8, make: () => thump(0.35, 44, 50, 0.035, 0.14, 0.002) },
  kick: {
    g: 1,
    make: (r) => {
      const d = mix(thump(0.45, 44, 120, 0.03, 0.2, 0.0005), tick(r, 0.03, 'hp', 1500, 0.003), 0.5);
      for (let i = 0; i < d.length; i++) d[i] = tanh(1.5 * d[i]);
      return d;
    },
  },
  snare: { g: 0.7, make: (r) => mix(shape(filt(white(arr(0.3), r), 'hp', 1200), 0.0005, 0.085), additive(185, 0.3, [[1, 0.6, 0.05], [330 / 185, 0.3, 0.03]], 0.0005)) },
  hatT: { g: 0.3, hi: 1, make: (r) => shape(filt(white(arr(0.07), r), 'hp', 8500), 0.0005, 0.014) },
  crash: { g: 0.35, hi: 1, make: (r) => shape(filt(filt(white(arr(1.8), r), 'hp', 4000), 'lp', 12000), 0.001, 0.5) },
};

// ---------- sound effects ----------
function sLaser(r) {
  const d = arr(0.17), f0 = 1500 * (0.9 + 0.2 * r()), n = Math.round(0.13 * RR), kf = Math.pow(140 / f0, 1 / n);
  const ka = decay(0.001), kd = decay(0.05);
  let f = f0, p = 0, ea = 1, ed = 1;
  for (let i = 0; i < d.length; i++) {
    const dt = f / RR;
    p += dt; if (p >= 1) p -= 1;
    d[i] = sq(p, dt) * (1 - ea) * ed;
    if (i < n) f *= kf;
    ea *= ka; ed *= kd;
  }
  return filt(d, 'lp', 5200);
}
function sLaserEnemy(r) {
  const d = arr(0.26), f0 = 780 * (0.9 + 0.2 * r()), n = Math.round(0.2 * RR), kf = Math.pow(95 / f0, 1 / n);
  const ka = decay(0.002), kd = decay(0.075), kn = decay(0.015);
  let f = f0, p1 = 0, p2 = 0.4, ea = 1, ed = 1, en = 0.15;
  for (let i = 0; i < d.length; i++) {
    const dt = f / RR;
    p1 += dt; if (p1 >= 1) p1 -= 1;
    p2 += dt * 0.5; if (p2 >= 1) p2 -= 1;
    d[i] = (0.55 * saw(p1, dt) + 0.45 * sq(p2, dt * 0.5)) * (1 - ea) * ed + en * (r() * 2 - 1);
    if (i < n) f *= kf;
    ea *= ka; ed *= kd; en *= kn;
  }
  return filt(d, 'lp', 3200);
}
function sBeamCharge() {
  const T = 2.2, d = arr(T + 0.05), n = Math.round(T * RR), k = Math.pow(16, 1 / n);
  let f = 110, p1 = 0, p2 = 0, lph = 0;
  for (let i = 0; i < d.length; i++) {
    const x = Math.min(1, i / n), dt = f / RR;
    p1 += dt; if (p1 >= 1) p1 -= 1;
    p2 += 2 * dt; if (p2 >= 1) p2 -= 1;
    lph += (5 + 35 * x * x) / RR;
    d[i] = (0.55 * saw(p1, dt) + 0.45 * sn(p2)) * (0.12 + 0.88 * x * Math.sqrt(x)) * (0.6 + 0.4 * sn(lph));
    if (i < n) f *= k;
  }
  return filt(d, 'bp', (t) => 220 * 16 ** Math.min(1, t / T), 1.8);
}
function sBeamFire(r) {
  const d = arr(1.7), fs = [55, 55.7, 110.4, 165.3], ph = [0, 0.17, 0.34, 0.51], c = 1 - Math.exp((-TAU * 900) / RR);
  const kc = decay(0.02), rel0 = Math.round(1.4 * RR), kr = decay(0.08), att = 0.02 * RR;
  let lp = 0, ec = 1, er = 1, am = 0;
  for (let i = 0; i < d.length; i++) {
    let y = 0;
    for (let j = 0; j < 4; j++) {
      const dt = fs[j] / RR;
      ph[j] += dt;
      if (ph[j] >= 1) ph[j] -= 1;
      y += 0.25 * saw(ph[j], dt);
    }
    am += 33 / RR;
    lp += c * (r() * 2 - 1 - lp);
    let a = Math.min(1, i / att);
    if (i > rel0) { a *= er; er *= kr; }
    const crack = ec > 0.003 ? (r() * 2 - 1) * ec : 0;
    ec *= kc;
    d[i] = tanh(2 * (y * (0.62 + 0.38 * sn(am)) + 0.6 * lp) * a) + 0.7 * crack;
  }
  return filt(d, 'lp', 2800, 0.8);
}
function sExplosion(r) {
  const d = filt(white(arr(1.3), r), 'lp', (t) => 180 + 3800 * Math.exp(-t / 0.12), 0.9);
  const th = thump(1.3, 38, 90, 0.07, 0.22, 0.0005), ka = decay(0.003), kd = decay(0.32);
  let ea = 1, ed = 1;
  for (let i = 0; i < d.length; i++) {
    d[i] = tanh(1.6 * (1.6 * d[i] * (1 - ea) * ed + 0.9 * th[i]));
    ea *= ka; ed *= kd;
  }
  return d;
}
function sBigExplosion(r) {
  const T = 3, d = filt(white(arr(T), r), 'lp', (t) => 70 + 1800 * Math.exp(-t / 0.3), 0.8), c = arr(T);
  const a0 = Math.round(0.1 * RR), a1 = Math.round(1.8 * RR), pc = 43 / RR;
  for (let i = a0; i < a1; i++) if (r() < pc) c[i] = (r() * 2 - 1) * (1 - i / a1) * 4;
  filt(c, 'bp', 1800, 1.2);
  const th = mix(thump(T, 24, 70, 0.12, 0.6), thump(T - 0.22, 30, 50, 0.1, 0.35), 0.5, 0.22);
  const ka = decay(0.005), k1 = decay(0.25), k2 = decay(1.1);
  let ea = 1, e1 = 1, e2 = 1;
  for (let i = 0; i < d.length; i++) {
    d[i] = tanh(1.3 * (2.2 * d[i] * (1 - ea) * (0.6 * e1 + 0.4 * e2) + th[i] + c[i]));
    ea *= ka; e1 *= k1; e2 *= k2;
  }
  return d;
}
function sHit(r) {
  const d = additive(380 + 160 * r(), 0.28, [[1, 1, 0.1], [2.76, 0.55, 0.06], [5.4, 0.35, 0.035], [8.93, 0.18, 0.02]], 0.0003);
  return mix(d, tick(r, 0.05, 'hp', 2000, 0.006), 1.2);
}
function sAlarm() {
  const d = arr(1.56), k = 1 - Math.exp((-TAU * 60) / RR), seg = Math.round(0.26 * RR), fi = Math.round(0.01 * RR);
  let f = 587, p1 = 0, p2 = 0.3;
  for (let i = 0; i < d.length; i++) {
    f += k * ((Math.floor(i / seg) % 2 ? 440 : 587) - f);
    const dt = f / RR;
    p1 += dt; if (p1 >= 1) p1 -= 1;
    p2 += dt * 1.003; if (p2 >= 1) p2 -= 1;
    d[i] = tanh(2 * (0.6 * sq(p1, dt) + 0.4 * saw(p2, dt * 1.003)));
  }
  filt(d, 'bp', 1100, 0.9);
  for (let i = 0; i < fi; i++) d[i] *= i / fi;
  return d;
}
function sWarpCharge(r) {
  const T = 3, d = arr(T), nz = filt(white(arr(T), r), 'bp', (t) => 300 * 2 ** (4 * Math.min(1, t / T)), 1.5);
  const n = d.length, k = Math.pow(16, 1 / n), fo = Math.round(0.06 * RR);
  let f = 55, p1 = 0, p2 = 0, lph = 0;
  for (let i = 0; i < n; i++) {
    const x = i / n, dt = f / RR;
    p1 += dt; if (p1 >= 1) p1 -= 1;
    p2 += 2 * dt; if (p2 >= 1) p2 -= 1;
    lph += (4 + 26 * x * x) / RR;
    d[i] = (0.5 * saw(p1, dt) + 0.5 * sn(p2) + 1.2 * nz[i] * x * x) * (0.1 + 0.9 * Math.pow(x, 1.3)) * (0.7 + 0.3 * sn(lph));
    f *= k;
  }
  filt(d, 'lp', 5000);
  for (let i = 0; i < fo; i++) d[n - 1 - i] *= i / fo;
  return d;
}
function sWarpIn(r) {
  const T = 2, d = filt(white(arr(T), r), 'bp', (t) => (t < 0.35 ? 500 * 2 ** (10 * t) : 300 + 5500 * Math.exp(-(t - 0.35) / 0.6)), 1.1);
  const boom = thump(T, 28, 70, 0.15, 0.6, 0.0005), nz = Math.round(0.25 * RR), kz = Math.pow(16, 1 / nz);
  const kzd = decay(0.15), ka = decay(0.02), kd = decay(0.7);
  let fz = 200, pz = 0, ez = 0.5, ea = 1, ed = 1;
  for (let i = 0; i < d.length; i++) {
    pz += fz / RR;
    if (i < nz) fz *= kz;
    d[i] = tanh(1.5 * (boom[i] + ez * sn(pz) + 2.5 * d[i] * (1 - ea) * ed));
    ez *= kzd; ea *= ka; ed *= kd;
  }
  return d;
}
function sWarpOut(r) {
  const T = 1.5, d = filt(white(arr(T), r), 'bp', (t) => 6000 * Math.pow(0.05, Math.min(1, t / 1.2)), 1.2);
  const small = thump(T, 40, 40, 0.08, 0.2), n = Math.round(RR), k = Math.pow(0.05, 1 / n), a4 = 0.04 * RR, kd = decay(0.5), ks = decay(0.45);
  let f = 1400, p = 0, ed = 1, es = 0.4;
  for (let i = 0; i < d.length; i++) {
    p += f / RR;
    if (i < n) f *= k;
    d[i] = 2.2 * d[i] * Math.min(1, i / a4) * ed + es * sn(p) + 0.5 * small[i];
    ed *= kd; es *= ks;
  }
  return d;
}
// Menu click: a ballpoint pen, press and release.
function sUi(r) {
  const d = arr(0.09);
  for (const [t0, g, fr] of [[0, 1, 3300], [0.038, 0.6, 3700]]) {
    const c = shape(filt(white(arr(0.04), r), 'hp', 2500), 0, 0.0012);
    mix(c, additive(fr, 0.04, [[1, 0.5, 0.004]], 0.00005));
    mix(c, additive(900, 0.04, [[1, 0.3, 0.006]], 0.00005));
    mix(d, c, g, t0);
  }
  return d;
}
const BELL = [[1, 1, 0.35], [2.76, 0.4, 0.1], [5.4, 0.2, 0.05]];
function sBuy(r) {
  const d = arr(0.8);
  mix(d, additive(1318.5, 0.7, BELL, 0.0003), 0.8, 0);
  mix(d, additive(1760, 0.7, BELL, 0.0003), 0.8, 0.09);
  return mix(d, shape(filt(white(arr(0.08), r), 'hp', 3000), 0.001, 0.03), 0.5);
}
function sDeny() {
  const d = arr(0.34), g0 = Math.round(0.13 * RR), g1 = Math.round(0.16 * RR), e2 = Math.round(0.18 * RR), fe = 0.01 * RR;
  const ka = decay(0.004), kd = decay(0.05);
  let p = 0, ea = 1, ed = 1;
  for (let i = 0; i < d.length; i++) {
    if (i === g1) { ea = 1; ed = 1; }
    if (i >= g0 && i < g1) continue;
    const first = i < g0, dt = (first ? 233 : 185) / RR, u = first ? i : i - g1, end = first ? g0 : e2;
    p += dt; if (p >= 1) p -= 1;
    d[i] = sq(p, dt) * (1 - ea) * (0.45 + 0.55 * ed) * Math.min(1, Math.max(0, (end - u) / fe));
    ea *= ka; ed *= kd;
  }
  return filt(d, 'lp', 1600);
}
function sFuel(r) {
  const d = filt(white(arr(1.2), r), 'lp', 650), n = d.length, f5 = 0.05 * RR, f3 = 0.3 * RR;
  let am = 0;
  for (let i = 0; i < n; i++) {
    am += 7 / RR;
    d[i] *= 0.8 * (0.6 + 0.4 * sn(am)) * Math.min(1, i / f5) * Math.min(1, (n - i) / f3);
  }
  for (const t0 of [0.03, 0.2, 0.36, 0.55, 0.71, 0.88]) mix(d, bubble(r, 160 + 140 * r()), 0.9, t0 + 0.02 * r());
  return mix(d, tick(r, 0.03, 'hp', 1500, 0.004), 0.6);
}
function sBomb(r) {
  const d = thump(0.95, 55, 100, 0.02, 0.05, 0.0005), s0 = Math.round(0.05 * RR), n = Math.round(0.9 * RR), k = Math.pow(450 / 2000, 1 / n);
  let f = 2000, p = 0;
  for (let i = s0; i < d.length; i++) {
    p += f / RR;
    f *= k;
    d[i] += 0.35 * sn(p) * sn(Math.min(1, (i - s0) / n) * 0.5);
  }
  return mix(d, tick(r, 0.03, 'lp', 2000, 0.005), 0.5);
}
function sFlush(r) {
  const T = 2.8, d = filt(white(arr(T), r), 'bp', (t) => 750 + 380 * Math.sin(TAU * 1.1 * t) + 260 * Math.sin(TAU * 0.37 * t + 1), 0.8);
  const lo = filt(white(arr(T), r), 'lp', 260);
  let am = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / RR;
    const e = t < 0.08 ? 0 : t < 0.4 ? (t - 0.08) / 0.32 : t < 1.6 ? 1
      : Math.max(0, 1 - (t - 1.6) / 1.1) * 0.7 + Math.max(0, 1 - (t - 1.6) / 1.2) * 0.3;
    am += 2.3 / RR;
    d[i] = e * (1.6 * d[i] + 1.8 * lo[i] * (0.7 + 0.3 * sn(am)));
  }
  mix(d, tick(r, 0.03, 'hp', 2500, 0.002), 0.8);
  mix(d, additive(220, 0.1, [[1, 1, 0.02]], 0.0003), 0.5, 0.01);
  for (let k = 0; k < 12; k++) mix(d, bubble(r, 150 + 300 * r(), 0.03), 0.35, 1.3 + 1.3 * r());
  return d;
}
function sSizzle(r) {
  const T = 2.6, h = filt(white(arr(T), r), 'hp', 3500), c = arr(T), am = norm(filt(white(arr(T), r), 'lp', 20)), pc = 190 / RR;
  for (let i = 0; i < c.length; i++) if (r() < pc) c[i] = (r() * 2 - 1) * (0.3 + 0.7 * r());
  filt(c, 'bp', 2600, 0.7);
  const a8 = 0.08 * RR, a6 = 0.6 * RR, n = h.length;
  for (let i = 0; i < n; i++) h[i] = Math.min(1, i / a8) * Math.min(1, (n - i) / a6) * (0.5 * h[i] * (0.35 + 0.65 * Math.abs(am[i])) + 3 * c[i]);
  return h;
}
function sDoor(r) {
  const d = shape(filt(white(arr(0.9), r), 'hp', 2200), 0.01, 0.22), m = arr(0.6), n = m.length, a3 = 0.03 * RR, a5 = 0.05 * RR, s55 = 0.55 * RR;
  let p = 0;
  for (let i = 0; i < n; i++) {
    const dt = (85 - 23 * Math.min(1, i / s55)) / RR;
    p += dt; if (p >= 1) p -= 1;
    m[i] = saw(p, dt) * 0.35 * Math.min(1, i / a3) * Math.min(1, (n - i) / a5);
  }
  mix(d, filt(m, 'lp', 350));
  mix(d, thump(0.25, 55, 65, 0.03, 0.07, 0.0005), 0.8, 0.6);
  return mix(d, tick(r, 0.03, 'lp', 1500, 0.01), 0.4, 0.6);
}
function sCoin() {
  const d = arr(0.5), s = Math.round(0.075 * RR), kd = decay(0.13);
  let p = 0, e = 1;
  for (let i = 0; i < d.length; i++) {
    const dt = (i < s ? 987.8 : 1318.5) / RR;
    p += dt; if (p >= 1) p -= 1;
    d[i] = sq(p, dt) * (i < s ? 0.8 : e);
    if (i >= s) e *= kd;
  }
  return filt(d, 'lp', 7000);
}
// Duct tape: a ratchet of sticky pulses through a rising band, then the slap.
function sSeal(r) {
  const d = filt(white(arr(0.65), r), 'bp', (t) => 1100 * 3.2 ** Math.min(1, t / 0.45), 1.4);
  const kd = decay(0.0035), end = Math.round(0.47 * RR), a2 = 0.02 * RR;
  let next = 0, e = 0;
  for (let i = 0; i < d.length; i++) {
    if (i >= next && i < end) { e = 1; next = i + Math.round((0.01 + 0.012 * r()) * RR); }
    e *= kd;
    d[i] *= i < end ? 2.5 * (0.25 * Math.min(1, i / a2) + e) : 0;
  }
  mix(d, thump(0.15, 70, 70, 0.02, 0.04, 0.0005), 0.7, 0.5);
  return mix(d, tick(r, 0.05, 'lp', 1200, 0.012), 0.8, 0.5);
}
// Hull breach: a bang, tearing metal, a screech, then air rushing out.
function sBreach(r) {
  const T = 3.2, d = filt(white(arr(T), r), 'lp', 1500), air = filt(white(arr(T), r), 'lp', (t) => 600 + 3000 * Math.exp(-t / 1.5), 0.6);
  const wob = norm(filt(white(arr(T), r), 'lp', 20)), tear = arr(T), base = [97, 139, 211], ph = [0, 0.3, 0.6];
  for (let i = 0; i < tear.length; i++) {
    const bend = (1 - 0.35 * Math.min(1, i / RR)) * (1 + 0.06 * wob[i]);
    let y = 0;
    for (let j = 0; j < 3; j++) {
      const dt = (base[j] * bend) / RR;
      ph[j] += dt;
      if (ph[j] >= 1) ph[j] -= 1;
      y += saw(ph[j], dt);
    }
    tear[i] = y;
  }
  filt(tear, 'bp', (t) => 900 - 450 * Math.min(1, t), 5);
  const boom = thump(T, 30, 45, 0.08, 0.3);
  const kb = decay(0.12), ka = decay(0.001), kt = decay(0.01), kt2 = decay(0.45), ks = decay(0.35), k8 = decay(0.8);
  const a35 = 0.35 * RR, a2 = 0.02 * RR, a6 = 0.6 * RR, N = d.length;
  let eb = 1, ea = 1, et = 1, et2 = 1, es = 0.22, e8 = 1, ps = 0, vib = 0;
  for (let i = 0; i < N; i++) {
    vib += 6 / RR;
    ps += (1900 * (1 + 0.03 * sn(vib))) / RR;
    const b = (1.8 * d[i] * eb + boom[i]) * (1 - ea);
    const tr = 2 * tear[i] * (1 - et) * et2;
    const sc = es * sn(ps) * Math.min(1, i / a2);
    const ai = 1.4 * air[i] * Math.min(1, i / a35) * (0.55 + 0.45 * e8) * Math.min(1, (N - i) / a6);
    d[i] = tanh(1.2 * (b + tr + sc + ai));
    eb *= kb; ea *= ka; et *= kt; et2 *= kt2; es *= ks; e8 *= k8;
  }
  return d;
}
// gain: level; vars: drawn variants; max: copies at once; gap: minimum spacing
// between copies; jit: random pitch; vip: never dropped under load; hi: full rate.
const SFX = {
  laser: { make: sLaser, vars: 3, gain: 0.4, max: 6, gap: 0.03, jit: 0.04 },
  laserEnemy: { make: sLaserEnemy, vars: 2, gain: 0.34, max: 6, gap: 0.035, jit: 0.06 },
  beamCharge: { make: sBeamCharge, gain: 0.55, max: 2, vip: 1 },
  beamFire: { make: sBeamFire, gain: 0.55, max: 2, vip: 1 },
  explosion: { make: sExplosion, vars: 2, gain: 0.6, max: 4, gap: 0.05, jit: 0.08 },
  bigExplosion: { make: sBigExplosion, gain: 0.8, max: 2, gap: 0.12, jit: 0.05, vip: 1 },
  hit: { make: sHit, vars: 3, gain: 0.4, max: 4, gap: 0.04, jit: 0.05 },
  alarm: { make: sAlarm, gain: 0.35, max: 1, gap: 0.3, vip: 1 },
  warpCharge: { make: sWarpCharge, gain: 0.5, max: 1, vip: 1 },
  warpIn: { make: sWarpIn, gain: 0.65, max: 1, vip: 1 },
  warpOut: { make: sWarpOut, gain: 0.5, max: 1, vip: 1 },
  ui: { make: sUi, gain: 0.35, max: 3, gap: 0.03, vip: 1, hi: 1 },
  buy: { make: sBuy, gain: 0.35, max: 2, vip: 1 },
  deny: { make: sDeny, gain: 0.3, max: 1, gap: 0.12, vip: 1 },
  fuel: { make: sFuel, gain: 0.45, max: 1, vip: 1 },
  bomb: { make: sBomb, gain: 0.45, max: 2 },
  flush: { make: sFlush, gain: 0.5, max: 1, vip: 1 },
  sizzle: { make: sSizzle, gain: 0.4, max: 1, vip: 1 },
  door: { make: sDoor, gain: 0.45, max: 2, vip: 1 },
  coin: { make: sCoin, gain: 0.32, max: 3, gap: 0.05, vip: 1, hi: 1 },
  seal: { make: sSeal, gain: 0.45, max: 1, vip: 1 },
  breach: { make: sBreach, gain: 0.7, max: 1, vip: 1 },
};
// Looping noise with the tail cross-faded into the head, so the loop point is seamless.
function noiseLoop(sec, brown) {
  const n = Math.round(sec * RR), F = Math.round(0.1 * RR), d = white(new Float32Array(n + F), rng(brown ? 21 : 22));
  if (brown) { filt(d, 'lp', 180, 0.5); filt(d, 'hp', 25); }
  for (let i = 0; i < F; i++) { const k = i / F; d[i] = d[i] * k + d[n + i] * (1 - k); }
  return finish(d.slice(0, n), 0.9, 0);
}

// ---------- the buffer bank ----------
// A job names one buffer: t is i(nstrument), d(rum), s(fx) or n(oise).
const job = (t, name, n = 0) => ({ key: t + ':' + name + n, t, name, n });
// Pure drawing, so the same code runs in the worker: returns { d, rate, f }.
function draw(j, sr) {
  const hi = (j.t === 'd' && DRUM[j.name].hi) || (j.t === 's' && SFX[j.name].hi);
  const rate = hi ? sr : LO;
  return at(rate, () => {
    if (j.t === 'i') {
      const I = INST[j.name], o = I.make(mtof(j.n));
      return { d: finish(o.d, 0.9, I.loop ? 0 : 0.008), rate, f: o.f };
    }
    if (j.t === 'd') return { d: finish(DRUM[j.name].make(rng(hash(j.name)))), rate };
    if (j.t === 's') return { d: finish(SFX[j.name].make(rng(hash(j.name) + j.n * 7919)), 0.9, 0.01), rate };
    return { d: noiseLoop(j.n, j.name === 'brown'), rate };
  });
}
function put(key, res) {
  const b = ctx.createBuffer(1, res.d.length, res.rate);
  b.getChannelData(0).set(res.d);
  bank.set(key, res.f ? { buf: b, f: res.f } : b);
}
// From the bank, or drawn right now on this thread if the worker has not got to it yet.
function get(j) {
  if (!bank.has(j.key)) put(j.key, draw(j, SR));
  return bank.get(j.key);
}
const sample = (name, m) => get(job('i', name, rootFor(name, m)));
const drumBuf = (k) => get(job('d', k));
const sfxBuf = (name, v) => get(job('s', name, v));
const brownNoise = () => get(job('n', 'brown', 4));
const whiteNoise = () => get(job('n', 'white', 2));

// This file is also its own worker: loaded with new Worker(import.meta.url),
// it draws every buffer off the main thread and posts the arrays back.
if (typeof window === 'undefined' && typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = (e) => {
    const { sr, jobs } = e.data || {};
    for (const j of jobs || []) {
      try {
        const res = draw(j, sr);
        self.postMessage({ key: j.key, d: res.d, rate: res.rate, f: res.f }, [res.d.buffer]);
      } catch (err) {
        self.postMessage({ key: j.key, error: String(err) });
      }
    }
  };
}

// ---------- master graph ----------
function clipCurve() {
  // identity up to 0.7, then a smooth knee that never passes 0.93
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = Math.sign(x) * (a < 0.7 ? a : 0.7 + 0.28 * Math.tanh((a - 0.7) / 0.28));
  }
  return c;
}
// Short dark room for the music, at the context rate (a convolver requires it).
function roomIR() {
  const len = Math.floor(0.8 * SR), b = ctx.createBuffer(2, len, SR), r = rng(99), kd = Math.exp(-1 / (0.17 * SR)), pre = Math.round(0.012 * SR);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0, e = 1;
    for (let i = 0; i < len; i++) {
      lp += (0.55 - 0.45 * (i / len)) * (r() * 2 - 1 - lp);
      d[i] = i < pre ? 0 : lp * e;
      e *= kd;
    }
  }
  return b;
}
function build() {
  SR = ctx.sampleRate;
  const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  G = {};
  G.master = gain(1);
  G.comp = ctx.createDynamicsCompressor();
  G.comp.threshold.value = -16;
  G.comp.knee.value = 12;
  G.comp.ratio.value = 4;
  G.comp.attack.value = 0.003;
  G.comp.release.value = 0.25;
  G.post = gain(POST_GAIN);
  G.clip = ctx.createWaveShaper();
  G.clip.curve = clipCurve();
  G.master.connect(G.comp);
  G.comp.connect(G.post);
  G.post.connect(G.clip);
  G.clip.connect(ctx.destination);
  G.musicVol = gain(prefs.music ** 2);
  G.musicVol.connect(G.master);
  G.duck = gain(1);
  G.duck.connect(G.musicVol);
  G.music = gain(MUSIC_TRIM);
  G.music.connect(G.duck);
  G.verb = gain(1);
  const conv = ctx.createConvolver();
  conv.buffer = roomIR();
  const verbOut = gain(0.6);
  G.verb.connect(conv);
  conv.connect(verbOut);
  verbOut.connect(G.duck);
  G.sfx = gain(prefs.sfx ** 2 * SFX_TRIM);
  G.sfx.connect(G.master);
}
function setParam(p, v) {
  const now = ctx.currentTime;
  p.cancelScheduledValues(now);
  p.setTargetAtTime(v, now, 0.05);
}
// Equal-power fade drawn as short linear segments (safe on every browser).
function fadeParam(p, to, sec) {
  const now = ctx.currentTime, from = p.value;
  p.cancelScheduledValues(now);
  p.setValueAtTime(from, now);
  for (let i = 1; i <= 6; i++) {
    const x = i / 6, k = to > from ? Math.sin((x * Math.PI) / 2) : 1 - Math.cos((x * Math.PI) / 2);
    p.linearRampToValueAtTime(from + (to - from) * k, now + sec * x);
  }
}

// ---------- voices ----------
function note(dest, name, m, t, dur, vel) {
  const I = INST[name], s = sample(name, m), rate = mtof(m) / s.f;
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = s.buf;
  src.playbackRate.value = rate;
  dur = Math.max(0.03, dur);
  if (I.loop) {
    src.loop = true;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + Math.min(I.att, dur * 0.5));
    src.start(t, Math.random() * s.buf.duration);
    src.stop(t + dur + I.rel * 1.6);
  } else {
    g.gain.setValueAtTime(vel, t);
    src.start(t);
    src.stop(Math.min(t + s.buf.duration / rate, t + dur + I.rel * 1.6));
  }
  g.gain.setTargetAtTime(0, t + dur, I.rel / 4);
  src.connect(g);
  g.connect(dest);
}
function drum(dest, k, t, vel) {
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = drumBuf(k);
  g.gain.value = DRUM[k].g * vel;
  src.connect(g);
  g.connect(dest);
  src.start(t);
}

// ---------- harmony ----------
const Q = {
  maj9: [0, 4, 7, 11, 14], '6/9': [0, 4, 7, 9, 14], m9: [0, 3, 7, 10, 14], m7: [0, 3, 7, 10],
  9: [0, 4, 7, 10, 14], 13: [0, 4, 7, 10, 14, 21], '7b9': [0, 4, 7, 10, 13], '7sus': [0, 5, 7, 10, 14],
  m7b5: [0, 3, 6, 10], 7: [0, 4, 7, 10], m: [0, 3, 7], maj: [0, 4, 7],
};
// Rootless jazz voicings (the bass has the root), two shapes each for voice leading.
const VOICE = {
  maj9: [[4, 7, 11, 14], [11, 14, 16, 19]],
  '6/9': [[4, 9, 14, 19], [2, 4, 7, 9]],
  m9: [[3, 7, 10, 14], [10, 14, 15, 19]],
  m7: [[3, 7, 10, 12], [10, 12, 15, 19]],
  9: [[4, 7, 10, 14], [10, 14, 16, 19]],
  13: [[4, 9, 10, 14], [10, 14, 16, 21]],
  '7b9': [[4, 9, 10, 13], [10, 13, 16, 21]],
  '7sus': [[5, 7, 10, 14], [10, 14, 17, 19]],
  m7b5: [[3, 6, 10, 12], [6, 10, 12, 15]],
  7: [[4, 7, 10, 12], [10, 12, 16, 19]],
  m: [[0, 3, 7, 12], [3, 7, 12, 15], [7, 12, 15, 19]],
  maj: [[0, 4, 7, 12], [4, 7, 12, 16], [7, 12, 16, 19]],
};
// Pick the voicing inside [lo, hi] that moves least from the previous chord.
function voicing(pc, q, prev, lo, hi) {
  const mid = (lo + hi) / 2;
  let best = null, score = Infinity;
  for (const sh of VOICE[q]) {
    for (let base = pc; base < 100; base += 12) {
      const v = sh.map((x) => base + x);
      if (v[0] < lo || v[v.length - 1] > hi) continue;
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      let s = Math.abs(mean - mid) * (prev ? 0.35 : 1);
      if (prev) for (let i = 0; i < v.length; i++) s += Math.abs(v[i] - prev[Math.min(i, prev.length - 1)]);
      if (s < score) { score = s; best = v; }
    }
  }
  return best || VOICE[q][0].map((x) => pc + 48 + x);
}
function near(pc, ref, lo, hi) {
  let m = pc + 12 * Math.round((ref - pc) / 12);
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  return m;
}
const tones = (s) => Q[s.q].map((x) => (s.pc + x) % 12);
function snap(m, pcs, dir) {
  for (let k = 0; k <= 6; k++) {
    const a = dir >= 0 ? m + k : m - k, b = dir >= 0 ? m - k : m + k;
    if (pcs.includes(pc12(a))) return a;
    if (pcs.includes(pc12(b))) return b;
  }
  return m;
}
function segAt(B, beat) {
  for (let i = B.segs.length - 1; i >= 0; i--) if (beat >= B.segs[i].at - 1e-6) return B.segs[i];
  return B.segs[0];
}
const fifthOf = (s, r, top) => (r + Q[s.q][2] > top ? r + Q[s.q][2] - 12 : r + Q[s.q][2]);

// ---------- melody: seeded motifs that mutate a little each time round ----------
const CELLS = {
  4: [[[0, 1.5], [1.5, 0.5], [2, 2]], [[0, 1], [1, 1], [2, 1.5], [3.5, 0.5]], [[0.5, 1], [1.5, 1], [2.5, 1.5]], [[0, 3], [3, 1]],
    [[0, 0.5], [0.5, 0.5], [1, 1], [2, 2]], [[1, 1], [2, 1], [3, 1]], [[0, 2], [2, 1], [3, 1]], [[0, 1.5], [1.5, 1.5], [3, 1]]],
  3: [[[0, 2], [2, 1]], [[0, 1], [1, 1], [2, 1]], [[0, 1.5], [1.5, 1.5]], [[1, 1], [2, 1]], [[0, 3]], [[0, 1], [1, 2]]],
  C: [[[0, 0.5], [0.5, 0.5], [1, 1], [2, 0.5], [2.5, 0.5], [3, 1]], [[0, 1.5], [1.5, 0.5], [2, 1], [3, 0.5], [3.5, 0.5]],
    [[0, 0.75], [0.75, 0.75], [1.5, 0.5], [2, 2]], [[0, 0.5], [1, 0.5], [1.5, 0.5], [2, 1], [3, 1]], [[0, 1], [1, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 1.5]]],
};
const ENDS = {
  4: [[[0, 4]], [[0, 2.5]], [[0, 1], [1, 3]], [[0, 1.5], [1.5, 2.5]]],
  3: [[[0, 3]], [[0, 2]], [[0, 1], [1, 2]]],
  C: [[[0, 2], [2, 2]], [[0, 1.5], [1.5, 0.5], [2, 2]], [[0, 4]]],
};
function step(r) {
  const x = r(), m = x < 0.12 ? 0 : x < 0.62 ? 1 : x < 0.87 ? 2 : x < 0.95 ? 3 : 4;
  return r() < 0.5 ? -m : m;
}
const cell = (r, list) => pick(r, list).map(([o, d]) => ({ o, d, s: step(r) }));
const phrase = (r, k) => [cell(r, CELLS[k]), cell(r, CELLS[k]), cell(r, CELLS[k]), cell(r, ENDS[k])];
function idx2m(T, i, sc = T.scale) { const o = Math.floor(i / 7); return T.key + 12 * o + sc[i - o * 7]; }
function m2idx(T, m) {
  let best = 0, bd = Infinity;
  for (let i = -21; i <= 42; i++) { const d = Math.abs(idx2m(T, i) - m); if (d < bd) { bd = d; best = i; } }
  return best;
}
function makeMel(dk) {
  const T = dk.track, r = dk.r;
  const M = { lo: m2idx(T, T.mel[1]), hi: m2idx(T, T.mel[2]), ph: {}, end2: {}, seen: {}, rest: false, lastRest: false };
  M.idx = Math.round((M.lo + M.hi) / 2);
  for (const L of ['A', 'B']) { M.ph[L] = phrase(r, T.cells); M.end2[L] = cell(r, ENDS[T.cells]); }
  return M;
}
// Scale walk; strong beats land on chord tones and no note sits a semitone off one.
function melPitch(dk, B, n) {
  const T = dk.track, M = dk.mel;
  let i = M.idx + n.s;
  if (i > M.hi) i = 2 * M.hi - i;
  if (i < M.lo) i = 2 * M.lo - i;
  i = Math.min(M.hi, Math.max(M.lo, i));
  const s = segAt(B, n.o), pcs = tones(s);
  let m = idx2m(T, i, T.vscale && s.r === 7 ? T.vscale : T.scale);
  const p = pc12(m);
  const strong = n.o % (B.beats === 3 ? 3 : 2) === 0 || n.d >= 1.5;
  const clash = !pcs.includes(p) && pcs.some((c) => (c - p + 12) % 12 === 1 || (p - c + 12) % 12 === 1);
  if (strong || clash) m = snap(m, pcs, n.s);
  M.idx = m2idx(T, m);
  return m;
}

// ---------- parts ----------
const COMP4 = [[[0, 3.4, 0.8]], [[0, 1.2, 0.82], [1.5, 2.2, 0.66]], [[0, 0.6, 0.78], [1.5, 0.6, 0.62], [2.5, 1.4, 0.72]],
  [[1, 0.8, 0.66], [2.5, 1.4, 0.74]], [[0, 2, 0.8], [2.5, 1.3, 0.62]]];
const COMP2 = [[[0, 1.8, 0.8]], [[0, 0.8, 0.8], [1.5, 0.45, 0.62]], [[0, 1.2, 0.76]]];
const COMP3 = [[[1, 0.55, 0.72], [2, 0.55, 0.64]], [[1, 0.55, 0.72], [2, 0.55, 0.64]], [[1, 1.8, 0.7]], [[0, 1.2, 0.66], [2, 0.8, 0.6]]];
const GPAT = [[0, 3, 6, 10, 13], [0, 3, 5, 8, 11, 13], [0, 2, 3, 6, 8, 10, 13], [0, 3, 6, 8, 11, 14]];
const ARP8 = [[0, 1, 2, 3, 2, 1, 2, 3], [0, 2, 1, 3, 2, 3, 1, 2], [3, 2, 1, 0, 1, 2, 3, 2], [0, 1, 2, 3, 3, 2, 1, 0]];
const ARP16 = [[0, 1, 2, 3], [0, 2, 1, 3], [3, 2, 1, 0], [0, 1, 2, 1]];
const DRIVE = [[0, 0, 12, 0, 0, 12, 0, 7], [0, 0, 0, 12, 0, 0, 7, 12], [0, 12, 0, 12, 0, 7, 0, 12], [0, 0, 7, 0, 12, 0, 7, 0]];

const PART = {
  epComp(dk, B, add) {
    for (const s of B.segs) {
      const v = (dk.vo.ep = voicing(s.pc, s.q, dk.vo.ep, 52, 76));
      const c = pick(dk.r, B.beats === 3 ? COMP3 : s.len >= 4 ? COMP4 : COMP2);
      for (const [o, d, vel] of c) v.forEach((m, i) => add(s.at + o, 'ep', 'ep', m, d, vel * (0.92 + 0.12 * dk.r()), i * 0.006));
    }
  },
  // bossa guitar on a two-bar clave-like grid of eighths, off-beats strummed up
  gtrBossa(dk, B, add) {
    if (B.bar % 2 === 0 || !dk.gp) dk.gp = pick(dk.r, GPAT);
    for (const p of dk.gp) {
      if (p >> 3 !== B.bar % 2) continue;
      const beat = (p & 7) / 2, s = segAt(B, beat);
      const v = (dk.vo.gtr = voicing(s.pc, s.q, dk.vo.gtr, 52, 72));
      const up = (p & 1) === 1, vel = beat === 0 ? 0.85 : up ? 0.6 : 0.72;
      (up ? [...v].reverse() : v).forEach((m, i) => add(beat, 'gtr', 'gtr', m, 0.55, vel * (1 - i * 0.05), i * 0.011));
    }
  },
  harpArp(dk, B, add) {
    if (B.bi % 2 === 0 || !dk.ap) dk.ap = pick(dk.r, ARP8);
    for (const s of B.segs) {
      const v = (dk.vo.arp = voicing(s.pc, s.q, dk.vo.arp, 55, 79));
      for (let k = 0; k < s.len * 2; k++) {
        if (k > 0 && dk.r() < 0.12) continue;
        add(s.at + k / 2, 'arp', 'gtr', v[dk.ap[k % 8] % v.length], 1.6, k === 0 ? 0.8 : 0.55 + 0.1 * dk.r());
      }
    }
  },
  strings(dk, B, add) {
    for (const s of B.segs) {
      const v = (dk.vo.pad = voicing(s.pc, s.q, dk.vo.pad, 52, 76));
      for (const m of v) add(s.at, 'pad', 'str', m, s.len + 0.15, 0.7);
    }
  },
  arp16(dk, B, add) {
    if (B.bi % 2 === 0 || !dk.ap) dk.ap = pick(dk.r, ARP16);
    for (const s of B.segs) {
      const v = (dk.vo.arp = voicing(s.pc, s.q, dk.vo.arp, 57, 76));
      for (let k = 0; k < s.len * 4; k++) add(s.at + k / 4, 'arp', 'pluck', v[dk.ap[k % 4] % v.length], 0.22, k % 4 === 0 ? 0.9 : 0.55);
    }
  },
  walk(dk, B, add) {
    for (let k = 0; k < B.beats; k++) {
      const s = segAt(B, k), last = k + 1 >= B.beats || segAt(B, k + 1) !== s;
      const nx = k + 1 >= B.beats ? B.next : segAt(B, k + 1);
      let m;
      if (k === s.at) m = near(s.pc, dk.bl, 36, 52);
      else if (last) {
        m = dk.r() < 0.3 ? near((nx.pc + 7) % 12, dk.bl, 36, 52) : near(nx.pc, dk.bl, 37, 51) + (dk.r() < 0.5 ? 1 : -1);
      } else {
        const c = Q[s.q].slice(1, 4).map((x) => near((s.pc + x) % 12, dk.bl, 36, 52)).filter((x) => x !== dk.bl);
        m = c.length ? pick(dk.r, c) : dk.bl + 2;
      }
      dk.bl = m;
      add(k, 'bass', 'bass', m, 0.9, k === 0 ? 0.95 : 0.78 + 0.1 * dk.r());
    }
  },
  bossaBass(dk, B, add) {
    const s0 = B.segs[0], s1 = B.segs[B.segs.length - 1], r0 = near(s0.pc, dk.bl, 36, 50);
    const r1 = s1 === s0 ? r0 : near(s1.pc, r0, 36, 50);
    add(0, 'bass', 'bass', r0, 1.35, 0.95);
    add(1.5, 'bass', 'bass', fifthOf(s0, r0, 52), 0.45, 0.62);
    add(2, 'bass', 'bass', s1 === s0 ? fifthOf(s0, r0, 52) : r1, 1.35, 0.85);
    add(3.5, 'bass', 'bass', s1 === s0 ? r0 : fifthOf(s1, r1, 52), 0.45, 0.6);
    dk.bl = r0;
  },
  halfBass(dk, B, add) {
    if (B.segs.length > 1) {
      for (const s of B.segs) { dk.bl = near(s.pc, dk.bl, 36, 52); add(s.at, 'bass', 'bass', dk.bl, s.len - 0.1, 0.85); }
      return;
    }
    const s = B.segs[0], r0 = near(s.pc, dk.bl, 36, 52), f = fifthOf(s, r0, 55);
    add(0, 'bass', 'bass', r0, 1.9, 0.9);
    if (dk.r() < 0.35) {
      add(2, 'bass', 'bass', f, 0.95, 0.72);
      add(3, 'bass', 'bass', near(B.next.pc, r0, 37, 51) + (dk.r() < 0.5 ? 1 : -1), 0.95, 0.66);
    } else add(2, 'bass', 'bass', f, 1.9, 0.75);
    dk.bl = r0;
  },
  waltzBass(dk, B, add) {
    const s = B.segs[0], r0 = near(s.pc, dk.bl, 36, 50), two = dk.r() < 0.6;
    add(0, 'bass', 'bass', r0, two ? 1.9 : 2.8, 0.92);
    if (two) add(2, 'bass', 'bass', fifthOf(s, r0, 55), 0.9, 0.66);
    dk.bl = r0;
  },
  drive(dk, B, add) {
    if (B.bi % 2 === 0 || !dk.dp) dk.dp = pick(dk.r, DRIVE);
    for (const s of B.segs) {
      const r0 = near(s.pc, 40, 36, 47);
      for (let k = 0; k < s.len * 2; k++) add(s.at + k / 2, 'bass', 'sbass', r0 + dk.dp[k % 8], 0.42, k % 2 ? 0.62 : 0.9);
    }
  },
  brushSwing(dk, B, add, hit) {
    for (let k = 0; k < 4; k++) hit(k, 'swish', k % 2 ? 0.55 : 0.4);
    for (const [o, v] of [[0, 0.6], [1, 0.75], [1.5, 0.4], [2, 0.6], [3, 0.75], [3.5, 0.4]]) {
      if (o % 1 && dk.r() < 0.15) continue;
      hit(o, 'ride', v * (0.9 + 0.2 * dk.r()));
    }
    hit(1, 'hat', 0.5);
    hit(3, 'hat', 0.55);
    if (dk.r() < 0.3) hit(3, 'rim', 0.45);
    if (dk.r() < 0.5) hit(0, 'kickS', 0.35);
    if (B.bi === 7) { hit(2.5, 'ride', 0.5); hit(3.5, 'rim', 0.4); }
  },
  bossaDrums(dk, B, add, hit) {
    const acc = [0.35, 0.6, 0.4, 0.65, 0.35, 0.6, 0.4, 0.65];
    for (let k = 0; k < 8; k++) hit(k / 2, 'shaker', acc[k] * (0.85 + 0.3 * dk.r()));
    for (const o of B.bar % 2 === 0 ? [0, 1.5, 3] : [1, 2.5]) hit(o, 'rim', 0.6);
    hit(0, 'kickS', 0.7);
    hit(1.5, 'kickS', 0.35);
    hit(2, 'kickS', 0.6);
    hit(3.5, 'kickS', 0.35);
    hit(1, 'hat', 0.3);
    hit(3, 'hat', 0.3);
  },
  balladDrums(dk, B, add, hit) {
    hit(1, 'swish', 0.6);
    hit(3, 'swish', 0.6);
    for (let k = 0; k < 4; k++) hit(k, 'ride', k % 2 ? 0.35 : 0.45);
    if (B.bi % 2 === 1 && dk.r() < 0.6) hit(3, 'rim', 0.4);
    hit(0, 'kickS', 0.3);
  },
  waltzDrums(dk, B, add, hit) {
    hit(0, 'ride', 0.65);
    hit(1, 'ride', 0.45);
    if (dk.r() < 0.5) hit(1.5, 'ride', 0.3);
    hit(2, 'ride', 0.5);
    hit(1, 'hat', 0.4);
    hit(2, 'hat', 0.4);
    hit(0, 'swish', 0.45);
    if (dk.r() < 0.4) hit(0, 'kickS', 0.35);
  },
  rock(dk, B, add, hit) {
    const b = B.sec === 'B';
    for (let k = 0; k < 16; k += b ? 1 : 2) hit(k / 4, 'hatT', k % 4 === 0 ? 0.8 : k % 2 === 0 ? 0.55 : 0.35);
    for (const k of b ? [0, 3, 8, 11] : [0, 8, 10]) hit(k / 4, 'kick', k === 0 ? 1 : 0.8);
    hit(1, 'snare', 0.9);
    if (B.bi === 7) for (let k = 12; k < 16; k++) hit(k / 4, 'snare', 0.5 + (k - 12) * 0.15);
    else hit(3, 'snare', 0.95);
    if (B.bi === 0) hit(0, 'crash', 0.8);
  },
  mel(dk, B, add) {
    const T = dk.track, M = dk.mel, L = B.sec[0];
    if (B.bi === 0) {
      if (M.seen[L]) {
        if (dk.r() < 0.45) M.ph[L][Math.floor(dk.r() * 3)] = cell(dk.r, CELLS[T.cells]);
        if (dk.r() < 0.35) for (const c of M.ph[L]) for (const n of c) if (dk.r() < 0.3) n.s = step(dk.r);
        if (dk.r() < 0.3) M.end2[L] = cell(dk.r, ENDS[T.cells]);
      }
      M.seen[L] = true;
      M.rest = B.pass > 0 && !M.lastRest && dk.r() < 0.2;
      M.lastRest = M.rest;
    }
    if (M.rest || B.bar < (T.intro || 0)) return;
    const pb = B.bi % 4;
    for (const n of pb === 3 && B.bi >= 4 ? M.end2[L] : M.ph[L][pb]) {
      add(n.o, 'mel', T.mel[0], melPitch(dk, B, n), n.d * 0.95, (n.o % 1 === 0 ? 0.85 : 0.72) + 0.1 * dk.r());
    }
  },
};
// What each part plays, so a deck can draw its samples before it starts.
const USES = {
  epComp: ['i:ep'], gtrBossa: ['i:gtr'], harpArp: ['i:gtr'], strings: ['i:str'], arp16: ['i:pluck'],
  walk: ['i:bass'], bossaBass: ['i:bass'], halfBass: ['i:bass'], waltzBass: ['i:bass'], drive: ['i:sbass'],
  brushSwing: ['d:swish', 'd:ride', 'd:hat', 'd:rim', 'd:kickS'], bossaDrums: ['d:shaker', 'd:rim', 'd:kickS', 'd:hat'],
  balladDrums: ['d:swish', 'd:ride', 'd:rim', 'd:kickS'], waltzDrums: ['d:ride', 'd:hat', 'd:swish', 'd:kickS'],
  rock: ['d:hatT', 'd:kick', 'd:snare', 'd:crash'],
};
function jobsFor(T) {
  const jobs = [];
  for (const p of T.parts) {
    for (const u of p === 'mel' ? ['i:' + T.mel[0]] : USES[p]) {
      const name = u.slice(2);
      if (u[0] === 'i') for (const r of INST[name].roots) jobs.push(job('i', name, r));
      else jobs.push(job('d', name));
    }
  }
  return jobs;
}

// ---------- tracks ----------
const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10], HMIN = [0, 2, 3, 5, 7, 8, 11];
// Chords are [semitones above the key, quality]; two in a bar split it in half.
const TRACKS = [
  {
    id: 'lobby', name: 'Your Call Is Important To Us', bpm: 100, beats: 4, swing: 0.64, key: 65, scale: MAJ, cells: 4, lvl: 1,
    mel: ['vib', 67, 86],
    parts: ['epComp', 'walk', 'brushSwing', 'mel'],
    mix: {
      ep: { g: 0.16, pan: -0.15, send: 0.3, wob: [3.4, 0.4] },
      mel: { g: 0.28, pan: 0.25, send: 0.45, trem: [5.4, 0.22] },
      bass: { g: 0.34, send: 0.05 },
      drums: { g: 1.2, pan: 0.1, send: 0.12 },
    },
    form: ['A', 'A2', 'B', 'A'],
    sec: {
      A: [[[0, 'maj9']], [[9, 'm9']], [[2, 'm9']], [[7, '13']], [[4, 'm7'], [9, '7b9']], [[2, 'm9'], [7, '13']], [[0, 'maj9']], [[2, 'm9'], [7, '7b9']]],
      A2: [[[0, 'maj9']], [[9, 'm9']], [[2, 'm9']], [[7, '13']], [[4, 'm7'], [9, '7b9']], [[2, 'm9'], [7, '13']], [[0, 'maj9']], [[0, '6/9']]],
      B: [[[7, 'm9'], [0, '9']], [[5, 'maj9']], [[5, 'm9'], [10, '13']], [[0, 'maj9']], [[11, 'm7b5'], [4, '7b9']], [[9, 'm9']], [[2, '9']], [[7, '7sus'], [7, '13']]],
    },
  },
  {
    id: 'bossa', name: 'Bossa Nebula', bpm: 132, beats: 4, swing: 0.5, key: 62, scale: MAJ, cells: 4, lvl: 1,
    mel: ['flute', 69, 88],
    parts: ['gtrBossa', 'bossaBass', 'bossaDrums', 'mel'],
    mix: {
      gtr: { g: 0.24, pan: -0.3, send: 0.25 },
      mel: { g: 0.2, pan: 0.2, send: 0.4 },
      bass: { g: 0.36, send: 0.05 },
      drums: { g: 0.5, pan: 0.15, send: 0.1 },
    },
    form: ['A', 'A2', 'B', 'A'],
    sec: {
      A: [[[0, 'maj9']], [[0, '6/9']], [[2, '9']], [[2, '9']], [[2, 'm9']], [[7, '13']], [[4, 'm7'], [9, '7b9']], [[2, 'm9'], [7, '7b9']]],
      A2: [[[0, 'maj9']], [[0, '6/9']], [[2, '9']], [[2, '9']], [[2, 'm9']], [[7, '13']], [[0, 'maj9']], [[7, 'm7'], [0, '9']]],
      B: [[[5, 'maj9']], [[5, 'm9'], [10, '13']], [[4, 'm9']], [[9, '7b9']], [[2, 'm9']], [[7, '13']], [[0, 'maj9']], [[7, '7sus']]],
    },
  },
  {
    id: 'elevator', name: 'Floor Seven Million', bpm: 74, beats: 4, swing: 0.56, key: 58, scale: MAJ, cells: 4, lvl: 1,
    mel: ['cel', 72, 91],
    parts: ['strings', 'harpArp', 'halfBass', 'balladDrums', 'mel'],
    mix: {
      pad: { g: 0.12, send: 0.5 },
      arp: { g: 0.26, pan: -0.25, send: 0.4 },
      mel: { g: 0.22, pan: 0.2, send: 0.5 },
      bass: { g: 0.34, send: 0.05 },
      drums: { g: 1, pan: 0.1, send: 0.15 },
    },
    form: ['A', 'A2', 'B', 'A'],
    sec: {
      A: [[[0, 'maj9']], [[5, 'maj9']], [[4, 'm9']], [[9, 'm9']], [[2, 'm9']], [[7, '13']], [[0, '6/9']], [[2, 'm9'], [7, '7sus']]],
      A2: [[[0, 'maj9']], [[5, 'maj9']], [[4, 'm9']], [[9, 'm9']], [[2, 'm9']], [[7, '13']], [[0, 'maj9']], [[0, '9']]],
      B: [[[5, 'maj9']], [[5, 'm9'], [10, '9']], [[0, 'maj9']], [[4, 'm7b5'], [9, '7b9']], [[2, 'm9']], [[2, 'm9'], [7, '13']], [[0, 'maj9']], [[7, '7sus'], [7, '13']]],
    },
  },
  {
    id: 'waltz', name: 'Waiting Room Waltz', bpm: 138, beats: 3, swing: 0.6, key: 63, scale: MAJ, cells: 3, lvl: 1,
    mel: ['vib', 67, 86],
    parts: ['epComp', 'waltzBass', 'waltzDrums', 'mel'],
    mix: {
      ep: { g: 0.16, pan: -0.15, send: 0.3, wob: [2.8, 0.35] },
      mel: { g: 0.28, pan: 0.25, send: 0.45, trem: [5, 0.22] },
      bass: { g: 0.34, send: 0.05 },
      drums: { g: 0.9, pan: 0.1, send: 0.12 },
    },
    form: ['A', 'A2', 'B', 'A'],
    sec: {
      A: [[[0, 'maj9']], [[9, 'm9']], [[2, 'm9']], [[7, '13']], [[4, 'm7']], [[9, '7b9']], [[2, 'm9']], [[7, '13']]],
      A2: [[[0, 'maj9']], [[9, 'm9']], [[2, 'm9']], [[7, '13']], [[4, 'm7']], [[9, '7b9']], [[0, 'maj9']], [[0, '9']]],
      B: [[[5, 'maj9']], [[5, 'm9']], [[10, '13']], [[0, 'maj9']], [[9, 'm9']], [[2, '9']], [[2, 'm9']], [[7, '7sus']]],
    },
  },
];
const COMBAT = {
  id: 'combat', name: 'Red Ink (combat)', bpm: 152, beats: 4, swing: 0.5, key: 62, scale: MIN, vscale: HMIN, cells: 'C', intro: 4, lvl: 1,
  mel: ['lead', 62, 81],
  parts: ['strings', 'arp16', 'drive', 'rock', 'mel'],
  mix: {
    pad: { g: 0.09, send: 0.3 },
    arp: { g: 0.1, pan: -0.3, send: 0.2 },
    mel: { g: 0.3, pan: 0.15, send: 0.25 },
    bass: { g: 0.45 },
    drums: { g: 0.42, send: 0.08 },
  },
  form: ['A', 'A', 'B', 'A'],
  sec: {
    A: [[[0, 'm']], [[8, 'maj']], [[5, 'm']], [[7, '7']], [[0, 'm']], [[3, 'maj']], [[5, 'm']], [[7, '7']]],
    B: [[[5, 'm']], [[0, 'm']], [[5, 'm']], [[0, 'm']], [[8, 'maj']], [[10, 'maj']], [[7, '7sus']], [[7, '7']]],
  },
};
const TRACK_INFO = TRACKS.map((t) => ({ id: t.id, name: t.name }));
const COMBAT_INFO = { id: COMBAT.id, name: COMBAT.name };

// ---------- decks: one playing track each, two while crossfading ----------
function makeBus(dk, c) {
  const inp = ctx.createGain();
  inp.gain.value = c.g;
  dk.nodes.push(inp);
  let tail = inp;
  if (c.trem) {
    const a = ctx.createGain(), d = ctx.createGain(), o = ctx.createOscillator();
    a.gain.value = 1 - c.trem[1];
    d.gain.value = c.trem[1];
    o.frequency.value = c.trem[0];
    o.connect(d);
    d.connect(a.gain);
    o.start();
    tail.connect(a);
    tail = a;
    dk.nodes.push(a, d);
    dk.oscs.push(o);
  }
  const p = ctx.createStereoPanner();
  p.pan.value = c.pan || 0;
  tail.connect(p);
  dk.nodes.push(p);
  if (c.wob) {
    const d = ctx.createGain(), o = ctx.createOscillator();
    d.gain.value = c.wob[1];
    o.frequency.value = c.wob[0];
    o.connect(d);
    d.connect(p.pan);
    o.start();
    dk.nodes.push(d);
    dk.oscs.push(o);
  }
  p.connect(dk.fade);
  if (c.send) {
    const s = ctx.createGain();
    s.gain.value = c.send;
    p.connect(s);
    s.connect(dk.fadeW);
    dk.nodes.push(s);
  }
  return inp;
}
function newDeck(track, fadeIn) {
  const dk = {
    track, r: rng((session ^ hash(track.id) ^ Math.imul(++deckNo, 0x9e3779b1)) >>> 0),
    spb: 60 / track.bpm, bar: 0, next: 0, q: [], qi: 0, nodes: [], oscs: [], vo: {}, bl: 43,
    dead: false, until: 0, ready: false, fadeIn, born: performance.now(),
    todo: jobsFor(track).filter((j) => !bank.has(j.key)),
  };
  dk.fade = ctx.createGain();
  dk.fadeW = ctx.createGain();
  dk.fade.gain.value = 0;
  dk.fadeW.gain.value = 0;
  dk.fade.connect(G.music);
  dk.fadeW.connect(G.verb);
  dk.bus = {};
  for (const [k, c] of Object.entries(track.mix)) dk.bus[k] = makeBus(dk, c);
  dk.mel = makeMel(dk);
  return dk;
}
function startDeck(dk) {
  dk.ready = true;
  dk.next = ctx.currentTime + 0.08;
  fadeParam(dk.fade.gain, dk.track.lvl, dk.fadeIn);
  fadeParam(dk.fadeW.gain, dk.track.lvl, dk.fadeIn);
}
function genBar(dk) {
  const T = dk.track, b = dk.bar, nf = T.form.length;
  const sec = T.form[Math.floor(b / 8) % nf], bi = b % 8, chords = T.sec[sec][bi];
  const nb = b + 1, nx = T.sec[T.form[Math.floor(nb / 8) % nf]][nb % 8][0];
  const half = T.beats / chords.length;
  const B = {
    bar: b, bi, sec, pass: Math.floor(b / (8 * nf)), beats: T.beats,
    segs: chords.map(([r, q], i) => ({ at: i * half, len: half, r, q, pc: (T.key + r) % 12 })),
    next: { r: nx[0], q: nx[1], pc: (T.key + nx[0]) % 12 },
  };
  const t0 = dk.next, spb = dk.spb, out = [];
  const time = (beat) => {
    const i = Math.floor(beat), f = beat - i;
    return t0 + (i + (Math.abs(f - 0.5) < 1e-6 ? T.swing : f)) * spb;
  };
  const add = (beat, bus, inst, m, dur, vel, off = 0) => {
    out.push({ t: time(beat) + off + (dk.r() - 0.5) * 0.012, bus, inst, m, d: dur * spb, v: vel });
  };
  const hit = (beat, k, vel) => { out.push({ t: time(beat) + (dk.r() - 0.5) * 0.008, bus: 'drums', drum: k, v: vel }); };
  for (const p of T.parts) PART[p](dk, B, add, hit);
  out.sort((a, c) => a.t - c.t);
  for (const e of out) dk.q.push(e);
  dk.next += T.beats * spb;
  dk.bar++;
}
function fire(dk, e, now) {
  if (e.t < now - 0.03) return;
  const bus = dk.bus[e.bus];
  if (!bus) return;
  const t = Math.max(e.t, now);
  if (e.drum) drum(bus, e.drum, t, e.v);
  else note(bus, e.inst, e.m, t, e.d, e.v);
}
function fadeOut(dk, sec) {
  if (dk.dead) return;
  dk.dead = true;
  dk.until = ctx.currentTime + sec + 0.1;
  fadeParam(dk.fade.gain, 0, sec);
  fadeParam(dk.fadeW.gain, 0, sec);
}
function release(dk) {
  for (const o of dk.oscs) { try { o.stop(); } catch { /* already stopped */ } }
  for (const n of [...dk.nodes, ...dk.oscs, dk.fade, dk.fadeW]) { try { n.disconnect(); } catch { /* already gone */ } }
}
const liveDeck = () => decks.find((d) => !d.dead) || null;

// ---------- warp riser: an endlessly climbing string pad (Shepard style) ----------
function riserVoice(t, p0) {
  const s = sample('str', 48), dur = RISER_CYCLE * (1 - p0), fix = mtof(48) / s.f;
  const g = ctx.createGain(), pts = new Float32Array(32);
  for (let i = 0; i < 32; i++) pts[i] = Math.sin(Math.PI * (p0 + (1 - p0) * (i / 31))) ** 2;
  g.gain.setValueCurveAtTime(pts, t, dur);
  g.connect(riser.lp);
  for (const ratio of [1, 1.5]) {
    const src = ctx.createBufferSource();
    src.buffer = s.buf;
    src.loop = true;
    src.playbackRate.setValueAtTime(0.25 * 16 ** p0 * ratio * fix, t);
    src.playbackRate.exponentialRampToValueAtTime(4 * ratio * fix, t + dur);
    src.connect(g);
    src.start(t, Math.random() * s.buf.duration);
    src.stop(t + dur + 0.05);
    riser.srcs.push({ src, end: t + dur + 0.05 });
  }
}
function startRiser() {
  if (riser && !riser.dying) return;
  if (riser) killRiser();
  const now = ctx.currentTime;
  const out = ctx.createGain(), lp = ctx.createBiquadFilter(), send = ctx.createGain();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  lp.Q.value = 0.4;
  send.gain.value = 0.5;
  lp.connect(out);
  out.connect(G.musicVol);
  out.connect(send);
  send.connect(G.verb);
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(RISER_LEVEL, now + 2.5);
  riser = { out, lp, send, srcs: [], next: now + 0.05 + RISER_STEP, dying: false, until: 0 };
  // staggered voices so the texture is already full at the start
  for (let k = 0; k < RISER_CYCLE / RISER_STEP; k++) riserVoice(now + 0.05, (k * RISER_STEP) / RISER_CYCLE);
  fadeParam(G.duck.gain, 0.55, 1.5);
}
function stopRiser(sec) {
  if (!riser || riser.dying) return;
  const now = ctx.currentTime, p = riser.out.gain, v = p.value;
  p.cancelScheduledValues(now);
  p.setValueAtTime(v, now);
  p.linearRampToValueAtTime(0, now + sec);
  riser.dying = true;
  riser.until = now + sec + 0.1;
  fadeParam(G.duck.gain, 1, sec);
}
function killRiser() {
  for (const x of riser.srcs) { try { x.src.stop(); } catch { /* ended */ } }
  for (const n of [riser.out, riser.lp, riser.send]) { try { n.disconnect(); } catch { /* gone */ } }
  riser = null;
}
function tickRiser(now, horizon) {
  if (riser.dying) { if (now > riser.until) killRiser(); return; }
  riser.srcs = riser.srcs.filter((x) => x.end > now);
  while (riser.next < horizon) { riserVoice(riser.next, 0); riser.next += RISER_STEP; }
}

// ---------- scheduler ----------
function schedule() {
  if (!ctx) return;
  try {
    const now = ctx.currentTime, horizon = now + LOOKAHEAD;
    if (!audio.enabled && (liveDeck() || (riser && !riser.dying))) audio.stop();
    for (const dk of decks) {
      if (!dk.ready) {
        // Wait for the worker; without one (or if it is slow) draw the missing
        // samples here a slice at a time instead of stalling a frame.
        if (dk.dead) continue;
        dk.todo = dk.todo.filter((j) => !bank.has(j.key));
        if (dk.todo.length && (!worker || performance.now() - dk.born > 1200)) {
          const t = performance.now();
          while (dk.todo.length && performance.now() - t < SLICE_MS) get(dk.todo.shift());
        }
        if (dk.todo.length) continue;
        startDeck(dk);
      }
      if (dk.next < now - 1) { dk.next = now + 0.05; dk.q = []; dk.qi = 0; } // the page stalled; skip ahead
      if (!dk.dead || now < dk.until) while (dk.next < horizon) genBar(dk);
      const q = dk.q;
      while (dk.qi < q.length && q[dk.qi].t < horizon) fire(dk, q[dk.qi++], now);
      if (dk.qi > 200) { dk.q = q.slice(dk.qi); dk.qi = 0; }
    }
    decks = decks.filter((dk) => {
      if (dk.dead && now > dk.until) { release(dk); return false; }
      return true;
    });
    if (riser) tickRiser(now, horizon);
    if (!decks.length && !riser && timer) { clearInterval(timer); timer = 0; }
  } catch (e) {
    warnOnce(e);
  }
}
function ensureTimer() {
  if (!timer) timer = setInterval(schedule, TICK_MS);
}
function applyMood(fadeIn, fadeOutSec) {
  if (!ctx || !audio.enabled) return;
  const want = prefs.base === 'combat' ? COMBAT : TRACKS[prefs.sel];
  const cur = liveDeck();
  if (!cur || cur.track !== want) {
    if (cur) fadeOut(cur, fadeOutSec);
    // rapid skipping: drop the oldest fading decks so at most three ever run
    while (decks.length > 2) release(decks.shift());
    decks.push(newDeck(want, fadeIn));
  }
  if (prefs.warp) startRiser(); else stopRiser(2);
  audio.current = want === COMBAT ? COMBAT_INFO : TRACK_INFO[prefs.sel];
  ensureTimer();
  schedule();
}
// Hidden tab: suspend the context so a background game costs no audio CPU.
function onVisibility() {
  if (!ctx) return;
  try {
    if (document.hidden) { if (ctx.state === 'running') ctx.suspend().catch(() => {}); }
    else if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch { /* offline or closed context */ }
}
// Every buffer the game can ask for, most urgent first.
function allJobs() {
  const seen = new Set(), out = [];
  const add = (j) => { if (!seen.has(j.key)) { seen.add(j.key); out.push(j); } };
  jobsFor(prefs.base === 'combat' ? COMBAT : TRACKS[prefs.sel]).forEach(add);
  jobsFor(COMBAT).forEach(add);
  for (const [k, d] of Object.entries(SFX)) for (let v = 0; v < (d.vars || 1); v++) add(job('s', k, v));
  for (const T of TRACKS) jobsFor(T).forEach(add);
  add(job('n', 'brown', 4));
  add(job('n', 'white', 2));
  return out;
}
// Fallback when no worker: draw in idle time so no frame stalls for long.
function idlePrewarm(jobs) {
  const idle = window.requestIdleCallback
    ? (fn) => window.requestIdleCallback(fn, { timeout: 1500 })
    : (fn) => setTimeout(() => { const t0 = performance.now(); fn({ timeRemaining: () => Math.max(0, 10 - (performance.now() - t0)) }); }, 40);
  const run = (dl) => {
    try {
      do { const j = jobs.shift(); if (j && !bank.has(j.key)) get(j); } while (jobs.length && dl.timeRemaining() > 6);
    } catch (e) {
      warnOnce(e);
    }
    if (jobs.length) idle(run);
  };
  if (jobs.length) idle(run);
}
function prewarm() {
  const jobs = allJobs();
  let w = null;
  try { w = typeof Worker === 'function' ? new Worker(import.meta.url, { type: 'module' }) : null; } catch { w = null; }
  if (!w) { idlePrewarm(jobs); return; }
  worker = w;
  let left = jobs.length;
  const done = () => { if (worker === w) worker = null; try { w.terminate(); } catch { /* gone */ } };
  w.onmessage = (e) => {
    const m = e.data;
    if (m && m.d && !bank.has(m.key)) { try { put(m.key, m); } catch (err) { warnOnce(err); } }
    if (--left <= 0) done();
  };
  w.onerror = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    done();
    idlePrewarm(jobs.filter((j) => !bank.has(j.key)));
  };
  w.postMessage({ sr: SR, jobs });
}

// ---------- loops ----------
function loopKit(P) {
  return {
    gain(v) { const g = ctx.createGain(); g.gain.value = v; P.nodes.push(g); return g; },
    filter(type, f, q) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; P.nodes.push(b); return b; },
    osc(type, f) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); P.srcs.push(o); P.nodes.push(o); return o; },
    noise(buf) {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start(ctx.currentTime, Math.random() * buf.duration);
      P.srcs.push(s);
      P.nodes.push(s);
      return s;
    },
    lfo(rate, depth, param) {
      const o = this.osc('sine', rate), g = this.gain(depth);
      o.connect(g);
      g.connect(param);
      return o;
    },
  };
}
// Each builder wires its sound into `lvl` and returns set(v, time).
const LOOPS = {
  wind: [1, (lvl, K) => {
    const src = K.noise(brownNoise()), bp = K.filter('bandpass', 500, 0.7), amp = K.gain(0.75);
    K.lfo(0.13, 220, bp.frequency);
    K.lfo(0.21, 0.25, amp.gain);
    src.connect(bp); bp.connect(amp); amp.connect(lvl);
    return (v, t) => { lvl.gain.setTargetAtTime(1.5 * v, t, 0.15); bp.frequency.setTargetAtTime(300 + 600 * v, t, 0.2); };
  }],
  thruster: [0, (lvl, K) => {
    const src = K.noise(brownNoise()), lp = K.filter('lowpass', 300, 0.9), o = K.osc('sawtooth', 40), og = K.gain(0.2);
    src.connect(lp); o.connect(og); og.connect(lp); lp.connect(lvl);
    return (v, t) => {
      lp.frequency.setTargetAtTime(160 + 1900 * v * v, t, 0.1);
      o.frequency.setTargetAtTime(36 + 70 * v, t, 0.1);
      lvl.gain.setTargetAtTime(0.11 + 0.34 * v, t, 0.1);
    };
  }],
  dronebuzz: [0.6, (lvl, K) => {
    const o1 = K.osc('sawtooth', 170), o2 = K.osc('sawtooth', 172.2), lp = K.filter('lowpass', 2200, 0.8), trem = K.gain(0.7);
    const l = K.lfo(26, 0.3, trem.gain);
    o1.connect(lp); o2.connect(lp); lp.connect(trem); trem.connect(lvl);
    return (v, t) => {
      const f = 140 + 100 * v;
      o1.frequency.setTargetAtTime(f, t, 0.1);
      o2.frequency.setTargetAtTime(f * 1.013, t, 0.1);
      l.frequency.setTargetAtTime(20 + 16 * v, t, 0.1);
      lvl.gain.setTargetAtTime(0.075 + 0.075 * v, t, 0.1);
    };
  }],
  shower: [1, (lvl, K) => {
    const src = K.noise(whiteNoise()), hp = K.filter('highpass', 1000, 0.5), lp = K.filter('lowpass', 7500, 0.5), amp = K.gain(0.85);
    K.lfo(0.7, 0.12, amp.gain);
    K.lfo(3.1, 0.05, amp.gain);
    src.connect(hp); hp.connect(lp); lp.connect(amp); amp.connect(lvl);
    return (v, t) => lvl.gain.setTargetAtTime(0.3 * v, t, 0.1);
  }],
  hum: [1, (lvl, K) => {
    const lp = K.filter('lowpass', 500, 0.7);
    for (const [f, g, type] of [[55, 1, 'sine'], [110.3, 0.45, 'sine'], [165, 0.14, 'triangle']]) {
      const o = K.osc(type, f), gg = K.gain(g);
      o.connect(gg);
      gg.connect(lp);
    }
    lp.connect(lvl);
    return (v, t) => lvl.gain.setTargetAtTime(0.1 * v, t, 0.1);
  }],
};
const NOOP_LOOP = Object.freeze({ stop() {}, set() {} });
function makeLoop(name) {
  const [v0, buildFn] = LOOPS[name];
  const P = { srcs: [], nodes: [] }, K = loopKit(P);
  const now = ctx.currentTime, lvl = K.gain(0), out = K.gain(0);
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(1, now + 0.2);
  lvl.connect(out);
  out.connect(G.sfx);
  const setFn = buildFn(lvl, K);
  let alive = true, last = -1;
  const h = {
    set(v) {
      if (!alive) return;
      v = clamp01(v);
      if (Math.abs(v - last) < 0.004) return;
      last = v;
      try { setFn(v, ctx.currentTime); } catch (e) { warnOnce(e); }
    },
    stop() {
      if (!alive) return;
      alive = false;
      try {
        const t = ctx.currentTime, p = out.gain, cur = p.value;
        p.cancelScheduledValues(t);
        p.setValueAtTime(cur, t);
        p.linearRampToValueAtTime(0, t + 0.25);
        for (const s of P.srcs) { try { s.stop(t + 0.3); } catch { /* stopped */ } }
      } catch (e) {
        warnOnce(e);
      }
      setTimeout(() => { for (const n of P.nodes) { try { n.disconnect(); } catch { /* gone */ } } }, 450);
    },
  };
  h.set(v0);
  return h;
}

// ---------- public API ----------
export const audio = {
  enabled: true,
  current: null,
  tracks: TRACK_INFO,

  init() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        // 48 kHz even on 96 kHz devices: half the audio-thread work for no audible loss
        try { ctx = new AC({ latencyHint: 'interactive', sampleRate: 48000 }); } catch { ctx = new AC({ latencyHint: 'interactive' }); }
        build();
      } catch (e) {
        warnOnce(e);
        ctx = null;
        G = null;
        return;
      }
      document.addEventListener('visibilitychange', onVisibility);
      prewarm();
    }
    try { if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {}); } catch { /* offline context */ }
    // The game enables music before the first click and never calls mood at
    // launch, so the first gesture starts the chosen mood.
    if (audio.enabled && !liveDeck()) applyMood(2.5, 1);
  },

  setMusicVolume(v) {
    prefs.music = clamp01(v);
    if (G) setParam(G.musicVol.gain, prefs.music ** 2);
  },
  setSfxVolume(v) {
    prefs.sfx = clamp01(v);
    if (G) setParam(G.sfx.gain, prefs.sfx ** 2 * SFX_TRIM);
  },

  play(id) {
    const i = TRACKS.findIndex((t) => t.id === id);
    if (i >= 0) { prefs.sel = i; prefs.base = 'cruise'; }
    else if (id === COMBAT.id) prefs.base = 'combat';
    else return;
    applyMood(2, 2);
  },
  stop() {
    audio.current = null;
    if (!ctx) return;
    for (const d of decks) fadeOut(d, 1);
    stopRiser(1);
  },
  next() {
    prefs.sel = (prefs.sel + 1) % TRACKS.length;
    prefs.base = 'cruise';
    applyMood(2, 2);
  },
  mood(m) {
    if (m === 'warp') prefs.warp = true;
    else if (m === 'combat' || m === 'cruise') { prefs.base = m; prefs.warp = false; }
    else return;
    const hot = m === 'combat';
    applyMood(hot ? 0.8 : 3, hot ? 1.2 : 3);
  },

  sfx(name, opts) {
    if (!ctx || !own(SFX, name)) return;
    try {
      const def = SFX[name], now = ctx.currentTime;
      for (let i = live.length - 1; i >= 0; i--) if (live[i].end <= now) live.splice(i, 1);
      let same = 0, last = -1;
      for (const v of live) if (v.name === name) { same++; if (v.start > last) last = v.start; }
      if (same >= (def.max || 3)) return;
      if (last >= 0 && now - last < (def.gap ?? 0.04)) return;
      if (!def.vip && live.length >= MAX_SFX) return;
      const vol = opts && opts.vol != null ? clamp01(opts.vol) : 1;
      if (vol <= 0) return;
      const buf = sfxBuf(name, Math.floor(Math.random() * (def.vars || 1)));
      const rate = 1 + (Math.random() * 2 - 1) * (def.jit || 0);
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf;
      src.playbackRate.value = rate;
      g.gain.value = def.gain * vol;
      src.connect(g);
      g.connect(G.sfx);
      src.start(now);
      live.push({ name, start: now, end: now + buf.duration / rate });
    } catch (e) {
      warnOnce(e);
    }
  },

  loop(name) {
    if (!ctx || !own(LOOPS, name)) return NOOP_LOOP;
    try { return makeLoop(name); } catch (e) { warnOnce(e); return NOOP_LOOP; }
  },
};
