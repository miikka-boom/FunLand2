// Simulated run: stands in for the action game until the two are connected. Input is
// what the meta hands the game (the run, the crew, power); output is the RunResult the
// game should report back (docs/STATION-9.md). Seeded and pure.

import { ODDS, ROLES } from './config.js';
import { clamp, mulberry32 } from './util.js';

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

export function starsFor(ratio, noise) {
  const q = ratio + noise;
  if (q >= ODDS.star3) return 3;
  if (q >= ODDS.star2) return 2;
  return 1;
}

const KILLS = { run: 50, rescue: 60, finale: 110 };
const DURATION = { run: 280, rescue: 310, finale: 400 };

/**
 * @param {object} o
 * @param {object} o.run      { name, type, tag, chain }
 * @param {object[]} o.crew   [{ id, first, role }], you first
 * @param {number} o.power
 * @param {number} o.rec
 * @param {'auto'|'win'|'lose'} [o.outcome]
 * @param {number} [o.seed]
 * @param {boolean} [o.forceWin]  the guided runs always make it, with 3 stars
 */
export function simulateRun({ run, crew, power, rec, outcome = 'auto', seed, forceWin = false }) {
  const rng = mulberry32(seed === undefined ? (Math.random() * 4294967296) >>> 0 : seed);
  const { ratio, chance } = odds(power, rec);
  let won;
  if (outcome === 'win') won = true;
  else if (outcome === 'lose') won = false;
  else won = forceWin || rng() < chance;
  const noise = (rng() - 0.5) * 2 * ODDS.noise;
  const stars = won ? (forceWin ? 3 : starsFor(ratio, noise)) : 0;
  const progress = won ? 1 : 0.25 + rng() * 0.65;
  const scale = 1 + (run.chain || 0) * 0.35;
  const kills = Math.round(KILLS[run.type] * scale * (0.8 + rng() * 0.4) * (won ? 1 : 0.3 + 0.7 * progress));
  const timeS = Math.round(DURATION[run.type] * (won ? 0.85 + rng() * 0.3 : progress * (0.8 + rng() * 0.3)));
  const events = story({ run, crew, won, stars, progress, rng });
  return { won, stars, progress, kills, timeS, ratio, chance, events, seed: seed ?? null };
}

// --- The story ticker ------------------------------------------------------------------------

const ROLE_LINES = {
  fighter: ['{a} held the door shut', '{a} cleared the corridor', '{a} shoved a runner off {b}', '{a} took down a Hunter mid-air'],
  scout: ['{a} found a shortcut', '{a} spotted the ambush first', '{a} found a stash of scrap', '{a} led everyone around the horde'],
  medic: ['{a} patched up {b} in a stairwell', '{a} got {b} back on their feet', '{a} found painkillers in a locker', '{a} kept everyone breathing'],
};

const FAVORED_LINES = {
  night: '{a} saw them coming in the dark',
  horde: '{a} stood in front of the whole horde',
  toxic: '{a} walked through the gas like it was nothing',
};

const TYPE_LINES = {
  run: ['Horde incoming!', 'Car alarm! Run!', 'Safe room door in sight'],
  rescue: ['Heard knocking upstairs', 'Found them! Now get out', 'Barricaded door: going round'],
  finale: ['TANK!', 'Here comes the horde!', 'Hold this room!'],
};

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function story({ run, crew, won, stars, progress, rng }) {
  const out = [{ at: 0.03, text: 'Out of the safe room', tone: 'ok' }];
  const end = won ? 0.94 : progress - 0.02;
  const favored = crew.filter((c) => ROLES[c.role].tag === run.tag);
  for (let k = 0; k < 4; k++) {
    let text;
    let tone = 'ok';
    let who = null;
    if (k % 2 === 0 && crew.length) {
      const a = k === 0 && favored.length ? favored[Math.floor(rng() * favored.length)] : crew[Math.floor(rng() * crew.length)];
      const b = crew.find((c) => c !== a) || null;
      const line = k === 0 && favored.includes(a) ? FAVORED_LINES[run.tag] : pick(rng, ROLE_LINES[a.role]);
      text = line.replace('{a}', a.first).replace('{b}', b ? b.first : 'the others');
      tone = 'good';
      who = a.id;
    } else {
      text = pick(rng, TYPE_LINES[run.type] || TYPE_LINES.run);
      tone = text.includes('TANK') || text.includes('!') ? 'warn' : 'ok';
    }
    out.push({ at: 0.08 + ((k + 0.3 + rng() * 0.5) / 4) * (end - 0.08), text, tone, who });
  }
  if (won) {
    if (run.type === 'finale') out.push({ at: 0.9, text: 'The Tank is down!', tone: 'good' });
    if (run.type === 'rescue') out.push({ at: 0.86, text: 'Got the survivor. Heading home', tone: 'good' });
    out.push({ at: 0.97, text: stars === 3 ? 'Flawless. Everyone made it.' : 'Safe room reached', tone: 'good' });
  } else out.push({ at: progress, text: 'Overwhelmed... fall back!', tone: 'bad' });
  const seen = new Set();
  return out.filter((e) => (seen.has(e.text) ? false : (seen.add(e.text), true))).sort((a, b) => a.at - b.at);
}
