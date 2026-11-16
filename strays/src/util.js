// Strays: small math and random helpers. No DOM in here.

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

/** FNV-1a over the parts joined with '|', then a final stir: a 32-bit seed. */
export function hashParts(...parts) {
  const str = parts.join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

/**
 * A random stream named by its parts: the same parts always give the same
 * stream. Every roll in the rules is named after the save's seed and a
 * counter (the trip number, the arrival number), so reloading the page can
 * never re-roll who a stray turns out to be.
 */
export const rngFor = (...parts) => mulberry32(hashParts(...parts));

export const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
export const pick = (rng, list) => list[Math.floor(rng() * list.length)];

/** Pick a key from { key: weight } (weights ≥ 0). */
export function pickWeighted(rng, weights) {
  const keys = Object.keys(weights).filter((k) => weights[k] > 0);
  let total = 0;
  for (const k of keys) total += weights[k];
  let r = rng() * total;
  for (const k of keys) {
    r -= weights[k];
    if (r < 0) return k;
  }
  return keys[keys.length - 1];
}
