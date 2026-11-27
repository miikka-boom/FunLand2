// The sound effects: the shipped bank (assets/sfx, built by tools/sfx/build_sfx.py) has every
// sound the engine asks for, at sane offsets; the bank's helpers; the soundscape read off the
// game (surfaces, impact materials, ambience, loops in the world, the horde); and the real
// engine plays along with a running game in node (no AudioContext: it stays silent, never throws).
// (node --test runs each file in its own process, so the fake DOM globals stay here.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

const store = new Map();
// The game draws blood and scorch marks into a canvas of its own: any canvas will do here.
const ctx2d = new Proxy({}, { get: (o, k) => (k in o ? o[k] : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => ({ addColorStop() {} })), set: (o, k, v) => ((o[k] = v), true) });
globalThis.document = { createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => ctx2d }) };
globalThis.window = {};
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { SPRITES, SOUNDS, LOOPS } = await import('../assets/sfx/bank.js');
const { findMarker, pickVariant, spriteOf, SfxBank } = await import('../src/sfx-bank.js');
const { surfaceAt, materialOf, readScene, AMBIENCE, VERB, SURFACES } = await import('../src/game/soundscape.js');
const { Audio } = await import('../src/audio.js');
const { Game } = await import('../src/game/game.js');
const { DEFAULTS, LEVEL_IDS } = await import('../src/settings.js');
const { footfall } = await import('../src/game/player.js');

const DIR = new URL('../assets/sfx/', import.meta.url);

test('every file in the bank ships, with its sync blip and room for what it holds', () => {
  for (const [key, s] of Object.entries(SPRITES)) {
    const url = new URL(s.file, DIR);
    assert.ok(existsSync(url), `missing ${s.file}`);
    assert.ok(statSync(url).size > 20000, `${s.file} looks empty`);
    assert.ok(s.marker > 0 && s.marker < 0.2, `${key} marker`);
    assert.ok(!s.rate || (s.rate >= 22050 && s.rate <= 48000), `${key} rate`);
  }
  // Every variant sits inside its file, after the blip, and none overlap.
  const spans = new Map();
  for (const [id, s] of Object.entries(SOUNDS)) {
    assert.ok(SPRITES[s.s], `${id}: unknown file ${s.s}`);
    assert.ok(s.v.length >= 1, `${id} has no variants`);
    for (const [t, dur] of s.v) {
      assert.ok(t > SPRITES[s.s].marker + 0.1 && dur > 0.01 && t + dur <= SPRITES[s.s].seconds, `${id} [${t}, ${dur}]`);
      if (!spans.has(s.s)) spans.set(s.s, []);
      spans.get(s.s).push([t, t + dur, id]);
    }
  }
  for (const [id, l] of Object.entries(LOOPS)) {
    assert.ok(SPRITES[l.s], `${id}: unknown file ${l.s}`);
    assert.ok(l.b - l.a >= 2 && l.a > 0.1 && l.b < SPRITES[l.s].seconds, `${id} loop ${l.a}..${l.b}`);
    spans.get(l.s)?.push([l.a, l.b, id]);
  }
  for (const [file, list] of spans) {
    list.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < list.length; i++) assert.ok(list[i][0] >= list[i - 1][1], `${file}: ${list[i - 1][2]} runs into ${list[i][2]}`);
  }
});

test('every sound the engine asks for is in the bank', () => {
  const src = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8');
  const known = (id) => id in SOUNDS || id in LOOPS;
  // Literal ids: 'z.groan', 'loop.fire'... (quoted words with a dot that look like ours).
  const ids = new Set([...src.matchAll(/'([a-z0-9]+(?:\.[a-z0-9]+)+)'/g)].map((m) => m[1]));
  for (const id of ids) {
    if (/^(far|s)\./.test(id)) continue; // sweetener names and rate-limit keys
    assert.ok(known(id), `src/audio.js plays ${id}, which isn't in assets/sfx/bank.js`);
  }
  // The ids built from a gun's name.
  for (const g of ['smg', 'rifle', 'hunting']) for (const part of ['magout', 'magin', 'cock']) assert.ok(known(`${g}.${part}`), `${g}.${part}`);
  for (const g of ['smg', 'rifle', 'shotgun', 'hunting']) assert.ok(known(`swap.${g}`), `swap.${g}`);
  // ...and the bank carries nothing the engine never plays (every byte of it is downloaded).
  const built = /^(smg|rifle|hunting)\.(magout|magin|cock)$|^swap\./;
  const scape = readFileSync(new URL('../src/game/soundscape.js', import.meta.url), 'utf8');
  for (const id of [...Object.keys(SOUNDS), ...Object.keys(LOOPS)]) {
    const named = src.includes(`'${id}'`) || scape.includes(`'${id}'`);
    assert.ok(named || built.test(id), `${id} is in the bank but nothing plays it`);
  }
  for (const s of SURFACES) assert.ok(src.includes(`${s}: [`), `no footsteps for ${s}`);
  // And the level ambience only uses loops that ship.
  for (const level of LEVEL_IDS) {
    const A = AMBIENCE[level];
    assert.ok(A, `no ambience for ${level}`);
    assert.ok(VERB[A.verb], `${level}: unknown reverb ${A.verb}`);
    for (const [id, gain] of A.beds) assert.ok(id in LOOPS && gain > 0 && gain <= 1, `${level} bed ${id}`);
    for (const s of A.sweet) assert.ok(src.includes(`'${s}':`), `${level}: unknown far-off sound ${s}`);
  }
});

test('the bank finds the sync blip wherever the decoder put it, and never repeats a variant', () => {
  const sr = 48000;
  const data = new Float32Array(sr);
  const at = Math.round(0.0515 * sr) + 1200; // 25 ms late, like a decoder that keeps the encoder delay
  for (let i = -60; i <= 60; i++) data[at + i] = 0.3 * Math.cos((i / 60) * (Math.PI / 2)) * (i === 0 ? 1 : 0.9);
  // The first sound starts 0.3 s after the blip and is often far louder: it must not be taken for it.
  for (let i = Math.round(0.36 * sr); i < Math.round(0.5 * sr); i++) data[i] = 0.95 * Math.sin(i * 0.3);
  const found = findMarker(data, sr, 0.0515);
  assert.ok(Math.abs(found - at / sr) < 1e-4);
  assert.equal(findMarker(new Float32Array(sr), sr, 0.0515), null, 'no blip: no shift');
  let last = -1;
  for (let k = 0; k < 500; k++) {
    const i = pickVariant(5, last);
    assert.ok(i >= 0 && i < 5 && i !== last);
    last = i;
  }
  assert.equal(pickVariant(1, 0), 0);
  assert.equal(spriteOf('z.groan'), SOUNDS['z.groan'].s);
  assert.equal(spriteOf('amb.wind'), LOOPS['amb.wind'].s);
  // Not loaded: nothing to hand out (the engine falls back to the synth).
  const bank = new SfxBank(() => null);
  assert.equal(bank.ready('z.groan'), false);
  assert.equal(bank.get('z.groan'), null);
  assert.equal(bank.loop('loop.fire'), null);
});

function newGame(level, over = {}) {
  const settings = { ...DEFAULTS, level, playtestPrompt: false, godMode: true, ...over };
  const audio = new Audio();
  const game = new Game(settings, audio, () => {});
  game.setViewport(844, 390);
  audio.view = game.view;
  return { game, audio };
}

test('footsteps follow the ground: piers are wood, cemetery paths gravel, lawns grass, the yard dirt', () => {
  const docks = newGame('docks').game.world.map;
  const pier = docks.piers[0];
  assert.equal(surfaceAt(docks, pier.x + pier.w / 2, pier.y + pier.h / 2), 'wood');
  assert.equal(surfaceAt(docks, docks.start.x, docks.start.y), 'concrete');
  const yard = newGame('graveyard').game.world.map;
  const path = yard.streets[0];
  assert.equal(surfaceAt(yard, path.x + path.w / 2, path.y + path.h / 2), 'gravel');
  const sub = newGame('suburbia').game.world.map;
  const lot = sub.lots.find((l) => !(sub.paving || []).some((p) => p.x < l.x + l.w && p.x + p.w > l.x && p.y < l.y + l.h && p.y + p.h > l.y)) || sub.lots[0];
  const hit = surfaceAt(sub, lot.x + 2, lot.y + 2);
  assert.ok(['grass', 'concrete', 'wood', 'dirt'].includes(hit));
  assert.ok(sub.lots.some((l) => surfaceAt(sub, l.x + l.w / 2, l.y + l.h / 2) === 'grass'), 'some lawn is grass');
  const junk = newGame('junkyard').game.world.map;
  const lane = junk.lanes[0];
  assert.ok(['dirt', 'gravel', 'concrete'].includes(surfaceAt(junk, lane.x + lane.w / 2, lane.y + lane.h / 2)));
  assert.equal(surfaceAt(newGame('city').game.world.map, 10, 10), 'concrete');
  for (const level of LEVEL_IDS) {
    const map = newGame(level).game.world.map;
    for (let k = 0; k < 200; k++) assert.ok(SURFACES.includes(surfaceAt(map, Math.random() * map.w, Math.random() * map.h)));
  }
});

test('bullets ring off cars, thunk into crates and crack on walls', () => {
  assert.equal(materialOf({ kind: 'car' }), 'metal');
  assert.equal(materialOf({ kind: 'barrel' }), 'metallight');
  assert.equal(materialOf({ kind: 'crate' }), 'wood');
  assert.equal(materialOf({ kind: 'wall', boards: true }), 'wood');
  assert.equal(materialOf({ kind: 'statue' }), 'rock');
  assert.equal(materialOf({ kind: 'building' }), 'concrete');
  assert.equal(materialOf(null), 'concrete');
});

test('a foot comes down twice a stride, as the legs are drawn', () => {
  let n = 0;
  let w = 0;
  for (let i = 0; i < 1000; i++) {
    const next = w + (Math.PI * 4) / 1000; // two strides
    if (footfall(w, next)) n++;
    w = next;
  }
  assert.equal(n, 4);
});

test('the scene: fires and generators in range (nearest first), the flare and the ferry, the horde', () => {
  const { game } = newGame('city');
  const p = game.player;
  game.world.map.fires = [{ x: p.x + 100, y: p.y }, { x: p.x + 5000, y: p.y }, { x: p.x - 300, y: p.y, barrel: true }];
  game.world.map.lamps = [{ x: p.x, y: p.y + 200, tower: true }, { x: p.x, y: p.y - 200, tower: true, broken: true }];
  game.events.burns = [{ x: p.x, y: p.y + 50, r: 100, t: 10, max: 25 }];
  game.zombies.length = 0;
  let s = readScene(game, 'play');
  const ids = s.emitters.map((e) => e.id);
  assert.deepEqual(ids.sort(), ['loop.fire', 'loop.fire', 'loop.fire', 'loop.generator'].sort());
  for (let i = 1; i < s.emitters.length; i++) assert.ok(s.emitters[i].d >= s.emitters[i - 1].d, 'nearest first');
  assert.equal(s.horde.voices, 0);
  // A crowd chasing you from the east: the bed comes up, and it is over there.
  for (let i = 0; i < 30; i++) game.zombies.push({ alive: true, type: 'common', state: 'chase', x: p.x + 200 + i * 5, y: p.y, vx: -150, vy: 0 });
  s = readScene(game, 'play', s);
  assert.ok(s.horde.voices > 0.5 && s.horde.feet > 0.5);
  assert.ok(s.horde.x > p.x + 150);
  // Pier 9: the flare burns as a loop where it hangs, the ferry's engine as she comes in.
  const d = newGame('docks').game;
  const F = d.events.finale;
  F.flareT = 5;
  F.shipX = F.startX - 500;
  const sd = readScene(d, 'play');
  assert.ok(sd.emitters.some((e) => e.id === 'loop.engine') || Math.hypot(F.shipX - d.player.x, F.ship.y - d.player.y) > 2600);
  d.player.x = F.flare.x;
  d.player.y = F.flare.y;
  assert.ok(readScene(d, 'play').emitters.some((e) => e.id === 'loop.flare'));
});

test('the real engine runs along with a game in node: silent without an AudioContext, never throws', () => {
  for (const level of LEVEL_IDS) {
    const { game, audio } = newGame(level, { ally: true, hunterTank: true });
    const input = { events: ['swap', 'reload', 'shove'], move: { x: 1, y: 0.3 }, aimActive: true, aimScreen: null, aimX: 1, aimY: 0, aimRaw: 1, fire: true, source: 'touch', assist: true };
    const scene = readScene(game, 'play');
    for (let i = 0; i < 240; i++) {
      game.update(1 / 60, input);
      input.events = i % 50 === 0 ? ['swap', 'shove'] : [];
      audio.update(1 / 60, readScene(game, 'play', scene));
    }
    game.director.forceMob();
  }
  // Every sound can be asked for with nothing loaded.
  const a = new Audio();
  a.unlock(); // no AudioContext in node: stays off
  for (const fn of ['shot', 'allyShot', 'dryFire', 'reloadStart', 'reloadDone', 'shell', 'pump', 'swap', 'shove', 'impact', 'bulletHit', 'footstep', 'hurt', 'death', 'armorHit', 'pickup', 'win', 'ui', 'rummage', 'stashOpen', 'boardHit', 'boardBreak', 'switchOn', 'gateOpen', 'explosion', 'groan', 'snarl', 'zombieAttack', 'splat', 'horde', 'alarm', 'alarmStop', 'hunterGrowl', 'hunterScreech', 'hunterPounce', 'hunterPin', 'hunterDie', 'claw', 'struggle', 'deadstop', 'thud', 'tankRoar', 'tankGrunt', 'tankStep', 'tankPunch', 'tankDie', 'rockThrow', 'rockShatter', 'benWhistle', 'benScuff', 'flare', 'ferryHorn', 'radio', 'terrorWhisper', 'terrorInhale', 'terrorShriek', 'terrorLunge', 'terrorStrike', 'terrorDie', 'witchSob', 'witchNote', 'witchGrowl', 'witchScream', 'witchSlash', 'witchDie', 'heartbeat', 'tankMusic', 'allyDown', 'setVolume', 'setAmbience', 'suspend', 'resume']) {
    assert.equal(typeof a[fn], 'function', `Audio.${fn}`);
    a[fn](100, 100, 1, 1);
  }
  assert.deepEqual(a.status().ready, {});
});
