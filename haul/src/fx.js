// Long Haul: screen-space juice. Things that fly into the wallet or onto a
// face, numbers that pop and drift, bursts, confetti, a shake. All of it is
// the Web Animations API on throwaway elements in #fx: no per-frame JS.

const rand = (a, b) => a + Math.random() * (b - a);
const CONFETTI = ['#ffc531', '#4a9dff', '#5fd068', '#e8483f', '#b86bff', '#8fe3d0', '#ff8f6b', '#f4f1ea'];

/** The centre of an element, a DOMRect or a { x, y } point. */
export function centre(r) {
  if (!r) return null;
  if (r.getBoundingClientRect) r = r.getBoundingClientRect();
  return r.width !== undefined ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : { x: r.x, y: r.y };
}

export class Fx {
  constructor(layer) {
    this.layer = layer;
    this.calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  _el(cls, html) {
    const el = document.createElement('div');
    el.className = cls;
    if (html) el.innerHTML = html;
    this.layer.appendChild(el);
    return el;
  }

  /**
   * Fly `count` copies of `html` from one place to another. onEach(i) fires as
   * each lands, onDone after the last. Returns how long it all takes (ms).
   */
  fly({ from, to, html, count = 6, duration = 560, stagger = 50, spread = 40, size = 26, onEach, onDone }) {
    const a = centre(from);
    const b = centre(to);
    if (!a || !b || this.calm) {
      for (let i = 0; i < count; i++) if (onEach) onEach(i);
      if (onDone) onDone();
      return 0;
    }
    let landed = 0;
    const half = size / 2;
    for (let i = 0; i < count; i++) {
      const el = this._el('fly', html);
      el.style.width = el.style.height = `${size}px`;
      const sx = a.x + rand(-spread, spread);
      const sy = a.y + rand(-spread * 0.6, spread * 0.6);
      const mx = (sx + b.x) / 2 + rand(-50, 50);
      const my = Math.min(sy, b.y) - 30 - rand(0, 50);
      el.animate(
        [
          { transform: `translate(${a.x - half}px, ${a.y - half}px) scale(0.3)`, opacity: 0 },
          { transform: `translate(${sx - half}px, ${sy - half}px) scale(1.25)`, opacity: 1, offset: 0.22 },
          { transform: `translate(${mx - half}px, ${my - half}px) scale(1)`, opacity: 1, offset: 0.58 },
          { transform: `translate(${b.x - half}px, ${b.y - half}px) scale(0.6)`, opacity: 0.95 },
        ],
        { duration: duration + rand(0, 100), delay: i * stagger, easing: 'cubic-bezier(.45,.05,.7,.4)', fill: 'both' },
      ).onfinish = () => {
        el.remove();
        landed++;
        if (onEach) onEach(landed - 1);
        if (landed === count && onDone) onDone();
      };
    }
    return duration + count * stagger + 100;
  }

  /** A label that pops up and drifts away. */
  float(at, html, cls = '') {
    const p = centre(at);
    if (!p) return;
    const el = this._el(`floater ${cls}`, html);
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0 },
        { transform: 'translate(-50%, -85%) scale(1.15)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -200%) scale(1)', opacity: 0 },
      ],
      { duration: 1100, easing: 'ease-out', fill: 'both' },
    ).onfinish = () => el.remove();
  }

  /** A ring of sparks from a point. */
  burst(at, { color = '#ffd36b', n = 10, r = 46, size = 9 } = {}) {
    const p = centre(at);
    if (!p || this.calm) return;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
      const d = r * rand(0.7, 1.2);
      const el = this._el('spark');
      el.style.width = el.style.height = `${size}px`;
      el.style.background = color;
      el.animate(
        [
          { transform: `translate(${p.x}px, ${p.y}px) scale(1)`, opacity: 1 },
          { transform: `translate(${p.x + Math.cos(a) * d}px, ${p.y + Math.sin(a) * d}px) scale(0.2)`, opacity: 0 },
        ],
        { duration: rand(360, 560), easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'both' },
      ).onfinish = () => el.remove();
    }
  }

  /** A flash ring that grows out of a point. */
  ring(at, color = '#ffd36b', size = 120) {
    const p = centre(at);
    if (!p || this.calm) return;
    const el = this._el('ring');
    el.style.borderColor = color;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.animate(
      [
        { width: '10px', height: '10px', opacity: 0.9 },
        { width: `${size}px`, height: `${size}px`, opacity: 0 },
      ],
      { duration: 480, easing: 'ease-out', fill: 'both' },
    ).onfinish = () => el.remove();
  }

  confetti({ n = 70, from } = {}) {
    if (this.calm) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const o = centre(from);
    for (let i = 0; i < n; i++) {
      const el = this._el('confetto');
      el.style.background = CONFETTI[i % CONFETTI.length];
      const x0 = o ? o.x : rand(0, w);
      const y0 = o ? o.y : -20;
      const x1 = o ? x0 + rand(-w * 0.4, w * 0.4) : x0 + rand(-80, 80);
      const up = o ? rand(60, 220) : 0;
      el.animate(
        [
          { transform: `translate(${x0}px, ${y0}px) rotate(0deg)`, opacity: 1 },
          { transform: `translate(${(x0 + x1) / 2}px, ${y0 - up}px) rotate(${rand(-300, 300)}deg)`, opacity: 1, offset: o ? 0.3 : 0.01 },
          { transform: `translate(${x1}px, ${h + 30}px) rotate(${rand(-900, 900)}deg)`, opacity: 0.9 },
        ],
        { duration: rand(1300, 2400), delay: rand(0, o ? 120 : 500), easing: 'cubic-bezier(.3,.3,.7,1)', fill: 'both' },
      ).onfinish = () => el.remove();
    }
  }

  /** Shake an element (the stage, a sheet). */
  shake(el, px = 6, ms = 260) {
    if (!el || this.calm) return;
    const k = [];
    for (let i = 0; i < 6; i++) k.push({ transform: `translate(${rand(-px, px)}px, ${rand(-px, px)}px)` });
    k.push({ transform: 'translate(0, 0)' });
    el.animate(k, { duration: ms, easing: 'ease-out' });
  }

  /** A squash-and-pop on something that just changed. */
  pop(el, scale = 1.25, ms = 320) {
    if (!el || this.calm) return;
    el.animate([{ transform: 'scale(1)' }, { transform: `scale(${scale})`, offset: 0.35 }, { transform: 'scale(1)' }], { duration: ms, easing: 'cubic-bezier(.2,1.6,.4,1)' });
  }
}

/** A number in an element counting from `from` to `to`. onTick(k) fires as it moves (0..1). */
export function countUp(el, from, to, { ms = 500, fmt = (v) => String(Math.round(v)), onTick } = {}) {
  if (!el) return Promise.resolve();
  return new Promise((resolve) => {
    const t0 = performance.now();
    let last = null;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      const v = from + (to - from) * (1 - (1 - k) ** 3);
      const text = fmt(v);
      if (text !== last) {
        el.textContent = text;
        if (onTick && last !== null) onTick(k);
        last = text;
      }
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

export function buzz(pattern, on = true) {
  try {
    if (on && navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    // no haptics
  }
}
