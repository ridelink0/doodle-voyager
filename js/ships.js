// Player ships: stats, walkable interiors and flyable exteriors, all in
// ship-local metres (floor y = 0, forward -Z, origin on the floor mid-ship).
// Static parts are merged into one mesh per material, so a furnished ship is
// a few dozen draw calls however much furniture it carries (Chromebook GPUs).
import * as THREE from 'three';
import { ink, glow, screen, paint, label, labelTexture, PAL } from './mats.js';

export const SHIPS = {
  scout: {
    id: 'scout', name: 'Pencil Case', cls: 'small', fuel: 'ION', tank: 85, hull: 100, shield: 60, speed: 330, cruise: 2.5e5, turn: 1.7, guns: 2, dmg: 12, price: 0,
    desc: 'A zip-top starter hull with a cockpit, a fold-down bunk and a storage bay that just fits the drone hatch between the crates. Still somehow loses your eraser.',
  },
  eraser: {
    id: 'eraser', name: 'Eraser', cls: 'small', fuel: 'ION', tank: 60, hull: 70, shield: 40, speed: 480, cruise: 3.2e5, turn: 2.3, guns: 1, dmg: 9, price: 5000,
    desc: 'A squat pink block in a paper sleeve with one fat nozzle. The only Eraser on our side: fast, light, and a little embarrassed about the name.',
  },
  racer: {
    id: 'racer', name: 'Highlighter', cls: 'small', fuel: 'ION', tank: 75, hull: 80, shield: 50, speed: 460, cruise: 4e5, turn: 2.1, guns: 2, dmg: 10, price: 7000,
    desc: 'A chisel-tipped engine with a seat bolted on and one locker nook behind the cockpit. Marks the important parts of space in a colour nobody asked for, very quickly.',
  },
  tape: {
    id: 'tape', name: 'Correction Tape', cls: 'small', fuel: 'ION', tank: 55, hull: 65, shield: 45, speed: 500, cruise: 3.4e5, turn: 2.4, guns: 2, dmg: 9, price: 9000,
    desc: 'The flattest hull in the yard: a tape reel on the back and a wide applicator nose. Leaves a faint white line where you used to be.',
  },
  witeout: {
    id: 'witeout', name: 'Correction Fluid', cls: 'small', fuel: 'ION', tank: 65, hull: 75, shield: 55, speed: 440, cruise: 3.0e5, turn: 2.0, guns: 2, dmg: 10, price: 11000,
    desc: 'A squat bottle with a narrow neck and a flip cap for a fin. Paints itself out of the picture; enemies lose track of you, and so, occasionally, do you.',
  },
  fighter: {
    id: 'fighter', name: 'Ballpoint', cls: 'medium', fuel: 'PLASMA', tank: 110, hull: 180, shield: 120, speed: 350, cruise: 3e5, turn: 1.8, guns: 4, dmg: 14, price: 12000,
    desc: 'Four wing guns fed from a real gun room behind the cockpit, a click-button drive and a cargo hold at the back. The hull Doodle District survivors trust.',
  },
  paperclip: {
    id: 'paperclip', name: 'Paperclip', cls: 'medium', fuel: 'PLASMA', tank: 100, hull: 140, shield: 110, speed: 300, cruise: 2.8e5, turn: 1.6, guns: 2, dmg: 11, price: 14000,
    desc: 'Two steel tubes bent into a loop at the bow around a small crew body. Bends, holds, drags.',
  },
  hauler: {
    id: 'hauler', name: 'Ring Binder', cls: 'medium', fuel: 'PLASMA', tank: 190, hull: 260, shield: 100, speed: 230, cruise: 2.5e5, turn: 1.0, guns: 2, dmg: 12, price: 15000,
    desc: 'Three steel rings hold a 16 m cargo bay of racks and pallets, with a bunk room for the long hauls. Zero sympathy for your fuel bill.',
  },
  gelpen: {
    id: 'gelpen', name: 'Gel Pen', cls: 'small', fuel: 'ION', tank: 50, hull: 55, shield: 30, speed: 620, cruise: 4.2e5, turn: 2.6, guns: 2, dmg: 18, price: 16000,
    desc: 'A long see-through barrel with a needle nose and twin thin engines: the fastest ink in the yard and the thinnest hull. Writes beautifully. Smudges if touched.',
  },
  compass: {
    id: 'compass', name: 'Compass', cls: 'medium', fuel: 'PLASMA', tank: 115, hull: 170, shield: 130, speed: 310, cruise: 2.9e5, turn: 2.2, guns: 3, dmg: 12, price: 18000,
    desc: 'Two legs splayed from a pivot hub, one a needle point, one a pencil foot. Turns tighter than anything with a hull and draws perfect circles around people who draw lines.',
  },
  stickynotes: {
    id: 'stickynotes', name: 'Sticky Notes', cls: 'small', fuel: 'ION', tank: 90, hull: 110, shield: 90, speed: 380, cruise: 3.0e5, turn: 2.0, guns: 2, dmg: 10, price: 20000,
    desc: 'A fanned pad of square plates with a bright note stuck on top. The red guys keep attacking reminders.',
  },
  stapler: {
    id: 'stapler', name: 'Stapler', cls: 'medium', fuel: 'PLASMA', tank: 120, hull: 240, shield: 150, speed: 260, cruise: 2.6e5, turn: 1.3, guns: 3, dmg: 16, price: 22000,
    desc: 'A wedge: a tall spring housing at the stern, a low jaw at the bow and a hinge ridge down the spine. Rams first, asks for the invoice later.',
  },
  gluestick: {
    id: 'gluestick', name: 'Glue Stick', cls: 'medium', fuel: 'PLASMA', tank: 130, hull: 200, shield: 180, speed: 240, cruise: 2.6e5, turn: 1.2, guns: 2, dmg: 11, price: 24000,
    desc: 'A fat screw-threaded barrel with a domed cap. Smells faintly of primary school.',
  },
  cruiser: {
    id: 'cruiser', name: 'Lecture Hall', cls: 'large', fuel: 'DEUTERIUM', tank: 240, hull: 450, shield: 220, speed: 200, cruise: 3e5, turn: 0.7, guns: 6, dmg: 14, price: 40000,
    desc: 'A 60 m liner with four dorm rooms, two bathrooms, a galley, a laundry, a lounge with a big screen and its own drone bay. Attendance is mandatory.',
  },
};

const T = 0.15;          // wall thickness
const DOOR_H = 2.2;
const HP = Math.PI / 2;
const PI = Math.PI;

// Materials: ink() and glow() cache by colour, so these are shared game-wide.
const C = {
  wall: ink(PAL.charcoal), ceil: ink(PAL.paper), floor: ink(0x1c1e26), dark: ink(PAL.dark), black: ink(0x101118),
  steel: ink(PAL.steel), grey: ink(PAL.grey), wood: ink(PAL.wood), plank: ink(0x5a3f26), cream: ink(PAL.cream),
  white: ink(0x8e97a8), glass: ink(0x2a4a58), mirror: ink(0x6d8796), tile: ink(0x24413c),
  teal: ink(PAL.teal), pink: ink(PAL.pink), orange: ink(PAL.orange), green: ink(PAL.green), blue: ink(PAL.blue),
  yellow: ink(PAL.yellow), brass: ink(0x8a6a2a), net: ink(0x6f8f4e), terra: ink(0x7a3a22), board: ink(0x35503f),
  hole: ink(0x121218),
};
const G = {
  lamp: glow(0xffd27a), yellow: glow(PAL.yellow), teal: glow(0x8ee6de), pink: glow(0xffb3cc), green: glow(0xaef08e),
  orange: glow(PAL.orange), blue: glow(0xa8c2ff), red: glow(0xff6f5e), engine: glow(0xffb347),
  str1: glow(0xffe79a), str2: glow(0xffa8d0),   // string lights only (they twinkle)
};

// ---------- shared geometry ----------
const geos = new Map();
function geo(key, make) { let x = geos.get(key); if (!x) { x = make(); geos.set(key, x); } return x; }
const BOX = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const CYL = (seg = 10, start = 0) => geo(`cyl${seg}/${start}`, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg, 1, false, start));
const FRU = (top, seg = 10, start = 0) => geo(`fru${top}/${seg}/${start}`, () => new THREE.CylinderGeometry(0.5 * top, 0.5, 1, seg, 1, false, start));
const CONE = (seg = 8) => geo('cone' + seg, () => new THREE.ConeGeometry(0.5, 1, seg));
const TOR = (R, r, seg = 16) => geo(`tor${R}/${r}/${seg}`, () => new THREE.TorusGeometry(R, r, 5, seg));
const OCT = () => geo('oct', () => new THREE.OctahedronGeometry(0.5, 0));

const flats = new WeakMap();
function flat(g) {
  let f = flats.get(g);
  if (!f) {
    const n = g.index ? g.toNonIndexed() : g;
    f = { p: n.attributes.position.array, n: n.attributes.normal.array };
    flats.set(g, f);
  }
  return f;
}

function lcg(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

const _v = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _up = new THREE.Vector3(0, 1, 0);

// Builder: collects parts per material under a transform stack, then merges.
class Kit {
  constructor() {
    this.group = new THREE.Group();
    this.parts = new Map();
    this.frame = new THREE.Matrix4();
    this.stack = [];
    this.colliders = [];
    this.interact = [];
    this.screens = {};
    this.signs = [];
    this.blink = [];
    this.spin = [];
    this.lights = [];
  }
  push(x, y, z, ry = 0, rx = 0) {
    this.stack.push(this.frame.clone());
    _m.makeRotationFromEuler(_e.set(rx, ry, 0, 'YXZ')).setPosition(x, y, z);
    this.frame.multiply(_m);
    return this;
  }
  pop() { this.frame = this.stack.pop(); return this; }
  at(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(this.frame); }
  _add(g, mat, m) {
    let l = this.parts.get(mat);
    if (!l) this.parts.set(mat, (l = []));
    l.push(g, m.premultiply(this.frame));
  }
  put(g, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
    this._add(g, mat, new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'XYZ')), _s.set(sx, sy, sz)));
  }
  box(x0, y0, z0, x1, y1, z1, mat) {
    this.put(BOX(), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0);
  }
  solid(x0, y0, z0, x1, y1, z1, mat) { this.box(x0, y0, z0, x1, y1, z1, mat); this.block(x0, z0, x1, z1); }
  // Walking blocker: the footprint through the current frame, as an XZ box.
  block(x0, z0, x1, z1) {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
      _v.set(x, 0, z).applyMatrix4(this.frame);
      a = Math.min(a, _v.x); b = Math.min(b, _v.z); c = Math.max(c, _v.x); d = Math.max(d, _v.z);
    }
    const r = (n) => Math.round(n * 1000) / 1000;
    this.colliders.push({ x0: r(a), z0: r(b), x1: r(c), z1: r(d) });
  }
  cyl(x, z, r, y0, y1, mat, seg = 10) { this.put(CYL(seg), mat, x, (y0 + y1) / 2, z, 2 * r, y1 - y0, 2 * r); }
  rod(ax, ay, az, bx, by, bz, r, mat, seg = 6) {
    const d = new THREE.Vector3(bx - ax, by - ay, bz - az), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(_up, d.normalize());
    this._add(CYL(seg), mat, new THREE.Matrix4().compose(_v.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), q, _s.set(2 * r, len, 2 * r)));
  }
  // A separate mesh (sign, screen, lamp) placed through the frame.
  add(obj, x, y, z, ry = 0, rx = 0) {
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, 0, 'YXZ')), _s.set(1, 1, 1)).premultiply(this.frame);
    _m.decompose(obj.position, obj.quaternion, obj.scale);
    this.group.add(obj);
    return obj;
  }
  sign(text, w, x, y, z, ry = 0, rx = 0, opts = {}) {
    const m = label(text, w, opts);
    this.signs.push({ m, text, opts });
    return this.add(m, x, y, z, ry, rx);
  }
  use(id, lbl, x, y, z, r = 1.3) { this.interact.push({ id, label: lbl, pos: this.at(x, y, z), r }); }
  light(x, y, z, intensity, distance) {
    const l = new THREE.PointLight(0xffb27a, intensity * 0.35, distance, 2);
    this.lights.push(this.add(l, x, y, z));
    return l;
  }
  // A wall of thickness T centred on c, running along Z (alongZ) or X from s0
  // to s1, with openings {a, b, y0, y1}. Floor-level openings are doors; the
  // collider runs across any opening that has a sill.
  wall(alongZ, c, s0, s1, h, mat, holes = [], trim = null) {
    const piece = (a, b, y0, y1) => {
      if (b - a < 1e-3 || y1 - y0 < 1e-3) return;
      if (alongZ) this.box(c - T / 2, y0, a, c + T / 2, y1, b, mat);
      else this.box(a, y0, c - T / 2, b, y1, c + T / 2, mat);
    };
    const span = (a, b) => {
      if (b - a < 1e-3) return;
      if (alongZ) this.block(c - T / 2, a, c + T / 2, b); else this.block(a, c - T / 2, b, c + T / 2);
    };
    const hs = holes.map((o) => ({ y0: 0, y1: DOOR_H, ...o })).sort((p, q) => p.a - q.a);
    let s = s0;
    for (const o of hs) { piece(s, o.a, 0, h); piece(o.a, o.b, 0, o.y0); piece(o.a, o.b, o.y1, h); s = o.b; }
    piece(s, s1, 0, h);
    s = s0;
    for (const o of hs) if (o.y0 <= 0) { span(s, o.a); s = o.b; }
    span(s, s1);
    if (!trim) return;
    const w = 0.07, d = T / 2 + 0.03;
    const b = (a0, a1, y0, y1) => (alongZ ? this.box(c - d, y0, a0, c + d, y1, a1, trim) : this.box(a0, y0, c - d, a1, y1, c + d, trim));
    for (const o of hs) {
      if (o.y0 > 0) continue;
      b(o.a - w, o.a, 0, o.y1 + w); b(o.b, o.b + w, 0, o.y1 + w); b(o.a - w, o.b + w, o.y1, o.y1 + w);
    }
  }
  build() {
    const out = new Map();
    for (const [mat, l] of this.parts) {
      let n = 0;
      for (let i = 0; i < l.length; i += 2) n += flat(l[i]).p.length;
      const pos = new Float32Array(n), nor = new Float32Array(n);
      let o = 0;
      for (let i = 0; i < l.length; i += 2) {
        const f = flat(l[i]), e = l[i + 1].elements;
        const ne = _n.getNormalMatrix(l[i + 1]).elements;
        for (let j = 0; j < f.p.length; j += 3, o += 3) {
          const x = f.p[j], y = f.p[j + 1], z = f.p[j + 2];
          pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
          pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
          pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
          const a = f.n[j], b = f.n[j + 1], c = f.n[j + 2];
          const nx = ne[0] * a + ne[3] * b + ne[6] * c, ny = ne[1] * a + ne[4] * b + ne[7] * c, nz = ne[2] * a + ne[5] * b + ne[8] * c;
          const len = Math.hypot(nx, ny, nz) || 1;
          nor[o] = nx / len; nor[o + 1] = ny / len; nor[o + 2] = nz / len;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      out.set(mat, mesh);
    }
    this.parts.clear();
    return out;
  }
}

function idle(text, w, h) {
  return labelTexture(text, { w, h, bg: '#26283c', fg: '#f6f3e6', size: 44 });
}

// Signs are drawn when the ship is built; if the handwriting font was still
// loading, draw them again once it is in.
function redrawSigns(signs) {
  try {
    if (!signs.length || !document.fonts || document.fonts.check('40px "Patrick Hand"')) return;
    document.fonts.load('40px "Patrick Hand"').then(() => {
      for (const s of signs) {
        const old = s.m.material.map;
        s.m.material.map = labelTexture(s.text, s.opts);
        if (old) old.dispose();
      }
    }, () => {});
  } catch { /* no FontFaceSet: the cursive fallback stays */ }
}

// ---------- furniture (local frame: back against a wall at z = 0, facing +z) ----------

function lockers(k, n, P, o = {}) {
  const w = 0.7, d = 0.55, h = o.h ?? 2.0, col = o.color ?? C.steel, x0 = -n * w / 2;
  k.solid(x0, 0, 0, -x0, h, d, col);
  k.box(x0, 0, d, -x0, 0.08, d + 0.012, C.dark);
  for (let i = 0; i < n; i++) {
    const a = x0 + i * w;
    if (i) k.box(a - 0.008, 0.08, d, a + 0.008, h - 0.04, d + 0.012, C.dark);
    for (let v = 0; v < 3; v++) k.box(a + 0.2, h - 0.36 + v * 0.07, d, a + w - 0.2, h - 0.33 + v * 0.07, d + 0.012, C.dark);
    k.box(a + w - 0.15, 0.95, d, a + w - 0.1, 1.2, d + 0.04, C.dark);
    k.box(a + 0.14, 1.34, d, a + 0.36, 1.44, d + 0.012, i % 2 ? P : C.white);
  }
}

function crate(k, x, z, s, y = 0, col = C.wood) {
  const h = s / 2;
  k.box(x - h, y, z - h, x + h, y + s, z + h, col);
  for (const f of [0.16, 0.76]) k.box(x - h - 0.012, y + s * f, z - h - 0.012, x + h + 0.012, y + s * f + 0.07, z + h + 0.012, C.plank);
  if (y === 0) k.block(x - h, z - h, x + h, z + h);
}

// A cargo net in the plane z of the current frame, strands every 0.3 m.
function net(k, x0, x1, y0, y1, z = 0) {
  const nx = Math.max(2, Math.round((x1 - x0) / 0.3)), ny = Math.max(2, Math.round((y1 - y0) / 0.3));
  for (let i = 0; i <= nx; i++) { const x = x0 + (x1 - x0) * i / nx; k.box(x - 0.016, y0, z - 0.016, x + 0.016, y1, z + 0.016, C.net); }
  for (let j = 0; j <= ny; j++) { const y = y0 + (y1 - y0) * j / ny; k.box(x0, y - 0.016, z - 0.016, x1, y + 0.016, z + 0.016, C.net); }
}

function foldBunk(k, P) {
  k.box(-1.0, 0.48, 0, 1.0, 0.56, 0.8, C.steel);
  k.box(-1.0, 0.4, 0, 1.0, 0.48, 0.06, C.dark);
  k.box(-0.97, 0.56, 0.03, 0.97, 0.7, 0.77, C.cream);
  k.box(-0.35, 0.7, 0.02, 0.97, 0.74, 0.78, P);
  k.box(-0.92, 0.7, 0.12, -0.55, 0.8, 0.68, C.white);
  for (const x of [-0.95, 0.95]) k.rod(x, 0.56, 0.76, x, 1.55, 0.02, 0.014, C.dark, 4);
  k.block(-1.0, 0, 1.0, 0.8);
}

function bunkBed(k, top, bottom) {
  for (const x of [-1.0, 1.0]) for (const z of [0.03, 0.92]) k.box(x - 0.04, 0, z - 0.03, x + 0.04, 1.95, z + 0.03, C.wood);
  for (const y of [0.3, 1.35]) {
    k.box(-1.0, y, 0, 1.0, y + 0.1, 0.95, C.wood);
    k.box(-0.96, y + 0.1, 0.04, 0.96, y + 0.24, 0.91, C.cream);
    k.box(-0.3, y + 0.24, 0.03, 0.96, y + 0.28, 0.92, y > 1 ? top : bottom);
    k.box(-0.92, y + 0.24, 0.12, -0.58, y + 0.33, 0.83, C.white);
  }
  k.box(-1.0, 1.66, 0.89, 0.2, 1.72, 0.95, C.wood);
  for (const x of [0.55, 0.85]) k.box(x - 0.02, 0, 0.95, x + 0.02, 1.7, 0.99, C.wood);
  for (let y = 0.35; y < 1.7; y += 0.3) k.box(0.55, y, 0.95, 0.85, y + 0.03, 0.99, C.wood);
  k.block(-1.04, 0, 1.04, 1.0);
}

// Lofted college bed, ladder on the room side at x = ls * (0.6..0.95).
function loft(k, blanket, ls = -1) {
  for (const x of [-1.03, 1.03]) for (const z of [0.03, 0.97]) k.box(x - 0.04, 0, z - 0.03, x + 0.04, 2.25, z + 0.03, C.wood);
  k.box(-1.07, 1.5, 0, 1.07, 1.6, 1.0, C.wood);
  k.box(-1.02, 1.6, 0.03, 1.02, 1.76, 0.97, C.cream);
  k.box(ls < 0 ? -1.02 : -0.35, 1.76, 0.02, ls < 0 ? 0.35 : 1.02, 1.8, 0.98, blanket);
  k.box(-ls * 0.8 - 0.18, 1.76, 0.12, -ls * 0.8 + 0.18, 1.86, 0.86, C.white);
  k.box(ls < 0 ? -0.45 : -1.07, 2.0, 0.94, ls < 0 ? 1.07 : 0.45, 2.06, 1.0, C.wood);
  for (const x of [0.6, 0.95]) k.box(ls * x - 0.02, 0, 1.0, ls * x + 0.02, 2.0, 1.04, C.wood);
  for (let y = 0.3; y < 1.9; y += 0.3) k.box(ls < 0 ? -0.95 : 0.6, y, 1.0, ls < 0 ? -0.6 : 0.95, y + 0.03, 1.04, C.wood);
  k.block(-1.07, 0, 1.07, 1.04);
}

function lamp(k, x, y, z, shade) {
  k.cyl(x, z, 0.09, y, y + 0.03, C.dark, 8);
  k.rod(x, y + 0.03, z, x, y + 0.34, z + 0.1, 0.012, C.dark, 4);
  k.put(FRU(0.4, 10), shade, x, y + 0.4, z + 0.12, 0.26, 0.15, 0.26);
  k.put(OCT(), G.lamp, x, y + 0.31, z + 0.12, 0.09, 0.09, 0.09);
}

function desk(k, w, col, lampX, shade) {
  const h = w / 2;
  k.box(-h, 0.72, 0, h, 0.77, 0.62, col);
  k.box(-h, 0, 0.02, -h + 0.05, 0.72, 0.6, col);
  k.box(h - 0.05, 0, 0.02, h, 0.72, 0.6, col);
  const dx = lampX > 0 ? -h + 0.05 : h - 0.45;
  k.box(dx, 0.1, 0.02, dx + 0.4, 0.72, 0.58, col);
  for (const y of [0.3, 0.52]) k.box(dx + 0.05, y, 0.58, dx + 0.35, y + 0.02, 0.6, C.dark);
  const lx = -lampX * 0.3;
  k.box(lx - 0.2, 0.77, 0.12, lx + 0.2, 0.79, 0.4, C.dark);
  k.push(lx, 0.79, 0.13, 0, -0.25);
  k.box(-0.2, 0, -0.012, 0.2, 0.26, 0.004, C.dark);
  k.box(-0.17, 0.03, 0.004, 0.17, 0.23, 0.008, G.blue);
  k.pop();
  for (let i = 0; i < 3; i++) k.box(lampX - 0.3 + i * 0.05, 0.77, 0.05, lampX - 0.26 + i * 0.05, 1.0 - i * 0.03, 0.26, [C.teal, C.orange, C.pink][i]);
  lamp(k, lampX, 0.77, 0.2, shade);
  k.block(-h, 0, h, 0.62);
}

// Chair facing -z (its back at +z).
function chair(k, x, z, ry, col) {
  k.push(x, 0, z, ry);
  k.cyl(0, 0, 0.22, 0, 0.04, C.dark, 8);
  k.cyl(0, 0, 0.04, 0.04, 0.45, C.dark, 6);
  k.box(-0.22, 0.45, -0.22, 0.22, 0.52, 0.22, col);
  k.box(-0.22, 0.52, 0.17, 0.22, 0.95, 0.22, col);
  k.block(-0.22, -0.22, 0.22, 0.22);
  k.pop();
}

function miniFridge(k, P) {
  k.solid(-0.25, 0, 0, 0.25, 0.82, 0.5, C.white);
  k.box(-0.25, 0.6, 0.5, 0.25, 0.61, 0.51, C.dark);
  k.box(0.16, 0.3, 0.5, 0.2, 0.55, 0.54, C.dark);
  k.box(-0.16, 0.3, 0.5, -0.04, 0.42, 0.51, P);
  k.box(-0.22, 0.82, 0.04, 0.22, 1.08, 0.42, C.steel);
  k.box(-0.18, 0.86, 0.42, 0.06, 1.04, 0.43, C.dark);
}

function basket(k, x, z, col) {
  k.cyl(x, z, 0.24, 0, 0.42, col, 10);
  k.put(TOR(0.24, 0.025, 12), C.white, x, 0.42, z, 1, 1, 1, HP, 0, 0);
  k.put(BOX(), C.pink, x - 0.05, 0.44, z + 0.03, 0.22, 0.1, 0.16, 0.3, 0.4, 0.2);
  k.put(BOX(), C.teal, x + 0.08, 0.47, z - 0.06, 0.18, 0.08, 0.14, -0.2, 0.9, 0.4);
  k.block(x - 0.24, z - 0.24, x + 0.24, z + 0.24);
}

// String lights along local x at depth z, sagging between three hooks.
function stringLights(k, x0, x1, y, z, mat) {
  const n = Math.max(4, Math.round((x1 - x0) / 0.3));
  let px = x0, py = y;
  for (let i = 1; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, yy = y - 0.14 * Math.abs(Math.sin(t * PI * 2));
    k.rod(px, py, z, x, yy, z, 0.007, C.dark, 3);
    if (i < n) k.put(OCT(), i % 2 ? mat : G.str1 === mat ? G.str2 : G.str1, x, yy - 0.05, z, 0.07, 0.1, 0.07);
    px = x; py = yy;
  }
}

function rug(k, x0, z0, x1, z1, col, edge) {
  k.box(x0, 0, z0, x1, 0.014, z1, edge);
  k.box(x0 + 0.1, 0, z0 + 0.1, x1 - 0.1, 0.02, z1 - 0.1, col);
}

// Poster on the wall plane z = 0 of the current frame.
function poster(k, x, y, w, h, bg, fg, kind = 0) {
  k.box(x - w / 2, y - h / 2, 0, x + w / 2, y + h / 2, 0.015, bg);
  if (kind === 0) k.put(CYL(12), fg, x, y + h * 0.08, 0.02, w * 0.5, 0.01, w * 0.5, HP, 0, 0);
  if (kind === 1) for (let i = 0; i < 3; i++) k.box(x - w * 0.36, y - h * 0.3 + i * h * 0.22, 0.015, x + w * 0.36, y - h * 0.3 + i * h * 0.22 + h * 0.08, 0.022, fg);
  if (kind === 2) k.put(BOX(), fg, x, y - h * 0.12, 0.02, w * 0.46, w * 0.46, 0.01, 0, 0, PI / 4);
}

function textPoster(k, text, x, y, w, bg, fg) {
  k.sign(text, w, x, y, 0.012, 0, 0, { w: 256, h: 112, bg, fg, size: 34 });
}

function toilet(k) {
  k.box(-0.2, 0.42, 0, 0.2, 0.8, 0.18, C.white);
  k.box(-0.21, 0.8, -0.005, 0.21, 0.84, 0.19, C.white);
  k.box(-0.035, 0.84, 0.07, 0.035, 0.86, 0.12, G.teal);
  k.cyl(0, 0.36, 0.12, 0, 0.16, C.white, 10);
  k.cyl(0, 0.42, 0.2, 0.16, 0.4, C.white, 12);
  k.cyl(0, 0.44, 0.13, 0.4, 0.405, C.glass, 12);
  k.put(TOR(0.16, 0.03, 14), C.cream, 0, 0.42, 0.43, 1, 1, 1, HP, 0, 0);
  k.box(-0.17, 0.43, 0.18, 0.17, 0.78, 0.21, C.cream);
  k.block(-0.22, 0, 0.22, 0.64);
}

function vanity(k, w, n) {
  const h = w / 2;
  k.solid(-h, 0, 0, h, 0.82, 0.52, C.wood);
  k.box(-h - 0.02, 0.82, 0, h + 0.02, 0.87, 0.56, C.white);
  for (let i = 0; i < n; i++) {
    const x = -h + w * (i + 0.5) / n;
    k.cyl(x, 0.3, 0.17, 0.87, 0.875, C.glass, 12);
    k.put(TOR(0.17, 0.02, 14), C.white, x, 0.875, 0.3, 1, 1, 1, HP, 0, 0);
    k.rod(x, 0.87, 0.07, x, 1.02, 0.07, 0.02, C.steel, 6);
    k.rod(x, 1.02, 0.07, x, 0.98, 0.18, 0.018, C.steel, 6);
    k.box(x - 0.31, 1.18, 0, x + 0.31, 1.9, 0.02, C.steel);
    k.box(x - 0.27, 1.22, 0.02, x + 0.27, 1.86, 0.03, C.mirror);
    k.put(BOX(), C.white, x + 0.08, 1.6, 0.034, 0.02, 0.36, 0.004, 0, 0, 0.6);
    k.put(BOX(), C.white, x + 0.16, 1.56, 0.034, 0.015, 0.2, 0.004, 0, 0, 0.6);
    if (i) k.box(x - w / n / 2 - 0.006, 0.08, 0.52, x - w / n / 2 + 0.006, 0.78, 0.53, C.plank);
    k.box(x - 0.08, 0.66, 0.52, x + 0.08, 0.68, 0.55, C.steel);
  }
}

function stove(k, H) {
  k.solid(-0.4, 0, 0, 0.4, 0.88, 0.62, C.white);
  k.box(-0.4, 0.88, 0, 0.4, 0.9, 0.62, C.dark);
  for (const [x, z] of [[-0.18, 0.17], [0.18, 0.17], [-0.18, 0.45], [0.18, 0.45]]) k.put(TOR(0.075, 0.016, 10), C.black, x, 0.905, z, 1, 1, 1, HP, 0, 0);
  for (let i = 0; i < 4; i++) k.put(CYL(8), C.dark, -0.27 + i * 0.18, 0.8, 0.63, 0.05, 0.03, 0.05, HP, 0, 0);
  k.box(-0.28, 0.24, 0.62, 0.28, 0.58, 0.63, C.dark);
  k.rod(-0.3, 0.66, 0.66, 0.3, 0.66, 0.66, 0.016, C.steel, 6);
  k.cyl(0.18, 0.45, 0.13, 0.905, 1.06, C.steel, 10);
  k.cyl(0.18, 0.45, 0.03, 1.06, 1.1, C.dark, 6);
  k.cyl(-0.18, 0.17, 0.13, 0.905, 0.94, C.dark, 10);
  k.rod(-0.3, 0.925, 0.17, -0.5, 0.94, 0.17, 0.018, C.dark, 5);
  k.box(-0.25, 0.94, 0.11, -0.12, 0.96, 0.23, C.yellow);
  k.box(-0.45, 1.75, 0, 0.45, 1.95, 0.5, C.steel);
  k.box(-0.2, 1.95, 0, 0.2, H, 0.25, C.steel);
}

function fridge(k, P) {
  k.solid(-0.45, 0, 0, 0.45, 1.95, 0.72, C.white);
  k.box(-0.45, 1.3, 0.72, 0.45, 1.31, 0.73, C.dark);
  k.box(0.33, 1.4, 0.72, 0.37, 1.75, 0.77, C.steel);
  k.box(0.33, 0.7, 0.72, 0.37, 1.2, 0.77, C.steel);
  k.box(-0.32, 0.9, 0.72, -0.06, 1.2, 0.726, C.cream);
  k.put(CYL(10), C.orange, -0.2, 1.05, 0.73, 0.1, 0.01, 0.1, HP, 0, 0);
  k.box(-0.3, 1.5, 0.72, -0.24, 1.56, 0.74, P);
  k.box(-0.18, 1.62, 0.72, -0.12, 1.68, 0.74, C.teal);
}

function counter(k, w, sink = false) {
  const h = w / 2, n = Math.max(1, Math.round(w / 0.6));
  k.solid(-h, 0, 0, h, 0.86, 0.6, C.wood);
  k.box(-h, 0.86, 0, h, 0.9, 0.63, C.cream);
  for (let i = 1; i < n; i++) { const x = -h + w * i / n; k.box(x - 0.006, 0.08, 0.6, x + 0.006, 0.8, 0.61, C.plank); }
  for (let i = 0; i < n; i++) { const x = -h + w * (i + 0.5) / n; k.box(x - 0.08, 0.7, 0.6, x + 0.08, 0.72, 0.63, C.steel); }
  if (!sink) return;
  k.box(-0.3, 0.9, 0.12, 0.3, 0.905, 0.5, C.steel);
  k.rod(0, 0.9, 0.06, 0, 1.12, 0.06, 0.02, C.steel, 6);
  k.rod(0, 1.12, 0.06, 0, 1.08, 0.24, 0.018, C.steel, 6);
}

function upper(k, w) {
  const h = w / 2, n = Math.max(1, Math.round(w / 0.6));
  k.box(-h, 1.6, 0, h, 2.3, 0.35, C.wood);
  for (let i = 1; i < n; i++) { const x = -h + w * i / n; k.box(x - 0.006, 1.64, 0.35, x + 0.006, 2.26, 0.36, C.plank); }
  for (let i = 0; i < n; i++) { const x = -h + w * (i + 0.5) / n; k.box(x - 0.08, 1.66, 0.35, x + 0.08, 1.68, 0.38, C.steel); }
}

function table(k, x0, z0, x1, z1, col, h = 0.76) {
  k.box(x0, h - 0.05, z0, x1, h, z1, col);
  for (const x of [x0 + 0.06, x1 - 0.06]) for (const z of [z0 + 0.06, z1 - 0.06]) k.box(x - 0.035, 0, z - 0.035, x + 0.035, h - 0.05, z + 0.035, C.dark);
  k.block(x0, z0, x1, z1);
}

// Sofa facing +z, back at z 0..0.24.
function sofa(k, w, col) {
  const h = w / 2, n = Math.max(2, Math.round((w - 0.36) / 0.9)), cw = (w - 0.36) / n;
  k.box(-h, 0.1, 0, h, 0.4, 0.9, col);
  k.box(-h, 0.4, 0, h, 0.88, 0.24, col);
  k.box(-h, 0.4, 0.24, -h + 0.18, 0.64, 0.9, col);
  k.box(h - 0.18, 0.4, 0.24, h, 0.64, 0.9, col);
  for (let i = 0; i < n; i++) { const a = -h + 0.18 + cw * i; k.box(a + 0.02, 0.4, 0.26, a + cw - 0.02, 0.5, 0.88, C.cream); }
  k.put(BOX(), C.white, -h + 0.45, 0.66, 0.34, 0.4, 0.34, 0.12, -0.25, 0, 0.12);
  for (const x of [-h + 0.06, h - 0.06]) for (const z of [0.06, 0.84]) k.box(x - 0.04, 0, z - 0.04, x + 0.04, 0.1, z + 0.04, C.dark);
  k.block(-h, 0, h, 0.9);
}

function beanbag(k, x, z, col) {
  k.cyl(x, z, 0.42, 0, 0.26, col, 10);
  k.put(CYL(10), col, x, 0.34, z + 0.14, 0.62, 0.22, 0.5, -0.3, 0, 0);
  k.block(x - 0.42, z - 0.42, x + 0.42, z + 0.42);
}

function plant(k, x, z, s = 1) {
  k.cyl(x, z, 0.2 * s, 0, 0.36 * s, C.terra, 8);
  k.cyl(x, z, 0.17 * s, 0.36 * s, 0.38 * s, C.plank, 8);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.2566;
    k.put(CONE(5), C.green, x + Math.cos(a) * 0.08 * s, 0.7 * s, z + Math.sin(a) * 0.08 * s, 0.16 * s, 0.7 * s, 0.16 * s, Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
  }
  k.block(x - 0.2 * s, z - 0.2 * s, x + 0.2 * s, z + 0.2 * s);
}

function bookshelf(k, w, seed) {
  const h = w / 2, rnd = lcg(seed), cols = [C.teal, C.orange, C.pink, C.blue, C.green, C.cream, C.dark];
  k.box(-h, 0, 0, h, 1.9, 0.03, C.wood);
  k.box(-h, 0, 0, -h + 0.04, 1.9, 0.35, C.wood);
  k.box(h - 0.04, 0, 0, h, 1.9, 0.35, C.wood);
  for (const y of [0, 0.46, 0.92, 1.38, 1.86]) k.box(-h, y, 0, h, y + 0.04, 0.35, C.wood);
  for (const y of [0.04, 0.5, 0.96, 1.42]) {
    let x = -h + 0.06;
    while (x < h - 0.12) {
      const bw = 0.04 + rnd() * 0.05, bh = 0.24 + rnd() * 0.14;
      if (x + bw > h - 0.05) break;
      k.box(x, y, 0.05, x + bw, y + bh, 0.3, cols[Math.floor(rnd() * cols.length)]);
      x += bw + 0.005 + (rnd() < 0.12 ? 0.12 : 0);
    }
  }
  k.block(-h, 0, h, 0.35);
}

// Warehouse rack: blue uprights, orange beams, boxes on three decks.
function rack(k, w, seed) {
  const h = w / 2, d = 0.7, rnd = lcg(seed), cols = [C.wood, C.cream, C.teal, C.white, C.plank];
  for (const x of [-h + 0.04, h - 0.04]) for (const z of [0.04, d - 0.04]) k.box(x - 0.04, 0, z - 0.04, x + 0.04, 2.3, z + 0.04, C.blue);
  for (const y of [0.12, 0.95, 1.78]) {
    k.box(-h, y, 0, h, y + 0.08, 0.06, C.orange);
    k.box(-h, y, d - 0.06, h, y + 0.08, d, C.orange);
    k.box(-h + 0.04, y + 0.06, 0.04, h - 0.04, y + 0.09, d - 0.04, C.grey);
    let x = -h + 0.1;
    while (x < h - 0.4) {
      const bw = 0.35 + rnd() * 0.35, bh = 0.3 + rnd() * 0.36;
      if (x + bw > h - 0.08) break;
      k.box(x, y + 0.09, 0.1, x + bw, y + 0.09 + bh, d - 0.12, cols[Math.floor(rnd() * cols.length)]);
      x += bw + 0.06 + rnd() * 0.12;
    }
  }
  k.block(-h, 0, h, d);
}

function washer(k, glassy) {
  k.solid(-0.32, 0, 0, 0.32, 0.88, 0.62, C.white);
  k.put(CYL(14), C.steel, 0, 0.45, 0.625, 0.46, 0.02, 0.46, HP, 0, 0);
  k.put(CYL(14), glassy ? C.glass : C.dark, 0, 0.45, 0.64, 0.36, 0.02, 0.36, HP, 0, 0);
  k.box(-0.3, 0.74, 0.62, 0.3, 0.86, 0.63, C.steel);
  k.box(0.16, 0.78, 0.63, 0.24, 0.82, 0.64, G.green);
}

function suits(k, n, P) {
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.8;
    k.box(x - 0.04, 1.95, 0, x + 0.04, 2.0, 0.3, C.steel);
    k.box(x - 0.24, 1.05, 0.1, x + 0.24, 1.6, 0.4, C.white);
    k.box(x - 0.2, 1.12, 0.02, x + 0.2, 1.56, 0.1, C.grey);
    k.put(CYL(10), C.white, x, 1.8, 0.25, 0.36, 0.34, 0.36);
    k.box(x - 0.13, 1.74, 0.42, x + 0.13, 1.87, 0.44, C.glass);
    k.box(x - 0.1, 1.32, 0.4, x + 0.1, 1.44, 0.42, P);
    for (const s of [-1, 1]) {
      k.box(x + s * 0.3 - 0.06, 1.0, 0.16, x + s * 0.3 + 0.06, 1.56, 0.34, C.white);
      k.box(x + s * 0.12 - 0.09, 0.3, 0.16, x + s * 0.12 + 0.09, 1.05, 0.36, C.white);
      k.box(x + s * 0.12 - 0.1, 0.16, 0.14, x + s * 0.12 + 0.1, 0.3, 0.4, C.dark);
    }
  }
  k.block(-n * 0.4, 0, n * 0.4, 0.45);
}

function workbench(k, w) {
  const h = w / 2;
  k.solid(-h, 0, 0, h, 0.88, 0.7, C.wood);
  k.box(-h, 0.88, 0, h, 0.93, 0.72, C.steel);
  k.box(-h + 0.1, 1.2, 0, h - 0.1, 2.1, 0.03, C.cream);
  const tools = [C.dark, C.orange, C.teal, C.dark, C.pink, C.steel];
  for (let i = 0; i < tools.length; i++) k.box(-h + 0.3 + i * (w - 0.6) / tools.length, 1.4 + (i % 2) * 0.25, 0.03, -h + 0.36 + i * (w - 0.6) / tools.length, 1.85, 0.06, tools[i]);
  k.box(h - 0.45, 0.93, 0.2, h - 0.2, 1.08, 0.45, C.dark);
  k.put(BOX(), C.white, -0.2, 0.95, 0.35, 0.9, 0.02, 0.08, 0, 0.6, 0);
}

function droneMock(k, x, z) {
  k.box(x - 0.22, 0.2, z - 0.28, x + 0.22, 0.42, z + 0.28, C.white);
  k.box(x - 0.08, 0.22, z - 0.34, x + 0.08, 0.34, z - 0.28, C.dark);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    k.rod(x, 0.36, z, x + sx * 0.52, 0.4, z + sz * 0.52, 0.03, C.dark, 5);
    k.cyl(x + sx * 0.52, z + sz * 0.52, 0.05, 0.38, 0.46, C.dark, 6);
    k.cyl(x + sx * 0.52, z + sz * 0.52, 0.26, 0.46, 0.475, C.glass, 12);
  }
  for (const sx of [-0.18, 0.18]) {
    k.rod(x + sx, 0.04, z - 0.3, x + sx, 0.04, z + 0.3, 0.02, C.dark, 4);
    k.rod(x + sx, 0.04, z, x + sx * 0.8, 0.22, z, 0.015, C.dark, 4);
  }
  k.block(x - 0.8, z - 0.8, x + 0.8, z + 0.8);
}

function foosball(k, x, z) {
  k.box(x - 0.7, 0.55, z - 0.4, x + 0.7, 0.9, z + 0.4, C.wood);
  k.box(x - 0.64, 0.9, z - 0.34, x + 0.64, 0.905, z + 0.34, C.green);
  for (const sx of [-0.62, 0.62]) for (const sz of [-0.32, 0.32]) k.box(x + sx - 0.04, 0, z + sz - 0.04, x + sx + 0.04, 0.55, z + sz + 0.04, C.dark);
  for (let i = 0; i < 6; i++) {
    const rx = x - 0.55 + i * 0.22;
    k.rod(rx, 0.98, z - 0.6, rx, 0.98, z + 0.6, 0.012, C.steel, 4);
    k.cyl(rx, z + (i % 2 ? 0.62 : -0.62), 0.03, 0.94, 1.02, C.black, 6);
    for (const m of [-0.15, 0.15]) k.box(rx - 0.025, 0.91, z + m - 0.03, rx + 0.025, 1.03, z + m + 0.03, i % 2 ? C.blue : C.orange);
  }
  k.block(x - 0.7, z - 0.62, x + 0.7, z + 0.62);
}

function jukebox(k) {
  k.solid(-0.4, 0, 0, 0.4, 1.3, 0.5, C.wood);
  k.put(CYL(12), C.wood, 0, 1.3, 0.25, 0.8, 0.5, 0.8, HP, 0, 0);
  k.put(TOR(0.3, 0.035, 14), G.orange, 0, 1.3, 0.51, 1, 1, 1);
  k.box(-0.26, 1.02, 0.5, 0.26, 1.26, 0.51, G.yellow);
  k.box(-0.28, 0.2, 0.5, 0.28, 0.72, 0.51, C.dark);
  for (let i = 0; i < 5; i++) k.box(-0.24 + i * 0.1, 0.82, 0.5, -0.18 + i * 0.1, 0.88, 0.53, [C.pink, C.teal, C.white, C.teal, C.pink][i]);
}

function droneBay(k, x, z, s, px, pz) {
  const h = s / 2;
  k.box(x - h - 0.1, 0, z - h - 0.1, x + h + 0.1, 0.012, z + h + 0.1, C.yellow);
  k.box(x - h, 0, z - h, x + h, 0.02, z + h, C.dark);
  k.box(x - 0.012, 0, z - h, x + 0.012, 0.026, z + h, C.black);
  for (const i of [-1, 1]) k.box(x + i * h * 0.5 - 0.1, 0.02, z - 0.04, x + i * h * 0.5 + 0.1, 0.03, z + 0.04, C.steel);
  k.solid(px - 0.2, 0, pz - 0.2, px + 0.2, 0.95, pz + 0.2, C.steel);
  k.box(px - 0.14, 0.95, pz - 0.14, px + 0.14, 0.99, pz + 0.14, C.dark);
  k.put(CYL(10), G.orange, px, 1.02, pz, 0.14, 0.06, 0.14);
  k.use('drone', 'launch the drone', px, 1.0, pz, 1.4);
}

// ---------- shell, cockpit, breach ----------

function shell(k, s, P) {
  const hw = s.W / 2, hl = s.L / 2, H = s.H, b = s.breach;
  k.box(-hw, -T, -hl, hw, 0, hl, C.floor);
  k.box(-hw, H, -hl, hw, H + T, hl, C.ceil);
  const bh = { a: b.z - 0.6, b: b.z + 0.6, y0: 0.3, y1: 2.1 };
  k.wall(true, -hw + T / 2, -hl + T, hl - T, H, C.wall, b.side < 0 ? [bh] : []);
  k.wall(true, hw - T / 2, -hl + T, hl - T, H, C.wall, b.side > 0 ? [bh] : []);
  const wy1 = H - 0.3, w = s.win / 2, zf = -hl + T;
  k.wall(false, -hl + T / 2, -hw, hw, H, C.wall, [{ a: -w, b: w, y0: 0.9, y1: wy1 }]);
  k.wall(false, hl - T / 2, -hw, hw, H, C.wall);
  k.box(-w - 0.08, 0.84, zf, w + 0.08, 0.9, zf + 0.14, P);
  k.box(-w - 0.08, wy1, zf, w + 0.08, wy1 + 0.06, zf + 0.06, P);
  k.box(-w - 0.08, 0.9, zf, -w, wy1, zf + 0.06, P);
  k.box(w, 0.9, zf, w + 0.08, wy1, zf + 0.06, P);
}

// Gev's sketch: nav screen hanging above a wide window, yoke with a cross of
// spokes on a column, MP4 console angled in on the left, music console on the
// right, low dashboard between, pilot seat behind the yoke.
function cockpit(k, s, P) {
  const H = s.H, zf = -s.L / 2 + T, F = (d) => zf + d;
  k.box(-0.5, H - 0.03, F(2.5), 0.5, H, F(3.0), G.lamp);
  // dashboard
  k.solid(-0.62, 0, F(0), 0.62, 0.6, F(0.4), C.white);
  k.box(-0.62, 0.28, F(0.4), 0.62, 0.34, F(0.415), P);
  k.push(0, 0.62, F(0.22), 0, 0.35);
  k.box(-0.64, -0.03, -0.24, 0.64, 0.03, 0.24, C.dark);
  const lit = [G.yellow, G.teal, G.pink, G.green, G.orange];
  for (let i = 0; i < 5; i++) { const x = -0.44 + i * 0.22; k.box(x - 0.05, 0.03, -0.14, x + 0.05, 0.055, -0.06, lit[i]); }
  for (let i = 0; i < 3; i++) k.put(CYL(10), C.white, -0.3 + i * 0.3, 0.05, 0.1, 0.1, 0.04, 0.1);
  const led = new THREE.Mesh(geo('led', () => new THREE.BoxGeometry(0.05, 0.03, 0.05)), G.red);
  k.add(led, 0.52, 0.05, 0.1);
  k.blink.push(led);
  k.pop();
  // consoles: left plays MP4s, right is the music desk
  for (const side of [-1, 1]) {
    k.push(side * 1.66, 0, F(0.45), -side * 0.7);
    k.solid(-0.38, 0, -0.25, 0.38, 0.78, 0.25, C.white);
    k.box(-0.38, 0.3, 0.25, 0.38, 0.35, 0.262, P);
    k.push(0, 0.8, 0.02, 0, 0.35);
    k.box(-0.4, -0.03, -0.28, 0.4, 0.03, 0.28, C.dark);
    if (side < 0) {
      for (let i = 0; i < 4; i++) k.box(-0.3 + i * 0.16, 0.03, 0.02, -0.2 + i * 0.16, 0.055, 0.12, [G.pink, G.teal, G.yellow, G.green][i]);
    } else {
      const knob = [C.white, P, C.teal, C.pink, C.white], at = [-0.1, 0.08, -0.02, 0.12, -0.14];
      for (let i = 0; i < 5; i++) {
        const x = -0.28 + i * 0.14;
        k.box(x - 0.012, 0.03, -0.21, x + 0.012, 0.042, 0.21, C.black);
        k.box(x - 0.045, 0.03, at[i] - 0.03, x + 0.045, 0.09, at[i] + 0.03, knob[i]);
      }
    }
    k.pop();
    k.box(-0.04, 0.8, -0.2, 0.04, 1.02, -0.14, C.steel);
    if (side < 0) {
      k.box(-0.4, 1.0, -0.21, 0.4, 1.47, -0.15, C.dark);
      const main = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.405), screen(idle('MP4', 256, 144)));
      k.add(main, 0, 1.235, -0.148);
      k.screens.main = main;
      // the MP4 label button on the front face
      k.box(-0.21, 0.5, 0.25, 0.21, 0.66, 0.29, G.orange);
      k.sign('MP4', 0.34, 0, 0.58, 0.292);
      k.use('media', 'watch the MP4 screen', 0, 1.2, -0.1, 1.6);
    } else {
      k.box(-0.34, 0.98, -0.21, 0.34, 1.26, -0.15, C.dark);
      const eq = [0.1, 0.18, 0.13, 0.22, 0.08, 0.16, 0.2, 0.11];
      for (let i = 0; i < eq.length; i++) { const x = -0.28 + i * 0.08; k.box(x - 0.03, 1.02, -0.15, x + 0.03, 1.02 + eq[i], -0.143, i % 2 ? G.green : G.teal); }
      k.box(-0.27, 1.26, -0.2, 0.27, 1.41, -0.186, C.dark);
      k.sign('MUSIC', 0.5, 0, 1.335, -0.184);
      k.put(CYL(12), C.black, 0, 0.55, 0.26, 0.3, 0.03, 0.3, HP, 0, 0);
      k.use('music', 'next song', 0, 1.1, -0.1, 1.6);
    }
    k.pop();
  }
  // nav screen hanging above the window, tilted down at the pilot
  const ny = 2.0, nz = F(0.45);
  for (const x of [-0.5, 0.5]) k.rod(x, H, nz + 0.08, x, ny + 0.33, nz + 0.08, 0.016, C.steel, 5);
  k.push(0, ny, nz, 0, 0.35);
  k.box(-0.66, -0.47, -0.07, 0.66, 0.35, -0.01, C.dark);
  const nav = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), screen(idle('NAV', 256, 128)));
  k.add(nav, 0, 0.02, -0.005);
  k.sign('NAV', 0.34, 0, -0.38, -0.006);
  k.pop();
  k.screens.nav = nav;
  k.use('nav', 'open the star map', 0, 1.9, F(0.55), 1.4);
  // yoke: column, shaft, wheel with a cross of spokes
  const yz = F(1.35), wz = F(1.62), wy = 0.86;
  k.box(-0.14, 0, yz - 0.12, 0.14, 0.04, yz + 0.12, C.dark);
  k.cyl(0, yz, 0.055, 0.04, wy - 0.06, C.steel, 8);
  k.rod(0, wy - 0.08, yz, 0, wy, wz - 0.02, 0.04, C.steel, 8);
  k.put(TOR(0.19, 0.03, 18), C.dark, 0, wy, wz, 1, 1, 1);
  k.box(-0.18, wy - 0.015, wz - 0.015, 0.18, wy + 0.015, wz + 0.015, C.steel);
  k.box(-0.015, wy - 0.18, wz - 0.015, 0.015, wy + 0.18, wz + 0.015, C.steel);
  k.put(CYL(10), P, 0, wy, wz, 0.1, 0.07, 0.1, HP, 0, 0);
  for (const x of [-0.19, 0.19]) k.box(x - 0.035, wy - 0.06, wz - 0.02, x + 0.035, wy + 0.06, wz + 0.02, C.black);
  // pilot seat
  const sz = F(2.25);
  k.cyl(0, sz, 0.09, 0, 0.4, C.steel, 8);
  k.box(-0.3, 0.38, sz - 0.25, 0.3, 0.42, sz + 0.25, C.dark);
  k.box(-0.3, 0.42, sz - 0.25, 0.3, 0.56, sz + 0.22, P);
  for (const x of [-0.33, 0.33]) k.box(x - 0.03, 0.56, sz - 0.18, x + 0.03, 0.64, sz + 0.2, C.dark);
  k.push(0, 0.56, sz + 0.28, 0, 0.12);
  k.box(-0.3, 0, -0.06, 0.3, 0.72, 0.06, P);
  k.box(-0.15, 0.74, -0.04, 0.15, 0.84, 0.04, C.dark);
  k.pop();
  k.block(-0.36, F(1.22), 0.36, F(2.62));
  k.use('helm', 'sit at the helm', 0, 1.0, F(2.3), 1.4);
  helmGear(k, s, P, F, sz);
  return { spawn: new THREE.Vector3(0, 0, F(3.55)), seat: { pos: new THREE.Vector3(0, 1.2, sz) } };
}

// ---- the flight deck: screen banks on the side walls (low and mid height,
// never on the ceiling) and the gear a real cockpit has around the seat ----
const PANEL_KINDS = ['radar', 'hull', 'log', 'wave', 'stars', 'cams', 'fuel', 'grid'];
const panelCache = new Map();
function panelTex(kind) {
  if (panelCache.has(kind)) return panelCache.get(kind);
  const W = 256, H = 160, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  let seed = kind.length * 9301 + kind.charCodeAt(0) * 49297;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = '#070a12'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#1b2a44'; g.lineWidth = 1;
  for (let x = 0; x < W; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.font = '15px "Patrick Hand", cursive';
  const cyan = '#4deeff', pink = '#ff4de1', amber = '#ffc23c', red = '#ff3b5c', green = '#5dff9a';
  g.lineWidth = 2;
  if (kind === 'radar') {
    g.strokeStyle = cyan;
    for (const r of [22, 44, 66]) { g.beginPath(); g.arc(90, 80, r, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(90, 80); g.lineTo(150, 40); g.stroke();
    g.fillStyle = red; for (let i = 0; i < 5; i++) g.fillRect(40 + rnd() * 100, 25 + rnd() * 110, 5, 5);
    g.fillStyle = cyan; g.fillText('CONTACTS 5', 170, 40); g.fillText('RANGE 12 ku', 170, 62);
  } else if (kind === 'hull') {
    g.strokeStyle = cyan; g.strokeRect(30, 50, 110, 60); g.beginPath(); g.moveTo(140, 50); g.lineTo(175, 80); g.lineTo(140, 110); g.stroke();
    const bars = [['HULL', 0.92, green], ['SHIELD', 0.7, cyan], ['AIR', 1, cyan], ['HEAT', 0.3, amber]];
    bars.forEach(([t, v, col], i) => { g.fillStyle = col; g.fillText(t, 186, 30 + i * 32); g.fillRect(186, 36 + i * 32, 60 * v, 6); });
  } else if (kind === 'log') {
    const lines = ['> pump 3: ION refused', '> SPIRAL BOUND GALACTIC', '  thanks you for waiting', '> red guys: 2 wings', '> hold music: track 4', '> nav: course plotted', '> air: nominal'];
    lines.forEach((t, i) => { g.fillStyle = i === 1 ? pink : cyan; g.fillText(t, 12, 24 + i * 20); });
  } else if (kind === 'wave') {
    for (const [col, amp, f] of [[cyan, 30, 0.06], [pink, 18, 0.11]]) {
      g.strokeStyle = col; g.beginPath();
      for (let x = 0; x <= W; x += 4) { const y = 80 + Math.sin(x * f) * amp * (0.6 + 0.4 * Math.sin(x * 0.013)); if (x) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
    g.fillStyle = amber; g.fillText('ENGINE HARMONICS', 12, 150);
  } else if (kind === 'stars') {
    for (let i = 0; i < 70; i++) { g.fillStyle = rnd() > 0.85 ? amber : '#cfe8ff'; g.fillRect(rnd() * W, rnd() * H, 2, 2); }
    g.strokeStyle = pink; g.beginPath(); g.moveTo(30, 130); g.lineTo(120, 70); g.lineTo(210, 90); g.stroke();
    g.fillStyle = pink; g.fillText('COURSE', 180, 150);
  } else if (kind === 'cams') {
    for (let i = 0; i < 4; i++) {
      const x = 10 + (i % 2) * 124, y = 8 + Math.floor(i / 2) * 76;
      for (let n = 0; n < 220; n++) { const v = Math.floor(rnd() * 90); g.fillStyle = `rgb(${v},${v},${v + 20})`; g.fillRect(x + rnd() * 116, y + rnd() * 68, 2, 2); }
      g.strokeStyle = cyan; g.strokeRect(x, y, 116, 68); g.fillStyle = cyan; g.fillText('CAM ' + (i + 1), x + 6, y + 18);
    }
  } else if (kind === 'fuel') {
    g.fillStyle = amber; g.fillText('FUEL MIX', 12, 24);
    ['ION', 'PLASMA', 'DEUT'].forEach((t, i) => { g.strokeStyle = cyan; g.strokeRect(20 + i * 78, 40, 52, 100); g.fillStyle = [cyan, pink, amber][i]; const v = [0.8, 0.35, 0.1][i]; g.fillRect(22 + i * 78, 138 - 96 * v, 48, 96 * v); g.fillText(t, 22 + i * 78, 156); });
  } else {
    g.strokeStyle = green;
    for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(rnd() * W, rnd() * H); g.lineTo(rnd() * W, rnd() * H); g.stroke(); }
    g.fillStyle = green; g.fillText('POWER GRID OK', 12, 150);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  panelCache.set(kind, t);
  return t;
}
function helmGear(k, s, P, F, sz) {
  const wallX = s.W / 2 - T - 0.03;
  // side-wall screen banks: a low row near the floor and a mid row, both sides
  const cols = Math.max(2, Math.min(4, Math.floor((s.L * 0.34) / 0.78)));
  let n = 0;
  for (const side of [-1, 1]) {
    for (let c = 0; c < cols; c++) {
      const z = F(0.95 + c * 0.78);
      for (const [y, w, h] of [[0.42, 0.66, 0.4], [1.12, 0.66, 0.4]]) {
        const kind = PANEL_KINDS[(n++ * 3 + (side > 0 ? 1 : 0)) % PANEL_KINDS.length];
        k.box(side * wallX - 0.02, y - h / 2 - 0.04, z - w / 2 - 0.04, side * wallX + 0.02, y + h / 2 + 0.04, z + w / 2 + 0.04, C.black);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screen(panelTex(kind)));
        k.add(m, side * (wallX - 0.03), y, z, -side * HP);
      }
    }
  }
  // throttle quadrant on the right of the seat, flight stick on the left
  k.box(0.42, 0, sz - 0.3, 0.62, 0.58, sz + 0.05, C.dark);
  for (const [x, knob] of [[0.47, G.orange], [0.57, G.teal]]) {
    k.rod(x, 0.58, sz - 0.12, x, 0.8, sz - 0.2, 0.018, C.steel, 6);
    k.box(x - 0.03, 0.78, sz - 0.23, x + 0.03, 0.84, sz - 0.17, knob);
  }
  k.box(-0.62, 0, sz - 0.3, -0.42, 0.58, sz + 0.05, C.dark);
  k.rod(-0.52, 0.58, sz - 0.12, -0.52, 0.84, sz - 0.14, 0.024, C.steel, 6);
  k.box(-0.56, 0.84, sz - 0.18, -0.48, 0.93, sz - 0.1, C.black);
  k.box(-0.51, 0.93, sz - 0.15, -0.49, 0.95, sz - 0.13, G.red);
  // toggle-switch rows on the dashboard's front face
  for (let i = 0; i < 8; i++) {
    const x = -0.49 + i * 0.14;
    k.box(x - 0.02, 0.12, F(0.4), x + 0.02, 0.2, F(0.44), C.steel);
    k.box(x - 0.012, 0.18, F(0.44), x + 0.012, 0.24, F(0.47), i % 3 ? C.black : G.green);
  }
  // keyboard shelf in front of the seat
  k.box(-0.34, 0.66, F(0.52), 0.34, 0.69, F(0.78), C.dark);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) k.box(-0.3 + i * 0.067, 0.69, F(0.56 + r * 0.07), -0.25 + i * 0.067, 0.705, F(0.61 + r * 0.07), C.black);
  // fire extinguisher by the seat and grab handles on the walls
  k.cyl(-0.8, sz + 0.2, 0.07, 0, 0.5, C.pink, 10);
  k.box(-0.83, 0.5, sz + 0.17, -0.77, 0.56, sz + 0.23, C.dark);
  for (const side of [-1, 1]) {
    k.rod(side * (wallX - 0.08), 1.75, F(1.0), side * (wallX - 0.08), 1.75, F(1.6), 0.02, C.steel, 6);
    // pipe runs along the upper walls (pipes, not screens: nothing is shown up top)
    for (const dy of [0, 0.12]) k.rod(side * (wallX - 0.06), s.H - 0.25 - dy, F(0.2), side * (wallX - 0.06), s.H - 0.25 - dy, F(Math.min(s.L - 0.6, 4.4)), 0.035, dy ? C.steel : C.dark, 6);
  }
}

// The breach panel fills a real opening in a side wall; the lever sits 1.5 m
// along the same wall so the pull toward the hole crosses open floor.
function breachPanel(k, s) {
  const side = s.breach.side, z = s.breach.z, hw = s.W / 2;
  const xc = side * (hw - T / 2), xi = side * (hw - T);
  const panel = new THREE.Mesh(geo('panel', () => new THREE.BoxGeometry(T * 0.9, 1.78, 1.18)), C.steel);
  panel.position.set(xc, 1.2, z);
  for (const a of [0.58, -0.58]) {
    const t = new THREE.Mesh(BOX(), C.grey);
    t.scale.set(0.02, 2.0, 0.12);
    t.position.set(-side * (T * 0.45 + 0.012), 0, 0);
    t.rotation.x = a;
    panel.add(t);
  }
  k.group.add(panel);
  const f = (z0, z1, y0, y1, m, d = 0.04) => k.box(Math.min(xi, xi - side * d), y0, z0, Math.max(xi, xi - side * d), y1, z1, m);
  f(z - 0.72, z + 0.72, 0.18, 0.3, C.yellow); f(z - 0.72, z + 0.72, 2.1, 2.22, C.yellow);
  f(z - 0.72, z - 0.6, 0.3, 2.1, C.yellow); f(z + 0.6, z + 0.72, 0.3, 2.1, C.yellow);
  for (let i = 0; i < 4; i++) {
    const y = 0.55 + i * 0.45;
    f(z - 0.72, z - 0.6, y, y + 0.14, C.dark, 0.045); f(z + 0.6, z + 0.72, y, y + 0.14, C.dark, 0.045);
  }
  k.sign('HULL BREACH', 1.1, xi - side * 0.05, 2.38, z, -side * HP);
  const lz = z + s.breach.lever;
  f(lz - 0.14, lz + 0.14, 0.95, 1.45, C.dark);
  f(lz - 0.1, lz + 0.1, 1.5, 1.6, C.yellow);
  k.rod(xi - side * 0.04, 1.15, lz, xi - side * 0.3, 1.36, lz, 0.025, C.steel, 6);
  k.put(CYL(8), C.orange, xi - side * 0.31, 1.38, lz, 0.1, 0.16, 0.1);
  k.use('breach', 'pull the breach lever', xi - side * 0.35, 1.2, lz, 1.2);
  return { panel, pos: new THREE.Vector3(xc, 1.2, z), normal: new THREE.Vector3(side, 0, 0) };
}

// ---------- ship interiors ----------

function scoutRooms(k, s, P) {
  const H = s.H;
  k.wall(false, -1.525, -2.85, 2.85, H, C.wall, [{ a: -0.8, b: 0.8 }], P);
  k.sign('STORAGE', 0.8, 0, 2.42, -1.61, PI);
  k.box(-0.5, H - 0.03, 1.6, 0.5, H, 2.6, G.lamp);
  k.push(-2.85, 0, -0.2, HP); foldBunk(k, P); k.use('bed', 'nap on the bunk', 0, 0.8, 0.55, 1.3); k.pop();
  k.push(-2.85, 0, 2.35, HP); lockers(k, 3, P); k.use('storage', 'open storage', 0, 1.2, 0.8, 1.3); k.pop();
  crate(k, -2.3, 5.3, 1.0); crate(k, -2.3, 5.35, 0.7, 1.0, C.cream);
  crate(k, 2.3, 5.3, 1.0); crate(k, 1.45, 5.45, 0.7); crate(k, 2.3, 5.35, 0.75, 1.0, C.teal);
  net(k, 1.1, 2.85, 0.05, 1.85, 4.7);
  k.block(1.1, 4.684, 2.85, 5.85);
  droneBay(k, 0, 4.4, 1.3, 0, 5.55);
  k.sign('DRONE BAY', 1.0, 0, 1.8, 5.84, PI);
  k.push(0, 0, -1.45, 0); poster(k, 1.9, 1.6, 0.6, 0.8, C.white, C.orange, 0); k.pop();
}

function racerRooms(k, s, P) {
  const H = s.H;
  k.wall(false, -0.2, -2.35, 2.35, H, C.wall, [{ a: -0.7, b: 0.7 }], P);
  k.sign('NOOK', 0.6, 0, 2.37, -0.285, PI);
  k.box(-0.4, H - 0.03, 1.4, 0.4, H, 2.2, G.lamp);
  k.push(-2.35, 0, 1.35, HP); lockers(k, 3, P, { h: 1.9 }); k.use('storage', 'open storage', 0, 1.2, 0.8, 1.3); k.pop();
  crate(k, -1.85, 3.85, 0.9); crate(k, -1.85, 3.9, 0.6, 0.9, C.cream);
  crate(k, 1.9, 3.9, 0.8);
  net(k, 1.3, 2.35, 0.05, 1.5, 3.4);
  k.block(1.3, 3.384, 2.35, 4.35);
  droneBay(k, 0, 3.05, 1.1, 0, 4.05);
  k.sign('DRONE BAY', 0.9, 0, 1.75, 4.34, PI);
}

function gunStation(k, P) {
  k.solid(-0.35, 0, 0, 0.35, 0.85, 0.5, C.dark);
  k.box(-0.5, 0.85, 0, 0.5, 1.55, 0.75, C.steel);
  k.block(-0.5, 0, 0.5, 0.75);
  k.box(-0.52, 1.1, 0.2, 0.52, 1.3, 0.3, P);
  for (const x of [-0.32, 0.32]) {
    k.rod(x, 1.2, 0.75, x, 1.2, 0.98, 0.03, C.steel, 6);
    k.cyl(x, 1.0, 0.04, 1.08, 1.32, C.black, 8);
  }
  k.box(-0.22, 1.55, 0.2, 0.22, 1.95, 0.45, C.dark);
  k.put(CYL(14), G.teal, 0, 1.75, 0.455, 0.3, 0.01, 0.3, HP, 0, 0);
  k.box(-0.14, 1.745, 0.462, 0.14, 1.755, 0.468, C.dark);
  k.box(-0.005, 1.61, 0.462, 0.005, 1.89, 0.468, C.dark);
  for (let i = 0; i < 6; i++) k.box(0.36, 1.58 + i * 0.17, 0.08, 0.46, 1.7 + i * 0.17, 0.16, C.brass);
  k.cyl(0, 1.4, 0.05, 0, 0.55, C.dark, 6);
  k.cyl(0, 1.4, 0.2, 0.55, 0.63, P, 10);
  k.block(-0.2, 1.2, 0.2, 1.6);
}

function ammoRack(k) {
  k.box(-0.6, 0, 0, 0.6, 0.06, 0.45, C.dark);
  for (const x of [-0.6, 0.56]) k.box(x, 0, 0, x + 0.04, 1.5, 0.45, C.dark);
  for (const y of [0.5, 1.0, 1.46]) k.box(-0.6, y, 0, 0.6, y + 0.04, 0.45, C.dark);
  for (const y of [0.06, 0.54, 1.04]) for (let i = 0; i < 6; i++) {
    const x = -0.46 + i * 0.184;
    k.cyl(x, 0.22, 0.065, y, y + 0.28, C.brass, 8);
    k.put(CONE(6), C.steel, x, y + 0.34, 0.22, 0.13, 0.12, 0.13);
  }
  k.block(-0.6, 0, 0.6, 0.45);
}

function fighterRooms(k, s, P) {
  const H = s.H;
  k.wall(false, -3.7, -3.35, 3.35, H, C.wall, [{ a: -0.7, b: 0.7 }], P);
  k.wall(false, 1.925, -3.35, 3.35, H, C.wall, [{ a: -0.7, b: 0.7 }], P);
  k.sign('GUN ROOM', 0.9, 0, 2.42, -3.785, PI);
  k.sign('HOLD', 0.6, 0, 2.42, 1.84, PI);
  k.box(-0.5, H - 0.03, -1.4, 0.5, H, -0.6, G.lamp);
  k.box(-0.5, H - 0.03, 4.6, 0.5, H, 5.4, G.lamp);
  for (const side of [-1, 1]) { k.push(side * 3.35, 0, -1.0, -side * HP); gunStation(k, P); k.pop(); }
  for (const side of [-1, 1]) { k.push(side * 2.2, 0, 1.85, PI); ammoRack(k); k.pop(); }
  k.put(CYL(8), C.steel, 0, H - 0.25, -1.0, 0.2, 6.4, 0.2, 0, 0, HP);
  k.push(-3.35, 0, 3.75, HP); lockers(k, 3, P); k.use('storage', 'open storage', 0, 1.2, 0.8, 1.3); k.pop();
  crate(k, -2.75, 7.2, 1.1); crate(k, -2.8, 7.25, 0.7, 1.1, C.cream);
  net(k, -3.35, -2.05, 0.05, 1.9, 6.55);
  k.block(-3.35, 6.534, -2.05, 7.85);
  crate(k, 2.8, 7.25, 1.0); crate(k, 1.8, 7.4, 0.7, 0, C.teal);
  droneBay(k, 0, 5.9, 1.3, 0, 7.4);
  k.sign('DRONE BAY', 1.0, 0, 1.8, 7.84, PI);
}

function haulerRooms(k, s, P) {
  const H = s.H;
  k.wall(false, -8.425, -4.35, 4.35, H, C.wall, [{ a: -0.7, b: 0.7 }], P);
  k.wall(false, -3.025, -4.35, 4.35, H, C.wall, [{ a: -1.0, b: 1.0 }], P);
  k.sign('BUNKS', 0.7, 0, 2.45, -8.51, PI);
  k.sign('CARGO BAY', 1.0, 0, 2.45, -3.11, PI);
  k.box(-0.5, H - 0.03, -6.2, 0.5, H, -5.2, G.lamp);
  for (const z of [0, 5, 10]) k.box(-0.6, H - 0.03, z - 0.5, 0.6, H, z + 0.5, G.lamp);
  // bunk room
  k.push(-4.35, 0, -6.9, HP); bunkBed(k, P, C.teal); k.use('bed', 'nap in the bunk', 0.2, 0.8, 1.15, 1.3); k.pop();
  k.push(4.35, 0, -6.9, -HP); bunkBed(k, C.orange, P); k.pop();
  k.push(-4.35, 0, -4.6, HP); lockers(k, 2, P); k.use('storage', 'open storage', 0, 1.2, 0.8, 1.3); k.pop();
  k.push(4.35, 0, -4.4, -HP);
  table(k, -0.5, 0, 0.5, 0.7, C.wood);
  for (const x of [-0.3, 0.3]) { k.cyl(x, 1.05, 0.04, 0, 0.5, C.dark, 6); k.cyl(x, 1.05, 0.18, 0.5, 0.56, C.teal, 10); k.block(x - 0.18, 0.87, x + 0.18, 1.23); }
  k.box(-0.2, 0.76, 0.2, 0.2, 0.78, 0.5, C.cream);
  poster(k, 0, 1.7, 0.7, 0.5, C.cream, C.blue, 1);
  k.pop();
  k.push(0, 0, -8.35, 0); poster(k, -2.4, 1.6, 0.6, 0.8, C.white, C.pink, 2); k.pop();
  // cargo bay
  [-1.5, 1.1, 3.7, 6.3].forEach((z, i) => { k.push(-4.35, 0, z, HP); rack(k, 2.4, 3 + i); if (!i) k.use('storage', 'open storage', 0, 1.2, 1.0, 1.3); k.pop(); });
  [-1.5, 1.1, 7.4].forEach((z, i) => { k.push(4.35, 0, z, -HP); rack(k, 2.4, 9 + i); k.pop(); });
  for (const [z, seed] of [[1.0, 1], [6.5, 2]]) {
    k.box(-0.9, 0, z - 0.9, 0.9, 0.14, z + 0.9, C.plank);
    const r = lcg(seed);
    crate(k, -0.45, z - 0.45, 0.8, 0.14); crate(k, 0.45, z - 0.45, 0.8, 0.14, C.cream);
    crate(k, -0.45, z + 0.45, 0.8, 0.14, C.cream); crate(k, 0.45, z + 0.45, 0.8, 0.14);
    crate(k, r() * 0.2 - 0.1, z, 0.8, 0.94, C.wood);
    k.push(0, 0, z + 0.93, 0); net(k, -0.9, 0.9, 0.14, 1.7); k.pop();
    k.block(-0.92, z - 0.92, 0.92, z + 0.95);
  }
  crate(k, -3.7, 12.2, 1.1); crate(k, -3.7, 12.25, 0.7, 1.1, C.cream);
  crate(k, 3.7, 12.2, 1.1); crate(k, 2.6, 12.3, 0.8, 0, C.teal);
  droneBay(k, 0, 11.0, 1.6, 1.5, 11.0);
  k.sign('DRONE BAY', 1.2, 0, 2.0, 12.84, PI);
}

// Cruiser rooms are built in a room frame: corridor wall at z = 0 (door at
// x = dx), hull wall at z = D, side walls at x = +-L/2.
const D = 5.5;

const DORMS = [
  { rug: C.pink, edge: C.white, bed: C.teal, str: G.str1, desk: C.wood, shade: C.pink, posters: [['THE SCRIBBLES', '#f2a0b8'], ['PLUTO FOREVER', '#5cc7c0']] },
  { rug: C.blue, edge: C.cream, bed: C.orange, str: G.str2, desk: C.white, shade: C.teal, posters: [['MOON 5K', '#ffd84a'], ['SPACE IS BIG', '#6f95ff']] },
  { rug: C.green, edge: C.white, bed: C.pink, str: G.str2, desk: C.wood, shade: C.yellow, posters: [['ALL NAPS', '#7fbf6a'], ['THE SMUDGES', '#ff9a3c']] },
  { rug: C.orange, edge: C.cream, bed: C.blue, str: G.str1, desk: C.white, shade: C.green, posters: [['GO COMETS', '#ff9a3c'], ['QUIET HOURS', '#efe3c2']] },
];

function dorm(k, L, H, P, v) {
  const hx = L / 2, o = DORMS[v];
  k.box(-0.6, H - 0.03, 2.2, 0.6, H, 3.0, G.lamp);
  rug(k, -1.3, 1.4, 1.3, 3.5, o.rug, o.edge);
  if (v % 2 === 0) {
    k.push(-hx + 1.08, 0, D, PI);
    loft(k, o.bed, -1);
    if (v === 0) { k.push(0.1, 0, 0.08, 0); sofa(k, 1.6, C.blue); k.pop(); }
    else {
      k.solid(0.1, 0, 0.05, 0.95, 0.9, 0.55, C.wood);
      for (const y of [0.3, 0.6]) k.box(0.15, y, 0.55, 0.9, y + 0.02, 0.56, C.plank);
      k.box(0.25, 0.9, 0.12, 0.75, 1.25, 0.45, C.dark);
      k.box(0.3, 0.95, 0.45, 0.7, 1.2, 0.46, G.blue);
    }
    k.use('bed', 'nap in the loft bed', -0.78, 1.6, 1.25, 1.3);
    k.pop();
  } else {
    k.push(-hx, 0, D - 1.1, HP);
    bunkBed(k, o.bed, C.white);
    k.use('bed', 'nap in the bunk', 0.3, 0.8, 1.2, 1.3);
    k.pop();
  }
  // desk, lamp and chair on the right wall
  k.push(hx, 0, D - 0.85, -HP);
  desk(k, 1.6, o.desk, 0.62, o.shade);
  chair(k, -0.35, 1.0, 0, o.bed);
  k.use('desk', 'sit at the desk', -0.35, 0.8, 0.45, 1.3);
  k.use('lamp', 'switch the desk lamp', 0.62, 1.05, 0.2, 1.3);
  poster(k, -0.3, 1.75, 0.7, 0.9, C.white, o.shade, v % 3);
  k.pop();
  // mini-fridge by the door, laundry basket in the other corner
  k.push(hx - 0.35, 0, 0.02, 0); miniFridge(k, P); k.pop();
  basket(k, -hx + 0.45, 0.55, v % 2 ? C.pink : C.blue);
  // posters and string lights
  k.push(-hx, 0, 0, HP);
  textPoster(k, o.posters[0][0], -1.9, 1.75, 1.0, o.posters[0][1], '#1a30c0');
  if (v === 3) {
    k.box(-3.3, 1.1, 0, -2.5, 1.7, 0.03, C.white);
    k.box(-3.25, 1.15, 0.03, -2.55, 1.65, 0.035, C.white);
    k.sign('EXAM FRI', 0.6, -2.9, 1.45, 0.037, 0, 0, { w: 256, h: 96, bg: '#f2efe4', fg: '#d02030', size: 40 });
  }
  if (v === 1) {
    k.push(-2.6, 0, 0.14, 0, -0.16);
    k.put(CYL(12), C.orange, 0, 0.32, 0.05, 0.44, 0.1, 0.5, HP, 0, 0);
    k.put(CYL(12), C.orange, 0, 0.66, 0.05, 0.34, 0.1, 0.36, HP, 0, 0);
    k.box(-0.03, 0.7, 0.03, 0.03, 1.28, 0.08, C.dark);
    k.box(-0.05, 1.28, 0.03, 0.05, 1.42, 0.08, C.dark);
    k.pop();
    k.block(-2.85, 0, -2.35, 0.3);
  }
  k.pop();
  k.push(0, 0, 0, 0);
  textPoster(k, o.posters[1][0], 1.45, 1.7, 0.8, o.posters[1][1], '#1a30c0');
  k.pop();
  k.push(0, 0, D, PI); stringLights(k, -hx + 0.2, hx - 0.2, 2.62, 0.04, o.str); k.pop();
  if (v === 0 || v === 3) beanbag(k, 0.9, 2.7, v ? C.teal : C.orange);
  if (v === 2) plant(k, hx - 0.35, 3.3);
}

function bathroom(k, L, H, P) {
  const hx = L / 2;
  k.box(-hx, 0, 0, hx, 0.012, D, C.tile);
  k.box(-0.5, H - 0.03, 2.2, 0.5, H, 3.0, G.lamp);
  // toilet stall
  k.box(-0.98, 0, 3.9, -0.92, 2.0, D, C.pink);
  k.block(-0.98, 3.9, -0.92, D);
  k.push(-1.7, 0, D, PI); toilet(k); k.use('toilet', 'flush', 0, 0.5, 0.75, 1.3); k.pop();
  k.put(CYL(8), C.white, -hx + 0.12, 0.75, 4.6, 0.18, 0.12, 0.18, 0, 0, HP);
  // shower stall
  k.box(0.95, 0, 4.0, hx, 0.06, D, C.white);
  k.cyl(1.7, 4.75, 0.05, 0.06, 0.066, C.dark, 8);
  k.box(0.92, 0.06, 4.0, 0.98, 2.05, D, C.glass);
  k.block(0.92, 4.0, 0.98, D);
  k.box(0.95, 2.05, 3.97, hx, 2.08, 4.02, C.steel);
  for (let i = 0; i < 4; i++) k.box(0.97 + i * 0.15, 0.3, 3.96 + (i % 2) * 0.05, 1.12 + i * 0.15, 2.04, 4.0 + (i % 2) * 0.05, C.teal);
  k.block(0.95, 3.96, 1.57, 4.05);
  k.rod(1.7, 1.3, D - 0.01, 1.7, 2.18, D - 0.01, 0.02, C.steel, 6);
  k.rod(1.7, 2.18, D - 0.01, 1.7, 2.12, D - 0.3, 0.018, C.steel, 6);
  k.cyl(1.7, D - 0.32, 0.11, 2.05, 2.1, C.steel, 10);
  k.box(hx - 0.25, 1.2, D - 0.8, hx, 1.23, D - 0.3, C.steel);
  k.cyl(hx - 0.12, D - 0.7, 0.04, 1.23, 1.43, C.pink, 8);
  k.cyl(hx - 0.12, D - 0.55, 0.035, 1.23, 1.38, C.green, 8);
  k.use('shower', 'shower', 1.7, 1.2, 4.75, 1.2);
  // sinks with mirrors on the left wall
  k.push(-hx, 0, 1.9, HP); vanity(k, 2.0, 2); k.use('sink', 'wash your hands', 0, 1.0, 0.75, 1.3); k.pop();
  // towels and a bath mat
  k.push(hx, 0, 1.6, -HP);
  k.rod(-0.5, 1.3, 0.08, 0.5, 1.3, 0.08, 0.015, C.steel, 5);
  k.box(-0.42, 0.75, 0.05, -0.06, 1.32, 0.1, P);
  k.box(0.06, 0.8, 0.05, 0.42, 1.32, 0.1, C.teal);
  k.pop();
  rug(k, 1.2, 3.25, 2.2, 3.8, C.teal, C.white);
  k.cyl(hx - 0.3, 0.4, 0.15, 0, 0.4, C.steel, 8);
  k.block(hx - 0.45, 0.25, hx - 0.15, 0.55);
}

function galley(k, L, H, P) {
  const hx = L / 2;
  k.box(-hx, 0, 0, hx, 0.012, D, C.cream);
  for (const x of [-3, 0, 3]) k.box(x - 0.6, H - 0.03, 2.3, x + 0.6, H, 3.1, G.lamp);
  const run = (x0, x1, sink) => { k.push((x0 + x1) / 2, 0, D, PI); counter(k, x1 - x0, sink); k.pop(); };
  run(-5.2, -2.3); run(-1.5, 0.1); run(0.1, 1.1, true); run(1.1, 2.0);
  k.push(-3.8, 0, D, PI); upper(k, 2.8); k.pop();
  k.push(0.3, 0, D, PI); upper(k, 3.4); k.pop();
  k.push(-1.9, 0, D, PI); stove(k, H); k.use('stove', 'cook something', 0, 1.0, 0.55, 1.3); k.pop();
  k.use('sink', 'rinse a mug', 0.6, 1.0, D - 0.55, 1.3);
  k.push(2.55, 0, D, PI); fridge(k, P); k.use('fridge', 'grab a snack', 0, 1.2, 0.9, 1.4); k.pop();
  // table and chairs
  table(k, -3.9, 2.05, -2.3, 2.95, C.wood);
  for (const x of [-3.5, -2.7]) { chair(k, x, 1.62, PI, P); chair(k, x, 3.38, 0, P); }
  k.cyl(-3.1, 2.5, 0.16, 0.76, 0.84, C.white, 10);
  for (const [dx, dz, c] of [[-0.05, 0, C.orange], [0.06, 0.05, C.yellow], [0.02, -0.07, C.green]]) k.put(OCT(), c, -3.1 + dx, 0.88, 2.5 + dz, 0.12, 0.12, 0.12);
  // water cooler, bin, menu board
  k.solid(4.4, 0, 4.85, 4.8, 1.0, 5.25, C.white);
  k.cyl(4.6, 5.05, 0.16, 1.0, 1.45, C.glass, 10);
  k.box(4.52, 0.85, 4.84, 4.68, 0.9, 4.86, G.blue);
  k.cyl(3.4, 5.1, 0.18, 0, 0.55, C.steel, 8);
  k.block(3.22, 4.92, 3.58, 5.28);
  k.push(-hx, 0, 2.5, HP);
  k.box(-0.8, 1.3, 0, 0.8, 2.2, 0.03, C.board);
  k.sign('GRILLED CHEESE NIGHT', 1.4, 0, 1.9, 0.032, 0, 0, { w: 320, h: 64, bg: '#35503f', fg: '#f6f3e6', size: 34 });
  k.pop();
}

function storageRoom(k, L, H, P) {
  const hx = L / 2;
  k.box(-0.5, H - 0.03, 2.3, 0.5, H, 3.1, G.lamp);
  k.push(-1.35, 0, D, PI); rack(k, 2.4, 31); k.pop();
  k.push(1.35, 0, D, PI); rack(k, 2.4, 32); k.pop();
  k.push(-hx, 0, 2.2, HP); lockers(k, 3, P); k.use('storage', 'open storage', 0, 1.2, 0.8, 1.3); k.pop();
  crate(k, 2.3, 1.6, 0.9); crate(k, 2.3, 2.6, 0.9, 0, C.cream); crate(k, 2.3, 2.1, 0.7, 0.9);
  k.push(1.75, 0, 2.1, HP); net(k, -1.1, 1.1, 0.05, 1.9); k.pop();
  k.block(1.73, 1.0, hx, 3.2);
}

function airlock(k, L, H, P) {
  const hx = L / 2;
  k.box(-0.5, H - 0.03, 2.3, 0.5, H, 3.1, G.lamp);
  for (let i = 0; i < 7; i++) k.box(-0.95 + i * 0.3, 0, D - 0.5, -0.8 + i * 0.3, 0.016, D - 0.1, i % 2 ? C.dark : C.yellow);
  k.push(hx, 0, 3.9, -HP); lockers(k, 3, P, { color: C.white }); k.use('storage', 'open the suit lockers', 0, 1.2, 0.8, 1.3); k.pop();
  k.push(-hx, 0, 3.6, HP); suits(k, 2, P); k.pop();
  k.box(-3.2, 0.42, 0.05, -1.4, 0.48, 0.45, C.wood);
  for (const x of [-3.1, -1.5]) k.box(x - 0.04, 0, 0.1, x + 0.04, 0.42, 0.4, C.dark);
  k.block(-3.2, 0.05, -1.4, 0.45);
  k.push(0, 0, 0, 0); textPoster(k, 'SUIT UP FIRST', -0.3, 1.7, 1.1, '#ffd84a', '#1a30c0'); k.pop();
}

function laundry(k, L, H, P) {
  const hx = L / 2;
  k.box(-0.5, H - 0.03, 2.3, 0.5, H, 3.1, G.lamp);
  for (let i = 0; i < 5; i++) { k.push(-2.6 + i * 0.7, 0, D, PI); washer(k, i % 2 === 0); k.pop(); }
  k.box(-2.95, 1.5, D - 0.35, 0.55, 1.54, D, C.wood);
  for (let i = 0; i < 6; i++) k.cyl(-2.7 + i * 0.6, D - 0.18, 0.07, 1.54, 1.8, [C.teal, C.pink, C.orange, C.blue, C.green, C.white][i], 8);
  table(k, -1.0, 2.2, 1.0, 3.0, C.white, 0.9);
  for (let i = 0; i < 4; i++) k.box(-0.8 + i * 0.42, 0.9, 2.35, -0.5 + i * 0.42, 0.98 + (i % 2) * 0.04, 2.8, [P, C.teal, C.pink, C.white][i]);
  basket(k, 2.2, 3.8, C.blue);
  basket(k, -2.9, 1.2, C.pink);
  for (const x of [2.9, 3.6]) k.box(x - 0.02, 0, 1.8, x + 0.02, 1.3, 1.84, C.steel);
  for (const y of [0.8, 1.05, 1.3]) k.box(2.9, y, 1.8, 3.6, y + 0.02, 1.84, C.steel);
  k.box(2.95, 0.9, 1.78, 3.25, 1.3, 1.86, C.pink);
  k.box(3.3, 0.7, 1.78, 3.55, 1.05, 1.86, C.teal);
  k.block(2.85, 1.7, 3.65, 1.94);
  plant(k, hx - 0.35, 0.45, 0.9);
}

function sideConsole(k, P) {
  k.solid(-1.2, 0, 0, 1.2, 0.8, 0.6, C.white);
  k.box(-1.2, 0.8, 0, 1.2, 0.85, 0.65, C.dark);
  const sc = [G.teal, G.green, G.blue];
  for (let i = 0; i < 3; i++) {
    const x = -0.8 + i * 0.8;
    k.box(x - 0.34, 1.0, 0.02, x + 0.34, 1.45, 0.08, C.dark);
    k.box(x - 0.3, 1.04, 0.08, x + 0.3, 1.41, 0.085, sc[i]);
    k.box(x - 0.25, 0.85, 0.3, x + 0.25, 0.87, 0.5, C.black);
  }
  k.box(-1.2, 0.35, 0.6, 1.2, 0.4, 0.61, P);
  k.cyl(-0.4, 1.05, 0.04, 0, 0.55, C.dark, 6);
  k.cyl(-0.4, 1.05, 0.2, 0.55, 0.62, P, 10);
  k.block(-0.6, 0.85, -0.2, 1.25);
}

function bridge(k, s, P) {
  const H = s.H, X = s.W / 2 - T;
  for (const side of [-1, 1]) { k.push(side * X, 0, -26.8, -side * HP); sideConsole(k, P); k.pop(); }
  k.cyl(-4.0, -23.6, 0.1, 0, 0.8, C.steel, 8);
  k.cyl(-4.0, -23.6, 0.65, 0.8, 0.88, C.dark, 14);
  k.cyl(-4.0, -23.6, 0.55, 0.88, 0.89, G.blue, 14);
  k.block(-4.65, -24.25, -3.35, -22.95);
  k.use('nav', 'open the star map', -4.0, 1.0, -23.6, 1.4);
  plant(k, 6.2, -22.6); plant(k, -6.2, -22.6, 0.9);
  k.sign('BRIDGE', 0.8, 0, 2.62, -21.84, 0);
  k.box(-0.6, H - 0.03, -25.6, 0.6, H, -24.6, G.lamp);
}

function lounge(k, H, P) {
  const X = 6.85;
  for (const [x, z] of [[-2.5, 14.5], [3, 14.5], [-2.5, 18], [3, 18]]) k.box(x - 0.6, H - 0.03, z - 0.4, x + 0.6, H, z + 0.4, G.lamp);
  rug(k, -5.0, 13.6, 0.2, 18.4, C.teal, C.orange);
  // big screen on the back wall
  k.box(-4.1, 0.66, 19.9, -0.7, 2.64, 20.0, C.dark);
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), screen(idle('LOUNGE', 256, 144)));
  k.add(tv, -2.4, 1.65, 19.895, PI);
  k.screens.lounge = tv;
  k.solid(-3.6, 0, 19.45, -1.2, 0.5, 20.0, C.wood);
  for (const x of [-4.33, -0.47]) {
    k.solid(x - 0.18, 0, 19.55, x + 0.18, 1.1, 20.0, C.dark);
    for (const y of [0.35, 0.8]) k.put(CYL(10), C.steel, x, y, 19.54, 0.24, 0.02, 0.24, HP, 0, 0);
  }
  k.use('tv', 'watch the big screen', -2.4, 1.5, 19.2, 2.2);
  // sofa, coffee table, beanbag
  k.push(-2.4, 0, 14.4, 0); sofa(k, 3.2, P); k.pop();
  table(k, -3.2, 16.1, -1.6, 16.8, C.wood, 0.42);
  k.box(-2.6, 0.42, 16.3, -2.4, 0.45, 16.45, C.dark);
  k.cyl(-1.95, 16.5, 0.05, 0.42, 0.53, C.pink, 8);
  beanbag(k, -4.8, 17.6, C.pink);
  // bookshelf, foosball, jukebox, plants
  k.push(-X, 0, 15.2, HP); bookshelf(k, 2.2, 7); k.pop();
  foosball(k, 2.7, 14.6);
  k.push(X, 0, 16.8, -HP); jukebox(k); k.use('music', 'next song', 0, 1.1, 0.75, 1.4); k.pop();
  plant(k, -6.3, 12.5); plant(k, 6.3, 19.5, 1.2);
  k.push(0, 0, 12.0, 0);
  stringLights(k, -6.6, -1.5, 2.7, 0.05, G.str1);
  stringLights(k, 1.5, 6.6, 2.7, 0.05, G.str2);
  k.pop();
  k.sign('LOUNGE', 0.8, 0, 2.75, 11.84, PI);
  k.sign('DRONE BAY', 1.0, 3.8, 2.6, 19.99, PI);
}

function droneRoom(k, H, P) {
  const X = 6.85;
  for (const [x, z] of [[-3, 23], [3, 23], [-3, 27.5], [3, 27.5]]) k.box(x - 0.6, H - 0.03, z - 0.4, x + 0.6, H, z + 0.4, G.lamp);
  droneBay(k, 0, 25.2, 3.0, 3.0, 25.2);
  k.box(2.7, 0.95, 24.96, 3.3, 1.6, 25.0, C.dark);
  k.sign('DRONE BAY', 0.56, 3.0, 1.3, 24.955, PI);
  droneMock(k, 0, 25.2);
  k.push(-X, 0, 24.0, HP); workbench(k, 2.4); k.pop();
  k.push(X, 0, 27.4, -HP); rack(k, 2.4, 41); k.use('storage', 'open storage', 0, 1.2, 1.0, 1.3); k.pop();
  crate(k, -5.9, 29.2, 1.1); crate(k, -4.6, 29.35, 0.8, 0, C.cream); crate(k, -5.9, 29.25, 0.8, 1.1, C.teal);
  crate(k, 5.9, 29.2, 1.1); crate(k, 4.7, 29.3, 0.9);
  k.solid(-0.5, 0, 29.35, 0.5, 1.1, 29.85, C.steel);
  k.box(-0.3, 0.7, 29.34, 0.3, 0.9, 29.35, G.green);
  k.rod(0, 0.4, 29.3, 0, 0.04, 27.0, 0.03, C.dark, 5);
  k.sign('DRONE BAY', 1.6, 0, 2.2, 29.84, PI);
  k.cyl(0, 29.7, 0.12, 2.62, 2.72, C.dark, 8);
  const beacon = new THREE.Mesh(geo('beacon', () => new THREE.BoxGeometry(0.34, 0.1, 0.1)), G.orange);
  k.add(beacon, 0, 2.77, 29.7);
  k.spin.push(beacon);
}

function cruiserRooms(k, s, P) {
  const H = s.H, X = s.W / 2 - T, cw = 1.275;
  k.wall(false, -21.925, -X, X, H, C.wall, [{ a: -1.0, b: 1.0, y1: 2.3 }], P);
  bridge(k, s, P);
  const rooms = [
    [-1, -21.85, -15.6, 'DORM 1', (L) => dorm(k, L, H, P, 0)],
    [-1, -15.45, -9.6, 'DORM 2', (L) => dorm(k, L, H, P, 1)],
    [-1, -9.45, -4.6, 'BATH', (L) => bathroom(k, L, H, P)],
    [-1, -4.45, 6.0, 'GALLEY', (L) => galley(k, L, H, P), -1.5, 1.6],
    [-1, 6.15, 11.85, 'STORAGE', (L) => storageRoom(k, L, H, P)],
    [1, -21.85, -15.6, 'DORM 3', (L) => dorm(k, L, H, P, 2)],
    [1, -15.45, -9.6, 'DORM 4', (L) => dorm(k, L, H, P, 3)],
    [1, -9.45, -4.6, 'BATH', (L) => bathroom(k, L, H, P)],
    [1, -4.45, 3.0, 'AIRLOCK', (L) => airlock(k, L, H, P), 2.225, 1.3],
    [1, 3.15, 11.85, 'LAUNDRY', (L) => laundry(k, L, H, P)],
  ];
  const doors = { [-1]: [], [1]: [] };
  for (const [side, z0, z1, name, make, dx = 0, dw = 1.3] of rooms) {
    const zc = (z0 + z1) / 2, wz = side < 0 ? zc + dx : zc - dx;
    doors[side].push({ a: wz - dw / 2, b: wz + dw / 2 });
    k.push(side * (cw + T / 2), 0, zc, side < 0 ? -HP : HP);
    make(z1 - z0);
    k.pop();
    k.sign(name, 0.8, side * (cw - T / 2 - 0.01), 2.45, wz, side < 0 ? HP : -HP);
  }
  for (const z of [-15.525, -9.525, -4.525, 6.075]) k.wall(false, z, -X, -cw - T / 2, H, C.wall);
  for (const z of [-15.525, -9.525, -4.525, 3.075]) k.wall(false, z, cw + T / 2, X, H, C.wall);
  k.wall(true, -cw, -21.85, 11.85, H, C.wall, doors[-1], P);
  k.wall(true, cw, -21.85, 11.85, H, C.wall, doors[1], P);
  k.box(-0.75, 0, -21.85, 0.75, 0.016, 11.85, C.blue);
  for (let z = -19; z < 11; z += 4) k.box(-0.3, H - 0.03, z - 0.6, 0.3, H, z + 0.6, G.lamp);
  k.wall(false, 11.925, -X, X, H, C.wall, [{ a: -1.2, b: 1.2, y1: 2.5 }]);
  k.wall(false, 20.075, -X, X, H, C.wall, [{ a: 2.8, b: 4.8, y1: 2.3 }], P);
  lounge(k, H, P);
  droneRoom(k, H, P);
}

// W x L x H in metres; breach on a side wall (side +1 = right), lever offset
// along the wall; drone hatch centre; point lights [x, y, z, intensity, range].
const LAYOUT = {
  scout: {
    W: 6, L: 12, H: 2.6, win: 4.0, breach: { side: 1, z: 0.4, lever: 1.5 }, drone: { x: 0, z: 4.4 }, rooms: scoutRooms,
    lights: [[0, 2.3, -3.6, 5, 9], [0, 2.3, 2.4, 5, 9]],
  },
  racer: {
    W: 5, L: 9, H: 2.5, win: 3.4, breach: { side: 1, z: 1.0, lever: 1.5 }, drone: { x: 0, z: 3.05 }, rooms: racerRooms,
    lights: [[0, 2.2, -2.3, 4, 8], [0, 2.2, 2.0, 4, 8]],
  },
  fighter: {
    W: 7, L: 16, H: 2.6, win: 4.4, breach: { side: 1, z: 3.4, lever: 1.5 }, drone: { x: 0, z: 5.9 }, rooms: fighterRooms,
    lights: [[0, 2.3, -5.9, 5, 9], [0, 2.3, -1.0, 5, 9], [0, 2.3, 5.0, 5, 9]],
  },
  hauler: {
    W: 9, L: 26, H: 2.8, win: 5.0, breach: { side: 1, z: 5.2, lever: -1.5 }, drone: { x: 0, z: 11.0 }, rooms: haulerRooms,
    lights: [[0, 2.5, -10.8, 6, 10], [0, 2.5, -5.7, 6, 10], [0, 2.5, 4.5, 9, 16]],
  },
  cruiser: {
    W: 14, L: 60, H: 3.0, win: 7.0, breach: { side: 1, z: -1.0, lever: 1.5 }, drone: { x: 0, z: 25.2 }, rooms: cruiserRooms,
    lights: [[0, 2.7, -25.5, 10, 16], [0, 2.7, -12.5, 12, 18], [-1.5, 2.7, 16.5, 12, 18]],
  },
};
// New hulls share an interior with a ship of the same class (the exterior is
// their own and encloses that interior, so EVA and the hull hole line up).
Object.assign(LAYOUT, {
  eraser: LAYOUT.racer, tape: LAYOUT.racer, gelpen: LAYOUT.racer,
  witeout: LAYOUT.scout, stickynotes: LAYOUT.scout,
  paperclip: LAYOUT.fighter, compass: LAYOUT.fighter, stapler: LAYOUT.fighter, gluestick: LAYOUT.fighter,
});


export function buildInterior(type, paintName = 'yellow') {
  const s = LAYOUT[type] || LAYOUT.scout;
  const P = paint(paintName);
  const k = new Kit();
  shell(k, s, P);
  const ck = cockpit(k, s, P);
  const breach = breachPanel(k, s);
  s.rooms(k, s, P);
  // Small ships are dim and moody, big ones carry a lot of light (Gev).
  const lightK = { small: 0.7, medium: 1.0, large: 2.4 }[SHIPS[type] && SHIPS[type].cls] || 1;
  for (const [x, y, z, i, d] of s.lights) k.light(x, y, z, i * lightK, d);
  const merged = k.build();
  redrawSigns(k.signs);
  const hw = s.W / 2, hl = s.L / 2;
  // The bounds reach 0.25 m past the hull walls: the walls do the real
  // blocking, and the breach pull must be able to cross the wall plane.
  const bounds = new THREE.Box3(new THREE.Vector3(-hw - 0.25, 0, -hl - 0.25), new THREE.Vector3(hw + 0.25, s.H, hl + 0.25));
  const tw = merged.get(G.str2) || null, blink = k.blink, spin = k.spin;
  return {
    group: k.group, colliders: k.colliders, interact: k.interact,
    spawn: ck.spawn, spawnYaw: 0, seat: ck.seat, screens: k.screens, breach, bounds, lights: k.lights,
    animate(dt, t) {
      const on = Math.floor(t * 1.6) % 2 === 0;
      for (const m of blink) m.visible = on;
      for (const m of spin) m.rotation.y += dt * 2.6;
      if (tw) tw.visible = Math.sin(t * 1.3) > -0.4;
    },
  };
}

// ---------- exteriors ----------

function frameBox(k, x0, y0, x1, y1, z, mat, w = 0.12, d = 0.08) {
  k.box(x0 - w, y0 - w, z - d, x1 + w, y0, z, mat);
  k.box(x0 - w, y1, z - d, x1 + w, y1 + w, z, mat);
  k.box(x0 - w, y0, z - d, x0, y1, z, mat);
  k.box(x1, y0, z - d, x1 + w, y1, z, mat);
}

function nozzle(k, x, y, z, r, len) {
  k.put(FRU(1.15, 12), C.steel, x, y, z + len / 2, 2 * r, len, 2 * r, HP, 0, 0);
  k.put(CYL(12), G.engine, x, y, z + len + 0.03, 2 * r * 1.08, 0.06, 2 * r * 1.08, HP, 0, 0);
  k.put(CONE(10), G.yellow, x, y, z + len + 0.06 + r * 0.45, 2 * r * 0.75, r * 0.9, 2 * r * 0.75, HP, 0, 0);
  return new THREE.Vector3(x, y, z + len + 0.1);
}

function barrel(k, x, y, zTip, len, r = 0.13) {
  k.put(CYL(8), C.dark, x, y, zTip + len / 2, 2 * r, len, 2 * r, HP, 0, 0);
  k.put(CYL(8), C.steel, x, y, zTip + 0.08, 2 * r * 1.4, 0.16, 2 * r * 1.4, HP, 0, 0);
  return new THREE.Vector3(x, y, zTip - 0.05);
}

function extScout(k, P) {
  k.box(-3.45, -0.55, -6.55, 3.45, 2.8, 6.55, P);
  k.box(-3.0, 2.8, -6.55, 3.0, 3.25, 6.55, P);
  k.box(-3.0, -1.0, -6.55, 3.0, -0.55, 6.55, P);
  for (const x of [-3.0, 3.0]) for (const y of [-0.55, 2.8]) k.put(CYL(10), P, x, y, 0, 0.9, 13.1, 0.9, HP, 0, 0);
  // the zip along the top, pull tab at the front
  k.box(-0.1, 3.25, -6.3, 0.1, 3.29, 6.3, C.dark);
  for (let i = 0, z = -6.1; z < 6.1; z += 0.42, i++) { const x = i % 2 ? 0.1 : -0.22; k.box(x, 3.25, z, x + 0.12, 3.28, z + 0.2, C.white); }
  k.box(-0.16, 3.25, -6.95, 0.16, 3.33, -6.2, C.steel);
  k.put(TOR(0.16, 0.045, 12), C.steel, 0, 3.29, -7.1, 1, 1, 1, HP, 0, 0);
  // windshield
  k.box(-2.05, 0.85, -6.62, 2.05, 2.35, -6.55, C.glass);
  frameBox(k, -2.05, 0.85, 2.05, 2.35, -6.55, C.white);
  // stub wings, guns under the tips
  const guns = [];
  for (const side of [-1, 1]) {
    k.box(side > 0 ? 3.4 : -5.4, -0.45, -1.0, side > 0 ? 5.4 : -3.4, -0.2, 3.2, C.white);
    k.box(side > 0 ? 5.3 : -5.45, -0.45, 1.0, side > 0 ? 5.45 : -5.3, 0.6, 3.2, P);
    k.box(side * 5.0 - 0.2, -0.62, -0.6, side * 5.0 + 0.2, -0.45, 0.6, C.steel);
    guns.push(barrel(k, side * 5.0, -0.7, -2.3, 2.6, 0.12));
  }
  const engines = [nozzle(k, -1.7, 1.1, 6.55, 0.75, 1.1), nozzle(k, 1.7, 1.1, 6.55, 0.75, 1.1)];
  k.sign('PENCIL CASE', 3.2, -3.47, 1.6, 0, -HP);
  k.sign('PENCIL CASE', 3.2, 3.47, 1.6, -3.3, HP);
  k.box(-0.7, -1.03, 3.75, 0.7, -1.0, 5.05, C.dark);
  return { hullX: 3.45, belly: -1.03, guns, engines };
}

// Flat octagonal marker body, chisel tip under the windshield, capped tail
// with a clip, one big drive in the cap.
function extRacer(k, P) {
  const cy = 1.25, rx = 4.0, ry = 2.4, a = PI / 8, ap = Math.cos(a);
  const oct = (mat, z0, z1, s = 1) => k.put(CYL(8, a), mat, 0, cy, (z0 + z1) / 2, 2 * rx * s, z1 - z0, 2 * ry * s, HP, 0, 0);
  oct(P, -5.1, 5.3);
  oct(C.white, -5.1, -4.75, 1.03);
  oct(P, 5.3, 10.3, 1.05);
  oct(C.white, 5.6, 5.9, 1.08);
  oct(C.dark, 10.3, 10.5, 0.8);
  k.box(-1.8, 0.8, -5.17, 1.8, 2.3, -5.1, C.glass);
  frameBox(k, -1.8, 0.8, 1.8, 2.3, -5.1, C.white, 0.1);
  // chisel tip: a white holder and the slanted felt nib
  k.box(-2.2, -0.62, -6.5, 2.2, 0.7, -5.1, C.white);
  k.push(0, -0.1, -7.5, 0, 0.5);
  k.box(-1.9, -0.4, -1.4, 1.9, 0.4, 1.4, P);
  k.pop();
  // clip on the cap
  const top = cy + ry * 1.05 * ap;
  k.box(-0.32, top - 0.05, 5.9, 0.32, top + 0.3, 10.0, C.white);
  k.box(-0.38, top - 0.1, 5.5, 0.38, top + 0.45, 5.95, C.white);
  const guns = [];
  for (const x of [-2.6, 2.6]) {
    k.box(x - 0.24, -0.12, -6.2, x + 0.24, 0.34, -5.1, C.steel);
    guns.push(barrel(k, x, 0.1, -8.4, 2.4, 0.13));
  }
  const engines = [nozzle(k, 0, cy, 10.5, 1.4, 1.0)];
  const side = rx * ap;
  k.sign('HIGHLIGHTER', 3.4, -side - 0.02, 1.25, 0, -HP);
  k.sign('HIGHLIGHTER', 3.4, side + 0.02, 1.25, -2.6, HP);
  const bottom = cy - ry * ap;
  k.box(-0.55, bottom - 0.04, 2.5, 0.55, bottom + 0.02, 3.6, C.dark);
  return { hullX: side, belly: bottom - 0.04, guns, engines };
}

function extFighter(k, P) {
  const cy = 1.3, R = 4.3, a = PI / 12;
  k.put(CYL(12, a), P, 0, cy, 0, 2 * R, 17.0, 2 * R, HP, 0, 0);
  k.put(CYL(12, a), C.glass, 0, cy, -7.0, 2 * R * 1.03, 3.0, 2 * R * 1.03, HP, 0, 0);
  for (const z of [-8.0, -7.0, -6.0]) k.put(CYL(12, a), C.dark, 0, cy, z, 2 * R * 1.06, 0.14, 2 * R * 1.06, HP, 0, 0);
  k.put(FRU(0.28, 12, a), C.white, 0, cy, -10.5, 2 * R * 1.03, 4.0, 2 * R * 1.03, -HP, 0, 0);
  k.put(FRU(0.3, 12, a), C.steel, 0, cy, -13.1, 2 * R * 1.03 * 0.28, 1.2, 2 * R * 1.03 * 0.28, -HP, 0, 0);
  k.put(OCT(), C.dark, 0, cy, -13.9, 0.75, 0.75, 0.75);
  const top = cy + R * Math.cos(a);
  k.box(-0.35, top - 0.05, 1.5, 0.35, top + 0.3, 9.2, C.steel);
  k.box(-0.4, top - 0.05, 1.1, 0.4, top + 0.45, 1.6, C.steel);
  k.box(-0.3, top - 0.1, 8.7, 0.3, top + 0.3, 9.2, C.steel);
  k.put(CYL(12, a), C.white, 0, cy, 8.8, 2 * R * 0.98, 0.6, 2 * R * 0.98, HP, 0, 0);
  k.put(CYL(12, a), P, 0, cy, 10.1, 3.0, 2.0, 3.0, HP, 0, 0);
  k.put(CYL(12, a), C.white, 0, cy, 11.15, 2.4, 0.1, 2.4, HP, 0, 0);
  const engines = [nozzle(k, -2.6, cy, 9.1, 0.8, 1.0), nozzle(k, 2.6, cy, 9.1, 0.8, 1.0)];
  const guns = [];
  for (const side of [-1, 1]) {
    k.box(side > 0 ? 4.0 : -7.4, 0.05, -2.5, side > 0 ? 7.4 : -4.0, 0.35, 2.5, C.white);
    k.box(side > 0 ? 7.3 : -7.5, -0.3, -1.0, side > 0 ? 7.5 : -7.3, 0.9, 2.5, P);
    for (const y of [0.62, -0.22]) {
      k.box(side * 6.9 - 0.18, Math.min(y, 0.2), -1.9, side * 6.9 + 0.18, Math.max(y, 0.2), -1.3, C.steel);
      guns.push(barrel(k, side * 6.9, y, -5.1, 3.4, 0.12));
    }
  }
  k.sign('BALLPOINT', 3.6, -R * Math.cos(a) - 0.02, cy, 0, -HP);
  k.sign('BALLPOINT', 3.6, R * Math.cos(a) + 0.02, cy, -2.5, HP);
  const bottom = cy - R * Math.cos(a);
  k.box(-0.65, bottom - 0.04, 5.25, 0.65, bottom + 0.02, 6.55, C.dark);
  return { hullX: R * Math.cos(a), belly: bottom - 0.04, guns, engines };
}

function extHauler(k, P) {
  k.box(-4.95, -0.4, -13.5, 4.95, 3.25, 13.5, C.white);
  for (let y = 0.05; y < 3.2; y += 0.45) k.box(4.95, y, -13.4, 4.97, y + 0.03, 13.4, C.grey);
  k.box(-5.5, 3.25, -14.0, 5.3, 3.6, 14.0, P);
  k.box(-5.5, -0.75, -14.0, 5.3, -0.4, 14.0, P);
  k.box(-5.5, -0.4, -14.0, -4.95, 3.25, 14.0, P);
  k.box(-5.53, 0.55, -6.2, -5.5, 2.45, 6.2, C.white);
  k.sign('RING BINDER', 6.0, -5.54, 1.5, 0, -HP);
  for (const z of [-9, 0, 9]) k.put(TOR(1.5, 0.17, 18), C.steel, -3.4, 3.6, z, 1, 1, 1);
  k.box(-4.0, 3.6, -11.0, -2.8, 3.75, 11.0, C.steel);
  for (const [z, c] of [[-10, C.pink], [-6.5, C.teal], [-3, C.orange], [10.5, C.green]]) k.box(4.95, 2.1, z - 0.7, 5.5, 2.8, z + 0.7, c);
  k.box(-2.5, 0.85, -13.55, 2.5, 2.55, -13.5, C.glass);
  frameBox(k, -2.5, 0.85, 2.5, 2.55, -13.5, C.steel);
  const engines = [nozzle(k, -2.5, 1.4, 13.5, 1.1, 1.2), nozzle(k, 2.5, 1.4, 13.5, 1.1, 1.2)];
  const guns = [];
  for (const x of [-4.3, 4.3]) { k.cyl(x, -12.5, 0.45, 3.6, 3.98, C.steel, 10); guns.push(barrel(k, x, 3.8, -15.3, 2.9, 0.14)); }
  k.box(-0.8, -0.78, 10.2, 0.8, -0.75, 11.8, C.dark);
  return { hullX: 4.95, belly: -0.78, guns, engines };
}

function extCruiser(k, P) {
  k.box(-7.55, -0.9, -30.6, 7.55, 3.45, 30.6, P);
  k.box(-6.0, -1.9, -26.0, 6.0, -0.9, 28.0, C.white);
  // lecture-hall seating stepping up toward the back
  k.box(-7.0, 3.45, -18.0, 7.0, 4.25, 30.6, C.white);
  k.box(-6.2, 4.25, -8.0, 6.2, 5.05, 30.6, P);
  k.box(-5.4, 5.05, 2.0, 5.4, 5.85, 30.6, C.white);
  k.box(-4.6, 5.85, 12.0, 4.6, 6.65, 30.6, P);
  // the board at the front of the hall
  k.box(-4.6, 3.45, -19.2, 4.6, 7.4, -18.8, C.wood);
  k.box(-4.3, 3.75, -19.25, 4.3, 7.1, -19.2, C.board);
  k.box(-4.3, 3.7, -19.45, 4.3, 3.78, -19.2, C.wood);
  k.sign('LECTURE HALL', 7.0, 0, 5.5, -19.26, PI, 0, { bg: '#35503f', fg: '#f6f3e6' });
  k.box(-3.6, 0.85, -30.67, 3.6, 2.75, -30.6, C.glass);
  frameBox(k, -3.6, 0.85, 3.6, 2.75, -30.6, C.white, 0.14);
  k.box(-7.0, -1.5, -31.5, 7.0, 0.35, -30.6, C.white);
  for (const side of [-1, 1]) {
    for (let z = -20; z <= 18; z += 3) {
      if (side > 0 && Math.abs(z + 1) < 1.8) continue;
      k.box(side > 0 ? 7.55 : -7.62, 1.3, z - 0.6, side > 0 ? 7.62 : -7.55, 2.2, z + 0.6, C.glass);
    }
  }
  const guns = [];
  for (const side of [-1, 1]) for (const z of [-15, 0, 15]) {
    k.cyl(side * 6.6, z, 0.36, 4.25, 4.6, C.steel, 10);
    k.cyl(side * 6.6, z, 0.3, 4.6, 4.85, C.dark, 10);
    guns.push(barrel(k, side * 6.6, 4.7, z - 2.9, 2.6, 0.13));
  }
  const engines = [-4.2, 0, 4.2].map((x) => nozzle(k, x, 1.3, 30.6, 1.5, 1.4));
  k.sign('LECTURE HALL', 6.0, -7.57, 0.1, -12, -HP);
  k.sign('LECTURE HALL', 6.0, 7.57, 0.1, -12, HP);
  k.box(-1.5, -1.93, 23.7, 1.5, -1.9, 26.7, C.dark);
  return { hullX: 7.55, belly: -1.93, guns, engines };
}


// ---- the new hulls (each encloses its class interior: racer 5x9, scout 6x12, fighter 7x16) ----
function extEraser(k, P) {
  const cy = 1.25, a = PI / 8, ap = Math.cos(a);
  const oct = (mat, z0, z1, rx, ry) => k.put(CYL(8, a), mat, 0, cy, (z0 + z1) / 2, 2 * rx, z1 - z0, 2 * ry, HP, 0, 0);
  oct(C.pink, -5.4, 5.6, 3.2, 2.0);
  oct(P, -1.2, 3.4, 3.35, 2.12);            // the paper sleeve
  oct(C.dark, 5.6, 5.9, 2.6, 1.6);
  const guns = [barrel(k, 0, cy - 1.2, -7.0, 2.2, 0.16)];
  const engines = [nozzle(k, 0, cy, 5.9, 1.3, 1.1)];
  const side = 3.2 * ap;
  k.sign('ERASER', 3.0, -side - 0.02, cy, 1.1, -HP);
  k.sign('ERASER', 3.0, side + 0.02, cy, 1.1, HP);
  return { hullX: side, belly: cy - 2.0 * ap, guns, engines };
}
function extTape(k, P) {
  k.box(-3.2, -0.25, -5.0, 3.2, 2.75, 5.2, P);
  k.put(CYL(16), C.white, 0, 2.75, 1.0, 4.4, 2.6, 4.4, 0, 0, HP);   // the reel, half buried
  k.put(TOR(1.9, 0.18, 20), C.steel, 1.35, 2.75, 1.0, 1, 1, 1, 0, HP, 0);
  k.box(-2.8, 0.2, -7.6, 2.8, 0.7, -5.0, C.steel);                   // flat applicator nose
  k.box(-2.4, 0.05, -8.1, 2.4, 0.3, -7.6, C.white);
  k.box(-1.6, 0.9, -5.07, 1.6, 2.2, -5.0, C.glass);
  const guns = [];
  for (const x of [-2.4, 2.4]) guns.push(barrel(k, x, 1.0, -6.8, 2.0, 0.12));
  const engines = [nozzle(k, -1.6, 1.2, 5.2, 0.9, 0.8), nozzle(k, 1.6, 1.2, 5.2, 0.9, 0.8)];
  k.sign('CORRECTION TAPE', 4.2, -3.22, 1.3, 0, -HP);
  k.sign('CORRECTION TAPE', 4.2, 3.22, 1.3, 0, HP);
  return { hullX: 3.2, belly: -0.25, guns, engines };
}
function extGelpen(k, P) {
  const cy = 1.25, r = 2.9;
  k.put(CYL(12), P, 0, cy, 1.0, 2 * r, 16.0, 2 * r, HP, 0, 0);
  k.put(CYL(12), C.glass, 0, cy, 0.0, 2 * r * 1.04, 5.0, 2 * r * 1.04, HP, 0, 0);   // the see-through barrel
  k.put(CONE(12), C.steel, 0, cy, -9.0, 2 * r * 0.9, 4.0, 2 * r * 0.9, -HP, 0, 0);  // needle nose
  k.put(CYL(12), C.dark, 0, cy, 9.2, 2 * r * 0.8, 0.4, 2 * r * 0.8, HP, 0, 0);
  const guns = [barrel(k, -1.2, cy - 1.8, -8.0, 2.4, 0.12), barrel(k, 1.2, cy - 1.8, -8.0, 2.4, 0.12)];
  const engines = [nozzle(k, -1.1, cy, 9.4, 0.7, 1.0), nozzle(k, 1.1, cy, 9.4, 0.7, 1.0)];
  k.sign('GEL PEN', 3.0, -r - 0.02, cy, 3.5, -HP);
  k.sign('GEL PEN', 3.0, r + 0.02, cy, 3.5, HP);
  return { hullX: r, belly: cy - r, guns, engines };
}
function extWiteout(k, P) {
  const cy = 1.3, r = 3.55;
  k.put(CYL(14), C.white, 0, cy, 0.0, 2 * r, 12.8, 2 * r, HP, 0, 0);          // the bottle
  k.put(CYL(14), P, 0, cy, 2.5, 2 * r * 1.03, 3.0, 2 * r * 1.03, HP, 0, 0);   // the label
  k.put(FRU(0.45, 14), C.white, 0, cy, -7.6, 2 * r, 2.4, 2 * r, -HP, 0, 0);   // the neck
  k.put(CYL(10), C.dark, 0, cy, -9.3, 2.6, 1.0, 2.6, HP, 0, 0);               // the cap
  k.box(-0.25, cy + r - 0.2, -2.0, 0.25, cy + r + 1.3, 2.0, P);               // flip-cap fin
  const guns = [barrel(k, -2.2, cy - 1.8, -7.8, 2.2, 0.13), barrel(k, 2.2, cy - 1.8, -7.8, 2.2, 0.13)];
  const engines = [nozzle(k, 0, cy, 6.4, 1.2, 1.0)];
  k.sign('CORRECTION FLUID', 4.4, -r - 0.02, cy, 1.0, -HP);
  k.sign('CORRECTION FLUID', 4.4, r + 0.02, cy, 1.0, HP);
  return { hullX: r, belly: cy - r, guns, engines };
}
function extStickynotes(k, P) {
  const layers = [[-0.3, 0.55, -6.4, 6.6, 3.4], [0.55, 1.35, -6.9, 6.1, 3.3], [1.35, 2.15, -7.4, 5.6, 3.2], [2.15, 2.95, -7.9, 5.1, 3.1]];
  layers.forEach(([y0, y1, z0, z1, hx], i) => k.box(-hx, y0, z0, hx, y1, z1, i % 2 ? C.cream : P));
  k.box(-2.0, 2.95, -6.6, 2.0, 3.05, -2.6, C.yellow);   // the bright note on top
  k.box(-1.5, 0.9, -6.47, 1.5, 2.0, -6.4, C.glass);
  const guns = [barrel(k, -2.8, 0.3, -7.6, 2.0, 0.12), barrel(k, 2.8, 0.3, -7.6, 2.0, 0.12)];
  const engines = [nozzle(k, 0, 1.2, 6.6, 1.1, 0.9)];
  k.sign('STICKY NOTES', 3.8, -3.42, 1.0, 0, -HP);
  k.sign('STICKY NOTES', 3.8, 3.42, 1.0, 0, HP);
  return { hullX: 3.4, belly: -0.3, guns, engines };
}
function extPaperclip(k, P) {
  k.box(-3.7, -0.2, -8.3, 3.7, 2.8, 8.3, C.dark);                  // crew body
  for (const x of [-4.5, 4.5]) k.put(CYL(10), C.steel, x, 1.3, 0.5, 1.4, 17.5, 1.4, HP, 0, 0);
  k.put(TOR(4.5, 0.7, 24), C.steel, 0, 1.3, -8.3, 1, 1, 1, HP, 0, 0);   // the bend at the bow
  k.put(TOR(3.0, 0.6, 20), C.steel, 0, 1.3, 9.2, 1, 1, 1, HP, 0, 0);    // the inner bend at the stern
  k.box(-1.8, 0.9, -8.37, 1.8, 2.2, -8.3, C.glass);
  const guns = [barrel(k, -4.5, 1.3, -10.2, 2.4, 0.15), barrel(k, 4.5, 1.3, -10.2, 2.4, 0.15)];
  const engines = [nozzle(k, -1.8, 1.3, 8.3, 1.0, 1.0), nozzle(k, 1.8, 1.3, 8.3, 1.0, 1.0)];
  k.sign('PAPERCLIP', 3.6, -3.72, 1.3, 0, -HP);
  k.sign('PAPERCLIP', 3.6, 3.72, 1.3, 0, HP);
  return { hullX: 3.7, belly: -0.2, guns, engines };
}
function extCompass(k, P) {
  k.box(-3.7, -0.2, -8.3, 3.7, 2.8, 8.3, P);                      // pivot hub around the crew
  k.put(CYL(12), C.steel, 0, 3.4, -2.0, 2.6, 1.4, 2.6, 0, 0, 0);  // the pivot knob
  // the two legs, splayed back and out
  k.put(CYL(10), C.steel, -6.2, 1.3, 5.0, 1.6, 12.0, 1.6, HP, 0, 0.55);
  k.put(CYL(10), C.steel, 6.2, 1.3, 5.0, 1.6, 12.0, 1.6, HP, 0, -0.55);
  k.put(CONE(10), C.dark, -9.2, 1.3, 10.3, 1.6, 2.4, 1.6, HP, 0, 0.55);    // needle point
  k.box(8.4, 0.6, 9.4, 10.4, 2.0, 11.4, C.wood);                         // pencil foot
  k.box(-1.8, 0.9, -8.37, 1.8, 2.2, -8.3, C.glass);
  const guns = [barrel(k, -2.8, 0.2, -9.8, 2.2, 0.14), barrel(k, 0, 0.2, -9.8, 2.2, 0.14), barrel(k, 2.8, 0.2, -9.8, 2.2, 0.14)];
  const engines = [nozzle(k, 0, 1.3, 8.3, 1.2, 1.0)];
  k.sign('COMPASS', 3.4, -3.72, 1.3, 0, -HP);
  k.sign('COMPASS', 3.4, 3.72, 1.3, 0, HP);
  return { hullX: 3.7, belly: -0.2, guns, engines };
}
function extStapler(k, P) {
  k.box(-3.7, -0.3, 1.5, 3.7, 3.6, 8.4, P);        // the spring housing (tall stern)
  k.box(-3.7, -0.3, -8.4, 3.7, 2.8, 1.5, P);       // the jaw (low bow)
  k.box(-0.55, 3.6, -3.0, 0.55, 4.1, 8.4, C.steel);  // hinge ridge down the spine
  k.box(-0.55, 2.8, -8.4, 0.55, 3.1, -3.0, C.steel);
  k.box(-3.2, -0.3, -9.8, 3.2, 1.1, -8.4, C.steel);  // the staple jaw tip
  k.box(-1.8, 0.9, -8.47, 1.8, 2.2, -8.4, C.glass);
  const guns = [barrel(k, -2.9, 0.4, -10.8, 2.0, 0.16), barrel(k, 0, 0.4, -10.8, 2.0, 0.16), barrel(k, 2.9, 0.4, -10.8, 2.0, 0.16)];
  const engines = [nozzle(k, -1.8, 1.6, 8.4, 1.1, 1.0), nozzle(k, 1.8, 1.6, 8.4, 1.1, 1.0)];
  k.sign('STAPLER', 3.4, -3.72, 1.6, 3.5, -HP);
  k.sign('STAPLER', 3.4, 3.72, 1.6, 3.5, HP);
  return { hullX: 3.7, belly: -0.3, guns, engines };
}
function extGluestick(k, P) {
  const cy = 1.3, r = 4.3;
  k.put(CYL(14), P, 0, cy, 0.0, 2 * r, 16.8, 2 * r, HP, 0, 0);
  for (const z of [-2.2, -1.1, 0.0, 1.1]) k.put(TOR(r, 0.14, 24), C.white, 0, cy, z, 1, 1, 1, 0, 0, 0);   // screw threads
  k.put(FRU(0.45, 14), C.white, 0, cy, -9.4, 2 * r, 2.0, 2 * r, -HP, 0, 0);   // the domed cap
  k.put(CYL(14), C.dark, 0, cy, 8.6, 2 * r * 0.85, 0.4, 2 * r * 0.85, HP, 0, 0);
  const guns = [barrel(k, -2.6, cy - 2.4, -9.6, 2.2, 0.14), barrel(k, 2.6, cy - 2.4, -9.6, 2.2, 0.14)];
  const engines = [nozzle(k, 0, cy, 8.8, 1.6, 1.1)];
  k.sign('GLUE STICK', 3.8, -r - 0.02, cy, 3.2, -HP);
  k.sign('GLUE STICK', 3.8, r + 0.02, cy, 3.2, HP);
  return { hullX: r, belly: cy - r, guns, engines };
}

const EXTERIOR = {
  scout: extScout, racer: extRacer, fighter: extFighter, hauler: extHauler, cruiser: extCruiser,
  eraser: extEraser, tape: extTape, gelpen: extGelpen, witeout: extWiteout, stickynotes: extStickynotes,
  paperclip: extPaperclip, compass: extCompass, stapler: extStapler, gluestick: extGluestick,
};

// Jagged dark tear with a torn bare-metal rim, facing out along normal.
function holeMesh(pos, normal) {
  const jag = [1, 0.62, 0.95, 0.55, 0.88, 0.7, 1, 0.58, 0.92, 0.66, 0.97, 0.52, 0.85, 0.7];
  const path = (sx, sy, k0, P = THREE.Shape) => {
    const s = new P();
    for (let i = 0; i < jag.length; i++) {
      const a = (i / jag.length) * PI * 2, r = jag[(i + k0) % jag.length];
      const x = Math.cos(a) * r * sx, y = Math.sin(a) * r * sy;
      if (i) s.lineTo(x, y); else s.moveTo(x, y);
    }
    return s;
  };
  const m = new THREE.Mesh(new THREE.ShapeGeometry(path(0.72, 1.0, 0)), C.hole);
  const rimShape = path(0.95, 1.25, 3);
  rimShape.holes.push(path(0.7, 0.98, 0, THREE.Path));
  const rim = new THREE.Mesh(new THREE.ShapeGeometry(rimShape), C.steel);
  rim.position.z = -0.015;
  m.add(rim);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  m.position.copy(pos).addScaledVector(normal, 0.035);
  m.visible = false;
  return m;
}

export function buildExterior(type, paintName = 'yellow') {
  const key = LAYOUT[type] ? type : 'scout', s = LAYOUT[key];
  const k = new Kit();
  const r = EXTERIOR[key](k, paint(paintName));
  k.build();
  redrawSigns(k.signs);
  // collision / hit radius and length from the actual hull vertices
  k.group.updateMatrixWorld(true);
  let r2 = 0, zmin = Infinity, zmax = -Infinity;
  k.group.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      r2 = Math.max(r2, _v.lengthSq()); zmin = Math.min(zmin, _v.z); zmax = Math.max(zmax, _v.z);
    }
  });
  const side = s.breach.side;
  const pos = new THREE.Vector3(side * r.hullX, 1.2, s.breach.z), normal = new THREE.Vector3(side, 0, 0);
  const mesh = holeMesh(pos, normal);
  k.group.add(mesh);
  return {
    group: k.group, radius: Math.sqrt(r2), length: zmax - zmin,
    guns: r.guns, engines: r.engines,
    hole: { pos, normal, mesh },
    dronePort: new THREE.Vector3(s.drone.x, r.belly - 1.5, s.drone.z),
  };
}

// ---------- walkability check ----------

// Flood fill over the colliders with the game's player radius, from spawn.
// Proves every interactable can be picked by E from a reachable spot (same
// range, height and facing rules as game.js nearestInteract), and checks the
// breach layout the pull-out relies on.
export function walkCheck(I, R = 0.3, step = 0.1) {
  const problems = [];
  const b = I.bounds, cols = I.colliders, items = I.interact;
  for (const c of cols) if (!(c.x0 < c.x1 && c.z0 < c.z1)) problems.push(`bad collider ${JSON.stringify(c)}`);
  const x0 = b.min.x + R, z0 = b.min.z + R;
  const nx = Math.floor((b.max.x - R - x0) / step) + 1, nz = Math.floor((b.max.z - R - z0) / step) + 1;
  const free = (x, z) => {
    for (const c of cols) {
      const dx = x - Math.min(Math.max(x, c.x0), c.x1), dz = z - Math.min(Math.max(z, c.z0), c.z1);
      if (dx * dx + dz * dz < R * R) return false;
    }
    return true;
  };
  const grid = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) grid[j * nx + i] = free(x0 + i * step, z0 + j * step) ? 1 : 0;
  const cellOf = (x, z) => [Math.round((x - x0) / step), Math.round((z - z0) / step)];
  if (!free(I.spawn.x, I.spawn.z)) problems.push('spawn touches a collider');
  const [si, sj] = cellOf(I.spawn.x, I.spawn.z);
  const queue = [];
  if (grid[sj * nx + si] === 1) { grid[sj * nx + si] = 2; queue.push(sj * nx + si); } else problems.push('spawn cell is blocked');
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q], i = c % nx, j = (c - i) / nx;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, bb = j + dj;
      if (a < 0 || bb < 0 || a >= nx || bb >= nz) continue;
      const n = bb * nx + a;
      if (grid[n] === 1) { grid[n] = 2; queue.push(n); }
    }
  }
  let free1 = 0;
  for (let n = 0; n < grid.length; n++) if (grid[n] === 1) free1++;
  const pick = (px, pz, fx, fz) => {
    let best = null, bd = Infinity;
    for (const it of items) {
      const dx = it.pos.x - px, dz = it.pos.z - pz, dy = it.pos.y - 1.2, d = Math.hypot(dx, dz);
      if (d > (it.r || 1.3) || Math.abs(dy) > 2.2) continue;
      if (d > 0.5 && (dx * fx + dz * fz) / d < 0.2) continue;
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  };
  const usable = {};
  for (const it of items) {
    let ok = false;
    const r = it.r || 1.3;
    const [ci, cj] = cellOf(it.pos.x, it.pos.z), span = Math.ceil(r / step) + 1;
    for (let j = Math.max(0, cj - span); j <= Math.min(nz - 1, cj + span) && !ok; j++) {
      for (let i = Math.max(0, ci - span); i <= Math.min(nx - 1, ci + span) && !ok; i++) {
        if (grid[j * nx + i] !== 2) continue;
        const px = x0 + i * step, pz = z0 + j * step, dx = it.pos.x - px, dz = it.pos.z - pz, d = Math.hypot(dx, dz) || 1;
        if (pick(px, pz, dx / d, dz / d) === it) ok = true;
      }
    }
    usable[it.id] = (usable[it.id] || 0) + (ok ? 1 : 0);
    if (!ok) problems.push(`${it.id} at (${it.pos.x.toFixed(2)}, ${it.pos.z.toFixed(2)}) cannot be picked from any reachable spot`);
  }
  const br = I.breach;
  if (br) {
    const lever = items.find((i) => i.id === 'breach');
    if (!lever) problems.push('no breach lever');
    else {
      const d = Math.hypot(lever.pos.x - br.pos.x, lever.pos.z - br.pos.z);
      if (d < 1.2 || d > 2.0) problems.push(`breach lever is ${d.toFixed(2)} m from the panel`);
      const ex = br.pos.x - br.normal.x * (T / 2 + 0.02), ez = br.pos.z - br.normal.z * (T / 2 + 0.02);
      for (let t = 0; t <= 1; t += 0.02) {
        const x = lever.pos.x + (ex - lever.pos.x) * t, z = lever.pos.z + (ez - lever.pos.z) * t;
        if (cols.some((c) => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1)) { problems.push('a collider sits between the breach lever and the panel'); break; }
      }
    }
    const rx = br.pos.x - br.normal.x * 1.3, rz = br.pos.z - br.normal.z * 1.3;
    const [ri, rj] = cellOf(rx, rz);
    if (!free(rx, rz) || grid[rj * nx + ri] !== 2) problems.push('re-entry spot inside the breach is blocked or unreachable');
    if (br.panel.parent !== I.group) problems.push('breach panel is not a direct child of the interior group');
  }
  return { ok: problems.length === 0, problems, cells: nx * nz, reached: queue.length, unreached: free1, usable };
}
