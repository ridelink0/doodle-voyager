import { launch } from 'file:///D:/doodle-voyager/tools/cdp.mjs';
import fs from 'node:fs';

const OUT = 'D:/doodle-voyager/tools/.scratch/ships/shots/';
fs.mkdirSync(OUT, { recursive: true });
const b = await launch({ width: 1280, height: 720 });
await b.goto('http://127.0.0.1:5321/tools/.scratch/ships/index.html');
for (let i = 0; i < 60; i++) { if (await b.eval('!!window.ready')) break; await b.wait(250); }
await b.eval('document.fonts.ready.then(() => 1)');
const what = process.argv[2] || 'report';
if (what === 'report') {
  const r = await b.eval('window.report()');
  console.log(JSON.stringify(r, null, 1));
} else if (what === 'grid') {
  const sets = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  for (const [name, cols, list] of sets) {
    await b.eval(`window.grid(${JSON.stringify(list)}, ${cols})`);
    await b.wait(100);
    await b.shot(OUT + name + '.png');
  }
} else {
  const views = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  for (const [name, t, which, o] of views) {
    await b.eval(`window.view(${JSON.stringify(t)}, ${JSON.stringify(which)}, ${JSON.stringify(o || {})})`);
    await b.wait(150);
    await b.shot(OUT + name + '.png');
  }
}
console.log('errors:', JSON.stringify(b.errors));
await b.close();
