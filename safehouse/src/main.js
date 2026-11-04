// Safehouse prototype (simple version): boot, frame loop, saving and the
// actions behind every button. Not connected to the action game: PLAY runs a
// simulated mission (mission-sim.js) in its place.

import { Safehouse, newState } from './economy.js';
import { Clock } from './clock.js';
import { loadState, saveState, clearState, loadTuning, saveTuning } from './save.js';
import { STATIONS, ITEMS, SURVIVORS } from './config.js';
import { View } from './view.js';
import { Layers, Toasts, esc } from './ui.js';
import * as P from './sheets.js';
import { MissionView } from './mission-view.js';
import { Fx } from './fx.js';
import { Sfx } from './audio.js';
import { icon } from './icons.js';
import { artDefs } from './art.js';
import { fmtTime } from './format.js';

const $ = (id) => document.getElementById(id);
const tuning = loadTuning();
let state = loadState();
if (!state) state = newState(Date.now());
const clock = new Clock(state.clockOffset || 0);
let sh = new Safehouse(state, { clock, tuning });

const FACE_CLIP = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><clipPath id="sh-face-clip"><circle cx="32" cy="32" r="31"/></clipPath></defs></svg>';
document.body.insertAdjacentHTML('afterbegin', artDefs() + FACE_CLIP);
const sfx = new Sfx();
sfx.setVolume(tuning.volume);
const sound = (n) => sfx.play(n);
const toasts = new Toasts($('toasts'));
const fx = new Fx($('fx'));
const missionView = new MissionView($('mission'), sound);
const layers = new Layers($('layers'), { onAct: (a, d, el) => act(a, d, el), now: () => sh.now(), sound });
const view = new View({ top: $('top'), house: $('house'), side: $('side') }, sh, (a, d, el) => act(a, d, el));

function save() {
  state.lastSeen = sh.now();
  state.clockOffset = clock.offset;
  saveState(state);
}

function haptic(ms) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    // unsupported
  }
}

// --- Opening things ---------------------------------------------------------------------------------

const openStation = (id) => layers.open(() => P.stationSheet(sh, id), { kind: 'sheet', key: id });

function showIntro() {
  layers.open(() => P.introPanel(), {
    kind: 'modal',
    cls: 'm-intro',
    dismissable: false,
    onClose: () => {
      state.intro = true;
      save();
      sfx.unlock();
      setTimeout(() => view.focus('play'), 250);
    },
  });
}

/** Scrap flies from a point on screen into the counter. */
function flyScrap(n, from) {
  if (!(n > 0) || !from) return;
  view.hold(700);
  fx.fly({ from, to: view.el.scrapBtn, html: icon('scrap'), count: Math.min(8, 2 + Math.floor(Math.log2(n + 1))), onEach: () => (sound('coin'), view.bump()) });
}

// --- Actions ------------------------------------------------------------------------------------------

function blocked(why) {
  sound('error');
  toasts.show(`${icon('info')}${esc(why)}`, 'warn');
}

function act(name, d = {}, el = null) {
  sfx.unlock();
  let r;
  switch (name) {
    case 'open':
      sound('tap');
      openStation(d.id);
      return;
    case 'upgrade':
      r = sh.startUpgrade(d.id);
      if (!r.ok) return blocked(r.why);
      haptic(15);
      if (!r.instant) {
        sound('build');
        toasts.show(`${icon('hammer')}${esc(STATIONS[d.id].name)} upgrading: ${fmtTime((r.end - sh.now()) / 1000)}`);
      }
      break;
    case 'craft':
      r = sh.startCraft(d.id);
      if (!r.ok) return blocked(r.why);
      sound('craft');
      haptic(10);
      break;
    case 'play':
      startMission();
      return;
    case 'hint': {
      const h = sh.hint();
      if (h.focus === 'play') {
        view.focus('play');
        return;
      }
      view.focus(h.focus);
      setTimeout(() => openStation(h.focus), 250);
      return;
    }
    case 'scrapInfo':
      layers.open(() => P.scrapInfo(), { kind: 'modal' });
      return;
    case 'why':
      blocked(d.text);
      return;
    case 'dev':
      layers.open(() => P.devPanel(sh, clock), { kind: 'modal', cls: 'm-dev' });
      return;
    case 'warp':
      clock.warp(Number(d.s) * 1000);
      sh.tick();
      toasts.show(`${icon('clock')}Skipped ${fmtTime(Number(d.s))}`);
      break;
    case 'cheat':
      sh.cheat(500);
      break;
    case 'finish':
      sh.finishAll();
      break;
    case 'outcome':
      tuning.outcome = d.v;
      saveTuning(tuning);
      sh.changed();
      break;
    case 'reset':
      if (el && el.dataset.armed !== '1') {
        el.dataset.armed = '1';
        el.querySelector('.lbl').textContent = 'Tap again to reset';
        return;
      }
      clearState();
      state = newState(Date.now());
      clock.offset = 0;
      sh = new Safehouse(state, { clock, tuning });
      view.sh = sh;
      view.cache.clear();
      view.shown = 0;
      layers.close();
      toasts.show('Fresh start');
      setTimeout(showIntro, 300);
      return;
    default:
      return;
  }
  save();
  layers.refresh(true);
}

function startMission() {
  if (missionView.busy) return;
  const { report, loadout } = sh.planMission();
  const squad = sh.squad();
  layers.close();
  document.body.classList.add('in-mission');
  missionView.play(report, loadout, squad, () => {
    document.body.classList.remove('in-mission');
    // You were out for the length of the mission: the Safehouse kept going.
    if (tuning.missionTime) clock.warp(report.seconds * 1000);
    sh.tick();
    view.hold(Infinity);
    const summary = sh.applyMission(report);
    layers.open(() => P.resultsPanel(sh, report, summary, loadout), {
      kind: 'modal',
      cls: `m-results ${report.won ? 'won' : 'lost'}`,
      onClose: () => {
        const at = document.querySelector('#layers .paid');
        view.holdUntil = 0;
        flyScrap(summary.scrap, at ? at.getBoundingClientRect() : { x: innerWidth / 2, y: innerHeight / 2, width: 0, height: 0 });
      },
    });
    if (summary.rescued) layers.enqueue(() => layers.open(() => P.rescuePanel(summary.rescued), { kind: 'modal', cls: 'm-scene' }));
    save();
  });
}

// --- Events from the rules ----------------------------------------------------------------------------

function burstAt(id) {
  const r = view.rectOf(id);
  if (r && r.bottom > 0 && r.top < innerHeight) fx.burst(r.x + r.width / 2, r.y + r.height / 2, undefined, 14);
}

function onEvents(list) {
  for (const e of list) {
    if (e.type === 'built') {
      sound('done');
      haptic(20);
      toasts.show(`${icon(e.id)}${esc(STATIONS[e.id].name)} ${e.first ? 'built' : `is now Lv ${e.level}`}`, 'good');
      burstAt(e.id);
    } else if (e.type === 'newItem') {
      toasts.show(`${icon(e.item)}New: ${esc(ITEMS[e.item].name)}`, 'good', 3200);
    } else if (e.type === 'crafted') {
      sound('craft');
      toasts.show(`${icon(e.item)}${esc(ITEMS[e.item].name)} ready for the next mission`, 'good');
    } else if (e.type === 'movedIn') {
      sound('bond');
      toasts.show(`${icon('bed')}${esc(SURVIVORS[e.id].name)} moved into the Barracks and joins the squad`, 'good', 3600);
      burstAt('barracks');
    } else if (e.type === 'chapter') {
      toasts.show(`${icon('map')}Chapter ${e.n} is open`, 'good', 3200);
    }
  }
}

/** Coming back: finish what happened while away and say it in one line. */
function catchUp(since) {
  sh.tick();
  const events = sh.drain();
  const away = sh.now() - since;
  const done = events.filter((e) => e.type === 'built' || e.type === 'crafted');
  if (away > 60000 && done.length) {
    const parts = done.map((e) => (e.type === 'built' ? `${STATIONS[e.id].name} Lv ${e.level}` : ITEMS[e.item].name));
    toasts.show(`${icon('clock')}While you were away: ${esc(parts.join(', '))}`, 'good', 4200);
    onEvents(events.filter((e) => e.type === 'movedIn' || e.type === 'chapter'));
  } else onEvents(events);
}

// --- Lifecycle -------------------------------------------------------------------------------------------

for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') layers.close();
  else if (e.key === '`') act('dev');
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

let last = performance.now();
let uiT = 0;
let saveT = 4000;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(250, Math.max(0, now - last));
  last = now;
  if (!document.hidden) state.playMs += dt;
  sh.tick();
  const events = sh.drain();
  if (events.length) onEvents(events);
  uiT -= dt;
  if (uiT <= 0) {
    uiT = 100;
    view.update();
    layers.refresh();
  }
  view.animate(dt);
  saveT -= dt;
  if (saveT <= 0) {
    saveT = 4000;
    save();
  }
}

view.update();
if (!state.intro) showIntro();
else catchUp(state.lastSeen);
requestAnimationFrame(frame);

window.__safehouse = {
  get sh() {
    return sh;
  },
  clock,
  tuning,
  act,
  layers,
  save,
};
document.documentElement.classList.add('booted');
