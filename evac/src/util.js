// Small math + random helpers for Road to Evac (kept separate from the action game).

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

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

export const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

/** Round loot to amounts that read well: 5s under 200, 10s above. */
export function niceRound(v) {
  if (v <= 0) return 0;
  if (v < 20) return Math.max(1, Math.round(v));
  if (v < 200) return Math.round(v / 5) * 5;
  return Math.round(v / 10) * 10;
}
