// Tutorial 2, Day 2: the course (one walk, left to right all the way, gates,
// finds off the way, a room nailed shut, the secret; no Witch), the lessons at
// run time (in order, the crates, the boards and what the noise brings, the
// secret), the coaching on a phone, the report, what the device remembers, and
// a bot that plays it to the safe room through the real game loop.
// (node --test runs each file in its own process, so the fake DOM globals and
// the seeded Math.random stay here.)
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
let bad = null;
const COORD = new Set(['moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'fillRect', 'strokeRect', 'fillText', 'arcTo']);
const texts = [];
const placed = []; // [text, x, y] of every fillText
function mockCtx() {
  const t = { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', lineCap: 'butt', textAlign: 'left', textBaseline: 'top' };
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 7 });
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
Math.random = mulberry32(20201123); // the zombies' wandering and aim spread: the same every run of this file

const { Game, GENERATORS } = await import('../src/game/game.js');
const { DEFAULTS, LEVELS } = await import('../src/settings.js');
const { generateTutorial2, DAY2_BEN, TUT2_W, TUT2_H } = await import('../src/world/tutorial2-gen.js');
const { STEPS: DAY1, COURSES, TUTORIAL_LEVELS, stepText, tutorialDone, saveTutorialDone } = await import('../src/game/tutorial.js');
const { DAY2_STEPS } = await import('../src/game/tutorial-day2.js');
const { World, FlowField, NAV_CELL } = await import('../src/world/world.js');
const { damageBoards } = await import('../src/game/loot.js');
const { hasModel } = await import('../src/render/models.js');
const { computeLayout } = await import('../src/layout.js');
const { drawTutorialHud, drawTutorialBright } = await import('../src/render/tutorial-render.js');
const { PROMPT_IN } = await import('../src/game/tutorial.js');
const { buildReport, reportText } = await import('../src/playtest.js');

const INF = 0x3fffffff;
const audio = new Proxy({ listener: { x: 0, y: 0 } }, { get: (o, k) => (k in o ? o[k] : () => {}) });
const LESSONS2 = DAY2_STEPS.filter((s) => s.dot).length;

function make(over = {}) {
  const game = new Game({ ...DEFAULTS, level: 'tutorial2', playtestPrompt: false, ...over }, audio, () => {});
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
    const search = (cid) => {
      const c = T.crate(cid);
      Object.assign(p, { x: c.x, y: c.y, vx: 0, vy: 0 });
      run(game, 1.5);
    };
    if (s === 'supplies') search(T.L.crates.door);
    else if (s === 'chalk') search(T.L.crates.yard);
    else if (s === 'gate1' || s === 'gate2') {
      run(game, 1.3); // the bars slide away
      const G = T.L.gates[s === 'gate1' ? 'g1' : 'g2'];
      Object.assign(p, { x: G.x, y: G.y - 80 });
    } else if (s === 'boards') damageBoards(game, T.L.boards, 999, 0, -1);
    else if (s === 'goodstuff') {
      kill(T.group.concat(T.extra));
      search(T.L.crates.room);
    } else if (s === 'secret') search(T.L.crates.secret);
    run(game, 1 / 30);
  }
  assert.equal(T.step.id, id);
}

/** The course as a body walks it: gates shut (their bars block) or open; boards in place or broken. */
function walker(map, open) {
  const obstacles = map.obstacles.filter((o) => !(open && (o.opens || o.boards))).map((o) => (o.opens ? { ...o, navOpen: false } : o));
  const world = new World({ ...map, obstacles, sealed: [] }, { strict: true });
  const f = new FlowField(world);
  f.compute(map.start.x, map.start.y);
  return { world, f };
}

// --- The course ---------------------------------------------------------------------------

test('Day 2: a level of its own, right after Day 1 on the title card and in the panel, hand-built, the same on every seed', () => {
  assert.deepEqual(TUTORIAL_LEVELS, ['tutorial', 'tutorial2']);
  assert.deepEqual(LEVELS.slice(0, 2).map((l) => l.id), TUTORIAL_LEVELS);
  assert.equal(GENERATORS.tutorial2, generateTutorial2);
  assert.equal(COURSES[1], DAY1);
  assert.equal(COURSES[2], DAY2_STEPS);
  const a = generateTutorial2(1);
  const b = generateTutorial2(987654);
  // (The boards and their room point at each other: write the room out once.)
  const json = (m) => JSON.stringify({ ...m, seed: 0 }, (k, v) => (k === 'sealed' && v && v.boards ? undefined : v));
  assert.equal(json(a), json(b), 'every player gets the same course');
  assert.equal(a.tutorial.day, 2);
  assert.ok(!a.theme, 'the streets look');
  assert.equal(a.w, TUT2_W);
  assert.equal(a.h, TUT2_H);
  assert.equal(a.w % NAV_CELL, 0);
  assert.equal(a.h % NAV_CELL, 0);
  assert.deepEqual(generateTutorial2(1).streets, a.streets, 'the plan is never moved twice');
  for (const o of a.obstacles) {
    if (o.kind === 'border') continue;
    assert.ok(hasModel(o.kind), `${o.kind} has a model`);
    assert.ok(o.x >= 0 && o.y >= 0 && o.x + o.w <= a.w && o.y + o.h <= a.h, `${o.kind} at ${o.x},${o.y} is on the map`);
  }
  assert.equal(a.startFacing, 0, 'out of the door, east');
  assert.deepEqual(a.witches, [], "no Witch: she won't be on by default");
});

test('one short walk past every lesson to the safe room, through the gates and only through them; the nailed room opens off it', () => {
  const map = generateTutorial2(1);
  const T = map.tutorial;
  const er = map.endRoom.interior;
  const goal = { x: er.x + er.w / 2, y: er.y + er.h / 2 };
  const open = walker(map, true);
  const d = open.f.pathDist(goal.x, goal.y);
  assert.ok(Number.isFinite(d) && d > 3000 && d < 4200, `the walk is ${Math.round(d)} u`);
  for (const s of map.stashes) assert.ok(Number.isFinite(open.f.pathDist(s.x, s.y)), `stash ${s.id} can be walked to`);
  for (const q of T.companySpawns.flat()) assert.ok(Number.isFinite(open.f.pathDist(q.x, q.y)));
  // Everything a body can stand on is part of the walk (with the boards down).
  let pocket = 0;
  const c = { x: 0, y: 0 };
  for (let i = 0; i < open.world.blocked.length; i++) {
    if (open.world.blocked[i] || open.f.dist[i] < INF) continue;
    pocket++;
  }
  assert.equal(pocket, 0, 'nowhere to get stuck');
  // Shut gates, boards in place: the first street and its yard, no further.
  const shut = walker(map, false);
  for (const id of [1, 2]) {
    const s = map.stashes.find((q) => q.id === id);
    assert.ok(Number.isFinite(shut.f.pathDist(s.x, s.y)), 'the first two crates are on row 1');
  }
  for (const q of [map.stashes.find((s) => s.tier === 'room'), map.stashes.find((s) => s.tier === 'secret'), goal]) {
    assert.equal(shut.f.pathDist(q.x, q.y), Infinity, 'a shut gate is shut');
  }
  // The room: one doorway, boards across it (they stop bodies and bullets, not the flow field), three inside.
  const room = map.sealed[0];
  assert.equal(map.sealed.length, 1);
  assert.equal(room.boards, T.boards);
  assert.ok(T.boards.boards && T.boards.navOpen && T.boards.move && T.boards.shot && T.boards.hp === T.boards.maxHp);
  assert.equal(room.sleepers.length, 3);
  for (const q of room.sleepers) assert.ok(pointInRect(q.x, q.y, room.interior, -12));
  const roomCrate = map.stashes.find((s) => s.tier === 'room');
  assert.ok(pointInRect(roomCrate.x, roomCrate.y, room.interior));
  for (const G of Object.values(T.gates)) assert.ok(G.bars.navOpen && G.bars.opens && !G.bars.shot);
});

test('buildings: no slivers, no overlaps, and the town goes on past the edge of the screen', () => {
  const map = generateTutorial2(1);
  const buildings = map.obstacles.filter((o) => o.kind === 'building');
  assert.ok(buildings.length > 80);
  for (const b of buildings) assert.ok(Math.min(b.w, b.h) >= 40, `a ${b.w} x ${b.h} building`);
  for (let i = 0; i < buildings.length; i++) for (let j = i + 1; j < buildings.length; j++) assert.ok(!rectsOverlap(buildings[i], buildings[j], -0.5), 'two buildings in one place');
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

test("what's off the way: a crate at the door, chalk to one round a corner, the better stash nailed in, and the secret (with two little eyes on it)", () => {
  const map = generateTutorial2(1);
  const T = map.tutorial;
  const by = (id) => map.stashes.find((s) => s.id === id);
  assert.deepEqual(map.stashes.map((s) => s.tier).sort(), ['room', 'secret', 'stash', 'stash']);
  const door = by(T.crates.door);
  const yard = by(T.crates.yard);
  assert.deepEqual(door.loot, ['armor']);
  assert.deepEqual(yard.loot, ['hot']);
  assert.deepEqual(by(T.crates.room).loot, ['extmags']);
  assert.equal(by(T.crates.secret).look, 'manhole');
  // The door crate is a few steps out of the door; the yard crate is off the screen from the street.
  assert.ok(Math.hypot(door.x - map.start.x, door.y - map.start.y) < 320);
  const street = map.streets[0];
  assert.ok(Math.abs(yard.y - (street.y + street.h / 2)) > 240, 'round the corner, out of sight from the street');
  // The chalk: a trail of arrows, each pointing at the next, the last at the crate.
  const chalk = map.decor.filter((d) => d.type === 'chalk');
  assert.ok(chalk.length >= 3);
  for (let i = 0; i < chalk.length; i++) {
    const n = chalk[i + 1] || yard;
    const a = Math.atan2(n.y - chalk[i].y, n.x - chalk[i].x);
    assert.ok(Math.abs(Math.atan2(Math.sin(a - chalk[i].a), Math.cos(a - chalk[i].a))) < 0.01, `arrow ${i} points on`);
  }
  // Ben's eyes look at the secret.
  const eyes = map.decor.find((d) => d.type === 'beneyes');
  const s = by(T.crates.secret);
  assert.ok(eyes && Math.hypot(eyes.x - s.x, eyes.y - s.y) < 140);
  assert.ok(Math.abs(Math.atan2(s.y - eyes.y, s.x - eyes.x) - eyes.look) < 1e-9);
});

test('left to right all the way: from the start room to the safe room the walk never turns back west', () => {
  const map = generateTutorial2(1);
  const er = map.endRoom.interior;
  const goal = { x: er.x + er.w / 2, y: er.y + er.h / 2 };
  const sr = map.startRoom.interior;
  assert.ok(sr.x + sr.w < map.w / 3 && sr.y > map.h / 2, 'the start room is bottom left');
  assert.ok(er.x > (map.w * 2) / 3 && er.y + er.h < map.h / 3, 'the safe room is top right');
  // Each street starts where the connector up from the last one comes in, and runs east.
  const [S1, S2, S3, C1, C2, C3] = map.streets;
  for (const [row, up] of [[S1, C1], [S2, C2], [S3, C3]]) assert.ok(up.x > row.x + row.w / 2, 'the way up is at the east end of the row');
  for (const [up, row] of [[C1, S2], [C2, S3]]) assert.ok(Math.abs(up.x - 22 - row.x) < 1, 'and the next row starts there');
  // Walk it: down the goal field from the start, with the gates open and the boards down.
  const { world } = walker(map, true);
  const f = new FlowField(world);
  f.compute(goal.x, goal.y);
  const q = { ...map.start };
  const dir = { x: 0, y: 0 };
  let maxX = q.x;
  let steps = 0;
  for (; steps < 2000 && Math.hypot(q.x - goal.x, q.y - goal.y) > 40; steps++) {
    if (!f.dirAt(q.x, q.y, dir)) break;
    q.x += dir.x * 8;
    q.y += dir.y * 8;
    maxX = Math.max(maxX, q.x);
    assert.ok(q.x > maxX - 40, `turned back west at ${Math.round(q.x)},${Math.round(q.y)}`);
  }
  assert.ok(Math.hypot(q.x - goal.x, q.y - goal.y) <= 40, 'got there');
});

test("next to nothing to read on the way: the chalk arrows (the lesson), no writing on the streets, no painted words, no cars; Ben's one line at the end", () => {
  const map = generateTutorial2(1);
  const words = map.decor.filter((d) => d.text);
  assert.deepEqual(words.map((d) => d.type), ['bentext'], 'one line, in his crayon');
  assert.equal(words[0].text, DAY2_BEN.text);
  assert.ok(pointInRect(words[0].x, words[0].y, map.endRoom.interior), 'in the safe room at the end');
  assert.ok(!map.decor.some((d) => /CRYING|HER\b|WITCH/i.test(d.text || '')), 'no warnings about someone who is not there');
  assert.equal(map.decor.filter((d) => d.type === 'chalk').length, 4, 'the trail of chalk arrows: the lesson itself');
  assert.equal(map.obstacles.filter((o) => o.kind === 'car').length, 0, 'no cars to wonder about');
  assert.ok(map.decor.filter((d) => ['puddle', 'crack', 'trash', 'manhole'].includes(d.type)).length <= 17, 'a little clutter, no more');
});

// --- At run time ---------------------------------------------------------------------------

test('a run: Day 2 lessons, three shut in with the good stuff, no Witch, no teammate, and the director stands back', () => {
  const game = make({ ally: true, specials: true, nightTerror: true, wanderers: 10, hordeSize: 10, witch: true });
  const T = game.tutorial;
  assert.ok(T);
  assert.equal(T.day, 2);
  assert.equal(T.steps, DAY2_STEPS);
  assert.equal(T.step.id, 'supplies');
  assert.equal(T.of, LESSONS2);
  assert.equal(game.ally, null);
  assert.ok(game.director.scripted);
  assert.equal(T.sleepers.length, 3);
  assert.ok(T.sleepers.every((z) => z.state === 'idle'));
  assert.equal(game.witches.length, 0, 'no Witch, whatever the panel says');
  assert.equal(game.zombies.filter((z) => z.type === 'common').length, 3, 'no wanderers');
  assert.equal(game.dailyKey, null);
  assert.deepEqual(game.locks, { swap: true }, 'one gun');
  run(game, 30);
  assert.equal(game.zombies.filter((z) => z.type === 'common').length, 3);
  assert.equal(game.stats.hordes, 0);
});

test('every Day 2 lesson can be done (by hand), in order, and the safe room ends it: Day 2 is remembered on its own', () => {
  store.clear();
  saveTutorialDone(60, 1);
  const game = make();
  const T = game.tutorial;
  const seen = [];
  for (const s of DAY2_STEPS) {
    skipTo(game, s.id);
    seen.push(T.step.id);
  }
  assert.deepEqual(seen, DAY2_STEPS.map((s) => s.id));
  const er = game.world.map.endRoom.interior;
  run(game, 1.3);
  Object.assign(game.player, { x: er.x + er.w / 2, y: er.y + er.h / 2 });
  run(game, 1);
  assert.equal(game.won, true);
  assert.equal(T.over, true);
  assert.equal(T.lessonsDone, LESSONS2);
  assert.equal(tutorialDone(2), true);
  assert.equal(tutorialDone(1), true, 'Day 1 stays done');
  for (const G of Object.values(T.gates)) assert.equal(G.state, 'open');
  assert.equal(game.stats.stashes, 2);
  assert.equal(game.stats.rooms, 1);
});

test('done on this device, per day: Day 2 has a flag of its own, and a broken store never throws', () => {
  store.clear();
  assert.equal(tutorialDone(1), false);
  assert.equal(tutorialDone(2), false);
  saveTutorialDone(90.04, 2);
  assert.equal(tutorialDone(2), true);
  assert.equal(tutorialDone(1), false);
  assert.equal(JSON.parse(store.get('funland2.p0.tutorial2.v1')).time, 90);
  store.set('funland2.p0.tutorial2.v1', '{not json');
  assert.equal(tutorialDone(2), false);
});

test('the crates: stand on one and it opens (armor, then hot rounds); the yard crate opens gate 1', () => {
  const game = make();
  const T = game.tutorial;
  const p = game.player;
  const door = T.crate(T.L.crates.door);
  Object.assign(p, { x: door.x, y: door.y });
  run(game, 0.4);
  assert.equal(door.opened, false, 'it takes a moment');
  run(game, 0.6);
  assert.equal(door.opened, true);
  assert.ok(p.armor >= 50, 'armor on');
  run(game, 0.7);
  assert.equal(T.step.id, 'chalk');
  assert.equal(T.gates.g1.state, 'shut');
  const yard = T.crate(T.L.crates.yard);
  Object.assign(p, { x: yard.x, y: yard.y });
  run(game, 1);
  assert.equal(yard.opened, true);
  assert.ok(p.hot >= 60, 'hot rounds');
  assert.notEqual(T.gates.g1.state, 'shut');
});

test('breaking in: SHOVE comes in lit at the boards, the world waits for the first shove, three of them (counted), the three inside wake, and the noise brings three more from out of sight', () => {
  const game = make();
  const T = game.tutorial;
  const p = game.player;
  skipTo(game, 'boards');
  const b = T.L.boards;
  assert.deepEqual(T.hud(), { shove: 0, reload: 0, all: 0 }, 'the sticks alone on the way (the HUD a part at a time, as on Day 1)');
  assert.equal(T.view('touch').text, null, 'no words on the way: the arrow and the ring say it');
  assert.equal(T.view('touch').count, null);
  assert.equal(T.prompt, null, 'nothing lit while you walk up');
  // A step off and facing away: SHOVE lit, the world going on (a shove from here would miss; right up against them, any way you face lands).
  Object.assign(p, { x: b.x + b.w / 2, y: b.y + b.h + 34, vx: 0, vy: 0 });
  p.facing = p.aimAngle = p.fireAngle = Math.PI / 2;
  run(game, PROMPT_IN + 0.05, () => ({ ...idle(), aimActive: true, aimX: 0, aimY: 1, aimRaw: 0.3 }));
  assert.ok(T.prompt && T.prompt.kind === 'shove' && !T.prompt.stop, 'SHOVE lit');
  assert.equal(T.timeScale(), 1, 'the world goes on while a shove would miss');
  assert.ok(T.hud().shove > 0 && T.hud().reload === 0 && T.hud().all === 0, 'SHOVE alone comes in');
  assert.equal(T.view('touch').text, 'Tap SHOVE to break in.');
  assert.equal(T.view('mouse').text, 'Press Space to break in.');
  assert.equal(T.view('touch').count, '0/3');
  // Facing them: a shove would land, and the world stops for it (only a shove gets through).
  p.facing = p.aimAngle = p.fireAngle = -Math.PI / 2;
  run(game, PROMPT_IN + 0.05);
  assert.equal(T.prompt.stop, true);
  assert.equal(T.timeScale(), 0, 'the world waits');
  game.update(1 / 60, idle(['reload', 'swap']));
  assert.equal(b.hp, b.maxHp);
  const born = [];
  const spawnAt = game.director.spawnAt.bind(game.director);
  game.director.spawnAt = (x, y, aware) => {
    // Seen: on screen, and close or in plain view (Tutorial.unseen's rule, the other way round).
    born.push({ x, y, seen: game.onScreen(x, y, 40) && (Math.hypot(x - p.x, y - p.y) <= 380 || game.world.segmentClear(p.x, p.y, x, y)) });
    return spawnAt(x, y, aware);
  };
  for (let k = 1; k <= 3; k++) {
    game.update(1 / 60, idle(['shove']));
    p.facing = p.aimAngle = p.fireAngle = -Math.PI / 2;
    if (k < 3) assert.equal(T.view('touch').count, `${k}/3`);
    if (k === 1) assert.equal(T.prompt.stop, false, 'hit once: the world goes on, SHOVE still lit');
    run(game, 0.7, () => ({ ...idle(), move: { x: 0, y: 0 } }));
    if (k === 1) assert.equal(T.timeScale(), 1);
  }
  assert.equal(b.broken, true, 'three shoves');
  assert.ok(T.sleepers.every((z) => z.state !== 'idle'), 'what was shut in is coming out');
  run(game, 2);
  assert.equal(T.step.id, 'goodstuff');
  assert.equal(born.length, 3, 'three more down the street');
  assert.ok(born.every((q) => !q.seen), 'from out of sight');
  assert.equal(T.group.length, 6);
  assert.match(T.view('touch').count, /^\d\/6$/);
  assert.deepEqual(T.hud(), { shove: 1, reload: 1, all: 1 }, 'and for the fight, all of the HUD');
  // Not done until they're all down and the crate inside is searched.
  for (const z of T.group) z.alive = false;
  run(game, 0.2);
  assert.equal(T.step.id, 'goodstuff');
  assert.ok(T.arrow() && T.arrow().label === 'CRATE', 'then the arrow shows the crate');
  const c = T.crate(T.L.crates.room);
  Object.assign(p, { x: c.x, y: c.y });
  run(game, 1.2);
  assert.ok(c.opened && p.magMult > 1, 'extended mags');
  assert.notEqual(T.gates.g2.state, 'shut');
});

test('the secret: a glint down a dead end (the arrow says GLINT, no ring), the best stuff, and the last gate opens', () => {
  const game = make();
  const T = game.tutorial;
  const p = game.player;
  skipTo(game, 'secret');
  const c = T.crate(T.L.crates.secret);
  assert.equal(c.tier, 'secret');
  assert.equal(c.look, 'manhole');
  const a = T.arrow();
  assert.ok(a && a.label === 'GLINT' && !a.ring, 'pointed at, not ringed: the glint is the thing to look for');
  assert.ok(!pointInRect(c.x, c.y, game.world.map.streets[2]), 'off the street, down its dead end');
  const hp = p.maxHp;
  Object.assign(p, { x: c.x, y: c.y, vx: 0, vy: 0 });
  run(game, 0.9);
  assert.equal(c.opened, false, 'a secret takes a little longer to open');
  run(game, 0.6);
  assert.equal(c.opened, true);
  assert.equal(game.stats.secrets, 1);
  assert.equal(p.maxHp, hp + 25, '+25 max HP');
  assert.ok(p.armor >= 100 && p.hot >= 150, 'full armor, hot rounds');
  assert.ok(game.messages.some((m) => m.text === 'SECRET STASH!'));
  run(game, 1.5);
  assert.notEqual(T.gates.g3.state, 'shut');
  assert.equal(T.step.id, 'saferoom');
});

test('doing Day 2 wrong: lost on the chalk, shoving the boards from too far off, never tapping SHOVE when the world waits for it, lost on the secret: each gets a nudge', () => {
  const touch = (o = {}) => ({ ...idle(), source: 'touch', thumbs: { left: false, right: false }, ...o });
  let game = make();
  skipTo(game, 'chalk');
  run(game, 12.5, touch());
  assert.equal(game.tutorial.nudge && game.tutorial.nudge.key, 'chalk.lost');
  assert.equal(game.tutorial.view('touch').text, 'Look for white arrows.');
  game = make();
  skipTo(game, 'boards');
  const p = game.player;
  Object.assign(p, { x: game.tutorial.L.boards.x + 37, y: game.tutorial.L.boards.y + 200 }); // well off
  game.update(1 / 60, touch({ events: ['shove'] }));
  run(game, 0.7, touch());
  game.update(1 / 60, touch({ events: ['shove'] }));
  assert.equal(game.tutorial.nudge && game.tutorial.nudge.key, 'boards.too-far');
  assert.equal(game.tutorial.view('touch').text, 'Get right up to them.');
  // Stopped at the boards for SHOVE, and never tapping it.
  game = make();
  skipTo(game, 'boards');
  const b = game.tutorial.L.boards;
  Object.assign(game.player, { x: b.x + b.w / 2, y: b.y + b.h + 16, vx: 0, vy: 0 });
  run(game, 5.5, touch());
  assert.equal(game.tutorial.timeScale(), 0);
  assert.equal(game.tutorial.nudge && game.tutorial.nudge.key, 'boards.no-shove');
  assert.equal(game.tutorial.view('touch').text, 'Tap the SHOVE button.');
  game = make();
  skipTo(game, 'secret');
  run(game, 10.5, touch());
  assert.equal(game.tutorial.nudge && game.tutorial.nudge.key, 'secret.lost');
  assert.match(reportText(buildReport(game)), /Tutorial nudges: secret\.lost/);
});

test('the words: one short line or none (touch, mouse, pad), and the coaching draws at every Day 2 lesson without a bad number, words only at the top', () => {
  // (The lines that go with how far a lesson has got: the fight, then the crate; the boards on the way, then lit.)
  const at = (o) => ({ spawned: () => true, cleared: () => true, group: [], prompt: null, ...o });
  const states = [at({}), at({ spawned: () => false, cleared: () => false }), at({ prompt: { kind: 'shove' } }), at({ prompt: null })];
  for (const s of DAY2_STEPS) {
    for (const src of ['touch', 'mouse', 'gamepad']) {
      for (const t of states) {
        const line = stepText(s, src, t, null);
        if (line !== null) assert.ok(line.length <= 28, `${s.id} (${src}): "${line}" (${line.length})`);
      }
      for (const n of s.nudges || []) assert.ok(stepText(n, src).length <= 28, `${s.id}.${n.id} (${src})`);
    }
    assert.ok(s.title && s.title === s.title.toUpperCase());
  }
  // No words where the arrow says it all: the gates, and the walk to the boards.
  for (const id of ['gate1', 'gate2']) assert.equal(stepText(DAY2_STEPS.find((q) => q.id === id), 'touch'), null);
  const boards = DAY2_STEPS.find((q) => q.id === 'boards');
  assert.equal(stepText(boards, 'touch', states[3]), null);
  // Up at them, lit: tap SHOVE on a phone, Space with a mouse, RB with a pad.
  assert.ok(/tap SHOVE/i.test(stepText(boards, 'touch', states[2])) && /space/i.test(stepText(boards, 'mouse', states[2])) && /RB/.test(stepText(boards, 'gamepad', states[2])));
  const ctx = mockCtx();
  for (const [w, h] of [[844, 390], [640, 360], [568, 320]]) {
    const game = make();
    game.setViewport(w, h);
    const L = computeLayout(w, h, { l: 0, r: 0, t: 0, b: 0 }, game.settings);
    const R = { ctx, v: game.view, ground() {}, reset() {} };
    for (const s of DAY2_STEPS) {
      skipTo(game, s.id);
      if (s.id === 'boards') {
        // Up at them, SHOVE lit.
        const b = game.tutorial.L.boards;
        Object.assign(game.player, { x: b.x + b.w / 2, y: b.y + b.h + 16, vx: 0, vy: 0 });
        run(game, 0.3);
        assert.ok(game.tutorial.prompt);
      }
      for (const src of ['touch', 'mouse', 'gamepad']) {
        texts.length = 0;
        placed.length = 0;
        bad = null;
        const input = { source: src, touch: { move: { active: false }, aim: { active: false, crossedFire: false }, pressed: new Map() } };
        drawTutorialHud(ctx, game, input, { title: false, forceSticks: false }, L);
        drawTutorialBright(R, game, game.viewRect(40));
        assert.equal(bad, null, `${w}x${h} ${s.id} (${src}): ${bad}`);
        for (const [t, , y] of placed) assert.ok(y < h * 0.3, `${w}x${h} ${s.id} (${src}): "${t}" at y ${Math.round(y)}`);
        const v = game.tutorial.view(src === 'touch' ? 'touch' : src);
        if (v.text) assert.ok(texts.includes(v.text), `${w}x${h} ${s.id} (${src}): the line says "${v.text}"`);
      }
    }
  }
});

test('the report: a "Tutorial 2" line with the lessons', () => {
  const game = make();
  skipTo(game, 'secret');
  const r = buildReport(game);
  assert.equal(r.level, 'tutorial2');
  assert.equal(r.tutorial.day, 2);
  assert.equal(r.tutorial.of, LESSONS2);
  assert.equal(r.tutorial.step, 'secret');
  assert.match(reportText(r), /Tutorial 2: \d+\/\d+ lessons, reached "secret"/);
});

// --- A bot plays it ------------------------------------------------------------------------

test('a bot gets through Day 2 to the safe room through the real game loop: finds, breaks in, fights, finds the secret', () => {
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
  const walkTo = (x, y, near = 12) => {
    if (Math.hypot(x - p.x, y - p.y) < near) return { x: 0, y: 0 };
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
  let stops = 0;
  for (let i = 0; i < 60 * 300 && !game.won; i++) {
    const s = T.step.id;
    if (order[order.length - 1] !== s) order.push(s);
    const f = idle([]);
    evT -= 1 / 60;
    const fight = (list) => {
      const z = nearest(list);
      if (!z) return false;
      const a = screen(z.x - p.x, z.y - p.y);
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      const clear = game.world.segmentClear(p.x, p.y, z.x, z.y, game.world.shotBlockers);
      Object.assign(f, { aimActive: true, aimX: a.x, aimY: a.y, aimRaw: 1, fire: clear && d < p.weapon.def.range * 0.9 });
      if (d < 55 && evT <= 0) {
        f.events.push('shove');
        evT = 0.5;
      }
      if (d > p.weapon.def.range * 0.8 || !clear) f.move = walkTo(z.x, z.y);
      return true;
    };
    const t = T.arrow();
    if (T.pause > 0) {
      // reading the ✓
    } else if (s === 'gate1' || s === 'gate2') f.move = walkTo(t.x, t.y - 60);
    else if (s === 'boards') {
      const b = T.L.boards;
      const at = { x: b.x + b.w / 2, y: b.y + b.h + 16 };
      if (T.prompt && T.prompt.stop && T.timeScale() === 0) {
        // The world has stopped for SHOVE: tap it.
        stops++;
        if (evT <= 0) {
          f.events.push('shove');
          evT = 0.65;
        }
      } else if (Math.hypot(at.x - p.x, at.y - p.y) > 14) f.move = walkTo(at.x, at.y, 4);
      else {
        f.move = screen(0, -1); // lean on the door: facing it
        if (evT <= 0) {
          f.events.push('shove');
          evT = 0.65;
        }
      }
    } else if (s === 'goodstuff') {
      if (!fight(T.group.concat(T.extra)) && t) f.move = walkTo(t.x, t.y, 6);
    } else if (t) f.move = walkTo(t.x, t.y, 6); // the crates, the secret, the safe room
    game.update(1 / 60, f);
  }
  run(game, 1);
  assert.equal(game.won, true, `stuck at "${T.step.id}" after ${game.stats.time.toFixed(0)} s`);
  assert.equal(game.lost, false);
  assert.deepEqual(order, DAY2_STEPS.map((q) => q.id), 'every lesson, in order');
  assert.equal(T.lessonsDone, LESSONS2);
  assert.ok(game.stats.time < 100, `${game.stats.time.toFixed(0)} s for a bot`);
  assert.equal(tutorialDone(2), true);
  assert.equal(p.weapon.def.id, 'smg', 'one gun, all the way');
  assert.equal(game.stats.stashes, 2);
  assert.equal(game.stats.rooms, 1);
  assert.equal(game.stats.boards, 1);
  assert.ok(game.stats.kills >= 6, `${game.stats.kills} kills`);
  assert.equal(game.stats.secrets, 1, 'and the secret');
  assert.ok(stops > 0, 'the world stopped for the first shove at the boards');
  assert.deepEqual(T.nudges, {}, 'played right: never told off');
});
