// Tutorial 3, Day 3: the Hunter. The course (one walk, left to right, gates,
// the alleys and the doorway they come out of, room to leap), the lessons at
// run time (knocked out of the air with the world slowed and stopped, the
// ambush and breaking free, one on your own, the medkit), the coaching on a
// phone, the nudges, the report, what the device remembers, and a bot that
// plays it to the safe room through the real game loop.
// (node --test runs each file in its own process, so the fake DOM globals and
// the seeded Math.random stay here.)
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
let bad = null;
const COORD = new Set(['moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'fillRect', 'strokeRect', 'fillText', 'arcTo', 'drawImage']);
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
Math.random = mulberry32(20201124); // the Hunters' circling and the aim spread: the same every run of this file

const { Game, GENERATORS } = await import('../src/game/game.js');
const { DEFAULTS, LEVELS } = await import('../src/settings.js');
const { generateTutorial3, DAY3_BEN, TUT3_W, TUT3_H } = await import('../src/world/tutorial3-gen.js');
const { COURSES, TUTORIAL_LEVELS, PROMPT_IN, PROMPT_OUT, stepText, tutorialDone, saveTutorialDone } = await import('../src/game/tutorial.js');
const { DAY3_STEPS } = await import('../src/game/tutorial-day3.js');
const { HUNTER, releasePin } = await import('../src/game/specials.js');
const { World, FlowField, NAV_CELL } = await import('../src/world/world.js');
const { hasModel } = await import('../src/render/models.js');
const { computeLayout } = await import('../src/layout.js');
const { drawTutorialHud, drawTutorialBright } = await import('../src/render/tutorial-render.js');
const { buildReport, reportText } = await import('../src/playtest.js');

const INF = 0x3fffffff;
const audio = new Proxy({ listener: { x: 0, y: 0 } }, { get: (o, k) => (k in o ? o[k] : () => {}) });
const LESSONS3 = DAY3_STEPS.filter((s) => s.dot).length;

function make(over = {}) {
  const game = new Game({ ...DEFAULTS, level: 'tutorial3', playtestPrompt: false, ...over }, audio, () => {});
  game.setViewport(844, 390);
  return game;
}
const idle = (events = []) => ({ source: 'gamepad', move: { x: 0, y: 0 }, aimActive: false, aimX: 1, aimY: 0, aimRaw: 0, aimScreen: null, fire: false, assist: true, events });
const run = (game, secs, f = idle) => {
  for (let i = 0; i < Math.round(secs * 60); i++) game.update(1 / 60, typeof f === 'function' ? f() : f);
};
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
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
    if (s === 'hunter') {
      // Out on the street: out it comes; knocked down and shot (by hand).
      Object.assign(p, { x: T.L.hunter1Walk.x, y: T.L.hunter1Walk.y, vx: 0, vy: 0 });
      run(game, 1 / 30);
      if (T.h) {
        T.knocked = true;
        T.answer();
        T.h.alive = false;
      }
    } else if (s === 'gate1' || s === 'gate2') {
      run(game, 1.3); // the bars slide away
      const G = T.L.gates[s === 'gate1' ? 'g1' : 'g2'];
      Object.assign(p, { x: G.x, y: G.y - 80 });
    } else if (s === 'pin') {
      Object.assign(p, { x: T.L.ambushWalk.x, y: T.L.ambushWalk.y, vx: 0, vy: 0 });
      run(game, 1 / 30);
      if (p.pinnedBy) releasePin(game);
      if (T.h) {
        T.freed = true;
        T.h.alive = false;
      }
    } else if (s === 'alone') T.h.alive = false;
    else if (s === 'heal') Object.assign(p, { x: T.L.medkit.x, y: T.L.medkit.y, hp: p.maxHp });
    run(game, 1 / 30);
  }
  assert.equal(T.step.id, id);
}

/** The course as a body walks it: gates shut (their bars block) or open. */
function walker(map, open) {
  const obstacles = map.obstacles.filter((o) => !(open && o.opens)).map((o) => (o.opens ? { ...o, navOpen: false } : o));
  const world = new World({ ...map, obstacles, sealed: [] }, { strict: true });
  const f = new FlowField(world);
  f.compute(map.start.x, map.start.y);
  return { world, f };
}

/** A body-wide lane (as a Hunter needs to leap: game/specials.js clearLane). */
function lane(world, a, b, r = 11) {
  const d = gap(a, b) || 1;
  const nx = (-(b.y - a.y) / d) * r * 0.8;
  const ny = ((b.x - a.x) / d) * r * 0.8;
  const L = world.moveBlockers;
  return world.segmentClear(a.x, a.y, b.x, b.y, L) && world.segmentClear(a.x + nx, a.y + ny, b.x + nx, b.y + ny, L) && world.segmentClear(a.x - nx, a.y - ny, b.x - nx, b.y - ny, L);
}

// --- The course ---------------------------------------------------------------------------

test('Day 3: a level of its own, right after Day 2 on the title card and in the panel, hand-built, the same on every seed', () => {
  assert.deepEqual(TUTORIAL_LEVELS, ['tutorial', 'tutorial2', 'tutorial3']);
  assert.deepEqual(LEVELS.slice(0, 3).map((l) => l.id), TUTORIAL_LEVELS);
  assert.equal(GENERATORS.tutorial3, generateTutorial3);
  assert.equal(COURSES[3], DAY3_STEPS);
  const a = generateTutorial3(1);
  const b = generateTutorial3(987654);
  assert.equal(JSON.stringify({ ...a, seed: 0 }), JSON.stringify({ ...b, seed: 0 }), 'every player gets the same course');
  assert.equal(a.tutorial.day, 3);
  assert.equal(a.w, TUT3_W);
  assert.equal(a.h, TUT3_H);
  assert.equal(a.w % NAV_CELL, 0);
  assert.equal(a.h % NAV_CELL, 0);
  for (const o of a.obstacles) {
    if (o.kind === 'border') continue;
    assert.ok(hasModel(o.kind), `${o.kind} has a model`);
    assert.ok(o.x >= 0 && o.y >= 0 && o.x + o.w <= a.w && o.y + o.h <= a.h, `${o.kind} at ${o.x},${o.y} is on the map`);
  }
  assert.equal(a.startFacing, 0, 'out of the door, east');
  assert.deepEqual(a.witches, [], "no Witch: she won't be on by default");
  assert.deepEqual(a.stashes, [], 'nothing to search: the day is about the Hunter');
});

test('one short walk past every lesson to the safe room, through the gates and only through them', () => {
  const map = generateTutorial3(1);
  const T = map.tutorial;
  const er = map.endRoom.interior;
  const goal = { x: er.x + er.w / 2, y: er.y + er.h / 2 };
  const open = walker(map, true);
  const d = open.f.pathDist(goal.x, goal.y);
  assert.ok(Number.isFinite(d) && d > 3000 && d < 4200, `the walk is ${Math.round(d)} u`);
  for (const k of ['hunter1', 'hunter1Walk', 'door2', 'ambushWalk', 'hunter3', 'medkit']) assert.ok(Number.isFinite(open.f.pathDist(T[k].x, T[k].y)), `${k} can be walked to`);
  let pocket = 0;
  for (let i = 0; i < open.world.blocked.length; i++) if (!open.world.blocked[i] && open.f.dist[i] >= INF) pocket++;
  assert.equal(pocket, 0, 'nowhere to get stuck');
  // Shut gates: the first street and its alley, no further.
  const shut = walker(map, false);
  for (const k of ['hunter1', 'hunter1Walk']) assert.ok(Number.isFinite(shut.f.pathDist(T[k].x, T[k].y)), `${k} is on row 1`);
  for (const k of ['ambushWalk', 'hunter3', 'medkit']) assert.equal(shut.f.pathDist(T[k].x, T[k].y), Infinity, `a shut gate is shut (${k})`);
  assert.equal(shut.f.pathDist(goal.x, goal.y), Infinity);
  // The medkit for the last lesson is past the last gate, on the way to the safe room.
  assert.ok(T.medkit.y < T.gates.g3.y && map.pickups.some((q) => q.kind === 'medkit' && gap(q, T.medkit) < 1));
  for (const G of Object.values(T.gates)) assert.ok(G.bars.navOpen && G.bars.opens && !G.bars.shot);
});

test('buildings: no slivers, no overlaps; nothing on the streets; room to leap from every hiding place', () => {
  const map = generateTutorial3(1);
  const T = map.tutorial;
  const buildings = map.obstacles.filter((o) => o.kind === 'building');
  assert.ok(buildings.length > 80);
  for (const b of buildings) assert.ok(Math.min(b.w, b.h) >= 40, `a ${b.w} x ${b.h} building`);
  for (let i = 0; i < buildings.length; i++) for (let j = i + 1; j < buildings.length; j++) assert.ok(!rectsOverlap(buildings[i], buildings[j], -0.5), 'two buildings in one place');
  // The streets are clear: nothing to leap into or circle round but the buildings and the gates.
  assert.deepEqual([...new Set(map.obstacles.map((o) => o.kind))].sort(), ['border', 'building', 'gate', 'qwall', 'wall'].filter((k) => map.obstacles.some((o) => o.kind === k)).sort());
  assert.equal(map.obstacles.filter((o) => o.kind === 'car').length, 0);
  const { world } = walker(map, true);
  // Row 2's doorway has a straight lane to where you are when it jumps you (and a little either side).
  for (const dx of [-30, 0, 30]) assert.ok(lane(world, T.door2, { x: T.ambushWalk.x + dx, y: T.ambushWalk.y }), `the doorway to ${dx} off the walk`);
  // Row 1's and row 3's come out of their alleys onto open street.
  for (const [k, walk] of [['hunter1', T.hunter1Walk], ['hunter3', { x: T.hunter3.x - 200, y: T.hunter3.y + 270 }]]) {
    const out = { x: T[k].x, y: T[k].y + 190 };
    assert.ok(lane(world, T[k], out), `${k} out of its alley`);
    assert.ok(Number.isFinite(walk.x));
  }
  // Nothing to read on the way: Ben's one line, in the safe room at the end.
  const words = map.decor.filter((d) => d.text);
  assert.deepEqual(words.map((d) => d.type), ['bentext']);
  assert.equal(words[0].text, DAY3_BEN.text);
  assert.ok(pointInRect(words[0].x, words[0].y, map.endRoom.interior));
});

// --- At run time ---------------------------------------------------------------------------

test('a run: Day 3 lessons, no Witch, no teammate, the director stands back, and the HUD starts with the sticks alone', () => {
  const game = make({ ally: true, specials: true, nightTerror: true, wanderers: 10, hordeSize: 10, witch: true });
  const T = game.tutorial;
  assert.equal(T.day, 3);
  assert.equal(T.steps, DAY3_STEPS);
  assert.equal(T.step.id, 'hunter');
  assert.equal(T.of, LESSONS3);
  assert.equal(LESSONS3, 5);
  assert.equal(game.ally, null);
  assert.ok(game.director.scripted);
  assert.equal(game.witches.length, 0, 'no Witch, whatever the panel says');
  assert.equal(game.zombies.length, 0, 'nobody about until a lesson sends one');
  assert.deepEqual(game.locks, { swap: true }, 'one gun');
  assert.deepEqual(T.hud(), { shove: 0, reload: 0, all: 0 }, 'the sticks alone');
  assert.equal(T.view('touch').text, null, 'no words: the arrow shows the way');
  run(game, 20); // standing in the start room: nothing comes
  assert.equal(game.zombies.length, 0);
  assert.equal(game.stats.hordes, 0);
});

test('knock it down: out of the alley as you step out; the world slows at its scream, stops with it in the air in reach; only SHOVE gets through; then you shoot it', () => {
  const game = make();
  const T = game.tutorial;
  const p = game.player;
  Object.assign(p, { x: T.L.hunter1Walk.x, y: T.L.hunter1Walk.y });
  run(game, 1 / 60);
  const h = T.h;
  assert.ok(h && h.type === 'hunter' && h.alive, 'out it comes');
  assert.deepEqual(T.group, [h]);
  assert.equal(T.view('touch').text, 'Hunter! It screams, then leaps.');
  // Until it screams the world goes on; from the scream, slow; in reach in the air, stopped.
  const seen = { crouch: [], leap: [] };
  for (let i = 0; i < 60 * 20 && !(T.prompt && T.timeScale() === 0); i++) {
    game.update(1 / 60, idle());
    if (h.mode === 'crouch' || h.mode === 'leap') seen[h.mode].push(T.timeScale());
  }
  assert.ok(T.prompt && T.prompt.kind === 'shove' && T.prompt.threat === h);
  assert.ok(seen.crouch.length && Math.min(...seen.crouch) >= 0.34 && seen.crouch.some((k) => k < 0.5), 'slow while it screams');
  assert.ok(seen.leap.some((k) => k > 0 && k <= 0.3), 'slower in the leap');
  assert.equal(T.timeScale(), 0, 'stopped');
  assert.equal(h.mode, 'leap', 'in the air');
  assert.ok(gap(h, p) - h.r <= HUNTER.deadstopReach, 'in reach of a shove');
  assert.ok(gap(h, p) > h.r + p.r + 4, 'not on you yet');
  assert.ok(T.hud().shove > 0 && T.hud().all === 0, 'SHOVE comes in with it');
  assert.equal(T.view('touch').text, 'Shove it out of the air!');
  assert.equal(T.view('touch').coach, null, 'the prompt is the coaching');
  // Bullets don't put it down before the shove (the gun works: the shove is the lesson).
  h.hp = 5;
  run(game, 1 / 60);
  assert.equal(h.hp, HUNTER.hp);
  const at = { x: h.x, y: h.y, t: game.time };
  game.update(1 / 60, idle(['reload', 'swap']));
  run(game, 1);
  assert.deepEqual({ x: h.x, y: h.y, t: game.time }, at, 'the world waits');
  game.update(1 / 60, idle(['shove']));
  assert.equal(game.stats.deadstops, 1, 'knocked out of the air');
  assert.equal(h.mode, 'stunned');
  assert.equal(T.knocked, true);
  run(game, PROMPT_OUT + 0.1);
  assert.equal(T.timeScale(), 1);
  assert.equal(T.view('touch').text, 'Now shoot it.');
  assert.equal(T.view('touch').coach, 'fire');
  h.hp = 1;
  h.alive = false; // shot
  run(game, 0.1);
  assert.ok(T.pause > 0, 'done');
  run(game, 0.6);
  assert.notEqual(T.gates.g1.state, 'shut', 'gate 1 opens');
});

test('a shove pressed while it screams waits, and knocks it out of the air the moment it can', () => {
  const game = make();
  const T = game.tutorial;
  const p = game.player;
  Object.assign(p, { x: T.L.hunter1Walk.x, y: T.L.hunter1Walk.y });
  for (let i = 0; i < 60 * 20 && !(T.h && T.h.mode === 'crouch'); i++) game.update(1 / 60, idle());
  assert.equal(T.h.mode, 'crouch');
  const shoves = game.stats.shoves;
  game.update(1 / 60, idle(['shove']));
  assert.equal(game.stats.shoves, shoves, 'not thrown at the air while it screams');
  for (let i = 0; i < 60 * 20 && !T.knocked; i++) game.update(1 / 60, idle());
  assert.equal(T.knocked, true, 'it went as soon as it could land');
  assert.equal(game.stats.deadstops, 1);
  assert.equal(game.stats.pins, 0);
});

test('break free: it jumps you from the doorway at full speed, the rest of the HUD comes in, SHOVE lit with its dots, five taps and you are free, then you shoot it', () => {
  const game = make();
  const T = game.tutorial;
  const p = game.player;
  skipTo(game, 'pin');
  assert.equal(T.view('touch').text, null, 'no words on the way: the arrow');
  assert.deepEqual({ x: T.arrow().x, y: T.arrow().y }, { x: T.L.ambushWalk.x, y: T.L.ambushWalk.y });
  run(game, 1);
  assert.equal(T.h, null, 'nothing until you come by the doorway');
  Object.assign(p, { x: T.L.ambushWalk.x, y: T.L.ambushWalk.y, vx: 0, vy: 0 });
  run(game, 1 / 60);
  const h = T.h;
  assert.ok(h && h.mode === 'leap', 'out of the doorway, in the air');
  assert.equal(T.timeScale(), 1, 'no slowing down for this one');
  for (let i = 0; i < 60 && !p.pinnedBy; i++) game.update(1 / 60, idle());
  assert.equal(p.pinnedBy, h, 'pinned');
  assert.equal(game.stats.pins, 1);
  run(game, 0.05);
  assert.ok(T.prompt && T.prompt.pin && !T.prompt.stop, 'SHOVE lit, its dots over it, the world going on');
  assert.equal(T.timeScale(), 1);
  assert.equal(T.view('touch').text, 'Tap SHOVE, fast!');
  assert.equal(T.view('mouse').text, 'Tap Space, fast!');
  run(game, 0.6);
  assert.deepEqual(T.hud(), { shove: 1, reload: 1, all: 1 }, 'and the rest of the HUD: your health, while it claws');
  const hp = p.hp;
  for (let k = 0; k < game.settings.hunterBreakTaps; k++) {
    game.update(1 / 60, idle(['shove']));
    if (k < game.settings.hunterBreakTaps - 1) assert.equal(p.pinnedBy, h);
  }
  assert.equal(p.pinnedBy, null, 'free');
  assert.ok(p.hp < hp + 1);
  run(game, PROMPT_OUT + 0.1);
  assert.equal(T.prompt, null);
  assert.equal(T.view('touch').text, 'Now shoot it.');
  assert.equal(T.view('touch').coach, 'fire');
  h.alive = false;
  run(game, 0.1);
  assert.ok(T.pause > 0, 'done');
  run(game, 0.6);
  assert.notEqual(T.gates.g2.state, 'shut', 'gate 2 opens');
});

test('on your own: no slowing down when it screams; pinned, SHOVE still lights up with its dots', () => {
  const game = make();
  const T = game.tutorial;
  const p = game.player;
  skipTo(game, 'alone');
  const h = T.h;
  assert.ok(h && h.alive && h.type === 'hunter');
  assert.equal(T.view('touch').text, 'Another one. On your own.');
  let slowed = false;
  for (let i = 0; i < 60 * 30 && !p.pinnedBy; i++) {
    game.update(1 / 60, idle());
    if (T.timeScale() < 1) slowed = true;
  }
  assert.equal(slowed, false, 'the world never slowed');
  assert.ok(p.pinnedBy, 'it got you (nobody did anything)');
  run(game, 0.05);
  assert.ok(T.prompt && T.prompt.pin);
  assert.equal(T.view('touch').text, 'Tap SHOVE, fast!');
  for (let k = 0; k < game.settings.hunterBreakTaps; k++) game.update(1 / 60, idle(['shove']));
  assert.equal(p.pinnedBy, null);
  run(game, PROMPT_OUT + 0.1);
  assert.equal(T.prompt, null);
  h.alive = false;
  run(game, 0.1);
  assert.ok(T.pause > 0);
  run(game, 0.6);
  assert.notEqual(T.gates.g3.state, 'shut', 'the last gate opens');
});

test('patch up: skipped at full health; hurt, a ring on the medkit past the last gate, and walking over it does it', () => {
  // Full health: straight on to the safe room.
  let game = make();
  skipTo(game, 'alone');
  game.tutorial.h.alive = false;
  run(game, 0.8);
  assert.equal(game.tutorial.step.id, 'saferoom', 'nothing to patch up');
  // Hurt: the medkit.
  game = make();
  const T = game.tutorial;
  const p = game.player;
  skipTo(game, 'alone');
  p.hp = 40;
  T.h.alive = false;
  run(game, 0.8);
  assert.equal(T.step.id, 'heal');
  assert.equal(T.view('touch').text, 'Hurt? Walk over the medkit.');
  const a = T.arrow();
  assert.ok(a.ring && gap(a, T.L.medkit) < 1);
  run(game, 2);
  assert.equal(T.step.id, 'heal', 'not done while you stand about');
  Object.assign(p, { x: T.L.medkit.x, y: T.L.medkit.y });
  run(game, 0.2);
  assert.ok(p.hp > 40, 'patched up');
  assert.ok(T.pause > 0, 'done');
});

test('doing Day 3 wrong: never tapping SHOVE while the world waits, not tapping your way out, standing about where there are no words: each gets a nudge', () => {
  const touch = (o = {}) => ({ ...idle(), source: 'touch', thumbs: { left: false, right: false }, ...o });
  // Stopped for SHOVE with it in the air, and nothing tapped.
  let game = make();
  let T = game.tutorial;
  Object.assign(game.player, { x: T.L.hunter1Walk.x, y: T.L.hunter1Walk.y });
  for (let i = 0; i < 60 * 20 && !(T.prompt && T.timeScale() === 0); i++) game.update(1 / 60, touch());
  run(game, 5.5, touch());
  assert.equal(T.nudge && T.nudge.key, 'hunter.no-shove');
  assert.equal(T.view('touch').text, 'Tap the SHOVE button.');
  // Pinned, and not tapping.
  game = make();
  T = game.tutorial;
  skipTo(game, 'pin');
  Object.assign(game.player, { x: T.L.ambushWalk.x, y: T.L.ambushWalk.y, vx: 0, vy: 0 });
  run(game, 3, touch());
  assert.ok(game.player.pinnedBy);
  assert.equal(T.nudge && T.nudge.key, 'pin.not-mashing');
  assert.equal(T.view('touch').text, 'Keep tapping SHOVE!');
  // Standing at an open gate.
  game = make();
  skipTo(game, 'gate1');
  run(game, 9, touch());
  assert.equal(game.tutorial.nudge && game.tutorial.nudge.key, 'gate1.lost');
  assert.match(reportText(buildReport(game)), /Tutorial nudges: gate1\.lost/);
});

test('the words and the coaching: one short line or none, words only at the top, the dots over SHOVE while pinned, never a bad number', () => {
  const states = [null, { h: null }, { h: { alive: true }, knocked: false, prompt: null }, { h: { alive: true }, knocked: false, prompt: { kind: 'shove' } }, { h: { alive: true }, knocked: true, freed: true, prompt: null }];
  const pinned = { player: { pinnedBy: {} } };
  const free = { player: { pinnedBy: null } };
  for (const s of DAY3_STEPS) {
    for (const src of ['touch', 'mouse', 'gamepad']) {
      for (const t of states) {
        for (const g of [pinned, free]) {
          const line = stepText(s, src, t, g);
          if (line !== null) assert.ok(line.length <= 32, `${s.id} (${src}): "${line}" (${line.length})`);
        }
      }
      for (const n of s.nudges || []) assert.ok(stepText(n, src).length <= 32, `${s.id}.${n.id} (${src})`);
    }
    assert.ok(s.title && s.title === s.title.toUpperCase());
  }
  for (const id of ['gate1', 'gate2']) assert.equal(stepText(DAY3_STEPS.find((q) => q.id === id), 'touch'), null);
  // Drawn at each moment that matters, at three phone sizes.
  const ctx = mockCtx();
  for (const [w, h] of [[844, 390], [640, 360], [568, 320]]) {
    const game = make();
    game.setViewport(w, h);
    const T = game.tutorial;
    const p = game.player;
    const L = computeLayout(w, h, { l: 0, r: 0, t: 0, b: 0 }, game.settings);
    const R = { ctx, v: game.view, ground() {}, reset() {} };
    const draw = (label) => {
      for (const src of ['touch', 'mouse', 'gamepad']) {
        texts.length = 0;
        placed.length = 0;
        bad = null;
        const input = { source: src, touch: { move: { active: false }, aim: { active: false, crossedFire: false }, pressed: new Map() } };
        drawTutorialHud(ctx, game, input, { title: false, forceSticks: false }, L);
        drawTutorialBright(R, game, game.viewRect(40));
        assert.equal(bad, null, `${w}x${h} ${label} (${src}): ${bad}`);
        for (const [t, , y] of placed) assert.ok(y < h * 0.3, `${w}x${h} ${label} (${src}): "${t}" at y ${Math.round(y)}`);
        const v = T.view(src === 'touch' ? 'touch' : src);
        if (v.text) assert.ok(texts.includes(v.text), `${w}x${h} ${label} (${src}): the line says "${v.text}"`);
      }
    };
    draw('the walk out');
    Object.assign(p, { x: T.L.hunter1Walk.x, y: T.L.hunter1Walk.y });
    run(game, 1 / 60);
    draw('it comes out');
    for (let i = 0; i < 60 * 20 && !(T.prompt && T.timeScale() === 0); i++) game.update(1 / 60, idle());
    draw('stopped in the air');
    skipTo(game, 'pin');
    Object.assign(p, { x: T.L.ambushWalk.x, y: T.L.ambushWalk.y, vx: 0, vy: 0 });
    for (let i = 0; i < 60 && !p.pinnedBy; i++) game.update(1 / 60, idle());
    run(game, 0.3);
    // Pinned: the dots go over SHOVE (and none of the game's own "TAP TO BREAK FREE!" in the middle of the screen).
    let dots = 0;
    const arc = ctx.arc;
    const B = L.byId.shove;
    ctx.arc = (x, y, r, ...a) => {
      if (Math.abs(y - (B.y - B.r - 18)) < 1 && r <= 6) dots++;
      return arc(x, y, r, ...a);
    };
    draw('pinned');
    ctx.arc = arc;
    assert.ok(dots >= game.settings.hunterBreakTaps, `${w}x${h}: ${dots} dots`);
    assert.ok(!texts.includes('TAP TO BREAK FREE!'));
    for (const id of ['alone', 'heal', 'saferoom']) {
      p.hp = 50;
      skipTo(game, id);
      draw(id);
    }
  }
});

test('the report says "Tutorial 3", and Day 3 is remembered on its own (a broken store never throws)', () => {
  const game = make();
  skipTo(game, 'alone');
  const r = buildReport(game);
  assert.equal(r.level, 'tutorial3');
  assert.equal(r.tutorial.day, 3);
  assert.equal(r.tutorial.of, LESSONS3);
  assert.match(reportText(r), /Tutorial 3: \d+\/\d+ lessons, reached "alone"/);
  store.clear();
  assert.equal(tutorialDone(3), false);
  saveTutorialDone(42, 3);
  assert.equal(tutorialDone(3), true);
  assert.equal(tutorialDone(2), false, 'one day at a time');
  assert.ok(store.has('funland2.p0.tutorial3.v1'));
  store.set('funland2.p0.tutorial3.v1', '{oops');
  assert.equal(tutorialDone(3), false);
});

// --- A bot plays it ------------------------------------------------------------------------

test('a bot gets through Day 3 to the safe room through the real game loop: knocks one down, breaks free, beats one alone, patches up', () => {
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
    if (Math.hypot(x - p.x, y - p.y) < 16) return { x: 0, y: 0 };
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
  const order = [];
  let evT = 0;
  let stops = 0;
  for (let i = 0; i < 60 * 300 && !game.won; i++) {
    const s = T.step.id;
    if (order[order.length - 1] !== s) order.push(s);
    const f = idle([]);
    evT -= 1 / 60;
    const h = T.h;
    const P = T.prompt && !T.prompt.answered ? T.prompt : null;
    if (T.pause > 0) {
      // reading the ✓
    } else if (p.pinnedBy) {
      // Pinned: tap your way out.
      if (evT <= 0) {
        f.events.push('shove');
        evT = 0.15;
      }
    } else if (P && T.timeScale() === 0) {
      // The world has stopped for SHOVE: tap it.
      stops++;
      if (evT <= 0) {
        f.events.push('shove');
        evT = 0.5;
      }
    } else if (h && h.alive && (s === 'alone' || (s === 'hunter' && T.knocked) || (s === 'pin' && T.freed))) {
      // Shoot it; on your own, knock it out of the air if it leaps at you.
      const a = screen(h.x - p.x, h.y - p.y);
      Object.assign(f, { aimActive: true, aimX: a.x, aimY: a.y, aimRaw: 1, fire: true });
      if (h.mode === 'leap' && gap(h, p) - h.r < HUNTER.deadstopReach - 20 && evT <= 0) {
        f.events.push('shove');
        evT = 0.5;
      }
    } else if (!P) {
      const t = T.arrow();
      if (t) f.move = walkTo(t.x, s.startsWith('gate') ? t.y - 60 : t.y);
    }
    game.update(1 / 60, f);
  }
  run(game, 1);
  assert.equal(game.won, true, `stuck at "${T.step.id}" after ${game.stats.time.toFixed(0)} s`);
  assert.equal(game.lost, false);
  // (With full health at the end, the medkit lesson is skipped: a bot that took no damage doesn't see it.)
  const expect = DAY3_STEPS.map((q) => q.id).filter((id) => id !== 'heal' || order.includes('heal'));
  assert.deepEqual(order, expect, 'every lesson, in order');
  assert.ok(stops > 0, 'the world stopped for the first shove');
  assert.ok(game.stats.deadstops >= 1, 'knocked one out of the air');
  assert.ok(game.stats.pins >= 1 && game.stats.breakFrees >= 1, 'jumped, and broke free');
  assert.equal(game.stats.hunters, 3, 'all three down');
  assert.ok(game.stats.time < 100, `${game.stats.time.toFixed(0)} s for a bot`);
  assert.equal(tutorialDone(3), true);
  assert.deepEqual(T.nudges, {}, 'played right: never told off');
});
