// Small math + random helpers shared across modules.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Wrap an angle to [-PI, PI). */
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Frame-rate independent exponential smoothing factor. */
export function dampFactor(lambda, dt) {
  return 1 - Math.exp(-lambda * dt);
}

/** Move `cur` toward `target` by at most `maxDelta`. */
export function approach(cur, target, maxDelta) {
  if (cur < target) return Math.min(cur + maxDelta, target);
  return Math.max(cur - maxDelta, target);
}

/** Deterministic PRNG (mulberry32). Returns a function producing [0, 1). */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function rnd() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates with a seeded PRNG: same seed, same order on every browser. */
export function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
/** Triangular-ish distribution in [-1, 1], denser near 0. */
export const randSpread = () => Math.random() + Math.random() - 1;

/** Ray (origin o, unit dir d) vs circle; returns entry distance or Infinity. */
export function rayCircle(ox, oy, dx, dy, cx, cy, r) {
  const fx = cx - ox;
  const fy = cy - oy;
  const tca = fx * dx + fy * dy;
  const d2 = fx * fx + fy * fy - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  const thc = Math.sqrt(r2 - d2);
  const t0 = tca - thc;
  const t1 = tca + thc;
  if (t1 < 0) return Infinity;
  return t0 < 0 ? 0 : t0;
}

/** Ray vs axis-aligned rect {x,y,w,h}; returns entry distance (0 if inside) or Infinity. */
export function rayRect(ox, oy, idx, idy, r, tMax) {
  let t1 = (r.x - ox) * idx;
  let t2 = (r.x + r.w - ox) * idx;
  let tmin = t1 < t2 ? t1 : t2;
  let tmax = t1 < t2 ? t2 : t1;
  t1 = (r.y - oy) * idy;
  t2 = (r.y + r.h - oy) * idy;
  const ymin = t1 < t2 ? t1 : t2;
  const ymax = t1 < t2 ? t2 : t1;
  if (ymin > tmin) tmin = ymin;
  if (ymax < tmax) tmax = ymax;
  if (tmax < 0 || tmin > tmax || tmin > tMax) return Infinity;
  return tmin < 0 ? 0 : tmin;
}

export function rectsOverlap(a, b, pad = 0) {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
}

export function pointInRect(x, y, r, pad = 0) {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

// "-... . -." (B E N) in units of MORSE_UNIT seconds: positive = on, negative = off.
const MORSE_BEN = [3, -1, 1, -1, 1, -1, 1, -3, 1, -3, 3, -1, 1, -7];
const MORSE_UNIT = 0.17;
const MORSE_LEN = MORSE_BEN.reduce((s, v) => s + Math.abs(v), 0);

/** Is this lamp lit right now? Broken lamps sputter; one lamp (l.morse) blinks the same three letters over and over. */
export function lampLit(l, t) {
  if (l.morse) {
    let u = (t / MORSE_UNIT) % MORSE_LEN;
    for (const v of MORSE_BEN) {
      const n = Math.abs(v);
      if (u < n) return v > 0;
      u -= n;
    }
    return false;
  }
  return !l.broken || Math.sin(t * 13 + l.x) > 0.6;
}
