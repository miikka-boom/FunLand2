import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, DT, DEPLOY_T, CORPSE_FADE_AT, CORPSE_FADE_T } from '../battle/src/sim/battle.js';
import { GUARD, CASTLE, TOWER_TAKES, damageTower, destroyTower, segRect, rectDist, aimShot, muzzle } from '../battle/src/sim/towers.js';
import { castSpell, SPELLS } from '../battle/src/sim/spells.js';
import { Match, REGULATION, OVERTIME, MANA_START, MANA_MAX, MANA_TIME } from '../battle/src/sim/match.js';
import { CARDS, levelMul } from '../battle/src/sim/cards.js';
import { UNIT_TYPES, UNIT_ORDER } from '../battle/src/sim/unit-types.js';
import { Rng } from '../battle/src/sim/rng.js';
import { WORLD } from '../battle/src/config.js';

const DECK_A = ['clubbers', 'squire', 'archers', 'spikers', 'bomb', 'arrowRain', 'boulder', 'clubberGang'];
const DECK_B = ['bruiser', 'brick', 'archers', 'megaBomb', 'bombSquad', 'cheeseWheel', 'shieldWall', 'spikers'];

/** An arena battle with the four towers, like a match sets it up. */
function arena(seed = 1, level = 1) {
  const b = new Battle(seed, { mode: 'arena' });
  for (const team of ['blue', 'red']) {
    b.addTower('castle', team, WORLD.castleX[team], level);
    b.addTower('guard', team, WORLD.towerX[team], level);
  }
  return b;
}
const tower = (b, team, kind) => b.towers.find((t) => t.team === team && t.kind === kind);

const run = (b, secs, fn) => {
  const ev = [];
  for (let i = 0; i < secs / DT; i++) {
    b.step(DT);
    for (const e of b.events) ev.push(e);
    b.events.length = 0;
    if (fn && fn(i) === false) break;
  }
  return ev;
};

const finite = (b) => b.units.every((u) => u.parts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));

/** A unit that can't be hurt or stopped (to watch what it does to a tower). */
function tank(u) {
  u.hp = u.maxHp = 1e7;
  return u;
}

test('sandbox stays the default; arena starts fighting at once with towers, spells and shots', () => {
  const s = new Battle(1);
  assert.equal(s.mode, 'sandbox');
  assert.equal(s.phase, 'place');
  assert.deepEqual([s.towers.length, s.spells.length, s.shots.length], [0, 0, 0]);
  const b = arena(1);
  assert.equal(b.mode, 'arena');
  assert.equal(b.phase, 'battle');
  assert.equal(b.towers.length, 4);
  const g = tower(b, 'blue', 'guard');
  for (const k of ['id', 'team', 'kind', 'x', 'w', 'h', 'hp', 'maxHp', 'alive', 'active', 'level', 'aim', 'shotT', 'hitT', 'downT']) assert.ok(k in g, `tower.${k}`);
  assert.equal(g.hp, GUARD.hp);
  assert.equal(tower(b, 'red', 'castle').hp, CASTLE.hp);
  assert.equal(g.downT, -1);
  assert.equal(tower(b, 'blue', 'castle').active, false);
  // With no units, nothing happens and nobody wins on unit counts
  run(b, 2);
  assert.equal(b.phase, 'battle');
  assert.equal(b.winner, null);
});

test('tower geometry: segment-box entry, point distance, and ballistic aim that lands on target', () => {
  const h = segRect(0, -50, 100, -50, 40, -100, 60, 0);
  assert.ok(h && Math.abs(h.x - 40) < 1e-9 && Math.abs(h.y + 50) < 1e-9);
  assert.equal(segRect(0, -150, 100, -150, 40, -100, 60, 0), null, 'passes over the top');
  assert.equal(segRect(0, -50, 30, -50, 40, -100, 60, 0), null, 'stops short');
  assert.ok(segRect(50, -50, 55, -40, 40, -100, 60, 0).t === 0, 'starting inside hits at once');
  const t = { x: 100, w: 40, h: 150 };
  assert.equal(rectDist(t, 100, -20), 0);
  assert.equal(rectDist(t, 150, -20), 30);
  assert.equal(rectDist(t, 100, -170), 20);
  // A shot from the tower top lands where it was aimed
  const m = muzzle({ kind: 'guard', x: 0, h: 150, f: 1 });
  for (const [tx, ty, v] of [
    [250, -30, GUARD.boltSpeed],
    [-180, -40, GUARD.boltSpeed],
    [60, -30, CASTLE.shotSpeed],
  ]) {
    const s = aimShot(tx - m.x, ty - m.y, v);
    const T = s.flight;
    const y = m.y + s.vy * T + 0.5 * WORLD.gravity * T * T;
    assert.ok(Math.abs(m.x + s.vx * T - tx) < 1e-6 && Math.abs(y - ty) < 1e-6, `aim at ${tx},${ty}: lands at ${y}`);
    assert.ok(Math.abs(Math.hypot(s.vx, s.vy) - v) < 1e-6);
  }
});

test('towers take damage from clubs, swords, pounces, arrows, blasts and quakes (splash reduced), at unit level', () => {
  const cases = [
    ['clubber', 'club'],
    ['squire', 'sword'],
    ['spiker', 'spike'],
    ['archer', 'arrow'],
    ['bomb', 'blast'],
    ['brick', 'quake'],
    ['bruiser', 'club'],
    ['megabomb', 'blast'],
  ];
  for (const [type, kind] of cases) {
    const b = arena(5);
    const g = tower(b, 'red', 'guard');
    g.cool = 1e9; // it doesn't shoot back
    const u = tank(b.addUnit(type, 'blue', 900, 0.5));
    const ev = run(b, 9);
    const hits = ev.filter((e) => e.type === 'towerHit' && e.tower === g && e.kind === kind);
    assert.ok(hits.length > 0, `${type}: no ${kind} hit on the tower`);
    assert.ok(g.hp < g.maxHp, `${type} did no damage`);
    assert.ok(hits.every((e) => e.from === u || e.from == null));
    // Never inside the wall
    assert.ok(u.hip.x < g.x - g.w / 2 || !b.units.includes(u), `${type} walked into the tower (${u.hip.x})`);
    if (type === 'bomb') {
      // Stone takes reduced splash: at most half a blast
      const dmg = hits.reduce((s, e) => s + e.damage, 0);
      assert.ok(dmg <= UNIT_TYPES.bomb.blast.damage * TOWER_TAKES.blast + 1e-9, `bomb blast ${dmg}`);
    }
    if (type === 'megabomb') assert.ok(hits[0].damage > UNIT_TYPES.megabomb.blast.damage * 0.75, 'a Mega Bomb hurts towers well');
  }
});

test('each melee swing hits a tower once, and a higher card level hits it harder', () => {
  const swing = (level) => {
    const b = arena(7);
    const g = tower(b, 'red', 'guard');
    g.cool = 1e9;
    tank(b.addUnit('clubber', 'blue', 1050, 0.5, 4242, { level }));
    const ev = run(b, 6);
    const hits = ev.filter((e) => e.type === 'towerHit');
    const grunts = ev.filter((e) => e.type === 'grunt').length;
    return { hits, grunts, first: hits[0] && hits[0].damage };
  };
  const a = swing(1);
  const c = swing(3);
  assert.ok(a.hits.length >= 2, `only ${a.hits.length} tower hits`);
  assert.ok(a.hits.length <= a.grunts, `${a.hits.length} hits from ${a.grunts} swings`);
  assert.ok(Math.abs(c.first / a.first - levelMul(3)) < 1e-9, `level 3 hit ${c.first} vs ${a.first}`);
});

test('spells damage towers at a reduced rate and wake a sleeping castle', () => {
  for (const id of ['boulder', 'arrowRain', 'cheeseWheel']) {
    const b = arena(9);
    for (const t of b.towers) t.cool = 1e9;
    const g = tower(b, 'red', 'guard');
    const x = id === 'cheeseWheel' ? g.x - 200 : g.x;
    castSpell(b, CARDS[id], 'blue', x, 1);
    const ev = run(b, 3);
    const dmg = ev.filter((e) => e.type === 'towerHit' && e.tower === g).reduce((s, e) => s + e.damage, 0);
    const full = id === 'boulder' ? SPELLS.boulder.damage : id === 'arrowRain' ? SPELLS.arrowRain.damage * SPELLS.arrowRain.volleys : SPELLS.wheel.damage;
    assert.ok(Math.abs(dmg - full * TOWER_TAKES.spell) < 1e-6, `${id}: ${dmg} vs ${full * TOWER_TAKES.spell}`);
    assert.ok(TOWER_TAKES.spell >= 0.3 && TOWER_TAKES.spell <= 0.6, 'stone shrugs off spells, but a nearly-down tower can be finished with them');
    assert.equal(b.spells.length, 0, `${id} should be over`);
  }
  // A boulder on the sleeping castle wakes it up
  const b = arena(10);
  const c = tower(b, 'red', 'castle');
  castSpell(b, CARDS.boulder, 'blue', c.x, 1);
  const ev = run(b, 2);
  assert.ok(c.active && ev.some((e) => e.type === 'castleAwake' && e.tower === c));
});

test('the Guard Tower shoots crossbow bolts at enemy beans in range, and not at those out of range', () => {
  const g0 = (x) => {
    const b = arena(11);
    const u = tank(b.addUnit('clubber', 'blue', x, 0.5));
    u.speed = 0;
    u.cooldown = 1e9;
    const g = tower(b, 'red', 'guard');
    const ev = run(b, 3);
    return { b, u, g, shots: ev.filter((e) => e.type === 'towerShot' && e.tower === g) };
  };
  const near = g0(WORLD.towerX.red - GUARD.range + 40);
  assert.ok(near.shots.length >= 3, `${near.shots.length} shots`);
  assert.ok(near.u.hp < near.u.maxHp, 'bolts hurt');
  assert.ok(near.u.arrows.length > 0, 'bolts stick in the bean');
  const bolt = near.u.arrows[0];
  assert.equal(bolt.from, near.g); // the tower is the shooter
  assert.ok(Math.abs(Math.cos(near.g.aim)) > 0.2 && Math.cos(near.g.aim) < 0, 'the crossbow aims at the bean (to the left)');
  const far = g0(WORLD.towerX.red - GUARD.range - 40);
  assert.equal(far.shots.length, 0);
  assert.equal(far.u.hp, far.u.maxHp);
  // Bolts are thick: a raised shield stops most, but not all, of one
  const b = arena(12);
  const sq = tank(b.addUnit('squire', 'blue', 950, 0.5));
  sq.speed = 0;
  sq.cooldown = 1e9;
  const ev = run(b, 4);
  assert.ok(ev.some((e) => e.type === 'block' && e.unit === sq));
  assert.ok(sq.hp < sq.maxHp, 'a shield is not tower-proof');
});

test('the Castle sleeps until its Guard Tower falls or it is hit, then lobs cannonballs that hop beans up', () => {
  const b = arena(13);
  const c = tower(b, 'red', 'castle');
  const g = tower(b, 'red', 'guard');
  g.cool = 1e9;
  const us = [tank(b.addUnit('clubber', 'blue', 1240, 0.3)), tank(b.addUnit('squire', 'blue', 1260, 0.7))];
  for (const u of us) {
    u.speed = 0;
    u.cooldown = 1e9;
  }
  let ev = run(b, 3);
  assert.equal(c.active, false);
  assert.ok(!ev.some((e) => e.type === 'cannonFire'), 'asleep: no cannon');
  destroyTower(b, g);
  let up = 0;
  ev = run(b, 4, () => {
    for (const u of us) up = Math.max(up, u.ground - u.hip.y - u.standH);
  });
  assert.equal(c.active, true);
  assert.ok(ev.some((e) => e.type === 'castleAwake' && e.tower === c));
  assert.ok(ev.filter((e) => e.type === 'cannonFire').length >= 2);
  assert.ok(ev.some((e) => e.type === 'cannonHit'));
  assert.ok(us.some((u) => u.hp < u.maxHp), 'cannonballs hurt');
  assert.ok(up > 25, `knock-up only ${up}`);
  assert.equal(b.crowns.blue, 1);
  assert.equal(b.shots.length <= 1, true);
  for (const s of b.shots) for (const k of ['kind', 'team', 'x', 'y', 'vx', 'vy', 'r']) assert.ok(k in s);
});

test('a fallen tower: crowns, rubble you can walk through, and its stuck arrows sink and fade', () => {
  const b = arena(14);
  const g = tower(b, 'red', 'guard');
  g.cool = 1e9;
  for (const x of [880, 900]) tank(b.addUnit('archer', 'blue', x, 0.5));
  run(b, 8);
  assert.ok(g.arrows.length > 0, 'arrows stick in the tower');
  const a = g.arrows[0];
  assert.equal(a.state, 'tower');
  const p0 = b.arrowPose(a);
  assert.ok(Math.abs(p0.x - g.x) < g.w / 2 + 8 && p0.y < 0 && p0.y > -g.h - 8, 'pose on the tower');
  damageTower(b, g, g.hp, g.x, -50, 'test');
  const ev = run(b, 3);
  assert.ok(!g.alive && g.downT > 2.9);
  const down = b.events.find((e) => e.type === 'towerDown') || ev.find((e) => e.type === 'towerDown');
  assert.equal(down.tower, g);
  assert.equal(down.team, 'red');
  assert.equal(down.crowns, 1);
  assert.equal(b.crowns.blue, 1);
  assert.equal(g.arrows.length, 0, 'its arrows are gone');
  assert.ok(!b.arrows.some((x) => x.host === g));
  // Rubble isn't a wall: a blue bean walks through to the castle
  const u = tank(b.addUnit('clubber', 'blue', 1100, 0.5));
  run(b, 4);
  assert.ok(u.hip.x > g.x + g.w / 2, `stopped at ${u.hip.x}`);
});

test('enemy beans never walk through a standing tower, even when shoved at it', () => {
  const b = arena(15);
  const g = tower(b, 'red', 'guard');
  g.cool = 1e9;
  const brick = tank(b.addUnit('brick', 'blue', 1000, 0.5));
  const club = tank(b.addUnit('clubber', 'blue', 1050, 0.2));
  let worst = -Infinity;
  run(b, 6, () => {
    for (const u of [brick, club]) for (const p of [u.hip, u.chest, u.head]) worst = Math.max(worst, p.x + p.r - (g.x - g.w / 2));
  });
  for (const p of club.parts) p.setVel(900, -100, DT); // flung at the wall
  run(b, 2, () => {
    for (const u of [brick, club]) for (const p of [u.hip, u.chest, u.head]) if (p.y + p.r > -g.h) worst = Math.max(worst, p.x + p.r - (g.x - g.w / 2));
  });
  assert.ok(worst < 2, `a body got ${worst} px into the tower`);
  assert.ok(finite(b));
  // Its own team walks right past it
  const r = b.addUnit('clubber', 'red', 1300, 0.5);
  run(b, 4);
  assert.ok(r.hip.x < g.x - g.w / 2 || !r.alive);
});

test('units target enemy beans in sight first, else march on the nearest standing tower; the Brick only wants towers', () => {
  const b = arena(16);
  for (const t of b.towers) t.cool = 1e9;
  const c = b.addUnit('clubber', 'blue', 600, 0.5);
  const br = b.addUnit('brick', 'blue', 620, 0.5);
  const a = b.addUnit('archer', 'blue', 580, 0.5);
  const far = b.addUnit('clubber', 'red', 1000, 0.5); // out of sight for now
  far.speed = 0;
  far.cooldown = 1e9;
  run(b, 0.5);
  assert.equal(c.target, tower(b, 'red', 'guard'));
  assert.equal(br.target, tower(b, 'red', 'guard'));
  assert.equal(a.target, tower(b, 'red', 'guard'));
  run(b, 4);
  assert.equal(c.target, far, 'the clubber turns on the bean once it sees it');
  assert.ok(br.target.isTower, 'the Brick ignores beans');
  // Once the Guard Tower is down, the castle is next
  destroyTower(b, tower(b, 'red', 'guard'));
  far.die(b, null);
  run(b, 0.5);
  assert.equal(br.target, tower(b, 'red', 'castle'));
});

test('archers keep a sensible range and shoot towers in the upper body', () => {
  const b = arena(17);
  const g = tower(b, 'red', 'guard');
  g.cool = 1e9;
  const a = tank(b.addUnit('archer', 'blue', 700, 0.5));
  assert.ok(a.preferRange >= 220 && a.preferRange <= 310, `range ${a.preferRange}`);
  const ev = run(b, 8);
  const hits = ev.filter((e) => e.type === 'towerHit' && e.kind === 'arrow');
  assert.ok(hits.length >= 3, `${hits.length} arrow hits`);
  assert.ok(hits.every((e) => e.y < -g.h * 0.3), 'upper body');
  const d = g.x - g.w / 2 - a.hip.x;
  assert.ok(d > 200 && d < 320, `stands ${d} px from the wall`);
});

test('a dropped unit falls from the sky, lands on its feet without fall damage, yells and then goes', () => {
  for (const type of UNIT_ORDER) {
    if (UNIT_TYPES[type].flying) continue; // fliers hover in (the next test)
    const b = arena(18);
    const u = b.addUnit(type, 'blue', 500, 0.5, null, { drop: true });
    const ev = b.events.splice(0);
    assert.ok(ev.some((e) => e.type === 'drop' && e.unit === u));
    assert.ok(u.ground - u.hip.y > 250, 'starts high up');
    assert.ok(u.deployT > 0.9 && u.deployT <= DEPLOY_T);
    const x0 = u.hip.x;
    let landed = null;
    let moved = false;
    const ev2 = run(b, 2.2, (i) => {
      if (landed == null && u.ground - u.hip.y < u.standH + 10) landed = i * DT;
      if (u.deployT > 0.02 && Math.abs(u.wantVx) > 0) moved = true;
    });
    assert.ok(landed != null && landed < DEPLOY_T, `${type} landed at ${landed}`);
    assert.ok(!moved, `${type} walked before its deploy time was up`);
    assert.ok(ev2.some((e) => e.type === 'land' && e.unit === u), `${type}: no landing thud`);
    assert.equal(u.deployT, 0);
    assert.equal(u.hp, u.maxHp, `${type} took fall damage`);
    // (a Pogo Bean is off hopping by now: it stood when it landed)
    if (!u.type.hop) assert.ok(Math.abs(u.ground - u.hip.y - u.standH) < 12, `${type} not standing (${u.ground - u.hip.y} vs ${u.standH})`);
    const off = u.type.speed >= 44 ? 15 : 10; // (the Big Jelly, at 36 px/s, is slower than anything else)
    // (a Tummy Drummer on its own heads back to wait by its Guard Tower)
    const went = u.type.follow ? Math.abs(u.hip.x - x0) : u.hip.x - x0;
    assert.ok(went > off, `${type} never set off (${u.hip.x - x0})`);
    assert.ok(finite(b));
  }
});

test('a dropped flier (Propeller Pals, Pelican) is caught by its lift: it hovers in at its cruise height, no thud, no fall damage, then goes', () => {
  const fliers = UNIT_ORDER.filter((type) => UNIT_TYPES[type].flying);
  assert.deepEqual(fliers.slice().sort(), ['copter', 'pelican']);
  for (const type of fliers) {
    const b = arena(18);
    const u = b.addUnit(type, 'blue', 500, 0.5, null, { drop: true });
    const ev = b.events.splice(0);
    assert.ok(ev.some((e) => e.type === 'drop' && e.unit === u));
    assert.ok(u.ground - u.hip.y > 250, 'starts high up');
    assert.ok(u.deployT > 0.9 && u.deployT <= DEPLOY_T);
    const x0 = u.hip.x;
    const cruise = u.type.flying.alt;
    let low = Infinity;
    let moved = false;
    const ev2 = run(b, 2.6, (i) => {
      low = Math.min(low, u.alt);
      if (u.deployT > 0.02 && Math.abs(u.wantVx) > 0) moved = true;
    });
    assert.ok(!ev2.some((e) => (e.type === 'land' || e.type === 'crash') && e.unit === u), `${type} hit the ground`);
    assert.ok(low > cruise * 0.3, `${type} sank to ${low.toFixed(0)} px`);
    assert.ok(!moved, `${type} flew off before its deploy time was up`);
    assert.equal(u.deployT, 0);
    assert.equal(u.dropping, false);
    assert.equal(u.hp, u.maxHp, `${type} took fall damage`);
    assert.ok(Math.abs(u.alt - cruise) < 25, `${type} cruises at ${u.alt.toFixed(0)} (wants ${cruise})`);
    assert.ok(u.air, `${type} is high air`);
    assert.ok(u.hip.x > x0 + 15, `${type} never set off (${u.hip.x - x0})`);
    assert.ok(finite(b));
  }
});

test('the Bruiser and the Mega Bomb stand, walk, hit and die like the others, only bigger', () => {
  const s = new Battle(19);
  for (const [i, t] of ['clubber', 'bruiser', 'bomb', 'megabomb'].entries()) s.addUnit(t, 'blue', 300 + i * 100, 0.5);
  run(s, 4);
  const by = Object.fromEntries(s.units.map((u) => [u.type.id, u]));
  for (const u of s.units) {
    assert.ok(Math.abs(u.ground - u.hip.y - u.standH) < 3, `${u.type.id} sagging`);
    assert.ok(Math.abs(Math.atan2(u.head.x - u.hip.x, u.hip.y - u.head.y)) < 0.15, `${u.type.id} leaning`);
  }
  const h = (u) => u.ground - u.head.y + u.R;
  assert.ok(h(by.bruiser) > h(by.clubber) * 1.3 && by.bruiser.W.len > by.clubber.W.len * 1.3, 'the Bruiser is extra large, club too');
  assert.ok(by.megabomb.R > by.bomb.R * 1.5, 'the Mega Bomb is extra large');

  // Bruiser vs a Clubber: big launch, wins
  const b = new Battle(20);
  const br = b.addUnit('bruiser', 'blue', 600, 0.5);
  const cl = b.addUnit('clubber', 'red', 850, 0.5);
  b.start();
  let up = 0;
  const ev = run(b, 20, () => {
    up = Math.max(up, cl.ground - cl.hip.y - cl.standH);
    return b.phase !== 'over';
  });
  assert.ok(ev.some((e) => e.type === 'hit' && e.from === br), 'the Bruiser connects');
  assert.ok(up > 80, `clubber only launched ${up}`);
  assert.equal(b.winner, 'blue');
  assert.ok(finite(b));
  br.die(b, null);
  assert.ok(b.items.some((it) => it.kind === 'club' && it.scale > 1.3), 'drops its big club');

  // Mega Bomb: walks up, a long fuse, a huge blast
  const m = new Battle(21);
  const mb = m.addUnit('megabomb', 'blue', 600, 0.5);
  const reds = [m.addUnit('clubber', 'red', 850, 0.2), m.addUnit('squire', 'red', 880, 0.8), m.addUnit('archer', 'red', 920, 0.5)];
  for (const u of reds) {
    u.speed = 0;
    u.cooldown = 1e9;
  }
  m.start();
  const ev2 = run(m, 12);
  const fuse = ev2.findIndex((e) => e.type === 'fuse');
  const boom = ev2.findIndex((e) => e.type === 'explode');
  assert.ok(fuse >= 0 && boom > fuse);
  assert.ok(mb.gone && !mb.alive);
  assert.ok(reds.filter((u) => !u.alive).length >= 2, 'a huge blast');
  assert.ok(finite(m));
});

test('dead beans fade out after a few seconds and are removed with their arrows, weapons and references', () => {
  const b = arena(22);
  for (const t of b.towers) t.cool = 1e9;
  const a = b.addUnit('archer', 'blue', 700, 0.5);
  const v = b.addUnit('squire', 'red', 960, 0.5);
  v.speed = 0;
  v.cooldown = 1e9;
  v.guardT = 0;
  run(b, 6, () => a.arrows.length + v.arrows.length + v.shieldArrows.length < 1);
  v.die(b, null);
  assert.ok(b.items.length >= 2, 'sword and shield dropped');
  a.target = v;
  run(b, CORPSE_FADE_AT - 0.2);
  assert.equal(v.fade, 1);
  assert.ok(b.units.includes(v));
  run(b, 0.6);
  assert.ok(v.fade < 1 && v.fade > 0, `fade ${v.fade}`);
  run(b, CORPSE_FADE_T);
  assert.ok(!b.units.includes(v), 'removed');
  assert.ok(!b.arrows.some((x) => x.host === v));
  assert.ok(!b.items.some((it) => it.kind === 'sword' || it.kind === 'shield'), 'weapons faded too');
  assert.notEqual(a.target, v);
  // A blown-up bomb leaves nothing behind
  const bm = b.addUnit('bomb', 'red', 900, 0.5);
  b.explode(bm);
  run(b, 0.1);
  assert.ok(!b.units.includes(bm));
});

test('mana: starts at 5, +1 every 2.8 s, double in the last minute and overtime, capped at 10', () => {
  const m = new Match({ seed: 3, blue: { deck: DECK_A }, red: { deck: DECK_B } });
  assert.equal(m.sides.blue.mana, MANA_START);
  const steps = (s) => {
    for (let i = 0; i < Math.round(s / DT); i++) m.step();
  };
  steps(MANA_TIME);
  assert.ok(Math.abs(m.sides.blue.mana - (MANA_START + 1)) < 1e-6, `mana ${m.sides.blue.mana}`);
  steps(30);
  assert.equal(m.sides.red.mana, MANA_MAX);
  // Spend it all, then watch the rate double at 1:00 left
  m.sides.blue.mana = 0;
  steps(REGULATION - 60 - m.time - 2 * MANA_TIME);
  assert.equal(m.doubleMana, false);
  const before = m.sides.blue.mana;
  steps(MANA_TIME);
  assert.ok(Math.abs(m.sides.blue.mana - before - 1) < 1e-3);
  steps(MANA_TIME);
  m.sides.blue.mana = 0;
  m.battle.events.length = 0;
  steps(MANA_TIME);
  assert.ok(m.doubleMana);
  assert.ok(Math.abs(m.sides.blue.mana - 2) < 1e-3, `double mana ${m.sides.blue.mana}`);
  assert.equal(m.timeLeft <= 60, true);
});

test('hand of 4 + next card, shuffled from the seed; a played card goes to the back of the queue', () => {
  const m = new Match({ seed: 5, blue: { deck: DECK_A }, red: { deck: DECK_B } });
  const s = m.sides.blue;
  assert.equal(s.hand.length, 4);
  assert.equal(new Set([...s.hand, ...s.queue]).size, 8);
  assert.deepEqual([...s.hand, ...s.queue].sort(), DECK_A.slice().sort());
  assert.equal(s.next, s.queue[0]);
  const again = new Match({ seed: 5, blue: { deck: DECK_A }, red: { deck: DECK_B } });
  assert.deepEqual(again.sides.blue.hand, s.hand);
  const hands = new Set([1, 2, 3, 4, 6, 7].map((seed) => new Match({ seed, blue: { deck: DECK_A }, red: { deck: DECK_B } }).sides.blue.hand.join()));
  assert.ok(hands.size > 1, 'different seeds deal different hands');
  // Cycle: play slot 1 every time (spells on the enemy guard tower, units at home)
  const seen = [];
  for (let k = 0; k < 8; k++) {
    s.mana = 10;
    const id = s.hand[1];
    const next = s.next;
    const x = CARDS[id].kind === 'spell' ? 1170 : 300;
    assert.equal(m.canPlay('blue', 1, x), '');
    assert.ok(m.play('blue', 1, x));
    seen.push(id);
    assert.equal(s.hand[1], next, 'the next card fills the slot');
    assert.equal(s.queue[s.queue.length - 1], id, 'played card goes to the back');
    m.step();
  }
  assert.equal(s.played, 8);
  assert.equal(new Set([...s.hand, ...s.queue]).size, 8);
  assert.ok(seen.length === 8);
  // Not enough mana / no such card
  s.mana = 0;
  assert.equal(m.canPlay('blue', 0, 300), 'mana');
  assert.equal(m.play('blue', 0, 300), false);
  assert.equal(m.canPlay('blue', 7, 300), 'card');
});

test('zones: units on your own half, spells anywhere, and the pocket once the enemy Guard Tower falls', () => {
  const m = new Match({ seed: 6, blue: { deck: DECK_A }, red: { deck: DECK_B } });
  assert.deepEqual(m.zone('blue'), WORLD.deploy.blue);
  assert.deepEqual(m.zone('red'), WORLD.deploy.red);
  const s = m.sides.blue;
  s.mana = 10;
  const unit = s.hand.findIndex((id) => CARDS[id].kind === 'unit');
  assert.equal(m.canPlay('blue', unit, 900), 'zone');
  assert.equal(m.canPlay('blue', unit, 700), '');
  m.sides.red.mana = 10;
  const rs = m.sides.red.hand.findIndex((id) => CARDS[id].kind === 'spell');
  if (rs >= 0) {
    assert.equal(m.canPlay('red', rs, 100), '');
    assert.equal(m.canPlay('red', rs, -5), 'zone');
  }
  destroyTower(m.battle, tower(m.battle, 'red', 'guard'));
  assert.deepEqual(m.zone('blue'), [WORLD.deploy.blue[0], WORLD.pocket.blue]);
  assert.deepEqual(m.zone('red'), WORLD.deploy.red);
  assert.equal(m.canPlay('blue', unit, 1000), '');
  assert.equal(m.canPlay('blue', unit, WORLD.pocket.blue - 10), '');
  assert.equal(m.canPlay('blue', unit, WORLD.pocket.blue + 10), 'zone');
  assert.ok(WORLD.pocket.blue >= WORLD.castleX.red - CASTLE.w / 2 - CASTLE.range, 'the pocket reaches into the castle\'s range');
  const id0 = m.battle.nextId;
  const id = s.hand[unit];
  assert.ok(m.play('blue', unit, 1040));
  const dropped = m.battle.units.filter((u) => u.id >= id0);
  assert.equal(dropped.length, CARDS[id].count);
  assert.deepEqual(
    dropped.map((u) => u.hip.x).sort((a, b) => a - b),
    m.formation('blue', id, 1040).sort((a, b) => a - b),
    'beans drop where the ghost preview showed them',
  );
  assert.deepEqual(m.formation('red', 'bombSquad', 1450), [1460, 1450, 1410], 'mirrored for red, clamped to the zone');
  for (const u of dropped) {
    assert.ok(u.hip.x >= WORLD.deploy.blue[0] && u.hip.x <= WORLD.pocket.blue, `dropped at ${u.hip.x}`);
    assert.ok(u.deployT > 0 && u.team === 'blue' && u.type.id === CARDS[id].unit);
  }
});

test('spells only hit the other team: the Boulder launches, the Arrow Rain pincushions, the Cheese Wheel bowls beans over', () => {
  const setup = (seed) => {
    const b = arena(seed);
    for (const t of b.towers) t.cool = 1e9;
    const reds = [
      ['clubber', 940],
      ['archer', 970],
      ['brick', 1000],
      ['squire', 1030],
    ].map(([t, x], i) => b.addUnit(t, 'red', x, 0.2 + i * 0.2));
    const mate = b.addUnit('clubber', 'blue', 985, 0.5);
    for (const u of [...reds, mate]) {
      u.speed = 0;
      u.cooldown = 1e9;
    }
    return { b, reds, mate };
  };
  // Boulder
  {
    const { b, reds, mate } = setup(30);
    castSpell(b, CARDS.boulder, 'blue', 985, 1);
    const up = new Map();
    const ev = run(b, 2.5, () => {
      for (const u of reds) up.set(u, Math.max(up.get(u) || 0, u.ground - u.hip.y - u.standH));
    });
    assert.ok(ev.some((e) => e.type === 'spellCast' && e.spell === 'boulder' && e.team === 'blue'));
    assert.ok(ev.some((e) => e.type === 'boulderImpact'));
    const light = reds.filter((u) => u.type.id === 'clubber' || u.type.id === 'archer');
    assert.ok(light.every((u) => up.get(u) > 80), `launch ${light.map((u) => up.get(u).toFixed(0))}`);
    assert.ok(up.get(reds.find((u) => u.type.id === 'squire')) > 30, 'even the armoured squire goes up');
    assert.ok(reds.every((u) => u.hp < u.maxHp));
    assert.equal(mate.hp, mate.maxHp, 'friendly beans untouched');
  }
  // Arrow Rain
  {
    const { b, reds, mate } = setup(31);
    castSpell(b, CARDS.arrowRain, 'blue', 985, 2);
    const ev = run(b, 2.5);
    assert.equal(ev.filter((e) => e.type === 'rainVolley').length, SPELLS.arrowRain.volleys);
    const total = SPELLS.arrowRain.damage * SPELLS.arrowRain.volleys * levelMul(2);
    const brick = reds.find((u) => u.type.id === 'brick');
    assert.ok(Math.abs(brick.maxHp - brick.hp - total) < 1e-6, `rain dealt ${brick.maxHp - brick.hp} vs ${total}`);
    assert.ok(reds.reduce((s, u) => s + u.arrows.length, 0) >= 6, 'real arrows stick in the beans');
    assert.equal(mate.hp, mate.maxHp);
    assert.equal(b.spells.length, 0);
  }
  // Cheese Wheel
  {
    const { b, reds, mate } = setup(32);
    const s = castSpell(b, CARDS.cheeseWheel, 'blue', 800, 1);
    assert.equal(s.kind, 'wheel');
    for (const k of ['r', 'rot', 'vx', 'dist', 'hit']) assert.ok(k in s);
    const ev = run(b, 2.5);
    const hits = ev.filter((e) => e.type === 'wheelHit');
    assert.equal(hits.length, reds.length, 'each bean bowled over once');
    assert.ok(ev.some((e) => e.type === 'wheelEnd'));
    assert.ok(reds.filter((u) => u.type.id !== 'brick').every((u) => ev.some((e) => e.type === 'knockdown' && e.unit === u) || !u.alive));
    assert.equal(mate.hp, mate.maxHp);
    assert.ok(Math.abs(s.dist - SPELLS.wheel.dist) < SPELLS.wheel.speed * DT * 2);
  }
});

test('card levels: +10% health and damage per level for units, towers and spells', () => {
  const b = arena(33, 4);
  assert.ok(Math.abs(tower(b, 'red', 'guard').maxHp - GUARD.hp * levelMul(4)) < 1e-9);
  const u = b.addUnit('clubber', 'blue', 300, 0.5, 1, { level: 5 });
  assert.equal(u.level, 5);
  assert.ok(Math.abs(u.dmgMul - levelMul(5)) < 1e-12);
  assert.ok(Math.abs(u.maxHp - UNIT_TYPES.clubber.hp * levelMul(5)) < 1e-9);
  // The same duel, attacker at level 1 and level 3: every damage source scales exactly
  const duel = (type, level) => {
    const s = new Battle(34);
    s.addUnit(type, 'blue', 600, 0.5, 77, { level });
    const v = s.addUnit('brick', 'red', type === 'archer' ? 860 : 700, 0.5, 78);
    v.hp = v.maxHp = 1e6;
    v.speed = 0;
    v.cooldown = 1e9;
    s.start();
    let dmg = 0;
    run(s, 8, () => {
      dmg = v.maxHp - v.hp;
      return dmg === 0;
    });
    return dmg;
  };
  for (const type of ['clubber', 'archer', 'spiker', 'bomb']) {
    const d1 = duel(type, 1);
    const d3 = duel(type, 3);
    assert.ok(d1 > 0, `${type} never hit`);
    assert.ok(Math.abs(d3 / d1 - levelMul(3)) < 1e-9, `${type}: ${d3} / ${d1}`);
  }
});

/** A scripted opponent: plays a card from its hand on a timer, at a seeded spot. */
function scripted(m, team, rng, every = 2.5) {
  const s = m.sides[team];
  const foe = team === 'blue' ? 'red' : 'blue';
  return (step) => {
    if (step % Math.round(every / DT) !== (team === 'blue' ? 0 : Math.round(every / DT / 2))) return null;
    const i = (rng.next() * 4) | 0;
    const card = CARDS[s.hand[i]];
    let x;
    if (card.kind === 'spell') {
      const es = m.battle.units.filter((u) => u.alive && u.team === foe);
      x = es.length ? es[(rng.next() * es.length) | 0].hip.x : tower(m.battle, foe, 'guard').x;
    } else {
      const [z0, z1] = m.zone(team);
      x = z0 + rng.next() * (z1 - z0);
    }
    return m.play(team, i, x) ? [step, team, i, Math.round(x)] : null;
  };
}

function playMatch(seed, { hats = false, maxT = REGULATION + OVERTIME + 5 } = {}) {
  const m = new Match({
    seed,
    blue: { name: 'A', deck: DECK_A, kingLevel: 2, levels: { clubbers: 3 }, hats: hats ? { all: 'party' } : undefined },
    red: { name: 'B', deck: DECK_B, kingLevel: 2, hats: hats ? { all: 'viking', brick: 'crown' } : undefined },
  });
  const bots = [scripted(m, 'blue', new Rng(seed * 3 + 1), 2.2), scripted(m, 'red', new Rng(seed * 5 + 2), 2.6)];
  const log = [];
  let maxUnits = 0;
  for (let step = 0; step < maxT / DT && m.phase !== 'over'; step++) {
    for (const bot of bots) {
      const p = bot(step);
      if (p) log.push(p);
    }
    m.step();
    m.battle.events.length = 0;
    maxUnits = Math.max(maxUnits, m.battle.units.length);
  }
  return { m, log, maxUnits };
}

const fingerprint = (m) =>
  [
    m.winner,
    m.endReason,
    m.time.toFixed(6),
    JSON.stringify(m.crowns),
    m.battle.towers.map((t) => t.hp.toFixed(6)).join(),
    m.battle.units.map((u) => `${u.type.id}:${u.hp.toFixed(4)}:${u.hip.x.toFixed(4)}`).join('|'),
    m.sides.blue.mana.toFixed(6),
    m.sides.red.hand.join(),
  ].join(' / ');

test('a scripted match ends with a winner or a draw within regulation + overtime, every number finite', () => {
  const { m, log, maxUnits } = playMatch(41);
  assert.equal(m.phase, 'over');
  assert.ok(['blue', 'red', 'draw'].includes(m.winner));
  assert.ok(m.time <= REGULATION + OVERTIME + DT * 2, `ended at ${m.time}`);
  assert.ok(log.length > 30, `only ${log.length} cards played`);
  assert.ok(finite(m.battle));
  for (const t of m.battle.towers) assert.ok(Number.isFinite(t.hp) && Number.isFinite(t.aim));
  assert.ok(maxUnits < 60, `${maxUnits} units in the battle at once (corpses should go)`);
  const r = m.result('blue');
  assert.deepEqual(Object.keys(r).sort(), ['crowns', 'duration', 'enemyCrowns', 'outcome', 'threeCrown']);
  assert.equal(r.duration, m.endTime);
  assert.equal(r.outcome, m.winner === 'draw' ? 'draw' : m.winner === 'blue' ? 'win' : 'loss');
  assert.equal(m.result('red').crowns, r.enemyCrowns);
  // After the end the battle keeps playing (cheering), but nothing changes the result
  const crowns = JSON.stringify(m.crowns);
  for (let i = 0; i < 240; i++) m.step();
  assert.equal(JSON.stringify(m.crowns), crowns);
  assert.equal(m.battle.phase, 'over');
  if (m.winner !== 'draw') assert.ok(m.battle.units.filter((u) => u.alive && u.team === m.winner).every((u) => u.state === 'cheer'));
});

test('determinism: the same seed and plays replay identically, and hats never change the outcome', () => {
  const a = playMatch(42, { maxT: 70 });
  const b = playMatch(42, { maxT: 70 });
  assert.deepEqual(a.log, b.log);
  assert.equal(fingerprint(a.m), fingerprint(b.m));
  const c = playMatch(42, { maxT: 70, hats: true });
  assert.ok(c.m.battle.items.some((it) => it.kind === 'hat') || c.m.battle.units.some((u) => u.hat), 'hats were worn');
  assert.deepEqual(c.log, a.log);
  assert.equal(fingerprint(c.m), fingerprint(a.m));
});

test('a fallen castle is three crowns and wins at once; the loser\'s other tower crumbles', () => {
  const m = new Match({ seed: 43, blue: { deck: DECK_A }, red: { deck: DECK_B } });
  m.step();
  m.battle.events.length = 0;
  const c = tower(m.battle, 'red', 'castle');
  damageTower(m.battle, c, c.hp + 1, c.x, -50, 'test');
  m.step();
  const ev = m.battle.events.splice(0);
  assert.equal(m.phase, 'over');
  assert.equal(m.winner, 'blue');
  assert.equal(m.endReason, 'castle');
  assert.deepEqual(m.crowns, { blue: 3, red: 0 });
  assert.equal(m.sides.blue.crowns, 3);
  assert.ok(!tower(m.battle, 'red', 'guard').alive, 'the guard tower crumbles too');
  assert.equal(ev.filter((e) => e.type === 'towerDown').length, 2);
  const end = ev.find((e) => e.type === 'matchEnd');
  assert.equal(end.winner, 'blue');
  assert.deepEqual(end.crowns, { blue: 3, red: 0 });
  assert.deepEqual(m.result('blue'), { outcome: 'win', crowns: 3, enemyCrowns: 0, threeCrown: true, duration: m.endTime });
  assert.equal(m.result('red').outcome, 'loss');
  assert.equal(m.canPlay('blue', 0, 300), 'over');
  assert.equal(m.play('blue', 0, 300), false);
});

test('regulation ends on crowns; a tie goes to overtime (first tower wins), then to the weakest tower', () => {
  // Ahead on crowns at 0:00
  const a = new Match({ seed: 44, blue: { deck: DECK_A }, red: { deck: DECK_B } });
  destroyTower(a.battle, tower(a.battle, 'blue', 'guard'));
  a.time = REGULATION - DT / 2;
  a.step();
  assert.equal(a.winner, 'red');
  assert.equal(a.endReason, 'time');
  // Tied: overtime, then the first tower to fall
  const b = new Match({ seed: 45, blue: { deck: DECK_A }, red: { deck: DECK_B } });
  b.time = REGULATION - DT / 2;
  b.step();
  assert.equal(b.phase, 'overtime');
  assert.ok(b.battle.events.some((e) => e.type === 'overtime'));
  assert.ok(b.doubleMana);
  assert.ok(Math.abs(b.timeLeft - OVERTIME) < 0.05, `overtime clock ${b.timeLeft}`);
  b.step();
  assert.equal(b.phase, 'overtime');
  destroyTower(b.battle, tower(b.battle, 'red', 'guard'));
  b.step();
  assert.equal(b.winner, 'blue');
  assert.equal(b.endReason, 'overtime');
  // Still tied after overtime: the weakest standing tower loses; exact tie is a draw
  const c = new Match({ seed: 46, blue: { deck: DECK_A }, red: { deck: DECK_B } });
  c.time = REGULATION - DT / 2;
  c.step();
  const g = tower(c.battle, 'blue', 'guard');
  g.hp = g.maxHp * 0.6;
  const rc = tower(c.battle, 'red', 'castle');
  rc.hp = rc.maxHp * 0.7;
  c.time = REGULATION + OVERTIME - DT / 2;
  c.step();
  assert.equal(c.winner, 'red');
  assert.equal(c.endReason, 'tiebreak');
  const d = new Match({ seed: 47, blue: { deck: DECK_A }, red: { deck: DECK_B } });
  d.time = REGULATION + OVERTIME;
  d.phase = 'overtime';
  d.step();
  assert.equal(d.winner, 'draw');
  assert.equal(d.result('red').outcome, 'draw');
});

test('surrender hands the other side the win', () => {
  const m = new Match({ seed: 48, blue: { deck: DECK_A }, red: { deck: DECK_B } });
  for (let i = 0; i < 100; i++) m.step();
  assert.ok(m.surrender('blue'));
  assert.equal(m.phase, 'over');
  assert.equal(m.winner, 'red');
  assert.equal(m.endReason, 'surrender');
  assert.equal(m.result('blue').outcome, 'loss');
  assert.equal(m.result('red').crowns, 3);
  assert.equal(m.surrender('red'), false);
  assert.equal(m.battle.events.filter((e) => e.type === 'matchEnd').length, 1);
});

test('cards played drop real units and fire real spells, with the events the UI needs', () => {
  const m = new Match({ seed: 49, blue: { deck: DECK_A, levels: { clubberGang: 4 } }, red: { deck: DECK_B } });
  const s = m.sides.blue;
  const evs = [];
  for (let k = 0; k < 8; k++) {
    s.mana = 10;
    const id = s.hand[0];
    const card = CARDS[id];
    const x = card.kind === 'spell' ? 1000 : 500;
    const id0 = m.battle.nextId;
    assert.ok(m.play('blue', 0, x));
    const ev = m.battle.events.splice(0);
    evs.push(...ev);
    const played = ev.find((e) => e.type === 'cardPlayed');
    assert.equal(played.card, id);
    assert.equal(played.team, 'blue');
    assert.equal(played.x, x);
    if (card.kind === 'unit') {
      const us = m.battle.units.filter((u) => u.id >= id0);
      assert.equal(us.length, card.count);
      assert.equal(ev.filter((e) => e.type === 'drop').length, card.count);
      assert.ok(us.every((u) => u.level === (s.levels[id] || 1)));
      // Formation: spread out along x around the spot
      if (card.count > 1) assert.ok(Math.max(...us.map((u) => u.hip.x)) - Math.min(...us.map((u) => u.hip.x)) > 10);
    } else assert.ok(ev.some((e) => e.type === 'spellCast' && e.x === x));
    for (let i = 0; i < 30; i++) m.step();
  }
  assert.ok(evs.some((e) => e.type === 'spellCast'));
});

// --- regressions found by the adversarial pass ----------------------------------------

test('a castle backs onto the edge of the world: beans flung at it come down in front, never stuck behind it off screen', () => {
  for (const type of ['clubber', 'spiker', 'brick']) {
    const b = arena(60);
    for (const t of b.towers) t.cool = 1e9;
    const c = tower(b, 'red', 'castle');
    destroyTower(b, tower(b, 'red', 'guard'));
    const u = tank(b.addUnit(type, 'blue', 1240, 0.5));
    run(b, 0.3);
    for (const p of u.parts) p.setVel(500, -900, DT); // high enough to clear the roof (a Spiker used to land in the gap behind it)
    let deepest = -Infinity;
    run(b, 3, () => {
      deepest = Math.max(deepest, u.hip.x - (c.x - c.w / 2));
    });
    assert.ok(deepest < 1, `${type} got ${deepest.toFixed(1)} px past the castle's front`);
    assert.ok(u.hip.x > 12 && u.hip.x < c.x - c.w / 2, `${type} ended at ${u.hip.x.toFixed(1)}`);
    assert.ok(finite(b));
  }
  // Even one put straight into the gap behind (or dropped onto the roof) comes back out in front
  const b = arena(61);
  for (const t of b.towers) t.cool = 1e9;
  const c = tower(b, 'red', 'castle');
  const u = tank(b.addUnit('clubber', 'blue', 1300, 0.5));
  const dx = 1482 - u.hip.x;
  for (const p of u.parts) p.teleport(dx, -200);
  const d = tank(b.addUnit('bruiser', 'blue', 1450, 0.5, null, { drop: true }));
  run(b, 3);
  for (const v of [u, d]) assert.ok(v.hip.x < c.x - c.w / 2 && v.hip.x > 12, `${v.type.id} at ${v.hip.x.toFixed(1)}`);
  assert.ok(finite(b));
  // Its own team still walks through it
  const r = b.addUnit('clubber', 'red', 1460, 0.5);
  run(b, 1);
  assert.ok(r.hip.x < 1460 && r.hip.x > c.x - c.w);
});

test('archers shooting a tower come within its reach, so the tower can shoot back', () => {
  for (const kind of ['guard', 'castle']) {
    const b = arena(62);
    if (kind === 'castle') destroyTower(b, tower(b, 'red', 'guard'));
    const t = tower(b, 'red', kind);
    const a = tank(b.addUnit('archer', 'blue', 760, 0.5));
    a.preferRange = 300; // the longest an archer gets: it used to stand out of the Guard Tower's range and plink it forever
    // (where it stands over the last 6 s: a cannonball hop knocks it back out for a moment, then it walks back in)
    const at = [];
    const ev = run(b, 14, (i) => void (i * DT > 8 && at.push(Math.abs(a.hip.x - t.x))));
    const arrows = ev.filter((e) => e.type === 'towerHit' && e.tower === t && e.kind === 'arrow').length;
    const shots = ev.filter((e) => (e.type === 'towerShot' || e.type === 'cannonFire') && e.tower === t && e.target === a).length;
    assert.ok(arrows >= 3, `${kind}: ${arrows} arrows landed`);
    assert.ok(shots >= 3, `${kind}: shot back ${shots} times`);
    const inReach = at.filter((d) => d <= t.range).length / at.length;
    assert.ok(inReach > 0.6, `${kind}: archer in reach ${(inReach * 100).toFixed(0)}% of the time`);
  }
  // Against beans they still keep their own range
  const b = arena(63);
  for (const t of b.towers) t.cool = 1e9;
  const a = b.addUnit('archer', 'blue', 500, 0.5);
  a.preferRange = 300;
  const foe = tank(b.addUnit('squire', 'red', 900, 0.5));
  foe.speed = 0;
  run(b, 3);
  assert.ok(Math.abs(foe.hip.x - a.hip.x) > 280, `closed to ${Math.abs(foe.hip.x - a.hip.x).toFixed(0)}`);
});

test('a side from a saved profile is sanitised: junk card ids, odd levels and odd team names never break a match', () => {
  const m = new Match({
    seed: 64,
    blue: { deck: ['toString', 'constructor', '__proto__', 'nope', 7, null, 'clubbers', 'boulder', 'clubbers'], levels: { clubbers: '4', boulder: 99 }, kingLevel: 'x' },
    red: null,
  });
  const s = m.sides.blue;
  assert.deepEqual(s.deck, ['clubbers', 'boulder', 'clubbers']);
  assert.deepEqual(s.hand.slice().sort(), ['boulder', 'clubbers', 'clubbers']);
  assert.deepEqual(s.levels, { clubbers: 4, boulder: 9 });
  assert.equal(s.kingLevel, 1);
  assert.deepEqual(m.sides.red.hand, []);
  assert.equal(new Match({ blue: { deck: DECK_A, kingLevel: 40, levels: { squire: -2, bomb: NaN } } }).battle.towers[0].level, 9);
  assert.equal(new Match({ blue: { deck: DECK_A, levels: { squire: -2, bomb: NaN } } }).sides.blue.levels.squire, 1);
  for (const team of ['green', '__proto__', 'constructor', 'toString', undefined]) {
    assert.equal(m.canPlay(team, 0, 500), 'card', String(team));
    assert.equal(m.play(team, 0, 500), false);
    assert.equal(m.surrender(team), false);
    assert.deepEqual(m.formation(team, 'clubbers', 500), []);
  }
  for (let k = 0; k < 6; k++) {
    s.mana = 10;
    const i = s.hand.indexOf('clubbers');
    assert.ok(m.play('blue', i, 400));
    assert.ok(Number.isFinite(s.mana));
    for (let j = 0; j < 20; j++) m.step();
  }
  assert.ok(m.battle.units.filter((u) => u.team === 'blue').every((u) => u.level === 4));
  assert.equal(m.phase, 'fight');
});

test('mana fills in whole drops exactly (no float drift), and a broken frame time is ignored', () => {
  const m = new Match({ seed: 65, blue: { deck: DECK_A }, red: { deck: DECK_B } });
  const steps = Math.round(MANA_TIME / DT);
  for (let k = 1; k <= 5; k++) {
    for (let i = 0; i < steps; i++) m.step();
    assert.equal(m.sides.blue.mana, MANA_START + k); // 9 used to come out as 8.999999999999986
  }
  const t = m.time;
  for (const dt of [NaN, 0, -DT]) m.step(dt);
  assert.equal(m.time, t);
  assert.equal(m.sides.blue.mana, MANA_MAX);
});

test('surrender: the towers crumble with the final crowns already counted', () => {
  const m = new Match({ seed: 66, blue: { deck: DECK_A }, red: { deck: DECK_B } });
  m.step();
  m.battle.events.length = 0;
  assert.ok(m.surrender('red'));
  const downs = m.battle.events.filter((e) => e.type === 'towerDown');
  assert.equal(downs.length, 2);
  assert.ok(downs.every((e) => e.team === 'red' && e.crowns === 3));
  assert.deepEqual(m.crowns, { blue: 3, red: 0 });
});

test('edge cases: both castles in one step, a castle in overtime, a card on the last step, spells at the field edges', () => {
  // Both castles fall in the same step: a draw, three crowns each
  const a = new Match({ seed: 67, blue: { deck: DECK_A }, red: { deck: DECK_B } });
  a.step();
  destroyTower(a.battle, a.battle.towers.find((t) => t.team === 'blue' && t.kind === 'castle'));
  destroyTower(a.battle, a.battle.towers.find((t) => t.team === 'red' && t.kind === 'castle'));
  a.step();
  assert.deepEqual([a.winner, a.endReason, a.crowns.blue, a.crowns.red], ['draw', 'castle', 3, 3]);
  // A card on the very last step of regulation still drops, then overtime starts; a castle there wins at once
  const m = new Match({ seed: 68, blue: { deck: DECK_A }, red: { deck: DECK_B } });
  m.time = REGULATION - DT * 0.5;
  m.sides.blue.mana = MANA_MAX;
  const unit = m.sides.blue.hand.findIndex((id) => CARDS[id].kind === 'unit');
  assert.ok(m.play('blue', unit, 400));
  const n = m.battle.units.length;
  m.step();
  assert.equal(m.phase, 'overtime');
  assert.ok(n > 0 && m.battle.units.length === n);
  for (let i = 0; i < 120; i++) m.step();
  damageTower(m.battle, m.battle.towers.find((t) => t.team === 'red' && t.kind === 'castle'), 1e9, 1400, -50);
  m.step();
  assert.deepEqual([m.winner, m.endReason, m.crowns.blue], ['blue', 'castle', 3]);
  assert.equal(m.canPlay('blue', 0, 400), 'over');
  // Spells cast right at the edges of the field: they stay finite, finish, and only touch enemy towers
  const b = arena(69);
  for (const [card, team, x] of [['boulder', 'blue', 0], ['boulder', 'red', 1500], ['arrowRain', 'blue', 1500], ['arrowRain', 'red', 0], ['cheeseWheel', 'blue', 1500], ['cheeseWheel', 'red', 0]]) {
    castSpell(b, CARDS[card], team, x, 1);
  }
  const ev = run(b, 4);
  assert.equal(b.spells.length, 0);
  const hits = ev.filter((e) => e.type === 'towerHit');
  assert.ok(hits.length > 0 && hits.every((e) => e.from && e.from.team !== e.tower.team));
  assert.ok(b.arrows.every((a) => Number.isFinite(a.x) && Number.isFinite(a.y)));
});
