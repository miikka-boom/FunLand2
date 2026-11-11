// Long Haul: a small DOM toolkit, and the view pieces every screen shares
// (faces in rarity frames, amounts, token bars). Screens are built as HTML
// strings and re-rendered after an action, never on a timer, so a button
// can't be replaced under a finger; countdowns ([data-until]) tick in place.

import { CAST, CLASSES, RARITIES } from './config.js';
import { portraitSvg, silhouetteSvg } from './figures.js';
import { icon } from './icons.js';
import { fmtNum, fmtLeft } from './format.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Two animation frames: long enough for a freshly added element to get its starting style. */
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/** Resolve on the next tap on `el` (not sooner than `guard` ms, so a double tap doesn't skip a beat). */
export function tapOn(el, guard = 200) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const fn = (e) => {
      if (performance.now() - t0 < guard) return;
      el.removeEventListener('click', fn);
      resolve(e);
    };
    el.addEventListener('click', fn);
  });
}

/** Whichever comes first: a tap on `el` or `ms` going by. Resolves 'tap' or 'time'. */
export function tapOrWait(el, ms, guard = 200) {
  return Promise.race([tapOn(el, guard).then(() => 'tap'), wait(ms).then(() => 'time')]);
}

/** Refresh every countdown under `root`. */
export function tickCountdowns(root, now) {
  for (const el of root.querySelectorAll('[data-until]')) {
    const t = fmtLeft(Number(el.dataset.until) - now);
    if (el.textContent !== t) el.textContent = t;
  }
}

// --- Shared view pieces ----------------------------------------------------------------------

/** A portrait in its rarity frame. */
export function face(id, { cls = '', mood, level = null, unknown = false } = {}) {
  const c = CAST[id];
  return (
    `<span class="face r-${c.rarity}${unknown ? ' unknown' : ''} ${cls}" data-face="${id}">` +
    (unknown ? silhouetteSvg(id) : portraitSvg(id, { mood })) +
    (level != null ? `<i class="lv">${level}</i>` : '') +
    `</span>`
  );
}

export const amount = (n, cls = '') => `<span class="amt ${cls}">${icon('supplies')}<b>${fmtNum(n)}</b></span>`;
export const power = (n, cls = '') => `<span class="pw ${cls}">${icon('power')}<b>${Math.round(n)}</b></span>`;
export const rarityTag = (id) => `<span class="rtag r-${CAST[id].rarity}">${RARITIES[CAST[id].rarity].name}</span>`;
export const classTag = (id) => `<span class="ctag" style="--cls:${CLASSES[CAST[id].cls].color}">${CLASSES[CAST[id].cls].name}</span>`;

/** The token bar under a survivor: tokens / needed, green and READY when full. */
export function tokenBar(info, { compact = false } = {}) {
  if (info.max) return `<span class="tk max"><i style="width:100%"></i><em>MAX</em></span>`;
  const t = Math.min(1, info.tokens / info.need);
  return `<span class="tk${info.ready ? ' full' : ''}${compact ? ' compact' : ''}"><i style="width:${Math.round(t * 100)}%"></i><em>${info.tokens}/${info.need}</em></span>`;
}

/** ★★☆ */
export function stars(n, of = 3, cls = '') {
  let out = '';
  for (let i = 0; i < of; i++) out += icon(i < n ? 'star' : 'starOff');
  return `<span class="stars ${cls}">${out}</span>`;
}

// --- Toasts ----------------------------------------------------------------------------------

export class Toasts {
  constructor(root) {
    this.root = root;
  }

  show(html, { ms = 2200, cls = '' } = {}) {
    const el = document.createElement('div');
    el.className = `toast ${cls}`;
    el.innerHTML = html;
    this.root.appendChild(el);
    while (this.root.children.length > 3) this.root.firstChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
    }, ms);
  }
}

// --- Sheets ----------------------------------------------------------------------------------

/**
 * One sheet at a time over the camp. open(render) draws render() into a card;
 * refresh() draws it again after an action. Taps on [data-act] go to onAct;
 * a tap on the dark around the card (or [data-act="close"]) closes it.
 */
export class Sheets {
  constructor(root, { onAct, onOpen, onClose }) {
    this.root = root;
    this.onAct = onAct;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.cur = null;
    this.lockUntil = 0;
    root.addEventListener('click', (e) => this._click(e));
  }

  get isOpen() {
    return !!this.cur;
  }

  /** Ignore taps for a moment (a button that appears where the tapped one was). */
  hold(ms = 280) {
    this.lockUntil = performance.now() + ms;
  }

  open(render, { cls = '', modal = false, key = '' } = {}) {
    const was = this.cur;
    this.cur = { render, cls, modal, key };
    this.root.innerHTML = `<div class="sheet-back${modal ? ' modal' : ''}"><div class="sheet ${cls}" role="dialog">${render()}</div></div>`;
    this.root.classList.add('open');
    this.hold(was ? 120 : 260);
    if (!was && this.onOpen) this.onOpen();
  }

  refresh() {
    if (!this.cur) return;
    const card = this.root.querySelector('.sheet');
    if (!card) return;
    const scroller = card.querySelector('.scroll');
    const top = scroller ? scroller.scrollTop : 0;
    card.innerHTML = this.cur.render();
    const again = card.querySelector('.scroll');
    if (again) again.scrollTop = top;
  }

  close() {
    if (!this.cur) return;
    this.cur = null;
    this.root.classList.remove('open');
    this.root.innerHTML = '';
    if (this.onClose) this.onClose();
  }

  _click(e) {
    if (!this.cur) return;
    if (performance.now() < this.lockUntil) return;
    const b = e.target.closest('[data-act]');
    if (b && this.root.contains(b)) {
      if (b.disabled || b.classList.contains('off')) return;
      if (b.dataset.act === 'close') return this.close();
      this.onAct(b.dataset.act, b.dataset, b);
      return;
    }
    if (!e.target.closest('.sheet') && !this.cur.modal) this.close();
  }
}
