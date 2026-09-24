# Enemy squadron organization — design spec

Status: design only, not implemented. Written 2026-09-24 for Gev's report:
"The enemies are scattered; please organize them so they follow a clear plan."
Target implementer: someone who has not read the sources below — everything
needed is in this document, with exact numbers, line references into the
current code, and headless test checks.

Scope: `js/game.js` (spawn + AI), `js/ui.js` (HUD call-outs), optionally
`js/universe.js` (zone composition), `tools/test.mjs` (new checks). No change
to `js/actors.js` geometry, `js/render.js` (doodle post pass), or the
2026-09-23 combat numbers (HP, damage, fire rate, ranges) — this is a spatial
and behavioral reorganization, not a rebalance. Read `docs/PLAN.md` and
`docs/HANDOFF.md` first, as the harness instructed.

---

## 1. The problem, in the current code

Today, `Game.enterZone()` (`js/game.js:969-990`) spawns every enemy in the
zone at once, at the moment the player crosses the zone radius:

```js
const caps = z.tier >= 3 ? ['dreadnought', 'carrier'] : ['dreadnought'];
if (z.tier >= 4) caps.push('dreadnought');
const imps = [3, 5, 6, 8][clamp(z.tier - 1, 0, 3)];
caps.forEach((k, i) => this.spawnCapital(k, { ... }));
for (let i = 0; i < imps; i++) {
  const a = (i / imps) * TAU;
  this.spawnImp({ x: base.x + Math.cos(a) * 900 - dir.x * 2600, ... });
}
```

Imps are placed on a ring around a point, with no leader, no shared identity,
and no plan. Each imp then runs its own independent orbit in
`updateCombat()` (`js/game.js:1140-1157`):

```js
e.phase += dt * 0.8;
const orbit = V2.set(Math.cos(e.phase), Math.sin(e.phase * 0.7) * 0.5, Math.sin(e.phase)).multiplyScalar(620);
const goal = V3.set(tp.x + orbit.x - e.pos.x, ...);
```

`e.phase` is seeded from `Math.random()` in `spawnImp()` (`js/game.js:1015-1021`,
`phase: Math.random() * TAU`), so five imps immediately scatter to five
unrelated points on a sphere around the player and buzz independently for the
whole fight — this is the "scattered" look Gev is reporting. Capital ships
(`js/game.js:1158-1184`) already behave like a single unit (hold ~2400 u,
turn to face, fire turrets and a telegraphed beam), so the fix is to give
imps the same kind of legible, single-unit behavior, in groups, and to give
capitals an escort instead of loose orbiting decoration.

Nothing here is broken — `node tools/test.mjs` passes the zone checks
(lines 151-177) because they only assert on totals (`zs.n`, `zs.caps`), not
on arrangement. That is why this is additive: the new spec keeps every
existing number and every existing check passing, and adds new checks for
the new structure.

---

## 2. Research (real sources, read 2026-09-24)

**Boids / formation steering — the movement math.** Craig Reynolds' original
model: three steering behaviors (separation, alignment, cohesion) combine
into flocking; "arrival" is seek-with-braking toward a point, used for
closing on a target without overshoot.
[Boids (Flocks, Herds, and Schools)](https://www.red3d.com/cwr/boids/),
[Steering Behaviors For Autonomous Characters, GDC 1999](https://www.red3d.com/cwr/steer/gdc99/).
For formation flight specifically, Reynolds' GDC talk describes leader
following as arrival toward a point offset behind the leader, and formation
flight as picking N points on a shape and assigning one boid per point via
arrival — exactly the slot-per-member model this spec uses. A clear modern
restatement of arrival/seek/separation with the actual formulas:
[Introduction to Steering Behaviours, Game Developer](https://www.gamedeveloper.com/design/introduction-to-steering-behaviours).

**Readable enemy groups — shmup design.** Galaga's enemies fly a scripted
entry path into a fixed grid formation before attacking individually in
scripted dive patterns, so the player reads "this is the formation, that is
the one peeling off" at a glance:
[Galaga, Shoot 'Em Up Wiki](https://shmup.fandom.com/wiki/Galaga). Galaga
Legions (2011) added on-screen neon indicator lines pointing at off-screen
enemies specifically so players could keep track of where a scattered swarm
was relative to formation — the same "where is my wing" problem this spec's
HUD call-outs solve:
[Galaga Legions, Wikipedia](https://en.wikipedia.org/wiki/Galaga_Legions).
Ikaruga's whole stage and enemy design is built around a single legible rule
(polarity) applied consistently, which is the general design lesson this
spec borrows: one rule (formation slot + squad state) applied to every
enemy, rather than bespoke per-enemy scripting:
[Ikaruga, Wikipedia](https://en.wikipedia.org/wiki/Ikaruga).

**Named formation shapes — real aviation/military vocabulary**, used below
for the formation table so the HUD can name what the player sees. Vic (V)
formation, echelon, line abreast, diamond and box are all defined,
real-world shapes:
[Vic formation, Wikipedia](https://en.wikipedia.org/wiki/Vic_formation),
[Echelon formation, Wikipedia](https://en.wikipedia.org/wiki/Echelon_formation).
"Screen" (a ring of escorts around a high-value unit, sized for all-round
coverage) is standard naval/convoy-escort vocabulary, applied here to the
capital ships' imp escort.

**Squadron play in space games.** Elite Dangerous' Wings feature (added in
update 1.2) groups ships so they share target/status info and get
color-coded on the scanner and comms — i.e. the game surfaces "who is with
whom" to the player, which is what this spec's per-squadron HUD identity
(same call-out, same marker tint) is for:
[Elite: Dangerous 1.2 preview: flying together with Wings, PC Gamer](https://www.pcgamer.com/elite-dangerous-12-preview-flying-together-with-wings/).

**Squad state machines.** Bungie's Halo 2/3 AI assigns squads to shared
"tactics" (e.g. a flank executed by two members together) via a
priority-driven squad tree, and syncs squad members so they commit to and
break from a shared task together rather than each deciding independently —
the same shape as the PATROL → FORMUP → ATTACK → BREAK → REGROUP → RETREAT
machine below, where the whole squad's `state` field changes atomically:
[GDC 2005: Handling Complexity in the Halo 2 AI, Game Developer](https://www.gamedeveloper.com/programming/gdc-2005-proceeding-handling-complexity-in-the-i-halo-2-i-ai),
[Combat Evolved: The Encounter Design of Halo 3, Game Developer](https://www.gamedeveloper.com/design/combat-evolved-the-encounter-design-of-halo-3).

These sources justify every structural choice below: slot-per-member arrival
steering (Reynolds), a small vocabulary of named real formations (Vic/echelon
army doctrine), a screen around the high-value unit (naval escort doctrine),
one shared squad state driving synchronized behavior (Halo), and telling the
player what is incoming instead of letting them work it out from a scatter
(Galaga Legions, Elite Wings).

---

## 3. Data structures

### 3.1 Formation slot tables

A formation is a list of `{x, y, z}` offsets in **the leader's local frame**
(x = right, y = up, z = forward is negative, matching the game's `-Z` forward
convention used everywhere else — see `js/util.js` and `SHIPS` in
`docs/PLAN.md`). Offset `[0,0,0]` is always the leader's own slot (index 0).
Distances are in metres. Imps are ~5 m tall (`docs/PLAN.md` actors contract)
with a collision radius around 3-4 m (`buildImp().radius`, computed by
`reach()` in `js/actors.js:163-174`), so 55-70 m spacing reads as a loose,
game-scaled "wing" without models overlapping, and stays well inside the
620 u orbit radius the individual-imp attack behavior already uses
(`js/game.js:1142`), so a squad that breaks to attack doesn't have to travel
far to get into its old orbit range.

Add this table as a new top-level const in `js/game.js`, near `FWD`/`V1`
(around line 40):

```js
// Formation slots: [x, y, z] offsets from the leader, in the leader's local
// frame (x right, y up, z forward is negative). Index 0 is always the
// leader's own slot. Spacing constant SP = 60 (metres); scale per formation
// where the real-world shape calls for it.
const SP = 60;
const FORMATIONS = {
  // Vic / V: leader at the point, wings trail back and out both sides.
  // Reynolds' "N points on a shape, one boid per point" model (see spec §2).
  v: (n) => {
    const s = [[0, 0, 0]];
    for (let i = 1; i < n; i++) {
      const side = i % 2 ? -1 : 1, rank = Math.ceil(i / 2);
      s.push([side * rank * SP * 0.85, 0, rank * SP]);
    }
    return s;
  },
  // Echelon: every member steps back and to one side of the one ahead of it.
  echelon: (n, dir = 1) => {
    const s = [];
    for (let i = 0; i < n; i++) s.push([dir * i * SP * 0.75, 0, i * SP * 0.6]);
    return s;
  },
  // Line abreast: side by side, leader in the middle.
  lineAbreast: (n) => {
    const s = [];
    for (let i = 0; i < n; i++) s.push([(i - (n - 1) / 2) * SP, 0, 0]);
    return s;
  },
  // Diamond: leader at the front point, two wings, one closing the rear.
  // Used for 4-member squads; larger squads repeat the pattern in a second
  // shell 1.6x farther back (diamond-of-diamonds), same rule as `screen`.
  diamond: (n) => {
    const ring = [[0, 0, 0], [-SP, 0, SP], [SP, 0, SP], [0, 0, SP * 1.8]];
    const s = ring.slice(0, Math.min(n, 4));
    for (let i = 4; i < n; i++) s.push([ring[i % 4][0] * 1.6, 0, ring[i % 4][2] * 1.6 + SP]);
    return s;
  },
  // Box: 2-wide ranks stacked back from the leader.
  box: (n) => {
    const s = [];
    for (let i = 0; i < n; i++) {
      const rank = Math.floor(i / 2), side = i % 2 ? 1 : -1;
      s.push([side * SP * 0.6, 0, rank * SP]);
    }
    return s;
  },
  // Screen: a ring at fixed radius around a capital ship (not a leader) —
  // naval escort doctrine, see spec §2. Evenly spaced, no leader slot at 0,0.
  screen: (n, radius) => {
    const s = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; s.push([Math.sin(a) * radius, 0, Math.cos(a) * radius]); }
    return s;
  },
};
```

`screen(n, radius)` is the only formation that is not leader-relative — its
slots are relative to the escorted capital ship's position and heading
instead (see §3.3).

### 3.2 The `squad` object

Every imp already has an entry in `this.enemies` (`kind: 'imp'`, spawned by
`spawnImp()`, `js/game.js:1015-1021`). Add a `squad` object, one per
squadron, stored on `this.squads` (new array, alongside `this.enemies` —
initialize in the constructor next to wherever `this.enemies = []` is set,
and clear it in `clearCombat()`, `js/game.js:1022-1028`):

```js
// this.squads: [{
//   id,                    // string, unique within the zone
//   kind: 'wing' | 'screen',
//   formation: 'v' | 'echelon' | 'lineAbreast' | 'diamond' | 'box' | 'screen',
//   members: [enemyRef],   // imp entries from this.enemies, index 0 is the leader for 'wing'
//   leader,                // enemyRef; for 'screen', the escorted capital's enemyRef
//   slots,                 // FORMATIONS[formation](members.length[, radius]) — computed once at spawn
//   state,                 // 'formup' | 'approach' | 'attack' | 'break' | 'regroup' | 'retreat'
//   stateT: 0,              // seconds in current state
//   patrol: { center, r, a: 0 },  // patrol-orbit params, used only in 'approach' before first contact
//   calledOut: false,       // HUD call-out already shown for this squad
// }]
```

Each imp entry (`this.enemies` element with `kind: 'imp'`) gets two new
fields set in `spawnImp()`:

```js
squad: null,   // the squad object above
slot: 0,       // this member's index into squad.slots
```

`spawnImp()`'s signature grows an options arg: `spawnImp(pos, opts = {})`
sets `e.squad = opts.squad; e.slot = opts.slot ?? 0;` — every existing call
site (there is currently one, plus the carrier reinforcement spawn at
`js/game.js:1181`) keeps working unchanged since `opts` defaults to `{}` and
unsquadroned imps (carrier reinforcements — see §6) simply keep `squad: null`
and fall back to the current individual-orbit behavior in `updateCombat()`,
so nothing regresses if a squad has been wiped but the carrier is still
dropping reinforcements.

### 3.3 Capital ship escort screens and turret arcs

`spawnCapital()` (`js/game.js:991-1012`) already builds `e.turrets` from
`c.turrets.map(...)`, each with `{ node, local, hp, cd, dead }`, where
`local` is the turret's world-space offset from the ship at spawn (computed
via `getWorldPosition`, i.e. already in the ship's local frame since the
group was at the origin when measured). Add an **arc** to each turret entry,
computed once at spawn time from that same `local` vector — no new geometry,
no touching `js/actors.js`:

```js
// Turret arc: the turret may only fire at targets within `halfAngle` of
// `dir`, both in the ship's local frame. `dir` is derived from the turret's
// own mounting position, which is already read out of the actors.js
// geometry (js/actors.js:550-553 dreadnought, :601-602 carrier) — a turret
// mounted toward the bow points roughly outward-and-forward, one mounted
// amidships points roughly straight out to its side, and so on. This reuses
// existing per-ship turret placement without hardcoding per-ship data.
function turretArc(local, shipRadius) {
  const dir = local.clone();
  dir.y *= 0.35; // turrets read mostly by their bow/stern/port/starboard position, not their deck height
  if (dir.lengthSq() < 1) dir.set(0, 0, -1);
  dir.normalize();
  return { dir, halfAngle: (65 * Math.PI) / 180 };
}
```

At spawn: `e.turrets = c.turrets.map((t) => ({ node: t, local: local(t), hp: 40, cd: 2 + Math.random() * 3, dead: false, arc: turretArc(local(t)) }));`
(same line as today, `js/game.js:1000`, arc field added).

**Firing gate** — in `updateCombat()`'s turret loop (`js/game.js:1164-1175`),
before the existing `if (t.cd <= 0 && dist < 4500)` test, add an arc check.
The turret's world-space aim direction is its local `dir` rotated by the
ship's current orientation `e.q` (which the ship already updates every frame
at `js/game.js:1163`); a target is in-arc if the angle between that rotated
direction and the vector to the target is within `halfAngle`:

```js
const worldDir = V4.copy(t.arc.dir).applyQuaternion(e.q); // V4: new module-level scratch, see §5
const inArc = worldDir.dot(to) > Math.cos(t.arc.halfAngle); // `to` is already computed above, js/game.js:1137-1139
if (t.cd <= 0 && dist < 4500 && inArc) { /* existing fire code, unchanged */ }
```

This does not touch turret HP, damage, cooldown or range — only *whether*
that turret's existing timer is allowed to fire this frame. Net effect:
roughly a third to a half of a capital's turrets can bear on the player at
once (7-10 turrets spread bow/stern/port/starboard/dorsal/ventral, each
covering a 130° cone), so flying to a blind quarter is a real, readable
tactic, and a capital's *effective* DPS during a head-on pass is lower than
today even though every individual number is unchanged — which is a
hittability improvement, not a nerf requiring rebalancing (Gev's 2026-09-23
note was "unhittable", not "too weak").

**Escort screen**: when a capital is spawned with `z.tier >= 3` (dreadnought
+ carrier zones), assign it a screen squad instead of leaving its accompanying
imps to spawn independently. Screen size and radius:

| Capital | Screen size | Screen radius |
|---|---|---|
| dreadnought | 3 imps | `radius + 260` (≈ 780-900 u, since dreadnought `radius` from `reach()` is roughly 520-620 u) |
| carrier | 4 imps | `radius + 320` |

The screen squad's `slots = FORMATIONS.screen(n, screenRadius)`, its `leader`
is the **capital's** enemy ref (not an imp), and its members orbit that
ring, yaw-locked to the capital's own slow turn (`e.q.rotateTowards`,
`js/game.js:1163`) exactly as the turret arcs do — reuse the same rotated
`worldDir`-style transform (§5) so a screen imp's goal position is
`capitalPos + slotOffset.rotatedBy(capital.q)`, meaning the ring turns with
the ship, like the turrets it's covering.

---

## 4. The squad state machine

One `state` string per squad (`wing` or `screen`), advanced in a new method
`updateSquads(dt)` called once per frame from `updateCombat()` (add the call
at the top of `js/game.js:1130`, before the per-enemy loop, so squad-level
decisions are made before individual members steer toward them this frame).
Every imp in a squad reads `e.squad.state` — there is exactly one state per
squad, changed for the whole squad at once (this is the Halo-style "squad
commits to a task together" idea from §2, applied to a 3-8 member wing
instead of a 2-3 member fireteam).

| State | Entered when | Behavior | Exits to |
|---|---|---|---|
| **formup** | squad just spawned | Members arrival-steer to their slot from wherever they spawned (§5). Leader holds its spawn position (or, for a `screen` squad, the capital's current ring position). HUD call-out fires once slots are within 1.5x tolerance of full (see §6). | `approach` once every member is within `2 * SP` of its slot, or after a 4 s cap (so a squad member stuck behind a rock still joins the fight) |
| **approach** | from `formup`, or after `regroup` | Leader flies a slow arc around the zone centre (`patrol.center`, `patrol.r = 1800`, `patrol.a += dt * 0.25`) while members hold formation on it via arrival + separation (§5) — this is the "patrol a route" the task asked for; it is short (a few seconds) rather than a standing patrol loop, since the player has already interdicted the zone (`enterZone`, `js/game.js:969`) and the fight is expected to start promptly. `screen` squads instead track the capital's own slow turn and never leave `approach` except to intercept (see below). | `attack` when the leader's distance to the player drops under 3200 u |
| **attack** | from `approach` | Formation is dropped. Members run the **existing** individual orbit-and-fire behavior verbatim (`js/game.js:1140-1157`, unchanged) — this is deliberate: the "scattered, unpredictable" look is *correct* for the attack run itself (a real attack run should feel chaotic and hard to read at the bullet level), it was only wrong as the *entire* fight. | `break` after `stateT > 6` seconds, or immediately if squad HP (sum of member `hp`) drops under 40% of its spawn total |
| **break** | from `attack` | Members fly straight outward along their current velocity for 1.5 s (no steering, no firing) — a breather that reads as "the wing is disengaging", not a bug. | `regroup` after 1.5 s |
| **regroup** | from `break` | Surviving members arrival-steer back to slots recomputed from the **current** member count (`FORMATIONS[squad.formation](members.filter(alive).length, ...)`, so a 5-imp V that lost two becomes a 3-imp V, not a V with gaps) around a **new** leader if the old one died (see below). | `approach` once reformed (same tolerance as `formup`) |
| **retreat** | leader dead, or squad HP under 25% | All surviving members fly directly away from the player at full speed, stop firing, stop steering to slots. They remain in `this.enemies`, alive and hittable (never despawned — despawning would let a zone go un-liberatable, since `updateZones()`, `js/game.js:955-967`, requires every enemy dead), just no longer a coordinated threat. | none — terminal until killed |

**Leader death**: when `hurt()` (`js/game.js:1269-1300`) kills an imp whose
`e.squad.leader === e`, do not immediately force `retreat` — promote the
next living member (lowest surviving `slot` index) to leader and force the
squad into `regroup` (a new leader takes over and the wing reforms on it,
matching how Reynolds-style leader-following formations behave when the
lead boid changes — §2), **unless** the squad is already below 40% HP, in
which case go straight to `retreat`. This gives the "regroup **or** retreat
when the leader dies or at low strength" behavior the task asked for as one
rule instead of two: leader death always demotes/promotes, but only forces
a full retreat when the squad was already weak. Implement this check inside
`hurt()` right after `st.stats.kills++` (`js/game.js:1278`), gated on
`e.kind === 'imp' && e.squad`.

**Screen squads** never enter `attack`/`break`/`regroup`/`retreat` while
their capital is alive and the player is outside 1200 u of the ring — they
are a static-relative-to-the-ship escort, not an attack wing. If the player
closes inside 1200 u of the screen radius, the nearest 2 members peel off
into a temporary 2-member `wing` squad (new squad object, `formation: 'lineAbreast'`)
that runs the normal state machine, while the remainder stay on station; the
peeled pair rejoin the screen (deleted as a standalone squad, members'
`squad` pointer reset to the screen) if the player leaves 1200 u again
without killing them. When the capital dies, every remaining screen member
becomes its own 1-member `wing` squad in `retreat` state (nothing left to
escort).

---

## 5. Steering math

All of this reuses the existing per-frame scratch-vector pattern already at
the top of `js/game.js` (`V1`, `V2`, `V3`, `Q1`, `Q2`, declared line 37-38) —
**add `V4`, `V5`, `Q3` next to them**. No `new THREE.Vector3()` or
`new THREE.Quaternion()` anywhere in the per-frame path; every steering
calculation below writes into one of these six shared scratch objects. Slot
offsets themselves (`squad.slots`) are plain `[x, y, z]` number arrays
(§3.1), not `Vector3` instances, computed once at spawn/regroup — zero
allocations per frame anywhere in this system.

**1. Slot goal position** (world space), for a formation member in `formup`,
`approach`, `regroup`, or a screen member in `approach`:

```js
// leaderRef: the squad's leader enemy (imp or capital); slot: [x,y,z] in leader's local frame
function slotGoal(out, leaderRef, slot) {
  out.set(slot[0], slot[1], slot[2]).applyQuaternion(leaderRef.q);
  out.x += leaderRef.pos.x; out.y += leaderRef.pos.y; out.z += leaderRef.pos.z;
  return out;
}
// usage: slotGoal(V4, e.squad.leader, e.squad.slots[e.slot])
```

This is Reynolds' "N points on a shape, one boid per point, arrival toward
the point" (§2) — the shape is defined in the leader's frame so it turns
with the leader for free (no separate rotation bookkeeping per member).

**2. Arrival** (seek that brakes on approach, avoiding overshoot/orbiting
around the slot — the actual Reynolds `arrival` behavior cited in §2):

```js
// pos, vel: the member's current position/velocity (plain {x,y,z} and THREE.Vector3, as already used by imp e.pos/e.vel)
// goal: V4 from slotGoal(); maxSpeed: member's cruise speed; slowRadius: distance at which braking begins
function arrival(desired /* out: V5 */, pos, goal, maxSpeed, slowRadius) {
  desired.set(goal.x - pos.x, goal.y - pos.y, goal.z - pos.z);
  const d = desired.length();
  const speed = d < slowRadius ? maxSpeed * (d / slowRadius) : maxSpeed;
  if (d > 0.01) desired.multiplyScalar(speed / d);
  return desired;
}
```

Use `maxSpeed = 240` (the same cap the current orbit code already uses at
`js/game.js:1145`, `Math.min(240, gl * 0.8)` — kept identical so squad flight
speed matches the existing individual-imp speed, no balance change) and
`slowRadius = 300`.

**3. Separation** (keeps formation members from stacking on each other —
needed because arrival alone only pulls each member toward its own slot and
does nothing about two members whose *slots* are close together but whose
*current* positions haven't caught up yet, e.g. right after `regroup`
recomputes slots for fewer members):

```js
// Loop only over the member's own squad (3-8 entries), not all enemies —
// O(squad size) per member, negligible even with the largest 8-imp tier-4 wing.
function separation(out /* V5, added into */, e, squad) {
  for (const o of squad.members) {
    if (o === e || o.dead) continue;
    const dx = e.pos.x - o.pos.x, dy = e.pos.y - o.pos.y, dz = e.pos.z - o.pos.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > 2500 || d2 < 0.01) continue; // 50 m radius
    const push = (1 - Math.sqrt(d2) / 50) * 120;
    out.x += (dx / Math.sqrt(d2)) * push; out.y += (dy / Math.sqrt(d2)) * push; out.z += (dz / Math.sqrt(d2)) * push;
  }
}
```

**4. Combined per-member update**, replacing the imp branch of
`updateCombat()` (`js/game.js:1140-1157`) **only when `e.squad && e.squad.state !== 'attack'`**
(when in `attack`, fall through to the existing unmodified orbit code, per
§4's table — this is a conditional branch, not a wholesale rewrite, so the
existing, already-tested attack behavior is untouched):

```js
if (e.squad && e.squad.state !== 'attack') {
  slotGoal(V4, e.squad.leader, e.squad.slots[e.slot]);          // 1
  arrival(V5, e.pos, V4, 240, 300);                              // 2
  separation(V5, e, e.squad);                                    // 3, added in place
  e.vel.lerp(V5, 1 - Math.exp(-2 * dt));                         // same damped-lerp idiom as js/game.js:1146
  e.pos.x += e.vel.x * dt; e.pos.y += e.vel.y * dt; e.pos.z += e.vel.z * dt;
  Q2.setFromUnitVectors(FWD, V4.subVectors(V4, e.pos).normalize()); // face the slot goal, reusing the pattern at js/game.js:1148
  e.q.slerp(Q2, 1 - Math.exp(-4 * dt));
  e.squad.stateT += dt;
  continue; // skip the rest of the existing imp block (firing) — formation members don't fire outside `attack`
}
// ...existing e.kind === 'imp' orbit-and-fire code, unchanged, runs for e.squad == null or e.squad.state === 'attack'
```

Members in `formup`/`approach`/`regroup`/`break` do not fire (matches the
task's "telegraph before attacks": a wing that is visibly still assembling
is not yet a threat, which is itself the telegraph — no separate timer
needed). `break` state overrides steering entirely for its 1.5 s (§4): skip
the `slotGoal`/`arrival` call and instead do
`e.pos.x += e.vel.x * dt` etc. using the velocity the member had when
`attack` ended, undamped — the member coasts outward.

**Leader movement** (`approach` patrol arc, `formup` hold): the leader is a
normal `enemies` entry too (an imp for `wing` squads, a capital for `screen`
squads) and keeps its own existing movement code — for a `wing` leader in
`approach`, replace its individual orbit with the patrol arc:

```js
// squad.patrol = { center: {x,y,z} (zone base point from enterZone), r: 1800, a: 0 }
squad.patrol.a += dt * 0.25;
const gx = squad.patrol.center.x + Math.sin(squad.patrol.a) * squad.patrol.r;
const gz = squad.patrol.center.z + Math.cos(squad.patrol.a) * squad.patrol.r;
// arrival() toward (gx, leader.pos.y, gz), same maxSpeed/slowRadius as members
```

A `screen` squad's "leader" is the capital, which already has its own
movement code (`js/game.js:1159-1163`) — nothing new needed there, screen
members simply track it via `slotGoal`/`arrival` as in the combined update
above.

**Cost per frame**: for the worst case (tier 4: two dreadnoughts + one
carrier, 8 imps split into two wings of 3-4 plus two screens of 3+4 = 8 more
imps, 16 imps total, matching the existing "no allocations, reuse scratch
vectors" budget) this is 16 members × (1 `slotGoal` + 1 `arrival` + a
separation loop over ≤4 squadmates + 1 `slerp`) — a few dozen vector ops per
frame, no `new`, no array allocation (squad membership loops iterate
`squad.members`, a plain array set once at spawn/regroup, never resized
except by `.filter()` at regroup time, which happens a handful of times per
fight, not every frame). This is materially *cheaper* than doing nothing
differently, since it replaces the current per-imp `Math.sin`/`Math.cos`
phase-orbit math with the same order of operations.

---

## 6. Waves, arrival order, and HUD call-outs

### 6.1 Staggered spawn (readable arrival order)

Replace `enterZone()`'s single spawn burst (`js/game.js:982-989`) with an
ordered sequence, using the same `base`/`dir` point already computed at
`js/game.js:981`. Store a queue on `this.spawnQueue` (array of
`{ t, fn }`), drained by a few lines added to `updateZones(dt)`
(`js/game.js:937`, top of the function): `while (this.spawnQueue.length && this.spawnQueue[0].t <= this.t) this.spawnQueue.shift().fn();`
(`this.t` is the game's running clock, already used throughout `game.js`).

Order, by zone tier (imp counts **unchanged** from today —
`[3, 5, 6, 8]` — only grouped and staggered differently):

| Tier | t=0 s | t=1.5 s | t=3.5 s |
|---|---|---|---|
| 1 | 1 dreadnought (no screen — too small a zone) | wing of 3, formation `v` | — |
| 2 | 1 dreadnought + screen of 3 | wing of 2, formation `lineAbreast` | wing of 3, formation `v` |
| 3 | 1 dreadnought (screen 3) + 1 carrier (screen 4) | wing of 3, formation `diamond` | wing of 3, formation `echelon` |
| 4 | 2 dreadnoughts (screen 3 each) + 1 carrier (screen 4) | wing of 4, formation `v` | wing of 4, formation `box` |

Check the totals against today's numbers: tier 1 = 3 (screen 0 + wing 3,
matches `imps=3`); tier 2 = 3+2 = 5 (matches `imps=5`); tier 3 = 3+4 (screens)
+3+3 (wings) — this is **more** than today's flat `imps=6`, because tier 3+
zones now also carry escort screens that did not exist as a separate
population before (today's `imps=6` were *all* loose orbiters; some of that
population becomes the screen). To keep total imp count exactly matching
the current balance, **reduce each tier-3/4 wing by the same count added to
screens**: tier 3 screens (3+4=7) replace the flat pool, wings shrink to 3+3
= 6 → grand total imps for tier 3 becomes 7 (screen) + 6 (wings) = 13, which
is more than today's 6. That is a real increase in enemy count, not just
organization, so it must be an explicit tuning choice, not an accident —
**recommended fix**: keep the *existing* per-tier `imps` totals as the
combined budget and split them between screens and wings instead of adding
screens on top:

| Tier | Total imps (unchanged: `[3,5,6,8]`) | Screen (from total) | Wings (remainder, staggered) |
|---|---|---|---|
| 1 | 3 | 0 | wing of 3 (`v`) at t=0 |
| 2 | 5 | 0 | wing of 2 (`lineAbreast`) at t=0, wing of 3 (`v`) at t=1.5s |
| 3 | 6 | dreadnought screen 2, carrier screen 2 (4 total) | wing of 2 (`echelon`) at t=1.5s |
| 4 | 8 | dreadnought×2 screen 2 each, carrier screen 2 (6 total) | wing of 2 (`v`) at t=1.5s |

This is the table to implement — it keeps every existing total (`imps` array
values and capital counts/kinds are byte-for-byte the same as
`js/game.js:982-984` today) and only changes *when* and *in what shape* they
appear, satisfying "keeps the 2026-09-23 balance". Screens are smaller (2
per capital, not 3-4 as first drafted above) specifically so the totals
still fit inside the existing budget.

### 6.2 HUD call-outs

Add a method `announceSquad(squad)` called once, the first time a squad's
`formup` slots are within tolerance (§4) — set `squad.calledOut = true` so it
fires exactly once. Uses the existing `this.ui.toast()` (`js/ui.js:280-298`,
already used for short combat messages like "Turret down. +90 cr",
`js/game.js:1254`) — no new UI plumbing needed, this call fits the existing
pattern exactly:

```js
announceSquad(squad) {
  if (squad.calledOut) return;
  squad.calledOut = true;
  const n = squad.members.filter((m) => !m.dead).length;
  const bearing = this.bearingTo(squad.leader.pos); // §6.3
  const shape = { v: 'V formation', echelon: 'echelon', lineAbreast: 'line abreast', diamond: 'diamond', box: 'box' }[squad.formation];
  this.ui.toast(`Wing of ${n}, ${shape}, bearing ${bearing}`);
  audio.sfx('alarm', { vol: 0.4 }); // reuse the existing zone-entry alarm cue, quieter
}
```

Screens announce once too, at spawn (`formup` is skipped for screens since
they spawn already in position): `` `${capitalName} escort: ${n} on station` ``.

### 6.3 Bearing

No bearing helper exists yet. Add one alongside `fmtTime`/`fmtU` in
`js/util.js` (pure function, no THREE dependency, matching that file's
existing style):

```js
// Compass bearing (0-359, "040" style, 3 digits) from the ship's current
// heading to a world point, in the ship's local XZ plane (yaw only —
// pitch/roll don't affect a horizon-style bearing read-out).
export function bearingTo(shipPos, shipFwd, point) {
  const dx = point.x - shipPos.x, dz = point.z - shipPos.z;
  const shipA = Math.atan2(shipFwd.x, -shipFwd.z);
  const a = (Math.atan2(dx, -dz) - shipA + TAU * 2) % TAU;
  return String(Math.round((a * 180) / Math.PI) % 360).padStart(3, '0');
}
```

`Game.bearingTo(point)` (the method used in §6.2) is a one-line wrapper:
`return bearingTo(this.ship.pos, V1.copy(FWD).applyQuaternion(this.ship.q), point);`
— add near `assistTarget()` (`js/game.js:1049`), which already computes a
similar ship-forward vector the same way.

### 6.4 Formation markers (optional, cheap)

`js/ui.js`'s `markers()` (`js/ui.js:245-277`) already draws one DOM marker
per enemy with a CSS class (`enemy`, `enemy big` for capitals). Add
`squad` to the class list when `e.squad` is set
(`` `enemy${e.kind === 'capital' ? ' big' : ''}${e.squad ? ' squad-' + e.squad.id : ''}` ``)
so a stylesheet rule can tint members of the same squad the same color — a
pure-CSS change (`style.css`, not covered by this spec's file scope, left as
a one-line follow-up for whoever implements this) giving the Elite-Dangerous-Wings-style
"which marker belongs to which wing" read the research in §2 recommends,
with no extra per-frame JS cost (the class string is already rebuilt every
frame at `js/ui.js:272`).

No shader/post-pass change is needed or recommended: `js/render.js`'s doodle
pass reads material ID from alpha (`ID.INK/ENEMY/GLOW/SCREEN`, `js/mats.js:6`)
per-fragment and has no per-actor or per-squad concept to hook into cheaply;
the HUD (DOM) and world-space `glow()` materials (already used for the beam
telegraph, `js/game.js:1225`) are the right and sufficient layers for every
readability cue this spec calls for.

---

## 7. Telegraphs

Two telegraphs already exist and are unchanged by this spec: the capital
beam's 3 s charge with a visible pink aim line (`updateBeam`,
`js/game.js:1214-1240`, `glow(0xf2a0b8)` at `js/game.js:1225`). This spec
adds one more, matching the same idiom (a `glow()` mesh, reusing
`this.beamGeo`, the same cylinder geometry already declared once at
`js/game.js:138` and reused for both the player's and every capital's beam):

**Attack-run telegraph**: when a `wing` squad transitions `approach → attack`
(§4), for 0.4 s show a short glow line from the leader toward the player
(reusing `e.beamMesh`'s pattern but on the squad, not stored per-member) —
this is the "wing peeling off to dive on you" cue. Implementation: on that
transition, create one `THREE.Mesh(this.beamGeo, glow(PAL.yellow))` (yellow,
not the beam's pink/red, so it reads as "incoming fighters" not "incoming
capital beam"), scale/position it from leader to player exactly like
`drawBeam()` already does for capitals (`js/game.js:1625-1636`, the `place()`
helper), store it as `squad.telegraphMesh`, and remove it after 0.4 s
(tracked via `squad.stateT` since `stateT` resets to 0 on every state
change, §4). This costs one draw call for 0.4 s per squad transitioning to
`attack` (at most 2-3 squads per zone, so at most 2-3 extra draw calls,
transient) — negligible against the ~250 draw call Chromebook budget (§8).

No new telegraph is needed for turret-arc gating (§3.3) — the turret arc
itself, visible as "some of this ship's guns just aren't firing at me from
this angle", is its own readable signal once the player notices it, exactly
as a real ship's blind arc is discovered by flying around it, not announced.

---

## 8. Performance budget (Chromebook: integrated GPU, ~250 draw calls, no
per-frame allocation)

- **Draw calls**: unchanged. This spec adds no geometry (`js/actors.js` is
  untouched) — imps and capitals are built exactly as today, one clone per
  spawn, materials shared via the `once()`/cache pattern already in
  `js/actors.js:182-187`. The only new meshes are the transient attack-run
  telegraph lines (§7), at most 2-3 at once, 0.4 s each. Existing budget
  (imp: 1-2 meshes per material touched, template merges everything into one
  mesh per material via `Kit.into()`, `js/actors.js:42-46`; capital: hull
  merged similarly, plus one mesh-pair (housing + muzzle glow) per turret,
  `js/actors.js:444-456`, so a 10-turret dreadnought is ~20 turret draw
  calls plus ~8-10 for the hull/bridge/engines) is not touched by this spec.
- **Allocations**: zero new `new THREE.Vector3()`/`new THREE.Quaternion()` in
  the per-frame path — `V4`, `V5`, `Q3` are declared once at module scope
  (§5) alongside the existing `V1-V3`, `Q1-Q2`. `squad.slots` arrays are
  plain number arrays computed once per spawn/regroup event (a handful of
  times per fight, not per frame). `squad.members` and `this.squads` are
  populated at spawn and only `.filter()`'d at `regroup` (§4) — `.filter()`
  does allocate a new array, but only on that state transition (at most a
  few times per fight per squad), which is the same order of allocation
  frequency the existing code already accepts for e.g. `this.shots = keep`
  at `js/game.js:1210` (rebuilt every frame today, for comparison — so even
  a naive `.filter()` at every `regroup` is strictly cheaper than what the
  shot-cleanup code already does every single frame).
- **CPU**: §5 estimated a few dozen vector operations per member per frame,
  worst case ~16 formation members at tier 4 — this replaces, not adds to,
  the existing per-imp `Math.sin`/`Math.cos` orbit math, so net CPU cost is
  roughly flat, possibly lower (arrival + separation over ≤4 squadmates is
  less work than a `Math.sin`/`Math.cos`/`Math.hypot` orbit against a moving
  target every frame for every imp, which is what happens today).
- **`updateSquads(dt)`** (§4) can safely run every frame (state-machine
  bookkeeping only, no geometry work) — no need for the `zoneTick % 10`
  throttling `updateZones()` uses (`js/game.js:941`) for its zone-radius
  scan, since squad state transitions are gated on distance thresholds and
  timers already, not a poll loop.

---

## 9. Files and functions to change

| File | What | Where (current line refs, this read) |
|---|---|---|
| `js/game.js` | Add `V4, V5, Q3`, `SP`, `FORMATIONS`, `turretArc()`, `slotGoal()`, `arrival()`, `separation()` as module-level consts/functions | near `V1-V3`/`Q1-Q2`, line 37-40 |
| `js/game.js` | `this.squads = []` alongside enemy/shot state init | constructor, near wherever `this.enemies` is first set |
| `js/game.js` | `enterZone()`: replace the single spawn burst with the staggered queue (§6.1) | 969-990 |
| `js/game.js` | `spawnCapital()`: add `arc` to each turret entry; assign a `screen` squad for tier ≥ 2 | 991-1012 |
| `js/game.js` | `spawnImp(pos, opts = {})`: accept `opts.squad`/`opts.slot` | 1015-1021 |
| `js/game.js` | `clearCombat()`: also clear `this.squads` and any `telegraphMesh`es | 1022-1028 |
| `js/game.js` | New `updateSquads(dt)` method: state machine (§4), spawn-queue drain (§6.1) | new method, called from `updateZones()` or top of `updateCombat()` |
| `js/game.js` | `updateCombat()`: imp branch gains the `e.squad && state !== 'attack'` early-out (§5); capital turret loop gains the arc check (§3.3, §5.4) | 1140-1157 (imp), 1164-1175 (turrets) |
| `js/game.js` | `hurt()`: leader-death promotion/retreat check (§4) | 1269-1300, right after `st.stats.kills++` (1278) |
| `js/game.js` | `announceSquad()`, `bearingTo()` wrapper (§6.2-6.3) | new methods near `assistTarget()`, 1049 |
| `js/util.js` | `bearingTo(shipPos, shipFwd, point)` pure helper (§6.3) | new export, alongside `fmtTime`/`fmtU`, 84-99 |
| `js/ui.js` | `markers()`: add `squad-<id>` CSS class (§6.4) | 245-277, specifically the class string at 272 |
| `js/universe.js` | none required — zone tier/composition stays exactly as `rollZones()` produces today (783-804); §6.1's table is consumed entirely inside `enterZone()` | — |
| `js/actors.js` | none | — |
| `js/render.js` | none | — |
| `tools/test.mjs` | New checks, see §10 | after the existing "entering a zone spawns..." check, 159-160 |

---

## 10. Headless test checks (extend `tools/test.mjs`)

Follow the existing pattern in that file: `E(...)` runs code inside
`window.__dv` over CDP, `check(name, bool, detail)` records the result. Add
these after the existing zone checks (`tools/test.mjs:159-167`), before
"drone launches" (line 168):

```js
// squads exist and are structured
const sq = await E(`
  const wings = g.squads.filter(s => s.kind === 'wing');
  const screens = g.squads.filter(s => s.kind === 'screen');
  return {
    nWings: wings.length,
    everyWingHasOneLeader: wings.every(s => s.members.filter(m => m === s.leader).length === 1),
    everyMemberHasSquad: g.enemies.filter(e => e.kind === 'imp' && e.squad).length,
    totalImps: g.enemies.filter(e => e.kind === 'imp').length,
  };
`);
check('squads exist with exactly one leader each', sq.nWings > 0 && sq.everyWingHasOneLeader, JSON.stringify(sq));

// give formup a moment to converge, then check slot distances
await E(`for (let i = 0; i < 240; i++) g.updateCombat(1/60), g.updateSquads(1/60); return 1;`); // 4s headless-time
const slots = await E(`
  const w = g.squads.find(s => s.kind === 'wing' && s.state !== 'attack');
  if (!w) return { skip: true };
  const off = w.members.filter(m => !m.dead).map(m => {
    const goal = new THREE.Vector3(...w.slots[m.slot]).applyQuaternion(w.leader.q).add(w.leader.pos);
    return Math.hypot(m.pos.x - goal.x, m.pos.y - goal.y, m.pos.z - goal.z);
  });
  return { off, max: Math.max(...off) };
`);
check('wingmen sit within 90m of their formation slot once formed', slots.skip || slots.max < 90, JSON.stringify(slots));

// leader death triggers regroup or retreat
const ld = await E(`
  const w = g.squads.find(s => s.kind === 'wing' && !s.leader.dead);
  if (!w) return { skip: true };
  const before = w.state;
  g.hurt(w.leader, 1e6, w.leader.pos);
  g.updateSquads(1/60);
  return { before, after: w.state, changed: before !== w.state || w.leader.dead };
`);
check('killing the squad leader triggers regroup or retreat', ld.skip || (ld.after === 'regroup' || ld.after === 'retreat'), JSON.stringify(ld));

// squad members share one state field
const shared = await E(`
  const w = g.squads.find(s => s.kind === 'wing');
  if (!w) return { skip: true };
  return { ok: w.members.every(m => !m.squad || m.squad.state === w.state) };
`);
check('every squad member reads the same shared state', shared.skip || shared.ok, JSON.stringify(shared));

// turret arc actually gates fire: rotate a capital so the player is behind a stern turret's dead zone
const arc = await E(`
  const cap = g.enemies.find(e => e.kind === 'capital' && !e.dead);
  if (!cap) return { skip: true };
  const stern = cap.turrets.find(t => t.arc && t.arc.dir.z > 0.5); // stern-facing turret
  if (!stern) return { skip: true };
  // put the player directly ahead of the ship (bow side) — a stern turret should not be in-arc
  g.ship.pos.x = cap.pos.x; g.ship.pos.y = cap.pos.y; g.ship.pos.z = cap.pos.z - cap.radius * 3;
  const before = g.shots.length;
  stern.cd = 0; // force it ready to fire this tick if the arc check allows it
  for (let i = 0; i < 30; i++) g.updateCombat(1/60);
  return { firedFromStern: g.shots.length > before, before, after: g.shots.length };
`);
check('a stern turret does not fire at a target off its bow arc', arc.skip || !arc.firedFromStern, JSON.stringify(arc));
```

These five checks cover: structure exists (leader uniqueness), the steering
math actually converges (slot distance), the state machine reacts correctly
to a leader kill, state is genuinely shared (not per-member), and the new
turret arc gate has an observable effect. Combined with the existing "40/41"
baseline (`docs/HANDOFF.md`), a correct implementation should land at
45/45 minus the pre-existing unrelated "autopilot closes on Mars" failure —
i.e. still exactly one known failure, now out of 45 instead of 41.

---

## 11. What to look at on screen, to see this working

1. Run `node tools/serve.mjs --port <port>` and open the game at
   1366x768 (the primary keyboard+mouse width, per the project's own rule).
2. Fly into any hostile zone (map filter "zones", or just cruise until
   interdicted).
3. Expect, in order: the existing "ENEMY ZONE" big banner
   (`js/game.js:975`), then within ~1.5-3.5 s a toast reading
   "Wing of N, `<shape>`, bearing `<NNN>`" for each wing as it finishes
   forming up (§6.2) — this replaces the silent scatter-spawn.
4. Visually: imps should appear in a visible V/echelon/line/diamond/box
   shape holding together as a group while still ~3000+ u out, then
   noticeably break formation and dive individually once the leader closes
   inside 3200 u (§4 `attack` transition) — the existing chaotic dogfight
   look kicks in only at that point, not from frame one.
5. Around a dreadnought/carrier: 2-4 imps should hold a slow ring around the
   hull instead of independently orbiting the player — flying close and
   around the capital's stern should visibly cause fewer of its turrets to
   fire (§3.3's arc gate).
6. Kill a wing's leader (it's whichever member is at slot 0 — not
   distinguishable by look today; a follow-up could reuse the existing
   captain/imp face texture distinction, `js/actors.js:360` `faceMat`, to
   mark leaders, but that touches `js/actors.js` and is out of this spec's
   file scope) and watch the rest either regroup on a new leader or turn
   and run, per §4's HP-threshold rule.
