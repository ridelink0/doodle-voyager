# Part 2 spec: open-source the repo on GitHub (ridelink0/doodle-voyager)

Author: a read-only spec subagent (this session runs on Claude **Sonnet 5**, not
Opus 5.5 — see "Credit line accuracy" below before publishing any credit text).
Status: **spec only, nothing published**. Written 2026-09-24 against the working
tree as it stood mid-overhaul (baseline commit `9631968`, part 1 agents still
committing). An implementer must re-run the discovery commands in this doc
(marked `[RE-CHECK]`) right before publishing, because file counts/sizes below
will have changed once part 1 finishes.

Read first: `docs/PLAN.md`, `docs/HANDOFF.md`, `docs/STORY.md` (Credits note,
line 180), `docs/specs/ship-roster.md`.

---

## 0. Credit line accuracy — read before writing the README

Gev's instruction was "state that it was made by Opus 5.5 (Credit yourself!)".
Two things don't add up and a human must resolve them before publishing:

1. **This spec-writing session identifies itself as Claude Sonnet 5**
   (`claude-sonnet-5`), not "Opus 5.5". I can't credit myself as a model I'm
   not — that would be exactly the kind of fabricated claim Gev's own rules
   forbid ("Never Pretend Stuff"). Other agents in this multi-agent build
   (part 1: neon relook, ship roster, enemy squadrons, universe density,
   planet ads) may be running on a different model — that's plausible in an
   orchestrated build — but I have no way to verify from inside this repo
   which model(s) actually generated which commits, and I'm not going to
   assert a specific model version I can't confirm.
2. There is no such shipped Anthropic model as "Opus 5.5" that this session
   can identify itself as or verify against. If Gev has a specific model name
   he wants on record (e.g. from his own product/plan naming), that's his
   call to confirm — I flag it rather than write it as fact.

**Recommendation:** use a true, checkable credit line. Options, safest first:

- `Made by Gev, built with Claude Code (Anthropic).` — always true, no model
  version claim.
- `Made by Gev with Claude (Anthropic) — built through orchestrated Claude
  Code agent workflows.` — matches the actual process (multiple agents,
  documented in `docs/specs/`).
- If Gev insists on a specific model name in print, he should state the model
  string he wants verbatim (e.g. from his own Claude Code version banner) and
  the README author should use exactly that string, not "Opus 5.5" invented
  here.

The README section below uses the safe wording and marks the exact spot to
swap in whatever line Gev confirms. **Do not silently ship "Opus 5.5" — surface
this note to Gev first.**

---

## 1. What to publish, what to exclude

### 1a. Current repo state `[RE-CHECK before publish]`

- `git log --oneline` → one commit: `9631968 Baseline before the 2026-09-24
  overhaul`. Part 1 agents are committing more on top of this right now.
- `git ls-files | wc -l` → 198 tracked files, **140 of them under
  `tools/.scratch/`** (must not stay tracked — see 1b).
- Working tree total: ~125 MB. `git count-objects -vH` → ~44 MB of loose
  objects already (mostly the scratch CSVs, since they're tracked).
- `dist/` (built output) and `tools/.scratch/`'s *sibling* dirs are **not**
  tracked today only because of a **local, unshared** `.git/info/exclude`:
  ```
  dist/
  tools/node_modules/
  tools/.cache/
  *.log
  docs/monitor/
  ```
  `.git/info/exclude` never gets pushed. There is **no `.gitignore` file in
  the repo at all**. This must be fixed before any push, or `dist/` and future
  scratch output will land in the public repo on the next `git add .`.

### 1b. Exclude list and why

| Path | Why exclude | Verified |
|---|---|---|
| `dist/` | Build output (`node tools/stage.mjs`), reproducible from source. Currently untracked only via local exclude. | `git ls-files dist \| wc -l` = 0 today, but no committed `.gitignore` protects it |
| `tools/.scratch/` | **46 MB**, 140+ files: raw downloaded catalogue CSVs (`hyg.csv` 33 MB, `ngc.csv` 3.7 MB, `pscomppars.csv`/`exo.csv` 872 KB each — full HYG/OpenNGC/NASA dumps, not the processed slim `data/*.json` the game ships), Wikipedia scrape JSON/`.wiki` dumps, ~90 numbered research `.txt` dumps, ship-render screenshots (`tools/.scratch/ships/shots/`, 5.3 MB), and dev harnesses (`tools/.scratch/audio/`, `tools/.scratch/pre/`). **This is currently tracked in git** (`git ls-files tools/.scratch \| wc -l` = 140) and must be removed from tracking, not just gitignored. None of it is needed to build or run the game — `data/*.json` (already built, already licensed via their own `source` field) is what ships. |
| `docs/monitor-log.md`, `docs/*.log` (`docs/monitor-run.log`, `docs/server-run.log`), `docs/monitor/` | Local run logs and daily screenshot captures (`docs/monitor/2026-09-2*.png`) from Gev's own scheduled task. No content value to the public repo, low but non-zero fingerprint of his machine's run cadence. |
| `tools/.shots/` | The `node tools/test.mjs` output screenshots — regenerated by every test run, currently showing as *modified* in `git status` (14 PNGs). Don't publish generated test artefacts; regenerate via CI/local run instead. |
| `tools/node_modules/`, `tools/.cache/` | Standard build/dep artefacts if `tools/*.mjs` ever grows deps (none currently — no `package.json` in the repo at all, confirmed by listing). Keep ignored defensively. |
| `assets/videos/*.mp4` | **License unclear — exclude by default.** See 1c. |

`[RE-CHECK]`: I found **no personal paths, emails, tokens or keys** in any
tracked (non-scratch, non-`dist`) file:
```
git grep -InE "C:\\\\Users|C:/Users|OWNER|AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{20,}|eyJhbGciOi" -- . ':!tools/.scratch' ':!dist'
```
returned nothing. `docs/deploy.json` names the Vercel project as
**`ridelink1/doodle-voyager`** (not `ridelink0` — a different account/org
handle than the GitHub target). That's not a secret, but it's worth Gev
confirming it's the handle he means to expose in the README's play link
section (see §3). No `.vercel/` directory exists anywhere in the tree
(confirmed by `find . -iname "*.vercel*"`), so there's no project-id file to
scrub.

### 1c. `assets/videos/` — license status: unresolved, exclude for now

`assets/videos/manifest.json` lists three sample videos used by the in-game
media player (`js/media.js`): `life.mp4` ("Game of Life, blue ink on lined
paper", 1.5 MB), `mandelbrot.mp4` ("Mandelbrot zoom, 60,000x", 1.6 MB),
`testcard.mp4` ("SMPTE colour bars, 1 kHz tone", 326 KB). Total 3.4 MB — size
is not the blocker, **provenance is**.

- I found **no generation script, README note, or doc entry anywhere in the
  repo** recording how these three MP4s were produced (no `ffmpeg`/`lavfi`/
  `manim` invocation, no source URL, no license note — checked
  `docs/PLAN.md`, `docs/HANDOFF.md`, `docs/TODO.md`, `docs/RESEARCH-features.md`,
  and grepped the whole tree for `mandelbrot`/`smptebars`/`lavfi`/`conway`).
- The *subjects* (Conway's Game of Life, the Mandelbrot set, SMPTE colour
  bars) are mathematical/standard-pattern content with no third-party
  copyright — but that only clears the subject, not the specific rendered
  file, which could be original footage someone made, a downloaded stock
  clip, or a generated render with unknown tooling. I can't tell which from
  what's in the repo, and per Gev's "never pretend" rule I'm not going to
  guess.
- **Recommendation:** add `assets/videos/*.mp4` to `.gitignore`, ship the repo
  with `assets/videos/manifest.json` present but the game's media player
  falling back to "no built-in videos, add your own" (it already supports
  user-added videos via IndexedDB/pasted URLs per `js/media.js`). Before
  re-adding these three files, Gev confirms in one line how they were made
  (e.g. "I rendered these myself with X" → then license them CC0/MIT alongside
  the code; "downloaded from Y" → then check Y's license and credit it in
  NOTICE, or drop them). Do not publish them undocumented.

### 1d. `.gitignore` — exact file to commit

```gitignore
# Build output (regenerate with: node tools/stage.mjs)
/dist/

# Dev/research scratch — large catalogue dumps, screenshots, research notes.
# Never needed to build or run the game.
/tools/.scratch/

# Generated test screenshots (node tools/test.mjs)
/tools/.shots/

# Local run logs / daily monitor captures
/docs/monitor-log.md
/docs/*.log
/docs/monitor/

# Node (defensive — no package.json today, but keep this ready)
node_modules/
.cache/

# Vercel / Netlify local state, if ever created
.vercel/
.netlify/

# Sample media of unconfirmed provenance — see docs/specs/part2-opensource-release.md §1c
/assets/videos/*.mp4
```

### 1e. Commands to actually apply the exclusion (still not run by me — READ ONLY)

```bash
cd D:/doodle-voyager
git rm -r --cached tools/.scratch tools/.shots assets/videos/*.mp4 \
  docs/monitor-log.md docs/monitor-run.log docs/server-run.log docs/monitor
# (the above only *un-tracks* them; the .gitignore above stops them coming back)
git add .gitignore
git status   # must show a clean, reviewable diff before committing
```

---

## 2. Licensing

### 2a. Code — MIT, copyright Gev

Create `LICENSE` at repo root:

```
MIT License

Copyright (c) 2026 Gev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

MIT applies to everything under `js/`, `tools/*.mjs`/`*.cmd`/`*.vbs`,
`index.html`, `style.css`, and the game's own docs prose in `docs/`
(excluding the third-party data files below, which keep their own license).

### 2b. Data files — each keeps its source license (verified this session)

| File | Upstream source | License (verified) |
|---|---|---|
| `data/galaxies.json` | OpenNGC (`github.com/mattiaverga/OpenNGC`, NGC.csv) + Wikipedia "List of nearest galaxies" + Wikipedia infoboxes | OpenNGC: **CC BY-SA 4.0** ("OpenNGC is released under CC-BY-SA-4.0 license" — repo README, checked live). Wikipedia text/infobox data: **CC BY-SA 4.0**. |
| `data/stars.json` | HYG database v4 (`astronexus`, now on Codeberg) | **CC BY-SA 4.0** ("This work is licensed under a Creative Commons Attribution-ShareAlike 4.0 International License" — checked live; note v3.x and earlier HYG releases used CC BY-SA 2.5, not relevant here since this repo built from v4/`hygdata_v41.csv`). |
| `data/exoplanets.json` | NASA Exoplanet Archive, `pscomppars` (Planetary Systems Composite Parameters) via TAP query | U.S. government-funded archive; **no copyright asserted on the data**, but the archive **requires an acknowledgment text on any publication using it** (checked live, archive's own terms page): `"This research has made use of the NASA Exoplanet Archive, which is operated by the California Institute of Technology, under contract with the National Aeronautics and Space Administration under the Exoplanet Exploration Program."` This exact sentence must appear in NOTICE/CREDITS (see 2c) — that satisfies the requirement; a repo/game is not the kind of "manuscript" the archive's citation-of-Christiansen-et-al.-2025 instruction targets, so only the acknowledgment sentence is needed, not a paper citation. |
| `data/sights.json` | Built from the above three sources (curated "interesting sights" list) | Inherits the licenses of whichever source each row came from; same NOTICE covers it. |
| three.js (via `https://cdn.jsdelivr.net/npm/three@0.170.0/...`, `index.html` import map) | Not vendored — loaded from CDN at runtime, never copied into the repo | **MIT** (three.js's own license). Credit in NOTICE; no LICENSE-file obligation since it's not redistributed, but crediting it is correct practice and Gev's brief asked for it. |

Every one of the four `data/*.json` files already self-documents its source
in a top-level `"source"` field (confirmed by reading `tools/build-data.mjs`
and the files themselves) — that's good practice already in place; NOTICE.md
below surfaces the same information at repo root where a downstream user will
actually see it before they go digging into a JSON file.

### 2c. `NOTICE.md` — exact file to commit

```markdown
# Notices and credits

Doodle Voyager's own code is MIT-licensed (see LICENSE), copyright Gev.
The following third-party material is used under its own terms.

## Data

- **OpenNGC** (github.com/mattiaverga/OpenNGC) — NGC/IC galaxy catalogue.
  License: CC BY-SA 4.0. Used to build `data/galaxies.json`.
- **HYG Database v4** (astronexus, codeberg.org/astronexus/hyg) — merged
  Hipparcos / Yale Bright Star / Gliese star catalogue.
  License: CC BY-SA 4.0. Used to build `data/stars.json`.
- **NASA Exoplanet Archive** (exoplanetarchive.ipac.caltech.edu),
  Planetary Systems Composite Parameters table (`pscomppars`).
  Used to build `data/exoplanets.json`.
  > This research has made use of the NASA Exoplanet Archive, which is
  > operated by the California Institute of Technology, under contract with
  > the National Aeronautics and Space Administration under the Exoplanet
  > Exploration Program.
- **Wikipedia** — "List of nearest galaxies" and per-object infoboxes, used
  for Local Group distances and coordinates not covered by OpenNGC.
  License: CC BY-SA 4.0. Text and facts only; no images used.

Rebuild all of the above from their live sources with `node tools/build-data.mjs`.

## Engine

- **three.js** (threejs.org), v0.170.0, loaded at runtime from jsDelivr
  (`https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js`), not
  vendored in this repo. License: MIT.

## Inspiration and tribute

Doodle Voyager is a fan sequel to **Doodle Shooter**
(doodleshooter.vercel.app, in-game title "Doodle District"), an open-source
three.js game. It borrows that game's canon — the blue-ballpoint-on-lined-paper
world, the Doodle District and Doodle Mexico maps, the seven red enemy types
(Grunt, Rusher, Heavy, Sniper, Shieldbearer, Ink Bomb, Paper Wasp), the three
bosses (The Doodler, The Eraser, The Inkblot) and its "ERASED" / "FELL OFF THE
PAGE" language — and builds a new story and game on top of it. The repository
chain found during research is `iifor/doodleshooter` (original, per its own
forks) with forks such as `sarvan-2187/doodleshooter`; the
doodleshooter.vercel.app launch was announced on X by Evan Milenko. The exact
original author was not confirmed during research, so this credits the game
and its address rather than naming an unconfirmed person. Full detail and
sources: `docs/STORY.md` ("Credits note" and "Sources" sections).

## Built with

Made by Gev, built with Claude Code (Anthropic) — see the README's
"How it was built" section.
```

---

## 3. README.md — exact structure and content

Create `README.md` at repo root (no emojis anywhere in it, per Gev's rule —
use plain headings, no badges with emoji glyphs).

````markdown
# Doodle Voyager

A first-person space shooter built in the browser: fly a ship, dock at
stations, walk the interior on foot, go EVA through a hull breach, fight the
Red Margin, and explore a universe seeded from real astronomical catalogues —
every confirmed exoplanet, thousands of real stars and galaxies — alongside a
fully fictional story and enemy faction.

A fan sequel to [Doodle Shooter](https://doodleshooter.vercel.app/) — see
Credits below.

**Play now: https://doodle-voyager.vercel.app**

## Controls

### Keyboard and mouse

| Action | Key |
|---|---|
| Move (on foot / EVA) | W A S D |
| Jump (on foot) | Space |
| Thrust up / down (EVA) | Space / Ctrl or C |
| Throttle up / down (helm) | W / S (tap = quarter step, hold = ramp) |
| Fire | Left mouse button / Space |
| Look | Mouse (right-drag to free-look without turning the ship) |
| Roll (EVA) | A / D while free-looking |
| Interact / board / exit | E |
| Dock / undock | F |
| Set course to selected target | T |
| Warp to selected target | J |
| Toggle cruise | C (helm) |
| Cut throttle / cancel autopilot | X (helm) |
| Course to nearest fuel pump | L |
| Launch / recall drone | G |
| Drop bomb (drone mode) | B |
| Open map | M |
| Pause | P |
| Open media player | V |
| Next track | N |
| Open cargo/storage | I |
| Open help | H |
| Screenshot | K |
| Close any open panel | Esc |

### Gamepad (PS5 / Xbox)

**Not implemented in this build.** `js/game.js` has no gamepad polling of any
kind today (checked: no reference to `Gamepad`, `getGamepads`, or any
`gamepad` string anywhere in `js/`). Do not publish PS5/Xbox controls in this
README until they exist and are tested — see
`docs/specs/part2-opensource-release.md` §6 for the minimal addition needed,
and add a gamepad row to this table only once `node tools/test.mjs` has a
passing gamepad-input check.

## Running locally

Requires Node.js. No build step, no dependencies (no `package.json` — it's
static ES modules loaded straight from `js/`, with three.js pulled from a CDN
via an import map).

```
git clone https://github.com/ridelink0/doodle-voyager.git
cd doodle-voyager
node tools/serve.mjs --port 5178
```

Then open http://127.0.0.1:5178/. To rebuild the astronomical data from its
live sources (NASA Exoplanet Archive, OpenNGC, HYG, Wikipedia):

```
node tools/build-data.mjs
```

## Tests

Headless end-to-end tests drive the real game in Chrome over the DevTools
protocol and assert on live game state (not screenshots):

```
node tools/test.mjs
```

## Screenshots

_TODO before first public release: capture and embed 4-6 screenshots covering
title, helm/flight, on-foot ship interior, EVA, combat and the map, at
1920x1080. Store them under `docs/screenshots/` and reference with relative
Markdown image links (`![Helm](docs/screenshots/helm.png)`) so they render on
GitHub without any external host. Do not embed a placeholder image — leave
this TODO until real captures exist (Gev's "never pass a placeholder off as
real" rule)._

## How it was built

Made by Gev [— see docs/specs/part2-opensource-release.md §0: pick the exact
credit line here once confirmed, do not leave "Opus 5.5" unverified].
Built through orchestrated Claude Code agent workflows: a team of Claude
agents worked from written specs (`docs/specs/`), a shared story bible
(`docs/STORY.md`) and a shared plan (`docs/PLAN.md`), each spec authored by
one agent for another to implement. See `docs/PLAN.md` and `docs/HANDOFF.md`
for the architecture and development history.

## Credits

Doodle Voyager is a fan sequel to **Doodle Shooter**
(doodleshooter.vercel.app). See `NOTICE.md` for full data and engine credits,
and `docs/STORY.md` for the full tribute note and research sources.

## License

Code: MIT (see `LICENSE`). Data files keep their own upstream licenses — see
`NOTICE.md`.
````

Notes for whoever fills this in:

- The "Screenshots" section is deliberately a TODO, not a fabricated list —
  nobody has captured release screenshots yet (`tools/.shots/` holds test-run
  captures at 1280x720 that are functional debug shots, not curated release
  screenshots, and they're excluded from the repo per §1b anyway).
- The "How it was built" line has a live placeholder bracket — resolve §0
  before publishing, don't ship the bracket text itself.

---

## 4. Git history — publish as-is or squash?

**Recommendation: squash to one clean initial commit.** Reasoning:

- Everything in this repo was produced in a single day (2026-09-24) by
  several AI agents working from internal specs, with commit messages that
  will likely reference internal process ("part 1", agent-to-agent handoffs,
  session/task framing) rather than being written for a public audience. A
  clean single "Initial release" commit reads better to an outside contributor
  and avoids exposing the day's internal back-and-forth (nothing secret was
  found in it, but it's not useful public history either — there's no earlier
  released version to diff against).
- Today's baseline commit message itself (`9631968 Baseline before the
  2026-09-24 overhaul`) is exactly the kind of internal-process phrasing that
  reads oddly as public commit #1 of an open-source project.

**But this is a judgement call for whoever publishes, not a fixed rule** — if
by publish time the commits from part 1's agents turn out to be clean,
professional, useful messages with no scratch/internal-tool references, keeping
history costs nothing and preserves a real changelog. Decide by actually
reading the log right before publishing:

```bash
git log --oneline           # [RE-CHECK] read every message before deciding
```

### Path A — squash to one commit (recommended default)

```bash
cd D:/doodle-voyager
# after applying §1e's git rm --cached and committing .gitignore/LICENSE/NOTICE.md/README.md
git checkout --orphan release-init
git add -A
git status                                   # review — must match §1 exclude list
git commit -m "Doodle Voyager: initial public release"
git branch -D master
git branch -m master
git log --oneline                            # must show exactly one commit
```

### Path B — keep full history

```bash
cd D:/doodle-voyager
git add .gitignore LICENSE NOTICE.md README.md
git commit -m "Add open-source release files: license, notice, gitignore, README"
# then the git rm --cached from §1e as its own commit
git rm -r --cached tools/.scratch tools/.shots assets/videos/*.mp4 \
  docs/monitor-log.md docs/monitor-run.log docs/server-run.log docs/monitor
git commit -m "Remove dev scratch, logs and unlicensed sample media from tracking"
```

Either way, **run the secrets scan in §5 after whichever path you take and
before pushing**, since a squash changes what `git log -p` would show but a
kept history means every one of today's commits is individually inspectable
forever once pushed — a stronger reason to scan carefully under Path B.

---

## 5. Secrets scan — exact commands to run immediately before push

All of these returned clean when I ran them read-only during spec research;
re-run them on the final tree right before publishing, since more commits are
landing from part 1 agents after this spec was written:

```bash
cd D:/doodle-voyager

# Personal paths, machine username, common key/token shapes
git grep -InE "C:\\\\Users|C:/Users|OWNER|AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{20,}|eyJhbGciOi|VERCEL_TOKEN|SUPABASE.*KEY" -- . ':!tools/.scratch' ':!dist'

# Any accidental .vercel / .env / credentials files ever tracked
git log --all --diff-filter=A --name-only | grep -iE "\.vercel|\.env|credential|keystore|\.pem$|\.key$"

# Confirm the scratch/dist/log exclusions actually took (should all be empty)
git ls-files tools/.scratch | wc -l
git ls-files dist | wc -l
git ls-files | grep -E "docs/monitor-log\.md|docs/.*\.log|docs/monitor/"

# Working tree is fully clean before publish
git status --porcelain
```

If any of the grep commands return a hit, stop and inspect it — do not push
until it's resolved (redact, remove from history with `git filter-repo` if
already committed, or confirm it's a false positive like the word
"keystroke").

---

## 6. Gamepad controls — not currently implemented (flagged gap)

The release brief asked the README to document PS5/Xbox controls. There is
**no gamepad support anywhere in `js/game.js` or any other module today** —
confirmed by a repo-wide grep for `Gamepad`/`getGamepads`, zero hits. Per
Gev's "never pass a placeholder off as real" and "functionality over UI"
rules, the README in §3 above documents this honestly (a "not implemented"
row) rather than inventing a control scheme nobody can test.

If Gev wants real gamepad support before or shortly after release, here is
the minimal, testable addition for whoever implements it (not built by this
spec — read-only):

- **New function expected in `js/game.js`**: `pollGamepad()`, called once per
  frame from the same place the keyboard `keys` set is read (the `update(dt)`
  loop, alongside the existing `keys.has('KeyW')`-style checks around lines
  724-793, 1377-1382, 1523-1528). It should read `navigator.getGamepads()[0]`
  each frame (no `gamepadconnected` state machine needed for a first cut — a
  live poll degrades safely to "no gamepad" when none is present) and write
  into the *same* movement/aim intermediates the keyboard path already
  produces, so combat/flight/EVA logic doesn't need to branch on input
  source.
- **Suggested mapping** (standard `Gamepad.mapping === 'standard'` layout,
  works for both Xbox and DualSense over the W3C Gamepad API — button/axis
  indices are the same for both pads under the standard mapping):

  | Action | Xbox | PS5 | Gamepad API |
  |---|---|---|---|
  | Move / strafe | Left stick | Left stick | axes[0], axes[1] |
  | Look / aim | Right stick | Right stick | axes[2], axes[3] |
  | Fire | Right trigger (RT) | R2 | buttons[7] |
  | Throttle up / down | Right stick Y (helm mode) or D-pad up/down | same | axes[3] or buttons[12]/[13] |
  | Jump (on foot) | A | Cross | buttons[0] |
  | Interact / board | X | Square | buttons[2] |
  | Dock / undock | Y | Triangle | buttons[3] |
  | Set course | B | Circle | buttons[1] |
  | Open map | Start/Menu | Options | buttons[9] |
  | Pause | View/Back | Share/Create | buttons[8] |
  | Cycle target | Bumpers (LB/RB) | L1/R1 | buttons[4]/[5] |
- **Deadzone**: apply a 0.15 radial deadzone on both sticks before use (a
  bare `Math.abs(v) > 0.15` per-axis check is enough for a first cut; a
  proper radial deadzone can follow later).
- **Test to add** to `tools/test.mjs`: headless Chrome/CDP can't emulate a
  real gamepad, so this can't be a full input-simulation test. The real,
  automatable check is a **contract test**: assert `typeof window.__dv.pollGamepad
  === 'function'` and that calling it with no gamepad connected doesn't throw
  and doesn't change `window.__dv.ship.throttle` or player position (a no-op
  when idle). That's a genuine assertion on game state, not a screenshot, and
  it at least catches "function was removed/renamed" and "throws when no pad
  is connected" regressions. Manual verification with a real controller is
  still required before claiming gamepad support works — do not mark this
  done from the automated check alone.

This is scoped as an optional follow-up, not a blocker for publishing the
repo — ship with the "not implemented" README row (§3) if there's no time
before the release Gev wants, and add the row for real once this lands and is
manually verified with a physical controller.

---

## 7. Tests to add for the release itself

These are new checks for `tools/test.mjs` (or a small new
`tools/test-release.mjs` if the team prefers keeping game-behavior tests
separate from repo-hygiene tests — either is fine, but they must be
assertions on real state, never a screenshot eyeball):

1. **No scratch/dist files tracked** — a Node script check, not a browser
   check:
   ```js
   import { execSync } from 'node:child_process';
   const scratch = execSync('git ls-files tools/.scratch tools/.shots dist', { cwd: repoRoot }).toString().trim();
   assert.strictEqual(scratch, '', 'scratch/dist files must not be tracked');
   ```
2. **LICENSE, NOTICE.md, README.md, .gitignore all exist at repo root** —
   `fs.existsSync` on each of the four paths; fail if any is missing.
3. **No personal-path/secret patterns in any tracked file** — re-run the §5
   grep patterns from Node via `execSync('git grep ...')`, treating a
   non-empty result as a failing assertion (git grep exits 1 when nothing
   matches, so check for exit code 1 = pass, exit code 0 with output = fail).
4. **`data/*.json` each still has a non-empty `source` field** — load each of
   the four `data/*.json` files and assert `typeof parsed.source === 'string'
   && parsed.source.length > 0`. This is a real regression guard: if
   `tools/build-data.mjs` is ever edited and drops the `source` field, the
   license attribution silently breaks.
5. **`assets/videos/*.mp4` are not tracked** (until §1c is resolved) —
   `git ls-files assets/videos/*.mp4` must be empty; `manifest.json` may still
   be tracked.
6. **The existing `node tools/test.mjs` suite still passes** — the release
   changes (`.gitignore`, `git rm --cached`) must not touch anything the
   running game reads at runtime; re-run the full existing suite as a
   regression gate (per HANDOFF.md, last known state 40/41 or 41/41 — check
   the current number, don't hardcode an old one).

---

## 8. Trademark flag carried over from `docs/STORY.md`

`docs/STORY.md` (line 151) already flags that the ship spec name "Wite-Out"
is a real BIC trademark and should be renamed for the shipped/public name —
**"Correction Fluid"** is the STORY.md-recommended public name. As of this
spec, `js/game.js`/`js/ships.js` don't reference "Wite-Out" in the shipped
code (grep clean), but **`docs/specs/ship-roster.md` (part 1, in progress)
still uses it** — the internal id `witeout` and the display name "Wite-Out"
appear at lines 93, 155 and 435 of that spec as of this writing. Before
publishing publicly:

- `[RE-CHECK]` grep `js/`, `data/`, and the final `docs/specs/ship-roster.md`
  for `Wite-Out` / `witeout` once part 1 lands, and confirm the **player-facing
  name** shown in the game and any README/screenshot is "Correction Fluid",
  not "Wite-Out". The internal id string (`witeout`) is not itself a public
  trademark use and doesn't need to change, but any player-visible text does.

---

## 9. Exact GitHub commands

Confirmed this session: `gh` is installed and knows the target account
(`gh auth status` reported `Active account: true` for `ridelink0`) but the
call **timed out on the credential keyring** rather than completing cleanly —
```
github.com
  X Timeout trying to log in to github.com account ridelink0 (keyring)
  - Active account: true
```
**This must be resolved before any publish command is run** — re-run
`gh auth status` and, if it still times out, `gh auth login` (or unlock/repair
whatever credential manager the keyring is backed by on this machine) until it
returns cleanly. Do not attempt `gh repo create` against a session that just
timed out on its own auth check.

```bash
cd D:/doodle-voyager

# 0. Confirm auth is actually healthy (re-run, don't trust the earlier failed check)
gh auth status

# 1. Create the repo from the local working tree and push it
#    (run this from the finished, cleaned, license-added working tree —
#    after §1e, §2, §3 and either §4 Path A or B are all done)
gh repo create ridelink0/doodle-voyager \
  --public \
  --source . \
  --description "A first-person space shooter built from real astronomical catalogues, with a fictional story — a fan sequel to Doodle Shooter." \
  --homepage "https://doodle-voyager.vercel.app" \
  --push

# 2. Topics (gh repo create has no --topic flag; set them after creation)
gh repo edit ridelink0/doodle-voyager \
  --add-topic threejs \
  --add-topic browser-game \
  --add-topic space-game \
  --add-topic javascript \
  --add-topic webgl \
  --add-topic astronomy \
  --add-topic procedural-generation \
  --add-topic no-build

# 3. Double-check the repo settings landed as intended
gh repo view ridelink0/doodle-voyager --json description,homepageUrl,repositoryTopics
```

Notes:

- `--source .` with `--push` requires the local repo to already have its
  remote history in the state you want published (i.e. do §1e/§2/§3/§4
  *before* this command, not after — `gh repo create --push` pushes whatever
  `HEAD` is at the moment you run it).
- If `gh repo create` is re-run after a failed first attempt, check
  `gh repo view ridelink0/doodle-voyager` first — a partially-created remote
  repo from a failed push should be deleted (`gh repo delete
  ridelink0/doodle-voyager --yes`, only with Gev's explicit go-ahead) rather
  than layered on top of.
- `--public` is explicit and intentional per the task; don't default to
  private and don't ask to confirm it again unless something above (the
  license/secrets checks) actually failed.

---

## 10. Post-publish verification

Run from a clean clone, never from the working directory that just pushed —
this is the only way to actually prove what's public matches what was
intended, rather than trusting the local tree:

```bash
mkdir -p D:/tmp-dv
git clone https://github.com/ridelink0/doodle-voyager.git D:/tmp-dv/clone
cd D:/tmp-dv/clone

# 1. Confirm the exclude list actually took effect on the PUBLISHED repo
git ls-files | grep -E "tools/\.scratch|tools/\.shots|^dist/" && echo "FAIL: excluded paths present" || echo "OK: nothing excluded is present"
ls assets/videos/*.mp4 2>/dev/null && echo "FAIL: unlicensed videos present" || echo "OK: no mp4s shipped"

# 2. Confirm the required files exist
for f in LICENSE NOTICE.md README.md .gitignore; do test -f "$f" && echo "OK: $f" || echo "FAIL: missing $f"; done

# 3. Run it for real from the clone
node tools/serve.mjs --port 5179 &
sleep 1
node tools/test.mjs --url http://127.0.0.1:5179/
kill %1

# 4. Re-run the secrets grep against the published clone as a final check
git grep -InE "C:\\\\Users|C:/Users|OWNER" -- . ':!tools/.scratch' 2>&1 || echo "OK: clean"
```

A pass here means: the public repo builds and runs standalone with nothing
missing, ships no excluded/unlicensed content, and the test suite (the same
one anyone cloning the repo would run) is genuinely green against the clone,
not just the dev machine's long-lived working tree.

---

## Summary checklist (do in this order)

1. Resolve `gh auth status`'s keyring timeout (§9).
2. Decide the real credit line with Gev — do not ship "Opus 5.5" unverified (§0).
3. Decide the video license question with Gev, or ship without the 3 mp4s (§1c).
4. `[RE-CHECK]` re-grep for Wite-Out in whatever `docs/specs/ship-roster.md`
   and the code look like once part 1 lands (§8).
5. Add `.gitignore`, `LICENSE`, `NOTICE.md`, `README.md` (§1d, §2a, §2c, §3).
6. `git rm --cached` the scratch/dist/log/video paths (§1e).
7. Re-read `git log --oneline` and choose squash (Path A, default) or keep
   history (Path B) (§4).
8. Run every command in §5 (secrets scan) — must all come back clean.
9. `gh repo create ... --push`, then topics/description (§9).
10. Clone fresh to `D:/tmp-dv/clone` and verify per §10 — must fully pass
    before telling Gev it's live.
