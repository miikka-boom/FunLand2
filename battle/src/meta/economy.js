// The fair free-to-play rules, in one place:
// - Everything that changes a battle (units, levels) is unlocked by playing.
// - One currency, Jellybeans, earned by playing; spent only on cosmetics.
// - No energy, no timers, no ads, no loot boxes, no paid power.
// - The daily challenge is a bonus; missing a day costs nothing.

import { addBeans, totalStars } from './profile.js';

export const WORLDS = [
  { id: 0, name: 'Green Hills', units: ['clubber', 'squire', 'archer'], color: '#7fbf4a' },
  { id: 1, name: 'Pointy Pass', units: ['clubber', 'squire', 'archer', 'spiker', 'bomb'], color: '#d9a54a' },
  { id: 2, name: 'Brick Fortress', units: ['clubber', 'squire', 'archer', 'spiker', 'bomb', 'brick'], color: '#b8746a' },
];

export const LEVELS_PER_WORLD = 10;

export const REWARDS = {
  firstClear: [25, 35, 45], // per world
  perStar: [15, 20, 25], // each new star, per world
  replayWin: 5,
  daily: 80,
  dailyPerStar: 10,
};

/** Which world a level index belongs to. */
export const worldOf = (i) => Math.min(WORLDS.length - 1, Math.floor(i / LEVELS_PER_WORLD));

/** A level is playable once the one before it is cleared. */
export function levelUnlocked(p, i) {
  return i === 0 || !!p.cleared[i - 1];
}

/** The furthest playable level (the "Play" button continues from here). */
export function nextLevel(p, count) {
  for (let i = 0; i < count; i++) if (!p.cleared[i]) return i;
  return count - 1;
}

/** Highest world reached: its units are unlocked everywhere (sandbox, replays, daily). */
export function worldReached(p) {
  let w = 0;
  for (let k = 1; k < WORLDS.length; k++) if (p.cleared[k * LEVELS_PER_WORLD - 1]) w = k;
  return w;
}

export function unlockedUnits(p) {
  return WORLDS[worldReached(p)].units.slice();
}

/** Stars for a win: 1 for winning, +1 under each gold threshold. */
export function starsFor(spent, thresholds) {
  const [, two, three] = thresholds;
  return 1 + (spent <= two ? 1 : 0) + (spent <= three ? 1 : 0);
}

/**
 * Record a campaign win. Returns what happened, for the result screen:
 * { stars, newStars, beans, firstClear, unlockedWorld, newUnits }.
 */
export function recordLevelWin(p, i, spent, level) {
  const w = worldOf(i);
  const stars = starsFor(spent, level.stars);
  const before = p.stars[i] || 0;
  const firstClear = !p.cleared[i];
  const worldBefore = worldReached(p);
  const newStars = Math.max(0, stars - before);
  let beans = 0;
  if (firstClear) beans += REWARDS.firstClear[w];
  beans += newStars * REWARDS.perStar[w];
  if (!firstClear && !newStars) beans += REWARDS.replayWin;
  p.stars[i] = Math.max(before, stars);
  p.cleared[i] = true;
  addBeans(p, beans);
  const worldAfter = worldReached(p);
  const unlockedWorld = worldAfter > worldBefore ? worldAfter : -1;
  const newUnits = unlockedWorld >= 0 ? WORLDS[worldAfter].units.filter((u) => !WORLDS[worldBefore].units.includes(u)) : [];
  return { stars, newStars, beans, firstClear, unlockedWorld, newUnits };
}

// --- daily challenge -------------------------------------------------------------

export function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Today's challenge: one of the levels from worlds you've reached, with all
 * your unlocked units and a fresh battle seed. Same for everyone on the same
 * progress, different every day.
 */
export function dailyChallenge(p, key, levels) {
  const maxWorld = worldReached(p);
  const pool = [];
  for (let i = 0; i < levels.length; i++) if (worldOf(i) <= maxWorld) pool.push(i);
  const h = hash('wobble-' + key);
  const base = pool[h % pool.length];
  return { key, base, seed: h, level: levels[base], done: p.daily.done[key] || 0 };
}

/** Record a daily win: the first win of the day pays, later ones just improve the stars. */
export function recordDailyWin(p, key, spent, level) {
  const stars = starsFor(spent, level.stars);
  const before = p.daily.done[key] || 0;
  let beans = 0;
  if (!before) {
    beans = REWARDS.daily + stars * REWARDS.dailyPerStar;
    p.stats.dailies++;
  } else if (stars > before) beans = (stars - before) * REWARDS.dailyPerStar;
  p.daily.done[key] = Math.max(before, stars);
  addBeans(p, beans);
  return { stars, beans, first: !before };
}

export { totalStars };
