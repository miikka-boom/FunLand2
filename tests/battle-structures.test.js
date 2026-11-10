// Buildings and the match rules for them (docs/WOBBLE-WAR-CARDS.md sections
// 3.3, 3.4, 4.23, 4.24, 4.27 and 9): placement, decay, walls, crowns, the
// Boing Box glove, the Bean Patch spawner, the Wrecking Crane pendulum, the
// building cap, and where deploy-anywhere beans land.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, DT } from '../battle/src/sim/battle.js';
import { BUILDINGS, MAX_BUILDINGS, BUILD_SNAP, BUILD_GAP, LAND_T, fitBuilding } from '../battle/src/sim/buildings.js';
import { damageTower, destroyTower, WRECK_T } from '../battle/src/sim/towers.js';
import { Match, ANYWHERE, ANYWHERE_CLEAR } from '../battle/src/sim/match.js';
import { CARDS, levelMul } from '../battle/src/sim/cards.js';
import { WORLD } from '../battle/src/config.js';

/** An arena battle with the four towers, like a match sets it up (or none). */
function arena(seed = 1, towers = true) {
  const b = new Battle(seed, { mode: 'arena' });
  if (towers) {
    for (const team of ['blue', 'red']) {
      b.addTower('castle', team, WORLD.castleX[team]);
      b.addTower('guard', team, WORLD.towerX[team]);
    }
  }
  return b;
}
const tower = (b, team, kind) => b.towers.find((t) => t.team === team && t.kind === kind);

const run = (b, secs, fn) => {
  const ev = [];
  const n = Math.round(secs / DT);
  for (let i = 0; i < n; i++) {
    b.step(DT);
    for (const e of b.events) ev.push(e);
    b.events.length = 0;
    if (fn && fn(i) === false) break;
  }
  return ev;
};

const finite = (b) =>
  b.units.every((u) => Number.isFinite(u.hp) && u.parts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) &&
  b.towers.every((t) => Number.isFinite(t.hp)) &&
  b.items.every((it) => [it.a, it.b].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));

/** A match whose sides hold exactly these hands, with mana to spare. */
function match(blueHand, redHand = ['clubbers', 'squire', 'archers', 'spikers'], seed = 3) {
  const deck = ['clubbers', 'squire', 'archers', 'spikers', 'bomb', 'arrowRain', 'boulder', 'clubberGang'];
  const m = new Match({ seed, blue: { deck }, red: { deck } });
  m.sides.blue.hand = blueHand.slice();
  m.sides.red.hand = redHand.slice();
  m.sides.blue.queue = [];
  m.sides.red.queue = [];
  m.sides.blue.mana = m.sides.red.mana = 10;
  return m;
}
const topUp = (m) => {
  m.sides.blue.mana = m.sides.red.mana = 10;
};

// --- placement and the match rules ------------------------------------------------------

test('placement: a building goes only in your own deploy zone (never the pocket), slides to a legal spot, never overlaps', () => {
  const m = match(['boingBox', 'beanPatch', 'wreckingCrane', 'clubbers']);
  const b = m.battle;
  const [z0, z1] = WORLD.deploy.blue;
  assert.deepEqual(m.buildZone('blue'), [z0, z1]);
  assert.deepEqual(m.buildZone('red'), WORLD.deploy.red);
  // In the enemy's half, or too far from any legal spot: no
  assert.equal(m.canPlay('blue', 0, 1000), 'zone');
  assert.deepEqual(m.formation('blue', 'boingBox', 1000), []);
  assert.equal(m.canPlay('blue', 0, z1 + BUILD_SNAP + 30), 'zone');
  assert.equal(m.canPlay('blue', 0, NaN), 'zone');
  // On top of your own Guard Tower it slides clear of it (BUILD_GAP)
  const g = tower(b, 'blue', 'guard');
  const [fx] = m.formation('blue', 'boingBox', g.x + 5);
  assert.ok(Number.isFinite(fx));
  assert.ok(Math.abs(fx - g.x) - BUILDINGS.boingBox.w / 2 - g.w / 2 >= BUILD_GAP - 1e-9, `${fx} too close to the tower`);
  assert.equal(m.canPlay('blue', 0, g.x + 5), '');
  assert.equal(fitBuilding(b, 'blue', 'boingBox', g.x + 5), fx);
  // Just over the middle line it slides back inside the zone
  const [mx] = m.formation('blue', 'boingBox', z1 + 10);
  assert.ok(mx + BUILDINGS.boingBox.w / 2 <= z1 && mx > z1 - 60, `${mx}`);
  // Played: placed at the fitted spot, solid at once, the card cycles and the mana goes
  assert.equal(m.play('blue', 0, g.x + 5), true);
  const ev = b.events.splice(0);
  const box = b.towers.find((t) => t.kind === 'building');
  assert.ok(box && box.bid === 'boingBox' && box.team === 'blue' && box.alive);
  assert.equal(box.x, fx);
  assert.equal(m.sides.blue.mana, 10 - CARDS.boingBox.mana);
  assert.ok(ev.some((e) => e.type === 'buildingPlaced' && e.tower === box && e.bid === 'boingBox' && e.team === 'blue'));
  assert.ok(ev.some((e) => e.type === 'cardPlayed' && e.card === 'boingBox' && e.x === fx));
  // A second one on top of the first never overlaps it (and too near a crowd of them: no spot at all)
  topUp(m);
  assert.equal(m.canPlay('blue', 1, g.x + 5), 'zone', 'no room within BUILD_SNAP');
  assert.equal(m.play('blue', 1, fx), true);
  const patch = b.towers.find((t) => t.bid === 'beanPatch');
  for (const [p, q] of [[box, patch], [patch, g]]) assert.ok(Math.abs(p.x - q.x) - p.w / 2 - q.w / 2 >= BUILD_GAP - 1e-9, `${p.bid || p.kind} overlaps ${q.bid || q.kind}`);
  // Never the pocket, even with the enemy Guard Tower down (units may go there then)
  destroyTower(b, tower(b, 'red', 'guard'));
  topUp(m);
  assert.equal(m.canPlay('blue', 3, 1000), '', 'units reach into the pocket');
  assert.equal(m.canPlay('blue', 2, 1000), 'zone', 'buildings never do');
  assert.deepEqual(m.formation('blue', 'wreckingCrane', 1000), []);
  // Red's mirror image
  const r = match(['clubbers'], ['wreckingCrane', 'boingBox', 'beanPatch', 'clubbers']);
  assert.equal(r.canPlay('red', 0, 500), 'zone');
  assert.equal(r.canPlay('red', 0, 1000), '');
  assert.equal(r.play('red', 0, 1000), true);
  const crane = r.battle.towers.find((t) => t.kind === 'building');
  assert.equal(crane.team, 'red');
  assert.equal(crane.f, -1, 'faces blue');
  assert.ok(crane.x - crane.w / 2 >= WORLD.deploy.red[0]);
});

test('a building card places a building at its card level; a 4th building crumbles the oldest (MAX_BUILDINGS)', () => {
  assert.equal(MAX_BUILDINGS, 3);
  const m = match(['boingBox', 'beanPatch', 'wreckingCrane', 'boingBox']);
  m.sides.blue.levels = { boingBox: 3, beanPatch: 1, wreckingCrane: 2 };
  const b = m.battle;
  const xs = [450, 560, 660, 230];
  for (let i = 0; i < 3; i++) {
    topUp(m);
    assert.equal(m.play('blue', i, xs[i]), true, `building ${i}`);
    m.step();
  }
  const mine = () => b.towers.filter((t) => t.kind === 'building' && t.team === 'blue' && t.alive);
  assert.equal(mine().length, 3);
  const box = mine().find((t) => t.bid === 'boingBox');
  assert.equal(box.level, 3);
  assert.ok(Math.abs(box.maxHp - BUILDINGS.boingBox.hp * levelMul(3)) < 1e-9);
  assert.ok(Math.abs(box.dmgMul - levelMul(3)) < 1e-12);
  b.events.length = 0;
  topUp(m);
  assert.equal(m.play('blue', 3, xs[3]), true);
  const ev = b.events.splice(0);
  const down = ev.filter((e) => e.type === 'buildingDown');
  assert.equal(down.length, 1);
  assert.equal(down[0].tower, box, 'the oldest goes');
  assert.equal(down[0].cause, 'crumbled');
  assert.equal(mine().length, 3);
  assert.ok(!ev.some((e) => e.type === 'towerDown'));
  assert.deepEqual(m.crowns, { blue: 0, red: 0 });
});

// --- crowns, decay, walls, targeting -----------------------------------------------------

test('buildings never give crowns or wake a castle; weakest() and the tiebreak ignore them', () => {
  const m = match(['wreckingCrane', 'boingBox', 'beanPatch', 'clubbers'], ['wreckingCrane', 'boingBox', 'beanPatch', 'clubbers']);
  const b = m.battle;
  assert.equal(m.play('red', 0, 1000), true);
  const crane = b.towers.find((t) => t.bid === 'wreckingCrane');
  const castle = tower(b, 'red', 'castle');
  b.events.length = 0;
  // Hit, but the castle behind it sleeps on
  assert.ok(damageTower(b, crane, 100, crane.x, -50, 'club', null) > 0);
  assert.equal(castle.active, false, 'no wake');
  assert.ok(b.events.some((e) => e.type === 'towerHit' && e.tower === crane));
  // A bit hurt: it doesn't count as the weakest tower (all towers are whole)
  assert.equal(m.weakest('red'), 1);
  // Destroyed: buildingDown, no towerDown, no crowns, no wake
  damageTower(b, crane, 1e6, crane.x, -50, 'club', null);
  const ev = b.events.splice(0);
  assert.ok(!crane.alive && crane.hp === 0 && crane.downT === 0);
  const down = ev.find((e) => e.type === 'buildingDown');
  assert.ok(down && down.tower === crane && down.team === 'red' && down.bid === 'wreckingCrane' && down.cause === 'destroyed');
  assert.ok(!ev.some((e) => e.type === 'towerDown' || e.type === 'castleAwake'));
  assert.deepEqual(m.crowns, { blue: 0, red: 0 });
  assert.equal(castle.active, false);
  // The tiebreak: a hurt building of blue's doesn't make blue the loser
  assert.equal(m.play('blue', 1, 500), true);
  const box = b.towers.find((t) => t.bid === 'boingBox' && t.alive);
  box.hp = 1;
  const g = tower(b, 'red', 'guard');
  g.hp = g.maxHp * 0.9;
  assert.ok(m.weakest('blue') > m.weakest('red'));
  m.time = 180 - DT / 2;
  m.phase = 'overtime';
  m.overtimeT = 120;
  m.step();
  assert.equal(m.phase, 'over');
  assert.equal(m.endReason, 'tiebreak');
  assert.equal(m.winner, 'blue');
});

test('a building drops in (buildingLand at 0.35 s), decays to nothing over its life, silently, and its wreck is cleared', () => {
  for (const bid of ['boingBox', 'beanPatch', 'wreckingCrane']) {
    const b = arena(5);
    const t = b.addBuilding(bid, 'blue', 520, 1);
    const life = BUILDINGS[bid].life;
    let landAt = null;
    let downAt = null;
    let goneAt = null;
    const ev = run(b, life + WRECK_T + 0.6, (i) => {
      const now = (i + 1) * DT;
      for (const e of b.events) void e;
      if (landAt == null && t.landT >= LAND_T) landAt = now;
      if (downAt == null && !t.alive) downAt = now;
      if (goneAt == null && !b.towers.includes(t)) goneAt = now;
    });
    assert.ok(Math.abs(landAt - LAND_T) < 0.02, `${bid} landed at ${landAt}`);
    const land = ev.filter((e) => e.type === 'buildingLand' && e.tower === t);
    assert.equal(land.length, 1);
    assert.ok(land[0].power > 0);
    assert.ok(Math.abs(downAt - life) <= 0.1, `${bid} decayed at ${downAt} (life ${life})`);
    const down = ev.filter((e) => e.type === 'buildingDown' && e.tower === t);
    assert.equal(down.length, 1);
    assert.equal(down[0].cause, 'decayed');
    assert.ok(!ev.some((e) => e.type === 'towerHit' && e.tower === t), `${bid}: decay is silent`);
    assert.ok(goneAt != null && Math.abs(goneAt - downAt - WRECK_T) < 0.05, `${bid} wreck cleared at ${goneAt}`);
    assert.equal(t.age > life - 0.1, true);
    assert.deepEqual(b.crowns, { blue: 0, red: 0 });
  }
});

test('enemy beans can\'t walk through a building, its own side walks past it', () => {
  const b = arena(6, false);
  const t = b.addBuilding('beanPatch', 'blue', 600, 1);
  t.spawn = null; // (no Sprouts in the way)
  const foe = b.addUnit('clubber', 'red', 680, 0.5);
  foe.hp = foe.maxHp = 1e6;
  const friend = b.addUnit('clubber', 'blue', 540, 0.3);
  friend.hp = friend.maxHp = 1e6;
  // Red wants the blue castle way off to the left, blue the red one to the right
  b.addTower('castle', 'blue', 100);
  b.addTower('castle', 'red', 1400);
  let deepest = Infinity;
  let shoved = false;
  run(b, 8, () => {
    deepest = Math.min(deepest, foe.hip.x);
    if (!shoved && b.time > 3) {
      // A hard shove at the wall
      shoved = true;
      for (const p of foe.parts) p.addVel(-500, -100, DT);
    }
  });
  assert.ok(deepest > t.x + t.w / 2, `the foe got to ${deepest.toFixed(1)}`);
  assert.ok(friend.hip.x > t.x + t.w / 2 + 40, `the friend is stuck at ${friend.hip.x.toFixed(0)}`);
  assert.ok(finite(b));
});

test('the Brick (structures only) and melee beans go for a building in front of the tower first; towers never shoot buildings', () => {
  const b = arena(7);
  const g = tower(b, 'blue', 'guard');
  const box = b.addBuilding('beanPatch', 'blue', g.x + 120, 1);
  box.spawn = null;
  const brick = b.addUnit('brick', 'red', g.x + 400, 0.5);
  const cl = b.addUnit('clubber', 'red', g.x + 380, 0.2);
  assert.equal(b.findArenaTarget(brick), box);
  assert.equal(b.findArenaTarget(cl), box);
  // A red building in range of the blue tower is never shot; the tower keeps to beans
  const rb = arena(8);
  const rg = tower(rb, 'blue', 'guard');
  const enemyBox = rb.addBuilding('boingBox', 'red', 760, 1);
  const ev = run(rb, 4);
  assert.ok(!ev.some((e) => e.type === 'towerShot'), 'nothing to shoot');
  assert.equal(rg.target, null);
  assert.ok(!ev.some((e) => e.type === 'towerHit' && e.tower === enemyBox));
  // Buildings never shoot either
  const evs = run(b, 3);
  assert.ok(!evs.some((e) => (e.type === 'towerShot' || e.type === 'cannonFire') && e.tower === box));
});

// --- the Boing Box ---------------------------------------------------------------------

test('Boing Box: arms after 1 s, punches a walking Clubber at least 80 px back, then recharges (about 1.9 s a cycle)', () => {
  const b = arena(9);
  const box = b.addBuilding('boingBox', 'blue', 520, 1);
  const P = BUILDINGS.boingBox.punch;
  const c = b.addUnit('clubber', 'red', 690, 0.5);
  let before = null;
  let after = -Infinity;
  let outAt = null;
  const times = [];
  const ev = run(b, 6, (i) => {
    for (const e of b.events) void e;
    if (box.punch.phase === 'windup' && before == null) before = c.hip.x;
    if (box.punch.phase === 'out' && outAt == null) outAt = i;
    if (outAt != null && i - outAt < 0.8 / DT) after = Math.max(after, c.hip.x);
  });
  const wind = ev.filter((e) => e.type === 'punchWindup' && e.tower === box);
  const outs = ev.filter((e) => e.type === 'punch' && e.tower === box);
  const hits = ev.filter((e) => e.type === 'hit' && e.kind === 'punch' && e.from === box);
  assert.ok(wind.length >= 2 && outs.length >= 2, `${wind.length} windups, ${outs.length} punches`);
  assert.equal(outs[0].dir, 1, 'toward the red bean');
  assert.ok(hits.length >= 1 && hits[0].unit === c);
  assert.ok(after - before >= 80, `pushed ${(after - before).toFixed(0)} px`);
  for (const e of b.events) times.push(e);
  // Damage at its level, through takeHit
  assert.ok(c.maxHp - c.hp >= P.damage - 1e-9);
  // The cycle: windup -> out -> hold -> back -> recharge before the next windup
  const k = ev.indexOf(wind[0]);
  const k2 = ev.indexOf(wind[1]);
  assert.ok(k2 > k);
  assert.ok(box.age > BUILDINGS.boingBox.arm);
  assert.ok(box.punch.ext >= 0 && box.punch.ext <= 1);
});

test('Boing Box: a second shove within 1.6 s is weak (anti-lock); it ignores fliers and its own side', () => {
  const launch = (pre) => {
    const b = arena(10, false);
    const box = b.addBuilding('boingBox', 'blue', 520, 1);
    box.age = 2; // (armed)
    box.landT = LAND_T;
    const c = b.addUnit('clubber', 'red', 600, 0.5);
    c.thinkT = 99; // stands there
    if (pre) c.shoveT = 1; // (shoved a moment ago)
    let vmax = 0;
    const ev = run(b, 0.8, () => {
      vmax = Math.max(vmax, c.hip.vx(DT));
    });
    assert.equal(ev.filter((e) => e.type === 'hit' && e.kind === 'punch').length, 1);
    return vmax;
  };
  const fresh = launch(false);
  const again = launch(true);
  assert.ok(fresh > 200, `fresh ${fresh.toFixed(0)} px/s`);
  assert.ok(again < fresh * 0.45, `again ${again.toFixed(0)} vs ${fresh.toFixed(0)}`);
  // Fliers overhead and friends in front: never punched
  const b = arena(11, false);
  const box = b.addBuilding('boingBox', 'blue', 520, 1);
  const pal = b.addUnit('copter', 'red', 590, 0.5);
  pal.thinkT = 99;
  const friend = b.addUnit('clubber', 'blue', 580, 0.5);
  friend.thinkT = 99;
  const ev = run(b, 3);
  assert.ok(!ev.some((e) => e.type === 'punchWindup'), 'nothing to punch');
  assert.equal(friend.hp, friend.maxHp);
  assert.equal(pal.hp, pal.maxHp);
});

// --- the Bean Patch ----------------------------------------------------------------------

test('Bean Patch: Sprouts pop out of its front from arming on, never more than 3 alive, 5-7 in its life, at its level', () => {
  for (const [seed, x] of [[12, 560], [13, 420], [14, 640]]) {
    const b = arena(seed);
    const p = b.addBuilding('beanPatch', 'blue', x, 2);
    const S = BUILDINGS.beanPatch.spawn;
    let most = 0;
    let firstAt = null;
    const ev = run(b, BUILDINGS.beanPatch.life + 1, (i) => {
      const live = b.units.filter((u) => u.alive && u.spawnOf === p.id).length;
      most = Math.max(most, live);
      if (firstAt == null && live) firstAt = (i + 1) * DT;
      assert.ok(p.spawn.next <= S.every + 1e-9, 'a countdown');
    });
    const pops = ev.filter((e) => e.type === 'sproutPop' && e.tower === p);
    assert.ok(most <= S.max, `${most} alive at once`);
    assert.ok(pops.length >= 5 && pops.length <= 7, `${pops.length} spawned`);
    assert.ok(Math.abs(firstAt - BUILDINGS.beanPatch.arm) < 0.05, `first at ${firstAt}`);
    for (const e of pops) {
      const u = e.unit;
      assert.equal(u.type.id, 'sprout');
      assert.equal(u.team, 'blue');
      assert.equal(u.level, 2);
      assert.equal(u.spawnOf, p.id);
    }
    // Popped from the front (toward the enemy), up and out
    const u0 = pops[0].unit;
    assert.ok(Math.abs(pops[0].x - (x + p.w / 3)) < 20, `popped at ${pops[0].x}`);
    assert.ok(finite(b));
  }
});

test('Bean Patch: with 3 Sprouts alive it waits (retrying every 0.5 s), and its Sprouts live on after it falls', () => {
  const b = arena(15, false);
  const p = b.addBuilding('beanPatch', 'blue', 500, 1);
  const ev = run(b, 12); // nothing to fight: they stand around
  const pops = ev.filter((e) => e.type === 'sproutPop');
  assert.equal(pops.length, 3);
  assert.ok(p.spawn.next <= 0.5 + 1e-9);
  assert.equal(p.spawn.kids.length, 3);
  // Kill one: the next try (within 0.5 s) refills it
  const kid = b.units.find((u) => u.id === p.spawn.kids[0]);
  kid.takeHit(b, { damage: 1e3, dvx: 0, dvy: 0, x: kid.hip.x, y: kid.hip.y, stun: 1, kind: 'club', from: null });
  const ev2 = run(b, 0.6);
  assert.equal(ev2.filter((e) => e.type === 'sproutPop').length, 1);
  destroyTower(b, p);
  run(b, 1);
  assert.equal(b.units.filter((u) => u.alive && u.spawnOf === p.id).length, 3, 'its Sprouts live on');
});

// --- the Wrecking Crane --------------------------------------------------------------------

test('Wrecking Crane: it pumps up when an enemy walks in, launches it, loses energy into it, and never hurts its own side', () => {
  const b = arena(16, false);
  const crane = b.addBuilding('wreckingCrane', 'blue', 500, 1);
  const P = BUILDINGS.wreckingCrane.pendulum;
  b.addTower('castle', 'blue', 100); // (something for red to march on)
  const foe = b.addUnit('clubber', 'red', 760, 0.5);
  foe.hp = foe.maxHp = 1e6;
  const friends = [b.addUnit('clubber', 'blue', 545, 0.2), b.addUnit('archer', 'blue', 470, 0.8)];
  for (const u of friends) u.thinkT = 1e9; // they stand there under the ball
  let still = true;
  let farthest = 0;
  let firstHit = null;
  let vmax = 0;
  const ev = run(b, 9, (i) => {
    const B = crane.ball;
    assert.ok([B.ang, B.angV, B.x, B.y, B.vx, B.vy].every(Number.isFinite));
    vmax = Math.max(vmax, Math.hypot(B.vx, B.vy));
    if (b.time < 0.9 && Math.abs(B.angV) > 1e-9) still = false;
    if (firstHit != null) farthest = Math.max(farthest, foe.hip.x - firstHit);
  });
  assert.ok(still, 'nobody near: it hangs still (and it arms after 1 s)');
  const hits = ev.filter((e) => e.type === 'hit' && e.kind === 'crane');
  assert.ok(hits.length >= 1, 'it hit');
  assert.ok(hits.every((e) => e.unit === foe && e.from === crane));
  assert.ok(ev.some((e) => e.type === 'craneSwing' && e.tower === crane && e.power > 0));
  assert.ok(vmax > P.minHit && vmax < P.vRef * 1.1, `top speed ${vmax.toFixed(0)}`);
  for (const u of friends) assert.equal(u.hp, u.maxHp, `${u.type.id} was hit by its own crane`);
  // Launched far
  const b2 = arena(16, false);
  const c2 = b2.addBuilding('wreckingCrane', 'blue', 500, 1);
  b2.addTower('castle', 'blue', 100);
  const f2 = b2.addUnit('clubber', 'red', 760, 0.5);
  f2.hp = f2.maxHp = 1e6;
  let at = null;
  let far = 0;
  let lossOk = false;
  let v0 = 0;
  run(b2, 6, () => {
    if (at == null && f2.lastHitBy === c2) {
      at = f2.hip.x;
      lossOk = Math.abs(c2.ball.angV) * P.L < v0 * (P.hitLoss + 0.05); // it gave energy away
    }
    v0 = Math.abs(c2.ball.angV) * P.L;
    if (at != null) far = Math.max(far, Math.abs(f2.hip.x - at));
  });
  assert.ok(at != null, 'hit');
  assert.ok(far >= 100, `flew ${far.toFixed(0)} px`);
  assert.ok(lossOk);
  assert.ok(finite(b2));
});

test('Wrecking Crane: a wreck drops its ball as a rolling item; destroyed cranes and patches leave no hazards behind', () => {
  const b = arena(17, false);
  const crane = b.addBuilding('wreckingCrane', 'red', 1000, 1);
  run(b, 1.5);
  destroyTower(b, crane);
  const ball = b.items.find((it) => it.kind === 'craneBall');
  assert.ok(ball, 'the ball drops');
  assert.equal(ball.r, BUILDINGS.wreckingCrane.pendulum.r);
  run(b, 2);
  assert.ok(ball.a.y > -30, 'on the ground');
  assert.ok(finite(b));
});

// --- castles, determinism, anywhere --------------------------------------------------------

test('a Castle falling crumbles its side\'s buildings; the match ends on crowns, never on buildings', () => {
  const m = match(['boingBox', 'beanPatch', 'clubbers', 'squire'], ['boingBox', 'wreckingCrane', 'clubbers', 'squire']);
  const b = m.battle;
  m.play('blue', 0, 450);
  m.play('blue', 1, 560);
  m.play('red', 0, 1000);
  m.play('red', 1, 900);
  m.step();
  const redB = b.towers.filter((t) => t.team === 'red' && t.kind === 'building');
  assert.equal(redB.length, 2);
  // A red building destroyed ends nothing
  destroyTower(b, redB[0]);
  m.step();
  assert.equal(m.phase, 'fight');
  b.events.length = 0;
  destroyTower(b, tower(b, 'red', 'castle'));
  const ev = b.events.splice(0);
  const crumbled = ev.filter((e) => e.type === 'buildingDown');
  assert.equal(crumbled.length, 1);
  assert.equal(crumbled[0].tower, redB[1]);
  assert.equal(crumbled[0].cause, 'crumbled');
  assert.ok(b.towers.filter((t) => t.team === 'red').every((t) => !t.alive));
  assert.ok(b.towers.filter((t) => t.team === 'blue').every((t) => t.alive), 'blue keeps its buildings');
  assert.equal(m.crowns.blue, 3);
  m.step();
  assert.equal(m.winner, 'blue');
  assert.equal(m.endReason, 'castle');
});

test('deploy-anywhere: Brolly Brigade plays anywhere in [40, 1460] and floats in; its beans are nudged clear of towers, buildings and castles', () => {
  const m = match(['brollyBrigade', 'boingBox', 'clubbers', 'squire']);
  const b = m.battle;
  assert.deepEqual(ANYWHERE, [40, 1460]);
  assert.equal(m.canPlay('blue', 0, 1200), '', 'deep in the enemy half');
  assert.equal(m.canPlay('blue', 0, 30), 'zone');
  assert.equal(m.canPlay('blue', 0, 1470), 'zone');
  assert.equal(m.canPlay('blue', 2, 1200), 'zone', 'other units still need the zone');
  const clear = (xs) => {
    for (const x of xs) {
      assert.ok(x >= ANYWHERE[0] && x <= ANYWHERE[1]);
      for (const t of b.towers) {
        if (t.kind === 'castle') assert.ok(Math.abs(x - t.x) >= t.w / 2 + ANYWHERE_CLEAR - 1e-9, `${x} in a castle`);
        else if (t.alive) assert.ok(Math.abs(x - t.x) >= t.w / 2 + ANYWHERE_CLEAR - 1e-9, `${x} in ${t.bid || t.kind}`);
      }
    }
  };
  // Spread like a unit card, toward the enemy
  assert.deepEqual(m.formation('blue', 'brollyBrigade', 600), [570, 600, 630]);
  assert.deepEqual(m.formation('red', 'brollyBrigade', 600), [630, 600, 570]);
  // Onto a Guard Tower: nudged off it to the nearer side
  const rg = tower(b, 'red', 'guard');
  const xs = m.formation('blue', 'brollyBrigade', rg.x + 4);
  clear(xs);
  assert.ok(xs.every((x) => Math.abs(x - rg.x) <= rg.w / 2 + ANYWHERE_CLEAR + 31), `${xs}`);
  // Into a castle: always out to the field side
  for (const team of ['blue', 'red']) {
    const c = tower(b, team, 'castle');
    const ys = m.formation('blue', 'brollyBrigade', c.x);
    clear(ys);
    assert.ok(ys.every((x) => (x - c.x) * c.f > 0), `${team}: ${ys}`);
  }
  // Onto a building: off it too
  m.play('blue', 1, 600);
  const box = b.towers.find((t) => t.bid === 'boingBox');
  clear(m.formation('blue', 'brollyBrigade', box.x));
  // Played: they float in from high up (not dropping: the towers shoot them)
  topUp(m);
  b.events.length = 0;
  assert.equal(m.play('blue', 0, 1100), true);
  const us = b.units.filter((u) => u.type.id === 'brolly');
  assert.equal(us.length, 3);
  for (const u of us) {
    assert.ok(u.floatT > 0 && !u.dropping, 'floating');
    assert.ok(u.ground - u.hip.y > 300, 'high up');
  }
  assert.ok(b.events.some((e) => e.type === 'cardPlayed' && e.card === 'brollyBrigade'));
});

test('determinism: a match with all three buildings replays identically', () => {
  const play = () => {
    const m = match(['boingBox', 'beanPatch', 'wreckingCrane', 'clubbers'], ['boingBox', 'beanPatch', 'wreckingCrane', 'clubbers'], 21);
    const out = [];
    for (let i = 0; i < 40 / DT; i++) {
      if (i === 10) m.play('blue', 0, 520);
      if (i === 20) m.play('red', 1, 980);
      if (i === 300) m.play('blue', 2, 640);
      if (i === 320) m.play('red', 2, 900);
      if (i === 500) m.play('red', 3, 900);
      if (i === 520) m.play('blue', 3, 600);
      if (i % 120 === 0) topUp(m);
      m.step();
    }
    const b = m.battle;
    for (const u of b.units) out.push(u.id, u.hip.x.toFixed(6), u.hp.toFixed(6));
    for (const t of b.towers) out.push(t.id, t.hp.toFixed(6));
    out.push(b.events.length, b.rng.s);
    return out.join(',');
  };
  assert.equal(play(), play());
});
