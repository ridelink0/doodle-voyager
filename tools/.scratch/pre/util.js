// Small maths and seeding helpers shared by every module.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const smooth = (t) => t * t * (3 - 2 * t);

// mulberry32: small, fast, good enough for procedural content.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash(...parts) {
  let h = 2166136261 >>> 0;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}
export const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

// Equatorial J2000 (RA/Dec in degrees) to the game frame, which is galactic:
// +X toward the galactic centre, +Y galactic north, Z completes a right hand.
const T = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.4448296300, 0.7469822445],
  [-0.8676661490, -0.1980763734, 0.4559837762],
];
export function radecDir(raDeg, decDeg) {
  const ra = (raDeg * Math.PI) / 180, dec = (decDeg * Math.PI) / 180;
  const ex = Math.cos(dec) * Math.cos(ra), ey = Math.cos(dec) * Math.sin(ra), ez = Math.sin(dec);
  const gx = T[0][0] * ex + T[0][1] * ey + T[0][2] * ez;
  const gy = T[1][0] * ex + T[1][1] * ey + T[1][2] * ez;
  const gz = T[2][0] * ex + T[2][1] * ey + T[2][2] * ez;
  return { x: gx, y: gz, z: -gy };
}

// Real distance (parsecs) to game units. One monotonic curve for every scale,
// so near stars are minutes apart, the galactic centre a few more, and the
// edge of the observable universe is a long haul or one expensive warp.
const D10 = 4e7, DMW = 4e7 * (1 + Math.log(3000)), DLG = DMW + 2e9 * Math.sqrt((2e7 - 3e4) / 7.5e5);
export function pcToU(pc) {
  if (!(pc > 0)) return 0;
  if (pc <= 10) return pc * 4e6;
  if (pc <= 3e4) return D10 * (1 + Math.log(pc / 10));
  if (pc <= 2e7) return DMW + 2e9 * Math.sqrt((pc - 3e4) / 7.5e5);
  return DLG + 5e9 * Math.log(pc / 2e7);
}
export const mlyToPc = (mly) => (mly * 1e6) / 3.26156;
export const mlyToU = (mly) => pcToU(mlyToPc(mly));
// Lateral scale (game units per real parsec) at a given real distance: used to
// size galaxies so neighbours do not swallow each other.
export function lateralScale(pc) { return pc > 0 ? pcToU(pc) / pc : 4e6; }

// Solar-system-scale compression: AU to game units, planet and star sizes.
export const auToU = (au) => 60000 * Math.pow(Math.max(au, 0.005), 0.7);
export const earthRToU = (re) => 1500 * Math.pow(Math.max(re, 0.05), 0.85);
export const sunRToU = (rs) => 20000 * Math.pow(Math.max(rs, 0.08), 0.45);

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const vsub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const vadd = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const vlen = (a) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const vdist = (a, b) => { const x = a.x - b.x, y = a.y - b.y, z = a.z - b.z; return Math.sqrt(x * x + y * y + z * z); };
export const vscale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });

export function fmtU(u) {
  const a = Math.abs(u);
  if (a < 1e4) return `${Math.round(a).toLocaleString('en-US')} u`;
  if (a < 1e7) return `${(a / 1e3).toFixed(a < 1e5 ? 1 : 0)} ku`;
  if (a < 1e10) return `${(a / 1e6).toFixed(a < 1e8 ? 1 : 0)} Mu`;
  return `${(a / 1e9).toFixed(1)} Gu`;
}
export function fmtTime(s) {
  if (!isFinite(s)) return 'forever';
  s = Math.max(0, Math.round(s));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
export function fmtReal(pc) {
  if (!(pc > 0)) return '';
  const ly = pc * 3.26156;
  if (ly < 1000) return `${ly.toFixed(ly < 10 ? 2 : 0)} ly`;
  if (ly < 1e6) return `${(ly / 1e3).toFixed(1)} kly`;
  if (ly < 1e9) return `${(ly / 1e6).toFixed(ly < 1e7 ? 2 : 1)} Mly`;
  return `${(ly / 1e9).toFixed(2)} Gly`;
}
export const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
