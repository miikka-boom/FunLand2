// Small DOM toolkit: modal manager (re-renders only when its HTML changes,
// keeps live countdowns ticking in between), gem confirmation, toasts.

import { fmtTime } from './format.js';
import { CONFIRM_GEMS } from './config.js';

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

export class Modals {
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

  /**
   * Open a modal. `render()` returns the body HTML and is called again on
   * refresh(); the DOM is only replaced when that HTML changes.
   */
  open(render, { cls = '', key = '', onClose = null, dismissable = true } = {}) {
    if (this.cur) this._teardown(false);
    const back = document.createElement('div');
    back.className = `modal-back ${cls}`;
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${dismissable ? '<button class="modal-x" type="button" data-act="close" aria-label="Close">✕</button>' : ''}<div class="modal-body"></div></div>`;
    this.root.appendChild(back);
    this.cur = { back, body: back.querySelector('.modal-body'), render, key, cls, onClose, html: '', dismissable };
    this.refresh(true);
    requestAnimationFrame(() => back.classList.add('in'));
    if (this.sound) this.sound('open');
    return this.cur;
  }

  /** Open after the current modal (and anything queued before) closes. */
  enqueue(fn) {
    if (!this.cur) fn();
    else this.queue.push(fn);
  }

  /** Replace an informational modal right away; wait behind anything else. */
  interrupt(fn, replaceable = /m-building|m-list/) {
    if (!this.cur) fn();
    else if (replaceable.test(this.cur.cls)) {
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
    setTimeout(() => c.back.remove(), 180);
    if (c.onClose) c.onClose();
    if (runQueue && this.queue.length) {
      const next = this.queue.shift();
      setTimeout(next, 200);
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
        const scroller = c.body.querySelector('.scroll');
        const top = scroller ? scroller.scrollTop : 0;
        c.html = html;
        c.body.innerHTML = html;
        const s2 = c.body.querySelector('.scroll');
        if (s2) s2.scrollTop = top;
        reapplyArmed(c.body);
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
      return;
    }
    const act = el.dataset.act;
    if (act === 'close') {
      this.close();
      return;
    }
    if (!confirmGems(el)) {
      if (this.sound) this.sound('tap');
      return;
    }
    this.onAct(act, el.dataset, el);
  }
}

// Bigger gem spends need a second tap: the first one arms the action for a
// few seconds. The arming is keyed by the action (not the DOM node), so it
// survives a panel re-rendering in between, e.g. when a rush price ticks down.
let armed = null; // { key, until }
let armTimer = 0;
const ARM_MS = 2600;

function armKey(el) {
  const d = { ...el.dataset };
  delete d.gems;
  return `${d.act}|${JSON.stringify(d)}`;
}

function showArmed(el) {
  el.classList.add('armed');
  const label = el.querySelector('.lbl');
  if (label && el._lbl === undefined) {
    el._lbl = label.innerHTML;
    label.textContent = 'Tap again';
  }
}

function disarmAll() {
  armed = null;
  for (const el of document.querySelectorAll('.armed[data-gems]')) {
    el.classList.remove('armed');
    const label = el.querySelector('.lbl');
    if (label && el._lbl !== undefined) label.innerHTML = el._lbl;
    el._lbl = undefined;
  }
}

/** Re-arm the matching button after its panel re-rendered. */
export function reapplyArmed(root) {
  if (!armed) return;
  if (performance.now() >= armed.until) {
    disarmAll();
    return;
  }
  for (const el of root.querySelectorAll('[data-gems]')) if (armKey(el) === armed.key) showArmed(el);
}

/** Returns true when the action should go ahead. */
export function confirmGems(el) {
  const gems = Number(el.dataset.gems || 0);
  if (gems < CONFIRM_GEMS) return true;
  const key = armKey(el);
  if (armed && armed.key === key && performance.now() < armed.until) {
    clearTimeout(armTimer);
    disarmAll();
    return true;
  }
  disarmAll();
  armed = { key, until: performance.now() + ARM_MS };
  showArmed(el);
  clearTimeout(armTimer);
  armTimer = setTimeout(disarmAll, ARM_MS);
  return false;
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
