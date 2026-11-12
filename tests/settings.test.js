import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, parseSaved, serializeSettings, worldSignature, WORLD_PRESETS, SCHEMA, LEVELS, LEVEL_IDS, LEVEL_KEYS, levelKey, forLevel } from '../src/settings.js';

test('the AI teammate is off by default', () => {
  assert.equal(DEFAULTS.ally, false);
});

test('saves hold only what differs from the defaults, and load back', () => {
  const s = { ...DEFAULTS, ally: true, moveSpeed: 220, level: 'interior' };
  const saved = JSON.parse(serializeSettings(s));
  assert.deepEqual(saved, { _v: 2, level: 'interior', moveSpeed: 220, ally: true });
  assert.deepEqual({ ...DEFAULTS, ...parseSaved(saved) }, s);
  assert.deepEqual(JSON.parse(serializeSettings({ ...DEFAULTS })), { _v: 2 });
});

test('old full saves: the old teammate default gives way to the new one, real choices stay', () => {
  // Format 1 stored every value, so ally:true there is just the old default.
  const old = { ...DEFAULTS, ally: true, moveSpeed: 220 };
  const s = { ...DEFAULTS, ...parseSaved(old) };
  assert.equal(s.ally, false);
  assert.equal(s.moveSpeed, 220);
  // Turned on again after the change, it's saved in the new format and sticks.
  assert.equal(parseSaved({ _v: 2, ally: true }).ally, true);
});

test('out of the box: specials and line-of-sight shadows are opt-in, night is on', () => {
  assert.equal(DEFAULTS.specials, false);
  assert.equal(DEFAULTS.los, false);
  assert.equal(DEFAULTS.night, true, 'still night, with the flashlight');
  const items = SCHEMA.flatMap((g) => g.items);
  for (const k of ['specials', 'los']) assert.ok(items.some((i) => i.key === k), `${k} in the panel`);
});

test('the camera is kept per map type: streets along the screen and steep outdoors, isometric and high in the Building', () => {
  // Every map type has the whole set, stored as key@level.
  for (const id of LEVEL_IDS) for (const k of LEVEL_KEYS) assert.ok(levelKey(k, id) in DEFAULTS, `${k}@${id}`);
  assert.deepEqual(LEVEL_KEYS, ['camera', 'cameraAligned', 'cameraTilt', 'cameraAlignedTilt', 'viewSize']);
  for (const k of LEVEL_KEYS) assert.equal(k in DEFAULTS, false, `${k} is no longer one global setting`);
  for (const id of LEVEL_IDS) {
    assert.equal(forLevel(DEFAULTS, 'camera', id), 'iso', `${id}: the 3D view`);
    assert.equal(forLevel(DEFAULTS, 'viewSize', id), 470);
    if (id === 'interior') continue;
    assert.equal(forLevel(DEFAULTS, 'cameraAligned', id), true, `${id}: streets along the screen`);
    assert.equal(forLevel(DEFAULTS, 'cameraAlignedTilt', id), 75);
    assert.equal(forLevel(DEFAULTS, 'cameraTilt', id), 25, 'the isometric view, when you switch to it, is a low one');
  }
  // The Building: turned 45 degrees, from as high as the slider goes.
  assert.equal(forLevel(DEFAULTS, 'cameraAligned', 'interior'), false);
  const items = SCHEMA.flatMap((g) => g.items);
  const tilt = items.find((i) => i.key === 'cameraTilt');
  assert.equal(forLevel(DEFAULTS, 'cameraTilt', 'interior'), tilt.max);
  // forLevel reads the level being played unless told otherwise.
  assert.equal(forLevel({ ...DEFAULTS, level: 'interior' }, 'cameraAligned'), false);
  assert.equal(forLevel({ ...DEFAULTS, level: 'city' }, 'cameraAligned'), true);
  // In the panel they are marked per map type, and every default sits inside its slider.
  for (const k of LEVEL_KEYS) {
    const it = items.find((i) => i.key === k);
    assert.ok(it && it.perLevel, `${k} is a per-map control`);
    if (it.type === 'range') for (const id of LEVEL_IDS) assert.ok(forLevel(DEFAULTS, k, id) >= it.min && forLevel(DEFAULTS, k, id) <= it.max, `${k}@${id}`);
  }
  assert.ok(SCHEMA.find((g) => g.perLevel && g.items.every((i) => i.perLevel)), 'they have a group of their own');
  assert.ok(items.filter((i) => !i.perLevel).every((i) => i.key in DEFAULTS), 'everything else is one setting for every map');
});

test('camera choices are saved per map type; the one-for-all camera of older saves is let go', () => {
  // Tune the Building's camera: only that is saved, and it loads back for that map alone.
  const s = { ...DEFAULTS, [levelKey('cameraTilt', 'interior')]: 55, [levelKey('viewSize', 'docks')]: 600 };
  const saved = JSON.parse(serializeSettings(s));
  assert.deepEqual(saved, { _v: 2, 'viewSize@docks': 600, 'cameraTilt@interior': 55 });
  const back = { ...DEFAULTS, ...parseSaved(saved) };
  assert.equal(forLevel(back, 'cameraTilt', 'interior'), 55);
  assert.equal(forLevel(back, 'cameraTilt', 'city'), 25);
  assert.equal(forLevel(back, 'viewSize', 'docks'), 600);
  assert.equal(forLevel(back, 'viewSize', 'city'), 470);
  // A save from before the camera was per map (one cameraAligned / cameraTilt / viewSize for everything):
  // those are dropped, so each map type starts from its own default; the rest of the save stays.
  const before = { _v: 2, cameraAligned: false, cameraTilt: 70, cameraAlignedTilt: 60, viewSize: 520, camera: 'top', specials: true };
  assert.deepEqual(parseSaved(before), { specials: true });
  const now = { ...DEFAULTS, ...parseSaved(before) };
  assert.equal(forLevel(now, 'cameraAligned', 'city'), true);
  assert.equal(forLevel(now, 'cameraAligned', 'interior'), false);
});

test('the map types: six of them, each with a name and a line for the title card', () => {
  assert.deepEqual(LEVEL_IDS, ['city', 'interior', 'docks', 'suburbia', 'graveyard', 'junkyard']);
  for (const l of LEVELS) assert.ok(l.name && l.sub && l.about, l.id);
  assert.equal(DEFAULTS.level, 'city');
  const level = SCHEMA.flatMap((g) => g.items).find((i) => i.key === 'level');
  assert.deepEqual(level.options.map(([v]) => v), LEVEL_IDS, 'all of them in the panel');
});

test('old full saves: the old Hunter + Tank and line-of-sight defaults give way too; what you turn on sticks', () => {
  // Format 1 stored every value: specials:true and los:true there are just the defaults of the day.
  const old = { ...DEFAULTS, specials: true, los: true, moveSpeed: 220 };
  const s = { ...DEFAULTS, ...parseSaved(old) };
  assert.equal(s.specials, false);
  assert.equal(s.los, false);
  assert.equal(s.moveSpeed, 220);
  // Chosen since (the new format saves only what differs from the defaults): kept.
  const mine = JSON.parse(serializeSettings({ ...DEFAULTS, specials: true, los: true }));
  assert.deepEqual(mine, { _v: 2, specials: true, los: true });
  assert.deepEqual(parseSaved(mine), { specials: true, los: true });
});

test('the night is 60% dark out of the box; an old full save holding the old 80% gives way, a chosen 80% sticks', () => {
  assert.equal(DEFAULTS.darkness, 0.6);
  const item = SCHEMA.flatMap((g) => g.items).find((i) => i.key === 'darkness');
  assert.ok(item && item.min <= 0.6 && item.max >= 0.6, 'within the slider');
  // Format 1 stored every value: 0.8 there is just the default of the day.
  const old = { ...DEFAULTS, darkness: 0.8, moveSpeed: 220 };
  assert.equal({ ...DEFAULTS, ...parseSaved(old) }.darkness, 0.6);
  // Another value in an old save was somebody's choice.
  assert.equal({ ...DEFAULTS, ...parseSaved({ ...DEFAULTS, darkness: 0.9 }) }.darkness, 0.9);
  // Set to 80% since: saved (it differs from the default now) and kept.
  const mine = JSON.parse(serializeSettings({ ...DEFAULTS, darkness: 0.8 }));
  assert.deepEqual(mine, { _v: 2, darkness: 0.8 });
  assert.deepEqual(parseSaved(mine), { darkness: 0.8 });
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
