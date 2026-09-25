// Mission one: the tutorial, at Sol Pumps, voiced by the Spiral Bound Galactic
// station announcer. Every step is detected from real game state - a real
// interactable under the crosshair, a real throttle reading, a real course on
// the autopilot, a real refusal at the wrong pump, real red guys dead - and
// nothing advances on a timer or a click-through.
//
// It plays as the first mission of a NEW game only, is skippable from the pause
// menu at any moment, and is replayable from the same menu afterwards. A
// returning player is never armed into it: see upgradeSave() in game.js, which
// backfills tutorialDone as TRUE for an old save.
//
// This module owns its own HUD banner, its own CSS and its own two pause
// buttons, injected once at boot, so index.html and style.css stay untouched
// and nothing here can collide with the rest of the HUD.
import { audio } from './audio.js';
import { kbd } from './pad.js';

const ANNEX_ID = 'sol-annex';
export const ANNEX_NAME = 'SBG Annex Pumps';
// The hop, in game units: straight up out of the ecliptic from Sol Pumps along
// Sol's own orbital normal, so the Annex can never be confused with, or collide
// with, a planet - every Solar System orbit lies in the plane this is
// perpendicular to, and the Sun's own gravity well ends 80,000 u from its
// centre, well short of this. Long enough that the autopilot engages the cruise
// drive (it only does past 40,000 u) and that Sol stays the nearer star while
// you are parked at Sol Pumps, 73,109 u out; short enough to fly in well under
// a minute.
const ANNEX_UP = 110000;
const ARRIVED = 4000;          // "the autopilot got you there" radius
const STUCK = 25;              // seconds on one step before the banner offers skip
// docs/STORY.md's first station-announcer line, verbatim.
const REFUSAL = 'A cheerful voice: "Welcome, valued customer. This pump does not serve your fuel type. Please enjoy the music."';

const $ = (id) => (typeof document === 'undefined' ? null : document.getElementById(id));
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
// Local -Z through a quaternion, without pulling THREE in for one vector.
function fwdOf(q) {
  return { x: -2 * (q.x * q.z + q.w * q.y), y: -2 * (q.y * q.z - q.w * q.x), z: -(1 - 2 * (q.x * q.x + q.y * q.y)) };
}
function rightOf(q) {
  return { x: 1 - 2 * (q.y * q.y + q.z * q.z), y: 2 * (q.x * q.y + q.w * q.z), z: 2 * (q.x * q.z - q.w * q.y) };
}
function upOf(q) {
  return { x: 2 * (q.x * q.y - q.w * q.z), y: 1 - 2 * (q.x * q.x + q.z * q.z), z: 2 * (q.y * q.z + q.w * q.x) };
}

// ---------- the wrong pump ----------
// A real, permanent Spiral Bound Galactic depot in Milky Way space: one more
// pump in a universe where about 42 per cent of systems sell fuel, and licensed
// for two of the three - never ION, which is what the Pencil Case burns. That
// is the whole joke, and it has to be a system of its own because a system view
// only ever builds one station.
export function installAnnex(u) {
  const list = u.systemCache.get(u.mw.id);
  if (!list) return null;
  const had = list.find((s) => s.id === ANNEX_ID);
  if (had) return had;
  const n = u.sol.basis.n, from = u.sol.station.pos;
  const sys = u.makeSystem(u.mw, {
    id: ANNEX_ID, name: 'Sol Annex', real: false, teff: 2950, srad: 0.08, seed: 0x5b9a11e,
    pos: { x: from.x + n.x * ANNEX_UP, y: from.y + n.y * ANNEX_UP, z: from.z + n.z * ANNEX_UP },
    normal: { x: n.x, y: n.y, z: n.z },
  });
  // A burnt-out marker beacon, not a second sun: small enough to read as a dot
  // from Earth orbit, and its gravity well ends long before the pump.
  sys.star.r = 400;
  sys.planets = [];            // a depot, not a system. No worlds, no orbits.
  sys.noZone = true;           // universe.js rollZones skips it: a zone here would swallow Sol
  sys.station = { name: ANNEX_NAME, fuelTypes: ['PLASMA', 'DEUTERIUM'], pos: null };
  sys.station.pos = u.stationPos(sys);
  list.push(sys);
  return sys;
}
export function annexOf(u) {
  const list = u.systemCache.get(u.mw.id) || [];
  return list.find((s) => s.id === ANNEX_ID) || null;
}

// ---------- the steps ----------
// { id, obj(t) -> HTML for the banner, detect(t) -> true once, enter(t), say }
// `say` is the announcer: a ui.big() banner in the voice from docs/STORY.md -
// sincere corporate cheer about something absurd, undercutting its own product.
const STEPS = [
  {
    // Walking and sitting are one step on purpose: the Pencil Case cockpit puts
    // the seat a stride and a quarter from where you wake up, inside the helm's
    // own reach, so a player who presses use straight away has not skipped
    // anything and must not be told to walk further into a bulkhead.
    id: 'seat',
    say: ['WELCOME ABOARD', 'Welcome aboard, valued customer. Your seat is the one with the yoke. Your tank is half full, which the yard calls a starter measure.'],
    obj: (t) => `Walk with ${kbd(t.g, 'WASD', 'foot')} and take the pilot's seat: ${kbd(t.g, 'E', 'foot')} at the helm.`,
    detect: (t) => t.g.mode === 'helm',
  },
  {
    id: 'look',
    say: ['LOOKING IS FREE', 'Looking is free. Everything else is not.'],
    obj: (t) => `Hold ${kbd(t.g, 'Q', 'helm')} and look around without steering.`,
    detect: (t) => t.looked,
  },
  {
    id: 'throttle',
    say: ['THE ONE THAT MAKES IT GO', 'The throttle is the one that makes the ship go. Tap for a nudge, hold to keep climbing.'],
    obj: (t) => `Throttle up past halfway with ${kbd(t.g, 'W', 'helm')}.`,
    detect: (t) => t.g.ship.throttle >= 0.5,
  },
  {
    id: 'roll',
    say: ['ROLL, AND BURN', "You'll want to roll around the wing markers, and boost past anything you'd rather not be near."],
    obj: (t) => `Roll with ${kbd(t.g, 'A', 'helm')} ${kbd(t.g, 'D', 'helm')}, and hold ${kbd(t.g, 'Shift', 'helm')} to boost.`,
    detect: (t) => t.rolled && t.boosted,
  },
  {
    id: 'fire',
    say: ['ONE LONE SCOUT', 'That is a lone Red Margin scout, drifting. It has not clocked you yet. Go ahead.'],
    obj: (t) => `Fire on the scout ahead: ${kbd(t.g, 'Space', 'helm')}.`,
    enter: (t) => t.spawnScout(),
    detect: (t) => t.fired,
  },
  {
    id: 'assist',
    say: ['THAT WAS THE SHIP', 'Notice your aim wanders toward it inside six degrees. That is the ship\'s doing, not yours. Do not tell it we said so.'],
    obj: (t) => 'Put the scout inside the crosshair ring and keep firing.',
    detect: (t) => t.assisted || t.scoutGone(),
    // Leaving this step tidies the scout away, whether the player finished it or not.
    leave: (t) => t.killScout(),
  },
  {
    id: 'course',
    say: ['TRY THE ANNEX', "For your first hop, try the Annex. It's marked on your instruments."],
    obj: (t) => `Open the map with ${kbd(t.g, 'M', 'helm')}, pick ${ANNEX_NAME}, then ${kbd(t.g, 'T', 'helm')} to set the course.`,
    enter: (t) => t.markAnnex(),
    detect: (t) => t.courseTo(ANNEX_NAME),
  },
  {
    id: 'fly',
    say: ['COURSE LAID IN', 'Course laid in. Feel free to get up and stretch your legs, the ship has this.'],
    obj: () => 'The autopilot is flying it. Nothing to press.',
    detect: (t) => t.nearAnnex(),
  },
  {
    id: 'dock',
    say: ['ANNEX AHEAD', 'Spiral Bound Fuels: not the closest pump. Not the cheapest pump. A pump.'],
    obj: (t) => `Dock at the Annex: ${kbd(t.g, 'F', 'helm')}.`,
    detect: (t) => t.dockedAt(ANNEX_NAME),
  },
  {
    id: 'refused',
    // Verbatim from docs/STORY.md's announcer lines. The station panel covers
    // the HUD while you are docked, so this one is also written into the shop's
    // own message line, where the player is actually looking.
    say: ['WRONG NOZZLE', 'Welcome, valued customer. This pump does not serve your fuel type. Please enjoy the music.'],
    obj: (t) => `Undock, then set a course back to Sol Pumps: ${kbd(t.g, 'T', 'helm')}.`,
    enter: (t) => { t.g.unlockCodex('fuelracket'); t.markSol(); t.sayInShop(REFUSAL); audio.sfx('deny'); },
    detect: (t) => t.courseTo('Sol Pumps'),
  },
  {
    id: 'home',
    say: ['SOL PUMPS SELLS EVERYONE\'S', "Sol Pumps sells everyone's fuel. It's the one selling point."],
    obj: () => 'Back to Sol Pumps. The ship has it.',
    detect: (t) => t.nearSol(),
  },
  {
    id: 'refuel',
    say: ['THE GOOD STUFF', 'Ion, the good stuff, the stuff you actually burn. Mind the price.'],
    obj: (t) => `Dock with ${kbd(t.g, 'F', 'helm')} and fill the tank.`,
    enter: (t) => { t.fuelMark = t.g.ship.fuel; },
    detect: (t) => t.refuelled(),
  },
  {
    id: 'wing',
    say: ['MULTIPLE CONTACTS', "Multiple contacts, Red Margin formation. That's new for them. Good luck, valued customer."],
    obj: () => 'A wing of three is inbound. Clear it.',
    defer: true,             // wait until the shop panel is shut before it spawns
    enter: (t) => t.spawnWing(),
    detect: (t) => t.wingClear(),
  },
];

// ---------- the banner, and the two pause buttons ----------
const CSS = `
.tut { position: absolute; left: 50%; top: 14px; transform: translateX(-50%) rotate(0.4deg);
  width: min(560px, 74vw); text-align: center; mix-blend-mode: screen;
  background: rgba(11, 15, 24, 0.82); border: 2px solid var(--ink);
  border-radius: 10px 14px 9px 13px / 13px 9px 12px 10px; padding: 4px 14px 6px; }
.tut b { display: block; font-weight: normal; font-size: 14.5px; letter-spacing: 0.06em; opacity: 0.75; }
.tut span { display: block; font-size: 20px; line-height: 1.2; }
.tut small { display: block; font-size: 14px; opacity: 0.65; margin-top: 2px; }
`;
function installCss() {
  if (typeof document === 'undefined' || $('tut-css')) return;
  const s = document.createElement('style');
  s.id = 'tut-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
export function syncPause(game) {
  const skip = $('p-skip-tut'), rep = $('p-replay-tut');
  if (skip) skip.hidden = !game.tutorial;
  if (rep) rep.hidden = !!game.tutorial;
}
// One call from boot(): the CSS, the banner, the pause buttons and their wiring.
export function installTutorialUi(game) {
  if (typeof document === 'undefined') return;
  installCss();
  const hud = $('hud');
  if (hud && !$('h-tut')) {
    const d = document.createElement('div');
    d.className = 'tut';
    d.id = 'h-tut';
    d.hidden = true;
    d.innerHTML = '<b id="h-tut-n"></b><span id="h-tut-obj"></span><small id="h-tut-fine"></small>';
    hud.appendChild(d);
  }
  const stack = document.querySelector('#pause .stack');
  if (stack && !$('p-skip-tut')) {
    const before = stack.querySelector('[data-act="logoff"]');
    const mk = (id, html) => { const b = document.createElement('button'); b.id = id; b.hidden = true; b.innerHTML = html; stack.insertBefore(b, before); return b; };
    mk('p-skip-tut', 'skip the tutorial<small id="p-skip-sub"></small>').dataset.act = 'skip-tutorial';
    mk('p-replay-tut', 'replay the tutorial<small id="p-replay-sub"></small>').dataset.act = 'replay-tutorial';
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button');
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'skip-tutorial') {
        game.skipTutorial();
        game.ui.close('pause');
        game.pause(false);
      } else if (a === 'replay-tutorial') {
        const now = performance.now();
        const sub = $('p-replay-sub');
        if (now - (game.ui.replayArm || 0) < 4000) {
          game.ui.replayArm = 0;
          if (sub) sub.textContent = '';
          game.ui.close('pause');
          game.pause(false);
          game.startTutorial(true);
          return;
        }
        game.ui.replayArm = now;
        if (sub) sub.textContent = 'click again: it flies you back to Sol Pumps';
      }
    });
  }
  syncPause(game);
}

export class Tutorial {
  constructor(game, replay = false) {
    const g = this.g = game;
    g.tutorial = this;            // before anything reads it: syncPause below does
    this.annex = installAnnex(g.u);
    this.i = 0;
    this.t = 0;
    this.acc = 1;
    this.looked = false;
    this.rolled = false;
    this.boosted = false;
    this.fired = false;
    this.assisted = false;
    this.fuelMark = 0;
    this.scout = null;
    this.wing = [];
    this.pending = null;
    this.replay = replay;
    this.steps = STEPS.length;
    g.clearCombat();
    if (replay) g.parkNear(g.u.sol.station.pos, 5000);
    else g.ship.fuel = Math.min(g.ship.fuel, g.stat('tank') * 0.5);   // room for the refuelling step
    g.setMode('foot');
    const sp = g.interior.spawn;
    g.ship.deck = 0; g.ship.deckY = 0; g.ship.elevator = null;
    g.player.x = sp.x; g.player.z = sp.z; g.player.y = 0; g.player.vy = 0;
    g.player.yaw = g.interior.spawnYaw || 0; g.player.pitch = 0;
    syncPause(g);
    this.enter(STEPS[0]);
    if (!g.ui.anyOpen() && !g.paused) g.lock();
  }

  // ---------- step machine ----------
  enter(st) {
    this.t = 0;
    if (st.defer && this.g.ui.anyOpen()) { this.pending = st; this.render(); return; }
    if (st.say) { this.g.ui.big(st.say[0], st.say[1]); audio.sfx('ui'); }
    if (st.enter) st.enter(this);
    this.render();
  }
  advance() {
    const st = STEPS[this.i];
    if (st.leave) st.leave(this);
    this.i++;
    if (this.i >= STEPS.length) { this.finish(); return; }
    this.enter(STEPS[this.i]);
  }
  update(dt) {
    const g = this.g;
    if (g.tutorial !== this) return;                 // replaced, skipped or finished
    if (!g.state || g.mode === 'title' || g.mode === 'dead') return;
    this.t += dt;
    this.watch(dt);
    if (this.pending) {
      if (!g.ui.anyOpen()) { const st = this.pending; this.pending = null; this.enter(st); }
    } else {
      const st = STEPS[this.i];
      if (st.detect && st.detect(this)) this.advance();
    }
    if (g.tutorial !== this) return;                 // the last step finished it just now
    this.acc += dt;
    if (this.acc > 0.12) { this.acc = 0; this.render(); }
  }
  // Everything the steps read, sampled once a frame off real state.
  watch(dt) {
    const g = this.g, sh = g.ship, p = g.player;
    if (g.mode === 'helm') {
      if (Math.abs(p.lookYaw) + Math.abs(p.lookPitch) > 0.15) this.looked = true;
      if (g.keys.has('KeyA') || g.keys.has('KeyD')) this.rolled = true;
      if (sh.boost) this.boosted = true;
    }
    const shot = g.shots.some((s) => s.from === 'player');
    if (shot) this.fired = true;
    // The real aim-assist function, asked the real question: is the scout the
    // thing the ship is quietly pulling the bolts onto?
    if (shot && this.scout && !this.scout.dead) {
      const lock = g.assistTarget(fwdOf(sh.q));
      if (lock && dist3(lock, this.scout.pos) < 420) this.assisted = true;
    }
    this.driftScout(dt);
  }
  render() {
    const g = this.g, el = $('h-tut');
    if (!el || g.tutorial !== this) return;
    el.hidden = false;
    const st = STEPS[this.i] || STEPS[STEPS.length - 1];
    const n = $('h-tut-n'); if (n) n.textContent = `MISSION ONE  ${this.i + 1} of ${this.steps}`;
    const o = $('h-tut-obj');
    const html = st.obj ? st.obj(this) : '';
    if (o && o.innerHTML !== html) o.innerHTML = html;
    const f = $('h-tut-fine');
    const fine = this.t > STUCK
      ? `stuck? ${kbd(g, 'P')} pause, then skip the tutorial`
      : `${kbd(g, 'P')} pause · skippable at any time`;
    if (f && f.innerHTML !== fine) f.innerHTML = fine;
  }

  // ---------- detectors ----------
  courseTo(name) {
    const a = this.g.ship.auto;
    return !!(a && a.target && String(a.target.name).includes(name));
  }
  nearAnnex() {
    const s = this.annex;
    return !!s && dist3(this.g.ship.pos, s.station.pos) < ARRIVED;
  }
  nearSol() { return dist3(this.g.ship.pos, this.g.u.sol.station.pos) < ARRIVED; }
  dockedAt(name) {
    const d = this.g.ui.stationData;
    return !!(this.g.ui.open_.has('station') && d && d.name === name);
  }
  refuelled() {
    const g = this.g;
    if (!this.dockedAt(g.u.sol.station.name)) return false;
    // A fresh voyage starts half full, so this is a real purchase. On a replay
    // a veteran may already be brimmed, and standing at the right pump with a
    // full tank is the objective met, not a thing to fake.
    return g.ship.fuel > this.fuelMark + 0.05 || g.ship.fuel >= g.stat('tank') - 0.06;
  }
  gone(e) { return !e || e.dead || !this.g.enemies.includes(e); }
  scoutGone() { return this.gone(this.scout); }
  wingClear() { return this.wing.length > 0 && this.wing.every((e) => this.gone(e)); }

  // ---------- scripted actors ----------
  markAnnex() {
    const g = this.g, s = this.annex;
    if (!s) return;
    g.navTarget = g.u.target('station', { name: s.station.name, pos: s.station.pos, fuelTypes: s.station.fuelTypes });
  }
  markSol() {
    const g = this.g, st = g.u.sol.station;
    g.navTarget = g.u.target('station', { name: st.name, pos: st.pos, fuelTypes: st.fuelTypes });
  }
  // The shop's own message line, the one place a docked player is reading.
  sayInShop(text) {
    const el = $('st-msg');
    if (el && this.g.ui.open_.has('station')) el.textContent = text;
  }
  // A derelict: passive is honoured by updateCombat, so it never steers and
  // never shoots. It is a real enemies entry, so the ship's own aim assist
  // treats it exactly as it treats anything else.
  spawnScout() {
    const g = this.g, sh = g.ship, f = fwdOf(sh.q);
    const e = g.spawnImp({ x: sh.pos.x + f.x * 820, y: sh.pos.y + f.y * 820, z: sh.pos.z + f.z * 820 });
    e.passive = true;
    e.hp = e.max = 140;      // it has to survive being learnt on
    this.scout = e;
  }
  // It drifts to stay in front of you rather than holding a fixed point, so the
  // step can never be lost off the back of a ship at full throttle.
  driftScout(dt) {
    const e = this.scout, g = this.g;
    if (!e || e.dead || !g.enemies.includes(e)) return;
    const sh = g.ship, f = fwdOf(sh.q);
    const dx = sh.pos.x + f.x * 820 - e.pos.x, dy = sh.pos.y + f.y * 820 - e.pos.y, dz = sh.pos.z + f.z * 820 - e.pos.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const sp = Math.min(d / Math.max(dt, 1e-3), Math.min(900, Math.max(260, sh.vel.length() * 1.12)));
    e.vel.set((dx / d) * sp, (dy / d) * sp, (dz / d) * sp);
    e.pos.x += e.vel.x * dt; e.pos.y += e.vel.y * dt; e.pos.z += e.vel.z * dt;
  }
  killScout() {
    const e = this.scout;
    if (!e || this.gone(e)) { this.scout = null; return; }
    this.g.hurt(e, 1e6, { ...e.pos });
    this.scout = null;
  }
  // The first wing of Paper Wasps, in a clean V (docs/STORY.md, Act 1).
  spawnWing() {
    const g = this.g, sh = g.ship;
    const f = fwdOf(sh.q), r = rightOf(sh.q), u = upOf(sh.q);
    const base = { x: sh.pos.x + f.x * 2600, y: sh.pos.y + f.y * 2600, z: sh.pos.z + f.z * 2600 };
    const spots = [[0, 0, 0], [-300, -40, 300], [300, -40, 300]];
    this.wing = spots.map(([a, b, c]) => {
      const e = g.spawnImp({
        x: base.x + r.x * a + u.x * b + f.x * c,
        y: base.y + r.y * a + u.y * b + f.y * c,
        z: base.z + r.z * a + u.z * b + f.z * c,
      });
      e.tutorialWing = true;
      return e;
    });
  }

  // ---------- leaving ----------
  finish() {
    const g = this.g;
    g.state.tutorialDone = true;
    g.state.credits += 150;
    g.unlockCodex('margin');
    g.ui.big('TUTORIAL COMPLETE', "Sol system's fuel racket has been explained to you at length. Nobody warned you about the rest. +150 cr");
    audio.sfx('coin');
    this.end();
  }
  skip() {
    const g = this.g;
    g.state.tutorialDone = true;
    g.ui.toast('Tutorial skipped. It is under "replay the tutorial" in the pause menu whenever you want it.');
    this.end();
  }
  // Never leaves a scripted actor behind, and never touches hull, credits,
  // fuel or position: skipping must cost a player nothing.
  end() {
    const g = this.g;
    for (const e of [this.scout, ...this.wing]) {
      if (!e || e.dead || !g.enemies.includes(e)) continue;
      e.dead = true;
      if (e.obj && e.obj.group) g.fxRoot.remove(e.obj.group);
    }
    this.scout = null;
    this.wing = [];
    const el = $('h-tut');
    if (el) el.hidden = true;
    if (g.tutorial === this) g.tutorial = null;
    syncPause(g);
    g.persist();
  }
}
