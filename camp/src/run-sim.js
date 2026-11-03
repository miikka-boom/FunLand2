// Simulated run: stands in for the action game until the two are connected.
// It takes the RunLoadout the camp would hand the game and returns a
// RunResult in the shape the game should report back (docs/METAGAME.md).
// Pure and seeded, so outcomes are reproducible in tests.

import { WIN_CHANCE, RESOURCES, ZONES } from './config.js';
import { clamp, mulberry32, randInt, niceRound } from './util.js';

export function winChance(power, rec, wc = WIN_CHANCE) {
  return clamp(wc.atRec + (wc.slope * (power - rec)) / rec, wc.min, wc.max);
}

/** Rough label for a win chance, for the deploy screen. */
export function riskLabel(p) {
  if (p >= 0.85) return { text: 'Easy', tone: 'good' };
  if (p >= 0.7) return { text: 'Fair', tone: 'ok' };
  if (p >= 0.5) return { text: 'Risky', tone: 'warn' };
  return { text: 'Deadly', tone: 'bad' };
}

/**
 * @param {object} o
 * @param {object} o.zone       entry from ZONES
 * @param {object} o.loadout    Camp#loadout()
 * @param {'auto'|'win'|'lose'} [o.outcome]
 * @param {number} [o.seed]
 * @param {boolean} [o.firstClear]  a win pays the zone's first-clear gems
 * @param {boolean} [o.forceWin]    'auto' always wins (the very first run)
 * @param {number} [o.lootMult]     tuning multiplier
 */
export function simulateRun({ zone, loadout, outcome = 'auto', seed, firstClear = false, forceWin = false, lootMult = 1 }) {
  const rng = mulberry32(seed === undefined ? (Math.random() * 4294967296) >>> 0 : seed);
  const chance = winChance(loadout.power, zone.rec);
  let won;
  if (outcome === 'win') won = true;
  else if (outcome === 'lose') won = false;
  else won = forceWin || rng() < chance;

  const progress = won ? 1 : 0.15 + rng() * 0.75;
  const timeS = Math.round(zone.duration * (won ? 0.85 + rng() * 0.3 : progress * (0.8 + rng() * 0.3)));
  const kills = Math.round(zone.kills * (0.75 + rng() * 0.5) * (won ? 1 : 0.35 + 0.65 * progress));

  // A death still brings home part of what you found on the way.
  const keep = won ? 1 : 0.2 + 0.5 * progress;
  const loot = {};
  for (const r of RESOURCES) {
    const base = zone.loot[r] || 0;
    loot[r] = niceRound(base * keep * loadout.lootMult * lootMult * (0.85 + rng() * 0.3));
  }

  let gems = 0;
  const cleared = won && firstClear;
  if (cleared) gems += zone.firstGems;
  if (rng() < 0.06) gems += randInt(rng, 1, 3); // a lucky stash

  const rescued = won && rng() < zone.rescue + loadout.rescueBonus ? 1 : 0;
  const itemsUsed = { ...loadout.items };
  const events = runEvents(zone, won, progress, rescued, rng);

  return {
    zone: zone.id,
    won,
    progress,
    kills,
    timeS,
    loot,
    gems,
    firstClear: cleared,
    kept: keep,
    rescued,
    itemsUsed,
    events,
    power: loadout.power,
    chance,
  };
}

// --- Flavour for the run overlay ------------------------------------------------------------

const POOL = [
  { text: 'Horde incoming!', tone: 'warn', tier: 0 },
  { text: 'Shoved a crowd off the stairs', tone: 'ok', tier: 0 },
  { text: 'Found a supply cache', tone: 'good', tier: 0 },
  { text: 'Car alarm! Three waves', tone: 'warn', tier: 1 },
  { text: 'Hunter deadstopped mid-pounce', tone: 'good', tier: 1 },
  { text: 'Skeet! Hunter shot out of the air', tone: 'good', tier: 1 },
  { text: 'Pinned by a Hunter… broke free', tone: 'warn', tier: 1 },
  { text: 'TANK!', tone: 'bad', tier: 2 },
  { text: 'Kited the Tank around the block', tone: 'ok', tier: 2 },
  { text: 'Dodged a thrown rock', tone: 'ok', tier: 2 },
  { text: 'Pharmacy raided', tone: 'good', tier: 3 },
  { text: 'Barricade held. Just.', tone: 'warn', tier: 3 },
];

function runEvents(zone, won, progress, rescued, rng) {
  const tier = Math.max(0, ZONES.findIndex((z) => z.id === zone.id));
  const pool = POOL.filter((e) => e.tier <= tier);
  const n = 3 + Math.min(2, tier);
  const out = [{ at: 0.04, text: 'Left the safe room', tone: 'ok' }];
  const used = new Set();
  // Everything happens between leaving the safe room and the end of the run.
  const lo = 0.07;
  const hi = won ? 0.92 : progress - 0.02;
  for (let i = 0; i < n; i++) {
    let e = pool[Math.floor(rng() * pool.length)];
    for (let k = 0; k < 4 && used.has(e.text); k++) e = pool[Math.floor(rng() * pool.length)];
    used.add(e.text);
    const at = lo + ((i + rng() * 0.8) / n) * (hi - lo);
    out.push({ at, text: e.text, tone: e.tone });
  }
  if (rescued) out.push({ at: Math.min(0.9, 0.5 + rng() * 0.3), text: 'Rescued a survivor!', tone: 'good' });
  if (won) out.push({ at: 0.97, text: 'Safe room reached', tone: 'good' });
  else out.push({ at: progress, text: 'Overwhelmed…', tone: 'bad' });
  out.sort((a, b) => a.at - b.at);
  return out;
}
