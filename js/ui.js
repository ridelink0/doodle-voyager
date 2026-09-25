// Everything on top of the canvas: HUD, prompts, markers, the nav map,
// stations and shops, storage, settings, the start screen.
import * as THREE from 'three';
import { SHIPS } from './ships.js';
import { EQUIP, ITEMS, PAINT_NAMES, ABILITIES, CODEX } from './game.js';
import { audio } from './audio.js';
import { kbd, padOn } from './pad.js';
import { squash } from './render.js';
import { fmtU, fmtTime, fmtReal, fmtInt, vdist, clamp } from './util.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const V = new THREE.Vector3();
const OVERLAYS = ['pause', 'map', 'station', 'storage', 'settings', 'help', 'codex', 'credits', 'dead', 'crash'];
const KIND_WORD = { region: 'galaxy cluster', galaxy: 'galaxy', system: 'star system', planet: 'planet', sight: 'view site', zone: 'enemy zone', station: 'fuel station', module: 'Bazaar shop', bazaar: 'shop cluster' };
// The intro crawl: docs/STORY.md's 87 words, in five beats. hold is seconds on
// screen before the fade; the fade itself is the 0.5 s CSS opacity transition.
const CRAWL = [
  { t: 'Doodle District held. Wave after wave the red guys crawled off the page, and wave after wave they got ERASED.', hold: 4.2 },
  { t: 'So they stopped crawling. They climbed.', hold: 2.2 },
  { t: 'Past the red margin there is no paper, only sky: every real star, every charted world, ten thousand galaxies. Out here, the ink glows.', hold: 5 },
  { t: 'The Red Margin is drawing its zones across all of it. Spiral Bound Galactic is renting the planets out as billboards. The pumps never take your fuel.', hold: 5.2 },
  { t: "Fold up the Pencil Case. You're going off the page.", hold: 3 },
];

export class UI {
  constructor(game) {
    this.g = game;
    this.open_ = new Set();
    this.prev = {};
    this.msgT = 0;
    this.toasts = [];
    this.mapFilter = 'near';
    this.mapZoom = 7.3;
    this.sel = null;
    this.newArm = 0;
    this.markerEls = [];
    this.wire();
  }

  // ---------- wiring ----------
  wire() {
    const g = this.g;
    document.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-close')) { this.close(b.closest('.overlay').id); audio.sfx('ui'); }
      const o = b.getAttribute('data-open');
      if (o) { if (o !== 'settings' && o !== 'help') this.close('pause'); this.open(o); audio.sfx('ui'); }
      const a = b.getAttribute('data-act');
      if (a === 'resume') g.pause(false);
      if (a === 'logoff') { this.closeAll(); g.logOff(); }
      if (a === 'tow') { const msg = g.tow(); this.toast(msg); g.pause(false); }
      if (a === 'respawn') g.respawn();
      if (a === 'reload') location.reload();
    });
    $('t-launch').addEventListener('click', () => { audio.init(); g.launch(); });
    $('t-new').addEventListener('click', () => {
      const now = performance.now();
      if (now - this.newArm < 4000) { g.newVoyage(); this.newArm = 0; $('t-new-sub').textContent = 'fresh save started'; this.fillTitle(); return; }
      this.newArm = now;
      $('t-new-sub').textContent = 'click again to wipe the save';
    });
    // settings, bound in both places
    const s = g.settings;
    const bind = (ids, key, kind) => {
      for (const id of ids) {
        const el = $(id);
        if (!el) continue;
        if (kind === 'check') el.checked = !!s[key]; else el.value = s[key];
        el.addEventListener('input', () => {
          s[key] = kind === 'check' ? el.checked : Number(el.value);
          for (const other of ids) if (other !== id && $(other)) { if (kind === 'check') $(other).checked = s[key]; else $(other).value = s[key]; }
          if (key === 'sens') $('s-sens-o').textContent = `${Math.round(s.sens * 100)}%`;
          if (key === 'music' || key === 'musicVol') audio.init();
          g.saveSettings();
        });
      }
    };
    bind(['s-sens', 's2-sens'], 'sens', 'range');
    bind(['s-invert', 's2-invert'], 'invert', 'check');
    bind(['s-music', 's2-music'], 'music', 'check');
    bind(['s-drone', 's2-drone'], 'drone', 'check');
    bind(['s2-mv'], 'musicVol', 'range');
    bind(['s2-sv'], 'sfxVol', 'range');
    bind(['s2-boil'], 'boil', 'check');
    bind(['s2-q'], 'quality', 'range');
    bind(['s2-hints'], 'hints', 'check');
    bind(['s-track', 's2-track'], 'trackpad', 'check');
    bind(['s2-fov'], 'fov', 'range');
    bind(['s2-wheel'], 'wheelThrottle', 'check');
    bind(['s2-shake'], 'shake', 'check');
    bind(['s2-fps'], 'showFps', 'check');
    bind(['s2-blur'], 'pauseOnBlur', 'check');
    $('s-sens-o').textContent = `${Math.round(s.sens * 100)}%`;
    $('s2-fov-o').textContent = `${s.fov}°`;
    $('s2-fov').addEventListener('input', () => { $('s2-fov-o').textContent = `${s.fov}°`; });
    // map
    $('m-search').addEventListener('input', () => { if ($('m-search').value && this.mapFilter !== 'near' && this.mapFilter !== 'galaxies' && this.mapFilter !== 'sights') this.setFilter('near'); this.renderList(); });
    // The codex chip sits with the map filters but opens its own screen: lore
    // entries have no position to plot.
    $('m-chips').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.f === 'codex') { this.open('codex'); audio.sfx('ui'); return; }
      this.setFilter(b.dataset.f);
    });
    $('m-zoom').value = this.mapZoom;
    $('m-zoom').addEventListener('input', () => { this.mapZoom = Number($('m-zoom').value); this.drawMap(); });
    $('m-canvas').addEventListener('click', (e) => this.mapClick(e));
    $('m-canvas').addEventListener('wheel', (e) => { e.preventDefault(); this.mapZoom = clamp(this.mapZoom + Math.sign(e.deltaY) * 0.15, 3, 10.8); $('m-zoom').value = this.mapZoom; this.drawMap(); }, { passive: false });
    $('m-list').addEventListener('click', (e) => { const li = e.target.closest('li'); if (li && this.listItems) this.select(this.listItems[Number(li.dataset.i)]); });
    $('he-body').innerHTML = document.querySelector('#title .cols').outerHTML;
  }

  // ---------- overlays ----------
  anyOpen() { return this.open_.size > 0; }
  open(name, data) {
    const el = $(name);
    if (!el) return;
    el.hidden = false;
    this.open_.add(name);
    this.g.unlock();
    if (name === 'map') { this.renderList(); this.drawMap(); this.renderSel(); setTimeout(() => $('m-search').focus(), 30); }
    if (name === 'station') this.renderStation(data || this.stationData);
    if (name === 'storage') this.renderStorage();
    if (name === 'codex') this.renderCodex();
    if (name === 'pause') this.renderPause();
    if (name === 'dead') $('d-why').textContent = `${data && data.why === 'beam' ? 'A capital ship beam' : data && data.why === 'crash' ? 'That landing' : 'Enemy fire'} tore the hull open. You lost ${fmtInt(data ? data.lost : 0)} cr. A tug drags what is left to the last pump you docked at.`;
  }
  close(name) {
    const el = $(name);
    if (!el) return;
    el.hidden = true;
    this.open_.delete(name);
    if (name === 'station') this.stationData = null;
    if (name === 'pause') this.g.paused = false;
    if (!this.anyOpen() && this.g.playing() && !this.g.paused) this.g.lock();
  }
  closeAll() { for (const n of [...this.open_]) if (n !== 'dead' && n !== 'crash') this.close(n); }
  toggle(name) { if (this.open_.has(name)) this.close(name); else this.open(name); }
  crash(err) { $('c-err').textContent = String(err && err.stack ? err.stack : err).slice(0, 1500); this.open('crash'); }

  // ---------- title ----------
  showTitle() {
    $('title').hidden = false;
    $('hud').hidden = true;
    this.fillTitle();
  }
  hideTitle() { $('title').hidden = true; $('hud').hidden = false; }
  fillTitle() {
    const g = this.g, st = g.state, u = g.u;
    const launch = $('t-launch');
    launch.disabled = !g.ready;
    $('t-launch-sub').textContent = g.save ? `solo · picks up where you parked the ${SHIPS[st.ship].name}` : 'solo · starts at the Sol Pumps, Earth orbit';
    const s = st.stats;
    const hh = g.sessionStart.toTimeString().slice(0, 5);
    const hostile = u.zones.filter((z) => z.state === 'hostile').length;
    $('t-stats').innerHTML = [
      [fmtInt(st.credits), 'credits'], [st.liberated.length, 'sectors liberated'], [s.kills, `red guys and ships popped (${s.capitals} capitals)`],
      [fmtU(s.distance), 'flown'], [s.warps, 'warps'], [st.visited.length, 'places visited'],
    ].map(([n, l]) => `<span><b>${esc(n)}</b> ${esc(l)}</span>`).join('') + `<span>this log-on rolled <b>${hostile}</b> enemy zones at ${hh}</span>`;
    $('t-counts').textContent = `Charted: ${fmtInt(u.counts.galaxies)} galaxies, ${fmtInt(u.counts.hosts)} stars with ${fmtInt(u.counts.planets)} confirmed exoplanets, ${fmtInt(u.counts.stars || 0)} more real stars, ${u.counts.sights} view sites, and the whole Solar System. Past the catalogues the sky is seeded, so it never runs out.`;
  }

  // ---------- per-frame ----------
  frame(dt) {
    const g = this.g;
    if (!g.ready) return;
    // big message timer
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) { $('h-msg').className = 'message off'; } }
    // toasts
    const now = performance.now();
    for (const t of this.toasts) if (!t.fading && now - t.at > 4200) { t.fading = true; t.el.classList.add('fade'); setTimeout(() => t.el.remove(), 700); }
    this.toasts = this.toasts.filter((t) => now - t.at < 5200);
    if (g.mode === 'title' || $('hud').hidden) return;
    this.acc = (this.acc || 0) + dt;
    this.markers();
    if (this.acc < 0.1) return;
    this.acc = 0;
    this.hud();
    if (this.open_.has('map')) this.drawMap();
    if (this.open_.has('station')) { const c = $('st-cr'); if (c) c.textContent = fmtInt(g.state.credits); }
  }
  set(id, v, prop = 'textContent') {
    if (this.prev[id] === v) return;
    this.prev[id] = v;
    const el = $(id);
    if (el) el[prop] = v;
  }
  hud() {
    const g = this.g, sh = g.ship, ctx = g.u.ctx, d = g.def;
    const bar = (id, v, max, label) => {
      const pct = clamp(max > 0 ? v / max : 0, 0, 1);
      const el = $(id);
      if (el && el.style.width !== `${(pct * 100).toFixed(1)}%`) el.style.width = `${(pct * 100).toFixed(1)}%`;
      this.set(`${id}-n`, label ?? `${Math.round(v)}`);
      const parent = el && el.parentElement;
      if (parent) parent.classList.toggle('low', pct < 0.2);
    };
    this.set('h-ship', `${d.name} · ${d.cls}`);
    bar('h-hull', sh.hull, g.stat('hull'));
    bar('h-shield', sh.shield, g.stat('shield'));
    bar('h-fuel', sh.fuel, g.stat('tank'), `${sh.fuel.toFixed(0)} / ${g.stat('tank')}`);
    this.set('h-fuel-t', d.fuel);
    bar('h-heat', sh.heat, g.stat('heat'), sh.overheat ? 'HOT' : '');
    // Air is only shown when it is a problem: a sealed hull never mentions it.
    const airRow = document.getElementById('h-air-row');
    if (airRow) {
      const show = sh.air < 99.5;
      airRow.hidden = !show;
      if (show) bar('h-air', sh.air, 100, sh.air < 25 ? 'LOW' : '');
    }
    this.set('h-cr', fmtInt(g.state.credits));
    const where = `${ctx.system && g.u.ctx.systemDist < 3e6 ? ctx.system.name + ' · ' : ''}${ctx.galaxy ? ctx.galaxy.name : 'between galaxies'}`;
    this.set('h-where', where + (ctx.nearest && ctx.nearest.kind !== 'galaxy' ? ` · near ${ctx.nearest.name}` : ''));
    const alive = g.enemies.filter((e) => !e.dead).length;
    const zoneTxt = g.zone ? `ENEMY ZONE · ${alive} left` : ctx.system && g.state.liberated.includes(`${ctx.system.galaxy.id}|${ctx.system.id}`) ? 'liberated sector' : '';
    this.set('h-zone', zoneTxt);
    $('h-zone').classList.toggle('hot', !!g.zone);
    const modeName = { foot: 'ON FOOT', helm: 'AT THE HELM', eva: 'OUTSIDE', drone: 'DRONE', dead: 'LOST', title: '' }[g.mode];
    this.set('h-mode', modeName);
    this.set('h-keys', g.settings.hints ? this.keysFor(g.mode) : '', 'innerHTML');
    const sp = sh.warp ? 0 : sh.vel.length();
    this.set('h-speed', sh.warp ? 'WARP' : fmtInt(sp));
    const thr = $('h-thr');
    const tw = `${Math.round(sh.throttle * 100)}%`;
    if (thr.style.width !== tw) thr.style.width = tw;
    const flags = [];
    if (sh.warp) flags.push(`<span class="hi">WARP ${sh.warp.phase === 'spool' ? 'spooling' : fmtTime(sh.warp.dur - sh.warp.t)}</span>`);
    if (sh.cruise) flags.push('<span class="hi">CRUISE</span>');
    if (sh.auto) flags.push('<span>AUTOPILOT</span>');
    if (sh.boost && g.mode === 'helm') flags.push('<span>BOOST</span>');
    if (sh.fuel <= 0) flags.push('<span class="red">LIMP</span>');
    if (sh.overheat) flags.push('<span class="red">OVERHEAT</span>');
    if (g.zone) flags.push('<span class="red">JAMMED</span>');
    if (sh.burnT > 0) flags.push('<span class="hi">BURN</span>');
    if (sh.ramT > 0) flags.push('<span class="hi">RAM</span>');
    if (sh.tractor) flags.push('<span class="hi">TRACTOR</span>');
    if (sh.cloak && sh.cloak.active) flags.push('<span class="hi">CLOAKED</span>');
    if (g.scooping) flags.push('<span class="hi">SCOOPING</span>');
    // You, as opposed to the hull: only on screen once something has hit you.
    const you = g.board.you;
    if (you.hp < you.max) flags.push(`<span class="${you.hp < 40 ? 'red' : ''}">SUIT ${Math.round(you.hp)}</span>`);
    if (g.settings.showFps) flags.push(`<span>${Math.round(g.fps)} fps</span>`);
    this.set('h-flags', flags.join(''), 'innerHTML');
    // What R does on this hull, and whether it will do it right now.
    const ab = ABILITIES[d.ability];
    let abTxt = '';
    if (ab && (g.mode === 'helm' || g.mode === 'foot')) {
      let state;
      if (ab.passive) state = sh.scoopOn ? (g.scooping ? 'scooping' : 'intake open') : 'intake shut';
      else if (d.ability === 'cloak' && sh.cloak && sh.cloak.active) state = 'running';
      else if (d.ability === 'tractor' && sh.tractor) state = 'holding';
      else if (sh.abilityCd > 0) state = `${sh.abilityCd.toFixed(1)} s`;
      else if (!g.abilityReady()) state = 'no fuel';
      else state = 'ready';
      abTxt = `${kbd(g, 'R', 'helm')} ${esc(ab.name)} · <span class="${state === 'ready' || state === 'running' || state === 'holding' || state === 'scooping' ? 'hi' : ''}">${state}</span>`;
    }
    this.set('h-ability', abTxt, 'innerHTML');
    const tg = sh.warp ? sh.warp.target : sh.auto ? sh.auto.target : g.navTarget;
    let ttxt = '';
    if (tg) {
      const dist = vdist(tg.pos(g.t), sh.pos);
      const eta = sh.warp ? sh.warp.dur - sh.warp.t : sp > 1 ? dist / sp : Infinity;
      ttxt = `${tg.name} · ${fmtU(dist)} · ${sh.warp ? `${fmtTime(eta)} left` : `about ${fmtTime(this.cruiseEta(dist))} by cruise`}`;
    }
    this.set('h-target', ttxt);
    // The sidearm is in your hands on foot and in the suit too (js/board.js),
    // so the crosshair is up wherever you can shoot something.
    $('h-cross').hidden = !(g.mode === 'helm' || g.mode === 'drone' || g.mode === 'foot' || g.mode === 'eva');
    $('h-cross').classList.toggle('hot', !!g.zone);
    // prompt
    let pr = '';
    if (g.mode === 'foot') {
      const it = g.nearestInteract();
      if (it) pr = `${kbd(g, 'E', 'foot')} ${esc(it.label || it.id)}`;
    } else if (g.mode === 'helm') {
      const b = g.dockable();
      if (b) pr = `${kbd(g, 'F', 'helm')} dock at ${esc(b.name)}`;
    } else if (g.mode === 'eva') {
      // boarding and the remote recall first (js/board.js), the hole after
      const bp = g.board.prompt();
      if (bp) pr = esc(bp);
      else if (g.evaNearHole()) pr = `${kbd(g, 'E', 'eva')} climb back in`;
    }
    this.set('h-prompt', pr, 'innerHTML');
    this.bossBar();
    // kill feed stays short
  }
  // The boss bar. Only on screen while one of the Red Margin's own is alive,
  // and it reads out whatever move that boss has just telegraphed (js/bosses.js).
  bossBar() {
    const el = $('boss-hp');
    if (!el) return;
    const b = this.g.bosses && this.g.bosses.current();
    if (!b) { if (!el.hidden) el.hidden = true; return; }
    if (el.hidden) el.hidden = false;
    this.set('boss-name', b.name.toUpperCase());
    this.set('boss-tell', b.tell ? `${b.name} ${b.tell}` : `phase ${b.phase + 1} of ${b.movesAll.length}`);
    const f = $('boss-fill');
    const w = `${(clamp(b.hp / Math.max(1, b.max), 0, 1) * 100).toFixed(1)}%`;
    if (f && f.style.width !== w) f.style.width = w;
  }
  keysFor(m) {
    const g = this.g, sh = g.ship;
    // One helper, and the whole hint line switches to controller glyphs the
    // moment a pad is the thing in the player's hands (js/pad.js).
    const k = (s) => kbd(g, s, m);
    const pad = padOn(g);
    if (m === 'foot') return `${k('WASD')} walk · ${k('E')} use · click ${g.carried ? 'throws' : 'shoots'} · ${k('V')} tapes · ${k('M')} map · ${k('I')} storage${g.settings.drone ? ` · ${k('G')} drone` : ''} · ${k('P')} pause`;
    if (m === 'helm') {
      const ab = ABILITIES[g.def.ability];
      const steer = pad ? `${k('mouse')} steer` : 'mouse or arrows steer';
      const fire = pad ? `${k('Space')} fire · hold ${k('Q')} look` : g.settings.trackpad ? `${k('Space')} fire · hold ${k('Q')} look` : 'click fire';
      return `${steer} · ${k('W')}/${k('S')} throttle · ${fire} · ${k('C')} cruise · ${k('T')} autopilot · ${k('J')} warp · ${k('L')} nearest pump · ${k('F')} dock or eject${ab ? ` · ${ab.hold ? 'hold ' : ''}${k('R')} ${ab.name.toLowerCase()}` : ''} · ${k('E')} stand up`;
    }
    if (m === 'eva') return `${k('WASD')} ${k('Space')} ${k('Ctrl')} jetpack · click shoots · ${k('E')} boards or climbs in · ${k('F')} calls a hull you own · air ${Math.max(0, Math.round(g.eva ? g.eva.o2 : 0))} s · suit ${Math.round(g.board.you.hp)}`;
    if (m === 'drone') return `${k('WASD')} fly · ${k('Space')}/${k('Ctrl')} up/down · click or ${k('B')} bomb (${sh.bombs}) · ${k('G')} recall · battery ${Math.round(g.drone ? g.drone.battery : 0)} s`;
    return '';
  }
  markers() {
    const g = this.g, cam = g.r.camera, sh = g.ship;
    const want = [];
    const tg = sh.auto ? sh.auto.target : g.navTarget;
    if (tg && !sh.warp) want.push({ p: tg.pos(g.t), cls: 'target', label: tg.name });
    for (const e of g.enemies) if (!e.dead) want.push({ p: e.pos, cls: `enemy${e.kind === 'capital' ? ' big' : ''}`, label: e.kind === 'capital' ? e.name : '', hp: e.hp / e.max });
    const layer = $('markers');
    while (this.markerEls.length < want.length) { const d = document.createElement('div'); layer.appendChild(d); this.markerEls.push(d); }
    const W = innerWidth, H = innerHeight;
    this.markerEls.forEach((el, i) => {
      const m = want[i];
      if (!m || g.mode === 'foot' && !g.zone && !(g.bosses && g.bosses.active)) { el.style.display = 'none'; return; }
      squash(m.p.x - sh.pos.x, m.p.y - sh.pos.y, m.p.z - sh.pos.z, V);
      const camSpace = V.clone().applyMatrix4(cam.matrixWorldInverse);
      V.project(cam);
      let x = (V.x * 0.5 + 0.5) * W, y = (-V.y * 0.5 + 0.5) * H;
      let edge = false;
      if (camSpace.z > 0 || x < 20 || x > W - 20 || y < 20 || y > H - 20) {
        edge = true;
        let dx = camSpace.x, dy = -camSpace.y;
        if (camSpace.z > 0) { dx = -dx; dy = -dy; }
        const a = Math.atan2(dy, dx);
        const r = Math.min(W, H) * 0.44;
        x = W / 2 + Math.cos(a) * r; y = H / 2 + Math.sin(a) * r;
        el.style.setProperty('--a', `${(a * 180) / Math.PI + 90}deg`);
      }
      el.style.display = '';
      el.className = `mk ${m.cls}${edge ? ' edge' : ''}`;
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      const html = `${m.label ? esc(m.label) : ''}${m.hp != null && m.label ? `<span class="hp" style="width:${Math.round(m.hp * 44)}px"></span>` : ''}`;
      if (el.__h !== html) { el.innerHTML = html; el.__h = html; }
    });
  }

  // ---------- messages ----------
  toast(text) {
    const li = document.createElement('li');
    li.textContent = text;
    const ul = $('h-toasts');
    ul.appendChild(li);
    const wrap = document.createElement('br');
    ul.appendChild(wrap);
    this.toasts.push({ el: li, at: performance.now() });
    setTimeout(() => wrap.remove(), 5200);
    while (ul.children.length > 12) ul.firstChild.remove();
  }
  kill(text) {
    const ul = $('h-kills');
    const li = document.createElement('li');
    li.textContent = text;
    ul.prepend(li);
    while (ul.children.length > 4) ul.lastChild.remove();
    setTimeout(() => li.remove(), 6000);
  }
  big(h, p = '') {
    const m = $('h-msg');
    m.querySelector('h3').textContent = h;
    m.querySelector('p').textContent = p;
    m.className = 'message';
    void m.offsetWidth;
    m.className = 'message on';
    this.msgT = 3.2;
  }

  // ---------- intro crawl ----------
  // Plays at the start of every new game, never on continue (game.js owns the
  // freshStart flag). Any key, any click or any gamepad button ends it, and it
  // is driven by a beat index and a timer rather than a keyframe animation so
  // the skip can never leave it half-faded.
  playCrawl(onDone) {
    const el = $('crawl'), txt = $('crawl-text');
    if (!el || !txt) { onDone(); return; }          // markup missing: never swallow the launch
    this.skipCrawl();                                // never two crawls at once
    el.hidden = false;
    txt.textContent = '';
    txt.style.opacity = 0;
    this.g.unlock();
    this.crawlActive = true;
    let i = -1, timer = null, fade = null, raf = 0, base = null, done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.crawlActive = false;
      this._crawlSkip = null;
      clearTimeout(timer); clearTimeout(fade);
      cancelAnimationFrame(raf);
      el.hidden = true;
      removeEventListener('keydown', finish);
      removeEventListener('pointerdown', finish);
      onDone();
    };
    const next = () => {
      i++;
      if (i >= CRAWL.length) { finish(); return; }
      txt.textContent = CRAWL[i].t;
      raf = requestAnimationFrame(() => { txt.style.opacity = 1; });
      timer = setTimeout(() => { txt.style.opacity = 0; fade = setTimeout(next, 500); }, CRAWL[i].hold * 1000);
    };
    // Any gamepad button, edge-triggered off whatever was already held when
    // the crawl opened, so a stuck trigger cannot skip it instantly.
    const pads = () => {
      if (done) return;
      const gp = navigator.getGamepads ? navigator.getGamepads()[0] : null;
      if (gp) {
        const now = gp.buttons.map((b) => !!(b && b.pressed));
        if (!base) base = now;
        else if (now.some((p, n) => p && !base[n])) { finish(); return; }
      }
      requestAnimationFrame(pads);
    };
    // Bubble phase, and registered after game.js's own keydown listener, so the
    // game sees the skip key first and ignores it (crawlActive is still true).
    addEventListener('keydown', finish);
    addEventListener('pointerdown', finish);
    this._crawlSkip = finish;
    requestAnimationFrame(pads);
    next();
  }
  skipCrawl() { if (this._crawlSkip) this._crawlSkip(); }

  // ---------- codex ----------
  renderCodex() {
    const st = this.g.state, body = $('cx-body'), n = $('cx-n');
    if (!body) return;
    if (n) n.textContent = String(st.codex.length);
    body.innerHTML = Object.entries(CODEX).sort((a, b) => a[1].n - b[1].n).map(([id, e]) => {
      const has = st.codex.includes(id);
      return `<div class="card ${has ? 'on' : 'locked'}"><h4>${e.n}. ${has ? esc(e.title) : '???'}</h4><p>${has ? esc(e.text) : 'Not found yet.'}</p></div>`;
    }).join('');
  }

  // ---------- pause, storage ----------
  renderPause() {
    const g = this.g, u = g.u;
    $('p-tow').textContent = `${Math.min(400, Math.floor(g.state.credits))} cr, to the nearest ${g.def.fuel} pump`;
    const hostile = u.zones.filter((z) => z.state === 'hostile').length;
    $('p-note').textContent = `This log-on rolled ${u.zones.length} enemy zones at ${g.sessionStart.toTimeString().slice(0, 5)}; ${hostile} still hostile. Liberated sectors stay liberated. Saved.`;
  }
  renderStorage(msg) {
    const g = this.g, st = g.state, sh = g.ship;
    const items = Object.entries(ITEMS).map(([k, it]) => `<div class="card"><h4>${esc(it.name)} × ${st.items[k] || 0}</h4><p>${esc(it.desc)}</p><div class="row"><button class="buy" data-use="${k}" ${st.items[k] > 0 ? '' : 'disabled'}>use one</button></div></div>`).join('');
    const eq = Object.entries(EQUIP).map(([k, e]) => `<span>${esc(e.name)}: level ${st.equip[k]} of 3</span>`).join(' · ');
    const ships = st.owned.map((id) => `${esc(SHIPS[id].name)}${id === sh.type ? ' (flying)' : ''}`).join(', ');
    $('sg-body').innerHTML = `<div class="stbody">${items}</div>
      <p class="fine">Bombs loaded: ${sh.bombs} of ${g.stat('bombs')} · Fitted: ${eq}</p>
      <p class="fine">Ships in your name: ${ships}. Places visited: ${st.visited.length}.</p>`;
    $('sg-body').querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () => { $('sg-msg').textContent = g.useItem(b.dataset.use); this.renderStorage(); }));
    if (msg) $('sg-msg').textContent = msg;
  }

  // ---------- stations and shops ----------
  renderStation(data) {
    if (!data) return;
    this.stationData = data;
    const g = this.g, st = g.state, sh = g.ship, d = g.def;
    $('st-h').textContent = data.name.toUpperCase();
    $('st-cr').textContent = fmtInt(st.credits);
    const say = (m) => { $('st-msg').textContent = m; this.renderStation(this.stationData); $('st-msg').textContent = m; };
    const body = $('st-body');
    const cards = [];
    const types = g.fuelTypesAt(data.body);
    if (types.length) {
      const ok = types.includes(d.fuel);
      const tags = types.map((t) => `<span class="fueltag ${t === d.fuel ? 'yes' : ''}">${t}</span>`).join('');
      let extra = '';
      if (!ok) {
        const alt = g.u.stationsNear(sh.pos, d.fuel, 30).find((x) => x.ok);
        extra = alt ? `<p>Nearest pump that serves ${d.fuel}: <b>${esc(alt.st.name)}</b>, ${fmtU(alt.d)} away.</p><div class="row"><button class="buy" data-go="alt">set course there</button></div>` : `<p>No ${d.fuel} pump charted nearby. A universal canister from a Bazaar general store works in a pinch.</p>`;
        this.altStation = alt;
      }
      cards.push(`<div class="card ${ok ? '' : 'bad'}"><h4>Pumps</h4><p>Sells ${tags}</p><p>Your ${esc(d.name)} burns <b>${d.fuel}</b>. Tank ${sh.fuel.toFixed(0)} of ${g.stat('tank')}.</p>
        ${ok ? `<div class="row"><button class="buy" data-fuel="full">fill the tank</button><button class="buy" data-fuel="10">+10</button></div>` : `<p class="red">Wrong fuel for your ship.</p>${extra}`}</div>`);
    }
    cards.push(`<div class="card"><h4>Hull repair</h4><p>Hull ${Math.round(sh.hull)} of ${g.stat('hull')}. 4 cr per point.</p><div class="row"><button class="buy" data-repair ${sh.hull >= g.stat('hull') - 0.5 ? 'disabled' : ''}>patch it</button></div></div>`);
    const kind = data.kind;
    if (kind === 'shipyard') {
      for (const s of Object.values(SHIPS)) {
        const owned = st.owned.includes(s.id), flying = sh.type === s.id;
        cards.push(`<div class="card ${flying ? 'on' : ''}"><h4>${esc(s.name)} · ${s.cls}</h4>${s.flavour ? `<p class="flavour">${esc(s.flavour)}</p>` : ''}<p>${esc(s.desc || '')}</p>
          <p>hull ${s.hull} · shield ${s.shield} · ${s.speed} u/s · tank ${s.tank} ${s.fuel} · ${s.guns} guns</p>
          ${s.ability ? `<p class="hi"><b>R</b> · ${esc(ABILITIES[s.ability].name)}: ${esc(ABILITIES[s.ability].desc)}</p>` : ''}
          <div class="row">${flying ? '<b>you are flying it</b>' : owned ? `<button class="buy" data-ship="${s.id}">switch to it</button>` : `<button class="buy" data-ship="${s.id}">buy · ${fmtInt(s.price)} cr</button>`}</div></div>`);
      }
      cards.push(`<div class="card"><h4>Paint shop</h4><p>Repaint the ${esc(d.name)} for 300 cr.</p><div class="row">${Object.entries(PAINT_NAMES).map(([k, n]) => `<button class="buy" data-paint="${k}" ${st.paint[sh.type] === k ? 'disabled' : ''}>${esc(n)}</button>`).join('')}</div></div>`);
    }
    if (kind === 'outfitter') {
      for (const [k, e] of Object.entries(EQUIP)) {
        const lvl = st.equip[k];
        cards.push(`<div class="card"><h4>${esc(e.name)}</h4><p>${esc(e.desc)}</p><p>level ${lvl} of ${e.prices.length}</p>
          <div class="row">${lvl < e.prices.length ? `<button class="buy" data-eq="${k}">fit level ${lvl + 1} · ${fmtInt(e.prices[lvl])} cr</button>` : '<b>maxed</b>'}</div></div>`);
      }
    }
    if (kind === 'general') {
      for (const [k, it] of Object.entries(ITEMS)) cards.push(`<div class="card"><h4>${esc(it.name)}</h4><p>${esc(it.desc)}</p><p>you have ${st.items[k] || 0}</p><div class="row"><button class="buy" data-item="${k}">buy · ${fmtInt(it.price)} cr</button></div></div>`);
    }
    if (kind === 'media') {
      const list = g.media.list ? g.media.list() : [];
      cards.push(`<div class="card"><h4>Rewind Video Kiosk</h4><p>The kiosk plays anything you bring. Add your own MP4s and they stay on the ship's screen between visits.</p><p>On your playlist: ${list.length} tape${list.length === 1 ? '' : 's'}.</p><div class="row"><button class="buy" data-media>open the playlist</button></div></div>`);
    }
    if (kind === 'hub') {
      cards.push(`<div class="card"><h4>The Bazaar</h4><p>A shop cluster the width of a dwarf galaxy, parked between the Milky Way and Andromeda. Shipyards, outfitters, general stores, a video kiosk and pumps for every fuel.</p></div>`);
      for (const m of g.u.bazaar.modules) if (m.kind !== 'hub') cards.push(`<div class="card"><h4>${esc(m.name)}</h4><p>${m.kind}${m.fuelTypes ? ` · ${m.fuelTypes.join(', ')}` : ''} · ${fmtU(vdist(m.pos, sh.pos))}</p><div class="row"><button class="buy" data-mod="${esc(m.id)}">set course</button></div></div>`);
    }
    body.innerHTML = cards.join('');
    body.querySelectorAll('[data-fuel]').forEach((b) => b.addEventListener('click', () => say(g.refuel(data.body, b.dataset.fuel === 'full' ? undefined : 10))));
    body.querySelectorAll('[data-repair]').forEach((b) => b.addEventListener('click', () => say(g.repair())));
    body.querySelectorAll('[data-ship]').forEach((b) => b.addEventListener('click', () => say(g.buyShip(b.dataset.ship))));
    body.querySelectorAll('[data-paint]').forEach((b) => b.addEventListener('click', () => say(g.repaint(b.dataset.paint))));
    body.querySelectorAll('[data-eq]').forEach((b) => b.addEventListener('click', () => say(g.buyEquip(b.dataset.eq))));
    body.querySelectorAll('[data-item]').forEach((b) => b.addEventListener('click', () => say(g.buyItem(b.dataset.item))));
    body.querySelectorAll('[data-media]').forEach((b) => b.addEventListener('click', () => { this.close('station'); g.unlock(); g.media.open(); }));
    body.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
      const a = this.altStation;
      if (!a) return;
      g.setCourse(g.u.target('station', { name: a.st.name, pos: a.st.pos, fuelTypes: a.st.fuelTypes }));
      this.close('station');
    }));
    body.querySelectorAll('[data-mod]').forEach((b) => b.addEventListener('click', () => {
      const m = g.u.bazaar.modules.find((x) => x.id === b.dataset.mod);
      if (m) { g.setCourse(g.u.target('module', m)); this.close('station'); }
    }));
  }

  // ---------- map ----------
  setFilter(f) {
    this.mapFilter = f;
    for (const b of $('m-chips').children) b.classList.toggle('on', b.dataset.f === f);
    if (f === 'galaxies') this.mapZoom = Math.max(this.mapZoom, 9.6);
    if (f === 'regions') this.mapZoom = Math.max(this.mapZoom, 9.8);
    if (f === 'stars' || f === 'zones' || f === 'stations') this.mapZoom = Math.min(Math.max(this.mapZoom, 7.2), 8.6);
    if (f === 'planets') this.mapZoom = 5.8;
    if (f === 'bazaar') this.mapZoom = Math.max(this.mapZoom, 7.6);
    $('m-zoom').value = this.mapZoom;
    this.renderList();
    this.drawMap();
  }
  items() {
    const g = this.g, u = g.u, sh = g.ship, q = $('m-search').value.trim().toLowerCase();
    const hit = (s) => !q || String(s).toLowerCase().includes(q);
    const from = sh.pos;
    const f = this.mapFilter;
    let out = [];
    if (f === 'near') out = u.search(q, 120, from);
    else if (f === 'galaxies') out = u.galaxies.filter((x) => hit(x.name) || hit(x.alt)).map((x) => ({ kind: 'galaxy', ref: x, name: x.name, sub: [x.alt, x.type, x.con, x.real ? '' : 'uncharted'].filter(Boolean).join(' / '), d: vdist(x.pos, from) }));
    else if (f === 'regions') out = u.regions.map((x) => ({ kind: 'region', ref: x, name: x.name, sub: `${x.kind} · ${x.blurb}`, d: vdist(x.pos, from) })).filter((x) => hit(x.name));
    else if (f === 'stars') out = u.systemsOf(u.ctx.galaxy || u.mw).filter((s) => hit(s.name)).map((s) => ({ kind: 'system', ref: s, name: s.name, sub: `${s.real ? 'charted' : 'uncharted'}${s.exo ? `, ${s.exo.length} known planet${s.exo.length > 1 ? 's' : ''}` : ''}${s.station ? `, pumps: ${s.station.fuelTypes.join('/')}` : ''}`, d: vdist(s.pos, from) }));
    else if (f === 'planets') {
      for (const v of u.views.values()) for (const b of v.bodies) if ((b.kind === 'planet' || b.kind === 'dwarf planet' || b.kind === 'moon') && hit(b.name)) {
        const p = b.planet;
        out.push({ kind: 'planet', ref: { sys: v.sys, planet: p, body: b }, name: b.name, sub: `${b.kind} of ${v.sys.name}${p.real ? ', real' : ', seeded'}${p.re ? `, ${p.re.toFixed(2)} Earth radii` : ''}${p.year ? `, found ${p.year}` : ''}`, d: vdist(b.pos, from), moon: b.kind === 'moon' });
      }
    } else if (f === 'sights') out = u.sights.filter((s) => hit(s.name)).map((s) => ({ kind: 'sight', ref: s, name: s.name, sub: `${s.kind}${s.note ? ' · ' + s.note : ''}`, d: vdist(s.pos, from) }));
    else if (f === 'zones') out = u.zones.filter((z) => hit(z.name)).map((z) => ({ kind: 'zone', ref: z, name: z.name, sub: `${z.state === 'hostile' ? `hostile, tier ${z.tier}` : 'liberated'} · ${z.galaxy.name}`, d: vdist(z.pos, from), red: z.state === 'hostile', dim: z.state !== 'hostile' }));
    else if (f === 'stations') out = u.stationsNear(from, g.def.fuel, 60).filter((x) => hit(x.st.name)).map((x) => ({ kind: 'station', ref: x.st, name: x.st.name, sub: `${x.st.fuelTypes.join(', ')} · ${x.ok ? `serves your ${g.def.fuel}` : `no ${g.def.fuel}`}`, d: x.d, dim: !x.ok }));
    else if (f === 'exo') out = u.systemsOf(u.mw).filter((s) => s.exo && (hit(s.name) || s.exo.some((p) => hit(p.pl)))).map((s) => ({ kind: 'system', ref: s, name: s.name, sub: `${s.exo.length} confirmed planet${s.exo.length > 1 ? 's' : ''}: ${s.exo.slice(0, 4).map((p) => p.pl.replace(s.name, '').trim() || p.pl).join(', ')}${s.exo.length > 4 ? '...' : ''}`, d: vdist(s.pos, from) }));
    else if (f === 'saved') out = g.state.bookmarks.map((b) => ({ b, t: u.resolve(b) })).filter((x) => x.t && hit(x.b.name)).map(({ b, t }) => ({ kind: t.kind, ref: t.ref, name: b.name, sub: `saved ${KIND_WORD[t.kind] || t.kind}`, d: vdist(t.pos(g.t), from), target: t }));
    else if (f === 'bazaar') out = u.bazaar.modules.filter((m) => hit(m.name)).map((m) => ({ kind: 'module', ref: m, name: m.name, sub: `${m.kind}${m.fuelTypes ? ' · ' + m.fuelTypes.join(', ') : ''}`, d: vdist(m.pos, from) }));
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, 200);
  }
  renderList() {
    const items = this.items();
    this.listItems = items;
    $('m-list').innerHTML = items.length ? items.map((it, i) => {
      const real = it.ref && (it.ref.pc > 0) ? fmtReal(it.ref.pc) : '';
      return `<li data-i="${i}" class="${it.red ? 'red' : ''}${it.dim ? ' dim' : ''}${this.sel && this.sel.ref === it.ref ? ' sel' : ''}"><span>${esc(it.name)}</span><span class="d">${fmtU(it.d)}</span><small>${esc(it.sub || KIND_WORD[it.kind])}${real ? ` · ${real} from the Sun` : ''}</small></li>`;
    }).join('') : '<li class="dim"><span>nothing matches</span></li>';
  }
  toTarget(it) {
    const u = this.g.u;
    if (it.kind === 'planet') return u.target('planet', it.ref.body.kind === 'moon' ? { sys: it.ref.sys, planet: it.ref.body.parent.planet } : it.ref);
    return u.target(it.kind, it.ref);
  }
  select(it) {
    if (!it) return;
    this.sel = it;
    this.selTarget = it.target || this.toTarget(it);
    this.g.navTarget = this.selTarget;
    audio.sfx('ui');
    this.renderSel();
    this.renderList();
    this.drawMap();
  }
  cruiseEta(d) {
    const cm = this.g.stat('cruise');
    const xc = cm / 0.1;
    if (d < 4e4) return d / this.g.stat('speed');
    if (d / 2 < xc) return 2 * 10 * Math.log(Math.max(d / 2 / 2e4, 1.01)) + 10;
    return 2 * 10 * Math.log(xc / 2e4) + (d - 2 * xc) / cm + 10;
  }
  renderSel() {
    const el = $('m-sel'), g = this.g, t = this.selTarget;
    if (!t) { el.innerHTML = '<span class="fine">Pick something from the list or click the map. Then set a course and walk away from the helm, or warp.</span>'; return; }
    const d = vdist(t.pos(g.t), g.ship.pos);
    const w = g.warpCost(t);
    const canWarp = !g.zone && g.ship.fuel >= w.cost;
    const real = t.real > 0 ? `${fmtReal(t.real)} from the Sun for real · ` : '';
    let note = '';
    if (t.kind === 'station' && t.ref.fuelTypes) note = ` · sells ${t.ref.fuelTypes.join(', ')}${t.ref.fuelTypes.includes(g.def.fuel) ? '' : ` (not your ${g.def.fuel})`}`;
    if (t.kind === 'zone') note = ` · ${t.ref.state === 'hostile' ? `hostile, tier ${t.ref.tier}` : 'liberated'}`;
    el.innerHTML = `<span class="nm">${esc(t.name)}</span><span>${KIND_WORD[t.kind] || t.kind}${note}</span>
      <span>${real}${fmtU(d)} in game · cruise about ${fmtTime(this.cruiseEta(d))}</span>
      <button class="buy" id="m-go">set course (T)</button>
      ${t.kind !== 'zone' && t.kind !== 'bazaar' && t.kind !== 'region' ? `<button class="buy" id="m-save">${g.isBookmarked(t) ? 'unsave' : 'save'}</button>` : ''}
      <button class="buy" id="m-warp" ${canWarp ? '' : 'disabled'}>warp (J) · ${fmtTime(w.dur + 3)} · ${w.cost.toFixed(0)} ${g.def.fuel}</button>
      ${g.zone ? '<span class="red">warp jammed in this zone</span>' : g.ship.fuel < w.cost ? `<span class="red">need ${w.cost.toFixed(0)} fuel</span>` : ''}`;
    $('m-go').addEventListener('click', () => { g.setCourse(t); this.close('map'); });
    const sv = $('m-save');
    if (sv) sv.addEventListener('click', () => { this.toast(g.toggleBookmark(t)); this.renderSel(); if (this.mapFilter === 'saved') this.renderList(); });
    $('m-warp').addEventListener('click', () => { this.close('map'); g.warpTo(t); });
  }
  drawMap() {
    const cv = $('m-canvas');
    if (!cv || !this.open_.has('map')) return;
    const c = cv.getContext('2d'), W = cv.width, H = cv.height, g = this.g, u = g.u, sh = g.ship;
    const half = Math.pow(10, this.mapZoom);
    const k = (W / 2) / half;
    const cx = W / 2, cy = H / 2;
    const P = (p) => [cx + (p.x - sh.pos.x) * k, cy + (p.z - sh.pos.z) * k];
    const inView = (x, y, m = 20) => x > -m && x < W + m && y > -m && y < H + m;
    this.mapHits = [];
    c.fillStyle = '#fbf8ee'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(26,48,192,0.12)'; c.lineWidth = 1;
    for (let y = 18; y < H; y += 24) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.font = '14px "Patrick Hand", cursive';
    c.lineWidth = 1.5;
    // named clusters and superclusters, under the galaxy dots
    if (this.mapZoom > 8.6) for (const reg of u.regions) {
      const [x, y] = P(reg.pos);
      const r = Math.max(reg.R * k, 10);
      if (!inView(x, y, r)) continue;
      c.strokeStyle = 'rgba(77,238,255,0.30)'; c.setLineDash([10, 8]);
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      c.fillStyle = 'rgba(77,238,255,0.65)'; c.fillText(reg.name, x - Math.min(r * 0.6, 70), y);
      this.mapHits.push({ x, y, it: { kind: 'region', ref: reg, name: reg.name } });
    }
    // galaxies
    for (const gx of u.galaxies) {
      const [x, y] = P(gx.pos);
      const r = Math.max(gx.R * k, 1.6);
      if (!inView(x, y, r)) continue;
      c.strokeStyle = gx.real ? '#4deeff' : 'rgba(26,48,192,0.45)';
      c.fillStyle = gx.kind === 'elliptical' || gx.kind === 'lenticular' ? 'rgba(255,216,74,0.5)' : 'rgba(26,48,192,0.15)';
      c.beginPath(); c.ellipse(x, y, r, r * 0.55, 0.4, 0, Math.PI * 2); c.fill(); if (r > 3) c.stroke();
      if (r > 14 || (r > 3 && this.mapZoom > 9)) { c.fillStyle = '#4deeff'; c.fillText(gx.name, x + Math.min(r, 40) + 3, y); }
      this.mapHits.push({ x, y, it: { kind: 'galaxy', ref: gx, name: gx.name } });
    }
    // systems of the current galaxy
    if (this.mapZoom < 9.8) {
      const list = u.systemsOf(u.ctx.galaxy || u.mw);
      for (const s of list) {
        const [x, y] = P(s.pos);
        if (!inView(x, y)) continue;
        c.fillStyle = s.real ? '#4deeff' : 'rgba(26,48,192,0.5)';
        c.fillRect(x - 1.5, y - 1.5, 3, 3);
        if (s.station) { c.strokeStyle = s.station.fuelTypes.includes(g.def.fuel) ? '#4deeff' : 'rgba(208,32,48,0.6)'; c.strokeRect(x + 3, y - 6, 5, 5); }
        if (this.mapZoom < 7.6) { c.fillStyle = '#4deeff'; c.fillText(s.name, x + 5, y + 12); }
        this.mapHits.push({ x, y, it: { kind: 'system', ref: s, name: s.name } });
      }
    }
    // planets of nearby systems
    if (this.mapZoom < 6.6) {
      for (const v of u.views.values()) for (const b of v.bodies) {
        if (b.kind !== 'planet' && b.kind !== 'dwarf planet') continue;
        const [x, y] = P(b.pos);
        if (!inView(x, y)) continue;
        c.fillStyle = '#4deeff';
        c.beginPath(); c.arc(x, y, Math.max(2.5, b.r * k), 0, Math.PI * 2); c.fill();
        c.fillText(b.name, x + 5, y - 4);
        this.mapHits.push({ x, y, it: { kind: 'planet', ref: { sys: v.sys, planet: b.planet, body: b }, name: b.name } });
      }
    }
    // zones
    for (const z of u.zones) {
      const [x, y] = P(z.pos);
      const r = Math.max(z.radius * k, 6);
      if (!inView(x, y, r)) continue;
      c.strokeStyle = z.state === 'hostile' ? '#ff3b5c' : 'rgba(26,48,192,0.6)';
      c.setLineDash(z.state === 'hostile' ? [] : [4, 4]);
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
      c.fillStyle = c.strokeStyle; c.fillText(z.state === 'hostile' ? z.name : `${z.name} (liberated)`, x + r + 3, y + 4);
      this.mapHits.push({ x, y, it: { kind: 'zone', ref: z, name: z.name } });
    }
    // sights and the bazaar
    for (const s of u.sights) {
      const [x, y] = P(s.pos);
      if (!inView(x, y)) continue;
      c.fillStyle = '#e06c90';
      c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x + 5, y); c.lineTo(x, y + 5); c.lineTo(x - 5, y); c.fill();
      if (this.mapZoom < 9.3) c.fillText(s.name, x + 7, y + 4);
      this.mapHits.push({ x, y, it: { kind: 'sight', ref: s, name: s.name } });
    }
    const [bx, by] = P(u.bazaar.pos);
    if (inView(bx, by)) {
      c.fillStyle = '#ffc23c';
      c.beginPath(); c.arc(bx, by, Math.max(6, u.bazaar.R * k), 0, Math.PI * 2); c.globalAlpha = 0.35; c.fill(); c.globalAlpha = 1;
      c.fillStyle = '#4deeff'; c.fillText('The Bazaar', bx + 9, by - 6);
      this.mapHits.push({ x: bx, y: by, it: { kind: 'bazaar', ref: u.bazaar, name: 'The Bazaar' } });
      if (this.mapZoom < 8) for (const m of u.bazaar.modules) {
        const [x, y] = P(m.pos);
        c.fillStyle = '#4deeff'; c.fillRect(x - 3, y - 3, 6, 6);
        c.fillText(m.name, x + 6, y + 4);
        this.mapHits.push({ x, y, it: { kind: 'module', ref: m, name: m.name } });
      }
    }
    // target line
    const t = this.selTarget || g.navTarget;
    if (t) {
      const [x, y] = P(t.pos(g.t));
      c.strokeStyle = '#4deeff'; c.setLineDash([6, 5]);
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, y); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.stroke();
    }
    // you
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(sh.q);
    const a = Math.atan2(f.z, f.x);
    c.save(); c.translate(cx, cy); c.rotate(a);
    c.fillStyle = '#ffd84a'; c.strokeStyle = '#4deeff'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(11, 0); c.lineTo(-7, -7); c.lineTo(-3, 0); c.lineTo(-7, 7); c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.fillStyle = '#4deeff';
    c.fillText(`view ${fmtU(half * 2)} across · top-down, galactic plane`, 10, H - 10);
  }
  mapClick(e) {
    const cv = $('m-canvas'), r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * cv.width, y = ((e.clientY - r.top) / r.height) * cv.height;
    let best = null, bd = 14;
    for (const h of this.mapHits || []) { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h; } }
    if (best) this.select(best.it);
  }
}
