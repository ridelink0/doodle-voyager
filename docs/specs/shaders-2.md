# Shaders, round two — spec

Owner of this doc: research/design pass only, no game files touched. Written
for an implementer who has not read the sources below. Project root
`D:\doodle-voyager`; read `docs/HANDOFF.md` and `docs/PLAN.md` first for the
module contracts this spec assumes, then `docs/specs/neon-relook.md` — this
doc extends that one and reuses its vocabulary (ink, hatch, rim, boil, ID
channel) without re-explaining it.

**Do not implement from this doc without re-running `node tools/test.mjs`
first and reading its current pass count.** At research time (2026-09-24,
this session) it stood at **48/50**, not 50/50: `cruise drive goes faster
than sublight` (350 vs 330) and `gravity pulls a drifting ship toward a
planet` fail already, both unrelated to rendering. Neither is touched by
anything below. Fix or accept them separately; the floor for this work is
48/50 and "no console errors" green, not 50/50.

## 0. Method, and what was actually fetched this session

Real sources, fetched live this session, not recalled from training:

- **Limb darkening**, quadratic law: [Wikipedia, Limb darkening](https://en.wikipedia.org/wiki/Limb_darkening)
  — `I(μ)/I(1) = 1 − a₁(1−μ) − a₂(1−μ)²`, solar coefficients in the 0.3–0.35
  range. Cross-checked against real fitted values for a Sun-like G star
  (Teff 5950 K) from [Limb darkening and exoplanets II, MNRAS 457:3573](https://academic.oup.com/mnras/article/457/4/3573/2589014):
  u₁ = 0.279±0.033, u₂ = 0.351±0.016.
- **Atmosphere rim / terminator softness / cloud shadow**, concrete GLSL:
  [Sangil Lee, "Create a Realistic Earth with Shaders"](https://sangillee.com/2024-06-07-create-realistic-earth-with-shaders/)
  — the sigmoid terminator (`1/(1+exp(-k·cosθ))`), the squared/cubed Fresnel
  glow, the cloud-shadow UV-shift trick.
- **Fresnel rim, general**: [three.js Fresnel pattern](https://github.com/OtanoStudio/Fresnel-Shader-Material),
  [Rim Lighting Shader — threejsroadmap](https://threejsroadmap.com/blog/rim-lighting-shader) —
  confirms the `pow(1-dot(V,N), k)` shape this game already uses in
  `mats.js`; nothing new to take from it, cited for the "cheap atmosphere"
  discourse thread's context: [three.js forum, pseudo-realistic atmosphere on the cheap](https://discourse.threejs.org/t/creating-a-pseudo-realistic-planetary-atmosphere-on-the-cheap/40391).
- **Screen-space UV refraction** (heat haze / cracked glass): [Kyle Halladay, Screen Space Distortion](https://kylehalladay.com/blog/tutorial/2016/01/15/Screen-Space-Distortion.html)
  — sample a vector field, offset the UV before the main texture read,
  `uv - (distortion - 0.5) * strength`. This game has no spare distortion
  texture and shouldn't add one (see §7), so the spec below derives the same
  offset from a noise gradient instead of a texture, which is the technique's
  own fallback path.
- **FBM noise**, concrete code taken almost verbatim: [Mark Fixermark, WebGL fire shader based on FBM](https://blog.fixermark.com/posts/2025/webgl-fire-shader-based-on-fbm/)
  — the 4-octave `value += amplitude*noise(p); p *= 2.0; amplitude *= 0.5`
  loop, used below for planet cloud/band and (2-octave) star corona.
- **Cel shading / posterized tone**: [Wikipedia, Cel shading](https://en.wikipedia.org/wiki/Cel_shading)
  — "quantizing light intensity into discrete bands." Used in §6.
- **Stylized/ink NPR shading, academic grounding**: Barla & Thollot,
  [X-Toon: An Extended Toon Shader](https://maverick.inria.fr/Publications/2006/BTM06a/x-toon.pdf) —
  tone-mapped shading as a 1D lookup rather than a continuous ramp is the
  same idea as the posterize step in §6, cited for the "why" not the code.
- **Hyperspace / warp tunnels**, general technique survey (radial streak
  from screen centre, chromatic spreading toward the rim): search results
  for "sci-fi warp speed tunnel shader GLSL"; no single tutorial's code is
  used verbatim because `render.js` already has a working, tuned version of
  this (see §5) — extended in place rather than replaced.
- **three.js r0.170.0 shader internals**, fetched directly from the CDN this
  session to get injection points and built-in uniforms exactly right
  (not guessed): `meshbasic.glsl.js`, `meshlambert.glsl.js`,
  `opaque_fragment.glsl.js` and `WebGLProgram.js` from
  `https://cdn.jsdelivr.net/npm/three@0.170.0/src/...` — confirms
  `outgoingLight` exists and is safe to modify immediately before
  `#include <opaque_fragment>` in **both** MeshBasicMaterial and
  MeshLambertMaterial programs (this is exactly what `mats.js` already
  does), and confirms `cameraPosition` and `modelMatrix` are always
  available — no custom uniform needed for view direction in the star
  shader.

Tooling from `C:\Users\OWNER\cinematic-web-design` (the `ultimate-frontend-skills`
plugin), as instructed, read before doing anything else:

- **Blender: installed.** `node scripts/blender.mjs probe --json` found
  `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`, Blender
  5.2.1 LTS. (A second copy sits at `D:\blender\blender-4.5.13-windows-x64`,
  unused here.) Not needed for anything in this spec — every effect below is
  procedural GLSL, no baked mesh or texture. Noted for the next stage in
  case a future ask (e.g. a baked AO pass for the ship interiors) wants it.
- **`scripts/assets.mjs` (CC0 PBR + HDRI): checked, not used, and here is
  why rather than a placeholder.** `node scripts/assets.mjs search clouds`
  returns Poly Haven **HDRIs** (16K photographic sky domes: Furry Clouds,
  Wasteland Clouds) — real-world lighting environments, not a cloud
  *texture* for a planet surface, and not remotely the flat-shaded ink
  style. `search noise`, `search "cracked glass"`, `search planet` and
  `search "star surface"` all returned **zero results** — Poly Haven and
  ambientCG are ground-material and studio-lighting libraries for
  photoreal scenes; this is a stylised, textureless, procedural-ink game
  (confirmed again this session: `mats.js` and `universe.js` build every
  planet either from flat GLSL-hatched colour or a hand-drawn `CanvasTexture`,
  never an image file — the same finding `neon-relook.md` made about the
  reference game). Pulling in a photographic PBR set or HDRI here would
  contradict the art direction, add texture-memory and download weight the
  Chromebook budget doesn't want, and there is nothing on offer that fits
  anyway. Every "texture" below is GLSL, matching the existing codebase
  exactly. If a future ask genuinely wants a photographic ground material
  (a station interior floor, say) the tool is there and works; it just
  doesn't apply to this ask.

## 1. The rule this whole spec follows

`mats.js` already states it and every item below obeys it: **a quality knob
is a uniform, never a shader recompile.** `presetFor()` in `render.js` is the
one place that decides what a preset means; every new effect adds a field
there, not a second compiled variant. Nothing below adds a draw call, a
render target, or a `new` inside a per-frame function — every uniform update
is a `.value =` assignment on an object that already exists, matching
`render.js`'s own `render(t)`.

Draw-call accounting for this whole spec: **zero new draw calls.** Every
item is either (a) `onBeforeCompile` on a material that already exists and
is already drawn, or (b) an addition to the two `ShaderPass`es `render.js`
already runs (`composePass`, and the warp/damage code lives in the same
`POST_FS` as today). No new `EffectComposer` pass, no new `Mesh`, no new
`WebGLRenderTarget`.

## 2. Star shading — limb darkening + corona

**Current state** (`universe.js:219`): `new THREE.Mesh(SPHERE, glow(starColor(sys.star.teff)))`.
`glow()` (`mats.js:171`) is a flat, unlit `MeshBasicMaterial` — one solid
colour, bloom does all the work. `SPHERE` is a subdivision-3 icosahedron
(1,280 faces); at most a handful of these are ever on screen (the current
system's star, plus rarely a companion).

**New function, `mats.js`, does not touch `glow()`.** Lamps, screens and
signage keep using plain `glow()` unchanged — this is deliberately a
separate function so nothing else in the game's look shifts:

```js
// mats.js — new export, own program key, leaves glow() untouched
const STAR_FRAG_PARS = /* glsl */ `
varying vec3 vStN;
varying vec3 vStW;
uniform float uLD1, uLD2;      // quadratic limb-darkening coefficients
uniform float uCorona;         // 0 low preset (branch skipped), 1 medium/full
uniform float uCoronaK;        // corona strength, 0..1
uniform float uTime;           // SHARED.uTime, see below
float stHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float stNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = stHash(i), b = stHash(i + vec2(1.0, 0.0)), c = stHash(i + vec2(0.0, 1.0)), d = stHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`;
const STAR_VERT_PARS = /* glsl */ `varying vec3 vStN; varying vec3 vStW;`;
const STAR_VERT_MAIN = /* glsl */ `
vStN = normalize(mat3(modelMatrix) * normal);
vStW = (modelMatrix * vec4(transformed, 1.0)).xyz;`;
const STAR_FRAG_MAIN = /* glsl */ `
{
  vec3 n = normalize(vStN);
  vec3 v = normalize(cameraPosition - vStW);
  float mu = clamp(dot(n, v), 0.0, 1.0);
  // quadratic limb-darkening law, Wikipedia "Limb darkening"; coefficients
  // chosen at the strong end of the real G-star range (u1 .28-.35, u2 .32-.35,
  // MNRAS 457:3573) because the disc renders small on screen and the effect
  // needs to read at a glance, not match a photometric curve.
  float ld = 1.0 - uLD1 * (1.0 - mu) - uLD2 * (1.0 - mu) * (1.0 - mu);
  // never fully dark at the limb: a black ring falls under the bloom
  // threshold (0.85) and reads as a broken sphere, not a soft edge.
  outgoingLight *= clamp(ld, 0.22, 1.0);
  if (uCorona > 0.5) {
    float edge = 1.0 - mu;
    float n2 = stNoise(n.xy * 2.4 + uTime * 0.045) * 0.5 + stNoise(n.xy * 5.1 - uTime * 0.03) * 0.5;
    float flare = smoothstep(0.62, 1.0, edge) * (0.55 + 0.45 * n2);
    outgoingLight += outgoingLight * flare * uCoronaK * 1.6;
  }
}`;
const STAR_KEY = 'dv-neon-star-1';
export function starGlow(color) {
  return cached('star' + color, () => {
    const m = new THREE.MeshBasicMaterial({ color, blending: THREE.NoBlending, opacity: ID.GLOW });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uLD1 = { value: 0.35 };
      shader.uniforms.uLD2 = { value: 0.30 };
      shader.uniforms.uCorona = SHARED.uStarCorona;   // preset-driven, see §1
      shader.uniforms.uCoronaK = { value: 0.35 };
      shader.uniforms.uTime = SHARED.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${STAR_VERT_PARS}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${STAR_VERT_MAIN}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${STAR_FRAG_PARS}`)
        .replace('#include <opaque_fragment>', `${STAR_FRAG_MAIN}\n#include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => STAR_KEY;
    return m;
  });
}
```

`universe.js:219` changes one line: `glow(starColor(...))` → `starGlow(starColor(...))`.
Import `starGlow` instead of (or alongside) `glow`.

Add to `SHARED` in `mats.js`: `uTime: { value: 0 }` and
`uStarCorona: { value: 1 }`, plus an export `export function setTime(t) { SHARED.uTime.value = t; }`.
`render.js`'s `render(t)` gets one new line, `setTime(t)` (imported from
`mats.js`), right beside the existing `u.time.value = t;`. `applyPreset()`
gets `SHARED.uStarCorona.value = p.corona ? 1 : 0;` and `presetFor()` gains
a `corona` field: `false` on low, `true` on medium and full.

**Cost.** Per pixel: 1 `dot`, a 2-term polynomial (~5 ALU) always; on
medium/full, 2 `stNoise` calls (2×4 hashes) gated behind the `uCorona`
branch. Screen coverage is small — one star mesh, rarely more than one on
screen. **Low preset:** `uCorona = 0`, so the branch is skipped at runtime
(same compiled program, per §1) and the cost is just the ~5-ALU polynomial
— cheaper than nothing meaningfully measurable.

## 3. Planet shading — atmosphere rim, terminator twilight, cloud/band layer

**Current state.** Two paths in `universe.js`. Textured hero bodies (Earth,
Mars, the four gas giants — `tex` field set, `re > 6` or a named `tex` kind)
use `texMat()`: a hand-drawn `CanvasTexture` (bands or blobby continents)
wrapped in `neonize(MeshLambertMaterial)`. Everything else — **the other
~6,335 catalogued planets**, `ink(p.color)` — is a flat procedural colour
with the shared ink shader (hatch + fresnel rim, `mats.js:126`). This is
where the highest-leverage change is: one shader upgrade, thousands of
bodies improved, zero new draw calls or textures.

Two real fields already exist on every planet object (`universe.js:542,557`
— not invented): `p.teq` (equilibrium temperature, K) and `p.re` (radius in
Earth radii). `planetColor()` already branches on both; the new material
does too.

**New function `neonizePlanet()`, own program key, does not touch `neonize()`**
(ships, stations, moons, rings keep the exact shader they have today —
see §1, minimal scope). It starts from the same `VERT_PARS`/`VERT_MAIN`/hatch
code as `neonize()` (copy, not shared — three.js `onBeforeCompile` shaders
are string templates, and ships must not pay for atmosphere/cloud ALU they
never use) and appends three things to `FRAG_MAIN`, in order: the §6
posterize step (planets should read as drawn too), the twilight arc, the
cloud/band layer, then the existing hatch-mix and fresnel-rim lines
unchanged, then the atmosphere-colour rim on top.

```js
// mats.js — new export
const PLANET_FRAG_PARS = FRAG_PARS + /* glsl */ `
uniform vec3 uAtmoColor;
uniform float uAtmoStrength;   // 0.5
uniform float uTwilightSharp;  // 6.0
uniform float uTwilightStrength; // 0.6
uniform float uCloudAmt;       // 0 low, 0.28 medium/full — see presetFor()
uniform float uCloudFreq;      // 2.2
uniform float uCloudDrift;     // 0.015, clouds only (not bands)
uniform float uGiant;          // 0 rocky (patchy clouds) / 1 giant (bands), from p.re>6
uniform vec3 uSunDirObj;       // sun direction in the planet's OWN object space, set per-frame (see below)
uniform float uToneBands;      // posterize bands, SHARED, see §6
float plHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float plNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = plHash(i), b = plHash(i + vec2(1.0, 0.0)), c = plHash(i + vec2(0.0, 1.0)), d = plHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float plFbm(vec2 p) {
  // Mark Fixermark's WebGL fire-shader FBM loop, 3 octaves not 4 (planets
  // are usually 100-300px on screen, a 4th octave is invisible spend).
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 3; i++) { v += amp * plNoise(p); p *= 2.02; amp *= 0.5; }
  return v;
}`;
const PLANET_FRAG_MAIN = /* glsl */ `
{
  // --- posterize the lit tone first: see §6, same formula as the ink shader ---
  float dvLum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
  if (uToneBands > 1.5 && dvLum > 1e-4) {
    float band = floor(dvLum * uToneBands + 0.5) / uToneBands;
    outgoingLight *= band / dvLum;
  }
  vec3 n = normalize(vDvLocalN);
  float NdotL = dot(n, normalize(uSunDirObj));
  // --- twilight arc: brightest where the terminator meets the silhouette,
  // i.e. NdotL near 0 AND the fresnel term (grazing view) is high. Not a
  // scattering integral, an exp() falloff around the terminator band —
  // cheap approximation, cites the sigmoid terminator idea from Sangil Lee's
  // article without the texture-shadow machinery that article also has
  // (no cloud texture here to shadow). ---
  float dvFresT = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 4.0);
  float twilight = exp(-abs(NdotL) * uTwilightSharp) * dvFresT;
  outgoingLight += uAtmoColor * twilight * uTwilightStrength;
  // --- atmosphere rim: same fresnel already computed for the hatch ink
  // rim below, tinted by the atmosphere colour instead of the neon rim,
  // so a planet gets a physically-suggestive limb colour, not another
  // flat cyan/red outline. ---
  outgoingLight += uAtmoColor * dvFresT * uAtmoStrength;
  // --- cloud / band layer, procedural, reuses the hatch projection domain
  // (hp, already computed below in the unmodified hatch block — this whole
  // block runs BEFORE that block in the final file, so compute a local
  // copy of the same dominant-axis projection here) ---
  if (uCloudAmt > 0.001) {
    vec3 dvAn = abs(n);
    vec2 chp = dvAn.y > max(dvAn.x, dvAn.z) ? vDvLocal.xz : (dvAn.x > dvAn.z ? vDvLocal.zy : vDvLocal.xy);
    chp *= vDvScale * uCloudFreq;
    float cloud;
    if (uGiant > 0.5) {
      // bands: 1D stripes across the projected "latitude" axis, warped by fbm
      float warp = plFbm(chp * 0.35) * 2.0;
      cloud = smoothstep(0.15, 0.85, sin(chp.y * 1.6 + warp) * 0.5 + 0.5);
    } else {
      // patchy clouds: fbm threshold, slow independent drift on x only
      cloud = smoothstep(0.55, 0.72, plFbm(chp + vec2(uTime * uCloudDrift, 0.0)));
    }
    // clouds/bands are lit the same way the surface is (multiply into the
    // already-shaded outgoingLight, not added on top), and fade out on the
    // planet's own night side so they don't glow in the dark.
    float dayGate = clamp(NdotL * 2.0 + 0.6, 0.0, 1.0);
    outgoingLight = mix(outgoingLight, outgoingLight * 0.55 + vec3(0.92, 0.94, 0.98) * 0.5, cloud * uCloudAmt * dayGate);
  }
}`;
const PLANET_KEY = 'dv-neon-planet-1';
export function neonizePlanet(m, { atmo = PAL.cyan, atmoStrength = 0.5, giant = false } = {}) {
  const atmoColor = new THREE.Color(atmo);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uAtmoColor = { value: atmoColor };
    shader.uniforms.uAtmoStrength = { value: atmoStrength };
    shader.uniforms.uTwilightSharp = { value: 6.0 };
    shader.uniforms.uTwilightStrength = { value: 0.6 };
    shader.uniforms.uCloudAmt = SHARED.uCloudAmt;
    shader.uniforms.uCloudFreq = { value: 2.2 };
    shader.uniforms.uCloudDrift = { value: 0.015 };
    shader.uniforms.uGiant = { value: giant ? 1 : 0 };
    shader.uniforms.uSunDirObj = { value: new THREE.Vector3(0, 0, 1) }; // updated per-frame, see below
    shader.uniforms.uToneBands = SHARED.uToneBands;
    shader.uniforms.uTime = SHARED.uTime;
    shader.uniforms.uHatchDirs = SHARED.uHatchDirs;
    shader.uniforms.uHatchK = SHARED.uHatchK;
    shader.uniforms.uLitRef = SHARED.uLitRef;
    shader.uniforms.uRimColor = { value: new THREE.Color(0x8fb0ff) };
    shader.uniforms.uHatchInk = { value: atmoColor.clone().multiplyScalar(0.12) };
    shader.uniforms.uRimStrength = { value: 0.5 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_MAIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PLANET_FRAG_PARS}`)
      .replace('#include <opaque_fragment>', `${PLANET_FRAG_MAIN}\n${FRAG_MAIN.replace('#include <opaque_fragment>', '')}\n#include <opaque_fragment>`);
    m.userData.sunUniform = shader.uniforms.uSunDirObj;
  };
  m.customProgramCacheKey = () => PLANET_KEY;
  return m;
}
function atmoColorFor(teq) {
  // same temperature bands planetColor() already classifies by
  // (universe.js:52-55), tinted toward what that temperature's atmosphere
  // would scatter: hot = thin/scorched orange-red limb, temperate =
  // pale Rayleigh blue-white, cold = faint violet (thin or no air).
  if (teq > 1200) return 0xff8a5c;
  if (teq > 600) return 0xe8c090;
  if (teq > 200) return 0xbcd8ff;
  return 0x9fa8e8;
}
```

**Why `uSunDirObj` and not a built-in light.** These materials are
`MeshLambertMaterial` lit by the scene's real directional light (the star)
already — that gives `outgoingLight` its base shading for free, same as
today. But the twilight-arc term needs the sun direction **in the planet's
own object space**, and three.js doesn't expose that to a fragment shader
by default. It must be set from JS, once per planet per frame, in
`SystemView.update()` (`universe.js:260`) right next to the existing
`b.mesh.rotation.y = t * 0.02` line:

```js
if (b.mesh.material.userData.sunUniform) {
  // sun is at the system origin in this view's local frame; direction from
  // the planet to the star, transformed into the planet's object space by
  // the inverse of its own world rotation (translation doesn't matter for
  // a direction). b.mesh.quaternion is already up to date from the scale/
  // position set two lines above.
  _sunDir.set(-b.mesh.position.x, -b.mesh.position.y, -b.mesh.position.z).normalize();
  _sunDir.applyQuaternion(_q.copy(b.mesh.quaternion).invert());
  b.mesh.material.userData.sunUniform.value.copy(_sunDir);
}
```

(`_sunDir` and a scratch `_q` are two more `Vector3`/`Quaternion` module
constants next to the file's existing `V`/scratch pattern — no per-frame
`new`.) `ink(p.color)` at `universe.js:225` becomes
`neonizePlanet(new THREE.MeshLambertMaterial({ color: p.color, flatShading: true, blending: THREE.NoBlending, opacity: ID.INK }), { atmo: atmoColorFor(p.teq ?? 300), giant: p.re > 6 })` —
note this can no longer go through the `cached()` map keyed only by colour,
because `uSunDirObj` must be a *distinct* uniform per planet mesh (two
planets never share a material instance any more, only their color/atmo
combination might coincide by chance). That is one real behaviour change
worth flagging to the implementer: today's `ink()` planets share GPU buffers
aggressively across same-coloured bodies; `neonizePlanet()` cannot, because
the whole point of the twilight/cloud pass is that it differs per planet.
Each `SystemView` only ever has a handful of planets alive at once (its own
system), so this is a few extra material instances, not thousands — cost is
in `this.mats` (already tracked and disposed in `SystemView.dispose()`,
`universe.js:290`), not draw calls.

**`texMat()` (the 3-4 hero bodies with real canvas textures): out of scope
for this pass.** They already have a real cloud/band *texture*; the highest
leverage is the 6,335 flat-colour bodies above. If a later pass wants it,
the twilight-arc and atmosphere-rim blocks above can be pasted into
`texMat()`'s `onBeforeCompile` unchanged (they don't touch `map`/UV at all)
— only the procedural cloud block would need the texture's own UV instead
of `chp`.

**Cost.** Twilight arc + atmosphere rim: ~10 ALU, no branch, always on —
cheap enough for low. Cloud/band layer: 3×`plNoise` (12 hashes) gated behind
`uCloudAmt > 0.001`. **Low preset:** `SHARED.uCloudAmt.value = 0` (new
`presetFor()` field `cloudAmt: 0 / 0.28 / 0.28` for low/medium/full) skips
the branch entirely; twilight and atmosphere rim stay on at all three
presets since their cost is negligible and they carry most of the visual
improvement per ALU spent.

## 4. Engine and laser glow — a plasma core, not a flat fill

**Current state.** `glow()` (`mats.js:171`) again: engines (`ships.js:1650`
`nozzle()`, a `CYL` disc + `CONE` tip, materials `G.engine`/`G.yellow`) and
laser bolts (`game.js:161-163`, a stretched `BoxGeometry(0.9,0.9,16)`,
materials `boltMat`/`eBoltMat`) are flat, unlit, single-colour solids;
bloom does all the "glow." Both shapes happen to share the same local
geometry convention worth exploiting: **their long axis is local Z** — a
cylinder/cone pointing down its own Z, a box stretched along Z. That means
one shader, keyed off local-space radius from the Z axis, upgrades both.

**New function `plasmaGlow()`, own program key, does not touch `glow()`**
— lamps, screens, signage and every other `glow()` use (checked:
`ships.js`, `actors.js` call `glow()` directly for non-engine parts) stay
exactly as they render today.

```js
// mats.js — new export
const PLASMA_PARS = /* glsl */ `
varying vec2 vPlXY;
varying float vPlZ;
uniform float uTime;
uniform float uCore;       // falloff sharpness, per call site (see below)
uniform float uFlicker;    // 0..1, per call site
uniform float uFlickerOn;  // SHARED, 0 on low (branch skipped)
uniform vec3 uHotColor;
float plgHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`;
const PLASMA_VERT_PARS = /* glsl */ `varying vec2 vPlXY; varying float vPlZ;`;
const PLASMA_VERT_MAIN = /* glsl */ `vPlXY = position.xy; vPlZ = position.z;`;
const PLASMA_FRAG_MAIN = /* glsl */ `
{
  float r2 = dot(vPlXY, vPlXY);
  float core = exp(-r2 * uCore);
  float flick = 1.0;
  if (uFlickerOn > 0.5) {
    flick = 1.0 + uFlicker * (plgHash(vec2(floor(vPlZ * 0.7), floor(uTime * 9.0))) - 0.5);
  }
  outgoingLight = mix(outgoingLight, uHotColor, core * 0.85) * flick;
}`;
const PLASMA_KEY = 'dv-neon-plasma-1';
export function plasmaGlow(color, { core = 3.0, flicker = 0.15, hot = 0xfff4e0 } = {}) {
  return cached(`plasma${color}|${core}|${flicker}|${hot}`, () => {
    const m = new THREE.MeshBasicMaterial({ color, blending: THREE.NoBlending, opacity: ID.GLOW });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = SHARED.uTime;
      shader.uniforms.uCore = { value: core };
      shader.uniforms.uFlicker = { value: flicker };
      shader.uniforms.uFlickerOn = SHARED.uFlickerOn;
      shader.uniforms.uHotColor = { value: new THREE.Color(hot) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${PLASMA_VERT_PARS}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${PLASMA_VERT_MAIN}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${PLASMA_PARS}`)
        .replace('#include <opaque_fragment>', `${PLASMA_FRAG_MAIN}\n#include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => PLASMA_KEY;
    return m;
  });
}
```

Add `uFlickerOn: { value: 1 }` to `SHARED`; `applyPreset()` sets it to `0`
on low (`presetFor()` gains `flicker: false` for low, `true` for medium/full).

**Call-site tuning (exact, not left to guess):**

| Call site | File | Radius scale | `core` | `flicker` | `hot` |
|---|---|---|---|---|---|
| Engine nozzle disc/cone, `G.engine` | `ships.js:1517,1652` (via `G.engine = glow(PAL.amber)`) | ~0.8–1.6 units | `2.2` | `0.12` | `0xfff4e0` |
| Engine cone tip, `G.yellow` | `ships.js:1653` | ~0.5–1.2 units | `2.6` | `0.12` | `0xfff4e0` |
| Player laser bolt | `game.js:162` `boltMat = glow(0xffc23c)` → `plasmaGlow(0xffc23c, ...)` | 0.45 half-width | `5.5` | `0.25` | `0xfff4e0` |
| Enemy laser bolt | `game.js:163` `eBoltMat = glow(0xff3b5c)` → `plasmaGlow(0xff3b5c, ...)` | 0.45 half-width | `5.5` | `0.30` | `0xffb8a8` (hot red-white, not the neutral white the player gets — keeps the red/cyan hostile-vs-friendly read the composite pass already relies on) |

`core` is tuned by hand from each shape's known half-width (`nozzle()`
radius args, the bolt box's fixed `0.9,0.9`), not derived automatically —
`exp(-r2*core)` at `r = halfWidth` should land around 0.15-0.3 (a visible
but not overwhelming hot core); the table above hits that for each shape's
actual size.

**Cost.** ~8 ALU (1 `exp`, 1 `mix`) always; +1 hash (~6 ALU) when
`uFlickerOn`. Applies only to engine and bolt screen area — small, and bolts
in particular are short-lived. **Low preset:** flicker branch skipped
(`uFlickerOn = 0`); core gradient itself is cheaper than the flat fill it
replaces plus bloom doing the same visual job less precisely, so this is
close to a wash on low, not an added cost.

## 5. Warp / jump effect — extend the existing pass, don't replace it

**Current state.** `render.js`'s `POST_FS` already has a working warp
effect, driven by `fx.warp` (0 during normal flight, ramps 0→0.35 over the
3s spool in `game.js:updateWarp`, holds at `1.0` for the whole jump phase,
ramps 1→0 over 1.2s on arrival — read directly from `game.js:1076-1114`,
not guessed): a 16-tap raymarch toward screen centre that finds depth
discontinuities (stars, distant bodies) and stretches them into streaks
(`render.js:105-114`), plus a separate full-screen vortex-noise ring
(`render.js:126-131`). This is good and stays. Two additions:

**5a. A cheap chromatic tint on the existing streak**, no extra texture
taps (reuses the single `s` accumulator the 16-tap loop already produces —
tripling the loop to sample each channel separately would triple 16 texture
reads for a subtle effect; not worth the Chromebook budget). Replace
`render.js:113`:

```glsl
col = mix(col, inkCyan, clamp(s * 1.2, 0.0, 1.0));
```
with:
```glsl
// cheap chromatic approximation, not a true per-channel sample split: the
// streak reads cyan near the vanishing point and drifts toward a warm
// white-violet at the screen edge, which is what real chromatic spreading
// looks like at a glance without 3x the texture reads.
float rq = length(vUv - 0.5);
vec3 warpTint = mix(inkCyan, vec3(1.0, 0.87, 0.95), smoothstep(0.08, 0.5, rq));
col = mix(col, warpTint, clamp(s * 1.2, 0.0, 1.0));
```

**5b. Foreground streak.** Today only background pixels (`b0 > 0.5`, empty
space) streak; a ship or asteroid passing close during the spool sits
perfectly sharp next to streaking stars, which breaks the effect. Add,
right after the existing foreground branch's glow-boost line
(`render.js:119`, inside the `} else { ... }` block):

```glsl
if (warp > 0.001) {
  vec2 toC = vec2(0.5) - vUv;
  vec3 streak = col + texture2D(tColor, uv + toC * 0.012 * warp).rgb + texture2D(tColor, uv + toC * 0.024 * warp).rgb;
  col = mix(col, toS(streak * 0.3333), warp * 0.6);
}
```

(Placed after `col = toS(c0.rgb); if (isId(id0,0.6)) col *= glowBoost;` — so
it streaks the already-tone-mapped colour, consistent with how `col` is
used for the rest of the function.) Two extra `texture2D(tColor,...)` taps,
gated by `warp > 0.001` — free outside the ~3s spool and the arrival ramp.

**Cost.** 5a: zero extra taps, a `length` and a `mix`. 5b: 2 extra texture
taps, gated. **Low preset:** unchanged from today — `warp` itself isn't
gated by preset now (it's a gameplay-state uniform, not a quality knob) and
these two additions are cheap enough to leave that way; if profiling later
shows the 16-tap background loop itself is the actual cost, that's a
pre-existing cost this spec doesn't change.

## 6. HUD glass: damage cracks and heat haze

**Current state.** `damage` already exists as a uniform and produces a red
vignette + `scribble()` overlay (`render.js:132-135`) — a colour tint, not a
refraction. Nothing exists for heat. A real, unused gameplay stat is right
there to drive it: `sh.heat` / `this.stat('heat')` (weapon overheat,
`game.js:998-999,1499-1500`, already shown on the HUD at `ui.js:188`) —
this is not invented; it is the existing overheat mechanic given a screen
effect it doesn't have yet.

**Both effects are a UV offset applied before any texture is sampled** —
the Kyle Halladay technique (§0), adapted to use a noise-gradient
"fake refraction normal" instead of a distortion texture, because there is
no spare texture in this codebase and adding a bitmap for this one effect
would be exactly the placeholder-asset problem Gev's rules forbid. Insert
immediately after the existing `boil` wobble line, `render.js:63`
(`vec2 uv = vUv + wob * px * 2.2 * (0.35 + boil * 0.65);`), **before** any
of the `texture2D(tColor/tDepth, uv...)` calls that follow it — this way
both the colour and the edge-detection sampling ride the same distorted
`uv`, so cracks/haze bend the silhouette lines too, not just the colour
(a real cracked-glass or heat-shimmer look does both):

```glsl
if (damage > 0.001) {
  // fake refraction normal: gradient of a noise field, not a texture.
  vec2 cp = fc * 0.004;
  float n0 = noise(cp), n1 = noise(cp + vec2(0.6, 0.0)), n2 = noise(cp + vec2(0.0, 0.6));
  vec2 crackN = vec2(n1 - n0, n2 - n0) * 14.0;
  uv += crackN * px * 9.0 * damage;
}
if (heat > 0.001) {
  // low-frequency, upward-scrolling: classic heat-shimmer, horizontal-only
  // (real hot air distorts sideways more than it lifts a whole image).
  vec2 hp = fc * 0.012 + vec2(0.0, -time * 9.0);
  float h0 = noise(hp), h1 = noise(hp + vec2(0.4, 0.0));
  uv.x += (h1 - h0) * 3.0 * px.x * 60.0 * heat;
}
```

New uniform `heat`, added next to `damage` in `this.post.uniforms`
(`render.js:263`) and `this.fx` (`render.js:257`). Wiring in `game.js`,
one line next to the existing damage decay at `game.js:1683`:

```js
this.r.fx.damage = Math.max(0, this.r.fx.damage - dt * 0.9);
this.r.fx.heat = smooth(clamp((sh.heat / this.stat('heat') - 0.55) / 0.45, 0, 1));
```

(`smooth` and `clamp` are both already imported in `game.js` — confirmed,
`smooth` is used two lines away in `updateWarp`. Nothing new to import.)
This ramps 0→1 as weapon heat crosses 55%→100% of the overheat threshold,
so it reads as "the glass is warping because the guns are about to cook,"
not a flat on/off.

**Cost.** 3 `noise()` calls (each ~4 hashes) per branch, both gated —
**zero cost** whenever `damage` and `heat` are both at rest, which is most
of normal play (damage decays at `dt*0.9`/s already; heat decays at
`dt*26`/s, `game.js:998`, so it's back near zero within ~2s of releasing
fire). **Low preset:** stays on unchanged — this is gameplay feedback, not
a look-and-feel luxury, and its cost when active (a handful of ALU ops, no
extra passes) is negligible next to what low already disables (bloom, blur).

## 7. Ships reading as drawn, not plastic

Two cheap, global, already-grounded-in-the-codebase changes — no new
material, no new pass, applies to every silhouette in the game for free.

**7a. Posterize the lit tone before hatching.** `mats.js`'s `FRAG_MAIN`
(`mats.js:93-120`) mixes hatch ink into `outgoingLight`, but the Lambert
base underneath is a smooth, continuous gradient across every curved
surface — that gradient, visible wherever hatching is faded out (deep
shadow cutoff, `mats.js:116`) or simply thin, is the "plastic" tell: cel
shading reads as drawn *because* it quantizes intensity into discrete bands
(§0, Wikipedia). Add, as the **first** statement inside `FRAG_MAIN`'s
`{ }` block (`mats.js:94`, before `vec3 dvIrr = ...`):

```glsl
float dvLum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
if (uToneBands > 1.5 && dvLum > 1e-4) {
  float band = floor(dvLum * uToneBands + 0.5) / uToneBands;
  outgoingLight *= band / dvLum;
}
```

New `SHARED` uniform `uToneBands: { value: 4 }`, declared in `FRAG_PARS`
alongside the existing `uHatchDirs` etc. `presetFor()` gains a `toneBands`
field: `3` low, `4` medium, `5` full — fewer bands on low is *more*
graphic-novel, not a compromise, consistent with low already using 1 hatch
direction instead of 3. `applyPreset()` sets `SHARED.uToneBands.value = p.toneBands`.
Hatch density itself (`dvShade`, computed from `reflectedLight` directly,
not from `outgoingLight`) is untouched, so hatch banding still looks exactly
as it does today — this only removes the smooth gradient *underneath* the
hatch, it doesn't change where hatch appears.

**7b. A second, wider silhouette tap — a doubled/thicker pen line.**
`POST_FS`'s existing depth-edge block (`render.js:77-82`,
`if (b0 < 0.5 && bn < 0.5) { ... eDepth = smoothstep(...); }`) samples
neighbours at a fixed offset (`ox`,`oy`, scaled by `lw`, itself scaled by
resolution). A single fixed-radius tap gives every silhouette the same line
weight regardless of how sharp the depth break is — a hand inking a strong
edge presses harder and the line comes out thicker. Add, inside that same
`if` block, right after the existing `eDepth = smoothstep(0.02, 0.07, lap);`
line:

```glsl
vec2 ox2 = ox * 2.6, oy2 = oy * 2.6;
float zL2 = texture2D(tDepth, uv - ox2).x, zR2 = texture2D(tDepth, uv + ox2).x;
float zD2 = texture2D(tDepth, uv - oy2).x, zU2 = texture2D(tDepth, uv + oy2).x;
if (isBg(zL2) + isBg(zR2) + isBg(zD2) + isBg(zU2) < 3.5) {
  float lap2 = abs(lin(zL2) + lin(zR2) + lin(zD2) + lin(zU2) - 4.0 * z0) / z0;
  eDepth = max(eDepth, smoothstep(0.05, 0.16, lap2) * 0.55);
}
```

(`z0` is the existing `float z0 = lin(d0);` computed one line above it in
the same block — reused, not recomputed.) This widens `eDepth` only where
the depth break is strong enough to register at 2.6x the radius too — a
glancing, weak edge stays thin; a sharp, close silhouette (the ship's own
hull against space, an enemy up close) gets a visibly thicker line, the way
a real inked panel does. Flows through the existing `edge = max(max(eDepth,
eBg), max(eId, eCol...))` composition unchanged.

**Cost.** 7a: ~4 ALU, always on, no branch worth gating (cheaper than the
hatch math already running next to it). 7b: 4 extra `texture2D(tDepth,...)`
taps, but only inside the existing `b0<0.5 && bn<0.5` guard — i.e. only for
pixels already known to be interior-near-an-edge, a thin band of the
screen, not the whole frame. **Low preset:** both stay on at all three
presets — this is the cheapest item in the whole spec and arguably the
highest-leverage per ALU spent, exactly where a Chromebook budget should
spend first.

**Considered and cut:** per-object rim-strength jitter (a hand varies how
hard it presses per stroke) — real technique, but needs a per-instance seed
the same way §3's per-planet sun direction does, and unlike the planet case
there is no cheap free per-instance signal for merged multi-part ships
(`Kit`/`into()` merges many parts into one mesh; the seed would have to be
an extra vertex attribute baked in at merge time). Worth a future pass, not
this one — `mats.js:126`'s comment on why materials are shared explains
the cost that would undo.

## 8. Change list for the next stage (not applied by this doc)

`mats.js`: add `starGlow()`, `neonizePlanet()`, `plasmaGlow()`, `atmoColorFor()`;
add `uTime`, `uStarCorona`, `uCloudAmt`, `uFlickerOn`, `uToneBands` to
`SHARED`; add `setTime()` export; two new lines at the top of the existing
`FRAG_MAIN` (§7a). No existing exported function's signature changes.

`render.js`: `presetFor()` gains `corona`, `cloudAmt`, `flicker`, `toneBands`
fields (§2-4,7a); `applyPreset()` sets the four new `SHARED` uniforms from
them; `render(t)` gains one line, `setTime(t)`; `POST_FS` gains the §5a
chromatic tint (replaces one line), the §5b foreground streak block, the §6
damage/heat UV-refraction block, and the §7b widened-edge block; `this.post.uniforms`
and `this.fx` each gain `heat`.

`universe.js`: `import { starGlow, neonizePlanet, atmoColorFor } from './mats.js'`;
`universe.js:219` swaps `glow(...)` for `starGlow(...)`; `universe.js:225`
swaps `ink(p.color)` for `neonizePlanet(new THREE.MeshLambertMaterial(...), {...})`
per §3; `SystemView.update()` gains the `uSunDirObj` per-planet-per-frame
write per §3, plus two scratch module-level `Vector3`/`Quaternion` constants.

`ships.js`: `G.engine`/`G.yellow` swap `glow(...)` for `plasmaGlow(...)`
per the §4 table.

`game.js`: `boltMat`/`eBoltMat` (`game.js:162-163`) swap `glow(...)` for
`plasmaGlow(...)` per the §4 table; one new line at `game.js:1683` for
`fx.heat` per §6.

None of the above changes an exported function's *removal* — every old
factory (`glow()`, `ink()`, `neonize()`) still exists, still used by
whatever doesn't opt into the new look, per the minimal-scope rule in §1.

## 9. What this spec deliberately does not cover

- **Selective/layer-based bloom** (bloom only glow-ID surfaces, not the
  whole framebuffer) — `UnrealBloomPass` today blooms the composite output
  above its 0.85 threshold, which already mostly-only catches glow/emitter
  pixels because everything else is deliberately kept dark (`mats.js:1-9`'s
  own stated design). A real selective-bloom layer pass would be a second
  render of the scene (extra draw calls, against the Chromebook budget) for
  a look the threshold approach already achieves cheaply. Not worth it here.
- **A true volumetric warp tunnel geometry** (a cylinder of streaking
  particles around the camera) — the existing screen-space approach in §5
  costs a handful of texture taps; a geometric tunnel would be new meshes,
  new draw calls, against §1's zero-new-draw-calls rule, for an effect the
  screen-space version already sells.
- **PBR textures or HDRI lighting anywhere** — see §0's tooling note. Checked
  this session, doesn't fit, not used.
