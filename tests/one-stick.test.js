// The one-thumb version (portrait/, docs/CONTROLS.md "One stick"): its
// layout on phones held upright, the touch rules (one stick anywhere, tap to
// shove), the portrait page's own defaults, and the gun that aims and fires
// by itself (src/game/auto-aim.js): what it shoots, what it leaves alone,
// when it holds fire, and how it keeps your light off the Witch.
// (node --test runs each file in its own process, so the fake DOM globals stay here.)
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
const ctxStub = new Proxy({}, {
  get: (o, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}),
  set: () => true,
});
globalThis.document = { createElement: () => ({ width: 300, height: 150, style: {}, getContext: () => ctxStub }) };
globalThis.window = { devicePixelRatio: 2, ontouchstart: null };
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { computeLayout, hitButton, NARROW } = await import('../src/layout.js');
const { TouchControls } = await import('../src/input/touch-controls.js');
const { DEFAULTS, MODE, SCHEMA, defaultsFor, LEVEL_IDS, levelKey, forLevel, PORTRAIT_VIEW_SIZE } = await import('../src/settings.js');
const { Game } = await import('../src/game/game.js');
const { Zombie } = await import('../src/game/zombies.js');
const { AUTO, pickTarget, updateAutoAim, touchy, targetScore } = await import('../src/game/auto-aim.js');
const { seatWitchNear } = await import('../src/game/witch.js');
const { buildReport, reportText } = await import('../src/playtest.js');
const { wrapAngle } = await import('../src/util.js');

const PORTRAIT = defaultsFor('portrait');
const ONE = { ...DEFAULTS, controls: 'one' };
const NO_SAFE = { l: 0, r: 0, t: 0, b: 0 };
const NOTCH = { l: 0, r: 0, t: 47, b: 34 }; // an iPhone held upright
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- The portrait page's defaults ------------------------------------------------------------

test('the portrait page: one stick, a wider view and its own save; the landscape page is unchanged', () => {
  assert.equal(MODE, 'landscape', 'no data-mode: the landscape page');
  assert.equal(DEFAULTS.controls, 'twin');
  assert.equal(DEFAULTS.viewAnchor, 0.5);
  assert.equal(PORTRAIT.controls, 'one');
  assert.ok(PORTRAIT.viewAnchor < 0.5, 'you stand a little above the middle (your thumb covers the bottom)');
  for (const id of LEVEL_IDS) {
    assert.equal(forLevel(PORTRAIT, 'viewSize', id), PORTRAIT_VIEW_SIZE, `${id}: more of the street across a narrow screen`);
    assert.equal(forLevel(DEFAULTS, 'viewSize', id), 470);
  }
  // Only those differ.
  const diff = Object.keys(PORTRAIT).filter((k) => PORTRAIT[k] !== DEFAULTS[k]);
  assert.deepEqual(diff.sort(), ['controls', 'viewAnchor', ...LEVEL_IDS.map((id) => levelKey('viewSize', id))].sort());
  // Every new setting is in the panel, and every default (both pages) sits inside its slider / options.
  const items = SCHEMA.flatMap((g) => g.items);
  for (const k of ['controls', 'autoFire', 'autoReach', 'autoIdle', 'autoTurn', 'autoSafety', 'autoReload', 'avertWitch', 'viewAnchor']) {
    const it = items.find((i) => i.key === k);
    assert.ok(it, `${k} in the panel`);
    for (const D of [DEFAULTS, PORTRAIT]) {
      if (it.type === 'range') assert.ok(D[k] >= it.min && D[k] <= it.max, `${k} inside its slider`);
      if (it.type === 'select') assert.ok(it.options.some(([v]) => v === D[k]), `${k} is one of its options`);
    }
  }
});

// --- Layout ------------------------------------------------------------------------------------

const PHONES = [[320, 568], [360, 640], [375, 667], [375, 812], [390, 844], [430, 932]];
const inside = (b, L) => {
  const s = L.safe;
  if (b.shape === 'circle') return b.x - b.r >= s.l && b.x + b.r <= L.w - s.r && b.y - b.r >= s.t && b.y + b.r <= L.h - s.b;
  return b.x >= s.l && b.x + b.w <= L.w - s.r && b.y >= s.t && b.y + b.h <= L.h - s.b;
};
const box = (b) => (b.shape === 'circle' ? { x0: b.x - b.r, x1: b.x + b.r, y0: b.y - b.r, y1: b.y + b.r } : { x0: b.x, x1: b.x + b.w, y0: b.y, y1: b.y + b.h });
const overlap = (a, b) => {
  const A = box(a);
  const B = box(b);
  return A.x0 < B.x1 && B.x0 < A.x1 && A.y0 < B.y1 && B.y0 < A.y1;
};

test('portrait layout: everything on screen and clear of the notch, nothing overlaps, SHOVE under the right thumb', () => {
  for (const [w, h] of PHONES) {
    for (const safe of [NO_SAFE, NOTCH]) {
      const L = computeLayout(w, h, safe, PORTRAIT);
      const tag = `${w}x${h}${safe.t ? ' notch' : ''}`;
      assert.ok(L.one && L.narrow, tag);
      const all = [...L.buttons, { shape: 'rect', ...L.hp }];
      for (const b of all) assert.ok(inside(b, L), `${tag}: ${b.id || 'hp'} on screen`);
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(!overlap(all[i], all[j]), `${tag}: ${all[i].id || 'hp'} / ${all[j].id || 'hp'}`);
      const sh = L.byId.shove;
      assert.ok(sh.x > w * 0.7 && sh.y > h * 0.8, `${tag}: shove in the bottom right corner`);
      assert.ok(sh.r >= 34, `${tag}: a big target for a thumb`);
      // The resting stick doesn't sit on the buttons.
      const R = PORTRAIT.stickRadius;
      const ghost = { shape: 'circle', x: L.fixedMove.x, y: L.fixedMove.y, r: R };
      for (const b of L.buttons) assert.ok(!overlap(ghost, b), `${tag}: resting stick clear of ${b.id}`);
      assert.ok(inside(ghost, L), `${tag}: resting stick on screen`);
      // The clock goes under the top bar, the event bars under the clock.
      assert.ok(L.stats.y >= L.hp.y + L.hp.h, `${tag}: clock under the top bar`);
      assert.ok(L.bar.y > L.stats.y + 12 && L.bar.w <= w - 40, `${tag}: bars under the clock`);
      assert.ok(L.hp.w >= 120 && L.byId.swap.w >= 110, `${tag}: health and gun panels big enough to read`);
      assert.equal(L.splitX, w, 'one stick: no aim side');
    }
  }
});

test('the landscape twin-stick layout keeps its places', () => {
  const L = computeLayout(844, 390, NO_SAFE, DEFAULTS);
  assert.equal(L.one, false);
  assert.equal(L.narrow, false);
  assert.equal(L.splitX, 844 * DEFAULTS.zoneSplit);
  assert.deepEqual(L.byId.pause, { id: 'pause', shape: 'circle', x: 844 - 32, y: 32, r: 22 });
  assert.equal(L.stats.y, 14);
  assert.equal(L.bar.y, 34);
  assert.equal(L.topInset, 50);
  assert.ok(844 >= NARROW);
  // One stick held sideways: SHOVE bottom right, reload beside it, the stick bottom left.
  const O = computeLayout(844, 390, NO_SAFE, ONE);
  assert.ok(O.byId.shove.x > O.byId.reload.x && Math.abs(O.byId.shove.y + O.byId.shove.r - (O.byId.reload.y + O.byId.reload.r)) < 1);
  assert.ok(O.fixedMove.x < 844 / 3);
  for (const b of O.buttons) assert.ok(inside(b, O), b.id);
});

test('hiding the shove button hides it in the portrait layout too', () => {
  const L = computeLayout(390, 844, NO_SAFE, { ...PORTRAIT, shoveButton: false });
  assert.equal(hitButton(L.byId.shove, L.byId.shove.x, L.byId.shove.y), false);
});

// --- Touch -------------------------------------------------------------------------------------

function touch(settings, w = 390, h = 844) {
  const layout = computeLayout(w, h, NO_SAFE, settings);
  const tc = new TouchControls({ addEventListener() {} }, settings, () => layout);
  return { tc, layout };
}

test('one stick: a finger anywhere drives the move stick, even on the right; there is no aim stick', () => {
  const { tc } = touch({ ...PORTRAIT });
  tc._contact('start', 1, 330, 500); // right half
  assert.equal(tc.move.touchId, 1);
  assert.equal(tc.aim.active, false);
  tc._contact('move', 1, 330, 420);
  tc.update();
  assert.ok(tc.move.out.y < -0.99, 'pushed up the screen');
  // The same touch on the twin-stick layout would aim.
  const twin = touch({ ...PORTRAIT, controls: 'twin' }).tc;
  twin._contact('start', 1, 330, 500);
  assert.equal(twin.aim.touchId, 1);
});

test('one stick: a quick tap anywhere shoves; a hold or a drag does not', async () => {
  const { tc } = touch({ ...PORTRAIT });
  tc._contact('start', 1, 200, 400);
  tc._contact('move', 1, 205, 404); // a little roll
  tc._contact('end', 1, 205, 404);
  assert.deepEqual(tc.consumeEvents(), ['shove']);
  assert.equal(tc.move.active, false);

  tc._contact('start', 2, 200, 400);
  tc._contact('move', 2, 200, 340);
  tc._contact('move', 2, 200, 400);
  tc._contact('end', 2, 200, 400);
  assert.deepEqual(tc.consumeEvents(), [], 'a run that ends where it started is not a shove');

  tc._contact('start', 3, 200, 400);
  await sleep(PORTRAIT.tapMaxMs + 40);
  tc._contact('end', 3, 200, 400);
  assert.deepEqual(tc.consumeEvents(), [], 'a long press is not a shove');

  tc._contact('start', 4, 200, 400);
  tc._contact('cancel', 4, 200, 400);
  assert.deepEqual(tc.consumeEvents(), [], 'a cancelled touch is not a shove');

  const off = touch({ ...PORTRAIT, tapShove: false }).tc;
  off._contact('start', 1, 200, 400);
  off._contact('end', 1, 200, 400);
  assert.deepEqual(off.consumeEvents(), [], 'tap-shove switched off');
});

test('one stick: a second finger tapping while you run shoves, and the run goes on', () => {
  const { tc } = touch({ ...PORTRAIT });
  tc._contact('start', 1, 150, 650);
  tc._contact('move', 1, 150, 580);
  tc._contact('start', 2, 300, 300);
  tc._contact('end', 2, 300, 300);
  assert.deepEqual(tc.consumeEvents(), ['shove']);
  assert.equal(tc.move.touchId, 1);
  tc.update();
  assert.ok(tc.move.out.y < -0.9, 'still running');
});

test('one stick: buttons fire on touch-down and never start the stick', () => {
  const { tc, layout } = touch({ ...PORTRAIT });
  for (const id of ['shove', 'reload', 'swap', 'pause']) {
    const b = layout.byId[id];
    const x = b.shape === 'circle' ? b.x : b.x + b.w / 2;
    const y = b.shape === 'circle' ? b.y : b.y + b.h / 2;
    tc._contact('start', 9, x, y);
    assert.deepEqual(tc.consumeEvents(), [id]);
    assert.equal(tc.move.active, false, id);
    tc._contact('end', 9, x, y);
    assert.deepEqual(tc.consumeEvents(), [], `${id}: no tap-shove on release`);
  }
});

// --- The gun that aims itself ------------------------------------------------------------------

const audio = new Proxy({ listener: { x: 0, y: 0 } }, { get: (o, k) => (k in o ? o[k] : () => {}) });
const frame = (move = { x: 0, y: 0 }, events = []) => ({ source: 'touch', move, aimActive: false, aimX: 1, aimY: 0, aimRaw: 0, aimScreen: null, fire: false, assist: true, auto: true, events });

/** A one-stick run with nobody on the map (the director asleep), seen on a phone held upright. */
function make(over = {}) {
  const settings = { ...PORTRAIT, playtestPrompt: false, wanderers: 0, witch: false, godMode: true, ...over };
  const game = new Game(settings, audio, () => {});
  game.setViewport(390, 844);
  game.director.update = () => {};
  game.zombies = [];
  return game;
}

/** A bearing from the survivor with `dist` of open, visible ground. */
function openBearing(game, dist) {
  const p = game.player;
  const W = game.world;
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2;
    const x = p.x + Math.cos(a) * dist;
    const y = p.y + Math.sin(a) * dist;
    if (W.isFree(x, y, 14) && W.segmentClear(p.x, p.y, x, y, W.shotBlockers) && W.segmentClear(p.x, p.y, x, y, W.moveBlockers) && game.onScreen(x, y, 0)) return a;
  }
  throw new Error(`no open bearing of ${dist}`);
}

/** Move the survivor into the open (a street), where there is room to look around. */
function intoTheOpen(game) {
  const p = game.player;
  const W = game.world;
  for (let r = 0; r < 2400; r += 60) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = p.x + Math.cos(a) * r;
      const y = p.y + Math.sin(a) * r;
      if (!W.isFree(x, y, 14)) continue;
      let open = 0;
      for (let j = 0; j < 8; j++) {
        const b = (j / 8) * Math.PI * 2;
        if (W.segmentClear(x, y, x + Math.cos(b) * 260, y + Math.sin(b) * 260, W.shotBlockers)) open++;
      }
      if (open >= 6) {
        p.x = x;
        p.y = y;
        game.camera.x = x;
        game.camera.y = y;
        game.syncView();
        return;
      }
    }
  }
  throw new Error('no open ground');
}

function zombieAt(game, ang, dist, chasing = true) {
  const p = game.player;
  const z = new Zombie(p.x + Math.cos(ang) * dist, p.y + Math.sin(ang) * dist, chasing);
  z.alertDelay = 0;
  game.zombies.push(z);
  return z;
}

test('it swings onto a zombie coming for you and shoots it down, without your thumb', () => {
  const game = make();
  intoTheOpen(game);
  const p = game.player;
  const a = openBearing(game, 300);
  p.facing = p.aimAngle = p.fireAngle = a + Math.PI; // looking the other way
  const z = zombieAt(game, a, 300);
  z.speed = 0; // stand still, so it's about the gun
  game.update(1 / 60, frame());
  assert.equal(p.autoTarget, z, 'picked');
  assert.equal(p.firing, false, 'not before it is lined up');
  // It swings at autoTurn, not in one frame.
  assert.ok(Math.abs(wrapAngle(p.aimAngle - (a + Math.PI))) <= (game.settings.autoTurn * Math.PI) / 180 / 60 + 1e-6);
  let firedAt = null;
  for (let i = 0; i < 180 && z.alive; i++) {
    game.update(1 / 60, frame());
    if (p.firing && firedAt === null) firedAt = i;
  }
  assert.ok(firedAt !== null && firedAt < 30, `fired once lined up (frame ${firedAt})`);
  assert.equal(z.alive, false, 'and killed it');
  assert.ok(game.stats.shots > 0 && game.stats.kills === 1);
});

test('it leaves a wanderer that has not noticed you alone, unless it is close', () => {
  const game = make();
  intoTheOpen(game);
  const S = game.settings;
  const a = openBearing(game, 260);
  const far = zombieAt(game, a, S.autoIdle + 60, false);
  assert.equal(pickTarget(game, game.player, S), null, 'an unaware wanderer further off: gunfire would only bring the rest');
  far.state = 'chase';
  assert.equal(pickTarget(game, game.player, S), far, 'once it comes for you, it is shot');
  game.zombies = [];
  const near = zombieAt(game, a, S.autoIdle - 40, false);
  assert.equal(pickTarget(game, game.player, S), near, 'too close to leave be');
});

test('threats first: a Tank rock or a leaping Hunter before a common that is further off', () => {
  const S = PORTRAIT;
  const reach = 500;
  const common = targetScore({ type: 'common', state: 'chase' }, 150, reach, S);
  assert.ok(targetScore({ type: 'rock' }, 300, reach, S) < common);
  assert.ok(targetScore({ type: 'hunter', mode: 'leap' }, 300, reach, S) < common);
  assert.ok(targetScore({ type: 'witch', mode: 'charge' }, 400, reach, S) < common);
  assert.ok(targetScore({ type: 'terror', mode: 'lunge' }, 300, reach, S) < common);
  // On you beats further off.
  assert.ok(targetScore({ type: 'common', state: 'chase' }, 40, reach, S) < targetScore({ type: 'common', state: 'chase' }, 200, reach, S));
});

test('never a target: a Witch left alone, a Night Terror in the dark, the dead, what is out of sight or reach', () => {
  const game = make();
  intoTheOpen(game);
  const S = game.settings;
  const a = openBearing(game, 200);
  const z = zombieAt(game, a, 200);
  z.passive = true;
  assert.equal(pickTarget(game, game.player, S), null, 'passive (a Witch left crying)');
  z.passive = false;
  z.ghost = true;
  assert.equal(pickTarget(game, game.player, S), null, 'a ghost (an unlit Night Terror)');
  z.ghost = false;
  z.alive = false;
  assert.equal(pickTarget(game, game.player, S), null, 'dead');
  z.alive = true;
  assert.equal(pickTarget(game, game.player, S), z);
  assert.equal(pickTarget(game, game.player, { ...S, autoReach: 150 / game.player.weapon.def.range }), null, 'out of reach');
});

test('trigger discipline: no shot whose line carries on into an alarm, a gas pump or boards, unless it is on you', () => {
  assert.equal(touchy({ alarm: true }), true);
  assert.equal(touchy({ alarm: true, alarmOn: true }), false, 'already ringing');
  assert.equal(touchy({ alarm: true, alarmDone: true }), false);
  assert.equal(touchy({ explosive: true, group: { done: false } }), true);
  assert.equal(touchy({ explosive: true, group: { done: true } }), false, 'already blown');
  assert.equal(touchy({ boards: true }), true);
  assert.equal(touchy({ boards: true, broken: true }), false);
  assert.equal(touchy({}), false);
  assert.equal(touchy(null), false);

  const game = make();
  intoTheOpen(game);
  const p = game.player;
  const S = game.settings;
  const a = openBearing(game, 300);
  const z = zombieAt(game, a, 250);
  // Past the target, the line runs on into an alarm car (the full-range ray; the sight line to the target stays clear).
  const raycast = game.world.raycast.bind(game.world);
  game.world.raycast = (ox, oy, dx, dy, max, list) => {
    const hit = raycast(ox, oy, dx, dy, max, list);
    return max === p.weapon.def.range ? { ...hit, obstacle: { alarm: true } } : hit;
  };
  assert.equal(pickTarget(game, p, S), null, 'held');
  assert.equal(pickTarget(game, p, { ...S, autoSafety: false }), z, 'switched off');
  z.x = p.x + Math.cos(a) * (AUTO.dangerClose - 10);
  z.y = p.y + Math.sin(a) * (AUTO.dangerClose - 10);
  assert.equal(pickTarget(game, p, S), z, 'on you: shoot anyway');
});

test('"only when you stand still": it aims while you run, and fires when you stop', () => {
  const game = make({ autoFire: 'still' });
  intoTheOpen(game);
  const p = game.player;
  const a = openBearing(game, 300);
  zombieAt(game, a, 280).speed = 0;
  p.aimAngle = a;
  assert.equal(updateAutoAim(game, p, 1 / 60, frame({ x: 0.8, y: 0 })), false, 'running');
  assert.ok(p.autoTarget, 'but still on it');
  assert.equal(updateAutoAim(game, p, 1 / 60, frame()), true, 'stopped');
  game.settings.autoFire = 'always';
  assert.equal(updateAutoAim(game, p, 1 / 60, frame({ x: 0.8, y: 0 })), true, 'run and gun');
});

test('with nothing in reach it tops the magazine up', () => {
  const game = make();
  const w = game.player.weapon;
  w.mag = Math.floor(w.cap * AUTO.reloadBelow) - 1;
  for (let i = 0; i < Math.round(AUTO.reloadIdle * 60) - 6; i++) game.update(1 / 60, frame());
  assert.equal(w.reloading, false, 'not at once');
  for (let i = 0; i < 12; i++) game.update(1 / 60, frame());
  assert.equal(w.reloading, true);
  const full = make();
  for (let i = 0; i < 120; i++) full.update(1 / 60, frame());
  assert.equal(full.player.weapon.reloading, false, 'a magazine that is still well filled is left');
  const off = make({ autoReload: false });
  off.player.weapon.mag = 1;
  for (let i = 0; i < 120; i++) off.update(1 / 60, frame());
  assert.equal(off.player.weapon.reloading, false, 'switched off');
});

test('your light stays off a Witch left alone, while the gun has nothing to aim at', () => {
  const game = make({ witch: true, night: true });
  intoTheOpen(game);
  const p = game.player;
  seatWitchNear(game);
  const w = game.witches[game.witches.length - 1];
  assert.ok(w && w.passive);
  // Stand 200 u from her, looking right at her.
  const a = Math.atan2(p.y - w.y, p.x - w.x);
  p.x = w.x + Math.cos(a) * 200;
  p.y = w.y + Math.sin(a) * 200;
  p.facing = p.aimAngle = p.fireAngle = Math.atan2(w.y - p.y, w.x - p.x) + 0.1;
  p.aimHoldT = 0;
  game.update(1 / 60, frame());
  const toHer = Math.atan2(w.y - p.y, w.x - p.x);
  assert.equal(p.autoTarget, null, 'she is not a target');
  assert.ok(Math.abs(wrapAngle(p.facing - toHer)) >= AUTO.witchMargin - 1e-6, 'turned the beam off her');
  assert.ok(wrapAngle(p.facing - toHer) > 0, 'on the side you were already looking');
  const off = make({ witch: true, night: true, avertWitch: false });
  intoTheOpen(off);
  seatWitchNear(off);
  const w2 = off.witches[off.witches.length - 1];
  const q = off.player;
  q.facing = q.aimAngle = q.fireAngle = Math.atan2(w2.y - q.y, w2.x - q.x);
  q.aimHoldT = 0;
  off.update(1 / 60, frame());
  assert.ok(Math.abs(wrapAngle(q.facing - Math.atan2(w2.y - q.y, w2.x - q.x))) < 0.05, 'switched off: you look where you look');
});

test('a frame that aims by hand (a gamepad right stick) still aims by hand', () => {
  const game = make();
  intoTheOpen(game);
  const p = game.player;
  const a = openBearing(game, 300);
  const z = zombieAt(game, a, 280);
  z.speed = 0;
  const manual = { ...frame(), auto: false, aimActive: true, aimX: Math.cos(a + Math.PI), aimY: Math.sin(a + Math.PI), aimRaw: 1 };
  game.update(1 / 60, manual);
  assert.equal(p.autoTarget, null);
  assert.equal(p.firing, false, 'no trigger pulled');
});

test('at a desk, one stick: the mouse is a thumb (drag to move, a quick click shoves, buttons press)', async () => {
  const { Input } = await import('../src/input/input.js');
  globalThis.navigator ??= {};
  const winH = {};
  const add = window.addEventListener;
  window.addEventListener = (t, fn) => (winH[t] ||= []).push(fn);
  const canvasH = {};
  const settings = { ...PORTRAIT };
  const layout = computeLayout(390, 844, NO_SAFE, settings);
  const input = new Input({ addEventListener: (t, fn) => (canvasH[t] = fn) }, settings, () => layout);
  window.addEventListener = add;
  const ev = (x, y, more = {}) => ({ button: 0, buttons: 1, clientX: x, clientY: y, pointerType: 'mouse', preventDefault() {}, ...more });
  const down = (x, y, more) => canvasH.mousedown(ev(x, y, more));
  const move = (x, y) => winH.pointermove.forEach((fn) => fn(ev(x, y)));
  const up = (x, y) => winH.mouseup.forEach((fn) => fn(ev(x, y, { buttons: 0 })));

  down(150, 650);
  move(150, 580);
  let f = input.sample();
  assert.equal(f.source, 'touch', 'the mouse drives the touch stick');
  assert.ok(f.move.y < -0.9, 'dragged up: run up the screen');
  assert.equal(f.auto, true, 'and the gun still aims itself');
  assert.equal(f.fire, false);
  up(150, 580);
  assert.deepEqual(input.sample().events, [], 'a drag is not a shove');
  assert.equal(input.touch.move.active, false);

  // Two quick clicks in a row: two shoves (the mouse isn't mistaken for the mouse events a touch leaves behind).
  for (let i = 0; i < 2; i++) {
    down(200, 400);
    up(200, 400);
  }
  assert.deepEqual(input.sample().events, ['shove', 'shove']);

  const sh = layout.byId.reload;
  down(sh.x, sh.y);
  up(sh.x, sh.y);
  assert.deepEqual(input.sample().events, ['reload'], 'a click on a button presses it');

  // Twin stick: the mouse aims and fires again.
  await sleep(5); // the mouse used last (not the thumb it stood in for) owns the frame
  settings.controls = 'twin';
  down(300, 300);
  f = input.sample();
  assert.equal(f.source, 'mouse');
  assert.equal(f.fire, true);
  assert.equal(f.auto, false);
  up(300, 300);
});

test('playtest reports say which page and controls a run was played with', () => {
  const game = make();
  const r = buildReport(game, {});
  assert.equal(r.page, 'landscape');
  assert.equal(r.controls, 'one');
  assert.match(reportText(r).split('\n')[0], /one stick/);
});
