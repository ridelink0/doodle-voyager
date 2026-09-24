// Review harness for js/audio.js: taps the master output with an analyser,
// counts workers, and renders offline through the module's own scheduler.
const RealAC = window.AudioContext;
const origConnect = AudioNode.prototype.connect;
window.__workers = 0;
const RealWorker = window.Worker;
window.Worker = class extends RealWorker {
  constructor(...a) { super(...a); window.__workers++; }
};
AudioNode.prototype.connect = function (dest, ...rest) {
  const r = origConnect.call(this, dest, ...rest);
  if (dest instanceof AudioDestinationNode) {
    const ctx = this.context;
    if (!ctx.__an) { ctx.__an = ctx.createAnalyser(); ctx.__an.fftSize = 2048; }
    origConnect.call(this, ctx.__an);
    if (!(ctx instanceof OfflineAudioContext)) window.__ctx = ctx;
  }
  return r;
};
window.__count = {};
for (const m of ['createBufferSource', 'createGain', 'createOscillator', 'createBiquadFilter', 'createConvolver']) {
  const orig = BaseAudioContext.prototype[m];
  BaseAudioContext.prototype[m] = function (...a) { window.__count[m] = (window.__count[m] || 0) + 1; return orig.apply(this, a); };
}
window.__long = [];
try {
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); })
    .observe({ type: 'longtask', buffered: true });
} catch { /* no longtask */ }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
window.sleep = sleep;
window.meter = (ms) => new Promise((res) => {
  const an = window.__ctx.__an, buf = new Float32Array(an.fftSize);
  let peak = 0, sum = 0, n = 0, nan = false;
  const iv = setInterval(() => {
    an.getFloatTimeDomainData(buf);
    for (const x of buf) { if (Number.isNaN(x)) nan = true; const a = Math.abs(x); if (a > peak) peak = a; sum += x * x; n++; }
  }, 20);
  setTimeout(() => { clearInterval(iv); res({ peak: +peak.toFixed(4), rms: +Math.sqrt(sum / Math.max(1, n)).toFixed(5), nan }); }, ms);
});

// Render `sec` seconds offline. plan: [[time, fn(audio)]] run at audio time.
window.offline = async (sec, plan = [], firstWait = 2500, modPath = '/js/audio.js') => {
  const SRo = 48000, off = new OfflineAudioContext(2, Math.round(sec * SRo), SRo);
  window.AudioContext = function () { return off; };
  let a;
  try {
    a = (await import(modPath + '?off=' + Math.random())).audio;
    a.init();
  } finally { window.AudioContext = RealAC; }
  const todo = plan.slice().sort((x, y) => x[0] - y[0]);
  const run = (t) => { while (todo.length && todo[0][0] <= t + 1e-9) { const [, fn] = todo.shift(); fn(a); } };
  run(0);
  const step = 0.1;
  let first = true, renderMs = 0, lastResume = performance.now();
  const c0 = { ...window.__count };
  for (let t = step; t < sec - 0.05; t += step) {
    const tt = Math.round(t * 1000) / 1000;
    off.suspend(tt).then(async () => {
      if (!first) renderMs += performance.now() - lastResume;
      run(tt);
      await sleep(first ? firstWait : 70);
      first = false;
      lastResume = performance.now();
      off.resume();
    });
  }
  const buf = await off.startRendering();
  const created = {};
  for (const k of Object.keys(window.__count)) created[k] = window.__count[k] - (c0[k] || 0);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  let peak = 0, nan = 0, over = 0, sum = 0, dc = 0;
  const win = Math.round(0.25 * SRo), wins = [];
  let ws = 0, wn = 0, wpk = 0;
  let maxJump = 0, maxJumpAt = 0;
  for (let i = 0; i < L.length; i++) {
    const l = L[i], r = R[i];
    if (Number.isNaN(l) || Number.isNaN(r)) { nan++; continue; }
    const a2 = Math.max(Math.abs(l), Math.abs(r));
    if (a2 > peak) peak = a2;
    if (a2 > 0.7) over++;
    sum += l * l + r * r; dc += l + r;
    ws += l * l + r * r; wn += 2; if (a2 > wpk) wpk = a2;
    if (i > 1) {
      // second difference: large values mark discontinuities (clicks)
      const j = Math.abs(l - 2 * L[i - 1] + L[i - 2]);
      if (j > maxJump) { maxJump = j; maxJumpAt = i / SRo; }
    }
    if (wn >= win * 2) { wins.push(+(20 * Math.log10(Math.sqrt(ws / wn) + 1e-9)).toFixed(1)); ws = 0; wn = 0; wpk = 0; }
  }
  const rms = Math.sqrt(sum / (2 * L.length));
  window.__lastBuf = buf;
  return {
    peak: +peak.toFixed(4), peakDb: +(20 * Math.log10(peak + 1e-9)).toFixed(1), rmsDb: +(20 * Math.log10(rms + 1e-9)).toFixed(1),
    nan, over, dc: +(dc / (2 * L.length)).toExponential(2), maxJump: +maxJump.toFixed(4), maxJumpAt: +maxJumpAt.toFixed(3), wins,
    current: a.current, renderMs: Math.round(renderMs), created,
  };
};

// Second-difference profile of the last render around a time, relative to the rest.
window.jumpsNear = (t0, t1) => {
  const L = window.__lastBuf.getChannelData(0), SRo = window.__lastBuf.sampleRate;
  let inMax = 0, outMax = 0;
  for (let i = 2; i < L.length; i++) {
    const j = Math.abs(L[i] - 2 * L[i - 1] + L[i - 2]), t = i / SRo;
    if (t >= t0 && t <= t1) { if (j > inMax) inMax = j; } else if (j > outMax) outMax = j;
  }
  return { inMax: +inMax.toFixed(4), outMax: +outMax.toFixed(4) };
};

const mod = await import('/js/audio.js');
window.audio = mod.audio;
window.__ready = true;
document.getElementById('out').textContent = 'ready';
