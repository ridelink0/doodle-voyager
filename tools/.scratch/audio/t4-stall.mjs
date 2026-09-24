// Main-thread stall test: block the page for a while during playback and
// look for a dropout in the master output (windowed RMS every 50 ms).
import { launch } from 'file:///D:/doodle-voyager/tools/cdp.mjs';

const URL_ = 'http://127.0.0.1:5323/tools/.scratch/audio/index.html';
const stallMs = Number(process.argv[2] || 600);
const b = await launch();
await b.goto(URL_);
for (let i = 0; i < 100 && !(await b.eval('!!window.__ready')); i++) await b.wait(100);
const r = await b.eval(`(async () => {
  const a = window.audio;
  a.init(); a.play('bossa');
  await sleep(5000);
  // record the output in a ScriptProcessor-free way: poll the analyser from a
  // worker-free timer after the stall, using a long analyser window instead
  const ctx = window.__ctx, an = ctx.createAnalyser();
  an.fftSize = 32768;
  // tap after the master: reuse the harness analyser's source by connecting it
  ctx.__an.connect(an);
  const t0 = ctx.currentTime;
  const x = performance.now();
  while (performance.now() - x < ${stallMs}) { /* block the main thread */ }
  await sleep(120);
  const buf = new Float32Array(an.fftSize);
  an.getFloatTimeDomainData(buf);
  // 32768 samples = 0.68 s at 48 kHz; windows of 20 ms
  const W = 960, rms = [];
  for (let i = 0; i + W <= buf.length; i += W) { let s = 0; for (let j = i; j < i + W; j++) s += buf[j] * buf[j]; rms.push(+(20 * Math.log10(Math.sqrt(s / W) + 1e-9)).toFixed(0)); }
  return { rms, minDb: Math.min(...rms), sr: ctx.sampleRate, t: +(ctx.currentTime - t0).toFixed(2) };
})()`);
console.log(JSON.stringify(r));
console.log('ERRORS', JSON.stringify(b.errors));
await b.close();
