// A simulated Station 9 player, shared by the balance tools. It does what Mae's
// guided start does, then plays the way her hints suggest: take people in while there
// are beds, spend scrap as soon as it can, bring the best crew, always play the next run.

import { Meta, newState } from '../src/meta.js';
import { FakeClock } from '../src/clock.js';
import { mulberry32 } from '../src/util.js';
import { basePower } from '../src/people.js';
import { TUNING_DEFAULTS, ROLE_ORDER } from '../src/config.js';

export function makePlayer({ seed = 1, tuning = {} } = {}) {
  const clock = new FakeClock(1_700_000_000_000);
  const rng = mulberry32(seed);
  const meta = new Meta(newState(clock.now(), rng), { clock, rng, tuning: { ...TUNING_DEFAULTS, ...tuning } });
  // The guided start: pick who you are, the first visitor walks in.
  meta.chooseYou(Math.floor(rng() * 3));
  const roles = ROLE_ORDER.filter((r) => r !== meta.you().role);
  meta.takeIn(meta.arrive({ role: roles[0], stars: 1, level: 1 }).id);
  return { meta, clock, rng, roles };
}

export function handleGate(meta) {
  for (const v of meta.s.gate.visitors.slice()) {
    if (meta.freeBeds() > 0) meta.takeIn(v.id);
  }
  // Two waiting and no beds: send the weaker one on.
  if (meta.s.gate.visitors.length >= 2 && meta.freeBeds() <= 0) {
    const weak = meta.s.gate.visitors.slice().sort((a, b) => basePower(a) - basePower(b))[0];
    meta.sendAway(weak.id);
  }
}

export function shop(meta) {
  for (let k = 0; k < 20; k++) {
    const u = meta.bestUpgrade();
    if (!u) break;
    meta.upgrade(u.id);
  }
}

/** One run, start to finish. `force` = 'win' | 'lose' | undefined (by the odds). */
export function oneRun(p, { force, stars } = {}) {
  const { meta, roles } = p;
  meta.tick();
  if (meta.convoyInfo().ready) meta.claimConvoy();
  handleGate(meta);
  shop(meta);
  handleGate(meta);
  const run = meta.nextRun();
  const plan = meta.planRun(meta.bestCrew(run), { outcome: force || 'auto' });
  if (!plan.ok) throw new Error(plan.reason);
  if (stars && plan.result.won) plan.result.stars = stars;
  const out = meta.applyRun(plan.result);
  meta.s.playMs += 5 * 60 * 1000;
  // The guided start: after the first run the second visitor comes; after the diner the gate and convoy open.
  if (meta.s.stats.runs === 1) meta.arrive({ role: roles[1], stars: 2, level: 1 });
  if (meta.s.story >= 2 && !meta.s.gate.on) {
    meta.openGate();
    meta.startConvoy();
  }
  return { run, out };
}

/** 3 sessions a day, 5 runs each; a few hours between sessions. */
export function between(p, i) {
  if (i > 0 && i % 5 === 0) p.clock.advance((i / 5) % 3 === 0 ? 11 * 3600 * 1000 : 4 * 3600 * 1000);
}
