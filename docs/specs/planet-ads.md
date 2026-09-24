# Planet ads: AdMob reality check + house/parody billboard spec

Status: research + design only, not implemented. Written 2026-09-24 for Gev's
Doodle Voyager (`D:\doodle-voyager`). Read `docs/PLAN.md` and `docs/HANDOFF.md`
first for module contracts and current state (40/41 tests, live at
`doodle-voyager.vercel.app`).

Gev's request, verbatim: "Another thing I want to add is ads. Use the computer
for any AdMob tasks. There will be only two people, so place the ads on the
planet for a humorous effect... Implement a visual effect that warps the ads
into a circle. The ad should stay fixed to the planet, not follow the
player's movement, and look natural."

Bottom line up front: **there is no AdMob task to run on the computer.**
AdMob does not serve to plain websites at all, and Google's own web-ad
products cannot do what "an ad wrapped onto a planet" describes, for one
policy reason and one hard technical reason (below). What Gev actually wants
- funny signs on planets, for two players - is a straightforward content +
shader feature with no ad network involved. Part 2 specs that.

---

## Part 1 - the AdMob/AdSense facts, sourced

### 1.1 AdMob is a mobile-app SDK. It has no web product.

AdMob's own site frames it as "Grow your app business" with native SDKs for
Android, iOS, Unity and Flutter. There is no AdMob JavaScript/web SDK, and
Google's own community threads confirm it plainly: *"AdMob is strictly for
native apps, with no HTML SDK"* (Google AdSense Community thread,
[Can I use Admob for monetization in WebGL based Game?](https://support.google.com/adsense/thread/109306797/can-i-use-admob-for-monetization-in-webgl-based-game?hl=en)).
Doodle Voyager is a static site (`index.html` + ES modules, no Android/iOS
wrapper), so AdMob is categorically not applicable - not "needs setup," just
the wrong product for this codebase.

### 1.2 Google's actual web-game ad product: AdSense H5 Games Ads / the Ad Placement API

Source: [Get started with AdSense H5 Games Ads](https://support.google.com/adsense/answer/9959170) (Google AdSense Help),
[Ad Placement API sign-up](https://developers.google.com/ad-placement/docs/signup) (developers.google.com, fetched this session),
[Ad Placement API example](https://developers.google.com/ad-placement/docs/example) (fetched this session).

- It is a **beta program layered on an approved AdSense account** - the
  sign-up page states outright: *"you must have an approved AdSense account
  to show ads in your H5 games"* and *"Account approval is not guaranteed as
  it is subject to partner eligibility."* It is not self-serve the way
  dropping an AdMob app ID into a mobile build is.
- Two ad shapes only: `adBreak({ type: 'next' | 'reward' | ... })` for a
  **full-page interstitial** at a natural break (level end, restart), and
  `type: 'reward'` for a rewarded video/display ad. `adConfig()` just tells
  Google the game's sound/state. There is no inline, in-scene, or
  texture-shaped ad unit in this API - every documented example wraps the ad
  call in `beforeAd`/`afterAd` callbacks that pause the game and hide game UI
  for the duration, which only makes sense for a full-screen overlay.
- Google Ad Manager has a parallel **"gaming interstitial"** format for the
  same full-page-overlay idea, and it is explicitly **limited-access**: *"you
  can email h5support@google.com to gain access"* ([Display an H5 gaming
  interstitial ad](https://support.google.com/admanager/answer/14640119)).

None of that is "an ad texture on a 3D sphere." It is a pause screen.

### 1.3 A `*.vercel.app` subdomain cannot be approved for AdSense at all

This kills the "just turn ads on" reading of the request independent of
everything else. AdSense approves (or rejects) at the **parent-domain**
level: *"AdSense uses the status of the parent domain for each subdomain,"*
and since `vercel.app` is the parent domain, individual `*.vercel.app`
subdomains cannot be independently approved - confirmed by community reports
and summarized in [Why Google AdSense will not approve a *.vercel.app
site](https://dev.to/morinaga/why-google-adsense-will-not-approve-a-vercelapp-site-110b).
`doodle-voyager.vercel.app` (per `docs/HANDOFF.md`) is exactly this case.
Fix would be buying and pointing a custom domain at the Vercel deploy - a
real, separate, non-trivial step Gev hasn't asked for and this task does not
recommend doing just for two players' amusement.

### 1.4 Even ignoring eligibility, Google's policy forbids doing what was asked, and the browser forbids it too

**Policy.** Publisher policy prohibits altering the ad code/creative in ways
that would misrepresent it, and specifically bars re-wrapping Google ad code
in nested iframes without Google's own authorization: *"Google ads may not be
placed in an IFRAME"* except pre-approved exceptions ([Modifications of
AdSense ad code](https://support.google.com/adsense/answer/1354736),
via cited search snippets this session; the parent policy hub is [Google
Publisher Policies](https://support.google.com/publisherpolicies/answer/10502938)).
Warping a served creative onto a sphere is a content modification of exactly
the kind these policies exist to stop - it's not a grey area.

**Technical.** Even without the policy, it is not something the browser lets
a page do. A served ad renders inside a cross-origin `<iframe>` by design (to
keep the advertiser's creative isolated from the host page for exactly this
kind of tampering). WebGL enforces same-origin on anything it turns into a
texture; pulling cross-origin iframe pixels into a `<canvas>`/WebGL texture
is blocked by CORS taint checks, and no ad server publishes CORS headers for
creative iframes because that would defeat the isolation on purpose ([Using
CORS to load WebGL textures from cross-domain images](https://hacks.mozilla.org/2011/11/using-cors-to-load-webgl-textures-from-cross-domain-images/) -
Mozilla Hacks; [WebGL - Cross Origin
Images](https://webglfundamentals.org/webgl/lessons/webgl-cors-permission.html)).
So "read a real ad into a WebGL texture and bend it around a planet" isn't
just against policy, it structurally cannot be done with a standard served
ad.

### 1.5 The real industry term, and whether it fits this project

The thing Gev is describing - ads baked into the game world as billboards,
signs, posters - is a real ad category called **intrinsic in-game
advertising**, sold by specialist networks (Anzu, Frameplay, Admix/Bidstack,
Adverty, AdInMo), not by Google. *"Intrinsic ads are non-intrusive, in-game
advertisements seamlessly integrated into the gameplay environment - like
billboards, posters, or screens that naturally fit within the world"*
(search-aggregated industry description this session). These networks do
exist for web/WebGL: Anzu specifically announced web support in 2026 via a
partnership with Playgama, *"the initial rollout supports Unity (WebGL),
Cocos, and JavaScript"* ([Playgama and Anzu Bring Real-World Ads to Web
Games](https://www.anzu.io/news/playgama-and-anzu-bring-real-world-ads-to-web-games)).
That confirms the category is technically real, but it is a **publisher
business integration** - sign up, get approved, add an SDK that a real ad
network controls - not a drop-in a two-person hobby site can flip on, and
Anzu's own developer page gives no self-serve path or indie minimum
([anzu.io/developers](https://www.anzu.io/developers), fetched this session:
"the page does not specify... nor does it explain the rendering mechanics...
no self-serve integration"). There is nothing to configure on the computer
for this today, and doing so would be pointless for a game with two players
and no ad-supported business model.

### 1.6 Conclusion

- **AdMob**: not applicable, ever, to this project as it exists (web, not an app).
- **AdSense H5 Games Ads / Ad Placement API**: the real Google product for
  this shape of thing, but (a) needs AdSense approval Gev doesn't have, (b)
  `vercel.app` can't get that approval without a custom domain, (c) even
  approved, the only formats are full-page interstitial/rewarded overlays -
  never an in-scene decal - so it could not produce "an ad on the planet"
  regardless of approval.
- **Warping a real served ad onto a sphere**: against Google's publisher
  policy, and independently blocked by browser CORS/iframe isolation. Not a
  "modify the request" fix - it's disallowed by design on both sides.
- **Intrinsic in-game ad networks** (Anzu etc.): the correct industry answer
  to "ads on in-world billboards," now reaching WebGL web games, but a real
  advertiser-network partnership with no indie self-serve path found - not a
  today, two-player, no-business task.
- **So**: build the joke. Part 2 specs procedurally-drawn parody and house
  ads baked into the game's own art (no ad network, no approval, no
  external requests, no policy surface at all), which is exactly what Gev
  described wanting to see.

Sources (fetched or searched this session, Google primary sources marked *):
- *[AdMob home](https://admob.google.com/home/games/) / [Can I use Admob for monetization in WebGL based Game?](https://support.google.com/adsense/thread/109306797/can-i-use-admob-for-monetization-in-webgl-based-game?hl=en)
- *[Get started with AdSense H5 Games Ads](https://support.google.com/adsense/answer/9959170)
- *[Ad Placement API sign-up](https://developers.google.com/ad-placement/docs/signup)
- *[Ad Placement API example](https://developers.google.com/ad-placement/docs/example)
- *[Manage H5 Games Ads](https://support.google.com/admanager/answer/14637831) / [Display an H5 gaming interstitial ad](https://support.google.com/admanager/answer/14640119)
- *[Google Publisher Policies](https://support.google.com/publisherpolicies/answer/10502938) / [Modifications of AdSense ad code](https://support.google.com/adsense/answer/1354736)
- [Why Google AdSense will not approve a *.vercel.app site](https://dev.to/morinaga/why-google-adsense-will-not-approve-a-vercelapp-site-110b)
- [Using CORS to load WebGL textures from cross-domain images](https://hacks.mozilla.org/2011/11/using-cors-to-load-webgl-textures-from-cross-domain-images/)
- [Anzu x Playgama: real-world ads for web games](https://www.anzu.io/news/playgama-and-anzu-bring-real-world-ads-to-web-games) / [Anzu developers](https://www.anzu.io/developers) / [Frameplay](https://frameplay.com/)

---

## Part 2 - the feature: planet ad billboards

### 2.1 What it is

A small number of planets get a circular "sticker" decal baked onto their
surface: the game's own procedurally-drawn parody/house ads, doodle-style,
sitting in the planet's own local space so it turns with the planet and
never faces the camera. It uses the planet's existing lit, hatched material
- no new render pass, no extra draw call, no texture read-back, nothing
network-facing.

### 2.2 The ad copy (write these into the canvas art, verbatim)

15 short copies: 3 house ads (Gev's real products, as in-universe cross-promo
posters) + 12 parody ads (fit the doodle-universe, no real third-party
brands, per Gev's instruction). Two-line format: a bold headline line and a
small punch-line, matching the handwritten-sign look `labelTexture` already
uses elsewhere (`js/mats.js:60-71`).

House ads:
1. **RIDELINK** / "Find your pack. Motorcycles only - planets sold separately."
2. **FITCHECK** / "Rate this fit: 6/10, would suffocate in style."
3. **GEV CLIENT** / "See through blocks, not the hull breach. No injection. Mostly."

Parody ads (doodle-universe, fictional brands only):
4. **ION JUICE** / "Now 30% fewer explosions."
5. **PLASMA-MART** / "Fill 'er up. Pilot's optional."
6. **TANK FARM DEUTERIUM** / "Premium fuel, budget prices, questionable math."
7. **JOIN THE RED FLEET** / "Horns provided. Dental not."
8. **BE EVIL, BE EMPLOYED** / "Inquire at any dreadnought."
9. **HULL-SURE INSURANCE** / "We cover breach, blast, and bad parking."
10. **GALACTIC MUTUAL** / "Crash? What crash?"
11. **TOW-4-U** / "Out of fuel? We'll drag you home. Slowly."
12. **UPGRADE YOUR HULL** / "Your ex will be so mad."
13. **HOLD MUSIC UNLIMITED** / "10,000 hours, zero skips. (Lies.)"
14. **SPACE SNACKS** / "Now with 40% less vacuum."
15. **WARP-IN-60** / "Or your money back. (No refunds.)"

Colour cue per ad (drawn in the texture, not the shader): fuel/tow/insurance
ads use `PAL.yellow`/`PAL.orange` on `PAL.dark` (looks like a roadside sign);
the two red-fleet recruitment ads use `PAL.red` on `PAL.paper` (matches
enemy-ink colouring already used for red evil guys, `js/mats.js:28-32`); the
three house ads use `PAL.blue`/`PAL.teal` on `PAL.paper` (matches player-ink
colouring) so they read as "friendly."

### 2.3 Which planets carry ads

Keep it rare - sparse is what makes it funny for two players, not a banner
farm. New pure function in `js/universe.js`, called once inside
`planetsOf(sys)` right before `sys.planets = out; return out;`
(`js/universe.js:564-565`), after `out` is fully built:

```js
// js/universe.js, new function near planetsOf
const AD_COPY = [ /* the 15 {title, sub, kind} objects above, in order */ ];

function assignAds(sys, out) {
  if (sys.solar) {
    // famous planets, always the same two, never more
    for (const p of out) {
      if (p.name === 'Mars') p.ad = 6;       // "JOIN THE RED FLEET" - it's Mars, obviously
      if (p.name === 'Jupiter') p.ad = 0;    // "RIDELINK" - biggest sign on the biggest planet
    }
    return;
  }
  if (!sys.station || out.length === 0) return;         // only systems with a station roll at all
  const r = rng(sys.seed ^ 0xad00);
  if (r() > 0.35) return;                                 // 35% of station systems get one ad
  // nearest planet to the station's orbit radius, so the sign reads as
  // "that station's billboard", not a random planet across the system
  const stR = Math.hypot(sys.station.pos.x - sys.pos.x, sys.station.pos.y - sys.pos.y, sys.station.pos.z - sys.pos.z);
  let best = out[0], bestD = Infinity;
  for (const p of out) { const d = Math.abs(p.orbit - stR); if (d < bestD) { bestD = d; best = p; } }
  best.ad = Math.floor(r() * AD_COPY.length);
}
```

Call site: `assignAds(sys, out);` right before `sys.planets = out;` (three
places in `planetsOf` all funnel through that one final line, so one call
covers Solar, exoplanet-host, and procedural systems alike). Deterministic:
`sys.seed` is stable for a given system across reloads (same pattern already
used for `rng(sys.seed ^ 0x51ed)` at `js/universe.js:522`), so a system's ad
planet never flickers between visits or page loads.

Expected density: with ~400+ systems carrying a station in the shipped
catalogues (`docs/CATALOG-*.md`) and a 0.35 roll, on the order of 140
ad-planets total across the whole seeded+catalogued universe, plus the fixed
Mars/Jupiter - i.e. a handful of signs you might actually fly past, not a
theme park.

### 2.4 Ad textures: draw once, reuse everywhere

Ad art is identical content reused on every planet that rolls the same
`ad` index - draw each of the 15 textures **once**, cache by index, never
regenerate. New function in `js/universe.js` next to `planetTexture`
(`js/universe.js:93-131`):

```js
const adTexCache = new Map();  // module-level, never disposed with a SystemView
function adTexture(i) {
  let t = adTexCache.get(i);
  if (t) return t;
  const a = AD_COPY[i];
  const W = 256, H = 256;               // square: the shader projects it onto a circular cap
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = hex(col(a.bg)); g.fillRect(0, 0, W, H);
  // neon edge: a soft-blurred ring just inside the square, brighter than the fill
  g.save(); g.filter = 'blur(6px)';
  g.strokeStyle = hex(col(a.edge)); g.lineWidth = 14;
  g.strokeRect(10, 10, W - 20, H - 20);
  g.restore();
  g.strokeStyle = hex(col(a.edge)); g.lineWidth = 4;
  g.strokeRect(14, 14, W - 28, H - 28);
  // a faint scanline/wear texture so it doesn't read as a flat UI sticker
  g.globalAlpha = 0.06;
  for (let y = 0; y < H; y += 4) { g.fillStyle = '#000'; g.fillRect(0, y, W, 1); }
  g.globalAlpha = 1;
  g.fillStyle = hex(col(a.fg)); g.textAlign = 'center';
  g.font = `bold 34px "Patrick Hand", "Segoe Print", cursive`;
  wrapText(g, a.title, W / 2, H * 0.42, W - 40, 36);
  g.font = `20px "Patrick Hand", "Segoe Print", cursive`;
  wrapText(g, a.sub, W / 2, H * 0.68, W - 50, 24);
  const t2 = new THREE.CanvasTexture(c);
  t2.colorSpace = THREE.SRGBColorSpace;
  adTexCache.set(i, t2);
  return t2;
}
```

(`wrapText` is a small new helper: greedy word-wrap onto centred lines - same
job `g.fillText` calls elsewhere do for one-liners, just wrapped for two
lines of copy. `hex`/`col` already exist at `js/universe.js:16,99`.)

**Correctness gotcha - do not let `SystemView.dispose()` eat these.**
`SystemView.dispose()` disposes everything in `this.textures`
(`js/universe.js:284-289`), which is rebuilt every time you leave and
re-enter a system. `adTexture()`'s cache must **not** be pushed into a
`SystemView`'s `this.textures` array - it is a permanent, module-level pool
(15 small textures total, ~1.5 MB of canvas memory, held for the life of the
page). Skipping this note is the single easiest way to ship a bug: fly away
from an ad planet, fly back, texture is disposed-but-still-bound and renders
black.

Size: 256x256 RGBA CanvasTexture, no mipmaps needed (`generateMipmaps =
false`, `minFilter = THREE.LinearFilter`) since these are always seen at
planet-approach distance, never tiny/far - saves the mip chain and matches
the flat, ink-hatched look of everything else. 15 textures x 256x256x4 bytes
= ~3.9 MB uncompressed GPU memory total, all of it created lazily (only the
indices actually rolled by `assignAds` ever get drawn).

### 2.5 The decal shader: sticker on a sphere, fixed to the planet

**Where it plugs in.** `SystemView`'s planet loop (`js/universe.js:220-226`)
currently picks a material per planet:

```js
for (const p of u.planetsOf(sys)) {
  let mat;
  if (p.tex) { const t = planetTexture(p.tex, hash(p.name), p.color); this.textures.push(t); mat = texMat(t); this.mats.push(mat); }
  else mat = ink(p.color);
  const m = new THREE.Mesh(SPHERE, mat);
```

Change: when `p.ad != null`, skip both `texMat()` and the cached `ink()` and
build a dedicated, **never-cached** material instead:

```js
for (const p of u.planetsOf(sys)) {
  let mat;
  if (p.ad != null) {
    mat = adPlanetMat(p);                        // new, below - always a fresh instance
    this.mats.push(mat);
  } else if (p.tex) {
    const t = planetTexture(p.tex, hash(p.name), p.color); this.textures.push(t); mat = texMat(t); this.mats.push(mat);
  } else mat = ink(p.color);
  const m = new THREE.Mesh(SPHERE, mat);
```

**Why it must never be the cached `ink(color)`.** `js/mats.js:14-19` caches
materials by colour key so every planet sharing a colour hex shares one
`THREE.Material` instance. An ad decal's placement/texture live in that
material's uniforms - if two same-coloured planets shared the cached
material, giving Mars a decal would silently paint the same decal onto every
other planet using that exact colour hex anywhere in the universe. `p.tex`
planets are already safe (`texMat` makes a fresh instance every call,
`js/universe.js:133-135`), but a same-colour `ink()` planet is not - hence
the dedicated `adPlanetMat` path for every `p.ad != null` planet regardless
of whether it also has `p.tex`.

**Tangent frame (JS side, computed once per ad planet at build time, not
per frame).** The sphere geometry (`SPHERE = new
THREE.IcosahedronGeometry(1, 3)`, `js/universe.js:18`) has every vertex
already on the unit sphere, so on this geometry **object-space `position`
equals the outward normal** - no separate normal lookup needed in the
shader. Pick a decal centre direction and an orthonormal tangent pair,
seeded so it's stable for that planet:

```js
function tangentFrame(dir) {
  const up = Math.abs(dir.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(up, dir).normalize();
  const v = new THREE.Vector3().crossVectors(dir, u).normalize();
  return { u, v };
}
function adPlanetMat(p) {
  const r = rng(hash(p.name, 'ad'));
  const dir = new THREE.Vector3(gauss(r), gauss(r), gauss(r)).normalize();  // gauss() already in util.js
  const { u, v } = tangentFrame(dir);
  const halfAngleDeg = 22;                          // cap size: tune 15-28, see 2.6
  const base = p.tex ? planetTexture(p.tex, hash(p.name), p.color) : null;
  const mat = new THREE.MeshLambertMaterial({
    color: p.color, map: base, flatShading: true, blending: THREE.NoBlending, opacity: ID.INK,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDecalDir = { value: dir };
    sh.uniforms.uDecalU = { value: u };
    sh.uniforms.uDecalV = { value: v };
    sh.uniforms.uDecalCos = { value: Math.cos(THREE.MathUtils.degToRad(halfAngleDeg)) };
    sh.uniforms.uDecalCosOuter = { value: Math.cos(THREE.MathUtils.degToRad(halfAngleDeg + 4)) };
    sh.uniforms.uDecalMap = { value: adTexture(p.ad) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDecalPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDecalPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vDecalPos;
uniform vec3 uDecalDir, uDecalU, uDecalV;
uniform float uDecalCos, uDecalCosOuter;
uniform sampler2D uDecalMap;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 dp = normalize(vDecalPos);
  float cosA = dot(dp, uDecalDir);
  if (cosA > uDecalCosOuter) {
    float capR = sqrt(max(1e-4, 1.0 - uDecalCos * uDecalCos));
    vec2 duv = vec2(dot(dp, uDecalU), dot(dp, uDecalV)) / capR * 0.5 + 0.5;
    vec4 dcol = texture2D(uDecalMap, clamp(duv, 0.0, 1.0));
    float edge = smoothstep(uDecalCosOuter, uDecalCos, cosA);
    diffuseColor.rgb = mix(diffuseColor.rgb, dcol.rgb, edge);
  }
}`);
  };
  return mat;
}
```

**Why this satisfies every one of Gev's constraints, mechanically:**

- *"Warps the ad into a circle"*: `duv` is a gnomonic (tangent-plane)
  projection of the sphere direction onto the cap's local 2D frame, scaled
  so the cap's edge (`cosA == uDecalCos`) lands exactly on the texture's
  unit circle - the square 256x256 texture gets projected onto a circular
  region of the sphere, i.e. exactly "warped into a circle," with the
  smoothstep between `uDecalCosOuter` and `uDecalCos` feathering the last 4
  degrees so the circle edge is soft, not a hard cutout.
- *"Stays fixed to the planet, not the player's movement"*: `uDecalDir/U/V`
  are **object-space** constants set once at material build time. The only
  thing that ever moves this decal in the world is the planet mesh's own
  `modelMatrix` - which the existing per-frame update already drives via
  `b.mesh.rotation.y = t * 0.02` (`js/universe.js:265`) and the `squash()`
  position/scale (`js/universe.js:263-264`). The camera transform never
  enters this shader at all (no `viewMatrix`/`cameraPosition` term anywhere
  in the decal code), so panning or moving the ship cannot move the decal
  relative to the planet - it can only ever look different because the
  planet itself rotated or got closer.
- *"Look natural"* / lit like the rest of the planet: the injection point is
  `#include <map_fragment>`, which runs **before** `<lights_lambert_fragment>`
  in the standard Lambert chunk order. We only touch `diffuseColor.rgb` (the
  albedo), so the existing per-vertex Lambert lighting (`vLightFront`,
  computed from the scene's `hemi`/`sun` lights exactly as for the rest of
  the planet, `js/game.js:121-124`) applies to the decal automatically - no
  separate N.L computation needed, and the "fading at the terminator" Gev
  asked for falls out of the engine's existing lighting for free. The
  hatching/ink treatment in the post pass (`POST_FS`'s `id0 > 0.7` branch,
  `js/render.js:120-132`) then runs on the lit result exactly as it does for
  the rest of the planet's surface, so the ad gets the same blue-ink
  hatching in shadow as everything else - it reads as *drawn on the planet*,
  not pasted over it.
- *"Soft neon edge glow"* and *"slight wear/scanline"*: both are baked into
  the 256x256 canvas texture itself (`adTexture()`, 2.4) rather than done in
  the shader - a blurred bright stroke plus a thin sharp stroke for the
  glow, and 6%-alpha horizontal lines for scanline wear. This keeps the
  shader itself tiny (one branch, one texture sample) and lets the existing
  colour-edge detector in the post pass (`eCol`, `js/render.js:83-84`) draw
  a free blue ink outline around the decal's bright edge, the same way it
  outlines every other high-contrast surface in the game - no extra ID
  channel or edge logic needed.

### 2.6 Numbers table

| Quantity | Value | Why |
|---|---|---|
| Ad texture size | 256x256 RGBA | Matches `planetTexture`'s 256px scale (`js/universe.js:94`); plenty at approach distance, avoids mip chain cost |
| Ad texture count | 15 (drawn once, cached forever) | 3 house + 12 parody copies in 2.2 |
| Cap half-angle | 22 deg (core), 26 deg (outer/feather) | Big enough to read as a sign from orbit, small enough that gnomonic projection distortion stays under ~10% (distortion grows roughly with tan(angle), negligible below ~30 deg) |
| Feather width | 4 deg | One `smoothstep`, soft sticker edge, cheap |
| Station-system ad chance | 35% (`r() > 0.35` skip) | "A fraction," not most - keeps it rare/funny |
| Forced ad planets | Mars (#6, red-fleet), Jupiter (#0, RideLink) | Gev's named examples |
| Expected total ad planets | ~140 across catalogued+seeded universe + 2 fixed | Sparse relative to the full planet count (`counts.planets > 1000` per `tools/test.mjs:43`) |
| Extra draw calls per ad planet | 0 | Same single `Mesh(SPHERE, mat)` every planet already gets; only the material differs |
| Extra materials | 1 per ad planet (never cached, never shared) | Required so decal uniforms don't leak across planets (2.5) |
| Extra textures resident | <=15, ~3.9 MB GPU memory total | Shared across every planet rolling that index; never regenerated |
| Per-frame JS cost | 0 | All decal uniforms are static after material build; only the pre-existing `rotation.y` tick and `squash()` call move the planet |
| Shader cost per ad-planet fragment | 1 dot product + branch + 1 texture sample (only inside the cap) | Negligible next to the existing hatching math already run on every lit fragment |

Chromebook/integrated-GPU budget from the task brief (draw calls under
~250, no per-frame allocations): this feature adds **zero** draw calls and
**zero** per-frame allocations - it only swaps which pre-existing material a
handful of already-drawn planet meshes use, and moves nothing new through JS
each frame. It is effectively free against that budget.

### 2.7 What to change, file by file

- `js/universe.js`:
  - Add `AD_COPY` (15 entries: `{title, sub, bg, fg, edge}`), `wrapText()`,
    `adTexture()`, `adTexCache` (module scope, near `planetTexture` /
    `texMat`, `js/universe.js:93-135`).
  - Add `assignAds(sys, out)` and `tangentFrame(dir)`; call `assignAds` at
    the end of `planetsOf()` (`js/universe.js:564`, all three branches
    funnel through the same `sys.planets = out;` line).
  - Add `adPlanetMat(p)` next to `texMat`/`ringMat` (`js/universe.js:133-138`).
  - Change the planet-material branch in `SystemView`'s constructor
    (`js/universe.js:220-226`) to check `p.ad != null` first, per 2.5.
  - Import `gauss` from `js/util.js` if not already imported (check the
    existing import list at `js/universe.js:10-13` - `gauss` is already used
    elsewhere in this file per the `shapePoints` function, `js/universe.js:170`
    etc., so it should already be in scope; confirm before adding a duplicate
    import).
- `js/mats.js`: no change needed - `ID`, `PAL`, `hex`-equivalent helpers are
  reused via existing imports; deliberately did not add a new exported
  helper there so the cached-vs-uncached distinction (2.5) stays obvious at
  the call site in `universe.js` rather than hidden behind a `mats.js` export
  that looks like the other cached ones.
- `js/render.js`: **no change.** The decal never touches `POST_FS` or the
  material-ID scheme - it rides entirely on the existing `ID.INK` Lambert
  path.
- No changes to `js/game.js`, `js/ui.js`, `js/ships.js`, `js/actors.js`,
  `js/audio.js`, `js/media.js`, or any data file.

### 2.8 Headless checks to add to `tools/test.mjs`

Pattern from the existing file (`window.__dv` as `g`, `g.u.views` is the
`Map<sysId, SystemView>` populated at `js/universe.js:933`). Two checks,
both possible without any new debug API - everything needed is already
reachable from `g`:

**Check A - decal follows the planet's own rotation, not the camera.**

```js
const adCheck = await E(`
  const sv = [...g.u.views.values()].find(v => v.sys.solar);
  if (!sv) return { ok: false, why: 'home system not loaded' };
  const mars = sv.bodies.find(b => b.planet && b.planet.name === 'Mars');
  if (!mars || mars.planet.ad == null) return { ok: false, why: 'Mars has no ad' };
  const dirLocal = mars.mesh.material.userData.decalDir || null; // stash uDecalDir.value on the mat in adPlanetMat for this check
  const worldA = dirLocal.clone().transformDirection(mars.mesh.matrixWorld);
  // move only the camera - rotate the ship's view, no time step
  g.mouse.dx = 400; g.mouse.dy = 0;
  await new Promise(r => setTimeout(r, 50));
  const worldB = dirLocal.clone().transformDirection(mars.mesh.matrixWorld);
  const camOnlyDelta = worldA.distanceTo(worldB);
  // now advance sim time so the planet actually spins
  g.steps = 400; await new Promise(r => setTimeout(r, 800)); g.steps = 1;
  const worldC = dirLocal.clone().transformDirection(mars.mesh.matrixWorld);
  const rotateDelta = worldA.distanceTo(worldC);
  return { ok: camOnlyDelta < 1e-4 && rotateDelta > 0.01, camOnlyDelta, rotateDelta };
`);
check('planet ad decal ignores camera, follows planet rotation', adCheck.ok, JSON.stringify(adCheck));
```

(`adPlanetMat` should stash `mat.userData.decalDir = dir;` alongside setting
the uniform, purely so tests can read the same vector back without reaching
into `mat.userData.shader.uniforms` - three.js only populates that after the
first compiled frame, which is an unnecessary race to depend on in a test.)

**Check B - Mars and Jupiter always carry an ad; console stays clean.**

```js
const fixed = await E(`
  const sv = [...g.u.views.values()].find(v => v.sys.solar);
  const mars = sv.sys.planets.find(p => p.name === 'Mars');
  const jup = sv.sys.planets.find(p => p.name === 'Jupiter');
  return { mars: mars && mars.ad, jup: jup && jup.ad };
`);
check('Mars and Jupiter carry their fixed ads', fixed.mars === 6 && fixed.jup === 0, JSON.stringify(fixed));
```

Both slot in near the existing Solar-system checks in `tools/test.mjs`
(around the `counts.planets` check at line 43, since that's already where
the home system is guaranteed loaded) and rely only on the console-error
trap the file already installs, so a shader compile error fails the run the
same way any other console error does - no new plumbing needed.

### 2.9 Manual/visual check (do this before calling it done)

1. `node tools/stage.mjs` then serve `dist/` locally (`docs/PLAN.md` section
   4) - or use the already-running local server per `docs/HANDOFF.md`
   (`http://127.0.0.1:5178/`).
2. Fly to Mars or Jupiter in Sol (both always carry an ad, 2.3) and confirm
   from orbit distance:
   - the sign reads as a circular sticker on the sphere, not a stretched
     texture wrap;
   - it stays put on the surface as you fly around the planet (does not
     turn to face the ship);
   - over a few seconds it visibly rotates with the tiny planet spin
     (`rotation.y = t * 0.02`, slow but visible if you sit still and watch);
   - the far side/limb of the decal darkens toward black the way the rest of
     the lit hemisphere does, and it's simply absent on the planet's night
     side.
3. Screenshot at all three required widths (`tools/cdp.mjs` `shot`, or the
   game's own photo-mode `snapshot()` per `js/render.js:299-300`) - 1366x768,
   1280x720, 1920x1080, per the task's keyboard+mouse rule (never phone
   widths) - and visually sweep for overlap/clipping with the HUD.
4. Visit two or three station systems until one rolls an ad planet (35%
   chance per system per 2.3) and confirm a **different** ad copy shows up
   than Mars/Jupiter's, and that leaving and re-entering that system doesn't
   blacken or regenerate the texture (the disposal gotcha in 2.4).
5. Re-run `node tools/test.mjs` end to end and confirm the baseline stays at
   least 40/41 (the pre-existing "autopilot closes on Mars" failure is
   unrelated and not this task's to fix) plus both new checks passing.

### 2.10 Non-goals / explicitly out of scope

- No real ad network, no AdMob, no AdSense, no Ad Manager, no Anzu/Frameplay
  integration - Part 1 already settles why none of these apply or are worth
  pursuing for a two-player hobby project.
- No click-through, no impression tracking, no analytics - these are static
  in-world set dressing, not monetized inventory.
- No touch/mobile layout considerations - keyboard+mouse only, per the
  project's own test-width rule.
- Not wired into gameplay (no reward, no unlock) - purely visual, as asked.
