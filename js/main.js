// Entry point: boot the game and report anything that stops it on the start card.
import { Game } from './game.js';

const sub = document.getElementById('t-launch-sub');
function fail(e) {
  console.error(e);
  if (sub) sub.textContent = `could not start: ${e && e.message ? e.message : e}`;
}
try {
  const game = new Game(document.getElementById('gl'));
  game.boot((msg) => { if (sub) sub.textContent = msg; }).catch(fail);
} catch (e) {
  fail(e);
}
