// The card collection: which cards you own, their levels and spare copies,
// upgrades (gold + copies), King Level and the deck. Pure functions on the
// profile `p` (see profile.js).
//
// This module imports nothing from the rest of the meta game, so every other
// meta module (profile.js included) can build on it without import cycles.
// That is also why the arena table lives here: card unlocks depend on it.
// ladder.js re-exports ARENAS / arenaIndex / bestArena.
//
// Copies: a card you don't own yet arrives at level 1 and the first copy IS
// the card; every extra copy counts toward its next upgrade. So "+5 Archers"
// for a new card means: you now own Archers (level 1) with 4 spare copies.

import { CARDS, CARD_ORDER, DECK_SIZE, MAX_LEVEL, cardById } from '../sim/cards.js';

export const ARENAS = [
  { id: 0, name: 'Green Hills', trophies: 0, color: '#7fbf4a' },
  { id: 1, name: 'Pointy Pass', trophies: 300, color: '#d9a54a' },
  { id: 2, name: 'Boom Ridge', trophies: 650, color: '#d0663c' },
  { id: 3, name: 'Brick Fortress', trophies: 1000, color: '#b8746a' },
  { id: 4, name: 'Wobble Summit', trophies: 1500, color: '#8fb6dc' },
];

/** The arena a trophy count belongs to (index into ARENAS). */
export function arenaIndex(trophies) {
  const t = Number(trophies) || 0;
  let i = 0;
  for (let k = 1; k < ARENAS.length; k++) if (t >= ARENAS[k].trophies) i = k;
  return i;
}

/** The best arena ever reached (by best trophies). Cards unlock by this. */
export const bestArena = (p) => arenaIndex(p.best);

// Index L-1 = what it takes to go from level L to L+1.
export const UPGRADE_COPIES = {
  common: [2, 4, 10, 20, 50, 100, 200, 400],
  rare: [1, 2, 4, 10, 20, 50, 100, 200],
  epic: [1, 1, 2, 4, 10, 20, 40, 80],
  legendary: [1, 1, 1, 2, 3, 5, 8, 12],
};
export const UPGRADE_GOLD = {
  common: [5, 20, 50, 150, 400, 1000, 2000, 4000],
  rare: [20, 50, 150, 400, 1000, 2000, 4000, 8000],
  epic: [50, 150, 400, 1000, 2000, 4000, 8000, 15000],
  legendary: [100, 300, 800, 2000, 4000, 8000, 15000, 25000],
};
// King XP for an upgrade to the new level 2..9 (index = new level - 2).
export const KING_XP = [4, 5, 6, 10, 25, 50, 100, 200];
// Cumulative King XP needed to reach King Level 2..9.
export const KING_LEVELS = [20, 60, 140, 300, 600, 1200, 2400, 4800];
export const MAX_KING_LEVEL = KING_LEVELS.length + 1;

export function kingLevelForXp(xp) {
  let lv = 1;
  for (const need of KING_LEVELS) if (xp >= need) lv++;
  return lv;
}

/**
 * King Level progress: { level, xp, from, need, max }. xp is cumulative; the
 * bar runs from `from` (XP that reached this level) to `need` (XP for the next
 * one). At the top level max is true and need is the last threshold.
 */
export function kingInfo(p) {
  const xp = p.king.xp;
  const level = kingLevelForXp(xp);
  const max = level >= MAX_KING_LEVEL;
  return { level, xp, from: level > 1 ? KING_LEVELS[level - 2] : 0, need: max ? KING_LEVELS[KING_LEVELS.length - 1] : KING_LEVELS[level - 1], max };
}

// Cards that can hit a flier high up: units that hit air and the spells that
// reach the sky. Bots always carry one, and the deck editor warns without one.
export const AIR_ANSWERS = ['archers', 'arrowRain', 'netter', 'bombJuggler', 'bigSneeze', 'shakenSoda', 'anvil'];

/** Card ids that a given arena has unlocked (CARD_ORDER order). */
export const cardsUpTo = (arena) => CARD_ORDER.filter((id) => CARDS[id].arena <= arena);
export const unlockedCards = (p) => cardsUpTo(bestArena(p));
export const lockedCards = (p) => CARD_ORDER.filter((id) => CARDS[id].arena > bestArena(p));
export const ownedCards = (p) => CARD_ORDER.filter((id) => p.cards[id]);
/** Fliers can show up (an arena with a flying card is unlocked: Pointy Pass on). */
export const fliersUnlocked = (p) => unlockedCards(p).some((id) => CARDS[id].flying);
/** True when fliers can show up and the deck has nothing that hits them high up. */
export const deckNeedsAir = (p) => fliersUnlocked(p) && !p.deck.some((id) => AIR_ANSWERS.includes(id));

/**
 * Everything the UI shows about one card, or null for an unknown id.
 * { id, card, rarity, owned, level, count, need, gold, maxed, ready, canUpgrade, locked, arena, inDeck }
 * Not owned: level 0, count/need/gold 0. need/gold are for the next level
 * (0 when maxed). ready = enough copies; canUpgrade = enough copies AND gold.
 */
export function cardState(p, id) {
  const card = cardById(id);
  if (!card) return null;
  const own = p.cards[id];
  const owned = !!own;
  const level = owned ? own.level : 0;
  const count = owned ? own.count : 0;
  const maxed = owned && level >= MAX_LEVEL;
  const need = owned && !maxed ? UPGRADE_COPIES[card.rarity][level - 1] : 0;
  const gold = owned && !maxed ? UPGRADE_GOLD[card.rarity][level - 1] : 0;
  const ready = owned && !maxed && count >= need;
  return {
    id,
    card,
    rarity: card.rarity,
    owned,
    level,
    count,
    need,
    gold,
    maxed,
    ready,
    canUpgrade: ready && p.gold >= gold,
    locked: card.arena > bestArena(p),
    arena: card.arena,
    inDeck: p.deck.includes(id),
  };
}

/**
 * Give n copies of a card (see the note at the top: a new card's first copy
 * is the card). Returns { id, n, rarity, isNew, levelBefore, countBefore,
 * level, count, need, ready } or null for an unknown id / n < 1.
 * Copies of a maxed card still count (nothing uses them yet).
 */
export function addCards(p, id, n) {
  const card = cardById(id);
  const k = Math.floor(Number(n));
  if (!card || !(k >= 1)) return null;
  const own = p.cards[id];
  const isNew = !own;
  const levelBefore = own ? own.level : 0;
  const countBefore = own ? own.count : 0;
  if (isNew) p.cards[id] = { level: 1, count: k - 1 };
  else own.count += k;
  const s = cardState(p, id);
  return { id, n: k, rarity: card.rarity, isNew, levelBefore, countBefore, level: s.level, count: s.count, need: s.need, ready: s.ready };
}

/**
 * Upgrade a card with gold + copies; pays King XP.
 * { ok, reason?, level, xpGained, kingBefore, kingAfter, gold, copies }
 * reason: 'unknown' | 'notOwned' | 'maxed' | 'copies' | 'gold'.
 */
export function upgradeCard(p, id) {
  const s = cardState(p, id);
  const kingBefore = kingLevelForXp(p.king.xp);
  const fail = (reason) => ({ ok: false, reason, level: s ? s.level : 0, xpGained: 0, kingBefore, kingAfter: kingBefore, gold: 0, copies: 0 });
  if (!s) return fail('unknown');
  if (!s.owned) return fail('notOwned');
  if (s.maxed) return fail('maxed');
  if (s.count < s.need) return fail('copies');
  if (p.gold < s.gold) return fail('gold');
  const own = p.cards[id];
  own.count -= s.need;
  own.level++;
  p.gold -= s.gold;
  const xpGained = KING_XP[own.level - 2] || 0;
  p.king.xp += xpGained;
  p.king.level = kingLevelForXp(p.king.xp);
  p.stats.upgrades = (p.stats.upgrades || 0) + 1;
  return { ok: true, level: own.level, xpGained, kingBefore, kingAfter: p.king.level, gold: s.gold, copies: s.need };
}

/** How many cards could be upgraded right now (copies and gold). */
export const upgradableCount = (p) => CARD_ORDER.filter((id) => cardState(p, id).canUpgrade).length;

// --- deck --------------------------------------------------------------------------

/**
 * Put an owned card into deck slot 0..7. If it is already in the deck the two
 * slots swap, so the deck always stays 8 unique cards. Returns true if done.
 */
export function swapIntoDeck(p, cardId, slot) {
  if (!p.cards[cardId] || !Number.isInteger(slot) || slot < 0 || slot >= DECK_SIZE) return false;
  const at = p.deck.indexOf(cardId);
  if (at === slot) return true;
  const out = p.deck[slot];
  p.deck[slot] = cardId;
  if (at >= 0) p.deck[at] = out;
  return true;
}

/** Average mana cost of the deck (unrounded; show it with toFixed(1)). */
export function deckAvgMana(p) {
  if (!p.deck.length) return 0;
  return p.deck.reduce((s, id) => s + (cardById(id) ? cardById(id).mana : 0), 0) / p.deck.length;
}

/** Average card level of the deck (unrounded). (Bots mirror the deck card by card: opponents.js.) */
export function deckLevel(p) {
  if (!p.deck.length) return 1;
  return p.deck.reduce((s, id) => s + (p.cards[id] ? p.cards[id].level : 1), 0) / p.deck.length;
}
