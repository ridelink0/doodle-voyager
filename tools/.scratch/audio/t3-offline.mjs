// Offline renders through the module's own scheduler.
import { launch } from 'file:///D:/doodle-voyager/tools/cdp.mjs';

const URL_ = 'http://127.0.0.1:5323/tools/.scratch/audio/index.html';
const which = process.argv[2] || 'all';
const b = await launch();
await b.goto(URL_);
for (let i = 0; i < 100 && !(await b.eval('!!window.__ready')); i++) await b.wait(100);
const out = {};
if (which === 'all' || which === 'tracks') {
  for (const id of ['lobby', 'bossa', 'elevator', 'waltz', 'combat']) {
    const r = await b.eval(`offline(12, [[0, (a) => ${id === 'combat' ? "a.mood('combat')" : `a.play('${id}')`}]])`);
    out[id] = r;
    console.log(id, JSON.stringify(r));
  }
}
if (which === 'all' || which === 'moods') {
  // cruise -> combat -> warp -> cruise, then rapid skipping
  const r = await b.eval(`offline(26, [
    [0, (a) => a.mood('cruise')],
    [6, (a) => a.mood('combat')],
    [11, (a) => a.mood('cruise')],
    [11.2, (a) => a.mood('warp')],
    [17, (a) => a.mood('cruise')],
    [21, (a) => a.next()], [21.3, (a) => a.next()], [21.6, (a) => a.next()], [21.9, (a) => a.next()], [22.2, (a) => a.next()],
  ])`);
  console.log('moods', JSON.stringify(r));
  console.log('jumps around the rapid skips 21-23 s vs rest', JSON.stringify(await b.eval('jumpsNear(21, 23)')));
}
if (which === 'all' || which === 'worst') {
  const plan = [[0, "(a) => a.mood('combat')"], [0.5, "(a) => a.mood('warp')"]];
  for (let t = 1; t < 9; t += 0.05) plan.push([+t.toFixed(2), "(a) => { a.sfx('laser'); a.sfx('hit', { vol: 1 }); a.sfx('explosion'); a.sfx('laserEnemy', { vol: 0.6 }); }"]);
  for (const t of [2, 3, 4.5, 6]) plan.push([t, "(a) => { a.sfx('bigExplosion'); a.sfx('beamFire'); a.sfx('alarm'); a.sfx('breach'); }"]);
  const r = await b.eval(`offline(10, [${plan.map(([t, f]) => `[${t}, ${f}]`).join(',')}])`);
  console.log('worst', JSON.stringify(r));
}
console.log('ERRORS', JSON.stringify(b.errors), 'WARN', JSON.stringify(b.logs.filter((l) => /warn|error/.test(l))));
await b.close();
