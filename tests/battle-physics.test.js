import test from 'node:test';
import assert from 'node:assert/strict';
import { Particle, Dist, integrate, collideGround, clampGround, hingeLimit, segSeg, MAX_SPEED } from '../battle/src/sim/physics.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);
const DT = 1 / 120;

test('segSeg finds the closest points of crossing, parallel and disjoint segments', () => {
  const o = {};
  segSeg(0, 0, 10, 0, 5, -5, 5, 5, o); // crossing
  close(o.d2, 0);
  close(o.x1, 5);
  segSeg(0, 0, 10, 0, 0, 3, 10, 3, o); // parallel, 3 apart
  close(o.d2, 9);
  segSeg(0, 0, 1, 0, 4, 4, 5, 5, o); // disjoint: end (1,0) to start (4,4)
  close(o.d2, 9 + 16);
  close(o.s, 1);
  close(o.t, 0);
  segSeg(2, 2, 2, 2, 0, 0, 4, 0, o); // degenerate point vs segment
  close(o.d2, 4);
});

test('a distance constraint converges to its rest length and respects mass', () => {
  const a = new Particle(0, 0, 1);
  const b = new Particle(30, 0, 3);
  const c = new Dist(a, b, 10);
  for (let i = 0; i < 20; i++) c.solve();
  close(Math.hypot(b.x - a.x, b.y - a.y), 10, 1e-6);
  // The heavy end moves a third as far as the light end
  close(a.x, 15);
  close(b.x, 25);
});

test('min-length and rope modes only act one way', () => {
  const a = new Particle(0, 0, 1);
  const b = new Particle(20, 0, 1);
  new Dist(a, b, 10, 1, 1).solve(); // push-apart only: already longer -> untouched
  close(b.x - a.x, 20);
  new Dist(a, b, 10, 1, -1).solve(); // rope: pulls in
  close(b.x - a.x, 10);
});

test('ground stops a falling particle, applies friction, and never lets it sink', () => {
  const p = new Particle(0, -100, 1, 2);
  p.setVel(300, 0, DT);
  let landedVx = null;
  for (let i = 0; i < 240; i++) {
    integrate(p, DT, 1150, 1);
    collideGround(p, DT);
    clampGround(p);
    assert.ok(p.y <= p.ground - p.r + 1e-9);
    if (p.onGround && landedVx == null) landedVx = p.vx(DT);
  }
  assert.ok(landedVx != null, 'never landed');
  assert.ok(Math.abs(p.vx(DT)) < 1, 'friction should stop sliding');
});

test('speed is capped and NaN never escapes integrate()', () => {
  const p = new Particle(0, 0, 1);
  p.setVel(1e6, 0, DT);
  integrate(p, DT, 0, 1);
  assert.ok(p.vx(DT) <= MAX_SPEED + 1e-6);
  const q = new Particle(0, 0, 1);
  q.fx = NaN;
  integrate(q, DT, 1150, 1);
  assert.ok(Number.isFinite(q.x) && Number.isFinite(q.y));
});

test('hingeLimit pushes a knee back to the allowed side', () => {
  const hip = new Particle(0, 0);
  const foot = new Particle(0, 30);
  const knee = new Particle(-5, 15); // bent the wrong way for side +1
  // side: sign of cross((foot - hip), (knee - hip)); +1 here means knee at +x
  hingeLimit(hip, knee, foot, -1, 1);
  assert.ok(knee.x > 0, `knee x ${knee.x}`);
  const knee2 = new Particle(5, 15);
  hingeLimit(hip, knee2, foot, -1, 1);
  close(knee2.x, 5); // already fine: untouched
});
