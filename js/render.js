// The renderer: the world and the ship interior are drawn into one target
// (colour + depth). The surfaces arrive already lit, hatched and rim-lit by the
// neon-ink materials (mats.js); one post pass adds the pen edges (from depth,
// colour and the material ID in the alpha channel), puts dark space behind
// everything and runs the screen effects, and a bloom pass makes the neon glow.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ID, setHatchDirs } from './mats.js';

// Scaled space: anything beyond S0 is pulled in on a log curve and shrunk by
// the same factor, so it keeps its angular size and stays inside the far plane.
export const S0 = 8000;
export const K = 3200;
export const FAR = 60000;
export function squash(x, y, z, out) {
  const d = Math.sqrt(x * x + y * y + z * z);
  if (d <= S0) { out.set(x, y, z); return 1; }
  const s = (S0 + K * Math.log(1 + (d - S0) / S0)) / d;
  out.set(x * s, y * s, z * s);
  return s;
}

const POST_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const POST_FS = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 res;
uniform float time, cnear, cfar, boil, lw, scale;
uniform float flash, damage, warp, blackout, glowBoost;
uniform vec3 inkCyan, inkRed, spaceBg, spaceHaze, edgeDim;
varying vec2 vUv;

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash12(i), b = hash12(i + vec2(1., 0.)), c = hash12(i + vec2(0., 1.)), d = hash12(i + vec2(1., 1.));
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float lin(float d) { return cnear * cfar / (cfar - d * (cfar - cnear)); }
vec3 toS(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
float isBg(float d) { return step(0.999999, d); }
bool isId(float a, float b) { return abs(a - b) < 0.05; }
// Screen-space scribble for the damage vignette only: screen effects belong to
// the screen, surface hatching lives in the materials.
float scribble(vec2 p, float spacing) {
  float v = dot(p, vec2(0.7071, 0.7071)) + (noise(p * 0.035) - 0.5) * 3.0;
  float f = abs(fract(v / spacing) - 0.5) * spacing;
  return 1.0 - smoothstep(0.7, 1.6, f);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  float frame = floor(time * 7.0) * boil;
  vec2 wob = vec2(noise(fc * 0.02 + frame * 1.7), noise(fc * 0.02 + 31.0 + frame * 1.3)) - 0.5;
  vec2 px = 1.0 / res;
  vec2 uv = vUv + wob * px * 2.2 * (0.35 + boil * 0.65);
  vec2 ox = vec2(px.x * lw, 0.0), oy = vec2(0.0, px.y * lw);

  vec4 c0 = texture2D(tColor, uv);
  vec4 cL = texture2D(tColor, uv - ox), cR = texture2D(tColor, uv + ox);
  vec4 cD = texture2D(tColor, uv - oy), cU = texture2D(tColor, uv + oy);
  float d0 = texture2D(tDepth, uv).x;
  float dL = texture2D(tDepth, uv - ox).x, dR = texture2D(tDepth, uv + ox).x;
  float dD = texture2D(tDepth, uv - oy).x, dU = texture2D(tDepth, uv + oy).x;

  float b0 = isBg(d0);
  float bn = isBg(dL) + isBg(dR) + isBg(dD) + isBg(dU);
  float eBg = (b0 > 0.5) ? step(0.5, 4.0 - bn) : step(0.5, bn);

  float eDepth = 0.0;
  if (b0 < 0.5 && bn < 0.5) {
    float z0 = lin(d0);
    float lap = abs(lin(dL) + lin(dR) + lin(dD) + lin(dU) - 4.0 * z0) / z0;
    eDepth = smoothstep(0.02, 0.07, lap);
  }
  float id0 = c0.a;
  float eId = step(0.08, max(max(abs(cL.a - id0), abs(cR.a - id0)), max(abs(cU.a - id0), abs(cD.a - id0))));
  if (b0 > 0.5) eId = 0.0;
  float inkish = step(0.7, id0) * (1.0 - b0);
  float dc = length(toS(cL.rgb) - toS(cR.rgb)) + length(toS(cU.rgb) - toS(cD.rgb));
  float eCol = smoothstep(0.12, 0.26, dc) * inkish;
  // Colour edges only count where the material has no hatching of its own
  // (IDs below INK); on hatched surfaces they would outline every pen stroke.
  float edge = max(max(eDepth, eBg), max(eId, eCol * (1.0 - inkish)));
  edge *= 0.72 + 0.28 * noise(fc * 0.35 + frame);

  bool enemyEdge = isId(id0, 0.8) || isId(cL.a, 0.8) || isId(cR.a, 0.8) || isId(cU.a, 0.8) || isId(cD.a, 0.8);
  // Neon city, not neon everything: ordinary silhouettes are dim violet-steel
  // lines, and only enemies keep a hot outline. Light comes from the signs.
  vec3 edgeInk = enemyEdge ? inkRed : edgeDim;
  float edgeK = enemyEdge ? 1.0 : 0.55;

  vec3 col;
  if (b0 > 0.5 && id0 < 0.05) {
    // dark space instead of paper
    col = mix(spaceBg, spaceHaze, smoothstep(0.0, 1.0, vUv.y));
    // warp: every star and galaxy dot is dragged out into a line from the centre
    if (warp > 0.001) {
      vec2 toC = vec2(0.5) - vUv;
      float s = 0.0;
      for (int i = 1; i <= 16; i++) {
        float f = float(i) / 16.0;
        float hit = 1.0 - isBg(texture2D(tDepth, uv + toC * f * 0.35 * warp).x);
        s = max(s, hit * (1.0 - f * 0.85));
      }
      col = mix(col, inkCyan, clamp(s * 1.2, 0.0, 1.0));
    }
  } else {
    // already lit, hatched and rim-lit by the neon-ink materials
    col = toS(c0.rgb);
    // glowing surfaces are pushed past the bloom threshold
    if (isId(id0, 0.6)) col *= glowBoost;
  }
  col = mix(col, edgeInk, clamp(edge, 0.0, 1.0) * edgeK);

  vec2 q = vUv - 0.5;
  q.x *= res.x / res.y;
  float r = length(q);
  if (warp > 0.001) {
    float a = atan(q.y, q.x);
    float s = noise(vec2(a * 55.0, r * 3.0 - time * 26.0));
    col = mix(col, inkCyan, warp * smoothstep(0.70, 0.9, s) * smoothstep(0.06, 0.45, r));
    col = mix(col, spaceBg, warp * 0.25 * (1.0 - smoothstep(0.0, 0.25, r)));
  }
  if (damage > 0.001) {
    float vig = smoothstep(0.35, 0.9, r);
    col = mix(col, inkRed, damage * vig * max(scribble(fc / scale, 6.0), 0.35));
  }
  if (flash > 0.001) col = mix(col, vec3(1.0, 0.93, 0.55), flash * 0.6);
  if (blackout > 0.001) col = mix(col, inkCyan * 0.35, blackout);
  gl_FragColor = vec4(col, 1.0);
}`;


// Camera motion blur. Every pixel's depth is unprojected to a world point and
// projected again through the previous frame's camera, which gives the exact
// distance that point travelled on screen; the colour is then smeared along
// that line. Turning, looking and the seat swinging with the hull all blur,
// and a still camera blurs nothing at all.
const MOTION_FS = /* glsl */ `
precision highp float;
#define TAPS 9
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform mat4 invVP;
uniform mat4 prevVP;
uniform float strength;
uniform float maxVel;
varying vec2 vUv;
float dither(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float d = min(texture2D(tDepth, vUv).x, 0.9999);
  vec4 w = invVP * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  w /= w.w;
  vec4 p = prevVP * w;
  vec2 vel = (vUv - (p.xy / p.w * 0.5 + 0.5)) * strength;
  float len = length(vel);
  if (len < 0.0004) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
  if (len > maxVel) vel *= maxVel / len;
  // A half-pixel dither breaks the banding a fixed tap spacing would leave.
  float j = dither(gl_FragCoord.xy) - 0.5;
  vec4 sum = vec4(0.0);
  for (int i = 0; i < TAPS; i++) {
    float f = (float(i) + j) / float(TAPS - 1) - 0.5;
    sum += texture2D(tDiffuse, clamp(vUv - vel * f, 0.0, 1.0));
  }
  gl_FragColor = sum / float(TAPS);
}`;

// Point sprites with per-vertex size and colour; alpha carries the ID.
export function pointsMaterial(id = ID.INK) {
  return new THREE.ShaderMaterial({
    uniforms: { pr: { value: 1 }, id: { value: id } },
    vertexShader: /* glsl */ `
      attribute float size; attribute vec3 acol; varying vec3 vC; uniform float pr;
      void main() {
        vC = acol;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = size * pr;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vC; uniform float id;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        if (dot(d, d) > 0.25) discard;
        gl_FragColor = vec4(vC, id);
      }`,
    blending: THREE.NoBlending,
  });
}

// A growable Points cloud whose positions the caller rewrites every frame.
export class Cloud {
  constructor(capacity, id = ID.INK) {
    this.cap = capacity;
    this.n = 0;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('acol', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = pointsMaterial(id);
    this.obj = new THREE.Points(this.geo, this.mat);
    this.obj.frustumCulled = false;
  }
  set(i, x, y, z, color, size) {
    const j = i * 3;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
    if (color) { this.col[j] = color.r; this.col[j + 1] = color.g; this.col[j + 2] = color.b; }
    this.size[i] = size;
  }
  commit(n) {
    this.n = Math.min(n, this.cap);
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.acol.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

// The resolution setting (0.6 low / 0.8 medium / 1 full) also picks the look's
// cost: hatch directions, bloom and how hard glowing surfaces are pushed. Every
// knob is a uniform or a pass flag, so switching never recompiles a shader.
export function presetFor(q) {
  if (q < 0.7) return { name: 'low', hatchDirs: 1, bloom: false, glowBoost: 1.0, blur: 0 };
  if (q < 0.95) return { name: 'medium', hatchDirs: 2, bloom: true, glowBoost: 1.6, blur: 0.75 };
  return { name: 'full', hatchDirs: 3, bloom: true, glowBoost: 2.0, blur: 1.0 };
}

const _vp = /* @__PURE__ */ new THREE.Matrix4();
const hex3 = (h) => { const c = new THREE.Color(h); return new THREE.Vector3(c.r, c.g, c.b); };

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.gl.autoClear = false;
    // POST_FS gamma-encodes by hand. Bloom copies its input to the screen with a
    // MeshBasicMaterial, which three.js would sRGB-encode a second time and wash
    // every dark value out to a pale lavender, so the screen output stays linear.
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.world = new THREE.Scene();
    this.shipScene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, FAR);
    this.quality = 1;
    this.boil = 1;
    this.fx = { flash: 0, damage: 0, warp: 0, blackout: 0 };
    this.pointMats = new Set();
    this.post = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, res: { value: new THREE.Vector2(1, 1) },
        time: { value: 0 }, cnear: { value: 0.05 }, cfar: { value: FAR }, boil: { value: 1 }, lw: { value: 1 },
        scale: { value: 1 }, flash: { value: 0 }, damage: { value: 0 }, warp: { value: 0 }, blackout: { value: 0 },
        glowBoost: { value: 2.0 },
        inkCyan: { value: hex3(0x4deeff) },
        inkRed: { value: hex3(0xff3b5c) },
        spaceBg: { value: hex3(0x05070c) },
        spaceHaze: { value: hex3(0x0e1420) },
        edgeDim: { value: hex3(0x5a5f9e) },
      },
      vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false,
    });
    // The composite is the first composer pass; bloom reads what it wrote.
    // EffectComposer decides which pass draws to the screen every frame, so
    // disabling bloom on the low preset needs no other bookkeeping.
    this.composer = new EffectComposer(this.gl);
    this.composePass = new ShaderPass(this.post);
    this.motion = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tDepth: { value: null },
        invVP: { value: new THREE.Matrix4() }, prevVP: { value: new THREE.Matrix4() },
        strength: { value: 1 }, maxVel: { value: 0.045 },
      },
      vertexShader: POST_VS, fragmentShader: MOTION_FS, depthTest: false, depthWrite: false,
    });
    this.motionPass = new ShaderPass(this.motion);
    this.prevVP = new THREE.Matrix4();
    this.hasPrev = false;
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.45, 0.85);
    this.composer.addPass(this.composePass);
    this.composer.addPass(this.motionPass);
    this.composer.addPass(this.bloomPass);
    this.rt = null;
    this.snapWanted = null;
    this.applyPreset();
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  track(mat) { this.pointMats.add(mat); mat.uniforms.pr.value = this.pr || 1; return mat; }
  applyPreset() {
    const p = presetFor(this.quality);
    this.preset = p.name;
    setHatchDirs(p.hatchDirs);
    this.bloomPass.enabled = p.bloom;
    // Turning the blur back on after the low preset must not reproject from
    // the camera it last saw, which may be a whole scene ago.
    if (p.blur > 0 && !this.motionPass.enabled) this.hasPrev = false;
    this.motionPass.enabled = p.blur > 0;
    this.motion.uniforms.strength.value = p.blur;
    this.post.uniforms.glowBoost.value = p.glowBoost;
  }
  setQuality(q) { this.quality = q; this.applyPreset(); this.resize(); }
  resize() {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    this.pr = Math.min(devicePixelRatio || 1, 1.5) * this.quality;
    this.gl.setPixelRatio(this.pr);
    this.gl.setSize(w, h);
    const W = Math.max(1, Math.floor(w * this.pr)), H = Math.max(1, Math.floor(h * this.pr));
    if (this.rt) { this.rt.depthTexture.dispose(); this.rt.dispose(); }
    const depth = new THREE.DepthTexture(W, H);
    depth.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(W, H, {
      depthTexture: depth, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
    });
    const u = this.post.uniforms;
    u.tColor.value = this.rt.texture;
    u.tDepth.value = depth;
    this.motion.uniforms.tDepth.value = depth;
    u.res.value.set(W, H);
    const sc = Math.max(0.75, H / 800);
    u.scale.value = sc;
    u.lw.value = Math.max(1, sc * 1.1);
    // The composer multiplies by its own pixel ratio; bloom halves internally.
    this.composer.setPixelRatio(this.pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const m of this.pointMats) m.uniforms.pr.value = this.pr;
  }
  render(t) {
    const g = this.gl;
    const u = this.post.uniforms;
    u.time.value = t;
    u.boil.value = this.boil;
    u.cnear.value = this.camera.near;
    u.cfar.value = this.camera.far;
    u.flash.value = this.fx.flash;
    u.damage.value = this.fx.damage;
    u.warp.value = this.fx.warp;
    u.blackout.value = this.fx.blackout;
    g.setRenderTarget(this.rt);
    g.setClearColor(0x000000, 0);
    g.clear(true, true, true);
    g.render(this.world, this.camera);
    g.render(this.shipScene, this.camera);
    if (this.motionPass.enabled) {
      const m = this.motion.uniforms;
      this.camera.updateMatrixWorld();
      _vp.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
      m.invVP.value.copy(_vp).invert();
      // The first frame, and the frame after a cut, have no honest previous
      // camera: blur nothing rather than smear the whole screen.
      m.prevVP.value.copy(this.hasPrev ? this.prevVP : _vp);
      this.prevVP.copy(_vp);
      this.hasPrev = true;
    }
    g.setRenderTarget(null);
    this.composer.render();
    if (this.snapWanted) {
      const cb = this.snapWanted;
      this.snapWanted = null;
      this.canvas.toBlob((b) => cb(b), 'image/png');
    }
  }
  // A hard cut: the next frame has no previous camera to blur from.
  cut() { this.hasPrev = false; }
  // Photo mode: resolves with a PNG blob of the next frame.
  snapshot() { return new Promise((res) => { this.snapWanted = res; }); }
}
