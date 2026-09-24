# Spec: universe density everywhere + galaxy clusters/superclusters

Owner: Gev. Research/design only, written 2026-09-24. Project root `D:\doodle-voyager`.
Read `docs/PLAN.md` and `docs/HANDOFF.md` first; this spec assumes the module
contracts there. Nothing outside `docs/specs/` was changed to produce this
document.

Gev's ask, verbatim: *"There is only one place where everything is, basically
the Milky Way Galaxy. Make the amount of stuff in the Milky Way present
everywhere else, and expand it by adding more galaxies or something. I keep
wasting gas and getting annoyed, but I like the game being annoying, so just
keep that."*

That last sentence is a hard constraint: **do not touch `pcToU`, `lateralScale`,
`warpCost`, cruise speed, or the 42% fuel-station rule.** Every change below
only adds *content* (systems, stations, shops, zones, sights, galaxies,
labelled regions). Travel time and fuel cost per unit distance are unchanged,
so the game stays exactly as annoying, there is just more to be annoyed by.

## 1. Measured baseline (why it feels empty everywhere but home)

Data on disk right now (`data/*.json`, verified this session):

| file | rows |
|---|---|
| `galaxies.json` | 10,828 (10,827 non-Milky-Way) |
| `exoplanets.json` | 6,338 planets / 4,747 unique hosts (`pc>0`, valid ra/dec) |
| `stars.json` | 11,398 rows with a usable position (11,071 after `js/universe.js:466` dedupes against hosts and drops Sol) |
| `sights.json` | 69 (13 nebulae, 5 remnants, 10 clusters, 18 stars, 5 black holes, 6 pulsars, 12 systems) |

**The Milky Way is special-cased; every other galaxy is not.** In
`js/universe.js`:

- `buildMilkyWay()` (lines 408-490) builds Sol + every real exoplanet host +
  every real HYG star + 900 seeded "uncharted" fillers directly into
  `systemCache.set(mw.id, systems)`. Total: **1 + 4,747 + ~11,071 + 900 ≈
  16,719 star systems**, inside a hand-authored `R = 5.6e8` game units
  (`universe.js:413`).
- Every other galaxy gets its systems from the generic `systemsOf(g)`
  (lines 699-716), whose entire count formula is:

  ```js
  // universe.js:703
  const n = clamp(Math.round(g.R / 4e6), 10, 120);
  ```

  Since `g.R` is clamped to `[2e7, 4e8]` (`universe.js:602`), **every galaxy in
  the game, from a Local Group dwarf to Andromeda to a giant Virgo elliptical,
  gets between 10 and 120 procedural star systems, full stop** - regardless of
  its real physical size. Verified with the actual catalogue row for
  Andromeda (`mly: 2.538`, `size: 177.83` arcmin, type `Sb`): `R = 7.03e7`,
  `n = 18`. Eighteen systems for the whole of Andromeda, next to the Milky
  Way's ~16,719.
- **Enemy zones**: `rollZones()` (lines 783-804) puts 10 anchors inside the
  Milky Way (2 near/5 mid/3 far out of its ~16,700 systems) and then spreads
  **12 more zones total** across the 60 nearest real galaxies
  (`.slice(0, 60)` at line 796). The other 10,767 catalogued galaxies get
  **zero** zones, ever.
- **Sights**: `buildSights()` (lines 615-641) places a sight either at real
  `ra/dec/pc` or inside a named galaxy via the `sights.json` `galaxy` column.
  Only **4 of the 69 sights** carry a `galaxy` value; the rest resolve to
  positions that are almost all inside or near the Milky Way. No other galaxy
  has a guaranteed nebula, cluster, remnant, pulsar or black hole to find.
- **Shops**: the only multi-module shop cluster (`BAZAAR_MODULES`,
  `universe.js:348-361`, 12 modules) is one hard-coded object
  (`buildBazaar()`, lines 643-668) parked between the Milky Way and Andromeda.
  No other galaxy has anything like it. Single fuel pumps *do* scale (they
  come from the generic 42% rule in `makeSystem`, line 501), but only 10-120
  systems' worth of them per galaxy.
- **Stations/fuel** (`makeSystem`, lines 492-508): unaffected by any of this -
  the 42%-chance-of-a-pump rule already applies per system, generically, for
  every galaxy. It just doesn't have enough systems to work with outside the
  Milky Way. **No change needed here.**

Net effect: leave the Milky Way and the entire rest of the universe - 10,827
real galaxies plus everything past them - is basically wallpaper: a few dozen
procedural dots per galaxy, no fuel security, no shops, almost never an enemy
zone or a named sight. That is exactly what Gev described.

## 2. Design overview

Two independent pieces, both additive, both deterministic from the galaxy's
own seed (no player/session state, so the memory-budget eviction in section 5
can drop and regenerate a galaxy's content bit-for-bit identical):

**A. Per-galaxy density.** Replace the flat `clamp(R/4e6, 10, 120)` system
count with a formula keyed to the galaxy's *real* physical size (`rkpc`,
already computed for every catalogue row) and morphological type, calibrated
directly off the Milky Way's own real system count so the two are provably
comparable. Scale enemy zones, procedural sights and a smaller Bazaar-style
shop hub off the same per-galaxy count. Stations/fuel need no change (§1).

**B. More galaxies.** Add seven named galaxy-cluster/supercluster regions
with real sky positions (Local Group, Virgo, Fornax, Coma, Hydra-Centaurus/
Great Attractor, Perseus-Pisces, Laniakea), shown on the map as large labelled
circles, and bias the existing procedural "uncharted" galaxy generator so
clusters/superclusters are denser with galaxies than empty space - which is
also physically correct (galaxies really do cluster). Uncharted-galaxy growth
gets an explicit cap so it doesn't grow forever in a long session.

## 3. Part A - per-galaxy system density

### 3.1 The formula

Add near the top of `js/universe.js`, after `DEFAULT_KPC` (line 67):

```js
// Kind multiplier and hard floor/ceiling for a galaxy's generated system
// count. Ceilings exist purely for the Chromebook performance budget
// (section 6) - see the calibration note below for why they're never hit by
// a typical spiral/barred galaxy at real Milky-Way-ish size.
const KIND_MULT = { spiral: 1.00, barred: 1.00, lenticular: 0.55, elliptical: 0.50, irregular: 0.30, dwarf: 0.12 };
const N_MIN     = { spiral: 500,  barred: 500,  lenticular: 300,  elliptical: 300,  irregular: 150,  dwarf: 40  };
const N_MAX     = { spiral: 5000, barred: 5000, lenticular: 3000, elliptical: 3000, irregular: 1200, dwarf: 320 };
```

In `buildGalaxies(data)` (`universe.js:582`), *before* the `for (const row of
rows)` loop, self-calibrate off the Milky Way that was just built two lines
above in `load()` (`buildMilkyWay` runs before `buildGalaxies`, `universe.js:
388`), so a future catalogue refresh (`docs/TODO.md` "catalogue refresh
script") never desyncs this constant from reality:

```js
// universe.js:582, inside buildGalaxies(), before the row loop
const BASE_N = this.systemCache.get(this.mw.id).length; // ~16,719 today
const BASE_KPC = DEFAULT_KPC.barred; // 14 - the Milky Way classifies SBbc -> 'barred'
```

Then, in the same loop where `kind` and `rkpc` are already computed
(`universe.js:599-601`), stash `rkpc` on the galaxy object (it currently isn't
kept - only used transiently to size `R`):

```js
// universe.js:600-602, existing code shown for context
const kind = classify(row.type);
let rkpc = DEFAULT_KPC[kind];
if (row.size > 0) rkpc = ((row.size / 60) * (Math.PI / 180) * pc) / 2 / 1000;
// ADD: keep it, addGalaxy(...) below gets an extra field
```

```js
// universe.js:606, inside the addGalaxy({...}) call, add one field:
rkpc,
```

Finally, replace the count formula in `systemsOf(g)` (`universe.js:703`):

```js
// universe.js:699-716, was:
//   const n = clamp(Math.round(g.R / 4e6), 10, 120);
// becomes:
systemsOf(g) {
  let list = this.systemCache.get(g.id);
  if (list) { this.touchCache(g.id); return list; }         // see 5.1 (LRU)
  const r = rng(g.seed ^ 0xa11ce);
  const n = g === this.mw ? /* unreachable, MW is cached at load */ 0
    : clamp(Math.round(BASE_N * Math.pow((g.rkpc || DEFAULT_KPC[g.kind] || 10) / BASE_KPC, 3) * (KIND_MULT[g.kind] ?? 0.3)),
            N_MIN[g.kind] ?? 150, N_MAX[g.kind] ?? 1200);
  const pts = shapePoints(g.kind, g.R, r, n);
  rotateAll(pts, g.rot);
  ...  // unchanged from here
}
```

`BASE_N` and `BASE_KPC` need to be reachable from `systemsOf` - store them as
`this.baseN` / `this.baseKpc` set at the end of `buildGalaxies` instead of
locals, or hoist the two `const`s to module scope computed lazily on first
use. Either is fine; keep them as instance fields (`this.baseN`) since
`buildGalaxies` already runs on `this`.

Procedural (`uncharted`) galaxies (`universe.js:757-781`, `group: 'UNCHARTED'`)
get the same treatment: they already set `kind` from the same
`['spiral','spiral','barred','elliptical','irregular','lenticular','dwarf']`
pick (line 772) and a random `R` in `[5e7, 3e7+2.5e8]`
(`R: 5e7 + r() * 2.5e8`, line 777) but no `rkpc`. Give them one at creation
(`universe.js:774-778`, inside the `addGalaxy({...})` call for uncharted
galaxies):

```js
rkpc: DEFAULT_KPC[kind] * (0.6 + r() * 0.8), // +/-40% variety, same table as real galaxies
```

so they run through the identical `systemsOf` formula and feel exactly as
populated as a catalogued galaxy of the same kind.

### 3.2 Calibration check (worked examples, verified this session)

`BASE_N ≈ 16,719`, `BASE_KPC = 14`.

| galaxy | kind | rkpc (real, from catalogue `size`/`mly`) | raw formula | clamped result | old result |
|---|---|---|---|---|---|
| Andromeda (M31) | spiral | 20.13 | 16,719 × (20.13/14)³ × 1.00 ≈ 49,691 | **5,000** (N_MAX) | 18 |
| M87 / NGC 4486 (Virgo, elliptical) | elliptical | ≈17.0 | 16,719 × (17/14)³ × 0.50 ≈ 15,030 | **3,000** (N_MAX) | ~18 |
| Andromeda I (Local Group dwarf, no `size`) | dwarf | 0.8 (`DEFAULT_KPC.dwarf`) | 16,719 × (0.8/14)³ × 0.12 ≈ 0.4 | **40** (N_MIN) | 10 |
| a mid-size spiral at real `rkpc ≈ 7` (half MW) | spiral | 7.0 | 16,719 × (7/14)³ × 1.00 ≈ 2,090 | **2,090** (inside band, un-clamped) | ~ 10-120 depending on distance |

Reading the table: big, close, disc-shaped galaxies hit the 5,000/3,000
ceilings (a firm, predictable performance cap, see §6); small dwarfs sit on
the 40-320 floor (never literally empty); everything in between scales off
its own real size, which is the "within 30%" property the headless check in
§7 verifies directly against this exact formula (it can't drift, because the
check re-derives the same formula from `BASE_N`/`BASE_KPC` rather than
hard-coding today's numbers).

### 3.3 Zones - scale the existing `rollZones` loop, don't rewrite it

`rollZones(seed, liberated)` (`universe.js:783-804`) keeps its exact shape
(minimal change, per Gev's rule). Two numbers change:

```js
// universe.js:796, was:
//   const gals = this.galaxies.filter((g) => g !== this.mw && g.real)
//     .map((g) => ({ g, d: ... })).sort(...).slice(0, 60);
// becomes: widen the candidate pool
const gals = this.galaxies.filter((g) => g !== this.mw && g.real)
  .map((g) => ({ g, d: Math.hypot(g.pos.x, g.pos.y, g.pos.z) })).sort((a, b) => a.d - b.d).slice(0, 150);

// universe.js:797, was:
//   for (let i = 0; i < 12 && gals.length; i++) {
// becomes: scale the zone budget off the same MW ratio this file already
// implies (10 zones for ~16,719 MW systems -> ~0.0006 per system), applied
// per picked galaxy's own new (much bigger) system count instead of a flat
// count, so a populous galaxy gets proportionally more danger:
const ZONE_RATE = 10 / this.baseN; // ~0.0006, self-calibrated with 3.1
let otherZones = 0;
const OTHER_ZONE_CAP = 220; // hard ceiling on this pass, see 6.2
for (let i = 0; i < gals.length && otherZones < OTHER_ZONE_CAP; i++) {
  const g = pick(r, gals).g;
  const want = clamp(Math.round(this.systemsOf(g).length * ZONE_RATE), 1, 6); // >=1: a visited galaxy is never zone-free
  for (let k = 0; k < want && otherZones < OTHER_ZONE_CAP; k++) { add(pick(r, this.systemsOf(g)), g.pc < 2e6 ? 3 : 4); otherZones++; }
}
```

With the widened 150-galaxy pool and per-galaxy `want` (1-6, weighted by the
galaxy's own size via its new system count), a typical log-on now rolls
roughly 60-150 zones spread across up to 150 different real galaxies instead
of 12 zones spread across 12, without changing tier difficulty, payout, or
the "liberated sectors stay liberated forever" rule (`state.liberated`,
untouched). `add()` (line 786) is unchanged. This also means `systemsOf(g)`
gets called for up to 150 galaxies at every log-on/log-off - see §6.1 for the
measured cost and why that's fine as a one-time, non-per-frame hit.

Scope note: this only touches `real` catalogued galaxies (`g.real`, i.e. not
`UNCHARTED`), same as today - matching Gev's actual complaint (Andromeda,
Virgo, etc. having nothing in them). Extending zones into procedural galaxies
past the catalogue is a trivial follow-up (same loop, drop the `g.real`
filter) but out of scope here to keep the change minimal.

### 3.4 Sights - one guaranteed black hole per big galaxy, a few extra per size

New method, called lazily (see §5) the first time a galaxy needs full detail
(inside `detailFor`, `universe.js:719-749`, right after `systems =
this.systemsOf(g)` at line 723):

```js
// New: js/universe.js, near buildSights (after line 641)
proceduralSightsFor(g) {
  if (g.sighted || g === this.mw) return; // MW keeps its real, catalogue-driven sights only
  g.sighted = true;
  const r = rng(g.seed ^ 0x519f7);
  const n = clamp(Math.round((g.systemCount || this.systemsOf(g).length) / 400), 0, 8);
  const kinds = ['nebula', 'nebula', 'cluster', 'remnant', 'pulsar'];
  // every spiral/barred/elliptical/lenticular galaxy gets a central supermassive
  // black hole - true of every galaxy massive enough to be in this table
  // (real astrophysics, not a citation-needing game fact: Kormendy & Ho 2013,
  // "Coevolution of (Super)massive Black Holes and Host Galaxies", ARA&A).
  if (g.kind !== 'dwarf' && g.kind !== 'irregular') {
    this.sights.push({ id: `s:${g.id}:bh`, name: `${g.name} Core`, kind: 'blackhole', note: 'a supermassive black hole, same as ours', pos: { ...g.pos }, R: 1.2e5, color: null, pc: null, galaxy: g.name });
  }
  for (let i = 0; i < n; i++) {
    const d = randUnit(r), k = g.R * 0.3;
    const pos = { x: g.pos.x + d.x * k, y: g.pos.y + d.y * k * 0.3, z: g.pos.z + d.z * k };
    const kind = pick(r, kinds);
    const R = { nebula: 3e6, remnant: 2.2e6, cluster: 1.6e6, pulsar: 4e4 }[kind];
    this.sights.push({ id: `s:${g.id}:${i}`, name: `${g.name} ${kind === 'cluster' ? 'Cluster' : kind === 'remnant' ? 'Remnant' : kind === 'pulsar' ? 'Pulsar' : 'Nebula'} ${i + 1}`, kind, note: 'uncatalogued, found by seed', pos, R, color: null, pc: null, galaxy: g.name });
  }
  this.counts.sights = this.sights.length;
}
```

Call it from `detailFor(g)` right after `const systems = this.systemsOf(g);`
(`universe.js:723`): `this.proceduralSightsFor(g);`. Because `detailFor` is
already the lazy, budget-respecting entry point (current galaxy + 5 nearest,
§5), sights only ever get generated for galaxies the player is actually near
- `this.sights` grows by at most ~9 small plain objects per *visited*
galaxy, which is negligible (tens of KB even after visiting hundreds of
galaxies in one save) and never needs eviction. `g.sighted` is a one-way flag
so re-entering a galaxy doesn't duplicate its sights.

### 3.5 A small shop hub per galaxy (Bazaar's little siblings)

New table and method mirroring `BAZAAR_MODULES`/`buildBazaar` exactly (same
`buildStation` calls, same module kinds), sized down by the galaxy's own
system count:

```js
// universe.js, after BAZAAR_MODULES (line 361)
const HUB_KINDS = ['hub', 'shipyard', 'outfitter', 'general', 'fuel', 'fuel', 'media'];
```

```js
// New method, mirrors buildBazaar (643-668) / buildBazaarMeshes (669-677)
buildGalaxyHub(g) {
  if (g.hub || g === this.mw) return;
  const n = clamp(Math.round((g.systemCount || this.systemsOf(g).length) / 500), 1, HUB_KINDS.length);
  const r = rng(g.seed ^ 0x4b05);
  const R = g.R * 0.06;
  const spread = R * 0.5;
  const short = g.name.replace(/\s+(Galaxy|Dwarf.*)$/i, '');
  const kinds = n === 1 ? ['fuel'] : HUB_KINDS.slice(0, n); // a lone dwarf outpost is just a pump
  const off = randUnit(r);
  const center = { x: g.pos.x + off.x * g.R * 0.4, y: g.pos.y + off.y * g.R * 0.15, z: g.pos.z + off.z * g.R * 0.4 };
  g.hub = {
    id: `hub:${g.id}`, name: `${short} Depot`, pos: center, R,
    modules: kinds.map((kind, i) => {
      const d = randUnit(r);
      return { id: `hub:${g.id}:${i}`, kind, name: `${short} ${{ hub: 'Depot', shipyard: 'Shipyard', outfitter: 'Outfitters', general: 'General Store', fuel: 'Pumps', media: 'Video Kiosk' }[kind]}`,
        fuelTypes: kind === 'fuel' ? FUELS.slice(0, 1 + Math.floor(r() * 3)) : null,
        pos: { x: center.x + d.x * spread, y: center.y + d.y * spread * 0.3, z: center.z + d.z * spread }, obj: null };
    }),
  };
  g.hubGroup = new THREE.Group();
  this.root.add(g.hubGroup);
  g.hubBuilt = false;
}
buildGalaxyHubMeshes(g) {
  for (const m of g.hub.modules) { const st = buildStation(m.kind, m.fuelTypes ? { fuelTypes: m.fuelTypes } : {}); m.obj = st; m.radius = st.radius; g.hubGroup.add(st.group); }
  g.hubBuilt = true;
}
```

Wire it into `update()` right next to the existing Bazaar proximity check
(`universe.js:957-972` is the pattern to copy): for the *current* galaxy
(`cur`, computed earlier in the same function, line 879) build/show its hub
when the player is within, say, `g.R * 1.2` and it has one queued
(`g.hub` set by `detailFor`, see below); hide/skip otherwise. Call
`this.buildGalaxyHub(g)` from `detailFor(g)` alongside `proceduralSightsFor`
so hub *data* (positions, no meshes yet) exists as soon as the galaxy is
"near", and only build the actual `THREE.Group` meshes
(`buildGalaxyHubMeshes`) when the player is close enough to see them - same
two-stage lazy pattern the Bazaar already uses (`bazaarBuilt` flag,
`universe.js:964-965`).

This gives every non-trivial galaxy (`n >= 1`, i.e. every kind except the
very smallest dwarfs which fall through to `n=1` = a lone fuel pump anyway,
so nothing is ever hub-less) somewhere to dock, repair, and re-fit - not just
refuel - without the player needing to trek back to the one Bazaar.

## 4. Part B - galaxy clusters, superclusters, and more galaxies

### 4.1 Real sources (cited; two are already-catalogued anchors, three are new positions)

| region | kind | real distance | anchor | source |
|---|---|---|---|---|
| Local Group | group | ~10 Mly diameter | midpoint of Milky Way and Andromeda (already in-game) | [Wikipedia, "Local Group"](https://en.wikipedia.org/wiki/Local_Group); McConnachie 2012 |
| Virgo Cluster | cluster | 53.8 ± 0.3 Mly (16.5 Mpc) to M87; catalogue's own redshift-derived value for the same row is 58.67 Mly (Virgo's infall velocity biases pure-redshift distances high, a known effect for this cluster) | existing galaxy `NGC 4486` / alt `M87` | [NED, "The Virgo Cluster - Home of M87"](https://ned.ipac.caltech.edu/level5/Binggeli/Bin4.html); [Wikipedia, "Virgo Cluster"](https://en.wikipedia.org/wiki/Virgo_Cluster); [Wikipedia, "Messier 87"](https://en.wikipedia.org/wiki/Messier_87) |
| Fornax Cluster | cluster | ~18.6 Mpc / 60.6 Mly (Cepheid); catalogue's own value for `NGC 1399` is 66.42 Mly (redshift) | existing galaxy `NGC 1399` | [Madore et al. 1999, Nature, "A Cepheid distance to the Fornax cluster"](https://www.nature.com/articles/25678) |
| Coma Cluster | cluster | ~99-103 Mpc / 321-336 Mly | existing galaxy `NGC 4874` (co-dominant with `NGC 4889`, both already in `galaxies.json` at `ra 194.9-195.0, dec ~28.0`) | [Wikipedia, "Coma Cluster"](https://en.wikipedia.org/wiki/Coma_Cluster) |
| Hydra-Centaurus Supercluster / Great Attractor | supercluster | ~250 Mly (77 Mpc h⁻¹); direction RA 10ʰ32ᵐ (158.0°), Dec −46°00′ | computed (no single catalogued galaxy is "the" Great Attractor - it's a mass concentration, not one object) | [Wikipedia, "Great Attractor"](https://en.wikipedia.org/wiki/Great_Attractor); [Wikipedia, "Hydra-Centaurus Supercluster"](https://en.wikipedia.org/wiki/Hydra%E2%80%93Centaurus_Supercluster); Lynden-Bell et al. 1988 |
| Perseus-Pisces Supercluster | supercluster | ~76.7 Mpc / 250 Mly; direction RA 01ʰ50ᵐ (27.5°), Dec +36°00′, a chain >40° across the sky | [Wikipedia, "Perseus-Pisces Supercluster"](https://en.wikipedia.org/wiki/Perseus%E2%80%93Pisces_Supercluster) |
| Laniakea Supercluster | supercluster of superclusters | the whole basin of attraction (Local Group + Virgo + Hydra-Centaurus, centred toward the Great Attractor), diameter ~500 Mly / 160 Mpc h⁻¹ | computed, placed toward the Great Attractor direction at a representative mid-basin distance | [Tully, Courtois, Hoffman, Pomarède 2014, Nature 513, "The Laniakea supercluster of galaxies"](https://www.researchgate.net/publication/265337589_The_Laniakea_supercluster_of_galaxies); [Wikipedia, "Laniakea Supercluster"](https://en.wikipedia.org/wiki/Laniakea_Supercluster) |

Verified this session with the real `radecDir`/`mlyToU` pipeline (`js/util.js`,
unmodified): a supercluster at 250 Mly lands at `u ≈ 8.21e9` game units from
Sol - just inside the `uncharted()` trigger radius of `9e9`
(`universe.js:760`, which itself corresponds to ≈372 Mly, verified by
inverting `pcToU`). That is not a coincidence worth forcing: it means
Hydra-Centaurus and Perseus-Pisces sit right where the real catalogue thins
out and the procedural "uncharted" galaxy generator takes over (§4.3), which
is exactly where the real large-scale structure (the Great Attractor wall,
the Perseus-Pisces wall) actually is relative to what OpenNGC catalogues.

### 4.2 Data structure and rendering

```js
// New: js/universe.js, after BAZAAR_MODULES / HUB_KINDS
const REGIONS = [
  // [name, kind, anchor: {galaxy:'name'} | {ra,dec,mly}, realRadiusMly, blurb]
  ['Local Group', 'group', null /* resolved to MW/M31 midpoint at build time */, 5, 'Home. The Milky Way, Andromeda, and about 80 much smaller galaxies bound together by gravity.'],
  ['Virgo Cluster', 'cluster', { galaxy: 'M31' /* placeholder, see build code */ }, 7.5, 'About 1,300 galaxies, centred on the giant elliptical M87.'],
  ...
];
```

(Written out in full in the implementation; the point above is the shape.
Virgo/Fornax/Coma resolve their `pos` via `this.findGalaxy(name)` at build
time - `findGalaxy` already exists and handles the `M31`/`NGC 4486`-style
aliasing, `universe.js:688-697` - Hydra-Centaurus/Perseus-Pisces/Laniakea
resolve via `radecDir(ra, dec)` and `mlyToU(mly)`, exactly like
`buildSights` does for sights with no `galaxy` column, `universe.js:630-632`.)

New method `buildRegions()`, called from `load()` (`universe.js:392`) right
after `buildSights(sights)` and before `buildBazaar()` (so the Bazaar's
`findGalaxy('M31')` call at line 644 still works unaffected):

```js
buildRegions() {
  this.regions = [];
  for (const [name, kind, anchor, rMly, blurb] of REGIONS) {
    let pos;
    if (!anchor) { // Local Group: midpoint of MW and Andromeda
      const m31 = this.findGalaxy('M31');
      pos = m31 ? { x: (this.mw.pos.x + m31.pos.x) / 2, y: (this.mw.pos.y + m31.pos.y) / 2, z: (this.mw.pos.z + m31.pos.z) / 2 } : { ...this.mw.pos };
    } else if (anchor.galaxy) {
      const g = this.findGalaxy(anchor.galaxy);
      if (!g) continue;
      pos = { ...g.pos };
    } else {
      const d = radecDir(anchor.ra, anchor.dec), u = mlyToU(anchor.mly);
      pos = { x: d.x * u, y: d.y * u, z: d.z * u };
    }
    this.regions.push({ id: `r:${name}`, name, kind, pos, R: mlyToU(rMly), realMly: anchor?.mly ?? null, blurb });
  }
}
```

`mlyToU` already exists (`util.js:60`) and needs no change. Import it into
`universe.js`'s existing `util.js` import line (`universe.js:10-13`).

### 4.3 Bias procedural galaxy density toward the regions

`uncharted(ship)` (`universe.js:757-781`) already rolls `Math.floor(r() * 3.2)`
galaxies per `3e9`-unit cell past `9e9` units from Sol. Multiply that roll by
how deep the cell centre sits inside a region:

```js
// universe.js:768, was:
//   const n = Math.floor(r() * 3.2);
// becomes:
let mult = 1;
for (const reg of this.regions) {
  if (reg.kind === 'group') continue; // Local Group is inside the catalogue radius, not this generator
  const cellCenter = { x: (cx + dx + 0.5) * CELL, y: (cy + dy + 0.5) * CELL, z: (cz + dz + 0.5) * CELL };
  const d = vdist(cellCenter, reg.pos);
  if (d < reg.R * 1.5) mult = Math.max(mult, reg.kind === 'cluster' ? 4 : 2); // clusters denser than superclusters, both denser than the field
}
const n = Math.floor(r() * 3.2 * mult);
```

This directly answers "expand it by adding more galaxies... so there is
always more to find": flying toward Hydra-Centaurus or Perseus-Pisces now
turns up 2x the field rate of procedural galaxies well before you arrive, and
4x near Virgo/Fornax/Coma's outskirts (their cores are already dense with
*real* catalogued galaxies - OpenNGC lists thousands of Virgo members - so
the multiplier there mostly matters for the outer infall region past what's
catalogued).

### 4.4 Map changes

`index.html:136-147` (`#m-chips`): add one filter chip after "galaxies"
(line 138):

```html
<button data-f="regions">clusters</button>
```

`js/ui.js`:
- `KIND_WORD` (line 14): add `region: 'galaxy cluster'`.
- `items()` (`ui.js:412-434`): add a branch, same shape as the `galaxies`
  branch (line 419):
  ```js
  else if (f === 'regions') out = u.regions.map((x) => ({ kind: 'region', ref: x, name: x.name, sub: `${x.kind === 'group' ? 'group' : x.kind} · ${x.blurb}`, d: vdist(x.pos, from) }));
  ```
- `setFilter()` (`ui.js:401-411`): regions are huge, so force a far-out zoom
  like the `galaxies` branch does (line 404): add
  `if (f === 'regions') this.mapZoom = Math.max(this.mapZoom, 9.8);`.
- `drawMap()` (`ui.js:486-588`): new pass **before** the galaxy loop (insert
  before line 502, `// galaxies`) so region circles sit underneath the galaxy
  dots, only legible when zoomed far out (mirrors the existing zone-circle
  style at lines 538-548):
  ```js
  if (this.mapZoom > 8.6) for (const reg of u.regions) {
    const [x, y] = P(reg.pos);
    const r = Math.max(reg.R * k, 10);
    if (!inView(x, y, r)) continue;
    c.strokeStyle = 'rgba(26,48,192,0.28)'; c.setLineDash([10, 8]);
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    c.fillStyle = 'rgba(26,48,192,0.55)'; c.fillText(reg.name, x - Math.min(r * 0.6, 60), y);
    this.mapHits.push({ x, y, it: { kind: 'region', ref: reg, name: reg.name } });
  }
  ```
- `universe.js`'s `target()` (lines 807-825): add a `region` case so a
  region is a settable course/warp target like everything else:
  ```js
  case 'region': return { kind, name: ref.name, ref, pos: () => ref.pos, arrive: ref.R * 0.9, real: ref.realMly ? ref.realMly * 1e6 / 3.26156 : null };
  ```
- `renderSel()` (`ui.js:465-485`) and `resolve()` (`universe.js:828-844`)
  need no change - both already work generically off `target()`'s returned
  shape, and regions aren't bookmarkable/zone-able so the extra buttons those
  functions render for other kinds simply don't apply (the existing
  `t.kind !== 'zone' && t.kind !== 'bazaar'` save-button guard at
  `ui.js:478` should add `&& t.kind !== 'region'`, one more character).

## 5. Memory budget

Three growth points get an explicit cap. All of them are pure functions of
`(g.seed, g.kind, g.R, g.rkpc)`, so evicting and regenerating is always
bit-identical - **this determinism is a hard invariant**: nothing in
`systemsOf`, `proceduralSightsFor`, or `buildGalaxyHub` may read player state,
`Date.now()`, or any counter that isn't itself derived from the galaxy's own
fixed fields, or save-game references (`state.liberated` zone ids,
bookmarks) will silently stop resolving after an eviction+regeneration.

### 5.1 `systemCache` LRU (the new, large one)

Today `systemCache` (`universe.js:371`) is a plain `Map` that is never
evicted; with 10-120 systems per galaxy that was fine. With the new formula
a fully-populated spiral/barred galaxy can reach `N_MAX = 5,000` systems.
Each cached system is a small plain object (`id, name, galaxy, pos, real,
pc, solar, star{teff,srad,r}, exo, planets, basis{n,u,v}, seed[, station]`) -
roughly 250-350 bytes once V8's object shape is accounted for, so a maxed-out
galaxy's system list is on the order of 1.5 MB, and §3.3's widened zone roll
touches up to 150 galaxies per log-on/log-off.

Add an LRU with a fixed budget, pinning the Milky Way and whatever is
currently "near" (`this.nearG`, already exists, `universe.js:884-893`, and
`this.ctx.galaxy`):

```js
// universe.js: constructor, alongside `this.systemCache = new Map();`
this.cacheOrder = []; // ids, most-recently-used last
const SYSTEM_CACHE_BUDGET = 24; // galaxies, excluding the pinned Milky Way

touchCache(id) {
  const i = this.cacheOrder.indexOf(id);
  if (i >= 0) this.cacheOrder.splice(i, 1);
  this.cacheOrder.push(id);
  if (this.cacheOrder.length > SYSTEM_CACHE_BUDGET) {
    const pinned = new Set([this.mw.id, this.ctx.galaxy && this.ctx.galaxy.id, ...(this.nearG || []).map((g) => g.id)]);
    for (let k = 0; k < this.cacheOrder.length && this.cacheOrder.length > SYSTEM_CACHE_BUDGET; ) {
      const cid = this.cacheOrder[k];
      if (pinned.has(cid)) { k++; continue; }
      this.systemCache.delete(cid);
      this.cacheOrder.splice(k, 1);
    }
  }
}
```

`systemsOf(g)` calls `this.touchCache(g.id)` on both the cache-hit path (shown
in §3.1) and right after `this.systemCache.set(g.id, list)` on the miss path.
The Milky Way is never evicted because `buildMilkyWay` sets its cache entry
directly (`universe.js:489`) and it's excluded from the LRU list entirely
(never pushed to `cacheOrder`).

A liberated sector's `state.liberated` id string (`${galaxy.id}|${sys.id}`,
`game.js:958`) and a saved bookmark's `resolve()` lookup
(`universe.js:828-844`) both re-derive the system by walking
`this.systemsOf(g).find(...)` on demand - if the galaxy was evicted, this call
regenerates it (identical, per the determinism invariant above) and the
lookup succeeds exactly as before. **No new bookkeeping needed for eviction
vs. save data**; this falls straight out of `systemsOf`'s determinism plus
`liberated`/bookmarks storing string ids, not object references. Live zones
(`this.zones`, e.g. mid-combat) hold direct object references into whatever
system array was current at roll time; if that galaxy's cache entry is
evicted mid-zone, the specific system objects the zone/enemies reference stay
reachable (JS GC keeps anything still referenced) even though the rest of
that galaxy's system list is freed - no special-casing required there either.

### 5.2 Uncharted-galaxy cap (fixes a pre-existing gap, now more urgent)

`uncharted(ship)` (`universe.js:757-781`) has never had a total budget - only
`cellsDone` (a `Set`, never pruned) stops the *same* cell from re-rolling.
Over a long session of flying back and forth, `this.galaxies` grows without
bound. This was already latent (`docs/TODO.md`, "Level-of-detail for the
10,000-galaxy cloud"), and §4.3's up-to-4x density multiplier near
clusters/superclusters makes it worse. It also already silently interacts
with `buildClouds()` (`universe.js:679-686`): `cap = this.galaxies.length +
4000` is sized once at load, before any uncharted galaxies exist - i.e. the
code already implicitly budgeted **4,000** uncharted galaxies for the far-dot
point clouds (`farInk`/`farGlow`) and simply never enforced it. Enforce it
explicitly and reuse the same number:

```js
// universe.js:757, inside uncharted(ship), before the cell loop:
const UNCHARTED_BUDGET = 4000;
```

```js
// universe.js:769, inside the per-cell `for (let i = 0; i < n; i++)` loop,
// guard the addGalaxy call:
if (this.galaxies.length - this.catalogCount >= UNCHARTED_BUDGET) {
  // evict the single farthest-from-ship uncharted galaxy to make room,
  // skip if none exists (shouldn't happen once the budget is hit)
  let worst = -1, wd = -1;
  for (let j = 0; j < this.galaxies.length; j++) {
    const gg = this.galaxies[j];
    if (gg.group !== 'UNCHARTED') continue;
    const d = vdist(gg.pos, ship);
    if (d > wd) { wd = d; worst = j; }
  }
  if (worst < 0) break;
  const gone = this.galaxies[worst];
  this.galaxies.splice(worst, 1);
  for (let j = worst; j < this.galaxies.length; j++) this.galaxies[j].index = j; // addGalaxy stamps .index, keep it consistent
  this.byId.delete(gone.id);
  this.dropDetail(gone.id); // no-op if it never got a detail cloud
  this.systemCache.delete(gone.id);
}
```

`this.catalogCount = this.galaxies.length;` should be stamped once at the end
of `buildGalaxies()` (right after the existing `this.counts.galaxies =
this.galaxies.length;` at `universe.js:612`), before the Bazaar/regions/
uncharted layers ever add anything, so the budget check above always compares
against the fixed 10,828-galaxy catalogue baseline. `vdist` is already
imported (`universe.js:13`).

## 6. Performance limits (Chromebook target)

Constraints from `docs/TODO.md`'s Chromebook item and this session's own
brief: draw calls under ~250, no per-frame allocations, integrated GPU.

**No shader changes.** `js/render.js`'s `POST_FS` and `pointsMaterial`
(render.js:26-181) and `js/mats.js`'s `ink`/`red`/`glow`/`screen` helpers
need no modification - everything in this spec is built from the same
`ink()`/`glow()`/`Cloud` primitives every other system already uses. A
denser galaxy is still exactly one `Points` draw call for its ink swarm and
one for its glow swarm (`detailFor`, `universe.js:725-745`), regardless of
whether that swarm holds 120 or 5,000 points - `Cloud.commit(n)` (`render.js:
205-211`) just sets a draw range on one pre-allocated `BufferGeometry`. A
galaxy hub (§3.5) adds at most `HUB_KINDS.length = 7` extra meshed modules
- comparable to the existing Bazaar's 12 - and only while its galaxy is the
current one (`buildGalaxyHubMeshes` gated the same way `buildBazaarMeshes`
is, `universe.js:964-965`). Since draw calls are already bounded by "how many
galaxies get a detail cloud" (current + 5 nearest, `universe.js:884-893`,
unchanged by this spec) and "how many systems get a full `SystemView`"
(nearest 4, `universe.js:920-934`, unchanged), **total draw call count does
not grow with this spec** - it was already decoupled from total system/galaxy
count by the existing lazy-detail architecture. The only new per-frame cost
is one more `for (const reg of this.regions)` loop (7 iterations) in
`drawMap()`, which only runs while the map overlay is open and only walks 7
entries - not measurable.

**Generation cost (one-time per galaxy, not per-frame), measured this
session** (Node 20, this dev machine; budget 3-5x on a Chromebook CPU):

| systems generated | measured time |
|---|---|
| 120 (old ceiling) | ~0.2 ms |
| 500 | ~0.8-1.7 ms |
| 2,000 | ~1.5-2 ms (steady state) |
| 5,000 (new ceiling) | ~4-5 ms |

So entering the single most populated galaxy in the game costs on the order
of 5 ms of one-time work (worst case ~20-25 ms on a slow Chromebook CPU,
still under two frames at 60 fps, and it happens on galaxy-entry, not every
frame). The widened zone roll (§3.3) calls `systemsOf` on up to 150 galaxies
in one `rollZones()` pass at log-on/off (never mid-flight); at a realistic
mixed-size average well under the 5,000-system ceiling, this session's
measurement for 150 galaxies at 1,500 systems each was **~115 ms total** -
a one-time hitch at the pause/resume/title boundary, not a frame-budget
concern. If this is ever felt as a stutter on real hardware, the fix is to
spread `rollZones`'s per-galaxy loop across a few animation frames (a
`requestIdleCallback`/chunked-generator rewrite) rather than reducing the
150-galaxy pool - flagged here as a P2, not required to hit the stated specs.

## 7. Headless checks to add to `tools/test.mjs`

Follow the file's existing `check(name, ok, detail)` / `window.__dv` pattern
(see `tools/test.mjs:24-33` for the harness, and the `counts` check at line
36 for the exact style to match). All of these read `window.__dv.u` -
`g.u` is the `Universe` instance (`js/game.js:96`, `window.__dv = this`,
`Game.u` set in its constructor).

```js
// after the existing 'catalogue counts' check (tools/test.mjs:36)
const dens = await E(`
  const u = g.u;
  const m31 = u.findGalaxy('M31');
  const m87 = u.findGalaxy('NGC 4486');
  const dwarf = u.findGalaxy('Andromeda I');
  const sys = (gx) => gx ? u.systemsOf(gx) : [];
  const pumps = (list) => list.filter((s) => s.station).length;
  return {
    m31: sys(m31).length, m31pumps: pumps(sys(m31)),
    m87: sys(m87).length,
    dwarf: sys(dwarf).length,
    mwLen: u.systemCache.get(u.mw.id).length,
    baseN: u.baseN, baseKpc: u.baseKpc,
    cacheSize: u.systemCache.size,
    regions: u.regions.length,
    hcU: (() => { const reg = u.regions.find((r) => r.name.includes('Hydra')); return reg ? Math.hypot(reg.pos.x, reg.pos.y, reg.pos.z) : 0; })(),
  };
`);
check('Andromeda is no longer 18 systems', dens.m31 >= 500, `now ${dens.m31}`);
check('Andromeda still gets ~42% pumps', dens.m31pumps > dens.m31 * 0.3 && dens.m31pumps < dens.m31 * 0.55, `${dens.m31pumps}/${dens.m31}`);
check('M87 (Virgo) is populated too, not just Andromeda', dens.m87 >= 300, `now ${dens.m87}`);
check('a Local Group dwarf is never literally empty', dens.dwarf >= 40, `now ${dens.dwarf}`);
check('density formula matches the calibration (within 30%)', (() => {
  const expect = clampJS(Math.round(dens.baseN * Math.pow(20.13 / dens.baseKpc, 3) * 1.0), 500, 5000); // Andromeda, spiral, rkpc 20.13
  return Math.abs(dens.m31 - expect) / expect < 0.3;
})(), `got ${dens.m31}`);
check('seven named regions exist and resolve to a real position', dens.regions === 7, `${dens.regions}`);
check('Hydra-Centaurus sits just inside the uncharted-galaxy boundary (9e9u)', dens.hcU > 7e9 && dens.hcU < 9e9, `${dens.hcU.toExponential(2)}`);

const t0 = performance.now();
await E(`const g2 = g.u.findGalaxy('Andromeda Galaxy'); g.u.systemCache.delete(g2.id); g.u.systemsOf(g2); return 1;`);
check('generating a 5,000-system galaxy stays fast', performance.now() - t0 < 100, `${(performance.now() - t0).toFixed(1)} ms`);

const zones = await E('return { total: g.u.zones.length, otherGalaxies: new Set(g.u.zones.filter((z) => z.galaxy !== g.u.mw).map((z) => z.galaxy.id)).size };');
check('enemy zones now spread across many galaxies, not 12 systems in 12', zones.otherGalaxies >= 20, `${JSON.stringify(zones)}`);

const mem = await E(`
  const u = g.u;
  const gals = u.galaxies.filter((x) => x.real && x !== u.mw).slice(0, 40);
  for (const gx of gals) u.systemsOf(gx);
  return u.systemCache.size;
`);
check('systemCache stays inside its LRU budget after visiting 40 galaxies', mem <= 25, `cache size ${mem}`); // 24 budget + the always-visited current galaxy
```

(`clampJS` is a tiny local helper the test file doesn't currently have -
either inline the clamp math or add a one-line `const clampJS = (v, a, b) =>
v < a ? a : v > b ? b : v;` near the top of `tools/test.mjs`.)

**Regression**: run the existing 41 checks unchanged first
(`node tools/test.mjs`). Baseline going into this work is 40/41, with the
known, unrelated "autopilot closes on Mars" failure documented in
`docs/HANDOFF.md` and `docs/TODO.md` - that failure is expected to remain
exactly as-is; nothing in this spec touches autopilot, `setCourse`, or
`Game.dockable`.

## 8. What to see on screen (manual verification, once implemented)

At `http://127.0.0.1:5178/` (or `node tools/serve.mjs`), test widths
1366x768, 1280x720, 1920x1080 per Gev's keyboard-and-mouse rule:

1. Launch, open the map (M), switch to the "galaxies" chip, zoom out until
   Virgo/Fornax/Coma/the two superclusters/Laniakea are visible as large
   dashed labelled circles (new "clusters" chip should also list all seven
   by name with their real distance/blurb).
2. Set a course for Andromeda (M31) or warp there. On arrival, open the map
   and switch to "stars here" - it should list hundreds to thousands of
   systems, not 18, and several should show a pump icon
   (`ui.js:520`, `s.station`). Open "fuel" (`f === 'stations'`,
   `ui.js:428`) from inside Andromeda and confirm nearby pumps show up the
   same way they do near Sol.
3. Fly toward the region circle for Hydra-Centaurus or Perseus-Pisces past
   9e9 units from Sol; the "uncharted" galaxy field should visibly thicken
   compared to flying the same distance in a direction with no region
   nearby (same visual language as today - blue ink dots via `farInk`, hard
   to miss the density difference at 4x).
4. Dock at a non-Milky-Way galaxy's new hub (its "Depot") and confirm the
   shop screens open exactly like the Bazaar's do (`ui.js:376-379`'s `hub`
   branch, unmodified, just now reachable from more than one place).
5. Confirm fuel/travel friction is unchanged: a warp of the same game-unit
   distance costs the same fuel as before this spec (`warpCost`,
   `game.js:628-634`, untouched) - this is the one thing that must
   *not* have changed.
