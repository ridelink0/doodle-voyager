// PS5 and Xbox controllers, through the Gamepad API's "standard" mapping, plus
// the one glyph layer the HUD hints and the tutorial prompts both read, so a
// prompt never hardcodes "press E" - it asks what interact looks like right now
// and gets a <kbd>E</kbd> or a drawn controller button back.
//
// The poller never touches the flight model. It synthesises the same keys and
// the same mouse deltas the keyboard and mouse already produce (game.keys,
// game.mouse) and calls game.onKey({ code }) for taps, so every mode guard,
// every toast and every cooldown in game.js is reused exactly as it stands.
//
// Everything here is drawn: the face buttons are a cross, a circle, a square
// and a triangle outline, the shoulders are lettered pills. No emoji, no
// photograph of anyone's hardware.
import { clamp, damp } from './util.js';

// The W3C "standard" mapping. Index 16 (the Home/PS/Xbox guide button) is
// deliberately unbound: browsers and the OS intercept it.
export const BTN = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7,
  Select: 8, Start: 9, L3: 10, R3: 11,
  DpadUp: 12, DpadDown: 13, DpadLeft: 14, DpadRight: 15, Home: 16,
};
const AX = { LX: 0, LY: 1, RX: 2, RY: 3 };
const DEADZONE = 0.14;
const CURVE_EXP = 1.6;
// Stick-to-mouse gain, in the same units as mouse movementX, so the look
// sensitivity setting governs a pad exactly as it governs a mouse.
const LOOK_GAIN = 1000;
const FIRE_AT = 0.35;      // trigger past this counts as a press
const REPEAT_FIRST = 0.34; // menu navigation: hold-to-repeat delays
const REPEAT_NEXT = 0.13;

// One line of hardware fact this cannot check for itself: the exact id string a
// real pad reports varies by OS, by USB against Bluetooth and by browser. The
// vendor id substring is the part every Chromium build includes, so that is
// what is matched first. Sony 054c, Microsoft 045e. VERIFY ON REAL HARDWARE:
// plug one in, run navigator.getGamepads()[0].id, and record it here.
export function padFamily(id) {
  const s = String(id || '').toLowerCase();
  if (s.includes('054c') || /dualsense|dualshock|playstation/.test(s)) return 'ps';
  if (s.includes('045e') || /xbox|xinput/.test(s)) return 'xbox';
  return 'generic';
}

// ---------- glyphs ----------
const svg = (vb, body) => `<svg class="padg" viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
const S = 'stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"';
const cross = () => svg('0 0 24 24', `<path d="M7 7 L17 17 M17 7 L7 17" ${S} stroke-width="2.4"/>`);
const circle = () => svg('0 0 24 24', `<circle cx="12" cy="12" r="7.5" ${S} stroke-width="2.2"/>`);
const square = () => svg('0 0 24 24', `<rect x="5" y="5" width="14" height="14" rx="1.6" ${S} stroke-width="2.2"/>`);
const triangle = () => svg('0 0 24 24', `<path d="M12 5 L20 19 L4 19 Z" ${S} stroke-width="2.2"/>`);
const letter = (t) => () => svg('0 0 24 24', `<circle cx="12" cy="12" r="9" ${S} stroke-width="1.8"/><text x="12" y="16.6" text-anchor="middle" font-size="12" fill="currentColor">${t}</text>`);
const pill = (t) => () => svg('0 0 46 20', `<rect x="1.2" y="1.2" width="43.6" height="17.6" rx="6" ${S} stroke-width="1.8"/><text x="23" y="14" text-anchor="middle" font-size="10" fill="currentColor">${t}</text>`);
const wedge = (t) => () => svg('0 0 46 22', `<path d="M3 20 L11 3 L35 3 L43 20 Z" ${S} stroke-width="1.8"/><text x="23" y="16" text-anchor="middle" font-size="10" fill="currentColor">${t}</text>`);
const dpad = (rot) => () => svg('0 0 24 24', `<g transform="rotate(${rot} 12 12)"><rect x="4" y="4" width="16" height="16" rx="3" ${S} stroke-width="1.6"/><path d="M12 16 L12 8 M8.5 11.5 L12 8 L15.5 11.5" ${S} stroke-width="1.9"/></g>`);
const stick = (t) => () => svg('0 0 24 24', `<circle cx="12" cy="12" r="8.6" ${S} stroke-width="1.7"/><circle cx="12" cy="12" r="3" ${S} stroke-width="1.6"/><text x="12" y="6.4" text-anchor="middle" font-size="7" fill="currentColor">${t}</text>`);

const SHARED = {
  DpadUp: dpad(0), DpadDown: dpad(180), DpadLeft: dpad(-90), DpadRight: dpad(90),
  LStick: stick('L'), RStick: stick('R'),
};
const XBOX = {
  ...SHARED,
  A: letter('A'), B: letter('B'), X: letter('X'), Y: letter('Y'),
  LB: pill('LB'), RB: pill('RB'), LT: wedge('LT'), RT: wedge('RT'),
  Select: pill('VIEW'), Start: pill('MENU'), L3: pill('LS'), R3: pill('RS'),
};
export const GLYPH = {
  ps: {
    ...SHARED,
    A: cross, B: circle, X: square, Y: triangle,
    LB: pill('L1'), RB: pill('R1'), LT: wedge('L2'), RT: wedge('R2'),
    Select: pill('CREATE'), Start: pill('OPTIONS'), L3: pill('L3'), R3: pill('R3'),
  },
  xbox: XBOX,
  generic: XBOX,     // letters read fine on an unbranded pad
};
const glyphCache = new Map();
export function padGlyph(family, btn) {
  const key = `${family}|${btn}`;
  if (glyphCache.has(key)) return glyphCache.get(key);
  const set = GLYPH[family] || GLYPH.generic;
  const out = set[btn] ? set[btn]() : String(btn);
  glyphCache.set(key, out);
  return out;
}

// ---------- the binding table ----------
// One row per action: the keyboard code already used in game.js, and the pad
// button per mode. This is the single place a binding is written down; the
// glyph layer and the poller both read it.
export const ACTIONS = {
  pause: { key: 'KeyP', label: 'P', pad: { foot: 'Start', helm: 'Start', eva: 'Start', drone: 'Start' } },
  map: { key: 'KeyM', label: 'M', pad: { foot: 'Select', helm: 'Select', eva: 'Select', drone: 'Select' } },
  interact: { key: 'KeyE', label: 'E', pad: { foot: 'X', helm: 'X', eva: 'A' } },
  move: { key: 'WASD', label: 'WASD', pad: { foot: 'LStick', eva: 'LStick', drone: 'LStick' } },
  look: { key: 'KeyQ', label: 'Q', pad: { helm: 'LB' } },
  steer: { key: 'mouse', label: 'mouse', pad: { helm: 'RStick', foot: 'RStick', eva: 'RStick', drone: 'RStick' } },
  jump: { key: 'Space', label: 'Space', pad: { foot: 'A' } },
  run: { key: 'ShiftLeft', label: 'Shift', pad: { foot: 'R3' } },
  carry: { key: 'KeyF', label: 'F', pad: { foot: 'B' } },
  storage: { key: 'KeyI', label: 'I', pad: { foot: 'Y' } },
  media: { key: 'KeyV', label: 'V', pad: { foot: 'RB' } },
  photo: { key: 'KeyK', label: 'K', pad: { foot: 'DpadUp' } },
  drone: { key: 'KeyG', label: 'G', pad: { foot: 'DpadDown', helm: 'DpadDown' } },
  throttle: { key: 'W', label: 'W', pad: { helm: 'RT' } },
  throttleDown: { key: 'S', label: 'S', pad: { helm: 'RT' } },
  fire: { key: 'Space', label: 'Space', pad: { helm: 'LT' } },
  boost: { key: 'ShiftLeft', label: 'Shift', pad: { helm: 'RB', drone: 'LB' } },
  rollLeft: { key: 'KeyA', label: 'A', pad: { helm: 'LStick' } },
  rollRight: { key: 'KeyD', label: 'D', pad: { helm: 'LStick' } },
  cruise: { key: 'KeyC', label: 'C', pad: { helm: 'Y' } },
  allStop: { key: 'KeyX', label: 'X', pad: { helm: 'B' } },
  dock: { key: 'KeyF', label: 'F', pad: { helm: 'A' } },
  ability: { key: 'KeyR', label: 'R', pad: { helm: 'L3' } },
  course: { key: 'KeyT', label: 'T', pad: { helm: 'DpadUp' } },
  nearestPump: { key: 'KeyL', label: 'L', pad: { helm: 'DpadLeft' } },
  warp: { key: 'KeyJ', label: 'J', pad: { helm: 'DpadRight' } },
  thrustUp: { key: 'Space', label: 'Space', pad: { eva: 'RT', drone: 'RT' } },
  thrustDown: { key: 'ControlLeft', label: 'Ctrl', pad: { eva: 'LT', drone: 'LT' } },
  bomb: { key: 'KeyB', label: 'B', pad: { drone: 'RB' } },
  recall: { key: 'KeyG', label: 'G', pad: { drone: 'B' } },
};
// Reverse lookup, so ui.js's existing hint strings - which are written in key
// labels, not action names - switch to glyphs without being rewritten.
const BY_LABEL = {};
for (const [name, a] of Object.entries(ACTIONS)) {
  const l = a.label;
  for (const mode of Object.keys(a.pad)) {
    BY_LABEL[mode] = BY_LABEL[mode] || {};
    if (!BY_LABEL[mode][l]) BY_LABEL[mode][l] = a.pad[mode];
  }
  if (!BY_LABEL.any) BY_LABEL.any = {};
  if (!BY_LABEL.any[l]) BY_LABEL.any[l] = a.pad[Object.keys(a.pad)[0]];
  void name;
}
// A couple of labels ui.js writes that are not an action on their own.
const EXTRA = { helm: { arrows: 'RStick', 'W/S': 'RT' }, foot: {}, eva: {}, drone: {} };

const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The seam. Give it a keyboard label; get back the <kbd> the player should be
// looking at right now. Keyboard unless a pad is attached AND was the last
// thing touched, so a prompt can never show a button nobody is holding.
export function kbd(game, label, mode) {
  const p = game && game.pad;
  if (p && p.active && game.lastInput === 'pad') {
    const m = mode || game.mode;
    const btn = (BY_LABEL[m] && BY_LABEL[m][label]) || (EXTRA[m] && EXTRA[m][label]) || null;
    if (btn) return `<kbd class="padkey">${padGlyph(p.family, btn)}</kbd>`;
  }
  return `<kbd>${escHtml(label)}</kbd>`;
}
// Same thing named after an action rather than a key, for new code.
export function promptFor(game, action, mode) {
  const a = ACTIONS[action];
  if (!a) return '';
  return kbd(game, a.label, mode);
}
// Is a pad the thing the player is holding right now? The one question ui.js
// asks when a hint reads "click fire" on a mouse and something else on a pad.
export function padOn(game) { return !!(game && game.pad && game.pad.active && game.lastInput === 'pad'); }

// ---------- pure input maths (no Gamepad object needed, so it unit-tests) ----------
// Radial, not per-axis: a per-axis deadzone leaves a square dead region and
// eats diagonal precision.
export function radialDeadzone(x, y, dz = DEADZONE) {
  const mag = Math.hypot(x, y);
  if (!(mag > dz)) return { x: 0, y: 0, mag: 0 };
  const scaled = Math.min(1, (mag - dz) / (1 - dz));
  return { x: (x / mag) * scaled, y: (y / mag) * scaled, mag: scaled };
}
export function curve(v, exp = CURVE_EXP) { return Math.sign(v) * Math.pow(Math.abs(v), exp); }
// Near-linear for a throttle: a proportional ramp matters more than fine
// low-end control when the question is "how fast am I going".
export function triggerCurve(v, dz = 0.05, exp = 1.15) {
  if (!(v > dz)) return 0;
  return Math.pow((v - dz) / (1 - dz), exp);
}

// ---------- rumble ----------
// Feature-detected fresh every call: an actuator reference can go stale across
// a reconnect. Firefox has no vibrationActuator at all, so this is a silent
// no-op there rather than an error.
export function rumble(pad, { duration = 140, weak = 0.35, strong = 0.5 } = {}) {
  const v = pad && pad.vibrationActuator;
  if (!v || typeof v.playEffect !== 'function') return false;
  try {
    const p = v.playEffect('dual-rumble', { startDelay: 0, duration, weakMagnitude: clamp(weak, 0, 1), strongMagnitude: clamp(strong, 0, 1) });
    if (p && p.catch) p.catch(() => {});
  } catch { return false; }
  return true;
}

const CSS = `
kbd.padkey { padding: 0 3px; vertical-align: -3px; }
svg.padg { height: 1.15em; width: auto; display: inline-block; vertical-align: -0.18em; }
svg.padg text { font-family: 'Patrick Hand', cursive; }
.padfocus { outline: 2.5px dashed var(--red); outline-offset: 3px; }
`;
function installCss() {
  if (typeof document === 'undefined' || document.getElementById('pad-css')) return;
  const s = document.createElement('style');
  s.id = 'pad-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

export class Pad {
  constructor(game) {
    this.g = game;
    this.index = null;
    this.family = 'generic';
    this.active = false;
    this.pad = null;
    this.val = new Array(17).fill(0);
    this.down = new Array(17).fill(false);
    this.was = new Array(17).fill(false);
    this.synth = new Set();
    this.want = new Set();
    this.navCd = 0;
    this.navDir = 0;
    this.lastBuzz = 0;
    this.hitSeen = 0;
    this.heatSeen = 0;
    this.killsSeen = 0;
    this.warnedUnmapped = false;
    installCss();
    if (game.settings && game.settings.rumble === undefined) game.settings.rumble = true;
    this.bind();
    this.addSetting();
  }

  bind() {
    if (typeof window === 'undefined') return;
    // Anything typed or moved on the desk puts the prompts back to keys.
    addEventListener('keydown', () => { this.g.lastInput = 'keyboard'; }, { passive: true });
    addEventListener('mousemove', () => { this.g.lastInput = 'keyboard'; }, { passive: true });
    addEventListener('mousedown', () => { this.g.lastInput = 'keyboard'; }, { passive: true });
    addEventListener('gamepadconnected', (e) => {
      const p = e.gamepad;
      if (!p) return;
      this.attach(p);
      const fam = padFamily(p.id);
      const name = fam === 'ps' ? 'A PlayStation pad' : fam === 'xbox' ? 'An Xbox controller' : String(p.id).slice(0, 40);
      if (this.g.ui) this.g.ui.toast(`${name} is connected. H shows the controls.`);
    });
    addEventListener('gamepaddisconnected', (e) => {
      if (e.gamepad && this.index != null && e.gamepad.index !== this.index) return;
      this.detach();
      if (this.g.ui) this.g.ui.toast('Controller disconnected. Keyboard and mouse still work.');
    });
    addEventListener('blur', () => this.clearSynth(), { passive: true });
  }

  // One checkbox, wired the same way every other settings checkbox is.
  addSetting() {
    if (typeof document === 'undefined') return;
    const form = document.querySelector('#settings .form');
    if (!form || document.getElementById('s2-rumble')) return;
    const label = document.createElement('label');
    label.innerHTML = '<input type="checkbox" id="s2-rumble"> controller rumble';
    form.appendChild(label);
    const box = label.querySelector('input');
    box.checked = this.g.settings.rumble !== false;
    box.addEventListener('input', () => { this.g.settings.rumble = box.checked; this.g.saveSettings(); });
  }

  attach(p) {
    this.index = p.index;
    this.family = padFamily(p.id);
    this.active = true;
    this.id = p.id;
    if (this.g.ship) { this.hitSeen = this.g.ship.lastHit; this.heatSeen = this.g.ship.heat; }
    if (this.g.state && this.g.state.stats) this.killsSeen = this.g.state.stats.kills;
    // An unmapped pad still gets polled on raw indices rather than refused,
    // but the player is told the buttons may not line up.
    if (p.mapping !== 'standard' && !this.warnedUnmapped) {
      this.warnedUnmapped = true;
      if (this.g.ui) this.g.ui.toast(`${String(p.id).slice(0, 34)} is not a recognised layout, so the buttons may not match. Standard Xbox and PlayStation pads work best.`);
    }
  }
  detach() {
    this.index = null;
    this.active = false;
    this.pad = null;
    this.clearSynth();
    this.down.fill(false);
    this.was.fill(false);
  }

  axis(i) {
    const a = this.pad && this.pad.axes;
    const v = a && a.length > i ? a[i] : 0;
    return Number.isFinite(v) ? v : 0;
  }
  hit(name) { const i = BTN[name]; return this.down[i] && !this.was[i]; }
  held(name) { return !!this.down[BTN[name]]; }
  trig(name) { return this.val[BTN[name]] || 0; }
  hold(code) { this.want.add(code); }
  tap(code) { this.g.onKey({ code }); }

  clearSynth() {
    for (const k of this.synth) this.g.keys.delete(k);
    this.synth.clear();
    this.want.clear();
  }
  commitSynth() {
    for (const k of this.synth) if (!this.want.has(k)) this.g.keys.delete(k);
    for (const k of this.want) if (!this.synth.has(k)) this.g.keys.add(k);
    const next = this.synth;
    next.clear();
    this.synth = this.want;
    this.want = next;
  }

  // Called once a frame from Game.loop, before update() drains the mouse, and
  // outside the paused guard so a pad can work the pause menu. getGamepads is
  // read fresh every call and never cached, which is also what lets a test
  // install a synthetic pad after boot.
  poll(dt) {
    const g = this.g;
    const list = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : [];
    let pad = null;
    if (this.index != null && list[this.index] && list[this.index].connected) pad = list[this.index];
    if (!pad) for (const p of list) if (p && p.connected) { pad = p; break; }
    if (!pad) { if (this.active) this.detach(); return; }
    // A pad already plugged in before the page loaded may never fire
    // gamepadconnected on some Chromium builds, so discovery happens here too.
    if (!this.active || pad.index !== this.index) this.attach(pad);
    this.pad = pad;

    let any = false;
    for (let i = 0; i < 17; i++) {
      const b = pad.buttons[i];
      const v = b ? (Number.isFinite(b.value) ? b.value : (b.pressed ? 1 : 0)) : 0;
      this.val[i] = v;
      this.down[i] = !!(b && (b.pressed || v > 0.5));
      if (this.down[i] || v > 0.12) any = true;
    }
    const l = radialDeadzone(this.axis(AX.LX), this.axis(AX.LY));
    const r = radialDeadzone(this.axis(AX.RX), this.axis(AX.RY));
    if (l.mag > 0 || r.mag > 0) any = true;
    if (any) g.lastInput = 'pad';

    // The crawl owns every input while it is on screen and does its own pad
    // skip, so nothing here fires under it.
    if (g.ui && g.ui.crawlActive) { this.clearSynth(); this.after(dt); return; }

    const surface = this.topSurface();
    if (!surface && this.marked) { this.marked.classList.remove('padfocus'); this.marked = null; this.focusEl = null; }
    if (surface) { this.clearSynth(); this.menu(surface, dt); }
    else if (g.mode === 'foot') this.foot(dt, l, r);
    else if (g.mode === 'helm') this.helm(dt, l, r);
    else if (g.mode === 'eva' || g.mode === 'drone') this.fly(dt, l, r);
    this.commitSynth();
    this.after(dt);
  }
  after(dt) {
    this.rumbleWatch(dt);
    for (let i = 0; i < 17; i++) this.was[i] = this.down[i];
  }

  // ---------- modes ----------
  lookStick(r, dt) {
    if (!(r.mag > 0)) return;
    this.g.mouse.dx += curve(r.x) * LOOK_GAIN * dt;
    this.g.mouse.dy += curve(r.y) * LOOK_GAIN * dt;
  }
  moveStick(l) {
    if (!(l.mag > 0)) return;
    const cx = curve(l.x), cy = curve(l.y);
    if (cy < -0.12) this.hold('KeyW');
    if (cy > 0.12) this.hold('KeyS');
    if (cx < -0.12) this.hold('KeyA');
    if (cx > 0.12) this.hold('KeyD');
  }
  common() {
    if (this.hit('Start')) this.tap('KeyP');
    if (this.hit('Select')) this.tap('KeyM');
  }
  foot(dt, l, r) {
    this.moveStick(l);
    this.lookStick(r, dt);
    if (this.held('A')) this.hold('Space');
    if (this.held('R3')) this.hold('ShiftLeft');
    if (this.hit('X')) this.tap('KeyE');
    if (this.hit('B')) this.tap('KeyF');
    if (this.hit('Y')) this.tap('KeyI');
    if (this.hit('RB')) this.tap('KeyV');
    if (this.hit('DpadUp')) this.tap('KeyK');
    if (this.hit('DpadDown')) this.tap('KeyG');
    this.common();
  }
  helm(dt, l, r) {
    const g = this.g, sh = g.ship;
    this.lookStick(r, dt);
    // left stick sideways is roll, through the same two keys A and D drive
    const cx = curve(l.x);
    if (cx < -0.14) this.hold('KeyA');
    if (cx > 0.14) this.hold('KeyD');
    if (this.held('LB')) this.hold('KeyQ');          // hold to look without steering
    if (this.held('RB')) this.hold('ShiftLeft');     // boost
    // RT is an absolute throttle: that is the whole point of an analog trigger,
    // so it replaces the keyboard's tap-a-quarter ramp while the pad is in hand.
    // Only while the pad IS in hand, or a plugged-in pad would hold a keyboard
    // player's throttle at zero.
    const rt = triggerCurve(this.trig('RT'));
    if (sh && !sh.warp && g.lastInput === 'pad') {
      if (rt > 0.03 && sh.auto) { sh.auto = null; g.ui.toast('Autopilot off, you have the trigger.'); }
      if (!sh.auto) sh.throttle = clamp(damp(sh.throttle, rt, 8, dt), 0, 1);
    }
    if (this.trig('LT') > FIRE_AT) this.hold('Space');
    if (this.held('L3')) this.hold('KeyR');          // the held abilities (tractor)
    if (this.hit('L3')) this.tap('KeyR');            // and the tapped ones
    if (this.hit('A')) this.tap('KeyF');
    if (this.hit('B')) this.tap('KeyX');
    if (this.hit('X')) this.tap('KeyE');
    if (this.hit('Y')) this.tap('KeyC');
    if (this.hit('DpadUp')) this.tap('KeyT');
    if (this.hit('DpadLeft')) this.tap('KeyL');
    if (this.hit('DpadRight')) this.tap('KeyJ');
    if (this.hit('DpadDown')) this.tap('KeyG');
    this.common();
  }
  fly(dt, l, r) {
    this.moveStick(l);
    this.lookStick(r, dt);
    if (this.trig('RT') > 0.3) this.hold('Space');
    if (this.trig('LT') > 0.3) this.hold('ControlLeft');
    if (this.held('LB')) this.hold('ShiftLeft');
    if (this.hit('A')) this.tap('KeyE');
    if (this.g.mode === 'drone') {
      if (this.hit('RB')) this.tap('KeyB');
      if (this.hit('B')) this.tap('KeyG');
    }
    this.common();
  }

  // ---------- menus, the map, the shops, the title screen ----------
  // Every overlay is a plain DOM panel with no keyboard navigation of its own,
  // so this is one generic focus ring for all of them rather than per-panel code.
  topSurface() {
    const g = this.g;
    if (typeof document === 'undefined') return null;
    if (g.mode === 'title') { const t = document.getElementById('title'); return t && !t.hidden ? t : null; }
    if (!g.ui) return null;
    let el = null;
    for (const name of g.ui.open_) { const e = document.getElementById(name); if (e && !e.hidden) el = e; }
    if (!el && g.paused) { const p = document.getElementById('pause'); if (p && !p.hidden) el = p; }
    return el;
  }
  focusables(el) {
    return [...el.querySelectorAll('button:not([disabled]), input, select, li[data-i]')]
      .filter((n) => !n.hidden && n.offsetParent !== null);
  }
  menu(el, dt) {
    const list = this.focusables(el);
    if (!list.length) return;
    if (this.focusEl !== el) { this.focusEl = el; this.focusI = 0; this.navCd = 0; }
    let i = list.indexOf(this.marked);
    if (i < 0) i = clamp(this.focusI || 0, 0, list.length - 1);
    const dir = (this.held('DpadDown') || curve(this.axis(AX.LY)) > 0.5 ? 1 : 0) - (this.held('DpadUp') || curve(this.axis(AX.LY)) < -0.5 ? 1 : 0);
    this.navCd -= dt;
    if (!dir) { this.navCd = 0; this.navDir = 0; }
    else if (this.navCd <= 0) {
      i = (i + dir + list.length) % list.length;
      this.navCd = this.navDir === dir ? REPEAT_NEXT : REPEAT_FIRST;
      this.navDir = dir;
    }
    const cur = list[i];
    this.focusI = i;
    if (this.marked !== cur) {
      if (this.marked) this.marked.classList.remove('padfocus');
      this.marked = cur;
      cur.classList.add('padfocus');
      if (cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
    }
    // sideways on a slider or a select nudges it instead of moving the ring
    const side = (this.hit('DpadRight') ? 1 : 0) - (this.hit('DpadLeft') ? 1 : 0);
    if (side && (cur.tagName === 'INPUT' && cur.type === 'range')) {
      const stepN = Number(cur.step) || 1;
      cur.value = String(clamp(Number(cur.value) + side * stepN, Number(cur.min), Number(cur.max)));
      cur.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (side && cur.tagName === 'SELECT') {
      cur.selectedIndex = clamp(cur.selectedIndex + side, 0, cur.options.length - 1);
      cur.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (this.hit('LB') || this.hit('RB')) {
      // shoulder buttons cycle the map's filter chips, tab-switcher style
      const chips = [...el.querySelectorAll('#m-chips button')];
      if (chips.length) {
        const on = chips.findIndex((c) => c.classList.contains('on'));
        const next = (on + (this.hit('RB') ? 1 : -1) + chips.length) % chips.length;
        chips[next].click();
      }
    }
    if (this.hit('A')) {
      if (cur.tagName === 'INPUT' && cur.type === 'checkbox') { cur.checked = !cur.checked; cur.dispatchEvent(new Event('input', { bubbles: true })); }
      else cur.click();
    }
    if (this.hit('B')) {
      const x = el.querySelector('[data-close]');
      if (x) x.click();
      else if (el.id === 'pause') this.g.pause(false);
    }
    if (this.hit('Start') && el.id === 'pause') this.g.pause(false);
  }

  // ---------- rumble, driven off state the game already keeps ----------
  buzz(duration, weak, strong) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // Faster than about 80 ms apart, some Chromium builds queue effects rather
    // than interrupting them, which feels like lag instead of a hit.
    if (now - this.lastBuzz < 80) return false;
    this.lastBuzz = now;
    return rumble(this.pad, { duration, weak, strong });
  }
  rumbleWatch() {
    const g = this.g, sh = g.ship;
    if (!this.active || !sh || g.mode === 'title' || g.settings.rumble === false) { if (sh) { this.hitSeen = sh.lastHit; this.heatSeen = sh.heat; } return; }
    if (sh.lastHit !== this.hitSeen) { this.hitSeen = sh.lastHit; this.buzz(170, 0.5, 0.85); }
    else if (sh.heat > this.heatSeen + 0.5) this.buzz(45, 0.22, 0.1);
    this.heatSeen = sh.heat;
    const kills = (g.state && g.state.stats && g.state.stats.kills) || 0;
    if (kills > this.killsSeen) { this.killsSeen = kills; this.buzz(130, 0.55, 0.3); }
  }
}
