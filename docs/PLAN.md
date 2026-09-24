# Doodle Voyager - coding plan

A first-person spaceship game drawn in blue ballpoint on lined paper, after
Doodle Shooter (doodleshooter.vercel.app, "Doodle District"). You walk around
inside your own ship, fly it through a universe built from every catalogued
galaxy and exoplanet we can get as open data plus endless seeded space past the
catalogues, fight huge red enemy ships, and shop, refuel, watch MP4s and listen
to hold music on the long hauls.

Owner: Gev. Started 2026-09-22. Project root: `D:\doodle-voyager`.

## 1. Review: what Ultimate Frontend Skills (UFS 6.1.2) gives a game

Read from the installed plugin and its game reference (`references/games.md`).

| UFS part | What it does | Used here |
|---|---|---|
| `references/games.md` | Measured teardown of Doodle District itself: `--ink #1a30c0`, `--red #d02030`, `--paper #f6f3e6`; Patrick Hand + Caveat; `mix-blend-mode: multiply` on HUD; per-element asymmetric radii and rotations; hard offset shadows; the 0.55 s "scribble" title keyframe; dense control legend; real persisted numbers | Start screen and HUD follow it |
| "Made vs generated" seven points | specificity, density, type from the world, chosen irregularity, copy that only fits here, persisted state, plain credits | Checked on the start screen before ship |
| `references/three.md`, `stack.md` | import map + pinned CDN three.js, one rAF loop, 60 fps rules | three@0.170.0 from jsDelivr, one loop |
| `webdesign.mjs look` / `debug` / `quality` | headless Chrome over CDP: overlap, overflow, contrast, PNG per width, frame rate | Start-screen checks |
| `webdesign.mjs audit` | source audit for AI tells and a11y basics | Run on index.html |
| `webdesign.mjs security` | keys, source maps, headers, unpinned CDN scripts | Run before deploy |
| `assets/core.css`, `motion.js`, section library | website chassis (editorial serif) | Not used: a game start screen is in-world UI, not a marketing page |
| `gradient.js`, `depth.js`, `exploded.js`, `sky.js` | WebGL gradient, parallax planes, exploded view | Not used: the game has its own doodle post pass |

Built here because UFS does not cover it: the game renderer (depth + colour
edges, hatching, paper, ruled lines, red margin), game state, input, synthesised
audio, and a game test harness.

## 2. Architecture

Static site, ES modules, no build step. `index.html` + `style.css` + `js/*.js`,
three.js via import map:

```html
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js"}}</script>
```

| File | Owner | Job |
|---|---|---|
| `js/mats.js` | main (done) | material IDs and palette |
| `js/util.js` | main | seeded RNG, hashing, maths |
| `js/render.js` | main | renderer, doodle post pass, scaled-space placement |
| `js/universe.js` | main | catalogue loading, Solar System, procedural cells, systems, stations, zones |
| `js/game.js` | main | modes (foot, helm, EVA, drone, warp), flight, combat, save |
| `js/ui.js` | main | HUD, map, shop, fuel, pause, start screen |
| `js/ships.js` | workflow | player ship interiors + exteriors |
| `js/actors.js` | workflow | red evil guys, capital ships, drone, stations |
| `js/audio.js` | workflow | hold music, combat music, SFX, all synthesised |
| `js/media.js` | workflow | MP4 player, playlist panel, IndexedDB |
| `tools/build-data.mjs`, `data/*.json` | workflow | exoplanets + galaxies from NASA / OpenNGC |
| `tools/serve.mjs`, `tools/cdp.mjs` | main (done) | static server with Range, headless Chrome driver |

Workflow agents write only their own files. To check a module in a browser:
`node tools/serve.mjs --port <assigned>` in the background, a scratch HTML page
under `tools/.scratch/<module>/` (deleted afterwards) that uses the import map,
and `tools/cdp.mjs` (`launch`, `goto`, `eval`, `shot`, `errors`, `close`).

### Scale

- Ships: 1 unit = 1 metre. Floor at y = 0. Ship forward is -Z. Ship-local
  origin is on the floor at the middle of the ship. Eye height 1.65 m, doors
  at least 1.2 m wide and 2.2 m tall, ceilings 2.6-3.0 m.
- Space: game units, positions as JS doubles, drawn relative to the player's
  ship (floating origin). Beyond 8,000 u, positions are pulled in on a log curve
  and scaled by the same factor, so angular size stays right.
- Real objects keep their real sky direction (RA/Dec) with compressed distance:
  inside the Milky Way `20,000 u per parsec` to 10 pc, then `2e5 x (1 + ln(pc/10))`;
  between galaxies `1.6e7 u per Mly` to 3 Mly, then `4.8e7 x (1 + ln(Mly/3))`.
- Sublight 170-420 u/s. Cruise drive speed = min(ship cruise max, 0.05 x distance
  to the nearest body), so planet hops take tens of seconds, star to star a few
  minutes, galaxy to galaxy 2-20 minutes. Warp: any destination in at most 60 s;
  fuel cost rises with log distance and a long jump takes most of a tank.

### Material contract (`js/mats.js`)

The post pass reads fragment alpha as a material ID. Build every surface with
these helpers, never raw three.js materials:

- `ink(color)` lit, flat shaded, drawn with blue outlines and hatching.
- `red(color)` the same in red ink. Enemies only.
- `glow(color)` unlit highlighter: lasers, engines, lamps, lit signs.
- `screen(texture)` unlit picture; no ink drawn inside it.
- `paint('yellow'|'blue'|'outline')` ship paint (`outline` = bare paper, blue lines only).
- `label(text, width, opts)` handwritten sign plane; `labelTexture` for canvases.
- `lineMat`, `pointsMat` for strokes and dots. `PAL` is the palette.
- Walls are boxes 0.1-0.2 thick so their faces show from inside.
- Colour carries meaning: dark colours hatch densely, pale ones stay paper.

### `js/ships.js` contract

```js
export const SHIPS = {
  scout:   { id:'scout',   name:'Pencil Case',  cls:'small',  fuel:'ION',       tank:80,  hull:100, shield:60,  speed:260, cruise:2.5e5, turn:1.6, guns:2, dmg:12, price:0,     desc },
  racer:   { id:'racer',   name:'Highlighter',  cls:'small',  fuel:'ION',       tank:70,  hull:80,  shield:50,  speed:420, cruise:4e5,   turn:2.0, guns:2, dmg:10, price:7000,  desc },
  fighter: { id:'fighter', name:'Ballpoint',    cls:'medium', fuel:'PLASMA',    tank:110, hull:180, shield:120, speed:320, cruise:3e5,   turn:1.8, guns:4, dmg:14, price:12000, desc },
  hauler:  { id:'hauler',  name:'Ring Binder',  cls:'medium', fuel:'PLASMA',    tank:160, hull:260, shield:100, speed:200, cruise:2.5e5, turn:1.0, guns:2, dmg:12, price:15000, desc },
  cruiser: { id:'cruiser', name:'Lecture Hall', cls:'large',  fuel:'DEUTERIUM', tank:240, hull:450, shield:220, speed:170, cruise:3e5,   turn:0.7, guns:6, dmg:14, price:40000, desc },
};
export function buildInterior(type, paint) -> {
  group,                          // THREE.Group, ship-local metres
  colliders: [{x0,z0,x1,z1}],     // walls + blocking furniture, XZ boxes, x0<x1, z0<z1
  interact: [{id, label, pos: Vector3, r}],
      // ids: helm, media, nav, music, breach, drone, storage, toilet, sink,
      //      shower, stove, fridge, bed, lamp, desk, tv
  spawn: Vector3, spawnYaw,       // standing spot behind the helm
  seat: { pos: Vector3 },         // eye position when seated at the helm
  screens: { main: Mesh, nav: Mesh, lounge?: Mesh },
      // main: 16:9 plane on the left console; nav: 2:1 plane overhead;
      // lounge: large 16:9 plane (cruiser only). The game swaps their materials.
  breach: { panel: Mesh, pos: Vector3, normal: Vector3 },
      // a wall panel (about 1.2 x 1.8 m) filling a real opening in a side wall;
      // the game blows it out. normal points out of the ship.
  bounds: Box3, lights: [PointLight] (3 at most), animate(dt, t)
}
export function buildExterior(type, paint) -> {
  group, radius, length,
  guns: [Vector3], engines: [Vector3],
  hole: { pos, normal, mesh },    // same spot as breach, on the outer hull; mesh hidden by default
  dronePort: Vector3
}
```

Interiors:
- Every ship's cockpit follows Gev's sketch: a wide front window opening (no
  glass), an overhead nav screen hanging above it, a yoke (wheel with a cross
  of spokes) on a column in front of the pilot seat, a left console angled
  toward the pilot with the MP4 screen and a labelled MP4 button, a right
  console angled the other way with music controls, a low dashboard between.
- scout (about 6 x 12 m): cockpit + storage compartment (lockers, crates,
  cargo net, fold-down bunk), drone bay hatch, breach panel.
- racer (about 5 x 9 m): cockpit + small storage nook.
- fighter (about 7 x 16 m): cockpit + gun room + storage.
- hauler (about 9 x 26 m): cockpit + big cargo bay (racks, crates) + bunk room.
- cruiser (about 14 x 60 m): bridge, corridor, two bathrooms (toilets, sinks
  with mirrors, shower stalls), galley kitchen (stove, oven, fridge, counters,
  table and chairs), four dorm rooms that look like a college dorm (lofted or
  bunk beds, desks with lamps and chairs, posters, mini-fridge, laundry
  basket, string lights, rug), lounge with the big screen, drone bay.
- The interior is closed on every side (floor, ceiling, walls) except the
  window and the breach opening.

### `js/actors.js` contract

```js
export function buildImp()          -> { group, radius }
    // a red evil guy: round red body, horns, angry brows, fanged grin, little
    // arms, pointed tail, riding a small red saucer with a glow ring. ~5 m tall.
export function buildCapital(kind)  -> { group, radius, length, turrets: [Object3D],
                                         beamPort: Object3D, engines: [Object3D], captain: Object3D }
    // kind 'dreadnought' (~900 m) or 'carrier' (~1200 m). Massive red hull,
    // 6-10 turrets as children, a bow beam emitter, glow engines, a bridge
    // window with a big red evil guy (captain) visible inside.
export function buildDrone()        -> { group, radius, rotors: [Object3D] }   // ~1.2 m quadcopter
export function buildStation(kind, opts) -> { group, radius, dock: Vector3 }
    // kind: fuel (opts.fuelTypes: subset of ['ION','PLASMA','DEUTERIUM'], each
    // shown as a pump with its own sign), shipyard, outfitter, general, media,
    // hub. Fuel ~150 m; shop modules 300-900 m with huge handwritten signs.
```

Budgets: capital under 20k triangles, station under 10k, cruiser interior
under 30k, others under 12k.

### `js/audio.js` contract

```js
export const audio = {
  init(),                    // create the AudioContext on first user gesture; safe to call twice
  setMusicVolume(v), setSfxVolume(v),   // 0..1
  tracks: [{id, name}],      // at least three hold-music tracks (elevator / lounge / bossa)
  play(id), stop(), next(), current, enabled,
  mood(m),                   // 'cruise' (the chosen hold track), 'combat' (tense track), 'warp' (adds a rising pad)
  sfx(name, opts),           // laser, laserEnemy, beamCharge, beamFire, explosion, bigExplosion, hit,
                             // alarm, warpCharge, warpIn, warpOut, ui, buy, deny, fuel, bomb,
                             // flush, sizzle, door, coin, seal, breach
  loop(name) -> { stop(), set(v) }      // wind, thruster, dronebuzz, shower, hum
};
```

### `js/media.js` contract

```js
export class Media {
  texture;          // THREE.CanvasTexture 640x360; shows the playing video, or an idle card
  async init();     // loads assets/videos/manifest.json + IndexedDB videos + saved URLs
  update(dt);       // called every frame by the game; draws the current frame into texture
  list(); add(fileOrUrl); remove(id); play(index); toggle(); next(); prev();
  shuffle; loop; volume; current; playing;
  open(); close(); isOpen;   // the playlist panel (DOM overlay it builds itself)
  onchange(cb);
}
```

Built-in videos: `assets/videos/*.mp4` (H.264, yuv420p, faststart, with an
audio track) listed in `assets/videos/manifest.json` as `[{id, title, src, duration}]`.

### Data files

- `data/exoplanets.json`: `{source, fetched, fields, rows}` from the NASA
  Exoplanet Archive `pscomppars` table.
  fields: `pl, host, ra, dec, pc, rade, a, per, teq, steff, srad, year, method`.
- `data/galaxies.json`: `{source, fetched, fields, rows}` from OpenNGC (NGC +
  IC + addendum), the Local Group lists and the redshift record holders.
  fields: `name, alt, type, ra, dec, mly, dq, size, mag, con, group`
  (`dq`: `z` from redshift, `lit` literature distance, `est` estimated; `group`:
  `MW`, `LG-MW`, `LG-M31`, `LG`, `M`, `NGC`, `IC`, `ADD`, `HZ`).
- `docs/CATALOG-galaxies.md`, `docs/CATALOG-exoplanets.md`: every row, listed.
- `docs/RESEARCH-universe.md`, `docs/RESEARCH-features.md`: sourced research.

## 3. Gameplay systems

- **Modes**: on foot (walk the interior), helm (fly), EVA (after being pulled
  out through the hull hole), drone (optional, bombs), warp (walkable).
- **Autopilot**: set a course on the map and walk away from the helm; the ship
  flies itself while you use the kitchen, the dorms or the MP4 screen.
- **Enemy zones**: rolled from a fresh seed every log on (page load) and every
  log off (pause menu). Entering one drops you out of cruise; clearing it
  liberates that sector for good and pays out. Liberated sectors never roll again.
- **Capital ships**: turret batteries and a charged beam laser with a visible
  aim line you must fly out of. Red evil guys fly escort saucers.
- **Fuel**: ION (scout, racer), PLASMA (fighter, hauler), DEUTERIUM (cruiser).
  Stations sell one to three kinds. Empty tank = limp mode plus a paid tow,
  never a soft lock.
- **The Bazaar**: a shop cluster the size of a dwarf galaxy between the Milky
  Way and Andromeda: shipyard, outfitter, general store, media kiosk, fuel.
- **Music**: synthesised hold music, combat track in zones.
- **Save**: localStorage, try/catch everywhere.

## 4. Test and deploy

- `tools/test.mjs`: headless Chrome, loads the game, drives every mode through
  `window.__dv`, fails on any console error, saves screenshots.
- UFS `look`, `audit`, `security` on the start screen.
- Local first: `start-local.cmd` stages `dist/` and serves it on port 5178.
  Then Vercel (preview deploy of the same `dist/`, with `vercel.json`
  headers). Netlify was dropped on 2026-09-22: the account had no credits.

## 5. Daily monitoring

`tools/monitor.mjs`, scheduled daily by Windows Task Scheduler: HTTP status
and timing of the live site and every asset, hash drift against the local
build, a headless boot with a console-error check and a frame-rate sample,
appended to `docs/monitor-log.md`. See `docs/MONITORING.md`.
