// Who may hurt whom when two people share a sky.
//
// net.js starts from one rule: nothing from the network moves your hull. A hit
// is the only exception, and it is not taken on the shooter's word. The shooter
// says "I hit you"; your own client checks that claim against what it already
// knows - its own position, its own opt-in, and the shooter's last report of
// itself - and only then hurts itself and tells the room. The shooter never
// takes hull off anybody; the most it draws is a hit marker.
//
// What this cannot do is prove who sent a message. A broadcast room has no
// signatures, so a client that lies about where it is, or borrows another
// peer's id, gets past these checks as long as its lie is consistent, and one
// that makes up a fresh id every few shots gets a fresh rate gate with each.
// What it cannot do is hurt somebody who never opted in, from the other side
// of the system, from a room they are not in, faster than a gun fires under
// any one id, or harder than the hardest bolt in the game.
//
// Plain data only, so it runs in node without three or a page.

export const BOLT_SPEED = 4200;    // game.js fire(): 4200 u/s on top of the ship's own velocity
export const BOLT_LIFE = 2.2;      // and a player bolt lives 2.2 s
export const RANGE = BOLT_SPEED * BOLT_LIFE;
export const REACH_PAD = 600;      // your own hull, and slack for the gap between reports
export const LAG = 0.5;            // seconds of travel allowed for a report and a hit in flight
export const SPEED_CAP = 5e5;      // a claim of more buys no more range; cruise in open space can go
                                   // faster than this, and a hit between two ships doing so may be refused
export const LIVE = 1.5;           // a shooter quiet for longer than this is not shooting anybody
// Gel Pen 18 x (1 + 0.35 x 3 levels of sharper nibs) = 36.9, the hardest one
// bolt hits. A check in tools/test.mjs keeps this above every hull's bolt in SHIPS.
export const MAX_DMG = 40;
export const ROF = 1 / 0.12;       // fire(): one bolt every 0.12 s, whatever the hull
export const BURST = 4;            // hits the network can deliver bunched together

// A token bucket per shooter: it refills a quarter faster than any gun fires,
// so a real stream never trips it, and it holds a few, so a burst the network
// bunched up is still let through.
export class RateGate {
  constructor(rate = ROF * 1.25, burst = BURST) {
    this.rate = rate;
    this.burst = burst;
    this.b = new Map();
  }
  take(id, now) {
    let s = this.b.get(id);
    if (!s) { s = { n: this.burst, t: now }; this.b.set(id, s); }
    s.n = Math.min(this.burst, s.n + Math.max(0, now - s.t) * this.rate);
    s.t = Math.max(s.t, now);
    if (s.n < 1) return false;
    s.n -= 1;
    return true;
  }
}

const fin3 = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

// The victim's verdict on one hit report.
//   hit:     { id: shooter, to: victim, dmg, room }
//   me:      { id, pvp, pos: {x,y,z}, room, speed, alive }  - what this client knows is true
//   shooter: { pvp, pos: {x,y,z}, seen, speed, room } or null - its last report of itself
//   now:     the same clock `seen` is on, in seconds
//   gate:    a RateGate, spent only by a hit that passed everything else
// Returns { ok, why }, so a refusal can be read in a test or a console.
export function judgeHit(hit, { me, shooter, now, gate }) {
  if (!hit || typeof hit !== 'object') return { ok: false, why: 'malformed' };
  if (typeof hit.id !== 'string' || !hit.id) return { ok: false, why: 'malformed' };
  if (!Number.isFinite(hit.dmg) || hit.dmg <= 0 || hit.dmg > MAX_DMG) return { ok: false, why: 'malformed' };
  if (hit.id === me.id) return { ok: false, why: 'own' };
  if (hit.to !== me.id) return { ok: false, why: 'not for me' };
  if (!me.pvp) return { ok: false, why: 'you are not in pvp' };
  if (me.alive === false) return { ok: false, why: 'already down' };
  if (!shooter) return { ok: false, why: 'unknown shooter' };
  if (!(now - shooter.seen <= LIVE)) return { ok: false, why: 'shooter gone quiet' };
  if (!shooter.pvp) return { ok: false, why: 'shooter not in pvp' };
  if (hit.room !== me.room || (shooter.room || '') !== me.room) return { ok: false, why: 'other room' };
  if (!fin3(me.pos) || !fin3(shooter.pos)) return { ok: false, why: 'malformed' };
  // A bolt is at most RANGE from the gun that fired it, measured in that gun's
  // own frame, so what can grow the gap is how far either ship went since the
  // shooter last said where it was.
  const age = Math.max(0, now - shooter.seen);
  const v = Math.min(SPEED_CAP, Math.max(Number(shooter.speed) || 0, Number(me.speed) || 0));
  const reach = RANGE + REACH_PAD + v * (age + LAG);
  const d = Math.hypot(me.pos.x - shooter.pos.x, me.pos.y - shooter.pos.y, me.pos.z - shooter.pos.z);
  if (d > reach) return { ok: false, why: 'out of range' };
  if (gate && !gate.take(hit.id, now)) return { ok: false, why: 'too fast' };
  return { ok: true, why: '' };
}

// Did a bolt that moved from o to p this frame pass within r of c.
export function segSphere(ox, oy, oz, p, c, r) {
  const dx = p.x - ox, dy = p.y - oy, dz = p.z - oz;
  const fx = ox - c.x, fy = oy - c.y, fz = oz - c.z;
  const a = dx * dx + dy * dy + dz * dz;
  let t = a > 0 ? -(fx * dx + fy * dy + fz * dz) / a : 0;
  t = Math.max(0, Math.min(1, t));
  const x = fx + dx * t, y = fy + dy * t, z = fz + dz * t;
  return x * x + y * y + z * z < r * r;
}
