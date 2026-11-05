import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../src/world/map-gen.js';
import { generateBuilding } from '../src/world/building-gen.js';
import { addScavenging, analyse, detour, TUNE, LOOT_TABLES } from '../src/world/scavenge-gen.js';
import { World, FlowField } from '../src/world/world.js';
import { LOOT } from '../src/game/loot.js';

const INF = 0x3fffffff;
const LEVELS = [
  ['city', generateCity, TUNE.city],
  ['building', generateBuilding, TUNE.interior],
];
const SEEDS = [1337, 1, 2, 3, 42, 99, 2024, 777];

const reach = (world, field, x, y) => {
  const i = world.navIndex(x, y);
  return !world.blocked[i] && field.dist[i] < INF;
};

for (const [name, gen, T] of LEVELS) {
  test(`${name}: same seed, same stashes, rooms and chalk`, () => {
    const a = addScavenging(gen(1337), 1337);
    const b = addScavenging(gen(1337), 1337);
    const key = (m) => JSON.stringify([m.stashes, m.sealed.map((r) => [r.interior, r.door, r.outside]), m.decor.filter((d) => d.type === 'chalk')]);
    assert.equal(key(a), key(b));
  });

  test(`${name}: carving never takes away free space, and the route stays open`, () => {
    for (const seed of SEEDS) {
      const base = new World(gen(seed));
      const map = addScavenging(gen(seed), seed);
      const world = new World(map);
      for (let i = 0; i < base.blocked.length; i++) {
        if (!base.blocked[i]) assert.equal(world.blocked[i], 0, `seed ${seed}: cell ${i} became blocked`);
      }
      // Even with every board nailed shut for the flow field too, the safe room is reachable.
      const shut = { ...map, obstacles: map.obstacles.map((o) => (o.boards ? { ...o, navOpen: false } : o)), sealed: [] };
      const sw = new World(shut);
      sw.flow.compute(map.start.x, map.start.y);
      const er = map.endRoom.interior;
      assert.ok(Number.isFinite(sw.flow.pathDist(er.x + er.w / 2, er.y + er.h / 2)), `seed ${seed}: route blocked`);
    }
  });

  test(`${name}: stashes sit off the route, spread out and reachable; one secret`, () => {
    for (const seed of SEEDS) {
      const baseMap = gen(seed);
      const A = analyse(new World(baseMap, { strict: true }), baseMap);
      const map = addScavenging(gen(seed), seed);
      const world = new World(map);
      world.flow.compute(map.start.x, map.start.y);
      const regular = map.stashes.filter((s) => s.tier === 'stash');
      const secrets = map.stashes.filter((s) => s.tier === 'secret');
      assert.ok(regular.length >= T.stashes - 1, `seed ${seed}: only ${regular.length} stashes`);
      assert.equal(secrets.length, 1, `seed ${seed}: secret count`);
      // A body can walk to every find once the boards are down (strict: no slivers).
      const open = new World({ ...map, obstacles: map.obstacles.filter((o) => !o.boards), sealed: [] }, { strict: true });
      open.flow.compute(map.start.x, map.start.y);
      for (const s of map.stashes) {
        assert.ok(reach(world, world.flow, s.x, s.y), `seed ${seed}: ${s.tier} at ${s.x},${s.y} unreachable`);
        assert.ok(reach(open, open.flow, s.x, s.y), `seed ${seed}: ${s.tier} at ${s.x},${s.y} only reachable through a sliver`);
        assert.ok(world.isFree(s.x, s.y, 14), `seed ${seed}: ${s.tier} has no room to stand`);
        for (const id of s.loot) assert.ok(LOOT[id], `unknown loot ${id}`);
        if (s.tier === 'room') continue;
        const det = detour(A, world.navIndex(s.x, s.y));
        const min = s.tier === 'secret' ? T.secretDetour : T.minDetour;
        assert.ok(det >= min, `seed ${seed}: ${s.tier} detour ${Math.round(det)} < ${min}`);
      }
      for (let i = 0; i < map.stashes.length; i++) {
        for (let j = i + 1; j < map.stashes.length; j++) {
          const a = map.stashes[i];
          const b = map.stashes[j];
          if (a.tier === 'room' || b.tier === 'room') continue;
          assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 600, `seed ${seed}: stashes too close`);
        }
      }
    }
  });

  test(`${name}: boarded rooms are shut until the boards break, with the good stash inside`, () => {
    let rooms = 0;
    for (const seed of SEEDS) {
      const map = addScavenging(gen(seed), seed);
      const shut = { ...map, obstacles: map.obstacles.map((o) => (o.boards ? { ...o, navOpen: false } : o)), sealed: [] };
      const sw = new World(shut);
      sw.flow.compute(map.start.x, map.start.y);
      const world = new World(map);
      world.flow.compute(map.start.x, map.start.y);
      for (const [k, room] of map.sealed.entries()) {
        rooms++;
        const stash = map.stashes.find((s) => s.tier === 'room' && s.room === k);
        assert.ok(stash && LOOT_TABLES && stash.loot.length === 3, `seed ${seed}: room stash`);
        assert.ok(map.obstacles.includes(room.boards) && room.boards.boards && room.boards.navOpen);
        assert.ok(!reach(sw, sw.flow, stash.x, stash.y), `seed ${seed}: room ${k} reachable with the boards up`);
        assert.ok(reach(world, world.flow, stash.x, stash.y), `seed ${seed}: room ${k} stash unreachable through the door`);
        assert.ok(reach(world, world.flow, room.outside.x, room.outside.y), `seed ${seed}: outside the door unreachable`);
        assert.ok(world.sealedAt(stash.x, stash.y), 'sealedAt sees the room');
        assert.ok(room.sleepers.length >= 2);
        for (const z of room.sleepers) assert.ok(world.sealedAt(z.x, z.y), 'sleepers start inside');
      }
    }
    assert.ok(rooms >= SEEDS.length, `only ${rooms} boarded rooms over ${SEEDS.length} maps`);
  });

  test(`${name}: every chalk arrow points toward a find`, () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const map = addScavenging(gen(seed), seed);
      // Judge arrows on paths a body can walk (as they were laid), boards down.
      const world = new World({ ...map, obstacles: map.obstacles.filter((o) => !o.boards), sealed: [] }, { strict: true });
      const fields = [];
      for (const s of map.stashes.filter((q) => q.tier === 'stash')) {
        const f = new FlowField(world);
        f.compute(s.x, s.y);
        fields.push({ sym: 'stash', f });
      }
      for (const r of map.sealed) {
        const f = new FlowField(world);
        f.compute(r.outside.x, r.outside.y);
        fields.push({ sym: 'room', f });
      }
      const marks = map.decor.filter((d) => d.type === 'chalk');
      assert.ok(marks.length > 0, `seed ${seed}: no chalk`);
      for (const m of marks) {
        const ok = fields.some(({ sym, f }) => {
          if (sym !== m.sym) return false;
          // Following the arrow gets you closer (probe twice: at a turn the first step can hug a wall).
          const here = f.pathDist(m.x, m.y);
          const there = Math.min(...[48, 96].map((k) => f.pathDist(m.x + Math.cos(m.a) * k, m.y + Math.sin(m.a) * k)));
          return Number.isFinite(here) && there < here;
        });
        assert.ok(ok, `seed ${seed}: arrow at ${Math.round(m.x)},${Math.round(m.y)} leads nowhere`);
      }
    }
  });
}
