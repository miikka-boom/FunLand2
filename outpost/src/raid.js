// Power and odds: pure functions shared by the rules, the UI and the balance tool.
//
//   member power = (10 + 3 × (level − 1)) × rarity × (1 + ride) × golden × (1.5 if a counter)
//   squad power S = Σ member power × (1 + Cheer + 10% if siblings are together)
//   a raid is three waves (T × 0.5, T × 0.75, T × 1.0); each cleared earns a crown:
//   p(wave) = clamp(0.5 + 0.9 × (S / (T × diff) − 1), 5%, 97%), stopping at the first miss

import { POWER, RARITIES, CLASSES, RIDE_BONUS, COUNTER, PERKS, SIBLINGS, WAVES, WAVE_ODDS, ODDS_LABELS, ZONES, RALLY } from './config.js';
import { clamp } from './util.js';

export function rideBonus(buildings, cls) {
  return RIDE_BONUS * (buildings[CLASSES[cls].ride] || 0);
}

/** A survivor's power at home (no counter bonus). */
export function basePower(p, buildings, level = p.level) {
  return (POWER.base + POWER.growth * (level - 1)) * RARITIES[p.rarity].mult * (1 + rideBonus(buildings, p.cls)) * (p.golden ? POWER.golden : 1);
}

export const perkValue = (p) => (p.perk && PERKS[p.perk] ? PERKS[p.perk].v * RARITIES[p.rarity].perk : 0);
export const isCounter = (p, threats) => threats.includes(CLASSES[p.cls].counters);

/** Pairs of family members among `people` (anyone sharing a family id). */
export function siblingsTogether(people) {
  const seen = new Map();
  for (const p of people) {
    if (p.family == null) continue;
    if (seen.has(p.family)) return [seen.get(p.family), p.id];
    seen.set(p.family, p.id);
  }
  return null;
}

/**
 * The squad against these threats:
 * { members: [{ id, base, counter, power }], cheer, siblings: [a, b] | null, mult, S }
 */
export function squadPower(people, threats, buildings) {
  const members = people.map((p) => {
    const base = basePower(p, buildings);
    const counter = isCounter(p, threats);
    return { id: p.id, base, counter, power: base * (counter ? COUNTER : 1) };
  });
  const cheer = people.reduce((s, p) => s + (p.perk === 'cheer' ? perkValue(p) : 0), 0);
  const siblings = siblingsTogether(people);
  const mult = 1 + cheer + (siblings ? SIBLINGS.power : 0);
  const S = members.reduce((s, m) => s + m.power, 0) * mult;
  return { members, cheer, siblings, mult, S };
}

export const zoneOf = (n) => ZONES[clamp(n, 1, ZONES.length) - 1];

/** The threat number T for a raid in this zone. */
export function threatFor(zone, { rally = false, tune = 1 } = {}) {
  return zoneOf(zone).threat * tune * (rally ? RALLY.threat : 1);
}

/** Chance to clear one wave of difficulty d (T × diff). */
export function waveChance(S, d) {
  if (d <= 0) return WAVE_ODDS.max;
  return clamp(WAVE_ODDS.a + WAVE_ODDS.b * (S / d - 1), WAVE_ODDS.min, WAVE_ODDS.max);
}

/**
 * The crown odds for squad power S against threat T:
 * { waves: [p1, p2, p3], atLeast: [1, P(≥1), P(≥2), P(3)], dist: [P0..P3], expected }
 */
export function crownOdds(S, T) {
  const waves = WAVES.map((w) => Math.min(w.max ?? 1, waveChance(S, T * w.diff)));
  const atLeast = [1];
  let run = 1;
  for (const p of waves) {
    run *= p;
    atLeast.push(run);
  }
  const dist = atLeast.map((v, i) => v - (atLeast[i + 1] ?? 0));
  const expected = dist.reduce((a, v, i) => a + v * i, 0);
  return { waves, atLeast, dist, expected, three: atLeast[3] };
}

/** Easy / Good / Tough / Risky from the chance of all three crowns. */
export function oddsLabel(three) {
  return ODDS_LABELS.find((l) => three >= l.min - 1e-9) || ODDS_LABELS[ODDS_LABELS.length - 1];
}

/** All k-combinations of an array (small n only: the roster is at most ~20). */
export function combos(list, k) {
  const out = [];
  const cur = [];
  const go = (start) => {
    if (cur.length === k) {
      out.push(cur.slice());
      return;
    }
    for (let i = start; i <= list.length - (k - cur.length); i++) {
      cur.push(list[i]);
      go(i + 1);
      cur.pop();
    }
  };
  if (k <= 0) return [[]];
  if (list.length <= k) return [list.slice()];
  go(0);
  return out;
}
