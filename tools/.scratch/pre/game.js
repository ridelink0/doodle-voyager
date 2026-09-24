// The game: modes (title, foot, helm, eva, drone, dead), the ship's flight
// model, autopilot, cruise and warp, fuel, enemy zones and combat, the drone,
// the hull breach, saving, and the per-frame loop.
import * as THREE from 'three';
import { Renderer, squash } from './render.js';
import { Universe, FUELS } from './universe.js';
import { SHIPS, buildInterior, buildExterior } from './ships.js';
import { buildImp, buildCapital, buildDrone } from './actors.js';
import { audio } from './audio.js';
import { Media } from './media.js';
import { UI } from './ui.js';
import { glow, ink, screen, PAL } from './mats.js';
import { clamp, damp, smooth, vdist, fmtU, fmtTime, TAU } from './util.js';

export const EQUIP = {
  laser: { name: 'Sharper nibs', desc: 'Laser damage +35% a level', prices: [1500, 3400, 6800] },
  cooler: { name: 'Eraser-dust coolant', desc: 'Laser heat capacity +40% a level', prices: [1200, 2600, 5200] },
  shield: { name: 'Laminated shield', desc: 'Shield +30% and faster regen a level', prices: [1800, 3800, 7600] },
  armor: { name: 'Cardboard armour', desc: 'Hull +25% a level', prices: [1600, 3400, 7000] },
  tank: { name: 'Bigger tank', desc: 'Fuel tank +30% a level', prices: [1400, 3000, 6200] },
  engine: { name: 'Cruise drive tune', desc: 'Cruise top speed +20% a level', prices: [2000, 4400, 9000] },
  bombs: { name: 'Bomb rack', desc: 'Drone carries 2 more bombs a level', prices: [900, 2000, 4200] },
  battery: { name: 'Drone battery', desc: 'Drone flight time +45 s a level', prices: [800, 1800, 3800] },
};
export const ITEMS = {
  canister: { name: 'Universal fuel canister', desc: '+20 of whatever your ship burns. For when the nearest pump is the wrong kind.', price: 950 },
  repair: { name: 'Hull patch kit', desc: 'Patches 60 hull, anywhere.', price: 450 },
  snacks: { name: 'Box of snacks', desc: 'Goes in the fridge. Eating one tops the shield up by 15.', price: 60 },
  poster: { name: 'Band poster', desc: 'For the dorm wall. Does nothing. Looks great.', price: 120 },
};
export const PAINT_NAMES = { yellow: 'Yellow highlighter', blue: 'Blue highlighter', outline: 'Bare paper, blue outline' };
const PAINT_PRICE = 300;
const FUEL_PRICE = { ION: 6, PLASMA: 9, DEUTERIUM: 14 };
const SAVE_KEY = 'dv-save-1';
const TOW_PRICE = 400;

const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3();
const Q1 = new THREE.Quaternion(), Q2 = new THREE.Quaternion();
const E1 = new THREE.Euler(0, 0, 0, 'YXZ');
const FWD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);
function qYP(yaw, pitch, roll = 0, out = new THREE.Quaternion()) { E1.set(pitch, yaw, roll, 'YXZ'); return out.setFromEuler(E1); }
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};

export function defaultSettings() {
  return {
    sens: 1, invert: false, music: true, musicVol: 0.45, sfxVol: 0.7, drone: true, boil: true, quality: 1, hints: true,
    trackpad: false, fov: 72, shake: true, showFps: false, pauseOnBlur: true, wheelThrottle: true,
  };
}
function freshSave() {
  return {
    v: 1, credits: 1500, ship: 'scout', owned: ['scout'], paint: { scout: 'yellow' }, fuel: { scout: SHIPS.scout.tank }, hull: { scout: SHIPS.scout.hull },
    equip: Object.fromEntries(Object.keys(EQUIP).map((k) => [k, 0])), items: { snacks: 2 }, pos: null, quat: null,
    liberated: [], visited: [], stats: { kills: 0, capitals: 0, zones: 0, distance: 0, warps: 0, deaths: 0, docked: 0 },
    lastStation: null, bookmarks: [], created: Date.now(),
  };
}
// Older saves get any fields added since.
function upgradeSave(s) {
  const f = freshSave();
  for (const k of Object.keys(f)) if (s[k] === undefined) s[k] = f[k];
  for (const k of Object.keys(f.equip)) if (s.equip[k] === undefined) s.equip[k] = 0;
  for (const k of Object.keys(f.stats)) if (s.stats[k] === undefined) s.stats[k] = 0;
  return s;
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new Renderer(canvas);
    this.u = new Universe(this.r);
    this.media = new Media();
    this.settings = { ...defaultSettings(), ...(store.get('dv-settings') || {}) };
    this.save = store.get(SAVE_KEY) || null;
    this.mode = 'title';
    this.paused = false;
    this.keys = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false };
    this.t = (Date.now() / 1000) % 1e7;
    this.last = performance.now();
    this.enemies = [];
    this.shots = [];
    this.fx = [];
    this.bombs = [];
    this.zone = null;
    this.sessionSeed = (Math.random() * 2 ** 32) >>> 0;
    this.sessionStart = new Date();
    this.msgCooldown = 0;
    this.fps = 60;
    this.ready = false;
    window.__dv = this;
  }

  // ---------- boot ----------
  async boot(onProgress = () => {}) {
    onProgress('loading the catalogues');
    await this.u.load();
    onProgress('loading the tapes');
    try { await this.media.init(); } catch (e) { console.warn('[media] init failed', e); }
    this.ui = new UI(this);
    const s = this.save ? upgradeSave(this.save) : freshSave();
    this.state = s;
    this.u.rollZones(this.sessionSeed, new Set(s.liberated));
    this.initWorld();
    this.buildShip(s.ship);
    this.placeAtStart();
    this.applySettings();
    this.bindInput();
    this.ready = true;
    this.ui.showTitle();
    requestAnimationFrame((n) => this.loop(n));
  }

  initWorld() {
    const w = this.r.world, sh = this.r.shipScene;
    this.hemi = new THREE.HemisphereLight(0xfff6e0, 0x8090b0, 1.1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.1);
    this.sun.position.set(1, 0.6, 0.4);
    w.add(this.hemi, this.sun, this.sun.target);
    this.shipHemi = new THREE.HemisphereLight(0xfff1d8, 0x9aa4c0, 1.5);
    this.hemiBase = { sky: this.shipHemi.color.clone(), ground: this.shipHemi.groundColor.clone() };
    sh.add(this.shipHemi);
    this.shipRoot = new THREE.Group();
    this.extRoot = new THREE.Group();
    sh.add(this.shipRoot);
    w.add(this.extRoot);
    this.fxRoot = new THREE.Group();
    w.add(this.fxRoot);
    // shared projectile look
    this.boltGeo = new THREE.BoxGeometry(0.9, 0.9, 16);
    this.boltMat = glow(0xffd84a);
    this.eBoltMat = glow(0xff5a4a);
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, -0.5);
    this.bombGeo = new THREE.IcosahedronGeometry(1.1, 0);
    this.debrisGeo = new THREE.TetrahedronGeometry(1, 0);
    this.ringGeo = new THREE.TorusGeometry(1, 0.08, 6, 40);
  }

  // ---------- ship ----------
  get def() { return SHIPS[this.ship.type]; }
  stat(k) {
    const d = this.def, e = this.state.equip;
    switch (k) {
      case 'hull': return Math.round(d.hull * (1 + 0.25 * e.armor));
      case 'shield': return Math.round(d.shield * (1 + 0.3 * e.shield));
      case 'tank': return Math.round(d.tank * (1 + 0.3 * e.tank));
      case 'cruise': return d.cruise * 60 * (1 + 0.2 * e.engine);
      case 'speed': return d.speed * (1 + 0.1 * e.engine);
      case 'dmg': return d.dmg * (1 + 0.35 * e.laser);
      case 'heat': return 100 * (1 + 0.4 * e.cooler);
      case 'bombs': return 4 + 2 * e.bombs;
      case 'battery': return 90 + 45 * e.battery;
      case 'regen': return 6 + 3 * e.shield;
      default: return 0;
    }
  }

  buildShip(type) {
    const s = this.state;
    if (this.interior) { this.shipRoot.remove(this.interior.group); }
    if (this.exterior) { this.extRoot.remove(this.exterior.group); }
    const paint = s.paint[type] || 'yellow';
    this.interior = buildInterior(type, paint);
    this.exterior = buildExterior(type, paint);
    this.shipRoot.add(this.interior.group);
    this.extRoot.add(this.exterior.group);
    const prev = this.ship;
    this.ship = {
      type, pos: prev ? prev.pos : { x: 0, y: 0, z: 0 }, q: prev ? prev.q : new THREE.Quaternion(), vel: new THREE.Vector3(),
      throttle: 0, cs: 0, cruise: false, boost: false, auto: null, warp: null,
      hull: s.hull[type] ?? SHIPS[type].hull, shield: 0, fuel: s.fuel[type] ?? SHIPS[type].tank, heat: 0, overheat: false,
      gunIdx: 0, fireCd: 0, lastHit: 0, bombs: 4, bombTimer: 0,
    };
    this.ship.shield = this.stat('shield');
    this.ship.bombs = this.stat('bombs');
    this.ship.hull = Math.min(this.ship.hull, this.stat('hull'));
    this.ship.fuel = Math.min(this.ship.fuel, this.stat('tank'));
    // screens
    const sc = this.interior.screens || {};
    if (sc.main) sc.main.material = screen(this.media.texture);
    if (sc.lounge) sc.lounge.material = screen(this.media.texture);
    this.navCanvas = document.createElement('canvas');
    this.navCanvas.width = 512; this.navCanvas.height = 256;
    this.navTex = new THREE.CanvasTexture(this.navCanvas);
    this.navTex.colorSpace = THREE.SRGBColorSpace;
    if (sc.nav) sc.nav.material = screen(this.navTex);
    this.breach = null;
    if (this.interior.breach && this.interior.breach.panel) {
      const p = this.interior.breach.panel;
      this.panelHome = { pos: p.position.clone(), rot: p.rotation.clone(), parent: p.parent };
    }
    if (this.exterior.hole && this.exterior.hole.mesh) this.exterior.hole.mesh.visible = false;
    this.player = {
      x: this.interior.spawn.x, z: this.interior.spawn.z, y: 0, vy: 0, yaw: this.interior.spawnYaw || 0, pitch: 0,
      bob: 0, lookYaw: 0, lookPitch: 0,
    };
    this.lights = (this.interior.lights || []).map((l) => ({ l, on: true, base: l.intensity, col: l.color.clone() }));
    this.alertOn = false;
  }

  placeAtStart() {
    const s = this.state;
    if (s.pos && Number.isFinite(s.pos.x)) {
      this.ship.pos = { ...s.pos };
      if (s.quat) this.ship.q.set(s.quat[0], s.quat[1], s.quat[2], s.quat[3]);
      return;
    }
    this.parkNear(this.u.sol.station.pos, 5000);
  }
  parkNear(p, dist) {
    const earthSys = this.u.sol;
    this.ship.pos = { x: p.x + dist * 0.3, y: p.y + dist * 0.25, z: p.z + dist };
    const look = V1.set(earthSys.pos.x - this.ship.pos.x, earthSys.pos.y - this.ship.pos.y, earthSys.pos.z - this.ship.pos.z).normalize();
    this.ship.q.setFromUnitVectors(FWD, look);
    this.ship.vel.set(0, 0, 0);
    this.ship.cs = 0; this.ship.throttle = 0; this.ship.cruise = false; this.ship.auto = null; this.ship.warp = null;
  }

  newVoyage() {
    store.del(SAVE_KEY);
    this.save = null;
    this.state = freshSave();
    this.clearCombat();
    this.u.rollZones(this.sessionSeed, new Set());
    this.ship = null;
    this.buildShip('scout');
    this.placeAtStart();
    this.persist();
  }
  launch() {
    audio.init();
    this.applySettings();
    if (this.settings.music) audio.mood(this.zone ? 'combat' : 'cruise');
    this.ui.hideTitle();
    this.setMode('helm');
    this.lock();
    this.ui.big('YOU ARE AT THE HELM', 'W/S throttle, C cruise, M map. E stands you up.');
  }
  logOff() {
    this.persist();
    this.clearCombat();
    this.sessionSeed = (Math.random() * 2 ** 32) >>> 0;
    this.sessionStart = new Date();
    this.u.rollZones(this.sessionSeed, new Set(this.state.liberated));
    this.paused = false;
    this.setMode('title');
    this.unlock();
    this.ui.showTitle();
  }
  persist() {
    const s = this.state, sh = this.ship;
    if (!s || !sh) return;
    s.ship = sh.type;
    s.hull[sh.type] = Math.round(sh.hull);
    s.fuel[sh.type] = Math.round(sh.fuel * 10) / 10;
    s.pos = sh.warp ? { ...sh.warp.to } : { ...sh.pos };
    s.quat = [sh.q.x, sh.q.y, sh.q.z, sh.q.w];
    this.save = s;
    store.set(SAVE_KEY, s);
  }
  saveSettings() { store.set('dv-settings', this.settings); this.applySettings(); }
  applySettings() {
    const st = this.settings;
    this.r.boil = st.boil ? 1 : 0;
    if (this.r.camera.fov !== st.fov) { this.r.camera.fov = clamp(Number(st.fov) || 72, 55, 100); this.r.camera.updateProjectionMatrix(); }
    if (this.r.quality !== st.quality) this.r.setQuality(st.quality);
    audio.setMusicVolume(st.musicVol);
    audio.setSfxVolume(st.sfxVol);
    if (audio.enabled !== st.music) {
      audio.enabled = st.music;
      if (st.music && this.mode !== 'title') audio.mood(this.zone ? 'combat' : 'cruise'); else if (!st.music) audio.stop();
    }
    if (!st.drone && this.mode === 'drone') this.recallDrone('drone mode is switched off');
  }

  // ---------- input ----------
  // lockAt marks our own lock changes, so the pointerlockchange they cause is
  // not mistaken for the player pressing Esc (which pauses).
  lock() { if (document.pointerLockElement !== this.canvas && !this.ui.anyOpen()) { this.lockAt = performance.now(); try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* not allowed right now */ } } }
  unlock() { if (document.pointerLockElement) { this.lockAt = performance.now(); document.exitPointerLock(); } }
  bindInput() {
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (this.media.isOpen) return;
      this.keys.add(e.code);
      if (e.code === 'Tab') e.preventDefault();
      this.onKey(e);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'KeyW') this.sprintLatch = false; });
    addEventListener('blur', () => {
      this.keys.clear(); this.mouse.left = this.mouse.right = false; this.sprintLatch = false;
      if (this.settings.pauseOnBlur && this.playing() && !this.paused && !this.ui.anyOpen() && !this.media.isOpen) this.pause(true);
    });
    // mouse wheel works the throttle at the helm
    addEventListener('wheel', (e) => {
      if (document.pointerLockElement !== this.canvas || this.mode !== 'helm' || !this.settings.wheelThrottle) return;
      const sh = this.ship;
      sh.throttle = clamp(sh.throttle - Math.sign(e.deltaY) * 0.08, 0, 1);
      if (sh.auto) { sh.auto = null; this.ui.toast('Autopilot off.'); }
    }, { passive: true });
    this.canvas.addEventListener('click', () => { if (this.playing() && !this.paused) this.lock(); });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      if (e.button === 0) { this.mouse.left = true; if (this.mode === 'drone') this.dropBomb(); }
      if (e.button === 2) this.mouse.right = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.left = false; if (e.button === 2) this.mouse.right = false; });
    addEventListener('contextmenu', (e) => { if (document.pointerLockElement === this.canvas) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      if (performance.now() - (this.lockAt || 0) < 400) return;
      if (!document.pointerLockElement && this.playing() && !this.ui.anyOpen() && !this.media.isOpen && !this.paused) this.pause(true);
    });
  }
  playing() { return ['foot', 'helm', 'eva', 'drone'].includes(this.mode); }
  pause(on) {
    this.paused = on;
    if (on) { this.unlock(); this.ui.open('pause'); this.persist(); }
    else { this.ui.close('pause'); this.lock(); }
  }
  onKey(e) {
    if (this.mode === 'title' || this.mode === 'dead') return;
    if (e.code === 'Escape') { if (this.ui.anyOpen()) this.ui.closeAll(); return; }
    if (e.code === 'KeyP') { this.pause(!this.paused); return; }
    if (this.paused) return;
    if (e.code === 'KeyM') { this.ui.toggle('map'); return; }
    if (this.ui.anyOpen()) return;
    // double-tap W to jog (trackpad mode; Shift still works for everyone)
    if (e.code === 'KeyW' && !e.repeat) {
      const now = performance.now();
      if (this.settings.trackpad && now - (this.lastW || 0) < 320) this.sprintLatch = true;
      this.lastW = now;
    }
    switch (e.code) {
      case 'KeyE': this.interact(); break;
      case 'KeyL': this.courseToPump(); break;
      case 'KeyB': if (this.mode === 'drone') this.dropBomb(); break;
      case 'KeyF': this.tryDock(); break;
      case 'KeyV': this.unlock(); this.media.open(); break;
      case 'KeyG': if (this.mode === 'drone') this.recallDrone(); else this.launchDrone(); break;
      case 'KeyC': if (this.mode === 'helm') this.toggleCruise(); break;
      case 'KeyX': if (this.mode === 'helm') { this.ship.throttle = 0; this.ship.cruise = false; this.ship.auto = null; } break;
      case 'KeyT': if (this.navTarget && this.mode !== 'eva') this.setCourse(this.navTarget); break;
      case 'KeyJ': if (this.navTarget) this.warpTo(this.navTarget); break;
      case 'KeyN': audio.next(); this.ui.toast(`Now playing: ${audio.current ? audio.current.name : 'nothing'}`); break;
      case 'KeyK': this.photo(); break;
      case 'KeyI': this.unlock(); this.ui.open('storage'); break;
      case 'KeyH': this.unlock(); this.ui.open('help'); break;
      default: break;
    }
  }

  setMode(m) {
    const prev = this.mode;
    this.mode = m;
    const inside = m === 'foot' || m === 'helm' || m === 'title' || m === 'dead';
    this.interior.group.visible = inside;
    this.exterior.group.visible = !inside;
    this.r.camera.near = inside ? 0.05 : 0.3;
    this.r.camera.updateProjectionMatrix();
    if (this.droneObj) this.droneObj.group.visible = m === 'drone';
    if (m === 'helm') { this.player.lookYaw = 0; this.player.lookPitch = 0; }
    this.prevMode = prev;
  }

  // ---------- interaction ----------
  nearestInteract() {
    const p = this.player;
    let best = null, bd = Infinity;
    for (const it of this.interior.interact || []) {
      if (it.id === 'drone' && !this.settings.drone) continue;
      const dx = it.pos.x - p.x, dz = it.pos.z - p.z, dy = it.pos.y - (p.y + 1.2);
      const d = Math.hypot(dx, dz);
      if (d > (it.r || 1.3) || Math.abs(dy) > 2.2) continue;
      // must roughly face it
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      if (d > 0.5 && (dx * fx + dz * fz) / d < 0.2) continue;
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  interact() {
    if (this.mode === 'helm') { this.standUp(); return; }
    if (this.mode === 'eva') { if (this.evaNearHole()) this.reenter(); return; }
    if (this.mode !== 'foot') return;
    const it = this.nearestInteract();
    if (!it) return;
    const toast = (t) => this.ui.toast(t);
    switch (it.id) {
      case 'helm': this.setMode('helm'); audio.sfx('ui'); break;
      case 'media': case 'tv': this.unlock(); this.media.open(); break;
      case 'nav': this.ui.open('map'); break;
      case 'music': audio.next(); toast(`Now playing: ${audio.current ? audio.current.name : 'nothing'} (N skips)`); break;
      case 'breach': this.pullBreach(); break;
      case 'drone': this.launchDrone(); break;
      case 'storage': this.unlock(); this.ui.open('storage'); break;
      case 'toilet': audio.sfx('flush'); toast('Flushed. Where it goes out here is a question for the engineers.'); break;
      case 'sink': { const l = audio.loop('shower'); setTimeout(() => l && l.stop(), 1500); toast('Cold water only. It is always cold water only.'); break; }
      case 'shower': this.toggleShower(); break;
      case 'stove': audio.sfx('sizzle'); toast('One grilled cheese, slightly burnt, exactly right.'); break;
      case 'fridge': this.eatSnack(); break;
      case 'bed': this.rest(); break;
      case 'lamp': this.toggleLamp(it); break;
      case 'desk': toast(pickLine(DESK_LINES)); break;
      default: toast(it.label || 'Nothing happens.');
    }
  }
  toggleShower() {
    if (this.showerLoop) { this.showerLoop.stop(); this.showerLoop = null; this.ui.toast('Shower off.'); }
    else { this.showerLoop = audio.loop('shower'); this.ui.toast('Shower on. Mind the drain, it leads to space.'); }
  }
  eatSnack() {
    const it = this.state.items;
    if ((it.snacks || 0) > 0) {
      it.snacks--;
      this.ship.shield = Math.min(this.stat('shield'), this.ship.shield + 15);
      this.ui.toast(`Ate a snack. Shield +15. ${it.snacks} left in the fridge.`);
    } else this.ui.toast('The fridge is empty. The Bazaar general stores sell snacks.');
  }
  rest() {
    const now = performance.now();
    if (this.lastRest && now - this.lastRest < 180000) { this.ui.toast('You are not tired yet.'); return; }
    this.lastRest = now;
    const before = this.ship.hull;
    this.ship.hull = Math.min(this.stat('hull'), this.ship.hull + 15);
    this.ui.toast(before < this.ship.hull ? 'A twenty minute nap. The autopatcher sealed a few dents: hull +15.' : 'A twenty minute nap. Nothing needed patching.');
  }
  toggleLamp(it) {
    let best = null, bd = Infinity;
    for (const L of this.lights) { const d = L.l.position.distanceTo(it.pos); if (d < bd) { bd = d; best = L; } }
    if (best) { best.on = !best.on; best.l.intensity = best.on ? best.base : 0; }
    this.ui.toast(best && !best.on ? 'Lamp off.' : 'Lamp on.');
  }
  standUp() {
    this.setMode('foot');
    const sp = this.interior.spawn;
    this.player.x = sp.x; this.player.z = sp.z; this.player.y = 0; this.player.vy = 0;
    this.player.yaw = this.interior.spawnYaw || 0; this.player.pitch = 0;
    if (this.ship.auto) this.ui.toast('Autopilot has the ship. Walk around, the ship will stop when it arrives.');
  }

  // ---------- docking, stations, shops ----------
  dockable() {
    if (this.mode !== 'helm') return null;
    const sp = this.ship.vel.length();
    for (const b of this.u.ctx.bodies) {
      if (b.kind !== 'station' && b.kind !== 'module') continue;
      if (vdist(b.pos, this.ship.pos) < b.r + 900 && sp < 220) return b;
    }
    return null;
  }
  tryDock() {
    const b = this.dockable();
    if (!b) { this.ui.toast('Nothing to dock with. Fly within 900 u of a station and slow down.'); return; }
    this.ship.throttle = 0; this.ship.cruise = false; this.ship.auto = null;
    this.ship.vel.multiplyScalar(0.1);
    this.state.stats.docked++;
    this.state.lastStation = b.station ? { pos: { ...b.pos } } : { pos: { ...b.pos } };
    audio.sfx('door');
    this.unlock();
    this.ui.open('station', b.station ? { kind: 'fuel', name: b.name, station: b.station, body: b } : { kind: b.module.kind, name: b.name, module: b.module, body: b });
  }
  fuelTypesAt(body) { return body.station ? body.station.fuelTypes : body.module && body.module.fuelTypes ? body.module.fuelTypes : body.module && body.module.kind === 'hub' ? [...FUELS] : []; }
  refuel(body, amount) {
    const f = this.def.fuel, types = this.fuelTypesAt(body);
    if (!types.includes(f)) { audio.sfx('deny'); return `This pump does not serve ${f}. Your ${this.def.name} burns ${f}.`; }
    const room = this.stat('tank') - this.ship.fuel;
    const want = Math.min(room, amount ?? room);
    if (want <= 0.05) return 'Tank is already full.';
    const price = FUEL_PRICE[f];
    const afford = Math.min(want, this.state.credits / price);
    if (afford <= 0.05) { audio.sfx('deny'); return 'Not enough credits for fuel. Clear an enemy zone.'; }
    this.ship.fuel += afford;
    this.state.credits -= Math.ceil(afford * price);
    audio.sfx('fuel');
    this.persist();
    return `Pumped ${afford.toFixed(1)} ${f} for ${Math.ceil(afford * price)} cr.`;
  }
  repair() {
    const missing = this.stat('hull') - this.ship.hull;
    if (missing <= 0.5) return 'Hull is fine.';
    const cost = Math.ceil(missing * 4);
    const fix = Math.min(missing, this.state.credits / 4);
    if (fix <= 0.5) { audio.sfx('deny'); return 'Not enough credits for repairs.'; }
    this.ship.hull += fix;
    this.state.credits -= Math.ceil(fix * 4);
    audio.sfx('buy');
    this.persist();
    return fix < missing ? `Patched what you could afford (${Math.round(fix)} hull).` : `Hull patched for ${cost} cr.`;
  }
  buyShip(id) {
    const s = this.state, d = SHIPS[id];
    if (s.owned.includes(id)) return this.switchShip(id);
    if (s.credits < d.price) { audio.sfx('deny'); return `The ${d.name} costs ${d.price} cr. You have ${Math.floor(s.credits)}.`; }
    s.credits -= d.price;
    s.owned.push(id);
    s.paint[id] = s.paint[id] || (id === 'cruiser' ? 'blue' : 'yellow');
    s.fuel[id] = SHIPS[id].tank;
    s.hull[id] = SHIPS[id].hull;
    audio.sfx('buy');
    this.switchShip(id);
    return `Bought the ${d.name}. It is parked outside with a full tank.`;
  }
  switchShip(id) {
    const s = this.state;
    if (!s.owned.includes(id)) return 'You do not own that ship.';
    if (this.ship.type === id) return 'You are already flying it.';
    s.hull[this.ship.type] = this.ship.hull;
    s.fuel[this.ship.type] = this.ship.fuel;
    s.ship = id;
    this.buildShip(id);
    this.setMode('helm');
    this.persist();
    return `Switched to the ${SHIPS[id].name}.`;
  }
  repaint(p) {
    const s = this.state, id = this.ship.type;
    if (s.paint[id] === p) return 'It is already that colour.';
    if (s.credits < PAINT_PRICE) { audio.sfx('deny'); return `A repaint is ${PAINT_PRICE} cr.`; }
    s.credits -= PAINT_PRICE;
    s.paint[id] = p;
    const keep = { hull: this.ship.hull, fuel: this.ship.fuel };
    this.buildShip(id);
    Object.assign(this.ship, keep);
    this.setMode('helm');
    audio.sfx('buy');
    this.persist();
    return `Repainted: ${PAINT_NAMES[p]}.`;
  }
  buyEquip(k) {
    const s = this.state, lvl = s.equip[k], e = EQUIP[k];
    if (lvl >= e.prices.length) return `${e.name} is maxed out.`;
    const price = e.prices[lvl];
    if (s.credits < price) { audio.sfx('deny'); return `${e.name} level ${lvl + 1} costs ${price} cr.`; }
    s.credits -= price;
    s.equip[k]++;
    if (k === 'bombs') this.ship.bombs = this.stat('bombs');
    audio.sfx('buy');
    this.persist();
    return `${e.name} is now level ${s.equip[k]}.`;
  }
  buyItem(k) {
    const s = this.state, it = ITEMS[k];
    if (s.credits < it.price) { audio.sfx('deny'); return `${it.name} costs ${it.price} cr.`; }
    s.credits -= it.price;
    s.items[k] = (s.items[k] || 0) + 1;
    audio.sfx('coin');
    this.persist();
    return `Bought: ${it.name}. It is in storage.`;
  }
  useItem(k) {
    const s = this.state;
    if (!(s.items[k] > 0)) return 'You have none.';
    if (k === 'canister') {
      if (this.ship.fuel >= this.stat('tank') - 0.5) return 'Tank is full.';
      s.items[k]--; this.ship.fuel = Math.min(this.stat('tank'), this.ship.fuel + 20); audio.sfx('fuel'); return 'Emptied a canister into the tank: +20 fuel.';
    }
    if (k === 'repair') {
      if (this.ship.hull >= this.stat('hull') - 0.5) return 'Hull is fine.';
      s.items[k]--; this.ship.hull = Math.min(this.stat('hull'), this.ship.hull + 60); audio.sfx('seal'); return 'Slapped a patch on: hull +60.';
    }
    if (k === 'snacks') { this.eatSnack(); return 'Crunch.'; }
    return 'It is on the wall. It looks great.';
  }
  tow() {
    const list = this.u.stationsNear(this.ship.pos, this.def.fuel, 40).filter((x) => x.ok);
    if (!list.length) return 'No compatible station in range of the tow service.';
    const fee = Math.min(TOW_PRICE, Math.floor(this.state.credits));
    this.state.credits -= fee;
    const st = list[0].st;
    this.clearCombat();
    this.parkNear(st.pos, 1500);
    this.ship.fuel = Math.max(this.ship.fuel, 15);
    audio.sfx('warpOut');
    this.persist();
    return `Towed to ${st.name} for ${fee} cr, with 15 ${this.def.fuel} in the tank.`;
  }

  // ---------- navigation ----------
  courseToPump() {
    if (this.mode === 'eva' || this.mode === 'drone') return;
    const f = this.def.fuel;
    const hit = this.u.stationsNear(this.ship.pos, f, 60).find((x) => x.ok);
    if (!hit) { this.ui.toast(`No charted ${f} pump nearby. A universal canister works in a pinch.`); return; }
    this.setCourse(this.u.target('station', { name: hit.st.name, pos: hit.st.pos, fuelTypes: hit.st.fuelTypes }));
  }
  bookmarkKey(t) {
    const r = t.ref;
    switch (t.kind) {
      case 'galaxy': return `galaxy|${r.id}`;
      case 'system': return `system|${r.galaxy.id}|${r.id}`;
      case 'planet': return `planet|${r.sys.galaxy.id}|${r.sys.id}|${r.planet.name}`;
      case 'sight': case 'module': return `${t.kind}|${r.id}`;
      case 'station': return `station|${r.name}`;
      default: return null;
    }
  }
  isBookmarked(t) { const k = t && this.bookmarkKey(t); return !!k && this.state.bookmarks.some((b) => b.key === k); }
  toggleBookmark(t) {
    const k = this.bookmarkKey(t);
    if (!k) return 'Enemy zones re-roll every log-on, so they cannot be saved.';
    const list = this.state.bookmarks;
    const i = list.findIndex((b) => b.key === k);
    if (i >= 0) { list.splice(i, 1); this.persist(); return `Removed ${t.name} from saved places.`; }
    list.push({ key: k, name: t.name, kind: t.kind, pos: t.kind === 'station' ? { ...t.ref.pos } : null, fuelTypes: t.kind === 'station' ? t.ref.fuelTypes : null });
    this.persist();
    return `Saved ${t.name}. It is under "saved" on the map.`;
  }
  setCourse(tg) {
    if (!tg) return;
    this.navTarget = tg;
    if (this.ship.fuel <= 0) { this.ui.toast('Out of fuel. The autopilot will not start. Call a tow from the pause menu.'); return; }
    this.ship.auto = { target: tg };
    this.ui.toast(`Course set: ${tg.name}. Walk around if you like, the ship flies itself.`);
    audio.sfx('ui');
  }
  warpCost(tg) {
    const p = tg.pos(this.t);
    const d = vdist(p, this.ship.pos);
    const cost = 8 + 10 * Math.log10(1 + d / 1e5);
    const dur = clamp(6 + 11 * Math.log10(1 + d / 1e6), 6, 60);
    return { d, cost, dur };
  }
  warpTo(tg) {
    if (!tg) return;
    this.navTarget = tg;
    const sh = this.ship;
    if (sh.warp) return;
    if (this.zone) { audio.sfx('deny'); this.ui.toast('Warp is jammed inside an enemy zone. Clear it or fly out.'); return; }
    if (this.mode === 'eva' || this.mode === 'drone') { this.ui.toast('Get back aboard first.'); return; }
    if (this.breach) { this.ui.toast('Not with a hole in the hull.'); return; }
    const { d, cost, dur } = this.warpCost(tg);
    if (d < tg.arrive * 1.5) { this.ui.toast('You are already there.'); return; }
    if (sh.fuel < cost) { audio.sfx('deny'); this.ui.toast(`Warp needs ${cost.toFixed(0)} fuel, you have ${sh.fuel.toFixed(0)}.`); return; }
    const from = { ...sh.pos };
    const at = tg.pos(this.t + dur + 3);
    const dir = V1.set(at.x - from.x, at.y - from.y, at.z - from.z).normalize();
    const to = { x: at.x - dir.x * tg.arrive, y: at.y - dir.y * tg.arrive, z: at.z - dir.z * tg.arrive };
    sh.warp = { phase: 'spool', t: 0, dur, from, to, cost, target: tg, dir: dir.clone() };
    sh.auto = null; sh.cruise = false;
    audio.sfx('warpCharge');
    audio.mood('warp');
    this.ui.big('WARP SPOOLING', `${tg.name} in ${fmtTime(dur + 3)} for ${cost.toFixed(0)} ${this.def.fuel}`);
  }
  toggleCruise() {
    const sh = this.ship;
    if (sh.warp) return;
    if (this.zone) { audio.sfx('deny'); this.ui.toast('Cruise is jammed in an enemy zone.'); return; }
    if (sh.fuel <= 0) { this.ui.toast('No fuel for the cruise drive.'); return; }
    sh.cruise = !sh.cruise;
    if (sh.cruise && sh.throttle < 0.3) sh.throttle = 0.6;
    audio.sfx('ui');
  }

  // ---------- loop ----------
  loop(now) {
    requestAnimationFrame((n) => this.loop(n));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0.016;
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
    dt = Math.min(dt, 0.05);
    try {
      // tests fast-forward by running several simulation steps per frame
      const steps = this.steps || 1;
      if (!this.paused) for (let i = 0; i < steps; i++) this.update(dt);
      this.draw(dt);
    } catch (err) {
      console.error(err);
      this.paused = true;
      this.ui.crash(err);
    }
  }

  update(dt) {
    this.t += dt;
    const sh = this.ship;
    const input = this.readMouse();
    if (this.mode === 'foot') { if (!this.breach) this.updateFoot(dt, input); }
    else if (this.mode === 'helm') this.updateHelmInput(dt, input);
    else if (this.mode === 'eva') this.updateEva(dt, input);
    else if (this.mode === 'drone') this.updateDrone(dt, input);
    else if (this.mode === 'title') sh.q.multiply(qYP(dt * 0.004, 0, 0, Q1));
    this.updateShip(dt);
    const ctx = this.u.update(sh.pos, this.t, dt);
    this.collide(ctx, dt);
    this.updateZones(dt);
    this.updateCombat(dt);
    this.updateBreach(dt);
    this.updateAlert(dt);
    this.updateFx(dt);
    this.media.update(dt);
    if (this.interior.animate) this.interior.animate(dt, this.t);
    this.visit(ctx);
    this.autosave = (this.autosave || 0) + dt;
    if (this.autosave > 12 && this.mode !== 'title') { this.autosave = 0; this.persist(); }
  }

  readMouse() {
    const k = 0.0022 * this.settings.sens * (this.settings.trackpad ? 1.6 : 1);
    const out = { x: this.mouse.dx * k, y: this.mouse.dy * k * (this.settings.invert ? -1 : 1) };
    this.mouse.dx = 0; this.mouse.dy = 0;
    return out;
  }

  updateFoot(dt, m) {
    const p = this.player, keys = this.keys;
    p.yaw -= m.x;
    p.pitch = clamp(p.pitch - m.y, -1.45, 1.45);
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight') || this.sprintLatch;
    const sp = run ? 5.4 : 3.2;
    let fx = 0, fz = 0;
    if (keys.has('KeyW')) fz -= 1;
    if (keys.has('KeyS')) fz += 1;
    if (keys.has('KeyA')) fx -= 1;
    if (keys.has('KeyD')) fx += 1;
    const len = Math.hypot(fx, fz) || 1;
    const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
    const vx = ((fx * c + fz * s) / len) * sp, vz = ((-fx * s + fz * c) / len) * sp;
    const moving = fx || fz;
    p.x += (moving ? vx : 0) * dt;
    p.z += (moving ? vz : 0) * dt;
    if (moving) p.bob += dt * sp * 2.1;
    // artificial gravity and jumping
    if (keys.has('Space') && p.y <= 0.001) p.vy = 4.2;
    p.vy -= 9.8 * dt;
    p.y = Math.max(0, p.y + p.vy * dt);
    if (p.y === 0) p.vy = Math.max(p.vy, 0);
    this.collideFoot();
  }
  collideFoot() {
    const p = this.player, R = 0.3;
    for (let pass = 0; pass < 3; pass++) {
      for (const b of this.interior.colliders || []) {
        const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1);
        const dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        if (d2 > 1e-9) { const d = Math.sqrt(d2); p.x = cx + (dx / d) * R; p.z = cz + (dz / d) * R; }
        else {
          // centre inside the box: leave by the nearest face
          const opts = [[b.x0 - R - p.x, 0], [b.x1 + R - p.x, 0], [0, b.z0 - R - p.z], [0, b.z1 + R - p.z]];
          opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
          p.x += opts[0][0]; p.z += opts[0][1];
        }
      }
    }
    const bb = this.interior.bounds;
    if (bb) { p.x = clamp(p.x, bb.min.x + R, bb.max.x - R); p.z = clamp(p.z, bb.min.z + R, bb.max.z - R); }
  }

  updateHelmInput(dt, m) {
    const sh = this.ship, keys = this.keys, p = this.player;
    if (sh.warp && sh.warp.phase !== 'spool') { p.lookYaw = clamp(p.lookYaw - m.x, -2, 2); p.lookPitch = clamp(p.lookPitch - m.y, -1.2, 1.2); return; }
    const looking = this.mouse.right || keys.has('KeyQ');
    if (looking) {
      p.lookYaw = clamp(p.lookYaw - m.x, -2, 2);
      p.lookPitch = clamp(p.lookPitch - m.y, -1.2, 1.2);
    } else {
      p.lookYaw = damp(p.lookYaw, 0, 6, dt); p.lookPitch = damp(p.lookPitch, 0, 6, dt);
      const turn = this.def.turn;
      // arrow keys steer too, for trackpads and for anyone who prefers keys
      const ky = (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0);
      const kp = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
      const kx = ky * turn * dt, kyp = kp * turn * dt * (this.settings.invert ? -1 : 1);
      if ((kx || kyp) && sh.auto) { sh.auto = null; this.ui.toast('Autopilot off, you have the stick.'); }
      this.pendYaw = clamp((this.pendYaw || 0) - m.x + kx, -0.6, 0.6);
      this.pendPitch = clamp((this.pendPitch || 0) - m.y + kyp, -0.6, 0.6);
      const ay = clamp(this.pendYaw, -turn * dt, turn * dt), ap = clamp(this.pendPitch, -turn * dt, turn * dt);
      this.pendYaw -= ay; this.pendPitch -= ap;
      this.pendYaw *= Math.exp(-dt * 3); this.pendPitch *= Math.exp(-dt * 3);
      let roll = 0;
      if (keys.has('KeyA')) roll += 1;
      if (keys.has('KeyD')) roll -= 1;
      if (Math.abs(ay) + Math.abs(ap) > 0.0008 * turn || roll) {
        if (sh.auto && (Math.abs(m.x) + Math.abs(m.y) > 0.02)) { sh.auto = null; this.ui.toast('Autopilot off, you have the stick.'); }
        sh.q.multiply(qYP(ay, ap, roll * turn * 0.8 * dt, Q1)).normalize();
      }
    }
    if (keys.has('KeyW')) { sh.throttle = Math.min(1, sh.throttle + dt * 0.6); if (sh.auto) { sh.auto = null; this.ui.toast('Autopilot off.'); } }
    if (keys.has('KeyS')) { sh.throttle = Math.max(0, sh.throttle - dt * 0.8); if (sh.auto) { sh.auto = null; this.ui.toast('Autopilot off.'); } }
    sh.boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if ((this.mouse.left && !looking) || keys.has('Space')) this.fire(dt);
  }

  updateShip(dt) {
    const sh = this.ship, ctx = this.u.ctx;
    sh.fireCd -= dt;
    sh.heat = Math.max(0, sh.heat - dt * 26);
    if (sh.overheat && sh.heat < this.stat('heat') * 0.4) sh.overheat = false;
    if (performance.now() - sh.lastHit > 4000) sh.shield = Math.min(this.stat('shield'), sh.shield + this.stat('regen') * dt);
    // drone bay fabricates bombs while the drone is home
    if (this.mode !== 'drone' && sh.bombs < this.stat('bombs')) { sh.bombTimer += dt; if (sh.bombTimer > 20) { sh.bombTimer = 0; sh.bombs++; } }

    // warp
    if (sh.warp) { this.updateWarp(dt); return; }

    const fwd = V2.copy(FWD).applyQuaternion(sh.q);
    // autopilot steering
    let limit = Infinity;
    if (sh.auto) {
      const tp = sh.auto.target.pos(this.t);
      const to = V3.set(tp.x - sh.pos.x, tp.y - sh.pos.y, tp.z - sh.pos.z);
      const dist = to.length();
      if (dist < sh.auto.target.arrive * 1.05) {
        this.ui.big('ARRIVED', sh.auto.target.name);
        audio.sfx('coin');
        sh.auto = null; sh.cruise = false; sh.throttle = 0;
      } else {
        to.normalize();
        Q2.setFromUnitVectors(FWD, to);
        sh.q.rotateTowards(Q2, this.def.turn * 1.1 * dt);
        const align = fwd.dot(to);
        sh.throttle = align > 0.6 ? 1 : 0.2;
        sh.cruise = !this.zone && dist > 40000 && align > 0.9 && sh.fuel > 0;
        limit = Math.max(120, 0.35 * (dist - sh.auto.target.arrive));
      }
    }
    const limp = sh.fuel <= 0;
    if (limp) { sh.cruise = false; }
    const vmaxSub = this.stat('speed') * (sh.boost ? 1.7 : 1) * (limp ? 0.25 : 1);
    let targetSpeed;
    if (sh.cruise) {
      const cmax = this.stat('cruise') * (sh.boost ? 3 : 1);
      targetSpeed = Math.max(vmaxSub, Math.max(sh.throttle, 0.15) * Math.min(cmax, 0.1 * ctx.dnear));
      targetSpeed = Math.min(targetSpeed, limit);
      sh.cs = sh.cs < targetSpeed ? damp(sh.cs, targetSpeed, 0.9, dt) : damp(sh.cs, targetSpeed, 4, dt);
      sh.vel.copy(fwd).multiplyScalar(sh.cs);
      sh.fuel -= dt * 0.035 * (sh.boost ? 3 : 1);
    } else {
      targetSpeed = Math.min(sh.throttle * vmaxSub, limit);
      V1.copy(fwd).multiplyScalar(targetSpeed);
      if (sh.cs > vmaxSub) { sh.cs = damp(sh.cs, targetSpeed, 3, dt); V1.copy(fwd).multiplyScalar(Math.max(sh.cs, targetSpeed)); }
      else sh.cs = sh.vel.length();
      sh.vel.lerp(V1, 1 - Math.exp(-1.3 * dt));
      sh.fuel -= dt * 0.012 * sh.throttle * (sh.boost ? 2.5 : 1);
    }
    if (sh.fuel < 0) {
      sh.fuel = 0;
      if (!this.warnedEmpty) { this.warnedEmpty = true; this.ui.big('OUT OF FUEL', 'Limp mode. Dock at a compatible station, use a canister, or call a tow (pause menu).'); audio.sfx('alarm'); }
    } else if (sh.fuel > 1) this.warnedEmpty = false;
    const low = sh.fuel < this.stat('tank') * 0.2;
    if (low && sh.fuel > 0 && !this.warnedLow && this.mode !== 'title') { this.warnedLow = true; this.ui.big('LOW FUEL', `Under a fifth of the tank. L sets a course to the nearest ${this.def.fuel} pump.`); }
    if (!low) this.warnedLow = false;
    const step = sh.vel.length() * dt;
    sh.pos.x += sh.vel.x * dt; sh.pos.y += sh.vel.y * dt; sh.pos.z += sh.vel.z * dt;
    this.state.stats.distance += step;
    if (this.thruster) this.thruster.set(clamp(sh.vel.length() / Math.max(vmaxSub, 1), 0, 1));
  }

  updateWarp(dt) {
    const sh = this.ship, w = sh.warp;
    w.t += dt;
    const fx = this.r.fx;
    if (w.phase === 'spool') {
      Q2.setFromUnitVectors(FWD, w.dir);
      sh.q.rotateTowards(Q2, 1.2 * dt);
      fx.warp = clamp(w.t / 3, 0, 1) * 0.35;
      this.shake = 0.03;
      if (w.t >= 3) {
        w.phase = 'jump'; w.t = 0;
        sh.fuel -= w.cost;
        this.state.stats.warps++;
        audio.sfx('warpIn');
      }
    } else if (w.phase === 'jump') {
      sh.q.copy(Q2.setFromUnitVectors(FWD, w.dir));
      const k = smooth(clamp(w.t / w.dur, 0, 1));
      const prev = { ...sh.pos };
      sh.pos.x = w.from.x + (w.to.x - w.from.x) * k;
      sh.pos.y = w.from.y + (w.to.y - w.from.y) * k;
      sh.pos.z = w.from.z + (w.to.z - w.from.z) * k;
      this.state.stats.distance += vdist(prev, sh.pos);
      fx.warp = 1;
      this.shake = 0.012;
      if (w.t >= w.dur) { w.phase = 'exit'; w.t = 0; audio.sfx('warpOut'); }
    } else {
      fx.warp = clamp(1 - w.t / 1.2, 0, 1);
      if (w.t >= 1.2) {
        fx.warp = 0;
        sh.warp = null;
        sh.vel.set(0, 0, 0); sh.cs = 0; sh.throttle = 0;
        this.ui.big('ARRIVED', w.target.name);
        audio.mood(this.zone ? 'combat' : 'cruise');
        this.persist();
      }
    }
    sh.vel.set(0, 0, 0);
  }

  collide(ctx, dt) {
    const sh = this.ship, rad = (this.exterior && this.exterior.radius) || 20;
    for (const b of ctx.bodies) {
      if (!(b.r > 0) || b.kind === 'sight') continue;
      const dx = sh.pos.x - b.pos.x, dy = sh.pos.y - b.pos.y, dz = sh.pos.z - b.pos.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const min = b.r + rad;
      if (d >= min || d < 1e-6) continue;
      const nx = dx / d, ny = dy / d, nz = dz / d;
      sh.pos.x = b.pos.x + nx * min; sh.pos.y = b.pos.y + ny * min; sh.pos.z = b.pos.z + nz * min;
      const vn = sh.vel.x * nx + sh.vel.y * ny + sh.vel.z * nz;
      if (vn < 0) {
        sh.vel.x -= 1.6 * vn * nx; sh.vel.y -= 1.6 * vn * ny; sh.vel.z -= 1.6 * vn * nz;
        const impact = -vn;
        if (impact > 60) { this.damage(Math.min(35, impact * 0.04), 'crash'); this.ui.toast(`Bounced off ${b.name}.`); }
      }
      if (sh.cruise) { sh.cruise = false; sh.cs = 0; }
      if (sh.warp && sh.warp.phase === 'jump') { /* warp lanes pass through; nothing */ }
    }
  }

  visit(ctx) {
    if (this.tick2 = (this.tick2 || 0) + 1, this.tick2 % 20) return;
    const v = this.visitedSet || (this.visitedSet = new Set(this.state.visited));
    for (const b of ctx.bodies) {
      if (b.kind !== 'planet' && b.kind !== 'dwarf planet' && b.kind !== 'moon' && b.kind !== 'sight') continue;
      const reach = b.kind === 'sight' ? b.sight.R * 2.5 + 30000 : b.r * 5 + 3000;
      if (vdist(b.pos, this.ship.pos) < reach && !v.has(b.name)) {
        v.add(b.name);
        this.state.visited.push(b.name);
        this.ui.toast(`First visit: ${b.name}${b.planet && b.planet.real ? ' (real)' : ''}`);
      }
    }
  }

  // ---------- zones and combat ----------
  updateZones(dt) {
    const sh = this.ship;
    if (!this.zone) {
      if (sh.warp) return; // warp lanes pass over zones without dropping out
      if ((this.zoneTick = (this.zoneTick || 0) + 1) % 10) return;
      for (const z of this.u.zones) {
        if (z.state !== 'hostile') continue;
        if (vdist(z.pos, sh.pos) < z.radius) { this.enterZone(z); break; }
      }
      return;
    }
    const z = this.zone;
    if (vdist(z.pos, sh.pos) > z.radius * 1.3 && this.mode !== 'drone') {
      this.clearCombat();
      this.ui.big('YOU FLED', `${z.name} is still hostile`);
      audio.mood('cruise');
      return;
    }
    const alive = this.enemies.filter((e) => !e.dead);
    if (!alive.length) {
      z.state = 'liberated';
      this.state.liberated.push(z.id);
      const bonus = 1500 * z.tier;
      this.state.credits += bonus;
      this.state.stats.zones++;
      this.zone = null;
      this.ui.big('SECTOR LIBERATED', `${z.name} is clear for good. +${bonus} cr`);
      audio.sfx('coin');
      audio.mood('cruise');
      this.persist();
    }
  }
  enterZone(z) {
    this.zone = z;
    const sh = this.ship;
    if (sh.warp) return;
    if (sh.cruise || sh.cs > this.stat('speed') * 2) { sh.cruise = false; sh.cs = this.stat('speed'); sh.vel.setLength(Math.min(sh.vel.length(), this.stat('speed'))); }
    if (sh.auto) sh.auto = null;
    this.ui.big('ENEMY ZONE', `${z.name}: interdicted. Cruise and warp jammed. Fight or fly out.`);
    audio.sfx('alarm');
    audio.mood('combat');
    const toC = V1.set(z.pos.x - sh.pos.x, z.pos.y - sh.pos.y, z.pos.z - sh.pos.z).normalize();
    const fwd = V2.copy(FWD).applyQuaternion(sh.q);
    const dir = V3.copy(fwd).lerp(toC, 0.5).normalize();
    const base = { x: sh.pos.x + dir.x * 5200, y: sh.pos.y + dir.y * 5200, z: sh.pos.z + dir.z * 5200 };
    const caps = z.tier >= 3 ? ['dreadnought', 'carrier'] : ['dreadnought'];
    if (z.tier >= 4) caps.push('dreadnought');
    const imps = [4, 7, 8, 10][clamp(z.tier - 1, 0, 3)];
    caps.forEach((k, i) => this.spawnCapital(k, { x: base.x + (i - (caps.length - 1) / 2) * 2600, y: base.y + (i % 2 ? 600 : -300), z: base.z + i * 900 }));
    for (let i = 0; i < imps; i++) {
      const a = (i / imps) * TAU;
      this.spawnImp({ x: base.x + Math.cos(a) * 900 - dir.x * 2600, y: base.y + Math.sin(a) * 500, z: base.z + Math.sin(a) * 900 - dir.z * 2600 });
    }
  }
  spawnCapital(kind, pos) {
    const c = buildCapital(kind);
    const g = c.group;
    g.position.set(0, 0, 0); g.quaternion.identity(); g.scale.setScalar(1); g.updateMatrixWorld(true);
    const local = (o) => { const w = new THREE.Vector3(); o.getWorldPosition(w); return w; };
    const box = new THREE.Box3().setFromObject(g);
    const e = {
      kind: 'capital', sub: kind, name: kind === 'carrier' ? 'Carrier' : 'Dreadnought', obj: c, pos, q: new THREE.Quaternion(),
      hp: kind === 'carrier' ? 1900 : 1400, max: kind === 'carrier' ? 1900 : 1400, box,
      turrets: c.turrets.map((t) => ({ node: t, local: local(t), hp: 70, cd: 1 + Math.random() * 2, dead: false })),
      beamLocal: local(c.beamPort), beam: { state: 'idle', t: 0, cd: 6 + Math.random() * 5, dir: new THREE.Vector3() },
      spawnCd: 10, radius: c.radius,
    };
    const toShip = V1.set(this.ship.pos.x - pos.x, this.ship.pos.y - pos.y, this.ship.pos.z - pos.z).normalize();
    e.q.setFromUnitVectors(this.capFwd(e), toShip);
    this.fxRoot.add(g);
    e.beamMesh = new THREE.Mesh(this.beamGeo, glow(0xff4a3a));
    e.beamMesh.visible = false;
    this.fxRoot.add(e.beamMesh);
    this.enemies.push(e);
    return e;
  }
  // Capital ships point their bow along -Z unless the builder says otherwise.
  capFwd(e) { return e.fwd || (e.fwd = (() => { const b = e.beamLocal; return b && b.length() > 1 ? b.clone().setY(0).normalize() : new THREE.Vector3(0, 0, -1); })()); }
  spawnImp(pos) {
    const c = buildImp();
    this.fxRoot.add(c.group);
    const e = { kind: 'imp', name: 'Red guy', obj: c, pos, vel: new THREE.Vector3(), hp: 30, max: 30, cd: 1 + Math.random() * 2, radius: Math.max(c.radius, 4), phase: Math.random() * TAU, q: new THREE.Quaternion() };
    this.enemies.push(e);
    return e;
  }
  clearCombat() {
    for (const e of this.enemies) { this.fxRoot.remove(e.obj.group); if (e.beamMesh) this.fxRoot.remove(e.beamMesh); if (e.aimMesh) this.fxRoot.remove(e.aimMesh); }
    for (const s of this.shots) this.fxRoot.remove(s.mesh);
    this.enemies = []; this.shots = [];
    this.zone = null;
    this.r.fx.damage = 0;
  }

  fire(dt) {
    const sh = this.ship;
    if (sh.fireCd > 0 || sh.overheat || sh.warp) return;
    const guns = (this.exterior && this.exterior.guns && this.exterior.guns.length) ? this.exterior.guns : [new THREE.Vector3(0, 0, -4)];
    sh.fireCd = 0.12;
    const g = guns[sh.gunIdx++ % guns.length];
    const origin = V1.copy(g).applyQuaternion(sh.q);
    const aim = V2.copy(FWD).applyQuaternion(sh.q);
    // converge on the crosshair at 1500 u
    const conv = V3.copy(aim).multiplyScalar(1500).sub(origin).normalize();
    this.addShot({ x: sh.pos.x + origin.x, y: sh.pos.y + origin.y, z: sh.pos.z + origin.z }, conv.multiplyScalar(3200).add(sh.vel), this.stat('dmg'), 'player');
    sh.heat += 5.2;
    if (sh.heat >= this.stat('heat')) { sh.overheat = true; this.ui.toast('Lasers overheated. Let them cool.'); }
    audio.sfx('laser');
  }
  addShot(pos, vel, dmg, from) {
    const m = new THREE.Mesh(this.boltGeo, from === 'player' ? this.boltMat : this.eBoltMat);
    m.scale.set(from === 'player' ? 1 : 2.2, from === 'player' ? 1 : 2.2, from === 'player' ? 1 : 0.6);
    this.fxRoot.add(m);
    this.shots.push({ pos, vel: vel.clone ? vel.clone() : new THREE.Vector3(vel.x, vel.y, vel.z), dmg, from, life: from === 'player' ? 2.2 : 5, mesh: m });
  }
  damage(n, why) {
    const sh = this.ship;
    if (this.mode === 'dead' || sh.warp) return;
    sh.lastHit = performance.now();
    const s = Math.min(sh.shield, n);
    sh.shield -= s;
    sh.hull -= n - s;
    this.r.fx.damage = Math.min(1, this.r.fx.damage + n / 40);
    this.shake = Math.max(this.shake || 0, Math.min(0.25, n / 60));
    audio.sfx('hit');
    if (sh.hull <= 0) this.die(why);
  }
  die(why) {
    const st = this.state;
    st.stats.deaths++;
    const lost = Math.floor(st.credits * 0.1);
    st.credits -= lost;
    this.ship.hull = 0;
    if (this.mode === 'drone') this.recallDrone();
    this.setMode('dead');
    this.unlock();
    audio.sfx('bigExplosion');
    this.ui.open('dead', { why, lost });
  }
  respawn() {
    this.clearCombat();
    if (this.breach) for (const bit of this.breach.bits) this.shipRoot.remove(bit.m);
    this.breach = null;
    this.eva = null;
    if (this.wind) { this.wind.stop(); this.wind = null; }
    if (this.exterior.hole && this.exterior.hole.mesh) this.exterior.hole.mesh.visible = false;
    this.restorePanel();
    const home = this.state.lastStation && this.state.lastStation.pos ? this.state.lastStation.pos : this.u.sol.station.pos;
    this.parkNear(home, 2500);
    this.ship.hull = this.stat('hull');
    this.ship.shield = this.stat('shield');
    this.ship.fuel = Math.max(this.ship.fuel, this.stat('tank') * 0.5);
    this.r.fx.damage = 0;
    this.ui.close('dead');
    this.setMode('helm');
    this.persist();
    this.lock();
    audio.mood('cruise');
  }

  targetPoint() {
    // what enemies shoot at: the drone if it is closer, else the ship
    const sh = this.ship;
    return { x: sh.pos.x, y: sh.pos.y, z: sh.pos.z };
  }

  updateCombat(dt) {
    const sh = this.ship;
    const tp = this.targetPoint();
    const shipVel = sh.vel;
    // enemies
    for (const e of this.enemies) {
      if (e.dead) continue;
      const to = V1.set(tp.x - e.pos.x, tp.y - e.pos.y, tp.z - e.pos.z);
      const dist = to.length();
      to.normalize();
      if (e.kind === 'imp') {
        e.phase += dt * 0.8;
        const orbit = V2.set(Math.cos(e.phase), Math.sin(e.phase * 0.7) * 0.5, Math.sin(e.phase)).multiplyScalar(620);
        const goal = V3.set(tp.x + orbit.x - e.pos.x, tp.y + orbit.y - e.pos.y, tp.z + orbit.z - e.pos.z);
        const gl = goal.length();
        goal.normalize().multiplyScalar(Math.min(240, gl * 0.8)).add(V2.copy(shipVel).multiplyScalar(0.9));
        e.vel.lerp(goal, 1 - Math.exp(-1.5 * dt));
        e.pos.x += e.vel.x * dt; e.pos.y += e.vel.y * dt; e.pos.z += e.vel.z * dt;
        Q2.setFromUnitVectors(FWD, to);
        e.q.slerp(Q2, 1 - Math.exp(-4 * dt));
        e.cd -= dt;
        if (e.cd <= 0 && dist < 2600) {
          e.cd = 1.3 + Math.random() * 1.4;
          const lead = V2.set(tp.x + shipVel.x * dist / 1100 - e.pos.x, tp.y + shipVel.y * dist / 1100 - e.pos.y, tp.z + shipVel.z * dist / 1100 - e.pos.z).normalize();
          this.addShot({ ...e.pos }, lead.multiplyScalar(1100), 4, 'enemy');
          audio.sfx('laserEnemy', { vol: clamp(1 - dist / 3000, 0.1, 0.6) });
        }
      } else {
        // capital: hold 2400 u, turn slowly to face the ship
        const want = dist > 2600 ? 60 : dist < 1800 ? -30 : 0;
        e.pos.x += to.x * want * dt; e.pos.y += to.y * want * dt; e.pos.z += to.z * want * dt;
        Q2.setFromUnitVectors(this.capFwd(e), to);
        e.q.rotateTowards(Q2, 0.12 * dt);
        for (const t of e.turrets) {
          if (t.dead) continue;
          t.cd -= dt;
          if (t.cd <= 0 && dist < 6500) {
            t.cd = 1.6 + Math.random() * 1.6;
            const wp = V2.copy(t.local).applyQuaternion(e.q);
            const from = { x: e.pos.x + wp.x, y: e.pos.y + wp.y, z: e.pos.z + wp.z };
            const aim = V3.set(tp.x + shipVel.x * dist / 900 - from.x, tp.y + shipVel.y * dist / 900 - from.y, tp.z + shipVel.z * dist / 900 - from.z).normalize();
            this.addShot(from, aim.multiplyScalar(900), 6, 'enemy');
          }
        }
        this.updateBeam(e, dt, tp, dist);
        if (e.sub === 'carrier') {
          e.spawnCd -= dt;
          if (e.spawnCd <= 0 && this.enemies.filter((x) => x.kind === 'imp' && !x.dead).length < 6) {
            e.spawnCd = 12;
            this.spawnImp({ x: e.pos.x + (Math.random() - 0.5) * 400, y: e.pos.y - 200, z: e.pos.z + (Math.random() - 0.5) * 400 });
          }
        }
      }
    }
    // shots
    for (const s of this.shots) {
      if (s.dead) continue;
      s.life -= dt;
      const ox = s.pos.x, oy = s.pos.y, oz = s.pos.z;
      s.pos.x += s.vel.x * dt; s.pos.y += s.vel.y * dt; s.pos.z += s.vel.z * dt;
      if (s.life <= 0) { s.dead = true; continue; }
      if (s.from === 'player') {
        for (const e of this.enemies) {
          if (e.dead) continue;
          const hit = this.hitEnemy(e, ox, oy, oz, s.pos, s.dmg);
          if (hit) { s.dead = true; break; }
        }
      } else {
        const r = (this.exterior && this.exterior.radius) || 20;
        if (segSphere(ox, oy, oz, s.pos, tp, r + 4)) { s.dead = true; this.damage(s.dmg, 'shot'); }
        else if (this.mode === 'drone' && this.drone) {
          const dp = this.dronePos();
          if (segSphere(ox, oy, oz, s.pos, dp, 3)) { s.dead = true; this.drone.hp -= s.dmg; if (this.drone.hp <= 0) { this.boom(dp, 12); this.recallDrone('the drone was shot down'); } }
        }
      }
    }
    const keep = [];
    for (const s of this.shots) { if (s.dead) this.fxRoot.remove(s.mesh); else keep.push(s); }
    this.shots = keep;
    this.updateBombs(dt);
    this.r.fx.damage = Math.max(0, this.r.fx.damage - dt * 0.9);
  }
  updateBeam(e, dt, tp, dist) {
    const b = e.beam, sh = this.ship;
    const port = V2.copy(e.beamLocal).applyQuaternion(e.q);
    const from = { x: e.pos.x + port.x, y: e.pos.y + port.y, z: e.pos.z + port.z };
    b.from = from;
    if (b.state === 'idle') {
      b.cd -= dt;
      if (b.cd <= 0 && dist < 9000) {
        b.state = 'charge'; b.t = 0;
        b.dir.set(tp.x - from.x, tp.y - from.y, tp.z - from.z).normalize();
        audio.sfx('beamCharge');
        if (!e.aimMesh) { e.aimMesh = new THREE.Mesh(this.beamGeo, glow(0xf2a0b8)); this.fxRoot.add(e.aimMesh); }
      }
    } else if (b.state === 'charge') {
      b.t += dt;
      // tracks you a little while charging, then locks
      if (b.t < 1.3) { V3.set(tp.x - from.x, tp.y - from.y, tp.z - from.z).normalize(); b.dir.lerp(V3, 1 - Math.exp(-1.2 * dt)).normalize(); }
      if (b.t > 2.2) { b.state = 'fire'; b.t = 0; audio.sfx('beamFire'); }
    } else if (b.state === 'fire') {
      b.t += dt;
      const r = ((this.exterior && this.exterior.radius) || 20) + 45;
      const end = { x: from.x + b.dir.x * 14000, y: from.y + b.dir.y * 14000, z: from.z + b.dir.z * 14000 };
      if (segSphere(from.x, from.y, from.z, end, sh.pos, r)) this.damage(48 * dt, 'beam');
      this.shake = Math.max(this.shake || 0, 0.04);
      if (b.t > 1.5) { b.state = 'idle'; b.cd = 8 + Math.random() * 6; }
    }
  }
  // Segment test against an enemy; applies damage. Returns true on a hit.
  hitEnemy(e, ox, oy, oz, p, dmg) {
    if (e.kind === 'imp') {
      if (segSphere(ox, oy, oz, p, e.pos, e.radius + 2)) { this.hurt(e, dmg, p); return true; }
      return false;
    }
    for (const t of e.turrets) {
      if (t.dead) continue;
      const wp = V2.copy(t.local).applyQuaternion(e.q);
      const c = { x: e.pos.x + wp.x, y: e.pos.y + wp.y, z: e.pos.z + wp.z };
      if (segSphere(ox, oy, oz, p, c, 26)) {
        t.hp -= dmg;
        audio.sfx('hit', { vol: 0.3 });
        if (t.hp <= 0) { t.dead = true; t.node.visible = false; this.boom(c, 40); this.state.credits += 90; this.ui.toast('Turret down. +90 cr'); }
        return true;
      }
    }
    // hull: bounding box in the ship's local frame, slightly shrunk
    Q2.copy(e.q).invert();
    const lp = V3.set(p.x - e.pos.x, p.y - e.pos.y, p.z - e.pos.z).applyQuaternion(Q2);
    const bx = e.box;
    const sx = (bx.max.x - bx.min.x) * 0.06, sy = (bx.max.y - bx.min.y) * 0.06, sz = (bx.max.z - bx.min.z) * 0.06;
    if (lp.x > bx.min.x + sx && lp.x < bx.max.x - sx && lp.y > bx.min.y + sy && lp.y < bx.max.y - sy && lp.z > bx.min.z + sz && lp.z < bx.max.z - sz) {
      this.hurt(e, dmg * 0.6, p);
      return true;
    }
    return false;
  }
  hurt(e, dmg, p) {
    e.hp -= dmg;
    e.flash = 0.12;
    if (e.hp > 0) { if (e.kind === 'capital') this.spark(p); return; }
    e.dead = true;
    this.fxRoot.remove(e.obj.group);
    if (e.beamMesh) this.fxRoot.remove(e.beamMesh);
    if (e.aimMesh) this.fxRoot.remove(e.aimMesh);
    const st = this.state;
    st.stats.kills++;
    if (e.kind === 'capital') {
      st.stats.capitals++;
      st.credits += 1200;
      this.boom(e.pos, e.radius * 0.6, true);
      this.ui.big(`${e.name.toUpperCase()} DOWN`, '+1200 cr');
      audio.sfx('bigExplosion');
    } else {
      st.credits += 40;
      this.boom(e.pos, 14);
      audio.sfx('explosion');
      this.ui.kill('Red guy popped. +40 cr');
    }
  }
  spark(p) { this.boom(p, 8, false, 4); }
  boom(p, size, big = false, n = 10) {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(this.bombGeo, glow(big ? 0xff9a3c : 0xffd84a));
    g.add(ball);
    const ring = new THREE.Mesh(this.ringGeo, glow(0xffd84a));
    g.add(ring);
    const bits = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.debrisGeo, ink(PAL.dark));
      g.add(m);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(size * (1.5 + Math.random() * 2));
      bits.push({ m, v, p: new THREE.Vector3() });
    }
    this.fxRoot.add(g);
    this.fx.push({ g, ball, ring, bits, pos: { ...p }, size, t: 0, life: big ? 2.4 : 1.1 });
  }
  updateFx(dt) {
    const keep = [];
    for (const f of this.fx) {
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { this.fxRoot.remove(f.g); continue; }
      f.ball.scale.setScalar(f.size * (0.4 + k * 1.2) * (1 - k * 0.7));
      f.ring.scale.setScalar(f.size * (0.5 + k * 2.4));
      f.ring.rotation.x = 1.2; f.ring.rotation.y = f.t;
      for (const b of f.bits) { b.p.addScaledVector(b.v, dt); b.m.position.copy(b.p); b.m.scale.setScalar(f.size * 0.08 * (1 - k)); b.m.rotation.x += dt * 4; }
      keep.push(f);
    }
    this.fx = keep;
  }

  // Red alert: enemies close by turn the cabin lights red and sound the alarm.
  updateAlert(dt) {
    const near = this.enemies.some((e) => !e.dead && vdist(e.pos, this.ship.pos) < 12000);
    const alert = !!this.zone && near;
    if (alert !== this.alertOn) {
      this.alertOn = alert;
      this.alarmT = 0;
      if (!alert) {
        for (const L of this.lights) { L.l.color.copy(L.col); L.l.intensity = L.on ? L.base : 0; }
        this.shipHemi.color.copy(this.hemiBase.sky); this.shipHemi.groundColor.copy(this.hemiBase.ground);
      } else this.ui.toast('Red alert: enemies within 12,000 u.');
    }
    if (!alert) return;
    this.alarmT -= dt;
    if (this.alarmT <= 0) { audio.sfx('alarm', { vol: 0.55 }); this.alarmT = 6; }
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(this.t * 3.2));
    for (const L of this.lights) { L.l.color.setRGB(1, 0.12, 0.08); L.l.intensity = (L.on ? L.base : L.base * 0.5) * pulse; }
    this.shipHemi.color.setRGB(0.95 * pulse, 0.25 * pulse, 0.22 * pulse);
    this.shipHemi.groundColor.setRGB(0.4, 0.1, 0.12);
  }

  // ---------- drone ----------
  dronePos() { const d = this.drone; return { x: this.ship.pos.x + d.rel.x, y: this.ship.pos.y + d.rel.y, z: this.ship.pos.z + d.rel.z }; }
  launchDrone() {
    if (!this.settings.drone) { this.ui.toast('Drone mode is switched off in Settings.'); return; }
    if (this.mode !== 'foot' && this.mode !== 'helm') return;
    if (this.ship.warp) { this.ui.toast('Not during a warp.'); return; }
    if (this.breach) return;
    if (!this.droneObj) { this.droneObj = buildDrone(); this.fxRoot.add(this.droneObj.group); }
    const port = this.exterior.dronePort ? this.exterior.dronePort.clone() : new THREE.Vector3(0, -3, 0);
    const rel = port.applyQuaternion(this.ship.q);
    this.drone = { rel, vel: new THREE.Vector3(), yaw: 0, pitch: 0, battery: this.stat('battery'), hp: 40, returnMode: this.mode };
    this.ship.auto = null; this.ship.cruise = false; this.ship.throttle = 0;
    this.buzz = audio.loop('dronebuzz');
    this.setMode('drone');
    this.ui.big('DRONE OUT', `Left click drops a bomb (${this.ship.bombs} loaded). G brings it home.`);
  }
  recallDrone(why) {
    if (this.mode !== 'drone') return;
    if (this.buzz) { this.buzz.stop(); this.buzz = null; }
    const back = this.drone && this.drone.returnMode === 'helm' ? 'helm' : 'foot';
    this.drone = null;
    this.setMode(back);
    if (why) this.ui.toast(`Drone recalled: ${why}.`);
  }
  updateDrone(dt, m) {
    const d = this.drone, keys = this.keys;
    d.yaw -= m.x;
    d.pitch = clamp(d.pitch - m.y, -1.3, 1.3);
    const boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const sp = boost ? 260 : 120;
    const dq = Q1.copy(this.ship.q).multiply(qYP(d.yaw, d.pitch, 0, Q2));
    const want = V1.set(0, 0, 0);
    if (keys.has('KeyW')) want.z -= 1;
    if (keys.has('KeyS')) want.z += 1;
    if (keys.has('KeyA')) want.x -= 1;
    if (keys.has('KeyD')) want.x += 1;
    if (keys.has('Space')) want.y += 1;
    if (keys.has('ControlLeft') || keys.has('KeyC')) want.y -= 1;
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(sp).applyQuaternion(dq);
    d.vel.lerp(want, 1 - Math.exp(-3 * dt));
    d.rel.addScaledVector(d.vel, dt);
    const leash = d.rel.length();
    if (leash > 4000) { d.rel.setLength(4000); this.ui.toast('Drone leash: 4,000 u from the ship.'); }
    d.battery -= dt;
    if (d.battery <= 0) this.recallDrone('battery flat');
  }
  dropBomb() {
    const sh = this.ship;
    if (this.mode !== 'drone' || !this.drone) return;
    if (sh.bombs <= 0) { audio.sfx('deny'); this.ui.toast('No bombs left. The bay makes one every 20 s while the drone is home.'); return; }
    sh.bombs--;
    const d = this.drone;
    const dq = Q1.copy(sh.q).multiply(qYP(d.yaw, 0, 0, Q2));
    const down = V1.set(0, -1, 0).applyQuaternion(dq);
    const m = new THREE.Mesh(this.bombGeo, ink(PAL.dark));
    m.scale.setScalar(1.4);
    this.fxRoot.add(m);
    this.bombs.push({ pos: this.dronePos(), vel: d.vel.clone().addScaledVector(down, 30).add(sh.vel), acc: down.clone().multiplyScalar(70), life: 7, mesh: m });
    audio.sfx('bomb');
  }
  updateBombs(dt) {
    const keep = [];
    for (const b of this.bombs) {
      b.life -= dt;
      b.vel.addScaledVector(b.acc, dt);
      const ox = b.pos.x, oy = b.pos.y, oz = b.pos.z;
      b.pos.x += b.vel.x * dt; b.pos.y += b.vel.y * dt; b.pos.z += b.vel.z * dt;
      let hit = b.life <= 0;
      for (const e of this.enemies) {
        if (hit || e.dead) break;
        if (e.kind === 'imp' ? segSphere(ox, oy, oz, b.pos, e.pos, e.radius + 6) : this.insideBox(e, b.pos, 1.0)) hit = true;
      }
      if (!hit) { keep.push(b); continue; }
      this.fxRoot.remove(b.mesh);
      this.boom(b.pos, 60, true, 14);
      audio.sfx('explosion');
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (e.kind === 'imp') { if (vdist(e.pos, b.pos) < 160) this.hurt(e, 200, b.pos); continue; }
        for (const t of e.turrets) {
          if (t.dead) continue;
          const wp = V2.copy(t.local).applyQuaternion(e.q);
          const c = { x: e.pos.x + wp.x, y: e.pos.y + wp.y, z: e.pos.z + wp.z };
          if (vdist(c, b.pos) < 160) { t.hp -= 200; if (t.hp <= 0) { t.dead = true; t.node.visible = false; this.state.credits += 90; } }
        }
        if (this.insideBox(e, b.pos, 1.25)) this.hurt(e, 220, b.pos);
      }
    }
    this.bombs = keep;
  }
  insideBox(e, p, grow) {
    Q2.copy(e.q).invert();
    const lp = V3.set(p.x - e.pos.x, p.y - e.pos.y, p.z - e.pos.z).applyQuaternion(Q2);
    const b = e.box, cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2, cz = (b.min.z + b.max.z) / 2;
    return Math.abs(lp.x - cx) < ((b.max.x - b.min.x) / 2) * grow && Math.abs(lp.y - cy) < ((b.max.y - b.min.y) / 2) * grow && Math.abs(lp.z - cz) < ((b.max.z - b.min.z) / 2) * grow;
  }

  // ---------- hull breach and EVA ----------
  pullBreach() {
    if (this.ship.warp) { this.ui.toast('Not while the warp field is up.'); return; }
    if (!this.interior.breach || !this.interior.breach.panel) { this.ui.toast('This ship has no breach panel.'); return; }
    const now = performance.now();
    if (!this.breachArm || now - this.breachArm > 3000) {
      this.breachArm = now;
      this.ui.big('PULL AGAIN TO OPEN THE HULL', 'You will be pulled out through the hole. E again within 3 s.');
      audio.sfx('alarm');
      return;
    }
    this.breachArm = 0;
    const b = this.interior.breach;
    this.breach = { t: 0, vel: new THREE.Vector3(), panelVel: b.normal.clone().multiplyScalar(14), spin: new THREE.Vector3(3, 5, 2), bits: [] };
    this.ship.auto = null; this.ship.cruise = false; this.ship.throttle = 0;
    audio.sfx('breach');
    this.wind = audio.loop('wind');
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(this.debrisGeo, ink(PAL.white));
      m.scale.setScalar(0.06 + Math.random() * 0.08);
      const p = new THREE.Vector3(this.player.x + (Math.random() - 0.5) * 4, 0.3 + Math.random() * 2, this.player.z + (Math.random() - 0.5) * 4);
      m.position.copy(p);
      this.shipRoot.add(m);
      this.breach.bits.push({ m, v: new THREE.Vector3() });
    }
  }
  updateBreach(dt) {
    const B = this.breach;
    if (!B) return;
    B.t += dt;
    const b = this.interior.breach;
    const panel = b.panel;
    if (panel.visible) {
      panel.position.addScaledVector(B.panelVel, dt);
      panel.rotation.x += B.spin.x * dt; panel.rotation.y += B.spin.y * dt;
      if (B.t > 1.2) panel.visible = false;
    }
    for (const bit of B.bits) {
      const to = V1.copy(b.pos).sub(bit.m.position);
      bit.v.addScaledVector(to.normalize(), (18 + B.t * 30) * dt);
      bit.m.position.addScaledVector(bit.v, dt);
      bit.m.rotation.x += dt * 9;
    }
    if (this.mode === 'foot') {
      const p = this.player;
      // no control and no colliders while the hole drags you out in a straight line
      const to = V1.set(b.pos.x - p.x, 0, b.pos.z - p.z);
      const d = to.length();
      B.vel.addScaledVector(to.normalize(), (10 + B.t * 26) * dt);
      p.x += B.vel.x * dt; p.z += B.vel.z * dt;
      this.shake = 0.08;
      const across = (p.x - b.pos.x) * b.normal.x + (p.z - b.pos.z) * b.normal.z;
      if (d < 0.7 || across > -0.2) this.goEva();
    }
    if (this.mode === 'eva' && B.bits.length && B.t > 4) { for (const bit of B.bits) this.shipRoot.remove(bit.m); B.bits = []; }
  }
  goEva() {
    const b = this.interior.breach;
    const local = b.pos.clone().addScaledVector(b.normal, 3.5);
    local.y = 1.4;
    const rel = local.applyQuaternion(this.ship.q);
    const out = b.normal.clone().applyQuaternion(this.ship.q).multiplyScalar(7);
    const yaw = Math.atan2(-b.normal.x, -b.normal.z);
    this.eva = { rel, vel: out, yaw: yaw + Math.PI, pitch: 0, roll: 2.6, o2: 120 };
    if (this.wind) { this.wind.stop(); this.wind = null; }
    if (this.exterior.hole && this.exterior.hole.mesh) this.exterior.hole.mesh.visible = true;
    this.setMode('eva');
    this.ui.big('OUTSIDE', 'WASD + Space/Ctrl to thrust. Fly back to the hole and press E. 120 s of air.');
  }
  evaNearHole() {
    if (!this.eva || !this.exterior.hole) return false;
    const hp = this.exterior.hole.pos.clone().applyQuaternion(this.ship.q);
    return hp.distanceTo(this.eva.rel) < 8;
  }
  updateEva(dt, m) {
    const e = this.eva, keys = this.keys;
    e.yaw -= m.x;
    e.pitch = clamp(e.pitch - m.y, -1.5, 1.5);
    e.roll = damp(e.roll, 0, 0.8, dt);
    const q = Q1.copy(this.ship.q).multiply(qYP(e.yaw, e.pitch, 0, Q2));
    const want = V1.set(0, 0, 0);
    if (keys.has('KeyW')) want.z -= 1;
    if (keys.has('KeyS')) want.z += 1;
    if (keys.has('KeyA')) want.x -= 1;
    if (keys.has('KeyD')) want.x += 1;
    if (keys.has('Space')) want.y += 1;
    if (keys.has('ControlLeft') || keys.has('KeyC')) want.y -= 1;
    if (want.lengthSq()) { want.normalize().applyQuaternion(q); e.vel.addScaledVector(want, 14 * dt); }
    if (e.vel.length() > 25) e.vel.setLength(25);
    e.rel.addScaledVector(e.vel, dt);
    e.o2 -= dt;
    if (e.o2 < 30 && !e.warned) { e.warned = true; this.ui.big('LOW AIR', '30 seconds. Get back to the hole.'); audio.sfx('alarm'); }
    if (e.o2 <= 0) {
      this.r.fx.blackout = 1;
      this.reenter(true);
      this.ui.big('YOU BLACKED OUT', 'The emergency tether reeled you in. The hole is taped over.');
    }
  }
  reenter(forced = false) {
    const b = this.interior.breach;
    if (this.breach) { for (const bit of this.breach.bits) this.shipRoot.remove(bit.m); }
    this.breach = null;
    this.restorePanel();
    if (this.exterior.hole && this.exterior.hole.mesh) this.exterior.hole.mesh.visible = false;
    const inside = b.pos.clone().addScaledVector(b.normal, -1.3);
    this.player.x = inside.x; this.player.z = inside.z; this.player.y = 0; this.player.vy = 0;
    this.player.yaw = Math.atan2(b.normal.x, b.normal.z);
    this.player.pitch = 0;
    this.eva = null;
    this.setMode('foot');
    this.collideFoot();
    audio.sfx('seal');
    if (!forced) this.ui.big('BACK INSIDE', 'The hole is taped over. Tape fixes everything.');
    setTimeout(() => { this.r.fx.blackout = 0; }, forced ? 1200 : 0);
  }
  restorePanel() {
    const b = this.interior && this.interior.breach;
    if (!b || !b.panel || !this.panelHome) return;
    b.panel.position.copy(this.panelHome.pos);
    b.panel.rotation.copy(this.panelHome.rot);
    b.panel.visible = true;
  }

  // ---------- drawing ----------
  draw(dt) {
    const sh = this.ship, cam = this.r.camera, p = this.player;
    this.shipRoot.quaternion.copy(sh.q);
    this.extRoot.quaternion.copy(sh.q);
    // camera
    const shake = this.settings.shake ? (this.shake || 0) : 0;
    this.shake = Math.max(0, shake - dt * 0.5);
    if (this.mode === 'foot' || this.mode === 'title' || this.mode === 'dead') {
      const bob = this.mode === 'foot' ? Math.sin(p.bob) * 0.035 : 0;
      if (this.mode === 'foot') V1.set(p.x, p.y + 1.65 + bob, p.z);
      else V1.copy(this.interior.seat.pos);
      cam.position.copy(V1.applyQuaternion(sh.q));
      if (this.mode === 'foot') cam.quaternion.copy(sh.q).multiply(qYP(p.yaw, p.pitch, 0, Q1));
      else cam.quaternion.copy(sh.q).multiply(qYP(Math.sin(this.t * 0.1) * 0.25, -0.04, 0, Q1));
    } else if (this.mode === 'helm') {
      cam.position.copy(V1.copy(this.interior.seat.pos).applyQuaternion(sh.q));
      cam.quaternion.copy(sh.q).multiply(qYP(p.lookYaw, p.lookPitch, 0, Q1));
    } else if (this.mode === 'eva') {
      cam.position.copy(this.eva.rel);
      cam.quaternion.copy(sh.q).multiply(qYP(this.eva.yaw, this.eva.pitch, this.eva.roll * Math.sin(this.t * 3), Q1));
    } else if (this.mode === 'drone') {
      const d = this.drone;
      const bodyQ = Q2.copy(sh.q).multiply(qYP(d.yaw, 0, 0, Q1));
      cam.position.copy(d.rel).add(V1.set(0, 2.4, 7.5).applyQuaternion(bodyQ));
      cam.quaternion.copy(sh.q).multiply(qYP(d.yaw, d.pitch - 0.15, 0, Q1));
      const g = this.droneObj.group;
      g.position.copy(d.rel);
      g.quaternion.copy(bodyQ);
      g.scale.setScalar(1);
      for (const r of this.droneObj.rotors || []) r.rotation.y += dt * 40;
    }
    if (shake > 0) { cam.position.x += (Math.random() - 0.5) * shake; cam.position.y += (Math.random() - 0.5) * shake; }
    // star light from the nearest star
    const star = this.u.ctx.system || (this.u.ctx.nearest && this.u.ctx.nearest.kind === 'star' ? this.u.ctx.nearest.sys : null);
    if (star) { V1.set(star.pos.x - sh.pos.x, star.pos.y - sh.pos.y, star.pos.z - sh.pos.z).normalize(); this.sun.position.copy(V1); this.sun.intensity = 2.1; }
    else this.sun.intensity = 1.2;
    // enemies, shots, bombs, fx placed relative to the ship
    for (const e of this.enemies) {
      if (e.dead) continue;
      const g = e.obj.group;
      const s = squash(e.pos.x - sh.pos.x, e.pos.y - sh.pos.y, e.pos.z - sh.pos.z, g.position);
      g.scale.setScalar(s);
      g.quaternion.copy(e.q);
      if (e.kind === 'capital') this.drawBeam(e);
    }
    for (const s of this.shots) {
      squash(s.pos.x - sh.pos.x, s.pos.y - sh.pos.y, s.pos.z - sh.pos.z, s.mesh.position);
      V1.copy(s.vel).normalize();
      s.mesh.quaternion.setFromUnitVectors(FWD, V1);
    }
    for (const b of this.bombs) squash(b.pos.x - sh.pos.x, b.pos.y - sh.pos.y, b.pos.z - sh.pos.z, b.mesh.position);
    for (const f of this.fx) squash(f.pos.x - sh.pos.x, f.pos.y - sh.pos.y, f.pos.z - sh.pos.z, f.g.position);
    this.r.fx.flash = Math.max(0, this.r.fx.flash - dt * 2);
    if (this.r.fx.blackout > 0 && this.mode !== 'eva') this.r.fx.blackout = Math.max(0, this.r.fx.blackout - dt);
    this.drawNav();
    this.r.render(this.t);
    if (this.ui) this.ui.frame(dt);
  }
  drawBeam(e) {
    const b = e.beam, sh = this.ship;
    if (!b.from) return;
    const place = (mesh, radius, len) => {
      mesh.visible = true;
      const s = squash(b.from.x - sh.pos.x, b.from.y - sh.pos.y, b.from.z - sh.pos.z, mesh.position);
      mesh.quaternion.setFromUnitVectors(FWD, b.dir);
      mesh.scale.set(radius * s, radius * s, len * s);
    };
    if (e.aimMesh) e.aimMesh.visible = false;
    e.beamMesh.visible = false;
    if (b.state === 'charge' && e.aimMesh) place(e.aimMesh, 4 + Math.sin(this.t * 30) * 1.5, 14000);
    if (b.state === 'fire') place(e.beamMesh, 30 + Math.sin(this.t * 50) * 6, 14000);
  }
  drawNav() {
    this.navT = (this.navT || 0) + 1;
    if (this.navT % 15 || !this.navCanvas) return;
    const g = this.navCanvas.getContext('2d'), W = 512, H = 256, sh = this.ship, ctx = this.u.ctx;
    const alert = this.alertOn;
    g.fillStyle = alert ? '#f8e0dc' : '#f6f3e6'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(26,48,192,0.18)'; g.lineWidth = 1;
    for (let y = 30; y < H; y += 26) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    // radar map on the left: ship at the centre, nose up, log range
    const cx = 128, cy = 128, R = 116, range = Math.max(20000, Math.min(4e7, ctx.dnear * 6));
    const inv = Q2.copy(sh.q).invert();
    const plot = (p) => {
      V1.set(p.x - sh.pos.x, p.y - sh.pos.y, p.z - sh.pos.z).applyQuaternion(inv);
      const d = Math.hypot(V1.x, V1.z) || 1;
      const r = (R * Math.log10(1 + d / 500)) / Math.log10(1 + range / 500);
      const k = Math.min(r, R) / d;
      return [cx + V1.x * k, cy + V1.z * k, r > R];
    };
    g.strokeStyle = alert ? '#d02030' : '#1a30c0'; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    g.lineWidth = 1; g.setLineDash([3, 5]);
    for (const f of [0.33, 0.66]) { g.beginPath(); g.arc(cx, cy, R * f, 0, TAU); g.stroke(); }
    g.setLineDash([]);
    for (const b of ctx.bodies) {
      if (b.kind === 'sight') continue;
      const [x, y, edge] = plot(b.pos);
      g.fillStyle = b.kind === 'star' ? '#e0a800' : '#1a30c0';
      if (b.kind === 'station' || b.kind === 'module') g.fillRect(x - 3, y - 3, 6, 6);
      else { g.beginPath(); g.arc(x, y, edge ? 2 : b.kind === 'star' ? 5 : 3, 0, TAU); g.fill(); }
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      const [x, y] = plot(e.pos);
      g.fillStyle = '#d02030';
      g.beginPath(); g.arc(x, y, e.kind === 'capital' ? 5 : 2.5, 0, TAU); g.fill();
    }
    const tgt = sh.warp ? sh.warp.target : sh.auto ? sh.auto.target : this.navTarget;
    if (tgt) { const [x, y] = plot(tgt.pos(this.t)); g.strokeStyle = '#1a30c0'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke(); g.setLineDash([]); g.beginPath(); g.arc(x, y, 6, 0, TAU); g.stroke(); }
    g.fillStyle = '#ffd84a'; g.strokeStyle = '#1a30c0'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(cx, cy - 8); g.lineTo(cx + 6, cy + 6); g.lineTo(cx - 6, cy + 6); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#1a30c0'; g.font = '14px "Patrick Hand", cursive';
    g.fillText(`range ${fmtU(range)}`, 8, H - 6);
    // status on the right
    g.strokeStyle = 'rgba(208,32,48,0.5)'; g.beginPath(); g.moveTo(256, 0); g.lineTo(256, H); g.stroke();
    g.font = '28px "Caveat", "Patrick Hand", cursive';
    g.fillStyle = alert ? '#d02030' : '#1a30c0';
    g.fillText(alert ? 'RED ALERT' : 'NAV', 264, 28);
    g.font = '17px "Patrick Hand", cursive';
    const where = `${ctx.system ? ctx.system.name + ', ' : ''}${ctx.galaxy ? ctx.galaxy.name : 'between galaxies'}`;
    const tg = sh.warp ? sh.warp.target : sh.auto ? sh.auto.target : this.navTarget;
    const left = this.enemies.filter((e) => !e.dead).length;
    const lines = [
      where,
      `${sh.warp ? 'WARP' : sh.cruise ? 'CRUISE' : sh.auto ? 'AUTOPILOT' : 'sublight'} · ${fmtU(sh.warp ? 0 : sh.vel.length())}/s`,
      tg ? `to ${tg.name}` : 'no target (M for the map)',
      tg ? `${fmtU(vdist(tg.pos(this.t), sh.pos))} away` : '',
      `hull ${Math.round(sh.hull)} · shield ${Math.round(sh.shield)}`,
      `fuel ${sh.fuel.toFixed(0)}/${this.stat('tank')} ${this.def.fuel}`,
      this.zone ? `ENEMY ZONE · ${left} left` : 'sector quiet',
    ];
    lines.forEach((l, i) => { g.fillStyle = i === 6 && this.zone ? '#d02030' : '#1a30c0'; g.fillText(l.slice(0, 30), 264, 56 + i * 30); });
    this.navTex.needsUpdate = true;
  }
  async photo() {
    const blob = await this.r.snapshot();
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `doodle-voyager-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    this.r.fx.flash = 1;
    this.ui.toast('Photo saved to your downloads.');
  }
}

function segSphere(ox, oy, oz, p, c, r) {
  const dx = p.x - ox, dy = p.y - oy, dz = p.z - oz;
  const fx = ox - c.x, fy = oy - c.y, fz = oz - c.z;
  const a = dx * dx + dy * dy + dz * dz;
  let t = a > 0 ? -(fx * dx + fy * dy + fz * dz) / a : 0;
  t = clamp(t, 0, 1);
  const x = fx + dx * t, y = fy + dy * t, z = fz + dz * t;
  return x * x + y * y + z * z < r * r;
}

const DESK_LINES = [
  'An essay, half done: "Why the Andromeda merger is not my problem (4.5 billion years)".',
  'A calculator, a highlighter with no cap, and a very serious to-do list.',
  'Someone carved "M101 WAS HERE" into the desk.',
  'Flash cards: parsec, light year, AU. The parsec card has a coffee ring on it.',
];
function pickLine(a) { return a[Math.floor(Math.random() * a.length)]; }
