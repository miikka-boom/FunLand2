// The five newer spells (docs/WOBBLE-WAR-CARDS.md sections 3.5, 3.9 and the
// cards in section 4): Banana Peels (real peel items that trip whoever steps
// on one), Big Sneeze (a shove that blows a crowd back, fliers further), Shaken
// Soda (a warning, then a geyser that hits air too), the Anvil (one big hit
// that drags fliers down) and Bubble Wrap (helps your own side only).

import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, DT } from '../battle/src/sim/battle.js';
import { castSpell, updateSpells, SPELLS } from '../battle/src/sim/spells.js';
import { BUILDINGS, BUILDING_TAKES } from '../battle/src/sim/buildings.js';
import { TOWER_TAKES } from '../battle/src/sim/towers.js';
import { Match } from '../battle/src/sim/match.js';
import { CARDS, levelMul } from '../battle/src/sim/cards.js';
import { UNIT_TYPES } from '../battle/src/sim/unit-types.js';
import { WORLD } from '../battle/src/config.js';

/** An arena battle with the four towers holding their fire (or no towers at all). */
function arena(seed = 1, towers = true) {
  const b = new Battle(seed, { mode: 'arena' });
  if (towers) {
    for (const team of ['blue', 'red']) {
      b.addTower('castle', team, WORLD.castleX[team]);
      b.addTower('guard', team, WORLD.towerX[team]);
    }
  }
  for (const t of b.towers) t.cool = 1e9;
  return b;
}
const tower = (b, team, kind) => b.towers.find((t) => t.team === team && t.kind === kind);

/** Step for `secs`, calling fn(i) after every step; returns every event. */
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
  b.items.every((it) => [it.a, it.b].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) &&
  b.spells.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y));

/** A bean that stands where it is and never swings. */
function still(b, id, team, x, lane = 0.5) {
  const u = b.addUnit(id, team, x, lane);
  u.speed = 0;
  u.cooldown = 1e9;
  return u;
}

/** A Propeller Pal already up at its cruise height (no drop). */
function pal(b, team, x, lane = 0.5) {
  const u = b.addUnit('copter', team, x, lane);
  for (const p of u.parts) p.teleport(0, -UNIT_TYPES.copter.flying.alt);
  u.speed = 0;
  u.cooldown = 1e9;
  return u;
}

const peelX = (it) => (it.a.x + it.b.x) / 2;

// --- Banana Peels ---------------------------------------------------------------------------

test('Banana Peels: five real peel items tossed across the circle on random lanes, at the caster\'s level; they land in about 0.4 s and fade after 8 s', () => {
  const S = SPELLS.bananaPeels;
  const b = arena(1);
  const s = castSpell(b, CARDS.bananaPeels, 'blue', 600, 3);
  const ev0 = b.events.splice(0);
  assert.ok(ev0.some((e) => e.type === 'spellCast' && e.spell === 'peels' && e.entity === s && e.card === 'bananaPeels'));
  assert.equal(s.kind, 'peels');
  for (const k of ['team', 'f', 'x', 'y', 't', 'radius', 'slips', 'done']) assert.ok(k in s, `peels.${k}`);
  assert.equal(s.slips, 0);
  const peels = b.items.filter((it) => it.kind === 'peel');
  assert.equal(peels.length, S.peels);
  assert.deepEqual(s.peels, peels);
  const lanes = new Set();
  for (const it of peels) {
    for (const k of ['team', 'a', 'b', 'con', 'age', 'life', 'uses', 'used', 'laneY']) assert.ok(k in it, `peel.${k}`);
    assert.equal(it.team, 'blue');
    assert.equal(it.uses, S.uses);
    assert.equal(it.used, false);
    assert.equal(it.life, S.life);
    assert.ok(Math.abs(it.dmgMul - levelMul(3)) < 1e-12, 'the caster\'s level rides on the peel');
    assert.ok(it.laneY >= WORLD.groundY && it.laneY <= WORLD.groundY + WORLD.laneDepth);
    assert.ok(Math.abs(peelX(it) - s.x) <= s.radius, `${peelX(it)} outside the circle`);
    assert.ok(it.laneY - it.a.y > 200, 'tossed in from high up');
    lanes.add(it.laneY.toFixed(3));
  }
  assert.ok(lanes.size >= 3, 'on random lanes');
  // Spread evenly across the circle (sorted, gaps of about 2r/5)
  const xs = peels.map(peelX).sort((p, q) => p - q);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] > (2 * s.radius) / S.peels / 2, `bunched up: ${xs}`);
  // Down in about S.toss seconds
  let downAt = null;
  run(b, 1, (i) => {
    if (downAt == null && peels.every((it) => it.a.onGround && it.b.onGround)) downAt = (i + 1) * DT;
  });
  assert.ok(downAt != null && Math.abs(downAt - S.toss) < 0.1, `landed at ${downAt}`);
  // They lie there until their life is up, then fade and are cleared away (and the spell with them)
  run(b, S.life - 1.2);
  assert.equal(b.items.filter((it) => it.kind === 'peel').length, S.peels, 'still there just before 8 s');
  run(b, 2);
  assert.equal(b.items.filter((it) => it.kind === 'peel').length, 0, 'faded away after 8 s');
  assert.ok(!b.spells.includes(s));
  assert.ok(finite(b));
});

test('Banana Peels: a walking Clubber trips within 2 s (knocked down, 8 x level), the peel is kicked back and browns; immunity holds until 1.5 s after it gets up', () => {
  const S = SPELLS.bananaPeels;
  const b = arena(2);
  const s = castSpell(b, CARDS.bananaPeels, 'blue', 600, 2);
  run(b, 0.6); // (they've landed)
  const c = b.addUnit('clubber', 'red', 720, 0.5);
  let slipAt = null;
  let peel = null;
  let px = 0;
  let kickV = 0;
  let downAfter = false;
  let upAt = null;
  let second = null;
  const ev = run(b, 6, (i) => {
    const now = (i + 1) * DT;
    if (slipAt == null && s.slips > 0) {
      slipAt = now;
      peel = s.peels.find((it) => it.used);
      px = peelX(peel);
    } else if (slipAt != null && now - slipAt < 0.05) kickV = Math.max(kickV, Math.abs((peel.a.vx(DT) + peel.b.vx(DT)) / 2));
    if (slipAt != null && c.downT > 0) downAfter = true;
    if (slipAt != null && upAt == null && downAfter && c.downT <= 0) upAt = now;
    if (slipAt != null && second == null && s.slips > 1) second = now;
  });
  const slips = ev.filter((e) => e.type === 'slip' && e.unit === c);
  assert.ok(slipAt != null && slipAt < 2, `tripped at ${slipAt}`);
  assert.ok(slips.length >= 1);
  assert.ok(ev.some((e) => e.type === 'knockdown' && e.unit === c), 'feet up, WHUMP');
  assert.ok(downAfter && upAt != null, 'it gets up again');
  assert.ok(ev.some((e) => e.type === 'peelKick'));
  assert.ok(peel.used && peel.uses === S.uses - 1, 'the peel browns and loses a use');
  assert.ok(kickV > S.kick * 0.5, `kicked at ${kickV.toFixed(0)} px/s`);
  // 8 x level (plus any fall it took: it never took less)
  const hits = ev.filter((e) => e.type === 'slip').length;
  assert.equal(hits, s.slips);
  assert.ok(c.maxHp - c.hp >= S.damage * levelMul(2) * hits - 1e-6, `took ${c.maxHp - c.hp}`);
  // Immune while down and for S.immune s after getting up
  if (second != null) assert.ok(second - upAt >= S.immune - 0.05, `slipped again ${(second - upAt).toFixed(2)} s after getting up`);
  assert.ok(px > 0);
  assert.ok(finite(b));
  // A bean still immune walks the whole row of peels on its feet
  const b2 = arena(2);
  const s2 = castSpell(b2, CARDS.bananaPeels, 'blue', 600, 2);
  run(b2, 0.6);
  const im = b2.addUnit('clubber', 'red', 720, 0.5);
  run(b2, 4, () => {
    im.slipImmuneT = Math.max(im.slipImmuneT, 1);
  });
  assert.ok(im.hip.x < 500, `it got to ${im.hip.x.toFixed(0)}`);
  assert.equal(s2.slips, 0, 'immune: no slips');
});

test('Banana Peels: heavies only skid (no damage, no knockdown); fliers and the caster\'s own side never slip', () => {
  const b = arena(3);
  const s = castSpell(b, CARDS.bananaPeels, 'blue', 600, 1);
  run(b, 0.6);
  const brick = b.addUnit('brick', 'red', 720, 0.5);
  const ev = run(b, 5);
  const skids = ev.filter((e) => e.type === 'skid' && e.unit === brick);
  assert.ok(skids.length >= 1, 'the Brick skids');
  assert.ok(!ev.some((e) => e.type === 'slip' && e.unit === brick));
  assert.ok(!ev.some((e) => e.type === 'knockdown' && e.unit === brick));
  assert.equal(brick.hp, brick.maxHp, 'a skid does no damage');
  assert.equal(s.slips, skids.length, 'a skid uses up the peel like a slip');
  // A flier crosses the peels at cruise height; a blue Clubber walks right over its own side's peels
  for (const [id, team, x0, past] of [
    ['copter', 'red', 720, (u) => u.hip.x < 500],
    ['clubber', 'blue', 480, (u) => u.hip.x > 700],
  ]) {
    const b2 = arena(4);
    const s2 = castSpell(b2, CARDS.bananaPeels, 'blue', 600, 1);
    run(b2, 0.6);
    const u = b2.addUnit(id, team, x0, 0.5);
    if (u.type.flying) for (const q of u.parts) q.teleport(0, -UNIT_TYPES.copter.flying.alt);
    let crossed = false;
    const ev2 = run(b2, 6, () => {
      if (past(u)) crossed = true;
    });
    assert.ok(crossed, `the ${id} went over them (at ${u.hip.x.toFixed(0)})`);
    assert.equal(s2.slips, 0);
    assert.ok(!ev2.some((e) => e.type === 'slip' || e.type === 'skid'));
  }
});

test('Banana Peels: a cast never trips more than 10 beans in all, whatever is left on the ground', () => {
  const S = SPELLS.bananaPeels;
  for (const uses of [S.uses, 5]) {
    const keep = S.uses;
    S.uses = uses; // (more uses than the cap allows: the cap still holds)
    let s;
    let b;
    try {
      b = arena(5);
      s = castSpell(b, CARDS.bananaPeels, 'blue', 600, 1);
    } finally {
      S.uses = keep;
    }
    let k = 0;
    const ev = run(b, 8, (i) => {
      if (i % 30 === 0 && k < 24) b.addUnit('clubber', 'red', 760, (k++ * 0.37) % 1);
    });
    const trips = ev.filter((e) => e.type === 'slip' || e.type === 'skid').length;
    assert.equal(trips, s.slips);
    assert.equal(s.slips, S.maxSlips, `uses ${uses}: ${s.slips} slips`);
    assert.equal(ev.filter((e) => e.type === 'peelKick').length, S.maxSlips);
    assert.ok(finite(b));
  }
});

test('Banana Peels: a blast flings a peel, and it trips beans again where it lands', () => {
  const b = arena(6);
  const s = castSpell(b, CARDS.bananaPeels, 'blue', 600, 1);
  run(b, 0.8);
  const it = s.peels[2];
  const x0 = peelX(it);
  b.blastAt(x0 - 30, -10, { radius: 90, damage: 0, launch: 0, friendly: 0 }, 'blue', 1, null, {});
  let top = 0;
  run(b, 1.5, () => {
    top = Math.max(top, it.laneY - it.a.y);
  });
  const x1 = peelX(it);
  assert.ok(Math.abs(x1 - x0) > 30 && top > 15, `flung ${(x1 - x0).toFixed(0)} px, ${top.toFixed(0)} px up`);
  assert.ok(it.a.onGround && it.b.onGround, 'down again');
  // A bean on its lane walks onto it at its new spot
  const c = b.addUnit('clubber', 'red', x1 + 120, (it.laneY - WORLD.groundY) / WORLD.laneDepth);
  const ev = run(b, 3);
  const slip = ev.find((e) => e.type === 'slip' && e.unit === c);
  assert.ok(slip, 'tripped');
  assert.equal(it.uses, SPELLS.bananaPeels.uses - 1, 'on the flung peel');
});

// --- Big Sneeze -----------------------------------------------------------------------------

test('Big Sneeze: inhales 0.4 s, then ACHOO blows every enemy in the circle toward its own side (fliers further), never its own; a little damage, a shove, hats off', () => {
  const S = SPELLS.bigSneeze;
  const b = arena(7, false);
  const cl = still(b, 'clubber', 'red', 640);
  const far = still(b, 'clubber', 'red', 900); // outside the circle
  const cp = pal(b, 'red', 640);
  const own = still(b, 'clubber', 'blue', 620, 0.1);
  run(b, 1);
  cl.hat = 'tophat';
  const watch = [cl, far, cp, own];
  const x0 = watch.map((u) => u.hip.x);
  const hp0 = watch.map((u) => u.hp);
  const s = castSpell(b, CARDS.bigSneeze, 'blue', 600, 2);
  b.events.length = 0;
  assert.equal(s.kind, 'sneeze');
  assert.equal(s.state, 'inhale');
  const states = [];
  const vmax = watch.map(() => 0);
  const ev = run(b, 1, () => {
    if (states[states.length - 1] !== s.state) states.push(s.state);
    watch.forEach((u, k) => (vmax[k] = Math.max(vmax[k], u.hip.vx(DT))));
  });
  const sn = ev.filter((e) => e.type === 'sneeze');
  assert.equal(sn.length, 1);
  assert.equal(sn[0].spell, s);
  assert.equal(sn[0].radius, s.radius);
  // Before the blow nobody was touched; the blow came at t = inhale
  const idx = ev.indexOf(sn[0]);
  assert.ok(!ev.slice(0, idx).some((e) => e.type === 'hit' || e.type === 'hatOff'));
  assert.deepEqual(states.slice(0, 3), ['inhale', 'blow', 'fade']);
  assert.ok(!b.spells.includes(s), 'gone half a second after the blow');
  // Blown back toward red's side (+x for a blue caster), the flier much further, the far one and the friend untouched
  assert.ok(cl.hip.x - x0[0] > 40, `clubber blown ${(cl.hip.x - x0[0]).toFixed(0)}`);
  assert.ok(vmax[2] > vmax[0] * 1.5, `flier ${vmax[2].toFixed(0)} vs ground ${vmax[0].toFixed(0)} px/s`);
  assert.ok(cp.hip.x - x0[2] > cl.hip.x - x0[0]);
  assert.equal(far.hp, hp0[1]);
  assert.ok(Math.abs(far.hip.x - x0[1]) < 2);
  assert.equal(own.hp, hp0[3], 'never its own side');
  assert.ok(vmax[3] < 30, `the friend moved at ${vmax[3].toFixed(0)} px/s`);
  // A little damage at the card level, a shove (anti-lock armed), the hat popped
  for (const k of [0, 2]) assert.ok(Math.abs(hp0[k] - watch[k].hp - S.damage * levelMul(2)) < 1e-6, `${watch[k].type.id} took ${hp0[k] - watch[k].hp}`);
  assert.ok(cl.shoveT > 0, 'a shove');
  assert.equal(cl.hat, null);
  assert.ok(ev.some((e) => e.type === 'hatOff' && e.unit === cl));
  assert.ok(!ev.some((e) => e.type === 'knockdown' && e.unit === cl), 'never a knockdown on its own');
  assert.ok(finite(b));
});

test('Big Sneeze: heavies barely move; a holder drops its catch; towers take half, buildings three quarters', () => {
  const S = SPELLS.bigSneeze;
  const b = arena(8, false);
  const cl = still(b, 'clubber', 'red', 620);
  const br = still(b, 'brick', 'red', 560, 0.2);
  const holder = still(b, 'clubber', 'red', 680, 0.8);
  const catchee = still(b, 'sprout', 'blue', 690, 0.8);
  run(b, 1);
  b.hold(holder, catchee);
  const x0 = [cl.hip.x, br.hip.x];
  castSpell(b, CARDS.bigSneeze, 'blue', 600, 1);
  const ev = run(b, 1);
  assert.ok(br.hip.x - x0[1] < (cl.hip.x - x0[0]) * 0.5, `brick ${(br.hip.x - x0[1]).toFixed(0)} vs clubber ${(cl.hip.x - x0[0]).toFixed(0)}`);
  const lg = ev.filter((e) => e.type === 'letGo');
  assert.equal(lg.length, 1);
  assert.equal(lg[0].unit, holder);
  assert.equal(lg[0].victim, catchee);
  assert.equal(lg[0].why, 'sneeze');
  assert.ok(!catchee.held && holder.holding == null);
  assert.equal(catchee.hp, catchee.maxHp, 'the rescued bean is the caster\'s: unhurt');
  // Structures
  const t = arena(9);
  const g = tower(t, 'red', 'guard');
  const box = t.addBuilding('boingBox', 'red', g.x - 130, 1);
  const hg = g.hp;
  const hb = box.hp;
  castSpell(t, CARDS.bigSneeze, 'blue', g.x - 70, 1);
  const tev = run(t, 0.5);
  const towerHits = tev.filter((e) => e.type === 'towerHit');
  const of = (tw) => towerHits.filter((e) => e.tower === tw).reduce((a, e) => a + e.damage, 0);
  assert.ok(Math.abs(of(g) - S.damage * TOWER_TAKES.spell) < 1e-6, `tower took ${of(g)}`);
  assert.ok(Math.abs(of(box) - S.damage * BUILDING_TAKES.spell) < 1e-6, `building took ${of(box)}`);
  assert.ok(g.hp < hg && box.hp < hb);
});

// --- Shaken Soda ----------------------------------------------------------------------------

test('Shaken Soda: fizzes 1.2 s (shake 0 -> 1, nothing hurt), then erupts once: beans go straight up (heavies barely), fliers lose their lift, towers take half; no Bomb is lit', () => {
  const S = SPELLS.shakenSoda;
  const b = arena(10);
  const cl = still(b, 'clubber', 'red', 600);
  const br = still(b, 'brick', 'red', 630, 0.2);
  const cp = pal(b, 'red', 580);
  cp.hp = cp.maxHp = 1e4;
  const bm = still(b, 'bomb', 'red', 560, 0.8); // (no blue bean near it: it would light its own fuse)
  run(b, 1);
  const watch = [cl, br, cp, bm];
  const hp0 = watch.map((u) => u.hp);
  const s = castSpell(b, CARDS.shakenSoda, 'blue', 600, 1);
  b.events.length = 0;
  assert.equal(s.kind, 'soda');
  assert.equal(s.state, 'fizz');
  let eruptAt = null;
  let shake = 0;
  let shakeUp = true;
  const up = watch.map(() => 0);
  const states = [];
  let goneAt = null;
  const ev = run(b, 3, (i) => {
    const now = (i + 1) * DT;
    if (states[states.length - 1] !== s.state) states.push(s.state);
    if (s.state === 'fizz') {
      if (s.shake < shake - 1e-12) shakeUp = false;
      shake = s.shake;
      assert.ok(watch.every((u, k) => u.hp === hp0[k]), 'nothing hurt during the fizz');
    }
    if (eruptAt == null && s.state !== 'fizz') eruptAt = now;
    if (goneAt == null && !b.spells.includes(s)) goneAt = now;
    watch.forEach((u, k) => (up[k] = Math.max(up[k], u.ground - u.hip.y - u.standH)));
  });
  assert.ok(shakeUp && shake > 0.95, 'the shake builds up to 1');
  assert.ok(Math.abs(eruptAt - S.fuse) < DT * 1.5, `erupted at ${eruptAt}`);
  assert.equal(ev.filter((e) => e.type === 'sodaErupt').length, 1);
  assert.deepEqual(states, ['fizz', 'erupt', 'fade']);
  assert.ok(Math.abs(goneAt - (S.fuse + S.erupt + 0.5)) < 0.05, `gone at ${goneAt}`);
  // Up they go: light beans high, the Brick hardly, the flier tumbles with its lift off
  assert.ok(up[0] > 150, `clubber ${up[0].toFixed(0)} px up`);
  assert.ok(up[1] < up[0] * 0.3, `brick ${up[1].toFixed(0)} px up`);
  assert.ok(ev.some((e) => e.type === 'liftOff' && e.unit === cp), 'the flier loses its lift');
  for (const k of [0, 1, 2, 3]) assert.ok(hp0[k] - watch[k].hp >= S.damage - 1e-6, `${watch[k].type.id} took ${hp0[k] - watch[k].hp}`);
  assert.ok(bm.alive && !(bm.act && bm.act.phase === 'fuse') && !ev.some((e) => e.type === 'fuse'), 'it does not light Bombs');
  // Towers in reach take half; the caster's own beans on top stay put
  const t = arena(11);
  const g = tower(t, 'red', 'guard');
  const own = still(t, 'clubber', 'blue', g.x - 70, 0.5);
  run(t, 0.5);
  const hg = g.hp;
  const oy = own.hip.y;
  castSpell(t, CARDS.shakenSoda, 'blue', g.x - 60, 1);
  let rise = 0;
  run(t, 1.5, () => {
    rise = Math.max(rise, oy - own.hip.y);
  });
  assert.ok(Math.abs(hg - g.hp - S.damage * TOWER_TAKES.spell) < 1e-6, `tower took ${hg - g.hp}`);
  assert.equal(own.hp, own.maxHp, 'never its own side');
  assert.ok(rise < 10, `the friend rose ${rise.toFixed(0)} px`);
  assert.ok(finite(b));
});

// --- Anvil ----------------------------------------------------------------------------------

test('Anvil: straight down for 0.9 s, CLANG: kills a Bruiser, a Squire\'s shield takes 60%, a survivor is squashed; towers take half, buildings three quarters', () => {
  const S = SPELLS.anvil;
  const b = arena(12);
  const br = still(b, 'bruiser', 'red', 600);
  const sq = still(b, 'squire', 'red', 480);
  const bk = still(b, 'brick', 'red', 720);
  const g = tower(b, 'red', 'guard');
  const box = b.addBuilding('boingBox', 'red', 1000, 1);
  box.punch = null;
  run(b, 1.2);
  const targets = [br, sq, bk, g, box];
  const hp0 = targets.map((u) => u.hp);
  const casts = [br, sq, bk].map((u) => castSpell(b, CARDS.anvil, 'blue', u.hip.x, 1));
  casts.push(castSpell(b, CARDS.anvil, 'blue', g.x, 1), castSpell(b, CARDS.anvil, 'blue', box.x, 1));
  const a = casts[0];
  assert.equal(a.kind, 'anvil');
  for (const k of ['team', 'f', 'x', 'y', 'vx', 'vy', 't', 'r', 'state', 'alpha', 'done']) assert.ok(k in a, `anvil.${k}`);
  assert.equal(a.r, 18);
  assert.equal(a.state, 'fall');
  assert.ok(a.y < -500, 'from way up');
  const x0 = a.x;
  let landAt = null;
  let squash = 0;
  const ev = run(b, 3.2, (i) => {
    const now = (i + 1) * DT;
    if (a.state === 'fall') assert.equal(a.x, x0, 'straight down');
    if (landAt == null && a.state === 'rest') landAt = now;
    if (bk.squashT > squash) squash = bk.squashT;
  });
  const impacts = ev.filter((e) => e.type === 'anvilImpact');
  assert.ok(Math.abs(landAt - S.fall) < DT * 1.5, `landed at ${landAt}`);
  assert.ok(Math.abs(a.y - (WORLD.groundY + WORLD.laneDepth / 2 - a.r)) < 1e-6, `rests at ${a.y}`);
  assert.equal(b.spells.length, 0, 'rested, faded and gone');
  assert.equal(impacts.length, 5);
  assert.ok(impacts.every((e) => e.power > 0 && e.hits === 1));
  assert.ok(!br.alive, 'the Bruiser is flattened');
  assert.ok(Math.abs(hp0[1] - sq.hp - S.damage * S.shield) < 1e-6, `the Squire took ${hp0[1] - sq.hp}`);
  assert.ok(bk.alive && Math.abs(hp0[2] - bk.hp - S.damage) < 1e-6, `the Brick took ${hp0[2] - bk.hp}`);
  assert.ok(squash > S.squash - 0.05, 'and is squashed flat');
  assert.ok(Math.abs(hp0[3] - g.hp - S.damage * TOWER_TAKES.spell) < 1e-6, `the tower took ${hp0[3] - g.hp}`);
  // (the box decays a little meanwhile, silently)
  const decay = (box.maxHp / BUILDINGS.boingBox.life) * 3.2;
  assert.ok(Math.abs(hp0[4] - box.hp - S.damage * BUILDING_TAKES.spell - decay) < 0.5, `the building took ${hp0[4] - box.hp - decay}`);
  assert.ok(finite(b));
});

test('Anvil: a Propeller Pal in its column, high up, is hit and dragged out of the sky with its lift off; level scales the hit', () => {
  const S = SPELLS.anvil;
  const b = arena(13, false);
  const cp = pal(b, 'red', 600);
  cp.hp = cp.maxHp = 1e4; // (to watch it fall)
  run(b, 1);
  assert.ok(cp.air, 'high air');
  const hp0 = cp.hp;
  castSpell(b, CARDS.anvil, 'blue', cp.hip.x, 3);
  let hitAt = null;
  let lowAt = null;
  const ev = run(b, 2.5, (i) => {
    const now = (i + 1) * DT;
    if (hitAt == null && cp.hp < hp0) hitAt = now;
    if (hitAt != null && lowAt == null && cp.alt < 25) lowAt = now;
  });
  assert.ok(hitAt != null, 'hit at cruise height');
  assert.ok(ev.some((e) => e.type === 'liftOff' && e.unit === cp), 'lift off');
  assert.ok(lowAt != null && lowAt - hitAt < 0.6, `down ${lowAt && (lowAt - hitAt).toFixed(2)} s after the hit`);
  assert.ok(hp0 - cp.hp >= S.damage * levelMul(3) - 1e-6, `took ${hp0 - cp.hp}`);
  // A normal Pal is simply gone
  const b2 = arena(14, false);
  const p2 = pal(b2, 'red', 600);
  run(b2, 1);
  castSpell(b2, CARDS.anvil, 'blue', p2.hip.x, 1);
  run(b2, 1.2);
  assert.ok(!p2.alive);
  assert.ok(finite(b));
});

// --- Bubble Wrap ----------------------------------------------------------------------------

test('Bubble Wrap: wraps only its own team in the circle (ground, air, still dropping) for 8 s with 70 x level; a recast refreshes it, never stacks', () => {
  const S = SPELLS.bubbleWrap;
  const b = arena(15);
  const mine = [b.addUnit('clubber', 'blue', 580, 0.5), pal(b, 'blue', 620), b.addUnit('squire', 'blue', 640, 0.5, null, { drop: true })];
  const out = b.addUnit('clubber', 'blue', 800, 0.5);
  const foe = b.addUnit('clubber', 'red', 610, 0.2);
  b.events.length = 0;
  const s = castSpell(b, CARDS.bubbleWrap, 'blue', 600, 3);
  const ev = b.events.splice(0);
  assert.equal(s.kind, 'wrap');
  assert.ok(ev.some((e) => e.type === 'spellCast' && e.spell === 'wrap'));
  const wraps = ev.filter((e) => e.type === 'wrap');
  assert.deepEqual(wraps.map((e) => e.unit).sort((p, q) => p.id - q.id), mine.slice().sort((p, q) => p.id - q.id));
  for (const u of mine) {
    assert.ok(Math.abs(u.wrapHp - S.absorb * levelMul(3)) < 1e-9, `${u.type.id} wrapHp ${u.wrapHp}`);
    assert.equal(u.wrapMax, u.wrapHp);
    assert.equal(u.wrapT, S.time);
  }
  assert.equal(foe.wrapHp, 0, 'never the enemy');
  assert.equal(out.wrapHp, 0, 'only inside the circle');
  // The puff is gone after half a second; the wraps stay
  run(b, 0.6);
  assert.ok(!b.spells.includes(s));
  // Recast on a used wrap: back to full, never more
  const u = mine[0];
  u.wrapHp = 10;
  castSpell(b, CARDS.bubbleWrap, 'blue', 600, 3);
  assert.ok(Math.abs(u.wrapHp - S.absorb * levelMul(3)) < 1e-9, `refreshed to ${u.wrapHp}`);
  assert.equal(u.wrapT, S.time);
  assert.ok(finite(b));
});

// --- all five --------------------------------------------------------------------------------

test('every new spell card casts its own entity kind through castSpell, anywhere on the field, and retires on its own', () => {
  const kinds = { bananaPeels: 'peels', bigSneeze: 'sneeze', shakenSoda: 'soda', anvil: 'anvil', bubbleWrap: 'wrap' };
  for (const [id, kind] of Object.entries(kinds)) {
    assert.equal(CARDS[id].kind, 'spell');
    assert.ok(SPELLS[CARDS[id].spell], `${id}: SPELLS entry`);
    for (const x of [-50, 0, 750, WORLD.width, WORLD.width + 50]) {
      const b = arena(16);
      const s = castSpell(b, CARDS[id], 'red', x, 1);
      assert.equal(s.kind, kind);
      assert.equal(s.team, 'red');
      assert.equal(s.f, -1);
      assert.ok(s.x >= 0 && s.x <= WORLD.width, `${id} at ${s.x}`);
      run(b, 12);
      assert.ok(!b.spells.includes(s), `${id} never finished`);
      assert.ok(finite(b));
    }
  }
  // An empty spell list costs nothing (updateSpells on nothing is a no-op)
  const b = arena(17);
  updateSpells(b, DT);
  assert.equal(b.spells.length, 0);
});

test('determinism: a match with the five new spells replays identically', () => {
  const play = () => {
    const deck = ['clubbers', 'squire', 'archers', 'spikers', 'bomb', 'arrowRain', 'boulder', 'clubberGang'];
    const m = new Match({ seed: 23, blue: { deck }, red: { deck } });
    const hands = {
      blue: ['bananaPeels', 'bigSneeze', 'shakenSoda', 'clubberGang'],
      red: ['anvil', 'bubbleWrap', 'clubbers', 'spikers'],
    };
    for (const team of ['blue', 'red']) {
      m.sides[team].hand = hands[team].slice();
      m.sides[team].queue = [];
    }
    const plays = [
      [10, 'blue', 3, 500],
      [30, 'red', 2, 1000],
      [60, 'red', 3, 980],
      [200, 'blue', 0, 760],
      [420, 'red', 1, 900],
      [450, 'blue', 2, 800],
      [600, 'red', 0, 620],
      [640, 'blue', 1, 700],
    ];
    for (let i = 0; i < 30 / DT; i++) {
      for (const [at, team, k, x] of plays) {
        if (at !== i) continue;
        m.sides[team].mana = 10;
        assert.equal(m.play(team, k, x), true, `${team} ${m.sides[team].hand[k]} at step ${i}`);
      }
      m.step();
    }
    const b = m.battle;
    const out = [];
    for (const u of b.units) out.push(u.id, u.hip.x.toFixed(6), u.hp.toFixed(6), u.wrapHp.toFixed(6));
    for (const t of b.towers) out.push(t.id, t.hp.toFixed(6));
    for (const it of b.items) out.push(it.kind, it.a.x.toFixed(6));
    out.push(b.events.length, b.rng.s);
    return out.join(',');
  };
  assert.equal(play(), play());
});
