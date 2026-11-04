// Game clock: real time plus an offset, so timers keep running while the page
// is closed (offline progress) and testers can warp time forward. The offset is
// saved with the game state; otherwise anything started in warped time would jump
// back after a reload.

export class Clock {
  constructor(offset = 0) {
    this.offset = offset;
    this.speed = 1; // dev fast-forward: game ms per real ms while the page is open
  }

  now() {
    return Date.now() + this.offset;
  }

  warp(ms) {
    this.offset += ms;
  }

  /** Call once per frame with the real elapsed ms. */
  advance(realMs) {
    if (this.speed !== 1 && realMs > 0) this.offset += realMs * (this.speed - 1);
  }
}

/** Manual clock for tests and the balance simulator. */
export class FakeClock {
  constructor(t = 0) {
    this.t = t;
    this.offset = 0;
    this.speed = 1;
  }

  now() {
    return this.t;
  }

  warp(ms) {
    this.t += ms;
  }

  advance(ms) {
    this.t += ms;
  }
}
