import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../src/world/map-gen.js';
import { generateBuilding } from '../src/world/building-gen.js';
import { generateDocks } from '../src/world/docks-gen.js';
import { addWorldFeatures } from '../src/world/features-gen.js';
import { addScavenging } from '../src/world/scavenge-gen.js';
import { addLore } from '../src/world/lore-gen.js';
import { addBen } from '../src/world/ben-gen.js';
import { World, FlowField } from '../src/world/world.js';
import { BEN_START, BEN_KNOWS, BEN_NEST, BEN_NOTES } from '../src/world/ben-content.js';
import { initBen, updateBen, loadBenMemory } from '../src/game/ben.js';
import { DEFAULTS, SCHEMA, WORLD_KEYS, WORLD_PRESETS } from '../src/settings.js';
import { lampLit, pointInRect, wrapAngle } from '../src/util.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const LEVELS = [
  ['city', generateCity],
  ['interior', generateBuilding],
  ['docks', generateDocks],
];
const SEEDS = [1337, 7, 42, 99];
const build = (gen, seed, { lore = true, all = false, memory = {} } = {}) => {
  const map = gen(seed);
  if (all && map.theme !== 'docks') addWorldFeatures(map, seed, { holdout: true, routes: true, landmarks: true });
  addScavenging(map, seed, {});
  if (lore) addLore(map, seed);
  addBen(map, seed, { memory });
  return map;
};
const of = (map, type) => map.decor.filter((d) => d.type === type);

for (const [name, gen] of LEVELS) {
  test(`${name}: Ben's traces are seeded and purely visual`, () => {
    const a = build(gen, 1337);
    const b = build(gen, 1337);
    assert.equal(JSON.stringify([a.decor, a.benRoof, a.ben]), JSON.stringify([b.decor, b.benRoof, b.ben]));
    for (const seed of SEEDS) {
      const map = gen(seed);
      addScavenging(map, seed, {});
      addLore(map, seed);
      const before = map.obstacles.map((o) => [o.kind, o.x, o.y, o.w, o.h]);
      addBen(map, seed, {});
      assert.deepEqual(map.obstacles.map((o) => [o.kind, o.x, o.y, o.w, o.h]), before, `seed ${seed}: obstacles changed`);
    }
  });

  test(`${name}: every map has his signs (first room, his bed, the eyes, a vent, somewhere impossible)`, () => {
    for (const seed of SEEDS) {
      for (const opts of [{}, { lore: false }, { all: true }]) {
        const map = build(gen, seed, opts);
        const B = map.ben;
        const tag = `seed ${seed} ${JSON.stringify(opts)}`;
        const I = map.startRoom.interior;
        assert.ok(of(map, 'bentext').some((d) => d.text === BEN_START && pointInRect(d.x, d.y, I)), `${tag}: "${BEN_START}" in the first room`);
        assert.ok(of(map, 'rabbit').some((d) => pointInRect(d.x, d.y, I)), `${tag}: the rabbit in the first room`);
        assert.ok(B.nest, `${tag}: his bed`);
        assert.equal(of(map, 'benfort').length, 1);
        assert.ok(of(map, 'benchalk').some((d) => d.kind === 'map' && d.sketch), `${tag}: his map, in chalk by his bed`);
        assert.ok(of(map, 'rabbit').some((d) => d.nest), `${tag}: the rabbit again, in his bed`);
        assert.ok(map.glows.some((g) => g.ben), `${tag}: his candle`);
        assert.ok(B.eyes.length >= 4, `${tag}: eyes (${B.eyes.length})`);
        assert.ok(of(map, 'vent').length >= 1 && of(map, 'footprints').length === 1, `${tag}: footprints to a vent`);
        assert.ok(map.benRoof.length + of(map, 'raft').length >= 1, `${tag}: "ben was here" somewhere nobody could reach`);
        assert.ok(map.lamps.some((l) => l.morse), `${tag}: the blinking lamp`);
        assert.ok(B.glimpse, `${tag}: a place to catch him looking`);
        for (const l of BEN_NOTES[name]) assert.ok(of(map, 'graffiti').some((g) => g.text === l.text), `${tag}: the squad's page, written out: ${l.text}`);
        assert.equal(map.readables, undefined, `${tag}: no inspect text`);
        // Nothing of his in the water, nothing in the walls.
        const W = new World(map);
        for (const d of map.decor.filter((q) => ['bentext', 'beneyes', 'benfort', 'rabbit', 'benpaper', 'benarrow'].includes(q.type))) {
          assert.ok(!(map.water || []).some((w) => pointInRect(d.x, d.y, w)), `${tag}: ${d.type} in the water`);
        }
        void W;
      }
    }
  });

  test(`${name}: his bed is off the route but reachable; his map marks the secret; the eyes look at it`, () => {
    for (const seed of SEEDS) {
      const map = build(gen, seed);
      const B = map.ben;
      const world = new World({ ...map, obstacles: map.obstacles.filter((o) => !o.opens && !o.boards), sealed: [] }, { strict: true });
      const f = new FlowField(world);
      f.compute(map.start.x, map.start.y);
      assert.ok(Number.isFinite(f.pathDist(B.nest.mouth.x, B.nest.mouth.y)), `seed ${seed}: can't walk to his bed`);
      const secret = map.stashes.find((s) => s.tier === 'secret');
      if (secret) {
        assert.deepEqual(B.sketch.secret, { x: secret.x, y: secret.y });
        const e = B.eyes.find((q) => Math.hypot(q.x - secret.x, q.y - secret.y) < 160);
        assert.ok(e, `seed ${seed}: eyes by the secret`);
        assert.ok(Math.abs(wrapAngle(e.look - Math.atan2(secret.y - e.y, secret.x - e.x))) < 0.05, 'looking at it');
      }
      // The footprints end at the vent.
      const fp = of(map, 'footprints')[0];
      const last = fp.pts[0];
      assert.ok(of(map, 'vent').some((v) => Math.hypot(v.x - last[0], v.y - last[1]) < 45), `seed ${seed}: prints stop at the vent`);
      // The map leaves one place off its own edge.
      const a = B.sketch.away;
      assert.ok(a.x < 0 || a.y < 0 || a.x > map.w || a.y > map.h);
    }
  });
}

test('he knows what you did on earlier runs (this device only), one line at a time', () => {
  const at = (memory) => {
    const map = build(generateCity, 1337, { memory });
    return { knows: map.ben.knows, nest: map.ben.nestLine, texts: of(map, 'bentext').map((d) => d.text) };
  };
  const none = at({});
  assert.equal(none.knows, null);
  assert.equal(none.nest, null);
  assert.equal(at({ deaths: 6 }).knows, BEN_KNOWS.died(6));
  assert.equal(at({ deaths: 5 }).knows, null, 'only every third death');
  assert.equal(at({ deaths: 6, pendingBack: 'city' }).knows, BEN_KNOWS.back, 'coming back after a win comes first');
  assert.equal(at({ pendingBack: 'interior' }).knows, null, 'another level');
  assert.equal(at({ nests: { city: 1 } }).nest, BEN_NEST.again);
  assert.equal(at({ nests: { city: 4 } }).nest, BEN_NEST.rabbit);
  assert.ok(at({ deaths: 3 }).texts.includes(BEN_KNOWS.died(3)));
});

test('run time: finding his bed and dying are remembered; "why come back?" is said once', () => {
  store.clear();
  const map = build(generateCity, 1337);
  const mem = loadBenMemory();
  const said = [];
  const game = {
    level: 'city',
    won: false,
    lost: false,
    settings: { night: true },
    player: { x: map.start.x, y: map.start.y, alive: true },
    stats: {},
    world: { map, segmentClear: () => false },
    audio: { benWhistle: () => said.push('whistle'), benScuff: () => said.push('scuff') },
    effects: { steam: () => said.push('steam') },
  };
  initBen(game, map, mem);
  // Near his bed (out of sight): someone whistles, once.
  game.player.x = map.ben.nest.x + 400;
  game.player.y = map.ben.nest.y;
  updateBen(game, 1 / 60);
  updateBen(game, 1 / 60);
  assert.equal(said.filter((s) => s === 'whistle').length, 1);
  // At his bed: found, and remembered.
  game.player.x = map.ben.nest.mouth.x;
  game.player.y = map.ben.nest.mouth.y;
  updateBen(game, 1 / 60);
  assert.equal(game.stats.benNest, 1);
  assert.equal(loadBenMemory().nests.city, 1);
  assert.ok(said.includes('steam'), 'the can is still warm');
  // Die: counted.
  game.lost = true;
  updateBen(game, 1 / 60);
  updateBen(game, 1 / 60);
  assert.equal(loadBenMemory().deaths, 1);
  // Win next time: the next run on this level gets the line, and only that one.
  const m2 = loadBenMemory();
  const map2 = build(generateCity, 1337, { memory: m2 });
  const g2 = { ...game, won: true, lost: false, stats: {}, world: { map: map2, segmentClear: () => false } };
  initBen(g2, map2, m2);
  updateBen(g2, 1 / 60);
  assert.equal(loadBenMemory().pendingBack, 'city');
  const m3 = loadBenMemory();
  const map3 = build(generateCity, 1337, { memory: m3 });
  assert.equal(map3.ben.knows, BEN_KNOWS.back);
  initBen({ ...game, world: { map: map3 } }, map3, m3);
  assert.equal(loadBenMemory().pendingBack, undefined, 'said once');
});

test('the blinking lamp spells the same three letters over and over', () => {
  const l = { x: 0, y: 0, morse: true };
  // B -...  E .  N -.  (dash = 3 units on, dot = 1; 1 off inside a letter, 3 between, 7 at the end)
  const want = '1110101010001000111010000000';
  const unit = 0.17;
  for (const loop of [0, 1, 5]) {
    let got = '';
    for (let u = 0; u < 28; u++) got += lampLit(l, (loop * 28 + u + 0.5) * unit) ? '1' : '0';
    assert.equal(got, want, `loop ${loop}`);
  }
  assert.equal(lampLit({ x: 0, y: 0 }, 1), true, 'ordinary lamps stay on');
});

test("settings: Ben's traces on by default, a World switch, in the presets", () => {
  assert.equal(DEFAULTS.ben, true);
  assert.ok(SCHEMA.find((g) => g.presets === 'world').items.some((i) => i.key === 'ben'));
  assert.ok(WORLD_KEYS.includes('ben'), 'switching it restarts the run');
  assert.equal(WORLD_PRESETS.find((p) => p.name === 'Bare map').values.ben, false);
  assert.equal(WORLD_PRESETS.find((p) => p.name === 'Everything').values.ben, true);
});

test('no inspect text anywhere: no caption box, no paper overlay, the drawings are in chalk on the ground', async () => {
  const fs = await import('node:fs');
  const hud = fs.readFileSync(new URL('../src/render/hud.js', import.meta.url), 'utf8');
  assert.ok(!/drawCaption|drawBenPaper/.test(hud), 'the HUD shows no object text');
  const events = fs.readFileSync(new URL('../src/game/world-events.js', import.meta.url), 'utf8');
  assert.ok(!/updateCaption|l\.label/.test(events), 'no caption, no landmark name call-outs');
  for (const [name, gen] of LEVELS) {
    let both = 0;
    for (const seed of SEEDS) {
      const map = build(gen, seed);
      const kinds = new Set(of(map, 'benchalk').map((d) => d.kind));
      if (kinds.has('map') && kinds.has('drawing')) both++;
      for (const d of of(map, 'benchalk')) {
        // Every bit of a chalk drawing is on open ground.
        const W = new World(map);
        const c = Math.cos(d.a || 0);
        const s = Math.sin(d.a || 0);
        for (const [fx, fy] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9], [0.5, 0.5]]) {
          const lx = (fx - 0.5) * d.w;
          const ly = (fy - 0.5) * d.h;
          assert.ok(W.isFree(d.x + c * lx - s * ly, d.y + s * lx + c * ly, 2), `${name} ${seed}: chalk ${d.kind} over something`);
        }
      }
    }
    assert.ok(both >= SEEDS.length - 1, `${name}: his map and the squad drawing on most maps (${both}/${SEEDS.length})`);
  }
});
