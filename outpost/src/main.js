// Last Stop: boot, the frame loop and every flow. Tap something on the map to
// select it (a bar slides up with what you can do: upgrade, send out, move,
// clear). PLAY sends tonight's survivor out. BUILD places a new home or a
// decoration. Rules live in town.js; this file only plays them back.

import { Town, newTownState, lotKey } from './town.js';
import { Clock } from './clock.js';
import { loadState, saveState, clearState, clearTuning, migrate, loadTuning, saveTuning, SAVE_KEY } from './save.js';
import { TUNING_DEFAULTS, HOME_TIERS, DECOR, LOTS, LANDMARKS, LOT, HOME_SIZE, STAGE_NAMES } from './config.js';
import { TownMap } from './map.js';
import { BuildDrawer, NOBODY } from './build.js';
import { Hud } from './hud.js';
import { Modals, Toasts, esc, wait } from './ui.js';
import { selBar, peopleSheet } from './sheets.js';
import { nightShow, moveInShow } from './run.js';
import { Fx } from './fx.js';
import { Sfx } from './audio.js';
import { Dev } from './dev.js';
import { icon } from './icons.js';
import * as A from './art.js';
import { face, name, coinSvg } from './kit.js';

// --- State -------------------------------------------------------------------------------------------

const tuning = loadTuning();
let state = loadState();
const firstVisit = !state;
if (!state) state = newTownState(Date.now());
const clock = new Clock(state.clockOffset || 0);
const town = new Town(state, { clock, tuning });

const $ = (id) => document.getElementById(id);
const sfx = new Sfx();
sfx.setVolume(tuning.volume);
const sound = (n, o) => sfx.play(n, o);
const toasts = new Toasts($('toasts'));
const fx = new Fx($('fx'));
const ui = { sel: null };
let busy = false;
let resetting = false;
let staleTab = false;

/** Busy: a sequence is playing. Taps are locked; walkers keep walking only if `walk`. */
function setBusy(v, { walk = false } = {}) {
  busy = v;
  document.body.classList.toggle('busy', v);
  map.locked = v;
  map.paused = v && !walk;
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
  saveState(state);
}

addEventListener('storage', (e) => {
  if (e.key !== SAVE_KEY || resetting || staleTab) return;
  staleTab = true;
  if (!document.hidden) showStale();
});
function showStale() {
  if (document.getElementById('stale')) return;
  const el = document.createElement('div');
  el.id = 'stale';
  el.innerHTML = `<div class="tc-in"><h2>Playing in another tab</h2><p>Last Stop was saved from another tab or window.</p><button class="btn yellow big" type="button">Play here</button></div>`;
  el.addEventListener('click', () => location.reload());
  document.body.appendChild(el);
}

const modals = new Modals($('modals'), { onAct: (a, d, el) => act(a, d, el), now: () => town.now(), sound });
const hud = new Hud($('hud'), town, (a, d, el) => act(a, d, el));
const map = new TownMap($('map'), town, {
  sound,
  fx,
  onObject: (o) => guard(() => select({ kind: 'obj', id: o.id })),
  onPerson: (id) =>
    guard(() => {
      const h = town.homeOf(id);
      if (h) select({ kind: 'obj', id: h.id });
    }),
  onLot: (a, b) => guard(() => select({ kind: 'lot', a, b })),
  onGround: () => guard(() => deselect()),
  onPlaceOk: () => map.placeOk(),
  onLifted: () => {
    deselect();
    hud.setMode('place');
    drawer.hide(true);
  },
  onDropped: () => afterPlaceUi(),
  onMoved: () => {
    afterPlaceUi();
    save();
    refresh();
  },
  onBus: () =>
    guard(() => {
      sound('whoosh');
      hud.bump('play');
    }),
});
const drawer = new BuildDrawer($('drawer'), town, (k, d, el) => drawerPick(k, d, el));
const overlay = $('overlay');
const selEl = $('sel');
selEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled) guard(() => act(b.dataset.act, b.dataset, b));
});

const dev = new Dev($('dev'), {
  town,
  onTuning: (key) => {
    if (key === '*defaults') {
      Object.assign(tuning, TUNING_DEFAULTS);
      clearTuning();
    } else saveTuning(tuning);
    if (key === 'volume' || key === '*defaults') sfx.setVolume(tuning.volume);
    refresh();
  },
  onCheat: (kind, arg) => {
    const r = town.cheat(kind, arg);
    if (kind === 'clear' || kind === 'clearAll') map.resetZeds();
    save();
    refresh(true);
    return r;
  },
  onReset: () => {
    resetting = true;
    clearState();
    location.reload();
  },
  onExport: () => {
    const txt = JSON.stringify(state);
    try {
      navigator.clipboard.writeText(txt).then(
        () => toasts.show('Save copied'),
        () => toasts.show('Could not copy', 'warn'),
      );
    } catch {
      toasts.show('Could not copy', 'warn');
    }
  },
  onImport: (txt) => {
    try {
      const s = migrate(JSON.parse(txt));
      resetting = true;
      saveState(s);
      location.reload();
    } catch {
      toasts.show('That is not a save', 'warn');
    }
  },
  toast: (m) => toasts.show(esc(m)),
});

function refresh(full = false) {
  map.hint = town.hint();
  hud.update();
  map.update(full);
  if (drawer.isOpen) drawer.render();
  if (modals.isOpen) modals.render();
  if (ui.sel && renderSel()) markSel(true); // a redrawn object loses its classes
}

function guard(fn) {
  if (busy) return;
  sfx.unlock();
  fn();
}

function recover(e) {
  console.error(e);
  overlay.innerHTML = '';
  overlay.classList.remove('on');
  hud.thaw();
  setBusy(false);
  toasts.show('Oops, that went wrong. The game carries on.', 'warn');
}

// --- Actions ----------------------------------------------------------------------------------------

function act(a, d, el) {
  switch (a) {
    case 'play':
      return guard(() => playNight());
    case 'people':
      return guard(() => {
        deselect();
        closeDrawer();
        modals.open(() => peopleSheet(town), { cls: 'people' });
      });
    case 'pick':
      return pick(Number(d.id));
    case 'build':
      return guard(() => (drawer.isOpen ? closeDrawer() : openDrawer()));
    case 'dev':
      return dev.toggle();
    case 'home': {
      const st = town.station();
      if (st) map.glide(st.i + 1.5, st.j + 1.5, { ms: 500 });
      return;
    }
    case 'hint':
      return showHint();
    case 'upgrade':
      return upgrade(Number(d.id), el);
    case 'move': {
      const o = town.object(Number(d.id));
      if (o) liftByTap(o);
      return;
    }
    case 'clear':
      return clearLot(Number(d.a), Number(d.b), el);
    case 'deselect':
      sound('close');
      return deselect();
    default:
  }
}

/** Not enough coins (or no room): say so, shake the button. */
function short(r, el) {
  sound('error');
  if (el) fx.shake(el);
  toasts.show(`${r.short ? icon('coin') : ''}${esc(r.reason)}${r.short ? '. Play a night!' : ''}`, 'warn');
}

function pick(id) {
  const p = town.person(id);
  if (!p) return;
  town.setPick(id);
  sound('tap');
  haptic(10);
  if (modals.isOpen) modals.close();
  save();
  refresh();
  map.cheerPerson(id);
  hud.bump('who');
  toasts.show(`${face(p, { size: 28, lv: false })}<b>${name(p)}</b> goes out tonight`, '', 1800);
}

function upgrade(id, el) {
  const r = town.upgrade(id);
  if (!r.ok) return short(r, el);
  save();
  sound('levelUp');
  haptic(18);
  refresh();
  const home = map.homeEl(id);
  if (home) {
    fx.burst(home, r.newTier ? ['#ffd36b', '#ff8ad8', '#62e6ff', '#7dffa1'] : ['#ffd36b', '#fff2b0'], r.newTier ? 30 : 16, r.newTier ? 120 : 70);
    const rr = home.getBoundingClientRect();
    fx.float({ x: rr.left + rr.width / 2, y: rr.top + rr.height * 0.3 }, r.newTier ? `${esc(HOME_TIERS[r.tierTo].name)}!` : `Lv ${r.to}!`, r.newTier ? 'lvup big' : 'lvup');
    if (r.newTier) fx.confetti(home, 40);
  }
  map.cheerPerson(id);
  if (r.newTier) sound('upgrade');
}

// --- Selection ---------------------------------------------------------------------------------------

function selCentre(sel) {
  if (sel.kind === 'lot') return { i: sel.a * LOT + 3.5, j: sel.b * LOT + 3.5 };
  const o = town.object(sel.id);
  return o ? { i: o.i + o.size / 2, j: o.j + o.size / 2 } : null;
}

function select(sel) {
  if (map.placing) return;
  closeDrawer();
  const same = !!ui.sel && JSON.stringify(ui.sel) === JSON.stringify(sel);
  markSel(false);
  ui.sel = sel;
  if (!renderSel()) return;
  markSel(true);
  sound(same ? 'tap' : 'open');
  hud.setMode('sel');
  const c = selCentre(sel);
  if (c && !same) map.glide(c.i, c.j, { ms: 380, dy: 60 });
}

function deselect() {
  if (!ui.sel) return;
  markSel(false);
  ui.sel = null;
  selEl.classList.remove('open');
  if (hud.root.dataset.mode === 'sel') hud.setMode('');
}

/** Draw the bar for the selection. false (and deselected) if it's gone. */
function renderSel() {
  const html = selBar(town, ui.sel);
  if (!html) {
    deselect();
    return false;
  }
  if (selEl.dataset.html !== html) {
    selEl.dataset.html = html;
    selEl.innerHTML = html;
  }
  selEl.classList.add('open');
  return true;
}

function markSel(on) {
  const s = ui.sel;
  if (!s) return;
  const el = s.kind === 'lot' ? map.wildEl(s.a, s.b) || map.tagEl(s.a, s.b) : map.objectEl(s.id);
  if (el) el.classList.toggle('selected', on);
}

// --- A night out -------------------------------------------------------------------------------------

async function playNight() {
  if (busy) return;
  deselect();
  closeDrawer();
  if (map.placing) {
    map.placeCancel();
    afterPlaceUi();
  }
  const r = town.play();
  if (!r.ok) return;
  save();
  arm();
  hud.hideHand();
  hud.freeze();
  setBusy(true);
  try {
    await nightShow(overlay, { town, result: r, fx, sound, hud, haptic });
  } catch (e) {
    recover(e);
  } finally {
    hud.thaw();
    setBusy(false);
    refresh();
  }
  if (r.station) await stationUp(r.station);
}

/** The Gas Station fixed itself up (and maybe the fence). */
async function stationUp(st) {
  const s = town.station();
  if (!s) return;
  setBusy(true, { walk: true });
  try {
    await map.glide(s.i + 1.5, s.j + 1.5, { ms: 450 });
    const el = map.stationEl();
    sound(st.newStage ? 'zone' : 'upgrade');
    if (el) {
      fx.burst(el, ['#ffd36b', '#ff8ad8', '#62e6ff'], st.newStage ? 34 : 18, 120);
      if (st.newStage) fx.confetti(el, 70);
    }
    map.cheerAt(s, 6);
    const line = st.newStage ? `The Gas Station is <b>${esc(STAGE_NAMES[st.stage])}</b>!` : st.to >= 7 ? 'Gold trim on the Gas Station!' : 'The Gas Station got a little nicer.';
    toasts.show(`${A.townIcon('flag')}${line}${st.fence ? ' And the fence!' : ''}`, 'gift', 3000);
    await wait(900);
  } finally {
    setBusy(false);
  }
}

// --- BUILD -------------------------------------------------------------------------------------------

function openDrawer() {
  deselect();
  drawer.open();
  hud.setMode('drawer');
  sound('open');
}

function closeDrawer() {
  if (!drawer.isOpen) return;
  drawer.close();
  if (hud.root.dataset.mode === 'drawer') hud.setMode('');
}


function drawerPick(k, d, el) {
  sfx.unlock();
  if (busy) return;
  if (k === 'close') return closeDrawer();
  if (k === 'home') {
    const c = town.canBuildHome();
    if (!c.ok) {
      if (c.room === false) {
        sound('error');
        closeDrawer();
        toasts.show(`${A.townIcon('lot')}No room for a home: clear the lot next door`, 'warn', 2600);
        const lot = town.suggestLot();
        if (lot) select({ kind: 'lot', a: lot.a, b: lot.b });
        return;
      }
      return short(c, el);
    }
    return placeNew({ size: HOME_SIZE, art: A.home(NOBODY, 'tent'), onOk: (i, j) => buildHome(i, j) });
  }
  if (k === 'decor') {
    const c = town.canBuy(d.k);
    if (!c.ok) return short(c, el);
    return placeNew({
      size: DECOR[d.k].size,
      art: A.decoration(d.k),
      onOk: (i, j) => {
        const r = town.buy(d.k, i, j);
        if (r.ok) {
          sound('coin');
          haptic(14);
          afterPlaceUi();
          save();
          refresh();
        }
        return r;
      },
    });
  }
}

function placeNew(spec) {
  drawer.hide(true);
  deselect();
  hud.setMode('place');
  map.startPlace({
    size: spec.size,
    art: spec.art,
    at: spec.at,
    onOk: (i, j) => {
      const r = spec.onOk(i, j);
      if (!r || !r.ok) {
        sound('error');
        if (r) toasts.show(esc(r.reason), 'warn');
      }
      return r;
    },
    onCancel: () => afterPlaceUi(),
  });
}

function afterPlaceUi() {
  if (drawer.isOpen) {
    drawer.hide(false);
    hud.setMode('drawer');
    drawer.render();
  } else hud.setMode('');
  refresh();
}

/** Confirmed a new home's spot: pay, and someone new moves in. */
function buildHome(i, j) {
  const r = town.buildHome(i, j);
  if (!r.ok) return r;
  save();
  closeDrawer();
  hud.setMode('');
  // The reveal plays once the ghost is gone and the home has landed.
  setTimeout(() => moveIn(r), 0);
  return r;
}

async function moveIn(r) {
  arm();
  setBusy(true);
  let v = 'ok';
  try {
    refresh();
    sound('coin');
    await wait(450);
    v = await moveInShow(overlay, { person: r.person, town, fx, sound, haptic, stronger: r.stronger });
  } catch (e) {
    recover(e);
  } finally {
    setBusy(false);
  }
  if (v === 'pick') town.setPick(r.person.id);
  save();
  refresh();
  map.arrive(r.person.id);
  if (v === 'pick') {
    hud.bump('who');
    toasts.show(`${face(r.person, { size: 28, lv: false })}<b>${name(r.person)}</b> goes out tonight`, '', 2000);
  }
}

// --- Moving ------------------------------------------------------------------------------------------

function liftByTap(o) {
  if (busy) return;
  closeDrawer();
  deselect();
  map.glide(o.i + o.size / 2, o.j + o.size / 2, { ms: 350 });
  map.lift(o, { byTap: true });
  hud.setMode('place');
}

// --- Land --------------------------------------------------------------------------------------------

async function clearLot(a, b, el) {
  if (busy) return;
  const L = LOTS[lotKey(a, b)];
  const r = town.clear(a, b);
  if (!r.ok) return short(r, el);
  save();
  arm();
  deselect();
  closeDrawer();
  hud.hideHand();
  if (r.coins) {
    hud.freeze();
    hud.shown.coins = town.s.coins - r.coins;
  }
  setBusy(true, { walk: true });
  try {
    await clearBeats(r, L);
  } catch (e) {
    recover(e);
  } finally {
    hud.thaw();
    setBusy(false);
    map.resetZeds();
    save();
    refresh(true);
  }
}

/** BONK, the ruin crumbles, grass blooms, the fence hops out, the sign rises. Tap to hurry it. */
async function clearBeats(r, L) {
  const { a, b } = r;
  const c = { i: a * LOT + 3.5, j: b * LOT + 3.5 };
  let fast = false;
  const speed = () => (fast = true);
  document.addEventListener('pointerdown', speed);
  const cw = (ms) => wait(fast ? Math.min(ms, 60) : ms);
  map.view.unpin(`t:${r.key}`);
  try {
    await map.glide(c.i, c.j, { zoom: Math.max(0.75, Math.min(1, map.view.cam.zoom)), ms: 450 });
    map.runTo(a, b);
    sound('whoosh');
    await cw(450);
    const wild = map.wildEl(a, b);
    if (wild) {
      const rr = wild.getBoundingClientRect();
      for (let k = 0; k < 3; k++) {
        setTimeout(() => {
          sound('bonk');
          fx.float({ x: rr.left + rr.width * (0.3 + 0.2 * k), y: rr.top + rr.height * 0.4 }, 'BONK!', 'bonk');
        }, k * 200);
      }
      if (L.kind === 'L') {
        const boss = wild.querySelector('.boss');
        if (boss) boss.classList.add('ko');
      }
    }
    await cw(550);
    map.crumble(a, b);
    sound('bloom');
    map.bloom(a, b);
    await cw(300);
    map.update();
    sound('thud');
    await cw(450);
    map.sign(a, b, L.name);
    sound('milestone');
    if (r.landmark) {
      const Lm = LANDMARKS[r.landmark];
      fx.confetti(null, 80);
      sound('zone');
      toasts.show(`<b>${esc(Lm.banner)}</b><br>The ${esc(Lm.name)} is yours again.`, 'gift', 3600);
    } else if (r.coins) {
      await cw(300);
      const pt = map.view.tileScreen(c.i, c.j);
      sound('cheer');
      fx.fly({ from: { x: pt.x, y: pt.y - 30 }, to: hud.target('coins'), html: coinSvg(), count: 9, onEach: () => sound('coin', { pitch: Math.random() }) });
      toasts.show(`${icon('coin')}A surprise in ${esc(L.name)}: <b>${r.coins}</b> coins!`, 'gift', 3000);
      setTimeout(() => hud.thaw(), 500);
    } else toasts.show(`${A.townIcon('lot')}<b>${esc(L.name)}</b> is yours. More room to build!`, '', 2400);
    await cw(700);
  } finally {
    document.removeEventListener('pointerdown', speed);
  }
}

// --- Hints (the first nights) ----------------------------------------------------------------------------

function hintTarget(h) {
  const p = town.picked();
  if (map.placing && !map.lifted) {
    const ok = map.pinEl('placebtns');
    return { el: ok ? ok.querySelector('.okb') : null, text: 'Drag it where you like, then tap ✓' };
  }
  if (h === 'play') return { el: hud.el.play, text: `Send <b>${p ? name(p) : 'them'}</b> out for the night` };
  if (h === 'upgrade') {
    const up = selEl.classList.contains('open') && selEl.querySelector('[data-act="upgrade"]');
    if (up) return { el: up, text: 'Upgrade: stronger, and a bigger home!' };
    const home = p && town.homeOf(p.id);
    return { el: home ? map.pinEl(`up:${home.id}`) : null, text: `Upgrade <b>${p ? name(p) : ''}</b>'s home`, tile: home ? { i: home.i + 1, j: home.j + 1 } : null };
  }
  if (h === 'build') {
    if (drawer.isOpen) return { el: drawer.cardEl('home'), text: 'Build a home: someone new moves in!' };
    return { el: hud.el.build, text: 'Build a new home' };
  }
  if (h === 'land') {
    const cl = selEl.classList.contains('open') && selEl.querySelector('[data-act="clear"]');
    if (cl) return { el: cl, text: 'Clear it: more room to build' };
    const lot = town.suggestLot();
    return { el: lot ? map.tagEl(lot.a, lot.b) : null, text: 'Clear the lot next door for more room', tile: lot ? { i: lot.a * LOT + 3.5, j: lot.b * LOT + 3.5 } : null };
  }
  return null;
}

function showHint() {
  const t = hintTarget(map.hint);
  if (!t || !t.el || !inView(t.el)) return;
  hud.pointAt(t.el, t.text, true);
}

function inView(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.right > 8 && r.left < innerWidth - 8 && r.bottom > 8 && r.top < innerHeight - 8;
}

function titleCard() {
  const el = document.createElement('div');
  el.id = 'title-card';
  const p = town.picked();
  el.innerHTML =
    `<div class="tc-in"><div class="kicker">FunLand2 · metagame prototype</div><h1>LAST STOP</h1>` +
    `<p>One gas station. One survivor. Build a town.</p><div class="tc-ppl"><span class="tc-p">${face(p, { size: 64, lv: false })}<b>${name(p)}</b></span></div>` +
    `<button class="btn yellow big" type="button">${icon('play')}Let's go!</button>` +
    `<p class="note">Nights are simulated. The gear (top right) has testing tools.</p></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  el.addEventListener('click', () => {
    sfx.unlock();
    sound('open');
    el.classList.remove('in');
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
    hud.poke();
  });
}

// --- Back button, keys, visibility ---------------------------------------------------------------------

function back() {
  if (dev.open) {
    dev.hide();
    return true;
  }
  if (map.placing) {
    map.placeCancel();
    afterPlaceUi();
    return true;
  }
  if (modals.back()) return true;
  if (drawer.isOpen) {
    closeDrawer();
    return true;
  }
  if (ui.sel) {
    deselect();
    return true;
  }
  return false;
}

let armed = false;
function arm() {
  if (armed) return;
  try {
    history.pushState({ outpost: 1 }, '');
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
    refresh();
  }
});
addEventListener('pagehide', save);
// Touching the map counts as activity: the hand steps aside.
$('map').addEventListener('pointerdown', () => hud.poke());
$('map').addEventListener('pointerup', () => hud.poke());

// --- Frame loop ---------------------------------------------------------------------------------------

let last = performance.now();
let tickT = 0;
function frame(now) {
  const dt = Math.min(100, now - last);
  last = now;
  clock.advance(dt);
  const quiet = !busy && !modals.isOpen && !dev.open && !overlay.classList.contains('on') && !$('title-card');
  hud.hintDelay = town.s.runs < 3 ? 1200 : 3500;
  hud.animate(dt, quiet && !!map.hint && !map.lifted);
  if (hud.handOn && !inView(hud.handOn)) hud.hideHand(); // its button slid away (a bar, the drawer)
  map.tick(dt);
  tickT += dt;
  if (tickT > 250) {
    tickT = 0;
    // The station off-screen: the home button. The hint's target off-screen: an edge pointer.
    const st = town.station();
    hud.showHome(!!st && !map.view.onScreen(st.i + 1.5, st.j + 1.5, -60) && !busy);
    const t = quiet && map.hint && !map.placing ? hintTarget(map.hint) : null;
    if (t && t.tile && !map.view.onScreen(t.tile.i, t.tile.j, 40)) hud.edgeAt(map.view.tileScreen(t.tile.i, t.tile.j));
    else hud.edgeAt(null);
  }
  requestAnimationFrame(frame);
}

// --- Boot ----------------------------------------------------------------------------------------------

refresh(true);
if (firstVisit) titleCard();
save();
setInterval(() => {
  if (!document.hidden) save();
}, 10000);
document.documentElement.classList.add('booted');
requestAnimationFrame(frame);

window.__outpost = { town, clock, hud, map, drawer, act, sfx, fx, refresh, playNight, clearLot, select, get state() { return town.s; } };
