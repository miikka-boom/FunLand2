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

import { WORLD } from '../config.js';

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

// --- particle kinds -----------------------------------------------------------------

const BURST = 0; // comic starburst
const LINES = 1; // radial speed lines
const SLASH = 2; // crescent sword streak
const RING = 3; // expanding ring (flat when d > 0: ground shock ring)
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
          else this.bonk(x, y, p);
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
    const R = 12 + 19 * P;
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
      ring.b = R * 1.9;
      ring.c = 4 + 3 * P;
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
      const sp = this.r(220, 600) * (0.6 + 0.5 * P);
      k.vx = Math.cos(a) * sp;
      k.vy = Math.sin(a) * sp - this.r(60, 180);
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

  // --- simulation -----------------------------------------------------------------------

  update(dt) {
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
    // Marks on the grass, then dirt, then dust billowing over it
    this.pass(ctx, false, SCUFF);
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
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2.5);
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
      if (only >= 0 ? p.kind !== only : !front && (p.kind === SCUFF || p.kind === DUST)) continue;
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
  ctx.lineJoin = 'round';
  ctx.beginPath();
  starPath(ctx, p.x, p.y, n, R, R * 0.5, rot, p.seed, p.a, 0.4);
  ctx.fillStyle = pal.rim;
  ctx.fill();
  ctx.lineWidth = Math.max(R * 0.05, 1.2 * fx.px);
  ctx.strokeStyle = pal.edge;
  ctx.stroke();
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
  const n = p.b;
  // Each line's head races outward and its tail catches up, so the lines
  // zip away instead of lingering
  const head = R * (1.0 + 1.3 * easeOut(Math.min(1, t * 1.6)));
  const tail = R * (0.8 + 1.5 * Math.min(1, t * 1.25) ** 1.3);
  if (head - tail < 0.5) return;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = p.rot + (i / n) * TAU + (hash(p.seed, i) - 0.5) * 0.9;
    const l = 0.8 + 0.3 * hash(p.seed, i + 20);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const h = head * l;
    const tl = Math.min(tail * l, h - 0.5);
    ctx.moveTo(p.x + c * tl, p.y + s * tl);
    ctx.lineTo(p.x + c * h, p.y + s * h);
  }
  const w = Math.max(R * 0.07, 1.6 * fx.px);
  ctx.lineCap = 'round';
  ctx.lineWidth = w + Math.max(R * 0.06, 1.6 * fx.px);
  ctx.strokeStyle = '#e9781c';
  ctx.stroke();
  ctx.lineWidth = w;
  ctx.strokeStyle = '#fffbea';
  ctx.stroke();
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
        // Fat at the leading end, needle thin at the tail
        const half = ww * 0.5 * Math.sin(Math.PI * (0.15 + 0.7 * v)) * v ** 0.6 * side;
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
  if (p.d > 0) ctx.ellipse(p.x, p.y, r, r * p.d, 0, 0, TAU);
  else ctx.arc(p.x, p.y, r, 0, TAU);
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
