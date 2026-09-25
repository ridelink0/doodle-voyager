// The universe: every catalogued galaxy and exoplanet host we ship as data,
// the real Solar System, view sites, the Bazaar, fuel stations, and seeded
// uncharted space past the catalogues. Positions are doubles in game units
// with the Sun at the origin and galactic axes (see util.js). Everything is
// drawn relative to the player's ship through render.squash.
import * as THREE from 'three';
import { ink, glow, lineMat, ID, neonize, PAL, starGlow, neonizePlanet, atmoColorFor } from './mats.js';
import { Cloud, squash } from './render.js';
import { buildStation } from './actors.js';
import {
  rng, hash, radecDir, pcToU, mlyToPc, mlyToU, lateralScale, auToU, earthRToU, sunRToU,
  clamp, TAU, pick, vdist,
} from './util.js';

export const FUELS = ['ION', 'PLASMA', 'DEUTERIUM'];
const col = (hex) => new THREE.Color(hex);
const V = new THREE.Vector3();
// Scratch for the per-planet sun direction written every frame: no new
// Vector3/Quaternion inside a per-frame function.
const _sunDir = new THREE.Vector3();
const _sunQ = new THREE.Quaternion();
const SPHERE = new THREE.IcosahedronGeometry(1, 3);
const LOWSPHERE = new THREE.IcosahedronGeometry(1, 1);

// The real Solar System. a in AU, radius in Earth radii, period in days
// (NASA planetary fact sheets); moon radii in Earth radii.
const SOLAR = [
  { name: 'Mercury', a: 0.387, re: 0.383, per: 88.0, color: 0xb8b0a8 },
  { name: 'Venus', a: 0.723, re: 0.949, per: 224.7, color: 0xeedcaa },
  { name: 'Earth', a: 1.0, re: 1.0, per: 365.25, color: 0x5f8fe8, tex: 'earth', moons: [['Moon', 0.273]] },
  { name: 'Mars', a: 1.524, re: 0.532, per: 687, color: 0xe0784a, tex: 'mars', moons: [['Phobos', 0.0018], ['Deimos', 0.001]] },
  { name: 'Ceres', a: 2.77, re: 0.074, per: 1682, color: 0xa8a49a, dwarf: true },
  { name: 'Jupiter', a: 5.203, re: 11.21, per: 4333, color: 0xd9b38c, tex: 'bands', moons: [['Io', 0.286], ['Europa', 0.245], ['Ganymede', 0.413], ['Callisto', 0.378]] },
  { name: 'Saturn', a: 9.537, re: 9.45, per: 10759, color: 0xe8d49a, tex: 'bands', rings: [1.25, 2.3], moons: [['Mimas', 0.031], ['Enceladus', 0.04], ['Rhea', 0.12], ['Titan', 0.404], ['Iapetus', 0.115]] },
  { name: 'Uranus', a: 19.19, re: 4.01, per: 30687, color: 0xa8e0e6, rings: [1.6, 2.0], moons: [['Miranda', 0.037], ['Titania', 0.124], ['Oberon', 0.12]] },
  { name: 'Neptune', a: 30.07, re: 3.88, per: 60190, color: 0x5b7cf0, moons: [['Triton', 0.212]] },
  { name: 'Pluto', a: 39.48, re: 0.186, per: 90560, color: 0xd9c7a8, dwarf: true, moons: [['Charon', 0.095]] },
  { name: 'Haumea', a: 43.1, re: 0.12, per: 103400, color: 0xe8e4dc, dwarf: true },
  { name: 'Makemake', a: 45.8, re: 0.112, per: 111845, color: 0xd8a888, dwarf: true },
  { name: 'Eris', a: 67.9, re: 0.182, per: 203830, color: 0xeeeeea, dwarf: true },
];

const GC_PC = 8178; // Sun to Sagittarius A*, GRAVITY Collaboration 2019

function starColor(teff) {
  if (!(teff > 0)) return 0xffe890;
  if (teff < 3700) return 0xffa060;
  if (teff < 5200) return 0xffc880;
  if (teff < 6000) return 0xffe890;
  if (teff < 7500) return 0xfff4d8;
  if (teff < 10000) return 0xe0ecff;
  return 0xb8d0ff;
}
function planetColor(r, teq, re) {
  if (re > 6) return pick(r, [0xd9b38c, 0xe8d49a, 0xc9a37a, 0xa8e0e6, 0x8fb0f0]);
  if (teq > 1200) return pick(r, [0xff9a3c, 0xffc070, 0xf0a060]);
  if (teq > 600) return pick(r, [0xeedcaa, 0xd8a070, 0xc8b090]);
  if (teq > 200) return pick(r, [0x5f8fe8, 0x7fbf6a, 0x6fb0a0, 0xc79a62]);
  return pick(r, [0xcfe6f0, 0xb9b6ad, 0xe8e8f0]);
}
function classify(type = '') {
  const t = String(type).trim();
  if (/^(d?Sph|dE|dS|dG|dTr)/i.test(t) || /dwarf/i.test(t)) return 'dwarf';
  if (/^(E-?S0|S0|SA0|SB0|SAB0|L)/.test(t)) return 'lenticular';
  if (/^SB|^SAB/.test(t)) return 'barred';
  if (/^E|^cD/.test(t)) return 'elliptical';
  if (/^I|^dI|Irr|^Im/.test(t)) return 'irregular';
  if (/^S/.test(t)) return 'spiral';
  return 'spiral';
}
const DEFAULT_KPC = { dwarf: 0.8, lenticular: 10, barred: 14, elliptical: 16, irregular: 4, spiral: 13 };

// How populated a galaxy is. The count is keyed to the galaxy's real physical
// radius (rkpc) and its type, calibrated at load off the Milky Way's own real
// system count, so every other galaxy carries the same density of stars,
// stations, pumps and zones as home. The ceilings are purely the memory and
// generation-time budget; the floors stop a dwarf ever being literally empty.
const KIND_MULT = { spiral: 1.0, barred: 1.0, lenticular: 0.55, elliptical: 0.5, irregular: 0.3, dwarf: 0.12 };
const N_MIN = { spiral: 500, barred: 500, lenticular: 300, elliptical: 300, irregular: 150, dwarf: 40 };
const N_MAX = { spiral: 5000, barred: 5000, lenticular: 3000, elliptical: 3000, irregular: 1200, dwarf: 320 };
const SYSTEM_CACHE_BUDGET = 24;  // galaxies held generated at once, the Milky Way aside
const UNCHARTED_BUDGET = 4000;   // procedural galaxies past the catalogue (matches buildClouds)
const PROC_SIGHT_BUDGET = 600;   // seeded sights across every galaxy ever visited
const OTHER_ZONE_CAP = 220;      // enemy zones outside the Milky Way, per roll
const ZONE_GALAXY_CAP = 48;      // galaxies generated for zones in one roll

// Orbit plane basis from a normal.
function basis(n) {
  const nn = new THREE.Vector3(n.x, n.y, n.z).normalize();
  const a = Math.abs(nn.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(nn, a).normalize();
  const v = new THREE.Vector3().crossVectors(nn, u).normalize();
  return { n: nn, u, v };
}
function randUnit(r) {
  const z = r() * 2 - 1, a = r() * TAU, s = Math.sqrt(1 - z * z);
  return { x: s * Math.cos(a), y: z, z: s * Math.sin(a) };
}
function gauss(r) { return (r() + r() + r() + r() - 2) * 0.8660254; }

// Tiny value noise for planet textures.
function vnoise(seed) {
  const h = (x, y) => (hash(seed, x, y) % 10007) / 10007;
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function planetTexture(kind, seed, base) {
  const W = 256, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const b = col(base);
  const hex = (cc) => `#${cc.getHexString()}`;
  g.fillStyle = hex(b); g.fillRect(0, 0, W, H);
  const n = vnoise(seed);
  const r = rng(seed);
  if (kind === 'bands') {
    for (let y = 0; y < H; y += 4 + Math.floor(r() * 7)) {
      const shade = b.clone().offsetHSL(0, 0, (r() - 0.5) * 0.25);
      g.fillStyle = hex(shade);
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= W; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 2);
      g.lineTo(W, y + 5); g.lineTo(0, y + 5); g.fill();
    }
    if (seed % 3 === 0 || kind === 'jupiter') { g.fillStyle = '#d9824a'; g.beginPath(); g.ellipse(W * 0.62, H * 0.62, 14, 7, 0, 0, TAU); g.fill(); }
  } else {
    const land = kind === 'earth' ? ['#7fbf6a', '#c9b47a'] : ['#b8562e', '#8e4428'];
    const img = g.getImageData(0, 0, W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = n(x / 22, y / 22) * 0.65 + n(x / 7, y / 7) * 0.35;
        const pole = Math.abs(y / H - 0.5) > 0.42;
        let rgb = null;
        if (pole) rgb = [245, 245, 240];
        else if (v > 0.55) rgb = v > 0.68 ? hexToRgb(land[1]) : hexToRgb(land[0]);
        if (rgb) { const i = (y * W + x) * 4; img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; }
      }
    }
    g.putImageData(img, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function hexToRgb(h) { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
function texMat(tex) {
  // Textured planets get the same neon-ink shading as every other surface:
  // hatched night side, and an atmosphere-coloured rim.
  return neonize(new THREE.MeshLambertMaterial({ map: tex, flatShading: true, blending: THREE.NoBlending, opacity: ID.INK }), { rim: 0x8fb0ff, rimStrength: 0.8 });
}
function ringMat(color) {
  return neonize(new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, flatShading: true, blending: THREE.NoBlending, opacity: ID.INK }), { rim: PAL.amber, rimStrength: 0.5 });
}

// ---------------------------------------------------------------------------
// Billboard Worlds: Spiral Bound Galactic rents out planet faces. A handful of
// planets carry one of these, projected onto a circular cap of the sphere in
// the planet's own local space, so it turns with the planet and is lit and
// hatched by the same star as the rest of the surface.
// House ads are Gev's own products; everything else is invented for this
// universe. No real third-party brands, on purpose.
const AD_COPY = [
  { title: 'RIDELINK', sub: 'Find your pack. Motorcycles only, planets sold separately.', bg: PAL.paper, fg: PAL.cyan, edge: PAL.blue },
  { title: 'FITCHECK', sub: 'Rate this fit: six out of ten, would suffocate in style.', bg: PAL.paper, fg: PAL.teal, edge: PAL.teal },
  { title: 'GEV CLIENT', sub: 'See through blocks. Not through hull breaches.', bg: PAL.paper, fg: PAL.blue, edge: PAL.cyan },
  { title: 'ION JUICE', sub: 'Now thirty per cent fewer explosions.', bg: PAL.dark, fg: PAL.yellow, edge: PAL.orange },
  { title: 'PLASMA-MART', sub: 'Fill her up. Pilot optional.', bg: PAL.dark, fg: PAL.orange, edge: PAL.yellow },
  { title: 'TANK FARM DEUTERIUM', sub: 'Premium fuel, budget prices, questionable maths.', bg: PAL.dark, fg: PAL.yellow, edge: PAL.orange },
  { title: 'JOIN THE RED MARGIN', sub: 'Horns provided. Dental not.', bg: PAL.paper, fg: PAL.red, edge: PAL.red },
  { title: 'BE EVIL, BE EMPLOYED', sub: 'Enquire at any dreadnought.', bg: PAL.paper, fg: PAL.red, edge: PAL.red },
  { title: 'HULL-SURE', sub: 'We cover breach, blast and bad parking.', bg: PAL.dark, fg: PAL.yellow, edge: PAL.amber },
  { title: 'SPIRAL BOUND MUTUAL', sub: 'Crash? What crash?', bg: PAL.dark, fg: PAL.amber, edge: PAL.yellow },
  { title: 'TOW-4-U', sub: 'Out of fuel? We will drag you home. Slowly.', bg: PAL.dark, fg: PAL.orange, edge: PAL.yellow },
  { title: 'UPGRADE YOUR HULL', sub: 'Your ex will be so mad.', bg: PAL.paper, fg: PAL.cyan, edge: PAL.blue },
  { title: 'HOLD MUSIC UNLIMITED', sub: 'Ten thousand hours, zero skips. (Lies.)', bg: PAL.dark, fg: PAL.teal, edge: PAL.teal },
  { title: 'SPACE SNACKS', sub: 'Now with forty per cent less vacuum.', bg: PAL.dark, fg: PAL.yellow, edge: PAL.orange },
  { title: 'WARP IN SIXTY', sub: 'Or your money back. (No refunds.)', bg: PAL.dark, fg: PAL.orange, edge: PAL.amber },
  { title: 'BILLBOARD WORLDS', sub: 'This hemisphere available. The planet was not consulted.', bg: PAL.paper, fg: PAL.amber, edge: PAL.amber },
];
export { AD_COPY };
export const AD_COUNT = AD_COPY.length;
const AD_RIDELINK = 0, AD_RED_MARGIN = 6;

// Drawn once per copy and kept for the life of the page: the same sign shows up
// on every planet that rolled it, and a SystemView must never dispose these
// (fly away, fly back, and a disposed-but-bound texture renders black).
const adTexCache = new Map();
// Greedy word wrap, centred, drawn downward from `top`. Returns the y the next
// block should start at, so a long headline pushes its punch line down instead
// of printing over it.
function wrapText(g, text, cx, top, maxW, lh) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (line && g.measureText(t).width > maxW) { lines.push(line); line = w; }
    else line = t;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => g.fillText(l, cx, top + i * lh));
  return top + lines.length * lh;
}
function adTexture(i) {
  let t = adTexCache.get(i);
  if (t) return t;
  const a = AD_COPY[i];
  const W = 256, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const hex = (v) => `#${col(v).getHexString()}`;
  g.fillStyle = hex(a.bg); g.fillRect(0, 0, W, H);
  // soft neon edge: a blurred bright stroke under a thin sharp one
  g.save();
  g.filter = 'blur(6px)';
  g.strokeStyle = hex(a.edge); g.lineWidth = 14;
  g.strokeRect(12, 12, W - 24, H - 24);
  g.restore();
  g.strokeStyle = hex(a.edge); g.lineWidth = 3;
  g.strokeRect(16, 16, W - 32, H - 32);
  // The cap only shows the square's inscribed circle, so the copy stays inside
  // a 180 px column and stacks downward from 72.
  g.fillStyle = hex(a.fg);
  g.textAlign = 'center'; g.textBaseline = 'top';
  g.font = 'bold 30px "Patrick Hand", "Segoe Print", cursive';
  const afterTitle = wrapText(g, a.title, W / 2, 72, 176, 32);
  g.font = '17px "Patrick Hand", "Segoe Print", cursive';
  wrapText(g, a.sub, W / 2, afterTitle + 10, 180, 20);
  // printed-on wear, so it reads as painted rather than as a UI sticker
  g.globalAlpha = 0.07;
  g.fillStyle = '#000';
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
  g.globalAlpha = 1;
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  adTexCache.set(i, t);
  return t;
}
// Which planets rent out a face. Deterministic from the system's own seed, so a
// sign never moves or flickers between visits.
function assignAds(sys, out) {
  if (sys.solar) {
    for (const p of out) {
      if (p.name === 'Mars') p.ad = AD_RED_MARGIN;
      if (p.name === 'Jupiter') p.ad = AD_RIDELINK;
    }
    return;
  }
  if (!sys.station || !out.length) return;
  const r = rng(sys.seed ^ 0xad00);
  if (r() > 0.35) return;
  // the planet nearest the station's own orbit, so the sign reads as that
  // station's billboard and not as a random world across the system
  const st = sys.station.pos;
  const stR = Math.hypot(st.x - sys.pos.x, st.y - sys.pos.y, st.z - sys.pos.z);
  let best = out[0], bestD = Infinity;
  for (const p of out) { const d = Math.abs(p.orbit - stR); if (d < bestD) { bestD = d; best = p; } }
  best.ad = Math.floor(r() * AD_COPY.length) % AD_COPY.length;
}
// The decal itself. Object space only: vAdPos is the vertex position, which on
// the unit sphere is also the outward normal, so nothing here knows where the
// camera is. The sign can only move because the planet turned. It is mixed into
// the albedo before the lighting chunks run, so the star lights it, the night
// side swallows it and the terminator fades across it for free.
const AD_DECAL_FS = `
{
  vec3 adP = normalize(vAdPos);
  float adCos = dot(adP, uAdDir);
  if (adCos > uAdCosOuter) {
    float adR = sqrt(max(1e-4, 1.0 - uAdCos * uAdCos));
    vec2 adUv = vec2(dot(adP, uAdU), dot(adP, uAdV)) / adR * 0.5 + 0.5;
    vec4 adCol = texture2D(uAdMap, clamp(adUv, 0.0, 1.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, adCol.rgb, smoothstep(uAdCosOuter, uAdCos, adCos));
  }
}`;
function tangentFrame(dir) {
  const up = Math.abs(dir.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(up, dir).normalize();
  const v = new THREE.Vector3().crossVectors(dir, u).normalize();
  return { u, v };
}
// A planet carrying an ad needs its own material instance: the decal lives in
// the material's uniforms, and ink() hands out one shared material per colour,
// so a cached one would paint this sign onto every planet of the same colour.
function adPlanetMat(p, baseTex) {
  const r = rng(hash(p.name, 'ad'));
  const d = randUnit(r);
  const dir = new THREE.Vector3(d.x, d.y, d.z).normalize();
  const { u, v } = tangentFrame(dir);
  const half = 22 * (Math.PI / 180);      // cap half angle, the sign's radius on the sphere
  const feather = 4 * (Math.PI / 180);    // soft edge, so the circle is not a cutout
  const mat = neonize(new THREE.MeshLambertMaterial({
    color: p.color, map: baseTex || null, flatShading: true, blending: THREE.NoBlending, opacity: ID.INK,
  }), { rim: 0x8fb0ff, rimStrength: 0.8 });
  const decal = adTexture(p.ad);
  mat.userData.decalDir = dir;
  mat.userData.ad = p.ad;
  mat.userData.adFrag = AD_DECAL_FS;
  mat.userData.adMap = decal;   // shared and permanent: never goes in a view's dispose list
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh) => {
    base(sh);
    sh.uniforms.uAdDir = { value: dir };
    sh.uniforms.uAdU = { value: u };
    sh.uniforms.uAdV = { value: v };
    sh.uniforms.uAdCos = { value: Math.cos(half) };
    sh.uniforms.uAdCosOuter = { value: Math.cos(half + feather) };
    sh.uniforms.uAdMap = { value: decal };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAdPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAdPos = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vAdPos;
uniform vec3 uAdDir, uAdU, uAdV;
uniform float uAdCos, uAdCosOuter;
uniform sampler2D uAdMap;`)
      .replace('#include <map_fragment>', `#include <map_fragment>${AD_DECAL_FS}`);
  };
  // neonize pins one program cache key across every ink material; the decal
  // changes the shader text, so it needs its own key or three.js hands back
  // the plain program and the sign never appears.
  const keyOf = mat.customProgramCacheKey;
  const baseKey = typeof keyOf === 'function' ? keyOf.call(mat) : '';
  mat.customProgramCacheKey = () => `${baseKey}|ad`;
  return mat;
}

// A set of points held in float64 offsets around a centre, re-squashed every
// frame so near points parallax properly and far ones stay in range.
class Swarm {
  constructor(n, id) {
    this.n = n;
    this.local = new Float64Array(n * 3);
    this.colors = new Array(n);
    this.base = new Float32Array(n);
    this.cloud = new Cloud(n, id);
  }
  update(center, ship, sizeMul = 1) {
    const L = this.local, out = V, c = this.cloud;
    for (let i = 0; i < this.n; i++) {
      const x = center.x + L[i * 3] - ship.x, y = center.y + L[i * 3 + 1] - ship.y, z = center.z + L[i * 3 + 2] - ship.z;
      squash(x, y, z, out);
      c.set(i, out.x, out.y, out.z, this.colors[i], this.base[i] * sizeMul);
    }
    c.commit(this.n);
  }
  dispose() { this.cloud.geo.dispose(); this.cloud.mat.dispose(); }
}

// Shape a galaxy (or nebula) in its local frame.
function shapePoints(kind, R, r, n, flat = true) {
  const pts = new Float64Array(n * 3);
  const arms = 2 + Math.floor(r() * 3);
  const twist = 1.6 + r() * 1.6;
  for (let i = 0; i < n; i++) {
    let x, y, z;
    if (kind === 'spiral' || kind === 'barred') {
      if (i % 7 === 0) { x = gauss(r) * R * 0.12; y = gauss(r) * R * 0.06; z = gauss(r) * R * 0.12; }
      else if (kind === 'barred' && i % 7 === 1) { x = (r() - 0.5) * R * 0.6; y = gauss(r) * R * 0.03; z = gauss(r) * R * 0.05; }
      else {
        const t = Math.pow(r(), 0.8);
        const rad = R * (0.06 + 0.94 * t);
        const arm = i % arms;
        const ang = (arm * TAU) / arms + Math.log(rad / R * 20 + 1) * twist + gauss(r) * 0.28;
        x = Math.cos(ang) * rad; z = Math.sin(ang) * rad; y = gauss(r) * R * (flat ? 0.025 : 0.2);
      }
    } else if (kind === 'elliptical' || kind === 'lenticular') {
      const f = kind === 'lenticular' ? 0.25 : 0.7;
      x = gauss(r) * R * 0.45; y = gauss(r) * R * 0.45 * f; z = gauss(r) * R * 0.45 * (0.6 + r() * 0.4);
    } else if (kind === 'irregular') {
      const k = Math.floor(r() * 4);
      const cx = Math.cos(k * 1.9) * R * 0.4, cz = Math.sin(k * 2.7) * R * 0.4;
      x = cx + gauss(r) * R * 0.25; y = gauss(r) * R * 0.12; z = cz + gauss(r) * R * 0.25;
    } else if (kind === 'nebula') {
      const k = Math.floor(r() * 5);
      const cx = Math.cos(k * 2.1) * R * 0.35, cy = Math.sin(k * 1.3) * R * 0.25, cz = Math.sin(k * 2.9) * R * 0.35;
      x = cx + gauss(r) * R * 0.3; y = cy + gauss(r) * R * 0.3; z = cz + gauss(r) * R * 0.3;
    } else if (kind === 'shell') {
      const d = randUnit(r); const rad = R * (0.8 + r() * 0.25);
      x = d.x * rad; y = d.y * rad; z = d.z * rad;
    } else {
      x = gauss(r) * R * 0.4; y = gauss(r) * R * 0.3; z = gauss(r) * R * 0.4;
    }
    pts[i * 3] = x; pts[i * 3 + 1] = y; pts[i * 3 + 2] = z;
  }
  return pts;
}
function rotateAll(pts, q) {
  for (let i = 0; i < pts.length; i += 3) {
    V.set(pts[i], pts[i + 1], pts[i + 2]).applyQuaternion(q);
    pts[i] = V.x; pts[i + 1] = V.y; pts[i + 2] = V.z;
  }
}

// One star system drawn up close: star, planets, moons, rings, orbits, station.
class SystemView {
  constructor(u, sys) {
    this.u = u;
    this.sys = sys;
    this.group = new THREE.Group();
    u.root.add(this.group);
    this.bodies = [];
    this.textures = [];
    this.mats = [];
    const star = new THREE.Mesh(SPHERE, starGlow(starColor(sys.star.teff)));
    this.group.add(star);
    this.starMesh = star;
    this.bodies.push({ kind: 'star', name: sys.name, r: sys.star.r, mesh: star, pos: { ...sys.pos }, sys, planet: null });
    for (const p of u.planetsOf(sys)) {
      let mat;
      let baseTex = null;
      if (p.tex) { baseTex = planetTexture(p.tex, hash(p.name), p.color); this.textures.push(baseTex); }
      // A rented face never shares a cached material: the decal is in its uniforms.
      if (p.ad != null) { mat = adPlanetMat(p, baseTex); this.mats.push(mat); }
      else if (baseTex) { mat = texMat(baseTex); this.mats.push(mat); }
      else {
        // A flat-colour planet gets the atmosphere/twilight/cloud shader, which
        // needs its own uSunDirObj per mesh, so it can no longer come out of
        // ink()'s cache keyed on colour alone. A system only ever has a handful
        // of planets alive, and this.mats disposes them.
        mat = neonizePlanet(new THREE.MeshLambertMaterial({
          color: p.color, flatShading: true, blending: THREE.NoBlending, opacity: ID.INK,
        }), { atmo: atmoColorFor(p.teq ?? 300), giant: p.re > 6 });
        this.mats.push(mat);
      }
      const m = new THREE.Mesh(SPHERE, mat);
      this.group.add(m);
      const body = { kind: p.dwarf ? 'dwarf planet' : 'planet', name: p.name, r: p.r, mesh: m, pos: { x: 0, y: 0, z: 0 }, sys, planet: p };
      if (p.rings) {
        const rg = new THREE.Mesh(new THREE.RingGeometry(p.rings[0], p.rings[1], 72, 1), ringMat(0xe8dcb0));
        this.mats.push(rg.material);
        rg.rotation.x = Math.PI / 2 - 0.35;
        m.add(rg);
      }
      this.group.add(m);
      this.bodies.push(body);
      for (const moon of p.moons || []) {
        const mm = new THREE.Mesh(LOWSPHERE, ink(0xd8d4cc));
        this.group.add(mm);
        this.bodies.push({ kind: 'moon', name: moon.name, r: moon.r, mesh: mm, pos: { x: 0, y: 0, z: 0 }, sys, planet: moon, parent: body });
      }
    }
    if (sys.station) {
      const st = buildStation('fuel', { fuelTypes: sys.station.fuelTypes });
      this.stationObj = st;
      this.group.add(st.group);
      this.bodies.push({ kind: 'station', name: sys.station.name, r: st.radius, mesh: st.group, pos: { ...sys.station.pos }, sys, station: sys.station, fixedScale: true });
    }
    // orbit rings, rebuilt into one dashed line every frame
    const planets = this.bodies.filter((b) => b.kind === 'planet' || b.kind === 'dwarf planet');
    this.orbitN = 96;
    this.orbitPos = new Float32Array(planets.length * this.orbitN * 3);
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.BufferAttribute(this.orbitPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.orbits = new THREE.LineSegments(og, lineMat());
    this.orbits.frustumCulled = false;
    this.group.add(this.orbits);
    this.planets = planets;
  }
  update(ship, t) {
    const sys = this.sys;
    for (const b of this.bodies) {
      if (b.kind === 'planet' || b.kind === 'dwarf planet') this.u.planetPos(sys, b.planet, t, b.pos);
      else if (b.kind === 'moon') this.u.moonPos(b.parent, b.planet, t, b.pos);
      const s = squash(b.pos.x - ship.x, b.pos.y - ship.y, b.pos.z - ship.z, b.mesh.position);
      b.mesh.scale.setScalar(b.fixedScale ? s : b.r * s);
      if (b.planet && b.kind !== 'moon') {
        b.mesh.rotation.y = t * 0.02;
        // The twilight arc needs the sun direction in the planet's own object
        // space, which three.js hands no shader: write it here, once per planet
        // per frame. Everything in this view is squashed relative to the ship,
        // so the star is not at the group's origin - the direction is the star
        // mesh's own position minus this planet's. Rotating a direction only
        // needs the inverse of the mesh's own spin; the translation drops out,
        // and the quaternion is already current from the rotation.y above.
        const sun = b.mesh.material.userData.sunUniform;
        if (sun) {
          _sunDir.copy(this.starMesh.position).sub(b.mesh.position).normalize();
          _sunDir.applyQuaternion(_sunQ.copy(b.mesh.quaternion).invert());
          sun.value.copy(_sunDir);
        }
      }
    }
    // orbits
    const P = this.orbitPos, N = this.orbitN, B = sys.basis;
    let k = 0;
    for (const b of this.planets) {
      const R = b.planet.orbit;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU;
        const x = sys.pos.x + (B.u.x * Math.cos(a) + B.v.x * Math.sin(a)) * R - ship.x;
        const y = sys.pos.y + (B.u.y * Math.cos(a) + B.v.y * Math.sin(a)) * R - ship.y;
        const z = sys.pos.z + (B.u.z * Math.cos(a) + B.v.z * Math.sin(a)) * R - ship.z;
        squash(x, y, z, V);
        P[k++] = V.x; P[k++] = V.y; P[k++] = V.z;
      }
    }
    this.orbits.geometry.attributes.position.needsUpdate = true;
    this.orbits.geometry.setDrawRange(0, k / 3);
  }
  dispose() {
    this.u.root.remove(this.group);
    this.orbits.geometry.dispose();
    for (const t of this.textures) t.dispose();
    for (const m of this.mats) m.dispose();
  }
}

// A view site drawn up close.
class SightView {
  constructor(u, s) {
    this.u = u; this.s = s;
    this.group = new THREE.Group();
    u.root.add(this.group);
    this.swarm = null;
    this.meshes = [];
    const r = rng(hash('sight', s.name));
    const R = s.R;
    const add = (mesh, scale) => { this.group.add(mesh); this.meshes.push({ mesh, scale, spin: 0 }); return mesh; };
    if (s.kind === 'nebula' || s.kind === 'remnant' || s.kind === 'cluster') {
      const n = s.kind === 'cluster' ? 700 : 1800;
      const shape = s.kind === 'remnant' ? 'shell' : s.kind === 'cluster' ? 'ball' : 'nebula';
      this.swarm = new Swarm(n, ID.GLOW);
      this.swarm.local.set(shapePoints(shape, R, r, n));
      const palette = s.kind === 'cluster' ? [0xfff4d8, 0xe0ecff, 0xffe890] : [0xf2a0b8, 0x5cc7c0, 0xffd84a, 0xb8d0ff];
      for (let i = 0; i < n; i++) { this.swarm.colors[i] = col(pick(r, palette)); this.swarm.base[i] = s.kind === 'cluster' ? 2.2 : 1.6 + r() * 2.2; }
      u.renderer.track(this.swarm.cloud.mat);
      this.group.add(this.swarm.cloud.obj);
    } else if (s.kind === 'blackhole') {
      add(new THREE.Mesh(SPHERE, ink(0x0a0a18)), R * 0.3);
      const disk = add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.18, 8, 64), glow(0xffb050)), R);
      disk.rotation.x = Math.PI / 2 - 0.3;
      const ring = add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 6, 64), glow(0xffe890)), R * 0.42);
      ring.rotation.x = 0.2;
    } else if (s.kind === 'pulsar') {
      add(new THREE.Mesh(SPHERE, glow(0xe0ecff)), R * 0.2);
      const beams = new THREE.Group();
      for (const sgn of [1, -1]) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.25, 2, 12, 1, true), glow(0xb8d0ff));
        c.position.y = sgn; c.rotation.x = sgn > 0 ? Math.PI : 0;
        beams.add(c);
      }
      const m = add(beams, R);
      m.rotation.z = 0.5;
      this.meshes[this.meshes.length - 1].spin = 3;
    } else {
      add(new THREE.Mesh(SPHERE, glow(s.color || 0xffc070)), R);
    }
  }
  update(ship, t) {
    const s = this.s;
    if (this.swarm) this.swarm.update(s.pos, ship, 1);
    for (const m of this.meshes) {
      const k = squash(s.pos.x - ship.x, s.pos.y - ship.y, s.pos.z - ship.z, m.mesh.position);
      m.mesh.scale.setScalar(m.scale * k);
      if (m.spin) m.mesh.rotation.y = t * m.spin;
    }
  }
  dispose() {
    this.u.root.remove(this.group);
    if (this.swarm) { this.u.renderer.pointMats.delete(this.swarm.cloud.mat); this.swarm.dispose(); }
  }
}

const BAZAAR_MODULES = [
  ['hub', 'Bazaar Hub', [0, 0, 0]],
  ['shipyard', 'Eraser Row Shipyard', [1, 0.1, 0.2]],
  ['shipyard', 'Spiral Bound Shipyard', [-0.8, -0.2, 0.9]],
  ['outfitter', 'Staple Street Outfitters', [0.3, 0.25, -1]],
  ['outfitter', 'Protractor & Sons Outfitters', [-1, 0.15, -0.4]],
  ['general', 'The Pencil Sharpener', [0.7, -0.3, 0.8]],
  ['general', 'Margin Mall', [-0.3, 0.4, 0.5]],
  ['general', 'Glue Stick Grocers', [0.2, -0.5, -0.5]],
  ['media', 'Rewind Video Kiosk', [-0.6, -0.4, -0.9]],
  ['fuel', 'Bazaar Pumps North', [0.1, 0.9, 0.1], ['ION', 'PLASMA', 'DEUTERIUM']],
  ['fuel', 'Bazaar Pumps South', [-0.1, -0.95, 0.2], ['ION', 'PLASMA', 'DEUTERIUM']],
  ['fuel', 'Deuterium Only Depot', [1.1, -0.1, -0.7], ['DEUTERIUM']],
];

// A galaxy's own little Bazaar. No 'hub' module: that shop screen is the
// Bazaar's own directory. Fuel twice, so a depot usually sells something,
// though never guaranteed to be your nozzle.
const HUB_KINDS = ['fuel', 'shipyard', 'outfitter', 'general', 'fuel', 'media'];
const HUB_WORD = { shipyard: 'Shipyard', outfitter: 'Outfitters', general: 'General Store', fuel: 'Pumps', media: 'Video Kiosk' };

// The named clusters and superclusters, as regions on the map. Distances and
// directions are the real ones where a real one exists; the two superclusters
// and Laniakea are mass concentrations rather than single objects, so they are
// placed by direction and distance instead of by a catalogue row.
//   name, kind, anchor (null = Local Group midpoint | {galaxy} | {ra,dec,mly}),
//   real radius in Mly, how much it thickens the procedural galaxy field, blurb
const REGIONS = [
  ['Local Group', 'group', null, 5, 0,
    'Home. The Milky Way, Andromeda and about eighty much smaller galaxies, bound together by gravity.'],
  ['Virgo Cluster', 'cluster', { galaxy: 'NGC 4486' }, 7.5, 4,
    'About 1,300 galaxies around the giant elliptical M87, 54 million light-years out. The Scribbler holds it.'],
  ['Fornax Cluster', 'cluster', { galaxy: 'NGC 1399' }, 4, 4,
    'Small, tidy, about 62 million light-years away. The Hole Punch collects the dots.'],
  ['Coma Cluster', 'cluster', { galaxy: 'NGC 4874' }, 10, 4,
    'About 330 million light-years out, where the missing mass first showed up. The Smudge hides in it.'],
  ['Hydra-Centaurus Supercluster', 'supercluster', { ra: 158.0, dec: -46.0, mly: 250 }, 100, 2,
    'The Great Attractor, behind our own dust in the Zone of Avoidance. Everything drifts this way. So does the Inkblot.'],
  ['Perseus-Pisces Supercluster', 'supercluster', { ra: 27.5, dec: 36.0, mly: 250 }, 100, 2,
    'A chain of galaxies more than forty degrees across, just outside Laniakea. The Paper Cut works this wall.'],
  ['Laniakea Supercluster', 'supercluster', { ra: 158.0, dec: -46.0, mly: 160 }, 250, 0,
    'Immeasurable heaven: the whole basin that falls toward the Great Attractor. About 100,000 galaxies, and we are in it.'],
];

export class Universe {
  constructor(renderer) {
    this.renderer = renderer;
    this.root = new THREE.Group();
    renderer.world.add(this.root);
    this.galaxies = [];
    this.byId = new Map();
    this.sights = [];
    this.regions = [];
    this.systemCache = new Map();
    this.cacheOrder = [];   // galaxy ids, least recently used first
    this.catalogCount = 0;  // galaxies before anything procedural is added
    this.procSights = 0;
    this.views = new Map();
    this.sightViews = new Map();
    this.details = new Map();
    this.zones = [];
    this.counts = { galaxies: 0, hosts: 0, planets: 0, sights: 0 };
    this.cellsDone = new Set();
    this.ctx = { galaxy: null, system: null, nearest: null, dnear: 1e9, bodies: [] };
    this.tick = 0;
  }

  async load() {
    const get = async (url) => {
      try { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return await r.json(); }
      catch (e) { console.warn(`[universe] ${url} not loaded (${e.message})`); return null; }
    };
    const [gal, exo, sights, stars] = await Promise.all([get('data/galaxies.json'), get('data/exoplanets.json'), get('data/sights.json'), get('data/stars.json')]);
    this.buildMilkyWay(exo, stars);
    this.buildGalaxies(gal);
    this.buildSights(sights);
    this.buildRegions();
    this.buildBazaar();
    this.buildClouds();
  }

  rowsOf(data) {
    if (!data || !Array.isArray(data.rows) || !Array.isArray(data.fields)) return [];
    const f = data.fields;
    return data.rows.map((row) => { const o = {}; f.forEach((k, i) => { o[k] = row[i]; }); return o; });
  }

  addGalaxy(g) {
    g.index = this.galaxies.length;
    this.galaxies.push(g);
    this.byId.set(g.id, g);
    return g;
  }

  buildMilkyWay(exo, starData) {
    const gcDir = { x: 1, y: 0, z: 0 };
    const gcU = pcToU(GC_PC);
    const mw = this.addGalaxy({
      id: 'milky-way', name: 'Milky Way', alt: 'our galaxy', type: 'SBbc', kind: 'barred', group: 'MW', real: true,
      pc: 0, mly: 0, dq: 'lit', con: '', pos: { x: gcDir.x * gcU, y: 0, z: 0 }, R: 5.6e8, seed: hash('milky-way'),
      rot: new THREE.Quaternion(),
    });
    this.mw = mw;
    // Sol
    const sol = this.makeSystem(mw, {
      id: 'sol', name: 'Sol', pos: { x: 0, y: 0, z: 0 }, real: true, teff: 5772, srad: 1, pc: 0,
      normal: radecDir(270, 66.56), solar: true,
    });
    sol.station = { name: 'Sol Pumps (Earth orbit)', fuelTypes: [...FUELS], pos: null };
    sol.station.pos = this.stationPos(sol);
    this.sol = sol;
    const systems = [sol];
    // Real exoplanet hosts
    const hosts = new Map();
    for (const p of this.rowsOf(exo)) {
      if (!p.host || !(p.pc > 0) || p.ra == null || p.dec == null) continue;
      let h = hosts.get(p.host);
      if (!h) { h = { name: p.host, ra: p.ra, dec: p.dec, pc: p.pc, teff: p.steff, srad: p.srad, planets: [] }; hosts.set(p.host, h); }
      if (!(h.teff > 0) && p.steff > 0) h.teff = p.steff;
      if (!(h.srad > 0) && p.srad > 0) h.srad = p.srad;
      h.planets.push(p);
      this.counts.planets++;
    }
    for (const h of hosts.values()) {
      const d = radecDir(h.ra, h.dec), u = pcToU(h.pc);
      const sys = this.makeSystem(mw, {
        id: 'h:' + h.name, name: h.name, pos: { x: d.x * u, y: d.y * u, z: d.z * u }, real: true,
        teff: h.teff, srad: h.srad, pc: h.pc, exo: h.planets,
      });
      systems.push(sys);
    }
    this.counts.hosts = hosts.size;
    // Real stars from HYG (naked-eye or within 25 pc), merged with the hosts
    // above so a star with known planets is listed once.
    const cell = (ra, dec) => `${Math.round(ra * 5)},${Math.round(dec * 5)}`;
    const hostCells = new Map();
    for (const h of hosts.values()) {
      const k = cell(h.ra, h.dec);
      if (!hostCells.has(k)) hostCells.set(k, []);
      hostCells.get(k).push(h);
    }
    const isHost = (s) => {
      const r0 = Math.round(s.ra * 5), d0 = Math.round(s.dec * 5);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        for (const h of hostCells.get(`${r0 + a},${d0 + b}`) || []) {
          if (Math.abs(h.ra - s.ra) < 0.05 && Math.abs(h.dec - s.dec) < 0.05 && Math.abs(h.pc - s.pc) < Math.max(0.3, s.pc * 0.08)) return true;
        }
      }
      return false;
    };
    let nStars = 0;
    for (const s of this.rowsOf(starData)) {
      if (!s.name || !(s.pc > 0) || s.ra == null || s.dec == null || /^(sol|sun)$/i.test(s.name) || isHost(s)) continue;
      const ci = Number.isFinite(s.ci) ? clamp(s.ci, -0.4, 2.2) : 0.65;
      const teff = 4600 * (1 / (0.92 * ci + 1.7) + 1 / (0.92 * ci + 0.62));
      const sp = String(s.spect || '');
      const srad = /I[ab]|\bI\b|0-Ia/.test(sp) && !/III|IV|V/.test(sp) ? 60 : /III/.test(sp) ? 12 : /IV/.test(sp) ? 2.2 : Math.pow(teff / 5772, 0.9);
      const d = radecDir(s.ra, s.dec), u = pcToU(s.pc);
      systems.push(this.makeSystem(mw, {
        id: 's:' + s.name, name: s.name, pos: { x: d.x * u, y: d.y * u, z: d.z * u }, real: true, teff, srad, pc: s.pc, star: true,
      }));
      nStars++;
    }
    this.counts.stars = nStars;
    // Uncharted systems fill the rest of the disc, never within 3 kpc of the Sun
    const r = rng(hash('mw-uncharted'));
    const pts = shapePoints('barred', mw.R, r, 2600);
    let n = 0;
    const minD = pcToU(3000);
    for (let i = 0; i < pts.length / 3 && n < 900; i++) {
      const pos = { x: mw.pos.x + pts[i * 3], y: pts[i * 3 + 1], z: pts[i * 3 + 2] };
      if (Math.hypot(pos.x, pos.y, pos.z) < minD) continue;
      systems.push(this.makeSystem(mw, { id: `mw:u${n}`, name: `Uncharted MW-${String(n + 1).padStart(3, '0')}`, pos, real: false, seed: hash('mwu', n) }));
      n++;
    }
    this.systemCache.set(mw.id, systems);
  }

  makeSystem(g, o) {
    const r = rng(o.seed ?? hash('sys', o.id));
    const teff = o.teff > 0 ? o.teff : 2800 + Math.pow(r(), 1.6) * 9000;
    const srad = o.srad > 0 ? o.srad : 0.2 + Math.pow(r(), 2) * 6;
    const sys = {
      id: o.id, name: o.name, galaxy: g, pos: o.pos, real: !!o.real, pc: o.pc ?? null, solar: !!o.solar,
      star: { teff, srad, r: sunRToU(srad) }, exo: o.exo || null, planets: null,
      basis: basis(o.normal || randUnit(r)), seed: o.seed ?? hash('sys', o.id),
    };
    if (!o.solar && r() < 0.42) {
      const roll = r();
      const types = roll < 0.4 ? [pick(r, FUELS)] : roll < 0.75 ? FUELS.filter((f) => f !== pick(r, FUELS)) : [...FUELS];
      sys.station = { name: `${o.name} ${pick(r, ['Pumps', 'Fuel Stop', 'Gas & Go', 'Refuelling Post', 'Tank Farm'])}`, fuelTypes: types, pos: null };
    }
    if (sys.station) sys.station.pos = this.stationPos(sys);
    return sys;
  }
  stationPos(sys) {
    const R = sys.star.r * 3.2 + 9000;
    const a = (sys.seed % 628) / 100;
    const B = sys.basis;
    return {
      x: sys.pos.x + (B.u.x * Math.cos(a) + B.v.x * Math.sin(a)) * R + B.n.x * 4000,
      y: sys.pos.y + (B.u.y * Math.cos(a) + B.v.y * Math.sin(a)) * R + B.n.y * 4000,
      z: sys.pos.z + (B.u.z * Math.cos(a) + B.v.z * Math.sin(a)) * R + B.n.z * 4000,
    };
  }

  planetsOf(sys) {
    if (sys.planets) return sys.planets;
    const r = rng(sys.seed ^ 0x51ed);
    const out = [];
    const orbitBase = sys.star.r * 1.3;
    const T = (per) => Math.max(900, 7200 * Math.sqrt(per / 365.25));
    if (sys.solar) {
      for (const p of SOLAR) {
        const pr = earthRToU(p.re);
        const pl = { name: p.name, color: p.color, tex: p.tex, rings: p.rings, dwarf: p.dwarf, r: pr, orbit: orbitBase + auToU(p.a), T: T(p.per), phase: r() * TAU, real: true, a: p.a, re: p.re, per: p.per };
        pl.moons = (p.moons || []).map(([name, re], i) => ({ name, r: earthRToU(re), orbit: pr * (2.4 + i * 1.3), T: 600 + i * 260, phase: r() * TAU }));
        out.push(pl);
      }
    } else if (sys.exo) {
      const sorted = [...sys.exo].sort((a, b) => (a.a ?? a.per ?? 0) - (b.a ?? b.per ?? 0));
      sorted.forEach((p, i) => {
        const a = p.a > 0 ? p.a : p.per > 0 ? Math.pow(p.per / 365.25, 2 / 3) : 0.05 * (i + 1);
        const per = p.per > 0 ? p.per : Math.pow(a, 1.5) * 365.25;
        const re = p.rade > 0 ? p.rade : 2;
        out.push({
          name: p.pl, color: planetColor(r, p.teq ?? 300, re), tex: re > 6 ? 'bands' : null, r: earthRToU(re),
          orbit: orbitBase + auToU(a) + i * 900, T: T(per), phase: r() * TAU, real: true, a, re, per, teq: p.teq,
          year: p.year, method: p.method, moons: [],
        });
      });
    } else {
      const n = Math.floor(r() * 8);
      let a = 0.05 + r() * 0.3;
      for (let i = 0; i < n; i++) {
        a *= 1.5 + r() * 0.9;
        const giant = a > 2 && r() < 0.55;
        const re = giant ? 3.5 + r() * 9 : 0.3 + r() * 2.2;
        const teq = 280 * Math.pow(sys.star.teff / 5772, 1) / Math.sqrt(a) * Math.sqrt(sys.star.srad);
        const letter = String.fromCharCode(98 + i);
        const pl = {
          name: `${sys.name} ${letter}`, color: planetColor(r, teq, re), tex: giant ? 'bands' : null, r: earthRToU(re),
          orbit: orbitBase + auToU(a), T: T(Math.pow(a, 1.5) * 365.25), phase: r() * TAU, real: false, a, re, teq,
          rings: giant && r() < 0.35 ? [1.3, 2.1 + r() * 0.6] : null, moons: [],
        };
        const nm = giant ? Math.floor(r() * 4) : Math.floor(r() * 2);
        for (let k = 0; k < nm; k++) pl.moons.push({ name: `${pl.name} ${['I', 'II', 'III', 'IV'][k]}`, r: earthRToU(0.05 + r() * 0.3), orbit: pl.r * (2.4 + k * 1.3), T: 600 + k * 260, phase: r() * TAU });
        out.push(pl);
      }
    }
    assignAds(sys, out);
    sys.planets = out;
    return out;
  }
  planetPos(sys, p, t, out) {
    const a = p.phase + (TAU * t) / p.T, B = sys.basis, c = Math.cos(a) * p.orbit, s = Math.sin(a) * p.orbit;
    out.x = sys.pos.x + B.u.x * c + B.v.x * s;
    out.y = sys.pos.y + B.u.y * c + B.v.y * s;
    out.z = sys.pos.z + B.u.z * c + B.v.z * s;
    return out;
  }
  moonPos(parentBody, m, t, out) {
    const B = parentBody.sys.basis, a = m.phase + (TAU * t) / m.T, c = Math.cos(a) * m.orbit, s = Math.sin(a) * m.orbit;
    out.x = parentBody.pos.x + B.u.x * c + B.v.x * s;
    out.y = parentBody.pos.y + B.u.y * c + B.v.y * s;
    out.z = parentBody.pos.z + B.u.z * c + B.v.z * s;
    return out;
  }

  buildGalaxies(data) {
    const rows = this.rowsOf(data);
    // Calibrate density off the Milky Way we just built, not off a constant, so
    // a catalogue refresh can never desync "as busy as home" from home.
    this.baseN = (this.systemCache.get(this.mw.id) || []).length || 16000;
    this.baseKpc = DEFAULT_KPC.barred;
    const seen = new Set(['milky way', 'milky way galaxy']);
    for (const row of rows) {
      const name = String(row.name || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key) || row.group === 'MW') continue;
      seen.add(key);
      let pc = row.mly > 0 ? mlyToPc(row.mly) : 0;
      if (!(pc > 0)) {
        // No distance at all: place it by brightness, marked as estimated.
        const mag = Number.isFinite(row.mag) ? row.mag : 13;
        pc = clamp(Math.pow(10, (mag + 21 + 5) / 5) , 1e6, 4e8);
      }
      if (row.ra == null || row.dec == null) continue;
      const d = radecDir(row.ra, row.dec), u = pcToU(pc);
      const kind = classify(row.type);
      let rkpc = DEFAULT_KPC[kind];
      if (row.size > 0) rkpc = ((row.size / 60) * (Math.PI / 180) * pc) / 2 / 1000;
      const R = clamp(rkpc * 1000 * lateralScale(pc) * 2, 2e7, 4e8);
      const seed = hash('gal', key);
      const r = rng(seed);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...Object.values(randUnit(r))).normalize());
      this.addGalaxy({
        id: 'g:' + key, name, alt: row.alt || '', type: row.type || '', kind, group: row.group || '', real: true,
        pc, mly: row.mly > 0 ? row.mly : (pc * 3.26156) / 1e6, dq: row.dq || 'est', con: row.con || '', mag: row.mag,
        pos: { x: d.x * u, y: d.y * u, z: d.z * u }, R, rkpc, seed, rot: q,
      });
    }
    this.counts.galaxies = this.galaxies.length;
    this.catalogCount = this.galaxies.length;
  }

  // How many star systems a galaxy carries. Pure: same answer every time, so a
  // galaxy dropped from the cache regenerates bit for bit and saved zone ids
  // and bookmarks still resolve.
  systemCountOf(g) {
    if (g === this.mw) return (this.systemCache.get(this.mw.id) || []).length;
    const kpc = g.rkpc > 0 ? g.rkpc : DEFAULT_KPC[g.kind] || 10;
    const raw = this.baseN * Math.pow(kpc / this.baseKpc, 3) * (KIND_MULT[g.kind] ?? 0.3);
    return clamp(Math.round(raw), N_MIN[g.kind] ?? 150, N_MAX[g.kind] ?? 1200);
  }

  // Least-recently-used galaxies lose their generated systems. The Milky Way,
  // the galaxy you are in and the ones being drawn are pinned.
  touchCache(id) {
    if (this.mw && id === this.mw.id) return;
    const i = this.cacheOrder.indexOf(id);
    if (i >= 0) this.cacheOrder.splice(i, 1);
    this.cacheOrder.push(id);
    if (this.cacheOrder.length <= SYSTEM_CACHE_BUDGET) return;
    const pinned = new Set([this.ctx.galaxy && this.ctx.galaxy.id, ...(this.nearG || []).map((g) => g.id), ...this.details.keys()]);
    for (let k = 0; k < this.cacheOrder.length && this.cacheOrder.length > SYSTEM_CACHE_BUDGET;) {
      const cid = this.cacheOrder[k];
      if (pinned.has(cid) || cid === id) { k++; continue; }
      this.systemCache.delete(cid);
      this.cacheOrder.splice(k, 1);
    }
  }

  // The named clusters and superclusters, placed once at load.
  buildRegions() {
    this.regions = [];
    for (const [name, kind, anchor, rMly, bias, blurb] of REGIONS) {
      let pos = null, pc = null;
      if (!anchor) {
        const m31 = this.findGalaxy('M31') || this.findGalaxy('Andromeda Galaxy');
        if (!m31) continue;
        pos = { x: (this.mw.pos.x + m31.pos.x) / 2, y: (this.mw.pos.y + m31.pos.y) / 2, z: (this.mw.pos.z + m31.pos.z) / 2 };
        pc = m31.pc / 2;
      } else if (anchor.galaxy) {
        const g = this.findGalaxy(anchor.galaxy);
        if (!g) continue;
        pos = { ...g.pos };
        pc = g.pc;
      } else {
        const d = radecDir(anchor.ra, anchor.dec), u = mlyToU(anchor.mly);
        pos = { x: d.x * u, y: d.y * u, z: d.z * u };
        pc = mlyToPc(anchor.mly);
      }
      // Sideways size, not distance: the distance curve is compressed, so a
      // radius has to be measured with the units-per-parsec scale out there.
      const rPc = mlyToPc(rMly);
      const R = rPc * lateralScale(Math.max(pc || rPc, rPc));
      this.regions.push({ id: `r:${name}`, name, kind, pos, R, pc, mly: rMly, bias, blurb });
    }
    this.counts.regions = this.regions.length;
  }

  // Seeded sights for a galaxy the player has actually come near: a core black
  // hole for anything big enough to have one, plus a few nebulae and clusters.
  proceduralSightsFor(g) {
    if (g.sighted || g === this.mw || this.procSights >= PROC_SIGHT_BUDGET) return;
    g.sighted = true;
    const r = rng(g.seed ^ 0x519f7);
    const push = (s) => { this.sights.push(s); this.procSights++; };
    const short = g.name.replace(/\s+(Galaxy|Dwarf.*)$/i, '');
    if (g.kind !== 'dwarf' && g.kind !== 'irregular') {
      push({ id: `s:${g.id}:bh`, name: `${short} Core`, kind: 'blackhole', note: 'a supermassive black hole, same as ours', pos: { ...g.pos }, R: 1.2e5, color: null, pc: g.pc || null, galaxy: g.name });
    }
    const n = clamp(Math.round(this.systemCountOf(g) / 900), 0, 5);
    const kinds = ['nebula', 'nebula', 'cluster', 'remnant', 'pulsar'];
    const word = { nebula: 'Nebula', cluster: 'Cluster', remnant: 'Remnant', pulsar: 'Pulsar' };
    for (let i = 0; i < n && this.procSights < PROC_SIGHT_BUDGET; i++) {
      const d = randUnit(r), k = g.R * 0.3;
      const kind = pick(r, kinds);
      push({
        id: `s:${g.id}:${i}`, name: `${short} ${word[kind]} ${i + 1}`, kind, note: 'uncatalogued, found by seed',
        pos: { x: g.pos.x + d.x * k, y: g.pos.y + d.y * k * 0.3, z: g.pos.z + d.z * k },
        R: { nebula: 3e6, remnant: 2.2e6, cluster: 1.6e6, pulsar: 4e4 }[kind], color: null, pc: g.pc || null, galaxy: g.name,
      });
    }
    this.counts.sights = this.sights.length;
  }

  // Every galaxy gets somewhere to dock, sized off how busy it is. Data only:
  // the meshes are built when the player is close, like the Bazaar's.
  buildGalaxyHub(g) {
    if (g.hub || g === this.mw) return;
    const r = rng(g.seed ^ 0x4b05);
    const n = clamp(Math.round(this.systemCountOf(g) / 700), 1, HUB_KINDS.length);
    const kinds = HUB_KINDS.slice(0, n);
    const short = g.name.replace(/\s+(Galaxy|Dwarf.*)$/i, '');
    const R = g.R * 0.06;
    const spread = R * 0.5;
    const off = randUnit(r);
    const center = { x: g.pos.x + off.x * g.R * 0.4, y: g.pos.y + off.y * g.R * 0.15, z: g.pos.z + off.z * g.R * 0.4 };
    g.hub = {
      id: `hub:${g.id}`, name: `${short} Depot`, pos: center, R, galaxy: g,
      modules: kinds.map((kind, i) => {
        const d = randUnit(r);
        // the same licensing rule every pump in the game follows: one, two or
        // all three nozzles, and never a promise that yours is among them
        const roll = r();
        const types = roll < 0.4 ? [pick(r, FUELS)] : roll < 0.75 ? FUELS.filter((f) => f !== pick(r, FUELS)) : [...FUELS];
        return {
          id: `hub:${g.id}:${i}`, kind, name: `${short} ${HUB_WORD[kind]}`,
          fuelTypes: kind === 'fuel' ? types : null,
          pos: { x: center.x + d.x * spread, y: center.y + d.y * spread * 0.3, z: center.z + d.z * spread }, obj: null,
        };
      }),
    };
    g.hubBuilt = false;
  }
  buildGalaxyHubMeshes(g) {
    g.hubGroup = new THREE.Group();
    this.root.add(g.hubGroup);
    for (const m of g.hub.modules) {
      const st = buildStation(m.kind, m.fuelTypes ? { fuelTypes: m.fuelTypes } : {});
      m.obj = st;
      m.radius = st.radius;
      g.hubGroup.add(st.group);
    }
    g.hubBuilt = true;
  }
  dropHub(g) {
    if (!g || !g.hubGroup) return;
    // the station groups are clones of shared templates: drop them, never dispose
    this.root.remove(g.hubGroup);
    g.hubGroup = null;
    g.hubBuilt = false;
    for (const m of g.hub.modules) { m.obj = null; }
  }

  buildSights(data) {
    for (const s of this.rowsOf(data)) {
      if (!s.name) continue;
      let pos = null;
      if (s.galaxy) {
        const g = this.findGalaxy(s.galaxy);
        if (g) {
          // several sights can share a host galaxy: black holes sit at the core,
          // the rest get their own seeded spot inside it
          pos = { ...g.pos };
          if (s.kind !== 'blackhole') {
            const d = randUnit(rng(hash('sight-spot', s.name))), k = g.R * 0.3;
            pos.x += d.x * k; pos.y += d.y * k * 0.3; pos.z += d.z * k;
          }
        }
      } else if (s.pc > 0 && s.ra != null && s.dec != null) {
        const d = radecDir(s.ra, s.dec), u = pcToU(s.pc);
        pos = { x: d.x * u, y: d.y * u, z: d.z * u };
      }
      if (!pos) continue;
      const kind = s.kind || 'star';
      const R = { nebula: 3e6, remnant: 2.2e6, cluster: 1.6e6, blackhole: 1.2e5, pulsar: 4e4, star: 6e4, system: 6e4 }[kind] ?? 6e4;
      const color = kind === 'star' ? (/betel|antares|arcturus|aldebaran|red/i.test(s.name + s.note) ? 0xff9a50 : /rigel|vega|sirius|spica|blue/i.test(s.name + s.note) ? 0xcfe0ff : 0xffe890) : null;
      this.sights.push({ id: 's:' + s.name, name: s.name, kind, note: s.note || '', pos, R, color, pc: s.pc || null, galaxy: s.galaxy || null });
    }
    this.counts.sights = this.sights.length;
  }

  buildBazaar() {
    const m31 = this.findGalaxy('M31') || this.findGalaxy('Andromeda Galaxy');
    const dir = m31 ? new THREE.Vector3(m31.pos.x, m31.pos.y, m31.pos.z).normalize() : new THREE.Vector3(-0.48, -0.37, -0.79).normalize();
    const side = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    const c = dir.clone().multiplyScalar(9e8).addScaledVector(side, 1.5e8);
    const pos = { x: c.x, y: c.y, z: c.z };
    const R = 4e7;
    const spread = 1.2e7;
    this.bazaar = {
      id: 'bazaar', name: 'The Bazaar', pos, R,
      modules: BAZAAR_MODULES.map(([kind, name, off, fuelTypes], i) => ({
        id: `bz:${i}`, kind, name, fuelTypes: fuelTypes || null,
        pos: { x: pos.x + off[0] * spread, y: pos.y + off[1] * spread, z: pos.z + off[2] * spread },
        obj: null,
      })),
    };
    this.bazaarGroup = new THREE.Group();
    this.root.add(this.bazaarGroup);
    this.bazaarBuilt = false;
    const r = rng(hash('bazaar-lights'));
    this.bazaarLights = new Swarm(1600, ID.GLOW);
    this.bazaarLights.local.set(shapePoints('nebula', R * 0.6, r, 1600));
    for (let i = 0; i < 1600; i++) { this.bazaarLights.colors[i] = col(pick(r, [0xffd84a, 0xf2a0b8, 0x5cc7c0, 0xff9a3c])); this.bazaarLights.base[i] = 1.5 + r() * 1.5; }
    this.renderer.track(this.bazaarLights.cloud.mat);
    this.root.add(this.bazaarLights.cloud.obj);
  }
  buildBazaarMeshes() {
    for (const m of this.bazaar.modules) {
      const st = buildStation(m.kind, m.fuelTypes ? { fuelTypes: m.fuelTypes } : {});
      m.obj = st;
      m.radius = st.radius;
      this.bazaarGroup.add(st.group);
    }
    this.bazaarBuilt = true;
  }

  buildClouds() {
    const cap = this.galaxies.length + 4000;
    this.farInk = new Cloud(cap, ID.INK);
    this.farGlow = new Cloud(cap, ID.GLOW);
    this.sightCloud = new Cloud(this.sights.length + 8 + PROC_SIGHT_BUDGET, ID.GLOW);
    for (const c of [this.farInk, this.farGlow, this.sightCloud]) { this.renderer.track(c.mat); this.root.add(c.obj); }
    this.galColor = { ink: col(0x1c2c9a), glow: col(0xffd070), pink: col(0xf2a0b8), sight: col(0xf2a0b8), bazaar: col(0xffd84a) };
  }

  findGalaxy(name) {
    const k = String(name).toLowerCase().trim();
    const direct = this.byId.get('g:' + k);
    if (direct) return direct;
    if (k === 'milky way') return this.mw;
    // "M87", "M 87", "M087" and "NGC4486" / "NGC 4486" all name the same thing
    const norm = (s) => String(s).toLowerCase().replace(/\s+/g, '').replace(/^(m|ngc|ic)0+(\d)/, '$1$2');
    const nk = norm(k);
    return this.galaxies.find((g) => norm(g.name) === nk || (g.alt && g.alt.split(/[,;/]\s*/).some((a) => norm(a) === nk))) || null;
  }

  systemsOf(g) {
    let list = this.systemCache.get(g.id);
    if (list) { this.touchCache(g.id); return list; }
    const r = rng(g.seed ^ 0xa11ce);
    const n = this.systemCountOf(g);
    const pts = shapePoints(g.kind, g.R, r, n);
    rotateAll(pts, g.rot);
    const short = g.name.replace(/\s+(Galaxy|Dwarf.*)$/i, '');
    list = [];
    for (let i = 0; i < n; i++) {
      list.push(this.makeSystem(g, {
        id: `${g.id}:${i}`, name: `${short}-${String(i + 1).padStart(2, '0')}`,
        pos: { x: g.pos.x + pts[i * 3], y: g.pos.y + pts[i * 3 + 1], z: g.pos.z + pts[i * 3 + 2] }, real: false, seed: hash(g.id, i),
      }));
    }
    this.systemCache.set(g.id, list);
    this.touchCache(g.id);
    return list;
  }

  // Galaxy detail cloud: decoration + one bright dot per star system.
  detailFor(g) {
    let d = this.details.get(g.id);
    if (d) return d;
    const r = rng(g.seed ^ 0xde7a);
    const systems = this.systemsOf(g);
    this.proceduralSightsFor(g);
    this.buildGalaxyHub(g);
    const nDecor = g === this.mw ? 3600 : g.kind === 'dwarf' ? 500 : 2200;
    const ink = new Swarm(nDecor, ID.INK);
    const pts = shapePoints(g.kind, g.R, r, nDecor);
    rotateAll(pts, g.rot);
    ink.local.set(pts);
    const cInk = col(0x1c2c9a), cDim = col(0x3848b8);
    for (let i = 0; i < nDecor; i++) { ink.colors[i] = i % 3 ? cInk : cDim; ink.base[i] = 1.4; }
    const nGlow = systems.length + 300;
    const gl = new Swarm(nGlow, ID.GLOW);
    for (let i = 0; i < systems.length; i++) {
      const s = systems[i];
      gl.local[i * 3] = s.pos.x - g.pos.x; gl.local[i * 3 + 1] = s.pos.y - g.pos.y; gl.local[i * 3 + 2] = s.pos.z - g.pos.z;
      gl.colors[i] = col(starColor(s.star.teff)); gl.base[i] = s.real ? 3.2 : 2.6;
    }
    const knots = shapePoints(g.kind, g.R * 0.9, r, 300);
    rotateAll(knots, g.rot);
    for (let i = 0; i < 300; i++) {
      const j = systems.length + i;
      gl.local[j * 3] = knots[i * 3]; gl.local[j * 3 + 1] = knots[i * 3 + 1]; gl.local[j * 3 + 2] = knots[i * 3 + 2];
      gl.colors[j] = col(pick(r, [0xf2a0b8, 0x5cc7c0, 0xffd84a])); gl.base[j] = 2.2;
    }
    for (const s of [ink, gl]) { this.renderer.track(s.cloud.mat); this.root.add(s.cloud.obj); }
    d = { g, ink, glow: gl, systems };
    this.details.set(g.id, d);
    return d;
  }
  dropDetail(id) {
    const d = this.details.get(id);
    if (!d) return;
    for (const s of [d.ink, d.glow]) { this.root.remove(s.cloud.obj); this.renderer.pointMats.delete(s.cloud.mat); s.dispose(); }
    this.dropHub(d.g);
    this.details.delete(id);
  }

  // The procedural field is capped: past the budget, the galaxy furthest behind
  // the ship makes room for the one in front of it. Its cell stays marked done,
  // so re-flying old space does not re-fill it.
  evictUncharted(ship) {
    let worst = -1, wd = -1;
    for (let j = 0; j < this.galaxies.length; j++) {
      const gg = this.galaxies[j];
      if (gg.group !== 'UNCHARTED') continue;
      const d = vdist(gg.pos, ship);
      if (d > wd) { wd = d; worst = j; }
    }
    if (worst < 0) return false;
    const gone = this.galaxies[worst];
    this.galaxies.splice(worst, 1);
    for (let j = worst; j < this.galaxies.length; j++) this.galaxies[j].index = j;
    this.byId.delete(gone.id);
    this.dropDetail(gone.id);
    this.systemCache.delete(gone.id);
    const k = this.cacheOrder.indexOf(gone.id);
    if (k >= 0) this.cacheOrder.splice(k, 1);
    if (gone.sighted) {
      // its seeded sights go with it, or they hang in empty space forever
      const before = this.sights.length;
      this.sights = this.sights.filter((s) => s.galaxy !== gone.name);
      this.procSights -= before - this.sights.length;
      this.counts.sights = this.sights.length;
      for (const s of [...this.sightViews.keys()]) if (!this.sights.some((x) => x.id === s)) { this.sightViews.get(s).dispose(); this.sightViews.delete(s); }
    }
    if (this.ctx.galaxy === gone) this.ctx.galaxy = null;
    if (this.nearG) this.nearG = this.nearG.filter((g) => g !== gone);
    return true;
  }

  // Seeded galaxies past the edge of the catalogues, generated a cell at a time.
  uncharted(ship) {
    const CELL = 3e9;
    const fromSun = Math.hypot(ship.x, ship.y, ship.z);
    if (fromSun < 9e9) return;
    const cx = Math.floor(ship.x / CELL), cy = Math.floor(ship.y / CELL), cz = Math.floor(ship.z / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const key = `${cx + dx},${cy + dy},${cz + dz}`;
      if (this.cellsDone.has(key)) continue;
      this.cellsDone.add(key);
      const r = rng(hash('cell', key));
      // Galaxies really do clump: a cell inside a named cluster or supercluster
      // rolls more of them than empty field does.
      const cc = { x: (cx + dx + 0.5) * CELL, y: (cy + dy + 0.5) * CELL, z: (cz + dz + 0.5) * CELL };
      let mult = 1;
      for (const reg of this.regions) {
        if (!reg.bias) continue;
        if (vdist(cc, reg.pos) < reg.R * 1.2) mult = Math.max(mult, reg.bias);
      }
      const n = Math.floor(r() * 3.2 * mult);
      for (let i = 0; i < n; i++) {
        const pos = { x: (cx + dx + r()) * CELL, y: (cy + dy + r()) * CELL, z: (cz + dz + r()) * CELL };
        if (Math.hypot(pos.x, pos.y, pos.z) < 9e9) continue;
        if (this.galaxies.length - this.catalogCount >= UNCHARTED_BUDGET && !this.evictUncharted(ship)) break;
        const kind = pick(r, ['spiral', 'spiral', 'barred', 'elliptical', 'irregular', 'lenticular', 'dwarf']);
        const id = `u:${key}:${i}`;
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...Object.values(randUnit(r))).normalize());
        this.addGalaxy({
          id, name: `Uncharted ${cx + dx}.${cy + dy}.${cz + dz}-${i + 1}`, alt: 'procedural, not a catalogued galaxy', type: kind, kind,
          group: 'UNCHARTED', real: false, pc: null, mly: null, dq: 'proc', con: '', pos, R: 5e7 + r() * 2.5e8,
          rkpc: DEFAULT_KPC[kind] * (0.6 + r() * 0.8), seed: hash(id), rot: q,
        });
      }
    }
  }

  rollZones(seed, liberated) {
    const r = rng(seed);
    const zones = [];
    const add = (sys, tier) => {
      const id = `${sys.galaxy.id}|${sys.id}`;
      // noZone: a system that must never be interdicted. Sol is one by name; the
      // SBG Annex depot the tutorial uses is one by flag, because a zone's
      // 2.5 Mu radius there would swallow Sol Pumps along with it.
      if (liberated.has(id) || sys === this.sol || sys.noZone || zones.some((z) => z.id === id)) return;
      zones.push({ id, name: `${sys.name} sector`, sys, galaxy: sys.galaxy, pos: { ...sys.pos }, radius: 2.5e6 + sys.star.r * 4, tier, state: 'hostile' });
    };
    const mwSys = this.systemsOf(this.mw).filter((s) => s !== this.sol).map((s) => ({ s, d: Math.hypot(s.pos.x, s.pos.y, s.pos.z) })).sort((a, b) => a.d - b.d);
    const near = mwSys.slice(0, 16), mid = mwSys.slice(16, 500), far = mwSys.slice(500);
    for (let i = 0; i < 2 && near.length; i++) add(pick(r, near).s, 1);
    for (let i = 0; i < 5 && mid.length; i++) add(pick(r, mid).s, 2);
    for (let i = 0; i < 3 && far.length; i++) add(pick(r, far).s, 3);
    // Outside the Milky Way, the Red Margin holds ground at the same rate it
    // does at home: ten zones per Milky Way's worth of systems, applied to each
    // galaxy's own count, so a big galaxy is proportionally more dangerous.
    const gals = this.galaxies.filter((g) => g !== this.mw && g.real).map((g) => ({ g, d: Math.hypot(g.pos.x, g.pos.y, g.pos.z) })).sort((a, b) => a.d - b.d).slice(0, 150);
    const rate = 10 / Math.max(this.baseN || 1, 1);
    const picked = new Set();
    let other = 0;
    for (let i = 0; i < gals.length * 2 && other < OTHER_ZONE_CAP && picked.size < ZONE_GALAXY_CAP && gals.length; i++) {
      const g = pick(r, gals).g;
      if (picked.has(g.id)) continue;
      picked.add(g.id);
      const want = clamp(Math.round(this.systemCountOf(g) * rate), 1, 6);
      const list = this.systemsOf(g);
      for (let k = 0; k < want && other < OTHER_ZONE_CAP; k++) { add(pick(r, list), g.pc < 2e6 ? 3 : g.pc < 1e7 ? 4 : 5); other++; }
    }
    this.zones = zones;
    return zones;
  }

  // Everything that can be flown to, as one shape the map and autopilot use.
  target(kind, ref) {
    const u = this;
    switch (kind) {
      case 'galaxy': return { kind, name: ref.name, ref, pos: () => ref.pos, arrive: ref.R * 0.35, real: ref.real ? ref.pc : null };
      case 'system': return { kind, name: ref.name, ref, pos: () => ref.pos, arrive: ref.star.r * 6 + 20000, real: ref.real ? ref.pc : null };
      case 'planet': {
        const sys = ref.sys;
        const p = ref.planet;
        const out = { x: 0, y: 0, z: 0 };
        return { kind, name: p.name, ref, pos: (t) => u.planetPos(sys, p, t, out), arrive: p.r * 3 + 3000, real: sys.real ? sys.pc : null };
      }
      case 'station': return { kind, name: ref.name, ref, pos: () => ref.pos, arrive: 700, real: null };
      case 'module': return { kind, name: ref.name, ref, pos: () => ref.pos, arrive: (ref.radius || 400) + 600, real: null };
      case 'sight': return { kind, name: ref.name, ref, pos: () => ref.pos, arrive: ref.R * 2.2 + 20000, real: ref.pc };
      case 'zone': return { kind, name: ref.name, ref, pos: () => ref.pos, arrive: ref.radius * 0.8, real: null };
      case 'bazaar': return { kind, name: 'The Bazaar', ref: this.bazaar, pos: () => this.bazaar.pos, arrive: 2e7, real: null };
      case 'region': return { kind, name: ref.name, ref, pos: () => ref.pos, arrive: ref.R * 0.9, real: ref.pc || null };
      default: return null;
    }
  }

  // A saved place back into a target (see Game.bookmarkKey).
  resolve(b) {
    const p = b.key.split('|');
    const kind = p[0];
    if (kind === 'galaxy') { const g = this.byId.get(p[1]); return g ? this.target('galaxy', g) : null; }
    if (kind === 'system' || kind === 'planet') {
      const g = this.byId.get(p[1]);
      const s = g && this.systemsOf(g).find((x) => x.id === p[2]);
      if (!s) return null;
      if (kind === 'system') return this.target('system', s);
      const pl = this.planetsOf(s).find((x) => x.name === p.slice(3).join('|'));
      return pl ? this.target('planet', { sys: s, planet: pl }) : null;
    }
    if (kind === 'sight') { const s = this.sights.find((x) => x.id === p.slice(1).join('|')); return s ? this.target('sight', s) : null; }
    if (kind === 'region') { const rg = this.regions.find((x) => x.id === p.slice(1).join('|')); return rg ? this.target('region', rg) : null; }
    if (kind === 'module') {
      // Bazaar shops, and a galaxy depot's shops: "hub:<galaxy id>:<n>"
      if (p[1].startsWith('hub:')) {
        const gid = p[1].slice(4, p[1].lastIndexOf(':'));
        const g = this.byId.get(gid);
        if (!g) return null;
        this.buildGalaxyHub(g);
        const m = g.hub && g.hub.modules.find((x) => x.id === p[1]);
        return m ? this.target('module', m) : null;
      }
      const m = this.bazaar.modules.find((x) => x.id === p[1]);
      return m ? this.target('module', m) : null;
    }
    if (kind === 'station' && b.pos) return this.target('station', { name: b.name, pos: b.pos, fuelTypes: b.fuelTypes || [] });
    return null;
  }

  // Fuel stations sorted by distance: the current galaxy, the MW near the
  // Sun, and the Bazaar. compatible marks the ones that sell this fuel.
  stationsNear(pos, fuel, n = 12) {
    const out = [];
    const push = (st, where) => {
      if (!st) return;
      out.push({ st, where, d: vdist(pos, st.pos), ok: !fuel || st.fuelTypes.includes(fuel) });
    };
    const g = this.ctx.galaxy || this.mw;
    for (const s of this.systemsOf(g)) push(s.station, s);
    if (g !== this.mw) for (const s of this.systemsOf(this.mw).slice(0, 400)) push(s.station, s);
    if (g.hub) for (const m of g.hub.modules) if (m.kind === 'fuel') push({ name: m.name, fuelTypes: m.fuelTypes, pos: m.pos, module: m }, g.hub);
    for (const m of this.bazaar.modules) if (m.kind === 'fuel') push({ name: m.name, fuelTypes: m.fuelTypes, pos: m.pos, module: m }, this.bazaar);
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, n);
  }

  // Called every frame.
  update(ship, t, dt) {
    this.tick++;
    const cam = this.renderer.camera;
    const focal = innerHeight / 2 / Math.tan((cam.fov * Math.PI) / 360);
    if (this.tick % 30 === 1) this.uncharted(ship);

    // Current galaxy: the smallest one we are inside.
    if (this.tick % 6 === 1 || !this.ctx.galaxy) {
      let best = null;
      for (const g of this.galaxies) {
        const dx = g.pos.x - ship.x, dy = g.pos.y - ship.y, dz = g.pos.z - ship.z;
        if (Math.abs(dx) > g.R || Math.abs(dy) > g.R || Math.abs(dz) > g.R) continue;
        if (dx * dx + dy * dy + dz * dz < g.R * g.R && (!best || g.R < best.R)) best = g;
      }
      this.ctx.galaxy = best;
    }
    const cur = this.ctx.galaxy;

    // Which galaxies get a detail cloud.
    const wantDetail = new Set();
    if (cur) wantDetail.add(cur.id);
    let nearG = [];
    if (this.tick % 10 === 1 || !this.nearG) {
      for (const g of this.galaxies) {
        const d = vdist(g.pos, ship);
        if (d < g.R * 8) nearG.push({ g, d });
      }
      nearG.sort((a, b) => a.d / a.g.R - b.d / b.g.R);
      this.nearG = nearG.slice(0, 5).map((x) => x.g);
    }
    for (const g of this.nearG) wantDetail.add(g.id);
    for (const id of [...this.details.keys()]) if (!wantDetail.has(id)) this.dropDetail(id);
    for (const id of wantDetail) this.detailFor(this.byId.get(id));

    // Far galaxies as dots.
    let ni = 0, ng = 0;
    const cI = this.galColor.ink, cG = this.galColor.glow;
    for (const g of this.galaxies) {
      if (this.details.has(g.id)) continue;
      const x = g.pos.x - ship.x, y = g.pos.y - ship.y, z = g.pos.z - ship.z;
      const d = Math.sqrt(x * x + y * y + z * z);
      const size = clamp((g.R / d) * focal * 0.8, 1.3, 46);
      squash(x, y, z, V);
      if (g.kind === 'elliptical' || g.kind === 'lenticular') this.farGlow.set(ng++, V.x, V.y, V.z, cG, size);
      else this.farInk.set(ni++, V.x, V.y, V.z, cI, size);
    }
    this.farInk.commit(ni);
    this.farGlow.commit(ng);

    for (const d of this.details.values()) {
      const dist = Math.max(vdist(d.g.pos, ship), 1);
      const mul = d.g === cur ? 1 : clamp((d.g.R / dist) * 3, 0.6, 1.2);
      d.ink.update(d.g.pos, ship, mul);
      d.glow.update(d.g.pos, ship, mul);
    }

    // Nearest systems in the current galaxy get full views.
    if (this.tick % 8 === 1 || !this.nearSys) {
      const list = cur ? this.systemsOf(cur) : [];
      const scored = [];
      for (const s of list) {
        const d = vdist(s.pos, ship);
        if (d < 6e7) scored.push({ s, d });
      }
      scored.sort((a, b) => a.d - b.d);
      this.nearSys = scored.slice(0, 4);
      this.ctx.system = scored.length && scored[0].d < 3e7 ? scored[0].s : null;
      this.ctx.systemDist = scored.length ? scored[0].d : Infinity;
      const want = new Set(this.nearSys.map((x) => x.s.id));
      for (const [id, v] of this.views) if (!want.has(id)) { v.dispose(); this.views.delete(id); }
      for (const { s } of this.nearSys) if (!this.views.has(s.id)) this.views.set(s.id, new SystemView(this, s));
    }
    const bodies = [];
    for (const v of this.views.values()) { v.update(ship, t); bodies.push(...v.bodies); }

    // Sights
    let si = 0;
    const cS = this.galColor.sight;
    for (const s of this.sights) {
      const x = s.pos.x - ship.x, y = s.pos.y - ship.y, z = s.pos.z - ship.z;
      const d = Math.sqrt(x * x + y * y + z * z);
      if (d < 2.5e8) {
        if (!this.sightViews.has(s.id)) this.sightViews.set(s.id, new SightView(this, s));
        continue;
      }
      if (this.sightViews.has(s.id)) { this.sightViews.get(s.id).dispose(); this.sightViews.delete(s.id); }
      squash(x, y, z, V);
      this.sightCloud.set(si++, V.x, V.y, V.z, cS, clamp((s.R / d) * focal, 2.4, 8));
    }
    for (const [id, v] of this.sightViews) {
      v.update(ship, t);
      bodies.push({ kind: 'sight', name: v.s.name, r: v.s.R * (v.s.kind === 'nebula' || v.s.kind === 'cluster' || v.s.kind === 'remnant' ? 0 : 0.35), pos: v.s.pos, sight: v.s });
      if (vdist(v.s.pos, ship) > 3e8) { v.dispose(); this.sightViews.delete(id); }
    }
    // The Bazaar
    const bz = this.bazaar;
    const bx = bz.pos.x - ship.x, by = bz.pos.y - ship.y, bzz = bz.pos.z - ship.z;
    const bd = Math.sqrt(bx * bx + by * by + bzz * bzz);
    if (bd > 4e8) { squash(bx, by, bzz, V); this.sightCloud.set(si++, V.x, V.y, V.z, this.galColor.bazaar, clamp((bz.R / bd) * focal, 3, 12)); }
    this.sightCloud.commit(si);
    this.bazaarLights.update(bz.pos, ship, 1);
    if (bd < 4e8) {
      if (!this.bazaarBuilt) this.buildBazaarMeshes();
      this.bazaarGroup.visible = true;
      for (const m of bz.modules) {
        const s = squash(m.pos.x - ship.x, m.pos.y - ship.y, m.pos.z - ship.z, m.obj.group.position);
        m.obj.group.scale.setScalar(s);
        bodies.push({ kind: 'module', name: m.name, r: m.radius, pos: m.pos, module: m });
      }
    } else this.bazaarGroup.visible = false;

    // The current galaxy's own depot, built the same two-stage way the Bazaar is.
    for (const gid of this.details.keys()) {
      const gx = this.byId.get(gid);
      if (!gx || !gx.hub) continue;
      const hd = vdist(gx.hub.pos, ship);
      if (hd < gx.hub.R * 12) {
        if (!gx.hubBuilt) this.buildGalaxyHubMeshes(gx);
        gx.hubGroup.visible = true;
        for (const m of gx.hub.modules) {
          const s = squash(m.pos.x - ship.x, m.pos.y - ship.y, m.pos.z - ship.z, m.obj.group.position);
          m.obj.group.scale.setScalar(s);
          bodies.push({ kind: 'module', name: m.name, r: m.radius, pos: m.pos, module: m });
        }
      } else if (gx.hubGroup) gx.hubGroup.visible = false;
    }

    // Nearest surface, for cruise speed, collisions and the HUD.
    let dnear = Infinity, nearest = null;
    for (const b of bodies) {
      const d = vdist(b.pos, ship) - b.r;
      if (d < dnear) { dnear = d; nearest = b; }
    }
    if (this.nearSys) for (const { s, d } of this.nearSys) { const dd = d - s.star.r; if (dd < dnear) { dnear = dd; nearest = { kind: 'star', name: s.name, r: s.star.r, pos: s.pos, sys: s }; } }
    for (const g of this.nearG || []) {
      if (g === cur) continue;
      const dd = vdist(g.pos, ship) - g.R;
      if (dd < dnear) { dnear = Math.max(dd, 0); nearest = { kind: 'galaxy', name: g.name, r: g.R, pos: g.pos, galaxy: g }; }
    }
    if (!nearest) {
      // Deep space: measure to the closest galaxy edge anywhere.
      if (this.tick % 20 === 1 || !this.deepNear) {
        let best = null, bd2 = Infinity;
        for (const g of this.galaxies) { const dd = vdist(g.pos, ship) - g.R; if (dd < bd2) { bd2 = dd; best = g; } }
        this.deepNear = best;
      }
      const g = this.deepNear;
      if (g) { dnear = Math.max(vdist(g.pos, ship) - g.R, 0); nearest = { kind: 'galaxy', name: g.name, r: g.R, pos: g.pos, galaxy: g }; }
    }
    if (bd - bz.R * 0.5 < dnear) { dnear = Math.max(bd - bz.R * 0.5, 0); nearest = nearest && nearest.kind === 'module' ? nearest : { kind: 'bazaar', name: 'The Bazaar', r: bz.R * 0.5, pos: bz.pos }; }
    this.ctx.dnear = Math.max(dnear, 50);
    this.ctx.nearest = nearest;
    this.ctx.bodies = bodies;
    return this.ctx;
  }

  // Name search across everything charted.
  search(text, limit = 60, from = { x: 0, y: 0, z: 0 }) {
    const q = String(text || '').trim().toLowerCase();
    const out = [];
    const hit = (s) => !q || s.toLowerCase().includes(q);
    for (const g of this.galaxies) if (hit(g.name) || (g.alt && hit(g.alt))) out.push({ kind: 'galaxy', ref: g, name: g.name, sub: [g.alt, g.type, g.con].filter(Boolean).join(' / '), d: vdist(g.pos, from) });
    for (const s of this.sights) if (hit(s.name)) out.push({ kind: 'sight', ref: s, name: s.name, sub: s.kind, d: vdist(s.pos, from) });
    for (const rg of this.regions) if (hit(rg.name)) out.push({ kind: 'region', ref: rg, name: rg.name, sub: rg.kind, d: vdist(rg.pos, from) });
    const g = this.ctx.galaxy || this.mw;
    for (const s of this.systemsOf(g)) if (hit(s.name)) out.push({ kind: 'system', ref: s, name: s.name, sub: s.real ? 'charted star' : 'uncharted star', d: vdist(s.pos, from) });
    if (g !== this.mw && q) for (const s of this.systemsOf(this.mw)) if (s.real && hit(s.name)) out.push({ kind: 'system', ref: s, name: s.name, sub: 'charted star', d: vdist(s.pos, from) });
    for (const m of this.bazaar.modules) if (hit(m.name) || hit('bazaar')) out.push({ kind: 'module', ref: m, name: m.name, sub: `Bazaar ${m.kind}`, d: vdist(m.pos, from) });
    if (g.hub) for (const m of g.hub.modules) if (hit(m.name) || hit('depot')) out.push({ kind: 'module', ref: m, name: m.name, sub: `${g.hub.name} ${m.kind}`, d: vdist(m.pos, from) });
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, limit);
  }
}
