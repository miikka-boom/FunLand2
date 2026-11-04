// A simulated Hope Street player, shared by the balance tools. It plays the way the
// coach suggests: takes people in while there are beds (and swaps up when a better
// one comes along), spends scrap as soon as it can, brings the best crew, plays the
// story when the odds are decent and scavenges otherwise.

import { Meta, newState } from '../src/meta.js';
import { FakeClock } from '../src/clock.js';
import { mulberry32 } from '../src/util.js';
import { basePower } from '../src/people.js';
import { TUNING_DEFAULTS } from '../src/config.js';

export function makePlayer({ seed = 1, playAt = 0.55, tuning = {} } = {}) {
  const clock = new FakeClock(1_700_000_000_000);
  const rng = mulberry32(seed);
  const meta = new Meta(newState(clock.now(), rng), { clock, rng, tuning: { ...TUNING_DEFAULTS, ...tuning } });
  return { meta, clock, rng, playAt };
}

/** Value of a person for keeping: their power, a little extra for grade (they grow faster). */
const worth = (p) => basePower(p) + p.grade * 4;

export function handleGate(meta) {
  for (const v of meta.s.gate.visitors.slice()) {
    if (meta.freeBeds() > 0) {
      meta.takeIn(v.id);
      continue;
    }
    const weakest = meta.roster().slice().sort((a, b) => worth(a) - worth(b))[0];
    if (weakest && worth(v) > worth(weakest) + 6) meta.swap(v.id, weakest.id);
    else meta.turnAway(v.id);
  }
}

export function shop(meta) {
  for (let k = 0; k < 40; k++) {
    const u = meta.bestUpgrade();
    if (!u) break;
    meta.upgrade(u.id);
  }
}

export function claims(meta) {
  if (meta.convoyInfo().ready) meta.claimConvoy();
}

/** Pick the run the coach would: story at decent odds, else the scavenge that pays best. */
export function chooseRun(meta, playAt) {
  const story = meta.storyRun();
  if (story && meta.bestOdds(story).chance >= playAt) return 'story';
  let best = story ? 'story' : 'scav1';
  let bestV = -1;
  for (const key of ['scav0', 'scav1']) {
    const r = meta.run(key);
    const o = meta.bestOdds(r);
    const v = r.scrap * o.chance + r.xp * 0.5 * o.chance;
    if (o.chance >= 0.5 && v > bestV) {
      bestV = v;
      best = key;
    }
  }
  return best;
}

/** One run, start to finish. `force` = 'win' | 'lose' | undefined (by the odds). */
export function oneRun(p, { force, stars } = {}) {
  const { meta, playAt } = p;
  meta.tick();
  claims(meta);
  handleGate(meta);
  shop(meta);
  const key = force ? (meta.storyRun() ? 'story' : 'scav1') : chooseRun(meta, playAt);
  const run = meta.run(key);
  let ids = meta.bestSquad(run);
  if (!ids.length) {
    // Everyone is hurt: wait a day at home (heal with gems if rich, else a tiny scavenge with whoever is least hurt).
    const p0 = meta.roster().sort((a, b) => a.injured - b.injured)[0];
    p0.injured = 0;
    ids = [p0.id];
  }
  const plan = meta.planRun(key, ids, { outcome: force || 'auto' });
  if (!plan.ok) throw new Error(`${key}: ${plan.reason}`);
  const result = plan.result;
  if (stars && result.won) result.stars = stars;
  // Revive on story runs when there are gems to spare.
  if (!result.won && run.kind === 'story' && meta.canRevive(result) && meta.s.gems >= meta.reviveCost(result) + 5) meta.revive(result);
  const out = meta.applyRun(result); // moves the clock on by the run's length
  meta.s.playMs += result.timeS * 1000;
  return { key, run, result, out };
}

/** 3 sessions a day, 5 runs each; the hours between sessions let visitors and convoys arrive. */
export function between(p, runIndex) {
  if (runIndex > 0 && runIndex % 5 === 0) {
    const sessionsDone = runIndex / 5;
    p.clock.advance((sessionsDone % 3 === 0 ? 11 : 5) * 3600 * 1000);
  }
}

export function crewStats(meta) {
  const story = meta.storyRun() || meta.run('scav1');
  const top = meta.roster().slice(0, 4);
  return {
    power: meta.squadPower(meta.bestSquad(story), story),
    people: meta.s.people.length,
    beds: meta.beds(),
    levels: top.map((x) => x.level),
    grades: top.map((x) => x.grade),
  };
}
