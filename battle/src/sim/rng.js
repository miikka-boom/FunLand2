// Seeded RNG (mulberry32) so a battle replays the same way from the same
// placement. The simulation never calls Math.random.

export class Rng {
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }

  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a, b) {
    return a + (b - a) * this.next();
  }

  /** Roughly normal, mean 0, sd ~1 (sum of three uniforms). */
  gauss() {
    return (this.next() + this.next() + this.next() - 1.5) * 2;
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[(this.next() * arr.length) | 0];
  }
}
