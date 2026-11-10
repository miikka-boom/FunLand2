// Particle and impact effects: comic starbursts, sparks, dust puffs, dirt
// clods, confetti and pop-up words. ctx arrives already in world space
// (camera applied), so everything is drawn in world pixels (y down, ground
// line y = 0, units ~64 px tall).
//
//   fx.spawn('impact', { x, y, power, dirX, dirY, kind: 'bonk' });
//   fx.update(dt);      // game seconds (slow-mo scaled, 0 during hit-stop)
//   fx.drawBack(ctx);   // scuffs, dust, dirt: behind the units
//   fx.drawFront(ctx);  // bursts, sparks, words, confetti: over the units
//
// Particles live in a fixed pool, so a busy fight makes no garbage. When the
// pool is full the oldest particle is recycled.
//
// Arena kinds: towerHit, towerDown (castles too: kind 'castle'), cannonFire,
// cannonHit, boulderImpact (dust ring, clods, a crater decal), crumbs and
// cheeseBurst (the Cheese Wheel), deploy (landing ring), crown (sparkle burst
// with a crown), awake (a castle wakes up). fx.follow(battle, dt) adds the
// running trails: crumbs behind a rolling wheel, smoke behind cannonballs,
// sparks off Juggler bombs.
//
// The 32-card kinds (one per event of the cards contract, 6.4, mostly):
// buildingLand, buildingDown, punchWindup, punch, sproutPop, craneSwing,
// liftOff, netted, crash, propOff, dive, boing, stomp, juggleToss, fumble,
// miniBlast (a Juggler bomb), beat, swoop, scoop, feathers, letGo, engulf,
// spit, canopyFlip, brollyLand, wrap, wrapPop (throttled per key), wrapEnd,
// slip, skid, peelKick, sneeze, sodaErupt, anvilImpact; towerHit takes
// mat: 'wood' | 'metal' for buildings, impact takes the new hit kinds (bite,
// punch, crane, bump, stomp, dive, peck, net). fxForEvent(fx, e, pal) maps a
// sim event of the new cards to these (returns false for the others).

import { WORLD, TEAMS } from '../config.js';

const TAU = Math.PI * 2;
const CAP = 1500;
const G = WORLD.gravity;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const num = (v, d) => (Number.isFinite(v) ? v : d);
const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
/** Overshoots to ~1.1 before settling at 1 (comic "pop"). */
const easeBack = (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

// --- palette ------------------------------------------------------------------------

const INK = '#2a1d14';
// Starburst colours per impact kind: rim, rim edge, white-hot core
const BURST_PAL = [
  { rim: '#ffd23f', edge: '#e9781c', core: '#fffbea' }, // bonk
  { rim: '#9fd6ff', edge: '#4f95d6', core: '#ffffff' }, // slash
  { rim: '#ffe27a', edge: '#d98a2c', core: '#fffbea' }, // arrow
  { rim: '#fff0a0', edge: '#c9a03a', core: '#ffffff' }, // block (metal clank)
  { rim: '#ffb02e', edge: '#d9480f', core: '#fff4c2' }, // explosion
];
const FIRE_COLS = [
  ['#ff7a1a', '#ffd23f'],
  ['#f2541b', '#ffb02e'],
  ['#ff9a2e', '#fff0a0'],
];
const SMOKE_COLS = [
  ['#5f5a56', '#8d8781'],
  ['#4f4b48', '#7a756f'],
];
const SPARK_COLS = ['#fffbe2', '#ffe66e', '#ffc23a'];
const CHIP_COLS = ['#fff6cf', '#ffd94a'];
// Darker than the dirt wall so clods read against the grass (like the art)
const DIRT_COLS = ['#7a4a24', '#5b3418', '#9b6233'];
const GRASS_COL = '#6fae3a';
const WOOD_COLS = ['#c99a5e', '#9a6535', '#e2c08a'];
// Dust puffs: [shade underneath, lit top]
const DUST_COLS = [
  ['#d9c59b', '#f1e7cb'],
  ['#cfb88a', '#eadcb8'],
  ['#c4a978', '#e2d0a6'],
];
const PUFF_COLS = ['#d9e1ec', '#ffffff'];
const CONFETTI_COLS = ['#ffd84a', '#ffffff', '#2b6be0', '#e4433b'];
// Arena: masonry (like the castle stones), stone dust, cannon smoke, cheese
const STONE_COLS = ['#bdb7ae', '#b2aca3', '#c7c1b8', '#a8a299'];
const STONE_DUST = [
  ['#b9b2a6', '#e2ddd3'],
  ['#aaa397', '#d6d0c5'],
  ['#c7bfae', '#ece6da'],
];
const CANNON_SMOKE = [
  ['#b8b3ac', '#eeeae4'],
  ['#a7a29b', '#e2ddd6'],
];
const CHEESE_COLS = ['#ffd34d', '#f5b82e', '#ffe68a'];
const GOLD_COLS = ['#ffe14d', '#fff3b0', '#ffc23a'];
// The 32 cards: crate and building wood, crane steel, leaves, foam, mist, bubbles
const CRATE_COLS = ['#c48d4c', '#dcab6c', '#8e5c2c'];
const PLANK_COLS = ['#8a5a2e', '#a8723f', '#c48d4c'];
const STEEL_COLS = ['#f2b632', '#b9b2a6', '#7c8490', '#f2b632'];
const LEAF_COLS = ['#5fbf3a', '#4aa32c', '#8fdc5e'];
const FOAM_COLS = [
  ['#e9dcc0', '#fbf6ea'],
  ['#d8c3a0', '#f4ecd8'],
];
const MIST_COLS = [
  ['#b9cfa6', '#e2eed6'],
  ['#c5d8b4', '#eef5e6'],
];
const DROP_COL = '#cfeaff';
const SWEAT_COL = '#9fd6ff';

// --- particle kinds -----------------------------------------------------------------

const BURST = 0; // comic starburst
const LINES = 1; // radial speed lines
const SLASH = 2; // crescent sword streak
const RING = 3; // expanding shock ring
const GLINT = 4; // four-point twinkle
const SPARK = 5; // hot streak with a short trail
const SPECK = 6; // tiny debris chip
const CLOD = 7; // dirt clod
const SPLINTER = 8; // wood splinter
const DUST = 9; // soft puff (dust behind, white poof in front)
const SCUFF = 10; // dark mark on the grass
const CONFETTI = 11;
const TEXT = 12; // comic word
const STAR = 13; // dizzy cartoon star
const EYE = 14; // a googly eyeball bouncing away from an explosion
const STONE = 15; // a chunk of masonry (or cheese) that tumbles and bounces
const CRATER = 16; // dark dent in the grass that fades slowly (decal)
const GRING = 17; // flat ring spreading along the ground
const CROWN = 18; // a golden crown popping up out of a fallen tower
const BUBBLE = 19; // a bubble that drifts and pops (wrap, soda, jelly)
const DROP = 20; // a droplet stretched along its flight (sneeze, soda, jelly, sweat)
const FEATHER = 21; // a feather, leaf or scrap see-sawing down
const PLANK = 22; // a wooden board (or girder) that tumbles and bounces
// Drawn in their own back passes (decals first, dust last)
const BACK_OWN = new Set([DUST, SCUFF, CRATER, GRING]);

class Particle {
  constructor() {
    this.alive = false;
    this.kind = 0;
    this.front = false;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.age = 0;
    this.life = 1;
    this.fade = 0; // seconds of fade-out at the end (0 = kind decides)
    this.size = 1;
    this.rot = 0;
    this.spin = 0;
    this.drag = 0;
    this.grav = 0;
    this.ground = Infinity;
    this.bounces = 0; // bounces left before it comes to rest
    this.rest = 0.35; // restitution
    this.a = 0; // per-kind extras
    this.b = 0;
    this.c = 0;
    this.d = 0;
    this.alpha = 1;
    this.seed = 0;
    this.col = '#fff';
    this.col2 = '#fff';
    this.text = '';
    this.font = '';
    this.grad = null;
    this.offs = null;
  }
}

/** Small integer hash -> [0, 1), for stable per-particle shapes. */
function hash(s, i) {
  let h = Math.imul(s ^ Math.imul(i + 1, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Seeded PRNG (mulberry32), so effects never touch Math.random. */
function mulberry32(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Blend two #rrggbb colours (spawn time only). */
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  let out = '#';
  for (const sh of [16, 8, 0]) {
    const v = Math.round(lerp((pa >> sh) & 255, (pb >> sh) & 255, t));
    out += v.toString(16).padStart(2, '0');
  }
  return out;
}

const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

export class Effects {
  constructor(opts = {}) {
    this.rnd = mulberry32(num(opts && opts.seed, 7));
    this.pool = [];
    for (let i = 0; i < CAP; i++) this.pool.push(new Particle());
    this.head = 0; // next slot in spawn order (ring buffer)
    this.live = 0;
    // Set per draw call from the ctx transform
    this.px = 1; // one screen pixel in world units
    this.boost = 1; // grows effects when zoomed far out so they still read
    this.clock = 0; // effect seconds (throttles)
    this.lastAt = new Map(); // throttle key -> clock
  }

  /** True at most once per `gap` seconds for a key (e.g. a wrapped bean's pops). */
  throttle(key, gap) {
    const last = this.lastAt.get(key);
    if (last != null && this.clock - last < gap) return false;
    if (this.lastAt.size > 96) this.lastAt.clear();
    this.lastAt.set(key, this.clock);
    return true;
  }

  get count() {
    return this.live;
  }

  clear() {
    for (const p of this.pool) p.alive = false;
    this.live = 0;
  }

  r(a = 0, b = 1) {
    return a + (b - a) * this.rnd();
  }

  pick(arr) {
    return arr[(this.rnd() * arr.length) | 0];
  }

  /** Spawn an effect by name. Unknown types and bad params are ignored. */
  spawn(type, p) {
    if (!p || typeof p !== 'object') return;
    const x = p.x;
    const y = p.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    try {
      switch (type) {
        case 'impact':
          if (p.kind === 'slash') this.slash(x, y, p);
          else if (p.kind === 'arrow') this.arrowHit(x, y, p);
          else if (p.kind === 'bite') this.bite(x, y, p);
          else if (p.kind === 'net') this.netted(x, y);
          else this.bonk(x, y, p);
          if (p.kind === 'stomp' || p.kind === 'crane' || p.kind === 'punch') this.stars(x, y - 8);
          break;
        case 'block':
          this.block(x, y, p);
          break;
        case 'dust':
          this.dust(x, y, clamp(num(p.power, 0.5), 0, 1.5), num(p.dirX, 0));
          break;
        case 'dirt':
          this.dirt(x, y, clamp(num(p.power, 0.5), 0, 1.5), num(p.dirX, 0));
          break;
        case 'land':
          this.land(x, y, clamp(num(p.power, 0.5), 0, 1.5));
          break;
        case 'poof':
          this.poof(x, y, p.color);
          break;
        case 'confetti':
          this.confetti(x, y, p.colors);
          break;
        case 'text':
          this.word(x, y, p);
          break;
        case 'stars':
          this.stars(x, y);
          break;
        case 'arrowGround':
          this.arrowGround(x, y, num(p.dirX, 1));
          break;
        case 'explosion':
          this.explosion(x, y, clamp(num(p.power, 1), 0.3, 2));
          break;
        case 'eyeball':
          this.eyeball(x, y, num(p.vx, 0), num(p.vy, -300), clamp(num(p.size, 5), 2, 14));
          break;
        case 'quake':
          this.quake(x, y, clamp(num(p.power, 1), 0.3, 2));
          break;
        case 'towerHit':
          if (p.mat === 'wood' || p.mat === 'metal') this.buildingHit(x, y, clamp(num(p.power, 0.5), 0.1, 1.5), num(p.dirX, 0), p.kind, p.mat);
          else this.towerHit(x, y, clamp(num(p.power, 0.5), 0.1, 1.5), num(p.dirX, 0), p.kind);
          break;
        case 'buildingHit':
          this.buildingHit(x, y, clamp(num(p.power, 0.5), 0.1, 1.5), num(p.dirX, 0), p.kind, p.mat === 'metal' ? 'metal' : 'wood');
          break;
        case 'buildingLand':
          this.buildingLand(x, y, clamp(num(p.w, 46), 20, 120), p.bid, clamp(num(p.power, 1), 0.3, 1.5));
          break;
        case 'buildingDown':
          this.buildingDown(x, y, clamp(num(p.w, 46), 20, 120), clamp(num(p.h, 46), 20, 220), p.bid, p.color);
          break;
        case 'punchWindup':
          this.punchWindup(x, y);
          break;
        case 'punch':
          this.punch(x, y, Math.sign(num(p.dir, num(p.dirX, 1))) || 1);
          break;
        case 'sproutPop':
          this.sproutPop(x, y, num(p.dirX, 0));
          break;
        case 'craneSwing':
          this.craneSwing(x, y, Math.sign(num(p.dirX, 1)) || 1, clamp(num(p.power, 1), 0.3, 1.5));
          break;
        case 'liftOff':
          this.liftOff(x, y);
          break;
        case 'netted':
          this.netted(x, y);
          break;
        case 'crash':
          this.crash(x, y, clamp(num(p.power, 0.8), 0.2, 1.5));
          break;
        case 'propOff':
          this.propOff(x, y);
          break;
        case 'dive':
        case 'swoop':
          this.dive(x, y, p);
          break;
        case 'boing':
          this.boing(x, y);
          break;
        case 'stomp':
          this.bonk(x, y, { power: 0.8, dirX: 0, dirY: 1 });
          this.stars(x, y - 6);
          break;
        case 'juggleToss':
          this.juggleToss(x, y, num(p.dirX, 1));
          break;
        case 'fumble':
          this.fumble(x, y);
          break;
        case 'miniBlast':
          this.miniBlast(x, y, clamp(num(p.power, 0.6), 0.3, 1.2));
          break;
        case 'beat':
          this.beat(x, y, p.color);
          break;
        case 'scoop':
          this.bonk(x, y, { power: 0.5, dirX: num(p.dirX, 0), dirY: -1 });
          this.feathers(x, y, p.color, 4);
          break;
        case 'feathers':
          this.feathers(x, y, p.color, clamp(num(p.count, 5), 1, 12) | 0);
          break;
        case 'pelicanDrop':
          this.feathers(x, y, p.color, 3);
          break;
        case 'letGo':
          this.poof(x, y, '#ffffff');
          this.feathers(x, y, p.color, 3);
          break;
        case 'engulf':
          this.engulf(x, y, p.color);
          break;
        case 'spit':
          this.spit(x, y, Math.sign(num(p.dirX, 1)) || 1, p.color);
          break;
        case 'canopyFlip':
          this.canopyFlip(x, y, p.color);
          break;
        case 'brollyLand':
          this.deploy(x, y, p.color, 22);
          this.land(x, y, 0.4);
          break;
        case 'wrap':
          this.wrapOn(x, y);
          break;
        case 'wrapPop':
          if (this.throttle(p.key != null ? 'w' + p.key : 'w' + Math.round(x / 24), 0.09)) this.wrapPop(x, y);
          break;
        case 'wrapEnd':
          this.wrapEnd(x, y, !!p.popped);
          break;
        case 'slip':
          this.slip(x, y, num(p.dirX, 1));
          break;
        case 'skid':
          this.skid(x, y, num(p.dirX, 1));
          break;
        case 'peelKick':
          this.dust(x, y, 0.3, num(p.dirX, 0));
          break;
        case 'sneeze':
          this.sneeze(x, y, clamp(num(p.radius, 140), 30, 300), Math.sign(num(p.dirX, 1)) || 1);
          break;
        case 'sodaErupt':
          this.sodaErupt(x, y, clamp(num(p.radius, 75), 20, 200));
          break;
        case 'anvilImpact':
          this.anvilImpact(x, y, clamp(num(p.power, 1.4), 0.3, 2));
          break;
        case 'bubbles':
          this.bubbles(x, y, clamp(num(p.count, 6), 1, 20) | 0, num(p.spread, 14));
          break;
        case 'towerDown':
          this.towerDown(x, y, p.kind === 'castle', clamp(num(p.w, p.kind === 'castle' ? 200 : 70), 20, 320));
          break;
        case 'cannonFire':
          this.cannonFire(x, y, p);
          break;
        case 'cannonHit':
          this.cannonHit(x, y, clamp(num(p.power, 0.8), 0.2, 1.5));
          break;
        case 'boulderImpact':
          this.boulderImpact(x, y, clamp(num(p.power, 1.4), 0.3, 2));
          break;
        case 'crumbs':
          this.crumbs(x, y, clamp(num(p.power, 0.5), 0, 1.5), num(p.dirX, 0));
          break;
        case 'cheeseBurst':
          this.cheeseBurst(x, y);
          break;
        case 'deploy':
          this.deploy(x, y, p.color, clamp(num(p.radius, 30), 10, 120));
          break;
        case 'crown':
          this.crown(x, y, clamp(num(p.count, 1), 1, 3) | 0);
          break;
        case 'awake':
          this.awake(x, y);
          break;
      }
    } catch (e) {
      // Effects are decoration: never let one break the game loop
    }
  }

  // --- pool -----------------------------------------------------------------------------

  /** Take a fresh particle: a free slot near the head, else the oldest one. */
  add(kind, front, x, y, life) {
    const pool = this.pool;
    const n = pool.length;
    let slot = -1;
    for (let k = 0; k < 48; k++) {
      const j = (this.head + k) % n;
      if (!pool[j].alive) {
        slot = j;
        break;
      }
    }
    if (slot < 0) slot = this.head;
    else this.live++;
    this.head = (slot + 1) % n;
    const p = pool[slot];
    p.alive = true;
    p.kind = kind;
    p.front = front;
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.age = 0;
    p.life = life;
    p.fade = 0;
    p.size = 1;
    p.rot = 0;
    p.spin = 0;
    p.drag = 0;
    p.grav = 0;
    p.ground = Infinity;
    p.bounces = 0;
    p.rest = 0.35;
    p.a = 0;
    p.b = 0;
    p.c = 0;
    p.d = 0;
    p.alpha = 1;
    p.seed = (this.rnd() * 2147483647) | 0;
    p.col = '#ffffff';
    p.col2 = '#ffffff';
    p.text = '';
    p.font = '';
    p.grad = null;
    p.offs = null;
    return p;
  }

  /** Where a falling bit lands: the spawn y if on the ground, else a random lane. */
  groundFor(y) {
    return y >= 0 ? y : this.r(0, WORLD.laneDepth);
  }

  // --- effect recipes -------------------------------------------------------------------

  bonk(x, y, p) {
    const P = clamp(num(p.power, 0.6), 0, 1.5);
    const [dx, dy] = unitDir(p);
    const ang = Math.atan2(dy, dx);
    const R = 8 + 12 * P;
    // Sit on the attacker's side of the contact so the victim's shocked face stays visible
    x -= dx * R * 0.6;
    y -= dy * R * 0.6;
    const life = 0.13 + 0.05 * Math.min(1, P) + (P > 1 ? 0.04 : 0);

    // Speed lines shoot out from behind the burst
    const ln = this.add(LINES, true, x, y, life * 1.3);
    ln.size = R;
    ln.b = 5 + Math.round(P * 3);
    ln.rot = this.r(0, TAU);

    // Shock ring on the big ones
    if (P >= 0.9) {
      const ring = this.add(RING, true, x, y, 0.14);
      ring.a = R * 0.6;
      ring.b = R * 1.4;
      ring.c = 3 + 2 * P;
      ring.col = '#fffbea';
    }

    const b = this.add(BURST, true, x, y, life);
    b.size = R;
    b.a = ang;
    b.b = 9 + Math.round(P * 2);
    b.c = 0;
    b.rot = this.r(0, TAU);

    // A few chips and dirt specks fly along the hit
    const n = 2 + Math.round(P * 2.5);
    for (let i = 0; i < n; i++) {
      const s = this.add(SPECK, true, x, y, this.r(0.55, 0.9));
      const a = ang + this.r(-0.7, 0.7);
      const sp = this.r(220, 430) * (0.6 + P * 0.5);
      s.vx = Math.cos(a) * sp;
      s.vy = Math.sin(a) * sp - 60;
      s.grav = G;
      s.drag = 0.6;
      s.ground = this.groundFor(-1);
      s.bounces = 1;
      s.size = this.r(2.6, 4.4);
      s.spin = this.r(-18, 18);
      s.rot = this.r(0, TAU);
      s.col = i % 2 ? this.pick(DIRT_COLS) : this.pick(CHIP_COLS);
      s.fade = 0.2;
    }
  }

  slash(x, y, p) {
    const P = clamp(num(p.power, 0.6), 0, 1.5);
    const [dx, dy] = unitDir(p);
    const ang = Math.atan2(dy, dx);

    const s = this.add(SLASH, true, x, y, 0.19 + 0.05 * Math.min(1, P));
    s.size = 46 + 30 * P; // streak length
    s.a = ang;
    s.b = 7 + 5 * P; // thickness
    // Bulge upwards so the arc reads like a swing
    s.c = dx >= 0 ? -1 : 1;

    const b = this.add(BURST, true, x, y, 0.1 + 0.03 * P);
    b.size = 9 + 11 * P;
    b.a = ang;
    b.b = 8;
    b.c = 1;
    b.rot = this.r(0, TAU);

    const n = 2 + Math.round(P * 2);
    for (let i = 0; i < n; i++) {
      const k = this.add(SPARK, true, x, y, this.r(0.16, 0.28));
      const a = ang + this.r(-0.5, 0.5);
      const sp = this.r(280, 520);
      k.vx = Math.cos(a) * sp;
      k.vy = Math.sin(a) * sp - 40;
      k.grav = G * 0.7;
      k.drag = 1.5;
      k.size = this.r(1.4, 2.2);
      k.col = i % 2 ? '#ffffff' : '#cdeeff';
    }
  }

  arrowHit(x, y, p) {
    const [dx, dy] = unitDir(p);
    const ang = Math.atan2(dy, dx);

    const b = this.add(BURST, true, x, y, 0.09);
    b.size = 11;
    b.a = ang;
    b.b = 7;
    b.c = 2;
    b.rot = this.r(0, TAU);

    // Little puffs blown back out of the hole
    for (let i = 0; i < 3; i++) {
      const a = ang + Math.PI + (i - 1) * 0.9 + this.r(-0.3, 0.3);
      const d = this.add(DUST, true, x + Math.cos(a) * 2, y + Math.sin(a) * 2, this.r(0.22, 0.3));
      const sp = this.r(45, 75);
      d.vx = Math.cos(a) * sp;
      d.vy = Math.sin(a) * sp - 10;
      d.drag = 6;
      d.a = this.r(2.5, 3.5);
      d.b = this.r(5.5, 7.5);
      d.alpha = 0.95;
      d.col = PUFF_COLS[0];
      d.col2 = PUFF_COLS[1];
    }

    // Splinters spray back out of the wound
    const n = 3 + ((this.rnd() * 2) | 0);
    for (let i = 0; i < n; i++) {
      const s = this.add(SPLINTER, true, x, y, this.r(0.45, 0.7));
      const a = ang + Math.PI + this.r(-1.1, 1.1);
      const sp = this.r(110, 240);
      s.vx = Math.cos(a) * sp;
      s.vy = Math.sin(a) * sp - 90;
      s.grav = G;
      s.drag = 0.8;
      s.ground = this.groundFor(-1);
      s.bounces = 1;
      s.a = this.r(4.5, 7.5); // length
      s.size = 1.6;
      s.rot = this.r(0, TAU);
      s.spin = this.r(-22, 22);
      s.col = this.pick(WOOD_COLS);
      s.fade = 0.2;
    }
  }

  block(x, y, p) {
    const P = clamp(num(p.power, 0.6), 0, 1.5);
    const [dx, dy] = unitDir(p);
    const ang = Math.atan2(dy, dx);

    // Quick white clank star, then a ring and a twinkle
    const b = this.add(BURST, true, x, y, 0.08);
    b.size = 9 + 7 * P;
    b.a = ang;
    b.b = 8;
    b.c = 3;
    b.rot = this.r(0, TAU);

    const ring = this.add(RING, true, x, y, 0.16);
    ring.a = 5;
    ring.b = 17 + 15 * P;
    ring.c = 5;
    ring.col = '#ffe680';

    const g = this.add(GLINT, true, x, y, 0.16);
    g.size = 13 + 10 * P;
    g.rot = this.r(-0.3, 0.3);
    g.col = '#ffffff';

    const n = 8 + Math.round(P * 9);
    for (let i = 0; i < n; i++) {
      const k = this.add(SPARK, true, x, y, this.r(0.22, 0.45));
      const a = ang + this.r(-1.1, 1.1);
      const sp = this.r(200, 470) * (0.6 + 0.5 * P);
      k.vx = Math.cos(a) * sp;
      k.vy = Math.sin(a) * sp - this.r(40, 140);
      k.grav = G;
      k.drag = 1.2;
      k.ground = this.groundFor(-1);
      k.bounces = 1;
      k.rest = 0.3;
      k.size = this.r(1.5, 2.4);
      k.col = SPARK_COLS[i % 3];
      k.fade = 0.12;
    }
  }

  dust(x, y, P, dirX) {
    const n = 2 + Math.round(P * 4);
    for (let i = 0; i < n; i++) {
      const life = this.r(0.35, 0.6) * (0.8 + P * 0.5);
      const d = this.add(DUST, false, x + this.r(-4, 4) * (1 + 2 * P), y - this.r(0, 3), life);
      d.vx = dirX * this.r(20, 90) * (0.5 + P) + this.r(-25, 25);
      d.vy = -this.r(8, 30) * (0.5 + P);
      d.drag = 3.5;
      d.a = this.r(2.5, 4);
      d.b = this.r(6.5, 11) * (0.6 + P * 0.9);
      d.alpha = 0.92;
      const c = this.pick(DUST_COLS);
      d.col = c[0];
      d.col2 = c[1];
    }
  }

  dirt(x, y, P, dirX) {
    const n = 3 + Math.round(P * 6);
    for (let i = 0; i < n; i++) {
      this.clod(x + this.r(-7, 7), y, dirX * this.r(40, 200) * (0.4 + P) + this.r(-70, 70), -this.r(150, 380) * (0.5 + 0.5 * P), this.r(2.2, 4.4) * (0.85 + P * 0.25));
    }
  }

  clod(x, y, vx, vy, size) {
    const c = this.add(CLOD, false, x, y - 1, this.r(1.1, 1.6));
    c.ground = this.groundFor(y);
    c.vx = vx;
    c.vy = vy;
    c.grav = G;
    c.drag = 0.3;
    c.bounces = 1;
    c.rest = 0.35;
    c.size = size;
    c.rot = this.r(0, TAU);
    c.spin = this.r(-12, 12);
    c.col = this.rnd() < 0.15 ? GRASS_COL : this.pick(DIRT_COLS);
    c.fade = 0.35;
    return c;
  }

  land(x, y, P) {
    // Dust rolls out to both sides, a couple of puffs billow up
    const n = 4 + Math.round(P * 8);
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const up = i < 2;
      const d = this.add(DUST, false, x + side * this.r(0, 8), y - this.r(0, 4), this.r(0.5, 0.8) * (0.8 + 0.3 * P));
      d.vx = side * (up ? this.r(10, 40) : this.r(70, 260) * (0.4 + P * 0.7));
      d.vy = -(up ? this.r(50, 90) * (0.5 + P * 0.5) : this.r(5, 35));
      d.drag = 3;
      d.a = this.r(4, 6);
      d.b = this.r(9, 16) * (0.6 + 0.8 * P);
      d.alpha = 0.92;
      const c = this.pick(DUST_COLS);
      d.col = c[0];
      d.col2 = c[1];
    }

    if (P > 0.3) {
      const s = this.add(SCUFF, false, x, y + 1, 1.6);
      s.size = 9 + 16 * P;
    }

    const m = Math.round(P * 4);
    for (let i = 0; i < m; i++) {
      const side = i % 2 ? 1 : -1;
      this.clod(x + side * this.r(2, 10), y, side * this.r(60, 200), -this.r(220, 380) * (0.5 + 0.5 * P), this.r(2.2, 3.8));
    }
  }

  poof(x, y, color) {
    const tint = isHex(color) ? color : '#ffd84a';
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + this.r(-0.25, 0.25);
      const d = this.add(DUST, true, x + Math.cos(a) * 5, y + Math.sin(a) * 5, this.r(0.32, 0.48));
      const sp = this.r(70, 130);
      d.vx = Math.cos(a) * sp;
      d.vy = Math.sin(a) * sp - 15;
      d.drag = 5;
      d.a = this.r(6, 8);
      d.b = this.r(11, 15);
      d.alpha = 1;
      d.col = PUFF_COLS[0];
      d.col2 = PUFF_COLS[1];
    }

    const ring = this.add(RING, true, x, y, 0.24);
    ring.a = 6;
    ring.b = 34;
    ring.c = 3.5;
    ring.col = '#ffffff';

    const m = 4 + ((this.rnd() * 2) | 0);
    for (let i = 0; i < m; i++) {
      const a = this.r(0, TAU);
      const r = this.r(14, 30);
      const g = this.add(GLINT, true, x + Math.cos(a) * r, y + Math.sin(a) * r, this.r(0.35, 0.6));
      g.vx = Math.cos(a) * 20;
      g.vy = Math.sin(a) * 20 - 25;
      g.drag = 2;
      g.size = this.r(5, 8);
      g.rot = this.r(-0.4, 0.4);
      g.col = i % 2 ? tint : '#fff6c2';
      g.c = this.r(0, 0.12); // start delay
    }
  }

  confetti(x, y, colors) {
    const cols = Array.isArray(colors) && colors.length ? colors.filter(isHex) : [];
    const pal = cols.length ? cols : CONFETTI_COLS;
    const n = 28;
    for (let i = 0; i < n; i++) {
      const c = this.add(CONFETTI, true, x + this.r(-8, 8), y + this.r(-6, 6), this.r(3.2, 4.4));
      c.vx = this.r(-300, 300);
      c.vy = -this.r(320, 720);
      c.grav = 420;
      c.drag = 2.7;
      c.ground = this.groundFor(-1);
      c.bounces = 0;
      c.a = this.r(3.5, 5.5); // width
      c.b = this.r(6.5, 10); // height
      c.c = this.r(0, TAU); // flip phase
      c.d = this.r(7, 15); // flip speed
      c.size = this.r(25, 60); // sway speed
      c.rot = this.r(0, TAU);
      c.spin = this.r(-7, 7);
      c.col = pal[i % pal.length];
      c.fade = 0.6;
    }
  }

  word(x, y, p) {
    const text = String(p.text == null ? '' : p.text).slice(0, 16);
    if (!text) return;
    const t = this.add(TEXT, true, x, y, 0.8);
    t.text = text;
    t.size = clamp(num(p.size, 22), 8, 90);
    t.col = isHex(p.color) ? p.color : '#ffe14d';
    t.rot = this.r(-0.22, 0.22);
    t.vy = -55;
    t.drag = 2.2;
    t.font = '900 40px "Arial Black", Impact, "Segoe UI Black", system-ui, sans-serif';
  }

  stars(x, y) {
    const n = 3 + ((this.rnd() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const s = this.add(STAR, true, x, y, this.r(0.75, 1));
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.75 + this.r(-0.2, 0.2);
      const sp = this.r(80, 140);
      s.vx = Math.cos(a) * sp;
      s.vy = Math.sin(a) * sp;
      s.drag = 2.6;
      s.grav = 70;
      s.size = this.r(5, 7.5);
      s.rot = this.r(0, TAU);
      s.spin = (i % 2 ? 1 : -1) * this.r(5, 9);
    }
  }

  arrowGround(x, y, dirX) {
    const gy = y >= 0 ? y : 0;
    // Mostly flicked back the way the arrow came, a bit forward
    const n = 4 + ((this.rnd() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const back = i % 3 !== 2;
      const vx = (back ? -dirX : dirX) * this.r(30, 120) + this.r(-25, 25);
      this.clod(x, gy, vx, -this.r(120, 260), this.r(1.8, 3));
    }
    for (let i = 0; i < 2; i++) {
      const d = this.add(DUST, false, x - dirX * i * 4, gy - 2, this.r(0.3, 0.4));
      d.vx = -dirX * this.r(15, 40);
      d.vy = -this.r(8, 20);
      d.drag = 4;
      d.a = 2;
      d.b = this.r(5, 7);
      d.alpha = 0.9;
      d.col = DUST_COLS[0][0];
      d.col2 = DUST_COLS[0][1];
    }
  }

  /** Bomb: white flash, fireball, flying dirt and sparks, a scorch mark and rising smoke. */
  explosion(x, y, P) {
    const gy = Math.max(0, y + 20);
    const flash = this.add(RING, true, x, y, 0.26);
    flash.a = 8;
    flash.b = 95 * P;
    flash.c = 12;
    flash.col = '#fffbea';
    const b = this.add(BURST, true, x, y, 0.24);
    b.size = 36 * P;
    b.a = -Math.PI / 2;
    b.b = 13;
    b.c = 4;
    b.rot = this.r(0, TAU);
    // Fireball
    for (let i = 0; i < 12; i++) {
      const a = this.r(0, TAU);
      const sp = this.r(90, 260) * P;
      const d = this.add(DUST, true, x + Math.cos(a) * 6, y + Math.sin(a) * 6, this.r(0.32, 0.55));
      d.vx = Math.cos(a) * sp;
      d.vy = Math.sin(a) * sp - 60;
      d.drag = 4.5;
      d.a = this.r(7, 10);
      d.b = this.r(15, 24) * P;
      d.alpha = 1;
      const c = this.pick(FIRE_COLS);
      d.col = c[0];
      d.col2 = c[1];
    }
    // Smoke drifting up behind everything
    for (let i = 0; i < 9; i++) {
      const d = this.add(DUST, false, x + this.r(-30, 30), y + this.r(-20, 10), this.r(1.1, 1.8));
      d.vx = this.r(-40, 40);
      d.vy = -this.r(50, 120);
      d.drag = 1.4;
      d.a = this.r(8, 12);
      d.b = this.r(20, 32) * P;
      d.alpha = 0.85;
      const c = this.pick(SMOKE_COLS);
      d.col = c[0];
      d.col2 = c[1];
    }
    // Dirt and sparks
    for (let i = 0; i < 12; i++) this.clod(x + this.r(-14, 14), gy, this.r(-380, 380), -this.r(300, 650) * P, this.r(2.6, 5));
    for (let i = 0; i < 10; i++) {
      const a = this.r(-Math.PI, 0);
      const k = this.add(SPARK, true, x, y, this.r(0.35, 0.7));
      const sp = this.r(350, 700);
      k.vx = Math.cos(a) * sp;
      k.vy = Math.sin(a) * sp;
      k.grav = G * 0.6;
      k.drag = 1.2;
      k.ground = this.groundFor(-1);
      k.bounces = 1;
      k.size = this.r(2, 3.2);
      k.col = SPARK_COLS[i % 3];
      k.fade = 0.15;
    }
    const sc = this.add(SCUFF, false, x, gy, 3.5);
    sc.size = 46 * P;
  }

  /** A googly eye knocked loose: bounces along the grass, still looking around. */
  eyeball(x, y, vx, vy, size) {
    const e = this.add(EYE, true, x, y, this.r(2.2, 3));
    e.vx = vx;
    e.vy = vy;
    e.grav = G;
    e.drag = 0.4;
    e.ground = this.groundFor(-1) - size;
    e.bounces = 3;
    e.rest = 0.55;
    e.size = size;
    e.rot = this.r(0, TAU);
    e.spin = this.r(-14, 14);
    e.fade = 0.5;
  }

  /** Brick's ground slam: dust rolling out both ways along the ground, clods jumping. */
  quake(x, y, P) {
    this.land(x, y, 1.5 * P);
    this.dirt(x, y, 1.3 * P, 0);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const d = this.add(DUST, false, x + side * this.r(10, 30), y - this.r(0, 5), this.r(0.45, 0.75));
        d.vx = side * this.r(220, 420) * P;
        d.vy = -this.r(10, 50);
        d.drag = 2.6;
        d.a = this.r(4, 6);
        d.b = this.r(10, 16) * P;
        d.alpha = 0.92;
        const c = this.pick(DUST_COLS);
        d.col = c[0];
        d.col2 = c[1];
      }
      for (let i = 0; i < 4; i++) this.clod(x + side * this.r(30, 110), y, side * this.r(30, 120), -this.r(200, 420), this.r(2.2, 4));
    }
  }

  // --- arena recipes ------------------------------------------------------------------

  /** A chunk of masonry (or cheese): tumbles, bounces once or twice, then fades. */
  chunk(x, y, vx, vy, size, cols = STONE_COLS, front = false) {
    const c = this.add(STONE, front, x, y, this.r(1.3, 2));
    c.ground = this.groundFor(y > 0 ? y : -1);
    c.vx = vx;
    c.vy = vy;
    c.grav = G;
    c.drag = 0.25;
    c.bounces = 2;
    c.rest = 0.3;
    c.size = size;
    c.rot = this.r(0, TAU);
    c.spin = this.r(-10, 10);
    c.col = this.pick(cols);
    c.fade = 0.5;
    return c;
  }

  puff(front, x, y, vx, vy, life, r0, r1, cols, alpha = 0.92, drag = 3) {
    const d = this.add(DUST, front, x, y, life);
    d.vx = vx;
    d.vy = vy;
    d.drag = drag;
    d.a = r0;
    d.b = r1;
    d.alpha = alpha;
    d.col = cols[0];
    d.col2 = cols[1];
    return d;
  }

  groundRing(x, y, r0, r1, life, width, col, alpha = 0.8, flat = 0.2) {
    const g = this.add(GRING, false, x, y, life);
    g.a = r0;
    g.b = r1;
    g.c = width;
    g.d = flat;
    g.col = col;
    g.alpha = alpha;
    return g;
  }

  /** Something hit a tower wall: stone chips and a puff of grit fly back toward the attacker. */
  towerHit(x, y, P, dirX, kind) {
    const back = -(Math.sign(dirX) || 1);
    const small = kind === 'arrow' || kind === 'bolt';
    const n = small ? 2 : 3 + Math.round(P * 4);
    for (let i = 0; i < n; i++) {
      const s = this.add(SPECK, true, x, y, this.r(0.5, 0.85));
      const a = Math.atan2(-0.6, back) + this.r(-0.8, 0.8);
      const sp = this.r(150, 330) * (0.6 + 0.5 * P);
      s.vx = Math.cos(a) * sp;
      s.vy = Math.sin(a) * sp;
      s.grav = G;
      s.drag = 0.6;
      s.ground = this.groundFor(-1);
      s.bounces = 1;
      s.size = this.r(2.4, 4) * (small ? 0.8 : 1);
      s.rot = this.r(0, TAU);
      s.spin = this.r(-18, 18);
      s.col = this.pick(STONE_COLS);
      s.fade = 0.2;
    }
    const m = small ? 1 : 2 + Math.round(P);
    for (let i = 0; i < m; i++) this.puff(true, x + back * this.r(0, 4), y + this.r(-4, 4), back * this.r(20, 60), -this.r(5, 25), this.r(0.3, 0.5), 3, this.r(6, 10) * (0.7 + P * 0.5), this.pick(STONE_DUST));
    if (!small && P > 0.6) {
      for (let i = 0; i < 2; i++) this.chunk(x, y, back * this.r(60, 180), -this.r(120, 260), this.r(3.5, 6), STONE_COLS, true);
    }
  }

  /** A tower comes down: billowing stone dust along its base, chunks raining out, a ground ring. */
  towerDown(x, y, castle, w) {
    const k = castle ? 1.6 : 1;
    const base = Math.max(0, y) > 0 ? y : WORLD.laneDepth * 0.5;
    const n = castle ? 22 : 12;
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1) - 0.5) * 2;
      const px = x + u * w * 0.6;
      const side = Math.sign(u) || (i % 2 ? 1 : -1);
      this.puff(false, px, base - this.r(0, 10), side * this.r(30, 140) * k, -this.r(10, 60), this.r(1.1, 1.9) * (castle ? 1.2 : 1), this.r(8, 12), this.r(22, 36) * k, this.pick(STONE_DUST), 0.95, 1.6);
    }
    // A plume rising out of the collapsing middle
    for (let i = 0; i < (castle ? 10 : 6); i++) {
      this.puff(false, x + this.r(-w * 0.3, w * 0.3), base - this.r(20, 90) * k, this.r(-30, 30), -this.r(40, 110), this.r(1.2, 2), this.r(10, 14), this.r(24, 40) * k, this.pick(STONE_DUST), 0.85, 1.2);
    }
    for (let i = 0; i < (castle ? 26 : 14); i++) {
      const side = i % 2 ? 1 : -1;
      this.chunk(x + this.r(-w * 0.4, w * 0.4), base - this.r(30, 140) * k, side * this.r(40, 260), -this.r(80, 380), this.r(4, 9) * (castle ? 1.2 : 1));
    }
    this.dirt(x - w * 0.3, base, 1.2, -1);
    this.dirt(x + w * 0.3, base, 1.2, 1);
    this.groundRing(x, base, w * 0.4, w * 1.3 + 60, 0.7, 7, '#efe6d2', 0.85);
    const sc = this.add(SCUFF, false, x, base + 2, 3);
    sc.size = w * 0.8;
  }

  /** Castle cannon fires: a thick smoke puff shoved out of the muzzle along the shot. */
  cannonFire(x, y, p) {
    const [dx, dy] = unitDir(p);
    for (let i = 0; i < 6; i++) {
      const sp = this.r(60, 200);
      const a = Math.atan2(dy, dx) + this.r(-0.5, 0.5);
      this.puff(true, x + dx * 6, y + dy * 6, Math.cos(a) * sp, Math.sin(a) * sp - 20, this.r(0.5, 0.85), 4, this.r(9, 15), this.pick(CANNON_SMOKE), 0.95, 4);
    }
    for (let i = 0; i < 4; i++) {
      const k = this.add(SPARK, true, x + dx * 8, y + dy * 8, this.r(0.12, 0.22));
      const a = Math.atan2(dy, dx) + this.r(-0.6, 0.6);
      const sp = this.r(250, 450);
      k.vx = Math.cos(a) * sp;
      k.vy = Math.sin(a) * sp;
      k.drag = 3;
      k.size = this.r(1.4, 2.2);
      k.col = SPARK_COLS[i % 3];
    }
  }

  /** A cannonball lands: a thump of dust and dirt, a little ring. */
  cannonHit(x, y, P) {
    const gy = y >= -4 ? Math.max(y, 0) : y;
    this.land(x, gy, 0.7 * P);
    this.dirt(x, gy, 0.8 * P, 0);
    const b = this.add(BURST, true, x, gy - 4, 0.12);
    b.size = 10 + 6 * P;
    b.a = -Math.PI / 2;
    b.b = 9;
    b.c = 0;
    b.rot = this.r(0, TAU);
    this.groundRing(x, Math.max(gy, 2), 8, 46 * P + 20, 0.35, 4, '#f1e7cb', 0.8);
  }

  /** The Boulder lands: shock ring along the ground, dust rolling out, clods, a crater left behind. */
  boulderImpact(x, y, P) {
    const gy = Math.max(0, y);
    const flash = this.add(RING, true, x, gy - 18, 0.2);
    flash.a = 12;
    flash.b = 70 * P;
    flash.c = 9;
    flash.col = '#fffbea';
    this.groundRing(x, gy, 20, 120 * P, 0.55, 9, '#f6edd4', 0.95);
    this.groundRing(x, gy, 10, 80 * P, 0.4, 5, '#ffffff', 0.7);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        this.puff(false, x + side * this.r(10, 40), gy - this.r(0, 8), side * this.r(160, 420) * P, -this.r(10, 70), this.r(0.6, 1.1), this.r(6, 9), this.r(14, 26) * P, this.pick(DUST_COLS), 0.95, 2.4);
      }
    }
    for (let i = 0; i < 5; i++) this.puff(false, x + this.r(-25, 25), gy - this.r(5, 25), this.r(-40, 40), -this.r(60, 140), this.r(0.8, 1.3), 9, this.r(22, 32) * P, this.pick(DUST_COLS), 0.9, 1.6);
    for (let i = 0; i < 18; i++) {
      const side = i % 2 ? 1 : -1;
      this.clod(x + side * this.r(5, 40), gy, side * this.r(60, 380) * P, -this.r(250, 620) * P, this.r(2.8, 5.5));
    }
    for (let i = 0; i < 5; i++) this.chunk(x + this.r(-20, 20), gy - 10, this.r(-220, 220), -this.r(200, 420), this.r(3, 6), ['#8f8780', '#a9a19b', '#766f6a']);
    const c = this.add(CRATER, false, x, gy + 2, 6);
    c.size = 54 * P;
    const sc = this.add(SCUFF, false, x, gy + 2, 3);
    sc.size = 80 * P;
  }

  /** Cheese crumbs: little yellow bits hopping off the wheel, and a wisp of dust. */
  crumbs(x, y, P, dirX) {
    const n = 2 + Math.round(P * 5);
    for (let i = 0; i < n; i++) {
      const c = this.clod(x + this.r(-5, 5), y, dirX * this.r(30, 160) * (0.4 + P) + this.r(-40, 40), -this.r(90, 260) * (0.5 + 0.6 * P), this.r(1.6, 3) * (0.8 + 0.3 * P));
      c.col = this.pick(CHEESE_COLS);
      c.life = this.r(0.7, 1.1);
    }
    if (P > 0.2) this.puff(false, x, y - 2, dirX * this.r(10, 40), -this.r(5, 20), this.r(0.3, 0.5), 3, this.r(6, 10) * (0.6 + P), this.pick(DUST_COLS));
  }

  /** The wheel is done: it bursts into cheese chunks and crumbs. */
  cheeseBurst(x, y) {
    this.poof(x, y, '#ffd34d');
    this.crumbs(x, y + 10, 1.4, 0);
    for (let i = 0; i < 7; i++) this.chunk(x + this.r(-14, 14), y + this.r(-14, 10), this.r(-230, 230), -this.r(220, 460), this.r(5, 9), CHEESE_COLS, true);
  }

  /** Where a played card's beans land: a ring in the team colour spreading over the grass. */
  deploy(x, y, color, radius) {
    const col = isHex(color) ? color : '#ffffff';
    this.groundRing(x, y, radius * 0.4, radius + 34, 0.5, 5, col, 0.9);
    this.groundRing(x, y, radius * 0.2, radius + 14, 0.35, 3, '#ffffff', 0.8);
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1;
      this.puff(false, x + side * this.r(radius * 0.3, radius * 0.8), y - 2, side * this.r(40, 110), -this.r(8, 25), this.r(0.35, 0.55), 4, this.r(8, 12), this.pick(DUST_COLS));
    }
  }

  /** Crowns won: a golden crown pops out with a ring of sparkles. */
  crown(x, y, count) {
    for (let k = 0; k < count; k++) {
      const c = this.add(CROWN, true, x + (k - (count - 1) / 2) * 26, y, 1.5);
      c.vy = -90 - k * 6;
      c.drag = 1.6;
      c.size = 21;
      c.c = k * 0.1; // start delay
    }
    const ring = this.add(RING, true, x, y, 0.4);
    ring.a = 10;
    ring.b = 70;
    ring.c = 5;
    ring.col = '#ffe680';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + this.r(-0.2, 0.2);
      const r = this.r(16, 40);
      const g = this.add(GLINT, true, x + Math.cos(a) * r, y + Math.sin(a) * r, this.r(0.45, 0.8));
      g.vx = Math.cos(a) * this.r(30, 80);
      g.vy = Math.sin(a) * this.r(30, 80) - 30;
      g.drag = 2;
      g.size = this.r(6, 11);
      g.rot = this.r(-0.4, 0.4);
      g.col = this.pick(GOLD_COLS);
      g.c = this.r(0, 0.2);
    }
    for (let i = 0; i < 10; i++) {
      const k = this.add(SPARK, true, x, y, this.r(0.3, 0.6));
      const a = -Math.PI / 2 + this.r(-1.4, 1.4);
      const sp = this.r(200, 420);
      k.vx = Math.cos(a) * sp;
      k.vy = Math.sin(a) * sp;
      k.grav = G * 0.5;
      k.drag = 1.5;
      k.size = this.r(1.6, 2.6);
      k.col = GOLD_COLS[i % 3];
    }
  }

  /** A sleeping castle wakes: a puff and a startled "!". */
  awake(x, y) {
    this.poof(x, y, '#ffd84a');
    this.word(x, y - 16, { text: '!', size: 30, color: '#ffe14d' });
  }

  // --- the 32-card recipes ---------------------------------------------------------------

  /** A wooden board (or girder) that tumbles, bounces and fades. */
  plank(x, y, vx, vy, len, cols = PLANK_COLS, front = false) {
    const c = this.add(PLANK, front, x, y, this.r(1.4, 2.1));
    c.ground = this.groundFor(y > 0 ? y : -1);
    c.vx = vx;
    c.vy = vy;
    c.grav = G;
    c.drag = 0.25;
    c.bounces = 2;
    c.rest = 0.3;
    c.a = len;
    c.size = len * 0.22;
    c.rot = this.r(0, TAU);
    c.spin = this.r(-12, 12);
    c.col = this.pick(cols);
    c.fade = 0.5;
    return c;
  }

  /** A droplet flung along (vx, vy), falling and fading (sneeze, soda, jelly, sweat). */
  drop(x, y, vx, vy, size, col, front = true, life = this.r(0.45, 0.75)) {
    const d = this.add(DROP, front, x, y, life);
    d.vx = vx;
    d.vy = vy;
    d.grav = G * 0.8;
    d.drag = 0.8;
    d.ground = this.groundFor(-1);
    d.size = size;
    d.col = isHex(col) ? col : DROP_COL;
    d.fade = 0.15;
    return d;
  }

  /** A bubble drifting up that pops at the end of its life. */
  bubble(x, y, vx, vy, size, life = this.r(0.5, 1)) {
    const b = this.add(BUBBLE, true, x, y, life);
    b.vx = vx;
    b.vy = vy;
    b.drag = 1.6;
    b.size = size;
    b.seed = (this.rnd() * 1000) | 0;
    return b;
  }

  /** A feather (or leaf, or scrap of cloth) that see-saws down. */
  feather(x, y, vx, vy, col, size = this.r(5, 8)) {
    const f = this.add(FEATHER, true, x, y, this.r(1.2, 1.9));
    f.vx = vx;
    f.vy = vy;
    f.grav = 160;
    f.drag = 2.6;
    f.ground = this.groundFor(-1);
    f.size = size;
    f.c = this.r(-0.6, 0.6); // resting tilt
    f.col = isHex(col) ? col : '#ffffff';
    f.fade = 0.4;
    return f;
  }

  feathers(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = this.r(-Math.PI, 0);
      const sp = this.r(60, 160);
      this.feather(x + this.r(-6, 6), y + this.r(-6, 6), Math.cos(a) * sp, Math.sin(a) * sp, i % 2 && isHex(color) ? color : '#ffffff');
    }
  }

  bubbles(x, y, n, spread) {
    for (let i = 0; i < n; i++) this.bubble(x + this.r(-spread, spread), y + this.r(-spread, spread) * 0.6, this.r(-30, 30), -this.r(30, 90), this.r(2.5, 5));
  }

  /** A Nutcracker's CRUNCH: a white chomp burst with tooth-white chips. */
  bite(x, y, p) {
    this.bonk(x, y, { ...p, power: Math.max(0.8, num(p.power, 1)) });
    for (let i = 0; i < 5; i++) {
      const s = this.add(SPECK, true, x, y, this.r(0.5, 0.8));
      const a = this.r(-Math.PI, 0);
      const sp = this.r(140, 300);
      s.vx = Math.cos(a) * sp;
      s.vy = Math.sin(a) * sp;
      s.grav = G;
      s.drag = 0.6;
      s.ground = this.groundFor(-1);
      s.bounces = 1;
      s.size = this.r(2.6, 4);
      s.rot = this.r(0, TAU);
      s.spin = this.r(-18, 18);
      s.col = i % 2 ? '#f2efe6' : '#ffffff';
      s.fade = 0.2;
    }
  }

  /** Something hit a building: wood chips (or bolts and paint flakes off the crane). */
  buildingHit(x, y, P, dirX, kind, mat) {
    const back = -(Math.sign(dirX) || 1);
    const small = kind === 'arrow' || kind === 'bolt';
    const n = small ? 2 : 3 + Math.round(P * 3);
    for (let i = 0; i < n; i++) {
      if (mat === 'metal') {
        const k = this.add(SPARK, true, x, y, this.r(0.15, 0.3));
        const a = Math.atan2(-0.5, back) + this.r(-0.9, 0.9);
        const sp = this.r(200, 420);
        k.vx = Math.cos(a) * sp;
        k.vy = Math.sin(a) * sp;
        k.grav = G * 0.7;
        k.drag = 1.4;
        k.size = this.r(1.4, 2.2);
        k.col = SPARK_COLS[i % 3];
      } else {
        const s = this.add(SPLINTER, true, x, y, this.r(0.45, 0.7));
        const a = Math.atan2(-0.6, back) + this.r(-0.9, 0.9);
        const sp = this.r(110, 260) * (0.6 + 0.5 * P);
        s.vx = Math.cos(a) * sp;
        s.vy = Math.sin(a) * sp;
        s.grav = G;
        s.drag = 0.8;
        s.ground = this.groundFor(-1);
        s.bounces = 1;
        s.a = this.r(4.5, 7.5);
        s.size = 1.8;
        s.rot = this.r(0, TAU);
        s.spin = this.r(-22, 22);
        s.col = this.pick(WOOD_COLS);
        s.fade = 0.2;
      }
    }
    if (!small) this.puff(true, x + back * 3, y, back * this.r(20, 50), -this.r(5, 20), this.r(0.3, 0.45), 3, this.r(6, 9) * (0.7 + P * 0.5), this.pick(DUST_COLS));
    if (!small && P > 0.7 && mat !== 'metal') this.plank(x, y, back * this.r(60, 160), -this.r(150, 260), this.r(8, 12), PLANK_COLS, true);
  }

  /** The crate hits the ground and bursts open (the patch: a clod of dirt splats). */
  buildingLand(x, y, w, bid, P) {
    const gy = Math.max(0, y);
    this.land(x, gy, 0.9 * P);
    this.groundRing(x, gy, w * 0.4, w + 50, 0.45, 6, '#f6edd4', 0.85);
    if (bid === 'beanPatch') {
      this.dirt(x - w * 0.25, gy, 1.2 * P, -1);
      this.dirt(x + w * 0.25, gy, 1.2 * P, 1);
      for (let i = 0; i < 6; i++) {
        const c = this.clod(x + this.r(-w / 2, w / 2), gy - 10, this.r(-200, 200), -this.r(250, 450), this.r(2.5, 4.5));
        if (i % 2) c.col = GRASS_COL;
      }
      return;
    }
    // Crate boards fly off to both sides, with splinters and a puff
    for (let i = 0; i < 7; i++) {
      const side = i % 2 ? 1 : -1;
      this.plank(x + side * this.r(0, w * 0.4), gy - this.r(10, 40), side * this.r(90, 260) * P, -this.r(220, 460) * P, this.r(12, 20), CRATE_COLS, true);
    }
    for (let i = 0; i < 8; i++) {
      const s = this.add(SPLINTER, true, x, gy - 20, this.r(0.5, 0.8));
      const a = this.r(-Math.PI, 0);
      const sp = this.r(150, 360);
      s.vx = Math.cos(a) * sp;
      s.vy = Math.sin(a) * sp;
      s.grav = G;
      s.drag = 0.8;
      s.ground = this.groundFor(-1);
      s.bounces = 1;
      s.a = this.r(4, 8);
      s.size = 1.8;
      s.rot = this.r(0, TAU);
      s.spin = this.r(-20, 20);
      s.col = this.pick(CRATE_COLS);
      s.fade = 0.2;
    }
    this.poof(x, gy - 22, '#ffd84a');
  }

  /** A building goes down: boards, dust along its base, and bits that say what it was. */
  buildingDown(x, y, w, h, bid, color) {
    const base = Math.max(0, y) > 0 ? y : WORLD.laneDepth * 0.5;
    const crane = bid === 'wreckingCrane';
    for (let i = 0; i < 8; i++) {
      const u = (i / 7 - 0.5) * 2;
      const side = Math.sign(u) || 1;
      this.puff(false, x + u * w * 0.6, base - this.r(0, 10), side * this.r(30, 120), -this.r(10, 50), this.r(0.9, 1.5), this.r(7, 10), this.r(16, 26), this.pick(DUST_COLS), 0.95, 1.8);
    }
    const n = crane ? 6 : 8;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      this.plank(x + this.r(-w * 0.4, w * 0.4), base - this.r(10, crane ? 120 : 40), side * this.r(60, 240), -this.r(200, 420), this.r(12, 22), crane ? STEEL_COLS : PLANK_COLS);
    }
    for (let i = 0; i < 10; i++) {
      const s = this.add(SPLINTER, true, x, base - 20, this.r(0.5, 0.8));
      const a = this.r(-Math.PI, 0);
      const sp = this.r(140, 340);
      s.vx = Math.cos(a) * sp;
      s.vy = Math.sin(a) * sp;
      s.grav = G;
      s.drag = 0.8;
      s.ground = this.groundFor(-1);
      s.bounces = 1;
      s.a = this.r(4, 8);
      s.size = 1.8;
      s.rot = this.r(0, TAU);
      s.spin = this.r(-20, 20);
      s.col = crane ? this.pick(['#f2b632', '#7c8490']) : this.pick(WOOD_COLS);
      s.fade = 0.2;
    }
    if (bid === 'boingBox') {
      // Gift paper scraps and ribbon
      for (let i = 0; i < 8; i++) this.feather(x + this.r(-15, 15), base - this.r(15, 40), this.r(-180, 180), -this.r(200, 380), i % 3 === 2 ? '#fbf8f0' : color, this.r(6, 9));
    } else if (bid === 'beanPatch') {
      this.dirt(x, base, 1.3, 0);
      for (let i = 0; i < 4; i++) this.feather(x + this.r(-20, 20), base - 28, this.r(-120, 120), -this.r(160, 300), this.pick(LEAF_COLS), this.r(6, 8));
    } else {
      for (let i = 0; i < 6; i++) this.puff(false, x + this.r(-20, 20), base - this.r(20, 120), this.r(-30, 30), -this.r(40, 100), this.r(1.1, 1.8), 9, this.r(18, 28), this.pick(STONE_DUST), 0.85, 1.4);
    }
    this.groundRing(x, base, w * 0.4, w + 70, 0.6, 6, '#efe6d2', 0.85);
    const sc = this.add(SCUFF, false, x, base + 2, 2.5);
    sc.size = w * 0.7;
  }

  /** The Boing Box lid rattles: two little shake ticks. */
  punchWindup(x, y) {
    for (const s of [-1, 1]) {
      const g = this.add(GLINT, true, x + s * 20, y - 6, 0.22);
      g.size = 6;
      g.rot = s * 0.3;
      g.col = '#fff6c2';
    }
  }

  /** BOING: the glove shoots out (speed lines off the box face, a puff at its foot). */
  punch(x, y, dir) {
    const ln = this.add(LINES, true, x + dir * 6, y, 0.16);
    ln.size = 10;
    ln.b = 6;
    ln.rot = this.r(0, TAU);
    const s = this.add(SLASH, true, x + dir * 40, y, 0.18);
    s.size = 70;
    s.a = dir > 0 ? 0 : Math.PI;
    s.b = 6;
    s.c = dir > 0 ? -1 : 1;
    this.dust(x, 4, 0.35, -dir);
  }

  /** A Sprout pops out of the patch: dirt flies, a leaf or two, a little puff. */
  sproutPop(x, y, dirX) {
    for (let i = 0; i < 6; i++) this.clod(x + this.r(-6, 6), y, dirX * this.r(20, 120) + this.r(-60, 60), -this.r(180, 340), this.r(2, 3.6));
    for (let i = 0; i < 2; i++) this.feather(x, y - 6, this.r(-60, 60), -this.r(120, 200), this.pick(LEAF_COLS), this.r(4.5, 6));
    this.puff(false, x, y - 3, 0, -20, 0.4, 4, 10, this.pick(DUST_COLS));
  }

  /** The wrecking ball swings through the bottom fast: a whoosh along its arc. */
  craneSwing(x, y, dirX, P) {
    const s = this.add(SLASH, true, x - dirX * 30, y + 6, 0.22);
    s.size = 80 + 30 * P;
    s.a = dirX > 0 ? 0 : Math.PI;
    s.b = 7 + 3 * P;
    s.c = dirX > 0 ? 1 : -1; // bulge down: the bottom of the arc
  }

  /** A flier's lift cuts out: a sputter of grey smoke. */
  liftOff(x, y) {
    for (let i = 0; i < 4; i++) this.puff(true, x + this.r(-6, 6), y - 10 + this.r(-4, 4), this.r(-40, 40), -this.r(20, 60), this.r(0.35, 0.55), 3, this.r(6, 9), this.pick(SMOKE_COLS), 0.8, 3);
  }

  /** Caught in the net: a white mesh poof and a twinkle. */
  netted(x, y) {
    const ring = this.add(RING, true, x, y, 0.26);
    ring.a = 8;
    ring.b = 32;
    ring.c = 4;
    ring.col = '#ffffff';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + this.r(-0.3, 0.3);
      this.puff(true, x + Math.cos(a) * 4, y + Math.sin(a) * 4, Math.cos(a) * this.r(60, 110), Math.sin(a) * this.r(60, 110), this.r(0.25, 0.4), 4, this.r(7, 10), PUFF_COLS, 0.9, 5);
    }
    for (let i = 0; i < 3; i++) {
      const g = this.add(GLINT, true, x + this.r(-18, 18), y + this.r(-18, 10), this.r(0.3, 0.45));
      g.size = this.r(5, 8);
      g.col = '#ffffff';
      g.c = this.r(0, 0.1);
    }
  }

  /** A flier hits the dirt. */
  crash(x, y, P) {
    const gy = Math.max(0, y);
    this.land(x, gy, P);
    this.dirt(x, gy, 0.8 * P, 0);
    this.stars(x, gy - 18);
  }

  /** A Propeller Pal's cap pops off. */
  propOff(x, y) {
    const ring = this.add(RING, true, x, y, 0.18);
    ring.a = 4;
    ring.b = 18;
    ring.c = 3;
    ring.col = '#ffffff';
    for (let i = 0; i < 3; i++) this.puff(true, x, y, this.r(-60, 60), -this.r(40, 90), this.r(0.25, 0.4), 3, this.r(5, 7), PUFF_COLS, 0.9, 4);
  }

  /** A dive or a swoop starts: speed lines streaming back from it. */
  dive(x, y, p) {
    const ln = this.add(LINES, true, x, y, 0.2);
    ln.size = 12;
    ln.b = 5;
    ln.rot = Math.atan2(-num(p.dirY, 1), -num(p.dirX, 0));
  }

  /** A Pogo touchdown: a little scuff of dust either side of the stick. */
  boing(x, y) {
    const gy = Math.max(0, y);
    for (const s of [-1, 1]) this.puff(false, x + s * 3, gy - 1, s * this.r(40, 80), -this.r(5, 20), this.r(0.25, 0.4), 2.5, this.r(5, 8), this.pick(DUST_COLS));
  }

  /** A Juggler throw: a few sparks off the fuse. */
  juggleToss(x, y, dirX) {
    for (let i = 0; i < 3; i++) {
      const k = this.add(SPARK, true, x, y, this.r(0.15, 0.28));
      const a = -Math.PI / 2 + dirX * 0.6 + this.r(-0.7, 0.7);
      const sp = this.r(120, 260);
      k.vx = Math.cos(a) * sp;
      k.vy = Math.sin(a) * sp;
      k.grav = G * 0.5;
      k.drag = 2;
      k.size = this.r(1.2, 2);
      k.col = SPARK_COLS[i % 3];
    }
  }

  /** Uh-oh: sweat drops flick off the Juggler. */
  fumble(x, y) {
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (i - 1.5) * 0.55;
      this.drop(x + Math.cos(a) * 10, y + Math.sin(a) * 10, Math.cos(a) * this.r(80, 140), Math.sin(a) * this.r(80, 140), this.r(2.4, 3.2), SWEAT_COL);
    }
  }

  /** A Juggler bomb: a compact blast (no smoke column, no scorch). */
  miniBlast(x, y, P) {
    const gy = Math.max(0, y + 12);
    const flash = this.add(RING, true, x, y, 0.2);
    flash.a = 6;
    flash.b = 60 * P;
    flash.c = 8;
    flash.col = '#fffbea';
    const b = this.add(BURST, true, x, y, 0.18);
    b.size = 22 * P;
    b.a = -Math.PI / 2;
    b.b = 11;
    b.c = 4;
    b.rot = this.r(0, TAU);
    for (let i = 0; i < 6; i++) {
      const a = this.r(0, TAU);
      const sp = this.r(70, 180) * P;
      this.puff(true, x + Math.cos(a) * 4, y + Math.sin(a) * 4, Math.cos(a) * sp, Math.sin(a) * sp - 40, this.r(0.28, 0.45), 5, this.r(10, 15) * P, this.pick(FIRE_COLS), 1, 4.5);
    }
    for (let i = 0; i < 3; i++) this.puff(false, x + this.r(-15, 15), y + this.r(-10, 5), this.r(-30, 30), -this.r(40, 90), this.r(0.8, 1.2), 6, this.r(12, 18) * P, this.pick(SMOKE_COLS), 0.8, 1.6);
    for (let i = 0; i < 5; i++) this.clod(x + this.r(-8, 8), gy, this.r(-260, 260), -this.r(200, 420) * P, this.r(2.2, 3.6));
    for (let i = 0; i < 5; i++) {
      const a = this.r(-Math.PI, 0);
      const k = this.add(SPARK, true, x, y, this.r(0.25, 0.45));
      const sp = this.r(250, 480);
      k.vx = Math.cos(a) * sp;
      k.vy = Math.sin(a) * sp;
      k.grav = G * 0.6;
      k.drag = 1.2;
      k.size = this.r(1.6, 2.6);
      k.col = SPARK_COLS[i % 3];
    }
  }

  /** BOOM-BOOM: two rings pulsing out of the drum. */
  beat(x, y, color) {
    const col = isHex(color) ? color : '#ffffff';
    for (let i = 0; i < 2; i++) {
      const ring = this.add(RING, true, x, y, 0.32 + i * 0.08);
      ring.a = 10 + i * 4;
      ring.b = 34 + i * 16;
      ring.c = 4 - i;
      ring.col = i ? '#ffffff' : col;
      ring.alpha = 0.9;
    }
  }

  /** Big Jelly swallows a bean: a wobbly splash ring and blobs of jelly. */
  engulf(x, y, color) {
    const col = isHex(color) ? color : '#7fd36a';
    const ring = this.add(RING, true, x, y, 0.3);
    ring.a = 14;
    ring.b = 44;
    ring.c = 5;
    ring.col = col;
    for (let i = 0; i < 9; i++) {
      const a = this.r(-Math.PI, 0);
      const sp = this.r(90, 220);
      this.drop(x, y, Math.cos(a) * sp, Math.sin(a) * sp, this.r(2.6, 4.2), i % 3 ? col : '#ffffff');
    }
    this.bubbles(x, y, 4, 10);
  }

  /** PTOO: the Jelly spits a bean out, spraying jelly. */
  spit(x, y, dirX, color) {
    const col = isHex(color) ? color : '#7fd36a';
    for (let i = 0; i < 12; i++) {
      const a = (dirX > 0 ? 0 : Math.PI) + this.r(-0.5, 0.5) - dirX * 0.3;
      const sp = this.r(160, 380);
      this.drop(x, y, Math.cos(a) * sp, Math.sin(a) * sp, this.r(2.2, 3.8), i % 4 ? col : '#ffffff');
    }
    const ln = this.add(LINES, true, x, y, 0.16);
    ln.size = 10;
    ln.b = 6;
    ln.rot = this.r(0, TAU);
  }

  /** A Brolly's umbrella flips inside out: a poof and scraps of canopy. */
  canopyFlip(x, y, color) {
    this.poof(x, y, '#ffffff');
    for (let i = 0; i < 4; i++) this.feather(x + this.r(-10, 10), y + this.r(-6, 6), this.r(-120, 120), -this.r(80, 180), i % 2 ? '#ffffff' : color, this.r(5, 7));
  }

  /** Bubble Wrap goes on: bubbles rising round the bean and a twinkle. */
  wrapOn(x, y) {
    this.bubbles(x, y, 7, 16);
    for (let i = 0; i < 2; i++) {
      const g = this.add(GLINT, true, x + this.r(-16, 16), y + this.r(-20, 10), this.r(0.35, 0.5));
      g.size = this.r(6, 9);
      g.col = '#ffffff';
      g.c = this.r(0, 0.12);
    }
  }

  /** Pop! A white pop star and a couple of bubble shards. */
  wrapPop(x, y) {
    for (let i = 0; i < 2; i++) {
      const g = this.add(GLINT, true, x + this.r(-10, 10), y + this.r(-10, 10), 0.22);
      g.size = this.r(6, 9);
      g.rot = this.r(-0.4, 0.4);
      g.col = '#ffffff';
    }
    for (let i = 0; i < 2; i++) this.bubble(x + this.r(-8, 8), y + this.r(-8, 8), this.r(-60, 60), -this.r(40, 100), this.r(2, 3), this.r(0.2, 0.35));
  }

  /** The wrap is gone: popped in a burst of bubbles, or drifting off. */
  wrapEnd(x, y, popped) {
    if (popped) {
      const ring = this.add(RING, true, x, y, 0.22);
      ring.a = 10;
      ring.b = 36;
      ring.c = 3;
      ring.col = '#dff4ff';
      this.bubbles(x, y, 9, 18);
    } else this.bubbles(x, y, 4, 14);
  }

  /** Feet up on a peel: a whoosh, a scuff and a puff of dust. */
  slip(x, y, dirX) {
    const gy = Math.max(0, y);
    const s = this.add(SLASH, true, x, gy - 14, 0.2);
    s.size = 46;
    s.a = dirX > 0 ? -0.5 : Math.PI + 0.5;
    s.b = 5;
    s.c = dirX > 0 ? -1 : 1;
    this.dust(x, gy, 0.6, dirX);
    const sc = this.add(SCUFF, false, x + dirX * 8, gy + 1, 1.2);
    sc.size = 14;
  }

  /** A heavy skids on a peel: a dust trail behind it. */
  skid(x, y, dirX) {
    const gy = Math.max(0, y);
    for (let i = 0; i < 5; i++) this.puff(false, x - dirX * i * 6, gy - 2, -dirX * this.r(20, 60), -this.r(5, 20), this.r(0.4, 0.6), 3, this.r(7, 11), this.pick(DUST_COLS));
    const sc = this.add(SCUFF, false, x - dirX * 12, gy + 1, 1.6);
    sc.size = 24;
  }

  /** ACHOO: a spray of droplets and a green-grey mist blown across the circle. */
  sneeze(x, y, R, dirX) {
    const x0 = x - dirX * R * 0.7;
    for (let i = 0; i < 16; i++) {
      const sp = this.r(300, 620);
      const a = (dirX > 0 ? 0 : Math.PI) + this.r(-0.35, 0.35);
      this.drop(x0, -80 + this.r(-10, 10), Math.cos(a) * sp, Math.sin(a) * sp - 60, this.r(1.8, 3), DROP_COL);
    }
    for (let i = 0; i < 6; i++) this.puff(true, x0 + dirX * this.r(10, 40), -80 + this.r(-15, 15), dirX * this.r(200, 420), this.r(-30, 30), this.r(0.45, 0.7), 8, this.r(14, 22), this.pick(MIST_COLS), 0.8, 2.4);
  }

  /** POP: foam blobs and droplets thrown up off the geyser, bubbles, a splash ring. */
  sodaErupt(x, y, R) {
    const gy = Math.max(0, y);
    for (let i = 0; i < 10; i++) {
      const d = this.puff(true, x + this.r(-8, 8), gy - this.r(40, 200), this.r(-120, 120), -this.r(100, 300), this.r(0.6, 1), 6, this.r(10, 16), this.pick(FOAM_COLS), 1, 1.2);
      d.grav = G * 0.5;
      d.ground = this.groundFor(-1);
    }
    for (let i = 0; i < 16; i++) this.drop(x + this.r(-10, 10), gy - this.r(60, 260), this.r(-200, 200), -this.r(100, 380), this.r(2.4, 4), '#f4ecd8');
    this.bubbles(x, gy - 40, 8, 16);
    this.groundRing(x, gy, 10, R + 20, 0.45, 5, '#f4ecd8', 0.9);
    // The bottle cap shoots off, spins and clatters down somewhere (cosmetic)
    const cap = this.chunk(x, gy - 50, this.r(-110, 110), -this.r(620, 760), 6, ['#c9d1d9', '#aab3bd'], true);
    cap.life = 2.4;
    cap.spin = this.r(14, 22) * (this.rnd() < 0.5 ? -1 : 1);
  }

  /** CLANG: a flash, dust rolling out both ways, clods, sparks off the iron, stars, a dent. */
  anvilImpact(x, y, P) {
    const gy = Math.max(0, y);
    const flash = this.add(RING, true, x, gy - 14, 0.18);
    flash.a = 10;
    flash.b = 60 * P;
    flash.c = 8;
    flash.col = '#fffbea';
    this.groundRing(x, gy, 14, 90 * P, 0.5, 8, '#f6edd4', 0.95);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) this.puff(false, x + side * this.r(10, 30), gy - this.r(0, 8), side * this.r(140, 360) * P, -this.r(10, 60), this.r(0.55, 0.95), 6, this.r(12, 20) * P, this.pick(DUST_COLS), 0.95, 2.4);
    }
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1;
      this.clod(x + side * this.r(5, 25), gy, side * this.r(60, 300) * P, -this.r(220, 520) * P, this.r(2.6, 4.8));
    }
    for (let i = 0; i < 8; i++) {
      const a = this.r(-Math.PI * 0.95, -Math.PI * 0.05);
      const k = this.add(SPARK, true, x, gy - 18, this.r(0.25, 0.45));
      const sp = this.r(250, 520);
      k.vx = Math.cos(a) * sp;
      k.vy = Math.sin(a) * sp;
      k.grav = G * 0.6;
      k.drag = 1.2;
      k.size = this.r(1.6, 2.4);
      k.col = SPARK_COLS[i % 3];
    }
    this.stars(x, gy - 46);
    const c = this.add(CRATER, false, x, gy + 2, 5);
    c.size = 34 * P;
  }

  /**
   * Running trails that come from sim state rather than events: crumbs and
   * dust behind a rolling Cheese Wheel, a wisp of smoke behind cannonballs,
   * sparks off a Juggler bomb's fuse. Call once per rendered frame with the game dt.
   */
  follow(battle, dt) {
    if (!battle || !(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    if (!this.acc) this.acc = new WeakMap();
    for (const s of battle.spells || []) {
      if (!s || s.kind !== 'wheel' || s.done || !Number.isFinite(s.x)) continue;
      let a = (this.acc.get(s) || 0) + dt;
      const dir = -(Math.sign(s.vx) || 1);
      const r = num(s.r, 40);
      while (a >= 0.06) {
        a -= 0.06;
        this.crumbs(s.x + dir * r * 0.4, s.y + r - 1, 0.3, dir);
      }
      this.acc.set(s, a);
    }
    for (const sh of battle.shots || []) {
      if (!sh || !Number.isFinite(sh.x)) continue;
      let a = (this.acc.get(sh) || 0) + dt;
      if (sh.kind === 'jbomb') {
        while (a >= 0.06) {
          a -= 0.06;
          const k = this.add(SPARK, true, sh.x, sh.y - num(sh.r, 6) * 1.4, this.r(0.12, 0.22));
          k.vx = this.r(-70, 70);
          k.vy = -this.r(40, 120);
          k.grav = G * 0.4;
          k.drag = 2.5;
          k.size = this.r(1, 1.6);
          k.col = SPARK_COLS[(this.rnd() * 3) | 0];
        }
      } else {
        while (a >= 0.03) {
          a -= 0.03;
          this.puff(false, sh.x, sh.y, this.r(-10, 10), this.r(-15, 0), this.r(0.25, 0.4), 2.5, this.r(5, 8), this.pick(CANNON_SMOKE), 0.7, 3);
        }
      }
      this.acc.set(sh, a);
    }
  }

  // --- simulation -----------------------------------------------------------------------

  update(dt) {
    if (dt > 0) this.clock += Math.min(dt, 0.1);
    if (!(dt > 0) || this.live === 0) return;
    dt = Math.min(dt, 0.1);
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        this.live--;
        continue;
      }
      if (p.drag > 0) {
        const k = 1 / (1 + p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.kind === CONFETTI && p.grav > 0) {
        // Flip and sway like paper
        p.c += p.d * dt;
        p.x += Math.sin(p.age * 3 + p.seed) * p.size * dt;
      } else if (p.kind === FEATHER && p.grav > 0) {
        // See-saw down: drift side to side, tipping into each swing
        const sw = Math.sin(p.age * 4.2 + (p.seed % 7));
        p.x += sw * p.size * 7 * dt;
        p.rot = p.c + sw * 0.75;
      }
      if (p.y > p.ground && p.vy > 0) this.hitGround(p);
    }
  }

  hitGround(p) {
    p.y = p.ground;
    if (p.bounces > 0) {
      p.bounces--;
      p.vy *= -p.rest;
      p.vx *= 0.55;
      p.spin *= 0.5;
      if (p.kind === SPARK) p.life = Math.min(p.life, p.age + 0.15);
      return;
    }
    // Come to rest, then fade out
    p.vx = 0;
    p.vy = 0;
    p.grav = 0;
    p.spin = 0;
    p.ground = Infinity;
    p.life = Math.min(p.life, p.age + (p.fade || 0.3));
  }

  // --- drawing --------------------------------------------------------------------------

  drawBack(ctx) {
    if (this.live === 0) return;
    this.measure(ctx);
    ctx.save();
    // Marks on the grass, rings along it, then dirt, then dust billowing over it
    this.pass(ctx, false, SCUFF);
    this.pass(ctx, false, CRATER);
    this.pass(ctx, false, GRING);
    this.pass(ctx, false, -1);
    this.pass(ctx, false, DUST);
    ctx.restore();
  }

  drawFront(ctx) {
    if (this.live === 0) return;
    this.measure(ctx);
    ctx.save();
    this.pass(ctx, true, -1);
    ctx.restore();
  }

  /** Read the camera zoom so effects keep a minimum on-screen size. */
  measure(ctx) {
    const m = ctx.getTransform();
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const zoom = Math.hypot(m.a, m.b) / dpr || 1;
    this.px = 1 / zoom;
    this.boost = clamp((0.9 / zoom) ** 0.6, 1, 1.8);
    this.base = m;
  }

  /** Draw one layer oldest-first: a single kind, or (-1) all the rest. */
  pass(ctx, front, only) {
    const pool = this.pool;
    const n = pool.length;
    for (let k = 0; k < n; k++) {
      const p = pool[(this.head + k) % n];
      if (!p.alive || p.front !== front) continue;
      if (only >= 0 ? p.kind !== only : !front && BACK_OWN.has(p.kind)) continue;
      DRAW[p.kind](ctx, p, this);
    }
    ctx.globalAlpha = 1;
  }
}

function unitDir(p) {
  const dx = num(p.dirX, 1);
  const dy = num(p.dirY, 0);
  const l = Math.hypot(dx, dy);
  return l > 1e-6 ? [dx / l, dy / l] : [1, 0];
}

/** Fade multiplier for the last `fade` seconds of life. */
function tailAlpha(p, fade) {
  return clamp((p.life - p.age) / fade, 0, 1);
}

// --- draw functions (one per kind) ------------------------------------------------------

/** Jagged comic star: n spikes, longer on the side the hit travels. */
function starPath(ctx, x, y, n, rOut, rIn, rot, seed, dirAng, bias) {
  const step = TAU / n;
  for (let i = 0; i < n; i++) {
    const a = rot + i * step + (hash(seed, i) - 0.5) * step * 0.55;
    let len = 0.6 + 0.4 * hash(seed, i + 40);
    if (hash(seed, i + 90) > 0.8) len *= 1.22; // the odd extra-long spike
    len *= 1 + bias * Math.max(0, Math.cos(a - dirAng));
    const ai = a + step * 0.5;
    const ri = rIn * (0.82 + 0.3 * hash(seed, i + 70));
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rOut * len, y + Math.sin(a) * rOut * len);
    else ctx.lineTo(x + Math.cos(a) * rOut * len, y + Math.sin(a) * rOut * len);
    ctx.lineTo(x + Math.cos(ai) * ri, y + Math.sin(ai) * ri);
  }
  ctx.closePath();
}

function drawBurst(ctx, p, fx) {
  const t = p.age / p.life;
  const n = p.b;
  // Snaps in at full size, swells a touch, then shrinks to nothing (no fade,
  // so it never goes muddy over the units)
  const s = t < 0.15 ? 0.9 + 1.3 * t : 1.1 * (1 - ((t - 0.15) / 0.85) ** 2.2);
  const R = p.size * fx.boost * s;
  if (R <= 0.5) return;
  const pal = BURST_PAL[p.c];
  // Crackle: the spikes flick between two poses every 1/30 s
  const rot = p.rot + (((p.age * 30) | 0) & 1) * (TAU / n) * 0.18;
  ctx.globalAlpha = 1;
  // Keyline: the same star a little bigger in the edge colour (a fill is
  // much cheaper than stroking all those sharp joins)
  const e = Math.max(R * 0.07, 1.3 * fx.px);
  ctx.beginPath();
  starPath(ctx, p.x, p.y, n, R + e, R * 0.5 + e, rot, p.seed, p.a, 0.4);
  ctx.fillStyle = pal.edge;
  ctx.fill();
  ctx.beginPath();
  starPath(ctx, p.x, p.y, n, R, R * 0.5, rot, p.seed, p.a, 0.4);
  ctx.fillStyle = pal.rim;
  ctx.fill();
  // Same star, smaller: white-hot core that cools into a thicker yellow rim
  const k = lerp(0.8, 0.6, Math.min(1, t * 2.5));
  ctx.beginPath();
  starPath(ctx, p.x, p.y, n, R * k, R * 0.5 * k, rot, p.seed, p.a, 0.4);
  ctx.fillStyle = pal.core;
  ctx.fill();
}

function drawLines(ctx, p, fx) {
  const t = p.age / p.life;
  const R = p.size * fx.boost;
  // Each line's head races outward and its tail catches up, so the lines
  // zip away instead of lingering
  const head = R * (1.0 + 1.3 * easeOut(Math.min(1, t * 1.6)));
  const tail = R * (0.8 + 1.5 * Math.min(1, t * 1.25) ** 1.3);
  if (head - tail < 0.5) return;
  const w = Math.max(R * 0.035, 0.8 * fx.px);
  const e = Math.max(R * 0.03, 0.8 * fx.px);
  ctx.globalAlpha = 1;
  // Orange keyline first, then the white line on top (fills, not strokes)
  linesPath(ctx, p, head, tail, w + e, e);
  ctx.fillStyle = '#e9781c';
  ctx.fill();
  linesPath(ctx, p, head, tail, w, 0);
  ctx.fillStyle = '#fffbea';
  ctx.fill();
}

/** Thin quads radiating from the centre, slimmer at the inner end. */
function linesPath(ctx, p, head, tail, hw, grow) {
  ctx.beginPath();
  for (let i = 0; i < p.b; i++) {
    const a = p.rot + (i / p.b) * TAU + (hash(p.seed, i) - 0.5) * 0.9;
    const l = 0.8 + 0.3 * hash(p.seed, i + 20);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const h = head * l + grow;
    const tl = Math.min(tail * l, h - 0.5) - grow;
    const tw = hw * 0.45;
    ctx.moveTo(p.x + c * tl - s * tw, p.y + s * tl + c * tw);
    ctx.lineTo(p.x + c * h - s * hw, p.y + s * h + c * hw);
    ctx.lineTo(p.x + c * h + s * hw, p.y + s * h - c * hw);
    ctx.lineTo(p.x + c * tl + s * tw, p.y + s * tl - c * tw);
    ctx.closePath();
  }
}

function drawSlash(ctx, p, fx) {
  const t = p.age / p.life;
  const L = p.size * fx.boost;
  const W = Math.max(p.b * fx.boost, 3.5 * fx.px) * (1 - 0.45 * t);
  const dx = Math.cos(p.a);
  const dy = Math.sin(p.a);
  const nx = -dy * p.c;
  const ny = dx * p.c;
  const h = L * 0.3; // bulge
  const ax = p.x - dx * L * 0.38;
  const ay = p.y - dy * L * 0.38;
  // The streak whips in along the swing, then its tail catches up
  const s1 = Math.min(1, 0.45 + (t / 0.22) * 0.55);
  const s0 = t < 0.3 ? 0 : ((t - 0.3) / 0.7) ** 1.3;
  if (s1 - s0 < 0.02) return;
  ctx.globalAlpha = 1;
  for (let layer = 0; layer < 2; layer++) {
    const ww = layer === 0 ? W * 1.9 + 2 * fx.px : W;
    ctx.beginPath();
    const steps = 12;
    // Up one edge then back down the other
    for (let side = 1; side >= -1; side -= 2) {
      for (let k = 0; k <= steps; k++) {
        const v = side > 0 ? k / steps : 1 - k / steps;
        const u = s0 + (s1 - s0) * v;
        const bulge = 4 * u * (1 - u);
        const cx = ax + dx * L * u + nx * h * bulge;
        const cy = ay + dy * L * u + ny * h * bulge;
        // tangent -> normal
        const tx = dx * L + nx * h * 4 * (1 - 2 * u);
        const ty = dy * L + ny * h * 4 * (1 - 2 * u);
        const tl = Math.hypot(tx, ty) || 1;
        // Needle thin at the tail, fattest near the front, pointed tip
        const half = ww * 0.5 * Math.sin(Math.PI * v ** 1.6) * side;
        const px = cx - (ty / tl) * half;
        const py = cy + (tx / tl) * half;
        if (side > 0 && k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fillStyle = layer === 0 ? '#7cc3f5' : '#ffffff';
    ctx.fill();
  }
}

function drawRing(ctx, p, fx) {
  const t = p.age / p.life;
  const r = lerp(p.a, p.b, easeOut(t)) * fx.boost;
  ctx.globalAlpha = (1 - t * t) * p.alpha;
  ctx.lineWidth = Math.max(p.c * (1 - t), 1 * fx.px);
  ctx.strokeStyle = p.col;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, TAU);
  ctx.stroke();
}

function drawGlint(ctx, p, fx) {
  const lt = p.age - p.c;
  if (lt <= 0) return;
  const t = lt / (p.life - p.c);
  const s = Math.max(p.size * fx.boost, 4 * fx.px) * Math.sin(Math.PI * Math.min(1, t * 1.15));
  if (s <= 0) return;
  const w = s * 0.24;
  const c = Math.cos(p.rot);
  const n = Math.sin(p.rot);
  ctx.globalAlpha = 1;
  ctx.beginPath();
  // Four long points with thin waists between them
  for (let i = 0; i < 4; i++) {
    const ox = i === 0 ? s : i === 2 ? -s : 0;
    const oy = i === 1 ? s : i === 3 ? -s : 0;
    const ix = (i === 0 || i === 3 ? w : -w) * 0.7;
    const iy = (i === 0 || i === 1 ? w : -w) * 0.7;
    const X = p.x + ox * c - oy * n;
    const Y = p.y + ox * n + oy * c;
    if (i === 0) ctx.moveTo(X, Y);
    else ctx.lineTo(X, Y);
    ctx.lineTo(p.x + ix * c - iy * n, p.y + ix * n + iy * c);
  }
  ctx.closePath();
  ctx.fillStyle = p.col;
  ctx.fill();
  ctx.lineWidth = Math.max(s * 0.08, 0.8 * fx.px);
  ctx.strokeStyle = 'rgba(42, 29, 20, 0.35)';
  ctx.stroke();
}

function drawSpark(ctx, p, fx) {
  const t = p.age / p.life;
  // Trail = the last ~0.035 s of travel (never longer than the flight so far)
  const k = Math.min(0.035 * (1 - 0.5 * t), p.age + 0.004);
  ctx.globalAlpha = p.fade ? tailAlpha(p, p.fade) : 1;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(p.size * fx.boost * (1 - 0.4 * t), 1.3 * fx.px);
  ctx.strokeStyle = p.col;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - p.vx * k - 0.01, p.y - p.vy * k);
  ctx.stroke();
}

function drawSpeck(ctx, p, fx) {
  const s = Math.max(p.size * fx.boost, 2.2 * fx.px) * 0.5;
  const c = Math.cos(p.rot) * s;
  const n = Math.sin(p.rot) * s;
  ctx.globalAlpha = tailAlpha(p, p.fade || 0.2);
  ctx.fillStyle = p.col;
  ctx.beginPath();
  ctx.moveTo(p.x + c, p.y + n);
  ctx.lineTo(p.x - n * 0.8, p.y + c * 0.8);
  ctx.lineTo(p.x - c, p.y - n);
  ctx.lineTo(p.x + n * 0.9, p.y - c * 0.9);
  ctx.closePath();
  ctx.fill();
}

function drawClod(ctx, p, fx) {
  const s = Math.max(p.size * fx.boost, 2.2 * fx.px);
  ctx.globalAlpha = tailAlpha(p, p.fade || 0.3);
  ctx.fillStyle = p.col;
  ctx.beginPath();
  // Lumpy pentagon, stable shape per clod
  for (let i = 0; i < 5; i++) {
    const a = p.rot + i * 1.2566;
    const r = s * (0.65 + 0.4 * hash(p.seed, i));
    if (i === 0) ctx.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
    else ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
}

function drawSplinter(ctx, p, fx) {
  const l = p.a * 0.5 * fx.boost;
  const c = Math.cos(p.rot) * l;
  const n = Math.sin(p.rot) * l;
  ctx.globalAlpha = tailAlpha(p, p.fade || 0.2);
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(p.size * fx.boost, 1.1 * fx.px);
  ctx.strokeStyle = p.col;
  ctx.beginPath();
  ctx.moveTo(p.x - c, p.y - n);
  ctx.lineTo(p.x + c, p.y + n);
  ctx.stroke();
}

function drawDust(ctx, p, fx) {
  const t = p.age / p.life;
  // Cartoon puff: pops up to size, then shrinks away while fading a little
  const grow = easeOut(Math.min(1, t / 0.35));
  const shrink = t < 0.45 ? 1 : 1 - ((t - 0.45) / 0.55) ** 1.6;
  const r = lerp(p.a, p.b, grow) * shrink * fx.boost;
  if (r <= 0.3) return;
  ctx.globalAlpha = p.alpha * (t < 0.6 ? 1 : 1 - (t - 0.6) * 1.5);
  ctx.fillStyle = p.col;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, TAU);
  ctx.fill();
  // Lit top, leaving a shaded crescent underneath (like the clouds)
  ctx.fillStyle = p.col2;
  ctx.beginPath();
  ctx.arc(p.x - r * 0.08, p.y - r * 0.17, r * 0.84, 0, TAU);
  ctx.fill();
}

function drawScuff(ctx, p, fx) {
  const t = p.age / p.life;
  ctx.globalAlpha = 0.3 * (1 - t);
  ctx.fillStyle = '#5a3a1c';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, p.size * fx.boost, p.size * 0.2 * fx.boost, 0, 0, TAU);
  ctx.fill();
}

function drawConfetti(ctx, p, fx) {
  const k = fx.boost;
  const flip = Math.cos(p.c);
  const hw = p.a * 0.5 * k * Math.max(0.12, Math.abs(flip));
  const hh = p.b * 0.5 * k;
  const c = Math.cos(p.rot);
  const n = Math.sin(p.rot);
  ctx.globalAlpha = tailAlpha(p, p.fade || 0.6) * (flip < 0 ? 0.8 : 1);
  ctx.fillStyle = p.col;
  ctx.beginPath();
  ctx.moveTo(p.x + hw * c - hh * n, p.y + hw * n + hh * c);
  ctx.lineTo(p.x - hw * c - hh * n, p.y - hw * n + hh * c);
  ctx.lineTo(p.x - hw * c + hh * n, p.y - hw * n - hh * c);
  ctx.lineTo(p.x + hw * c + hh * n, p.y + hw * n - hh * c);
  ctx.closePath();
  ctx.fill();
}

function drawStar(ctx, p, fx) {
  const t = p.age / p.life;
  const pop = t < 0.18 ? easeBack(t / 0.18) : t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
  const R = Math.max(p.size * fx.boost, 4 * fx.px) * pop;
  if (R <= 0.05) return;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = p.rot + (i * Math.PI) / 5;
    const r = i % 2 ? R * 0.48 : R;
    if (i === 0) ctx.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
    else ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(R * 0.28, 1.4 * fx.px);
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = '#ffe14d';
  ctx.fill();
  ctx.fillStyle = '#fff8d0';
  ctx.beginPath();
  ctx.arc(p.x - R * 0.18, p.y - R * 0.2, R * 0.2, 0, TAU);
  ctx.fill();
}

/** Comic word: letters pop in one by one with overshoot, drift up, then pop out. */
function drawText(ctx, p, fx) {
  const t = p.age / p.life;
  ctx.font = p.font;
  if (!p.offs) layoutWord(ctx, p);
  const size = Math.max(p.size * fx.boost, 16 * fx.px);
  const k = (size / 40) * (1 + 0.1 * t);
  // No alpha fade: see-through outlines look muddy, so letters shrink away
  ctx.globalAlpha = 1;
  const outAt = p.life - 0.2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 10;
  ctx.strokeStyle = INK;
  const text = p.text;
  // Pass 0: drop shadow, 1: outline, 2: fill
  for (let pass = 0; pass < 3; pass++) {
    ctx.fillStyle = pass === 0 ? INK : p.grad;
    for (let i = 0; i < text.length; i++) {
      const lt = p.age - i * 0.028;
      if (lt <= 0) break;
      const ot = (p.age - outAt - (i / text.length) * 0.1) / 0.1;
      if (ot >= 1) continue;
      const s = easeBack(Math.min(1, lt / 0.13)) * (ot > 0 ? 1 - ot * ot : 1);
      ctx.setTransform(fx.base);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(k, k);
      ctx.translate(p.offs[i], (hash(p.seed, i) - 0.5) * 7);
      ctx.rotate((hash(p.seed, i + 9) - 0.5) * 0.25);
      ctx.scale(s, s);
      const ch = text[i];
      if (pass === 0) ctx.fillText(ch, 3, 5);
      else if (pass === 1) ctx.strokeText(ch, 0, 0);
      else ctx.fillText(ch, 0, 0);
    }
  }
  ctx.setTransform(fx.base);
}

/** Measure letter positions once (at the 40 px reference size) and build the fill. */
function layoutWord(ctx, p) {
  const text = p.text;
  const w = [];
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    w.push(ctx.measureText(text[i]).width * 0.92);
    total += w[i];
  }
  p.offs = [];
  let x = -total / 2;
  for (let i = 0; i < text.length; i++) {
    p.offs.push(x + w[i] / 2);
    x += w[i];
  }
  const g = ctx.createLinearGradient(0, -16, 0, 16);
  g.addColorStop(0, mix(p.col, '#ffffff', 0.6));
  g.addColorStop(0.45, p.col);
  g.addColorStop(1, mix(p.col, '#e8571b', 0.55));
  p.grad = g;
}

/** Masonry / cheese chunk: a chunky block with a lit face and a dark edge. */
function drawStone(ctx, p, fx) {
  const s = Math.max(p.size * fx.boost, 2.4 * fx.px);
  const c = Math.cos(p.rot);
  const n = Math.sin(p.rot);
  const hw = s * 0.55;
  const hh = s * 0.4;
  ctx.globalAlpha = tailAlpha(p, p.fade || 0.4);
  const quad = (k, ox, oy) => {
    ctx.beginPath();
    ctx.moveTo(p.x + ox + (-hw * c + hh * n) * k, p.y + oy + (-hw * n - hh * c) * k);
    ctx.lineTo(p.x + ox + (hw * c + hh * n) * k, p.y + oy + (hw * n - hh * c) * k);
    ctx.lineTo(p.x + ox + (hw * c - hh * n) * k, p.y + oy + (hw * n + hh * c) * k);
    ctx.lineTo(p.x + ox + (-hw * c - hh * n) * k, p.y + oy + (-hw * n + hh * c) * k);
    ctx.closePath();
  };
  quad(1.18, 0, 0);
  ctx.fillStyle = 'rgba(60,48,40,0.8)';
  ctx.fill();
  quad(1, 0, 0);
  ctx.fillStyle = p.col;
  ctx.fill();
  quad(0.55, -s * 0.12, -s * 0.12);
  ctx.fillStyle = 'rgba(255,252,240,0.45)';
  ctx.fill();
}

/** A dent left in the grass: dark bowl, a lit far lip, fading out over the last 1.5 s. */
function drawCrater(ctx, p, fx) {
  const a = clamp((p.life - p.age) / 1.5, 0, 1) * Math.min(1, p.age / 0.08);
  const rx = p.size;
  const ry = rx * 0.2;
  ctx.globalAlpha = 0.5 * a;
  ctx.fillStyle = '#4a2f18';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.45 * a;
  ctx.fillStyle = '#2e1c0e';
  ctx.beginPath();
  ctx.ellipse(p.x + rx * 0.05, p.y + ry * 0.12, rx * 0.66, ry * 0.6, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.35 * a;
  ctx.strokeStyle = '#d9c59b';
  ctx.lineWidth = Math.max(1.5, ry * 0.3);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + ry * 0.1, rx * 0.98, ry, 0, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();
}

function drawGroundRing(ctx, p, fx) {
  const t = p.age / p.life;
  const rx = lerp(p.a, p.b, easeOut(t)) * fx.boost;
  const ry = rx * p.d;
  ctx.globalAlpha = p.alpha * (1 - t) ** 1.4;
  ctx.lineWidth = Math.max(p.c * (1 - 0.6 * t) * fx.boost * 0.7, 1.2 * fx.px);
  ctx.strokeStyle = p.col;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx, ry, 0, 0, TAU);
  ctx.stroke();
}

function drawCrown(ctx, p, fx) {
  const lt = p.age - p.c;
  if (lt <= 0) return;
  const t = lt / (p.life - p.c);
  const pop = t < 0.2 ? easeBack(t / 0.2) : 1;
  const R = Math.max(p.size * fx.boost, 8 * fx.px) * pop;
  ctx.globalAlpha = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
  const x = p.x;
  const y = p.y;
  const w = R * 1.25;
  const h = R * 0.9;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y + h / 2);
  ctx.lineTo(x - w / 2, y - h * 0.2);
  ctx.lineTo(x - w * 0.25, y + h * 0.08);
  ctx.lineTo(x, y - h / 2);
  ctx.lineTo(x + w * 0.25, y + h * 0.08);
  ctx.lineTo(x + w / 2, y - h * 0.2);
  ctx.lineTo(x + w / 2, y + h / 2);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(R * 0.2, 1.4 * fx.px);
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  ctx.fill();
  ctx.fillStyle = '#fff4b8';
  ctx.fillRect(x - w * 0.42, y + h * 0.18, w * 0.84, h * 0.12);
  ctx.fillStyle = '#e4433b';
  ctx.beginPath();
  ctx.arc(x, y + h * 0.05, R * 0.11, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2b6be0';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + s * w * 0.28, y + h * 0.26, R * 0.08, 0, TAU);
    ctx.fill();
  }
}

/** A bubble: a thin blue rim, a faint fill, a highlight; it pops (swells and fades) at the end. */
function drawBubble(ctx, p, fx) {
  const t = p.age / p.life;
  const r = Math.max(p.size * fx.boost, 2 * fx.px) * (t > 0.85 ? 1 + (t - 0.85) * 3 : Math.min(1, t * 8));
  if (r <= 0.3) return;
  ctx.globalAlpha = t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;
  ctx.fillStyle = 'rgba(223,244,255,0.35)';
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, TAU);
  ctx.fill();
  ctx.lineWidth = Math.max(r * 0.18, 0.8 * fx.px);
  ctx.strokeStyle = '#8fc8ea';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(p.x - r * 0.35, p.y - r * 0.38, r * 0.28, 0, TAU);
  ctx.fill();
}

/** A droplet stretched along its velocity, with a glint. */
function drawDrop(ctx, p, fx) {
  const s = Math.max(p.size * fx.boost, 1.6 * fx.px);
  const sp = Math.hypot(p.vx, p.vy);
  const L = s * (1 + Math.min(2, sp / 300));
  const a = sp > 1 ? Math.atan2(p.vy, p.vx) : Math.PI / 2;
  ctx.globalAlpha = tailAlpha(p, p.fade || 0.15);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(a);
  ctx.fillStyle = 'rgba(42,29,20,0.45)';
  ctx.beginPath();
  ctx.ellipse(-L * 0.25, 0, L * 0.75 + 0.8, s * 0.55 + 0.8, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = p.col;
  ctx.beginPath();
  ctx.ellipse(-L * 0.25, 0, L * 0.75, s * 0.55, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(L * 0.1, -s * 0.18, s * 0.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** A feather (or leaf, or scrap): a pointed oval with a quill down the middle. */
function drawFeather(ctx, p, fx) {
  const s = Math.max(p.size * fx.boost, 3 * fx.px);
  const c = Math.cos(p.rot);
  const n = Math.sin(p.rot);
  ctx.globalAlpha = tailAlpha(p, p.fade || 0.4);
  ctx.beginPath();
  ctx.moveTo(p.x - c * s, p.y - n * s);
  ctx.quadraticCurveTo(p.x - n * s * 0.5, p.y + c * s * 0.5, p.x + c * s, p.y + n * s);
  ctx.quadraticCurveTo(p.x + n * s * 0.5, p.y - c * s * 0.5, p.x - c * s, p.y - n * s);
  ctx.closePath();
  ctx.lineWidth = Math.max(s * 0.18, 0.8 * fx.px);
  ctx.strokeStyle = 'rgba(42,29,20,0.6)';
  ctx.stroke();
  ctx.fillStyle = p.col;
  ctx.fill();
  ctx.lineWidth = Math.max(s * 0.1, 0.6 * fx.px);
  ctx.strokeStyle = 'rgba(42,29,20,0.35)';
  ctx.beginPath();
  ctx.moveTo(p.x - c * s * 1.15, p.y - n * s * 1.15);
  ctx.lineTo(p.x + c * s * 0.8, p.y + n * s * 0.8);
  ctx.stroke();
}

/** A board: a long block with a dark rim, a lit edge and a nail at each end. */
function drawPlank(ctx, p, fx) {
  const L = p.a * fx.boost;
  const W = Math.max(p.size * fx.boost, 2.2 * fx.px);
  ctx.globalAlpha = tailAlpha(p, p.fade || 0.4);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.fillStyle = 'rgba(42,29,20,0.85)';
  ctx.fillRect(-L / 2 - 0.9, -W / 2 - 0.9, L + 1.8, W + 1.8);
  ctx.fillStyle = p.col;
  ctx.fillRect(-L / 2, -W / 2, L, W);
  ctx.fillStyle = 'rgba(255,252,240,0.35)';
  ctx.fillRect(-L / 2, -W / 2, L, W * 0.3);
  ctx.fillStyle = '#3b3b3f';
  ctx.fillRect(-L / 2 + 1.2, -0.6, 1.2, 1.2);
  ctx.fillRect(L / 2 - 2.4, -0.6, 1.2, 1.2);
  ctx.restore();
}

const DRAW = [];
DRAW[BURST] = drawBurst;
DRAW[LINES] = drawLines;
DRAW[SLASH] = drawSlash;
DRAW[RING] = drawRing;
DRAW[GLINT] = drawGlint;
DRAW[SPARK] = drawSpark;
DRAW[SPECK] = drawSpeck;
DRAW[CLOD] = drawClod;
DRAW[SPLINTER] = drawSplinter;
DRAW[DUST] = drawDust;
DRAW[SCUFF] = drawScuff;
DRAW[CONFETTI] = drawConfetti;
DRAW[TEXT] = drawText;
DRAW[STAR] = drawStar;
DRAW[EYE] = drawEye;
DRAW[STONE] = drawStone;
DRAW[CRATER] = drawCrater;
DRAW[GRING] = drawGroundRing;
DRAW[CROWN] = drawCrown;
DRAW[BUBBLE] = drawBubble;
DRAW[DROP] = drawDrop;
DRAW[FEATHER] = drawFeather;
DRAW[PLANK] = drawPlank;

function drawEye(ctx, p, fx) {
  const r = Math.max(p.size * fx.boost, 2.5 * fx.px);
  ctx.globalAlpha = tailAlpha(p, p.fade || 0.4);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, TAU);
  ctx.fill();
  ctx.lineWidth = Math.max(r * 0.16, 0.8 * fx.px);
  ctx.strokeStyle = '#1d1a24';
  ctx.stroke();
  ctx.fillStyle = '#111018';
  ctx.beginPath();
  ctx.arc(p.x + Math.cos(p.rot) * r * 0.45, p.y + Math.sin(p.rot) * r * 0.45, r * 0.5, 0, TAU);
  ctx.fill();
}

// --- Sim events of the 32 cards -> effects ---------------------------------------------------

const NEW_HITS = new Set(['bite', 'punch', 'crane', 'bump', 'stomp', 'dive', 'peck', 'net']);
const ptOf = (u, part, e) => (u && u[part] && Number.isFinite(u[part].x) ? u[part] : { x: e.x, y: e.y });

/**
 * Spawn the effects for one sim event of the new cards (contract 6.4). Returns
 * true when it handled the event; false for the existing ones (and for a
 * towerHit on a real tower, an `explode` that isn't a small Juggler blast and
 * a `hit` of an old kind), which the caller maps as before. Words and sounds
 * are the caller's. pal(team) -> palette (team colours of jelly, feathers...).
 */
export function fxForEvent(fx, e, pal = (t) => TEAMS[t] || TEAMS.blue) {
  if (!fx || !e || !e.type) return false;
  const u = e.unit;
  const tw = e.tower;
  const col = (team) => (pal(team) || TEAMS.blue).body;
  switch (e.type) {
    case 'buildingPlaced':
      return true;
    case 'buildingLand':
      if (tw) fx.spawn('buildingLand', { x: tw.x, y: WORLD.laneDepth * 0.5, w: tw.w, bid: tw.bid, power: e.power ?? 1 });
      return true;
    case 'buildingDown':
      if (tw) fx.spawn('buildingDown', { x: tw.x, y: WORLD.laneDepth * 0.5, w: tw.w, h: tw.h, bid: e.bid || tw.bid, color: col(e.team || tw.team) });
      return true;
    case 'towerHit': {
      if (!tw || tw.kind !== 'building') return false;
      const dirX = e.from && e.from.hip ? Math.sign(tw.x - e.from.hip.x) : -(tw.f || 1);
      fx.spawn('towerHit', { x: e.x, y: e.y, power: e.power ?? 0.5, dirX, kind: e.kind, mat: tw.bid === 'wreckingCrane' ? 'metal' : 'wood' });
      return true;
    }
    case 'punchWindup':
      if (tw) fx.spawn('punchWindup', { x: tw.x, y: -tw.h });
      return true;
    case 'punch':
      if (tw) fx.spawn('punch', { x: tw.x + (e.dir || tw.f || 1) * tw.w * 0.5, y: -21, dir: e.dir || tw.f });
      return true;
    case 'sproutPop':
      if (tw) fx.spawn('sproutPop', { x: tw.x + (tw.f || 1) * tw.w * 0.3, y: -28, dirX: tw.f || 1 });
      return true;
    case 'craneSwing': {
      const B = tw && tw.ball;
      if (B) fx.spawn('craneSwing', { x: B.x, y: B.y, dirX: Math.sign(B.vx) || 1, power: e.power ?? 1 });
      return true;
    }
    case 'hit':
      if (!NEW_HITS.has(e.kind)) return false;
      fx.spawn('impact', { x: e.x, y: e.y, power: e.power, dirX: e.dirX, dirY: e.dirY, kind: e.kind });
      if ((e.kind === 'crane' || e.kind === 'punch') && u) fx.spawn('dirt', { x: u.hip.x, y: u.ground, power: 0.8, dirX: e.dirX });
      return true;
    case 'explode':
      if (!e.small) return false;
      fx.spawn('miniBlast', { x: e.x, y: e.y, power: 0.6 });
      return true;
    case 'liftOff':
    case 'netted':
    case 'fumble': {
      const p = ptOf(u, 'head', e);
      fx.spawn(e.type, { x: p.x, y: p.y });
      return true;
    }
    case 'crash':
      fx.spawn('crash', { x: u && u.hip ? u.hip.x : e.x, y: u ? u.ground : e.y, power: clamp((e.power || 400) / 600, 0.3, 1.3) });
      return true;
    case 'propOff': {
      const p = ptOf(u, 'head', e);
      fx.spawn('propOff', { x: p.x, y: p.y - (u ? u.R || 10 : 10) });
      return true;
    }
    case 'dive':
    case 'swoop': {
      const p = ptOf(u, 'head', e);
      fx.spawn(e.type, { x: p.x, y: p.y, dirX: u ? u.f : 1, dirY: e.type === 'dive' ? 1 : 0.4 });
      return true;
    }
    case 'boing':
      fx.spawn('boing', { x: e.x, y: u ? u.ground : e.y });
      return true;
    case 'stomp': {
      const p = ptOf(e.victim, 'head', e);
      fx.spawn('stomp', { x: p.x, y: p.y });
      return true;
    }
    case 'juggleToss':
      fx.spawn('juggleToss', { x: e.x, y: e.y, dirX: u ? u.f : 1 });
      return true;
    case 'beat': {
      const c = ptOf(u, 'chest', e);
      const h = ptOf(u, 'hip', e);
      fx.spawn('beat', { x: (c.x + h.x) / 2 + (u ? u.f * (u.R || 14) * 0.5 : 0), y: (c.y + h.y) / 2, color: u ? col(u.team) : null });
      return true;
    }
    case 'scoop':
    case 'pelicanDrop':
    case 'letGo': {
      const p = ptOf(e.victim, 'chest', e);
      fx.spawn(e.type, { x: p.x, y: p.y, dirX: u ? u.f : 0, color: u ? col(u.team) : null });
      return true;
    }
    case 'engulf': {
      const p = ptOf(u, 'chest', e);
      fx.spawn('engulf', { x: p.x, y: p.y, color: u ? col(u.team) : null });
      return true;
    }
    case 'spit': {
      const p = ptOf(u, 'head', e);
      fx.spawn('spit', { x: p.x, y: p.y, dirX: u ? u.f : 1, color: u ? col(u.team) : null });
      return true;
    }
    case 'canopyFlip': {
      const p = ptOf(u, 'head', e);
      fx.spawn('canopyFlip', { x: p.x, y: p.y - 30, color: u ? col(u.team) : null });
      return true;
    }
    case 'brollyLand':
      fx.spawn('brollyLand', { x: u && u.hip ? u.hip.x : e.x, y: u ? u.ground : e.y, color: u ? col(u.team) : null });
      return true;
    case 'wrap':
    case 'wrapPop':
    case 'wrapEnd': {
      const p = ptOf(u, 'chest', e);
      fx.spawn(e.type, { x: p.x, y: p.y, key: u ? u.id : null, popped: e.popped });
      return true;
    }
    case 'slip':
    case 'skid':
      fx.spawn(e.type, { x: u && u.hip ? u.hip.x : e.x, y: u ? u.ground : e.y, dirX: u ? u.f : 1 });
      return true;
    case 'peelKick':
      fx.spawn('peelKick', { x: e.x, y: e.y });
      return true;
    case 'sneeze':
      fx.spawn('sneeze', { x: e.spell ? e.spell.x : e.x, y: e.y, radius: e.radius, dirX: e.spell ? e.spell.f : 1 });
      return true;
    case 'sodaErupt':
      fx.spawn('sodaErupt', { x: e.spell ? e.spell.x : e.x, y: WORLD.laneDepth * 0.5, radius: e.radius });
      return true;
    case 'anvilImpact':
      fx.spawn('anvilImpact', { x: e.spell ? e.spell.x : e.x, y: WORLD.laneDepth * 0.5, power: e.power ?? 1.4 });
      return true;
  }
  return false;
}
