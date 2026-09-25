# References: shaders, PBR, and neon hand-drawn look

Gathered 2026-09-24 for the neon-ink first-person space shooter. Sources are
either (a) the UFS awards corpus (`cinematic-web-design/skills/ultimate-frontend-skills/data/awards.json`
and `references/games.md`, both already fetched/verified in an earlier UFS
session — reused here, not re-fetched), or (b) fetched live this session with
WebFetch/WebSearch. Anything not independently confirmed by a full page fetch
is marked **UNVERIFIED** — treat those as leads, not settled fact.

Current game state for context: `js/mats.js` builds neon-ink materials by
patching `MeshLambertMaterial` with `onBeforeCompile` (object-space pen
hatching + a fresnel rim on top of real Lambert lighting); `js/render.js` runs
`EffectComposer` → composite pass → `UnrealBloomPass(strength 0.85, radius
0.45, threshold 0.85)`, with `renderer.outputColorSpace =
THREE.LinearSRGBColorSpace` set by hand because the composite already
gamma-encodes; `js/ships.js` builds hulls from primitives; `js/universe.js`
draws planets and sights.

---

## 1. Doodle District — https://doodleshooter.vercel.app

**Source:** UFS corpus, `references/games.md` Exhibit 1 (fetched and rendered
in that session; CSS/JS pulled directly). Reused here, not re-fetched.

**What to take:** the strongest same-genre precedent — a scribbled, hand-drawn
first-person shooter that reads as human-made rather than templated. Concrete,
transferable details: `mix-blend-mode: multiply` on every HUD element so ink
sits *on* the backdrop instead of floating in a flat layer; a unique
asymmetric `border-radius` and a unique small rotation on every panel (never
one shared "wobble" token); hard unblurred offset drop-shadows instead of soft
glow; verbatim, oddly specific control-legend copy and a death message that
puns on the game's own conceit ("OFF THE PAGE") instead of "GAME OVER."

**Where it applies:** the HTML/CSS HUD layer around the canvas (if
doodle-voyager has one) and general copy voice — not `mats.js`/`render.js`
directly, since those already commit to real 3D neon-ink rather than a paper
overlay. Worth a pass on any UI chrome text and button styling.

---

## 2. Whiteout — https://whiteout.plgb.chatgpt.site

**Source:** UFS corpus, `references/games.md` Exhibit 2. Reused, not
re-fetched.

**What to take:** an anti-reference — what an AI-flavoured "cinematic dark
sci-fi" UI looks like and why it reads generic: near-monochrome navy
(`#111b24`) plus exactly one restrained accent (`#bf9271` copper) chosen for
looking "premium" rather than for fitting the fiction (a *snow* game with a
*copper* accent). Barlow Condensed as the bold-caps display font, uniform
`.065em` tracking regardless of context, and a literal `.eyebrow` CSS class —
generic marketing vocabulary grafted onto a game UI.

**Where it applies:** a checklist for what to avoid in any HUD/menu chrome —
don't pick one "premium" accent color divorced from what's actually lit in
the world; don't reach for a condensed grotesque by default. The game's own
five in-game rendering lessons (below) already correct the render-side version
of this mistake.

---

## 3. Rainy Worlds — https://rainyworlds.com/

**Source:** UFS corpus (`awards.json` id `rainy-worlds`), verified: true,
fetched from served HTML/Vite bundle in that session (not visually rendered —
render timed out on WebGPU in headless Chrome). Reused here.

**What to take:** a full named, tunable TSL post-processing chain built on
`three/webgpu` with a `forceWebGL` fallback — exactly doodle-voyager's stack
shape (composite + bloom). Concrete numbers worth testing against the game's
own `UnrealBloomPass(0.85, 0.45, 0.85)`: TAA with 0.14 sharpen, saturation
1.58 / contrast 1.13 grade, vignette 0.28, grain 0.022, chromatic aberration
0.006, plus a LOW/MEDIUM/HIGH quality tier system with a backend note shown on
the start card. Palette read from the served HTML: cold wet ground `#0b0d0f`,
text `#cfd6dc`, warm accent `#e9b9ad`/`#ffd9c2` against the cold greys — one
warm note against a cold field, the same move doodle-voyager's palette makes
(violet-steel silhouette + colour only on emitters).

**Where it applies:** `js/render.js` — the vignette/grain/chromatic-aberration
values are a concrete starting point if the composite ever grows those passes;
the quality-tier pattern (LOW/MEDIUM/HIGH with a note on what changes) is a
model for a settings-driven bloom/motion-blur quality toggle if one doesn't
exist yet.

---

## 4. Messenger (Abeto) — https://messenger.abeto.co/

**Source:** UFS corpus (`awards.json` id `messenger-abeto`), **verified:
false** — listed as an Awwwards Site-of-the-Year entry, not independently
re-fetched and rendered in that session. Treat the specifics below as
UNVERIFIED beyond the awards-page citation.

**What to take (if confirmed):** a real-time WebGL planet, cel-shaded
low-poly, saturated per-biome palette ("Jet Set Radio-adjacent" rather than a
corporate brand system), minimal in-world UI chrome that stays out of the way
of the 3D itself, and live WebSocket multiplayer avatars visible on the same
shared planet. The proof point cited: Awwwards' top developer prize went to a
literal playable WebGL world, not a scroll-driven marketing site.

**Where it applies:** `js/universe.js` (planet rendering — the low-poly
cel-shaded planet-as-navigable-object idea) and as a reminder that the bar for
this genre is a real playable 3D world, not a static hero render.

---

## 5. Maxime Heckel — "Moebius-style post-processing" — https://blog.maximeheckel.com/posts/moebius-style-post-processing/

**Source:** fetched live this session with WebFetch. Confirmed content.

**What to take:** the clearest published breakdown of exactly the kind of
pass doodle-voyager's post-stack is doing. Three passes: a `DepthTexture` for
outer silhouette edges, a `scene.overrideMaterial` normal pass for internal
edges/corners, then a Sobel filter (two 3×3 kernels) combining
`gradientDepth * 25.0 + gradientNormal` (depth weighted more heavily). The
hand-drawn feel doesn't come from the edges alone — displacement from a
sinusoidal function plus a hash-based random offset turns straight Sobel
lines into "elongated waves" that read as sketchy rather than vector-clean.
Shadow stylization is a separate, explicit choice with three named options:
tonal thresholds (luma ≤ 0.35/0.45/0.6/0.75), crosshatching via `mod()` at
increasing density as luminance drops, or a raster dot grid. Specular
highlights are baked into the normal-pass material itself so the Sobel filter
picks them up — the specular reads as an ink accent, not a photoreal
highlight.

**Where it applies:** `js/mats.js` and `js/render.js` directly. The
crosshatch-density-by-luminance idea is the same shape as the game's own
object-space hatching (`uHatchDirs`, `uHatchK`, `uLitRef`) but done as a
post-pass rather than in-material — worth comparing against the game's own
lesson #1 ("keep real lighting in the materials, stylize there, let the post
pass only add edges") since this reference does edges *and* shadow
stylization both as post passes, which is the opposite split. The
depth-weighted-over-normal Sobel combination (25:1) is a concrete tuning
value if `render.js`'s own edge pass ever needs rebalancing.

---

## 6. webgl-outlines (Omar Shehata) — https://github.com/OmarShehata/webgl-outlines

**Source:** fetched live this session with WebFetch. Confirmed content
(README-level detail; specific Sobel constants not in the fetched excerpt).

**What to take:** a maintained reference implementation of exactly
doodle-voyager's edge-pass shape — "a post-process shader that takes the
depth buffer and a surface normal buffer as inputs, followed by an FXAA
pass," ported for both Three.js and PlayCanvas, with a GUI exposing all
parameters and a documented pattern for applying outlines selectively to a
subset of objects rather than the whole scene.

**Where it applies:** `js/render.js` — a second, code-level reference to
diff the game's current material-ID / depth / normal edge pass against,
especially for the "restrict colour edges to materials without hatching"
rule already learned (lesson #3 below) and for the selective-outline pattern
if enemies or interactable objects ever need a distinct outline treatment
from the rest of the scene.

---

## 7. Codrops — "Sketchy Pencil Effect with Three.js Post-Processing" — https://tympanus.net/codrops/2022/11/29/sketchy-pencil-effect-with-three-js-post-processing/

**Source:** fetched live this session with WebFetch. Confirmed content.

**What to take:** a `PencilLinesPass` chained after a normal `RenderPass`,
re-rendering the scene with `MeshNormalMaterial` into a separate target for
edge input. Combines three signal sources rather than one: a Sobel operator
for hard edges (`smoothstep(0.01, 0.03, sobelValue)` as the tunable
threshold), Inigo Quilez's gradient-noise function for stippled shading on
curved surfaces, and a Photoshop-made clouds texture used to *distort the
sampling coordinates* so lines squiggle instead of running dead straight
(cited weights: diffuse × 0.6, normals × 0.3, a 50-unit cutoff range on the
cloud distortion). Line colour is a plain tunable RGB, not always black.

**Where it applies:** `js/mats.js` — the cloud-texture coordinate-distortion
trick is a concrete, cheap way to make the existing hatch lines (`dvLine` /
`dvNoise` in `mats.js`) waver like a real pen stroke instead of reading as a
perfectly regular procedural stripe, without changing the object-space
approach the game already committed to.

---

## 8. TRON: Legacy cinematography (Claudio Miranda) — UNVERIFIED, found via WebSearch, not independently fetched from a primary source

**What to take (as reported, not independently confirmed):** the reference
case for "neon means a dark city lit by its signs" — a near-black world where
neon reads because almost nothing else is lit. Reported palette: blacks, neon
blue and red, with translucent blue/green/teal/white specifically inside the
Grid architecture; the Light Cycle arena is a white line grid on flat black
ground with no ambient fill implied.

**Where it applies:** validates doodle-voyager's own lesson #4 below almost
exactly (dark surfaces, dim silhouette lines, colour only on emitters) — cite
as the film reference for that rule when explaining it to anyone unfamiliar
with the look, but don't treat the specific hex values above as sourced;
re-derive palette numbers from the game's own `PAL` table in `mats.js`.

---

## 9. Hyper Light Drifter — UNVERIFIED, found via WebSearch (secondary sources: Wikipedia, Gamedeveloper.com, Medium UI breakdown), not independently fetched

**What to take (as reported):** bold, high-contrast neon-on-dark palette used
to carry mood without literal realism — cited as "neon-drenched," bright
colour reserved for specific elements against darker grounds, a lineage the
articles trace to prog-rock album art rather than photoreal sci-fi.

**Where it applies:** a mood/palette touchstone for enemy and pickup colour
coding in `js/ships.js` / `js/universe.js` — pick 2-3 saturated identity
colours per enemy/faction the way HLD uses colour to mark region and
danger, rather than one uniform neon tint everywhere.

---

## 10. Return of the Obra Dinn — UNVERIFIED, found via WebSearch (PlayStation Blog, PC Gamer, Alan Zucconi, GitHub dithering implementations), not independently fetched

**What to take (as reported):** the technique is a per-object dithering
shader — smooth-lit render first, then a blue-noise threshold pattern applied
*per object in its own space* rather than to the final screen composite,
specifically so the dither pattern stays attached to each surface as it moves
instead of swimming/flickering. That's the same structural decision
doodle-voyager's hatching already made (object-space hatching so stripes
"are fixed to the surface" rather than swimming as the ship moves) —
independent confirmation the approach is the right one for a moving
first-person rig, from a completely different stylization (1-bit dither vs.
pen hatching).

**Where it applies:** no direct code change — cited as validation for the
object-space design already in `js/mats.js` (`vDvLocal`/`vDvLocalN` comment:
"the game draws everything relative to the moving ship, so world space would
make the stripes swim").

---

## 11. EVE Online ship/UI design — UNVERIFIED, found via WebSearch (community/dev-blog sources: eveonline.com dev blogs, community wiki, SVG silhouette fan project), not independently fetched from a primary dev-blog page

**What to take (as reported):** a stated design rule from CCP's own UI
strategy — ship classes get a shared "base shape" with size-specific
"bulkiness" so silhouette alone communicates class and role at a glance,
before colour or detail. General shapes identify category, specific shapes
identify purpose, sized to show variant.

**Where it applies:** `js/ships.js` — if new hull types are added, silhouette
(the primitive shapes chosen, viewed as a flat dark shape against the
violet-steel rim light) is worth designing for readability first, the way
the game's neon-ink look already relies on silhouette over surface detail.

---

## 12. Everspace 2 — UNVERIFIED, found via WebSearch (Wikipedia, Steam community threads, fan wiki), not independently fetched

**What to take (as reported):** ship customization is explicitly emissive-
and-decal driven rather than full repaints — paint job, emissive light
colour, and engine colour are three separate tunable channels on the same
hull, plus decals and window tint. Matches doodle-voyager's own material
philosophy (colour only on emitters, not full-surface tint).

**Where it applies:** `js/ships.js` / `js/mats.js` — if player/enemy ship
variants are ever needed, model them as swapping the emitter colours (engine
glow, running lights, cockpit screen colour) on one shared hull material
rather than authoring new hull colours, which is cheaper and matches the
"colour only on emitters" rule already in place.

---

## 13. Poly Haven — https://polyhaven.com/textures (metal category) — CC0 PBR source, usable now

**Source:** UFS tool (`scripts/assets.mjs`, run this session) states plainly
in its own `--help` output: "Poly Haven and ambientCG are both CC0 1.0:
commercial use, no attribution, no key." A direct WebFetch of the textures
page returned only the page shell (client-rendered listing, JS wall) so the
specific per-texture map list/resolutions were **not** independently
confirmed this session — the CC0-license claim above comes from the UFS
tool's own printed statement, not from a page fetch.

**What to take:** a real, usable pipeline, not a reference to imitate — run
`node C:/Users/OWNER/cinematic-web-design/scripts/assets.mjs textures
<slug> --res 2k --out <dir>` to pull a CC0 metal/panel PBR set with
provenance and a ready-made three.js material snippet. Useful as a base layer
under the neon-ink material patch (`mats.js` reads real lit colour before
adding hatching/rim, so a properly rough/metallic base still matters even
though the final look is stylised).

**Where it applies:** any place doodle-voyager wants a PBR texture set as the
base under the neon-ink `onBeforeCompile` patch — hull panels, station
interiors — via `assets.mjs textures`, not hand-authored.

---

## 14. 3dtextures.me — sci-fi / spaceship tag — https://3dtextures.me/tag/spaceship/ and /tag/scifi/ — UNVERIFIED, found via WebSearch only

**What to take (as reported):** a CC0, hand-authored (not photo-scanned) PBR
texture library specifically tagged for sci-fi metal panels, with the full
map set (diffuse/normal/metallic/displacement/roughness/AO) per texture —
complementary to Poly Haven's real-world scans when the look needs to read
as designed sci-fi hull plating rather than realistic worn metal.

**Where it applies:** same as #13, an alternate source for `js/ships.js` hull
panel textures when a more stylised, less "photographed" sci-fi panel look is
wanted than Poly Haven's scanned sets — not yet wired into `assets.mjs`
(which targets Poly Haven and ambientCG), so pulling from this source would
be a manual download, not a scripted one.

---

## 15. Fresnel rim-light references — GitHub `OtanoStudio/Fresnel-Shader-Material`, Discourse threads on threejs forum, Three.js Roadmap "Rim Lighting Shader" post — UNVERIFIED, found via WebSearch only, not fetched

**What to take (as reported, general knowledge of the technique, not
independently confirmed from these specific pages):** fresnel rim lighting is
computed from the dot product of the surface normal and view direction,
raised to a power to control the width of the rim glow, then multiplied by an
intensity/colour uniform — which is exactly the shape of `uRimColor` /
`uRimStrength` already implemented in `js/mats.js`.

**Where it applies:** `js/mats.js` — these are cross-check sources for the
existing fresnel rim implementation, not new technique to add; worth a
diff-read if the rim ever needs a second control (e.g. a separate power
exponent) beyond the current strength/colour pair.

---

## Blender and headless pipeline

**Blender: found.** Version 5.2.1 LTS at `C:\Program Files\Blender
Foundation\Blender 5.2\blender.exe`, confirmed via
`node scripts/blender.mjs probe`. `scripts/blender.mjs` (probe / run / glb /
bake / frames) with templates in `scripts/blender/*.py` is available for
anything that needs real modelling, baking, or non-procedural geometry —
still prefer procedural three.js geometry in `js/ships.js` for anything
simple, per the UFS tool's own guidance ("Stage 4 can model, bake and
render. Still prefer procedural three.js when the object is simple").

No Blender-specific external references were fetched this session beyond
confirming the local install works — the shader/hand-drawn/PBR references
above are the ones relevant to doodle-voyager's actual `mats.js`/`render.js`
approach, which does not currently depend on baked Blender assets.

---

## The five in-game rendering lessons (already learned, from `games.md`)

Recorded in `C:/Users/OWNER/cinematic-web-design/skills/ultimate-frontend-skills/references/games.md`
under "In-game rendering: five mistakes Doodle Voyager made (2026-09-24)" —
reproduced here verbatim in summary since they are the most directly
applicable references of all, already specific to this codebase:

1. A stylised post pass that replaces lighting makes everything flat and
   white — keep real lighting in the material (`MeshLambertMaterial` +
   `onBeforeCompile`, hatching drawn from the light that actually arrived),
   let the post pass only add edges/background/bloom.
2. Bloom double-encodes gamma if the composite already does — with
   `EffectComposer` + composite `ShaderPass` + `UnrealBloomPass`, either keep
   the chain linear and end with `OutputPass`, or set
   `renderer.outputColorSpace = THREE.LinearSRGBColorSpace` by hand (this is
   what `render.js` does today).
3. Colour-difference edge detection outlines every hatch stroke once hatching
   moves into the material — restrict colour edges to materials without
   hatching; keep depth/background/material-ID edges.
4. "Neon" means a dark city lit by its signs, not every surface glowing —
   dark surfaces, dim silhouette lines, low fill light (hemisphere ~0.3
   inside a cabin), colour only on emitters (screens, lamps, signs, engines,
   enemies); let the bloom threshold catch only those.
5. Check the game at the sizes it's played at — `webdesign.mjs look --game`
   at 1366/1280/1920; a keyboard-and-mouse game proves nothing at 390px.

---

## Summary: tool inventory (this machine, this session)

- **Blender:** found — 5.2.1 LTS, `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`
- **ffmpeg:** found — 9.0.1 full build (gyan.dev), on PATH
- **Python:** found — 3.13.7, plus `rembg` installed (photo → subject/background/mask cutout)
- **Image generation credential:** none found. Checked env vars
  `TOGETHER_API_KEY`, `FAL_KEY`, `BFL_API_KEY`, `STABILITY_API_KEY`,
  `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY` (presence only, no
  values read or printed) — all absent, confirmed independently by
  `assets.mjs gen --json`'s own `envKeys: []`. A key-free route exists:
  `assets.mjs gen "<prompt>" --model pollinations` (pollinations.ai,
  max 768px, 3-44s, output licence unverified — usable as a texture/plate
  source, not confirmed clear for a paying client site). Separately, this
  Claude session has the `bloom` MCP connector's image-generation tools
  available (`generate_image` etc.) — that's a session-level connector, not a
  credential installed on this machine, and is a separate route from
  anything `assets.mjs` can see.
- **Local image generator (ComfyUI on :8188):** absent.
- **Disk:** C: has 11.5 GB free, D: has 443.5 GB free — matches the
  instruction to put anything large on D:; doodle-voyager already lives on D:.
