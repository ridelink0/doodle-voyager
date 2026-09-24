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

  // launch at the helm
  await E('g.launch(); return g.mode;');
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

  // autopilot to Mars
  const ap = await E(`g.setMode('helm');
    const sol = g.u.sol; const mars = g.u.planetsOf(sol).find(p => p.name === 'Mars');
    const t = g.u.target('planet', { sys: sol, planet: mars });
    const d0 = Math.hypot(t.pos(g.t).x - g.ship.pos.x, t.pos(g.t).y - g.ship.pos.y, t.pos(g.t).z - g.ship.pos.z);
    g.setCourse(t); return d0;`);
  await step(4000, 4);
  const ap1 = await E(`const t = g.ship.auto ? g.ship.auto.target : g.navTarget; const p = t.pos(g.t); return { d: Math.hypot(p.x - g.ship.pos.x, p.y - g.ship.pos.y, p.z - g.ship.pos.z), auto: !!g.ship.auto, paused: g.paused, mode: g.mode, t: g.t, fuel: g.ship.fuel, open: [...g.ui.open_], media: g.media.isOpen, hidden: document.hidden };`);
  check('autopilot closes on Mars', ap1.d < ap, `${ap.toFixed(0)} -> ${ap1.d.toFixed(0)} ${JSON.stringify({ ...ap1, d: undefined })}`);
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
    g.tryDock(); const open = g.ui.anyOpen();
    const m1 = g.refuel(body); const f1 = g.ship.fuel;
    const m2 = g.refuel({ station: { fuelTypes: ['NONE'] } });
    g.ui.closeAll();
    return { body: true, open, m1, f1, m2 };`);
  check('docking opens the station', st.body && st.open, JSON.stringify(st).slice(0, 160));
  check('refuel fills the tank', st.f1 > 10, st.m1);
  check('a pump for another fuel type refuses', /does not serve/.test(st.m2 || ''), st.m2);

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
  check('switching back to an owned ship works', sw.type === 'scout', sw.m);
  const eq = await E(`const m = g.buyEquip('laser'); return { m, lvl: g.state.equip.laser };`);
  check('outfitter upgrades apply', eq.lvl === 1, eq.m);

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
