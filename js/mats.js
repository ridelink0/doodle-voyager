// Shared materials. Every surface in the game goes through here so the post
// pass can tell what it is looking at: the fragment alpha is a material ID
// (blending is NoBlending, so opacity is written straight into the target).
//
// Lit surfaces (ink, red, paint) are neon-ink materials: three.js's own
// Lambert lighting (the star, the hemisphere fill and the cabin lamps all keep
// working), plus pen hatching drawn in the object's own space where the light
// is low, plus a fresnel rim in a neon colour. The post pass only adds edges,
// dark space and bloom (render.js).
import * as THREE from 'three';

export const ID = { INK: 1.0, ENEMY: 0.8, GLOW: 0.6, SCREEN: 0.4 };

export const PAL = {
  // hull and interior neutrals: dark on purpose, the rim light carries the read
  charcoal: 0x23262e, indigo: 0x232a45, slate: 0x2a3040, black: 0x14151c,
  white: 0xc7cede, grey: 0x555b66, dark: 0x14151c, steel: 0x5b6577, cream: 0x8a8368, wood: 0x6a4a30,
  // neon, friendly
  cyan: 0x4deeff, blue: 0x4d7cff, amber: 0xffc23c, green: 0x36a06a, teal: 0x2fb6c9,
  // neon, hostile and alert
  red: 0xff3b5c, redDark: 0x2a0912, redPale: 0xff8fa0, magenta: 0xff4de1,
  orange: 0xff8a3c, pink: 0xff7fb0, yellow: 0xffc23c,
  // the old paper/ink names, kept for callers: paper is now the dark panel, ink the neon line
  paper: 0x0b0f18, ink: 0x4deeff,
};
export const SPACE_BG = 0x05070c, SPACE_HAZE = 0x0e1420;

// Quality knobs every neon-ink material reads. They are the same uniform
// objects in every material, so a preset change is a number change and never
// a shader recompile.
const SHARED = {
  uHatchDirs: { value: 3 },      // 0 none, 1-3 stripe directions
  uHatchK: { value: 0.016 },     // stripe spacing per unit of distance (screen density)
  uLitRef: { value: 0.8 },       // irradiance that counts as fully lit
};
export function setHatchDirs(n) { SHARED.uHatchDirs.value = n; }
export function hatchDirs() { return SHARED.uHatchDirs.value; }

const VERT_PARS = /* glsl */ `
varying vec3 vDvLocal;
varying vec3 vDvLocalN;
varying float vDvScale;`;
// After begin_vertex: object-space position and normal, and the object's scale,
// so the hatching is fixed to the surface (the game draws everything relative
// to the moving ship, so world space would make the stripes swim).
const VERT_MAIN = /* glsl */ `
vDvLocal = transformed;
vDvLocalN = objectNormal;
vDvScale = length(modelMatrix[0].xyz);
#ifdef USE_INSTANCING
  vDvScale *= length(instanceMatrix[0].xyz);
#endif`;

const FRAG_PARS = /* glsl */ `
varying vec3 vDvLocal;
varying vec3 vDvLocalN;
varying float vDvScale;
uniform vec3 uRimColor;
uniform vec3 uHatchInk;
uniform float uRimStrength;
uniform float uHatchDirs;
uniform float uHatchK;
uniform float uLitRef;
float dvHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float dvNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = dvHash(i), b = dvHash(i + vec2(1.0, 0.0)), c = dvHash(i + vec2(0.0, 1.0)), d = dvHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// One family of parallel pen strokes, antialiased from the pixel footprint:
// at least about a pixel wide, faded out where the strokes would crowd into moire.
float dvLine(vec2 p, vec2 dx, vec2 dy, vec2 dir, float period) {
  vec2 n = vec2(-dir.y, dir.x);
  float t = dot(p, n) / period;
  float fw = max((abs(dot(dx, n)) + abs(dot(dy, n))) / period, 1e-4);
  float d = abs(fract(t + 0.5) - 0.5);
  float hw = max(0.09, fw * 0.6);
  return (1.0 - smoothstep(hw - fw * 0.5, hw + fw * 0.5, d)) * (1.0 - smoothstep(0.3, 0.6, fw));
}
// Doodle Shooter's trick: three stroke directions switched on at three shade
// levels, so darker reads as denser crosshatch.
float dvHatch(vec2 hp, vec2 dx, vec2 dy, float sp, float shade) {
  vec2 p = hp + (dvNoise(hp * (1.3 / sp)) - 0.5) * sp * 0.5;
  float h = dvLine(p, dx, dy, vec2(0.7071, 0.7071), sp) * smoothstep(0.30, 0.45, shade);
  if (uHatchDirs > 1.5) h = max(h, dvLine(p, dx, dy, vec2(-0.7071, 0.7071), sp * 1.15) * smoothstep(0.52, 0.68, shade));
  if (uHatchDirs > 2.5) h = max(h, dvLine(p, dx, dy, vec2(0.2588, 0.9659), sp * 0.7) * smoothstep(0.74, 0.88, shade));
  return h;
}`;

// Replaces opaque_fragment (three r154+; the old name output_fragment is gone).
// outgoingLight is already declared by the Lambert shader at this point.
const FRAG_MAIN = /* glsl */ `
{
  // shade from the light that arrived, divided by the albedo, so a dark hull
  // and a pale one hatch at the same light level
  vec3 dvIrr = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  float dvAlb = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 0.001) * RECIPROCAL_PI;
  float dvLit = dot(dvIrr, vec3(0.299, 0.587, 0.114)) / dvAlb;
  float dvShade = 1.0 - clamp(dvLit / uLitRef, 0.0, 1.0);
  float dvH = 0.0;
  if (uHatchDirs > 0.5) {
    vec3 dvAn = abs(vDvLocalN);
    vec2 hp = dvAn.y > max(dvAn.x, dvAn.z) ? vDvLocal.xz : (dvAn.x > dvAn.z ? vDvLocal.zy : vDvLocal.xy);
    hp *= vDvScale;
    // spacing steps in powers of two with distance, blended, so the on-screen
    // density stays put without popping
    float lg = log2(max(length(vViewPosition) * uHatchK, 1e-6));
    float lf = floor(lg);
    float sp = exp2(lf);
    vec2 dx = dFdx(hp), dy = dFdy(hp);
    dvH = mix(dvHatch(hp, dx, dy, sp, dvShade), dvHatch(hp, dx, dy, sp * 2.0, dvShade), lg - lf);
  }
  // Hatching lives in the mid-tones: deep shadow stays solid dark (a neon
  // city is black between its lights, not a mesh of pen strokes).
  outgoingLight = mix(outgoingLight, uHatchInk, dvH * 0.7 * (1.0 - smoothstep(0.82, 0.97, dvShade)));
  float dvFres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 4.0);
  outgoingLight += uRimColor * dvFres * uRimStrength;
}
#include <opaque_fragment>`;

const PROGRAM_KEY = 'dv-neon-ink-1';

// Turns a MeshLambertMaterial into a neon-ink one. The shader text is the same
// for every material (colours are uniforms), so they share compiled programs.
export function neonize(m, { rim = PAL.cyan, rimStrength = 0.55, hatch = null } = {}) {
  const rimColor = new THREE.Color(rim);
  const hatchInk = hatch == null ? rimColor.clone().multiplyScalar(0.12) : new THREE.Color(hatch);
  m.userData.neon = { rimColor, hatchInk, rimStrength };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: rimColor };
    shader.uniforms.uHatchInk = { value: hatchInk };
    shader.uniforms.uRimStrength = { value: rimStrength };
    shader.uniforms.uHatchDirs = SHARED.uHatchDirs;
    shader.uniforms.uHatchK = SHARED.uHatchK;
    shader.uniforms.uLitRef = SHARED.uLitRef;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_MAIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <opaque_fragment>', FRAG_MAIN);
  };
  m.customProgramCacheKey = () => PROGRAM_KEY;
  return m;
}

const cache = new Map();
function cached(key, make) {
  let m = cache.get(key);
  if (!m) { m = make(); cache.set(key, m); }
  return m;
}
function makeInk(color, id, opts) {
  const key = `${id}|${color}|${opts.rim}|${opts.rimStrength}|${opts.hatch}`;
  return cached(key, () => neonize(new THREE.MeshLambertMaterial({
    color, flatShading: true, blending: THREE.NoBlending, opacity: id,
  }), opts));
}

// Lit, flat shaded, hatched in the shadows, cyan rim; the post pass outlines it in cyan.
export function ink(color = PAL.charcoal, { rim = 0x3a4cff, rimStrength = 0.25, hatch = null } = {}) {
  return makeInk(color, ID.INK, { rim, rimStrength, hatch });
}
// The same in red: enemies and their ships.
export function red(color = PAL.red, { rim = PAL.red, rimStrength = 1.3, hatch = null } = {}) {
  return makeInk(color, ID.ENEMY, { rim, rimStrength, hatch });
}
// Unlit neon: lasers, engines, stars, lamps. Never outlined or hatched; the
// post pass pushes it over the bloom threshold.
export function glow(color = PAL.amber) {
  return cached('glow' + color, () => new THREE.MeshBasicMaterial({
    color, blending: THREE.NoBlending, opacity: ID.GLOW,
  }));
}
// Unlit picture (video, nav display, signs). No ink drawn inside it.
export function screen(map) {
  return new THREE.MeshBasicMaterial({ map, blending: THREE.NoBlending, opacity: ID.SCREEN });
}
// Ship paint jobs: a dark hull with a neon trim colour.
export const PAINTS = {
  cyan: { hull: PAL.charcoal, rim: PAL.cyan },
  blue: { hull: PAL.indigo, rim: PAL.blue },
  outline: { hull: 0x0a0b10, rim: PAL.cyan, rimStrength: 1.4 },
};
export function paint(p) {
  const c = PAINTS[p] ?? PAINTS.cyan;
  return ink(c.hull, { rim: c.rim, rimStrength: c.rimStrength ?? 0.9 });
}

export function lineMat(color = PAL.cyan) {
  return cached('line' + color, () => new THREE.LineBasicMaterial({
    color, blending: THREE.NoBlending, opacity: ID.INK,
  }));
}
export function pointsMat(color = PAL.cyan, size = 2) {
  return new THREE.PointsMaterial({
    color, size, sizeAttenuation: false, blending: THREE.NoBlending, opacity: ID.INK,
  });
}

// Handwritten label on a canvas, for signs, buttons and screens: neon on a dark panel.
export function labelTexture(text, { w = 256, h = 64, fg = '#4deeff', bg = '#0b0f18', font = 'Patrick Hand', size = 40 } = {}) {
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
