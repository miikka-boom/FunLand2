// The Trail tab: the Trophy Trail as a horizontal road (the phone is held
// sideways). Milestones show their reward and a Claim button once reached;
// arena gates are big banners in the arena's colour with the cards they
// unlock; a "you" pin marks your trophies. Opens scrolled to where you are.

import { h, icon, coin, bean, fmt, canvas, cardCanvas, hatIcon, hatById, CARDS, RARITIES, ARENAS, arenaLabel } from './hub-kit.js';
import { STARTER_DECK } from '../sim/cards.js';
import { trailStatus, claimTrail } from '../meta/ladder.js';
import { cardsUpTo } from '../meta/collection.js';
import { armyPalette } from '../meta/cosmetics.js';

export function createTrailScreen(H) {
  const P = H.P;
  const el = h('section', { class: 'hb-screen hb-trail' });
  const scroller = h('div', { class: 'hb-trail-scroll' });
  const headSub = h('small', {}, '');
  el.append(scroller, h('div', { class: 'hb-trail-head' }, h('h3', {}, 'Trophy Trail'), headSub));
  const ui = { keepScroll: null, claimAt: -1e9 };

  // Desktop: the mouse wheel scrolls sideways, and the road can be dragged
  scroller.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        scroller.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    },
    { passive: false },
  );
  let drag = null;
  scroller.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button === 0) drag = { x: e.clientX, left: scroller.scrollLeft, moved: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) drag.moved = true;
    scroller.scrollLeft = drag.left - dx;
  });
  window.addEventListener('pointerup', () => {
    if (drag && drag.moved) H.changed(); // a drag that ends on a button is not a tap
    drag = null;
  });

  function rewardBox(m) {
    const r = m.reward;
    const box = h('div', { class: 'hb-ms-reward' });
    if (r.cards) {
      const [id, n] = Object.entries(r.cards)[0];
      const card = CARDS[id];
      box.classList.add('r-' + (card ? card.rarity : 'common'));
      box.append(cardCanvas(id, 46, { mini: true, palette: armyPalette(P), hats: P.equipped.hats }), h('b', {}, '×' + fmt(n)), h('small', {}, card ? card.name : id));
    } else if (r.random) {
      box.classList.add('r-' + r.random);
      box.append(h('span', { class: `hb-mystery r-${r.random}` }, '?'), h('b', {}, '×' + fmt(r.n || 1)), h('small', {}, `Random ${RARITIES[r.random] ? RARITIES[r.random].name.toLowerCase() : ''}`));
    } else if (r.hat) {
      const cv = canvas(50, 50, 'hb-ms-hat');
      hatIcon(cv, r.hat, armyPalette(P));
      const hat = hatById(r.hat);
      box.classList.add('hat');
      box.append(cv, h('b', {}, 'Hat'), h('small', {}, hat ? hat.name : r.hat));
    } else {
      if (r.gold) box.append(h('span', { class: 'hb-coins' }, coin(), coin(), coin()), h('b', {}, '+' + fmt(r.gold)), r.beans ? null : h('small', {}, 'gold'));
      if (r.beans) box.append(r.gold ? null : h('span', { class: 'hb-beans' }, bean(), bean(), bean()), h('b', { class: 'beans' }, '+' + fmt(r.beans)), h('small', {}, r.gold ? 'gold + beans' : 'Jellybeans'));
    }
    return box;
  }

  function node(m) {
    const cls = ['hb-ms'];
    if (m.reached) cls.push('reached');
    if (m.claimed) cls.push('claimed');
    if (m.claimable) cls.push('claimable');
    let act;
    if (m.claimable) act = h('button', { class: 'hb-btn primary small hb-claim', type: 'button', on: { click: H.tap(() => claim(m.at), null) } }, 'Claim');
    else if (m.claimed) act = h('span', { class: 'hb-ms-done' }, icon('check'));
    else act = h('span', { class: 'hb-ms-locked' }, icon('lock'));
    return h('div', { class: cls.join(' '), 'data-at': m.at }, rewardBox(m), h('div', { class: 'hb-ms-act' }, act), h('span', { class: 'hb-ms-at' }, icon('trophy'), fmt(m.at)));
  }

  function gate(i) {
    const a = ARENAS[i];
    const reached = P.best >= a.trophies;
    const prev = i > 0 ? cardsUpTo(i - 1) : [];
    const ids = cardsUpTo(i).filter((id) => !prev.includes(id));
    const cards = h('div', { class: 'hb-gate-cards' });
    const mini = (id) => cardCanvas(id, 34, { mini: true, locked: !reached, palette: armyPalette(P), hats: P.equipped.hats });
    if (i === 0) {
      // The starter deck, and the Green Hills cards you find on the way
      const more = ids.filter((id) => !STARTER_DECK.includes(id));
      cards.append(h('small', {}, `${STARTER_DECK.length} starter cards${more.length ? ', then' : ''}`));
      if (more.length) cards.append(h('span', { class: 'hb-gate-row' }, ...more.map(mini)));
    } else if (ids.length) {
      // (five or six cards fan out in one row so the banner keeps its height)
      if (ids.length > 3) cards.classList.add('fan');
      for (const id of ids) cards.append(mini(id));
    }
    else cards.append(h('small', {}, 'The top of the trail!'));
    return h(
      'div',
      { class: 'hb-gate' + (reached ? ' reached' : ''), 'data-at': a.trophies, style: `--arena:${a.color}` },
      h('div', { class: 'hb-gate-flag' }, h('small', {}, arenaLabel(i)), h('b', {}, a.name), h('span', { class: 'hb-gate-state' }, reached ? (i ? 'Unlocked!' : 'Start') : `${fmt(a.trophies)} trophies`), cards),
      h('span', { class: 'hb-ms-at' }, icon('trophy'), fmt(a.trophies)),
    );
  }

  function render() {
    const keep = ui.keepScroll;
    ui.keepScroll = null;
    headSub.textContent = `Rewards for your best trophies (${fmt(P.best)}), yours to claim forever`;
    scroller.innerHTML = '';
    const fill = h('i', {});
    const track = h('div', { class: 'hb-trail-track' }, h('div', { class: 'hb-trail-line' }, fill));
    track.append(gate(0));
    for (const m of trailStatus(P)) {
      if (m.gate > 0) track.append(gate(m.gate));
      track.append(node(m));
    }
    track.append(h('div', { class: 'hb-trail-end' }, icon('crown'), h('small', {}, 'More arenas coming!')));
    const pin = h('div', { class: 'hb-you' }, h('span', { class: 'hb-you-tag' }, 'You ', icon('trophy'), fmt(P.trophies)));
    track.append(pin);
    scroller.append(track);
    requestAnimationFrame(() => layout(track, fill, pin, keep));
  }

  /** Put the pin and the line's fill at your trophies, then scroll there (or to a reward). */
  function layout(track, fill, pin, keep) {
    if (!track.isConnected) return;
    const pts = [];
    for (const n of track.querySelectorAll('[data-at]')) {
      const chip = n.querySelector('.hb-ms-at');
      pts.push({ at: +n.dataset.at, x: chip ? n.offsetLeft + chip.offsetLeft + chip.offsetWidth / 2 : n.offsetLeft + n.offsetWidth / 2 });
    }
    pts.sort((a, b) => a.at - b.at || a.x - b.x);
    const v = P.trophies;
    let x = pts.length ? pts[0].x : 0;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      if (v >= a.at) x = a.x;
      if (b && v >= a.at && v < b.at) {
        x = a.x + ((b.x - a.x) * (v - a.at)) / Math.max(1, b.at - a.at);
        break;
      }
    }
    const line = track.querySelector('.hb-trail-line');
    fill.style.width = Math.max(0, x - line.offsetLeft) + 'px';
    pin.style.left = x + 'px';
    if (keep != null) {
      scroller.scrollLeft = keep;
      return;
    }
    // Show the pin; with rewards waiting, show the first one too (it wins if both don't fit)
    const W = scroller.clientWidth;
    const m = 70;
    let left = x - W * 0.5;
    const first = track.querySelector('.hb-ms.claimable');
    if (first) {
      const fx = first.offsetLeft;
      const lo = x + m - W; // the pin at the right edge
      const hi = fx - 14; // the reward at the left edge
      left = lo <= hi ? Math.max(lo, Math.min(hi, x - W * 0.5)) : hi;
    }
    scroller.scrollLeft = Math.max(0, left);
  }

  function claim(at) {
    if (performance.now() - ui.claimAt < 450) return;
    const g = claimTrail(P, at);
    if (!g) return;
    ui.claimAt = performance.now();
    H.persist();
    ui.keepScroll = scroller.scrollLeft;
    render();
    H.refreshChrome();
    H.showRewards('TROPHY TRAIL', g, { title: `${fmt(at)} trophies reached!` });
  }

  return { el, render };
}
