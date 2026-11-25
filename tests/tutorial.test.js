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
const COORD = new Set(['moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'fillRect', 'strokeRect', 'fillText', 'arcTo', 'drawImage', 'translate', 'scale']);
const texts = [];
const placed = []; // [text, x, y] of every fillText
function mockCtx(measure = (s) => String(s).length * 7) {
  const t = { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', lineCap: 'butt', textAlign: 'left', textBaseline: 'top' };
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'measureText') return (s) => ({ width: measure(s, o.font) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      return (...a) => {
        if (k === 'fillText') {
          texts.push(String(a[0]));
          placed.push([String(a[0]), a[1], a[2]]);
        }
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
const { generateTutorial, TUT_W, TUT_H, TUTORIAL_BEN } = await import('../src/world/tutorial-gen.js');
const { STEPS, LESSONS, HUD_PARTS, PROMPT_IN, PROMPT_OUT, stepText, tutorialDone, saveTutorialDone } = await import('../src/game/tutorial.js');
const { World, FlowField, NAV_CELL } = await import('../src/world/world.js');
const { startle, seatWitchNear } = await import('../src/game/witch.js');
const { startReload, swapWeapon } = await import('../src/game/player.js');
const { hasModel } = await import('../src/render/models.js');
const { computeLayout, applyHudReveal, hitButton } = await import('../src/layout.js');
const { drawTutorialHud, drawTutorialBright, lineLayout, introLayout, promptSpot, setTutorialPictures, HANDS, THUMB } = await import('../src/render/tutorial-render.js');
const { drawHud } = await import('../src/render/hud.js');
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
    else if (s === 'reload') game.update(1 / 60, idle(['reload'])); // the one button that works
    else if (s === 'gate1' || s === 'gate2') {
      run(game, 1.3); // the bars slide away
      const G = T.L.gates[s === 'gate1' ? 'g1' : 'g2'];
      Object.assign(p, { x: G.x, y: G.y - 160 });
    } else if (s === 'shove') {
      // Come by the door: out it bursts; shove it (by hand) and put it down.
      const D = T.L.shoveSpawn;
      Object.assign(p, { x: D.x + 120, y: D.y + 215, vx: 0, vy: 0 }); // where walking up the street gets you as it bursts out
      run(game, 1 / 30);
      if (T.lunger) {
        T.shoved = true;
        T.answer();
        T.lunger.alive = false;
      }
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
  const game = make();
  assert.equal(STEPS.find((q) => q.id === 'fire').count(game.tutorial, game), '0/6', 'the card counts them');
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

test("next to nothing to read on the way: no writing on the streets, no painted words, one car, Ben's one line in the safe room at the end", () => {
  const map = generateTutorial(1);
  const words = map.decor.filter((d) => d.text);
  assert.deepEqual(words.map((d) => d.type), ['bentext'], 'one line, in his crayon');
  assert.equal(words[0].text, TUTORIAL_BEN.text);
  assert.ok(pointInRect(words[0].x, words[0].y, map.endRoom.interior), 'in the safe room at the end');
  assert.equal(map.obstacles.filter((o) => o.kind === 'car').length, 1, 'the one car is the one not to shoot');
  assert.ok(map.decor.filter((d) => ['puddle', 'crack', 'trash', 'manhole'].includes(d.type)).length <= 16, 'a little clutter, no more');
});

// --- At run time ---------------------------------------------------------------------------

test('a run: the lessons in order, the pen filled, the gates shut, no teammate, and the director stands back', () => {
  const game = make({ ally: true, specials: true, nightTerror: true, wanderers: 10, hordeSize: 10 });
  const T = game.tutorial;
  assert.ok(T);
  assert.equal(T.step.id, 'hold', 'first, how to hold the phone');
  run(game, 1 / 60); // ...which a pad (this test's input) skips at once
  assert.equal(T.step.id, 'move');
  assert.equal(T.pause, 0, 'straight on, no tick for it');
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

test('reload, straight after the shooting: the world stops, the screen goes dark but for ⟳, only ⟳ works, and gate 1 opens', () => {
  const game = make();
  const T = game.tutorial;
  const p = game.player;
  skipTo(game, 'reload');
  assert.ok(T.prompt && T.prompt.kind === 'reload' && T.prompt.stop);
  assert.ok(p.weapon.mag > 0 && p.weapon.mag < p.weapon.cap, 'something to reload (and a gun that still shoots)');
  assert.equal(T.view('touch').text, 'Tap to reload.');
  assert.equal(T.view('mouse').text, 'Press R to reload.');
  assert.equal(T.view('touch').coach, null, 'the prompt is the coaching');
  run(game, PROMPT_IN + 0.05);
  assert.equal(T.timeScale(), 0, 'stopped');
  const t0 = game.time;
  const shoves = game.stats.shoves;
  game.update(1 / 60, idle(['shove', 'swap']));
  run(game, 1);
  assert.equal(game.time, t0, 'the world waits');
  assert.equal(game.stats.shoves, shoves, 'a tap anywhere else does nothing');
  assert.equal(p.wi, 0);
  assert.equal(T.gates.g1.state, 'shut');
  game.update(1 / 60, idle(['reload']));
  assert.equal(p.weapon.reloading, true);
  assert.ok(T.pause > 0, 'done');
  assert.notEqual(T.gates.g1.state, 'shut', 'gate 1 opens');
  run(game, PROMPT_OUT + 0.05);
  assert.equal(T.timeScale(), 1, 'and the world goes on');
  assert.equal(T.prompt, null);
  assert.ok(game.time > t0);
  swapWeapon(game, p);
  assert.equal(p.wi, 0, 'and never a swap');
});

test('short: eight lessons, and the crowds turn up out of sight (the pack down the street ahead of you, the rush at the end behind you)', () => {
  assert.equal(LESSONS, 8);
  assert.equal(STEPS.length, 11, 'eight lessons, two gates, and how to hold the phone');
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

test('shove: one bursts out of the door as you come by, the world slows to a stop as it reaches you, only a shove gets you going, then you shoot it', () => {
  const game = make();
  const T = game.tutorial;
  const p = game.player;
  skipTo(game, 'shove');
  assert.equal(T.lunger, null);
  assert.equal(T.view('touch').text, null, 'no words: the arrow shows the way along the street');
  assert.deepEqual({ x: T.arrow().x, y: T.arrow().y }, { x: T.L.shoveWalk.x, y: T.L.shoveWalk.y });
  assert.equal(T.hud().shove, 0, 'no SHOVE button yet');
  run(game, 1);
  assert.equal(T.lunger, null, 'nothing until you come by the door');
  const D = T.L.shoveSpawn;
  Object.assign(p, { x: D.x + 120, y: D.y + 180, vx: 0, vy: 0 });
  run(game, 1 / 60);
  const z = T.lunger;
  assert.ok(z && z.alive && z.state === 'chase', 'out it comes');
  assert.deepEqual(T.group, [z]);
  assert.equal(T.prompt, null, 'not yet: it has to close in');
  // As it closes in: the prompt, SHOVE coming in, the world slowing (not all at once).
  const scales = [];
  for (let i = 0; i < 60 * 8 && T.timeScale() > 0; i++) {
    game.update(1 / 60, idle());
    if (T.prompt) scales.push(T.timeScale());
  }
  assert.ok(T.prompt && T.prompt.kind === 'shove' && T.prompt.threat === z);
  assert.equal(T.timeScale(), 0, 'stopped');
  assert.ok(scales.some((k) => k > 0.1 && k < 0.9), 'slowing as it came');
  assert.ok(T.inReach(z), 'with it in reach');
  assert.ok(T.hud().shove > 0, 'SHOVE comes in with it');
  assert.equal(T.view('touch').text, 'Too close! Tap SHOVE.');
  assert.equal(T.view('mouse').text, 'Too close! Press Space.');
  assert.equal(T.view('touch').coach, null, 'the prompt is the coaching');
  // The gun still works (nothing emptied it), but bullets don't put this one down before the shove.
  assert.ok(p.weapon.mag > 0);
  z.hp = 10;
  run(game, 1 / 60);
  assert.equal(z.hp, 50);
  // Stopped: nothing moves, and nothing but a shove gets through.
  const at = { x: z.x, y: z.y, t: game.time };
  game.update(1 / 60, idle(['reload', 'swap']));
  run(game, 1);
  assert.deepEqual({ x: z.x, y: z.y, t: game.time }, at);
  assert.equal(p.weapon.reloading, false);
  game.update(1 / 60, idle(['shove']));
  assert.equal(T.shoved, true);
  assert.equal(game.stats.shoveHits, 1);
  assert.ok(z.stagger > 0, 'knocked back');
  run(game, PROMPT_OUT + 0.1);
  assert.equal(T.timeScale(), 1);
  assert.equal(T.prompt, null);
  assert.equal(T.view('touch').text, 'Now shoot it.');
  assert.equal(T.view('touch').coach, 'fire');
  z.alive = false; // shot
  run(game, 0.1);
  assert.ok(T.pause > 0, 'done');
});

test('a shove pressed before the one coming at you is in reach waits for it, and lands the moment it can', () => {
  const game = make();
  const T = game.tutorial;
  const p = game.player;
  skipTo(game, 'shove');
  const D = T.L.shoveSpawn;
  Object.assign(p, { x: D.x + 120, y: D.y + 180, vx: 0, vy: 0 });
  for (let i = 0; i < 600 && !T.prompt; i++) game.update(1 / 60, idle());
  assert.ok(T.prompt && !T.inReach(T.lunger), 'up, with it not yet in reach');
  const shoves = game.stats.shoves;
  game.update(1 / 60, idle(['shove']));
  assert.equal(game.stats.shoves, shoves, 'not thrown at the air');
  for (let i = 0; i < 600 && !T.shoved; i++) game.update(1 / 60, idle());
  assert.equal(T.shoved, true, 'it went as soon as it could land');
  assert.equal(game.stats.shoves, shoves + 1);
  assert.equal(game.stats.shoveHits, 1);
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
  assert.ok(game.messages.some((m) => m.text === 'YOU SHOT THE CAR!'), 'it says what happened');
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

test('the alarm car is in plain view when its lesson starts: close, on screen, pulsing, and between you and the four', () => {
  const game = make();
  game.setViewport(640, 360); // the smallest common phone
  skipTo(game, 'alarm');
  run(game, 0.6); // the camera settles
  const T = game.tutorial;
  const p = game.player;
  const car = T.L.car;
  const c = { x: car.x + car.w / 2, y: car.y + car.h / 2 };
  const d = Math.hypot(c.x - p.x, c.y - p.y);
  assert.ok(d < 380, `the car is ${Math.round(d)} u away`);
  const s = game.worldToScreen(c.x, c.y);
  assert.ok(s.x > 40 && s.x < 600 && s.y > 70, `on screen, below the HUD (${Math.round(s.x)}, ${Math.round(s.y)})`);
  // ...and not behind a button or the line at the top.
  const L = computeLayout(640, 360, { l: 0, r: 0, t: 0, b: 0 }, game.settings);
  for (const b of L.buttons || Object.values(L.byId)) {
    if (!b || b.hidden || b.r === undefined) continue;
    assert.ok(Math.hypot(s.x - b.x, s.y - b.y) > b.r + 40, `behind the ${b.id} button`);
  }
  const line = lineLayout(mockCtx(), L, `${T.view('touch').text}   0/4`, true);
  assert.ok(s.y > line.y + line.h / 2 + 20, 'below the line at the top');
  // The four come along the street from beyond it.
  for (const q of T.L.alarmSpawns) {
    assert.ok(Math.hypot(q.x - p.x, q.y - p.y) > d + 200, 'they start out further off than the car');
    assert.ok(q.x > c.x + 200, 'on its far side');
  }
  // In the world: a red pulse round it (until it goes off).
  const ctx = mockCtx();
  const R = { ctx, v: game.view, ground() {}, reset() {} };
  let rings = 0;
  const arc = ctx.arc;
  ctx.ellipse = ctx.arc = (...a) => {
    if (Math.abs(a[0] - c.x) < 1 && Math.abs(a[1] - c.y) < 1) rings++;
    return arc(...a);
  };
  drawTutorialBright(R, game, game.viewRect(40));
  assert.ok(rings > 0, 'the car is ringed');
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

test('the words: one short line or none, for touch, the mouse and pads; the touch ones talk thumbs and taps, the mouse ones never do', () => {
  assert.equal(LESSONS, STEPS.filter((s) => s.dot).length);
  // (The shove lesson's line goes with how far it's got: none on the way, the prompt's, then "shoot it".)
  const states = [{ lunger: null }, { lunger: {}, shoved: false }, { lunger: {}, shoved: true }];
  for (const s of STEPS) {
    for (const src of ['touch', 'mouse', 'gamepad']) {
      for (const t of states) {
        const line = stepText(s, src, t, null);
        if (line !== null) assert.ok(line.length <= 36, `${s.id} (${src}): "${line}" is ${line.length} characters`);
      }
      for (const n of s.nudges || []) {
        const line = stepText(n, src);
        assert.ok(line && line.length <= 40, `${s.id}.${n.id} (${src}): ${line && line.length} characters`);
      }
    }
    assert.ok(s.title && s.title === s.title.toUpperCase());
  }
  // No words where the arrow says it all: the gates.
  for (const id of ['gate1', 'gate2']) assert.equal(stepText(STEPS.find((q) => q.id === id), 'touch'), null, id);
  // The touch words talk about thumbs and taps; the mouse words never do.
  for (const id of ['move', 'aim', 'fire', 'reload']) {
    const s = STEPS.find((q) => q.id === id);
    assert.ok(/thumb|tap|push|ring/i.test(stepText(s, 'touch')), id);
    assert.ok(!/thumb|tap /i.test(stepText(s, 'mouse')), id);
  }
  const shove = STEPS.find((q) => q.id === 'shove');
  assert.ok(/tap/i.test(stepText(shove, 'touch', states[1])) && !/tap|thumb/i.test(stepText(shove, 'mouse', states[1])));
});

test('first, on a phone: a black screen with a big picture of how to hold it and one line, nothing else, until you tap', () => {
  const touch = (left, right, events = []) => ({ ...idle(events), source: 'touch', thumbs: { left, right } });
  let game = make();
  let T = game.tutorial;
  assert.equal(T.step.id, 'hold');
  assert.equal(T.step.dot, undefined, 'not a lesson of its own');
  assert.equal(T.intro(), 1);
  run(game, 3, touch(false, false));
  assert.equal(T.step.id, 'hold', 'it waits for you');
  assert.equal(T.intro(), 1, 'black all the while');
  // On screen: the black, the picture and the one line; nothing else at all (no HUD, sticks, buttons or card).
  for (const [w, h] of [[568, 320], [640, 360], [844, 390], [1024, 768]]) {
    game.setViewport(w, h);
    const L = computeLayout(w, h, { l: 0, r: 0, t: 0, b: 0 }, game.settings);
    const ctx = mockCtx();
    texts.length = 0;
    bad = null;
    const input = { source: 'touch', touch: { move: { active: false }, aim: { active: false, crossedFire: false }, pressed: new Map() } };
    drawHud(ctx, game, input, { layout: L, title: false, forceSticks: true }, null);
    assert.equal(bad, null, `${w}x${h}: ${bad}`);
    assert.deepEqual(texts, ['HOLD YOUR PHONE LIKE THIS'], `${w}x${h}: one line and nothing else`);
    // A big picture: the phone alone is at least half the screen wide (or as tall as the screen allows), it and the thumbs
    // on screen, the photo down past the bottom (the forearms come up from below), the line above it and clear of the fingers.
    const I = introLayout(w, h);
    assert.ok(I.PW >= w * 0.5 || I.PH >= h * 0.45, `${w}x${h}: a phone ${Math.round(I.PW)} px wide`);
    assert.ok(I.cx - I.PW / 2 >= 0 && I.cx + I.PW / 2 <= w && I.cy + I.PH / 2 < h, `${w}x${h}: the phone on screen`);
    for (const q of I.thumbs) assert.ok(q.x > 0 && q.x < w && q.y > 0 && q.y < h, `${w}x${h}: a thumb off screen`);
    assert.ok(I.y + I.H >= h - 0.5, `${w}x${h}: the photo stops short of the bottom`);
    assert.ok(Math.abs(I.x + I.W / 2 - w / 2) < 30, `${w}x${h}: off centre`);
    assert.ok(I.titleY + I.size / 2 < I.cy - I.PH / 2 && I.titleY + I.size / 2 < I.fingers, `${w}x${h}: the line above the phone and the fingers`);
    assert.ok(I.titleY - I.size / 2 >= 0, `${w}x${h}: the line off the top`);
    assert.ok(I.size * 0.62 * 26 <= w * 0.9 + 1, `${w}x${h}: the line fits across`);
  }
  game.setViewport(844, 390);
  // A tap anywhere: on with the game, the black fading out.
  run(game, 0.05, touch(false, false, ['tap']));
  assert.ok(T.pause > 0, 'the tap ends it');
  assert.ok(T.intro() > 0 && T.intro() < 1, 'fading');
  run(game, 1, touch(false, false));
  assert.equal(T.step.id, 'move');
  assert.equal(T.intro(), 0);
  // A thumb coming down does it too.
  game = make();
  T = game.tutorial;
  run(game, 0.05, touch(true, false));
  assert.ok(T.pause > 0);
  // ...and a tap so quick that no frame saw the thumb down (down and up between two frames: input reports it landed).
  game = make();
  T = game.tutorial;
  run(game, 1 / 60, { ...touch(false, false), thumbs: { left: false, right: false, landed: true } });
  assert.ok(T.pause > 0, 'the quickest tap ends it too');
  // With a mouse it never shows.
  game = make();
  T = game.tutorial;
  game.update(1 / 60, { ...idle(), source: 'mouse' });
  assert.equal(T.step.id, 'move');
  assert.equal(T.intro(), 0);
  assert.ok(!('hold' in T.times));
});

test('the photos (hands holding the phone, the ghost thumb), once loaded: drawn where the layout says, nothing else changes, never a bad number', () => {
  // Stand-ins for loaded images (node has no Image): what drawImage gets is checked instead.
  const fake = (P) => ({ complete: true, naturalWidth: P.w, width: P.w, height: P.h });
  const pics = { hands: fake(HANDS), thumb: fake(THUMB) };
  setTutorialPictures(pics);
  try {
    const touch = (left, right, events = []) => ({ ...idle(events), source: 'touch', thumbs: { left, right } });
    const game = make();
    for (const [w, h] of [[568, 320], [844, 390], [1024, 768]]) {
      game.setViewport(w, h);
      const L = computeLayout(w, h, { l: 0, r: 0, t: 0, b: 0 }, game.settings);
      const drawn = [];
      const ctx = mockCtx();
      const base = ctx.drawImage;
      ctx.drawImage = (im, ...a) => {
        drawn.push([im, ...a]);
        return base(im, ...a);
      };
      texts.length = 0;
      bad = null;
      const input = { source: 'touch', touch: { move: { active: false }, aim: { active: false, crossedFire: false }, pressed: new Map() } };
      drawHud(ctx, game, input, { layout: L, title: false, forceSticks: true }, null);
      assert.equal(bad, null, `${w}x${h}: ${bad}`);
      assert.deepEqual(texts, ['HOLD YOUR PHONE LIKE THIS'], 'still the one line and nothing else');
      const I = introLayout(w, h);
      assert.deepEqual(drawn.map((d) => d.slice(0, 5)), [[pics.hands, I.x, I.y, I.W, I.H]], `${w}x${h}: the photo, where the layout puts it`);
    }
    // On to the lessons: the ghost thumbs and the prompt's thumb are the photo thumb (mirrored on the left).
    game.setViewport(844, 390);
    run(game, 0.05, touch(false, false, ['tap']));
    run(game, 1, touch(false, false));
    assert.equal(game.tutorial.step.id, 'move');
    const L = computeLayout(844, 390, { l: 0, r: 0, t: 0, b: 0 }, game.settings);
    const seen = [];
    for (const id of ['move', 'aim', 'reload', 'kite']) {
      skipTo(game, id);
      const ctx = mockCtx();
      const base = ctx.drawImage;
      const scale = ctx.scale;
      let mirrored = 0;
      ctx.scale = (x, y) => {
        if (x < 0) mirrored++;
        return scale(x, y);
      };
      let thumbs = 0;
      ctx.drawImage = (im, ...a) => {
        if (im === pics.thumb) thumbs++;
        return base(im, ...a);
      };
      bad = null;
      drawTutorialHud(ctx, game, { source: 'touch', touch: { move: { active: false }, aim: { active: false, crossedFire: false }, pressed: new Map() } }, { title: false, forceSticks: false }, L);
      assert.equal(bad, null, `${id}: ${bad}`);
      seen.push([id, thumbs, mirrored]);
    }
    assert.deepEqual(seen, [['move', 1, 1], ['aim', 1, 0], ['reload', 1, 0], ['kite', 2, 1]], 'the left thumb mirrored, the right one as it is; the prompt taps with one');
  } finally {
    setTutorialPictures({ hands: null, thumb: null });
  }
});

test('the HUD comes in a part at a time: the two sticks first, ⟳ for the reload, SHOVE when the shove is asked for, then all of it (never the clock)', () => {
  assert.deepEqual(HUD_PARTS, ['sticks', 'reload', 'shove', 'all']);
  const game = make();
  const T = game.tutorial;
  const S = game.settings;
  const L = computeLayout(844, 390, { l: 0, r: 0, t: 0, b: 0 }, S);
  const ctx = mockCtx();
  const pad = { source: 'gamepad', touch: { move: { active: false }, aim: { active: false, crossedFire: false }, pressed: new Map() } };
  const shown = () => {
    texts.length = 0;
    bad = null;
    applyHudReveal(L, S, T.hud()); // as main.js does every frame
    drawHud(ctx, game, pad, { layout: L, title: false, forceSticks: false, input: pad }, null);
    assert.equal(bad, null, bad);
    return { hp: texts.includes('HP'), gun: texts.includes('SMG'), clock: texts.some((t) => /kills/.test(t)), shove: texts.includes('SHOVE') };
  };
  const pressable = () => {
    applyHudReveal(L, S, T.hud());
    const B = L.byId;
    return { shove: hitButton(B.shove, B.shove.x, B.shove.y), reload: hitButton(B.reload, B.reload.x, B.reload.y), pause: hitButton(B.pause, B.pause.x, B.pause.y), gun: hitButton(B.swap, B.swap.x + 5, B.swap.y + 5) };
  };
  skipTo(game, 'move');
  assert.deepEqual(T.hud(), { shove: 0, reload: 0, all: 0 });
  assert.deepEqual(shown(), { hp: false, gun: false, clock: false, shove: false }, 'the sticks and nothing else');
  assert.deepEqual(pressable(), { shove: false, reload: false, pause: false, gun: false }, 'and nothing there to press by mistake');
  skipTo(game, 'reload');
  assert.ok(T.hud().reload < 1, 'fading in');
  run(game, 0.6);
  assert.equal(T.hud().reload, 1, 'in, though the world has stopped (the HUD runs on the tutorial clock)');
  assert.deepEqual(pressable(), { shove: false, reload: true, pause: false, gun: false }, '⟳ for the reload');
  skipTo(game, 'shove');
  assert.deepEqual(pressable(), { shove: false, reload: true, pause: false, gun: false }, 'no SHOVE on the way to the door');
  const D = T.L.shoveSpawn;
  Object.assign(game.player, { x: D.x + 120, y: D.y + 180, vx: 0, vy: 0 });
  for (let i = 0; i < 600 && !T.prompt; i++) game.update(1 / 60, idle());
  run(game, 0.6);
  assert.deepEqual(shown(), { hp: false, gun: false, clock: false, shove: true }, 'SHOVE comes in when it is asked for');
  assert.deepEqual(pressable(), { shove: true, reload: true, pause: false, gun: false });
  skipTo(game, 'kite');
  run(game, 0.6);
  assert.deepEqual(T.hud(), { shove: 1, reload: 1, all: 1 });
  assert.deepEqual(shown(), { hp: true, gun: true, clock: false, shove: true }, 'then all of it (the top is kept for the line: no clock)');
  assert.deepEqual(pressable(), { shove: true, reload: true, pause: true, gun: true });
  // Day 2 shows it all from the start, and with no tutorial nothing is held back.
  assert.deepEqual(make({ level: 'tutorial2' }).tutorial.hud(), { shove: 1, reload: 1, all: 1 });
  applyHudReveal(L, S, null);
  assert.ok(!L.byId.reload.hidden && !L.byId.pause.hidden && !L.byId.swap.hidden && L.byId.shove.hidden === !S.shoveButton);
});

test('doing it wrong: each way of getting stuck gets its own nudge on the line (in amber), and the report counts them', () => {
  const touch = (o = {}) => ({ ...idle(), source: 'touch', thumbs: { left: false, right: false }, ...o });
  const at = (id) => {
    const game = make();
    skipTo(game, id);
    if (id === 'hold') return game;
    run(game, 0.05, touch()); // (a pad got it here; from now on it's a phone)
    return game;
  };
  const check = (game, key, text) => {
    const T = game.tutorial;
    assert.ok(T.nudge, `${key}: no nudge`);
    assert.equal(T.nudge.key, key);
    const v = T.view(game.input.source === 'touch' ? 'touch' : game.input.source);
    assert.ok(v.nudge, 'the line knows it is a nudge (amber)');
    assert.equal(v.text, text);
    assert.equal(T.nudges[key], 1, 'counted');
  };
  // The first screen: nothing tapped for a while.
  let g = at('hold');
  run(g, 7, touch());
  check(g, 'hold.no-tap', 'Tap the screen to start.');
  run(g, 10, touch());
  assert.equal(g.tutorial.nudge.key, 'hold.no-tap', 'and it stays up until the tap');
  // Move: taps instead of a slide; a thumb down that doesn't slide; walking with the right thumb.
  g = at('move');
  run(g, 1.2, (() => { let i = 0; return () => touch({ thumbs: { left: i++ % 30 < 6, right: false } }); })());
  check(g, 'move.tapped', 'Keep your thumb down and slide it.');
  g = at('move');
  run(g, 1.5, touch({ thumbs: { left: true, right: false } }));
  check(g, 'move.still-thumb', 'Now slide it toward the ring.');
  g = at('move');
  run(g, 2, touch({ thumbs: { left: false, right: true }, aimActive: true, aimRaw: 0.7 }));
  check(g, 'move.right-thumb', 'Walk with your LEFT thumb.');
  // Aim: tapping instead of holding.
  g = at('aim');
  g.update(1 / 60, touch({ events: ['shove'] }));
  run(g, 0.5, touch());
  g.update(1 / 60, touch({ events: ['shove'] }));
  check(g, 'aim.tapped', "Don't tap: keep your right thumb down.");
  // Fire: aiming that never pushes past the ring (and with a mouse, the mouse's words).
  for (const [src, text] of [['touch', 'Push your thumb further, past the ring.'], ['mouse', 'Click to shoot.']]) {
    g = at('aim');
    g.tutorial.aimT = 1; // aimed: on to fire, the six still up
    run(g, 1, touch());
    assert.equal(g.tutorial.step.id, 'fire');
    run(g, 3, { ...touch({ thumbs: { left: false, right: true } }), source: src, aimActive: true, aimRaw: 0.5 });
    check(g, 'fire.no-push', text);
  }
  // Shove: never pressing it with the world stopped for it; then not shooting the one shoved off.
  g = at('shove');
  const D = g.tutorial.L.shoveSpawn;
  Object.assign(g.player, { x: D.x + 120, y: D.y + 180, vx: 0, vy: 0 });
  for (let i = 0; i < 600 && !(g.tutorial.prompt && g.tutorial.timeScale() === 0); i++) g.update(1 / 60, touch());
  run(g, 5, touch());
  check(g, 'shove.no-shove', 'Tap the SHOVE button.');
  g.update(1 / 60, touch({ events: ['shove'] }));
  assert.equal(g.tutorial.shoved, true);
  run(g, 6, touch());
  check(g, 'shove.not-shooting', 'Push past the ring to shoot.');
  // Reload: the button never tapped.
  g = at('reload');
  run(g, 5.5, touch());
  check(g, 'reload.no-reload', 'Tap the round ⟳ button.');
  // Both thumbs: not shooting with them close; standing still with one on you.
  g = at('kite');
  Object.assign(g.player, { x: g.tutorial.L.gates.g1.x, y: g.tutorial.L.gates.g1.y - 160 }); // far enough off that they're a while coming
  run(g, 4, touch());
  check(g, 'kite.not-shooting', 'Right thumb: keep shooting!');
  g = at('kite');
  run(g, 2.5, () => {
    // One right on you, and you shooting the other way, standing still.
    const z = g.tutorial.group.find((q) => q.alive);
    if (z) Object.assign(z, { x: g.player.x + 60, y: g.player.y, vx: 0, vy: 0 });
    return touch({ fire: true, aimActive: true, aimRaw: 1, aimX: -1, aimY: 0 });
  });
  check(g, 'kite.not-backing', 'Left thumb: back off!');
  // Run for it: staying put.
  g = at('saferoom');
  run(g, 5.5, touch());
  check(g, 'saferoom.fighting', "Don't fight: run for it!");
  // A nudge has the line for a few seconds, then the lesson's own is back; it comes back if it's still happening.
  g = at('move');
  run(g, 1.5, touch({ thumbs: { left: true, right: false } }));
  run(g, 4.1, touch());
  assert.equal(g.tutorial.nudge, null);
  assert.equal(g.tutorial.view('touch').text, 'Left thumb: walk to the ring.');
  run(g, 8, touch({ thumbs: { left: true, right: false } }));
  assert.equal(g.tutorial.nudges['move.still-thumb'], 2);
  // The report says where people were doing it wrong.
  const r = buildReport(g);
  assert.deepEqual(r.tutorial.nudges, { 'move.still-thumb': 2 });
  assert.match(reportText(r), /Tutorial nudges: move\.still-thumb ×2/);
});

test('the coaching draws at every lesson (touch, mouse, pad) without a bad number: one line at the top or none, no words anywhere else, no labels on the sticks', () => {
  const game = make();
  const L = computeLayout(844, 390, { l: 0, r: 0, t: 0, b: 0 }, game.settings);
  const ctx = mockCtx();
  const R = { ctx, v: game.view, ground() {}, reset() {} };
  const touchIn = (source, active = false) => ({ source, touch: { move: { active }, aim: { active, crossedFire: false }, pressed: new Map() } });
  const seen = new Set();
  const draw = (label) => {
    for (const src of ['touch', 'mouse', 'gamepad']) {
      texts.length = 0;
      placed.length = 0;
      bad = null;
      drawTutorialHud(ctx, game, touchIn(src), { title: false, forceSticks: false }, L);
      drawTutorialBright(R, game, game.viewRect(40));
      assert.equal(bad, null, `${label} (${src}): ${bad}`);
      for (const [t, , y] of placed) assert.ok(y < L.h * 0.25, `${label} (${src}): "${t}" at y ${Math.round(y)}: words only at the top`);
      const v = game.tutorial.view(src === 'touch' ? 'touch' : src);
      if (v.text) assert.ok(texts.includes(v.text), `${label} (${src}): the line says "${v.text}"`);
      if (src === 'touch') for (const t of texts) seen.add(t);
    }
  };
  for (const s of STEPS) {
    skipTo(game, s.id);
    if (s.intro) {
      texts.length = 0;
      drawTutorialHud(ctx, game, touchIn('touch'), { title: false, forceSticks: false }, L);
      assert.equal(texts.length, 0, 'the first screen has it all to itself');
      continue;
    }
    draw(s.id);
    if (s.id === 'shove') {
      // ...and once it's on you, with the world stopped: the prompt.
      const D = game.tutorial.L.shoveSpawn;
      Object.assign(game.player, { x: D.x + 120, y: D.y + 180, vx: 0, vy: 0 });
      for (let i = 0; i < 600 && !(game.tutorial.prompt && game.tutorial.timeScale() === 0); i++) game.update(1 / 60, idle());
      draw('the shove prompt');
    }
  }
  assert.ok(seen.has('✓'), 'a ✓ when a lesson is done');
  // No labels under the ghost thumbs any more: the thumbs show it.
  for (const label of ['SLIDE', 'AIM', 'FIRE', 'TAP', 'BACK OFF']) assert.ok(!seen.has(label), `"${label}" is drawn`);
  // Where a prompt's button is: the one it's for (with no SHOVE button, the right side, where a tap shoves).
  assert.deepEqual(promptSpot(L, 'reload', game.settings), { x: L.byId.reload.x, y: L.byId.reload.y, r: L.byId.reload.r });
  assert.deepEqual(promptSpot(L, 'shove', game.settings), { x: L.byId.shove.x, y: L.byId.shove.y, r: L.byId.shove.r });
  assert.equal(promptSpot(L, 'shove', { ...game.settings, shoveButton: false }).x, L.fixedAim.x);
  // Title screen: nothing drawn.
  texts.length = 0;
  drawTutorialHud(ctx, game, touchIn('touch'), { title: true }, L);
  assert.equal(texts.length, 0);
});

test('the line: one line, never cut short, at the top: between the health and gun panels once they are up (or under them on the smallest phones)', () => {
  // Text as wide as a bold face at the size set.
  const ctx = mockCtx((t, font) => String(t).length * parseFloat((/(\d+(?:\.\d+)?)px/.exec(font) || [0, 13])[1]) * 0.56);
  const kite = STEPS.findIndex((q) => q.id === 'kite');
  const lines = [];
  for (const [i, s] of STEPS.entries()) {
    if (s.intro) continue;
    for (const src of ['touch', 'mouse', 'gamepad']) {
      for (const t of [{ lunger: null }, { lunger: {}, shoved: false }, { lunger: {}, shoved: true }]) {
        const l = stepText(s, src, t, null);
        if (l) lines.push({ text: s.count ? `${l}   8/8` : l, panels: i >= kite });
      }
      for (const n of s.nudges || []) lines.push({ text: stepText(n, src), panels: i >= kite });
    }
  }
  for (const [w, h] of [[568, 320], [640, 360], [844, 390], [1024, 768]]) {
    const L = computeLayout(w, h, { l: 0, r: 0, t: 0, b: 0 }, DEFAULTS);
    for (const { text, panels } of lines) {
      for (const up of panels ? [true] : [false, true]) {
        const B = lineLayout(ctx, L, text, up);
        const what = `${w}x${h} "${text}"${up ? ' (panels up)' : ''}`;
        ctx.font = `800 ${B.size}px sans-serif`;
        assert.ok(B.size >= 13 && B.size <= 19, `${what}: ${B.size} px`);
        assert.ok(ctx.measureText(text).width <= B.w, `${what}: cut short`);
        assert.ok(B.x - B.w / 2 >= 8 && B.x + B.w / 2 <= w - 8, `${what}: off the screen`);
        assert.ok(B.y - B.h / 2 <= h * 0.3, `${what}: not at the top`);
        if (!up) continue;
        const between = B.x - B.w / 2 >= L.hp.x + L.hp.w && B.x + B.w / 2 <= L.byId.swap.x;
        const under = B.y - B.h / 2 >= L.hp.y + L.hp.h;
        assert.ok(between || under, `${what}: on top of a panel`);
        if (w >= 640 && panels) assert.ok(between, `${what}: room enough between the panels`);
      }
    }
  }
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
  let minMag = Infinity;
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
      f.move = walkTo(t.x, t.y - 100);
    } else if (s === 'saferoom') {
      // Run for it (and shove off any that catch up).
      const t = T.arrow();
      if (t) f.move = walkTo(t.x, t.y);
      const z = nearest(T.group);
      if (z && Math.hypot(z.x - p.x, z.y - p.y) < 55 && evT <= 0) {
        f.events.push('shove');
        evT = 0.5;
      }
    } else if (s === 'reload') {
      // The world has stopped for ⟳: tap it.
      if (T.prompt && evT <= 0) {
        f.events.push('reload');
        evT = 0.5;
      }
    } else if (s === 'shove') {
      minMag = Math.min(minMag, p.weapon.reloading ? p.weapon.cap : p.weapon.mag);
      if (!T.lunger) f.move = walkTo(T.arrow().x, T.arrow().y); // along the street, by the door
      else if (!T.shoved) {
        // Tap SHOVE as soon as it's asked for (the tap waits until it can land).
        if (T.prompt && evT <= 0) {
          f.events.push('shove');
          evT = 0.5;
        }
      } else fight([T.lunger], false);
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
  assert.ok(game.stats.shoveHits >= 1 && game.stats.kills >= 16, `${game.stats.shoveHits} shoves, ${game.stats.kills} kills`);
  assert.ok(minMag > 0, 'nothing emptied the gun for the shove lesson');
  assert.deepEqual(T.nudges, {}, 'played right: never told off');
});
