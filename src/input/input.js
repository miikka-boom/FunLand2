// Folds touch, mouse/keyboard and gamepad into one per-frame InputFrame.
// The most recently used device owns movement + aim.

import { TouchControls } from './touch-controls.js';
import { DesktopControls } from './desktop-controls.js';
import { GamepadControls } from './gamepad-controls.js';

export class Input {
  constructor(canvas, settings, getLayout) {
    this.settings = settings;
    this.touch = new TouchControls(canvas, settings, getLayout);
    // Ignore compatibility mouse events that trail a touch.
    this.desktop = new DesktopControls(
      canvas,
      getLayout,
      () => this.touch.lastUsed > 0 && performance.now() - this.touch.lastUsed < 800,
    );
    this.pad = new GamepadControls();
    this.source = this.touch.supportsTouch ? 'touch' : 'mouse';
    this.frame = {
      source: this.source,
      move: { x: 0, y: 0 },
      aimActive: false,
      aimX: 1,
      aimY: 0,
      aimRaw: 0,
      aimScreen: null, // mouse only: screen point to aim at (resolved by the game)
      fire: false,
      assist: true,
      events: [],
    };
  }

  sample() {
    const S = this.settings;
    this.touch.update();
    const pad = this.pad.poll(S);

    const t = this.touch.lastUsed;
    const d = this.desktop.lastUsed;
    const g = pad ? this.pad.lastUsed : 0;
    if (t > 0 && t >= d && t >= g) this.source = 'touch';
    else if (g > 0 && g >= d) this.source = 'gamepad';
    else if (d > 0) this.source = 'mouse';

    const f = this.frame;
    f.source = this.source;
    f.events = [...this.touch.consumeEvents(), ...this.desktop.consumeEvents(), ...(pad ? pad.events : [])];
    f.aimScreen = null;

    if (this.source === 'touch') {
      const m = this.touch.move;
      const a = this.touch.aim;
      f.move.x = m.active ? m.out.x : 0;
      f.move.y = m.active ? m.out.y : 0;
      f.aimActive = a.active && a.out.raw > S.aimDeadzone && !a.tapCandidate;
      if (f.aimActive) {
        f.aimX = a.out.nx;
        f.aimY = a.out.ny;
      }
      f.aimRaw = a.active ? a.out.raw : 0;
      f.fire = a.active && a.firing;
      f.assist = true;
    } else if (this.source === 'gamepad' && pad) {
      f.move.x = pad.move.x;
      f.move.y = pad.move.y;
      f.aimActive = pad.aimActive;
      if (pad.aimActive) {
        f.aimX = pad.aimX;
        f.aimY = pad.aimY;
      }
      f.aimRaw = pad.aimRaw;
      f.fire = pad.fire;
      f.assist = true;
    } else {
      const mv = this.desktop.moveVector();
      f.move.x = mv.x;
      f.move.y = mv.y;
      f.aimActive = this.desktop.mouse.seen;
      f.aimScreen = this.desktop.mouse.seen ? { x: this.desktop.mouse.x, y: this.desktop.mouse.y } : null;
      f.aimRaw = 1;
      f.fire = this.desktop.mouse.down;
      f.assist = false;
    }
    return f;
  }

  reset() {
    this.touch.reset();
    this.desktop.reset();
  }
}
