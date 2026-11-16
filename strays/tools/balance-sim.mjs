// Strays balance tool: how do the first days go for three kinds of player?
//   npm run strays:balance            (default tuning, 60 blocks each)
//   npm run strays:balance -- 200     (more blocks)
//   npm run strays:balance -- 60 needHero=20 hungerMin=120   (try a change)

import { playDays, HABITS } from './player.mjs';
import { DEFAULT_TUNING, KINDS, KIND_BY_ID, ROOMS } from '../src/config.js';

const args = process.argv.slice(2);
const blocks = Number(args.find((a) => /^\d+$/.test(a))) || 60;
const tuning = {};
for (const a of args) {
  const m = /^(\w+)=(.+)$/.exec(a);
  if (!m) continue;
  if (!(m[1] in DEFAULT_TUNING)) {
    console.error(`unknown tuning key: ${m[1]}`);
    process.exit(1);
  }
  tuning[m[1]] = m[2].includes(',') ? m[2].split(',').map(Number) : Number(m[2]);
}

const median = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};
const fmt = (h) => {
  if (h == null) return '   -  ';
  if (h < 1) return `${Math.round(h * 60)}m`.padStart(6);
  if (h < 48) return `${h.toFixed(1)}h`.padStart(6);
  return `${(h / 24).toFixed(1)}d`.padStart(6);
};

console.log(`Strays balance: ${blocks} blocks per habit, 14 days each` + (Object.keys(tuning).length ? `, with ${JSON.stringify(tuning)}` : ''));
console.log('Times are since the first tap (m minutes, h hours, d days). Medians.\n');

for (const habit of Object.keys(HABITS)) {
  const runs = [];
  for (let seed = 1; seed <= blocks; seed++) runs.push(playDays(seed * 7919, habit, 14, tuning));
  const col = (get) => fmt(median(runs.map(get)));
  console.log(`== ${habit}: picks it up at ${HABITS[habit].hours.join(', ')}h, ${HABITS[habit].minutes} min a time (first time ${HABITS[habit].first} min)`);
  console.log('  nth somebody shown :' + Array.from({ length: ROOMS }, (_, i) => col((r) => r.shown[i])).join(''));
  console.log('  nth room opened    :' + Array.from({ length: ROOMS }, (_, i) => col((r) => r.rooms[i])).join(''));
  console.log('  nth hero           :' + Array.from({ length: ROOMS }, (_, i) => col((r) => r.heroes[i])).join(''));
  console.log(`  full house ${col((r) => r.full)}   all heroes ${col((r) => r.allHeroes)}   finished ${runs.filter((r) => r.allHeroes != null).length}/${blocks}`);
  console.log(
    `  per block: trips ${median(runs.map((r) => r.trips))}, cans found ${median(runs.map((r) => r.found))}, meals ${median(runs.map((r) => r.meals))}, ` +
      `bonks ${median(runs.map((r) => r.bonks))}, sittings with nothing to do ${median(runs.map((r) => r.dry))}/${median(runs.map((r) => r.sittings))}`,
  );
  console.log('');
}

// Who turns up? (The first twelve of eighteen, by rarity.)
const seen = Object.fromEntries(KINDS.map((k) => [k.id, 0]));
const n = 400;
for (let seed = 1; seed <= n; seed++) for (const k of playDays(seed * 104729, 'binge', 14, tuning).kinds) seen[k]++;
console.log(`Who moves in (share of ${n} finished blocks that have one):`);
for (const r of ['common', 'rare', 'epic', 'secret']) {
  const row = KINDS.filter((k) => k.rarity === r).map((k) => `${k.name.toLowerCase()} ${Math.round((100 * seen[k.id]) / n)}%`);
  console.log(`  ${r.padEnd(7)} ${row.join(', ')}`);
}
void KIND_BY_ID;
