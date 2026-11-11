import test from 'node:test';
import assert from 'node:assert/strict';
import { tileToWorld, worldToTile, tileAt, footBox, footBottom, depth, overlaps, tilesOf, Camera, mapBounds } from '../outpost/src/iso.js';
import { findPath } from '../outpost/src/path.js';

test('tile ↔ world round-trips, and a point inside a tile maps back to it', () => {
  for (const [i, j] of [[0, 0], [3, 5], [17, 2], [31, 31]]) {
    const w = tileToWorld(i, j);
    const t = worldToTile(w.x, w.y);
    assert.ok(Math.abs(t.i - i) < 1e-9 && Math.abs(t.j - j) < 1e-9);
    const c = tileToWorld(i + 0.5, j + 0.5);
    assert.deepEqual(tileAt(c.x, c.y), { i, j });
  }
});

test('footprints: box width is (w + h) × 32, bottom corner, depth order, overlaps', () => {
  const b = footBox(2, 3, 2, 2);
  assert.equal(b.width, 128);
  assert.equal(b.height, 64);
  assert.deepEqual(footBottom(0, 0, 1, 1), tileToWorld(1, 1));
  assert.ok(depth(5, 5, 1, 1) > depth(1, 1, 3, 3), 'further down the screen draws on top');
  assert.ok(overlaps({ i: 0, j: 0, w: 2, h: 2 }, { i: 1, j: 1, w: 1, h: 1 }));
  assert.ok(!overlaps({ i: 0, j: 0, w: 2, h: 2 }, { i: 2, j: 0, w: 1, h: 1 }));
  assert.equal(tilesOf(0, 0, 2, 3).length, 6);
});

test('the camera: screen ↔ world, zooming about a point keeps it fixed, limits hold', () => {
  const c = new Camera({ zoom: 1, min: 0.5, max: 2 });
  c.setViewport(844, 390);
  const w = c.screenToWorld(100, 50);
  c.zoomAt(1.7, 100, 50);
  const s = c.worldToScreen(w.x, w.y);
  assert.ok(Math.abs(s.x - 100) < 1e-6 && Math.abs(s.y - 50) < 1e-6);
  c.zoomAt(100, 0, 0);
  assert.equal(c.zoom, 2);
  c.limit = () => ({ x: 7, y: 9 });
  c.panBy(500, 500);
  assert.deepEqual([c.x, c.y], [7, 9]);
  const b = mapBounds(32, 32);
  assert.ok(b.left < 0 && b.right > 0 && b.bottom === 1024);
});

test('A*: around a wall, never through blocked tiles or their corners; null when walled in', () => {
  const wall = new Set();
  for (let j = 0; j < 9; j++) wall.add(`5,${j}`);
  const blocked = (i, j) => wall.has(`${i},${j}`);
  const p = findPath(12, 12, blocked, 0, 0, 10, 0);
  assert.ok(p && p.length > 10);
  assert.deepEqual(p.at(-1), [10, 0]);
  for (const [i, j] of p) assert.ok(!blocked(i, j));
  let prev = [0, 0];
  for (const cur of p) {
    const di = cur[0] - prev[0];
    const dj = cur[1] - prev[1];
    assert.ok(Math.abs(di) <= 1 && Math.abs(dj) <= 1);
    if (di && dj) assert.ok(!blocked(prev[0] + di, prev[1]) && !blocked(prev[0], prev[1] + dj), 'no corner cutting');
    prev = cur;
  }
  assert.deepEqual(findPath(12, 12, blocked, 3, 3, 3, 3), []);
  const box = (i, j) => (i === 2 || i === 4 || j === 2 || j === 4) && i >= 2 && i <= 4 && j >= 2 && j <= 4;
  assert.equal(findPath(12, 12, box, 3, 3, 10, 10), null);
  const goalBlocked = findPath(12, 12, blocked, 0, 0, 5, 3);
  assert.deepEqual(goalBlocked.at(-1), [5, 3], 'a blocked goal can still be reached (walk up to a building)');
});

test('hit hexagons: a tall object is tappable above its footprint, not beside it', async () => {
  const { inHexagon, inPoly, tileToWorld: tw } = await import('../outpost/src/iso.js');
  assert.ok(inPoly([[0, 0], [10, 0], [10, 10], [0, 10]], 5, 5));
  assert.ok(!inPoly([[0, 0], [10, 0], [10, 10], [0, 10]], 15, 5));
  // A 2×2 building at (4, 4) with 80 px of body.
  const c = tw(5, 5); // footprint centre
  assert.ok(inHexagon(4, 4, 2, 2, 80, c.x, c.y), 'its footprint');
  assert.ok(inHexagon(4, 4, 2, 2, 80, c.x, c.y - 90), 'its walls and roof');
  assert.ok(!inHexagon(4, 4, 2, 2, 80, c.x, c.y - 200), 'not the sky above it');
  const right = tw(6, 4); // the right corner
  assert.ok(!inHexagon(4, 4, 2, 2, 80, right.x + 5, right.y), 'not beside it');
  const bottom = tw(6, 6);
  assert.ok(!inHexagon(4, 4, 2, 2, 80, bottom.x, bottom.y + 4), 'not in front of it');
});

test('draw order by footprint centre: a small thing beside a big one\'s front face draws over it', async () => {
  const { depth } = await import('../outpost/src/iso.js');
  // A 1×1 just past a 3×3's front-right face, in its back row.
  assert.ok(depth(3, 0, 1, 1) > depth(0, 0, 3, 3));
  // A 1×1 just past the front-left face.
  assert.ok(depth(0, 3, 1, 1) > depth(0, 0, 3, 3));
  // Behind it stays behind.
  assert.ok(depth(0, -1, 1, 1) < depth(0, 0, 3, 3));
  // Two 2×2s side by side along i: the one at higher i is in front.
  assert.ok(depth(2, 0, 2, 2) > depth(0, 0, 2, 2));
});
