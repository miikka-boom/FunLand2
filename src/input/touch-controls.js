// Twin virtual sticks for touch screens.
//
//  - Left part of the screen owns the MOVE stick, right part the AIM stick.
//    Ownership is decided where a finger lands; after that the finger can roam
//    anywhere (crossing the middle never drops the stick).
//  - Modes per stick: dynamic (base spawns under the thumb and is dragged
//    along past the rim), floating (spawns under the thumb, stays put),
//    fixed (base is pinned; deflection is measured from it).
//  - AIM stick: inner ring = aim only (laser), past the fire ring = fire.
//    A quick tap on the aim side (no fire) = SHOVE.
//  - Buttons react on touch-down (no waiting for release).
//  - Every touch event re-validates live touches, so a lost touchend can never
//    leave a stick stuck "held".

import { shapeStick, dragBase, fireState, isTap } from './stick-math.js';
import { hitButton } from '../layout.js';

class Stick {
  constructor(name) {
    this.name = name;
    this.base = { x: 0, y: 0 };
    this.pos = { x: 0, y: 0 };
    this.start = { x: 0, y: 0 };
    this.release();
  }

  release() {
    this.touchId = null;
    this.active = false;
    this.t0 = 0;
    this.travel = 0;
    this.firing = false;
    this.crossedFire = false;
    this.tapCandidate = false;
    this.out = { x: 0, y: 0, mag: 0, raw: 0, nx: 0, ny: 0 };
  }
}

export class TouchControls {
  constructor(target, settings, getLayout) {
    this.target = target;
    this.settings = settings;
    this.getLayout = getLayout;
    this.move = new Stick('move');
    this.aim = new Stick('aim');
    this.buttonTouches = new Map(); // touchId -> button id
    this.pressed = new Map(); // button id -> press time
    this.extraTaps = new Map(); // touchId -> {x, y, t0, travel} (second finger on the aim side)
    this.events = [];
    this.lastUsed = 0;
    this.taps = []; // recent tap markers for the debug overlay
    this.enabled = true;

    const opts = { passive: false };
    this.supportsTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if ('ontouchstart' in window) {
      target.addEventListener('touchstart', (e) => this._touch(e, 'start'), opts);
      target.addEventListener('touchmove', (e) => this._touch(e, 'move'), opts);
      target.addEventListener('touchend', (e) => this._touch(e, 'end'), opts);
      target.addEventListener('touchcancel', (e) => this._touch(e, 'cancel'), opts);
    } else {
      // Pointer Events fallback for touch/pen-only browsers. Mouse is handled
      // by the desktop controls.
      const pe = (type) => (e) => {
        if (e.pointerType === 'mouse') return;
        if (e.cancelable) e.preventDefault();
        if (type === 'start') target.setPointerCapture?.(e.pointerId);
        this._contact(type, e.pointerId, e.clientX, e.clientY);
      };
      target.addEventListener('pointerdown', pe('start'), opts);
      target.addEventListener('pointermove', pe('move'), opts);
      target.addEventListener('pointerup', pe('end'), opts);
      target.addEventListener('pointercancel', pe('cancel'), opts);
    }
  }

  _touch(e, type) {
    if (e.cancelable) e.preventDefault(); // no scroll, zoom, double-tap zoom, magnifier, synthetic mouse
    for (const t of e.changedTouches) this._contact(type, t.identifier, t.clientX, t.clientY);
    this._sweep(e.touches);
  }

  // Release anything whose finger is no longer on the glass.
  _sweep(touchList) {
    const live = new Set();
    for (const t of touchList) live.add(t.identifier);
    for (const s of [this.move, this.aim]) if (s.active && !live.has(s.touchId)) s.release();
    for (const id of [...this.buttonTouches.keys()]) {
      if (!live.has(id)) {
        this.pressed.delete(this.buttonTouches.get(id));
        this.buttonTouches.delete(id);
      }
    }
    for (const id of [...this.extraTaps.keys()]) if (!live.has(id)) this.extraTaps.delete(id);
  }

  _contact(type, id, x, y) {
    const now = performance.now();
    this.lastUsed = now;
    if (!this.enabled) {
      if (type === 'end' || type === 'cancel') this._end(id, x, y, now, true);
      return;
    }
    if (type === 'start') this._start(id, x, y, now);
    else if (type === 'move') this._move(id, x, y);
    else this._end(id, x, y, now, type === 'cancel');
  }

  _start(id, x, y, now) {
    // A reused id means we missed its end event: drop whatever it still owns.
    for (const s of [this.move, this.aim]) if (s.touchId === id) s.release();
    if (this.buttonTouches.has(id)) {
      this.pressed.delete(this.buttonTouches.get(id));
      this.buttonTouches.delete(id);
    }
    this.extraTaps.delete(id);
    const L = this.getLayout();
    for (const b of L.buttons) {
      if (hitButton(b, x, y)) {
        this.buttonTouches.set(id, b.id);
        this.pressed.set(b.id, now);
        this.events.push(b.id);
        return;
      }
    }
    const isLeft = x < L.splitX;
    const stick = isLeft ? this.move : this.aim;
    if (stick.active) {
      // Second finger on the aim side while already aiming: allow a tap-shove.
      if (!isLeft) this.extraTaps.set(id, { x, y, t0: now, travel: 0 });
      return;
    }
    const mode = isLeft ? this.settings.moveMode : this.settings.aimMode;
    stick.touchId = id;
    stick.active = true;
    stick.t0 = now;
    stick.travel = 0;
    stick.crossedFire = false;
    stick.firing = false;
    stick.start.x = x;
    stick.start.y = y;
    stick.pos.x = x;
    stick.pos.y = y;
    if (mode === 'fixed') {
      const fb = isLeft ? L.fixedMove : L.fixedAim;
      stick.base.x = fb.x;
      stick.base.y = fb.y;
    } else {
      stick.base.x = x;
      stick.base.y = y;
    }
  }

  _move(id, x, y) {
    for (const s of [this.move, this.aim]) {
      if (s.touchId !== id) continue;
      s.pos.x = x;
      s.pos.y = y;
      s.travel = Math.max(s.travel, Math.hypot(x - s.start.x, y - s.start.y));
      const mode = s === this.move ? this.settings.moveMode : this.settings.aimMode;
      if (mode === 'dynamic') dragBase(s.base, x, y, this.settings.stickRadius);
      return;
    }
    const tap = this.extraTaps.get(id);
    if (tap) tap.travel = Math.max(tap.travel, Math.hypot(x - tap.x, y - tap.y));
  }

  _end(id, x, y, now, cancelled) {
    const S = this.settings;
    if (this.buttonTouches.has(id)) {
      this.pressed.delete(this.buttonTouches.get(id));
      this.buttonTouches.delete(id);
      return;
    }
    if (this.aim.touchId === id) {
      const s = this.aim;
      if (!cancelled && S.tapShove && isTap(now - s.t0, s.travel, s.crossedFire, S.tapMaxMs, S.tapMaxPx)) {
        this._tap(x, y, now);
      }
      s.release();
      return;
    }
    if (this.move.touchId === id) {
      this.move.release();
      return;
    }
    const tap = this.extraTaps.get(id);
    if (tap) {
      this.extraTaps.delete(id);
      if (!cancelled && S.tapShove && isTap(now - tap.t0, tap.travel, false, S.tapMaxMs, S.tapMaxPx)) {
        this._tap(x, y, now);
      }
    }
  }

  _tap(x, y, now) {
    this.events.push('shove');
    this.taps.push({ x, y, t: now });
    if (this.taps.length > 8) this.taps.shift();
  }

  /** Recompute shaped outputs. Call once per frame before reading. */
  update() {
    const S = this.settings;
    const R = S.stickRadius;
    const m = this.move;
    if (m.active) {
      m.out = shapeStick(m.pos.x - m.base.x, m.pos.y - m.base.y, R, S.moveDeadzone, S.moveSaturation, S.moveCurve);
    }
    const a = this.aim;
    if (a.active) {
      // Aim keeps the raw direction; magnitude only matters for the fire ring.
      a.out = shapeStick(a.pos.x - a.base.x, a.pos.y - a.base.y, R, S.aimDeadzone, 1, 1);
      a.firing = a.out.raw > S.aimDeadzone && fireState(a.firing, a.out.raw, S.fireThreshold, S.aimDeadzone);
      if (a.firing) a.crossedFire = true;
      // Still short and small enough to become a shove-tap: don't aim yet.
      a.tapCandidate = S.tapShove && !a.crossedFire && a.travel <= S.tapMaxPx && performance.now() - a.t0 <= S.tapMaxMs;
    }
  }

  /** Knob draw position (thumb clamped to the rim). */
  knob(s) {
    const R = this.settings.stickRadius;
    const dx = s.pos.x - s.base.x;
    const dy = s.pos.y - s.base.y;
    const d = Math.hypot(dx, dy);
    if (d <= R || d < 1e-6) return { x: s.pos.x, y: s.pos.y };
    return { x: s.base.x + (dx / d) * R, y: s.base.y + (dy / d) * R };
  }

  consumeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Drop every touch (pause, blur, orientation change...). */
  reset() {
    this.move.release();
    this.aim.release();
    this.buttonTouches.clear();
    this.pressed.clear();
    this.extraTaps.clear();
    this.events = [];
  }
}
