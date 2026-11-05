// Screen-space juice: loot icons that fly into the HUD, floating numbers,
// little bursts for level-ups. Uses the Web Animations API (no per-frame JS).

export class Fx {
  constructor(layer) {
    this.layer = layer;
  }

  /**
   * Fly `count` copies of `html` from a rect/point to an element. Calls
   * onEach as each lands and onDone after the last. Returns the total ms.
   */
  fly({ from, to, html, count = 6, duration = 650, stagger = 55, onEach, onDone }) {
    const target = to && to.getBoundingClientRect ? to.getBoundingClientRect() : null;
    if (!target || !from) {
      if (onDone) onDone();
      return 0;
    }
    const fx = from.x !== undefined && from.width !== undefined ? from.x + from.width / 2 : from.x;
    const fy = from.y !== undefined && from.height !== undefined ? from.y + from.height / 2 : from.y;
    const tx = target.x + Math.min(22, target.width / 2);
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
      const my = Math.min(sy, ty) - 40 - Math.random() * 60;
      const anim = el.animate(
        [
          { transform: `translate(${fx - 12}px, ${fy - 12}px) scale(0.4)`, opacity: 0 },
          { transform: `translate(${sx - 12}px, ${sy - 12}px) scale(1.15)`, opacity: 1, offset: 0.18 },
          { transform: `translate(${mx - 12}px, ${my - 12}px) scale(1)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${tx - 12}px, ${ty - 12}px) scale(0.7)`, opacity: 0.9 },
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
    el.animate(
      [
        { transform: 'translate(-50%, 0) scale(0.7)', opacity: 0 },
        { transform: 'translate(-50%, -18px) scale(1.1)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -52px) scale(1)', opacity: 0 },
      ],
      { duration: 1100, easing: 'ease-out', fill: 'both' },
    ).onfinish = () => el.remove();
  }

  burst(x, y, colors = ['#ffd36b', '#ff6b4a', '#7dffa1', '#62e6ff'], n = 22) {
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'spark';
      el.style.background = colors[i % colors.length];
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      this.layer.appendChild(el);
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const d = 50 + Math.random() * 90;
      el.animate(
        [
          { transform: 'translate(-50%, -50%) rotate(0deg) scale(1)', opacity: 1 },
          { transform: `translate(${Math.cos(a) * d - 4}px, ${Math.sin(a) * d - 4 + 30}px) rotate(${Math.random() * 540}deg) scale(0.6)`, opacity: 0 },
        ],
        { duration: 700 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'both' },
      ).onfinish = () => el.remove();
    }
  }
}
