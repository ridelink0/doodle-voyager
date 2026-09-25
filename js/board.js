// Escape pods, boarding and hijacking.
//
// Losing your hull stops being a plain death: you go out in a suit that can
// shoot and be shot, with air on the clock and a real chance of reaching
// something. What you can reach is the Red Margin's own ships. A saucer shot
// until it drifts can be taken alongside; a capital worn down past sixty per
// cent can be entered and walked. Inside, the red guys are aboard and the helm
// stays locked until the last of them is down. Then you fly their hull, and the
// HUD says whose it is, until you leave it or it dies.
//
// Everything here is built on what the game already has. A stolen hull is an
// ordinary `game.ship` with a different `def`, so flight, fuel, warp, docking,
// doors, the elevator and the lift music all work with no second code path. The
// interiors come from buildInterior (a saucer gets the Highlighter's cockpit, a
// dreadnought the Lecture Hall, a carrier the Filing Cabinet's three decks and
// its lift) and the outside is the enemy's own mesh from actors.js, so what you
// see in space is the ship you actually took.
import * as THREE from 'three';
import { SHIPS } from './ships.js';
import { buildImp, buildCapital } from './actors.js';
import { audio } from './audio.js';
import { glow } from './mats.js';
import { clamp, vdist } from './util.js';

// One row per kind of hull you can take. `type` is the ship whose interior you
// walk once you are inside. The numbers are deliberately below your own yard:
// no shield at all (the generator is keyed to a crew you just shot), a third of
// a tank, slower and heavier on the stick. A stolen hull gets you out of
// trouble and no further, which is the point.
const SKIN = {
  imp: { type: 'racer', name: 'Red Margin saucer', crew: 1, hull: 70, dmg: 10, tank: 0.3, speed: 0.9, turn: 0.85 },
  dreadnought: { type: 'cruiser', name: 'Red Margin dreadnought', crew: 7, hull: 260, dmg: 20, tank: 0.45, speed: 0.8, turn: 0.75 },
  carrier: { type: 'locker', name: 'Red Margin carrier', crew: 8, hull: 240, dmg: 18, tank: 0.5, speed: 0.8, turn: 0.75 },
};
// The suit: air in seconds, top speed, and the sidearm.
const SUIT = { air: 150, vmax: 60, hp: 100, dmg: 5, cd: 0.3, speed: 2600, reach: 24, hit: 14 };
// A red guy aboard: hit points, what his shots cost you, and how he moves.
const GUARD = { hp: 30, dmg: 8, cd: 1.9, sight: 17, walk: 1.7, bolt: 24, hold: 3.0 };
// How close the suit has to be, and how far down the target has to be first.
const TAKE = { saucerDist: 34, saucerHp: 0.35, capHp: 0.6, capDist: 1.06 };
const RECALL = 30;               // seconds for a hull you own to answer a call

const FWD = new THREE.Vector3(0, 0, -1);
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3();

// Ray against a standing body: the horizontal miss distance first, then the
// height the shot is at when it gets there, so a red guy is hittable from his
// boots to his horns and not only through his middle. Returns the distance
// along the ray, or null. The sidearm on foot is hitscan; this is its test.
function rayBody(o, d, x, z, y0, y1, r, maxT) {
  const h2 = d.x * d.x + d.z * d.z;
  if (h2 < 1e-9) return null;
  const s = ((x - o.x) * d.x + (z - o.z) * d.z) / h2;
  if (s < 0 || s > maxT) return null;
  const px = o.x + d.x * s - x, pz = o.z + d.z * s - z;
  if (px * px + pz * pz > r * r) return null;
  const py = o.y + d.y * s;
  if (py < y0 || py > y1) return null;
  return s;
}

export class Boarding {
  constructor(g) {
    this.g = g;
    // You, the person: separate from the hull, because now you can be shot
    // without a hull around you.
    this.you = { hp: SUIT.hp, max: SUIT.hp, lastHit: -99 };
    this.crew = [];              // red guys aboard the hull you boarded
    this.bolts = [];             // their fire, in interior coordinates
    this.tracers = [];           // yours
    this.own = null;             // your own hull while you are in somebody else's
    this.inbound = null;         // a hull you own, answering a call
    this.fireCd = 0;
    this.wasLeft = false;
    this.noPod = false;          // the next death is personal: no pod from it
    this.crewLeft = 0;
  }

  // ---------- what the HUD and the save read ----------

  // The def the whole game reads for a stolen hull, so `h-ship` names it and
  // every stat() falls out of the same table it always did.
  def() { const h = this.g.ship && this.g.ship.hijack; return h ? h.def : null; }
  makeDef(skin) {
    const b = SHIPS[skin.type];
    return {
      id: b.id, name: skin.name, cls: 'stolen', fuel: b.fuel,
      tank: Math.max(14, Math.round(b.tank * skin.tank)), hull: skin.hull, shield: 0,
      speed: Math.round(b.speed * skin.speed), cruise: b.cruise * 0.6, turn: b.turn * skin.turn,
      guns: 1, dmg: skin.dmg, price: 0, ability: null, scoop: false,
      flavour: 'Not yours. The seat is the wrong shape and the labels are in a language of threats.',
      desc: 'A Red Margin hull with the crew cleared out of it.',
    };
  }
  // While you are flying someone else's hull the save still describes yours,
  // so a reload can never hand you a free ship you never bought.
  ownHull() {
    const o = this.own;
    return o ? { type: o.type, hull: Math.max(1, o.hull), fuel: o.fuel } : null;
  }
  hullR() { const e = this.g.exterior; return Math.max(6, (e && e.radius) || 20); }
  stolen() { return !!(this.g.ship && this.g.ship.hijack); }
  // The breach panel is a hole in YOUR hull, in your hull's coordinates. Not
  // in a stolen one and not in a wreck.
  noBreach() {
    const sh = this.g.ship;
    if (!sh || (!sh.hijack && !sh.wreck)) return false;
    audio.sfx('deny');
    this.g.ui.toast(sh.wreck ? 'The hull is already open to space.' : 'That panel is not yours to pull.');
    return true;
  }

  // ---------- the suit ----------

  suitOn(rel, vel, air) {
    const g = this.g;
    g.eva = {
      rel: rel.applyQuaternion(g.ship.q), vel: vel.applyQuaternion(g.ship.q),
      yaw: 0, pitch: 0, roll: 2.2, o2: air, vmax: SUIT.vmax, suit: true,
    };
    if (g.wind) { g.wind.stop(); g.wind = null; }
    g.setMode('eva');
  }
  // In the suit you are the thing enemies aim at, not the hull you left.
  suitPos() {
    const g = this.g;
    if (g.mode !== 'eva' || !g.eva) return null;
    const p = g.ship.pos, r = g.eva.rel;
    return { x: p.x + r.x, y: p.y + r.y, z: p.z + r.z };
  }
  hurtYou(n, why) {
    const g = this.g;
    if (g.mode === 'dead' || g.mode === 'title') return;
    this.you.hp -= n;
    this.you.lastHit = g.t;
    g.r.fx.damage = Math.min(1, g.r.fx.damage + n / 30);
    g.shake = Math.max(g.shake || 0, 0.12);
    audio.sfx('hit');
    if (this.you.hp > 0) {
      if (this.you.hp < 35 && !this.hurtWarned) {
        this.hurtWarned = true;
        audio.sfx('alarm');
        g.ui.big('THE SUIT IS TORN', 'Get behind something. It seals itself if nothing hits you for a while.');
      }
      return;
    }
    this.you.hp = 0;
    this.noPod = true;              // nobody ejects out of himself
    g.die(why || 'killed outside the hull');
  }
  // Air out in a suit with no live hull to be reeled into is the end of it.
  suitAirOut() {
    if (!this.g.ship.wreck) return false;
    this.noPod = true;
    this.g.die('the suit ran out of air');
    return true;
  }

  // ---------- (a) escape pods ----------

  // Called from die() before anything else. Returns true when it took the
  // death over: the hull is finished but you are not.
  pod(why) {
    const g = this.g, sh = g.ship;
    if (this.noPod) { this.noPod = false; return false; }
    if (why === 'blackhole') return false;              // nothing ejects out of that
    if (g.mode !== 'foot' && g.mode !== 'helm') return false;
    if (!sh) return false;
    const lost = (sh.hijack && sh.hijack.name) || (SHIPS[sh.type] && SHIPS[sh.type].name) || 'hull';
    if (!this.own) this.own = { type: sh.type, hull: 1, fuel: sh.fuel, wrecked: true };
    // the hull stops being a ship and becomes the thing you push off from
    sh.hull = 0; sh.shield = 0; sh.wreck = true;
    sh.throttle = 0; sh.cruise = false; sh.auto = null; sh.warp = null; sh.cs = 0;
    sh.vel.multiplyScalar(0.2);
    sh.abilityCd = 0; sh.burnT = 0; sh.cloak = null; sh.tractor = null;
    if (g.carried) g.dropCarried();
    if (g.breach) { for (const b of g.breach.bits) g.shipRoot.remove(b.m); g.breach = null; }
    this.clearCrew();
    g.boom({ ...sh.pos }, 40, true, 22);
    const up = sh.hatch === 'bottom' ? -1 : 1;
    this.suitOn(new THREE.Vector3(0, up * this.hullR() * 1.25, 0), new THREE.Vector3(0, up * 16, 0), SUIT.air);
    this.you.hp = Math.max(40, Math.min(this.you.hp, SUIT.hp));
    this.hurtWarned = false;
    audio.sfx('bigExplosion');
    audio.mood('combat');
    g.ui.big('ESCAPE POD', `The ${lost} is gone. ${SUIT.air} s of air and a sidearm. F calls a hull you own; E boards a Red Margin ship you can reach.`);
    g.ui.toast('Click to shoot. A saucer shot until it drifts can be taken.');
    return true;
  }

  // F in the suit: a hull you own comes to you. Otherwise you find one.
  callShip() {
    const g = this.g, st = g.state;
    if (g.mode !== 'eva') return;
    if (this.inbound) { g.ui.toast(`${SHIPS[this.inbound.id].name} is about ${Math.ceil(this.inbound.t)} s out.`); return; }
    const here = this.own ? this.own.type : g.ship.type;
    const have = st.owned.filter((id) => id !== here && SHIPS[id]);
    if (!have.length) {
      audio.sfx('deny');
      g.ui.toast('You own no other hull. Shoot a saucer until it drifts, then press E alongside it.');
      return;
    }
    have.sort((a, b) => SHIPS[b].hull - SHIPS[a].hull);
    this.inbound = { id: have[0], t: RECALL };
    audio.sfx('ui');
    g.ui.big('REMOTE RECALL', `The ${SHIPS[have[0]].name} is coming. About ${RECALL} seconds, and it cannot dodge for you.`);
  }
  callTick(dt) {
    const c = this.inbound, g = this.g;
    if (!c) return;
    if (g.mode !== 'eva') return;       // the clock only runs while you are out there
    c.t -= dt;
    if (c.t > 0) {
      if (c.t < 5 && !c.near) { c.near = true; audio.sfx('warpCharge'); g.ui.toast(`${SHIPS[c.id].name} dropping out of warp.`); }
      return;
    }
    this.inbound = null;
    this.arrive(c.id);
  }
  // Your own hull drops out of warp where you are floating, and you are in it.
  arrive(id) {
    const g = this.g;
    const at = this.suitPos() || { ...g.ship.pos };
    const lost = this.own && this.own.wrecked ? this.own.type : null;
    this.own = null;
    this.clearCrew();
    const q = g.ship.q.clone();
    g.buildShip(id);
    g.state.ship = id;
    g.ship.pos = { x: at.x, y: at.y, z: at.z };
    g.ship.q.copy(q);
    g.ship.hull = Math.max(g.ship.hull, Math.round(g.stat('hull') * 0.6));
    g.ship.fuel = Math.max(g.ship.fuel, g.stat('tank') * 0.5);
    g.ship.air = 100;
    g.eva = null;
    this.putAshore();
    g.setMode('foot');
    audio.sfx('warpIn');
    g.ui.big('PICKED UP', `You are aboard the ${SHIPS[id].name}. E at the seat takes the helm.`);
    if (lost && g.state.owned.length > 1) {
      const i = g.state.owned.indexOf(lost);
      if (i >= 0) g.state.owned.splice(i, 1);
      g.state.hull[lost] = SHIPS[lost].hull;
      g.ui.toast(`The ${SHIPS[lost].name} was left where it died. The yard calls that wear and tear.`);
    }
    g.persist();
  }
  // Put the player on their feet at the interior's spawn, on deck zero.
  putAshore() {
    const g = this.g, sp = g.interior.spawn;
    g.ship.deck = 0; g.ship.deckY = 0; g.ship.elevator = null;
    g.player.x = sp.x; g.player.z = sp.z; g.player.y = 0; g.player.vy = 0;
    g.player.yaw = g.interior.spawnYaw || 0; g.player.pitch = 0;
    g.player.lookYaw = 0; g.player.lookPitch = 0;
  }

  // ---------- (b) boarding ----------

  // A saucer that has been shot past its limit stops fighting and drifts, but
  // only while you are out there in a suit: at the helm they fight to the end,
  // exactly as before. Once one is drifting it stays drifting.
  drift(e, dt) {
    if (e.kind !== 'imp') return false;
    if (!e.derelict) {
      if (this.g.mode !== 'eva' || e.hp > e.max * TAKE.saucerHp) return false;
      e.derelict = true;
      audio.sfx('alarm');
      this.g.ui.toast('That saucer is drifting, disabled. Get alongside it and press E.');
    }
    e.vel.multiplyScalar(Math.max(0, 1 - dt * 1.8));
    e.pos.x += e.vel.x * dt; e.pos.y += e.vel.y * dt; e.pos.z += e.vel.z * dt;
    e.spin = (e.spin || 0) + dt * 0.4;
    e.q.setFromAxisAngle(V1.set(0.3, 1, 0.2).normalize(), e.spin);
    return true;
  }
  // A capital does not chase or back away from one man in a suit. Its turrets
  // keep firing, so the swim across is the price.
  holdStation() { return this.g.mode === 'eva'; }

  boardable() {
    const g = this.g;
    const p = this.suitPos();
    if (!p) return null;
    let best = null, bd = Infinity;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d = vdist(e.pos, p);
      if (e.kind === 'imp') { if (!e.derelict || d > TAKE.saucerDist) continue; }
      else if (e.hp > e.max * TAKE.capHp || d > (e.radius || 500) * TAKE.capDist) continue;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  // E in the suit. Boarding first, then climbing back into a hull of your own.
  enter() {
    const g = this.g;
    if (g.mode !== 'eva' || !g.eva) return false;
    const t = this.boardable();
    if (t) { this.board(t); return true; }
    const R = this.hullR();
    if (g.ship.wreck && g.eva.rel.length() < R * 1.7) {
      audio.sfx('deny');
      g.ui.toast('No air, no power, no helm. Find another ship.');
      return true;
    }
    if (g.ship.hijack && g.eva.rel.length() < R * 1.5) { this.climb(); return true; }
    return false;
  }
  climb() {
    const g = this.g;
    g.eva = null;
    this.putAshore();
    g.setMode('foot');
    audio.sfx('door');
    g.ui.toast(`Back inside the ${g.ship.hijack.name}.`);
  }
  // The other way: out of a stolen hull, clear of a hull that may be 500 u
  // across, which the fixed hatch offset in eject() cannot do.
  leave() {
    const g = this.g, sh = g.ship;
    if (g.mode !== 'helm' && g.mode !== 'foot') return false;
    if (!sh.hijack || sh.wreck) return false;
    const name = sh.hijack.name;
    sh.throttle = 0; sh.cruise = false; sh.auto = null;
    if (g.carried) g.dropCarried();
    const up = sh.hatch === 'bottom' ? -1 : 1;
    this.suitOn(new THREE.Vector3(0, up * this.hullR() * 1.3, 0), new THREE.Vector3(0, up * 12, 0), SUIT.air);
    audio.sfx('door');
    g.ui.big('OUTSIDE', `Clear of the ${name}. E at the hull climbs back in.`);
    return true;
  }

  board(e) {
    const g = this.g, st = g.state;
    const kind = e.kind === 'imp' ? 'imp' : (e.sub === 'carrier' ? 'carrier' : 'dreadnought');
    const skin = SKIN[kind];
    if (!this.own) this.own = { type: g.ship.type, hull: Math.max(1, g.ship.hull), fuel: g.ship.fuel, wrecked: !!g.ship.wreck };
    // it stops being an enemy the moment you are standing in it
    e.dead = true;
    g.fxRoot.remove(e.obj.group);
    if (e.beamMesh) g.fxRoot.remove(e.beamMesh);
    if (e.aimMesh) g.fxRoot.remove(e.aimMesh);
    const pos = { ...e.pos }, q = e.q.clone();
    const vel = e.vel ? e.vel.clone() : new THREE.Vector3();
    // a Red Margin hull is not in your colours: build the interior bare
    const keep = st.paint[skin.type];
    st.paint[skin.type] = 'outline';
    this.clearCrew();
    g.buildShip(skin.type);
    if (keep === undefined) delete st.paint[skin.type]; else st.paint[skin.type] = keep;
    g.ship.pos = pos; g.ship.q.copy(q); g.ship.vel.copy(vel);
    g.ship.hijack = { kind, name: skin.name, def: this.makeDef(skin), taken: false };
    g.ship.hull = g.stat('hull');
    g.ship.shield = 0;
    g.ship.fuel = g.stat('tank') * 0.6;
    g.ship.air = 100;
    this.skin(kind);
    g.eva = null;
    this.putAshore();
    g.setMode('foot');
    this.spawnCrew(skin.crew);
    audio.sfx('seal');
    const left = this.crew.filter((c) => c.hp > 0).length;
    g.ui.big(`ABOARD THE ${skin.name.toUpperCase()}`,
      left ? `${left} red ${left === 1 ? 'guy' : 'guys'} aboard. The helm is theirs until it is not. Click to shoot.`
        : 'Empty. Take the seat.');
    g.unlockCodex('margin');
    g.persist();
  }
  // The outside of a stolen hull is the enemy's own mesh, not a ship from the
  // yard wearing its name.
  skin(kind) {
    const g = this.g;
    const made = kind === 'imp' ? buildImp() : buildCapital(kind);
    const r = Math.max(3, made.radius || (kind === 'imp' ? 3 : 500));
    if (g.exterior && g.exterior.group) g.extRoot.remove(g.exterior.group);
    g.exterior = {
      group: made.group, radius: r, length: made.length || r * 2,
      guns: [new THREE.Vector3(0, 0, -r * 0.92)], engines: [], hole: null,
      dronePort: new THREE.Vector3(0, -r * 0.55, 0),
    };
    g.extRoot.add(made.group);
    made.group.visible = false;      // setMode decides, and you are going inside
  }

  // ---------- (c) the crew, and the helm ----------

  spawnCrew(n) {
    const g = this.g, I = g.interior;
    const decks = I.decks || [I], pitch = I.deckPitch || 0;
    for (let i = 0; i < n; i++) {
      const dk = decks.length > 1 ? i % decks.length : 0;
      const D = decks[dk];
      const p = this.freeSpot(D, dk, I.bounds, dk === 0 ? I.spawn : null);
      if (!p) continue;
      const made = buildImp();
      made.group.scale.setScalar(0.33);       // 5.3 m of space imp, at head height
      made.group.position.set(p.x, dk * pitch + 0.9, p.z);
      I.group.add(made.group);
      this.crew.push({
        g: made.group, x: p.x, z: p.z, home: { x: p.x, z: p.z }, deck: dk, D,
        hp: GUARD.hp, cd: 1 + Math.random() * 2, face: 0,
      });
    }
    this.crewLeft = this.crew.length;
  }
  free(cols, x, z, r) {
    for (const k of cols || []) {
      const dx = x - clamp(x, k.x0, k.x1), dz = z - clamp(z, k.z0, k.z1);
      if (dx * dx + dz * dz < r * r) return false;
    }
    return true;
  }
  // Somewhere on this deck a red guy can stand: clear of the colliders, clear
  // of the hatch you came in by, and not on top of another one. The second pass
  // drops the keep-away distance rather than leaving the deck short a guard.
  freeSpot(D, dk, b, avoid) {
    if (!b) return null;
    const x0 = b.min.x + 0.7, x1 = b.max.x - 0.7, z0 = b.min.z + 0.7, z1 = b.max.z - 0.7;
    if (!(x1 > x0 && z1 > z0)) return null;
    for (let pass = 0; pass < 2; pass++) {
      const gap = pass ? 0 : 4;
      for (let t = 0; t < 240; t++) {
        const x = x0 + Math.random() * (x1 - x0), z = z0 + Math.random() * (z1 - z0);
        if (!this.free(D.colliders, x, z, 0.5)) continue;
        if (avoid && gap && Math.hypot(x - avoid.x, z - avoid.z) < gap) continue;
        let clash = false;
        for (const c of this.crew) if (c.deck === dk && Math.hypot(c.x - x, c.z - z) < 1.3) { clash = true; break; }
        if (clash) continue;
        return { x, z };
      }
    }
    return null;
  }
  deckBase(n) { const I = this.g.interior; return n * ((I && I.deckPitch) || 0); }

  // E at the seat of a stolen hull. Nobody flies a Red Margin ship with its
  // crew still walking around in it.
  helmLocked() {
    const g = this.g;
    if (!g.ship.hijack) return false;
    const left = this.crew.filter((c) => c.hp > 0).length;
    if (!left) return false;
    audio.sfx('deny');
    const where = this.crewDecks();
    g.ui.toast(`The crew still holds the ${g.ship.hijack.name}: ${left} red ${left === 1 ? 'guy' : 'guys'}${where}.`);
    return true;
  }
  crewDecks() {
    const I = this.g.interior;
    if (!I || !I.decks || I.decks.length < 2) return '';
    const set = new Set(this.crew.filter((c) => c.hp > 0).map((c) => c.deck));
    const names = [...set].sort().map((d) => (I.deckNames && I.deckNames[d]) || `deck ${d + 1}`);
    return names.length ? `, on ${names.join(' and ')}` : '';
  }

  updateCrew(dt) {
    const g = this.g;
    if (!this.crew.length) return;
    const inside = g.mode === 'foot' || g.mode === 'helm';
    const p = g.player, pd = g.ship.deck;
    let alive = 0;
    for (const c of this.crew) {
      if (c.hp <= 0) continue;
      alive++;
      c.g.visible = c.deck === pd;          // no watching them through a deck
      if (!inside) continue;
      const dx = p.x - c.x, dz = p.z - c.z;
      const d = Math.hypot(dx, dz) || 1e-6;
      if (c.deck === pd && d < GUARD.sight) {
        c.face = Math.atan2(-dx / d, -dz / d);
        if (d > GUARD.hold) { const s = GUARD.walk * dt; this.step(c, (dx / d) * s, (dz / d) * s); }
        c.cd -= dt;
        if (c.cd <= 0) { c.cd = GUARD.cd * (0.7 + Math.random() * 0.6); this.crewShot(c); }
      } else {
        if (c.cd < 0.7) c.cd = 0.7;
        const hx = c.home.x - c.x, hz = c.home.z - c.z, hd = Math.hypot(hx, hz);
        if (hd > 0.6) { const s = GUARD.walk * 0.5 * dt; this.step(c, (hx / hd) * s, (hz / hd) * s); c.face = Math.atan2(-hx / hd, -hz / hd); }
      }
      c.g.position.set(c.x, this.deckBase(c.deck) + 0.9, c.z);
      c.g.rotation.y = c.face;
    }
    if (alive !== this.crewLeft) {
      this.crewLeft = alive;
      if (!alive && g.ship.hijack && !g.ship.hijack.clear) {
        g.ship.hijack.clear = true;
        audio.sfx('coin');
        g.ui.big('THE HULL IS YOURS', `Nobody left aboard the ${g.ship.hijack.name}. E at the seat takes the helm.`);
      }
    }
  }
  step(c, dx, dz) {
    const b = this.g.interior.bounds, cols = c.D && c.D.colliders;
    const ok = (x, z) => this.free(cols, x, z, 0.5)
      && (!b || (x > b.min.x + 0.5 && x < b.max.x - 0.5 && z > b.min.z + 0.5 && z < b.max.z - 0.5));
    if (ok(c.x + dx, c.z)) c.x += dx;
    if (ok(c.x, c.z + dz)) c.z += dz;
  }

  // ---------- shooting, inside and out ----------

  boltGeo() { return this._bg || (this._bg = new THREE.BoxGeometry(0.07, 0.07, 0.75)); }
  boltMat() { return this._bm || (this._bm = glow(0xff3b5c)); }
  tracerMat() { return this._tm || (this._tm = glow(0xffc23c)); }

  // In the suit: a real shot in the world, so it hits enemies through the same
  // code every other shot uses.
  shootOut() {
    const g = this.g, p = this.suitPos();
    if (!p) return;
    this.fireCd = SUIT.cd;
    const d = g.r.camera.getWorldDirection(V1);
    if (d.lengthSq() < 1e-6) return;
    const dir = V2.copy(d);
    g.addShot({ x: p.x + dir.x * 2.2, y: p.y + dir.y * 2.2, z: p.z + dir.z * 2.2 }, dir.clone().multiplyScalar(SUIT.speed), SUIT.dmg, 'player');
    audio.sfx('laser', { vol: 0.45 });
  }
  // On foot: hitscan against the crew, in the interior's own coordinates.
  shootIn() {
    const g = this.g, p = g.player;
    this.fireCd = SUIT.cd;
    const cp = Math.cos(p.pitch);
    const dir = new THREE.Vector3(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp);
    const eye = new THREE.Vector3(p.x, g.ship.deckY + p.y + 1.6, p.z);
    let hit = null, hd = SUIT.reach;
    for (const c of this.crew) {
      if (c.hp <= 0 || c.deck !== g.ship.deck) continue;
      const base = this.deckBase(c.deck);
      const t = rayBody(eye, dir, c.x, c.z, base + 0.05, base + 1.8, 0.5, hd);
      if (t != null && t < hd) { hd = t; hit = c; }
    }
    this.tracer(eye, dir, hit ? hd : SUIT.reach);
    audio.sfx('laser', { vol: 0.4 });
    if (!hit) return;
    hit.hp -= SUIT.hit;
    hit.cd = Math.min(hit.cd, 0.5);
    if (hit.hp > 0) { audio.sfx('hit', { vol: 0.5 }); return; }
    this.dropCrew(hit);
  }
  dropCrew(c) {
    const g = this.g;
    c.hp = 0;
    c.g.rotation.x = -Math.PI / 2;
    c.g.position.y = this.deckBase(c.deck) + 0.35;
    audio.sfx('explosion', { vol: 0.35 });
    g.state.stats.kills++;
    g.state.credits += 40;
  }
  tracer(eye, dir, len) {
    const g = this.g;
    if (!g.interior || !g.interior.group) return;
    const m = new THREE.Mesh(this.boltGeo(), this.tracerMat());
    m.scale.set(1, 1, Math.max(0.5, len));
    m.position.set(eye.x + dir.x * len * 0.5, eye.y + dir.y * len * 0.5, eye.z + dir.z * len * 0.5);
    m.quaternion.setFromUnitVectors(FWD, dir);
    g.interior.group.add(m);
    this.tracers.push({ m, life: 0.07 });
  }
  crewShot(c) {
    const g = this.g, p = g.player;
    const from = new THREE.Vector3(c.x, this.deckBase(c.deck) + 1.25, c.z);
    const dir = new THREE.Vector3(p.x - c.x, (g.ship.deckY + p.y + 1.1) - from.y, p.z - c.z).normalize();
    dir.x += (Math.random() - 0.5) * 0.13; dir.y += (Math.random() - 0.5) * 0.09; dir.z += (Math.random() - 0.5) * 0.13;
    dir.normalize();
    const m = new THREE.Mesh(this.boltGeo(), this.boltMat());
    m.position.copy(from);
    m.quaternion.setFromUnitVectors(FWD, dir);
    g.interior.group.add(m);
    this.bolts.push({ m, pos: from.clone(), vel: dir.multiplyScalar(GUARD.bolt), life: 1.3 });
    audio.sfx('laserEnemy', { vol: 0.45 });
  }
  updateBolts(dt) {
    const g = this.g;
    const inside = g.mode === 'foot' || g.mode === 'helm';
    const p = g.player;
    const keep = [];
    for (const b of this.bolts) {
      b.life -= dt;
      b.pos.addScaledVector(b.vel, dt);
      b.m.position.copy(b.pos);
      let done = b.life <= 0;
      if (!done && inside) {
        const cy = g.ship.deckY + p.y + 1.0;
        if (Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < 0.55 && Math.abs(b.pos.y - cy) < 1.0) {
          done = true;
          this.hurtYou(GUARD.dmg, 'shot aboard a Red Margin hull');
        }
      }
      if (done) { if (b.m.parent) b.m.parent.remove(b.m); } else keep.push(b);
    }
    this.bolts = keep;
    const tk = [];
    for (const t of this.tracers) {
      t.life -= dt;
      if (t.life <= 0) { if (t.m.parent) t.m.parent.remove(t.m); } else tk.push(t);
    }
    this.tracers = tk;
  }

  // ---------- housekeeping ----------

  clearCrew() {
    for (const c of this.crew) if (c.g.parent) c.g.parent.remove(c.g);
    for (const b of this.bolts) if (b.m.parent) b.m.parent.remove(b.m);
    for (const t of this.tracers) if (t.m.parent) t.m.parent.remove(t.m);
    this.crew = []; this.bolts = []; this.tracers = []; this.crewLeft = 0;
  }
  // Back in your own hull, whatever happened. respawn() and the station
  // handover both come through here.
  reset() {
    const g = this.g;
    this.clearCrew();
    this.inbound = null;
    this.noPod = false;
    this.hurtWarned = false;
    this.you.hp = this.you.max;
    this.you.lastHit = -99;
    if (!g.ship) { this.own = null; return; }
    const o = this.own;
    this.own = null;
    if (o && g.state && g.state.owned.includes(o.type)) {
      const pos = { ...g.ship.pos }, q = g.ship.q.clone();
      g.buildShip(o.type);
      g.state.ship = o.type;
      g.ship.pos = pos; g.ship.q.copy(q);
      g.ship.hull = clamp(o.hull, 1, g.stat('hull'));
      g.ship.fuel = Math.min(o.fuel, g.stat('tank'));
    } else {
      g.ship.hijack = null;
      g.ship.wreck = false;
    }
    g.eva = null;
  }
  // Docking a stolen hull: the yard takes it back and brings yours round.
  onDock() {
    const g = this.g;
    if (!g.ship.hijack) return false;
    const name = g.ship.hijack.name, o = this.own;
    const tow = o && o.wrecked ? Math.min(900, Math.max(0, Math.floor(g.state.credits * 0.2))) : 0;
    g.state.credits -= tow;
    this.reset();
    g.ship.hull = g.stat('hull');
    g.ship.shield = g.stat('shield');
    g.ship.fuel = Math.max(g.ship.fuel, g.stat('tank') * 0.5);
    g.ship.air = 100;
    g.r.fx.damage = 0;
    audio.sfx('buy');
    g.ui.big('HULL IMPOUNDED', `They took the ${name}. Your ${SHIPS[g.ship.type].name} was ${tow ? `towed in and patched for ${tow} cr` : 'brought round from the yard'}.`);
    g.persist();
    return true;
  }

  // What the HUD says you can do out there.
  prompt() {
    const g = this.g;
    if (g.mode !== 'eva' || !g.eva) return '';
    const t = this.boardable();
    if (t) return `E · board the ${t.kind === 'imp' ? 'saucer' : t.name}`;
    if (this.inbound) return `${SHIPS[this.inbound.id].name} inbound · ${Math.ceil(this.inbound.t)} s`;
    if (g.ship.wreck) return 'F · call a hull you own';
    if (g.ship.hijack && g.eva.rel.length() < this.hullR() * 1.5) return `E · climb into the ${g.ship.hijack.name}`;
    return '';
  }

  update(dt) {
    const g = this.g;
    if (g.mode === 'title' || g.mode === 'dead') { this.wasLeft = false; return; }
    const you = this.you;
    if (you.hp < you.max && g.t - you.lastHit > 8) you.hp = Math.min(you.max, you.hp + dt * 4);
    if (you.hp > 45) this.hurtWarned = false;
    if (this.fireCd > 0) this.fireCd -= dt;
    const left = g.mouse.left && !g.paused && !g.ui.anyOpen() && !g.ui.crawlActive;
    const press = left && !this.wasLeft;
    this.wasLeft = left;
    if (left) {
      if (g.mode === 'eva') { if (this.fireCd <= 0) this.shootOut(); }
      else if (g.mode === 'foot') {
        if (g.carried) { if (press) g.dropCarried(true); }
        else if (this.fireCd <= 0) this.shootIn();
      }
    }
    this.updateCrew(dt);
    this.updateBolts(dt);
    this.callTick(dt);
  }
}
