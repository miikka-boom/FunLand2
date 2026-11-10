// The Cards tab: your deck of 8 (levels, copies, average mana, a word when it
// can't hit fliers) and the collection (owned, not found yet, locked by
// arena). Tapping a card opens its detail sheet: art, stats, copies, Upgrade
// (gold + copies) and Use (then tap a deck card to swap it in; tapping
// anywhere else cancels). Legendary faces shine (hub-kit tickSheens).

import { h, icon, coin, fmt, clamp, cardCanvas, cardW, cardStats, cardKindLine, arenaLabel, CARDS, RARITIES, ARENAS } from './hub-kit.js';
import { cardState, upgradeCard, swapIntoDeck, deckAvgMana, deckNeedsAir, ownedCards, unlockedCards, lockedCards, AIR_ANSWERS } from '../meta/collection.js';
import { armyPalette } from '../meta/cosmetics.js';

const UPGRADE_GUARD_MS = 450;

export function createCardsScreen(H) {
  const P = H.P;
  const el = h('section', { class: 'hb-screen hb-cards' });
  const ui = { swap: null, swapEntry: null, detail: null, upAt: -1e9, popSlot: -1 };
  const look = () => ({ palette: armyPalette(P), hats: P.equipped.hats });

  // Swap mode: a tap that is not on a deck card cancels it
  el.addEventListener('click', (e) => {
    if (!ui.swap || H.guarded()) return;
    if (!e.target.closest('.hb-deck-grid .hb-ctile')) {
      H.sfx('ui');
      cancelSwap();
    }
  });

  function bar(s) {
    if (s.maxed) return h('span', { class: 'hb-cbar max' }, h('i', { style: 'transform:scaleX(1)' }), h('span', {}, 'MAX'));
    const frac = clamp(s.count / Math.max(1, s.need), 0, 1);
    return h('span', { class: 'hb-cbar' + (s.ready ? ' full' : '') }, h('i', { style: `transform:scaleX(${frac.toFixed(3)})` }), s.canUpgrade ? icon('up') : null, h('span', {}, `${fmt(s.count)}/${fmt(s.need)}`));
  }

  function tile(id, w, slot = -1) {
    const s = cardState(P, id);
    if (!s) return null;
    const unfound = !s.owned && !s.locked;
    const cls = ['hb-ctile', 'r-' + s.rarity];
    if (s.locked) cls.push('locked');
    if (unfound) cls.push('unfound');
    if (s.canUpgrade) cls.push('can');
    if (slot === ui.popSlot && slot >= 0) cls.push('hb-pop');
    const art = cardCanvas(id, w, { mini: true, locked: s.locked, dim: unfound, ...look() });
    const label = s.locked ? h('span', { class: 'hb-ctile-lock' }, arenaLabel(s.arena)) : unfound ? h('span', { class: 'hb-ctile-lock' }, 'Not found') : null;
    return h(
      'button',
      { class: cls.join(' '), type: 'button', 'data-id': id, on: { click: H.tap(() => tileTap(id, slot), null) } },
      h('span', { class: 'hb-ctile-art' }, art, s.owned ? h('span', { class: 'hb-lv' }, `Lv ${s.level}`) : null, label),
      s.owned ? bar(s) : h('span', { class: 'hb-cbar none' }, h('span', {}, CARDS[id].name)),
    );
  }

  function tileTap(id, slot) {
    if (ui.swap) {
      if (slot >= 0) doSwap(slot);
      return;
    }
    H.sfx('cardPick');
    detail(id);
  }

  function render() {
    const w = cardW(0.163, 50, 108);
    el.innerHTML = '';
    el.classList.toggle('swapping', !!ui.swap);
    const avg = deckAvgMana(P);
    const deckGrid = h('div', { class: 'hb-deck-grid' });
    P.deck.forEach((id, i) => deckGrid.append(tile(id, w, i)));
    ui.popSlot = -1;
    let head;
    if (ui.swap) {
      const c = CARDS[ui.swap];
      head = h(
        'div',
        { class: 'hb-sec-head hb-swap-head' },
        cardCanvas(ui.swap, 28, { mini: true, ...look() }, 'hb-swap-cv'),
        h('span', {}, 'Tap a deck card to swap in ', h('b', {}, c ? c.name : '')),
        h('button', { class: 'hb-btn small', type: 'button', on: { click: (e) => (e.stopPropagation(), H.sfx('ui'), cancelSwap()) } }, 'Cancel'),
      );
    } else head = h('div', { class: 'hb-sec-head' }, h('h3', {}, 'Battle Deck'), h('span', { class: 'hb-avg', title: 'Average mana cost' }, icon('drop'), h('b', {}, avg.toFixed(1)), h('small', {}, 'avg')));
    const deck = h('div', { class: 'hb-deck' }, head, deckGrid);

    const owned = ownedCards(P).filter((id) => !P.deck.includes(id));
    const unfound = unlockedCards(P).filter((id) => !P.cards[id]);
    const locked = lockedCards(P);
    const total = Object.keys(CARDS).length;
    // (next to the cards that could fix it: nothing in the deck hits fliers)
    const airWarn = !ui.swap && deckNeedsAir(P) ? h('button', { class: 'hb-air-warn', type: 'button', on: { click: H.tap(() => airTip()) } }, h('i', { 'aria-hidden': 'true' }, '!'), 'No air answer in this deck') : null;
    const coll = h('div', { class: 'hb-coll' }, h('div', { class: 'hb-sec-head' }, h('h3', {}, 'Collection'), h('small', {}, `${ownedCards(P).length}/${total} found`), airWarn));
    const grid = (ids) => h('div', { class: 'hb-coll-grid' }, ...ids.map((id) => tile(id, w)));
    if (owned.length) coll.append(grid(owned));
    else coll.append(h('p', { class: 'hb-empty' }, unfound.length ? 'All your cards are in your deck. Open chests to find more!' : 'All your cards are in your deck.'));
    if (unfound.length) coll.append(h('div', { class: 'hb-sec-sub' }, 'Not found yet · they drop from chests and the shop'), grid(unfound));
    if (locked.length) {
      const next = ARENAS.find((a) => a.trophies > P.best);
      coll.append(h('div', { class: 'hb-sec-sub' }, next ? `Locked · reach ${next.name} (${fmt(next.trophies)} trophies) to unlock more` : 'Locked'), grid(locked));
    }
    el.append(deck, coll);
  }

  /** Which cards hit fliers high up (the ones unlocked so far). */
  function airTip() {
    const ids = AIR_ANSWERS.filter((id) => !cardState(P, id).locked);
    const w = cardW(0.13, 40, 64);
    H.openModal(
      H.cardModal({
        kicker: 'NO AIR ANSWER',
        title: 'Fliers are about!',
        body: [
          h('p', {}, 'Fliers float over the beans on the ground: clubs and swords can\'t reach them up there. Your towers can, and so can these cards:'),
          h('div', { class: 'hb-air-cards' }, ...ids.map((id) => h('span', { class: 'hb-air-card' + (P.cards[id] ? '' : ' unfound') }, cardCanvas(id, w, { mini: true, dim: !P.cards[id], ...look() }), h('small', {}, CARDS[id].name)))),
        ],
        buttons: [H.btn('OK', () => H.closeTop(), 'primary', null)],
        cls: 'hb-air-modal',
      }),
    );
  }

  // --- swapping a card into the deck -------------------------------------------------------
  function startSwap(id) {
    ui.swap = id;
    // (closed by the back button or Escape: draw the screen without the swap header again)
    ui.swapEntry = H.openModal(null, { onClose: () => endSwap(true) });
    render();
  }
  function endSwap(rerender = true) {
    ui.swap = null;
    ui.swapEntry = null;
    if (rerender) render();
  }
  function cancelSwap() {
    if (!ui.swap) return;
    const e = ui.swapEntry;
    ui.swap = null;
    ui.swapEntry = null;
    if (e) H.closeEntry(e, true);
    render();
  }
  function doSwap(slot) {
    const id = ui.swap;
    if (!id) return;
    if (swapIntoDeck(P, id, slot)) {
      H.persist();
      H.sfx('cardPick');
      H.haptic(15);
      ui.popSlot = slot;
    }
    cancelSwap();
  }

  // --- detail sheet ---------------------------------------------------------------------------
  function detail(id) {
    const box = h('div', { class: 'hb-backdrop' });
    const d = { id, box, entry: null, leveled: false };
    d.render = () => {
      box.innerHTML = '';
      box.append(sheet(d));
    };
    d.render();
    d.entry = H.openModal(box, { refresh: () => d.render(), onClose: () => (ui.detail = null) });
    ui.detail = d;
  }

  function reason(s) {
    if (s.maxed) return 'Max level!';
    if (!s.ready) {
      const n = s.need - s.count;
      return `Collect ${fmt(n)} more ${n === 1 ? 'copy' : 'copies'} to upgrade`;
    }
    if (P.gold < s.gold) return `Need ${fmt(s.gold - P.gold)} more gold`;
    return '';
  }

  function sheet(d) {
    const s = cardState(P, d.id);
    const card = s.card;
    const rar = RARITIES[s.rarity];
    const unfound = !s.owned && !s.locked;
    const aw = Math.round(clamp((window.innerHeight || 390) * 0.4, 110, 210));
    const art = cardCanvas(d.id, aw, { level: s.owned ? s.level : 0, name: true, locked: s.locked, dim: unfound, ...look() });
    const artBox = h('div', { class: 'hb-detail-art' + (d.leveled ? ' leveled' : '') }, d.leveled ? h('span', { class: 'hb-rays' }) : null, art, d.leveled ? h('b', { class: 'hb-lvup' }, `Level ${s.level}!`) : null);
    const main = h(
      'div',
      { class: 'hb-detail-main' },
      h('div', { class: 'hb-detail-head' }, h('h3', {}, card.name), h('span', { class: `hb-rarity r-${s.rarity}` }, rar.name), h('span', { class: 'hb-mana', title: 'Mana cost' }, icon('drop'), h('b', {}, card.mana))),
      h('small', { class: 'hb-detail-kind' }, cardKindLine(card)),
      h('p', { class: 'hb-detail-desc' }, card.desc),
    );
    if (s.owned) {
      const frac = s.maxed ? 1 : clamp(s.count / Math.max(1, s.need), 0, 1);
      main.append(
        h(
          'div',
          { class: 'hb-copies' },
          h('small', {}, s.maxed ? `Level ${s.level} · max` : `Level ${s.level} → ${s.level + 1}`),
          h('span', { class: 'hb-bar' + (s.ready || s.maxed ? ' full' : '') }, h('i', { style: `transform:scaleX(${frac.toFixed(3)})` }), h('span', {}, s.maxed ? `${fmt(s.count)} spare` : `${fmt(s.count)} / ${fmt(s.need)} copies`)),
        ),
      );
    }
    const rows = cardStats(d.id, Math.max(1, s.level));
    const showNext = s.owned && s.ready && !s.maxed;
    main.append(h('div', { class: 'hb-stats' }, ...rows.map((r) => h('div', { class: 'hb-stat' }, h('small', {}, r.label), h('b', {}, String(r.value)), showNext && r.next != null ? h('em', {}, '→ ' + r.next) : null))));
    const acts = h('div', { class: 'hb-detail-actions' });
    if (s.owned && !s.maxed) {
      acts.append(
        h(
          'button',
          { class: 'hb-btn primary big hb-upgrade' + (s.canUpgrade ? ' go' : ' off'), type: 'button', 'aria-disabled': s.canUpgrade ? 'false' : 'true', on: { click: H.tap(() => doUpgrade(d), null) } },
          h('span', {}, 'Upgrade'),
          h('span', { class: 'hb-cost' + (P.gold < s.gold ? ' poor' : '') }, coin(), fmt(s.gold)),
        ),
      );
    }
    if (s.owned && !s.inDeck) acts.append(H.btn('Use', () => (H.closeEntry(d.entry), startSwap(d.id)), 'blue big'));
    else if (s.inDeck) acts.append(h('span', { class: 'hb-indeck' }, icon('check'), 'In your deck'));
    // (the hint goes after both buttons and wraps beside them: on a short phone a Use
    // button pushed onto a line of its own falls off the bottom of the sheet)
    const why = s.owned && !s.maxed ? reason(s) : '';
    if (why) acts.append(h('small', { class: 'hb-why' }, why));
    if (s.locked) {
      const a = ARENAS[s.arena];
      acts.append(h('p', { class: 'hb-why' }, icon('lock'), `Unlocks in ${a.name} (${arenaLabel(s.arena)}) at ${fmt(a.trophies)} trophies.`));
    } else if (unfound) acts.append(h('p', { class: 'hb-why' }, 'Not found yet: it can drop from chests and the shop.'));
    main.append(acts);
    const x = h('button', { class: 'hb-x', type: 'button', 'aria-label': 'Close', on: { click: H.tap(() => H.closeEntry(d.entry)) } }, icon('close'));
    return h('div', { class: `hb-sheet hb-detail r-${s.rarity}` }, x, artBox, main);
  }

  function doUpgrade(d) {
    if (performance.now() - ui.upAt < UPGRADE_GUARD_MS) return;
    const s = cardState(P, d.id);
    if (!s.canUpgrade) {
      H.sfx('cardDenied');
      H.toast(reason(s) || 'Not yet');
      return;
    }
    const r = upgradeCard(P, d.id);
    if (!r.ok) return;
    ui.upAt = performance.now();
    H.persist();
    H.sfx('upgrade');
    H.haptic(30);
    d.leveled = true;
    d.render();
    render();
    H.refreshChrome();
    if ((P.tutorial | 0) === 2) H.setTutorial(3);
    if (r.kingAfter > r.kingBefore) setTimeout(() => H.kingUp(r.kingAfter), 1100);
  }

  return {
    el,
    render,
    detail,
    cancelSwap,
    onHide() {
      cancelSwap();
    },
  };
}
