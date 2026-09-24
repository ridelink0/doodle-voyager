# Part 2: eject seat, auto doors, pick-up-ables

For the implementer. Read `js/ships.js` (`Kit`, `wall()`, `cockpit()`, `breachPanel()`,
`buildInterior()`, `buildExterior()`, `walkCheck()`) and `js/game.js` (`onKey`, `interact()`,
`nearestInteract()`, `updateFoot()`, `collideFoot()`, the hull-breach/EVA block at
`game.js:1442-1563`) alongside this — every line reference below is from the source read
2026-09-24, not guessed. This spec is written **on top of** `docs/specs/ship-roster.md`
(15 ships, the `locker` multi-deck contract, `KeyR` abilities) and `docs/specs/neon-relook.md`
(`ink()`/`glow()` keep their current call signature) — both still in progress alongside this
one. Anywhere this spec depends on something ship-roster.md defines but hasn't built yet, it
says so as **"expected from part 1"** rather than inventing numbers for code that doesn't
exist, per Gev's "never pass an approximation off as real" rule.

Gev's ask, verbatim: a physical seat button that ejects the pilot out a **top or bottom**
hatch (chosen by a switch or by look direction, both must exist) into EVA with a speed burst,
animation and sound, and a way back in through either hatch — keeping the existing hull-breach
accident path unchanged; interior doors that **open by themselves** when you're near and close
after you pass, with no key press, and `walkCheck` must know the difference between an open
door and a closed one; and **pick-up-able** props (boxes, crates, posters, mugs, loose EVA
cargo) that carry, drop, throw, stack, have weight limits and simple physics, saved per ship.

## 0. What's new here that doesn't exist in the codebase yet

- **No gamepad support exists at all** (`grep -r gamepad js/` is empty; `docs/RESEARCH-features.md`
  ranks it #29, "No", still on the TODO). Every key/gamepad pairing below is new. §1 adds the
  minimum Gamepad API plumbing these three features need — it does **not** add gamepad
  movement/look, which is a separate, larger task Gev didn't ask for here.
- **Doors, today, are not objects.** Every "doorway" in every room function
  (`scoutRooms`, `cruiserRooms`, …) is a bare gap left in a `wall()` call — no leaf mesh is
  drawn, and `wall()`'s own `span()` helper already skips adding a floor-level collider across
  any hole (`ships.js:166-168`), so every doorway in the game has always been silently,
  permanently open. "Auto doors" is therefore new geometry *and* new physics, not a retrofit of
  existing door objects — §3 covers exactly what that touches.
- **Furniture has no individual identity.** `Kit.build()` (`ships.js:177-209`) merges every part
  sharing a material into one `BufferGeometry` per material — the existing `crate()` helper
  (`ships.js:246-251`) draws crates straight into that merge, so today's crates cannot be moved
  at runtime; they're baked into one static mesh with everything else. §4 introduces a second,
  parallel path for the handful of props that need to move.

## 1. Shared foundation: minimal Gamepad API polling (`js/game.js`)

Add near the top of the `update(dt)` call chain (`game.js:686`, before `updateFoot`/
`updateHelmInput`/`updateEva` run), a new method:

```js
pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && (pads[0] || pads[1] || pads[2] || pads[3]);
  const prev = this._gpPrev || (this._gpPrev = []);
  const down = (i) => !!(gp && gp.buttons[i] && gp.buttons[i].pressed);
  const rising = (i) => { const d = down(i), was = !!prev[i]; prev[i] = d; return d && !was; };
  if (!gp) return;
  if (rising(0)) this.interact();          // A / Cross — same context as KeyE
  if (rising(3) && this.mode === 'helm') this.ejectPilot();   // Y / Triangle — §2
  if (rising(7)) this.throwCarried();      // RT / R2 — §4 (no-op unless this.carrying)
}
```

Called once per `update(dt)`, right after `const input = this.readMouse();` (`game.js:689`).
`navigator.getGamepads()` returns `null` slots for unconnected pads and stale objects that must
be re-read every frame (per the Gamepad API spec) — do not cache `gp` across frames. This is the
entire gamepad surface this spec adds: no stick reads, no D-pad, no rumble. Movement/look via
gamepad remains unbound, matching `docs/RESEARCH-features.md` rank #29's own scope note.

## 2. Feature 1 — EJECT

### 2.1 Why it's a separate system from the hull breach

`pullBreach()`/`updateBreach()`/`goEva()`/`reenter()` (`game.js:1443-1563`) model an **accident**:
the hole is torn open violently, the wind sucks you out over about a second with no control, and
recovery clears `this.ship.auto`/`cruise`/`throttle` because a hull breach is a crisis. Eject is
the opposite: a **controlled, instant** exit the pilot chooses, through purpose-built hatches
that were always there. Keep `this.breach` and its whole call chain **completely untouched** —
this is the regression guard: nothing below edits a single line inside
`pullBreach`/`updateBreach`/`goEva` as they exist today. Eject gets its own parallel state object,
`this.eject`, and its own functions, sharing only the pieces that generalize safely
(`evaNearHole()` and `reenter()`, extended — see §2.3.3).

### 2.2 Geometry (`js/ships.js`)

#### 2.2.1 Where the hatches sit: derive from the seat, not from new per-ship numbers

`cockpit(k, s, P)` (`ships.js:636-724`) already computes the seat's ship-local Z from the LAYOUT
entry alone: `zf = -s.L/2 + T`, seat `z = zf + 2.25` (`ships.js:637,712`). `buildExterior()`
(`ships.js:1426`) already has `s = LAYOUT[key]` in scope, so it can compute the same `seatZ`
independently, with **no new field on `LAYOUT`** and no interior object passed in:

```js
// in buildExterior(type, paintName), after k.build():
const seatZ = -s.L / 2 + T + 2.25;   // identical formula to cockpit()'s `sz`, ships.js:637,712
```

To find the actual hull surface above and below that point — robust for the 10 ships
ship-roster.md is adding that don't exist in the codebase yet, and self-correcting if any
existing ship's dimensions change later — **raycast against the built hull**, the same mesh data
`buildExterior` already walks for the collision radius (`ships.js:1435-1442`):

```js
k.group.updateMatrixWorld(true);                 // already done at ships.js:1433
const caster = new THREE.Raycaster();
function hullY(dir) {                             // dir: +1 up, -1 down
  caster.set(new THREE.Vector3(0, dir * 50, seatZ), new THREE.Vector3(0, -dir, 0));
  caster.far = 100;
  const hits = caster.intersectObjects(k.group.children, false);
  return hits.length ? hits[0].point : null;       // null: no surface found (see fallback below)
}
const topHit = hullY(1), bottomHit = hullY(-1);
```

`intersectObjects(..., false)` (non-recursive) is correct here because every hull surface is a
single merged `Mesh` child of `k.group` after `k.build()` — recursing would also catch sign
planes and screens, which must **not** be treated as hull. If `hullY` returns `null` for a given
ship (its hull doesn't span `x=0` at `seatZ` — shouldn't happen for any of the 15, since every
`ext<Name>()` silhouette is a single continuous body through the cockpit, but a real check
matters more than an assumption), fall back to `bottomY = r.belly` (already returned by every
`ext<Name>()`) and skip the top hatch for that ship with a `console.warn`, rather than place a
hatch at a fabricated Y.

**Verification table — the 5 ships already in the codebase**, hand-derived from the exact
`ext<Name>()` geometry read this session, to sanity-check the raycast against (assert the
raycast result is within 0.15 m of these; a bigger gap means the raycast is hitting the wrong
surface, e.g. a sign plane):

| ship | `seatZ` | topY (raycast should land here) | bottomY |
|---|---|---|---|
| scout | -3.60 | 3.25 (the zip-ridge top box, `ships.js:1256`, x -3.0..3.0 covers x=0) | -0.55 (main hull floor, `ships.js:1251`; the -1.0 skirt at `ships.js:1253` is at z 3.75-5.05, aft of the cockpit, not under the seat) |
| racer | -2.10 | 3.47 (`cy + ry*cos(PI/8)` = 1.25 + 2.4×0.9239, the octagon's own `top`/`bottom` locals at `ships.js:1296,1308`, unscaled — the code already computes this) | -0.97 |
| fighter | -5.60 | 5.45 (`cy + R*cos(PI/12)` = 1.3 + 4.3×0.9659, `ships.js:1321`; the glass canopy ends at z=-6.0, aft of seatZ, so this is solid hull) | -2.85 |
| hauler | -10.60 | 3.60 (roof cap `ships.js:1348`, x -5.5..5.3, z -14..14) | -0.75 (belly cap `ships.js:1349`) |
| cruiser | -27.60 | 3.45 (main hull, `ships.js:1366`; the stepped lecture-hall roof only starts at z=-18, aft of the bridge) | -0.90 |

For the 10 new ships and for `locker`'s deck-0 bridge, there is no hand table — the raycast is
the only source of truth, exactly as designed above; do not backfill guessed numbers for them.

#### 2.2.2 The `locker` exception — read before building its hatches

Ship-roster.md §4's deck stack puts deck 0 (bridge) at the **bottom** (`y=0`), decks 1/2 above
it (`y = 2.9, 5.8`). A bottom hatch through deck 0's floor still reaches open space normally —
nothing is below deck 0. A **top** hatch through deck 0's ceiling would not: it would dump the
ejecting pilot into the berths deck's floor, not into space, because two more decks and their own
sealed shells sit directly above the bridge. Do not build a roof cutout there; it would look like
a working hatch and not be one. Instead, for `locker` only: the raycast for the "top" hatch is
cast **sideways** (`+X`, into the bridge's own side wall, opposite the elevator landing at
`x:-0.8..0.8`) instead of straight up, landing on the actual exterior hull at that side. Everything
else — the switch, the look-direction override, the sound, the "either hatch" return path — works
identically; only the ray direction and the resulting hull panel's orientation differ. State this
explicitly to the player: the HUD hint for `locker`'s eject reads "SIDE / BELLY" instead of
"TOP / BOTTOM" for this one ship (a one-line conditional in the hint string, §2.5) — saying so
plainly beats a hatch that claims to be "up" while opening sideways.

#### 2.2.3 The hatch panel + button + switch props

New function, same file, beside `holeMesh()` (`ships.js:1403-1424`):

```js
// A clean hinged hatch, unlike holeMesh()'s jagged accident tear. `hingeAxis` is local
// to the panel (world-space axis the leaf swings around); 'top' swings up-and-back,
// 'bottom' swings down-and-away.
function hatchMesh(pos, normal, kind /* 'top' | 'bottom' | 'side' */) {
  const w = 0.95, h = 0.8;
  const panel = new THREE.Mesh(geo('hatchPanel', () => new THREE.BoxGeometry(w, 0.05, h)), C.steel);
  const frame = new THREE.Mesh(geo('hatchFrame', () => new THREE.RingGeometry(0.5, 0.58, 4)), C.dark);
  // ... frame decal ("EJECT" sign via k.sign-style label, an up/down arrow per kind) ...
  panel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  panel.position.copy(pos);
  panel.visible = false;               // shown only while an ejection is in progress, like holeMesh()
  panel.userData.hingeSign = kind === 'top' ? 1 : -1;   // open rotation direction
  return panel;
}
```

Called from `buildExterior()` right after the existing `holeMesh(pos, normal)` call
(`ships.js:1445`), once for `topHit`/`bottomHit` (or the side-cast pair for `locker`):

```js
const hatchTop = topHit && hatchMesh(topHit, new THREE.Vector3(0, 1, 0), 'top');
const hatchBottom = bottomHit && hatchMesh(bottomHit, new THREE.Vector3(0, -1, 0), 'bottom');
if (hatchTop) k.group.add(hatchTop);
if (hatchBottom) k.group.add(hatchBottom);
```

Extend `buildExterior()`'s return object (additive — every existing field stays):
```js
hatches: { top: hatchTop && { pos: topHit, normal: UP, mesh: hatchTop },
           bottom: hatchBottom && { pos: bottomHit, normal: DOWN, mesh: hatchBottom } },
```

Inside `cockpit(k, s, P)` (`ships.js:636-724`), right after the pilot-seat block
(`ships.js:711-720`, before the `k.block(...)` call that closes off the seat's floor footprint at
`ships.js:721`), add the physical button and the two-way switch, both on the seat's right armrest
where the existing seat-back geometry already sits at `x: 0.33` (`ships.js:716`):

```js
// eject button — a raised red cap on the right armrest, lights when armed (mirrors the
// dashboard LED k.blink pattern already at ships.js:647-650)
const ejBtn = new THREE.Mesh(geo('ejBtn', () => new THREE.CylinderGeometry(0.045, 0.05, 0.03, 10)), G.red);
k.add(ejBtn, 0.36, 0.62, sz - 0.05);
k.blink.push(ejBtn);                    // reuse the existing blink array; game.js sets it solid-on while armed (§2.3.1)
k.box(0.31, 0.58, sz - 0.1, 0.41, 0.62, sz, C.dark);   // button housing
// two-way switch, TOP/BOTTOM (or SIDE/BELLY on locker — same prop, different sign text)
k.box(0.28, 0.56, sz + 0.14, 0.36, 0.6, sz + 0.2, C.dark);
k.use('ejectSwitch', 'flip the eject switch', 0.32, 0.58, sz + 0.17, 1.3);
k.sign(s.id === 'locker' ? 'SIDE / BELLY' : 'TOP / BOTTOM', 0.3, 0.32, 0.66, sz + 0.17, 0, -0.3, { w: 160, h: 64, size: 26 });
```

(`sz` is the existing local seat-Z variable already in scope at `ships.js:712`.) `buildInterior()`'s
return object needs no new top-level field for this — the button/switch are picked up
automatically through the existing `k.interact`/`k.blink` arrays exactly like every other prop.

### 2.3 Game logic (`js/game.js`)

#### 2.3.1 `ejectPilot()` — arm/confirm, hatch choice, launch

```js
ejectPilot() {
  if (this.mode !== 'helm') return;
  const hs = this.exterior.hatches;
  if (!hs || (!hs.top && !hs.bottom)) { this.ui.toast('This ship has no eject hatches.'); return; }
  if (this.ship.warp) { this.ui.toast('Not while the warp field is up.'); return; }
  const now = performance.now();
  if (!this.ejectArm || now - this.ejectArm > 3000) {
    this.ejectArm = now;
    this.ui.big('EJECT ARMED', 'Press again within 3 s to go. Look up or down to pick a hatch.');
    audio.sfx('ui');
    return;
  }
  this.ejectArm = 0;
  // hatch choice: look-direction overrides the switch, exactly like Gev asked for both.
  const p = this.player;                          // p.lookPitch: -1.2 (down) .. 1.2 (up), game.js:764-771
  let side = p.lookPitch > 0.35 ? 'top' : p.lookPitch < -0.35 ? 'bottom' : (this.ship.ejectHatch || 'top');
  if (!hs[side]) side = hs.top ? 'top' : 'bottom';  // fall back if the chosen side has no hatch (locker-style ships)
  const h = hs[side];
  h.mesh.visible = true;
  h.mesh.userData.t = 0;                            // hinge-open animation driver, §2.3.2
  audio.sfx('eject');
  // throttle/cruise off (nobody's steering by hand); autopilot, if set, keeps flying the
  // ship exactly like walking away from the helm already does (game.js:450) — ejecting is
  // a choice, not a crisis, so it does not cancel a course the player already set.
  this.ship.throttle = 0; this.ship.cruise = false;
  const local = h.pos.clone().addScaledVector(h.normal, 3.5); local.y = local.y; // hatch pos is already ship-local
  const rel = local.applyQuaternion(this.ship.q);
  const out = h.normal.clone().applyQuaternion(this.ship.q).multiplyScalar(14);   // 2x the accident burst (goEva's 7, game.js:1503)
  this.eject = { hatch: side, rel: null };           // rel filled by goEva-equivalent below
  this.eva = { rel, vel: out, yaw: Math.atan2(-h.normal.x, -h.normal.z), pitch: 0, roll: 1.6, o2: 120 };
  this.setMode('eva');
  this.ui.big('EJECTED', `WASD + Space/Ctrl to thrust. Fly to either hatch and press E. ${side === 'top' ? 'Canopy' : 'Belly hatch'} popped.`);
}
```

Toggling the switch (new case in `interact()`'s switch at `game.js:400-417`, added beside the
existing `case 'breach':`):
```js
case 'ejectSwitch':
  this.ship.ejectHatch = this.ship.ejectHatch === 'top' ? 'bottom' : 'top';
  audio.sfx('ui');
  toast(`Eject switch set to ${this.ship.ejectHatch === 'top' ? 'TOP' : 'BOTTOM'}.`);
  break;
```
`ship.ejectHatch` defaults to `'top'` in `buildShip()` (`game.js:173-178`, add `ejectHatch: 'top'`
to the object literal there) and is **not** persisted to the save file — it's a per-session cockpit
setting, not a stat, matching how `ship.boost`/`ship.throttle` aren't persisted either.

Button glow: in `interior.animate(dt, t)` (`ships.js:1219-1224`, the existing `blink`-array
loop), the eject button (`ejBtn`, pushed into `k.blink` in §2.2.3) currently blinks with every
other blinking prop on the shared 1.6 Hz timer. Make it **solid on** while armed instead of
blinking with the rest: pass a second flag into `animate()`, `animate(dt, t, armed)`, called from
`game.js:704` as `this.interior.animate(dt, this.t, !!this.ejectArm)`; inside, skip the shared
`ejBtn` mesh from the generic blink loop and set `ejBtn.visible = armed || on` separately (the
mesh itself needs a stable reference — return it from `cockpit()`'s local scope up through
`buildInterior()`'s return object as `ejectButton: ejBtn`, mirroring how `screens`/`lights` are
already surfaced).

#### 2.3.2 Hatch swing animation, in `updateBreach(dt)`'s sibling

New method, called from `update(dt)` right after the existing `this.updateBreach(dt);`
(`game.js:700`):
```js
updateEject(dt) {
  const hs = this.exterior.hatches;
  if (!hs) return;
  for (const h of [hs.top, hs.bottom]) {
    if (!h || !h.mesh.visible) continue;
    const ud = h.mesh.userData;
    ud.t = Math.min(1, (ud.t || 0) + dt / 0.4);              // 0.4 s hinge swing
    h.mesh.rotation.x = ud.t * (h.mesh.userData.hingeSign) * 1.9;  // ~110 degrees
    if (this.eject && this.eject.hatch !== (h === hs.top ? 'top' : 'bottom') && ud.t >= 1 && !this.eva) {
      // the OTHER hatch, left open by a prior reentry choice — closes on its own after a beat
      ud.t = Math.max(0, ud.t - dt / 0.4);
      if (ud.t <= 0) h.mesh.visible = false;
    }
  }
}
```
(Kept deliberately small: the hatch that was used to leave stays open/animating while
`this.eject` is set; both are closed and hidden again inside `reenter()`, §2.3.3.)

#### 2.3.3 Generalizing the return path — `evaNearHole()` and `reenter()`

These two functions currently only know about `this.interior.breach`. Extend both, falling
through to today's exact behaviour whenever `this.eject` is not set (this is the regression
guard — every line of the accident path stays reachable and unchanged):

```js
evaNearHole() {
  if (!this.eva) return false;
  if (this.eject) {                                            // §2.1 — the new path
    const hs = this.exterior.hatches;
    for (const h of [hs.top, hs.bottom]) {                      // "a way back in through EITHER hatch"
      if (!h) continue;
      const hp = h.pos.clone().applyQuaternion(this.ship.q);
      if (hp.distanceTo(this.eva.rel) < 8) return true;
    }
    return false;
  }
  if (!this.exterior.hole) return false;                        // unchanged accident path, game.js:1511-1515
  const hp = this.exterior.hole.pos.clone().applyQuaternion(this.ship.q);
  return hp.distanceTo(this.eva.rel) < 8;
}
reenter(forced = false) {
  if (this.eject) {
    const hs = this.exterior.hatches;
    // reenter through whichever hatch the player is actually near (may differ from the one they left through)
    let best = null, bd = Infinity;
    for (const h of [hs.top, hs.bottom]) {
      if (!h) continue;
      const hp = h.pos.clone().applyQuaternion(this.ship.q), d = hp.distanceTo(this.eva.rel);
      if (d < bd) { bd = d; best = h; }
    }
    const inside = best.pos.clone().addScaledVector(best.normal, -1.3);
    this.player.x = inside.x; this.player.z = inside.z; this.player.y = 0; this.player.vy = 0;
    this.player.yaw = Math.atan2(best.normal.x, best.normal.z);
    this.player.pitch = 0;
    for (const h of [hs.top, hs.bottom]) if (h) h.mesh.userData.t = 1; // both start swinging shut
    this.eject = null; this.eva = null;
    this.setMode('foot'); this.collideFoot(); audio.sfx('seal');
    if (!forced) this.ui.big('BACK ABOARD', 'Hatch sealed.');
    setTimeout(() => { this.r.fx.blackout = 0; }, forced ? 1200 : 0);
    return;
  }
  // ... existing body, game.js:1541-1556, completely unchanged ...
}
```
`updateEva()`'s low-air blackout branch (`game.js:1534-1538`) already calls `this.reenter(true)`
generically — no change needed there; it now correctly routes through either branch above
depending on which exit is active.

### 2.4 Audio (`js/audio.js`)

Add one new named sfx to the `SFX` map (beside `seal`/`breach`, `audio.js:664-667`):
```js
eject: { make: sEject, gain: 0.6, max: 1, vip: 1 },
```
`sEject`: a short (~0.08 s) noise-shaped pop — the same synthesis idiom already used for
`sDoor`/`sSeal` (a filtered noise burst through a fast-decay envelope) — immediately followed by
a ~0.3 s rising pitch sweep (reuse `sWarpOut`'s sweep-envelope shape, just shorter and higher-
pitched) to read as "canopy pop, then thruster burst." Total clip ≈0.4 s, gain 0.6 (louder than
the 0.45-gain `door`/`seal`, since this is a dramatic one-off, not a routine sound).

### 2.5 HUD hints (`js/ui.js`)

`keysFor('eva')` (`ui.js:241`) gains nothing new (EVA controls are unchanged — thrust and E).
`keysFor('helm')` (`ui.js:240`) gets one clause appended, matching the existing template-string
style: `` · ${k('Z')} eject``. The eject-armed toast already carries the hatch-choice instructions
(§2.3.1); no separate persistent HUD element is needed — this matches how `pullBreach()`'s own
arm state has no HUD element either, just the `ui.big()` toast.

### 2.6 Keybindings

| Input | Binding | Where |
|---|---|---|
| Key | `KeyZ`, press twice within 3 s | helm mode only, `onKey` (`game.js:342-361`) — add `case 'KeyZ': if (this.mode === 'helm') this.ejectPilot(); break;` |
| Gamepad | Y / Triangle (standard-mapping button index 3), press twice within 3 s | §1's `pollGamepad()` |
| Look direction | pitch > 0.35 rad = top, < -0.35 = bottom, else the switch's setting | resolved inside `ejectPilot()` at the moment of the confirming press |
| Switch (on foot) | `E` near the seat's armrest switch prop | `interact()`'s `'ejectSwitch'` case |
| Switch (gamepad) | A / Cross (button 0) — reuses the same `interact()` call `pollGamepad()` already wires for every on-foot `E` action | §1 |

### 2.7 Tests (`tools/test.mjs`, via `window.__dv`)

1. For every `SHIPS` id: `buildExterior(id)` returns `hatches.top` and `hatches.bottom` both
   non-null (locker: side-cast top + true bottom, per §2.2.2), each with a `pos` whose `y` is
   within 0.15 of the §2.2.1 table for the 5 existing ships (no assertion possible yet for the 10
   new ones beyond "non-null and finite").
2. Switch to `scout`, enter helm, call `game.ejectPilot()` once — assert `game.mode === 'helm'`
   still (armed, not fired) and a toast fired. Call it again within 3 s — assert
   `game.mode === 'eva'`, `game.eject.hatch` is `'top'` or `'bottom'`, and `game.eva.vel.length()`
   is close to 14.
3. Set `game.player.lookPitch = 0.6` before the confirming press — assert the resulting
   `game.eject.hatch === 'top'` regardless of the switch's stored setting; repeat with
   `lookPitch = -0.6` and assert `'bottom'`.
4. From EVA after an eject, move `game.eva.rel` to within 8 u of the **other** hatch than the one
   used to leave (not the one recorded in `game.eject.hatch`), call `game.evaNearHole()` — assert
   `true`; call `game.reenter()` — assert `game.mode === 'foot'` and `game.eject === null`.
5. Regression: repeat the existing hull-breach test flow (`pullBreach` → `updateBreach` →
   `goEva` → `reenter`) unmodified and assert it still passes exactly as today — this is the
   guard that §2.3.3's edits didn't touch the accident path's behaviour.
6. `locker` specifically: assert `hatches.top.normal` is **not** `(0,1,0)` (confirms the side-cast
   branch actually ran) and that the HUD hint text for `locker` at helm contains `'SIDE'` (§2.2.2).

## 3. Feature 2 — AUTO DOORS

### 3.1 The mechanism: `Kit.doorway()`, additive to `wall()`

New method on `Kit` (`ships.js`, beside `wall()` at `ships.js:152-176`), built once, reused by
every ship (old and new) at every doorway. It does **not** change `wall()` itself — `wall()`'s
existing hole-skipping behaviour (`span()` already omits a collider for any `y0 <= 0` hole,
`ships.js:166-168`) stays exactly as today, so nothing about `wall()`'s 30+ existing call sites
needs to change or gets touched by this feature:

```js
// Call once, at the same (alongZ, c, a, b) as the matching hole passed to wall(). Builds a
// two-leaf sliding door filling that exact gap and registers it as a *dynamic* collider,
// tracked separately from k.colliders (so walkCheck's static flood-fill, which already treats
// every doorway as passable, needs zero changes — see §3.7).
doorway(alongZ, c, a, b, y1 = DOOR_H) {
  const mid = (a + b) / 2, half = (b - a) / 2 - 0.03, leafW = half, leafH = y1;
  const mkLeaf = (sign) => {
    const m = new THREE.Mesh(geo('doorLeaf', () => new THREE.BoxGeometry(1, 1, 1)), C.steel);
    m.scale.set(alongZ ? 0.06 : leafW, leafH, alongZ ? leafW : 0.06);
    const lx = alongZ ? c : mid + sign * leafW / 2, lz = alongZ ? mid + sign * leafW / 2 : c;
    this.add(m, lx, y1 / 2, lz);
    return m;
  };
  const leaves = [mkLeaf(-1), mkLeaf(1)];
  const collider = alongZ
    ? { x0: c - 0.08, z0: a, x1: c + 0.08, z1: b }
    : { x0: a, z0: c - 0.08, x1: b, z1: c + 0.08 };
  this.doors.push({ leaves, alongZ, mid, half: leafW, collider, t: 0, targetOpen: false, opening: false });
}
```

Add `this.doors = [];` to `Kit`'s constructor (`ships.js:82-94`, beside `this.interact = [];`).
`buildInterior()`'s return object gets one additive field: `doors: k.doors` (`ships.js:1216-1218`,
same pattern as `interact: k.interact`).

Leaf travel: each leaf slides along the doorway's own axis (the same axis `alongZ` already
describes) by its own half-width, ending flush against the wall segment beside the opening —
visible when open (a retracted panel beside the frame), not hidden inside the wall, since the
0.15 m wall thickness leaves no real pocket depth to hide it in. This is a deliberate, stated
choice, not an oversight: a visible retracted leaf beside the frame reads correctly for the
game's low-poly ink style (it's how sci-fi doors are drawn in the reference material too).

### 3.2 Exact doorway list — the 5 ships already in the codebase

Every floor-level `wall()` hole (`y0 <= 0`, i.e. every doorway — window holes have `y0: 0.9` and
are correctly excluded) that exists today, with the matching `k.doorway()` call to add right
after each. Nothing here is guessed; every coordinate is copied from the `holes` argument already
passed to the `wall()` call at the cited line.

| Ship / room fn | `wall()` line | Add |
|---|---|---|
| `scoutRooms` | `ships.js:762` | `k.doorway(false, -1.525, -0.8, 0.8);` |
| `racerRooms` | `ships.js:778` | `k.doorway(false, -0.2, -0.7, 0.7);` |
| `fighterRooms` | `ships.js:823` | `k.doorway(false, -3.7, -0.7, 0.7);` |
| `fighterRooms` | `ships.js:824` | `k.doorway(false, 1.925, -0.7, 0.7);` |
| `haulerRooms` | `ships.js:843` | `k.doorway(false, -8.425, -0.7, 0.7);` |
| `haulerRooms` | `ships.js:844` | `k.doorway(false, -3.025, -1.0, 1.0);` |
| `cruiserRooms` (bridge) | `ships.js:1140` | `k.doorway(false, -21.925, -1.0, 1.0, 2.3);` |
| `cruiserRooms` (left corridor, one call per `rooms` row) | `ships.js:1165` | `k.doorway(true, -1.275, -19.375, -18.075);` (DORM 1) · `k.doorway(true, -1.275, -13.175, -11.875);` (DORM 2) · `k.doorway(true, -1.275, -7.675, -6.375);` (BATH) · `k.doorway(true, -1.275, -1.525, 0.075);` (GALLEY) · `k.doorway(true, -1.275, 8.35, 9.65);` (STORAGE) |
| `cruiserRooms` (right corridor) | `ships.js:1166` | `k.doorway(true, 1.275, -19.375, -18.075);` (DORM 3) · `k.doorway(true, 1.275, -13.175, -11.875);` (DORM 4) · `k.doorway(true, 1.275, -7.675, -6.375);` (BATH) · `k.doorway(true, 1.275, -3.6, -2.3);` (AIRLOCK) · `k.doorway(true, 1.275, 6.85, 8.15);` (LAUNDRY) |
| `cruiserRooms` (lounge threshold) | `ships.js:1169` | `k.doorway(false, 11.925, -1.2, 1.2, 2.5);` |
| `cruiserRooms` (drone-bay threshold) | `ships.js:1170` | `k.doorway(false, 20.075, 2.8, 4.8, 2.3);` |

19 doors total for the 5 existing ships (1 + 1 + 2 + 2 + 13). Derived, not measured by hand:
every `a`/`b`/`c` value above is copied verbatim from the `wall()` call's own arguments or (for
the corridor rows) from `cruiserRooms`' own `doors[side].push({a: wz-dw/2, b: wz+dw/2})` computation
at `ships.js:1156-1157`, evaluated against that function's `rooms` table (`ships.js:1142-1153`).

### 3.3 The 10 new ships, and `locker`'s decks

**Expected from part 1:** ship-roster.md's 10 new ships each need their own room-building
function, and every one of them will call `wall()` with floor-level holes for its own doorways,
in the same `{a, b}` idiom every existing room function already uses — there is no other way to
open a walkable gap in this codebase's wall system. Whoever builds those 10 functions should add
a matching `k.doorway(...)` call beside every such hole, using this spec's §3.1 method, at the
time they write the room — retrofitting it afterward means re-deriving 10 more tables like §3.2
by hand. Flag this explicitly to that implementer if the two pieces of work land separately.

`locker` (ship-roster.md §4): each deck is built with its own `Kit` instance
(`ships.js` §4 "merged separately... as a child group"), so each deck accumulates its own
`k.doors` array independently — `interior.decks[i].doors`, parallel to that deck's own
`colliders`/`interact` (ship-roster.md's own contract already establishes this per-deck
parallelism). The elevator landing hole on each deck ("a door hole in the aft wall at
`x: -0.8..0.8`", ship-roster.md §4) gets a `k.doorway(false, <that deck's aft wall c>, -0.8, 0.8)`
call on all three decks, same as any other doorway — riding the elevator and walking up to a
closed landing door that then opens for you is exactly the intended feel.

### 3.4 Open/close state machine (`js/game.js`)

New method, called from `update(dt)` when `this.mode === 'foot'` (auto-doors only matter to a
walking player — EVA and helm don't interact with interior doors), right after the existing
`if (this.mode === 'foot') { if (!this.breach) this.updateFoot(dt, input); }` line
(`game.js:690`):

```js
const OPEN_R = 1.6, CLOSE_R = 2.2;    // 0.6 m hysteresis gap — the "no flicker at the threshold" requirement
updateDoors(dt) {
  const p = this.player;
  for (const d of (this.interior.doors || [])) {
    const dx = p.x - (d.alongZ ? d.mid === undefined ? d.collider.x0 : (d.collider.x0 + d.collider.x1) / 2 : (d.collider.x0 + d.collider.x1) / 2);
    const dz = p.z - (d.collider.z0 + d.collider.z1) / 2;
    const dist = Math.hypot(dx, dz);
    if (dist < OPEN_R) d.targetOpen = true; else if (dist > CLOSE_R) d.targetOpen = false;
    const target = d.targetOpen ? 1 : 0;
    const wasOpening = d.t > 0.02;
    d.t = clamp(d.t + Math.sign(target - d.t) * dt / 0.35, 0, 1);   // 0.35 s full travel
    if (d.t > 0.02 && !wasOpening) audio.sfx('door');                // rising edge only, once per open/close cycle
    for (let i = 0; i < 2; i++) {
      const leaf = d.leaves[i], sign = i === 0 ? -1 : 1;
      const travel = d.t * (d.half + 0.05);
      if (d.alongZ) leaf.position.z = d.mid + sign * (d.half / 2 + travel);
      else leaf.position.x = d.mid + sign * (d.half / 2 + travel);
    }
  }
}
```

(Simplify the door-center lookup by storing `mid`/`c` directly on the door object at push time in
§3.1 rather than re-deriving it from the collider box — the pseudocode above spells out the
intent; the implementer should carry `c`/`mid` through cleanly rather than reverse-engineer it
from the collider bounds every frame.) Call `this.updateDoors(dt);` from `update(dt)` right after
`updateFoot` (only meaningful in foot mode, but cheap enough — a handful of doors per ship — to
just early-return via the `mode==='foot'` guard rather than skip the call entirely).

For `locker`, run `updateDoors` against `interior.decks[this.ship.deck].doors` instead of
`interior.doors` when `interior.decks` exists (same one-line substitution pattern ship-roster.md
already specifies for `nearestInteract`/`collideFoot`, ship-roster.md §4 point 1-2).

### 3.5 `collideFoot()` integration — one line

`collideFoot()` (`game.js:742-761`) currently loops `for (const b of this.interior.colliders || [])`.
Change the loop's source to include closed/closing doors:
```js
const cols = (this.interior.colliders || []).concat(
  (this.interior.doors || []).filter((d) => d.t < 0.6).map((d) => d.collider)
);
for (const b of cols) { /* body unchanged */ }
```
`t < 0.6` (not `0`) — a door still mostly shut should still block; only once it's substantially
open (60% of its travel) does the gap read as passable, matching the leaves' visual position at
that point. This is the only edit `collideFoot()` needs; every other line of its box-push math is
untouched, so its existing behaviour against furniture/wall colliders is fully preserved.

### 3.6 `walkCheck()` — no change, plus one new assertion

`walkCheck(I, ...)` (`ships.js:1461-1536`) floods `I.colliders` only — doors were never in that
array (§3.1: `k.doors` is separate from `k.colliders`), so **the existing connectivity check needs
zero edits** and keeps its current semantics: every doorway is treated as passable during the
offline reachability check, which matches the real runtime behaviour (the door will always have
opened by the time a walking player actually reaches it). Add one new, separate function in the
same file, run from `tools/test.mjs` rather than from inside `walkCheck` (keeping `walkCheck`'s
own 41-check baseline contract stable):

```js
export function checkDoors(I) {
  const problems = [];
  for (const d of (I.doors || [])) {
    const c = d.collider;
    if (!(c.x0 < c.x1 && c.z0 < c.z1)) problems.push(`door collider malformed: ${JSON.stringify(c)}`);
    // closed-door collider must exactly plug the gap the matching wall() hole left — no leak
    // around the edges for a determined player to slip through while the door is shut.
    for (const other of I.colliders) {
      const overlapX = Math.min(c.x1, other.x1) - Math.max(c.x0, other.x0);
      const overlapZ = Math.min(c.z1, other.z1) - Math.max(c.z0, other.z0);
      if (overlapX > 0.02 && overlapZ > 0.02) problems.push(`door at ${JSON.stringify(c)} overlaps a static collider`);
    }
  }
  return { ok: problems.length === 0, problems };
}
```

### 3.7 Tests

1. Every ship: `checkDoors(interior)` (and, for `locker`, each `interior.decks[i]`) returns
   `ok: true`.
2. Count check: `interior.doors.length` for the 5 existing ships equals the §3.2 table's per-ship
   counts (scout 1, racer 1, fighter 2, hauler 2, cruiser 13) — a plain regression guard so a
   future edit can't silently drop a door.
3. Drive `game` on foot toward a known door (e.g. scout's storage door): sample `door.t` each
   frame — assert it rises smoothly to 1 as the player closes to under `OPEN_R`, then falls back
   to 0 after walking away past `CLOSE_R`, and never oscillates (no frame-to-frame sign flip)
   while standing still at a distance between `OPEN_R` and `CLOSE_R` — the literal "no flicker at
   the threshold" check.
4. With the door held open (`door.t = 1`), assert `game.collideFoot()` does not push the player
   back when walking straight through the doorway's collider box; with it forced shut
   (`door.t = 0`), assert it does.
5. `audio.sfx('door')` fires exactly once per full open cycle and once per full close cycle, not
   once per frame while `dist < OPEN_R` (guards the rising-edge condition in §3.4).

## 4. Feature 3 — PICK UP

### 4.1 Why these props need their own build path

`Kit.build()` (`ships.js:177-209`) walks every `(geometry, matrix)` pair queued per-material via
`box()`/`put()`/`crate()` etc. and bakes them into one `BufferGeometry` — there is no way to move
one piece of that merged geometry at runtime; moving it means rebuilding the whole mesh. `Kit`
already has the alternative: `add(obj, x, y, z, ry, rx)` (`ships.js:132-137`) places a *standalone*
`THREE.Object3D` through the current frame without merging it — it's how signs, screens and lamps
already get individual identity. Pickupable props use `add()`, not `box()`/`put()`, and are
tracked in a new `k.pickups` array, parallel to `k.interact`.

### 4.2 Prop builders (`js/ships.js`)

Three prop kinds, deliberately small — this is knick-knacks you find lying around a room, not a
rebuild of the set dressing. "Posters" are read as a **rolled poster tube** prop (a loose item you'd
find on a desk or shelf), not the existing wall-mounted `poster()`/`textPoster()` decorations —
those stay exactly as they are, still baked into the merged wall geometry; re-plumbing an
already-hung wall poster into a movable object would mean reworking geometry this spec has no
reason to touch, and Gev's ask ("boxes or crates, or other things") reads as loose items, not
decor removal.

```js
function pickupProp(k, id, kind, x, y, z, weight, build /* (grp) => void, draws into a fresh THREE.Group */) {
  const grp = new THREE.Group();
  build(grp);
  const obj = k.add(grp, x, y, z);
  k.pickups.push({ id, kind, obj, weight, home: { x, y, z }, settled: true, vel: new THREE.Vector3() });
}
function pickupCrate(k, id, x, z, s, y = 0, col = C.wood) {
  pickupProp(k, id, 'crate', x, y + s / 2, z, 8, (g) => {
    const h = s / 2;
    g.add(new THREE.Mesh(BOX(), col)).scale.set(s, s, s);   // single un-merged box; simple crate visual, matches crate()'s silhouette at a fraction of the detail (individual-object budget, §4.9)
  });
}
function pickupMug(k, id, x, y, z, col = C.white) {
  pickupProp(k, id, 'mug', x, y, z, 0.3, (g) => {
    const body = new THREE.Mesh(CYL(10), col); body.scale.set(0.16, 0.12, 0.16); g.add(body);
    const handle = new THREE.Mesh(TOR(0.08, 0.015, 10), col); handle.position.set(0.1, 0, 0); handle.rotation.y = HP; g.add(handle);
  });
}
function pickupPoster(k, id, x, y, z, col = C.teal) {
  pickupProp(k, id, 'poster', x, y, z, 0.15, (g) => {
    const tube = new THREE.Mesh(CYL(8), col); tube.scale.set(0.05, 0.5, 0.05); tube.rotation.z = HP; g.add(tube);
  });
}
```

Add `this.pickups = [];` to `Kit`'s constructor. `buildInterior()`'s return object gets one
additive field: `pickups: k.pickups`.

**Where to place them** — swap a curated few of each existing static `crate(...)` call for
`pickupCrate(...)`, plus add one `pickupMug`/`pickupPoster` per ship interior; leave the rest of
the set dressing (the majority of `crate()` calls) as static merged geometry, per §4.9's budget.
Concretely, for the 5 existing ships: in `scoutRooms`, convert the pair at `ships.js:767`
(`crate(k, -2.3, 5.3, 1.0)`) to `pickupCrate(k, 'crate1', -2.3, 5.3, 1.0)`, and add
`pickupMug(k, 'mug1', -2.85, 0.9, 2.6)` near the storage lockers and `pickupPoster(k, 'poster1',
-2.7, 1.2, 5.3)` near the drone bay crates. Apply the same one-or-two-per-ship pattern in
`racerRooms`/`fighterRooms`/`haulerRooms`/`cruiserRooms` (the galley's existing decorative mugs at
`ships.js:999-1000` are the natural `pickupMug` candidates there) and in each of the 10 new ships'
room functions as they're written — this spec sets the pattern and budget, not an exhaustive
per-ship prop list.

### 4.3 Carry / throw / drop mechanics (`js/game.js`)

State on the game object: `this.carrying = null;` (init in the constructor, `game.js:72-97`).
`this.pickups`, a flat array assembled in `buildShip()` right after `this.interior = buildInterior(...)`
(`game.js:168`): `this.pickups = this.interior.pickups || [];` — then immediately apply any saved
per-ship positions (§4.5).

```js
nearestPickup() {
  const p = this.player;
  let best = null, bd = Infinity;
  for (const pu of this.pickups) {
    if (pu === this.carrying) continue;
    const dx = pu.obj.position.x - p.x, dz = pu.obj.position.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 1.6 || Math.abs(pu.obj.position.y - (p.y + 1.2)) > 1.8) continue;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    if (d > 0.4 && (dx * fx + dz * fz) / d < 0.2) continue;
    if (d < bd) { bd = d; best = pu; }
  }
  return best;
}
pickUp(pu) {
  if (pu.weight > 12) { this.ui.toast('Too heavy to lift.'); audio.sfx('deny'); return; }
  this.carrying = pu; pu.settled = false; pu.vel.set(0, 0, 0);
  audio.sfx('ui');
}
dropCarried(gentle = true) {
  if (!this.carrying) return;
  const pu = this.carrying; this.carrying = null;
  if (!gentle) return;   // thrown objects keep whatever velocity throwCarried() gave them
  pu.vel.set(0, 0, 0);
}
throwCarried() {
  if (!this.carrying) return;
  const pu = this.carrying; this.carrying = null;
  const p = this.player;
  const fwd = new THREE.Vector3(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
  pu.vel.copy(fwd).multiplyScalar(9); pu.vel.y += 2;
  audio.sfx('ui');
}
```

`interact()` (`game.js:393-418`) gets a new priority check ahead of its existing body — nothing
below the new block changes, so every existing interact id keeps working exactly as before
whenever no pickup is nearer:
```js
interact() {
  if (this.mode === 'helm') { this.standUp(); return; }
  if (this.mode === 'eva') {
    if (this.evaNearHole()) { this.reenter(); return; }
    if (this.carrying) { this.dropCarried(); return; }
    const pu = this.nearestEvaPickup();           // §4.4
    if (pu) { this.pickUp(pu); return; }
    return;
  }
  if (this.mode !== 'foot') return;
  if (this.carrying) { this.dropCarried(); return; }
  const pu = this.nearestPickup();
  const it = this.nearestInteract();
  if (pu && (!it || true)) {                       // a pickup, when in range at all, takes priority over a same-spot fixture
    this.pickUp(pu); return;
  }
  if (!it) return;
  // ... existing switch(it.id) body, unchanged ...
}
```
Bindings: **key** `E` (reused, contextual — pick up / drop, matching every other on-foot
interact); **click** left-click while carrying = `throwCarried()` (left-click is currently unbound
in foot mode — `mousedown`'s handler at `game.js:311-315` only acts in `drone` mode — so this is a
genuinely free binding, no conflict); **gamepad** A (button 0, already wired to `interact()` in
§1) for pick-up/drop, RT (button 7, already wired to `throwCarried()` in §1) for throw.

### 4.4 Physics — gravity, floor/wall collision, rest, stacking

New per-frame method, called from `update(dt)` (`game.js:696`, alongside `this.collide(ctx, dt)`),
gated to `this.mode !== 'title'`:
```js
updatePickups(dt) {
  for (const pu of this.pickups) {
    if (pu === this.carrying) {
      const p = this.player;
      const target = new THREE.Vector3(p.x - Math.sin(p.yaw) * 0.9, p.y + 1.35, p.z - Math.cos(p.yaw) * 0.9);
      pu.obj.position.lerp(target, 1 - Math.exp(-10 * dt));   // damped follow, no snap-pop
      continue;
    }
    if (pu.settled) continue;
    pu.vel.y -= 9.8 * dt;                                     // interior gravity; EVA salvage skips this, §4.4.1
    pu.obj.position.addScaledVector(pu.vel, dt);
    const R = 0.2;
    for (const b of this.interior.colliders || []) {           // reuse the exact same box math as collideFoot()
      const cx = clamp(pu.obj.position.x, b.x0, b.x1), cz = clamp(pu.obj.position.z, b.z0, b.z1);
      const dx = pu.obj.position.x - cx, dz = pu.obj.position.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < R * R && d2 > 1e-9) { const d = Math.sqrt(d2); pu.obj.position.x = cx + dx / d * R; pu.obj.position.z = cz + dz / d * R; pu.vel.x = pu.vel.z = 0; }
    }
    let floorY = 0;
    for (const other of this.pickups) {                        // stacking: rest on top of another settled pickup if overlapping in XZ
      if (other === pu || !other.settled) continue;
      const dx = pu.obj.position.x - other.obj.position.x, dz = pu.obj.position.z - other.obj.position.z;
      if (Math.hypot(dx, dz) < 0.3) floorY = Math.max(floorY, other.obj.position.y + 0.15);
    }
    if (pu.obj.position.y <= floorY) { pu.obj.position.y = floorY; pu.vel.y = Math.max(0, pu.vel.y); }
    if (pu.vel.lengthSq() < 0.02) { pu.settleT = (pu.settleT || 0) + dt; if (pu.settleT > 0.15) { pu.settled = true; pu.vel.set(0, 0, 0); pu.settleT = 0; } }
    else pu.settleT = 0;
  }
}
```
Weight limit is enforced at pick-up time only (§4.3's `pickUp()` guard, 12 kg cap); thrown/dropped
objects don't need a runtime weight check since they're never being lifted while in flight.

#### 4.4.1 EVA loose cargo — reusing the breach debris

`pullBreach()` already spawns 30 decorative debris chunks around the player
(`game.js:1459-1466`), currently all despawned after 4 s of EVA time
(`updateBreach`, `game.js:1496`). Reserve 2 of the 30 as real pickups instead of plain decoration:
build them with `pickupCrate`-equivalent geometry (a small standalone mesh, not the shared
`this.debrisGeo` merged look the other 28 use) and register them in `this.pickups` with
`kind: 'salvage'`, weight 10, tagged so the existing despawn loop skips them:
```js
if (i < 2) { const pu = { id: `salvage-${this.t}-${i}`, kind: 'salvage', obj: m, weight: 10, settled: false, vel: new THREE.Vector3(), zeroG: true }; this.pickups.push(pu); }
```
`updatePickups()` skips the gravity line (`pu.vel.y -= 9.8*dt`) and the floor-collider loop
entirely when `pu.zeroG` is set — space debris drifts in a straight line once thrown, never
settles, and the existing `updateBreach` debris-despawn loop (`game.js:1496`) gets one added
condition, `pu.kind !== 'salvage'`, so salvage survives past the normal 4 s cleanup.
`nearestEvaPickup()` mirrors `nearestPickup()`'s distance/facing check but against
`this.pickups.filter(pu => pu.zeroG)` and the player's EVA position (`this.eva.rel`) instead of
`this.player`. Carrying salvage back through a hatch/breach and calling `reenter()` should
re-parent it from `zeroG` free flight back onto the interior's own gravity rules — set
`pu.zeroG = false` inside `reenter()` for whatever `this.carrying` holds at that moment, right
before the mode switches back to `'foot'`.

### 4.5 Persistence — per ship, position only

Extend `freshSave()`/`upgradeSave()` (`game.js:55-70`) with one new field: `pickups: {}` (keyed
`state.pickups[shipType][pickupId] = {x, y, z}`). Velocity is **not** persisted — a reload always
presents every pickup at rest wherever it last settled; a load mid-throw simply resumes as "already
landed there," which is an honest, stated simplification rather than a half-built physics replay.
Write it inside the existing `persist()` (`game.js:255-265`), one loop over `this.pickups.filter(p
=> p.settled && !p.zeroG)` (salvage/zero-g objects aren't ship-specific, so they're excluded).
Apply it inside `buildShip()` right after assembling `this.pickups` (§4.3): for each entry with a
saved position, `pu.obj.position.set(x, y, z); pu.settled = true;` — objects with no saved entry
keep the position they were built at (their `home`).

### 4.6 Audio

No new sfx: pick-up/drop/throw reuse the existing `ui` sfx (a light click, already used for every
other minor confirm in the game — `case 'helm': this.setMode('helm'); audio.sfx('ui');`,
`game.js:401`) rather than inventing new sound assets for what is a small, frequent action; adding
a distinct synth voice for every prop touch would be audibly busier than the existing sound
palette, which reserves its bigger cues (`seal`, `breach`, `door`) for state changes the player
needs to notice, not routine handling.

### 4.7 Chromebook / triangle budget

Each `pickupProp` is one extra draw call (it's deliberately **not** merged — that's the entire
point of it being movable). §4.2's shapes are single-digit-triangle boxes/cylinders/toruses; with
the "a couple per ship" placement guidance in §4.2, this adds roughly 3-6 draw calls per ship
interior, well inside the existing "cruiser interior under 30k triangles, others under 12k"
budget (`docs/PLAN.md` §2 actors budget table) — draw-call count, not triangle count, is the real
Chromebook-GPU cost here, and this spec deliberately keeps that count in the single digits per
ship rather than converting every static crate.

### 4.8 Tests

1. Every ship: `interior.pickups.length >= 2` (at least one crate and one mug/poster present).
2. On foot, walk into range of a pickup, call `game.interact()` — assert `game.carrying` is that
   pickup and `game.pickups` still contains it (not removed, just held); call `game.interact()`
   again — assert `game.carrying === null` and the object's `vel` is zero (gentle drop).
3. Pick up an object, call `game.throwCarried()` — assert `game.carrying === null` and the
   object's `vel.length()` is close to the 9 (forward) / 2 (up) magnitudes from §4.3, then step
   frames and assert its `y` position rises then falls under gravity and eventually settles
   (`pu.settled === true`) at `y` close to 0 (or to another settled pickup's stack height, if one
   was placed underneath it for the test).
4. Weight limit: construct a mock pickup with `weight: 20`, call `game.pickUp(mock)` — assert
   `game.carrying` stays `null` and a `deny` sfx fired.
5. Save/load: settle a pickup at a distinct position, call `game.persist()`, rebuild the ship
   (`game.buildShip(game.ship.type)`), assert the same-id pickup's position matches within 0.05 u.
6. EVA salvage: after a hull breach (existing accident path, unmodified), assert exactly 2 of
   `game.pickups` have `zeroG: true` and `kind: 'salvage'`, and that they are excluded from the
   existing 4 s despawn (`game.breach.bits.length` drops by 28, not 30, after `t > 4`).

## 5. Combined keybinding table

| Action | Key | Click | Gamepad | Mode |
|---|---|---|---|---|
| Eject (arm, then confirm) | `Z` ×2 within 3 s | — | Y / Triangle ×2 within 3 s | helm |
| Eject hatch: look override | — (mouse-look pitch at the moment of confirming) | — | — | helm |
| Flip eject switch | `E` (walk up to it) | — | A / Cross | foot |
| Climb back in (either hatch) | `E` near a hatch | — | A / Cross | eva |
| Pick up / drop | `E` | — | A / Cross | foot, eva |
| Throw | — | left-click while carrying | RT / R2 | foot, eva |

`Z`, left-click-in-foot-mode, and the entire Gamepad API surface were all previously unbound —
confirmed against the full `onKey` switch (`game.js:342-361`) and the `mousedown` handler
(`game.js:311-315`) read this session. No existing binding is reassigned or shadowed.

## 6. Files touched

- `js/ships.js`: `hatchMesh()`, `Kit.doorway()`, `pickupProp()`/`pickupCrate()`/`pickupMug()`/
  `pickupPoster()` (new functions); `Kit` constructor gains `this.doors = []`/`this.pickups = []`;
  `cockpit()` gains the eject button/switch props (§2.2.3, additive, inside the existing
  function); `buildExterior()` gains the hatch raycast + `hatches` return field (§2.2.1-2.2.2,
  additive); `buildInterior()`'s return object gains `doors`/`pickups`/`ejectButton` (additive);
  every room function (`scoutRooms`, `racerRooms`, `fighterRooms`, `haulerRooms`,
  `cruiserRooms`) gains the `k.doorway(...)` calls from §3.2 and a couple of `pickupCrate`/
  `pickupMug`/`pickupPoster` calls from §4.2, both additive beside existing calls — no existing
  line in any room function is removed or renumbered. `walkCheck()` itself: unchanged. New
  exported `checkDoors()`.
- `js/game.js`: `pollGamepad()`, `ejectPilot()`, `updateEject()`, `updateDoors()`,
  `updatePickups()`, `nearestPickup()`, `nearestEvaPickup()`, `pickUp()`, `dropCarried()`,
  `throwCarried()` (new methods, called from `update(dt)`); `evaNearHole()`/`reenter()` extended
  with an `if (this.eject) {...}` branch each, existing bodies otherwise untouched (§2.3.3);
  `interact()` gains the pickup-priority check ahead of its existing switch, and one new
  `'ejectSwitch'` case inside that switch; `onKey()` gains one `case 'KeyZ'`; `buildShip()` gains
  `ejectHatch: 'top'` on the ship object literal and assembles `this.pickups` + applies saved
  positions; `freshSave()`/`upgradeSave()`/`persist()` gain the `pickups` save field.
- `js/audio.js`: one new `SFX` entry (`eject`) + its `sEject` synth function. No other change —
  `door`/`seal`/`ui`/`deny` are all reused as-is for doors and pickups.
- `js/ui.js`: `keysFor('helm')` gains the `Z eject` clause. No other change — pickup/door prompts
  reuse the existing `h-prompt`/`nearestInteract`-style label mechanism, since pickups get their
  own label the same way every `interact` entry already does.
- No changes to `js/universe.js`, `js/render.js`, `js/mats.js`, `js/media.js`.

## 7. Test plan summary

Baseline per ship-roster.md §6 is **≥54/55** once part 1 lands (40 existing, minus the known
unrelated Mars-autopilot failure, plus part 1's own new checks). This spec adds, on top of that:
§2.7 (6 checks, ×15 ships where per-ship), §3.7 (5 checks, ×15 ships + locker's 3 decks for #1-2),
§4.8 (6 checks, ×15 ships where per-ship). Run `node tools/test.mjs` at the end and require every
count at or above whatever part 1 leaves the suite at — never fewer passing than the baseline this
spec started from.
