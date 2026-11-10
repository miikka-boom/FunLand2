// Smoke test for the 3D renderer: every level, all three cameras (isometric,
// aligned with the streets, straight down), with the world features on, a
// horde, the specials, the teammate and the Pier 9 finale all draw against a
// mock canvas in node (no DOM) without throwing, and nothing is ever drawn at
// a NaN / infinite coordinate.
// (node --test runs each file in its own process, so the fake DOM globals stay here.)
import test from 'node:test';
import assert from 'node:assert/strict';

const calls = {};
let bad = null;
const COORD = new Set(['moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'fillRect', 'strokeRect', 'clearRect', 'quadraticCurveTo', 'bezierCurveTo', 'arcTo', 'setTransform', 'translate', 'scale', 'rotate', 'fillText', 'strokeText', 'createLinearGradient', 'createRadialGradient']);
function check(k, args) {
  if (bad || !COORD.has(k)) return;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (typeof a === 'number' && !Number.isFinite(a)) bad = `${k}(${Array.from(args).join(', ')})`;
  }
}
function mockCtx(canvas) {
  const grad = { addColorStop(o, c) { if (!Number.isFinite(o) || o < 0 || o > 1 || typeof c !== 'string') bad = bad || `addColorStop(${o}, ${c})`; } };
  const t = { canvas, globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', lineCap: 'butt', lineJoin: 'miter', textAlign: 'left', textBaseline: 'top', lineDashOffset: 0 };
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return (...a) => { check(k, a); return grad; };
      return (...a) => {
        calls[k] = (calls[k] || 0) + 1;
        check(k, a);
      };
    },
    set(o, k, v) {
      if ((k === 'globalAlpha' || k === 'lineWidth') && !Number.isFinite(v)) bad = bad || `${k} = ${v}`;
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
const { Hunter, Tank } = await import('../src/game/specials.js');
const { NightTerror } = await import('../src/game/terror.js');
const { Zombie } = await import('../src/game/zombies.js');

// Audio and haptics: anything can be called on them.
const audio = new Proxy({ listener: { x: 0, y: 0 } }, { get: (o, k) => (k in o ? o[k] : () => {}) });
const W = 844;
const H = 390;

function setup(over = {}) {
  const settings = { ...DEFAULTS, playtestPrompt: false, godMode: true, ...over };
  const game = new Game(settings, audio, () => {});
  game.setViewport(W, H);
  const canvas = mockCanvas(W * 2, H * 2);
  const renderer = new Renderer(canvas);
  renderer.resize(W, H);
  const layout = computeLayout(W, H, { l: 0, r: 0, t: 0, b: 0 }, settings);
  const touch = { pressed: new Map(), move: { active: false }, aim: { active: false }, taps: [], knob: () => ({ x: 0, y: 0 }) };
  const input = { source: 'mouse', touch, frame: { source: 'mouse', move: { x: 0, y: 0 }, aimRaw: 0, fire: false } };
  const ui = { layout, fps: 60, frameMs: 16, hintAlpha: 0, input, forceSticks: false, reportRect: null, title: false };
  const frame = (move = { x: 0, y: 0 }, aim = null, fire = false) => ({ source: 'mouse', move, aimActive: !!aim, aimX: 1, aimY: 0, aimRaw: 1, aimScreen: aim, fire, assist: false, events: [] });
  const step = (n, f) => {
    for (let i = 0; i < n; i++) {
      game.update(1 / 60, f || frame());
      renderer.render(game, input, ui);
    }
  };
  return { game, renderer, settings, step, frame };
}

/** Put the survivor on a free spot near (x, y) and let the camera settle there. */
function teleport(game, x, y) {
  const p = game.player;
  for (let r = 0; r < 300; r += 10) {
    for (let a = 0; a < 6.3; a += 0.6) {
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (game.world.isFree(px, py, 14)) {
        p.x = px;
        p.y = py;
        game.camera.x = px;
        game.camera.y = py;
        return;
      }
    }
  }
}

// The three views of the world.
const CAMERAS = {
  iso: { camera: 'iso', cameraAligned: false },
  aligned: { camera: 'iso', cameraAligned: true },
  top: { camera: 'top' },
};

for (const camera of Object.keys(CAMERAS)) {
  for (const level of ['city', 'interior', 'docks']) {
    test(`${level}, ${camera} camera: the run draws from start to goal with everything switched on`, () => {
      bad = null;
      const { game, renderer, step, frame } = setup({ level, ...CAMERAS[camera], holdout: true, routes: true, landmarks: true, ally: true, nightTerror: true });
      assert.equal(game.view.flat, camera === 'top');
      assert.equal(game.view.yaw === 0, camera !== 'iso');
      const map = game.world.map;
      step(3, frame({ x: 0.7, y: -0.7 }, { x: 600, y: 120 }, true));
      // The infected, of every kind, around the survivor.
      const p = game.player;
      for (let i = 0; i < 40; i++) {
        const z = new Zombie(p.x + 60 + (i % 8) * 22, p.y - 80 + Math.floor(i / 8) * 22, i % 2 === 0);
        if (i % 7 === 0) z.stagger = 0.5;
        if (i % 9 === 0) z.hitFlash = 0.05;
        game.zombies.push(z);
      }
      const hunter = new Hunter(p.x + 120, p.y + 40);
      const tank = new Tank(p.x - 140, p.y - 60);
      const terror = new NightTerror(p.x + 40, p.y + 110);
      terror.lit = 1;
      game.zombies.push(hunter, tank, terror);
      for (const mode of ['stalk', 'crouch', 'leap', 'pin', 'stunned']) {
        hunter.mode = mode;
        hunter.modeT = 0.4;
        if (mode === 'pin') p.pinnedBy = hunter;
        renderer.render(game, { source: 'mouse', touch: { pressed: new Map(), move: {}, aim: {}, taps: [] }, frame: frame() }, { layout: computeLayout(W, H, { l: 0, r: 0, t: 0, b: 0 }, game.settings), fps: 60, frameMs: 16, hintAlpha: 0, input: { touch: { pressed: new Map() } }, title: false });
        p.pinnedBy = null;
      }
      for (const mode of ['chase', 'punch', 'throw']) {
        tank.mode = mode;
        tank.modeT = 0.2;
        step(1);
      }
      for (const mode of ['stalk', 'windup', 'lunge', 'recoil', 'flee']) {
        terror.mode = mode;
        terror.modeT = 0.3;
        terror.alive = true;
        if (!game.zombies.includes(terror)) game.zombies.push(terror);
        renderer.render(game, { source: 'mouse', touch: { pressed: new Map(), move: {}, aim: {}, taps: [] }, frame: frame() }, { layout: computeLayout(W, H, { l: 0, r: 0, t: 0, b: 0 }, game.settings), fps: 60, frameMs: 16, hintAlpha: 0, input: { touch: { pressed: new Map() } }, title: false });
      }
      // Effects in the air, a blast, the teammate down.
      game.effects.explosion(p.x + 60, p.y, 120);
      game.effects.blood(p.x, p.y, 1, 0, 6);
      game.effects.gibs(p.x, p.y, 1, 0, 3);
      game.effects.casing(p.x, p.y, 0, true);
      game.effects.shoveArc(p.x, p.y, 0, 60);
      game.rocks.push({ type: 'rock', alive: true, x: p.x + 30, y: p.y - 30, r: 13, hp: 70, vx: 10, vy: 0, dist: 40, max: 200, rot: 0, spin: 1 });
      if (game.ally) game.ally.down = true;
      step(4, frame({ x: -1, y: 0 }, { x: 200, y: 300 }, true));
      // A tour: every kind of obstacle, every stash, the landmarks, the goal.
      const seen = new Set();
      const stops = [];
      for (const o of map.obstacles) {
        const key = o.kind + (o.truck ? '/truck' : '') + (o.tall ? '/tall' : '') + (o.ware ? '/ware' : '') + (o.pipe ? '/pipe' : '') + (o.indoor ? '/indoor' : '');
        if (o.kind === 'border' || seen.has(key)) continue;
        seen.add(key);
        stops.push({ x: o.x + o.w / 2, y: o.y + o.h + 30 });
      }
      for (const s of map.stashes || []) stops.push(s);
      for (const l of map.landmarks || []) stops.push(l);
      for (const d of map.dens || []) stops.push(d);
      if (map.ben && map.ben.nest) stops.push(map.ben.nest);
      const er = map.endRoom.interior;
      stops.push({ x: er.x + er.w / 2, y: er.y + er.h / 2 });
      game.zombies.length = 0;
      for (const s of stops) {
        teleport(game, s.x, s.y);
        step(1, frame({ x: 0, y: 0 }, { x: 420, y: 100 }));
      }
      assert.ok(seen.size >= (level === 'docks' ? 9 : 12), `saw ${seen.size} kinds of obstacle`);
      // Day, and line of sight off.
      game.settings.night = false;
      game.settings.los = false;
      step(2);
      assert.equal(bad, null, `drawn with a bad number: ${bad}`);
      assert.ok(calls.fill > 200 && calls.stroke > 20, 'something was drawn');
      // Every static got a rank and a model, and the painter's list was sorted.
      for (const o of renderer.scene.statics) assert.ok(o._r3 && o._r3.h > 0 && typeof o._r3.draw === 'function' && o._r3.rank >= 0, o.kind);
      const list = renderer.list;
      for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].k <= list[i].k);
    });
  }
}

test('Pier 9 finale: the flare, the ferry coming in, the gangway (every camera)', () => {
  for (const camera of Object.keys(CAMERAS)) {
    bad = null;
    const { game, step, frame } = setup({ level: 'docks', ...CAMERAS[camera], ferryTime: 30 });
    const F = game.events.finale;
    teleport(game, F.use.x, F.use.y);
    step(80); // stand at the post: the flare goes up
    assert.equal(F.state, 'called');
    F.t = F.dur - 10;
    step(30);
    assert.ok(F.shipX < F.startX - 40, 'the ferry is in view');
    F.t = F.dur - 0.1;
    step(90);
    assert.equal(F.state, 'docked');
    teleport(game, F.gangX, F.pier.y + 120);
    step(3, frame({ x: 0, y: -1 }));
    assert.equal(bad, null, `drawn with a bad number: ${bad}`);
  }
});

test('the camera can be changed mid-run: tilt, aligned with the streets, straight down, and back', () => {
  bad = null;
  const { game, renderer, settings, step } = setup({ level: 'city' });
  step(2);
  const ranks = renderer.scene.statics.map((o) => o._r3.rank);
  for (const tilt of [25, 35, 50, 70]) {
    settings.cameraTilt = tilt;
    step(2);
    assert.equal(game.view.flat, false);
  }
  assert.deepEqual(renderer.scene.statics.map((o) => o._r3.rank), ranks, 'tilting does not reorder the scene');
  // Streets along the screen: no turn, its own tilt, still 3D.
  settings.cameraAligned = true;
  step(2);
  assert.equal(game.view.yaw, 0);
  assert.equal(game.view.flat, false);
  assert.ok(Math.abs(game.view.pitch - (settings.cameraAlignedTilt * Math.PI) / 180) < 1e-9, 'the aligned view has its own tilt');
  assert.equal(game.view.faceX, 0, 'walls that run up the screen are edge-on');
  assert.equal(game.view.faceY, 1, 'south walls face the camera');
  for (const tilt of [30, 55, 75]) {
    settings.cameraAlignedTilt = tilt;
    step(2);
    assert.equal(game.view.flat, false);
  }
  settings.camera = 'top';
  step(2);
  assert.equal(game.view.flat, true, 'straight down wins over the toggle');
  assert.equal(game.view.yaw, 0);
  settings.camera = 'iso';
  settings.cameraAligned = false;
  settings.cameraTilt = 35;
  step(2);
  assert.deepEqual(renderer.scene.statics.map((o) => o._r3.rank), ranks, 'back to the same order');
  assert.equal(bad, null, `drawn with a bad number: ${bad}`);
});

test('aligned camera: sticks are map directions, and the mouse still aims at gun height', () => {
  const { game, step, frame } = setup({ level: 'city', cameraAligned: true, wanderers: 0, specials: false });
  const v = game.view;
  for (const [sx, sy, wx, wy] of [[1, 0, 1, 0], [0, -1, 0, -1], [-1, 0, -1, 0], [0, 1, 0, 1]]) {
    const d = v.dirToWorld(sx, sy);
    assert.ok(Math.abs(d.x - wx) < 1e-9 && Math.abs(d.y - wy) < 1e-9, `stick (${sx}, ${sy}) -> map (${wx}, ${wy})`);
  }
  // A street that runs east-west is level on screen; one that runs north-south is upright.
  const a = v.project(100, 500);
  const b = v.project(900, 500);
  const c = v.project(100, 1300);
  assert.ok(Math.abs(a.y - b.y) < 1e-9 && b.x > a.x);
  assert.ok(Math.abs(a.x - c.x) < 1e-9 && c.y > a.y);
  // Aim with the cursor straight right of the survivor's gun: the survivor faces east.
  step(2);
  const p = game.player;
  const gun = v.project(p.x, p.y, 27);
  step(3, frame({ x: 0, y: 0 }, { x: gun.x + 200, y: gun.y }));
  assert.ok(Math.abs(Math.atan2(Math.sin(p.fireAngle), Math.cos(p.fireAngle))) < 0.05, `facing ${p.fireAngle}`);
});

test('boarded doorways the camera cannot look into are marked in plan, where the door is', () => {
  // A boarded room behind a tall wall: the wall goes on over the door (a lintel).
  const marked = (over) => {
    bad = null;
    const { game, renderer, step } = setup({ level: 'city', wanderers: 0, specials: false, ...over });
    step(1);
    const lintels = renderer.scene.props.filter((q) => q.boards);
    assert.ok(lintels.length > 0, 'the streets have boarded rooms in tall buildings');
    const seen = new Set();
    const plans = renderer.R.plans;
    plans.push = (q) => {
      seen.add(q);
      return Array.prototype.push.call(plans, q);
    };
    for (const q of lintels) {
      teleport(game, q.x + (q.boards.vertical ? -70 : 0), q.y + (q.boards.vertical ? 0 : 70));
      step(2);
    }
    assert.equal(plans.length, 0, 'the marks are drawn and the list emptied every frame');
    assert.equal(bad, null, `drawn with a bad number: ${bad}`);
    return { game, renderer, step, lintels, seen };
  };
  // Isometric: every doorway shows on a wall that faces the camera (or its inside does).
  const iso = marked({});
  assert.equal(iso.seen.size, 0);
  // Aligned with the streets: doors in walls that run up the screen are edge-on.
  const al = marked({ cameraAligned: true });
  const upright = al.lintels.filter((q) => q.boards.vertical);
  assert.ok(upright.length > 0, 'this map has a boarded door in a wall that runs north-south');
  assert.deepEqual([...al.seen].sort((a, b) => a.x - b.x), upright.sort((a, b) => a.x - b.x));
  // Straight down: all of them (the wall over the door would cover the planks).
  const top = marked({ camera: 'top' });
  assert.equal(top.seen.size, top.lintels.length);

  // Break in, then turn the camera: what is over the door is still there, the mark stays (now an open doorway).
  const { game, renderer, step, seen } = al;
  const q = upright[0];
  const o = q.boards;
  o.broken = true;
  game.world.removeObstacle(o);
  seen.clear();
  teleport(game, q.x - 70, q.y);
  step(2);
  assert.ok(seen.has(q), 'the open doorway keeps its mark');
  game.settings.cameraAligned = false;
  step(2);
  assert.ok(renderer.scene.props.some((r) => r.boards === o), 'the lintel survives the scene being rebuilt for the new angle');
  game.settings.cameraAligned = true;
  step(2);
  assert.ok(renderer.scene.props.some((r) => r.boards === o));
  assert.equal(bad, null, `drawn with a bad number: ${bad}`);
});

test('line of sight: bodies behind a building are left out, and fade in rather than pop', () => {
  const { game, renderer, step } = setup({ level: 'city', wanderers: 0, specials: false });
  step(2);
  game.zombies.length = 0;
  const p = game.player;
  // Somewhere the survivor can't see from inside the safe room: the far side of its wall.
  const room = game.world.map.startRoom.outer;
  const z = new Zombie(room.x + room.w / 2, room.y - 60, false);
  z.state = 'idle';
  game.zombies.push(z);
  assert.equal(game.world.segmentClear(p.x, p.y, z.x, z.y), false);
  renderer.render(game, { source: 'mouse', touch: { pressed: new Map(), move: {}, aim: {}, taps: [] }, frame: {} }, { layout: computeLayout(W, H, { l: 0, r: 0, t: 0, b: 0 }, game.settings), fps: 60, frameMs: 16, hintAlpha: 0, input: { touch: { pressed: new Map() } }, title: false });
  assert.equal(renderer.list.some((it) => it.o === z), false, 'hidden from the survivor: not drawn');
  assert.equal(renderer.xray.includes(z), false, 'and no outline either');
  // With line of sight off it is drawn.
  game.settings.los = false;
  renderer.render(game, { source: 'mouse', touch: { pressed: new Map(), move: {}, aim: {}, taps: [] }, frame: {} }, { layout: computeLayout(W, H, { l: 0, r: 0, t: 0, b: 0 }, game.settings), fps: 60, frameMs: 16, hintAlpha: 0, input: { touch: { pressed: new Map() } }, title: false });
  assert.equal(renderer.list.some((it) => it.o === z), true);
});
