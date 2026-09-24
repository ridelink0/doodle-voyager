// Live checks through an analyser on the master output.
import { launch } from 'file:///D:/doodle-voyager/tools/cdp.mjs';

const URL_ = 'http://127.0.0.1:5323/tools/.scratch/audio/index.html';
const SFX = ['laser', 'laserEnemy', 'beamCharge', 'beamFire', 'explosion', 'bigExplosion', 'hit', 'alarm', 'warpCharge', 'warpIn', 'warpOut',
  'ui', 'buy', 'deny', 'fuel', 'bomb', 'flush', 'sizzle', 'door', 'coin', 'seal', 'breach'];
const LOOPS = ['wind', 'thruster', 'dronebuzz', 'shower', 'hum'];
const b = await launch();
await b.goto(URL_);
for (let i = 0; i < 100 && !(await b.eval('!!window.__ready')); i++) await b.wait(100);
await b.eval('window.audio.enabled = false; window.audio.init(); 1');
await b.wait(2500); // let the worker draw everything
const fail = [];
const res = {};
for (const s of SFX) {
  const opts = s === 'hit' || s === 'laserEnemy' ? '{ vol: 0.6 }' : 'undefined';
  res[s] = await b.eval(`(async () => { window.audio.sfx('${s}', ${opts}); return meter(700); })()`);
  if (!(res[s].peak > 0.01) || res[s].nan) fail.push('sfx ' + s);
  await b.wait(s === 'bigExplosion' || s === 'breach' || s === 'flush' || s === 'sizzle' || s === 'warpCharge' ? 2800 : 900);
}
console.log('SFX', JSON.stringify(res));
const lres = {};
for (const l of LOOPS) {
  lres[l] = await b.eval(`(async () => {
    const h = window.audio.loop('${l}');
    const on = await meter(700);
    let lo = null, hi = null;
    if ('${l}' === 'thruster') { h.set(0); await sleep(400); lo = await meter(500); h.set(1); await sleep(400); hi = await meter(500); }
    h.stop(); h.stop(); h.set(0.5);
    await sleep(600);
    const off = await meter(400);
    return { on, off, lo, hi };
  })()`);
  if (!(lres[l].on.peak > 0.005) || lres[l].off.peak > 1e-4) fail.push('loop ' + l);
}
console.log('LOOPS', JSON.stringify(lres));
await b.eval('window.audio.enabled = true; 1');
const tres = {};
for (const id of ['lobby', 'bossa', 'elevator', 'waltz']) {
  tres[id] = await b.eval(`(async () => { window.audio.play('${id}'); await sleep(3200); const m = await meter(3000); return { m, cur: window.audio.current }; })()`);
  if (!(tres[id].m.peak > 0.02) || tres[id].cur.id !== id) fail.push('track ' + id);
}
console.log('TRACKS', JSON.stringify(tres));
const mres = {};
mres.combat = await b.eval(`(async () => { window.audio.mood('combat'); await sleep(2000); return { m: await meter(2500), cur: window.audio.current }; })()`);
mres.warp = await b.eval(`(async () => { window.audio.mood('warp'); await sleep(2500); return { m: await meter(2500), cur: window.audio.current }; })()`);
mres.cruise = await b.eval(`(async () => { window.audio.mood('cruise'); await sleep(3500); return { m: await meter(2500), cur: window.audio.current }; })()`);
console.log('MOODS', JSON.stringify(mres));
mres.next = await b.eval(`(async () => { const a = window.audio, before = a.current.id; a.next(); await sleep(3000); return { before, after: a.current.id, m: await meter(1500) }; })()`);
console.log('NEXT', JSON.stringify(mres.next));
const dis = await b.eval(`(async () => {
  const a = window.audio; a.enabled = false; await sleep(1600);
  const off = await meter(800);
  a.mood('combat'); a.next(); a.mood('warp'); a.play('bossa'); await sleep(1500);
  const still = await meter(800);
  a.enabled = true; a.mood('cruise'); await sleep(3500);
  const back = await meter(1500);
  return { off, still, back, cur: a.current };
})()`);
console.log('DISABLED', JSON.stringify(dis));
if (dis.off.peak > 1e-4 || dis.still.peak > 1e-4 || !(dis.back.peak > 0.02)) fail.push('enabled flag');
// burst
const burst = await b.eval(`(async () => {
  const a = window.audio, t0 = performance.now();
  for (let i = 0; i < 600; i++) a.sfx(['laser', 'hit', 'explosion', 'laserEnemy', 'bigExplosion'][i % 5], { vol: 1 });
  const ms = performance.now() - t0;
  return { ms, m: await meter(1500) };
})()`);
console.log('BURST', JSON.stringify(burst));
console.log('LONGTASKS', JSON.stringify(await b.eval('window.__long')));
console.log('ERRORS', JSON.stringify(b.errors), 'WARN', JSON.stringify(b.logs.filter((l) => /warn|error/.test(l))));
console.log(fail.length ? 'FAIL ' + fail.join(', ') : 'ALL PASS');
await b.close();
