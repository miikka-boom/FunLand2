// Simulated run: stands in for the action game until the two are connected.
// Input is what the meta hands the game (the run, the crew, power); output is the
// RunResult the game should report back (docs/HOPE-STREET.md). Seeded and pure.
// The story ticker is written from the crew's own names, roles and traits.

import { ODDS, TRAITS } from './config.js';
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

const KILLS = { run: 60, rescue: 70, finale: 130, scavenge: 50 };
const DURATION = { run: 300, rescue: 330, finale: 420, scavenge: 260 };

/**
 * @param {object} o
 * @param {object} o.run      { key, name, type, tags, chain }
 * @param {object[]} o.crew   [{ id, first, role, traits }], the one you play first
 * @param {number} o.power
 * @param {number} o.rec
 * @param {'auto'|'win'|'lose'} [o.outcome]
 * @param {number} [o.seed]
 * @param {boolean} [o.forceWin]  the very first run always makes it, with 3 stars
 * @param {number} [o.friends]
 */
export function simulateRun({ run, crew, power, rec, outcome = 'auto', seed, forceWin = false, friends = 0 }) {
  const rng = mulberry32(seed === undefined ? (Math.random() * 4294967296) >>> 0 : seed);
  const { ratio, chance } = odds(power, rec);
  let won;
  if (outcome === 'win') won = true;
  else if (outcome === 'lose') won = false;
  else won = forceWin || rng() < chance;

  const stars = won ? (forceWin ? 3 : starsFor(ratio, gauss(rng) * ODDS.noise)) : 0;
  const progress = won ? 1 : 0.2 + rng() * 0.72;
  const scale = 1 + (run.chain || 0) * 0.3;
  const kills = Math.round(KILLS[run.type] * scale * (0.8 + rng() * 0.4) * (won ? 1 : 0.3 + 0.7 * progress));
  const timeS = Math.round(DURATION[run.type] * (won ? 0.85 + rng() * 0.3 : progress * (0.8 + rng() * 0.3)));
  // Who went down: everyone in a wipe gets hurt badly; the game reports these ids.
  const ids = crew.map((c) => c.id);
  let downed = [];
  if (!won) {
    const n = Math.min(ids.length, randInt(rng, 1, 2));
    const pool = ids.slice();
    for (let k = 0; k < n; k++) downed.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  const events = story({ run, crew, won, stars, progress, downed, rng });
  // Share of the kills per person, for their record.
  const share = crew.map(() => 0.5 + rng());
  const total = share.reduce((a, b) => a + b, 0) + friends * 1.2;
  const killsBy = Object.fromEntries(crew.map((c, k) => [c.id, Math.round((kills * share[k]) / (total || 1))]));
  return { key: run.key, won, stars, progress, kills, killsBy, timeS, downed, ratio, chance, events, friends, seed: seed ?? null };
}

// --- The story ticker ------------------------------------------------------------------------

const ROLE_LINES = {
  bruiser: ['{a} held the door shut with one shoulder', '{a} shoved a runner off {b}', '{a} broke through a barricade', '{a} body-checked a Charger. Somehow.'],
  shooter: ['{a} held the corridor', '{a} dropped a Hunter mid-air', '{a} cleared the rooftop in three shots', '{a} covered {b} all the way'],
  medic: ['{a} patched up {b} in a stairwell', '{a} got {b} back on their feet', '{a} found painkillers in a locker', '{a} stopped the bleeding. Barely.'],
  scout: ['{a} found a shortcut', '{a} spotted the ambush first', '{a} found a hidden stash', '{a} led them around the horde'],
  mechanic: ['{a} rigged a pipe bomb: fourteen down', '{a} hotwired the gate', '{a} jammed a car alarm before it went off', '{a} got the lights back on'],
};

const TRAIT_LINES = {
  nightOwl: '{a} saw them coming in the dark',
  steady: '{a} never flinched',
  tunnelRat: '{a} knew every crawlspace',
  ironLungs: '{a} breathed the smoke like nothing',
  tinkerer: '{a} turned a fuse box into a trap',
  lucky: '{a} tripped over a box of scrap',
  quick: '{a} figured out the trick on the way',
  tough: '{a} shrugged off a bite to the jacket',
  leader: '{a} kept everyone together',
  loud: '{a} knocked over a shelf. They heard that.',
  claustro: '{a} hates small rooms. This one was small.',
  squeamish: '{a} gagged on the smell. Loudly.',
  clumsy: '{a} tripped. Again.',
  stubborn: '{a} insisted on the long way',
};

const TYPE_LINES = {
  run: ['Horde incoming!', 'Car alarm! Run!', 'Safe room door in sight'],
  rescue: ['Heard knocking upstairs', 'Found them! Now get out', 'Barricaded door: going round'],
  finale: ['TANK!', 'Here comes the horde!', 'Hold this room!'],
  scavenge: ['Bags full. Time to go', 'Found a stash', 'Too many of them. Move!'],
};

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function story({ run, crew, won, stars, progress, downed, rng }) {
  const out = [{ at: 0.03, text: 'Out of the safe room', tone: 'ok' }];
  const end = won ? 0.94 : progress - 0.02;
  const n = 4;
  for (let k = 0; k < n; k++) {
    let text;
    let tone = 'ok';
    let who = null;
    if (k % 2 === 0 && crew.length) {
      const a = crew[Math.floor(rng() * crew.length)];
      const b = crew.length > 1 ? crew.find((c) => c !== a && rng() < 0.6) || crew.find((c) => c !== a) : null;
      // A trait gets its line when it matters on this run (tag traits only on their tag).
      const traitLine = a.traits.find((t) => TRAIT_LINES[t] && TRAITS[t] && (!TRAITS[t].tag || run.tags.includes(TRAITS[t].tag)));
      const line = traitLine && rng() < 0.6 ? TRAIT_LINES[traitLine] : pick(rng, ROLE_LINES[a.role]);
      text = line.replace('{a}', a.first).replace('{b}', b ? b.first : 'the others');
      tone = traitLine && TRAITS[traitLine] && !TRAITS[traitLine].good && line === TRAIT_LINES[traitLine] ? 'warn' : 'good';
      who = a.id;
    } else {
      text = pick(rng, TYPE_LINES[run.type]);
      tone = text.includes('TANK') || text.includes('!') ? 'warn' : 'ok';
    }
    out.push({ at: 0.08 + ((k + 0.3 + rng() * 0.5) / n) * (end - 0.08), text, tone, who });
  }
  if (won) {
    if (run.type === 'finale') out.push({ at: 0.9, text: 'The Tank is down!', tone: 'good' });
    if (run.type === 'rescue') out.push({ at: 0.86, text: 'Got the survivor. Heading home', tone: 'good' });
    out.push({ at: 0.97, text: stars === 3 ? 'Flawless. Everyone made it.' : 'Safe room reached', tone: 'good' });
  } else {
    const names = downed.map((id) => crew.find((c) => c.id === id)).filter(Boolean).map((c) => c.first);
    if (names.length) out.push({ at: Math.max(0.05, progress - 0.04), text: `${names.join(' and ')} went down!`, tone: 'bad', downed: downed.slice() });
    out.push({ at: progress, text: 'Overwhelmed...', tone: 'bad' });
  }
  const seen = new Set();
  return out.filter((e) => (seen.has(e.text) ? false : (seen.add(e.text), true))).sort((a, b) => a.at - b.at);
}
