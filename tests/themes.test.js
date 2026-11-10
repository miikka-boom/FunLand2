// The three newer map types: the graveyard, suburbia and the junkyard.
// Every one must be seeded, connected (a body can walk from the start to the
// goal and to nearly everything else), keep its small props off the lanes,
// and take the same passes as the other maps (finds, flavour, Ben).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateGraveyard, EPITAPHS } from '../src/world/graveyard-gen.js';
import { generateSuburbia } from '../src/world/suburbia-gen.js';
import { generateJunkyard } from '../src/world/junkyard-gen.js';
import { KINDS } from '../src/world/gen-kit.js';
import { addScavenging } from '../src/world/scavenge-gen.js';
import { addLore } from '../src/world/lore-gen.js';
import { addBen } from '../src/world/ben-gen.js';
import { World, FlowField, NAV_CELL } from '../src/world/world.js';
import { SUBURBIA_GRAFFITI, GRAVEYARD_GRAFFITI, JUNKYARD_GRAFFITI, CITY_GRAFFITI, NOTES, VIGNETTES, POSTERS } from '../src/world/lore-content.js';
import { LEVELS, LEVEL_IDS } from '../src/settings.js';
import { GENERATORS } from '../src/game/game.js';
import { pointInRect, rectsOverlap } from '../src/util.js';

const INF = 0x3fffffff;
const SEEDS = [1337, 1, 7, 42, 99, 2020, 31337, 5];
const MAPS = {
  graveyard: { gen: generateGraveyard, lines: GRAVEYARD_GRAFFITI },
  suburbia: { gen: generateSuburbia, lines: SUBURBIA_GRAFFITI },
  junkyard: { gen: generateJunkyard, lines: JUNKYARD_GRAFFITI },
};

test('every map type has a generator, a title-card button and a line in the panel', () => {
  assert.deepEqual(Object.keys(GENERATORS).sort(), LEVEL_IDS.slice().sort());
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const buttons = [...html.matchAll(/data-level="([a-z]+)"><b>([^<]+)<\/b><span>([^<]+)<\/span>/g)].map((m) => ({ id: m[1], name: m[2], sub: m[3] }));
  assert.deepEqual(buttons, LEVELS.map((l) => ({ id: l.id, name: l.name, sub: l.sub })), 'index.html lists the map types exactly as settings.js names them');
});

for (const [name, { gen, lines }] of Object.entries(MAPS)) {
  test(`${name}: seeded (same seed, same map), and a different seed is a different place`, () => {
    const a = gen(1337);
    assert.equal(JSON.stringify(a), JSON.stringify(gen(1337)));
    assert.notEqual(JSON.stringify(gen(7).obstacles), JSON.stringify(a.obstacles));
    assert.equal(a.theme, name);
    for (const k of ['seed', 'w', 'h', 'obstacles', 'blocks', 'streets', 'intersections', 'markings', 'lamps', 'pickups', 'decor', 'fires', 'glows', 'start', 'startRoom', 'endRoom']) assert.ok(k in a, `map.${k}`);
    assert.equal(a.w % NAV_CELL, 0);
    assert.equal(a.h % NAV_CELL, 0);
  });

  test(`${name}: a body can walk from the start to the goal, and to (nearly) all the open ground`, () => {
    for (let s = 0; s < 24; s++) {
      const seed = s * 7919 + 3;
      const map = gen(seed);
      const world = new World(map, { strict: true });
      const f = new FlowField(world);
      f.compute(map.start.x, map.start.y);
      const er = map.endRoom.interior;
      const d = f.pathDist(er.x + er.w / 2, er.y + er.h / 2);
      assert.ok(Number.isFinite(d), `seed ${seed}: the goal can't be reached`);
      assert.ok(d > 3500, `seed ${seed}: the walk is a proper one (${Math.round(d)})`);
      let free = 0;
      let reach = 0;
      for (let i = 0; i < world.blocked.length; i++) {
        if (world.blocked[i]) continue;
        free++;
        if (f.dist[i] < INF) reach++;
      }
      assert.ok(reach / free > 0.985, `seed ${seed}: ${((100 * reach) / free).toFixed(1)}% of the open ground is reachable`);
      // You start in the first room, facing an open door.
      assert.ok(pointInRect(map.start.x, map.start.y, map.startRoom.interior));
      for (const room of [map.startRoom, map.endRoom]) {
        const dr = room.door;
        const out = dr.x > room.interior.x ? dr.x + dr.w + 40 : dr.x - 40;
        assert.ok(world.isFree(out, dr.y + dr.h / 2, 14), `seed ${seed}: something stands in a safe-room doorway`);
      }
    }
  });

  test(`${name}: everything is on the map, of a known kind, and nothing overlaps the safe rooms`, () => {
    for (const seed of SEEDS) {
      const map = gen(seed);
      for (const o of map.obstacles) {
        if (o.kind === 'border') continue;
        assert.ok(o.kind in KINDS, `seed ${seed}: unknown kind ${o.kind}`);
        assert.ok(o.w > 0 && o.h > 0 && o.x >= -1 && o.y >= -1 && o.x + o.w <= map.w + 1 && o.y + o.h <= map.h + 1, `seed ${seed}: ${o.kind} off the map (${o.x},${o.y} ${o.w}x${o.h})`);
        assert.equal(typeof o.move, 'boolean');
        if (o.safe) continue;
        for (const room of [map.startRoom, map.endRoom]) assert.ok(!rectsOverlap(o, room.interior), `seed ${seed}: ${o.kind} inside a safe room`);
      }
      for (const k of map.pickups) assert.ok(k.x > 0 && k.y > 0 && k.x < map.w && k.y < map.h);
      assert.ok(map.pickups.filter((k) => k.kind === 'medkit').length >= 8, `seed ${seed}: medkits along the way`);
      assert.ok(map.lamps.length >= 12, `seed ${seed}: some light`);
      assert.ok(map.obstacles.filter((o) => o.alarm).length >= 1, `seed ${seed}: at least one thing you shouldn't shoot`);
    }
  });

  test(`${name}: finds, flavour and Ben work here (stashes, a secret, its own graffiti, a den page, his bed)`, () => {
    const own = new Set(lines.map((g) => g.text));
    const town = new Set(CITY_GRAFFITI.map((g) => g.text));
    let rooms = 0;
    for (const seed of SEEDS) {
      const map = gen(seed);
      addScavenging(map, seed);
      addLore(map, seed);
      addBen(map, seed, { level: name });
      assert.ok(map.stashes.filter((s) => s.tier === 'stash').length >= 3, `seed ${seed}: supply stashes (${map.stashes.length})`);
      rooms += map.sealed.length;
      const g = map.decor.filter((d) => d.type === 'graffiti');
      assert.ok(g.filter((d) => own.has(d.text)).length >= 7, `seed ${seed}: the place's own graffiti (${g.filter((d) => own.has(d.text)).length})`);
      assert.ok(g.some((d) => town.has(d.text)), `seed ${seed}: a line or two from town as well`);
      assert.ok(g.some((d) => d.text === 'PIER 9'), `seed ${seed}: the way to Pier 9 is signposted`);
      assert.ok(map.posters.length >= 2, `seed ${seed}: notices on a wall somewhere (${map.posters.length})`);
      assert.ok(map.dens.length >= 1, `seed ${seed}: a den`);
      assert.ok(g.some((d) => d.page), `seed ${seed}: the den's page, written out`);
      assert.ok(map.ben && map.ben.nest, `seed ${seed}: his bed`);
      // After all that, the goal is still reachable.
      const world = new World(map);
      world.flow.compute(map.start.x, map.start.y);
      const er = map.endRoom.interior;
      assert.ok(Number.isFinite(world.flow.pathDist(er.x + er.w / 2, er.y + er.h / 2)), `seed ${seed}: still connected`);
      // Every find can be walked to.
      const strict = new World({ ...map, obstacles: map.obstacles.filter((o) => !o.boards), sealed: [] }, { strict: true });
      strict.flow.compute(map.start.x, map.start.y);
      for (const s of map.stashes) assert.ok(Number.isFinite(strict.flow.pathDist(s.x, s.y)), `seed ${seed}: a ${s.tier} nobody can reach`);
    }
    assert.ok(rooms >= SEEDS.length * 0.6, `boarded rooms turn up on most maps (${rooms} over ${SEEDS.length})`);
    assert.ok(NOTES[name] && NOTES[name].length >= 4 && VIGNETTES[name] && VIGNETTES[name].length >= 3, 'its own den pages and little scenes');
  });
}

test('graveyard: headstones sit one to a nav cell in rows (lanes stay open); they stop feet, not bullets or eyes', () => {
  for (const seed of SEEDS) {
    const map = generateGraveyard(seed);
    const graves = map.obstacles.filter((o) => o.kind === 'grave');
    assert.ok(graves.length >= 500, `seed ${seed}: ${graves.length} headstones`);
    assert.equal(graves.length, map.graves);
    const cells = new Set();
    for (const g of graves) {
      assert.equal(g.move, true);
      assert.equal(g.shot, false);
      assert.equal(g.sight, false);
      const cx = Math.floor(g.x / NAV_CELL);
      const cy = Math.floor(g.y / NAV_CELL);
      assert.equal(Math.floor((g.x + g.w - 0.001) / NAV_CELL), cx, `seed ${seed}: a stone straddles two cells across`);
      assert.equal(Math.floor((g.y + g.h - 0.001) / NAV_CELL), cy, `seed ${seed}: a stone straddles two cells down`);
      assert.ok(!cells.has(`${cx},${cy}`), 'two stones in one cell');
      cells.add(`${cx},${cy}`);
      // The cells either side along its row are never both stones (you can always step between).
      assert.ok(!(cells.has(`${cx - 1},${cy}`) || cells.has(`${cx + 1},${cy}`)), `seed ${seed}: stones shoulder to shoulder`);
    }
    // The set pieces: the chapel and its tower, a pond, the memorial, niche walls, mausoleums, lanterns.
    assert.equal(map.obstacles.filter((o) => o.chapel).length, 1);
    assert.equal(map.obstacles.filter((o) => o.steeple).length, 1);
    assert.equal(map.ponds.length, 1);
    assert.ok(map.obstacles.some((o) => o.kind === 'obelisk' && o.war));
    assert.ok(map.obstacles.filter((o) => o.kind === 'niche').length >= 4);
    assert.ok(map.obstacles.filter((o) => o.kind === 'mausoleum').length >= 6);
    assert.ok(map.lamps.filter((l) => l.style === 'lantern').length >= 20);
    assert.ok(map.darknessBoost > 0, 'darker than town');
    // The pond is water you walk round: flat, and in the middle of its section.
    for (const p of map.obstacles.filter((o) => o.kind === 'pond')) assert.ok(p.flat && p.move && !p.shot);
    // A few ledgers to read, all different.
    const ep = map.decor.filter((d) => d.type === 'epitaph');
    assert.ok(ep.length >= 5 && new Set(ep.map((d) => d.text)).size === ep.length);
    for (const d of ep) assert.ok(EPITAPHS.includes(d.text));
  }
});

test('suburbia: houses with fenced backyards you can cut through; a park, a strip mall, a school', () => {
  for (const seed of SEEDS) {
    const map = generateSuburbia(seed);
    const houses = map.obstacles.filter((o) => o.house);
    assert.ok(houses.length >= 40 && houses.length === map.houses, `seed ${seed}: ${houses.length} houses`);
    for (const h of houses) {
      assert.ok(h.facing === 'n' || h.facing === 's');
      assert.ok(h.pitched && h.nocarve && h.siding && h.color);
    }
    assert.equal(map.lots.length, houses.length);
    for (const type of ['park', 'mall', 'school', 'start', 'end']) assert.equal(map.blocks.filter((b) => b.type === type).length, 1, `seed ${seed}: one ${type} block`);
    assert.equal(map.obstacles.filter((o) => o.mall).length, 1);
    assert.ok(map.obstacles.some((o) => o.bus), 'a school bus');
    assert.ok(map.obstacles.some((o) => o.icecream && o.alarm), 'the ice-cream truck is an alarm');
    assert.ok(map.fields.length === 1 && map.pools.length >= 1);
    assert.ok(map.lamps.filter((l) => l.style === 'porch').length >= 8, 'porch lights');
    // Fences: thin, see-through, never across a street; a good number have a gate.
    const fences = map.obstacles.filter((o) => o.kind === 'fence');
    assert.ok(fences.length >= 100);
    for (const f of fences) {
      assert.ok(Math.min(f.w, f.h) <= 6 && !f.sight && !f.shot);
      assert.ok(!map.streets.some((s) => rectsOverlap(s, f, -2)), `seed ${seed}: a fence in the road`);
    }
    // Backyards are part of the map you can use: every lot's back half is reachable.
    const world = new World(map, { strict: true });
    world.flow.compute(map.start.x, map.start.y);
    let open = 0;
    for (const l of map.lots) {
      let ok = false;
      for (let y = l.y + 40; y < l.y + l.h - 30 && !ok; y += 32) {
        for (let x = l.x + 30; x < l.x + l.w - 30 && !ok; x += 32) {
          const i = world.navIndex(x, y);
          if (!world.blocked[i] && world.flow.dist[i] < INF) ok = true;
        }
      }
      if (ok) open++;
    }
    assert.equal(open, map.lots.length, `seed ${seed}: every lot can be walked into`);
  }
});

test('junkyard: a lane between every stack, the crusher clearing in the middle, the crane over it', () => {
  for (const seed of SEEDS) {
    const map = generateJunkyard(seed);
    assert.ok(map.stacks >= 18 && map.obstacles.filter((o) => o.kind === 'wrecks').length === map.stacks, `seed ${seed}: ${map.stacks} stacks of wrecks`);
    for (const o of map.obstacles.filter((q) => q.kind === 'wrecks')) {
      assert.ok(o.sight && o.shot && o.layers >= 2 && o.layers <= 4);
      assert.ok(o.w === (o.vert ? o.across * 48 : o.along * 94) && o.h === (o.vert ? o.along * 94 : o.across * 48));
    }
    for (const kind of ['scrap', 'tires', 'appliances']) assert.ok(map.obstacles.some((o) => o.kind === kind), `seed ${seed}: ${kind}`);
    const C = map.clearing;
    const crusher = map.obstacles.find((o) => o.kind === 'crusher');
    const base = map.obstacles.find((o) => o.kind === 'cranebase');
    assert.ok(crusher && rectsOverlap(crusher, C) && base && rectsOverlap(base, C));
    assert.ok(Math.hypot(map.crane.bx - (crusher.x + crusher.w / 2), map.crane.by - (crusher.y + crusher.h / 2)) < 80, 'the boom ends over the crusher');
    assert.ok(!map.obstacles.some((o) => o.kind === 'wrecks' && rectsOverlap(o, C)), 'no stacks in the clearing');
    assert.ok(map.lamps.filter((l) => l.tower).length >= 2, 'floodlights');
    assert.ok(map.fires.length >= 1);
    // No lane is closed: nothing solid lies across the middle line of one
    // (in the clearing the lanes open into one floor, with the machines in it).
    const solid = map.obstacles.filter((o) => o.move && o.kind !== 'border' && !rectsOverlap(o, C));
    for (const l of map.lanes) {
      const mid = l.dir === 'v' ? { x: l.x + l.w / 2 - 14, y: l.y + 40, w: 28, h: l.h - 80 } : { x: l.x + 40, y: l.y + l.h / 2 - 14, w: l.w - 80, h: 28 };
      const across = solid.filter((o) => rectsOverlap(o, mid) && (l.dir === 'v' ? o.x <= l.x + 20 && o.x + o.w >= l.x + l.w - 20 : o.y <= l.y + 20 && o.y + o.h >= l.y + l.h - 20));
      assert.equal(across.length, 0, `seed ${seed}: something blocks a lane from side to side`);
    }
  }
});

test('the setting is Philadelphia, 2020: the notices and the walls say so (and nothing says Halvard any more)', () => {
  const all = JSON.stringify({ CITY_GRAFFITI, SUBURBIA_GRAFFITI, GRAVEYARD_GRAFFITI, JUNKYARD_GRAFFITI, NOTES, VIGNETTES, POSTERS });
  assert.ok(!/halvard|harbor radio/i.test(all));
  for (const word of ['PHILADELPHIA', 'PHILLY', 'DELAWARE', 'BROAD ST', '2020', 'LIBERTY BELLE', 'DELCO', 'SCHUYLKILL']) assert.ok(all.toUpperCase().includes(word), word);
  assert.ok(POSTERS.indoors.sub.includes('City of Philadelphia'));
  // The year's own notices are posters now.
  for (const id of ['mask', 'sixfeet', 'broadrun']) assert.ok(POSTERS[id] && POSTERS[id].city, id);
});

test('writing on the ground never runs into other writing (every map type)', () => {
  // The box a line takes, turned as it is drawn.
  const boxOf = (d) => {
    const size = d.size || 14;
    const w = d.type === 'epitaph' ? d.w : d.text.length * size * 0.6;
    const h = d.type === 'epitaph' ? 22 : size;
    const c = Math.abs(Math.cos(d.a || 0));
    const s = Math.abs(Math.sin(d.a || 0));
    const hw = (w * c + h * s) / 2;
    const hh = (w * s + h * c) / 2;
    return { x0: d.x - hw, y0: d.y - hh, x1: d.x + hw, y1: d.y + hh };
  };
  for (const [level, gen] of Object.entries(GENERATORS)) {
    for (const seed of [1337, 3, 7922, 23760, 79193, 95031]) {
      const map = gen(seed);
      addScavenging(map, seed);
      addLore(map, seed);
      addBen(map, seed, { level });
      // The safe rooms' walls are laid out by hand (and tested with the lore): leave them out.
      const T = map.decor.filter((d) => d.text && ['graffiti', 'paint', 'epitaph', 'chalkart'].includes(d.type) && !pointInRect(d.x, d.y, map.startRoom.outer, 10) && !pointInRect(d.x, d.y, map.endRoom.outer, 10));
      assert.ok(T.length >= 20, `${level} ${seed}: ${T.length} lines to read`);
      for (let i = 0; i < T.length; i++) {
        for (let j = i + 1; j < T.length; j++) {
          // A reply written right under its line is meant to sit that close.
          if (Math.abs(T[i].x - T[j].x) <= 21 && Math.abs(T[i].y - T[j].y) < 50) continue;
          const a = boxOf(T[i]);
          const b = boxOf(T[j]);
          assert.ok(!(a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0), `${level} ${seed}: "${T[i].text}" runs into "${T[j].text}"`);
        }
      }
    }
  }
});
