import { launch } from '../cdp.mjs';
const b = await launch({ width: 1366, height: 768 });
await b.goto('http://doodle-voyager.localhost/');
let ok = false;
for (let i = 0; i < 90 && !ok; i++) { ok = await b.eval('!!(window.__dv && window.__dv.ready)').catch(() => false); if (!ok) await b.wait(500); }
console.log('doodle-voyager.localhost boots:', ok, 'title:', await b.eval('document.title'), 'errors:', b.errors.length);
await b.close();
