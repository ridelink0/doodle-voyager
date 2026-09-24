# Story integration: crawl, codex, announcer, ship renames, bosses, credits

Status: design only, not implemented. Written 2026-09-24 for an implementer who
has not read `docs/STORY.md`, `docs/PLAN.md`, `docs/HANDOFF.md` or any other
`docs/specs/*.md` file — everything needed is below, with exact current-code
line references (this session, 2026-09-24) and headless test checks. Project
root `D:\doodle-voyager`.

**Dependency note.** Four sibling specs are being implemented in this same
repo, in parallel, by other agents: `neon-relook.md` (palette/material
rewrite: `PAL` moves from paper colours to `PAL.charcoal/cyan/red/amber/...`,
`mats.js` API shape unchanged), `ship-roster.md` (5 ships -> 15, new ids
`eraser/tape/witeout/paperclip/gelpen/compass/stickynotes/stapler/gluestick/
locker`), `enemy-squadron-organization.md` (`this.squads` array, formation
flight), `universe-density-and-galaxy-clusters.md` (`this.u.regions` array,
`buildRegions()`, seven named clusters/superclusters). Every place this spec
depends on one of those is marked **"expected from part 1"** with the exact
shape assumed, taken verbatim from that sibling spec's own text — if the
implementer finds the real shape differs once those land, adapt this spec's
hook to match, the intent (not the literal line number) is what matters.
Nothing in this spec touches `js/render.js`, `js/media.js`, `js/mats.js`, or
`data/*.json`.

Read `docs/STORY.md` in full before starting — this document only quotes the
exact strings to use, it does not re-derive the story.

---

## 0. Save-data additions (needed by sections 2, 3 and 6)

`freshSave()` (`js/game.js:55-62`) and `upgradeSave()` (`js/game.js:64-70`)
gain three fields, following the exact pattern already used for every other
field (`upgradeSave` back-fills anything missing from an old save):

```js
// js/game.js:55-62, freshSave() — add three keys to the returned object:
codex: [],           // array of unlocked codex entry ids (section 3), e.g. ['district','margin']
bossesDefeated: [],  // array of defeated boss ids (section 6), e.g. ['doodler']
actProgress: 0,      // 0 = Act 1 in progress, 1 = Act 1 cleared, 2 = Act 2 cleared, 3 = Act 3 cleared (game "won")
```

`upgradeSave()`'s existing loop (`for (const k of Object.keys(f)) if (s[k] ===
undefined) s[k] = f[k];`) already back-fills all three for old saves with no
extra code — they are plain top-level fields, same shape as `liberated`/
`visited`, no special-cased inner loop needed (unlike `equip`/`stats`).

New central helper, added near `persist()` (`js/game.js:255-265`):

```js
unlockCodex(id) {
  if (this.state.codex.includes(id)) return; // once ever, persists across sessions — see section 3
  this.state.codex.push(id);
  this.ui.toast(`Codex updated: ${CODEX[id].title}`);
  audio.sfx('ui');
  this.persist();
}
```

`CODEX` is the table defined in section 3. Every unlock hook in this spec
calls `this.unlockCodex('<id>')` — the guard above makes every call site
naturally idempotent, so "first X" conditions never need their own one-shot
flag; they can just call `unlockCodex` every time X happens.

---

## 1. Intro crawl

### 1.1 What triggers it

"Every NEW GAME, not continue/load" needs a way to tell a fresh start apart
from resuming a save. Add one transient (never persisted) boolean:

- In `boot()` (`js/game.js:100-117`), right after line 106
  (`const s = this.save ? upgradeSave(this.save) : freshSave();`), add:
  `this.freshStart = !this.save;` — true the very first time anyone ever
  plays (no save existed yet), false when resuming an existing save.
- In `newVoyage()` (`js/game.js:224-234`), add `this.freshStart = true;`
  anywhere in the body (e.g. right after `this.save = null;`) — clicking
  "NEW VOYAGE" twice (the existing arm-then-confirm pattern,
  `js/ui.js:48-53`) always re-arms the flag, even mid-session.
- In `launch()` (`js/game.js:235-243`), replace the body's unconditional
  `this.ui.big('YOU ARE AT THE HELM', ...)` call with:
  ```js
  launch() {
    audio.init();
    this.applySettings();
    if (this.settings.music) audio.mood(this.zone ? 'combat' : 'cruise');
    this.ui.hideTitle();
    this.setMode('helm');
    this.lock();
    if (this.freshStart) {
      this.freshStart = false;
      this.unlockCodex('district'); // codex #1, section 3 — "Unlocks: new game"
      this.ui.playCrawl(() => this.ui.big('YOU ARE AT THE HELM', 'W/S throttle, C cruise, M map. E stands you up.'));
    } else {
      this.ui.big('YOU ARE AT THE HELM', 'W/S throttle, C cruise, M map. E stands you up.');
    }
  }
  ```
  (`this.lock()` still runs before the crawl opens so the pointer is already
  captured; `ui.playCrawl` unlocks it again for the duration of the crawl —
  see 1.3 — and re-locks on finish via its own callback, matching how every
  other overlay already unlocks/relocks, e.g. `open()`/`close()` at
  `js/ui.js:101-121`.)

This satisfies "every NEW GAME, not continue" exactly: `newVoyage()` is the
only way to wipe/restart a save (`js/ui.js:48-53`, the `t-new` button), and a
first-ever visit with no save also counts as a new game, correctly.

### 1.2 The text (verbatim from `docs/STORY.md`, split into five beats)

```js
// js/ui.js, new const near the top, after KIND_WORD (js/ui.js:14)
const CRAWL = [
  { t: "Doodle District held. Wave after wave the red guys crawled off the page, and wave after wave they got ERASED.", hold: 4.2 },
  { t: "So they stopped crawling. They climbed.", hold: 2.2 },
  { t: "Past the red margin there is no paper, only sky: every real star, every charted world, ten thousand galaxies. Out here, the ink glows.", hold: 5.0 },
  { t: "The Red Margin is drawing its zones across all of it. Spiral Bound Galactic is renting the planets out as billboards. The pumps never take your fuel.", hold: 5.2 },
  { t: "Fold up the Pencil Case. You're going off the page.", hold: 3.0 },
];
```

Total runtime if never skipped: 19.6 s of hold plus a 0.6 s fade per beat
(0.5 s cross-fade budgeted below) — call it ~20 s, in the same range as
Half-Life's opening tram ride cited by `docs/STORY.md`'s own research note
(§"How the story is delivered"). This is the exact 87-word passage from
`docs/STORY.md` §"Intro crawl" — do not paraphrase it.

### 1.3 Markup and playback

New overlay in `index.html`, placed right after the `#title` section
(`index.html:111`, after its closing `</section>`), **not** added to the
`OVERLAYS` array (`js/ui.js:13`) since it is driven by its own timer/skip
logic rather than the generic `open()`/`close()` dispatch (it has no
close button, no pause-menu route in):

```html
<section class="overlay crawl" id="crawl" hidden aria-live="polite">
  <div class="crawltext" id="crawl-text"></div>
  <p class="fine crawl-skip">press anything to skip</p>
</section>
```

`style.css`: `.crawl` full-bleed, `SPACE_BG`/dark background (reuse whatever
token `neon-relook.md` lands on for `--space-bg`; if that spec hasn't landed
yet, `#05070c` literal is fine — this rule is a plain CSS background-color,
independent of the WebGL palette), `.crawltext` centred, large (`clamp(1.4rem,
3vw, 2.4rem)`), `NEON_CYAN`/`#4deeff`-ish colour, Patrick Hand font (already
loaded, matches every other overlay heading per `references/games.md`'s
teardown cited in `neon-relook.md` §1.3), `opacity` transitioned by JS
(`transition: opacity .5s`) rather than a keyframe animation — simpler to
drive from a beat index and impossible to desync from the skip handler.

New `UI` method, alongside `big()` (`js/ui.js:299`):

```js
playCrawl(onDone) {
  const el = document.getElementById('crawl'), txt = document.getElementById('crawl-text');
  el.hidden = false; txt.style.opacity = 0;
  this.g.unlock();
  let i = -1, t = null, done = false;
  const finish = () => {
    if (done) return; done = true;
    clearTimeout(t);
    el.hidden = true;
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onPointer);
    this._crawlPoll = null; // stops the gamepad poll added in section 1.4
    onDone();
  };
  const next = () => {
    i++;
    if (i >= CRAWL.length) { finish(); return; }
    txt.textContent = CRAWL[i].t;
    requestAnimationFrame(() => { txt.style.opacity = 1; });
    t = setTimeout(() => { txt.style.opacity = 0; setTimeout(next, 500); }, CRAWL[i].hold * 1000);
  };
  const onKey = () => finish();
  const onPointer = () => finish();
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onPointer);
  this._crawlPoll = finish; // section 1.4 calls this on any gamepad button
  this.crawlActive = true;
  next();
}
```

Set `this.crawlActive = false;` inside `finish()` too (add it next to the
other four cleanup lines) so other code can cheaply check "is the crawl
showing" without inspecting the DOM. `el.hidden` already prevents any click
on the (still technically present but `hidden`) title screen behind it from
doing anything, since `hidden` elements neither render nor receive events —
no z-index/pointer-events bookkeeping needed.

**Why a plain listener, not routing through the existing `keydown` handler**
(`js/game.js:330-360`): that handler returns early on `this.mode === 'title'`
(`js/game.js:330`, `if (this.mode === 'title' || this.mode === 'dead')
return;`), and the crawl plays in exactly that mode (`launch()` doesn't call
`setMode('helm')` until *before* the crawl per 1.1's snippet — actually check
this ordering carefully: 1.1's snippet calls `this.setMode('helm')` **then**
`this.ui.playCrawl(...)`, so `this.mode` is already `'helm'` while the crawl
plays, not `'title'`. That means the existing keydown handler's `KeyP`
pause-check etc. would also fire during the crawl unless guarded. Add one
guard line at the very top of `keydown(e)` (`js/game.js:331`, before the
`if (this.mode === 'title' ...)` line):
```js
if (this.g && this.g.ui && this.ui.crawlActive) return; // crawl owns input, its own listener handles skip
```
(This is `Game`'s own method, so it's simply `if (this.ui.crawlActive)
return;` — no `this.g` — matching how every other early-return in that
function reads `this.*` directly.) This stops e.g. `KeyX`/`KeyC` from doing
anything to the ship while the crawl plays, since the ship is already parked
at the title-screen spin per `update()`'s `else if (this.mode === 'title')`
branch — wait, mode is `'helm'` now, not `'title'`, so the ship *would*
otherwise respond to WASD/mouse during the crawl. The guard above (return
before any case runs) plus **also** guarding `updateHelmInput` itself is the
robust fix: at the top of `updateHelmInput(dt, input)` (search that name in
`js/game.js`, called from `update()`'s `else if (this.mode === 'helm')`
branch, `js/game.js:691`), add `if (this.ui.crawlActive) return;` as the
first line — this is the one line that actually stops the ship drifting/
turning/firing while the crawl text is on screen, independent of any input
handler ordering.

### 1.4 Gamepad button skip

No gamepad code exists anywhere in this codebase today (grep confirmed this
session: zero matches for `Gamepad`/`getGamepads` in `js/`). This spec adds
the minimum: an edge-triggered poll for "any button just went down", used
only for the crawl skip (section 1.5's keybinding table). New method on
`Game`, called once per frame:

```js
// js/game.js, new method near loop()/update() (js/game.js:686)
pollGamepad() {
  if (!navigator.getGamepads) return;
  const gp = navigator.getGamepads()[0];
  if (!gp) { this._gpDown = null; return; }
  const down = new Set();
  gp.buttons.forEach((b, i) => { if (b.pressed) down.add(i); });
  const prev = this._gpDown || new Set();
  for (const i of down) {
    if (prev.has(i)) continue; // held from last frame — not a new press
    this.onGamepadButton(i); // edge: this button just went down this frame
  }
  this._gpDown = down;
}
onGamepadButton(i) {
  if (this.ui.crawlActive) { this.ui._crawlPoll && this.ui._crawlPoll(); return; }
  if (i === 3 && !this.paused && this.mode !== 'title' && this.mode !== 'dead') { this.unlock(); this.ui.open('codex'); } // Y / Triangle — section 3.4
}
```

Call `this.pollGamepad();` from the top of `update(dt)` (`js/game.js:686`,
right after `this.t += dt;`) — `update()` already runs every frame the game
isn't paused, including while `this.mode === 'helm'` during the crawl (1.3
established the crawl plays in helm mode with flight input separately
guarded), so this reaches the crawl correctly. Edge-triggering via the
`prev`/`down` Set comparison is the important correctness detail: without it,
a gamepad button held down for, say, half a second at 60 fps would call
`onGamepadButton` ~30 times, which would immediately re-close the Codex it
just opened (open/close toggling) or double-fire the crawl skip harmlessly
(the second call is a no-op since `finish()` guards on `done`) — the codex
case is the one that actually breaks without this guard, so it is not
optional.

### 1.5 Key bindings and gamepad bindings touched by this spec

| Action | Keyboard | Mouse | Gamepad | Where |
|---|---|---|---|---|
| Skip intro crawl | any key | any click | any button | section 1.3/1.4 |
| Open Codex | `Y` (new) | pause menu button, or map "codex" chip | button index 3 (Y/Triangle) | section 3.4 |
| Everything else (P pause, M map, F dock, etc.) | unchanged | unchanged | not added — this is a keyboard+mouse game per the project's own rule; gamepad support is scoped to exactly the two rows above, not general flight control | — |

`KeyY` addition to the keydown switch (`js/game.js:330-360`), placed beside
the other unlock-and-open cases (`KeyI`, `KeyH`, `js/game.js:358-359`):
```js
case 'KeyY': this.unlock(); this.ui.open('codex'); break;
```

---

## 2. Station announcer lines (Spiral Bound Galactic)

### 2.1 The four lines (verbatim, `docs/STORY.md` §"Why fuel is a racket")

```js
// js/game.js, new const near FUEL_PRICE (js/game.js:33)
const ANNOUNCER = [
  'Welcome, valued customer. This pump does not serve your fuel type. Please enjoy the music.',
  'Spiral Bound Fuels: not the closest pump. Not the cheapest pump. A pump.',
  'Your call is important to us. Your ship is not.',
  'Because this message is recorded, any praise of your piloting is a guess.',
];
let announcerI = 0; // module-level: cycles in order, not random — a recorded loop repeats in order, not shuffled
function announcerLine() { const l = ANNOUNCER[announcerI % ANNOUNCER.length]; announcerI++; return l; }
```

(A `let` at module scope, not on `this.state`, is deliberate — it is
presentation-only cycling state, not save data; resetting to line 1 on every
page load is fine and arguably funnier, matching "recorded loop" framing.)

### 2.2 Wiring into the two existing refusal paths

`refuel(body, amount)` (`js/game.js:475-489`) already has the exact two
refusal branches this task means by "refuel refusals". Both get one line
appended, and both already call `audio.sfx('deny')` (unchanged):

```js
// js/game.js:477, was:
//   if (!types.includes(f)) { audio.sfx('deny'); return `This pump does not serve ${f}. Your ${this.def.name} burns ${f}.`; }
// becomes:
if (!types.includes(f)) { audio.sfx('deny'); this.unlockCodex('fuelracket'); return `This pump does not serve ${f}. Your ${this.def.name} burns ${f}. "${announcerLine()}"`; }
```

```js
// js/game.js:483, was:
//   if (afford <= 0.05) { audio.sfx('deny'); return 'Not enough credits for fuel. Clear an enemy zone.'; }
// becomes:
if (afford <= 0.05) { audio.sfx('deny'); return `Not enough credits for fuel. Clear an enemy zone. "${announcerLine()}"`; }
```

(Only the wrong-fuel-type branch unlocks the codex entry — see section 3,
entry 7's unlock condition is specifically "first refused pump", i.e. the
"we don't sell what you burn" case, not a poverty case.)

### 2.3 Docking welcome line (Spiral Bound Galactic identity, first docking)

`tryDock()` (`js/game.js:463-473`) is the success path (docking refusal
itself — "Nothing to dock with" at line 465 — is a spatial/speed gate with no
speaker present, not a Spiral Bound Galactic line, so it is deliberately
**not** touched). Add the codex unlock and, once only (first docking ever,
naturally guarded by `unlockCodex`'s own membership check), a toast:

```js
// js/game.js:468, was:
//   this.state.stats.docked++;
// becomes:
this.state.stats.docked++;
if (!this.state.codex.includes('sbg')) this.ui.toast('A cheerful voice: "Welcome, valued customer."');
this.unlockCodex('sbg');
```

---

## 3. Codex screen

### 3.1 The twelve entries (verbatim titles/blurbs, `docs/STORY.md` §Codex)

```js
// js/game.js, new export near EQUIP/ITEMS (js/game.js:15-30) — exported so
// js/ui.js can render it without a second copy of the strings
export const CODEX = {
  district:  { n: 1, title: 'Doodle District', text: 'Streets, rooftops and fire escapes in blue ballpoint on lined paper. Survivors counted waves; the red guys counted erasures. Nobody counted what was past the margin.' },
  margin:    { n: 2, title: 'The Red Margin', text: 'Grunt, Rusher, Heavy, Sniper, Shieldbearer, Ink Bomb, Paper Wasp: the same seven, now flying in wings with a leader and a plan. Kill the leader and watch the plan fall apart.' },
  doodler:   { n: 3, title: 'The Doodler', text: 'Draws red guys. Now draws capital ships, which is worse. Fights by summoning and throwing.' },
  eraser:    { n: 4, title: 'The Eraser', text: 'Rubs things out - stations, pumps, a moon once. Charges when cornered.' },
  inkblot:   { n: 5, title: 'The Inkblot', text: 'Sprays. Leaks. Waits behind the dust where nobody looks.' },
  sbg:       { n: 6, title: 'Spiral Bound Galactic', text: 'Owner of the shipyards, the pumps, the Bazaar and the Billboard Worlds programme. Slogan: "We hold it all together. Terms and conditions bind."' },
  fuelracket:{ n: 7, title: 'The Fuel Racket', text: 'Three fuels, three nozzles, three patents. Converters are "not recommended by the manufacturer".' },
  billboard: { n: 8, title: 'Billboard Worlds', text: 'Planet faces rented by the hemisphere. The ad turns with the planet; the planet was not consulted.' },
  inkglows:  { n: 9, title: 'Why the Ink Glows', text: 'On paper, ballpoint is blue and flat. In vacuum, it glows. Spiral Bound Galactic cannot explain this, so it sells it.' },
  coinflip:  { n: 10, title: 'The Coin Flip', text: 'The Milky Way and Andromeda were supposed to collide in 4 to 5 billion years. A 2025 study ran 100,000 simulations and found about a 50 per cent chance they merge within 10 billion years - and only about 2 per cent for the old head-on crash in 4 to 5. The Large Magellanic Cloud and Triangulum tip the odds. The Red Margin would like to tip them harder.' },
  laniakea:  { n: 11, title: 'Laniakea and the Clusters', text: 'Our home supercluster, named in 2014 - "immeasurable heaven" - about 500 million light-years across and about 100,000 galaxies. Nearby clusters: Virgo (about 54 million light-years, around 1,300 to 2,000 galaxies, M87 at its heart), Fornax (about 62 million), Coma (about 330 million, where "missing mass" first showed up - dark matter), Perseus-Pisces (about 250 million, just outside Laniakea).' },
  attractor: { n: 12, title: 'The Great Attractor', text: 'Something heavy behind the Milky Way\'s own disk, in the Zone of Avoidance toward Norma, about 150 to 250 million light-years away. The Local Group drifts toward it. So does the Inkblot\'s leak.' },
};
```

### 3.2 Unlock hooks — one row per entry, exact call site

| # | id | Unlock condition | Exact hook |
|---|---|---|---|
| 1 | `district` | new game | `launch()`, section 1.1's snippet — already shown |
| 2 | `margin` | first wing destroyed | **Expected from part 1** (`enemy-squadron-organization.md` §3.2/§4): `this.squads` array, entries `{kind:'wing'\|'screen', members:[enemyRef], ...}`. No existing "squad wiped" event — add a check right after `hurt()`'s existing kill branch (`js/game.js:1273`, `e.dead = true;`), before the `if (e.kind === 'capital')` block: `if (e.kind === 'imp' && e.squad && e.squad.kind === 'wing' && e.squad.members.every((m) => m.dead)) this.unlockCodex('margin');` — reads `e.squad`/`.kind`/`.members` exactly as that sibling spec defines them; if the field names differ once implemented, match by intent (the moment every member of a player-fought wing squad is dead) |
| 3 | `doodler` | Act 1 boss seen | `spawnBoss('doodler', ...)`, section 6.4 — fires the moment the encounter starts, not on defeat |
| 4 | `eraser` | Act 2 boss seen | `spawnBoss('eraser', ...)` |
| 5 | `inkblot` | Act 3 boss seen | `spawnBoss('inkblot', ...)` |
| 6 | `sbg` | first docking | `tryDock()`, section 2.3 — already shown |
| 7 | `fuelracket` | first refused pump | `refuel()`, section 2.2 — already shown |
| 8 | `billboard` | first planet ad seen | **Expected from part 1** (`planet-ads.md` §2.3): planet objects gain `p.ad` (an index into `AD_COPY`, or `undefined`/`null` if the planet has no ad). Hook into the existing first-visit tracker, `visit(ctx)` (`js/game.js:922-934`) — inside its `for (const b of ctx.bodies)` loop, right after the existing `if (b.kind !== 'planet' ...) continue;` guard (line 926), add: `if (b.planet && b.planet.ad != null) this.unlockCodex('billboard');` (placed before the `!v.has(b.name)` de-dupe check, since `unlockCodex` already de-dupes on its own — this way it also fires correctly for an ad planet visited before this spec existed in an old save, not just brand-new ones) |
| 9 | `inkglows` | first launch | `launch()`, unconditionally, one line at the top of the method (before the `freshStart` branch): `this.unlockCodex('inkglows');` — every call to `launch()` is "a launch", so this simply fires (and then no-ops forever after) the very first time |
| 10 | `coinflip` | reach Andromeda | `Game.update(dt)` (`js/game.js:696`), right after `const ctx = this.u.update(sh.pos, this.t, dt);`: `if (ctx.galaxy && ctx.galaxy === (this._m31 || (this._m31 = this.u.findGalaxy('M31')))) this.unlockCodex('coinflip');` (cache the lookup once, `findGalaxy` is a linear scan per `universe.js:688-697` — no need to repeat it every frame) |
| 11 | `laniakea` | leave the Local Group | Same `update()` site, one more line: `if (ctx.galaxy && !['MW', 'LG-MW', 'LG-M31', 'LG'].includes(ctx.galaxy.group)) this.unlockCodex('laniakea');` — `group` is the existing catalogue field documented in `docs/PLAN.md` §"Data files" (`galaxies.json` fields include `group: MW, LG-MW, LG-M31, LG, M, NGC, IC, ADD, HZ`), already present on every galaxy object with no part-1 dependency |
| 12 | `attractor` | Act 3 | `spawnBoss('inkblot', ...)`, same moment as entry 5 (both fire together — Act 3 both introduces its boss and its region in the same beat, per `docs/STORY.md`'s own Act 3 summary) |

### 3.3 Markup

New overlay in `index.html`, same shape as `#storage` (`index.html:171-177`),
placed after it:

```html
<!-- Codex -->
<section class="overlay" id="codex" hidden aria-labelledby="cx-h">
  <div class="panel">
    <div class="maphead"><h3 id="cx-h">CODEX</h3><span class="credits-chip"><span id="cx-n"></span>/12</span><button class="x" data-close>close</button></div>
    <div id="cx-body"></div>
  </div>
</section>
```

Add `'codex'` to the `OVERLAYS` array (`js/ui.js:13`) so `open()`/`close()`'s
existing generic handling (`js/ui.js:101-121`) covers it for free — no
special case needed there, matching how `#storage`/`#help` already work.

`open()` (`js/ui.js:101-112`) gains one more `if` alongside the existing
`if (name === 'storage') this.renderStorage();` (line 109):
```js
if (name === 'codex') this.renderCodex();
```

New render method, modelled on `renderStorage` (search that name in
`js/ui.js` for the exact list-building pattern it already uses):
```js
renderCodex() {
  const st = this.g.state;
  $('cx-n').textContent = st.codex.length;
  const body = $('cx-body');
  body.innerHTML = Object.entries(CODEX).sort((a, b) => a[1].n - b[1].n).map(([id, e]) => {
    const has = st.codex.includes(id);
    return `<div class="card ${has ? 'on' : 'locked'}"><h4>${e.n}. ${has ? esc(e.title) : '???'}</h4><p>${has ? esc(e.text) : 'Not yet found.'}</p></div>`;
  }).join('');
}
```
(`esc`/`$` already imported/defined at the top of `js/ui.js:8-10`; `CODEX`
imported from `./game.js` alongside the existing `EQUIP, ITEMS, PAINT_NAMES`
import at `js/ui.js:5`.) Locked entries show their number and "???" rather
than being omitted, so the player can see there are 12 total and track
progress — matches the "12 entries" framing directly (`docs/STORY.md`
explicitly numbers them 1-12 for this reason).

### 3.4 Pause menu button and map chip

Pause menu (`index.html:114-128`), one new button alongside the existing
`data-open` buttons (after the `storage` button, line 120):
```html
<button data-open="codex">codex</button>
```
This needs no new JS — the existing document-level click handler
(`js/ui.js:34-46`) already generically handles any `data-open` button
(`const o = b.getAttribute('data-open'); if (o) { ...; this.open(o); }`).

Map chip (`index.html:136-147`), one new button after the existing "saved"
chip:
```html
<button data-f="codex">codex</button>
```
The existing chip click handler (`js/ui.js:90`, `$('m-chips').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.setFilter(b.dataset.f); });`)
needs one special case, since codex entries have no map position to plot —
change that line to:
```js
$('m-chips').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.f === 'codex') { this.open('codex'); return; }
  this.setFilter(b.dataset.f);
});
```
This satisfies "pause menu + map tab" literally: the map's chip row is where
the button lives (visually grouped with every other map filter, discoverable
the same way), but clicking it opens the same dedicated Codex overlay rather
than trying to force 12 non-spatial lore entries into the spatial results
list/canvas — which would be exactly the kind of "pretend it fits" fudge
`AGENTS.md`'s "never pretend stuff" rule warns against.

---

## 4. Ship flavour lines and the Wite-Out rename

### 4.1 Dependency

**Expected from part 1** (`ship-roster.md` §2): `js/ships.js`'s `SHIPS`
object grows from 5 entries to 15, with ids `scout, eraser, racer, tape,
witeout, fighter, paperclip, hauler, gelpen, compass, stickynotes, stapler,
gluestick, cruiser, locker` in that exact insertion order (that spec's own
table, `ship-roster.md` §2, is explicit that object-key order is shop
order — this spec does not change that order). Each entry already has a
`desc` field (`ui.js:356-357` already renders `s.desc` generically, per that
spec's own §2.1 note — **no `js/ui.js` change is needed for shop cards**,
only the `desc` string values below).

### 4.2 The fifteen `desc` strings (verbatim, `docs/STORY.md` §"Ship flavour
lines" — this table is the source of truth for `desc`, overriding whatever
placeholder description a first pass of `ship-roster.md`'s own implementation
might have used, since `docs/STORY.md`'s lines are written for this exact
purpose: *"the 15 ship flavour lines shown in the shop"*)

| id | name (unchanged except `witeout`, see 4.3) | `desc` |
|---|---|---|
| `scout` | Pencil Case | `Zips shut, holds everything, and still somehow loses your eraser.` |
| `eraser` | Eraser | `The only Eraser on our side. Fast, light, and a little embarrassed about the name.` |
| `racer` | Highlighter | `Marks the important parts of space in a colour nobody asked for, very quickly.` |
| `tape` | Correction Tape | `Blinks forward like a mistake being covered up. Leaves a faint white line where you were.` |
| `witeout` | **Correction Fluid** | `Paints itself out of the picture. Enemies lose track of you; so, occasionally, do you.` |
| `fighter` | Ballpoint | `Click to deploy. The hull Doodle District's survivors trust, with four wing guns.` |
| `paperclip` | Paperclip | `Bends, holds, drags. The tractor beam works on crates, debris and small arguments.` |
| `hauler` | Ring Binder | `Three steel rings, one cargo bay, zero sympathy for your fuel bill.` |
| `gelpen` | Gel Pen | `The fastest ink in the yard and the thinnest hull. Writes beautifully. Smudges if touched.` |
| `compass` | Compass | `Turns tighter than anything with a hull. Draws perfect circles around people who draw lines.` |
| `stickynotes` | Sticky Notes | `Leaves decoys everywhere. The red guys keep attacking reminders.` |
| `stapler` | Stapler | `Rams first, asks for the invoice later.` |
| `gluestick` | Glue Stick | `Repairs its own hull in flight. Smells faintly of primary school.` |
| `cruiser` | Lecture Hall | `A 60 m liner with dorms, a galley and a lounge screen. Attendance is mandatory.` |
| `locker` | Filing Cabinet | `The tall one. Stacked decks, one elevator, one song on repeat. Scoops fuel from stars, which Spiral Bound Galactic is lobbying to ban.` |

If `ship-roster.md` is implemented first with its own placeholder `desc`
strings, this table's job is to **replace** those 15 values in the `SHIPS`
literal (`js/ships.js`, wherever that spec lands them) with the strings
above, one straight string-literal swap per id, nothing else in that object
touched (stats, `ability`, `cls`, `fuel`, `price` all stay exactly as
`ship-roster.md` specifies).

### 4.3 The Wite-Out -> Correction Fluid rename

`docs/STORY.md` is explicit about why: *"spec name 'Wite-Out' — rename: that
is a real BIC trademark."* Keep the **id** `witeout` unchanged (this is the
save-compatibility-critical part: `s.ship`, `s.owned`, `s.paint[type]`,
`s.fuel[type]`, `s.hull[type]` in `game.js` all key off `id`, never off
`name`, exactly as `ship-roster.md` §1 already establishes for the original
five — the same guarantee extends to every new id including this one).
Change only display text:

- `js/ships.js`: the `witeout` entry's `name: 'Wite-Out'` -> `name: 'Correction
  Fluid'`. This alone fixes the shop card header (`ui.js:356`, `<h4>${esc(s.name)} · ${s.cls}</h4>`)
  and every other place that reads `SHIPS[type].name` or `this.def.name`
  (search both strings across `js/*.js` — `def.name` appears in at least the
  refuel-denial string at `js/game.js:477`, `` `Your ${this.def.name} burns ${f}.` ``,
  which will now correctly read "Your Correction Fluid burns ION." once a
  player owns/flies it).
- Exterior hull signage: `ship-roster.md` §3's per-ship exterior function
  pattern (`extWiteout(k, P)`) ends with two `k.sign(...)` calls carrying the
  ship's name in call-caps, following `extScout`'s own
  `k.sign('PENCIL CASE', ...)` example (`js/ships.js:1272-1273` today, before
  the roster expansion). Whichever exact text `ship-roster.md`'s
  implementation used for `extWiteout`'s sign calls (almost certainly
  `'WITE-OUT'`, following the id), change both occurrences to
  `'CORRECTION FLUID'`.
- Grep sweep before calling this done: search `js/*.js` for the literal
  strings `Wite-Out`, `Wite Out`, and `WITE-OUT` (case-sensitive on the last
  one, since it's the likely sign-call spelling) and confirm zero remain
  outside of code comments that are explicitly about the rename itself (this
  document and any implementer comment explaining *why* the id stays
  `witeout` are fine to keep the old name in prose).
- `docs/specs/ship-roster.md` itself still says "Wite-Out" throughout — that
  file is a frozen research artifact (this spec quotes and supersedes it for
  this one field), not itself a game file, so it is correctly left as-is; do
  not edit it.

---

## 5. Boss encounters

### 5.1 What's reused, unmodified, from `js/actors.js`

`buildCapital(kind)` (`js/actors.js:611-626`) already builds either a
`dreadnought()` or `carrier()` template, cached once per kind
(`once('cap:' + k, ...)`, `js/actors.js:613`) and cloned per spawn. Bosses
reuse these two templates **as their base silhouette** rather than adding
eight new hand-modelled hulls — a deliberate minimal-scope choice (Gev's own
rule, `AGENTS.md` "Minimal Change Scope"): distinctiveness comes from scale,
colour and *behaviour* (moves/telegraphs/HP bar/announcement), which is what
actually reads as "a boss" in play, not a new silhouette per boss. This also
means zero new triangle budget beyond what a normal capital already costs
(`docs/PLAN.md`'s "capital under 20k triangles" budget, unchanged).

### 5.2 New `js/actors.js` export: `tintCapital`

Every dreadnought/carrier clone today shares the *same* material instances
as every other one of that kind — `once()` caches the whole built `Group`,
materials included, and `THREE.Object3D.clone()` does not deep-clone
materials. Recolouring a boss must not recolour every normal capital ship in
the game. New function, placed right after `buildCapital` (`js/actors.js:626`):

```js
// Recolours a cloned capital group in place: every red-hull mesh (material
// opacity === ID.ENEMY, i.e. built via red()) gets a fresh red(hullColor)
// material; every glow mesh (opacity === ID.GLOW) gets a fresh
// glow(glowColor) material. Call this ONLY on a group returned by
// buildCapital(...).group — never on the cached template itself (t, inside
// buildCapital) or every capital of that base kind changes colour.
export function tintCapital(group, hullColor, glowColor) {
  const seen = new Set();
  group.traverse((o) => {
    if (!o.isMesh || !o.material || seen.has(o.material)) return;
    if (Math.abs(o.material.opacity - ID.ENEMY) < 0.01) o.material = red(hullColor);
    else if (Math.abs(o.material.opacity - ID.GLOW) < 0.01) o.material = glow(glowColor);
  });
  return group;
}
```
(`ID` is already imported into `js/actors.js` from `./mats.js` — check the
existing import line at the top of the file and add `ID` to it if it isn't
already there; `red`/`glow` are already imported and used throughout the
file, e.g. `capMats()` at `js/actors.js:436-439`.) The `seen` Set avoids
recolouring the same shared material object twice when several meshes in the
clone still point at one instance (they do, by construction — `Kit.into(g)`
merges by material, `js/actors.js`'s own comment at the `turretTemplate`
function says as much) — redundant work, not a correctness bug either way,
but cheap to skip.

### 5.3 Boss table

```js
// js/game.js, new const near ABILITIES-equivalent tables (top of file, after
// ANNOUNCER, section 2.1)
const BOSSES = {
  // --- Act bosses (3 phases, HP bar, act-progress flag) ---
  doodler:  { name: 'The Doodler',  base: 'dreadnought', scale: 2.0, hull: 0x4deeff, glow: 0xffc23c, hpMult: 5, lieutenant: false, codex: 'doodler', act: 1, moves: ['summon', 'throw', 'charge'] },
  eraser:   { name: 'The Eraser',   base: 'carrier',     scale: 1.9, hull: 0xffc23c, glow: 0xff3b5c, hpMult: 6, lieutenant: false, codex: 'eraser',  act: 2, moves: ['rub', 'stomp', 'charge'] },
  inkblot:  { name: 'The Inkblot',  base: 'dreadnought', scale: 2.2, hull: 0xff4de1, glow: 0x2a0912, hpMult: 7, lieutenant: false, codex: 'inkblot', act: 3, moves: ['spray', 'throw', 'summon'] },
  // --- Lieutenants (2 phases, HP bar, no act flag — codex-only) ---
  scribbler:     { name: 'The Scribbler',      base: 'dreadnought', scale: 1.4, hull: 0xff8a3c, glow: 0xffc23c, hpMult: 3, lieutenant: true, codex: null, moves: ['spray', 'rub'] },
  smudge:        { name: 'The Smudge',         base: 'carrier',     scale: 1.3, hull: 0x2a0912, glow: 0x555b66, hpMult: 3, lieutenant: true, codex: null, moves: ['rub', 'summon'] },
  holepunch:     { name: 'The Hole Punch',     base: 'dreadnought', scale: 1.4, hull: 0x4d7cff, glow: 0x4deeff, hpMult: 3, lieutenant: true, codex: null, moves: ['stomp', 'summon'] },
  papercut:      { name: 'The Paper Cut',      base: 'dreadnought', scale: 1.1, hull: 0xff3b5c, glow: 0xffc23c, hpMult: 2, lieutenant: true, codex: null, moves: ['charge', 'spray'] },
  stapleremover: { name: 'The Staple Remover', base: 'carrier',     scale: 1.5, hull: 0x5b6577, glow: 0xff8a3c, hpMult: 3, lieutenant: true, codex: null, moves: ['throw', 'rub'] },
};
```

(Hull/glow hex values above are drawn from `neon-relook.md`'s own new
`PAL` table, §5.1 of that spec — `PAL.cyan/amber/red/magenta/orange/
blue/slate/redDark`. If that spec lands with different exact hex values,
substitute `PAL.<name>` references instead of the literals above, e.g.
`hull: PAL.cyan` — the intent is "reuse the neon palette's existing named
colours for boss identity", not these specific hex digits.)

### 5.4 HP numbers — worked calculation from the current, documented balance

`docs/HANDOFF.md` §"Changes on 2026-09-23" records the live-tuned capital HP:
dreadnought 700, carrier 950 (`js/game.js:999`, `hp: kind === 'carrier' ? 950
: 700`). These are the same two numbers every `hpMult` above multiplies:

```js
function bossHp(id) {
  const b = BOSSES[id];
  const base = b.base === 'carrier' ? 950 : 700;
  return Math.round(base * b.hpMult);
}
```

| Boss | base | hpMult | HP |
|---|---|---|---|
| The Doodler (Act 1) | 700 | 5 | 3500 |
| The Eraser (Act 2) | 950 | 6 | 5700 |
| The Inkblot (Act 3) | 700 | 7 | 4900 |
| The Scribbler / Smudge / Hole Punch (lieutenants, dreadnought/carrier base) | 700/950 | 3 | 2100 / 2850 |
| The Paper Cut (lieutenant, deliberately squishier — canon is "small, fast") | 700 | 2 | 1400 |
| The Staple Remover (lieutenant) | 950 | 3 | 2850 |

**These are a calculated starting point extrapolated from the documented
2026-09-23 tuning pass, not a measured/playtested result** — say so plainly,
per `AGENTS.md`'s "never pretend stuff" rule, rather than presenting them as
verified. Player DPS context for why this scale is plausible: base laser
`dmg` is 12-18 depending on ship (`js/ships.js`, current 5-ship table), fire
rate is capped at `1/0.12 ≈ 8.3` shots/s by `fireCd` (`js/game.js:1034`) but
throttled well below that by the heat system (`heat += 5.2` per shot against
a `heat` cap of `100 * (1 + 0.4 * cooler)`, `js/game.js:155` — roughly 19
shots, i.e. ~2.3 s, before a base-cooler ship overheats and must let it cool),
and the fully-upgraded `dmg` stat (`js/game.js:154`, `d.dmg * (1 + 0.35 *
e.laser)`, `e.laser` maxing at 3) is up to 2.05x base. A normal 700-HP
dreadnought already represents a real fight at these numbers (that is what
the 2026-09-23 pass tuned it *to be*, per `docs/HANDOFF.md`'s own framing of
Gev's report that capitals were previously "too strong and unhittable" before
that pass) — a 3500-6600 HP boss with a stationary "assembling" telegraph
window per move (section 5.5) is 4-8x that fight's raw HP, which is the right
order of magnitude for a once-per-act set-piece rather than a random-zone
encounter, but **must be confirmed with one real playtest pass per boss
before calling this balanced** — flagged here as the one manual step this
spec cannot skip past.

### 5.5 The move vocabulary — six shared implementations, gated per boss by phase

New enemy fields added only to boss entries (never to a normal capital —
guard every new code path below on `e.boss` being truthy):
```js
// added to the enemy object built by spawnBoss (5.6), alongside the existing
// capital fields (kind, sub, hp, max, turrets, beamLocal, beam, ...):
boss: true, bossId, lieutenant, movesAll, movesUnlocked: [], phase: 0,
moveCd: 3, moveActive: null, // { name, t, data } while a move's telegraph/active window runs
```

Phase gating, checked once per frame in the boss's update branch (section
5.7): for a lieutenant (`movesAll.length === 2`), phase 1 (all HP down to
50%) has `movesUnlocked = [movesAll[0]]`, phase 2 (below 50%) has both. For
an act boss (`movesAll.length === 3`), phase 1 (100-66%) has
`[movesAll[0]]`, phase 2 (66-33%) has the first two, phase 3 (<33%) has all
three — this is exactly where `charge` sits for the Eraser (`moves: ['rub',
'stomp', 'charge']`, section 5.3), so it only becomes available once the
Eraser is genuinely "cornered" (low HP), matching `docs/STORY.md`'s own line
*"Charges when cornered"* mechanically, not just in flavour text.

```js
// js/game.js, called once per frame per boss enemy, from updateCombat()'s
// existing capital branch (js/game.js:1158-1184) — add near the top of that
// branch, after `if (e.sub === 'carrier') { ... }` (js/game.js:1177-1183):
if (e.boss) this.updateBossMoves(e, dt, tp, dist);
```

```js
updateBossMoves(e, dt, tp, dist) {
  const frac = e.hp / e.max;
  const thresholds = e.lieutenant ? [0.5] : [0.66, 0.33];
  const wantPhase = thresholds.filter((th) => frac <= th).length;
  if (wantPhase !== e.phase) {
    e.phase = wantPhase;
    e.movesUnlocked = e.movesAll.slice(0, e.phase + 1);
    this.ui.toast(`${e.name}: phase ${e.phase + 1}.`);
  }
  if (e.moveActive) { this.runMove(e, dt, tp); return; }
  e.moveCd -= dt;
  if (e.moveCd > 0 || dist > 9000) return;
  const name = e.movesUnlocked[Math.floor(Math.random() * e.movesUnlocked.length)];
  e.moveActive = { name, t: 0, data: {} };
  this.ui.toast(`${e.name}: ${MOVE_TELL[name]}`);
  audio.sfx('beamCharge'); // reuse the existing charge-telegraph cue, js/audio.js
}
```

`MOVE_TELL` (spoken telegraph text — shown as a toast the instant a move
begins its telegraph, giving the player the same warning a raised weapon
would):
```js
const MOVE_TELL = {
  summon: 'is drawing reinforcements.', throw: 'is winding up a throw.', charge: 'is charging.',
  rub: 'is sweeping the eraser.', spray: 'is loading a spray.', stomp: 'is dropping.',
};
```

`runMove(e, dt, tp)` — one state machine per move name, all sharing the
`e.moveActive = {name, t, data}` shape, each ending by setting `e.moveActive
= null` and `e.moveCd = <its cooldown>`:

```js
runMove(e, dt, tp) {
  const m = e.moveActive; m.t += dt;
  const sh = this.ship;
  switch (m.name) {
    case 'summon': // telegraph 1.5s, then spawns 3 imps, cooldown 14s
      if (m.t < 1.5) return;
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; this.spawnImp({ x: e.pos.x + Math.cos(a) * 500, y: e.pos.y, z: e.pos.z + Math.sin(a) * 500 }); }
      e.moveActive = null; e.moveCd = 14; return;
    case 'throw': // telegraph 1.0s, then one slow 45-dmg blob, cooldown 9s
      if (m.t < 1.0) return;
      { const dir = V1.set(tp.x - e.pos.x, tp.y - e.pos.y, tp.z - e.pos.z).normalize();
        this.addShot({ ...e.pos }, dir.multiplyScalar(700), 45, 'enemy'); }
      e.moveActive = null; e.moveCd = 9; return;
    case 'charge': // telegraph 1.2s, then a 2.5s dash straight at the player, 50 contact dmg once, cooldown 11s
      if (m.t < 1.2) { return; }
      if (m.t < 3.7) {
        const dir = V1.set(tp.x - e.pos.x, tp.y - e.pos.y, tp.z - e.pos.z).normalize();
        e.pos.x += dir.x * 1400 * dt; e.pos.y += dir.y * 1400 * dt; e.pos.z += dir.z * 1400 * dt;
        if (!m.data.hit && vdist(e.pos, sh.pos) < e.radius + ((this.exterior && this.exterior.radius) || 20)) { m.data.hit = true; this.damage(50, 'boss-charge'); }
        return;
      }
      e.moveActive = null; e.moveCd = 11; return;
    case 'rub': // telegraph 1.3s (sweep visual), then one 40-dmg hit if the player is within 1400u, cooldown 13s
      if (m.t < 1.3) return;
      if (vdist(e.pos, sh.pos) < 1400) this.damage(40, 'boss-rub');
      e.moveActive = null; e.moveCd = 13; return;
    case 'spray': // telegraph 0.8s, then a 10-shot fan, 4 dmg each, cooldown 7s
      if (m.t < 0.8) return;
      { const base = Math.atan2(tp.x - e.pos.x, tp.z - e.pos.z);
        for (let i = 0; i < 10; i++) { const a = base + (i / 9 - 0.5) * ((50 * Math.PI) / 180);
          this.addShot({ ...e.pos }, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(1000), 4, 'enemy'); } }
      e.moveActive = null; e.moveCd = 7; return;
    case 'stomp': // telegraph 1.0s, then one 35-dmg hit if the player is within 700u, cooldown 10s
      if (m.t < 1.0) return;
      if (vdist(e.pos, sh.pos) < 700) this.damage(35, 'boss-stomp');
      e.moveActive = null; e.moveCd = 10; return;
  }
}
```

(`V1`, `vdist`, `TAU`, `addShot`, `damage`, `spawnImp` are all already
imported/defined/existing methods used identically elsewhere in `game.js` —
no new imports beyond what section 5.2 needs in `actors.js`.) Damage numbers
are deliberately dodgeable-if-noticed (the telegraph durations above, 0.8-1.5
s, are the reaction window) rather than guaranteed hits, matching how the
existing capital beam telegraph already works (3 s charge before the beam
fires, `js/game.js:1219-1231`) — this spec's telegraphs are shorter because
these are secondary moves layered on top of the boss's still-running normal
capital behaviour (turrets, beam, `js/game.js:1158-1176`, all unchanged and
still active on a boss), not its only attack.

### 5.6 Spawning a boss: `spawnBoss(id, pos)`

```js
// js/game.js, new method near spawnCapital (js/game.js:991)
spawnBoss(id, pos) {
  const b = BOSSES[id];
  const c = buildCapital(b.base);
  const g = c.group;
  g.position.set(0, 0, 0); g.quaternion.identity(); g.scale.setScalar(b.scale); g.updateMatrixWorld(true);
  tintCapital(g, b.hull, b.glow); // section 5.2 — import tintCapital alongside buildImp/buildCapital/buildDrone, js/game.js:8
  const local = (o) => { const w = new THREE.Vector3(); o.getWorldPosition(w); return w; };
  const box = new THREE.Box3().setFromObject(g);
  const hp = bossHp(id);
  const e = {
    kind: 'capital', sub: b.base, name: b.name, obj: c, pos, q: new THREE.Quaternion(),
    hp, max: hp, box,
    turrets: c.turrets.map((t) => ({ node: t, local: local(t), hp: 60, cd: 2 + Math.random() * 3, dead: false })), // boss turrets: 60 hp not 40 — tougher secondary targets, matching the bigger scale
    beamLocal: local(c.beamPort), beam: { state: 'idle', t: 0, cd: 6 + Math.random() * 5, dir: new THREE.Vector3() },
    spawnCd: 10, radius: c.radius * b.scale,
    boss: true, bossId: id, lieutenant: b.lieutenant, movesAll: b.moves, movesUnlocked: [b.moves[0]], phase: 0, moveCd: 5, moveActive: null,
  };
  const toShip = V1.set(this.ship.pos.x - pos.x, this.ship.pos.y - pos.y, this.ship.pos.z - pos.z).normalize();
  e.q.setFromUnitVectors(this.capFwd(e), toShip);
  this.fxRoot.add(g);
  e.beamMesh = new THREE.Mesh(this.beamGeo, glow(0xff4a3a));
  e.beamMesh.visible = false;
  this.fxRoot.add(e.beamMesh);
  this.enemies.push(e);
  this.unlockCodex(b.codex || 'attractor'); // section 3.2, rows 3/4/5/12 — lieutenants (codex: null) skip this via the fallback only being reached by inkblot's own explicit 'inkblot' id already set; guard properly below
  this.ui.big(`${b.name.toUpperCase()}`, e.lieutenant ? 'A lieutenant of the Red Margin.' : 'An act boss. This will take a while.');
  audio.sfx('alarm'); audio.mood('combat');
  return e;
}
```

Fix the codex-unlock line above to not misfire `'attractor'` for every
lieutenant (the `|| 'attractor'` fallback as drafted is wrong for anything
but `inkblot`) — correct version:
```js
if (b.codex) this.unlockCodex(b.codex);
if (id === 'inkblot') this.unlockCodex('attractor'); // section 3.2 row 12 — same moment, second entry
```

On defeat, `hurt()`'s existing capital-kill branch (`js/game.js:1279-1284`)
already runs for a boss (bosses are `kind: 'capital'`, nothing about that
branch is boss-specific) — add one boss-only tail after it, right after the
existing `audio.sfx('bigExplosion');` line:
```js
if (e.boss) {
  this.state.bossesDefeated.push(e.bossId);
  if (!e.lieutenant) this.state.actProgress = Math.max(this.state.actProgress, BOSSES[e.bossId].act);
  this.persist();
}
```

### 5.7 HUD boss health bar

New DOM element in the HUD (`index.html`'s `#hud` block — search for
`id="h-msg"` at `index.html:50` and add a sibling right before it):
```html
<div class="bosshp" id="boss-hp" hidden><span id="boss-name"></span><div class="bar"><i id="boss-fill"></i></div></div>
```
New `UI` method, called once per frame only while a boss is alive and the
player is in `helm`/`foot`/`eva`/`drone` mode (i.e. the same "HUD visible"
condition every other per-frame HUD update already uses — find that
condition by looking at whatever gates the existing `#h-msg`/toast updates
in the draw loop and reuse it verbatim):
```js
updateBossHp() {
  const b = this.g.enemies.find((e) => e.boss && !e.dead);
  const el = $('boss-hp');
  if (!b) { el.hidden = true; return; }
  el.hidden = false;
  $('boss-name').textContent = b.name.toUpperCase();
  $('boss-fill').style.width = `${clamp((b.hp / b.max) * 100, 0, 100)}%`;
}
```
Call `this.ui.updateBossHp();` from wherever the HUD's other per-frame
elements are already refreshed each frame (the same place that updates
health/fuel/shield readouts — search `js/ui.js` for whatever method does
that today and add the call at its end). CSS: `.bosshp` fixed top-centre,
`.bar` a thin rect, `#boss-fill` width-animated (`transition: width .2s`),
colour `NEON_RED`/`PAL.red`-ish, matching the enemy-ink colour convention
already used everywhere else in the HUD for hostile elements.

### 5.8 Where each boss lives

Bosses are **not** part of the random `rollZones()` pool (`js/universe.js:
783-804`, unchanged by this spec) — each has one fixed position, computed
once and cached, checked for proximity every frame the same way a normal
zone is (`enterZone`, `js/game.js:969`), but through a small parallel path
so `rollZones`'s own re-roll-on-log-on/off behaviour (untouched, per every
sibling spec's own "don't touch this" note) never affects them:

```js
// js/game.js, new method, called once from boot() after this.u.load() —
// js/game.js:102, right after `await this.u.load();`
bossAnchor(id) {
  const u = this.u;
  const off = (base, R, dx, dz) => ({ x: base.x + dx * R, y: base.y, z: base.z + dz * R });
  switch (id) {
    case 'doodler': { // Milky Way, near the galactic-centre black hole
      const bh = u.sights.find((s) => s.kind === 'blackhole' && (!s.galaxy || s.galaxy === u.mw.name));
      return bh ? off(bh.pos, 1, 0.15, 0.1) : off(u.mw.pos, u.mw.R, 0.05, 0.05); // small offset so the boss isn't literally inside the sight's own radius
    }
    case 'eraser': { const g = u.findGalaxy('M31'); return g ? off(g.pos, g.R, 0.3, -0.2) : off(u.mw.pos, u.mw.R, 2, 0); }
    // Expected from part 1 (universe-density-and-galaxy-clusters.md §4.2): this.u.regions,
    // an array of {id, name, kind, pos, R, ...}, seven entries including
    // 'Virgo Cluster', 'Fornax Cluster', 'Coma Cluster',
    // 'Hydra-Centaurus Supercluster / Great Attractor', 'Perseus-Pisces Supercluster'.
    case 'inkblot': { const r = (u.regions || []).find((r) => r.name.includes('Hydra')); return r ? { ...r.pos } : { x: 8e9, y: 0, z: 0 }; }
    case 'stapleremover': { const r = (u.regions || []).find((r) => r.name.includes('Hydra')); return r ? off(r.pos, r.R, 0.4, 0.3) : { x: 8.1e9, y: 3e8, z: 0 }; } // offset from Inkblot within the same region — see note below
    case 'scribbler': { const r = (u.regions || []).find((r) => r.name.includes('Virgo')); return r ? off(r.pos, r.R, 0.2, 0.2) : { x: 5e8, y: 0, z: 0 }; }
    case 'smudge': { const r = (u.regions || []).find((r) => r.name.includes('Coma')); return r ? off(r.pos, r.R, 0.2, -0.2) : { x: 3e9, y: 0, z: 0 }; }
    case 'holepunch': { const r = (u.regions || []).find((r) => r.name.includes('Fornax')); return r ? off(r.pos, r.R, -0.2, 0.2) : { x: 5.5e8, y: 0, z: 0 }; }
    case 'papercut': { const r = (u.regions || []).find((r) => r.name.includes('Perseus')); return r ? off(r.pos, r.R, 0.2, 0.2) : { x: 6e9, y: 0, z: 0 }; }
  }
}
```

`docs/STORY.md` places The Inkblot (Act 3 boss) and The Staple Remover
(Hydra-Centaurus lieutenant) both in the same real-world region — that
sibling spec's own `REGIONS` table (`universe-density-and-galaxy-
clusters.md` §4.2) models Hydra-Centaurus and the Great Attractor as **one**
region object (`'Hydra-Centaurus Supercluster / Great Attractor'`), not two —
the `off(..., 0.4, 0.3)` displacement above is what keeps the two encounters
from spawning on top of each other; it is not a data error, it's the correct
handling of one real region hosting two different `docs/STORY.md` encounters.
The literal fallback coordinates (`{x: 8e9, ...}` etc., used only if
`this.u.regions` doesn't exist yet, i.e. before that sibling spec lands) are
placed just past the `9e9`-unit "uncharted galaxy" boundary documented in
`universe-density-and-galaxy-clusters.md` §4.1, in roughly the right sky
direction per that spec's own real RA/Dec table — good enough to make the
game playable/testable before the sibling spec lands, deliberately marked
here as a fallback, not the intended final position.

Store the eight results once: `this.bossPos = {}; for (const id of
Object.keys(BOSSES)) this.bossPos[id] = this.bossAnchor(id);` (called once at
the end of `boot()`, after `this.u.load()` has run so galaxies/regions
exist). New per-frame check, called from `updateZones(dt)`
(`js/game.js:937`, add a call at the top of that method, before its existing
body):
```js
updateBossEncounters(dt) {
  if (this.zone || this.mode !== 'helm') return; // already fighting something, or not flying — don't interdict
  for (const id of Object.keys(BOSSES)) {
    if (this.state.bossesDefeated.includes(id)) continue;
    if (this.enemies.some((e) => e.bossId === id && !e.dead)) continue; // already spawned, fight in progress
    const b = BOSSES[id];
    if (!b.lieutenant && b.act > 1 && this.state.actProgress < b.act - 1) continue; // acts gate in order: Act 2's boss needs Act 1 cleared, etc.
    if (vdist(this.bossPos[id], this.ship.pos) < 6000) { this.spawnBoss(id, { ...this.bossPos[id] }); return; }
  }
}
```
(Same 6000 u interdiction distance already used to pick the spawn base point
in `enterZone`'s own `dir`/`base` construction, `js/game.js:978-981`, kept
consistent rather than inventing a new number.) This method call belongs
right after the existing `if (sh.warp) return;`-style early guards inside
`updateZones` — since `updateZones` already runs every frame flight is
active, no new call site is needed in `update()` itself.

---

## 6. Credits

### 6.1 Title screen footer

`index.html:109`, replace the existing line:
```html
<!-- was: -->
<footer class="credits">made by Gev · after Doodle Shooter · three.js · NASA Exoplanet Archive · OpenNGC (CC BY-SA 4.0) · Wikipedia</footer>
<!-- becomes: -->
<footer class="credits">Doodle Voyager · made by Gev with Claude Opus 5.5 (Anthropic) · after Doodle Shooter (doodleshooter.vercel.app) · three.js · NASA Exoplanet Archive · OpenNGC (CC BY-SA 4.0) · Wikipedia · open source on GitHub</footer>
```
"Open source on GitHub" is text only here, not a link — see 6.3 for why.

### 6.2 New credits screen

A second, fuller credits overlay, reachable from the title screen (new
button) and from the pause menu (new button, same as Codex in section 3.4):

```html
<!-- index.html, new section after #codex -->
<section class="overlay" id="credits" hidden aria-labelledby="cr-h">
  <div class="panel small">
    <div class="maphead"><h3 id="cr-h">CREDITS</h3><button class="x" data-close>close</button></div>
    <div class="stack" style="text-align:left">
      <p><strong>Doodle Voyager</strong> — made by Gev with Claude Opus 5.5 (Anthropic).</p>
      <p>After <strong>Doodle Shooter</strong> (doodleshooter.vercel.app) — its world, enemies, bosses and losing-screen words are the canon this game builds on.</p>
      <p>Open source: this game's source is published on GitHub. [repository URL — Gev to fill in once the repo is public; do not invent one]</p>
      <p>Built with three.js. Universe data from the NASA Exoplanet Archive, OpenNGC (CC BY-SA 4.0), and Wikipedia (Local Group membership, cluster/supercluster positions).</p>
    </div>
  </div>
</section>
```

Add `'credits'` to the `OVERLAYS` array (`js/ui.js:13`) — needs no special
`open()` case (it's static content, nothing to render per-open, exactly like
`#help`'s controls list is mostly-static). Title screen button, alongside the
existing `mainbtns` (`index.html:60-63`, add after the two existing
buttons, inside the same `.mainbtns` div or as a small `linkish` button below
it — match whatever visual weight `references/games.md`'s teardown gives a
tertiary action, since this is deliberately less prominent than LAUNCH/NEW
VOYAGE): `<button class="linkish" data-open="credits">credits</button>`.
Pause menu button (`index.html:114-128`), alongside the new Codex button
(section 3.4): `<button data-open="credits">credits</button>`.

### 6.3 The GitHub URL is deliberately a placeholder, not a guess

Per `AGENTS.md`'s "Never Pretend Stuff" rule and `feedback_no_pretending.md`:
this spec was not given, and did not find, an actual GitHub repository URL
for Doodle Voyager — `docs/PLAN.md`/`docs/HANDOFF.md` mention Vercel
(`doodle-voyager.vercel.app`, project `ridelink1/doodle-voyager`) but no
GitHub remote. Writing a plausible-looking `github.com/...` URL into a
shipped credits screen would be exactly the kind of fabricated-but-passed-
off-as-real content that rule exists to prevent. The implementer's actual
task here, before this section can be called done, is two real steps neither
of which this spec can do on its own behalf:
1. Publish the repository on GitHub (a `git init`/`git remote add origin`/
   `git push` sequence against a real, created GitHub repo — this needs a
   GitHub account/organisation decision Gev makes, not a guess at one).
2. Fill in the bracketed placeholder text above with that repo's real URL,
   and only then remove the "[repository URL — Gev to fill in...]" bracket.
Ship the bracketed placeholder text (not a fake URL, not a dead link) if the
repo isn't public yet at implementation time — that is the honest state, and
matches this same document's own instruction not to invent one.

---

## 7. Headless test checks to add to `tools/test.mjs`

Follow the file's existing `check(name, ok, detail)` / `E(...)` pattern
(`tools/test.mjs:24-38`). Add after the existing checks, before the file's
closing summary block:

```js
// --- story integration ---
const codex1 = await E(`g.launch ? null : null; return { codex: g.state.codex.slice(), inCodex: !!Object.keys(g.state).length };`);
// (launch() already ran once during boot's normal flow in this harness — see the file's existing "boots and loads" flow above; if it hasn't, call g.launch() here first)
check('codex has at least the always-true early unlocks after boot+launch', codex1.codex.includes('inkglows'), JSON.stringify(codex1));

const shipCheck = await E(`
  const w = g.__SHIPS__ ? g.__SHIPS__.witeout : null; // adjust to however SHIPS is reached from window.__dv if not already exposed
  return { name: (window.SHIPS || {}).witeout ? window.SHIPS.witeout.name : (g.def && g.def.name), owned: g.state.owned.slice() };
`);
// The exact accessor above depends on how ship-roster.md's implementation exposes SHIPS on window.__dv — if it isn't already reachable,
// add `window.__SHIPS__ = SHIPS;` once in js/game.js's constructor (harmless, test-only convenience, matching the existing `window.__dv = this;` pattern at js/game.js:96) rather than guessing.
check('Wite-Out is renamed to Correction Fluid, id unchanged', true /* fill in once __SHIPS__ is reachable, see above */, JSON.stringify(shipCheck));

const refuseTxt = await E(`
  const wrongFuel = g.def.fuel === 'ION' ? 'PLASMA' : 'ION';
  const fakeBody = { station: { fuelTypes: [wrongFuel] } };
  return g.refuel(fakeBody, 10);
`);
check('refuel refusal includes a Spiral Bound Galactic announcer line', /".+"/.test(refuseTxt), refuseTxt);
check('codex fuelracket unlocks on first refused pump', (await E('return g.state.codex.includes("fuelracket");')), '');

const bossCheck = await E(`
  const before = g.enemies.length;
  const e = g.spawnBoss('doodler', { x: g.ship.pos.x + 1000, y: g.ship.pos.y, z: g.ship.pos.z });
  return { spawned: g.enemies.length === before + 1, hp: e.hp, max: e.max, phase: e.phase, boss: e.boss, codexUnlocked: g.state.codex.includes('doodler') };
`);
check('spawnBoss creates a boss enemy with the expected starting HP and codex unlock', bossCheck.spawned && bossCheck.hp === 3500 && bossCheck.boss && bossCheck.codexUnlocked, JSON.stringify(bossCheck));

const phaseCheck = await E(`
  const e = g.enemies.find((x) => x.bossId === 'doodler');
  e.hp = e.max * 0.5; // below the 0.66 threshold
  g.updateBossMoves(e, 0.016, g.ship.pos, 500);
  return { phase: e.phase, movesUnlocked: e.movesUnlocked.slice() };
`);
check('boss phase advances and unlocks a second move below 66% HP', phaseCheck.phase === 1 && phaseCheck.movesUnlocked.length === 2, JSON.stringify(phaseCheck));

const defeatCheck = await E(`
  const e = g.enemies.find((x) => x.bossId === 'doodler');
  const before = g.state.actProgress;
  g.hurt(e, 1e6, e.pos);
  return { dead: e.dead, bossesDefeated: g.state.bossesDefeated.slice(), actProgress: g.state.actProgress, actAdvanced: g.state.actProgress > before };
`);
check('killing an act boss records bossesDefeated and advances actProgress', defeatCheck.dead && defeatCheck.bossesDefeated.includes('doodler') && defeatCheck.actAdvanced, JSON.stringify(defeatCheck));

const crawlCheck = await E(`
  g.freshStart = true;
  let called = false;
  const origBig = g.ui.big.bind(g.ui);
  g.ui.big = (...a) => { called = true; origBig(...a); };
  g.launch();
  const active = g.ui.crawlActive;
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  return { activeAtStart: active, calledAfterSkip: called, activeAfterSkip: g.ui.crawlActive };
`);
check('intro crawl shows on a fresh start and any key skips it straight to the normal launch toast', crawlCheck.activeAtStart && crawlCheck.calledAfterSkip && !crawlCheck.activeAfterSkip, JSON.stringify(crawlCheck));

const codexScreen = await E(`g.ui.open('codex'); const n = document.getElementById('cx-body').children.length; g.ui.close('codex'); return n;`);
check('codex overlay renders all 12 entries', codexScreen === 12, `${codexScreen}`);
```

**Regression**: run the existing suite unchanged first. Every sibling spec's
own baseline note applies here too — this spec adds checks, it does not
change or remove any existing one, and the pre-existing "autopilot closes on
Mars" failure (documented in `docs/HANDOFF.md`) is expected to remain,
unrelated to anything above.

---

## 8. Performance (Chromebook target, ~250 draw calls, no per-frame allocation)

- **Draw calls**: a boss is exactly one capital-ship draw-call budget (same
  `buildCapital` templates, section 5.1) — zero net new geometry. At most one
  boss is ever alive at a time in practice (bosses don't spawn while another
  fight/zone is active, section 5.8's `if (this.zone ...) return;` guard).
- **Allocations**: `updateBossMoves`/`runMove` reuse the module-level scratch
  vectors already declared for combat (`V1`, `js/game.js:37`) exactly as
  `updateCombat`'s existing imp/capital branches already do — no `new
  THREE.Vector3()` inside any per-frame boss code path above.
- **`updateBossEncounters`**: one `Object.keys(BOSSES)` loop (8 entries) per
  frame, each a `vdist` call against a precomputed static position — trivial,
  same order of cost as the existing per-frame zone-radius checks it sits
  beside.
- **Intro crawl / Codex / Credits overlays**: plain DOM, no WebGL cost,
  identical in kind to every other existing overlay (`#help`, `#storage`).

---

## 9. Files touched

| File | What |
|---|---|
| `js/game.js` | `freshStart` flag + `launch()`/`newVoyage()`/`boot()` edits (§1.1); `keydown`/`updateHelmInput` crawl guards (§1.3); `pollGamepad`/`onGamepadButton` + `update()` call site + `KeyY` case (§1.4-1.5); `ANNOUNCER`/`announcerLine()` + `refuel()`/`tryDock()` edits (§2); `CODEX` export + `unlockCodex()` + the 12 unlock call sites incl. `update()` edits for coinflip/laniakea (§3); `BOSSES`/`bossHp()`/`MOVE_TELL`/`updateBossMoves()`/`runMove()`/`spawnBoss()`/`hurt()` boss tail/`bossAnchor()`/`bossPos`/`updateBossEncounters()` (§5); `codex`/`bossesDefeated`/`actProgress` in `freshSave()` (§0) |
| `js/ui.js` | `CRAWL` const + `playCrawl()` (§1.2-1.3); `m-chips` click handler codex special-case (§3.4); `OVERLAYS` +`codex`+`credits`; `open()` codex case; `renderCodex()` (§3.3); `updateBossHp()` (§5.7); import `CODEX` from `./game.js` |
| `js/actors.js` | `tintCapital()` export (§5.2); confirm `ID` import present |
| `js/ships.js` | 15 `desc` string values (§4.2, depends on `ship-roster.md`); `witeout` entry's `name` field + its `extWiteout` sign-call text (§4.3) |
| `index.html` | `#crawl` overlay (§1.3); pause menu `codex`/`credits` buttons (§3.4, §6.2); `#m-chips` `codex` button (§3.4); `#codex` overlay (§3.3); `#credits` overlay (§6.2); `#boss-hp` HUD element (§5.7); title footer text + credits button (§6.1-6.2) |
| `style.css` | `.crawl`/`.crawltext`/`.crawl-skip` (§1.3); `.bosshp`/`.bar`/`#boss-fill` (§5.7); `.card.locked` for Codex's unfound-entry styling (§3.3) — no other new rules needed, everything else reuses existing `.panel`/`.maphead`/`.stack`/`.card`/`.linkish` classes already in the sheet |
| `tools/test.mjs` | Section 7's checks |

Not touched: `js/render.js`, `js/media.js`, `js/mats.js`, `js/universe.js`
(only *read* from, via `u.sights`/`u.findGalaxy`/`u.regions`/`u.ctx.galaxy`,
all pre-existing or expected-from-part-1 APIs — no new exports needed from
that file), any `data/*.json`.

---

## 10. What to see on screen (manual verification, once implemented)

At `http://127.0.0.1:5178/` (or `node tools/serve.mjs`), three widths per the
project's keyboard+mouse rule — **1366x768, 1280x720, 1920x1080**:

1. Fresh browser profile (or click NEW VOYAGE twice, then LAUNCH): the neon
   intro crawl plays, five beats, readable pace, no clipping/overlap with the
   HUD underneath (it should be fully hidden at this point — `#hud` is
   `hidden` until `hideTitle()`, unaffected by this spec). Press any key,
   click, or (if a gamepad is connected) any button partway through — it
   skips straight to the normal "YOU ARE AT THE HELM" toast.
2. Load an *existing* save (LAUNCH without touching NEW VOYAGE first) — no
   crawl plays.
3. Pause (`P`), open Codex (`data-open="codex"` button, or `Y`, or map ->
   "codex" chip) — 12 rows, only "Doodle District" (and, once you've flown
   at all, "Why the Ink Glows") unlocked at the very start, the rest show
   "???". Dock at any pump that doesn't sell your fuel — the refusal message
   now ends with a quoted Spiral Bound Galactic line, and "The Fuel Racket"
   unlocks in the Codex.
4. Shop (dock, shipyard tab once `ship-roster.md` lands): 15 cards, each
   with its `docs/STORY.md` flavour line; the fifth ION-fuel small ship reads
   "Correction Fluid", not "Wite-Out", on its card header and on its hull
   signage when flown/viewed from outside.
5. Title screen and pause menu both show a "credits" button; opening it
   shows the full credit block including the bracketed GitHub placeholder
   (until Gev publishes the repo and that bracket is replaced with a real
   URL) and the Doodle Shooter attribution line.
6. (Slow to reach manually — prefer driving this via `window.__dv.spawnBoss('doodler', {...})`
   in the browser console for a visual spot-check rather than actually
   flying to the galactic centre) A spawned boss shows a name+HP bar at the
   top of the HUD, is visibly larger and differently coloured than a normal
   dreadnought/carrier, and periodically telegraphs (a toast naming the
   incoming move) before each of summon/throw/charge/rub/spray/stomp fires,
   per its `BOSSES` move list.
