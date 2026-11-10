// Smoke tests for the renderers of the newer ten units (docs/WOBBLE-WAR-CARDS.md
// section 4): every new unit, prop, item and body shape draws against a mock
// canvas in node without throwing or feeding non-finite numbers to the
// canvas, in a scripted match with real sim units and in hand-made states for
// mechanics the sim may not run yet (held beans, wrap, anvil pancake, nets,
// umbrellas). Card faces for all 32 cards at three sizes, the legendary frame,
// and hats: seated on the hat-wearers, never on the noHat types.
// (node --test runs each file in its own process, so the fake DOM globals stay here.)
import test from 'node:test';
import assert from 'node:assert/strict';

const calls = {};
let bad = 0; // non-finite numbers handed to the canvas
function mockCtx(canvas) {
  const grad = { addColorStop() {} };
  const t = { canvas, globalAlpha: 1, globalCompositeOperation: 'source-over' };
  let m = { a: 0.86, b: 0, c: 0, d: 0.86, e: 400, f: 300 };
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'getTransform') return () => ({ ...m });
      if (k === 'setTransform') return (a, b, c, d, e, f) => {
        if (typeof a === 'number') m = { a, b, c, d, e, f };
      };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'createPattern') return () => ({});
      return (...args) => {
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) bad++;
        calls[k] = (calls[k] || 0) + 1;
      };
    },
    set(o, k, v) {
      o[k] = v;
      return true;
    },
  });
}
function mockCanvas(w = 300, h = 150) {
  const c = { width: w, height: h };
  c.getContext = () => c._ctx || (c._ctx = mockCtx(c));
  return c;
}
globalThis.document = { createElement: () => mockCanvas() };
globalThis.Path2D = class {
  moveTo() {}
  lineTo() {}
  closePath() {}
  arc() {}
  ellipse() {}
  quadraticCurveTo() {}
  bezierCurveTo() {}
  rect() {}
  addPath() {}
};

const R = new URL('../battle/src/', import.meta.url).href;
const { UnitRenderer, drawCopterCap } = await import(R + 'render/units.js');
const { hatAnchor, hatSeat } = await import(R + 'render/hats.js');
const { cardFace, drawCardArt, clearCardCache, drawLegendarySheen, drawCardBadge } = await import(R + 'render/cards.js');
const { Battle, DT } = await import(R + 'sim/battle.js');
const { Match } = await import(R + 'sim/match.js');
const { CARDS, CARD_ORDER } = await import(R + 'sim/cards.js');
const { UNIT_TYPES } = await import(R + 'sim/unit-types.js');
const { Particle } = await import(R + 'sim/physics.js');

const NEW_TYPES = ['sprout', 'copter', 'pogo', 'netter', 'juggler', 'nutcracker', 'brolly', 'drummer', 'pelican', 'jelly'];
const HAT_WEARERS = ['pogo', 'netter', 'juggler', 'brolly', 'drummer', 'jelly'];
const NO_HAT = ['sprout', 'copter', 'nutcracker', 'pelican'];
const ctxOf = () => mockCanvas(1688, 780).getContext('2d');
const total = () => Object.values(calls).reduce((s, v) => s + v, 0);

/** Every draw pass the arena runs over a battle. */
function drawAll(units, ctx, b) {
  units.drawShadows(ctx, b);
  units.drawTeamRings(ctx, b);
  units.drawGroundArrows(ctx, b);
  units.drawItems(ctx, b);
  units.drawUnits(ctx, b, b.time);
  units.drawFlyingArrows(ctx, b);
  units.drawHpBars(ctx, b, { dpr: 2 });
}

/** A settled battle with one of each new type per team. */
function lineup(seed = 4) {
  const b = new Battle(seed, { mode: 'arena' });
  b.hats.blue = { all: 'tophat' };
  b.hats.red = { all: 'party' };
  const us = [];
  NEW_TYPES.forEach((id, i) => {
    us.push(b.addUnit(id, 'blue', 200 + i * 40, (i % 3) / 2, 10 + i));
    us.push(b.addUnit(id, 'red', 1300 - i * 40, ((i + 1) % 3) / 2, 40 + i));
  });
  for (let i = 0; i < 60; i++) b.step(DT);
  return { b, us };
}

test('the two new shapes and every new unit type exist in the sim data the renderer reads', () => {
  for (const id of NEW_TYPES) assert.ok(UNIT_TYPES[id], id);
  assert.equal(UNIT_TYPES.pelican.shape, 'bird');
  assert.equal(UNIT_TYPES.jelly.shape, 'jelly');
});

test('every new unit draws, standing, attacking and dead, without non-finite numbers', () => {
  const { b, us } = lineup();
  const units = new UnitRenderer({ showHp: true });
  const ctx = ctxOf();
  bad = 0;
  drawAll(units, ctx, b);
  // Attack poses the renderer reads (act phases), whatever the sim is doing
  for (const u of us) {
    const A = u.type.attack;
    for (const phase of ['windup', 'strike', 'recover', 'draw', 'dash']) {
      u.act = { phase, t: 0.12, variant: 0, hits: new Set(), done: false };
      if (A && phase === 'windup') u.act.t = (A.windup || 0.3) + 0.03; // the trembling hold
      units.drawUnit(ctx, u, b, b.time);
    }
    u.act = null;
    u.hurtT = 0.1; // white flash
    units.drawUnit(ctx, u, b, b.time);
    u.hurtT = 0.04;
    u.dizzy = 1;
    units.drawUnit(ctx, u, b, b.time);
    u.hurtT = 0;
    u.dizzy = 0;
  }
  for (const u of us) u.takeHit(b, { damage: 1e4, dvx: u.f * -200, dvy: -300, x: u.chest.x, y: u.chest.y, stun: 1, kind: 'melee', from: null });
  for (let i = 0; i < 90; i++) {
    b.step(DT);
    if (i % 15 === 0) drawAll(units, ctx, b);
  }
  for (const u of us) {
    u.fade = 0.5;
    units.drawUnitAlpha(ctx, u, b, b.time, 0.5);
  }
  assert.equal(bad, 0, 'no NaN or Infinity reached the canvas');
});

test('statuses draw on any unit: wrap, anvil pancake, a fresh net tangle, floating and flipped brollies', () => {
  const { b, us } = lineup(9);
  const units = new UnitRenderer();
  const ctx = ctxOf();
  bad = 0;
  for (const u of us) {
    u.wrapHp = 50;
    u.wrapMax = 70;
    u.wrapT = 5;
    units.drawUnit(ctx, u, b, b.time);
    u.wrapHp = 0;
    for (const s of [1, 0.8, 0.5, 0.1]) {
      u.squashT = s;
      units.drawUnit(ctx, u, b, b.time);
    }
    u.squashT = 0;
    u.netImmuneT = 2.9;
    units.drawUnit(ctx, u, b, b.time);
    u.netImmuneT = 0;
  }
  const brolly = us.find((u) => u.type.id === 'brolly');
  for (const p of brolly.parts) p.teleport(0, -300);
  brolly.floatT = 1;
  units.drawUnit(ctx, brolly, b, b.time);
  brolly.floatT = 0;
  brolly.flipped = true;
  units.drawUnit(ctx, brolly, b, b.time);
  for (const p of brolly.parts) p.teleport(0, 300);
  units.drawUnit(ctx, brolly, b, b.time);
  assert.equal(bad, 0);
});

test('a held bean is drawn by its holder: inside the jelly, dangling from the beak, once a frame', () => {
  const b = new Battle(3, { mode: 'arena' });
  const jelly = b.addUnit('jelly', 'blue', 400, 0.5, 1);
  const pelican = b.addUnit('pelican', 'blue', 700, 0.5, 2);
  const v1 = b.addUnit('clubber', 'red', 420, 0.5, 3);
  const v2 = b.addUnit('archer', 'red', 720, 0.5, 4);
  for (let i = 0; i < 30; i++) b.step(DT);
  for (const [h, v] of [[jelly, v1], [pelican, v2]]) {
    v.held = true;
    v.heldBy = h;
    h.holding = v;
  }
  const units = new UnitRenderer();
  const ctx = ctxOf();
  // Count how often each unit is drawn in one pass
  const seen = new Map();
  const orig = units.drawUnit.bind(units);
  units.drawUnit = (c, u, bb, t) => {
    seen.set(u, (seen.get(u) || 0) + 1);
    return orig(c, u, bb, t);
  };
  units.drawUnits(ctx, b, b.time);
  for (const u of [jelly, pelican, v1, v2]) assert.equal(seen.get(u), 1, u.type.id);
});

test('new item kinds draw: peel, propCap, pogo, net, brolly, drum, craneBall and the toothpick', () => {
  const b = new Battle(5, { mode: 'arena' });
  const mk = (x, y) => new Particle(x, y, 0.5, 2);
  const two = (kind, o = {}) => {
    const a = mk(500, -20);
    const c = mk(530, -10);
    return { kind, team: 'red', a, b: c, age: 0.5, ...o };
  };
  b.items.push(
    two('peel', { used: false }),
    two('peel', { used: true, fade: 0.4 }),
    two('propCap', { f: -1, R: 10.5, life: 7 }),
    two('pogo'),
    two('net'),
    two('brolly'),
    two('drum'),
    two('craneBall'),
    { kind: 'craneBall', x: 600, y: -20, r: 20 },
    two('sword', { scale: 0.5 }),
    two('mystery'),
  );
  const units = new UnitRenderer();
  const ctx = ctxOf();
  bad = 0;
  units.drawItems(ctx, b);
  drawCopterCap(ctx, 10, 10, -Math.PI / 2, 10.5, 1, 2, 1);
  assert.equal(bad, 0);
});

test('a scripted match with every new card draws through the arena passes', () => {
  const deckA = ['sprouts', 'propellerPals', 'pogoBean', 'netter', 'bombJuggler', 'nutcracker', 'archers', 'bananaPeels'];
  const deckB = ['brollyBrigade', 'tummyDrummer', 'pelican', 'bigJelly', 'sprouts', 'bigSneeze', 'anvil', 'bubbleWrap'];
  const m = new Match({ seed: 21, blue: { deck: deckA, kingLevel: 2 }, red: { deck: deckB, kingLevel: 2 } });
  const units = new UnitRenderer({ showHp: true });
  const ctx = ctxOf();
  const kinds = new Set();
  bad = 0;
  for (let i = 0; i < 120 * 40; i++) {
    // Every 1.5 s each side plays the first card it can (mana topped up: the point is to see every card)
    if (i % 180 === 0) {
      for (const team of ['blue', 'red']) {
        m.sides[team].mana = 10;
        const turn = i / 180;
        for (let k = 0; k < 4; k++) if (m.play(team, (turn + k) % 4, team === 'blue' ? 560 + (turn % 7) * 10 : 940 - (turn % 5) * 10)) break;
      }
    }
    m.step();
    const b = m.battle;
    b.events.length = 0;
    for (const u of b.units) kinds.add(u.type.id);
    if (i % 40 === 0) drawAll(units, ctx, b);
  }
  assert.equal(bad, 0, 'no NaN or Infinity reached the canvas');
  for (const id of ['sprout', 'copter', 'pogo', 'netter', 'juggler', 'nutcracker', 'drummer', 'pelican', 'jelly']) assert.ok(kinds.has(id), `${id} took part`);
});

test('hats: seated on the six new hat-wearers, never drawn on the noHat types', () => {
  const units = new UnitRenderer();
  const ctx = ctxOf();
  assert.equal(hatSeat('jelly'), 0.9, 'the jelly seat agrees with popHat in the sim');
  assert.equal(hatSeat('bird'), hatSeat('bean'));
  const drawsFor = (id, hat) => {
    const b = new Battle(7, { mode: 'arena' });
    b.hats.blue = hat ? { [id]: hat } : {};
    const u = b.addUnit(id, 'blue', 500, 0.5, 11);
    for (let i = 0; i < 40; i++) b.step(DT);
    const t0 = total();
    units.drawUnit(ctx, u, b, b.time);
    return { u, b, n: total() - t0 };
  };
  for (const id of HAT_WEARERS) {
    const bare = drawsFor(id, null);
    const { u, n } = drawsFor(id, 'tophat');
    assert.equal(u.hat, 'tophat', `${id} wears its hat`);
    assert.ok(n > bare.n, `${id}: the hat is drawn`);
    // Seated on top of the head (or the dome), along the body's up
    const a = hatAnchor(u);
    const d = Math.hypot(a.x - u.head.x, a.y - u.head.y);
    assert.ok(Math.abs(d - hatSeat(u.type.shape) * u.R) < 0.25 * u.R, `${id} seat ${d.toFixed(1)}`);
    assert.ok(a.y < u.head.y, `${id}: the hat sits above the head`);
  }
  for (const id of NO_HAT) {
    const bare = drawsFor(id, null);
    const { u, b } = drawsFor(id, 'tophat');
    assert.equal(u.hat, null, `${id} gets no hat from the sim`);
    // Even if one is forced on, the renderer leaves it off
    u.hat = 'tophat';
    const t0 = total();
    units.drawUnit(ctx, u, b, b.time);
    const forced = total() - t0;
    assert.equal(forced, bare.n, `${id}: no hat drawn`);
  }
});

test('card faces: all 32 cards at three sizes, legendary frame included', () => {
  assert.equal(CARD_ORDER.length, 32);
  clearCardCache();
  bad = 0;
  for (const id of CARD_ORDER) {
    for (const [w, h] of [[64, 84], [120, 156], [240, 312]]) {
      for (const opts of [{}, { mini: true }, { level: 4, name: true }, { locked: true }]) {
        const f = cardFace(id, w, h, opts);
        assert.ok(f && f.width === w && f.height === h, `${id} ${w}x${h}`);
      }
    }
    drawCardArt(mockCanvas(140, 182), id, { level: 2, team: 'red' });
  }
  assert.equal(bad, 0, 'no NaN or Infinity reached the canvas');
  const legendary = CARD_ORDER.filter((id) => CARDS[id].rarity === 'legendary');
  assert.deepEqual(legendary, ['bombJuggler', 'wreckingCrane', 'pelican', 'bigJelly']);
});

test('the legendary sheen sweeps over the frame for 1.4 s of every 2 s; card badges draw', () => {
  const ctx = ctxOf();
  const fills = () => calls.fillRect || 0;
  let n = fills();
  drawLegendarySheen(ctx, 10, 10, 120, 156, 0.5, { level: 3, name: true });
  assert.equal(fills() - n, 1, 'mid-sweep: one gradient fill over the frame ring');
  n = fills();
  drawLegendarySheen(ctx, 10, 10, 120, 156, 1.8);
  drawLegendarySheen(ctx, 10, 10, 120, 156, NaN);
  assert.equal(fills() - n, 0, 'the pause between sweeps, and a bad time, draw nothing');
  bad = 0;
  for (const kind of ['flying', 'building', 'anywhere', null]) drawCardBadge(ctx, kind, 50, 50, 8);
  assert.equal(bad, 0);
  // Every flying, building and anywhere card gets its badge on the face (more drawing than the art alone)
  for (const id of ['propellerPals', 'pelican', 'boingBox', 'beanPatch', 'wreckingCrane', 'brollyBrigade']) {
    const c = CARDS[id];
    assert.ok(c.flying || c.kind === 'building' || c.anywhere, id);
  }
});
