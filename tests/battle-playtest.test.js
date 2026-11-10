// Fixes from the phone play-test of the 32 cards (render and menus only; no sim):
// a building's HP bar waits for its crate to land, the comic words draw over the
// HP bars, and the Anvil and Shaken Soda aims show what will land there.
// (node --test runs each file in its own process, so the fake DOM globals stay here.)
import test from 'node:test';
import assert from 'node:assert/strict';

/** A canvas 2D stub that counts its own calls (and drawImage targets). */
function mockCtx(canvas) {
  const grad = { addColorStop() {} };
  const t = { canvas, globalAlpha: 1, globalCompositeOperation: 'source-over', calls: {}, images: [] };
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'getTransform') return () => ({ a: 0.86, b: 0, c: 0, d: 0.86, e: 400, f: 300 });
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'createPattern') return () => ({});
      return (...args) => {
        o.calls[k] = (o.calls[k] || 0) + 1;
        if (k === 'drawImage') o.images.push(args[0]);
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
const { LAND_T } = await import(R + 'render/buildings.js');
const { DeployGhosts } = await import(R + 'render/spells.js');
const { Effects } = await import(R + 'render/effects.js');
const { UnitRenderer } = await import(R + 'render/units.js');

const ctxOf = () => mockCanvas(1688, 780).getContext('2d');

function guard(team = 'blue') {
  return { kind: 'guard', team, x: 335, w: 64, h: 150, hp: 420, maxHp: 420, alive: true, active: true, level: 1, arrows: [] };
}
function box(o = {}) {
  return {
    kind: 'building', bid: 'boingBox', def: { life: 25, arm: 1 }, building: true, isTower: true, team: 'blue', f: 1, x: 560, w: 46, h: 46,
    hp: 300, maxHp: 320, alive: true, active: true, level: 1, dmgMul: 1, range: 0, age: 5, landT: LAND_T, hitT: 99, downT: -1, arrows: [],
    punch: { phase: 'idle', t: 0, ext: 0, dir: 1 },
    ...o,
  };
}
/** How many HP bars drawBars blits onto the frame (one bar = one drawImage of its own canvas). */
function barsDrawn(towers) {
  const R = createTowerRenderer({ seed: 7 });
  const ctx = ctxOf();
  R.drawBars(ctx, { towers }, { t: 1, dpr: 1 });
  return ctx.images.length;
}

test('play-test: a building shows no HP bar while its crate is still falling, then the bar pops in', () => {
  assert.equal(barsDrawn([guard()]), 1);
  // placed a moment ago: the crate is up in the air
  assert.equal(barsDrawn([guard(), box({ age: 0.1, landT: 0.1 })]), 1);
  assert.equal(barsDrawn([guard(), box({ age: LAND_T - 0.01, landT: LAND_T - 0.01 })]), 1);
  // landed: the bar is there (fading in for a few frames, then for good)
  assert.equal(barsDrawn([guard(), box({ age: LAND_T + 0.05, landT: LAND_T })]), 2);
  assert.equal(barsDrawn([guard(), box({ age: 5, landT: LAND_T })]), 2);
  // a building that never tells its landT (older saves of a state): the bar shows
  assert.equal(barsDrawn([guard(), box({ landT: undefined, age: undefined })]), 2);
});

test('play-test: the comic words can be drawn on their own, after (over) the HP bars', () => {
  const fx = new Effects({ seed: 3 });
  fx.spawn('text', { x: 500, y: -80, text: 'BOING!', color: '#ffe14d', size: 22 });
  fx.spawn('impact', { x: 500, y: -40, power: 1, dirX: 1, dirY: 0 });
  fx.update(0.1);
  const all = ctxOf();
  fx.drawFront(all);
  assert.ok((all.calls.fillText || 0) > 0, 'drawFront still draws the words by default');
  const noWords = ctxOf();
  fx.drawFront(noWords, false);
  assert.equal(noWords.calls.fillText || 0, 0, 'drawFront(ctx, false) leaves the words out');
  assert.ok((noWords.calls.fill || 0) + (noWords.calls.stroke || 0) > 0, '...but still draws the impact burst');
  const words = ctxOf();
  fx.drawWords(words);
  assert.equal(words.calls.fillText, all.calls.fillText, 'drawWords draws exactly the words');
});

test('play-test: the Anvil and Shaken Soda aims draw what will land there, legal or not', () => {
  const ghosts = new DeployGhosts(new UnitRenderer({ seed: 1 }));
  const count = (id, ok) => {
    const ctx = ctxOf();
    ghosts.draw(ctx, id, 700, 'blue', { ok, t: 1.3 });
    return Object.values(ctx.calls).reduce((a, b) => a + b, 0);
  };
  const plain = count('arrowRain', true);
  for (const id of ['anvil', 'shakenSoda']) {
    for (const ok of [true, false]) assert.ok(count(id, ok) > plain + 5, `${id} (${ok ? 'ok' : 'not here'}) draws more than a plain spell circle`);
  }
});
