// Shared materials. Every surface in the game goes through here so the doodle
// post pass can tell what it is looking at: the fragment alpha is a material ID
// (blending is NoBlending, so opacity is written straight into the target).
import * as THREE from 'three';

export const ID = { INK: 1.0, ENEMY: 0.8, GLOW: 0.6, SCREEN: 0.4 };

export const PAL = {
  paper: 0xf6f3e6, ink: 0x1a30c0, red: 0xd02030, yellow: 0xffd84a, blue: 0x6f95ff,
  white: 0xf2efe4, grey: 0xb9b6ad, dark: 0x3a3a48, wood: 0xc79a62, green: 0x7fbf6a,
  orange: 0xff9a3c, pink: 0xf2a0b8, teal: 0x5cc7c0, cream: 0xefe3c2, steel: 0x9aa3b5,
};

const cache = new Map();
function cached(key, make) {
  let m = cache.get(key);
  if (!m) { m = make(); cache.set(key, m); }
  return m;
}

// Lit, flat-shaded, blue-ink outlines and hatching in the post pass.
export function ink(color = PAL.white) {
  return cached('ink' + color, () => new THREE.MeshLambertMaterial({
    color, flatShading: true, blending: THREE.NoBlending, opacity: ID.INK,
  }));
}
// Same, but the post pass draws it in red ink: enemies and their ships.
export function red(color = PAL.red) {
  return cached('red' + color, () => new THREE.MeshLambertMaterial({
    color, flatShading: true, blending: THREE.NoBlending, opacity: ID.ENEMY,
  }));
}
// Unlit highlighter: lasers, engines, stars, lamps. Outlined, never hatched.
export function glow(color = PAL.yellow) {
  return cached('glow' + color, () => new THREE.MeshBasicMaterial({
    color, blending: THREE.NoBlending, opacity: ID.GLOW,
  }));
}
// Unlit picture (video, nav display). No ink drawn inside it.
export function screen(map) {
  return new THREE.MeshBasicMaterial({ map, blending: THREE.NoBlending, opacity: ID.SCREEN });
}
// Ship paint jobs: yellow highlighter, blue highlighter, or bare paper so only
// the blue outline shows.
export const PAINTS = { yellow: PAL.yellow, blue: PAL.blue, outline: PAL.white };
export function paint(p) { return ink(PAINTS[p] ?? PAL.yellow); }

export function lineMat(color = PAL.ink) {
  return cached('line' + color, () => new THREE.LineBasicMaterial({
    color, blending: THREE.NoBlending, opacity: ID.INK,
  }));
}
export function pointsMat(color = PAL.ink, size = 2) {
  return new THREE.PointsMaterial({
    color, size, sizeAttenuation: false, blending: THREE.NoBlending, opacity: ID.INK,
  });
}

// Handwritten label on a canvas, for signs, buttons and screens.
export function labelTexture(text, { w = 256, h = 64, fg = '#1a30c0', bg = '#f6f3e6', font = 'Patrick Hand', size = 40 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${size}px "${font}", "Segoe Print", cursive`;
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function label(text, width = 1, opts = {}) {
  const t = labelTexture(text, opts);
  const aspect = (opts.w ?? 256) / (opts.h ?? 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width / aspect), screen(t));
  m.userData.label = text;
  return m;
}
