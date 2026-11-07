import test from 'node:test';
import assert from 'node:assert/strict';
import { lightAt, NightTerror, TERROR } from '../src/game/terror.js';
import { DEFAULTS } from '../src/settings.js';

function stub(extra = {}) {
  return {
    settings: { ...DEFAULTS, night: true },
    time: 0,
    player: { x: 0, y: 0, alive: true, facing: 0 },
    ally: null,
    world: { map: { lamps: [], fires: [], glows: [] }, segmentClear: () => true },
    events: { burns: [], finale: null },
    effects: { lights: [] },
    ...extra,
  };
}

test('night terror: invisible in the dark, shows in your beam (which hurts it)', () => {
  const g = stub();
  const dark = lightAt(g, -300, 0); // behind you
  assert.equal(dark.see, 0);
  assert.equal(dark.burn, 0);
  const lit = { ...lightAt(g, 250, 0) }; // straight down the beam
  assert.ok(lit.see > 0.9 && lit.burn > 0.9);
  const edge = lightAt(g, 250, 250); // 45° off the beam
  assert.equal(edge.see, 0);
  // Right next to you, the all-round glow gives only a hint of it, and doesn't burn.
  const close = lightAt(g, -40, 0);
  assert.ok(close.see > 0.1 && close.see < TERROR.hitLit + 0.2);
  assert.equal(close.burn, 0);
  // A wall in the way: the beam doesn't reach it.
  g.world.segmentClear = () => false;
  assert.equal(lightAt(g, 250, 0).burn, 0);
});

test('night terror: lamps and muzzle flashes show it, only your light and fire hurt it', () => {
  const g = stub({ player: { x: 9999, y: 9999, alive: true, facing: 0 } });
  g.world.map.lamps.push({ x: 0, y: 0, r: 165 });
  const lamp = { ...lightAt(g, 30, 0) };
  assert.ok(lamp.see > 0.8);
  assert.equal(lamp.burn, 0);
  g.world.map.lamps.length = 0;
  g.world.map.fires.push({ x: 0, y: 0 });
  assert.ok(lightAt(g, 40, 0).burn > 0.4);
  g.world.map.fires.length = 0;
  g.effects.lights.push({ x: 0, y: 0, r: 150, k: 0.85, life: 0.06, max: 0.06 });
  const flash = { ...lightAt(g, 20, 0) };
  assert.ok(flash.see > 0.5);
  assert.equal(flash.burn, 0);
  // Night off: there is no dark to hide in.
  const day = stub({ settings: { ...DEFAULTS, night: false } });
  assert.equal(lightAt(day, -500, 0).see, 1);
});

test('night terror: starts unseen (bullets, aim assist and the laser pass over it) and off by default', () => {
  const z = new NightTerror(10, 20);
  assert.equal(z.type, 'terror');
  assert.equal(z.ghost, true);
  assert.equal(z.lit, 0);
  assert.equal(DEFAULTS.nightTerror, false);
});
