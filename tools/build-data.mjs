// Builds the real catalogues the game flies through.
//   node tools/build-data.mjs [--src tools/.scratch/data]
// Sources (licences in the CATALOG files):
//   NASA Exoplanet Archive, table pscomppars (fetched live)
//   OpenNGC NGC.csv (CC BY-SA 4.0)       -> <src>/ngc.csv, fetched if missing
//   HYG star database v4 (CC BY-SA 4.0)  -> <src>/hyg.csv, fetched if missing
//   Wikipedia "List of nearest galaxies" distances (table below) and the
//   galaxies' infobox coordinates (<src>/ib.json, <src>/hz.json, MediaWiki API)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const SRC = path.resolve(args.includes('--src') ? args[args.indexOf('--src') + 1] : path.join(ROOT, 'tools', '.scratch', 'data'));
const TODAY = new Date().toISOString().slice(0, 10);
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.mkdirSync(SRC, { recursive: true });

async function cached(file, url) {
  const p = path.join(SRC, file);
  if (fs.existsSync(p) && fs.statSync(p).size > 1000) return fs.readFileSync(p, 'utf8');
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const t = await r.text();
      fs.writeFileSync(p, t);
      return t;
    } catch (e) { console.warn(`fetch ${url} failed (${e.message}), retry ${i + 1}`); }
  }
  throw new Error(`could not download ${url}`);
}
function parseCSV(text, sep = ',') {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
const num = (v, d = 3) => { const n = parseFloat(v); if (!Number.isFinite(n)) return null; const k = 10 ** d; return Math.round(n * k) / k; };
const sexa = (s, hours) => {
  const m = String(s).trim().match(/^([+-]?)(\d+):(\d+):([\d.]+)/);
  if (!m) return null;
  const v = (Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 3600) * (m[1] === '-' ? -1 : 1);
  return num(hours ? v * 15 : v, 4);
};
const esc = (s) => String(s ?? '').replace(/\|/g, '/');
function writeJSON(file, obj) { fs.writeFileSync(path.join(ROOT, 'data', file), JSON.stringify(obj)); }
function writeCatalog(file, title, intro, fields, rows) {
  const out = [`# ${title}`, '', ...intro, '', `| ${fields.join(' | ')} |`, `|${fields.map(() => '---').join('|')}|`];
  for (const r of rows) out.push(`| ${r.map((v) => (v === null || v === undefined ? '' : esc(v))).join(' | ')} |`);
  fs.writeFileSync(path.join(ROOT, 'docs', file), out.join('\n') + '\n');
}

// ---------- exoplanets ----------
const TAP = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=select+pl_name,hostname,ra,dec,sy_dist,pl_rade,pl_orbsmax,pl_orbper,pl_eqt,st_teff,st_rad,disc_year,discoverymethod+from+pscomppars&format=csv';
const exoCsv = await cached('pscomppars.csv', TAP);
const exo = parseCSV(exoCsv).map((r) => [
  r.pl_name, r.hostname, num(r.ra, 4), num(r.dec, 4), num(r.sy_dist, 2), num(r.pl_rade, 2), num(r.pl_orbsmax, 4),
  num(r.pl_orbper, 3), num(r.pl_eqt, 0), num(r.st_teff, 0), num(r.st_rad, 2), num(r.disc_year, 0), r.discoverymethod,
]).filter((r) => r[0]);
const exoFields = ['pl', 'host', 'ra', 'dec', 'pc', 'rade', 'a', 'per', 'teq', 'steff', 'srad', 'year', 'method'];
writeJSON('exoplanets.json', { source: 'NASA Exoplanet Archive, Planetary Systems Composite Parameters (pscomppars)', fetched: TODAY, fields: exoFields, rows: exo });
writeCatalog('CATALOG-exoplanets.md', 'Every confirmed exoplanet in the game', [
  `Source: NASA Exoplanet Archive, table pscomppars (one row per confirmed planet), fetched ${TODAY}. ${exo.length} planets around ${new Set(exo.map((r) => r[1])).size} host stars.`,
  'pc = distance from the Sun in parsecs; rade = radius in Earth radii; a = semi-major axis in AU; per = orbital period in days; teq = equilibrium temperature in K.',
], exoFields, exo);
console.log(`exoplanets: ${exo.length}`);

// ---------- galaxies ----------
const ngc = parseCSV(await cached('ngc.csv', 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/NGC.csv'), ';');
const GAL = new Set(['G', 'GPair', 'GTrpl', 'GGroup']);
const C_KMS = 299792.458, H0 = 70, MPC_MLY = 3.26156;
const byKey = new Map();
const gal = [];
const pretty = (n) => n.replace(/^(NGC|IC)0*(\d+)(.*)$/, '$1 $2$3');
for (const r of ngc) {
  if (!GAL.has(r.Type)) continue;
  const name = pretty(r.Name);
  const alt = [];
  if (r.M) alt.push(`M${Number(r.M)}`);
  if (r['Common names']) alt.push(...r['Common names'].split(',').map((s) => s.trim()).filter(Boolean));
  const z = parseFloat(r.Redshift);
  const v = parseFloat(r.RadVel);
  const zz = Number.isFinite(z) ? z : Number.isFinite(v) ? v / C_KMS : NaN;
  const mly = zz > 0.003 ? num(((zz * C_KMS) / H0) * MPC_MLY, 2) : null;
  const row = {
    name, alt: alt.join(', '), type: r.Hubble || r.Type, ra: sexa(r.RA, true), dec: sexa(r.Dec, false), mly, dq: mly ? 'z' : 'est',
    size: num(r.MajAx, 2), mag: num(r['B-Mag'] || r['V-Mag'], 2), con: r.Const, group: r.M ? 'M' : name.startsWith('IC') ? 'IC' : 'NGC',
  };
  if (row.ra === null || row.dec === null) continue;
  gal.push(row);
  byKey.set(name.replace(/\s+/g, '').toLowerCase(), row);
  for (const a of alt) byKey.set(a.replace(/\s+/g, '').toLowerCase(), row);
}
// Local Group and neighbours: distances (Mly) from Wikipedia's "List of
// nearest galaxies" table (fetched 2026-09-22); parent w = Milky Way
// satellite, a = Andromeda, t = Triangulum, l = Local Group, n = nearby.
const LG = `Ursa Major III|0.033|w;Draco II|0.0701|w;Tucana III|0.0747|w;Segue 1|0.075|w;Sagittarius Dwarf Spheroidal Galaxy|0.078|w;Hydrus I|0.0913|w;Carina III|0.0907|w;Ursa Major II Dwarf|0.098|w;Triangulum II|0.098|w;Reticulum II|0.102|w;Segue 2|0.114|w;Carina II|0.122|w;Willman 1|0.124|w;Boötes II|0.137|w;Coma Berenices Dwarf|0.137|w;Pictor II|0.147|w;Boötes III|0.150|w;Tucana IV|0.157|w;Large Magellanic Cloud|0.163|w;Grus II|0.179|w;Tucana II|0.186|w;Boötes I|0.197|w;Small Magellanic Cloud|0.205|w;Ursa Minor Dwarf|0.205|w;Virgo II|0.235|w;Eridanus IV|0.250|w;Horologium II|0.254|w;Draco Dwarf|0.258|w;Horologium I|0.258|w;Pisces Overdensity|0.26|w;Leo Minor I|0.267|w;Aquarius III|0.277|w;Sextans Dwarf Spheroidal|0.280|w;Sculptor Dwarf Galaxy|0.287|w;Pegasus IV|0.294|w;Virgo I|0.297|w;Reticulum III|0.300|w;Ursa Major I Dwarf|0.3157|w;Phoenix II|0.326|w;Carina Dwarf Spheroidal Galaxy|0.33|w;Boötes V|0.333|w;Aquarius II|0.352|w;Aquarius IV|0.356|w;Leo VI|0.362|w;Pictor I|0.372|w;Crater II|0.383|w;Grus I|0.391|w;Sextans II|0.411|w;Antlia 2|0.430|w;Hercules Dwarf|0.434|w;Fornax Dwarf Spheroidal Galaxy|0.466|w;Canes Venatici II Dwarf|0.49|w;Hydra II|0.492|w;Virgo III|0.492|w;Leo IV Dwarf|0.502|w;Leo V Dwarf|0.571|w;Pisces II|0.597|w;Columba I|0.597|w;Boötes IV|0.682|w;Leo II Dwarf|0.701|w;Pegasus III|0.701|w;Canes Venatici I Dwarf|0.711|w;Cetus III|0.819|w;Leo I Dwarf|0.820|w;Eridanus II|1.19|w;Leo T Dwarf|1.35|w;Leo K|1.42|w;Phoenix Dwarf|1.44|w;Leo M|1.50|w;Pisces V|1.79|a;Barnard's Galaxy|1.859|l;NGC 185|2.05|a;Andromeda II|2.22|a;Cassiopeia II|2.221|a;IC 1613|2.24|l;Pegasus V|2.26|a;Leo A|2.34|w;Andromeda XVII|2.371|a;Andromeda XXV|2.401|a;Andromeda XI|2.41|a;Andromeda XX|2.417|a;Andromeda XXIII|2.440|a;IC 10|2.446|a;Andromeda III|2.45|a;Cassiopeia Dwarf|2.45|a;Andromeda XXVI|2.459|a;Cetus Dwarf|2.460|a;Pisces III|2.479|a;Andromeda XV|2.48|a;Messier 32|2.489|a;Andromeda IX|2.500|a;Pisces Dwarf|2.510|t;Cassiopeia III|2.518|a;Andromeda V|2.52|a;Lacerta I|2.521|a;NGC 147|2.53|a;Andromeda Galaxy|2.538|l;Pegasus Dwarf Spheroidal|2.55|a;Perseus I|2.560|a;Andromeda XIV|2.586|a;Andromeda I|2.61|a;Andromeda XXVIII|2.645|a;Messier 110|2.67|a;Andromeda VIII|2.700|a;Andromeda XXIX|2.704|a;Triangulum Galaxy|2.73|l;Andromeda XXI|2.802|a;Tucana Dwarf|2.87|l;Andromeda X|2.90|a;Andromeda XXIV|2.929|a;Pegasus Dwarf Irregular Galaxy|2.929|a;Pisces VII|2.99|t;Andromeda XXXV|3.023|a;Andromeda XII|3.027|a;Wolf–Lundmark–Melotte|3.043|l;Andromeda XIX|3.043|a;Andromeda XXII|3.219|a;Aquarius Dwarf Galaxy|3.22|l;Sagittarius Dwarf Irregular Galaxy|3.907|l;UGC 4879|3.956|l;Andromeda XVIII|3.960|a;Antlia Dwarf|4.28|l;Sextans A|4.31|l;NGC 3109|4.338|l;Antlia B|4.40|l;Sculptor A|4.40|l;Sextans B|4.47|l;Tucana B|4.56|l;Cassiopeia 1|5.19|n;Leo P|5.28|l;IC 5152|5.68|l;NGC 300|6.07|n;KKR 25|6.20|n;ESO 410-G005|6.213|n;ESO 294-010|6.36|n;NGC 55|6.52|n;UGCA 438|7.24|n;UGC 9128|7.31|n;IC 3104|7.40|n;GR 8|7.8|n;IC 4662|7.96|n;Dwingeloo 1|9.13|n;NGC 4214|9.59|n;NGC 4163|9.65|n`;
const PARENT = { w: 'LG-MW', a: 'LG-M31', t: 'LG-M33', l: 'LG', n: 'NEAR' };
const wikiPages = new Map();
function loadWiki(file) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(SRC, file), 'utf8'));
    const q = j.query || {};
    const alias = new Map();
    for (const n of [...(q.normalized || []), ...(q.redirects || [])]) alias.set(n.from.replace(/_/g, ' '), n.to);
    for (const p of q.pages || []) {
      const content = p.revisions && p.revisions[0] && (p.revisions[0].slots ? p.revisions[0].slots.main.content : p.revisions[0].content);
      if (content) wikiPages.set(p.title, content);
    }
    for (const [from, to] of alias) if (wikiPages.has(to) && !wikiPages.has(from)) wikiPages.set(from, wikiPages.get(to));
  } catch (e) { console.warn(`${file}: ${e.message}`); }
}
loadWiki('ib.json');
loadWiki('hz.json');
// Fetch infoboxes for any listed galaxy not in the saved batches (40 titles a request).
{
  const want = LG.split(';').map((s) => s.split('|')[0]).filter((n) => !wikiPages.has(n));
  for (let i = 0; i < want.length; i += 40) {
    const file = `lg-wiki-${i / 40}.json`;
    const titles = want.slice(i, i + 40).map(encodeURIComponent).join('%7C');
    try {
      await cached(file, `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json&formatversion=2&titles=${titles}`);
      loadWiki(file);
    } catch (e) { console.warn(e.message); }
  }
}
// An infobox field's value, which may be multi-line or sit on one line with
// others; stops at the next top-level "|" or newline, keeping {{...}} whole.
const field = (text, key) => {
  const m = text.match(new RegExp(`\\|\\s*${key}\\s*=\\s*`));
  if (!m) return '';
  let out = '', depth = 0;
  for (let i = m.index + m[0].length; i < text.length; i++) {
    const two = text.slice(i, i + 2), c = text[i];
    if (two === '{{' || two === '[[') { depth++; out += two; i++; continue; }
    if (two === '}}' || two === ']]') { if (depth === 0) break; depth--; out += two; i++; continue; }
    if (depth === 0 && (c === '|' || c === '\n')) break;
    out += c;
  }
  return out.trim();
};
const clean = (s) => s.replace(/<ref[^>]*\/>|<ref[\s\S]*?<\/ref>/g, '').replace(/\{\{[^{}]*\}\}/g, '').replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?/g, '').trim();
// {{RA|05|23|34}}, {{DEC|-69|45.4}}, "00h 37m 07s", "+44° 19′ 20″" all parse.
function coord(s, isRa) {
  if (!s) return null;
  const t = s.replace(/<ref[^>]*\/>|<ref[\s\S]*?<\/ref>/g, '');
  const tm = t.match(isRa ? /\{\{\s*RA\s*\|([^}]*)\}\}/i : /\{\{\s*DEC\s*\|([^}]*)\}\}/i);
  const body = tm ? tm[1].split('|').join(' ') : t;
  const neg = !isRa && /^\s*[-−–]/.test(body);
  const nums = (body.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  if (!nums.length) return null;
  const v = nums[0] + (nums[1] || 0) / 60 + (nums[2] || 0) / 3600;
  if (isRa ? v >= 24 : v > 90) return null;
  return num(isRa ? v * 15 : neg ? -v : v, 4);
}
// Page titles differ from the list's names; try the usual variants.
const variants = (n) => [...new Set([n, `${n} Galaxy`, n.replace(/ Dwarf$/, ' Dwarf Galaxy'), n.replace(/ Galaxy$/, ''), n.replace(/ Dwarf Spheroidal Galaxy$/, ' Dwarf Spheroidal'), n.replace(/ Dwarf$/, ''), `${n} (galaxy)`, `${n} (dwarf galaxy)`])];
const pageFor = (n) => { for (const v of variants(n)) { const t = wikiPages.get(v); if (t && /ra\s*=/.test(t)) return t; } return ''; };
{
  const still = LG.split(';').map((s) => s.split('|')[0]).filter((n) => !pageFor(n));
  const titles = [...new Set(still.flatMap(variants))].filter((v) => !wikiPages.has(v));
  for (let i = 0; i < titles.length; i += 40) {
    const file = `lg-var-${i / 40}.json`;
    try {
      await cached(file, `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json&formatversion=2&titles=${titles.slice(i, i + 40).map(encodeURIComponent).join('%7C')}`);
      loadWiki(file);
    } catch (e) { console.warn(e.message); }
  }
}
let lgAdded = 0, lgMerged = 0, lgMissing = [];
for (const item of LG.split(';')) {
  const [name, mlyS, p] = item.split('|');
  const mly = Number(mlyS);
  const text = pageFor(name);
  const ids = (field(text, 'names') + ' ' + name).match(/\b(NGC|IC)\s?\d+|\bM\s?\d{1,3}\b|Messier \d+/g) || [];
  let row = byKey.get(name.replace(/\s+/g, '').toLowerCase()) || null;
  if (!row) for (const id of ids) { row = byKey.get(id.replace(/Messier\s*/, 'M').replace(/\s+/g, '').toLowerCase()); if (row) break; }
  if (row) {
    const common = /^(NGC|IC|Messier)\s/.test(name) ? null : name;
    if (common && !row.alt.includes(common)) row.alt = [common, row.alt].filter(Boolean).join(', ');
    if (common) { row.alt = [row.name, row.alt].filter(Boolean).join(', '); row.name = common; }
    row.mly = mly; row.dq = 'lit'; row.group = PARENT[p];
    lgMerged++;
    continue;
  }
  const ra = coord(field(text, 'ra'), true), dec = coord(field(text, 'dec'), false);
  if (ra === null || dec === null) { lgMissing.push(name); continue; }
  gal.push({ name, alt: '', type: clean(field(text, 'type')) || 'dwarf', ra, dec, mly, dq: 'lit', size: null, mag: null, con: clean(field(text, 'constellation name')), group: PARENT[p] });
  lgAdded++;
}
// Redshift record holders: comoving distance in flat LCDM (H0 70, Om 0.3).
function comovingMly(z) {
  const n = 4000; let s = 0;
  for (let i = 0; i < n; i++) { const zz = (z * (i + 0.5)) / n; s += 1 / Math.sqrt(0.3 * (1 + zz) ** 3 + 0.7); }
  return num(((C_KMS / H0) * (s * (z / n))) * MPC_MLY, 0);
}
const HZ = [['GN-z11', 10.6034], ['JADES-GS-z13-0', 13.2], ['JADES-GS-z14-0', 14.32], ['MoM-z14', 14.44]];
const hzMissing = [];
for (const [name, zDefault] of HZ) {
  const text = wikiPages.get(name) || '';
  const zm = field(text, 'z') || field(text, 'redshift');
  const zParsed = parseFloat(clean(zm).replace(/[^\d.]/g, ''));
  const z = Number.isFinite(zParsed) && zParsed > 5 ? zParsed : zDefault;
  const ra = coord(field(text, 'ra'), true), dec = coord(field(text, 'dec'), false);
  if (ra === null || dec === null) { hzMissing.push(name); continue; }
  gal.push({ name, alt: `z=${z}`, type: 'high-redshift', ra, dec, mly: comovingMly(z), dq: 'z', size: null, mag: null, con: clean(field(text, 'constellation name')), group: 'HZ' });
}
gal.unshift({ name: 'Milky Way', alt: 'our galaxy', type: 'SBbc', ra: 266.4168, dec: -29.0078, mly: 0, dq: 'lit', size: null, mag: null, con: 'Sgr', group: 'MW' });
const galFields = ['name', 'alt', 'type', 'ra', 'dec', 'mly', 'dq', 'size', 'mag', 'con', 'group'];
const galRows = gal.map((g) => galFields.map((f) => g[f] ?? null));
writeJSON('galaxies.json', { source: 'OpenNGC (CC BY-SA 4.0) + Wikipedia List of nearest galaxies + Wikipedia infoboxes', fetched: TODAY, fields: galFields, rows: galRows });
writeCatalog('CATALOG-galaxies.md', 'Every catalogued galaxy in the game', [
  `Sources: OpenNGC NGC.csv (github.com/mattiaverga/OpenNGC, CC BY-SA 4.0) for every NGC and IC object typed as a galaxy, pair, triplet or group; Wikipedia "List of nearest galaxies" for Local Group distances; Wikipedia infoboxes for coordinates of galaxies not in NGC/IC; built ${TODAY}. ${galRows.length} rows.`,
  'dq: z = distance from redshift (Hubble law, H0 = 70; comoving distance for the high-redshift record holders), lit = literature distance, est = no distance in the source (the game estimates one from brightness).',
  'This is every galaxy these catalogues hold, not every galaxy there is: the observable universe has an estimated 200 billion to 2 trillion. See RESEARCH-universe.md.',
  `Listed in the nearest-galaxies table but not placed in the game, because no coordinates could be read from their Wikipedia pages: ${lgMissing.join(', ') || 'none'}.`,
], galFields, galRows);
console.log(`galaxies: ${galRows.length} (Local Group merged ${lgMerged}, added ${lgAdded}; no coordinates for: ${lgMissing.join(', ') || 'none'}; high-z missing: ${hzMissing.join(', ') || 'none'})`);

// ---------- stars (HYG) ----------
const hyg = parseCSV(await cached('hyg.csv', 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv'));
const stars = [];
for (const r of hyg) {
  const dist = parseFloat(r.dist), mag = parseFloat(r.mag);
  if (!(dist > 0) || dist >= 100000 || r.proper === 'Sol') continue;
  if (!(mag <= 6.5 || dist <= 25)) continue;
  const con = r.con || '';
  const name = r.proper || (r.bayer ? `${r.bayer} ${con}` : r.flam ? `${r.flam} ${con}` : r.hip ? `HIP ${r.hip}` : r.gl ? r.gl : r.hd ? `HD ${r.hd}` : `HYG ${r.id}`);
  stars.push([name.trim(), num(parseFloat(r.ra) * 15, 4), num(r.dec, 4), num(dist, 2), num(mag, 2), r.spect || null, num(r.ci, 2)]);
}
const starFields = ['name', 'ra', 'dec', 'pc', 'mag', 'spect', 'ci'];
writeJSON('stars.json', { source: 'HYG database v4 (astronexus, CC BY-SA 4.0): Hipparcos, Yale Bright Star, Gliese', fetched: TODAY, fields: starFields, rows: stars });
writeCatalog('CATALOG-stars.md', 'Real stars in the game (HYG)', [
  `Source: HYG database v4 by David Nash (astronexus), CC BY-SA 4.0, combining Hipparcos, the Yale Bright Star Catalog and the Gliese catalog; built ${TODAY}. Kept: every star brighter than magnitude 6.5 (naked eye) or within 25 parsecs. ${stars.length} stars.`,
  'pc = distance in parsecs; mag = apparent visual magnitude; ci = B-V colour index. Stars with known planets are merged with the exoplanet hosts in the game.',
], starFields, stars);
console.log(`stars: ${stars.length}`);
for (const f of ['exoplanets.json', 'galaxies.json', 'stars.json']) console.log(`${f}: ${(fs.statSync(path.join(ROOT, 'data', f)).size / 1e6).toFixed(2)} MB`);
