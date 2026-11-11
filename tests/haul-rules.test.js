import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, newState, powerAt, tokensFor, suppliesFor, areaIndexFor, standChanceOf, standLabel, callMs } from '../haul/src/rules.js';
import { migrate } from '../haul/src/save.js';
import { FakeClock } from '../haul/src/clock.js';
import {
  CAST,
  CAST_ORDER,
  CLASSES,
  RARITIES,
  RARITY_ORDER,
  AREAS,
  FERRY_STARS,
  START,
  MAX_LEVEL,
  SQUAD_SIZE,
  GRID,
  CRATES,
  RACK_SIZE,
  CALL_SECONDS,
  FIRST_CALLS,
  LEGEND_PITY,
  TOKENS_TO_LEVEL,
  SUPPLIES_TO_LEVEL,
  SCRAPS,
  STAND,
  GIFT,
  TUNING_DEFAULTS,
} from '../haul/src/config.js';
import { simulate, tend, pickAll } from '../haul/tools/player.mjs';
import { mulberry32 } from '../haul/src/util.js';

const T0 = Date.UTC(2026, 5, 1, 9);
const HOUR = 3600 * 1000;

function make(seed = 7, tuning = {}) {
  const clock = new FakeClock(T0);
  const s = newState(T0, seed);
  const g = new Game(s, { clock, tuning: { ...TUNING_DEFAULTS, ...tuning } });
  return { g, s, clock };
}

/** Play one run and open every crate it's worth, first crates first. */
function runAndPick(g) {
  const res = g.play();
  const got = [];
  if (g.s.haul) {
    for (let i = 0; i < res.stars; i++) got.push(g.pick(i));
    g.finishHaul();
  }
  return { res, got };
}

test('content: twelve survivors, two of each class, and a road of six stops', () => {
  assert.equal(CAST_ORDER.length, 12);
  assert.deepEqual([...CAST_ORDER].sort(), Object.keys(CAST).sort());
  for (const cls of Object.keys(CLASSES)) assert.equal(CAST_ORDER.filter((id) => CAST[id].cls === cls).length, 2, `two ${cls}s`);
  for (const id of CAST_ORDER) {
    const c = CAST[id];
    assert.ok(RARITIES[c.rarity], `${id} has a rarity`);
    assert.ok(c.name && c.line && c.look, `${id} has a name, a line and a look`);
    assert.ok(c.area >= 0 && c.area < AREAS.length, `${id}'s voice is somewhere on the road`);
  }
  assert.equal(CAST_ORDER.filter((id) => CAST[id].rarity === 'legendary').length, 1);
  for (const id of START.squad) assert.equal(CAST[id].area, 0);
  assert.equal(START.squad.length, SQUAD_SIZE);
  assert.equal(AREAS.length, 6);
  assert.equal(AREAS[0].stars, 0);
  for (let i = 1; i < AREAS.length; i++) {
    assert.ok(AREAS[i].stars > AREAS[i - 1].stars, 'further each time');
    assert.ok(AREAS[i].danger > AREAS[i - 1].danger, 'more dangerous each time');
    assert.ok(AREAS[i].loot > AREAS[i - 1].loot, 'richer each time');
  }
  assert.ok(FERRY_STARS > AREAS[AREAS.length - 1].stars);
  assert.equal(TOKENS_TO_LEVEL.length, MAX_LEVEL - 1);
  assert.equal(SUPPLIES_TO_LEVEL.length, MAX_LEVEL - 1);
  assert.equal(CRATES.small.count + CRATES.medium.count + CRATES.tokens.count + 1, GRID, 'nine crates');
});

test('the start: three commons at level 1, nothing in hand, an empty rack, the first stop', () => {
  const { g, s } = make();
  assert.equal(s.supplies, START.supplies);
  assert.deepEqual(s.squad, START.squad);
  assert.deepEqual(g.owned(), START.squad);
  for (const id of s.squad) {
    assert.equal(g.level(id), 1);
    assert.equal(g.power(id), 10);
  }
  assert.equal(g.areaIndex(), 0);
  assert.equal(g.rackRoom(), RACK_SIZE);
  assert.equal(s.haul, null);
  assert.deepEqual(g.hint(), { kind: 'play' });
  assert.ok(g.guiding());
});

test('power, costs and odds: more power is better odds; power = danger is a coin flip', () => {
  assert.equal(powerAt('common', 1), 10);
  assert.equal(powerAt('common', 10), 46);
  for (const r of RARITY_ORDER) for (let l = 1; l < MAX_LEVEL; l++) assert.ok(powerAt(r, l + 1) > powerAt(r, l));
  for (let i = 1; i < RARITY_ORDER.length; i++) assert.ok(powerAt(RARITY_ORDER[i], 5) > powerAt(RARITY_ORDER[i - 1], 5), 'rarer is stronger at the same level');
  assert.ok(powerAt('common', 4) > powerAt('legendary', 1), 'a levelled Common beats a fresh Legendary');
  assert.equal(tokensFor(1), TOKENS_TO_LEVEL[0]);
  assert.equal(suppliesFor(MAX_LEVEL - 1), SUPPLIES_TO_LEVEL[MAX_LEVEL - 2]);
  assert.equal(tokensFor(MAX_LEVEL), null);
  assert.equal(suppliesFor(MAX_LEVEL), null);
  assert.equal(standChanceOf(10, 10, 10), 0.5);
  assert.ok(standChanceOf(13, 13, 10) > standChanceOf(11, 11, 10));
  assert.ok(standChanceOf(10, 14, 10) > standChanceOf(10, 10, 10), 'a strong squad helps the weakest');
  assert.equal(standChanceOf(1000, 1000, 1), STAND.max);
  assert.equal(standChanceOf(1, 1, 1000), STAND.min);
  assert.equal(standLabel(0.9).id, 'solid');
  assert.equal(standLabel(0.7).id, 'good');
  assert.equal(standLabel(0.4).id, 'shaky');
  assert.equal(standLabel(0.1).id, 'risky');
  assert.equal(areaIndexFor(0), 0);
  assert.equal(areaIndexFor(AREAS[1].stars - 1), 0);
  assert.equal(areaIndexFor(AREAS[1].stars), 1);
  assert.equal(areaIndexFor(1e9), AREAS.length - 1);
});

test('the first run: all three standing, and the haul teaches supplies, tokens, then the radio', () => {
  for (const order of [
    [0, 1, 2],
    [8, 4, 0],
    [5, 3, 7],
  ]) {
    const { g, s } = make(11);
    const res = g.play();
    assert.ok(res.ok);
    assert.deepEqual(res.standing, [true, true, true]);
    assert.equal(res.stars, 3);
    assert.equal(s.stars, 3);
    assert.equal(s.haul.picks, 3);
    assert.equal(s.haul.crates.length, GRID);
    assert.deepEqual(g.hint(), { kind: 'pick' });
    const a = g.pick(order[0]);
    assert.equal(a.crate.kind, 'supplies');
    assert.ok(a.crate.amount >= suppliesFor(1), 'enough for the first level-up');
    assert.equal(s.supplies, a.crate.amount);
    const b = g.pick(order[1]);
    assert.equal(b.crate.kind, 'tokens');
    assert.equal(b.crate.who, s.squad[0]);
    assert.equal(s.cast[s.squad[0]].tokens, tokensFor(1));
    assert.ok(g.levelInfo(s.squad[0]).ok, 'the first survivor can level up');
    const c = g.pick(order[2]);
    assert.equal(c.crate.kind, 'radio');
    assert.equal(c.left, 0);
    assert.equal(s.rack.length, 1);
    assert.equal(s.rack[0].dur, FIRST_CALLS[0] * 1000);
    assert.equal(g.pick(6).ok, false, 'no picks left');
    const done = g.finishHaul();
    assert.equal(done.left.length, GRID - 3);
    assert.equal(s.haul, null);
    assert.deepEqual(g.hint(), { kind: 'level', id: s.squad[0] });
  }
});

test('stars are the survivors still standing, and each star is one pick', () => {
  for (const n of [0, 1, 2, 3]) {
    const { g, s } = make(3, { outcome: String(n) });
    g.play(); // (the first run obeys the testing tools too)
    assert.equal(s.stats.stars[n], 1);
    assert.equal(s.stars, n);
    if (n === 0) {
      assert.equal(s.haul, null, 'nobody standing: no crates');
      assert.equal(s.supplies, Math.round(SCRAPS * AREAS[0].loot), 'a handful of scraps');
      continue;
    }
    assert.equal(s.haul.picks, n);
    for (let i = 0; i < n; i++) assert.ok(g.pick(i).ok);
    assert.equal(g.pick(n).ok, false);
    assert.equal(g.pick(0).ok, false, 'a crate opens once');
    assert.equal(g.play().ok, false, 'no new run while crates wait');
    g.finishHaul();
    assert.ok(g.play().ok);
  }
});

test('a forced outcome leaves the likeliest standing', () => {
  const { g, s } = make(5, { outcome: '1' });
  s.cast.mags.level = 5;
  const res = g.play();
  assert.deepEqual(res.standing, [false, false, true]);
  assert.equal(s.cast.mags.stood, 1);
  assert.equal(s.cast.odile.stood, 0);
  assert.equal(s.cast.odile.runs, 1);
});

test('nine crates: three small, two medium, three token stacks and one special', () => {
  const { g, s } = make(21);
  runAndPick(g);
  for (let k = 0; k < 40; k++) {
    g.cheat('answer');
    while (g.answered()) g.answer();
    const room = g.rackRoom() > 0;
    const before = s.supplies;
    const res = g.play();
    if (!res.stars) continue;
    const h = s.haul;
    assert.equal(h.crates.length, GRID);
    const kinds = { radio: 0, gold: 0, wood: 0, steel: 0, tokens: 0 };
    for (const c of h.crates) {
      if (c.kind === 'radio') kinds.radio++;
      else if (c.kind === 'tokens') {
        kinds.tokens++;
        assert.ok(g.has(c.who), 'tokens are for someone in the camp');
        assert.ok(c.amount >= 1);
      } else {
        assert.equal(c.kind, 'supplies');
        assert.ok(c.amount >= 1);
        if (c.gold) kinds.gold++;
        else kinds[c.tier]++;
      }
    }
    assert.equal(kinds.tokens, CRATES.tokens.count);
    assert.equal(kinds.steel, CRATES.medium.count);
    assert.equal(kinds.radio, room ? 1 : 0, 'a radio while the rack has room');
    assert.ok(kinds.gold >= (room ? 0 : 1) && kinds.gold <= (room ? 1 : 2));
    assert.equal(kinds.wood + kinds.gold + kinds.radio, CRATES.small.count + 1);
    if (h.eyes != null) assert.ok(h.crates[h.eyes].kind === 'radio' || h.crates[h.eyes].gold, 'the eyes look at the special crate');
    const got = g.pick(0);
    if (got.crate.kind === 'supplies') assert.equal(s.supplies, before + got.crate.amount);
    g.finishHaul();
  }
});

test('with the rack full the special crate is gold, and worth more than the others', () => {
  const { g, s } = make(9);
  for (let i = 0; i < RACK_SIZE; i++) assert.ok(g.cheat('radio'));
  assert.equal(g.cheat('radio'), false);
  assert.equal(g.rackRoom(), 0);
  s.runs = 5; // past the scripted first haul
  g.tuning.outcome = '3';
  g.play();
  const gold = s.haul.crates.filter((c) => c.gold);
  assert.ok(gold.length >= 1);
  assert.ok(!s.haul.crates.some((c) => c.kind === 'radio'));
  const rest = s.haul.crates.filter((c) => c.kind === 'supplies' && !c.gold);
  for (const c of rest) assert.ok(gold[0].amount > c.amount);
});

test('the same save plays out the same way', () => {
  const a = make(1234);
  const b = make(1234);
  for (let k = 0; k < 12; k++) {
    const ra = runAndPick(a.g);
    const rb = runAndPick(b.g);
    assert.deepEqual(ra, rb);
    a.g.cheat('answer');
    b.g.cheat('answer');
    while (a.g.answered()) assert.deepEqual(a.g.answer(), b.g.answer());
  }
  assert.deepEqual(a.s, b.s);
  const c = make(1235);
  for (let k = 0; k < 12; k++) runAndPick(c.g);
  assert.notDeepEqual(c.s.cast, a.s.cast);
});

test('levelling up takes tokens and supplies, and makes them stronger', () => {
  const { g, s } = make();
  assert.equal(g.levelUp('odile').why, 'tokens');
  s.cast.odile.tokens = tokensFor(1) + 1;
  assert.ok(g.levelInfo('odile').ready);
  assert.equal(g.levelUp('odile').why, 'supplies');
  assert.deepEqual(g.readyList(), []);
  s.supplies = suppliesFor(1) + 5;
  assert.deepEqual(g.readyList(), ['odile']);
  const before = g.power('odile');
  const chance = g.standChance('odile');
  const res = g.levelUp('odile');
  assert.ok(res.ok);
  assert.equal(res.level, 2);
  assert.equal(res.before, before);
  assert.ok(res.power > before);
  assert.ok(g.standChance('odile') > chance);
  assert.equal(s.cast.odile.tokens, 1, 'spare tokens carry over');
  assert.equal(s.supplies, 5);
  assert.equal(s.stats.levelUps, 1);
  assert.equal(g.levelUp('nobody').ok, false);
  assert.equal(g.levelUp('lou').ok, false, 'not in the camp yet');
});

test('the top level: no more level-ups, and tokens turn into supplies', () => {
  const { g, s } = make();
  s.cast.odile.level = MAX_LEVEL;
  s.cast.odile.tokens = 99;
  s.supplies = 1e6;
  assert.equal(g.levelUp('odile').why, 'max');
  assert.equal(g.levelInfo('odile').ready, false);
  const before = s.supplies;
  const got = g._giveTokens('odile', 3);
  assert.equal(got.tokens, 0);
  assert.ok(got.refund > 0);
  assert.equal(s.supplies, before + got.refund);
  // Token crates look for someone who can still use them.
  s.cast.teo.level = MAX_LEVEL;
  s.runs = 3;
  g.tuning.outcome = '3';
  for (let k = 0; k < 10; k++) {
    g.play();
    for (const c of s.haul.crates) if (c.kind === 'tokens') assert.equal(c.who, 'mags');
    g.finishHaul();
  }
});

test('the radio rack: three radios, one call at a time, the first calls quick', () => {
  const { g, s, clock } = make();
  assert.equal(callMs(0), FIRST_CALLS[0] * 1000);
  assert.equal(callMs(FIRST_CALLS.length), CALL_SECONDS * 1000);
  assert.equal(callMs(FIRST_CALLS.length, 0.5), CALL_SECONDS * 500);
  g.cheat('radio');
  g.cheat('radio');
  g.cheat('radio');
  assert.equal(g.rackRoom(), 0);
  let r = g.rack();
  assert.deepEqual(
    r.map((x) => x.state),
    ['calling', 'queued', 'queued'],
  );
  assert.equal(r[0].left, FIRST_CALLS[0] * 1000);
  assert.equal(r[1].left, (FIRST_CALLS[0] + FIRST_CALLS[1]) * 1000, 'the second waits for the first');
  assert.equal(g.answered(), 0);
  assert.equal(g.answer().ok, false);
  assert.equal(g.nextAnswerAt(), T0 + FIRST_CALLS[0] * 1000);
  clock.warp(FIRST_CALLS[0] * 1000);
  r = g.rack();
  assert.deepEqual(
    r.map((x) => x.state),
    ['answered', 'calling', 'queued'],
  );
  assert.equal(g.answered(), 1);
  assert.deepEqual(g.hint(), { kind: 'radio' });
  const res = g.answer();
  assert.ok(res.ok);
  assert.equal(g.rackRoom(), 1, 'picking up frees the slot');
  assert.equal(s.calls, 1);
  clock.warp(10 * HOUR);
  assert.equal(g.answered(), 2, 'calls go on while you are away');
  assert.equal(g.nextAnswerAt(), null);
  // The fourth radio ever takes the full time.
  g.cheat('radio');
  assert.equal(g.rack()[2].left, CALL_SECONDS * 1000);
});

test('the first call is Big Lou, the first calls are all new people, later ones are by the odds', () => {
  const { g, s } = make(4);
  const seen = [];
  for (let k = 0; k < START.freshCalls; k++) {
    g.cheat('radio');
    g.cheat('answer');
    const res = g.answer();
    assert.ok(res.isNew, `call ${k + 1} reaches someone new`);
    assert.equal(res.tokens, 0);
    assert.ok(g.has(res.id));
    seen.push(res.id);
  }
  assert.equal(seen[0], START.firstCall);
  assert.equal(new Set(seen).size, seen.length);
  assert.equal(s.fresh, 0);
  assert.equal(g.owned().length, SQUAD_SIZE + START.freshCalls);
  // Everyone at the first stop is in the camp now: calls bring tokens.
  assert.deepEqual(g.voices(0).filter((id) => !g.has(id)), []);
  for (let k = 0; k < 6; k++) {
    g.cheat('radio');
    g.cheat('answer');
    const res = g.answer();
    assert.equal(res.isNew, false);
    assert.ok(res.tokens >= 1);
    assert.equal(CAST[res.id].area, 0, 'only voices from stops reached');
  }
  assert.equal(s.stats.dupes, 6);
});

test('newcomers arrive near the squad’s level', () => {
  const { g, s } = make(4);
  for (const id of s.squad) s.cast[id].level = 6;
  g.cheat('radio');
  g.cheat('answer');
  const res = g.answer();
  assert.equal(res.id, 'lou');
  assert.equal(res.level, 5);
  assert.equal(g.level('lou'), 5);
  assert.ok(g.power('lou') < g.power('odile') + 1 && g.power('lou') > g.power('odile') - 6);
  const better = g.betterBench();
  assert.equal(better, null, 'a Rare a level down is about as strong, not stronger');
});

test('a new stop: its voices are on the radio and the next call reaches one of them', () => {
  const { g, s } = make(8);
  for (let k = 0; k < START.freshCalls; k++) {
    g.cheat('radio');
    g.cheat('answer');
    g.answer();
  }
  assert.equal(g.pendingArea(), null);
  g.cheat('next');
  assert.equal(s.stars, AREAS[1].stars);
  assert.equal(g.areaIndex(), 1);
  assert.equal(g.pendingArea(), 1);
  const a = g.arrive();
  assert.equal(a.area, 1);
  assert.deepEqual(a.voices, ['caretaker']);
  assert.equal(g.pendingArea(), null);
  assert.equal(g.arrive(), null);
  assert.equal(s.fresh, 1);
  g.cheat('radio');
  g.cheat('answer');
  const res = g.answer();
  assert.equal(res.id, 'caretaker');
  assert.ok(res.isNew);
  assert.equal(res.why, 'fresh');
  assert.ok(g.danger() > AREAS[0].danger);
  // Two stops at once are celebrated one at a time.
  s.stars = AREAS[3].stars;
  assert.equal(g.pendingArea(), 2);
  g.arrive();
  assert.equal(g.pendingArea(), 3);
  g.arrive();
  assert.equal(g.pendingArea(), null);
});

test('the Legendary answers by luck, or by the pity count; never on a fresh call', () => {
  const { g, s } = make(31);
  s.stars = AREAS[3].stars;
  while (g.pendingArea() != null) g.arrive();
  s.fresh = 20;
  let calls = 0;
  let at = null;
  for (let k = 0; k < 60 && at == null; k++) {
    g.cheat('radio');
    g.cheat('answer');
    const res = g.answer();
    calls++;
    if (res.id === 'tinkerer') {
      at = calls;
      assert.ok(res.why === 'pity' || res.why === 'odds');
    } else if (res.isNew) assert.equal(res.why === 'fresh' || res.why === 'first', true);
  }
  assert.ok(at != null && at <= LEGEND_PITY + 9, `the Legendary within the pity count (call ${at})`);
  assert.equal(s.legendWait, 0);
  assert.equal(g.owned().length, g.voices().length, 'everyone out there so far is in the camp');
});

test('testing tools can force who answers', () => {
  const { g, s } = make(2);
  s.stars = AREAS[5].stars;
  g.force.call = 'tinkerer';
  g.cheat('radio');
  g.cheat('answer');
  assert.equal(g.answer().id, 'tinkerer');
  g.force.call = 'epic';
  g.cheat('radio');
  g.cheat('answer');
  const res = g.answer();
  assert.equal(res.rarity, 'epic');
  assert.ok(res.isNew);
  assert.equal(g.force.call, undefined, 'one shot');
});

test('the road: stars add up, the stop follows, and the ferry is the end of it', () => {
  const { g, s } = make();
  let r = g.road();
  assert.equal(r.area, 0);
  assert.equal(r.to, AREAS[1].stars);
  assert.equal(r.left, AREAS[1].stars);
  assert.equal(r.t, 0);
  s.stars = AREAS[1].stars - 3;
  r = g.road();
  assert.equal(r.left, 3);
  assert.ok(r.t > 0.5 && r.t < 1);
  s.stars = AREAS[5].stars + 10;
  r = g.road();
  assert.equal(r.area, 5);
  assert.equal(r.next, null);
  assert.ok(r.ferry);
  assert.equal(r.to, FERRY_STARS);
  assert.equal(g.pendingFerry(), false);
  s.stars = FERRY_STARS;
  assert.ok(g.pendingFerry());
  g.boardFerry();
  assert.equal(g.pendingFerry(), false);
  assert.equal(g.road().t, 1);
  // A run's stars land on the road at once.
  const m = make(3, { outcome: '2' });
  const res = m.g.play();
  assert.deepEqual(res.road, { before: 0, after: 2, areaBefore: 0, areaAfter: 0 });
});

test('the squad: swapping in, changing places, the strongest three', () => {
  const { g, s } = make();
  g.cheat('everyone');
  assert.equal(g.owned().length, 12);
  assert.equal(g.bench().length, 9);
  assert.equal(g.putInSquad('lou', 1).out, 'teo');
  assert.deepEqual(s.squad, ['odile', 'lou', 'mags']);
  assert.equal(g.putInSquad('mags', 0).out, null);
  assert.deepEqual(s.squad, ['mags', 'lou', 'odile'], 'two in the squad change places');
  assert.equal(g.putInSquad('lou', 1).ok, true);
  assert.equal(g.putInSquad('lou', 7).ok, false);
  assert.equal(g.putInSquad('nobody', 0).ok, false);
  assert.deepEqual(g.bestSquad(), ['tinkerer', 'biscuit', 'dawn'], 'at level 1 the rarest are the strongest');
  assert.equal(g.weakestSlot(), 0);
  const better = g.betterBench();
  assert.equal(better.id, 'tinkerer');
  assert.equal(better.out, 'mags');
  assert.deepEqual(g.hint(), { kind: 'squad', id: 'tinkerer' });
  s.cast.mags.level = 9;
  const came = g.useBest();
  assert.deepEqual(s.squad, ['mags', 'tinkerer', 'biscuit'], 'whoever stays keeps their place');
  assert.deepEqual(came, ['tinkerer', 'biscuit']);
  assert.equal(new Set(s.squad).size, 3);
  assert.equal(g.betterBench(), null);
});

test('the pointing hand: crates, then the radio, a level-up, a stronger squad, then PLAY', () => {
  const { g, s, clock } = make(13);
  g.play();
  assert.equal(g.hint().kind, 'pick');
  for (let i = 0; i < 3; i++) g.pick(i);
  g.finishHaul();
  assert.equal(g.hint().kind, 'level', 'the call is still going');
  clock.warp(FIRST_CALLS[0] * 1000);
  assert.equal(g.hint().kind, 'radio');
  g.answer();
  assert.equal(g.hint().kind, 'level');
  g.levelUp(s.squad[0]);
  assert.deepEqual(g.hint(), { kind: 'squad', id: 'lou' }, 'Big Lou (a Rare) is stronger than the weakest of the three');
  const better = g.betterBench();
  g.putInSquad(better.id, better.slot);
  assert.equal(g.hint().kind, 'play');
  s.gift = { amount: 10, line: 'found this.' };
  assert.equal(g.hint().kind, 'gift');
  assert.ok(g.guiding());
  s.runs = 9;
  s.stats.levelUps = 3;
  assert.equal(g.guiding(), false);
});

test('a clock that jumps back never makes a call take longer', () => {
  const { g, s, clock } = make();
  g.cheat('radio');
  g.cheat('radio');
  g.cheat('radio');
  g.cheat('radio');
  clock.warp(1000);
  g.tick();
  const left = g.rack().map((r) => r.left);
  clock.warp(-5 * HOUR);
  g.tick();
  assert.deepEqual(
    g.rack().map((r) => r.left),
    left,
  );
  clock.warp(-2 * HOUR);
  const back = g.comeBack();
  assert.ok(back.away < 0);
  assert.deepEqual(
    g.rack().map((r) => r.left),
    left,
  );
  assert.equal(s.lastNow, clock.now());
});

test('a crate at the gate: sometimes, after an hour away, in orange crayon', () => {
  let gifts = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const { g, s, clock } = make(seed);
    s.runs = GIFT.afterRuns;
    clock.warp(GIFT.awayMs - 1000);
    assert.equal(g.comeBack().gift, null, 'not within the hour');
    clock.warp(GIFT.awayMs + 1000);
    const back = g.comeBack();
    if (!back.gift) continue;
    gifts++;
    assert.ok(GIFT.lines.includes(s.gift.line));
    assert.equal(s.gift.line, s.gift.line.toLowerCase(), 'lowercase, like everything he writes');
    const before = s.supplies;
    const took = g.takeGift();
    assert.ok(took.ok);
    assert.equal(s.supplies, before + took.amount);
    assert.equal(s.gift, null);
    assert.equal(g.takeGift().ok, false);
  }
  assert.ok(gifts > 200 * GIFT.chance * 0.6 && gifts < 200 * GIFT.chance * 1.5, `about ${GIFT.chance * 100}% of returns (${gifts}/200)`);
  const { g, s, clock } = make(1);
  clock.warp(5 * HOUR);
  g.force.gift = true;
  assert.equal(g.comeBack().gift, null, 'not before the first few runs');
  s.runs = GIFT.afterRuns;
  clock.warp(5 * HOUR);
  g.force.gift = true;
  assert.ok(g.comeBack().gift);
});

test('saves: a round trip keeps everything; junk becomes a fresh save; odd values are repaired', () => {
  const { g, s } = make(99);
  const rng = mulberry32(5);
  for (let k = 0; k < 9; k++) {
    tend(g);
    g.play();
    if (k < 8) pickAll(g, rng);
    g.cheat('answer');
  }
  assert.ok(s.haul, 'a haul is waiting');
  s.haul.picked.push(4);
  const copy = migrate(JSON.parse(JSON.stringify(s)), T0);
  assert.deepEqual(copy, s);
  for (const junk of [null, 7, 'x', [], {}, { cast: 3 }]) {
    const f = migrate(junk, T0);
    assert.deepEqual(f.squad, START.squad);
    assert.equal(f.stars, 0);
  }
  const odd = migrate({ seed: 5, cast: { odile: { level: 99, tokens: -4 }, ghost: { level: 2 }, lou: { level: 3 } }, squad: ['lou', 'lou', 'ghost'], supplies: -50, stars: 45.7, rack: [{ readyAt: 5, dur: 10 }, { readyAt: 'x' }, 1, 2, 3, 4], haul: { crates: [1, 2] }, areaSeen: 99, stats: { stars: [1, 'x'], newcomers: { rare: 2 } } }, T0);
  assert.equal(odd.cast.odile.level, MAX_LEVEL);
  assert.equal(odd.cast.odile.tokens, 0);
  assert.equal(odd.cast.ghost, undefined);
  assert.deepEqual(odd.squad, ['lou', 'odile', 'teo']);
  assert.equal(odd.supplies, 0);
  assert.equal(odd.stars, 45);
  assert.equal(odd.areaSeen, areaIndexFor(45));
  assert.equal(odd.rack.length, 1);
  assert.equal(odd.haul, null);
  assert.deepEqual(odd.stats.stars, [1, 0, 0, 0]);
  assert.equal(odd.stats.newcomers.rare, 2);
  const game = new Game(odd, { clock: new FakeClock(T0), tuning: { ...TUNING_DEFAULTS } });
  assert.ok(game.play().ok, 'a repaired save plays');
});

test('a simulated player gets down the road at the pace the docs promise', () => {
  const seeds = [1, 2, 3, 4, 5, 6];
  const sims = seeds.map((seed) => simulate({ seed, days: 12 }));
  const med = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const opens = (a) => med(sims.map((x) => (x.arrivals.find((q) => q.area === a) || { run: Infinity }).run));
  assert.ok(opens(1) >= 3 && opens(1) <= 8, `the Graveyard on day 1 (run ${opens(1)})`);
  assert.ok(opens(2) >= 12 && opens(2) <= 30, `the Junkyard on day 2 (run ${opens(2)})`);
  assert.ok(opens(3) >= 30 && opens(3) <= 60, `Center City around day 3 (run ${opens(3)})`);
  assert.ok(opens(5) >= 90 && opens(5) <= 150, `Pier 9 around day 8 (run ${opens(5)})`);
  for (const x of sims) {
    const s = x.state;
    assert.ok(s.supplies >= 0);
    for (let a = 1; a < AREAS.length; a++) {
      const arr = x.arrivals.find((q) => q.area === a);
      assert.ok(arr, `stop ${a + 1} reached`);
      assert.ok(arr.expected >= 0.9 && arr.expected <= 2.4, `a new stop is a step up, not a wall (${arr.expected.toFixed(2)} stars a run at stop ${a + 1})`);
    }
    assert.ok(x.first.levelUp <= 2, 'a level-up after the first run');
    assert.ok(x.first.newcomer <= 4, 'someone new in the first session');
    assert.equal(Object.keys(s.cast).length, 12, 'the whole cast by day 12');
    const wipes = x.rows.filter((r) => r.stars === 0).length / x.rows.length;
    assert.ok(wipes < 0.12, `few runs come back empty (${Math.round(wipes * 100)}%)`);
    const avg = x.rows.reduce((t, r) => t + r.stars, 0) / x.rows.length;
    assert.ok(avg > 1.7 && avg < 2.7, `about two stars a run (${avg.toFixed(2)})`);
    for (const id of Object.keys(s.cast)) assert.ok(s.cast[id].level >= 1 && s.cast[id].level <= MAX_LEVEL);
    assert.ok(s.rack.length <= RACK_SIZE);
  }
  const lazy = simulate({ seed: 1, days: 3, lazy: true });
  assert.ok(lazy.state.stars < sims[0].dayRows[2].stars / 2, 'never levelling up gets you nowhere fast');
});
