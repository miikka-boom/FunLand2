// Last Stop balance tool: `npm run outpost:balance` (or node outpost/tools/balance-sim.mjs).
// Simulates players (tools/player.mjs) over several seeds and prints the pacing
// night by night: how far they got, who goes out, the win rate, what they own
// and where the coins went. Options: --seeds N (default 20), --runs R (default 200).

import { simulate } from './player.mjs';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const SEEDS = arg('seeds', 20);
const RUNS = arg('runs', 200);

const med = (xs) => {
  const a = xs.filter((x) => x != null).sort((p, q) => p - q);
  return a.length ? a[Math.floor(a.length / 2)] : null;
};

const sims = [];
for (let s = 1; s <= SEEDS; s++) sims.push(simulate({ seed: s, runs: RUNS }));

const STARS = { rookie: 1, veteran: 2, hero: 3, legend: 4 };
const AT = [1, 2, 3, 5, 8, 10, 15, 20, 30, 40, 50, 60, 80, 100, 125, 150, 200, 250, 300, 400].filter((r) => r <= RUNS);
console.log(`Last Stop pacing: ${SEEDS} seeds, ${RUNS} nights played (medians)\n`);
console.log('Played  night  win% (last 10)  chance  out (stars Lv)  people  lots  decor  coins   earned   levels  homes  decor  land');
for (const r of AT) {
  const rows = sims.map((x) => x.rows[r - 1]);
  const m = (f) => med(rows.map(f));
  const win10 = med(sims.map((x) => x.rows.slice(Math.max(0, r - 10), r).filter((q) => q.win).length / Math.min(10, r)));
  const sp = (k) => m((q) => q.spent[k]);
  const earned = m((q) => q.earned);
  const pct = (v) => `${v} (${Math.round((v / Math.max(1, earned)) * 100)}%)`;
  console.log(
    `${String(r).padStart(6)}  ${String(m((q) => q.night)).padStart(5)}  ${String(Math.round(win10 * 100)).padStart(14)}  ${m((q) => q.chance).toFixed(2).padStart(6)}  ${`${m((q) => STARS[q.pickStars])}★ Lv ${m((q) => q.pickLv)}`.padStart(14)}  ${String(m((q) => q.people)).padStart(6)}  ${String(m((q) => q.lots)).padStart(4)}  ${String(m((q) => q.decor)).padStart(5)}  ${String(m((q) => q.coins)).padStart(5)}  ${String(earned).padStart(7)}  ${pct(sp('levels')).padStart(10)} ${pct(sp('homes')).padStart(10)} ${pct(sp('decor')).padStart(10)} ${pct(sp('land')).padStart(10)}`,
  );
}

console.log('\nFirst time (nights played, median; - = not yet):');
const keys = { home1: 'first new home', home3: 'three new homes', land1: 'first lot cleared', land4: 'five lots', fixedUp: 'station Fixed up', proud: 'station Proud', gold: 'station gold trim', legend: 'a Legend', lv10: 'someone at Lv 10', allLand: 'all 25 lots' };
for (const [k, name] of Object.entries(keys)) {
  const v = sims.map((x) => x.first[k]);
  const got = v.filter((x) => x != null).length;
  console.log(`  ${name.padEnd(20)} ${got ? String(med(v)).padStart(4) : '   -'}  (${got}/${SEEDS} seeds)`);
}
const wins = sims.map((x) => x.rows.filter((q) => q.win).length / x.rows.length);
console.log(`\nWin rate over all ${RUNS} nights: ${Math.round(med(wins) * 100)}%`);
