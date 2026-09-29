# Doodle Voyager - what is built, and what is next

A running list, kept honest: something only moves to **Built** when a check in
`tools/test.mjs` proves it, and the count of those checks is printed by
`node tools/test.mjs`.

## Built

**The look**
- Neon-city ink: one hue per hull with value variations, pen hatching in the
  mid-tones only, fresnel rim, bloom without the double-gamma bug.
- Real camera-reprojection motion blur: nine dithered taps between the
  composite and the bloom, off on the low preset, cut on a mode change.
- Look sensitivity to 500 per cent, with A and D roll scaled by it.
- Flight-deck screens on raised decks rather than stuck to walls, chamfered
  hull ribs, dark shop cards you can actually read.

**Flying**
- 15 hulls including the tall Filing Cabinet with three decks and a lift, one
  ability per hull on R, and paint per hull.
- Arcade gravity for moons, planets, stars and black holes, with an event
  horizon at 2.2 radii that spaghettifies and kills. The star was retuned so a
  planet's pull wins near its own orbit, which is what makes orbiting possible.
- Autopilot legs, cruise, warp, fuel that stays annoying, and a tow from the
  pause menu when you strand yourself.
- A destination in two clicks: the marker on the map, then set course. With
  nothing picked the HUD says "no destination, M map"; with something picked
  and nobody flying, it says T flies there.
- The autopilot flies whole legs to things that move. It aims where the
  target will be rather than where it is, so a hull slower than a planet meets
  it head on further round the orbit; it goes round a star, planet or moon on
  the line instead of through its well; and it slows down relative to the
  target, not to the star. The W/S hint says tap or hold.
- Air that only drains once the hull is damaged, and lasts longer on a big ship.

**On foot and off it**
- Seat eject with a top and a bottom hatch, doors that open as you approach,
  props you can pick up and carry between decks, a lift that leaves the flight
  controls alone.
- EVA, the drone, an escape pod, boarding an enemy hull through a breach, and
  flying a ship you took - the HUD reports whose ship you are in.

**The other side**
- Red Margin squadrons in six formations with one shared state, so a wing
  arrives as a wing and only scatters into the loose orbit for the attack run.
- Tiers 1 to 5, capital ships whose turret arcs come from where the turrets
  actually sit, and carriers that launch pairs from the modelled belly hangar
  and recover them.
- Eight bosses: The Doodler, The Eraser, The Inkblot and the five that hold the
  clusters.

**The world and the story**
- Every galaxy as busy as the Milky Way, clusters, and ads warped onto the
  spherical cap of a planet's face so they turn with it.
- The intro crawl on every new game, a codex that survives a save and a reload,
  the announcer, and the credits.
- A tutorial that advances off real state - a real seat, a real throttle, a real
  course on the autopilot, real red guys dead - and can be skipped.
- PS5 and Xbox pads through the Gamepad API with radial deadzones and rumble.

**Multiplayer**
- A Supabase Realtime room on `O`. Your ship is the only thing you are
  authoritative over; a peer is a ghost drawn from its last report, chased
  rather than snapped, forgotten after six seconds of silence, and dropped at
  once when it says goodbye. Malformed reports and your own are ignored.

## Next, in order

1. **Shots between players.** Right now peers can see each other and cannot
   hurt each other. Doing it properly means an owner-authoritative hit report
   plus a damage message, not trusting a peer's claim to have hit you.
2. **Names above the ghosts.** The peer's name is carried in every report and is
   not drawn yet; it wants a sprite label that fades with distance.
3. **Rooms per system.** One room holds everybody in the universe today. The
   report already carries the zone, so splitting the channel by system is small
   and cuts the traffic to what you can see.
4. **`docs/specs/shaders-2.md`.** The second shader pass is specified and not
   implemented: the ink-bleed edge, the cel-banded starlight and the interior
   bounce.
5. **PBR textures and Blender assets.** Blender 5.2 is installed; the reference
   corpus is in `docs/refs/`. The hulls are procedural and would take a baked
   normal and roughness pass well.
6. **AdMob on mobile.** The planet ads are in-world art. A real ad unit is a
   mobile-shell decision and needs an account step that cannot be scripted from
   here.
7. **A pass on the 194 checks for vacuity.** One check was found this week that
   measured a shield absorbing the damage it thought it was measuring on the
   hull, and another that sampled a tutorial step before any frame had run.
   Both were the check's fault, not the game's. There are probably more: the
   old "autopilot closes on Mars" passed on any one-unit drop in distance, and
   passed on runs where the ship never got there. It now flies the whole leg.
   "walking moves you inside the ship" is the next suspect: it walks for 900 ms
   of wall clock, which under software GL can be one frame or two, and one
   frame is not enough to pass.

## How to run it

```
node tools/serve.mjs          # or any static server on the repo root
node tools/test.mjs           # the whole suite, headless
node tools/test.mjs --shots   # and write comparison screenshots
```

Where cdn.jsdelivr.net is blocked, `THREE_DIR=<an unpacked three@0.170.0 npm
package>` makes the suite serve three from disk; `CHROME_FLAGS` adds browser
switches (`--no-sandbox` when running as root in a container).

There is no build step and no bundler. `three` comes in through an import map,
so a file you edit is the file the browser runs.
