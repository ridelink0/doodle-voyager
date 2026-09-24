// Red evil guys (imps), their capital ships, the player's drone and the
// stations. Each kind is built once, merged into one mesh per material and
// cached; every call returns a clone that shares geometry and materials, so a
// fight with ten imps or a Bazaar visit adds no GPU buffers and only a few
// draw calls per actor (the Chromebook budget).
import * as THREE from 'three';
import { ink, red, glow, screen, labelTexture, PAL } from './mats.js';
import { rng, hash } from './util.js';

const TAU = Math.PI * 2;
const HALF = Math.PI / 2;
const UP = new THREE.Vector3(0, 1, 0);

// ---------- merging ----------
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();

// Collects transformed parts per material; into() merges each list into one mesh.
class Kit {
  constructor() { this.parts = new Map(); }
  // r: [x, y, z, order?] Euler angles or a Quaternion; s: number or [x, y, z]
  add(mat, geo, p = [0, 0, 0], r = [0, 0, 0], s = 1) {
    _p.set(p[0], p[1], p[2]);
    if (r.isQuaternion) _q.copy(r); else _q.setFromEuler(_e.set(r[0], r[1], r[2], r[3] || 'XYZ'));
    if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    g.applyMatrix4(_m4.compose(_p, _q, _s));
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(g);
    return this;
  }
  // A Y-axis part (cylinder, cone, capsule) stretched from a to b; make(len) builds it.
  span(mat, a, b, make, s = 1) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const d = B.clone().sub(A), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.divideScalar(len));
    const mid = A.add(B).multiplyScalar(0.5);
    return this.add(mat, make(len), [mid.x, mid.y, mid.z], q, s);
  }
  into(parent) {
    for (const [mat, list] of this.parts) parent.add(new THREE.Mesh(merge(list, !!mat.map), mat));
    this.parts.clear();
    return parent;
  }
}

function merge(list, withUv) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = withUv ? new Float32Array(n * 2) : null;
  let o = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
    if (uv && g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, c * 2), o * 2);
    o += c;
    g.dispose();
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  m.computeBoundingBox();
  m.computeBoundingSphere();
  return m;
}

const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, n = 12, open = false, t0 = 0, tl = TAU) => new THREE.CylinderGeometry(rt, rb, h, n, 1, open, t0, tl),
  sph: (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h),
  dome: (r, w = 12, h = 6) => new THREE.SphereGeometry(r, w, h, 0, TAU, 0, HALF),
  cone: (r, h, n = 8) => new THREE.ConeGeometry(r, h, n),
  torus: (R, r, rs = 6, ts = 24, arc = TAU) => new THREE.TorusGeometry(R, r, rs, ts, arc),
};

// Outlines in the XZ plane, as [x, z] points. -Z is forward.
const arrow = (tip, stern, hw, sh) => [[0, tip], [hw, sh], [hw, stern], [-hw, stern], [-hw, sh]];
const rect = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const rectC = (hw, z0, z1, c) => [[-hw + c, z0], [hw - c, z0], [hw, z0 + c], [hw, z1 - c], [hw - c, z1], [-hw + c, z1], [-hw, z1 - c], [-hw, z0 + c]];

// A slab lofted from the outline `bot` at y0 to `top` at y1 (same point count),
// so sides can slope: wedge hulls, layered armour, chamfered decks.
function prism(bot, y0, top, y1) {
  const out = [];
  const tri = (a, b, c, nx, ny, nz) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * nx + cy * ny + cz * nz < 0) out.push(...a, ...c, ...b); else out.push(...a, ...b, ...c);
  };
  const n = bot.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const [x0, z0] = bot[i], [x1, z1] = bot[(i + 1) % n]; area += x0 * z1 - x1 * z0; }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const b0 = [bot[i][0], y0, bot[i][1]], b1 = [bot[j][0], y0, bot[j][1]];
    const t0 = [top[i][0], y1, top[i][1]], t1 = [top[j][0], y1, top[j][1]];
    const dx = bot[j][0] - bot[i][0], dz = bot[j][1] - bot[i][1];
    const ox = area > 0 ? dz : -dz, oz = area > 0 ? -dx : dx;
    tri(b0, b1, t1, ox, 0, oz);
    tri(b0, t1, t0, ox, 0, oz);
  }
  const cap = (pts, y, ny) => {
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), [])) {
      tri([pts[a][0], y, pts[a][1]], [pts[b][0], y, pts[b][1]], [pts[c][0], y, pts[c][1]], 0, ny, 0);
    }
  };
  cap(top, y1, 1);
  cap(bot, y0, -1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.computeVertexNormals();
  return g;
}

function inside(pts, x, z) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function edgeDist(pts, x, z) {
  let d = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, az] = pts[j], [bx, bz] = pts[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return d;
}

// Random boxes on a flat deck at height y (dir -1 hangs them underneath),
// inside `outer`, outside `inner`, clear of `avoid` circles [x, z, r].
// Every box stands at least 12 m proud so it never z-fights at combat range.
function greebles(kit, r, n, y, dir, outer, inner, avoid, mats) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  let placed = 0;
  for (let tries = 0; placed < n && tries < n * 60; tries++) {
    const w = 10 + r() * 24, d = 14 + r() * 40, h = 12 + r() * 14;
    const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
    const m = Math.hypot(w, d) / 2 + 3;
    if (!inside(outer, x, z) || edgeDist(outer, x, z) < m) continue;
    if (inner && (inside(inner, x, z) || edgeDist(inner, x, z) < m)) continue;
    if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar + m)) continue;
    const mat = mats[Math.floor(r() * mats.length)];
    kit.add(mat, G.box(w, h, d), [x, y + (dir * h) / 2, z]);
    if (r() < 0.4) {
      const h2 = 12 + r() * 8;
      kit.add(mats[Math.floor(r() * mats.length)], G.box(w * 0.55, h2, d * 0.5), [x, y + dir * (h + h2 / 2), z + (r() - 0.5) * d * 0.3]);
    }
    placed++;
  }
}

// Largest distance from the origin to any vertex: the collision sphere.
function reach(root) {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let r = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) r = Math.max(r, v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).length());
  });
  return r;
}

const byRole = (g, role) => {
  const out = [];
  g.traverse((o) => { if (o.userData.role === role) out.push(o); });
  return out;
};

const cache = new Map();
function once(key, make) {
  let v = cache.get(key);
  if (!v) { v = make(); cache.set(key, v); }
  return v;
}

// ---------- canvas textures ----------
const HAND = '"Patrick Hand", "Segoe Print", cursive';
const INK = '#4deeff';

// The handwriting font loads async; redraw a canvas once it is there.
function whenFont(tex, draw) {
  const f = document.fonts;
  if (!f || f.check('40px "Patrick Hand"')) return;
  f.load('40px "Patrick Hand"').then(() => { draw(tex.image); tex.needsUpdate = true; }).catch(() => {});
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  whenFont(t, draw);
  return t;
}
// screen() material that always wins against the board or body right behind it
function decal(tex, alphaTest = 0) {
  const m = screen(tex);
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -4;
  if (alphaTest) m.alphaTest = alphaTest;
  return m;
}

let measure = null;
function fitSize(text, w, max) {
  measure = measure || document.createElement('canvas').getContext('2d');
  measure.font = `${max}px ${HAND}`;
  const tw = measure.measureText(text).width || 1;
  return Math.max(24, Math.min(max, Math.floor((max * w * 0.84) / tw)));
}
// Hand-drawn double border around a sign.
function border(g, w, h) {
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  [[16, 8], [30, 4]].forEach(([o, lw], i) => {
    const j = (k) => Math.sin(k * 12.9898 + i * 78.233) * 3;
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(o + j(1), o + j(2));
    g.lineTo(w - o + j(3), o + j(4));
    g.lineTo(w - o + j(5), h - o + j(6));
    g.lineTo(o + j(7), h - o + j(8));
    g.closePath();
    g.stroke();
  });
}
// Big handwritten sign, 4:1, blue ink on a coloured card. One material per text.
function signMat(text, bg = '#0b0f18') {
  return once(`sign:${text}:${bg}`, () => {
    const draw = (c) => {
      const n = labelTexture(text, { w: 1024, h: 256, bg, fg: INK, size: fitSize(text, 1024, 190) });
      const g = c.getContext('2d');
      g.drawImage(n.image, 0, 0);
      n.dispose();
      border(g, 1024, 256);
    };
    return decal(canvasTex(1024, 256, draw));
  });
}

// The imp's face: angry slanted brows, yellow eyes, wide fanged grin. Only
// the strokes are drawn; the rest is transparent and cut by alphaTest, so the
// red body shows through and the post pass outlines every feature.
function drawFace(c, captain) {
  const g = c.getContext('2d');
  const D = '#23050a';
  g.clearRect(0, 0, 512, 512);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const mouth = () => {
    g.beginPath();
    g.moveTo(88, 314);
    g.quadraticCurveTo(256, 376, 424, 314);
    g.quadraticCurveTo(256, 534, 88, 314);
    g.closePath();
  };
  mouth();
  g.fillStyle = D;
  g.fill();
  g.save();
  mouth();
  g.clip();
  g.fillStyle = '#ff6f82';
  g.beginPath();
  g.ellipse(256, 452, 80, 32, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#fffaf0';
  const upper = (x) => { const t = (x - 88) / 336; return (1 - t) * (1 - t) * 314 + 2 * (1 - t) * t * 376 + t * t * 314; };
  for (let i = 0; i < 10; i++) {
    const x = 118 + i * 30.7, y = upper(x) - 8, fang = i === 1 || i === 8;
    g.beginPath();
    g.moveTo(x - 14, y);
    g.lineTo(x + 14, y);
    g.lineTo(x, y + (fang ? 62 : 26));
    g.closePath();
    g.fill();
  }
  const lower = (x) => { const t = (x - 88) / 336; return (1 - t) * (1 - t) * 314 + 2 * (1 - t) * t * 534 + t * t * 314; };
  for (const x of [186, 326]) {
    const y = lower(x) + 10;
    g.beginPath();
    g.moveTo(x - 13, y);
    g.lineTo(x + 13, y);
    g.lineTo(x, y - 30);
    g.closePath();
    g.fill();
  }
  g.restore();
  g.strokeStyle = D;
  g.lineWidth = 12;
  mouth();
  g.stroke();
  // smirk flicks at the corners
  for (const s of [-1, 1]) {
    const X = (x) => 256 + s * (x - 256);
    g.beginPath();
    g.moveTo(X(66), 286);
    g.quadraticCurveTo(X(74), 314, X(98), 322);
    g.stroke();
  }
  for (const s of [-1, 1]) {
    const X = (x) => 256 + s * (x - 256);
    const patched = captain && s < 0;
    if (!patched) {
      g.beginPath();
      g.moveTo(X(146), 180);
      g.lineTo(X(240), 224);
      g.quadraticCurveTo(X(224), 272, X(176), 266);
      g.quadraticCurveTo(X(138), 252, X(146), 180);
      g.closePath();
      g.fillStyle = '#ffe14a';
      g.fill();
      g.lineWidth = 11;
      g.stroke();
      g.fillStyle = D;
      g.beginPath();
      g.ellipse(X(208), 240, 12, 21, 0, 0, TAU);
      g.fill();
    }
    g.lineWidth = 34;
    g.beginPath();
    g.moveTo(X(124), 144);
    g.lineTo(X(246), 206);
    g.stroke();
  }
  if (captain) {
    // eyepatch with its strap, and a scar over the other cheek
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(0, 262);
    g.lineTo(512, 128);
    g.stroke();
    g.fillStyle = D;
    g.beginPath();
    g.ellipse(192, 228, 58, 46, 0.35, 0, TAU);
    g.fill();
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(352, 262); g.lineTo(392, 312);
    g.moveTo(350, 290); g.lineTo(372, 280);
    g.moveTo(366, 306); g.lineTo(388, 296);
    g.stroke();
  }
}
const faceMat = (captain) => once(`face:${captain}`, () => decal(canvasTex(512, 512, (c) => drawFace(c, captain)), 0.2));

// ---------- imp ----------
// Body centre at (0, 2.2, 0) with the saucer base at y = 0, face toward -Z.
function impBody(kit, pose) {
  const body = red(PAL.red), dark = red(0x6e0e1c);
  kit.add(body, G.sph(1.55, 18, 12), [0, 2.2, 0]);
  // horns: a tilted frustum, then a cone that bends back up, so they curve
  for (const s of [-1, 1]) {
    const root = [s * 0.79, 3.355, -0.1], mid = [s * 1.335, 3.94, -0.1], tip = [s * 1.21, 4.78, -0.18];
    kit.span(dark, root, mid, (l) => G.cyl(0.21, 0.36, l, 8));
    kit.span(dark, mid, tip, (l) => G.cone(0.21, l, 8));
    kit.add(dark, G.sph(0.21, 8, 6), mid);
  }
  const arms = pose === 'desk'
    ? [[[1.2, 1.95, -0.45], [1.4, 1.5, -1.55]], [[-1.2, 1.95, -0.45], [-1.4, 1.5, -1.55]]]
    : [[[1.25, 2.0, -0.25], [2.0, 2.5, -0.55]], [[-1.25, 2.0, -0.25], [-1.95, 1.4, -0.6]]];
  for (const [a, b] of arms) {
    kit.span(body, a, b, (l) => new THREE.CapsuleGeometry(0.27, Math.max(0.05, l - 0.2), 3, 8));
    kit.add(body, G.sph(0.36, 10, 8), b);
  }
}
// spherical patch over the front of the head that carries the face texture
const faceGeo = () => new THREE.SphereGeometry(1.565, 18, 12, 1.5 * Math.PI - 1.1, 2.2, HALF - 1.05, 1.9);

function impTemplate() {
  const g = new THREE.Group(), kit = new Kit();
  const body = red(PAL.red), dark = red(0x6e0e1c), pale = red(0xf07a80), lit = glow(PAL.yellow);
  impBody(kit, 'trident');
  // pointed tail curling up behind
  const curve = new THREE.CatmullRomCurve3([[0, 1.5, 1.2], [0, 1.05, 2.0], [0.25, 1.35, 2.85], [0.1, 2.25, 3.2], [-0.15, 2.9, 2.95]].map((p) => new THREE.Vector3(...p)));
  kit.add(body, new THREE.TubeGeometry(curve, 18, 0.12, 5, false));
  const end = curve.getPoint(1), tan = curve.getTangent(1);
  kit.add(dark, G.cone(0.34, 0.62, 4), [end.x + tan.x * 0.25, end.y + tan.y * 0.25, end.z + tan.z * 0.25], new THREE.Quaternion().setFromUnitVectors(UP, tan), [1, 1, 0.45]);
  // saucer with a glow rim and a thruster glow underneath
  kit.add(dark, G.cyl(2.3, 0.95, 0.5, 20), [0, 0.25, 0]);
  kit.add(pale, G.cyl(1.45, 2.3, 0.32, 20), [0, 0.66, 0]);
  kit.add(lit, G.torus(2.33, 0.15, 5, 28), [0, 0.5, 0], [HALF, 0, 0]);
  kit.add(lit, G.cone(0.62, 0.5, 12), [0, -0.25, 0], [Math.PI, 0, 0]);
  // trident in the right fist
  kit.add(dark, G.cyl(0.07, 0.07, 3.7, 6), [2.0, 2.75, -0.55]);
  kit.add(dark, G.box(0.8, 0.1, 0.1), [2.0, 4.6, -0.55]);
  for (const dx of [-0.35, 0, 0.35]) kit.add(dark, G.cone(0.1, dx ? 0.45 : 0.62, 6), [2.0 + dx, 4.6 + (dx ? 0.225 : 0.31), -0.55]);
  kit.into(g);
  g.add(new THREE.Mesh(faceGeo().translate(0, 2.2, 0), faceMat(false)));
  // centre the whole thing on its middle so the game's hit sphere fits it
  const box = new THREE.Box3().setFromObject(g);
  const cy = (box.min.y + box.max.y) / 2;
  for (const m of g.children) m.geometry.translate(0, -cy, 0);
  g.userData.radius = reach(g);
  return g;
}

export function buildImp() {
  const t = once('imp', impTemplate);
  const group = t.clone();
  return { group, radius: t.userData.radius };
}

// The captain: a big imp in a peaked cap with an eyepatch, arms on the console.
function captainTemplate() {
  const g = new THREE.Group(), kit = new Kit();
  const hat = red(0x6e0e1c);
  impBody(kit, 'desk');
  kit.add(hat, G.cyl(1.05, 1.12, 0.62, 14), [0, 3.72, 0]);
  kit.add(hat, G.cyl(1.38, 1.1, 0.34, 14), [0, 4.18, 0]);
  kit.add(hat, G.cyl(0.95, 0.95, 0.1, 14, false, HALF, Math.PI), [0, 3.46, -0.65]);
  kit.into(g);
  g.add(new THREE.Mesh(faceGeo().translate(0, 2.2, 0), faceMat(true)));
  g.userData.role = 'captain';
  return g;
}

// ---------- capital ships ----------
// Ballpoint shading by colour: pale decks stay mostly paper with red edges,
// red flanks hatch, dark keels and guns hatch solid.
const capMats = () => ({
  top: red(0xf2a2a8), hull: red(0xd02030), keel: red(0x8c1826), dark: red(0x5c0e18), pale: red(0xfbd6d8),
  lit: glow(PAL.yellow), engine: glow(0xff6a3a), beam: glow(0xff4a3a),
});

// Turret: base ring, sloped housing, twin barrels along -Z with glowing muzzles.
// Origin at the foot of the base; about 25 m tall, 66 m to the muzzles.
// One red material plus the muzzle glow: two draw calls per turret.
function turretTemplate() {
  const g = new THREE.Group(), kit = new Kit(), M = capMats();
  kit.add(M.dark, G.cyl(19, 23, 8, 12), [0, 4, 0]);
  kit.add(M.dark, prism(rect(-16, 16, -18, 18), 8, rect(-12, 12, -9, 15), 25));
  for (const s of [-1, 1]) {
    kit.add(M.dark, G.cyl(5.2, 5.2, 12, 8), [s * 6.5, 16, -19], [HALF, 0, 0]);
    kit.add(M.dark, G.cyl(3.2, 3.2, 43, 8), [s * 6.5, 16, -36.5], [HALF, 0, 0]);
    kit.add(M.beam, G.cyl(3.7, 3.7, 8, 8), [s * 6.5, 16, -62], [HALF, 0, 0]);
  }
  kit.into(g);
  g.userData.role = 'turret';
  return g;
}

// Engine glow: a disc facing aft plus a short flame cone; scaled per nozzle.
const engineGeo = () => once('engineGeo', () => {
  const kit = new Kit(), m = glow(0xff6a3a);
  kit.add(m, new THREE.CircleGeometry(1, 16));
  kit.add(m, G.cone(0.8, 0.9, 12), [0, 0, 0.45], [HALF, 0, 0]);
  return kit.into(new THREE.Group()).children[0].geometry;
});

function nozzles(g, kit, M, list) {
  for (const [x, y, z, r] of list) {
    kit.add(M.dark, G.cyl(r * 1.12, r, r, 16, true), [x, y, z + r * 0.3], [HALF, 0, 0]);
    const e = new THREE.Mesh(engineGeo(), M.engine);
    e.position.set(x, y, z + r * 0.3);
    e.scale.setScalar(r);
    e.userData.role = 'engine';
    g.add(e);
  }
}

// Bridge head with a real window opening in its front face (zf), lit from
// behind, and the captain sitting inside looking out. y0 is the floor of the head.
function bridge(g, kit, M, cx, y0, zf) {
  const W = 170, H = 66, D = 80, WW = 110, WH = 46, sill = 10;
  const zc = zf + D / 2, top = H - sill - WH, sw = (W - WW) / 2;
  kit.add(M.hull, G.box(W, sill, D), [cx, y0 + sill / 2, zc]);
  kit.add(M.hull, G.box(W, top, D), [cx, y0 + sill + WH + top / 2, zc]);
  for (const s of [-1, 1]) kit.add(M.hull, G.box(sw, WH, D), [cx + s * (WW / 2 + sw / 2), y0 + sill + WH / 2, zc]);
  kit.add(M.dark, G.box(WW, WH, 10), [cx, y0 + sill + WH / 2, zf + D - 5]);
  kit.add(M.lit, G.box(WW, WH, 12), [cx, y0 + sill + WH / 2, zf + D - 16]);
  kit.add(M.top, prism(rect(cx - W / 2, cx + W / 2, zf, zf + D), y0 + H, rect(cx - W / 2 + 18, cx + W / 2 - 18, zf + 16, zf + D - 6), y0 + H + 16));
  kit.add(M.pale, G.dome(18, 12, 5), [cx, y0 + H + 16, zf + D / 2 + 6]);
  const cap = once('captain', captainTemplate).clone();
  const k = 9;
  cap.scale.setScalar(k);
  cap.position.set(cx, y0 + sill + 16 - 2.2 * k, zf + 34);
  g.add(cap);
}

function addTurret(g, x, y, z, flip = false) {
  const t = once('turret', turretTemplate).clone();
  t.position.set(x, y, z);
  if (flip) t.rotation.z = Math.PI;
  g.add(t);
}

// Bow beam emitter: housing, barrel, rings and a glowing tip; beamPort in front.
function emitter(g, kit, M, y, zTip, housing) {
  kit.add(M.dark, G.cyl(housing * 0.75, housing, 100, 10), [0, y, zTip + 50], [-HALF, 0, 0]);
  kit.add(M.keel, G.cyl(13, 13, 42, 10), [0, y, zTip - 21], [-HALF, 0, 0]);
  for (const dz of [-10, -28]) kit.add(M.pale, G.torus(17, 4.5, 5, 14), [0, y, zTip + dz]);
  kit.add(M.beam, G.sph(13, 12, 8), [0, y, zTip - 44]);
  const port = new THREE.Object3D();
  port.position.set(0, y, zTip - 58);
  port.userData.role = 'beam';
  g.add(port);
}

// Dreadnought: a 900 m arrowhead, deep keel, armour belt and three stepped
// decks, curved devil horns at the bow, 10 turrets, a stepped bridge tower aft.
function dreadnought() {
  const g = new THREE.Group(), kit = new Kit(), M = capMats(), r = rng(hash('dreadnought'));
  const H = arrow(-450, 450, 205, 340);
  const K = arrow(-330, 435, 110, 300);
  const A = arrow(-420, 445, 184, 330);
  const Bb = arrow(-210, 445, 92, 310), Bt = arrow(-180, 440, 76, 310);
  const Cb = arrow(70, 440, 56, 360), Ct = arrow(95, 432, 44, 360);
  kit.add(M.keel, prism(K, -110, H, -25));
  kit.add(M.hull, prism(H, -25, H, 25));
  kit.add(M.top, prism(H, 25, A, 60));
  kit.add(M.hull, prism(Bb, 60, Bt, 110));
  kit.add(M.top, prism(Cb, 110, Ct, 150));
  for (const s of [-1, 1]) {
    // armour plates on the belt, along both bow edges and the stern flanks
    const dx = s * 205, dz = 790, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    const ox = s * uz, oz = -s * ux, a = Math.atan2(-uz, ux);
    [0.2, 0.31, 0.42, 0.53, 0.64, 0.75, 0.86].forEach((t, i) => {
      kit.add(i % 2 ? M.dark : M.keel, G.box(64, 36, 14), [dx * t + ox * 4, 0, -450 + dz * t + oz * 4], [0, a, 0]);
    });
    kit.add(M.dark, G.box(14, 36, 76), [s * 209, 0, 395]);
    // devil horns rising from the bow deck: out, up, then curling in
    const p0 = [s * 40, 50, -200], p1 = [s * 98, 92, -214], p2 = [s * 122, 158, -226], p3 = [s * 96, 228, -236];
    kit.span(M.dark, p0, p1, (l) => G.cyl(18, 24, l, 8));
    kit.add(M.dark, G.sph(18, 8, 6), p1);
    kit.span(M.dark, p1, p2, (l) => G.cyl(12, 18, l, 8));
    kit.add(M.dark, G.sph(12, 8, 6), p2);
    kit.span(M.dark, p2, p3, (l) => G.cone(12, l, 8));
  }
  emitter(g, kit, M, 0, -470, 30);
  nozzles(g, kit, M, [[0, -30, 450, 50], [-125, -30, 450, 34], [125, -30, 450, 34], [-44, 85, 441, 17], [44, 85, 441, 17]]);
  // stepped tower on the top deck, bridge head on top
  kit.add(M.keel, prism(rect(-44, 44, 320, 425), 150, rect(-32, 32, 345, 405), 222));
  bridge(g, kit, M, 0, 222, 330);
  const top = [[0, -290], [-51, -90], [51, -90], [-87, 80], [87, 80], [-121, 240], [121, 240]];
  for (const [x, z] of top) addTurret(g, x, 60, z);
  addTurret(g, 0, 110, 10);
  for (const x of [-48, 48]) addTurret(g, x, -110, 150, true);
  const av = (list) => list.map(([x, z]) => [x, z, 30]);
  greebles(kit, r, 44, 60, 1, A, Bb, av([...top, [40, -200], [-40, -200]]), [M.dark, M.pale, M.keel]);
  greebles(kit, r, 14, 110, 1, Bt, Cb, av([[0, 10]]), [M.dark, M.pale]);
  greebles(kit, r, 8, 150, 1, Ct, rect(-90, 90, 300, 460), [], [M.dark, M.pale]);
  greebles(kit, r, 16, -110, -1, K, null, av([[-48, 150], [48, 150]]), [M.dark, M.hull]);
  kit.into(g);
  return g;
}

// Carrier: a 1200 m hammerhead. The hammer's face is the ship's face: two
// slanted glowing hangar slots for angry eyes under heavy brows, a fanged
// grille and the beam emitter between them. Flight deck, island bridge,
// a glowing belly hangar where the imps drop out.
function carrier() {
  const g = new THREE.Group(), kit = new Kit(), M = capMats(), r = rng(hash('carrier'));
  const LHb = rectC(118, -330, 570, 30), LHt = rectC(165, -370, 590, 30);
  const UHb = rectC(116, -370, 580, 24), UHt = rectC(100, -360, 565, 20);
  const FD = rectC(126, -385, 560, 16);
  const HMf = [[-240, -560], [240, -560], [330, -500], [330, -360], [-330, -360], [-330, -500]];
  const HMi = [[-205, -540], [205, -540], [290, -485], [290, -375], [-290, -375], [-290, -485]];
  kit.add(M.keel, prism(LHb, -100, LHt, -15));
  kit.add(M.hull, prism(UHb, -15, UHt, 50));
  kit.add(M.top, prism(FD, 50, FD, 66));
  kit.add(M.keel, prism(HMi, -80, HMf, 0));
  kit.add(M.top, prism(HMf, 0, HMi, 70));
  for (const s of [-1, 1]) {
    // eyes and brows: outer ends higher, so they scowl
    kit.add(M.lit, G.box(150, 28, 30), [s * 135, 14, -556], [0, 0, s * 0.17]);
    kit.add(M.dark, G.box(176, 20, 44), [s * 135, 44, -552], [0, 0, s * 0.17]);
    for (const x of [55, 100, 145, 190]) kit.add(M.pale, G.cone(11, 38, 4), [s * x, -48, -551], [Math.PI, 0, 0]);
    // sloped armour plates down both sides
    for (let i = 0; i < 9; i++) kit.add(i % 2 ? M.dark : M.keel, G.box(14, 40, 80), [s * 112, 17, -300 + i * 100], [0, 0, s * 0.24]);
  }
  emitter(g, kit, M, -5, -580, 32);
  nozzles(g, kit, M, [[-55, -45, 584, 38], [55, -45, 584, 38], [-116, -58, 584, 22], [116, -58, 584, 22]]);
  // runway lights
  for (let z = -330; z <= 250; z += 80) {
    kit.add(M.lit, G.box(8, 16, 36), [0, 64, z]);
    for (const s of [-1, 1]) kit.add(M.lit, G.box(6, 16, 14), [s * 112, 64, z]);
  }
  // belly hangar with ribs across it
  kit.add(M.lit, G.box(70, 14, 420), [0, -100, 160]);
  for (let z = -30; z <= 350; z += 60) kit.add(M.dark, G.box(96, 20, 14), [0, -102, z]);
  // island: stepped tower off to starboard, bridge head on top
  kit.add(M.keel, prism(rect(42, 114, 292, 380), 66, rect(54, 102, 312, 366), 146));
  bridge(g, kit, M, 78, 146, 290);
  const ledge = [];
  for (const z of [-250, 50, 350]) for (const s of [-1, 1]) { addTurret(g, s * 142, -15, z); ledge.push([s * 142, z, 30]); }
  for (const s of [-1, 1]) addTurret(g, s * 200, 70, -455);
  greebles(kit, r, 16, 66, 1, rectC(104, -370, 540, 10), rect(-36, 36, -400, 600), [[78, 336, 70]], [M.dark, M.pale]);
  greebles(kit, r, 14, 70, 1, HMi, null, [[-200, -455, 30], [200, -455, 30]], [M.dark, M.pale, M.keel]);
  greebles(kit, r, 18, -15, 1, LHt, UHb, ledge, [M.dark, M.pale]);
  greebles(kit, r, 14, -100, -1, LHb, rect(-50, 50, -70, 390), [], [M.dark, M.hull]);
  kit.into(g);
  return g;
}

export function buildCapital(kind) {
  const k = kind === 'carrier' ? 'carrier' : 'dreadnought';
  const t = once('cap:' + k, () => {
    const g = k === 'carrier' ? carrier() : dreadnought();
    const box = new THREE.Box3().setFromObject(g);
    g.userData.length = box.max.z - box.min.z;
    g.userData.radius = reach(g);
    return g;
  });
  const group = t.clone();
  return {
    group, radius: t.userData.radius, length: t.userData.length,
    turrets: byRole(group, 'turret'), beamPort: byRole(group, 'beam')[0],
    engines: byRole(group, 'engine'), captain: byRole(group, 'captain')[0],
  };
}

// ---------- drone ----------
// Yellow quadcopter, 1.2 m across the prop guards, nose (camera) toward -Z.
function droneTemplate() {
  const g = new THREE.Group(), kit = new Kit();
  const yel = ink(PAL.yellow), dark = ink(PAL.dark), lit = glow(PAL.teal);
  kit.add(yel, G.box(0.34, 0.12, 0.46));
  kit.add(yel, G.dome(0.2, 12, 5), [0, 0.06, 0], [0, 0, 0], [0.85, 0.55, 1.2]);
  const m = 0.33;
  // diagonal arms run through the dome and out to the prop guards
  for (const s of [-1, 1]) kit.add(yel, G.box(1.42, 0.04, 0.05), [0, 0.1, 0], [0, s * Math.PI / 4, 0]);
  for (const [x, z] of [[m, m], [-m, m], [m, -m], [-m, -m]]) {
    kit.add(dark, G.cyl(0.055, 0.055, 0.1, 10), [x, 0.06, z]);
    kit.add(yel, G.torus(0.25, 0.02, 4, 20), [x, 0.12, z], [HALF, 0, 0]);
  }
  // camera eye under the nose
  kit.add(dark, G.sph(0.075, 10, 8), [0, -0.07, -0.22]);
  kit.add(lit, G.sph(0.038, 8, 6), [0, -0.075, -0.285]);
  kit.add(lit, G.sph(0.02, 6, 4), [0, 0.14, 0.12]);
  // bomb rack with two bombs, and skids
  kit.add(dark, G.box(0.22, 0.03, 0.3), [0, -0.075, 0.04]);
  for (const s of [-1, 1]) {
    kit.add(dark, new THREE.CapsuleGeometry(0.042, 0.11, 3, 8), [s * 0.065, -0.13, 0.04], [HALF, 0, 0]);
    kit.add(dark, G.box(0.012, 0.05, 0.05), [s * 0.065, -0.13, 0.13]);
    kit.add(dark, G.box(0.02, 0.1, 0.02), [s * 0.14, -0.1, -0.12]);
    kit.add(dark, G.box(0.02, 0.1, 0.02), [s * 0.14, -0.1, 0.14]);
    kit.add(dark, G.box(0.025, 0.025, 0.42), [s * 0.14, -0.155, 0.01]);
  }
  kit.into(g);
  // rotors: separate meshes so the game can spin them about their local Y
  const blades = new Kit();
  blades.add(dark, G.box(0.44, 0.012, 0.045));
  blades.add(dark, G.box(0.045, 0.012, 0.44));
  blades.add(dark, G.cyl(0.028, 0.028, 0.035, 8));
  const bladeGeo = blades.into(new THREE.Group()).children[0].geometry;
  for (const [x, z] of [[m, m], [-m, m], [m, -m], [-m, -m]]) {
    const rot = new THREE.Mesh(bladeGeo, dark);
    rot.position.set(x, 0.125, z);
    rot.userData.role = 'rotor';
    g.add(rot);
  }
  g.userData.radius = reach(g);
  return g;
}

export function buildDrone() {
  const t = once('drone', droneTemplate);
  const group = t.clone();
  return { group, radius: t.userData.radius, rotors: byRole(group, 'rotor') };
}

// ---------- stations ----------
const FUEL_COL = { ION: 0x5cc7c0, PLASMA: 0xb07ce8, DEUTERIUM: 0xff9a3c };
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

// A sign board: frame box plus the text on its front (+Z after ry) and, when
// two-sided, on its back. w is the text width; the card is 4:1.
function board(kit, frame, mat, w, x, y, z, ry = 0, twoSided = true) {
  const h = w / 4, t = Math.max(1, w * 0.03);
  kit.add(frame, G.box(w * 1.06, h * 1.14, t), [x, y, z], [0, ry, 0]);
  const nx = Math.sin(ry), nz = Math.cos(ry), o = t / 2 + Math.max(0.12, w * 0.002);
  kit.add(mat, new THREE.PlaneGeometry(w, h), [x + nx * o, y, z + nz * o], [0, ry, 0]);
  if (twoSided) kit.add(mat, new THREE.PlaneGeometry(w, h), [x - nx * o, y, z - nz * o], [0, ry + Math.PI, 0]);
}
// text straight on a wall, facing (sin ry, 0, cos ry)
function decalSign(kit, mat, w, x, y, z, ry) {
  kit.add(mat, new THREE.PlaneGeometry(w, w / 4), [x, y, z], [0, ry, 0]);
}
function dockRing(g, kit, R, x, y, z, ry = 0) {
  kit.add(glow(PAL.yellow), G.torus(R, Math.max(1.2, R * 0.09), 6, 36), [x, y, z], [0, ry, 0]);
  g.userData.dock = new THREE.Vector3(x, y, z);
}

// Fuel station, about 150 m: deck, canopy with the FUEL fascia, one pump per
// fuel type with its own coloured sign, tanks of each fuel slung underneath,
// and a tall FUEL pylon listing what it sells.
function fuelStation(types) {
  const g = new THREE.Group(), kit = new Kit();
  const deck = ink(PAL.grey), white = ink(PAL.white), dark = ink(PAL.dark), steel = ink(PAL.steel), yel = ink(PAL.yellow);
  const n = types.length, xs = n === 1 ? [0] : n === 2 ? [-26, 26] : [-44, 0, 44];
  kit.add(deck, prism(rectC(75, -45, 45, 12), -7, rectC(75, -45, 45, 12), 0));
  kit.add(steel, prism(rectC(50, -30, 30, 10), -26, rectC(72, -42, 42, 12), -7));
  types.forEach((ft, i) => {
    const col = ink(FUEL_COL[ft]), x = xs[i];
    // tank below
    kit.add(col, G.sph(n === 1 ? 22 : 17, 14, 10), [x, -42, 0]);
    kit.add(white, G.torus(n === 1 ? 22.3 : 17.3, 1.6, 4, 24), [x, -42, 0], [HALF, 0, 0]);
    // pump
    kit.add(col, G.box(10, 16, 7), [x, 11, 0]);
    kit.add(white, G.box(12, 4, 9), [x, 21, 0]);
    kit.add(glow(PAL.yellow), G.box(6, 4, 4), [x, 14, -3.5]);
    const hose = new THREE.CatmullRomCurve3([[x + 5, 12, -1], [x + 8.5, 6, -2.5], [x + 7.5, 3.6, -4], [x + 6, 8, -4.6]].map((p) => new THREE.Vector3(...p)));
    kit.add(dark, new THREE.TubeGeometry(hose, 12, 0.55, 5, false));
    kit.add(dark, G.box(1.4, 3.4, 1.4), [x + 6, 9.4, -4.6]);
    board(kit, white, signMat(ft, hex(FUEL_COL[ft])), 30, x, 30.5, 0);
    kit.add(white, G.box(1.2, 3.2, 1.2), [x, 24.6, 0]);
  });
  kit.add(white, G.box(Math.max(40, xs[n - 1] - xs[0] + 34), 3, 14), [0, 1.5, 0]);
  // canopy on four pillars; its fascia carries FUEL on every side
  for (const [x, z] of [[-62, -17], [62, -17], [-62, 17], [62, 17]]) kit.add(white, G.cyl(2.4, 2.4, 44, 8), [x, 22, z]);
  kit.add(yel, G.box(140, 12, 48), [0, 50, 0]);
  for (const x of xs) kit.add(glow(PAL.yellow), G.box(22, 4, 10), [x, 44, 0]);
  const fuel = signMat('FUEL', '#ffd84a');
  decalSign(kit, fuel, 44, 0, 50, -24.4, Math.PI);
  decalSign(kit, fuel, 44, 0, 50, 24.4, 0);
  decalSign(kit, fuel, 40, -70.4, 50, 0, -HALF);
  decalSign(kit, fuel, 40, 70.4, 50, 0, HALF);
  // two-legged pylon behind the canopy: FUEL on top, one tile per fuel type between the legs
  for (const x of [35, 69]) kit.add(steel, G.cyl(2.2, 2.6, 76, 8), [x, 38, 36]);
  board(kit, white, fuel, 40, 52, 82, 36);
  types.forEach((ft, i) => board(kit, white, signMat(ft, hex(FUEL_COL[ft])), 28, 52, 67 - i * 8.6, 36));
  for (const [x, z] of [[-75, -45], [75, -45], [-75, 45], [75, 45]]) kit.add(glow(PAL.yellow), G.sph(2.2, 8, 6), [x * 0.85, 0.5, z * 0.85]);
  dockRing(g, kit, 13, 0, 24, -52);
  kit.into(g);
  return g;
}

// Shipyard, about 700 m: an open cradle of beams and yellow ribs with a blue
// ship half built inside, two gantry cranes, the office block with the sign.
function shipyard() {
  const g = new THREE.Group(), kit = new Kit();
  const steel = ink(PAL.steel), yel = ink(PAL.yellow), blue = ink(PAL.blue), white = ink(PAL.white), orange = ink(PAL.orange), dark = ink(PAL.dark);
  const lit = glow(PAL.yellow), sign = signMat('SHIPYARD', '#ffd84a');
  for (const x of [-110, 110]) for (const y of [-90, 90]) kit.add(steel, G.box(16, 16, 620), [x, y, 0]);
  for (let z = -300; z <= 300; z += 100) {
    for (const x of [-110, 110]) kit.add(yel, G.box(14, 196, 14), [x, 0, z]);
    kit.add(yel, G.box(236, 14, 14), [0, -90, z]);
    if (Math.abs(z) === 300) kit.add(yel, G.box(236, 14, 14), [0, 90, z]);
    for (const x of [-110, 110]) kit.add(lit, G.box(8, 8, 8), [x, 102, z]);
    if (z < 300) for (const x of [-110, 110]) kit.span(steel, [x, -90, z], [x, 90, z + 100], (l) => G.box(6, l, 6));
  }
  // the ship being built: plated nose, then bare ribs on a keel
  kit.add(blue, G.cone(45, 80, 12), [0, -17, -225], [-HALF, 0, 0]);
  kit.add(blue, G.cyl(45, 45, 60, 12), [0, -17, -155], [HALF, 0, 0]);
  kit.add(dark, G.box(10, 10, 360), [0, -62, 50]);
  for (let z = -100; z <= 220; z += 40) kit.add(blue, G.torus(45, 3.2, 4, 12, Math.PI), [0, -17, z], [0, 0, Math.PI]);
  for (const x of [-45, 45]) kit.add(blue, G.box(8, 8, 350), [x, -17, 50]);
  // gantry cranes, one lifting a hull plate
  for (const [z, hx] of [[-60, 20], [160, -30]]) {
    for (const x of [-110, 110]) kit.add(orange, G.box(10, 52, 10), [x, 124, z]);
    kit.add(orange, G.box(252, 12, 14), [0, 154, z]);
    kit.add(orange, G.box(24, 12, 22), [hx, 142, z]);
    kit.add(dark, G.box(1.8, 64, 1.8), [hx, 104, z]);
    kit.add(blue, G.box(44, 5, 30), [hx, 70, z]);
  }
  // office block at the stern end, windows on both faces
  kit.add(white, G.box(260, 150, 60), [0, -5, 335]);
  kit.add(steel, G.box(270, 8, 70), [0, 74, 335]);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
    const x = -95 + i * 38, y = -44 + j * 30;
    kit.add(lit, G.box(26, 16, 6), [x, y, 305]);
    kit.add(lit, G.box(26, 16, 6), [x, y, 365]);
  }
  for (const x of [-80, 80]) kit.add(steel, G.box(6, 22, 6), [x, 89, 335]);
  board(kit, white, sign, 240, 0, 134, 335);
  for (const s of [-1, 1]) board(kit, white, sign, 240, s * 121, 30, 0, s * HALF, false);
  dockRing(g, kit, 80, 0, 0, -330);
  kit.into(g);
  return g;
}

// Outfitter, about 500 m: an orange hex tower in a toothed gear ring, three
// giant parts on show (laser, shield, thruster), a rooftop billboard.
function outfitter() {
  const g = new THREE.Group(), kit = new Kit();
  const orange = ink(PAL.orange), dark = ink(PAL.dark), steel = ink(PAL.steel), white = ink(PAL.white), blue = ink(PAL.blue);
  const teal = glow(PAL.teal), sign = signMat('OUTFITTER', '#ff9a3c');
  const rh = [0, Math.PI / 6, 0];
  kit.add(orange, G.cyl(70, 70, 240, 6), [0, 0, 0], rh);
  kit.add(dark, G.cyl(52, 70, 26, 6), [0, 133, 0], rh);
  kit.add(dark, G.cyl(70, 40, 40, 6), [0, -140, 0], rh);
  for (const y of [-60, 60]) kit.add(white, G.cyl(76, 76, 14, 6), [0, y, 0], rh);
  kit.add(steel, G.torus(160, 16, 6, 40), [0, 0, 0], [HALF, 0, 0]);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    kit.add(steel, G.box(26, 36, 30), [Math.sin(a) * 180, 0, Math.cos(a) * 180], [0, a, 0]);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    kit.add(steel, G.box(14, 14, 94), [Math.sin(a) * 113, 0, Math.cos(a) * 113], [0, a, 0]);
  }
  const at = (a, rr, y) => [Math.sin(a) * rr, y, Math.cos(a) * rr];
  // giant laser cannon
  let a = Math.PI / 6;
  kit.add(dark, G.box(30, 20, 30), at(a, 160, 26), [0, a, 0]);
  kit.span(blue, at(a, 160, 36), at(a, 205, 140), (l) => G.cyl(9, 13, l, 10));
  kit.add(teal, G.sph(11, 10, 8), at(a, 207, 145));
  // giant shield on a post, facing out
  a = (5 * Math.PI) / 6;
  kit.add(dark, G.box(10, 44, 10), at(a, 160, 38));
  kit.add(blue, G.cyl(55, 55, 8, 20), at(a, 166, 110), [HALF, a, 0, 'YXZ']);
  kit.add(teal, G.torus(55, 3.5, 4, 28), at(a, 171, 110), [0, a, 0]);
  // giant thruster, bell outward
  a = (3 * Math.PI) / 2;
  kit.add(dark, G.box(30, 30, 30), at(a, 160, 30), [0, a, 0]);
  kit.add(steel, G.cyl(44, 28, 70, 14), at(a, 170, 80), [HALF, a, 0, 'YXZ']);
  kit.add(glow(PAL.orange), G.cone(30, 50, 12), at(a, 230, 80), [HALF, a, 0, 'YXZ']);
  // three-sided rooftop sign, one face toward the dock, and the name on every tower face
  kit.add(steel, G.box(10, 52, 10), [0, 170, 0]);
  for (let i = 0; i < 3; i++) {
    const f = Math.PI + (i / 3) * TAU;
    board(kit, white, sign, 260, Math.sin(f) * 80, 234, Math.cos(f) * 80, f, false);
  }
  for (let i = 0; i < 6; i++) {
    const f = (i / 6) * TAU;
    decalSign(kit, sign, 58, Math.sin(f) * 61, 92, Math.cos(f) * 61, f);
  }
  kit.add(steel, G.cyl(10, 10, 52, 10), [0, -80, -86], [HALF, 0, 0]);
  dockRing(g, kit, 34, 0, -80, -114);
  kit.into(g);
  return g;
}

// General store, about 350 m: a corner shop on a lump of asteroid, striped
// awning, lit windows, a giant soda can and crates on the roof.
function generalStore() {
  const g = new THREE.Group(), kit = new Kit();
  const rock = ink(PAL.grey), cream = ink(PAL.cream), wood = ink(PAL.wood), green = ink(PAL.green), white = ink(PAL.white), dark = ink(PAL.dark);
  const lit = glow(PAL.yellow), sign = signMat('GENERAL STORE', '#7fbf6a');
  const ast = new THREE.IcosahedronGeometry(1, 2);
  const p = ast.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.82 + (hash(x.toFixed(3), y.toFixed(3), z.toFixed(3)) % 1000) / 3000;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  kit.add(rock, ast, [0, -58, 0], [0, 0.4, 0], [165, 78, 135]);
  kit.add(cream, G.box(240, 110, 150), [0, 55, 0]);
  kit.add(wood, G.box(252, 8, 162), [0, 114, 0]);
  for (const x of [-68, 68]) kit.add(lit, G.box(80, 46, 6), [x, 42, -75]);
  kit.add(dark, G.box(40, 66, 6), [0, 33, -75]);
  for (let i = 0; i < 8; i++) kit.add(i % 2 ? white : green, G.box(30, 3, 36), [-105 + i * 30, 86, -90], [-0.35, 0, 0]);
  for (const x of [-70, 70]) kit.add(wood, G.box(6, 18, 6), [x, 126, -60]);
  board(kit, white, sign, 220, 0, 158, -60);
  for (const s of [-1, 1]) decalSign(kit, sign, 130, s * 120.4, 62, 0, s * HALF);
  decalSign(kit, sign, 200, 0, 62, 75.4, 0);
  // soda can and crates on the roof
  kit.add(ink(PAL.teal), G.cyl(20, 20, 56, 14), [70, 146, 40]);
  kit.add(white, G.cyl(23, 23, 14, 14), [70, 146, 40]);
  kit.span(ink(PAL.pink), [74, 170, 40], [86, 206, 34], (l) => G.cyl(2.5, 2.5, l, 6));
  for (const [x, y, z] of [[-60, 130, 30], [-30, 130, 46], [-46, 154, 38]]) kit.add(wood, G.box(24, 24, 24), [x, y, z]);
  kit.add(wood, G.box(16, 6, 56), [0, 15, -103]);
  dockRing(g, kit, 32, 0, 50, -130);
  kit.into(g);
  return g;
}

// TV screen for the media kiosk: blue card, scanlines, a big play button.
function tvMat() {
  return once('tv', () => decal(canvasTex(512, 358, (c) => {
    const g = c.getContext('2d');
    g.fillStyle = '#6f95ff';
    g.fillRect(0, 0, 512, 358);
    g.fillStyle = 'rgba(246, 243, 230, 0.16)';
    for (let y = 0; y < 358; y += 14) g.fillRect(0, y, 512, 5);
    g.fillStyle = '#0b0f18';
    g.strokeStyle = INK;
    g.lineWidth = 12;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(206, 118); g.lineTo(206, 262); g.lineTo(330, 190);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = INK;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${fitSize('NOW SHOWING', 440, 56)}px ${HAND}`;
    g.fillText('NOW SHOWING', 256, 72);
    border(g, 512, 358);
  })));
}

// Media kiosk, about 300 m: a giant retro TV on stubby legs with rabbit-ear
// antennas, knobs, speaker slots and film reels on its sides.
function mediaKiosk() {
  const g = new THREE.Group(), kit = new Kit();
  const pink = ink(PAL.pink), dark = ink(PAL.dark), grey = ink(PAL.grey), white = ink(PAL.white);
  const sign = signMat('MEDIA KIOSK', '#f2a0b8');
  kit.add(pink, G.box(220, 150, 110));
  kit.add(grey, G.box(170, 116, 50), [0, 0, 80]);
  kit.add(dark, G.box(160, 116, 6), [22, 4, -55]);
  kit.add(tvMat(), new THREE.PlaneGeometry(146, 102), [22, 4, -58.4], [0, Math.PI, 0]);
  for (const y of [30, -8]) {
    kit.add(dark, G.cyl(13, 13, 10, 14), [-88, y, -57], [HALF, 0, 0]);
    kit.add(white, G.box(3, 12, 4), [-88, y + 5, -62]);
  }
  for (let i = 0; i < 4; i++) kit.add(dark, G.box(34, 4, 6), [-88, -38 - i * 9, -55]);
  kit.add(dark, G.dome(18, 12, 5), [0, 75, 20]);
  for (const s of [-1, 1]) {
    kit.span(dark, [s * 10, 80, 20], [s * 70, 150, 30], (l) => G.cyl(2.5, 2.5, l, 6));
    kit.add(glow(PAL.yellow), G.sph(6, 8, 6), [s * 70, 150, 30]);
    for (const z of [-35, 35]) kit.add(dark, G.cone(8, 36, 6), [s * 80, -93, z], [Math.PI, 0, 0]);
    // film reel on each side
    kit.add(dark, G.cyl(46, 46, 8, 20), [s * 114, 10, 0], [0, 0, HALF]);
    kit.add(white, G.cyl(8, 8, 12, 10), [s * 114, 10, 0], [0, 0, HALF]);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      kit.add(white, G.cyl(9, 9, 12, 10), [s * 114, 10 + Math.sin(a) * 25, Math.cos(a) * 25], [0, 0, HALF]);
    }
  }
  for (const x of [-60, 60]) kit.add(dark, G.box(6, 14, 6), [x, 82, -30]);
  board(kit, white, sign, 200, 0, 115, -30);
  decalSign(kit, sign, 150, 0, 0, 105.4, 0);
  dockRing(g, kit, 26, 0, -106, -70);
  kit.into(g);
  return g;
}

// Bazaar hub, about 820 m: a market ring of coloured stalls on six spokes
// round a domed hub, lamps all round, billboards above and below.
function bazaarHub() {
  const g = new THREE.Group(), kit = new Kit();
  const cream = ink(PAL.cream), steel = ink(PAL.steel), white = ink(PAL.white), lit = glow(PAL.yellow);
  const cols = [PAL.yellow, PAL.teal, PAL.pink, PAL.orange, PAL.blue, PAL.green];
  const sign = signMat('BAZAAR HUB', '#5cc7c0');
  kit.add(cream, G.torus(360, 42, 8, 48), [0, 0, 0], [HALF, 0, 0]);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU, c = cols[i % cols.length];
    kit.add(ink(c), G.box(70, 40, 60), [Math.sin(a) * 360, 44, Math.cos(a) * 360], [0, a, 0]);
    kit.add(ink(cols[(i + 3) % cols.length]), G.cone(50, 26, 4), [Math.sin(a) * 360, 77, Math.cos(a) * 360], [0, a + Math.PI / 4, 0]);
  }
  for (let i = 0; i < 24; i++) {
    const a = ((i + 0.5) / 24) * TAU;
    kit.add(lit, G.sph(7, 8, 6), [Math.sin(a) * 402, 0, Math.cos(a) * 402]);
  }
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) / 6) * TAU;
    kit.span(steel, [Math.sin(a) * 85, 0, Math.cos(a) * 85], [Math.sin(a) * 325, 0, Math.cos(a) * 325], (l) => G.cyl(12, 12, l, 8));
  }
  kit.add(white, G.cyl(90, 90, 170, 16));
  kit.add(ink(PAL.blue), G.dome(90, 16, 8), [0, 85, 0]);
  kit.add(steel, G.cone(90, 90, 16), [0, -130, 0], [Math.PI, 0, 0]);
  for (const y of [-40, 40]) kit.add(ink(PAL.orange), G.cyl(96, 96, 16, 16), [0, y, 0]);
  kit.add(steel, G.box(12, 34, 12), [0, 186, 0]);
  board(kit, white, sign, 440, 0, 262, 0);
  kit.add(steel, G.box(12, 34, 12), [0, -186, 0]);
  board(kit, white, sign, 440, 0, -262, 0, HALF);
  kit.add(steel, G.cyl(22, 22, 110, 12), [0, 0, -145], [HALF, 0, 0]);
  dockRing(g, kit, 40, 0, 0, -205);
  kit.into(g);
  return g;
}

const STATIONS = { shipyard, outfitter, general: generalStore, media: mediaKiosk, hub: bazaarHub };
const FUELS = ['ION', 'PLASMA', 'DEUTERIUM'];

export function buildStation(kind, opts = {}) {
  let key = kind, make = STATIONS[kind] || STATIONS.general;
  if (kind === 'fuel') {
    const want = (opts && opts.fuelTypes) || [];
    const types = FUELS.filter((f) => want.includes(f));
    if (!types.length) types.push(...FUELS);
    key = 'fuel:' + types.join(',');
    make = () => fuelStation(types);
  }
  const t = once('station:' + key, () => {
    const g = make();
    g.userData.radius = reach(g);
    return g;
  });
  const group = t.clone();
  return { group, radius: t.userData.radius, dock: t.userData.dock.clone() };
}
