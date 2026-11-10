// Meta game for the 32 cards (docs/WOBBLE-WAR-CARDS.md section 7): the
// Legendary rarity in every table, legendary chest odds and the "never more
// than one copy" rule, the shop's legendary days, the Trail's new milestones,
// the newer opponent styles (each with an answer to fliers), the six new
// hat-wearers, the newer badges, the one-time tips and the card details.
// Run: node --test tests/battle-meta2.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CARD_ORDER, RARITIES, MAX_LEVEL } from '../battle/src/sim/cards.js';
import { UNIT_TYPES } from '../battle/src/sim/unit-types.js';
import { newProfile, migrate, grant, UNIT_IDS, FIRSTS, firstsOf } from '../battle/src/meta/profile.js';
import { UPGRADE_COPIES, UPGRADE_GOLD, AIR_ANSWERS, cardsUpTo, deckNeedsAir, fliersUnlocked, upgradeCard, bestArena } from '../battle/src/meta/collection.js';
import { ARENAS, TRAIL, claimTrail } from '../battle/src/meta/ladder.js';
import { CHESTS, MAX_LEGENDARY, chestOdds, rollChest, openChest } from '../battle/src/meta/chests.js';
import { SHOP, shopToday, buyOffer } from '../battle/src/meta/shop.js';
import { BADGES, badgeStatus, claimBadge } from '../battle/src/meta/badges.js';
import { ARCHETYPES, archetypesFor, buildDeck, makeOpponent } from '../battle/src/meta/opponents.js';
import { HAT_UNITS } from '../battle/src/meta/cosmetics.js';
import { rngFrom } from '../battle/src/meta/profile.js';
import { cardStats, cardKindLine } from '../battle/src/ui/hub-kit.js';

const NOW = new Date(2026, 10, 5, 10, 30).getTime(); // a local date: 2026-11-05 10:30
const DAY = 864e5;
const RARITY_IDS = ['common', 'rare', 'epic', 'legendary'];
const LEGENDARY_ARENA = Math.min(...CARD_ORDER.filter((id) => CARDS[id].rarity === 'legendary').map((id) => CARDS[id].arena));

/** A profile the given trophies in, as if played there (best + trophies). */
function at(trophies, seed = 7) {
  const p = newProfile(seed);
  p.trophies = p.best = trophies;
  p.tutorial = 1;
  p.shop.arena = bestArena(p);
  return p;
}

// --- tables ---------------------------------------------------------------------------

test('rarity tables: four rarities everywhere, the upgrade tables 4 keys x 8 entries', () => {
  assert.deepEqual(Object.keys(RARITIES), RARITY_IDS);
  for (const t of [UPGRADE_COPIES, UPGRADE_GOLD]) {
    assert.deepEqual(Object.keys(t), RARITY_IDS);
    for (const r of RARITY_IDS) {
      assert.equal(t[r].length, 8, r);
      assert.equal(t[r].length, MAX_LEVEL - 1);
      t[r].forEach((v, i) => assert.ok(Number.isInteger(v) && v > 0 && (i === 0 || v >= t[r][i - 1]), `${r}[${i}] = ${v}`));
    }
  }
  assert.deepEqual(UPGRADE_COPIES.legendary, [1, 1, 1, 2, 3, 5, 8, 12]);
  assert.deepEqual(UPGRADE_GOLD.legendary, [100, 300, 800, 2000, 4000, 8000, 15000, 25000]);
  for (const k of ['small', 'big']) assert.ok(Number.isFinite(CHESTS[k].legendary), `${k} chest has a legendary chance`);
  assert.equal(CHESTS.small.legendary, 0);
  assert.equal(CHESTS.big.legendary, 0.05);
  assert.equal(MAX_LEGENDARY, 1);
  assert.deepEqual(Object.keys(SHOP.price), RARITY_IDS);
  assert.deepEqual(Object.keys(SHOP.count), RARITY_IDS);
  assert.equal(SHOP.price.legendary, 1500);
  assert.deepEqual(SHOP.count.legendary, [1, 1]);
  assert.equal(SHOP.legendary, 0.08);
  // A legendary from the Trail (4 copies) is level 4 at once, for 100 + 300 + 800 gold
  const p = at(1750, 3);
  for (const m of TRAIL) claimTrail(p, m.at);
  for (const id of CARD_ORDER.filter((c) => CARDS[c].rarity === 'legendary')) {
    p.gold = 1200;
    while (upgradeCard(p, id).ok);
    assert.equal(p.cards[id].level, 4, `${id} reaches level 4`);
    assert.equal(p.gold, 0);
  }
});

// --- chests -----------------------------------------------------------------------------

test('chests: legendary odds are 0 before Boom Ridge and 5% from there on (Big Chest only)', () => {
  assert.equal(LEGENDARY_ARENA, 2);
  for (const [trophies, arena] of [[0, 0], [299, 0], [300, 1], [649, 1], [650, 2], [1000, 3], [1600, 4]]) {
    const p = at(trophies, 11 + arena);
    assert.equal(bestArena(p), arena);
    const big = chestOdds(p, 'big');
    const small = chestOdds(p, 'small');
    assert.equal(big.legendary, 0.05, 'the popup can say what the chance will be');
    assert.equal(small.odds.legendary, 0);
    assert.equal(big.pool.legendary.length, CARD_ORDER.filter((id) => CARDS[id].rarity === 'legendary' && CARDS[id].arena <= arena).length);
    assert.equal(big.odds.legendary, arena < LEGENDARY_ARENA ? 0 : 0.05, `arena ${arena}`);
    for (const o of [big, small]) for (const r of RARITY_IDS) assert.ok(o.odds[r] >= 0 && o.odds[r] <= 1, `${r} ${o.odds[r]}`);
  }
});

test('chests: never more than one legendary copy, and a common stack still carries the bulk', () => {
  for (const trophies of [700, 1600]) {
    const p = at(trophies, 21);
    const legs = new Set(cardsUpTo(bestArena(p)).filter((id) => CARDS[id].rarity === 'legendary'));
    let hits = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      p.chests.opened.big = i;
      const r = rollChest(p, 'big');
      const l = r.cards.filter((c) => c.rarity === 'legendary');
      assert.ok(l.length <= 1, 'one legendary stack at most');
      if (!l.length) continue;
      hits++;
      assert.equal(l[0].n, 1, 'one copy');
      assert.ok(legs.has(l[0].id), `${l[0].id} is unlocked`);
      assert.ok(r.cards.some((c) => c.rarity === 'common'), 'a common stack is still there');
      assert.ok(r.cards.some((c) => c.rarity === 'rare'), 'the guaranteed rare is still there');
      assert.equal(new Set(r.cards.map((c) => c.id)).size, r.cards.length);
    }
    assert.ok(Math.abs(hits / N - 0.05) < 0.015, `legendary rate ${hits / N}`);
    for (let i = 0; i < 500; i++) {
      p.chests.opened.small = i;
      assert.ok(!rollChest(p, 'small').cards.some((c) => c.rarity === 'legendary'), 'never in a Small Chest');
    }
  }
  // Opening pays exactly the one copy (a new legendary arrives at level 1, no spares)
  const p = at(1600, 22);
  for (let i = 0; i < 400; i++) {
    p.chests.opened.big = i;
    const r = rollChest(p, 'big');
    const l = r.cards.find((c) => c.rarity === 'legendary');
    if (!l || p.cards[l.id]) continue;
    p.chests.big.readyAt = 0;
    const got = openChest(p, 'big', NOW);
    const c = got.cards.find((x) => x.id === l.id);
    assert.ok(c && c.isNew && c.n === 1 && c.level === 1 && c.count === 0);
    return;
  }
  assert.fail('no legendary in 400 Big Chests');
});

test('chests: chestOdds matches what the rolls give (Monte Carlo)', () => {
  for (const trophies of [0, 300, 700, 1100, 1600]) {
    const p = at(trophies, 31);
    for (const kind of ['small', 'big']) {
      const o = chestOdds(p, kind);
      const seen = { common: 0, rare: 0, epic: 0, legendary: 0 };
      const N = 4000;
      for (let i = 0; i < N; i++) {
        p.chests.opened[kind] = i;
        for (const r of new Set(rollChest(p, kind).cards.map((c) => c.rarity))) seen[r]++;
      }
      for (const r of RARITY_IDS) {
        const q = o.odds[r];
        const sd = Math.sqrt((q * (1 - q)) / N);
        assert.ok(Math.abs(seen[r] / N - q) <= 4 * sd + 0.002, `${kind} at ${trophies}: ${r} seen ${seen[r] / N}, shown ${q}`);
      }
    }
  }
});

// The rolls of a Green Hills / Pointy Pass profile from the 14-card game (recorded
// on it with these seeds): gold, Jellybeans, and each stack's rarity and size.
// Only which card fills a stack may differ (the pools grew); no legendary draw happens.
const OLD_CHESTS = [
  [0, 101, 'small', [[28, 0, 'c4 c4'], [35, 0, 'c4 c4'], [28, 0, 'c4 c4'], [29, 0, 'c7 r1'], [28, 0, 'c4 c4'], [32, 0, 'c4 c4']]],
  [0, 101, 'big', [[124, 10, 'r4 c10 c9 c7'], [160, 10, 'r4 c8 c10 c8'], [120, 10, 'c8 c10 r4 c8'], [169, 10, 'r4 c9 c8 c9'], [169, 10, 'r4 c8 c9 c9'], [162, 10, 'r4 c11 c11 r4']]],
  [120, 102, 'small', [[43, 0, 'c4 c4'], [29, 0, 'c7 r1'], [34, 0, 'c4 c4'], [39, 0, 'c4 c4'], [26, 0, 'c3 c5'], [42, 0, 'c4 c4']]],
  [120, 102, 'big', [[126, 10, 'r4 c9 c8 c9'], [135, 10, 'r4 c9 c8 c9'], [148, 10, 'r4 c8 c10 c8'], [169, 10, 'r4 c7 c9 c10'], [138, 10, 'c8 c8 r4 c10'], [121, 10, 'r4 c9 c8 c9']]],
  [300, 103, 'small', [[31, 0, 'c5 c5'], [54, 0, 'c5 c5'], [39, 0, 'c5 c5'], [48, 0, 'c5 c5'], [48, 0, 'c9 r1'], [53, 0, 'c4 c6']]],
  [300, 103, 'big', [[203, 10, 'c10 r4 c11 c11'], [188, 10, 'r4 c12 c10 c10'], [160, 10, 'r4 c13 c18 e1'], [161, 10, 'r4 r4 c27 e1'], [200, 10, 'r4 c12 c9 c11'], [206, 10, 'r4 c11 c9 c12']]],
  [610, 104, 'small', [[51, 0, 'c5 c5'], [43, 0, 'c6 c4'], [33, 0, 'c5 c5'], [50, 0, 'c5 c5'], [46, 0, 'r1 c9'], [56, 0, 'c5 c5']]],
  [610, 104, 'big', [[195, 10, 'r4 c14 c17 e1'], [233, 10, 'r4 c11 c9 c12'], [159, 10, 'c14 c17 r4 e1'], [193, 10, 'r4 c12 c8 c12'], [240, 10, 'c9 c12 c11 r4'], [151, 10, 'r4 c9 c10 c13']]],
];
const OLD_SHOPS = [
  [0, 101, [['g22', '0c20/200 1r2/120 2r4/240'], ['g26', '0c18/180 1r3/180 2r4/240'], ['g38', '0c20/200 1c14/140 2r2/120'], ['g39', '0c10/100 1r2/120 2r3/180'], ['6x', '0c10/100 1c18/180 2r4/240'], ['g30', '0c20/200 1r4/240 2r2/120']]],
  [120, 102, [['g24', '0c17/170 1c17/170 2r4/240'], ['g23', '0c18/180 1c18/180 2r2/120'], ['g33', '0c17/170 1r3/180 2r2/120'], ['10x', '0c15/150 1c12/120 2r2/120'], ['1x', '0c19/190 1c16/160 2r3/180'], ['g35', '0c10/100 1r2/120 2r4/240']]],
  [300, 103, [['g41', '0c15/150 1r2/120 2e1/300'], ['g44', '0c16/160 1r2/120 2e1/300'], ['8x', '0c10/100 1r4/240 2r3/180'], ['g45', '0c14/140 1r4/240 2r3/180'], ['1x', '0c14/140 1c16/160 2e1/300'], ['7x', '0c17/170 1r3/180 2e1/300']]],
  [610, 104, [['8x', '0c17/170 1c20/200 2r2/120'], ['11x', '0c13/130 1c10/100 2r2/120'], ['g44', '0c14/140 1r3/180 2r2/120'], ['g49', '0c20/200 1c11/110 2r5/300'], ['g48', '0c11/110 1r2/120 2e1/300'], ['g44', '0c16/160 1c14/140 2r4/240']]],
];

test('chests and shop: a Green Hills or Pointy Pass profile rolls what it always did (fixed seeds)', () => {
  for (const [trophies, seed, kind, rows] of OLD_CHESTS) {
    const p = at(trophies, seed);
    rows.forEach(([gold, beans, stacks], i) => {
      p.chests.opened[kind] = i;
      const r = rollChest(p, kind);
      assert.deepEqual([r.gold, r.beans, r.cards.map((c) => c.rarity[0] + c.n).join(' ')], [gold, beans, stacks], `${kind} chest ${i} at ${trophies}`);
      for (const c of r.cards) assert.ok(CARDS[c.id].arena <= bestArena(p));
    });
  }
  for (const [trophies, seed, rows] of OLD_SHOPS) {
    const p = at(trophies, seed);
    rows.forEach(([free, offers], d) => {
      const q = at(trophies, seed);
      q.shop = { day: '', bought: [], free: false, arena: p.shop.arena };
      const s = shopToday(q, NOW + d * DAY);
      const fr = s.free.reward;
      assert.equal(fr.gold ? 'g' + fr.gold : Object.values(fr.cards)[0] + 'x', free, `gift on day ${d} at ${trophies}`);
      assert.equal(s.offers.map((o) => `${o.i}${o.rarity[0]}${o.count}/${o.price}`).join(' '), offers, `offers on day ${d} at ${trophies}`);
    });
  }
});

// --- shop -------------------------------------------------------------------------------

test('shop: the third offer is a Legendary on about 8% of days once one is unlocked, never before', () => {
  for (const trophies of [0, 300, 640]) {
    const p = at(trophies, 41);
    for (let d = 0; d < 400; d++) assert.ok(!shopToday(p, NOW + d * DAY).offers.some((o) => o.rarity === 'legendary'), `no legendary at ${trophies}`);
  }
  for (const trophies of [700, 1600]) {
    const p = at(trophies, 42);
    const legs = new Set(cardsUpTo(bestArena(p)).filter((id) => CARDS[id].rarity === 'legendary'));
    let days = 0;
    const N = 2500;
    for (let d = 0; d < N; d++) {
      const s = shopToday(p, NOW + d * DAY);
      assert.equal(s.offers.length, 3);
      assert.equal(new Set(s.offers.map((o) => o.cardId)).size, 3, 'three different cards');
      const l = s.offers.filter((o) => o.rarity === 'legendary');
      assert.ok(l.length <= 1);
      if (!l.length) continue;
      days++;
      assert.equal(l[0].i, 2, 'the third offer');
      assert.ok(legs.has(l[0].cardId));
      assert.equal(l[0].count, 1);
      assert.equal(l[0].price, 1500);
    }
    assert.ok(Math.abs(days / N - 0.08) < 0.02, `legendary days ${days / N}`);
  }
  // Buying it: 1500 gold for the card, once
  const p = at(1600, 43);
  let d = 0;
  while (!shopToday(p, NOW + d * DAY).offers.some((o) => o.rarity === 'legendary')) d++;
  const o = shopToday(p, NOW + d * DAY).offers[2];
  p.gold = 1499;
  assert.equal(buyOffer(p, 2, NOW + d * DAY), 'poor');
  p.gold = 1600;
  const got = buyOffer(p, 2, NOW + d * DAY);
  assert.equal(got.price, 1500);
  assert.equal(p.gold, 100);
  assert.ok(p.cards[o.cardId]);
  assert.equal(buyOffer(p, 2, NOW + d * DAY), 'bought');
});

// --- Trophy Trail -------------------------------------------------------------------------

// The 14-card Trail: every one of these stays where it was.
const OLD_TRAIL = [10, 40, 70, 100, 140, 180, 220, 260, 300, 330, 370, 420, 470, 520, 570, 610, 650, 690, 730, 800, 860, 920, 960, 1000, 1080, 1160, 1240, 1320, 1400, 1500, 1550, 1600];
// Contract section 7: the 19 milestones for the 18 newer cards
const NEW_TRAIL = {
  25: { cards: { sprouts: 20 } },
  120: { cards: { bananaPeels: 20 } },
  395: { cards: { propellerPals: 20 } },
  445: { cards: { pogoBean: 12 } },
  495: { cards: { netter: 12 } },
  760: { cards: { bigSneeze: 20 } },
  830: { cards: { shakenSoda: 8 } },
  890: { cards: { bombJuggler: 4 } },
  1020: { cards: { boingBox: 20 } },
  1050: { cards: { beanPatch: 12 } },
  1110: { cards: { anvil: 12 } },
  1200: { cards: { nutcracker: 8 } },
  1280: { cards: { wreckingCrane: 4 } },
  1520: { cards: { brollyBrigade: 12 } },
  1575: { cards: { bubbleWrap: 8 } },
  1625: { cards: { tummyDrummer: 8 } },
  1650: { cards: { pelican: 4 } },
  1700: { cards: { bigJelly: 4 } },
  1750: { gold: 1500, beans: 200 },
};

test('trophy trail: the 19 milestones of the contract, no old one moved, copies by rarity', () => {
  assert.equal(TRAIL.length, OLD_TRAIL.length + 19);
  assert.deepEqual(TRAIL.map((m) => m.at), [...OLD_TRAIL, ...Object.keys(NEW_TRAIL).map(Number)].sort((a, b) => a - b));
  for (const [at, reward] of Object.entries(NEW_TRAIL)) assert.deepEqual(TRAIL.find((m) => m.at === +at).reward, reward, `${at}`);
  const COPIES = { common: 20, rare: 12, epic: 8, legendary: 4 };
  const newer = CARD_ORDER.slice(14);
  assert.equal(newer.length, 18);
  for (const id of newer) {
    const m = TRAIL.find((x) => x.reward.cards && x.reward.cards[id]);
    assert.ok(m, `${id} on the Trail`);
    assert.equal(m.reward.cards[id], COPIES[CARDS[id].rarity], `${id} copies`);
    assert.ok(m.at >= ARENAS[CARDS[id].arena].trophies, `${id} after its gate`);
  }
});

// --- opponents ----------------------------------------------------------------------------

test('opponents: every style is valid, waits for its first card, and answers fliers wherever they fly', () => {
  const firstFlier = Math.min(...CARD_ORDER.filter((id) => CARDS[id].flying).map((id) => CARDS[id].arena));
  assert.equal(firstFlier, 1);
  assert.deepEqual(AIR_ANSWERS, ['archers', 'arrowRain', 'netter', 'bombJuggler', 'bigSneeze', 'shakenSoda', 'anvil']);
  for (const id of AIR_ANSWERS) {
    const c = CARDS[id];
    assert.ok(c.kind === 'spell' || UNIT_TYPES[c.unit].hitsAir, `${id} hits air`);
  }
  // The contract's five newer styles, exactly
  assert.deepEqual(ARCHETYPES.hop.cards, ['pogoBean', 'sprouts', 'bananaPeels', 'spikers', 'bomb', 'netter', 'archers', 'arrowRain']);
  assert.deepEqual(ARCHETYPES.fizz.cards, ['bombJuggler', 'shakenSoda', 'bigSneeze', 'megaBomb', 'squire', 'propellerPals', 'sprouts', 'archers']);
  assert.deepEqual(ARCHETYPES.fortress.cards, ['wreckingCrane', 'beanPatch', 'boingBox', 'brick', 'anvil', 'archers', 'bananaPeels', 'arrowRain']);
  assert.deepEqual(ARCHETYPES.sky.cards, ['pelican', 'propellerPals', 'brollyBrigade', 'netter', 'bombJuggler', 'bigSneeze', 'squire', 'arrowRain']);
  assert.deepEqual(ARCHETYPES.parade.cards, ['bigJelly', 'tummyDrummer', 'bubbleWrap', 'clubberGang', 'bombJuggler', 'archers', 'sprouts', 'boulder']);
  assert.deepEqual([ARCHETYPES.hop.arena, ARCHETYPES.fizz.arena, ARCHETYPES.fortress.arena, ARCHETYPES.sky.arena, ARCHETYPES.parade.arena], [1, 2, 3, 4, 4]);
  for (const [id, A] of Object.entries(ARCHETYPES)) {
    assert.ok(A.name && A.cards.length === 8 && new Set(A.cards).size === 8, id);
    for (const c of A.cards) assert.ok(CARDS[c], `${id}: ${c}`);
    if (A.arena) assert.equal(CARDS[A.cards[0]].arena, A.arena, `${id} suits the arena of its first card`);
  }
  for (let arena = 0; arena < ARENAS.length; arena++) {
    const ids = archetypesFor(arena);
    for (const [id, A] of Object.entries(ARCHETYPES)) assert.equal(ids.includes(id), !A.arena || CARDS[A.cards[0]].arena <= arena, `${id} at arena ${arena}`);
    if (arena < firstFlier) continue;
    for (const id of ids) {
      assert.ok(ARCHETYPES[id].cards.some((c) => AIR_ANSWERS.includes(c) && CARDS[c].arena <= arena), `${id} lists an air answer at arena ${arena}`);
      for (let s = 0; s < 25; s++) {
        const deck = buildDeck(arena, id, rngFrom('air', arena, id, s));
        assert.ok(deck.some((c) => AIR_ANSWERS.includes(c)), `${id} at arena ${arena}: ${deck}`);
      }
    }
  }
  // Bots pick only styles their arena allows, and the newer ones do show up
  const picked = new Map();
  for (const trophies of [0, 150, 320, 700, 1050, 1600]) {
    const arena = ARENAS.findLastIndex((a) => trophies >= a.trophies);
    for (let s = 0; s < 60; s++) {
      const o = makeOpponent(at(trophies, 600 + s), s);
      assert.ok(archetypesFor(arena).includes(o.archetype), `${o.archetype} at ${trophies}`);
      if (arena >= firstFlier) assert.ok(o.deck.some((c) => AIR_ANSWERS.includes(c)), `${o.archetype} deck ${o.deck}`);
      picked.set(o.archetype, (picked.get(o.archetype) || 0) + 1);
    }
  }
  for (const id of Object.keys(ARCHETYPES)) assert.ok(picked.get(id) > 0, `${id} is picked somewhere`);
});

// --- hats, badges, tips ---------------------------------------------------------------------

test('hats: the six new hat-wearers are in the wardrobe, the four with their own headgear never', () => {
  for (const id of ['pogo', 'netter', 'juggler', 'brolly', 'drummer', 'jelly']) assert.ok(UNIT_IDS.includes(id), id);
  for (const [id, t] of Object.entries(UNIT_TYPES)) assert.equal(UNIT_IDS.includes(id), !t.noHat, `${id}: noHat ${!!t.noHat}`);
  assert.deepEqual(HAT_UNITS.map((u) => u.id), UNIT_IDS);
  for (const u of HAT_UNITS) assert.ok(u.name && u.plural && UNIT_TYPES[u.id], u.id);
  // A save from before the newer units: their slots start bare
  const old = newProfile(5);
  old.owned.hats.push('party');
  old.equipped.hats = { clubber: 'party', squire: 'none' };
  const p = migrate(JSON.parse(JSON.stringify(old)));
  assert.equal(p.equipped.hats.clubber, 'party');
  for (const id of ['pogo', 'netter', 'juggler', 'brolly', 'drummer', 'jelly']) assert.equal(p.equipped.hats[id], 'none');
  const o = makeOpponent(at(1600, 9), 3);
  assert.deepEqual(Object.keys(o.hats).sort(), UNIT_IDS.slice().sort());
});

test('badges: the five newer ones count the stats main.js keeps, and pay Jellybeans', () => {
  const want = { slips: 25, homeRuns: 10, airMail: 20, jellySpits: 20, craneLaunches: 30 };
  const names = { slips: "Slip 'n' Slide", homeRuns: 'Home Run', airMail: 'Air Mail', jellySpits: 'Jelly Belly', craneLaunches: 'Crane Game' };
  const p = newProfile(13);
  for (const [stat, goal] of Object.entries(want)) {
    const b = BADGES.find((x) => x.stat === stat);
    assert.ok(b, stat);
    assert.equal(b.goal, goal);
    assert.equal(b.name, names[stat]);
    assert.ok(b.reward.beans > 0);
    assert.equal(p.stats[stat], 0, `${stat} is a profile stat`);
    p.stats[stat] = goal;
  }
  const q = migrate(JSON.parse(JSON.stringify(p)));
  for (const stat of Object.keys(want)) assert.equal(q.stats[stat], want[stat], `${stat} survives a save`);
  for (const stat of Object.keys(want)) {
    const b = badgeStatus(q).find((x) => x.stat === stat);
    assert.ok(b.done && !b.claimed);
    const beans = q.beans;
    assert.ok(claimBadge(q, b.id));
    assert.equal(q.beans, beans + b.reward.beans);
    assert.equal(claimBadge(q, b.id), null);
  }
});

test('tips: the first flier, building and legendary each bring one friendly notice, once', () => {
  assert.deepEqual(FIRSTS, ['flier', 'building', 'legendary']);
  assert.deepEqual(firstsOf(CARDS.propellerPals), ['flier']);
  assert.deepEqual(firstsOf(CARDS.pelican), ['flier', 'legendary']);
  assert.deepEqual(firstsOf(CARDS.wreckingCrane), ['building', 'legendary']);
  assert.deepEqual(firstsOf(CARDS.clubbers), []);
  const p = newProfile(17);
  assert.deepEqual(p.firsts, { flier: false, building: false, legendary: false });
  const tips = () => p.notices.filter((n) => n.kind === 'first');
  grant(p, { cards: { clubbers: 5, sprouts: 3 } });
  assert.equal(tips().length, 0);
  grant(p, { cards: { propellerPals: 20 } });
  assert.deepEqual(tips().map((n) => [n.card, n.what]), [['propellerPals', ['flier']]]);
  grant(p, { cards: { propellerPals: 3 } }); // more copies: no news
  grant(p, { cards: { boingBox: 1, beanPatch: 1 } }); // two buildings at once: one tip
  assert.deepEqual(tips().map((n) => n.card), ['propellerPals', 'boingBox']);
  grant(p, { cards: { pelican: 1 } }); // a flier too, but that one was told
  assert.deepEqual(tips()[2], { kind: 'first', card: 'pelican', what: ['legendary'] });
  grant(p, { cards: { bigJelly: 1, wreckingCrane: 1 } });
  assert.equal(tips().length, 3, 'once each');
  assert.deepEqual(p.firsts, { flier: true, building: true, legendary: true });
  const q = migrate(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(q.firsts, p.firsts);
  assert.equal(q.notices.length, p.notices.length);
  // A save that already owns a building (and no flag): it isn't news any more
  const r = newProfile(18);
  r.cards.beanPatch = { level: 2, count: 0 };
  delete r.firsts;
  const r2 = migrate(JSON.parse(JSON.stringify(r)));
  assert.deepEqual(r2.firsts, { flier: false, building: true, legendary: false });
});

// --- the deck editor and card details -------------------------------------------------------

test('deck: "no air answer" only once fliers are about and nothing in the deck hits them', () => {
  const p = at(100, 51);
  p.deck = ['clubbers', 'squire', 'spikers', 'bomb', 'boulder', 'clubberGang', 'sprouts', 'bananaPeels'];
  for (const id of p.deck) p.cards[id] = p.cards[id] || { level: 1, count: 0 };
  assert.equal(fliersUnlocked(p), false);
  assert.equal(deckNeedsAir(p), false, 'no fliers in Green Hills');
  p.trophies = p.best = 300;
  assert.equal(fliersUnlocked(p), true);
  assert.equal(deckNeedsAir(p), true);
  for (const id of AIR_ANSWERS.filter((c) => CARDS[c].arena <= 1)) {
    p.cards[id] = { level: 1, count: 0 };
    p.deck[7] = id;
    assert.equal(deckNeedsAir(p), false, id);
  }
});

test('card details: the newer kinds say what they are and every stat is a real value', () => {
  assert.equal(cardKindLine(CARDS.propellerPals), 'Unit card · flies');
  assert.equal(cardKindLine(CARDS.pelican), 'Unit card · flies');
  assert.equal(cardKindLine(CARDS.brollyBrigade), 'Unit card · lands anywhere');
  assert.equal(cardKindLine(CARDS.boingBox), 'Building · lasts 25 s');
  assert.equal(cardKindLine(CARDS.wreckingCrane), 'Building · lasts 28 s');
  assert.equal(cardKindLine(CARDS.anvil), 'Spell · cast anywhere');
  assert.equal(cardKindLine(CARDS.clubbers), 'Unit card · 2 beans');
  const targets = (id) => cardStats(id, 1).find((r) => r.label === 'Targets').value;
  assert.equal(targets('brick'), 'Buildings & towers');
  assert.equal(targets('pogoBean'), 'Buildings & towers');
  for (const id of ['archers', 'netter', 'bombJuggler', 'arrowRain', 'bigSneeze', 'shakenSoda', 'anvil']) assert.equal(targets(id), 'Air & ground', id);
  assert.equal(targets('tummyDrummer'), 'Nothing (buffs friends)');
  for (const id of ['clubbers', 'propellerPals', 'pelican', 'bigJelly', 'boingBox', 'boulder']) assert.equal(targets(id), 'Ground', id);
  assert.equal(targets('bubbleWrap'), 'Your own beans');
  const row = (id, label) => cardStats(id, 1).find((r) => r.label === label);
  assert.equal(row('boingBox', 'Lifetime').value, '25 s');
  assert.equal(row('beanPatch', 'Lifetime').value, '24 s');
  assert.ok(/Sprout/.test(row('beanPatch', 'Spawns').value));
  assert.ok(/flies/.test(row('propellerPals', 'Speed').value));
  assert.ok(/anywhere/.test(row('brollyBrigade', 'Units').value));
  assert.equal(row('bombJuggler', 'Bomb damage').value, 60);
  assert.equal(row('wreckingCrane', 'Health').next, Math.round(700 * 1.1));
  for (const id of CARD_ORDER) {
    for (const lv of [1, 5, MAX_LEVEL]) {
      const rows = cardStats(id, lv);
      assert.ok(rows.length >= 4 && rows.length <= 6, `${id}: ${rows.length} rows`);
      assert.ok(rows.some((r) => r.label === 'Targets'), id);
      for (const r of rows) {
        assert.ok(r.label && r.value !== undefined && r.value !== '', `${id} ${r.label}`);
        assert.ok(!/NaN|undefined|Infinity/.test(String(r.value) + String(r.next ?? '')), `${id} ${r.label}: ${r.value} -> ${r.next}`);
        if (lv === MAX_LEVEL) assert.equal(r.next ?? null, null, `${id} ${r.label} has no next level at max`);
      }
    }
  }
});
