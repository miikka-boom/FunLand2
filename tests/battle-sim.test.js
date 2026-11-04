import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, DT } from '../battle/src/sim/battle.js';
import { UNIT_TYPES } from '../battle/src/sim/unit-types.js';
import { WORLD } from '../battle/src/config.js';

const run = (b, secs) => {
  const ev = [];
  for (let i = 0; i < secs / DT; i++) {
    b.step(DT);
    for (const e of b.events) ev.push(e);
    b.events.length = 0;
    if (b.phase === 'over' && secs > 30) break;
  }
  return ev;
};

const finite = (b) => b.units.every((u) => u.parts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));

function army(b, list) {
  for (const [type, team, x, lane] of list) b.addUnit(type, team, x, lane ?? 0.5);
}

test('idle units stand at their stance height, upright, without drifting', () => {
  const b = new Battle(3);
  army(b, [
    ['clubber', 'blue', 500],
    ['squire', 'blue', 600],
    ['archer', 'blue', 700],
    ['clubber', 'red', 1300],
    ['squire', 'red', 1400],
    ['archer', 'red', 1500],
  ]);
  const x0 = b.units.map((u) => u.hip.x);
  run(b, 6);
  b.units.forEach((u, i) => {
    assert.ok(Math.abs(u.hip.x - x0[i]) < 3, `${u.type.id} drifted ${u.hip.x - x0[i]}`);
    const h = u.ground - u.hip.y;
    assert.ok(Math.abs(h - u.standH) < 3, `${u.type.id} hip height ${h} vs ${u.standH}`);
    const lean = Math.atan2(u.head.x - u.hip.x, u.hip.y - u.head.y);
    assert.ok(Math.abs(lean) < 0.15, `${u.type.id} leaning ${lean}`);
  });
  assert.ok(finite(b));
});

test('a mixed battle ends with a winner, no NaN, and the expected events', () => {
  const b = new Battle(42);
  const types = ['clubber', 'squire', 'archer'];
  for (let i = 0; i < 6; i++) {
    b.addUnit(types[i % 3], 'blue', 500 + i * 40, (i * 0.37) % 1);
    b.addUnit(types[(i + 1) % 3], 'red', 1500 - i * 40, (i * 0.61) % 1);
  }
  b.start();
  const ev = run(b, 150);
  assert.equal(b.phase, 'over');
  assert.ok(['blue', 'red', 'draw'].includes(b.winner));
  assert.ok(finite(b));
  const kinds = new Set(ev.map((e) => e.type));
  for (const k of ['battleStart', 'hit', 'death', 'bowRelease', 'battleEnd', 'step']) assert.ok(kinds.has(k), `no ${k} event`);
  // Everyone on the losing side is dead and has dropped their weapon
  const loser = b.winner === 'blue' ? 'red' : 'blue';
  if (b.winner !== 'draw') assert.equal(b.count(loser), 0);
  for (const u of b.units) if (!u.alive) assert.equal(u.tip, null);
});

test('the same seed and placement replays identically', () => {
  const sim = () => {
    const b = new Battle(7);
    army(b, [
      ['clubber', 'blue', 700, 0.2],
      ['archer', 'blue', 600, 0.8],
      ['squire', 'red', 1300, 0.4],
      ['clubber', 'red', 1340, 0.6],
    ]);
    b.start();
    run(b, 20);
    return b.units.map((u) => [u.hp.toFixed(6), u.hip.x.toFixed(6), u.head.y.toFixed(6)].join()).join('|') + b.winner;
  };
  assert.equal(sim(), sim());
});

test('arrows fly in an arc and stick into the body they hit', () => {
  const b = new Battle(5);
  army(b, [
    ['archer', 'blue', 600],
    ['clubber', 'red', 1150],
  ]);
  const target = b.units.find((u) => u.team === 'red');
  target.speed = 0; // a sitting duck
  b.start();
  let peak = 0;
  for (let i = 0; i < 8 / DT; i++) {
    b.step(DT);
    b.events.length = 0;
    for (const a of b.arrows) if (a.state === 'fly') peak = Math.min(peak, a.y);
  }
  assert.ok(peak < -90, `arrows should lob (peak ${peak})`);
  const stuck = b.arrows.filter((a) => a.state === 'body');
  assert.ok(stuck.length >= 2, `only ${stuck.length} arrows stuck`);
  assert.ok(target.hp < target.maxHp);
  // Stuck arrows follow the body
  const a = stuck[0];
  const p0 = b.arrowPose(a);
  for (const p of target.parts) p.teleport(50, 0);
  const p1 = b.arrowPose(a);
  assert.ok(Math.abs(p1.x - p0.x - 50) < 1e-6);
});

test('a squire facing the archers blocks their arrows with the shield', () => {
  const b = new Battle(9);
  army(b, [
    ['archer', 'blue', 500],
    ['archer', 'blue', 540],
    ['squire', 'red', 1050],
  ]);
  const sq = b.units.find((u) => u.team === 'red');
  sq.speed = 0;
  b.start();
  const ev = run(b, 10);
  const blocked = ev.filter((e) => e.type === 'block' && e.kind === 'arrow').length;
  const hits = ev.filter((e) => e.type === 'hit' && e.kind === 'arrow').length;
  assert.ok(blocked >= 3, `blocked ${blocked}`);
  assert.ok(blocked > hits, `blocked ${blocked} vs hit ${hits}`);
  assert.ok(sq.shieldArrows.length > 0);
});

test('a club hit launches, knocks down, and the bean gets back up', () => {
  const b = new Battle(11);
  army(b, [
    ['clubber', 'blue', 960],
    ['archer', 'red', 1010], // no poise (squires shrug off some knockdowns)
  ]);
  const red = b.units.find((u) => u.team === 'red');
  red.hp = red.maxHp = 1e6; // survive for the test
  red.cooldown = 1e9; // and don't shoot back
  red.speed = 0;
  b.start();
  let launched = false;
  let knocked = false;
  for (let i = 0; i < 6 / DT; i++) {
    b.step(DT);
    for (const e of b.events) {
      if (e.type === 'knockdown' && e.unit === red) knocked = true;
    }
    b.events.length = 0;
    if (red.ground - red.hip.y > red.standH + 15) launched = true;
    if (knocked) break;
  }
  assert.ok(knocked, 'never knocked down');
  assert.ok(launched || red.downT > 0);
  // Give it time to get up (stop the clubber so it doesn't keep bonking)
  const blue = b.units.find((u) => u.team === 'blue');
  blue.die(b, null);
  run(b, 4);
  assert.ok(red.conscious > 0.9, `conscious ${red.conscious}`);
  assert.ok(Math.abs(red.ground - red.hip.y - red.standH) < 5, 'standing again');
});

test('melee units squeeze past their own archers to reach the enemy', () => {
  const b = new Battle(13);
  army(b, [
    ['archer', 'blue', 700, 0.5],
    ['clubber', 'blue', 640, 0.5], // behind the archer, same lane
    ['squire', 'red', 1500, 0.5],
  ]);
  const club = b.units.find((u) => u.type.id === 'clubber');
  const archer = b.units.find((u) => u.type.id === 'archer');
  b.start();
  run(b, 6);
  assert.ok(club.hip.x > archer.hip.x + 20, `clubber ${club.hip.x} still behind archer ${archer.hip.x}`);
});

test('grabbing lifts a bean, it dangles, and lands back on its feet', () => {
  const b = new Battle(15);
  army(b, [['clubber', 'blue', 600]]);
  run(b, 1);
  const u = b.units[0];
  assert.ok(b.grabAt(u.head.x, u.head.y));
  for (let i = 0; i < 90; i++) {
    b.moveGrab(600, -150);
    b.step(DT);
  }
  assert.ok(u.ground - u.hip.y > 80, 'lifted');
  assert.ok(u.conscious < 0.5, 'limp while held');
  b.release();
  run(b, 3);
  assert.ok(!u.held && u.conscious > 0.9);
  assert.ok(Math.abs(u.ground - u.hip.y - u.standH) < 5);
  assert.ok(u.alive, 'no fall damage during placement');
});

test('dead beans drop their weapons as free physics items', () => {
  const b = new Battle(17);
  army(b, [
    ['squire', 'blue', 600],
    ['archer', 'blue', 650],
    ['clubber', 'blue', 700],
  ]);
  b.start();
  for (const u of b.units.slice()) u.die(b, null);
  run(b, 3);
  const kinds = b.items.map((i) => i.kind).sort();
  assert.deepEqual(kinds, ['bow', 'club', 'shield', 'sword']);
  for (const it of b.items) assert.ok(it.a.y <= it.a.ground && it.b.y <= it.b.ground && Number.isFinite(it.a.x));
});

test('snapshot keeps the placement for retry', () => {
  const b = new Battle(19);
  army(b, [
    ['clubber', 'blue', 500, 0.3],
    ['archer', 'red', 1500, 0.7],
  ]);
  const snap = b.snapshot();
  assert.deepEqual(
    snap.map((s) => [s.type, s.team, s.x, s.lane]),
    [
      ['clubber', 'blue', 500, 0.3],
      ['archer', 'red', 1500, 0.7],
    ],
  );
  const c = new Battle(19);
  for (const s of snap) c.addUnit(s.type, s.team, s.x, s.lane, s.seed);
  assert.equal(c.cost('blue'), UNIT_TYPES.clubber.cost);
});

// --- regressions from review ------------------------------------------------------

test('a shield block stops the swing: it never also wounds or gets blocked by a neighbour', () => {
  let doubles = 0;
  let swings = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const b = new Battle(seed);
    army(b, [
      ['squire', 'blue', 1000, 0.5],
      ['squire', 'red', 1040, 0.1], // shield-bearer in front...
      ['squire', 'red', 1040, 0.9], // ...and a teammate at the same x in another lane
    ]);
    for (const u of b.units) if (u.team === 'red') u.cooldown = 1e9;
    b.start();
    for (let i = 0; i < 6 / DT; i++) {
      b.step(DT);
      const per = new Map();
      for (const e of b.events) {
        if ((e.type === 'hit' || e.type === 'block') && e.from && e.from.team === 'blue') per.set(e.from, (per.get(e.from) || 0) + 1);
      }
      for (const n of per.values()) {
        swings++;
        if (n > 1) doubles++;
      }
      b.events.length = 0;
    }
  }
  assert.ok(swings > 10, `only ${swings} connecting swings`);
  assert.equal(doubles, 0);
});

test('enforceZones puts a bean dragged over the line back at its zone edge, and the snapshot agrees', () => {
  const b = new Battle(21);
  army(b, [
    ['clubber', 'blue', 600],
    ['clubber', 'red', 1500],
  ]);
  run(b, 0.5);
  const blue = b.units.find((u) => u.team === 'blue');
  b.grabAt(blue.head.x, blue.head.y);
  for (let i = 0; i < 60; i++) {
    b.moveGrab(1450, -100); // hold it deep in red's zone
    b.step(DT);
  }
  b.enforceZones();
  const nb = b.units.find((u) => u.team === 'blue');
  assert.ok(nb.hip.x <= WORLD.zone.blue[1], `blue starts at ${nb.hip.x}`);
  const snap = b.snapshot().find((s) => s.team === 'blue');
  assert.ok(snap.x >= WORLD.zone.blue[0] && snap.x <= WORLD.zone.blue[1], `snapshot x ${snap.x}`);
  assert.equal(b.grab, null);
  assert.ok(b.start());
});

test('a hard fling is capped and the castle walls keep beans in the world', () => {
  const b = new Battle(23);
  army(b, [
    ['squire', 'blue', 400],
    ['clubber', 'red', 1600],
  ]);
  b.start();
  const u = b.units.find((x) => x.team === 'blue');
  b.grabAt(u.head.x, u.head.y);
  // Yank it left very fast, then let go
  for (let i = 0; i < 12; i++) {
    b.moveGrab(400 - i * 60, -200);
    b.step(DT);
  }
  b.release();
  for (const p of u.parts) assert.ok(Math.hypot(p.vx(DT), p.vy(DT)) <= 1100 + 1e-6);
  let minX = Infinity;
  for (let i = 0; i < 4 / DT; i++) {
    b.step(DT);
    b.events.length = 0;
    minX = Math.min(minX, u.hip.x);
  }
  assert.ok(minX > -200, `went to ${minX}`);
});

test('timeout with equal health is a draw; a battle needs both sides to start', () => {
  const e = new Battle(25);
  army(e, [['clubber', 'blue', 500]]);
  assert.equal(e.start(), false);
  assert.equal(e.phase, 'place');

  const b = new Battle(25);
  army(b, [
    ['archer', 'blue', 300],
    ['archer', 'red', 1700],
  ]);
  for (const u of b.units) u.cooldown = 1e9;
  b.start();
  b.battleTime = 151;
  b.step(DT);
  assert.equal(b.phase, 'over');
  assert.equal(b.winner, 'draw');
});

test('an archer knocked out mid-recover still draws its next shot with an arrow nocked', () => {
  const b = new Battle(27);
  army(b, [
    ['archer', 'blue', 700],
    ['squire', 'red', 1200],
  ]);
  const a = b.units.find((u) => u.team === 'blue');
  b.start();
  let fired = false;
  for (let i = 0; i < 10 / DT && !fired; i++) {
    b.step(DT);
    if (b.events.some((e) => e.type === 'bowRelease')) fired = true;
    b.events.length = 0;
  }
  assert.ok(fired);
  assert.equal(a.nocked, false);
  a.takeHit(b, { damage: 1, dvx: 0, dvy: 0, x: a.hip.x, y: a.hip.y, stun: 1, kind: 'test' }); // floored mid-recover
  let drew = false;
  for (let i = 0; i < 6 / DT && !drew; i++) {
    b.step(DT);
    b.events.length = 0;
    if (a.act && a.act.phase === 'draw' && a.bowDraw > 0.3) drew = true;
  }
  assert.ok(drew, 'never drew again');
  assert.equal(a.nocked, true);
});

test('a held clubber stops leaning into its charge', () => {
  const b = new Battle(29);
  army(b, [
    ['clubber', 'blue', 800],
    ['archer', 'red', 1150],
  ]);
  const c = b.units.find((u) => u.team === 'blue');
  b.start();
  let charged = false;
  for (let i = 0; i < 6 / DT && !charged; i++) {
    b.step(DT);
    b.events.length = 0;
    charged = c.charging;
  }
  assert.ok(charged, 'never charged');
  b.grabAt(c.head.x, c.head.y);
  run(b, 0.5);
  assert.equal(c.charging, false);
});

// --- shaped units: Spiker (triangle), Bomb (circle), Brick (rectangle) -------------

test('every unit shape stands at its own height without drifting', () => {
  const b = new Battle(31);
  const types = ['clubber', 'squire', 'archer', 'spiker', 'bomb', 'brick'];
  types.forEach((t, i) => b.addUnit(t, 'blue', 300 + i * 100, 0.5));
  const x0 = b.units.map((u) => u.hip.x);
  run(b, 5);
  const heights = {};
  b.units.forEach((u, i) => {
    assert.ok(Math.abs(u.hip.x - x0[i]) < 3, `${u.type.id} drifted`);
    assert.ok(Math.abs(u.ground - u.hip.y - u.standH) < 3, `${u.type.id} sagging`);
    heights[u.type.id] = u.ground - u.head.y + u.R;
  });
  assert.ok(heights.brick > heights.clubber * 1.5, 'the Brick is a giant');
  assert.ok(heights.spiker < heights.clubber && heights.bomb < heights.clubber, 'Spiker and Bomb are small');
  assert.ok(finite(b));
});

test('a Spiker pounces point-first and launches what it hits, but bounces off a shield', () => {
  const b = new Battle(33);
  army(b, [
    ['spiker', 'blue', 900],
    ['archer', 'red', 1060],
  ]);
  const archer = b.units.find((u) => u.team === 'red');
  archer.cooldown = 1e9;
  archer.speed = 0;
  b.start();
  const ev = run(b, 4);
  const hit = ev.find((e) => e.type === 'hit' && e.kind === 'spike');
  assert.ok(hit, 'no pounce hit');
  assert.ok(ev.some((e) => e.type === 'knockdown' && e.unit === archer) || !archer.alive);

  const s = new Battle(35);
  army(s, [
    ['spiker', 'blue', 900],
    ['squire', 'red', 1060],
  ]);
  const sq = s.units.find((u) => u.team === 'red');
  sq.cooldown = 1e9;
  sq.speed = 0;
  s.start();
  const ev2 = run(s, 4);
  assert.ok(ev2.some((e) => e.type === 'block' && e.from && e.from.type.id === 'spiker'), 'the shield should stop the pounce');
  assert.ok(sq.hp > sq.maxHp - 10);
});

test('a Bomb walks up, lights its fuse and explodes: enemies flung, friends hurt less, no corpse left', () => {
  const b = new Battle(37);
  army(b, [
    ['bomb', 'blue', 900, 0.5],
    ['clubber', 'blue', 880, 0.5], // a teammate standing just behind it
    ['clubber', 'red', 1050, 0.5],
    ['clubber', 'red', 1075, 0.5],
  ]);
  const bomb = b.units.find((u) => u.type.id === 'bomb');
  const mate = b.units.find((u) => u.team === 'blue' && u.type.id === 'clubber');
  const reds = b.units.filter((u) => u.team === 'red');
  for (const u of reds) {
    u.cooldown = 1e9;
    u.speed = 0;
  }
  mate.speed = 0;
  mate.cooldown = 1e9;
  b.start();
  const ev = run(b, 6);
  const boom = ev.filter((e) => e.type === 'explode');
  assert.equal(boom.length, 1);
  assert.ok(ev.some((e) => e.type === 'fuse'), 'fuse first');
  assert.ok(bomb.gone && !bomb.alive);
  const redLoss = reds.reduce((s, u) => s + (u.maxHp - Math.max(0, u.hp)), 0) / reds.length;
  assert.ok(redLoss > 25, `reds lost ${redLoss}`);
  assert.ok(mate.maxHp - mate.hp < redLoss, 'teammates take less');
});

test('a bomb right next to a blast goes off too, but one waiting at a safe distance does not', () => {
  const b = new Battle(39);
  army(b, [
    ['bomb', 'blue', 700, 0.5],
    ['bomb', 'blue', 728, 0.5], // touching: chains
    ['bomb', 'blue', 860, 0.5], // queued out of blast range: spared
    ['clubber', 'red', 1500],
  ]);
  const [first, near, far] = b.units.filter((u) => u.type.id === 'bomb').sort((x, y) => x.hip.x - y.hip.x);
  b.start();
  first.die(b, null); // it still goes off a beat later...
  const ev = run(b, 1.5);
  assert.equal(ev.filter((e) => e.type === 'explode').length, 2); // ...and takes its neighbour with it
  assert.ok(first.gone && near.gone);
  assert.ok(far.alive && !far.gone);
});

test('a Brick slam sends a shockwave through the ground, and clubs barely move the Brick', () => {
  const b = new Battle(41);
  army(b, [
    ['brick', 'blue', 900, 0.5],
    ['clubber', 'red', 990, 0.4],
    ['archer', 'red', 1030, 0.6],
  ]);
  const brick = b.units.find((u) => u.type.id === 'brick');
  const reds = b.units.filter((u) => u.team === 'red');
  for (const u of reds) {
    u.cooldown = 1e9;
    u.speed = 0;
  }
  b.start();
  const ev = run(b, 4);
  assert.ok(ev.some((e) => e.type === 'quake'), 'no slam');
  const flung = reds.filter((u) => ev.some((e) => e.type === 'knockdown' && e.unit === u) || !u.alive || u.hp < u.maxHp);
  assert.ok(flung.length === 2, 'both caught by the shockwave');
  // Heavy: a full club bonk barely moves it
  const x0 = brick.hip.x;
  brick.takeHit(b, { damage: 30, dvx: 240, dvy: -500, x: brick.chest.x, y: brick.chest.y, stun: 1, kind: 'club' });
  run(b, 1);
  assert.ok(brick.downT <= 0 && brick.alive, 'not knocked down');
  assert.ok(Math.abs(brick.hip.x - x0) < 60);
});

test('a battle with every unit type ends cleanly', () => {
  for (const seed of [1, 2]) {
    const b = new Battle(seed);
    const L = ['brick', 'squire', 'clubber', 'spiker', 'bomb', 'archer'];
    L.forEach((t, i) => b.addUnit(t, 'blue', 880 - i * 30, (i * 0.37) % 1));
    L.forEach((t, i) => b.addUnit(t, 'red', 1120 + i * 30, (i * 0.53) % 1));
    b.start();
    run(b, 150);
    assert.equal(b.phase, 'over');
    assert.ok(finite(b));
  }
});

test('hats are cosmetic: the same battle plays out identically with or without them', () => {
  const run = (hats) => {
    const b = new Battle(15);
    if (hats) b.hats = { blue: { all: 'party' }, red: { all: 'viking' } };
    army(b, [
      ['clubber', 'blue', 820, 0.2],
      ['clubber', 'blue', 860, 0.7],
      ['squire', 'blue', 780, 0.5],
      ['bomb', 'blue', 700, 0.4],
      ['clubber', 'red', 1150, 0.3],
      ['brick', 'red', 1200, 0.6],
      ['spiker', 'red', 1180, 0.9],
    ]);
    b.start();
    let t = 0;
    while (b.phase !== 'over' && t < 90) {
      b.step(DT);
      t += DT;
    }
    const hatsPopped = b.items.filter((i) => i.kind === 'hat').length;
    return { winner: b.winner, time: b.battleTime.toFixed(4), hp: b.units.map((u) => u.hp.toFixed(3)).join(), x: b.units.map((u) => u.hip.x.toFixed(2)).join(), hatsPopped };
  };
  const plain = run(false);
  const dressed = run(true);
  assert.ok(dressed.hatsPopped > 0, 'some hats got knocked off (otherwise this proves nothing)');
  assert.equal(dressed.winner, plain.winner);
  assert.equal(dressed.time, plain.time);
  assert.equal(dressed.hp, plain.hp);
  assert.equal(dressed.x, plain.x);
});
