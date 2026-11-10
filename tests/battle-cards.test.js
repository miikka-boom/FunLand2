// The 32-card contract (docs/WOBBLE-WAR-CARDS.md sections 1, 4, 5 and 7): the
// card table, its arenas and rarities, every reference a card makes, and a
// smoke test that matches full of the newer cards run clean.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CARD_ORDER, RARITIES, STARTER_DECK, cardById } from '../battle/src/sim/cards.js';
import { UNIT_TYPES, UNIT_ORDER, WEAPONS, AIR_MIN, BEAT } from '../battle/src/sim/unit-types.js';
import { BUILDINGS, BUILDING_TAKES, MAX_BUILDINGS, BUILD_SNAP, BUILD_GAP, makeBuilding, fitBuilding, takesOf } from '../battle/src/sim/buildings.js';
import { SPELLS, castSpell } from '../battle/src/sim/spells.js';
import { TOWER_TAKES } from '../battle/src/sim/towers.js';
import { Battle, DT, MAX_LIVE, canTarget } from '../battle/src/sim/battle.js';
import { Match, MANA_MAX } from '../battle/src/sim/match.js';
import { Bot } from '../battle/src/sim/bot.js';
import { Rng } from '../battle/src/sim/rng.js';
import { WORLD } from '../battle/src/config.js';

const ORIGINAL = ['clubbers', 'squire', 'archers', 'spikers', 'bomb', 'arrowRain', 'boulder', 'clubberGang', 'bruiser', 'brick', 'cheeseWheel', 'bombSquad', 'megaBomb', 'shieldWall'];
const NEWER = ['sprouts', 'bananaPeels', 'propellerPals', 'pogoBean', 'netter', 'bigSneeze', 'shakenSoda', 'bombJuggler', 'boingBox', 'beanPatch', 'anvil', 'nutcracker', 'wreckingCrane', 'brollyBrigade', 'bubbleWrap', 'tummyDrummer', 'pelican', 'bigJelly'];
const NEW_UNITS = ['sprout', 'copter', 'pogo', 'netter', 'juggler', 'nutcracker', 'brolly', 'drummer', 'pelican', 'jelly'];
// Words the original design spec keeps out of every name and text
const AVOID = ['Elixir', 'Princess', 'King Tower', 'Clash', 'Royale', 'Crown Chest', 'Trophy Road', 'Gems'];
const count = (ids, fn) => ids.filter((id) => fn(CARDS[id])).length;

/** An arena battle with the four towers, like a match sets it up. */
function arena(seed = 1) {
  const b = new Battle(seed, { mode: 'arena' });
  for (const team of ['blue', 'red']) {
    b.addTower('castle', team, WORLD.castleX[team]);
    b.addTower('guard', team, WORLD.towerX[team]);
  }
  return b;
}

const finiteUnits = (b) => b.units.every((u) => Number.isFinite(u.hp) && u.parts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
const finiteAll = (b) =>
  finiteUnits(b) &&
  b.towers.every((t) => Number.isFinite(t.hp)) &&
  b.items.every((it) => [it.a, it.b].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) &&
  b.spells.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y)) &&
  b.arrows.every((a) => Number.isFinite(a.x) && Number.isFinite(a.y));

// --- the card table ------------------------------------------------------------------------

test('32 cards in CARD_ORDER: the 14 originals first and unchanged in order, then the 18 newer ones', () => {
  assert.equal(CARD_ORDER.length, 32);
  assert.equal(new Set(CARD_ORDER).size, 32, 'no duplicates');
  assert.deepEqual(Object.keys(CARDS).sort(), CARD_ORDER.slice().sort(), 'CARD_ORDER lists exactly the cards');
  assert.deepEqual(CARD_ORDER.slice(0, 14), ORIGINAL);
  assert.deepEqual(CARD_ORDER.slice(14), NEWER);
  for (const id of CARD_ORDER) {
    assert.equal(CARDS[id].id, id);
    assert.equal(cardById(id), CARDS[id]);
  }
  for (const id of STARTER_DECK) assert.equal(CARDS[id].arena, 0, `${id} in the starter deck is an arena 0 card`);
});

test('arenas: 2 / 3 / 3 / 5 / 5 newer cards, 10 / 6 / 6 / 5 / 5 in all; newer cards by arena then rarity', () => {
  const per = (ids) => [0, 1, 2, 3, 4].map((a) => count(ids, (c) => c.arena === a));
  assert.deepEqual(per(NEWER), [2, 3, 3, 5, 5]);
  assert.deepEqual(per(CARD_ORDER), [10, 6, 6, 5, 5]);
  const rank = { common: 0, rare: 1, epic: 2, legendary: 3 };
  for (let i = 1; i < NEWER.length; i++) {
    const a = CARDS[NEWER[i - 1]];
    const b = CARDS[NEWER[i]];
    assert.ok(a.arena < b.arena || (a.arena === b.arena && rank[a.rarity] <= rank[b.rarity]), `${a.id} before ${b.id}`);
  }
});

test('rarities: a 4th, Legendary (teal); 5 / 5 / 4 / 4 newer, 11 / 9 / 8 / 4 in all; no legendary in arenas 0-1', () => {
  assert.deepEqual(Object.keys(RARITIES), ['common', 'rare', 'epic', 'legendary']);
  assert.deepEqual(RARITIES.legendary, { id: 'legendary', name: 'Legendary', color: '#2fd3c4', dark: '#147a72', glow: '#c8fff8' });
  for (const [k, r] of Object.entries(RARITIES)) {
    assert.equal(r.id, k);
    for (const c of [r.color, r.dark, r.glow]) assert.match(c, /^#[0-9a-f]{6}$/);
  }
  const by = (ids) => ['common', 'rare', 'epic', 'legendary'].map((r) => count(ids, (c) => c.rarity === r));
  assert.deepEqual(by(NEWER), [5, 5, 4, 4]);
  assert.deepEqual(by(CARD_ORDER), [11, 9, 8, 4]);
  for (const id of CARD_ORDER) assert.ok(RARITIES[CARDS[id].rarity], `${id}: known rarity`);
  const legends = CARD_ORDER.filter((id) => CARDS[id].rarity === 'legendary');
  assert.deepEqual(legends, ['bombJuggler', 'wreckingCrane', 'pelican', 'bigJelly']);
  assert.deepEqual(legends.map((id) => CARDS[id].arena), [2, 3, 4, 4]);
});

test('every card is well formed: kind, mana, name, a description of at most 80 characters, no borrowed words', () => {
  for (const id of CARD_ORDER) {
    const c = CARDS[id];
    assert.ok(['unit', 'spell', 'building'].includes(c.kind), `${id}: kind ${c.kind}`);
    assert.ok(Number.isInteger(c.mana) && c.mana >= 1 && c.mana <= 7, `${id}: mana ${c.mana}`);
    assert.ok(Number.isInteger(c.arena) && c.arena >= 0 && c.arena <= 4, `${id}: arena ${c.arena}`);
    assert.ok(typeof c.name === 'string' && c.name.length > 0 && c.name.length <= 18, `${id}: name "${c.name}"`);
    assert.ok(typeof c.desc === 'string' && c.desc.length > 0 && c.desc.length <= 80, `${id}: desc is ${c.desc.length} characters`);
    for (const w of AVOID) {
      assert.ok(!c.name.toLowerCase().includes(w.toLowerCase()), `${id}: name uses "${w}"`);
      assert.ok(!c.desc.toLowerCase().includes(w.toLowerCase()), `${id}: desc uses "${w}"`);
    }
    if (c.kind === 'unit') {
      assert.ok(Number.isInteger(c.count) && c.count >= 1, `${id}: count`);
      if (c.spread) assert.equal(c.spread.length, c.count, `${id}: one spread offset per bean`);
    }
  }
  for (const id of UNIT_ORDER) for (const w of AVOID) assert.ok(!`${UNIT_TYPES[id].name} ${UNIT_TYPES[id].blurb}`.includes(w), `${id} uses "${w}"`);
  for (const [id, d] of Object.entries(BUILDINGS)) for (const w of AVOID) assert.ok(!d.name.includes(w), `${id} uses "${w}"`);
  // The newer cards' mana: 1 to 7, 3.61 on average (balance: the Big Jelly went to 7, the Tummy Drummer
  // and the Bean Patch to 3)
  const mana = NEWER.map((id) => CARDS[id].mana);
  assert.equal(Math.min(...mana), 1);
  assert.equal(Math.max(...mana), 7);
  assert.equal((mana.reduce((a, b) => a + b, 0) / mana.length).toFixed(2), '3.61');
});

test('every unit, spell and building a card names exists, and casting each spell works', () => {
  const b = arena(5);
  for (const id of CARD_ORDER) {
    const c = CARDS[id];
    if (c.kind === 'unit') {
      assert.ok(Object.prototype.hasOwnProperty.call(UNIT_TYPES, c.unit), `${id}: unit ${c.unit}`);
      assert.ok(UNIT_ORDER.includes(c.unit), `${id}: ${c.unit} in UNIT_ORDER`);
    } else if (c.kind === 'building') {
      assert.ok(Object.prototype.hasOwnProperty.call(BUILDINGS, c.building), `${id}: building ${c.building}`);
    } else {
      assert.ok(c.radius > 0, `${id}: radius`);
      const s = castSpell(b, c, 'blue', 900, 1);
      assert.ok(s && typeof s.kind === 'string', `${id}: castSpell made an entity`);
      assert.ok(b.spells.includes(s));
    }
  }
  // The newer spells: their tuning and entity kinds
  const kinds = { bananaPeels: 'peels', bigSneeze: 'sneeze', shakenSoda: 'soda', anvil: 'anvil', bubbleWrap: 'wrap' };
  for (const [id, kind] of Object.entries(kinds)) {
    assert.ok(SPELLS[id], `SPELLS.${id}`);
    const s = b.spells.find((x) => x.card === id);
    assert.equal(s.kind, kind);
    assert.equal(s.team, 'blue');
  }
  assert.equal(SPELLS.bananaPeels.peels, 5);
  assert.equal(SPELLS.anvil.damage, 310);
  assert.equal(SPELLS.bubbleWrap.absorb, 85); // (70 in the contract; balance)
  // Every spell entity runs its course and goes away without throwing
  for (let i = 0; i < 12 / DT; i++) b.step(DT);
  assert.equal(b.spells.length, 0);
  assert.ok(finiteAll(b));
});

test('the newer unit types: data as in the contract, in UNIT_ORDER, with real weapons and shapes', () => {
  assert.deepEqual(UNIT_ORDER.slice(8), NEW_UNITS);
  assert.equal(new Set(UNIT_ORDER).size, UNIT_ORDER.length);
  assert.deepEqual(Object.keys(UNIT_TYPES).sort(), UNIT_ORDER.slice().sort());
  assert.equal(AIR_MIN, 60);
  assert.deepEqual(BEAT, { tempo: 1.5, move: 1.5 }); // (1.3 in the contract; balance)
  assert.deepEqual(WEAPONS.pogo, { len: 34, tipMass: 0.5, tipR: 3, grip: 8, react: 0.2 });
  assert.deepEqual(WEAPONS.net, { len: 50, tipMass: 0.45, tipR: 13, grip: 10, react: 0.4 });
  assert.deepEqual(WEAPONS.brolly, { len: 34, tipMass: 0.35, tipR: 4, grip: 0, react: 0.4 });
  for (const id of UNIT_ORDER) {
    const t = UNIT_TYPES[id];
    assert.equal(t.id, id);
    assert.ok(WEAPONS[t.weapon], `${id}: weapon ${t.weapon}`);
    assert.ok(['bean', 'brick', 'triangle', 'ball', 'bird', 'jelly'].includes(t.shape), `${id}: shape ${t.shape}`);
    assert.ok(t.hp > 0 && t.radius > 0 && t.bodyLen > 0 && t.speed > 0 && t.cost > 0, `${id}: stats`);
    assert.ok(t.poses && t.poses.rest && t.poses.cheer, `${id}: rest and cheer poses`);
  }
  // Flags the rest of the game reads
  assert.deepEqual(UNIT_ORDER.filter((id) => UNIT_TYPES[id].flying), ['copter', 'pelican']);
  assert.deepEqual(UNIT_ORDER.filter((id) => UNIT_TYPES[id].hitsAir), ['archer', 'netter', 'juggler']);
  assert.deepEqual(UNIT_ORDER.filter((id) => UNIT_TYPES[id].noHat), ['sprout', 'copter', 'nutcracker', 'pelican']);
  assert.deepEqual(UNIT_ORDER.filter((id) => UNIT_TYPES[id].targets), ['brick', 'pogo']);
  for (const id of ['brick', 'pogo']) assert.equal(UNIT_TYPES[id].targets, 'structures');
  assert.equal(UNIT_TYPES.netter.airReach, 130);
  assert.equal(UNIT_TYPES.copter.flying.alt, 100);
  assert.equal(UNIT_TYPES.pelican.flying.alt, 200); // (160 in the first draft: it hit a Guard Tower's roof edge in the near lanes)
  assert.equal(UNIT_TYPES.jelly.spine, 0.15);
  // Liftable (mass <= 1) and heavy (mass >= 3) as section 3.6 has them
  const mass = (id) => UNIT_TYPES[id].mass || 1;
  assert.deepEqual(UNIT_ORDER.filter((id) => mass(id) <= 1), ['clubber', 'squire', 'archer', 'spiker', 'bomb', 'sprout', 'copter', 'pogo', 'netter', 'juggler', 'brolly', 'drummer']);
  assert.deepEqual(UNIT_ORDER.filter((id) => mass(id) >= 3), ['brick', 'jelly']);
  // Card flags
  assert.deepEqual(CARD_ORDER.filter((id) => CARDS[id].flying), ['propellerPals', 'pelican']);
  assert.deepEqual(CARD_ORDER.filter((id) => CARDS[id].anywhere), ['brollyBrigade']);
  assert.deepEqual(CARD_ORDER.filter((id) => CARDS[id].kind === 'building'), ['boingBox', 'beanPatch', 'wreckingCrane']);
  assert.equal(CARDS.brick.desc, 'A giant block with a hammer. Ignores beans, marches on towers and buildings.');
});

// --- buildings (the data and the helpers that exist so far) --------------------------------

test('buildings: constants, a building is a wooden Tower, and fitBuilding finds a legal spot', () => {
  assert.deepEqual(Object.keys(BUILDINGS), ['boingBox', 'beanPatch', 'wreckingCrane']);
  assert.deepEqual(BUILDING_TAKES, { melee: 1, spike: 1, arrow: 1, blast: 0.75, quake: 0.75, spell: 0.75 });
  assert.deepEqual([MAX_BUILDINGS, BUILD_SNAP, BUILD_GAP], [3, 80, 12]);
  const b = arena(6);
  const crane = makeBuilding('wreckingCrane', 'red', 1000, 3, 77);
  assert.equal(crane.kind, 'building');
  assert.equal(crane.bid, 'wreckingCrane');
  assert.equal(crane.def, BUILDINGS.wreckingCrane);
  assert.ok(crane.isTower && crane.building && crane.active && crane.alive);
  assert.deepEqual([crane.id, crane.team, crane.f, crane.w, crane.h, crane.range, crane.age, crane.landT], [77, 'red', -1, 36, 170, 0, 0, 0]);
  assert.ok(Math.abs(crane.hp - BUILDINGS.wreckingCrane.hp * 1.21) < 1e-9 && crane.maxHp === crane.hp, 'health follows the card level');
  assert.ok(Math.abs(crane.ball.y - -45) < 1e-9 && crane.ball.x === 1000 - 34, 'the ball hangs at chest height in front of the mast');
  assert.deepEqual(makeBuilding('boingBox', 'blue', 500, 1, 1).punch, { phase: 'idle', t: 0, ext: 0, dir: 1 });
  assert.deepEqual(makeBuilding('beanPatch', 'blue', 500, 1, 2).spawn, { next: 1, kids: [] });
  assert.equal(makeBuilding('toString', 'blue', 500, 1, 3), null);
  // What a structure takes: stone by TOWER_TAKES (or the source's override), wood by BUILDING_TAKES
  const guard = b.towers.find((t) => t.kind === 'guard');
  for (const k of Object.keys(TOWER_TAKES)) {
    assert.equal(takesOf(guard, k), TOWER_TAKES[k]);
    assert.equal(takesOf(crane, k), BUILDING_TAKES[k]);
    assert.equal(takesOf(crane, k, 1), BUILDING_TAKES[k], 'overrides are for stone only');
  }
  assert.equal(takesOf(guard, 'blast', 1), 1);
  assert.equal(takesOf(guard, 'bite'), 1);
  // fitBuilding: inside its own deploy zone (never the pocket), clear of every standing structure
  const [z0, z1] = WORLD.deploy.blue;
  assert.equal(fitBuilding(b, 'blue', 'boingBox', 520), 520);
  const nearGuard = fitBuilding(b, 'blue', 'boingBox', WORLD.towerX.blue + 10);
  assert.ok(Math.abs(nearGuard - WORLD.towerX.blue) >= 32 + 23 + BUILD_GAP, 'slides clear of its own Guard Tower');
  assert.ok(Math.abs(nearGuard - (WORLD.towerX.blue + 10)) <= BUILD_SNAP);
  assert.equal(fitBuilding(b, 'blue', 'boingBox', z1 + 5), z1 - 23, 'pulled back inside the zone');
  assert.equal(fitBuilding(b, 'blue', 'boingBox', 1000), null, 'never on the other half');
  assert.equal(fitBuilding(b, 'blue', 'boingBox', z0), null, 'no room next to the castle');
  assert.equal(fitBuilding(b, 'red', 'beanPatch', 1000), 1000);
  assert.equal(fitBuilding(b, 'blue', 'nope', 500), null);
  assert.equal(fitBuilding(b, '__proto__', 'boingBox', 500), null);
  b.towers.push(makeBuilding('boingBox', 'blue', 520, 1, 90));
  const next = fitBuilding(b, 'blue', 'beanPatch', 530);
  assert.ok(Math.abs(next - 520) >= 23 + 32 + BUILD_GAP, 'never overlapping another building');
});

// --- engine groundwork ------------------------------------------------------------------------

test('statuses start off without touching the bean rng, and the air and tempo helpers are no-ops on the ground', () => {
  const b = arena(7);
  for (const id of UNIT_ORDER) {
    const u = b.addUnit(id, 'blue', 500, 0.5, 1234);
    for (const k of ['shoveT', 'slipImmuneT', 'liftOffT', 'netImmuneT', 'beatT', 'wrapHp', 'wrapMax', 'wrapT', 'squashT', 'floatT']) assert.equal(u[k], 0, `${id}.${k}`);
    assert.deepEqual([u.flipped, u.held, u.heldBy, u.holding, u.spawnOf, u.dropSlam], [false, false, null, null, null, null]);
    assert.ok(Math.abs(u.alt) < 1e-9, `${id} stands at altitude 0`);
    assert.equal(u.air, false);
    assert.equal(u.tempo(), 1);
    assert.equal(u.moveMul(), 1);
    const [hx, hy] = u.holdPoint();
    assert.ok(Number.isFinite(hx) && Number.isFinite(hy));
    // The same seed draws the same bean as before the new fields existed
    const r = new Rng(1234);
    const size = r.range(0.95, 1.06);
    assert.equal(u.R, UNIT_TYPES[id].radius * size);
  }
  const u = b.addUnit('clubber', 'blue', 600, 0.5);
  u.beatT = 0.6;
  assert.equal(u.tempo(), BEAT.tempo);
  assert.equal(u.moveMul(), BEAT.move);
  for (let i = 0; i < 0.7 / DT; i++) b.step(DT);
  assert.ok(u.beatT <= 0 && u.tempo() === 1, 'status timers count down');
});

test('air and targeting: only hitters of air pick a flier that is high up; nobody picks a held bean', () => {
  const b = arena(8);
  const clubber = b.addUnit('clubber', 'blue', 600, 0.5);
  const archer = b.addUnit('archer', 'blue', 600, 0.5);
  const netter = b.addUnit('netter', 'blue', 600, 0.5);
  const pal = b.addUnit('copter', 'red', 700, 0.5);
  for (const p of pal.parts) p.teleport(0, -100); // 100 px up
  assert.ok(pal.alt > AIR_MIN && pal.air);
  assert.equal(canTarget(clubber, pal), false);
  assert.equal(canTarget(archer, pal), true);
  assert.equal(canTarget(netter, pal), true, 'within the net reach');
  for (const p of pal.parts) p.teleport(0, -150);
  assert.equal(canTarget(netter, pal), false, 'out of the net reach');
  assert.equal(canTarget(archer, pal), true);
  assert.equal(b.findArenaTarget(clubber).isTower, true, 'the clubber walks on to the tower instead');
  assert.equal(b.findArenaTarget(archer), pal);
  // A flier low enough is a ground target for everyone; so is a bean that isn't a flier, at any height
  for (const p of pal.parts) p.teleport(0, 220);
  assert.equal(pal.air, false);
  assert.equal(canTarget(clubber, pal), true);
  const sq = b.addUnit('squire', 'red', 700, 0.5);
  for (const p of sq.parts) p.teleport(0, -200);
  assert.equal(sq.air, false);
  sq.held = true;
  assert.equal(canTarget(archer, sq), false, 'held beans are never targets');
  // The Brick (and the Pogo) only ever want structures
  const brick = b.addUnit('brick', 'blue', 650, 0.5);
  const pogo = b.addUnit('pogo', 'blue', 650, 0.5);
  assert.ok(b.findArenaTarget(brick).isTower);
  assert.ok(b.findArenaTarget(pogo).isTower);
});

test('the deferred queue: later() runs at the end of the step in order; spawn() adds a unit there, capped by MAX_LIVE', () => {
  const b = arena(9);
  const seen = [];
  const n0 = b.units.length;
  b.later(() => seen.push(['a', b.units.length]));
  b.spawn('sprout', 'blue', 500, { level: 2, pop: [150, -340], deployT: 0.6 });
  b.later(() => seen.push(['b', b.units.length]));
  assert.equal(b.units.length, n0, 'nothing happens until the step ends');
  b.step(DT);
  assert.deepEqual(seen, [['a', n0], ['b', n0 + 1]], 'in order, after the step');
  assert.equal(b.pending.length, 0);
  const s = b.units.find((u) => u.type.id === 'sprout');
  assert.equal(s.level, 2);
  assert.equal(s.dropping, false);
  assert.ok(s.deployT > 0.55 && s.deployT <= 0.6);
  assert.ok(s.hip.vx(DT) > 100 && s.hip.vy(DT) < -300, 'popped up and out');
  assert.equal(s.hopAt, -1, 'no battle-cry hop');
  for (let i = 0; i < 3 / DT; i++) b.step(DT);
  assert.equal(s.hp, s.maxHp, 'no fall damage from the pop');
  // A spawner keeps its live kids' ids
  const patch = makeBuilding('beanPatch', 'blue', 400, 1, b.nextId++);
  b.towers.push(patch);
  b.spawn('sprout', 'blue', 420, { from: patch, pop: [0, -200], deployT: 0.6 });
  b.step(DT);
  const kid = b.units.find((u) => u.spawnOf === patch.id);
  assert.ok(kid);
  assert.deepEqual(patch.spawn.kids, [kid.id]);
  assert.ok(b.events.some((e) => e.type === 'sproutPop' && e.tower === patch && e.unit === kid));
  b.removeUnit(kid);
  assert.deepEqual(patch.spawn.kids, []);
  // MAX_LIVE: spawns stop at the cap, cards don't
  const live = () => b.units.filter((u) => u.alive && u.team === 'red').length;
  while (live() < MAX_LIVE) b.addUnit('clubber', 'red', 1300, 0.5);
  b.spawn('sprout', 'red', 1200, {});
  b.step(DT);
  assert.equal(live(), MAX_LIVE);
});

test('blastAt: the bomb blast as a function; with no source nobody is spared', () => {
  const b = arena(10);
  const X = UNIT_TYPES.juggler.bomb;
  const own = b.addUnit('clubber', 'blue', 600, 0.5);
  const foe = b.addUnit('clubber', 'red', 640, 0.5);
  b.events.length = 0;
  b.blastAt(620, own.chest.y, X, 'blue', 1, null, { power: 0.5, small: true });
  const e = b.events.find((x) => x.type === 'explode');
  assert.deepEqual([e.unit, e.power, e.team, e.radius, e.small], [null, 0.5, 'blue', 65, true]);
  assert.ok(foe.hp < foe.maxHp && own.hp < own.maxHp, 'both hit');
  assert.ok(foe.maxHp - foe.hp > (own.maxHp - own.hp) * 3, 'the own side takes only the friendly share');
  // A bomb's own blast goes through blastAt with the bomb as the source
  const bomb = b.addUnit('bomb', 'red', 900, 0.5);
  b.events.length = 0;
  b.explode(bomb);
  const ex = b.events.find((x) => x.type === 'explode');
  assert.deepEqual([ex.unit, ex.power, ex.team, ex.radius, ex.small], [bomb, 1, 'red', UNIT_TYPES.bomb.blast.radius, false]);
  assert.ok(bomb.gone && bomb.exploded);
});

test('hats: noHat types never wear one; a pogo stick bounces; items fade at their own life', () => {
  const b = arena(11);
  b.hats.blue = { all: 'party' };
  for (const id of UNIT_ORDER) {
    const u = b.addUnit(id, 'blue', 500, 0.5);
    assert.equal(u.hat, UNIT_TYPES[id].noHat ? null : 'party', id);
  }
  const pogo = b.addUnit('pogo', 'red', 900, 0.5);
  pogo.takeHit(b, { damage: 1e6, dvx: 0, dvy: -100, x: pogo.hip.x, y: pogo.hip.y, stun: 1, kind: 'test' });
  const stick = b.items.find((it) => it.kind === 'pogo');
  assert.ok(stick && stick.a.bounce === 0.8 && stick.b.bounce === 0.8);
  stick.life = 1;
  for (let i = 0; i < 2.2 / DT; i++) b.step(DT);
  assert.ok(!b.items.includes(stick), 'faded at its own life');
});

// --- smoke: matches full of the newer cards -----------------------------------------------------

/**
 * A scripted side for stress tests: every 1.5 s it tops its mana up (a test
 * only shortcut) and plays the card in hand it has played least, so a minute
 * plays every card of the deck at least twice.
 */
function leastPlayed(m, team) {
  const s = m.sides[team];
  const foe = team === 'blue' ? 'red' : 'blue';
  const n = {};
  let k = 0;
  return (step) => {
    if (step % 180 !== (team === 'blue' ? 0 : 90)) return;
    s.mana = MANA_MAX;
    let i = 0;
    for (let j = 1; j < s.hand.length; j++) if ((n[s.hand[j]] || 0) < (n[s.hand[i]] || 0)) i = j;
    const c = CARDS[s.hand[i]];
    let x;
    if (c.kind === 'spell') {
      const es = m.battle.units.filter((u) => u.alive && u.team === (c.spell === 'bubbleWrap' ? team : foe));
      x = es.length ? es[k % es.length].hip.x : WORLD.mid;
    } else {
      const [z0, z1] = m.zone(team);
      x = (z0 + z1) / 2 + ((k * 97) % 300) - 150;
    }
    k++;
    if (m.play(team, i, x)) n[c.id] = (n[c.id] || 0) + 1;
  };
}

function playNewer(seed, secs) {
  const side = { deck: NEWER, levels: Object.fromEntries(NEWER.map((id, i) => [id, 1 + (i % 3)])), kingLevel: 2 };
  const m = new Match({ seed, blue: side, red: side });
  const players = [leastPlayed(m, 'blue'), leastPlayed(m, 'red')];
  const played = new Set();
  let ok = true;
  for (let step = 0; step < secs / DT; step++) {
    for (const p of players) p(step);
    m.step();
    for (const e of m.battle.events) if (e.type === 'cardPlayed') played.add(`${e.team}:${e.card}`);
    m.battle.events.length = 0;
    if (step % 60 === 0 && !finiteAll(m.battle)) ok = false;
  }
  const fp = [m.time.toFixed(6), m.battle.towers.map((t) => t.hp.toFixed(6)).join(), m.battle.units.map((u) => `${u.type.id}:${u.hp.toFixed(6)}:${u.hip.x.toFixed(6)}`).join('|')].join(' / ');
  return { m, played, ok, fp };
}

test('smoke: both sides play every newer card (topped-up mana) for 60 s, nothing throws, every number stays finite', () => {
  const { m, played, ok } = playNewer(31, 60);
  assert.ok(ok && finiteAll(m.battle));
  for (const team of ['blue', 'red']) for (const id of NEWER) assert.ok(played.has(`${team}:${id}`), `${team} played ${id}`);
});

test('smoke: bots holding every newer card play 60 s without throwing or NaN; the same seed replays the same', () => {
  const run = () => {
    const side = { deck: NEWER, levels: {}, kingLevel: 1 };
    const m = new Match({ seed: 77, blue: side, red: side });
    const bots = [new Bot(m, 'blue', { skill: 0.6, seed: 1 }), new Bot(m, 'red', { skill: 0.7, seed: 2 })];
    for (let s = 0; s < 60 / DT; s++) {
      for (const bot of bots) bot.update(DT);
      m.step();
      m.battle.events.length = 0;
      if (s % 120 === 0) assert.ok(finiteAll(m.battle), `finite at ${s * DT} s`);
    }
    assert.ok(finiteAll(m.battle));
    assert.ok(bots.every((bot) => bot.log.length > 0), 'both bots played');
    return [m.battle.towers.map((t) => t.hp.toFixed(6)).join(), m.battle.units.map((u) => `${u.type.id}:${u.hip.x.toFixed(6)}`).join('|'), ...bots.map((bot) => bot.log.map((l) => l.card).join())].join(' / ');
  };
  assert.equal(run(), run());
  // Scripted plays of every newer card replay identically too
  assert.equal(playNewer(32, 20).fp, playNewer(32, 20).fp);
});

test('each newer unit type stands, walks to the enemy and fights it (or at least squares up) without throwing', () => {
  for (const id of NEW_UNITS) {
    const b = arena(12);
    for (const t of b.towers) t.cool = 1e9;
    const u = b.addUnit(id, 'blue', 560, 0.5, null, { drop: true });
    const foe = b.addUnit('clubber', 'red', 900, 0.5);
    foe.speed = 0;
    foe.cooldown = 1e9;
    // A support unit (the Tummy Drummer) never fights: it marches behind a friend that does
    const lead = UNIT_TYPES[id].follow ? b.addUnit('clubber', 'blue', 640, 0.7) : null;
    const x0 = u.hip.x;
    for (let i = 0; i < 8 / DT; i++) b.step(DT);
    assert.ok(finiteAll(b), `${id}: finite`);
    if (lead) {
      assert.ok(u.hip.x > x0 + 40 && u.hip.x < lead.hip.x, `${id} marched behind its friend (moved ${(u.hip.x - x0).toFixed(1)})`);
      assert.ok(u.target === null && foe.hp < foe.maxHp, `${id} never fights; its friend does`);
    } else assert.ok(u.hip.x > x0 + 40 || foe.hp < foe.maxHp, `${id} went for it (moved ${(u.hip.x - x0).toFixed(1)})`);
  }
});
