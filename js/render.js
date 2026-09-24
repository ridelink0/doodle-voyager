// The renderer: the world and the ship interior are drawn into one target
// (colour + depth), then a single post pass turns it into ballpoint on lined
// paper: ink edges from depth and colour, hatching where the light is low,
// highlighter fills, ruled lines and the red margin. Material IDs arrive in
// the alpha channel (see mats.js).
import * as THREE from 'three';
import { ID } from './mats.js';

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
uniform float flash, damage, warp, blackout;
uniform vec3 inkBlue, inkRed, paper, rules, margin;
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
float hatch(vec2 p, float ang, float spacing, float width) {
  vec2 dir = vec2(cos(ang), sin(ang));
  float v = dot(p, dir) + (noise(p * 0.035) - 0.5) * 3.0;
  float f = abs(fract(v / spacing) - 0.5) * spacing;
  return 1.0 - smoothstep(width * 0.5, width * 0.5 + 0.9, f);
}
bool isId(float a, float b) { return abs(a - b) < 0.05; }

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
  float edge = max(max(eDepth, eBg), max(eId, eCol));
  edge *= 0.72 + 0.28 * noise(fc * 0.35 + frame);

  bool enemyEdge = isId(id0, 0.8) || isId(cL.a, 0.8) || isId(cR.a, 0.8) || isId(cU.a, 0.8) || isId(cD.a, 0.8);
  vec3 edgeInk = enemyEdge ? inkRed : inkBlue;

  // paper, grain, ruled lines, margin
  vec3 pap = paper * (0.972 + 0.028 * noise(fc * 0.9)) * (0.985 + 0.015 * noise(fc * 0.05));
  float ls = 27.0 * scale;
  float my = mod(fc.y, ls);
  float rule = 1.0 - smoothstep(0.45 * scale, 1.3 * scale, min(my, ls - my));
  float mx = 76.0 * scale;
  float marg = max(1.0 - smoothstep(0.5, 1.4, abs(fc.x - mx)), 1.0 - smoothstep(0.5, 1.4, abs(fc.x - mx - 4.0 * scale)));

  vec3 col;
  if (b0 > 0.5 && id0 < 0.05) {
    col = mix(pap, rules, rule * 0.55);
    col = mix(col, margin, marg * 0.6);
    // warp: every star and galaxy dot is dragged out into a line from the centre
    if (warp > 0.001) {
      vec2 toC = vec2(0.5) - vUv;
      float s = 0.0;
      for (int i = 1; i <= 16; i++) {
        float f = float(i) / 16.0;
        float hit = 1.0 - isBg(texture2D(tDepth, uv + toC * f * 0.35 * warp).x);
        s = max(s, hit * (1.0 - f * 0.85));
      }
      col = mix(col, inkBlue, clamp(s * 1.2, 0.0, 1.0));
    }
  } else {
    vec3 lc = toS(c0.rgb);
    float lum = dot(lc, vec3(0.299, 0.587, 0.114));
    float mxc = max(max(lc.r, lc.g), lc.b), mnc = min(min(lc.r, lc.g), lc.b);
    float sat = mxc > 0.001 ? (mxc - mnc) / mxc : 0.0;
    vec3 hue = lc / max(mxc, 0.001);
    if (id0 > 0.7) {
      bool en = id0 < 0.9;
      vec3 inkc = en ? inkRed : inkBlue;
      vec3 fill = pap * mix(vec3(1.0), hue, clamp(sat * 1.15, 0.0, 1.0) * 0.85);
      fill *= mix(0.84, 1.0, smoothstep(0.12, 0.72, lum));
      vec2 hp = fc / scale;
      float h = 0.0;
      h = max(h, hatch(hp, 0.785, 7.5, 1.1) * smoothstep(0.60, 0.46, lum));
      h = max(h, hatch(hp, 2.356, 7.5, 1.1) * smoothstep(0.40, 0.28, lum));
      h = max(h, hatch(hp, 0.30, 4.2, 1.0) * smoothstep(0.22, 0.12, lum));
      float solid = smoothstep(0.085, 0.035, lum);
      col = mix(fill, inkc, max(h * 0.82, solid));
      col = mix(col, rules, rule * 0.10);
    } else if (id0 > 0.5) {
      col = mix(pap, pap * hue, 0.62 + 0.3 * sat);
      col = mix(col, vec3(1.0), 0.12);
    } else {
      col = mix(lc, lc * pap, 0.2);
    }
  }
  col = mix(col, edgeInk, clamp(edge, 0.0, 1.0));

  vec2 q = vUv - 0.5;
  q.x *= res.x / res.y;
  float r = length(q);
  if (warp > 0.001) {
    float a = atan(q.y, q.x);
    float s = noise(vec2(a * 55.0, r * 3.0 - time * 26.0));
    col = mix(col, inkBlue, warp * smoothstep(0.70, 0.9, s) * smoothstep(0.06, 0.45, r));
    col = mix(col, pap, warp * 0.25 * (1.0 - smoothstep(0.0, 0.25, r)));
  }
  if (damage > 0.001) {
    float vig = smoothstep(0.35, 0.9, r);
    col = mix(col, inkRed, damage * vig * max(hatch(fc / scale, 0.785, 6.0, 1.4), 0.35));
  }
  if (flash > 0.001) col = mix(col, vec3(1.0, 0.93, 0.55), flash * 0.6);
  if (blackout > 0.001) col = mix(col, inkBlue * 0.35, blackout);
  gl_FragColor = vec4(col, 1.0);
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

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.gl.autoClear = false;
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
        inkBlue: { value: new THREE.Vector3(0.102, 0.188, 0.753) },
        inkRed: { value: new THREE.Vector3(0.816, 0.125, 0.188) },
        paper: { value: new THREE.Vector3(0.965, 0.953, 0.902) },
        rules: { value: new THREE.Vector3(0.62, 0.72, 0.92) },
        margin: { value: new THREE.Vector3(0.9, 0.42, 0.46) },
      },
      vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    quad.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.rt = null;
    this.snapWanted = null;
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  track(mat) { this.pointMats.add(mat); mat.uniforms.pr.value = this.pr || 1; return mat; }
  setQuality(q) { this.quality = q; this.resize(); }
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
    u.res.value.set(W, H);
    const sc = Math.max(0.75, H / 800);
    u.scale.value = sc;
    u.lw.value = Math.max(1, sc * 1.1);
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
    g.setRenderTarget(null);
    g.render(this.postScene, this.postCam);
    if (this.snapWanted) {
      const cb = this.snapWanted;
      this.snapWanted = null;
      this.canvas.toBlob((b) => cb(b), 'image/png');
    }
  }
  // Photo mode: resolves with a PNG blob of the next frame.
  snapshot() { return new Promise((res) => { this.snapWanted = res; }); }
}
