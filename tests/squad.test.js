// A squad: more than one AI teammate (game.allies). The tuning panel's teammate is the
// first (game.ally); the trailer brings the squad up to four survivors. Zombies go for the
// nearest one, nobody overlaps, every one carries a light, and nobody shoots through a friend.
// (node --test runs each file in its own process, so the fake DOM globals stay here.)
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
const ctxStub = new Proxy({}, {
  get: (o, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}),
  set: () => true,
});
globalThis.document = { createElement: () => ({ width: 300, height: 150, style: {}, getContext: () => ctxStub }) };
globalThis.window = { devicePixelRatio: 2 };
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { Game } = await import('../src/game/game.js');
const { DEFAULTS } = await import('../src/settings.js');
const { Zombie, updateZombies, resolveCrowd } = await import('../src/game/zombies.js');
const { Lighting } = await import('../src/render/lighting.js');

const audio = new Proxy({ listener: { x: 0, y: 0 } }, { get: (o, k) => (k in o ? o[k] : () => {}) });
const idle = () => ({ source: 'mouse', move: { x: 0, y: 0 }, aimActive: false, aimX: 1, aimY: 0, aimRaw: 0, aimScreen: null, fire: false, assist: false, events: [] });

/** An empty run: no wanderers, no Witch, no Director. */
function make(over = {}) {
  const game = new Game({ ...DEFAULTS, playtestPrompt: false, wanderers: 0, witch: false, ...over }, audio, () => {});
  game.setViewport(844, 390);
  game.director.update = () => {};
  game.zombies = [];
  return game;
}

/** The first open patch of ground (nothing within r) on a coarse scan, reachable from the start. */
function openGround(game, r = 180) {
  const W = game.world;
  for (let y = 200; y < W.h - 200; y += 40) {
    for (let x = 200; x < W.w - 200; x += 40) {
      if (W.isFree(x, y, r) && Number.isFinite(game.goalField.pathDist(x, y))) return { x, y };
    }
  }
  throw new Error('no open ground');
}

function place(s, x, y) {
  s.x = x;
  s.y = y;
  s.vx = 0;
  s.vy = 0;
}

test('squad: game.ally is the first teammate; addAlly brings more', () => {
  const solo = make();
  assert.equal(solo.ally, null);
  assert.deepEqual(solo.allies, []);

  const g = make({ ally: true });
  assert.equal(g.allies.length, 1);
  assert.equal(g.ally, g.allies[0]);
  const b = g.addAlly('shotgun');
  const c = g.addAlly('smg', { x: g.player.x + 30, y: g.player.y });
  assert.equal(g.allies.length, 3);
  assert.equal(g.ally, g.allies[0], 'the first one stays game.ally');
  assert.equal(b.weapon.def.id, 'shotgun');
  assert.equal(c.x, g.player.x + 30);
  g.syncAlly(); // the setting is still on: the squad stays
  assert.equal(g.allies.length, 3);
  g.settings.ally = false;
  g.syncAlly();
  assert.deepEqual(g.allies, [], 'turning the teammate off clears the squad');
  g.ally = c;
  assert.deepEqual(g.allies, [c]);
});

test('squad: every teammate updates, and a hit lands on the one it was meant for', () => {
  const g = make({ ally: true });
  const b = g.addAlly();
  const c = g.addAlly();
  for (let i = 0; i < 30; i++) g.update(1 / 60, idle());
  for (const a of g.allies) assert.ok(a.alive && a.hp === 100);
  g.hurtAlly(25, null, undefined, c);
  assert.equal(c.hp, 75);
  assert.equal(g.ally.hp, 100);
  assert.equal(b.hp, 100);
  g.hurtAlly(10, null); // no teammate named: the first one, as before
  assert.equal(g.ally.hp, 90);
});

test('squad: zombies go for the nearest survivor, whichever teammate that is', () => {
  const g = make({ ally: true });
  const o = openGround(g);
  const [a, b, c] = [g.ally, g.addAlly(), g.addAlly()];
  place(g.player, o.x - 160, o.y);
  place(a, o.x, o.y - 120);
  place(b, o.x + 150, o.y);
  place(c, o.x, o.y + 120);
  const zs = [
    [a, o.x, o.y - 120 + 60],
    [b, o.x + 150 - 60, o.y],
    [c, o.x, o.y + 120 - 60],
  ].map(([who, x, y]) => {
    const z = new Zombie(x, y, true);
    z.alertDelay = 0;
    z.losT = 0; // checks its line of sight on the first frame (until then the flow field leads to you)
    z.hp = 1e6;
    z.who = who;
    g.zombies.push(z);
    return z;
  });
  for (let i = 0; i < 12; i++) {
    updateZombies(g, 1 / 60);
    resolveCrowd(g, 1 / 60);
  }
  for (const z of zs) {
    const tx = z.who.x - z.x;
    const ty = z.who.y - z.y;
    const along = (z.vx * tx + z.vy * ty) / (Math.hypot(tx, ty) * (Math.hypot(z.vx, z.vy) || 1));
    assert.ok(along > 0.9, `heads for its nearest teammate (cos ${along.toFixed(2)})`);
  }
});

test('squad: teammates never stand inside each other', () => {
  const g = make({ ally: true });
  const o = openGround(g);
  const others = [g.addAlly(), g.addAlly()];
  place(g.player, o.x - 150, o.y);
  place(g.ally, o.x, o.y);
  place(others[0], o.x + 3, o.y + 1);
  place(others[1], o.x - 2, o.y + 4);
  for (let i = 0; i < 20; i++) resolveCrowd(g, 1 / 60);
  const all = g.allies;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const d = Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y);
      assert.ok(d >= all[i].r + all[j].r - 0.5, `apart: ${d.toFixed(1)}`);
    }
  }
});

test('squad: every teammate on its feet carries a flashlight; a downed one only glows', () => {
  const g = make({ ally: true, night: true });
  const o = openGround(g);
  const [a, b, c] = [g.ally, g.addAlly(), g.addAlly()];
  place(g.player, o.x, o.y);
  place(a, o.x + 40, o.y);
  place(b, o.x - 40, o.y);
  place(c, o.x, o.y + 40);
  const L = new Lighting();
  const vr = { x: o.x - 600, y: o.y - 600, w: 1200, h: 1200 };
  const cones = () => {
    L.collect(g, vr);
    let n = 0;
    for (let i = 0; i < L.n; i++) if (L.lights[i].type === 1) n++;
    return n;
  };
  assert.equal(cones(), 3 + 2 * 3, 'yours (3 cones) and two per teammate');
  c.down = true;
  assert.equal(cones(), 3 + 2 * 2);
});

test('squad: a teammate holds fire while another one is in the way', () => {
  const g = make({ ally: true, moveSpeed: 0, zombieSpeed: 0, allyAccuracy: 1 });
  const o = openGround(g);
  const [a, b] = [g.ally, g.addAlly()];
  place(g.player, o.x, o.y - 100);
  place(a, o.x - 60, o.y);
  place(b, o.x, o.y); // between a and the zombie
  const z = new Zombie(o.x + 120, o.y, true);
  z.hp = 1e6;
  g.zombies.push(z);
  const magA = a.weapon.mag;
  let bFired = false;
  for (let i = 0; i < 90; i++) {
    g.update(1 / 60, idle());
    place(a, o.x - 60, o.y); // pinned in a line: a, b, the zombie
    place(b, o.x, o.y);
    place(z, o.x + 120, o.y);
    if (b.weapon.mag < b.weapon.def.mag || b.weapon.reloading) bFired = true;
  }
  assert.ok(bFired, 'the one with a clear shot takes it');
  assert.equal(a.weapon.mag, magA, 'the one behind never fires through its friend');
});
