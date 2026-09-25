// The Red Margin's command: the three bosses from Doodle Shooter, one per act,
// and the five lieutenants that hold the great clusters (docs/STORY.md).
//
// Nothing here is a new kind of ship. A boss is a capital ship out of
// actors.js - the same dreadnought or carrier every zone already fields -
// scaled up, recoloured into its own materials, given a health bar, an
// announcement, a codex unlock, an act flag in the save, and a short list of
// telegraphed moves drawn from Doodle Shooter's own vocabulary: summon, throw,
// charge, rub, spray, stomp. Its turrets, its beam and its hit boxes are the
// ordinary capital ones, so a boss is hittable everywhere a dreadnought is.
//
// Every heavy move announces itself first (a toast, the boss bar's own line,
// a sound) and only then lands, so nothing here can hit a player who is
// watching. The one move with no warning window of its own is `rub`, which
// fires the ship's real bow beam: that already telegraphs itself with three
// seconds of charge and a pink aim line before it burns.
//
// Lairs are fixed places, not part of rollZones(): the galactic centre, the
// heart of Andromeda, the five clusters and the Great Attractor. Flying into
// one starts the encounter in front of you, the way entering a zone does.
// Fleeing ends it and the boss comes back whole; that is deliberate, so a
// half-finished fight can never leave a wounded boss stranded in the dark.
import * as THREE from 'three';
import { glow, red, ID } from './mats.js';
import { audio } from './audio.js';
import { vdist } from './util.js';

const FWD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _c1 = new THREE.Color(), _c2 = new THREE.Color();

const LEASH = 42000;      // fly this far from a boss and the encounter lets you go
const REACH = 9000;       // a boss only spends a move on you inside this
const SUMMON_CAP = 6;     // red guys a boss may have out at once (the carrier's own cap)
const AFTER = 6;          // seconds before another lair may take you
const LAIR_CAP = 1.2e8;   // no lair may interdict more of the sky than this
const HINT_AT = 14;       // multiples of a lair's radius where its hint arrives
const RUB_SWEEP = 0.18;   // radians a second the eraser beam is dragged across

// The eight, in the order their lairs are tested. Lieutenants come first: they
// stand in front of their cluster, and in Hydra-Centaurus the Staple Remover
// stands in front of the Inkblot's own leak (docs/STORY.md, Act 3).
//   base/scale: which capital hull, and how much bigger than a normal one
//   hull/glow: its own colours, mixed into the red hull shading (see tint)
//   hpMult: multiplies the live 2026-09-23 capital HP (700 / 950)
//   moves: unlocked one phase at a time, first move from the start
export const BOSSES = {
  scribbler: {
    name: 'The Scribbler', base: 'dreadnought', scale: 1.4, hull: 0xff8a3c, glow: 0xffc23c, hpMult: 3,
    lieutenant: true, act: 0, codex: null, moves: ['spray', 'rub'],
    tell: 'M87 goes out like a light behind a scrawl. Nobody can read the map now.',
    beat: 'Virgo can read its own map again.',
  },
  smudge: {
    name: 'The Smudge', base: 'carrier', scale: 1.3, hull: 0x2a0912, glow: 0x555b66, hpMult: 3,
    lieutenant: true, act: 0, codex: null, moves: ['rub', 'summon'],
    tell: 'Somewhere in the missing mass. Hard to see, easy to feel.',
    beat: 'Coma is only missing mass now.',
  },
  holepunch: {
    name: 'The Hole Punch', base: 'dreadnought', scale: 1.4, hull: 0x4d7cff, glow: 0x4deeff, hpMult: 3,
    lieutenant: true, act: 0, codex: null, moves: ['stomp', 'summon'],
    tell: 'Neat round holes, one fleet at a time. It keeps the dots.',
    beat: 'Fornax keeps its own dots.',
  },
  papercut: {
    name: 'The Paper Cut', base: 'dreadnought', scale: 1.1, hull: 0xff3b5c, glow: 0xffc23c, hpMult: 2,
    lieutenant: true, act: 0, codex: null, moves: ['charge', 'spray'],
    tell: 'Small, fast, and it really, really hurts.',
    beat: 'It stops hurting.',
  },
  stapleremover: {
    name: 'The Staple Remover', base: 'carrier', scale: 1.5, hull: 0x5b6577, glow: 0xff8a3c, hpMult: 3,
    lieutenant: true, act: 0, codex: null, moves: ['throw', 'rub'],
    tell: 'Jaws on both sides. It pries convoys apart for a living.',
    beat: 'The convoys hold together.',
  },
  doodler: {
    name: 'The Doodler', base: 'dreadnought', scale: 2, hull: 0x4deeff, glow: 0xffc23c, hpMult: 5,
    lieutenant: false, act: 1, codex: 'doodler', moves: ['summon', 'throw', 'charge'],
    tell: 'Near the centre something is drawing. The wings arrive already finished.',
    beat: 'Act 1. The drawings come apart without it.',
  },
  eraser: {
    name: 'The Eraser', base: 'carrier', scale: 1.9, hull: 0xffc23c, glow: 0xff3b5c, hpMult: 6,
    lieutenant: false, act: 2, codex: 'eraser', moves: ['rub', 'stomp', 'charge'],
    tell: 'One shot, one erasure was your line. Out here it is his business model.',
    beat: 'Act 2. Nothing left to rub out with.',
  },
  inkblot: {
    name: 'The Inkblot', base: 'dreadnought', scale: 2.2, hull: 0xff4de1, glow: 0x2a0912, hpMult: 7,
    lieutenant: false, act: 3, codex: 'inkblot', moves: ['spray', 'throw', 'summon'],
    tell: 'It has been leaking toward the place every galaxy is drifting. It would like you to wait.',
    beat: 'Act 3. It dries, and it glows like everything else out here.',
  },
};

// Hull HP: the live capital numbers (dreadnought 700, carrier 950) times the
// boss's own multiplier. Calculated from that tuning pass, not playtested by
// hand; tools/test.mjs measures real player damage against a live boss and
// fails if any of these puts a fight outside a sane length.
export function bossHp(id) {
  const b = BOSSES[id];
  return Math.round((b.base === 'carrier' ? 950 : 700) * b.hpMult);
}

// Every heavy move says what it is first. `tell` is the warning, `now` is what
// the HUD says when a new phase unlocks it, `warn` is the window between the
// warning and the hit, `cd` the wait before the next move.
export const MOVES = {
  summon: { tell: 'is drawing reinforcements', now: 'It draws reinforcements now.', warn: 1.6, cd: 16 },
  throw: { tell: 'is winding up a throw', now: 'It throws now.', warn: 1.1, cd: 9 },
  charge: { tell: 'is charging', now: 'It charges now.', warn: 1.3, cd: 12 },
  rub: { tell: 'is bringing the eraser round', now: 'It has the eraser out now.', warn: 0, cd: 14 },
  spray: { tell: 'is loading a spray', now: 'It sprays now.', warn: 0.9, cd: 8 },
  stomp: { tell: 'is dropping on you', now: 'It drops on you now.', warn: 1.2, cd: 11 },
};

// Any unit vector at right angles to v, without a special case at the poles.
function perp(out, v) {
  out.set(0, 1, 0);
  if (Math.abs(v.y) > 0.9) out.set(1, 0, 0);
  return out.cross(v).normalize();
}

// Recolours one cloned capital group in place. Every capital of a kind shares
// its material instances (actors.js caches the built group and clone() keeps
// the references), so this walks the clone and swaps in fresh materials: the
// red hull shades keep their own light and dark and are pulled toward the
// boss's colour, the glows become its glow. Textured materials (the captain's
// face) are left alone. Never call it on a template.
export function tint(group, hull, glowColor) {
  const swap = new Map();
  group.traverse((o) => {
    const m = o.material;
    if (!o.isMesh || !m || m.map) return;
    if (!swap.has(m)) {
      let n = null;
      if (Math.abs(m.opacity - ID.ENEMY) < 0.01 && m.color) {
        n = red(_c1.copy(m.color).lerp(_c2.set(hull), 0.55).getHex(), { rim: hull });
      } else if (Math.abs(m.opacity - ID.GLOW) < 0.01) {
        n = glow(glowColor);
      }
      swap.set(m, n);
    }
    const n = swap.get(m);
    if (n) o.material = n;
  });
  return group;
}

export class Bosses {
  constructor(game) {
    this.g = game;
    this.lairs = null;     // built once, after the catalogues are in
    this.active = null;    // { id, e, where } while a boss is on the board
    this.sweep = 0;        // seconds until a won fight is swept up
    this.cool = 0;         // seconds before another lair may take you
    this.tick = 0;
    this.won = null;       // the last boss beaten, for the act-3 curtain
    this.forState = null;  // the save these lair flags belong to
  }

  // Called by Game.clearCombat, so fleeing, dying and the test harness all
  // leave the encounter in the same state: nothing on the board, this lair
  // disarmed until you have left it, and a beat before the next one.
  clear() {
    const a = this.active;
    this.active = null;
    this.sweep = 0;
    if (a && this.lairs) { const l = this.lairs.find((x) => x.id === a.id); if (l) l.armed = false; }
    if (a && this.cool < AFTER) this.cool = AFTER;
  }

  // ---------- where they live ----------
  // Eight fixed lairs, each anchored on a real place from the story: the
  // galactic centre, Andromeda, the five clusters, the Great Attractor. The
  // radius is the interdiction sphere, not the boss's own position - the fight
  // itself is placed in front of the player, so arriving anywhere in the lair
  // starts it where you can see it.
  build() {
    const u = this.g.u;
    if (!u || !u.mw || !u.galaxies.length) return false;
    const lairs = [];
    const region = (frag) => (u.regions || []).find((r) => r.name.includes(frag));
    const put = (id, pos, r, where, hint) => {
      if (!pos || !(r > 0)) return;
      lairs.push({ id, pos: { ...pos }, r: Math.max(2e6, Math.min(LAIR_CAP, r)), where, hint, armed: true, hinted: false });
    };
    // A cluster's own region is millions of light-years wide, which would make
    // its lair a quarter of the sky. The sphere is capped at LAIR_CAP - a place,
    // not a quadrant - and centred on the cluster's heart, which for the three
    // real clusters is the galaxy the region itself is anchored on. A hint says
    // where to steer long before you are close enough to be interdicted.
    const V = region('Virgo'), C = region('Coma'), F = region('Fornax'), P = region('Perseus'), H = region('Hydra');
    if (V) put('scribbler', V.pos, V.R * 0.2, 'the Virgo Cluster', 'M87, at the heart of Virgo');
    if (C) put('smudge', C.pos, C.R * 0.2, 'the Coma Cluster', 'the middle of Coma');
    if (F) put('holepunch', F.pos, F.R * 0.2, 'the Fornax Cluster', 'the middle of Fornax');
    if (P) put('papercut', P.pos, P.R * 0.05, 'Perseus-Pisces', 'the Perseus-Pisces wall');
    // One region hosts two encounters (docs/STORY.md puts the Staple Remover
    // and the Inkblot's leak both in Hydra-Centaurus): the lieutenant stands in
    // the supercluster's way, the blot sits deeper in, behind him. The lairs are
    // tested in this table's order, so you meet the jaws first.
    if (H) put('stapleremover', H.pos, H.R * 0.05, 'Hydra-Centaurus', 'the Zone of Avoidance, toward Norma');
    const sgr = u.sights.find((s) => s.name === 'Sagittarius A*');
    put('doodler', sgr ? sgr.pos : u.mw.pos, 2.2e6, 'near the galactic centre', 'Sagittarius A*, the galactic centre');
    const m31 = u.findGalaxy('Andromeda Galaxy') || u.findGalaxy('M31');
    if (m31) put('eraser', m31.pos, m31.R * 0.3, 'in Andromeda', 'the middle of Andromeda');
    if (H) put('inkblot', H.pos, H.R * 0.015, 'at the Great Attractor', 'the Great Attractor itself');
    this.lairs = lairs;
    return true;
  }

  lair(id) { return (this.lairs || []).find((l) => l.id === id) || null; }

  // Can this one take you right now? Acts run in order, and the lieutenants
  // are Act 2 work at the earliest: a brand new Pencil Case that warps to
  // Virgo on its first tank does not get jumped by a 2,100 hull boss.
  available(id) {
    const st = this.g.state, B = BOSSES[id];
    if (!B || st.bossesDefeated.includes(id)) return false;
    if (B.lieutenant) return (st.actProgress | 0) >= 1;
    return (st.actProgress | 0) >= B.act - 1;
  }

  // ---------- the encounter ----------
  update(dt) {
    const g = this.g;
    if (this.sweep > 0) { this.sweep -= dt; if (this.sweep <= 0) this.finish(); }
    if (this.cool > 0) this.cool = Math.max(0, this.cool - dt);
    if (!this.lairs && !this.build()) return;
    // A new voyage is a new save object, and the Red Margin holds all eight
    // lairs again: every one of them re-arms, and its hint is unsaid again.
    if (this.forState !== g.state) {
      this.forState = g.state;
      for (const l of this.lairs) { l.armed = true; l.hinted = false; }
    }
    if (this.active) { this.watch(dt); return; }
    const sh = g.ship;
    if (g.zone || !sh || sh.warp || g.mode === 'title' || g.mode === 'dead') return;
    if ((this.tick = (this.tick + 1) % 10)) return;
    for (const l of this.lairs) {
      const d = vdist(l.pos, sh.pos);
      if (!l.armed) { if (d > l.r * 1.6) l.armed = true; continue; }
      if (!this.available(l.id)) continue;
      if (d > l.r) {
        // Close enough to hear about it, not close enough to be held: one line
        // naming where to steer, once per lair per session.
        if (!l.hinted && d < l.r * HINT_AT) {
          l.hinted = true;
          g.ui.toast(`${BOSSES[l.id].name} holds ${l.where}. Look for it at ${l.hint}.`);
        }
        continue;
      }
      if (this.cool > 0) return;
      this.start(l);
      return;
    }
  }

  // The fight is placed the way a zone places its fleet: ahead of the ship,
  // leaning toward the middle of the lair.
  start(l) {
    const g = this.g, sh = g.ship, B = BOSSES[l.id];
    _v1.set(l.pos.x - sh.pos.x, l.pos.y - sh.pos.y, l.pos.z - sh.pos.z);
    if (_v1.lengthSq() < 1) _v1.copy(FWD).applyQuaternion(sh.q);
    _v1.normalize();
    _v2.copy(FWD).applyQuaternion(sh.q).lerp(_v1, 0.5);
    if (_v2.lengthSq() < 1e-4) _v2.copy(_v1);
    _v2.normalize();
    const e = this.spawn(l.id, { x: sh.pos.x + _v2.x * 4200, y: sh.pos.y + _v2.y * 4200, z: sh.pos.z + _v2.z * 4200 });
    this.active = { id: l.id, e, where: l.where };
    l.armed = false;
    // Cruise and the autopilot drop: at cruise speeds you would be past it
    // before the bar finished drawing.
    if (sh.cruise) { sh.cruise = false; sh.cs = Math.min(sh.cs, g.stat('speed')); sh.vel.setLength(Math.min(sh.vel.length(), g.stat('speed'))); }
    if (sh.auto) sh.auto = null;
    g.ui.big(B.name.toUpperCase(), B.tell);
    g.ui.toast(`${B.name} holds ${l.where}. ${B.lieutenant ? 'A lieutenant of the Red Margin.' : `Act ${B.act}.`}`);
    audio.sfx('alarm');
    audio.mood('combat');
    if (B.codex) g.unlockCodex(B.codex);
    if (l.id === 'inkblot') g.unlockCodex('attractor');      // Act 3 names its boss and its region in one beat
    if (B.lieutenant) g.unlockCodex('laniakea');             // meeting one means you are out in the clusters
    return e;
  }

  // A capital ship, promoted. Everything the normal spawn builds is kept; the
  // scale, the colours, the hull points and the moves are the difference.
  spawn(id, pos) {
    const g = this.g, B = BOSSES[id], hp = bossHp(id);
    const e = g.spawnCapital(B.base, pos);
    const grp = e.obj.group;
    // Re-measure at the boss's own size: the turret mounts, the beam port and
    // the hull box all come out of the group's world transform, so they have to
    // be read again with the scale on.
    grp.position.set(0, 0, 0);
    grp.quaternion.identity();
    grp.scale.setScalar(B.scale);
    grp.updateMatrixWorld(true);
    for (const t of e.turrets) { t.node.getWorldPosition(_v3); t.local.copy(_v3); t.hp = 60; }
    if (e.obj.beamPort) { e.obj.beamPort.getWorldPosition(_v3); e.beamLocal.copy(_v3); }
    e.box.setFromObject(grp);
    tint(grp, B.hull, B.glow);
    e.scale = B.scale;                       // the draw loop multiplies its own distance squash by this
    e.radius = e.obj.radius * B.scale;
    e.name = B.name;
    e.hp = e.max = hp;
    e.boss = true;
    e.bossId = id;
    e.lieutenant = B.lieutenant;
    e.movesAll = B.moves;
    e.moves = [B.moves[0]];
    e.phase = 0;
    e.moveCd = 5;
    e.mv = null;
    e.tell = '';
    e.drew = false;
    return e;
  }

  // Alive, and still worth fighting? Beyond the leash the Red Margin lets you
  // go and puts the boss back the way it was.
  watch(dt) {
    const g = this.g, a = this.active;
    if (!a.e || a.e.dead) return;                       // killed() owns the ending
    if (vdist(a.e.pos, g.ship.pos) > LEASH) {
      g.ui.big('YOU FLED', `${a.e.name} still holds ${a.where}.`);
      audio.mood('cruise');
      this.finish();
    }
  }

  // Sweep the board. Called a beat after a win and the moment a flight ends,
  // never from inside hurt(): clearCombat rebuilds the enemy and shot lists,
  // which updateCombat is walking when a shot lands.
  finish() {
    const g = this.g, won = this.won;
    this.won = null;
    // Say why the board empties: what a boss drew goes when the boss goes, and
    // a player still shooting at it deserves the line rather than the puzzle.
    let left = 0;
    for (const e of g.enemies) if (!e.dead) left++;
    g.clearCombat();                                    // calls clear() back on the way through
    if (won && left) g.ui.toast('What it drew comes apart with it.');
    audio.mood('cruise');
    // The sky keeps going, but the notebook closes on the Inkblot.
    if (won === 'inkblot') { g.unlock(); g.ui.open('credits'); }
  }

  // ---------- the moves ----------
  // One call per frame per boss, from updateCombat's capital branch, after the
  // ordinary turret and beam work: a boss keeps every gun a dreadnought has.
  move(e, dt, at, dist) {
    const g = this.g;
    const frac = e.hp / Math.max(1, e.max);
    const steps = e.lieutenant ? [0.5] : [0.66, 0.33];
    const want = steps.filter((s) => frac <= s).length;
    if (want !== e.phase) {
      e.phase = want;
      e.moves = e.movesAll.slice(0, e.phase + 1);
      g.ui.toast(`${e.name}: phase ${e.phase + 1} of ${e.movesAll.length}. ${MOVES[e.moves[e.moves.length - 1]].now}`);
      audio.sfx('alarm', { vol: 0.3 });
    }
    if (e.mv) { this.run(e, dt, at, dist); return; }
    e.moveCd -= dt;
    if (e.moveCd > 0 || dist > REACH) return;
    this.begin(e, e.moves[Math.floor(Math.random() * e.moves.length)]);
  }

  // The telegraph. Nothing lands in the same breath as the warning.
  begin(e, name) {
    if (!MOVES[name]) return null;
    e.mv = { name, t: 0, fired: false, hit: false, dir: new THREE.Vector3() };
    e.tell = MOVES[name].tell;
    this.g.ui.toast(`${e.name} ${MOVES[name].tell}.`);
    audio.sfx(name === 'rub' ? 'beamCharge' : 'alarm', { vol: 0.35 });
    return e.mv;
  }

  // Where the bow emitter actually is, in world units.
  port(out, e) {
    out.copy(e.beamLocal).applyQuaternion(e.q);
    out.x += e.pos.x; out.y += e.pos.y; out.z += e.pos.z;
    return out;
  }

  end(e, cd) {
    e.moveCd = cd;
    e.mv = null;
    e.tell = '';
  }

  run(e, dt, at, dist) {
    const g = this.g, m = e.mv, M = MOVES[m.name], sh = g.ship;
    m.t += dt;
    switch (m.name) {
      case 'summon':
        if (m.t < M.warn) return;
        this.summon(e, at);
        this.end(e, M.cd);
        return;
      case 'throw': {
        if (m.t < M.warn) return;
        // A hurled lump of ink: slow enough to see coming, heavy if it lands.
        _v1.set(at.x - e.pos.x, at.y - e.pos.y, at.z - e.pos.z).normalize();
        const n = e.lieutenant ? 1 : 3;
        for (let i = 0; i < n; i++) {
          _v2.copy(_v1);
          if (i) { perp(_v3, _v1); _v2.applyAxisAngle(_v3, (i === 1 ? 1 : -1) * 0.06).normalize(); }
          g.addShot({ x: e.pos.x, y: e.pos.y, z: e.pos.z }, _v2.clone().multiplyScalar(700), 45, 'enemy');
        }
        audio.sfx('bomb');
        this.end(e, M.cd);
        return;
      }
      case 'charge': {
        // Aims for the whole telegraph, then commits: side-step and it goes by.
        if (m.t < M.warn) { m.dir.set(at.x - e.pos.x, at.y - e.pos.y, at.z - e.pos.z).normalize(); return; }
        if (m.t < M.warn + 2.5) {
          const k = 1400 * dt;
          e.pos.x += m.dir.x * k; e.pos.y += m.dir.y * k; e.pos.z += m.dir.z * k;
          const rr = e.radius + ((g.exterior && g.exterior.radius) || 20);
          if (!m.hit && vdist(e.pos, sh.pos) < rr) {
            m.hit = true;
            g.damage(50, `rammed by ${e.name}`);
            g.boom({ x: sh.pos.x, y: sh.pos.y, z: sh.pos.z }, 30);
          }
          return;
        }
        this.end(e, M.cd);
        return;
      }
      case 'rub': {
        // The ship's own bow beam, brought round early and then dragged
        // sideways: three seconds of charge and a pink aim line are the
        // warning, and standing still in it is the mistake. Up close the
        // eraser goes over you as well, which is the part that hurts.
        const b = e.beam;
        if (!m.fired) {
          m.fired = true;
          b.state = 'charge';
          b.t = 0;
          // Aim from the emitter, not the hull's middle: at this size the two
          // are hundreds of metres apart and the beam would miss down one side.
          this.port(_v1, e);
          b.dir.set(at.x - _v1.x, at.y - _v1.y, at.z - _v1.z);
          if (b.dir.lengthSq() < 1) b.dir.copy(FWD).applyQuaternion(e.q);
          b.dir.normalize();
          audio.sfx('beamCharge');
          return;
        }
        if (b.state === 'fire') {
          if (!m.hit) {
            m.hit = true;
            if (vdist(e.pos, sh.pos) < e.radius + 1400) g.damage(40, `${e.name} rubbed you out`);
          }
          _v1.copy(UP).applyQuaternion(e.q);
          b.dir.applyAxisAngle(_v1, RUB_SWEEP * dt).normalize();
          return;
        }
        if (b.state === 'idle' || m.t > 8) this.end(e, M.cd);
        return;
      }
      case 'spray': {
        if (m.t < M.warn) return;
        // A fan across your path, wide enough to see and thin enough to leave.
        _v1.set(at.x - e.pos.x, at.y - e.pos.y, at.z - e.pos.z);
        if (_v1.lengthSq() < 1) _v1.copy(FWD).applyQuaternion(e.q);
        _v1.normalize();
        _v4.copy(UP).applyQuaternion(e.q);
        if (Math.abs(_v4.dot(_v1)) > 0.95) perp(_v4, _v1);
        for (let i = 0; i < 10; i++) {
          _v2.copy(_v1).applyAxisAngle(_v4, (i / 9 - 0.5) * ((50 * Math.PI) / 180)).normalize();
          g.addShot({ x: e.pos.x, y: e.pos.y, z: e.pos.z }, _v2.clone().multiplyScalar(1000), 4, 'enemy');
        }
        audio.sfx('laserEnemy', { vol: 0.5 });
        this.end(e, M.cd);
        return;
      }
      case 'stomp': {
        if (m.t < M.warn) return;
        // It drops on the spot. Everything inside the shell takes it.
        g.boom({ x: e.pos.x, y: e.pos.y, z: e.pos.z }, e.radius * 0.6, true);
        audio.sfx('bigExplosion');
        g.shake = Math.max(g.shake || 0, 0.12);
        if (vdist(e.pos, sh.pos) < e.radius + 1200) g.damage(35, `${e.name} dropped on you`);
        this.end(e, M.cd);
        return;
      }
      default:
        this.end(e, 8);
    }
  }

  // Drawing. A wing out of the squadron machinery, so what it draws flies in
  // formation with a leader and a plan like everything else the Red Margin
  // fields - and, once the Doodler is hurt, one whole dreadnought, which is
  // what its codex entry says is worse.
  summon(e, at) {
    const g = this.g;
    _v1.set(at.x - e.pos.x, at.y - e.pos.y, at.z - e.pos.z);
    if (_v1.lengthSq() < 1) _v1.copy(FWD).applyQuaternion(e.q);
    _v1.normalize();
    const off = e.radius + 700;
    const p = { x: e.pos.x + _v1.x * off, y: e.pos.y + _v1.y * off, z: e.pos.z + _v1.z * off };
    if (e.bossId === 'doodler' && e.phase >= 2 && !e.drew) {
      e.drew = true;
      const cap = g.spawnCapital('dreadnought', { x: p.x, y: p.y + 400, z: p.z });
      g.ui.big('IT IS DRAWING A DREADNOUGHT', 'The Doodler draws capital ships now. That is the part that is worse.');
      audio.sfx('alarm');
      return cap;
    }
    const room = SUMMON_CAP - g.fleet.liveImps();
    if (room <= 0) { g.ui.toast(`${e.name} has drawn all it can hold.`); return null; }
    const n = Math.min(3, room);
    const type = e.lieutenant ? 'wasp' : 'grunt';
    return g.fleet.wing(n, type, n > 2 ? 'v' : 'lineAbreast', p.x, p.y, p.z, 140);
  }

  // ---------- the end of one ----------
  // Called from hurt() the moment a boss's hull is gone, in place of the
  // ordinary "DREADNOUGHT DOWN". The board is swept a beat later, from
  // update(), where rebuilding the enemy list is safe.
  killed(e) {
    const g = this.g, st = g.state, B = BOSSES[e.bossId];
    if (!B) return;
    const bonus = B.lieutenant ? 4000 : 9000;
    st.credits += bonus;
    if (!st.bossesDefeated.includes(e.bossId)) st.bossesDefeated.push(e.bossId);
    if (!B.lieutenant) st.actProgress = Math.max(st.actProgress | 0, B.act);
    g.ui.big(`${B.name.toUpperCase()} ERASED`, `${B.beat} +${bonus} cr`);
    audio.sfx('coin');
    g.persist();
    this.won = e.bossId;
    this.sweep = 2.4;
  }

  // What the HUD bar reads, or null when nothing of theirs is on the board.
  current() {
    for (const e of this.g.enemies) if (e.boss && !e.dead) return e;
    return null;
  }
}
