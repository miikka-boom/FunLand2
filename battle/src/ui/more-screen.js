// The More tab: Badges (goals with progress and claim buttons), Settings
// (sound, vibration, shake, install, reset), "How it's fair" and the Sandbox.
// A side menu on the left (the phone is sideways), the page on the right.
// The itch.io build (host.js ITCH) has no install row and no link out of the game.

import { h, icon, coin, bean, fmt, clamp, CARDS, ARENAS } from './hub-kit.js';
import { badgeStatus, claimBadge, claimableBadges } from '../meta/badges.js';
import { CHESTS } from '../meta/chests.js';
import { TRAIL } from '../meta/ladder.js';
import { swVersion } from '../pwa.js';
import { ITCH } from '../host.js';

const SECTIONS = [
  ['badges', 'badge', 'Badges'],
  ['settings', 'gear', 'Settings'],
  ['fair', 'scroll', "How it's fair"],
  ['sandbox', 'sandbox', 'Sandbox'],
];
// A second tap must be a deliberate one: a double tap never erases the save.
const SECOND_TAP_MS = 600;

export function createMoreScreen(H) {
  const P = H.P;
  const el = h('section', { class: 'hb-screen hb-more' });
  const nav = h('nav', { class: 'hb-more-nav' });
  const body = h('div', { class: 'hb-more-body' });
  const version = h('small', { class: 'hb-version' }, 'Wobble War: Arena');
  el.append(nav, body);
  const ui = { section: 'badges', resetArmed: false, resetAt: 0, resetT: 0, claimAt: -1e9 };
  let versionAsked = false;

  function renderNav() {
    nav.innerHTML = '';
    const nBadges = claimableBadges(P);
    for (const [id, ic, label] of SECTIONS)
      nav.append(
        h(
          'button',
          { class: 'hb-more-tab' + (ui.section === id ? ' on' : ''), type: 'button', on: { click: H.tap(() => go(id), id === ui.section ? null : 'tabSwitch') } },
          icon(ic),
          h('span', {}, label),
          id === 'badges' && nBadges ? h('i', { class: 'hb-count' }, String(nBadges)) : null,
        ),
      );
    nav.append(version);
    if (!versionAsked) {
      versionAsked = true;
      swVersion(1500)
        .then((v) => (version.textContent = v ? `Wobble War: Arena · v${v}` : 'Wobble War: Arena · dev build'))
        .catch(() => {});
    }
  }

  function go(id) {
    ui.section = id;
    ui.resetArmed = false;
    render();
    body.scrollTop = 0;
  }

  // --- badges --------------------------------------------------------------------------------
  function renderBadges() {
    const list = h('div', { class: 'hb-badges' });
    for (const b of badgeStatus(P)) {
      const frac = clamp(b.progress / Math.max(1, b.goal), 0, 1);
      const reward = h('span', { class: 'hb-badge-reward' }, b.reward.beans ? h('span', {}, bean(), fmt(b.reward.beans)) : null, b.reward.gold ? h('span', {}, coin(), fmt(b.reward.gold)) : null);
      let act;
      if (b.claimed) act = h('span', { class: 'hb-ms-done' }, icon('check'));
      else if (b.done) act = h('button', { class: 'hb-btn primary small hb-claim', type: 'button', on: { click: H.tap(() => claim(b.id), null) } }, 'Claim');
      else act = h('span', { class: 'hb-badge-pct' }, Math.floor(frac * 100) + '%');
      list.append(
        h(
          'div',
          { class: 'hb-badge' + (b.done && !b.claimed ? ' ready' : '') + (b.claimed ? ' claimed' : ''), 'data-id': b.id },
          h('span', { class: 'hb-badge-ic' }, b.icon),
          h('div', { class: 'hb-badge-info' }, h('b', {}, b.name), h('small', {}, b.desc), h('span', { class: 'hb-bar' + (b.done ? ' full' : '') }, h('i', { style: `transform:scaleX(${frac.toFixed(3)})` }), h('span', {}, `${fmt(b.progress)} / ${fmt(b.goal)}`))),
          reward,
          act,
        ),
      );
    }
    return [h('div', { class: 'hb-sec-head' }, h('h3', {}, 'Badges'), h('small', {}, 'Little goals that pay Jellybeans and gold')), list];
  }

  function claim(id) {
    if (performance.now() - ui.claimAt < 450) return;
    const g = claimBadge(P, id);
    if (!g) return;
    ui.claimAt = performance.now();
    H.persist();
    H.sfx('coins', { pitch: 0.7 });
    H.haptic(20);
    const parts = [];
    if (g.beans) parts.push(`+${fmt(g.beans)} Jellybeans`);
    if (g.gold) parts.push(`+${fmt(g.gold)} gold`);
    H.toast(parts.join(' · ') || 'Claimed!', 'good');
    render();
    H.refreshChrome();
  }

  // --- settings --------------------------------------------------------------------------------
  function renderSettings() {
    const S = P.settings;
    const toggle = (key, label, sub) =>
      h(
        'label',
        { class: 'hb-switch' },
        h('span', { class: 'hb-switch-txt' }, h('b', {}, label), sub ? h('small', {}, sub) : null),
        h('input', { type: 'checkbox', checked: !!S[key], on: { change: (e) => (H.actions.setSetting(key, e.target.checked), H.sfx('ui')) } }),
        h('i', { class: 'hb-switch-knob' }),
      );
    return [
      h('div', { class: 'hb-sec-head' }, h('h3', {}, 'Settings')),
      h(
        'div',
        { class: 'hb-settings' },
        toggle('sound', 'Sound'),
        h('label', { class: 'hb-slider' }, h('b', {}, 'Volume'), h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: S.volume, on: { input: (e) => H.actions.setSetting('volume', +e.target.value), change: () => H.sfx('ui') } })),
        toggle('haptics', 'Vibration', 'Android phones'),
        toggle('shake', 'Screen shake'),
      ),
      installRow(),
      H.saveOk && !H.saveOk() ? h('p', { class: 'hb-save-warn' }, "⚠️ Progress can't be saved on this browser: its storage is full or blocked (private mode?). Chests, cards and trophies are lost when the game closes.") : null,
      h(
        'button',
        { class: 'hb-btn danger' + (ui.resetArmed ? ' armed' : ''), type: 'button', on: { click: H.tap(resetTap) } },
        ui.resetArmed ? 'Tap again to erase all progress' : 'Reset progress',
      ),
      // (on itch.io, '../' would load a broken page into itch's iframe)
      ITCH ? null : h('p', { class: 'hb-fine' }, h('a', { href: '../' }, '← FunLand2 Prototype 0: HORDE')),
    ];
  }

  /** Install: the browser's own prompt where there is one, otherwise how-to text. */
  function installRow() {
    if (ITCH) return null; // played on itch.io: nothing to install
    const how = H.actions.installMethod ? H.actions.installMethod() : 'none';
    if (how === 'installed') return h('p', { class: 'hb-note' }, '📲 Installed: it plays full screen and offline.');
    if (how === 'prompt')
      return h(
        'button',
        { class: 'hb-btn primary', type: 'button', on: { click: H.tap(() => Promise.resolve(H.actions.installApp && H.actions.installApp()).then(() => H.current() === 'more' && render())) } },
        '📲 Install on home screen',
      );
    if (how === 'ios') return h('p', { class: 'hb-note' }, '📲 To install: tap Share, then "Add to Home Screen". Then it plays full screen and offline.');
    return h('p', { class: 'hb-note' }, '📲 To install: use your browser menu → "Add to Home Screen" (or "Install app"). Then it plays full screen and offline.');
  }

  function resetTap() {
    if (!ui.resetArmed) {
      ui.resetArmed = true;
      ui.resetAt = performance.now();
      clearTimeout(ui.resetT);
      ui.resetT = setTimeout(() => {
        ui.resetArmed = false;
        if (H.current() === 'more' && ui.section === 'settings') render();
      }, 5000);
      render();
      return;
    }
    if (performance.now() - ui.resetAt < SECOND_TAP_MS) return;
    clearTimeout(ui.resetT);
    ui.resetArmed = false;
    H.actions.resetProgress();
    H.go('battle');
    H.refreshChrome(true); // a fresh start: no count-down to zero
  }

  // --- fair play, sandbox ------------------------------------------------------------------------------
  /** The arena that unlocks the first Legendary. */
  function legendArena() {
    const a = Math.min(...Object.values(CARDS).filter((c) => c.rarity === 'legendary').map((c) => c.arena));
    return ARENAS[a] ? ARENAS[a].name : 'Boom Ridge';
  }

  const hours = (ms) => +(ms / 3600e3).toFixed(1);
  /** How many copies of each Legendary the Trophy Trail hands out ("4 copies of each"). */
  function trailLegendaries() {
    const n = new Set();
    for (const m of TRAIL) for (const [id, k] of Object.entries((m.reward && m.reward.cards) || {})) if (CARDS[id] && CARDS[id].rarity === 'legendary') n.add(k);
    const k = n.size === 1 ? [...n][0] : 0;
    return k > 1 ? `${k} copies of each` : k === 1 ? 'a copy of each' : 'copies of each';
  }

  function renderFair() {
    const li = (b, t) => h('li', {}, h('b', {}, b), ' ', t);
    return [
      h('div', { class: 'hb-sec-head' }, h('h3', {}, "How it's fair")),
      h(
        'ul',
        { class: 'hb-fair' },
        li('No money, ever, for power.', 'Every card and every level is earned by playing. Nothing that wins battles is for sale.'),
        li('Two currencies, both earned.', 'Gold upgrades cards and buys shop cards. Jellybeans only buy looks: army colours and hats.'),
        li('Two free chests.', `The Small Chest refills every ${hours(CHESTS.small.period)} hours, the Big Chest every ${hours(CHESTS.big.period)}. No slots, no paid timers, no chests for sale, and coming back a little late costs nothing. Tap a refilling chest to see exactly what can be inside.`),
        li('Legendaries are earned too.', `They come from Big Chests (a ${Math.round(CHESTS.big.legendary * 100)}% chance from ${legendArena()} on), from the shop for gold some days, and ${trailLegendaries()} on the Trophy Trail. Never for money.`),
        li('Honest opponents.', 'You play computer players (bots), matched card by card to your deck and never above it. Upgrades are a real edge. We never pretend they are people.'),
        li('Gentle losses.', 'You never drop out of an arena you reached, and a loss still pays a little gold (giving up pays none).'),
        li('No ads, no energy.', 'Play as much or as little as you like. No streaks and no penalties: a day off never takes anything away.'),
        li('Supporter Pack?', 'Optional, cosmetic only, and not even for sale yet.'),
      ),
    ];
  }

  function renderSandbox() {
    return [
      h('div', { class: 'hb-sec-head' }, h('h3', {}, 'Sandbox')),
      h(
        'div',
        { class: 'hb-sandbox' },
        icon('sandbox', 'big'),
        h('p', {}, 'The free-placement toy: put beans anywhere, press FIGHT and watch them wobble. No trophies, no pressure, just physics.'),
        h('button', { class: 'hb-btn primary big', type: 'button', on: { click: H.tap(() => H.actions.sandbox()) } }, 'Open the Sandbox'),
      ),
    ];
  }

  function render() {
    renderNav();
    body.innerHTML = '';
    const parts = ui.section === 'settings' ? renderSettings() : ui.section === 'fair' ? renderFair() : ui.section === 'sandbox' ? renderSandbox() : renderBadges();
    body.append(...parts.filter((p) => p != null)); // (append(null) would print "null")
  }

  return {
    el,
    render,
    /** Open on a given page next time (the top bar's gear opens Settings). */
    section(id) {
      if (SECTIONS.some((s) => s[0] === id)) {
        ui.section = id;
        ui.resetArmed = false;
      }
    },
    onHide() {
      ui.resetArmed = false;
    },
  };
}
