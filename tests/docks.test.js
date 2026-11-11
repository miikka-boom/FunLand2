import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDocks, QUAY_X } from '../src/world/docks-gen.js';
import { addScavenging } from '../src/world/scavenge-gen.js';
import { addLore } from '../src/world/lore-gen.js';
import { World, FlowField } from '../src/world/world.js';
import { initFinale, updateFinale, finaleOpen, finaleLights, FERRY } from '../src/game/finale.js';
import { DOCKS_GRAFFITI, NOTES, SAFE_ROOM } from '../src/world/lore-content.js';
import { pointInRect, rectsOverlap } from '../src/util.js';

const SEEDS = [1337, 1, 7, 42, 99, 2024, 31337, 5];

test('docks: seeded (same seed, same harbour)', () => {
  const a = generateDocks(1337);
  const b = generateDocks(1337);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.notEqual(JSON.stringify(generateDocks(7).obstacles), JSON.stringify(a.obstacles));
  assert.equal(a.theme, 'docks');
});

test('docks: start -> gangway, the flare post and every pier end are reachable by a body', () => {
  for (let s = 0; s < 30; s++) {
    const seed = s * 7919 + 3;
    const map = generateDocks(seed);
    const world = new World(map, { strict: true });
    const f = new FlowField(world);
    const er = map.endRoom.interior;
    f.compute(er.x + er.w / 2, er.y + er.h / 2);
    assert.ok(Number.isFinite(f.pathDist(map.start.x, map.start.y)), `seed ${seed}: start can't reach the gangway`);
    assert.ok(Number.isFinite(f.pathDist(map.finale.use.x, map.finale.use.y)), `seed ${seed}: flare post`);
    for (const p of map.piers) assert.ok(Number.isFinite(f.pathDist(p.x + p.w - 60, p.y + p.h / 2)), `seed ${seed}: pier ${p.name}`);
  }
});

test('docks: water stops feet, not bullets or eyes; Pier 9 is the long one at the top', () => {
  const map = generateDocks(1337);
  const water = map.obstacles.filter((o) => o.kind === 'water');
  assert.ok(water.length >= 5);
  for (const w of water) {
    assert.equal(w.move, true);
    assert.equal(w.shot, false);
    assert.equal(w.sight, false);
    assert.ok(w.x >= QUAY_X);
    for (const p of map.piers) assert.ok(!rectsOverlap(w, p), 'water over a pier');
  }
  const p9 = map.piers.find((p) => p.main);
  assert.equal(p9.name, '9');
  assert.ok(map.piers.every((p) => p === p9 || (p.w < p9.w && p.y > p9.y)));
  // The ferry berths in the water alongside Pier 9, the boarding spot is on the pier.
  const F = map.finale;
  assert.ok(F.ship.y + F.ship.h <= p9.y && F.ship.x + F.ship.w <= p9.x + p9.w);
  assert.ok(pointInRect(F.board.x + F.board.w / 2, F.board.y + F.board.h / 2, p9));
});

test('docks: the gangway foot and the flare post stay clear', () => {
  for (const seed of SEEDS) {
    const map = generateDocks(seed);
    const F = map.finale;
    const solid = map.obstacles.filter((o) => o.move && o.kind !== 'water' && o.kind !== 'flarepost' && o.kind !== 'border');
    assert.ok(!solid.some((o) => rectsOverlap(o, F.board, 10)), `seed ${seed}: something on the gangway foot`);
    const world = new World(map);
    assert.ok(world.isFree(F.use.x, F.use.y, 14), `seed ${seed}: can't stand at the flare post`);
  }
});

test('docks: finds and flavour work there too (stashes, boarded rooms, harbour graffiti, a log page)', () => {
  const docksLines = new Set(DOCKS_GRAFFITI.map((g) => g.text));
  for (const seed of SEEDS.slice(0, 4)) {
    const map = generateDocks(seed);
    addScavenging(map, seed, {});
    assert.ok(map.stashes.filter((s) => s.tier === 'stash').length >= 3, `seed ${seed}: stashes`);
    assert.ok(map.stashes.some((s) => s.tier === 'secret'), `seed ${seed}: secret`);
    addLore(map, seed);
    const g = map.decor.filter((d) => d.type === 'graffiti');
    assert.ok(g.filter((d) => docksLines.has(d.text)).length >= 8, `seed ${seed}: harbour graffiti`);
    // The end of Pier 9 has its own painted lines (no safe-room wall there).
    for (const it of SAFE_ROOM.docks) assert.ok(g.some((d) => d.text === it.text), `seed ${seed}: ${it.text}`);
    assert.ok(!g.some((d) => SAFE_ROOM.end.some((e) => e.text && e.text === d.text)), 'safe-room lines on a pier');
    const W = new World(map);
    for (const d of g) assert.ok(!map.water.some((w) => pointInRect(d.x, d.y, w)), `seed ${seed}: graffiti in the water: ${d.text}`);
    assert.ok(g.length > 15, 'plenty to read, all of it painted');
    assert.equal(map.readables, undefined);
    void W;
  }
  assert.ok(NOTES.docks.length >= 4);
});

// --- The finale state machine (stub game) ---------------------------------------------------

function stubGame(map, ferryTime = 30) {
  const said = [];
  const game = {
    settings: { ferryTime, hordeSize: 1 },
    player: { x: map.start.x, y: map.start.y, alive: true, pinnedBy: null },
    won: false,
    stats: { hordes: 0, time: 0 },
    director: { phase: 'build', mobT: 0, trickleT: 0, tankEngaged: false, queued: 0, queueHorde(n) { this.queued += n; return { x: 0, y: 0 }; } },
    audio: { flare() {}, ferryHorn() {}, horde() {}, gateOpen() {} },
    effects: { light() {} },
    announce: (t) => said.push(t),
    noise() {},
    addTrauma() {},
    haptic() {},
    world: { map },
  };
  return { game, said };
}

test('finale: fire the flare, hold out, the ferry docks, then (and only then) the gangway counts', () => {
  const map = generateDocks(1337);
  const { game, said } = stubGame(map, 60);
  const F = initFinale(game, map);
  assert.equal(F.state, 'idle');
  assert.equal(finaleOpen(F), false);
  const step = (sec) => { for (let t = 0; t < sec; t += 1 / 30) updateFinale(game, F, 1 / 30); };
  // Walking up: the call-out, but nothing fires until you stand at the post.
  game.player.x = F.flare.x - 500;
  game.player.y = F.flare.y;
  step(1);
  assert.equal(F.state, 'idle');
  assert.ok(said.includes('THE LAST FERRY STOPS HERE'));
  game.player.x = F.use.x;
  game.player.y = F.use.y;
  step(FERRY.hold + 0.1);
  assert.equal(F.state, 'called');
  assert.equal(F.dur, 60);
  assert.ok(game.director.mobT >= 60, 'the director holds its own mobs');
  // Waves come down the pier while the clock runs; the ship sails in near the end.
  step(10);
  assert.ok(F.waves >= 1 && game.director.queued > 0);
  assert.equal(F.shipX, F.startX, 'still out at sea');
  step(30);
  assert.ok(F.shipX < F.startX && F.shipX > F.ship.x, 'sailing in');
  assert.equal(finaleOpen(F), false);
  step(21);
  assert.equal(F.state, 'docked');
  assert.equal(F.shipX, F.ship.x, 'alongside');
  step(FERRY.gangway);
  assert.equal(finaleOpen(F), true);
  assert.ok(said.includes('ALL ABOARD!'));
});

test('finale: the flare and the ferry light the night (and the flare burns out)', () => {
  const map = generateDocks(1337);
  const { game } = stubGame(map, 40);
  const F = initFinale(game, map);
  assert.deepEqual(finaleLights(F, 0), []);
  game.player.x = F.use.x;
  game.player.y = F.use.y;
  for (let t = 0; t < 2; t += 1 / 30) updateFinale(game, F, 1 / 30);
  const L = finaleLights(F, 1);
  assert.ok(L.some((l) => l.red && l.burn > 0), 'the flare');
  for (let t = 0; t < 40; t += 1 / 30) updateFinale(game, F, 1 / 30);
  const L2 = finaleLights(F, 1);
  assert.ok(!L2.some((l) => l.red), 'burnt out');
  assert.ok(L2.some((l) => l.cone !== undefined), 'the searchlight');
});
