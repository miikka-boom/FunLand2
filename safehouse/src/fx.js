// Screen-space juice: loot icons that fly into the HUD, floating numbers and
// little bursts. Uses the Web Animations API (no per-frame JS).

export class Fx {
  constructor(layer) {
    this.layer = layer;
  }

  /** Fly `count` copies of `html` from a rect to an element; onEach fires as each lands. */
  fly({ from, to, html, count = 6, duration = 620, stagger = 55, onEach, onDone }) {
    const target = to && to.getBoundingClientRect ? to.getBoundingClientRect() : null;
    if (!target || !from || !this.layer.animate) {
      if (onDone) onDone();
      return 0;
    }
    const fx = from.x + (from.width || 0) / 2;
    const fy = from.y + (from.height || 0) / 2;
    const tx = target.x + Math.min(20, target.width / 2);
    const ty = target.y + target.height / 2;
    let landed = 0;
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'fly';
      el.innerHTML = html;
      this.layer.appendChild(el);
      const sx = fx + (Math.random() - 0.5) * 46;
      const sy = fy + (Math.random() - 0.5) * 30;
      const mx = (sx + tx) / 2 + (Math.random() - 0.5) * 80;
      const my = Math.min(sy, ty) - 30 - Math.random() * 50;
      const anim = el.animate(
        [
          { transform: `translate(${fx - 11}px, ${fy - 11}px) scale(0.4)`, opacity: 0 },
          { transform: `translate(${sx - 11}px, ${sy - 11}px) scale(1.15)`, opacity: 1, offset: 0.18 },
          { transform: `translate(${mx - 11}px, ${my - 11}px) scale(1)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${tx - 11}px, ${ty - 11}px) scale(0.7)`, opacity: 0.9 },
        ],
        { duration: duration + Math.random() * 120, delay: i * stagger, easing: 'cubic-bezier(.45,.05,.7,.4)', fill: 'both' },
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

  float(x, y, html, cls = '') {
    const el = document.createElement('div');
    el.className = `floater ${cls}`;
    el.innerHTML = html;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.layer.appendChild(el);
    if (!el.animate) {
      setTimeout(() => el.remove(), 1000);
      return;
    }
    el.animate(
      [
        { transform: 'translate(-50%, 0) scale(0.7)', opacity: 0 },
        { transform: 'translate(-50%, -18px) scale(1.1)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -52px) scale(1)', opacity: 0 },
      ],
      { duration: 1100, easing: 'ease-out', fill: 'both' },
    ).onfinish = () => el.remove();
  }

  burst(x, y, colors = ['#ffcf7a', '#f2c14e', '#7dffa1', '#6fc8ff'], n = 18) {
    if (!this.layer.animate) return;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'spark';
      el.style.background = colors[i % colors.length];
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      this.layer.appendChild(el);
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const d = 40 + Math.random() * 80;
      el.animate(
        [
          { transform: 'translate(-50%, -50%) rotate(0deg) scale(1)', opacity: 1 },
          { transform: `translate(${Math.cos(a) * d - 4}px, ${Math.sin(a) * d - 4 + 26}px) rotate(${Math.random() * 540}deg) scale(0.6)`, opacity: 0 },
        ],
        { duration: 650 + Math.random() * 450, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'both' },
      ).onfinish = () => el.remove();
    }
  }
}
