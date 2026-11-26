// The textured ground of the streets: textures tinted to a surface's colour (src/render/textures.js)
// and the static ground painted once into chunks that are copied to the screen each frame
// (src/render/ground-cache.js).
import test from 'node:test';
import assert from 'node:assert/strict';

const { tintPixels, hexRgb, TEXTURE_SPAN } = await import('../src/render/textures.js');
const { GroundCache, CHUNK } = await import('../src/render/ground-cache.js');

test('a texture tinted to a colour keeps its light and dark around that colour', () => {
  const lum = Float32Array.from([40, 80, 120, 160]); // mean 100
  const mean = 100;
  const rgb = hexRgb('#3c3442');
  assert.deepEqual(rgb, [60, 52, 66]);
  const out = tintPixels(lum, mean, rgb, 1, new Float32Array(16));
  // On average the colour itself...
  for (let c = 0; c < 3; c++) {
    const avg = (out[c] + out[4 + c] + out[8 + c] + out[12 + c]) / 4;
    assert.ok(Math.abs(avg - rgb[c]) < 1e-3, `channel ${c}`);
  }
  // ...lighter where the texture is lighter, opaque.
  assert.ok(out[12] > out[8] && out[8] > out[4] && out[4] > out[0]);
  assert.equal(out[3], 255);
  // No contrast: flat.
  const flat = tintPixels(lum, mean, rgb, 0, new Float32Array(16));
  for (let i = 0; i < 4; i++) assert.deepEqual([...flat.slice(i * 4, i * 4 + 3)], rgb);
  for (const k of ['asphalt', 'sidewalk', 'roof', 'brick']) assert.ok(TEXTURE_SPAN[k] > 0, k);
});

// A canvas that writes down what is painted on it and drawn from it.
function fakeCanvas() {
  const c = { width: 0, height: 0, paints: 0 };
  c.getContext = () => ({ canvas: c, setTransform() {}, clearRect() {}, drawImage: (src, x, y) => draws.push({ to: c, src, x, y }) });
  return c;
}
let draws = [];
const view = (scale, ox, oy, sp = 0.966) => ({ ax: scale, ay: 0, bx: 0, by: scale * sp, ox, oy });

test('the ground cache: chunks meet on whole pixels and cover the screen, painted once each', () => {
  const made = [];
  const gc = new GroundCache(() => {
    const c = fakeCanvas();
    made.push(c);
    return c;
  });
  const screen = fakeCanvas();
  screen.width = 1688;
  screen.height = 780;
  const ctx = screen.getContext();
  const painted = [];
  const paint = (x, x0, y0, x1, y1) => painted.push([x0, y0, x1, y1]);
  const v = view(0.83, -1234.56, -987.65);
  draws = [];
  assert.equal(gc.draw(ctx, v, 2, 'map1', paint, 0), true);
  const onScreen = draws.filter((d) => d.to === screen);
  assert.ok(onScreen.length >= 12, `${onScreen.length} chunks on screen`);
  // Every chunk is copied one to one at whole pixels, and neighbours meet exactly.
  const at = new Map(onScreen.map((d) => [d.src, d]));
  for (const c of gc.chunks.values()) {
    const d = at.get(c.canvas);
    assert.ok(Number.isInteger(d.x) && Number.isInteger(d.y));
  }
  const byX = [...new Set(onScreen.map((d) => d.x))].sort((a, b) => a - b);
  const widths = new Map(onScreen.map((d) => [d.x, d.src.width]));
  for (let k = 0; k + 1 < byX.length; k++) assert.equal(byX[k] + widths.get(byX[k]), byX[k + 1], 'no gap, no overlap across');
  const byY = [...new Set(onScreen.map((d) => d.y))].sort((a, b) => a - b);
  const heights = new Map(onScreen.map((d) => [d.y, d.src.height]));
  for (let k = 0; k + 1 < byY.length; k++) assert.equal(byY[k] + heights.get(byY[k]), byY[k + 1], 'nor down');
  // ...and together they cover the screen.
  assert.ok(byX[0] <= 0 && byY[0] <= 0);
  assert.ok(byX[byX.length - 1] + widths.get(byX[byX.length - 1]) >= screen.width);
  assert.ok(byY[byY.length - 1] + heights.get(byY[byY.length - 1]) >= screen.height);
  // Each painted a little past its own square of the map (so its edge pixels are covered whole).
  for (const [x0, y0, x1, y1] of painted) {
    assert.ok(x1 - x0 > CHUNK && x1 - x0 < CHUNK + 4 && y1 - y0 > CHUNK && y1 - y0 < CHUNK + 4);
  }
  // The next frame, a little further along: only what came into view is painted.
  const n = painted.length;
  draws = [];
  gc.draw(ctx, view(0.83, -1240, -987.65), 2, 'map1', paint, 0);
  assert.ok(painted.length - n <= byY.length, `${painted.length - n} new chunks`);
  // Paint ahead: one chunk off the screen.
  const m = painted.length;
  gc.draw(ctx, view(0.83, -1240, -987.65), 2, 'map1', paint, 1);
  assert.equal(painted.length - m, 1);
  // A new look (or map, or textures) or a new zoom: painted again.
  const k0 = painted.length;
  gc.draw(ctx, view(0.83, -1240, -987.65), 2, 'map1|noir', paint, 0);
  assert.ok(painted.length - k0 >= onScreen.length - 1);
  const k1 = painted.length;
  gc.draw(ctx, view(0.9, -1240, -987.65), 2, 'map1|noir', paint, 0);
  assert.ok(painted.length - k1 >= 12);
});

test('the ground cache: only for a camera that looks along the streets; it keeps what is on screen', () => {
  const gc = new GroundCache(fakeCanvas);
  const screen = fakeCanvas();
  screen.width = 800;
  screen.height = 400;
  const ctx = screen.getContext();
  const turned = { ax: 0.6, ay: 0.6, bx: -0.3, by: 0.3, ox: 0, oy: 0 };
  assert.equal(gc.draw(ctx, turned, 2, 'k', () => {}), false, 'turned 45 degrees: the renderer paints it itself');
  assert.equal(GroundCache.fits(view(1, 0, 0)), true);
  // Past its limit it lets the oldest go, never one on screen.
  gc.max = 4;
  for (let x = 0; x < 20; x++) gc.draw(ctx, view(1, -x * 300, 0), 1, 'k', () => {}, 0);
  const now = [...gc.chunks.values()].filter((c) => c.used === gc.frame).length;
  assert.ok(gc.chunks.size <= Math.max(4, now), `${gc.chunks.size} kept`);
  assert.ok(gc.spare.length > 0, 'their canvases are reused');
});
