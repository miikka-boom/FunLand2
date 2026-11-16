import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, freshState, neighbours, SEC, MIN, HOUR, DAY } from '../strays/src/rules.js';
import { migrate } from '../strays/src/save.js';
import { FakeClock } from '../strays/src/clock.js';
import {
  COLS,
  ROWS,
  ROOMS,
  FIRST_ROOM,
  BAG,
  STRAY,
  SOMEBODY,
  HERO,
  KINDS,
  KIND_BY_ID,
  RARITIES,
  RARITY_ORDER,
  NAMES,
  QUIRKS,
  DEFAULT_TUNING,
  TUNING_SLIDERS,
} from '../strays/src/config.js';
import { newGame, step, sitting, playDays, openable, HABITS } from '../strays/tools/player.mjs';
import { rngFor } from '../strays/src/util.js';

const T0 = 8 * HOUR;

/** A block where the first stray has just shown who they are. */
function shown(seed = 7, tuning = {}) {
  const made = newGame(seed, tuning, T0);
  const { game, clock } = made;
  const id = game.s.rooms[FIRST_ROOM].who;
  assert.ok(game.wake(id).ok);
  assert.ok(game.feed(id).ok);
  clock.warp(game.t.hugFirstSec * SEC);
  assert.ok(game.hug(id).ok);
  assert.ok(game.grow(id).ok);
  return { ...made, id, p: game.person(id) };
}

// ------------------------------------------------------------------ the data

test('strays config: eighteen kinds for twelve rooms, every rarity present', () => {
  assert.equal(ROOMS, COLS * ROWS);
  assert.equal(ROOMS, 12);
  assert.equal(KINDS.length, 18);
  assert.ok(KINDS.length > ROOMS, 'more kinds than rooms: every block has its own crowd');
  assert.equal(new Set(KINDS.map((k) => k.id)).size, KINDS.length);
  assert.equal(new Set(KINDS.map((k) => k.name)).size, KINDS.length);
  for (const k of KINDS) {
    assert.ok(RARITIES[k.rarity], `${k.id} has a known rarity`);
    assert.match(k.name, /^[A-Z ]{2,12}$/);
    assert.ok(k.says && k.says.length <= 24, `${k.id} says something short`);
  }
  for (const r of RARITY_ORDER) assert.ok(KINDS.some((k) => k.rarity === r), `somebody is ${r}`);
  // Commons alone can never fill the block: every block meets somebody rare.
  assert.ok(KINDS.filter((k) => k.rarity === 'common').length < ROOMS);
});

test('strays config: rarer kinds are less likely and find more', () => {
  for (let i = 1; i < RARITY_ORDER.length; i++) {
    const a = RARITIES[RARITY_ORDER[i - 1]];
    const b = RARITIES[RARITY_ORDER[i]];
    assert.ok(b.weight < a.weight);
    assert.ok(b.bonus > a.bonus);
    assert.ok(b.stars > a.stars);
  }
});

test('strays config: names are short, unique and enough for a block', () => {
  assert.equal(new Set(NAMES).size, NAMES.length);
  assert.ok(NAMES.length >= ROOMS * 3);
  for (const n of NAMES) assert.match(n, /^[A-Z]{2,5}$/);
});

test('strays config: the tuning is sane', () => {
  const t = DEFAULT_TUNING;
  assert.equal(t.roomPrices.length, ROOMS);
  assert.equal(t.roomPrices[0], 0);
  for (let i = 1; i < ROOMS; i++) assert.ok(t.roomPrices[i] > t.roomPrices[i - 1], 'each room costs more');
  assert.ok(t.startCans >= 1, 'the first meal can be paid for');
  assert.ok(t.mealHearts + t.hugHearts >= t.needReveal, 'one meal and one hug show who a stray is');
  assert.ok(t.needHero > t.needReveal);
  assert.equal(t.oddsSome.length, 3);
  assert.equal(t.oddsHero.length, 3);
  assert.ok(t.oddsHero[0] > t.oddsSome[0] && t.oddsHero[2] < t.oddsSome[2], 'heroes do better');
  assert.ok(t.cansHero[0] > t.cansSome[0]);
  assert.ok(t.cansSome[0] - t.roughCans >= 1, 'even a rough trip brings a can');
  for (const [key, , lo, hi] of TUNING_SLIDERS) {
    assert.ok(key in t, `slider ${key} is a tuning key`);
    assert.ok(t[key] >= lo && t[key] <= hi, `${key} default is inside its slider`);
  }
});

test('strays grid: neighbours share a wall', () => {
  assert.deepEqual(neighbours(0).sort(), [1, 4]);
  assert.deepEqual(neighbours(FIRST_ROOM).sort((a, b) => a - b), [4, 9]);
  assert.deepEqual(neighbours(5).sort((a, b) => a - b), [1, 4, 6, 9]);
  for (let i = 0; i < ROOMS; i++) for (const j of neighbours(i)) assert.ok(neighbours(j).includes(i));
});

// ----------------------------------------------------------------- the start

test('strays start: one open room by the door, somebody asleep in it, a few cans', () => {
  const { game } = newGame(3);
  const s = game.s;
  assert.equal(s.cans, DEFAULT_TUNING.startCans);
  assert.equal(game.openRooms(), 1);
  assert.ok(s.rooms[FIRST_ROOM].open);
  const p = game.person(s.rooms[FIRST_ROOM].who);
  assert.equal(p.stage, BAG);
  assert.equal(game.wish(p), 'wake', 'the first one can be woken at once');
  assert.equal(KIND_BY_ID[p.kind].rarity, 'common', 'the first face is an everyday one');
  assert.equal(s.zombies, 0);
  assert.deepEqual(game.eligible(), []);
  assert.equal(game.noTripWhy().why, 'strays');
  assert.deepEqual(game.advice(), { do: 'wake', id: p.id });
});

test('strays start: the first minute (wake, feed, hug, show)', () => {
  const { game, clock } = newGame(11);
  const id = game.s.rooms[FIRST_ROOM].who;
  const p = game.person(id);
  assert.equal(game.info(p).kind, null, 'who they are is hidden');

  assert.ok(game.wake(id).ok);
  assert.equal(p.stage, STRAY);
  assert.equal(game.wish(p), 'hungry');
  assert.equal(game.wake(id).ok, false, 'only once');

  const fed = game.feed(id);
  assert.ok(fed.ok);
  assert.equal(fed.hearts, DEFAULT_TUNING.mealHearts);
  assert.equal(game.s.cans, DEFAULT_TUNING.startCans - 1);
  assert.equal(game.feed(id).ok, false, 'not hungry twice');
  assert.equal(game.wish(p), null, 'content for a moment');

  clock.warp(DEFAULT_TUNING.hugFirstSec * SEC);
  assert.equal(game.wish(p), 'hug');
  const hug = game.hug(id);
  assert.ok(hug.ok && hug.ready, 'the bar is full');
  assert.equal(game.wish(p), 'grow');
  assert.equal(game.hug(id).ok, false);

  const grown = game.grow(id);
  assert.ok(grown.ok);
  assert.equal(grown.stage, SOMEBODY);
  assert.equal(grown.kind, p.kind);
  assert.equal(p.hearts, 0);
  assert.deepEqual(game.s.met, [p.kind]);
  assert.equal(game.info(p).kind, p.kind);
  assert.equal(game.wish(p), null, 'fed and hugged: content');
  assert.deepEqual(game.eligible(), [id], 'and ready to go out');
  assert.equal(game.advice().do, 'go');
});

test('strays wishes: one at a time, in order of urgency', () => {
  const { game, clock, p } = shown(5);
  // Hungry and wanting a hug at once: the meal comes first.
  clock.warp(DEFAULT_TUNING.hungerMin * MIN + MIN);
  assert.equal(game.wish(p), 'hungry');
  // Out of cans: a hug still helps.
  game.s.cans = 0;
  assert.equal(game.wish(p), 'hug');
  assert.equal(game.roomAction(FIRST_ROOM).act, 'hug');
  assert.ok(game.hug(p.id).ok);
  assert.equal(game.wish(p), 'hungry', 'still hungry, and nothing to give');
  assert.equal(game.roomAction(FIRST_ROOM).act, 'nocans');
  assert.equal(game.feed(p.id).why, 'cans');
  game.s.cans = 5;
  // Hurt beats everything.
  p.hurt = true;
  assert.equal(game.wish(p), 'hurt');
  assert.equal(game.feed(p.id).ok, false, 'patch them up first');
  assert.ok(game.patch(p.id).ok);
  assert.equal(game.patch(p.id).ok, false);
  // A full bar beats a nap.
  p.hearts = game.need(p);
  p.restUntil = clock.now() + HOUR;
  assert.equal(game.wish(p), 'grow');
  p.hearts = 0;
  assert.equal(game.wish(p), 'rest');
  assert.equal(game.roomAction(FIRST_ROOM).act, 'resting');
  assert.equal(game.feed(p.id).ok, false, 'no meals in their sleep');
});

test('strays wishes: hunger and hugs come back on the clock', () => {
  const { game, clock, p } = shown(5);
  assert.equal(game.wish(p), null);
  clock.warp(DEFAULT_TUNING.hugMin * MIN);
  assert.equal(game.wish(p), 'hug');
  assert.ok(game.hug(p.id).ok);
  assert.equal(game.wish(p), null);
  clock.warp((DEFAULT_TUNING.hungerMin - DEFAULT_TUNING.hugMin) * MIN);
  assert.equal(game.wish(p), 'hungry');
  const before = game.s.cans;
  assert.ok(game.feed(p.id).ok);
  assert.equal(game.s.cans, before - 1);
  assert.equal(p.hearts, DEFAULT_TUNING.hugHearts + DEFAULT_TUNING.mealHearts);
});

test('strays wishes: a stray with no cans can still be hugged into showing who they are', () => {
  const { game, clock } = newGame(21, { startCans: 0 });
  const id = game.s.rooms[FIRST_ROOM].who;
  const p = game.person(id);
  game.wake(id);
  let hugs = 0;
  for (let i = 0; i < 20 && p.stage === STRAY; i++) {
    const at = game.nextAt();
    if (game.wish(p) === 'hug') {
      assert.ok(game.hug(id).ok);
      hugs++;
    } else if (game.wish(p) === 'grow') game.grow(id);
    else clock.warp(at - clock.now());
  }
  assert.equal(p.stage, SOMEBODY);
  assert.equal(hugs, DEFAULT_TUNING.needReveal);
});

// --------------------------------------------------------------------- trips

test('strays trips: the first one goes well and somebody follows them home', () => {
  const { game, id, p } = shown(9);
  const before = game.s.cans;
  const trip = game.goOut(id);
  assert.ok(trip.ok);
  assert.equal(trip.outcome, 'great');
  assert.equal(trip.hurt, false);
  assert.equal(trip.cans, trip.base + trip.bonus + DEFAULT_TUNING.greatCans);
  assert.equal(game.s.cans, before + trip.cans);
  assert.equal(p.hearts, DEFAULT_TUNING.greatHearts);
  assert.equal(trip.restMs, DEFAULT_TUNING.restRampSec[0] * SEC);
  assert.equal(game.wish(p), 'rest');
  assert.deepEqual(game.eligible(), []);
  assert.equal(game.goOut(id).ok, false, 'not while resting');
  // The stray waits at the door: there is no room yet.
  assert.ok(trip.follower);
  assert.equal(trip.follower.room, -1);
  assert.equal(game.s.door, trip.follower.id);
  assert.equal(game.wish(game.person(trip.follower.id)), 'door');
  assert.equal(game.residents().length, 1);
  assert.ok(game.s.cans >= game.price(), 'and the first trip pays for the room they need');
  assert.equal(game.advice().do, 'open');
});

test('strays rooms: open one next to yours, the stray at the door moves in', () => {
  const { game, clock, id } = shown(9);
  const trip = game.goOut(id);
  const fid = trip.follower.id;
  assert.equal(game.canOpen(0).why, 'far', 'not across the block');
  assert.equal(game.canOpen(FIRST_ROOM).why, 'open');
  assert.equal(game.roomAction(0).act, 'far');
  const next = FIRST_ROOM + 1;
  assert.equal(game.roomAction(next).act, 'open');
  const price = game.price();
  assert.equal(price, DEFAULT_TUNING.roomPrices[1]);
  const before = game.s.cans;
  const opened = game.open(next);
  assert.ok(opened.ok);
  assert.equal(opened.movedIn, fid);
  assert.equal(game.s.cans, before - price);
  assert.equal(game.s.door, null);
  assert.equal(game.roomOf(fid), next);
  const f = game.person(fid);
  assert.equal(game.wish(f), 'bag');
  assert.equal(game.roomAction(next).act, 'asleep');
  assert.equal(game.wake(fid).ok, false);
  clock.warp(DEFAULT_TUNING.bagRampSec[1] * SEC);
  assert.equal(game.wish(f), 'wake');
  assert.equal(game.price(), DEFAULT_TUNING.roomPrices[2]);
  assert.equal(game.open(next).ok, false, 'already open');
});

test('strays rooms: no cans, no room', () => {
  const { game } = shown(9);
  game.s.cans = game.price() - 1;
  assert.equal(game.canOpen(FIRST_ROOM + 1).why, 'cans');
  assert.equal(game.roomAction(FIRST_ROOM + 1).act, 'poor');
  assert.equal(game.open(FIRST_ROOM + 1).ok, false);
  assert.equal(game.openRooms(), 1);
});

test('strays rooms: with a room ready, a follower moves straight in', () => {
  const { game, id } = shown(9);
  game.s.cans = 99;
  assert.ok(game.open(FIRST_ROOM + 1).ok);
  assert.equal(game.freeRoom(), FIRST_ROOM + 1);
  const trip = game.goOut(id);
  assert.equal(trip.follower.room, FIRST_ROOM + 1);
  assert.equal(game.s.door, null);
  assert.equal(game.freeRoom(), -1);
});

test('strays trips: nobody follows while somebody waits at the door, or into a full block', () => {
  const { game, clock, id, p } = shown(9);
  assert.ok(game.goOut(id).follower);
  for (let i = 0; i < 6; i++) {
    p.restUntil = 0;
    p.hurt = false;
    assert.equal(game.goOut(id).follower, null, 'the door is taken');
  }
  assert.equal(Object.keys(game.s.people).length, 2);
  // Fill the block, then go out again and again.
  const full = newGame(4);
  full.game.s.cans = 9999;
  for (let i = 0; i < 400 && Object.keys(full.game.s.people).length < ROOMS; i++) {
    if (!step(full.game, full.clock)) full.clock.warp(10 * MIN);
  }
  assert.equal(Object.keys(full.game.s.people).length, ROOMS);
  for (let i = 0; i < 20; i++) {
    full.clock.warp(DAY);
    for (const pid of full.game.eligible()) assert.equal(full.game.goOut(pid).follower, null);
  }
  assert.equal(Object.keys(full.game.s.people).length, ROOMS);
  void clock;
});

test('strays trips: a follower is never more than a few trips away', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { game, id, p } = shown(seed);
    game.s.cans = 99999;
    let dry = 0;
    for (let i = 0; i < 60 && Object.keys(game.s.people).length < ROOMS; i++) {
      p.restUntil = 0;
      p.hurt = false;
      const trip = game.goOut(id);
      if (trip.follower) {
        dry = 0;
        if (trip.follower.room < 0) assert.ok(game.open(openable(game)).ok);
      } else dry++;
      assert.ok(dry <= DEFAULT_TUNING.followPity, `seed ${seed}: ${dry} trips alone in a row`);
    }
  }
});

test('strays trips: a rough trip hurts, a patch mends it and earns a heart', () => {
  const { game, id, p } = shown(9);
  game.s.trips = 10; // past the gentle first trips
  game.s.force.outcome = 'rough';
  const trip = game.goOut(id);
  assert.equal(trip.outcome, 'rough');
  assert.ok(trip.hurt && p.hurt);
  assert.ok(trip.cans >= 1);
  assert.equal(trip.cans, Math.max(1, trip.base + trip.bonus - DEFAULT_TUNING.roughCans));
  assert.equal(game.wish(p), 'hurt');
  assert.equal(game.s.force.outcome, undefined, 'a forced outcome is used once');
  const hearts = p.hearts;
  assert.ok(game.patch(id).ok);
  assert.equal(p.hearts, hearts + DEFAULT_TUNING.patchHearts);
  assert.equal(game.wish(p), 'rest');
  assert.equal(game.noTripWhy().why, 'resting');
});

test('strays trips: the first few never go badly, later ones sometimes do', () => {
  let rough = 0;
  let trips = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const { game, id, p } = shown(seed);
    for (let i = 0; i < 12; i++) {
      p.restUntil = 0;
      p.hurt = false;
      const trip = game.goOut(id);
      if (i < DEFAULT_TUNING.gentleTrips) assert.notEqual(trip.outcome, 'rough', `seed ${seed} trip ${i}`);
      else {
        trips++;
        if (trip.outcome === 'rough') rough++;
      }
    }
  }
  const share = rough / trips;
  assert.ok(share > 0.15 && share < 0.35, `about a quarter go badly (${share.toFixed(2)})`);
});

test('strays trips: heroes and rarer kinds bring back more', () => {
  const mean = (stage, kind) => {
    let total = 0;
    const n = 300;
    for (let seed = 1; seed <= n; seed++) {
      const { game, id, p } = shown(seed);
      game.s.trips = 10 + seed;
      p.stage = stage;
      p.kind = kind;
      total += game.goOut(id).cans;
    }
    return total / n;
  };
  const cook = mean(SOMEBODY, 'cook');
  const hero = mean(HERO, 'cook');
  const clown = mean(SOMEBODY, 'clown');
  const astro = mean(SOMEBODY, 'astronaut');
  assert.ok(hero > cook + 2, `hero ${hero.toFixed(1)} vs somebody ${cook.toFixed(1)}`);
  assert.ok(Math.abs(clown - cook - RARITIES.rare.bonus) < 0.6);
  assert.ok(Math.abs(astro - cook - RARITIES.epic.bonus) < 0.6);
});

test('strays trips: rest gets longer after the first few, and heroes rest longest', () => {
  const { game, id, p } = shown(9);
  const rests = [];
  for (let i = 0; i < 6; i++) {
    p.restUntil = 0;
    p.hurt = false;
    rests.push(game.goOut(id).restMs);
  }
  assert.deepEqual(rests.slice(0, 4), DEFAULT_TUNING.restRampSec.map((x) => x * SEC));
  assert.equal(rests[4], DEFAULT_TUNING.restSomeMin * MIN);
  p.stage = HERO;
  p.restUntil = 0;
  p.hurt = false;
  assert.equal(game.goOut(id).restMs, DEFAULT_TUNING.restHeroMin * MIN);
});

// ------------------------------------------------------------------- growing

test('strays growing: a somebody becomes a hero, and heroes look after themselves', () => {
  const { game, clock, id, p } = shown(9);
  p.hearts = DEFAULT_TUNING.needHero - 1;
  assert.equal(game.grow(id).ok, false, 'not yet');
  clock.warp(DEFAULT_TUNING.hugMin * MIN);
  assert.ok(game.hug(id).ready);
  const grown = game.grow(id);
  assert.equal(grown.stage, HERO);
  assert.deepEqual(game.s.heroes, [p.kind]);
  assert.equal(game.need(p), 0);
  clock.warp(3 * DAY);
  assert.equal(game.wish(p), null, 'no hunger, no hugs to ask for');
  assert.equal(game.feed(id).ok, false);
  assert.equal(game.hug(id).ok, false);
  assert.equal(game.grow(id).ok, false);
  assert.deepEqual(game.eligible(), [id]);
});

test('strays growing: hearts over the top carry on to the next bar', () => {
  const { game, id, p } = newGame(9);
  void p;
  const q = game.person(game.s.rooms[FIRST_ROOM].who);
  game.wake(q.id);
  q.hearts = DEFAULT_TUNING.needReveal + 2;
  assert.ok(game.grow(q.id).ok);
  assert.equal(q.hearts, 2);
  void id;
});

// ------------------------------------------------------------------ the crowd

test('strays crowd: nobody moves in twice, names are unique, looks are in range', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const run = playDays(seed, 'binge', 14);
    const people = Object.values(run.game.s.people);
    assert.equal(people.length, ROOMS, `seed ${seed} fills the block`);
    assert.equal(new Set(people.map((p) => p.kind)).size, ROOMS);
    assert.equal(new Set(people.map((p) => p.name)).size, ROOMS);
    for (const p of people) {
      assert.ok(KIND_BY_ID[p.kind]);
      assert.ok(NAMES.includes(p.name));
      assert.ok(QUIRKS.includes(p.quirk));
      assert.ok(p.skin >= 0 && p.skin < 5 && p.hair >= 0 && p.hair < 7 && p.style >= 0 && p.style < 5);
    }
    assert.deepEqual([...run.game.s.met].sort(), people.map((p) => p.kind).sort());
  }
});

test('strays crowd: rarity shows in who turns up', () => {
  const count = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0]));
  const blocks = 150;
  for (let seed = 1; seed <= blocks; seed++) {
    const { game } = newGame(seed * 31);
    game.s.cans = 99999;
    // Only the first few arrivals: later ones are squeezed by who is left.
    for (let i = 0; i < 4; i++) {
      const f = game._newcomer(game.now());
      count[KIND_BY_ID[f.kind].rarity]++;
    }
  }
  const total = blocks * 4;
  assert.ok(count.common / total > 0.45 && count.common / total < 0.7, `commons ${count.common}/${total}`);
  assert.ok(count.rare / total > 0.2 && count.rare / total < 0.4, `rares ${count.rare}/${total}`);
  assert.ok(count.epic / total > 0.04 && count.epic / total < 0.18, `epics ${count.epic}/${total}`);
  assert.ok(count.secret / total < 0.06);
  assert.ok(count.epic > count.secret);
});

test('strays crowd: the testing drawer can ask for a rarity or a kind', () => {
  const { game, id } = shown(9);
  game.s.force.rarity = 'epic';
  const a = game.goOut(id);
  assert.equal(KIND_BY_ID[game.person(a.follower.id).kind].rarity, 'epic');
  assert.equal(game.s.force.rarity, undefined);
  const made = shown(10);
  made.game.s.force.kind = 'zed';
  const b = made.game.goOut(made.id);
  assert.equal(made.game.person(b.follower.id).kind, 'zed');
});

// ------------------------------------------------------------------- zombies

test('strays zombies: they gather after the first face, up to three, even while away', () => {
  const { game, clock } = newGame(9);
  clock.warp(DAY);
  assert.equal(game.tick().zombies, 0, 'the fence is quiet until somebody shows who they are');
  const made = shown(9);
  const g = made.game;
  assert.equal(g.tick().zombies, 0);
  made.clock.warp(DEFAULT_TUNING.zombieFirstSec * SEC);
  assert.equal(g.tick().zombies, 1);
  assert.equal(g.s.zombies, 1);
  assert.equal(g.advice().do, 'go', 'a trip matters more than a zombie');
  made.clock.warp(3 * DAY);
  assert.equal(g.tick().zombies, DEFAULT_TUNING.zombieMax - 1);
  assert.equal(g.s.zombies, DEFAULT_TUNING.zombieMax);
  made.clock.warp(DAY);
  g.tick();
  assert.equal(g.s.zombies, DEFAULT_TUNING.zombieMax, 'never more');
});

test('strays zombies: bonking clears the fence, some drop a can, never three duds in a row', () => {
  let cans = 0;
  let bonks = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { game, clock } = shown(seed);
    let duds = 0;
    for (let i = 0; i < 30; i++) {
      clock.warp(HOUR);
      game.tick();
      while (game.s.zombies > 0) {
        const before = game.s.cans;
        const b = game.bonk();
        assert.ok(b.ok);
        assert.equal(game.s.cans, before + (b.can ? 1 : 0));
        duds = b.can ? 0 : duds + 1;
        assert.ok(duds <= DEFAULT_TUNING.zombiePity);
        bonks++;
        if (b.can) cans++;
      }
      assert.equal(game.bonk().ok, false);
    }
  }
  const share = cans / bonks;
  assert.ok(share > 0.5 && share < 0.75, `about half drop a can, a bit more with the pity (${share.toFixed(2)})`);
});

test('strays zombies: after a full fence is cleared the next one takes its time', () => {
  const { game, clock } = shown(9);
  clock.warp(DAY);
  game.tick();
  assert.equal(game.s.zombies, 3);
  game.bonk();
  game.bonk();
  game.bonk();
  clock.warp((DEFAULT_TUNING.zombieMin - 1) * MIN);
  assert.equal(game.tick().zombies, 0);
  clock.warp(MIN);
  assert.equal(game.tick().zombies, 1);
});

// --------------------------------------------------------------- determinism

test('strays seeds: the same seed and the same taps give the same block', () => {
  const a = playDays(1234, 'keen', 3);
  const b = playDays(1234, 'keen', 3);
  assert.deepEqual(a.game.s, b.game.s);
  const c = playDays(1235, 'keen', 3);
  assert.notDeepEqual(
    Object.values(a.game.s.people).map((p) => p.kind + p.name),
    Object.values(c.game.s.people).map((p) => p.kind + p.name),
  );
});

test('strays seeds: reloading cannot re-roll a trip or who follows', () => {
  const { game, clock, id, tuning } = shown(77);
  const saved = JSON.stringify(game.s);
  const first = game.goOut(id);
  for (let i = 0; i < 3; i++) {
    const again = new Game(migrate(JSON.parse(saved), clock.now()), { clock, tuning });
    const trip = again.goOut(id);
    assert.equal(trip.outcome, first.outcome);
    assert.equal(trip.cans, first.cans);
    assert.equal(again.person(trip.follower.id).kind, game.person(first.follower.id).kind);
    assert.equal(again.person(trip.follower.id).name, game.person(first.follower.id).name);
  }
});

test('strays seeds: streams with different names differ', () => {
  const a = rngFor(1, 'trip', 0)();
  const b = rngFor(1, 'trip', 1)();
  const c = rngFor(1, 'arrival', 0)();
  const d = rngFor(2, 'trip', 0)();
  assert.equal(new Set([a, b, c, d]).size, 4);
  assert.equal(rngFor(1, 'trip', 0)(), a);
});

// ------------------------------------------------------------------ the save

test('strays save: a played block survives the round trip unchanged', () => {
  const run = playDays(42, 'keen', 2);
  const s = run.game.s;
  const back = migrate(JSON.parse(JSON.stringify(s)), run.game.now());
  assert.deepEqual(back, s);
});

test('strays save: rubbish is refused, damage is repaired', () => {
  const now = T0;
  for (const bad of [null, undefined, 3, 'x', [], {}, { v: 2 }, { v: 1 }, { v: 1, people: {}, rooms: [] }]) {
    assert.equal(migrate(bad, now), null);
  }
  const run = playDays(42, 'keen', 1);
  const s = JSON.parse(JSON.stringify(run.game.s));
  const ids = Object.keys(s.people);
  s.cans = -50;
  s.people[ids[0]].kind = 'dragon'; // unknown: dropped
  s.people[ids[1]].stage = 99;
  s.people[ids[1]].hearts = 'lots';
  s.people[ids[2]].name = '<b>';
  s.rooms[0] = { open: true, who: 'nobody' }; // floats on its own: closed again
  s.rooms.push({ open: true, who: ids[1] });
  s.zombies = 400;
  s.met.push('dragon', 'cook', 'cook');
  s.seen = { 'bad key!': true, hintGo: true };
  const m = migrate(s, now);
  assert.ok(m);
  assert.equal(m.cans, 0);
  assert.equal(m.people[ids[0]], undefined);
  assert.equal(m.people[ids[1]].stage, HERO);
  assert.equal(m.people[ids[1]].hearts, 0);
  assert.match(m.people[ids[2]].name, /^[A-Z]+$/);
  assert.equal(m.rooms.length, ROOMS);
  assert.ok(m.zombies <= 9);
  assert.ok(!m.met.includes('dragon'));
  assert.equal(new Set(m.met).size, m.met.length);
  assert.deepEqual(m.seen, { hintGo: true });
  assert.ok(m.rooms[FIRST_ROOM].open);
  for (const r of m.rooms) if (r.who) assert.ok(m.people[r.who], 'every room points at a real person');
  const housed = m.rooms.filter((r) => r.who).map((r) => r.who);
  assert.equal(new Set(housed).size, housed.length);
  // Everybody is either housed or the one at the door.
  for (const id of Object.keys(m.people)) assert.ok(housed.includes(id) || m.door === id);
  // And the repaired block still plays to the end.
  const clock = new FakeClock(now);
  const game = new Game(m, { clock, tuning: structuredClone(DEFAULT_TUNING) });
  for (let d = 0; d < 30 && !game.tally().allHeroes; d++) {
    sitting(game, clock, { maxMs: 10 * MIN });
    clock.warp(3 * HOUR);
  }
  assert.ok(game.tally().allHeroes);
});

test('strays save: a floating room is closed and its tenant waits at the door', () => {
  const { game, clock } = newGame(8);
  const s = JSON.parse(JSON.stringify(game.s));
  const id = s.rooms[FIRST_ROOM].who;
  s.rooms[FIRST_ROOM].who = null;
  s.rooms[2] = { open: true, who: id };
  const m = migrate(s, clock.now());
  assert.equal(m.rooms[2].open, false);
  // The first room is free, so they are simply moved back in.
  assert.equal(m.rooms[FIRST_ROOM].who, id);
  assert.equal(m.door, null);
});

test('strays save: fresh state has no people and all rooms boarded', () => {
  const s = freshState(5, T0);
  assert.equal(s.rooms.length, ROOMS);
  assert.ok(s.rooms.every((r) => !r.open && !r.who));
  assert.deepEqual(s.people, {});
});

// ------------------------------------------------------------- the long haul

test('strays long haul: every habit fills the block and makes twelve heroes', () => {
  for (const habit of Object.keys(HABITS)) {
    for (let seed = 1; seed <= 6; seed++) {
      const run = playDays(seed * 13, habit, 21);
      assert.ok(run.full != null, `${habit} seed ${seed}: full house`);
      assert.ok(run.allHeroes != null, `${habit} seed ${seed}: all heroes`);
      assert.ok(run.full <= run.allHeroes);
      const tally = run.game.tally();
      assert.equal(tally.rooms, ROOMS);
      assert.equal(tally.heroes, ROOMS);
      assert.equal(run.game.s.door, null);
      assert.equal(run.game.price(), null);
    }
  }
});

test('strays long haul: there is always something to do or something to wait for', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { game, clock } = newGame(seed);
    for (let i = 0; i < 3000 && !game.tally().allHeroes; i++) {
      if (step(game, clock, { eager: false })) continue;
      const at = game.nextAt();
      assert.ok(at != null && at > clock.now(), `seed ${seed}: stuck at step ${i} with ${JSON.stringify(game.advice())}`);
      clock.warp(at - clock.now());
    }
    assert.ok(game.tally().allHeroes, `seed ${seed} finishes`);
  }
});

test('strays long haul: the first sitting is busy, and its pace holds', () => {
  const firsts = [];
  for (let seed = 1; seed <= 30; seed++) {
    const { game, clock } = newGame(seed);
    const log = [];
    sitting(game, clock, { maxMs: 10 * MIN, patience: 45 * SEC, log });
    const tally = game.tally();
    firsts.push(tally.somebodies);
    assert.ok(tally.somebodies >= 3, `seed ${seed}: ${tally.somebodies} faces in ten minutes`);
    assert.ok(tally.somebodies <= 6, `seed ${seed}: not the whole block at once`);
    assert.ok(log.filter((e) => e.what === 'go').length >= 4);
  }
  // The balance the docs quote: a casual player needs days, not hours and not weeks.
  const casual = playDays(99, 'casual', 21);
  assert.ok(casual.full > 36 && casual.full < 24 * 8, `casual full house after ${casual.full.toFixed(0)}h`);
  const binge = playDays(99, 'binge', 21);
  assert.ok(binge.full > 5, 'even a binge takes more than a morning');
  assert.ok(binge.full < casual.full);
});

test('strays advice: the hint line always names something true', () => {
  const { game, clock } = newGame(15);
  for (let i = 0; i < 600; i++) {
    game.tick();
    const a = game.advice();
    const now = clock.now();
    switch (a.do) {
      case 'wake':
      case 'patch':
      case 'grow':
      case 'feed':
      case 'hug': {
        const want = { wake: 'wake', patch: 'hurt', grow: 'grow', feed: 'hungry', hug: 'hug' }[a.do];
        assert.equal(game.wish(game.person(a.id), now), want);
        break;
      }
      case 'open':
        assert.ok(game.s.door && openable(game) >= 0);
        break;
      case 'go':
        assert.ok(game.eligible(now).includes(a.id));
        break;
      case 'bonk':
        assert.ok(game.s.zombies > 0);
        break;
      case 'save':
        assert.ok(game.s.door && game.s.cans < a.price);
        break;
      default:
        assert.equal(a.do, 'wait');
    }
    if (!step(game, clock)) {
      const at = game.nextAt();
      if (at == null) break;
      clock.warp(at - clock.now());
    }
  }
});
