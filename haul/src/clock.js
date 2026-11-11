// The game clock: real time plus an offset. Radio calls keep going while the
// page is closed, and the testing drawer can jump time forward. The offset is
// saved with the game, or a call started in warped time would jump back on
// reload.

export class Clock {
  constructor(offset = 0) {
    this.offset = offset;
  }

  now() {
    return Date.now() + this.offset;
  }

  warp(ms) {
    this.offset += ms;
  }
}

/** A clock that only moves when told to: for the tests and the balance tool. */
export class FakeClock {
  constructor(t = 0) {
    this.t = t;
    this.offset = 0;
  }

  now() {
    return this.t;
  }

  warp(ms) {
    this.t += ms;
  }
}
