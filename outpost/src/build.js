// The BUILD drawer: one row over the bottom of the map. A new home first
// (someone new moves in), then every decoration, cheapest first. Tap one to
// place it. It only renders and reports picks; main.js starts placing.

import { DECOR, DECOR_ORDER } from './config.js';
import * as A from './art.js';
import { icon } from './icons.js';
import { esc } from './ui.js';

const thumb = (art) => `<span class="thumb">${art && art.svg ? art.svg : ''}</span>`;

/** A tent with a "?" over it: who moves in is a surprise. */
export const NOBODY = { id: 0, first: '?', cls: 'tinker', rarity: 'rookie', level: 1, golden: false, look: { hat: 'none', prop: 0 } };
function homeThumb() {
  return `<span class="thumb home">${A.home(NOBODY, 'tent').svg}<i class="q">?</i></span>`;
}

export class BuildDrawer {
  constructor(root, town, onPick) {
    this.root = root;
    this.town = town;
    this.onPick = onPick;
    this.isOpen = false;
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b || b.disabled) return;
      this.onPick(b.dataset.pick, b.dataset, b);
    });
  }

  open() {
    this.isOpen = true;
    this.root.classList.remove('away');
    this.root.classList.add('open');
    document.body.classList.add('drawer-open');
    this.render();
  }

  close() {
    this.isOpen = false;
    this.root.classList.remove('open', 'away');
    document.body.classList.remove('drawer-open');
  }

  /** Hide for a moment (while placing) without closing. */
  hide(on) {
    this.root.classList.toggle('away', !!on);
    document.body.classList.toggle('drawer-open', this.isOpen && !on);
  }

  /** The element for a pick (the hint points at the new home). */
  cardEl(kind) {
    return this.root.querySelector(kind === 'home' ? '[data-pick="home"]' : `[data-pick="decor"][data-k="${kind}"]`);
  }

  render() {
    if (!this.isOpen) return;
    const m = this.town;
    const coins = m.s.coins;
    const h = m.canBuildHome();
    const price = (p) => `<em class="pr${coins < p ? ' short' : ''}">${icon('coin')}${p}</em>`;
    let row = `<button type="button" class="card newhome${h.ok ? ' can' : ''}" data-pick="home">${homeThumb()}<b>New home</b>${h.room === false ? '<em class="room">No room</em>' : price(h.price)}</button>`;
    for (const k of DECOR_ORDER) {
      const d = DECOR[k];
      row += `<button type="button" class="card${coins >= d.price ? ' can' : ''}" data-pick="decor" data-k="${k}">${thumb(A.decoration(k))}<b>${esc(d.name)}</b>${price(d.price)}</button>`;
    }
    this.root.innerHTML = `<div class="dr-in"><div class="dr-head"><b class="dr-t">${A.townIcon('build')}Build</b><span class="dr-hint">A new home brings someone new. Decorations are just for fun.</span><button type="button" class="dr-x" data-pick="close" aria-label="Close">${icon('close')}</button></div><div class="dr-row scroll-x">${row}</div></div>`;
  }
}
