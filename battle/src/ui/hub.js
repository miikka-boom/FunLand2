// The hub: everything outside a match. A top bar (King Level, gold,
// Jellybeans, settings), five tabs (Shop · Cards · Battle · Trail · More) and
// the modals on top (chest opening, card details, rewards, celebrations,
// notices). Plain DOM; the game itself stays in main.js, which draws a live
// bot-vs-bot match on the canvas behind the Battle tab (its middle stays
// see-through) and calls back through deps.actions.
//
//   const hub = createHub({ profile, persist, audio, now, onShow, actions });
//   hub.show('battle'); ... hub.tick(dt) every frame while it is open.
//
// The profile is mutated in place by the meta modules; every change here is
// followed by persist().

import { h, icon, coin, bean, fmt, fmtShort, fmtTime, clamp, canvas, cardCanvas, cardW, rewardView, ARENAS, CARDS } from './hub-kit.js';
import { drawChest } from '../render/chests.js';
import { chestState, readyChests } from '../meta/chests.js';
import { arenaProgress, arenaIndex, claimableTrail } from '../meta/ladder.js';
import { kingInfo, upgradableCount } from '../meta/collection.js';
import { claimableBadges } from '../meta/badges.js';
import { shopToday } from '../meta/shop.js';
import { popNotice } from '../meta/profile.js';
import { createChestOpener } from './chest-open.js';
import { createCardsScreen } from './cards-screen.js';
import { createTrailScreen } from './trail-screen.js';
import { createShopScreen } from './shop-screen.js';
import { createMoreScreen } from './more-screen.js';

const TABS = ['shop', 'cards', 'battle', 'trail', 'more'];
const TAB_INFO = { shop: ['shop', 'Shop'], cards: ['cards', 'Cards'], battle: ['battle', 'Battle'], trail: ['trail', 'Trail'], more: ['more', 'More'] };
// A screen or modal that just appeared ignores taps for this long: the second
// tap of a double tap must not hit whatever is now under the finger.
const GUARD_MS = 380;
const CHEST_FPS = 15;

export function createHub(deps) {
  const P = deps.profile;
  const { persist, audio, actions } = deps;
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const root = h('div', { id: 'hub-root', class: 'hb hidden' });
  document.body.appendChild(root);

  const ui = {
    open: false,
    tab: 'battle',
    changedAt: -1e9,
    stack: [], // open modals, top last: { el, onClose, refresh }
    tweens: new Map(),
    secT: 1,
    t: 0,
    noticeOpen: false,
    shown: { gold: P.gold, beans: P.beans },
    trophyShown: null, // trophies the banner shows while it counts
    hiding: false,
    later: [], // shows waiting for the modals to clear (a celebration never lands on a chest show)
  };

  // --- small helpers ------------------------------------------------------------------
  const sfx = (name, o) => {
    try {
      if (audio && audio.play) audio.play(name, o);
    } catch {
      // never let a sound break the menu
    }
  };
  const haptic = (ms = 15) => {
    try {
      if (P.settings && P.settings.haptics && navigator.vibrate) navigator.vibrate(ms);
    } catch {
      // not supported
    }
  };
  const changed = () => (ui.changedAt = performance.now());
  const guarded = () => performance.now() - ui.changedAt < GUARD_MS;
  /** A click handler that ignores the tail of a double tap and clicks once. */
  const tap = (fn, sound = 'ui') => (e) => {
    if (guarded()) return;
    if (sound) sfx(sound);
    fn(e);
  };

  /** Animate a number: set(v) gets called each tick until `to`. Keyed: a new one replaces the old. */
  function tween(key, from, to, dur, set, opts = {}) {
    ui.tweens.set(key, { from, to, t: -(opts.delay || 0), dur: Math.max(0.01, dur), set, step: opts.step || null, steps: 0, done: opts.done || null });
    set(from);
  }
  function runTweens(dt) {
    for (const [key, tw] of ui.tweens) {
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = Math.min(1, tw.t / tw.dur);
      const e = 1 - (1 - k) ** 3;
      tw.set(tw.from + (tw.to - tw.from) * e);
      if (tw.step) {
        const n = Math.floor(k * 5);
        if (n > tw.steps) {
          tw.steps = n;
          tw.step(k);
        }
      }
      if (k >= 1) {
        ui.tweens.delete(key);
        if (tw.done) tw.done();
      }
    }
  }
  function flushTweens() {
    for (const tw of ui.tweens.values()) {
      tw.set(tw.to);
      if (tw.done) tw.done();
    }
    ui.tweens.clear();
  }
  /** Restart a CSS animation class on an element (pops, bumps). */
  function pop(el, cls = 'hb-pop') {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  // --- toast ----------------------------------------------------------------------------
  const toastEl = h('div', { class: 'hb-toast', role: 'status' });
  let toastT = 0;
  function toast(text, kind = '') {
    toastEl.textContent = text;
    toastEl.className = 'hb-toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  // --- modals ---------------------------------------------------------------------------
  function notify() {
    if (!deps.onShow || ui.hiding) return;
    try {
      deps.onShow(!ui.open ? null : ui.stack.length ? 'modal' : 'hub');
    } catch {
      // main's problem, not the menu's
    }
  }
  /**
   * Put a modal on top. el may be null for a modal *state* (e.g. picking a
   * deck slot): it still takes the back button. Returns the entry.
   */
  function openModal(el, opts = {}) {
    const entry = { el, onClose: opts.onClose || null, refresh: opts.refresh || null };
    if (el) {
      el.classList.add('hb-modal');
      if (opts.backdrop !== false)
        el.addEventListener('click', (e) => {
          if (e.target === el && !guarded() && ui.stack[ui.stack.length - 1] === entry) {
            sfx('ui');
            closeEntry(entry);
          }
        });
      root.append(el);
    }
    ui.stack.push(entry);
    changed();
    notify();
    return entry;
  }
  function closeEntry(entry, silent = false) {
    const i = ui.stack.indexOf(entry);
    if (i < 0) return;
    ui.stack.splice(i, 1);
    if (entry.el) entry.el.remove();
    changed();
    if (entry.onClose && !silent) entry.onClose();
    notify();
    if (!ui.stack.length) {
      refreshChrome();
      renderTutorial();
      if (ui.later.length) setTimeout(runLater, 200);
    }
  }
  /** Run fn now if no modal is up, else once they have all closed. */
  function whenFree(fn) {
    ui.later.push(fn);
    if (!ui.stack.length) runLater();
  }
  function runLater() {
    if (!ui.open || ui.stack.length) return;
    const fn = ui.later.shift();
    if (fn) fn();
  }
  const closeTop = () => (ui.stack.length ? (closeEntry(ui.stack[ui.stack.length - 1]), true) : false);

  /** A parchment card modal: kicker, title, body nodes, buttons. */
  function cardModal({ kicker, title, body = [], buttons = [], cls = '' }) {
    const card = h('div', { class: 'hb-card-modal ' + cls }, kicker ? h('div', { class: 'hb-kicker' }, kicker) : null, title ? h('h3', {}, title) : null, ...body);
    if (buttons.length) card.append(h('div', { class: 'hb-row' }, ...buttons));
    return h('div', { class: 'hb-backdrop' }, card);
  }
  const btn = (label, fn, cls = '', sound = 'ui') => h('button', { class: 'hb-btn ' + cls, type: 'button', on: { click: tap(fn, sound) } }, label);

  // --- top bar --------------------------------------------------------------------------
  const kingRing = h('span', { class: 'hb-king-ring' });
  const kingLv = h('b', { class: 'hb-king-lv' }, '1');
  const nameEl = h('b', { class: 'hb-name' }, '');
  const kingSub = h('small', {}, '');
  const kingBtn = h('button', { class: 'hb-king', type: 'button', 'aria-label': 'King Level', on: { click: tap(() => kingSheet()) } }, h('span', { class: 'hb-king-badge' }, kingRing, icon('crown', 'hb-king-crown'), kingLv), h('span', { class: 'hb-who' }, nameEl, kingSub));
  const goldNum = h('b', {}, '0');
  const beanNum = h('b', {}, '0');
  const goldPill = h('button', { class: 'hb-pill gold', type: 'button', 'aria-label': 'Gold', on: { click: tap(() => toast('Gold: for card upgrades and shop cards. Earned from matches, chests, the Trail and badges.')) } }, h('span', { class: 'hb-pill-in' }, coin(), goldNum));
  const beanPill = h('button', { class: 'hb-pill beans', type: 'button', 'aria-label': 'Jellybeans', on: { click: tap(() => toast('Jellybeans: for army colours and hats only. Earned from badges, the Trail and Big Chests.')) } }, h('span', { class: 'hb-pill-in' }, bean(), beanNum));
  const top = h('header', { class: 'hb-top' }, kingBtn, h('span', { class: 'hb-spacer' }), goldPill, beanPill, fullscreenBtn(), h('button', { class: 'hb-iconbtn', type: 'button', 'aria-label': 'Settings', on: { click: tap(() => (more.section('settings'), switchTab('more'))) } }, icon('gear')));

  // Full screen hides the browser bars on Android (iPhone Safari has no API: install instead)
  function fullscreenBtn() {
    const de = document.documentElement;
    const req = de.requestFullscreen || de.webkitRequestFullscreen;
    const standalone = window.matchMedia && window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
    if (!req || standalone) return null;
    const go = () => {
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else {
          const p = req.call(de, { navigationUI: 'hide' });
          if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
        }
      } catch {
        // not allowed here: no harm done
      }
    };
    return h('button', { class: 'hb-iconbtn hb-full', type: 'button', 'aria-label': 'Full screen', on: { click: tap(go) } }, icon('full'));
  }

  function renderTop(snap) {
    const k = kingInfo(P);
    kingLv.textContent = String(k.level);
    const frac = k.max ? 1 : clamp((k.xp - k.from) / Math.max(1, k.need - k.from), 0, 1);
    kingRing.style.setProperty('--xp', (frac * 360).toFixed(1) + 'deg');
    nameEl.textContent = P.name || 'You';
    kingSub.textContent = k.max ? `King Level ${k.level} · max` : `King Level ${k.level} · ${fmt(k.xp - k.from)}/${fmt(k.need - k.from)} XP`;
    syncWallet(snap);
  }
  function syncWallet(snap) {
    for (const [key, el, pill] of [
      ['gold', goldNum, goldPill],
      ['beans', beanNum, beanPill],
    ]) {
      const to = P[key];
      if (snap || !ui.open) {
        ui.tweens.delete('w' + key);
        ui.shown[key] = to;
        el.textContent = fmtShort(to);
        continue;
      }
      const tw = ui.tweens.get('w' + key);
      if ((tw && tw.to === to) || (!tw && ui.shown[key] === to)) continue;
      const from = ui.shown[key];
      pop(pill, to > from ? 'hb-bump-up' : 'hb-bump-down');
      tween('w' + key, from, to, Math.min(1.2, 0.35 + Math.abs(to - from) / 400), (v) => {
        ui.shown[key] = Math.round(v);
        el.textContent = fmtShort(ui.shown[key]);
      });
    }
  }

  // --- tab bar --------------------------------------------------------------------------
  const tabBtns = {};
  const dots = {};
  const tabbar = h('nav', { class: 'hb-tabs', 'aria-label': 'Menu' });
  for (const id of TABS) {
    const [ic, label] = TAB_INFO[id];
    dots[id] = h('i', { class: 'hb-dot hidden' });
    tabBtns[id] = h('button', { class: 'hb-tab t-' + id, type: 'button', 'data-tab': id, on: { click: tap(() => (id !== ui.tab && sfx('tabSwitch'), switchTab(id)), null) } }, h('span', { class: 'hb-tab-ic' }, icon(ic)), h('span', { class: 'hb-tab-lbl' }, label), dots[id]);
    tabbar.append(tabBtns[id]);
  }

  // --- the Battle tab -----------------------------------------------------------------------
  const arenaBadge = h('span', { class: 'hb-arena-badge' }, '1');
  const arenaName = h('b', { class: 'hb-arena-name' }, '');
  const arenaSub = h('small', { class: 'hb-arena-sub' }, '');
  const troNum = h('b', { class: 'hb-tro-num' }, '0');
  const troFill = h('i', {});
  const troNext = h('small', { class: 'hb-tro-next' }, '');
  // (the float drops its animation class when done: hiding and showing the tab would replay it)
  const troFloat = h('span', { class: 'hb-tro-float', on: { animationend: () => troFloat.classList.remove('go') } }, '');
  const arenaBtn = h(
    'button',
    { class: 'hb-arena', type: 'button', on: { click: tap(() => switchTab('trail')) } },
    arenaBadge,
    h('span', { class: 'hb-arena-txt' }, arenaName, arenaSub),
    h('span', { class: 'hb-arena-tro' }, h('span', { class: 'hb-tro-line' }, icon('trophy'), troNum, troNext), h('span', { class: 'hb-bar hb-tro-bar' }, troFill)),
    troFloat,
  );
  const playBtn = h('button', { class: 'hb-play', type: 'button', on: { click: tap(() => startBattle(), null) } }, h('span', { class: 'hb-play-lbl' }, 'BATTLE'), h('small', {}, 'vs a bot of your level'));
  const playWrap = h('div', { class: 'hb-play-wrap' }, playBtn);
  const chests = {};
  function chestSlot(kind) {
    const name = kind === 'big' ? 'Big Chest' : 'Small Chest';
    const lbl = h('span', { class: 'hb-chest-lbl' }, '');
    const wrap = h('span', { class: 'hb-chest-art' }, h('span', { class: 'hb-chest-name' }, name));
    const el = h('button', { class: 'hb-chest k-' + kind, type: 'button', 'aria-label': name, on: { click: tap(() => chestTap(kind), null) } }, wrap, lbl);
    chests[kind] = { kind, el, wrap, lbl, cv: null, ready: null, msLeft: 0, t: kind === 'big' ? 1.3 : 0, drawT: 1, size: 0 };
    return el;
  }
  const battleRow = h('div', { class: 'hb-battle-row' }, chestSlot('small'), playWrap, chestSlot('big'));
  const battleScreen = h('section', { class: 'hb-screen hb-battle' }, h('div', { class: 'hb-arena-wrap' }, arenaBtn), h('div', { class: 'hb-see' }), battleRow);

  function startBattle() {
    if (P.tutorial === 0) coachEl.remove();
    sfx('ui');
    actions.battle();
  }

  function chestTap(kind) {
    const st = chestState(P, kind, now());
    if (st.ready) {
      haptic(25);
      sfx('pop');
      opener.open(kind);
    } else {
      sfx('ui');
      opener.info(kind);
    }
  }

  function sizeChests() {
    const H = window.innerHeight || 390;
    const W = window.innerWidth || 844;
    const s = Math.round(clamp(Math.min(H * 0.27, W * 0.15), 70, 150));
    for (const c of Object.values(chests)) {
      const size = c.kind === 'big' ? s : Math.round(s * 0.92);
      if (c.size === size && c.cv) continue;
      c.size = size;
      if (c.cv) c.cv.remove();
      c.cv = canvas(size, Math.round(size * 0.8), 'hb-chest-cv');
      c.wrap.append(c.cv);
      c.ready = null;
    }
  }

  function updateChests(dt) {
    for (const c of Object.values(chests)) {
      const st = chestState(P, c.kind, now());
      if (st.ready !== c.ready) {
        c.ready = st.ready;
        c.el.classList.toggle('ready', st.ready);
        c.lbl.textContent = st.ready ? 'OPEN!' : fmtTime(st.msLeft);
        if (st.ready) pop(c.el);
        draw(c, 0);
      } else if (!st.ready && Math.ceil(st.msLeft / 1000) !== Math.ceil(c.msLeft / 1000)) c.lbl.textContent = fmtTime(st.msLeft);
      c.msLeft = st.msLeft;
      if (c.ready && dt > 0) {
        c.t += dt;
        c.drawT += dt;
        if (c.drawT >= 1 / CHEST_FPS) draw(c, c.drawT);
      }
    }
    function draw(c) {
      c.drawT = 0;
      if (!c.cv) return;
      // A ready chest hops (drawChest does that) and every few seconds gives a little rattle
      const ph = c.t % 3.4;
      const shake = c.ready && ph > 2.7 ? Math.sin(((ph - 2.7) / 0.7) * Math.PI) * 0.45 : 0;
      drawChest(c.cv, c.kind, { t: c.t, ready: c.ready, shake });
    }
  }

  function renderArena() {
    const v = ui.trophyShown == null ? P.trophies : ui.trophyShown;
    const a = arenaIndex(v);
    const ar = ARENAS[a];
    const pr = arenaProgress({ ...P, trophies: v });
    arenaBadge.textContent = String(a + 1);
    arenaBtn.style.setProperty('--arena', ar.color);
    arenaName.textContent = ar.name;
    arenaSub.textContent = `Arena ${a + 1}`;
    troNum.textContent = fmt(v);
    troNext.textContent = pr.next >= 0 ? ` / ${fmt(pr.to)}` : ' · top arena!';
    troFill.style.transform = `scaleX(${pr.frac.toFixed(3)})`;
  }

  function renderBattle() {
    sizeChests();
    renderArena();
    updateChests(0);
    renderTutorial();
  }

  // --- tutorial hints -----------------------------------------------------------------------
  const coachEl = h('div', { class: 'hb-coach' });
  function renderTutorial() {
    coachEl.remove();
    tabBtns.cards.classList.remove('hb-hint');
    if (!ui.open || ui.stack.length) return;
    let tut = P.tutorial | 0;
    if (tut >= 3) return;
    if (tut === 1 && !readyChests(P, now())) tut = setTutorial(2);
    if (tut === 2 && !upgradableCount(P)) tut = setTutorial(3);
    if (tut === 0 && ui.tab === 'battle') {
      coachEl.textContent = 'Your first battle!';
      coachEl.className = 'hb-coach c-play';
      playWrap.append(coachEl);
    } else if (tut === 1 && ui.tab === 'battle') {
      const c = chests.small.ready ? chests.small : chests.big;
      coachEl.textContent = 'Open your free chests!';
      coachEl.className = 'hb-coach c-chest';
      c.el.append(coachEl);
    } else if (tut === 2 && ui.tab !== 'cards') {
      coachEl.textContent = 'Upgrade a card!';
      coachEl.className = 'hb-coach c-tab';
      tabBtns.cards.append(coachEl);
      tabBtns.cards.classList.add('hb-hint');
    }
  }
  function setTutorial(n) {
    if ((P.tutorial | 0) >= n) return P.tutorial | 0;
    P.tutorial = n;
    persist();
    return n;
  }

  // --- screens ----------------------------------------------------------------------------
  const panel = h('div', { class: 'hb-panels' });
  root.append(panel, top, tabbar, toastEl);

  const H = {
    P,
    persist,
    audio,
    actions,
    now,
    sfx,
    haptic,
    tap,
    toast,
    tween,
    pop,
    openModal,
    closeEntry,
    closeTop,
    cardModal,
    btn,
    changed,
    guarded,
    go: (tab) => switchTab(tab),
    refreshChrome: (snap) => refreshChrome(snap),
    showRewards,
    kingUp,
    setTutorial,
    renderTutorial: () => renderTutorial(),
    current: () => (ui.open ? ui.tab : null),
  };
  const opener = createChestOpener(H);
  const cards = createCardsScreen(H);
  const trail = createTrailScreen(H);
  const shop = createShopScreen(H);
  const more = createMoreScreen(H);
  const screens = { battle: { el: battleScreen, render: renderBattle }, cards, trail, shop, more };
  for (const id of TABS) panel.append(screens[id].el);

  function switchTab(id) {
    if (!TABS.includes(id)) id = 'battle';
    const prev = ui.tab;
    if (prev !== id && screens[prev].onHide) screens[prev].onHide();
    ui.tab = id;
    root.dataset.tab = id;
    for (const t of TABS) {
      screens[t].el.classList.toggle('on', t === id);
      tabBtns[t].classList.toggle('on', t === id);
      tabBtns[t].setAttribute('aria-current', t === id ? 'page' : 'false');
    }
    screens[id].render();
    if (prev !== id) {
      changed();
      pop(screens[id].el, 'hb-enter');
    }
    refreshChrome();
    renderTutorial();
    notify();
  }

  function refreshDots() {
    let freeLeft = false;
    try {
      const day = P.shop.day;
      freeLeft = !shopToday(P, now()).free.claimed;
      if (P.shop.day !== day) persist(); // the day rolled over
    } catch {
      freeLeft = false;
    }
    const on = {
      shop: freeLeft,
      cards: upgradableCount(P) > 0,
      trail: claimableTrail(P) > 0,
      more: claimableBadges(P) > 0,
      battle: ui.tab !== 'battle' && readyChests(P, now()) > 0,
    };
    for (const id of TABS) dots[id].classList.toggle('hidden', !on[id]);
  }

  function refreshChrome(snap) {
    renderTop(snap);
    refreshDots();
  }

  // --- notices, rewards, celebrations -----------------------------------------------------------
  function showNotices() {
    if (ui.noticeOpen || !ui.open) return;
    const n = P.notices && P.notices[0];
    if (!n) return;
    let modal;
    if (n.kind === 'veteran') {
      const gold = Number(n.gold) || 0;
      const num = h('b', {}, '0');
      modal = cardModal({
        kicker: 'WELCOME TO THE ARENA',
        title: 'Thanks for playing the campaign!',
        body: [
          h('p', {}, `Here's ${fmt(gold)} gold for your ${fmt(n.stars || 0)} stars. Spend it on card upgrades and shop cards.`),
          h('div', { class: 'hb-rewards' }, h('span', { class: 'hb-amt hb-amt-gold big' }, coin(), num)),
        ],
        buttons: [btn('Thanks!', () => closeTop(), 'primary big', null)],
        cls: 'hb-notice',
      });
      tween('notice', 0, gold, 1.1, (v) => (num.textContent = '+' + fmt(v)), { delay: 0.35, step: (k) => sfx('coins', { pitch: k }) });
    } else if (typeof n.text === 'string' && n.text) {
      modal = cardModal({ kicker: typeof n.title === 'string' ? n.title : 'NEWS', body: [h('p', {}, n.text)], buttons: [btn('OK', () => closeTop(), 'primary big', null)], cls: 'hb-notice' });
    } else {
      // A notice this version can't show: drop it rather than block the queue
      popNotice(P);
      persist();
      showNotices();
      return;
    }
    ui.noticeOpen = true;
    openModal(modal, {
      onClose() {
        ui.noticeOpen = false;
        popNotice(P);
        persist();
        refreshChrome();
        setTimeout(showNotices, 250);
      },
    });
  }

  /** A modal listing a grant() summary (free gift, Trail rewards). */
  function showRewards(kicker, g, { title = 'You got', after } = {}) {
    const best = (g.cards || []).reduce((r, c) => (c.rarity === 'epic' || (c.rarity === 'rare' && r !== 'epic') ? c.rarity : r), 'common');
    const modal = cardModal({ kicker, title, body: [rewardView(g)], buttons: [btn('Collect', () => closeTop(), 'primary big', null)], cls: 'hb-reward-modal' });
    openModal(modal, {
      onClose() {
        refreshChrome();
        if (after) after();
      },
    });
    if (g.cards && g.cards.length) sfx('cardReveal', { rarity: best });
    if (g.gold || g.beans) setTimeout(() => sfx('coins', { pitch: 0.6 }), g.cards && g.cards.length ? 260 : 0);
    haptic(20);
  }

  function kingSheet() {
    const k = kingInfo(P);
    const frac = k.max ? 1 : clamp((k.xp - k.from) / Math.max(1, k.need - k.from), 0, 1);
    openModal(
      cardModal({
        kicker: 'KING LEVEL',
        title: `King Level ${k.level}`,
        body: [
          h('p', {}, `Your towers fight at King Level ${k.level}: every level gives them +10% health and damage. Upgrading cards earns King XP.`),
          h('div', { class: 'hb-bar hb-xp-bar' }, h('i', { style: `transform:scaleX(${frac.toFixed(3)})` }), h('span', {}, k.max ? 'Max level!' : `${fmt(k.xp - k.from)} / ${fmt(k.need - k.from)} XP`)),
        ],
        buttons: [btn('OK', () => closeTop(), 'primary', null)],
      }),
    );
  }

  /** King Level went up (after a card upgrade). */
  function kingUp(level) {
    sfx('cheer', { pitch: 0.7 });
    const modal = cardModal({
      kicker: 'LEVEL UP!',
      title: '',
      body: [
        h('div', { class: 'hb-kingup' }, h('span', { class: 'hb-rays' }), h('span', { class: 'hb-king-badge big' }, icon('crown', 'hb-king-crown'), h('b', { class: 'hb-king-lv' }, String(level)))),
        h('h3', {}, `King Level ${level}!`),
        h('p', {}, `Your Guard Towers and Castle are now level ${level}: +10% health and damage.`),
      ],
      buttons: [btn('Great!', () => closeTop(), 'primary big', null)],
      cls: 'hb-celebrate-card',
    });
    openModal(modal);
    refreshChrome();
  }

  function celebrateArena(i, newCards) {
    const ar = ARENAS[i];
    if (!ar) return;
    sfx('trophyUp');
    haptic(40);
    const row = h('div', { class: 'hb-cel-cards' });
    const w = cardW(0.2, 52, 96);
    (newCards || []).forEach((id, k) => {
      if (!CARDS[id]) return;
      const t = h('div', { class: `hb-cel-card r-${CARDS[id].rarity}`, style: `animation-delay:${0.55 + k * 0.28}s` }, cardCanvas(id, w, { mini: true }), h('b', {}, CARDS[id].name));
      row.append(t);
      setTimeout(() => ui.stack.length && sfx('cardReveal', { rarity: CARDS[id].rarity }), 550 + k * 280);
    });
    const confetti = h('div', { class: 'hb-confetti' });
    for (let k = 0; k < 26; k++) confetti.append(h('i', { style: `--x:${(k * 37) % 100}vw;--d:${(k % 7) * 0.13}s;--c:${['#f3b52f', '#e4433b', '#2b6be0', '#3fae4f', '#b05ce0', '#fff'][k % 6]};--r:${(k * 47) % 360}deg` }));
    const modal = h(
      'div',
      { class: 'hb-backdrop hb-celebrate' },
      h('span', { class: 'hb-rays big' }),
      confetti,
      h(
        'div',
        { class: 'hb-cel', style: `--arena:${ar.color}` },
        h('div', { class: 'hb-kicker light' }, 'NEW ARENA UNLOCKED!'),
        h('div', { class: 'hb-cel-banner' }, h('small', {}, `Arena ${i + 1}`), h('h2', {}, ar.name), h('span', { class: 'hb-cel-tro' }, icon('trophy'), fmt(ar.trophies))),
        row.childElementCount ? h('p', {}, 'New cards unlocked! They can now drop from chests and the shop, and the Trophy Trail has them waiting for you.') : null,
        row.childElementCount ? row : null,
        h('div', { class: 'hb-row' }, btn('See the Trail', () => (closeTop(), switchTab('trail'))), btn('Awesome!', () => closeTop(), 'primary big', null)),
      ),
    );
    openModal(modal);
  }

  // --- the public API ------------------------------------------------------------------------
  function show(tab) {
    if (!tab) return hide();
    const wasOpen = ui.open;
    ui.open = true;
    root.classList.remove('hidden');
    document.body.classList.add('hub-open');
    if (!wasOpen) {
      changed(); // arriving from a match: the finger may still be tapping
      renderTop(true);
    }
    switchTab(tab);
    if (!wasOpen) changed();
    showNotices();
  }

  function hide() {
    if (!ui.open && root.classList.contains('hidden')) return;
    ui.hiding = true; // one onShow(null) at the end, not a 'hub' on the way
    for (const id of TABS) if (screens[id].onHide) screens[id].onHide();
    for (const m of ui.stack) if (m.el) m.el.remove();
    ui.stack.length = 0;
    opener.stop();
    flushTweens();
    ui.trophyShown = null;
    ui.noticeOpen = false;
    ui.later.length = 0;
    ui.open = false;
    ui.hiding = false;
    root.classList.add('hidden');
    document.body.classList.remove('hub-open');
    notify();
  }

  let resizeT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      if (!ui.open) return;
      screens[ui.tab].render();
      for (const m of ui.stack) if (m.refresh) m.refresh();
    }, 150);
  });

  return {
    show,
    hide,
    isOpen: () => ui.open,
    /** The visible tab ('battle' | 'cards' | 'shop' | 'trail' | 'more'), or null when hidden. */
    current: () => (ui.open ? ui.tab : null),
    /** True while a modal (or a modal state like picking a deck slot) is up. */
    hasModal: () => ui.stack.length > 0,
    refresh() {
      if (!ui.open) return;
      screens[ui.tab].render();
      refreshChrome();
      renderTutorial();
    },
    /** The profile was replaced (another window saved, progress reset): redraw everything. */
    profileChanged() {
      ui.trophyShown = null;
      for (const m of ui.stack.slice()) if (m.refresh) m.refresh();
      if (cards.cancelSwap) cards.cancelSwap();
      if (!ui.open) return;
      screens[ui.tab].render();
      refreshChrome(true);
      renderTutorial();
      showNotices();
    },
    tick(dt) {
      if (!ui.open) return;
      dt = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0.016;
      ui.t += dt;
      runTweens(dt);
      opener.update(dt);
      const covered = ui.stack.some((m) => m.el && m.el.classList.contains('hb-full'));
      if (ui.tab === 'battle' && !covered) updateChests(dt);
      if (screens[ui.tab].tick && !covered) screens[ui.tab].tick(dt);
      ui.secT += dt;
      if (ui.secT >= 1) {
        ui.secT = 0;
        refreshDots();
        if (screens[ui.tab].second) screens[ui.tab].second();
      }
    },
    /** Back button: close the top modal. True if one was open. */
    closeModal: () => closeTop(),
    afterMatch(s) {
      if (!s || typeof s !== 'object') return;
      if (!ui.open) show('battle');
      else if (ui.tab !== 'battle') switchTab('battle');
      // Count the trophies from where they were, with a "+30" floating up
      const before = Number.isFinite(s.before) ? s.before : P.trophies;
      const after = Number.isFinite(s.after) ? s.after : P.trophies;
      const delta = after - before;
      if (delta) {
        ui.trophyShown = before;
        renderArena();
        troFloat.textContent = (delta > 0 ? '+' : '') + delta;
        troFloat.className = 'hb-tro-float ' + (delta > 0 ? 'up' : 'down');
        pop(troFloat, 'go');
        tween('trophy', before, after, 1.2, (v) => {
          ui.trophyShown = Math.round(v);
          renderArena();
        }, { delay: 0.45, done: () => ((ui.trophyShown = null), renderArena(), pop(arenaBtn)) });
      }
      // ...and the gold from what it was before the match
      const gold = Number(s.gold) || 0;
      if (gold > 0) {
        ui.tweens.delete('wgold');
        ui.shown.gold = Math.max(0, P.gold - gold);
        goldNum.textContent = fmtShort(ui.shown.gold);
        setTimeout(() => ui.open && (syncWallet(), sfx('coins', { pitch: 0.4 })), 700);
      }
      refreshDots();
      if (Number.isFinite(s.newArena) && s.newArena >= 0) setTimeout(() => ui.open && whenFree(() => celebrateArena(s.newArena, s.newCards)), 1500);
    },
    installChanged() {
      if (ui.open && ui.tab === 'more') more.render();
    },
    /** CSS px the hub covers at the top and bottom on the Battle tab (frame the demo match between them). */
    insets() {
      const r1 = arenaBtn.getBoundingClientRect();
      const r2 = battleRow.getBoundingClientRect();
      return { top: Math.round(r1.bottom), bottom: Math.round((window.innerHeight || 0) - r2.top) };
    },
  };
}
