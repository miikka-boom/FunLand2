import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, DT } from '../battle/src/sim/battle.js';
import { UNIT_TYPES } from '../battle/src/sim/unit-types.js';
import { ROUNDS } from '../battle/src/campaign.js';
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

test('campaign rounds are well formed', () => {
  const cheapest = Math.min(...Object.values(UNIT_TYPES).map((t) => t.cost));
  for (const r of ROUNDS) {
    assert.ok(r.name && r.tip && r.budget >= cheapest);
    assert.ok(r.red.length > 0);
    for (const s of r.red) {
      assert.ok(UNIT_TYPES[s.type], s.type);
      assert.ok(s.x >= WORLD.zone.red[0] && s.x <= WORLD.zone.red[1], `${r.name}: x ${s.x} outside red zone`);
    }
  }
});
