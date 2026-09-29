// Flying in the same sky as somebody else.
//
// Everything here is deliberately thin. The game stays authoritative over its
// own ship and nothing else: a peer is a ghost drawn from the last thing it
// said about itself, and no message from the network can move your hull, spend
// your fuel or hurt you, with one exception: a hit from somebody who opted in to
// PvP, which your own client checks before it believes (js/pvp.js). That is the
// whole security model, and it is the reason this can ship as a static page
// with a publishable key in it.
//
// A room is one star system, so what you are sent is what you could see. Crossing
// into another system leaves the old room and joins the new one.
//
// The transport is injectable, which is what makes any of this testable. The
// real one is a Supabase Realtime broadcast channel; the tests wire two Net
// objects to each other through a fake and check the same code paths a live
// room would take - a peer appearing, its ghost chasing the last report, a peer
// falling silent and being forgotten.
import * as THREE from 'three';
import { buildExterior } from './ships.js';
import { squash } from './render.js';
import { judgeHit, RateGate, segSphere, MAX_DMG, SPEED_CAP } from './pvp.js';

export const PROJECT = 'https://cafodiocsvzgeninsjzi.supabase.co';
// A publishable key is meant to be in the page; it can read what the project's
// policies allow and nothing else. It is the same key the dashboard uses.
export const PUBLISHABLE = 'sb_publishable_eqKwTWBdf77BBVR9o9rN5A_SgkXZ7AY';

export const SEND_EVERY = 0.1;      // seconds between reports about yourself
export const FORGET_AFTER = 6;      // seconds of silence before a peer is dropped
export const CHASE = 6;             // how fast a ghost closes on its last report
export const ROOM = 'doodle-voyager-open-space';
export const ROOM_SETTLE = 1;       // seconds in a new system before the room follows
export const NAME_NEAR = 2000;      // a name is fully drawn this close
export const NAME_FAR = 16000;      // and gone by here
export const GHOST_R = 24;          // what a bolt has to touch when a ghost has no body yet

const r1 = (n) => Math.round(Number(n) || 0);
const clean = (s) => s.replace(/[^A-Za-z0-9:_-]/g, '-').slice(0, 120);

// Which room a game belongs in: the star system it is in, or, between systems,
// the galaxy's deep space. g.zone is the enemy zone and is empty almost
// everywhere, so it cannot be what splits the room.
export function roomFor(g) {
  const c = g && g.u && g.u.ctx;
  const sys = c && c.system;
  if (sys) return clean(`${ROOM}:${(sys.galaxy && sys.galaxy.id) || ''}:${sys.id}`);
  const gal = c && c.galaxy;
  if (gal) return clean(`${ROOM}:${gal.id}:deep`);
  return ROOM;
}

// How much of a name to draw at a distance: all of it close up, none of it far
// away, and a straight fade between.
export function nameAlpha(d) {
  if (!(d >= 0)) return 0;
  if (d <= NAME_NEAR) return 1;
  if (d >= NAME_FAR) return 0;
  return 1 - (d - NAME_NEAR) / (NAME_FAR - NAME_NEAR);
}
const r3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

// What one ship says about itself. Short on purpose: this goes out ten times a
// second, and every field is one somebody else has to be told.
export function packShip(g, id, name) {
  const s = g.ship;
  return {
    id,
    name: String(name || 'pilot').slice(0, 18),
    type: s.type,
    paint: (g.state && g.state.paint && g.state.paint[s.type]) || 'yellow',
    hull: r1(s.hull),
    pos: [r1(s.pos.x), r1(s.pos.y), r1(s.pos.z)],
    q: [r3(s.q.x), r3(s.q.y), r3(s.q.z), r3(s.q.w)],
    zone: (g.zone && g.zone.id) || '',
    room: roomFor(g),
    pvp: !!(g.settings && g.settings.pvp),
    t: Date.now(),
  };
}

// A report is only drawn if it is well formed and from somewhere else. A
// malformed one is dropped without comment: the network is not a trusted input,
// and a ghost at NaN would take the renderer down with it.
export function readable(msg, selfId) {
  if (!msg || typeof msg !== 'object') return false;
  if (!msg.id || typeof msg.id !== 'string' || msg.id === selfId) return false;
  if (!Array.isArray(msg.pos) || msg.pos.length !== 3 || !msg.pos.every((n) => Number.isFinite(n))) return false;
  if (!Array.isArray(msg.q) || msg.q.length !== 4 || !msg.q.every((n) => Number.isFinite(n))) return false;
  if (typeof msg.type !== 'string' || !msg.type) return false;
  return true;
}

// The real room. Imported on demand so a player who never turns multiplayer on
// never downloads it, and so the game still boots with no network at all.
export async function realtimeTransport() {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const client = createClient(PROJECT, PUBLISHABLE, { realtime: { params: { eventsPerSecond: 20 } } });
  let channel = null;
  return {
    async join(handlers, room = ROOM) {
      channel = client.channel(room, { config: { broadcast: { self: false } } });
      channel.on('broadcast', { event: 'ship' }, (p) => handlers.onState(p && p.payload));
      channel.on('broadcast', { event: 'bye' }, (p) => handlers.onLeave(p && p.payload && p.payload.id));
      channel.on('broadcast', { event: 'hit' }, (p) => handlers.onHit && handlers.onHit(p && p.payload));
      channel.on('broadcast', { event: 'hurt' }, (p) => handlers.onHurt && handlers.onHurt(p && p.payload));
      await new Promise((ok, no) => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') ok();
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') no(new Error(`the room would not open (${status})`));
        });
      });
    },
    send(msg) { if (channel) channel.send({ type: 'broadcast', event: 'ship', payload: msg }); },
    bye(id) { if (channel) channel.send({ type: 'broadcast', event: 'bye', payload: { id } }); },
    cast(event, msg) { if (channel) channel.send({ type: 'broadcast', event, payload: msg }); },
    leave() {
      if (!channel) return;
      try { const p = client.removeChannel(channel); if (p && p.catch) p.catch(() => {}); } catch { /* going away anyway */ }
      channel = null;
    },
  };
}

const UP = new THREE.Vector3();

// A name tag: a sprite that always faces you and stays the same size on screen,
// so it reads at any distance until the fade takes it.
function nameTag(name) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = '600 30px ui-monospace, monospace';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 6;
  x.strokeStyle = 'rgba(0,10,20,.85)';
  x.strokeText(name, 128, 32);
  x.fillStyle = '#9fe8ff';
  x.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
  s.scale.set(0.16, 0.04, 1);
  s.renderOrder = 10;
  s.userData.text = name;
  return s;
}

// The crosshair flashes when one of your bolts goes through somebody. That is
// all the shooter gets: their hull is theirs to take off, not yours.
function hitMarker() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('h-cross');
  if (!el) return;
  el.classList.add('pvp-hit');
  clearTimeout(hitMarker.t);
  hitMarker.t = setTimeout(() => el.classList.remove('pvp-hit'), 160);
}

export class Net {
  constructor(game, { transport = null, id = '', name = '' } = {}) {
    this.g = game;
    this.transport = transport;
    this.id = id || `p-${Math.random().toString(36).slice(2, 10)}`;
    this.name = name || 'pilot';
    this.peers = new Map();
    this.on = false;
    this.acc = 0;
    this.error = '';
    this.root = null;
    this.clock = 0;
    this.room = '';
    this.moving = null;        // a room change in flight
    this.nextRoom = '';        // the system you have just crossed into, and since when
    this.nextSince = 0;
    this.gate = new RateGate();
    this.sent = 0;             // hits you reported
    this.landed = 0;           // of those, the ones the victim took
    this.taken = 0;            // hits on you that passed
    this.refused = 0;          // and the ones that did not
    this.verdict = null;       // the last hit on you and what was decided
  }

  // Off unless you turn it on. Forced PvP is the first thing anybody complains
  // about, so nobody can shoot you who you have not agreed to be shot by.
  get pvp() { return !!(this.g && this.g.settings && this.g.settings.pvp); }

  handlers() {
    return {
      onState: (msg) => this.take(msg),
      onLeave: (id) => this.drop(id),
      onHit: (msg) => this.onHit(msg),
      onHurt: (msg) => this.onHurt(msg),
    };
  }

  // Joining is allowed to fail, and a failure says so in the HUD rather than
  // throwing into the frame loop: an unreachable room must not end a game.
  async join(name = this.name) {
    if (this.on) return true;
    this.name = name;
    try {
      if (!this.transport) this.transport = await realtimeTransport();
      const room = roomFor(this.g);
      await this.transport.join(this.handlers(), room);
      this.room = room;
      this.nextRoom = '';
      this.on = true;
      this.error = '';
      this.acc = SEND_EVERY;                 // report at once, do not make them wait
      return true;
    } catch (e) {
      this.on = false;
      this.error = e && e.message ? e.message : String(e);
      return false;
    }
  }

  leave() {
    if (this.transport && this.on) { try { this.transport.bye(this.id); } catch { /* best effort */ } this.transport.leave(); }
    this.on = false;
    this.room = '';
    for (const id of [...this.peers.keys()]) this.drop(id);
  }

  async toggle(name = this.name) {
    if (this.on) { this.leave(); return false; }
    return this.join(name);
  }

  // Crossing into another system: goodbye to the old room, forget everyone in
  // it, join the new one. Nothing is sent while the change is in flight.
  async move(room) {
    const t = this.transport;
    try { t.bye(this.id); } catch { /* best effort */ }
    t.leave();
    for (const id of [...this.peers.keys()]) this.drop(id);
    this.room = '';
    try {
      await t.join(this.handlers(), room);
      if (!this.on) { t.leave(); return false; }   // O was pressed while it was joining
      this.room = room;
      this.acc = SEND_EVERY;
      return true;
    } catch (e) {
      this.on = false;
      this.error = e && e.message ? e.message : String(e);
      return false;
    }
  }

  // The room follows you once you have been in a new system for a moment, so
  // skimming the edge between two does not churn joins.
  follow() {
    if (this.moving) return;
    const want = roomFor(this.g);
    if (want === this.room) { this.nextRoom = ''; return; }
    if (want !== this.nextRoom) { this.nextRoom = want; this.nextSince = this.clock; return; }
    if (this.clock - this.nextSince < ROOM_SETTLE) return;
    this.nextRoom = '';
    this.moving = this.move(want).finally(() => { this.moving = null; });
  }

  take(msg) {
    if (!readable(msg, this.id)) return false;
    // a report from another system has no business here, whatever carried it
    if (msg.room && this.room && msg.room !== this.room) return false;
    const name = String(msg.name || 'pilot').slice(0, 18);
    const down = Number.isFinite(msg.hull) && msg.hull <= 0;
    let p = this.peers.get(msg.id);
    if (!p) {
      p = {
        id: msg.id, name, type: msg.type, paint: msg.paint || 'yellow',
        pos: new THREE.Vector3(msg.pos[0], msg.pos[1], msg.pos[2]),
        want: new THREE.Vector3(msg.pos[0], msg.pos[1], msg.pos[2]),
        q: new THREE.Quaternion(msg.q[0], msg.q[1], msg.q[2], msg.q[3]),
        wantQ: new THREE.Quaternion(msg.q[0], msg.q[1], msg.q[2], msg.q[3]),
        hull: msg.hull, zone: msg.zone || '', room: msg.room || '', pvp: msg.pvp === true, down,
        t: Number(msg.t) || 0, speed: 0, seen: this.clock, group: null, label: null, radius: 0,
      };
      this.peers.set(msg.id, p);
      this.mesh(p);
    } else {
      // how fast it is going, off its own clock, for the range allowance on a hit
      const dt = (Number(msg.t) - p.t) / 1000;
      if (dt > 0.02 && dt < 3) {
        const d = Math.hypot(msg.pos[0] - p.want.x, msg.pos[1] - p.want.y, msg.pos[2] - p.want.z);
        p.speed = Math.min(SPEED_CAP, d / dt);
      }
      p.t = Number(msg.t) || p.t;
      p.want.set(msg.pos[0], msg.pos[1], msg.pos[2]);
      p.wantQ.set(msg.q[0], msg.q[1], msg.q[2], msg.q[3]);
      p.hull = msg.hull;
      p.zone = msg.zone || '';
      p.room = msg.room || '';
      p.pvp = msg.pvp === true;
      p.down = down;
      p.seen = this.clock;
      // A peer that changed hull needs a new body, not a relabelled old one.
      if (msg.type !== p.type) { p.type = msg.type; p.paint = msg.paint || p.paint; p.name = name; this.unmesh(p); this.mesh(p); }
      else if (name !== p.name) { p.name = name; this.retag(p); }
    }
    return true;
  }

  // The rate gate keeps its count for a dropped id: a goodbye is one broadcast
  // anybody can send, and forgetting on it would hand the shooter a fresh burst.
  drop(id) {
    const p = this.peers.get(id);
    if (!p) return false;
    this.unmesh(p);
    this.peers.delete(id);
    return true;
  }

  // The ghost body. Built from the same exterior the owner is flying, so a
  // Filing Cabinet looks like a Filing Cabinet from the outside.
  mesh(p) {
    const g = this.g;
    if (!g || !g.r || !g.r.world || typeof document === 'undefined') return null;
    if (!this.root) { this.root = new THREE.Group(); g.r.world.add(this.root); }
    let built = null;
    try { built = buildExterior(p.type, p.paint); } catch { built = null; }
    if (!built) return null;
    p.group = built.group;
    p.radius = built.radius || GHOST_R;
    this.root.add(p.group);
    p.label = nameTag(p.name);
    this.root.add(p.label);
    this.place(p);
    return p.group;
  }

  retag(p) {
    if (!p.label || !this.root) return;
    this.root.remove(p.label);
    p.label.material.map.dispose();
    p.label.material.dispose();
    p.label = nameTag(p.name);
    this.root.add(p.label);
    this.place(p);
  }

  unmesh(p) {
    if (p.group && this.root) this.root.remove(p.group);
    if (p.label) {
      if (this.root) this.root.remove(p.label);
      p.label.material.map.dispose();
      p.label.material.dispose();
    }
    p.group = null;
    p.label = null;
  }

  here(p) {
    return (!p.zone || !this.g.zone || p.zone === this.g.zone.id) && (!p.room || !this.room || p.room === this.room);
  }

  // The world is drawn around your own ship, as the enemies are, so a ghost
  // goes where it is relative to you and gets the same far-field squash.
  place(p) {
    if (!p.group) return;
    const sh = this.g && this.g.ship;
    const ox = sh ? sh.pos.x : 0, oy = sh ? sh.pos.y : 0, oz = sh ? sh.pos.z : 0;
    const s = squash(p.pos.x - ox, p.pos.y - oy, p.pos.z - oz, p.group.position);
    p.group.scale.setScalar(s);
    p.group.quaternion.copy(p.q);
    p.group.visible = this.here(p);
    if (p.label) {
      const a = nameAlpha(Math.hypot(p.pos.x - ox, p.pos.y - oy, p.pos.z - oz));
      p.label.material.opacity = a;
      p.label.visible = p.group.visible && a > 0.01;
      // above the ghost the way the camera sees it, whichever way that is
      const cam = this.g.r && this.g.r.camera;
      UP.set(0, 1, 0);
      if (cam) UP.applyQuaternion(cam.quaternion);
      p.label.position.copy(p.group.position).addScaledVector(UP, (p.radius || GHOST_R) * 1.5 * s);
    }
  }

  placeAll() { for (const p of this.peers.values()) this.place(p); }

  // Ten reports a second is not a frame rate, so a ghost is chased towards its
  // last report rather than snapped to it: snapping is what makes other people
  // look like they are teleporting.
  update(dt) {
    this.clock += dt;
    if (!this.on) return;
    this.follow();
    const k = Math.min(1, dt * CHASE);
    for (const [id, p] of this.peers) {
      if (this.clock - p.seen > FORGET_AFTER) { this.drop(id); continue; }
      p.pos.lerp(p.want, k);
      p.q.slerp(p.wantQ, k);
      this.place(p);
    }
    this.acc += dt;
    if (this.acc >= SEND_EVERY && !this.moving) {
      this.acc = 0;
      if (this.g && this.g.ship && this.transport) {
        try { this.transport.send(packShip(this.g, this.id, this.name)); } catch (e) { this.error = e && e.message ? e.message : String(e); }
      }
    }
  }

  // Which ghost, if any, a bolt of yours went through between two frames. Only
  // somebody who opted in can be hit, and only while you have too; for
  // everybody else a bolt passes straight through.
  struck(ox, oy, oz, to) {
    if (!this.on || !this.pvp || this.moving) return null;
    for (const p of this.peers.values()) {
      if (!p.pvp || p.down || !this.here(p)) continue;
      if (segSphere(ox, oy, oz, to, p.pos, (p.radius || GHOST_R) + 4)) return p;
    }
    return null;
  }

  // Tell the room you hit somebody. Their hull stays whatever they last said it
  // was until their own client decides and answers.
  reportHit(p, dmg) {
    const msg = { id: this.id, to: p.id, dmg: Math.min(MAX_DMG, Math.round(dmg * 10) / 10), room: this.room, t: Date.now() };
    this.sent++;
    try { if (this.transport && this.transport.cast) this.transport.cast('hit', msg); } catch (e) { this.error = e && e.message ? e.message : String(e); }
    hitMarker();
    return msg;
  }

  // Somebody says they hit you. This client decides, against what it knows.
  onHit(msg) {
    const g = this.g, sh = g && g.ship;
    if (!this.on || !sh) return false;
    const p = msg && typeof msg.id === 'string' ? this.peers.get(msg.id) : null;
    const v = judgeHit(msg, {
      me: {
        id: this.id, pvp: this.pvp, pos: sh.pos, room: this.room,
        speed: sh.vel ? sh.vel.length() : 0, alive: sh.hull > 0 && !sh.wreck && g.mode !== 'dead',
      },
      shooter: p ? { pvp: p.pvp, pos: p.want, seen: p.seen, speed: p.speed, room: p.room } : null,
      now: this.clock,
      gate: this.gate,
    });
    if (v.why === 'not for me') return false;
    this.verdict = { ...v, from: msg && msg.id };
    if (!v.ok) { this.refused++; return false; }
    this.taken++;
    g.damage(msg.dmg, `shot by ${p.name}`);
    const dead = !(sh.hull > 0) || g.mode === 'dead';
    try {
      if (this.transport.cast) this.transport.cast('hurt', { id: this.id, by: msg.id, hull: r1(Math.max(0, sh.hull)), dead, room: this.room });
    } catch { /* the next report carries the hull anyway */ }
    this.acc = SEND_EVERY;
    return true;
  }

  // A peer telling the room what its own hull is now. That is the one thing a
  // peer is authoritative over, so it is taken, and nothing else is.
  onHurt(msg) {
    if (!msg || typeof msg.id !== 'string' || msg.id === this.id || !Number.isFinite(msg.hull)) return false;
    const p = this.peers.get(msg.id);
    if (!p) return false;
    p.hull = msg.hull;
    p.down = !!msg.dead || msg.hull <= 0;
    if (msg.by === this.id) {
      this.landed++;
      if (p.down && this.g.ui && this.g.ui.toast) this.g.ui.toast(`You took out ${p.name}.`);
    }
    return true;
  }

  near() {
    let n = 0;
    for (const p of this.peers.values()) if (this.here(p)) n++;
    return n;
  }

  line() {
    if (this.error) return `MULTIPLAYER OFF - ${this.error}`;
    if (!this.on) return 'MULTIPLAYER OFF - O to fly with other people';
    const n = this.near();
    const all = this.peers.size;
    const pvp = this.pvp ? 'PVP ON' : 'PVP OFF, shift O';
    if (!all) return `MULTIPLAYER ON - nobody else out here yet · ${pvp}`;
    return `MULTIPLAYER ON - ${n} in this system, ${all} flying · ${pvp}`;
  }
}

// The HUD line, made the same way the tutorial makes its banner: created once,
// off the same #hud element, so there is nothing to add to index.html.
export function installNetUi() {
  if (typeof document === 'undefined') return null;
  const hud = document.getElementById('hud');
  if (!hud) return null;
  let el = document.getElementById('h-net');
  if (!el) {
    if (!document.getElementById('net-css')) {
      const s = document.createElement('style');
      s.id = 'net-css';
      s.textContent = '#h-net{position:absolute;left:14px;bottom:12px;font:600 11px/1.5 ui-monospace,monospace;letter-spacing:.08em;color:#9fe8ff;text-shadow:0 0 8px rgba(60,200,255,.45);opacity:.85;pointer-events:none}#h-cross.pvp-hit{color:#ff5f7a;transform:scale(1.25)}';
      document.head.appendChild(s);
    }
    el = document.createElement('div');
    el.id = 'h-net';
    hud.appendChild(el);
  }
  return el;
}

export function renderNetLine(net) {
  const el = installNetUi();
  if (!el || !net) return '';
  const text = net.line();
  if (el.textContent !== text) el.textContent = text;
  return text;
}
