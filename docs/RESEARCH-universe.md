# Doodle Voyager - research: the whole universe

Owner: Gev. Written 2026-09-22. Companion data file: `data/sights.json`.

Gev asked for "the whole universe, every single planet, every single galaxy",
and to follow other space games that model the whole universe instead of
inventing everything. This file covers what is actually known, what
catalogues exist, how the reference games handle the gap, how Doodle Voyager
follows the same method, the real Solar System, and the view sites.

Where a number was measured live in this session (a query against the NASA
Exoplanet Archive, JPL, SIMBAD or a catalogue file), it says so. Anything not
checked against a source in this session is marked **UNVERIFIED**.

---

## 1. How much is out there

| Quantity | Best current number | Source |
|---|---|---|
| Galaxies in the observable universe | **2.0 (+0.7 / -0.6) x 10^12** up to redshift z = 8 | Conselice, Wilkinson, Duncan & Mortlock 2016, ApJ 830, 83 |
| Light from all galaxies, New Horizons dark-sky measurement | **about half the light the 2-trillion estimate implied, about twice the light of catalogued galaxies**; NASA's corrected release says this "do[es] not place a constraint on the total number of galaxies" | Lauer et al. 2021, ApJ 906, 77; NASA release (corrected) |
| Same, Wikipedia's current range | **200 billion to 2 trillion** (2 x 10^11 to 2 x 10^12) | Wikipedia "Galaxy" |
| Stars in the observable universe | **up to about 10^24** | Wikipedia "Observable universe", citing ESA (2019) |
| Size of the observable universe | comoving radius **14.26 Gpc** (46.5 billion light years) | Wikipedia "Observable universe", citing Baumann 2022 |
| Stars in the Milky Way | **100 to 400 billion** | Wikipedia "Milky Way" |
| Planets in the Milky Way | **at least one planet per star on average**, so at least 100-400 billion | Cassan et al. 2012, Nature 481, 167 (microlensing); Wikipedia "Milky Way" |
| Rocky habitable-zone planets around Sun-like stars | **eta-Earth 0.37 to 0.60 per star**; at least about **300 million** such worlds in the Milky Way | Bryson et al. 2021, AJ 161, 36 (Kepler); NASA release |
| Confirmed exoplanets | **6,366** (archive headline, "as of 09/11/2026") | NASA Exoplanet Archive home page |
| Confirmed exoplanets, measured here | **6,366 planets around 4,775 host stars; 1,058 hosts have two or more planets listed** (the archive's own `sy_pnum` column gives 1,068: it disagrees with the listed rows for 16 hosts, for example 55 Cnc has `sy_pnum` 7 but 5 listed planets) | TAP query of `pscomppars`, run 2026-09-22 |

### The galaxy count, in order

1. **Conselice et al. 2016** counted galaxies in deep Hubble fields, fitted how
   the number density changes with redshift, and integrated to z = 8. Their
   total is 2.0 (+0.7/-0.6) x 10^12, which implied about 90 percent of
   galaxies are too faint for Hubble to see.
2. **Lauer et al. 2021** measured the cosmic optical background with the
   LORRI camera on New Horizons, 42-45 au from the Sun where the sky is about
   ten times darker than anything Hubble sees. The background they found was
   about half the light the Conselice study implied, but still about twice
   the light of the galaxies already catalogued. Lauer: "Take all the light
   from galaxies Hubble can see, double that number, and that's what we see -
   but nothing more." NASA's first release said this was inconsistent with 2
   trillion galaxies; NASA has since corrected it: "The New Horizons
   observations do not place a constraint on the total number of galaxies but
   rather do constrain the total amount of light all galaxies emit at
   ultraviolet and optical wavelengths."
3. **Postman et al. 2024** (ApJ, arXiv 2407.06273) repeated the measurement
   with new dedicated observations: 11.16 +/- 1.65 nW m^-2 sr^-1, of which
   8.17 +/- 1.18 is from known galaxies, and "the simplest interpretation is
   that the COB is completely due to galaxies". So the honest answer today is
   Wikipedia's range, 200 billion to 2 trillion. The dark-sky data say the
   galaxies Hubble misses add little light; they do not say how many there
   are.

### Confirmed exoplanets by discovery method (measured 2026-09-22)

Query: `select discoverymethod, count(*) from pscomppars group by discoverymethod`.

| Method | Planets |
|---|---|
| Transit | 4,708 |
| Radial velocity | 1,200 |
| Microlensing | 289 |
| Imaging | 97 |
| Transit timing variations | 29 |
| Eclipse timing variations | 17 |
| Orbital brightness modulation | 9 |
| Pulsar timing | 8 |
| Astrometry | 6 |
| Pulsation timing variations | 2 |
| Disk kinematics | 1 |
| **Total** | **6,366** |

What that means for "every single planet": 6,366 confirmed planets out of
at least 100 billion in the Milky Way alone is under one in fifteen million.
Nobody can ship every planet, because nobody knows them.

---

## 2. No catalogue lists every galaxy or planet

Plainly: **there is no list of every galaxy, every star or every planet, and
there never will be.** The observable universe holds a few hundred billion to
two trillion galaxies; the largest galaxy surveys have measured tens of
millions. The Milky Way holds 100-400 billion stars; the largest star
catalogue (Gaia DR3) has 1.8 billion sources, which is roughly 0.5 to 2
percent of them. For planets, the confirmed list is 6,366. Everything else is
statistics.

What does exist:

| Catalogue | What it is | Size | Notes | Source |
|---|---|---|---|---|
| Messier | Charles Messier's list of fuzzy objects that are not comets | **110** objects | Messier's own final edition (1781) had 103; seven were added later from his notes | Wikipedia "Messier object" |
| NGC, New General Catalogue | J. L. E. Dreyer, 1888 | **7,840** objects | Galaxies, star clusters, nebulae | Wikipedia "New General Catalogue" |
| IC, Index Catalogue | Dreyer's two supplements, 1895 and 1908 | **5,386** objects (1,529 + 3,857) | Same mix as the NGC | Wikipedia "Index Catalogue" |
| Caldwell | Patrick Moore, Sky & Telescope, December 1995 | **109** objects | Bright objects Messier missed, for amateurs | Wikipedia "Caldwell catalogue" |
| UGC, Uppsala General Catalogue | Peter Nilson, 1973 | **12,921** galaxies | North of declination -2 deg 30', larger than 1 arcminute or brighter than magnitude 14.5 | Wikipedia "Uppsala General Catalogue" |
| PGC, Principal Galaxies Catalogue | Paturel et al. 1989 | **73,197** galaxies | Numbering continued inside HyperLEDA | Wikipedia "Principal Galaxies Catalogue" |
| HyperLEDA | Lyon-Meudon extragalactic database | **5,266,568 objects** (11,193,487 positions, 9,385,445 designations) | Read from the HyperLEDA introduction page this session; Makarov et al. 2014 described it as over 3 million objects, about 1.5 million confirmed galaxies | HyperLEDA intro page |
| SDSS, Sloan Digital Sky Survey | Imaging plus spectra since 2000 | about **1 billion** objects imaged, over **4 million** spectra | Imaging covers over 35 percent of the sky; latest release DR19 (July 2025, arXiv 2507.07093) | Wikipedia "Sloan Digital Sky Survey"; sdss.org/dr19 |
| DESI, Dark Energy Spectroscopic Instrument | Redshift survey | DR1 (March 2025): **18.7 million** objects (13.1 M galaxies, 1.6 M quasars, 4 M stars). Survey finished its five-year plan on 15 April 2026 with **over 47 million galaxies and quasars and over 20 million stars** observed | DR2 spectra not yet public as of this writing | DESI DR1 paper (arXiv 2503.14745); DESI announcements |
| Gaia DR3 (ESA) | Astrometric survey of the Milky Way | **1,811,709,771** sources; **1,467,744,818** with parallax and proper motion | Released 13 June 2022; Gaia DR4 is scheduled for **2 December 2026**; DR5 not before end of 2030 | ESA Gaia DR3 and release pages |
| HYG | Hipparcos + Yale Bright Star + Gliese merged | **119,614** stars (v4.4) | CC BY-SA 4.0; now hosted on Codeberg | codeberg.org/astronexus/hyg |
| OpenNGC | Modern positions and data for every NGC and IC object | **13,970** rows, **10,482** of them typed as galaxies, plus a **64**-row addendum (M40, M45, the Large Magellanic Cloud as ESO056-115, and others; the Small Magellanic Cloud is in the main file as NGC 292) | CC BY-SA 4.0; counted from the downloaded CSVs this session | github.com/mattiaverga/OpenNGC |
| NASA Exoplanet Archive | Curated list of confirmed planets and hosts | **6,366** planets, **4,775** hosts | Measured by TAP query this session; TESS: 936 confirmed, 8,148 candidates | exoplanetarchive.ipac.caltech.edu |
| IAU Minor Planet Center | The official clearing house for asteroid and comet orbits | JPL's Small-Body Database, built on MPC orbits, returned **1,566,682 asteroids (895,910 numbered) and 4,077 comets** this session | The MPC front page shows discoveries per month and year only; an MPC-published grand total was not found (**UNVERIFIED** as an MPC figure) | minorplanetcenter.net; ssd-api.jpl.nasa.gov/sbdb_query.api |

Why this matters for a browser game (and for Gev's Chromebook to-do): a
browser tab can hold thousands to tens of thousands of rows comfortably. Gaia
alone is 1.8 billion rows. Shipping "everything" is impossible even in
principle; shipping the named, real highlights and seeding the rest keeps
download, memory and per-frame CPU flat no matter how far the player flies.

---

## 3. How the reference games do it

| Game | Real data | Generated | Scale claim | Sources |
|---|---|---|---|---|
| **SpaceEngine** (Vladimir Romanyuk, 2010; Cosmographic Software) | "over 130,000 real objects": Hipparcos stars (about 118,000), NGC/IC galaxies, known exoplanets and their stars, nebulae, clusters, Solar System bodies; site lists "HIPPARCOS, NGC/IC, Messier, MPC, NASA Exoplanet Archive" | "Uncharted regions of space feature procedurally generated objects: galaxies, stars, star clusters, nebulae and planetary systems" | "a cubical universe over 10 billion parsecs on each side"; "trillions of galaxies" | spaceengine.org; Wikipedia "SpaceEngine" |
| **Elite Dangerous** (Frontier, Stellar Forge) | "Hipparcos and Gliese stellar catalogs are used to seed our generated Milky Way with real stars" (Doc Ross, 2018); Wikipedia: about 150,000 systems from real data, including Sol and Alpha Centauri | Everything else by the Stellar Forge, top-down from a galaxy mass and age model: "parent data is always available for generating the sub-objects" | about **400 billion** star systems in a 1:1 Milky Way | Wikipedia "Elite Dangerous"; 80.lv interview with Doc Ross; elitedangerous.com |
| **No Man's Sky** (Hello Games) | None: no real stars or catalogues are used (Wikipedia says nothing about real data; nothing found otherwise) | Everything, from a 64-bit seed per planet: "every planet has a single number, a random seed, that defines everything about that planet"; nothing is stored | **18,446,744,073,709,551,616** planets (2^64) across 256 galaxies (the NMS community wiki; **UNVERIFIED** against a Hello Games source) | PlayStation Blog, Sean Murray, 2014; Wikipedia "No Man's Sky"; NMS wiki "Galaxy" |
| **Celestia** (Chris Laurel, 2001; GPLv2, open source) | Only catalogues: Hipparcos (118,322 stars) in 1.6.4 and earlier, Tycho-2 and some Gaia data in 1.7.0 (over 2 million stars), a compiled galaxy catalogue, the Solar System | No procedural generation was found in any source; Wikipedia says many stars, supernovae, black holes and nebulae "are missing from the standard distribution", and users fill gaps with add-ons ("well over 80 GB") | whatever the catalogues and add-ons hold | Wikipedia "Celestia"; GPLv2 from the COPYING file on GitHub |
| **Universe Sandbox** (Giant Army, Dan Dixon) | Its object library holds "all even slightly major celestial bodies of Solar System, tens of different stars like Proxima Centauri, Betelgeuse or Arcturus, known discovered exoplanets, black holes, several galactic formations" (Wikipedia). Which exoplanet catalogue it loads: **UNVERIFIED** | "Procedurally generated planets, stars, & galaxies" (universesandbox.com); an N-body gravity, climate, collision and material simulation is the core | a sandbox, not a map | universesandbox.com; Wikipedia "Universe Sandbox" |
| **Star Citizen** (Cloud Imperium) | None: its systems are fictional (Stanton, Pyro, Nyx, Castra, Terra); Sol exists only in the lore starmap | Planet surfaces are procedurally generated with hand-placed points of interest | pitched as more than 100 systems; 3 live in 2026 (Stanton, Pyro, Nyx), Castra and Terra planned for 1.0 | Wikipedia "Star Citizen"; starcitizen.tools Release 1.0 and Nyx pages |

The pattern: the games that model the real universe (SpaceEngine, Elite
Dangerous, Celestia) all start from the same public catalogues (Hipparcos,
Gliese, NGC/IC, the NASA Exoplanet Archive, the MPC) and then either stop
(Celestia) or fill the gaps with seeded generation driven by a physical model
(SpaceEngine, Elite). The fully fictional games (No Man's Sky, Star Citizen)
show the other half of the trick: one seed per object makes an unlimited
universe that costs nothing to store.

### How Doodle Voyager follows the same method

Read from `js/universe.js` as it stands on 2026-09-22.

- **Real near home, from the same catalogues the reference games use.**
  - The Solar System: 8 planets and 5 dwarf planets with real semi-major axes,
    radii and periods (the `SOLAR` table), plus their main moons.
  - Every confirmed exoplanet host from the NASA Exoplanet Archive
    (`data/exoplanets.json`, fields `pl, host, ra, dec, pc, rade, a, per, teq,
    steff, srad, year, method`), each placed at its real sky position and
    distance, with its real planets.
  - Real stars from HYG (`data/stars.json`, naked-eye or within 25 pc),
    merged with the exoplanet hosts so no star appears twice. This is the
    Celestia and SpaceEngine approach (Hipparcos-based), and Elite's
    Hipparcos + Gliese seeding.
  - Every NGC and IC galaxy from OpenNGC plus the Local Group and redshift
    record holders (`data/galaxies.json`), placed by RA/Dec and distance; a
    galaxy with no measured distance is placed by brightness and flagged as
    estimated (`dq: 'est'`).
  - The view sites in this document (`data/sights.json`): nebulae, clusters,
    famous stars, black holes, pulsars and planet systems at real positions.
- **Seeded past the catalogues, the No Man's Sky and Stellar Forge way.**
  - Each real galaxy other than the Milky Way gets 10-120 star systems seeded
    from `hash(galaxy id, i)`, shaped by the galaxy's type (spiral, barred,
    elliptical, irregular, lenticular, dwarf); each system's planets and moons
    are seeded from the system's own seed, so they are the same every visit.
  - The Milky Way's disc beyond 3 kpc from the Sun gets 900 seeded
    "Uncharted MW-###" systems, so the charted neighbourhood stays real.
  - Past the catalogued galaxies (more than 9e9 game units from the Sun), new
    galaxies are generated one 3e9-unit cell at a time from `hash('cell',
    key)`, named "Uncharted x.y.z-n" and labelled "procedural, not a
    catalogued galaxy". Space never runs out, and nothing seeded is presented
    as real.
- **Real positions, compressed distances.** Every real object keeps its true
  sky direction; distances are compressed by `pcToU` in `js/util.js`
  (4e6 units per parsec to 10 pc, then logarithmic inside the Milky Way,
  square-root out to 20 Mpc, logarithmic again past that) so a Pleiades trip
  takes minutes, not millennia. The older numbers in `PLAN.md` "Scale" are
  superseded by that function.

---

## 4. The Solar System

All radii are JPL mean (volumetric) radii. Planet semi-major axes are the JPL
approximate Keplerian elements (valid 1800-2050); dwarf-planet semi-major axes
are osculating values from the JPL Small-Body Database, full precision,
queried this session. Moon orbits are JPL mean-element semi-major axes. Facts
marked * were written from the named source without re-opening it this
session: treat those as **UNVERIFIED** until checked.

### Planets and dwarf planets

| Body | Type | Mean radius (km) | Semi-major axis (AU) | One real fact | Fact source |
|---|---|---|---|---|---|
| Mercury | planet | 2,439.4 | 0.3871 | One solar day, sunrise to sunrise, lasts 176 Earth days. | NASA Mercury facts |
| Venus | planet | 6,051.8 | 0.7233 | The hottest planet, with a surface at about 467 C (872 F). | NASA Venus facts |
| Earth | planet | 6,371.0 | 1.0000 | The only world known to have liquid water on its surface and life.* | NASA |
| Mars | planet | 3,389.5 | 1.5237 | Olympus Mons, about three times the height of Everest, is the largest volcano in the Solar System.* | NASA |
| Jupiter | planet | 69,911 | 5.2029 | The Great Red Spot is a storm wider than Earth.* | NASA |
| Saturn | planet | 58,232 | 9.5367 | Its mean density, 0.687 g/cm3, is lower than water's. | JPL table (measured) |
| Uranus | planet | 25,362 | 19.1892 | Its axis is tipped about 98 degrees, so it rolls around the Sun on its side.* | NASA |
| Neptune | planet | 24,622 | 30.0699 | Its winds exceed 2,000 km/h (1,200 mph). | NASA Neptune facts |
| Ceres | dwarf planet | 469.7 | 2.7656 | The largest object in the asteroid belt; Dawn found bright salt deposits in Occator crater.* | NASA Dawn |
| Pluto | dwarf planet | 1,188.3 | 39.589 | New Horizons (2015) found Sputnik Planitia, a vast plain of nitrogen ice.* | NASA New Horizons |
| Haumea | dwarf planet | 715 (JPL); elongated, about 2,100 x 1,680 x 1,074 km (Dunham 2019), mean diameter 1,544 km in a 2026 study | 43.060 | Spins once every 3.9 hours (0.1631 d, JPL) and has a ring about 2,287 km in radius (Ortiz et al. 2017). | JPL table; Wikipedia "Haumea" |
| Makemake | dwarf planet | 714 | 45.571 | Found in 2005 shortly after Easter and named after the Rapa Nui creator god; a small moon was found in 2016.* | NASA |
| Eris | dwarf planet | 1,200 +/- 50 (JPL; a 2011 occultation gave 1,163*) | 67.934 | About 27 percent more massive than Pluto (16,600 vs 13,025 x 10^18 kg, JPL), and its discovery led the IAU to define "planet" in 2006.* | JPL table; IAU |

### Major moons

Rule: every moon in JPL's satellite table with a mean radius of 80 km or
more, plus Mars's two moons, plus Eris's moon Dysnomia (not in JPL's table).
30 moons.

| Moon | Parent | Mean radius (km) | Orbit semi-major axis (km) | One real fact | Fact source |
|---|---|---|---|---|---|
| Moon | Earth | 1,737.4 | 384,400 | The only other world people have walked on: 12 astronauts, Apollo 11 to 17, 1969-1972.* | NASA |
| Phobos | Mars | 11.08 | 9,375 | Falling toward Mars 1.8 m per century; it will crash or break into a ring in about 50 million years. | NASA Phobos |
| Deimos | Mars | 6.2 | 23,457 | The smaller, outer moon of Mars, going round in 30.3 hours (1.2625 d). | JPL elements (measured) |
| Io | Jupiter | 1,821.5 | 421,800 | The most volcanically active body in the Solar System.* | NASA |
| Europa | Jupiter | 1,560.8 | 671,100 | Its ocean under the ice holds about twice as much water as all of Earth's oceans. | NASA Europa |
| Ganymede | Jupiter | 2,631.2 | 1,070,400 | The largest moon in the Solar System, bigger than Mercury (2,631 vs 2,439 km radius), and the only moon with its own magnetic field.* | JPL (size, measured); NASA (field) |
| Callisto | Jupiter | 2,410.3 | 1,882,700 | The most heavily cratered object in the Solar System.* | NASA |
| Amalthea | Jupiter | 83.5 | 181,400 | The reddest object in the Solar System, and it gives out more heat than it gets from the Sun. | NASA Amalthea |
| Himalia | Jupiter | 85.0 | 11,439,000 | The largest of the Himalia group, outer moons thought to share one origin; Charles Dillon Perrine found it in 1904. | NASA Himalia; JPL (size, orbit) |
| Janus | Saturn | 89.2 | 151,500 | Shares almost the same orbit with Epimetheus; about every four years the two swap places, the only such arrangement known in the Solar System. | NASA Janus; JPL (size, orbit) |
| Mimas | Saturn | 198.2 | 186,000 | Its crater Herschel is about 130 km wide, a third of the moon's diameter.* | NASA |
| Enceladus | Saturn | 252.1 | 238,400 | Geysers from an ocean under its south pole feed Saturn's E ring (Cassini).* | NASA Cassini |
| Tethys | Saturn | 531.1 | 295,000 | The canyon Ithaca Chasma runs about 2,000 km (1,200 miles); the crater Odysseus is 400 km wide. | NASA Tethys |
| Dione | Saturn | 561.4 | 377,700 | Its bright "wisps" are ice cliffs, some several hundred metres high (Cassini). | NASA Dione |
| Rhea | Saturn | 763.5 | 527,200 | Saturn's second-largest moon, after Titan. | JPL table (measured) |
| Titan | Saturn | 2,574.8 | 1,221,900 | The only moon with a thick atmosphere, and the only world besides Earth with liquid seas on its surface (methane and ethane); Huygens landed in 2005.* | NASA / ESA |
| Hyperion | Saturn | 135 | 1,481,500 | Sponge-like and tumbling chaotically instead of spinning steadily.* | NASA |
| Iapetus | Saturn | 734.3 | 3,561,700 | Two-toned: one hemisphere is dark as coal, the other bright as snow, with a ridge around its equator.* | NASA |
| Phoebe | Saturn | 106.5 | 12,929,400 | Orbits backwards (inclination 175.2 deg, JPL), probably a captured body. | JPL elements (measured) |
| Miranda | Uranus | 235.8 | 129,846 | Its fault canyons are up to 12 times as deep as the Grand Canyon. | NASA Miranda |
| Ariel | Uranus | 578.9 | 190,929 | The brightest of Uranus's large moons, with the youngest-looking surface.* | NASA |
| Umbriel | Uranus | 584.7 | 265,986 | The darkest of Uranus's large moons.* | NASA |
| Titania | Uranus | 788.9 | 436,298 | The largest moon of Uranus. | JPL table (measured) |
| Oberon | Uranus | 761.4 | 583,511 | The outermost of Uranus's five large moons. | JPL elements (measured) |
| Triton | Neptune | 1,352.6 | 354,800 | Orbits backwards (inclination 157.3 deg, JPL); Voyager 2 saw nitrogen geysers on it in 1989.* | JPL (orbit, measured); NASA (geysers) |
| Larissa | Neptune | 96.0 | 73,500 | First spotted from the ground in 1981 and officially discovered by the Voyager 2 team in July 1989. | NASA Larissa; JPL (size, orbit) |
| Proteus | Neptune | 208 | 117,600 | One of the largest odd-shaped moons, about as big as a body can be before gravity pulls it round.* | NASA |
| Nereid | Neptune | 170 | 5,513,900 | The most eccentric orbit of any large moon here, e = 0.751. | JPL elements (measured) |
| Charon | Pluto | 606.0 | 19,600 | Half Pluto's size; the two are locked face to face around a point between them.* | NASA |
| Dysnomia | Eris | about 308 (diameter 615 +60/-50, Brown and Butler 2023) | 37,273 | The second-largest known moon of a dwarf planet after Charon, with a dark surface that reflects about 5 percent of light. | Wikipedia "Dysnomia (moon)", citing Brown and Butler 2023 |

The game's own `SOLAR` table in `js/universe.js` carries the 13 bodies above
and 17 of these moons; this table is the reference if more are added.

---

## 5. View sites (`data/sights.json`)

69 sites: 13 nebulae, 5 supernova remnants, 10 star clusters, 18 stars,
5 black holes, 6 pulsars and magnetars, 12 planet systems.

Coordinates are J2000 RA and Dec in degrees. Unless another source is given,
coordinates were resolved live from SIMBAD (TAP) and CDS Sesame, or taken
from the NASA Exoplanet Archive `pscomppars` row for planet hosts. Distance
codes:

- **S** = 1000 / parallax, with the parallax listed by SIMBAD (Gaia or
  Hipparcos; for open clusters, the Gaia cluster mean).
- **NEA** = `sy_dist` in the NASA Exoplanet Archive (Gaia-based).
- **BV21** = Baumgardt and Vasiliev 2021 globular-cluster table, read this session.
- Anything else is the named paper or page.

Facts marked * were written from the named source without re-opening it in
this session (**UNVERIFIED** until checked). Unmarked facts were checked
against the named source this session.

| # | Name | Kind | RA | Dec | pc | Host galaxy | Distance source | Fact source |
|---|---|---|---|---|---|---|---|---|
| 1 | Orion Nebula (M42) | nebula | 83.8201 | -5.3876 | 414 | - | Menten et al. 2007, VLBA parallax 414 +/- 7 pc | NASA/ESA Hubble* |
| 2 | Eagle Nebula (Pillars of Creation) | nebula | 274.688 | -13.792 | 1,767 | - | S (NGC 6611 cluster, 0.566 mas) | NASA/ESA Hubble, NASA Webb* |
| 3 | Carina Nebula (NGC 3372) | nebula | 161.2593 | -59.6999 | 2,350 | - | Smith 2006 (2.35 kpc, Eta Carinae) | NASA Webb Cosmic Cliffs* |
| 4 | Ring Nebula (M57) | nebula | 283.3962 | 33.0291 | 788 | - | S (central star, 1.2696 mas) | NASA* |
| 5 | Helix Nebula (NGC 7293) | nebula | 337.4106 | -20.8372 | 200 | - | S (central star, 5.0124 mas) | NASA* |
| 6 | Horsehead Nebula (Barnard 33) | nebula | 85.2458 | -2.4583 | 422 | - | 422 +/- 17 pc, Gaia DR2, via Wikipedia | Wikipedia "Horsehead Nebula" |
| 7 | Lagoon Nebula (M8) | nebula | 270.9042 | -24.3867 | 1,250 | - | Arias et al. 2006, via Wikipedia | Wikipedia "Lagoon Nebula"* |
| 8 | Trifid Nebula (M20) | nebula | 270.675 | -22.9717 | 1,266 | - | S (cluster, 0.79 mas) | NASA* |
| 9 | Cat's Eye Nebula (NGC 6543) | nebula | 269.6392 | 66.633 | 1,366 | - | S (central star, 0.7321 mas); older estimates about 1 kpc | ESA/Hubble* |
| 10 | Butterfly Nebula (NGC 6302) | nebula | 258.4354 | -37.1031 | 1,040 | - | 1,040 +/- 160 pc, via Wikipedia | Wikipedia "NGC 6302" |
| 11 | Rosette Nebula (NGC 2237) | nebula | 97.6504 | 4.9807 | 1,600 | - | Phelps and Ybarra 2005, via Wikipedia | Wikipedia "Rosette Nebula"* |
| 12 | North America Nebula (NGC 7000) | nebula | 314.6958 | 44.33 | 795 | - | Kuhn et al. 2020, Gaia, 795 +/- 25 pc | Wikipedia "North America Nebula" |
| 13 | Tarantula Nebula (30 Doradus) | nebula | 84.675 | -69.1 | 49,590 | Large Magellanic Cloud | Pietrzynski et al. 2019, LMC 49.59 kpc | ESA/Webb* |
| 14 | Crab Nebula (M1) | remnant | 83.6324 | 22.0174 | 2,000 | - | Trimble 1973, about 2 kpc | NASA* |
| 15 | Veil Nebula (Cygnus Loop) | remnant | 312.75 | 30.6667 | 725 | - | Fesen et al. 2021, Gaia EDR3, 725 +/- 15 pc | size from SIMBAD extent* |
| 16 | Cassiopeia A | remnant | 350.8584 | 58.8113 | 3,400 | - | Reed et al. 1995, 3.4 kpc | NASA Chandra* |
| 17 | Vela Supernova Remnant | remnant | 128.5 | -45.8333 | 287 | - | Dodson et al. 2003 (pulsar parallax) | age from pulsar* |
| 18 | SN 1987A | remnant | 83.8666 | -69.2698 | 49,590 | Large Magellanic Cloud | Pietrzynski et al. 2019 (LMC) | NASA* |
| 19 | Pleiades (M45) | cluster | 56.6008 | 24.1139 | 136 | - | S (7.364 mas) | NASA* |
| 20 | Hyades | cluster | 67.4471 | 16.9481 | 47.5 | - | S (21.052 mas) | NASA* |
| 21 | Omega Centauri (NGC 5139) | cluster | 201.697 | -47.4795 | 5,430 | - | BV21, 5.43 +/- 0.05 kpc | NASA/ESA Hubble 2024* |
| 22 | Hercules Cluster (M13) | cluster | 250.4235 | 36.4613 | 7,420 | - | BV21, 7.42 +/- 0.08 kpc | Arecibo message 1974* |
| 23 | 47 Tucanae (NGC 104) | cluster | 6.0223 | -72.0814 | 4,520 | - | BV21, 4.52 +/- 0.03 kpc | ESO* |
| 24 | Beehive Cluster (M44) | cluster | 130.0542 | 19.6211 | 186 | - | S (5.371 mas) | NASA* |
| 25 | Double Cluster (h and chi Persei) | cluster | 35.1625 | 57.1414 | 2,526 | - | S (NGC 869 0.3942 and NGC 884 0.3976 mas, averaged; position is the midpoint) | NASA* |
| 26 | Jewel Box (NGC 4755) | cluster | 193.415 | -60.3711 | 2,165 | - | S (0.462 mas) | ESO* |
| 27 | Westerlund 1 | cluster | 251.76 | -45.8519 | 3,970 | - | S (0.252 mas; small parallax, approximate) | ESO* |
| 28 | Messier 4 | cluster | 245.8968 | -26.5258 | 1,850 | - | BV21, 1.85 +/- 0.02 kpc | NASA Hubble* |
| 29 | Betelgeuse | star | 88.7929 | 7.4071 | 153 | - | S (6.55 mas); other published estimates are larger | ESO VLT (Montarges et al. 2021)* |
| 30 | Rigel | star | 78.6345 | -8.2016 | 265 | - | S (3.78 mas, Hipparcos) | Wikipedia* |
| 31 | Eta Carinae | star | 161.2648 | -59.6844 | 2,350 | - | Smith 2006 | NASA* |
| 32 | Sirius | star | 101.2872 | -16.7161 | 2.637 | - | S (379.21 mas) | NASA* |
| 33 | Vega | star | 279.2347 | 38.7837 | 7.679 | - | S (130.23 mas) | Harvard College Observatory* |
| 34 | Polaris | star | 37.9546 | 89.2641 | 133 | - | S (7.54 mas, Hipparcos) | Wikipedia* |
| 35 | Proxima Centauri | star | 217.4289 | -62.6795 | 1.302 | - | S (768.0665 mas, Gaia DR3) | ESO 2016 (Proxima b)* |
| 36 | Alpha Centauri A | star | 219.9021 | -60.834 | 1.3475 | - | S (742.12 mas) | NASA* |
| 37 | Barnard's Star | star | 269.4521 | 4.6934 | 1.828 | - | S (546.9759 mas) | proper motion 10.4 arcsec/yr, computed* |
| 38 | Antares | star | 247.3519 | -26.432 | 170 | - | S (5.89 mas) | Wikipedia* |
| 39 | Arcturus | star | 213.9153 | 19.1824 | 11.26 | - | S (88.83 mas) | Wikipedia* |
| 40 | Aldebaran | star | 68.9802 | 16.5093 | 20.43 | - | S (48.94 mas) | NASA Pioneer 10* |
| 41 | UY Scuti | star | 276.9022 | -12.4664 | 1,936 | - | S (0.5166 mas, Gaia DR3); older estimate 2.9 kpc | Wikipedia* |
| 42 | Stephenson 2-18 | star | 279.7599 | -6.0863 | 5,800 | - | Wikipedia (disputed; Davies 2007: 5.83 +1.91/-0.78 kpc); coordinates confirmed with Sesame via 2MASS J18390238-0605106 (SIMBAD "Cl* Stephenson 2 DFK 1"), which the common name does not resolve | Wikipedia "Stephenson 2-18" |
| 43 | VY Canis Majoris | star | 110.743 | -25.7676 | 1,200 | - | Zhang et al. 2012, maser parallax 1.20 +0.13/-0.10 kpc | Wikipedia* |
| 44 | Tabby's Star (KIC 8462852) | star | 301.5644 | 44.4569 | 444 | - | S (2.2545 mas) | Boyajian et al. 2016* |
| 45 | R Doradus | star | 69.19 | -62.0772 | 54.6 | - | S (18.31 mas) | ESO 1997* |
| 46 | R136a1 | star | 84.6767 | -69.1008 | 49,590 | Large Magellanic Cloud | Pietrzynski et al. 2019 (LMC) | ESO / Gemini 2022* |
| 47 | Sagittarius A* | blackhole | 266.4168 | -29.0078 | 8,178 | - | GRAVITY Collaboration 2019 (8,178 pc, the value `universe.js` uses for the Galactic Centre; GRAVITY 2021 revised it to about 8,277 pc) | EHT 2022* |
| 48 | M87* | blackhole | 187.7059 | 12.3911 | 16,800,000 | M87 | EHT 2019, 16.8 +/- 0.8 Mpc | EHT 2019 (6.5 +/- 0.7 billion solar masses) |
| 49 | Cygnus X-1 | blackhole | 299.5903 | 35.2016 | 2,220 | - | Miller-Jones et al. 2021, 2.22 kpc | Miller-Jones et al. 2021 (21.2 +/- 2.2 solar masses) |
| 50 | Gaia BH1 | blackhole | 262.1712 | -0.581 | 480 | - | El-Badry et al. 2023, 480 pc (SIMBAD parallax 2.07 mas agrees) | El-Badry et al. 2023 (nearest known black hole, 9.62 solar masses) |
| 51 | Gaia BH3 | blackhole | 294.828 | 14.9317 | 591 | - | Gaia Collaboration (Panuzzo et al.) 2024, 590 pc | same (32.70 +/- 0.82 solar masses) |
| 52 | Crab Pulsar | pulsar | 83.6331 | 22.0145 | 2,000 | - | Trimble 1973 | NASA* |
| 53 | Vela Pulsar | pulsar | 128.8361 | -45.1764 | 287 | - | Dodson et al. 2003, VLBI parallax 3.5 +/- 0.2 mas, 287 +19/-17 pc | NASA Fermi* |
| 54 | PSR J0437-4715 | pulsar | 69.3158 | -47.2524 | 156.8 | - | Reardon et al. 2016, 156.79 +/- 0.25 pc | NICER 2024 paper title ("the nearest and brightest millisecond pulsar") |
| 55 | PSR B1257+12 | pulsar | 195.013 | 12.682 | 709 | - | S (1.41 mas) | Wolszczan and Frail 1992* |
| 56 | SGR 1806-20 | pulsar | 272.1639 | -20.4111 | 8,700 | - | Bibby et al. 2008, 8.7 +1.8/-1.5 kpc | NASA 2005 (giant flare of 27 Dec 2004)* |
| 57 | SGR 1935+2154 | pulsar | 293.732 | 21.8967 | 6,600 | - | Zhou et al. 2020, 6.6 +/- 0.7 kpc | Zhou et al. 2020 (FRB 200428) |
| 58 | TRAPPIST-1 | system | 346.6264 | -5.0435 | 12.43 | - | NEA | NASA 2017; archive lists 7 planets |
| 59 | Kepler-452 | system | 296.0038 | 44.2776 | 551.7 | - | NEA | NASA 2015* (Kepler-452 b is still in `pscomppars` this session) |
| 60 | HD 189733 | system | 300.1821 | 22.7098 | 19.76 | - | NEA | NASA / ESA Hubble 2013* |
| 61 | Kepler-186 | system | 298.6527 | 43.955 | 177.6 | - | NEA | NASA 2014* |
| 62 | HR 8799 | system | 346.8701 | 21.134 | 41.24 | - | NEA | Marois et al. 2008, 2010*; archive lists 4 planets |
| 63 | 51 Pegasi | system | 344.3675 | 20.7691 | 15.46 | - | NEA | Nobel Prize 2019* |
| 64 | 55 Cancri | system | 133.1468 | 28.3298 | 12.59 | - | NEA | archive: 5 planets, 55 Cnc e period 0.7365 d |
| 65 | TOI-700 | system | 97.0957 | -65.5786 | 31.13 | - | NEA | NASA 2020* |
| 66 | K2-18 | system | 172.5601 | 7.5878 | 38.03 | - | NEA | NASA Webb 2023* |
| 67 | Beta Pictoris | system | 86.8212 | -51.0661 | 19.74 | - | NEA | ESO* |
| 68 | Kepler-16 | system | 289.0758 | 51.7572 | 75.09 | - | NEA | NASA 2011* |
| 69 | Kepler-90 | system | 284.4335 | 49.3051 | 848.3 | - | NEA (listed there as KOI-351) | archive: the only 8-planet host |

Notes for the code that reads this file (`Universe.buildSights`):

- A row with a `galaxy` value is placed at that galaxy's position, looked up by
  `findGalaxy(name)`, and is skipped if the name is not found. The two names
  used are `M87` and `Large Magellanic Cloud`. Checked in the running game
  against the real `data/galaxies.json`: `M87` resolves to the row `NGC 4486`
  through its alt names ("M87, Virgo Galaxy") and `Large Magellanic Cloud`
  resolves by name, so all 69 rows are placed.
- `pc` is always the real distance from the Sun, including for the four
  extragalactic rows, because the map shows it as "N from the Sun for real".
  Two values differ from the matching rows in other data files, on purpose:
  M87* uses the EHT distance, 16.8 Mpc (54.8 Mly), while `galaxies.json` gives
  NGC 4486 a redshift distance of 58.67 Mly; and PSR B1257+12 uses its timing
  parallax, 709 pc (Yan et al. 2013, via SIMBAD), while the exoplanet archive
  lists 600 pc (Konacki and Wolszczan 2003), so the game shows the pulsar
  sight and its planet system about 6.6 million units apart.
- Star colours in `buildSights` come from the words "red" and "blue" in the
  name plus note. The notes were written so that only red stars contain
  "red" and only blue stars contain "blue". Measured in the running game:
  10 stars come out orange, 5 blue-white (Rigel, Sirius, Vega, Eta Carinae,
  R136a1) and 3 default yellow (Polaris, Alpha Centauri A, Tabby's Star).
- **Overlap to fix in `universe.js` (not fixable from the data):** many sights
  sit where the game already builds a real star system. Measured in the
  running game: all 12 `system` rows are 0 to 2,358 units from their NASA
  exoplanet host (Kepler-90 appears there as KOI-351), and star rows sit on
  their HYG or host star (Arcturus 148 units away, Aldebaran 120, Vega 4,000,
  Proxima 8,141, Barnard's Star 9,830, Sirius 12,000). `SightView` draws a
  glow sphere of radius `R = 6e4` for `star` and `system` kinds. TRAPPIST-1's
  star is about `sunRToU(0.119) = 7.7e3` units and its seven planets orbit
  inside about `2.5e4`, so at the TRAPPIST-1 sight the orange sphere fills the
  window and hides the real system (seen in a headless screenshot). The sight
  body of radius `0.35 R = 2.1e4` is not a collision body (`Game.collide`
  skips sights), but it does count as the nearest surface, which sets cruise
  speed and the HUD's "near" readout. A likely fix is for `buildSights` or
  `SightView` to draw no sphere (label and map marker only) when a real
  system already sits within a few thousand units of the sight. The Crab
  Pulsar inside the Crab Nebula is a different case: a pulsar mesh inside a
  remnant cloud, which looks right.
- **Placement inside other galaxies, also for `universe.js`:** `buildSights`
  gives every non-black-hole sight in another galaxy its own seeded spot
  within `0.3 R` of the galaxy centre, ignoring the row's RA and Dec. So
  R136a1, which sits in the heart of the Tarantula Nebula, ends up tens of
  millions of units from it in game (the map lists them 77.9 Mu apart when
  parked at the Tarantula). Placing these rows by their own RA, Dec and `pc`
  would put them inside the LMC in the right relative spots.

---

## 6. What could not be verified

- The MPC's own grand total of minor planets (the counts above are JPL's).
- The number of galaxies in No Man's Sky (256, from the community wiki).
- Which exoplanet catalogue Universe Sandbox loads.
- The exact number of real systems in Elite Dangerous (about 150,000 per
  Wikipedia; Frontier's own figure was not found).
- Every fact marked * in sections 4 and 5.

---

## Sources

Counts of galaxies, stars and planets

- https://arxiv.org/abs/1607.03909 (Conselice et al. 2016; https://doi.org/10.3847/0004-637X/830/2/83)
- https://arxiv.org/abs/2011.03052 (Lauer et al. 2021)
- https://iopscience.iop.org/article/10.3847/1538-4357/abc881
- https://www.nasa.gov/missions/hubble/new-horizons-spacecraft-answers-question-how-dark-is-space/
- https://noirlab.edu/public/announcements/ann21001/
- https://arxiv.org/abs/2407.06273 (Postman et al. 2024)
- https://en.wikipedia.org/wiki/Galaxy
- https://en.wikipedia.org/wiki/Observable_universe
- https://en.wikipedia.org/wiki/Milky_Way
- https://www.eso.org/public/news/eso1204/
- https://arxiv.org/abs/1202.0903 (Cassan et al. 2012)
- https://ui.adsabs.harvard.edu/abs/2021AJ....161...36B/abstract (Bryson et al. 2021)
- https://www.nasa.gov/missions/kepler/about-half-of-sun-like-stars-could-host-rocky-potentially-habitable-planets/
- https://exoplanetarchive.ipac.caltech.edu/
- https://exoplanetarchive.ipac.caltech.edu/TAP/sync (queries run 2026-09-22)

Catalogues

- https://en.wikipedia.org/wiki/Messier_object
- https://en.wikipedia.org/wiki/New_General_Catalogue
- https://en.wikipedia.org/wiki/New_General_Catalogue#Index_Catalogue
- https://en.wikipedia.org/wiki/Caldwell_catalogue
- https://en.wikipedia.org/wiki/Uppsala_General_Catalogue
- https://en.wikipedia.org/wiki/Principal_Galaxies_Catalogue
- http://atlas.obs-hp.fr/hyperleda/intro.html
- https://www.aanda.org/articles/aa/abs/2014/10/aa23496-14/aa23496-14.html (Makarov et al. 2014)
- https://en.wikipedia.org/wiki/Sloan_Digital_Sky_Survey
- https://www.sdss.org/dr19/
- https://arxiv.org/abs/2503.14745 (DESI DR1)
- https://www.desi.lbl.gov/category/announcements/
- https://www.cosmos.esa.int/web/gaia/dr3
- https://www.cosmos.esa.int/web/gaia/release
- https://codeberg.org/astronexus/hyg
- https://github.com/astronexus/HYG-Database
- https://github.com/mattiaverga/OpenNGC
- https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/NGC.csv
- https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/addendum.csv
- https://minorplanetcenter.net/
- https://ssd-api.jpl.nasa.gov/sbdb_query.api

Reference games

- https://spaceengine.org/
- https://en.wikipedia.org/wiki/SpaceEngine
- https://en.wikipedia.org/wiki/Elite_Dangerous
- https://80.lv/articles/generating-the-universe-in-elite-dangerous
- https://www.elitedangerous.com/
- https://blog.playstation.com/archive/2014/08/26/exploring-18446744073709551616-planets-mans-sky/
- https://en.wikipedia.org/wiki/No_Man%27s_Sky
- https://nomanssky.fandom.com/wiki/Galaxy
- https://en.wikipedia.org/wiki/Celestia
- https://github.com/CelestiaProject/Celestia/blob/master/COPYING
- https://universesandbox.com/
- https://en.wikipedia.org/wiki/Universe_Sandbox
- https://en.wikipedia.org/wiki/Star_Citizen
- https://starcitizen.tools/Update:Star_Citizen_Release_1.0
- https://starcitizen.tools/Nyx_system

Solar System

- https://ssd.jpl.nasa.gov/planets/phys_par.html
- https://ssd.jpl.nasa.gov/planets/approx_pos.html
- https://ssd.jpl.nasa.gov/sats/phys_par/
- https://ssd.jpl.nasa.gov/sats/elem/
- https://ssd-api.jpl.nasa.gov/sbdb.api
- https://science.nasa.gov/mercury/facts/
- https://science.nasa.gov/venus/facts/
- https://science.nasa.gov/neptune/facts/
- https://science.nasa.gov/moon/facts/
- https://science.nasa.gov/mars/moons/phobos/
- https://science.nasa.gov/jupiter/jupiter-moons/europa/
- https://science.nasa.gov/jupiter/jupiter-moons/amalthea/
- https://science.nasa.gov/saturn/moons/tethys/
- https://science.nasa.gov/saturn/moons/dione/
- https://science.nasa.gov/uranus/moons/miranda/
- https://science.nasa.gov/jupiter/jupiter-moons/himalia/
- https://science.nasa.gov/saturn/moons/janus/
- https://science.nasa.gov/neptune/moons/larissa/
- https://en.wikipedia.org/wiki/Dysnomia_(moon)
- https://en.wikipedia.org/wiki/Haumea

View sites

- https://simbad.cds.unistra.fr/simbad/sim-tap (TAP queries run 2026-09-22)
- https://cds.unistra.fr/cgi-bin/nph-sesame (name resolution run 2026-09-22)
- https://people.smp.uq.edu.au/HolgerBaumgardt/globular/parameter.html
- https://arxiv.org/abs/0709.0485 (Menten et al. 2007, Orion)
- https://ui.adsabs.harvard.edu/abs/2006ApJ...644.1151S (Smith 2006, Eta Carinae)
- https://en.wikipedia.org/wiki/Horsehead_Nebula
- https://en.wikipedia.org/wiki/Lagoon_Nebula
- https://en.wikipedia.org/wiki/NGC_6302
- https://en.wikipedia.org/wiki/Rosette_Nebula
- https://en.wikipedia.org/wiki/North_America_Nebula
- https://arxiv.org/abs/2109.05368 (Fesen et al. 2021, Cygnus Loop)
- https://ui.adsabs.harvard.edu/abs/1995ApJ...440..706R (Reed et al. 1995, Cassiopeia A)
- https://ui.adsabs.harvard.edu/abs/1973PASP...85..579T (Trimble 1973, Crab)
- https://arxiv.org/abs/astro-ph/0302374 (Dodson et al. 2003, Vela)
- https://en.wikipedia.org/wiki/Stephenson_2-18
- https://ui.adsabs.harvard.edu/abs/2012ApJ...744...23Z (Zhang et al. 2012, VY CMa)
- https://arxiv.org/abs/1904.05721 (GRAVITY Collaboration 2019, Sagittarius A*)
- https://www.mpifr-bonn.mpg.de/pressreleases/2019/4 (EHT, M87*)
- https://doi.org/10.1038/s41586-019-0999-4 (Pietrzynski et al. 2019, LMC)
- https://arxiv.org/abs/2102.09091 (Miller-Jones et al. 2021, Cygnus X-1)
- https://ui.adsabs.harvard.edu/abs/2023MNRAS.518.1057E/abstract (El-Badry et al. 2023, Gaia BH1)
- https://arxiv.org/abs/2404.10486 (Gaia Collaboration 2024, Gaia BH3)
- https://iopscience.iop.org/article/10.3847/2041-8213/ad5a6f (NICER, PSR J0437-4715)
- https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1745-3933.2008.00453.x (Bibby et al. 2008, SGR 1806-20)
- https://iopscience.iop.org/article/10.3847/2041-8213/aba262 (Zhou et al. 2020, SGR 1935+2154)
- https://ui.adsabs.harvard.edu/abs/2013MNRAS.433..162Y (Yan et al. 2013, PSR B1257+12 parallax)
- https://ui.adsabs.harvard.edu/abs/2003ApJ...591L.147K/abstract (Konacki and Wolszczan 2003, the archive's 600 pc)
