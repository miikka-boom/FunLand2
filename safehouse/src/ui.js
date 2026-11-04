// Small DOM toolkit: one layer manager for station sheets (bottom sheet in
// portrait, side sheet in landscape), centred modals and full-screen panels.
// A layer re-renders only when its HTML changes, and keeps live countdowns
// and progress bars ticking in between. Plus toasts.

import { fmtTime } from './format.js';

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Update every [data-end] countdown and [data-bar-start] progress bar under `root`. */
export function tickLive(root, now) {
  for (const el of root.querySelectorAll('[data-end]')) {
    const t = fmtTime(Math.max(0, Number(el.dataset.end) - now) / 1000);
    if (el.textContent !== t) el.textContent = t;
  }
  for (const el of root.querySelectorAll('[data-bar-start]')) {
    const a = Number(el.dataset.barStart);
    const b = Number(el.dataset.barEnd);
    const f = Math.max(0, Math.min(1, (now - a) / Math.max(1, b - a)));
    const i = el.firstElementChild;
    if (i) i.style.transform = `scaleX(${f})`;
  }
}

/** A progress bar that fills from start to end on its own. */
export function liveBar(start, end, cls = '') {
  return `<span class="bar ${cls}" data-bar-start="${start}" data-bar-end="${end}"><i></i></span>`;
}

export function staticBar(f, cls = '') {
  return `<span class="bar ${cls}"><i style="transform:scaleX(${Math.max(0, Math.min(1, f))})"></i></span>`;
}

export class Layers {
  constructor(root, { onAct, now, sound }) {
    this.root = root;
    this.onAct = onAct;
    this.now = now;
    this.sound = sound;
    this.cur = null;
    this.queue = [];
    this.holding = false;
    root.addEventListener('pointerdown', () => {
      this.holding = true;
    });
    const release = () => setTimeout(() => (this.holding = false), 120);
    root.addEventListener('pointerup', release);
    root.addEventListener('pointercancel', release);
    root.addEventListener('click', (e) => this._click(e));
  }

  get isOpen() {
    return !!this.cur;
  }

  get key() {
    return this.cur ? this.cur.key : null;
  }

  /**
   * Open a layer. kind: 'sheet' | 'modal' | 'full'. `render()` returns the
   * body HTML (or null to close) and is called again on refresh().
   */
  open(render, { kind = 'modal', cls = '', key = '', onClose = null, dismissable = true } = {}) {
    if (this.cur) this._teardown(false);
    const back = document.createElement('div');
    back.className = `layer-back k-${kind} ${cls}`;
    back.innerHTML =
      `<div class="layer" role="dialog" aria-modal="true">` +
      (dismissable ? '<button class="layer-x" type="button" data-act="close" aria-label="Close">✕</button>' : '') +
      `<div class="layer-body"></div></div>`;
    this.root.appendChild(back);
    this.cur = { back, body: back.querySelector('.layer-body'), render, key, kind, cls, onClose, html: '', dismissable };
    this.refresh(true);
    requestAnimationFrame(() => back.classList.add('in'));
    if (this.sound) this.sound(kind === 'sheet' ? 'sheet' : 'open');
    return this.cur;
  }

  /** Open after the current layer (and anything queued before) closes. */
  enqueue(fn) {
    if (!this.cur) fn();
    else this.queue.push(fn);
  }

  /** Replace an informational layer right away; wait behind anything else. */
  interrupt(fn) {
    if (!this.cur) fn();
    else if (this.cur.kind === 'sheet') {
      this.queue.unshift(fn);
      this.close();
    } else this.queue.push(fn);
  }

  close() {
    if (!this.cur) return;
    this._teardown(true);
  }

  _teardown(runQueue) {
    const c = this.cur;
    this.cur = null;
    c.back.classList.remove('in');
    c.back.classList.add('out');
    setTimeout(() => c.back.remove(), 220);
    if (c.onClose) c.onClose();
    if (runQueue && this.queue.length) {
      const next = this.queue.shift();
      setTimeout(next, 240);
    }
  }

  refresh(force = false) {
    const c = this.cur;
    if (!c) return;
    if (force || !this.holding) {
      const html = c.render();
      if (html === null) {
        this.close();
        return;
      }
      if (force || html !== c.html) {
        const scrollers = [...c.body.querySelectorAll('.scroll')].map((el) => el.scrollTop);
        const top = c.body.scrollTop;
        c.html = html;
        c.body.innerHTML = html;
        c.body.scrollTop = top;
        c.body.querySelectorAll('.scroll').forEach((el, i) => {
          if (scrollers[i] !== undefined) el.scrollTop = scrollers[i];
        });
      }
    }
    tickLive(c.body, this.now());
  }

  _click(e) {
    const c = this.cur;
    if (!c) return;
    if (e.target === c.back && c.dismissable) {
      this.close();
      return;
    }
    const el = e.target.closest('[data-act]');
    if (!el || !c.back.contains(el)) return;
    if (el.disabled || el.classList.contains('disabled')) {
      if (this.sound) this.sound('error');
      if (el.dataset.why) this.onAct('why', { text: el.dataset.why }, el);
      return;
    }
    const act = el.dataset.act;
    if (act === 'close') {
      this.close();
      return;
    }
    this.onAct(act, el.dataset, el);
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
