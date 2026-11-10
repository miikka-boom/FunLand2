// Render polish after the 32-card play-test (no sim): a flier crossing a tower's
// HP bar thins the bar so the bird reads through it, and a Brolly that was just
// played fades in below the HUD's top row instead of showing under the clock.
// (node --test runs each file in its own process, so the fake DOM globals stay here.)
import test from 'node:test';
import assert from 'node:assert/strict';

const VIEW = { a: 0.86, b: 0, c: 0, d: 0.86, e: 400, f: 300 }; // the camera: zoom 0.86, no rotation

/** A canvas 2D stub that keeps the globalAlpha of every drawImage. */
function mockCtx(canvas) {
  const grad = { addColorStop() {} };
  const t = { canvas, globalAlpha: 1, globalCompositeOperation: 'source-over', alphas: [] };
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'getTransform') return () => ({ ...VIEW });
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'createPattern') return () => ({});
      return () => {
        if (k === 'drawImage') o.alphas.push(o.globalAlpha);
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
const { UnitRenderer } = await import(R + 'render/units.js');
const { UNIT_TYPES } = await import(R + 'sim/unit-types.js');

const guard = (team = 'blue') => ({ kind: 'guard', team, x: 330, w: 64, h: 150, hp: 420, maxHp: 420, alive: true, active: true, level: 1, arrows: [] });
/** Just what the renderers read of a unit: its type, hip, head and radius. */
function bean(type, hipX, hipY, o = {}) {
  const t = UNIT_TYPES[type];
  return { id: 1, type: t, team: 'blue', alive: true, R: t.radius, hip: { x: hipX, y: hipY }, head: { x: hipX + 10, y: hipY - 8 }, chest: { x: hipX + 5, y: hipY - 4 }, floatT: 0, ...o };
}

test('polish: a Pelican crossing a Guard Tower\'s HP bar thins the bar; ground beans and fliers clear of it never do', () => {
  const R1 = createTowerRenderer({ seed: 7 });
  const tower = guard();
  const draw = (units, t) => {
    const ctx = mockCanvas(1688, 780).getContext('2d');
    R1.drawBars(ctx, { towers: [tower], units }, { t, dpr: 1 });
    return ctx.alphas[0];
  };
  assert.equal(draw([], 1), 1);
  assert.equal(draw([bean('clubber', 330, -30)], 1.02), 1, 'a bean on the ground under the tower');
  assert.equal(draw([bean('copter', 330, -130)], 1.04), 1, 'Propeller Pals at cruise stay below the bar');
  assert.equal(draw([bean('pelican', 520, -228)], 1.06), 1, 'a Pelican beside the bar');
  // A Pelican at cruise height right over the tower: the bar eases out to its see-through floor...
  const a = [];
  for (let i = 1; i <= 10; i++) a.push(draw([bean('pelican', 330, -228)], 1.06 + i / 30));
  assert.ok(a[0] < 1 && a[0] > a[9], `eases out: ${a.map((v) => v.toFixed(2))}`);
  assert.ok(a[9] >= 0.35 && a[9] <= 0.45, `still readable: ${a[9]}`);
  // ...and back in once the bird has passed
  const b = [];
  for (let i = 1; i <= 10; i++) b.push(draw([bean('pelican', 700, -228)], 1.4 + i / 30));
  assert.ok(b[0] < 1 && b[9] === 1, `eases back: ${b.map((v) => v.toFixed(2))}`);
  // A floating Brolly drifting down past the bar counts too, and a bean in a Pelican's beak;
  // a bean inside a Big Jelly standing by a building does not, nor a dead bean lying about
  assert.ok(draw([bean('brolly', 330, -228, { floatT: 1 })], 3) < 1);
  assert.equal(draw([], 4), 1);
  assert.ok(draw([bean('clubber', 330, -228, { held: true, heldBy: bean('pelican', 330, -250) })], 5) < 1);
  assert.equal(draw([], 6), 1);
  assert.equal(draw([bean('clubber', 330, -228, { held: true, heldBy: bean('jelly', 330, -60) })], 7), 1);
  const R2 = createTowerRenderer({ seed: 7 });
  const ctx = mockCanvas(1688, 780).getContext('2d');
  R2.drawBars(ctx, { towers: [guard()], units: [bean('clubber', 330, -228, { gone: true })] }, { t: 1, dpr: 1 });
  assert.equal(ctx.alphas[0], 1);
});

test('polish: a Brolly that was just played fades in, and stays faint until it is below the HUD\'s top row', () => {
  const r = new UnitRenderer({ showHp: true });
  const ctx = mockCanvas(1688, 780).getContext('2d');
  // Over the first moments after it is played (battle time)
  const u = bean('brolly', 600, -380, { floatT: 1 });
  assert.equal(r.floatInAlpha(ctx, u, 10), 0);
  assert.ok(Math.abs(r.floatInAlpha(ctx, u, 10.175) - 0.5) < 0.02);
  assert.equal(r.floatInAlpha(ctx, u, 10.5), 1);
  // Under the HUD row (skyTop, device px): invisible there, then fading in as it drifts below it
  r.skyTop = 82;
  const at = (umbrellaY) => {
    u.head.y = (umbrellaY - VIEW.f) / VIEW.d + u.R * 1.6;
    return r.floatInAlpha(ctx, u, 11);
  };
  assert.equal(at(40), 0, 'under the clock');
  assert.equal(at(82), 0, 'at the HUD row\'s edge');
  assert.ok(at(100) > 0 && at(100) < 1, 'emerging');
  assert.equal(at(160), 1, 'clear of it');
  // drawUnits draws it see-through while it fades, and never a bean on the ground
  const seen = [];
  r.drawUnit = (c, v) => seen.push([v.type.id, 1]);
  r.drawUnitAlpha = (c, v, b, t, a) => seen.push([v.type.id, a]);
  const v = bean('brolly', 600, -380, { floatT: 1 });
  r.drawUnits(ctx, { units: [v, bean('clubber', 500, -30)] }, 20);
  r.skyTop = 0;
  r.drawUnits(ctx, { units: [v] }, 20.2);
  r.drawUnits(ctx, { units: [v] }, 21);
  assert.deepEqual(seen.map(([id, a]) => [id, +a.toFixed(2)]), [['brolly', 0], ['clubber', 1], ['brolly', 0.57], ['brolly', 1]]);
});
