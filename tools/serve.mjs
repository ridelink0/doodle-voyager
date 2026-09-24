// Static server for local play and tests. Range requests are supported so the
// MP4 player can seek. Usage: node tools/serve.mjs [--port 5178] [--root .]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(opt('--root', path.join(here, '..')));
const PORT = Number(opt('--port', process.env.PORT || 5178));

// Headers from a Netlify-style _headers file in the root (written by
// tools/stage.mjs): the "/*" block applies to every response.
const EXTRA = {};
try {
  const lines = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').split(/\r?\n/);
  let inAll = false;
  for (const line of lines) {
    if (!line.trim()) { inAll = false; continue; }
    if (!/^\s/.test(line)) { inAll = line.trim() === '/*'; continue; }
    const m = inAll && line.trim().match(/^([\w-]+):\s*(.+)$/);
    if (m) EXTRA[m[1].toLowerCase()] = m[2];
  }
} catch { /* serving the source tree, no headers file */ }

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, path.normalize(rel));
  if (!file.startsWith(ROOT) || /[\\/]\.(git|env)/.test(file)) { res.writeHead(404).end('not found'); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = { ...EXTRA, 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' };
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      let start = range[1] === '' ? st.size - Number(range[2]) : Number(range[1]);
      let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : st.size - 1;
      if (start < 0) start = 0;
      if (start >= st.size || end < start) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }).end(); return; }
      end = Math.min(end, st.size - 1);
      res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, 'content-length': st.size });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
});
server.listen(PORT, '127.0.0.1', () => console.log(`Doodle Voyager on http://127.0.0.1:${PORT}/  (root ${ROOT})`));
