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

test('the view out of the box: streets along the screen, steep; specials and line-of-sight shadows are opt-in', () => {
  assert.equal(DEFAULTS.camera, 'iso', 'the 3D view');
  assert.equal(DEFAULTS.cameraAligned, true);
  assert.equal(DEFAULTS.cameraAlignedTilt, 75);
  assert.equal(DEFAULTS.cameraTilt, 25, 'the isometric view, when you switch to it, is a low one');
  assert.equal(DEFAULTS.specials, false);
  assert.equal(DEFAULTS.los, false);
  assert.equal(DEFAULTS.night, true, 'still night, with the flashlight');
  // Each has its control in the panel, and the defaults sit inside the sliders' ranges.
  const items = SCHEMA.flatMap((g) => g.items);
  for (const k of ['camera', 'cameraAligned', 'cameraTilt', 'cameraAlignedTilt', 'specials', 'los']) assert.ok(items.some((i) => i.key === k), `${k} in the panel`);
  for (const k of ['cameraTilt', 'cameraAlignedTilt']) {
    const it = items.find((i) => i.key === k);
    assert.ok(DEFAULTS[k] >= it.min && DEFAULTS[k] <= it.max, `${k} within ${it.min}..${it.max}`);
  }
});

test('old full saves: the old Hunter + Tank and line-of-sight defaults give way too; what you turn on sticks', () => {
  // Format 1 stored every value: specials:true and los:true there are just the defaults of the day.
  const old = { ...DEFAULTS, specials: true, los: true, viewSize: 520 };
  const s = { ...DEFAULTS, ...parseSaved(old) };
  assert.equal(s.specials, false);
  assert.equal(s.los, false);
  assert.equal(s.viewSize, 520);
  // Chosen since (the new format saves only what differs from the defaults): kept.
  const mine = JSON.parse(serializeSettings({ ...DEFAULTS, specials: true, los: true, cameraAligned: false, cameraTilt: 35 }));
  assert.deepEqual(mine, { _v: 2, cameraAligned: false, cameraTilt: 35, specials: true, los: true });
  assert.deepEqual(parseSaved(mine), { cameraAligned: false, cameraTilt: 35, specials: true, los: true });
  // A save that spells out today's defaults (tuned on a phone before they became the defaults) loads as nothing to change.
  const tuned = { _v: 2, cameraAligned: true, cameraTilt: 25, cameraAlignedTilt: 75, specials: false, los: false };
  assert.deepEqual({ ...DEFAULTS, ...parseSaved(tuned) }, { ...DEFAULTS });
  assert.deepEqual(JSON.parse(serializeSettings({ ...DEFAULTS, ...parseSaved(tuned) })), { _v: 2 });
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
  assert.equal(DEFAULTS.lore, true, 'graffiti & posters are visual only: on by default');
  const items = SCHEMA.flatMap((g) => g.items).map((i) => i.key);
  for (const k of ['stashes', 'boardedRooms', 'secret', 'holdout', 'holdoutTime', 'routes', 'landmarks', 'lore']) assert.ok(items.includes(k), `${k} in the panel`);
});

test('world signature: map switches restart the run, the gate timer does not', () => {
  assert.notEqual(worldSignature(DEFAULTS), worldSignature({ ...DEFAULTS, holdout: true }));
  assert.notEqual(worldSignature(DEFAULTS), worldSignature({ ...DEFAULTS, level: 'interior' }));
  assert.equal(worldSignature(DEFAULTS), worldSignature({ ...DEFAULTS, holdoutTime: 45, volume: 0.2 }));
  const every = WORLD_PRESETS.find((p) => p.name === 'Everything').values;
  assert.ok(Object.values(every).every(Boolean));
  assert.deepEqual(WORLD_PRESETS.find((p) => p.name === 'Default').values, { stashes: true, boardedRooms: true, secret: true, holdout: false, routes: false, landmarks: false, lore: true, ben: true });
  assert.ok(Object.values(WORLD_PRESETS.find((p) => p.name === 'Bare map').values).every((v) => v === false));
});

test('new this round: Pier 9, Night Terror and the playtest kit (heavy stuff off by default)', () => {
  assert.equal(DEFAULTS.nightTerror, false, 'the Night Terror is opt-in');
  assert.equal(DEFAULTS.daily, false);
  assert.equal(DEFAULTS.playtestPrompt, true, 'the rating card is three optional taps');
  assert.equal(DEFAULTS.ferryTime, 60);
  const items = SCHEMA.flatMap((g) => g.items);
  const level = items.find((i) => i.key === 'level');
  assert.ok(level.options.some(([v]) => v === 'docks'), 'Pier 9 in the level list');
  for (const k of ['nightTerror', 'ferryTime', 'playtestPrompt', 'daily']) assert.ok(items.some((i) => i.key === k), `${k} in the panel`);
  // Daily on/off is a different map; the ferry timer and the prompt are not.
  assert.notEqual(worldSignature(DEFAULTS), worldSignature({ ...DEFAULTS, daily: true }));
  assert.notEqual(worldSignature(DEFAULTS), worldSignature({ ...DEFAULTS, level: 'docks' }));
  assert.equal(worldSignature(DEFAULTS), worldSignature({ ...DEFAULTS, ferryTime: 90, playtestPrompt: false, nightTerror: true }));
  // Saved choices round-trip.
  assert.deepEqual(parseSaved(JSON.parse(serializeSettings({ ...DEFAULTS, level: 'docks', nightTerror: true, daily: true }))), { level: 'docks', nightTerror: true, daily: true });
});
