// The two menu chests. No chests from matches: a Small Chest that refills
// every 3 hours and a Big Chest every 12 hours, both ready on the first visit.
// They never stack, need no slot and can't be sped up. Coming back a little
// late costs nothing: up to a quarter of a period of lateness comes off the
// next wait (so a twice-a-day player gets both Big Chests a day, not 1.25).
//
// Contents are honest and reproducible: rolled from (p.seed, kind, how many
// of that kind you opened), only cards unlocked for you drop, and chestOdds()
// computes the exact odds the info popup shows from the same rules.

import { CARDS } from '../sim/cards.js';
import { bestArena, unlockedCards } from './collection.js';
import { grant, rngFrom } from './profile.js';

const HOUR = 3600 * 1000;
// Share of a period that a late open may take off the next wait.
export const CHEST_GRACE = 0.25;

// gold: range before arena scaling; cards: total before scaling; rare: chance
// each stack is rare; minRare: rare stacks guaranteed; epic: chance one stack
// is epic; beans: Jellybeans (flat).
export const CHESTS = {
  small: { id: 'small', name: 'Small Chest', period: 3 * HOUR, gold: [25, 45], cards: 8, stacks: 2, rare: 0.15, minRare: 0, epic: 0, beans: 0 },
  big: { id: 'big', name: 'Big Chest', period: 12 * HOUR, gold: [120, 200], cards: 30, stacks: 4, rare: 0.15, minRare: 1, epic: 0.35, beans: 10 },
};
export const CHEST_KINDS = ['small', 'big'];
// Per arena reached: +25% gold, +20% cards.
export const CHEST_SCALE = { gold: 0.25, cards: 0.2 };

const DOWN = { epic: 'rare', rare: 'common', common: null };
// Callers pass `now`; a missing one means the real clock (never 1970, which
// would look like a clock rollback and clamp the timers).
const clock = (now) => (Number.isFinite(now) ? now : Date.now());

function poolOf(p) {
  const pool = { common: [], rare: [], epic: [] };
  for (const id of unlockedCards(p)) pool[CARDS[id].rarity].push(id);
  return pool;
}

/**
 * The rarity of each stack from the roll decisions (rareFlags per stack,
 * epicFlag), after guarantees and after stepping down rarities you have too
 * few unlocked cards of (each stack is a different card). Shared by the roll
 * and by chestOdds so the shown odds are exact.
 */
function stackRarities(c, rareFlags, epicFlag, sizes) {
  const rar = rareFlags.map((f) => (f ? 'rare' : 'common'));
  for (let i = 0, have = rar.filter((r) => r === 'rare').length; i < rar.length && have < c.minRare; i++) {
    if (rar[i] === 'common') {
      rar[i] = 'rare';
      have++;
    }
  }
  if (epicFlag) {
    // Replaces a common stack (the last one); with none left, the last stack.
    const i = rar.lastIndexOf('common');
    rar[i >= 0 ? i : rar.length - 1] = 'epic';
  }
  // One common stack always carries the bulk of the cards (an all-rare roll
  // keeps its guaranteed rares and turns the last extra rare into commons).
  if (rar.length > 1 && !rar.includes('common')) {
    const i = rar.lastIndexOf('rare');
    if (i >= 0 && rar.filter((r) => r === 'rare').length > c.minRare) rar[i] = 'common';
  }
  const used = { common: 0, rare: 0, epic: 0 };
  return rar.map((r0) => {
    let r = r0;
    while (r && used[r] >= sizes[r]) r = DOWN[r];
    if (!r) r = 'common'; // pool exhausted: the stack merges into a common card
    used[r]++;
    return r;
  });
}

function scaleOf(p) {
  const arena = bestArena(p);
  return { arena, gold: 1 + CHEST_SCALE.gold * arena, cards: 1 + CHEST_SCALE.cards * arena };
}

/**
 * The contents the next chest of this kind will have (pure, does not open it):
 * { kind, gold, beans, cards: [{ id, n, rarity }] }.
 */
export function rollChest(p, kind) {
  const c = CHESTS[kind];
  if (!c) return null;
  const rng = rngFrom(p.seed, 'chest', kind, p.chests.opened[kind]);
  const sc = scaleOf(p);
  const pool = poolOf(p);
  const sizes = { common: pool.common.length, rare: pool.rare.length, epic: pool.epic.length };
  const gold = Math.round(rng.int(c.gold[0], c.gold[1]) * sc.gold);
  const total = Math.round(c.cards * sc.cards);
  const rareFlags = Array.from({ length: c.stacks }, () => rng.chance(c.rare));
  const epicFlag = c.epic > 0 && rng.chance(c.epic) && sizes.epic > 0;
  const rar = stackRarities(c, rareFlags, epicFlag, sizes);

  // Stack sizes: epics 1 (2 from Brick Fortress on), rares ~12% of the total,
  // commons share the rest with a little wobble.
  const n = rar.map((r) => (r === 'epic' ? Math.max(1, Math.round(sc.cards)) : r === 'rare' ? Math.max(1, Math.round(total * 0.12)) : 0));
  const commons = rar.map((r, i) => (r === 'common' ? i : -1)).filter((i) => i >= 0);
  const rest = Math.max(commons.length, total - n.reduce((s, k) => s + k, 0));
  const w = commons.map(() => 1 + rng.next() * 0.6);
  const wsum = w.reduce((s, k) => s + k, 0);
  let left = rest;
  commons.forEach((i, k) => {
    n[i] = k === commons.length - 1 ? left : Math.max(1, Math.round((rest * w[k]) / wsum));
    left -= n[i];
  });

  // Different cards per stack while the pool lasts.
  const cards = [];
  rar.forEach((r, i) => {
    const fresh = pool[r].filter((id) => !cards.some((x) => x.id === id));
    if (fresh.length) cards.push({ id: rng.pick(fresh), n: n[i], rarity: r });
    else {
      const same = cards.filter((x) => x.rarity === r).pop(); // (unreachable with today's card pools)
      if (same) same.n += n[i];
    }
  });
  return { kind, gold, beans: c.beans, cards: cards.filter((x) => x.n > 0) };
}

/**
 * { kind, ready, msLeft, readyAt, period } or null for an unknown kind.
 * If the clock went back (readyAt more than a period away), the timer is
 * clamped to one period from now (this writes p) so it never grows.
 */
export function chestState(p, kind, now) {
  const c = CHESTS[kind];
  if (!c) return null;
  const t = clock(now);
  const ch = p.chests[kind];
  if (ch.readyAt - t > c.period) ch.readyAt = t + c.period;
  return { kind, ready: t >= ch.readyAt, msLeft: Math.max(0, ch.readyAt - t), readyAt: ch.readyAt, period: c.period };
}

/**
 * When the next chest of this kind is ready after opening one at `t`: one
 * period on, minus the time it sat ready (up to CHEST_GRACE of a period).
 * A chest that waited longer than a whole period (a day away, the first
 * visit) gets no grace: nothing was missed, and it never comes early.
 */
export function nextReadyAt(kind, readyAt, t) {
  const c = CHESTS[kind];
  const late = t - readyAt;
  const grace = late > 0 && late <= c.period ? Math.min(late, c.period * CHEST_GRACE) : 0;
  return t + c.period - grace;
}

/**
 * Open a ready chest: pays its contents, restarts its timer and counts it.
 * Returns null if not ready, else
 * { kind, gold, beans, cards: [{ id, n, rarity, isNew, levelBefore, countBefore, level, count, need, canUpgradeAfter }] }
 * (canUpgradeAfter = enough copies for the next level now).
 */
export function openChest(p, kind, now) {
  const st = chestState(p, kind, now);
  if (!st || !st.ready) return null;
  const roll = rollChest(p, kind);
  const g = grant(p, { gold: roll.gold, beans: roll.beans, cards: roll.cards.map((x) => ({ id: x.id, n: x.n })) });
  p.chests[kind].readyAt = nextReadyAt(kind, st.readyAt, clock(now));
  p.chests.opened[kind]++;
  p.stats.chests++;
  return { kind, gold: g.gold, beans: g.beans, cards: g.cards };
}

/** How many chests are ready right now (for a menu badge). */
export const readyChests = (p, now) => CHEST_KINDS.filter((k) => chestState(p, k, now).ready).length;

/**
 * For the info popup, exact for this profile:
 * { kind, name, period, gold: [lo, hi], beans, cards, stacks, odds: { common, rare, epic }, pool: { common: [ids], rare, epic } }
 * cards = about how many cards in total; odds = chance the chest has at
 * least one stack of that rarity (0..1).
 */
export function chestOdds(p, kind) {
  const c = CHESTS[kind];
  if (!c) return null;
  const sc = scaleOf(p);
  const pool = poolOf(p);
  const sizes = { common: pool.common.length, rare: pool.rare.length, epic: pool.epic.length };
  const odds = { common: 0, rare: 0, epic: 0 };
  const epicP = sizes.epic > 0 ? c.epic : 0;
  for (let mask = 0; mask < 1 << c.stacks; mask++) {
    const flags = Array.from({ length: c.stacks }, (_, i) => !!(mask & (1 << i)));
    const k = flags.filter(Boolean).length;
    const pr = c.rare ** k * (1 - c.rare) ** (c.stacks - k);
    for (const [epic, pe] of [[true, epicP], [false, 1 - epicP]]) {
      if (!pe) continue;
      const rar = stackRarities(c, flags, epic, sizes);
      for (const r of new Set(rar)) odds[r] += pr * pe;
    }
  }
  for (const r in odds) odds[r] = Math.round(odds[r] * 10000) / 10000;
  return {
    kind,
    name: c.name,
    period: c.period,
    gold: [Math.round(c.gold[0] * sc.gold), Math.round(c.gold[1] * sc.gold)],
    beans: c.beans,
    cards: Math.round(c.cards * sc.cards),
    stacks: c.stacks,
    odds,
    pool,
  };
}
