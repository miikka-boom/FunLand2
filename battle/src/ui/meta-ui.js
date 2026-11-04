// The free-to-play shell around the battles: hub, world map, level cards,
// wardrobe (cosmetic shop), trophies, settings, supporter card, pause menu.
// Plain DOM. The game itself stays in main.js; this module only calls back
// through `actions` and reads/writes the profile.

import { WORLDS, LEVELS_PER_WORLD, levelUnlocked, nextLevel, worldReached, unlockedUnits, worldOf, dateKey, dailyChallenge } from '../meta/economy.js';
import { totalStars } from '../meta/profile.js';
import { COLORS, buyItem, equipColor, equipHat, armyPalette } from '../meta/cosmetics.js';
import { trophyStatus, claimable, claimTrophy } from '../meta/trophies.js';
import { HATS, drawHat } from '../render/hats.js';
import { UNIT_TYPES, UNIT_ORDER } from '../sim/unit-types.js';
import { Battle, DT } from '../sim/battle.js';
import { UnitRenderer, hatAnchor } from '../render/units.js';

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'html') el.innerHTML = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};
const starStr = (n, of = 3) => '★'.repeat(n) + '☆'.repeat(Math.max(0, of - n));
const fmt = (n) => Number(n).toLocaleString('en-US');

/**
 * deps: { profile, levels, persist(), audio, actions: { playLevel(i), playDaily(), playSandbox(), resume(), retry(),
 *         quitToHub(), restartLevel(), setSetting(k, v), resetProgress(), installApp?, canInstall? }, icon(canvas, typeId, opts) }
 */
export function createMetaUI(deps) {
  const { profile: P, levels: LEVELS, persist, audio, actions, icon } = deps;
  const root = h('div', { id: 'meta' });
  document.body.appendChild(root);
  const ui = { open: null, world: 0, wdUnit: 'clubber', wdTab: 'hats', confirm: null, preview: null };
  const click = () => audio.play('ui');

  // --- shared bits -----------------------------------------------------------------
  const walletEls = [];
  const wallet = () => {
    const el = h('div', { class: 'wallet' }, h('span', { class: 'pill beans', title: 'Jellybeans: earned by playing, spent on cosmetics' }, h('i', { class: 'bean' }), h('b', {}, '0')), h('span', { class: 'pill stars' }, '★ ', h('b', {}, '0')));
    walletEls.push(el);
    return el;
  };
  const refreshWallet = () => {
    for (const el of walletEls) {
      el.querySelector('.beans b').textContent = fmt(P.beans);
      el.querySelector('.stars b').textContent = `${totalStars(P)}/${LEVELS.length * 3}`;
    }
  };
  const panelTop = (title, back) =>
    h('div', { class: 'panel-top' }, h('button', { class: 'icon-btn back', type: 'button', 'aria-label': 'Back', on: { click: () => (click(), back()) } }, '←'), h('h2', {}, title), wallet());

  // Full screen hides the browser bars on Android (iPhone Safari has no API: install instead)
  function fullscreenBtn() {
    const de = document.documentElement;
    const req = de.requestFullscreen || de.webkitRequestFullscreen;
    const standalone = window.matchMedia && window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
    if (!req || standalone) return null;
    return h(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        'aria-label': 'Full screen',
        title: 'Full screen',
        on: {
          click: () => {
            click();
            try {
              if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
              else {
                const p = req.call(de, { navigationUI: 'hide' });
                if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
              }
            } catch {
              // not allowed here: no harm done
            }
          },
        },
      },
      '⛶',
    );
  }

  // --- hub ----------------------------------------------------------------------------
  const playBtn = h('button', { class: 'btn primary huge', type: 'button', on: { click: () => (click(), actions.playLevel(nextLevel(P, LEVELS.length))) } }, 'PLAY', h('small', {}, ''));
  const dailyDot = h('i', { class: 'dot hidden' });
  const trophyBadge = h('i', { class: 'nbadge hidden' }, '0');
  const supporterThanks = h('div', { class: 'thanks hidden' }, '♥ Thank you, Supporter!');
  const tile = (emoji, label, fn, extra) => h('button', { class: 'tile', type: 'button', on: { click: () => (click(), fn()) } }, h('span', { class: 'emoji' }, emoji), h('span', { class: 'label' }, label), extra || null);
  const hub = h(
    'div',
    { id: 'hub', class: 'meta-screen hub hidden' },
    h('div', { class: 'hub-top' }, h('div', { class: 'logo' }, 'WOBBLE ', h('span', {}, 'WAR')), h('div', { class: 'hub-right' }, wallet(), fullscreenBtn(), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Settings', on: { click: () => (click(), show('settings')) } }, '⚙'))),
    h(
      'div',
      { class: 'hub-main' },
      playBtn,
      h('div', { class: 'hub-row' }, tile('🗺️', 'Map', () => show('map')), tile('📅', 'Daily', () => actions.playDaily(), dailyDot), tile('🏖️', 'Sandbox', () => actions.playSandbox()), tile('🎩', 'Wardrobe', () => show('wardrobe')), tile('🏆', 'Trophies', () => show('trophies'), trophyBadge)),
    ),
    h('div', { class: 'hub-foot' }, supporterThanks, h('button', { class: 'link-btn', type: 'button', on: { click: () => (click(), show('supporter')) } }, '♥ Supporter Pack'), h('span', { class: 'promise' }, 'No ads · No energy · No loot boxes · Every unit is earned by playing')),
  );

  // --- map ----------------------------------------------------------------------------
  const tabs = h('div', { class: 'world-tabs' });
  const grid = h('div', { class: 'levels' });
  const map = h('div', { id: 'map', class: 'meta-screen panel hidden' }, panelTop('World Map', () => show('hub')), tabs, grid);

  function renderMap() {
    tabs.innerHTML = '';
    const reached = worldReached(P);
    WORLDS.forEach((w) => {
      const locked = w.id > reached && !levelUnlocked(P, w.id * LEVELS_PER_WORLD);
      let stars = 0;
      for (let i = w.id * LEVELS_PER_WORLD; i < (w.id + 1) * LEVELS_PER_WORLD; i++) stars += P.stars[i] || 0;
      tabs.append(
        h(
          'button',
          { class: 'world-tab' + (ui.world === w.id ? ' on' : '') + (locked ? ' locked' : ''), type: 'button', style: `--wc:${w.color}`, on: { click: () => (click(), (ui.world = w.id), renderMap()) } },
          h('b', {}, locked ? '🔒 ' + w.name : w.name),
          h('small', {}, locked ? `Clear World ${w.id} to open` : `★ ${stars}/${LEVELS_PER_WORLD * 3}`),
        ),
      );
    });
    grid.innerHTML = '';
    for (let k = 0; k < LEVELS_PER_WORLD; k++) {
      const i = ui.world * LEVELS_PER_WORLD + k;
      const L = LEVELS[i];
      if (!L) continue;
      const open = levelUnlocked(P, i);
      const next = open && !P.cleared[i];
      grid.append(
        h(
          'button',
          { class: 'node' + (open ? '' : ' locked') + (next ? ' next' : '') + (L.boss ? ' boss' : ''), type: 'button', disabled: !open, on: { click: () => (click(), showLevelCard(i)) } },
          h('span', { class: 'num' }, open ? String(i + 1) : '🔒'),
          h('span', { class: 'name' }, L.name),
          h('span', { class: 'st' }, open ? starStr(P.stars[i] || 0) : ''),
        ),
      );
    }
  }

  // --- level card ---------------------------------------------------------------------
  const lcBody = h('div', { class: 'card' });
  const levelcard = h('div', { id: 'levelcard', class: 'modal hidden', on: { click: (e) => e.target === levelcard && hideModal() } }, lcBody);
  function showLevelCard(i) {
    const L = LEVELS[i];
    const counts = {};
    for (const r of L.red) counts[r.type] = (counts[r.type] || 0) + 1;
    const enemy = h('div', { class: 'enemy' });
    for (const [t, n] of Object.entries(counts)) {
      const cv = h('canvas', { width: 120, height: 120 });
      icon(cv, t, { team: 'red', hat: L.redHat });
      enemy.append(h('div', { class: 'foe' }, cv, h('b', {}, '×' + n), h('small', {}, UNIT_TYPES[t].name)));
    }
    const best = P.stars[i] || 0;
    lcBody.innerHTML = '';
    lcBody.append(
      h('div', { class: 'kicker' }, `${WORLDS[worldOf(i)].name.toUpperCase()} · LEVEL ${i + 1}${L.boss ? ' · BOSS' : ''}`),
      h('h3', {}, L.name),
      h('p', { class: 'tip' }, L.tip),
      enemy,
      h('div', { class: 'goals' }, h('span', {}, '★ Win'), h('span', {}, `★★ spend ≤ ${L.stars[1]}`), h('span', {}, `★★★ spend ≤ ${L.stars[2]}`)),
      h('p', { class: 'budget' }, `Budget ${L.budget} gold${best ? ' · your best ' + starStr(best) : ''}`),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', on: { click: () => (click(), hideModal()) } }, 'Close'), h('button', { class: 'btn primary big', type: 'button', on: { click: () => (click(), hideModal(), actions.playLevel(i)) } }, 'Fight!')),
    );
    levelcard.classList.remove('hidden');
  }
  function hideModal() {
    for (const m of [levelcard, supporter, pause]) m.classList.add('hidden');
  }

  // --- wardrobe -----------------------------------------------------------------------
  const wdCanvas = h('canvas', { class: 'wd-canvas', width: 560, height: 560, on: { pointerdown: () => poke() } });
  const unitPick = h('div', { class: 'unit-pick' });
  const shopTabs = h('div', { class: 'tabs' });
  const shopGrid = h('div', { class: 'grid' });
  const wdHint = h('p', { class: 'wd-hint' }, '');
  const wardrobe = h(
    'div',
    { id: 'wardrobe', class: 'meta-screen panel hidden' },
    panelTop('Wardrobe', () => show('hub')),
    h('div', { class: 'wd-body' }, h('div', { class: 'wd-left' }, wdCanvas, unitPick, wdHint), h('div', { class: 'wd-right' }, shopTabs, shopGrid)),
  );
  const previewGfx = new UnitRenderer();

  function makePreview() {
    const b = new Battle(17);
    b.hats.blue = { ...P.equipped.hats };
    const u = b.addUnit(ui.wdUnit, 'blue', 0, 0.5, 4242);
    u.lookX = 200;
    u.lookY = -60;
    for (let i = 0; i < 60; i++) b.step(DT);
    ui.preview = { b, u, t: 0 };
  }
  function poke() {
    const pv = ui.preview;
    if (!pv) return;
    for (const p of pv.u.parts) p.addVel((Math.random() - 0.5) * 120, -260 - Math.random() * 120, DT);
    pv.u.mouth = 0.6;
    pv.u.mouthKind = 'smile';
    audio.play('place', { pitch: pv.u.voice });
  }
  function drawPreview(dt) {
    const pv = ui.preview;
    if (!pv) return;
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
    const s = Math.min(5.2, (W * 0.62) / height);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, W);
    // Pedestal
    c.fillStyle = 'rgba(58,40,22,0.18)';
    c.beginPath();
    c.ellipse(W / 2, W * 0.86, W * 0.3, W * 0.05, 0, 0, Math.PI * 2);
    c.fill();
    c.setTransform(s, 0, 0, s, W / 2 - u.hip.x * s, W * 0.86 - u.ground * s);
    previewGfx.drawUnit(c, u, pv.b, pv.t);
  }

  function renderWardrobe() {
    const units = unlockedUnits(P);
    if (!units.includes(ui.wdUnit)) ui.wdUnit = units[0];
    unitPick.innerHTML = '';
    for (const id of UNIT_ORDER) {
      const ok = units.includes(id);
      const cv = h('canvas', { width: 56, height: 56 });
      icon(cv, id, { team: 'blue', palette: armyPalette(P), hat: P.equipped.hats[id] });
      unitPick.append(
        h('button', { class: 'upick' + (ui.wdUnit === id ? ' on' : '') + (ok ? '' : ' locked'), type: 'button', disabled: !ok, title: ok ? UNIT_TYPES[id].name : 'Unlocks later in the campaign', on: { click: () => (click(), (ui.wdUnit = id), makePreview(), renderWardrobe()) } }, ok ? cv : h('span', {}, '🔒')),
      );
    }
    shopTabs.innerHTML = '';
    for (const [id, label] of [
      ['hats', 'Hats'],
      ['colors', 'Army colour'],
    ])
      shopTabs.append(h('button', { class: 'tab' + (ui.wdTab === id ? ' on' : ''), type: 'button', on: { click: () => (click(), (ui.wdTab = id), (ui.confirm = null), renderWardrobe()) } }, label));
    wdHint.textContent = ui.wdTab === 'hats' ? `Hat for your ${UNIT_TYPES[ui.wdUnit].name}s · tap the model to make it hop` : 'Colour for your whole army';
    shopGrid.innerHTML = '';
    const items = ui.wdTab === 'hats' ? HATS : COLORS;
    for (const it of items) {
      const owned = P.owned[ui.wdTab].includes(it.id);
      const equipped = ui.wdTab === 'hats' ? P.equipped.hats[ui.wdUnit] === it.id : P.equipped.color === it.id;
      const cv = h('canvas', { width: 96, height: 96 });
      if (ui.wdTab === 'hats') drawHatIcon(cv, it.id);
      else icon(cv, ui.wdUnit, { team: 'blue', palette: it.pal, hat: P.equipped.hats[ui.wdUnit] });
      let label;
      let cls = 'buy';
      if (equipped) {
        label = 'Wearing ✓';
        cls = 'buy on';
      } else if (owned) label = 'Wear';
      else if (it.supporter) {
        label = '♥ Supporter';
        cls = 'buy sup';
      } else if (ui.confirm === it.id) {
        label = `Buy for ${it.price}?`;
        cls = 'buy confirm';
      } else {
        label = `${it.price}`;
        cls = 'buy price' + (P.beans < it.price ? ' poor' : '');
      }
      const btn = h('button', { class: cls, type: 'button', on: { click: () => tapItem(it) } }, label);
      shopGrid.append(h('div', { class: 'item' + (equipped ? ' equipped' : '') }, cv, h('b', {}, it.name), btn));
    }
    refreshWallet();
  }

  function tapItem(it) {
    const kind = ui.wdTab;
    const owned = P.owned[kind].includes(it.id);
    if (!owned) {
      if (it.supporter) {
        click();
        show('supporter');
        return;
      }
      if (P.beans < it.price) {
        audio.play('ui');
        flash(`Need ${it.price - P.beans} more Jellybeans · win battles and claim trophies to earn them`);
        return;
      }
      if (ui.confirm !== it.id) {
        ui.confirm = it.id; // two taps to buy: no accidental purchases
        click();
        renderWardrobe();
        return;
      }
      if (buyItem(P, kind, it) !== 'bought') return;
      audio.play('cheer', { pitch: 0.6 });
    } else click();
    ui.confirm = null;
    if (kind === 'hats') equipHat(P, ui.wdUnit, it.id);
    else equipColor(P, it.id);
    persist();
    makePreview();
    renderWardrobe();
    refreshBadges();
  }

  function drawHatIcon(cv, id) {
    const c = cv.getContext('2d');
    const W = cv.width;
    c.clearRect(0, 0, W, W);
    if (id === 'none') {
      c.strokeStyle = 'rgba(58,40,22,0.35)';
      c.lineWidth = 5;
      c.beginPath();
      c.arc(W / 2, W / 2, W * 0.26, 0, Math.PI * 2);
      c.moveTo(W * 0.32, W * 0.68);
      c.lineTo(W * 0.68, W * 0.32);
      c.stroke();
      return;
    }
    // A plain head under the hat so it reads as a hat
    const pal = armyPalette(P);
    const s = W / 44;
    c.setTransform(s, 0, 0, s, W / 2, W * 0.78);
    c.fillStyle = pal.body;
    c.beginPath();
    c.arc(0, 4, 13, Math.PI, 0);
    c.lineTo(13, 10);
    c.lineTo(-13, 10);
    c.closePath();
    c.fill();
    drawHat(c, id, 0, 4 - 13 * 0.92, -Math.PI / 2, 13, pal, 0);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  // --- trophies -----------------------------------------------------------------------
  const tList = h('div', { class: 'tlist' });
  const trophies = h('div', { id: 'trophies', class: 'meta-screen panel hidden' }, panelTop('Trophies', () => show('hub')), tList);
  function renderTrophies() {
    tList.innerHTML = '';
    for (const t of trophyStatus(P)) {
      const pct = Math.round((t.progress / t.goal) * 100);
      const btn = t.claimed
        ? h('span', { class: 'claimed' }, 'Claimed ✓')
        : h('button', { class: 'btn primary small', type: 'button', disabled: !t.done, on: { click: () => claim(t.id) } }, t.done ? `Claim ${t.reward}` : `${t.reward}`);
      tList.append(
        h(
          'div',
          { class: 'trophy' + (t.done && !t.claimed ? ' ready' : '') + (t.claimed ? ' done' : '') },
          h('span', { class: 'ticon' }, t.icon),
          h('div', { class: 'tinfo' }, h('b', {}, t.name), h('small', {}, t.desc), h('div', { class: 'bar' }, h('i', { style: `width:${pct}%` })), h('small', { class: 'prog' }, `${t.progress} / ${t.goal}`)),
          btn,
        ),
      );
    }
    refreshWallet();
  }
  function claim(id) {
    const got = claimTrophy(P, id);
    if (!got) return;
    persist();
    audio.play('cheer', { pitch: 0.7 });
    flash(`+${got} Jellybeans`);
    renderTrophies();
    refreshBadges();
  }

  // --- settings -----------------------------------------------------------------------
  const sBody = h('div', { class: 'settings-body' });
  const settings = h('div', { id: 'settings', class: 'meta-screen panel hidden' }, panelTop('Settings', () => show(ui.back || 'hub')), sBody);
  function renderSettings() {
    const S = P.settings;
    const toggle = (key, label) =>
      h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: !!S[key], on: { change: (e) => (actions.setSetting(key, e.target.checked), click()) } }), h('span', {}, label));
    sBody.innerHTML = '';
    sBody.append(
      h('div', { class: 'sgroup' }, toggle('sound', 'Sound'), h('label', { class: 'slider' }, h('span', {}, 'Volume'), h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: S.volume, on: { input: (e) => actions.setSetting('volume', +e.target.value) } })), toggle('haptics', 'Vibration (Android)'), toggle('shake', 'Screen shake')),
      actions.canInstall && actions.canInstall() ? h('button', { class: 'btn primary', type: 'button', on: { click: () => (click(), actions.installApp()) } }, '📲 Install on home screen') : h('p', { class: 'note' }, 'To install: use your browser menu → "Add to Home Screen". Then it plays full screen and offline.'),
      h(
        'div',
        { class: 'promise-card' },
        h('b', {}, 'Our fair-play promise'),
        h('ul', {}, h('li', {}, 'Every unit and level is earned by playing. Nothing that wins battles is for sale.'), h('li', {}, 'No energy, no timers, no ads, no loot boxes.'), h('li', {}, 'Jellybeans are earned in play and only buy cosmetics.'), h('li', {}, 'Missing a day of the daily challenge costs you nothing.')),
      ),
      h('button', { class: 'btn danger', type: 'button', on: { click: resetTap } }, ui.resetArmed ? 'Tap again to erase all progress' : 'Reset progress'),
      h('p', { class: 'links' }, h('a', { href: '../' }, '← FunLand2 Prototype 0: HORDE')),
    );
  }
  function resetTap() {
    if (!ui.resetArmed) {
      ui.resetArmed = true;
      renderSettings();
      return;
    }
    ui.resetArmed = false;
    actions.resetProgress();
    show('hub');
  }

  // --- supporter card -------------------------------------------------------------------
  const supporter = h(
    'div',
    { id: 'supporter', class: 'modal hidden', on: { click: (e) => e.target === supporter && hideModal() } },
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'kicker' }, 'OPTIONAL · COSMETIC ONLY'),
      h('h3', {}, '♥ Supporter Pack'),
      h('p', {}, 'Wobble War is free, and everything that wins battles is earned by playing. If you enjoy it, the Supporter Pack is a thank-you: the Supporter Gold army colour and the Royal Crown hat. It changes how you look, never how you fight.'),
      h('p', { class: 'note' }, 'Purchases aren\'t connected in this prototype, so there\'s nothing to buy yet.'),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', on: { click: () => (click(), hideModal()) } }, 'Close')),
    ),
  );

  // --- pause menu ---------------------------------------------------------------------
  const pause = h(
    'div',
    { id: 'pause', class: 'modal hidden' },
    h(
      'div',
      { class: 'card pause-card' },
      h('h3', {}, 'Paused'),
      h('button', { class: 'btn primary big', type: 'button', on: { click: () => (click(), hideModal(), actions.resume()) } }, 'Resume'),
      h('button', { class: 'btn', type: 'button', on: { click: () => (click(), hideModal(), actions.restartLevel()) } }, '⟲ Restart'),
      h('button', { class: 'btn', type: 'button', on: { click: () => (click(), (ui.back = 'pause'), show('settings')) } }, '⚙ Settings'),
      h('button', { class: 'btn', type: 'button', on: { click: () => (click(), hideModal(), actions.quitToHub()) } }, '⌂ Main menu'),
    ),
  );

  root.append(hub, map, levelcard, wardrobe, trophies, settings, supporter, pause);

  // --- toast inside the meta screens ---------------------------------------------------
  const note = h('div', { class: 'meta-flash' });
  root.append(note);
  let noteT = 0;
  function flash(text) {
    note.textContent = text;
    note.classList.add('show');
    clearTimeout(noteT);
    noteT = setTimeout(() => note.classList.remove('show'), 1800);
  }

  // --- navigation -----------------------------------------------------------------------
  const screens = { hub, map, wardrobe, trophies, settings };
  function show(name) {
    if (name === 'supporter') {
      supporter.classList.remove('hidden'); // a card over whatever is open
      return;
    }
    if (name === 'pause') {
      for (const s of Object.values(screens)) s.classList.add('hidden');
      pause.classList.remove('hidden');
      ui.open = 'pause';
      return;
    }
    hideModal();
    ui.open = name;
    if (deps.onShow) deps.onShow(name);
    for (const [k, s] of Object.entries(screens)) s.classList.toggle('hidden', k !== name);
    if (name !== 'settings') ui.back = null;
    if (name === 'hub') renderHub();
    if (name === 'map') {
      ui.world = Math.min(worldOf(nextLevel(P, LEVELS.length)), WORLDS.length - 1);
      renderMap();
    }
    if (name === 'wardrobe') {
      ui.confirm = null;
      makePreview();
      renderWardrobe();
    }
    if (name === 'trophies') renderTrophies();
    if (name === 'settings') {
      ui.resetArmed = false;
      renderSettings();
    }
    refreshWallet();
  }
  function hideAll() {
    hideModal();
    for (const s of Object.values(screens)) s.classList.add('hidden');
    ui.open = null;
    ui.preview = null;
  }

  function renderHub() {
    const i = nextLevel(P, LEVELS.length);
    const allDone = Object.keys(P.cleared).length >= LEVELS.length;
    playBtn.querySelector('small').textContent = allDone ? 'All levels cleared! Go for 3 stars' : `World ${worldOf(i) + 1} · Level ${i + 1} · ${LEVELS[i].name}`;
    supporterThanks.classList.toggle('hidden', !P.supporter);
    refreshBadges();
  }

  function refreshBadges() {
    const n = claimable(P);
    trophyBadge.textContent = String(n);
    trophyBadge.classList.toggle('hidden', !n);
    const d = dailyChallenge(P, dateKey(new Date()), LEVELS);
    dailyDot.classList.toggle('hidden', !!d.done);
    refreshWallet();
  }

  return {
    show,
    hideAll,
    isOpen: () => !!ui.open,
    current: () => ui.open,
    refresh: () => {
      refreshBadges();
      if (ui.open === 'hub') renderHub();
    },
    flash,
    tick(dt) {
      if (ui.open === 'wardrobe') drawPreview(dt);
    },
  };
}

export { hatAnchor };
