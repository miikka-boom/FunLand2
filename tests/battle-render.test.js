// Smoke test for the arena renderers: every draw path runs against a mock
// canvas in node (no DOM) without throwing, on mock data and on a real Match.
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
      if (k === 'getTransform') return () => ({ a: 1.1, b: 0, c: 0, d: 1.1, e: 400, f: 300 });
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'createPattern') return () => ({});
      return () => {
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
};

const R = new URL('../battle/src/', import.meta.url).href;
const { createTowerRenderer } = await import(R + 'render/towers.js');
const SP = await import(R + 'render/spells.js');
const { Effects } = await import(R + 'render/effects.js');
const { UnitRenderer } = await import(R + 'render/units.js');
const { createBackground, ARENA_THEMES } = await import(R + 'render/background.js');
const { cardFace, drawCardArt } = await import(R + 'render/cards.js');
const { drawChest } = await import(R + 'render/chests.js');
const { arenaFraming, Camera } = await import(R + 'render/camera.js');
const { Match } = await import(R + 'sim/match.js');
const { CARD_ORDER, STARTER_DECK } = await import(R + 'sim/cards.js');

const count = (k) => calls[k] || 0;

function tower(kind, team, o = {}) {
  const castle = kind === 'castle';
  return { kind, team, f: team === 'blue' ? 1 : -1, x: 300, w: castle ? 170 : 64, h: 150, hp: 1000, maxHp: 1000, alive: true, active: true, level: 2, aim: 0.3, shotT: 0.02, hitT: 0.05, downT: -1, ...o };
}

test('towers: every state draws (sprite, rubble, bars)', () => {
  const tr = createTowerRenderer({ seed: 3 });
  const towers = [];
  for (const kind of ['guard', 'castle']) {
    for (const team of ['blue', 'red']) {
      towers.push(tower(kind, team), tower(kind, team, { hp: 500 }), tower(kind, team, { hp: 100, active: false }));
      towers.push(tower(kind, team, { alive: false, hp: 0, downT: 0.3 }), tower(kind, team, { alive: false, hp: 0, downT: 8 }));
    }
  }
  towers.push({ kind: 'guard', team: 'blue', x: 10 }); // missing fields must not throw
  const ctx = mockCanvas(1688, 780).getContext('2d');
  const before = count('drawImage');
  tr.draw(ctx, { towers }, { t: 1.2, dpr: 2 });
  assert.ok(count('drawImage') - before >= towers.length, 'each tower blits its sprite or rubble');
  const b2 = count('drawImage');
  tr.drawBars(ctx, { towers }, { t: 1.3, dpr: 2 });
  assert.ok(count('drawImage') - b2 >= towers.length - 8, 'bars are drawn (fully fallen towers have none)');
  tr.palettes.blue = { body: '#33aa55', shade: '#227744', light: '#66cc88', limb: '#2a8a4a', dark: '#114422' };
  tr.draw(ctx, { towers }, { t: 1.4 });
  assert.equal(tr.lastError, null, String(tr.lastError && tr.lastError.stack));
  assert.equal(typeof tr.artTop(towers[0]), 'number');
});

test('spells, shots and aiming helpers draw', () => {
  const ctx = mockCanvas(1688, 780).getContext('2d');
  const battle = {
    spells: [
      { kind: 'boulder', team: 'blue', x: 400, y: -300, r: 30, rot: 1, vx: 200, vy: 600, state: 'fall', tx: 450, radius: 105, alpha: 1 },
      { kind: 'boulder', team: 'red', x: 600, y: -21, r: 30, rot: 2, vx: 0, vy: 0, state: 'rest', tx: 600, radius: 105, alpha: 0.4 },
      { kind: 'wheel', team: 'red', x: 800, y: -31, r: 40, rot: 1, vx: -400, dist: 100 },
      { kind: 'arrowRain', team: 'blue', x: 900, y: 9, radius: 130 },
      { kind: 'mystery', x: NaN, y: 0 },
    ],
    shots: [{ kind: 'cannon', team: 'red', x: 1000, y: -90, vx: -300, vy: 100, r: 7 }],
  };
  SP.drawSpellsBack(ctx, battle, 1);
  SP.drawSpells(ctx, battle, 1);
  SP.drawShots(ctx, battle);
  SP.drawSpellAim(ctx, 500, 105, 'blue', true, 1);
  SP.drawSpellAim(ctx, 500, 105, 'red', false, 1);
  SP.drawZone(ctx, 40, 720, true, { team: 'blue', t: 1 });
  SP.drawZone(ctx, 720, 1500, false, { t: 1 });
  SP.drawBoulderShape(ctx, 0, 0, 30, 0.5);
  SP.drawCheeseWheel(ctx, 0, 0, 40, 0.5);
  const units = new UnitRenderer();
  const ghosts = new SP.DeployGhosts(units);
  for (const id of CARD_ORDER) ghosts.draw(ctx, id, 500, id.length % 2 ? 'blue' : 'red', { t: 0.5, zone: [40, 720], ok: id.length % 3 > 0, hats: { clubber: 'party' } });
});

test('effects: arena kinds spawn, update, follow and draw', () => {
  const fx = new Effects({ seed: 9 });
  const kinds = ['towerHit', 'towerDown', 'cannonFire', 'cannonHit', 'boulderImpact', 'crumbs', 'cheeseBurst', 'deploy', 'crown', 'awake'];
  for (const k of kinds) fx.spawn(k, { x: 300, y: 9, power: 1, dirX: -1, dirY: 0.5, kind: 'castle', w: 200, color: '#2b6be0', radius: 40, count: 3 });
  fx.spawn('towerDown', { x: 300, y: 9 });
  fx.spawn('towerHit', { x: NaN, y: 0 }); // ignored
  assert.ok(fx.count > 100);
  const ctx = mockCanvas().getContext('2d');
  for (let i = 0; i < 120; i++) {
    fx.follow({ spells: [{ kind: 'wheel', x: 300 + i * 4, y: -31, r: 40, vx: 400 }], shots: [{ x: 500, y: -100 }] }, 1 / 60);
    fx.update(1 / 60);
    if (i % 20 === 0) {
      fx.drawBack(ctx);
      fx.drawFront(ctx);
    }
  }
  for (let i = 0; i < 600; i++) fx.update(1 / 60);
  assert.equal(fx.count, 0, 'everything dies out (the crater lasts 6 s)');
});

test('a real match renders: units (fade, hp bars, tower arrows), towers, spells', () => {
  const m = new Match({ seed: 4, blue: { deck: STARTER_DECK, kingLevel: 2 }, red: { deck: STARTER_DECK, kingLevel: 1 } });
  const ctx = mockCanvas(1688, 780).getContext('2d');
  const units = new UnitRenderer({ showHp: true });
  const tr = createTowerRenderer();
  const fx = new Effects();
  let sawFade = false;
  let sawTowerArrow = false;
  for (let i = 0; i < 120 * 45; i++) {
    for (const team of ['blue', 'red']) if (m.sides[team].mana >= 8) for (let k = 0; k < 4; k++) if (m.play(team, k, team === 'blue' ? 650 : 850)) break;
    m.step();
    const b = m.battle;
    b.events.length = 0;
    if (b.units.some((u) => u.fade < 1)) sawFade = true;
    if (b.arrows.some((a) => a.state === 'tower')) sawTowerArrow = true;
    if (i % 60 === 0) {
      tr.draw(ctx, b, { t: m.time, dpr: 2 });
      fx.follow(b, 0.5);
      SP.drawSpellsBack(ctx, b, m.time);
      units.drawShadows(ctx, b);
      units.drawGroundArrows(ctx, b);
      units.drawItems(ctx, b);
      units.drawUnits(ctx, b, b.time);
      units.drawFlyingArrows(ctx, b);
      SP.drawSpells(ctx, b, m.time);
      SP.drawShots(ctx, b);
      units.drawHpBars(ctx, b, { dpr: 2 });
      tr.drawBars(ctx, b, { t: m.time, dpr: 2 });
    }
  }
  assert.equal(tr.lastError, null, String(tr.lastError && tr.lastError.stack));
  assert.ok(sawFade, 'some corpse faded during the match');
  assert.ok(sawTowerArrow, 'some arrow stuck in a tower');
});

test('background: all arena themes, castles off, midline', () => {
  assert.equal(ARENA_THEMES.length, 5);
  assert.deepEqual(ARENA_THEMES.map((t) => t.name), ['Green Hills', 'Pointy Pass', 'Boom Ridge', 'Brick Fortress', 'Wobble Summit']);
  const ctx = mockCanvas(1688, 780).getContext('2d');
  for (let th = 0; th < 5; th++) {
    const bg = createBackground({ seed: 7, castles: false, theme: th });
    assert.equal(bg.theme, th);
    const view = { w: 844, h: 390, dpr: 2, cam: { x: 750, y: -130, zoom: 0.54 }, t: 1 };
    bg.drawBack(ctx, view);
    bg.drawFront(ctx, view);
  }
  const sandbox = createBackground({ seed: 7 });
  sandbox.drawBack(ctx, { w: 844, h: 390, dpr: 2, cam: { x: 750, y: -130, zoom: 0.54 }, t: 1 });
  assert.equal(createBackground({ theme: 99 }).theme, 4, 'out of range clamps');
});

test('card faces and chests', () => {
  for (const id of CARD_ORDER) {
    for (const opts of [{}, { mini: true }, { level: 5 }, { level: 3, name: true }, { locked: true }, { dim: true, mini: true }, { hats: { clubber: 'tophat' }, palette: { body: '#33aa55', shade: '#227744', light: '#66cc88', limb: '#2a8a4a', dark: '#114422' } }]) {
      const f = cardFace(id, 120, 156, opts);
      assert.ok(f && f.width === 120 && f.height === 156, id);
      assert.equal(cardFace(id, 120, 156, opts), f, 'cached');
    }
  }
  assert.equal(cardFace('nope', 100, 100), null);
  drawCardArt(mockCanvas(140, 182), 'boulder', { level: 2 });
  for (const kind of ['small', 'big']) {
    for (const o of [{}, { ready: true, t: 0.1 }, { shake: 1, t: 1 }, { open: 0.3, glow: 1 }, { open: 1, glow: 1, t: 3 }]) drawChest(mockCanvas(128, 128), kind, o);
  }
});

test('camera: arena framing fits the field on the key phone sizes', () => {
  for (const [w, h] of [[844, 390], [667, 375]]) {
    const f = arenaFraming(w, h, { hudTop: 40, hudBottom: 96 });
    assert.ok((1500 + 60) * f.zoom <= w + 0.5, 'whole field in view');
    assert.ok(f.zoom > 0.4 && f.zoom < 0.6, `zoom ${f.zoom}`);
    const groundY = f.groundFrac * h;
    assert.ok(groundY - 290 * f.zoom >= 40 - 0.5, 'castle bars clear of the top HUD');
    assert.ok(groundY + 44 * f.zoom <= h - 96 + 0.5, 'grass clear of the hand');
    const cam = new Camera();
    cam.setView(w, h);
    cam.frameArena({ hudTop: 40, hudBottom: 96 }, true);
    assert.equal(cam.zoom, f.zoom);
    assert.equal(cam.follow, false);
  }
});
