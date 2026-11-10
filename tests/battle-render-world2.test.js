// Smoke tests for the world renderers of the 32 cards (buildings, the new
// spells, Juggler bombs, aim ghosts and effects): every state draws against a
// mock canvas in node without throwing, on hand-made fake states (the field
// contract of docs/WOBBLE-WAR-CARDS.md, 3.3 / 4 / 6.3 / 6.4).
// (node --test runs each file in its own process, so the fake DOM globals stay here.)
import test from 'node:test';
import assert from 'node:assert/strict';

const calls = {};
function mockCtx(canvas) {
  const grad = { addColorStop() {} };
  const t = { canvas, globalAlpha: 1, globalCompositeOperation: 'source-over' };
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'getTransform') return () => ({ a: 0.86, b: 0, c: 0, d: 0.86, e: 400, f: 300 });
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'createPattern') return () => ({});
      return (...args) => {
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) calls.nonFinite = (calls.nonFinite || 0) + 1;
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

const R = new URL('../battle/src/', import.meta.url).href;
const { createTowerRenderer } = await import(R + 'render/towers.js');
const BL = await import(R + 'render/buildings.js');
const SP = await import(R + 'render/spells.js');
const { Effects, fxForEvent } = await import(R + 'render/effects.js');
const { UnitRenderer } = await import(R + 'render/units.js');
const { CARDS } = await import(R + 'sim/cards.js');
const { Battle, DT } = await import(R + 'sim/battle.js');

const count = (k) => calls[k] || 0;
const ctxOf = () => mockCanvas(1688, 780).getContext('2d');

// --- fake states (contract 3.3 / 6.3) ----------------------------------------------------

const LOOK = { boingBox: [46, 46, 320, 25], beanPatch: [64, 40, 360, 24], wreckingCrane: [36, 170, 700, 28] };
function building(bid, team = 'blue', o = {}) {
  const [w, h, hp, life] = LOOK[bid];
  const f = team === 'blue' ? 1 : -1;
  const b = {
    kind: 'building', bid, def: { life, arm: 1 }, building: true, isTower: true, team, f, x: 600, w, h, hp: hp * 0.8, maxHp: hp,
    alive: true, active: true, level: 2, dmgMul: 1.1, range: 0, age: 5, landT: 0.35, hitT: 99, downT: -1, shotT: 99, aim: 0, arrows: [],
  };
  if (bid === 'boingBox') b.punch = { phase: 'idle', t: 0, ext: 0, dir: f };
  if (bid === 'beanPatch') b.spawn = { next: 2, kids: [] };
  if (bid === 'wreckingCrane') b.ball = { ang: 0, angV: 0, x: 600 + f * 34, y: -45, vx: 0, vy: 0, hits: new Set() };
  return Object.assign(b, o);
}

/** Every state of every building (contract 9, W4 tests: dropping, idle, punching, spawning, swinging, wilted, down). */
function allStates() {
  const out = [];
  for (const team of ['blue', 'red']) {
    for (const bid of Object.keys(LOOK)) {
      const life = LOOK[bid][3];
      out.push(
        building(bid, team, { landT: 0, age: 0 }),
        building(bid, team, { landT: 0.2, age: 0.2 }),
        building(bid, team, { landT: 0.35, age: 0.5 }), // landing squash
        building(bid, team, { age: 3 }),
        building(bid, team, { age: life * 0.55, hp: 100 }), // tired, damaged
        building(bid, team, { age: life * 0.95, hp: 20, hitT: 0.05 }), // wilted, flashing
        building(bid, team, { alive: false, hp: 0, downT: 0 }),
        building(bid, team, { alive: false, hp: 0, downT: 0.3 }),
        building(bid, team, { alive: false, hp: 0, downT: 1.2 }),
        building(bid, team, { alive: false, hp: 0, downT: 2.5 }),
        building(bid, team, { alive: false, hp: 0, downT: 3.5 }), // gone (fully faded)
      );
    }
    for (const [phase, ext, pt] of [['idle', 0, 0], ['windup', 0, 0.1], ['out', 0.5, 0.04], ['hold', 1, 0.03], ['back', 0.6, 0.2], ['recharge', 0, 0.5]]) {
      out.push(building('boingBox', team, { punch: { phase, t: pt, ext, dir: team === 'blue' ? -1 : 1 } }));
    }
    for (const [next, kids] of [[0.2, []], [0.01, [1, 2]], [3.3, [1]], [3.0, [1, 2, 3]], [-1, []]]) out.push(building('beanPatch', team, { spawn: { next, kids } }));
    for (const [ang, v] of [[0, 0], [0.6, 120], [-0.9, 300], [1.2, 450], [0.1, 430]]) {
      const f = team === 'blue' ? 1 : -1;
      out.push(building('wreckingCrane', team, { ball: { ang, angV: 1, x: 600 + f * 34 + Math.sin(ang) * 125, y: -170 + Math.cos(ang) * 125, vx: v * Math.cos(ang), vy: -v * Math.sin(ang), hits: new Set() } }));
    }
  }
  // Missing fields must not throw
  out.push({ kind: 'building', bid: 'boingBox', team: 'blue', x: 10 });
  out.push({ kind: 'building', bid: 'wreckingCrane', team: 'red', x: 900, ball: null });
  out.push({ kind: 'building', bid: 'mystery', team: 'red', x: 900 });
  out.push({ kind: 'building', team: 'blue', x: 300, age: 2 });
  return out;
}

test('buildings: every state draws through the tower renderer, with HP bars and a life clock', () => {
  const tr = createTowerRenderer({ seed: 5 });
  const towers = [
    { kind: 'guard', team: 'blue', f: 1, x: 330, w: 64, h: 150, hp: 900, maxHp: 1000, alive: true, active: true, level: 2, aim: 0.3, shotT: 0.2, hitT: 99, downT: -1 },
    ...allStates(),
  ];
  const ctx = ctxOf();
  const before = count('drawImage');
  tr.draw(ctx, { towers }, { t: 1.2, dpr: 2 });
  assert.equal(tr.lastError, null, String(tr.lastError && tr.lastError.stack));
  assert.ok(count('drawImage') - before >= towers.length * 0.8, 'each building blits its body, crate or wreck');
  const b2 = count('drawImage');
  tr.drawBars(ctx, { towers }, { t: 1.3, dpr: 2 });
  tr.drawBars(ctx, { towers }, { t: 1.4, dpr: 2 });
  assert.equal(tr.lastError, null, String(tr.lastError && tr.lastError.stack));
  assert.ok(count('drawImage') - b2 >= towers.length, 'bars for the standing ones (and the fading wrecks)');
  for (const tw of towers) assert.ok(Number.isFinite(tr.artTop(tw)), 'artTop is a number');
  // A palette override reaches the buildings too
  tr.palettes.blue = { body: '#33aa55', shade: '#227744', light: '#66cc88', limb: '#2a8a4a', dark: '#114422' };
  tr.draw(ctx, { towers }, { t: 2 });
  assert.equal(tr.lastError, null, String(tr.lastError && tr.lastError.stack));
  assert.equal(calls.nonFinite || 0, 0, 'no NaN reaches the canvas');
});

test('buildings: the life clock share, the art top and the crane above the box', () => {
  const br = BL.createBuildingRenderer({ seed: 3 });
  assert.equal(br.lifeShare(building('boingBox', 'blue', { age: 0 })), 0);
  assert.equal(br.lifeShare(building('boingBox', 'blue', { age: 12.5 })), 0.5);
  assert.equal(br.lifeShare(building('boingBox', 'blue', { age: 40 })), 1);
  assert.equal(br.lifeShare(building('beanPatch', 'blue', { age: 6, def: { life: 12 } })), 0.5, 'reads def.life');
  assert.equal(br.lifeShare({ kind: 'building', bid: 'wreckingCrane', age: 14 }), 0.5, 'falls back to the contract life');
  const box = br.artTop(building('boingBox'));
  const crane = br.artTop(building('wreckingCrane'));
  assert.ok(crane < box && box < -46, 'tops sit above the art (y up is negative)');
  // Bars that would overlap get nudged apart (a crane next to a guard tower)
  const tr = createTowerRenderer({ seed: 5 });
  const towers = [
    { kind: 'guard', team: 'blue', f: 1, x: 330, w: 64, h: 150, hp: 900, maxHp: 1000, alive: true, active: true, level: 2 },
    building('wreckingCrane', 'blue', { x: 395 }),
  ];
  tr.drawBars(ctxOf(), { towers }, { t: 1, dpr: 1 });
  assert.equal(tr.lastError, null);
});

test('buildings: card art, glove, crane ball and aim ghosts', () => {
  const ctx = ctxOf();
  const n0 = count('fill');
  for (const bid of ['boingBox', 'beanPatch', 'wreckingCrane']) {
    for (const team of ['blue', 'red', { body: '#33aa55', shade: '#227744', light: '#66cc88', limb: '#2a8a4a', dark: '#114422' }]) {
      BL.drawBuildingArt(ctx, bid, 40, 90, 0.6, team);
      BL.drawBuildingArt(ctx, bid, 40, 90, 1, team, { f: -1, ext: 0.7, ang: 0.9, wilt: 0.8, grow: 0.4 });
    }
    const cache = new Map();
    for (const ok of [true, false]) {
      BL.drawBuildingGhost(ctx, bid, 500, 'blue', ok, 1.2, { zoom: 0.43, cache });
      BL.drawBuildingGhost(ctx, bid, 900, 'red', ok, 1.2, { zoom: 1 }); // without a cache: plain vectors
    }
    assert.ok(cache.size >= 2, 'ghost sprites are cached per team and legality');
  }
  assert.ok(count('fill') > n0, 'art was painted');
  BL.drawBuildingArt(ctx, 'mystery', 0, 0, 1, 'blue'); // ignored
  BL.drawBuildingArt(ctx, 'boingBox', NaN, 0, 1, 'blue');
  BL.drawBuildingGhost(ctx, 'mystery', 0, 'blue', true, 0);
  BL.drawGlove(ctx, 10, 10, -1, 1.5);
  BL.drawCraneBall(ctx, 10, 10, 20, 0.4);
  assert.equal(calls.nonFinite || 0, 0);
});

// --- spells ------------------------------------------------------------------------------------

function spellStates() {
  const out = [];
  for (const team of ['blue', 'red']) {
    const f = team === 'blue' ? 1 : -1;
    for (const t of [0, 0.1, 0.3, 0.45, 0.8, 2, 8]) out.push({ kind: 'peels', team, f, x: 500, y: 9, t, radius: 90, slips: 0, done: false });
    for (const t of [0, 0.2, 0.39, 0.4, 0.55, 0.8, 1.2, 3]) out.push({ kind: 'sneeze', team, f, x: 600, y: 9, t, radius: 140, state: t < 0.4 ? 'inhale' : t < 0.7 ? 'blow' : 'fade', done: false });
    for (const t of [0, 0.1, 0.6, 1.19, 1.2, 1.3, 1.8, 2.2, 4]) out.push({ kind: 'soda', team, f, x: 700, y: 9, t, radius: 75, state: t < 1.2 ? 'fizz' : t < 1.8 ? 'erupt' : 'fade', shake: Math.min(1, t / 1.2), done: false });
    for (const t of [0, 0.4, 0.89, 0.9, 1, 2.5, 3.2]) out.push({ kind: 'anvil', team, f, x: 800, y: t < 0.9 ? -620 + 611 * (t / 0.9) ** 2 : -9, vy: 600, t, r: 18, state: t < 0.9 ? 'fall' : 'rest', alpha: t > 2.9 ? 0.3 : 1, radius: 34, done: false });
    for (const t of [0, 0.1, 0.25, 0.49, 0.6]) out.push({ kind: 'wrap', team, x: 400, y: 9, t, radius: 120, done: false });
  }
  // Missing fields and junk
  out.push({ kind: 'soda', x: 100, y: 9 }, { kind: 'anvil', x: 100, y: -300 }, { kind: 'sneeze', x: 100, y: 9 }, { kind: 'wrap', x: 100, y: 9 }, { kind: 'peels', x: 1, y: 2 });
  out.push({ kind: 'sneeze', x: NaN, y: 0 }, null);
  return out;
}

function smallBattle() {
  const b = new Battle(4);
  for (const [id, team, x] of [['clubber', 'blue', 380], ['archer', 'blue', 430], ['clubber', 'red', 470]]) b.addUnit(id, team, x, 0.5, x, {});
  for (let i = 0; i < 30; i++) b.step(DT);
  b.units[0].wrapHp = 70;
  b.units[0].wrapMax = 70;
  return b;
}

test('spells: every new spell draws across its whole timeline (back and front)', () => {
  const ctx = ctxOf();
  const b = smallBattle();
  b.spells = spellStates();
  const s0 = count('stroke') + count('fill');
  for (const t of [0, 0.5, 3]) {
    SP.drawSpellsBack(ctx, b, t);
    SP.drawSpells(ctx, b, t);
  }
  assert.ok(count('stroke') + count('fill') > s0 + 100, 'the spells drew');
  assert.equal(ctx.globalAlpha, 1, 'alpha restored');
  assert.equal(calls.nonFinite || 0, 0, 'no NaN reaches the canvas');
});

test('spells: shared art exports (W3 uses them) and the peel item', () => {
  const ctx = ctxOf();
  for (const used of [false, true]) SP.drawPeel(ctx, 10, 10, 1.5, 0.3, used);
  const item = (ax, ay, bx, by, used) => ({ kind: 'peel', team: 'blue', a: { x: ax, y: ay, r: 2 }, b: { x: bx, y: by, r: 2 }, age: 1, life: 8, uses: 2, used });
  for (const it of [item(0, 7, 10, 7, false), item(10, 7, 0, 7, true), item(0, -90, 4, -100, false), { kind: 'peel' }, { kind: 'peel', a: { x: NaN, y: 0 }, b: { x: 1, y: 1 } }]) SP.drawPeelItem(ctx, it);
  for (const [inhale, blow] of [[0, 0], [0.5, 0], [1, 0], [1, 0.3], [1, 1]]) {
    SP.drawSneezeCloud(ctx, 50, -80, 1, 1, inhale, blow);
    SP.drawSneezeCloud(ctx, 50, -80, 0.7, -1, inhale, blow);
  }
  for (const shake of [0, 0.5, 1]) SP.drawSodaBottle(ctx, 0, 0, 1.2, shake, 0.7, shake < 1);
  SP.drawAnvilShape(ctx, 0, 0, 1, 1);
  SP.drawAnvilShape(ctx, 0, 0, 0.5, -1);
  for (const frac of [0, 0.3, 1]) SP.drawWrapBubbles(ctx, 0, 0, 20, 30, frac, 0.2, 5);
  SP.drawWrapBubbles(ctx, 0, 0, 0, 30); // degenerate: nothing
  for (const lit of [0, 0.5, 1]) SP.drawJBomb(ctx, 0, 0, 6, 0.4, lit, 1.1);
  const u = smallBattle().units[0];
  const w = SP.wrapFrame(u);
  for (const k of ['x', 'y', 'rx', 'ry', 'rot']) assert.ok(Number.isFinite(w[k]), `wrapFrame.${k}`);
  assert.ok(w.ry > w.rx * 0.5, 'the wrap hugs a standing bean (taller than wide-ish)');
  assert.equal(calls.nonFinite || 0, 0);
});

test('shots: Juggler bombs in flight, on the ground and about to burst, next to cannonballs', () => {
  const ctx = ctxOf();
  const shots = [
    { kind: 'cannon', team: 'red', x: 1000, y: -90, vx: -300, vy: 100, r: 7 },
    { kind: 'jbomb', team: 'red', x: 700, y: -120, vx: -280, vy: -60, r: 6, age: 0.3, bounced: false, fuseT: -1, X: { fuse: 0.6 } },
    { kind: 'jbomb', team: 'blue', x: 720, y: 3, vx: 30, vy: 0, r: 6, age: 1.1, bounced: true, fuseT: 0.4, X: { fuse: 0.6 } },
    { kind: 'jbomb', team: 'blue', x: 730, y: 3, vx: 0, vy: 0, r: 6, age: 1.6, bounced: true, fuseT: 0.01 },
    { kind: 'jbomb', x: 740, y: 3 },
    { kind: 'jbomb', x: NaN, y: 3 },
  ];
  const n0 = count('arc');
  SP.drawShots(ctx, { shots, time: 2 });
  SP.drawShots(ctx, { shots }, 1.5);
  assert.ok(count('arc') > n0 + 8, 'bombs and balls drew');
  assert.equal(calls.nonFinite || 0, 0);
});

test('aim: building ghosts, anywhere markers and the peel aim through DeployGhosts', () => {
  const ctx = ctxOf();
  const units = new UnitRenderer();
  const ghosts = new SP.DeployGhosts(units);
  // Draw from the card contract; stand in for cards the sim hasn't landed yet (removed afterwards)
  const temp = {
    boingBox: { id: 'boingBox', name: 'Boing Box', kind: 'building', building: 'boingBox', mana: 3 },
    wreckingCrane: { id: 'wreckingCrane', name: 'Wrecking Crane', kind: 'building', building: 'wreckingCrane', mana: 6 },
    beanPatch: { id: 'beanPatch', name: 'Bean Patch', kind: 'building', building: 'beanPatch', mana: 4 },
    brollyBrigade: { id: 'brollyBrigade', name: 'Brolly Brigade', kind: 'unit', unit: 'brolly', count: 3, spread: [-30, 0, 30], anywhere: true, mana: 4 },
    bananaPeels: { id: 'bananaPeels', name: 'Banana Peels', kind: 'spell', spell: 'bananaPeels', radius: 90, mana: 2 },
  };
  const added = [];
  for (const [id, c] of Object.entries(temp)) {
    if (!CARDS[id]) {
      CARDS[id] = c;
      added.push(id);
    }
  }
  try {
    const n0 = count('drawImage') + count('fill');
    for (const team of ['blue', 'red']) {
      for (const id of ['boingBox', 'wreckingCrane', 'beanPatch']) {
        ghosts.draw(ctx, id, 500, team, { t: 1, zoom: 0.43 }); // legal (no formation given)
        ghosts.draw(ctx, id, 500, team, { t: 1, xs: [520] }); // snapped by fitBuilding
        ghosts.draw(ctx, id, 500, team, { t: 1, xs: [] }); // no legal spot: red at x
        ghosts.draw(ctx, id, 500, team, { t: 1, ok: false });
      }
      ghosts.draw(ctx, 'brollyBrigade', 1100, team, { t: 1, zoom: 0.43 });
      ghosts.draw(ctx, 'brollyBrigade', 1100, team, { t: 1, xs: [1050, 1100, 1210], ok: false });
      ghosts.draw(ctx, 'bananaPeels', 900, team, { t: 1 });
      ghosts.draw(ctx, 'bananaPeels', 900, team, { t: 1, ok: false });
    }
    assert.ok(count('drawImage') + count('fill') > n0, 'ghosts drew');
    assert.ok(ghosts.sprites.size >= 3, 'building ghost sprites are cached');
  } finally {
    for (const id of added) delete CARDS[id];
  }
  SP.drawAnywhereMarkers(ctx, [100, 200, NaN], 'blue', true, 1, { zoom: 0.5 });
  SP.drawAnywhereMarkers(ctx, [], 'red', false, 1);
  SP.drawAnywhereMarkers(ctx, null, 'red', false, 1);
  // The old paths still work
  for (const id of ['clubbers', 'boulder', 'arrowRain']) ghosts.draw(ctx, id, 500, 'blue', { t: 0.5, zone: [40, 720] });
  assert.equal(calls.nonFinite || 0, 0);
});

// --- effects --------------------------------------------------------------------------------------

const NEW_FX = [
  'buildingLand', 'buildingDown', 'buildingHit', 'punchWindup', 'punch', 'sproutPop', 'craneSwing', 'liftOff', 'netted', 'crash', 'propOff', 'dive', 'swoop',
  'boing', 'stomp', 'juggleToss', 'fumble', 'miniBlast', 'beat', 'scoop', 'feathers', 'pelicanDrop', 'letGo', 'engulf', 'spit', 'canopyFlip',
  'brollyLand', 'wrap', 'wrapPop', 'wrapEnd', 'slip', 'skid', 'peelKick', 'sneeze', 'sodaErupt', 'anvilImpact', 'bubbles',
];

test('effects: every new kind spawns, updates, draws and dies out', () => {
  const fx = new Effects({ seed: 4 });
  for (const k of NEW_FX) {
    const before = fx.count;
    for (const bid of ['boingBox', 'beanPatch', 'wreckingCrane']) {
      fx.spawn(k, { x: 300, y: k === 'netted' ? -80 : 9, power: 1, dirX: -1, dir: 1, w: 46, h: 46, bid, color: '#2b6be0', radius: 90, popped: bid === 'boingBox', key: bid, count: 4 });
    }
    assert.ok(fx.count > before, `${k} spawned particles`);
  }
  for (const kind of ['bite', 'punch', 'crane', 'bump', 'stomp', 'dive', 'peck', 'net']) fx.spawn('impact', { x: 200, y: -40, power: 1, dirX: 1, dirY: 0, kind });
  for (const mat of ['wood', 'metal']) fx.spawn('towerHit', { x: 200, y: -40, power: 1, dirX: 1, kind: 'melee', mat });
  fx.spawn('buildingLand', { x: NaN, y: 0 }); // ignored
  const ctx = ctxOf();
  const battle = { spells: [], shots: [{ kind: 'jbomb', x: 500, y: -100, r: 6 }, { kind: 'cannon', x: 600, y: -100 }] };
  for (let i = 0; i < 120; i++) {
    fx.follow(battle, 1 / 60);
    fx.update(1 / 60);
    if (i % 15 === 0) {
      fx.drawBack(ctx);
      fx.drawFront(ctx);
    }
  }
  for (let i = 0; i < 600; i++) fx.update(1 / 60);
  assert.equal(fx.count, 0, 'everything dies out');
  assert.equal(calls.nonFinite || 0, 0);
});

test('effects: wrap pops are throttled per bean', () => {
  const fx = new Effects({ seed: 2 });
  fx.spawn('wrapPop', { x: 100, y: -30, key: 7 });
  const one = fx.count;
  for (let i = 0; i < 5; i++) fx.spawn('wrapPop', { x: 100, y: -30, key: 7 });
  assert.equal(fx.count, one, 'a burst on one bean shows once');
  fx.spawn('wrapPop', { x: 400, y: -30, key: 8 });
  assert.ok(fx.count > one, 'another bean pops on its own');
  fx.update(0.1);
  const n = fx.count;
  fx.spawn('wrapPop', { x: 100, y: -30, key: 7 });
  assert.ok(fx.count > n, 'and again a moment later');
});

test('effects: fxForEvent maps the new sim events and leaves the old ones alone', () => {
  const fx = new Effects({ seed: 6 });
  const b = smallBattle();
  const u = b.units[0];
  const v = b.units[2];
  const box = building('boingBox');
  const crane = building('wreckingCrane', 'red', { ball: { ang: 0.2, x: 700, y: -60, vx: 400, vy: -80 } });
  const spell = { kind: 'sneeze', team: 'blue', f: 1, x: 600, y: 9 };
  const events = [
    ['buildingPlaced', { tower: box, team: 'blue', bid: 'boingBox' }], ['buildingLand', { tower: box, power: 1 }],
    ['buildingDown', { tower: box, team: 'blue', bid: 'boingBox', cause: 'decayed' }], ['towerHit', { tower: box, damage: 20, kind: 'melee', from: v, power: 0.6 }],
    ['punchWindup', { tower: box }], ['punch', { tower: box, dir: -1 }], ['sproutPop', { tower: building('beanPatch'), unit: u }], ['craneSwing', { tower: crane, power: 1 }],
    ['hit', { kind: 'bite', power: 1, dirX: 1, dirY: 0, unit: v, from: u }], ['hit', { kind: 'crane', power: 1.2, dirX: 1, dirY: -0.5, unit: v, from: crane }],
    ['liftOff', { unit: u, from: v }], ['netted', { unit: u, from: v }], ['crash', { unit: u, power: 500 }], ['propOff', { unit: u }], ['dive', { unit: u }],
    ['boing', { unit: u }], ['stomp', { unit: u, victim: v }], ['juggleToss', { unit: u }], ['fumble', { unit: u, n: 3 }], ['explode', { unit: null, power: 0.5, team: 'red', radius: 65, small: true }],
    ['beat', { unit: u }], ['swoop', { unit: u, victim: v }], ['scoop', { unit: u, victim: v }], ['pelicanDrop', { unit: u, victim: v }], ['letGo', { unit: u, victim: v, why: 'sneeze' }],
    ['engulf', { unit: u, victim: v }], ['spit', { unit: u, victim: v }], ['canopyFlip', { unit: u }], ['brollyLand', { unit: u }], ['wrap', { unit: u }],
    ['wrapPop', { unit: u, left: 30 }], ['wrapEnd', { unit: u, popped: true }], ['slip', { unit: v }], ['skid', { unit: v }], ['peelKick', {}],
    ['sneeze', { spell, radius: 140 }], ['sodaErupt', { spell: { ...spell, kind: 'soda' }, radius: 75 }], ['anvilImpact', { spell: { ...spell, kind: 'anvil' }, power: 1.4, hits: 2 }],
  ];
  for (const [type, p] of events) assert.equal(fxForEvent(fx, { type, x: 500, y: -20, ...p }), true, type);
  // Old events stay with the caller
  const guard = { kind: 'guard', team: 'red', x: 1170, w: 64, h: 150, f: -1 };
  for (const e of [
    { type: 'towerHit', x: 1, y: 1, tower: guard, kind: 'melee' },
    { type: 'explode', x: 1, y: 1, power: 1, small: false },
    { type: 'hit', x: 1, y: 1, kind: 'slash' },
    { type: 'land', x: 1, y: 1 },
  ]) assert.equal(fxForEvent(fx, e), false, e.type);
  assert.equal(fxForEvent(fx, null), false);
  assert.ok(fx.count > 100, 'they made effects');
});

test('buildings: the sim\'s own building objects (makeBuilding) draw through their life', async (t) => {
  let SB = null;
  try {
    SB = await import(R + 'sim/buildings.js');
  } catch (e) {
    t.skip('sim/buildings.js not there yet');
    return;
  }
  const tr = createTowerRenderer({ seed: 9 });
  const ctx = ctxOf();
  const towers = [];
  let id = 50;
  for (const bid of Object.keys(SB.BUILDINGS)) {
    for (const team of ['blue', 'red']) {
      const b = SB.makeBuilding(bid, team, team === 'blue' ? 500 : 1000, 3, id++);
      assert.ok(b && b.kind === 'building', `${bid} is a building`);
      towers.push(b);
    }
  }
  // Walk them through a life by hand (the drop, the decay, the wreck)
  for (const age of [0, 0.1, 0.3, 0.4, 1, 5, 12, 20, 24.9]) {
    for (const b of towers) {
      b.age = age;
      b.landT = Math.min(age, 0.35);
      b.hp = b.maxHp * (1 - age / b.def.life);
    }
    tr.draw(ctx, { towers }, { t: age, dpr: 2 });
    tr.drawBars(ctx, { towers }, { t: age, dpr: 2 });
  }
  for (const downT of [0, 0.2, 0.6, 1.5, 2.6]) {
    for (const b of towers) {
      b.alive = false;
      b.hp = 0;
      b.downT = downT;
    }
    tr.draw(ctx, { towers }, { t: 30 + downT, dpr: 2 });
    tr.drawBars(ctx, { towers }, { t: 30 + downT, dpr: 2 });
  }
  assert.equal(tr.lastError, null, String(tr.lastError && tr.lastError.stack));
  assert.equal(calls.nonFinite || 0, 0);
});
