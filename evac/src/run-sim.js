// Simulated run: stands in for the action game until the two are connected.
// Input is what the meta hands the game (chapter, squad, power); output is
// the RunResult the game should report back (docs/METAGAME.md). Seeded and
// pure, so it is reproducible in tests.

import { ODDS, SURVIVORS } from './config.js';
import { clamp, mulberry32, randInt } from './util.js';

export function odds(power, rec) {
  const ratio = rec > 0 ? power / rec : 2;
  return { ratio, chance: clamp(ODDS.atRec + ODDS.slope * (ratio - 1), ODDS.min, ODDS.max) };
}

export function riskOf(chance) {
  if (chance >= 0.85) return { label: 'Easy', tone: 'good' };
  if (chance >= 0.65) return { label: 'Fair', tone: 'ok' };
  if (chance >= 0.45) return { label: 'Hard', tone: 'warn' };
  return { label: 'Deadly', tone: 'bad' };
}

/** Stars for a survived run, from how far power was above the recommendation. */
export function starsFor(ratio, noise) {
  const q = ratio + noise;
  if (q >= ODDS.star3) return 3;
  if (q >= ODDS.star2) return 2;
  return 1;
}

function gauss(rng) {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const KILLS = { run: 60, horde: 110, rescue: 75, finale: 140 };
const DURATION = { run: 300, horde: 330, rescue: 320, finale: 420 };

/**
 * @param {object} o
 * @param {number} o.index        chapter index on the road
 * @param {object} o.chapter      chapter definition (type, name)
 * @param {number} o.campaign     campaign index (0-4)
 * @param {number} o.power
 * @param {number} o.rec
 * @param {string[]} o.squad      survivor ids, you first
 * @param {'auto'|'win'|'lose'} [o.outcome]
 * @param {number} [o.seed]
 * @param {boolean} [o.forceWin]  the very first run always makes it, with 3 stars
 * @param {number} [o.friends]    simulated co-op friends in the squad
 */
export function simulateRun({ index, chapter, campaign = 0, power, rec, squad, outcome = 'auto', seed, forceWin = false, friends = 0 }) {
  const rng = mulberry32(seed === undefined ? (Math.random() * 4294967296) >>> 0 : seed);
  const { ratio, chance } = odds(power, rec);
  let won;
  if (outcome === 'win') won = true;
  else if (outcome === 'lose') won = false;
  else won = forceWin || rng() < chance;

  const stars = won ? (forceWin ? 3 : starsFor(ratio, gauss(rng) * ODDS.noise)) : 0;
  const progress = won ? 1 : 0.2 + rng() * 0.72;
  const type = chapter.type;
  const scale = 1 + campaign * 0.35;
  const kills = Math.round(KILLS[type] * scale * (0.8 + rng() * 0.4) * (won ? 1 : 0.3 + 0.7 * progress));
  const timeS = Math.round(DURATION[type] * (won ? 0.85 + rng() * 0.3 : progress * (0.8 + rng() * 0.3)));
  const incaps = won ? (stars === 3 ? 0 : stars === 2 ? randInt(rng, 0, 1) : randInt(rng, 1, 3)) : randInt(rng, 2, 4);
  const events = story({ chapter, squad, won, stars, progress, rng });

  return { index, won, stars, progress, kills, timeS, incaps, ratio, chance, events, friends, seed: seed ?? null };
}

// --- The story ticker ---------------------------------------------------------------------------

const SQUAD_LINES = {
  rook: ['{a} deadstopped a Hunter mid-pounce', '{a} found a shortcut through a laundromat', '{a} kited the horde around a bus'],
  doc: ['{a} patched everyone up in a stairwell', '{a} revived {b} under fire', '{a} found painkillers in a locker'],
  mags: ['{a} held the corridor alone', '{a} shot a Hunter out of the air', '{a} cleared a rooftop in three shots'],
  sparks: ['{a} rigged a pipe bomb: fourteen down', '{a} hotwired the gate', '{a} jammed the car alarm before it went off'],
  juno: ['{a} found a hidden supply cache', '{a} spotted the Tank first', '{a} picked a lock to a pantry'],
};

const TYPE_LINES = {
  run: ['Horde incoming!', 'Car alarm! Run!', 'Safe room door in sight'],
  horde: ['Wave one... two... three', 'They are coming over the barricade!', 'Hold the line!'],
  rescue: ['Found the stash', 'Ammo pile!', 'Barricaded door: going round'],
  finale: ['TANK!', 'Here comes the horde!', 'Rescue is on its way'],
};

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function story({ chapter, squad, won, stars, progress, rng }) {
  const names = squad.map((id) => SURVIVORS[id].name);
  const out = [{ at: 0.03, text: 'Out of the safe room', tone: 'ok' }];
  const end = won ? 0.94 : progress - 0.02;
  const n = 4;
  const used = new Set();
  for (let k = 0; k < n; k++) {
    let text;
    let tone = 'ok';
    if (k % 2 === 0 && squad.length) {
      const who = Math.floor(rng() * squad.length);
      const other = names[(who + 1) % names.length];
      text = pick(rng, SQUAD_LINES[squad[who]]).replace('{a}', names[who]).replace('{b}', other);
      tone = 'good';
    } else {
      text = pick(rng, TYPE_LINES[chapter.type]);
      tone = text.includes('TANK') || text.includes('!') ? 'warn' : 'ok';
    }
    if (used.has(text)) continue;
    used.add(text);
    out.push({ at: 0.08 + ((k + 0.3 + rng() * 0.5) / n) * (end - 0.08), text, tone });
  }
  if (won) {
    if (chapter.type === 'finale') out.push({ at: 0.9, text: 'The Tank is down!', tone: 'good' });
    out.push({ at: 0.97, text: stars === 3 ? 'Flawless. Everyone made it.' : 'Safe room reached', tone: 'good' });
  } else out.push({ at: progress, text: 'Overwhelmed...', tone: 'bad' });
  const seen = new Set();
  return out
    .filter((e) => (seen.has(e.text) ? false : (seen.add(e.text), true)))
    .sort((a, b) => a.at - b.at);
}
