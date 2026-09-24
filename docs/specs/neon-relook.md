# Neon relook — spec

Owner of this doc: research/design pass only, no game files touched. Written for
an implementer who has not read the sources below. Project root
`D:\doodle-voyager`; read `docs/PLAN.md` and `docs/HANDOFF.md` first for the
module contracts this spec assumes.

## 0. What Gev asked for

Verbatim: *"I only wanted the TEXTURES from the Doodle Shooter game; I don't
want the shading to be the same. I'd like the shaders to be neon and cool."*
and *"Everything is white in the game, with no shading. Make the ship darker
and not white, and use textures like those in Doodle Shooter. Aim for a neon
style."*

Three separable asks:
1. Take the **procedural ink-hatching technique** from Doodle Shooter (the
   "texture"), not its blue-ink-on-cream-paper *palette*.
2. Fix the actual bug/design flaw: surfaces read as flat white with no
   shading.
3. New identity: neon, cool-toned, dark.

## 1. Doodle Shooter's "textures": there are no bitmap textures

Fetched and read directly (this session): `https://doodleshooter.vercel.app/`
(1,105 bytes HTML), its bundle `game.7LCERBLR.js` (302,767 bytes) and
`style.A4A8BF44.css` (22,636 bytes). Saved locally at `D:\tmp-dv\look\game.js`,
`style.css`. Grepped for every image extension
(`png|jpg|jpeg|webp|svg|gif`) and every texture-loading call
(`TextureLoader`, `getContext("2d")`, `CanvasTexture`) — **zero matches**.
Doodle Shooter ships no bitmap image assets and builds no canvas textures at
all. Its entire "hand-drawn ink on paper" look is two GLSL shaders, extracted
verbatim below (saved at `D:\tmp-dv\look\shader_0.glsl` .. `shader_2.glsl`).

### 1.1 The G-buffer material shader

Every object in the scene is drawn with one shared vertex/fragment pair
(`Xa`/companion in the minified bundle, ~char offset 195). It does **not**
draw ink or paper — it writes four numbers per pixel:

```glsl
// vertex
varying vec3 vNormalV;
varying vec4 vColorData;
uniform float uTime;
void main() {
  vec3 transformed = position;
  vec3 objectNormal = normal;
  #ifdef USE_INSTANCING
    transformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;
    objectNormal = mat3(instanceMatrix) * objectNormal;
  #endif
  vColorData = (USE_INSTANCING_COLOR) ? vec4(instanceColor, 1.0) : vec4(0.0, 0.0, 0.0, -1.0);
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  vNormalV = normalize(normalMatrix * objectNormal);
  gl_Position = projectionMatrix * mvPosition;
}

// fragment
uniform float uInk, uFill, uShadeScale, uShadeBias;
uniform vec3 uLightDir;
varying vec3 vNormalV; varying vec4 vColorData;
void main() {
  vec3 n = normalize(vNormalV);
  if (!gl_FrontFacing) n = -n;
  float ndl = dot(n, uLightDir) * 0.5 + 0.5;
  float ink = uInk, fill = uFill;
  if (vColorData.a > 0.0) { ink = vColorData.r; fill = vColorData.g; }
  float shade = clamp(ndl * uShadeScale + uShadeBias, 0.0, 1.0);
  if (fill > 0.5) shade = -1.0;                 // solid-fill objects skip shading entirely
  gl_FragColor = vec4(shade, ink, n.x, n.y);    // R=shade  G=ink id  B,A = view-space normal.xy
}
```

Six ink IDs, found at the top of the bundle: `k = {BLUE:0, RED:1, BLACK:2,
ORANGE:3, GREEN:4, PINK:5}`, colours `ri = [(.1,.19,.76), (.86,.12,.2),
(.18,.2,.26), (.92,.55,.08), (.12,.6,.3), (.9,.4,.66)]` (0-1 RGB) — i.e.
`#1930C2 #DC1F33 #2E3342 #EB8C14 #1F994D #E666A8`. Paper `[.965,.955,.905]` =
`#F6F3E6`. This matches `references/games.md`'s CSS-derived
`--ink:#1a30c0 --red:#d02030 --paper:#f6f3e6` almost exactly — the shader
values are the ground truth, the CSS custom properties are a close hand-typed
copy for the 2D chrome.

### 1.2 The full-screen post shader — this is "the texture"

One `ShaderMaterial` on a full-screen quad, reading the colour target above
(`tScene`, R=shade/G=ink id/BA=normal.xy) plus a depth texture. Extracted in
full, 7,252 characters, saved at `D:\tmp-dv\look\shader_2.glsl`:

```glsl
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene; uniform sampler2D tDepth;
uniform vec2 uRes; uniform float uAspect, uTime, uNear, uFar;
uniform float uHurt, uFlash, uSlow, uLineSpacing, uLineMode, uLowHp;
uniform vec3 uPaper; uniform vec3 uInks[6];
uniform mat4 uInvProj; uniform mat4 uInvView;

float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=hash21(i), b=hash21(i+vec2(1.,0.)), c=hash21(i+vec2(0.,1.)), d=hash21(i+vec2(1.,1.));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
float linDepth(float z){ float zn=z*2.0-1.0; return 2.0*uNear*uFar/(uFar+uNear-zn*(uFar-uNear)); }
vec3 inkColor(float id){ int i=int(id+0.5);
  if(i<=0) return uInks[0]; if(i==1) return uInks[1]; if(i==2) return uInks[2];
  if(i==3) return uInks[3]; if(i==4) return uInks[4]; return uInks[5]; }
float stripes(vec2 p, vec2 dir, float spacing, float width){
  float t=dot(p, vec2(-dir.y,dir.x));
  float f=abs(fract(t/spacing)-0.5)*spacing;
  float soft=width*0.6;
  return 1.0-smoothstep(width*0.5-soft, width*0.5+soft, f); }

void main() {
  vec2 px = 1.0/uRes; float sc = uRes.y/900.0;
  vec2 nuv = vUv*vec2(uAspect,1.0);
  vec2 wob = vec2(vnoise(nuv*6.0+11.3), vnoise(nuv*6.0+37.0))-0.5;
  vec2 suv = vUv + wob*2.0*sc*px;                        // hand-wobble, screen-space
  vec4 s = texture2D(tScene, suv);
  float z = texture2D(tDepth, suv).x, d = linDepth(z);
  float o = 1.15*sc; vec2 ox=vec2(o,0.)*px, oy=vec2(0.,o)*px;
  float zl=texture2D(tDepth,suv-ox).x, zr=texture2D(tDepth,suv+ox).x;
  float zu=texture2D(tDepth,suv+oy).x, zd=texture2D(tDepth,suv-oy).x;
  vec4 sl=texture2D(tScene,suv-ox), sr=texture2D(tScene,suv+ox);
  vec4 su=texture2D(tScene,suv+oy), sd=texture2D(tScene,suv-oy);
  // Edge in inverse depth (1/d): affine across any plane incl. grazing angles,
  // so its 2nd difference is ~0 on a real surface and only silhouettes fire.
  // Dividing by 1/d itself makes the test scale-invariant (near == far crispness).
  float iw=1.0/d;
  float lap = abs(1.0/linDepth(zl)+1.0/linDepth(zr)-2.0*iw)
            + abs(1.0/linDepth(zu)+1.0/linDepth(zd)-2.0*iw);
  float edge = smoothstep(0.07, 0.30, lap/(iw+1e-7));
  float nEdge = length(sl.ba-sr.ba) + length(su.ba-sd.ba);
  edge = max(edge, smoothstep(0.42, 0.85, nEdge));
  float zmin=z; float inkId=s.g;
  if(zl<zmin){zmin=zl; inkId=sl.g;} if(zr<zmin){zmin=zr; inkId=sr.g;}
  if(zu<zmin){zmin=zu; inkId=su.g;} if(zd<zmin){zmin=zd; inkId=sd.g;}
  float dFront=linDepth(zmin); bool sky = z>=0.99999;

  // --- hatching, anchored to the SURFACE not the screen ---
  float shade=s.r, hatch=0.0;
  if (!sky) {
    if (shade<0.0) hatch=1.0;               // fill objects: solid ink, no pattern
    else {
      vec2 hp; float sp,w;
      if (d<2.0) { hp=gl_FragCoord.xy+wob*5.0*sc; sp=8.5*sc; w=1.5*sc; }  // held weapon: screen-locked
      else {
        vec4 clip=vec4(vUv*2.0-1.0, z*2.0-1.0, 1.0);
        vec4 vpos=uInvProj*clip; vpos/=vpos.w;
        vec3 wpos=(uInvView*vec4(vpos.xyz,1.0)).xyz;
        vec2 nxy=s.ba; vec3 nView=vec3(nxy, sqrt(max(0.0,1.0-dot(nxy,nxy))));
        vec3 wn=normalize(mat3(uInvView)*nView); vec3 an=abs(wn);
        // triplanar: project onto the plane the surface most faces
        hp = an.y>max(an.x,an.z) ? wpos.xz : (an.x>an.z ? wpos.zy : wpos.xy);
        // spacing quantised to powers of 2 so on-screen density steps, never crawls
        float lod=exp2(floor(log2(max(1e-4,(0.0165*d)/0.16))));
        sp=0.16*lod; w=sp*0.17;
        hp += (vnoise(hp*(2.5/sp))-0.5)*sp*0.4;    // hand-drawn waver, fixed to the surface
      }
      const vec2 d1=vec2(0.7071,0.7071), d2=vec2(-0.7071,0.7071), d3=vec2(0.2588,0.9659);
      float h1=stripes(hp,d1,sp,w), h2=stripes(hp,d2,sp*1.15,w), h3=stripes(hp,d3,sp*0.7,w);
      hatch = h1*smoothstep(0.64,0.50,shade);
      hatch = max(hatch, h2*smoothstep(0.42,0.32,shade));
      hatch = max(hatch, h3*smoothstep(0.24,0.14,shade));
      hatch = max(hatch, smoothstep(0.12,0.0,shade)*0.9);   // near-black: crosshatch solid
    }
  }
  // paper, grain, ruled lines / graph grid, margin, composite, hurt vignette, flash, slow-mo desat
  // (full text continues identically in the saved file; omitted here — this
  //  excerpt is the part that matters for "what is the texture")
}
```

**What this proves, concretely:**
- **Hatching lives in world space, triplanar-projected**, not screen space —
  that's why it doesn't swim as the camera moves. Doodle Voyager's current
  `POST_FS` hatches in **screen space** (`hatch(vec2 p, ...)` takes
  `fc/scale`, §3.2 below) — that's cheaper but is exactly why its hatching
  looks like a flat scribble filter rather than material texture.
- **Three overlapping stripe fields** (45°/-45°/15°) turned on at three shade
  thresholds is the entire "pencil sketch" trick — darker → more directions
  stack → reads as denser crosshatch. No noise-based dot pattern, no image.
- **Line spacing steps in powers of two with distance** (`exp2(floor(log2(...)))`)
  — keeps on-screen density roughly constant without moiré on far geometry.
  Worth copying verbatim.
- **`uFill` / `shade = -1.0`** is a second, simpler "ink" mode: some objects
  (HUD-adjacent props, presumably) skip shading and hatching and render as
  flat solid ink. Doodle Voyager's `GLOW` id is the equivalent idea already.
- Edge detection is **inverse-depth Laplacian**, scale-invariant, plus a
  normal-discontinuity fallback (`s.ba` = view-space normal.xy, reconstructed
  z). Doodle Voyager's `render.js` already does a close cousin of this
  (`eDepth` from `lin(d)` Laplacian, §3.2) — keep it, it works.
- Palette and paper are **uniforms**, not baked into the shader text — trivial
  to swap for a dark/neon set without touching the algorithm, which is
  exactly the reuse Gev asked for.

No bloom, no emissive layers, no post-process glow anywhere in Doodle
Shooter's bundle (`grep -i "bloom|emissive|EffectComposer"` → 0 matches). Its
"cool" is the hand-drawn-on-paper conceit, not neon — confirming Gev's own
framing: the *neon* direction is new work, not something to also lift from
Doodle Shooter.

### 1.3 `references/games.md`'s parallel findings

The already-installed UFS teardown of the same site (read this session,
`C:\Users\OWNER\cinematic-web-design\skills\ultimate-frontend-skills\references\games.md`)
corroborates the CSS side: `--ink:#1a30c0 --red:#d02030 --paper:#f6f3e6`,
Patrick Hand + Caveat fonts (already used by Doodle Voyager), `mix-blend-mode:
multiply` on every HUD chip so ink sits *on* the backdrop rather than floating
over it, and a documented list of bespoke per-element border-radius/rotation
values. None of this needs re-deriving; §7 below reuses the multiply-chip
pattern for the new dark HUD.

## 2. Why Doodle Voyager currently reads as flat and white

Read in full this session: `js/render.js` (Renderer, `POST_FS`), `js/mats.js`
(`ink/red/glow/screen/paint`), and every call site (grep below). Screenshots
captured this session, headless, 1366×768, zero console errors, saved at
`D:\tmp-dv\look\shots\{helm-space,near-planet,on-foot,combat}-1366x768.png`:
the interior helm and the on-foot shots in particular are almost entirely
blank cream with only silhouette hatching at edges — no surface reads as a
distinct material, the console, floor and walls are the same near-white.

Three compounding causes, all confirmed in code, not guessed:

1. **`js/mats.js` §"Colour carries meaning"**: `ink()`/`paint()` are fed pale
   colours by design — `PAL.white 0xf2efe4, PAL.paper 0xf6f3e6, PAL.cream
   0xefe3c2` are used throughout `js/ships.js` (`wall: ink(PAL.white), ceil:
   ink(PAL.paper), floor: ink(0xdcd6c6)` — line 38) precisely so they read as
   "paper" (this is documented intent in `PLAN.md` §"Material contract": *"pale
   ones stay paper"*). That intent is what Gev is now asking to remove.
2. **`render.js` `POST_FS` id0>0.5 branch** (§3.2, lines 133-135):
   `col = mix(pap, pap*hue, 0.62+0.3*sat); col = mix(col, vec3(1.0), 0.12)` —
   even *coloured* ink materials get pulled 12% toward pure white and mixed
   mostly with the cream paper colour, on top of already-pale input colours.
   Two whitening passes stack.
3. **Hatching triggers on absolute luminance of the tone-mapped lit colour**
   (`lum = dot(lc, vec3(0.299,0.587,0.114))`, line 116), not on a
   normalised shade term. A pale wall lit reasonably brightly never drops
   below the `smoothstep(0.60,0.46,lum)` hatch threshold, so it never hatches
   — it just stays flat colour. Doodle Shooter avoids this entirely by
   hatching off `shade` (a 0-1 term built purely from `N·L`, independent of
   the surface's own albedo) — §1.1's `shade = clamp(ndl*uShadeScale+uShadeBias,
   0,1)` never depends on ink colour.

Lighting itself is *not* the bug — `js/game.js` already has a real rig
(`this.hemi` HemisphereLight, `this.sun` DirectionalLight retargeted every
frame to the actual nearby star's true direction and tinted by its colour
temperature, `game.js:1598-1601`; ship interiors get their own
`this.shipHemi` plus up to 3 `PointLight`s per `ships.js:145`). §4 keeps all
of this and adds to it — the fix is the material/shading model and the post
pass's whitening, not the lights.

## 3. Current code, read in full (baseline for the diff)

### 3.1 `js/mats.js` (72 lines) — material IDs

```js
export const ID = { INK: 1.0, ENEMY: 0.8, GLOW: 0.6, SCREEN: 0.4 };
export const PAL = { paper:0xf6f3e6, ink:0x1a30c0, red:0xd02030, yellow:0xffd84a,
  blue:0x6f95ff, white:0xf2efe4, grey:0xb9b6ad, dark:0x3a3a48, wood:0xc79a62,
  green:0x7fbf6a, orange:0xff9a3c, pink:0xf2a0b8, teal:0x5cc7c0, cream:0xefe3c2,
  steel:0x9aa3b5 };
export function ink(color = PAL.white) { /* MeshLambertMaterial, flatShading,
  blending: NoBlending, opacity: ID.INK — opacity IS the id, written straight
  into the render target's alpha because NoBlending skips blending, not the
  alpha write itself */ }
export function red(color = PAL.red) { /* same, opacity: ID.ENEMY */ }
export function glow(color = PAL.yellow) { /* MeshBasicMaterial, unlit, opacity: ID.GLOW */ }
export function screen(map) { /* MeshBasicMaterial, unlit, opacity: ID.SCREEN */ }
export const PAINTS = { yellow: PAL.yellow, blue: PAL.blue, outline: PAL.white };
export function paint(p) { return ink(PAINTS[p] ?? PAL.yellow); }
export function lineMat(color = PAL.ink) { /* LineBasicMaterial, opacity: ID.INK */ }
export function pointsMat(color = PAL.ink, size = 2) { /* PointsMaterial, opacity: ID.INK */ }
export function labelTexture(text, {w,h,fg='#1a30c0',bg='#f6f3e6',font,size}) { /* 2D canvas -> CanvasTexture */ }
export function label(text, width, opts) { /* plane + screen(labelTexture(...)) */ }
```

### 3.2 `js/render.js` (301 lines) — the whole pipeline today

- `Renderer` owns one `WebGLRenderTarget` (`this.rt`) with a `DepthTexture`,
  renders `this.world` then `this.shipScene` into it (two draw passes, no
  clear between — ship interior draws over/through world as needed), then
  runs one full-screen `ShaderMaterial` (`this.post`) onto the default
  framebuffer. No `EffectComposer`, no bloom, no addons imported at all —
  `index.html`'s import map has only `"three"`, not `"three/addons/"`.
- `POST_FS` (lines 26-158): screen-space wobble → 4-tap depth Laplacian edge
  (`eDepth`) + background-silhouette edge (`eBg`) + id-discontinuity edge
  (`eId`) + colour-discontinuity edge (`eCol`, ink materials only) → picks
  red vs blue ink per edge by sampling neighbour alpha for `ID.ENEMY` (0.8)
  → **background**: solid paper + grain + ruled lines + red margin (warp FX
  drags star points into streaks) → **foreground `id0>0.7` (INK/ENEMY)**:
  luminance-keyed 3-direction screen-space hatch (`hatch()`, lines 46-51,
  fixed angles 0.785/2.356/0.30 rad) mixed with paper-tinted fill → **id0>0.5
  (SCREEN... actually GLOW at 0.6 falls here too since branch is `>0.5`)**:
  paper-tinted hue mix, +12% toward white → **else (SCREEN, 0.4)**: passed
  through lightly toward paper. Composite `col = mix(col, edgeInk, edge)`.
  FX: `damage` red vignette+hatch, `flash` cream flash, `blackout` blue tint,
  `warp` radial streaks.
- `resize()`: `this.pr = min(devicePixelRatio,1.5) * this.quality` —
  `this.quality` is **already** a 0-1+ multiplier hook (`setQuality(q)`), just
  unused by any preset UI today. `scale`/`lw` uniforms derive from output
  height (`H/800`) for resolution-independent line width — keep this exactly,
  it already does what a "quality preset" needs for line weight.
- `pointsMaterial(id)` / `Cloud`: unlit point sprites, ID in alpha, used for
  starfields/galaxy dots (`universe.js`). Unaffected by anything below except
  recolouring.

### 3.3 Every material call site (grep, this session, current colours)

`js/universe.js` (10), `js/mats.js` (11, definitions), `js/ships.js` (18),
`js/game.js` (12), `js/actors.js` (32) — 83 occurrences total. Full list
pulled and categorised for §6's recolour table; the shape of it:

| file | what it colours |
|---|---|
| `universe.js:217,313-330` | star `glow()`, black-hole disk/ring/jets `glow()`, planet fallback `ink(p.color)` when no procedural texture, moons `ink(0xd8d4cc)`, orbit `lineMat()` |
| `universe.js:133-138` (`texMat`/`ringMat`, local, not exported) | procedurally-textured planets, planet rings — both `MeshLambertMaterial` built the same way as `ink()`, just not routed through `mats.js` |
| `ships.js:38-48` | `MATS` table: 15 `ink()` surfaces (wall/ceil/floor/dark/steel/…) + 8 `glow()` accents (lamp/engine/string-lights/…) shared by every ship interior |
| `ships.js:1202,1429` | `paint(paintName)` — hull colour for interior dashboard trim and the exterior hull mesh |
| `actors.js:365-460` | imp (small red enemy): `red()`×3 + `glow()` |
| `actors.js:437-460` | capital ship kit: `red()`×5 (`top/hull/keel/dark/pale`) + `glow()`×3 (`lit/engine/beam`) |
| `actors.js:632-960` | stations (fuel/shipyard/outfitter/general/media/hub): `ink()`/`glow()` mixed, plus `signMat()`/`labelTexture()` signage |
| `game.js:136-137,1007,1225,1295-1460` | projectile/beam/bomb/debris `glow()`/`ink()` |

## 4. New architecture

### 4.1 Principle

Move the hatching **into the object's own material shader**, in world space,
exactly like §1.1/1.2's two-shader split — not a full-screen paper filter.
The post pass shrinks to what it's actually good at: edge lines (already
correct, keep the math) and colour, recoloured for a dark neon scene instead
of paper. This directly satisfies "hatching that follows shading... instead
of a full-screen paper post pass."

```
 today:   [Lambert-lit meshes, ID in alpha] -> [ONE big post shader: edges +
           screen-space luminance hatch + paper/grain/lines/margin fill]

 new:     [meshes: Lambert-lit + onBeforeCompile world-space hatch (§5) +
           fresnel neon rim] -> [slim post: edges recoloured neon + dark-space
           fill + glow-id brightness boost] -> [EffectComposer: RenderPass
           (already rendered, feeds in as a texture) -> UnrealBloomPass]
```

Both the world-space hatch and the fresnel rim run **per material**, cached
exactly like today (`cache.get(key)` in `mats.js`), so this costs zero extra
draw calls and zero extra allocation — it's more fragment math on the same
geometry, not new geometry or new passes for the *scene* half of the pipeline.
Bloom is the only new pass, and it's a fixed small number of full-screen
draws independent of scene complexity (§8).

### 4.2 Why `onBeforeCompile` on `MeshLambertMaterial`, not a hand-written `ShaderMaterial`

Doodle Shooter's material shader (§1.1) is a from-scratch `ShaderMaterial`
because it only ever needs one directional light — it never wires up
`HemisphereLight` + multiple `PointLight`s the way `ships.js` does (up to 3
lamps per interior, contract in `PLAN.md`). Reimplementing three.js's light
loop by hand to keep that working is real risk for no benefit. Instead, keep
`MeshLambertMaterial` (so `HemisphereLight`/`DirectionalLight`/`PointLight`
all keep working exactly as `game.js`/`ships.js` already wire them) and use
`onBeforeCompile` to inject the hatch + rim **after** three's own lighting
chunks have computed `reflectedLight.directDiffuse`/`indirectDiffuse`, at the
`#include <output_fragment>` chunk — the same injection point
`references/three.md` §6 uses for its dissolve effect (verified pattern, not
a guess).

**The recompile trap** (`three.md` §3, measured there: a material property
whose setter flips a shader `#define` costs "tens to hundreds of
milliseconds" — a real stutter): quality-preset changes below (hatch on/off,
directions 0/2/3) MUST be **uniform-driven branches inside the shader**, never
a material property that changes which chunk gets compiled in. `uHatchDirs`
is a `float` uniform read at runtime, not a define. Same discipline as the
existing `pr` (pixel ratio) uniform pattern already in `render.js`.

## 5. `js/mats.js` — full rewrite

### 5.1 New palette

Neon-on-dark. Every pairing below is a **measured** WCAG contrast ratio
(sRGB→linear relative luminance, `(L_light+0.05)/(L_dark+0.05)`), computed
this session, not eyeballed:

| role | hex | vs `SPACE_BG` #05070C | vs `HULL_CHARCOAL` #23262E | note |
|---|---|---|---|---|
| `SPACE_BG` (canvas/void clear) | `#05070C` | — | — | replaces `PAL.paper` as the background id-`<0.05` fill |
| `SPACE_HAZE` (far gradient) | `#0E1420` | — | — | top-of-screen lerp target, see §6.2 |
| `TEXT` (HUD copy) | `#E7ECFF` | 17.12:1 | 12.85:1 | AAA everywhere it's used |
| `NEON_CYAN` (friendly ink/rim/HUD accent) | `#4DEEFF` | 14.38:1 | 10.80:1 | replaces `PAL.ink` |
| `NEON_BLUE` (secondary friendly trim) | `#4D7CFF` | 5.41:1 | — | replaces `PAL.blue` |
| `NEON_RED` (hostile ink/rim/HUD) | `#FF3B5C` | 5.79:1 | 4.35:1 | replaces `PAL.red`; 4.35:1 vs charcoal clears AA-large (3:1) but not AA-normal (4.5:1) — for small red *text* on a hull-coloured chip, keep the existing `mix-blend-mode:multiply` dark chip background from `references/games.md` (already the pattern `style.css` uses for `.prompt`/`.toasts`), don't rely on the raw ratio |
| `NEON_AMBER` (engines/fuel/warm glow) | `#FFC23C` | 12.51:1 | — | replaces `PAL.yellow` |
| `NEON_MAGENTA` (alerts/aim-assist) | `#FF4DE1` | 7.10:1 | — | replaces `PAL.pink` |
| `HULL_CHARCOAL` (base hull/interior neutral) | `#23262E` | 1.33:1 | — | deliberately close in value to space — the fresnel rim (§5.3) is what separates silhouette from void, not raw contrast; this is the "darker, not white" ask |
| `HULL_INDIGO` (blue-toned paint option) | `#232A45` | 1.43:1 | — | |

```js
export const PAL = {
  // hull / interior neutrals — dark on purpose, rim light carries the read
  charcoal: 0x23262e, indigo: 0x1c2036, slate: 0x2a3040, black: 0x14151c,
  white: 0xc7cede,          // was near-paper; now a bright cool neutral, still not neon
  grey: 0x555b66, dark: 0x14151c, steel: 0x5b6577, cream: 0x8a8368, wood: 0x6a4a30,
  // neon — friendly
  cyan: 0x4deeff, blue: 0x4d7cff, amber: 0xffc23c, green: 0x36a06a, teal: 0x2fb6c9,
  // neon — hostile / alert
  red: 0xff3b5c, redDark: 0x2a0912, redPale: 0xff8fa0, magenta: 0xff4de1,
  orange: 0xff8a3c, pink: 0xff7fb0, yellow: 0xffc23c,
};
export const SPACE_BG = 0x05070c, SPACE_HAZE = 0x0e1420;
```

`ink()`'s old default was `PAL.white` (near-paper); the new default is
`PAL.charcoal` — this alone is the "make the ship darker, not white" fix for
every call site that didn't pass an explicit colour.

### 5.2 Frame uniforms module

One shared, mutated-in-place object so every cached material reads the same
light state without per-material per-frame `.set()` calls scattered across
`game.js` (avoids the "per-frame allocation" trap — `three.md` §8.6 — by
never creating a new `Vector3`/`Color` after boot):

```js
// mats.js
export const LIGHT = {
  dir: new THREE.Vector3(1, 0.6, 0.4),      // world-space direction TOWARD the star; game.js already
                                             // maintains this exact vector at this.sun.position (game.js:1600)
  color: new THREE.Color(0xfff4d8),
  hemiSky: new THREE.Color(0x1a2440),       // fresnel "sky" tint, dark-neon version of the old hemi sky colour
  hemiGround: new THREE.Color(0x05060a),
};
export const QUALITY = { hatchDirs: 3, rim: 1 };  // read every frame as uniforms, never as #defines — see §4.2
```

`game.js:1598-1601` already recomputes `this.sun.position` (= light
direction) and colour-tints intensity from the real star each frame — **wire
its direction into `LIGHT.dir` in that same block** (`LIGHT.dir.copy(V1)`)
instead of adding a second light-tracking system. Tint `LIGHT.color` from
`starColor(star.teff)` (function already exists, `universe.js:41`) the same
frame. This is the "star as key light" ask — mechanically already 90% built,
this wires the last 10% into the material shader.

### 5.3 The shared injection — full GLSL

```js
// mats.js
function applyNeonInk(shader, { rim, rimStrength = 1.0, hatchTint }) {
  Object.assign(shader.uniforms, {
    uLightDir: { value: LIGHT.dir }, uLightColor: { value: LIGHT.color },
    uHemiSky: { value: LIGHT.hemiSky }, uHemiGround: { value: LIGHT.hemiGround },
    uRimColor: { value: new THREE.Color(rim) }, uRimStrength: { value: rimStrength },
    uHatchTint: { value: new THREE.Color(hatchTint) }, uHatchDirs: { value: QUALITY.hatchDirs },
  });

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vDvWorldPos;\nvarying vec3 vDvWorldNormal;`)
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\nvDvWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\nvDvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);

  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      varying vec3 vDvWorldPos; varying vec3 vDvWorldNormal;
      uniform vec3 uLightDir, uLightColor, uHemiSky, uHemiGround, uRimColor, uHatchTint;
      uniform float uRimStrength, uHatchDirs;
      float dvHash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float dvNoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        float a=dvHash(i), b=dvHash(i+vec2(1.,0.)), c=dvHash(i+vec2(0.,1.)), d=dvHash(i+vec2(1.,1.));
        return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
      float dvStripe(vec2 p, vec2 dir, float spacing, float width){
        float t = dot(p, vec2(-dir.y, dir.x));
        float f = abs(fract(t / spacing) - 0.5) * spacing;
        return 1.0 - smoothstep(width * 0.5, width * 0.5 + width * 0.6, f);
      }`)
    .replace('#include <output_fragment>', `
      vec3 N = normalize(vDvWorldNormal);
      vec3 V = normalize(cameraPosition - vDvWorldPos);
      // shade: 0 (fully lit) .. 1 (fully dark) — deliberately independent of
      // the surface's own albedo, unlike the old screen-space post-pass hatch.
      // reflectedLight.{directDiffuse,indirectDiffuse} are already computed by
      // three's own Lambert lighting chunks above this insertion point.
      float lit = dot(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3(0.299, 0.587, 0.114));
      float shade = 1.0 - clamp(lit, 0.0, 1.0);
      float hatch = 0.0;
      if (uHatchDirs > 0.5) {
        vec3 an = abs(N);
        vec2 hp = an.y > max(an.x, an.z) ? vDvWorldPos.xz : (an.x > an.z ? vDvWorldPos.zy : vDvWorldPos.xy);
        hp += (dvNoise(hp * 3.0) - 0.5) * 0.35;                        // hand-drawn waver, fixed to the surface
        float h1 = dvStripe(hp, vec2(0.7071, 0.7071), 0.22, 0.05);
        hatch = h1 * smoothstep(0.36, 0.50, shade);
        if (uHatchDirs > 1.5) {
          float h2 = dvStripe(hp, vec2(-0.7071, 0.7071), 0.26, 0.05);
          hatch = max(hatch, h2 * smoothstep(0.58, 0.74, shade));
        }
        if (uHatchDirs > 2.5) {
          float h3 = dvStripe(hp, vec2(0.2588, 0.9659), 0.16, 0.045);
          hatch = max(hatch, h3 * smoothstep(0.78, 0.90, shade));
        }
        hatch = max(hatch, smoothstep(0.92, 1.0, shade) * 0.85);        // near-black: solid crosshatch
      }
      vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
      outgoingLight = mix(outgoingLight, outgoingLight * uHatchTint, hatch * 0.7);
      float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);
      outgoingLight += uRimColor * fres * uRimStrength;                 // the neon edge / "atmosphere glow"
      gl_FragColor = vec4(outgoingLight, diffuseColor.a);               // alpha untouched: still the material ID
    `);
}
```

Notes for the implementer:
- `reflectedLight`, `diffuseColor`, `totalEmissiveRadiance` are variables
  three.js's own Lambert chunks declare earlier in the same function; do not
  redeclare them.
- `cameraPosition` is a built-in uniform three provides to every material
  automatically — no wiring needed.
- Three shade thresholds (`0.36/0.50`, `0.58/0.74`, `0.78/0.90`) are evenly
  spaced steps so `uHatchDirs` 0/2/3 (§8 quality table) changes *density*
  without the darkest band ever going pure-black-with-no-hatch or the
  lightest band hatching when it shouldn't — tuned against the same
  three-threshold shape Doodle Shooter uses (§1.2), inverted because our
  `shade` is 0=lit/1=dark instead of their 0=dark/1=lit.
- `hatch * 0.7` (not 1.0) — full black hatch strokes over a coloured surface
  reads as dirt; 70% keeps the base hue visible under the crosshatch, matching
  how Doodle Shooter's own `hatch*0.72` (its post shader, not shown in the
  excerpt above) softens the same way.

### 5.4 New `mats.js` public API

```js
export const ID = { INK: 1.0, ENEMY: 0.8, GLOW: 0.6, SCREEN: 0.4 };  // UNCHANGED — see §9

const cache = new Map();
function cached(key, make) { let m = cache.get(key); if (!m) { m = make(); cache.set(key, m); } return m; }

function makeInk(color, id, { rim, rimStrength, hatchTint }) {
  const key = `${id}|${color}|${rim}|${rimStrength}|${hatchTint}`;
  return cached(key, () => {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true, blending: THREE.NoBlending, opacity: id });
    m.onBeforeCompile = (shader) => applyNeonInk(shader, { rim, rimStrength, hatchTint });
    m.customProgramCacheKey = () => key;   // MANDATORY — three.md §6: without this, cached materials
    return m;                              // sharing a base colour but different onBeforeCompile collide
  });                                      // on the wrong compiled program
}

export function ink(color = PAL.charcoal, { rim = PAL.cyan, rimStrength = 0.9, hatchTint = 0x05060a } = {}) {
  return makeInk(color, ID.INK, { rim, rimStrength, hatchTint });
}
export function red(color = PAL.red, { rim = PAL.red, rimStrength = 1.3, hatchTint = 0x1a0106 } = {}) {
  return makeInk(color, ID.ENEMY, { rim, rimStrength, hatchTint });
}
// glow(): UNCHANGED shape (unlit MeshBasicMaterial), only the default colour moves — see §5.5
export function glow(color = PAL.amber) {
  return cached('glow' + color, () => new THREE.MeshBasicMaterial({ color, blending: THREE.NoBlending, opacity: ID.GLOW }));
}
export function screen(map) { return new THREE.MeshBasicMaterial({ map, blending: THREE.NoBlending, opacity: ID.SCREEN }); }

export const PAINTS = {
  cyan:   { hull: PAL.charcoal, rim: PAL.cyan },
  blue:   { hull: PAL.indigo,   rim: PAL.blue },
  outline:{ hull: 0x0a0b10,     rim: PAL.cyan, rimStrength: 1.4 },   // bare-hull look, was "outline"/PAL.white
};
export function paint(p) { const c = PAINTS[p] ?? PAINTS.cyan; return ink(c.hull, { rim: c.rim, rimStrength: c.rimStrength ?? 0.9 }); }

export function lineMat(color = PAL.cyan) { /* unchanged shape, opacity: ID.INK */ }
export function pointsMat(color = PAL.cyan, size = 2) { /* unchanged shape, opacity: ID.INK */ }

export function labelTexture(text, { w = 256, h = 64, fg = '#4deeff', bg = '#0b0f18', font = 'Patrick Hand', size = 40 } = {}) {
  // unchanged mechanism (2D canvas -> CanvasTexture); only fg/bg defaults move to neon-on-dark
}
```

`ships.js` currently calls `paint('yellow')`/`paint('blue')`/`paint('outline')`
(`ships.js:1202,1429`, default paint stored per-ship in save data as
`s.paint[type] || 'yellow'`) — **rename the save-data key set** in
`PAINTS` above from `{yellow,blue,outline}` to `{cyan,blue,outline}` and grep
`js/` + any `data/`/`localStorage` migration path for the literal string
`'yellow'` as a paint name (not as a colour) before shipping, so an existing
save's chosen paint still resolves instead of falling through to `??
PAINTS.cyan` silently changing what a returning player sees. `ui.js`'s paint
picker UI also needs its option list updated to match.

### 5.5 `glow()` needs to run genuinely bright, not just be a bright hex colour

A hex colour's channels are 0..1 — `0xffc23c` cannot itself exceed the
luminance-threshold bloom in §7 picks up. Two additions, both in the post
composite (§6), not in `mats.js`:
1. Composite pass multiplies any `ID.GLOW` (0.6) pixel's colour by a
   `uGlowBoost` uniform (1.8 on `medium`, 2.4 on `full`, §8) *before* it's
   handed to `UnrealBloomPass`, deliberately pushing it over threshold.
2. `red()`'s rim (`rimStrength: 1.3`) and `ink()`'s rim (`0.9`) are tuned so
   the neon trim itself sits *near* but usually under bloom threshold except
   at grazing fresnel angles — a glimmer, not a permanent halo on every edge.

## 6. `js/render.js` — rewrite

### 6.1 Keep unchanged

- The `Renderer` class shape, `this.rt` (colour+depth render target),
  rendering `this.world` then `this.shipScene` into it, `Cloud`/
  `pointsMaterial` (recolour only, §5.4), `resize()`'s `scale`/`lw`
  resolution-independent line-width derivation, `squash()`/scaled-space maths
  (untouched — orthogonal concern).
- The **edge-detection maths** in `POST_FS` (`eDepth`, `eBg`, `eId`, `eCol`,
  the `enemyEdge` neighbour-alpha sampling) — this already implements the
  same idea as Doodle Shooter's inverse-depth Laplacian + normal-discontinuity
  test (§1.2) and works; only the colour it's mixed toward changes.

### 6.2 New `POST_FS`

Foreground pixels no longer need re-hatching (that's now baked into `c0.rgb`
by §5.3) — the composite collapses to edge colour + background:

```glsl
precision highp float;
uniform sampler2D tColor, tDepth;
uniform vec2 res; uniform float time, cnear, cfar, boil, lw, scale;
uniform float flash, damage, warp, blackout, glowBoost;
uniform vec3 inkCyan, inkRed, spaceBg, spaceHaze;
varying vec2 vUv;
// hash12/noise/lin/toS/isBg/isId: UNCHANGED from the current file (lines 36-52)

void main() {
  // ... unchanged wobble + neighbour sampling + eDepth/eBg/eId/eCol/edge/enemyEdge setup ...
  vec3 edgeInk = enemyEdge ? inkRed : inkCyan;

  vec3 col;
  if (b0 > 0.5 && id0 < 0.05) {
    // dark space instead of paper: vertical gradient + the same warp-streak FX, recoloured
    col = mix(spaceBg, spaceHaze, smoothstep(0.0, 1.0, vUv.y));
    if (warp > 0.001) { /* unchanged streak accumulation loop, mixed toward inkCyan instead of inkBlue */ }
  } else {
    col = toS(c0.rgb);                              // already fully lit + hatched + rim-lit by mats.js
    if (isId(id0, 0.6)) col *= glowBoost;            // §5.5 — push GLOW pixels over bloom threshold
  }
  col = mix(col, edgeInk, clamp(edge, 0.0, 1.0));

  // FX: damage -> inkRed vignette (unchanged shape), flash -> near-white flash (unchanged shape),
  // blackout -> inkCyan*0.35 (was inkBlue*0.35), warp centre swirl -> inkCyan (was inkBlue)
  gl_FragColor = vec4(col, 1.0);
}
```

Delete entirely: `pap`/`rules`/`margin`/ruled-line/graph-grid/red-margin
block (old lines 91-97, 100-138 minus the two lines kept above) and the
`hatch()` screen-space function (superseded by §5.3's world-space version) —
`hatch()` is still referenced by the `damage` FX vignette in the current file
(line 153); replace that one remaining call with a fixed-frequency
screen-space `stripes()`-style scribble (copy `dvStripe`-shape maths inline,
FX vignettes are legitimately screen-space, unlike material hatching) rather
than deleting the visual entirely.

### 6.3 Uniforms diff

| old uniform | new uniform | value |
|---|---|---|
| `inkBlue (.102,.188,.753)` | `inkCyan` | `(0.302, 0.933, 1.0)` = `#4DEEFF` |
| `inkRed (.816,.125,.188)` | `inkRed` | `(1.0, 0.231, 0.361)` = `#FF3B5C` |
| `paper (.965,.953,.902)` | `spaceBg` | `(0.020, 0.027, 0.047)` = `#05070C` |
| `rules (.62,.72,.92)` | `spaceHaze` | `(0.055, 0.078, 0.125)` = `#0E1420` |
| `margin (.9,.42,.46)` | *(removed — no ruled-paper margin in a space scene)* | |
| *(new)* | `glowBoost` | `1.8` medium / `2.4` full / `1.0` low (bloom off, boost pointless) |

## 7. Bloom — `EffectComposer` + `UnrealBloomPass`, verified against the pinned build

Fetched and read this session,
`https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/UnrealBloomPass.js`
(12,410 bytes, saved at `D:\tmp-dv\look\UnrealBloomPass.js`) — this is not
assumed API, it's the exact shipped source for the pinned version:

- Constructor: `new UnrealBloomPass(resolution: Vector2, strength, radius, threshold)`.
- **It already halves internally**: `resx = Math.round(resolution.x / 2)` —
  pass the render target's *full* pixel size and the pass is automatically
  at half resolution. **Do not manually halve the argument** — doing so would
  make it quarter-resolution, softer than intended.
- `nMips` is **hard-coded to 5** in the constructor, not exposed as an option
  — do not attempt to reduce it; the only tunable cost knobs are `strength`/
  `radius`/`threshold` and the resolution argument (already fixed above).
- Fixed draw-call cost regardless of scene complexity: 1 high-pass extract +
  5×2 separable-blur passes (horizontal+vertical per mip) + 1 composite + 1
  additive blend = **13 full-screen draws**, each at ≤half canvas resolution
  and shrinking by half again per mip (so mip 4 is 1/32 canvas resolution) —
  cheap in aggregate even on integrated GPU. This is separate from and does
  not count against the scene's own "~250 draw calls" geometry budget (§8.4).
- Uses `HalfFloatType` render targets internally (`renderTargetBright`, the
  horizontal/vertical mip chain) — requires `EXT_color_buffer_half_float` /
  `OES_texture_half_float` support. Broadly available (desktop + ChromeOS
  Chromebooks with WebGL2), but **on `low` preset, skip the pass entirely**
  (§8) rather than special-case a fallback format.

### 7.1 Wiring (`index.html` + `render.js`)

```html
<!-- index.html — add the addons entry alongside the existing "three" key -->
<script type="importmap">{"imports":{
  "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
}}</script>
```

```js
// render.js
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// The composite pass (§6.2's POST_FS, now a ShaderPass instead of a bare
// full-screen Mesh) becomes the FIRST composer pass; bloom reads its output.
this.composePass = new ShaderPass(this.post);          // this.post: same ShaderMaterial as today, new POST_FS
this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.55, 0.78); // sized in resize(), see below
this.composer = new EffectComposer(this.gl);
this.composer.addPass(this.composePass);
this.composer.addPass(this.bloomPass);
// Do NOT set .renderToScreen on either pass by hand. Read in full this
// session (D:\tmp-dv\look\EffectComposer.js): render() recomputes
// `pass.renderToScreen = this.renderToScreen && this.isLastEnabledPass(i)`
// itself, every frame, for every pass — this is what makes §8's low-preset
// `bloomPass.enabled = false` toggle work with zero extra bookkeeping:
// EffectComposer automatically retargets composePass to the screen the
// instant bloomPass is disabled, and back the instant it's re-enabled.
```

`this.composePass` reads `tColor`/`tDepth` from `this.rt` exactly as the bare
quad did today. Verified this session (`D:\tmp-dv\look\ShaderPass.js`):
`new ShaderPass(shader)` checks `shader instanceof ShaderMaterial` — passing
`this.post` (already a `THREE.ShaderMaterial`) directly makes
`this.composePass.uniforms === this.post.uniforms` (same object, no copying
needed) and reuses it as `this.composePass.material`. `ShaderPass.render()`
separately auto-wires whatever uniform is named `tDiffuse` to the previous
pass's output texture — `POST_FS` has no `tDiffuse` uniform, so that
auto-wiring is a harmless no-op here: keep feeding `tColor`/`tDepth` manually
from `this.rt` exactly as `resize()` already does, since `composePass` is
deliberately the *first* pass and has no "previous pass" to inherit from.

`render()`'s tail changes from:
```js
g.setRenderTarget(null); g.render(this.postScene, this.postCam);
```
to:
```js
this.composer.render();   // EffectComposer owns setRenderTarget/clear internally
```
Resize must also call `this.composer.setSize(W, H)` and
`this.bloomPass.resolution.set(W, H)` alongside the existing `this.rt`
resize.

### 7.2 Why threshold-based bloom, not the "selective bloom" darken-material technique

`threejs-postprocessing` skill's selective-bloom recipe (bloom layer +
darken-non-bloomed-materials + **second full scene render**) was considered
and rejected: it doubles the scene draw-call count every frame, which is the
one thing a Chromebook-class integrated GPU can least afford. Because §5.5
already deliberately pushes exactly the pixels that should glow (GLOW-id
surfaces via `glowBoost`, neon rim at grazing fresnel angles) above 1.0 while
everything else (hatched hull, dark space) stays under ~0.7, a plain
luminance `threshold` (0.78) gets "selective" bloom for free from one extra
read of the already-rendered frame — no second scene pass. This is the
"selective bloom" the task asked for, achieved the cheap way.

## 8. Quality presets

Extends the existing `this.quality` hook (`render.js` `setQuality(q)`,
already wired to `resize()`'s resolution scale — was unused by any preset UI
before this). `this.quality` continues to mean the same thing (render-target
resolution multiplier); the table adds the new knobs alongside it, all
**uniform-driven** per §4.2's recompile-trap rule — switching preset at
runtime never recompiles a shader, only changes numbers already-compiled
shaders branch on.

| preset | `this.quality` | pixel-ratio clamp | `QUALITY.hatchDirs` | bloom | `glowBoost` |
|---|---|---|---|---|---|
| **low** | 0.75 | 1.0 | 0 (flat NdotL + rim only, no stripe fragment math) | off (`bloomPass.enabled = false`; §7.1 — `composePass` is retargeted to the screen automatically) | 1.0 |
| **medium** | 1.0 | 1.25 | 2 | on | 1.8 |
| **full** | 1.0 | 1.5 (existing clamp, unchanged) | 3 | on | 2.4 |

`low`'s bloom-off path: set `this.bloomPass.enabled = false` — cheaper than
removing it from the composer, and avoids rebuilding the composer's pass
array at runtime. `EffectComposer.render()`'s own loop (verified this
session, `D:\tmp-dv\look\EffectComposer.js`) is `if (pass.enabled === false)
continue;` before it calls `pass.render(...)` — so `low` genuinely pays zero
bloom cost (all 13 of §7's draws skipped), not just a zero-strength one, and
(per the note above) automatically re-targets `composePass` straight to the
screen for that frame.

## 9. IDs, labels, points, lines after the paper pass is gone

**Nothing about the ID scheme changes.** `ID = {INK:1.0, ENEMY:0.8, GLOW:0.6,
SCREEN:0.4}` stays exactly as-is and is still load-bearing:
- The composite pass (§6.2) still needs `id0` to pick `inkCyan` vs `inkRed`
  edges and to find `GLOW` pixels for `glowBoost` — both read straight off
  the same alpha channel as today.
- `screen()` (unlit `MeshBasicMaterial`, `ID.SCREEN`) is **untouched** — MP4
  playback, the NAV display, and handwritten signage must stay crisp and
  literally readable, not hatched or rim-lit. Only its *input textures* (via
  `labelTexture()`'s new `fg`/`bg` defaults, §5.4) move to the neon palette.
- `lineMat()`/`pointsMat()` (orbit rings, starfield/galaxy `Cloud` sprites)
  stay unlit and un-hatched — recolour their defaults to `PAL.cyan` only.
  They're drawn as `THREE.LineSegments`/`THREE.Points`, not shaded meshes, so
  §5.3's injection (which patches a mesh material's fragment chunks) doesn't
  apply to them and shouldn't.
- `label()`/`labelTexture()` mechanism (2D canvas → `CanvasTexture`) is
  unchanged; only the default `fg`/`bg` move from ink-blue-on-paper to
  neon-cyan-on-dark-panel (§5.4). `ships.js:213`'s own override (`bg:
  '#26283c', fg: '#f6f3e6'`) and `actors.js:246`'s (`bg`, `fg: INK` — a local
  const, grep `actors.js` for `const INK =` and repoint it to `PAL.cyan` or
  the new hex) need the same recolour, call-site by call-site (§10).

## 10. Recolour pass — every call site from §3.3, concretely

Mechanical description, not full source — the *mechanism* changes only in
`mats.js` (§5); every other file keeps the same function calls and only the
colour/paint arguments passed in move to the new palette. Grep patterns to
re-find each group:

| file:lines | grep anchor | change |
|---|---|---|
| `universe.js:217` | `glow(starColor(` | unchanged — star colour is physically derived, already correct, already bright enough for `glowBoost` |
| `universe.js:223` | `else mat = ink(p.color);` | unchanged call; `p.color` values come from planet data (`data/exoplanets.json`) and should stay physically-ish coloured — the hatch/rim now applied automatically makes these read as lit spheres with a hatched terminator and a coloured atmosphere-glow rim instead of a flat tinted circle. Pick `rim` per body: pass `{ rim: p.tex === 'ice' ? PAL.cyan : p.tex === 'gas' ? PAL.amber : 0x8fb0ff }` (simple 3-way default is enough; don't over-engineer per-planet atmosphere chemistry) |
| `universe.js:236` | `ink(0xd8d4cc)` (moons) | `ink(0x9098a8)` — cooler grey, still catches rim light |
| `universe.js:253` | `lineMat()` | unchanged call, new default colour from §5.4 |
| `universe.js:313-330` | black-hole/exotic-body `glow(...)` | recolour disk/ring/jet hex values toward `PAL.amber`/`PAL.cyan` family; these are already `glow()` (unlit, bloom-eligible) so no mechanism change |
| `universe.js:133-138` (`texMat`, `ringMat`) | `function texMat`/`function ringMat` | **mechanism change**: both currently hand-build `MeshLambertMaterial` locally instead of calling `mats.js`. Either (a) export `applyNeonInk` from `mats.js` and call it from these two local factories too, or (b) delete the local duplicates and have `universe.js` call `mats.js`'s `ink()`-family instead, passing `map` through a small `ink()` overload. (a) is less invasive — do that |
| `ships.js:38-43` (`MATS.wall/ceil/floor/dark/black/steel/grey/wood/plank/cream/white/glass/mirror/tile/teal/pink/orange/green/blue/yellow/brass/net/terra/board/hole`) | `const MATS = {` | every entry recolours off the new `PAL`; walls/ceiling/floor move from `PAL.white`/`PAL.paper`/`0xdcd6c6` to `PAL.charcoal`/`PAL.slate`/`0x1c1e26` — this is the single biggest visible change for the on-foot interior shots (`D:\tmp-dv\look\shots\on-foot-1366x768.png`) |
| `ships.js:46-48` (`GLOWMATS.lamp/yellow/teal/pink/green/orange/blue/red/engine/str1/str2`) | `const GLOWMATS = {` | recolour toward the neon set; keep `lamp`/warm accents on `PAL.amber` family so interiors still feel inhabited, not all-cyan |
| `ships.js:1202,1429` | `paint(paintName)` | no call-site change — `paint()`'s new implementation (§5.4) already returns the right thing; only the save-data migration note in §5.4 applies |
| `game.js:136-137` (`boltMat`, `eBoltMat`) | `this.boltMat = glow(` | `boltMat: glow(PAL.amber)`, `eBoltMat: glow(PAL.red)` — friendly vs hostile fire already colour-coded, keep the split, move both to neon |
| `game.js:1007,1225,1295-1460` | `glow(0xff4a3a)` etc, `ink(PAL.dark)` (debris) | mechanical recolour only |
| `actors.js:365-460` (imp, capital kit) | `red(PAL.red)`, `red(0x6e0e1c)` etc | mechanism unchanged (still `red()`), recolour hex literals toward the `NEON_RED` family (§5.1); `lit`/`engine`/`beam` `glow()`s move to a hot amber-to-red gradient so capital ships read as "red neon", matching the ask verbatim |
| `actors.js:632-960` (stations) | `ink(PAL.x)`/`glow(PAL.x)` per station kind | recolour only; keep each station's existing *accent* hue (shipyard amber sign, outfitter orange, general-store green) so they stay tell-apart-able at a glance — don't flatten every station to the same cyan |
| `actors.js:246` | `const INK = ...` (grep exact declaration) | repoint to the new palette; feeds `labelTexture()` calls for station/sign text |

## 11. HUD / CSS (`style.css`, `index.html` meta)

Not a render-pipeline change, but Gev asked for the ship and shaders, and a
neon 3D view under the current cream/blue HUD chrome would look like a
mismatched skin. Token swap only — `references/games.md`'s `mix-blend-mode:
multiply` HUD-chip pattern (already used by `.bar`, `.prompt`, `.toasts`,
`.flags span` in the current `style.css`) is **kept as-is**, it's the
mechanism that makes ink read as sitting *on* the 3D backdrop; only the
custom-property values move:

```css
:root {
  --ink: #4deeff;        /* was #1a30c0 */
  --ink-soft: rgba(77, 238, 255, 0.18);
  --red: #ff3b5c;        /* was #d02030 */
  --paper: #0b0f18;      /* was #f6f3e6 — now a dark panel colour, not literal paper */
  --paper-2: #141a28;    /* was #efe9d6 */
  --rule: rgba(77, 238, 255, 0.13);
  --hi: #ffc23c;         /* was #ffd84a */
}
html, body { background: #05070c; }   /* was var(--paper); matches SPACE_BG (§6.3) so the loading flash before canvas paint doesn't pop cream */
```
`kbd { background: #fff9e8; }` (line 17) and `.mainbtns button { background:
#fff9e8 }` (lines 102, 107, 131, 165) are hard-coded cream, not tokenised —
grep `#fff9e8` and move those to a dark-chip equivalent (e.g. `#151b28`) by
hand; they're the one spot the token swap above won't reach automatically.
`index.html:8` `<meta name="theme-color" content="#f6f3e6">` and the inline
SVG favicon's `fill='%23f6f3e6'` (`index.html:12`) also want the same swap so
the browser chrome/tab icon matches. `mix-blend-mode: multiply` against a
*dark* backdrop inverts its usual "ink sits on light paper" darkening
behaviour — verify visually after the swap (§12) that chips still read as
legible panels and not as near-invisible dark-on-dark; if `multiply` stops
working the way it should on the new dark ground, the fallback is
`mix-blend-mode: screen` (the light-background-appropriate operator's dark-
background counterpart), but try `multiply` first since every value above
was chosen to still be light-on-dark (`--ink`/`--red`/`--hi` are all bright).

## 12. Testing

1. **`node tools/test.mjs`** must stay 40/41 or better (baseline this
   session, unchanged by this spec — the known failure is unrelated,
   "autopilot closes on Mars", see `HANDOFF.md`). None of the checks assert
   on pixel colour, so this rewrite shouldn't regress any of them structurally
   — but re-run after each stage below, not just at the end, since a shader
   compile error surfaces as a console error the harness already fails on.
2. **Visual, at all three test widths** (1366×768, 1280×720, 1920×1080 —
   keyboard+mouse game, never phone widths per the project's own rule): reuse
   `D:\tmp-dv\look\shoot-dv.mjs` (written this session, boots the live game
   headless via `window.__dv` exactly like `tools/test.mjs` and grabs
   title/helm-space/near-planet/on-foot/combat) as a starting point, extend
   its `widths` array to the three required sizes, and diff each new
   screenshot against the "before" set already saved at
   `D:\tmp-dv\look\shots\*-1366x768.png` — the on-foot and helm-space shots
   are the two that most obviously show today's "everything white" problem
   and are the clearest regression check.
3. **Shader compile errors**: `b.errors` from `tools/cdp.mjs`'s `launch()`
   already captures `Runtime.exceptionThrown` and console errors — a broken
   `onBeforeCompile` string replacement (a `#include` chunk name that doesn't
   exist in `MeshLambertMaterial`'s shader in three@0.170.0, or the
   `EXT_color_buffer_half_float` check) will surface here.
   `renderer.info.programs.length` (per `three.md` §8.2) should **not** grow
   after boot while switching quality presets — assert this explicitly if
   adding an automated check, since it's exactly the recompile-trap §4.2
   warns about.
4. **Draw-call / program count sanity**: `renderer.info.render.calls` and
   `renderer.info.programs.length`, read via `window.__dv.r.gl.info` (the
   `Renderer` class's `this.gl` is the `WebGLRenderer`) — confirm scene draw
   calls stay under the existing ~250 budget (`PLAN.md`'s per-ship-part
   triangle budgets are unaffected by this spec, this is a call-count sanity
   check, not a new budget) and that `programs.length` is stable across a
   quality-preset switch.
5. **Contrast**: the ratios in §5.1 are computed, not rendered — after
   implementation, re-screenshot the HUD at all three widths and eyeball
   small red-on-hull labels (station names, `Dreadnought`/`Carrier` callouts
   in `actors.js`) specifically, since that's the one pairing in §5.1 that
   doesn't clear AA-normal on its own.

## 13. Rollout order

1. `js/mats.js`: new `PAL`, `applyNeonInk`, `makeInk`, `ink`/`red`/`glow`/
   `paint`/`PAINTS`/`lineMat`/`pointsMat`/`labelTexture` (§5). Nothing else
   changes yet — the game still renders through the *old* `POST_FS`, so
   expect it to look broken/double-hatched at this checkpoint; that's
   expected, not a regression, don't debug it here.
2. `js/render.js`: new `POST_FS` (§6.2), `LIGHT`/`QUALITY` wiring from
   `mats.js`, star-direction feed from `game.js:1598-1601` into `LIGHT.dir`/
   `LIGHT.color`. Re-screenshot — this is the first checkpoint that should
   look approximately right (dark space, hatched-and-lit hull, neon edges),
   still without bloom.
3. `index.html` import map + `EffectComposer`/`UnrealBloomPass` wiring (§7).
   Re-screenshot combat and helm shots specifically (lasers/engines/capital
   beams are where bloom should visibly matter).
4. `js/mats.js` + `js/universe.js`'s `texMat`/`ringMat` (§10 row) for planets.
5. Quality presets (§8) wired to whatever settings UI already exists in
   `ui.js` for the existing (currently-unused) `setQuality` hook.
6. Recolour pass proper: `ships.js`, `actors.js`, `game.js`, `universe.js`
   call-site hex literals (§10 table, mechanical).
7. `style.css`/`index.html` HUD tokens (§11).
8. Full `tools/test.mjs` run + three-width visual pass (§12).

## Appendix — files written by this research pass

- `D:\tmp-dv\look\game.js`, `style.css` — Doodle Shooter's fetched bundle/CSS.
- `D:\tmp-dv\look\shader_0.glsl`, `shader_1.glsl`, `shader_2.glsl` — its three
  extracted GLSL template literals (material vertex, material fragment, post
  fragment).
- `D:\tmp-dv\look\UnrealBloomPass.js`, `EffectComposer.js`, `ShaderPass.js` —
  three@0.170.0's addon sources, fetched to verify §7's API claims (halving
  behaviour, fixed `nMips`, the `pass.enabled`/`renderToScreen` auto-retarget
  loop, `tDiffuse` auto-wiring) against ground truth rather than memory.
- `D:\tmp-dv\look\shoot-dv.mjs` — scratch CDP driver, boots the live local
  Doodle Voyager deploy and screenshots title/helm-space/near-planet/on-foot/
  combat.
- `D:\tmp-dv\look\shots\*-1366x768.png` — the "before" screenshots referenced
  throughout this spec, zero console errors on capture.
