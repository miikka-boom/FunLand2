// Battle scenery: sky, drifting clouds, parallax mountains and hills with
// trees, the two team castles, the grass strip the units stand on and the
// chunky dirt cross-section below it. Everything static is painted once into
// offscreen canvases at a quantised resolution and scaled with patterns /
// drawImage, so a normal frame is only a dozen or so draw calls.
//
//   const bg = createBackground({ seed: 7 });
//   bg.drawBack(ctx, view);   // whole canvas, before the units
//   bg.drawFront(ctx, view);  // a few grass tufts over the unit feet
//
// view = { w, h, dpr, cam: { x, y, zoom }, t }  (CSS px, world px, seconds)

import { WORLD, TEAMS } from '../config.js';

const TAU = Math.PI * 2;
const STEP = Math.SQRT2; // cache resolutions snap to powers of sqrt(2)
const MAX_DIM = 8192; // never make a cache canvas bigger than this per side

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;

/** Deterministic PRNG (mulberry32). Returns a function producing [0, 1). */
function mulberry32(seed) {
  let s = seed >>> 0;
  return function rnd() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Colours ------------------------------------------------------------------

function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

/** Blend two #rrggbb colours, returns #rrggbb. */
function mix(a, b, t) {
  const A = rgbOf(a);
  const B = rgbOf(b);
  let s = '#';
  for (let i = 0; i < 3; i++) s += Math.round(lerp(A[i], B[i], t)).toString(16).padStart(2, '0');
  return s;
}
const lighten = (c, t) => mix(c, '#ffffff', t);
const darken = (c, t) => mix(c, '#000000', t);
function rgba(hex, a) {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// --- Small path helpers -------------------------------------------------------------

function circlePath(ctx, x, y, r) {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, TAU);
}

function polyPath(ctx, pts, ox = 0, oy = 0) {
  ctx.moveTo(pts[0][0] + ox, pts[0][1] + oy);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + ox, pts[i][1] + oy);
  ctx.closePath();
}

function fillPoly(ctx, pts, color, ox = 0, oy = 0) {
  ctx.fillStyle = color;
  ctx.beginPath();
  polyPath(ctx, pts, ox, oy);
  ctx.fill();
}

/** Shrink a (roughly convex) polygon by moving every edge inward by d. */
function insetPoly(pts, d) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const s = area > 0 ? 1 : -1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i + n - 1) % n];
    const c = pts[i];
    const q = pts[(i + 1) % n];
    let e1x = c[0] - p[0];
    let e1y = c[1] - p[1];
    let e2x = q[0] - c[0];
    let e2y = q[1] - c[1];
    const l1 = Math.hypot(e1x, e1y) || 1;
    const l2 = Math.hypot(e2x, e2y) || 1;
    e1x /= l1;
    e1y /= l1;
    e2x /= l2;
    e2y /= l2;
    const n1x = -e1y * s;
    const n1y = e1x * s;
    const n2x = -e2y * s;
    const n2y = e2x * s;
    let mx = n1x + n2x;
    let my = n1y + n2y;
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    const k = d / Math.max(0.4, mx * n1x + my * n1y);
    out.push([c[0] + mx * k, c[1] + my * k]);
  }
  return out;
}

function polyBounds(pts) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  return { x0, y0, x1, y1 };
}

// --- Offscreen cache ---------------------------------------------------------------

/**
 * A static picture (repeating tile or sprite) painted in "units" into an
 * offscreen canvas. It is re-painted only when the needed resolution drifts
 * out of range, at a sqrt(2)-quantised scale, so smooth zooming reuses it.
 */
class Cached {
  constructor({ x = 0, y = 0, w, h, maxPx = 3e6, repeat = null, slack = 0.93, paint }) {
    this.x = x; // unit rect covered by the canvas
    this.y = y;
    this.w = w;
    this.h = h;
    this.repeat = repeat; // null | 'repeat' | 'repeat-x'
    this.paint = paint; // (ctx) => draws in units
    this.slack = slack; // how much up-scaling is tolerated before a re-paint (soft scenery: more)
    this.maxScale = Math.min(Math.sqrt(maxPx / (w * h)), MAX_DIM / w, MAX_DIM / h);
    this.canvas = null;
    this.pattern = null;
    this.scale = 0;
    this.sx = 1; // exact canvas px per unit (x / y)
    this.sy = 1;
  }

  /** Make sure the cache can be shown at `need` device px per unit. */
  update(need, frame) {
    const want = Math.min(need, this.maxScale);
    if (this.canvas) {
      const ok = this.scale >= want * this.slack && this.scale <= want * (2.2 / this.slack);
      if (ok || frame.rebuilds <= 0) return; // good enough, or reuse a stale one this frame
      frame.rebuilds--;
    }
    const lvl = Math.pow(STEP, Math.ceil(Math.log(want) / Math.log(STEP) - 1e-6));
    this.build(clamp(lvl, 0.05, this.maxScale));
  }

  build(scale) {
    const c = this.canvas || document.createElement('canvas');
    const W = Math.max(1, Math.round(this.w * scale));
    const H = Math.max(1, Math.round(this.h * scale));
    c.width = W;
    c.height = H;
    this.canvas = c;
    this.scale = scale;
    this.sx = W / this.w;
    this.sy = H / this.h;
    const g = c.getContext('2d');
    g.setTransform(this.sx, 0, 0, this.sy, -this.x * this.sx, -this.y * this.sy);
    g.clearRect(this.x, this.y, this.w, this.h);
    this.paint(g);
    this.pattern = this.repeat ? g.createPattern(c, this.repeat) : null;
  }
}

/**
 * Fill the screen band y0..y1 (CSS px, full width) with a repeating cache whose
 * unit origin (0, 0) sits at screen (ox, oy), `s` CSS px per unit.
 */
function fillPattern(ctx, cache, view, ox, oy, s, y0, y1) {
  y0 = Math.max(0, y0);
  y1 = Math.min(view.h, y1);
  if (y1 <= y0) return;
  const kx = s / cache.sx;
  const ky = s / cache.sy;
  const dpr = view.dpr;
  // Pattern px (0,0) is the cache's top-left corner = unit (cache.x, cache.y).
  const tx = ox + cache.x * s;
  const ty = oy + cache.y * s;
  ctx.setTransform(dpr * kx, 0, 0, dpr * ky, dpr * tx, dpr * ty);
  ctx.fillStyle = cache.pattern;
  const px0 = -tx / kx;
  const px1 = (view.w - tx) / kx;
  ctx.fillRect(px0, (y0 - ty) / ky, px1 - px0, (y1 - y0) / ky);
}

// --- Palettes ---------------------------------------------------------------------

const SKY = { top: '#5ea8de', mid: '#94cbeb', low: '#d5edf3' };
const CLOUD = { light: '#fffdf7', mid: '#f4efe5', shade: '#dfe4ea', under: '#b9c7d8' };
const STONE = {
  mortar: '#8b857d',
  blocks: ['#bdb7ae', '#b2aca3', '#c7c1b8', '#a8a299', '#b8b2a8'],
  dark: '#6f6962',
  light: '#d8d3ca',
  slit: '#3a3430',
};
const WOOD = { base: '#8e5a2e', dark: '#6b4121', light: '#a8713d', iron: '#3b3b3f' };
const DIRT = {
  crack: '#4a2915',
  browns: ['#b8743a', '#a9672f', '#c4823f', '#9d5d2b', '#b06b34', '#bf7a3a'],
  rock: { base: '#887f7a', light: '#a9a19b', dark: '#655d58', glint: '#c3bcb6' },
};

// --- Parallax layers ----------------------------------------------------------------
// f: horizontal/vertical follow factor (1 = moves with the world).
// d: how strongly the layer scales with zoom (0 = not at all, 1 = like the world).
// top: tallest content above the layer baseline (layer units).

const LAYERS = [
  {
    kind: 'mountains', f: 0.12, d: 0.25, period: 2300, top: 360, count: 7, hMin: 190, hMax: 330,
    base: '#afc1df', lit: '#c2d1e9', gully: '#a1b5d8', haze: '#cbdcee', hazeH: 230,
  },
  {
    kind: 'mountains', f: 0.2, d: 0.33, period: 1900, top: 290, count: 7, hMin: 130, hMax: 260,
    base: '#8aa2ce', lit: '#a0b5de', gully: '#7d95c5', haze: '#b2c7e3', hazeH: 170,
  },
  {
    kind: 'hills', f: 0.32, d: 0.43, period: 1700, top: 230, count: 9, hMin: 100, hMax: 190,
    light: '#d3e8b2', mid: '#b9d79c', base: '#a8cc98', fadeH: 80,
    trees: { gap: 30, h: [13, 24], density: 1.7, dark: '#86b07e', mid: '#9cc28a', light: '#b3d39d', trunk: '#8d8a70' },
  },
  {
    kind: 'hills', f: 0.46, d: 0.56, period: 2100, top: 210, count: 9, hMin: 70, hMax: 150,
    light: '#c6e48b', mid: '#a8d272', base: '#95c46a', fadeH: 60,
    trees: { gap: 28, h: [22, 40], density: 1.4, dark: '#5f9a4b', mid: '#76b058', light: '#93c86a', trunk: '#7d6a4c' },
  },
  {
    kind: 'hills', f: 0.64, d: 0.7, period: 2500, top: 200, count: 8, hMin: 40, hMax: 110,
    light: '#b8e070', mid: '#9acd58', base: '#86bd4c', fadeH: 40,
    trees: { gap: 26, h: [42, 82], density: 1.0, dark: '#468636', mid: '#5c9e40', light: '#7fbd52', trunk: '#7a5232' },
  },
];

/** Screen px per layer unit: between "fixed size" and "zooms with the world". */
function layerScale(d, view, fr) {
  return Math.pow(fr.zref, 1 - d) * Math.pow(view.cam.zoom, d);
}

/**
 * Screen y of a layer baseline. In the default framing every layer sits right
 * on the far edge of the grass; when the camera looks up, far layers lag
 * behind (their solid skirt fills the gap down to the grass).
 */
function anchorY(f, fr) {
  const g = fr.gTop + 2;
  const r = fr.hRef;
  return g > r ? g - (g - r) * (1 - f) : g + (r - g) * (1 - f) * 0.25;
}

const ENV_STEP = 10; // layer units between silhouette samples (periods are multiples of it)

function makeLayer(cfg, seed) {
  const rnd = mulberry32(seed);
  const mountains = cfg.kind === 'mountains';
  const geo = mountains ? genMountains(cfg, rnd) : genHills(cfg, rnd);
  const paint = mountains ? paintMountains : paintHills;
  const cache = new Cached({
    x: 0,
    y: -cfg.top,
    w: cfg.period,
    h: cfg.top + 8,
    maxPx: 3e6,
    repeat: 'repeat-x',
    slack: 0.72,
    paint: (g) => paint(g, cfg, geo),
  });
  return { cfg, cache, skirt: mountains ? cfg.haze : cfg.base, ...layerProfile(cfg, geo) };
}

/**
 * Sample a layer's silhouette every ENV_STEP units: `env` is a safe upper
 * bound of everything drawn (trees included), `solid` the height below which
 * the layer is opaque everywhere. Used to fill only what can be seen.
 */
function layerProfile(cfg, geo) {
  const P = cfg.period;
  const n = Math.round(P / ENV_STEP);
  const hi = new Float32Array(n);
  const lo = new Float32Array(n);
  const wrap = (i) => ((i % n) + n) % n;
  // Raise samples i0..i1 so they follow a straight segment (a, b) in units.
  const raiseSeg = (arr, ax, ay, bx, by) => {
    const i0 = Math.floor(ax / ENV_STEP);
    const i1 = Math.ceil(bx / ENV_STEP);
    for (let i = i0; i <= i1; i++) {
      const x = clamp(i * ENV_STEP, ax, bx);
      const y = bx > ax ? lerp(ay, by, (x - ax) / (bx - ax)) : Math.max(ay, by);
      const k = wrap(i);
      if (y > arr[k]) arr[k] = y;
    }
  };
  if (cfg.kind === 'mountains') {
    for (const pk of geo.peaks) {
      const ax = pk.x + pk.skew;
      // Upper bound: straight flanks (the real ones sag below them).
      raiseSeg(hi, pk.x - pk.hw, 0, ax, pk.h);
      raiseSeg(hi, ax, pk.h, pk.x + pk.hw, 0);
      // Lower bound: foot -> curve control point -> summit shoulder.
      const sh = pk.h - pk.hw * 0.07;
      raiseSeg(lo, pk.x - pk.hw, 0, pk.x - pk.hw * 0.42, pk.h * 0.32);
      raiseSeg(lo, pk.x - pk.hw * 0.42, pk.h * 0.32, ax - pk.hw * 0.11, sh);
      raiseSeg(lo, ax + pk.hw * 0.11, sh, pk.x + pk.hw * 0.42, pk.h * 0.32);
      raiseSeg(lo, pk.x + pk.hw * 0.42, pk.h * 0.32, pk.x + pk.hw, 0);
    }
  } else {
    for (const hp of geo.humps) {
      const hw = hp.w / 2;
      for (let i = Math.floor((hp.x - hw) / ENV_STEP); i <= Math.ceil((hp.x + hw) / ENV_STEP); i++) {
        const u = (i * ENV_STEP - hp.x) / hw;
        if (u <= -1 || u >= 1) continue;
        const y = hp.h * humpY(u);
        const k = wrap(i);
        if (y > hi[k]) hi[k] = y;
        if (y > lo[k]) lo[k] = y;
      }
      for (const tr of hp.trees) {
        const top = -tr.y + tr.ht;
        raiseSeg(hi, tr.x - tr.ht * 0.45, top, tr.x + tr.ht * 0.45, top);
      }
    }
  }
  // Dilate by one sample plus a margin so nothing between samples is cut.
  const env = new Float32Array(n);
  let solid = Infinity;
  for (let i = 0; i < n; i++) {
    env[i] = Math.min(cfg.top, Math.max(hi[wrap(i - 1)], hi[i], hi[wrap(i + 1)]) + 4);
    solid = Math.min(solid, lo[i]);
  }
  return { env, solid: Math.max(0, solid - 8) };
}

/** Where a layer lands on screen this frame. */
function placeLayer(L, view, fr) {
  const s = layerScale(L.cfg.d, view, fr);
  const yb = anchorY(L.cfg.f, fr);
  return { s, yb, ox: view.w / 2 - view.cam.x * L.cfg.f * s, solidY: yb - L.solid * s };
}

/**
 * Draw one parallax layer: its cached tile, clipped to the silhouette envelope
 * and stopped at `cover` (where nearer layers are already opaque), plus a solid
 * skirt from its baseline down to the grass.
 */
function drawLayer(ctx, L, pl, view, fr, cover) {
  const { cfg, cache } = L;
  const { s, yb, ox } = pl;
  const ground = Math.min(fr.gTop + 6, cover, view.h); // nothing to draw below this
  const yTop = yb - cfg.top * s;
  if (yTop >= ground) return; // hidden behind nearer layers / the ground
  const bottom = Math.min(yb + 6 * s, ground);
  if (bottom > Math.max(0, yTop)) {
    cache.update(s * view.dpr, fr);
    // Work in cache pixels: the tile's top-left corner sits at screen (ox, yTop).
    const kx = s / cache.sx;
    const ky = s / cache.sy;
    const dpr = view.dpr;
    ctx.setTransform(dpr * kx, 0, 0, dpr * ky, dpr * ox, dpr * yTop);
    ctx.fillStyle = cache.pattern;
    const n = L.env.length;
    const j0 = Math.floor(-ox / s / ENV_STEP) - 1;
    const j1 = Math.ceil((view.w - ox) / s / ENV_STEP) + 1;
    const pb = (bottom - yTop) / ky;
    const pt = Math.max(0, -yTop / ky); // no need to go above the screen
    const ux = ENV_STEP * cache.sx;
    ctx.beginPath();
    ctx.moveTo(j0 * ux, pb);
    for (let j = j0; j <= j1; j++) {
      const e = L.env[((j % n) + n) % n];
      ctx.lineTo(j * ux, Math.min(pb, Math.max(pt, (cfg.top - e) * cache.sy)));
    }
    ctx.lineTo(j1 * ux, pb);
    ctx.closePath();
    ctx.fill();
  }
  // Solid skirt from the baseline down to the grass.
  const y0 = Math.max(0, yb + 2 * s);
  if (y0 < ground) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = L.skirt;
    ctx.fillRect(0, y0, view.w, ground - y0);
  }
}

// Mountains: concave flanks, a lit left face split by a jagged ridge, haze at the foot.
function genMountains(cfg, rnd) {
  const P = cfg.period;
  const peaks = [];
  for (let i = 0; i < cfg.count; i++) {
    const h = lerp(cfg.hMin, cfg.hMax, Math.pow(rnd(), 0.8));
    const hw = h * (1.2 + rnd() * 0.9);
    const ridge = [];
    for (let k = 1; k <= 4; k++) ridge.push([(rnd() - 0.35) * hw * 0.12 * k + hw * 0.05 * k, (k / 4) * h]);
    const gullies = [];
    for (let k = 0; k < 2; k++) gullies.push([0.25 + rnd() * 0.45, 0.2 + rnd() * 0.3, rnd()]);
    peaks.push({ x: (i + rnd() * 0.7) * (P / cfg.count), h, hw, skew: (rnd() - 0.5) * 0.25 * hw, ridge, gullies });
  }
  peaks.sort((a, b) => b.h - a.h);
  return { peaks };
}

function paintMountains(g, cfg, geo) {
  const P = cfg.period;
  for (const pk of geo.peaks) {
    for (const dx of [-P, 0, P]) {
      if (pk.x + dx + pk.hw < 0 || pk.x + dx - pk.hw > P) continue;
      drawPeak(g, pk, pk.x + dx, cfg);
    }
  }
  // Haze at the foot of the range (also the skirt colour).
  const hz = g.createLinearGradient(0, -cfg.hazeH, 0, 0);
  hz.addColorStop(0, rgba(cfg.haze, 0));
  hz.addColorStop(1, rgba(cfg.haze, 1));
  g.fillStyle = hz;
  g.fillRect(-10, -cfg.hazeH, P + 20, cfg.hazeH + 0.5);
  g.fillStyle = cfg.haze;
  g.fillRect(-10, 0, P + 20, 9);
}

function drawPeak(g, pk, x, cfg) {
  const { h, hw } = pk;
  const ax = x + pk.skew;
  const ay = -h;
  const rr = hw * 0.11; // rounded summit
  const left = () => {
    g.moveTo(x - hw, 2);
    g.quadraticCurveTo(x - hw * 0.42, -h * 0.32, ax - rr, ay + rr * 0.6);
  };
  // Silhouette.
  g.fillStyle = cfg.base;
  g.beginPath();
  left();
  g.quadraticCurveTo(ax, ay - rr * 0.25, ax + rr, ay + rr * 0.6);
  g.quadraticCurveTo(x + hw * 0.42, -h * 0.32, x + hw, 2);
  g.closePath();
  g.fill();
  g.save();
  g.clip();
  // Lit left face up to a jagged ridge line.
  g.fillStyle = cfg.lit;
  g.beginPath();
  left();
  g.quadraticCurveTo(ax - rr * 0.2, ay - rr * 0.15, ax + rr * 0.2, ay + rr * 0.2);
  for (const [rx, ry] of pk.ridge) g.lineTo(ax + rx, ay + ry);
  g.lineTo(ax + pk.ridge[3][0], 2);
  g.closePath();
  g.fill();
  // A couple of soft gullies on the shaded side.
  g.fillStyle = cfg.gully;
  for (const [u, len, j] of pk.gullies) {
    const gx = ax + (x + hw - ax) * u * 0.55 + hw * 0.08;
    const gy = ay + h * u * 0.5;
    g.beginPath();
    g.moveTo(gx, gy);
    g.quadraticCurveTo(gx + hw * 0.05, gy + h * len * 0.6, gx + hw * (0.1 + j * 0.06), gy + h * len + 10);
    g.lineTo(gx + hw * (0.16 + j * 0.06), gy + h * len + 10);
    g.quadraticCurveTo(gx + hw * 0.07, gy + h * len * 0.5, gx, gy);
    g.fill();
  }
  g.restore();
}

// Rolling hills: overlapping domes lit from the upper left, trees on their faces.
function humpY(u) {
  return Math.pow(Math.cos((u * Math.PI) / 2), 1.35);
}

function genHills(cfg, rnd) {
  const P = cfg.period;
  const n = cfg.count;
  const humps = [];
  for (let i = 0; i < n; i++) {
    const w = (P / n) * (1.5 + rnd() * 1.4);
    const h = lerp(cfg.hMin, cfg.hMax, rnd());
    humps.push({ x: (i + rnd() * 0.6) * (P / n), w, h, tone: rnd() - 0.5 });
  }
  humps.sort((a, b) => b.h - a.h); // tallest at the back
  const T = cfg.trees;
  for (const hp of humps) {
    // Clumps of trees on the face of this hump.
    hp.trees = [];
    const clumps = Math.floor(rnd() * 3.2 * T.density * (hp.w / 300));
    for (let c = 0; c < clumps; c++) {
      const cu = (rnd() - 0.5) * 1.3;
      const count = 1 + Math.floor(rnd() * 4);
      for (let k = 0; k < count; k++) {
        const u = clamp(cu + (k - count / 2) * (T.gap / hp.w) * (0.7 + rnd() * 0.6), -0.85, 0.85);
        const v = 0.55 + rnd() * 0.45; // 1 = on the ridge line, lower = further down the face
        const ht = lerp(T.h[0], T.h[1], rnd()) * (0.8 + 0.25 * v);
        const r = rnd();
        const type = r < 0.5 ? 'round' : r < 0.85 ? 'cypress' : 'pine';
        hp.trees.push({ x: hp.x + (u * hp.w) / 2, y: -hp.h * humpY(u) * v + ht * 0.05, ht, type });
      }
    }
    hp.trees.sort((a, b) => a.y - b.y);
  }
  return { humps };
}

function paintHills(g, cfg, geo) {
  const P = cfg.period;
  const T = cfg.trees;
  for (const hp of geo.humps) {
    for (const dx of [-P, 0, P]) {
      if (hp.x + dx + hp.w / 2 < -T.h[1] || hp.x + dx - hp.w / 2 > P + T.h[1]) continue;
      drawHump(g, hp, dx, cfg);
      for (const tr of hp.trees) drawTree(g, tr.type, tr.x + dx, tr.y, tr.ht, T);
    }
  }
  // Mist toward the baseline so every hump fades into the skirt colour.
  const fd = g.createLinearGradient(0, -cfg.fadeH, 0, 0);
  fd.addColorStop(0, rgba(cfg.base, 0));
  fd.addColorStop(1, rgba(cfg.base, 1));
  g.fillStyle = fd;
  g.fillRect(-10, -cfg.fadeH, P + 20, cfg.fadeH + 0.5);
  g.fillStyle = cfg.base;
  g.fillRect(-10, 0, P + 20, 9);
}

function drawHump(g, hp, dx, cfg) {
  const cx = hp.x + dx;
  const hw = hp.w / 2;
  const lx = cx - hw * 0.25;
  const ly = -hp.h;
  const R = Math.hypot(hw, hp.h) * 1.1;
  const grad = g.createRadialGradient(lx, ly, 0, lx, ly, R);
  const light = hp.tone > 0 ? lighten(cfg.light, hp.tone * 0.25) : darken(cfg.light, -hp.tone * 0.06);
  grad.addColorStop(0, light);
  grad.addColorStop(0.45, cfg.mid);
  grad.addColorStop(1, cfg.base);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(cx - hw, 2);
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const u = -1 + (2 * i) / N;
    g.lineTo(cx + u * hw, -hp.h * humpY(u));
  }
  g.lineTo(cx + hw, 2);
  g.closePath();
  g.fill();
}

// --- Trees ---------------------------------------------------------------------------

function drawTree(g, type, x, y, ht, T) {
  if (type === 'round') roundTree(g, x, y, ht, T);
  else if (type === 'cypress') cypressTree(g, x, y, ht, T);
  else pineTree(g, x, y, ht, T);
}

function blob(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  circlePath(g, x, y, r);
  circlePath(g, x - r * 0.62, y + r * 0.34, r * 0.66);
  circlePath(g, x + r * 0.6, y + r * 0.38, r * 0.62);
  circlePath(g, x + r * 0.05, y + r * 0.55, r * 0.6);
  g.fill();
}

function roundTree(g, x, y, ht, T) {
  const r = ht * 0.3;
  const cy = y - ht + r;
  g.fillStyle = T.trunk;
  g.fillRect(x - ht * 0.045, cy, ht * 0.09, y - cy);
  blob(g, x, cy, r, T.dark);
  blob(g, x - r * 0.14, cy - r * 0.16, r * 0.76, T.mid);
  g.fillStyle = T.light;
  g.beginPath();
  circlePath(g, x - r * 0.32, cy - r * 0.36, r * 0.36);
  circlePath(g, x - r * 0.72, cy + r * 0.12, r * 0.22);
  g.fill();
}

function cypressTree(g, x, y, ht, T) {
  const hw = ht * 0.17;
  const top = y - ht;
  const bot = y - ht * 0.07;
  g.fillStyle = T.trunk;
  g.fillRect(x - ht * 0.025, y - ht * 0.14, ht * 0.05, ht * 0.14);
  g.fillStyle = T.dark;
  g.beginPath();
  g.moveTo(x, top);
  g.bezierCurveTo(x + hw * 1.3, top + ht * 0.3, x + hw * 1.15, bot - ht * 0.02, x, bot);
  g.bezierCurveTo(x - hw * 1.15, bot - ht * 0.02, x - hw * 1.3, top + ht * 0.3, x, top);
  g.fill();
  g.fillStyle = T.mid;
  g.beginPath();
  g.moveTo(x, top);
  g.bezierCurveTo(x - hw * 1.18, top + ht * 0.3, x - hw * 1.05, bot - ht * 0.04, x - hw * 0.1, bot - ht * 0.03);
  g.quadraticCurveTo(x + hw * 0.35, top + ht * 0.45, x, top);
  g.fill();
  g.fillStyle = T.light;
  g.beginPath();
  g.moveTo(x - hw * 0.15, top + ht * 0.12);
  g.quadraticCurveTo(x - hw * 0.85, top + ht * 0.35, x - hw * 0.6, top + ht * 0.62);
  g.quadraticCurveTo(x - hw * 0.25, top + ht * 0.4, x - hw * 0.15, top + ht * 0.12);
  g.fill();
}

function pineTree(g, x, y, ht, T) {
  g.fillStyle = T.trunk;
  g.fillRect(x - ht * 0.03, y - ht * 0.2, ht * 0.06, ht * 0.2);
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const tb = y - ht * (0.12 + i * 0.24);
    const tt = tb - ht * 0.42;
    const hw = ht * (0.26 - i * 0.055);
    g.fillStyle = T.dark;
    g.beginPath();
    g.moveTo(x, tt);
    g.lineTo(x + hw, tb);
    g.quadraticCurveTo(x, tb + ht * 0.05, x - hw, tb);
    g.closePath();
    g.fill();
    g.fillStyle = T.mid;
    g.beginPath();
    g.moveTo(x, tt);
    g.lineTo(x - hw, tb);
    g.quadraticCurveTo(x - hw * 0.4, tb + ht * 0.035, x - hw * 0.05, tb + ht * 0.02);
    g.closePath();
    g.fill();
  }
}

// --- Clouds ----------------------------------------------------------------------------

const CLOUD_PERIOD = 5200; // layer units before the cloud field repeats
const CLOUD_F = 0.06;
const CLOUD_D = 0.12;

function makeCloudShape(rnd, wide, tall) {
  const lobes = [];
  // Rows of puffs: a flat-bottomed base, a fuller middle and a small crown.
  // Radii come from the row spacing so neighbouring puffs always merge.
  const row = (n, span, rMin, rMax, yc, jitter, lit) => {
    const gap = (wide * span) / Math.max(1, n - 1);
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      const edge = 1 - Math.abs(u - 0.5) * 2; // 0 at the ends, 1 in the middle
      const r = clamp(gap * (0.62 + rnd() * 0.22), tall * rMin, tall * rMax) * (0.72 + 0.32 * edge);
      const x = (u - 0.5) * wide * span + (rnd() - 0.5) * gap * 0.3;
      const y = yc(r) - edge * tall * jitter * rnd();
      lobes.push({ x, y, r, lit });
    }
  };
  const nBase = Math.max(4, Math.round(wide / (tall * 0.42)));
  row(nBase, 0.86, 0.17, 0.4, (r) => -r * 0.6, 0.05, false);
  // A flat slab under the bottom puffs gives the cloud its flat, shaded base.
  const base = lobes.slice();
  const slab = {
    x0: Math.min(...base.map((l) => l.x)),
    x1: Math.max(...base.map((l) => l.x)),
    h: Math.min(...base.map((l) => l.r)) * 0.95,
  };
  row(Math.max(2, Math.round((wide * 0.52) / (tall * 0.5))) + Math.floor(rnd() * 2), 0.52, 0.26, 0.36, () => -tall * 0.44, 0.06, true);
  row(1 + Math.floor(rnd() * 2), 0.2, 0.26, 0.32, (r) => -tall + r * 1.02, 0, true);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = 0;
  for (const l of lobes) {
    x0 = Math.min(x0, l.x - l.r);
    x1 = Math.max(x1, l.x + l.r);
    y0 = Math.min(y0, l.y - l.r);
  }
  return { lobes, slab, wide, tall, box: { x: x0 - 3, y: y0 - 3, w: x1 - x0 + 6, h: -y0 + 5 } };
}

function paintCloud(g, sh) {
  const { lobes, slab } = sh;
  const outline = (dx, dy, k, withSlab, litOnly) => {
    g.beginPath();
    for (const l of lobes) if (!litOnly || l.lit) circlePath(g, l.x + dx * l.r, l.y + dy * l.r, l.r * k);
    if (withSlab) g.rect(slab.x0, -slab.h, slab.x1 - slab.x0, slab.h + 1);
  };
  const top = sh.box.y;
  g.save();
  // Flat bottom: everything is clipped at y = 0.
  g.beginPath();
  g.rect(sh.box.x, top, sh.box.w, -top);
  g.clip();
  const sg = g.createLinearGradient(0, top, 0, 0);
  sg.addColorStop(0, CLOUD.shade);
  sg.addColorStop(0.55, CLOUD.shade);
  sg.addColorStop(1, CLOUD.under);
  g.fillStyle = sg;
  outline(0, 0, 1, true);
  g.fill('nonzero');
  // Clip to the silhouette so the lit layers leave a shaded crescent under every puff.
  outline(0, 0, 1, true);
  g.clip();
  g.fillStyle = CLOUD.mid;
  outline(-0.1, -0.3, 0.9);
  g.fill();
  g.fillStyle = CLOUD.light;
  outline(-0.2, -0.46, 0.74, false, true);
  g.fill();
  // Cool shade pooling along the flat bottom.
  const bg = g.createLinearGradient(0, -sh.tall * 0.42, 0, 0);
  bg.addColorStop(0, rgba(CLOUD.under, 0));
  bg.addColorStop(1, rgba(CLOUD.under, 0.6));
  g.fillStyle = bg;
  g.fillRect(sh.box.x, -sh.tall * 0.42, sh.box.w, sh.tall * 0.42);
  // Gentle warm glow toward the sunny top.
  const lg = g.createLinearGradient(0, top, 0, top * 0.35);
  lg.addColorStop(0, 'rgba(255,253,240,0.6)');
  lg.addColorStop(1, 'rgba(255,253,240,0)');
  g.fillStyle = lg;
  g.fillRect(sh.box.x, top, sh.box.w, -top * 0.65);
  g.restore();
}

function makeClouds(seed) {
  const rnd = mulberry32(seed);
  const shapes = [
    makeCloudShape(rnd, 440, 185),
    makeCloudShape(rnd, 330, 140),
    makeCloudShape(rnd, 560, 160),
    makeCloudShape(rnd, 250, 100),
    makeCloudShape(rnd, 380, 165),
    makeCloudShape(rnd, 200, 70),
  ];
  const sprites = shapes.map(
    (sh) => new Cached({ ...sh.box, maxPx: 1.2e6, slack: 0.72, paint: (g) => paintCloud(g, sh) }),
  );
  const items = [];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const alt = 220 + Math.pow(rnd(), 1.2) * 1050;
    items.push({
      sprite: Math.floor(rnd() * shapes.length),
      x: (i + rnd() * 0.7) * (CLOUD_PERIOD / n),
      alt,
      size: (0.65 + rnd() * 0.5) * (1.1 - alt / 3000),
      speed: 5 + rnd() * 7,
      f: CLOUD_F * (0.7 + rnd() * 0.6),
    });
  }
  items.sort((a, b) => b.alt - a.alt); // high (far) clouds first
  return { shapes, sprites, items };
}

function drawClouds(ctx, C, view, fr) {
  const s = layerScale(CLOUD_D, view, fr);
  const yb = anchorY(CLOUD_F, fr);
  const used = new Set();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  const span = CLOUD_PERIOD * s;
  for (const c of C.items) {
    const sp = C.sprites[c.sprite];
    const k = s * c.size;
    const y = yb - c.alt * s;
    if (y + sp.y * k > view.h || y + (sp.y + sp.h) * k < 0 || y + sp.y * k > fr.gTop) continue;
    if (!used.has(sp)) {
      sp.update(s * 1.2 * view.dpr, fr);
      used.add(sp);
    }
    const lx = (((c.x + view.t * c.speed) % CLOUD_PERIOD) + CLOUD_PERIOD) % CLOUD_PERIOD;
    let sx = (lx - view.cam.x * c.f) * s + view.w / 2;
    const x0 = sp.x * k;
    const x1 = (sp.x + sp.w) * k;
    sx -= Math.ceil((sx + x1) / span) * span; // leftmost copy that could be visible
    for (; sx + x0 < view.w; sx += span) {
      if (sx + x1 < 0) continue;
      ctx.drawImage(sp.canvas, sx + x0, y + sp.y * k, sp.w * k, sp.h * k);
    }
  }
}

// --- Birds --------------------------------------------------------------------------------

const BIRD_PERIOD = 3600;

function makeBirds(seed) {
  const rnd = mulberry32(seed);
  const flocks = [];
  for (let i = 0; i < 2; i++) {
    const birds = [];
    const n = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) birds.push({ dx: -k * (16 + rnd() * 10), dy: (k % 2 ? 1 : -1) * k * 5 + rnd() * 4, ph: rnd() * TAU, size: 0.8 + rnd() * 0.4 });
    flocks.push({ x: (i + rnd() * 0.5) * (BIRD_PERIOD / 2), alt: 330 + rnd() * 260, speed: 22 + rnd() * 14, birds });
  }
  return flocks;
}

/** Little "m" shaped birds flapping across the sky. */
function drawBirds(ctx, flocks, view, fr, cover) {
  const s = layerScale(CLOUD_D, view, fr);
  const yb = anchorY(0.1, fr);
  const span = BIRD_PERIOD * s;
  const t = view.t;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.strokeStyle = 'rgba(52,70,98,0.7)';
  ctx.lineWidth = Math.max(1, 1.6 * s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let any = false;
  for (const fl of flocks) {
    const lx = (((fl.x + t * fl.speed) % BIRD_PERIOD) + BIRD_PERIOD) % BIRD_PERIOD;
    let fx = (lx - view.cam.x * 0.1) * s + view.w / 2;
    fx -= Math.ceil((fx + 80 * s) / span) * span;
    for (; fx - 120 * s < view.w; fx += span) {
      if (fx + 80 * s < 0) continue;
      for (const b of fl.birds) {
        const bx = fx + b.dx * s;
        const by = yb - (fl.alt - b.dy + Math.sin(t * 1.3 + b.ph) * 4) * s;
        if (by < -10 || by > cover - 4) continue;
        const sz = 7 * s * b.size;
        const f = Math.sin(t * 9 + b.ph);
        const wy = -sz * (0.1 + 0.5 * f);
        ctx.moveTo(bx - sz, by + wy);
        ctx.quadraticCurveTo(bx - sz * 0.45, by + wy * 0.2 - sz * 0.3, bx, by);
        ctx.quadraticCurveTo(bx + sz * 0.45, by + wy * 0.2 - sz * 0.3, bx + sz, by + wy);
        any = true;
      }
    }
  }
  if (any) ctx.stroke();
}

// --- Sky ----------------------------------------------------------------------------------

function drawSky(ctx, view, fr, cover) {
  const yH = anchorY(0.1, fr);
  const g = ctx.createLinearGradient(0, yH - view.h * 1.05, 0, yH);
  g.addColorStop(0, SKY.top);
  g.addColorStop(0.6, SKY.mid);
  g.addColorStop(1, SKY.low);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.w, Math.min(view.h, fr.gTop + 8, cover));
}

// --- Grass band (world layer) ------------------------------------------------------

const GRASS_W = 640;
const GRASS_Y0 = WORLD.grassTop - 14;
const GRASS_Y1 = WORLD.grassFront + 26;

/** Call fn(x) plus the wrapped copies needed to make a tile seamless. */
function wrapX(x, m, W, fn) {
  fn(x);
  if (x - m < 0) fn(x + W);
  if (x + m > W) fn(x - W);
}

function grassBlade(g, x, y, len, bw, lean) {
  g.moveTo(x - bw, y);
  g.quadraticCurveTo(x - bw * 0.2 + lean * 0.25, y - len * 0.55, x + lean, y - len);
  g.quadraticCurveTo(x + bw * 0.4 + lean * 0.3, y - len * 0.45, x + bw, y);
  g.closePath();
}

/** A tuft = a fan of blades, darker ones behind and a lit one in front. */
function tuft(g, x, y, sc, rnd, cols) {
  const n = 3 + Math.floor(rnd() * 4);
  const blades = [];
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1 || 1) - 0.5) * 1.6 + (rnd() - 0.5) * 0.4;
    blades.push([x + a * 1.6 * sc, (4 + rnd() * 5) * sc * (1 - Math.abs(a) * 0.35), a * 3.2 * sc]);
  }
  g.fillStyle = cols[0];
  g.beginPath();
  for (const [bx, len, lean] of blades) grassBlade(g, bx, y, len, 0.9 * sc, lean);
  g.fill();
  g.fillStyle = cols[1];
  g.beginPath();
  for (let i = 0; i < n; i += 2) grassBlade(g, blades[i][0] - 0.3 * sc, y, blades[i][1] * 0.8, 0.6 * sc, blades[i][2] * 0.9);
  g.fill();
}

function paintGrass(g, rnd) {
  const W = GRASS_W;
  const top = WORLD.grassTop;
  const front = WORLD.grassFront;
  const depth = (y) => clamp((y - top) / (front - top), 0, 1);
  const sz = (y) => lerp(0.55, 1.15, depth(y));

  // Soft shadow the overhanging lip casts on the dirt.
  const sh = g.createLinearGradient(0, front - 2, 0, front + 22);
  sh.addColorStop(0, 'rgba(38,18,6,0.62)');
  sh.addColorStop(0.45, 'rgba(38,18,6,0.25)');
  sh.addColorStop(1, 'rgba(38,18,6,0)');
  g.fillStyle = sh;
  g.fillRect(-4, front - 2, W + 8, 24);

  // Surface: sunlit far edge, slightly deeper green toward the front.
  const body = g.createLinearGradient(0, top, 0, front);
  body.addColorStop(0, '#bcdd6c');
  body.addColorStop(0.3, '#a7d35a');
  body.addColorStop(1, '#8cc346');
  g.fillStyle = body;
  g.fillRect(-4, top, W + 8, front - top + 1);

  // Mottled patches, squashed by perspective.
  for (let i = 0; i < 46; i++) {
    const y = lerp(top + 2, front - 7, rnd());
    const rx = (10 + rnd() * 30) * sz(y);
    const lightP = rnd() < 0.5;
    const col = lightP ? 'rgba(206,232,128,0.45)' : 'rgba(110,170,52,0.32)';
    const x = rnd() * W;
    wrapX(x, rx, W, (xx) => {
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(xx, y, rx, rx * 0.2, 0, 0, TAU);
      g.fill();
    });
  }
  // Worn earthy patches and dark specks.
  for (let i = 0; i < 9; i++) {
    const y = lerp(top + 6, front - 9, rnd());
    const rx = (6 + rnd() * 12) * sz(y);
    const x = rnd() * W;
    wrapX(x, rx, W, (xx) => {
      g.fillStyle = 'rgba(160,140,70,0.35)';
      g.beginPath();
      g.ellipse(xx, y, rx, rx * 0.22, 0, 0, TAU);
      g.fill();
    });
  }
  g.fillStyle = 'rgba(92,70,32,0.55)';
  for (let i = 0; i < 70; i++) {
    const y = lerp(top + 2, front - 6, rnd());
    const r = (0.5 + rnd() * 0.8) * sz(y);
    const x = rnd() * W;
    wrapX(x, 2, W, (xx) => {
      g.beginPath();
      g.ellipse(xx, y, r * 1.4, r * 0.7, 0, 0, TAU);
      g.fill();
    });
  }

  // Little stones and tufts, back to front.
  const things = [];
  for (let i = 0; i < 12; i++) things.push({ kind: 'stone', y: lerp(top + 3, front - 8, rnd()), x: rnd() * W, r: 1.6 + rnd() * 2.6, k: rnd() });
  for (let i = 0; i < 95; i++) {
    const y = lerp(top + 1, front - 7, Math.pow(rnd(), 0.75));
    things.push({ kind: 'tuft', y, x: rnd() * W, seed: Math.floor(rnd() * 1e9) });
  }
  for (let i = 0; i < 7; i++) things.push({ kind: 'flower', y: lerp(top + 4, front - 9, rnd()), x: rnd() * W, k: rnd() });
  things.sort((a, b) => a.y - b.y);
  for (const t of things) {
    const s = sz(t.y);
    if (t.kind === 'stone') {
      const r = t.r * s;
      wrapX(t.x, r * 2, W, (x) => {
        g.fillStyle = 'rgba(60,100,30,0.35)';
        g.beginPath();
        g.ellipse(x + r * 0.2, t.y + r * 0.35, r * 1.35, r * 0.45, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#7b7873';
        g.beginPath();
        g.ellipse(x, t.y, r * 1.15, r * 0.72, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#a3a09a';
        g.beginPath();
        g.ellipse(x - r * 0.15, t.y - r * 0.18, r * 0.85, r * 0.48, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#cbc8c1';
        g.beginPath();
        g.ellipse(x - r * 0.35, t.y - r * 0.33, r * 0.35, r * 0.18, 0, 0, TAU);
        g.fill();
      });
    } else if (t.kind === 'tuft') {
      const d = depth(t.y);
      const cols = [mix('#79b23d', '#5d9a2d', d), mix('#cde77f', '#b4dc68', d)];
      wrapX(t.x, 12, W, (x) => tuft(g, x, t.y + 0.5, s, mulberry32(t.seed), cols));
    } else {
      wrapX(t.x, 4, W, (x) => {
        g.fillStyle = t.k < 0.5 ? '#fff7e0' : '#ffd84d';
        g.beginPath();
        for (let p = 0; p < 4; p++) circlePath(g, x + Math.cos(p * 1.57) * 0.9 * s, t.y - 1.2 * s + Math.sin(p * 1.57) * 0.6 * s, 0.75 * s);
        g.fill();
        g.fillStyle = '#e09a2c';
        g.beginPath();
        circlePath(g, x, t.y - 1.2 * s, 0.45 * s);
        g.fill();
      });
    }
  }

  // Far edge: small clumps poking up so the field melts into the hills.
  let x = 0;
  while (x < W) {
    const r = 1.6 + rnd() * 3.2;
    const cx = x;
    const col = rnd() < 0.5 ? '#8fc152' : '#9fcb5b';
    wrapX(cx, r * 2, W, (xx) => {
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(xx, top + 0.6, r * 1.5, r, 0, Math.PI, TAU);
      g.fill();
    });
    x += 3 + rnd() * 9;
  }

  // Front lip: a bright rounded rim turning down into a dark hanging fringe.
  const lipTop = front - 7;
  const lip = g.createLinearGradient(0, lipTop, 0, front + 2);
  lip.addColorStop(0, '#a9d85c');
  lip.addColorStop(0.35, '#7fbb3e');
  lip.addColorStop(1, '#4f9029');
  g.fillStyle = lip;
  g.beginPath();
  g.moveTo(-4, front + 2);
  for (let lx = -4; lx <= W + 4; lx += 4) {
    const bump = Math.sin((lx / W) * TAU * 23) * 0.7 + Math.sin((lx / W) * TAU * 57 + 1.3) * 0.5;
    g.lineTo(lx, lipTop + bump);
  }
  g.lineTo(W + 4, front + 2);
  g.closePath();
  g.fill();

  // Hanging fringe of grass over the dirt (seamless: random steps that end at W).
  const fringe = [];
  x = 0;
  while (x < W - 4) {
    const step = 3 + rnd() * 4.5;
    const long = rnd() < 0.18;
    fringe.push([x + step * 0.5, front + 1.5 + (long ? 7 + rnd() * 6 : 2.5 + rnd() * 4.5)]);
    x += step;
  }
  const drawFringe = (col, dy, k) => {
    g.fillStyle = col;
    g.beginPath();
    for (const dx of [-W, 0, W]) {
      g.moveTo(dx, front - 1);
      for (const [fx, fy] of fringe) g.lineTo(dx + fx, front + 1 + (fy - front - 1) * k + dy);
      g.lineTo(dx + W, front - 1);
      g.closePath();
    }
    g.fill();
  };
  drawFringe('#3d7a24', 0, 1);
  drawFringe('#559630', -1, 0.55);

  // Tufts along the rim itself, breaking the straight edge.
  x = 0;
  while (x < W) {
    const seed = Math.floor(rnd() * 1e9);
    const cx = x;
    wrapX(cx, 12, W, (xx) => tuft(g, xx, lipTop + 2, 1.15, mulberry32(seed), ['#6aa936', '#bfe271']));
    x += 7 + rnd() * 16;
  }
}

// --- Front tufts (drawn over the units' feet) -----------------------------------------

const FRONT_W = 832;
const FRONT_Y0 = 8;
const FRONT_Y1 = WORLD.grassFront + 10;

function paintFront(g, rnd) {
  const W = FRONT_W;
  let x = rnd() * 40;
  while (x < W - 20) {
    const y = lerp(28, 36, rnd());
    const seed = Math.floor(rnd() * 1e9);
    const big = rnd() < 0.35;
    const cx = x;
    wrapX(cx, 16, W, (xx) => {
      tuft(g, xx, y, big ? 1.7 : 1.25, mulberry32(seed), ['#4f8f2a', '#9bd156']);
      if (big) tuft(g, xx + 4, y + 1, 1.2, mulberry32(seed + 1), ['#5b9b30', '#b2dc68']);
    });
    x += 45 + rnd() * 110;
  }
}

// --- Dirt cross-section (world layer) -------------------------------------------------

const DIRT_W = 1536;
const DIRT_H = 640;

/** Build chunky rock plates: rows between jagged polylines, cut by slanted joints. */
function makeDirt(seed) {
  const rnd = mulberry32(seed);
  const R = 7;
  const K = 26;
  const lines = [];
  for (let j = 0; j < R; j++) {
    const base = ((j + (j ? (rnd() - 0.5) * 0.36 : 0)) / R) * DIRT_H;
    const tilt = (rnd() - 0.5) * 30; // rows wander up and down a little
    const ph = rnd() * TAU;
    const pts = [];
    for (let k = 0; k < K; k++) {
      const u = k / K;
      pts.push([(k + (rnd() - 0.5) * 0.7) * (DIRT_W / K), base + Math.sin(u * TAU * 2 + ph) * tilt * 0.5 + (rnd() - 0.5) * 30]);
    }
    lines.push(pts);
  }
  // Row boundary j as a sorted list covering x in [-W, 2W].
  const line = (j) => {
    const src = lines[j % R];
    const oy = Math.floor(j / R) * DIRT_H;
    const out = [];
    for (const dx of [-DIRT_W, 0, DIRT_W]) for (const p of src) out.push([p[0] + dx, p[1] + oy]);
    return out;
  };
  const evalY = (pts, x) => {
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][0] >= x) {
        const a = pts[i - 1];
        const b = pts[i];
        return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0] || 1));
      }
    }
    return pts[pts.length - 1][1];
  };
  const between = (pts, xa, xb) => pts.filter((p) => p[0] > xa + 2 && p[0] < xb - 2);

  const plates = [];
  for (let j = 0; j < R; j++) {
    const A = line(j);
    const B = line(j + 1);
    const cuts = [];
    let x = rnd() * 60;
    while (x < DIRT_W) {
      cuts.push([x, x + (rnd() - 0.5) * 46]);
      x += 62 + rnd() * 95;
    }
    if (cuts[0][0] + DIRT_W - cuts[cuts.length - 1][0] < 50) cuts.pop();
    for (let c = 0; c < cuts.length; c++) {
      const [ta, ba] = cuts[c];
      let [tb, bb] = cuts[(c + 1) % cuts.length];
      if (c === cuts.length - 1) {
        tb += DIRT_W;
        bb += DIRT_W;
      }
      const poly = [[ta, evalY(A, ta)], ...between(A, ta, tb), [tb, evalY(A, tb)], [bb, evalY(B, bb)]];
      poly.push(...between(B, ba, bb).reverse(), [ba, evalY(B, ba)]);
      plates.push(makePlate(poly, rnd));
    }
  }

  // Grey boulders and pebbles sitting in the dirt.
  const rocks = [];
  for (let i = 0; i < 26; i++) {
    const big = i < 11;
    const r = big ? 13 + rnd() * 15 : 5 + rnd() * 5;
    rocks.push(makeRock(rnd() * DIRT_W, rnd() * DIRT_H, r, rnd));
  }
  // Fine grain specks.
  const specks = [];
  for (let i = 0; i < 320; i++) specks.push([rnd() * DIRT_W, rnd() * DIRT_H, 0.8 + rnd() * 1.6, rnd() < 0.6]);

  const D = { plates, rocks, specks };
  D.cache = new Cached({ w: DIRT_W, h: DIRT_H, maxPx: 3e6, repeat: 'repeat', paint: (g) => paintDirtTile(g, D) });
  return D;
}

function makePlate(poly, rnd) {
  const outer = insetPoly(poly, 2.2);
  const top = insetPoly(outer, 3).map(([x, y]) => [x - 0.8, y - 2.2]);
  const face = insetPoly(outer, 5).map(([x, y]) => [x + 0.6, y + 0.8]);
  const base = DIRT.browns[Math.floor(rnd() * DIRT.browns.length)];
  // One extra facet for a low-poly, chiselled look.
  const n = face.length;
  const i0 = Math.floor(rnd() * n);
  const facet = [];
  for (let k = 0; k <= Math.floor(n / 2); k++) facet.push(face[(i0 + k) % n]);
  const lighter = rnd() < 0.5;
  return {
    outer,
    top,
    face,
    facet,
    base,
    dark: darken(base, 0.22),
    light: lighten(base, 0.16),
    facetCol: lighter ? lighten(base, 0.07) : darken(base, 0.08),
    b: polyBounds(outer),
  };
}

function makeRock(x, y, r, rnd) {
  const m = 7 + Math.floor(rnd() * 3);
  const pts = [];
  const rot = rnd() * TAU;
  for (let i = 0; i < m; i++) {
    const a = rot + (i / m) * TAU + (rnd() - 0.5) * 0.5;
    const rr = r * (0.82 + rnd() * 0.28);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8]);
  }
  const rim = insetPoly(pts, -2.6);
  const face = insetPoly(pts, r * 0.18).map(([px, py]) => [px - r * 0.06, py - r * 0.1]);
  // Upper facet = the vertices above the centre plus a point a bit below it.
  const topFacet = face.filter((p) => p[1] < y - r * 0.05);
  topFacet.push([x + r * 0.15, y + r * 0.05]);
  return { pts, rim, face, topFacet, glint: [x - r * 0.35, y - r * 0.38, r * 0.16], b: polyBounds(rim) };
}

function drawPlate(g, p, ox, oy) {
  fillPoly(g, p.outer, p.dark, ox, oy);
  fillPoly(g, p.top, p.light, ox, oy);
  fillPoly(g, p.face, p.base, ox, oy);
  fillPoly(g, p.facet, p.facetCol, ox, oy);
}

function drawRock(g, r, ox, oy) {
  const R = DIRT.rock;
  fillPoly(g, r.rim, DIRT.crack, ox, oy);
  fillPoly(g, r.pts, R.dark, ox, oy);
  fillPoly(g, r.face, R.base, ox, oy);
  if (r.topFacet.length > 2) fillPoly(g, r.topFacet, R.light, ox, oy);
  g.fillStyle = R.glint;
  g.beginPath();
  g.ellipse(r.glint[0] + ox, r.glint[1] + oy, r.glint[2] * 1.6, r.glint[2], -0.3, 0, TAU);
  g.fill();
}

/** Draw every plate/rock whose bounds touch the unit rect, offset by (ox, oy). */
function drawDirtItems(g, D, ox, oy, x0, y0, x1, y1) {
  const hit = (b) => b.x1 + ox > x0 && b.x0 + ox < x1 && b.y1 + oy > y0 && b.y0 + oy < y1;
  for (const p of D.plates) if (hit(p.b)) drawPlate(g, p, ox, oy);
  g.fillStyle = 'rgba(70,36,14,0.35)';
  g.beginPath();
  for (const [sx, sy, r, dark] of D.specks) {
    if (!dark) continue;
    const x = sx + ox;
    const y = sy + oy;
    if (x > x0 - 3 && x < x1 + 3 && y > y0 - 3 && y < y1 + 3) g.rect(x, y, r, r * 0.7);
  }
  g.fill();
  g.fillStyle = 'rgba(230,170,100,0.22)';
  g.beginPath();
  for (const [sx, sy, r, dark] of D.specks) {
    if (dark) continue;
    const x = sx + ox;
    const y = sy + oy;
    if (x > x0 - 3 && x < x1 + 3 && y > y0 - 3 && y < y1 + 3) g.rect(x, y, r, r * 0.7);
  }
  g.fill();
  for (const r of D.rocks) if (hit(r.b)) drawRock(g, r, ox, oy);
}

function paintDirtTile(g, D) {
  g.fillStyle = DIRT.crack;
  g.fillRect(0, 0, DIRT_W, DIRT_H);
  for (const dy of [-DIRT_H, 0, DIRT_H]) {
    for (const dx of [-DIRT_W, 0, DIRT_W]) drawDirtItems(g, D, dx, dy, 0, 0, DIRT_W, DIRT_H);
  }
}

function drawDirt(ctx, D, view, fr) {
  const { cam, w, h, dpr } = view;
  const z = cam.zoom;
  const oy = (WORLD.grassFront - cam.y) * z + h / 2; // screen y of the dirt top
  if (oy >= h) return;
  const ox = (0 - cam.x) * z + w / 2;
  const need = z * dpr;
  if (need <= D.cache.maxScale) {
    D.cache.update(need, fr);
    fillPattern(ctx, D.cache, view, ox, oy, z, oy, h);
    return;
  }
  // Very close up: draw the visible plates as vectors (stays crisp, few of them).
  const y0s = Math.max(0, oy);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = DIRT.crack;
  ctx.fillRect(0, y0s, w, h - y0s);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * ox, dpr * oy);
  // Visible rect in dirt-tile units.
  const ux0 = -ox / z;
  const ux1 = (w - ox) / z;
  const uy0 = (y0s - oy) / z;
  const uy1 = (h - oy) / z;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ux0, Math.max(uy0, -20), ux1 - ux0, uy1 - Math.max(uy0, -20));
  ctx.clip();
  for (let ty = Math.floor(uy0 / DIRT_H) - 1; ty * DIRT_H < uy1 + 40; ty++) {
    for (let tx = Math.floor(ux0 / DIRT_W) - 1; tx * DIRT_W < ux1 + 40; tx++) {
      drawDirtItems(ctx, D, tx * DIRT_W, ty * DIRT_H, ux0, uy0, ux1, uy1);
    }
  }
  ctx.restore();
}

// --- Castles (world layer) ------------------------------------------------------------

const CASTLE_BASE = -6;
const CASTLE_BOX = { x: -126, y: -244, w: 252, h: 254 };

/** Running-bond stone blocks in a rect, one fill per block colour. */
function stoneBlocks(g, x0, y0, x1, y1, rnd, rowH = 10) {
  g.fillStyle = STONE.mortar;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  const buckets = STONE.blocks.map(() => []);
  for (let y = y1; y > y0 + 0.5; y -= rowH) {
    const yt = Math.max(y0, y - rowH);
    let x = x0 - rnd() * 12;
    while (x < x1) {
      const bw = 11 + rnd() * 13;
      const xa = Math.max(x0, x) + 0.65;
      const xb = Math.min(x1, x + bw) - 0.65;
      if (xb - xa > 1.5) buckets[Math.floor(rnd() * buckets.length)].push([xa, yt + 0.65, xb - xa, y - yt - 1.3]);
      x += bw;
    }
  }
  buckets.forEach((list, i) => {
    g.fillStyle = STONE.blocks[i];
    g.beginPath();
    for (const r of list) g.rect(r[0], r[1], r[2], r[3]);
    g.fill();
  });
  // Lit top edge on a few blocks.
  g.fillStyle = 'rgba(255,255,250,0.35)';
  g.beginPath();
  for (const list of buckets) for (const r of list) if (rnd() < 0.35) g.rect(r[0], r[1], r[2], 1);
  g.fill();
}

/** Side light on a round tower: bright left, shaded right. */
function roundShade(g, x0, y0, x1, y1) {
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  gr.addColorStop(0, 'rgba(255,248,232,0.22)');
  gr.addColorStop(0.35, 'rgba(255,248,232,0)');
  gr.addColorStop(0.6, 'rgba(40,32,26,0)');
  gr.addColorStop(1, 'rgba(40,32,26,0.32)');
  g.fillStyle = gr;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
}

function merlons(g, x0, x1, y, h, rnd) {
  const n = Math.max(2, Math.round((x1 - x0 + 6) / 15));
  const step = (x1 - x0) / n;
  const mw = step * 0.62;
  for (let i = 0; i < n; i++) {
    const mx = x0 + i * step + (step - mw) / 2;
    stoneBlocks(g, mx, y - h, mx + mw, y, rnd, h / 2);
    roundShade(g, mx, y - h, mx + mw, y);
  }
}

function coneRoof(g, cx, baseY, hw, h, T) {
  const ay = baseY - h;
  const sag = hw * 0.16; // eave curves down at the middle (seen slightly from below)
  const flank = (side) => {
    g.quadraticCurveTo(cx + side * hw * 0.32, baseY - h * 0.34, cx, ay);
  };
  // Body.
  g.fillStyle = T.body;
  g.beginPath();
  g.moveTo(cx - hw, baseY);
  flank(-1);
  g.quadraticCurveTo(cx + hw * 0.32, baseY - h * 0.34, cx + hw, baseY);
  g.quadraticCurveTo(cx, baseY + sag * 2, cx - hw, baseY);
  g.fill();
  // Lit left part.
  g.fillStyle = T.light;
  g.beginPath();
  g.moveTo(cx - hw, baseY);
  flank(-1);
  g.quadraticCurveTo(cx - hw * 0.12, baseY - h * 0.4, cx - hw * 0.3, baseY + sag * 1.35);
  g.quadraticCurveTo(cx - hw * 0.7, baseY + sag * 0.8, cx - hw, baseY);
  g.fill();
  // Shaded right edge.
  g.fillStyle = T.shade;
  g.beginPath();
  g.moveTo(cx, ay);
  g.quadraticCurveTo(cx + hw * 0.32, baseY - h * 0.34, cx + hw, baseY);
  g.quadraticCurveTo(cx + hw * 0.75, baseY + sag * 0.9, cx + hw * 0.45, baseY + sag * 1.5);
  g.quadraticCurveTo(cx + hw * 0.3, baseY - h * 0.3, cx, ay);
  g.fill();
  // Shingle rows.
  g.strokeStyle = rgba(T.dark, 0.28);
  g.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const y = ay + h * t;
    const w = hw * Math.pow(t, 1.25);
    g.beginPath();
    g.moveTo(cx - w, y);
    g.quadraticCurveTo(cx, y + sag * 2 * t, cx + w, y);
    g.stroke();
  }
  // Eave trim.
  g.strokeStyle = T.dark;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx - hw, baseY);
  g.quadraticCurveTo(cx, baseY + sag * 2, cx + hw, baseY);
  g.stroke();
  // Finial.
  g.fillStyle = '#e9c65a';
  g.beginPath();
  circlePath(g, cx, ay - 1.5, 2.2);
  g.fill();
}

function bannerShape(g, cx, top, w, h, k) {
  g.beginPath();
  g.moveTo(cx - w / 2 + k, top);
  g.lineTo(cx + w / 2 - k, top);
  g.lineTo(cx + w / 2 - k, top + h - k * 0.4);
  g.lineTo(cx, top + h + w * 0.3 - k * 1.6);
  g.lineTo(cx - w / 2 + k, top + h - k * 0.4);
  g.closePath();
}

function banner(g, cx, top, w, h, T) {
  // Hanging rod.
  g.fillStyle = '#5a4430';
  g.fillRect(cx - w / 2 - 2.5, top - 2, w + 5, 2.6);
  g.fillStyle = '#e9c65a';
  g.fillRect(cx - w / 2 - 3.5, top - 2.2, 1.8, 3);
  g.fillRect(cx + w / 2 + 1.7, top - 2.2, 1.8, 3);
  // Cloth with a darker border, a lit fold and a white diamond.
  g.fillStyle = T.dark;
  bannerShape(g, cx, top, w, h, 0);
  g.fill();
  g.fillStyle = T.body;
  bannerShape(g, cx, top, w, h, 1.8);
  g.fill();
  g.fillStyle = rgba(T.light, 0.55);
  g.fillRect(cx - w / 2 + 1.8, top, w * 0.22, h - 2);
  g.fillStyle = rgba(T.dark, 0.25);
  g.fillRect(cx + w / 2 - 1.8 - w * 0.18, top, w * 0.18, h - 2);
  const dy = top + h * 0.48;
  const dw = w * 0.26;
  const dh = h * 0.2;
  g.fillStyle = '#f7f5ef';
  g.beginPath();
  g.moveTo(cx, dy - dh);
  g.lineTo(cx + dw, dy);
  g.lineTo(cx, dy + dh);
  g.lineTo(cx - dw, dy);
  g.closePath();
  g.fill();
}

function archPath(g, cx, base, hw, h) {
  g.moveTo(cx - hw, base);
  g.lineTo(cx - hw, base - h + hw);
  g.arc(cx, base - h + hw, hw, Math.PI, 0);
  g.lineTo(cx + hw, base);
  g.closePath();
}

function castleDoor(g, cx, base, w, h) {
  const hw = w / 2;
  // Stone arch surround with voussoirs.
  g.fillStyle = STONE.light;
  g.beginPath();
  archPath(g, cx, base, hw + 5, h + 5);
  g.fill();
  g.strokeStyle = STONE.mortar;
  g.lineWidth = 0.9;
  const cy = base - h + hw;
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * hw, cy + Math.sin(a) * hw);
    g.lineTo(cx + Math.cos(a) * (hw + 5), cy + Math.sin(a) * (hw + 5));
    g.stroke();
  }
  for (let y = cy + 8; y < base; y += 9) {
    g.beginPath();
    g.moveTo(cx - hw - 5, y);
    g.lineTo(cx - hw, y);
    g.moveTo(cx + hw, y);
    g.lineTo(cx + hw + 5, y);
    g.stroke();
  }
  // Dark recess, then the planked door.
  g.fillStyle = '#3b2b20';
  g.beginPath();
  archPath(g, cx, base, hw, h);
  g.fill();
  g.fillStyle = WOOD.base;
  g.beginPath();
  archPath(g, cx, base, hw - 1.6, h - 1.6);
  g.fill();
  g.save();
  g.beginPath();
  archPath(g, cx, base, hw - 1.6, h - 1.6);
  g.clip();
  const planks = 5;
  for (let i = 0; i < planks; i++) {
    const px = cx - hw + 1.6 + (i * (w - 3.2)) / planks;
    g.fillStyle = i % 2 ? WOOD.light : WOOD.base;
    g.fillRect(px, base - h, (w - 3.2) / planks, h);
    g.fillStyle = WOOD.dark;
    g.fillRect(px, base - h, 0.9, h);
  }
  // Shadow under the arch top.
  const sh = g.createLinearGradient(0, base - h, 0, base - h + hw + 6);
  sh.addColorStop(0, 'rgba(30,18,10,0.45)');
  sh.addColorStop(1, 'rgba(30,18,10,0)');
  g.fillStyle = sh;
  g.fillRect(cx - hw, base - h, w, hw + 6);
  // Iron bands with rivets.
  g.fillStyle = WOOD.iron;
  for (const by of [base - h * 0.28, base - h * 0.68]) {
    g.fillRect(cx - hw, by, w, 2.6);
    g.fillStyle = '#6d6d72';
    for (let rx = cx - hw + 3; rx < cx + hw - 1; rx += 5) g.fillRect(rx, by + 0.8, 1, 1);
    g.fillStyle = WOOD.iron;
  }
  g.restore();
  // Ring handle.
  g.strokeStyle = '#2c2c30';
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(cx + hw * 0.45, base - h * 0.45, 2.2, 0, TAU);
  g.stroke();
}

function arrowSlit(g, cx, y, h) {
  g.fillStyle = STONE.light;
  g.fillRect(cx - 3.5, y - 1.5, 7, h + 3);
  g.fillStyle = STONE.slit;
  g.beginPath();
  g.moveTo(cx - 1.6, y + h);
  g.lineTo(cx - 1.6, y + 1.6);
  g.arc(cx, y + 1.6, 1.6, Math.PI, 0);
  g.lineTo(cx + 1.6, y + h);
  g.closePath();
  g.fill();
}

function bush(g, x, y, r, rnd) {
  const lobes = [];
  for (let i = 0; i < 4; i++) lobes.push([x + (i - 1.5) * r * 0.62 + (rnd() - 0.5) * r * 0.3, y - r * (0.5 + rnd() * 0.45), r * (0.55 + rnd() * 0.35)]);
  g.fillStyle = '#4b8a33';
  g.beginPath();
  for (const [bx, by, br] of lobes) circlePath(g, bx, by, br);
  g.rect(x - r * 1.6, y - r * 0.5, r * 3.2, r * 0.5);
  g.fill();
  g.fillStyle = '#69a945';
  g.beginPath();
  for (const [bx, by, br] of lobes) circlePath(g, bx - br * 0.18, by - br * 0.2, br * 0.72);
  g.fill();
  g.fillStyle = '#8cc65a';
  g.beginPath();
  for (const [bx, by, br] of lobes) circlePath(g, bx - br * 0.32, by - br * 0.38, br * 0.3);
  g.fill();
}

// Castle layout in "forward" coords: +x points toward the battlefield.
const CASTLE = {
  rear: { a: -112, b: -64, top: -140, roof: 46 },
  keep: { a: -50, b: 2, top: -164, roof: 52 },
  front: { a: 62, b: 108, top: -124, roof: 42 },
  wall: { a: -72, b: 72, top: -98 },
  door: { c: 31, w: 30, h: 50 },
};

/** Flag pole position (local coords) for a team, used for the waving flag. */
function flagPole(team) {
  const k = CASTLE.keep;
  const cx = ((k.a + k.b) / 2) * TEAMS[team].dir;
  const ay = k.top - 2 - k.roof;
  return { x: cx, y0: ay - 2, y1: ay - 26 };
}

function drawCastle(g, team, seed) {
  const T = TEAMS[team];
  const dir = T.dir;
  const rnd = mulberry32(seed);
  const span = (a, b) => (dir > 0 ? [a, b] : [-b, -a]);
  const base = CASTLE_BASE;

  // Soft contact shadow on the grass.
  g.fillStyle = 'rgba(40,70,20,0.25)';
  g.beginPath();
  g.ellipse(0, base + 2.5, 122, 7, 0, 0, TAU);
  g.fill();

  const tower = (tw) => {
    const [x0, x1] = span(tw.a, tw.b);
    stoneBlocks(g, x0, tw.top + 10, x1, base, rnd, 10);
    roundShade(g, x0, tw.top + 10, x1, base);
    // Corbelled ring under the roof.
    g.fillStyle = STONE.dark;
    for (let cx = x0 + 3; cx < x1 - 2; cx += 7) {
      g.beginPath();
      g.moveTo(cx - 2.5, tw.top + 10);
      g.lineTo(cx + 2.5, tw.top + 10);
      g.lineTo(cx, tw.top + 15);
      g.closePath();
      g.fill();
    }
    stoneBlocks(g, x0 - 4, tw.top, x1 + 4, tw.top + 10, rnd, 5);
    roundShade(g, x0 - 4, tw.top, x1 + 4, tw.top + 10);
    g.fillStyle = 'rgba(40,32,26,0.35)';
    g.fillRect(x0 - 4, tw.top + 9, x1 - x0 + 8, 1.4);
    return [x0, x1];
  };
  const roofOn = (tw, x0, x1) => coneRoof(g, (x0 + x1) / 2, tw.top + 1, (x1 - x0) / 2 + 8, tw.roof, T);

  // Keep (behind the wall).
  const [k0, k1] = tower(CASTLE.keep);
  const kc = (k0 + k1) / 2;
  g.fillStyle = STONE.slit;
  g.beginPath();
  circlePath(g, kc, CASTLE.keep.top + 30, 5.5);
  g.fill();
  g.strokeStyle = STONE.light;
  g.lineWidth = 1.6;
  g.beginPath();
  g.arc(kc, CASTLE.keep.top + 30, 6.2, 0, TAU);
  g.moveTo(kc - 5.5, CASTLE.keep.top + 30);
  g.lineTo(kc + 5.5, CASTLE.keep.top + 30);
  g.moveTo(kc, CASTLE.keep.top + 24.5);
  g.lineTo(kc, CASTLE.keep.top + 35.5);
  g.stroke();
  arrowSlit(g, kc, CASTLE.keep.top + 46, 12);

  // Curtain wall with crenellations and a walkway shadow.
  const [w0, w1] = span(CASTLE.wall.a, CASTLE.wall.b);
  const wt = CASTLE.wall.top;
  stoneBlocks(g, w0, wt, w1, base, rnd, 10);
  merlons(g, w0, w1, wt, 10, rnd);
  const wg = g.createLinearGradient(0, wt, 0, base);
  wg.addColorStop(0, 'rgba(40,32,26,0.28)');
  wg.addColorStop(0.08, 'rgba(40,32,26,0)');
  wg.addColorStop(0.75, 'rgba(40,32,26,0)');
  wg.addColorStop(1, 'rgba(40,32,26,0.18)');
  g.fillStyle = wg;
  g.fillRect(w0, wt, w1 - w0, base - wt);
  // Plinth.
  stoneBlocks(g, w0 - 2, base - 9, w1 + 2, base, rnd, 9);
  g.fillStyle = 'rgba(40,32,26,0.25)';
  g.fillRect(w0 - 2, base - 9, w1 - w0 + 4, 9);

  // Side towers (in front of the wall).
  const [r0, r1] = tower(CASTLE.rear);
  const [f0, f1] = tower(CASTLE.front);
  // Ambient occlusion where the towers meet the wall.
  const aoEdges = [];
  for (const [t0, t1] of [[r0, r1], [f0, f1]]) {
    if (t1 > w0 && t1 < w1) aoEdges.push([t1, 1]);
    if (t0 > w0 && t0 < w1) aoEdges.push([t0, -1]);
  }
  for (const [x, side] of aoEdges) {
    const ao = g.createLinearGradient(x, 0, x + side * 10, 0);
    ao.addColorStop(0, 'rgba(30,24,20,0.28)');
    ao.addColorStop(1, 'rgba(30,24,20,0)');
    g.fillStyle = ao;
    g.fillRect(side > 0 ? x : x - 10, wt + 10, 10, base - wt - 10);
  }
  arrowSlit(g, (r0 + r1) / 2, CASTLE.rear.top + 22, 13);
  arrowSlit(g, (f0 + f1) / 2, CASTLE.front.top + 22, 12);

  // Roofs.
  roofOn(CASTLE.keep, k0, k1);
  roofOn(CASTLE.rear, r0, r1);
  roofOn(CASTLE.front, f0, f1);

  // Banners on the towers, door toward the battlefield.
  banner(g, (r0 + r1) / 2, CASTLE.rear.top + 46, 22, 46, T);
  banner(g, (f0 + f1) / 2, CASTLE.front.top + 44, 20, 40, T);
  const dc = CASTLE.door.c * dir;
  castleDoor(g, dc, base, CASTLE.door.w, CASTLE.door.h);
  // Small banner beside the door, on the wall.
  banner(g, dc - 34 * dir, wt + 18, 16, 30, T);

  // Moss on the lower stones.
  for (let i = 0; i < 14; i++) {
    const x = lerp(-110, 110, rnd());
    const y = base - rnd() * 22;
    g.fillStyle = `rgba(90,140,50,${0.18 + rnd() * 0.2})`;
    g.beginPath();
    g.ellipse(x, y, 3 + rnd() * 6, 1.5 + rnd() * 2.5, 0, 0, TAU);
    g.fill();
  }

  // Flag pole on the keep.
  const fp = flagPole(team);
  g.fillStyle = '#5b4a3a';
  g.fillRect(fp.x - 1, fp.y1, 2, fp.y0 - fp.y1);
  g.fillStyle = '#e9c65a';
  g.beginPath();
  circlePath(g, fp.x, fp.y1 - 1.5, 2.4);
  g.fill();

  // Bushes hugging the base.
  bush(g, (r0 + w0) / 2 - 8 * dir, base + 1, 8, rnd);
  bush(g, dc + 24 * dir, base + 1, 6, rnd);
  bush(g, (f0 + f1) / 2 + 22 * dir, base + 1, 7, rnd);
  bush(g, -dir * 4, base + 1, 5, rnd);
}

function makeCastle(team, seed) {
  return {
    team,
    seed,
    x: WORLD.castleX[team],
    cache: new Cached({ ...CASTLE_BOX, maxPx: 2.6e6, paint: (g) => drawCastle(g, team, seed) }),
    phase: team === 'blue' ? 0 : 2.1,
  };
}

/** The team flag, waving: a swallowtail cloth rippling with fold shading. */
function drawFlag(g, x, y, T, t, phase) {
  const L = 40;
  const H0 = 19;
  const H1 = 15;
  const N = 12;
  const tops = [];
  const bots = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const wave = Math.sin(u * 6.5 - t * 6.2 + phase) * 3.6 * u + Math.sin(u * 3.1 - t * 3.3 + phase) * 1.4 * u;
    const px = x + 1 + u * L * (1 - 0.05 * Math.abs(Math.sin(t * 2.3 + phase)));
    const py = y + wave + u * u * 2.5;
    tops.push([px, py]);
    bots.push([px, py + lerp(H0, H1, u)]);
  }
  const tip = tops[N];
  const notch = [tip[0] - 8, (tops[N][1] + bots[N][1]) / 2];
  g.fillStyle = T.body;
  g.beginPath();
  g.moveTo(tops[0][0], tops[0][1]);
  for (let i = 1; i <= N; i++) g.lineTo(tops[i][0], tops[i][1]);
  g.lineTo(notch[0], notch[1]);
  for (let i = N; i >= 0; i--) g.lineTo(bots[i][0], bots[i][1]);
  g.closePath();
  g.fill();
  // Fold shading per strip, from the slope of the ripple.
  for (let i = 0; i < N; i++) {
    const slope = tops[i + 1][1] - tops[i][1];
    const a = Math.min(0.4, Math.abs(slope) * 0.13);
    if (a < 0.03) continue;
    g.fillStyle = slope > 0 ? rgba(T.dark, a) : rgba('#ffffff', a * 0.8);
    g.beginPath();
    const last = i === N - 1;
    g.moveTo(tops[i][0], tops[i][1]);
    g.lineTo(tops[i + 1][0], tops[i + 1][1]);
    if (last) g.lineTo(notch[0], notch[1]);
    g.lineTo(bots[i + 1][0], bots[i + 1][1]);
    g.lineTo(bots[i][0], bots[i][1]);
    g.closePath();
    g.fill();
  }
  // Rope ties at the pole.
  g.fillStyle = T.dark;
  g.fillRect(x - 0.5, y - 0.5, 2.2, H0 + 1);
}

function drawCastles(ctx, castles, view, fr) {
  const { cam, w, h, dpr, t } = view;
  const z = cam.zoom;
  const need = z * dpr;
  for (const c of castles) {
    const sx = (c.x - cam.x) * z + w / 2;
    const sy = -cam.y * z + h / 2;
    const B = CASTLE_BOX;
    // Cull (allow for the flag sticking out to the right).
    if (sx + (B.x + B.w + 50) * z < 0 || sx + B.x * z > w || sy + B.y * z > h || sy + (B.y + B.h) * z < 0) continue;
    if (need <= c.cache.maxScale) {
      c.cache.update(need, fr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(c.cache.canvas, sx + B.x * z, sy + B.y * z, B.w * z, B.h * z);
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * sx, dpr * sy);
    } else {
      // Very close up: vector draw keeps the stones crisp.
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * sx, dpr * sy);
      drawCastle(ctx, c.team, c.seed);
    }
    const fp = flagPole(c.team);
    drawFlag(ctx, fp.x, fp.y1 + 1, TEAMS[c.team], t, c.phase);
  }
}

// --- Public API ----------------------------------------------------------------------

export function createBackground(opts = {}) {
  const seed = (opts.seed == null ? 20240611 : opts.seed) >>> 0;
  const layers = LAYERS.map((cfg, i) => makeLayer(cfg, seed + 101 * (i + 1)));
  const clouds = makeClouds(seed + 7);
  const birds = makeBirds(seed + 11);
  const castles = [makeCastle('blue', seed + 31), makeCastle('red', seed + 57)];
  const grass = new Cached({
    x: 0,
    y: GRASS_Y0,
    w: GRASS_W,
    h: GRASS_Y1 - GRASS_Y0,
    maxPx: 4e6,
    repeat: 'repeat-x',
    paint: (g) => paintGrass(g, mulberry32(seed + 13)),
  });
  const front = new Cached({
    x: 0,
    y: FRONT_Y0,
    w: FRONT_W,
    h: FRONT_Y1 - FRONT_Y0,
    maxPx: 3e6,
    repeat: 'repeat-x',
    paint: (g) => paintFront(g, mulberry32(seed + 19)),
  });
  const dirt = makeDirt(seed + 17);

  /** Per-frame numbers shared by every layer. */
  function frameInfo(view) {
    const { h, cam } = view;
    return {
      gTop: (WORLD.grassTop - cam.y) * cam.zoom + h / 2, // screen y of the grass far edge
      hRef: h * 0.72, // where the default camera puts the ground line
      zref: clamp(h / 1000, 0.3, 1.6), // "typical zoom" for this screen height
      rebuilds: 1, // at most one cache re-paint per frame once everything exists
    };
  }

  /** Fill in optional fields so a sloppy caller can't produce NaNs. */
  function normView(view) {
    if (view.t == null || !view.dpr) return { ...view, t: view.t || 0, dpr: view.dpr || 1 };
    return view;
  }

  function drawBack(ctx, view) {
    if (!(view.w > 0 && view.h > 0)) return;
    view = normView(view);
    const fr = frameInfo(view);
    const { cam, w, h } = view;
    const z = cam.zoom;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    if (fr.gTop > 0) {
      // Walk from the nearest layer back: each layer only needs drawing above
      // the line where everything in front of it is already opaque.
      const placed = layers.map((L) => placeLayer(L, view, fr));
      const covers = new Array(layers.length);
      let cover = fr.gTop + 2;
      for (let i = layers.length - 1; i >= 0; i--) {
        covers[i] = cover;
        cover = Math.min(cover, placed[i].solidY + 2);
      }
      drawSky(ctx, view, fr, cover);
      drawClouds(ctx, clouds, view, fr);
      drawBirds(ctx, birds, view, fr, cover);
      layers.forEach((L, i) => drawLayer(ctx, L, placed[i], view, fr, covers[i]));
    }
    drawDirt(ctx, dirt, view, fr);
    // Grass band.
    const gy0 = (GRASS_Y0 - cam.y) * z + h / 2;
    if (gy0 < h && (GRASS_Y1 - cam.y) * z + h / 2 > 0) {
      grass.update(z * view.dpr, fr);
      fillPattern(ctx, grass, view, w / 2 - cam.x * z, h / 2 - cam.y * z, z, gy0, gy0 + grass.h * z);
    }
    drawCastles(ctx, castles, view, fr);
    ctx.restore();
  }

  function drawFront(ctx, view) {
    if (!(view.w > 0 && view.h > 0)) return;
    view = normView(view);
    const fr = frameInfo(view);
    const { cam, w, h } = view;
    const z = cam.zoom;
    const y0 = (FRONT_Y0 - cam.y) * z + h / 2;
    if (y0 >= h || y0 + front.h * z <= 0) return;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    front.update(z * view.dpr, fr);
    // Wind: shear the tufts around their roots so the tips sway together.
    const t = view.t;
    const sway = 0.07 * Math.sin(t * 1.7) + 0.035 * Math.sin(t * 3.1 + 1);
    const kx = z / front.sx;
    const ky = z / front.sy;
    const tx = w / 2 - cam.x * z;
    const ty = y0;
    const root = (WORLD.grassFront - cam.y) * z + h / 2;
    const dpr = view.dpr;
    ctx.setTransform(dpr * kx, 0, dpr * sway * ky, dpr * ky, dpr * (tx - sway * (root - ty)), dpr * ty);
    ctx.fillStyle = front.pattern;
    const pad = 40 * z;
    const px0 = (-pad - tx) / kx;
    const py0 = Math.max(0, -ty / ky);
    const py1 = Math.min(front.h * front.sy, (h - ty) / ky);
    if (py1 > py0) ctx.fillRect(px0, py0, (w + 2 * pad) / kx, py1 - py0);
    ctx.restore();
  }

  return { drawBack, drawFront };
}
