// End-to-end test: boots the real game in headless Chrome and drives every
// system through window.__dv. Fails on any console error or failed check.
// Usage: node tools/test.mjs [--url http://127.0.0.1:5310/] [--shots tools/.shots]
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const PORT = 5310;
let URL_ = opt('--url', null);
const SHOTS = path.resolve(opt('--shots', path.join(here, '.shots')));
let server = null;
if (!URL_) {
  server = spawn(process.execPath, [path.join(here, 'serve.mjs'), '--port', String(PORT)], { stdio: 'ignore' });
  URL_ = `http://127.0.0.1:${PORT}/`;
  await new Promise((r) => setTimeout(r, 800));
}

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
  if (!ok) failed++;
  console.log(results[results.length - 1]);
};

const b = await launch({ width: 1280, height: 720 });
try {
  await b.goto(URL_);
  // wait for boot
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) { ready = await b.eval('!!(window.__dv && window.__dv.ready)'); if (!ready) await b.wait(500); }
  check('boots and loads the catalogues', ready);
  if (!ready) throw new Error('game never became ready');
  const E = (s) => b.eval(`(async () => { const g = window.__dv; ${s} })()`);
  // a headless window never has focus, so pause-on-blur would pause mid-test
  await E('g.settings.pauseOnBlur = false; return 1;');
  const step = (ms, steps = 4) => E(`g.steps = ${steps}; await new Promise(r => setTimeout(r, ${ms})); g.steps = 1; return true;`);
  const counts = await E('return g.u.counts;');
  check('catalogue counts', counts.galaxies > 1000 && counts.planets > 1000, JSON.stringify(counts));
  await b.shot(path.join(SHOTS, '01-title.png'));

  // launch at the helm. A fresh Chrome profile has no save, so this first
  // launch is a NEW GAME and the intro crawl plays over it.
  const crawl = await E(`g.launch(); return {
    active: g.ui.crawlActive, fresh: g.freshStart, shown: !document.getElementById('crawl').hidden,
    beat: document.getElementById('crawl-text').textContent,
    district: g.state.codex.includes('district'), inkglows: g.state.codex.includes('inkglows') };`);
  check('a new game opens with the intro crawl', crawl.active && crawl.shown && crawl.beat.startsWith('Doodle District held.'), JSON.stringify(crawl).slice(0, 220));
  check('the crawl unlocks the first two codex entries', crawl.district && crawl.inkglows, JSON.stringify(crawl.district) + ' ' + JSON.stringify(crawl.inkglows));
  // Flight input is swallowed while the crawl is up. Holding W ramps the
  // throttle and the mouse turns the hull, both only through updateHelmInput,
  // so with the guard in place the throttle stays 0 and the hull never turns.
  const frozen = await E(`
    const q0 = g.ship.q.clone();
    const before = { throttle: g.ship.throttle, cs: g.ship.cs };
    g.keys.add('KeyW');
    for (let i = 0; i < 20; i++) { g.mouse.dx = 400; g.mouse.dy = 200; g.update(0.05); }
    g.keys.delete('KeyW'); g.mouse.dx = 0; g.mouse.dy = 0;
    return { before, throttle: g.ship.throttle, cs: g.ship.cs, turned: q0.angleTo(g.ship.q), active: g.ui.crawlActive };`);
  // cs only tracks the speed the ship actually has (gravity still pulls), so the
  // proof is the throttle never ramping and the hull never turning.
  check('flight input does nothing while the crawl is on screen',
    frozen.active === true && frozen.throttle === 0 && frozen.turned < 1e-6 && frozen.cs < 20, JSON.stringify(frozen));
  await b.shot(path.join(SHOTS, '02-crawl.png'));
  await b.key('k');                                 // any key skips it, and does nothing else
  await b.wait(200);
  const skipped = await E(`return { active: g.ui.crawlActive, hidden: document.getElementById('crawl').hidden, mode: g.mode, shots: g.shots.length };`);
  check('any key skips the crawl straight to the helm', !skipped.active && skipped.hidden && skipped.mode === 'helm', JSON.stringify(skipped));
  await b.wait(1500);
  check('launch puts you at the helm', (await E('return g.mode;')) === 'helm');
  await b.shot(path.join(SHOTS, '02-helm.png'));

  // flying: throttle and lasers
  const p0 = await E('return {...g.ship.pos};');
  await E('g.ship.throttle = 1; g.mouse.left = true; return 1;');
  await step(1500);
  const fl = await E('g.mouse.left = false; return { pos: {...g.ship.pos}, shots: g.shots.length, heat: g.ship.heat, speed: g.ship.vel.length() };');
  const moved = Math.hypot(fl.pos.x - p0.x, fl.pos.y - p0.y, fl.pos.z - p0.z);
  check('ship flies under throttle', moved > 50, `moved ${moved.toFixed(0)} u, speed ${fl.speed.toFixed(0)}`);
  check('lasers fire and heat up', fl.heat > 0 || fl.shots > 0, `shots ${fl.shots} heat ${fl.heat.toFixed(1)}`);
  await b.shot(path.join(SHOTS, '03-lasers.png'));
  // Gev 2026-09-23: the mouse must pitch the ship, not only yaw it
  const pt = await E(`const V = g.ship.vel.constructor; const f0 = new V(0,0,-1).applyQuaternion(g.ship.q);
    for (let i = 0; i < 8; i++) { g.mouse.dy -= 25; await new Promise(r => setTimeout(r, 60)); }
    const f1 = new V(0,0,-1).applyQuaternion(g.ship.q); const up = new V(0,1,0).applyQuaternion(g.ship.q);
    return { angle: f0.angleTo(f1), nose: f1.clone().sub(f0).dot(up) };`);
  check('mouse pitches the ship (nose up)', pt.angle > 0.05 && pt.nose > 0, JSON.stringify(pt));
  // Gev 2026-09-23: the far end of the charted universe under 20 minutes of cruise
  const far = await E(`let m = 0; for (const x of g.u.galaxies) m = Math.max(m, Math.hypot(x.pos.x, x.pos.y, x.pos.z)); return { d: m, eta: g.ui.cruiseEta(m) };`);
  check('farthest galaxy under 20 minutes by cruise', far.eta < 1200, `${(far.eta / 60).toFixed(1)} min to ${far.d.toExponential(2)} u`);

  // cruise
  await E('g.ship.throttle = 1; g.toggleCruise(); return g.ship.cruise;');
  await step(2500);
  const cr = await E('return { cruise: g.ship.cruise, speed: g.ship.vel.length(), sub: g.stat("speed") };');
  check('cruise drive goes faster than sublight', cr.cruise && cr.speed > cr.sub, `speed ${cr.speed.toFixed(0)} vs ${cr.sub}`);
  await E('g.ship.cruise = false; g.ship.throttle = 0; g.ship.vel.set(0,0,0); g.ship.cs = 0; return 1;');

  // walking and interactables
  await E('g.standUp(); return g.mode;');
  const w0 = await E('return {x: g.player.x, z: g.player.z};');
  await E('g.keys.add("KeyW"); return 1;');
  await step(900, 1);
  const w1 = await E('g.keys.delete("KeyW"); return {x: g.player.x, z: g.player.z};');
  check('walking moves you inside the ship', Math.hypot(w1.x - w0.x, w1.z - w0.z) > 0.3, JSON.stringify(w1));
  await b.shot(path.join(SHOTS, '04-on-foot.png'));
  const ids = await E('return g.interior.interact.map(i => i.id);');
  check('ship has the core interactables', ['helm', 'media', 'nav', 'music', 'breach'].every((i) => ids.includes(i)), ids.join(','));
  const safe = ['toilet', 'sink', 'stove', 'fridge', 'lamp', 'desk', 'music', 'storage', 'bed', 'nav', 'media', 'tv', 'shower'];
  const used = await E(`
    const out = [];
    for (const it of g.interior.interact) {
      if (!${JSON.stringify(safe)}.includes(it.id)) continue;
      g.player.x = it.pos.x; g.player.z = it.pos.z + 0.3; g.player.yaw = 0;
      const n = g.nearestInteract();
      g.player.x = it.pos.x; g.player.z = it.pos.z;
      g.interact = g.interact;
      const before = g.ui.anyOpen();
      // face it from wherever we are standing
      g.player.x = it.pos.x - 0.0; g.player.z = it.pos.z + 0.6; g.player.yaw = 0;
      const found = g.nearestInteract();
      if (found) { g.interact(); out.push(found.id); }
      if (g.media.isOpen) g.media.close();
      g.ui.closeAll();
      if (g.showerLoop) { g.showerLoop.stop(); g.showerLoop = null; }
    }
    return out;`);
  check('interactables respond', used.length >= 3, used.join(','));

  // media
  const med = await E('await g.media.init?.call(g.media).catch?.(()=>{}); const l = g.media.list(); g.media.open(); const open = g.media.isOpen; g.media.play(0); await new Promise(r => setTimeout(r, 2500)); const playing = g.media.playing; g.media.close(); return { n: l.length, open, playing };');
  check('MP4 playlist opens and plays', med.n >= 3 && med.open && med.playing, JSON.stringify(med));

  // map
  const mp = await E(`g.ui.open('map'); const out = {};
    for (const f of ['near','galaxies','stars','planets','sights','zones','stations','bazaar']) { g.ui.setFilter(f); out[f] = g.ui.listItems.length; }
    g.ui.setFilter('galaxies'); g.ui.select(g.ui.listItems[1]); const t = g.navTarget && g.navTarget.name; g.ui.close('map'); return { out, t };`);
  check('map lists every category', Object.values(mp.out).filter((n) => n > 0).length >= 6, JSON.stringify(mp.out));
  check('map selects a target', !!mp.t, mp.t);

  // ---- universe density, named clusters, and the Billboard Worlds ads ----
  const uvDens = await E(`
    const u = g.u;
    const sys = (n) => { const gx = u.findGalaxy(n); return gx ? u.systemsOf(gx) : []; };
    const m31 = sys('M31'), m87 = sys('NGC 4486'), dw = sys('Andromeda I');
    return {
      m31: m31.length, m31pumps: m31.filter((s) => s.station).length,
      m87: m87.length, dwarf: dw.length,
      baseN: u.baseN, baseKpc: u.baseKpc,
      regions: u.regions.map((r) => ({ name: r.name, d: Math.hypot(r.pos.x, r.pos.y, r.pos.z), R: r.R })),
    };`);
  check('every galaxy is as busy as the Milky Way (Andromeda)', uvDens.m31 >= 500, `${uvDens.m31} systems, was 18`);
  check('Andromeda keeps the 42 per cent pump rule', uvDens.m31pumps > uvDens.m31 * 0.3 && uvDens.m31pumps < uvDens.m31 * 0.55, `${uvDens.m31pumps} pumps of ${uvDens.m31}`);
  check('a Virgo elliptical is populated too, not just Andromeda', uvDens.m87 >= 300, `${uvDens.m87} systems`);
  check('a Local Group dwarf is never literally empty', uvDens.dwarf >= 40, `${uvDens.dwarf} systems`);
  const uvExpectM31 = Math.min(5000, Math.max(500, Math.round(uvDens.baseN * Math.pow(20.13 / uvDens.baseKpc, 3))));
  check('the density formula is calibrated off the Milky Way itself', uvDens.baseN > 10000 && Math.abs(uvDens.m31 - uvExpectM31) / uvExpectM31 < 0.3,
    `baseN ${uvDens.baseN}, kpc ${uvDens.baseKpc}, expected about ${uvExpectM31}, got ${uvDens.m31}`);
  check('seven named clusters and superclusters, all placed', uvDens.regions.length === 7 && uvDens.regions.every((r) => r.d > 0 && r.R > 0), uvDens.regions.map((r) => r.name).join(' / '));
  const uvHc = uvDens.regions.find((r) => r.name.includes('Hydra'));
  check('Hydra-Centaurus sits just inside the uncharted boundary', !!uvHc && uvHc.d > 7e9 && uvHc.d < 9e9, uvHc ? `${uvHc.d.toExponential(2)} u from the Sun` : 'missing');

  const uvZones = await E(`return { total: g.u.zones.length, galaxies: new Set(g.u.zones.filter((z) => z.galaxy !== g.u.mw).map((z) => z.galaxy.id)).size };`);
  check('enemy zones spread across many galaxies, not twelve systems in twelve', uvZones.galaxies >= 20 && uvZones.total > 30, JSON.stringify(uvZones));

  const uvLru = await E(`
    const u = g.u, t0 = performance.now();
    const gals = u.galaxies.filter((x) => x.real && x !== u.mw).slice(0, 40);
    let n = 0;
    for (const gx of gals) n += u.systemsOf(gx).length;
    return { order: u.cacheOrder.length, size: u.systemCache.size, systems: n, ms: performance.now() - t0 };`);
  check('the generated-system cache stays inside its memory budget', uvLru.order <= 24 && uvLru.size <= 32 && uvLru.systems > 20000,
    `${uvLru.systems} systems across 40 galaxies in ${uvLru.ms.toFixed(0)} ms, ${uvLru.order} held`);
  const uvGen = await E(`
    const u = g.u, gx = u.findGalaxy('M31');
    u.systemCache.delete(gx.id);
    const t0 = performance.now();
    const n = u.systemsOf(gx).length;
    const one = performance.now() - t0;
    const t1 = performance.now();
    g.u.rollZones(4242, new Set());
    return { n, one, roll: performance.now() - t1 };`);
  check('generating the biggest galaxy, and one whole zone roll, stay quick',
    uvGen.n === 5000 && uvGen.one < 400 && uvGen.roll < 4000,
    `5,000 systems in ${uvGen.one.toFixed(0)} ms, a full zone roll in ${uvGen.roll.toFixed(0)} ms`);

  const uvHub = await E(`
    const u = g.u, gx = u.findGalaxy('M31');
    u.detailFor(gx);
    const mine = u.sights.filter((s) => s.galaxy === gx.name);
    const f = gx.hub ? gx.hub.modules.filter((m) => m.kind === 'fuel') : [];
    return {
      hub: !!gx.hub, kinds: gx.hub ? gx.hub.modules.map((m) => m.kind) : [],
      fuelOk: f.length > 0 && f.every((m) => m.fuelTypes.length >= 1 && m.fuelTypes.length <= 3),
      sights: mine.length, core: mine.some((s) => s.kind === 'blackhole'),
    };`);
  check('a galaxy you reach gets its own depot and its own sights', uvHub.hub && uvHub.fuelOk && uvHub.sights >= 1 && uvHub.core, JSON.stringify(uvHub));

  const uvRgn = await E(`
    g.ui.open('map'); g.ui.setFilter('regions');
    const n = g.ui.listItems.length;
    g.ui.select(g.ui.listItems[0]);
    const t = g.navTarget && g.navTarget.name;
    g.ui.drawMap();
    const hits = (g.ui.mapHits || []).filter((h) => h.it.kind === 'region').length;
    g.ui.close('map'); g.ui.mapZoom = 7.3;
    return { n, t, hits };`);
  check('the map lists and draws the clusters', uvRgn.n === 7 && !!uvRgn.t && uvRgn.hits > 0, JSON.stringify(uvRgn));

  const uvWarp = await E(`
    const t = { pos: () => ({ x: g.ship.pos.x + 1e7, y: g.ship.pos.y, z: g.ship.pos.z }) };
    const w = g.warpCost(t);
    return { cost: w.cost, dur: w.dur, want: 8 + 10 * Math.log10(1 + 1e7 / 1e5) };`);
  check('fuel stays exactly as annoying as it was', Math.abs(uvWarp.cost - uvWarp.want) < 1e-9, `${uvWarp.cost.toFixed(2)} fuel for 10 Mu, unchanged formula`);

  // Park by Mars so the home system is certain to have a live view, then read
  // the real materials off the real meshes.
  const uvBack = await E('return { x: g.ship.pos.x, y: g.ship.pos.y, z: g.ship.pos.z };');
  const uvAds = await E(`
    const u = g.u, sol = u.sol;
    const pl = u.planetsOf(sol);
    const mars = pl.find((p) => p.name === 'Mars');
    const p = u.planetPos(sol, mars, g.t, { x: 0, y: 0, z: 0 });
    g.setMode('helm');
    g.ship.pos.x = p.x + 2e5; g.ship.pos.y = p.y; g.ship.pos.z = p.z;
    g.ship.vel.set(0, 0, 0); g.ship.cruise = false; g.ship.throttle = 0;
    u.nearSys = null; u.tick = 0;
    g.steps = 3; await new Promise((r) => setTimeout(r, 500)); g.steps = 1;
    const U = await import('./js/universe.js');
    const { ink } = await import('./js/mats.js');
    const v = [...u.views.values()].find((x) => x.sys.solar);
    if (!v) return { why: 'the home system never got a view' };
    const mb = v.bodies.find((b) => b.planet && b.planet.name === 'Mars');
    const jb = v.bodies.find((b) => b.planet && b.planet.name === 'Jupiter');
    if (!mb || !jb) return { why: 'no Mars or Jupiter body' };
    const mm = mb.mesh.material, jm = jb.mesh.material;
    // turn the planet by advancing sim time only, and separately move the ship
    // a long way with time frozen: the sign must track the first and ignore the second
    mb.mesh.updateMatrixWorld(true);
    const w0 = mm.userData.decalDir.clone().transformDirection(mb.mesh.matrixWorld);
    g.ship.pos.x += 4e4; g.ship.pos.y += 3e4;
    v.update(g.ship.pos, g.t);
    mb.mesh.updateMatrixWorld(true);
    const wShip = mm.userData.decalDir.clone().transformDirection(mb.mesh.matrixWorld);
    const dt = 40;
    v.update(g.ship.pos, g.t + dt);
    mb.mesh.updateMatrixWorld(true);
    const wSpin = mm.userData.decalDir.clone().transformDirection(mb.mesh.matrixWorld);
    // the planet spins 0.02 rad/s about its own Y, so a direction welded into
    // its local frame must swing by exactly this much and no more
    const dy = mm.userData.decalDir.y, th = 0.02 * dt;
    const want = Math.acos(Math.min(1, Math.max(-1, dy * dy + (1 - dy * dy) * Math.cos(th))));
    return {
      copies: U.AD_COUNT,
      marsTitle: U.AD_COPY[mars.ad] && U.AD_COPY[mars.ad].title,
      jupTitle: U.AD_COPY[pl.find((x) => x.name === 'Jupiter').ad].title,
      withAd: pl.filter((x) => x.ad != null).length, planets: pl.length,
      shared: mm === jm,
      cached: mm === ink(mb.planet.color) || jm === ink(jb.planet.color),
      ownKey: mm.customProgramCacheKey() !== ink(mb.planet.color).customProgramCacheKey(),
      hasDecal: !!(mm.userData.decalDir && jm.userData.decalDir),
      texKept: v.textures.includes(mm.userData.adMap) || v.textures.includes(jm.userData.adMap),
      frag: mm.userData.adFrag || '',
      shipMove: w0.angleTo(wShip), spin: w0.angleTo(wSpin), want,
    };`);
  check('at least twelve ad copies, and Mars and Jupiter carry their own',
    uvAds.copies >= 12 && uvAds.marsTitle === 'JOIN THE RED MARGIN' && uvAds.jupTitle === 'RIDELINK' && uvAds.withAd === 2,
    `${uvAds.copies} copies, ${uvAds.withAd} of ${uvAds.planets} home planets rented`);
  check('every ad planet owns its material, so a sign cannot leak onto others',
    uvAds.hasDecal && !uvAds.shared && !uvAds.cached && uvAds.ownKey, JSON.stringify({ shared: uvAds.shared, cached: uvAds.cached, ownKey: uvAds.ownKey, hasDecal: uvAds.hasDecal }));
  check('the ad art survives leaving and re-entering a system', uvAds.texKept === false, `in the view dispose list: ${uvAds.texKept}`);
  check('the decal is object-space, so it can never follow the camera',
    /vAdPos/.test(uvAds.frag || '') && !/cameraPosition|viewMatrix|vViewPosition|modelViewMatrix/.test(uvAds.frag || ''), (uvAds.frag || 'no shader').slice(0, 60).replace(/\s+/g, ' '));
  await E(`g.ship.pos.x = ${uvBack.x}; g.ship.pos.y = ${uvBack.y}; g.ship.pos.z = ${uvBack.z}; g.ship.vel.set(0, 0, 0); return 1;`);
  check('the ad turns with the planet and ignores the ship',
    uvAds.shipMove < 1e-6 && uvAds.spin > 0.05 && Math.abs(uvAds.spin - uvAds.want) < 0.02,
    `ship moved it ${Number(uvAds.shipMove).toExponential(1)} rad, the planet's own spin moved it ${Number(uvAds.spin).toFixed(3)} rad of a predicted ${Number(uvAds.want).toFixed(3)}`);

  // autopilot to Mars
  const ap = await E(`g.setMode('helm');
    const sol = g.u.sol; const mars = g.u.planetsOf(sol).find(p => p.name === 'Mars');
    const t = g.u.target('planet', { sys: sol, planet: mars });
    const d0 = Math.hypot(t.pos(g.t).x - g.ship.pos.x, t.pos(g.t).y - g.ship.pos.y, t.pos(g.t).z - g.ship.pos.z);
    g.setCourse(t); return d0;`);
  // The ship has to finish turning before its heading means anything, and
  // how far it must turn depends on where Mars is in its orbit that run. Give
  // it up to five stretches, and stop as soon as it is pointed at the target
  // or has started closing.
  let apHead = -1, apNow = null;
  for (let i = 0; i < 5; i++) {
    await step(4000, 4);
    apNow = await E(`const t = g.ship.auto ? g.ship.auto.target : g.navTarget; const p = t.pos(g.t); return { d: Math.hypot(p.x - g.ship.pos.x, p.y - g.ship.pos.y, p.z - g.ship.pos.z), auto: !!g.ship.auto };`);
    apHead = await E(`const t = g.ship.auto ? g.ship.auto.target : g.navTarget; const p = t.pos(g.t); const V = g.ship.vel.constructor;
      const to = new V(p.x - g.ship.pos.x, p.y - g.ship.pos.y, p.z - g.ship.pos.z).normalize(); const f = new V(0,0,-1).applyQuaternion(g.ship.q); return f.dot(to);`);
    if (!apNow.auto || apNow.d < ap || apHead > 0.9) break;
  }
  const ap1 = await E(`const t = g.ship.auto ? g.ship.auto.target : g.navTarget; const p = t.pos(g.t); return { d: Math.hypot(p.x - g.ship.pos.x, p.y - g.ship.pos.y, p.z - g.ship.pos.z), auto: !!g.ship.auto, paused: g.paused, mode: g.mode, t: g.t, fuel: g.ship.fuel, open: [...g.ui.open_], media: g.media.isOpen, hidden: document.hidden };`);
  // planets orbit, so judge the autopilot by where the ship is heading, not by one distance sample
  const head = apHead;
  check('autopilot closes on Mars', ap1.d < ap || (ap1.auto && head > 0.9), `${ap.toFixed(0)} -> ${ap1.d.toFixed(0)} ${JSON.stringify({ ...ap1, d: undefined })}`);
  await b.shot(path.join(SHOTS, '05-autopilot.png'));
  await E('g.ship.auto = null; g.ship.cruise = false; g.ship.throttle = 0; return 1;');

  // warp to Proxima Centauri (or the nearest charted star)
  const wp = await E(`
    const list = g.u.systemsOf(g.u.mw).filter(s => s.real && s !== g.u.sol).sort((a,b) => Math.hypot(a.pos.x,a.pos.y,a.pos.z) - Math.hypot(b.pos.x,b.pos.y,b.pos.z));
    const s = list[0]; const t = g.u.target('system', s); const c = g.warpCost(t);
    g.ship.fuel = g.stat('tank'); const f0 = g.ship.fuel; g.warpTo(t);
    return { name: s.name, cost: c.cost, dur: c.dur, f0, warping: !!g.ship.warp };`);
  check('warp starts', wp.warping, `${wp.name} ${wp.dur.toFixed(1)} s, ${wp.cost.toFixed(1)} fuel`);
  await step(1800, 2);
  await b.shot(path.join(SHOTS, '06-warp.png'));
  // software GL is slow, so wait for the arrival rather than a fixed time
  for (let i = 0; i < 60 && (await E('return !!g.ship.warp;')); i++) await step(2000, 8);
  const wp1 = await E(`return { warping: !!g.ship.warp, fuel: g.ship.fuel, sys: g.u.ctx.system && g.u.ctx.system.name };`);
  check('warp arrives and burns fuel', !wp1.warping && wp1.fuel < wp.f0 - wp.cost * 0.9, JSON.stringify(wp1));
  check('warp is under a minute', wp.dur <= 60);
  await b.shot(path.join(SHOTS, '07-arrived.png'));

  // enemy zone
  const zn = await E(`
    const z = g.u.zones.find(z => z.state === 'hostile');
    const dir = { x: 0.6, y: 0.2, z: 0.77 }; const r = z.radius * 0.9;
    g.ship.pos = { x: z.pos.x + dir.x * r, y: z.pos.y + dir.y * r, z: z.pos.z + dir.z * r };
    g.ship.vel.set(0,0,0); g.ship.cruise = false;
    return { id: z.id, name: z.name };`);
  await step(4000, 3);
  const zs = await E(`return { zone: g.zone && g.zone.id, n: g.enemies.length, caps: g.enemies.filter(e => e.kind === 'capital').length };`);
  check('entering a zone spawns capital ships and red guys', zs.zone === zn.id && zs.caps >= 1 && zs.n > zs.caps, JSON.stringify(zs));
  const jam = await E(`g.toggleCruise(); const c = g.ship.cruise; return c;`);
  check('cruise is jammed in a zone', jam === false);
  await E(`const cap = g.enemies.find(e => e.kind === 'capital'); const to = new (g.ship.vel.constructor)(cap.pos.x - g.ship.pos.x, cap.pos.y - g.ship.pos.y, cap.pos.z - g.ship.pos.z).normalize(); g.ship.q.setFromUnitVectors(new (g.ship.vel.constructor)(0,0,-1), to); return 1;`);
  await step(9000, 3);
  const beam = await E(`return g.enemies.filter(e => e.kind === 'capital').map(e => e.beam.state + ':' + e.beam.cd.toFixed(1));`);
  await b.shot(path.join(SHOTS, '08-combat.png'));
  check('capital ships run their beam cycle', beam.length > 0, beam.join(' '));
  // drone and bombs
  const dr = await E(`g.standUp(); g.settings.drone = true; g.launchDrone(); const m = g.mode; g.ship.bombs = 4; g.dropBomb(); return { m, bombs: g.bombs.length };`);
  check('drone launches and drops a bomb', dr.m === 'drone' && dr.bombs === 1, JSON.stringify(dr));
  await step(1200, 2);
  await b.shot(path.join(SHOTS, '09-drone.png'));
  const dr2 = await E(`g.recallDrone(); const m = g.mode; g.settings.drone = false; g.launchDrone(); const m2 = g.mode; g.settings.drone = true; return { m, m2 };`);
  check('drone recalls, and the setting switches it off', dr2.m === 'foot' && dr2.m2 === 'foot', JSON.stringify(dr2));
  // clear the zone
  const cl = await E(`const c0 = g.state.credits; for (const e of g.enemies) if (!e.dead) g.hurt(e, 1e6, e.pos); g.updateZones(0.016); g.updateZones(0.016); return { lib: g.state.liberated.includes(${JSON.stringify(zn.id)}), dc: g.state.credits - c0, zone: !!g.zone };`);
  check('clearing a zone liberates the sector and pays', cl.lib && cl.dc > 0 && !cl.zone, JSON.stringify(cl));

  // --- squadrons: tiers, waves, formation slots, leader loss, arcs, carriers
  // Every tier, driven through the real enterZone path. This asserts the ladder
  // itself, not which tiers today's zone table happens to roll.
  const ladder = await E(`
    const z = g.u.zones.find(x => x.state === 'hostile');
    const t0 = z.tier, out = [];
    for (let t = 1; t <= 5; t++) {
      g.clearCombat();
      z.tier = t; z.state = 'hostile';
      const dir = { x: 0.6, y: 0.2, z: 0.77 }, r = z.radius * 0.9;
      g.ship.pos = { x: z.pos.x + dir.x * r, y: z.pos.y + dir.y * r, z: z.pos.z + dir.z * r };
      g.ship.vel.set(0, 0, 0); g.ship.cruise = false; g.ship.warp = null;
      g.enterZone(z);
      for (let i = 0; i < 300; i++) g.fleet.update(1 / 60, g.targetPoint());
      out.push({
        t,
        caps: g.enemies.filter(e => e.kind === 'capital' && !e.dead).length,
        imps: g.enemies.filter(e => e.kind === 'imp' && !e.dead).length,
        wings: g.fleet.squads.filter(s => s.kind === 'wing' && s.members.some(m => !m.dead)).length,
        screens: g.fleet.squads.filter(s => s.kind === 'screen' && s.members.some(m => !m.dead)).length,
      });
    }
    z.tier = t0; z.state = 'hostile';
    g.clearCombat();
    return { out, shape: out.map(o => o.caps + '/' + o.imps).join(' '), rolled: [...new Set(g.u.zones.map(x => x.tier))].sort() };`);
  check('every tier from 1 to 5 fields its own order of battle, each heavier than the last',
    ladder.shape === '1/3 1/5 2/6 3/8 4/12' && ladder.out[4].screens === 4, JSON.stringify(ladder));
  const tt = await E(`return g.fleet.tiers.map(t => t.caps.length + '/' + (t.screen * t.caps.length + t.waves.reduce((a, w) => a + w[1], 0)));`);
  check('the tier ladder keeps the old red-guy totals and adds a fifth', tt.join(' ') === '1/3 1/5 2/6 3/8 4/12', tt.join(' '));

  const hull0 = await E('return g.ship.hull;');
  const t5 = await E(`
    const z = g.u.zones.find(z => z.state === 'hostile' && z.id !== ${JSON.stringify(zn.id)});
    if (!z) return { skip: true };
    g.clearCombat();            // the running loop may have re-entered a zone since the last check
    z.tier = 5; z.state = 'hostile';
    const dir = { x: 0.6, y: 0.2, z: 0.77 }, r = z.radius * 0.9;
    g.ship.pos = { x: z.pos.x + dir.x * r, y: z.pos.y + dir.y * r, z: z.pos.z + dir.z * r };
    g.ship.vel.set(0, 0, 0); g.ship.cruise = false; g.ship.warp = null; g.ship.hull = 1e6;
    g.enterZone(z);
    return {
      id: z.id,
      caps: g.enemies.filter(e => e.kind === 'capital' && !e.dead).length,
      carriers: g.enemies.filter(e => e.sub === 'carrier' && !e.dead).length,
      imps: g.enemies.filter(e => e.kind === 'imp' && !e.dead).length,
      screens: g.fleet.squads.filter(s => s.kind === 'screen').length,
      queued: g.fleet.queue.length, pending: g.fleet.pending(),
    };`);
  check('a tier 5 zone fields four capitals behind escort screens, later waves held back',
    !t5.skip && t5.caps === 4 && t5.carriers === 2 && t5.screens === 4 && t5.imps === 8 && t5.queued === 2 && t5.pending, JSON.stringify(t5));
  const wv = await E(`
    const live = () => g.enemies.filter(e => e.kind === 'imp' && !e.dead).length;
    const seen = [live()];
    for (let i = 0; i < 360; i++) { g.updateCombat(1 / 60); if (i === 119 || i === 239) seen.push(live()); }
    seen.push(live());
    return { seen, pending: g.fleet.pending(), squads: g.fleet.squads.length };`);
  check('the waves arrive in order and finish the order of battle',
    wv.seen[0] === 8 && wv.seen[wv.seen.length - 1] === 12 && wv.seen[1] >= wv.seen[0] && !wv.pending, JSON.stringify(wv));
  const sqs = await E(`
    const wings = g.fleet.squads.filter(s => s.kind === 'wing');
    return {
      wings: wings.length,
      oneLeader: wings.every(s => s.members.filter(m => m === s.leader).length === 1),
      shared: g.fleet.squads.every(s => s.members.every(m => m.squad === s || m.docked)),
      inSquad: g.enemies.filter(e => e.kind === 'imp' && !e.dead && e.squad).length,
      imps: g.enemies.filter(e => e.kind === 'imp' && !e.dead).length,
      named: [...new Set(g.enemies.filter(e => e.kind === 'imp' && !e.dead).map(e => e.name))].sort(),
    };`);
  check('every red guy flies in a squad, with one leader and one shared state',
    sqs.wings > 0 && sqs.oneLeader && sqs.shared && sqs.inSquad === sqs.imps && sqs.named.length > 1, JSON.stringify(sqs));

  const slots = await E(`
    const V3 = g.ship.vel.constructor, p = g.ship.pos;
    const w = g.fleet.wing(5, 'grunt', 'v', p.x + 2600, p.y + 400, p.z + 2600);
    w.state = 'formup'; w.stateT = 0;
    w.hold = { x: w.leader.pos.x, y: w.leader.pos.y, z: w.leader.pos.z };
    g.fleet.tp = g.targetPoint();
    for (let i = 0; i < 900; i++) for (const m of w.members) if (!m.dead) g.fleet.steer(m, 1 / 60);
    const off = w.members.filter(m => !m.dead && m !== w.leader).map(m => {
      const s = w.slots[m.slot], q = new V3(s[0], s[1], s[2]).applyQuaternion(w.leader.q);
      return Math.hypot(m.pos.x - w.leader.pos.x - q.x, m.pos.y - w.leader.pos.y - q.y, m.pos.z - w.leader.pos.z - q.z);
    });
    const gaps = w.members.map(a => Math.min(...w.members.filter(b => b !== a).map(b => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z))));
    return { shape: w.formation, n: w.members.length, max: Math.max(...off), minGap: Math.min(...gaps), formed: g.fleet.formed(w) };`);
  check('a five-strong V settles into its slots without stacking up',
    slots.n === 5 && slots.formed && slots.max < 90 && slots.minGap > 30, JSON.stringify(slots));

  const lead = await E(`
    const w = g.fleet.squads.find(s => s.kind === 'wing' && s.members.filter(m => !m.dead).length >= 2 && s.state !== 'retreat');
    if (!w) return { skip: true };
    const was = w.leader;
    g.hurt(was, 1e6, was.pos);
    return { promoted: !!w.leader && w.leader !== was && !w.leader.dead, state: w.state, slot0: w.leader ? w.leader.slot : -1, left: w.members.length };`);
  check('killing a wing leader promotes the next one and reforms or retreats',
    !lead.skip && lead.promoted && (lead.state === 'regroup' || lead.state === 'retreat'), JSON.stringify(lead));

  const arc = await E(`
    const V3 = g.ship.vel.constructor;
    const cap = g.enemies.find(e => e.kind === 'capital' && !e.dead);
    if (!cap) return { skip: true };
    const bow = new V3(0, 0, -1).applyQuaternion(cap.q);
    const inBow = cap.turrets.filter(t => g.fleet.inArc(t, cap, bow)).length;
    g.ship.pos = { x: cap.pos.x + bow.x * 3000, y: cap.pos.y + bow.y * 3000, z: cap.pos.z + bow.z * 3000 };
    g.ship.vel.set(0, 0, 0);
    const to = new V3(g.ship.pos.x - cap.pos.x, g.ship.pos.y - cap.pos.y, g.ship.pos.z - cap.pos.z).normalize();
    const blind = cap.turrets.filter(t => !g.fleet.inArc(t, cap, to));
    for (const t of cap.turrets) t.cd = 0;
    for (let i = 0; i < 3; i++) g.updateCombat(1 / 60);
    return { total: cap.turrets.length, inBow, blind: blind.length, blindHeld: blind.filter(t => t.cd <= 0).length, fired: cap.turrets.filter(t => t.cd > 0).length };`);
  check('a capital only brings the guns that bear, the blind quarter holds fire',
    !arc.skip && arc.blind > 0 && arc.blindHeld === arc.blind && arc.fired > 0 && arc.inBow < arc.total, JSON.stringify(arc));

  const scr = await E(`
    const cap = g.enemies.find(e => e.kind === 'capital' && !e.dead && e.screenSquad && e.screenSquad.members.some(m => !m.dead));
    if (!cap) return { skip: true };
    const s = cap.screenSquad;
    const far = { x: cap.pos.x + 3200, y: cap.pos.y, z: cap.pos.z };
    g.ship.pos = { ...far }; g.ship.vel.set(0, 0, 0);
    s.state = 'approach'; s.stateT = 0; s.peeled = false;
    g.fleet.tp = g.targetPoint();
    g.fleet.think(s, 1 / 60, g.fleet.tp);
    const atRange = s.state;
    for (let i = 0; i < 900; i++) for (const m of s.members) if (!m.dead) g.fleet.steer(m, 1 / 60);
    const ring = s.members.filter(m => !m.dead).map(m => Math.hypot(m.pos.x - cap.pos.x, m.pos.y - cap.pos.y, m.pos.z - cap.pos.z));
    g.ship.pos = { x: cap.pos.x + s.radius * 0.4, y: cap.pos.y, z: cap.pos.z };
    g.fleet.think(s, 1 / 60, g.targetPoint());
    const dived = s.state;
    g.ship.pos = { ...far };
    s.stateT = 5;
    g.fleet.think(s, 1 / 60, g.targetPoint());
    return { radius: Math.round(s.radius), atRange, dived, backOn: s.state, ringErr: Math.round(Math.max(...ring.map(d => Math.abs(d - s.radius)))) };`);
  check('an escort screen rings the hull at range and peels off when you dive it',
    !scr.skip && scr.atRange === 'approach' && scr.dived === 'attack' && scr.backOn === 'approach' && scr.ringErr < 60, JSON.stringify(scr));

  const esc = await E(`
    const cap = g.enemies.find(e => e.kind === 'capital' && e.sub !== 'carrier' && !e.dead && e.screenSquad && e.screenSquad.members.some(m => !m.dead));
    if (!cap) return { skip: true };
    const s = cap.screenSquad, n = s.members.filter(m => !m.dead).length;
    g.hurt(cap, 1e6, cap.pos);
    return { n, kind: s.kind, state: s.state, impLeader: !!s.leader && s.leader.kind === 'imp', left: s.members.length };`);
  check('killing a capital leaves its escort as a wing that re-forms without it',
    !esc.skip && esc.kind === 'wing' && esc.state === 'regroup' && esc.impLeader && esc.left === esc.n, JSON.stringify(esc));

  const ret = await E(`
    const w = g.fleet.squads.find(s => s.kind === 'wing' && s.members.some(m => !m.dead));
    if (!w) return { skip: true };
    const m = w.members.find(x => !x.dead);
    w.state = 'retreat'; w.stateT = 0;
    const tp = g.targetPoint();
    g.fleet.tp = tp;
    m.pos.x = tp.x + 400; m.pos.y = tp.y; m.pos.z = tp.z; m.vel.set(0, 0, 0);
    const d0 = Math.hypot(m.pos.x - tp.x, m.pos.y - tp.y, m.pos.z - tp.z);
    for (let i = 0; i < 3000; i++) g.fleet.steer(m, 1 / 60);
    const d1 = Math.hypot(m.pos.x - tp.x, m.pos.y - tp.y, m.pos.z - tp.z);
    for (let i = 0; i < 600; i++) g.fleet.steer(m, 1 / 60);
    const d2 = Math.hypot(m.pos.x - tp.x, m.pos.y - tp.y, m.pos.z - tp.z);
    return { d0: Math.round(d0), d1: Math.round(d1), d2: Math.round(d2), speed: +m.vel.length().toFixed(1) };`);
  check('a broken wing runs, then stops running, so a slow hull can still catch it',
    !ret.skip && ret.d1 > ret.d0 && ret.d1 > 5500 && ret.d2 < 7500 && ret.speed < 20, JSON.stringify(ret));

  const cv = await E(`
    const V3 = g.ship.vel.constructor;
    const cap = g.enemies.find(e => e.sub === 'carrier' && !e.dead);
    if (!cap) return { skip: true };
    for (const e of g.enemies) if (e.kind === 'imp' && !e.dead) { e.dead = true; g.fxRoot.remove(e.obj.group); }
    cap.bay = null;
    g.fleet.carrier(cap, 9);
    const sq = g.fleet.squads[g.fleet.squads.length - 1];
    const bp = g.fleet.bayPoint(new V3(), cap);
    const out = cap.bay.out.length, ready = cap.bay.ready;
    const atBay = sq.members.every(f => Math.hypot(f.pos.x - bp.x, f.pos.y - bp.y, f.pos.z - bp.z) < 400);
    sq.state = 'recover';
    g.fleet.tp = g.targetPoint();
    for (let i = 0; i < 600 && cap.bay.out.length; i++) for (const f of sq.members) if (!f.dead) g.fleet.steer(f, 1 / 60);
    return { out, ready, atBay, launched: cap.bay.launched, recovered: cap.bay.recovered, left: cap.bay.out.length, readyNow: cap.bay.ready };`);
  check('a carrier drops fighters out of its hull and takes them back aboard',
    !cv.skip && cv.out === 2 && cv.ready === 2 && cv.atBay && cv.recovered === 2 && cv.left === 0 && cv.readyNow === 4, JSON.stringify(cv));

  const hold = await E(`
    const z = g.zone;
    for (const e of g.enemies) if (!e.dead) g.hurt(e, 1e6, e.pos);
    g.fleet.queue.push({ t: 1e9, fn: () => {} });
    g.updateZones(0.016);
    const held = !!g.zone;
    g.fleet.queue.length = 0;
    g.updateZones(0.016);
    return { held, cleared: !g.zone };`);
  check('a zone is not called clear while a wave is still on its way', hold.held && hold.cleared, JSON.stringify(hold));
  await E(`g.clearCombat(); g.ship.hull = ${hull0}; g.ship.vel.set(0, 0, 0); return 1;`);

  // hull breach, EVA, re-entry
  const br = await E(`
    const it = g.interior.interact.find(i => i.id === 'breach');
    g.setMode('foot'); g.player.x = it.pos.x; g.player.z = it.pos.z; g.player.y = 0;
    g.pullBreach(); g.pullBreach(); return !!g.breach;`);
  check('breach lever opens the hull on the second pull', br);
  await step(3000, 2);
  const ev = await E(`return { mode: g.mode, hole: g.exterior.hole && g.exterior.hole.mesh ? g.exterior.hole.mesh.visible : null };`);
  check('you get pulled out into space', ev.mode === 'eva', JSON.stringify(ev));
  await E(`g.eva.yaw += Math.PI; return 1;`);
  await step(300, 1);
  await b.shot(path.join(SHOTS, '10-eva.png'));
  const re = await E(`g.eva.rel.copy(g.exterior.hole.pos.clone().applyQuaternion(g.ship.q)); const near = g.evaNearHole(); g.interact(); return { near, mode: g.mode, panel: g.interior.breach.panel.visible };`);
  check('climbing back in seals the hole', re.near && re.mode === 'foot' && re.panel, JSON.stringify(re));

  // stations: refuel, wrong fuel
  const st = await E(`
    const sol = g.u.sol; g.ship.pos = { x: sol.station.pos.x + 400, y: sol.station.pos.y, z: sol.station.pos.z + 400 };
    g.setMode('helm'); g.ship.vel.set(0,0,0); g.ship.fuel = 10; g.state.credits = 5000;
    for (let i = 0; i < 12; i++) g.u.update(g.ship.pos, g.t, 0.016);
    const body = g.dockable(); if (!body) return { body: false };
    g.state.codex = g.state.codex.filter((id) => id !== 'sbg' && id !== 'fuelracket');
    const said = []; const orig = g.ui.toast.bind(g.ui); g.ui.toast = (t) => { said.push(t); orig(t); };
    g.tryDock(); const open = g.ui.anyOpen();
    const m1 = g.refuel(body); const f1 = g.ship.fuel;
    const m2 = g.refuel({ station: { fuelTypes: ['NONE'] } });
    g.ui.toast = orig;
    g.ui.closeAll();
    return { body: true, open, m1, f1, m2, said,
      sbg: g.state.codex.includes('sbg'), fuelracket: g.state.codex.includes('fuelracket') };`);
  check('docking opens the station', st.body && st.open, JSON.stringify(st).slice(0, 160));
  check('refuel fills the tank', st.f1 > 10, st.m1);
  check('a pump for another fuel type refuses', /does not serve/.test(st.m2 || ''), st.m2);
  check('the refusal carries a quoted Spiral Bound Galactic announcer line', /"[^"]{20,}"$/.test(st.m2 || ''), st.m2);
  check('a refused pump unlocks The Fuel Racket in the codex', st.fuelracket === true, JSON.stringify(st.fuelracket));
  check('docking is welcomed by Spiral Bound Galactic and unlocks its codex entry',
    st.sbg === true && (st.said || []).some((t) => /A cheerful voice: "/.test(t)), JSON.stringify(st.said || []).slice(0, 200));
  // the announcer is a recorded loop: four lines, in order, then round again
  const ann = await E(`
    const out = []; for (let i = 0; i < 5; i++) out.push(g.refuel({ station: { fuelTypes: ['NONE'] } }));
    return out.map((m) => (m.match(/"([^"]+)"/) || [])[1] || '');`);
  check('the announcer cycles four lines in order', new Set(ann.slice(0, 4)).size === 4 && ann[4] === ann[0], JSON.stringify(ann).slice(0, 200));

  // shop: buy the cruiser and walk its rooms
  const sp = await E(`
    g.state.credits = 60000; const m = g.buyShip('cruiser'); g.setMode('foot');
    return { m, type: g.ship.type, ids: g.interior.interact.map(i => i.id) };`);
  check('buying the cruise liner switches ship', sp.type === 'cruiser', sp.m);
  check('cruiser has bathrooms, kitchen and dorms', ['toilet', 'shower', 'stove', 'fridge', 'bed', 'desk'].every((i) => sp.ids.includes(i)), sp.ids.join(','));
  for (const room of ['helm', 'stove', 'bed', 'shower']) {
    await E(`const it = g.interior.interact.find(i => i.id === '${room}'); g.player.x = it.pos.x; g.player.z = it.pos.z + 1.2; g.player.yaw = 0; g.player.pitch = -0.15; g.collideFoot(); return 1;`);
    await b.wait(400);
    await b.shot(path.join(SHOTS, `11-cruiser-${room}.png`));
  }
  const sw = await E(`const m = g.switchShip('scout'); return { m, type: g.ship.type };`);
  // every hull in the roster builds, flies and can be walked
  const roster = await E(`
    const ids = ['eraser', 'tape', 'witeout', 'paperclip', 'gelpen', 'compass', 'stickynotes', 'stapler', 'gluestick', 'locker'];
    const bad = [];
    for (const id of ids) {
      g.state.credits = 99999; g.buyShip(id); g.setMode('foot');
      if (g.ship.type !== id || !g.interior.interact.some(i => i.id === 'helm')) bad.push(id);
    }
    g.switchShip('scout'); g.setMode('foot');
    return bad;`);
  check('every new hull can be bought, flown and walked', roster.length === 0, roster.join(',') || 'all 10 ok');

  // ---------- the roster: order, spread, and every deck of every hull ----------
  const ORDER = ['scout', 'eraser', 'racer', 'tape', 'witeout', 'fighter', 'paperclip', 'hauler', 'gelpen',
    'compass', 'stickynotes', 'stapler', 'gluestick', 'cruiser', 'locker'];
  const shopOrder = await E(`const S = await import('./js/ships.js'); return Object.keys(S.SHIPS);`);
  check('the shipyard lists fifteen hulls in the roster order',
    shopOrder.length === 15 && ORDER.every((id, i) => shopOrder[i] === id), shopOrder.join(','));

  const spread = await E(`const S = await import('./js/ships.js');
    const sp = Object.values(S.SHIPS).map(x => x.speed);
    return { max: Math.max(...sp), min: Math.min(...sp), fast: sp.filter(v => v > 420).length };`);
  check('the roster has a real speed spread and several interceptors',
    spread.max / spread.min > 3.5 && spread.fast >= 3,
    `${spread.min}-${spread.max} (${(spread.max / spread.min).toFixed(1)}x), ${spread.fast} over 420`);

  // buildInterior/buildExterior/walkCheck for every hull, every deck
  const walk = await E(`const S = await import('./js/ships.js');
    const bad = [];
    for (const id of Object.keys(S.SHIPS)) {
      try {
        const I = S.buildInterior(id), X = S.buildExterior(id);
        if (!(X.radius > 0) || !X.guns.length || !X.engines.length) bad.push(id + ': exterior');
        for (const [i, d] of (I.decks || [I]).entries()) {
          const w = S.walkCheck(d);
          if (!w.ok) bad.push(id + ' deck ' + i + ': ' + w.problems.join('; '));
        }
      } catch (e) { bad.push(id + ' threw: ' + e.message); }
    }
    return bad;`);
  check('every hull builds and every deck of it is walkable', walk.length === 0, walk.slice(0, 3).join(' | ') || '15 hulls ok');

  // ---------- the Filing Cabinet: three decks, one shaft, one elevator ----------
  const tall = await E(`const S = await import('./js/ships.js');
    const L = S.SHIPS.locker, I = S.buildInterior('locker'), X = S.buildExterior('locker');
    const box = new (g.ship.vel.constructor.prototype.constructor === undefined ? Object : Object)();
    // the exterior really is taller than it is wide or long
    let hi = 0, wide = 0, long = 0;
    X.group.updateMatrixWorld(true);
    X.group.traverse((o) => {
      if (!o.isMesh || !o.geometry.attributes) return;
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        hi = Math.max(hi, p.getY(i)); wide = Math.max(wide, Math.abs(p.getX(i))); long = Math.max(long, Math.abs(p.getZ(i)));
      }
    });
    // the elevator landing must be clear of every collider on every deck
    const R = 0.3, land = { x: 0, z: 2.8 };
    const clear = I.decks.map((d) => {
      let best = Infinity;
      for (const c of d.colliders) {
        const dx = land.x - Math.min(Math.max(land.x, c.x0), c.x1), dz = land.z - Math.min(Math.max(land.z, c.z0), c.z1);
        best = Math.min(best, Math.hypot(dx, dz));
      }
      return +best.toFixed(3);
    });
    return {
      price: L.price, tank: L.tank, decks: I.decks.length, pitch: I.deckPitch,
      h: +hi.toFixed(1), w: +(wide * 2).toFixed(1), l: +(long * 2).toFixed(1),
      clear, minClear: Math.min(...clear),
      lifts: I.decks.map((d) => d.interact.filter((i) => i.id === 'elevator').length),
    };`);
  check('the Filing Cabinet is taller than it is wide or long',
    tall.h > tall.w && tall.h > tall.l && tall.h > 10, `${tall.w} wide x ${tall.l} long x ${tall.h} tall`);
  check('it has three decks 2.9 m apart, each with a call plate',
    tall.decks === 3 && tall.pitch === 2.9 && tall.lifts.every((n) => n === 1), JSON.stringify({ decks: tall.decks, pitch: tall.pitch, lifts: tall.lifts }));
  check('the elevator landing is clear of colliders at the same spot on all three decks',
    tall.minClear > 0.3, `clearance ${tall.clear.join(' / ')} m (player radius 0.3)`);

  const lift = await E(`g.state.credits = 99999; g.buyShip('locker'); g.setMode('foot');
    g.player.x = 0; g.player.z = 2.8; g.player.y = 0;
    const onBridge = g.nearestInteract() && g.nearestInteract().id;
    const hasHelm = (d) => g.interior.decks[d].interact.some(i => i.id === 'helm');
    g.rideElevator();
    const riding = !!g.ship.elevator;
    const mid = [];
    for (let i = 0; i < 400 && g.ship.elevator; i++) { g.update(0.02); if (i === 30) mid.push(+g.ship.deckY.toFixed(2)); }
    const one = { deck: g.ship.deck, y: +g.ship.deckY.toFixed(2), bed: g.curDeck().interact.some(i => i.id === 'bed'), helm0: hasHelm(0), helm1: hasHelm(1) };
    g.rideElevator(); for (let i = 0; i < 400 && g.ship.elevator; i++) g.update(0.02);
    const two = { deck: g.ship.deck, y: +g.ship.deckY.toFixed(2), drone: g.curDeck().interact.some(i => i.id === 'drone') };
    g.rideElevator(); for (let i = 0; i < 600 && g.ship.elevator; i++) g.update(0.02);
    const back = { deck: g.ship.deck, y: +g.ship.deckY.toFixed(2), helm: g.curDeck().interact.some(i => i.id === 'helm') };
    g.standUp();
    return { onBridge, riding, mid, one, two, back, afterStandUp: g.ship.deck };`);
  check('the elevator carries you between the three decks',
    lift.riding && lift.mid[0] > 0 && lift.mid[0] < 2.9 && lift.one.deck === 1 && lift.one.y === 2.9
    && lift.two.deck === 2 && lift.two.y === 5.8 && lift.back.deck === 0 && lift.back.y === 0 && lift.afterStandUp === 0,
    JSON.stringify(lift));
  check('each deck has its own interactables and the camera rides with it',
    lift.onBridge === 'elevator' && lift.one.bed && lift.two.drone && lift.back.helm && lift.one.helm0 && !lift.one.helm1,
    JSON.stringify({ onBridge: lift.onBridge, bed: lift.one.bed, drone: lift.two.drone, helm: lift.back.helm }));

  // Walking around under way is already allowed, so the lift must not quietly
  // cut the engines or drop the course the way it used to.
  const liftFlies = await E(`g.state.credits = 99999; g.buyShip('locker'); g.setMode('helm');
    const sol = g.u.sol, mars = g.u.planetsOf(sol).find((p) => p.name === 'Mars');
    g.setCourse(g.u.target('planet', { sys: sol, planet: mars }));
    const had = !!g.ship.auto && g.ship.auto.target.name;
    g.setMode('foot'); g.player.x = 0; g.player.z = 2.8; g.player.y = 0;
    g.ship.throttle = 0.7; g.ship.cruise = false;
    g.rideElevator();
    const mid = { auto: !!g.ship.auto, throttle: g.ship.throttle };
    for (let i = 0; i < 400 && g.ship.elevator; i++) g.update(0.02);
    const after = { deck: g.ship.deck, auto: g.ship.auto ? g.ship.auto.target.name : null };
    g.ship.auto = null; g.ship.throttle = 0; g.ship.vel.set(0, 0, 0); g.ship.cs = 0;
    g.standUp();
    return { had, mid, after };`);
  check('taking the lift does not cut the engines or drop the course',
    liftFlies.had === 'Mars' && liftFlies.mid.auto && liftFlies.mid.throttle === 0.7 && liftFlies.after.deck === 1
    && liftFlies.after.auto === 'Mars', JSON.stringify(liftFlies));

  // ---------- abilities: one key, eight hulls, real effects ----------
  const ab = async (id, body) => E(`g.state.credits = 99999; g.buyShip('${id}'); g.setMode('helm');
    g.clearCombat(); g.ship.abilityCd = 0; g.ship.cloak = null; g.ship.tractor = null;
    g.ship.burnT = 0; g.ship.ramT = 0; g.ship.blinkIframe = 0; g.ship.warp = null;
    ${body}`);

  const burn = await ab('eraser', `g.ship.fuel = 50; g.ship.throttle = 1; g.ship.vel.set(0,0,0); g.ship.cs = 0;
    for (let i = 0; i < 120; i++) g.update(0.05);
    const base = g.ship.vel.length();
    const f0 = g.ship.fuel; g.useAbility();
    const r = { burnT: +g.ship.burnT.toFixed(1), spent: +(f0 - g.ship.fuel).toFixed(1), cd: g.ship.abilityCd };
    g.useAbility(); r.blocked = g.ship.fuel === f0 - 8;
    for (let i = 0; i < 40; i++) g.update(0.05);
    r.base = Math.round(base); r.fast = Math.round(g.ship.vel.length());
    g.ship.burnT = 0; g.ship.throttle = 0; g.ship.abilityCd = 0; return r;`);
  check('afterburner: costs fuel, holds a cooldown and really goes faster',
    burn.burnT === 2.2 && burn.spent === 8 && burn.cd === 9 && burn.blocked && burn.fast > burn.base * 1.8,
    JSON.stringify(burn));

  const blink = await ab('tape', `g.ship.fuel = 50; g.ship.vel.set(0,0,0); g.ship.throttle = 0;
    const V = g.ship.vel.constructor, p0 = { ...g.ship.pos }, f = new V(0,0,-1).applyQuaternion(g.ship.q);
    const f0 = g.ship.fuel; g.useAbility();
    const dx = g.ship.pos.x - p0.x, dy = g.ship.pos.y - p0.y, dz = g.ship.pos.z - p0.z;
    const d = Math.hypot(dx, dy, dz);
    const r = { d: Math.round(d), along: +((dx*f.x + dy*f.y + dz*f.z) / (d || 1)).toFixed(3),
      spent: +(f0 - g.ship.fuel).toFixed(1), dnear: Math.round(g.u.ctx.dnear), iframe: g.ship.blinkIframe };
    // the shield has to be down for this to say anything about the iframe:
    // with it up the shield eats the 40 either way and the hull never moves
    g.ship.shield = 0;
    const h0 = g.ship.hull; g.damage(40, 'shot'); r.graced = g.ship.hull === h0;
    for (let i = 0; i < 20; i++) g.update(0.05);
    g.ship.shield = 0; g.ship.lastHit = performance.now();
    const h1 = g.ship.hull; g.damage(40, 'shot'); r.graceEnds = g.ship.hull < h1;
    r.tookFull = +(h1 - g.ship.hull).toFixed(1);
    g.ship.hull = g.stat('hull'); g.ship.abilityCd = 0; return r;`);
  check('blink: a real hop along the nose, clamped short of anything solid, with a moment of grace',
    blink.along > 0.99 && blink.d > 100 && blink.d <= Math.min(1400, Math.round(blink.dnear * 0.5)) + 1
    && blink.spent === 10 && blink.graced && blink.graceEnds && blink.tookFull === 40, JSON.stringify(blink));

  const cloak = await ab('witeout', `g.ship.fuel = 60; g.ship.vel.set(0,0,0);
    const far = g.spawnImp({ x: g.ship.pos.x + 1500, y: g.ship.pos.y, z: g.ship.pos.z });
    g.useAbility();
    const seen = { ...g.targetPoint() };
    g.ship.pos.x += 600;
    const stale = g.targetPoint();
    const r = { on: !!(g.ship.cloak && g.ship.cloak.active), frozen: Math.abs(stale.x - seen.x) < 1e-6 };
    const f0 = g.ship.fuel; for (let i = 0; i < 20; i++) g.update(0.05); r.drain = +(f0 - g.ship.fuel).toFixed(2);
    far.pos = { x: g.ship.pos.x + 400, y: g.ship.pos.y, z: g.ship.pos.z };
    r.tracksNear = Math.abs(g.targetPoint().x - g.ship.pos.x) < 1e-6;
    g.fire(0.016); r.firingDrops = !g.ship.cloak.active; r.cd = g.ship.abilityCd;
    g.clearCombat(); g.ship.cloak = null; g.ship.abilityCd = 0; return r;`);
  check('cloak: enemies past 900 u keep shooting at where you were, and firing drops it',
    cloak.on && cloak.frozen && cloak.tracksNear && cloak.firingDrops && cloak.drain > 1.0 && cloak.drain < 1.4 && cloak.cd === 20,
    JSON.stringify(cloak));

  const trac = await ab('paperclip', `g.ship.fuel = 80; g.ship.vel.set(0,0,0); g.ship.throttle = 0;
    const V = g.ship.vel.constructor, f = new V(0,0,-1).applyQuaternion(g.ship.q);
    const imp = g.spawnImp({ x: g.ship.pos.x + f.x*1500, y: g.ship.pos.y + f.y*1500, z: g.ship.pos.z + f.z*1500 });
    const D = () => Math.hypot(imp.pos.x-g.ship.pos.x, imp.pos.y-g.ship.pos.y, imp.pos.z-g.ship.pos.z);
    const d0 = D(); g.keys.add('KeyR'); const f0 = g.ship.fuel;
    let mono = true, prev = d0;
    for (let i = 0; i < 90; i++) { g.update(0.016); if (i % 10 === 9) { if (D() > prev) mono = false; prev = D(); } }
    const r = { d0: Math.round(d0), d1: Math.round(D()), closing: mono, locked: g.ship.tractor === imp,
      rate: +((f0 - g.ship.fuel) / (90 * 0.016)).toFixed(1) };
    g.keys.delete('KeyR'); g.update(0.016);
    // the release arms the full 4 s cooldown; the same frame's cooldown tick
    // then takes one dt back off it, so it lands just under 4, never above
    r.cd = +g.ship.abilityCd.toFixed(3);
    r.released = g.ship.tractor === null && r.cd > 4 - 0.02 && r.cd <= 4;
    g.clearCombat(); g.ship.abilityCd = 0; return r;`);
  check('tractor beam: holding R reels a red guy in and burns fuel while it holds',
    trac.locked && trac.closing && trac.d1 < trac.d0 * 0.7 && trac.rate > 2.5 && trac.rate < 3.5 && trac.released,
    JSON.stringify(trac));

  const ram = await ab('stapler', `g.ship.fuel = 80; g.ship.hull = g.stat('hull'); g.ship.vel.set(0, 0, -400);
    g.ship.shield = 0; g.ship.lastHit = performance.now();
    const imp = g.spawnImp({ x: g.ship.pos.x + 6, y: g.ship.pos.y, z: g.ship.pos.z });
    const hp0 = imp.hp, h0 = g.ship.hull;
    g.useAbility(); g.ramCheck(0.016);
    const r = { hurt: +(hp0 - imp.hp).toFixed(0), hullHeld: g.ship.hull === h0, ramT: +g.ship.ramT.toFixed(1), spent: 80 - g.ship.fuel };
    g.clearCombat(); g.ship.ramT = 0; g.ship.abilityCd = 0;
    // the same contact with the ram shield down costs the Stapler hull. The
    // ship's own shield has to be down too or it eats the 15 and the hull
    // never moves, which would prove nothing either way.
    const i2 = g.spawnImp({ x: g.ship.pos.x + 6, y: g.ship.pos.y, z: g.ship.pos.z });
    g.ship.hull = g.stat('hull'); g.ship.shield = 0; g.ship.lastHit = performance.now();
    g.ship.vel.set(0, 0, -400);
    g.ramCheck(0.016);
    r.bareHull = +(g.stat('hull') - g.ship.hull).toFixed(0);
    r.bareHurts = g.ship.hull < g.stat('hull');
    g.clearCombat();
    // and no other hull tests enemy contact at all
    const bad = [];
    for (const id of ['scout', 'fighter', 'cruiser', 'locker', 'gelpen']) {
      g.state.credits = 99999; g.buyShip(id); g.setMode('helm'); g.clearCombat();
      const e = g.spawnImp({ x: g.ship.pos.x + 6, y: g.ship.pos.y, z: g.ship.pos.z });
      const hp = e.hp; g.ship.hull = g.stat('hull'); g.ship.vel.set(0, 0, -400);
      g.ship.shield = 0; g.ship.lastHit = performance.now();
      g.ramCheck(0.016);
      if (e.hp !== hp || g.ship.hull !== g.stat('hull')) bad.push(id);
      g.clearCombat();
    }
    r.othersUntouched = bad;
    return r;`);
  check('ram shield: the Stapler hurts what it hits instead of itself',
    ram.hurt > 0 && ram.hullHeld && ram.ramT === 3 && ram.spent === 15 && ram.bareHurts && ram.bareHull === 15,
    JSON.stringify(ram));
  check('ship-against-enemy contact runs for the Stapler and for nothing else',
    ram.othersUntouched.length === 0, ram.othersUntouched.join(',') || 'scout, fighter, cruiser, locker, gelpen all unchanged');

  const dec = await ab('stickynotes', `g.ship.fuel = 60; g.ship.vel.set(0,0,0);
    const a = g.spawnImp({ x: g.ship.pos.x + 900, y: g.ship.pos.y, z: g.ship.pos.z });
    const b2 = g.spawnImp({ x: g.ship.pos.x - 900, y: g.ship.pos.y, z: g.ship.pos.z });
    const f0 = g.ship.fuel; g.useAbility();
    const r = { flares: g.decoys.length, spent: +(f0 - g.ship.fuel).toFixed(1), cd: g.ship.abilityCd, locked: [!!a.decoyLock, !!b2.decoyLock] };
    // while it holds a flare, the imp steers at the flare, not at the ship
    const lock = a.decoyLock;
    const at = { x: lock.pos.x - a.pos.x, y: lock.pos.y - a.pos.y, z: lock.pos.z - a.pos.z };
    const al = Math.hypot(at.x, at.y, at.z) || 1;
    g.update(0.05);
    const v = a.vel, vl = v.length() || 1e-9;
    r.chasingFlare = +((v.x*at.x + v.y*at.y + v.z*at.z) / (vl * al)).toFixed(2);
    for (let i = 0; i < 160; i++) g.update(0.05);
    r.expired = g.decoys.length === 0 && !(a.decoyT > 0) ;
    g.clearCombat(); g.ship.abilityCd = 0; return r;`);
  check('decoy flares: three go out, red guys chase one, and they burn out',
    dec.flares === 3 && dec.spent === 5 && dec.cd === 10 && dec.locked[0] && dec.locked[1] && dec.chasingFlare > 0.3 && dec.expired,
    JSON.stringify(dec));

  const nan = await ab('gluestick', `g.ship.fuel = 60; const max = g.stat('hull');
    g.ship.hull = max * 0.5; const h0 = g.ship.hull, f0 = g.ship.fuel;
    g.useAbility();
    const r = { gain: +(g.ship.hull - h0).toFixed(1), spent: +(f0 - g.ship.fuel).toFixed(1), cd: g.ship.abilityCd };
    const h1 = g.ship.hull, f1 = g.ship.fuel; g.useAbility();
    r.blocked = g.ship.hull === h1 && g.ship.fuel === f1;
    g.ship.hull = max; g.ship.abilityCd = 0; return r;`);
  check('repair nanites: +80 hull for 20 fuel, then a 25 s wait',
    nan.gain === 80 && nan.spent === 20 && nan.cd === 25 && nan.blocked, JSON.stringify(nan));

  const scoop = await ab('locker', `const star = g.u.ctx.bodies.find(x => x.kind === 'star');
    if (!star) return { skipped: 'no star in range' };
    g.ship.q.identity(); g.ship.throttle = 0; g.ship.cruise = false; g.ship.auto = null;
    const park = (k) => { g.ship.pos = { x: star.pos.x + star.r * k, y: star.pos.y, z: star.pos.z }; g.ship.vel.set(0,0,0); };
    // A real Cabinet holds this station on its thrusters; the check pins it so
    // the only thing moving fuel and hull is the scoop, not the star's pull
    // slamming the ship into the surface.
    const hold = (k, n) => { for (let i = 0; i < n; i++) { g.update(0.05); park(k); } };
    park(1.3); g.ship.fuel = 100; g.ship.hull = g.stat('hull');
    const f0 = g.ship.fuel, h0 = g.ship.hull;
    hold(1.3, 20);
    const r = { on: g.scooping, fuelUp: +(g.ship.fuel - f0).toFixed(2), hullDown: +(h0 - g.ship.hull).toFixed(2) };
    // shut the intake with R and nothing comes in
    g.useAbility(); r.shut = g.ship.scoopOn === false;
    const f1 = g.ship.fuel, h1 = g.ship.hull;
    hold(1.3, 20);
    r.shutStops = Math.abs(g.ship.fuel - f1) < 0.05 && Math.abs(g.ship.hull - h1) < 0.05;
    g.useAbility();
    // and out past the corona it stops too
    park(3); g.ship.fuel = 100; g.ship.hull = g.stat('hull');
    const f2 = g.ship.fuel, h2 = g.ship.hull;
    hold(3, 20);
    r.farStops = !g.scooping && g.ship.fuel <= f2 + 0.01 && g.ship.hull >= h2 - 0.01;
    g.ship.hull = g.stat('hull'); return r;`);
  check('fuel scoop: inside a corona the tank fills and the hull cooks, and R shuts the intake',
    scoop.skipped ? true : (scoop.on && scoop.fuelUp > 1.5 && scoop.hullDown > 0.7 && scoop.shut && scoop.shutStops && scoop.farStops),
    JSON.stringify(scoop));

  const readout = await E(`const out = {};
    for (const id of ['eraser', 'witeout', 'locker', 'scout']) {
      g.state.credits = 99999; g.buyShip(id); g.setMode('helm');
      g.ship.fuel = g.stat('tank'); g.ship.abilityCd = 0; g.ship.cloak = null;
      g.ui.prev = {}; g.ui.hud();
      out[id] = (document.getElementById('h-ability') || {}).textContent || '';
    }
    g.state.credits = 99999; g.buyShip('eraser'); g.setMode('helm'); g.ship.fuel = 2;
    g.ui.prev = {}; g.ui.hud();
    out.dry = document.getElementById('h-ability').textContent;
    g.switchShip('scout'); g.setMode('helm');
    return out;`);
  check('the HUD says which ability R fires and whether it is ready',
    /Afterburner/.test(readout.eraser) && /ready/.test(readout.eraser) && /Cloak/.test(readout.witeout)
    && /scoop/i.test(readout.locker) && readout.scout === '' && /no fuel/.test(readout.dry),
    JSON.stringify(readout));

  await E(`g.switchShip('scout'); g.setMode('foot'); g.ship.abilityCd = 0; return 1;`);

  // air, doors, carrying and the eject hatch
  const air = await E(`
    g.switchShip('scout'); g.setMode('foot');
    const max = g.stat('hull');
    g.ship.hull = max; g.ship.air = 90; g.breach = null;
    for (let i = 0; i < 20; i++) g.update(0.1);
    const sealed = g.ship.air;
    g.ship.hull = max * 0.4; g.ship.air = 90;
    for (let i = 0; i < 20; i++) g.update(0.1);
    const holed = g.ship.air;
    g.ship.hull = max; g.ship.air = 100;
    return { sealed, holed };`);
  check('air only drains when the hull is holed', air.sealed > 90 && air.holed < 90, JSON.stringify({ sealed: air.sealed.toFixed(1), holed: air.holed.toFixed(1) }));

  const rate = await E(`
    const out = {};
    for (const id of ['gelpen', 'cruiser']) {
      g.state.credits = 99999; g.buyShip(id); g.setMode('foot');
      const max = g.stat('hull');
      g.ship.hull = max * 0.4; g.ship.air = 100;
      for (let i = 0; i < 20; i++) g.update(0.1);
      out[id] = 100 - g.ship.air;
      g.ship.hull = max; g.ship.air = 100;
    }
    g.switchShip('scout'); g.setMode('foot');
    return out;`);
  check('a small ship loses its air faster than a big one', rate.gelpen > rate.cruiser, JSON.stringify(rate));

  const doors = await E(`
    g.setMode('foot');
    const d = (g.interior.doors || [])[0];
    if (!d) return { none: true };
    g.player.x = d.closed.x + 8; g.player.z = d.closed.z + 8;
    for (let i = 0; i < 20; i++) g.update(0.1);
    const shut = d.t;
    g.player.x = d.closed.x; g.player.z = d.closed.z + 0.8;
    for (let i = 0; i < 20; i++) g.update(0.1);
    return { shut, open: d.t, moved: Math.abs(d.mesh.position.x - d.closed.x) + Math.abs(d.mesh.position.z - d.closed.z) };`);
  check('doors open when you walk up and close behind you', doors.none ? true : (doors.shut < 0.1 && doors.open > 0.85 && doors.moved > 0.05), JSON.stringify(doors));

  const carry = await E(`
    g.setMode('foot');
    const p = (g.interior.props || [])[0];
    if (!p) return { none: true };
    g.player.x = p.mesh.position.x; g.player.z = p.mesh.position.z + 0.6; g.player.y = 0;
    const took = g.takeCarried();
    for (let i = 0; i < 10; i++) g.update(0.05);
    const held = g.carried === p && p.mesh.position.y > 0.8;
    g.dropCarried();
    return { took, held, dropped: g.carried === null };`);
  check('you can pick a thing up, carry it and put it down', carry.none ? true : (carry.took && carry.held && carry.dropped), JSON.stringify(carry));

  // A stacked hull moves the floor under you, so a carried thing has to land on
  // the deck you are standing on, and a thing on the bridge floor must not be
  // reachable from the deck above it.
  const carryDeck = await E(`
    g.state.credits = 99999; g.buyShip('locker'); g.setMode('foot');
    const p = (g.interior.props || [])[0];
    if (!p) return { none: true };
    g.player.x = p.mesh.position.x; g.player.z = p.mesh.position.z + 0.6; g.player.y = 0;
    const took = g.takeCarried();
    g.player.x = 0; g.player.z = 2.8;
    g.rideElevator();
    for (let i = 0; i < 400 && g.ship.elevator; i++) g.update(0.02);
    const onDeck = g.ship.deck, floor = g.ship.deckY;
    g.dropCarried();
    const landed = +p.mesh.position.y.toFixed(2);
    // now stand right over another bridge prop and try to take it through the floor
    // now put a bridge prop at table height directly under the player. At
    // 0.95 it is 1.95 m below this deck's floor, which the old flat 2.2 m
    // reach would have handed you straight through the ceiling.
    const q = (g.interior.props || []).find((x) => x !== p);
    let reachedThrough = false, foundY = null;
    if (q) {
      g.player.x = -2.0; g.player.z = -1.0; g.player.y = 0;
      q.mesh.position.set(-2.0, 0.95, -1.0);
      const n = g.nearestProp();
      foundY = n ? +n.mesh.position.y.toFixed(2) : null;
      // whatever is in reach has to be standing on this deck, not the one below
      reachedThrough = !!n && Math.abs(n.mesh.position.y - g.ship.deckY - g.player.y) > 1.45;
    }
    g.dropCarried();
    g.standUp(); g.switchShip('scout'); g.setMode('helm');
    return { took, onDeck, floor: +floor.toFixed(1), landed, reachedThrough, foundY, tried: !!q };`);
  check('a thing carried up the Filing Cabinet lands on that deck, and the deck below is out of reach',
    carryDeck.none ? true : (carryDeck.took && carryDeck.onDeck === 1 && carryDeck.landed > carryDeck.floor
      && carryDeck.landed < carryDeck.floor + 1 && carryDeck.tried && carryDeck.reachedThrough === false),
    JSON.stringify(carryDeck));

  const ej = await E(`
    g.switchShip('scout'); g.setMode('helm'); g.breach = null;
    g.ship.hatch = 'top'; g.eject();
    const outMode = g.mode, up = g.eva ? g.eva.rel.y : 0;
    g.climbIn();
    const back = g.mode;
    g.setMode('helm'); g.ship.hatch = 'bottom'; g.eject();
    const down = g.eva ? g.eva.rel.y : 0;
    g.climbIn();
    return { outMode, back, up, down };`);
  check('the seat button ejects through the top or the bottom hatch', ej.outMode === 'eva' && ej.back === 'foot' && ej.up > 0 && ej.down < 0, JSON.stringify(ej));

  // gravity: a planet pulls a drifting ship, and a black hole keeps it
  const grav = await E(`
    g.setMode('helm'); g.ship.throttle = 0; g.ship.cruise = false; g.ship.auto = null;
    const sol = g.u.sol; const planet = g.u.planetsOf(sol).find(p => p.name === 'Earth');
    const earth = g.u.target('planet', { sys: sol, planet });
    const p = earth.pos(g.t);
    // park two radii above the surface, at rest, and let go
    const r = planet.r || earth.arrive || 1500;
    g.ship.pos.x = p.x + r * 3; g.ship.pos.y = p.y; g.ship.pos.z = p.z; g.ship.vel.set(0, 0, 0);
    const d0 = Math.hypot(g.ship.pos.x - p.x, g.ship.pos.y - p.y, g.ship.pos.z - p.z);
    for (let i = 0; i < 60; i++) g.update(0.05);
    const p1 = earth.pos(g.t);
    const d1 = Math.hypot(g.ship.pos.x - p1.x, g.ship.pos.y - p1.y, g.ship.pos.z - p1.z);
    // The planet orbits, so a raw distance can grow while gravity is working.
    // What gravity does is give a ship at rest a velocity pointing at the body.
    const to = { x: p1.x - g.ship.pos.x, y: p1.y - g.ship.pos.y, z: p1.z - g.ship.pos.z };
    const tl = Math.hypot(to.x, to.y, to.z) || 1;
    const v = g.ship.vel, vl = v.length() || 1e-9;
    const aim = (v.x * to.x + v.y * to.y + v.z * to.z) / (vl * tl);
    return { d0, d1, speed: vl, aim, flag: g.grav && g.grav.kind, named: g.grav && g.grav.name };`);
  // aim is the cosine between the velocity gravity built up and the line to the
  // planet: above 0.995 nothing else in the system - the Sun above all - is
  // contributing more than a tenth of the planet's own pull here.
  check('gravity pulls a drifting ship toward a planet, and the planet is what wins there',
    grav.speed > 5 && grav.aim > 0.995 && grav.flag === 'planet' && grav.named === 'Earth',
    JSON.stringify({ ...grav, d0: Math.round(grav.d0), d1: Math.round(grav.d1), speed: Math.round(grav.speed), aim: +grav.aim.toFixed(4) }));

  // The other half of the same tuning: the Sun's well has to stop short of its
  // own planets, or no orbit anywhere in Sol is possible. Sol is r 20000 and
  // Earth orbits at 86000, so Earth sits 3.3 stellar radii above the surface -
  // outside GRAVITY.star.reach. Park a drifting ship out there, clear of every
  // body, and it must stay still.
  const starReach = await E(`
    g.setMode('helm'); g.clearCombat();
    g.ship.throttle = 0; g.ship.cruise = false; g.ship.auto = null;
    const sol = g.u.sol, c = sol.pos;
    const planet = g.u.planetsOf(sol).find(p => p.name === 'Earth');
    const orbit = (() => { const q = g.u.target('planet', { sys: sol, planet }).pos(g.t);
      return Math.hypot(q.x - c.x, q.y - c.y, q.z - c.z); })();
    // pick whichever direction at Earth's orbital radius is furthest from
    // everything, so this measures the star and nothing else
    const dirs = [[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0.577,0.577,0.577]];
    let best = null;
    for (const [x, y, z] of dirs) {
      const p = { x: c.x + x * orbit, y: c.y + y * orbit, z: c.z + z * orbit };
      let clear = Infinity;
      for (const b of g.u.ctx.bodies) {
        if (b.kind === 'star' || b.kind === 'sight') continue;
        const rr = b.r > 0 ? b.r : 0;
        clear = Math.min(clear, Math.hypot(b.pos.x - p.x, b.pos.y - p.y, b.pos.z - p.z) - rr);
      }
      if (!best || clear > best.clear) best = { p, clear };
    }
    g.ship.pos.x = best.p.x; g.ship.pos.y = best.p.y; g.ship.pos.z = best.p.z;
    g.ship.vel.set(0, 0, 0);
    for (let i = 0; i < 60; i++) g.update(0.05);
    return { radii: +((orbit - sol.star.r) / sol.star.r).toFixed(2), clear: Math.round(best.clear),
      speed: +g.ship.vel.length().toFixed(3), flag: g.grav && g.grav.kind };`);
  check("a star's pull stops short of its own planets' orbits",
    starReach.radii > 3 && starReach.clear > 20000 && starReach.speed < 0.01 && starReach.flag == null,
    JSON.stringify(starReach));

  // ... and it is still murder close in. A fifth of a radius above the surface
  // the star pulls 22/0.2^2 = 550 u/s squared; a boosted Filing Cabinet tops
  // out at 255 u/s, so its thrust is about 330, and it loses ground nose-out
  // with the throttle wide open.
  const starClose = await E(`
    g.state.credits = 99999; g.buyShip('locker'); g.setMode('helm'); g.clearCombat();
    const V = g.ship.vel.constructor, sol = g.u.sol, c = sol.pos, R = sol.star.r;
    g.ship.pos.x = c.x + R * 1.2; g.ship.pos.y = c.y; g.ship.pos.z = c.z;
    g.ship.vel.set(0, 0, 0); g.ship.cs = 0; g.ship.cruise = false; g.ship.auto = null;
    g.ship.scoopOn = false;                 // the scoop is not what is on trial
    // nose straight out along +x, which is straight away from the star
    g.ship.q.setFromUnitVectors(new V(0, 0, -1), new V(1, 0, 0));
    g.ship.throttle = 1; g.ship.boost = true; g.ship.fuel = g.stat('tank');
    const d0 = Math.hypot(g.ship.pos.x - c.x, g.ship.pos.y - c.y, g.ship.pos.z - c.z);
    for (let i = 0; i < 40; i++) g.update(0.05);
    const d1 = Math.hypot(g.ship.pos.x - c.x, g.ship.pos.y - c.y, g.ship.pos.z - c.z);
    const out = new V(1, 0, 0).dot(g.ship.vel);
    g.ship.throttle = 0; g.ship.boost = false; g.ship.scoopOn = true;
    g.switchShip('scout'); g.setMode('helm'); g.ship.vel.set(0, 0, 0);
    return { r: R, d0: Math.round(d0), d1: Math.round(d1), outward: Math.round(out), flag: g.grav && g.grav.kind };`);
  check('a star close up beats full throttle: the Filing Cabinet loses ground climbing out',
    starClose.d1 < starClose.d0 - 100 && starClose.outward < 0 && starClose.flag === 'star',
    JSON.stringify(starClose));

  const hole = await E(`
    const bh = g.u.ctx.bodies.find(b => b.kind === 'sight' && b.sight && b.sight.kind === 'blackhole')
      || (g.u.sights || []).find(x => x.kind === 'blackhole');
    if (!bh) return { skipped: 'no black hole in range' };
    const r = bh.r > 0 ? bh.r : bh.sight.R;
    const c = bh.pos;
    g.setMode('helm');
    g.ship.pos.x = c.x + r * 2.5; g.ship.pos.y = c.y; g.ship.pos.z = c.z; g.ship.vel.set(0, 0, 0);
    g.ship.throttle = 1; g.ship.boost = true;          // burn as hard as the ship can
    for (let i = 0; i < 80 && !g.ship.spaghetti; i++) g.update(0.05);
    const caught = !!g.ship.spaghetti;
    for (let i = 0; i < 80 && g.mode !== "dead"; i++) g.update(0.05);
    return { caught, mode: g.mode };`);
  check('a black hole takes the ship no matter the throttle', hole.skipped ? true : (hole.caught && hole.mode === 'dead'), JSON.stringify(hole));

  // motion blur: on from medium up, off on low, and it really reprojects
  const mb = await E(`
    g.setMode('helm');
    g.r.setQuality(1); const on = g.r.motionPass.enabled;
    g.r.setQuality(0.6); const off = g.r.motionPass.enabled;
    g.r.setQuality(1);
    g.r.render(1.0); const a = g.r.prevVP.elements.join(',');
    g.ship.q.set(0, 0.25, 0, 0.97).normalize();
    g.r.camera.quaternion.copy(g.ship.q); g.r.camera.updateMatrixWorld(true);
    g.r.render(1.02); const b = g.r.prevVP.elements.join(',');
    const hadPrev = g.r.hasPrev;
    g.setMode('foot');
    return { on, off, turned: a !== b, hadPrev, cutClears: !g.r.hasPrev };`);
  check('motion blur runs above low and follows the camera', mb.on && !mb.off && mb.turned && mb.hadPrev && mb.cutClears, JSON.stringify(mb));

  check('switching back to an owned ship works', sw.type === 'scout', sw.m);
  const eq = await E(`const m = g.buyEquip('laser'); return { m, lvl: g.state.equip.laser };`);
  check('outfitter upgrades apply', eq.lvl === 1, eq.m);

  // --- the story on screen: codex, ship flavour, credits -------------------
  // A black hole ate the ship two checks ago: put it back on its feet first,
  // or the loop re-kills it and an open death panel makes it ignore every key.
  const cx = await E(`
    g.respawn(); g.ui.close('crash'); g.ui.closeAll();
    const keep = g.state.codex.slice();          // put the real codex back afterwards
    g.state.codex = ['district', 'sbg'];
    g.ui.open('codex');
    const cards = [...document.getElementById('cx-body').children];
    const out = {
      n: cards.length,
      count: document.getElementById('cx-n').textContent,
      locked: cards.filter((c) => c.classList.contains('locked')).length,
      unlockedTitle: cards[0].querySelector('h4').textContent,
      lockedTitle: cards[1].querySelector('h4').textContent,
      lockedBody: cards[1].querySelector('p').textContent,
      first: cards[0].querySelector('p').textContent.slice(0, 40),
    };
    g.ui.close('codex');
    g.state.codex = keep;
    return out;`);
  check('the codex screen lists all twelve entries with the locked ones hidden',
    cx.n === 12 && cx.locked === 10 && cx.count === '2' && cx.unlockedTitle === '1. Doodle District' && cx.lockedTitle === '2. ???' && cx.lockedBody === 'Not found yet.',
    JSON.stringify(cx).slice(0, 260));
  await b.shot(path.join(SHOTS, '20-codex.png'));
  await E(`
    // closeAll deliberately leaves the death and crash panels up, and an open
    // overlay makes the game ignore every key: clear those two by hand.
    g.respawn(); g.ui.close('crash'); g.ui.closeAll();
    g.paused = false;
    if (g.media.isOpen) g.media.close();          // the player swallows every key while it is up
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    return 1;`);
  await b.key('y');
  await b.wait(150);
  const cy = await E(`
    const o = { open: g.ui.open_.has('codex'), mode: g.mode, paused: g.paused, media: g.media.isOpen, anyOpen: [...g.ui.open_], focus: document.activeElement && document.activeElement.tagName };
    g.ui.closeAll();
    return o;`);
  check('Y opens the codex at the helm', cy.open === true, JSON.stringify(cy));
  const chip = await E(`
    g.ui.open('map');
    document.querySelector('#m-chips [data-f="codex"]').click();
    const o = g.ui.open_.has('codex'), f = g.ui.mapFilter;
    g.ui.closeAll();
    return { o, f };`);
  check('the map codex chip opens the codex instead of filtering the map', chip.o === true && chip.f !== 'codex', JSON.stringify(chip));

  const shop = await E(`
    const { SHIPS } = await import('./js/ships.js');
    const ids = Object.keys(SHIPS);
    const missing = ids.filter((id) => !SHIPS[id].flavour);
    g.ui.renderStation({ kind: 'shipyard', name: 'Shipyard', body: {} });
    const html = document.getElementById('st-body').textContent;
    g.ui.stationData = null;
    const unshown = ids.filter((id) => !html.includes(SHIPS[id].flavour));
    return { n: ids.length, missing, unshown, witeout: SHIPS.witeout.name, witeoutId: SHIPS.witeout.id,
      sample: SHIPS.stapler.flavour, wite: JSON.stringify(SHIPS).includes('Wite') };`);
  check('all fifteen hulls carry their flavour line and the shop card shows it',
    shop.n === 15 && shop.missing.length === 0 && shop.unshown.length === 0 && shop.sample === 'Rams first, asks for the invoice later.',
    JSON.stringify({ missing: shop.missing, unshown: shop.unshown }));
  check('Wite-Out is now Correction Fluid, with the save-critical id unchanged',
    shop.witeout === 'Correction Fluid' && shop.witeoutId === 'witeout' && shop.wite === false, JSON.stringify(shop).slice(0, 160));

  const creds = await E(`g.ui.open('credits'); const t = document.getElementById('credits').textContent; g.ui.close('credits'); return t;`);
  check('the credits screen names Gev, Claude Opus 5.5, Doodle Shooter and the data sources',
    /made by Gev with Claude Opus 5\.5 \(Anthropic\)/.test(creds) && /Doodle Shooter/.test(creds) && /doodleshooter\.vercel\.app/.test(creds)
      && /three\.js/.test(creds) && /NASA Exoplanet Archive/.test(creds) && /OpenNGC \(CC BY-SA 4\.0\)/.test(creds) && /HYG/.test(creds) && /Wikipedia/.test(creds),
    creds.replace(/\s+/g, ' ').slice(0, 200));
  const foot = await E(`return document.querySelector('#title footer.credits').textContent;`);
  check('the title footer carries the same credit', /made by Gev with Claude Opus 5\.5 \(Anthropic\)/.test(foot) && /after Doodle Shooter/.test(foot), foot.slice(0, 160));

  // codex entries that unlock on where you are, driven by actually going there
  const place = await E(`
    const m31 = g.u.findGalaxy('Andromeda Galaxy');
    const far = g.u.galaxies.find((x) => x.group === 'NGC' || x.group === 'M' || x.group === 'NEAR');
    if (!m31 || !far) return { skipped: true };
    const home = { ...g.ship.pos };
    g.state.codex = g.state.codex.filter((id) => id !== 'coinflip' && id !== 'laniakea');
    const go = (p) => {
      g.setMode('helm'); g.zone = null; g.ship.warp = null; g.ship.auto = null; g.ship.cruise = false;
      g.ship.vel.set(0, 0, 0); g.ship.throttle = 0;
      g.ship.pos.x = p.x; g.ship.pos.y = p.y; g.ship.pos.z = p.z;
      for (let i = 0; i < 10; i++) g.update(0.05);
    };
    go(m31.pos);
    const coin = g.state.codex.includes('coinflip'), atM31 = g.u.ctx.galaxy && g.u.ctx.galaxy.name;
    go(far.pos);
    const lan = g.state.codex.includes('laniakea');
    go(home);
    g.clearCombat(); g.zone = null;
    return { coin, lan, atM31, far: far.name, group: far.group };`);
  check('reaching Andromeda and leaving the Local Group unlock their codex entries',
    place.skipped ? true : (place.coin && place.lan), JSON.stringify(place).slice(0, 200));

  // death and respawn, tow
  const dth = await E(`g.setMode('helm'); g.damage(1e6, 'shot'); const m = g.mode; g.respawn(); return { m, after: g.mode, hull: g.ship.hull, max: g.stat('hull') };`);
  check('dying and respawning', dth.m === 'dead' && dth.after === 'helm' && dth.hull === dth.max, JSON.stringify(dth));
  const tw = await E(`g.ship.fuel = 0; g.state.credits = 1000; const m = g.tow(); return { m, fuel: g.ship.fuel };`);
  check('tow gets you to a pump with fuel', tw.fuel >= 15, tw.m);

  // save, reload, continue
  const sv = await E(`g.state.credits = 12345; g.persist(); return g.state.credits;`);
  await b.goto(URL_);
  let r2 = false;
  for (let i = 0; i < 120 && !r2; i++) { r2 = await b.eval('!!(window.__dv && window.__dv.ready)'); if (!r2) await b.wait(500); }
  const ld = await E(`return { credits: g.state.credits, ship: g.state.ship };`);
  check('save survives a reload', ld.credits === sv, JSON.stringify(ld));
  // continuing a save is not a new game: no crawl, and the codex came back
  const cont = await E(`
    const before = g.state.codex.slice();
    g.launch();
    const active = g.ui.crawlActive;
    g.ui.skipCrawl();
    return { hasSave: !!g.save, fresh: g.freshStart, active, before };`);
  check('continuing an existing save plays no crawl', cont.hasSave && cont.fresh === false && cont.active !== true, JSON.stringify({ hasSave: cont.hasSave, fresh: cont.fresh, active: cont.active }));
  check('the codex survives a save and a reload', cont.before.includes('sbg') && cont.before.includes('fuelracket'), JSON.stringify(cont.before));

  // log off re-rolls zones
  const lo = await E(`const a = g.u.zones.map(z => z.id).join(); g.launch(); g.logOff(); const b2 = g.u.zones.map(z => z.id).join(); return { changed: a !== b2, mode: g.mode, lib: g.u.zones.some(z => g.state.liberated.includes(z.id)) };`);
  check('log off re-rolls the enemy zones', lo.changed && lo.mode === 'title' && !lo.lib, JSON.stringify(lo));
  // audio
  const au = await E(`const { audio } = await import('./js/audio.js'); audio.init(); for (const s of ['laser','explosion','alarm','flush','coin','warpIn','breach','seal']) audio.sfx(s); audio.mood('combat'); audio.mood('cruise'); return { tracks: audio.tracks.length, current: audio.current && audio.current.name };`);
  check('audio: hold music tracks and effects', au.tracks >= 3, JSON.stringify(au));
  const fps = await E('return g.fps;');
  check('frame rate sample (headless software GL)', fps > 3, `${fps.toFixed(1)} fps`);
} catch (e) {
  check('test run completed', false, e.message);
} finally {
  const errs = b.errors.filter((e) => !/favicon|DevTools/.test(e));
  check('no console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  await b.close();
  if (server) server.kill();
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
