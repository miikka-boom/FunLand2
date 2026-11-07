// Small DOM toolkit. Modals render when opened and again only after an action
// (never on a timer), so a button can't be replaced under a finger. Countdowns
// ([data-end]) tick in place. Sequences (chest opening, raids) are async and
// wait on taps with tapOn().

import { fmtTime } from './format.js';
import { icon } from './icons.js';

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Resolve on the next tap/click on `el` (after `guard` ms, so a double tap doesn't skip). */
export function tapOn(el, guard = 180) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const fn = (e) => {
      if (performance.now() - t0 < guard) return;
      if (e.target.closest && e.target.closest('[data-skip]')) return;
      el.removeEventListener('click', fn);
      resolve(e);
    };
    el.addEventListener('click', fn);
  });
}

export function tickLive(root, now) {
  for (const el of root.querySelectorAll('[data-end]')) {
    const t = fmtTime(Math.max(0, Number(el.dataset.end) - now) / 1000);
    if (el.textContent !== t) el.textContent = t;
  }
}

/** Mark a scroller that has more content past its end (CSS fades that edge). */
export function moreHint(el) {
  const update = () => {
    el.classList.toggle('more-y', el.scrollHeight - el.clientHeight - el.scrollTop > 4);
    el.classList.toggle('more-x', el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  };
  el.addEventListener('scroll', update, { passive: true });
  update();
  requestAnimationFrame(update);
}

export class Modals {
  constructor(root, { onAct, now, sound }) {
    this.root = root;
    this.onAct = onAct;
    this.now = now;
    this.sound = sound;
    this.cur = null;
    root.addEventListener('click', (e) => this._click(e));
  }

  get isOpen() {
    return !!this.cur;
  }

  /** render: () => html (null closes). Returns a promise that resolves when it closes. */
  open(render, { cls = '', onClose = null, dismissable = true, sound = true } = {}) {
    if (this.cur) this._teardown(true);
    const back = document.createElement('div');
    back.className = `modal-back ${cls}`;
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${dismissable ? `<button class="modal-x" type="button" data-act="close" aria-label="Close">${icon('close')}</button>` : ''}<div class="modal-body"></div></div>`;
    this.root.appendChild(back);
    let done;
    const closed = new Promise((r) => (done = r));
    this.cur = { back, body: back.querySelector('.modal-body'), render, cls, onClose, dismissable, done };
    this.render();
    requestAnimationFrame(() => back.classList.add('in'));
    if (sound && this.sound) this.sound('open');
    return closed;
  }

  render() {
    const c = this.cur;
    if (!c) return;
    const html = typeof c.render === 'function' ? c.render() : c.render;
    if (html === null) {
      this.close();
      return;
    }
    const scrollers = [...c.body.querySelectorAll('.scroll')].map((s) => [s.scrollTop, s.scrollLeft]);
    c.body.innerHTML = html;
    [...c.body.querySelectorAll('.scroll')].forEach((s, i) => {
      if (scrollers[i]) [s.scrollTop, s.scrollLeft] = scrollers[i];
      moreHint(s);
    });
    tickLive(c.body, this.now());
  }

  tick() {
    if (this.cur) tickLive(this.cur.body, this.now());
  }

  close(value) {
    if (this.cur) this._teardown(false, value);
  }

  /** Back button / Esc: close if allowed. Returns whether it did. */
  back() {
    if (!this.cur || !this.cur.dismissable) return false;
    this.close();
    return true;
  }

  _teardown(replaced, value) {
    const c = this.cur;
    this.cur = null;
    c.back.classList.remove('in');
    c.back.classList.add('out');
    setTimeout(() => c.back.remove(), 200);
    if (c.onClose) c.onClose(replaced);
    c.done(value);
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

  show(html, cls = '', ms = 2400) {
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
