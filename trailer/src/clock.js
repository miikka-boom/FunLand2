// The trailer's clock and dice. Imported before anything from the game, so every
// Math.random() and performance.now() the engine makes comes from here:
//   - Math.random is a seeded generator, reseeded at the start of every shot, so a shot
//     plays the same however it is reached (from the top, or a render that starts mid-way).
//   - performance.now() is the trailer's own time (the film clock), so the renderer's fades
//     and easing advance by exactly one frame per frame, however long a frame takes to film.

/** mulberry32: small, fast, good enough for a film. */
function generator(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let next = generator(1);
Math.random = () => next();

/** Start the dice over from `seed` (any integer). Returns them. */
export function reseed(seed) {
  next = generator(seed);
  return next;
}

/** Roll these dice from now on (each shot keeps its own, so shots never share a stream). */
export function useDice(dice) {
  next = dice;
}

/** A string -> a seed (shot ids make their own). */
export function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Film time, in seconds from the first frame. */
export const clock = { t: 0 };

const realNow = performance.now.bind(performance);
performance.now = () => clock.t * 1000;

/** Wall-clock milliseconds (for status read-outs only). */
export const wallNow = realNow;
