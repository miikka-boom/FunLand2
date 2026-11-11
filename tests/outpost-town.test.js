import test from 'node:test';
import assert from 'node:assert/strict';
import { Town, newTownState, powerOf, chanceOf, oddsLabel, threatOf, tierOf, heartsOf, homePriceFor, landPriceFor, stationLevelOf, fenceTierOf, lotNeighbours } from '../outpost/src/town.js';
import { migrate } from '../outpost/src/save.js';
import { LOTS, LOT, START, START_LOT, DECOR, DECOR_ORDER, HOME_SIZE, HOME_PRICES, LAND_PRICES, LEVEL_COST, MAX_LEVEL, PAY, LEGEND_BY, TUNING_DEFAULTS } from '../outpost/src/config.js';
import { simulate } from '../outpost/tools/player.mjs';

function make(seed = 7) {
  const t = Date.UTC(2026, 5, 1, 9);
  const s = newTownState(t, seed);
  const m = new Town(s, { clock: { now: () => t }, tuning: { ...TUNING_DEFAULTS } });
  return { m, s };
}

const noOverlap = (s) => {
  const seen = new Map();
  for (const o of s.objects)
    for (let i = o.i; i < o.i + o.size; i++)
      for (let j = o.j; j < o.j + o.size; j++) {
        const k = `${i},${j}`;
        assert.ok(!seen.has(k), `objects ${seen.get(k)} and ${o.id} overlap at ${k}`);
        seen.set(k, o.id);
      }
};

test('the start: the Gas Station, one Rookie in a tent, three decorations, on one lot', () => {
  const { m, s } = make();
  assert.equal(s.coins, START.coins);
  assert.equal(s.night, 1);
  assert.equal(s.people.length, 1);
  const p = s.people[0];
  assert.equal(p.rarity, 'rookie');
  assert.equal(p.level, 1);
  assert.equal(m.picked().id, p.id);
  assert.ok(m.station());
  assert.ok(m.homeOf(p.id));
  assert.equal(s.objects.filter((o) => o.kind === 'decor').length, START.decor.length);
  assert.equal(m.lotCount(), 1);
  noOverlap(s);
  for (const o of s.objects) for (let i = o.i; i < o.i + o.size; i++) for (let j = o.j; j < o.j + o.size; j++) assert.ok(m.ownsTile(i, j), `${o.kind} on your land`);
  assert.ok(m.hasRoom(HOME_SIZE), 'room for a home');
  assert.equal(m.hint(), 'play');
});

test('power, threat and odds: more power, better odds; labels in order', () => {
  const p = { rarity: 'rookie', level: 1 };
  assert.equal(powerOf(p), 10);
  assert.equal(powerOf({ rarity: 'hero', level: 1 }), 15);
  assert.ok(powerOf({ rarity: 'legend', level: 10 }) > powerOf({ rarity: 'hero', level: 10 }));
  for (let n = 1; n < 200; n++) assert.ok(threatOf(n + 1) > threatOf(n), 'tougher every night');
  assert.ok(chanceOf(20, 10) > chanceOf(12, 10) && chanceOf(12, 10) > chanceOf(8, 10));
  assert.equal(chanceOf(1000, 1), 0.95);
  assert.equal(chanceOf(1, 1000), 0.05);
  assert.equal(oddsLabel(0.9).id, 'easy');
  assert.equal(oddsLabel(0.6).id, 'good');
  assert.equal(oddsLabel(0.4).id, 'tough');
  assert.equal(oddsLabel(0.1).id, 'risky');
});

test('a night: the first is a sure win; a win pays and moves on, a loss pays a third and stays', () => {
  const { m, s } = make();
  assert.equal(m.chance(), 1);
  const r1 = m.play();
  assert.ok(r1.ok && r1.win);
  assert.equal(r1.coins, PAY.base + PAY.perNight);
  assert.equal(s.night, 2);
  assert.equal(s.coins, START.coins + r1.coins);
  m.force.outcome = 'lose';
  const before = s.coins;
  const r2 = m.play();
  assert.ok(!r2.win);
  assert.equal(s.night, 2, 'the same night again');
  assert.equal(r2.coins, Math.round((PAY.base + PAY.perNight * 2) * PAY.loss));
  assert.equal(s.coins, before + r2.coins);
  assert.equal(s.runs, 2);
  assert.equal(s.wins, 1);
  assert.equal(s.stats.losses, 1);
});

test('the Gas Station and the fence fix themselves up as nights are won', () => {
  assert.equal(stationLevelOf(1), 1);
  assert.equal(stationLevelOf(6), 2);
  assert.equal(stationLevelOf(11), 3);
  assert.equal(stationLevelOf(31), 7);
  assert.equal(stationLevelOf(500), 7);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(fenceTierOf), [0, 0, 1, 1, 2, 2, 3]);
  const { m, s } = make();
  let ups = 0;
  for (let k = 0; k < 12; k++) {
    m.force.outcome = 'win';
    const r = m.play();
    if (r.station) {
      ups++;
      assert.equal(r.station.to, m.stationLevel());
    }
  }
  assert.equal(s.night, 13);
  assert.equal(ups, 2, 'nights 6 and 11');
});

test('upgrade: costs coins, one level at a time; the home grows every other level, a heart in between', () => {
  const { m, s } = make();
  const p = s.people[0];
  s.coins = 10;
  assert.equal(m.canUpgrade(p.id).ok, false);
  assert.ok(m.upgrade(p.id).short > 0, 'how many more coins');
  s.coins = 10000;
  const tiers = [tierOf(1)];
  for (let L = 2; L <= MAX_LEVEL; L++) {
    const before = s.coins;
    const r = m.upgrade(p.id);
    assert.ok(r.ok);
    assert.equal(r.to, L);
    assert.equal(before - s.coins, LEVEL_COST[L - 2]);
    assert.ok(r.powerAfter > r.powerBefore);
    assert.equal(r.newTier, tierOf(L) !== tierOf(L - 1));
    tiers.push(tierOf(L));
  }
  assert.deepEqual(tiers, [0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
  assert.deepEqual([1, 2, 3, 4, 5, 10].map(heartsOf), [0, 0, 1, 0, 1, 0]);
  assert.equal(m.upgrade(p.id).max, true);
});

test('a new home: pay, someone moves in there; the first is a Hero, a Legend comes by the 8th', () => {
  const { m, s } = make();
  s.coins = 100000;
  s.people[0].level = 5;
  const at = m.freeSpot(HOME_SIZE);
  const r = m.buildHome(at.i, at.j);
  assert.ok(r.ok);
  assert.equal(r.price, HOME_PRICES[0]);
  assert.equal(r.person.rarity, 'hero');
  assert.equal(r.person.level, 4, 'one below the best');
  assert.equal(m.homeOf(r.person.id).i, at.i);
  assert.ok(r.stronger, 'a Hero at Lv 4 beats a Rookie at Lv 5');
  assert.notEqual(r.person.first, s.people[0].first, 'a new name');
  assert.equal(m.buildHome(at.i, at.j).ok, false, 'not on top of a home');
  assert.equal(m.buildHome(0, 0).ok, false, 'not off your land');
  // More land, more homes: a Legend by the LEGEND_BY-th.
  for (const [a, b] of [[3, 2], [1, 2], [2, 3], [2, 1]]) assert.ok(m.cheat('clear', [a, b]).ok);
  for (let k = 2; k <= LEGEND_BY; k++) {
    const spot = m.freeSpot(HOME_SIZE);
    assert.ok(m.buildHome(spot.i, spot.j).ok);
  }
  assert.ok(s.people.some((p) => p.rarity === 'legend'));
  assert.equal(homePriceFor(2), HOME_PRICES[1]);
  assert.ok(homePriceFor(20) > homePriceFor(19));
  noOverlap(s);
});

test('no room for a home: canBuildHome says so (and the hint points at the lot next door)', () => {
  const { m, s } = make();
  s.coins = 100000;
  for (;;) {
    const spot = m.freeSpot(HOME_SIZE);
    if (!spot) break;
    assert.ok(m.buildHome(spot.i, spot.j).ok);
  }
  const c = m.canBuildHome();
  assert.equal(c.ok, false);
  assert.equal(c.room, false);
  s.runs = 3;
  assert.equal(m.hint(), 'land');
});

test('decorations: buy one and put it down; only on free land of yours', () => {
  const { m, s } = make();
  s.coins = 1000;
  const k = DECOR_ORDER[0];
  const spot = m.freeSpot(DECOR[k].size);
  const r = m.buy(k, spot.i, spot.j);
  assert.ok(r.ok);
  assert.equal(s.coins, 1000 - DECOR[k].price);
  assert.equal(m.buy(k, spot.i, spot.j).reason, 'Something is in the way');
  assert.equal(m.buy(k, 0, 0).reason, 'Only on your land');
  s.coins = 0;
  assert.ok(m.canBuy('carousel').short > 0);
  for (let n = 1; n < DECOR_ORDER.length; n++) assert.ok(DECOR[DECOR_ORDER[n]].price >= DECOR[DECOR_ORDER[n - 1]].price, 'cheapest first');
});

test('moving: anything goes anywhere free on your land', () => {
  const { m, s } = make();
  const st = m.station();
  const home = m.homeOf(s.people[0].id);
  assert.equal(m.move(home.id, st.i, st.j).ok, false, 'not onto the station');
  const spot = m.freeSpot(HOME_SIZE, { i: 20, j: 20 });
  const r = m.move(home.id, spot.i, spot.j);
  assert.ok(r.ok);
  assert.deepEqual([home.i, home.j], [spot.i, spot.j]);
  assert.ok(m.move(st.id, st.i, st.j).ok, 'the station can stay where it is');
  noOverlap(s);
});

test('land: next door only, prices rise, a landmark is restored, a surprise lot pays out', () => {
  const { m, s } = make();
  assert.deepEqual(m.frontier().map((f) => f.key).sort(), ['1,2', '2,1', '2,3', '3,2']);
  assert.equal(m.canClear(0, 0).far, true);
  s.coins = 100000;
  const r = m.clear(3, 2);
  assert.ok(r.ok);
  assert.equal(r.price, LAND_PRICES[0]);
  assert.equal(m.landPrice(), LAND_PRICES[1]);
  assert.equal(m.clear(3, 2).owned, true);
  // The Drive-in (3,3) is a landmark.
  const d = m.clear(3, 3);
  assert.equal(d.landmark, LOTS['3,3'].landmark);
  assert.ok(s.objects.some((o) => o.kind === 'landmark' && o.ref === 'drivein'));
  // The Water Park (4,4) is a surprise.
  m.clear(4, 3);
  const before = s.coins;
  const w = m.clear(4, 4);
  assert.ok(w.coins > 0);
  assert.equal(s.coins, before - w.price + w.coins);
  assert.ok(landPriceFor(30) > landPriceFor(29));
  noOverlap(s);
});

test('the fence runs round your land', () => {
  const { m, s } = make();
  assert.equal(m.fenceEdges().length, 4);
  s.coins = 1000;
  m.clear(3, 2);
  const e = m.fenceEdges();
  assert.equal(e.length, 6);
  assert.ok(!e.some((x) => x.a === 2 && x.b === 2 && x.side === 'i1'), 'no fence between your own lots');
  assert.equal(lotNeighbours(0, 0).length, 2);
});

test('the hints walk the first nights: play, a home, upgrade, play', () => {
  const { m, s } = make(3);
  assert.equal(m.hint(), 'play');
  m.play();
  assert.equal(m.hint(), 'build', 'the first home as soon as it can be afforded');
  const spot = m.freeSpot(HOME_SIZE);
  const r = m.buildHome(spot.i, spot.j);
  assert.equal(r.person.rarity, 'hero');
  m.setPick(r.person.id);
  assert.equal(m.hint(), 'play');
  s.coins = 1000;
  s.runs = 5;
  s.night = 9;
  assert.equal(m.hint(), 'upgrade', 'tonight looks tough and an upgrade is affordable');
  s.runs = 40;
  s.built = 5;
  m.cheat('clear', m.suggestLot());
  assert.equal(m.hint(), null, 'no more hints once you know your way around');
});

test('the same seed plays the same game', () => {
  const a = simulate({ seed: 11, runs: 60 });
  const b = simulate({ seed: 11, runs: 60 });
  assert.deepEqual(a.rows.map((r) => [r.night, r.win, r.coins, r.people]), b.rows.map((r) => [r.night, r.win, r.coins, r.people]));
});

test('saves: a round trip keeps everything; anything else becomes a fresh town', () => {
  const { m, s } = make();
  s.coins = 1000;
  m.play();
  m.clear(3, 2);
  const back = migrate(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back, JSON.parse(JSON.stringify(s)));
  const old = JSON.parse(JSON.stringify(s));
  delete old.stats;
  delete old.built;
  old.objects.push({ id: 99, kind: 'junk', i: 1, j: 1, size: 1 });
  const fixed = migrate(old);
  assert.equal(fixed.built, 0);
  assert.ok(fixed.stats.spent);
  assert.ok(!fixed.objects.some((o) => o.kind === 'junk'), 'unknown objects go');
  for (const bad of [null, 42, [], { people: [] }, { people: [{ id: 1 }] }]) assert.equal(migrate(bad).night, 1);
});

test('pacing: a new survivor early, land soon after, mostly winning, a Legend in the first hundred nights', () => {
  const sims = Array.from({ length: 12 }, (_, k) => simulate({ seed: k + 1, runs: 100 }));
  const med = (xs) => xs.slice().sort((p, q) => p - q)[Math.floor(xs.length / 2)];
  assert.ok(med(sims.map((x) => x.first.home1)) <= 5, 'the first new home by night 5');
  assert.ok(med(sims.map((x) => x.first.land1)) <= 20, 'the first lot by night 20');
  assert.ok(med(sims.map((x) => x.first.fixedUp)) <= 15, 'the station Fixed up by night 15');
  assert.ok(sims.every((x) => x.first.legend != null), 'a Legend for everyone');
  const wins = med(sims.map((x) => x.rows.filter((r) => r.win).length / x.rows.length));
  assert.ok(wins >= 0.65 && wins <= 0.95, `win rate ${wins}`);
  const at100 = sims.map((x) => x.rows[99]);
  assert.ok(med(at100.map((r) => r.people)) >= 8, 'a crowd by night 100');
  assert.ok(med(at100.map((r) => r.lots)) >= 6, 'six lots by night 100');
});

test('START_LOT is the start lot', () => {
  assert.equal(LOTS[`${START_LOT[0]},${START_LOT[1]}`].kind, 'S');
  assert.equal(LOT, 7);
});
