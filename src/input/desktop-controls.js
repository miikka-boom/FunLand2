// Keyboard + mouse fallback so the prototype can be iterated on at a desk.
// WASD/arrows move, mouse aims, left button fires, right button / Space shoves,
// R reloads, Q/E/wheel swaps weapon, Esc opens the tuning panel.

import { hitButton } from '../layout.js';

const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export class DesktopControls {
  constructor(canvas, getLayout, isGhost = () => false) {
    this.getLayout = getLayout;
    this.isGhost = isGhost;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false, seen: false };
    this.events = [];
    this.lastUsed = 0;

    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) {
        if (e.code === 'Escape') {
          this.events.push('pause');
          e.target.blur();
        }
        return;
      }
      const now = performance.now();
      if (MOVE_KEYS[e.code]) {
        this.keys.add(e.code);
        this.lastUsed = now;
        e.preventDefault();
        return;
      }
      const map = {
        Space: 'shove', KeyF: 'shove', KeyV: 'shove',
        KeyR: 'reload',
        KeyQ: 'swap', KeyE: 'swap', Tab: 'swap',
        Escape: 'pause', KeyP: 'pause',
      };
      const ev = map[e.code];
      if (ev) {
        // A held key is still the game's: Space must not page-scroll (when the
        // game is embedded, that scrolls the page around it), Tab must not
        // walk the focus away.
        e.preventDefault();
        if (e.repeat) return;
        this.events.push(ev);
        this.lastUsed = now;
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    // mousedown/mouseup fire per button, so chorded clicks (fire + right-click
    // shove) work; pointerdown/up only report the first press / last release.
    canvas.addEventListener('mousedown', (e) => {
      if (this.isGhost()) return;
      this._mouseAt(e);
      if (e.button === 0) {
        const L = this.getLayout();
        for (const b of L.buttons) {
          if (hitButton(b, e.clientX, e.clientY, 0)) {
            this.events.push(b.id);
            return;
          }
        }
        this.mouse.down = true;
      } else if (e.button === 2) {
        this.events.push('shove');
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this._mouseAt(e);
      if (this.mouse.down && !(e.buttons & 1)) this.mouse.down = false; // released outside the window
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    let wheelAcc = 0;
    let wheelLast = 0;
    let wheelSwap = 0;
    canvas.addEventListener(
      'wheel',
      (e) => {
        // The wheel over the game swaps weapons; it must not also scroll the
        // page the game is embedded in.
        e.preventDefault();
        const now = performance.now();
        if (now - wheelLast > 250) wheelAcc = 0;
        wheelLast = now;
        wheelAcc += e.deltaY;
        // One swap per notch / flick, not one per trackpad event.
        if (Math.abs(wheelAcc) > 40 && now - wheelSwap > 300) {
          this.events.push('swap');
          wheelSwap = now;
          wheelAcc = 0;
        }
      },
      { passive: false },
    );
    window.addEventListener('blur', () => this.reset());
  }

  _mouseAt(e) {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    this.mouse.seen = true;
    this.lastUsed = performance.now();
  }

  moveVector() {
    let x = 0;
    let y = 0;
    for (const k of this.keys) {
      const v = MOVE_KEYS[k];
      if (v) {
        x += v[0];
        y += v[1];
      }
    }
    const d = Math.hypot(x, y);
    return d > 0 ? { x: x / d, y: y / d } : { x: 0, y: 0 };
  }

  consumeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  reset() {
    this.keys.clear();
    this.mouse.down = false;
    this.events = [];
  }
}
