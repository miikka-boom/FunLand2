// Wobble War meta game (Arena): profile v2 + migration, card collection and
// King Level, ladder and Trophy Trail, the two menu chests, the daily shop,
// badges, bot opponents and cosmetics. All pure functions, run headless.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS, CARD_ORDER, STARTER_DECK, DECK_SIZE, MAX_LEVEL } from '../battle/src/sim/cards.js';
import { HATS } from '../battle/src/render/hats.js';
import {
  newProfile, migrate, loadProfile, saveProfile, addBeans, spendBeans, addGold, spendGold, grant, popNotice, pushNotice, rngFrom, hashStr, looksV2,
  PROFILE_KEY, PROFILE_VERSION, UNIT_IDS, V1_BADGE_IDS, VETERAN_GIFT, DUPLICATE_REFUND,
} from '../battle/src/meta/profile.js';
import {
  ARENAS as ARENAS_C, arenaIndex as arenaIndexC, bestArena, UPGRADE_COPIES, UPGRADE_GOLD, KING_XP, KING_LEVELS, MAX_KING_LEVEL, kingLevelForXp, kingInfo,
  cardState, addCards, upgradeCard, upgradableCount, swapIntoDeck, deckAvgMana, deckLevel, unlockedCards, lockedCards, ownedCards, cardsUpTo,
} from '../battle/src/meta/collection.js';
import {
  ARENAS, arenaIndex, arenaFloor, arenaProgress, MATCH_REWARDS, recordMatch, TRAIL, trailStatus, claimTrail, claimableTrail,
  startPending, updatePending, settlePending,
} from '../battle/src/meta/ladder.js';
import { CHESTS, CHEST_KINDS, CHEST_GRACE, chestState, openChest, chestOdds, rollChest, readyChests } from '../battle/src/meta/chests.js';
import { SHOP, dayKey, shopToday, claimFree, buyOffer, msToRestock } from '../battle/src/meta/shop.js';
import { BADGES, badgeStatus, claimableBadges, claimBadge } from '../battle/src/meta/badges.js';
import { makeOpponent, BOT_NAMES, LEVEL_FLOOR, LEVEL_CURVE, levelCap, ARCHETYPES, TUTORIAL_OPPONENT } from '../battle/src/meta/opponents.js';
import { COLORS, HAT_UNITS, buyItem, equipColor, equipHat, armyPalette, grantSupporter } from '../battle/src/meta/cosmetics.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOUR = 3600e3;
const NOW = new Date(2026, 10, 5, 10, 30).getTime(); // a local date: 2026-11-05 10:30

const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};
const clone = (p) => JSON.parse(JSON.stringify(p));
const isCount = (v) => Number.isInteger(v) && v >= 0;
// Words from other games that never appear in our text (spec, section 0).
const AVOID = ['Elixir', 'Princess', 'King Tower', 'Clash', 'Royale', 'Crown Chest', 'Trophy Road', 'Gems'];

/** A profile the given trophies in, as if played there (best + trophies). */
function at(trophies, seed = 7) {
  const p = newProfile(seed);
  p.trophies = p.best = trophies;
  p.tutorial = 1;
  return p;
}

/** Every invariant a v2 profile must hold, whatever it was made from. */
function assertValid(p) {
  assert.equal(p.v, PROFILE_VERSION);
  assert.ok(Number.isInteger(p.seed) && p.seed >= 0 && p.seed < 2 ** 32, 'seed is a uint32');
  for (const k of ['gold', 'goldEarned', 'beans', 'earned', 'trophies', 'best', 'tutorial']) assert.ok(isCount(p[k]), `${k} = ${p[k]}`);
  assert.ok(p.goldEarned >= p.gold && p.earned >= p.beans);
  assert.ok(p.best >= p.trophies && p.trophies >= ARENAS[arenaIndex(p.best)].trophies, 'trophies sit at or above the best arena gate');
  for (const [id, c] of Object.entries(p.cards)) {
    assert.ok(CARDS[id], `known card ${id}`);
    assert.ok(Number.isInteger(c.level) && c.level >= 1 && c.level <= MAX_LEVEL, `${id} level ${c.level}`);
    assert.ok(isCount(c.count), `${id} count`);
  }
  assert.equal(p.deck.length, DECK_SIZE);
  assert.equal(new Set(p.deck).size, DECK_SIZE, 'deck is unique');
  for (const id of p.deck) assert.ok(p.cards[id], `deck card ${id} is owned`);
  assert.equal(p.king.level, kingLevelForXp(p.king.xp));
  for (const k of CHEST_KINDS) {
    assert.ok(isCount(p.chests[k].readyAt));
    assert.ok(isCount(p.chests.opened[k]));
  }
  for (const v of Object.values(p.stats)) assert.ok(isCount(v));
  assert.deepEqual(Object.keys(p.equipped.hats).sort(), UNIT_IDS.slice().sort());
  for (const h of Object.values(p.equipped.hats)) assert.ok(p.owned.hats.includes(h));
  assert.ok(p.owned.hats.includes('none') && p.owned.colors.includes('blue'));
  assert.ok(Array.isArray(p.notices) && Array.isArray(p.shop.bought));
  assert.equal(typeof p.settings.sound, 'boolean');
  assert.ok(p.settings.volume >= 0 && p.settings.volume <= 1);
}

// --- modules ---------------------------------------------------------------------------

test('modules: each meta module loads on its own in node (no import-order traps)', () => {
  for (const m of ['profile', 'collection', 'ladder', 'chests', 'shop', 'badges', 'opponents', 'cosmetics']) {
    const url = new URL(`../battle/src/meta/${m}.js`, import.meta.url).href;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)});`], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, `${m}.js: ${r.stderr}`);
  }
});

test('determinism: no meta roll uses Math.random (only newProfile without a seed)', () => {
  const real = Math.random;
  Math.random = () => {
    throw new Error('Math.random in a meta roll');
  };
  try {
    const p = newProfile(99);
    openChest(p, 'small', NOW);
    openChest(p, 'big', NOW);
    shopToday(p, NOW);
    claimFree(p, NOW);
    p.trophies = p.best = 760;
    for (const m of TRAIL) claimTrail(p, m.at);
    makeOpponent(p, 3);
    p.tutorial = 1;
    makeOpponent(p, 4);
    recordMatch(p, { outcome: 'win', crowns: 1, enemyCrowns: 0 });
    migrate({ v: 1, beans: 5, stars: { 0: 2 } });
    migrate({ v: 2, gold: 10 });
    migrate(clone(p));
  } finally {
    Math.random = real;
  }
  const a = newProfile();
  assert.ok(Number.isInteger(a.seed) && a.seed >= 0 && a.seed < 2 ** 32);
});

test('rng: seeded by parts, reproducible, sane ranges', () => {
  const a = rngFrom(1, 'x', 2);
  const b = rngFrom(1, 'x', 2);
  const xs = Array.from({ length: 50 }, () => a.next());
  assert.deepEqual(xs, Array.from({ length: 50 }, () => b.next()));
  assert.notDeepEqual(xs, Array.from({ length: 50 }, () => rngFrom(1, 'x', 3).next()));
  const r = rngFrom('ints');
  for (let i = 0; i < 500; i++) {
    const v = r.int(3, 5);
    assert.ok(v >= 3 && v <= 5 && Number.isInteger(v));
  }
  assert.equal(hashStr('abc'), hashStr('abc'));
  assert.deepEqual(r.shuffle([1, 2, 3, 4, 5]).sort(), [1, 2, 3, 4, 5]);
});

// --- profile -----------------------------------------------------------------------------

test('profile: a fresh v2 profile, saved and loaded', () => {
  const p = newProfile(1234);
  assertValid(p);
  assert.equal(p.seed, 1234);
  assert.equal(newProfile(1234).seed, 1234, 'the seed is kept as given');
  assert.deepEqual(p.deck, STARTER_DECK);
  for (const id of STARTER_DECK) assert.deepEqual(p.cards[id], { level: 1, count: 0 });
  assert.equal(Object.keys(p.cards).length, STARTER_DECK.length, 'only the starter cards are owned');
  assert.deepEqual(p.king, { level: 1, xp: 0 });
  assert.ok(UNIT_IDS.includes('bruiser') && UNIT_IDS.includes('megabomb'));
  assert.equal(p.equipped.hats.megabomb, 'none');
  assert.equal(p.tutorial, 0);

  const s = memStore();
  addGold(p, 77);
  p.owned.hats.push('party');
  assert.ok(saveProfile(p, s));
  assert.ok(s.m.has(PROFILE_KEY));
  assert.equal(PROFILE_KEY, 'wobblewar.profile.v1', 'same key as v1: saves upgrade in place');
  const q = loadProfile(s);
  assert.deepEqual(q, p, 'a valid v2 profile survives a round trip unchanged');

  // Junk never crashes the game
  s.setItem(PROFILE_KEY, '{nope');
  assertValid(loadProfile(s));
  assertValid(loadProfile(null));
  assertValid(migrate('hello'));
  assertValid(migrate([1, 2]));
  assertValid(migrate(null));
  assert.equal(saveProfile(p, { setItem() { throw new Error('quota'); } }), false);
});

test('currencies: gold and Jellybeans add up, spending needs enough', () => {
  const p = newProfile(1);
  assert.equal(addBeans(p, 10.7), 10);
  assert.equal(addBeans(p, NaN), 0);
  assert.equal(addBeans(p, -5), 0);
  assert.equal(spendBeans(p, 11), false);
  assert.ok(spendBeans(p, 4));
  assert.equal(p.beans, 6);
  assert.equal(p.earned, 10, 'spending never lowers lifetime earnings');
  assert.equal(spendBeans(p, -1), false);

  assert.equal(addGold(p, 50.9), 50);
  assert.equal(addGold(p, 'lots'), 0);
  assert.equal(spendGold(p, 51), false);
  assert.ok(spendGold(p, 20));
  assert.equal(p.gold, 30);
  assert.equal(p.goldEarned, 50);
  assert.equal(spendGold(p, NaN), false);
});

test('migration v1 -> v2: a realistic campaign save with odd types', () => {
  const v1 = {
    v: 1,
    beans: 340,
    earned: 900,
    stars: { 0: 3, 1: 2, 2: '3', 3: 7, 4: -1, 5: 'abc', 6: null, 9: 3 }, // 3+2+3+3(clamped)+0+0+0+3 = 14
    cleared: { 0: true, 1: true, 2: true, 3: true, 9: true },
    owned: { hats: ['none', 'party', 'viking', 5, null, ''], colors: ['blue', 'green', { x: 1 }] },
    equipped: { color: 'green', hats: { clubber: 'party', squire: 'wizard', archer: 7, brick: 'viking' } },
    trophies: {
      firstWin: { claimed: true },
      knockdowns: { claimed: true },
      world1: { claimed: true },
      stars: { claimed: true },
      kills: { claimed: false },
      yeet: 'yes',
    },
    stats: { battles: 40, wins: '12', knockdowns: 310, kills: 'NaN', yeets: 1.9, hatsEquipped: 2, booms: -4, dailies: 3 },
    daily: { done: { '2026-11-01': 3 } },
    tutorial: 3,
    settings: { sound: false, volume: 2, haptics: 'no', shake: false },
    supporter: true,
  };
  const p = migrate(clone(v1));
  assertValid(p);
  assert.equal(p.beans, 340);
  assert.equal(p.earned, 900);
  assert.equal(p.gold, 14 * VETERAN_GIFT.perStar, 'veteran gift: 20 gold per campaign star');
  assert.equal(p.goldEarned, p.gold);
  assert.deepEqual(p.notices, [{ kind: 'veteran', gold: 280, stars: 14 }]);
  assert.deepEqual(p.owned.hats, ['none', 'party', 'viking']);
  assert.deepEqual(p.owned.colors, ['blue', 'green']);
  assert.equal(p.equipped.color, 'green');
  assert.equal(p.equipped.hats.clubber, 'party');
  assert.equal(p.equipped.hats.brick, 'viking');
  assert.equal(p.equipped.hats.squire, 'none', 'a hat you do not own comes off');
  assert.equal(p.equipped.hats.archer, 'none');
  assert.equal(p.equipped.hats.bruiser, 'none', 'new unit types get a hat slot');
  assert.deepEqual(p.badges, { firstWin: { claimed: true }, knockdowns: { claimed: true } }, 'only claimed achievements that still exist as badges');
  assert.equal(p.stats.battles, 40);
  assert.equal(p.stats.wins, 12);
  assert.equal(p.stats.knockdowns, 310);
  assert.equal(p.stats.kills, 0);
  assert.equal(p.stats.yeets, 1);
  assert.equal(p.stats.booms, 0);
  assert.equal(p.stats.matches, 0);
  assert.equal(p.tutorial, 0, 'the tutorial restarts for the new game');
  assert.deepEqual(p.settings, { sound: false, volume: 1, haptics: true, shake: false });
  assert.equal(p.supporter, true);
  for (const k of ['stars', 'cleared', 'daily']) assert.ok(!(k in p), `campaign data (${k}) is dropped`);
  assert.equal(p.trophies, 0);
  assert.deepEqual(p.deck, STARTER_DECK);
  assert.ok(CHEST_KINDS.every((k) => chestState(p, k, NOW).ready), 'both chests ready for the returning player');

  // Stable: the same save migrates the same way (seed too), and again is a no-op
  assert.deepEqual(migrate(clone(v1)), p);
  const again = migrate(clone(p));
  assert.deepEqual(again, p);
  assert.equal(popNotice(again).kind, 'veteran');
  assert.equal(popNotice(again), null);

  // The gift is capped; an unversioned old save is a v1 save; no progress, no notice
  const stars = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [i, 3]));
  assert.equal(migrate({ v: 1, stars }).gold, VETERAN_GIFT.max);
  const old = migrate({ beans: 50, stars: { 0: 1 }, stats: { wins: 4 } });
  assertValid(old);
  assert.equal(old.beans, 50);
  assert.equal(old.gold, 20);
  assert.equal(old.stats.wins, 4);
  const blank = migrate({ v: 1, settings: { volume: 0.3 } });
  assert.deepEqual(blank.notices, []);
  assert.equal(blank.gold, 0);
  assert.equal(blank.settings.volume, 0.3);

  // Through storage, like the game does it
  const s = memStore();
  s.setItem(PROFILE_KEY, JSON.stringify(v1));
  assert.deepEqual(loadProfile(s), p);
});

test('migration v2: damaged saves are repaired without losing what is valid', () => {
  const raw = {
    v: 2,
    name: 42,
    seed: 'nope',
    gold: '150',
    goldEarned: 10,
    beans: -5,
    earned: Infinity,
    cards: {
      clubbers: { level: 99, count: -3 },
      squire: { level: 'x' },
      archers: 'broken',
      brick: { level: 2.7, count: '4' },
      oldCard: { level: 3, count: 9 },
    },
    deck: ['clubbers', 'clubbers', 'oldCard', 'brick', 5, null, 'shieldWall'],
    king: { xp: 'NaN', level: 3 },
    trophies: 250,
    best: 700,
    road: { claimed: { 10: true, 40: 'yes', abc: true } },
    chests: { small: { readyAt: Infinity }, big: { readyAt: 5000 }, opened: { big: 3, small: -1 } },
    shop: { day: 'zzz', bought: [1, 1, 'x', 99], free: 1 },
    badges: { firstWin: { claimed: true }, junk: 5 },
    stats: { matches: '3', wins: -1, custom: 4 },
    notices: [{ kind: 'x' }, 'str', null, { gold: 5 }],
    settings: null,
    owned: null,
    equipped: 'x',
    tutorial: '2',
    supporter: 'yes',
  };
  const p = migrate(raw);
  assertValid(p);
  assert.equal(p.name, 'You');
  assert.equal(p.gold, 150);
  assert.equal(p.goldEarned, 150);
  assert.equal(p.beans, 0);
  assert.equal(p.earned, 0);
  assert.deepEqual(p.cards.clubbers, { level: MAX_LEVEL, count: 0 });
  assert.deepEqual(p.cards.squire, { level: 1, count: 0 });
  assert.deepEqual(p.cards.archers, { level: 1, count: 0 }, 'a broken card entry is reset, the card stays owned');
  assert.deepEqual(p.cards.brick, { level: 2, count: 4 });
  assert.ok(!p.cards.oldCard, 'unknown card ids are dropped');
  assert.deepEqual(p.deck, ['clubbers', 'brick', 'squire', 'archers', 'spikers', 'bomb', 'arrowRain', 'boulder'], 'deck repaired with starter cards');
  assert.deepEqual(p.king, { level: 3, xp: KING_LEVELS[1] });
  assert.equal(p.best, 700);
  assert.equal(p.trophies, ARENAS[2].trophies, 'trophies lifted to the gate of the best arena');
  assert.deepEqual(p.road.claimed, { 10: true });
  assert.equal(p.chests.small.readyAt, 0);
  assert.equal(p.chests.big.readyAt, 5000);
  assert.deepEqual(p.chests.opened, { small: 0, big: 3 });
  assert.equal(p.shop.day, '');
  assert.deepEqual(p.shop.bought, [1]);
  assert.equal(p.shop.free, false);
  assert.deepEqual(p.badges, { firstWin: { claimed: true } });
  assert.equal(p.stats.matches, 3);
  assert.equal(p.stats.wins, 0);
  assert.equal(p.stats.custom, 4);
  assert.deepEqual(p.notices, [{ kind: 'x' }]);
  assert.equal(p.tutorial, 2);
  assert.equal(p.supporter, false);
  assert.equal(p.seed, migrate(clone(raw)).seed, 'a missing seed is derived from the save, not random');

  // A bare v2 marker, and a deck that is fine stays exactly as it was
  assertValid(migrate({ v: 2 }));
  const good = newProfile(5);
  good.cards.brick = { level: 1, count: 0 };
  good.deck[3] = 'brick';
  assert.deepEqual(migrate(clone(good)).deck, good.deck);

  // Object built-ins are not cards: a save naming them must not put them in the collection or the deck
  const junk = migrate({ v: 2, cards: { toString: { level: 3, count: 2 }, constructor: { level: 1 }, squire: { level: 2, count: 1 } }, deck: ['toString', '__proto__', 'constructor', 'squire'] });
  assertValid(junk);
  assert.ok(!Object.prototype.hasOwnProperty.call(junk.cards, 'toString') && !Object.prototype.hasOwnProperty.call(junk.cards, 'constructor'));
  assert.deepEqual(junk.deck, ['squire', ...STARTER_DECK.filter((id) => id !== 'squire')]);
  assert.equal(junk.cards.squire.level, 2);
});

test('grant: one reward shape for chests, trail, shop and badges', () => {
  const p = newProfile(3);
  const g = grant(p, { gold: 40, beans: 5, cards: { archers: 3, brick: 2, nope: 4 }, hat: 'party', color: 'green' });
  assert.equal(g.gold, 40);
  assert.equal(g.beans, 5);
  assert.equal(g.hat, 'party');
  assert.equal(g.color, 'green');
  assert.deepEqual(g.cards.map((c) => c.id), ['archers', 'brick']);
  const [arch, brick] = g.cards;
  assert.deepEqual(arch, {
    id: 'archers', n: 3, rarity: 'common', isNew: false, levelBefore: 1, countBefore: 0, level: 1, count: 3, need: 2, canUpgradeAfter: true, canUpgrade: true, goldNeed: 0,
  });
  assert.equal(brick.isNew, true);
  assert.equal(brick.levelBefore, 0);
  assert.equal(brick.level, 1);
  assert.equal(brick.count, 1, 'the first copy IS the card; the second is a spare');
  assert.equal(brick.canUpgradeAfter, true, 'epics need 1 copy for level 2');
  assert.equal(brick.canUpgrade, false, 'an epic upgrade costs 50 gold: copies ready, gold short');
  assert.equal(brick.goldNeed, 50 - 40);
  assert.ok(p.owned.hats.includes('party') && p.owned.colors.includes('green'));
  // Duplicates pay Jellybeans instead
  const d = grant(p, { hat: 'party', refund: 120 });
  assert.equal(d.hat, null);
  assert.equal(d.refund, 120);
  assert.equal(d.beans, 120);
  assert.equal(grant(p, { color: 'green' }).refund, DUPLICATE_REFUND);
  // Arrays work too, and the same card twice is one stack
  const a = grant(p, { cards: [{ id: 'squire', n: 2 }, { id: 'squire', n: 3 }] });
  assert.equal(a.cards.length, 1);
  assert.equal(a.cards[0].n, 5);
  assert.deepEqual(grant(p, null), { gold: 0, beans: 0, cards: [], hat: null, color: null, refund: 0 });
  assertValid(p);
});

test('notices: queued for the UI, taken once', () => {
  const p = newProfile(1);
  pushNotice(p, { kind: 'hello' });
  pushNotice(p, 'not a notice');
  assert.deepEqual(popNotice(p), { kind: 'hello' });
  assert.equal(popNotice(p), null);
});

// --- collection ------------------------------------------------------------------------

test('collection: upgrade tables are the spec tables', () => {
  assert.deepEqual(UPGRADE_COPIES, {
    common: [2, 4, 10, 20, 50, 100, 200, 400],
    rare: [1, 2, 4, 10, 20, 50, 100, 200],
    epic: [1, 1, 2, 4, 10, 20, 40, 80],
    legendary: [1, 1, 1, 2, 3, 5, 8, 12],
  });
  assert.deepEqual(UPGRADE_GOLD, {
    common: [5, 20, 50, 150, 400, 1000, 2000, 4000],
    rare: [20, 50, 150, 400, 1000, 2000, 4000, 8000],
    epic: [50, 150, 400, 1000, 2000, 4000, 8000, 15000],
    legendary: [100, 300, 800, 2000, 4000, 8000, 15000, 25000],
  });
  assert.deepEqual(KING_XP, [4, 5, 6, 10, 25, 50, 100, 200]);
  assert.deepEqual(KING_LEVELS, [20, 60, 140, 300, 600, 1200, 2400, 4800]);
  assert.equal(MAX_KING_LEVEL, 9);
  for (const t of [UPGRADE_COPIES, UPGRADE_GOLD]) for (const r of ['common', 'rare', 'epic', 'legendary']) assert.equal(t[r].length, MAX_LEVEL - 1);
  assert.equal(ARENAS_C, ARENAS, 'ladder re-exports the same arena table');
  assert.equal(arenaIndexC, arenaIndex);
});

test('collection: card state, copies and the first copy rule', () => {
  const p = newProfile(1);
  const s = cardState(p, 'archers');
  assert.deepEqual(
    Object.fromEntries(['owned', 'level', 'count', 'need', 'gold', 'maxed', 'ready', 'canUpgrade', 'locked', 'arena', 'inDeck'].map((k) => [k, s[k]])),
    { owned: true, level: 1, count: 0, need: 2, gold: 5, maxed: false, ready: false, canUpgrade: false, locked: false, arena: 0, inDeck: true },
  );
  assert.equal(s.card, CARDS.archers);
  const brick = cardState(p, 'brick');
  assert.deepEqual([brick.owned, brick.level, brick.count, brick.need, brick.gold, brick.locked, brick.arena], [false, 0, 0, 0, 0, true, 1]);
  assert.equal(cardState(p, 'nope'), null);

  const r = addCards(p, 'brick', 1);
  assert.deepEqual(r, { id: 'brick', n: 1, rarity: 'epic', isNew: true, levelBefore: 0, countBefore: 0, level: 1, count: 0, need: 1, ready: false });
  assert.equal(addCards(p, 'brick', 0), null);
  assert.equal(addCards(p, 'nope', 3), null);
  assert.equal(addCards(p, 'brick', 2).count, 2);
  assert.deepEqual(ownedCards(p), [...STARTER_DECK.filter((id) => CARD_ORDER.indexOf(id) < CARD_ORDER.indexOf('brick')), 'brick']);
});

test('collection: upgrades cost copies + gold and pay King XP', () => {
  const p = newProfile(1);
  assert.equal(upgradeCard(p, 'nope').reason, 'unknown');
  assert.equal(upgradeCard(p, 'brick').reason, 'notOwned');
  assert.equal(upgradeCard(p, 'archers').reason, 'copies');
  addCards(p, 'archers', 2);
  assert.equal(cardState(p, 'archers').ready, true);
  assert.equal(upgradeCard(p, 'archers').reason, 'gold');
  assert.equal(upgradableCount(p), 0);
  addGold(p, 5);
  assert.equal(upgradableCount(p), 1);
  const u = upgradeCard(p, 'archers');
  assert.deepEqual(u, { ok: true, level: 2, xpGained: 4, kingBefore: 1, kingAfter: 1, gold: 5, copies: 2 });
  assert.equal(p.gold, 0);
  assert.deepEqual(p.cards.archers, { level: 2, count: 0 });
  assert.equal(p.king.xp, 4);
  assert.equal(p.stats.upgrades, 1);

  // Five level-2 upgrades: 20 XP = King Level 2
  for (const id of ['clubbers', 'squire', 'spikers', 'bomb']) {
    addCards(p, id, 2);
    addGold(p, 5);
    assert.ok(upgradeCard(p, id).ok);
  }
  assert.equal(p.king.xp, 20);
  assert.equal(p.king.level, 2);
  assert.deepEqual(kingInfo(p), { level: 2, xp: 20, from: 20, need: 60, max: false });

  // All the way to the top: copies and gold add up to the tables, then 'maxed'
  addCards(p, 'boulder', UPGRADE_COPIES.rare.reduce((a, b) => a + b, 0));
  addGold(p, UPGRADE_GOLD.rare.reduce((a, b) => a + b, 0));
  let last;
  for (let i = 0; i < MAX_LEVEL - 1; i++) last = upgradeCard(p, 'boulder');
  assert.equal(last.level, MAX_LEVEL);
  assert.equal(p.cards.boulder.count, 0);
  assert.equal(p.gold, 0);
  assert.equal(upgradeCard(p, 'boulder').reason, 'maxed');
  assert.equal(cardState(p, 'boulder').maxed, true);
  assert.equal(cardState(p, 'boulder').need, 0);
  assert.equal(p.king.xp, 20 + KING_XP.reduce((a, b) => a + b, 0));
  assert.equal(p.king.level, kingLevelForXp(p.king.xp));
  assertValid(p);

  p.king.xp = 99999;
  assert.deepEqual(kingInfo(p), { level: 9, xp: 99999, from: 4800, need: 4800, max: true });
  assert.equal(kingLevelForXp(0), 1);
  assert.equal(kingLevelForXp(19), 1);
  assert.equal(kingLevelForXp(4800), 9);
});

test('collection: deck editing keeps 8 unique owned cards', () => {
  const p = newProfile(1);
  assert.equal(deckAvgMana(p), 25 / 8);
  assert.equal(deckLevel(p), 1);
  assert.equal(swapIntoDeck(p, 'brick', 0), false, 'not owned');
  addCards(p, 'brick', 1);
  assert.equal(swapIntoDeck(p, 'brick', 8), false, 'no such slot');
  assert.equal(swapIntoDeck(p, 'brick', 1.5), false);
  assert.ok(swapIntoDeck(p, 'brick', 0));
  assert.equal(p.deck[0], 'brick');
  assert.ok(!p.deck.includes('clubbers'));
  assert.ok(swapIntoDeck(p, 'brick', 7), 'a card already in the deck swaps slots');
  assert.equal(p.deck[7], 'brick');
  assert.equal(p.deck[0], 'clubberGang');
  assert.equal(new Set(p.deck).size, 8);
  p.cards.brick.level = 5;
  assert.equal(deckLevel(p), 12 / 8);
  assertValid(p);
});

test('collection: cards unlock by the best arena reached', () => {
  const p = newProfile(1);
  assert.deepEqual(unlockedCards(p), [...STARTER_DECK.slice().sort((a, b) => CARD_ORDER.indexOf(a) - CARD_ORDER.indexOf(b)), 'sprouts', 'bananaPeels']);
  const later = ['brollyBrigade', 'bubbleWrap', 'tummyDrummer', 'pelican', 'bigJelly'];
  const fortress = ['boingBox', 'beanPatch', 'anvil', 'nutcracker', 'wreckingCrane', ...later];
  const ridge = ['bombSquad', 'megaBomb', 'shieldWall'];
  const ridge2 = ['bigSneeze', 'shakenSoda', 'bombJuggler'];
  assert.deepEqual(lockedCards(p), ['bruiser', 'brick', 'cheeseWheel', ...ridge, 'propellerPals', 'pogoBean', 'netter', ...ridge2, ...fortress]);
  p.best = 300;
  assert.deepEqual(lockedCards(p), [...ridge, ...ridge2, ...fortress]);
  p.best = 2000;
  assert.deepEqual(unlockedCards(p), CARD_ORDER);
  assert.deepEqual(lockedCards(p), []);
  for (let a = 0; a < ARENAS.length; a++) for (const id of cardsUpTo(a)) assert.ok(CARDS[id].arena <= a);
});

test('migration: a v2 save written back by an old v1 window stays a v2 profile (no progress wiped)', () => {
  // The old v1 code adopts a v2 save, spreads it into its own shape, sets v back to 1
  // and turns the numeric trophies into {} (git 4aeb2e6 profile.js migrate), then saves it.
  const v2 = newProfile(55);
  v2.tutorial = 1;
  v2.gold = v2.goldEarned = 1500;
  v2.trophies = v2.best = 700;
  v2.cards.bruiser = { level: 2, count: 3 };
  v2.king.xp = 160;
  v2.king.level = kingLevelForXp(160);
  v2.road.claimed = { 10: true, 40: true };
  v2.badges.firstWin = { claimed: true };
  const mangled = { ...clone(v2), v: 1, trophies: {}, stars: {}, cleared: {}, daily: { done: {} } };
  assert.ok(looksV2(mangled) && !looksV2({ v: 1, beans: 3, stars: { 0: 3 }, trophies: {} }));
  const p = migrate(clone(mangled));
  assertValid(p);
  assert.deepEqual([p.gold, p.best, p.cards.bruiser.level, p.king.xp, p.road.claimed[40], p.badges.firstWin.claimed], [1500, 700, 2, 160, true, true]);
  assert.equal(p.trophies, 650, 'trophies fall back to the gate of the best arena');
  assert.ok(!p.notices.some((n) => n.kind === 'veteran'), 'no second veteran gift');
});

test('migration: a v1 save with no campaign stars gets no "0 gold" veteran notice', () => {
  const p = migrate({ v: 1, beans: 120, earned: 300, stars: {}, stats: { battles: 12 }, trophies: {} });
  assertValid(p);
  assert.equal(p.gold, 0);
  assert.deepEqual(p.notices, []);
  assert.equal(p.beans, 120, 'the Jellybeans still carry over');
});

// --- ladder ------------------------------------------------------------------------------

test('ladder: arenas, trophies and match gold', () => {
  assert.deepEqual(
    ARENAS.map((a) => [a.name, a.trophies]),
    [['Green Hills', 0], ['Pointy Pass', 300], ['Boom Ridge', 650], ['Brick Fortress', 1000], ['Wobble Summit', 1500]],
  );
  assert.equal(arenaIndex(0), 0);
  assert.equal(arenaIndex(299), 0);
  assert.equal(arenaIndex(300), 1);
  assert.equal(arenaIndex(1499), 3);
  assert.equal(arenaIndex(99999), 4);
  assert.equal(arenaIndex('junk'), 0);
  assert.equal(arenaFloor(640), 300);

  const p = at(100);
  const w3 = recordMatch(p, { outcome: 'win', crowns: 3, enemyCrowns: 0 });
  assert.equal(w3.delta, 33);
  assert.equal(w3.gold, 12 + 4 * 3);
  assert.equal(p.trophies, 133);
  const w1 = recordMatch(p, { outcome: 'win', crowns: 1, enemyCrowns: 0 });
  assert.equal(w1.delta, 27);
  assert.equal(w1.gold, 16);
  assert.equal(recordMatch(p, { outcome: 'win', crowns: 0, enemyCrowns: 0 }).delta, 27, 'an overtime win without crowns');
  const l = recordMatch(p, { outcome: 'loss', crowns: 1, enemyCrowns: 3 });
  assert.equal(l.delta, MATCH_REWARDS.loss);
  assert.equal(l.gold, 3, 'losses still pay a little gold');
  const d = recordMatch(p, { outcome: 'draw', crowns: 1, enemyCrowns: 1 });
  assert.equal(d.delta, 0);
  assert.equal(d.gold, 6);
  assert.equal(recordMatch(p, { outcome: 'surrender' }), null);
  assert.deepEqual([p.stats.matches, p.stats.wins, p.stats.losses, p.stats.draws, p.stats.threeCrowns], [5, 3, 1, 1, 1]);
  assert.equal(p.stats.towers, 2 + 1 + 0 + 1 + 1, 'towers follow the crowns unless given');
  recordMatch(p, { outcome: 'win', crowns: 1, enemyCrowns: 0, towers: 1, cardsPlayed: 14, spells: 3 });
  assert.equal(p.stats.cardsPlayed, 14);
  assert.equal(p.stats.spells, 3);
  assert.equal(p.best, p.trophies);

  // Arena bonus gold: a win in Boom Ridge pays 2 x 4 more
  assert.equal(recordMatch(at(700), { outcome: 'win', crowns: 1, enemyCrowns: 0 }).gold, 12 + 4 + 8);
});

test('ladder: losses never drop you out of an arena you reached', () => {
  const p = at(0);
  assert.equal(recordMatch(p, { outcome: 'loss', crowns: 0, enemyCrowns: 1 }).after, 0);
  const q = at(310);
  const r = recordMatch(q, { outcome: 'loss', crowns: 0, enemyCrowns: 3 });
  assert.deepEqual([r.before, r.after, r.delta, r.floored, r.floor], [310, 300, -10, true, 300]);
  assert.equal(recordMatch(q, { outcome: 'loss' }).after, 300);
  assert.equal(q.best, 310, 'best is never lowered');
  assertValid(q);
});

test('ladder: crossing a gate opens the arena and its cards once', () => {
  const p = at(290);
  const r = recordMatch(p, { outcome: 'win', crowns: 1, enemyCrowns: 0 });
  assert.equal(r.newArena, 1);
  assert.deepEqual(r.newCards, ['bruiser', 'brick', 'cheeseWheel', 'propellerPals', 'pogoBean', 'netter']);
  assert.equal(r.arena, 1);
  assert.ok(unlockedCards(p).includes('brick'));
  recordMatch(p, { outcome: 'loss' });
  const again = recordMatch(p, { outcome: 'win', crowns: 1 });
  assert.equal(again.newArena, -1);
  assert.deepEqual(again.newCards, []);
  const q = at(640);
  assert.deepEqual(recordMatch(q, { outcome: 'win', crowns: 3 }).newCards, ['bombSquad', 'megaBomb', 'shieldWall', 'bigSneeze', 'shakenSoda', 'bombJuggler']);
  const top = at(1490);
  const t = recordMatch(top, { outcome: 'win', crowns: 3 });
  assert.equal(t.newArena, 4);
  assert.deepEqual(t.newCards, ['brollyBrigade', 'bubbleWrap', 'tummyDrummer', 'pelican', 'bigJelly'], 'the top arena unlocks its cards');

  const pr = arenaProgress(at(475));
  assert.deepEqual([pr.arena, pr.name, pr.from, pr.to, pr.next], [1, 'Pointy Pass', 300, 650, 2]);
  assert.equal(pr.frac, 0.5);
  assert.equal(arenaProgress(at(2000)).next, -1);
  assert.equal(arenaProgress(at(2000)).frac, 1);
});

test('ladder: giving up (or leaving while behind) pays no gold; a real loss still pays a little', () => {
  const p = at(300);
  const s = recordMatch(p, { outcome: 'loss', crowns: 0, enemyCrowns: 3, reason: 'surrender' });
  assert.deepEqual([s.gold, s.noGold, s.delta], [0, true, 0], 'at an arena floor: no trophies and no gold to farm');
  assert.equal(recordMatch(p, { outcome: 'loss', crowns: 0, enemyCrowns: 1, reason: 'left' }).gold, 0);
  assert.equal(recordMatch(p, { outcome: 'loss', crowns: 0, enemyCrowns: 1, reason: 'time' }).gold, MATCH_REWARDS.gold.loss);
  assert.equal(recordMatch(p, { outcome: 'win', crowns: 3, enemyCrowns: 0, reason: 'surrender' }).gold, 12 + 4 * 3 + 4, 'the other side giving up pays a normal win');
  assert.equal(p.gold, MATCH_REWARDS.gold.loss + 12 + 4 * 3 + 4);
});

test('ladder: a match that never finished is settled on the next start (behind = a loss, else nothing)', () => {
  // Left while behind: a loss through recordMatch, no gold, a one-time notice
  const p = at(400);
  const id = startPending(p, 'Admiral Noodle', NOW);
  assert.deepEqual(p.pending, { id, opponent: 'Admiral Noodle', startedAt: NOW, blue: 0, red: 0 });
  assert.equal(updatePending(p, id, { blue: 0, red: 1 }), true);
  assert.equal(updatePending(p, 'another', { blue: 3, red: 0 }), false, 'only the running match updates it');
  const s = memStore();
  saveProfile(p, s);
  const back = loadProfile(s); // (a reload)
  assert.deepEqual(back.pending, p.pending);
  const r = settlePending(back);
  assert.equal(r.lost, true);
  assert.deepEqual([back.trophies, back.stats.matches, back.stats.losses, back.gold], [400 + MATCH_REWARDS.loss, 1, 1, 0]);
  assert.equal(back.pending, null);
  assert.equal(back.settled, id);
  assert.equal(back.notices.length, 1);
  assert.equal(back.notices[0].kind, 'interrupted');
  assert.match(back.notices[0].text, /Admiral Noodle.*counts as a loss/);
  assert.equal(settlePending(back), null, 'settled once');
  assertValid(back);

  // Not behind (ahead, or even): dropped, no trophies, still a gentle notice
  for (const crowns of [{ blue: 1, red: 0 }, { blue: 1, red: 1 }, { blue: 0, red: 0 }]) {
    const q = at(400);
    const qid = startPending(q, 'Chef Chickpea', NOW);
    updatePending(q, qid, crowns);
    const r2 = settlePending(q);
    assert.equal(r2.lost, false);
    assert.deepEqual([q.trophies, q.stats.matches, q.gold, q.pending], [400, 0, 0, null]);
    assert.equal(q.settled, '', 'nothing was counted: a window still playing it may record it');
    assert.match(q.notices[0].text, /doesn't count/);
  }
  // A finished match clears it; junk in a save is dropped
  const f = at(400);
  startPending(f, 'X', NOW);
  recordMatch(f, { outcome: 'win', crowns: 1, enemyCrowns: 0 });
  assert.equal(f.pending, null);
  assert.equal(settlePending(f), null);
  for (const junk of [5, 'x', [], { id: '' }, { id: 7 }]) assert.equal(migrate({ ...clone(at(10)), pending: junk }).pending, null);
  assert.deepEqual(migrate({ ...clone(at(10)), pending: { id: 'a', opponent: 3, startedAt: -5, blue: 9, red: '2' } }).pending, { id: 'a', opponent: '', startedAt: 0, blue: 3, red: 2 });
});

test('trophy trail: new arena cards come with enough copies to reach about level 4', () => {
  const p = at(1000);
  for (const m of trailStatus(p)) if (m.claimable) claimTrail(p, m.at);
  p.gold = 1e6;
  for (const id of ['bruiser', 'brick', 'cheeseWheel', 'bombSquad', 'megaBomb', 'shieldWall']) {
    while (upgradeCard(p, id).ok);
    assert.ok(p.cards[id].level >= 4, `${id} reaches level ${p.cards[id].level}`);
  }
});

test('trophy trail: well-formed, every new card handed out after its gate', () => {
  assert.ok(TRAIL.length >= 46 && TRAIL.length <= 56, `${TRAIL.length} milestones`);
  assert.equal(TRAIL[TRAIL.length - 1].at, 1750);
  const hatIds = new Map(HATS.map((h) => [h.id, h]));
  let prev = 0;
  for (const m of TRAIL) {
    assert.ok(m.at > prev, 'ascending, unique');
    prev = m.at;
    const r = m.reward;
    const keys = Object.keys(r);
    assert.ok(keys.length > 0);
    for (const k of keys) assert.ok(['gold', 'beans', 'cards', 'hat', 'refund', 'random', 'n'].includes(k), `${m.at}: ${k}`);
    if (r.hat) {
      assert.ok(hatIds.has(r.hat) && !hatIds.get(r.hat).supporter, `${m.at}: hat ${r.hat}`);
      assert.equal(r.refund, hatIds.get(r.hat).price, 'a duplicate hat refunds its price');
    }
    for (const id of Object.keys(r.cards || {})) assert.ok(CARDS[id] && CARDS[id].arena <= arenaIndex(m.at), `${m.at}: ${id} unlocked there`);
    if (r.random) assert.ok(cardsUpTo(arenaIndex(m.at)).some((id) => CARDS[id].rarity === r.random), `${m.at}: a ${r.random} exists there`);
  }
  for (const id of CARD_ORDER.filter((c) => CARDS[c].arena > 0 || !STARTER_DECK.includes(c))) {
    const m = TRAIL.find((x) => x.reward.cards && x.reward.cards[id]);
    assert.ok(m, `${id} is on the trail`);
    assert.ok(m.at >= ARENAS[CARDS[id].arena].trophies && m.at < ARENAS[CARDS[id].arena].trophies + 300, `${id} comes soon after its gate`);
  }
  assert.ok(TRAIL.some((m) => m.reward.beans) && TRAIL.some((m) => m.reward.gold) && TRAIL.some((m) => m.reward.random));
});

test('trophy trail: claim reached milestones once, by best trophies', () => {
  const p = at(0);
  assert.equal(claimableTrail(p), 0);
  assert.equal(claimTrail(p, 10), null);
  p.trophies = p.best = 150;
  assert.equal(claimableTrail(p), 7);
  const st = trailStatus(p);
  assert.equal(st.length, TRAIL.length);
  assert.deepEqual(Object.keys(st[0]).sort(), ['arena', 'at', 'claimable', 'claimed', 'gate', 'i', 'reached', 'reward']);
  assert.equal(st.find((m) => m.at === 300).gate, 1);
  assert.equal(st.find((m) => m.at === 10).gate, -1);
  const g = claimTrail(p, 10);
  assert.equal(g.at, 10);
  assert.equal(g.gold, 50);
  assert.equal(p.gold, 50);
  assert.equal(claimTrail(p, 10), null, 'once');
  assert.equal(claimTrail(p, 11), null, 'no such milestone');
  assert.equal(claimableTrail(p), 6);

  // Random-card rewards resolve to one unlocked card of that rarity, the same way every time
  const q = clone(p);
  const a = claimTrail(p, 140);
  const b = claimTrail(q, 140);
  assert.deepEqual(a, b);
  assert.equal(a.cards.length, 1);
  assert.equal(CARDS[a.cards[0].id].rarity, 'rare');
  assert.ok(unlockedCards(p).includes(a.cards[0].id));
  assert.equal(a.cards[0].n, 2);

  // Losing trophies later never takes a reached milestone away
  p.trophies = 0;
  assert.ok(claimTrail(p, 100));
  // Everything at once at the top, each card reward valid
  const top = at(1750, 11);
  let n = 0;
  for (const m of TRAIL) if (claimTrail(top, m.at)) n++;
  assert.equal(n, TRAIL.length);
  assert.equal(claimableTrail(top), 0);
  for (const id of CARD_ORDER) assert.ok(top.cards[id], `${id} owned after the whole trail`);
  for (const h of TRAIL.filter((m) => m.reward.hat)) assert.ok(top.owned.hats.includes(h.reward.hat));
  assertValid(top);
});

// --- chests ------------------------------------------------------------------------------

test('chests: both ready at first, open once, refill on their timers', () => {
  const p = newProfile(21);
  assert.equal(CHESTS.small.period, 3 * HOUR);
  assert.equal(CHESTS.big.period, 12 * HOUR);
  assert.equal(readyChests(p, NOW), 2);
  for (const k of CHEST_KINDS) assert.deepEqual(chestState(p, k, NOW), { kind: k, ready: true, msLeft: 0, readyAt: 0, period: CHESTS[k].period });
  assert.equal(chestState(p, 'huge', NOW), null);
  assert.equal(openChest(p, 'huge', NOW), null);

  const o = openChest(p, 'small', NOW);
  assert.ok(o);
  assert.equal(o.kind, 'small');
  assert.equal(p.chests.opened.small, 1);
  assert.equal(p.stats.chests, 1);
  assert.equal(openChest(p, 'small', NOW + 1000), null, 'not again until it refills');
  const st = chestState(p, 'small', NOW + HOUR);
  assert.deepEqual([st.ready, st.msLeft, st.readyAt], [false, 2 * HOUR, NOW + 3 * HOUR]);
  assert.equal(readyChests(p, NOW + HOUR), 1);
  assert.ok(chestState(p, 'small', NOW + 3 * HOUR).ready);
  // Waiting longer never stacks a second chest
  const late = NOW + 100 * HOUR;
  assert.ok(openChest(p, 'small', late));
  assert.equal(openChest(p, 'small', late), null);
  assert.equal(chestState(p, 'small', late).readyAt, late + 3 * HOUR);
  assertValid(p);
});

test('chests: a clock moved back clamps the timer, never grows it', () => {
  const p = newProfile(22);
  openChest(p, 'big', NOW);
  const back = NOW - 48 * HOUR;
  const st = chestState(p, 'big', back);
  assert.equal(st.readyAt, back + 12 * HOUR);
  assert.equal(st.msLeft, 12 * HOUR);
  assert.equal(p.chests.big.readyAt, back + 12 * HOUR, 'the clamp sticks');
  // Back to the real time: ready already (the wait never gets longer than one period)
  assert.ok(chestState(p, 'big', NOW).ready);
  // No `now` means the real clock, not 1970 (which would clamp every timer)
  const r = newProfile(23);
  const real = Date.now();
  openChest(r, 'small', real);
  assert.equal(chestState(r, 'small').readyAt, real + 3 * HOUR);
  assert.equal(chestState(r, 'small').ready, false);
  // A step back that leaves less than a period to wait changes nothing
  const q = newProfile(22);
  openChest(q, 'big', NOW);
  assert.equal(chestState(q, 'big', NOW + 2 * HOUR).readyAt, NOW + 12 * HOUR);
  assert.equal(chestState(q, 'big', NOW + HOUR).readyAt, NOW + 12 * HOUR);
  assert.equal(chestState(q, 'big', NOW - HOUR).readyAt, NOW + 11 * HOUR, 'more than a period away: clamped');
});

test('chests: a little lateness comes off the next wait (twice a day gets both Big Chests), never more', () => {
  const p = newProfile(24);
  openChest(p, 'big', NOW); // first open: no grace (it waited since forever)
  assert.equal(p.chests.big.readyAt, NOW + 12 * HOUR);
  // 8:00 / 20:00 sessions that drift: an hour late, the next is still 12 h after it was ready
  openChest(p, 'big', NOW + 13 * HOUR);
  assert.equal(p.chests.big.readyAt, NOW + 24 * HOUR);
  // ...and the evening session an hour early is not the problem: it is ready again at 24 h
  assert.equal(chestState(p, 'big', NOW + 23 * HOUR).ready, false);
  // At most a quarter of a period comes off
  openChest(p, 'big', NOW + 30 * HOUR);
  assert.equal(p.chests.big.readyAt, NOW + 30 * HOUR + 12 * HOUR * (1 - CHEST_GRACE));
  // Longer than a whole period away: no grace, and never an early chest
  const q = newProfile(25);
  openChest(q, 'small', NOW);
  openChest(q, 'small', NOW + 10 * HOUR);
  assert.equal(q.chests.small.readyAt, NOW + 13 * HOUR);
  // Simulated twice-a-day player with +-75 min drift over 30 days: 2 Big Chests a day
  const r = newProfile(26);
  let t = NOW;
  let opened = 0;
  const rng = rngFrom('drift');
  for (let day = 0; day < 30; day++) {
    for (const h of [8, 20]) {
      const at = NOW + (day * 24 + h) * HOUR + rng.int(-75, 75) * 60e3;
      if (at > t) t = at;
      if (openChest(r, 'big', t)) opened++;
    }
  }
  assert.ok(opened >= 58, `opened ${opened} Big Chests in 30 days`);
});

test('chests: contents are deterministic from the seed and the chest counter', () => {
  const a = newProfile(31);
  const b = newProfile(31);
  const oa = [openChest(a, 'small', NOW), openChest(a, 'big', NOW)];
  const ob = [openChest(b, 'small', NOW), openChest(b, 'big', NOW)];
  assert.deepEqual(oa, ob);
  assert.deepEqual(a, b);
  // The preview matches what opening gives
  const c = newProfile(32);
  const roll = rollChest(c, 'big');
  const got = openChest(c, 'big', NOW);
  assert.equal(got.gold, roll.gold);
  assert.deepEqual(got.cards.map((x) => [x.id, x.n, x.rarity]), roll.cards.map((x) => [x.id, x.n, x.rarity]));
  // Different counters (and seeds) give different chests
  const seen = new Set();
  const d = newProfile(33);
  for (let i = 0; i < 10; i++) {
    seen.add(JSON.stringify(rollChest(d, 'small')));
    d.chests.opened.small++;
  }
  assert.ok(seen.size >= 8);
});

test('chests: sizes, gold and arena scaling follow the spec, only unlocked cards drop', () => {
  for (const [arena, trophies] of [[0, 0], [1, 300], [2, 700], [4, 1600]]) {
    const p = at(trophies, 40 + arena);
    const unlocked = new Set(unlockedCards(p));
    const sc = { gold: 1 + 0.25 * arena, cards: 1 + 0.2 * arena };
    let epics = 0;
    let rareSmall = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      for (const k of CHEST_KINDS) {
        const c = CHESTS[k];
        const r = rollChest(p, k);
        assert.ok(r.gold >= Math.round(c.gold[0] * sc.gold) && r.gold <= Math.round(c.gold[1] * sc.gold), `${k} gold ${r.gold}`);
        assert.equal(r.beans, k === 'big' ? 10 : 0);
        const total = r.cards.reduce((s, x) => s + x.n, 0);
        const want = Math.round(c.cards * sc.cards);
        assert.ok(total >= want - 2 && total <= want + 1, `${k} at arena ${arena}: ${total} cards, about ${want}`);
        assert.ok(r.cards.length >= 1 && r.cards.length <= c.stacks);
        assert.equal(new Set(r.cards.map((x) => x.id)).size, r.cards.length, 'one stack per card');
        for (const x of r.cards) {
          assert.ok(unlocked.has(x.id), `${x.id} is unlocked at arena ${arena}`);
          assert.equal(x.rarity, CARDS[x.id].rarity);
          assert.ok(x.n >= 1);
        }
        if (k === 'big') {
          assert.ok(r.cards.some((x) => x.rarity === 'rare'), 'a big chest always has a rare stack');
          if (r.cards.some((x) => x.rarity === 'epic')) epics++;
        } else if (r.cards.some((x) => x.rarity === 'rare')) rareSmall++;
        p.chests.opened[k]++;
      }
    }
    const odds = { small: chestOdds(p, 'small'), big: chestOdds(p, 'big') };
    assert.equal(odds.big.odds.rare, 1);
    assert.equal(odds.small.odds.epic, 0);
    assert.equal(odds.small.odds.rare, 0.2775);
    if (arena === 0) {
      assert.equal(epics, 0, 'no epics before any are unlocked');
      assert.equal(odds.big.odds.epic, 0);
    } else {
      assert.equal(odds.big.odds.epic, 0.35);
      assert.ok(Math.abs(epics / N - 0.35) < 0.08, `epic rate ${epics / N}`);
    }
    assert.ok(Math.abs(rareSmall / N - odds.small.odds.rare) < 0.08, `small rare rate ${rareSmall / N}`);
    assert.deepEqual(odds.big.gold, [Math.round(120 * sc.gold), Math.round(200 * sc.gold)]);
    assert.deepEqual([...odds.big.pool.common, ...odds.big.pool.rare, ...odds.big.pool.epic, ...odds.big.pool.legendary].sort(), [...unlocked].sort());
  }
});

// --- shop ----------------------------------------------------------------------------------

test('shop: the same stock all day, a new one tomorrow, by local date', () => {
  assert.equal(dayKey(NOW), '2026-11-05');
  assert.equal(dayKey(new Date(2026, 0, 9, 23, 59).getTime()), '2026-01-09');
  assert.equal(msToRestock(new Date(2026, 10, 5, 23, 0).getTime()), HOUR);
  const p = newProfile(51);
  const a = shopToday(p, NOW);
  assert.equal(a.day, '2026-11-05');
  assert.deepEqual(shopToday(p, NOW + 5 * HOUR), a, 'same all day');
  assert.deepEqual(shopToday(newProfile(51), NOW), a, 'same for the same seed');
  assert.equal(a.offers.length, SHOP.offers);
  assert.equal(new Set(a.offers.map((o) => o.cardId)).size, 3, 'three different cards');
  assert.equal(a.free.claimed, false);

  // Over many days: valid offers, prices and counts from the spec
  const q = at(700, 52);
  const unlocked = new Set(unlockedCards(q));
  const days = new Set();
  for (let d = 0; d < 60; d++) {
    const s = shopToday(q, NOW + d * 24 * HOUR);
    days.add(JSON.stringify(s.offers));
    for (const o of s.offers) {
      assert.ok(unlocked.has(o.cardId));
      assert.equal(o.rarity, CARDS[o.cardId].rarity);
      const [lo, hi] = SHOP.count[o.rarity];
      assert.ok(o.count >= lo && o.count <= hi, `${o.rarity} x${o.count}`);
      assert.equal(o.price, o.count * { common: 10, rare: 60, epic: 300, legendary: 1500 }[o.rarity]);
      assert.equal(o.bought, false);
    }
    const r = s.free.reward;
    assert.ok((r.gold > 0 && !r.cards) || Object.keys(r.cards).every((id) => unlocked.has(id)));
  }
  assert.ok(days.size >= 50, 'the stock changes day to day');
  // A fresh player never sees locked cards in the shop
  for (let d = 0; d < 30; d++) for (const o of shopToday(newProfile(60 + d), NOW).offers) assert.equal(CARDS[o.cardId].arena, 0);
});

test('shop: free gift once a day, offers once each, gold only', () => {
  const p = newProfile(53);
  const s = shopToday(p, NOW);
  const free = claimFree(p, NOW);
  assert.ok(free);
  assert.equal(free.gold, s.free.reward.gold || 0);
  assert.equal(claimFree(p, NOW + HOUR), null, 'once a day');
  assert.equal(shopToday(p, NOW).free.claimed, true);

  const o = s.offers[0];
  spendGold(p, p.gold);
  addGold(p, o.price - 1);
  assert.equal(buyOffer(p, 0, NOW), 'poor');
  assert.equal(p.gold, o.price - 1);
  addGold(p, 6);
  const countBefore = p.cards[o.cardId] ? p.cards[o.cardId].count : -1;
  const b = buyOffer(p, 0, NOW);
  assert.equal(typeof b, 'object');
  assert.equal(b.price, o.price);
  assert.equal(b.offer, 0);
  assert.equal(b.cards[0].id, o.cardId);
  assert.equal(b.cards[0].n, o.count);
  assert.equal(p.gold, 5);
  assert.equal(p.cards[o.cardId].count, countBefore + o.count);
  assert.equal(buyOffer(p, 0, NOW), 'bought');
  assert.equal(buyOffer(p, 7, NOW), 'gone');
  assert.equal(buyOffer(p, -1, NOW), 'gone');
  assert.equal(shopToday(p, NOW).offers[0].bought, true);

  // Tomorrow: everything resets
  const tomorrow = NOW + 24 * HOUR;
  const t = shopToday(p, tomorrow);
  assert.equal(t.day, '2026-11-06');
  assert.equal(t.free.claimed, false);
  assert.ok(t.offers.every((x) => !x.bought));
  assert.ok(claimFree(p, tomorrow));
  // Clock moved back a day: still tomorrow's shop, no second gift
  assert.equal(shopToday(p, NOW).day, '2026-11-06');
  assert.equal(claimFree(p, NOW), null);
  // Missing `now`: today's real date
  assert.equal(shopToday(newProfile(1)).day, dayKey(Date.now()));
  // A clock that was badly wrong (far ahead) doesn't freeze the shop
  const r = newProfile(54);
  claimFree(r, NOW + 400 * 24 * HOUR);
  assert.equal(shopToday(r, NOW).day, '2026-11-05');
  assert.ok(claimFree(r, NOW));
  assertValid(p);
});

test('shop: reaching a new arena mid-day does not reshuffle the offers', () => {
  const p = at(290, 55);
  const before = shopToday(p, NOW);
  recordMatch(p, { outcome: 'win', crowns: 3 });
  assert.ok(bestArena(p) === 1);
  assert.deepEqual(shopToday(p, NOW + HOUR).offers, before.offers);
  // Tomorrow's shop uses the new arena
  const tomorrow = shopToday(p, NOW + 24 * HOUR);
  assert.equal(p.shop.arena, 1);
  assert.equal(tomorrow.day, '2026-11-06');
});

// --- badges ----------------------------------------------------------------------------------

test('badges: well-formed, old claims carry over, progress and claim once', () => {
  const ids = BADGES.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  for (const id of V1_BADGE_IDS) assert.ok(ids.includes(id), `kept achievement ${id}`);
  const wanted = ['wins25', 'wins100', 'threeCrowns', 'towers', 'cardsPlayed', 'chests', 'upgrades', 'king5', 'arena1', 'arena2', 'arena3', 'arena4'];
  for (const id of wanted) assert.ok(ids.includes(id), id);
  const p = newProfile(61);
  for (const b of BADGES) {
    assert.ok(b.name && b.desc && b.icon && b.goal > 0, b.id);
    assert.ok(b.reward.beans > 0, `${b.id} pays Jellybeans`);
    assert.ok(b.stat ? b.stat in p.stats : ['best', 'king'].includes(b.derive), `${b.id} has a source`);
    for (const w of AVOID) assert.ok(!`${b.name} ${b.desc}`.includes(w), `${b.id}: ${w}`);
  }
  assert.ok(BADGES.some((b) => b.reward.gold > 0), 'some pay gold too');

  assert.equal(claimableBadges(p), 0);
  assert.equal(claimBadge(p, 'firstWin'), null);
  recordMatch(p, { outcome: 'win', crowns: 3, enemyCrowns: 0 });
  p.stats.knockdowns = 40;
  assert.equal(claimableBadges(p), 2);
  const st = badgeStatus(p);
  assert.ok(['firstWin', 'threeCrowns'].includes(st[0].id), 'claimable badges come first');
  assert.equal(st.find((b) => b.id === 'knockdowns').progress, 40);
  const g = claimBadge(p, 'firstWin');
  assert.equal(g.id, 'firstWin');
  assert.equal(g.beans, 50);
  assert.equal(g.gold, 50);
  assert.equal(claimBadge(p, 'firstWin'), null, 'only once');
  assert.equal(badgeStatus(p).at(-1).id, 'firstWin', 'claimed badges go last');
  assert.equal(claimBadge(p, 'nope'), null);

  // Derived: arenas by best trophies, King Level by XP
  const a = badgeStatus(at(700)).filter((b) => b.id.startsWith('arena'));
  assert.deepEqual(a.map((b) => [b.id, b.done]).sort(), [['arena1', true], ['arena2', true], ['arena3', false], ['arena4', false]]);
  assert.equal(a.find((b) => b.id === 'arena3').progress, 700);
  p.king.xp = KING_LEVELS[3];
  assert.ok(badgeStatus(p).find((b) => b.id === 'king5').done);

  // A migrated veteran keeps the claim and can't claim it again
  const v = migrate({ v: 1, stats: { wins: 9 }, trophies: { firstWin: { claimed: true } } });
  assert.equal(claimBadge(v, 'firstWin'), null);
});

// --- opponents ---------------------------------------------------------------------------------

test('opponents: the first match is against the Training Dummy', () => {
  const p = newProfile(71);
  const o = makeOpponent(p, 1);
  assert.equal(o.name, 'Training Dummy');
  assert.equal(o.skill, TUTORIAL_OPPONENT.skill);
  assert.ok(o.skill <= 0.1);
  assert.equal(o.tutorial, true);
  assert.equal(o.bot, true);
  assert.equal(o.kingLevel, 1);
  assert.equal(new Set(o.deck).size, 8);
  for (const id of o.deck) {
    assert.equal(o.levels[id], 1);
    assert.equal(CARDS[id].arena, 0);
  }
  p.tutorial = 1;
  assert.notEqual(makeOpponent(p, 1).name, 'Training Dummy');
  // Without a seed: a new opponent after each match, the same one until then
  const first = makeOpponent(p);
  assert.deepEqual(makeOpponent(p), first);
  assert.deepEqual(makeOpponent(p, p.stats.matches), first);
  const seen = new Set([JSON.stringify(first)]);
  for (let i = 0; i < 5; i++) {
    recordMatch(p, { outcome: 'draw' });
    seen.add(JSON.stringify(makeOpponent(p)));
  }
  assert.equal(seen.size, 6);
});

test('opponents: fair decks, levels, King Level and skill for every arena', () => {
  const hatIds = new Set(HATS.filter((h) => !h.supporter).map((h) => h.id));
  const archetypes = new Set();
  const names = new Set();
  for (const trophies of [0, 150, 300, 500, 650, 900, 1000, 1500, 2200]) {
    const arena = arenaIndex(trophies);
    let skillSum = 0;
    for (let s = 0; s < 40; s++) {
      const p = at(trophies, 80 + s);
      // A player with a spread of card levels
      p.cards.archers.level = 1 + (s % 5);
      p.cards.clubbers.level = 1 + (s % 3);
      p.king.xp = KING_LEVELS[s % 6];
      p.king.level = kingLevelForXp(p.king.xp);
      const o = makeOpponent(p, s * 13);
      assert.deepEqual(makeOpponent(p, s * 13), o, 'deterministic per (profile, seed)');
      assert.equal(o.bot, true);
      assert.equal(o.tutorial, false);
      assert.equal(o.arena, arena);
      assert.equal(o.deck.length, 8);
      assert.equal(new Set(o.deck).size, 8, 'unique cards');
      for (const id of o.deck) assert.ok(CARDS[id] && CARDS[id].arena <= arena, `${id} unlocked at arena ${arena}`);
      // (buildings count with the units: the Fortress style holds three of them)
      assert.ok(o.deck.some((id) => CARDS[id].kind === 'spell') && o.deck.filter((id) => CARDS[id].kind !== 'spell').length >= 4);
      const floor = LEVEL_FLOOR[arena];
      const cap = levelCap(trophies);
      assert.deepEqual(Object.keys(o.levels).sort(), o.deck.slice().sort());
      // Card by card (best for best): never above your card, never under the curve or your card minus one
      const mine = p.deck.map((id) => p.cards[id].level).sort((a, b) => b - a);
      const theirs = o.deck.map((id) => o.levels[id]).sort((a, b) => b - a);
      theirs.forEach((lv, k) => {
        assert.ok(Number.isInteger(lv) && lv >= 1 && lv <= MAX_LEVEL, `level ${lv}`);
        assert.ok(lv <= mine[k], `bot card ${k} at ${lv} is above yours (${mine[k]})`);
        assert.ok(lv >= Math.min(mine[k], Math.floor(cap)) - 1 && lv >= Math.min(floor, mine[k]), `bot card ${k} at ${lv}: yours ${mine[k]}, cap ${cap}`);
      });
      assert.ok(o.kingLevel <= p.king.level && o.kingLevel >= Math.min(p.king.level, Math.floor(cap)) - 1 && o.kingLevel >= 1 && o.kingLevel <= 9);
      assert.ok(o.skill >= 0.25 && o.skill <= 0.95);
      assert.ok(Math.abs(o.skill - (0.3 + 0.6 * Math.min(1, trophies / 1500))) <= 0.051, `skill ${o.skill} at ${trophies}`);
      skillSum += o.skill;
      assert.ok(BOT_NAMES.includes(o.name));
      names.add(o.name);
      archetypes.add(o.archetype);
      assert.deepEqual(Object.keys(o.hats).sort(), UNIT_IDS.slice().sort());
      for (const h of Object.values(o.hats)) assert.ok(hatIds.has(h), h);
    }
    if (trophies === 0) assert.ok(skillSum / 40 < 0.35);
    if (trophies >= 1500) assert.ok(skillSum / 40 > 0.85);
  }
  assert.deepEqual([...archetypes].sort(), Object.keys(ARCHETYPES).sort(), 'every deck style shows up');
  assert.ok(names.size >= 25, 'plenty of different names');
  assert.ok(BOT_NAMES.length >= 38 && new Set(BOT_NAMES).size === BOT_NAMES.length);
  for (const n of BOT_NAMES) for (const w of AVOID) assert.ok(!n.includes(w));
});

test('opponents: a deliberately low card does not weaken the bot, and upgrading above the curve is an edge', () => {
  // Seven cards at level 5 and one kept at level 1: the bot fields one weak card too, not eight
  const fair = at(700, 90);
  const sandbag = at(700, 90);
  for (const id of fair.deck) fair.cards[id].level = sandbag.cards[id].level = 5;
  sandbag.cards[sandbag.deck[0]].level = 1;
  for (const p of [fair, sandbag]) p.king.xp = KING_LEVELS[3];
  let low = 0;
  for (let s = 0; s < 40; s++) {
    const a = Object.values(makeOpponent(fair, s).levels).sort((x, y) => y - x);
    const b = Object.values(makeOpponent(sandbag, s).levels).sort((x, y) => y - x);
    for (let k = 0; k < 7; k++) assert.ok(b[k] >= 4, `the other seven stay at 4-5 (got ${b})`);
    assert.equal(b[7], 1, 'the bot brings a level-1 card of its own');
    low += a.reduce((x, y) => x + y, 0) - b.reduce((x, y) => x + y, 0);
  }
  assert.ok(low / 40 < 4.5, 'on average only the one card differs');
  // Above the curve: at 300 trophies (cap 4) a level-7 deck meets level 3-4 bots
  const strong = at(300, 91);
  for (const id of strong.deck) strong.cards[id].level = 7;
  strong.king.xp = KING_LEVELS[5]; // King Level 7
  for (let s = 0; s < 20; s++) {
    const o = makeOpponent(strong, s);
    for (const lv of Object.values(o.levels)) assert.ok(lv >= 3 && lv <= 4, `capped at ${lv}`);
    assert.ok(o.kingLevel >= 3 && o.kingLevel <= 4);
  }
  // Never above you: a deck averaging x.75 or x.875 used to round the bot up
  const odd = at(2000, 92);
  odd.deck.forEach((id, k) => (odd.cards[id].level = k < 6 ? 6 : 5)); // 5.75
  for (let s = 0; s < 40; s++) {
    const o = makeOpponent(odd, s);
    const avg = Object.values(o.levels).reduce((x, y) => x + y, 0) / 8;
    assert.ok(avg <= 5.75, `bot average ${avg}`);
  }
  // The arena floor never lifts a bot card above yours (Wobble Summit floor 4, an all-level-1 deck)
  const lazy = at(1500, 93);
  for (let s = 0; s < 20; s++) for (const lv of Object.values(makeOpponent(lazy, s).levels)) assert.equal(lv, 1);
  assert.deepEqual(LEVEL_CURVE[0], [0, 2]);
  assert.equal(levelCap(475), 4.5);
});

// --- fair play & cosmetics ------------------------------------------------------------------

test('fair play: Jellybeans and cosmetics never buy power or change opponents', () => {
  const rich = newProfile(90);
  const fresh = newProfile(90);
  rich.tutorial = fresh.tutorial = 1;
  addBeans(rich, 1e6);
  grantSupporter(rich);
  for (const h of HATS) buyItem(rich, 'hats', h);
  for (const c of COLORS) buyItem(rich, 'colors', c);
  assert.deepEqual(unlockedCards(rich), unlockedCards(fresh));
  assert.deepEqual(rich.cards, fresh.cards);
  assert.equal(rich.gold, 0, 'Jellybeans never turn into gold');
  assert.deepEqual(makeOpponent(rich, 5), makeOpponent(fresh, 5));
  assert.deepEqual(rollChest(rich, 'big'), rollChest(fresh, 'big'));
});

test('cosmetics: buy with Jellybeans, equip only what you own, hats for every unit', () => {
  const p = newProfile(91);
  const party = HATS.find((h) => h.id === 'party');
  assert.equal(buyItem(p, 'hats', party), 'poor');
  addBeans(p, party.price);
  assert.equal(equipHat(p, 'clubber', 'party'), false);
  assert.equal(buyItem(p, 'hats', party), 'bought');
  assert.equal(p.beans, 0);
  assert.equal(buyItem(p, 'hats', party), 'owned');
  assert.ok(equipHat(p, 'clubber', 'party'));
  assert.equal(p.equipped.hats.clubber, 'party');
  assert.equal(p.stats.hatsEquipped, 1);
  assert.ok(equipHat(p, 'clubber', 'party'));
  assert.equal(p.stats.hatsEquipped, 1, 're-equipping the same hat is not a new one');
  assert.ok(equipHat(p, 'bruiser', 'party'));
  assert.ok(equipHat(p, 'megabomb', 'party'));
  assert.equal(equipHat(p, 'dragon', 'party'), false, 'no slot for unknown units');
  assert.deepEqual(HAT_UNITS.map((u) => u.id), UNIT_IDS);

  const gold = COLORS.find((c) => c.supporter);
  const crown = HATS.find((h) => h.supporter);
  addBeans(p, 1e5);
  assert.equal(buyItem(p, 'colors', gold), 'supporter', 'supporter items are not for Jellybeans');
  assert.equal(buyItem(p, 'hats', crown), 'supporter');
  assert.equal(equipColor(p, 'gold'), false);
  grantSupporter(p);
  assert.ok(equipColor(p, 'gold'));
  assert.equal(armyPalette(p), gold.pal);
  p.equipped.color = 'teal'; // not owned (e.g. a hand-edited save): falls back to blue
  assert.equal(armyPalette(p), COLORS[0].pal);
  assertValid(migrate(clone(p)));
});

test('cosmetics: catalogue is sane and readable against the red army', () => {
  const hatIds = HATS.map((h) => h.id);
  assert.equal(new Set(hatIds).size, hatIds.length);
  assert.equal(HATS[0].id, 'none');
  assert.equal(HATS[0].price, 0);
  for (const h of HATS) assert.ok(h.supporter || h.id === 'none' || h.price > 0, `${h.id} has a price`);
  assert.deepEqual(HATS.filter((h) => h.supporter).map((h) => h.id), ['goldcrown']);
  const hue = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if (mx === mn) return null;
    const d = mx - mn;
    const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (hh * 60 + 360) % 360;
  };
  for (const c of COLORS) {
    for (const k of ['body', 'shade', 'light', 'limb', 'dark']) assert.match(c.pal[k], /^#[0-9a-f]{6}$/i, `${c.id}.${k}`);
    const h = hue(c.pal.body);
    if (h != null) assert.ok(h > 30 && h < 330, `${c.id} must not look like the red team (hue ${h.toFixed(0)})`);
  }
});

// --- a whole first week -----------------------------------------------------------------------

test('a first week: chests, shop, matches, trail and upgrades keep a profile valid and moving', () => {
  const p = newProfile(2026);
  const s = memStore();
  let t = NOW;
  let won = 0;
  for (let step = 0; step < 7 * 8; step++) {
    // every 3 hours: open what's ready, claim the shop gift, play 4 matches
    for (const k of CHEST_KINDS) openChest(p, k, t);
    claimFree(p, t);
    for (let m = 0; m < 4; m++) {
      const opp = makeOpponent(p, step * 4 + m);
      const win = (step * 4 + m) % 5 < 3; // 60% wins
      won += win;
      recordMatch(p, win ? { outcome: 'win', crowns: 1 + (m % 2) * 2, enemyCrowns: 0 } : { outcome: 'loss', crowns: 0, enemyCrowns: 1 });
      if (p.tutorial === 0) p.tutorial = 1;
      assert.equal(opp.deck.length, 8);
    }
    for (const m of trailStatus(p)) if (m.claimable) claimTrail(p, m.at);
    for (const b of badgeStatus(p)) if (b.done && !b.claimed) claimBadge(p, b.id);
    for (const id of CARD_ORDER) while (cardState(p, id).canUpgrade) upgradeCard(p, id);
    if (step % 8 === 0) for (const o of shopToday(p, t).offers) buyOffer(p, o.i, t);
    saveProfile(p, s);
    assert.deepEqual(loadProfile(s), p, 'every save loads back the same');
    t += 3 * HOUR;
  }
  assertValid(p);
  assert.equal(p.stats.matches, 7 * 8 * 4);
  assert.equal(p.stats.wins, won);
  assert.ok(p.best >= 650, `climbed to ${p.best}`);
  assert.ok(p.king.level >= 3, `King Level ${p.king.level}`);
  assert.ok(p.stats.chests >= 7 * 8 + 7 * 2 - 2);
  assert.ok(Object.values(p.cards).some((c) => c.level >= 4));
});
