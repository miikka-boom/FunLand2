// Safehouse metagame prototype: boot, frame loop, save/resume, offline
// catch-up and the action dispatcher that connects the base view, HUD and
// layers to the economy. Not connected to the action game: PLAY runs a
// simulated mission (mission-sim.js) in its place.

import { Safehouse, newState } from './economy.js';
import { Clock } from './clock.js';
import { loadState, saveState, clearState, migrate, loadTuning, saveTuning } from './save.js';
import { STATIONS, RESOURCES, ITEMS, SURVIVORS, WEAPONS, ATTACHMENTS, WEAPON_TIERS } from './config.js';
import { MOVE_IN } from './story.js';
import { BaseView } from './base-view.js';
import { Hud } from './hud.js';
import { Layers, Toasts, esc } from './ui.js';
import * as P from './sheets.js';
import { MissionView } from './mission-view.js';
import { Fx } from './fx.js';
import { Sfx } from './audio.js';
import { DevPanel } from './dev-panel.js';
import { icon } from './icons.js';
import { artDefs } from './art.js';
import { fmtNum, fmtTime } from './format.js';

// --- State -----------------------------------------------------------------------------------------

const tuning = loadTuning();
let state = loadState();
const firstVisit = !state || !state.intro;
if (!state) state = newState(Date.now());
const clock = new Clock(state.clockOffset || 0);
let sh = new Safehouse(state, { clock, tuning });

const $ = (id) => document.getElementById(id);
const FACE_CLIP = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><clipPath id="sh-face-clip"><circle cx="32" cy="32" r="31"/></clipPath></defs></svg>';
document.body.insertAdjacentHTML('afterbegin', artDefs() + FACE_CLIP);
const sfx = new Sfx();
sfx.setVolume(tuning.volume);
const sound = (n) => sfx.play(n);
const toasts = new Toasts($('toasts'));
const fx = new Fx($('fx'));
const missionView = new MissionView($('mission'), sound);
const ctx = { mission: null };

const haptic = (ms) => {
  if (!tuning.haptics) return;
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    // unsupported
  }
};

const layers = new Layers($('layers'), { onAct: (a, d, el) => act(a, d, el), now: () => sh.now(), sound });
const base = new BaseView($('base'), sh, {
  onRoom: (id) => {
    sfx.unlock();
    sound('tap');
    openStation(id);
  },
  onCollect: (id, el) => {
    sfx.unlock();
    collectYard(el.getBoundingClientRect());
  },
});
const hud = new Hud($('top'), $('bottom'), sh, (a, d, el) => {
  sfx.unlock();
  act(a, d, el);
});
const dev = new DevPanel($('dev'), {
  get sh() {
    return sh;
  },
  clock,
  onTuning: (key) => {
    saveTuning(tuning);
    if (key === 'volume' || key === '*') sfx.setVolume(tuning.volume);
    if (key === 'notify' && tuning.notify) askNotify();
    sh.changed();
  },
  onCheat: (what) => cheat(what),
  onReset: () => {
    clearState();
    state = newState(Date.now());
    clock.offset = 0;
    clock.speed = 1;
    rebind(state);
    dev.hide();
    toasts.show('Fresh Safehouse');
    showIntro();
  },
  onExport: () => JSON.stringify(save()),
  onImport: (json) => {
    try {
      const s = migrate(JSON.parse(json));
      clock.offset = s.clockOffset || 0;
      rebind(s);
      save();
      return true;
    } catch {
      return false;
    }
  },
  toast: (t) => toasts.show(esc(t)),
});

/** Swap in a different save (reset / import). */
function rebind(s) {
  state = s;
  sh = new Safehouse(state, { clock, tuning });
  base.sh = sh;
  hud.sh = sh;
  base.artKey = {};
  base.cache.clear();
  hud.cache.clear();
  for (const r of RESOURCES) hud.shown[r] = Math.floor(sh.s.res[r]);
  layers.close();
  base.update();
  hud.update();
}

// --- Saving and coming back ------------------------------------------------------------------------------

function save() {
  state.lastSeen = sh.now();
  state.clockOffset = clock.offset;
  saveState(state);
  return state;
}

/** Finish everything that happened while away; maybe show a summary. */
function catchUp(since) {
  sh.tick();
  const events = sh.drain();
  const awayMs = sh.now() - since;
  const worth = events.some((e) => ['built', 'crafted', 'yardFull', 'movedIn', 'orderNew'].includes(e.type));
  if (awayMs >= tuning.awayMinutes * 60000 && worth && !layers.isOpen && state.intro) {
    layers.enqueue(() => layers.open(() => P.welcomePanel(sh, { awayMs, events }), { kind: 'modal', cls: 'm-welcome' }));
    for (const e of events) if (e.type === 'stage') layers.enqueue(() => openStage(e.index));
  } else onEvents(events);
}

// --- Opening things -------------------------------------------------------------------------------------------

function openStation(id) {
  sh.markSeen(id);
  layers.open(() => P.stationSheet(sh, id), { kind: 'sheet', cls: `st-${id}`, key: id });
}

function openPrep(id) {
  ctx.mission = id && sh.missionDef(id) ? id : sh.nextMission();
  layers.open(() => P.prepPanel(sh, ctx), { kind: 'full', cls: 'm-prep', key: 'prep' });
  requestAnimationFrame(() => {
    const sel = document.querySelector('#layers .prep-list .ms.sel');
    if (sel) sel.scrollIntoView({ block: 'center' });
  });
}

function openStage(index) {
  sound('stage');
  haptic([30, 40, 60]);
  layers.open(() => P.stagePanel(sh, index), { kind: 'modal', cls: 'm-stage' });
  setTimeout(() => fx.burst(innerWidth / 2, innerHeight * 0.3), 150);
}

function openScene(key) {
  sound('radio');
  layers.open(() => P.scenePanel(key), { kind: 'modal', cls: 'm-scene' });
}

function showIntro() {
  layers.open(() => P.introPanel(), {
    kind: 'modal',
    cls: 'm-intro',
    dismissable: false,
    onClose: () => {
      state.intro = true;
      save();
      sfx.unlock();
      if (document.documentElement.classList.contains('is-touch')) enterFullscreen();
      setTimeout(() => base.focus('barricade'), 300);
    },
  });
}

/** Android / desktop; iOS uses Add to Home Screen. */
function enterFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

// --- FX helpers ---------------------------------------------------------------------------------------------------

function flyLoot(loot, from) {
  let delay = 0;
  for (const k of RESOURCES) {
    const n = loot[k] || 0;
    if (n <= 0) continue;
    const to = hud.target(k);
    if (!to) continue;
    const count = Math.min(8, 2 + Math.floor(Math.log2(n + 1)));
    hud.hold(k, delay + 650);
    const d = delay;
    setTimeout(() => {
      fx.fly({ from, to, html: icon(k), count, onEach: () => (sound('coin'), hud.bump(k)) });
    }, d);
    delay += 130;
  }
}

function flyFromLayer(loot) {
  const el = document.querySelector('#layers .paid .loot') || document.querySelector('#layers .layer');
  const rect = el ? el.getBoundingClientRect() : { x: innerWidth / 2, y: innerHeight / 2, width: 0, height: 0 };
  flyLoot(loot, rect);
  hud.thaw();
}

const centre = () => ({ x: innerWidth / 2, y: innerHeight / 2, width: 0, height: 0 });

// --- Actions ---------------------------------------------------------------------------------------------------------

const FAIL = {
  maxed: 'Already at max level',
  idle: 'Nothing to cancel',
  empty: 'Nothing to collect yet',
  full: 'The pile is full: collect it first',
  locked: 'Not unlocked yet',
  notDone: 'Not done yet',
  notHoused: 'They need a bunk first',
  mission: 'Mission not found',
  recipe: 'Unknown recipe',
};

function fail(r) {
  sound('error');
  const text = r.blocker ? P.blockerText(r.blocker) : FAIL[r.reason] || r.reason;
  toasts.show(`${icon('warn')}${esc(text)}`, 'bad');
  return false;
}

function collectYard(rect) {
  const r = sh.collectYard();
  if (!r.ok) return fail(r);
  sound('collect');
  haptic(12);
  const from = rect || base.rectOf('scrapyard') || centre();
  fx.float(from.x + from.width / 2, from.y + from.height * 0.3, `+${fmtNum(r.got)}`, 'res');
  flyLoot({ scrap: r.got }, from);
  if (r.state === 'waiting') toasts.show(`${icon('power')}The yard's next run waits for power or Fuel`, 'warn');
  return true;
}

function cheat(what) {
  const now = sh.now();
  if (what === 'scrap') sh.cheat({ scrap: 1000 });
  else if (what === 'parts') sh.cheat({ parts: 100 });
  else if (what === 'supplies') sh.cheat({ supplies: 100 });
  else if (what === 'fuel') sh.cheat({ fuel: 20 });
  else if (what === 'finish') sh.finishAll();
  else if (what === 'chapter') {
    const r = sh.clearNextChapter();
    if (r.ok) {
      toasts.show(`${icon('flag')}Chapter ${r.n} cleared`, 'good');
      for (const sc of r.summary.scenes) layers.enqueue(() => openScene(sc));
    } else toasts.show('Every chapter is cleared');
  } else if (what === 'bond') sh.addBondXp(500);
  if (now !== sh.now()) sh.tick();
  save();
}

function act(name, d = {}, el = null) {
  sfx.unlock();
  const rect = el ? el.getBoundingClientRect() : null;
  let r;
  switch (name) {
    case 'open':
      sound('tap');
      openStation(d.id);
      return;
    case 'res':
      layers.open(() => P.resourceHelp(sh, d.res), { kind: 'sheet', cls: 'm-help' });
      return;
    case 'power':
      layers.open(() => P.powerHelp(sh), { kind: 'sheet', cls: 'm-help' });
      return;
    case 'stage':
      openStage(sh.s.stage);
      return;
    case 'builds':
      layers.open(() => P.buildsSheet(sh), { kind: 'sheet', cls: 'm-builds' });
      return;
    case 'crate':
      layers.open(() => P.crateSheet(sh), { kind: 'sheet', cls: 'm-crate' });
      return;
    case 'guide': {
      const st = sh.stageInfo();
      const next = st && st.next;
      if (!next || next.focus === 'play') {
        openPrep(sh.nextMission());
        return;
      }
      layers.close();
      base.focus(next.focus);
      setTimeout(() => openStation(next.focus), 260);
      return;
    }
    case 'play':
      sound('tap');
      openPrep(sh.nextMission());
      return;
    case 'prep':
      openPrep(d.id);
      return;
    case 'pick':
      ctx.mission = d.id;
      sound('tap');
      break;
    case 'upgrade': {
      const first = sh.level(d.id) === 0;
      r = sh.startUpgrade(d.id);
      if (!r.ok) return fail(r);
      haptic(15);
      if (!r.instant) {
        // Instant builds celebrate through their 'built' event.
        sound('build');
        toasts.show(`${icon('hammer')}${esc(STATIONS[d.id].name)}: ${first ? 'building' : 'upgrading'} (${fmtTime((r.end - sh.now()) / 1000)})`);
      }
      break;
    }
    case 'cancelBuild':
      r = sh.cancelBuild(d.id);
      if (!r.ok) return fail(r);
      sound('tap');
      toasts.show(`${icon('cancel')}Cancelled: everything refunded`);
      break;
    case 'craft':
      r = sh.queueCraft(d.recipe);
      if (!r.ok) return fail(r);
      sound('craft');
      haptic(10);
      break;
    case 'cancelJob':
      r = sh.cancelJob(Number(d.uid));
      if (!r.ok) return fail(r);
      sound('tap');
      break;
    case 'collectYard':
      collectYard(rect);
      break;
    case 'startYard':
      r = sh.startYard();
      if (!r.ok) return fail(r);
      sound('build');
      if (r.state === 'waiting') toasts.show(`${icon('power')}Queued: waits for power or Fuel`, 'warn');
      break;
    case 'stopYard':
      r = sh.stopYard();
      if (!r.ok) return fail(r);
      sound('tap');
      toasts.show(`${icon('power')}Scrap Yard stopped: 1 power freed`);
      break;
    case 'upgradeWeapon':
      r = sh.upgradeWeapon(d.id);
      if (!r.ok) return fail(r);
      sound('done');
      haptic(15);
      toasts.show(`${icon(d.id)}${esc(WEAPONS[d.id].name)} ${WEAPON_TIERS[r.tier - 1].name}`, 'good');
      break;
    case 'pickSurvivor':
      r = sh.pickSurvivor(d.id);
      if (!r.ok) return fail(r);
      sound('tap');
      break;
    case 'friend':
      sh.setFriend(d.kind || null);
      sound('tap');
      break;
    case 'weapon':
      sh.setWeapon(d.id);
      sound('tap');
      break;
    case 'slot':
      r = sh.setSlot(d.slot, d.item);
      if (!r.ok) return fail(r);
      sound('tap');
      break;
    case 'savePreset':
      r = sh.savePreset(Number(d.i));
      if (!r.ok) return fail(r);
      toasts.show(`Preset ${String.fromCharCode(65 + Number(d.i))} saved`);
      break;
    case 'applyPreset':
      r = sh.applyPreset(Number(d.i));
      if (!r.ok) return fail(r);
      sound('tap');
      break;
    case 'claimOrder':
      r = sh.claimOrder(Number(d.uid));
      if (!r.ok) return fail(r);
      sound('collect');
      flyLoot(r.got, rect || centre());
      if (r.overflowScrap) toasts.show(`${icon('warn')}Over the cap: ${fmtNum(r.overflowScrap)} Scrap instead`, 'warn');
      break;
    case 'collectAll': {
      const from = rect || centre();
      if (sh.level('scrapyard') && sh.yardPile() >= 1) collectYard(from);
      for (const o of [...sh.orders()]) {
        if (!o.done) continue;
        const c = sh.claimOrder(o.uid);
        if (c.ok) flyLoot(c.got, from);
      }
      layers.close();
      break;
    }
    case 'start':
      startMission(d.id);
      return;
    case 'why':
      toasts.show(`${icon('info')}${esc(d.text)}`);
      return;
    case 'dev':
      dev.toggle();
      return;
    default:
      return;
  }
  save();
  layers.refresh(true);
}

function startMission(id) {
  if (missionView.busy) return;
  const r = sh.planMission(id);
  if (!r.ok) return fail(r);
  layers.close();
  document.body.classList.add('in-mission');
  missionView.play(r.report, r.loadout, () => {
    document.body.classList.remove('in-mission');
    // You were out for the length of the mission: the Safehouse kept going.
    if (tuning.missionTime) clock.warp(r.report.timeS * 1000);
    sh.tick();
    hud.freeze(); // counters tick up when the loot flies in, not behind the results
    r.report.loadout = r.loadout;
    const summary = sh.applyMission(r.report);
    layers.open(() => P.resultsPanel(sh, r.report, summary), {
      kind: 'modal',
      cls: `m-results ${r.report.won ? 'won' : 'lost'}`,
      onClose: () => flyFromLayer(summary.got),
    });
    for (const sc of summary.scenes) layers.enqueue(() => openScene(sc));
    save();
  });
}

// --- Events from the economy -----------------------------------------------------------------------------------------

function roomBurst(id) {
  const rr = base.rectOf(id);
  if (rr && rr.bottom > 0 && rr.top < innerHeight) fx.burst(rr.x + rr.width / 2, rr.y + rr.height * 0.5, undefined, 14);
}

/** Handle a batch of events; several crafts finishing at once share one toast. */
function onEvents(list) {
  const crafted = list.filter((e) => e.type === 'crafted');
  if (crafted.length > 1) {
    sound('craft');
    toasts.show(`${crafted.map((e) => icon(e.item)).join('')}${crafted.length} crafts are in the crate`, 'good');
    hud.bump('crate');
  }
  for (const e of list) if (!(e.type === 'crafted' && crafted.length > 1)) onEvent(e);
}

function onEvent(e) {
  switch (e.type) {
    case 'built':
      sound('done');
      haptic(20);
      toasts.show(`${icon(e.id)}${esc(STATIONS[e.id].name)} ${e.first ? 'built' : `upgraded to Lv ${e.level}`}`, 'good');
      roomBurst(e.id);
      notifyBuilt(e);
      break;
    case 'crafted': {
      sound('craft');
      toasts.show(`${icon(e.item)}${esc(ITEMS[e.item].name)} is in the crate`, 'good');
      const from = base.rectOf(STATIONS.workshop.jobs.some((j) => j.id === e.recipe) ? 'workshop' : 'infirmary');
      if (from) fx.fly({ from, to: hud.target('crate'), html: icon(e.item), count: 1, onEach: () => hud.bump('crate') });
      break;
    }
    case 'yardFull':
      sound('coin');
      toasts.show(`${icon('scrap')}Scrap Yard full: tap it to collect`, 'warn', 3200);
      break;
    case 'movedIn':
      sound('bond');
      toasts.show(`${icon('bed')}${esc(SURVIVORS[e.id].name)} moved in. ${esc(MOVE_IN[e.id] || '')}`, 'good', 4200);
      roomBurst('barracks');
      break;
    case 'bondUp':
      sound('bond');
      toasts.show(`${icon('heart')}${esc(SURVIVORS[e.id].short)}: bond ${e.level}`, 'good');
      break;
    case 'orderNew':
      sound('radio');
      toasts.show(`${icon('order')}New daily order on the radio`);
      break;
    case 'orderDone':
      sound('coin');
      break;
    case 'stage':
      layers.interrupt(() => openStage(e.index));
      break;
    case 'weapon':
      toasts.show(`${icon(e.weapon)}New gun in the Armory: ${esc(WEAPONS[e.weapon].name)}`, 'good', 3600);
      break;
    case 'recipe':
      toasts.show(`${icon(e.recipe)}New recipe: ${esc(ITEMS[e.recipe].name)}`, 'good', 3200);
      break;
    case 'attachment':
      toasts.show(`${icon('armory')}New attachment: ${esc(ATTACHMENTS[e.id].name)}`, 'good', 3200);
      break;
    default:
      break;
  }
}

// --- Build-finished notification (opt-in, best effort, at most once a day) -------------------------------------------------

const NOTIFY_KEY = 'funland2.safehouse.notified';

function askNotify() {
  if (!('Notification' in window)) {
    toasts.show('This browser has no notifications', 'warn');
    return;
  }
  if (Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}

function notifyBuilt(e) {
  if (!tuning.notify || !document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const last = Number(localStorage.getItem(NOTIFY_KEY) || 0);
    if (Date.now() - last < 24 * 3600 * 1000) return;
    localStorage.setItem(NOTIFY_KEY, String(Date.now()));
    new Notification('Safehouse', { body: `${STATIONS[e.id].name} ${e.first ? 'is built' : `reached Lv ${e.level}`}.`, icon: 'icon.svg', tag: 'safehouse-build' });
  } catch {
    // blocked
  }
}

// Background tabs don't run animation frames: keep timers (and the notification)
// going. Only peek at the events: coming back drains them into the summary.
setInterval(() => {
  if (!document.hidden) return;
  sh.tick();
  for (const e of sh.events) {
    if (e.type === 'built' && !e.notified) {
      e.notified = true;
      notifyBuilt(e);
    }
  }
}, 20000);

// --- Layout, input, lifecycle -------------------------------------------------------------------------------------------------

/** Toasts sit just under the top bar, whose height depends on the orientation. */
function relayout() {
  document.documentElement.style.setProperty('--top-h', `${$('top').offsetHeight}px`);
}
addEventListener('resize', () => {
  relayout();
  setTimeout(relayout, 300); // iOS reports final sizes late
});

for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());

addEventListener('keydown', (e) => {
  if (e.key === '`' || e.key === '~') dev.toggle();
  else if (e.key === 'Escape') {
    if (dev.open) dev.hide();
    else layers.close();
  }
});

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    save();
    hiddenAt = sh.now();
    sfx.suspend();
  } else {
    sfx.resume();
    if (hiddenAt) catchUp(hiddenAt);
  }
});
addEventListener('pagehide', save);

// --- Frame loop -------------------------------------------------------------------------------------------------------------------

let last = performance.now();
let uiT = 0;
let saveT = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(250, Math.max(0, now - last));
  last = now;
  clock.advance(dt);
  if (!document.hidden) state.playMs += dt;
  sh.tick();
  const events = sh.drain();
  if (events.length) onEvents(events);
  uiT -= dt;
  if (uiT <= 0) {
    uiT = 100;
    base.update();
    hud.update();
    layers.refresh();
    const cap = sh.powerCap();
    sfx.setLoad(cap ? sh.powerUsed() / cap : 0);
  }
  hud.animate(dt);
  saveT -= dt;
  if (saveT <= 0) {
    saveT = 4000;
    save();
  }
}

// --- Boot -----------------------------------------------------------------------------------------------------------------------------

base.update();
hud.update();
relayout();
if (firstVisit) showIntro();
else catchUp(state.lastSeen);
requestAnimationFrame(frame);

window.__safehouse = {
  get sh() {
    return sh;
  },
  clock,
  tuning,
  act,
  save,
  layers,
};
document.documentElement.classList.add('booted');
