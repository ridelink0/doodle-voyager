// The PvP hit rules, checked in node with no browser: js/pvp.js is plain data.
// tools/test.mjs runs these first; `node tools/pvp-checks.mjs` runs them alone.
// Every case changes one thing about a hit that is otherwise good, so each
// check fails if the rule it names is taken out of judgeHit.
import { fileURLToPath } from 'node:url';
import { judgeHit, RateGate, RANGE, REACH_PAD, LAG, LIVE, BURST, ROF, MAX_DMG, SPEED_CAP } from '../js/pvp.js';

export function pvpChecks(check) {
  const base = () => ({
    hit: { id: 'p-s', to: 'p-v', dmg: 12, room: 'R' },
    me: { id: 'p-v', pvp: true, pos: { x: 0, y: 0, z: 0 }, room: 'R', speed: 0, alive: true },
    shooter: { pvp: true, pos: { x: 3000, y: 0, z: 0 }, seen: 10, speed: 0, room: 'R' },
    now: 10.1,
  });
  // A rule that throws on bad input instead of refusing it is a failure too.
  const run = (edit) => {
    const c = base();
    if (edit) edit(c);
    try { return judgeHit(c.hit, { me: c.me, shooter: c.shooter, now: c.now, gate: c.gate || new RateGate() }); }
    catch (e) { return { ok: false, why: `threw ${e.message}` }; }
  };
  const said = (v) => `${v.ok ? 'taken' : 'refused'}${v.why ? ` (${v.why})` : ''}`;

  const good = run();
  check('pvp: a hit from an opted-in, live peer in range and in the room is taken', good.ok, said(good));

  const meOff = run((c) => { c.me.pvp = false; });
  const themOff = run((c) => { c.shooter.pvp = false; });
  check('pvp: you are only shot if you opted in', !meOff.ok && meOff.why === 'you are not in pvp', said(meOff));
  check('pvp: and only by somebody who opted in too', !themOff.ok && themOff.why === 'shooter not in pvp', said(themOff));

  const nobody = run((c) => { c.shooter = null; });
  const quiet = run((c) => { c.now = c.shooter.seen + LIVE + 0.3; });
  check('pvp: a shooter who is not in the room cannot hit you', !nobody.ok && nobody.why === 'unknown shooter', said(nobody));
  check(`pvp: nor one that has not reported for more than ${LIVE} s`, !quiet.ok && quiet.why === 'shooter gone quiet', said(quiet));

  const hitRoom = run((c) => { c.hit.room = 'Q'; });
  const theirRoom = run((c) => { c.shooter.room = 'Q'; });
  check('pvp: a hit sent from another room is refused, whatever room the shooter says it is in',
    !hitRoom.ok && hitRoom.why === 'other room' && !theirRoom.ok && theirRoom.why === 'other room', `${said(hitRoom)}, ${said(theirRoom)}`);

  const far = run((c) => { c.shooter.pos.x = RANGE + REACH_PAD + 400; });
  const edge = run((c) => { c.shooter.pos.x = RANGE + REACH_PAD - 100; });
  check(`pvp: a hit from past a bolt's reach (${RANGE + REACH_PAD} u) of where the shooter last was is refused`,
    !far.ok && far.why === 'out of range' && edge.ok, `${said(far)} at ${RANGE + REACH_PAD + 400} u, ${said(edge)} at ${RANGE + REACH_PAD - 100} u`);
  // The allowance is how far either ship could have gone since the shooter's
  // last report: a fast shooter just past the static reach is still believed,
  // and claiming an absurd speed buys no more than the cap.
  const fast = run((c) => { c.shooter.speed = 20000; c.shooter.pos.x = RANGE + REACH_PAD + 5000; });
  const liar = run((c) => { c.shooter.speed = 1e12; c.shooter.pos.x = RANGE + REACH_PAD + SPEED_CAP * (0.1 + LAG) + 1000; });
  check('pvp: the range allows for how fast the ships are going, up to a cap',
    fast.ok && !liar.ok && liar.why === 'out of range', `${said(fast)} at 20000 u/s, ${said(liar)} claiming 1e12 u/s`);

  // rate of fire: one gate, one shooter
  const burst = (() => { const gate = new RateGate(); let n = 0; for (let i = 0; i < 30; i++) if (run((c) => { c.gate = gate; }).ok) n++; return n; })();
  // and a shooter who held fire for a while has not saved up a bigger burst
  const saved = (() => {
    const gate = new RateGate(); let n = 0;
    run((c) => { c.gate = gate; });
    for (let i = 0; i < 30; i++) if (run((c) => { c.gate = gate; c.now = 30; c.shooter.seen = 30; }).ok) n++;
    return n;
  })();
  const stream = (dt, secs) => {
    const gate = new RateGate(); let n = 0, sent = 0;
    for (let t = 0; t < secs; t += dt) { sent++; if (run((c) => { c.gate = gate; c.now = 10 + t; c.shooter.seen = 10 + t; }).ok) n++; }
    return { n, sent };
  };
  const honest = stream(0.12, 5), spray = stream(0.02, 5);
  const cap = Math.ceil(5 * ROF * 1.25) + BURST;
  check(`pvp: thirty hits arriving at once are cut to ${BURST}, even after 20 s of holding fire`,
    burst === BURST && saved === BURST, `${burst} of 30 taken fresh, ${saved} of 30 after holding fire`);
  check('pvp: a gun firing as fast as the game lets it is never cut',
    honest.n === honest.sent, `${honest.n} of ${honest.sent} taken at one per 0.12 s`);
  check(`pvp: one hit every 0.02 s for 5 s is cut to at most ${cap}`,
    spray.n <= cap && spray.n >= cap - BURST - 2, `${spray.n} of ${spray.sent} taken`);
  const fair = (() => {
    const gate = new RateGate();
    for (let i = 0; i < 10; i++) run((c) => { c.gate = gate; c.shooter.pos.x = 1e6; });   // refused for range
    for (let i = 0; i < 10; i++) run((c) => { c.gate = gate; c.hit.id = 'p-other'; });      // another shooter
    return run((c) => { c.gate = gate; });
  })();
  check('pvp: the cap is per shooter, and a hit refused for anything else does not spend it', fair.ok, said(fair));

  const junk = [
    ['null', null], ['a string', 'hit'], ['no id', { to: 'p-v', dmg: 12, room: 'R' }], ['id not a string', { id: 7, to: 'p-v', dmg: 12, room: 'R' }],
    ['dmg NaN', { id: 'p-s', to: 'p-v', dmg: NaN, room: 'R' }], ['dmg a string', { id: 'p-s', to: 'p-v', dmg: '12', room: 'R' }],
    ['dmg zero', { id: 'p-s', to: 'p-v', dmg: 0, room: 'R' }], ['dmg negative (a heal)', { id: 'p-s', to: 'p-v', dmg: -50, room: 'R' }],
    [`dmg over ${MAX_DMG}`, { id: 'p-s', to: 'p-v', dmg: MAX_DMG + 1, room: 'R' }],
  ].map(([what, hit]) => [what, run((c) => { c.hit = hit; })]);
  const let_through = junk.filter(([, v]) => v.ok || v.why !== 'malformed').map(([w, v]) => `${w}: ${said(v)}`);
  check('pvp: malformed hits are refused, including a negative one that would heal',
    let_through.length === 0, let_through.join('; ') || `${junk.length} kinds refused`);
  const nanPos = run((c) => { c.shooter.pos.x = NaN; });
  check('pvp: a shooter whose last position is not a number is not in range of anything', !nanPos.ok, said(nanPos));

  const own = run((c) => { c.hit.id = 'p-v'; });
  const other = run((c) => { c.hit.to = 'p-x'; });
  const down = run((c) => { c.me.alive = false; });
  check('pvp: your own hit report is ignored', !own.ok && own.why === 'own', said(own));
  check('pvp: a hit addressed to somebody else is not applied to you', !other.ok && other.why === 'not for me', said(other));
  check('pvp: a hull that is already down takes no more', !down.ok && down.why === 'already down', said(down));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let failed = 0, n = 0;
  pvpChecks((name, ok, detail = '') => { n++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); });
  console.log(`\n${n - failed}/${n} passed`);
  process.exit(failed ? 1 : 0);
}
