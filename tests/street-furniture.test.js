// The streets' furniture (src/world/street-furniture.js): bare trees in planters along the curbs,
// pairs of newspaper boxes, bus shelters; placed last, on the sidewalks only, out of every doorway
// and find's way, facing the street; and drawn (the props' table in src/render/prop-art.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../src/world/map-gen.js';
import { addWorldFeatures } from '../src/world/features-gen.js';
import { addScavenging } from '../src/world/scavenge-gen.js';
import { World, FlowField } from '../src/world/world.js';
import { furnishStreets, TREE_PLANTER, NEWSBOX, SHELTER, NEWS_COLORS } from '../src/world/street-furniture.js';
import { rectsOverlap } from '../src/util.js';

globalThis.atob ??= (s) => Buffer.from(s, 'base64').toString('binary');
const { PROPS, propSize } = await import('../src/render/prop-art.js');
const { decodeMesh } = await import('../src/render/zombie-bake.js');

const SEEDS = [1337, 1, 7, 42];
const ALL = { holdout: true, routes: true, landmarks: true };
// As newRun has it: the map, its features, its finds, then the furniture.
const build = (seed) => {
  const map = addScavenging(addWorldFeatures(generateCity(seed), seed, ALL), seed, { stashes: true, rooms: true, secret: true });
  const before = map.obstacles.slice();
  const added = furnishStreets(map, seed);
  return { map, before, added };
};

test('on every city map: trees, newspaper boxes and bus shelters, the same for the same seed; none elsewhere', () => {
  for (const seed of SEEDS) {
    const { map, added } = build(seed);
    const n = (k) => added.filter((o) => o.kind === k).length;
    assert.ok(n('tree') > 60, `seed ${seed}: ${n('tree')} trees`);
    assert.ok(n('newsbox') > 10, `seed ${seed}: ${n('newsbox')} newspaper boxes`);
    assert.ok(n('shelter') > 4, `seed ${seed}: ${n('shelter')} shelters`);
    assert.ok(added.every((o) => map.obstacles.includes(o)));
    const again = build(seed).added.map((o) => [o.kind, o.x, o.y, o.w, o.h, o.heading, o.color]);
    assert.deepEqual(added.map((o) => [o.kind, o.x, o.y, o.w, o.h, o.heading, o.color]), again, 'seeded');
  }
  assert.deepEqual(furnishStreets({ theme: 'graveyard', blocks: [], obstacles: [] }, 1), [], 'only the streets');
});

test('each piece stands on a sidewalk, walked round (shots and sight pass), clear of everything there was', () => {
  for (const seed of SEEDS) {
    const { map, before, added } = build(seed);
    for (const o of added) {
      assert.ok(o.move && !o.shot && !o.sight, o.kind);
      // On a block's sidewalk ring: inside the block, not inside its inner part.
      const b = map.blocks.find((q) => rectsOverlap(q, o, -1));
      assert.ok(b, `${o.kind} at ${o.x},${o.y} on a block`);
      assert.ok(o.x >= b.x && o.y >= b.y && o.x + o.w <= b.x + b.w && o.y + o.h <= b.y + b.h, 'inside it');
      const I = b.inner;
      assert.ok(!(o.x >= I.x && o.y >= I.y && o.x + o.w <= I.x + I.w && o.y + o.h <= I.y + I.h), 'on its sidewalk');
      assert.ok(b.type !== 'start' && b.type !== 'end', 'not by the safe rooms');
      assert.ok(!before.some((q) => rectsOverlap(q, o, 3)), 'clear of what stood there');
      assert.ok(!map.intersections.some((it) => rectsOverlap(it, o, 30)), 'off the crossings');
      assert.ok(!map.lamps.some((l) => Math.abs(l.x - (o.x + o.w / 2)) < o.w / 2 + 20 && Math.abs(l.y - (o.y + o.h / 2)) < o.h / 2 + 20), 'off the lamps');
      for (const s of map.stashes) assert.ok(!rectsOverlap({ x: s.x, y: s.y, w: 0, h: 0 }, o, 35), 'away from the finds');
      for (const rm of map.sealed) assert.ok(!rectsOverlap(rm.boards || rm.door, o, 60), 'out of the boarded doorways');
      // Its size, and which way it faces: toward the street.
      const along = Math.abs(Math.cos(o.heading || 0)) < 0.5; // a sidewalk along x faces up or down the map
      if (o.kind === 'tree') assert.ok(o.bare && o.planter && o.w === TREE_PLANTER && o.h === TREE_PLANTER);
      else {
        const [a, c] = o.kind === 'shelter' ? SHELTER : NEWSBOX;
        assert.deepEqual(along ? [o.w, o.h] : [o.h, o.w], [a, c], `${o.kind}: ${o.w}x${o.h} facing ${o.heading}`);
        const mid = along ? o.y + o.h / 2 : o.x + o.w / 2;
        const curb = along ? (Math.sin(o.heading) < 0 ? b.y : b.y + b.h) : Math.cos(o.heading) < 0 ? b.x : b.x + b.w;
        assert.ok(Math.abs(mid - curb) <= 22, `${o.kind} faces the curb it is beside`);
      }
      if (o.kind === 'newsbox') assert.ok(NEWS_COLORS.includes(o.color));
    }
  }
});

test('nothing that matters is cut off: the safe room, the finds, the boarded rooms\' doors', () => {
  for (const seed of SEEDS) {
    const { map } = build(seed);
    // With the boards down (as the reachability test of the features has it).
    const w = new World({ ...map, obstacles: map.obstacles.filter((o) => !o.opens && !o.boards), sealed: [] }, { strict: true });
    const f = new FlowField(w);
    f.compute(map.start.x, map.start.y);
    const er = map.endRoom.interior;
    assert.ok(Number.isFinite(f.pathDist(er.x + er.w / 2, er.y + er.h / 2)), `seed ${seed}: the safe room`);
    for (const s of map.stashes) assert.ok(Number.isFinite(f.pathDist(s.x, s.y)), `seed ${seed}: ${s.tier} find`);
  }
});

test('the props as 3D models: car, newspaper box (its paint swapped per colour) and bus shelter', () => {
  assert.deepEqual(Object.keys(PROPS).sort(), ['car', 'newsbox', 'shelter']);
  assert.ok(PROPS.car.paint && PROPS.newsbox.paint && !PROPS.shelter.paint);
  for (const [name, p] of Object.entries(PROPS)) {
    const m = decodeMesh(p.mesh);
    for (const i of m.tri) assert.ok(i < m.n, name);
    assert.ok(p.mesh.box[0][2] >= 0, `${name} stands on the ground`);
    assert.ok(p.texture.endsWith('.webp'), name);
  }
  // Fitted to their footprints: a shelter faces across its length, a newspaper box is about as deep as it is wide.
  const [sl, sw] = propSize('shelter');
  assert.ok(sw > sl * 1.8, `shelter: ${sl.toFixed(1)} deep, ${sw.toFixed(1)} long`);
  const [nl, nw] = propSize('newsbox');
  assert.ok(nl > 6 && nl < 16 && nw > 6 && nw < 16, `newspaper box ${nl.toFixed(1)} x ${nw.toFixed(1)}`);
  const tall = (PROPS.newsbox.mesh.box[1][2] - PROPS.newsbox.mesh.box[0][2]) / 10;
  assert.ok(tall > 15 && tall < 32, `${tall} tall`);
});
