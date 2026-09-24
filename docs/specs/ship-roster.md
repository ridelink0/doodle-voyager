# Ship roster: 5 -> 15, rebalanced

For the implementer. Read `js/ships.js`, `js/game.js`, `js/ui.js`, `js/universe.js`
alongside this. Every stat, formula and line reference below was read from the
current source (2026-09-24), not guessed. Where a number is *calculated* from
the game's own flight-model code rather than measured by playing, that is
stated outright so nothing here is passed off as an observed result it is not.

## 0. Why the ship "feels slow" - diagnosis with numbers

Gev flies the starter Pencil Case (`speed: 260`). Two speed systems exist:

- **Sublight** (`js/game.js:829-846`): `targetSpeed = throttle * vmaxSub`,
  where `vmaxSub = stat('speed') * (boost ? 1.7 : 1)`. This is what governs
  the ship *whenever it is not on an active autopilot cruise leg* - combat,
  docking, walking distances inside a system, anything under 40,000 u.
- **Cruise** (autopilot only, `js/game.js:833-837`, display formula
  `ui.js:458-464 cruiseEta()`): capped at `min(stat('cruise')*150*(1+0.2*eng),
  0.1 * dnear)`. `dnear` is distance to the *nearest* body
  (`universe.js:975-997`), so cruise speed ramps up the farther you are from
  anything and ramps down as you approach the target - an accel/decel curve,
  not a flat top speed.
- The autopilot only engages cruise at all past 40,000 u
  (`sh.cruise = ... && dist > 40000 ...`, `game.js:825`); `cruiseEta()` uses
  the same threshold (`d < 4e4` -> plain `d / stat('speed')`, `ui.js:461`).
  **Below 40 km, raising `speed` is the only lever that helps at all** -
  raising the `cruise` stat or the "Cruise drive tune" equip slot does
  nothing for local flight, docking approaches, or combat manoeuvring.

Calculated (not played) before/after, scout, no equip, throttle 1, no boost,
using the exact formulas above:

| Measure | Formula | Before (speed 260) | After (speed 330) |
|---|---|---|---|
| Cross 10,000 u (10 "km") sublight | `10000/speed + ~1s ramp-in` | **39.5 s** | **31.3 s** (-21%) |
| Short local hop, 25,000 u (< 40,000 u threshold, pure sublight) | `25000/speed` | 96.2 s | 75.8 s |
| To the Moon (orbit ~3,600 u from Earth, `earthRToU(1)*2.4`, below threshold) | `3600/speed` | 13.8 s | 10.9 s |
| To Mars, near opposition (~20,600 u, `auToU(1.524)-auToU(1.0)`, below threshold -> sublight, not cruise) | `20600/speed` | 79.2 s | 62.4 s |
| To Mars, far side (~110,000 u representative, cruise regime) | `cruiseEta()`, `d/2=55000 < xc` | 30.2 s | 30.2 s (unchanged - cruise-side, ship-independent below the cruise cap) |
| To the nearest star (~1.3 pc = 5.2e6 u, `pcToU`, deep cruise regime) | `cruiseEta()` | 107 s (~1.8 min) | 107 s (unchanged) |

The Mars-far-side and nearest-star rows are **flat before/after** because
`cruiseEta()`'s accel/decel formula (`20*ln(d/2/2e4)+10`) doesn't read
`stat('speed')` except below the 40,000 u cutoff - this is existing,
intentional behaviour from the 2026-09-23 pass (`docs/release-2026-09-23.diff`)
and is out of scope here; only the ship *data table* changes below. The
practical read: raising base `speed` fixes exactly the part of the game Gev
actually spends time in (combat, docking, walking a system), which is the
correct fix for "my ship is very slow."

The second half of the complaint - "the shop offers no fast ships, they're
all the same" - is a real gap, not a misreading: today racer (420) is the
*only* fast ship, sold once at the bottom price tier (7,000 cr); every
ship after it gets *slower* as it gets pricier (fighter 320, hauler 200,
cruiser 170). A player who wants speed has nothing to spend credits on ever
again. Section 2 fixes that with a genuine speed spread across every price
tier.

## 1. Rebalanced original five (same 5 ids - save-compatible)

`js/ships.js:9-29`. Ids, names, classes and fuel types are unchanged (saves
keep working: `s.ship`, `s.owned`, `s.fuel[type]`, `s.hull[type]` in
`game.js:55-70` key off `id`, never off stats). Only the numbers move.

| id | name | cls | fuel | tank | hull | shield | speed (was) | cruise | turn | guns | dmg | price |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| scout | Pencil Case | small | ION | 85 (80) | 100 | 60 | **330 (260)** | 2.5e5 | 1.7 (1.6) | 2 | 12 | 0 |
| racer | Highlighter | small | ION | 75 (70) | 80 | 50 | **460 (420)** | 4e5 | 2.1 (2.0) | 2 | 10 | 7000 |
| fighter | Ballpoint | medium | PLASMA | 110 | 180 | 120 | **350 (320)** | 3e5 | 1.8 | 4 | 14 | 12000 |
| hauler | Ring Binder | medium | PLASMA | 190 (160) | 260 | 100 | **230 (200)** | 2.5e5 | 1.0 | 2 | 12 | 15000 |
| cruiser | Lecture Hall | large | DEUTERIUM | 240 | 450 | 220 | **200 (170)** | 3e5 | 0.7 | 6 | 14 | 40000 |

Only these fields change in `js/ships.js:9-28`: `tank`, `speed`, `turn`
(scout, racer only). `desc` strings, `cls`, `fuel`, `hull`, `shield`,
`cruise`, `guns`, `dmg`, `price` are untouched - true minimal-scope edits to
one object literal.

## 2. Ten new ships (fifteen total)

Ids are new object keys in the same `SHIPS` literal
(`js/ships.js:8-29`). **Object key insertion order is the shop's display
order** - `ui.js:354` does `for (const s of Object.values(SHIPS))` with no
sort, so ordering the `SHIPS` literal is the entire "shop ordering" task.
Insert in this exact order (interleaved with the original five so a cheap
fast ship is visible immediately, not buried after everything else):

| # | id | name | cls | fuel | tank | hull | shield | speed | cruise | turn | guns | dmg | price | ability (sec. 3) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | scout | Pencil Case | small | ION | 85 | 100 | 60 | 330 | 2.5e5 | 1.7 | 2 | 12 | 0 | - |
| 2 | eraser | Eraser | small | ION | 60 | 70 | 40 | **480** | 3.2e5 | 2.3 | 1 | 9 | 5000 | afterburner |
| 3 | racer | Highlighter | small | ION | 75 | 80 | 50 | 460 | 4e5 | 2.1 | 2 | 10 | 7000 | - |
| 4 | tape | Correction Tape | small | ION | 55 | 65 | 45 | **500** | 3.4e5 | 2.4 | 2 | 9 | 9000 | blink |
| 5 | witeout | Wite-Out | small | ION | 65 | 75 | 55 | **440** | 3.0e5 | 2.0 | 2 | 10 | 11000 | cloak |
| 6 | fighter | Ballpoint | medium | PLASMA | 110 | 180 | 120 | 350 | 3e5 | 1.8 | 4 | 14 | 12000 | - |
| 7 | paperclip | Paperclip | medium | PLASMA | 100 | 140 | 110 | 300 | 2.8e5 | 1.6 | 2 | 11 | 14000 | tractor |
| 8 | hauler | Ring Binder | medium | PLASMA | 190 | 260 | 100 | 230 | 2.5e5 | 1.0 | 2 | 12 | 15000 | - |
| 9 | gelpen | Gel Pen | small | ION | 50 | 55 | 30 | **620** | 4.2e5 | 2.6 | 2 | 18 | 16000 | - (glass cannon) |
| 10 | compass | Compass | medium | PLASMA | 115 | 170 | 130 | 310 | 2.9e5 | **2.2** | 3 | 12 | 18000 | - (best turn) |
| 11 | stickynotes | Sticky Notes | small | ION | 90 | 110 | 90 | 380 | 3.0e5 | 2.0 | 2 | 10 | 20000 | decoy |
| 12 | stapler | Stapler | medium | PLASMA | 120 | 240 | 150 | 260 | 2.6e5 | 1.3 | 3 | 16 | 22000 | ram |
| 13 | gluestick | Glue Stick | medium | PLASMA | 130 | 200 | 180 | 240 | 2.6e5 | 1.2 | 2 | 11 | 24000 | repair |
| 14 | cruiser | Lecture Hall | large | DEUTERIUM | 240 | 450 | 220 | 200 | 3e5 | 0.7 | 6 | 14 | 40000 | - |
| 15 | locker | Filing Cabinet | large | DEUTERIUM | **300** | 380 | 200 | 150 | 2.5e5 | 0.6 | 4 | 13 | 45000 | scoop |

Speed spread, fastest to slowest (was 170-420, 2.5x; now **150-620, 4.1x**):
gelpen 620, tape 500, eraser 480, racer 460, witeout 440, stickynotes 380,
fighter 350, scout 330, compass 310, paperclip 300, stapler 260, gluestick
240, hauler 230, cruiser 200, locker 150. Five ships (gelpen, tape, eraser,
racer, witeout) clear 420 - "at least three fast interceptors" plus a fourth
and fifth; gelpen is the glass cannon (fastest ship in the game, and jointly
the lowest hull/shield/tank of any ship - a hit or two kills it, matching the
"very fast glass cannon" ask). Every price tier from 5,000 to 24,000 now has
at least one ship faster than the old racer (420), fixing "no fast ships in
the shop" directly.

Fuel types stay within the existing three (`ION`/`PLASMA`/`DEUTERIUM`,
`universe.js:15`) - no station, `FUEL_PRICE` (`game.js:33`) or `FUELS`
changes needed. Class follows the existing convention: small=ION,
medium=PLASMA, large=DEUTERIUM.

### Shop card text

`ui.js:356-357` already renders `s.desc`, `s.hull/shield/speed/tank/fuel/guns`
generically for every entry in `SHIPS` - **no ui.js change is needed for the
stat cards themselves**, only for the ability line (section 3.7) and the
`desc` string each new ship needs in its `ships.js` object literal (one
sentence, same voice as the existing five - workshop/classroom object
described as a spaceship, not a description of the abstract concept).

### Unlocks

No new unlock/tech-tree system: `ui.js:353-361` lists every `SHIPS` entry
unconditionally, gated only by `st.credits >= s.price`
(`game.js:502-513 buyShip`). That is unchanged and is enough - the request
was for ordering and pricing, not a progression gate Gev didn't ask for.

## 3. Exterior silhouettes (why they read differently)

All built with the existing `Kit` primitives in `js/ships.js:52-59`
(`BOX/CYL/FRU/CONE/TOR/OCT`) and the merge-by-material pattern in
`Kit.build()` (`ships.js:177-209`) - same "one mesh per material" budget
technique as the original five, so triangle counts stay flat regardless of
part count. Each gets a genuinely different silhouette primitive, not a
recolour of an existing one:

- **Eraser**: short, wide, stubby - an octagonal `CYL(8, start)` cross
  section (like `extRacer`'s prism but squat: length < 2x width, versus
  racer's ~2.5x), rounded ends, a paper-wrapper paint band (a `paint()`
  section distinct from the hull colour) partway down the body, single fat
  central nozzle.
- **Correction Tape**: flattest hull in the roster - wide `BOX`, very low
  `H`, plus a circular dorsal hump (a half-buried `CYL`) reading as the tape
  reel, tapering to a flat wedge applicator nose (like `extRacer`'s chisel
  tip but wide and flat instead of tall and narrow).
- **Wite-Out**: a squat bottle - `CYL` body, a narrowing `FRU` neck at the
  bow (cone-down, opposite of `extScout`'s flared nozzles), small flip-cap
  dorsal fin. Default paint `'outline'` (bare paper, blue lines only,
  `mats.js` paint kinds) rather than yellow/blue - visually the palest ship
  in the yard, which reads right for a stealth ship before it ever cloaks.
- **Gel Pen**: longest-thin small-class hull - a single slender `CYL`,
  length ~5x width (longest ratio in the roster), sharp `CONE` nose, a
  translucent-toned paint band mid-body suggesting a see-through barrel,
  twin thin engines. Reads as the one hull built purely for speed.
- **Paperclip**: the one genuinely non-convex silhouette - two parallel
  slim `CYL` tubes joined by a bent `TOR` loop at the bow (an actual
  paperclip bend), guns mounted where the tubes rejoin at the stern. No
  other ship in the roster has a doubled-tube shape.
- **Compass**: twin-boom layout - two swept-back pod `CYL`s splayed at a
  wide angle from a small central hub (like an open drafting compass), one
  leg ending in a sharp `CONE` point, the other in a blunt pivot-foot stub.
  The only twin-fuselage ship; unmistakable in silhouette from directly
  ahead (a V, not a fuselage).
- **Sticky Notes**: a staggered stack of 3-4 thin offset `BOX` slabs, each
  slightly smaller and offset forward, fanned like a pad of notes; a bright
  solid-colour square patch (a `paint()` block) on the top slab. The only
  "layered plates" silhouette - every other hull is a single smooth body.
- **Stapler**: a wedge - tall boxy stern (the "spring housing"), low
  tapered bow (the "jaw"), a raised dorsal ridge box down the spine (a
  hinge seam) that doubles as a visual tell for its ram ability. The only
  wedge/flattened-taper profile; reads as built to hit things nose-first.
- **Glue Stick**: shortest-for-its-width medium hull - a fat squat `CYL`,
  screw-thread ridge rings (repeating thin `TOR`s) around the mid-body, a
  rounded dome `FRU` cap at the bow. Distinctly "fat" next to every other
  elongated hull.
- **Filing Cabinet** (locker, the tall ship): see section 4 - a vertical
  box tower, unmistakably taller than wide/long, the only ship whose
  silhouette reads as a building rather than a vehicle.

Follow the existing per-ship pattern exactly: a function `ext<Name>(k, P)`
added beside `extScout`/`extRacer`/etc. (`ships.js:1250-1398`), registered
in the `EXTERIOR` map (`ships.js:1400`), returning `{hullX, belly, guns,
engines}` the same way every existing one does, plus two `k.sign(...)` calls
(one per side) with the ship's name, following `extScout`'s
`k.sign('PENCIL CASE', ...)` pattern (`ships.js:1272-1273`).

## 4. The tall ship: Filing Cabinet (`locker`)

**Footprint 6.4 x 7.0 m, three stacked decks at 2.9 m each = ~8.7 m interior
stack** (plus hull/roof/undercarriage, exterior height ~10-11 m) - clearly
taller than wide or long, unlike every other ship (all of which are long and
low along -Z). Interior: three decks joined by a working elevator (not a
ramp, not a single tall room) with elevator hold music already available as
track id `'elevator'` (`js/audio.js:1168`, `'Floor Seven Million'`).

### The problem this solves

`buildInterior()`'s existing contract is **single-floor**: `colliders` are
flat XZ boxes with no Y (`ships.js:116-124 block()`), `walkCheck()`
flood-fills one 2D grid (`ships.js:1461-1536`), `nearestInteract()`
(`game.js:378-392`) and `collideFoot()` (`game.js:742-761`) both read
`this.interior.colliders`/`.interact` directly, and the render camera places
the player at a single fixed baseline (`game.js:1575`:
`V1.set(p.x, p.y + 1.65 + bob, p.z)`, `p.y` being only the jump offset from
`Space`/gravity at `game.js:736-739`). None of that has any notion of "which
floor."

### The fix: per-deck collider/interact sets, swapped by ship state, unchanged for every other ship

Add to `buildInterior()`'s return contract (`ships.js:101-116`,
purely additive - every existing ship's return object is untouched):

```js
// Optional. Present only for multi-deck ships (locker, for now).
decks: [
  { colliders, interact, spawn, spawnYaw },   // deck 0 = ground/bridge
  { colliders, interact, spawn, spawnYaw },   // deck 1 = berths
  { colliders, interact, spawn, spawnYaw },   // deck 2 = hold
],
deckPitch: 2.9,                 // world-Y distance between deck floors
setDeck(i),                     // toggles the 3 shaft-indicator lamp meshes
```
`colliders`/`interact`/`spawn`/`bounds`/`screens`/`breach` at the top level
keep describing **deck 0** exactly as today (the cockpit, breach panel and
warp/EVA logic all stay single-deck, on the bridge) - every code path that
doesn't know about decks keeps working unmodified for a player standing on
deck 0, which covers every other ship completely and the Filing Cabinet's
bridge most of the time.

Ship state (`game.js:172-182`, where `this.ship = {...}` is built) gains two
fields: `deck: 0` (int) and `deckY: 0` (float, current world-Y baseline for
the camera - 0 except mid-ride or on an upper deck). Three call sites become
deck-aware, each a 1-3 line change, each falling back to today's exact
behaviour when `interior.decks` is absent:

1. `game.js:381` (`nearestInteract`, source array): 
   `for (const it of (this.interior.decks ? this.interior.decks[this.ship.deck].interact : this.interior.interact) || [])`
2. `game.js:745` (`collideFoot`, source array): same substitution with
   `.colliders`.
3. `game.js:1575` (render camera Y):
   `V1.set(p.x, this.ship.deckY + p.y + 1.65 + bob, p.z)`.

`standUp()` (`game.js:445-451`) and `reenter()` (`game.js:1547-...`) both
already reset `player.y = 0` on spawn/breach-reentry; add `this.ship.deck =
0; this.ship.deckY = 0;` next to those two resets so boarding always starts
on the bridge.

### The elevator ride

New method `rideElevator(dir)` on the game object (`dir` = +1/-1, or simply
"next floor, wrapping"), triggered from `interact()`'s switch
(`game.js:400-417`) by adding `case 'elevator': this.rideElevator(); break;`.
No new key binding - it's a normal `E`-interact like every other prop.

- Refuses (toast, no-op) if already riding, or if `this.breach` is set (same
  guard style as `warpTo`/other action gates, e.g. `game.js:642`).
- Locks input like the breach-pull sequence does (`game.js:1456`:
  `this.ship.auto = null; this.ship.cruise = false; this.ship.throttle = 0;`
  - reuse that exact pattern, it's not flight-relevant here but keeps the
  player from wandering off mid-ride).
- Sets `this.ship.elevator = { from: this.ship.deck, to: nextDeck, t: 0, dur:
  2.6 }`, `audio.play('elevator')`, `audio.mood(...)` restored on arrival
  the same way `reenter()` restores mood.
- Each frame while `this.ship.elevator` is set (added to the top of
  `updateFoot`, `game.js:717`, before the normal WASD handling - movement
  input is ignored during a ride): `t += dt`; `this.ship.deckY =
  lerp(from*deckPitch, to*deckPitch, clamp(t/dur,0,1))` (damp/lerp helpers
  already imported at `game.js:13`); at `t >= dur`, set `this.ship.deck =
  to`, `this.ship.deckY = to*deckPitch`, clear `this.ship.elevator`,
  `interior.setDeck(to)` (swap the shaft lamp), stop the elevator track,
  restore `audio.mood(this.zone ? 'combat' : 'cruise')` (same call already
  used at `game.js:894`/`952`/`965`/`1121`).
- `interior.bounds` (used to clamp `p.x/p.z`, `game.js:759-760`) is shared
  across all three decks unchanged - they have the identical footprint by
  construction, so one bounding box is correct for all of them.

### Deck layout (ship-local metres, same convention as every other ship:
floor y=0 within its own deck, forward -Z, origin on the floor at ship
centre)

`W=6.4, L=7.0, H=2.6, win=3.0` (narrower window than scout - square bow),
`hx=3.2, hl=3.5`, wall `T=0.15` as everywhere else in `ships.js:31`.

**Deck 0 - Bridge** (built exactly like every other ship's deck):
`shell(k0, s, P)`; `cockpit(k0, s, P)` (reused verbatim - it already only
needs `s.{W,L,H}` and places the yoke/dashboard/seat/nav screen at `zf =
-hl+T = -3.35`, spawn at `F(3.55) = 0.2`, seat at `F(2.25) = -1.1` - all of
which fit inside `hl=3.5` with 3.3 m of aft room to spare); `breachPanel(k0,
s)` reused verbatim. Aft room (`z: 0.2` to `3.5`): 2 lockers
(`lockers(k0, 2, P)` against the aft wall), a mini-fridge, and the elevator
landing: a door hole in the aft wall at `x: -0.8..0.8` (`wall()` hole,
exactly the pattern every room function already uses, e.g.
`ships.js:762 wall(false, -1.525, -2.85, 2.85, H, C.wall, [{a:-0.8,b:0.8}],
P)`), `k.use('elevator', 'call the elevator', 0, 1.2, 2.8, 1.4)`, and a
small 3-lamp indicator panel (three `OCT` or small `BOX` lights stacked at
`x=0.9, z=2.8, y=[0.9,1.5,2.1]`) whose meshes `buildInterior` exposes so
`setDeck(i)` can light the one matching the current floor (reusing the
`k.blink`/toggle pattern already used for the dashboard LED,
`ships.js:647-650`). Sign `'BRIDGE'`.

**Deck 1 - Berths**: full enclosed `shell()`-style box (floor, ceiling, four
walls, **no window** - only the bridge deck is glazed), same door hole and
elevator landing at the identical `x=0, z=2.8` (shaft must line up on every
deck). Two `bunkBed(k1, C.teal, C.white)`-style beds along the side walls
(mirrored, as in `haulerRooms`, `ships.js:850-851`), one `desk(k1, 1.6,
C.wood, ...)` + `chair(...)` + `lamp(...)` combo (as in `dorm()`,
`ships.js:912-916`), a poster. Sign `'BERTHS'`.

**Deck 2 - Hold**: full enclosed shell, same elevator landing. Two
`rack(k2, 2.4, seed)` cargo racks (as in `haulerRooms`), a `workbench(k2,
2.4)` (as in `droneRoom`, `ships.js:1124`), the `droneBay(k2, 0, z, s, px,
pz)` prop and `'drone'` interact (belly-hatch abstraction already shared by
every ship - the exterior hatch position is independent of which interior
room narratively "owns" it, exactly as today). Sign `'HOLD'`.

Each deck is its own `Kit` instance, merged separately
(`Kit.build()`, `ships.js:177-209`) and added as a child group with
`.position.y = deckIndex * 2.9` - three small merged mesh sets rather than
one giant one, which is *better* for the 12k-triangle "others" budget in
`docs/PLAN.md`'s actors budget table, not worse (each deck is roughly
racer-sized in complexity). Target: **under 4,500 triangles per deck,
~13,000 total interior, under 6,000 exterior** - comfortably inside the
existing "under 12k for others" guidance despite being the biggest of the
15.

### `buildExterior('locker', ...)`

A vertical box tower: main hull a tall `BOX` (`-3.2..3.2` x, `0..10.4` y,
`-3.5..3.5` z, roughly), three shallow horizontal seam/trim boxes at each
deck boundary (`y ~= 2.9, 5.8`, reusing the `frameBox()` trim technique
already used for windows, `ships.js:1230-1235`) so the exterior visibly
reads as stacked drawers even before anyone walks inside, a small
flat-roofed cap, and stub landing legs at the base (4 short `CYL` posts) so
the tower doesn't look like it's floating on a flat belly like every other
ship. Windshield only at deck-0 height, matching the interior. `dronePort`
at the belly like every ship (independent of interior deck, as above).

### `walkCheck()` - what changes and what doesn't

`walkCheck(I, ...)` (`ships.js:1461-1536`) takes one interior object `I` and
checks one connected floor. It needs **no signature change** - call it once
per deck: `walkCheck(interior.decks[0], ...)`, `walkCheck(interior.decks[1],
...)`, `walkCheck(interior.decks[2], ...)`, each with that deck's own
`spawn`/`colliders`/`interact`/`bounds` (deck 0's `bounds` is the shared
`interior.bounds`; decks 1-2 need their own `bounds` field set to the same
XZ box, different only in that `spawn` for decks 1/2 should be the elevator
landing spot, `{x:0, z:2.8}`, since that's where a rider arrives). Add one
assertion the existing tool doesn't check but this ship needs: the elevator
landing point `{x:0, z:2.8}` must be walkable and its distance-to-nearest-
collider must clear the player radius (`R=0.3`) on **all three decks at the
identical XZ coordinate** - a simple post-check in the test script (section
6), not a `walkCheck()` change, since it's a cross-deck invariant rather
than a within-deck one.

## 5. Abilities (7, all implementable in this codebase)

One universal key: **`R`**, helm mode only (mirrors the existing single-key
scheme - `C` cruise, `T` autopilot, `J` warp, `F` dock, `X` all-stop,
`game.js:330-355`; `R` is unused by any mode today). Only a ship with an
`ability` field does anything on `R`; add to the `keydown` switch
(`game.js:330-355`, beside the existing `case 'KeyX'`):
```js
case 'KeyR': if (this.mode === 'helm' && this.def.ability) this.useAbility(); break;
```
Central tuning table, same style/location as the existing `EQUIP`/`ITEMS`
maps (`game.js:15-30`):
```js
export const ABILITIES = {
  afterburner: { name: 'Afterburner', key: 'R', cooldown: 9,  cost: 8,  desc: 'Hold a 2.2 s burn at 2.3x top speed. Heavier turn while it lasts.' },
  blink:       { name: 'Blink',       key: 'R', cooldown: 6,  cost: 10, desc: 'Instant 1,400 u hop forward. Half a second of grace from enemy fire.' },
  cloak:       { name: 'Cloak',       key: 'R', cooldown: 20, cost: 1.2, /* per second while active */ desc: 'Toggle. Enemies past 900 u lose your position. Firing decloaks you.' },
  tractor:     { name: 'Tractor beam',key: 'R', cooldown: 4,  cost: 3,   /* per second while held */ desc: 'Hold to reel in the locked imp.' },
  ram:         { name: 'Ram shield',  key: 'R', cooldown: 12, cost: 15, desc: '3 s of no collision damage to you; ramming an imp hurts it instead.' },
  decoy:       { name: 'Decoy flares',key: 'R', cooldown: 10, cost: 5,  desc: 'Drop 3 flares. Nearby imps may lock onto one instead of you, for a while.' },
  repair:      { name: 'Nanites',     key: 'R', cooldown: 25, cost: 20, desc: 'Instant +80 hull.' },
  scoop:       { name: 'Fuel scoop',  key: 'R', cooldown: 0,  cost: 0,  desc: 'Passive. Sit at the edge of a star’s corona: fuel trickles in, hull trickles down.' },
};
```
`SHIPS` entries get one new field, `ability: 'afterburner'|null|...`, per
section 2's table.

### 5.1 Afterburner - Eraser

- Trigger: `R`, upfront cost 8 fuel (deny + `audio.sfx('deny')` +
  `ui.toast(...)` if `sh.fuel < 8`, same denial pattern as `refuel`/`repair`
  at `game.js:483`/`495`), 9 s cooldown after use (tracked in
  `sh.abilityCd`, decremented every frame like `sh.fireCd`,
  `game.js:798`).
- Effect: `sh.burnT = 2.2` (seconds remaining). While `sh.burnT > 0`
  (decrement each frame in `updateShip`): change the boost multiplier at
  `game.js:831` from `(sh.boost ? 1.7 : 1)` to `(sh.burnT > 0 ? 2.3 :
  sh.boost ? 1.7 : 1)` (burn overrides Shift-boost rather than stacking with
  it - one line). Also multiply `turn` at `game.js:772` (`const turn =
  this.def.turn * (sh.burnT > 0 ? 0.6 : 1);`) so it's a committed burn, not
  a free speed-plus-agility button.
- Audio/feel: `audio.loop('thruster')` (already exists,
  `audio.js` loop list) at higher volume for the duration; a
  `ui.toast('AFTERBURNER')` on trigger.
- Test (headless, `tools/test.mjs` / `window.__dv`): switch to `eraser`,
  enter helm, record `ship.vel.length()` over 60 frames at full throttle
  with no burn (baseline), call `game.useAbility()`, assert `ship.burnT >
  0`, assert `ship.fuel` dropped by 8, sample speed again and assert it
  exceeds `vmaxSub` (i.e. the 1x case) by roughly the 2.3x factor within the
  ramp window, call `useAbility()` again immediately and assert nothing
  happens (cooldown still > 0).

### 5.2 Blink - Correction Tape

- Trigger: `R`, upfront cost 10 fuel, 6 s cooldown. Cancels `sh.auto` like
  every manual stick input already does.
- Effect: `const fwd = FWD.clone().applyQuaternion(sh.q)`, `dist =
  Math.min(1400, (this.u.ctx.dnear ?? 1e9) * 0.5)` (clamped so it can never
  blink the ship into a body - reuse `this.u.ctx.dnear` from
  `universe.js:997`, already computed every frame), `sh.pos.addScaledVector(
  fwd, dist)`. Set `sh.blinkIframe = 0.15` (seconds).
- Guard: add `if (sh.blinkIframe > 0) return;` at the top of the ship's
  `damage(amount, why)` method (search that name in `game.js` - it's called
  from `collide()` at `game.js:915` and from the combat-hit path around
  `game.js:1272`) so the grace window actually does something.
- Test: record `ship.pos` before, call `useAbility()`, assert the position
  moved ~1,400 u along the pre-blink facing vector (within a few u for
  floating point); place a mock body 1,000 u ahead via the test hook and
  re-run, assert the blink distance clamped to ~500 u (half of `dnear`) and
  the ship did not end up inside the body's radius.

### 5.3 Cloak - Wite-Out

- Trigger: `R` toggles `sh.cloak = { active: true, lastKnown: {...sh.pos} }`
  / `null`. Costs 1.2 fuel/s continuously while active (drained in
  `updateShip` alongside the existing fuel-drain lines,
  `game.js:839`/`846`); auto-disengages at 0 fuel.
- Firing disables it: at the top of `fire(dt)` (`game.js:1032`), add `if
  (sh.cloak && sh.cloak.active) { sh.cloak.active = false; this.ui.toast('Decloaked to fire.'); }`
  before the existing body.
- The actual "lose track" behaviour is one function:
  `targetPoint()` (`game.js:1124-1128`) currently returns live
  `sh.pos`. Change to:
  ```js
  targetPoint() {
    const sh = this.ship;
    if (sh.cloak && sh.cloak.active) {
      const seen = this.enemies.some((e) => !e.dead && vdist(e.pos, sh.pos) < 900);
      if (seen) sh.cloak.lastKnown = { x: sh.pos.x, y: sh.pos.y, z: sh.pos.z };
      return sh.cloak.lastKnown;
    }
    return { x: sh.pos.x, y: sh.pos.y, z: sh.pos.z };
  }
  ```
  Every consumer of `targetPoint()` (imp steering/firing, capital
  turret/beam aim, `game.js:1130-1184`) automatically inherits the effect -
  no other combat code changes. This is a behavioural cloak (enemies aim at
  a stale point once you're past 900 u), not a rendering change - no shader
  work, no risk of an invisible-but-still-solid-looking ship bug.
- HUD: one flag in the existing flags row (`ui.js:211`, beside the
  `JAMMED` span): `if (sh.cloak && sh.cloak.active) flags.push('<span class="cloak">CLOAKED</span>')`.
- Test: mock enemy at 1,500 u (outside the 900 u detection radius), engage
  cloak, move the real ship for 3 s of simulated frames, assert
  `targetPoint()` stays equal to the position captured at engage-time
  (frozen); move the mock enemy to 500 u, run one more frame, assert
  `targetPoint()` now tracks live `sh.pos` again.

### 5.4 Tractor beam - Paperclip

- Trigger: `R` held (not a toggle - `keys.has('KeyR')` checked every frame
  in `updateHelmInput`, same style as the existing `keys.has('Space')` fire
  check at `game.js:793`), costs 3 fuel/s while held, 4 s cooldown after
  release.
- Target: reuse the existing crosshair aim-assist target picker
  (`game.js:1054-1071` - the "enemy within 6 degrees of the crosshair"
  logic from the 2026-09-23 pass), restricted to `e.kind === 'imp'` only
  (never capitals/turrets - both for balance and because capital position
  logic, `game.js:1158-1184`, isn't written to be shoved around).
- Effect, each held frame: `const toShip = V.set(sh.pos.x - e.pos.x,
  sh.pos.y - e.pos.y, sh.pos.z - e.pos.z).normalize().multiplyScalar(900);
  e.vel.lerp(toShip, 1 - Math.exp(-2 * dt));` - pulls the locked imp toward
  the player at up to 900 u/s, same lerp-toward-target idiom already used
  for imp movement (`game.js:1146`).
- Test: mock imp at 1,500 u directly ahead, hold `R` for 90 simulated
  frames, assert `vdist(imp.pos, ship.pos)` decreases every sampled frame
  and `sh.fuel` drops at ~3/s; release, assert the imp's velocity stops
  being overridden.

### 5.5 Ram shield - Stapler

- Trigger: `R`, upfront cost 15 fuel, 3 s duration (`sh.ramT = 3`), 12 s
  cooldown.
- **New, scoped-down collision check** - ship-vs-enemy collision does not
  exist anywhere in the game today (`collide(ctx, dt)`,
  `game.js:901-920`, only checks `ctx.bodies`, i.e. planets/stars/stations,
  never `this.enemies`). Rather than add universal ship-vs-enemy physics
  (a much bigger, riskier change touching all 15 ships and the existing
  40/41 test baseline), **gate the entire new check behind `this.def.ability
  === 'ram'`** - only the Stapler ever tests enemy proximity for collision;
  every other ship's flight is provably unaffected because the code path
  doesn't run for them:
  ```js
  // called from the same place collide(ctx, dt) is called, game.js:697
  ramCheck(dt) {
    if (this.def.ability !== 'ram') return;
    const sh = this.ship, rad = (this.exterior && this.exterior.radius) || 20;
    for (const e of this.enemies) {
      if (e.dead || e.kind !== 'imp') continue;
      const d = vdist(e.pos, sh.pos);
      if (d >= e.radius + rad) continue;
      if (sh.ramT > 0) {
        this.hitEnemy(e, clamp(sh.vel.length() * 0.08, 40, 400), sh.pos); // reuse hitEnemy, game.js:1244-1265
        sh.vel.multiplyScalar(-0.3);
      } else {
        this.damage(15, 'crash'); sh.vel.multiplyScalar(-0.3);
      }
    }
  }
  ```
- Test: mock imp placed in contact range, activate ram, step frames, assert
  imp `hp` dropped and ship `hull` unchanged; repeat on a non-Stapler ship
  (or without activating) and assert neither hp nor hull changes - this is
  the regression guard that proves the other 14 ships and the existing
  40/41 suite stay exactly as they are.

### 5.6 Decoy flares - Sticky Notes

- Trigger: `R`, upfront cost 5 fuel, 10 s cooldown, instant (no hold).
- Spawns 3 entries in a new `this.decoys` array: `{ pos: {...sh.pos +
  small random offset}, life: 6 }`, counted down each frame (`this.decoys =
  this.decoys.filter((d) => (d.life -= dt) > 0)`, placed in the same tick
  loop area as `this.shots` upkeep, `game.js:1187-1199`).
- Visual: one new tiny export in `actors.js`, `buildDecoy()`, mirroring
  `buildDrone()`'s contract (`ships.js` PLAN contract, budget <50
  triangles - a glowing `OCT` with a short fading trail is enough),
  instantiated into the scene the same way `spawnImp()` instantiates
  `buildImp()` results.
- Targeting hook, in the per-enemy loop (`game.js:1135-1140`, right after
  `if (e.dead) continue;`): if `e.kind === 'imp'` and `this.decoys.length`
  and no existing `e.decoyT > 0`, roll `Math.random() < 0.5` to lock a
  decoy: `e.decoyLock = pick(this.decoys); e.decoyT = 3;`. While `e.decoyT >
  0` (decremented alongside `e.phase` in the same block), substitute `tp =
  e.decoyLock.pos` instead of the shared `tp` for that enemy's steering/aim
  this frame only (everything downstream in the imp branch already reads a
  local `tp`-derived `to` vector, so this is a per-iteration override, not a
  structural change).
- Test: two mock imps, trigger decoys, run 4 s of frames, assert at least
  one imp's `decoyLock` is set and its steering `to` vector points at the
  decoy position rather than the real ship for the locked duration, then
  reverts once `decoyT` and decoy `life` both expire.

### 5.7 Repair nanites - Glue Stick

- Trigger: `R`, upfront cost 20 fuel, 25 s cooldown, instant.
- Effect: `sh.hull = Math.min(this.stat('hull'), sh.hull + 80);
  audio.sfx('seal');` - literally the existing `repair()` item logic
  (`game.js:570-571`, the hull-patch-kit item) at a bigger, free-standing
  dose, gated by cooldown instead of an inventory count. No new state beyond
  the shared `sh.abilityCd`.
- Test: damage the mock ship to half hull, trigger, assert `hull` increased
  by 80 (clamped to max), assert fuel dropped by 20, assert a second
  trigger within 25 s does nothing.

### 5.8 Fuel scoop - Filing Cabinet (locker)

- No key, no cooldown - fully passive, gated by `this.def.scoop` (a boolean
  on the `locker` entry, not in the shared `ability` string field since it
  has no trigger/cooldown shape).
- In `updateShip` (`game.js:829-853`, alongside the existing fuel-drain
  logic): `const near = this.u.ctx.nearest; if (this.def.scoop && near &&
  near.kind === 'star' && vdist(near.pos, sh.pos) < near.r * 1.15) {
  sh.fuel = Math.min(this.stat('tank'), sh.fuel + dt * 2); sh.hull =
  Math.max(1, sh.hull - dt * 1); this.scooping = true; } else this.scooping
  = false;` - `this.u.ctx.nearest`/`.kind`/`.r` already exist
  (`universe.js:975-997`).
- Deliberately expensive and rare, per Gev's "I like the fuel annoyance,
  keep it" note: it costs hull, only works within 15% of a star's own
  radius (a genuinely tight, risky orbit), and only the 45,000 cr flagship
  has it - not a way to trivialise the existing fuel pain, a high-risk
  escape valve for one specific ship.
- HUD: `flags.push('<span class="scoop">SCOOPING</span>')` when
  `this.scooping`, same flags-row pattern as `JAMMED`/`CLOAKED`.
- Test: mock star, position the mock ship at `star.r * 1.1` (inside the
  15% band), run frames, assert `fuel` rises at ~2/s and `hull` falls at
  ~1/s; move to `star.r * 2`, assert both stop changing.

## 6. Test plan summary (`tools/test.mjs`)

Baseline is 40/41 (known failure: "autopilot closes on Mars", unrelated to
this work - do not let it regress further, and do not attempt to fix it as
part of this spec, it's out of scope). Add, per ship added/changed:

1. **Every `SHIPS` id**: `buildInterior(id)` + `buildExterior(id)` succeed,
   `walkCheck(interior)` returns `ok: true` with zero `problems` (for
   `locker`, run `walkCheck` three times, once per `interior.decks[i]`, plus
   the cross-deck elevator-landing-alignment check from section 4).
2. **Shop order**: `Object.keys(SHIPS)` matches the section 2 order exactly
   (a plain array-equality assertion - this is what actually controls the
   rendered shop order, so it's the correct thing to assert, not a DOM
   scrape).
3. **Speed spread**: assert `Math.max(...speeds) / Math.min(...speeds) >
   3.5` and assert at least 3 ships have `speed > 420` (today's old max) -
   turns "at least three fast interceptors" into a real regression guard
   instead of a one-time claim.
4. **Each of the 7 abilities**: the per-ability test in section 5, run via
   `window.__dv` exactly like the existing mode-drive tests described in
   `docs/PLAN.md` section 4.
5. **Ram-shield regression guard** (section 5.5): explicitly assert the new
   `ramCheck` is a no-op for all 14 non-Stapler ships.
6. Full `node tools/test.mjs` run at the end, target **≥ 54/55** (40
   existing minus the known Mars failure, plus the new checks above), never
   fewer passing than the 40 that pass today.

## 7. Files touched

- `js/ships.js`: `SHIPS` table (sections 1-2), 9 new `ext<Name>()`
  functions + `EXTERIOR` map entries (section 3), `buildInterior('locker',
  ...)` special case + 3 new deck-building functions + `LAYOUT.locker`
  entry + `setDeck()` (section 4). No changes to any existing room/exterior
  function.
- `js/game.js`: `ABILITIES` map, `sh.ability`-adjacent state fields,
  `useAbility()`, `rideElevator()`, `ramCheck()`, the `targetPoint()`
  rewrite, the three deck-aware call-site edits, one `KeyR` case, one
  `decoys` upkeep block (sections 4-5). No changes to any other ship's
  existing flight/combat behaviour - every new branch is gated by
  `this.def.ability`/`this.def.scoop`/`interior.decks` and falls through to
  today's exact code otherwise.
- `js/actors.js`: `buildDecoy()` (section 5.6). No other change.
- `js/ui.js`: append the ability hint to `keysFor('helm')` (section 5
  intro), two new flag spans (`CLOAKED`, `SCOOPING`, sections 5.3/5.8). No
  change to the shop card rendering (already generic, section 2).
- `js/audio.js`: none - `'elevator'` track and the `thruster`/`shower`-style
  loop helper already exist and are reused as-is.
- No changes anywhere to `js/universe.js`, `js/render.js`, `js/mats.js`, or
  the `FUELS`/`FUEL_PRICE` tables.
