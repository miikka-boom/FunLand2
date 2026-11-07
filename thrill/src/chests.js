// Chest helpers: rarity odds by level, Glow-Up odds, timers with lateness grace.
// Pure functions; the Meta class (meta.js) does the opening.

import { CHESTS, CHEST_GRACE, GLOW, GRADES, KNOCKS, RARITY_ORDER, OPEN_NOW_MS } from './config.js';
import { clamp } from './util.js';

/** Rarity weights (percent, summing to 100) for a chest's newcomer at a level. */
export function rarityOdds(kind, level) {
  const o = CHESTS[kind].odds;
  const w = {};
  let total = 0;
  for (const r of RARITY_ORDER) {
    w[r] = Math.max(0, o.base[r] + o.per[r] * (level - 1));
    total += w[r];
  }
  for (const r of RARITY_ORDER) w[r] = total > 0 ? (w[r] / total) * 100 : 0;
  return w;
}

/** Chance per knock that the chest glows up a grade. */
export function glowChance(level, extra = 0) {
  return clamp(GLOW.base + GLOW.perLevel * (level - 1) + extra, 0, 1);
}

/** Odds of each final grade (0 plain .. 3 rainbow) from KNOCKS independent rolls. */
export function gradeOdds(p) {
  const n = KNOCKS;
  const choose = (k) => {
    let c = 1;
    for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
    return c;
  };
  return GRADES.map((_, k) => (k > n ? 0 : choose(k) * p ** k * (1 - p) ** (n - k)));
}

/** Odds of at least each grade: [1, silver+, gold+, rainbow]. */
export function gradeAtLeast(p) {
  const g = gradeOdds(p);
  return g.map((_, k) => g.slice(k).reduce((s, v) => s + v, 0));
}

export const chestPeriod = (kind, timeScale = 1) => CHESTS[kind].period * timeScale;

/**
 * When the next chest of this kind is ready after opening one at `t` that was
 * ready at `readyAt`: a period on, minus the time it sat ready (up to
 * CHEST_GRACE of a period). A chest that waited longer than a whole period gets
 * no grace: nothing was missed, and it never comes early.
 */
export function nextReadyAt(period, readyAt, t) {
  const late = t - readyAt;
  const grace = late > 0 && late <= period ? Math.min(late, period * CHEST_GRACE) : 0;
  return t + period - grace;
}

/** Gems to open a chest now: 1 per OPEN_NOW_MS left, rounded up, capped. */
export function openNowCost(kind, msLeft) {
  if (msLeft <= 0) return 0;
  return Math.min(CHESTS[kind].gemCap, Math.ceil(msLeft / OPEN_NOW_MS));
}
