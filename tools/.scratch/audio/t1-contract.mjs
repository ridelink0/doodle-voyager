// Contract checks before and after init, plus live analyser checks.
import { launch } from 'file:///D:/doodle-voyager/tools/cdp.mjs';

const URL_ = 'http://127.0.0.1:5323/tools/.scratch/audio/index.html';
const b = await launch();
await b.goto(URL_);
for (let i = 0; i < 100 && !(await b.eval('!!window.__ready')); i++) await b.wait(100);

const pre = await b.eval(`(() => {
  const a = window.audio, out = {};
  out.keys = Object.keys(a).sort();
  out.enabledDesc = Object.getOwnPropertyDescriptor(a, 'enabled');
  out.tracks = a.tracks;
  out.current = a.current;
  const l = a.loop('thruster'); out.loopPre = typeof l.stop + typeof l.set; l.set(0.5); l.stop();
  const u = a.loop('nope'); out.loopUnknownPre = u && typeof u.stop + typeof u.set;
  a.sfx('laser'); a.sfx('hit', { vol: 0.3 }); a.sfx('nope');
  a.setMusicVolume(0.45); a.setSfxVolume(0.7);
  a.mood('warp'); a.mood('combat'); a.mood('cruise'); a.mood('bogus');
  a.enabled = false; a.enabled = true;
  a.stop(); a.play('lobby'); a.play('nope');
  out.currentAfterPre = a.current;
  return out;
})()`);
console.log('PRE', JSON.stringify(pre));

// init twice, time it
const t = await b.eval(`(() => { const t0 = performance.now(); window.audio.init(); const t1 = performance.now(); window.audio.init(); return [t1 - t0, performance.now() - t1, window.__ctx && window.__ctx.sampleRate, window.__workers]; })()`);
console.log('INIT ms, second ms, rate, workers', t);
await b.wait(300);
console.log('after init: current', await b.eval('JSON.stringify(window.audio.current)'), 'state', await b.eval('window.__ctx.state'));
console.log('meter 1.5s right after init (music should NOT start by init alone):', await b.eval('meter(1500)'));
console.log('errors so far', b.errors, b.logs.filter((l) => !l.startsWith('[log]')));
await b.close();
