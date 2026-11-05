// The ladder: trophies, arenas, match rewards and the Trophy Trail.
//
// Fair rules: a win pays trophies and gold, a loss still pays a little gold
// and never drops you out of an arena you reached (each arena gate is a
// trophy floor). Reaching a new arena unlocks its cards: they can drop from
// chests and the shop from then on, and the Trail hands out each of them
// right after the gate.

import { CARDS, CARD_ORDER } from '../sim/cards.js';
import { ARENAS, arenaIndex, bestArena, unlockedCards } from './collection.js';
import { addGold, grant, rngFrom } from './profile.js';

export { ARENAS, arenaIndex, bestArena };

export const MATCH_REWARDS = {
  win: 30, // trophies; +-3 per crown around 2 (1 crown 27, 3 crowns 33)
  perCrown: 3,
  loss: -18,
  draw: 0,
  gold: { win: 12, perCrown: 4, perArena: 4, loss: 3, draw: 6 },
};

/** The trophy floor of the arena a trophy count is in. */
export const arenaFloor = (trophies) => ARENAS[arenaIndex(trophies)].trophies;

/**
 * Hub banner: { arena, name, trophies, from, to, frac, next } where `next` is
 * the next arena index (-1 at the top) and frac 0..1 the way from its gate.
 */
export function arenaProgress(p) {
  const arena = arenaIndex(p.trophies);
  const next = arena + 1 < ARENAS.length ? arena + 1 : -1;
  const from = ARENAS[arena].trophies;
  const to = next >= 0 ? ARENAS[next].trophies : from;
  return { arena, name: ARENAS[arena].name, trophies: p.trophies, from, to, frac: next >= 0 ? Math.min(1, (p.trophies - from) / (to - from)) : 1, next };
}

const whole = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v)) || 0));
const count = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);

/**
 * Record a finished match (m.result(team) from sim/match.js):
 * { outcome: 'win'|'loss'|'draw', crowns, enemyCrowns, towers?, cardsPlayed?, spells? }.
 * Optional towers / cardsPlayed / spells are added to stats (pass them here OR
 * count them from battle events, not both). towers defaults to what the crowns
 * imply (1 crown = 1 tower, 3 crowns = castle + guard tower).
 * Returns { outcome, crowns, enemyCrowns, before, after, delta, floored, gold, arena, newArena, newCards, floor, best }
 * or null for an unknown outcome. newArena is the arena index first reached
 * by this match (-1 if none); newCards are the card ids it unlocked.
 */
export function recordMatch(p, res) {
  const r = res || {};
  const outcome = r.outcome;
  if (!['win', 'loss', 'draw'].includes(outcome)) return null;
  const crowns = whole(r.crowns, 0, 3);
  const enemyCrowns = whole(r.enemyCrowns, 0, 3);
  const before = p.trophies;
  const arenaBefore = arenaIndex(before);
  const bestBefore = bestArena(p);
  const M = MATCH_REWARDS;
  let delta = outcome === 'win' ? M.win + M.perCrown * (Math.max(1, crowns) - 2) : outcome === 'loss' ? M.loss : M.draw;
  const after = Math.max(arenaFloor(before), before + delta);
  const floored = after !== before + delta;
  delta = after - before;
  p.trophies = after;
  p.best = Math.max(p.best, after);
  const gold = addGold(p, outcome === 'win' ? M.gold.win + M.gold.perCrown * crowns + M.gold.perArena * arenaBefore : M.gold[outcome]);

  const S = p.stats;
  S.matches++;
  if (outcome === 'win') S.wins++;
  else if (outcome === 'loss') S.losses++;
  else S.draws++;
  if (outcome === 'win' && crowns >= 3) S.threeCrowns++;
  S.towers += r.towers != null ? count(r.towers) : crowns >= 3 ? 2 : crowns;
  S.cardsPlayed += count(r.cardsPlayed);
  S.spells += count(r.spells);

  const arena = bestArena(p);
  const newArena = arena > bestBefore ? arena : -1;
  const newCards = newArena >= 0 ? CARD_ORDER.filter((id) => CARDS[id].arena > bestBefore && CARDS[id].arena <= arena) : [];
  return { outcome, crowns, enemyCrowns, before, after, delta, floored, gold, arena, newArena, newCards, floor: arenaFloor(after), best: p.best };
}

// --- Trophy Trail ------------------------------------------------------------------

// Milestones by best trophies, claimable once each, forever. Reward shapes:
// grant() rewards ({ gold }, { beans }, { cards: { id: n } }, { hat, refund }),
// or { random: rarity, n } = n copies of one unlocked card of that rarity.
// Every card of a new arena is handed out shortly after its gate.
export const TRAIL = [
  { at: 10, reward: { gold: 50 } },
  { at: 40, reward: { random: 'common', n: 10 } },
  { at: 70, reward: { beans: 50 } },
  { at: 100, reward: { gold: 100 } },
  { at: 140, reward: { random: 'rare', n: 2 } },
  { at: 180, reward: { hat: 'party', refund: 100 } },
  { at: 220, reward: { gold: 150 } },
  { at: 260, reward: { random: 'common', n: 15 } },
  // Pointy Pass
  { at: 300, reward: { cards: { bruiser: 2 } } },
  { at: 330, reward: { cards: { brick: 1 } } },
  { at: 370, reward: { cards: { cheeseWheel: 1 } } },
  { at: 420, reward: { gold: 250 } },
  { at: 470, reward: { beans: 80 } },
  { at: 520, reward: { random: 'rare', n: 4 } },
  { at: 570, reward: { hat: 'beanie', refund: 120 } },
  { at: 610, reward: { random: 'common', n: 25 } },
  // Boom Ridge
  { at: 650, reward: { cards: { bombSquad: 2 } } },
  { at: 690, reward: { cards: { megaBomb: 1 } } },
  { at: 730, reward: { cards: { shieldWall: 1 } } },
  { at: 800, reward: { gold: 400 } },
  { at: 860, reward: { beans: 120 } },
  { at: 920, reward: { random: 'epic', n: 1 } },
  { at: 960, reward: { hat: 'propeller', refund: 150 } },
  // Brick Fortress
  { at: 1000, reward: { gold: 600 } },
  { at: 1080, reward: { random: 'rare', n: 8 } },
  { at: 1160, reward: { beans: 200 } },
  { at: 1240, reward: { random: 'epic', n: 2 } },
  { at: 1320, reward: { hat: 'viking', refund: 250 } },
  { at: 1400, reward: { random: 'common', n: 60 } },
  // Wobble Summit
  { at: 1500, reward: { gold: 1000, beans: 300 } },
  { at: 1550, reward: { random: 'epic', n: 3 } },
  { at: 1600, reward: { hat: 'crown', refund: 400 } },
];

const GATES = new Map(ARENAS.map((a) => [a.trophies, a.id]));

/**
 * The Trail for display: [{ i, at, reward, arena, gate, reached, claimed, claimable }]
 * gate = arena index whose gate this milestone sits on (-1 otherwise).
 */
export function trailStatus(p) {
  return TRAIL.map((m, i) => {
    const reached = p.best >= m.at;
    const claimed = !!p.road.claimed[m.at];
    const gate = GATES.has(m.at) ? GATES.get(m.at) : -1;
    return { i, at: m.at, reward: m.reward, arena: arenaIndex(m.at), gate, reached, claimed, claimable: reached && !claimed };
  });
}

/** How many milestones are waiting to be claimed. */
export const claimableTrail = (p) => TRAIL.filter((m) => p.best >= m.at && !p.road.claimed[m.at]).length;

const RARITY_DOWN = { epic: 'rare', rare: 'common', common: null };

/** A random-card reward picks one unlocked card of that rarity, deterministically. */
function resolveRandom(p, m) {
  const rng = rngFrom(p.seed, 'trail', m.at);
  const pool = unlockedCards(p);
  for (let r = m.reward.random; r; r = RARITY_DOWN[r]) {
    const ids = pool.filter((id) => CARDS[id].rarity === r);
    if (ids.length) return { cards: { [rng.pick(ids)]: m.reward.n || 1 } };
  }
  return { gold: 50 * (m.reward.n || 1) };
}

/**
 * Claim a reached milestone (by its `at`). Returns the grant() summary plus
 * { at } or null if it is not claimable (not reached, already claimed, unknown).
 */
export function claimTrail(p, at) {
  const m = TRAIL.find((x) => x.at === Number(at));
  if (!m || p.best < m.at || p.road.claimed[m.at]) return null;
  const reward = m.reward.random ? resolveRandom(p, m) : m.reward;
  p.road.claimed[m.at] = true;
  return { at: m.at, ...grant(p, reward) };
}
