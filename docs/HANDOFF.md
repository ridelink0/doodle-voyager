# Doodle Voyager - handoff (2026-09-23)

For the next Claude session picking this up for Gev. Project root: D:/doodle-voyager.
Read docs/PLAN.md first (architecture and module contracts), then docs/TODO.md.

## State

- Game: static ES modules, three.js 0.170.0 from jsDelivr, no build step.
  js/game.js (loop, modes, flight, combat), js/universe.js (catalogues, systems,
  zones, stations), js/render.js (doodle post pass), js/ui.js (HUD, map, shops),
  js/ships.js, js/actors.js, js/audio.js, js/media.js, js/mats.js, js/util.js.
- Data: data/*.json built by tools/build-data.mjs (NASA exoplanets, OpenNGC,
  HYG stars, Wikipedia Local Group). Rebuild with: node tools/build-data.mjs
- Tests: node tools/test.mjs (headless Chrome over CDP, 194 checks as of
  2026-09-28). Behind a proxy that blocks jsDelivr, set THREE_DIR to an
  unpacked three@0.170.0 package; as root in a container, CHROME_FLAGS=--no-sandbox.
- Local deploy: http://127.0.0.1:5178/ serving dist/ (node tools/stage.mjs
  rebuilds dist). Started at logon by the Startup-folder launcher
  DoodleVoyager-Server.vbs. Daily monitor: scheduled task "DoodleVoyager
  Monitor" 09:00, node tools/monitor.mjs, log in docs/monitor-log.md.

## Changes on 2026-09-23 (diff: docs/release-2026-09-23.diff)

Gev's report: enemies too strong and unhittable, lasers seemed to do nothing,
the mouse only turned the ship left-right, and the far end of the map was
900 hours away.

- Combat: capital HP 1400/1900 -> 700/950, turret HP 70 -> 40, hull hits now
  full damage (were 60%), bolt speed 3200 -> 4200, imp hit radius +10 m,
  aim assist (an enemy within 6 degrees of the crosshair pulls the bolts),
  enemy fire slower, weaker and less accurate, beam 48 -> 28 per second with
  a 3 s telegraph, fewer imps per tier.
- Controls: the mouse turns the ship directly on both axes (the old pending
  buffer is gone); W/S taps move the throttle a quarter, holding ramps it.
- Map size: far distances compressed in util.js pcToU; cruise top speed x2.5.
  The farthest galaxy is now about 11 minutes by cruise (test checks < 20).
  The HUD shows the cruise ETA instead of a sublight "at this speed" ETA.

## Vercel (live)

https://doodle-voyager.vercel.app, project ridelink1/doodle-voyager, deployed 2026-09-23;
monitor 18/18 on it. Redeploy: node tools/stage.mjs, then in dist/:
npx vercel link --yes --project doodle-voyager and npx vercel deploy --prod --yes.

## Open items, in order

1. Done 2026-09-28: setting a destination, and the autopilot flying whole
   legs to moving targets (see docs/TODO.md, Gameplay).
2. Done 2026-09-28: HUD hint "tap or hold" for W/S.
4. RESEARCH-features.md was never finished (its agent hit a session limit).
5. ~50 ultra-faint Local Group dwarfs without coordinates (CATALOG-galaxies.md).
6. The rest of docs/TODO.md: multiplayer, clan wars, Chromebook performance,
   touch controls, UFS plugin test-width rule.
