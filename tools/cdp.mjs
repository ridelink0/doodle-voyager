// Minimal Chrome DevTools Protocol driver, no dependencies (Node 22 has a
// global WebSocket). Launches its own headless Chrome/Edge with a throwaway
// profile and closes it through CDP when done.
//   const b = await launch(); await b.goto(url); await b.eval('1+1');
//   await b.shot('x.png'); console.log(b.errors); await b.close();
// THREE_DIR=<an unpacked three@0.170.0 npm package> serves the import map's
// jsDelivr URLs from disk instead, for a machine that cannot reach the CDN.
// CHROME_FLAGS adds switches to the launch line (a container running as root
// needs --no-sandbox, which is not something to turn on anywhere else).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export function findChrome() {
  return CANDIDATES.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
}

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      (listeners.get(msg.method) || []).forEach((fn) => fn(msg.params));
    }
  });
  const open = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  return {
    open,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const n = ++id;
        pending.set(n, { resolve, reject });
        ws.send(JSON.stringify({ id: n, method, params }));
      });
    },
    on(method, fn) { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); },
    close() { try { ws.close(); } catch { /* already closed */ } },
  };
}

// Answers every request for three off jsDelivr with the same path out of dir.
// Only that one prefix is paused, so nothing else the page loads is touched.
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.170.0/';
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' };
async function serveThreeFrom(page, dir) {
  const root = path.resolve(dir);
  page.on('Fetch.requestPaused', async ({ requestId, request }) => {
    const rel = decodeURIComponent(new URL(request.url).pathname.slice(new URL(THREE_CDN).pathname.length));
    const file = path.resolve(root, rel);
    let body = null;
    if (file.startsWith(root + path.sep)) { try { body = fs.readFileSync(file); } catch { /* answered 404 below */ } }
    const headers = [{ name: 'Access-Control-Allow-Origin', value: '*' },
      { name: 'Content-Type', value: MIME[path.extname(file)] || 'application/octet-stream' }];
    await page.send('Fetch.fulfillRequest', body
      ? { requestId, responseCode: 200, responseHeaders: headers, body: body.toString('base64') }
      : { requestId, responseCode: 404, responseHeaders: headers, body: '' }).catch(() => {});
  });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: THREE_CDN + '*', requestStage: 'Request' }] });
}

export async function launch({ width = 1280, height = 720, headless = true } = {}) {
  const exe = findChrome();
  if (!exe) throw new Error('No Chrome or Edge found; set CHROME_PATH');
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'dv-cdp-'));
  const proc = spawn(exe, [
    headless ? '--headless=new' : '', '--remote-debugging-port=0', `--user-data-dir=${udd}`,
    `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl', '--mute-audio',
    ...(process.env.CHROME_FLAGS || '').split(/\s+/), 'about:blank',
  ].filter(Boolean), { stdio: ['ignore', 'ignore', 'pipe'] });
  const browserWs = await new Promise((res, rej) => {
    let buf = '';
    const t = setTimeout(() => rej(new Error('Chrome did not start in 30 s')), 30000);
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); res(m[1]); }
    });
    proc.on('exit', (c) => { clearTimeout(t); rej(new Error('Chrome exited early, code ' + c)); });
  });
  const port = new URL(browserWs).port;
  let pageInfo;
  for (let i = 0; i < 50 && !pageInfo; i++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    pageInfo = list.find((t) => t.type === 'page');
    if (!pageInfo) await new Promise((r) => setTimeout(r, 100));
  }
  const page = connect(pageInfo.webSocketDebuggerUrl);
  await page.open;
  const errors = [];
  const logs = [];
  page.on('Runtime.consoleAPICalled', (p) => {
    const text = p.args.map((a) => a.value ?? a.description ?? '').join(' ');
    logs.push(`[${p.type}] ${text}`);
    if (p.type === 'error' || p.type === 'assert') errors.push(text);
  });
  page.on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails;
    errors.push((d.exception && d.exception.description) || d.text);
  });
  page.on('Log.entryAdded', (p) => { if (p.entry.level === 'error') errors.push(`${p.entry.text} ${p.entry.url || ''}`.trim()); });
  await page.send('Runtime.enable');
  await page.send('Log.enable');
  await page.send('Page.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  if (process.env.THREE_DIR) await serveThreeFrom(page, process.env.THREE_DIR);

  const api = {
    errors, logs, send: page.send,
    async goto(url, { waitMs = 0 } = {}) {
      const loaded = new Promise((r) => page.on('Page.loadEventFired', r));
      await page.send('Page.navigate', { url });
      await Promise.race([loaded, new Promise((r) => setTimeout(r, 30000))]);
      if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
    },
    async eval(expression) {
      const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
      return r.result.value;
    },
    async shot(file) {
      const r = await page.send('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    },
    async key(key, { type = 'press', code } = {}) {
      const c = code || (key.length === 1 ? 'Key' + key.toUpperCase() : key);
      const base = { key, code: c, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0 };
      if (type === 'press' || type === 'down') await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
      if (type === 'press' || type === 'up') await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    },
    async click(x, y) {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      }
    },
    wait(ms) { return new Promise((r) => setTimeout(r, ms)); },
    async close() {
      try {
        const b = connect(browserWs);
        await b.open;
        await Promise.race([b.send('Browser.close'), new Promise((r) => setTimeout(r, 3000))]);
        b.close();
      } catch { /* browser already gone */ }
      page.close();
      await new Promise((r) => { if (proc.exitCode !== null) r(); else { proc.on('exit', r); setTimeout(r, 5000); } });
      try { fs.rmSync(udd, { recursive: true, force: true }); } catch { /* profile still locked, left in tmp */ }
    },
  };
  return api;
}
