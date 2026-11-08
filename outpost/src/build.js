// The BUILD drawer: a short bottom sheet over the map with four tabs.
//   Buildings: your buildings (tap to move one) and kits waiting to land
//   Homes:     everyone, roof campers first (tap a name to lift their home)
//   Decor:     the box first, then every decoration (buy, or where to find it)
//   Paths:     Dirt, Planks, Brick and the Eraser (paint with a finger)
// It only renders and reports picks; main.js starts placing, lifting or painting.

import { BUILDINGS, BUILDING_ORDER, DECOR, DECOR_ORDER, KEEPSAKES, SETS, SET_ORDER, PATHS, PATH_ORDER, HOME_TIERS, CLASSES, ZONES } from './config.js';
import { tierOf } from './town.js';
import * as A from './art.js';
import { icon } from './icons.js';
import { face, name } from './kit.js';
import { esc } from './ui.js';

const TABS = [
  { id: 'buildings', name: 'Buildings', ico: 'build' },
  { id: 'homes', name: 'Homes', ico: 'home' },
  { id: 'decor', name: 'Decor', ico: 'set' },
  { id: 'paths', name: 'Paths', ico: 'path' },
];

const thumb = (art) => `<span class="thumb">${art && art.svg ? art.svg : ''}</span>`;

export class BuildDrawer {
  constructor(root, meta, onPick) {
    this.root = root;
    this.meta = meta;
    this.onPick = onPick;
    this.tab = 'decor';
    this.isOpen = false;
    this.paint = null;
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b || b.disabled) return;
      const d = b.dataset;
      if (d.pick === 'tab') {
        const leave = this.paint !== null && d.tab !== 'paths';
        this.tab = d.tab;
        if (leave) return this.onPick('paintdone', d, b); // main ends painting and re-renders
        this.render();
        return;
      }
      this.onPick(d.pick, d, b);
    });
  }

  open(tab = null) {
    if (tab) this.tab = tab;
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

  /** Hide for a moment (while placing) without forgetting the tab. */
  hide(on) {
    this.root.classList.toggle('away', !!on);
    document.body.classList.toggle('drawer-open', this.isOpen && !on);
  }

  render() {
    if (!this.isOpen) return;
    const m = this.meta;
    const s = m.s;
    if (this.tab === 'decor') m.boxLooked(); // the box has been seen (before the tab dots are drawn)
    const n = m.lotCount();
    const cap = m.landCap();
    const cz = m.capZone();
    const head = `<div class="dr-head"><span class="land">${A.townIcon('lot')}Land <b>${n}/${cap}</b>${n >= cap && cz ? ` · Zone ${cz} opens more` : n >= cap && m.nextLandAt() ? ` · next lot at ${m.nextLandAt()} Skulls` : ''}</span>` + `<span class="tabs">${TABS.map((t) => `<button type="button" class="tab${t.id === this.tab ? ' on' : ''}" data-pick="tab" data-tab="${t.id}">${A.townIcon(t.ico)}<b>${t.name}</b>${this._tabDot(t.id) ? '<i class="dot"></i>' : ''}</button>`).join('')}</span>` + `<button type="button" class="dr-x" data-pick="close" aria-label="Close">${icon('close')}</button></div>`;
    let body = '';
    if (this.tab === 'buildings') body = this._buildings();
    else if (this.tab === 'homes') body = this._homes();
    else if (this.tab === 'decor') body = this._decor();
    else body = this._paths();
    this.root.innerHTML = `<div class="dr-in">${head}<div class="dr-row scroll-x">${body}</div></div>`;
    void s;
  }

  _tabDot(id) {
    const m = this.meta;
    if (id === 'buildings') return m.s.kits.some((k) => k.kind === 'building');
    if (id === 'homes') return m.campers().length > 0;
    if (id === 'decor') return m.boxHasNew() || m.s.kits.some((k) => k.kind !== 'building');
    return false;
  }

  _buildings() {
    const m = this.meta;
    const s = m.s;
    let out = '';
    s.kits.forEach((k, i) => {
      if (k.kind !== 'building') return;
      out += `<button type="button" class="card kit" data-pick="kit" data-i="${i}">${thumb(A.building(k.ref, 1, s.town))}<b>${esc(BUILDINGS[k.ref].name)}</b><em class="new">Place it!</em></button>`;
    });
    for (const id of BUILDING_ORDER) {
      const o = s.objects.find((x) => x.kind === 'building' && x.ref === id);
      const B = BUILDINGS[id];
      if (!o) {
        if (!s.kits.some((k) => k.ref === id)) out += `<button type="button" class="card locked" disabled>${thumb(A.building(id, 1, s.town))}<b>${esc(B.name)}</b><em>${icon('lock')}Zone ${B.zone}</em></button>`;
        continue;
      }
      out += `<button type="button" class="card" data-pick="lift" data-id="${o.id}">${thumb(A.building(id, s.buildings[id], s.town))}<b>${esc(B.name)}</b><em>Lv ${s.buildings[id]} · ${A.townIcon('move')}Move</em></button>`;
    }
    return out;
  }

  _homes() {
    const m = this.meta;
    const s = m.s;
    const campers = m.campers();
    const rest = s.people.filter((p) => !campers.includes(p)).sort((a, b) => m.inSquad(b.id) - m.inSquad(a.id) || b.level - a.level);
    let out = '';
    for (const p of [...campers, ...rest]) {
      const camp = campers.includes(p);
      const tier = HOME_TIERS[tierOf(p.level)];
      out += `<button type="button" class="card person${camp ? ' camper' : ''}" data-pick="home" data-id="${p.id}">${face(p, { size: 52 })}<b>${name(p)}</b><em>${camp ? `${A.townIcon('home')}On the roof` : `${esc(tier.name)}`}</em></button>`;
    }
    return out;
  }

  _decor() {
    const m = this.meta;
    const s = m.s;
    const wish = s.wish && s.wish.set ? s.wish.set : null;
    const counts = m.boxCounts();
    let out = '';
    // Kits (souvenirs, the statue) and the box first.
    s.kits.forEach((k, i) => {
      if (k.kind === 'building') return;
      const art = k.kind === 'souvenir' ? A.souvenir(k.ref, m.s.best) : A.statue(m.s.people.filter((p) => p.origin === 'founder').slice(0, 3));
      out += `<button type="button" class="card kit" data-pick="kit" data-i="${i}">${thumb(art)}<b>${k.kind === 'statue' ? "Founders' Statue" : 'Souvenir'}</b><em class="new">Place it!</em></button>`;
    });
    const shown = new Set();
    s.box.forEach((x, i) => {
      const key = `${x.kind}:${x.ref}${x.owner ? `:${x.owner}` : ''}`;
      if (shown.has(key)) return;
      shown.add(key);
      const set = x.kind === 'decor' ? DECOR[x.ref].set : null;
      const art = x.kind === 'decor' ? A.decor(x.ref) : x.kind === 'keepsake' ? A.keepsake(x.ref, (m.person(x.owner) || {}).first || '') : x.kind === 'souvenir' ? A.souvenir(x.ref, m.s.best) : A.statue(m.s.people.filter((p) => p.origin === 'founder').slice(0, 3));
      const owner = x.owner ? m.person(x.owner) : null;
      const label = x.kind === 'decor' ? DECOR[x.ref].name : x.kind === 'keepsake' ? `${owner ? `${name(owner)}'s ` : ''}${KEEPSAKES[x.ref].name}` : x.kind === 'souvenir' ? 'Souvenir' : "Founders' Statue";
      const n = x.owner ? 1 : counts[`${x.kind}:${x.ref}`] || 1;
      out += `<button type="button" class="card boxed${set && set === wish ? ' wished' : ''}" data-pick="unbox" data-i="${i}">${thumb(art)}${set ? `<span class="setb">${A.setBadge(set)}</span>` : ''}${set && set === wish ? `<span class="heart">${icon('heart')}</span>` : ''}<b>${label}</b><em>${A.townIcon('box')}×${n} in box</em></button>`;
    });
    // The catalogue, by set.
    for (const set of SET_ORDER) {
      for (const k of DECOR_ORDER) {
        const d = DECOR[k];
        if (d.set !== set) continue;
        const c = m.canBuy(k);
        const wished = set === wish;
        let em;
        if (d.price == null) em = d.signature ? 'From a set lot' : 'Found in junk';
        else if (c.locked) em = `${icon('lock')}Zone ${d.zone}`;
        else em = `<span class="pr${s.coins < d.price ? ' short' : ''}">${icon('coin')}${d.price}</span>`;
        const can = d.price != null && !c.locked;
        out += `<button type="button" class="card${can ? '' : ' locked'}${wished ? ' wished' : ''}${d.rare ? ' rare' : ''}${d.signature ? ' sig' : ''}" data-pick="buy" data-k="${k}"${can ? '' : ' disabled'}>${thumb(A.decor(k))}<span class="setb">${A.setBadge(set)}</span>${wished ? `<span class="heart">${icon('heart')}</span>` : ''}<b>${esc(d.name)}</b><em>${em}</em></button>`;
      }
    }
    return out;
  }

  _paths() {
    const m = this.meta;
    let out = '';
    for (const id of PATH_ORDER) {
      const P = PATHS[id];
      const c = m.canPaint(id);
      const on = this.paint === id;
      out += `<button type="button" class="card path p-${id}${on ? ' on' : ''}${c.ok ? '' : ' locked'}" data-pick="paint" data-k="${id}"${c.ok ? '' : ' disabled'}><span class="swatch"></span><b>${esc(P.name)}</b><em>${c.ok ? 'Free' : `${icon('lock')}Zone ${P.zone}`}</em></button>`;
    }
    out += `<button type="button" class="card path eraser${this.paint === '' ? ' on' : ''}" data-pick="paint" data-k="">${A.townIcon('eraser')}<b>Eraser</b><em>Remove paths</em></button>`;
    if (this.paint !== null) out += `<button type="button" class="card done" data-pick="paintdone">${icon('check')}<b>Done</b></button>`;
    return out;
  }
}

export { TABS, SETS, CLASSES, ZONES };
