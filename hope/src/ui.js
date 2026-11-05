// Small DOM toolkit. Modals render when opened and again only after an
// action (never on a timer), so a button can't be replaced under a finger.
// Countdowns ([data-end]) and bars ([data-bar-start]) tick in place.

import { fmtTime } from './format.js';

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function tickLive(root, now) {
  for (const el of root.querySelectorAll('[data-end]')) {
    const t = fmtTime(Math.max(0, Number(el.dataset.end) - now) / 1000);
    if (el.textContent !== t) el.textContent = t;
  }
}

/** Mark a scroller that has more content past its end (CSS fades that edge). */
function moreHint(el) {
  const update = () => {
    el.classList.toggle('more-y', el.scrollHeight - el.clientHeight - el.scrollTop > 4);
    el.classList.toggle('more-x', el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  };
  el.addEventListener('scroll', update, { passive: true });
  update();
  requestAnimationFrame(update); // after layout settles (fonts, images)
}

export class Modals {
  constructor(root, { onAct, now, sound }) {
    this.root = root;
    this.onAct = onAct;
    this.now = now;
    this.sound = sound;
    this.cur = null;
    this.queue = [];
    root.addEventListener('click', (e) => this._click(e));
  }

  get isOpen() {
    return !!this.cur;
  }

  open(render, { cls = '', onClose = null, dismissable = true } = {}) {
    if (this.cur) this._teardown(false);
    const back = document.createElement('div');
    back.className = `modal-back ${cls}`;
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${dismissable ? '<button class="modal-x" type="button" data-act="close" aria-label="Close">✕</button>' : ''}<div class="modal-body"></div></div>`;
    this.root.appendChild(back);
    this.cur = { back, body: back.querySelector('.modal-body'), render, cls, onClose, dismissable };
    this.render();
    requestAnimationFrame(() => back.classList.add('in'));
    if (this.sound) this.sound('open');
    return this.cur;
  }

  /** Re-render the open modal (call after an action changed what it shows). */
  render() {
    const c = this.cur;
    if (!c) return;
    const html = typeof c.render === 'function' ? c.render() : c.render;
    if (html === null) {
      this.close();
      return;
    }
    const scroller = c.body.querySelector('.scroll');
    const top = scroller ? scroller.scrollTop : 0;
    const left = scroller ? scroller.scrollLeft : 0;
    c.body.innerHTML = html;
    const s2 = c.body.querySelector('.scroll');
    if (s2) {
      s2.scrollTop = top;
      s2.scrollLeft = left;
    }
    for (const el of c.body.querySelectorAll('.scroll')) moreHint(el);
    tickLive(c.body, this.now());
  }

  tick() {
    if (this.cur) tickLive(this.cur.body, this.now());
  }

  enqueue(fn) {
    if (!this.cur) fn();
    else this.queue.push(fn);
  }

  close() {
    if (this.cur) this._teardown(true);
  }

  _teardown(runQueue) {
    const c = this.cur;
    this.cur = null;
    c.back.classList.remove('in');
    c.back.classList.add('out');
    setTimeout(() => c.back.remove(), 200);
    // replaced = another modal took this one's place (vs. closed by the player).
    if (c.onClose) c.onClose(!runQueue);
    if (runQueue && this.queue.length) {
      const next = this.queue.shift();
      setTimeout(next, 220);
    }
  }

  _click(e) {
    const c = this.cur;
    if (!c) return;
    if (e.target === c.back) {
      if (c.dismissable) this.close();
      return;
    }
    const el = e.target.closest('[data-act]');
    if (!el || !c.back.contains(el)) return;
    if (el.disabled) return;
    if (el.dataset.act === 'close') {
      this.close();
      return;
    }
    this.onAct(el.dataset.act, el.dataset, el);
  }
}

export class Toasts {
  constructor(root) {
    this.root = root;
  }

  show(html, cls = '', ms = 2600) {
    const t = document.createElement('div');
    t.className = `toast ${cls}`;
    t.innerHTML = html;
    this.root.appendChild(t);
    while (this.root.children.length > 3) this.root.firstElementChild.remove();
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => {
      t.classList.remove('in');
      setTimeout(() => t.remove(), 250);
    }, ms);
  }
}
