# Doodle Voyager

A neon-ink space sim that runs in a browser tab with no build step. You sit in
the seat of a hull drawn in pen, fly it out of Sol on a fuel budget that never
stops being annoying, and find out what is left of a galaxy somebody has been
erasing.

It is a sequel in spirit to **Doodle Shooter**, and it keeps that game's canon:
the same three things at the top of the food chain, the same word for what
happens when you die.

**Play it:** https://doodle-voyager.vercel.app

## What it is

- **15 hulls**, one hue each with value variations, one ability each on `R`,
  from a Correction Tape that blinks to a three-deck Filing Cabinet with a lift.
- **A whole sky.** Every galaxy is as busy as the Milky Way, clusters between
  them, stations that only serve one fuel type, and adverts warped onto the
  spherical caps of planet faces so they turn with the planet.
- **Gravity that means it.** Moons, planets, stars and black holes pull as the
  inverse square of the distance from their surface. A black hole's event
  horizon sits at 2.2 radii and nothing gets out of it.
- **You can leave the seat.** Eject through the top or bottom hatch, walk the
  decks, carry things, take the lift, go EVA, fly the drone, launch the escape
  pod, cut into an enemy hull and fly their ship instead.
- **They fly in wings.** Red Margin squadrons hold six formations with one
  shared state, tiers 1 to 5, capital ships whose turret arcs come from where
  the turrets actually are, and carriers that launch fighters from the hangar
  you can see in the belly and take them back.
- **Eight bosses**, a codex, an announcer whose recordings are always slightly
  wrong about you, and an intro crawl at the start of every new game.
- **Multiplayer** on `O`: a Supabase Realtime room where the other ships really
  are other people.
- **A tutorial** that advances off real state - a real seat, a real throttle, a
  real course on the autopilot - and a pad layout for PS5 and Xbox.

## Running it

No bundler, no install step, no `node_modules`. `three` arrives through an
import map, so the file you edit is the file the browser runs.

```
git clone https://github.com/ridelink0/doodle-voyager
cd doodle-voyager
node tools/serve.mjs            # http://127.0.0.1:5178/
```

Any static server over the repo root works just as well.

## The tests

The suite drives the real game in a headless browser and asks it real
questions - does a drifting ship fall towards Earth, does a star's pull stop
short of its own planets' orbits, does a boosted Filing Cabinet lose to a star
at 1.2 radii, does a wing arrive as a wing.

```
node tools/test.mjs            # 182 checks, headless
node tools/test.mjs --shots    # and write comparison screenshots
```

A check here is meant to fail for one reason only. Two were found this week that
passed while proving nothing - one measured hull damage a shield had already
absorbed, one read a tutorial step before a single frame had run - and both were
the check's fault rather than the game's. If you find another, that is a real
bug report.

`TODO.md` is the running list of what is built and what is next, and nothing
moves to built there without a check behind it.

## Layout

```
index.html        the page, and the import map
js/game.js        the loop: modes, flight, gravity, combat, docking
js/ships.js       15 hulls, inside and out, procedural
js/universe.js    galaxies, systems, stations, planet faces
js/actors.js      red guys, squadrons, capitals, carriers, the drone
js/bosses.js      the eight
js/board.js       breaching, boarding, the escape pod, hijacking
js/net.js         the shared sky
js/render.js      composite, camera-reprojection motion blur, bloom
js/mats.js        the neon-ink palette and the hatching
js/tutorial.js    steps that read real state
js/pad.js         gamepads
tools/test.mjs    the suite
docs/STORY.md     the backstory, and where it comes from
```

## Credits

Made by **Gev**, built with **Claude Opus 5.5** (Anthropic) doing the
engineering: the hulls, the loop, the gravity, the squadron states, the renderer
and every one of the 182 checks were written in that collaboration.

Standing on **Doodle Shooter**, whose canon this keeps.

## Licence

MIT. See `LICENSE`.
