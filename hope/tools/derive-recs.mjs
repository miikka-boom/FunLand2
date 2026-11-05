// Derive each story run's recommended power from a target pace (inverse balance).
// A simulated player follows a fixed schedule: story run i is played at run T(i),
// with scavenges in between, every run a 2-star win. Its best-crew power when it
// reaches story run i becomes that run's rec (power = rec means 62% to survive).
// The median over many seeds goes into CHAINS in config.js.
//
//   node hope/tools/derive-recs.mjs [seeds]

import { CHAINS, STORY_TOTAL } from '../src/config.js';
import { makePlayer, oneRun, between } from './player.mjs';

const seeds = Number(process.argv[2]) || 25;

/** Target run number for story run i: quick at first, slower later. 21 story runs in ~45. */
export const target = (i) => Math.round(1 + i * 1.6 + i * i * 0.03);

// Make recs huge while deriving, so scavenge choices don't depend on the old numbers.
const powers = Array.from({ length: STORY_TOTAL }, () => []);
for (let seed = 1; seed <= seeds; seed++) {
  const p = makePlayer({ seed });
  const { meta } = p;
  let n = 0;
  for (let i = 0; i < STORY_TOTAL; i++) {
    while (meta.s.stats.runs + 1 < target(i)) {
      between(p, n++);
      // A scavenge, won with two stars (forced: 'win' would pick the story, so play it by hand).
      meta.tick();
      const key = 'scav1';
      const run = meta.run(key);
      oneRunScavenge(p, key, run);
    }
    between(p, n++);
    const story = meta.storyRun();
    // Prepare exactly as the player would before playing, then measure.
    meta.tick();
    if (meta.convoyInfo().ready) meta.claimConvoy();
    powers[i].push(measure(p));
    oneRun(p, { force: 'win', stars: 2 });
  }
}

function measure(p) {
  const { meta } = p;
  // Same prep as oneRun: gate, shop.
  oneRunPrep(meta);
  const story = meta.storyRun();
  return meta.squadPower(meta.bestSquad(story), story);
}

function oneRunPrep(meta) {
  for (const v of meta.s.gate.visitors.slice()) if (meta.freeBeds() > 0) meta.takeIn(v.id);
  for (let k = 0; k < 40; k++) {
    const u = meta.bestUpgrade();
    if (!u) break;
    meta.upgrade(u.id);
  }
}

function oneRunScavenge(p, key, run) {
  const { meta } = p;
  oneRunPrep(meta);
  let ids = meta.bestSquad(run);
  if (!ids.length) {
    const p0 = meta.roster().sort((a, b) => a.injured - b.injured)[0];
    p0.injured = 0;
    ids = [p0.id];
  }
  const r = meta.planRun(key, ids, { outcome: 'win' });
  r.result.stars = 2;
  meta.applyRun(r.result);
}

const median = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};

const recs = [];
let prev = 0;
for (let i = 0; i < STORY_TOTAL; i++) {
  let rec = Math.round(median(powers[i]) / 5) * 5;
  if (rec <= prev) rec = prev + 5;
  recs.push(rec);
  prev = rec;
}
console.log(`Derived from ${seeds} seeds. Target run per story step: ${Array.from({ length: STORY_TOTAL }, (_, i) => target(i)).join(', ')}`);
for (let c = 0; c < CHAINS.length; c++) {
  const r = recs.slice(c * 3, c * 3 + 3);
  console.log(`  ${CHAINS[c].building.padEnd(9)} ${r.join(', ')}    (was ${CHAINS[c].runs.map((x) => x.rec).join(', ')})`);
}
