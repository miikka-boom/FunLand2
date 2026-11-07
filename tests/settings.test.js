import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, parseSaved, serializeSettings, worldSignature, WORLD_PRESETS, SCHEMA } from '../src/settings.js';

test('the AI teammate is off by default', () => {
  assert.equal(DEFAULTS.ally, false);
});

test('saves hold only what differs from the defaults, and load back', () => {
  const s = { ...DEFAULTS, ally: true, viewSize: 520, level: 'interior' };
  const saved = JSON.parse(serializeSettings(s));
  assert.deepEqual(saved, { _v: 2, ally: true, viewSize: 520, level: 'interior' });
  assert.deepEqual({ ...DEFAULTS, ...parseSaved(saved) }, s);
  assert.deepEqual(JSON.parse(serializeSettings({ ...DEFAULTS })), { _v: 2 });
});

test('old full saves: the old teammate default gives way to the new one, real choices stay', () => {
  // Format 1 stored every value, so ally:true there is just the old default.
  const old = { ...DEFAULTS, ally: true, viewSize: 520 };
  const s = { ...DEFAULTS, ...parseSaved(old) };
  assert.equal(s.ally, false);
  assert.equal(s.viewSize, 520);
  // Turned on again after the change, it's saved in the new format and sticks.
  assert.equal(parseSaved({ _v: 2, ally: true }).ally, true);
});

test('bad saves are ignored key by key', () => {
  assert.deepEqual(parseSaved(null), {});
  assert.deepEqual(parseSaved('nope'), {});
  assert.deepEqual(parseSaved({ _v: 2, viewSize: 'big', bogus: 1, laser: false }), { laser: false });
});

test('world: finds on, the big features off by default (players are not overwhelmed)', () => {
  assert.equal(DEFAULTS.stashes, true);
  assert.equal(DEFAULTS.boardedRooms, true);
  assert.equal(DEFAULTS.secret, true);
  assert.equal(DEFAULTS.holdout, false);
  assert.equal(DEFAULTS.routes, false);
  assert.equal(DEFAULTS.landmarks, false);
  const items = SCHEMA.flatMap((g) => g.items).map((i) => i.key);
  for (const k of ['stashes', 'boardedRooms', 'secret', 'holdout', 'holdoutTime', 'routes', 'landmarks']) assert.ok(items.includes(k), `${k} in the panel`);
});

test('world signature: map switches restart the run, the gate timer does not', () => {
  assert.notEqual(worldSignature(DEFAULTS), worldSignature({ ...DEFAULTS, holdout: true }));
  assert.notEqual(worldSignature(DEFAULTS), worldSignature({ ...DEFAULTS, level: 'interior' }));
  assert.equal(worldSignature(DEFAULTS), worldSignature({ ...DEFAULTS, holdoutTime: 45, volume: 0.2 }));
  const every = WORLD_PRESETS.find((p) => p.name === 'Everything').values;
  assert.ok(Object.values(every).every(Boolean));
  assert.deepEqual(WORLD_PRESETS.find((p) => p.name === 'Default').values, { stashes: true, boardedRooms: true, secret: true, holdout: false, routes: false, landmarks: false });
});
