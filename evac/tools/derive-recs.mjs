// Inverse design for the road's difficulty: given the run at which a typical
// player should first clear each stop, simulate that player (replaying for
// supplies in between, buying the best upgrades) and print the recommended
// power each stop should have so the attempt lands at the target odds.
// Run: node evac/tools/derive-recs.mjs  (paste the output into config.js)

import { Meta, newState } from '../src/meta.js';
import { FakeClock } from '../src/clock.js';
import { CAMPAIGNS, CHAPTERS_PER_CAMPAIGN, TUNING_DEFAULTS } from '../src/config.js';
import { mulberry32 } from '../src/util.js';

// Run number at which each stop is first cleared (5 per district).
const SCHEDULE = [
  [1, 2, 3, 4, 6],
  [7, 8, 10, 12, 14],
  [15, 17, 19, 21, 24],
  [25, 27, 29, 32, 35],
  [36, 38, 41, 44, 48],
];
// Power / recommended at the attempt: chapters a bit above (likely 2 stars), finales right at it.
const RATIO = { chapter: 1.0, finale: 0.95 };

const clock = new FakeClock(0);
const meta = new Meta(newState(0), { clock, tuning: { ...TUNING_DEFAULTS }, rng: mulberry32(11) });
const s = meta.s;

function shop() {
  for (let k = 0; k < 60; k++) {
    let main = s.main;
    for (const id of meta.rescued()) if (s.survivors[id] > s.survivors[main]) main = id;
    meta.setMain(main);
    let weapon = s.weapon;
    for (const id of meta.found()) if (meta.weaponPower(id) > meta.weaponPower(weapon)) weapon = id;
    meta.setWeapon(weapon);
    const u = meta.bestUpgrade();
    if (!u) break;
    meta.upgrade(u.kind, u.id);
  }
}

const recs = CAMPAIGNS.map(() => []);
let run = 0;
for (let ci = 0; ci < CAMPAIGNS.length; ci++) {
  for (let k = 0; k < CHAPTERS_PER_CAMPAIGN; k++) {
    const at = SCHEDULE[ci][k];
    // Replay for supplies until it's this stop's turn.
    while (run + 1 < at) {
      shop();
      const r = meta._bestReplay();
      if (r === null) break;
      meta.applyRun(meta.planRun(r).result);
      run++;
    }
    shop();
    const finale = k === CHAPTERS_PER_CAMPAIGN - 1;
    const rec = Math.round(meta.power().total / (finale ? RATIO.finale : RATIO.chapter));
    CAMPAIGNS[ci].chapters[k].rec = rec; // so the attempt and later replays see it
    recs[ci].push(rec);
    const res = meta.planRun(s.next, { outcome: 'win' }).result;
    meta.applyRun(res);
    run++;
  }
}
console.log('Derived recommended power per stop:');
CAMPAIGNS.forEach((c, ci) => console.log(`  ${c.id.padEnd(11)} ${recs[ci].join(', ')}`));
console.log(`Power at the evac: ${meta.power().total}, supplies earned ${s.stats.earned}, unspent ${s.supplies}`);
