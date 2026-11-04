// Small math + random helpers for the Safehouse prototype (kept separate from
// the action game and the camp prototype).

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

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
export const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

/** Sum of a { res: n } map. */
export function total(map) {
  let n = 0;
  for (const v of Object.values(map || {})) n += v || 0;
  return n;
}
