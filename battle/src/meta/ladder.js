// The ladder: trophies, arenas, match rewards and the Trophy Trail.
//
// Fair rules: a win pays trophies and gold, a loss still pays a little gold
// and never drops you out of an arena you reached (each arena gate is a
// trophy floor). Reaching a new arena unlocks its cards: they can drop from
// chests and the shop from then on, and the Trail hands out each of them
// right after the gate.

import { CARDS, CARD_ORDER } from '../sim/cards.js';
import { ARENAS, arenaIndex, bestArena, unlockedCards, addCards } from './collection.js';
import { addGold, grant, pushNotice, rngFrom, firstsOf } from './profile.js';

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

// Losses that pay no gold: giving up, and a match left while behind (settlePending).
// (Otherwise a few seconds of BATTLE -> surrender would out-earn playing.)
export const NO_GOLD_REASONS = ['surrender', 'left'];

/**
 * Record a finished match (m.result(team) from sim/match.js):
 * { outcome: 'win'|'loss'|'draw', crowns, enemyCrowns, reason?, towers?, cardsPlayed?, spells? }.
 * reason is the match's endReason (or 'left', see settlePending): a loss by
 * surrender or by leaving pays no gold.
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
  const noGold = outcome === 'loss' && NO_GOLD_REASONS.includes(r.reason);
  const gold = addGold(p, noGold ? 0 : outcome === 'win' ? M.gold.win + M.gold.perCrown * crowns + M.gold.perArena * arenaBefore : M.gold[outcome]);
  p.pending = null; // (this match, or one that was left, is settled)

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
  return { outcome, crowns, enemyCrowns, before, after, delta, floored, gold, noGold, arena, newArena, newCards, floor: arenaFloor(after), best: p.best };
}

// --- matches that never finished ----------------------------------------------------------
//
// A ladder match writes a small record when it starts and keeps its crowns up
// to date; recordMatch clears it. If the page is reloaded or the app killed
// mid-match, the next start settles it: left while behind on crowns counts as
// a loss (no reload to dodge one), otherwise it is simply dropped (a phone
// that closed the game in the background costs nothing).

/** A ladder match starts: remember it. Returns its id. */
export function startPending(p, opponent, now) {
  const t = Number.isFinite(now) ? Math.max(0, Math.floor(now)) : 0;
  const id = `${p.stats.matches}:${t}`;
  p.pending = { id, opponent: String(opponent || '').slice(0, 40), startedAt: t, blue: 0, red: 0 };
  return id;
}

/** Crowns changed in the running match (only if it is still the pending one). Returns true if updated. */
export function updatePending(p, id, crowns) {
  const q = p.pending;
  if (!q || q.id !== id || !crowns) return false;
  q.blue = whole(crowns.blue, 0, 3);
  q.red = whole(crowns.red, 0, 3);
  return true;
}

/**
 * At start-up: settle a match that never finished. Returns null if there was
 * none, else { lost, opponent, blue, red, rec } (rec = recordMatch's result
 * for a loss, else null). Queues a one-time notice either way.
 */
export function settlePending(p) {
  const q = p.pending;
  if (!q) return null;
  p.pending = null;
  const who = q.opponent || 'your opponent';
  const lost = q.red > q.blue;
  // settled names a match that was COUNTED here (as a loss): a window still playing it
  // must not count it again. A dropped one counted nothing, so that window may still record it.
  p.settled = lost ? q.id : '';
  let rec = null;
  if (lost) {
    rec = recordMatch(p, { outcome: 'loss', crowns: q.blue, enemyCrowns: q.red, reason: 'left' });
    const lose = rec && rec.delta < 0 ? `: −${-rec.delta} trophies` : '';
    pushNotice(p, { kind: 'interrupted', title: 'MATCH INTERRUPTED', text: `Your last match against ${who} was interrupted while they led ${q.red}-${q.blue}, so it counts as a loss${lose}.` });
  } else {
    pushNotice(p, { kind: 'interrupted', title: 'MATCH INTERRUPTED', text: `Your last match against ${who} was interrupted. You weren't behind, so it doesn't count: no trophies lost.` });
  }
  return { lost, opponent: q.opponent, blue: q.blue, red: q.red, rec };
}

// --- Trophy Trail ------------------------------------------------------------------

// Milestones by best trophies, claimable once each, forever. Reward shapes:
// grant() rewards ({ gold }, { beans }, { cards: { id: n } }, { hat, refund }),
// or { random: rarity, n } = n copies of one unlocked card of that rarity.
// Every card of a new arena is handed out shortly after its gate, with enough
// copies to upgrade it to about level 4 (near a typical deck there), so a new
// card is playable at once instead of weeks later: commons 20, rares 12,
// epics 8, legendaries 4. (The two Green Hills cards that aren't in the
// starter deck come early on the way to Pointy Pass.)
export const TRAIL = [
  { at: 10, reward: { gold: 50 } },
  { at: 25, reward: { cards: { sprouts: 20 } } },
  { at: 40, reward: { random: 'common', n: 10 } },
  { at: 70, reward: { beans: 50 } },
  { at: 100, reward: { gold: 100 } },
  { at: 120, reward: { cards: { bananaPeels: 20 } } },
  { at: 140, reward: { random: 'rare', n: 2 } },
  { at: 180, reward: { hat: 'party', refund: 100 } },
  { at: 220, reward: { gold: 150 } },
  { at: 260, reward: { random: 'common', n: 15 } },
  // Pointy Pass
  { at: 300, reward: { cards: { bruiser: 12 } } },
  { at: 330, reward: { cards: { brick: 8 } } },
  { at: 370, reward: { cards: { cheeseWheel: 8 } } },
  { at: 395, reward: { cards: { propellerPals: 20 } } },
  { at: 420, reward: { gold: 250 } },
  { at: 445, reward: { cards: { pogoBean: 12 } } },
  { at: 470, reward: { beans: 80 } },
  { at: 495, reward: { cards: { netter: 12 } } },
  { at: 520, reward: { random: 'rare', n: 4 } },
  { at: 570, reward: { hat: 'beanie', refund: 120 } },
  { at: 610, reward: { random: 'common', n: 25 } },
  // Boom Ridge
  { at: 650, reward: { cards: { bombSquad: 12 } } },
  { at: 690, reward: { cards: { megaBomb: 8 } } },
  { at: 730, reward: { cards: { shieldWall: 8 } } },
  { at: 760, reward: { cards: { bigSneeze: 20 } } },
  { at: 800, reward: { gold: 400 } },
  { at: 830, reward: { cards: { shakenSoda: 8 } } },
  { at: 860, reward: { beans: 120 } },
  { at: 890, reward: { cards: { bombJuggler: 4 } } },
  { at: 920, reward: { random: 'epic', n: 1 } },
  { at: 960, reward: { hat: 'propeller', refund: 150 } },
  // Brick Fortress
  { at: 1000, reward: { gold: 600 } },
  { at: 1020, reward: { cards: { boingBox: 20 } } },
  { at: 1050, reward: { cards: { beanPatch: 12 } } },
  { at: 1080, reward: { random: 'rare', n: 8 } },
  { at: 1110, reward: { cards: { anvil: 12 } } },
  { at: 1160, reward: { beans: 200 } },
  { at: 1200, reward: { cards: { nutcracker: 8 } } },
  { at: 1240, reward: { random: 'epic', n: 2 } },
  { at: 1280, reward: { cards: { wreckingCrane: 4 } } },
  { at: 1320, reward: { hat: 'viking', refund: 250 } },
  { at: 1400, reward: { random: 'common', n: 60 } },
  // Wobble Summit
  { at: 1500, reward: { gold: 1000, beans: 300 } },
  { at: 1520, reward: { cards: { brollyBrigade: 12 } } },
  { at: 1550, reward: { random: 'epic', n: 3 } },
  { at: 1575, reward: { cards: { bubbleWrap: 8 } } },
  { at: 1600, reward: { hat: 'crown', refund: 400 } },
  { at: 1625, reward: { cards: { tummyDrummer: 8 } } },
  { at: 1650, reward: { cards: { pelican: 4 } } },
  { at: 1700, reward: { cards: { bigJelly: 4 } } },
  { at: 1750, reward: { gold: 1500, beans: 200 } },
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

const RARITY_DOWN = { legendary: 'epic', epic: 'rare', rare: 'common', common: null };

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
 * Give back cards a claimed milestone handed out that the profile no longer has.
 * A window still running the 14-card game drops every card id it doesn't know
 * but keeps the milestones marked claimed, so its save would lose those cards
 * for good. The game runs this on every save it loads (main.js; profile.js
 * can't, as this module builds on it). The cards come back as the milestone
 * gave them; levels bought since are gone. Returns the card ids given back.
 */
export function restoreTrailCards(p) {
  const back = [];
  for (const m of TRAIL) {
    if (!p.road.claimed[m.at] || !m.reward.cards) continue;
    for (const [id, n] of Object.entries(m.reward.cards)) {
      if (p.cards[id] || !addCards(p, id, n)) continue;
      back.push(id);
      for (const k of firstsOf(CARDS[id])) p.firsts[k] = true; // (its tip was given when it first came)
    }
  }
  return back;
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
