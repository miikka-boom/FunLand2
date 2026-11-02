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
  constructor(canvas, getLayout) {
    this.getLayout = getLayout;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false, seen: false };
    this.events = [];
    this.lastUsed = 0;

    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      const now = performance.now();
      if (MOVE_KEYS[e.code]) {
        this.keys.add(e.code);
        this.lastUsed = now;
        e.preventDefault();
        return;
      }
      if (e.repeat) return;
      const map = {
        Space: 'shove', KeyF: 'shove', KeyV: 'shove',
        KeyR: 'reload',
        KeyQ: 'swap', KeyE: 'swap', Tab: 'swap',
        Escape: 'pause', KeyP: 'pause',
      };
      const ev = map[e.code];
      if (ev) {
        this.events.push(ev);
        this.lastUsed = now;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      this._mouseAt(e);
      const L = this.getLayout();
      for (const b of L.buttons) {
        if (hitButton(b, e.clientX, e.clientY, 0)) {
          this.events.push(b.id);
          return;
        }
      }
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) this.events.push('shove');
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') this._mouseAt(e);
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0) this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (Math.abs(e.deltaY) > 4) this.events.push('swap');
      },
      { passive: true },
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
