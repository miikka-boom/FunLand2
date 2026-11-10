// The newer units' engine (docs/WOBBLE-WAR-CARDS.md sections 3.2, 3.3, 3.5 and
// the cards in section 4): statuses (shove, wrap, slip, squash, drop slam), the
// air layer and the dive (Propeller Pals), the net (Butterfly Netter), the bite
// (Nutcracker), the toss, bombs and fumbles (Bomb Juggler), Sprouts, and the
// hooks that make every unit treat buildings as structures.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, DT, canTarget } from '../battle/src/sim/battle.js';
import { UNIT_TYPES, AIR_MIN, SHOVE, MAX_JBOMBS } from '../battle/src/sim/unit-types.js';
import { Unit } from '../battle/src/sim/unit.js';
import { segSeg } from '../battle/src/sim/physics.js';
import { SPELLS } from '../battle/src/sim/spells.js';
import { CARDS } from '../battle/src/sim/cards.js';
import { Match, MANA_MAX } from '../battle/src/sim/match.js';
import { WORLD } from '../battle/src/config.js';

/** An arena battle with the four towers (or none), the towers holding fire unless asked. */
function arena(seed = 1, { towers = true, shoot = false } = {}) {
  const b = new Battle(seed, { mode: 'arena' });
  if (towers) {
    for (const team of ['blue', 'red']) {
      b.addTower('castle', team, WORLD.castleX[team]);
      b.addTower('guard', team, WORLD.towerX[team]);
    }
  }
  if (!shoot) for (const t of b.towers) t.cool = 1e9;
  return b;
}

/** Step for `secs`, calling each(i, events of that step) after every step; returns every event. */
function run(b, secs, each = null) {
  const ev = [];
  for (let i = 0; i < Math.round(secs / DT); i++) {
    b.step(DT);
    const step = b.events.splice(0);
    for (const e of step) ev.push(e);
    if (each) each(i, step);
  }
  return ev;
}

const finite = (b) => b.units.every((u) => Number.isFinite(u.hp) && u.parts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));

/** A Propeller Pal already up at cruise height (no drop). */
function pal(b, team, x, lane = 0.5) {
  const u = b.addUnit('copter', team, x, lane);
  for (const p of u.parts) p.teleport(0, -UNIT_TYPES.copter.flying.alt);
  return u;
}

/** A bean that stands there and never swings. */
function dummy(b, id, team, x, lane = 0.5) {
  const u = b.addUnit(id, team, x, lane);
  u.speed = 0;
  u.cooldown = 1e9;
  return u;
}

const hold = (u) => {
  u.cooldown = 1e9; // (keep it from attacking: re-set every step, attacks reset it)
};

// --- statuses ----------------------------------------------------------------------------

test('shove: a second shove within SHOVE.time keeps a quarter of its push and less stun; after that, full again', () => {
  const b = arena(1, { towers: false });
  const u = dummy(b, 'clubber', 'red', 700);
  run(b, 0.5);
  const push = (shove) => {
    for (const p of u.parts) p.setVel(0, 0, DT);
    const c0 = u.conscious;
    u.takeHit(b, { damage: 0, dvx: 300, dvy: 0, x: u.chest.x, y: u.chest.y, stun: 0.5, kind: 'test', shove, spin: 0 });
    return { v: u.hip.vx(DT), stun: c0 - u.conscious };
  };
  const first = push(true);
  assert.ok(u.shoveT > SHOVE.time - 1e-9, 'shoveT set');
  u.conscious = 1;
  const second = push(true);
  assert.ok(Math.abs(second.v - first.v * SHOVE.knock) < 1e-6, `x0.25 push (${second.v} vs ${first.v})`);
  assert.ok(Math.abs(second.stun - first.stun * SHOVE.stun) < 1e-6, 'x0.3 stun');
  // A hit that isn't a shove is never softened, and doesn't refresh the timer
  u.conscious = 1;
  const t0 = u.shoveT;
  const plain = push(false);
  assert.ok(Math.abs(plain.v - first.v) < 1e-6 && u.shoveT === t0);
  run(b, SHOVE.time + 0.1);
  u.conscious = 1;
  const later = push(true);
  assert.ok(Math.abs(later.v - first.v) < 1e-6, 'full strength again once the timer ran out');
});

test('Bubble Wrap: absorbs damage first (wrapPop), halves stun, no fall damage, bounces; ends with wrapEnd', () => {
  const b = arena(2, { towers: false });
  const u = dummy(b, 'clubber', 'blue', 600);
  run(b, 0.5);
  const W = SPELLS.bubbleWrap;
  u.wrapHp = u.wrapMax = W.absorb;
  u.wrapT = W.time;
  b.events.length = 0;
  u.takeHit(b, { damage: 30, dvx: 0, dvy: 0, x: u.chest.x, y: u.chest.y, stun: 0.4, kind: 'test' });
  assert.equal(u.hp, u.maxHp, 'the wrap took it all');
  assert.equal(u.wrapHp, W.absorb - 30);
  assert.ok(Math.abs(1 - u.conscious - 0.4 * W.stunMul) < 1e-9, 'half the stun');
  assert.ok(b.events.some((e) => e.type === 'wrapPop' && e.unit === u && e.left === W.absorb - 30));
  // A club bonk that would floor it: stun 1.0 x 0.5 = only a wobble
  u.conscious = 1;
  u.takeHit(b, { damage: 0, dvx: 0, dvy: 0, x: u.chest.x, y: u.chest.y, stun: 1.0, kind: 'club' });
  assert.ok(u.downT <= 0, 'not knocked down while wrapped');
  // A big fall: bouncy and no damage
  run(b, 0.1);
  assert.equal(u.hip.bounce, W.bounce);
  for (const p of u.parts) p.teleport(0, -250);
  for (const p of u.parts) p.setVel(0, 700, DT);
  const ev = run(b, 1.5);
  assert.ok(ev.some((e) => e.type === 'land' && e.unit === u), 'it landed');
  assert.equal(u.hp, u.maxHp, 'no fall damage');
  // More damage than is left: the rest goes through, the wrap pops
  u.takeHit(b, { damage: 60, dvx: 0, dvy: 0, x: u.chest.x, y: u.chest.y, stun: 0, kind: 'test' });
  assert.equal(u.hp, u.maxHp - 20);
  const end = run(b, 0.1).filter((e) => e.type === 'wrapEnd');
  assert.equal(end.length, 1);
  assert.equal(end[0].popped, true);
  assert.equal(u.hip.bounce, 0.32, 'the normal bounce is back');
  // Time runs out: wrapEnd, not popped
  u.wrapHp = u.wrapMax = W.absorb;
  u.wrapT = 0.2;
  const end2 = run(b, 0.3).filter((e) => e.type === 'wrapEnd');
  assert.deepEqual(end2.map((e) => e.popped), [false]);
});

test('slip: a banana peel floors a bean (feet up), then it is immune until 1.5 s after it gets up; a heavy only skids', () => {
  const b = arena(3, { towers: false });
  const u = dummy(b, 'clubber', 'blue', 600);
  run(b, 0.5);
  const P = SPELLS.bananaPeels;
  b.events.length = 0;
  u.slip(b, { dmgMul: 1.2 });
  assert.ok(b.events.some((e) => e.type === 'slip' && e.unit === u));
  assert.ok(u.foot[0].vy(DT) < -100 && u.head.vx(DT) * u.f < 0, 'feet up, head back');
  assert.ok(Math.abs(u.maxHp - u.hp - P.damage * 1.2) < 1e-9, 'damage at the caster level');
  assert.ok(u.downT > 0, 'knocked down');
  assert.ok(Math.abs(u.slipImmuneT - (u.downT + P.immune)) < 1e-9, 'immune until 1.5 s after it gets up');
  let upAt = null;
  run(b, 4, (i) => {
    if (upAt == null && u.downT <= 0) upAt = i * DT;
    if (upAt != null && i * DT < upAt + P.immune - 0.05) assert.ok(u.slipImmuneT > 0, 'still immune');
  });
  assert.ok(u.slipImmuneT <= 0 && upAt != null);
  // A Brick only skids: no damage, no knockdown, a little wobble
  const brick = dummy(b, 'brick', 'blue', 900);
  run(b, 0.5);
  b.events.length = 0;
  brick.slip(b, { dmgMul: 1 });
  assert.ok(b.events.some((e) => e.type === 'skid' && e.unit === brick));
  assert.ok(!b.events.some((e) => e.type === 'slip'));
  assert.equal(brick.hp, brick.maxHp);
  assert.ok(brick.downT <= 0 && brick.wobbleT > 0 && brick.slipImmuneT > 0);
});

test('drop slam: dropped from a beak, the first hard landing hurts on top of the fall, once', () => {
  const drop = (slam) => {
    const b = arena(4, { towers: false });
    const u = dummy(b, 'archer', 'blue', 600);
    run(b, 0.3);
    for (const p of u.parts) p.teleport(0, -220); // a Pelican's carry height
    if (slam) u.dropSlam = { damage: 25, stun: 0.4 };
    run(b, 1.5);
    const fall = u.maxHp - u.hp;
    for (const p of u.parts) p.teleport(0, -220);
    run(b, 1.5);
    return { u, fall, both: u.maxHp - u.hp };
  };
  const plain = drop(false);
  const slammed = drop(true);
  assert.equal(slammed.u.dropSlam, null);
  assert.ok(Math.abs(slammed.fall - plain.fall - 25) < 1e-6, `the slam on top of the fall (${slammed.fall} vs ${plain.fall})`);
  assert.ok(Math.abs(slammed.both - slammed.fall - (plain.both - plain.fall)) < 1e-6, 'only the first landing slams');
});

// --- the air layer -------------------------------------------------------------------------

test('air: a Propeller Pal holds its cruise height for 10 s (alt 100 +- 10), legs paddling, never a step, every number finite', () => {
  const b = arena(5, { towers: false });
  const u = pal(b, 'blue', 600);
  let lo = Infinity;
  let hi = -Infinity;
  const ev = run(b, 11.5, (i) => {
    if (i * DT < 1.5) return;
    lo = Math.min(lo, u.alt);
    hi = Math.max(hi, u.alt);
    assert.ok(u.air && u.groundF === 1, 'up in the air, standing on its lift');
  });
  assert.ok(lo > 90 && hi < 110, `alt ${lo.toFixed(1)}..${hi.toFixed(1)}`);
  assert.ok(Math.abs(u.hip.x - 600) < 15, `hardly any drift (${(u.hip.x - 600).toFixed(1)} px in 11 s)`);
  assert.ok(!ev.some((e) => e.type === 'step'), 'fliers never plant a foot');
  assert.ok(u.feet.every((f) => !f.plant));
  assert.ok(finite(b));
});

test('air: a dropped Propeller Pal is caught by its propeller (no landing thud, no fall damage), then sets off after its deploy time', () => {
  const b = arena(6);
  const u = b.addUnit('copter', 'blue', 500, 0.5, null, { drop: true });
  assert.ok(b.events.some((e) => e.type === 'drop' && e.unit === u));
  assert.ok(u.alt > 250);
  const x0 = u.hip.x;
  let moved = false;
  const ev = run(b, 3, (i) => {
    if (u.deployT > 0.02 && Math.abs(u.wantVx) > 0) moved = true;
  });
  assert.ok(!moved, 'waits out its deploy time');
  assert.ok(!u.dropping && u.deployT === 0);
  assert.ok(!ev.some((e) => (e.type === 'land' || e.type === 'crash') && e.unit === u), 'it never touches the ground');
  assert.equal(u.hp, u.maxHp);
  assert.ok(Math.abs(u.alt - 100) < 15, `cruising (${u.alt.toFixed(1)})`);
  assert.ok(u.hip.x > x0 + 15, 'set off for the enemy tower');
});

test('air: ground melee never targets or hits a flier high up; Archers and Guard Tower bolts do', () => {
  // A Clubber under a hovering Pal: never picks it, so it marches on
  const b = arena(7);
  const u = pal(b, 'red', 640);
  const c = b.addUnit('clubber', 'blue', 600, 0.5);
  run(b, 4, () => {
    hold(u);
    assert.notEqual(c.target, u);
  });
  assert.equal(u.hp, u.maxHp);
  assert.equal(canTarget(c, u), false);
  // An Archer shoots it
  const b2 = arena(8, { towers: false });
  const u2 = pal(b2, 'red', 900);
  const a = b2.addUnit('archer', 'blue', 640, 0.5);
  let aimed = false;
  run(b2, 6, () => {
    hold(u2);
    if (a.target === u2) aimed = true;
  });
  assert.ok(aimed && canTarget(a, u2) === u2.alive);
  assert.ok(u2.hp < u2.maxHp, 'arrows hit fliers');
  // A Guard Tower bolts it
  const b3 = arena(9, { shoot: true });
  const u3 = pal(b3, 'red', WORLD.towerX.blue + 150);
  run(b3, 3, () => hold(u3));
  assert.ok(u3.hp < u3.maxHp, 'bolts hit fliers');
});

test('air: the melee filter: a swing through a Pal still high enough to be "air" never hurts it; once it is low it does', () => {
  for (const low of [false, true]) {
    const b = arena(10, { towers: false });
    const u = pal(b, 'red', 640);
    u.type = { ...u.type, flying: { alt: low ? 30 : 68, bob: 0 } }; // hover right in the club's path
    const c = b.addUnit('clubber', 'blue', 600, 0.5);
    let swings = 0;
    let closest = Infinity; // how near the club's head came to the Pal's body
    const o = {};
    run(b, 4, () => {
      hold(u);
      c.f = 1;
      c.wantVx = 0;
      if (c.act && c.act.phase === 'strike' && c.tip) {
        segSeg(c.tip.px, c.tip.py, c.tip.x, c.tip.y, u.hip.x, u.hip.y, u.head.x, u.head.y, o);
        closest = Math.min(closest, Math.sqrt(o.d2) - u.R - c.W.tipR);
      }
      if (!c.act && c.downT <= 0 && b.time > 0.8) {
        c.startAttack(b);
        swings++;
      }
    });
    assert.ok(swings >= 3);
    if (low) assert.ok(u.hp < u.maxHp, 'a low flier gets bonked');
    else {
      assert.ok(u.air, 'still in the air layer');
      assert.ok(closest < 0, `the club went right through it (${closest.toFixed(1)})`);
      assert.equal(u.hp, u.maxHp, 'swings pass under a flier in the air layer');
    }
  }
});

test('air: separate never pushes a flier against the ground bean below it', () => {
  const b = arena(11, { towers: false });
  const u = pal(b, 'red', 640);
  const c = dummy(b, 'clubber', 'blue', 640);
  u.thinkT = c.thinkT = 1e9; // no AI: only the physics moves them
  run(b, 1);
  const x0 = [u.hip.x, c.hip.x];
  run(b, 3);
  assert.ok(Math.abs(u.hip.x - x0[0]) < 2 && Math.abs(c.hip.x - x0[1]) < 2, `no shove: ${u.hip.x - x0[0]}, ${c.hip.x - x0[1]}`);
  // (two enemies on the ground in the same spot are pushed apart)
  const g = dummy(b, 'clubber', 'red', 641);
  g.thinkT = 1e9;
  run(b, 1);
  assert.ok(Math.abs(g.hip.x - c.hip.x) > 20);
});

test('air: a dead Pal drops like a stone (lift off), crashes into the dirt, and its cap pops off and flutters down', () => {
  const b = arena(12, { towers: false });
  const u = pal(b, 'red', 640);
  run(b, 1);
  b.events.length = 0;
  u.takeHit(b, { damage: 1e6, dvx: 0, dvy: 0, x: u.chest.x, y: u.chest.y, stun: 1, kind: 'test' });
  assert.ok(b.events.some((e) => e.type === 'propOff' && e.unit === u));
  const cap = b.items.find((it) => it.kind === 'propCap');
  assert.ok(cap, 'a propCap item');
  let down = null;
  let crashes = 0;
  run(b, 3, (i, ev) => {
    if (down == null && u.ground - u.hip.y < 20) down = i * DT;
    for (const e of ev) if (e.type === 'crash' && e.unit === u) crashes++;
  });
  assert.ok(down != null && down < 2, `on the ground after ${down} s`);
  assert.equal(crashes, 1, 'one crash');
  assert.ok(cap.age > 2.5 && cap.a.y < cap.a.ground, 'the cap is still fluttering about');
  run(b, 2);
  assert.ok(cap.a.y > -20 && cap.b.y > -20, 'and down by now');
});

// --- the dive ---------------------------------------------------------------------------

test('dive: a Propeller Pal dive-bonks a Clubber within 3 s; at the bottom of the dive it is low enough for melee to target', () => {
  const b = arena(13, { towers: false });
  const u = pal(b, 'blue', 600);
  const c = dummy(b, 'clubber', 'red', 690);
  let hitAt = null;
  let lowAndTargetable = false;
  const ev = run(b, 3, (i, step) => {
    for (const e of step) if (e.type === 'hit' && e.from === u && hitAt == null) hitAt = i * DT;
    if (u.act && u.act.phase === 'dash' && u.alt < AIR_MIN && !u.air && canTarget(c, u)) lowAndTargetable = true;
  });
  assert.ok(ev.some((e) => e.type === 'dive' && e.unit === u), 'a dive event');
  const hit = ev.find((e) => e.type === 'hit' && e.from === u);
  assert.ok(hit && hit.kind === 'dive' && hit.unit === c, 'bonked the clubber');
  assert.ok(c.hp < c.maxHp);
  assert.ok(lowAndTargetable, 'below AIR_MIN during the dive: a ground target');
  // Back up at cruise height afterwards
  run(b, 1.5, () => hold(u));
  assert.ok(u.alt > 80 && u.lifting());
});

test('dive: Propeller Pals stop at a Guard Tower face and dive at it (spike damage)', () => {
  const b = arena(14);
  const g = b.towers.find((t) => t.team === 'red' && t.kind === 'guard');
  const u = pal(b, 'blue', g.x - 200);
  const ev = run(b, 6);
  assert.ok(g.hp < g.maxHp, 'the tower took dives');
  assert.ok(ev.some((e) => e.type === 'towerHit' && e.from === u && e.kind === 'dive'));
  assert.ok(u.hip.x < g.x - g.w / 2, 'never got past the face');
});

// --- the net ---------------------------------------------------------------------------

test('net: the Netter prefers a flier, scoops it (variant 1), nets it into the dirt within 1 s, and no second liftOff within 3 s', () => {
  const b = arena(15, { towers: false });
  const n = b.addUnit('netter', 'blue', 600, 0.5);
  dummy(b, 'clubber', 'red', 700, 0.5); // a ground bean nearer than the flier
  const u = pal(b, 'red', 780);
  let nettedAt = null;
  let lowAt = null;
  const lifts = [];
  run(b, 9, (i, ev) => {
    hold(u);
    for (const e of ev) {
      if (e.type === 'netted' && e.unit === u && nettedAt == null) nettedAt = i * DT;
      if (e.type === 'liftOff' && e.unit === u) lifts.push(i * DT);
    }
    if (n.act && n.target === u) assert.equal(n.act.variant, 1, 'scoop up at a flier');
    if (nettedAt != null && lowAt == null && u.ground - u.hip.y < 20) lowAt = i * DT;
  });
  assert.ok(nettedAt != null, 'netted');
  assert.ok(lowAt != null && lowAt - nettedAt < 1, `in the dirt ${lowAt - nettedAt} s after the net`);
  for (let k = 1; k < lifts.length; k++) assert.ok(lifts[k] - lifts[k - 1] >= 3, 'net-immune for 3 s');
  // Against a ground bean it swats (variant 0)
  const b2 = arena(16, { towers: false });
  const n2 = b2.addUnit('netter', 'blue', 600, 0.5);
  const c = dummy(b2, 'clubber', 'red', 680);
  const ev = run(b2, 3, () => {
    if (n2.act) assert.equal(n2.act.variant, 0);
  });
  assert.ok(c.hp < c.maxHp && ev.some((e) => e.type === 'hit' && e.kind === 'net' && e.unit === c));
});

test('net: the air payload: damage, lift off and yanked down, net-immune for a while; liftOffT never stacks', () => {
  const b = arena(17, { towers: false });
  const n = b.addUnit('netter', 'blue', 600, 0.5);
  const u = pal(b, 'red', 640);
  b.events.length = 0;
  b.netted(n, u, u.hip.x, u.hip.y);
  const A = UNIT_TYPES.netter.attack.air;
  assert.ok(Math.abs(u.maxHp - u.hp - A.damage) < 1e-9);
  assert.ok(Math.abs(u.liftOffT - A.liftOff) < 1e-9 && u.netImmuneT === A.immune);
  assert.ok(!u.lifting() && u.hip.vy(DT) > 200, 'lift off, yanked down');
  assert.deepEqual(b.events.filter((e) => ['liftOff', 'netted', 'hit'].includes(e.type)).map((e) => e.type), ['liftOff', 'netted', 'hit']);
  // liftOffT never stacks beyond its largest value
  u.liftOff(b, 0.5);
  assert.ok(Math.abs(u.liftOffT - A.liftOff) < 1e-9);
});

// --- the bite ----------------------------------------------------------------------------

test('bite: the Nutcracker crunches a Brick for x1.6, goes straight through a Squire shield, and half on a tower', () => {
  const A = UNIT_TYPES.nutcracker.attack;
  const bite = (foe, foeX = 700) => {
    const b = arena(18, { towers: false });
    const n = b.addUnit('nutcracker', 'blue', 600, 0.5);
    const f = dummy(b, foe, 'red', foeX);
    const hits = run(b, 4).filter((e) => e.type === 'hit' && e.from === n);
    return { f, hits };
  };
  const brick = bite('brick');
  assert.ok(brick.hits.length >= 1 && brick.hits.every((e) => e.kind === 'bite'));
  assert.ok(Math.abs(brick.f.maxHp - brick.f.hp - A.damage * A.vsHeavy * brick.hits.length) < 1e-6, 'x1.6 on a heavy');
  const sq = bite('squire');
  assert.equal(sq.f.f, -1, 'the squire faces the nutcracker, shield up front');
  assert.ok(sq.hits.length >= 1);
  assert.ok(Math.abs(sq.f.maxHp - sq.f.hp - A.damage * sq.hits.length) < 1e-6, 'full damage through the shield');
  const cl = bite('clubber');
  assert.ok(!cl.f.alive, 'a lethal bite');
  // Structures: stone takes half, wood all of it
  const b = arena(19);
  const g = b.towers.find((t) => t.team === 'red' && t.kind === 'guard');
  const box = b.addBuilding('boingBox', 'red', g.x - 120, 1);
  const n = b.addUnit('nutcracker', 'blue', g.x - 220, 0.5);
  const ev = run(b, 9).filter((e) => e.type === 'towerHit' && e.from === n);
  assert.ok(ev.length >= 2);
  for (const e of ev) {
    assert.equal(e.kind, 'bite');
    assert.ok(Math.abs(e.damage - A.damage * (e.tower === box ? 1 : A.vsTower)) < 1e-6, `${e.tower.kind} took ${e.damage}`);
  }
  assert.equal(ev[0].tower, box, 'the building in front first');
});

// --- the toss -----------------------------------------------------------------------------

test('toss: a Bomb Juggler lobs a bomb that bursts within 2.5 s and kills Propeller Pals; never a bow sound; at most 3 in the air', () => {
  const b = arena(20, { towers: false });
  const j = b.addUnit('juggler', 'blue', 500, 0.5);
  const u = pal(b, 'red', 720);
  let thrown = null;
  let burst = null;
  const ev = run(b, 6, (i) => {
    hold(u);
    for (const s of b.shots) assert.equal(s.kind, 'jbomb');
    if (thrown == null && b.shots.length) thrown = i * DT;
    if (thrown != null && burst == null && !b.shots.length) burst = i * DT;
  });
  assert.ok(thrown != null && burst != null && burst - thrown < 2.5, `burst ${burst - thrown} s after the throw`);
  assert.ok(ev.some((e) => e.type === 'juggleToss' && e.unit === j));
  const ex = ev.filter((e) => e.type === 'explode');
  assert.ok(ex.length >= 1 && ex.every((e) => e.small && e.unit === null && e.radius === UNIT_TYPES.juggler.bomb.radius));
  assert.ok(!u.alive, 'two bombs down a Pal');
  assert.ok(!ev.some((e) => e.type === 'bowDraw'));
  // The cap: never more than MAX_JBOMBS of its own in the air
  const b2 = arena(21, { towers: false });
  const j2 = b2.addUnit('juggler', 'blue', 400, 0.5);
  const far = dummy(b2, 'brick', 'red', 620);
  let most = 0;
  run(b2, 8, () => {
    j2.cooldown = 0; // throw as fast as it can
    for (const s of b2.shots) s.age = Math.min(s.age, 0.1); // and keep them in the air
    for (const s of b2.shots) s.y = Math.min(s.y, -300);
    most = Math.max(most, b2.bombsInFlight(j2));
  });
  assert.equal(most, MAX_JBOMBS);
  assert.ok(far.alive);
});

test('toss: a jbomb bounces once, rolls, then goes off its fuse after the first touch; it bursts on an enemy body or wall', () => {
  const X = UNIT_TYPES.juggler.bomb;
  const b = arena(22, { towers: false });
  const j = b.addUnit('juggler', 'blue', 400, 0.5);
  b.shots.push({ kind: 'jbomb', team: 'blue', x: 600, y: -100, vx: 80, vy: 0, r: X.r, age: 0, bounced: false, fuseT: -1, from: j, dmgMul: 1, X, ground: 9 });
  const s = b.shots[0];
  let touch = null;
  let bursts = 0;
  run(b, 2, (i, ev) => {
    if (touch == null && s.bounced) touch = i * DT;
    for (const e of ev) if (e.type === 'explode') bursts++;
  });
  assert.ok(touch != null && !b.shots.includes(s) && bursts === 1);
  // On an enemy wall: it bursts there, and stone takes vsTower of it
  const b2 = arena(23);
  const g = b2.towers.find((t) => t.team === 'red' && t.kind === 'guard');
  const j2 = b2.addUnit('juggler', 'blue', 400, 0.5);
  b2.shots.push({ kind: 'jbomb', team: 'blue', x: g.x - 100, y: -80, vx: 300, vy: 0, r: X.r, age: 0, bounced: false, fuseT: -1, from: j2, dmgMul: 1, X, ground: 9 });
  const ev = run(b2, 1);
  const th = ev.find((e) => e.type === 'towerHit' && e.tower === g);
  assert.ok(th && th.damage <= X.damage * X.vsTower + 1e-9 && th.damage > X.damage * X.vsTower * 0.5);
});

test('fumbles: a knockdown drops exactly 1 bomb at its feet (once per 4 s), death drops 3; they hurt its own side too', () => {
  const b = arena(24, { towers: false });
  const j = dummy(b, 'juggler', 'blue', 600);
  const friend = dummy(b, 'clubber', 'blue', 640);
  run(b, 0.5);
  const fumbles = [];
  const knock = () => j.takeHit(b, { damage: 1, dvx: 0, dvy: 0, x: j.chest.x, y: j.chest.y, stun: 1, kind: 'test' });
  knock();
  let ev = run(b, 0.1);
  for (const e of ev) if (e.type === 'fumble') fumbles.push(e.n);
  assert.deepEqual(fumbles, [1]);
  assert.equal(b.shots.length, 1);
  assert.equal(b.shots[0].from, null, 'nobody owns a fumbled bomb');
  knock(); // too soon: no second fumble
  ev = run(b, 1.5);
  assert.equal(ev.filter((e) => e.type === 'fumble').length, 0);
  assert.ok(ev.some((e) => e.type === 'explode'), 'it went off');
  assert.ok(j.hp < j.maxHp - 1 && friend.hp < friend.maxHp, 'on its own toes, and its friend');
  run(b, 3);
  knock();
  assert.equal(run(b, 0.1).filter((e) => e.type === 'fumble').length, 1, 'after 4 s it can fumble again');
  run(b, 1);
  b.shots.length = 0;
  j.takeHit(b, { damage: 1e6, dvx: 0, dvy: 0, x: j.chest.x, y: j.chest.y, stun: 1, kind: 'test' });
  ev = run(b, DT);
  const f = ev.filter((e) => e.type === 'fumble');
  assert.deepEqual(f.map((e) => e.n), [3]);
  assert.equal(b.shots.length, 3);
  for (const s of b.shots) assert.ok(Math.abs(s.x - j.hip.x) <= UNIT_TYPES.juggler.fumble.spread + 1);
});

// --- Sprouts --------------------------------------------------------------------------------

test('Sprouts: two of them poke an Archer to death; a club bonk sends one cartwheeling', () => {
  const b = arena(25, { towers: false });
  const s = [b.addUnit('sprout', 'blue', 600, 0.3), b.addUnit('sprout', 'blue', 620, 0.7)];
  const a = b.addUnit('archer', 'red', 760, 0.5);
  run(b, 8);
  assert.ok(!a.alive, 'the archer is down');
  assert.ok(s.some((u) => u.alive));
  // A club bonk on a Sprout: a home run
  const b2 = arena(26, { towers: false });
  const sp = dummy(b2, 'sprout', 'red', 700);
  const cl = dummy(b2, 'clubber', 'red', 900);
  run(b2, 0.5);
  sp.takeHit(b2, { damage: 10, dvx: 240, dvy: -500, x: sp.chest.x, y: sp.chest.y, stun: 1, kind: 'club' });
  cl.takeHit(b2, { damage: 10, dvx: 240, dvy: -500, x: cl.chest.x, y: cl.chest.y, stun: 1, kind: 'club' });
  const x0 = [sp.hip.x - 700, cl.hip.x - 900];
  run(b2, 1.5);
  assert.ok(sp.hip.x - 700 - x0[0] > (cl.hip.x - 900 - x0[1]) * 1.3, 'flies much further than a clubber');
});

// --- buildings: the hooks every unit uses ------------------------------------------------------

test('buildings: addBuilding stands one up at once (buildingPlaced); units go for the nearest structure, the Brick too', () => {
  const b = arena(27);
  b.events.length = 0;
  const box = b.addBuilding('boingBox', 'red', 1000, 2);
  assert.ok(box && box.kind === 'building' && box.isTower && box.alive && b.towers.includes(box));
  assert.equal(box.level, 2);
  assert.ok(b.events.some((e) => e.type === 'buildingPlaced' && e.tower === box && e.team === 'red' && e.bid === 'boingBox'));
  assert.equal(b.addBuilding('nope', 'red', 1000), null);
  const c = b.addUnit('clubber', 'blue', 800, 0.5);
  const brick = b.addUnit('brick', 'blue', 780, 0.5);
  const pal1 = pal(b, 'blue', 820);
  assert.equal(b.findArenaTarget(c), box);
  assert.equal(b.findArenaTarget(brick), box);
  assert.equal(b.findArenaTarget(pal1), box);
  // Melee won't chase a bean standing behind an enemy building: the building comes first
  const behind = b.addUnit('archer', 'red', 1060, 0.5);
  assert.equal(b.findArenaTarget(c), box);
  assert.ok(b.towerBetween('red', 800, 1060));
  // ...but a bean in front of it is fair game
  const front = b.addUnit('clubber', 'red', 900, 0.5);
  assert.equal(b.findArenaTarget(c), front);
  assert.ok(behind.alive);
});

test('buildings: walls to enemy bodies, and Archers shoot one from their own range (the tower-range rule is only for real towers)', () => {
  const b = arena(28);
  const box = b.addBuilding('beanPatch', 'red', 1000, 1);
  const c = b.addUnit('clubber', 'blue', 880, 0.5);
  const a = b.addUnit('archer', 'blue', 600, 0.5);
  let minGap = Infinity;
  const ev = run(b, 6, () => {
    for (const p of c.body) minGap = Math.min(minGap, box.x - box.w / 2 - p.x);
  });
  assert.ok(minGap > -c.R, 'the clubber never walked into it');
  assert.ok(ev.some((e) => e.type === 'towerHit' && e.tower === box && e.from === c), 'bonked it');
  assert.ok(ev.some((e) => e.type === 'towerHit' && e.tower === box && e.from === a), 'arrows hit it');
  assert.ok(box.x - box.w / 2 - a.hip.x > a.preferRange - 30, `the archer kept its range (${(box.x - box.w / 2 - a.hip.x).toFixed(0)} vs ${a.preferRange.toFixed(0)})`);
  // Its own side walks straight through
  b.clearTeam('blue');
  const r = b.addUnit('clubber', 'red', 1100, 0.5);
  run(b, 3);
  assert.ok(r.hip.x < box.x - box.w / 2, 'a teammate walked past it');
});

test('separate: a held bean is never pushed (nor pushes) while it is held', () => {
  const b = arena(29, { towers: false });
  const v = dummy(b, 'clubber', 'red', 700);
  const e = dummy(b, 'clubber', 'blue', 700);
  v.held = true;
  run(b, 0.2);
  const x0 = v.hip.x;
  const before = e.hip.x;
  run(b, 1);
  assert.ok(Math.abs(e.hip.x - before) < 2, 'the enemy standing inside it is not shoved');
  v.held = false;
  run(b, 1);
  assert.ok(Math.abs(e.hip.x - v.hip.x) > (e.R + v.R) * 0.9, 'let go: solid again');
  assert.ok(Number.isFinite(x0));
});

// --- the deferred queue and determinism ----------------------------------------------------------

test('spawns mid-step: units stay sorted and no unit runs twice in a step', () => {
  const b = arena(30);
  const calls = new Map();
  const orig = Unit.prototype.control;
  Unit.prototype.control = function (dt, bb) {
    calls.set(this, (calls.get(this) || 0) + 1);
    return orig.call(this, dt, bb);
  };
  try {
    b.addUnit('juggler', 'blue', 600, 0.5);
    for (let i = 0; i < 4; i++) b.addUnit('clubber', 'red', 700 + i * 10, (i * 0.27) % 1);
    for (let k = 0; k < 360; k++) {
      calls.clear();
      if (k % 30 === 0) b.spawn('sprout', 'blue', 560, { pop: [80, -300], deployT: 0.6 });
      for (const u of b.units) if (u.type.id === 'juggler' && u.alive && k % 45 === 0) b.fumble(u, k % 90 === 0);
      b.step(DT);
      for (const [, n] of calls) assert.equal(n, 1, 'each unit moved once');
      for (let i = 1; i < b.units.length; i++) {
        const p = b.units[i - 1];
        const q = b.units[i];
        assert.ok(p.lane < q.lane || (p.lane === q.lane && p.id < q.id), 'sorted back to front');
      }
    }
  } finally {
    Unit.prototype.control = orig;
  }
  assert.ok(finite(b));
});

test('determinism: a scripted match of Sprouts, Propeller Pals, Netters, Jugglers and Nutcrackers replays bit-identically', () => {
  const DECK = ['sprouts', 'propellerPals', 'netter', 'bombJuggler', 'nutcracker', 'archers', 'clubbers', 'boulder'];
  const play = () => {
    const side = { deck: DECK, levels: Object.fromEntries(DECK.map((id, i) => [id, 1 + (i % 3)])), kingLevel: 2 };
    const m = new Match({ seed: 4242, blue: side, red: side });
    const counts = {};
    let k = 0;
    for (let step = 0; step < 40 / DT; step++) {
      if (step % 150 === 0 || step % 150 === 75) {
        const team = step % 150 === 0 ? 'blue' : 'red';
        const s = m.sides[team];
        s.mana = MANA_MAX;
        const i = k % 4;
        const card = CARDS[s.hand[i]];
        const [z0, z1] = m.zone(team);
        const foe = team === 'blue' ? 'red' : 'blue';
        const es = m.battle.units.filter((u) => u.alive && u.team === foe);
        const x = card.kind === 'spell' ? (es.length ? es[k % es.length].hip.x : WORLD.mid) : (z0 + z1) / 2 + ((k * 61) % 200) - 100;
        m.play(team, i, x);
        k++;
      }
      m.step();
      for (const e of m.battle.events) counts[e.type] = (counts[e.type] || 0) + 1;
      m.battle.events.length = 0;
    }
    assert.ok(finite(m.battle));
    const units = m.battle.units.map((u) => `${u.type.id}:${u.hp.toFixed(6)}:${u.hip.x.toFixed(6)}:${u.hip.y.toFixed(6)}`).join('|');
    const towers = m.battle.towers.map((t) => t.hp.toFixed(6)).join();
    return { fp: `${units} / ${towers} / ${JSON.stringify(counts)}`, counts };
  };
  const a = play();
  const b = play();
  assert.equal(a.fp, b.fp);
  for (const k of ['dive', 'juggleToss', 'explode']) assert.ok(a.counts[k] > 0, `${k} happened`);
});
