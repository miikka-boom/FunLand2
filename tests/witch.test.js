// The Witch: where she sits (seeded, fair, on every map type), what wears her
// patience down, what startles her, the fight, and how the rest of the game
// treats her while she is left alone.
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

const { Game, GENERATORS } = await import('../src/game/game.js');
const { DEFAULTS, SCHEMA, WORLD_KEYS } = await import('../src/settings.js');
const { WITCH, WITCH_TUNE, Witch, startle, witchOutcome, seatWitchNear } = await import('../src/game/witch.js');
const { addWitch, WITCH_SPACE } = await import('../src/world/witch-gen.js');
const { addScavenging } = await import('../src/world/scavenge-gen.js');
const { addWorldFeatures } = await import('../src/world/features-gen.js');
const { addLore } = await import('../src/world/lore-gen.js');
const { addBen } = await import('../src/world/ben-gen.js');
const { WITCH_GRAFFITI } = await import('../src/world/lore-content.js');
const { World, FlowField, NAV_CELL } = await import('../src/world/world.js');
const { hitscan, shove } = await import('../src/game/player.js');
const { WEAPONS } = await import('../src/game/weapons.js');
const { witchLine } = await import('../src/render/hud.js');
const { buildReport } = await import('../src/playtest.js');
const { pointInRect } = await import('../src/util.js');

const INF = 0x3fffffff;
const SHOTGUN = WEAPONS.find((w) => w.id === 'shotgun');
const SMG = WEAPONS.find((w) => w.id === 'smg');
const audio = new Proxy({ listener: { x: 0, y: 0 } }, { get: (o, k) => (k in o ? o[k] : () => {}) });
const frame = (aim = null, fire = false, events = []) => ({ source: 'mouse', move: { x: 0, y: 0 }, aimActive: !!aim, aimX: aim ? aim.x : 1, aimY: aim ? aim.y : 0, aimRaw: aim ? 1 : 0, aimScreen: null, fire, assist: false, events });

/** A run with nobody on the map but her (and you). */
function make(over = {}) {
  const settings = { ...DEFAULTS, playtestPrompt: false, wanderers: 0, ...over };
  const game = new Game(settings, audio, () => {});
  game.setViewport(844, 390);
  game.director.update = () => {};
  game.zombies = game.zombies.filter((z) => z.type === 'witch');
  return game;
}
const step = (game, secs, f) => {
  for (let i = 0; i < Math.round(secs * 60); i++) game.update(1 / 60, f || frame());
};
/** A free spot `dist` from her with nothing between you (a: the bearing from her to you). */
function spotAt(game, w, dist) {
  for (let k = 0; k < 96; k++) {
    const a = (k / 96) * Math.PI * 2;
    const x = w.seat.x + Math.cos(a) * dist;
    const y = w.seat.y + Math.sin(a) * dist;
    if (game.world.isFree(x, y, 14) && game.world.segmentClear(x, y, w.seat.x, w.seat.y, game.world.moveBlockers) && game.world.segmentClear(x, y, w.seat.x, w.seat.y)) return { x, y, a };
  }
  throw new Error(`no free spot ${dist} from her`);
}
/** Stand `dist` from her, looking at her or away, for up to `secs`; returns when she got up (or Infinity). */
function stand(game, dist, facing, secs, s = spotAt(game, game.witches[0], dist)) {
  const w = game.witches[0];
  const p = game.player;
  const f = facing === 'her' ? s.a + Math.PI : s.a;
  for (let t = 0; t < secs; t += 1 / 60) {
    p.x = s.x;
    p.y = s.y;
    p.vx = 0;
    p.vy = 0;
    p.facing = f;
    p.aimAngle = f;
    p.fireAngle = f;
    game.update(1 / 60, frame());
    if (w.mode !== 'sit') return t;
  }
  return Infinity;
}
function put(game, s, facing) {
  const p = game.player;
  p.x = s.x;
  p.y = s.y;
  p.vx = 0;
  p.vy = 0;
  p.facing = facing;
  p.aimAngle = facing;
  p.fireAngle = facing;
}
/** One blast of a gun from where you stand, straight at her. */
function shootHer(game, def, who = game.player) {
  const w = game.witches[0];
  const ang = Math.atan2(w.y - who.y, w.x - who.x);
  const spread = def.pellets > 1 ? (def.spread * Math.PI) / 180 : 0;
  for (let i = 0; i < def.pellets; i++) {
    const f = def.pellets > 1 ? i / (def.pellets - 1) - 0.5 : 0;
    hitscan(game, who, who.x + Math.cos(ang) * 24, who.y + Math.sin(ang) * 24, ang + f * 2 * spread * 0.85, def, who === game.player);
  }
}

// --- Where she sits --------------------------------------------------------------------------

/** The walk from the start to the goal with her whole space walled off (Infinity if there is none). */
function walkAround(map, w) {
  const world = new World({ ...map, obstacles: map.obstacles.filter((o) => !o.opens && !o.boards), sealed: [] }, { strict: true });
  const open = new FlowField(world);
  const er = map.endRoom.interior;
  open.compute(er.x + er.w / 2, er.y + er.h / 2);
  const closed = Object.create(world);
  closed.blocked = Uint8Array.from(world.blocked);
  const keep = WITCH_SPACE + 14; // her space and half a body
  for (let i = 0; i < closed.blocked.length; i++) {
    const cx = ((i % world.navW) + 0.5) * NAV_CELL;
    const cy = (Math.floor(i / world.navW) + 0.5) * NAV_CELL;
    if (Math.hypot(cx - w.x, cy - w.y) < keep) closed.blocked[i] = 1;
  }
  const f = new FlowField(closed);
  f.compute(er.x + er.w / 2, er.y + er.h / 2);
  return { world, direct: open.pathDist(map.start.x, map.start.y), around: f.pathDist(map.start.x, map.start.y), toGoal: open.pathDist(w.x, w.y) };
}

for (const [level, gen] of Object.entries(GENERATORS)) {
  test(`${level}: the Witch has a seat on (nearly) every map: seeded, near the way, with room, and you can always walk round her`, () => {
    let placed = 0;
    let inWay = 0;
    const N = 14;
    for (let k = 0; k < N; k++) {
      const seed = k * 7919 + 3;
      const build = () => {
        const map = gen(seed);
        addScavenging(map, seed);
        addWitch(map, seed);
        return map;
      };
      const map = build();
      assert.deepEqual(build().witches, map.witches, `seed ${seed}: the same seed seats her in the same place`);
      assert.ok(map.witches.length <= 1);
      if (!map.witches.length) continue;
      placed++;
      const w = map.witches[0];
      if (w.detour <= 110) inWay++;
      const { world, direct, around, toGoal } = walkAround(map, w);
      assert.ok(world.isFree(w.x, w.y, 24), `seed ${seed}: room to sit`);
      assert.ok(Number.isFinite(around), `seed ${seed}: no way round her`);
      assert.ok(around - direct <= 470, `seed ${seed}: the way round costs ${Math.round(around - direct)} u`);
      assert.ok(w.detour <= 340, `seed ${seed}: near the way (${w.detour})`);
      assert.ok(toGoal >= 700, `seed ${seed}: not on the doorstep of the safe room`);
      assert.ok(Math.hypot(w.x - map.start.x, w.y - map.start.y) > 300 && !pointInRect(w.x, w.y, map.startRoom.outer, 250) && !pointInRect(w.x, w.y, map.endRoom.outer, 250));
      // Clear of what you have to stop for, and of what makes noise or light.
      for (const s of map.stashes) assert.ok(Math.hypot(s.x - w.x, s.y - w.y) >= 225, `seed ${seed}: a find in her space`);
      for (const q of map.pickups) assert.ok(Math.hypot(q.x - w.x, q.y - w.y) >= 88, `seed ${seed}: a medkit at her feet`);
      for (const f of map.fires) assert.ok(Math.hypot(f.x - w.x, f.y - w.y) >= 275, `seed ${seed}: a fire next to her`);
      for (const o of map.obstacles) if (o.alarm) assert.ok(Math.hypot(o.x + o.w / 2 - w.x, o.y + o.h / 2 - w.y) >= 175, `seed ${seed}: an alarm next to her`);
      if (map.finale) assert.ok(!pointInRect(w.x, w.y, map.finale.pier, 200), `seed ${seed}: on the pier where you hold out`);
    }
    assert.ok(placed >= N - 1, `seated on ${placed} of ${N} maps`);
    assert.ok(inWay >= N * 0.5, `in your way on ${inWay} of ${N}`);
  });
}

test('with the holdout gate and the breach on the map, she sits clear of where you have to stand and fight', () => {
  for (const level of ['city', 'interior']) {
    for (const seed of [1337, 3, 7922, 15841]) {
      const map = GENERATORS[level](seed);
      addWorldFeatures(map, seed, { holdout: true, routes: true, landmarks: true });
      addScavenging(map, seed);
      addWitch(map, seed);
      for (const w of map.witches) {
        if (map.holdout) assert.ok(Math.hypot(map.holdout.x - w.x, map.holdout.y - w.y) >= 600, `${level} ${seed}: at the gate`);
        if (map.breach) assert.ok(Math.hypot(map.breach.x - w.x, map.breach.y - w.y) >= 430, `${level} ${seed}: at the breach`);
        for (const l of map.landmarks) assert.ok(Math.hypot(l.x - w.x, l.y - w.y) >= 330, `${level} ${seed}: at a landmark`);
        assert.ok(Number.isFinite(walkAround(map, w).around), `${level} ${seed}: no way round her`);
      }
    }
  }
});

test('the writing knows about her: a warning on the way, nothing written or camped in her space, and Ben sleeps elsewhere', () => {
  const lines = new Set(WITCH_GRAFFITI.flatMap((g) => [g.text, g.pair].filter(Boolean)));
  let warned = 0;
  let maps = 0;
  for (const [level, gen] of Object.entries(GENERATORS)) {
    for (const seed of [1337, 3, 7922]) {
      const map = gen(seed);
      addScavenging(map, seed);
      addWitch(map, seed);
      addLore(map, seed);
      addBen(map, seed, { level });
      if (!map.witches.length) continue;
      maps++;
      const w = map.witches[0];
      const warning = map.decor.find((d) => d.witch);
      if (warning) {
        warned++;
        assert.ok(lines.has(warning.text));
        const air = Math.hypot(warning.x - w.x, warning.y - w.y);
        assert.ok(air >= 240 && air <= 640, `${level} ${seed}: the warning is ${Math.round(air)} u from her`);
      }
      // Her space is hers.
      for (const d of map.decor) {
        if (d.type === 'graffiti' || d.type === 'doodle' || d.type === 'mattress' || d.type === 'stand' || d.type === 'sign') {
          assert.ok(Math.hypot(d.x - w.x, d.y - w.y) > 150, `${level} ${seed}: ${d.type} "${d.text || ''}" in her space`);
        }
      }
      for (const den of map.dens) assert.ok(Math.hypot(den.x - w.x, den.y - w.y) > 280, `${level} ${seed}: a den next to her`);
      if (map.ben && map.ben.nest) assert.ok(Math.hypot(map.ben.nest.x - w.x, map.ben.nest.y - w.y) > 240, `${level} ${seed}: Ben's bed next to her`);
    }
  }
  assert.ok(warned >= maps * 0.7, `a warning on ${warned} of ${maps} maps`);
  // Without her, nobody writes about her.
  const plain = GENERATORS.city(1337);
  addScavenging(plain, 1337);
  addLore(plain, 1337);
  assert.ok(!plain.decor.some((d) => lines.has(d.text)));
});

// --- In the game -------------------------------------------------------------------------------

test('on by default: one Witch per run, seated at the map\'s spot, and no threat while she is left alone', () => {
  assert.equal(DEFAULTS.witch, true);
  assert.ok(WORLD_KEYS.includes('witch'), 'switching her on or off restarts the run (she is part of the map)');
  const keys = SCHEMA.flatMap((g) => g.items.map((i) => i.key));
  for (const k of ['witch', 'witchPatience', 'witchHealth']) assert.ok(keys.includes(k) && k in DEFAULTS, k);
  const game = make();
  assert.equal(game.witches.length, 1);
  const w = game.witches[0];
  assert.ok(game.zombies.includes(w) && w instanceof Witch && w.type === 'witch');
  assert.deepEqual([w.x, w.y], [game.world.map.witches[0].x, game.world.map.witches[0].y]);
  assert.equal(w.mode, 'sit');
  assert.equal(w.passive, true);
  assert.equal(w.hp, WITCH.hp);
  assert.equal(WITCH.far, WITCH_SPACE);
  assert.ok(WITCH.speed > DEFAULTS.moveSpeed * 1.3, 'you cannot outrun her');
  // Far away she stays as she is, for as long as you like.
  step(game, 8);
  assert.equal(w.mode, 'sit');
  assert.equal(w.anger, 0);
  assert.deepEqual([w.x, w.y], [w.seat.x, w.seat.y]);
  assert.equal(witchOutcome(game), 'unheard');
  assert.equal(witchLine(game), null);
  // Switched off: none, and the map says nothing of her.
  const none = make({ witch: false });
  assert.equal(none.witches.length, 0);
  assert.equal(none.world.map.witches, undefined);
  assert.equal(witchOutcome(none), null);
  // Her health follows the setting.
  assert.equal(make({ witchHealth: 2 }).witches[0].hp, WITCH.hp * 2);
});

test('her space: the nearer you stand the sooner she is up; at its edge, or behind a wall, she bears you', () => {
  const at60 = stand(make(), 60, 'away', 5);
  const at100 = stand(make(), 100, 'away', 12);
  const at130 = stand(make(), 130, 'away', 30);
  assert.ok(at60 < 1.2, `at 60 u she is up in ${at60.toFixed(2)} s`);
  assert.ok(at100 > at60 * 1.5 && at100 < 4, `at 100 u: ${at100.toFixed(2)} s`);
  assert.ok(at130 > at100 * 1.5 && at130 < 12, `at 130 u: ${at130.toFixed(2)} s`);
  const edge = make();
  assert.equal(stand(edge, WITCH.far - 4, 'away', 25), Infinity, 'at the edge of her space she only stirs');
  assert.ok(edge.witches[0].anger < 0.2);
  assert.equal(stand(make(), WITCH.far + 30, 'away', 25), Infinity);
  // A wall between you: she doesn't know you're there.
  const walled = make();
  const behind = spotAt(walled, walled.witches[0], 90);
  walled.world.segmentClear = () => false;
  assert.equal(stand(walled, 90, 'away', 10, behind), Infinity);
  assert.equal(walled.witches[0].anger, 0);
  // More patience (the setting) buys time in proportion.
  const patient = stand(make({ witchPatience: 2 }), 100, 'away', 12);
  assert.ok(patient > at100 * 1.7 && patient < at100 * 2.4, `twice the patience: ${patient.toFixed(2)} s against ${at100.toFixed(2)} s`);
});

test('back off and she settles: the ring opens again, and she goes back to crying', () => {
  const game = make();
  const w = game.witches[0];
  const s = spotAt(game, w, 100);
  for (let t = 0; t < 1.2; t += 1 / 60) {
    put(game, s, s.a);
    game.update(1 / 60, frame());
  }
  const peak = w.anger;
  assert.ok(peak > 0.35 && peak < 1 && w.mode === 'sit', `anger ${peak.toFixed(2)}`);
  assert.ok(game.messages.some((m) => m.text.startsWith('SHE HEARD YOU')), 'you are told');
  assert.ok(w.look > 0.1, 'her head is up');
  const far = spotAt(game, w, 420);
  for (let t = 0; t < 1; t += 1 / 60) {
    put(game, far, far.a);
    game.update(1 / 60, frame());
  }
  assert.ok(w.anger > peak - 0.05, 'for a moment nothing changes');
  for (let t = 0; t < WITCH.calmTime + 1.5; t += 1 / 60) {
    put(game, far, far.a);
    game.update(1 / 60, frame());
  }
  assert.equal(w.anger, 0);
  assert.equal(w.mode, 'sit');
  assert.ok(w.look < 0.05);
});

test('your flashlight on her (nights): a few seconds and she is up; look away, stand off, or wait for day, and she is not', () => {
  const lit = stand(make(), 230, 'her', 12);
  assert.ok(lit > 1.5 && lit < 6, `from 230 u with the beam on her: ${lit.toFixed(2)} s`);
  assert.equal(stand(make(), 230, 'away', 12), Infinity, 'your back to her');
  assert.equal(stand(make(), WITCH.lightRange + 40, 'her', 12), Infinity, 'too far off for your light to trouble her');
  assert.equal(stand(make({ night: false }), 230, 'her', 12), Infinity, 'by day there is no beam');
});

test('a shot fired right next to her makes her flinch; a firefight there gets her up; further off, or the teammate\'s gun, does not', () => {
  const game = make();
  const w = game.witches[0];
  const near = spotAt(game, w, WITCH.far + 20); // outside her space: only the noise counts
  put(game, near, near.a);
  game.noise(near.x, near.y, SMG.noise);
  const one = w.anger;
  assert.ok(one > 0 && one < 0.05, `one round: ${one.toFixed(3)}`);
  assert.ok(w.flinch > 0);
  // A louder gun costs more.
  const g2 = make();
  put(g2, near, near.a);
  g2.noise(near.x, near.y, SHOTGUN.noise);
  assert.ok(g2.witches[0].anger > one);
  // Out of earshot: nothing.
  const g3 = make();
  g3.noise(w.x + WITCH.shotRange + 10, w.y, SMG.noise);
  assert.equal(g3.witches[0].anger, 0);
  // Emptying a magazine beside her gets her up, and she comes for you.
  const close = spotAt(game, w, WITCH.far + 5);
  put(game, close, close.a);
  for (let i = 0; i < 400 && w.mode === 'sit'; i++) {
    game.noise(close.x, close.y, SMG.noise);
    put(game, close, close.a);
    game.update(1 / 60, frame());
  }
  assert.notEqual(w.mode, 'sit');
  assert.equal(w.target, game.player);
  // The teammate's gun is not your doing.
  const g4 = make({ ally: true });
  const w4 = g4.witches[0];
  const s4 = spotAt(g4, w4, 60);
  g4.ally.x = s4.x;
  g4.ally.y = s4.y;
  for (let i = 0; i < 60; i++) g4.noise(s4.x, s4.y, SMG.noise);
  assert.equal(w4.anger, 0);
});

test('touch her and she is up at once, and after you: a stray bullet, a shove', () => {
  const game = make();
  const w = game.witches[0];
  const s = spotAt(game, w, 320);
  put(game, s, s.a + Math.PI);
  shootHer(game, SMG);
  assert.equal(w.mode, 'rise');
  assert.equal(w.passive, false);
  assert.equal(w.target, game.player);
  assert.equal(game.stats.witchStartled, 1);
  assert.ok(w.hp > WITCH.hp - SMG.dmg - 1, 'from that far, a bullet is a bullet');
  game.update(1 / 60, frame());
  assert.ok(game.messages.some((m) => m.text === 'YOU STARTLED THE WITCH'));
  assert.equal(witchOutcome(game), 'startled');
  // A shove.
  const g2 = make();
  const w2 = g2.witches[0];
  const s2 = spotAt(g2, w2, 30);
  put(g2, s2, s2.a + Math.PI);
  g2.zhash.clear();
  g2.zhash.insert(w2);
  shove(g2);
  assert.equal(w2.mode, 'rise');
  assert.equal(w2.target, g2.player);
});

test('caught sitting at arm\'s length, one shotgun blast ends it; from further off it only wakes her', () => {
  const game = make();
  const w = game.witches[0];
  const s = spotAt(game, w, 70);
  put(game, s, s.a + Math.PI);
  shootHer(game, SHOTGUN);
  assert.equal(w.alive, false);
  assert.equal(game.stats.crowns, 1);
  assert.equal(game.stats.witches, 1);
  assert.ok(game.messages.some((m) => m.text === 'GOOD NIGHT.'));
  game.update(1 / 60, frame());
  assert.ok(!game.messages.some((m) => m.text === 'YOU STARTLED THE WITCH'), 'she never got to scream');
  assert.equal(witchOutcome(game), 'crowned');
  assert.equal(witchLine(game), 'the witch: one blast, good night');
  assert.equal(buildReport(game).specials.witch, 'crowned');
  // From outside arm's length the same blast is only pellets.
  const far = make();
  const wf = far.witches[0];
  const sf = spotAt(far, wf, WITCH.crownRange + 30);
  put(far, sf, sf.a + Math.PI);
  shootHer(far, SHOTGUN);
  assert.equal(wf.alive, true);
  assert.equal(wf.mode, 'rise');
  assert.ok(wf.hp > WITCH.hp * 0.8);
  assert.equal(far.stats.crowns, 0);
  // The window is that one instant: a bullet a moment later is a bullet again.
  const smg = make();
  const ws = smg.witches[0];
  const ss = spotAt(smg, ws, 100);
  put(smg, ss, ss.a + Math.PI);
  shootHer(smg, SMG);
  assert.ok(Math.abs(ws.hp - (WITCH.hp - SMG.dmg * WITCH.crown)) < 1);
  step(smg, 0.2);
  put(smg, ss, ss.a + Math.PI);
  const before = ws.hp;
  shootHer(smg, SMG);
  assert.ok(Math.abs(before - ws.hp - SMG.dmg) < 1);
});

test('the charge: a scream on her feet, then she is on you faster than you can run; the first swipe is the heavy one', () => {
  const game = make();
  const w = game.witches[0];
  const p = game.player;
  const s = spotAt(game, w, 300);
  put(game, s, s.a);
  startle(game, w, p);
  // On her feet, she does not move yet (your time to shoot, or to run).
  step(game, WITCH.rise - 0.1);
  assert.equal(w.mode, 'rise');
  assert.ok(Math.hypot(w.x - w.seat.x, w.y - w.seat.y) < 6);
  step(game, 0.2);
  assert.equal(w.mode, 'charge');
  let t = WITCH.rise + 0.1;
  const hp0 = p.hp;
  while (p.hp === hp0 && t < 6) {
    put(game, s, s.a);
    game.update(1 / 60, frame());
    t += 1 / 60;
  }
  assert.ok(t < WITCH.rise + 300 / WITCH.speed + 0.9, `she covered 300 u and struck after ${t.toFixed(2)} s`);
  assert.equal(hp0 - p.hp, WITCH.hit, 'the first swipe');
  assert.equal(game.stats.witchHits, 1);
  // Then quick ones, for as long as she is on you.
  const hp1 = p.hp;
  for (let k = 0; k < Math.round((WITCH.clawEvery * 2 + 0.3) * 60); k++) {
    p.vx = 0;
    p.vy = 0;
    game.update(1 / 60, frame());
  }
  assert.equal(hp1 - p.hp, WITCH.claw * 2, 'two more in under a second');
  assert.ok(w.mode === 'attack' || w.mode === 'charge');
  assert.ok(witchLine(game).includes('she got you 3×'));
});

test('a shove as she comes in buys a moment, once; she shrugs off the next', () => {
  const game = make({ godMode: true });
  const w = game.witches[0];
  const p = game.player;
  const s = spotAt(game, w, 40);
  put(game, s, s.a + Math.PI);
  startle(game, w, p);
  step(game, WITCH.rise + 0.02);
  assert.ok(w.mode === 'charge' || w.mode === 'attack');
  put(game, s, s.a + Math.PI);
  game.zhash.clear();
  game.zhash.insert(w);
  const swipes = game.stats.witchHits;
  shove(game);
  assert.equal(w.mode, 'stumble');
  assert.equal(game.stats.witchShoves, 1);
  step(game, WITCH.stumble - 0.1);
  assert.equal(game.stats.witchHits, swipes, 'no swipe while she stumbles');
  // Straight away again: nothing.
  step(game, 0.6);
  p.shoveCd = 0;
  game.zhash.clear();
  game.zhash.insert(w);
  put(game, { x: w.x + 24, y: w.y }, Math.PI);
  shove(game);
  assert.notEqual(w.mode, 'stumble');
  assert.equal(game.stats.witchShoves, 1);
});

test('you can put her down in a straight fight, if you are whole and don\'t miss; hurt, you can\'t', () => {
  const fight = (hp) => {
    const game = make();
    const w = game.witches[0];
    const p = game.player;
    p.hp = hp;
    const s = spotAt(game, w, 300);
    put(game, s, s.a + Math.PI);
    for (let t = 0; t < 12 && w.alive && p.alive; t += 1 / 60) {
      const ang = Math.atan2(w.y - p.y, w.x - p.x);
      game.update(1 / 60, frame({ x: Math.cos(ang), y: Math.sin(ang) }, true));
    }
    return { game, w, p };
  };
  const whole = fight(100);
  assert.equal(whole.w.alive, false);
  assert.equal(whole.p.alive, true);
  assert.ok(whole.p.hp < 100, 'not for free');
  assert.equal(whole.game.stats.witches, 1);
  assert.ok(whole.game.messages.some((m) => m.text === 'WITCH DOWN'));
  assert.equal(witchOutcome(whole.game), 'killed');
  assert.ok(witchLine(whole.game).startsWith('the witch: startled and put down'));
  const hurt = fight(35);
  assert.equal(hurt.p.alive, false, 'at 35 HP the first swipe is the last');
  assert.equal(hurt.w.alive, true);
});

test('left alone she is nobody\'s target: aim assist, the teammate and its bullets pass her over, until she is up', () => {
  // You aim a little to one side of her (by day, so your light is not the point): the assist does not pull you on.
  const day = make({ night: false, aimAssist: 1, aimAssistCone: 20 });
  const wd = day.witches[0];
  const sd = spotAt(day, wd, WITCH.far + 60);
  const off = sd.a + Math.PI + 0.1;
  const aimed = { ...frame({ x: Math.cos(off), y: Math.sin(off) }), assist: true };
  for (let i = 0; i < 30; i++) {
    put(day, sd, sd.a + Math.PI);
    day.update(1 / 60, aimed);
  }
  assert.equal(day.player.lastAssist, null, 'nothing to assist toward');
  assert.equal(day.player.assist, null);
  assert.equal(day.player.fireAngle, day.player.aimAngle, 'your aim is your own');
  // Once she is up the same aim is pulled onto her.
  startle(day, wd, day.player);
  for (let i = 0; i < 6; i++) {
    put(day, sd, sd.a + Math.PI);
    day.update(1 / 60, aimed);
  }
  assert.equal(day.player.lastAssist, wd, 'aim assist takes her as a target');

  const game = make({ ally: true });
  const w = game.witches[0];
  const p = game.player;
  const a = game.ally;
  const s = spotAt(game, w, WITCH.far + 60);
  const park = () => {
    put(game, s, s.a);
    a.x = s.x + Math.cos(s.a + 1.5) * 40;
    a.y = s.y + Math.sin(s.a + 1.5) * 40;
    a.vx = 0;
    a.vy = 0;
  };
  // The teammate, next to her for seconds, with nothing else to shoot: its magazine stays full.
  const mag = a.weapon.mag;
  for (let i = 0; i < 180; i++) {
    park();
    game.update(1 / 60, frame());
  }
  assert.equal(a.weapon.mag, mag, 'the teammate held its fire');
  assert.equal(w.mode, 'sit');
  // Even a bullet of its own through her does nothing.
  game.killCredit = 'ally';
  shootHer(game, SMG, a);
  game.killCredit = null;
  assert.equal(w.mode, 'sit');
  assert.equal(w.hp, WITCH.hp);
  // Once she is up, it shoots her.
  startle(game, w, p);
  for (let i = 0; i < 80 && w.alive; i++) {
    park();
    game.update(1 / 60, frame());
  }
  assert.ok(a.weapon.mag < mag && w.hp < WITCH.hp, 'the teammate opened up on her');
});

test('if it is the teammate she comes for, she leaves once it is down', () => {
  const game = make({ ally: true });
  const w = game.witches[0];
  const a = game.ally;
  const p = game.player;
  const s = spotAt(game, w, 120);
  const far = spotAt(game, w, 500);
  put(game, far, far.a);
  a.x = s.x;
  a.y = s.y;
  a.weapon.mag = 0; // (it would fight back; this is about what she does)
  a.weapon.reloading = true;
  a.weapon.reloadT = 99;
  startle(game, w, a);
  assert.equal(w.target, a);
  let t = 0;
  while (!a.down && a.alive && t < 12) {
    put(game, far, far.a);
    a.vx = 0;
    a.vy = 0;
    a.x = s.x;
    a.y = s.y;
    a.shoveCd = 9;
    game.update(1 / 60, frame());
    t += 1 / 60;
  }
  assert.ok(a.down || !a.alive, 'she took the teammate down');
  assert.equal(p.hp, 100, 'and never looked at you');
  step(game, 0.2);
  assert.equal(w.mode, 'flee');
  assert.ok(game.messages.some((m) => m.text === 'THE WITCH RAN OFF'));
  // ...and is gone once she is out of sight (not a kill).
  for (let i = 0; i < 60 * 12 && w.alive; i++) {
    put(game, far, far.a);
    game.update(1 / 60, frame());
  }
  assert.equal(w.alive, false);
  assert.equal(game.stats.witches, 0);
  assert.equal(game.stats.witchFled, 1);
  assert.ok(!game.zombies.includes(w));
});

test('walk on past and she is left in peace (and the end card says so)', () => {
  const game = make();
  const w = game.witches[0];
  const p = game.player;
  // Close enough to hear her...
  const s = spotAt(game, w, 400);
  put(game, s, s.a);
  step(game, 0.2);
  assert.ok(w.heard);
  assert.ok(game.messages.some((m) => m.text === 'SOMEONE IS CRYING'));
  assert.equal(witchOutcome(game), 'crying');
  assert.equal(witchLine(game), 'the witch: still crying');
  // ...then well on toward the goal.
  const er = game.world.map.endRoom.interior;
  const c = { x: 0, y: 0 };
  let best = null;
  for (let i = 0; i < game.world.blocked.length; i++) {
    if (game.world.blocked[i]) continue;
    game.world.cellCenter(i, c);
    const gd = game.goalField.pathDist(c.x, c.y);
    if (gd < w.goalD - 600 && gd > w.goalD - 900 && Math.hypot(c.x - w.x, c.y - w.y) > 450 && !pointInRect(c.x, c.y, er, 200) && game.world.isFree(c.x, c.y, 14)) {
      best = { x: c.x, y: c.y };
      break;
    }
  }
  assert.ok(best);
  put(game, best, 0);
  step(game, 0.3);
  assert.equal(game.stats.witchSpared, 1);
  assert.ok(game.messages.some((m) => m.text === 'LEFT HER IN PEACE'));
  assert.equal(witchOutcome(game), 'spared');
  assert.equal(witchLine(game), 'the witch: left in peace');
  assert.equal(w.mode, 'sit');
  const r = buildReport(game);
  assert.equal(r.specials.witch, 'spared');
  assert.equal(r.world.witch, true);
  assert.equal(p.hp, 100);
});

test('the phone: lit in her hands, dropped when she gets up, and the screen times out, with or without her', () => {
  const game = make();
  const w = game.witches[0];
  step(game, 0.5);
  assert.ok(w.glow > WITCH.glow * 0.7 && w.glow <= WITCH.glow * 1.01);
  assert.equal(w.phoneT, 0);
  const s = spotAt(game, w, 70);
  put(game, s, s.a + Math.PI);
  shootHer(game, SHOTGUN); // dead where she sat
  assert.equal(w.alive, false);
  assert.ok(w.phoneT > 0);
  assert.ok(Math.hypot(w.phoneX - w.seat.x, w.phoneY - w.seat.y) < 20);
  step(game, 2);
  assert.ok(w.glow > 0.2, 'still lit on the ground');
  step(game, WITCH.screenOff);
  assert.equal(w.glow, 0, 'the screen has gone dark');
  assert.ok(game.witches.includes(w) && !game.zombies.includes(w));
});

test('the tune she hums is hers: a short phrase with breaths in it, sung only while she is lost in it', () => {
  assert.ok(WITCH_TUNE.length >= 8 && WITCH_TUNE.some((n) => n === null));
  for (const n of WITCH_TUNE) assert.ok(n === null || (Number.isInteger(n) && n >= -5 && n <= 9));
  const notes = [];
  const sobs = [];
  const rec = new Proxy({ listener: { x: 0, y: 0 } }, { get: (o, k) => (k in o ? o[k] : (...a) => { if (k === 'witchNote') notes.push(a[2]); else if (k === 'witchSob') sobs.push(1); }) });
  const game = new Game({ ...DEFAULTS, playtestPrompt: false, wanderers: 0 }, rec, () => {});
  game.setViewport(844, 390);
  game.director.update = () => {};
  game.zombies = game.zombies.filter((z) => z.type === 'witch');
  const w = game.witches[0];
  const s = spotAt(game, w, 300);
  put(game, s, s.a);
  step(game, 9);
  assert.ok(notes.length >= 8 && sobs.length >= 2, `${notes.length} notes, ${sobs.length} sobs in 9 s`);
  for (const n of notes) assert.ok(WITCH_TUNE.includes(n));
  // Once she has heard you the tune stops.
  w.anger = 0.6;
  w.calmT = 99;
  notes.length = 0;
  step(game, 3);
  assert.equal(notes.length, 0);
});

test('the tuning panel can seat one on demand: a little way off, outside her space and your light', () => {
  for (const level of ['city', 'interior', 'graveyard']) {
    const game = make({ level, witch: false });
    assert.equal(game.witches.length, 0);
    const p = game.player;
    // Out of the safe room, somewhere on the walk.
    const c = { x: 0, y: 0 };
    for (let i = 0; i < game.world.blocked.length; i++) {
      if (game.world.blocked[i]) continue;
      game.world.cellCenter(i, c);
      const gd = game.goalField.pathDist(c.x, c.y);
      if (gd < game.routeLen * 0.6 && gd > game.routeLen * 0.5 && game.world.isFree(c.x, c.y, 40)) break;
    }
    put(game, c, 0);
    game.world.flow.compute(p.x, p.y);
    const w = seatWitchNear(game);
    assert.ok(w, `${level}: seated`);
    assert.ok(game.witches.includes(w) && game.zombies.includes(w));
    const d = Math.hypot(w.x - p.x, w.y - p.y);
    assert.ok(d > WITCH.far + 60 && d < 460, `${level}: ${Math.round(d)} u off`);
    assert.ok(game.world.isFree(w.x, w.y, 24));
    assert.ok(game.messages.some((m) => m.text === 'A WITCH SITS NEARBY'));
    step(game, 1.5);
    assert.equal(w.mode, 'sit');
    assert.ok(w.anger < 0.25, 'she is not bothered by where she was put');
  }
});
