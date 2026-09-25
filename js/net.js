// Flying in the same sky as somebody else.
//
// Everything here is deliberately thin. The game stays authoritative over its
// own ship and nothing else: a peer is a ghost drawn from the last thing it
// said about itself, and no message from the network can move your hull, spend
// your fuel or hurt you. That is the whole security model, and it is the reason
// this can ship as a static page with a publishable key in it.
//
// The transport is injectable, which is what makes any of this testable. The
// real one is a Supabase Realtime broadcast channel; the tests wire two Net
// objects to each other through a fake and check the same code paths a live
// room would take - a peer appearing, its ghost chasing the last report, a peer
// falling silent and being forgotten.
import * as THREE from 'three';
import { buildExterior } from './ships.js';

export const PROJECT = 'https://cafodiocsvzgeninsjzi.supabase.co';
// A publishable key is meant to be in the page; it can read what the project's
// policies allow and nothing else. It is the same key the dashboard uses.
export const PUBLISHABLE = 'sb_publishable_eqKwTWBdf77BBVR9o9rN5A_SgkXZ7AY';

export const SEND_EVERY = 0.1;      // seconds between reports about yourself
export const FORGET_AFTER = 6;      // seconds of silence before a peer is dropped
export const CHASE = 6;             // how fast a ghost closes on its last report
export const ROOM = 'doodle-voyager-open-space';

const r1 = (n) => Math.round(Number(n) || 0);
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
export async function realtimeTransport(room = ROOM) {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const client = createClient(PROJECT, PUBLISHABLE, { realtime: { params: { eventsPerSecond: 20 } } });
  let channel = null;
  return {
    async join(handlers) {
      channel = client.channel(room, { config: { broadcast: { self: false } } });
      channel.on('broadcast', { event: 'ship' }, (p) => handlers.onState(p && p.payload));
      channel.on('broadcast', { event: 'bye' }, (p) => handlers.onLeave(p && p.payload && p.payload.id));
      await new Promise((ok, no) => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') ok();
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') no(new Error(`the room would not open (${status})`));
        });
      });
    },
    send(msg) { if (channel) channel.send({ type: 'broadcast', event: 'ship', payload: msg }); },
    bye(id) { if (channel) channel.send({ type: 'broadcast', event: 'bye', payload: { id } }); },
    leave() { if (channel) { try { channel.unsubscribe(); } catch { /* going away anyway */ } channel = null; } },
  };
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
  }

  // Joining is allowed to fail, and a failure says so in the HUD rather than
  // throwing into the frame loop: an unreachable room must not end a game.
  async join(name = this.name) {
    if (this.on) return true;
    this.name = name;
    try {
      if (!this.transport) this.transport = await realtimeTransport();
      await this.transport.join({
        onState: (msg) => this.take(msg),
        onLeave: (id) => this.drop(id),
      });
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
    for (const id of [...this.peers.keys()]) this.drop(id);
  }

  async toggle(name = this.name) {
    if (this.on) { this.leave(); return false; }
    return this.join(name);
  }

  take(msg) {
    if (!readable(msg, this.id)) return false;
    let p = this.peers.get(msg.id);
    if (!p) {
      p = {
        id: msg.id, name: msg.name || 'pilot', type: msg.type, paint: msg.paint || 'yellow',
        pos: new THREE.Vector3(msg.pos[0], msg.pos[1], msg.pos[2]),
        want: new THREE.Vector3(msg.pos[0], msg.pos[1], msg.pos[2]),
        q: new THREE.Quaternion(msg.q[0], msg.q[1], msg.q[2], msg.q[3]),
        wantQ: new THREE.Quaternion(msg.q[0], msg.q[1], msg.q[2], msg.q[3]),
        hull: msg.hull, zone: msg.zone || '', seen: this.clock, group: null,
      };
      this.peers.set(msg.id, p);
      this.mesh(p);
    } else {
      p.want.set(msg.pos[0], msg.pos[1], msg.pos[2]);
      p.wantQ.set(msg.q[0], msg.q[1], msg.q[2], msg.q[3]);
      p.hull = msg.hull;
      p.zone = msg.zone || '';
      p.name = msg.name || p.name;
      p.seen = this.clock;
      // A peer that changed hull needs a new body, not a relabelled old one.
      if (msg.type !== p.type) { p.type = msg.type; p.paint = msg.paint || p.paint; this.unmesh(p); this.mesh(p); }
    }
    return true;
  }

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
    p.group.position.copy(p.pos);
    p.group.quaternion.copy(p.q);
    this.root.add(p.group);
    return p.group;
  }

  unmesh(p) {
    if (p.group && this.root) this.root.remove(p.group);
    p.group = null;
  }

  // Ten reports a second is not a frame rate, so a ghost is chased towards its
  // last report rather than snapped to it: snapping is what makes other people
  // look like they are teleporting.
  update(dt) {
    this.clock += dt;
    if (!this.on) return;
    const k = Math.min(1, dt * CHASE);
    for (const [id, p] of this.peers) {
      if (this.clock - p.seen > FORGET_AFTER) { this.drop(id); continue; }
      p.pos.lerp(p.want, k);
      p.q.slerp(p.wantQ, k);
      if (p.group) {
        p.group.position.copy(p.pos);
        p.group.quaternion.copy(p.q);
        // Only the ones in your own patch of sky are worth drawing.
        p.group.visible = !p.zone || !this.g.zone || p.zone === this.g.zone.id;
      }
    }
    this.acc += dt;
    if (this.acc >= SEND_EVERY) {
      this.acc = 0;
      if (this.g && this.g.ship && this.transport) {
        try { this.transport.send(packShip(this.g, this.id, this.name)); } catch (e) { this.error = e && e.message ? e.message : String(e); }
      }
    }
  }

  near() {
    let n = 0;
    for (const p of this.peers.values()) if (!p.zone || !this.g.zone || p.zone === this.g.zone.id) n++;
    return n;
  }

  line() {
    if (this.error) return `MULTIPLAYER OFF - ${this.error}`;
    if (!this.on) return 'MULTIPLAYER OFF - O to fly with other people';
    const n = this.near();
    const all = this.peers.size;
    if (!all) return 'MULTIPLAYER ON - nobody else out here yet';
    return `MULTIPLAYER ON - ${n} in this system, ${all} flying`;
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
      s.textContent = '#h-net{position:absolute;left:14px;bottom:12px;font:600 11px/1.5 ui-monospace,monospace;letter-spacing:.08em;color:#9fe8ff;text-shadow:0 0 8px rgba(60,200,255,.45);opacity:.85;pointer-events:none}';
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
