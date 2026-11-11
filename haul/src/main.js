// Long Haul: boot, and every flow between the screens. The rules live in
// rules.js; this file asks them what happened and has the views show it.
//
//   camp  ->  PLAY  ->  the run (run-view)  ->  the haul (pick-view)  ->  camp
//   camp  ->  the radio bubble  ->  someone answered (moments.reveal)  ->  camp
//   a new stop or the ferry is celebrated on the way back to camp

import { Game, newState } from './rules.js';
import { loadState, saveState, clearState, loadTuning, saveTuning, clearTuning, migrate } from './save.js';
import { Clock } from './clock.js';
import { CAST, TUNING_DEFAULTS, BARKS, HOME_TALK } from './config.js';
import { Sfx } from './audio.js';
import { Fx, countUp, buzz } from './fx.js';
import { Toasts, Sheets, tickCountdowns, esc, wait } from './ui.js';
import { CampView } from './camp.js';
import { SPOTS } from './camp-art.js';
import { Hud } from './hud.js';
import { RunView } from './run-view.js';
import { PickView } from './pick-view.js';
import { Moments } from './moments.js';
import { Dev } from './dev.js';
import { welcomeSheet, survivorSheet, peopleSheet, roadSheet, radioSheet } from './sheets.js';
import { crayon } from './crate-art.js';
import { icon } from './icons.js';

const el = (id) => document.getElementById(id);

const tuning = loadTuning();
const state = loadState() || newState();
const clock = new Clock(state.clockOffset || 0);
const game = new Game(state, { clock, tuning });
const sfx = new Sfx();
sfx.setVolume(tuning.volume);
const fx = new Fx(el('fx'));
const toasts = new Toasts(el('toasts'));

let busy = false; // a run, a haul or a moment has the screen
let sheetUi = { id: null, swapping: false, cheer: false };
let backTo = null; // the sheet to return to when this one closes ('people')
let leaving = false; // the page is reloading on purpose (reset, load a save): don't write the old save back on the way out

function save() {
  if (leaving) return;
  state.clockOffset = clock.offset;
  saveState(state);
}

const hud = new Hud(el('hud'), { game, onAct });
const camp = new CampView(el('camp'), el('pins'), { game, onAct, sfx });
const sheets = new Sheets(el('modals'), {
  onAct,
  onOpen: () => {
    sfx.play('open');
    hud.hideHand();
  },
  onClose: () => {
    sfx.play('close');
    sheetUi = { id: null, swapping: false, cheer: false };
    if (backTo === 'people' && !busy) {
      backTo = null;
      return sheets.open(() => peopleSheet(game), { cls: 'wide', key: 'people' });
    }
    backTo = null;
    return refresh();
  },
});
const runView = new RunView(el('stage'), { sfx, fx, tuning, game });
const pickView = new PickView(el('stage'), { game, sfx, fx, tuning, save });
const moments = new Moments(el('stage'), { game, sfx, fx, tuning });
const dev = new Dev(el('dev'), {
  game,
  toast: (m) => toasts.show(esc(m)),
  onClose: () => {
    if (!busy) refresh();
  },
  onTuning(key) {
    if (key === '*defaults') Object.assign(tuning, TUNING_DEFAULTS);
    sfx.setVolume(tuning.volume);
    saveTuning(tuning);
    if (key === 'volume') sfx.play('toast');
    refresh();
  },
  onCheat(kind, arg) {
    const ok = game.cheat(kind, arg);
    save();
    refresh();
    // A stop reached by cheating is celebrated now, unless a run or a haul has
    // the screen: then it is celebrated on the way home, like any other.
    if (ok && !busy && (game.pendingArea() != null || game.pendingFerry())) {
      dev.hide();
      road();
    }
    return ok;
  },
  onWarp(ms) {
    clock.warp(ms);
    game.tick();
    save();
    refresh();
  },
  onReset() {
    leaving = true;
    clearState();
    clearTuning();
    location.reload();
  },
  onImport(text) {
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object' || !parsed.cast || !Array.isArray(parsed.squad)) return toasts.show('That doesn’t look like a save');
    leaving = true;
    saveState(migrate(parsed));
    return location.reload();
  },
  async onExport() {
    const text = JSON.stringify(state);
    try {
      await navigator.clipboard.writeText(text);
      toasts.show('Save copied');
    } catch {
      const box = el('dev').querySelector('.savebox');
      if (box) {
        box.classList.remove('hidden');
        box.value = text;
        box.select();
      }
      toasts.show('Copy it from the box');
    }
  },
});

// --- Drawing the camp and pointing the way -----------------------------------------------------

function refresh() {
  hud.sync();
  hud.render();
  camp.render();
  pointTheWay();
}

/** The first session is guided by a hand; a waiting radio call always gets it. */
function pointTheWay() {
  if (busy || sheets.isOpen || dev.open || !state.welcomed) return hud.hideHand();
  const h = game.hint();
  const guiding = game.guiding();
  if (h.kind === 'radio') return hud.point(camp.radioTarget()); // the bubble says it already
  if (!guiding) return hud.hideHand();
  if (h.kind === 'level') return hud.point(hud.cardEl(h.id), `Level up ${CAST[h.id].short || CAST[h.id].name}`);
  if (h.kind === 'gift') return hud.point(camp.point(SPOTS.gift.x, SPOTS.gift.y - 40), 'Somebody left this');
  return hud.point(hud.playEl(), state.runs === 0 ? 'Send them out' : '');
}

// --- Every tap on a [data-act] ends up here ------------------------------------------------------

function onAct(act, data = {}) {
  sfx.unlock();
  switch (act) {
    case 'play':
    case 'truck':
      return play();
    case 'survivor':
      return openSurvivor(data.id);
    case 'people':
      sfx.play('tap');
      backTo = null;
      return sheets.open(() => peopleSheet(game), { cls: 'wide', key: 'people' });
    case 'road': {
      sfx.play('tap');
      sheets.open(() => roadSheet(game), { cls: 'wide', key: 'road' });
      // Open on where you are, not on stop 1.
      const here = el('modals').querySelector('.stop.here');
      const scroller = el('modals').querySelector('.scroll.sideways');
      if (here && scroller) scroller.scrollLeft = Math.max(0, here.offsetLeft - (scroller.clientWidth - here.offsetWidth) / 2);
      return undefined;
    }
    case 'radio':
      if (busy) return undefined;
      if (game.answered() > 0) return answerCall();
      sfx.play('tap');
      return sheets.open(() => radioSheet(game), { key: 'radio' });
    case 'fire':
      sfx.play('crateTap');
      return fx.burst(camp.point(SPOTS.fire.x, SPOTS.fire.y - 30), { color: '#ffb93a', n: 12, r: 60, size: 7 });
    case 'gift':
      return takeGift();
    case 'dev':
      sfx.play('tap');
      hud.hideHand();
      return dev.toggle();
    case 'start':
      state.welcomed = true;
      save();
      sfx.play('tap');
      return sheets.close();
    case 'level':
      return levelUp(data.id);
    case 'swap-start':
      sfx.play('tap');
      sheetUi.swapping = true;
      return sheets.refresh();
    case 'swap-cancel':
      sfx.play('tap');
      sheetUi.swapping = false;
      return sheets.refresh();
    case 'swap': {
      const out = game.putInSquad(data.id, Number(data.slot));
      if (!out.ok) return sfx.play('deny');
      save();
      sfx.play('swap');
      sheetUi.swapping = false;
      sheets.refresh();
      hud.render();
      camp.render();
      return undefined; // (the sheet itself now says "In the squad")
    }
    case 'best': {
      const came = game.useBest();
      if (!came.length) return sfx.play('deny');
      save();
      sfx.play('swap');
      sheets.refresh();
      hud.render();
      camp.render();
      return undefined; // (the cards on the sheet show who is in)
    }
    default:
      return undefined;
  }
}

function openSurvivor(id) {
  if (!game.has(id) || busy) return;
  sfx.play('tap');
  backTo = sheets.cur && sheets.cur.key === 'people' ? 'people' : null;
  sheetUi = { id, swapping: false, cheer: false };
  sheets.open(() => survivorSheet(game, id, sheetUi), { key: `survivor:${id}`, cls: 'surv-sheet' });
  const fig = camp.figureEl(id);
  if (fig) {
    fig.classList.add('hop');
    setTimeout(() => fig.classList.remove('hop'), 500);
  }
}

// --- Levelling up ------------------------------------------------------------------------------

function levelUp(id) {
  const out = game.levelUp(id);
  if (!out.ok) return sfx.play('deny');
  save();
  sfx.play('levelUp');
  buzz([20, 40, 30], tuning.haptics);
  sheetUi.cheer = true;
  sheets.refresh();
  sheets.hold(450);
  const card = el('modals').querySelector('.sheet');
  if (card) {
    const standEl = card.querySelector('.stand');
    fx.ring(standEl, '#5fd068', 300);
    fx.confetti({ n: 46, from: standEl });
    fx.shake(card, 4, 220);
    const stamp = document.createElement('div');
    stamp.className = 'stamp';
    stamp.innerHTML = `LEVEL ${out.level}!`;
    card.appendChild(stamp);
    setTimeout(() => stamp.remove(), 1300);
    const pw = card.querySelector('[data-pw]');
    countUp(pw, out.before, out.power, { ms: 520, onTick: (k) => sfx.play('power', { pitch: k }) });
    fx.pop(pw && pw.parentNode, 1.3, 520);
  }
  hud.sync();
  hud.render();
  camp.render();
  camp.cheer(id);
  setTimeout(() => {
    if (sheetUi.id === id && sheetUi.cheer) {
      sheetUi.cheer = false;
      sheets.refresh();
    }
  }, 1150);
  return undefined;
}

// --- A run, and the haul it brings home ---------------------------------------------------------

async function play() {
  if (busy || sheets.isOpen || dev.open) return;
  if (state.haul) return pickUp(null);
  busy = true;
  hud.hideHand();
  sfx.play('tap');
  const res = game.play();
  save();
  document.body.classList.add('away');
  await camp.depart();
  await runView.play(res, { canSkip: res.run > 0 });
  if (res.stars > 0) await pickUp(res);
  else {
    await wait(150);
    runView.close();
    await backHome({ next: 'camp' }, res);
  }
}

/** The pick screen (`res` is null when a reload left a haul waiting). */
async function pickUp(res) {
  busy = true;
  hud.hideHand();
  document.body.classList.add('away');
  const next = await pickView.show(res);
  game.finishHaul();
  save();
  pickView.close();
  await backHome(next, res);
}

async function backHome(next, res = null) {
  document.body.classList.remove('away');
  hud.sync();
  hud.render();
  camp.arrive();
  if (res && res.stars > 0 && res.road.areaAfter === res.road.areaBefore) starsHome(res);
  await road();
  busy = false;
  refresh();
  if (next.open === 'radio' && game.answered() > 0) answerCall();
  else if (next.open && game.has(next.open)) openSurvivor(next.open);
  else if (next.next === 'again') play();
  else if (res) setTimeout(() => homeTalk(res), 650);
}

/** Someone from the squad has a word about how it went. */
function homeTalk(res) {
  if (busy || sheets.isOpen || dev.open) return;
  const any = (list) => list[Math.floor(Math.random() * list.length)];
  const down = res.squad.filter((id, i) => !res.standing[i] && state.squad.includes(id));
  const up = res.squad.filter((id, i) => res.standing[i] && state.squad.includes(id));
  if (!up.length && down.length) camp.say(any(down), any(HOME_TALK.none));
  else if (down.length) {
    const id = any(down);
    camp.say(id, any(CAST[id].look.dog ? HOME_TALK.dog : HOME_TALK.down));
  } else if (up.length && Math.random() < 0.5) {
    const id = any(up);
    if (!CAST[id].look.dog) camp.say(id, any(HOME_TALK.all));
  }
}

/** The run's stars fly from the truck to the road, and the bar fills up to where it now is. */
function starsHome(res) {
  const r = game.road();
  const span = r.to - r.from;
  const from = Math.max(0, (res.road.before - r.from) / span);
  hud.setRoad(from);
  let landed = 0;
  fx.fly({
    from: camp.point(SPOTS.truck.x, SPOTS.truck.y),
    to: hud.roadEl(),
    html: icon('star'),
    count: res.stars,
    size: 30,
    stagger: 130,
    spread: 26,
    onEach: () => {
      landed++;
      hud.setRoad(landed >= res.stars ? null : from + ((r.t - from) * landed) / res.stars);
      sfx.play('token', { pitch: 0.4 + landed * 0.2 });
      fx.pop(hud.roadEl(), 1.06, 180);
    },
    onDone: () => hud.setRoad(null),
  });
}

/** Celebrate any stop reached (and the ferry) before the camp gets the screen back. */
let onTheRoad = false;
async function road() {
  if (onTheRoad) return; // already celebrating: that loop picks up whatever else was reached
  onTheRoad = true;
  const was = busy;
  busy = true;
  hud.hideHand();
  try {
    while (game.pendingArea() != null) {
      const a = game.arrive();
      save();
      await moments.arrive(a);
      moments.close();
      hud.render();
    }
    if (game.pendingFerry()) {
      game.boardFerry();
      save();
      await moments.ferry();
      moments.close();
    }
  } finally {
    onTheRoad = false;
    busy = was;
  }
  if (!busy) refresh();
}

// --- The radio ---------------------------------------------------------------------------------

async function answerCall() {
  if (busy) return;
  if (sheets.isOpen) sheets.close();
  busy = true;
  hud.hideHand();
  const res = game.answer();
  if (!res.ok) {
    busy = false;
    return;
  }
  save();
  camp.renderRack();
  const choice = await moments.reveal(res);
  if (choice === 'squad' && !state.squad.includes(res.id)) {
    const slot = game.weakestSlot();
    const out = state.squad[slot];
    if (game.putInSquad(res.id, slot).ok) {
      sfx.play('swap');
      toasts.show(`${esc(CAST[res.id].name)} is in. ${esc(CAST[out].name)} sits this one out.`);
    }
  }
  save();
  moments.close();
  busy = false;
  refresh();
  if (res.isNew) {
    camp.welcome(res.id);
    camp.cheer(res.id, 1400);
  }
}

// --- The crate at the gate ----------------------------------------------------------------------

function takeGift() {
  if (busy) return;
  const g = game.takeGift();
  if (!g.ok) return;
  save();
  sfx.play('gift');
  const from = camp.point(SPOTS.gift.x, SPOTS.gift.y - 30);
  fx.float(from, crayon(g.line), 'crayon-float');
  const n = 8;
  let landed = 0;
  fx.fly({
    from,
    to: hud.walletEl(),
    html: icon('supplies'),
    count: n,
    size: 24,
    onEach: () => {
      landed++;
      hud.bumpBy(Math.ceil(g.amount / n));
      sfx.play('supplies', { pitch: landed / n });
    },
    onDone: () => hud.sync(),
  });
  camp.render();
  pointTheWay();
}

// --- Talk around the fire -----------------------------------------------------------------------

let lastBark = null;
function bark() {
  setTimeout(bark, 8000 + Math.random() * 6000);
  if (busy || sheets.isOpen || dev.open || !state.welcomed || document.visibilityState !== 'visible') return;
  const can = BARKS.filter((b) => game.has(b.who) && b !== lastBark && (!lastBark || b.who !== lastBark.who));
  if (!can.length) return;
  const b = can[Math.floor(Math.random() * can.length)];
  lastBark = b;
  if (!camp.say(b.who, b.say)) return;
  if (b.then && game.has(b.then[0])) setTimeout(() => !busy && !sheets.isOpen && camp.say(b.then[0], b.then[1], 2200), 1300);
}
setTimeout(bark, 5000);

// --- Time, keys, the window ---------------------------------------------------------------------

let lastSave = 0;
setInterval(() => {
  // A hidden page doesn't count as being here: comeBack() measures the time away.
  if (document.visibilityState !== 'visible') return;
  game.tick();
  const now = clock.now();
  tickCountdowns(document, now);
  if (!busy && camp.tick()) {
    // A call just got its answer.
    sfx.play('callAnswered');
    if (sheets.isOpen) sheets.refresh();
    else pointTheWay();
  }
  if (performance.now() - lastSave > 15000) {
    lastSave = performance.now();
    save();
  }
}, 250);

function comeBack() {
  const back = game.comeBack();
  save();
  if (!busy) refresh();
  return back;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') comeBack();
  else save();
});
window.addEventListener('pagehide', save);

let resizeT = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    camp.fit();
    pointTheWay();
  }, 60);
});

window.addEventListener('keydown', (e) => {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === '`') dev.toggle();
  else if (e.key === 'Escape') {
    if (dev.open) dev.hide();
    else if (sheets.isOpen && state.welcomed) sheets.close();
  } else if (e.key === 'm' || e.key === 'M') {
    tuning.volume = tuning.volume > 0 ? 0 : TUNING_DEFAULTS.volume;
    sfx.setVolume(tuning.volume);
    saveTuning(tuning);
    toasts.show(tuning.volume ? 'Sound on' : 'Sound off');
  } else if ((e.key === ' ' || e.key === 'Enter') && !busy && !sheets.isOpen && !dev.open && state.welcomed) {
    // A focused button takes its own Space and Enter.
    if (e.target && e.target.closest && e.target.closest('button, a, select')) return;
    e.preventDefault();
    sfx.unlock();
    play();
  }
});
document.addEventListener('pointerdown', () => sfx.unlock(), { passive: true });

// --- Go ----------------------------------------------------------------------------------------

comeBack();
refresh();
if (!state.welcomed) sheets.open(() => welcomeSheet(game), { modal: true, cls: 'welcome-sheet', key: 'welcome' });
else if (state.haul) pickUp(null);
else road();

window.__haul = { game, state, clock, tuning, camp, hud, sheets, sfx, fx, dev, play, refresh, save };
document.documentElement.classList.add('booted');
