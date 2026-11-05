// The Shop tab: the free daily gift, three daily card offers for gold, the
// wardrobe (army colours and a hat per unit type, bought with Jellybeans,
// with a live wobbly preview) and the Supporter Pack card (cosmetic only, not
// connected to payments). No real money anywhere.

import { h, icon, coin, bean, fmt, fmtTime, clamp, canvas, cardCanvas, cardW, unitIcon, hatIcon, CARDS, RARITIES, HATS, COLORS } from './hub-kit.js';
import { shopToday, claimFree, buyOffer, msToRestock } from '../meta/shop.js';
import { HAT_UNITS, buyItem, equipColor, equipHat, armyPalette } from '../meta/cosmetics.js';
import { UNIT_TYPES } from '../sim/unit-types.js';
import { Battle, DT } from '../sim/battle.js';
import { UnitRenderer } from '../render/units.js';

const CONFIRM_MS = 450; // the confirming tap must come this long after the first (a double tap is not a yes)

export function createShopScreen(H) {
  const P = H.P;
  const el = h('section', { class: 'hb-screen hb-shop' });
  const ui = { confirm: null, confirmAt: 0, confirmT: 0, wdUnit: 'clubber', wdTab: 'hats', wdConfirm: null, wdConfirmAt: 0, preview: null, previewT: 0 };
  const daily = h('div', { class: 'hb-sec hb-daily' });
  const wardrobe = h('div', { class: 'hb-sec hb-wardrobe' });
  const support = h('div', { class: 'hb-sec hb-support' });
  const timer = h('b', {}, '');
  el.append(daily, wardrobe, support, h('p', { class: 'hb-fine center' }, 'Everything here is paid with gold or Jellybeans you earn by playing. No real money, ever.'));

  // --- daily shop -------------------------------------------------------------------------------
  function renderDaily() {
    const day = P.shop.day;
    const s = shopToday(P, H.now());
    if (P.shop.day !== day) H.persist(); // a new day began
    const w = cardW(0.17, 54, 90);
    daily.innerHTML = '';
    timer.textContent = fmtTime(msToRestock(H.now()));
    daily.append(h('div', { class: 'hb-sec-head' }, h('h3', {}, 'Daily Shop'), h('span', { class: 'hb-timer' }, icon('clock'), 'New deals in ', timer)));
    const row = h('div', { class: 'hb-offers' });
    // The free gift
    const fr = s.free.reward;
    const art = h('div', { class: 'hb-offer-art' });
    if (fr.gold) art.append(h('span', { class: 'hb-coins big' }, coin(), coin(), coin()), h('b', { class: 'hb-offer-n' }, '+' + fmt(fr.gold)));
    else {
      const [id, n] = Object.entries(fr.cards || {})[0] || [];
      if (id) art.append(cardCanvas(id, w, { mini: true, palette: armyPalette(P), hats: P.equipped.hats }), h('b', { class: 'hb-offer-n' }, '×' + fmt(n)));
    }
    row.append(
      h(
        'div',
        { class: 'hb-offer free' + (s.free.claimed ? ' bought' : ' ready') },
        h('span', { class: 'hb-offer-tag' }, icon('gift'), 'FREE'),
        art,
        h('small', { class: 'hb-offer-name' }, 'Daily gift'),
        s.free.claimed
          ? h('span', { class: 'hb-sold' }, icon('check'), 'Back tomorrow')
          : h('button', { class: 'hb-btn green small', type: 'button', on: { click: H.tap(() => claimGift(), null) } }, 'Claim!'),
      ),
    );
    for (const o of s.offers) {
      const card = CARDS[o.cardId];
      let buy;
      if (o.bought) buy = h('span', { class: 'hb-sold' }, icon('check'), 'Sold');
      else if (ui.confirm === o.i) buy = h('button', { class: 'hb-btn primary small confirm', type: 'button', on: { click: H.tap(() => offerTap(o), null) } }, 'Buy? ', coin(), fmt(o.price));
      else buy = h('button', { class: 'hb-btn small price' + (P.gold < o.price ? ' poor' : ''), type: 'button', on: { click: H.tap(() => offerTap(o), null) } }, coin(), fmt(o.price));
      row.append(
        h(
          'div',
          { class: `hb-offer r-${o.rarity}` + (o.bought ? ' bought' : '') },
          h('span', { class: `hb-rarity r-${o.rarity}` }, RARITIES[o.rarity].name),
          h('div', { class: 'hb-offer-art' }, cardCanvas(o.cardId, w, { mini: true, palette: armyPalette(P), hats: P.equipped.hats }), h('b', { class: 'hb-offer-n' }, '×' + fmt(o.count))),
          h('small', { class: 'hb-offer-name' }, card ? card.name : o.cardId),
          buy,
        ),
      );
    }
    daily.append(row);
  }

  function claimGift() {
    const g = claimFree(P, H.now());
    if (!g) return;
    H.persist();
    renderDaily();
    H.refreshChrome();
    H.showRewards('DAILY GIFT', g, { title: 'Free, just for playing!' });
  }

  function offerTap(o) {
    if (o.bought) return;
    if (P.gold < o.price) {
      H.sfx('cardDenied');
      H.toast(`Need ${fmt(o.price - P.gold)} more gold: win matches and open chests to earn it`);
      return;
    }
    if (ui.confirm !== o.i) {
      ui.confirm = o.i; // two taps to buy: no accidental purchases
      ui.confirmAt = performance.now();
      clearTimeout(ui.confirmT);
      ui.confirmT = setTimeout(() => {
        ui.confirm = null;
        if (el.isConnected) renderDaily();
      }, 4000);
      H.sfx('ui');
      renderDaily();
      return;
    }
    if (performance.now() - ui.confirmAt < CONFIRM_MS) return;
    clearTimeout(ui.confirmT);
    ui.confirm = null;
    const r = buyOffer(P, o.i, H.now());
    if (typeof r === 'string') {
      H.sfx('cardDenied');
      H.toast(r === 'poor' ? 'Not enough gold' : 'Already bought today');
      renderDaily();
      return;
    }
    H.persist();
    H.sfx('coins', { pitch: 0.3 });
    renderDaily();
    H.refreshChrome();
    H.showRewards('DAILY SHOP', r, { title: 'Bought!' });
  }

  // --- wardrobe (ported from the campaign's) -------------------------------------------------------
  const wdCanvas = h('canvas', { class: 'hb-wd-canvas', on: { pointerdown: () => poke() } });
  const previewGfx = new UnitRenderer();

  function makePreview() {
    if (!HAT_UNITS.some((u) => u.id === ui.wdUnit)) ui.wdUnit = HAT_UNITS[0].id;
    try {
      const b = new Battle(17);
      b.hats.blue = { ...P.equipped.hats };
      const u = b.addUnit(ui.wdUnit, 'blue', 0, 0.5, 4242);
      u.lookX = 200;
      u.lookY = -60;
      for (let i = 0; i < 60; i++) b.step(DT);
      b.events.length = 0;
      ui.preview = { b, u, t: 0 };
    } catch {
      ui.preview = null;
    }
    ui.previewT = 1;
  }
  function poke() {
    const pv = ui.preview;
    if (!pv) return;
    for (const p of pv.u.parts) p.addVel((Math.random() - 0.5) * 120, -260 - Math.random() * 120, DT);
    pv.u.mouth = 0.6;
    pv.u.mouthKind = 'smile';
    H.sfx('place', { pitch: pv.u.voice });
  }
  function drawPreview(dt) {
    const pv = ui.preview;
    if (!pv || !wdCanvas.isConnected) return;
    const n = Math.min(8, Math.round(dt / DT));
    for (let i = 0; i < n; i++) pv.b.step(DT);
    pv.b.events.length = 0;
    pv.t += dt;
    const u = pv.u;
    // Keep the little model in the middle (it drifts when poked)
    if (Math.abs(u.hip.x) > 30) for (const p of u.parts) p.teleport(-u.hip.x * 0.05, 0);
    previewGfx.palettes.blue = armyPalette(P);
    const c = wdCanvas.getContext('2d');
    const W = wdCanvas.width;
    const height = u.ground - (u.head.y - u.R) + 30;
    const s = Math.min(W / 108, (W * 0.62) / height);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, W);
    c.fillStyle = 'rgba(58,40,22,0.18)';
    c.beginPath();
    c.ellipse(W / 2, W * 0.86, W * 0.3, W * 0.05, 0, 0, Math.PI * 2);
    c.fill();
    c.setTransform(s, 0, 0, s, W / 2 - u.hip.x * s, W * 0.86 - u.ground * s);
    previewGfx.drawUnit(c, u, pv.b, pv.t);
  }

  function renderWardrobe() {
    if (!HAT_UNITS.some((u) => u.id === ui.wdUnit)) ui.wdUnit = HAT_UNITS[0].id;
    const pal = armyPalette(P);
    const ps = Math.round(clamp((window.innerHeight || 390) * 0.4, 120, 220));
    const d = Math.min(2, window.devicePixelRatio || 1);
    wdCanvas.width = wdCanvas.height = Math.round(ps * d);
    wdCanvas.style.width = wdCanvas.style.height = ps + 'px';
    const picker = h('div', { class: 'hb-wd-units' });
    for (const u of HAT_UNITS) {
      const cv = canvas(40, 40);
      unitIcon(cv, u.id, { palette: pal, hat: P.equipped.hats[u.id] });
      picker.append(h('button', { class: 'hb-wd-unit' + (ui.wdUnit === u.id ? ' on' : ''), type: 'button', 'aria-label': u.name, on: { click: H.tap(() => ((ui.wdUnit = u.id), (ui.wdConfirm = null), makePreview(), renderWardrobe())) } }, cv));
    }
    const tabs = h('div', { class: 'hb-seg' });
    for (const [id, label] of [
      ['hats', 'Hats'],
      ['colors', 'Army colour'],
    ])
      tabs.append(h('button', { class: 'hb-seg-btn' + (ui.wdTab === id ? ' on' : ''), type: 'button', on: { click: H.tap(() => ((ui.wdTab = id), (ui.wdConfirm = null), renderWardrobe())) } }, label));
    const grid = h('div', { class: 'hb-wd-grid' });
    const items = ui.wdTab === 'hats' ? HATS : COLORS;
    for (const it of items) {
      const kind = ui.wdTab;
      const owned = P.owned[kind].includes(it.id);
      const equipped = kind === 'hats' ? P.equipped.hats[ui.wdUnit] === it.id : P.equipped.color === it.id;
      const cv = canvas(52, 52);
      if (kind === 'hats') hatIcon(cv, it.id, pal);
      else unitIcon(cv, ui.wdUnit, { palette: it.pal, hat: P.equipped.hats[ui.wdUnit] });
      let label;
      let cls = 'hb-buy';
      if (equipped) {
        label = ['Wearing ', icon('check')];
        cls += ' on';
      } else if (owned) label = 'Wear';
      else if (it.supporter) {
        label = [icon('heart'), 'Supporter'];
        cls += ' sup';
      } else if (ui.wdConfirm === it.id) {
        label = ['Buy? ', bean(), fmt(it.price)];
        cls += ' confirm';
      } else {
        label = [bean(), fmt(it.price)];
        cls += ' price' + (P.beans < it.price ? ' poor' : '');
      }
      grid.append(h('div', { class: 'hb-wd-item' + (equipped ? ' equipped' : '') }, cv, h('b', {}, it.name), h('button', { class: cls, type: 'button', on: { click: H.tap(() => tapItem(it), null) } }, label)));
    }
    const unitName = UNIT_TYPES[ui.wdUnit] ? UNIT_TYPES[ui.wdUnit].name : ui.wdUnit;
    wardrobe.innerHTML = '';
    wardrobe.append(
      h('div', { class: 'hb-sec-head' }, h('h3', {}, 'Wardrobe'), h('small', {}, 'Looks only: it never changes how you fight'), tabs),
      h(
        'div',
        { class: 'hb-wd-body' },
        h('div', { class: 'hb-wd-left' }, wdCanvas, h('small', { class: 'hb-wd-hint' }, ui.wdTab === 'hats' ? `Hat for your ${unitName}s · tap to make it hop` : 'Colour for your whole army'), picker),
        grid,
      ),
    );
    if (!ui.preview) makePreview();
  }

  function tapItem(it) {
    const kind = ui.wdTab;
    const owned = P.owned[kind].includes(it.id);
    if (!owned) {
      if (it.supporter) {
        H.sfx('ui');
        supporterCard();
        return;
      }
      if (P.beans < it.price) {
        H.sfx('cardDenied');
        H.toast(`Need ${fmt(it.price - P.beans)} more Jellybeans: claim badges and Trail rewards to earn them`);
        return;
      }
      if (ui.wdConfirm !== it.id) {
        ui.wdConfirm = it.id;
        ui.wdConfirmAt = performance.now();
        H.sfx('ui');
        renderWardrobe();
        return;
      }
      if (performance.now() - ui.wdConfirmAt < CONFIRM_MS) return;
      if (buyItem(P, kind, it) !== 'bought') return;
      H.sfx('cheer', { pitch: 0.6 });
    } else H.sfx('ui');
    ui.wdConfirm = null;
    if (kind === 'hats') equipHat(P, ui.wdUnit, it.id);
    else equipColor(P, it.id);
    H.persist();
    if (H.actions.applyPalette) H.actions.applyPalette();
    makePreview();
    renderWardrobe();
    H.refreshChrome();
  }

  // --- Supporter Pack ---------------------------------------------------------------------------------
  function renderSupport() {
    support.innerHTML = '';
    support.append(
      h(
        'button',
        { class: 'hb-support-card' + (P.supporter ? ' thanks' : ''), type: 'button', on: { click: H.tap(() => supporterCard()) } },
        icon('heart', 'big'),
        h('span', {}, h('b', {}, P.supporter ? 'Thank you, Supporter!' : 'Supporter Pack'), h('small', {}, 'Optional · cosmetic only: the Supporter Gold colour and the Royal Crown hat')),
        h('span', { class: 'hb-support-go' }, '›'),
      ),
    );
  }
  function supporterCard() {
    H.openModal(
      H.cardModal({
        kicker: 'OPTIONAL · COSMETIC ONLY',
        title: '♥ Supporter Pack',
        body: [
          h('p', {}, 'Wobble War is free, and everything that wins battles is earned by playing. If you enjoy it, the Supporter Pack is a thank-you: the Supporter Gold army colour and the Royal Crown hat. It changes how you look, never how you fight.'),
          h('p', { class: 'hb-fine' }, "Purchases aren't connected in this prototype, so there's nothing to buy yet."),
        ],
        buttons: [H.btn('Close', () => H.closeTop(), '', null)],
      }),
    );
  }

  function render() {
    renderDaily();
    renderWardrobe();
    renderSupport();
  }

  return {
    el,
    render,
    onHide() {
      ui.confirm = null;
      ui.wdConfirm = null;
      ui.preview = null;
    },
    tick(dt) {
      // The preview wobbles at ~30 fps: plenty for a menu, half the cost
      ui.previewT += dt;
      if (ui.previewT >= 1 / 30) {
        drawPreview(ui.previewT);
        ui.previewT = 0;
      }
    },
    second() {
      const ms = msToRestock(H.now());
      timer.textContent = fmtTime(ms);
      if (ms < 1500) setTimeout(() => el.isConnected && H.current() === 'shop' && renderDaily(), 1600); // midnight: new stock
    },
  };
}
