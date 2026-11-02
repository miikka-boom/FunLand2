// Behavioural tests for the twin-stick touch controller. These pin down the
// control rules in docs/CONTROLS.md so tuning work can't silently break them.
import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal browser stand-in: the controller only checks touch support at construction.
globalThis.window = { ontouchstart: null };

const { TouchControls } = await import('../src/input/touch-controls.js');
const { computeLayout } = await import('../src/layout.js');
const { DEFAULTS } = await import('../src/settings.js');

const W = 844;
const H = 390;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function make(overrides = {}) {
  const settings = { ...DEFAULTS, ...overrides };
  const layout = computeLayout(W, H, { l: 0, r: 0, t: 0, b: 0 }, settings);
  const tc = new TouchControls({ addEventListener() {} }, settings, () => layout);
  const ev = (live) => ({ cancelable: true, preventDefault() {}, changedTouches: [], touches: live.map((identifier) => ({ identifier })) });
  return { tc, settings, layout, ev };
}

test('finger ownership is decided where it lands and survives crossing the split', () => {
  const { tc } = make();
  tc._contact('start', 1, 150, 300);
  tc._contact('start', 2, 650, 300);
  assert.equal(tc.move.touchId, 1);
  assert.equal(tc.aim.touchId, 2);
  tc._contact('move', 1, 600, 300); // left thumb wanders into the right half
  tc.update();
  assert.equal(tc.move.touchId, 1);
  assert.ok(tc.move.out.x > 0.99, 'still drives the move stick');
});

test('dynamic base follows the thumb, floating stays, fixed is pinned', () => {
  const R = DEFAULTS.stickRadius;
  const dyn = make({ moveMode: 'dynamic' }).tc;
  dyn._contact('start', 1, 150, 300);
  dyn._contact('move', 1, 150 + R + 40, 300);
  assert.equal(dyn.move.base.x, 190);
  const flo = make({ moveMode: 'floating' }).tc;
  flo._contact('start', 1, 150, 300);
  flo._contact('move', 1, 150 + R + 40, 300);
  assert.equal(flo.move.base.x, 150);
  const { tc: fix, layout } = make({ aimMode: 'fixed' });
  fix._contact('start', 2, 600, 200);
  assert.deepEqual(fix.aim.base, { x: layout.fixedAim.x, y: layout.fixedAim.y });
});

test('fire ring: aim-only inside, fire outside, with hysteresis', () => {
  const R = DEFAULTS.stickRadius;
  const { tc } = make();
  tc._contact('start', 2, 650, 250);
  const at = (f) => {
    tc._contact('move', 2, 650 + R * f, 250);
    tc.update();
    return tc.aim.firing;
  };
  assert.equal(at(0.3), false);
  assert.equal(at(0.6), true);
  assert.equal(at(0.42), true, 'inside the hysteresis band keeps firing');
  assert.equal(at(0.3), false);
});

test('quick tap on the aim side shoves; firing or holding does not', async () => {
  const R = DEFAULTS.stickRadius;
  const { tc } = make();
  tc._contact('start', 2, 650, 250);
  tc._contact('end', 2, 650, 250);
  assert.deepEqual(tc.consumeEvents(), ['shove']);

  tc._contact('start', 3, 650, 250);
  tc._contact('move', 3, 650 + R * 0.7, 250);
  tc.update(); // crossed the fire ring
  tc._contact('move', 3, 652, 250);
  tc._contact('end', 3, 652, 250);
  assert.deepEqual(tc.consumeEvents(), [], 'a short burst of fire is not a shove');

  tc._contact('start', 4, 650, 250);
  await sleep(DEFAULTS.tapMaxMs + 40);
  tc._contact('end', 4, 650, 250);
  assert.deepEqual(tc.consumeEvents(), [], 'long press is not a shove');
});

test('a slightly rolled tap does not aim (so it cannot turn you) but still shoves', () => {
  const { tc } = make();
  tc._contact('start', 2, 650, 250);
  tc._contact('move', 2, 650, 260); // 10 px roll: past the aim dead zone, within tap travel
  tc.update();
  assert.ok(tc.aim.out.raw > DEFAULTS.aimDeadzone);
  assert.equal(tc.aim.tapCandidate, true, 'aim suppressed while it could still be a tap');
  tc._contact('end', 2, 650, 260);
  assert.deepEqual(tc.consumeEvents(), ['shove']);
  tc._contact('start', 3, 650, 250);
  tc._contact('move', 3, 650, 275); // a real aim: beyond tap travel
  tc.update();
  assert.equal(tc.aim.tapCandidate, false);
});

test('second finger tapping the aim side while aiming shoves', () => {
  const { tc } = make();
  tc._contact('start', 2, 650, 250);
  tc._contact('move', 2, 700, 250);
  tc._contact('start', 5, 560, 160);
  tc._contact('end', 5, 560, 160);
  assert.deepEqual(tc.consumeEvents(), ['shove']);
  assert.equal(tc.aim.touchId, 2, 'the aim thumb keeps aiming');
});

test('buttons fire on touch-down and never start a stick', () => {
  const { tc, layout } = make();
  const b = layout.byId.reload;
  tc._contact('start', 7, b.x, b.y);
  assert.deepEqual(tc.consumeEvents(), ['reload']);
  assert.equal(tc.aim.active, false);
  assert.ok(tc.pressed.has('reload'));
  tc._contact('end', 7, b.x, b.y);
  assert.ok(!tc.pressed.has('reload'));
});

test('sticks can never stay stuck: sweep on live touches, and reused ids reset', () => {
  const R = DEFAULTS.stickRadius;
  const { tc, ev } = make();
  tc._contact('start', 1, 150, 300);
  tc._contact('start', 2, 650, 250);
  tc._touch(ev([2]), 'move'); // touchend for 1 was lost
  assert.equal(tc.move.active, false);
  assert.equal(tc.aim.active, true);

  tc._contact('move', 2, 650 + R, 250);
  tc.update();
  assert.equal(tc.aim.firing, true);
  tc._contact('start', 2, 640, 240); // id 2 reused: its end was lost too
  tc.update();
  assert.deepEqual(tc.aim.base, { x: 640, y: 240 });
  assert.equal(tc.aim.firing, false);
});

test('a cancelled touch releases without shoving', () => {
  const { tc } = make();
  tc._contact('start', 2, 650, 250);
  tc._contact('cancel', 2, 650, 250);
  assert.equal(tc.aim.active, false);
  assert.deepEqual(tc.consumeEvents(), []);
});
