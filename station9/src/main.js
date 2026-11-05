// Station 9: boot, frame loop, saving, and the flow between the street, the gate,
// the crew, the (simulated) run and the results. Mae (tutor.js) runs the guided start
// and drops one-time tips; this file decides when something is worth a tip.

import { Meta, newState } from './meta.js';
import { Clock } from './clock.js';
import { loadState, saveState, clearState, migrate, loadTuning, saveTuning } from './save.js';
import { ROLES, BUILDINGS } from './config.js';
import { fullName } from './people.js';
import { Street } from './street.js';
import { Hud } from './hud.js';
import { Modals, Toasts, esc } from './ui.js';
import * as S from './screens.js';
import { RunView } from './run-view.js';
import { Fx } from './fx.js';
import { Sfx } from './audio.js';
import { Dev } from './dev.js';
import { Tutor } from './tutor.js';
import { icon } from './icons.js';
import { fmtTime } from './format.js';

// --- State ------------------------------------------------------------------------------------

const tuning = loadTuning();
let state = loadState();
if (!state) state = newState(Date.now());
const clock = new Clock(state.clockOffset || 0);
let meta = new Meta(state, { clock, tuning });
const awayMs = Math.max(0, clock.now() - (state.lastSeen || clock.now()));

const $ = (id) => document.getElementById(id);
const sfx = new Sfx();
sfx.setVolume(tuning.volume);
const toasts = new Toasts($('toasts'));
const fx = new Fx($('fx'));
const runView = new RunView($('run'), (n) => sfx.play(n));
const ctx = { pick: [], picked: null, confirm: null, back: null };

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
  onBuilding: (id) => guard(() => openBuilding(id)),
  onTarget: () => guard(() => openCrew()),
  onPerson: (id) => guard(() => openPerson(id)),
  onGate: () => guard(() => openVisitor()),
  onLocked: (id) =>
    guard(() => {
      sfx.play('error');
      const g = meta.goal();
      if (g.done) return;
      toasts.show(`${icon('lock')}Take back <b>${esc(g.building.name)}</b> first`, 'warn');
      street.focusBuilding(g.building.id);
      void id;
    }),
  onMae: () => guard(() => tutor.ask()),
  onDog: () => guard(() => petDog()),
});
const hud = new Hud($('hud'), meta, (a, d, el) => act(a, d, el));

const tutor = new Tutor($('tutor'), {
  meta: () => meta,
  street,
  hud,
  sound: (n) => sfx.play(n),
  voice: () => tuning.voice,
  isOpen,
  open: (kind) => {
    if (kind === 'pick') openPick();
    else if (kind === 'visitor') openVisitor();
    else if (kind === 'crew') openCrew();
    else openBuilding(kind);
  },
  closeModal: () => modals.close(),
  save: () => save(),
  runBusy: () => runView.busy || afterBusy,
  adviceTarget,
});

const dev = new Dev($('dev'), {
  get meta() {
    return meta;
  },
  clock,
  tutor,
  onTuning: (key) => {
    saveTuning(tuning);
    if (key === 'volume' || key === '*') sfx.setVolume(tuning.volume);
    if (key === 'gate' || key === '*') meta.retime();
    meta.changed();
  },
  onCheat: (fn) => {
    const r = fn();
    street.update();
    if (r && r.out && r.out.reclaimed) street.focusBuilding(r.out.reclaimed);
    save();
  },
  onSkipTutorial: () => tutor.skip(),
  onReset: () => {
    clearState();
    clock.offset = 0;
    tutor.abort();
    rebind(newState(Date.now()));
    dev.hide();
    showTitle();
  },
  onExport: () => JSON.stringify(save()),
  onImport: (json) => {
    try {
      const s = migrate(JSON.parse(json));
      clock.offset = s.clockOffset || 0;
      tutor.abort();
      rebind(s);
      save();
      if (!s.tut.done) showTitle();
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
  ctx.pick = [];
  ctx.picked = null;
  // A new street: rebuild people and buildings from scratch.
  for (const w of [...street.people.values(), ...street.visitors.values()]) w.el.remove();
  street.people.clear();
  street.visitors.clear();
  street._keys = {};
  street.update();
  street.focusHome();
  hud.hideAll();
  hud.revealAll(meta.s.tut.seen);
}

function save() {
  state.lastSeen = meta.now();
  state.clockOffset = clock.offset;
  saveState(state);
  return state;
}

function isOpen(cls) {
  return !!(modals.cur && modals.cur.cls.split(' ').includes(cls));
}

// --- Screens -------------------------------------------------------------------------------------

function openPick() {
  modals.open(() => S.pickYou(meta, ctx.picked), { cls: 'm-pick', dismissable: false });
}

function openVisitor() {
  if (!meta.s.gate.visitors.length) {
    sfx.play('tap');
    const g = meta.gateInfo();
    toasts.show(g.nextIn === null ? `${icon('gate')}Nobody at the gate` : `${icon('gate')}Nobody at the gate yet · next in <b>${fmtTime(g.nextIn)}</b>`);
    return;
  }
  street.focusGate();
  modals.open(() => S.visitor(meta), { cls: 'm-visitor' });
  const v = meta.s.gate.visitors[0];
  if (v.stars === 3) tutor.tip('elite', [{ text: `Three stars. An Elite! ${v.first} could carry a whole crew.`, expr: 'proud', target: q('#modals .v-stars') }]);
}

function openPeople() {
  ctx.confirm = null;
  modals.open(() => S.people(meta), { cls: 'm-people' });
}

function openPerson(id, back = null) {
  ctx.confirm = null;
  ctx.back = back;
  modals.open(() => S.person(meta, id, ctx.confirm === id), {
    cls: 'm-person',
    onClose: (replaced) => {
      const b = ctx.back;
      ctx.back = null;
      if (b === 'people' && !replaced && meta.s.people.length) setTimeout(openPeople, 220);
    },
  });
}

function openBuilding(id) {
  modals.open(() => S.building(meta, id), { cls: 'm-build' });
}

function openCrew() {
  if (!meta.you()) return;
  const run = meta.nextRun();
  // Mae puts the best crew for this run together; swap people in and out from there.
  ctx.pick = meta.bestCrew(run);
  modals.open(() => S.crew(meta, ctx), { cls: 'm-crew' });
  // One-time tips about the crew screen.
  const o = meta.oddsFor(run, ctx.pick);
  if (o.risk.tone === 'warn' || o.risk.tone === 'bad') {
    tutor.tip('hard', [
      { text: 'This one’s hard. The bar is our power against what it takes.', expr: 'worried', target: q('#modals .meter') },
      { text: 'Level people up, upgrade, or bring the ones who fit the run. Or go anyway. We might get lucky.', expr: 'wink' },
    ]);
  }
  if (meta.s.people.some((p) => p.rest > 0)) tutor.tip('resting', [{ text: 'Whoever got hurt sits this one out. They’ll be fine after.', target: q('#modals .pm.resting') }]);
}

function openConvoy() {
  if (meta.convoyInfo().ready) return claimConvoy();
  modals.open(() => S.convoy(meta, null), { cls: 'm-small m-convoy' });
}

function claimConvoy() {
  const r = meta.claimConvoy();
  if (!r.ok) return fail(r);
  sfx.play('crate');
  haptic(25);
  hud.freeze();
  modals.open(() => S.convoy(meta, r), {
    cls: 'm-small m-convoy opened',
    onClose: () => {
      flyFrom('.r-total', r.scrap);
      setTimeout(() => {
        sfx.play('knock');
        street.bark(true);
      }, 400);
    },
  });
  save();
}

// --- The title, before the guided start ------------------------------------------------------------

function showTitle() {
  const t = $('title');
  t.querySelector('.ti-go').textContent = meta.s.you === null ? 'Start' : 'Continue';
  t.classList.remove('hidden', 'out');
}

$('title').addEventListener('click', () => {
  const t = $('title');
  if (t.classList.contains('out')) return;
  sfx.unlock();
  sfx.play('whoosh');
  if (document.documentElement.classList.contains('is-touch')) enterFullscreen();
  t.classList.add('out');
  setTimeout(() => t.classList.add('hidden'), 600);
  setTimeout(() => tutor.start(), 500);
});

function enterFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    })
    .catch(() => {});
}

// --- Mae's pointers -----------------------------------------------------------------------------------

const q = (sel) => () => document.querySelector(sel);

/** Where Mae points for a piece of advice (and the street scrolls there). */
function adviceTarget(a) {
  if (a.kind === 'gate') {
    street.focusGate();
    return () => street.visitorEl() || document.querySelector('#hud .gatew');
  }
  if (a.kind === 'build') {
    street.focusBuilding(a.id);
    return () => street.tagEl(a.id);
  }
  if (a.kind === 'convoy') return q('#hud .convoy');
  const g = meta.goal();
  if (!g.done) street.focusBuilding(g.building.id);
  return q('#hud .play');
}

const DOG_LINES = ['He likes you.', 'Biscuit! Manners.', 'Best fire dog this city ever had.', 'He found three people under the rubble last winter. Nose like a bloodhound.', 'Don’t let him fool you. He’s already had dinner.'];
let dogK = 0;

function petDog() {
  street.bark();
  sfx.play('bark');
  haptic(10);
  if (!tutor.busy && meta.s.tut.done) tutor.say(DOG_LINES[dogK++ % DOG_LINES.length], { expr: 'smile', block: false });
}

/** Tips that wait for a quiet moment on the street. */
function idleTips() {
  if (!meta.s.tut.done || tutor.busy || modals.isOpen || runView.busy || afterBusy || dev.open) return;
  const seen = meta.s.tut.seen;
  if (!seen.upgrade && meta.s.stats.runs >= 3) {
    const u = meta.affordable().find((x) => x.id !== 'firehouse');
    if (u) {
      const b = meta.building(u.id);
      tutor.tip('upgrade', [{ text: `We’ve got the scrap to upgrade the ${b.facility}. Tap it.`, expr: 'wink', target: () => street.tagEl(u.id) }], { before: () => street.focusBuilding(u.id) });
      return;
    }
  }
  if (!seen.convoyWait && seen['hud:convoy'] === undefined && meta.s.stats.runs >= 6 && meta.convoyInfo().on && !meta.convoyInfo().ready) {
    // Show the convoy timer once the street has a rhythm, so it's a promise rather than a surprise.
    tutor.tip('convoyWait', [{ text: 'Some old friends of mine run a convoy. It comes by every few hours with scrap, and someone good.', expr: 'smile', target: q('#hud .convoy') }], {
      before: () => tutor.show('convoy'),
    });
  }
}

function convoyArrived() {
  sfx.play('coin');
  if (!meta.s.tut.done) return;
  tutor.show('convoy');
  const first = tutor.tip('convoy', [{ text: 'Hear that engine? The convoy’s here! Tap the truck.', expr: 'proud', target: q('#hud .convoy') }], { when: () => !modals.isOpen });
  if (!first) toasts.show(`${icon('truck')}The convoy is here`, 'good');
}

function resultTips(res, out) {
  const quiet = () => !modals.isOpen;
  if (!res.won) {
    const hurt = out.hurt ? meta.person(out.hurt) : null;
    const lines = [{ text: 'We lost that one. It happens. Everyone still learned something, and we kept half the scrap.', expr: 'worried' }];
    if (hurt) lines.push({ text: `${hurt.first} got hurt and needs a rest: they’ll sit out the next run. Bring a Medic and nobody gets hurt.`, expr: 'worried', target: () => (street.people.get(hurt.id) || {}).el });
    else if (out.medicSaved) lines.push({ text: 'And see that? Our Medic kept everyone on their feet.', expr: 'proud' });
    tutor.tip('loss', lines, { when: quiet });
  }
  if (out.rescued) {
    tutor.tip('rescue', [{ text: `${out.rescued.first} is at the gate. The ones we rescue are always good.`, expr: 'proud', target: () => street.visitorEl() }], { when: quiet, before: () => street.focusGate() });
  }
  if (out.xp.some((x) => meta.person(x.id) && meta.person(x.id).level >= 5 && x.ups)) {
    const x = out.xp.find((y) => y.ups && meta.person(y.id).level >= 5);
    tutor.tip('maxLevel', [{ text: `${meta.person(x.id).first} is as good as they’ll ever get. New people catch up fast.`, expr: 'proud' }], { when: quiet });
  }
}

// --- FX helpers ---------------------------------------------------------------------------------------

function flyFrom(sel, n) {
  const el = document.querySelector(`#modals ${sel}`);
  const rect = el ? el.getBoundingClientRect() : { x: innerWidth / 2, y: innerHeight / 2, width: 0, height: 0 };
  if (n > 0) {
    const to = hud.target('scrap');
    const count = Math.min(10, 3 + Math.floor(Math.log2(n + 1)));
    hud.hold('scrap', 700);
    fx.fly({ from: rect, to, html: icon('scrap'), count, onEach: () => (sfx.play('coin'), hud.bump('scrap')) });
  }
  hud.thaw();
}

const FAIL = {
  scrap: 'Not enough scrap yet',
  beds: 'No free bed',
  locked: 'Take it back first',
  maxed: 'Already fully built',
  notReady: 'Not here yet',
  resting: 'Someone in the crew is resting',
  you: 'You always go',
  crew: 'The crew is full',
  gone: 'They already left',
};

function fail(r) {
  sfx.play('error');
  toasts.show(esc(FAIL[r.reason] || r.reason), 'bad');
  return false;
}

// --- Actions ---------------------------------------------------------------------------------------

// True while the street plays a building being taken back: taps speed it up instead.
let afterBusy = false;

function guard(fn) {
  if (afterBusy) return street.hurry();
  sfx.unlock();
  fn();
}

function rerender() {
  modals.render();
}

function act(name, d = {}, el = null) {
  sfx.unlock();
  if (afterBusy && name !== 'dev') {
    street.hurry();
    return;
  }
  const id = d.id !== undefined ? Number(d.id) : null;
  switch (name) {
    case 'pickYou':
      ctx.picked = Number(d.k);
      sfx.play('tap');
      rerender();
      return;
    case 'iAm': {
      const r = meta.chooseYou(ctx.picked);
      if (!r.ok) return fail(r);
      sfx.play('join');
      haptic(20);
      modals.close();
      street.update();
      break;
    }
    case 'gate':
      return openVisitor();
    case 'take': {
      const r = meta.takeIn(id);
      if (!r.ok) return fail(r);
      sfx.play('join');
      haptic(20);
      toasts.show(`${icon('heart')}Welcome to Station 9, <b>${esc(r.person.first)}</b>`, 'good');
      if (meta.s.gate.visitors.length && meta.s.tut.done) rerender();
      else {
        modals.close();
        street.focusGate();
      }
      break;
    }
    case 'away': {
      const r = meta.sendAway(id);
      if (!r.ok) return fail(r);
      sfx.play('bye');
      if (meta.s.gate.visitors.length) rerender();
      else modals.close();
      break;
    }
    case 'noBed': {
      sfx.play('error');
      if (meta.upgradeCost('firehouse') !== null) {
        modals.close();
        street.focusBuilding('firehouse');
        setTimeout(() => openBuilding('firehouse'), 240);
        if (!tutor.tip('bedsFull', [{ text: 'No bed for them. Build more bunks, or tell them “not now”.', expr: 'worried', target: q('#modals .bsheet') }])) toasts.show(`${icon('bed')}No free bed: upgrade the Bunks`, 'warn');
      } else if (!tutor.tip('letGo', [{ text: 'Every bed is taken, and the bunks can’t get any bigger.', expr: 'worried' }, { text: 'If you want them in, someone has to go. Tap a person, then Let go.' }])) {
        toasts.show(`${icon('bed')}Every bed is taken. Let someone go first.`, 'warn');
      }
      return;
    }
    case 'people':
      return openPeople();
    case 'person':
      return openPerson(id, isOpen('m-people') ? 'people' : null);
    case 'letGo':
      ctx.confirm = id;
      sfx.play('tap');
      rerender();
      return;
    case 'letGoYes': {
      const r = meta.letGo(id);
      if (!r.ok) return fail(r);
      sfx.play('bye');
      ctx.back = null;
      toasts.show(`${esc(fullName(r.person))} left Station 9`);
      modals.close();
      street.focusGate();
      break;
    }
    case 'up': {
      const r = meta.upgrade(d.id);
      if (!r.ok) return fail(r);
      sfx.play('upgrade');
      haptic(18);
      const rect = el ? el.getBoundingClientRect() : null;
      street.update();
      street.built(d.id);
      rerender();
      const b = meta.building(d.id);
      if (rect) fx.float(rect.x + rect.width / 2, rect.y, `${esc(b.facility)} Lv ${r.level}`, 'pw');
      // Someone was waiting for a bed: back to the gate.
      if (d.id === 'firehouse' && meta.s.gate.visitors.length && meta.s.tut.done) setTimeout(openVisitor, 700);
      break;
    }
    case 'play':
      return openCrew();
    case 'noop':
      sfx.play('tap');
      toasts.show(`${icon('crown')}You always go`);
      return;
    case 'add': {
      const p = meta.person(id);
      if (!p) return;
      if (p.rest > 0) {
        sfx.play('error');
        toasts.show(`${icon('bandage')}<b>${esc(p.first)}</b> is resting: back after the next run`, 'warn');
        return;
      }
      if (ctx.pick.length >= 4) {
        sfx.play('error');
        toasts.show('The crew is full. Tap someone in it to swap them out.', 'warn');
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
    case 'start':
      return startRun();
    case 'convoy':
      return openConvoy();
    case 'mae':
      return tutor.ask();
    case 'dev':
      dev.toggle();
      return;
    default:
      return;
  }
  save();
}

// --- The run and what comes after --------------------------------------------------------------------

function startRun() {
  if (runView.busy) return;
  const run = meta.nextRun();
  const plan = meta.planRun(ctx.pick);
  if (!plan.ok) return fail(plan);
  const crew = ctx.pick.map((id) => meta.person(id));
  modals.close();
  document.body.classList.add('in-run');
  runView.play(plan.result, {
    title: run.name,
    crew,
    friends: 0,
    revive: null,
    onDone: (res) => {
      document.body.classList.remove('in-run');
      street.hold = true; // keep the old picture until the building lights up
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
  flyFrom('.r-total', out.scrap);
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
  if (out.rescued || (out.arrived && out.arrived.length)) {
    setTimeout(() => {
      sfx.play('knock');
      street.bark(true);
      hud.bump('gate');
    }, 500);
  }
  resultTips(res, out);
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
  street.resize(innerWidth, innerHeight, small ? 40 : 50, small ? 64 : 76);
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
    else if (modals.cur && modals.cur.dismissable) modals.close();
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
    if (e.type === 'visitor' && meta.s.tut.done && !runView.busy && !modals.isOpen) {
      sfx.play('knock');
      street.bark(true);
      const v = meta.s.gate.visitors.at(-1);
      if (v) toasts.show(`${icon('gate')}<b>${esc(v.first)}</b> is at the gate · ${esc(ROLES[v.role].name)}`, 'good');
    }
    if (e.type === 'convoy') convoyArrived();
  }
  uiT -= dt;
  if (uiT <= 0) {
    uiT = 120;
    document.body.classList.toggle('mopen', modals.isOpen);
    street.update();
    hud.update();
    modals.tick();
    idleTips();
  }
  street.animate(dt);
  hud.animate(dt);
  saveT -= dt;
  if (saveT <= 0) {
    saveT = 4000;
    save();
  }
}

relayout();
street.update();
hud.update();
hud.revealAll(meta.s.tut.seen);
street.focusHome();
if (!meta.s.tut.done) showTitle();
else {
  $('title').classList.add('hidden');
  // Back after a while: Mae says what happened.
  if (awayMs > 15 * 60 * 1000) {
    meta.tick();
    const you = meta.you();
    const n = meta.s.gate.visitors.length;
    const line = meta.convoyInfo().ready
      ? `Welcome back, ${you.first}. The convoy came while you were out.`
      : n
        ? `Welcome back, ${you.first}. ${n === 1 ? `${meta.s.gate.visitors[0].first} is` : `${n} people are`} waiting at the gate.`
        : `Welcome back, ${you.first}. Quiet night. Biscuit kept watch.`;
    setTimeout(() => tutor.note([{ text: line, expr: 'smile' }]), 700);
  }
}
requestAnimationFrame(frame);

window.__s9 = {
  get meta() {
    return meta;
  },
  clock,
  tuning,
  street,
  hud,
  modals,
  tutor,
  act,
  save,
  ctx,
  BUILDINGS,
};
document.documentElement.classList.add('booted');
