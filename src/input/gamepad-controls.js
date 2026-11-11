// Standard-mapping gamepad: a reference point for "how should twin-stick
// feel" while tuning the touch sticks. Left stick move, right stick aim
// (auto-fires past the fire ring, or hold RT), RB/B shove, X reload, Y swap.

import { shapeStick, fireState } from './stick-math.js';

const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, START: 9 };

export class GamepadControls {
  constructor() {
    this.prev = new Map();
    this.lastUsed = 0;
    this.firing = false;
    this.connected = false;
    this.blocked = typeof navigator.getGamepads !== 'function';
  }

  poll(settings) {
    let pads = [];
    if (!this.blocked) {
      try {
        pads = navigator.getGamepads();
      } catch {
        // Embedded in a page that withholds the gamepad (permissions policy):
        // the call throws. Play on without one, and stop asking.
        this.blocked = true;
      }
    }
    let gp = null;
    for (const p of pads) {
      if (p && p.connected) {
        gp = p;
        break;
      }
    }
    this.connected = !!gp;
    if (!gp) return null;

    const ax = (i) => gp.axes[i] || 0;
    const pressed = (i) => {
      const b = gp.buttons[i];
      return !!b && (b.pressed || b.value > 0.4);
    };

    const move = shapeStick(ax(0), ax(1), 1, 0.16, 0.92, 1);
    const aim = shapeStick(ax(2), ax(3), 1, 0.2, 1, 1);
    this.firing = aim.raw > 0.2 && fireState(this.firing, aim.raw, Math.max(0.5, settings.fireThreshold), 0.2);

    const events = [];
    const edge = (i, ev) => {
      const now = pressed(i);
      if (now && !this.prev.get(i)) events.push(ev);
      this.prev.set(i, now);
    };
    edge(BTN.RB, 'shove');
    edge(BTN.B, 'shove');
    edge(BTN.X, 'reload');
    edge(BTN.Y, 'swap');
    edge(BTN.START, 'pause');
    edge(BTN.A, 'confirm'); // start / play again

    const rt = pressed(BTN.RT);
    if (move.mag > 0 || aim.raw > 0.3 || rt || events.length) this.lastUsed = performance.now();

    return {
      move: { x: move.x, y: move.y },
      aimActive: aim.raw > 0.2,
      aimX: aim.nx,
      aimY: aim.ny,
      aimRaw: aim.raw,
      fire: this.firing || (rt && aim.raw > 0.2) || rt,
      events,
    };
  }
}
