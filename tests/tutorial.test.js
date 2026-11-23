// The tutorial: the hand-built course (one walk, gates that only open when a
// lesson is done, nowhere to get stuck), the lessons at run time (in order,
// holding back what they teach later, nobody dies), what the director leaves
// alone, the coaching on screen, the report, and a bot that plays it start to
// finish through the real game loop.
// (node --test runs each file in its own process, so the fake DOM globals and
// the seeded Math.random stay here.)
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
let bad = null;
const COORD = new Set(['moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'fillRect', 'strokeRect', 'fillText', 'arcTo']);
const texts = [];
function mockCtx() {
  const t = { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', lineCap: 'butt', textAlign: 'left', textBaseline: 'top' };
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 7 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      return (...a) => {
        if (k === 'fillText') texts.push(String(a[0]));
        if (!bad && COORD.has(k)) for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) bad = `${k}(${a.join(', ')})`;
      };
    },
    set(o, k, v) {
      o[k] = v;
      return true;
    },
  });
}
globalThis.document = { createElement: () => ({ width: 300, height: 150, style: {}, getContext: () => mockCtx() }) };
globalThis.window = { devicePixelRatio: 2 };

const { mulberry32, pointInRect, rectsOverlap } = await import('../src/util.js');
Math.random = mulberry32(20201122); // the zombies' wandering and aim spread: the same every run of this file

const { Game, GENERATORS } = await import('../src/game/game.js');
const { DEFAULTS, LEVELS } = await import('../src/settings.js');
const { generateTutorial, TUT_W, TUT_H, TUTORIAL_WALLS } = await import('../src/world/tutorial-gen.js');
const { STEPS, LESSONS, stepText, tutorialDone, saveTutorialDone } = await import('../src/game/tutorial.js');
const { World, FlowField, NAV_CELL } = await import('../src/world/world.js');
const { startle, seatWitchNear } = await import('../src/game/witch.js');
const { startReload, swapWeapon } = await import('../src/game/player.js');
const { hasModel } = await import('../src/render/models.js');
const { computeLayout } = await import('../src/layout.js');
const { drawTutorialHud, drawTutorialBright, cardRect, cardText } = await import('../src/render/tutorial-render.js');
const { buildReport, reportText } = await import('../src/playtest.js');

const INF = 0x3fffffff;
const audio = new Proxy({ listener: { x: 0, y: 0 } }, { get: (o, k) => (k in o ? o[k] : () => {}) });

function make(over = {}) {
  const game = new Game({ ...DEFAULTS, level: 'tutorial', playtestPrompt: false, ...over }, audio, () => {});
  game.setViewport(844, 390);
  return game;
}
const idle = (events = []) => ({ source: 'gamepad', move: { x: 0, y: 0 }, aimActive: false, aimX: 1, aimY: 0, aimRaw: 0, aimScreen: null, fire: false, assist: true, events });
const run = (game, secs, f = idle) => {
  for (let i = 0; i < Math.round(secs * 60); i++) game.update(1 / 60, typeof f === 'function' ? f() : f);
};
/** Skip ahead to a lesson by doing each one's job by hand (teleports, kills). */
function skipTo(game, id) {
  const T = game.tutorial;
  const p = game.player;
  for (let guard = 0; T.step.id !== id && guard < 40; guard++) {
    const s = T.step.id;
    if (T.pause > 0) {
      run(game, T.pause + 0.05);
      continue;
    }
    const kill = (list) => {
      run(game, 2); // let whatever is queued turn up
      for (const z of list) z.alive = false;
    };
    if (s === 'move') Object.assign(p, { x: T.L.moveRing.x, y: T.L.moveRing.y });
    else if (s === 'aim' || s === 'fire') kill(T.pen);
    else if (s === 'gate1' || s === 'gate2') {
      run(game, 1.3); // the bars slide away
      const G = T.L.gates[s === 'gate1' ? 'g1' : 'g2'];
      Object.assign(p, { x: G.x, y: G.y - 80 });
    } else if (s === 'shove') game.stats.shoveHits += 3;
    else if (s === 'reload') {
      game.update(1 / 60, idle(['reload']));
      kill(T.group.concat(T.extra));
    } else if (s === 'kite' || s === 'alarm') kill(T.group.concat(T.extra));
    run(game, 1 / 30);
  }
  assert.equal(T.step.id, id);
}

// --- The course ---------------------------------------------------------------------------

test('a level of its own: first on the title card and in the panel, hand-built, the same on every seed', () => {
  assert.equal(LEVELS[0].id, 'tutorial');
  assert.equal(GENERATORS.tutorial, generateTutorial);
  const a = generateTutorial(1);
  const b = generateTutorial(987654);
  assert.equal(JSON.stringify({ ...a, seed: 0 }), JSON.stringify({ ...b, seed: 0 }), 'every player gets the same course');
  assert.equal(a.seed, 1, 'the seed is kept for the report');
  assert.ok(a.tutorial && !a.theme, 'the streets look, with a script');
  assert.equal(a.w, TUT_W);
  assert.equal(a.h, TUT_H);
  assert.equal(a.w % NAV_CELL, 0);
  assert.equal(a.h % NAV_CELL, 0);
  // Generating it twice doesn't move anything twice (the map is moved into its frame on a copy of the plan).
  assert.deepEqual(generateTutorial(1).streets, a.streets);
  for (const o of a.obstacles) {
    if (o.kind === 'border') continue;
    assert.ok(hasModel(o.kind), `${o.kind} has a model`);
    assert.ok(o.x >= 0 && o.y >= 0 && o.x + o.w <= a.w && o.y + o.h <= a.h, `${o.kind} at ${o.x},${o.y} is on the map`);
  }
});

/** The course as a body walks it: gates shut (their bars block), or counted open. */
function walker(map, gatesOpen) {
  const obstacles = map.obstacles.filter((o) => !(gatesOpen && o.opens)).map((o) => (o.opens ? { ...o, navOpen: false } : o));
  const world = new World({ ...map, obstacles, sealed: [] }, { strict: true });
  const f = new FlowField(world);
  f.compute(map.start.x, map.start.y);
  return { world, f };
}

test('one short walk: from the start room past every lesson to the safe room, through the gates and only through them', () => {
  const map = generateTutorial(1);
  const T = map.tutorial;
  const er = map.endRoom.interior;
  const goal = { x: er.x + er.w / 2, y: er.y + er.h / 2 };
  const open = walker(map, true);
  const d = open.f.pathDist(goal.x, goal.y);
  assert.ok(Number.isFinite(d) && d > 3000 && d < 4200, `the walk is ${Math.round(d)} u (about twenty seconds at a run)`);
  const spots = { moveRing: T.moveRing, shove: T.shoveSpawn, ...Object.fromEntries([...T.packSpawns.flat(), ...T.alarmSpawns, ...T.panicSpawns, ...T.rushSpawns.flat()].map((q, i) => [`spawn${i}`, q])) };
  for (const [name, q] of Object.entries(spots)) assert.ok(Number.isFinite(open.f.pathDist(q.x, q.y)), `${name} can be walked to`);
  // Everything a body can stand on is part of the walk, except the pen (that's the point of it).
  let pocket = 0;
  const c = { x: 0, y: 0 };
  for (let i = 0; i < open.world.blocked.length; i++) {
    if (open.world.blocked[i] || open.f.dist[i] < INF) continue;
    open.world.cellCenter(i, c);
    if (!pointInRect(c.x, c.y, T.pen)) pocket++;
  }
  assert.equal(pocket, 0, 'nowhere to get stuck');
  // With the gates shut you get no further than the first one.
  const shut = walker(map, false);
  assert.ok(Number.isFinite(shut.f.pathDist(T.moveRing.x, T.moveRing.y)));
  for (const q of [T.shoveSpawn, T.packSpawns[0][0], T.rushSpawns[0][0], T.alarmSpawns[0], goal]) assert.equal(shut.f.pathDist(q.x, q.y), Infinity, 'a shut gate is shut');
  // The pack comes down row 2 from the far end (short of gate 2), or else up through gate 1; the rush comes up through gate 2.
  const [ahead, behind] = T.packSpawns;
  for (const q of ahead) assert.ok(q.y > T.gates.g2.y && q.y < T.gates.g1.y, 'the pack: row 2, from the far end');
  for (const q of behind) assert.ok(q.y > T.gates.g1.y, 'or up through gate 1');
  for (const q of T.rushSpawns.flat()) assert.ok(q.y > T.gates.g2.y && q.y < T.gates.g1.y, 'the rush comes up through gate 2');
  // Gates are bars in a wall that runs east-west (the camera sees them face on), each with a wall either side.
  for (const G of Object.values(T.gates)) {
    assert.ok(G.bars.w > G.bars.h * 5 && G.bars.navOpen && G.bars.opens && !G.bars.shot);
    assert.equal(G.walls.length, 2);
    for (const w of G.walls) assert.ok(w.kind === 'qwall' && w.move && w.shot && w.h === 16);
  }
});

test('buildings: no slivers, nothing standing on the walk, and the town goes on past the edge of the screen', () => {
  const map = generateTutorial(1);
  const buildings = map.obstacles.filter((o) => o.kind === 'building');
  assert.ok(buildings.length > 80);
  for (const b of buildings) assert.ok(Math.min(b.w, b.h) >= 40, `a ${b.w} x ${b.h} building`);
  // Buildings only touch, never overlap.
  for (let i = 0; i < buildings.length; i++) for (let j = i + 1; j < buildings.length; j++) assert.ok(!rectsOverlap(buildings[i], buildings[j], -0.5), 'two buildings in one place');
  // The walk is at least half a phone screen (wide) from the edge of the map, so the camera never shows the void.
  const { world, f } = walker(map, true);
  const c = { x: 0, y: 0 };
  let minX = Infinity;
  let minY = Infinity;
  for (let i = 0; i < world.blocked.length; i++) {
    if (f.dist[i] >= INF) continue;
    world.cellCenter(i, c);
    minX = Math.min(minX, c.x, map.w - c.x);
    minY = Math.min(minY, c.y, map.h - c.y);
  }
  assert.ok(minX > 470 * (844 / 390) / 2 - 20, `${Math.round(minX)} u from the side of the map`);
  assert.ok(minY > 470 / 2 + 20, `${Math.round(minY)} u from the top or bottom`);
});

test('the pen: six of them behind a fence they can neither cross nor reach through, in your line of fire from the ring', () => {
  const map = generateTutorial(1);
  const T = map.tutorial;
  assert.equal(T.penZombies.length, 6);
  assert.match(stepText(STEPS.find((q) => q.id === 'fire'), 'touch'), /all six/, 'the card counts them right');
  for (const q of T.penZombies) assert.ok(pointInRect(q.x, q.y, T.pen));
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) assert.ok(Math.hypot(T.penZombies[i].x - T.penZombies[j].x, T.penZombies[i].y - T.penZombies[j].y) > 40, 'room to stand');
  const fence = T.fence;
  assert.ok(fence.kind === 'fence' && fence.move && !fence.shot && !fence.sight, 'you see and shoot through it');
  // A zombie pressed on the inside and you on the outside are further apart than its reach (r + r + 8).
  assert.ok(fence.h + 12 + 12 > 12 + 12 + 8, 'thick enough');
  // Shut in: from inside the pen there's no way out.
  const world = new World({ ...map, obstacles: map.obstacles.filter((o) => !o.opens), sealed: [] }, { strict: true });
  const f = new FlowField(world);
  f.compute(T.penZombies[0].x, T.penZombies[0].y);
  assert.equal(f.pathDist(map.start.x, map.start.y), Infinity);
  // From the ring, every spot along the inside of the fence is a clear shot.
  for (let x = T.pen.x + 24; x < T.pen.x + T.pen.w - 24; x += 24) {
    assert.ok(world.segmentClear(T.moveRing.x, T.moveRing.y, x, fence.y - 13, world.shotBlockers), `no clear shot at ${x}`);
  }
  assert.ok(Math.hypot(T.moveRing.x - (T.pen.x + T.pen.w / 2), T.moveRing.y - fence.y) < 260, 'the ring is right in front of it');
});

test('what a first run leaves out: no Witch (and nobody writes about her), one gun, nothing to search, one thing not to shoot', () => {
  const map = generateTutorial(1);
  assert.deepEqual(map.witches, []);
  assert.deepEqual(map.stashes, [], 'searching crates comes later');
  assert.ok(!map.decor.some((d) => /CRYING|HER\b|WITCH/i.test(d.text || '')), 'no warnings about someone who is not there');
  assert.equal(map.obstacles.filter((o) => o.alarm).length, 1, 'one thing not to shoot');
  assert.ok(!STEPS.some((q) => /swap|witch/i.test(q.id + q.title + stepText(q, 'touch'))), 'no lesson about guns to swap or a Witch');
  // In the run, whatever the panel says: no Witch, and the gun panel never swaps.
  const game = make({ witch: true });
  assert.equal(game.witches.length, 0);
  const p = game.player;
  for (const s of STEPS) {
    skipTo(game, s.id);
    game.update(1 / 60, idle(['swap']));
    assert.equal(p.wi, 0, `${s.id}: still the SMG`);
    assert.equal(game.locks.swap, true);
  }
});

test("the squad's writing: on open ground, readable, and no line runs into another", () => {
  const map = generateTutorial(1);
  const buildings = map.obstacles.filter((o) => o.kind === 'building');
  const lines = map.decor.filter((d) => d.text && (d.type === 'graffiti' || d.type === 'spray' || d.type === 'bentext'));
  assert.equal(lines.filter((d) => d.type === 'graffiti').length, TUTORIAL_WALLS.length);
  assert.ok(lines.some((d) => d.type === 'bentext'), 'one line in orange crayon');
  for (const d of lines) {
    assert.ok(!buildings.some((b) => pointInRect(d.x, d.y, b)), `"${d.text}" is under a building`);
    if (d.size) assert.ok(d.size >= 10, `"${d.text}" is readable`);
  }
  const box = (d) => {
    const size = d.size || 18 * (d.s || 1);
    const hw = (d.text.length * size * 0.6) / 2;
    return { x: d.x - hw, y: d.y - size / 2, w: hw * 2, h: size };
  };
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) assert.ok(!rectsOverlap(box(lines[i]), box(lines[j])), `"${lines[i].text}" runs into "${lines[j].text}"`);
});

// --- At run time ---------------------------------------------------------------------------

test('a run: the lessons in order, the pen filled, the gates shut, no teammate, and the director stands back', () => {
  const game = make({ ally: true, specials: true, nightTerror: true, wanderers: 10, hordeSize: 10 });
  const T = game.tutorial;
  assert.ok(T);
  assert.equal(T.step.id, 'move');
  assert.equal(game.ally, null, 'the tutorial is yours alone');
  assert.ok(game.director.scripted);
  assert.equal(T.pen.length, 6);
  assert.ok(T.pen.every((z) => z.state === 'idle'));
  assert.equal(game.zombies.filter((z) => z.type === 'common').length, 6, 'no wanderers');
  for (const G of Object.values(T.gates)) assert.ok(game.world.moveBlockers.includes(G.bars), 'shut');
  assert.equal(game.dailyKey, null);
  assert.equal(game.player.facing, 0, 'looking out of the door, down the first street');
  // Out of the start room, a minute of nothing: no mob, no Hunter, no Tank, no Night Terror.
  Object.assign(game.player, { x: T.L.moveRing.x - 200, y: T.L.moveRing.y });
  run(game, 60);
  assert.equal(game.zombies.length, 6);
  assert.equal(game.stats.hordes, 0);
  assert.equal(T.step.id, 'move');
});

test('every lesson can be done (by hand), in order, and the safe room ends it: done is remembered', () => {
  store.clear();
  assert.equal(tutorialDone(), false);
  const game = make();
  const T = game.tutorial;
  const seen = [];
  for (const s of STEPS) {
    skipTo(game, s.id);
    seen.push(T.step.id);
  }
  assert.deepEqual(seen, STEPS.map((s) => s.id));
  // In the safe room.
  const er = game.world.map.endRoom.interior;
  run(game, 1.3);
  Object.assign(game.player, { x: er.x + er.w / 2, y: er.y + er.h / 2 });
  run(game, 0.2);
  assert.equal(game.won, true);
  assert.equal(T.over || T.pause > 0, true);
  run(game, 1);
  assert.equal(T.over, true);
  assert.equal(T.lessonsDone, LESSONS);
  assert.equal(tutorialDone(), true);
  for (const G of Object.values(T.gates)) assert.equal(G.state, 'open');
});

test('what a lesson holds back: no reload while you learn to shove, then reload and finish them off', () => {
  const game = make();
  const T = game.tutorial;
  const p = game.player;
  skipTo(game, 'shove');
  run(game, 0.1);
  assert.equal(p.weapon.def.id, 'smg');
  assert.equal(p.weapon.mag, 0, 'click: empty');
  startReload(game, p);
  assert.equal(p.weapon.reloading, false, 'no reloading yet');
  skipTo(game, 'reload');
  assert.equal(T.view('touch').coach, 'reload', 'the ⟳ button pulses');
  assert.equal(T.view('touch').count, '0/2', 'the two you shoved are still up');
  game.update(1 / 60, idle(['reload']));
  assert.equal(p.weapon.reloading, true);
  run(game, 0.1);
  assert.equal(T.view('touch').coach, 'fire', 'then the fire thumb');
  assert.equal(T.step.id, 'reload', 'not done while they are up');
  for (const z of T.group) z.alive = false;
  run(game, 0.1);
  assert.ok(T.pause > 0, 'done');
  swapWeapon(game, p);
  assert.equal(p.wi, 0, 'and never a swap');
});

test('short: eight lessons, and the crowds turn up out of sight (the pack down the street ahead of you, the rush at the end behind you)', () => {
  assert.equal(LESSONS, 8);
  assert.equal(STEPS.length, 10);
  const game = make();
  const T = game.tutorial;
  // Where each one turns up, and whether you could see the spot right then.
  const born = [];
  const spawnAt = game.director.spawnAt.bind(game.director);
  game.director.spawnAt = (x, y, aware) => {
    born.push({ x, y, seen: game.onScreen(x, y, 40), step: T.step.id });
    return spawnAt(x, y, aware);
  };
  const at = (list) => (b) => list.some((q) => q.x === b.x && q.y === b.y);
  // The pack: five, down row 2 from the far end, none of them popping up on screen.
  skipTo(game, 'kite');
  run(game, 2);
  const pack = born.filter((b) => b.step === 'kite');
  assert.equal(pack.length, 5);
  assert.ok(pack.every(at(T.L.packSpawns[0])), 'from the far end of the street');
  assert.ok(pack.every((b) => !b.seen), 'out of sight');
  // The rush at the end: eight, from row 2, while the last gate opens.
  skipTo(game, 'saferoom');
  assert.ok(game.messages.some((m) => m.text === 'HERE THEY COME!'));
  run(game, 2.5);
  const rush = born.filter((b) => b.step === 'saferoom');
  assert.equal(rush.length, 8);
  assert.ok(rush.every(at(T.L.rushSpawns.flat())), 'up through gate 2');
  assert.ok(rush.every((b) => !b.seen), 'out of sight');
  assert.equal(T.gates.g3.state, 'open', 'the way out');
  // Wherever you stand, they turn up where you can't see them.
  const p = game.player;
  const G1 = T.L.gates.g1;
  const G2 = T.L.gates.g2;
  const from2 = (list, spot) => {
    Object.assign(p, spot);
    game.camera.x = p.x;
    game.camera.y = p.y;
    game.syncView();
    const out = T.unseen(list);
    assert.ok(out.length >= 1);
    for (const q of out) assert.ok(!game.onScreen(q.x, q.y, 40) || !game.world.segmentClear(p.x, p.y, q.x, q.y), `seen from ${Math.round(spot.x)},${Math.round(spot.y)}`);
    return out;
  };
  const s2 = T.L.shoveSpawn.y + 170; // the middle of row 2
  assert.ok(from2(T.L.packSpawns, { x: G1.x, y: s2 }).every(at(T.L.packSpawns[0])), 'by gate 1: down the street');
  assert.ok(from2(T.L.packSpawns, { x: T.L.shoveSpawn.x, y: s2 }).every(at(T.L.packSpawns[0])), 'half way: still down the street');
  assert.ok(from2(T.L.packSpawns, { x: G2.x + 60, y: s2 }).every(at(T.L.packSpawns[1])), 'at the far end: up through gate 1');
  for (const spot of [{ x: G2.x, y: G2.y - 60 }, { x: G2.x + 200, y: G2.y - 300 }, { x: T.L.car.x, y: T.L.car.y + 120 }]) from2(T.L.rushSpawns, spot);
});

test('the shove lesson counts shoves that land, and the zombies come to you', () => {
  const game = make();
  skipTo(game, 'shove');
  const T = game.tutorial;
  run(game, 1);
  assert.equal(T.group.length, 2);
  assert.ok(T.group.every((z) => z.state === 'chase'));
  const p = game.player;
  // Shove air: no count. Shove one of them: one.
  game.update(1 / 60, idle(['shove']));
  assert.equal(game.stats.shoveHits, 0);
  run(game, 1);
  const z = T.group[0];
  Object.assign(z, { x: p.x + Math.cos(p.facing) * 30, y: p.y + Math.sin(p.facing) * 30, vx: 0, vy: 0 });
  game.zhash.clear();
  for (const q of game.zombies) if (q.alive) game.zhash.insert(q);
  game.update(1 / 60, idle(['shove']));
  assert.equal(game.stats.shoveHits, 1);
  assert.equal(T.view('touch').count, '1/3');
});

test('nobody dies in the tutorial: 0 HP is a second wind that throws back what is on you', () => {
  const game = make();
  skipTo(game, 'kite');
  run(game, 2);
  const T = game.tutorial;
  const p = game.player;
  for (const z of T.group) Object.assign(z, { x: p.x + 20, y: p.y, vx: 0, vy: 0 });
  game.hurtPlayer(500, T.group[0]);
  assert.equal(p.alive, true);
  assert.equal(game.lost, false);
  assert.ok(p.hp >= p.maxHp * 0.5);
  assert.equal(T.rescues, 1);
  assert.ok(T.group.every((z) => z.stagger > 1), 'thrown back');
  assert.ok(game.messages.some((m) => m.text === 'CLOSE ONE!'));
});

test('an alarm here is two small waves (not a panic event), and the lesson waits for them', () => {
  const game = make();
  skipTo(game, 'alarm');
  const T = game.tutorial;
  game.director.triggerAlarm(T.L.car);
  assert.ok(game.director.alarm);
  run(game, 9.5);
  assert.equal(game.director.alarm, null, 'over sooner than out on the streets');
  assert.equal(T.extra.length, 8);
  assert.equal(T.alarmed, true);
  for (const z of T.group) z.alive = false;
  run(game, 0.2);
  assert.equal(T.step.id, 'alarm', 'not done while the alarm brought company');
  for (const z of T.extra) z.alive = false;
  run(game, 0.2);
  assert.ok(T.pause > 0, 'done');
  assert.ok(buildReport(game).tutorial.alarm);
});

test('a Witch seated from the tuning panel can\'t end the tutorial either: one swipe and she runs off', () => {
  const game = make();
  skipTo(game, 'alarm');
  const T = game.tutorial;
  const p = game.player;
  const w = seatWitchNear(game);
  assert.ok(w);
  startle(game, w, p);
  for (let i = 0; i < 60 * 8 && w.mode !== 'flee'; i++) {
    p.vx = 0;
    p.vy = 0;
    game.update(1 / 60, idle());
  }
  assert.equal(w.mode, 'flee');
  assert.ok(game.stats.witchHits <= 1);
  assert.equal(p.alive, true);
  assert.equal(game.lost, false);
  run(game, 12);
  assert.equal(w.alive, false, 'gone');
  assert.equal(T.over, false);
});

test('the words: every lesson has them for touch, the mouse and pads fall back sensibly, and they fit on the card', () => {
  assert.equal(LESSONS, STEPS.filter((s) => s.dot).length);
  for (const s of STEPS) {
    for (const src of ['touch', 'mouse', 'gamepad']) {
      const t = stepText(s, src);
      assert.ok(t && t.length <= 130, `${s.id} (${src}): ${t && t.length} characters`);
    }
    assert.ok(s.title && s.title === s.title.toUpperCase());
  }
  // The touch words talk about thumbs and taps; the mouse words never do.
  for (const id of ['move', 'aim', 'fire', 'shove', 'reload', 'kite']) {
    const s = STEPS.find((q) => q.id === id);
    assert.ok(/thumb|tap|push|ring/i.test(stepText(s, 'touch')), id);
    assert.ok(!/thumb|tap /i.test(stepText(s, 'mouse')), id);
  }
});

test('the coaching draws on a phone at every lesson (touch, mouse, pad) without a bad number, and the card sits between the thumbs', () => {
  const settings = { ...DEFAULTS, level: 'tutorial', playtestPrompt: false };
  for (const [w, h] of [[844, 390], [667, 375], [1024, 768]]) {
    const L = computeLayout(w, h, { l: 0, r: 0, t: 0, b: 0 }, settings);
    const R = settings.stickRadius;
    const c = cardRect(L, R, 3);
    assert.ok(c.x >= L.fixedMove.x + R && c.x + c.w <= L.fixedAim.x - R, `${w}x${h}: clear of the sticks`);
    assert.ok(c.y + c.h <= h - 8 && c.y > h * 0.5, `${w}x${h}: at the bottom`);
  }
  const game = make();
  const L = computeLayout(844, 390, { l: 0, r: 0, t: 0, b: 0 }, game.settings);
  const ctx = mockCtx();
  const R = { ctx, v: game.view, ground() {}, reset() {} };
  const touchIn = (source, active = false) => ({ source, touch: { move: { active }, aim: { active, crossedFire: false }, pressed: new Map() } });
  const seen = new Set();
  for (const s of STEPS) {
    skipTo(game, s.id);
    // The reload lesson shows two things: the ⟳ button, then (loading) the fire thumb.
    for (const loaded of s.id === 'reload' ? [false, true] : [false]) {
      if (loaded) {
        game.update(1 / 60, idle(['reload']));
        run(game, 0.1);
      }
      for (const src of ['touch', 'mouse', 'gamepad']) {
        texts.length = 0;
        bad = null;
        drawTutorialHud(ctx, game, touchIn(src), { title: false, forceSticks: false }, L);
        drawTutorialBright(R, game, game.viewRect(40));
        assert.equal(bad, null, `${s.id} (${src}): ${bad}`);
        assert.ok(texts.includes(s.title) || texts.includes(`✓ ${s.title}`), `${s.id}: the card says what it is`);
        if (src === 'touch') for (const t of texts) seen.add(t);
      }
    }
  }
  for (const label of ['LEFT THUMB: SLIDE', 'RIGHT THUMB: AIM', 'PAST THE RING: FIRE', 'QUICK TAP: SHOVE', 'TAP', 'LEFT THUMB: BACK OFF', 'RIGHT THUMB: FIRE']) assert.ok(seen.has(label), `a ghost thumb says ${label}`);
  // Title screen: nothing drawn.
  texts.length = 0;
  drawTutorialHud(ctx, game, touchIn('touch'), { title: true }, L);
  assert.equal(texts.length, 0);
});

test("the card's words are never cut short, down to the smallest phones (and they get a size smaller before that)", () => {
  const ctx = mockCtx();
  for (const [w, h] of [[640, 360], [568, 320]]) {
    const game = make();
    game.setViewport(w, h);
    const L = computeLayout(w, h, { l: 0, r: 0, t: 0, b: 0 }, game.settings);
    for (const s of STEPS) {
      skipTo(game, s.id);
      texts.length = 0;
      drawTutorialHud(ctx, game, { source: 'touch', touch: { move: { active: true }, aim: { active: true, crossedFire: false }, pressed: new Map() } }, { title: false }, L);
      const shown = texts.join(' ');
      for (const word of stepText(s, 'touch').split(' ')) assert.ok(shown.includes(word), `${w}x${h} ${s.id}: "${word}" is missing`);
    }
  }
  // More words than four lines hold: a size smaller, and all of them still there.
  const fit = cardText(ctx, 'word '.repeat(40).trim(), 120);
  assert.ok(fit.size < 13, `${fit.size} px`);
  assert.equal(fit.lines.join(' ').split(' ').length, 40);
});

test('the report: how far you got, the close calls, and the seconds per lesson (where people get stuck)', () => {
  const game = make();
  skipTo(game, 'kite');
  const r = buildReport(game);
  assert.equal(r.level, 'tutorial');
  assert.equal(r.tutorial.step, 'kite');
  assert.equal(r.tutorial.of, LESSONS);
  assert.ok(r.tutorial.lessons >= 4);
  assert.ok('move' in r.tutorial.times && 'shove' in r.tutorial.times);
  assert.match(reportText(r), /Tutorial: \d+\/\d+ lessons, reached "kite"/);
  // Off the tutorial, no such line.
  const city = new Game({ ...DEFAULTS, playtestPrompt: false, wanderers: 0 }, audio, () => {});
  assert.equal(buildReport(city).tutorial, null);
  assert.equal(city.tutorial, null);
  assert.equal(city.director.scripted, false);
});

test('done on this device: remembered, and a broken store never throws', () => {
  store.clear();
  assert.equal(tutorialDone(), false);
  saveTutorialDone(123.45);
  assert.equal(tutorialDone(), true);
  assert.equal(JSON.parse(store.get('funland2.p0.tutorial.v1')).time, 123.5);
  store.set('funland2.p0.tutorial.v1', '{not json');
  assert.equal(tutorialDone(), false);
});

// --- A bot plays it ------------------------------------------------------------------------

test('a bot gets through every lesson to the safe room through the real game loop (stick directions, events, buttons)', () => {
  store.clear();
  const game = make();
  const T = game.tutorial;
  const p = game.player;
  const fields = new Map();
  const tmp = { x: 0, y: 0 };
  const screen = (dx, dy) => {
    const s = game.view.dirToScreen(dx, dy);
    const m = Math.hypot(s.x, s.y) || 1;
    return { x: s.x / m, y: s.y / m };
  };
  const walkTo = (x, y) => {
    if (Math.hypot(x - p.x, y - p.y) < 20) return { x: 0, y: 0 };
    const key = `${Math.round(x)},${Math.round(y)}`;
    let f = fields.get(key);
    if (!f) {
      f = new FlowField(game.world);
      f.compute(x, y);
      fields.set(key, f);
    }
    let dx = x - p.x;
    let dy = y - p.y;
    if (Math.hypot(dx, dy) > 60 && f.dirAt(p.x, p.y, tmp)) {
      dx = tmp.x;
      dy = tmp.y;
    }
    return screen(dx, dy);
  };
  const nearest = (list) => {
    let best = null;
    let bd = Infinity;
    for (const z of list) {
      if (!z.alive || z.passive) continue;
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
    return best;
  };
  const order = [];
  let evT = 0;
  for (let i = 0; i < 60 * 400 && !game.won; i++) {
    const s = T.step.id;
    if (order[order.length - 1] !== s) order.push(s);
    const f = idle([]);
    evT -= 1 / 60;
    const fight = (list, shove = true) => {
      const z = nearest(list);
      if (!z) return;
      const a = screen(z.x - p.x, z.y - p.y);
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      const clear = game.world.segmentClear(p.x, p.y, z.x, z.y, game.world.shotBlockers);
      Object.assign(f, { aimActive: true, aimX: a.x, aimY: a.y, aimRaw: 1, fire: clear && d < p.weapon.def.range * 0.9 });
      if (shove && d < 55 && evT <= 0) {
        f.events.push('shove');
        evT = 0.5;
      }
      if (d > p.weapon.def.range * 0.8 || !clear) f.move = walkTo(z.x, z.penned ? z.y + 160 : z.y);
    };
    if (T.pause > 0) {
      // reading the ✓
    } else if (s === 'move') f.move = walkTo(T.L.moveRing.x, T.L.moveRing.y);
    else if (s === 'aim') {
      const z = nearest(T.pen);
      const a = screen(z.x - p.x, z.y - p.y);
      Object.assign(f, { aimActive: true, aimX: a.x, aimY: a.y, aimRaw: 0.3 });
    } else if (s === 'fire') fight(T.pen, false);
    else if (s === 'gate1' || s === 'gate2') {
      const t = T.arrow();
      f.move = walkTo(t.x, t.y - 60);
    } else if (s === 'saferoom') {
      // Run for it (and shove off any that catch up).
      const t = T.arrow();
      if (t) f.move = walkTo(t.x, t.y);
      const z = nearest(T.group);
      if (z && Math.hypot(z.x - p.x, z.y - p.y) < 55 && evT <= 0) {
        f.events.push('shove');
        evT = 0.5;
      }
    } else if (s === 'shove') {
      const z = nearest(T.group);
      if (z && Math.hypot(z.x - p.x, z.y - p.y) < 55 && evT <= 0) {
        f.events.push('shove');
        evT = 0.45;
      }
    } else if (s === 'reload' && !T.reloaded) {
      if (evT <= 0) {
        f.events.push('reload');
        evT = 0.5;
      }
    } else fight(T.group.concat(T.extra));
    game.update(1 / 60, f);
  }
  run(game, 1);
  assert.equal(game.won, true, `stuck at "${T.step.id}" after ${game.stats.time.toFixed(0)} s`);
  assert.equal(game.lost, false);
  assert.deepEqual(order, STEPS.map((q) => q.id), 'every lesson, in order');
  assert.equal(T.lessonsDone, LESSONS);
  assert.ok(game.stats.time < 100, `${game.stats.time.toFixed(0)} s for a bot`);
  assert.equal(tutorialDone(), true);
  assert.equal(p.weapon.def.id, 'smg', 'one gun, all the way');
  assert.ok(game.stats.shoveHits >= 3 && game.stats.kills >= 17, `${game.stats.shoveHits} shoves, ${game.stats.kills} kills`);
});
