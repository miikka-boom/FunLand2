// Derive each story run's needed power from a target pace (inverse balance): a
// simulated player wins every run with 2 stars, with a loss now and then (every third
// run after the guided start), and its best-crew power when it reaches story run i
// becomes that run's rec (power = rec means 62% to survive). Median over many seeds.
//
//   node station9/tools/derive-recs.mjs [seeds]

import { STORY, STORY_TOTAL } from '../src/config.js';
import { makePlayer, oneRun, between } from './player.mjs';

const seeds = Number(process.argv[2]) || 25;
const powers = Array.from({ length: STORY_TOTAL }, () => []);
for (let seed = 1; seed <= seeds; seed++) {
  const p = makePlayer({ seed });
  const { meta } = p;
  let n = 0;
  while (meta.s.story < STORY_TOTAL && n < 200) {
    between(p, n);
    const i = meta.s.story;
    const run = meta.nextRun();
    // Measure after the same prep the player does before a run.
    meta.tick();
    if (meta.convoyInfo().ready) meta.claimConvoy();
    for (const v of meta.s.gate.visitors.slice()) if (meta.freeBeds() > 0) meta.takeIn(v.id);
    for (let k = 0; k < 20; k++) {
      const u = meta.bestUpgrade();
      if (!u) break;
      meta.upgrade(u.id);
    }
    if (powers[i].length < seed) powers[i].push(meta.crewPower(meta.bestCrew(run), run));
    // Pace: after the guided start, one loss for every two wins.
    const lose = i >= 2 && n % 3 === 2;
    oneRun(p, { force: lose ? 'lose' : 'win', stars: 2 });
    n++;
  }
}
const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)];
let prev = 0;
const out = [];
for (let i = 0; i < STORY_TOTAL; i++) {
  let rec = Math.round(median(powers[i]) / 2) * 2;
  if (rec <= prev) rec = prev + 2;
  out.push(rec);
  prev = rec;
}
console.log(`Derived from ${seeds} seeds:`);
STORY.forEach((r, i) => console.log(`  ${r.name.padEnd(20)} ${String(out[i]).padStart(4)}   (was ${r.rec})`));
