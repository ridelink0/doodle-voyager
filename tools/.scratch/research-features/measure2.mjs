// Main-thread JS cost of the simulation alone: rendering is switched off so
// the software GL in headless Chrome cannot compete for the CPU. Splits the
// universe update (catalogue points placed every frame) from the rest.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { launch } from 'file:///D:/doodle-voyager/tools/cdp.mjs';

const PORT = 5226;
const server = spawn(process.execPath, ['D:/doodle-voyager/tools/serve.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));
const out = {};
const b = await launch({ width: 1366, height: 768 });
try {
  await b.goto(`http://127.0.0.1:${PORT}/`);
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) { ready = await b.eval('!!(window.__dv && window.__dv.ready)'); if (!ready) await b.wait(500); }
  if (!ready) throw new Error('game never became ready');
  const E = (s) => b.eval(`(async () => { const g = window.__dv; ${s} })()`);
  await E(`g.settings.pauseOnBlur = false;
    const S = g.__m = { n: 0, up: 0, uni: 0, max: 0 };
    const up = g.update.bind(g), uu = g.u.update.bind(g.u);
    g.u.update = (...a) => { const t = performance.now(); const r = uu(...a); S.uni += performance.now() - t; return r; };
    g.update = (dt) => { const t = performance.now(); up(dt); const d = performance.now() - t; S.up += d; S.max = Math.max(S.max, d); S.n++; };
    g.r.render = () => {};
    return 1;`);
  const sample = async (name, ms = 3000) => {
    await E('Object.assign(g.__m, { n: 0, up: 0, uni: 0, max: 0 }); return 1;');
    await b.wait(ms);
    const r = await E(`const S = g.__m, n = Math.max(1, S.n);
      return { frames: S.n, updateMs: +(S.up / n).toFixed(2), universeMs: +(S.uni / n).toFixed(2), worstMs: +S.max.toFixed(1), mode: g.mode };`);
    out[name] = r;
    console.log(name, JSON.stringify(r));
  };
  await E('g.launch(); return 1;');
  await b.wait(1000);
  await sample('helm-sol');
  await E(`g.u.update(g.ship.pos, g.t, 0.016); const gal = g.u.galaxies.find(x => x.name && /Andromeda|M31/.test(x.name + ' ' + (x.alt || '')));
    if (gal) g.ship.pos = { x: gal.pos.x + 5e5, y: gal.pos.y, z: gal.pos.z }; return !!gal;`);
  await b.wait(1000);
  await sample('helm-near-andromeda');
  await b.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await sample('helm-near-andromeda-cpu4x', 5000);
  await b.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  out.errors = b.errors.filter((e) => !/favicon|DevTools/.test(e)).slice(0, 5);
} catch (e) {
  out.failed = e.message;
  console.log('FAILED', e.message);
} finally {
  await b.close();
  server.kill();
}
fs.writeFileSync('D:/doodle-voyager/tools/.scratch/research-features/measure2.json', JSON.stringify(out, null, 2));
