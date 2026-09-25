// Copies only the playable files into dist/ for the local deploy, writes
// version.json (a hash per file, used by the monitor to spot drift) and a
// _headers file (served by tools/serve.mjs, and understood by Netlify or
// Vercel-style static hosts later) whose Content-Security-Policy carries the
// hash of the inline import map. Usage: node tools/stage.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SHIP = ['index.html', 'style.css', 'js', 'data', 'assets'];

// Everything but dist/.vercel goes: that folder is the link to the Vercel
// project, and wiping it made the next deploy create a stray project named
// "dist" instead of updating doodle-voyager (it happened twice).
fs.mkdirSync(DIST, { recursive: true });
for (const f of fs.readdirSync(DIST)) {
  if (f !== '.vercel') fs.rmSync(path.join(DIST, f), { recursive: true, force: true });
}
const files = {};
function copy(rel) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) return;
  const st = fs.statSync(src);
  if (st.isDirectory()) { for (const f of fs.readdirSync(src)) copy(path.join(rel, f)); return; }
  if (/(^|[\\/])\.|\.map$/.test(rel)) return;
  const dst = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  const buf = fs.readFileSync(src);
  files[rel.split(path.sep).join('/')] = { sha256: crypto.createHash('sha256').update(buf).digest('hex'), bytes: buf.length };
}
for (const r of SHIP) copy(r);

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
if (!m) throw new Error('index.html has no import map');
const mapHash = crypto.createHash('sha256').update(m[1], 'utf8').digest('base64');
const csp = [
  "default-src 'self'",
  `script-src 'self' https://cdn.jsdelivr.net 'sha256-${mapHash}'`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https://cdn.jsdelivr.net blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');
fs.writeFileSync(path.join(DIST, '_headers'), `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: DENY

/data/*
  Cache-Control: public, max-age=3600

/assets/*
  Cache-Control: public, max-age=86400
`);
// The same headers for Vercel, which reads vercel.json instead of _headers.
const hdr = [
  ['Content-Security-Policy', csp], ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'], ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
  ['X-Frame-Options', 'DENY'],
].map(([key, value]) => ({ key, value }));
fs.writeFileSync(path.join(DIST, 'vercel.json'), JSON.stringify({
  headers: [
    { source: '/(.*)', headers: hdr },
    { source: '/data/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }] },
    { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }] },
  ],
}, null, 1));
const version = { built: new Date().toISOString(), files };
fs.writeFileSync(path.join(DIST, 'version.json'), JSON.stringify(version, null, 1));
const total = Object.values(files).reduce((a, f) => a + f.bytes, 0);
console.log(`staged ${Object.keys(files).length} files, ${(total / 1e6).toFixed(2)} MB, into ${DIST}`);
