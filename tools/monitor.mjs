// Daily health check for the deployed game. Scheduled by Windows Task
// Scheduler (see docs/MONITORING.md); safe to run by hand any time.
//   node tools/monitor.mjs [--url https://example.netlify.app/] [--no-browser]
// Appends one line to docs/monitor-log.md, writes docs/monitor-last.json and a
// screenshot in docs/monitor/, and exits 1 when anything failed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'deploy.json'), 'utf8')); } catch { /* no deploy record yet */ }
const SITE = (opt('--url', cfg.url || '') || '').replace(/\/?$/, '/');
if (!SITE || SITE === '/') { console.error('No site URL: pass --url or write docs/deploy.json {"url": "..."}'); process.exit(2); }

const checks = [];
const add = (name, ok, detail = '') => { checks.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`); };
async function get(url, { method = 'GET' } = {}) {
  const t0 = performance.now();
  try {
    const r = await fetch(url, { method, redirect: 'follow', cache: 'no-store' });
    const buf = method === 'HEAD' ? null : Buffer.from(await r.arrayBuffer());
    return { status: r.status, ms: Math.round(performance.now() - t0), buf, headers: r.headers };
  } catch (e) {
    return { status: 0, ms: Math.round(performance.now() - t0), err: e.message, headers: new Headers() };
  }
}

// 1. front page, headers, timing. The game is deployed locally, so if the
// local server is down the monitor restarts it and says so in the log.
let home = await get(SITE);
if (home.status === 0 && /^http:\/\/(127\.0\.0\.1|localhost)/.test(SITE)) {
  const { spawn } = await import('node:child_process');
  const port = new URL(SITE).port || '80';
  const child = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.mjs'), '--port', port, '--root', path.join(ROOT, 'dist')], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  await new Promise((r) => setTimeout(r, 1500));
  home = await get(SITE);
  add('local server was down and has been restarted', home.status === 200, `status after restart ${home.status}`);
}
add('front page answers', home.status === 200, `${home.status} in ${home.ms} ms`);
add('front page under 2 s', home.ms < 2000, `${home.ms} ms`);
const csp = home.headers.get('content-security-policy') || '';
add('security headers present', /script-src/.test(csp) && home.headers.get('x-content-type-options') === 'nosniff');

// 2. every shipped file against the local build (drift)
const local = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'version.json'), 'utf8')); } catch { return null; } })();
const live = await get(SITE + 'version.json');
let liveV = null;
try { liveV = JSON.parse(live.buf.toString('utf8')); } catch { /* not json */ }
add('version.json served', !!liveV, liveV ? `built ${liveV.built}` : `status ${live.status}`);
if (liveV) {
  const names = Object.keys(liveV.files);
  let bad = [], slow = 0, bytes = 0;
  for (const f of names) {
    const r = await get(SITE + f.split('/').map(encodeURIComponent).join('/'));
    if (r.status !== 200) { bad.push(`${f} ${r.status}`); continue; }
    bytes += r.buf.length;
    if (r.ms > 5000) slow++;
    const h = crypto.createHash('sha256').update(r.buf).digest('hex');
    if (h !== liveV.files[f].sha256) bad.push(`${f} hash mismatch`);
  }
  add(`all ${names.length} files served intact`, bad.length === 0, bad.slice(0, 6).join(', ') || `${(bytes / 1e6).toFixed(1)} MB`);
  add('no file slower than 5 s', slow === 0, `${slow} slow`);
  if (local) {
    const drift = names.filter((f) => !local.files[f] || local.files[f].sha256 !== liveV.files[f].sha256);
    const missing = Object.keys(local.files).filter((f) => !liveV.files[f]);
    add('live site matches the local build', drift.length === 0 && missing.length === 0, [...drift.map((f) => `changed ${f}`), ...missing.map((f) => `not deployed ${f}`)].slice(0, 6).join(', '));
  }
}

// 3. third parties the game needs
const three = await get('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js', { method: 'HEAD' });
add('three.js CDN reachable', three.status === 200, `${three.status} in ${three.ms} ms`);
const fonts = await get('https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Patrick+Hand&display=swap');
add('Google Fonts reachable', fonts.status === 200, `${fonts.status}`);

// 4. nothing private is exposed
for (const p of ['.git/HEAD', 'tools/test.mjs', 'docs/PLAN.md', '.env']) {
  const r = await get(SITE + p, { method: 'HEAD' });
  add(`not exposed: /${p}`, r.status === 404 || r.status === 403, `${r.status}`);
}

// 5. the game boots in a real browser
let shot = null;
if (!args.includes('--no-browser')) {
  let b;
  try {
    b = await launch({ width: 1280, height: 720 });
    await b.goto(SITE);
    let ready = false;
    for (let i = 0; i < 180 && !ready; i++) { ready = await b.eval('!!(window.__dv && window.__dv.ready)'); if (!ready) await b.wait(500); }
    add('game boots in headless Chrome', ready);
    if (ready) {
      const info = await b.eval('({ counts: window.__dv.u.counts, zones: window.__dv.u.zones.length })');
      add('catalogues loaded', info.counts.galaxies > 1000 && info.counts.planets > 1000, JSON.stringify(info.counts));
      add('enemy zones rolled', info.zones > 0, `${info.zones} zones`);
      await b.eval('window.__dv.launch()');
      await b.wait(4000);
      const fps = await b.eval('window.__dv.fps');
      add('renders frames', fps > 2, `${fps.toFixed(1)} fps (software GL, headless)`);
      fs.mkdirSync(path.join(ROOT, 'docs', 'monitor'), { recursive: true });
      shot = path.join(ROOT, 'docs', 'monitor', `${new Date().toISOString().slice(0, 10)}.png`);
      await b.shot(shot);
    }
    const errs = b.errors.filter((e) => !/favicon/.test(e));
    add('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    add('browser check ran', false, e.message);
  } finally {
    if (b) await b.close();
  }
  // keep two weeks of screenshots
  try {
    const dir = path.join(ROOT, 'docs', 'monitor');
    const pngs = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
    for (const f of pngs.slice(0, Math.max(0, pngs.length - 14))) fs.rmSync(path.join(dir, f));
  } catch { /* no screenshots yet */ }
}

const failed = checks.filter((c) => !c.ok);
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
const line = `| ${stamp} | ${failed.length ? 'FAIL' : 'ok'} | ${checks.length - failed.length}/${checks.length} | ${failed.map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ''}`).join('; ').replace(/\|/g, '/') || '-'} |\n`;
const logPath = path.join(ROOT, 'docs', 'monitor-log.md');
if (!fs.existsSync(logPath)) fs.writeFileSync(logPath, `# Doodle Voyager monitor log\n\nSite: ${SITE}\n\n| when (UTC) | result | passed | failures |\n|---|---|---|---|\n`);
fs.appendFileSync(logPath, line);
fs.writeFileSync(path.join(ROOT, 'docs', 'monitor-last.json'), JSON.stringify({ site: SITE, at: new Date().toISOString(), checks, screenshot: shot }, null, 1));
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
