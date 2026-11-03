// Road to Evac: boot, frame loop, saving, and the flow between the road,
// the briefing, the (simulated) run, the results cascade and upgrades.

import { Meta, newState } from './meta.js';
import { Clock } from './clock.js';
import { loadState, saveState, clearState, migrate, loadTuning, saveTuning } from './save.js';
import { SURVIVORS, WEAPONS, TOTAL_CHAPTERS, CHAPTERS_PER_CAMPAIGN } from './config.js';
import { Road, stopX } from './road.js';
import { Hud } from './hud.js';
import { Modals, Toasts, esc } from './ui.js';
import * as S from './screens.js';
import { RunView } from './run-view.js';
import { Fx } from './fx.js';
import { Sfx } from './audio.js';
import { Dev } from './dev.js';
import { icon } from './icons.js';

// --- State ------------------------------------------------------------------------------------

const tuning = loadTuning();
let state = loadState();
const firstVisit = !state;
if (!state) state = newState(Date.now());
const clock = new Clock(state.clockOffset || 0);
let meta = new Meta(state, { clock, tuning });

const $ = (id) => document.getElementById(id);
const sfx = new Sfx();
sfx.setVolume(tuning.volume);
const toasts = new Toasts($('toasts'));
const fx = new Fx($('fx'));
const runView = new RunView($('run'), (n) => sfx.play(n));
const ctx = { friends: 0, tab: 'survivors', returnTo: null };

const haptic = (ms) => {
  if (!tuning.haptics) return;
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    // unsupported
  }
};

const modals = new Modals($('modals'), { onAct: (a, d, el) => act(a, d, el), now: () => meta.now(), sound: (n) => sfx.play(n) });
const road = new Road($('road'), meta, {
  onStop: (i) => {
    sfx.unlock();
    hud.poke();
    const ch = meta.chapter(i);
    if (ch.state === 'locked') {
      sfx.play('error');
      toasts.show(`${icon('lock')}Clear <b>${esc(meta.chapter(meta.s.next).name)}</b> first`, 'warn');
      road.focusStop(meta.s.next);
      return;
    }
    openBriefing(i);
  },
  onSign: (ci) => road.focusStop(Math.min(ci * CHAPTERS_PER_CAMPAIGN, meta.s.next)),
  onSquad: () => openUpgrades('survivors'),
});
const hud = new Hud($('hud'), meta, (a, d, el) => {
  sfx.unlock();
  act(a, d, el);
});
const dev = new Dev($('dev'), {
  get meta() {
    return meta;
  },
  clock,
  onTuning: (key) => {
    saveTuning(tuning);
    if (key === 'volume' || key === '*') sfx.setVolume(tuning.volume);
    if (key === 'shortMinutes' || key === 'longHours' || key === '*') meta.retimeRewards();
    meta.changed();
  },
  onCheat: (fn) => {
    const before = meta.s.next;
    fn();
    if (meta.s.next !== before) {
      road.update();
      road.focusVan(true);
    }
    save();
  },
  onReset: () => {
    clearState();
    clock.offset = 0;
    rebind(newState(Date.now()));
    dev.hide();
    toasts.show('Fresh start');
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

function rebind(s) {
  state = s;
  meta = new Meta(state, { clock, tuning });
  road.meta = meta;
  hud.meta = meta;
  modals.close();
  road.update();
  road.focusVan();
}

function save() {
  state.lastSeen = meta.now();
  state.clockOffset = clock.offset;
  saveState(state);
  return state;
}

// --- Screens -------------------------------------------------------------------------------------

function openBriefing(i) {
  ctx.briefing = i;
  modals.open(() => S.briefing(meta, i, ctx), { cls: 'm-brief' });
}

function openUpgrades(tab = null, returnTo = null) {
  const a = meta.advice();
  ctx.tab = tab || (a.kind === 'upgrade' ? (a.item.kind === 'weapon' ? 'guns' : 'survivors') : ctx.tab);
  ctx.returnTo = returnTo;
  modals.open(() => S.upgrades(meta, ctx.tab), {
    cls: 'm-upg',
    onClose: () => {
      const back = ctx.returnTo;
      ctx.returnTo = null;
      if (back !== null && back !== undefined) setTimeout(() => openBriefing(back), 230);
    },
  });
}

function openReward(kind) {
  const info = meta.rewardInfo(kind);
  if (info.ready) return claimReward(kind);
  modals.open(() => S.reward(meta, kind, null), { cls: 'm-small' });
}

function claimReward(kind, rush = false) {
  const r = rush ? meta.rushReward(kind) : meta.claimReward(kind);
  if (!r.ok) return fail(r);
  sfx.play('crate');
  haptic(25);
  hud.freeze();
  modals.open(() => S.reward(meta, kind, r), { cls: 'm-small opened', onClose: () => flyFrom('.r-total', { supplies: r.supplies, gems: r.gems }) });
  save();
}

let introOpen = false;
function showIntro() {
  introOpen = true;
  modals.open(() => S.intro(), {
    cls: 'm-intro',
    onClose: () => {
      introOpen = false;
      sfx.unlock();
      if (document.documentElement.classList.contains('is-touch')) enterFullscreen();
      road.focusVan(true);
    },
  });
}

function enterFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    })
    .catch(() => {});
}

// --- FX helpers ---------------------------------------------------------------------------------------

function flyLoot(loot, from) {
  let delay = 0;
  for (const k of ['supplies', 'gems']) {
    const n = loot[k] || 0;
    if (n <= 0) continue;
    const to = hud.target(k);
    const count = Math.min(10, 3 + Math.floor(Math.log2(n + 1)));
    hud.hold(k, delay + 700);
    const d = delay;
    setTimeout(() => fx.fly({ from, to, html: icon(k), count, onEach: () => (sfx.play(k === 'gems' ? 'gems' : 'coin'), hud.bump(k)) }), d);
    delay += 160;
  }
}

function flyFrom(sel, loot) {
  const el = document.querySelector(`#modals ${sel}`);
  const rect = el ? el.getBoundingClientRect() : { x: innerWidth / 2, y: innerHeight / 2, width: 0, height: 0 };
  flyLoot(loot, rect);
  hud.thaw();
}

const FAIL = {
  supplies: 'Not enough supplies yet',
  gems: 'Not enough gems',
  locked: 'Not unlocked yet',
  maxed: 'Already at max level',
  notReady: 'Not ready yet',
};

function fail(r) {
  sfx.play('error');
  toasts.show(esc(FAIL[r.reason] || r.reason), 'bad');
  return false;
}

// --- Actions ---------------------------------------------------------------------------------------------

function act(name, d = {}, el = null) {
  sfx.unlock();
  hud.poke();
  switch (name) {
    case 'play': {
      const a = meta.advice();
      openBriefing(meta.s.evac && a.i !== undefined ? a.i : meta.playTarget());
      return;
    }
    case 'goal': {
      const nu = meta.nextUnlock();
      road.focusStop(nu ? nu.i : meta.playTarget());
      return;
    }
    case 'upgrades':
      openUpgrades(null, modals.isOpen && ctx.briefing !== undefined && modals.cur && /m-brief/.test(modals.cur.cls) ? ctx.briefing : null);
      return;
    case 'dev':
      dev.toggle();
      return;
    case 'reward':
      openReward(d.kind);
      return;
    case 'rushAsk': {
      const cost = meta.rewardInfo(d.kind).rushCost;
      modals.open(() => S.confirmGems('Open the airdrop now?', cost, 'rushYes', { kind: d.kind }), { cls: 'm-small' });
      return;
    }
    case 'rushYes':
      claimReward(d.kind, true);
      return;
    case 'start':
      startRun(Number(d.i));
      return;
    case 'retry':
      modals.close();
      setTimeout(() => openBriefing(Number(d.i)), 230);
      return;
    case 'pickMain':
      meta.setMain(d.id);
      sfx.play('tap');
      modals.render();
      break;
    case 'pickGun':
      meta.setWeapon(d.id);
      sfx.play('tap');
      modals.render();
      break;
    case 'friends':
      ctx.friends = (ctx.friends + 1) % 4;
      sfx.play('tap');
      modals.render();
      return;
    case 'tab':
      ctx.tab = d.id;
      sfx.play('tap');
      modals.render();
      return;
    case 'up': {
      const r = meta.upgrade(d.kind, d.id);
      if (!r.ok) return fail(r);
      sfx.play('upgrade');
      haptic(18);
      const rect = el ? el.getBoundingClientRect() : null;
      modals.render();
      if (rect) fx.float(rect.x + rect.width / 2, rect.y, `+${r.after - r.before} power`, 'pw');
      hud.bump('power');
      const card = document.querySelector(`#modals .card [data-id="${d.id}"]`);
      if (card) card.closest('.card').classList.add('flash');
      break;
    }
    case 'equipNew':
      meta.setWeapon(d.id);
      sfx.play('tap');
      modals.close();
      break;
    default:
      return;
  }
  save();
}

// --- The run and what comes after --------------------------------------------------------------------------

function startRun(i) {
  if (runView.busy) return;
  const plan = meta.planRun(i, { friends: ctx.friends });
  if (!plan.ok) return fail(plan);
  const result = plan.result;
  const ch = meta.chapter(i);
  modals.close();
  document.body.classList.add('in-run');
  const fromVan = road.vanX;
  runView.play(result, {
    title: `${ch.name}`,
    squad: meta.squad(),
    friends: ctx.friends,
    revive: { cost: meta.reviveCost(result), can: () => meta.canRevive(result), use: () => meta.revive(result).ok },
    onDone: (res) => {
      document.body.classList.remove('in-run');
      road.hold = true; // keep the old picture until the drive
      hud.freeze();
      const out = meta.applyRun(res);
      save();
      modals.open(() => S.results(meta, res, out), {
        cls: `m-results ${res.won ? 'won' : 'lost'}`,
        onClose: () => afterResults(res, out, fromVan),
      });
      if (res.won) for (let k = 1; k <= res.stars; k++) setTimeout(() => sfx.play(`star${k}`), 380 + k * 220);
    },
  });
}

async function afterResults(res, out, fromVan) {
  flyFrom('.r-total', { supplies: out.supplies, gems: out.gems });
  if (out.advanced) {
    await wait(500);
    sfx.play('drive');
    const toX = meta.s.next >= TOTAL_CHAPTERS ? road._vanTarget() : stopX(meta.s.next - 1) + 6;
    await road.drive({ fromX: fromVan, toX, fogTo: road._frontierTarget() });
  }
  road.hold = false;
  road.update();
  const reveals = out.unlocks.filter((u) => u.kind !== 'evac').map((u) => () => showReveal(u));
  if (out.campaignDone) reveals.push(() => (sfx.play('reclaim'), showReveal({ kind: 'district', ci: Math.floor(res.index / CHAPTERS_PER_CAMPAIGN) })));
  if (out.evac) reveals.push(() => showReveal({ kind: 'evac' }));
  for (const r of reveals) modals.enqueue(r);
}

function showReveal(u) {
  sfx.play('unlock');
  haptic([20, 30, 40]);
  modals.open(() => S.reveal(meta, u), { cls: 'm-reveal' });
  setTimeout(() => fx.burst(innerWidth / 2, innerHeight * 0.35), 150);
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Lifecycle -------------------------------------------------------------------------------------------

function relayout() {
  road.resize(innerWidth, innerHeight);
}
addEventListener('resize', () => {
  relayout();
  setTimeout(relayout, 300);
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
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    save();
    sfx.suspend();
  } else {
    sfx.resume();
    meta.tick();
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
  meta.tick();
  for (const e of meta.drain()) if (e.type === 'rewardReady') sfx.play('coin');
  uiT -= dt;
  if (uiT <= 0) {
    uiT = 120;
    if (!road.hold) road.update();
    hud.update();
    modals.tick();
  }
  road.animate(dt);
  hud.animate(dt, !modals.isOpen && !runView.busy && !road.cine && !dev.open && !introOpen);
  saveT -= dt;
  if (saveT <= 0) {
    saveT = 4000;
    save();
  }
}

relayout();
road.update();
hud.update();
road.focusVan();
if (firstVisit) showIntro();
requestAnimationFrame(frame);

window.__evac = {
  get meta() {
    return meta;
  },
  clock,
  tuning,
  road,
  hud,
  modals,
  act,
  save,
  SURVIVORS,
  WEAPONS,
};
document.documentElement.classList.add('booted');
