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
- Shots between players, owner-authoritative. PvP is off until you turn it on
  (Shift O, or the settings panel), and only two people who both turned it on
  can hurt each other; for everybody else a bolt passes through. The shooter
  sends a hit report and takes nothing off anybody (the crosshair flashes);
  the victim's own client checks the report - shooter live in the last 1.5 s,
  same room, within a bolt's reach (9240 u plus the distance either ship could
  have moved) of where the shooter last said it was, no faster than a gun
  fires, no harder than the hardest bolt in the game, not your own, not
  malformed - and only then hurts itself and tells the room its new hull.
  The rules are plain data in `js/pvp.js` and are checked in node by
  `tools/pvp-checks.mjs`; each check was run with its rule taken out and
  failed. What this cannot stop is a client that lies about where it is or
  borrows another peer's id: the room has no signatures.
- Names above the ghosts, on a sprite that stays one size on screen and fades
  out between 2000 and 16000 u. Ghosts are now drawn relative to your own ship
  with the same far-field squash as the enemies; before this they were placed
  at their galaxy coordinates in a scene centred on you.
- Rooms per star system (per galaxy between systems). Crossing into another
  system leaves the old room, forgets everybody in it and joins the new one,
  once you have been there a second, so skimming the edge between two does not
  churn. A report from another room that arrives anyway is not drawn. The zone
  a report carried is the enemy zone, empty almost everywhere, so the room is
  keyed on the system instead.
- The three above added 30 checks (17 rule checks in node, 13 in the browser
  driving the game's own Net and a second peer through a fake room); the
  suite is 224 checks.

## Next, in order

1. **`docs/specs/shaders-2.md`.** The second shader pass is specified and not
   implemented: the ink-bleed edge, the cel-banded starlight and the interior
   bounce.
2. **PBR textures and Blender assets.** Blender 5.2 is installed; the reference
   corpus is in `docs/refs/`. The hulls are procedural and would take a baked
   normal and roughness pass well.
3. **AdMob on mobile.** The planet ads are in-world art. A real ad unit is a
   mobile-shell decision and needs an account step that cannot be scripted from
   here.
4. **A pass on the 224 checks for vacuity.** One check was found this week that
   measured a shield absorbing the damage it thought it was measuring on the
   hull, and another that sampled a tutorial step before any frame had run.
   Both were the check's fault, not the game's. There are probably more: the
   old "autopilot closes on Mars" passed on any one-unit drop in distance, and
   passed on runs where the ship never got there. It now flies the whole leg.
   "and the body it is drawn as follows the ghost" passed while every ghost
   was drawn at its galaxy coordinates in a scene centred on you, because it
   compared the mesh with the same wrong number; it now checks the position
   relative to you. "walking moves you inside the ship" is the next suspect:
   it walks for 900 ms of wall clock, which under software GL can be one frame
   or two, and one frame is not enough to pass.

## How to run it

```
node tools/serve.mjs          # or any static server on the repo root
node tools/test.mjs           # the whole suite, headless
node tools/pvp-checks.mjs     # just the PvP hit rules, in node, no browser
node tools/test.mjs --shots   # and write comparison screenshots
```

Where cdn.jsdelivr.net is blocked, `THREE_DIR=<an unpacked three@0.170.0 npm
package>` makes the suite serve three from disk; `CHROME_FLAGS` adds browser
switches (`--no-sandbox` when running as root in a container).

There is no build step and no bundler. `three` comes in through an import map,
so a file you edit is the file the browser runs.
