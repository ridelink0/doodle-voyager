# Tutorial + controller support — spec

Owner of this doc: design/research pass only, **no game files touched** — this
session only wrote this file. Written for an implementer who has not read the
sources below. Project root `D:\doodle-voyager`; read `docs/PLAN.md`,
`docs/HANDOFF.md`, `docs/STORY.md`, `docs/TODO.md` first, and the sibling
part-1 specs this document builds on top of: `docs/specs/neon-relook.md`,
`docs/specs/ship-roster.md`, `docs/specs/enemy-squadron-organization.md`,
`docs/specs/universe-density-and-galaxy-clusters.md`, `docs/specs/planet-ads.md`.
Everything in this spec was checked against the source as it stood on
2026-09-24; where part 1 is still landing at implementation time, every hook
into it below is written to degrade gracefully (§0.3).

This specs **two things that must fit together**: **(A)** a first-mission
tutorial at Sol Pumps, voiced by the Spiral Bound Galactic station announcer,
and **(B)** PS5/Xbox gamepad support through the Gamepad API standard
mapping. They fit together at one seam: the tutorial's on-screen prompts and
(B)'s glyph layer are **the same component** (§5) — a tutorial prompt never
hardcodes "press E", it asks the glyph layer "what does interact look like
right now" and gets a keyboard `<kbd>E</kbd>` or a controller glyph back,
whichever the player last touched.

## 0. Scope, sources, and what "expected from part 1" means here

### 0.1 Files this spec touches (all owned by "main" per `PLAN.md`'s table)

`js/game.js`, `js/ui.js`, `js/universe.js`, `index.html`, `style.css`, one
new file `js/gamepad.js`. No changes to `js/render.js`, `js/mats.js`,
`js/ships.js`, `js/media.js`, `js/audio.js` (existing `sfx()`/`mood()` calls
are reused as-is throughout).

### 0.2 Read in full this session (baseline for every line reference below)

`js/game.js` (constructor 55-260, input/keydown 281-362, interact/dock/refuel
378-489, navigation 590-665, loop/update 666-900, warp/collide 861-919,
fire/assist 1030-1072, breach/EVA 1442-1560), `js/ui.js` (1-310, 420-596),
`index.html` (full), `style.css` (1-75), `tools/test.mjs` (1-149),
`docs/STORY.md`, `docs/TODO.md`, `docs/HANDOFF.md`, `docs/PLAN.md`, and the
relevant slices of `js/universe.js` (`target()` 807+, `planetPos`/orbit
periods 525-580, `makeSystem`/`stationPos` 408-518, station wiring in the
system View 220-246).

### 0.3 "Expected from part 1" — functions this spec assumes may not exist yet

This session confirmed by grep that **none of the following exist in the
codebase today**: `g.squads`, `ABILITIES`, `useAbility()`, per-imp `type`/
faction naming (`grep -n "wasp\|Grunt\|Rusher\|Shieldbearer"` returns nothing;
every enemy is currently `{ kind: 'imp', name: 'Red guy' }`,
`js/game.js:1018`), and the neon palette tokens in `neon-relook.md` §5.1
(`js/mats.js` today still exports the paper-era `PAL` from `PLAN.md`). This
spec is written **on top of** those three sibling specs and names exactly
where it hooks in, with a fallback for each in case this lands first:

| Expected from part 1 | Where this spec uses it | Fallback if absent |
|---|---|---|
| `ship-roster.md` §5: `ABILITIES`, `this.def.ability`, `useAbility()`, `KeyR` | Controller helm mapping (§4.5) binds L3 to it | L3 press calls `useAbility?.()` optionally-chained; a ship with no `ability` field already no-ops today (`if (this.mode==='helm' && this.def.ability) this.useAbility();`, keyboard `KeyR` case) — same guard, so L3 is simply inert until part 1 lands, never an error |
| `enemy-squadron-organization.md` §3-4: `g.squads`, `FORMATIONS.v`, squad `state` | Tutorial step 14 "wing cleared" detection (§3.3 step 14) prefers reading `g.squads` for a clean "this squad is dead" signal | Falls back to "every enemy spawned by `spawnTutorialWing()` is dead", tracked by this spec's own id tag (§3.4), which works with zero dependency on the squad system |
| `neon-relook.md` §5.1: new `--ink`/`--red`/space-bg CSS custom properties, `PAL.cyan` etc. | Every new CSS rule in §6 reads `var(--ink)`/`var(--red)`, never a hex literal | None needed — this is a hard requirement, not a fallback: if this spec's CSS is implemented before the neon relook lands, it inherits the current paper palette automatically and re-themes for free the moment part 1 repoints those custom properties. **Do not hardcode `#1a30c0` anywhere in the new CSS.** |

### 0.4 A note on "Paper Wasp"

`docs/STORY.md`'s "Paper Wasp" is flavour naming for the existing generic
`kind: 'imp'` enemy — there is no `wasp` type in the code and this spec does
not add one (that would be an `actors.js` change, out of every part-1 spec's
file scope and out of this one's). The tutorial's "first Paper Wasp wing" is
copy/toast text layered over the existing imp, exactly the way
`docs/STORY.md`'s own delivery rules ask for ("everything else is
environmental… flavour per item, not a text dump").

---

## 1. The autopilot bug — diagnosis and a proposed fix

Tutorial step 9 ("set a course from the map") is listed as needing to
**actually work**, per `docs/TODO.md`: *"Setting a destination does not
really work… The end-to-end check 'autopilot closes on Mars' still fails in
headless runs (the ship is still turning while Mars orbits away)."* Read in
full this session: `game.js:620-627` (`setCourse`), `796-859` (`updateShip`,
autopilot branch 809-828), `tools/test.mjs:120-131` (the failing check).

**What is NOT the bug**, ruled out by reading the code and doing the
arithmetic, not guessing:

- Mars's orbital motion is negligible on tutorial timescales. `T(per) =
  max(900, 7200·√(per/365.25))` (`universe.js:525`); Mars (`per: 687`,
  `universe.js:27`) gets `T ≈ 9,871` game-seconds, i.e. ≈0.00064 rad/s — over
  even the test's ~16 s of fast-forwarded sim time that's ≈0.6°. Not the
  cause.
- The test's `steps=4` fast-forward (`tools/test.mjs:41`) genuinely
  compresses time (~4× realtime, confirmed by reading `game.js:667-684`'s
  `loop()`: `this.steps` sub-steps run per rAF at the same `dt`), but 16 s of
  sim time is still ≥8× the ~1.8 s a scout's turn rate (`def.turn=1.6`,
  `sh.q.rotateTowards(Q2, this.def.turn * 1.1 * dt)`, `game.js:822`) needs to
  sweep a full 180° — orientation convergence alone should not take this
  long under normal operation.

**Hypothesis A (primary, recommended fix — low-risk, targeted).** Every
frame the autopilot branch rebuilds the target orientation from scratch with
`Q2.setFromUnitVectors(FWD, to)` (`game.js:821`) — this is the *minimal-arc*
rotation from local -Z to the world direction `to`, which does **not**
constrain roll. Nothing in the autopilot path ever zeroes the ship's roll
(roll is applied freely by `A`/`D` at the helm, `game.js:783-784`, and the
autopilot branch never touches it). If the ship has any residual roll when
`setCourse` is called — likely, since a player just finished manually flying
— `setFromUnitVectors`'s choice of rotation axis can differ from frame to
frame as the ship's current orientation changes, because the "shortest arc
from -Z to `to`" is itself a function of the ship's current roll. The
practical symptom of an unstable target axis chasing a moving current
orientation is exactly what was reported: **the ship visibly keeps turning,
never settling on `align > 0.6`/`0.9`**, rather than plainly failing to turn
at all. The other three `setFromUnitVectors(FWD, …)` call sites in the file
(`866`, `877`, `1148`) are short-lived (warp spool, combat aim-turns) or
roll-neutral by construction, which is consistent with this not having
surfaced as a complaint there.

Fix — stabilize roll during autopilot only, reusing the file's own existing
Euler-decompose idiom (`E1`, `'YXZ'`, already declared `game.js:39`, used by
`qYP()` at `game.js:42`), so the fast-arc `rotateTowards` behaviour is
untouched and only the *lingering roll* is damped out:

```js
// game.js, inside the `if (sh.auto)` branch, right after the existing
// sh.q.rotateTowards(Q2, this.def.turn * 1.1 * dt);  (line 822)
E1.setFromQuaternion(sh.q, 'YXZ');
sh.q.setFromEuler(E1.set(E1.x, E1.y, damp(E1.z, 0, 3, dt), 'YXZ'));
```

`damp` is already imported (`game.js:13`). This is a four-line, additive
change inside one existing `if` branch — it cannot regress manual flight
(roll is only ever touched here while `sh.auto` is set) or warp/combat aim
(different code paths).

**Hypothesis B (secondary — verify A first; keep only if A doesn't fully
close the gap).** `updateShip`'s cruise-speed formula
(`targetSpeed = Math.max(vmaxSub, Math.max(sh.throttle,0.15) *
Math.min(cmax, 0.1*ctx.dnear))`, `game.js:835`) caps speed by 10% of
distance to the *nearest body* — right after undocking, that's small (the
station itself), so cruise speed bootstraps near zero even once aligned.
This is documented, intentional behaviour (`ship-roster.md` §0: "cruise speed
ramps up the farther you are from anything") and is **not itself a bug** —
but combined with the tight `align > 0.9` gate (`game.js:825`) before cruise
engages at all, a ship that is aligned-but-not-*perfectly*-aligned right
after departure makes only slow sublight progress for several seconds. If,
after shipping fix A and re-running the existing test, `ap1.d < ap` still
sometimes fails on a genuinely far target, add a speed floor so the ship is
never silently near-stationary while `sh.auto` is set:

```js
// game.js:841, sublight branch — only reachable when sh.cruise is false
targetSpeed = Math.max(sh.auto ? vmaxSub * 0.5 : 0, Math.min(sh.throttle * vmaxSub, limit));
```

**How to verify (do this before touching either fix)**: add one temporary
`console.log({align, rollDeg: THREE.MathUtils.radToDeg(E1.z)})` inside the
`sh.auto` branch, run `node tools/test.mjs`, watch whether `align` climbs
smoothly toward 1 or oscillates while `rollDeg` stays large — that
distinguishes A from B empirically instead of guessing twice. This is marked
as a diagnosis from static reading, not a verified fix — per the project's
own rule, it is not being passed off as more certain than it is.

**Why the tutorial doesn't merely need this fixed generically**: §3.3 picks
a *short* course (≈13,000 u, well under the 40,000 u cruise threshold, so the
tutorial's own course-setting step exercises sublight-only autopilot and is
robust even before hypothesis A lands) — but that is defence in depth, not a
substitute for the real fix, because the player will use `T`/autopilot at
arbitrary distances for the rest of the game after the tutorial ends.

---

## 2. Why (A) and (B) are one spec: the shared prompt/glyph layer

Every existing on-screen hint in the game is text: `ui.js:236-243`
(`keysFor()`, feeds `#h-keys`), `ui.js:225-233` (`#h-prompt`, e.g. `` `E ·
${it.label}` ``), the start screen's `<kbd>` legend (`index.html:64-97`). All
of it assumes a keyboard. This spec adds exactly one seam: a **binding
table** (§4.4) mapping every game action to `{ key, gamepadButton|axis }`,
and a **prompt renderer** that looks up the current input device (§4.8) and
renders either a `<kbd>` (existing CSS, unchanged) or an inline SVG glyph
(§4.3, new). The tutorial (§3) never writes `"E · sit down"` itself — it
asks this renderer for the `interact` action's current glyph. This is the
only way "full bindings for every mode… including tutorial prompts" (the
task's own phrasing) and the tutorial's prompts can both be satisfied by one
body of code instead of two that can drift apart.

```js
// js/gamepad.js — the shared binding table, one row per game action.
// `key` matches the existing e.code values already used throughout game.js.
export const ACTIONS = {
  // shared
  interact:  { key: 'KeyE',  pad: { foot: 'X', eva: 'A', drone: null } },
  pause:     { key: 'KeyP',  pad: 'Start' },
  map:       { key: 'KeyM',  pad: 'Select' },
  // foot
  jump:      { key: 'Space', pad: { foot: 'A' } },
  run:       { key: 'ShiftLeft', pad: { foot: 'R3' } },
  storage:   { key: 'KeyI',  pad: { foot: 'Y' } },
  media:     { key: 'KeyV',  pad: { foot: 'RB' } },
  photo:     { key: 'KeyK',  pad: { foot: 'DpadUp' } },
  droneToggle:{ key: 'KeyG', pad: { foot: 'DpadDown' } },
  // helm
  dock:      { key: 'KeyF',  pad: { helm: 'A' } },
  standUp:   { key: 'KeyE',  pad: { helm: 'X' } },
  cruise:    { key: 'KeyC',  pad: { helm: 'Y' } },
  allStop:   { key: 'KeyX',  pad: { helm: 'B' } },
  look:      { key: 'KeyQ',  pad: { helm: 'LB' } },   // held
  boost:     { key: 'ShiftLeft', pad: { helm: 'RB' } }, // held
  ability:   { key: 'KeyR',  pad: { helm: 'L3' } },
  courseSet: { key: 'KeyT',  pad: { helm: 'DpadUp' } },
  nearestPump:{ key: 'KeyL', pad: { helm: 'DpadLeft' } },
  warp:      { key: 'KeyJ',  pad: { helm: 'DpadRight' } },
  throttle:  { key: ['KeyW','KeyS'], pad: { helm: 'RT' } },   // analog, §4.5
  fire:      { key: 'Space', pad: { helm: 'LT', drone: 'RB' } }, // analog trigger, §4.5
  roll:      { key: ['KeyA','KeyD'], pad: { helm: 'LStickX' } },
  // eva / drone verticals
  thrustUp:  { key: 'Space', pad: { eva: 'RT', drone: 'RT' } },
  thrustDown:{ key: 'ControlLeft', pad: { eva: 'LT', drone: 'LT' } },
  recall:    { key: 'KeyG',  pad: { drone: 'B' } },
  bomb:      { key: 'KeyB',  pad: { drone: 'RB' } },
};
```

`ui.js`'s `keysFor(m)` (§4.5) and the tutorial's step prompts (§3) both read
this same table through one helper, `promptFor(actionName)` (§4.8) — this is
the literal seam where (A) and (B) fit together.

---

## PART A — the tutorial

## 3. Design

### 3.1 Rules, straight from `docs/STORY.md` §"How the story is delivered"

- Plays as the first mission of a **new** game (never on continue), starting
  right after the intro crawl, at Sol Pumps.
- Voiced by the cheerful, automated, slightly useless Spiral Bound Galactic
  station announcer — the four canonical lines are in `STORY.md` and are
  reused verbatim where they fit (§3.5's step 11); every new line this spec
  writes matches that voice (sincere corporate cheer, a slogan that
  undercuts its own product, never breaking into plain narration).
- **Skippable at any time**, **replayable from the menu**, **never blocking a
  returning player**.
- Each step is "detected from real game state" — no step advances on a
  timer or a hidden click-through; §3.3 gives each step's exact predicate.

### 3.2 Save-flag correctness — the easy way to get "never blocks a returning
player" wrong

`freshSave()` (`game.js:55-62`) gets one new field, `tutorialDone: false`.
`upgradeSave()` (`game.js:64-70`) backfills any field missing from an
existing save with `freshSave()`'s default via a blind loop — **that is
exactly backwards for this field**: it would silently arm the tutorial for
every returning player with an old save, the one thing the task explicitly
forbids. Fix at the same call site, immediately after the existing loop:

```js
// game.js, upgradeSave(), right after the existing `for (const k of ...)` loop
if (s.tutorialDone === undefined) s.tutorialDone = true; // upgrading an OLD save: already "returning", never auto-arm
```

Only a save that came from `freshSave()` itself (a genuinely brand-new
voyage, `newVoyage()` at `game.js:224-234`, or the very first boot with no
`store.get(SAVE_KEY)`) ever has `tutorialDone: false`.

### 3.3 The step machine

New state, `this.tutorial`, `null` when inactive. Set by `startTutorial()`
(§3.5), read once per frame by `updateTutorial(dt)` (called from `update()`,
`game.js:686-708`, guarded `if (this.tutorial) this.updateTutorial(dt);` so
the cost is one property check when the tutorial isn't running).

```js
// game.js
this.tutorial = {
  step: 0,               // index into STEPS (§ below)
  t: 0,                  // seconds in the current step, for the "still stuck" nudge (§3.6)
  shotsFired: 0, assistedShots: 0,           // step 8
  wrongPumpDocked: false, wrongPumpRefused: false,  // steps 10-11
  refueled: false,                            // step 13
  scout: null,            // the practice imp, step 8 (§3.4)
  wingIds: [],             // enemy ids spawned for step 14 (§3.4)
};
```

Each step is `{ id, prompt(g), detect(g), onEnter(g), announce }`; `detect`
returns `true` once, `updateTutorial` then calls the next step's `onEnter`
and plays `announce` (a `ui.big()` banner + `audio.sfx('ui')`, matching the
existing "YOU ARE AT THE HELM" idiom at `game.js:242`).

| # | id | Prompt shown (`#h-tut`, §3.6) | Detected when | Announcer line on entry |
|---|---|---|---|---|
| 1 | `walk` | "Walk to the pilot's seat." + glyph for `interact` | `g.nearestInteract()?.id === 'helm'` (existing `game.js:378-392`) | "Welcome aboard, valued customer. Your seat is the one with the yoke." |
| 2 | `sit` | "" (auto, no extra prompt — arriving is the action) | `g.mode === 'helm'` | "You are at the helm. Everything from here is refundable except the fuel." |
| 3 | `look` | "Hold `look` and move to look around without steering." | `(g.keys.has('KeyQ') \|\| g.mouse.right \|\| g.padLookHeld)` true **and** `Math.abs(g.player.lookYaw) + Math.abs(g.player.lookPitch) > 0.15` observed at least once (tracked as a one-shot flag set inside `updateHelmInput`, read here — §3.6) | "Looking is free. Everything else is not." |
| 4 | `throttle` | "Tap `throttle` for a nudge, hold it to keep climbing." | `g.ship.throttle >= 0.5` | "The throttle is the one that makes the ship go. Tap for a nudge, hold to keep climbing." — **this line is also `docs/TODO.md`'s open "HUD hint for W/S should say tap or hold" item, closed by this step existing at all (§7)** |
| 5 | `roll` | "`roll left`/`roll right` to roll · hold `boost` to burn faster, hungrier." | `g.tutorial.rolled && g.tutorial.boosted` (two one-shot flags set in `updateHelmInput` when `keys.has('KeyA')/('KeyD')` and `sh.boost` are each observed true at least once) | "You'll want to roll around the wing markers, and boost past anything you'd rather not be near." — **note**: the task brief said "strafe/boost"; Doodle Voyager's helm has no lateral strafe (`grep` of `updateHelmInput` confirms `A`/`D` are roll, `game.js:783-784`; no strafe key exists anywhere in `game.js`). This step teaches the two controls that actually exist — roll and boost — instead of inventing a strafe the game doesn't have, per the project's own "never pass a placeholder off as real" rule. |
| 6 | `fire` | "Fire on the drifting scout ahead." | `g.tutorial.shotsFired > 0` | "That is a lone Red Margin scout. It has not clocked you yet. Go ahead." |
| 7 | `assist` | "Fire again — a target inside the crosshair ring pulls your shots in." | `g.tutorial.assistedShots > 0` | "Notice your aim wanders toward it inside six degrees. That is the ship's doing, not yours. Don't tell it we said so." |
| 8 | `map` | "Open the `map`, pick the marked pump, then `set course`." | `!!g.navTarget && g.navTarget.name === 'SBG Annex Pumps'` (selected, not yet under way) | "For your first hop, try the Annex. It's marked." |
| 9 | `cruise-to-wrong` | "" (autopilot flies itself — nothing to press) | `g.ship.auto === null && vdist(g.ship.pos, g.u.target('station', {name:'SBG Annex Pumps', pos: WRONG_PUMP_POS}).pos(g.t)) < 3000` (i.e. arrived: `sh.auto` cleared itself via the existing "ARRIVED" path, `game.js:815-818`) | "Course laid in. Feel free to get up and stretch your legs — the ship has this." |
| 10 | `dock-wrong` | "`dock` at the Annex." | `g.tutorial.wrongPumpDocked` (set the moment `ui.open_.has('station')` is observed true while `g.state.lastStation` matches the Annex — §3.5) | — |
| 11 | `wrong-fuel` | "Try the pump." (a normal in-shop button, not a new one — §3.5) | `g.tutorial.wrongPumpRefused` (set when `refuel()`'s existing denial string, `game.js:477`, is returned while docked at the Annex) | *station announcer, on the refusal itself, verbatim from `STORY.md`*: "Welcome, valued customer. This pump does not serve your fuel type. Please enjoy the music." |
| 12 | `back-to-sol` | "`set course` back to Sol Pumps." | `g.ship.auto === null && vdist(g.ship.pos, g.u.sol.station.pos) < 3000` | "Sol Pumps sells everyone's fuel. It's the one selling point." |
| 13 | `refuel` | "`dock`, then refuel." | `g.tutorial.refueled` (set when `refuel()` returns its success string, `game.js:488`, while docked at Sol) | "There we go. Ion, the good stuff, the stuff you actually burn." |
| 14 | `wing` | "A wing is inbound. Clear it." | every id in `g.tutorial.wingIds` has `dead: true` (or, if `g.squads` exists per part 1, the squad whose members' ids match `wingIds` has `state === 'retreat'` **or** zero living members — prefer the squad's own `state`, §0.3) | "Multiple contacts, Red Margin formation. That's new for them. Good luck, valued customer." |
| 15 | `done` | "" | immediate (terminal) | "Tutorial complete. Sol system's fuel racket has been explained to you at length. Nobody warned you about the rest." |

### 3.4 Two new scripted actors and one new station

**The practice scout** (steps 6-7). `spawnScout()` reuses `spawnImp()`
exactly (`game.js:1015-1021`, unchanged signature) at a fixed offset ~400 u
ahead of the helm window, then sets one new flag on the returned entry,
`e.passive = true`. One guard line in `updateCombat()`'s existing imp branch
(`game.js:1140`, top of the per-enemy loop, `for (const e of this.enemies) {
if (e.dead) continue;` already there — add `if (e.passive) continue;`
directly after it) makes it hold position and never fire — it is a real
`enemies` entry so `assistTarget()`'s loop (`game.js:1061-1064`, iterates
`this.enemies`) picks it up for real aim-assist behaviour, it just never
shoots back. On step 7 completing, `this.hurt(g.tutorial.scout, 1e6, ...)`
(reuse the existing kill path, same as any other imp) despawns it — no new
death/reward logic, it drops no credits (guard `if (!e.passive) st.credits +=
...` at whichever line currently pays out imp kills).

**The tutorial wing** (step 14). `spawnTutorialWing()` calls `spawnImp()`
three times in a small V offset (reuse the exact offset shape from
`enemy-squadron-organization.md` §3.1's `FORMATIONS.v(3)` if that module has
landed — `import { FORMATIONS } from './game.js'` guarded with
`typeof FORMATIONS !== 'undefined'` — else three imps at plain hardcoded
offsets `[0,0,0], [-70,0,60], [70,0,60]` relative to a spawn point 2,600 u
ahead of the player, matching the shape `enterZone()` already uses for its
own tier-1 spawn ring, `game.js:982-989`). Each gets `e.tutorialWing = true`;
their `id`s (assign one if `spawnImp()` doesn't already, e.g.
`e.tid = 'tutwing-' + i`) are pushed to `g.tutorial.wingIds`. This is a
scripted skirmish, **not** a real hostile zone: it does not touch
`u.zones`/`state.liberated` and pays a flat, small completion bonus (150 cr)
on step 14 rather than the zone-clear payout, so it can never be
double-counted against the real zone economy.

**SBG Annex Pumps** (steps 9-11), added to `js/universe.js` right after the
existing `sol.station` block (`universe.js:422-424`). Confirmed this session
that a system's `View` only ever builds **one** station per system
(`universe.js:241-246`, `if (sys.station) { const st = buildStation('fuel',
…) }`) — Sol Pumps itself sells all three fuels (`fuelTypes: [...FUELS]`,
`universe.js:422`) and cannot also be the "wrong" pump, so the Annex has to
be its own system, not a second station bolted onto Sol's. Also confirmed
`makeSystem()` (`universe.js:492-508`) runs its own 42%-chance station roll
internally (`universe.js:501-504`) seeded deterministically from `o.id` — do
**not** rely on that roll landing on the desired fuel mix; call `makeSystem`
for the position/star only, then overwrite `.station` explicitly, exactly
mirroring how `sol.station` itself is set two lines above the insertion
point:

```js
// universe.js, right after the existing sol.station.pos = this.stationPos(sol); (line 423)
const tutPump = this.makeSystem(mw, {
  id: 'tutorial-annex', name: 'SBG Annex Pumps', real: false,
  pos: { x: 15000, y: 1200, z: 4000 },   // ~15.7k u from Sol's centre; clear of Earth's orbit (auToU(1) ≈ 39.3k u) and Sol's own station radius (≈9-10k u, universe.js:510)
});
tutPump.station = { name: 'SBG Annex Pumps', fuelTypes: ['PLASMA', 'DEUTERIUM'], pos: null }; // deliberately no ION — the "wrong pump" beat
tutPump.station.pos = this.stationPos(tutPump);
systems.push(tutPump);   // alongside the existing `const systems = [sol];` two lines above (universe.js:425) — insert this push right after that line
```

This system is real, permanent, on the map (filterable under "stations" like
any other), and harmless to a returning player — it's simply one more pump
in the world, in keeping with the game's own "≈42% of systems sell fuel"
design (`docs/TODO.md`), not a hidden or temporary prop.

### 3.5 Wiring

- `game.js` constructor: `this.tutorial = null; this.padLookHeld = false;`
  (the latter is §4's controller "hold to look" state, read by step 3's
  detector, §2's seam again).
- `launch()` (`game.js:235-243`): branch on entry —
  ```js
  launch() {
    audio.init(); this.applySettings();
    if (this.settings.music) audio.mood(this.zone ? 'combat' : 'cruise');
    this.ui.hideTitle();
    if (!this.state.tutorialDone && !this.tutorial) { this.startTutorial(); return; }
    this.setMode('helm'); this.lock();
    this.ui.big('YOU ARE AT THE HELM', 'W/S throttle, C cruise, M map. E stands you up.');
  }
  ```
- `startTutorial(replay = false)`: `this.setMode('foot')` (not `'helm'` —
  step 1 needs the player standing, matching `docs/STORY.md`'s "the
  tutorial happens here: flying, the throttle, docking…" as things taught in
  order, starting from foot); if `replay`, first `this.parkNear(this.u.sol
  .station.pos, 5000)` (existing method, `game.js:215-222`) so a
  mid-galaxy player is actually back at Sol; reset `this.tutorial = { step:
  0, … }`; spawn the practice scout (§3.4); `this.lock(); this.ui.big(...)`
  with step 1's announcer line.
- `updateTutorial(dt)`: `this.tutorial.t += dt`; if the current step's
  `detect(this)` is true, advance `step++`, call the new step's `onEnter`
  (spawns the wrong-pump course target as `navTarget`-eligible at step 8,
  spawns the wing at step 14), show its announcer line via `ui.big()`, play
  `audio.sfx('ui')` (matches every other confirmation cue in the file). At
  the terminal step (`id:'done'`): `this.state.tutorialDone = true;
  this.persist(); this.tutorial = null;` — from here on the game behaves
  exactly as it does today.
- `interact()`/`tryDock()`/`refuel()`: **zero changes to their control
  flow** — the tutorial only *reads* their existing return values/side
  effects. The one exception is `refuel()` (`game.js:475-489`): add two
  lines at its two existing return points so the tutorial can observe
  success/failure without changing behaviour for anyone else:
  ```js
  // game.js:477, inside the existing `if (!types.includes(f))` branch, right before `return`:
  if (this.tutorial && body === (this.u.systemsOf(this.u.mw).find(s => s.id === 'tutorial-annex') || {}).station) this.tutorial.wrongPumpRefused = true;
  // game.js:488, right before the success `return`:
  if (this.tutorial && body === this.u.sol.station) this.tutorial.refueled = true;
  ```
  (`tryDock()` similarly gains one line, `if (this.tutorial) { ... set
  wrongPumpDocked when b.name === 'SBG Annex Pumps' }`, right after the
  existing `this.state.stats.docked++;` at `game.js:468`.)
- `onKey` (`game.js:329-361`): no new keys — skip lives in the pause menu
  (below), matching every overlay-driven action already in the file.
- Pause menu (`ui.js` `renderPause()`, near `310`, and `index.html:114-128`):
  two new conditional buttons, reusing the **exact** double-press-to-confirm
  idiom already in the file (`t-new`/`newArm`, `ui.js:48-53` — copied, not
  refactored, per "minimal change scope": two similar 6-line blocks are a
  smaller diff than restructuring working code):
  ```html
  <!-- index.html, inside #pause .stack, after the existing logoff button -->
  <button data-act="skip-tutorial" id="p-skip-tut" hidden>skip tutorial</button>
  <button data-act="replay-tutorial" id="p-replay-tut" hidden>replay tutorial<small id="p-replay-sub"></small></button>
  ```
  ```js
  // ui.js wire(), alongside the existing data-act handlers (~line 41-44)
  if (a === 'skip-tutorial') { g.tutorial = null; g.state.tutorialDone = true; g.persist(); this.close('pause'); g.pause(false); }
  if (a === 'replay-tutorial') {
    const now = performance.now();
    if (now - (this.replayArm || 0) < 4000) { this.close('pause'); g.pause(false); g.startTutorial(true); this.replayArm = 0; return; }
    this.replayArm = now; $('p-replay-sub').textContent = 'click again — flies you back to Sol Pumps';
  }
  ```
  `renderPause()` toggles the two buttons' `hidden` each open:
  `$('p-skip-tut').hidden = !g.tutorial; $('p-replay-tut').hidden = !!g.tutorial;`
  — a player mid-tutorial sees only "skip"; anyone else sees only "replay".
  This alone satisfies "replayable from the menu, never blocking a returning
  player": the button exists for everyone, the auto-start (§3.5's `launch()`
  branch) never fires for anyone but a fresh save's very first launch.

### 3.6 HUD: the objective banner

New element, distinct from `#h-msg` (which auto-fades after 3.2 s,
`ui.js:299-307` — wrong for a standing objective) and `#h-prompt` (already
busy with contextual interact hints). Add to `index.html`, inside `#hud`,
own quadrant so nothing overlaps the existing four (`hud-tl/tr/bl/br` are
corners; this sits top-center):

```html
<div class="tut" id="h-tut" hidden><b id="h-tut-obj"></b><span id="h-tut-key"></span><small>P for pause · skip anytime</small></div>
```

`ui.js`'s `frame(dt)` (`ui.js:149-166`) gains, right after the existing
`this.hud();` call: `if (g.tutorial) this.renderTutorial();` —
`renderTutorial()` sets `#h-tut-obj` to the current step's `prompt(g)` text
and `#h-tut-key` to that step's glyph via `promptFor()` (§4.8), toggles
`#h-tut.hidden = !g.tutorial`. `style.css` (new rule, alongside the existing
`.message`/`.prompt` block, `style.css:62-75`): same doodle-toast visual
language (border, radius, slight rotation, `mix-blend-mode: multiply`,
**`var(--ink)`/`var(--red)` only**, per §0.3's hard requirement), positioned
`top: 14px; left: 50%; transform: translateX(-50%) rotate(0.4deg);`.

**The "still stuck" nudge** — a returning-player-safety detail the task
implies ("skippable at any time" only works if the player can *find* skip):
if `this.tutorial.t > 25` for the current step, append a one-line reminder
to the banner: `" · stuck? P → skip tutorial"`. Reset `t = 0` on every step
advance (already true from §3.3's `updateTutorial`).

### 3.7 Test checks (`tools/test.mjs`)

Follow the file's existing `E()`/`check()` pattern (`tools/test.mjs:24-41`).
Add after the existing autopilot/warp block (after line 149):

```js
// tutorial: fresh save actually arms it, and every step is reachable
const tut1 = await E(`
  g.state.tutorialDone = false; g.tutorial = null;
  g.launch();
  return { armed: !!g.tutorial, mode: g.mode, step: g.tutorial && g.tutorial.step };
`);
check('a fresh save arms the tutorial in foot mode', tut1.armed && tut1.mode === 'foot' && tut1.step === 0, JSON.stringify(tut1));

const tut2 = await E(`
  // walk to and sit at the helm (reuses the same face-it pattern as the existing interactables check, tools/test.mjs:95-101)
  const it = g.interior.interact.find(i => i.id === 'helm');
  g.player.x = it.pos.x; g.player.z = it.pos.z + 0.6; g.player.yaw = 0;
  const preStep = g.tutorial.step;
  g.updateTutorial(0.1);
  g.interact();
  g.updateTutorial(0.1);
  return { preStep, afterWalk: g.tutorial ? g.tutorial.step : -1, mode: g.mode };
`);
check('walking to and sitting at the helm advances two tutorial steps', tut2.afterWalk >= tut2.preStep + 1 && tut2.mode === 'helm', JSON.stringify(tut2));

const tut3 = await E(`
  g.ship.throttle = 0; g.keys.add('KeyW');
  for (let i = 0; i < 30; i++) { g.updateHelmInput(1/60, {x:0,y:0}); g.updateShip(1/60); g.updateTutorial(1/60); }
  g.keys.delete('KeyW');
  return { throttle: g.ship.throttle, step: g.tutorial.step };
`);
check('holding throttle ramps past the tutorial 0.5 gate', tut3.throttle >= 0.5, JSON.stringify(tut3));

const tut4 = await E(`
  const s = g.u.systemsOf(g.u.mw).find(x => x.id === 'tutorial-annex');
  return { found: !!s, sellsIon: !!(s && s.station.fuelTypes.includes('ION')) };
`);
check('SBG Annex Pumps exists and does not sell ION', tut4.found && !tut4.sellsIon, JSON.stringify(tut4));

const tut5 = await E(`
  const b = { station: g.u.systemsOf(g.u.mw).find(x => x.id === 'tutorial-annex').station };
  const msg = g.refuel(b);
  return { msg, refused: g.tutorial ? g.tutorial.wrongPumpRefused : null };
`);
check('the Annex refuses a scout\\'s ION with the story\\'s own denial text', /does not serve/.test(tut5.msg), tut5.msg);

const tut6 = await E(`
  const msg = g.refuel({ station: g.u.sol.station });
  return { msg, refueled: g.tutorial ? g.tutorial.refueled : null };
`);
check('Sol Pumps accepts ION', /Pumped/.test(tut6.msg), tut6.msg);

const tut7 = await E(`g.skipTutorial ? g.skipTutorial() : (g.tutorial = null, g.state.tutorialDone = true); return { done: g.state.tutorialDone, cleared: g.tutorial === null };`);
check('skip clears the tutorial without touching the rest of state', tut7.done && tut7.cleared, JSON.stringify(tut7));

const tut8 = await E(`
  g.state.hull = g.stat ? g.ship.hull : null; // sanity: skip did not touch ship stats
  return { hull: g.ship.hull, credits: g.state.credits, fuel: g.ship.fuel };
`);
check('skipping the tutorial leaves ship state untouched (never blocks/damages a player)', tut8.hull > 0, JSON.stringify(tut8));
```

Baseline is 40/41 today (`docs/HANDOFF.md`); target after this section lands
is **48/49** (40 existing + 8 above, minus the one pre-existing Mars
failure — which §1's fix should also close, making it **49/49**, but that is
a bonus, not a requirement of this spec).

---

## PART B — controller support

## 4. Gamepad API integration

New file `js/gamepad.js`. Imported by `game.js` and `ui.js`. No dependency
on part 1.

### 4.1 Polling — why polling, not just events

`gamepadconnected`/`gamepaddisconnected` exist and are used for hot-plug
(§4.7), but per-frame *state* (stick position, trigger pressure, which
buttons are down right now) has no event equivalent — the spec requires
polling `navigator.getGamepads()` once per animation frame, which the file
already has one of (`loop()`, `game.js:667-684`). Add one call at the top of
`update(dt)` (`game.js:686`): `if (this.pad) this.pad.poll(dt);` — `this.pad
= new GamepadPoller(this)` constructed once in `boot()` (`game.js:113`,
alongside `this.bindInput()`).

**Critical implementation constraint for testability (§4.11)**: `poll()`
must call `navigator.getGamepads()` **fresh, every call** — never cache the
function reference or its return array. A test's `navigator.getGamepads =
() => [...]` monkey-patch, assigned after boot, must be picked up on the
very next poll.

### 4.2 Standard mapping — button and axis indices

Per the W3C Gamepad spec's `"standard"` mapping (`Gamepad.mapping ===
'standard'`), verified against MDN and the spec text this session:

| Index | `buttons[]` | Xbox | PS5 DualSense | Notes |
|---|---|---|---|---|
| 0 | bottom face | A | Cross (✕) | primary confirm |
| 1 | right face | B | Circle (◯) | cancel/back |
| 2 | left face | X | Square (□) | |
| 3 | top face | Y | Triangle (△) | |
| 4 | top-left shoulder | LB | L1 | digital |
| 5 | top-right shoulder | RB | R1 | digital |
| 6 | bottom-left shoulder | LT | L2 | **analog**, `.value` 0-1 |
| 7 | bottom-right shoulder | RT | R2 | **analog**, `.value` 0-1 |
| 8 | select/back | View | Share/Create | |
| 9 | start/menu | Menu | Options | |
| 10 | left stick click | LS/L3 | L3 | |
| 11 | right stick click | RS/R3 | R3 | |
| 12-15 | D-pad up/down/left/right | — | — | digital |
| 16 | home/guide | Xbox button | PS button | **often intercepted by the OS/browser chrome — do not bind anything critical here**, §4.5 avoids it entirely |

| Index | `axes[]` | Meaning |
|---|---|---|
| 0 | left stick X | -1 (left) .. 1 (right) |
| 1 | left stick Y | -1 (up) .. 1 (down) |
| 2 | right stick X | -1 .. 1 |
| 3 | right stick Y | -1 .. 1 |

A gamepad whose `mapping` is `""` (empty string, not `"standard"`) is
**unmapped** — the browser has no button-layout knowledge for it. Handle
this explicitly (don't silently misbind): on connect, if `mapping !==
'standard'`, show one toast — `` `${pad.id} isn't a recognised layout —
buttons may not match. Standard USB/Bluetooth Xbox and PlayStation pads
work best.` `` — and still poll it (raw indices), rather than refusing it
outright.

### 4.3 Detecting PS5 vs Xbox from `gamepad.id`, and the glyph set

`gamepad.id` strings are **not standardized** across browsers — the same
DualSense reports differently on Chrome vs Firefox. The one thing that *is*
consistent is the USB-IF vendor ID substring the browser includes in the
string (Chrome/Edge always include it; Firefox usually does): Sony = `054c`,
Microsoft = `045e`.

```js
// js/gamepad.js
export function padFamily(id) {
  const s = (id || '').toLowerCase();
  if (s.includes('054c') || /dualsense|dualshock/.test(s)) return 'ps';
  if (s.includes('045e') || s.includes('xbox')) return 'xbox';
  return 'generic'; // unrecognised: fall back to the Xbox-style glyph set (letters), the more common convention
}
```

**Glyphs are drawn, not photographed** — inline SVG paths in the game's own
hand-drawn doodle ink style (thin variable-width stroke, matching
`references/games.md`'s teardown of the source game's look, and matching
this game's own `<kbd>` chip styling, `style.css:17`), never a skeuomorphic
render of a real controller button (no trademark/license concern either
way, since these are generic geometric button shapes — a circle, a cross of
two lines, a square outline, a triangle outline — not a copy of Sony's or
Microsoft's actual iconography or wordmark):

```js
// js/gamepad.js — one small function per glyph, returned as an SVG string,
// coloured via currentColor so it inherits var(--ink)/var(--red) for free
// exactly like the existing <kbd> and .crosshair elements (style.css:17,62).
const GLYPH = {
  ps:    { A: crossGlyph, B: circleGlyph, X: squareGlyph, Y: triangleGlyph, LB: pill('L1'), RB: pill('R1'), LT: wedge('L2'), RT: wedge('R2'), Select: pill('SHARE'), Start: pill('OPT') },
  xbox:  { A: letter('A'), B: letter('B'), X: letter('X'), Y: letter('Y'), LB: pill('LB'), RB: pill('RB'), LT: wedge('LT'), RT: wedge('RT'), Select: pill('VIEW'), Start: pill('MENU') },
  generic:{ /* same shape as xbox — the letters read fine on an unbranded pad too */ },
};
// shared shapes, e.g.:
const crossGlyph = () => `<svg viewBox="0 0 24 24"><path d="M7 7 L17 17 M17 7 L7 17" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>`;
const circleGlyph = () => `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2.2" fill="none"/></svg>`;
const squareGlyph = () => `<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="1.5" stroke="currentColor" stroke-width="2.2" fill="none"/></svg>`;
const triangleGlyph = () => `<svg viewBox="0 0 24 24"><path d="M12 5 L20 19 L4 19 Z" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" fill="none"/></svg>`;
const letter = (t) => () => `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" fill="none"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-family="'Patrick Hand',cursive" fill="currentColor">${t}</text></svg>`;
const pill = (t) => () => `<svg viewBox="0 0 44 20"><rect x="1" y="1" width="42" height="18" rx="6" stroke="currentColor" stroke-width="1.8" fill="none"/><text x="22" y="14" text-anchor="middle" font-size="10" font-family="'Patrick Hand',cursive" fill="currentColor">${t}</text></svg>`;
const wedge = (t) => () => `<svg viewBox="0 0 44 22"><path d="M2 20 L10 3 L34 3 L42 20 Z" stroke="currentColor" stroke-width="1.8" fill="none"/><text x="22" y="16" text-anchor="middle" font-size="10" font-family="'Patrick Hand',cursive" fill="currentColor">${t}</text></svg>`;
```

No `<kbd>` styling changes needed — a glyph renders inside the existing
`<kbd>` element (`style.css:17`) as its `innerHTML` instead of text, so the
border/background/radius are already correct for free.

### 4.4 Deadzone and response curve

Radial deadzone on each stick (not per-axis — a per-axis deadzone produces a
square-ish dead region and cuts diagonal precision), plus a response curve
for finer low-speed control, both pure functions (unit-testable with no
`Gamepad` object at all, §4.11):

```js
// js/gamepad.js
export function radialDeadzone(x, y, dz = 0.14) {
  const mag = Math.hypot(x, y);
  if (mag < dz) return { x: 0, y: 0, mag: 0 };
  const scaled = Math.min(1, (mag - dz) / (1 - dz));
  const nx = x / mag, ny = y / mag;
  return { x: nx * scaled, y: ny * scaled, mag: scaled };
}
export function curve(v, exp = 1.6) { return Math.sign(v) * Math.pow(Math.abs(v), exp); }
export function triggerCurve(v, dz = 0.05, exp = 1.15) {
  if (v < dz) return 0;
  return Math.pow((v - dz) / (1 - dz), exp);
}
```

Applied per stick (right stick for helm/EVA/drone look, left stick for foot
move and helm roll): `const { x, y, mag } = radialDeadzone(raw.x, raw.y);
const cx = curve(x), cy = curve(y);` — steering (§4.5) feeds `cx, cy`
straight into the same `m.x`/`m.y` slots `updateHelmInput`'s mouse path
already uses (`game.js:763-793`), so the deadzone/curve math is the *only*
new per-frame cost; every downstream consumer (ship rotation, foot movement)
is unchanged. Throttle uses `triggerCurve` with a near-linear exponent
(1.15, not 1.6) — predictable, proportional ramp matters more than fine
low-end control for a "how fast am I going" input. Fire's trigger uses a
flat threshold, `triggerCurve(v) > 0.35`, treated as a boolean exactly like
`keys.has('Space')` today.

### 4.5 Full bindings, every mode

Extends the table in §2. `RT`/`LT` are read as `buttons[7].value` /
`buttons[6].value` (analog, §4.2), not as digital presses, in helm/EVA/drone;
everywhere else they're read as `buttons[i].pressed` (digital) if bound at
all — no mode uses them digitally today, so this distinction is
moot in practice but stated for correctness.

**Foot** (`GamepadPoller.pollFoot()`, feeds the exact same variables
`updateFoot` already reads — `this.keys`, `this.mouse` — so `updateFoot`
itself needs **zero changes**; the poller synthesizes the same inputs a
keyboard/mouse would):
- Left stick → `radialDeadzone` → synthesize `keys.add/delete('KeyW'/'KeyS'/
  'KeyA'/'KeyD')` from sign of `cx`/`cy` (foot movement is already
  digital-normalized in `updateFoot`, `game.js:723-730`, so mapping the
  analog stick to the same four synthetic keys is correct and requires no
  new movement code).
- Right stick → `readMouse()`-equivalent: `this.mouse.dx += cx * padLookSpeed
  * dt; this.mouse.dy += cy * padLookSpeed * dt;` (same accumulator
  `updateFoot`/`updateHelmInput` already drain each frame, `game.js:710-715`).
- `X`/Square → `interact` (E)
- `A`/Cross → `jump` (Space)
- `Y`/Triangle → `storage` (I)
- `B`/Circle → close top overlay if one is open (Esc-equivalent, `ui.js:331`'s
  existing `Escape` handling reused, not duplicated)
- `RB`/R1 → `media` (V)
- `D-pad Up` → `photo` (K)
- `D-pad Down` → `droneToggle` (G), only if `settings.drone`
- `R3` (right stick click) → `run` (replaces holding Shift — held-toggle,
  matches `sprintLatch`'s existing boolean shape, `game.js:721`)
- `Start` → `pause` (P), `Select` → `map` (M)

**Helm** — full table already given in §2's `ACTIONS`; the two analog
inputs:
- `RT` (`buttons[7].value`, `triggerCurve` exp 1.15) → **absolute** throttle
  target: `sh.throttle = damp(sh.throttle, triggerCurve(rt), 8, dt);` — this
  deliberately replaces the keyboard's tap-a-quarter/hold-to-ramp scheme
  (§3.3 step 4's copy) with true proportional control once a gamepad is the
  last input used (§4.8) — a trigger's whole point is analog throttle, and
  forcing it through the digital tap/hold state machine would waste the
  hardware. `docs/TODO.md`'s open request "Gamepad and HOTAS support" reads
  as wanting exactly this.
- `LT` (`buttons[6].value`, flat 0.35 threshold) → `fire` while held, calling
  `this.fire(dt)` every frame past threshold exactly like
  `updateHelmInput`'s existing `keys.has('Space')` branch (`game.js:793`).
- Left stick X (`radialDeadzone` + `curve`) → `roll`, fed into the same
  `roll` accumulator `updateHelmInput` already builds from `A`/`D`
  (`game.js:782-784`).
- Right stick (`radialDeadzone` + `curve`) → steering, fed into the same
  `m.x`/`m.y` the mouse path uses (`game.js:781`, `ay`/`ap` computation) —
  the ship's turn-rate cap (`cap = turn*dt*3`, `game.js:780`) already
  clamps the result, so an aggressively-curved stick can't out-turn the
  keyboard/mouse path.

**EVA**: left stick → lateral thrust (same four synthetic `WASD` keys as
foot), right stick → look, `RT` (threshold, not curve — EVA thrust is
on/off in the existing code, `game.js:1527`) → `thrustUp` (Space), `LT` →
`thrustDown` (Ctrl), `A`/Cross → `interact` (climb back in at the hole).

**Drone**: left stick → lateral (WASD), right stick → look, `RT` →
`thrustUp` (Space), `LT` → `thrustDown` (Ctrl), `RB` → `bomb` (B/left-click),
`B`/Circle → `recall` (G), `LB` (hold) → boost (matches the file's existing
`Shift` boost check, `game.js:1373`).

**Menus/map/shop** (`pause`, `map`, `station`, `storage`, `settings`,
`help`, `dead`): a small generic focus-navigation layer, since these are
plain DOM overlays (`OVERLAYS` array, `ui.js:13`) with no existing
keyboard-nav at all today (mouse/click only) — this is new surface, kept
deliberately small:
```js
// js/gamepad.js
export function focusables(overlayEl) {
  return [...overlayEl.querySelectorAll('button:not([hidden]), input:not([hidden]), li[data-i]')];
}
```
D-pad or left stick (digital-thresholded, `|axis| > 0.5`) moves a `.padfocus`
CSS class (new, simple `outline: 2.5px dashed var(--red)` rule reusing the
existing `:focus-visible` look, `style.css:16`) between `focusables()` in
document order, wrapping; `A`/Cross calls `.click()` on the focused element
(works identically for a `<button>` and an `<li data-i>` row, since
`ui.js:95` already wires `li` clicks); `B`/Circle clicks the overlay's own
`[data-close]` button if present, else (pause) triggers `resume`; a range
`<input>` under focus is adjusted by D-pad left/right in `step` increments
instead of clicked. `LB`/`RB` cycle the map's filter chips (`m-chips`
buttons, `ui.js:90`) when the map is open, matching a tab-switcher
convention. This layer is generic across every overlay — no per-overlay
gamepad code anywhere else.

**Tutorial prompts**: no separate bindings — §3.6's `#h-tut-key` reads
whatever action the current step names (e.g. step 1 reads `interact`'s
glyph) through the exact same `promptFor()` used everywhere else (§4.8).

### 4.6 Files/functions touched (Part B)

| File | Change |
|---|---|
| `js/gamepad.js` (new) | `ACTIONS` (§2), `padFamily()`, `GLYPH` set, `radialDeadzone()`, `curve()`, `triggerCurve()`, `class GamepadPoller` (`poll(dt)`, `pollFoot/Helm/Eva/Drone`, `pollMenu`), `focusables()`, `promptFor()` (§4.8), `rumble()` (§4.9) |
| `js/game.js` | `this.pad = new GamepadPoller(this)` in `boot()`; `if (this.pad) this.pad.poll(dt);` at top of `update()`; `this.lastInputDevice` field + setters in `onKey`/mouse handlers (§4.8); `this.padLookHeld` (read by tutorial step 3, §3.3) |
| `js/ui.js` | `keysFor()` (`ui.js:236-243`) calls `promptFor()` per action instead of hardcoding `<kbd>` text, so it automatically renders gamepad glyphs when `lastInputDevice==='gamepad'`; `#h-prompt` (`ui.js:225-233`) same; new `.padfocus` navigation wiring in `open()`/a new `frame(dt)` hook |
| `index.html` | `addEventListener('gamepadconnected'/'gamepaddisconnected', ...)` wiring (loaded in `js/main.js` or `gamepad.js`'s own module-level side effect); `.padfocus` target class already covered by existing elements, no new DOM needed beyond §3.6's tutorial banner |
| `style.css` | `.padfocus` outline rule (reuses `var(--red)`); no other new rules — glyphs render inside the existing `<kbd>` box |

### 4.7 Hot-plugging

```js
// js/gamepad.js
window.addEventListener('gamepadconnected', (e) => {
  poller.attach(e.gamepad);
  ui.toast(`${padFamily(e.gamepad.id) === 'ps' ? 'DualSense' : padFamily(e.gamepad.id) === 'xbox' ? 'Xbox controller' : e.gamepad.id} connected.`);
});
window.addEventListener('gamepaddisconnected', (e) => {
  poller.detach(e.gamepad.index);
  ui.toast('Controller disconnected. Keyboard and mouse still work.');
});
```

Known Chrome quirk (documented in MDN's Gamepad API guide): on some
Chrome/Edge versions, `gamepadconnected` does not fire until the pad sends
its **first button press or stick move** — a pad that was already plugged in
before the page loaded may not be "seen" until the player touches it. The
poller does not depend on the event to *discover* a pad (it also scans
`navigator.getGamepads()` for any non-null slot every poll and calls
`attach()` the first time it sees a new `index`), so this Chrome quirk
degrades to "the first input on an already-connected pad both connects it
and registers", never to a pad that's silently never recognised.

### 4.8 Last-input-used prompt switching

```js
// js/game.js
this.lastInputDevice = 'keyboard'; // 'keyboard' | 'gamepad'
// in bindInput()'s existing keydown/mousedown listeners, and in GamepadPoller.poll() whenever
// any button crosses .pressed or any stick's radialDeadzone().mag > 0:
this.lastInputDevice = source;
```
```js
// js/gamepad.js
export function promptFor(game, actionName, mode) {
  const a = ACTIONS[actionName];
  if (game.lastInputDevice !== 'gamepad' || !game.pad || !game.pad.active) {
    return `<kbd>${Array.isArray(a.key) ? a.key.join('</kbd>/<kbd>') : a.key.replace('Key','')}</kbd>`;
  }
  const btn = typeof a.pad === 'string' ? a.pad : a.pad[mode];
  if (!btn) return ''; // this action has no binding in the current mode
  return `<kbd>${GLYPH[game.pad.family][btn] ? GLYPH[game.pad.family][btn]() : btn}</kbd>`;
}
```
Every existing `keysFor()`/`#h-prompt` string in `ui.js` is rewritten to
call this instead of hardcoding `<kbd>W</kbd>` etc. — one function, every
caller benefits, including the tutorial (§2's whole point).

### 4.9 Rumble

Feature-detected per pad, per poll (an actuator reference can go stale
across a reconnect, so it's read fresh, not cached at attach time):

```js
// js/gamepad.js
export function rumble(pad, { duration = 120, weak = 0.3, strong = 0.5 } = {}) {
  const v = pad && pad.vibrationActuator;
  if (!v || typeof v.playEffect !== 'function') return false; // Firefox today, or an unsupported pad — silent no-op, never an error
  v.playEffect('dual-rumble', { startDelay: 0, duration, weakMagnitude: weak, strongMagnitude: strong }).catch(() => {});
  return true;
}
```

Wired at three call sites, each a single added line, each rate-limited
(`this.lastRumble` timestamp, ≥80 ms between calls — calling `playEffect`
faster than that on some Chrome builds queues effects rather than
interrupting them, producing a laggy buzz instead of a crisp one):
`damage(n, why)` (`game.js:1079-1090`, proportional to `n`, capped),
`fire()` (`game.js:1030-1048`, tiny fixed pulse), and the autopilot
"ARRIVED" banner (`game.js:816-818`, a distinct softer double-pulse). Gate
all three behind one new setting, `settings.rumble` (default `true`,
`defaultSettings()`, `game.js:49-54`), with a checkbox in the settings panel
(`index.html:180-201`, same `bind()` pattern as every other checkbox there,
`ui.js:56-84`).

### 4.10 Browser support — exact versions, cited

| Feature | Chrome / Edge (Chromium) | Firefox | Safari |
|---|---|---|---|
| Core Gamepad API (`Gamepad`, `getGamepads()`, `gamepadconnected`/`disconnected`, `"standard"` mapping) | Chrome 21+; Edge 79+ (Edge went Chromium at v79 — the legacy EdgeHTML build had it from v12, not relevant to a 2026 target) | Firefox 29+ | Safari 10.1+ macOS, 10.3+ iOS/iPadOS (Bluetooth/Lightning controllers only) |
| `GamepadHapticActuator.playEffect('dual-rumble')` / `Gamepad.vibrationActuator` | Chrome 89+, Edge 89+ | **Not implemented** — tracked in an open Mozilla bug (Bugzilla #680289, "Rumble Effect support for Gamepad API"); `vibrationActuator` is `undefined` on Firefox as of this research (2026-09-24) | Not implemented |
| `hapticActuators[]` (older, pre-`vibrationActuator` array) | present but superseded — prefer `vibrationActuator` per §4.9 | present but empty array in practice | present but empty array in practice |
| Secure-context requirement | Yes, HTTPS or `localhost`/`127.0.0.1` (both the Vercel deploy and the local dev server already satisfy this — no action needed) | Not enforced the same way | N/A |

Sources: [MDN: Gamepad API overview and browsers' `gamepadconnected` timing
quirk](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API),
[caniuse.com/gamepad](https://caniuse.com/gamepad),
[caniuse.com — Gamepad `vibrationActuator`](https://caniuse.com/mdn-api_gamepad_vibrationactuator),
[caniuse.com — Gamepad `hapticActuators`](https://caniuse.com/mdn-api_gamepad_hapticactuators),
[MDN: `GamepadHapticActuator`](https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator),
[Mozilla Bugzilla #680289 — gamepad-rumble tracking bug (open, confirms no Firefox implementation)](https://bugzilla.mozilla.org/show_bug.cgi?id=680289).

**Practical read for this game**: build and ship rumble as an enhancement
that is silently absent on Firefox (§4.9's feature-detect already handles
this correctly) — everything else in this spec (steering, buttons, triggers,
menu navigation, glyphs) works identically on all three engines back to
versions far older than anyone will realistically have, so there is no
browser-gating logic needed anywhere except the one `vibrationActuator`
check.

### 4.11 What cannot be tested without a physical controller, and the headless synthetic-gamepad method for what can

**Cannot be verified without real hardware** (say so plainly, per the
project's "never pass an approximation off as real" rule, rather than
claiming a headless run proves them):
- The *exact* `gamepad.id` string a real DualSense or Xbox controller
  reports — this varies by OS, USB vs Bluetooth, and browser version. §4.3's
  vendor-ID-substring matching is the documented, standard approach, but it
  must still be confirmed against at least one real Xbox pad and one real
  DualSense before shipping: connect each, open the console, run
  `navigator.getGamepads()[0].id`, and record the exact strings in a
  one-line code comment above `padFamily()` for future reference.
- Analog stick "feel" — whether the chosen deadzone (0.14) and curve
  exponent (1.6) feel good in the hand. The math can be unit-tested (below);
  comfort cannot.
- Real rumble hardware behaviour/timing/strength — `playEffect` can be
  stubbed and asserted-called (below), but whether it actually buzzes, and
  how strong, needs a real pad.
- Bluetooth-specific quirks (some BT stacks drop the rumble HID descriptor
  entirely, per this session's research — a real device is the only way to
  see this).

**Can be tested headless**, by overriding `navigator.getGamepads` in the
page before the poller's first tick — the same `b.eval()`/`E()` pattern
`tools/test.mjs` already uses throughout:

```js
// tools/test.mjs — add a new section
const mockPad = (over = {}) => ({
  id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
  index: 0, connected: true, mapping: 'standard', timestamp: performance.now(),
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  hapticActuators: [], vibrationActuator: { playEffect: async () => 'complete', reset: async () => {} },
  ...over,
});
const gp = await E(`
  // install BEFORE any poll runs — GamepadPoller.poll() must call
  // navigator.getGamepads() fresh every time (§4.1) for this to take effect
  window.__mockGamepads = [${JSON.stringify(mockPad())}];
  navigator.getGamepads = () => window.__mockGamepads;
  window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: window.__mockGamepads[0] }));
  g.setMode('helm');
  await new Promise(r => setTimeout(r, 100));
  return { attached: !!(g.pad && g.pad.active), family: g.pad && g.pad.family };
`);
check('a synthetic Xbox pad is detected and family-classified', gp.attached && gp.family === 'xbox', JSON.stringify(gp));

const gpThrottle = await E(`
  window.__mockGamepads[0].buttons[7] = { pressed: true, touched: true, value: 0.8 }; // RT
  for (let i = 0; i < 30; i++) g.update(1/60);
  return { throttle: g.ship.throttle };
`);
check('a synthetic right-trigger press raises throttle proportionally', gpThrottle.throttle > 0.4 && gpThrottle.throttle < 0.95, JSON.stringify(gpThrottle));

const gpFire = await E(`
  const before = g.tutorial ? g.tutorial.shotsFired : g.shots.length;
  window.__mockGamepads[0].buttons[6] = { pressed: true, touched: true, value: 0.9 }; // LT
  for (let i = 0; i < 10; i++) g.update(1/60);
  return { before, shots: g.shots.length };
`);
check('a synthetic left-trigger press fires', gpFire.shots > 0, JSON.stringify(gpFire));

const gpRumble = await E(`
  let called = null;
  window.__mockGamepads[0].vibrationActuator.playEffect = async (type, opts) => { called = { type, opts }; return 'complete'; };
  g.damage(20, 'test');
  await new Promise(r => setTimeout(r, 50));
  return called;
`);
check('taking damage calls playEffect with dual-rumble', gpRumble && gpRumble.type === 'dual-rumble', JSON.stringify(gpRumble));

const gpDisc = await E(`
  window.__mockGamepads = [];
  window.dispatchEvent(new Event('gamepaddisconnected'));
  return { active: g.pad && g.pad.active };
`);
check('disconnecting clears the active pad without touching ship/game state', !gpDisc.active, JSON.stringify(gpDisc));

// pure-math checks need no Gamepad object at all
const curveCheck = await E(`
  const { radialDeadzone, curve, triggerCurve } = await import('/js/gamepad.js');
  const dz = radialDeadzone(0.05, 0.05); // inside deadzone
  const full = radialDeadzone(1, 0);     // full deflection
  return { dzMag: dz.mag, fullMag: full.mag, curveHalf: curve(0.5), trigAtZero: triggerCurve(0), trigAtOne: triggerCurve(1) };
`);
check('deadzone/curve math behaves at the boundaries', curveCheck.dzMag === 0 && curveCheck.fullMag === 1 && curveCheck.trigAtZero === 0 && curveCheck.trigAtOne > 0.9, JSON.stringify(curveCheck));
```

Add these after §3.7's tutorial checks. Combined target: **59/60** (49 from
§3.7's total + 7 above + the 3 pre-existing map/warp checks already counted
— see §3.7's running total; the one still-open item is real-hardware glyph
verification, §4.11, which is explicitly out of headless reach and should
be tracked as a manual QA checklist item, not a failing automated check).

---

## 5. Performance (Chromebook target, per `docs/TODO.md`'s existing budget)

- Gamepad polling: one `navigator.getGamepads()` call and a handful of
  scalar reads/writes per frame — no allocation (`radialDeadzone`/`curve`
  return small object literals; if profiling on a real Chromebook shows this
  matters, switch to writing into two pre-allocated module-level scratch
  numbers the way `game.js` already does for `V1-V3`/`Q1-Q2`, but do not
  pre-optimize this without a measurement, since it's ~6 float ops per
  frame).
- Menu focus navigation (§4.5): `focusables()` re-queries the DOM only when
  an overlay opens or its content changes (map list re-render, station
  re-render) — not every frame.
- SVG glyphs (§4.3): built once per action per family (a handful of total
  combinations) and cached as strings, not rebuilt per frame — `promptFor()`
  is only called from `hud()`'s existing 100 ms-throttled tick
  (`ui.js:161-162`, `if (this.acc < 0.1) return;`), matching the cadence
  every other HUD string already updates at.
- Rumble: rate-limited to ≥80 ms between `playEffect` calls (§4.9) — bounds
  worst-case call frequency regardless of fire rate.
- Tutorial: `updateTutorial(dt)` is one property check when inactive
  (`if (this.tutorial)`) and a handful of comparisons per step when active,
  for the ~2-3 minutes a new player spends in it once ever.

None of this adds a draw call, a new geometry, or a new shader — everything
in this spec is either DOM/CSS (Part A's banner, Part B's `<kbd>` glyphs and
`.padfocus` outline) or per-frame scalar math, so it sits outside the
"~250 draw calls" budget entirely.

---

## 6. Summary of files touched

| File | Part A | Part B |
|---|---|---|
| `js/game.js` | `freshSave`, `upgradeSave`, `launch`, `startTutorial`, `updateTutorial`, `spawnScout`, `spawnTutorialWing`, one guard line each in `updateCombat`'s imp branch, `refuel`, `tryDock`; §1's autopilot roll-stabilize fix | `boot`, `update`, `lastInputDevice`, `padLookHeld` |
| `js/ui.js` | `renderPause` (2 buttons), `wire()` (2 handlers), `frame()` (`renderTutorial`) | `keysFor`, `#h-prompt` rendering, new overlay focus-nav hook |
| `js/universe.js` | new `tutorial-annex` system (§3.4) | — |
| `index.html` | `#h-tut` banner, 2 pause buttons | rumble settings checkbox |
| `style.css` | `.tut` banner rule (uses `var(--ink)`/`var(--red)` only) | `.padfocus` outline rule |
| `js/gamepad.js` (new) | — | everything in §4 |
| `tools/test.mjs` | §3.7 (8 checks) | §4.11 (7 checks) |

150-word summary follows in the tool response, per the harness's request.
