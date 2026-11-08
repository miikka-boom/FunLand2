import test from 'node:test';
import assert from 'node:assert/strict';
import { Town, newTownState, lotPriceFor, gapBetween, tierOf, fenceTierOf, lotNeighbours, ringOf, COMMON_DECOR } from '../outpost/src/town.js';
import { migrate } from '../outpost/src/save.js';
import { LOTS, LOT, MAP, LAND_CAP, LOT_PRICES, DECOR, HOME_SIZE, WISH, STATUE_DAY } from '../outpost/src/config.js';

const HOUR = 3600e3;

function make(seed = 7) {
  let t = Date.UTC(2026, 5, 1, 9);
  const clock = { now: () => t, set: (v) => (t = v), add: (ms) => (t += ms) };
  const s = newTownState(t, seed);
  const m = new Town(s, { clock });
  return { m, s, clock };
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

test('the start: one lot laid out, everyone housed, nothing overlapping, one free plot', () => {
  const { m, s } = make();
  assert.equal(m.lotCount(), 1);
  assert.equal(m.campers().length, 0);
  assert.equal(s.objects.filter((o) => o.kind === 'home').length, 3);
  noOverlap(s);
  for (const o of s.objects) for (let i = o.i; i < o.i + o.size; i++) for (let j = o.j; j < o.j + o.size; j++) assert.ok(m.ownsTile(i, j));
  const spot = m.homeSpot({ id: 99, family: null });
  assert.ok(spot, 'the snug free plot');
  assert.equal(m.station().ref, 'bigtop');
});

test('lots: adjacency, prices by count, the land cap by zone', () => {
  const { m, s } = make();
  assert.deepEqual(
    m
      .frontier()
      .map((f) => f.key)
      .sort(),
    ['1,2', '2,1', '2,3', '3,2'],
  );
  assert.equal(m.canClear(0, 0).far, true);
  assert.equal(m.canClear(2, 2).owned, true);
  assert.equal(lotPriceFor(2), 50);
  assert.equal(lotPriceFor(13), 2800);
  assert.equal(lotPriceFor(14), 3300);
  assert.equal(lotNeighbours(0, 0).length, 2);
  assert.equal(ringOf(0, 2), 2);
  s.coins = 1e6;
  assert.ok(m.clear(1, 2).ok);
  assert.ok(m.clear(2, 1).ok);
  assert.equal(m.lotCount(), LAND_CAP[0]);
  const capped = m.canClear(3, 2);
  assert.equal(capped.capped, true);
  assert.equal(capped.zone, 2);
  m.cheat('skulls', 100);
  assert.equal(m.landCap(), LAND_CAP[1]);
  assert.ok(m.canClear(3, 2).ok);
  assert.equal(m.nextLotPrice(), LOT_PRICES[4]);
  // Everything cleared stays legal.
  noOverlap(s);
});

test('a clear: named after the squad MVP, pays a prize, leaves junk, the first one brings a newcomer', () => {
  const { m, s } = make(3);
  // Crowns since the last clear pick the name (ties: higher level, then newer).
  m.raid();
  const [a, b] = s.squad;
  s.mvp = { [a]: 3, [b]: 6 };
  s.coins = 500;
  const before = s.people.length;
  const r = m.clear(2, 1); // a cache: someone hides in the squad's pile
  assert.ok(r.ok);
  assert.equal(r.name.startsWith(m.person(b).first), true);
  assert.equal(r.prize.kind, 'cache');
  assert.ok(r.prize.coins >= 100 && r.prize.gems >= 10);
  assert.equal(r.junk.length, 4);
  assert.equal(s.junk.length, 3, 'the squad pops the first pile');
  assert.equal(s.people.length, before + 1, 'the first clear always brings someone');
  assert.deepEqual(s.mvp, {});
  // Ties: higher level, then newer.
  s.mvp = {};
  const sq = m.squadPeople();
  sq[0].level = 3;
  assert.equal(m.mvp().id, sq[0].id);
});

test('lot prizes: rescues (outer ring from Silver), sets stand on the lot, landmarks restore and pay their bonus', () => {
  const { m, s } = make(11);
  s.coins = 1e6;
  m.cheat('skulls', 900);
  m.force.grade = 0;
  const r1 = m.clear(1, 2);
  assert.equal(r1.prize.kind, 'rescue');
  assert.ok(['veteran', 'hero', 'legend'].includes(r1.prize.rarity));
  m.force.grade = 0;
  const r2 = m.clear(0, 2); // the School: the outer ring
  assert.equal(r2.grade, 1);
  assert.ok(['hero', 'legend'].includes(r2.prize.rarity));
  m.force.grade = 2;
  const r3 = m.clear(2, 3); // Mini Golf: party
  assert.equal(r3.prize.kind, 'set');
  assert.equal(r3.prize.items.filter((k) => k === 'disco').length, 2, 'Gold: both commons become rares');
  assert.ok(r3.placed.every((p) => p.boxed || (Math.floor(p.i / LOT) === 2 && Math.floor(p.j / LOT) === 3)));
  const period = m.chestPeriod('crate');
  const gems = s.gems;
  const r4 = m.clear(1, 1); // the Water Tower
  assert.equal(r4.landmark, 'tower');
  assert.deepEqual(r4.knocks, []);
  assert.equal(s.gems - gems, 20);
  assert.ok(m.chestPeriod('crate') < period);
  assert.equal(m.objectAt(1 * LOT + 3, 1 * LOT + 3).kind, 'landmark');
  assert.equal(m.move(m.objectAt(10, 10).id, 9, 9).ok, false, 'landmarks stay put');
  noOverlap(s);
});

test('placement: on your land only, never overlapping, paths never block, junk pops under a drop', () => {
  const { m, s } = make();
  s.coins = 1e4;
  // Off your land.
  assert.equal(m.buy('bench', 0, 0).land, true);
  // On top of the Gas Station.
  const st = m.station();
  assert.ok(m.buy('bench', st.i + 1, st.j + 1).blocked);
  // A path tile is fine.
  const pathTile = [16, 18];
  assert.ok(m.pathAt(...pathTile));
  const free = m.freeSpot(1, { near: { i: 19, j: 19 } });
  assert.ok(m.buy('bench', free.i, free.j).ok);
  // Junk under a drop pops.
  m.clear(1, 2);
  const pile = s.junk[0];
  const coins = s.coins;
  const r = m.buy('flamingo', pile.i, pile.j);
  assert.ok(r.ok);
  assert.equal(r.popped.length, 1);
  assert.ok(!s.junk.some((k) => k.id === pile.id));
  assert.ok(s.coins >= coins - 40);
  noOverlap(s);
  // Locked decorations.
  assert.equal(m.canBuy('stage').locked, true);
  assert.equal(m.canBuy('treehouse').unsold, true);
});

test('moving is free and legal; the box takes decorations but not buildings or homes', () => {
  const { m, s } = make();
  s.coins = 1e4;
  m.clear(1, 2);
  const crate = s.objects.find((o) => o.ref === 'crate');
  const spot = m.freeSpot(2, { lot: [1, 2] });
  const coins = s.coins;
  const r = m.move(crate.id, spot.i, spot.j);
  assert.ok(r.ok);
  assert.deepEqual(r.from, { i: 17, j: 14 });
  assert.equal(s.coins, coins);
  assert.equal(m.move(crate.id, m.station().i, m.station().j).ok, false);
  assert.equal(m.toBox(crate.id).ok, false);
  const fire = s.objects.find((o) => o.kind === 'decor');
  assert.ok(m.toBox(fire.id).ok);
  assert.equal(m.boxCounts()['decor:campfire'], 1);
  const back = m.freeSpot(1, {});
  assert.ok(m.unbox(m.boxIndex('decor', 'campfire'), back.i, back.j).ok);
  noOverlap(s);
});

test('homes: auto-placed near paths and siblings, never on the forecourt; roof campers move down after a clear', () => {
  const { m, s } = make(5);
  const fc = m.forecourt();
  for (let k = 0; k < 6; k++) m.cheat('people', 1);
  const homes = s.objects.filter((o) => o.kind === 'home' && m.person(o.ref).origin !== 'founder');
  assert.ok(homes.length > 0);
  for (const h of homes) for (let i = h.i; i < h.i + HOME_SIZE; i++) for (let j = h.j; j < h.j + HOME_SIZE; j++) assert.ok(!fc.has(j * MAP + i), 'never on the forecourt');
  assert.ok(m.campers().length > 0, 'the start lot is snug: extra people camp on the roof');
  const campers = m.campers().length;
  s.coins = 1e4;
  const r = m.clear(1, 2);
  assert.ok(r.campers.length > 0);
  assert.ok(m.campers().length < campers + r.newcomers.length);
  noOverlap(s);
  // A sibling lands next to their family when there's room.
  const { m: m2, s: s2 } = make(8);
  s2.coins = 1e5;
  m2.cheat('skulls', 100);
  m2.clear(1, 2);
  m2.clear(3, 2);
  const elder = s2.people.find((p) => p.origin !== 'founder' && m2.homeOf(p.id));
  elder.family = elder.id;
  const kid = { ...elder, id: 900, family: elder.id };
  const spot = m2.homeSpot(kid);
  const eh = m2.homeOf(elder.id);
  assert.ok(gapBetween({ i: spot.i, j: spot.j, w: 2, h: 2 }, { i: eh.i, j: eh.j, w: 2, h: 2 }) <= 1);
});

test('wishes: one at a time, granted by a free move into range, Badges and a heart', () => {
  const { m, s, clock } = make(9);
  s.coins = 1e4;
  m.clear(1, 2);
  m.clear(2, 1);
  clock.add(WISH.after + 1);
  const w = m.maybeWish();
  assert.ok(w && w.set, 'a set wish');
  assert.equal(m.maybeWish(), null, 'one at a time');
  // Buy one far away, then move it next to the wisher's home.
  const set = w.set;
  const kind = COMMON_DECOR.find((k) => DECOR[k].set === set && (DECOR[k].zone || 1) <= s.zone) || COMMON_DECOR.find((k) => DECOR[k].set === set);
  DECOR[kind].zone = 1;
  const home = m.homeOf(w.id);
  // Far: the farthest free tile from the home.
  let far = null;
  for (let i = 0; i < MAP; i++)
    for (let j = 0; j < MAP; j++)
      if (m._free(i, j, DECOR[kind].size) && gapBetween({ i, j, w: 1, h: 1 }, { i: home.i, j: home.j, w: 2, h: 2 }) > WISH.range && (!far || gapBetween({ i, j, w: 1, h: 1 }, { i: home.i, j: home.j, w: 2, h: 2 }) > far.g)) far = { i, j, g: gapBetween({ i, j, w: 1, h: 1 }, { i: home.i, j: home.j, w: 2, h: 2 }) };
  const b = m.buy(kind, far.i, far.j);
  assert.ok(b.ok);
  assert.equal(b.wish, null);
  const p = m.person(w.id);
  const badges = p.badges;
  const near = m.freeSpot(DECOR[kind].size, { near: { i: home.i + 1, j: home.j + 1 } });
  assert.ok(gapBetween({ i: near.i, j: near.j, w: 1, h: 1 }, { i: home.i, j: home.j, w: 2, h: 2 }) <= WISH.range);
  const mv = m.move(b.id, near.i, near.j);
  assert.ok(mv.ok);
  assert.ok(mv.wish, 'granted by a move');
  assert.equal(s.wish, null);
  assert.equal(p.hearts, 1);
  assert.ok(p.badges > badges || p.level === 10);
  // Not the same person twice in a row.
  clock.add(WISH.after + 1);
  const w2 = m.maybeWish();
  if (w2) assert.notEqual(w2.id, w.id);
});

test('housewarming: a level-up that changes the tier says so', () => {
  const { m, s } = make();
  const p = s.people[0];
  p.badges = 100;
  s.coins = 1000;
  const r = m.levelUp(p.id);
  assert.ok(r.ok);
  assert.deepEqual([r.home.from, r.home.to], ['tent', 'shack']);
  const r2 = m.levelUp(p.id);
  assert.equal(r2.home, undefined, 'Lv 3 is still a shack');
  assert.equal(tierOf(10), 5);
  assert.deepEqual([fenceTierOf(1), fenceTierOf(3), fenceTierOf(5), fenceTierOf(7)], [0, 1, 2, 3]);
});

test('junk: coins mostly, a scripted flamingo in the first pile you pop, a trunk survivor by the 12th', () => {
  const { m, s } = make(21);
  s.coins = 1e6;
  m.cheat('skulls', 900);
  assert.ok(m.clear(1, 2).ok);
  assert.ok(m.clear(2, 1).ok);
  assert.ok(!s.box.some((x) => x.ref === 'flamingo'), 'the squad pops never take the scripted flamingo');
  const mine = m.popJunk(s.junk[0].id);
  assert.equal(mine.decor, 'flamingo');
  assert.ok(s.wish && s.wish.set === 'party', 'the first wish follows the flamingo');
  for (const [a, b] of [
    [3, 2],
    [2, 3],
    [1, 1],
  ])
    assert.ok(m.clear(a, b).ok);
  while (s.junk.length && s.junkPopped < 14) m.popJunk(s.junk[0].id);
  assert.ok(s.town.stats.trunks >= 1, 'someone in the trunk by the 12th pile');
  let coins = 0;
  let total = 0;
  for (let k = 0; k < 200; k++) {
    s.junk.push({ id: 5000 + k, i: 14, j: 14, v: 0 });
    const r = m.popJunk(5000 + k);
    total++;
    if (r.coins) coins++;
  }
  assert.ok(coins / total > 0.55 && coins / total < 0.85);
});

test('next step: never junk, wishes or decorations; suggests rescues first', () => {
  const { m, s } = make(4);
  m.raid();
  for (const k of ['crate', 'vault']) s.chests[k].readyAt = m.now() + 1e9;
  s.coins = 60;
  const n = m.nextStep();
  assert.ok(['lot', 'build', 'play', 'ready', 'best'].includes(n.kind));
  if (n.kind === 'lot') assert.equal(LOTS[n.key].kind, 'R');
  s.coins = 1e4;
  m.clear(1, 2);
  s.wish = { id: s.people[0].id, set: 'garden', at: 0 };
  for (let k = 0; k < 20; k++) {
    const st = m.nextStep();
    assert.ok(!['junk', 'wish', 'decor'].includes(st.kind));
    if (st.kind === 'chest') s.chests[st.id].readyAt = m.now() + 1e9;
    else if (st.kind === 'ready') s.people.find((p) => p.id === st.id).badges = 0;
    else break;
  }
});

test('zone gates fly in kits and souvenirs; the statue arrives on day 7; save round-trips', () => {
  const { m, s, clock } = make(13);
  const r = m.cheat('skulls', 360);
  assert.ok(r.zones.length >= 2);
  assert.ok(s.kits.some((k) => k.kind === 'building' && k.ref === 'tent'));
  assert.ok(s.kits.some((k) => k.kind === 'souvenir' && k.ref === 'donut'));
  assert.equal(m.nextStep().kind === 'kit' || m.readyChests().length > 0 || m.nextStep().kind === 'ready', true);
  s.coins = 1e4;
  m.clear(1, 2);
  const kit = s.kits[0];
  const spot = m.freeSpot(m.sizeOf(kit), {});
  assert.ok(m.placeKit(spot.i, spot.j).ok);
  clock.add(STATUE_DAY * 24 * HOUR);
  m.tick();
  assert.ok(s.kits.some((k) => k.kind === 'statue'));
  const copy = migrate(JSON.parse(JSON.stringify(s)), clock.now());
  assert.deepEqual(copy.objects, s.objects);
  assert.equal(copy.paths, s.paths);
  assert.deepEqual(copy.lots, s.lots);
  const fresh = migrate({ people: [] }, clock.now());
  assert.equal(fresh.objects.length > 0, true);
});

test('landmark bonuses reach the Thrill rules: coins, power, Glow-Up, strays, chest timers', () => {
  const { m, s } = make(2);
  const c0 = m.coinBonus();
  const p0 = m.raidPreview().S;
  const g0 = m.glowExtra();
  const st0 = m.strayChance();
  const v0 = m.chestPeriod('vault');
  for (const id of ['drivein', 'fire', 'wheel', 'radio', 'light']) s.restored[id] = { day: 1, by: [] };
  assert.ok(Math.abs(m.coinBonus() - c0 - 0.1) < 1e-9);
  assert.ok(Math.abs(m.raidPreview().S / p0 - 1.05) < 1e-9);
  assert.ok(Math.abs(m.glowExtra() - g0 - 0.02) < 1e-9);
  assert.equal(m.strayChance(), st0 * 2);
  assert.equal(m.chestPeriod('vault'), 7 * HOUR);
  assert.ok(v0 > m.chestPeriod('vault'));
});

test('paths: painted on your land only, zone-locked types, erasable', () => {
  const { m } = make();
  assert.equal(m.paint(0, 0, 'dirt').land, true);
  assert.equal(m.paint(19, 19, 'brick').locked, true);
  assert.ok(m.paint(19, 19, 'dirt').changed);
  assert.equal(m.pathAt(19, 19), 'dirt');
  assert.ok(m.paint(19, 19, null).changed);
  assert.equal(m.pathAt(19, 19), null);
});

test('pacing: the simulated player keeps Thrill Hill pace and puts about a third of coins into land', async () => {
  const { simulate } = await import('../outpost/tools/player.mjs');
  const { simulate: thrillSim } = await import('../thrill/tools/player.mjs');
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const runs = [1, 2, 3, 4, 5, 6].map((seed) => simulate({ seed, days: 7 }));
  const th = [1, 2, 3, 4, 5, 6].map((seed) => thrillSim({ seed, days: 7 }));
  const lv = mean(runs.map((r) => r.daily[6].squadLv));
  const lvT = mean(th.map((r) => r.daily[6].squadLv));
  assert.ok(Math.abs(lv / lvT - 1) < 0.08, `squad level ${lv.toFixed(2)} vs ${lvT.toFixed(2)}`);
  const share = mean(runs.map((r) => r.daily[6].land / r.daily[6].earned));
  assert.ok(share > 0.2 && share < 0.38, `land share ${share.toFixed(2)}`);
  const lots = mean(runs.map((r) => r.daily[6].lots));
  assert.ok(lots >= 9 && lots <= 15, `lots on day 7: ${lots}`);
  for (const r of runs) {
    // Everything placed stays legal after a week of auto-placement, clears and wishes.
    const seen = new Set();
    for (const o of r.state.objects)
      for (let i = o.i; i < o.i + o.size; i++)
        for (let j = o.j; j < o.j + o.size; j++) {
          assert.ok(!seen.has(`${i},${j}`));
          seen.add(`${i},${j}`);
          assert.ok(r.meta.ownsTile(i, j));
        }
  }
});

test('wishes only go where something fits; a boxed-in home gets no set wish', () => {
  const { m, s, clock } = make(31);
  s.coins = 1e5;
  m.clear(1, 2);
  // Box in every founder's home: no free tile within 2 tiles of any of them.
  const founders = s.people.filter((p) => p.origin === 'founder');
  for (const p of founders) {
    const h = m.homeOf(p.id);
    assert.equal(m.wishSpots(h, 1).length > 0, m.wishRoom({ i: h.i, j: h.j, w: 2, h: 2 }));
  }
  // Fill the whole start lot's free tiles.
  for (let i = 14; i < 21; i++) for (let j = 14; j < 21; j++) if (m._free(i, j, 1)) m.buy('bench', i, j) || s.coins++;
  clock.add(WISH.after + 1);
  s.wish = null;
  s.lastWisher = null;
  const w = m.maybeWish({ force: true });
  if (w) {
    const h = m.homeOf(w.id);
    assert.ok(w.sib != null || m.wishRoom({ i: h.i, j: h.j, w: 2, h: 2 }), 'the wisher has room for a piece');
  }
});

test("a camper's keepsake comes out of the box by their new home", () => {
  const { m, s } = make(3);
  s.coins = 1e5;
  // Fill the snug plot, then a Hero arrives: no room, a roof camper, keepsake boxed.
  m.cheat('people', 1);
  m.force.rarity = 'hero';
  const nc = m._admit(m._makeNewcomer(() => 0.5, { rarity: 'hero' }, 'vault'));
  assert.ok(nc.camper, 'the start lot is full: a roof camper');
  {
    assert.ok(s.box.some((x) => x.kind === 'keepsake' && x.owner === nc.person.id));
    const r = m.clear(1, 2);
    const moved = r.campers.find((c) => c.id === nc.person.id);
    assert.ok(moved, 'the camper moves down');
    assert.ok(moved.keepsake, 'and the keepsake comes out');
    assert.ok(!s.box.some((x) => x.kind === 'keepsake' && x.owner === nc.person.id));
  }
});

test('decoration milestones go round every common; late milestones still promise land', () => {
  const { m, s } = make();
  const seen = new Set();
  for (let i = 3; i < 4 * 30; i += 4) {
    const r = m.milestoneReward(i);
    assert.equal(r.kind, 'decor');
    seen.add(r.decor);
  }
  assert.ok(seen.size >= 10, `${seen.size} different decorations`);
  s.coins = 1e7;
  m.cheat('skulls', 2500);
  for (let k = 0; k < 30 && m.lotCount() < m.landCap(); k++) {
    const f = m.frontier().find((x) => x.can.ok);
    if (!f) break;
    m.clear(f.a, f.b);
  }
  const f = m.frontier()[0];
  const c = m.canClear(f.a, f.b);
  assert.equal(c.capped, true);
  assert.ok(c.at > 2500, 'the next lot opens at a later milestone');
  assert.ok(!/as big/.test(c.reason));
});

test('only people with a home bring gifts (campers have no walker to carry one)', () => {
  const { m, s } = make(5);
  for (let k = 0; k < 8; k++) m.cheat('people', 1);
  assert.ok(m.campers().length > 0);
  for (let k = 0; k < 30; k++) {
    s.gift = null;
    const g = m.giftNow();
    assert.ok(m.homeOf(g.id), 'the bearer has a home');
  }
});
