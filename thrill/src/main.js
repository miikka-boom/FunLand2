// Thrill Hill: boot, frame loop, saving, and the flow between the park, the
// chests, the crew, raids and every sheet. Runs are simulated; this prototype
// is not connected to the action game.

import { Meta, newState } from './meta.js';
import { Clock } from './clock.js';
import { loadState, saveState, clearState, clearTuning, migrate, loadTuning, saveTuning, SAVE_KEY } from './save.js';
import { BUILDINGS, CLASSES, ZONES, THREATS, TUNING_DEFAULTS, RARITIES, GATE_GEMS } from './config.js';
import { displayName } from './people.js';
import { Park } from './park.js';
import { Hud } from './hud.js';
import { Modals, Toasts, esc, wait } from './ui.js';
import { survivorCard, buildingSheet, chestSheet, ladderSheet } from './sheets.js';
import { ChestOpening, revealNewcomer, driver, fadeStamp } from './opening.js';
import { RaidView } from './raid-view.js';
import { Crew } from './crew.js';
import { Fx } from './fx.js';
import { Sfx } from './audio.js';
import { Dev } from './dev.js';
import { icon } from './icons.js';
import { zoneBackdropSvg, buildingSvg, souvenirSvg } from './art.js';
import { coinSvg, gemSvg } from './chest-art.js';
import { face, name, threatChip, classTag } from './kit.js';

// --- State -------------------------------------------------------------------------------------------

const tuning = loadTuning();
let state = loadState();
const firstVisit = !state;
if (!state) state = newState(Date.now());
const clock = new Clock(state.clockOffset || 0);
const meta = new Meta(state, { clock, tuning });

const $ = (id) => document.getElementById(id);
const sfx = new Sfx();
sfx.setVolume(tuning.volume);
const sound = (n, o) => sfx.play(n, o);
const toasts = new Toasts($('toasts'));
const fx = new Fx($('fx'));
const ui = { confirm: null, chestSheet: null };
let busy = false;
let resetting = false; // reset/load in progress: never write the old state back
let staleTab = false; // another tab saved: this one must not overwrite it

function setBusy(v) {
  busy = v;
  document.body.classList.toggle('busy', v);
}

const haptic = (ms) => {
  if (!tuning.haptics) return;
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    // unsupported
  }
};

function save() {
  if (resetting || staleTab) return;
  state.clockOffset = clock.offset;
  // Only a visible page counts as "seen" (a tab left open in the background
  // must still get its welcome-back gift).
  if (!document.hidden) meta.touch();
  saveState(state);
}

// Another tab saved: stop writing here. A hidden tab reloads when it is shown
// again; a visible one asks first (two visible tabs never reload each other).
addEventListener('storage', (e) => {
  if (e.key !== SAVE_KEY || resetting || staleTab) return;
  staleTab = true;
  if (!document.hidden) showStale();
});
function showStale() {
  if (document.getElementById('stale')) return;
  const el = document.createElement('div');
  el.id = 'stale';
  el.innerHTML = `<div class="tc-in"><h2>Playing in another tab</h2><p>Thrill Hill was saved from another tab or window.</p><button class="btn yellow big" type="button">Play here</button></div>`;
  el.addEventListener('click', () => location.reload());
  document.body.appendChild(el);
}

const modals = new Modals($('modals'), { onAct: (a, d, el) => act(a, d, el), now: () => meta.now(), sound });
const hud = new Hud($('hud'), meta, (a, d, el) => act(a, d, el));
const park = new Park($('park'), meta, {
  onBuilding: (id) => guard(() => openBuilding(id)),
  onPerson: (id) => guard(() => openCard(id)),
  onWheel: () => guard(() => openLadder()),
  onGift: (el) => guard(() => claimGift(el)),
  sound,
  fx,
});
const overlay = $('overlay');
const opening = new ChestOpening(overlay, { meta, hud, park, fx, sound, haptic });
const raidView = new RaidView(overlay, { meta, hud, fx, sound, haptic });
const crew = new Crew(overlay, {
  meta,
  sound,
  fx,
  onCard: (id) => openCard(id),
  onGo: () => startRaid(),
  onChange: () => {
    save();
    refresh();
  },
});
const dev = new Dev($('dev'), {
  meta,
  clock,
  toast: (m) => toasts.show(esc(m)),
  onTuning: (key) => {
    if (key === '*defaults') Object.assign(tuning, TUNING_DEFAULTS);
    saveTuning(tuning);
    sfx.setVolume(tuning.volume);
    refresh();
  },
  onCheat: (fn) => {
    const r = fn();
    save();
    refresh(true);
    if (r && r.zones && r.zones.length) document.getElementById('toasts').replaceChildren();
    if (r && r.zones && r.zones.length) {
      dev.hide();
      setBusy(true);
      (async () => {
        try {
          for (const z of r.zones) await zoneSplash(z);
        } catch (e) {
          recover(e);
        } finally {
          setBusy(false);
          save();
          refresh(true);
        }
      })();
    }
    return r;
  },
  onReset: () => {
    resetting = true;
    clearState();
    clearTuning();
    location.reload();
  },
  onExport: async () => {
    save();
    try {
      await navigator.clipboard.writeText(JSON.stringify(state));
      toasts.show('Save copied');
    } catch {
      const box = $('dev').querySelector('.savebox');
      box.classList.remove('hidden');
      box.value = JSON.stringify(state);
      box.select();
    }
  },
  onImport: (txt) => {
    try {
      const obj = JSON.parse(txt);
      if (!obj || !Array.isArray(obj.people) || !obj.people.length) throw new Error('not a save');
      const s = migrate(obj);
      resetting = true;
      saveState(s);
      location.reload();
    } catch {
      toasts.show('That save did not load', 'warn');
    }
  },
});

// Arm the back button whenever a sheet, the crew screen or the drawer opens.
{
  const mo = modals.open.bind(modals);
  modals.open = (...args) => {
    arm();
    return mo(...args);
  };
  const co = crew.open.bind(crew);
  crew.open = () => {
    arm();
    co();
  };
  const ds = dev.show.bind(dev);
  dev.show = () => {
    arm();
    ds();
  };
}

function refresh(full = false) {
  hud.update();
  park.update(full);
  if (modals.isOpen) modals.render();
  if (crew.isOpen) crew.render();
}

function guard(fn) {
  if (busy || crew.isOpen) return;
  sfx.unlock();
  fn();
}

/** Something threw mid-sequence: clear the overlays and unfreeze the HUD so the game goes on. */
function recover(e) {
  console.error(e);
  overlay.innerHTML = '';
  overlay.classList.remove('on');
  hud.thaw();
  park.paused = false;
  toasts.show('Oops, that went wrong. The game carries on.', 'warn');
}

// The same action on the same thing twice within this many ms is a double tap.
const DOUBLE_TAP = 380;
let lastAct = { key: '', t: 0 };

// --- Actions ----------------------------------------------------------------------------------------

function act(a, d, el) {
  sfx.unlock();
  const id = d && d.id !== undefined ? (Number.isNaN(Number(d.id)) ? d.id : Number(d.id)) : null;
  if (a !== 'hint') {
    const key = `${a}:${id ?? (d && d.k) ?? ''}`;
    const now = performance.now();
    if (key === lastAct.key && now - lastAct.t < DOUBLE_TAP) return;
    lastAct = { key, t: now };
  }
  switch (a) {
    case 'hint':
      return showHint();
    case 'dev':
      return dev.toggle();
    case 'ladder':
      if (!busy) openLadder();
      return;
    case 'chest':
      if (!busy && !crew.isOpen) chestTap(d.k);
      return;
    case 'crew':
      if (!busy) {
        modals.close();
        crew.open();
      }
      return;
    case 'face': {
      // A face that can level up opens its card; otherwise the crew screen.
      if (busy) return;
      const p = meta.person(id);
      if (p && meta.canLevel(p)) return openCard(id);
      modals.close();
      crew.open();
      return;
    }
    case 'best':
      return useBest(el);
    case 'play':
      if (!busy) startRaid();
      return;
    // Sheets.
    case 'card':
      return openCard(id);
    case 'level':
      return levelUp(id, el);
    case 'squad': {
      const p = meta.person(id);
      const wasIn = meta.inSquad(id);
      const before = meta.s.squad.slice();
      const r = wasIn ? meta.toggleSquad(id) : meta.s.squad.length < 3 ? meta.toggleSquad(id) : replaceWeakest(id);
      if (!r.ok) {
        sound('error');
        toasts.show(esc(r.reason), 'warn');
      } else {
        sound('tap');
        const out = before.find((x) => !meta.s.squad.includes(x) && x !== id);
        const o = out != null ? meta.person(out) : null;
        toasts.show(wasIn ? `<b>${name(p)}</b> left the squad` : `<b>${name(p)}</b> joins the squad${o ? ` (for ${name(o)})` : ''}`);
      }
      save();
      return refresh();
    }
    case 'cancel':
      ui.confirm = null;
      return modals.render();
    case 'upgrade':
      return upgrade(id, el);
    case 'openchest':
      modals.close();
      return chestTap(d.k);
    case 'opennow':
      ui.confirm = { kind: 'opennow', id: d.k };
      modals.render();
      modals.guard(450); // the confirm button lands where this one was
      return;
    case 'opennow2': {
      const r = meta.openNow(d.k);
      ui.confirm = null;
      if (!r.ok) {
        sound('error');
        toasts.show(esc(r.reason), 'warn');
        return modals.render();
      }
      sound('gem');
      save();
      modals.close();
      return chestTap(d.k);
    }
    default:
  }
}

function replaceWeakest(id) {
  const pre = meta.raidPreview();
  const weakest = pre.members.slice().sort((a, b) => a.power - b.power)[0];
  const slot = meta.s.squad.indexOf(weakest.id);
  return meta.putInSlot(id, slot);
}

function useBest(el) {
  const before = meta.raidPreview().S;
  const r = meta.useBest();
  if (!r.ok) return;
  const after = meta.raidPreview().S;
  sound('levelUp');
  if (el) {
    fx.burst(el, ['#ffd36b', '#62e6ff', '#ffffff'], 16, 70);
    if (after > before) fx.float(el, `${icon('crown')}${Math.round(meta.raidPreview().three * 100)}%`, 'good');
  }
  save();
  refresh();
}

function levelUp(id, el) {
  const p = meta.person(id);
  const r = meta.levelUp(id);
  if (!r.ok) {
    sound('error');
    toasts.show(esc(r.reason), 'warn');
    if (el) fx.shake(el);
    return;
  }
  sound('levelUp');
  haptic(30);
  save();
  refresh();
  // The card re-rendered: celebrate on it. The power ticks up, a stamp lands, the park figure cheers.
  const faceEl = $('modals').querySelector('.cs-face') || el;
  fx.burst(faceEl, ['#7dffa1', '#ffd36b', '#ffffff'], 30, 130);
  fx.stamp(faceEl, `Lv ${r.to}!`, 'ready');
  fx.pop(faceEl, 1.1);
  const pwEl = $('modals').querySelector('.cs-power .pw b');
  if (pwEl) {
    const from = Math.round(r.powerBefore);
    const to = Math.round(r.powerAfter);
    for (let v = from; v <= to; v++) setTimeout(() => {
      pwEl.textContent = String(v);
      if (v > from) sound('coin', { pitch: (v - from) / Math.max(1, to - from) });
    }, (v - from) * Math.min(90, 420 / Math.max(1, to - from)));
  }
  park.cheerPerson(id);
  ui.capRaids = true; // shown once this card closes
  void p;
}

function upgrade(id, el) {
  const r = meta.upgrade(id);
  if (!r.ok) {
    sound('error');
    toasts.show(esc(r.reason), 'warn');
    if (el) fx.shake(el);
    return;
  }
  sound('upgrade');
  haptic(30);
  const B = BUILDINGS[id];
  const target = park.buildingEl(id) || el;
  fx.confetti(target, 40);
  fx.float(target, B.kind === 'ride' ? `+10% ${CLASSES[B.cls].plural}` : B.kind === 'coins' ? '+10% raid coins' : `Lv ${r.level}!`, 'good');
  park.cheerAt(id);
  save();
  refresh();
}

// --- Sheets -------------------------------------------------------------------------------------------

function openCard(id) {
  ui.confirm = null;
  modals.open(() => survivorCard(meta, id, ui), {
    cls: 'm-card',
    onClose: (replaced) => {
      if (!replaced && ui.capRaids && meta.once('cap.raids')) setTimeout(() => caption(`<b>Raids</b> bring coins and Skulls. <b>Coins</b> pay for everything.`, hud.target('play')), 350);
      ui.capRaids = false;
    },
  });
}

function openBuilding(id) {
  ui.confirm = null;
  if (BUILDINGS[id].kind === 'chest') return openChestSheet(id);
  modals.open(() => buildingSheet(meta, id), { cls: 'm-bld' });
}

function openChestSheet(kind) {
  ui.confirm = null;
  ui.chestSheet = { kind, ready: meta.chestState(kind).ready };
  modals.open(() => chestSheet(meta, kind, ui), { cls: 'm-chest', onClose: () => (ui.chestSheet = null) });
}

function openLadder() {
  modals.open(() => ladderSheet(meta), { cls: 'm-ladder' });
}

// --- Chests -------------------------------------------------------------------------------------------

async function chestTap(kind) {
  if (busy) return;
  const st = meta.chestState(kind);
  if (!st.ready) return openChestSheet(kind);
  const res = meta.openChest(kind);
  if (!res.ok) {
    sound('error');
    return toasts.show(esc(res.reason), 'warn');
  }
  save();
  arm();
  setBusy(true);
  hud.hideHand();
  modals.close();
  let out = { next: null };
  try {
    out = await opening.play(res);
  } catch (e) {
    recover(e);
  } finally {
    setBusy(false);
    save();
    refresh();
  }
  if (out.next === 'level') openCard(out.id);
  else if (out.next === 'best') useBest(hud.target('best'));
  else if (meta.once('cap.chests')) caption(`<b>Chests</b> bring people and Badges.`, hud.target(kind));
}

/** Show newcomers outside a chest (a stray, a gate gift). */
async function showNewcomers(list, title) {
  const el = document.createElement('div');
  el.className = 'reveal-ov';
  el.innerHTML = `<div class="op-dim"></div><div class="rv-title">${title}</div><div class="op-stage"></div><div class="op-hint"></div>`;
  overlay.appendChild(el);
  overlay.classList.add('on');
  requestAnimationFrame(() => el.classList.add('in'));
  const drv = driver(el);
  const stage = el.querySelector('.op-stage');
  for (const nc of list) {
    stage.innerHTML = '';
    const p = nc.person;
    const card = await revealNewcomer(stage, p, { meta, fx, sound, drv });
    fadeStamp(fx.stamp(card, 'MOVES IN!', 'in'));
    sound('moveIn');
    park.arrive(p.id);
    await drv.pause(500);
    el.querySelector('.op-hint').textContent = 'Tap to continue';
    await drv.tap();
    el.querySelector('.op-hint').textContent = '';
  }
  el.classList.remove('in');
  el.classList.add('out');
  await wait(240);
  el.remove();
  if (!overlay.children.length) overlay.classList.remove('on');
  save();
  refresh();
}

// --- Raids --------------------------------------------------------------------------------------------

async function startRaid() {
  if (busy) return;
  modals.close();
  const r = meta.raid();
  if (!r.ok) {
    sound('error');
    return toasts.show(esc(r.reason), 'warn');
  }
  save();
  arm();
  setBusy(true);
  hud.hideHand();
  let res = 'park';
  try {
    res = await raidView.play(r, {
      after: async () => {
        if (r.stray) await showNewcomers([r.stray], 'A stray followed you home!');
        for (const z of r.zones) await zoneSplash(z);
      },
    });
  } catch (e) {
    recover(e);
  } finally {
    setBusy(false);
    save();
    refresh(true);
  }
  if (res === 'again') startRaid();
  else if (res && res.fix) applyFix(res.fix);
}

function applyFix(f) {
  if (f.kind === 'best') return useBest(hud.target('best'));
  if (f.kind === 'swap') {
    const sq = meta.s.squad.slice();
    const i = f.out != null ? sq.indexOf(f.out) : -1;
    if (i >= 0) sq[i] = f.in;
    else sq.push(f.in);
    meta.setSquad(sq);
    const p = meta.person(f.in);
    sound('levelUp');
    toasts.show(`<b>${p ? name(p) : ''}</b> joins the squad`);
    save();
    refresh();
    const faceEl = hud.target(f.in);
    if (faceEl) fx.burst(faceEl, ['#ffd36b', '#62e6ff', '#ffffff'], 18, 70);
  } else if (f.kind === 'level') openCard(f.id);
  else if (f.kind === 'build') openBuilding(f.id);
}

async function zoneSplash(z) {
  hud.update();
  const el = document.createElement('div');
  el.className = 'zone-splash';
  const Z = ZONES[z.zone - 1];
  const items = [`<div class="zi">${icon('gem')}<b>+${GATE_GEMS} gems</b></div>`, `<div class="zi">${icon('up')}<b>Buildings up to Lv ${z.maxLevel}</b></div>`];
  for (const id of z.unlocked) items.push(`<div class="zi big"><span class="zart">${buildingSvg(id, 1, {})}</span><b>${esc(BUILDINGS[id].name)} opens</b></div>`);
  for (const t of z.newThreats) items.push(`<div class="zi">${threatChip(t)}<b>New: ${esc(THREATS[t].name)}</b><span>${CLASSES[THREATS[t].by].plural} counter them</span></div>`);
  if (z.souvenir) items.push(`<div class="zi"><span class="zsv">${souvenirSvg(z.souvenir)}</span><b>A souvenir for the park</b></div>`);
  if (z.gift) {
    const gp = z.gift.person;
    items.push(`<div class="zi">${icon('gift')}<b>A ${gp.golden ? 'golden ' : ''}${RARITIES[gp.rarity].name} ${CLASSES[gp.cls].name} walks in</b><span>counters ${THREATS[CLASSES[gp.cls].counters].name}</span></div>`);
  }
  el.innerHTML =
    `<div class="zs-back">${zoneBackdropSvg(z.zone)}</div><div class="zs-in"><div class="kicker">Zone ${z.zone} reached</div><h1>${esc(Z.name)}</h1>` +
    `<div class="zs-items">${items.join('')}</div><div class="op-hint">Tap to continue</div></div>`;
  overlay.appendChild(el);
  overlay.classList.add('on');
  requestAnimationFrame(() => el.classList.add('in'));
  sound('zone');
  haptic(60);
  fx.confetti(null, 90);
  const drv = driver(el);
  await drv.pause(900);
  await drv.tap();
  el.classList.remove('in');
  el.classList.add('out');
  await wait(260);
  el.remove();
  park.update(true);
  if (z.gift) await showNewcomers([z.gift], `A gift from ${esc(Z.name)}!`);
}

// --- Gifts, hints, captions ------------------------------------------------------------------------------

function claimGift(el) {
  const g = meta.s.gift;
  if (!g) return;
  const who = meta.person(g.id);
  const r = meta.claimGift();
  if (!r.ok) return;
  sound(r.kind === 'gems' ? 'gem' : r.kind === 'coins' ? 'coin' : 'badge');
  haptic(20);
  const from = el.getBoundingClientRect();
  if (r.kind === 'coins') fx.fly({ from, to: hud.target('coins'), html: coinSvg(), count: 6, onEach: () => sound('coin', { pitch: Math.random() }) });
  else if (r.kind === 'gems') fx.fly({ from, to: hud.target('gems'), html: gemSvg(), count: 3 });
  fx.burst(from, ['#ffd36b', '#ff8ad8', '#62e6ff'], 16, 70);
  const what = r.kind === 'coins' ? `${r.amount} coins` : r.kind === 'gems' ? `${r.amount} gems` : `${r.amount} Badges for themselves`;
  toasts.show(`${icon('gift')}<b>${who ? name(who) : 'Someone'}</b> brought ${what}!${who ? ` <i>“${esc(who.quirk)}”</i>` : ''}`, 'gift', 3600);
  save();
  refresh();
}

let captionTimer = 0;
let captionUntil = 0; // the idle hand waits while a one-time caption shows
function caption(html, near = null) {
  const r = near ? near.getBoundingClientRect() : { left: innerWidth / 2 - 10, top: innerHeight * 0.3, width: 20, height: 20, bottom: innerHeight * 0.3 + 20 };
  hud.hideHand();
  hud.caption(html, r);
  captionUntil = performance.now() + 4200;
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => hud.el.caption.classList.remove('show'), 4200);
}

/** The idle hand guides the first session only; after that the glows do the job. */
const ONBOARDING_RAIDS = 8;
function showHint() {
  if (busy || modals.isOpen || crew.isOpen || dev.open || $('title-card')) return;
  if (meta.s.stats.raids >= ONBOARDING_RAIDS && meta.s.stats.levelUps >= 3) return;
  const step = meta.nextStep();
  let el = null;
  let label = '';
  if (step.kind === 'chest') el = hud.target(step.id);
  else if (step.kind === 'ready') {
    // A squad face in the HUD, else the walker's figure in the park, else the squad button.
    const w = park.walkerEl(step.id);
    el = meta.inSquad(step.id) ? hud.target(step.id) : (w && w.querySelector('.wfig')) || hud.target('squad');
    const p = meta.person(step.id);
    if (p && meta.s.stats.levelUps < 3) label = `<b>${name(p)}</b> is READY. Tap to level up.`;
  } else if (step.kind === 'gift') el = park.giftEl();
  else if (step.kind === 'best') {
    el = hud.target('best');
    if (meta.s.stats.raids < 4) label = 'BEST picks the strongest squad for this threat.';
  } else if (step.kind === 'build') el = park.buildingEl(step.id);
  else if (step.kind === 'play') {
    el = hud.target('play');
    if (meta.s.raids === 0) {
      const dot = meta.s.people[0];
      label = `<b>${name(dot)}:</b> Zombies at the fence again! Let's bonk some.`;
    } else if (meta.s.raids === 1) {
      label = 'Three waves, a crown for each one you clear.';
    }
  }
  if (el) hud.pointAt(el, label);
  // Point at a face from below so the floating BEST pill never covers the finger.
}

// --- Title card (first visit) --------------------------------------------------------------------------

function titleCard() {
  const el = document.createElement('div');
  el.id = 'title-card';
  const founders = meta.s.people.map((p) => `<span class="tc-p">${face(p, { size: 64, lv: false })}<b>${name(p)}</b><small>${CLASSES[p.cls].name}</small></span>`).join('');
  el.innerHTML =
    `<div class="tc-in"><div class="kicker">FunLand2 · metagame prototype</div><h1>THRILL HILL</h1>` +
    `<p>A theme park on a hill. Zombies outside. Your people inside.</p><div class="tc-ppl">${founders}</div>` +
    `<button class="btn yellow big" type="button">${icon('play')}Let's go!</button>` +
    `<p class="note">Raids are simulated. The gear (top right) has testing tools.</p></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  el.addEventListener('click', () => {
    sfx.unlock();
    sound('open');
    el.classList.remove('in');
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
    hud.poke();
    hud.idle = 2500;
  });
}

// --- Back button, keys, visibility ---------------------------------------------------------------------

function back() {
  if (dev.open) {
    dev.hide();
    return true;
  }
  if (modals.back()) return true;
  if (crew.isOpen) {
    crew.close();
    return true;
  }
  return false;
}

// The phone's back button closes sheets and screens. One history entry is
// "armed" whenever something is open; on the bare park, back leaves the game.
let armed = false;
function arm() {
  if (armed) return;
  try {
    history.pushState({ thrill: 1 }, '');
    armed = true;
  } catch {
    // no history API
  }
}
addEventListener('popstate', () => {
  armed = false;
  if (back() || busy) arm();
});
arm();

addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.key === '`') dev.toggle();
  else if (e.key === 'Escape') back();
  else if (e.key === 'm' || e.key === 'M') {
    tuning.volume = tuning.volume > 0 ? 0 : TUNING_DEFAULTS.volume;
    sfx.setVolume(tuning.volume);
    saveTuning(tuning);
    toasts.show(tuning.volume ? 'Sound on' : 'Sound off');
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    save();
    sfx.suspend();
  } else {
    if (staleTab) {
      location.reload();
      return;
    }
    sfx.resume();
    const g = meta.arrive();
    if (g) {
      refresh();
      toasts.show(`${icon('gift')}Someone has a gift for you`, 'gift');
    }
    save();
    refresh();
  }
});
addEventListener('pagehide', save);

// --- Frame loop ---------------------------------------------------------------------------------------

let last = performance.now();
let tickT = 0;
function frame(now) {
  const dt = Math.min(100, now - last);
  last = now;
  clock.advance(dt);
  const canHint = !busy && !modals.isOpen && !crew.isOpen && !dev.open && !$('title-card') && performance.now() > captionUntil;
  hud.hintDelay = meta.s.stats.raids < 3 ? 1400 : 4000;
  hud.animate(dt, canHint);
  park.tick(dt);
  tickT += dt;
  if (tickT > 250) {
    tickT = 0;
    modals.tick();
    // A chest sheet re-renders when its chest becomes ready (no stale "Open now").
    if (ui.chestSheet && modals.isOpen) {
      const ready = meta.chestState(ui.chestSheet.kind).ready;
      if (ready !== ui.chestSheet.ready) {
        ui.chestSheet.ready = ready;
        ui.confirm = null;
        modals.render();
      }
    }
  }
  requestAnimationFrame(frame);
}

// --- Boot ----------------------------------------------------------------------------------------------

refresh(true);
if (firstVisit) titleCard();
else {
  const g = meta.arrive();
  if (g) setTimeout(() => toasts.show(`${icon('gift')}Someone has a gift for you`, 'gift'), 800);
}
save();
setInterval(() => {
  if (!document.hidden) save();
}, 10000);
document.documentElement.classList.add('booted');
requestAnimationFrame(frame);

window.__thrill = { meta, clock, hud, park, act, sfx, fx, refresh, startRaid, chestTap, get state() { return meta.s; } };
void displayName;
void classTag;
