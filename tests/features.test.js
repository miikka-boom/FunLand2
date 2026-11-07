import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../src/world/map-gen.js';
import { generateBuilding } from '../src/world/building-gen.js';
import { addWorldFeatures } from '../src/world/features-gen.js';
import { addScavenging } from '../src/world/scavenge-gen.js';
import { World, FlowField } from '../src/world/world.js';

const LEVELS = [
  ['city', generateCity],
  ['building', generateBuilding],
];
const SEEDS = [1337, 1, 2, 7, 42, 99];
const ALL = { holdout: true, routes: true, landmarks: true };

const goalOf = (map) => ({ x: map.endRoom.interior.x + map.endRoom.interior.w / 2, y: map.endRoom.interior.y + map.endRoom.interior.h / 2 });
/** Strict (body-sized) world of the map's obstacles that pass `keep`, plus `extra`. */
const strict = (map, keep = () => true, extra = []) => new World({ ...map, obstacles: map.obstacles.filter(keep).concat(extra), sealed: [] }, { strict: true });
const pathLen = (world, map, from = map.start) => {
  const f = new FlowField(world);
  f.compute(from.x, from.y);
  const g = goalOf(map);
  return f.pathDist(g.x, g.y);
};

for (const [name, gen] of LEVELS) {
  test(`${name}: features are seeded (same map, same features)`, () => {
    const a = addWorldFeatures(gen(1337), 1337, ALL);
    const b = addWorldFeatures(gen(1337), 1337, ALL);
    const key = (m) => JSON.stringify([m.obstacles.map((o) => [o.kind, o.x, o.y, o.w, o.h]), m.landmarks, m.nests, m.routeInfo]);
    assert.equal(key(a), key(b));
  });

  test(`${name}: with every feature off the map is untouched`, () => {
    const base = gen(42);
    const map = addWorldFeatures(gen(42), 42, {});
    assert.deepEqual(map.obstacles.map((o) => [o.kind, o.x, o.y, o.w, o.h]), base.obstacles.map((o) => [o.kind, o.x, o.y, o.w, o.h]));
    assert.equal(map.holdout, null);
    assert.equal(map.breach, null);
  });

  test(`${name}: holdout wall cuts the map; only the gate gets you through`, () => {
    for (const seed of SEEDS) {
      const map = addWorldFeatures(gen(seed), seed, { holdout: true });
      const H = map.holdout;
      assert.ok(H, `seed ${seed}: no holdout`);
      assert.ok(H.gate.opens && H.gate.navOpen, 'gate opens in the run and reads as a doorway to the flow field');
      // Gate shut (a solid wall piece): no way to the safe room. Gate open: there is one.
      const shut = strict(map, (o) => o !== H.gate, [{ ...H.gate, navOpen: false, opens: false }]);
      assert.equal(pathLen(shut, map), Infinity, `seed ${seed}: the wall leaks`);
      assert.ok(Number.isFinite(pathLen(strict(map, (o) => o !== H.gate), map)), `seed ${seed}: no route through the open gate`);
      // You can reach the control box from the start with the gate still shut.
      const f = new FlowField(shut);
      f.compute(map.start.x, map.start.y);
      assert.ok(Number.isFinite(f.pathDist(H.use.x, H.use.y)), `seed ${seed}: control box out of reach`);
      assert.equal(Math.sign(H.use.x - H.x), H.side, 'control box on the start side');
    }
  });

  test(`${name}: two routes, the long way round and a breach that saves real walking`, () => {
    for (const seed of SEEDS) {
      const map = addWorldFeatures(gen(seed), seed, { routes: true });
      const B = map.breach;
      assert.ok(B, `seed ${seed}: no breach`);
      assert.ok(B.boards.breach && !B.boards.navOpen, 'breach blocks the flow field until broken');
      const L = pathLen(strict(map), map);
      const S = pathLen(strict(map, (o) => o !== B.boards), map);
      assert.ok(Number.isFinite(L) && Number.isFinite(S), `seed ${seed}: a route is missing`);
      assert.ok((L - S) / L >= 0.15, `seed ${seed}: shortcut saves only ${Math.round(((L - S) / L) * 100)}%`);
      assert.ok(map.checkpoints.length >= 1, 'an open checkpoint');
      assert.ok(map.nests.length >= 8, `seed ${seed}: nest of ${map.nests.length}`);
      const open = strict(map, (o) => o !== B.boards);
      const f = new FlowField(open);
      f.compute(B.far.x, B.far.y);
      for (const n of map.nests) {
        assert.equal(Math.sign(n.x - B.x), -B.near, 'nest is beyond the breach');
        assert.ok(f.pathDist(n.x, n.y) < 600, 'nest is right behind the breach');
      }
    }
  });

  test(`${name}: landmarks leave the run walkable and their supplies reachable`, () => {
    for (const seed of SEEDS) {
      const map = addWorldFeatures(gen(seed), seed, { landmarks: true });
      assert.ok(map.landmarks.length >= 2, `seed ${seed}: ${map.landmarks.length} landmarks`);
      const w = strict(map);
      assert.ok(Number.isFinite(pathLen(w, map)), `seed ${seed}: route blocked`);
      const f = new FlowField(w);
      f.compute(map.start.x, map.start.y);
      for (const k of map.pickups.filter((q) => q.kind === 'ammo')) assert.ok(Number.isFinite(f.pathDist(k.x, k.y)), 'ammo can reachable');
      assert.ok(map.explosives.length >= 1, 'something to blow up');
      for (const e of map.explosives) {
        assert.ok(e.parts.length >= 2);
        for (const part of e.parts) assert.ok(map.obstacles.includes(part) && part.explosive === e.id && part.hp > 0);
      }
    }
  });

  test(`${name}: everything on, the finds are still reachable once the gate is open and boards are down`, () => {
    for (const seed of SEEDS.slice(0, 3)) {
      const map = addScavenging(addWorldFeatures(gen(seed), seed, ALL), seed);
      const w = strict(map, (o) => !o.opens && !o.boards);
      const f = new FlowField(w);
      f.compute(map.start.x, map.start.y);
      assert.ok(Number.isFinite(pathLen(w, map)), `seed ${seed}: no route`);
      for (const s of map.stashes) assert.ok(Number.isFinite(f.pathDist(s.x, s.y)), `seed ${seed}: ${s.tier} unreachable`);
    }
  });
}
