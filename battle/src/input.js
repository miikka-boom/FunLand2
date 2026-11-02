// Pointer input for the battlefield: tap (place), drag on a bean (grab),
// drag elsewhere (pan), pinch / wheel (zoom), right-click (remove), hover.

const TAP_SLOP = 9; // px a finger may wander and still count as a tap

export class Input {
  /**
   * h: { tap(sx, sy), alt(sx, sy), grabStart(sx, sy) -> bool, grabMove(sx, sy),
   *      grabEnd(sx, sy), pan(dx, dy), zoom(factor, sx, sy), hover(sx, sy|null) }
   */
  constructor(el, h) {
    this.el = el;
    this.h = h;
    this.ptrs = new Map();
    this.mode = null; // null | pending | pan | grab | pinch
    this.pinch = null;
    this.lastTouchT = 0;

    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e, false));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.ptrs.size) this.h.hover(null, null);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        this.h.zoom(Math.exp(-dy * 0.0016), e.clientX, e.clientY);
      },
      { passive: false },
    );
  }

  down(e) {
    if (e.pointerType === 'mouse' && e.button === 2) {
      this.h.alt(e.clientX, e.clientY);
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // not capturable (synthetic event)
    }
    const p = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, t: performance.now() };
    this.ptrs.set(e.pointerId, p);
    if (this.ptrs.size === 1) {
      if (this.h.grabStart(p.x, p.y)) this.mode = 'grab';
      else this.mode = 'pending';
    } else if (this.ptrs.size === 2) {
      // Second finger: switch to pinch zoom
      if (this.mode === 'grab') this.h.grabEnd(p.x, p.y);
      const [a, b] = [...this.ptrs.values()];
      this.mode = 'pinch';
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
  }

  move(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') this.h.hover(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.mode === 'grab') this.h.grabMove(p.x, p.y);
    else if (this.mode === 'pending') {
      if (Math.hypot(p.x - p.sx, p.y - p.sy) > TAP_SLOP) {
        this.mode = 'pan';
        this.h.pan(p.x - p.sx, p.y - p.sy);
      }
    } else if (this.mode === 'pan') this.h.pan(dx, dy);
    else if (this.mode === 'pinch' && this.ptrs.size >= 2) {
      const [a, b] = [...this.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      this.h.zoom(d / this.pinch.d, mx, my);
      this.h.pan(mx - this.pinch.mx, my - this.pinch.my);
      this.pinch = { d, mx, my };
    }
    if (e.pointerType === 'mouse') this.h.hover(e.clientX, e.clientY);
  }

  up(e, cancelled) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    if (this.mode === 'grab') this.h.grabEnd(p.x, p.y);
    else if (this.mode === 'pending' && !cancelled) this.h.tap(p.x, p.y);
    if (this.ptrs.size === 0) this.mode = null;
    else if (this.mode === 'pinch' && this.ptrs.size === 1) this.mode = 'pan'; // finish with the remaining finger
  }

  /** Lost focus / orientation change: forget everything. */
  reset() {
    if (this.mode === 'grab') this.h.grabEnd(0, 0);
    this.ptrs.clear();
    this.mode = null;
  }
}
