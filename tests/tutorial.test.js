// The tutorial: three hand-made lessons for first-time (phone) players.
//  - the maps: connected, every named place on walkable ground, padded so
//    the camera never looks past the edge;
//  - the script: every lesson can be played start to finish by a scripted
//    pair of thumbs (touch input), ends in its safe room, and never kills you;
//    lesson 3 also when you hit the alarm car, or wake the Witch;
//  - the words: short enough for the coach panel on a phone;
//  - progress on this device, and the HUD drawing on a mock canvas.
// (node --test runs each file in its own process, so the fake DOM globals stay here.)
import test from 'node:test';
import assert from 'node:assert/strict';

let bad = null;
function mockCtx(canvas) {
  const t = { canvas, globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'top' };
  const grad = { addColorStop() {} };
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6.5 });
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      return (...a) => {
        for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) bad = bad || `${String(k)}(${a.join(', ')})`;
      };
    },
    set(o, k, v) {
      o[k] = v;
      return true;
    },
  });
}
function mockCanvas(w = 300, h = 150) {
  const c = { width: w, height: h, style: {} };
  c.getContext = () => c._ctx || (c._ctx = mockCtx(c));
  return c;
}
const store = new Map();
globalThis.document = { createElement: () => mockCanvas() };
globalThis.window = { devicePixelRatio: 2 };
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { Game } = await import('../src/game/game.js');
const { Renderer } = await import('../src/render/renderer.js');
const { DEFAULTS } = await import('../src/settings.js');
const { computeLayout } = await import('../src/layout.js');
const { World, FlowField } = await import('../src/world/world.js');
const { generateTutorial } = await import('../src/world/tutorial-gen.js');
const { LESSONS, HP_FLOOR, lessonsDone, markLessonDone, nextLesson, forgetLessons, tutorialSkipped, setTutorialSkipped } = await import('../src/game/tutorial.js');
const { coachRect } = await import('../src/render/tutorial-hud.js');

const audio = new Proxy({ listener: { x: 0, y: 0 } }, { get: (o, k) => (k in o ? o[k] : () => {}) });
// Zombies wander and aim wobbles at random: seed it, so a run plays the same every time.
const { mulberry32 } = await import('../src/util.js');
Math.random = mulberry32(20261123);
const W = 740; // a small phone held sideways
const H = 360;

function make(lesson, over = {}) {
  const settings = { ...DEFAULTS, playtestPrompt: false, ...over };
  const game = new Game(settings, audio, () => {});
  game.setViewport(W, H);
  game.setLesson(lesson);
  game.newRun();
  return game;
}

// --- The maps --------------------------------------------------------------------------------

const spotsOf = (T) => {
  const out = [];
  for (const [k, v] of Object.entries(T)) {
    const list = Array.isArray(v) ? v : [v];
    for (const p of list) if (p && typeof p === 'object' && typeof p.x === 'number' && !p.kind) out.push([k, p]);
    if (k === 'pen') for (const s of v.sleepers) out.push(['sleeper', s]);
  }
  return out;
};

for (const n of [1, 2, 3]) {
  test(`lesson ${n} map: one connected street from safe room to safe room, every named place walkable`, () => {
    const map = generateTutorial(n);
    assert.equal(map.tutorial.lesson, n);
    const world = new World(map);
    const f = new FlowField(world);
    f.compute(map.start.x, map.start.y);
    const er = map.endRoom.interior;
    assert.ok(Number.isFinite(f.pathDist(er.x + er.w / 2, er.y + er.h / 2)), 'the end room is reachable (its gate is open to the nav grid)');
    for (const [name, p] of spotsOf(map.tutorial)) {
      if (name === 'sleeper') {
        assert.ok(world.isFree(p.x, p.y, 12), `${name} at ${p.x},${p.y} stands on free ground`);
        continue;
      }
      assert.ok(Number.isFinite(f.pathDist(p.x, p.y)), `${name} at ${p.x},${p.y} can be walked to`);
    }
    // The same every time (no randomness in a lesson).
    assert.deepEqual(JSON.parse(JSON.stringify(generateTutorial(n).obstacles)), JSON.parse(JSON.stringify(map.obstacles)));
  });

  test(`lesson ${n} map: the camera never looks past the edge, even from the safe rooms`, () => {
    const game = make(n);
    const map = game.world.map;
    for (const room of [map.startRoom, map.endRoom]) {
      const r = room.interior;
      game.camera.x = r.x + r.w / 2;
      game.camera.y = r.y + r.h / 2;
      game.syncView();
      const vr = game.viewRect(0);
      assert.ok(vr.x >= -1 && vr.y >= -1 && vr.x + vr.w <= map.w + 1 && vr.y + vr.h <= map.h + 1, `view ${JSON.stringify(vr)} inside ${map.w}x${map.h}`);
    }
  });
}

test('lessons have nothing random in them: no stashes, writing, Ben or Witch but their own, no wanderers', () => {
  for (const n of [1, 2, 3]) {
    const game = make(n);
    assert.equal(game.zombies.filter((z) => z.type === 'common' && !z.tut).length, 0, 'every zombie is the lesson\'s');
    assert.equal(game.ben, null);
    assert.equal(game.witches.length, n === 3 ? 1 : 0);
    assert.equal(game.loot.stashes.length, n === 3 ? 1 : 0);
    assert.equal(game.ally, null);
    assert.equal(game.dailyKey, null);
  }
  // ...and a normal run afterwards is a normal run again.
  const game = make(1);
  game.setLesson(0);
  game.newRun();
  assert.equal(game.tutorial, null);
  assert.ok(game.zombies.length > 20);
});

// --- The words ---------------------------------------------------------------------------------

test('every step has short words for touch, keys and pad, and every lesson ends in its safe room', () => {
  for (const n of [1, 2, 3]) {
    const game = make(n);
    const T = game.tutorial;
    const ids = T.steps.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, 'step ids are unique');
    assert.equal(ids[ids.length - 1], 'saferoom');
    for (const s of T.steps) {
      const variants = typeof s.text === 'function' ? [s.text(T)] : [s.text];
      for (const t of variants) {
        for (const src of ['touch', 'pc', 'pad']) {
          assert.ok(t[src] && t[src].length > 10, `${n}/${s.id}: ${src} words`);
          assert.ok(t[src].length <= 100, `${n}/${s.id}/${src} is ${t[src].length} long: the coach panel fits about two lines on a phone`);
        }
      }
      assert.ok(s.title && s.title.length <= 14, `${n}/${s.id}: a short title`);
    }
    assert.equal(LESSONS[n - 1].learned.length, 5);
  }
});

// --- Progress on this device -------------------------------------------------------------------

test('lesson progress: first-timers start at lesson 1, done lessons are remembered, all done picks a map', () => {
  forgetLessons();
  assert.deepEqual(lessonsDone(), []);
  assert.equal(nextLesson(), 1);
  markLessonDone(1);
  markLessonDone(1);
  assert.deepEqual(lessonsDone(), [1]);
  assert.equal(nextLesson(), 2);
  markLessonDone(3);
  assert.equal(nextLesson(), 2);
  markLessonDone(2);
  assert.equal(nextLesson(), 0);
  // Picking a map over the lessons is remembered (the title stops pushing them), and so is going back.
  assert.equal(tutorialSkipped(), false);
  setTutorialSkipped(true);
  assert.equal(tutorialSkipped(), true);
  assert.deepEqual(lessonsDone(), [1, 2, 3], 'skipping keeps what was done');
  setTutorialSkipped(false);
  assert.equal(tutorialSkipped(), false);
  store.set('funland2.p0.tutorial.v1', '{not json');
  assert.deepEqual(lessonsDone(), []);
  assert.equal(tutorialSkipped(), false);
  forgetLessons();
});

// --- Playing them through -------------------------------------------------------------------------
//
// A scripted pair of thumbs (touch input): walk the flow field to wherever the
// lesson points, aim at the nearest zombie, fire unless the step says not to
// (or the alarm car is in the way), shove what's on you, press the buttons the
// step asks for.

function bot(game, opts = {}) {
  const mem = { key: '', field: null, shoveT: 0, swapT: 0, reloaded: false, t: 0 };
  const dir = { x: 0, y: 0 };
  return () => {
    const T = game.tutorial;
    const p = game.player;
    const v = game.view;
    const f = { source: 'touch', move: { x: 0, y: 0 }, aimActive: false, aimX: 1, aimY: 0, aimRaw: 0, aimScreen: null, fire: false, assist: true, events: [] };
    const s = T.step;
    if (!s || game.won) return f;
    mem.t += 1 / 60;
    mem.shoveT -= 1 / 60;
    mem.swapT -= 1 / 60;
    const id = s.id;
    // Where to: the ring, or the safe room. Lesson 3's opts can make you walk at the Witch or the alarm car.
    let goal = T.ring();
    if (!goal && T.arrow() === 'goal') {
      // Follow the green arrow: the safe room.
      const er = game.world.map.endRoom.interior;
      goal = { x: er.x + er.w / 2, y: er.y + er.h / 2, r: 40 };
    }
    if (id === 'witch' && opts.wakeWitch && T.witch.mode === 'sit') goal = { x: T.witch.x, y: T.witch.y + 40 };
    if (goal) {
      const key = `${Math.round(goal.x)},${Math.round(goal.y)}`;
      if (key !== mem.key) {
        mem.key = key;
        mem.field = new FlowField(game.world);
        mem.field.compute(goal.x, goal.y);
      }
      const far = Math.hypot(goal.x - p.x, goal.y - p.y) > (goal.r ? goal.r * 0.5 : 20);
      if (far && mem.field.dirAt(p.x, p.y, dir)) {
        const sd = v.dirToScreen(dir.x, dir.y);
        const m = Math.hypot(sd.x, sd.y) || 1;
        f.move.x = sd.x / m;
        f.move.y = sd.y / m;
      }
    }
    // The nearest zombie in sight (a Witch only once she's up).
    let z = null;
    let zd = Infinity;
    for (const q of game.zombies) {
      if (!q.alive || q.passive || (q.type === 'witch' && q.mode === 'sit')) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < zd && d < 560 && game.world.segmentClear(p.x, p.y, q.x, q.y, game.world.shotBlockers)) {
        zd = d;
        z = q;
      }
    }
    if (z) {
      const sd = v.dirToScreen(z.x - p.x, z.y - p.y);
      const m = Math.hypot(sd.x, sd.y) || 1;
      f.aimActive = true;
      f.aimX = sd.x / m;
      f.aimY = sd.y / m;
      f.aimRaw = id === 'aim' ? 0.3 : 1;
      let fire = id !== 'aim' && !(id === 'shove' && z.tut === 'first');
      // Never through an alarm car (unless this run is about hitting it).
      const hit = game.world.raycast(p.x, p.y, (z.x - p.x) / zd, (z.y - p.y) / zd, zd, game.world.shotBlockers);
      if (hit.obstacle && hit.obstacle.alarm && !opts.hitAlarm) fire = false;
      f.fire = fire;
      if (id === 'both' && zd < 320) {
        f.move.x = -f.aimX; // back away while shooting
        f.move.y = -f.aimY;
      }
      if (zd < z.r + p.r + 22 && mem.shoveT <= 0) {
        f.events.push('shove');
        mem.shoveT = 0.5;
      }
    } else if (opts.hitAlarm && id === 'alarm' && !T.alarmed) {
      // Shoot the car on purpose.
      const c = T.spots.alarm;
      const sd = v.dirToScreen(c.x + c.w / 2 - p.x, c.y + c.h / 2 - p.y);
      const m = Math.hypot(sd.x, sd.y) || 1;
      f.aimActive = true;
      f.aimX = sd.x / m;
      f.aimY = sd.y / m;
      f.aimRaw = 1;
      f.fire = Math.hypot(c.x - p.x, c.y - p.y) < 400;
    }
    if (id === 'reload' && !mem.reloaded) {
      f.events.push('reload');
      mem.reloaded = true;
    }
    if ((id === 'swap' || id === 'shotgun') && mem.swapT <= 0) {
      f.events.push('swap');
      mem.swapT = 0.4;
    }
    return f;
  };
}

/** Play a lesson with the bot; returns what happened. */
function playThrough(n, opts = {}, maxSecs = 240) {
  const game = make(n);
  const next = bot(game, opts);
  const seen = [];
  let minHp = Infinity;
  for (let i = 0; i < maxSecs * 60 && !game.won; i++) {
    game.update(1 / 60, next());
    const id = game.tutorial.step ? game.tutorial.step.id : 'done';
    if (seen[seen.length - 1] !== id) seen.push(id);
    minHp = Math.min(minHp, game.player.hp);
  }
  return { game, seen, minHp, secs: game.stats.time };
}

for (const n of [1, 2, 3]) {
  test(`lesson ${n} can be played start to finish with two thumbs, and ends in the safe room`, () => {
    const { game, seen, minHp, secs } = playThrough(n);
    const T = game.tutorial;
    assert.ok(game.won, `won (got to ${seen.join(' > ')} in ${secs.toFixed(0)}s)`);
    assert.ok(!game.lost && game.player.alive);
    assert.ok(minHp >= HP_FLOOR, 'never below the floor');
    assert.deepEqual(seen.filter((s) => s !== 'done'), T.steps.filter((s) => !(s.skip && s.skip(T)) || seen.includes(s.id)).map((s) => s.id), 'every step, in order');
    assert.ok(secs < (n === 3 ? 200 : 120), `short: ${secs.toFixed(0)}s`);
    assert.ok(T.canFinish);
  });
}

test('lesson 2: the first shove comes in slow motion, and a zombie shot before its shove is sent again', () => {
  const game = make(2);
  const T = game.tutorial;
  const next = bot(game);
  let slow = false;
  for (let i = 0; i < 60 * 60 && T.step.id === 'shove'; i++) {
    game.update(1 / 60, next());
    if (T.timeScale < 0.5) slow = true;
  }
  assert.ok(slow, 'time slowed as it reached you');
  assert.equal(T.step.id, 'shoot1');
  assert.ok(T.timeScale > 0.2);
  // Shot down before it was shoved: another comes.
  const g2 = make(2);
  const first = g2.tutorial.group('first').list;
  g2.update(1 / 60, bot(g2)());
  for (const z of g2.tutorial.group('first').list) z.alive = false;
  g2.update(1 / 60, bot(g2)());
  assert.equal(g2.tutorial.step.id, 'shove');
  assert.ok(g2.tutorial.group('first').alive >= 1 || first.length === 0, 'sent again');
});

test('lesson 3: hit the alarm car and the lesson goes on (small waves, then on to the Witch)', () => {
  const { game, seen } = playThrough(3, { hitAlarm: true });
  assert.ok(game.tutorial.alarmed, 'the alarm went off');
  assert.ok(game.won, seen.join(' > '));
});

test('lesson 3: wake the Witch and the lesson goes on (she is easier here, and you cannot die)', () => {
  const { game, seen, minHp } = playThrough(3, { wakeWitch: true });
  assert.ok(game.tutorial.startled, 'she was startled');
  assert.ok(game.won, seen.join(' > '));
  assert.ok(minHp >= HP_FLOOR);
});

test('lesson 3: the careful way leaves the Witch crying, and the alarm quiet nearly every time', () => {
  // The bot shoots whatever it sees: a careless spray can still clip the car now and then.
  let alarmed = 0;
  for (let k = 0; k < 10; k++) {
    const { game } = playThrough(3);
    assert.ok(game.won);
    assert.ok(!game.tutorial.startled);
    assert.equal(game.witches[0].mode, 'sit');
    if (game.tutorial.alarmed) alarmed++;
  }
  assert.ok(alarmed <= 2, `the alarm went off in ${alarmed} of 10 careful runs`);
});

test('the safe room only counts on the last step (its gate keeps you out before)', () => {
  const game = make(1);
  const er = game.world.map.endRoom.interior;
  game.player.x = er.x + er.w / 2;
  game.player.y = er.y + er.h / 2;
  game.update(1 / 60, bot(game)());
  assert.ok(!game.won, 'standing in it early does nothing');
  assert.ok(game.world.obstacles.includes(game.world.map.tutorial.gate), 'the gate is shut');
});

// --- Drawing ----------------------------------------------------------------------------------------

test('the coach panel fits between the health and gun panels on phones, and under them on tiny ones', () => {
  for (const [w, h] of [[844, 390], [740, 360], [667, 375], [932, 430]]) {
    const L = computeLayout(w, h, { l: 0, r: 0, t: 0, b: 0 }, DEFAULTS);
    const r = coachRect(L);
    assert.ok(r.top, `${w}x${h}: in the top bar`);
    assert.ok(r.x >= L.hp.x + L.hp.w && r.x + r.w <= L.byId.swap.x, `${w}x${h}: between the panels`);
  }
  const tiny = coachRect(computeLayout(568, 320, { l: 0, r: 0, t: 0, b: 0 }, DEFAULTS));
  assert.ok(!tiny.top && tiny.w <= 568);
});

test('every lesson draws (coach, ghost thumbs, rings, labels, the end screen) without a bad coordinate', () => {
  for (const n of [1, 2, 3]) {
    bad = null;
    const game = make(n);
    const canvas = mockCanvas(W * 2, H * 2);
    const renderer = new Renderer(canvas);
    renderer.resize(W, H);
    const layout = computeLayout(W, H, { l: 0, r: 0, t: 0, b: 0 }, game.settings);
    const touch = { pressed: new Map(), move: { active: false, base: { x: 0, y: 0 }, pos: { x: 0, y: 0 } }, aim: { active: false, firing: false, base: { x: 0, y: 0 }, pos: { x: 0, y: 0 } }, taps: [], knob: () => ({ x: 0, y: 0 }) };
    const input = { source: 'touch', touch, frame: { source: 'touch', move: { x: 0, y: 0 }, aimRaw: 0, fire: false } };
    const ui = { layout, fps: 60, frameMs: 16, hintAlpha: 1, input, forceSticks: true, reportRect: null, title: false, tutorial: true };
    const next = bot(game);
    for (let i = 0; i < 200 * 60 && !game.won; i++) {
      game.update(1 / 60, next());
      if (i % 20 === 0) renderer.render(game, input, ui);
    }
    for (let i = 0; i < 120; i++) {
      game.update(1 / 60, next());
      renderer.render(game, input, ui);
    }
    assert.ok(game.won);
    assert.equal(bad, null, `lesson ${n}: ${bad}`);
  }
});
