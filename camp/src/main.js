// Camp metagame prototype: boot, frame loop, save/resume and the action
// dispatcher that connects the scene, HUD and panels to the economy.

import { Camp, newState } from './economy.js';
import { Clock } from './clock.js';
import { loadState, saveState, clearState, migrate, loadTuning, saveTuning } from './save.js';
import { BUILDINGS, RUBBLE, RESOURCES, ZONES, REWARDS, EXPEDITIONS, RECIPES, CARRY_PER_ITEM } from './config.js';
import { Scene } from './scene.js';
import { Hud } from './hud.js';
import { Modals, Toasts, esc } from './ui.js';
import * as P from './panels.js';
import { RunView } from './run-view.js';
import { Fx } from './fx.js';
import { Sfx } from './audio.js';
import { DevPanel } from './dev-panel.js';
import { icon } from './icons.js';
import { artDefs } from './art.js';
import { fmtNum, fmtTime } from './format.js';

// --- State -----------------------------------------------------------------------------------

const tuning = loadTuning();
let state = loadState(Date.now());
const firstVisit = !state;
if (!state) state = newState(Date.now());
const clock = new Clock(state.clockOffset || 0);
let camp = new Camp(state, { clock, tuning });

const $ = (id) => document.getElementById(id);
document.body.insertAdjacentHTML('afterbegin', artDefs());
const sfx = new Sfx();
sfx.setVolume(tuning.volume);
const toasts = new Toasts($('toasts'));
const fx = new Fx($('fx'));
const runView = new RunView($('run'), (n) => sfx.play(n));
const ctx = { zone: 'suburbs', pack: null, lastRun: null, opened: null };

const haptic = (ms) => {
  if (!tuning.haptics) return;
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    // unsupported
  }
};

const modals = new Modals($('modals'), { onAct: (a, d, el) => act(a, d, el), now: () => camp.now(), sound: (n) => sfx.play(n) });
const scene = new Scene($('scene'), camp, {
  onPlot: (id) => {
    sfx.play('tap');
    openPlot(id);
  },
  onRubble: (area) => {
    sfx.play('tap');
    openRubble(area);
  },
  onCollect: (id, el) => doCollect(id, el.getBoundingClientRect()),
  onReward: (kind) => {
    sfx.unlock();
    openReward(kind);
  },
});
const hud = new Hud($('hud'), camp, (a, d, el) => {
  sfx.unlock();
  act(a, d, el);
});
const dev = new DevPanel($('dev'), {
  get camp() {
    return camp;
  },
  clock,
  onTuning: (key) => {
    saveTuning(tuning);
    if (key === 'volume' || key === '*') sfx.setVolume(tuning.volume);
    if (key === 'shortMinutes' || key === 'longHours' || key === '*') camp.retimeRewards();
    camp.changed();
  },
  onReset: () => {
    clearState();
    state = newState(Date.now());
    clock.offset = 0;
    clock.speed = 1;
    rebind(state);
    dev.hide();
    toasts.show('Fresh camp');
    showIntro();
  },
  onExport: () => JSON.stringify(save(), null, 0),
  onImport: (json) => {
    try {
      const s = migrate(JSON.parse(json), Date.now());
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
  camp = new Camp(state, { clock, tuning });
  scene.camp = camp;
  hud.camp = camp;
  modals.close();
  ctx.pack = null;
  scene.update();
}

// --- Saving and coming back ---------------------------------------------------------------------

function save() {
  state.lastSeen = camp.now();
  state.clockOffset = clock.offset;
  saveState(state);
  return state;
}

/** Finish everything that happened while away; maybe show a summary. */
function catchUp(since) {
  camp.tick();
  const events = camp.drain();
  const awayMs = camp.now() - since;
  const levelUps = events.filter((e) => e.type === 'hqUp');
  const worth = events.some((e) => ['built', 'cleared', 'crafted', 'expeditionBack'].includes(e.type)) || anyPending() || camp.rewardInfo('short').ready || camp.rewardInfo('long').ready;
  if (awayMs >= tuning.awayMinutes * 60000 && worth && !firstVisitIntro) {
    modals.enqueue(() => modals.open(() => P.welcomePanel(camp, { awayMs, events }), { cls: 'm-welcome' }));
  }
  for (const e of levelUps) modals.enqueue(() => showLevelUp(e));
}

function anyPending() {
  return Object.keys(BUILDINGS).some((id) => camp.pending(id) >= 1);
}

// --- Opening things ------------------------------------------------------------------------------

function openPlot(id) {
  if (camp.plotState(id) === 'available') camp.markSeen(id);
  modals.open(() => P.plotPanel(camp, id, ctx), { cls: 'm-building', key: id });
}

function openRubble(area) {
  modals.open(() => P.rubblePanel(camp, area), { cls: 'm-building', key: area });
}

function openDeploy() {
  if (!camp.zones().find((z) => z.id === ctx.zone && z.unlocked)) ctx.zone = 'suburbs';
  modals.open(() => P.deployPanel(camp, ctx), { cls: 'm-deploy' });
}

function openReward(kind) {
  const info = camp.rewardInfo(kind);
  if (info.ready) {
    claimReward(kind);
    return;
  }
  ctx.opened = null;
  modals.open(() => P.rewardPanel(camp, kind, null), { cls: 'm-reward' });
}

function claimReward(kind, viaRush = false) {
  const r = viaRush ? camp.rushReward(kind) : camp.claimReward(kind);
  if (!r.ok) return fail(r);
  sfx.play('crate');
  haptic(25);
  const loot = r.loot;
  hud.freeze();
  modals.open(() => P.rewardPanel(camp, kind, loot), { cls: 'm-reward opened', onClose: () => flyFromModal(loot, '.res-loot') });
  save();
}

function showLevelUp(e) {
  sfx.play('levelup');
  haptic([30, 40, 60]);
  modals.open(() => P.levelUpPanel(e.level, e.unlocks), { cls: 'm-levelup' });
  setTimeout(() => fx.burst(innerWidth / 2, innerHeight * 0.32), 120);
}

let firstVisitIntro = false;
function showIntro() {
  firstVisitIntro = true;
  modals.open(
    () =>
      `<div class="intro"><div class="kicker">FUNLAND2 · METAGAME PROTOTYPE</div><h1>THE CAMP</h1>` +
      `<p>The horde took the city. This camp is what's left. Build it up between runs: it feeds, arms and heals you for the next one.</p>` +
      `<div class="intro-grid"><div>${icon('play')}<b>Play runs</b><span>Simulated here. They bring home scrap, wood, food and survivors.</span></div>` +
      `<div>${icon('hammer')}<b>Build</b><span>Upgrades take time. Rush them with gems, or come back later.</span></div>` +
      `<div>${icon('power')}<b>Get stronger</b><span>The Armory, Infirmary and Radio Tower power up your runs.</span></div>` +
      `<div>${icon('airdrop')}<b>Come back</b><span>Crates and airdrops wait for you on the left.</span></div></div>` +
      `<div class="btns"><button class="btn primary big" type="button" data-act="close"><span class="lbl">Start</span></button></div>` +
      `<p class="hint">The gear (top right) opens the tuning panel: time warp, fast-forward, cheats and economy knobs.</p></div>`,
    {
      cls: 'm-intro',
      onClose: () => {
        firstVisitIntro = false;
        sfx.unlock();
        if (document.documentElement.classList.contains('is-touch')) enterFullscreen();
        scene.focus('garden');
      },
    },
  );
}

/** Android / desktop; iOS uses Add to Home Screen. */
function enterFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    })
    .catch(() => {});
}

// --- FX helpers -------------------------------------------------------------------------------------

function flyLoot(loot, from) {
  let delay = 0;
  for (const k of [...RESOURCES, 'gems', 'survivors']) {
    const n = loot[k] || 0;
    if (n <= 0) continue;
    const to = hud.target(k);
    if (!to) continue;
    const count = Math.min(9, 2 + Math.floor(Math.log2(n + 1)));
    hud.hold(k, delay + 700);
    const d = delay;
    setTimeout(() => {
      fx.fly({
        from,
        to,
        html: icon(k),
        count,
        onEach: () => {
          sfx.play(k === 'gems' ? 'gems' : 'coin');
          hud.bump(k);
        },
      });
    }, d);
    delay += 140;
  }
}

function flyFromModal(loot, sel) {
  const el = document.querySelector(`#modals ${sel}`);
  const rect = el ? el.getBoundingClientRect() : { x: innerWidth / 2, y: innerHeight / 2, width: 0, height: 0 };
  flyLoot(loot, rect);
  hud.thaw();
}

function floatAt(rect, html, cls) {
  if (!rect) return;
  fx.float(rect.x + rect.width / 2, rect.y + rect.height * 0.2, html, cls);
}

// --- Actions --------------------------------------------------------------------------------------------

const FAIL = {
  resources: 'Not enough resources',
  gems: 'Not enough gems',
  builders: 'All builders are busy',
  hq: 'Upgrade the Command Post first',
  survivors: 'Not enough survivors',
  slots: 'No free slot',
  crew: 'Not enough free survivors',
  full: 'Storage is full: upgrade the Warehouse',
  empty: 'Nothing to collect yet',
  locked: 'Not unlocked yet',
  area: 'Clear the rubble first',
  notReady: 'Not ready yet',
  busy: 'Already being worked on',
};

function fail(r) {
  sfx.play('error');
  toasts.show(esc(FAIL[r.reason] || r.reason), 'bad');
  return false;
}

function doCollect(id, rect) {
  const r = camp.collect(id);
  if (!r.ok) return fail(r);
  sfx.play('collect');
  haptic(12);
  floatAt(rect, `+${fmtNum(r.got)}`, 'res');
  flyLoot({ [r.res]: r.got }, rect);
  if (r.left > 0) toasts.show('Storage is full: upgrade the Warehouse', 'warn');
  return true;
}

function act(name, d = {}, el = null) {
  sfx.unlock();
  const rect = el ? el.getBoundingClientRect() : null;
  const withGems = d.with === 'gems';
  let r;
  switch (name) {
    case 'hq':
      sfx.play('tap');
      openPlot('hq');
      return;
    case 'goto': {
      modals.close();
      const id = d.id;
      scene.focus(id);
      setTimeout(() => (BUILDINGS[id] ? openPlot(id) : RUBBLE[id] ? openRubble(id) : null), 380);
      return;
    }
    case 'upgrade': {
      const first = camp.level(d.id) === 0;
      r = camp.startUpgrade(d.id, { withGems });
      if (!r.ok) return fail(r);
      sfx.play('build');
      if (r.gems) sfx.play('gems');
      haptic(15);
      if (camp.s.buildings[d.id].up) modals.close();
      toasts.show(`${icon('hammer')}${esc(BUILDINGS[d.id].name)}: ${first ? 'building' : 'upgrading'}`);
      break;
    }
    case 'rush':
      r = camp.rush(d.id);
      if (!r.ok) return fail(r);
      sfx.play('gems');
      break;
    case 'collect':
      doCollect(d.id, rect);
      break;
    case 'collectAll': {
      const got = {};
      let any = false;
      for (const id of Object.keys(BUILDINGS)) {
        if (BUILDINGS[id].kind !== 'producer') continue;
        const res = camp.collect(id);
        if (res.ok) {
          got[res.res] = (got[res.res] || 0) + res.got;
          any = true;
        }
      }
      modals.close();
      if (any) {
        sfx.play('collect');
        flyLoot(got, rect || { x: innerWidth / 2, y: innerHeight / 2, width: 0, height: 0 });
      }
      break;
    }
    case 'clear':
      r = camp.startClear(d.area, { withGems });
      if (!r.ok) return fail(r);
      sfx.play('build');
      modals.close();
      break;
    case 'rushClear':
      r = camp.rushClear(d.area);
      if (!r.ok) return fail(r);
      sfx.play('gems');
      break;
    case 'reward':
      openReward(d.kind);
      return;
    case 'claimReward':
      claimReward(d.kind);
      return;
    case 'rushReward':
      claimReward(d.kind, true);
      return;
    case 'collectReward':
      modals.close();
      return;
    case 'quest': {
      const q = camp.questInfo();
      if (!q) return;
      if (q.done) {
        const qr = camp.claimQuest();
        if (qr.ok) {
          sfx.play('quest');
          haptic(20);
          flyLoot(qr.loot, rect);
          fx.burst(rect.x + rect.width / 2, rect.y, undefined, 12);
        }
      } else focusQuest(q.def.focus);
      break;
    }
    case 'play':
      sfx.play('tap');
      openDeploy();
      return;
    case 'zone':
      ctx.zone = d.id;
      hud.zone = d.id;
      sfx.play('tap');
      break;
    case 'zoneLocked':
      toasts.show(`${icon('radio')}Upgrade the Radio Tower to reveal this zone`, 'warn');
      return;
    case 'outcome':
      tuning.outcome = d.v;
      saveTuning(tuning);
      break;
    case 'pack': {
      if (!ctx.pack) {
        ctx.pack = {};
        for (const rc of RECIPES) ctx.pack[rc.id] = CARRY_PER_ITEM;
      }
      ctx.pack[d.id] = ctx.pack[d.id] > 0 ? 0 : CARRY_PER_ITEM;
      sfx.play('tap');
      break;
    }
    case 'startRun':
      startRun(d.zone);
      return;
    case 'collectRun':
      modals.close();
      return;
    case 'runAgain':
      modals.close();
      setTimeout(() => startRun(d.zone), 260);
      return;
    case 'builders':
      modals.open(() => P.buildersPanel(camp), { cls: 'm-list' });
      return;
    case 'expeditions':
      modals.open(() => P.expeditionsPanel(camp), { cls: 'm-list' });
      return;
    case 'sendExp':
      r = camp.startExpedition(d.type);
      if (!r.ok) return fail(r);
      sfx.play('build');
      toasts.show(`${icon('truck')}${esc(EXPEDITIONS.find((x) => x.id === d.type).name)}: crew left`);
      break;
    case 'rushExp':
      r = camp.rushExpedition(Number(d.uid));
      if (!r.ok) return fail(r);
      sfx.play('gems');
      break;
    case 'collectExp':
      r = camp.collectExpedition(Number(d.uid));
      if (!r.ok) return fail(r);
      sfx.play('crate');
      flyLoot(r.loot, rect);
      if (r.loot.survivorsLost) toasts.show('A survivor came back with them, but there was no bed', 'warn');
      break;
    case 'craft':
      r = camp.startCraft(d.recipe, { withGems });
      if (!r.ok) return fail(r);
      sfx.play('build');
      break;
    case 'rushCraft':
      r = camp.rushCraft(Number(d.uid));
      if (!r.ok) return fail(r);
      sfx.play('gems');
      break;
    case 'loadout':
      modals.open(() => P.loadoutPanel(camp), { cls: 'm-list' });
      return;
    case 'survivors':
      modals.open(() => P.survivorsPanel(camp), { cls: 'm-list' });
      return;
    case 'dev':
      dev.toggle();
      return;
    default:
      return;
  }
  save();
  modals.refresh(true);
}

function focusQuest(focus) {
  if (focus === 'play') openDeploy();
  else if (focus === 'short' || focus === 'long') openReward(focus);
  else if (BUILDINGS[focus] || RUBBLE[focus]) act('goto', { id: focus });
}

function startRun(zoneId) {
  if (runView.busy) return;
  const r = camp.planRun(zoneId, { pack: ctx.pack });
  if (!r.ok) return fail(r);
  modals.close();
  document.body.classList.add('in-run');
  const zone = ZONES.find((z) => z.id === zoneId);
  runView.play(r.result, zone, () => {
    document.body.classList.remove('in-run');
    // You were out for the length of the run: the camp kept going.
    if (tuning.runTime) clock.warp(r.result.timeS * 1000);
    camp.tick();
    hud.freeze(); // counters tick up when the loot flies in, not behind the results
    r.result.granted = camp.applyRun(r.result);
    ctx.lastRun = r.result;
    const result = r.result;
    modals.open(() => P.resultsPanel(camp, result), { cls: `m-results ${result.won ? 'won' : 'lost'}`, onClose: () => flyFromModal(result.granted, '.res-loot') });
    save();
  });
}

// --- Events from the economy -------------------------------------------------------------------------

function onEvent(e) {
  switch (e.type) {
    case 'built': {
      const name = BUILDINGS[e.id].name;
      sfx.play('done');
      haptic(20);
      if (e.id !== 'hq') toasts.show(`${icon('check')}${esc(name)} ${e.first ? 'built!' : `upgraded to Lv ${e.level}`}`, 'good');
      const rect = scene.rectOf(e.id);
      if (rect && rect.right > 0 && rect.left < innerWidth) fx.burst(rect.x + rect.width / 2, rect.y + rect.height * 0.45, undefined, 16);
      break;
    }
    case 'hqUp':
      modals.interrupt(() => showLevelUp(e));
      break;
    case 'weapon':
      toasts.show(`${icon(e.weapon)}New gun for your runs: ${esc(e.name)}`, 'good', 3600);
      break;
    case 'zone':
      toasts.show(`${icon('map')}New zone revealed: ${esc(e.name)}`, 'good', 3600);
      break;
    case 'recipe':
      toasts.show(`${icon('medkit')}New recipe: ${esc(e.name)}`, 'good', 3200);
      break;
    case 'cleared':
      sfx.play('done');
      toasts.show(`${icon('hammer')}${esc(RUBBLE[e.area].name)} cleared: more room!`, 'good');
      break;
    case 'crafted':
      toasts.show(`${icon(e.recipe)}${esc(e.name)} crafted`, 'good');
      break;
    case 'expeditionBack':
      sfx.play('quest');
      toasts.show(`${icon('truck')}${esc(EXPEDITIONS.find((x) => x.id === e.kind).name)} is back`, 'good');
      break;
    case 'rewardReady':
      sfx.play('coin');
      break;
    case 'questDone':
      sfx.play('quest');
      break;
    default:
      break;
  }
}

// --- Layout, input, lifecycle -----------------------------------------------------------------------------

function relayout() {
  scene.resize(innerWidth, innerHeight);
}
addEventListener('resize', () => {
  relayout();
  setTimeout(relayout, 300); // iOS reports final sizes late
});
addEventListener('orientationchange', () => setTimeout(relayout, 300));
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());

addEventListener('keydown', (e) => {
  if (e.key === '`' || e.key === '~') dev.toggle();
  else if (e.key === 'Escape') {
    if (dev.open) dev.hide();
    else modals.close();
  }
});

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    save();
    hiddenAt = camp.now();
    sfx.suspend();
  } else {
    sfx.resume();
    if (hiddenAt) catchUp(hiddenAt);
  }
});
addEventListener('pagehide', save);

// --- Frame loop -----------------------------------------------------------------------------------------

let last = performance.now();
let uiT = 0;
let saveT = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(250, Math.max(0, now - last));
  last = now;
  clock.advance(dt);
  if (!document.hidden) state.playMs += dt;
  camp.tick();
  for (const e of camp.drain()) onEvent(e);
  uiT -= dt;
  if (uiT <= 0) {
    uiT = 100;
    scene.update();
    hud.update();
    modals.refresh();
  }
  scene.animate(dt);
  hud.animate(dt);
  saveT -= dt;
  if (saveT <= 0) {
    saveT = 4000;
    save();
  }
}

// --- Boot --------------------------------------------------------------------------------------------------

relayout();
scene.update();
hud.update();
scene.centerOn(360, true);
if (firstVisit) showIntro();
else catchUp(state.lastSeen);
requestAnimationFrame(frame);

window.__camp = {
  get camp() {
    return camp;
  },
  clock,
  tuning,
  scene,
  hud,
  modals,
  act,
  save,
  fmtTime,
  REWARDS,
};
document.documentElement.classList.add('booted');
