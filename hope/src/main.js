// Hope Street: boot, frame loop, saving, and the flow between the street, the gate,
// your people, building, the crew picker, the (simulated) run and the results.

import { Meta, newState } from './meta.js';
import { Clock } from './clock.js';
import { loadState, saveState, clearState, migrate, loadTuning, saveTuning } from './save.js';
import { BUILDINGS, ROLES } from './config.js';
import { fullName } from './people.js';
import { Street } from './street.js';
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
const ctx = { filter: 'all', runKey: null, pick: [], friends: 0, back: null };

const haptic = (ms) => {
  if (!tuning.haptics) return;
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    // unsupported
  }
};

const modals = new Modals($('modals'), { onAct: (a, d, el) => act(a, d, el), now: () => meta.now(), sound: (n) => sfx.play(n) });
const street = new Street($('street'), meta, {
  onBuilding: (id) => guard(() => openBuild(id)),
  onTarget: () => guard(() => openCrew('story')),
  onPerson: (id) => guard(() => openPerson(id)),
  onGate: () => guard(() => openGate()),
  onLocked: (id) => {
    sfx.play('error');
    const g = meta.goal();
    toasts.show(`${icon('lock')}Reclaim <b>${esc(g.done ? '' : g.building.name)}</b> first`, 'warn');
    if (!g.done) street.focusBuilding(g.building.id);
    void id;
  },
});
const hud = new Hud($('hud'), meta, (a, d, el) => act(a, d, el));

const dev = new Dev($('dev'), {
  get meta() {
    return meta;
  },
  clock,
  onTuning: (key) => {
    saveTuning(tuning);
    if (key === 'volume' || key === '*') sfx.setVolume(tuning.volume);
    if (key === 'gate' || key === 'convoy' || key === '*') meta.retime();
    meta.changed();
  },
  onCheat: (fn) => {
    const r = fn();
    street.update();
    if (r && r.out && r.out.reclaimed) street.focusBuilding(r.out.reclaimed);
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
  street.meta = meta;
  hud.meta = meta;
  modals.close();
  // A new street: rebuild people and buildings from scratch.
  for (const w of [...street.people.values(), ...street.visitors.values()]) w.el.remove();
  street.people.clear();
  street.visitors.clear();
  street._keys = {};
  street.update();
  street.focusHome();
}

function save() {
  state.lastSeen = meta.now();
  state.clockOffset = clock.offset;
  saveState(state);
  return state;
}

// --- Screens -------------------------------------------------------------------------------------

function openGate() {
  street.focusGate();
  modals.open(() => S.gate(meta), { cls: 'm-gate' });
}

function openPeople() {
  modals.open(() => S.people(meta, ctx), { cls: 'm-people' });
}

function openPerson(id, back = null) {
  ctx.back = back;
  modals.open(() => S.person(meta, id), {
    cls: 'm-person',
    onClose: (replaced) => {
      const b = ctx.back;
      ctx.back = null;
      // Back to the list only when the card was closed, not when a confirm took its place.
      if (b === 'people' && !replaced) setTimeout(openPeople, 220);
    },
  });
}

function openBuild(focus = null) {
  modals.open(() => S.build(meta), { cls: 'm-build' });
  const id = focus || (meta.advice().kind === 'build' ? meta.advice().item.id : null);
  if (id) {
    const card = document.querySelector(`#modals .bc[data-id="${id}"]`);
    const sc = document.querySelector('#modals .bcs');
    if (card && sc) sc.scrollLeft = Math.max(0, card.offsetLeft - sc.offsetLeft - (sc.clientWidth - card.offsetWidth) / 2);
    if (card && focus) card.classList.add('flash');
  }
}

function openRuns() {
  modals.open(() => S.runs(meta), { cls: 'm-runs' });
}

function openCrew(key) {
  const run = meta.run(key);
  if (!run) {
    sfx.play('error');
    toasts.show('Hope Street is sealed. Scavenge runs are still out there.', 'warn');
    return openRuns();
  }
  ctx.runKey = key;
  ctx.pick = meta.suggestedSquad(run, ctx.friends);
  modals.open(() => S.crew(meta, ctx), { cls: 'm-crew' });
}

function openConvoy() {
  const info = meta.convoyInfo();
  if (info.ready) return claimConvoy();
  modals.open(() => S.convoy(meta, null), { cls: 'm-small' });
}

function claimConvoy(rush = false) {
  const r = rush ? meta.rushConvoy() : meta.claimConvoy();
  if (!r.ok) return fail(r);
  sfx.play('crate');
  haptic(25);
  hud.freeze();
  modals.open(() => S.convoy(meta, r), { cls: 'm-small opened', onClose: () => (flyFrom('.r-total', { scrap: r.scrap, gems: r.gems }), sfx.play('knock')) });
  save();
}

function confirmBox(o) {
  modals.open(() => S.confirm(o), { cls: 'm-small' });
}

let introOpen = false;
function showIntro() {
  introOpen = true;
  modals.open(() => S.intro(meta), {
    cls: 'm-intro',
    onClose: () => {
      introOpen = false;
      sfx.unlock();
      if (document.documentElement.classList.contains('is-touch')) enterFullscreen();
      street.focusHome(true);
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
  for (const k of ['scrap', 'gems']) {
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
  scrap: 'Not enough scrap yet',
  gems: 'Not enough gems',
  beds: 'No free bed',
  locked: 'Reclaim it first',
  maxed: 'Already at max level',
  notReady: 'Not ready yet',
  injured: 'Someone in the crew is hurt',
  empty: 'Pick at least one person',
  full: 'The crew is full',
  last: 'Hope Street needs at least one person',
  gateFull: 'The gate is full',
  sealed: 'Hope Street is sealed',
  gone: 'They already left',
};

function fail(r) {
  sfx.play('error');
  toasts.show(esc(FAIL[r.reason] || r.reason), 'bad');
  return false;
}

// --- Actions ---------------------------------------------------------------------------------------

// True while the street plays a reclaim: taps speed it up instead of opening anything.
let afterBusy = false;

function guard(fn) {
  if (afterBusy) return street.hurry();
  sfx.unlock();
  hud.poke();
  fn();
}

function rerender() {
  modals.render();
}

function act(name, d = {}, el = null) {
  sfx.unlock();
  hud.poke();
  if (afterBusy && name !== 'dev') {
    street.hurry();
    return;
  }
  const id = d.id !== undefined ? Number(d.id) : null;
  switch (name) {
    case 'gate':
      return openGate();
    case 'take': {
      const r = meta.takeIn(id);
      if (!r.ok) return r.reason === 'beds' ? openRoom(id) : fail(r);
      sfx.play('join');
      haptic(20);
      toasts.show(`${icon('heart')}Welcome to Hope Street, <b>${esc(r.person.first)}</b>`, 'good');
      if (!meta.s.gate.visitors.length) {
        modals.close();
        street.focusGate();
      } else rerender();
      break;
    }
    case 'away': {
      const r = meta.turnAway(id);
      if (!r.ok) return fail(r);
      sfx.play('bye');
      if (!meta.s.gate.visitors.length) modals.close();
      else rerender();
      break;
    }
    case 'room':
      return openRoom(id);
    case 'swapAsk': {
      const p = meta.person(id);
      const v = meta.s.gate.visitors.find((x) => x.id === ctx.roomFor);
      if (!p || !v) return;
      confirmBox({ kicker: 'Make room', title: `Let ${esc(p.first)} go?`, text: `${esc(fullName(p))} leaves Hope Street for good, and ${esc(v.first)} takes the bed.`, yes: `${icon('swap')} Swap`, act: 'swapYes', data: { p: p.id, v: v.id }, cls: 'danger-solid' });
      return;
    }
    case 'swapYes': {
      const r = meta.swap(Number(d.v), Number(d.p));
      if (!r.ok) return fail(r);
      sfx.play('join');
      toasts.show(`${icon('heart')}Welcome to Hope Street, <b>${esc(r.person.first)}</b>`, 'good');
      modals.close();
      street.focusGate();
      break;
    }
    case 'callAsk':
      confirmBox({ kicker: 'The radio', title: 'Call someone to the gate now?', text: 'Someone hears your call and comes over. The next visitor still comes on time.', yes: `Call ${S.gem(meta.callCost())}`, act: 'callYes', cls: 'gem' });
      return;
    case 'callYes': {
      const r = meta.callNow();
      if (!r.ok) return fail(r);
      sfx.play('knock');
      openGate();
      break;
    }
    case 'people':
      return openPeople();
    case 'filter':
      ctx.filter = d.role;
      sfx.play('tap');
      rerender();
      return;
    case 'person':
      return openPerson(id, modals.cur && /m-people/.test(modals.cur.cls) ? 'people' : null);
    case 'letGoAsk': {
      const p = meta.person(id);
      if (!p) return;
      ctx.back = null;
      confirmBox({ kicker: 'For good', title: `Let ${esc(p.first)} go?`, text: `${esc(fullName(p))} packs a bag and leaves Hope Street. You can't undo this.`, yes: `${icon('bye')} Let go`, act: 'letGoYes', data: { id }, cls: 'danger-solid' });
      return;
    }
    case 'letGoYes': {
      const r = meta.letGo(id);
      if (!r.ok) return fail(r);
      sfx.play('bye');
      toasts.show(`${esc(r.person.first)} left Hope Street`);
      modals.close();
      street.focusGate();
      break;
    }
    case 'healAsk': {
      const p = meta.person(id);
      if (!p) return;
      confirmBox({ kicker: 'Infirmary', title: `Heal ${esc(p.first)} now?`, text: `Back on their feet right away instead of in ${p.injured} day${p.injured > 1 ? 's' : ''}.`, yes: `Heal ${S.gem(meta.healCost(p))}`, act: 'healYes', data: { id }, cls: 'gem' });
      return;
    }
    case 'healYes': {
      const r = meta.heal(id);
      if (!r.ok) return fail(r);
      sfx.play('heal');
      openPerson(id);
      break;
    }
    case 'build':
      return openBuild();
    case 'up': {
      const r = meta.upgrade(d.id);
      if (!r.ok) return fail(r);
      sfx.play('upgrade');
      haptic(18);
      const rect = el ? el.getBoundingClientRect() : null;
      street.update();
      street.built(d.id);
      if (d.back === 'room') {
        // A bed is free now: back to the gate, where they can come in.
        if (meta.freeBeds() > 0) openGate();
        else openRoom(Number(d.v));
        toasts.show(`${icon('bed')}${esc(meta.building(d.id).facility)} level ${r.level}: ${meta.beds()} beds`, 'good');
        break;
      }
      rerender();
      const b = meta.building(d.id);
      if (rect) fx.float(rect.x + rect.width / 2, rect.y, `${b.facility} Lv ${r.level}`, 'pw');
      const card = document.querySelector(`#modals .bc[data-id="${d.id}"]`);
      if (card) card.classList.add('flash');
      break;
    }
    case 'focusB':
      modals.close();
      street.focusBuilding(d.id);
      return;
    case 'play':
      return openRuns();
    case 'pickRun':
      return openCrew(d.key);
    case 'add': {
      const p = meta.person(id);
      if (!p) return;
      if (p.injured > 0) {
        sfx.play('error');
        toasts.show(`${icon('bandage')}<b>${esc(p.first)}</b> is hurt: back in ${p.injured} day${p.injured > 1 ? 's' : ''}`, 'warn');
        return;
      }
      if (ctx.pick.length + ctx.friends >= 4) {
        sfx.play('error');
        toasts.show('The crew is full. Tap someone in the crew to drop them.', 'warn');
        return;
      }
      ctx.pick.push(id);
      sfx.play('tap');
      rerender();
      return;
    }
    case 'drop':
      ctx.pick = ctx.pick.filter((x) => x !== id);
      sfx.play('tap');
      rerender();
      return;
    case 'lead':
      ctx.pick = [id, ...ctx.pick.filter((x) => x !== id)];
      sfx.play('tap');
      rerender();
      return;
    case 'best': {
      const run = meta.run(ctx.runKey);
      const best = meta.bestSquad(run, 4 - ctx.friends);
      const lead = ctx.pick[0];
      ctx.pick = best.includes(lead) ? [lead, ...best.filter((x) => x !== lead)] : best;
      sfx.play('tap');
      rerender();
      return;
    }
    case 'friends': {
      ctx.friends = (ctx.friends + 1) % 4;
      ctx.pick = ctx.pick.slice(0, 4 - ctx.friends);
      // Fewer friends: fill the freed slots with your best fits again.
      const run = meta.run(ctx.runKey);
      for (const pid of meta.bestSquad(run, 4)) if (ctx.pick.length < 4 - ctx.friends && !ctx.pick.includes(pid)) ctx.pick.push(pid);
      sfx.play('tap');
      rerender();
      return;
    }
    case 'start':
      return startRun();
    case 'again':
      modals.close();
      setTimeout(() => openCrew(d.key), 240);
      return;
    case 'convoy':
      return openConvoy();
    case 'rushAsk': {
      const cost = meta.convoyInfo().rushCost;
      confirmBox({ kicker: 'The convoy', title: 'Bring the convoy now?', text: 'It arrives right away. The next one comes 8 hours later.', yes: `Yes ${S.gem(cost)}`, act: 'rushYes', cls: 'gem' });
      return;
    }
    case 'rushYes':
      claimConvoy(true);
      break;
    case 'goal': {
      const g = meta.goal();
      if (g.done) street.focusHome(true);
      else street.focusBuilding(g.building.id);
      return;
    }
    case 'dev':
      dev.toggle();
      return;
    default:
      return;
  }
  save();
}

function openRoom(visitorId) {
  ctx.roomFor = visitorId;
  modals.open(() => S.makeRoom(meta, visitorId), { cls: 'm-room', onClose: () => {} });
}

// --- The run and what comes after --------------------------------------------------------------------

function startRun() {
  if (runView.busy) return;
  const run = meta.run(ctx.runKey);
  const plan = meta.planRun(ctx.runKey, ctx.pick, { friends: ctx.friends });
  if (!plan.ok) return fail(plan);
  const crew = ctx.pick.map((id) => meta.person(id));
  modals.close();
  document.body.classList.add('in-run');
  runView.play(plan.result, {
    title: run.name,
    crew,
    friends: ctx.friends,
    revive: { cost: meta.reviveCost(plan.result), can: () => meta.canRevive(plan.result), use: () => meta.revive(plan.result).ok },
    onDone: (res) => {
      document.body.classList.remove('in-run');
      street.hold = true; // keep the old picture until the reclaim plays
      hud.freeze();
      const out = meta.applyRun(res);
      save();
      modals.open(() => S.results(meta, res, out), { cls: `m-results ${res.won ? 'won' : 'lost'}`, onClose: () => afterResults(res, out) });
      if (res.won) [1, 2, 3].forEach((k) => k <= res.stars && setTimeout(() => sfx.play(`star${k}`), 150 + k * 220));
      if (out.xp.some((x) => x.ups)) setTimeout(() => (sfx.play('levelup'), haptic([15, 30, 15])), 1100);
    },
  });
}

async function afterResults(res, out) {
  flyFrom('.r-total', { scrap: out.scrap, gems: out.gems });
  if (out.reclaimed) {
    afterBusy = true;
    try {
      await wait(450);
      sfx.play('reclaim');
      await street.reclaim(out.reclaimed);
    } finally {
      afterBusy = false;
    }
  }
  street.hold = false;
  street.update();
  if (out.reclaimed) modals.enqueue(() => showReveal({ kind: out.sealed ? 'sealed' : 'reclaim', id: out.reclaimed }));
  if (out.rescued || out.found || (out.arrived && out.arrived.length)) {
    setTimeout(() => {
      sfx.play('knock');
      hud.bump('gate');
    }, 500);
  }
}

function showReveal(what) {
  sfx.play('unlock');
  haptic([20, 30, 40]);
  modals.open(() => S.reveal(meta, what), { cls: 'm-reveal' });
  setTimeout(() => fx.burst(innerWidth / 2, innerHeight * 0.35), 150);
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Lifecycle -------------------------------------------------------------------------------------------

function relayout() {
  const small = innerHeight < 360;
  street.resize(innerWidth, innerHeight, small ? 40 : 50, small ? 64 : 78);
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
  for (const e of meta.drain()) {
    if (e.type === 'visitor' && !runView.busy && !introOpen) {
      sfx.play('knock');
      const v = meta.s.gate.visitors.at(-1);
      if (v) toasts.show(`${icon('gate')}<b>${esc(v.first)}</b> is at the gate · ${esc(ROLES[v.role].name)}`, 'good');
    }
    if (e.type === 'convoy') {
      sfx.play('coin');
      toasts.show(`${icon('truck')}The convoy is here`, 'good');
    }
  }
  uiT -= dt;
  if (uiT <= 0) {
    uiT = 120;
    document.body.classList.toggle('mopen', modals.isOpen);
    street.update();
    hud.update();
    modals.tick();
  }
  street.animate(dt);
  hud.animate(dt, !modals.isOpen && !runView.busy && !street.cine && !dev.open && !introOpen);
  saveT -= dt;
  if (saveT <= 0) {
    saveT = 4000;
    save();
  }
}

relayout();
street.update();
hud.update();
street.focusHome();
if (firstVisit) showIntro();
requestAnimationFrame(frame);

window.__hope = {
  get meta() {
    return meta;
  },
  clock,
  tuning,
  street,
  hud,
  modals,
  act,
  save,
  ctx,
  BUILDINGS,
};
document.documentElement.classList.add('booted');
