// MP4 player for the ship's screens. One detached <video> is drawn into a
// 640x360 canvas texture every frame; when nothing is loaded the canvas shows
// a handwritten idle card instead. Built-in tapes come from
// assets/videos/manifest.json, the player's own files live in IndexedDB
// ('dv-media' / 'videos') and pasted links in localStorage. Storage is a bonus:
// every call is guarded, so the player still works when it is unavailable.
import * as THREE from 'three';

const W = 640, H = 360;
const DB_NAME = 'dv-media', STORE = 'videos';
const URLS_KEY = 'dv-media-urls', PREFS_KEY = 'dv-media-prefs';
const ROOT = new URL('../', import.meta.url);
const INK = '#1a30c0', RED = '#d02030', PAPER = '#f6f3e6';
const HAND = '"Patrick Hand", Caveat, cursive';
const SCRIPT = 'Caveat, "Patrick Hand", cursive';

// ---------- storage, all of it optional ----------

function lsGet(key, dflt) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? dflt; } catch { return dflt; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
}

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }
  return dbPromise;
}
async function dbCall(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

// ---------- small helpers ----------

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function fmt(s) {
  if (!Number.isFinite(s) || s <= 0) return '--:--';
  s = Math.round(s);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function cleanTitle(name) {
  return String(name || '').replace(/\.[a-z0-9]{2,5}$/i, '').trim().slice(0, 80);
}
function titleFromUrl(u) {
  const seg = u.pathname.split('/').filter(Boolean).pop() || '';
  let t = seg;
  try { t = decodeURIComponent(seg); } catch { /* keep the raw segment */ }
  return cleanTitle(t) || u.hostname;
}

// Loads just the metadata so the list can show a length and so obviously
// broken files or links are refused at add time instead of jamming later.
function probe(src) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.crossOrigin = 'anonymous';
    const done = (ok, d) => {
      clearTimeout(timer);
      v.onloadedmetadata = v.onerror = null;
      v.removeAttribute('src');
      v.load();
      resolve({ ok, duration: Number.isFinite(d) && d > 0 ? d : 0 });
    };
    // A slow server is not a broken one: accept with an unknown length.
    const timer = setTimeout(() => done(true, 0), 8000);
    v.onloadedmetadata = () => done(true, v.duration);
    v.onerror = () => done(false, 0);
    v.src = src;
  });
}

function snapshot(it, index) {
  return {
    id: it.id, title: it.title, kind: it.kind, src: it.url, duration: it.duration,
    removable: it.kind !== 'builtin', saved: it.persisted, index,
  };
}

// ---------- idle card drawing ----------

const rrect = (g, x, y, w, h, r) => (g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h));

function paper(g) {
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(26,48,192,0.24)';
  g.lineWidth = 1.5;
  for (let y = 44; y < H; y += 30) {
    g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke();
  }
  g.strokeStyle = 'rgba(208,32,48,0.7)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(70, 0); g.lineTo(70, H); g.stroke();
}

function cassette(g, cx, cy, color, jammed) {
  g.save();
  g.translate(cx, cy);
  g.rotate(-0.05);
  g.strokeStyle = color;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // Two passes a pixel apart read as ballpoint rather than vector.
  for (const o of [0, 1.3]) {
    g.lineWidth = o ? 1.6 : 3;
    g.beginPath(); rrect(g, -112 + o, -68 + o, 224, 136, [14, 8, 16, 9]); g.stroke();
    g.beginPath(); rrect(g, -86, -50 + o, 172, 60, [9, 5, 10, 6]); g.stroke();
    g.beginPath(); g.moveTo(-72, 68); g.lineTo(-58 + o, 40); g.lineTo(58 - o, 40); g.lineTo(72, 68); g.stroke();
  }
  // hatching in the tape window between the reels
  g.save();
  g.beginPath(); g.rect(-24, -36, 48, 32); g.clip();
  g.lineWidth = 1.2;
  for (let x = -60; x < 40; x += 6) { g.beginPath(); g.moveTo(x, -4); g.lineTo(x + 32, -36); g.stroke(); }
  g.restore();
  g.lineWidth = 2.6;
  g.beginPath(); g.rect(-24, -36, 48, 32); g.stroke();
  for (const x of [-50, 50]) {
    g.beginPath(); g.arc(x, -20, 17, 0, Math.PI * 2); g.stroke();
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * 6, -20 + Math.sin(a) * 6);
      g.lineTo(x + Math.cos(a) * 12, -20 + Math.sin(a) * 12);
      g.stroke();
    }
  }
  for (const x of [-40, 40]) { g.beginPath(); g.arc(x, 54, 4, 0, Math.PI * 2); g.stroke(); }
  if (jammed) {
    // tape spilling out of the bottom in loops
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(-30, 66);
    g.bezierCurveTo(-60, 110, 10, 120, -10, 92);
    g.bezierCurveTo(-30, 70, 50, 80, 30, 110);
    g.bezierCurveTo(20, 128, 80, 120, 70, 96);
    g.stroke();
  }
  g.restore();
}

function fitText(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '...').width > max) t = t.slice(0, -1);
  return t + '...';
}

// ---------- panel ----------

const ICON = {
  play: '<path d="M8 5.4 L18.6 12 L8.1 18.7 Z"/>',
  pause: '<path d="M8.6 5.4 L8.3 18.6 M15.6 5.3 L15.9 18.7"/>',
  prev: '<path d="M6.4 5.4 L6.2 18.6 M18.2 5.9 L9.6 12.1 L18 18.2 Z"/>',
  next: '<path d="M17.6 5.4 L17.8 18.6 M5.8 5.9 L14.4 12.1 L6 18.2 Z"/>',
  shuffle: '<path d="M3.5 7 H7.5 C11 7 12.6 17 16.4 17 H20.4 M3.5 17 H7.5 C9.2 17 10.3 14.9 11.2 12.7 M12.9 9.4 C13.8 8 14.8 7 16.4 7 H20.4 M18 4.6 L20.8 7 L18 9.4 M18 14.6 L20.8 17 L18 19.4"/>',
  loop: '<path d="M4.4 12.6 V10.6 C4.4 8.3 6.1 7 8.4 7 H19 M16.2 4.3 L19.2 7 L16.2 9.8 M19.6 11.4 V13.4 C19.6 15.7 17.9 17 15.6 17 H5 M7.8 14.2 L4.8 17 L7.8 19.8"/>',
  vol: '<path d="M4 9.5 H7.5 L12 5.6 V18.4 L7.5 14.5 H4 Z M15.4 9 C16.8 10.4 16.8 13.6 15.4 15 M18.2 6.5 C21 9.4 21 14.6 18.2 17.5"/>',
  close: '<path d="M6 6.3 L18 17.8 M17.6 5.8 L6.4 18.2"/>',
  plus: '<path d="M12 5 V19.2 M4.9 12.2 H19.1"/>',
  link: '<path d="M10 14.1 L14 10 M8.8 11.2 L6.6 13.4 C5 15 5 17.4 6.6 19 C8.2 20.5 10.5 20.5 12 19 L14.3 16.7 M15.2 12.8 L17.4 10.6 C19 9 19 6.6 17.4 5 C15.8 3.5 13.5 3.5 12 5 L9.7 7.3"/>',
};
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;

const CSS = `
.mp-root{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px;background:rgba(246,243,230,.42);font-family:'Patrick Hand','Caveat',cursive;color:#1a30c0}
.mp-root[hidden]{display:none}
.mp-root *{box-sizing:border-box}
.mp-card{position:relative;display:flex;flex-direction:column;gap:12px;width:min(560px,100%);max-height:calc(100vh - 40px);padding:16px 20px 14px 56px;background-color:#f6f3e6;background-image:linear-gradient(90deg,transparent 38px,rgba(208,32,48,.6) 38px,rgba(208,32,48,.6) 40px,transparent 40px),repeating-linear-gradient(180deg,transparent 0 29px,rgba(26,48,192,.16) 29px 30px);border:2.5px solid #1a30c0;border-radius:22px 8px 26px 10px/10px 24px 8px 20px;box-shadow:8px 9px 0 #1a30c0;overflow-y:auto;rotate:-1deg;animation:mp-in .22s ease-out}
@keyframes mp-in{from{opacity:0;transform:translateY(10px) rotate(-2deg)}}
@media (prefers-reduced-motion:reduce){.mp-card{animation:none}}
.mp-ink,.mp-btn,.mp-row{mix-blend-mode:multiply}
.mp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.mp-title{margin:0;font-family:'Caveat','Patrick Hand',cursive;font-weight:700;font-size:44px;line-height:.95;rotate:-2deg}
.mp-scrib{display:block;width:150px;height:12px;margin-top:2px;fill:none;stroke:#d02030;stroke-width:2.6;stroke-linecap:round}
.mp-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:44px;height:44px;padding:0 10px;background:#f6f3e6;color:#1a30c0;border:2px solid #1a30c0;border-radius:12px 5px 14px 6px/6px 13px 5px 12px;box-shadow:3px 3px 0 #1a30c0;font:inherit;font-size:19px;line-height:1;cursor:pointer;transition:transform .08s,box-shadow .08s,background-color .12s}
.mp-btn:nth-child(2n){border-radius:6px 13px 5px 12px/12px 5px 14px 6px;rotate:1.2deg}
.mp-btn:nth-child(3n){rotate:-1.4deg}
.mp-btn:hover{background-color:#fff7cf}
.mp-btn:active{transform:translate(2px,2px);box-shadow:1px 1px 0 #1a30c0}
.mp-btn[aria-pressed="true"]{background-color:#ffd84a}
.mp-btn:focus-visible,.mp-pick:focus-visible,.mp-del:focus-visible,.mp-bar:focus-visible,.mp-vol input:focus-visible{outline:2px dashed #d02030;outline-offset:3px}
.mp-btn svg,.mp-del svg,.mp-vol svg{width:24px;height:24px;flex:none;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.mp-x{flex:none}
.mp-play{min-width:60px;height:52px}
.mp-play svg{width:28px;height:28px}
.mp-now{display:flex;flex-direction:column;gap:6px}
.mp-label{font-family:'Caveat','Patrick Hand',cursive;font-size:20px;line-height:1;color:#d02030}
.mp-name-now{font-size:24px;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mp-bar{position:relative;height:16px;border:2px solid #1a30c0;border-radius:9px 3px 10px 4px/4px 9px 3px 8px;overflow:hidden;cursor:pointer}
.mp-fill{position:absolute;top:0;bottom:0;left:0;width:0;background:repeating-linear-gradient(-45deg,#1a30c0 0 2px,transparent 2px 6px)}
.mp-times{display:flex;justify-content:space-between;font-size:16px;font-variant-numeric:tabular-nums}
.mp-deck{display:flex;flex-wrap:wrap;align-items:center;gap:12px 10px}
.mp-sep{width:2px;height:30px;background:rgba(26,48,192,.35);border-radius:2px;margin:0 2px}
.mp-vol{display:inline-flex;align-items:center;gap:6px;margin-left:auto}
.mp-vol input{-webkit-appearance:none;appearance:none;width:118px;height:26px;margin:0;background:transparent;cursor:pointer}
.mp-vol input::-webkit-slider-runnable-track{height:3px;background:#1a30c0;border-radius:2px}
.mp-vol input::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;margin-top:-7.5px;border:2px solid #1a30c0;border-radius:50% 44% 56% 48%;background:#ffd84a}
.mp-vol input::-moz-range-track{height:3px;background:#1a30c0;border-radius:2px}
.mp-vol input::-moz-range-thumb{width:14px;height:14px;border:2px solid #1a30c0;border-radius:50%;background:#ffd84a}
.mp-list{list-style:none;margin:0;padding:0 2px 0 0;overflow-y:auto;min-height:64px;flex:1 1 auto;border-top:2px solid #1a30c0}
.mp-row{display:flex;align-items:center;gap:4px;border-bottom:1.5px dashed rgba(26,48,192,.4)}
.mp-pick{flex:1;min-width:0;display:flex;align-items:baseline;gap:10px;padding:8px 4px;background:none;border:0;font:inherit;font-size:20px;line-height:1.2;color:#1a30c0;text-align:left;cursor:pointer}
.mp-num{flex:none;width:1.5em;font-family:'Caveat','Patrick Hand',cursive;font-weight:700;font-size:22px;color:#d02030}
.mp-name{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mp-cur .mp-name{background:linear-gradient(176deg,transparent 42%,rgba(255,216,74,.95) 42%,rgba(255,216,74,.95) 92%,transparent 92%)}
.mp-tag{flex:none;margin-left:auto;font-size:14px;color:#d02030}
.mp-dur{flex:none;font-size:16px;font-variant-numeric:tabular-nums}
.mp-del{flex:none;display:grid;place-items:center;width:40px;height:40px;padding:0;background:none;border:0;color:#d02030;cursor:pointer;border-radius:50%}
.mp-del:hover{background:rgba(208,32,48,.1)}
.mp-add{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
.mp-url{display:flex;flex:1 1 240px;gap:10px;min-width:0;margin:0}
.mp-url input{flex:1;min-width:0;padding:6px 2px;font:inherit;font-size:18px;color:#1a30c0;background:transparent;border:0;border-bottom:2px dashed #1a30c0;border-radius:0;outline:none}
.mp-url input:focus{border-bottom-style:solid}
.mp-url input::placeholder{color:rgba(26,48,192,.55)}
.mp-status{margin:0;min-height:1.2em;font-family:'Caveat','Patrick Hand',cursive;font-size:21px;line-height:1.1;color:#d02030}
.mp-keys{margin:-6px 0 0;font-size:15px;opacity:.8}
.mp-keys b{font-weight:400;padding:0 5px;border:1.5px solid #1a30c0;border-radius:5px 3px 6px 3px}
@media (max-width:480px){.mp-card{padding:14px 14px 12px 44px;background-image:linear-gradient(90deg,transparent 28px,rgba(208,32,48,.6) 28px,rgba(208,32,48,.6) 30px,transparent 30px),repeating-linear-gradient(180deg,transparent 0 29px,rgba(26,48,192,.16) 29px 30px)}.mp-title{font-size:38px}.mp-vol{margin-left:0}.mp-tag{display:none}.mp-dur{margin-left:auto}}
@media (max-height:560px){.mp-card{gap:8px;padding-top:10px;padding-bottom:10px}.mp-title{font-size:34px}.mp-now{gap:4px}.mp-btn{height:38px}.mp-play{height:44px}.mp-keys{display:none}}
`;

const KIND = { builtin: 'built-in', file: 'file', url: 'link' };

// ---------- the player ----------

export class Media {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    const v = this.video = document.createElement('video');
    v.playsInline = true;
    v.crossOrigin = 'anonymous';
    v.preload = 'auto';

    this._items = [];
    this._cur = null;        // id of the loaded tape
    this._failed = false;
    this._error = '';
    this._status = '';
    this._history = [];
    this._listeners = new Set();
    this._open = false;
    this._root = null;
    this._inited = null;
    this._lastTime = -1;
    this._switchAt = 0;
    this._pending = new Set();
    this._dirty = true;

    const prefs = lsGet(PREFS_KEY, {}) || {};
    this._volume = Number.isFinite(prefs.volume) ? clamp01(prefs.volume) : 0.8;
    this._shuffle = !!prefs.shuffle;
    this._loop = !!prefs.loop;
    v.volume = this._volume;
    v.loop = this._loop;

    // Redraw only when the video presents a new frame: comparing currentTime
    // alone repaints and re-uploads the texture on every animation frame.
    this._newFrame = false;
    this._rvfc = typeof v.requestVideoFrameCallback === 'function';
    this._onFrame = () => { this._newFrame = true; this._rvfcId = v.requestVideoFrameCallback(this._onFrame); };
    if (this._rvfc) this._rvfcId = v.requestVideoFrameCallback(this._onFrame);

    v.addEventListener('ended', () => { if (!this._loop) this.next(); });
    v.addEventListener('play', () => { this._dirty = true; this._emit('play'); });
    v.addEventListener('pause', () => { this._dirty = true; this._emit('pause'); });
    v.addEventListener('loadeddata', () => { this._dirty = true; });
    v.addEventListener('seeked', () => { this._dirty = true; });
    v.addEventListener('loadedmetadata', () => {
      const it = this._item(this._cur);
      if (it && Number.isFinite(v.duration) && v.duration > 0 && Math.abs(it.duration - v.duration) > 0.5) {
        it.duration = v.duration;
        this._emit('meta');
      }
    });
    v.addEventListener('timeupdate', () => { if (this._open) this._renderProgress(); });
    v.addEventListener('error', () => this._onError());

    this._drawCard();
    // Canvas text does not redraw itself when a web font arrives.
    try {
      const again = () => { this._dirty = true; };
      document.fonts.load(`700 68px Caveat`).then(again, () => {});
      document.fonts.load(`26px "Patrick Hand"`).then(again, () => {});
      document.fonts.addEventListener('loadingdone', again);
    } catch { /* no FontFaceSet: fallback fonts are fine */ }
  }

  // ----- contract -----

  init() {
    if (!this._inited) this._inited = this._init();
    return this._inited;
  }

  async _init() {
    const builtins = [];
    try {
      const res = await fetch(new URL('assets/videos/manifest.json', ROOT));
      if (res.ok) {
        for (const m of await res.json()) {
          if (!m || !m.id || !m.src) continue;
          builtins.push({
            id: String(m.id), title: String(m.title || m.id), kind: 'builtin',
            url: new URL(m.src, ROOT).href, duration: Number(m.duration) || 0, added: 0, persisted: true,
          });
        }
      }
    } catch { /* offline or no manifest: user tapes still work */ }

    let rows = [];
    try { rows = (await dbCall('readonly', (s) => s.getAll())) || []; } catch { rows = []; }
    const files = rows.filter((r) => r && r.id && r.blob instanceof Blob).map((r) => ({
      id: r.id, title: r.title || 'Untitled tape', kind: 'file', url: URL.createObjectURL(r.blob),
      duration: r.duration || 0, added: r.added || 0, persisted: true,
    }));
    const saved = lsGet(URLS_KEY, []);
    const links = (Array.isArray(saved) ? saved : []).filter((r) => r && r.id && typeof r.url === 'string' && /^https?:/i.test(r.url)).map((r) => ({
      id: r.id, title: r.title || r.url, kind: 'url', url: r.url, duration: r.duration || 0, added: r.added || 0, persisted: true,
    }));

    // Anything added before init finished stays at the end.
    const early = this._items;
    const user = [...files, ...links].sort((a, b) => a.added - b.added);
    const all = [...builtins, ...user];
    for (const it of early) if (!all.some((a) => a.id === it.id)) all.push(it);
    this._items = all;
    this._emit('list');
    return this.list();
  }

  update() {
    const v = this.video;
    if (this._cur && !this._failed && v.readyState >= 2 && v.videoWidth) {
      const fresh = this._rvfc ? this._newFrame : v.currentTime !== this._lastTime;
      if (this._dirty || fresh) {
        this._drawFrame();
        this._lastTime = v.currentTime;
        this._newFrame = false;
        this._dirty = false;
        this.texture.needsUpdate = true;
      }
    } else if (this._dirty) {
      // Keep the last picture briefly on a tape change instead of flashing the card.
      if (this._cur && !this._failed && performance.now() - this._switchAt < 300) return;
      this._drawCard();
      this._dirty = false;
      this.texture.needsUpdate = true;
    }
  }

  list() { return this._items.map((it, i) => snapshot(it, i)); }

  async add(src) {
    await this.init();
    if (typeof src === 'string' || src instanceof URL) return this._addUrl(String(src));
    if (src instanceof Blob) return this._addFile(src);
    return null;
  }

  async remove(id) {
    const i = this._index(id);
    if (i < 0) return false;
    const it = this._items[i];
    if (it.kind === 'builtin') return false;
    if (this._cur === id) this.stop();
    this._items.splice(i, 1);
    this._history = this._history.filter((h) => h !== id);
    if (it.kind === 'url') this._saveUrls();
    this._say('Removed "' + it.title + '"');
    this._emit('list');
    if (it.kind === 'file') {
      try { await dbCall('readwrite', (s) => s.delete(id)); } catch { /* nothing stored to delete */ }
      URL.revokeObjectURL(it.url);
    }
    return true;
  }

  play(index) {
    if (index == null) index = Math.max(0, this._index(this._cur));
    return this._go(index, true);
  }

  toggle() {
    if (!this._cur || this._failed) return this.play();
    if (this.video.paused) this._start();
    else this.video.pause();
    return true;
  }

  // Auto-advance uses this too: past the last tape the list wraps round.
  next() {
    const n = this._items.length;
    if (!n) return false;
    const i = this._index(this._cur);
    let j = i < 0 ? 0 : (i + 1) % n;
    if (this._shuffle && n > 1) {
      do j = Math.floor(Math.random() * n); while (j === i);
    }
    return this._go(j, true);
  }

  prev() {
    const n = this._items.length;
    if (!n) return false;
    const i = this._index(this._cur);
    if (this._shuffle) {
      while (this._history.length) {
        const k = this._index(this._history.pop());
        if (k >= 0 && k !== i) return this._go(k, false);
      }
    }
    return this._go(i < 0 ? n - 1 : (i - 1 + n) % n, true);
  }

  stop() {
    const v = this.video;
    v.pause();
    v.removeAttribute('src');
    v.load();
    this._cur = null;
    this._failed = false;
    this._error = '';
    this._dirty = true;
    this._emit('stop');
  }

  get shuffle() { return this._shuffle; }
  set shuffle(on) { this._shuffle = !!on; this._savePrefs(); this._emit('settings'); }

  // Loop repeats the current tape; with it off the list plays on.
  get loop() { return this._loop; }
  set loop(on) { this._loop = !!on; this.video.loop = this._loop; this._savePrefs(); this._emit('settings'); }

  get volume() { return this._volume; }
  set volume(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return;
    this._volume = clamp01(n);
    this.video.volume = this._volume;
    this._savePrefs();
    this._emit('settings');
  }

  get current() {
    const i = this._index(this._cur);
    return i < 0 ? null : snapshot(this._items[i], i);
  }

  get playing() {
    return !!this._cur && !this._failed && !this.video.paused && !this.video.ended;
  }

  get isOpen() { return this._open; }

  open() {
    this._build();
    if (this._open) return;
    this._open = true;
    // The game may hold pointer lock; the panel needs a free cursor.
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* not supported */ }
    this._root.hidden = false;
    this._rowsKey = '';
    this._render();
    this._prevFocus = document.activeElement;
    try { this._el.play.focus({ preventScroll: true }); } catch { /* focus is optional */ }
    this._emit('open');
  }

  close() {
    if (!this._open) return;
    this._open = false;
    this._root.hidden = true;
    const f = this._prevFocus;
    this._prevFocus = null;
    try { if (f && f.isConnected && f.focus) f.focus({ preventScroll: true }); } catch { /* focus is optional */ }
    this._emit('close');
  }

  onchange(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  // ----- internals -----

  _index(id) { return id == null ? -1 : this._items.findIndex((it) => it.id === id); }
  _item(id) { return this._items[this._index(id)] || null; }

  _go(index, remember) {
    if (!Number.isInteger(index) || index < 0 || index >= this._items.length) return false;
    const it = this._items[index];
    const v = this.video;
    if (remember && this._cur && this._cur !== it.id) {
      this._history.push(this._cur);
      if (this._history.length > 50) this._history.shift();
    }
    const same = this._cur === it.id && !this._failed && v.getAttribute('src') === it.url;
    this._cur = it.id;
    this._failed = false;
    this._error = '';
    this._status = '';
    if (!same) {
      v.src = it.url;
      this._lastTime = -1;
      this._switchAt = performance.now();
      if (this._rvfc) {
        // re-arm per tape so a source change can never leave the chain dead
        v.cancelVideoFrameCallback(this._rvfcId);
        this._rvfcId = v.requestVideoFrameCallback(this._onFrame);
      }
    }
    v.loop = this._loop;
    v.volume = this._volume;
    this._dirty = true;
    this._start();
    this._emit('track');
    return true;
  }

  _start() {
    const p = this.video.play();
    if (p && p.catch) {
      p.catch((e) => {
        if (e && e.name === 'NotAllowedError') this._say('The browser wants a click first: press play');
        // AbortError means another tape was loaded meanwhile; real load
        // failures arrive through the 'error' event.
      });
    }
  }

  _onError() {
    const v = this.video;
    if (!this._cur || !v.getAttribute('src')) return;
    const code = v.error ? v.error.code : 0;
    const why = {
      1: 'playback was stopped',
      2: 'the network dropped out',
      3: 'damaged file, or a codec this browser lacks',
      4: 'unsupported format, or the site blocks it',
    }[code] || 'it would not play';
    this._failed = true;
    this._error = why;
    this._dirty = true;
    this._say('Tape jammed: ' + why);
    this._emit('error');
  }

  async _addFile(file) {
    const type = file.type || '';
    const name = file.name || '';
    if (type && !type.startsWith('video/') && type !== 'application/octet-stream') {
      this._say(`"${name || 'That file'}" is not a video`);
      return null;
    }
    const url = URL.createObjectURL(file);
    const pr = await probe(url);
    if (!pr.ok) {
      URL.revokeObjectURL(url);
      this._say(`Could not read "${name || 'that file'}" as a video`);
      return null;
    }
    const it = {
      id: 'f-' + uid(), title: cleanTitle(name) || 'Untitled tape', kind: 'file', url,
      duration: pr.duration, added: Date.now(), persisted: false,
    };
    try {
      await dbCall('readwrite', (s) => s.put({
        id: it.id, title: it.title, duration: it.duration, added: it.added, type, size: file.size, blob: file,
      }));
      it.persisted = true;
      this._say(`Added "${it.title}"`);
    } catch {
      this._say(`Added "${it.title}" for this visit only: the browser would not store it`);
    }
    this._items.push(it);
    this._emit('list');
    return snapshot(it, this._items.length - 1);
  }

  async _addUrl(raw) {
    let u = null;
    try { u = new URL(String(raw).trim(), location.href); } catch { u = null; }
    if (!String(raw).trim() || !u || !/^https?:$/.test(u.protocol)) {
      this._say('That does not look like a web link');
      return null;
    }
    const dup = this._items.find((it) => it.url === u.href);
    if (dup) {
      this._say('That one is already on the list');
      return snapshot(dup, this._index(dup.id));
    }
    if (this._pending.has(u.href)) return null;
    this._pending.add(u.href);
    this._say('Checking the link...');
    const pr = await probe(u.href);
    this._pending.delete(u.href);
    if (!pr.ok) {
      this._say('Could not load that link: it may not be a video, or the site does not allow playing it here');
      return null;
    }
    const it = {
      id: 'u-' + uid(), title: titleFromUrl(u), kind: 'url', url: u.href,
      duration: pr.duration, added: Date.now(), persisted: false,
    };
    this._items.push(it);
    it.persisted = this._saveUrls();
    this._say(it.persisted ? `Added "${it.title}"` : `Added "${it.title}" for this visit only: the browser would not store it`);
    this._emit('list');
    return snapshot(it, this._items.length - 1);
  }

  _saveUrls() {
    const rows = this._items.filter((it) => it.kind === 'url')
      .map(({ id, title, url, duration, added }) => ({ id, title, url, duration, added }));
    return lsSet(URLS_KEY, rows);
  }

  _savePrefs() {
    lsSet(PREFS_KEY, { volume: this._volume, shuffle: this._shuffle, loop: this._loop });
  }

  _say(msg) {
    this._status = msg;
    this._emit('status');
  }

  _emit(type) {
    if (this._open) this._render();
    for (const cb of this._listeners) {
      try { cb(this, type); } catch (e) { console.error(e); }
    }
  }

  // ----- canvas -----

  _drawFrame() {
    const g = this.ctx, v = this.video;
    const s = Math.min(W / v.videoWidth, H / v.videoHeight);
    const w = v.videoWidth * s, h = v.videoHeight * s;
    if (w < W - 0.5 || h < H - 0.5) {
      g.fillStyle = '#0d0f24';
      g.fillRect(0, 0, W, H);
    }
    g.drawImage(v, (W - w) / 2, (H - h) / 2, w, h);
    if (v.paused && !v.ended) {
      g.save();
      g.translate(22, 20);
      g.rotate(-0.04);
      g.fillStyle = PAPER;
      g.strokeStyle = INK;
      g.lineWidth = 2.5;
      g.beginPath(); rrect(g, 0, 0, 140, 46, [10, 4, 12, 5]); g.fill(); g.stroke();
      g.fillStyle = INK;
      g.fillRect(15, 12, 6, 22);
      g.fillRect(27, 12, 6, 22);
      g.font = `30px ${HAND}`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('PAUSED', 44, 25);
      g.restore();
    }
  }

  // The idle card: nothing loaded, loading, jammed, or sound with no picture.
  _drawCard() {
    const g = this.ctx, v = this.video;
    const it = this._item(this._cur);
    let head = 'NO TAPE IN', sub = 'pick a tape from the MP4 playlist', color = INK, jam = false;
    if (it && this._failed) { head = 'TAPE JAMMED'; sub = this._error; color = RED; jam = true; }
    else if (it && v.readyState >= 2 && !v.videoWidth) { head = 'NO PICTURE'; sub = it.title; }
    else if (it) { head = 'LOADING TAPE'; sub = it.title; }
    paper(g);
    cassette(g, 330, 118, color, jam);
    g.save();
    g.translate(336, 258);
    g.rotate(-0.035);
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 68px ${SCRIPT}`;
    g.fillText(head, 0, 0);
    const tw = Math.min(g.measureText(head).width, 520);
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-tw / 2, 34);
    g.bezierCurveTo(-tw / 6, 28, tw / 6, 40, tw / 2, 31);
    g.stroke();
    g.restore();
    g.fillStyle = jam ? RED : INK;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `26px ${HAND}`;
    g.fillText(fitText(g, sub, 520), 340, 326);
  }

  // ----- DOM panel -----

  _build() {
    if (this._root) return;
    if (!document.getElementById('mp-style')) {
      const st = document.createElement('style');
      st.id = 'mp-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const root = document.createElement('div');
    root.className = 'mp-root';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'mp-title');
    root.innerHTML = `
      <div class="mp-card">
        <div class="mp-head">
          <div>
            <h2 class="mp-title mp-ink" id="mp-title">MP4 tapes</h2>
            <svg class="mp-scrib mp-ink" viewBox="0 0 150 12" aria-hidden="true"><path d="M3 8 C30 3 55 11 82 6 S128 4 147 7"/></svg>
          </div>
          <button type="button" class="mp-btn mp-x" data-act="close" aria-label="Close the MP4 panel">${svg(ICON.close)}</button>
        </div>
        <div class="mp-now">
          <span class="mp-label mp-ink">now playing</span>
          <span class="mp-name-now mp-ink"></span>
          <div class="mp-bar" role="slider" tabindex="0" aria-label="Position in the tape" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="mp-fill"></div></div>
          <div class="mp-times mp-ink"><span class="mp-t0">0:00</span><span class="mp-t1">--:--</span></div>
        </div>
        <div class="mp-deck">
          <button type="button" class="mp-btn" data-act="prev" aria-label="Previous tape">${svg(ICON.prev)}</button>
          <button type="button" class="mp-btn mp-play" data-act="toggle" aria-label="Play"></button>
          <button type="button" class="mp-btn" data-act="next" aria-label="Next tape">${svg(ICON.next)}</button>
          <span class="mp-sep" aria-hidden="true"></span>
          <button type="button" class="mp-btn" data-act="shuffle" aria-label="Shuffle" aria-pressed="false">${svg(ICON.shuffle)}</button>
          <button type="button" class="mp-btn" data-act="loop" aria-label="Loop this tape" aria-pressed="false">${svg(ICON.loop)}</button>
          <label class="mp-vol mp-ink">${svg(ICON.vol)}<input type="range" min="0" max="1" step="0.01" aria-label="Volume"></label>
        </div>
        <ol class="mp-list" aria-label="Playlist"></ol>
        <div class="mp-add">
          <button type="button" class="mp-btn" data-act="file">${svg(ICON.plus)}<span>add a file</span></button>
          <input type="file" accept="video/*" multiple hidden>
          <form class="mp-url">
            <input type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="paste an .mp4 link" aria-label="Video link">
            <button type="submit" class="mp-btn">${svg(ICON.link)}<span>add link</span></button>
          </form>
        </div>
        <p class="mp-status" role="status" aria-live="polite"></p>
        <p class="mp-keys mp-ink"><b>Esc</b> closes, <b>Space</b> plays or pauses</p>
      </div>`;
    document.body.appendChild(root);
    this._root = root;
    const q = (s) => root.querySelector(s);
    this._el = {
      card: q('.mp-card'), now: q('.mp-name-now'), bar: q('.mp-bar'), fill: q('.mp-fill'),
      t0: q('.mp-t0'), t1: q('.mp-t1'), play: q('[data-act="toggle"]'),
      shuffle: q('[data-act="shuffle"]'), loop: q('[data-act="loop"]'),
      vol: q('.mp-vol input'), list: q('.mp-list'), fileIn: q('input[type="file"]'),
      form: q('.mp-url'), url: q('.mp-url input'), status: q('.mp-status'),
    };
    const el = this._el;

    // Clicks and wheel inside the panel belong to the panel, not the game.
    for (const t of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'contextmenu']) {
      root.addEventListener(t, (e) => {
        if (t === 'pointerdown') this._downOnBackdrop = e.target === root;
        if (t === 'click' && e.target === root && this._downOnBackdrop) this.close();
        e.stopPropagation();
      });
    }
    el.card.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'close') this.close();
      else if (act === 'toggle') this.toggle();
      else if (act === 'prev') this.prev();
      else if (act === 'next') this.next();
      else if (act === 'shuffle') this.shuffle = !this._shuffle;
      else if (act === 'loop') this.loop = !this._loop;
      else if (act === 'file') el.fileIn.click();
    });
    el.list.addEventListener('click', (e) => {
      const del = e.target.closest('.mp-del');
      if (del) { this.remove(del.dataset.id); return; }
      const pick = e.target.closest('.mp-pick');
      if (pick) this.play(Number(pick.dataset.index));
    });
    el.vol.addEventListener('input', () => { this.volume = Number(el.vol.value); });
    el.fileIn.addEventListener('change', async () => {
      const files = [...(el.fileIn.files || [])];
      el.fileIn.value = '';
      for (const f of files) await this.add(f);
    });
    el.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = el.url.value;
      const it = await this.add(val);
      if (it) el.url.value = '';
    });
    const seek = (frac) => {
      const v = this.video;
      if (this._cur && Number.isFinite(v.duration) && v.duration > 0) v.currentTime = clamp01(frac) * v.duration;
    };
    el.bar.addEventListener('click', (e) => {
      const r = el.bar.getBoundingClientRect();
      if (r.width > 0) seek((e.clientX - r.left) / r.width);
    });
    el.bar.addEventListener('keydown', (e) => {
      const v = this.video;
      if (!Number.isFinite(v.duration) || v.duration <= 0) return;
      if (e.key === 'ArrowRight') seek((v.currentTime + 5) / v.duration);
      else if (e.key === 'ArrowLeft') seek((v.currentTime - 5) / v.duration);
    });

    // Capture on window so the panel sees keys before the game does.
    const onKey = (e) => this._onKey(e);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
  }

  _onKey(e) {
    const down = e.type === 'keydown';
    if (!this._open) {
      // swallow the keyup of the Escape that closed the panel
      if (!down && e.key === 'Escape' && this._escDown) {
        this._escDown = false;
        e.stopImmediatePropagation();
      }
      return;
    }
    // Releases always reach the game: a key held when the panel opened
    // (Space to hop, W to walk) would otherwise stay down after it closes.
    if (e.key === 'Escape') {
      e.preventDefault();
      if (down) { e.stopImmediatePropagation(); this._escDown = true; this.close(); }
      return;
    }
    const t = e.target;
    const typing = t && t.nodeType === 1 && t.closest && t.closest('.mp-url input');
    if (typing) { if (down) e.stopImmediatePropagation(); return; }
    if (e.code === 'Space' || e.key === ' ') {
      // preventDefault on keyup too, or a focused button would also fire its own click
      e.preventDefault();
      if (down) {
        e.stopImmediatePropagation();
        if (!e.repeat) this.toggle();
      }
    }
  }

  _render() {
    if (!this._root) return;
    const el = this._el;
    const it = this._item(this._cur);
    const playing = this.playing;
    el.now.textContent = it ? it.title : 'Nothing in the deck. Pick a tape below.';
    el.play.innerHTML = svg(playing ? ICON.pause : ICON.play);
    el.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    el.shuffle.setAttribute('aria-pressed', String(this._shuffle));
    el.loop.setAttribute('aria-pressed', String(this._loop));
    if (Number(el.vol.value) !== this._volume) el.vol.value = String(this._volume);
    el.status.textContent = this._status;
    this._renderProgress();

    const key = this._items.map((x) => x.id + ':' + Math.round(x.duration) + ':' + x.persisted).join('|') + '#' + this._cur;
    if (key === this._rowsKey) return;
    this._rowsKey = key;
    const hadFocus = el.list.contains(document.activeElement);
    const frag = document.createDocumentFragment();
    this._items.forEach((x, i) => {
      const li = document.createElement('li');
      li.className = 'mp-row' + (x.id === this._cur ? ' mp-cur' : '');
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'mp-pick';
      pick.dataset.index = String(i);
      if (x.id === this._cur) pick.setAttribute('aria-current', 'true');
      const num = document.createElement('span');
      num.className = 'mp-num';
      num.textContent = String(i + 1);
      const name = document.createElement('span');
      name.className = 'mp-name';
      name.textContent = x.title;
      name.title = x.title;
      const tag = document.createElement('span');
      tag.className = 'mp-tag';
      tag.textContent = KIND[x.kind] + (x.persisted ? '' : ', this visit only');
      const dur = document.createElement('span');
      dur.className = 'mp-dur';
      dur.textContent = fmt(x.duration);
      pick.append(num, name, tag, dur);
      pick.setAttribute('aria-label', `Play ${x.title}, ${KIND[x.kind]}, ${fmt(x.duration)}`);
      li.append(pick);
      if (x.kind !== 'builtin') {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'mp-del';
        del.dataset.id = x.id;
        del.setAttribute('aria-label', 'Remove ' + x.title);
        del.innerHTML = svg(ICON.close);
        li.append(del);
      }
      frag.append(li);
    });
    el.list.replaceChildren(frag);
    if (hadFocus) {
      const i = Math.max(0, this._index(this._cur));
      const b = el.list.querySelectorAll('.mp-pick')[i];
      if (b) b.focus({ preventScroll: true });
    }
  }

  _renderProgress() {
    if (!this._root) return;
    const el = this._el, v = this.video;
    const it = this._item(this._cur);
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : (it ? it.duration : 0);
    const t = it && v.getAttribute('src') ? v.currentTime : 0;
    const frac = dur > 0 ? clamp01(t / dur) : 0;
    el.fill.style.width = (frac * 100).toFixed(2) + '%';
    el.bar.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
    el.t0.textContent = it ? fmt(t).replace('--:--', '0:00') : '0:00';
    el.t1.textContent = fmt(dur);
  }
}
