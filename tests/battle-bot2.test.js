// The bot and the 18 newer cards: it plays every new kind legally and sensibly
// (buildings in its own zone in front of its tower, Brollies on a target
// anywhere, Bubble Wrap on its own push, peels ahead of a push, an air answer
// to fliers and never a card that can't reach them), and random 32-card
// bot-vs-bot matches never throw, never go NaN and never peek.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, REGULATION, OVERTIME, ANYWHERE, MANA_TIME } from '../battle/src/sim/match.js';
import { DT } from '../battle/src/sim/battle.js';
import { Bot, CLASS, CLASSES, COUNTER, airValue } from '../battle/src/sim/bot.js';
import { CARDS, CARD_ORDER } from '../battle/src/sim/cards.js';
import { UNIT_TYPES } from '../battle/src/sim/unit-types.js';
import { BUILDINGS, BUILD_GAP, fitBuilding } from '../battle/src/sim/buildings.js';
import { GUARD } from '../battle/src/sim/towers.js';
import { WORLD } from '../battle/src/config.js';
import { Rng } from '../battle/src/sim/rng.js';
import { castSpell } from '../battle/src/sim/spells.js';

const TEAMS = ['blue', 'red'];
const AIR_ANSWERS = ['archers', 'arrowRain', 'netter', 'bombJuggler', 'bigSneeze', 'shakenSoda', 'anvil']; // contract 7/8
const FILLER = ['pogoBean', 'tummyDrummer', 'bubbleWrap', 'sprouts']; // hand cards that are never a defence

function match(seed, blue, red, level = 1) {
  const side = (deck) => ({ deck, levels: Object.fromEntries(deck.map((id) => [id, level])), kingLevel: level });
  return new Match({ seed, blue: side(blue), red: side(red) });
}

/** Watch every match.play() call: legal at the moment of the call (canPlay ''), where it went, did it succeed. */
function spyPlays(m) {
  const calls = [];
  const play = m.play.bind(m);
  m.play = (team, i, x) => {
    const id = m.sides[team].hand[i];
    const why = m.canPlay(team, i, x);
    const zone = m.zone(team);
    const towers = m.battle.towers.filter((t) => t.alive).map((t) => ({ x: t.x, w: t.w }));
    const ok = play(team, i, x);
    calls.push({ t: m.time, team, id, x, why, ok, zone, towers });
    return ok;
  };
  return calls;
}

/** Step bots + match for `secs` (or to the end); fn(m) after every step may return false to stop. */
function run(m, bots, secs, fn = null) {
  for (let s = 0; s < secs / DT && m.phase !== 'over'; s++) {
    for (const b of bots) b.update(DT);
    m.step();
    if (fn && fn(m) === false) break;
    m.battle.events.length = 0;
  }
}

/** Every card play is legal for its kind: units in the zone, anywhere in ANYWHERE, buildings in the own deploy zone clear of every structure. */
function assertLegal(c, label = '') {
  const card = CARDS[c.id];
  assert.equal(c.why, '', `${label} illegal play ${JSON.stringify({ t: c.t, team: c.team, id: c.id, x: c.x, why: c.why })}`);
  assert.ok(c.ok, `${label} ${c.id} failed`);
  if (card.kind === 'spell') assert.ok(c.x >= 0 && c.x <= WORLD.width);
  else if (card.kind === 'building') {
    const half = BUILDINGS[card.building].w / 2;
    const [a, b] = WORLD.deploy[c.team];
    assert.ok(c.x - half >= a && c.x + half <= b, `${label} ${c.id} at ${c.x} outside ${c.team}'s deploy zone`);
    for (const t of c.towers) assert.ok(Math.abs(c.x - t.x) - half - t.w / 2 >= BUILD_GAP - 1e-9, `${label} ${c.id} at ${c.x} overlaps a structure at ${t.x}`);
  } else if (card.anywhere) assert.ok(c.x >= ANYWHERE[0] && c.x <= ANYWHERE[1], `${label} ${c.id} at ${c.x}`);
  else assert.ok(c.x >= c.zone[0] && c.x <= c.zone[1], `${label} unit card ${c.id} at ${c.x} outside ${c.zone}`);
}

/** Red's bot with a hand of exactly these cards and this much mana. */
function redBot(m, hand, { mana = 10, skill = 0.9, seed = 4 } = {}) {
  const r = m.sides.red;
  r.hand = hand.slice();
  r.mana = mana;
  return new Bot(m, 'red', { skill, seed, aggro: 0.1 });
}

const firstPlay = (bot, pred = () => true) => bot.log.find(pred) || null;
const DECK = ['clubbers', 'squire', 'archers', 'spikers', 'bomb', 'arrowRain', 'boulder', 'clubberGang'];

test('bot tables: every unit type has a class, every unit and building card a COUNTER row of 8, and the air answers are the contract list', () => {
  assert.deepEqual(CLASSES, ['siege', 'tank', 'armored', 'melee', 'swarm', 'ranged', 'bomb', 'air']);
  for (const id of Object.keys(UNIT_TYPES)) assert.ok(CLASSES.includes(CLASS[id]), `unit type ${id} has no class`);
  assert.equal(CLASS.copter, 'air');
  assert.equal(CLASS.pelican, 'air');
  for (const id of CARD_ORDER) {
    const c = CARDS[id];
    if (c.kind === 'spell') continue;
    const row = COUNTER[id];
    assert.ok(row && row.length === 8 && row.every((v) => Number.isFinite(v) && v >= 0 && v <= 1), `${id}: ${row}`);
  }
  // What reaches fliers (contract 8): exactly these cards have an air value
  const reach = CARD_ORDER.filter((id) => airValue(id) > 0).sort();
  assert.deepEqual(reach, [...AIR_ANSWERS, 'bombSquad', 'megaBomb', 'wreckingCrane'].sort());
  for (const id of ['clubbers', 'bruiser', 'boulder', 'cheeseWheel', 'bananaPeels', 'pogoBean', 'propellerPals', 'pelican', 'boingBox', 'bubbleWrap']) assert.equal(airValue(id), 0, id);
});

test('buildings: in its own zone in front of its Guard Tower at a legal spot: a Boing Box against a melee push, a Bean Patch against a Brick, a Wrecking Crane against a big melee push', () => {
  for (const [bid, attackers, seed] of [
    ['boingBox', ['clubber', 'clubber', 'clubber'], 101],
    ['beanPatch', ['brick'], 102],
    ['wreckingCrane', ['clubber', 'clubber', 'clubber', 'clubber', 'bruiser'], 103],
  ]) {
    const m = match(seed, DECK, DECK);
    const calls = spyPlays(m);
    attackers.forEach((u, k) => m.battle.addUnit(u, 'blue', 760 + k * 22, 0.5));
    const bot = redBot(m, [bid, ...FILLER.slice(0, 3)], { mana: CARDS[bid].mana + 1 });
    run(m, [bot], 8, () => !bot.log.length);
    const l = firstPlay(bot);
    assert.ok(l, `${bid}: no play against ${attackers}`);
    assert.equal(l.card, bid, `${bid}: played ${l.card} (${l.why})`);
    const c = calls.find((k) => k.team === 'red');
    assertLegal(c, bid);
    const b = m.battle.towers.find((t) => t.kind === 'building' && t.team === 'red');
    assert.ok(b && b.bid === bid, `${bid}: no building on the field`);
    // In front of red's Guard Tower (toward the bridge) and well inside its range
    const g = WORLD.towerX.red;
    assert.ok(b.x < g - GUARD.w / 2 - b.w / 2 && b.x > g - GUARD.range + 60, `${bid} at ${b.x.toFixed(1)}, tower at ${g}`);
  }
});

test('buildings: with nothing coming and mana to spare the bot plants a Bean Patch; it never places a 4th building over a fresh one', () => {
  const m = match(111, DECK, DECK);
  const calls = spyPlays(m);
  const bot = redBot(m, ['beanPatch', ...FILLER.slice(0, 3)], { mana: 9 });
  run(m, [bot], 3, () => !bot.log.length);
  const l = firstPlay(bot);
  assert.ok(l && l.card === 'beanPatch' && l.why === 'build', `played ${JSON.stringify(l)}`);
  assertLegal(calls[0]);
  assert.ok(l.x < WORLD.towerX.red && l.x > WORLD.towerX.red - GUARD.range, `patch at ${l.x}`);

  // Three fresh buildings of its own standing, out of the way (the Patch's spot in front of the tower is free): a 4th
  // would crumble one, so it keeps the card. Once the oldest is nearly gone anyway, down goes the Patch.
  for (const weak of [false, true]) {
    const f = match(112, DECK, DECK);
    const blds = [];
    for (const x of [810, 870, 930]) {
      const fx = fitBuilding(f.battle, 'red', 'boingBox', x);
      assert.ok(fx != null && Math.abs(fx - x) < 1, `a legal spot at ${x}`);
      blds.push(f.battle.addBuilding('boingBox', 'red', fx, 1));
    }
    if (weak) blds[0].hp = blds[0].maxHp * 0.25;
    const keep = redBot(f, ['beanPatch', 'pogoBean', 'tummyDrummer', 'bubbleWrap'], { mana: 9 });
    assert.ok(keep.buildAt({ id: 'beanPatch', card: CARDS.beanPatch }, keep.view(), 100) != null, 'there is a spot for the Patch');
    run(f, [keep], 3);
    const built = keep.log.filter((p) => CARDS[p.card].kind === 'building');
    if (weak) assert.ok(built.length === 1 && built[0].card === 'beanPatch' && built[0].why === 'build', `the oldest at 25%: ${JSON.stringify(keep.log)}`);
    else assert.equal(built.length, 0, `built a 4th over a fresh one: ${JSON.stringify(keep.log)}`);
  }
});

test('full mana with no unit in hand (spells and buildings only, one of its buildings standing): it still spends, legally, within 2 s', () => {
  for (const [hand, seed, more] of [
    [['bananaPeels', 'boingBox', 'cheeseWheel', 'bubbleWrap'], 113, []],
    [['wreckingCrane', 'boingBox', 'anvil', 'arrowRain'], 114, []],
    // (three fresh ones: no room for a 4th and no spell for a tower: the peels go down in front of its own tower)
    [['bananaPeels', 'bubbleWrap', 'boingBox', 'beanPatch'], 115, [['boingBox', 1000], ['wreckingCrane', 920]]],
  ]) {
    for (const skill of [0.3, 0.6, 0.9]) {
      const m = match(seed, DECK, [...hand, 'clubbers', 'squire', 'archers', 'spikers']);
      const calls = spyPlays(m);
      for (const [bid, x] of [['beanPatch', 1080], ...more]) m.battle.addBuilding(bid, 'red', x, 1);
      const bot = redBot(m, hand, { skill });
      run(m, [bot], 2, () => {
        m.sides.blue.mana = 0; // (blue plays nothing)
        return !bot.log.length;
      });
      const l = firstPlay(bot);
      assert.ok(l && l.t < 2, `${hand} (skill ${skill}): sat on full mana, ${JSON.stringify(bot.log)}`);
      assertLegal(calls.find((c) => c.team === 'red'), `${hand}`);
      if (l.card === 'bananaPeels' && skill >= 0.6) assert.ok(l.x > WORLD.towerX.red - GUARD.range && l.x < WORLD.towerX.red, `peels at ${l.x.toFixed(0)}`);
      if (more.length) assert.ok(!bot.log.some((p) => CARDS[p.card].kind === 'building'), 'never a 4th building over a fresh one');
    }
  }
});

test('anywhere: Brollies float down onto a lone back line, a tower that is nearly down, or a building, always inside the field', () => {
  // Blue Archers walking up alone: the Brollies land on them
  const m = match(121, DECK, DECK);
  const calls = spyPlays(m);
  const archers = [m.battle.addUnit('archer', 'blue', 480, 0.3), m.battle.addUnit('archer', 'blue', 500, 0.7)];
  const bot = redBot(m, ['brollyBrigade', ...FILLER.slice(0, 3)], { mana: 6 });
  run(m, [bot], 4, () => !bot.log.length);
  const l = firstPlay(bot);
  assert.ok(l && l.card === 'brollyBrigade', `no drop: ${JSON.stringify(bot.log)}`);
  assertLegal(calls[0], 'brollies');
  const at = archers[0].hip.x;
  assert.ok(Math.abs(l.x - at) < 70, `dropped at ${l.x.toFixed(1)}, archers at ${at.toFixed(1)}`);
  run(m, [], 6);
  const landed = m.battle.units.filter((u) => u.team === 'red' && u.type.id === 'brolly' && u.floatT <= 0);
  assert.ok(landed.some((u) => Math.abs(u.hip.x - archers[0].hip.x) < 140), 'no Brolly landed by the archers');
  assert.ok(archers.some((a) => a.hp < a.maxHp), 'the archers were never hit');

  // A blue Guard Tower at 20%: they land 50 px in front of its face
  const f = match(122, DECK, DECK);
  const g = f.battle.towers.find((t) => t.team === 'blue' && t.kind === 'guard');
  g.hp = g.maxHp * 0.2;
  const fin = redBot(f, ['brollyBrigade', ...FILLER.slice(0, 3)], { mana: 4 });
  run(f, [fin], 3, () => !fin.log.length);
  const p = firstPlay(fin);
  assert.ok(p && p.card === 'brollyBrigade' && p.why === 'finish', `${JSON.stringify(fin.log)}`);
  assert.ok(Math.abs(p.x - (g.x + g.w / 2 + 50)) < 60, `dropped at ${p.x.toFixed(1)} for a tower face at ${g.x + g.w / 2}`);

  // A blue Bean Patch: on its near side; nothing to drop on: it keeps the card
  const h = match(123, DECK, DECK);
  const patch = h.battle.addBuilding('beanPatch', 'blue', 450, 1);
  patch.spawn.next = 99; // (no Sprouts to guard it)
  const raid = redBot(h, ['brollyBrigade', ...FILLER.slice(0, 3)], { mana: 6 });
  run(h, [raid], 3, () => !raid.log.length);
  const q = firstPlay(raid);
  assert.ok(q && q.card === 'brollyBrigade', `${JSON.stringify(raid.log)}`);
  assert.ok(Math.abs(q.x - (patch.x + patch.w / 2 + 20)) < 80, `dropped at ${q.x.toFixed(1)}, patch at ${patch.x}`);
  const none = match(124, DECK, DECK);
  const idle = redBot(none, ['brollyBrigade', 'tummyDrummer', 'bubbleWrap', 'bananaPeels'], { mana: 6 });
  run(none, [idle], 4);
  assert.equal(idle.log.length, 0, `played ${JSON.stringify(idle.log)} with nothing to drop on`);
});

test('own side: Bubble Wrap goes on its own push as it meets them (3+ of its beans in the circle), never on the enemy', () => {
  const m = match(131, DECK, DECK);
  const calls = spyPlays(m);
  const push = [m.battle.addUnit('bruiser', 'red', 640, 0.2), ...[0, 1, 2, 3].map((k) => m.battle.addUnit('clubber', 'red', 610 + k * 18, k / 4))];
  m.battle.addUnit('squire', 'blue', 430, 0.5);
  m.battle.addUnit('clubber', 'blue', 420, 0.5);
  const bot = redBot(m, ['bubbleWrap', 'pogoBean', 'tummyDrummer', 'bananaPeels'], { mana: 5 });
  let wrapped = 0;
  let foeWrapped = 0;
  run(m, [bot], 4, (mm) => {
    for (const e of mm.battle.events) if (e.type === 'wrap') e.unit.team === 'red' ? wrapped++ : foeWrapped++;
    return !bot.log.some((l) => l.card === 'bubbleWrap');
  });
  const l = firstPlay(bot, (p) => p.card === 'bubbleWrap');
  assert.ok(l && l.why === 'wrap', `no wrap: ${JSON.stringify(bot.log)}`);
  assertLegal(calls.find((c) => c.id === 'bubbleWrap'));
  assert.ok(wrapped >= 3 && foeWrapped === 0, `wrapped ${wrapped} of ours and ${foeWrapped} of theirs`);
  assert.ok(push.filter((u) => u.wrapHp > 0).length >= 3);

  // Nobody near them yet: no wrap (it waits for the meeting)
  const f = match(132, DECK, DECK);
  for (let k = 0; k < 4; k++) f.battle.addUnit('clubber', 'red', 900 + k * 18, k / 4);
  const calm = redBot(f, ['bubbleWrap', 'pogoBean', 'tummyDrummer', 'bananaPeels'], { mana: 5 });
  run(f, [calm], 1.5);
  assert.ok(!calm.log.some((p) => p.card === 'bubbleWrap'), 'wrapped a push with nothing near it');
});

test('own side: a Tummy Drummer joins a big push from behind; never alone', () => {
  const m = match(141, DECK, DECK);
  [m.battle.addUnit('bruiser', 'red', 700, 0.2), m.battle.addUnit('clubber', 'red', 690, 0.5), m.battle.addUnit('clubber', 'red', 710, 0.8)];
  const bot = redBot(m, ['tummyDrummer', 'pogoBean', 'boingBox', 'bananaPeels'], { mana: 6 });
  run(m, [bot], 3, () => !bot.log.length);
  const l = firstPlay(bot);
  assert.ok(l && l.card === 'tummyDrummer' && l.why === 'support', `${JSON.stringify(bot.log)}`);
  const front = Math.min(...m.battle.units.filter((u) => u.team === 'red' && u.type.id !== 'drummer').map((u) => u.hip.x));
  assert.ok(l.x > front && l.x - front < 260, `drummer at ${l.x.toFixed(1)}, push front at ${front.toFixed(1)}`);

  // Nobody of its own out there: no Drummer sent on its own (only a full-mana leak may spill one)
  const f = match(142, DECK, DECK);
  const lone = redBot(f, ['tummyDrummer', 'pogoBean', 'bubbleWrap', 'bananaPeels'], { mana: 8 });
  run(f, [lone], 3);
  assert.ok(!lone.log.some((p) => p.card === 'tummyDrummer' && p.why !== 'leak'), `drummed for nobody: ${JSON.stringify(lone.log)}`);
  // A push too small to drum for (two Clubbers, under DRUM_PUSH mana): it keeps the Drummer
  for (const seed of [301, 302, 303]) {
    const g = match(seed, DECK, DECK);
    g.battle.addUnit('clubber', 'red', 830, 0.3);
    g.battle.addUnit('clubber', 'red', 850, 0.7);
    const small = redBot(g, ['tummyDrummer', 'pogoBean', 'bubbleWrap', 'bananaPeels'], { mana: 8, seed });
    run(g, [small], 2);
    assert.ok(!small.log.some((p) => p.card === 'tummyDrummer'), `seed ${seed}: drummed for two Clubbers: ${JSON.stringify(small.log)}`);
  }
});

test('lead: a Big Jelly leads its deck\'s pushes: a careful bot waits for its mana rather than pushing with something smaller, then sends it from the back', () => {
  const hand = ['bigJelly', 'clubbers', 'spikers', 'squire'];
  const m = match(145, DECK, DECK);
  const bot = redBot(m, hand, { mana: 6.4 });
  run(m, [bot], 4, () => !bot.log.length);
  const l = firstPlay(bot);
  assert.ok(l && l.card === 'bigJelly' && l.why === 'push', `${JSON.stringify(bot.log)}`);
  assert.ok(l.t >= (CARDS.bigJelly.mana - 6.4) * MANA_TIME - 0.05, `played at ${l.t.toFixed(2)} s, before its mana was there`);
  assert.ok(l.x > WORLD.towerX.red, `jelly at ${l.x.toFixed(1)}: from the back, behind the Guard Tower`);
  // Without it the same bot pushes at once with what it has
  const f = match(145, DECK, DECK);
  const now = redBot(f, ['clubberGang', 'clubbers', 'spikers', 'squire'], { mana: 6.4 });
  run(f, [now], 1, () => !now.log.length);
  const k = firstPlay(now);
  assert.ok(k && k.why === 'push' && k.t < 1, `${JSON.stringify(now.log)}`);
});

test('air: Propeller Pals get an answer that reaches them (Archers or a Netter under them), never a card with no air value', () => {
  for (const [hand, want, seed] of [
    [['clubbers', 'bruiser', 'archers', 'boulder'], 'archers', 151],
    [['clubbers', 'nutcracker', 'netter', 'cheeseWheel'], 'netter', 152],
    [['bigJelly', 'squire', 'arrowRain', 'boingBox'], 'arrowRain', 153],
  ]) {
    const m = match(seed, DECK, [...hand, 'spikers', 'bomb', 'sprouts', 'pogoBean']);
    const calls = spyPlays(m);
    for (let k = 0; k < 3; k++) m.battle.addUnit('copter', 'blue', 860 + k * 24, k / 3);
    const bot = redBot(m, hand, { mana: 4 });
    run(m, [bot], 6, () => !bot.log.length);
    const l = firstPlay(bot);
    assert.ok(l, `${want}: no answer`);
    assert.equal(l.card, want, `answered fliers with ${l.card} (${l.why})`);
    assert.ok(airValue(l.card) > 0);
    assertLegal(calls[0]);
    if (want === 'netter') {
      const lead = Math.max(...m.battle.units.filter((u) => u.team === 'blue').map((u) => u.hip.x));
      assert.ok(Math.abs(l.x - lead) < 150, `netter at ${l.x.toFixed(1)}, fliers at ${lead.toFixed(1)}`);
    }
  }
  // Nothing in hand reaches them: it plays nothing at them, and no push either (it saves up for its Archers)
  for (const seed of [161, 162, 163]) {
    const m = match(seed, DECK, ['clubbers', 'bruiser', 'boulder', 'cheeseWheel', 'archers', 'squire', 'spikers', 'bomb']);
    for (let k = 0; k < 3; k++) m.battle.addUnit('copter', 'blue', 860 + k * 24, k / 3);
    const bot = redBot(m, ['clubbers', 'bruiser', 'boulder', 'cheeseWheel'], { mana: 1, seed });
    run(m, [bot], 1, () => {
      m.sides.red.mana = 1; // (it looks, notices them, can't play yet)
    });
    m.sides.red.mana = 7;
    let n = 0;
    run(m, [bot], 4, () => {
      for (; n < bot.log.length; n++) {
        const l = bot.log[n];
        assert.ok(l.why !== 'defend' && l.why !== 'spell', `answered fliers with ${l.card} (${l.why})`);
        assert.ok(!bot.alarm, `played ${l.card} (${l.why}) with fliers coming and no answer in hand`); // (once the tower has it in hand it may push)
      }
    });
  }
  // A push of its own on its way and fliers coming with no answer in hand: it holds back its support too
  // (holdAir), unless its attention has lapsed or an answer is in hand at the time
  let held = 0;
  for (const seed of [201, 202, 203]) {
    const m = match(seed, DECK, ['clubbers', 'bruiser', 'archers', 'squire', 'spikers', 'bomb', 'boulder', 'cheeseWheel']);
    m.battle.addUnit('bruiser', 'red', 760, 0.3);
    m.battle.addUnit('clubber', 'red', 780, 0.6);
    m.battle.addUnit('clubber', 'red', 790, 0.8);
    for (let k = 0; k < 3; k++) m.battle.addUnit('copter', 'blue', 700 + k * 24, k / 3);
    const bot = redBot(m, ['clubbers', 'squire', 'spikers', 'bomb'], { mana: 8, seed });
    for (let s = 0; s < 3 / DT && m.phase !== 'over'; s++) {
      const hand = m.sides.red.hand.slice();
      const n = bot.log.length;
      bot.update(DT);
      const blind = bot.alarm && m.time >= bot.busyUntil && !hand.some((id) => airValue(id) > 0);
      if (blind) held++;
      for (const l of bot.log.slice(n)) assert.ok(!(blind && l.why === 'support'), `seed ${seed}: supported with ${l.card} at ${l.t.toFixed(2)} s, fliers coming and no answer in hand`);
      m.step();
      m.battle.events.length = 0;
    }
  }
  assert.ok(held > 0, 'the alarm was on with no answer in hand');
});

test('traps: Banana Peels go down in front of an incoming push, inside the tower range, and trip it', () => {
  const m = match(171, DECK, DECK);
  const calls = spyPlays(m);
  const gang = [0, 1, 2, 3].map((k) => m.battle.addUnit('clubber', 'blue', 740 + k * 20, k / 4));
  const bot = redBot(m, ['bananaPeels', 'pogoBean', 'tummyDrummer', 'bubbleWrap'], { mana: 5 });
  let slips = 0;
  let cast = null;
  run(m, [bot], 9, (mm) => {
    for (const e of mm.battle.events) if (e.type === 'slip' && e.unit.team === 'blue') slips++;
    if (!cast && bot.log.length) cast = { l: bot.log[0], lead: Math.max(...gang.filter((u) => u.alive).map((u) => u.hip.x)) };
  });
  assert.ok(cast && cast.l.card === 'bananaPeels', `no peels: ${JSON.stringify(bot.log)}`);
  assertLegal(calls[0]);
  assert.ok(cast.l.x > cast.lead - 40, `peels at ${cast.l.x.toFixed(1)} behind the lead at ${cast.lead.toFixed(1)}`);
  assert.ok(cast.l.x > WORLD.towerX.red - GUARD.range && cast.l.x < WORLD.towerX.red, `peels at ${cast.l.x.toFixed(1)}`);
  assert.ok(slips >= 2, `only ${slips} slips`);

  // No threat on its half: no peels (even with mana to burn)
  const f = match(172, DECK, DECK);
  for (let k = 0; k < 3; k++) f.battle.addUnit('clubber', 'blue', 300 + k * 20, k / 3);
  const calm = redBot(f, ['bananaPeels', 'pogoBean', 'tummyDrummer', 'bubbleWrap'], { mana: 10 });
  run(f, [calm], 3);
  assert.ok(!calm.log.some((p) => p.card === 'bananaPeels'), 'peeled its own side with no threat');
});

test('spells as answers: a Big Sneeze frees a bean from a beak, the Anvil one-shots a Bomb Juggler', () => {
  // A blue Pelican scoops one of red's Archers out from behind its tower
  const m = match(181, DECK, DECK);
  const pel = m.battle.addUnit('pelican', 'blue', 950, 0.5);
  const arch = m.battle.addUnit('archer', 'red', 1200, 0.5);
  run(m, [], 8, () => !pel.holding);
  assert.equal(pel.holding, arch, 'no scoop to rescue from');
  const bot = redBot(m, ['bigSneeze', 'pogoBean', 'tummyDrummer', 'bubbleWrap'], { mana: 3 });
  let freed = false;
  run(m, [bot], 3, (mm) => {
    for (const e of mm.battle.events) if (e.type === 'letGo' && e.victim === arch && e.why === 'sneeze') freed = true;
    return !freed;
  });
  const l = firstPlay(bot);
  assert.ok(l && l.card === 'bigSneeze' && l.why === 'rescue', `${JSON.stringify(bot.log)}`);
  assert.ok(freed, 'the sneeze did not free the archer');

  // A Bomb Juggler walking in: the Anvil lands on it
  const f = match(182, DECK, DECK);
  const jug = f.battle.addUnit('juggler', 'blue', 820, 0.5);
  const anv = redBot(f, ['anvil', 'pogoBean', 'tummyDrummer', 'bubbleWrap'], { mana: 5 });
  run(f, [anv], 6, () => jug.alive);
  const a = firstPlay(anv);
  assert.ok(a && a.card === 'anvil', `${JSON.stringify(anv.log)}`);
  assert.ok(!jug.alive, 'the Juggler survived its anvil');
});

test('structure hunters: a Pogo never rushes into a standing enemy building; with none standing it punishes at the bridge', () => {
  const setup = (seed, withBox) => {
    const m = match(seed, ['clubbers', 'squire', 'archers', 'spikers', 'bomb', 'arrowRain', 'boulder', 'bruiser'], DECK);
    if (withBox) m.battle.addBuilding('boingBox', 'blue', 420, 1);
    const bot = redBot(m, ['pogoBean', 'tummyDrummer', 'bubbleWrap', 'bananaPeels'], { mana: 10 });
    bot.foeMana = 0; // (it just watched blue spend everything)
    bot.foePlayed = m.sides.blue.played;
    return { m, bot };
  };
  const a = setup(191, false);
  run(a.m, [a.bot], 1.5, () => !a.bot.log.length);
  const l = firstPlay(a.bot);
  assert.ok(l && l.card === 'pogoBean' && (l.why === 'punish' || l.why === 'leak'), `${JSON.stringify(a.bot.log)}`);
  assert.ok(l.x <= WORLD.deploy.red[0] + 80, `pogo at ${l.x.toFixed(1)}, not at the bridge`);

  const b = setup(192, true);
  run(b.m, [b.bot], 3);
  assert.ok(!b.bot.log.some((p) => p.card === 'pogoBean'), `pogo into a Boing Box: ${JSON.stringify(b.bot.log)}`);
});

// Decks for the random matches: all 32 cards between them, each with an air answer
function decks(seed) {
  const rng = new Rng(seed);
  const order = CARD_ORDER.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = (rng.next() * (i + 1)) | 0;
    [order[i], order[j]] = [order[j], order[i]];
  }
  const out = [order.slice(0, 8), order.slice(8, 16), order.slice(16, 24), order.slice(24, 32)];
  for (const d of out) {
    if (d.some((id) => AIR_ANSWERS.includes(id))) continue;
    // Swap in an air answer from a deck that has two
    for (const e of out) {
      const k = e.findIndex((id) => AIR_ANSWERS.includes(id));
      if (e !== d && e.filter((id) => AIR_ANSWERS.includes(id)).length > 1) {
        [d[0], e[k]] = [e[k], d[0]];
        break;
      }
    }
  }
  return out;
}

test('random 32-card bot matches: no throw, no NaN, every play legal, every new card played, never an air-less answer to fliers', () => {
  const played = new Set();
  let n = 0;
  for (const [g, skills] of [
    [0, [0.6, 0.6]],
    [1, [0.85, 0.35]],
    [2, [0.6, 0.6]],
  ]) {
    const [d0, d1, d2, d3] = decks(700 + g);
    for (const [blue, red] of [
      [d0, d1],
      [d2, d3],
    ]) {
      const m = match(800 + n, blue, red, 1 + (n % 3));
      const calls = spyPlays(m);
      const bots = TEAMS.map((t, k) => new Bot(m, t, { skill: skills[k], seed: 900 + n * 2 + k }));
      run(m, bots, REGULATION + OVERTIME + 1, (mm) => {
        if (mm.steps % 60) return;
        const b = mm.battle;
        for (const u of b.units) assert.ok(Number.isFinite(u.hp) && u.parts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), `NaN ${u.type.id} at ${mm.time}`);
        for (const t of b.towers) assert.ok(Number.isFinite(t.hp));
      });
      assert.equal(m.phase, 'over');
      assert.ok(calls.length > 15, `only ${calls.length} plays`);
      for (const c of calls) assertLegal(c, `match ${n}`);
      for (const b of bots) {
        for (const l of b.log) {
          played.add(l.card);
          if (l.why === 'defend' && l.air >= 0.5) assert.ok(airValue(l.card) > 0, `answered fliers with ${l.card}`);
        }
        assert.ok(b.stats.full < 25, `${b.team} sat at full mana for ${b.stats.full.toFixed(1)} s`);
      }
      n++;
    }
  }
  const missing = CARD_ORDER.slice(14).filter((id) => !played.has(id));
  assert.ok(missing.length <= 2, `never played: ${missing}`);
});

test("no peeking, new cards too: the other side's hidden hand, queue and mana never change what the bot does; same seed, same plays", () => {
  const [d0] = decks(31);
  const play = (tamper) => {
    const m = match(33, d0, DECK);
    const b = m.battle;
    const bot = new Bot(m, 'blue', { skill: 0.8, seed: 9 });
    // Red never plays a card from its hand here: what it puts on the field is scripted (fliers, a building, a spell,
    // a push), and its secrets get scrambled every step in the tampered run
    const script = [
      [1, () => [0, 1, 2].forEach((k) => b.addUnit('copter', 'red', 820 + k * 24, k / 3))],
      [6, () => b.addBuilding('beanPatch', 'red', 1080, 1)],
      [9, () => castSpell(b, CARDS.shakenSoda, 'red', 600, 1)],
      [12, () => [0, 1, 2, 3].forEach((k) => b.addUnit('clubber', 'red', 800 + k * 20, k / 4))],
      [18, () => b.addUnit('pelican', 'red', 850, 0.5)],
      [24, () => b.addUnit('pogo', 'red', 790, 0.5)],
    ];
    let next = 0;
    run(m, [bot], 40, () => {
      while (next < script.length && m.time >= script[next][0]) script[next++][1]();
      if (!tamper) return;
      const r = m.sides.red;
      r.mana = (m.steps * 7) % 11;
      const all = [...r.hand, ...r.queue].reverse();
      r.hand = all.slice(0, 4);
      r.queue = all.slice(4);
      r.next = r.queue[0];
    });
    return bot.log.map((l) => `${l.t.toFixed(3)}:${l.card}:${l.x.toFixed(2)}`).join(',');
  };
  const honest = play(false);
  assert.ok(honest.split(',').length >= 5, `only ${honest}`);
  assert.equal(play(false), honest, 'not deterministic');
  assert.equal(play(true), honest);
});
