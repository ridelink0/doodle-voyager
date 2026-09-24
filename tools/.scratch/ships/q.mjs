import { launch } from 'file:///D:/doodle-voyager/tools/cdp.mjs';
const b = await launch({ width: 800, height: 450 });
await b.goto('http://127.0.0.1:5321/tools/.scratch/ships/index.html');
for (let i = 0; i < 60; i++) { if (await b.eval('!!window.ready')) break; await b.wait(250); }
const expr = process.argv[2];
console.log(JSON.stringify(await b.eval(`(async () => { const S = await import('/js/ships.js'); const THREE = await import('three'); ${expr} })()`)));
console.log('errors:', JSON.stringify(b.errors.filter(e => !/favicon/.test(e))));
await b.close();
