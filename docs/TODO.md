# Doodle Voyager - to-do list

Owner: Gev. Started 2026-09-22. Items Gev asked for are marked (Gev). Items
from the player-request research are marked (research) and sourced in
`RESEARCH-features.md`.

## Needs a server (not possible on static hosting alone)

- [ ] (Gev) **Multiplayer where players can shoot each other.** Plan: an
      authoritative Node or Deno server (Colyseus or a plain WebSocket room per
      galaxy), client-side prediction for your own ship, server-side hit checks
      so nobody can fake a kill, snapshots at 15-20 Hz. Rooms are per galaxy so
      the universe scales by sharding. PvP opt-in flag per player (research: the
      single most common complaint about forced PvP is griefing).
- [ ] (Gev) **Clan wars and space battles across galaxies.** Clans own
      liberated sectors; a clan war is a timed contest over a set of sectors in
      one galaxy; capital ships become clan assets; the map shows clan colours.
      Needs accounts (Supabase auth is already used on Gev's other projects),
      a clans table, a sector-ownership table, and a war scheduler.
- [ ] Shared enemy zones for everyone on a server (today they roll per player,
      per log-on).
- [ ] Leaderboards: sectors liberated, capitals destroyed, distance flown.

## Gameplay

- [x] (Gev, 2026-09-23) **Setting a destination does not really work.**
      Done 2026-09-28: the map already had click a marker, then set course;
      the HUD now says "no destination, M map, pick a place, set course" when
      nothing is picked, and "T fly there" when something is picked and not
      flown. The autopilot itself was the real problem: it pointed straight at
      where the target was, so it flew through the Sun's well (and was pulled
      out of cruise thousands of times), and a planet faster than the approach
      cap or the hull was never caught. It now aims at the intercept point off
      the orbit itself, goes round bodies on the line, and caps the approach
      relative to the target. Checks fly whole legs: Mars, Mercury with the Sun
      in between, and a 216 u/s planet in the 150 u/s Filing Cabinet; all three
      failed on the old autopilot.
- [x] HUD hint for W/S should say "tap or hold" (a tap now moves the throttle a quarter).

- [x] (Gev) Gas stations everywhere, some serving only certain ship types.
      Done: about 42% of star systems have pumps, each selling one to three of
      ION / PLASMA / DEUTERIUM; the map's fuel tab marks the ones that serve
      your ship; wrong pumps refuse you and point to the nearest right one.
- [ ] More fuel friction: pump queues at busy stations, price differences by
      region, a fuel-type converter module (expensive) at the outfitter.
- [ ] Landing on planet surfaces (walk out of the ship onto a doodled surface).
- [ ] Boarding enemy capital ships and fighting the red guys inside.
- [ ] Red guy variety: shield bearers, snipers with dodgeable lasers, a boss
      per galaxy (Doodle Shooter has The Doodler, The Eraser, The Inkblot).
- [ ] Missions board at the Bazaar hub (courier runs, escort, bounty).
- [ ] Cargo trading between stations (the hauler has the bay for it).
- [ ] Crew: hire NPCs to sit at the gun room or cook in the galley.
- [ ] Ship decoration: place the posters and furniture you buy in the dorms.
- [ ] Gamepad and HOTAS support (Gamepad API).
- [ ] Touch controls for phones and tablets.
- [ ] Photo mode with a free camera (today K saves the current frame).

## Universe data

- [x] HYG star database (Hipparcos + Yale + Gliese, CC BY-SA 4.0), the approach
      Celestia and Space Engine use: 11,071 real stars (naked-eye or within 25 pc)
      are systems you can fly to, merged with the 4,747 exoplanet hosts.
- [ ] Minor planets and comets from the IAU Minor Planet Center (asteroid belt
      and Kuiper belt as real objects).
- [ ] Galaxy clusters as named regions (Virgo, Coma, Fornax, Laniakea).
- [ ] A catalogue refresh script on a schedule (NASA adds exoplanets weekly).

## Tech

- [ ] (Gev) **Make the game highly CPU and GPU efficient so it runs well on
      Chromebooks** (integrated GPUs, 4 GB RAM, often ARM). Plan: detect a weak
      device at boot (WebGL renderer string, `navigator.hardwareConcurrency`,
      `deviceMemory`, a 2-second frame-time probe) and pick a "Chromebook"
      preset automatically; render the 3D target at 0.5-0.6 scale and upscale
      (the ink look survives low resolution well); cap point clouds (galaxy
      detail 800 points, far galaxies merged into one buffer updated every
      other frame); move per-frame point squashing into a Web Worker or a
      vertex shader; drop the orbit lines and far sight clouds on the low
      preset; cap the frame rate at 30 when idle on the title and while
      walking; pause rendering on a hidden tab; share geometries and
      materials between ship interiors; keep draw calls under ~250; measure
      on a real Chromebook (or Chrome's CPU 4x throttle plus a low-end GPU
      profile) with a target of 30+ fps. The resolution setting that exists
      today (low / medium / full) is the first step.
- [ ] Level-of-detail for the 10,000-galaxy cloud on low-end GPUs.
- [ ] Web Worker for the per-frame point squashing.
- [ ] Service worker so the game and the catalogues work offline.
- [x] Vercel: live at https://doodle-voyager.vercel.app (2026-09-23).
- [ ] Place the ~50 ultra-faint Local Group dwarfs whose Wikipedia pages carry no readable coordinates (listed in CATALOG-galaxies.md); source them from the McConnachie 2012 table or NED.
- [ ] UFS plugin: games.md should say to test at the target platform resolutions (a keyboard-and-mouse game gets 1366x768 / 1280x720 / 1920x1080, a phone width only with touch controls), and look should not default to 390 px for a canvas game.
## Player-request list (from the research)

See `RESEARCH-features.md` for the ranked list with sources. The top requests
are cross-checked against this list; anything not already here is added below
when the research lands.
