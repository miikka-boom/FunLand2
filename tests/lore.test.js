import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../src/world/map-gen.js';
import { generateBuilding } from '../src/world/building-gen.js';
import { addWorldFeatures } from '../src/world/features-gen.js';
import { addScavenging } from '../src/world/scavenge-gen.js';
import { addLore } from '../src/world/lore-gen.js';
import { World } from '../src/world/world.js';
import { POSTERS, NOTES, CITY_GRAFFITI, BUILDING_GRAFFITI } from '../src/world/lore-content.js';
import { pointInRect, rectsOverlap } from '../src/util.js';

const LEVELS = [
  ['city', generateCity],
  ['building', generateBuilding],
];
const SEEDS = [1337, 1, 7, 42];
const full = (gen, seed, all = false) => {
  const map = gen(seed);
  if (all) addWorldFeatures(map, seed, { holdout: true, routes: true, landmarks: true });
  addScavenging(map, seed, {});
  return map;
};

for (const [name, gen] of LEVELS) {
  test(`${name}: flavor is seeded and purely visual (no obstacle touched)`, () => {
    const a = addLore(full(gen, 1337), 1337);
    const b = addLore(full(gen, 1337), 1337);
    assert.equal(JSON.stringify([a.decor, a.posters, a.roofArt]), JSON.stringify([b.decor, b.posters, b.roofArt]));
    for (const seed of SEEDS) {
      const map = full(gen, seed, true);
      const before = map.obstacles.map((o) => [o.kind, o.x, o.y, o.w, o.h]);
      addLore(map, seed);
      assert.deepEqual(map.obstacles.map((o) => [o.kind, o.x, o.y, o.w, o.h]), before, `seed ${seed}: obstacles changed`);
    }
  });

  test(`${name}: graffiti, posters and a den on every map, all of it drawn (no inspect text)`, () => {
    for (const seed of SEEDS) {
      for (const all of [false, true]) {
        const map = addLore(full(gen, seed, all), seed);
        const graffiti = map.decor.filter((d) => d.type === 'graffiti');
        assert.ok(graffiti.length >= 20, `seed ${seed}: ${graffiti.length} graffiti`);
        assert.ok(map.posters.length >= 6, `seed ${seed}: ${map.posters.length} posters`);
        assert.ok(map.dens.length >= 1, `seed ${seed}: no den`);
        assert.equal(map.readables, undefined, 'no inspect text: the words are in the world');
        if (name === 'city') assert.ok(map.roofArt.length >= 2, `seed ${seed}: roof messages`);
        // The den is lit, and its page's words are written out on the floor beside it.
        for (const d of map.dens) {
          assert.ok(map.glows.some((g) => g.den && Math.hypot(g.x - d.x, g.y - d.y) < 1), 'den candle glow');
          assert.ok(graffiti.some((g) => g.page && Math.hypot(g.x - d.x, g.y - d.y) < 200), `seed ${seed}: the den's page, written out`);
        }
      }
    }
  });

  test(`${name}: the start room has its wall of messages, inside the room`, () => {
    for (const seed of SEEDS) {
      const map = addLore(full(gen, seed), seed);
      const I = map.startRoom.interior;
      const inside = map.decor.filter((d) => d.type === 'graffiti' && pointInRect(d.x, d.y, I));
      assert.ok(inside.length >= 4, `seed ${seed}: ${inside.length} lines in the start room`);
      for (const d of inside) {
        const half = (d.text.length * d.size * 0.6) / 2;
        assert.ok(d.x - half >= I.x - 2 && d.x + half <= I.x + I.w + 2, `"${d.text}" runs under the wall`);
      }
    }
  });

  test(`${name}: ground writing sits on open ground; posters sit against a wall`, () => {
    for (const seed of SEEDS) {
      const map = addLore(full(gen, seed, true), seed);
      const world = new World({ ...map, sealed: [] });
      for (const d of map.decor.filter((q) => q.type === 'graffiti' || q.type === 'doodle')) {
        assert.ok(world.isFree(d.x, d.y, 3) || map.obstacles.some((o) => o.boards && pointInRect(d.x, d.y, o, 6)), `seed ${seed}: "${d.text || d.art}" is inside an obstacle`);
      }
      for (const p of map.posters) {
        assert.ok(POSTERS[p.design], `unknown poster ${p.design}`);
        assert.ok(map.obstacles.some((o) => o.kind !== 'border' && rectsOverlap(o, p, 2)), `seed ${seed}: poster floating away from any wall`);
        assert.ok(!map.obstacles.some((o) => o.kind !== 'border' && rectsOverlap(o, { x: p.x + 3, y: p.y + 3, w: p.w - 6, h: p.h - 6 }, -1) && !(o.kind === 'building' || o.kind === 'wall')), 'poster not under a prop');
      }
    }
  });
}

test('content: plenty to go round, nothing referenced that does not exist', () => {
  assert.ok(CITY_GRAFFITI.length >= 30 && BUILDING_GRAFFITI.length >= 15);
  assert.ok(NOTES.city.length >= 8 && NOTES.building.length >= 4 && NOTES.tinkerer.length >= 3);
  const texts = [...CITY_GRAFFITI, ...BUILDING_GRAFFITI].map((g) => g.text);
  assert.equal(new Set(texts).size, texts.length, 'no duplicate lines');
  for (const d of Object.values(POSTERS)) assert.ok(d.head && d.bg && d.fg && (d.city || d.building));
});

test('every line meant to be read in the world is short enough to read from above', () => {
  for (const set of [NOTES.city, NOTES.building, NOTES.docks, NOTES.tinkerer]) for (const t of set) assert.ok(t.length <= 40, t);
});
