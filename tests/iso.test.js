// The 3D view's camera math and painter's order (src/iso.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { IsoView, ISO_YAW, ISO_PITCH, depthOrder, drawBefore, behindGap, spanU } from '../src/iso.js';
import { mulberry32, rectsOverlap } from '../src/util.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const DEG = Math.PI / 180;

function view(yaw = ISO_YAW, pitch = ISO_PITCH, scale = 0.83) {
  const v = new IsoView(yaw, pitch);
  v.setViewport(844, 390, scale);
  v.lookAt(1200, 900);
  return v;
}

test('top-down (yaw 0, pitch 90) is the old flat mapping', () => {
  const v = view(0, Math.PI / 2, 0.5);
  const p = v.project(1300, 950, 0);
  assert.ok(near(p.x, 844 / 2 + 100 * 0.5));
  assert.ok(near(p.y, 390 / 2 + 50 * 0.5));
  // Height doesn't move anything when you look straight down.
  assert.ok(near(v.project(1300, 950, 80).y, p.y, 1e-6));
  assert.equal(v.flat, true);
});

test('the looked-at point sits mid-screen and unproject inverts project at any height', () => {
  for (const [yaw, pitch] of [[ISO_YAW, ISO_PITCH], [-ISO_YAW, 30 * DEG], [0, 60 * DEG], [2.2, 50 * DEG], [0, Math.PI / 2]]) {
    const v = view(yaw, pitch);
    const c = v.project(1200, 900, 0);
    assert.ok(near(c.x, 422) && near(c.y, 195));
    for (const [x, y, z] of [[0, 0, 0], [1234.5, 876.25, 0], [900, 1500, 26], [5800, 3600, 140]]) {
      const s = v.project(x, y, z);
      const w = v.unproject(s.x, s.y, z);
      assert.ok(near(w.x, x, 1e-6) && near(w.y, y, 1e-6), `round trip at yaw ${yaw} pitch ${pitch}`);
      assert.ok(near(v.px(x, y), s.x) && near(v.py(x, y, z), s.y));
    }
  }
});

test('true isometric: the three axes foreshorten equally, up is up', () => {
  const v = view();
  const o = v.project(0, 0, 0);
  const len = (p) => Math.hypot(p.x - o.x, p.y - o.y);
  const lx = len(v.project(100, 0, 0));
  const ly = len(v.project(0, 100, 0));
  const lz = len(v.project(0, 0, 100));
  assert.ok(near(lx, ly, 1e-9) && near(lx, lz, 1e-6));
  const up = v.project(0, 0, 100);
  assert.ok(near(up.x, o.x) && up.y < o.y);
  // The way to the goal on the city map (north-east) is straight up the screen.
  const ne = v.project(100, -100, 0);
  assert.ok(near(ne.x, o.x) && ne.y < o.y);
  // The camera sits to the south-west: it sees the west and south faces.
  assert.equal(v.faceX, -1);
  assert.equal(v.faceY, 1);
});

test('stick directions map to the ground heading that looks the same on screen', () => {
  for (const [yaw, pitch] of [[ISO_YAW, ISO_PITCH], [-ISO_YAW, 30 * DEG], [0, Math.PI / 2], [1, 45 * DEG]]) {
    const v = view(yaw, pitch);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const m = 0.2 + (k % 4) * 0.25;
      const w = v.dirToWorld(Math.cos(a) * m, Math.sin(a) * m);
      assert.ok(near(Math.hypot(w.x, w.y), m, 1e-9), 'deflection kept');
      const s = v.dirToScreen(w.x, w.y);
      const back = Math.atan2(s.y, s.x);
      assert.ok(near(Math.cos(back), Math.cos(a), 1e-9) && near(Math.sin(back), Math.sin(a), 1e-9), 'same heading on screen');
      assert.ok(near(v.angleToScreen(Math.atan2(w.y, w.x)), back, 1e-9));
    }
    const z = v.dirToWorld(0, 0);
    assert.equal(z.x, 0);
    assert.equal(z.y, 0);
  }
  // Top-down: sticks are world directions, untouched.
  const flat = view(0, Math.PI / 2);
  const w = flat.dirToWorld(0.6, -0.8);
  assert.ok(near(w.x, 0.6) && near(w.y, -0.8));
});

test('groundBounds covers everything on screen, onScreen agrees with project', () => {
  for (const [yaw, pitch] of [[ISO_YAW, ISO_PITCH], [-ISO_YAW, 30 * DEG], [0, Math.PI / 2]]) {
    const v = view(yaw, pitch);
    const r = v.groundBounds(0, 0);
    const rnd = mulberry32(7);
    for (let k = 0; k < 400; k++) {
      const sx = rnd() * v.w;
      const sy = rnd() * v.h;
      const p = v.unproject(sx, sy, 0);
      assert.ok(p.x >= r.x - 1e-6 && p.x <= r.x + r.w + 1e-6 && p.y >= r.y - 1e-6 && p.y <= r.y + r.h + 1e-6);
      assert.ok(v.onScreen(p.x, p.y));
    }
    assert.equal(v.onScreen(r.x - 500, r.y - 500), false);
    // Something tall standing just below the bottom edge still reaches into view.
    const below = v.unproject(v.w / 2, v.h + 30, 0);
    assert.equal(v.onScreen(below.x, below.y), false);
    if (!v.flat) {
      assert.equal(v.onScreen(below.x, below.y, 0, 120), true);
      const tall = v.groundBounds(0, 120);
      assert.ok(below.x >= tall.x && below.x <= tall.x + tall.w && below.y >= tall.y && below.y <= tall.y + tall.h);
    }
  }
});

test('a long wall is both nearer and farther than the things along it', () => {
  const v = view();
  // East-west wall, a crate north of its near (west) end, a crate south of its far (east) end.
  const wall = { x: 0, y: 0, w: 1000, h: 16 };
  const north = { x: 10, y: -50, w: 34, h: 34 };
  const south = { x: 950, y: 30, w: 34, h: 34 };
  assert.equal(drawBefore(v, north, wall), -1, 'the crate behind the wall first');
  assert.equal(drawBefore(v, wall, south), -1, 'the wall before the crate in front of it');
  // Centre depths alone would get both of these wrong.
  const d = (o) => v.depth(o.x + o.w / 2, o.y + o.h / 2);
  assert.ok(d(north) > d(wall) && d(south) < d(wall));
  const rank = depthOrder([wall, north, south], v);
  assert.ok(rank[1] < rank[0] && rank[0] < rank[2]);
  // Side by side on screen: no constraint.
  assert.equal(drawBefore(v, { x: 0, y: 0, w: 20, h: 20 }, { x: 200, y: 200, w: 20, h: 20 }), 0);
});

test('depthOrder respects every pair that shares a strip of the screen', () => {
  for (const yaw of [ISO_YAW, -ISO_YAW, 0, 2.3, -2.5]) {
    const v = view(yaw, ISO_PITCH);
    const rnd = mulberry32(1234 + Math.round(yaw * 100));
    const rects = [];
    // A mix of long walls, big blocks and small props that don't overlap.
    for (let k = 0; k < 4000 && rects.length < 260; k++) {
      const t = rnd();
      const long = 60 + rnd() * 500;
      const o = t < 0.3 ? { w: long, h: 14 } : t < 0.6 ? { w: 14, h: long } : t < 0.8 ? { w: 120 + rnd() * 260, h: 120 + rnd() * 260 } : { w: 34, h: 34 };
      o.x = Math.round(rnd() * 2600);
      o.y = Math.round(rnd() * 1800);
      o.w = Math.round(o.w);
      o.h = Math.round(o.h);
      if (!rects.some((q) => rectsOverlap(q, o, 1))) rects.push(o);
    }
    assert.ok(rects.length > 150);
    const rank = depthOrder(rects, v);
    assert.deepEqual([...rank].sort((a, b) => a - b), rects.map((_, i) => i), 'ranks are a permutation');
    let constrained = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const rel = drawBefore(v, rects[i], rects[j]);
        if (!rel) continue;
        constrained++;
        assert.ok(rel < 0 ? rank[i] < rank[j] : rank[i] > rank[j], `pair ${i},${j} at yaw ${yaw}`);
        // The relation is geometric: one of the two is wholly beyond the other.
        assert.ok(behindGap(v, rects[i], rects[j]) >= 0 || behindGap(v, rects[j], rects[i]) >= 0);
      }
    }
    assert.ok(constrained > 500);
  }
});

test('depthOrder survives props that overlap (no hang, still a permutation)', () => {
  const v = view();
  const rects = [
    { x: 0, y: 0, w: 100, h: 100 },
    { x: 50, y: 50, w: 100, h: 100 },
    { x: 90, y: 10, w: 100, h: 100 },
    { x: 20, y: 80, w: 100, h: 100 },
  ];
  const rank = depthOrder(rects, v);
  assert.deepEqual([...rank].sort((a, b) => a - b), [0, 1, 2, 3]);
  assert.equal(depthOrder([], v).length, 0);
});

test('spanU is the extent across the screen', () => {
  const v = view();
  const o = { x: 100, y: 200, w: 300, h: 50 };
  const s = spanU(v, o, [0, 0]);
  const us = [[100, 200], [400, 200], [400, 250], [100, 250]].map(([x, y]) => x * v.cy + y * v.sy);
  assert.ok(near(s[0], Math.min(...us)) && near(s[1], Math.max(...us)));
});
