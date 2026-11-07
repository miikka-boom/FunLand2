// Thrill Hill balance tool: `npm run thrill:balance` (or node thrill/tools/balance-sim.mjs).
// Simulates players over several seeds and prints the pacing: when each zone
// opens, the 3-crown chance on arrival and on leaving, and a day-by-day table.
// Options: --seeds N (default 20), --days D (default 7), --raids R per session
// (default 4), --lazy (a player who never levels or builds).

import { simulate, ZONES } from './player.mjs';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const SEEDS = arg('seeds', 20);
const DAYS = arg('days', 7);
const RAIDS = arg('raids', 4);
const strategy = process.argv.includes('--lazy') ? 'lazy' : 'normal';

const pct = (v) => (v == null ? '  -' : `${String(Math.round(v * 100)).padStart(3)}%`);
const med = (xs) => {
  const a = xs.filter((x) => x != null).sort((p, q) => p - q);
  return a.length ? a[Math.floor(a.length / 2)] : null;
};

const runs = [];
for (let s = 1; s <= SEEDS; s++) runs.push(simulate({ seed: s, days: DAYS, raids: RAIDS, strategy }));

console.log(`Thrill Hill pacing: ${SEEDS} seeds, ${DAYS} days, 4 sessions a day of ${RAIDS} raids, ${strategy} player\n`);
console.log('Zone              opens at raid (day)    3-crown chance on arrival   on leaving   squad power on arrival (threat)');
for (const Z of ZONES) {
  const hits = runs.map((r) => r.zones.find((z) => z.zone === Z.n)).filter(Boolean);
  if (!hits.length) {
    console.log(`${String(Z.n).padEnd(2)}${Z.name.padEnd(16)}  not reached`);
    continue;
  }
  const raid = med(hits.map((h) => h.raid));
  const day = med(hits.map((h) => h.day));
  const lo = Math.min(...hits.map((h) => h.raid));
  const hi = Math.max(...hits.map((h) => h.raid));
  console.log(
    `${String(Z.n).padEnd(2)}${Z.name.padEnd(16)}  ${String(raid).padStart(4)} (${lo}-${hi}) day ${day}${hits.length < runs.length ? ` [${hits.length}/${runs.length}]` : ''}`.padEnd(40) +
      `${pct(med(hits.map((h) => h.three)))}`.padEnd(28) +
      `${pct(med(hits.map((h) => h.threeLeave)))}`.padEnd(13) +
      `${Math.round(med(hits.map((h) => h.S)))} (${Z.threat})`,
  );
}

console.log('\nDay  raids  zone  skulls  people  squad Lv  coins earned  crates/vaults  crowns 0/1/2/3     best 3-crown   buildings (bigtop striker gallery tent garage crate vault)');
for (let d = 0; d < DAYS; d++) {
  const rows = runs.map((r) => r.daily[d]);
  const m = (f) => med(rows.map(f));
  const b = (k) => m((r) => r.buildings[k]);
  const crowns = [0, 1, 2, 3].map((i) => m((r) => r.crowns[i]));
  console.log(
    `${String(d + 1).padStart(3)}  ${String(m((r) => r.raids)).padStart(5)}  ${String(m((r) => r.zone)).padStart(4)}  ${String(m((r) => r.skulls)).padStart(6)}  ${String(m((r) => r.people)).padStart(6)}  ${m((r) => r.squadLv).toFixed(1).padStart(8)}  ${String(m((r) => r.earned)).padStart(12)}  ${`${m((r) => r.chests.crate)}/${m((r) => r.chests.vault)}`.padStart(13)}  ${crowns.join('/').padEnd(17)}  ${pct(m((r) => r.three)).padStart(12)}   ${['bigtop', 'striker', 'gallery', 'tent', 'garage', 'crate', 'vault'].map(b).join(' ')}`,
  );
}

const last = runs.map((r) => r.daily[DAYS - 1]);
const sum = (f) => last.reduce((a, r) => a + f(r), 0);
console.log(
  `\nAfter ${DAYS} days (all seeds): newcomers R/V/H/L ${['rookie', 'veteran', 'hero', 'legend'].map((k) => sum((r) => r.newcomers[k])).join('/')}, Glow-Ups Silver/Gold/Rainbow ${[1, 2, 3].map((g) => sum((r) => r.grades[g])).join('/')}`,
);
