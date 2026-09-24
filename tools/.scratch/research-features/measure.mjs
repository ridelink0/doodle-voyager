// Snapshot of per-frame cost in the current build, for the Chromebook note in
// RESEARCH-features.md. Hardware-independent numbers only: draw calls,
// triangles, points, scene size, page weight, heap, and main-thread JS time
// per frame (normal and under a 4x CPU throttle). GPU time is not measured:
// headless Chrome here renders with SwiftShader, not a real GPU.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { launch } from 'file:///D:/doodle-voyager/tools/cdp.mjs';

const PORT = 5226;
const server = spawn(process.execPath, ['D:/doodle-voyager/tools/serve.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));
const out = { when: new Date().toISOString(), viewport: '1366x768 @1x', scenes: {} };
const b = await launch({ width: 1366, height: 768 });
try {
  await b.goto(`http://127.0.0.1:${PORT}/`);
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) { ready = await b.eval('!!(window.__dv && window.__dv.ready)'); if (!ready) await b.wait(500); }
  if (!ready) throw new Error('game never became ready');
  const E = (s) => b.eval(`(async () => { const g = window.__dv; ${s} })()`);
  await E('g.settings.pauseOnBlur = false; return 1;');
  out.boot = await E(`
    const res = performance.getEntriesByType('resource');
    const nav = performance.getEntriesByType('navigation')[0];
    const bytes = res.reduce((a, r) => a + (r.decodedBodySize || 0), 0) + (nav ? nav.decodedBodySize : 0);
    const big = res.map(r => ({ n: r.name.replace(location.origin, ''), kb: Math.round((r.decodedBodySize || 0) / 1024) }))
      .sort((a, b) => b.kb - a.kb).slice(0, 8);
    return { requests: res.length + 1, mb: +(bytes / 1048576).toFixed(2), biggest: big,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      counts: g.u.counts, quality: g.r.quality, pr: g.r.pr, hw: navigator.hardwareConcurrency, mem: navigator.deviceMemory || null };`);
  // per-frame instrumentation: info without auto reset, JS time split
  await E(`
    const info = g.r.gl.info; info.autoReset = false;
    const S = g.__m = { n: 0, up: 0, draw: 0, rend: 0, calls: 0, tris: 0, pts: 0, lines: 0 };
    const up = g.update.bind(g), draw = g.draw.bind(g), rend = g.r.render.bind(g.r);
    g.update = (dt) => { const t = performance.now(); up(dt); S.up += performance.now() - t; };
    g.r.render = (t) => { info.reset(); const a = performance.now(); rend(t); S.rend += performance.now() - a;
      S.calls += info.render.calls; S.tris += info.render.triangles; S.pts += info.render.points; S.lines += info.render.lines; };
    g.draw = (dt) => { const t = performance.now(); draw(dt); S.draw += performance.now() - t; S.n++; };
    return 1;`);
  const sample = async (name, ms = 4000) => {
    await E('Object.assign(g.__m, { n: 0, up: 0, draw: 0, rend: 0, calls: 0, tris: 0, pts: 0, lines: 0 }); return 1;');
    await b.wait(ms);
    const r = await E(`const S = g.__m, n = Math.max(1, S.n);
      let meshes = 0, points = 0, lines = 0;
      for (const sc of [g.r.world, g.r.shipScene]) sc.traverse(o => { if (!o.visible) return; if (o.isPoints) points++; else if (o.isLine) lines++; else if (o.isMesh) meshes++; });
      return { frames: S.n, updateMs: +(S.up / n).toFixed(2), sceneJsMs: +((S.draw - S.rend) / n).toFixed(2), renderCallMs: +(S.rend / n).toFixed(2),
        drawCalls: Math.round(S.calls / n), triangles: Math.round(S.tris / n), points: Math.round(S.pts / n), lineSegs: Math.round(S.lines / n),
        objects: { meshes, points, lines }, geometries: g.r.gl.info.memory.geometries, textures: g.r.gl.info.memory.textures,
        heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, mode: g.mode };`);
    out.scenes[name] = r;
    console.log(name, JSON.stringify(r));
  };
  await sample('title');
  await E('g.launch(); return 1;');
  await b.wait(1500);
  await sample('helm-sol');
  await E('g.standUp(); return 1;');
  await sample('foot-scout');
  await E(`g.state.credits = 60000; g.buyShip('cruiser'); g.setMode('foot'); return 1;`);
  await b.wait(800);
  await sample('foot-cruiser');
  await E(`g.setMode('helm');
    const z = g.u.zones.find(z => z.state === 'hostile');
    const r = z.radius * 0.9; g.ship.pos = { x: z.pos.x + 0.6 * r, y: z.pos.y + 0.2 * r, z: z.pos.z + 0.77 * r };
    g.ship.vel.set(0, 0, 0); g.ship.cruise = false; return 1;`);
  await b.wait(2000);
  await sample('helm-enemy-zone');
  await b.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await sample('helm-enemy-zone-cpu4x', 6000);
  await b.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  out.errors = b.errors.filter((e) => !/favicon|DevTools/.test(e)).slice(0, 5);
} catch (e) {
  out.failed = e.message;
  console.log('FAILED', e.message);
} finally {
  await b.close();
  server.kill();
}
fs.writeFileSync('D:/doodle-voyager/tools/.scratch/research-features/measure.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.boot));
