// Screen-space juice: loot that flies into the HUD or onto faces, floating
// numbers, sparks, confetti and stamps. Web Animations API, no per-frame JS.

const rand = (a, b) => a + Math.random() * (b - a);
const CONFETTI = ['#e8483f', '#3d8bf0', '#36c06a', '#f5b82e', '#b25cff', '#ffc23a', '#ff8ad8', '#62e6ff'];

function center(r) {
  if (!r) return null;
  if (r.getBoundingClientRect) r = r.getBoundingClientRect();
  return r.width !== undefined ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : { x: r.x, y: r.y };
}

export class Fx {
  constructor(layer) {
    this.layer = layer;
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Fly `count` copies of `html` from a point/rect/element to an element.
   * onEach(i) fires as each one lands, onDone after the last. Returns total ms.
   */
  fly({ from, to, html, count = 6, duration = 620, stagger = 55, spread = 46, size = 26, onEach, onDone }) {
    const a = center(from);
    const b = center(to);
    if (!a || !b) {
      if (onDone) onDone();
      return 0;
    }
    let landed = 0;
    const half = size / 2;
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'fly';
      el.style.width = el.style.height = `${size}px`;
      el.innerHTML = html;
      this.layer.appendChild(el);
      const sx = a.x + rand(-spread, spread);
      const sy = a.y + rand(-spread * 0.6, spread * 0.6);
      const mx = (sx + b.x) / 2 + rand(-60, 60);
      const my = Math.min(sy, b.y) - 30 - rand(0, 60);
      const anim = el.animate(
        [
          { transform: `translate(${a.x - half}px, ${a.y - half}px) scale(0.3)`, opacity: 0 },
          { transform: `translate(${sx - half}px, ${sy - half}px) scale(1.2)`, opacity: 1, offset: 0.2 },
          { transform: `translate(${mx - half}px, ${my - half}px) scale(1)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${b.x - half}px, ${b.y - half}px) scale(0.6)`, opacity: 0.95 },
        ],
        { duration: duration + rand(0, 120), delay: i * stagger, easing: 'cubic-bezier(.45,.05,.7,.4)', fill: 'both' },
      );
      anim.onfinish = () => {
        el.remove();
        landed++;
        if (onEach) onEach(landed - 1);
        if (landed === count && onDone) onDone();
      };
    }
    return duration + count * stagger + 120;
  }

  /** A number or label that pops and drifts up. */
  float(at, html, cls = '') {
    const p = center(at);
    if (!p) return;
    const el = document.createElement('div');
    el.className = `floater ${cls}`;
    el.innerHTML = html;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    this.layer.appendChild(el);
    el.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0 },
        { transform: 'translate(-50%, -80%) scale(1.15)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -190%) scale(1)', opacity: 0 },
      ],
      { duration: 1200, easing: 'ease-out', fill: 'both' },
    ).onfinish = () => el.remove();
  }

  /** Sparks flying out of a point. */
  burst(at, colors = ['#ffd36b', '#ff6b4a', '#7dffa1', '#62e6ff'], n = 22, dist = 110) {
    const p = center(at);
    if (!p || this.reduced) return;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'spark';
      el.style.background = colors[i % colors.length];
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      this.layer.appendChild(el);
      const a = (i / n) * Math.PI * 2 + rand(0, 0.4);
      const d = dist * rand(0.45, 1);
      el.animate(
        [
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: `translate(${Math.cos(a) * d - 4}px, ${Math.sin(a) * d - 4 + 24}px) scale(0.5)`, opacity: 0 },
        ],
        { duration: rand(600, 1100), easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'both' },
      ).onfinish = () => el.remove();
    }
  }

  /** Confetti raining from a point (or the top of the screen). */
  confetti(at = null, n = 46) {
    if (this.reduced) n = Math.round(n / 3);
    const W = innerWidth;
    const p = center(at) || { x: W / 2, y: -10 };
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'confetto';
      el.style.background = CONFETTI[i % CONFETTI.length];
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      if (i % 3 === 0) el.style.borderRadius = '50%';
      this.layer.appendChild(el);
      const up = at ? rand(80, 200) : 0;
      const dx = rand(-1, 1) * (at ? 160 : W * 0.6);
      const fall = innerHeight * rand(0.6, 1.1);
      el.animate(
        [
          { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 },
          { transform: `translate(${dx * 0.5}px, ${-up}px) rotate(${rand(90, 360)}deg)`, opacity: 1, offset: 0.25 },
          { transform: `translate(${dx}px, ${fall}px) rotate(${rand(500, 1100)}deg)`, opacity: 0.2 },
        ],
        { duration: rand(1300, 2300), delay: rand(0, 200), easing: 'cubic-bezier(.25,.6,.45,1)', fill: 'both' },
      ).onfinish = () => el.remove();
    }
  }

  /** A rubber stamp ("READY", "MOVES IN") slammed onto an element. */
  stamp(onEl, text, cls = '') {
    if (!onEl) return null;
    const el = document.createElement('div');
    el.className = `stamp ${cls}`;
    el.textContent = text;
    onEl.appendChild(el);
    el.animate(
      [
        { transform: 'translate(-50%, -50%) rotate(-14deg) scale(2.6)', opacity: 0 },
        { transform: 'translate(-50%, -50%) rotate(-10deg) scale(0.92)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%, -50%) rotate(-10deg) scale(1)', opacity: 1 },
      ],
      { duration: 280, easing: 'cubic-bezier(.3,.9,.4,1.3)', fill: 'both' },
    );
    return el;
  }

  /** Squash-and-stretch pop on an element. */
  pop(el, scale = 1.18) {
    if (!el || !el.animate) return;
    el.animate([{ transform: 'scale(1)' }, { transform: `scale(${scale})` }, { transform: 'scale(0.96)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'ease-out' });
  }

  /** Shake an element (a knock, an error). */
  shake(el, px = 6) {
    if (!el || !el.animate) return;
    el.animate(
      [{ transform: 'translateX(0)' }, { transform: `translateX(${-px}px) rotate(-2deg)` }, { transform: `translateX(${px}px) rotate(2deg)` }, { transform: `translateX(${-px / 2}px)` }, { transform: 'translateX(0)' }],
      { duration: 320, easing: 'ease-out' },
    );
  }
}
