// Roofs of the streets: painted once into pictures of their own (src/render/roof-cache.js), with
// the clutter that stands on them (models.js rooftopProps: Scenario sprites, assets/streets).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { RoofCache } = await import('../src/render/roof-cache.js');
const { rooftopProps } = await import('../src/render/models.js');
const { ROOFTOP, ROOFTOP_IMAGE } = await import('../assets/streets/rooftop.js');
const { IsoView } = await import('../src/iso.js');

test('the rooftop sprites: eight of them in one atlas, every one inside it', () => {
  assert.deepEqual(Object.keys(ROOFTOP).sort(), ['ac', 'chimney', 'condenser', 'hatch', 'mushroom', 'skylight', 'tank', 'vent']);
  const webp = fs.readFileSync(new URL(`../${ROOFTOP_IMAGE}`, import.meta.url));
  assert.equal(webp.toString('ascii', 8, 12), 'WEBP');
  // VP8X header: canvas size (24-bit little endian, minus one) at bytes 24..29.
  const w = 1 + webp.readUIntLE(24, 3);
  const h = 1 + webp.readUIntLE(27, 3);
  for (const [k, s] of Object.entries(ROOFTOP)) {
    assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.w <= w && s.y + s.h <= h, `${k} inside the ${w}x${h} atlas`);
    assert.ok(s.size >= 10 && s.size <= 60, `${k}: ${s.size} world units across`);
  }
  for (const f of ['asphalt', 'sidewalk', 'roof', 'brick']) assert.ok(fs.statSync(new URL(`../assets/streets/${f}.webp`, import.meta.url)).size > 10000, f);
});

test('rooftop clutter: from the building\'s seed, inside the parapet, never overlapping, more on bigger roofs', () => {
  const b = (w, h, seed, vents = 2) => ({ x: 1000, y: 500, w, h, seed, vents });
  const P = 6;
  let total = 0;
  for (let seed = 1; seed < 60; seed++) {
    const o = b(220, 260, seed * 7919);
    const props = rooftopProps(o, P);
    assert.equal(rooftopProps(o, P), props, 'kept on the building');
    assert.deepEqual(rooftopProps(b(220, 260, seed * 7919), P), props, 'the same every time');
    for (const q of props) {
      assert.ok(ROOFTOP[q.name], q.name);
      assert.ok(q.x >= o.x + P && q.y >= o.y + P && q.x + q.w <= o.x + o.w - P && q.y + q.h <= o.y + o.h - P, 'inside the parapet');
    }
    for (let i = 0; i < props.length; i++) {
      for (let j = i + 1; j < props.length; j++) {
        const A = props[i];
        const B = props[j];
        assert.ok(A.x + A.w <= B.x || B.x + B.w <= A.x || A.y + A.h <= B.y || B.y + B.h <= A.y, 'apart');
      }
    }
    total += props.length;
  }
  assert.ok(total / 59 >= 3, `${(total / 59).toFixed(1)} on a roof that size`);
  const small = rooftopProps(b(70, 60, 42, 0), P);
  const big = rooftopProps(b(420, 380, 42), P);
  assert.ok(small.length <= 1 && big.length > small.length);
  assert.ok(big.every((q) => q.name !== 'tank') || 420 * 380 > 40000, 'water tanks only on big roofs');
});

// A canvas that writes down what is drawn on it.
function fakeCanvas() {
  const c = { width: 0, height: 0 };
  c.getContext = () => ({ canvas: c, setTransform() {}, clearRect() {}, drawImage: (src, x, y) => drawn.push({ to: c, src, x, y }) });
  return c;
}
let drawn = [];

test('a roof is painted once into its picture and copied one to one, on whole pixels, as the camera moves', () => {
  const v = new IsoView(0, (75 * Math.PI) / 180);
  v.setViewport(844, 390, 390 / 470);
  v.lookAt(1100.37, 600.81);
  assert.equal(RoofCache.fits(v), true);
  const screen = fakeCanvas();
  let resets = 0;
  const R = { ctx: screen.getContext(), v, dpr: 2, reset: () => resets++ };
  const rc = new RoofCache(fakeCanvas);
  rc.begin('a');
  const o = { x: 1000, y: 500, w: 220, h: 260 };
  let painted = 0;
  const paint = (R2) => {
    painted++;
    // It paints through its own canvas and a camera moved so the roof starts at its corner.
    assert.notEqual(R2.ctx, R.ctx);
    assert.equal(R2.caching, true);
    assert.ok(Math.abs(R2.v.px(o.x, o.y) * 2 - 2) < 1e-6, 'the roof\'s left edge at the picture\'s 2 px margin');
    assert.equal(R2.v.ax, v.ax, 'the same camera otherwise');
  };
  drawn = [];
  rc.draw(R, o, o.x, o.y, o.x + o.w, o.y + o.h, 94, 102, paint);
  rc.draw(R, o, o.x, o.y, o.x + o.w, o.y + o.h, 94, 102, paint);
  assert.equal(painted, 1, 'painted once');
  const d0 = drawn.filter((d) => d.to === screen);
  assert.equal(d0.length, 2);
  assert.ok(d0.every((d) => Number.isInteger(d.x) && Number.isInteger(d.y)));
  assert.ok(Math.abs(d0[0].x + 2 - v.px(o.x, o.y) * 2) <= 0.5, 'where the roof is on screen');
  // The camera moves: the same picture, moved with it.
  v.lookAt(1130.11, 590.2);
  rc.begin('a');
  drawn = [];
  rc.draw(R, o, o.x, o.y, o.x + o.w, o.y + o.h, 94, 102, paint);
  assert.equal(painted, 1);
  assert.ok(Math.abs(drawn[0].x + 2 - v.px(o.x, o.y) * 2) <= 0.5);
  // A new look (or zoom, or tilt): painted again.
  rc.begin('b');
  rc.draw(R, o, o.x, o.y, o.x + o.w, o.y + o.h, 94, 102, paint);
  assert.equal(painted, 2);
  assert.ok(resets >= 3, 'the renderer\'s transform put back');
  // Not for a turned camera, or one straight above.
  assert.equal(RoofCache.fits(new IsoView()), false);
  assert.equal(RoofCache.fits(new IsoView(0, Math.PI / 2)), false);
});

test('the roof pictures stay within their budget, letting the ones used longest ago go', () => {
  const v = new IsoView(0, (75 * Math.PI) / 180);
  v.setViewport(844, 390, 1);
  v.lookAt(0, 0);
  const R = { ctx: fakeCanvas().getContext(), v, dpr: 2, reset() {} };
  const rc = new RoofCache(fakeCanvas);
  rc.maxPx = 400000;
  for (let i = 0; i < 30; i++) {
    rc.begin('k');
    const o = { x: i * 300, y: 0, w: 200, h: 200 };
    rc.draw(R, o, o.x, o.y, o.x + 200, 200, 90, 100, () => {});
  }
  rc.begin('k');
  assert.ok(rc.px <= rc.maxPx, `${rc.px} px held`);
  assert.ok(rc.map.size < 30 && rc.spare.length > 0, 'old ones let go, their canvases reused');
});
