import test from 'node:test';
import assert from 'node:assert/strict';
import { SpatialHash } from '../src/world/world.js';
import { zombieCap, BASE_ZOMBIES, ZOMBIE_CEILING } from '../src/game/director.js';
import { fromLogPos, toLogPos } from '../src/settings-panel.js';
import { DEFAULTS, SCHEMA } from '../src/settings.js';
import { mulberry32 } from '../src/util.js';

test('hash.pairs visits every close pair exactly once (crowd separation relies on it)', () => {
  const rnd = mulberry32(7);
  const cell = 24;
  const hash = new SpatialHash(600, 400, cell);
  const pts = [];
  // A dense clump (many per cell) plus a sparse spread, and some off-map points (clamped cells).
  for (let i = 0; i < 400; i++) pts.push({ id: i, x: 280 + rnd() * 60, y: 180 + rnd() * 50 });
  for (let i = 400; i < 700; i++) pts.push({ id: i, x: rnd() * 600, y: rnd() * 400 });
  for (let i = 700; i < 720; i++) pts.push({ id: i, x: -30 + rnd() * 20, y: rnd() * 400 });
  for (const p of pts) hash.insert(p);

  const seen = new Map();
  hash.pairs((a, b) => {
    assert.notEqual(a, b);
    const k = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    seen.set(k, (seen.get(k) || 0) + 1);
  });
  for (const n of seen.values()) assert.equal(n, 1, 'a pair came up twice');
  // Brute force: every pair closer than one cell must have been visited.
  let close = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      if (dx * dx + dy * dy < cell * cell) {
        close++;
        assert.ok(seen.has(`${i}:${j}`), `missed close pair ${i}:${j}`);
      }
    }
  }
  assert.ok(close > 1000, 'test needs a dense crowd');
});

test('zombie cap: 230 by default, scales with the horde sliders, hard ceiling', () => {
  assert.equal(zombieCap(DEFAULTS), BASE_ZOMBIES);
  assert.equal(zombieCap({ hordeSize: 0.25, wanderers: 0 }), BASE_ZOMBIES);
  assert.equal(zombieCap({ hordeSize: 3, wanderers: 1 }), 690);
  assert.equal(zombieCap({ hordeSize: 1, wanderers: 10 }), 2300);
  assert.equal(zombieCap({ hordeSize: 25, wanderers: 10 }), ZOMBIE_CEILING);
});

test('log slider: endpoints, x1 default reachable, round trip, 2 significant digits', () => {
  const item = SCHEMA.flatMap((g) => g.items).find((i) => i.key === 'hordeSize');
  assert.ok(item.log && item.max >= 20, 'horde size is a log slider reaching massive hordes');
  assert.equal(fromLogPos(item, 0), item.min);
  assert.equal(fromLogPos(item, 1000), item.max);
  assert.equal(fromLogPos(item, toLogPos(item, DEFAULTS.hordeSize)), DEFAULTS.hordeSize);
  let prev = 0;
  for (let pos = 0; pos <= 1000; pos++) {
    const v = fromLogPos(item, pos);
    assert.ok(v >= prev, 'monotonic');
    prev = v;
    const digits = String(v).replace('.', '').replace(/^0+/, '');
    assert.ok(digits.length <= 2, `${v} has more than 2 significant digits`);
    assert.equal(fromLogPos(item, toLogPos(item, v)), v, `round trip ${v}`);
  }
});
