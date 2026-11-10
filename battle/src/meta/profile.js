// The player's profile: everything that persists between sessions.
// Plain data, saved to localStorage as JSON. Pure functions (the storage is
// passed in) so the whole meta game is testable headless.
//
// v2 (Arena): gold + Jellybeans, a card collection and deck, King Level,
// trophies, the Trophy Trail, the two menu chests, the daily shop and badges.
// v1 saves (the campaign game) migrate: Jellybeans, cosmetics, settings,
// supporter, stats and still-existing badges carry over, campaign stars turn
// into a veteran gift of gold, the rest of the campaign is dropped.
//
// Every random roll in the meta game comes from rngFrom(p.seed, ...) so it
// is reproducible (and testable); only newProfile() without a seed uses
// Math.random, to pick that seed.

import { cardById, STARTER_DECK, DECK_SIZE, MAX_LEVEL } from '../sim/cards.js';
import { ARENAS, arenaIndex, addCards, cardState, kingLevelForXp, KING_LEVELS } from './collection.js';

export const PROFILE_KEY = 'wobblewar.profile.v1'; // same key as v1: the save upgrades in place
export const PROFILE_VERSION = 2;
// Unit types that can wear a hat (sim/unit-types.js ids). The Sprout, Propeller
// Pal, Nutcracker and Pelican have their own headgear (noHat) and never do.
export const UNIT_IDS = ['clubber', 'squire', 'archer', 'spiker', 'bomb', 'brick', 'bruiser', 'megabomb', 'pogo', 'netter', 'juggler', 'brolly', 'drummer', 'jelly'];
// v1 achievements ("trophies") that still exist as badges with the same meaning.
export const V1_BADGE_IDS = ['firstWin', 'knockdowns', 'kills', 'flyer', 'pincushion', 'chain', 'boing', 'giants', 'dressUp', 'yeet'];
export const VETERAN_GIFT = { perStar: 20, max: 2000 };
// Jellybeans paid instead when a reward hat / colour is already owned.
export const DUPLICATE_REFUND = 100;

const STATS = [
  // v1 (battle events)
  'battles', 'wins', 'knockdowns', 'kills', 'highFlights', 'pincushions', 'chains', 'boings', 'bricksDefeated', 'flawless', 'dailies', 'hatsEquipped',
  'yeets', 'booms',
  // v2
  'matches', 'losses', 'draws', 'threeCrowns', 'towers', 'cardsPlayed', 'spells', 'chests', 'upgrades',
  // the 32 cards (battle events, counted by main.js)
  'slips', 'homeRuns', 'airMail', 'jellySpits', 'craneLaunches',
];
// One-time tips, shown the first time a card of that sort arrives (grant()).
export const FIRSTS = ['flier', 'building', 'legendary'];
/** Which of FIRSTS a card is (a Pelican is both a flier and a legendary). */
export function firstsOf(card) {
  if (!card) return [];
  const out = [];
  if (card.flying) out.push('flier');
  if (card.kind === 'building') out.push('building');
  if (card.rarity === 'legendary') out.push('legendary');
  return out;
}
const SETTINGS = { sound: true, volume: 0.8, haptics: true, shake: true };
const MAX_NUM = Number.MAX_SAFE_INTEGER;

// --- seeded randomness -----------------------------------------------------------

/** FNV-1a 32-bit hash of a string. */
export function hashStr(s) {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * A small seeded RNG (mulberry32) keyed by any parts, e.g.
 * rngFrom(p.seed, 'chest', 'small', 3). Same parts, same rolls.
 * { next() 0..1, int(lo, hi) inclusive, pick(arr), chance(q), shuffle(arr) in place }
 */
export function rngFrom(...parts) {
  let a = hashStr(parts.join('|'));
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (q) => next() < q,
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

// --- new profile -------------------------------------------------------------------

export function newProfile(seed) {
  const s = Number.isFinite(seed) ? seed >>> 0 : Math.floor(Math.random() * 4294967296) >>> 0;
  return {
    v: PROFILE_VERSION,
    name: 'You',
    seed: s,
    gold: 0,
    goldEarned: 0, // lifetime gold
    beans: 0, // Jellybeans: cosmetics only
    earned: 0, // lifetime Jellybeans
    cards: Object.fromEntries(STARTER_DECK.map((id) => [id, { level: 1, count: 0 }])),
    deck: STARTER_DECK.slice(),
    king: { level: 1, xp: 0 }, // xp is cumulative; level follows it
    trophies: 0,
    best: 0, // highest trophies ever: arenas, card unlocks and the Trail go by this
    road: { claimed: {} }, // Trophy Trail: milestone `at` -> true
    chests: { small: { readyAt: 0 }, big: { readyAt: 0 }, opened: { small: 0, big: 0 } },
    shop: { day: '', bought: [], free: false, arena: 0 },
    badges: {}, // id -> { claimed: true }
    stats: Object.fromEntries(STATS.map((k) => [k, 0])),
    owned: { hats: ['none'], colors: ['blue'] },
    equipped: { color: 'blue', hats: Object.fromEntries(UNIT_IDS.map((id) => [id, 'none'])) },
    tutorial: 0, // tutorial steps finished (0 = first match not played yet)
    firsts: Object.fromEntries(FIRSTS.map((k) => [k, false])), // one-time tips already given (see grant)
    // A ladder match in progress (ladder.js startPending): a reload or a killed app
    // mid-match is settled from it on the next start. settled = the last one counted that way (as a loss).
    pending: null, // { id, opponent, startedAt, blue, red }
    settled: '',
    settings: { ...SETTINGS },
    supporter: false,
    notices: [], // one-off messages for the UI: { kind, ... }
  };
}

// --- migration / sanitizing ---------------------------------------------------------

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const obj = (v) => (isObj(v) ? v : {});
/** A whole number >= 0 from anything (strings like "12" count), else d. */
function num(v, d = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, MAX_NUM) : d;
}
const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);

/** Seed from a save, or a stable one hashed from its content (never random). */
function seedOf(raw) {
  const s = Number(raw.seed);
  return Number.isFinite(s) && raw.seed !== null && raw.seed !== '' ? s >>> 0 : hashStr(JSON.stringify(raw) || '');
}

function cleanStats(raw) {
  const out = {};
  const src = obj(raw);
  for (const k of STATS) out[k] = num(src[k]);
  // Keep counters other modules may add later, if they are numbers.
  for (const [k, v] of Object.entries(src)) if (!(k in out) && typeof v === 'number') out[k] = num(v);
  return out;
}

function cleanSettings(raw) {
  const src = obj(raw);
  const out = { ...SETTINGS };
  for (const [k, v] of Object.entries(src)) if (v === null || ['boolean', 'number', 'string'].includes(typeof v)) out[k] = v;
  for (const k of ['sound', 'haptics', 'shake']) if (typeof out[k] !== 'boolean') out[k] = SETTINGS[k];
  const vol = Number(out.volume);
  out.volume = Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : SETTINGS.volume;
  return out;
}

function cleanCosmetics(p, raw) {
  const owned = obj(raw.owned);
  p.owned.hats = Array.from(new Set(['none', ...strList(owned.hats)]));
  p.owned.colors = Array.from(new Set(['blue', ...strList(owned.colors)]));
  const eq = obj(raw.equipped);
  p.equipped.color = typeof eq.color === 'string' && p.owned.colors.includes(eq.color) ? eq.color : 'blue';
  const hats = obj(eq.hats);
  for (const u of UNIT_IDS) p.equipped.hats[u] = typeof hats[u] === 'string' && p.owned.hats.includes(hats[u]) ? hats[u] : 'none';
}

function cleanNotices(raw) {
  return (Array.isArray(raw) ? raw : []).filter((n) => isObj(n) && typeof n.kind === 'string').slice(-20);
}

/**
 * A save that has the v2 shape whatever its `v` says: a window still running
 * the v1 code adopts a v2 save, sets v back to 1 (and mangles trophies) and
 * writes it back. It is still a v2 profile, not a campaign to migrate again.
 */
export const looksV2 = (raw) => isObj(raw) && ((isObj(raw.cards) && Array.isArray(raw.deck)) || isObj(raw.king) || isObj(raw.road));

/**
 * Bring any saved data up to a valid v2 profile without losing progress.
 * v1 (or unversioned) saves are migrated, v2 saves are filled in and
 * sanitized, junk gives a fresh profile.
 */
export function migrate(raw) {
  if (!isObj(raw)) return newProfile();
  return Number(raw.v) >= 2 || looksV2(raw) ? fromV2(raw) : fromV1(raw);
}

function fromV1(raw) {
  const p = newProfile(seedOf(raw));
  p.beans = num(raw.beans);
  p.earned = Math.max(p.beans, num(raw.earned));
  cleanCosmetics(p, raw);
  p.settings = cleanSettings(raw.settings);
  p.supporter = raw.supporter === true;
  p.stats = cleanStats(raw.stats);
  for (const [id, t] of Object.entries(obj(raw.trophies))) if (V1_BADGE_IDS.includes(id) && isObj(t) && t.claimed) p.badges[id] = { claimed: true };
  // Campaign stars become gold; the campaign itself is gone.
  let stars = 0;
  for (const v of Object.values(obj(raw.stars))) stars += Math.min(3, num(v));
  // (no stars, no gift: a sandbox-only player gets no "0 gold for your 0 stars")
  const gold = addGold(p, Math.min(VETERAN_GIFT.max, stars * VETERAN_GIFT.perStar));
  if (gold > 0) p.notices.push({ kind: 'veteran', gold, stars });
  p.tutorial = 0;
  return p;
}

function fromV2(raw) {
  const p = newProfile(seedOf(raw));
  p.name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 16) : 'You';
  p.gold = num(raw.gold);
  p.goldEarned = Math.max(p.gold, num(raw.goldEarned));
  p.beans = num(raw.beans);
  p.earned = Math.max(p.beans, num(raw.earned));

  // Cards: known ids only, levels 1..MAX_LEVEL. Starter cards are always owned.
  for (const [id, c] of Object.entries(obj(raw.cards))) {
    if (!cardById(id)) continue; // (own keys only: 'toString' is not a card)
    const src = obj(c);
    p.cards[id] = { level: Math.max(1, Math.min(MAX_LEVEL, num(src.level, 1))), count: num(src.count) };
  }
  // Deck: exactly 8 unique owned cards, else repaired with starter cards.
  const deck = [];
  for (const id of Array.isArray(raw.deck) ? raw.deck : []) {
    if (cardById(id) && p.cards[id] && !deck.includes(id) && deck.length < DECK_SIZE) deck.push(id);
  }
  for (const id of STARTER_DECK) if (deck.length < DECK_SIZE && !deck.includes(id)) deck.push(id);
  p.deck = deck;

  // King: XP is the truth; a level without matching XP is honoured.
  const king = obj(raw.king);
  let xp = num(king.xp);
  const lv = Math.min(KING_LEVELS.length + 1, num(king.level, 1));
  if (lv > kingLevelForXp(xp)) xp = KING_LEVELS[lv - 2];
  p.king = { level: kingLevelForXp(xp), xp };

  // Trophies never sit below the gate of the best arena reached.
  p.best = Math.max(num(raw.best), num(raw.trophies));
  p.trophies = Math.max(num(raw.trophies), ARENAS[arenaIndex(p.best)].trophies);

  for (const [at, v] of Object.entries(obj(obj(raw.road).claimed))) if (v === true && /^\d+$/.test(at)) p.road.claimed[at] = true;

  const ch = obj(raw.chests);
  for (const k of ['small', 'big']) {
    p.chests[k].readyAt = num(obj(ch[k]).readyAt);
    p.chests.opened[k] = num(obj(ch.opened)[k]);
  }

  const shop = obj(raw.shop);
  p.shop.day = typeof shop.day === 'string' && /^\d{4,}-\d\d-\d\d$/.test(shop.day) ? shop.day : '';
  p.shop.bought = Array.from(new Set((Array.isArray(shop.bought) ? shop.bought : []).filter((i) => Number.isInteger(i) && i >= 0 && i < 10)));
  p.shop.free = shop.free === true;
  p.shop.arena = Math.min(ARENAS.length - 1, num(shop.arena));

  for (const [id, b] of Object.entries(obj(raw.badges))) if (isObj(b) && b.claimed) p.badges[id] = { claimed: true };
  p.stats = cleanStats(raw.stats);
  cleanCosmetics(p, raw);
  p.tutorial = num(raw.tutorial);
  // (a card of that sort already owned counts as told: no tip for old news)
  const firsts = obj(raw.firsts);
  for (const k of FIRSTS) p.firsts[k] = firsts[k] === true || Object.keys(p.cards).some((id) => firstsOf(cardById(id)).includes(k));
  p.pending = cleanPending(raw.pending);
  p.settled = typeof raw.settled === 'string' ? raw.settled.slice(0, 40) : '';
  p.settings = cleanSettings(raw.settings);
  p.supporter = raw.supporter === true;
  p.notices = cleanNotices(raw.notices);
  return p;
}

function cleanPending(raw) {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  const name = typeof raw.opponent === 'string' ? raw.opponent.slice(0, 40) : '';
  return { id: raw.id.slice(0, 40), opponent: name, startedAt: num(raw.startedAt), blue: Math.min(3, num(raw.blue)), red: Math.min(3, num(raw.red)) };
}

export function loadProfile(storage) {
  try {
    const raw = storage && storage.getItem(PROFILE_KEY);
    return migrate(raw ? JSON.parse(raw) : null);
  } catch {
    return newProfile();
  }
}

export function saveProfile(p, storage) {
  try {
    if (storage) storage.setItem(PROFILE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false; // private mode / full: the game keeps working, it just won't remember
  }
}

// --- currencies --------------------------------------------------------------------

const amount = (n) => {
  const k = Math.floor(Number(n));
  return Number.isFinite(k) && k > 0 ? k : 0;
};

/** Add Jellybeans; returns the whole amount actually added. */
export function addBeans(p, n) {
  const k = amount(n);
  p.beans += k;
  p.earned += k;
  return k;
}

/** Spend if affordable. Returns true on success. */
export function spendBeans(p, n) {
  if (!(n >= 0) || p.beans < n) return false;
  p.beans -= n;
  return true;
}

export function addGold(p, n) {
  const k = amount(n);
  p.gold += k;
  p.goldEarned += k;
  return k;
}

export function spendGold(p, n) {
  if (!(n >= 0) || p.gold < n) return false;
  p.gold -= n;
  return true;
}

/**
 * Pay out a reward: { gold?, beans?, cards?: { id: n }, hat?, color?, refund? }.
 * Gold first, then Jellybeans, then cards, then cosmetics. A hat or colour you
 * already own pays `refund` (default DUPLICATE_REFUND) Jellybeans instead.
 * Returns a normalized summary for the UI:
 * { gold, beans, cards: [{ id, n, rarity, isNew, levelBefore, countBefore, level, count, need, canUpgradeAfter, canUpgrade, goldNeed }], hat, color, refund }
 * where beans includes any refund, hat/color are the newly owned ids (or null),
 * canUpgradeAfter means "enough copies for the next level" after this reward,
 * canUpgrade "copies AND gold" and goldNeed the gold still missing (0 if none).
 */
export function grant(p, reward) {
  const r = isObj(reward) ? reward : {};
  const out = { gold: addGold(p, r.gold), beans: addBeans(p, r.beans), cards: [], hat: null, color: null, refund: 0 };
  const list = Array.isArray(r.cards) ? r.cards.map((c) => [c && c.id, c && c.n]) : Object.entries(obj(r.cards));
  for (const [id, n] of list) {
    const c = addCards(p, id, n);
    if (!c) continue;
    const prev = out.cards.find((x) => x.id === id);
    if (prev) prev.n += c.n; // the same card twice in one reward: one stack
    else out.cards.push(c);
  }
  for (const c of out.cards) {
    const s = cardState(p, c.id);
    Object.assign(c, { level: s.level, count: s.count, need: s.need, canUpgradeAfter: s.ready, canUpgrade: s.canUpgrade, goldNeed: s.ready ? Math.max(0, s.gold - p.gold) : 0 });
    delete c.ready;
    // The first flier, building or legendary: a friendly tip, once each
    const what = c.isNew ? firstsOf(cardById(c.id)).filter((k) => !p.firsts[k]) : [];
    for (const k of what) p.firsts[k] = true;
    if (what.length) pushNotice(p, { kind: 'first', card: c.id, what });
  }
  const refund = r.refund == null ? DUPLICATE_REFUND : r.refund;
  for (const [key, list2] of [['hat', 'hats'], ['color', 'colors']]) {
    const id = r[key];
    if (typeof id !== 'string' || !id) continue;
    if (!p.owned[list2].includes(id)) {
      p.owned[list2].push(id);
      out[key] = id;
    } else {
      const k = addBeans(p, refund);
      out.refund += k;
      out.beans += k;
    }
  }
  return out;
}

// --- notices ------------------------------------------------------------------------

export function pushNotice(p, notice) {
  if (isObj(notice) && typeof notice.kind === 'string') p.notices.push(notice);
}

/** Take the oldest notice (removes it), or null. */
export function popNotice(p) {
  return p.notices.length ? p.notices.shift() : null;
}
