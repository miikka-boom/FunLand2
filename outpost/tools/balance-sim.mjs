// Last Stop balance tool: `npm run outpost:balance` (or node outpost/tools/balance-sim.mjs).
// Simulates players over several seeds and prints the town's pacing day by
// day, then checks it against Thrill Hill's own simulated player: squad level
// and zone days should stay within ±5%, and land should take 25–35% of coins.
// Options: --seeds N (default 20), --days D (default 7), --raids R per session (default 4).

import { simulate } from './player.mjs';
import { simulate as thrillSim } from '../../thrill/tools/player.mjs';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const SEEDS = arg('seeds', 20);
const DAYS = arg('days', 7);
const RAIDS = arg('raids', 4);

const med = (xs) => {
  const a = xs.filter((x) => x != null).sort((p, q) => p - q);
  return a.length ? a[Math.floor(a.length / 2)] : null;
};

const runs = [];
const thrill = [];
for (let s = 1; s <= SEEDS; s++) {
  runs.push(simulate({ seed: s, days: DAYS, raids: RAIDS }));
  thrill.push(thrillSim({ seed: s, days: DAYS, raids: RAIDS }));
}

console.log(`Last Stop pacing: ${SEEDS} seeds, ${DAYS} days, 4 sessions a day of ${RAIDS} raids\n`);
console.log('Day  raids zone  lots (cap)  people  squad Lv  squad homes   landmarks  decor  wishes  junk (trunk)  coins earned  on land (share)  roof campers');
for (let d = 0; d < DAYS; d++) {
  const rows = runs.map((r) => r.daily[d]);
  const m = (f) => med(rows.map(f));
  const share = m((r) => r.land / Math.max(1, r.earned));
  console.log(
    `${String(d + 1).padStart(3)}  ${String(m((r) => r.raids)).padStart(5)} ${String(m((r) => r.zone)).padStart(4)}  ${`${m((r) => r.lots)} (${m((r) => r.cap)})`.padStart(10)}  ${String(m((r) => r.people)).padStart(6)}  ${m((r) => r.squadLv).toFixed(1).padStart(8)}  ${med(rows.map((r) => r.squadHome)).padEnd(12)}  ${String(m((r) => r.landmarks)).padStart(9)}  ${String(m((r) => r.decor)).padStart(5)}  ${String(m((r) => r.wishes)).padStart(6)}  ${`${m((r) => r.junk)} (${m((r) => r.trunks)})`.padStart(12)}  ${String(m((r) => r.earned)).padStart(12)}  ${`${m((r) => r.land)} (${Math.round(share * 100)}%)`.padStart(15)}  ${String(m((r) => r.campers)).padStart(12)}`,
  );
}

// Against Thrill Hill.
console.log('\nAgainst Thrill Hill (same seeds, medians):');
let ok = true;
const lvLs = med(runs.map((r) => r.daily[DAYS - 1].squadLv));
const lvTh = med(thrill.map((r) => r.daily[DAYS - 1].squadLv));
const dLv = lvLs / lvTh - 1;
console.log(`  squad level on day ${DAYS}: ${lvLs.toFixed(2)} vs ${lvTh.toFixed(2)} (${dLv >= 0 ? '+' : ''}${(dLv * 100).toFixed(1)}%)${Math.abs(dLv) <= 0.05 ? '' : '  <-- outside ±5%'}`);
if (Math.abs(dLv) > 0.05) ok = false;
for (let z = 2; z <= 6; z++) {
  const a = med(runs.map((r) => r.zoneDay[z]));
  const b = med(thrill.map((r) => (r.zones.find((x) => x.zone === z) || {}).day));
  if (a == null && b == null) continue;
  const rel = a != null && b != null ? a / b - 1 : null;
  const bad = rel == null || Math.abs(a - b) > Math.max(0.05 * b, 0.5);
  console.log(`  zone ${z} opens: day ${a ?? '-'} vs day ${b ?? '-'}${bad ? '  <-- off' : ''}`);
  if (bad) ok = false;
}
const share = med(runs.map((r) => r.daily[DAYS - 1].land / Math.max(1, r.daily[DAYS - 1].earned)));
console.log(`  land share of coins earned by day ${DAYS}: ${Math.round(share * 100)}% (target 25–35%)${share < 0.25 || share > 0.35 ? '  <-- outside' : ''}`);
if (share < 0.25 || share > 0.35) ok = false;
const all = runs.flatMap((r) => r.clears);
const byKind = {};
for (const c of all) byKind[c.kind] = (byKind[c.kind] || 0) + 1;
console.log(`  clears by kind (all seeds): ${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ')}; first clear on day ${med(runs.map((r) => (r.clears[0] || {}).day))}`);
console.log(ok ? '\nAcceptance: PASS' : '\nAcceptance: needs tuning');
