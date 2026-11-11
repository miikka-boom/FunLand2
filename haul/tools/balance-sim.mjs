// Long Haul balance tool: `npm run haul:balance` (or node haul/tools/balance-sim.mjs).
// Simulates players (tools/player.mjs) over several seeds and prints the
// pacing: when each stop on the road opens and how the runs go there, a table
// per day, who answers the radio and when, and where the supplies go.
// Options: --seeds N (default 20), --days D (default 10), --sessions S (4),
// --runs R (4 per session), --lazy (never levels up or changes the squad).

import { simulate, AREAS, CAST } from './player.mjs';
import { CAST_ORDER, RACK_SIZE, FERRY_STARS } from '../src/config.js';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const flag = (name) => process.argv.includes(`--${name}`);
const SEEDS = arg('seeds', 20);
const DAYS = arg('days', 10);
const SESSIONS = arg('sessions', 4);
const RUNS = arg('runs', 4);
const LAZY = flag('lazy');

const sorted = (xs) => xs.filter((x) => x != null).sort((a, b) => a - b);
const med = (xs) => {
  const a = sorted(xs);
  return a.length ? a[Math.floor(a.length / 2)] : null;
};
const lo = (xs) => sorted(xs)[0];
const hi = (xs) => sorted(xs).slice(-1)[0];
const f1 = (v) => (v == null ? '-' : v.toFixed(1));
const pad = (v, n) => String(v).padStart(n);

const sims = [];
for (let s = 1; s <= SEEDS; s++) sims.push(simulate({ seed: s, days: DAYS, sessions: SESSIONS, runs: RUNS, lazy: LAZY }));

console.log(`Long Haul pacing: ${SEEDS} seeds, ${DAYS} days of ${SESSIONS} sessions x ${RUNS} runs${LAZY ? ' (lazy: never levels up)' : ''}\n`);

console.log('Stop                 opens at run (day)      stars a run on arrival   on leaving');
for (let a = 0; a < AREAS.length; a++) {
  const arr = sims.map((x) => (a === 0 ? { run: 0, day: 1, expected: x.rows[0].expected } : x.arrivals.find((q) => q.area === a)));
  const got = arr.filter(Boolean);
  const runs = got.map((q) => q.run);
  const left = sims.map((x) => (x.arrivals.some((q) => q.area === a + 1) ? x.leaving[a] : null));
  const where = got.length ? `${pad(med(runs), 3)} (${lo(runs)}-${hi(runs)}) day ${med(got.map((q) => q.day))}` : '  -';
  console.log(`${`${a + 1} ${AREAS[a].name}`.padEnd(20)} ${where.padEnd(23)} ${f1(med(got.map((q) => q.expected))).padStart(5)}                    ${f1(med(left)).padStart(5)}   (${got.length}/${SEEDS} seeds)`);
}
const ferry = sims.map((x) => x.first.ferry);
console.log(`${'  the ferry'.padEnd(20)} ${ferry.some((v) => v != null) ? `${pad(med(ferry), 3)} (${lo(ferry)}-${hi(ferry)})` : '  -'}   (${ferry.filter((v) => v != null).length}/${SEEDS} seeds, ${FERRY_STARS} stars)`);

console.log('\nDay  runs  stop  stars  people  squad Lv  earned  spent  in hand  bars waiting  radios  calls  runs by stars 0/1/2/3');
for (let d = 0; d < DAYS; d++) {
  const rows = sims.map((x) => x.dayRows[d]);
  const m = (f) => med(rows.map(f));
  console.log(
    `${pad(d + 1, 3)}  ${pad(m((q) => q.runs), 4)}  ${pad(m((q) => q.area) + 1, 4)}  ${pad(m((q) => q.stars), 5)}  ${pad(m((q) => q.people), 6)}  ${pad(f1(m((q) => q.squadLv)), 8)}  ${pad(m((q) => q.earned), 6)}  ${pad(m((q) => q.spent), 5)}  ${pad(m((q) => q.supplies), 7)}  ${pad(m((q) => q.ready), 12)}  ${pad(m((q) => q.radios), 6)}  ${pad(m((q) => q.calls), 5)}  ${[0, 1, 2, 3].map((k) => m((q) => q.byStars[k])).join('/')}`,
  );
}

console.log('\nWho answers the radio (median call number and day; found in N seeds):');
for (const id of CAST_ORDER) {
  const f = sims.map((x) => x.found[id]).filter(Boolean);
  const c = CAST[id];
  if (!f.length) {
    console.log(`  ${c.name.padEnd(20)} ${c.rarity.padEnd(10)} ${sims[0].state.cast[id] && !sims[0].found[id] ? 'in the camp from the start' : `not found (voice at stop ${c.area + 1})`}`);
    continue;
  }
  console.log(`  ${c.name.padEnd(20)} ${c.rarity.padEnd(10)} call ${pad(med(f.map((q) => q.call)), 3)}  day ${pad(med(f.map((q) => q.day)), 2)}  (${f.length}/${SEEDS})`);
}

console.log('\nFirst time (run number, median):');
const keys = { levelUp: 'a level-up', radio: 'a radio in a crate', newcomer: 'someone new', epic: 'an Epic', legendary: 'the Legendary', lv10: 'someone at Lv 10' };
for (const [k, name] of Object.entries(keys)) {
  const v = sims.map((x) => x.first[k]);
  const got = v.filter((x) => x != null).length;
  console.log(`  ${name.padEnd(20)} ${got ? pad(med(v), 4) : '   -'}  (${got}/${SEEDS} seeds)`);
}

const total = DAYS * SESSIONS * RUNS;
console.log(`\nRack full (${RACK_SIZE} radios, so no radio in the crates) on ${Math.round((med(sims.map((x) => x.rackFull)) / total) * 100)}% of runs`);
console.log(`A full bar in the squad waiting for supplies on ${Math.round((med(sims.map((x) => x.short)) / total) * 100)}% of runs`);
const all = sims.flatMap((x) => x.rows);
console.log(`Stars a run over everything: ${f1(all.reduce((a, r) => a + r.stars, 0) / all.length)}; nobody standing on ${Math.round((all.filter((r) => r.stars === 0).length / all.length) * 100)}% of runs`);
