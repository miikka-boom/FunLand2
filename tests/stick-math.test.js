import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeStick, dragBase, fireState, isTap, aimTau, smoothAngle } from '../src/input/stick-math.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);

test('dead zone is radial and output is rescaled (no jump at the edge)', () => {
  const R = 60;
  // Inside the dead zone in any direction -> zero.
  for (const ang of [0, 0.5, 1, 2, 3]) {
    const v = shapeStick(Math.cos(ang) * 6, Math.sin(ang) * 6, R, 0.12, 0.85, 1);
    assert.equal(v.mag, 0);
  }
  // Just past the dead zone -> tiny output, not 12%.
  const v = shapeStick(0.121 * R, 0, R, 0.12, 0.85, 1);
  assert.ok(v.mag > 0 && v.mag < 0.01);
});

test('saturation gives full output before the rim', () => {
  const v = shapeStick(0.85 * 60, 0, 60, 0.12, 0.85, 1);
  close(v.mag, 1);
  const w = shapeStick(200, 0, 60, 0.12, 0.85, 1);
  close(w.mag, 1);
  close(w.raw, 1);
});

test('diagonals reach the same magnitude as cardinals', () => {
  const R = 60;
  const c = shapeStick(40, 0, R, 0.1, 0.9, 1);
  const d = shapeStick(40 / Math.SQRT2, 40 / Math.SQRT2, R, 0.1, 0.9, 1);
  close(c.mag, d.mag, 1e-9);
  close(Math.hypot(d.x, d.y), d.mag, 1e-9);
});

test('response curve > 1 gives finer control near the centre', () => {
  const lin = shapeStick(30, 0, 60, 0, 1, 1);
  const cur = shapeStick(30, 0, 60, 0, 1, 2);
  close(lin.mag, 0.5);
  close(cur.mag, 0.25);
});

test('dynamic base is dragged so the thumb stays on the rim', () => {
  const base = { x: 100, y: 100 };
  assert.equal(dragBase(base, 130, 100, 60), false);
  assert.deepEqual(base, { x: 100, y: 100 });
  assert.equal(dragBase(base, 250, 100, 60), true);
  close(base.x, 190);
  close(base.y, 100);
  // Reversing immediately yields full deflection the other way.
  const v = shapeStick(190 - 60 - base.x, 0, 60, 0.12, 0.85, 1);
  close(v.x, -1);
});

test('fire ring has hysteresis', () => {
  assert.equal(fireState(false, 0.44, 0.45, 0.12), false);
  assert.equal(fireState(false, 0.46, 0.45, 0.12), true);
  assert.equal(fireState(true, 0.41, 0.45, 0.12), true); // inside hysteresis band keeps firing
  assert.equal(fireState(true, 0.38, 0.45, 0.12), false);
  // A ring at zero means: fire as soon as the aim leaves the dead zone.
  assert.equal(fireState(false, 0.13, 0, 0.12), true);
  assert.equal(fireState(false, 0.05, 0, 0.12), false);
});

test('tap classification', () => {
  assert.equal(isTap(120, 5, false, 220, 14), true);
  assert.equal(isTap(300, 5, false, 220, 14), false); // too long
  assert.equal(isTap(120, 30, false, 220, 14), false); // moved
  assert.equal(isTap(120, 5, true, 220, 14), false); // it fired, so it was an aim
});

test('aim smoothing is stronger at small deflection and takes the short way round', () => {
  assert.ok(aimTau(0.02, 0.25) > aimTau(0.02, 1));
  assert.equal(aimTau(0, 0.5), 0);
  const a = smoothAngle(Math.PI - 0.1, -Math.PI + 0.1, 1 / 60, 0);
  close(a, Math.PI + 0.1, 1e-9); // crossed +-PI instead of spinning back
  const b = smoothAngle(0, 1, 1 / 60, 0.05);
  assert.ok(b > 0 && b < 1);
});
