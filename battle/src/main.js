// Wobble War: boot and the game shell. One canvas and one frame loop serve three modes:
//   attract  a bot-vs-bot arena match playing silently behind the hub (ui/hub.js),
//   match    you (blue) against a bot (red): VS intro, the battle HUD, the hand of
//            cards (drag or tap to play), the tutorial coach and the result screen,
//   sandbox  the old free-placement toy: place both armies, FIGHT, slow-mo, grab beans.
// Sim events become effects, sound, haptics, camera shake and badge stats here.
// The rules live in sim/ (Match, Bot) and meta/ (profile, ladder, opponents); the
// menus live in ui/hub.js.

import { WORLD, TEAMS, enemyOf } from './config.js';
import { Battle, DT } from './sim/battle.js';
import { Match, ANYWHERE, ANYWHERE_CLEAR } from './sim/match.js';
import { Bot } from './sim/bot.js';
import { cardById } from './sim/cards.js';
import { UNIT_TYPES, UNIT_ORDER } from './sim/unit-types.js';
import { Camera } from './render/camera.js';
import { UnitRenderer } from './render/units.js';
import { createBackground } from './render/background.js';
import { createTowerRenderer } from './render/towers.js';
import { drawSpellsBack, drawSpells, drawShots, drawZone, DeployGhosts } from './render/spells.js';
import { cardFace } from './render/cards.js';
import { Effects, fxForEvent } from './render/effects.js';
import { BattleAudio } from './audio.js';
import { Input } from './input.js';
import { loadProfile, saveProfile, newProfile, rngFrom, PROFILE_KEY, PROFILE_VERSION } from './meta/profile.js';
import { ARENAS, arenaIndex, kingLevelForXp } from './meta/collection.js';
import { recordMatch, startPending, updatePending, settlePending } from './meta/ladder.js';
import { readyChests } from './meta/chests.js';
import { makeOpponent, buildDeck, BOT_NAMES } from './meta/opponents.js';
import { armyPalette } from './meta/cosmetics.js';
import { HATS } from './render/hats.js';
import { createHub } from './ui/hub.js';
import { demoStyle } from './ui/hub-kit.js';
import { registerPWA, promptInstall, installMethod } from './pwa.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const $ = (id) => document.getElementById(id);
const uiSeed = () => ((Math.random() * 2 ** 31) | 0) + 1;

// Tuning for the shell (the match rules themselves live in sim/match.js)
const INTRO_T = 2.3; // VS screen before a match
const RESULT_DELAY = 2.2; // seconds from the final whistle to the result screen
const FINAL_SLOW = 1.1; // slow-mo on the blow that ends a match
const ZONE_SNAP = 40; // world px: a unit card released this close outside the zone snaps in
const DRAG_SLOP = 9; // CSS px a finger may wander on a card and still count as a tap
const GUARD_MS = 400; // a second tap this soon must not hit what just appeared under it
const LIFT_BAND = 56; // CSS px above the hand: a card just lifted out of it says nothing yet about where it goes

// --- profile ------------------------------------------------------------------------

let hub = null; // ui/hub.js (created at boot, below)
const store = (() => {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked storage: play on, just without saving
  }
})();
let profile = loadProfile(store);
// A match that never finished (reload, app killed): left while behind counts as a loss,
// otherwise it is dropped; a notice says which (ladder.js settlePending).
settlePending(profile);
let savedStats = { ...profile.stats }; // stats as of our last save
let saveFailed = false; // the last save didn't stick (storage full or blocked): say so once
let saveWarned = false;
function persist() {
  const ok = !!store && saveProfile(profile, store);
  savedStats = { ...profile.stats };
  saveFailed = !ok;
  if (ok) saveWarned = false;
  else if (!saveWarned && hub) {
    saveWarned = true;
    // (the game's toast is hidden under the menu: there, the menu's own toast says it)
    setTimeout(() => {
      if (hub.isOpen()) hub.toast("Progress can't be saved: this browser's storage is full or blocked");
      else toast("Progress can't be saved", 'This browser has storage full or blocked: chests, cards and trophies will be lost when you close the game', 4.5);
    }, 400);
  }
}
persist(); // write a migrated (v1 -> v2) save back at once, with its veteran-gift notice

/** Swap in another profile without replacing the object (the hub holds a reference to it). */
function replaceProfile(next) {
  for (const k of Object.keys(profile)) delete profile[k];
  Object.assign(profile, next);
}

// --- core objects ---------------------------------------------------------------

const canvas = $('game');
const ctx = canvas.getContext('2d');
const camera = new Camera();
const unitsGfx = new UnitRenderer();
const towersGfx = createTowerRenderer({ seed: 7 });
const ghosts = new DeployGhosts(unitsGfx);
const sandboxBg = createBackground({ seed: 7 });
const arenaBgs = new Map();
const fx = new Effects({ seed: 11 });
const audio = new BattleAudio();

/**
 * The arena scenery for a theme (the tinting happens at build time). Only the one in use
 * is kept: each holds ~20 MB of cached tiles, and a session rarely changes arena.
 */
function arenaBg(theme) {
  const k = clamp(theme | 0, 0, ARENAS.length - 1);
  if (!arenaBgs.has(k)) {
    arenaBgs.clear(); // (the old scenery's canvases go with it)
    arenaBgs.set(k, createBackground({ seed: 7 + k * 13, castles: false, theme: k }));
  }
  return arenaBgs.get(k);
}

const game = {
  mode: null, // attract | match | sandbox
  battle: new Battle(1),
  match: null, // attract + match: the Match (battle = match.battle)
  bots: [], // bots stepping with the match (two in attract, red in a match)
  opp: null, // the match's opponent (meta/opponents.js)
  bg: sandboxBg,
  frameT: 0, // attract: next check of the hub's insets
  frameKey: '',
  dirty: false, // draw one frame even while the demo rests behind another tab
  attractDt: 0, // time saved up between the demo's (30 fps) frames
  pendingId: '', // match: its profile.pending record (ladder.js startPending)
  intro: 0, // seconds of VS screen left
  introAt: 0,
  fightOn: false, // the match clock has started
  paused: false,
  realTime: 0,
  inputBlockUntil: 0, // swallow taps that fall through from a just-closed overlay
  finalSlowT: 0,
  finalSlowDur: 1.5,
  hitstop: 0,
  hitstopCool: 0,
  resultT: -1, // seconds until the result screen
  attractRestartT: -1,
  lastWordT: -1,
  bonkTimes: [],
  lastDeath: null,
  finalVictim: null,
  lastCrowns: { blue: 0, red: 0 },
  track: null, // per-match badge bookkeeping
  summary: null, // what the last match paid (ladder.recordMatch + extras), for the result and the hub
  // sandbox
  snapshot: null,
  selected: 'clubber',
  erase: false,
  slowmo: false,
  hover: null,
  grabNoticeShown: false,
  zoneToastT: -9,
};

const playing = () => game.mode === 'match' || game.mode === 'sandbox';
const inMatch = () => game.mode === 'match' && game.match;
/** The player may act in the match right now (not during the intro, a pause or after the end). */
const canAct = () => inMatch() && game.intro <= 0 && !game.paused && game.match.phase !== 'over';

/** Team colours: the player's army wears the colour they picked. */
function pal(team) {
  return team === 'blue' ? armyPalette(profile) : TEAMS[team];
}

// --- screen ----------------------------------------------------------------------------

let W = 1;
let H = 1;
let dpr = 1;
// The bottom of the match HUD's top row (CSS px), measured once per layout (-1: not yet)
let hudTop = -1;
function hudTopPx() {
  if (hudTop < 0) {
    const r = hud.top ? hud.top.getBoundingClientRect() : null;
    if (r && r.height > 0) hudTop = r.bottom; // (hidden until the match screen shows: try again next frame)
  }
  return Math.max(0, hudTop);
}
function resize() {
  W = Math.max(1, window.innerWidth);
  H = Math.max(1, window.innerHeight);
  dpr = Math.min(window.devicePixelRatio || 1, 2); // 3x phones: 44% less fill, no visible loss for this art
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  camera.setView(W, H);
  document.documentElement.style.setProperty('--ui-scale', clamp(Math.min(H / 760, W / 1100), 0.62, 1.15).toFixed(3));
  if (game.mode === 'sandbox') {
    if (game.battle.phase === 'place' && camera.follow) framePlacement(true);
    else camera.clampView();
  } else frameArena(true);
  hand.size();
  game.dirty = true; // (resizing cleared the canvas: draw it again even if the demo is resting)
  // Turned upright: the rotate prompt covers the field (style.css), so the match waits for you
  // (during the VS intro too: pauseGame freezes the intro's countdown)
  if (W < H && W <= 700 && inMatch()) pauseGame();
  hudTop = -1;
}
window.addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

/**
 * Arena camera: the whole field, the ground just above the hand so the HUD never
 * covers a tower's base or a bean's feet. Behind the hub: a calm wide shot above its tabs.
 */
function frameArena(instant) {
  if (game.mode === 'match') camera.frameArena({ hudTop: hud.top.offsetHeight + 2, hudBottom: hud.tray.offsetHeight + 4 }, instant);
  else if (game.mode === 'attract') {
    // Between the hub's arena banner and its BATTLE row when it says where they are
    const ins = hub && hub.insets && hub.isOpen() && hub.current() === 'battle' ? hub.insets() : null;
    const ok = ins && ins.top >= 0 && ins.bottom >= 0 && ins.top + ins.bottom < H * 0.75;
    const opts = ok ? { hudTop: ins.top + 4, hudBottom: ins.bottom + 2 } : { hudTop: H * 0.12, hudBottom: clamp(H * 0.2, 56, 150) };
    const key = `${W}x${H}|${Math.round(opts.hudTop)}|${Math.round(opts.hudBottom)}`;
    if (!instant && key === game.frameKey) return;
    game.frameKey = key;
    camera.frameArena(opts, instant);
  }
}

function framePlacement(instant) {
  camera.follow = true;
  camera.groundTarget = 0.74;
  if (instant) camera.groundFrac = 0.74;
  camera.frame(WORLD.zone.blue[0] - 90, WORLD.zone.red[1] + 90, instant, 1.35);
}

// --- settings, haptics -------------------------------------------------------------

function applyPalette() {
  const p = armyPalette(profile);
  const root = document.documentElement.style;
  root.setProperty('--army', p.body);
  root.setProperty('--army-dark', p.dark);
  root.setProperty('--army-light', p.light);
  unitsGfx.palettes.blue = p;
  towersGfx.palettes.blue = p;
  hand.redraw();
  ui.cardSig = ''; // sandbox unit cards wear the colour too
  if (game.mode === 'sandbox' && game.battle.phase === 'place') ui.buildCards();
}

function applySettings() {
  const S = profile.settings;
  audio.setMuted(!S.sound);
  audio.setVolume(S.volume);
  ui.refreshMute();
  applyPalette();
}

function setSetting(k, v) {
  profile.settings[k] = v;
  persist();
  applySettings();
  if (k === 'haptics' && v) buzz(20);
}

/** Short vibration on Android (iOS Safari has none). Only in the player's own games. */
function buzz(pattern) {
  if (!profile.settings.haptics || !playing() || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

function shake(a) {
  if (!profile.settings.shake) return;
  camera.shake(game.mode === 'attract' ? a * 0.35 : game.mode === 'match' ? a * 0.75 : a);
}

/** Ignore canvas taps for a moment (a double-tap on a button mustn't act on the field). */
function blockInput(ms = GUARD_MS) {
  game.inputBlockUntil = performance.now() + ms;
}

function toggleMute() {
  audio.unlock();
  setSetting('sound', !profile.settings.sound);
}

let toastTimer = 0;
function toast(big, small, secs = 2) {
  const el = $('toast');
  el.innerHTML = `<div class="big">${big}</div>${small ? `<div class="small">${small}</div>` : ''}`;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), secs * 1000);
}

// --- modes ---------------------------------------------------------------------------

function setMode(mode) {
  game.mode = mode;
  const cl = document.body.classList;
  for (const m of ['attract', 'match', 'sandbox']) cl.toggle('mode-' + m, m === mode);
  cl.toggle('in-hub', mode === 'attract');
  cl.remove('match-over', 'x2', 'paused');
  game.paused = false;
  game.slowmo = false;
  pause.hide();
  mresult.hide();
  coach.stop();
  coach.on = false;
  aim.cancel();
  hand.select(-1);
  vs.hide();
  ui.hideAllGameUI();
}

/** Fresh fight bookkeeping (any mode). */
function resetFight() {
  fx.clear();
  unitsGfx.trails.clear();
  game.match = null;
  game.bots = [];
  game.intro = 0;
  game.fightOn = false;
  game.resultT = -1;
  game.finalSlowT = 0;
  game.hitstop = 0;
  game.hitstopCool = 0;
  game.attractRestartT = -1;
  game.finalVictim = null;
  game.lastDeath = null;
  game.lastCrowns = { blue: 0, red: 0 };
  game.summary = null;
  game.track = { explodes: [], chained: false, flew: new WeakSet(), pinned: new WeakSet(), homeRun: new WeakSet(), boinged: false, towers: 0, landed: new WeakSet() };
  camera.fast = false;
  acc = 0;
}

/**
 * The hub's living background: two bots play a real arena match (decks from the
 * player's arena, so they get a peek at its cards), silently, on loop.
 */
function startAttract() {
  setMode('attract');
  resetFight();
  const seed = uiSeed();
  const arena = clamp(arenaIndex(profile.trophies), 0, ARENAS.length - 1);
  const rng = rngFrom(seed, 'attract');
  const hatIds = HATS.filter((h) => !h.supporter && h.id !== 'none').map((h) => h.id);
  // (half the demo decks play the arena's newest style: a Wobble Summit demo shows Summit cards)
  const side = (hats) => ({ name: rng.pick(BOT_NAMES), deck: buildDeck(arena, demoStyle(arena, rng), rng), levels: {}, kingLevel: 1, hats });
  const theme = rng.pick(hatIds);
  const m = new Match({ seed, blue: side({ ...profile.equipped.hats }), red: side(Object.fromEntries(UNIT_ORDER.map((u) => [u, rng.chance(0.6) ? theme : 'none']))) });
  game.match = m;
  game.battle = m.battle;
  game.bots = [new Bot(m, 'blue', { skill: 0.5, seed: seed + 1 }), new Bot(m, 'red', { skill: 0.5, seed: seed + 2 })];
  game.bg = arenaBg(arena);
  unitsGfx.showHp = false;
  frameArena(true);
}

/** BATTLE: you against a fairly matched bot. */
function startMatch() {
  if (game.mode === 'match') return;
  audio.unlock();
  blockInput();
  hub.hide();
  setMode('match');
  resetFight();
  const seed = uiSeed();
  const opp = makeOpponent(profile, profile.stats.matches); // a new opponent per match; a reload meets the same one
  const levels = {};
  for (const id of profile.deck) levels[id] = profile.cards[id] ? profile.cards[id].level : 1;
  const kingLevel = kingLevelForXp(profile.king.xp);
  const m = new Match({ seed, blue: { name: profile.name || 'You', deck: profile.deck, levels, kingLevel, hats: { ...profile.equipped.hats } }, red: opp });
  game.match = m;
  game.battle = m.battle;
  game.opp = opp;
  game.bots = [new Bot(m, 'red', { skill: opp.skill, seed })];
  game.bg = arenaBg(opp.arena);
  unitsGfx.showHp = true;
  hud.start(m, opp, kingLevel);
  hand.size();
  frameArena(true);
  vs.show(m, opp, kingLevel);
  // A ladder match is remembered until it ends: a reload mid-match is settled on the next start
  game.pendingId = opp.tutorial ? '' : startPending(profile, opp.name, Date.now());
  if (game.pendingId) persist();
  armBack();
}

/** The VS screen is over: the clock starts. */
function beginFight() {
  if (!inMatch() || game.fightOn) return;
  game.fightOn = true;
  game.intro = 0;
  vs.hide(true);
  blockInput(200);
  banner('FIGHT!', 'b-fight');
  sfx('battleStart', {});
  shake(0.15);
  buzz(25);
  if (profile.tutorial === 0 && game.opp && game.opp.tutorial) coach.start();
}

function playSandbox() {
  audio.unlock();
  blockInput();
  hub.hide();
  setMode('sandbox');
  resetFight();
  unitsGfx.showHp = false;
  game.bg = sandboxBg;
  game.snapshot = null;
  game.erase = false;
  enterPlacement(null);
  armBack();
  toast('Sandbox', 'Tap the left side for blue, the right side for red', 2.4);
}

let pendingUpdate = null;
function applyPendingUpdate() {
  if (!pendingUpdate) return false;
  const f = pendingUpdate;
  pendingUpdate = null;
  f();
  return true;
}

/** Back to the hub (its live background restarts). */
function goHub(tab = 'battle') {
  persist();
  // A new version is waiting: switch now, between games (progress is saved). The menu
  // still comes up meanwhile, so nothing is stuck if the reload is slow.
  applyPendingUpdate();
  blockInput();
  input.reset();
  audio.resume();
  startAttract();
  hub.show(tab);
}

// --- Android back button ---------------------------------------------------------------
//
// Back steps back inside the game instead of leaving the page: it closes a hub
// card first, opens the pause menu in a match (and closes it again), leaves the
// sandbox for the hub. Only the bare hub lets the browser go back for real.

// Our extra entry is pushed while something in the game should take the back press, and
// popped (history.back()) on the bare hub. history.back() is asynchronous: until its popstate
// lands, a push would be undone by it (and a later back() would leave the page), so the wanted
// state is remembered and applied once the pop has arrived.
let backArmed = false; // our entry is on top of the history
let backWanted = false; // the screen wants it there
let popPending = false; // we called history.back() and its popstate has not arrived yet
let hubState = null; // last onShow from the hub: 'hub' | 'modal' | null

function syncBack() {
  if (popPending) return; // (the popstate handler syncs again)
  try {
    if (backWanted && !backArmed) {
      history.pushState({ wobble: 1 }, '');
      backArmed = true;
    } else if (!backWanted && backArmed) {
      backArmed = false;
      popPending = true;
      history.back();
    }
  } catch {
    popPending = false;
  }
}
/** On the bare hub: drop our extra history entry, so the next back press leaves for real. */
function disarmBack() {
  backWanted = false;
  syncBack();
}
function armBack() {
  backWanted = true;
  syncBack();
}
window.addEventListener('popstate', () => {
  if (popPending) {
    popPending = false;
    syncBack();
    return;
  }
  // A real back press: it used up our entry; whatever handles it below re-arms if it should
  backArmed = false;
  backWanted = false;
  if (hub.isOpen()) {
    if (hub.closeModal()) {
      if (hubState === 'modal' || playing() || hub.current() !== 'battle') armBack();
    } else if (hub.current() !== 'battle') {
      audio.play('tabSwitch');
      hub.show('battle');
    } else if (playing()) armBack();
    return;
  }
  if (game.mode === 'match') {
    if (mresult.open) {
      mresult.ok(true);
      if (mresult.open) armBack(); // (not taken: the result stays, and so must our entry)
    } else {
      if (game.paused) resumeGame();
      else pauseGame();
      armBack();
    }
    return;
  }
  if (game.mode === 'sandbox') {
    if (game.paused) {
      resumeGame();
      armBack();
    } else {
      audio.play('ui');
      goHub();
    }
    return;
  }
  hub.show('battle');
});

// --- pause -------------------------------------------------------------------------------

const pause = {
  el: $('pause'),
  shownAt: 0,
  armedAt: 0,
  armTimer: 0,
  build() {
    const tap = (fn) => () => {
      if (performance.now() - this.shownAt < GUARD_MS) return; // the tap that opened it
      fn();
    };
    $('p-resume').addEventListener('click', tap(() => resumeGame()));
    $('p-home').addEventListener('click', tap(() => (audio.play('ui'), goHub())));
    $('p-sound').addEventListener('click', tap(() => (toggleMute(), audio.play('ui'), this.refresh())));
    $('p-surrender').addEventListener('click', tap(() => this.surrenderTap()));
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el && performance.now() - this.shownAt > GUARD_MS) resumeGame();
    });
  },
  show() {
    this.shownAt = performance.now();
    this.disarm();
    const match = game.mode === 'match';
    $('pause-title').textContent = match && game.intro <= 0 ? `Paused · ${fmtClock(game.match.timeLeft)}` : 'Paused';
    $('p-surrender').classList.toggle('hidden', !match);
    $('p-home').classList.toggle('hidden', match);
    this.refresh();
    this.el.classList.remove('hidden');
  },
  hide() {
    this.disarm();
    this.el.classList.add('hidden');
  },
  get open() {
    return !this.el.classList.contains('hidden');
  },
  refresh() {
    $('p-sound').textContent = profile.settings.sound ? '🔊 Sound: on' : '🔇 Sound: off';
  },
  disarm() {
    clearTimeout(this.armTimer);
    this.armedAt = 0;
    const b = $('p-surrender');
    b.classList.remove('armed');
    b.textContent = '🏳 Surrender';
  },
  /** Giving up takes two deliberate taps: a double-tap never surrenders. */
  surrenderTap() {
    const now = performance.now();
    const b = $('p-surrender');
    if (!this.armedAt) {
      audio.play('ui');
      this.armedAt = now;
      b.classList.add('armed');
      b.textContent = 'Tap again to give up';
      clearTimeout(this.armTimer);
      this.armTimer = setTimeout(() => this.disarm(), 3500);
      return;
    }
    if (now - this.armedAt < GUARD_MS) return;
    this.disarm();
    resumeGame();
    if (inMatch() && game.match.phase !== 'over') {
      beginFight();
      game.match.surrender('blue');
    }
  },
};

function pauseGame() {
  if (!playing() || game.paused) return;
  if (game.mode === 'match' && (game.match.phase === 'over' || mresult.open)) return;
  audio.play('ui');
  game.paused = true;
  document.body.classList.add('paused');
  input.reset();
  aim.cancel();
  pause.show();
}

function resumeGame() {
  if (!game.paused) return;
  audio.play('ui');
  blockInput();
  game.paused = false;
  document.body.classList.remove('paused');
  audio.resume();
  pause.hide();
}

// --- VS intro ------------------------------------------------------------------------------

const vs = {
  el: $('vs'),
  timer: 0,
  build() {
    this.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (performance.now() - game.introAt > 600 && game.intro > 0 && !game.paused) beginFight();
    });
  },
  show(m, opp, kingLevel) {
    $('vs-name-blue').textContent = m.sides.blue.name;
    $('vs-lvl-blue').textContent = kingLevel;
    $('vs-name-red').textContent = opp.name;
    $('vs-lvl-red').textContent = m.sides.red.kingLevel;
    $('vs-arena').textContent = opp.tutorial ? '🎓 Training match' : `🏟️ ${ARENAS[clamp(opp.arena | 0, 0, ARENAS.length - 1)].name}`;
    clearTimeout(this.timer);
    this.el.classList.remove('hidden', 'out');
    game.intro = INTRO_T;
    game.introAt = performance.now();
    sfx('whoosh', { power: 1 });
    setTimeout(() => game.mode === 'match' && game.intro > 0 && sfx('clank', { power: 1.2 }), 380);
  },
  hide(animated) {
    clearTimeout(this.timer);
    if (!animated) {
      this.el.classList.add('hidden');
      return;
    }
    this.el.classList.add('out');
    this.timer = setTimeout(() => this.el.classList.add('hidden'), 360);
  },
};

// --- battle HUD (top bar) -----------------------------------------------------------

const CROWN_SVG = '<svg viewBox="0 0 26 22" aria-hidden="true"><path d="M3.5 16.5 L1.8 5.5 L8 10 L13 2 L18 10 L24.2 5.5 L22.5 16.5 Z"/><rect x="3.5" y="17.5" width="19" height="3" rx="1.2"/></svg>';

function fmtClock(t) {
  const s = Math.max(0, Math.ceil(t - 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const hud = {
  top: document.querySelector('.mh-top'),
  tray: $('mh-tray'),
  last: {},
  build() {
    for (const id of ['mh-crowns-blue', 'mh-crowns-red', 'mr-crowns-blue', 'mr-crowns-red']) $(id).innerHTML = CROWN_SVG.repeat(3);
    $('mh-pause').addEventListener('click', () => {
      if (performance.now() < game.inputBlockUntil) return;
      pauseGame();
    });
    this.tray.addEventListener('contextmenu', (e) => e.preventDefault());
  },
  start(m, opp, kingLevel) {
    this.last = {};
    $('mh-name-blue').textContent = m.sides.blue.name;
    $('mh-lvl-blue').textContent = kingLevel;
    $('mh-name-red').textContent = opp.name;
    $('mh-lvl-red').textContent = m.sides.red.kingLevel;
    this.tick();
  },
  set(k, v, fn) {
    if (this.last[k] !== v) {
      this.last[k] = v;
      fn(v);
    }
  },
  /** Per frame, but the DOM is only touched when a shown value changes. */
  tick() {
    const m = game.match;
    if (game.mode !== 'match' || !m) return;
    const over = m.phase === 'over';
    const tl = m.timeLeft;
    this.set('time', fmtClock(tl), (v) => ($('mh-time').textContent = v));
    this.set('label', m.overtimeT != null ? 'OVERTIME' : 'TIME', (v) => {
      $('mh-clock-label').textContent = v;
      $('mh-clock').classList.toggle('ot', v === 'OVERTIME');
    });
    const hurry = !over && game.intro <= 0 && tl <= 10;
    this.set('hurry', hurry, (v) => $('mh-clock').classList.toggle('hurry', v));
    // The last ten seconds tick (with a lower tock in the last three)
    const sec = Math.ceil(tl - 1e-6);
    if (hurry && sec !== this.last.tickSec && sec >= 1) sfx('tick', { power: sec <= 3 ? 1 : 0, vol: 0.9 });
    this.last.tickSec = sec;
    // Overtime running out still tied: say how it will be decided (the tower health bars)
    if (m.overtimeT != null && !over && tl <= 15 && !this.last.otTip && m.crowns.blue === m.crowns.red) {
      this.last.otTip = true;
      subTip('Still tied at 0:00? The weakest tower loses');
    }
    this.set('cb', m.crowns.blue, (v) => setCrowns($('mh-crowns-blue'), v));
    this.set('cr', m.crowns.red, (v) => setCrowns($('mh-crowns-red'), v));
    this.set('x2', m.doubleMana && !over, (v) => document.body.classList.toggle('x2', v));
    this.set('over', over, (v) => document.body.classList.toggle('match-over', v));
  },
};

function setCrowns(el, n) {
  const svgs = el.querySelectorAll('svg');
  svgs.forEach((s, i) => s.classList.toggle('on', i < n));
}

let bannerTimer = 0;
function banner(text, cls = '') {
  const el = $('mh-banner');
  el.className = 'mh-banner';
  void el.offsetWidth; // restart the animation
  el.textContent = text;
  el.className = 'mh-banner show ' + cls;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => (el.className = 'mh-banner'), 2000);
}

// --- the hand of cards --------------------------------------------------------------------

/** Paint a card face (cached by render/cards.js) onto a canvas. */
function paintCard(cv, id, opts = {}) {
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  if (!id || !cv.width) return;
  const face = cardFace(id, cv.width, cv.height, { mini: true, palette: armyPalette(profile), hats: profile.equipped.hats, ...opts });
  if (face) g.drawImage(face, 0, 0);
}

const hand = {
  slots: [],
  next: $('mh-next'),
  sel: -1,
  last: {},
  build() {
    const box = $('mh-hand');
    for (let i = 0; i < 4; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hcard';
      btn.setAttribute('aria-label', 'Card ' + (i + 1));
      // (the face animates inside a button that stays put, so a tap during a deal still lands)
      const face = document.createElement('span');
      face.className = 'face';
      const cv = document.createElement('canvas');
      const charge = document.createElement('i');
      charge.className = 'charge';
      face.append(cv, charge);
      btn.append(face);
      box.appendChild(btn);
      const slot = { i, btn, cv, charge, id: null, dim: null, chargeV: -1 };
      this.slots.push(slot);
      btn.addEventListener('pointerdown', (e) => aim.cardDown(e, i));
      btn.addEventListener('pointermove', (e) => aim.cardMove(e));
      btn.addEventListener('pointerup', (e) => aim.cardUp(e, false));
      btn.addEventListener('pointercancel', (e) => aim.cardUp(e, true));
      btn.addEventListener('lostpointercapture', (e) => aim.cardUp(e, true));
      btn.addEventListener('click', (e) => e.preventDefault());
    }
  },
  /** Canvas sizes follow the CSS card size (device px); faces are redrawn. */
  size() {
    if (!this.slots.length || game.mode !== 'match') return;
    const fit = (cv) => {
      const r = cv.getBoundingClientRect();
      const w = Math.max(16, Math.round(r.width * dpr));
      const h = Math.max(16, Math.round(r.height * dpr));
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
    };
    for (const s of this.slots) fit(s.cv);
    fit(this.next);
    fit($('drag-card').querySelector('canvas'));
    this.redraw();
  },
  redraw() {
    for (const s of this.slots) s.id = null;
    this.last = {};
  },
  select(i) {
    this.sel = i;
    for (const s of this.slots) s.btn.classList.toggle('sel', s.i === i);
  },
  /** Per frame: only cards whose state changed are repainted. */
  tick() {
    const m = game.match;
    if (game.mode !== 'match' || !m) return;
    const side = m.sides.blue;
    const mana = side.mana;
    for (const s of this.slots) {
      const id = side.hand[s.i] || null;
      const card = cardById(id);
      const dim = !!card && mana < card.mana;
      if (id !== s.id) {
        const fresh = s.id != null;
        s.id = id;
        s.dim = dim;
        paintCard(s.cv, id, { dim });
        if (fresh) {
          s.btn.classList.remove('deal', 'ready', 'nope');
          void s.btn.offsetWidth;
          s.btn.classList.add('deal');
        }
        s.btn.setAttribute('aria-label', card ? `${card.name}, ${card.mana} mana` : 'Empty');
      } else if (dim !== s.dim) {
        s.dim = dim;
        paintCard(s.cv, id, { dim });
        if (!dim && game.intro <= 0) {
          s.btn.classList.remove('ready', 'deal');
          void s.btn.offsetWidth;
          s.btn.classList.add('ready');
        }
      }
      // The shade drains as the mana for this card fills
      const v = card && dim ? Math.round((1 - mana / card.mana) * 100) / 100 : 0;
      if (v !== s.chargeV) {
        s.chargeV = v;
        s.charge.style.transform = `scaleY(${v})`;
      }
    }
    if (side.next !== this.last.next) {
      const fresh = this.last.next !== undefined;
      this.last.next = side.next;
      paintCard(this.next, side.next);
      if (fresh) {
        this.next.classList.remove('deal');
        void this.next.offsetWidth;
        this.next.classList.add('deal');
      }
    }
    const fill = Math.round((mana / 10) * 500) / 500;
    if (fill !== this.last.fill) {
      this.last.fill = fill;
      $('mh-mana-fill').style.transform = `scaleX(${fill})`;
    }
    const whole = Math.floor(mana + 1e-6);
    if (whole !== this.last.whole) {
      const up = this.last.whole != null && whole > this.last.whole;
      this.last.whole = whole;
      $('mh-mana-num').textContent = whole;
      if (up) {
        const d = document.querySelector('.mana-drop');
        d.classList.remove('bump');
        void d.offsetWidth;
        d.classList.add('bump');
      }
    }
  },
};

// --- aiming: drag a card onto the field, or tap a card then the field -------------------

const tip = {
  el: $('aim-tip'),
  timer: 0,
  text: '',
  w: 0,
  show(text, sx, sy, bad = true, secs = 0) {
    if (text !== this.text) {
      this.text = text;
      this.el.textContent = text;
      this.w = this.el.offsetWidth; // (measured once per text: no layout reads while a finger drags)
    }
    this.el.classList.toggle('bad', bad);
    this.el.classList.add('show');
    const w = this.w;
    const x = clamp(sx - w / 2, 8, W - w - 8);
    const y = clamp(sy, 8, H - 40);
    this.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    clearTimeout(this.timer);
    if (secs) this.timer = setTimeout(() => this.hide(), secs * 1000);
  },
  hide() {
    clearTimeout(this.timer);
    this.el.classList.remove('show');
  },
};

const aim = {
  on: false, // a card is being dragged or aimed with a finger on the field
  src: null, // 'hand' | 'field'
  slot: -1,
  pid: null,
  sx: 0,
  sy: 0,
  x0: 0,
  y0: 0,
  moved: false,
  over: false, // finger over the field (not over the hand)
  lift: false, // a card from the hand still in the band just above it (no "not here" yet)
  lifted: false, // ...it has left that band once
  wx: NaN,
  dragCard: $('drag-card'),
  trayRect: null,

  /**
   * Can hand card i be played at world x? { id, card, x (snapped), ok, why, inZone, missing }.
   * Unit cards drop in the unit zone, buildings go up in your own half (never the pocket),
   * deploy-anywhere cards float down anywhere in ANYWHERE, spells go anywhere.
   */
  check(i, wx) {
    const m = game.match;
    const side = m.sides.blue;
    const id = side.hand[i];
    const card = cardById(id);
    const missing = card ? Math.max(0, card.mana - side.mana) : 0;
    if (!card || !Number.isFinite(wx)) return { id, card, x: wx, ok: false, why: card ? 'zone' : 'card', inZone: false, missing };
    let x = wx;
    let inZone = true;
    if ((card.kind === 'unit' && !card.anywhere) || card.kind === 'building') {
      const [z0, z1] = card.kind === 'building' ? m.buildZone('blue') : m.zone('blue');
      if (x < z0 && x > z0 - ZONE_SNAP) x = z0 + 1;
      if (x > z1 && x < z1 + ZONE_SNAP) x = z1 - 1;
      inZone = x >= z0 && x <= z1;
    } else if (card.anywhere) x = clamp(x, ANYWHERE[0], ANYWHERE[1]);
    else x = clamp(x, 0, WORLD.width);
    const why = m.canPlay('blue', i, x);
    return { id, card, x, ok: why === '', why, inZone, missing };
  },

  /** Why a check failed, in words ('' if it didn't). */
  reason(c) {
    if (!c.card) return '';
    const building = c.card.kind === 'building';
    if (!c.inZone) return building ? 'Build on your side' : 'Play units on your side';
    if (c.why === 'mana') return `Not enough mana: need ${Math.ceil(c.missing - 1e-6)} more 💧`;
    if (building && c.why === 'zone') return 'No room to build here';
    return '';
  },

  cardDown(e, i) {
    e.preventDefault();
    if (!canAct() || this.on || performance.now() < game.inputBlockUntil) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    audio.unlock();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // synthetic event
    }
    this.on = true;
    this.src = 'hand';
    this.slot = i;
    this.pid = e.pointerId;
    this.sx = this.x0 = e.clientX;
    this.sy = this.y0 = e.clientY;
    this.moved = false;
    this.over = false;
    this.lift = false;
    this.lifted = false;
    this.trayRect = hud.tray.getBoundingClientRect();
    this.cardW = this.dragCard.offsetWidth;
    this.cardH = this.dragCard.offsetHeight;
  },
  cardMove(e) {
    if (!this.on || this.src !== 'hand' || e.pointerId !== this.pid) return;
    this.sx = e.clientX;
    this.sy = e.clientY;
    if (!this.moved && Math.hypot(this.sx - this.x0, this.sy - this.y0) > DRAG_SLOP) {
      this.moved = true;
      if (hand.sel !== this.slot) audio.play('cardPick');
      hand.select(this.slot);
      const s = hand.slots[this.slot];
      s.btn.classList.add('drag');
      const cv = this.dragCard.querySelector('canvas');
      paintCard(cv, s.id, { dim: s.dim });
      coach.onDrag();
    }
    if (this.moved) this.update();
  },
  cardUp(e, cancelled) {
    if (!this.on || this.src !== 'hand' || e.pointerId !== this.pid) return;
    if (cancelled) {
      if (e.type === 'lostpointercapture' && !this.moved) return; // (fires after a normal pointerup too)
      this.cancel();
      return;
    }
    this.sx = e.clientX;
    this.sy = e.clientY;
    if (!this.moved) {
      // A tap: select (or deselect) the card; then a tap on the field plays it
      const i = this.slot;
      this.end();
      if (hand.sel === i) {
        hand.select(-1);
        audio.play('ui');
      } else {
        hand.select(i);
        audio.play('cardPick');
        const c = this.check(i, NaN);
        const r = hand.slots[i].btn.getBoundingClientRect();
        if (c.card && game.match.sides.blue.mana < c.card.mana) tip.show(`Need ${Math.ceil(c.missing - 1e-6)} more 💧`, r.left + r.width / 2, r.top - 34, true, 1.2);
        // (a unit card lights up its zone; the others say where they go)
        else if (c.card && selectTip(c.card)) tip.show(selectTip(c.card), r.left + r.width / 2, r.top - 34, false, 1.4);
      }
      return;
    }
    this.update();
    this.release();
  },

  /** The canvas (Input) asks: start aiming with the selected card here? */
  fieldStart(sx, sy) {
    if (!canAct() || hand.sel < 0 || this.on) return false;
    this.on = true;
    this.src = 'field';
    this.slot = hand.sel;
    this.pid = null;
    this.sx = sx;
    this.sy = sy;
    this.moved = true;
    this.trayRect = hud.tray.getBoundingClientRect();
    this.update();
    return true;
  },
  fieldMove(sx, sy) {
    if (!this.on || this.src !== 'field') return;
    this.sx = sx;
    this.sy = sy;
    this.update();
  },
  fieldEnd(sx, sy, cancelled) {
    if (!this.on || this.src !== 'field') return;
    if (cancelled) {
      this.cancel();
      return;
    }
    this.sx = sx;
    this.sy = sy;
    this.update();
    this.release();
  },

  /** Follow the finger: the card over the hand, the ghost (and a reason if it can't go there) over the field. */
  update() {
    const r = this.trayRect;
    this.over = !(r && this.sx >= r.left && this.sx <= r.right && this.sy >= r.top);
    // The right-hand cards leave the hand over the enemy's half: no red warning while the
    // finger is still just above the hand (only once it has been higher, or lets go there)
    if (this.src === 'hand' && r && this.sy < r.top - LIFT_BAND) this.lifted = true;
    this.lift = this.src === 'hand' && this.over && !this.lifted && !!r && this.sy >= r.top - LIFT_BAND;
    this.wx = camera.toWorld(this.sx, this.sy)[0];
    const showCard = this.src === 'hand' && !this.over;
    this.dragCard.classList.toggle('show', showCard);
    if (showCard) this.dragCard.style.transform = `translate(${Math.round(this.sx - this.cardW / 2)}px, ${Math.round(this.sy - this.cardH * 0.8)}px)`;
    if (this.over && !this.lift) {
      const c = this.check(this.slot, this.wx);
      const why = this.reason(c);
      if (why) tip.show(why, this.sx, this.sy - 74, true);
      else tip.hide();
    } else tip.hide();
  },

  /** Finger lifted: play the card if it can go there, otherwise send it back with the reason. */
  release() {
    const i = this.slot;
    const over = this.over;
    const sx = this.sx;
    const sy = this.sy;
    const wx = this.wx;
    this.end();
    if (!over || !canAct()) {
      hand.select(-1);
      return;
    }
    const c = this.check(i, wx);
    if (c.ok && game.match.play('blue', i, c.x)) {
      hand.select(-1);
      buzz(18);
      coach.onPlay(c.card);
      return;
    }
    // Denied: the card shakes back into the hand
    const why = this.reason(c) || 'Not here';
    audio.play('cardDenied');
    tip.show(why, sx, sy - 74, true, 1.4);
    const s = hand.slots[i];
    if (s) {
      s.btn.classList.remove('nope', 'deal', 'ready');
      void s.btn.offsetWidth;
      s.btn.classList.add('nope');
    }
    hand.select(-1);
  },

  /** Stop aiming without playing anything. */
  cancel() {
    if (!this.on) return;
    this.end();
    hand.select(-1);
  },
  end() {
    const s = hand.slots[this.slot];
    if (s) s.btn.classList.remove('drag');
    this.on = false;
    this.lift = false;
    this.src = null;
    this.pid = null;
    this.dragCard.classList.remove('show');
    tip.hide();
  },
};

/** What a tapped card says about where it goes ('' for plain unit cards: their zone lights up). */
function selectTip(card) {
  if (card.kind === 'spell') return card.spell === 'bubbleWrap' ? 'Tap your own beans to wrap them' : 'Tap the field to cast it';
  if (card.kind === 'building') return 'Tap your side to build it';
  if (card.anywhere) return 'Tap anywhere: they float down';
  return '';
}

/** [x0, x1] where a deploy-anywhere card's beans can come down (clear of both Castles). */
function anywhereZone(m) {
  let [x0, x1] = ANYWHERE;
  for (const t of m.battle.towers) {
    if (t.kind !== 'castle') continue;
    const edge = t.x + t.f * (t.w / 2 + ANYWHERE_CLEAR);
    if (t.f > 0) x0 = Math.max(x0, edge);
    else x1 = Math.min(x1, edge);
  }
  return [x0, x1];
}

/**
 * World-space aiming UI: where the card may go lights up (the unit zone, your half for a
 * building, the whole field for a deploy-anywhere card), and the ghost beans, the building's
 * footprint, the drop markers or the spell circle follow the finger.
 */
function drawAim() {
  if (!canAct()) return;
  const m = game.match;
  const i = aim.on ? aim.slot : hand.sel;
  if (i < 0) return;
  const id = m.sides.blue.hand[i];
  const card = cardById(id);
  if (!card) return;
  const t = game.realTime;
  const [z0, z1] = m.zone('blue');
  // A mouse hovering the field with a card picked previews it too (touch has no hover)
  const hover = !aim.on && game.hover ? camera.toWorld(game.hover.sx, game.hover.sy)[0] : NaN;
  const aiming = (aim.on && aim.over) || Number.isFinite(hover);
  const zoom = camera.zoom;
  const color = pal('blue').body;
  if (card.anywhere) {
    const [a0, a1] = anywhereZone(m);
    drawZone(ctx, a0, a1, true, { team: 'blue', color, t, zoom, strength: aiming ? 0.7 : 0.55 });
  } else if (card.kind === 'unit' || card.kind === 'building') {
    // (a building goes up in your own half only, even once the enemy Guard Tower is down)
    const [b0, b1] = card.kind === 'building' ? m.buildZone('blue') : [z0, z1];
    drawZone(ctx, b0, b1, true, { team: 'blue', color, t, zoom, strength: aiming ? 1 : 0.85 });
    if (aiming) {
      if (b0 > 0) drawZone(ctx, 0, b0, false, { t, zoom, strength: 0.5 });
      drawZone(ctx, b1, WORLD.width, false, { t, zoom, strength: 0.75 });
    }
  }
  if (!aiming) return;
  const c = aim.check(i, aim.on ? aim.wx : hover);
  if (aim.on && aim.lift && !c.ok) return; // (just lifted out of the hand: no red ghost yet)
  // Where it really lands: a building's fitted spot ([] = no room), deploy-anywhere beans nudged
  // off towers; plain unit beans only once inside the zone (outside, the red ghost stays at the finger)
  const xs = card.kind === 'building' || card.anywhere || (card.kind === 'unit' && c.inZone) ? m.formation('blue', id, c.x) : undefined;
  ghosts.draw(ctx, id, c.x, 'blue', { ok: c.ok, t, zone: c.inZone ? [z0, z1] : null, hats: profile.equipped.hats, level: m.sides.blue.levels[id], zoom, xs });
}

// --- match end and the result screen --------------------------------------------------

function onMatchEnd(e) {
  const m = game.match;
  if (game.mode === 'attract') {
    game.attractRestartT = 4.5;
    return;
  }
  if (game.mode !== 'match' || game.summary) return;
  const res = m.result('blue');
  const reason = m.endReason;
  aim.cancel();
  hand.select(-1);
  coach.stop();
  pause.hide();
  game.paused = false;
  document.body.classList.remove('paused');
  if (reason === 'castle' || reason === 'overtime') {
    game.finalSlowT = game.finalSlowDur = FINAL_SLOW;
    shake(0.9);
  } else if (reason === 'time' || reason === 'tiebreak') banner("TIME'S UP!", 'b-ot');
  // Confetti over the winners
  if (e.winner === 'blue' || e.winner === 'red') {
    const P = pal(e.winner);
    const cols = [P.body, P.light, '#ffd84a', '#ffffff'];
    for (const u of game.battle.units) if (u.alive && u.team === e.winner) fx.spawn('confetti', { x: u.head.x, y: u.head.y - 30, colors: cols });
  }
  const wasTutorial = profile.tutorial === 0;
  // Another window already counted this match as a loss for leaving (it started while this one
  // was in the background): don't count it twice
  const elsewhere = !!game.pendingId && profile.settled === game.pendingId;
  // Record at once (a reload during the result screen must not lose the trophies)
  const rec = elsewhere
    ? null
    : recordMatch(profile, {
        outcome: res.outcome,
        crowns: res.crowns,
        enemyCrowns: res.enemyCrowns,
        reason,
        towers: game.track.towers,
        cardsPlayed: m.sides.blue.played,
        spells: m.sides.blue.spellsPlayed,
      });
  game.pendingId = '';
  if (wasTutorial) profile.tutorial = 1;
  persist();
  game.summary = {
    ...(rec || { outcome: res.outcome, crowns: res.crowns, enemyCrowns: res.enemyCrowns, delta: 0, gold: 0, newArena: -1, newCards: [] }),
    reason,
    elsewhere,
    // (the tiebreak's numbers: the health of each side's weakest standing tower)
    weak: { blue: m.weakest('blue'), red: m.weakest('red') },
    duration: res.duration,
    opponent: game.opp ? game.opp.name : '',
    tutorial: wasTutorial,
  };
  if (res.outcome === 'win') buzz([30, 60, 40]);
  game.resultT = reason === 'surrender' ? 0.8 : RESULT_DELAY;
}

const mresult = {
  el: $('mresult'),
  timers: [],
  shownAt: 0,
  open: false,
  build() {
    $('mr-ok').addEventListener('click', () => this.ok());
  },
  hide() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.length = 0;
    this.el.classList.add('hidden');
    this.open = false;
  },
  later(ms, fn) {
    this.timers.push(setTimeout(fn, ms));
  },
  show(sum) {
    this.hide();
    this.open = true;
    this.shownAt = performance.now();
    const m = game.match;
    const out = sum.outcome;
    const title = $('mr-title');
    title.textContent = out === 'win' ? 'VICTORY!' : out === 'loss' ? 'DEFEAT' : 'DRAW';
    title.className = 'ribbon ' + (out === 'win' ? 'win' : out === 'loss' ? 'red' : 'draw');
    $('mr-name-blue').textContent = m.sides.blue.name;
    $('mr-name-red').textContent = sum.opponent || m.sides.red.name;
    setCrowns($('mr-crowns-blue'), 0);
    setCrowns($('mr-crowns-red'), 0);
    $('mr-reason').textContent = reasonText(sum);
    const tro = $('mr-trophies');
    const gold = $('mr-gold');
    tro.classList.remove('show', 'down');
    gold.classList.remove('show');
    tro.querySelector('b').textContent = '0';
    gold.querySelector('b').textContent = '+0';
    const note = $('mr-note');
    note.classList.add('hidden');
    const ok = $('mr-ok');
    ok.disabled = true;
    this.el.classList.remove('hidden');
    audio.play(out === 'win' ? 'victory' : out === 'loss' ? 'defeat' : 'draw', {});

    // Crowns pop in one by one, then trophies and gold count up
    let t = 450;
    for (let k = 1; k <= sum.crowns; k++, t += 300) this.later(t, () => (setCrowns($('mr-crowns-blue'), k), audio.play('crown', { pitch: 0.3 + k * 0.2 }), buzz(10)));
    for (let k = 1; k <= sum.enemyCrowns; k++, t += 200) this.later(t, () => (setCrowns($('mr-crowns-red'), k), audio.play('crown', { foe: true })));
    t += 150;
    const delta = sum.delta | 0;
    this.later(t, () => {
      tro.classList.add('show');
      tro.classList.toggle('down', delta < 0);
      audio.play(delta < 0 ? 'trophyDown' : 'trophyUp');
    });
    this.countUp(tro.querySelector('b'), delta, t + 120, 520, (v) => (v > 0 ? '+' + v : v < 0 ? '−' + -v : '±0'), null);
    t += 650;
    const g = sum.gold | 0;
    this.later(t, () => gold.classList.add('show'));
    this.countUp(gold.querySelector('b'), g, t + 100, 600, (v) => '+' + v, (k) => audio.play('coins', { pitch: k }));
    t += 750;
    const lines = notesFor(sum);
    if (lines.length)
      this.later(t, () => {
        note.innerHTML = lines.join('<br>');
        note.classList.remove('hidden');
        if (sum.newArena >= 0) audio.play('cheer', { pitch: 0.7 });
      });
    this.later(Math.min(t, 900), () => (ok.disabled = false));
  },
  /** Count a number up from 0 in steps (with a sound every other step). */
  countUp(el, to, at, ms, fmt, onStep) {
    const steps = Math.max(1, Math.min(14, Math.abs(to)));
    for (let k = 1; k <= steps; k++)
      this.later(at + (ms * k) / steps, () => {
        el.textContent = fmt(Math.round((to * k) / steps));
        if (onStep && (k % 2 === 1 || k === steps)) onStep(k / steps);
      });
  },
  /** OK: back to the menu. (A tap in the first 600 ms is the tail of the last one; a back press isn't.) */
  ok(fromBack = false) {
    if (!this.open || (!fromBack && performance.now() - this.shownAt < 600)) return;
    audio.play('ui');
    const sum = game.summary;
    const updating = !!pendingUpdate; // (the page reloads into the new version: no celebrations)
    this.hide();
    goHub('battle');
    if (sum && !updating) hub.afterMatch(sum);
  },
};

function reasonText(sum) {
  const out = sum.outcome;
  switch (sum.reason) {
    case 'castle':
      return out === 'win' ? 'Their Castle fell!' : out === 'loss' ? 'Your Castle fell' : 'Both Castles fell at once!';
    case 'time':
      return out === 'win' ? 'Time! You took more crowns' : 'Time! They took more crowns';
    case 'overtime':
      return out === 'win' ? 'Overtime: you took the first tower!' : 'Overtime: they took the first tower';
    case 'tiebreak': {
      if (out === 'draw' || !sum.weak) return out === 'win' ? 'Tiebreak: their tower had less health' : out === 'loss' ? 'Tiebreak: your tower had less health' : 'Tiebreak: the towers were exactly even';
      // Their weakest tower vs yours, in % (one decimal when they round alike)
      const b = sum.weak.blue * 100;
      const r = sum.weak.red * 100;
      const d = Math.round(b) === Math.round(r) ? 1 : 0;
      const f = (v) => `${v.toFixed(d)}%`;
      return out === 'win' ? `Tiebreak: their weakest tower ${f(r)} vs yours ${f(b)}` : `Tiebreak: your weakest tower ${f(b)} vs theirs ${f(r)}`;
    }
    case 'surrender':
      return out === 'win' ? 'They gave up!' : 'You gave up';
    default:
      return '';
  }
}

function notesFor(sum) {
  const lines = [];
  if (sum.newArena >= 0 && ARENAS[sum.newArena]) {
    const names = (sum.newCards || []).map((id) => (cardById(id) ? cardById(id).name : id)).join(', ');
    lines.push(`🎉 New arena: <b>${ARENAS[sum.newArena].name}</b>!${names ? ` New cards to find: ${names}` : ''}`);
  } else if (sum.floored && sum.outcome === 'loss') lines.push(`🛡️ ${ARENAS[arenaIndex(sum.after)].name} keeps your trophies safe`);
  if (sum.noGold && sum.reason === 'surrender') lines.push('🏳️ Giving up pays no gold');
  if (sum.elsewhere) lines.push('This match was already counted in your other window');
  if (sum.tutorial) lines.push(readyChests(profile, Date.now()) > 0 ? '🎓 Training done! Your chests are waiting in the menu.' : '🎓 Training done! Now every win brings trophies and gold.');
  return lines;
}

// --- tutorial coach ----------------------------------------------------------------------

const coach = {
  el: $('coach'),
  say: document.querySelector('#coach .say'),
  text: document.querySelector('#coach .say-text'),
  hand: document.querySelector('#coach .coach-hand'),
  step: null, // drag | mana | tower | cheer | spell
  t: 0,
  skipped: false,
  on: false, // the tutorial match is running with tips
  spellDone: false, // the spell tip shows once
  spellAt: null, // world x of the crowd the spell tip points at
  last: {},
  build() {
    document.querySelector('#coach .say-skip').addEventListener('click', () => {
      audio.play('ui');
      this.skipped = true;
      this.stop();
    });
  },
  /** First tip once the FIGHT! banner has had its moment. */
  start() {
    this.skipped = false;
    this.on = true;
    this.spellDone = false;
    this.pending = 1.3;
  },
  pending: 0,
  go(step) {
    if (this.skipped || game.mode !== 'match') return;
    this.step = step;
    this.t = 0;
    this.last = {};
    const words = {
      drag: 'Drag a card onto your side of the field!',
      mana: 'Mana 💧 refills over time — wait for it',
      tower: 'Knock down their Guard Tower!',
      cheer: '👑 A crown! Now go for their Castle!',
      spell: 'Spells go anywhere: drop one on that crowd!',
    };
    this.text.textContent = words[step];
    this.say.classList.toggle('cheer', step === 'cheer');
    this.say.style.animation = 'none';
    void this.say.offsetWidth;
    this.say.style.animation = '';
    this.el.className = 'coach ' + (step === 'drag' || step === 'spell' ? 'c-drag' : step === 'cheer' ? '' : 'c-point') + (aim.on || hand.sel >= 0 ? ' busy' : '');
  },
  stop() {
    this.step = null;
    this.pending = 0;
    this.el.className = 'coach hidden';
  },
  rects: new Map(),
  /** An element's rect, re-measured a few times a second at most (no layout reads every frame). */
  rect(el, key) {
    const c = this.rects.get(key);
    const now = performance.now();
    if (c && now - c.at < 300) return c.r;
    const r = el.getBoundingClientRect();
    this.rects.set(key, { r, at: now });
    return r;
  },
  onDrag() {},
  onPlay(card) {
    if (this.step === 'drag') this.go('mana');
    else if (this.step === 'spell' && card && card.kind === 'spell') this.stop();
    if (card && card.kind === 'spell') this.spellDone = true; // (found out by themselves)
  },
  /** A spell in hand and enemy beans bunched up: hand index and the crowd's world x, or null. */
  spellChance() {
    const m = game.match;
    const side = m.sides.blue;
    const i = side.hand.findIndex((id) => {
      const c = cardById(id);
      return c && c.kind === 'spell' && c.mana <= side.mana;
    });
    if (i < 0) return null;
    const reds = m.battle.units.filter((u) => u.alive && u.team === 'red' && !u.dropping);
    let best = null;
    for (const u of reds) {
      const near = reds.filter((o) => Math.abs(o.hip.x - u.hip.x) <= 90);
      if (near.length >= 2 && (!best || near.length > best.n)) best = { n: near.length, x: near.reduce((s, o) => s + o.hip.x, 0) / near.length };
    }
    return best ? { i, x: best.x } : null;
  },
  onCrown() {
    if (this.step && this.step !== 'cheer') this.go('cheer');
  },
  tick(dt) {
    if (this.pending > 0 && canAct() && (this.pending -= dt) <= 0) this.go(game.match.sides.blue.played ? 'mana' : 'drag');
    // Once the first tips are done: show what a spell is for, the first time there's a crowd to hit
    if (!this.step && this.on && !this.skipped && !this.spellDone && this.pending <= 0 && canAct() && game.match.sides.blue.played >= 2) {
      const sc = this.spellChance();
      if (sc) {
        this.spellDone = true;
        this.spellAt = sc;
        this.go('spell');
      }
    }
    if (!this.step) return;
    if (!canAct()) {
      if (game.mode !== 'match' || (game.match && game.match.phase === 'over')) this.stop();
      return;
    }
    this.t += dt;
    if (this.step === 'mana' && this.t > 4.5) this.go('tower');
    else if (this.step === 'tower' && this.t > 8) this.stop();
    else if (this.step === 'cheer' && this.t > 3.5) this.stop();
    else if (this.step === 'spell' && this.t > 6) this.stop();
    if (!this.step) return;
    let p0 = null;
    let p1 = null;
    // The pointer hand steps aside while a finger is busy aiming
    const busy = aim.on || hand.sel >= 0;
    if (busy !== this.last.busy) {
      this.last.busy = busy;
      this.el.classList.toggle('busy', busy);
    }
    if (this.step === 'drag') {
      // From the cheapest card to the middle of your side
      const side = game.match.sides.blue;
      let best = 0;
      side.hand.forEach((id, i) => {
        const c = cardById(id);
        const b = cardById(side.hand[best]);
        if (c && c.kind === 'unit' && (!b || b.kind !== 'unit' || c.mana < b.mana)) best = i;
      });
      const r = this.rect(hand.slots[best].btn, 'card' + best);
      p0 = [r.left + r.width * 0.45, r.top + r.height * 0.4];
      p1 = camera.toScreen(560, -70);
    } else if (this.step === 'mana') {
      const r = this.rect(document.querySelector('.mana-bar'), 'mana');
      p1 = [r.left + r.width * 0.5 - 12, r.top - 40];
    } else if (this.step === 'tower') {
      p1 = camera.toScreen(WORLD.towerX.red - 12, -130);
    } else if (this.step === 'spell' && this.spellAt) {
      // From the spell card (it may have moved in the hand) to the crowd
      const side = game.match.sides.blue;
      let i = side.hand.findIndex((id) => cardById(id) && cardById(id).kind === 'spell');
      if (i < 0) i = this.spellAt.i;
      const r = this.rect(hand.slots[i].btn, 'card' + i);
      p0 = [r.left + r.width * 0.45, r.top + r.height * 0.4];
      p1 = camera.toScreen(this.spellAt.x, -60);
    }
    if (!p1) return;
    const set = (k, v) => {
      v = Math.round(v) + 'px';
      if (this.last[k] !== v) {
        this.last[k] = v;
        this.hand.style.setProperty(k, v);
      }
    };
    if (p0) {
      set('--x0', p0[0] - 10);
      set('--y0', p0[1]);
    }
    set('--x1', p1[0] - 10);
    set('--y1', p1[1]);
  },
};

// --- the sandbox (free placement) ------------------------------------------------------------

function newSandboxBattle() {
  fx.clear();
  game.battle = new Battle(uiSeed());
  game.resultT = -1;
  game.finalSlowT = 0;
  game.hitstop = 0;
  game.erase = false;
  game.finalVictim = null;
  game.lastDeath = null;
  game.track = { explodes: [], chained: false, flew: new WeakSet(), pinned: new WeakSet(), homeRun: new WeakSet(), boinged: false, towers: 0, landed: new WeakSet() };
  camera.fast = false;
  unitsGfx.trails.clear();
  game.battle.hats.blue = { ...profile.equipped.hats };
}

function enterPlacement(snapshot) {
  newSandboxBattle();
  const b = game.battle;
  if (!UNIT_ORDER.includes(game.selected)) game.selected = UNIT_ORDER[0];
  if (snapshot) for (const s of snapshot) if (UNIT_ORDER.includes(s.type)) b.addUnit(s.type, s.team, s.x, s.lane, s.seed);
  // Let everyone settle into their stance before the player looks
  for (let i = 0; i < 30; i++) b.step(DT);
  b.events.length = 0;
  framePlacement(true);
  ui.buildCards();
  ui.showPlacement();
}

function startFight() {
  const b = game.battle;
  if (b.phase !== 'place') return;
  if (!b.count('blue') || !b.count('red')) {
    toast(b.count('blue') ? 'Red needs some beans' : 'Place some beans first!', 'Tap the right side for red, left for blue', 1.6);
    audio.play('ui');
    return;
  }
  b.enforceZones();
  game.snapshot = b.snapshot();
  audio.unlock();
  b.start();
  game.erase = false;
  camera.follow = true;
  camera.groundTarget = 0.78;
  buzz(25);
  ui.showBattle();
}

function finishSandbox(winner) {
  game.finalSlowT = game.finalSlowDur = 1.5;
  game.resultT = 2.1;
  const b = game.battle;
  if (winner === 'blue' || winner === 'red') {
    const P = pal(winner);
    const cols = [P.body, P.light, '#ffd84a', '#ffffff'];
    for (const u of b.units) if (u.alive && u.team === winner) fx.spawn('confetti', { x: u.head.x, y: u.head.y - 30, colors: cols });
  }
  // Keep the survivors and the final victim in frame through the slow-mo
  game.finalVictim = game.lastDeath;
  camera.fast = true;
  profile.stats.battles++;
  persist();
}

function toggleSlow() {
  game.slowmo = !game.slowmo;
  audio.play('ui');
  ui.refresh();
}

/** The sandbox's DOM: unit cards, tools, FIGHT, the battle controls and the result banner. */
const ui = {
  cards: new Map(),
  cardSig: '',
  els: {
    dock: $('dock'),
    battleCtl: $('battle-ctl'),
    result: $('result'),
    fight: $('fight'),
    erase: $('erase'),
    slow: $('slow'),
    sub: $('hud-sub'),
    barB: $('bar-blue'),
    barR: $('bar-red'),
    cntB: $('count-blue'),
    cntR: $('count-red'),
    mute: $('mute-btn'),
  },
  last: {},
  swapAt: -1e9,

  build() {
    const E = this.els;
    E.fight.addEventListener('click', () => {
      if (!this.justSwapped()) startFight(); // ...and a double-tapped Reset lands here
    });
    E.erase.addEventListener('click', () => {
      game.erase = !game.erase;
      audio.play('ui');
      this.refresh();
    });
    $('clear').addEventListener('click', () => {
      const b = game.battle;
      if (b.phase !== 'place') return;
      for (const u of b.units.slice()) {
        fx.spawn('poof', { x: u.chest.x, y: u.chest.y, color: pal(u.team).body });
        b.removeUnit(u);
      }
      audio.play('remove');
      this.refresh();
    });
    E.slow.addEventListener('click', toggleSlow);
    $('cam').addEventListener('click', () => {
      camera.follow = true;
      audio.play('ui');
    });
    $('stop').addEventListener('click', () => {
      if (this.justSwapped()) return; // the second tap of a double-tapped FIGHT lands here
      audio.play('ui');
      blockInput();
      persist();
      enterPlacement(game.snapshot);
    });
    $('retry').addEventListener('click', () => {
      if (this.justSwapped()) return;
      audio.play('ui');
      blockInput();
      enterPlacement(game.snapshot);
      startFight();
    });
    $('edit').addEventListener('click', () => {
      if (this.justSwapped()) return;
      audio.play('ui');
      blockInput();
      enterPlacement(game.snapshot);
    });
    $('home').addEventListener('click', () => {
      if (this.justSwapped()) return;
      audio.play('ui');
      goHub();
    });
    $('reframe').addEventListener('click', () => {
      audio.play('ui');
      framePlacement(false);
    });
    $('menu-btn').addEventListener('click', pauseGame);
    E.mute.addEventListener('click', toggleMute);
  },

  /** Unit cards for all eight units (rebuilt when your look changes). */
  buildCards() {
    const sig = profile.equipped.color + '|' + JSON.stringify(profile.equipped.hats);
    if (sig === this.cardSig) return;
    this.cardSig = sig;
    const box = $('cards');
    box.innerHTML = '';
    this.cards.clear();
    UNIT_ORDER.forEach((id, i) => {
      const t = UNIT_TYPES[id];
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'card-unit';
      el.title = `${t.name}: ${t.blurb || ''}`;
      el.innerHTML = `<span class="key">${i + 1}</span><canvas width="112" height="112"></canvas><span class="name">${t.name}</span>`;
      el.addEventListener('click', () => {
        game.selected = id;
        game.erase = false;
        audio.unlock();
        audio.play('ui');
        this.refresh();
      });
      box.appendChild(el);
      this.cards.set(id, el);
      drawIcon(el.querySelector('canvas'), id, { team: 'blue', hat: profile.equipped.hats[id] });
    });
  },

  hideAllGameUI() {
    this.els.dock.classList.add('hidden');
    this.els.battleCtl.classList.add('hidden');
    this.els.result.classList.add('hidden');
  },

  /** FIGHT and Reset share a corner: ignore a tap right after one replaced the other. */
  justSwapped() {
    return performance.now() - this.swapAt < 450;
  },

  showPlacement() {
    this.swapAt = performance.now();
    this.hideAllGameUI();
    this.els.dock.classList.remove('hidden');
    this.refresh();
  },

  showBattle() {
    this.swapAt = performance.now();
    this.hideAllGameUI();
    this.els.battleCtl.classList.remove('hidden');
    this.refresh();
  },

  showResult(winner) {
    const E = this.els;
    this.swapAt = performance.now();
    E.battleCtl.classList.add('hidden');
    E.result.classList.remove('hidden');
    const title = $('result-title');
    title.className = 'ribbon' + (winner === 'red' ? ' red' : winner === 'draw' ? ' draw' : '');
    title.textContent = winner === 'draw' ? 'DRAW' : `${TEAMS[winner].name} WINS!`;
    const b = game.battle;
    $('result-sub').textContent = winner === 'draw' ? '' : `${b.count(winner)} left standing · ${Math.round(b.battleTime)}s`;
  },

  refresh() {
    const b = game.battle;
    for (const [id, el] of this.cards) el.classList.toggle('selected', id === game.selected && !game.erase);
    this.els.erase.classList.toggle('on', game.erase);
    this.els.slow.classList.toggle('on', game.slowmo);
    this.els.fight.classList.toggle('pulse', b.phase === 'place' && b.count('blue') > 0 && b.count('red') > 0);
  },

  /** Cheap per-frame HUD: only touches the DOM when something changed. */
  tick() {
    if (game.mode !== 'sandbox') return;
    const b = game.battle;
    const L = this.last;
    const hb = b.teamHp('blue');
    const hr = b.teamHp('red');
    const set = (k, v, fn) => {
      if (L[k] !== v) {
        L[k] = v;
        fn(v);
      }
    };
    set('fb', Math.round((hb.max ? hb.hp / hb.max : 0) * 200), (v) => (this.els.barB.style.transform = `scaleX(${v / 200})`));
    set('fr', Math.round((hr.max ? hr.hp / hr.max : 0) * 200), (v) => (this.els.barR.style.transform = `scaleX(${v / 200})`));
    set('cb', b.count('blue'), (v) => (this.els.cntB.textContent = v));
    set('cr', b.count('red'), (v) => (this.els.cntR.textContent = v));
    set('reframe', b.phase === 'place' && !camera.follow, (v) => $('reframe').classList.toggle('hidden', !v));
    let sub = '';
    if (b.phase === 'place') sub = `Sandbox · ${b.count('blue')} vs ${b.count('red')}`;
    else if (b.phase === 'battle') {
      const s = Math.floor(b.battleTime);
      sub = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}${game.slowmo ? ' · slow-mo' : ''}`;
    }
    set('sub', sub, (v) => (this.els.sub.textContent = v));
  },

  refreshMute() {
    this.els.mute.textContent = audio.muted ? '🔇' : '🔊';
    pause.refresh();
  },
};

/** Draw a unit icon by settling a real unit and rendering it. opts: { team, hat } */
function drawIcon(cv, typeId, opts = {}) {
  const team = opts.team || 'blue';
  const b = new Battle(5);
  if (opts.hat && opts.hat !== 'none') b.hats[team] = { [typeId]: opts.hat };
  const u = b.addUnit(typeId, team, 0, 0, 77);
  for (let i = 0; i < 90; i++) b.step(DT);
  const c = cv.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cv.width, cv.height);
  // Fit tall units (the giant Brick) and their hats into the card
  const hatTop = u.hat ? u.R * 1.3 : 0;
  const height = u.ground - (Math.min(u.head.y - hatTop, u.tip ? u.tip.y : u.head.y) - u.R) + 6;
  const s = (cv.width / 80) * Math.min(1, 74 / height);
  c.setTransform(s, 0, 0, s, cv.width / 2 - u.hip.x * s + 4 * s * (team === 'red' ? -1 : 1), cv.height - 8 * (cv.width / 80));
  unitsGfx.drawUnit(c, u, b, 0);
}

// Preview units for the sandbox placement ghost
const sandboxGhosts = {};
function ghostUnit(typeId, team) {
  const k = typeId + team + (team === 'blue' ? profile.equipped.hats[typeId] : '');
  if (!sandboxGhosts[k]) {
    const b = new Battle(3);
    if (team === 'blue') b.hats.blue = { ...profile.equipped.hats };
    const u = b.addUnit(typeId, team, 0, 0.5, 99);
    for (let i = 0; i < 90; i++) b.step(DT);
    sandboxGhosts[k] = { b, u };
  }
  return sandboxGhosts[k];
}

/** Which team may place at world x (or null). */
function teamForX(x) {
  const zb = WORLD.zone.blue;
  const zr = WORLD.zone.red;
  if (x >= zb[0] && x <= zb[1]) return 'blue';
  if (x >= zr[0] && x <= zr[1]) return 'red';
  return null;
}

function laneFor(wy) {
  if (wy > -50 && wy < WORLD.grassFront + 30) return clamp(wy / WORLD.laneDepth, 0, 1);
  return null;
}

/** Taps just outside a zone edge snap into it (fingers are fat). */
function snapToZone(wx) {
  const slop = Math.max(18, 26 / camera.zoom);
  for (const team of ['blue', 'red']) {
    const [z0, z1] = WORLD.zone[team];
    if (wx < z0 && wx > z0 - slop) return z0 + 4;
    if (wx > z1 && wx < z1 + slop) return z1 - 4;
  }
  return wx;
}

/** World-px slack around a bean for grabbing / removing: finger-sized on screen. */
function pickSlack() {
  return game.battle.phase === 'place' ? Math.max(8, 20 / camera.zoom - 12) : 3;
}

function tryPlace(sx, sy) {
  const b = game.battle;
  let [wx, wy] = camera.toWorld(sx, sy);
  wx = snapToZone(wx);
  const team = teamForX(wx);
  if (!team) {
    if (game.realTime - game.zoneToastT > 1.5) {
      game.zoneToastT = game.realTime;
      toast('Not here', 'Place inside the dashed zones', 1.3);
    }
    return;
  }
  if (b.count(team, false) >= 60) {
    toast("That's a lot of beans", 'Max 60 per side', 1.3);
    return;
  }
  const u = b.addUnit(game.selected, team, wx, laneFor(wy));
  // Drop in from a little height: a tiny landing wobble
  for (const p of u.parts) p.teleport(0, -26);
  fx.spawn('poof', { x: u.chest.x, y: u.chest.y + 10, color: pal(team).body });
  audio.play('place', { pitch: u.voice, pan: panOf(sx) });
  buzz(8);
  ui.refresh();
}

function tryRemove(sx, sy) {
  const b = game.battle;
  if (b.phase !== 'place') return;
  const [wx, wy] = camera.toWorld(sx, sy);
  const u = b.unitAt(wx, wy, null, pickSlack());
  if (!u) return;
  fx.spawn('poof', { x: u.chest.x, y: u.chest.y, color: pal(u.team).body });
  b.removeUnit(u);
  audio.play('remove', { pan: panOf(sx) });
  ui.refresh();
}

function drawZones() {
  const t = game.realTime;
  for (const team of ['blue', 'red']) {
    const [x0, x1] = WORLD.zone[team];
    const col = pal(team).body;
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = col;
    ctx.fillRect(x0, WORLD.grassTop + 2, x1 - x0, WORLD.grassFront - WORLD.grassTop - 2);
    // Soft column so the zone reads in the air too
    const g = ctx.createLinearGradient(0, -170, 0, WORLD.grassTop);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, col);
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = g;
    ctx.fillRect(x0, -170, x1 - x0, 170 + WORLD.grassTop);
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 7]);
    ctx.lineDashOffset = -t * 12;
    ctx.beginPath();
    for (const x of [x0, x1]) {
      ctx.moveTo(x, WORLD.grassFront);
      ctx.lineTo(x, -120);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

function drawGhost() {
  if (!game.hover || game.erase || input.mode) return;
  const [hx, wy] = camera.toWorld(game.hover.sx, game.hover.sy);
  const wx = snapToZone(hx);
  const team = teamForX(wx) || 'blue';
  const ok = !!teamForX(wx);
  const { b: gb, u } = ghostUnit(game.selected, team);
  const lane = laneFor(wy);
  const gy = lane == null ? WORLD.laneDepth * 0.5 : lane * WORLD.laneDepth;
  ctx.save();
  ctx.globalAlpha = ok ? 0.5 : 0.22;
  ctx.translate(wx - u.hip.x, gy - u.ground);
  unitsGfx.drawUnit(ctx, u, gb, game.realTime);
  ctx.restore();
}

/**
 * Sandbox auto camera: frame the fight close enough to read faces. Lean toward the
 * front line; leave archers hanging far back out of it; keep anything flying
 * (and the final victim during the slow-mo) in the shot, sky included.
 */
function followFight(b) {
  let blueFront = -Infinity;
  let redFront = Infinity;
  for (const u of b.units) {
    if (!u.alive) continue;
    if (u.team === 'blue') blueFront = Math.max(blueFront, u.hip.x);
    else redFront = Math.min(redFront, u.hip.x);
  }
  let x0 = Infinity;
  let x1 = -Infinity;
  let top = 0;
  for (const u of b.units) {
    let take;
    if (u.alive) {
      take = true;
      const front = u.team === 'blue' ? blueFront : redFront;
      if (u.type.ranged && Number.isFinite(blueFront) && Number.isFinite(redFront) && Math.abs(front - u.hip.x) > 320) take = false;
      if (u.held || u.groundF < 0.2) take = true;
    } else take = u.deadT < 1.6 || (u === game.finalVictim && game.finalSlowT > 0);
    if (!take) continue;
    x0 = Math.min(x0, u.hip.x);
    x1 = Math.max(x1, u.hip.x);
    top = Math.max(top, u.ground - Math.min(u.head.y, u.hip.y));
  }
  if (x0 > x1) return;
  const span = clamp(x1 - x0 + 300, 480, 820);
  const mid = (x0 + x1) / 2;
  const front = Number.isFinite(blueFront) && Number.isFinite(redFront) ? (blueFront + redFront) / 2 : mid;
  let cx = front * 0.75 + mid * 0.25;
  if (x1 - x0 + 300 <= span) cx = mid;
  else cx = clamp(cx, x0 - 150 + span / 2, x1 + 150 - span / 2);
  let maxZ = Math.min(camera.h / 260, (camera.h * camera.groundFrac) / (top + 60));
  // Result showing: pull back a little so the cheering winners sit below the banner
  if (b.phase === 'over' && game.resultT <= 0) maxZ = Math.min(maxZ, camera.h / 470);
  camera.frame(cx - span / 2, cx + span / 2, false, maxZ);
}

// --- input -------------------------------------------------------------------------

const input = new Input(canvas, {
  blocked() {
    return game.paused || !playing() || hub.isOpen() || performance.now() < game.inputBlockUntil || (game.mode === 'match' && !canAct());
  },
  /** Is there a grabbable bean here? (The grab itself only starts once the finger moves.) Sandbox only. */
  canGrab(sx, sy) {
    if (game.mode !== 'sandbox') return false;
    const b = game.battle;
    if (game.erase && b.phase === 'place') return false;
    const [wx, wy] = camera.toWorld(sx, sy);
    return !!b.unitAt(wx, wy, null, pickSlack());
  },
  aimStart(sx, sy) {
    return game.mode === 'match' && aim.fieldStart(sx, sy);
  },
  aimMove(sx, sy) {
    aim.fieldMove(sx, sy);
  },
  aimEnd(sx, sy, cancelled) {
    aim.fieldEnd(sx, sy, cancelled);
  },
  tap(sx, sy) {
    audio.unlock();
    if (game.mode === 'match') {
      // No card picked yet: say how
      if (canAct()) tip.show('Drag a card from your hand, or tap one first', sx, sy - 60, false, 1.6);
      return;
    }
    if (game.battle.phase !== 'place') return;
    if (game.erase) tryRemove(sx, sy);
    else tryPlace(sx, sy);
  },
  alt(sx, sy) {
    if (game.mode === 'sandbox') tryRemove(sx, sy);
  },
  grabStart(sx, sy) {
    if (game.mode !== 'sandbox') return false;
    const b = game.battle;
    if (game.erase && b.phase === 'place') return false;
    const [wx, wy] = camera.toWorld(sx, sy);
    const slack = pickSlack();
    audio.unlock();
    return !!b.grabAt(wx, wy, null, slack);
  },
  grabMove(sx, sy) {
    const [wx, wy] = camera.toWorld(sx, sy);
    game.battle.moveGrab(wx, wy);
  },
  grabEnd() {
    const u = game.battle.release(); // a bean dropped outside its zone waddles back in by itself
    // Sandbox fling: count a proper yeet
    if (u && game.mode === 'sandbox') {
      const v = Math.hypot(u.chest.vx(DT), u.chest.vy(DT));
      if (v > 700) {
        profile.stats.yeets++;
        persist();
        if (profile.stats.yeets === 1) toast('YEET!', 'Badge unlocked: claim it in the menu', 1.8);
      }
    }
  },
  pan(dx) {
    if (game.mode === 'sandbox') camera.pan(dx);
  },
  zoom(f, sx) {
    if (game.mode === 'sandbox') camera.zoomAt(f, sx);
  },
  hover(sx, sy) {
    game.hover = sx == null ? null : { sx, sy };
  },
});

window.addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (hub.isOpen()) {
    if (k === 'escape') hub.closeModal();
    return;
  }
  if (k === 'escape') {
    if (mresult.open) mresult.ok();
    else if (game.paused) resumeGame();
    else pauseGame();
    return;
  }
  if (k === 'm') {
    toggleMute();
    return;
  }
  if (game.mode === 'match') {
    if (k >= '1' && k <= '4' && canAct()) {
      const i = +k - 1;
      hand.select(hand.sel === i ? -1 : i);
      audio.play(hand.sel === i ? 'cardPick' : 'ui');
    } else if ((k === ' ' || k === 'enter') && mresult.open) {
      e.preventDefault();
      mresult.ok();
    } else if (k === ' ' && game.intro > 0) beginFight();
    return;
  }
  if (game.mode !== 'sandbox' || game.paused) return;
  const b = game.battle;
  // (digits 1-9 pick the first nine units; a string compare against '18' would drop 2-9)
  if (/^[1-9]$/.test(k) && +k <= UNIT_ORDER.length) {
    game.selected = UNIT_ORDER[+k - 1];
    game.erase = false;
    ui.refresh();
  } else if (k === 'e') {
    if (b.phase !== 'place') return;
    game.erase = !game.erase;
    ui.refresh();
  } else if (k === ' ') {
    e.preventDefault();
    if (b.phase === 'place') startFight();
    else if (b.phase === 'battle') toggleSlow();
    else if (!ui.els.result.classList.contains('hidden')) $('retry').click();
  } else if (k === 's') toggleSlow();
  else if (k === 'f') camera.follow = true;
  else if (k === 'r') {
    if (b.phase !== 'place') enterPlacement(game.snapshot);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    persist(); // the app may be closed from the background
    // A match waits behind the pause menu (rAF stops anyway; this keeps it stopped on return)
    if (game.mode === 'match' && game.match && game.match.phase !== 'over' && !mresult.open) pauseGame();
    audio.suspend();
    input.reset();
    aim.cancel();
  } else audio.resume();
});
window.addEventListener('blur', () => {
  input.reset();
  aim.cancel();
});
window.addEventListener('pagehide', persist);
// Another copy of the game (a second tab, or the installed app) saved: adopt its
// profile instead of overwriting it with ours on our next save.
window.addEventListener('storage', (e) => {
  if (e.key !== PROFILE_KEY || e.newValue == null) return;
  // An older version of the game in another window wrote an older kind of save (an old v1
  // window re-saves what it adopted as v1, mangled): ours is newer, so ours stays and is
  // written back. (A save like that met at start-up is read as v2: profile.js looksV2.)
  let raw = null;
  try {
    raw = JSON.parse(e.newValue);
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !(Number(raw.v) >= PROFILE_VERSION)) {
    persist();
    return;
  }
  // Badge counts from our running match aren't saved yet: carry them over
  const unsaved = {};
  for (const [k, v] of Object.entries(profile.stats)) if (typeof v === 'number' && v > (savedStats[k] || 0)) unsaved[k] = v - (savedStats[k] || 0);
  const ours = profile.pending;
  const fresh = loadProfile(store);
  savedStats = { ...fresh.stats };
  for (const [k, d] of Object.entries(unsaved)) fresh.stats[k] = (fresh.stats[k] || 0) + d;
  // Our match in progress stays on record (unless that window counted it already)
  if (ours && ours.id === game.pendingId && !fresh.pending && fresh.settled !== ours.id) fresh.pending = { ...ours };
  replaceProfile(fresh);
  applySettings();
  hub.profileChanged();
});

// --- sim events -> juice ------------------------------------------------------------

const BONK_WORDS = ['BONK!', 'POW!', 'WHAM!', 'THWACK!', 'BOINK!'];
const SPIKE_WORDS = ['POKE!', 'YOINK!', 'BOING!', 'ZING!'];
const TOWER_WORDS = ['CRUNCH!', 'KRAK!', 'THUD!', 'CRACK!'];
// The newer cards' heavy hits play like a bonk (sound, dirt, shake, hit-stop on a kill), each
// with its own sound and words
const HEAVY_HITS = {
  dive: { sound: 'bonk', words: ['BONK!', 'ZOOM!', 'POW!'] },
  peck: { sound: 'bonk', words: ['PECK!', 'YOINK!', 'BONK!'] },
  bite: { sound: 'crunch', words: ['CRUNCH!', 'CHOMP!', 'KRAK!'] },
  punch: { sound: 'bonk', words: ['BOING!', 'POW!', 'KA-POW!'] },
  crane: { sound: 'bonk', words: ['WHAM!', 'KA-BLAM!', 'WHUMP!'] },
  stomp: { sound: 'bonk', words: ['STOMP!', 'BOINK!'] },
};
const TOWER_HIT_WORDS = new Set(['club', 'hammer', 'blast', 'bite', 'pogo']);
let wordI = 0;

function panOf(sx) {
  return clamp((sx / W - 0.5) * 1.6, -1, 1);
}

function soundOpts(e, extra = {}) {
  const [sx] = camera.toScreen(e.x, e.y);
  const off = Math.max(0, Math.abs(sx - W / 2) - W / 2);
  const vol = clamp(1 - off / W, 0.2, 1) * (game.mode === 'match' ? 0.9 : clamp(0.55 + camera.zoom * 0.4, 0.55, 1));
  const o = { pan: panOf(sx), vol, rate: timeScale(), ...extra };
  if (e.unit && Number.isFinite(e.unit.voice)) o.pitch = e.unit.voice;
  return o;
}

/** Sound for the player's games; the hub's background match stays silent. */
function sfx(name, o) {
  if (game.mode !== 'attract') audio.play(name, o);
}

/** Comic words, one at a time. */
function word(x, y, list, color, size, gap = 0.9) {
  if (game.realTime - game.lastWordT < gap) return;
  game.lastWordT = game.realTime;
  wordI = (wordI + 1 + (((x * 7) | 0) % 3)) % list.length;
  fx.spawn('text', { x, y, text: list[wordI], color, size });
}

/** Badge bookkeeping from your own matches (not the hub's background match, not the sandbox). */
function track(e) {
  const S = profile.stats;
  const T = game.track;
  const u = e.unit;
  switch (e.type) {
    case 'knockdown':
      if (u && u.team === 'red') S.knockdowns++;
      break;
    case 'death':
      if (u && u.team === 'red') {
        S.kills++;
        if (u.type && u.type.id === 'brick') S.bricksDefeated++;
      }
      break;
    case 'explode': {
      if (e.team === 'blue') S.booms++;
      if (e.small) break; // (a Juggler bomb: three in one second are its everyday juggling, not a chain)
      const t = game.battle.time;
      T.explodes = T.explodes.filter((x) => t - x < 1);
      T.explodes.push(t);
      if (T.explodes.length >= 3 && !T.chained) {
        T.chained = true;
        S.chains++;
        fx.spawn('text', { x: e.x, y: e.y - 70, text: 'CHAIN REACTION!', color: '#ffb02e', size: 26 });
      }
      break;
    }
    case 'block':
      // (e.from may be a tower or a spell: only beans have a type)
      if (!T.boinged && e.from && e.from.type && e.from.type.id === 'spiker' && u && u.team === 'blue') {
        T.boinged = true;
        S.boings++;
      }
      break;
    case 'hit':
      if (e.kind === 'arrow' && u && u.team === 'red' && u.arrows && u.arrows.length >= 8 && !T.pinned.has(u)) {
        T.pinned.add(u);
        S.pincushions++;
      }
      // A red flier batted out of the sky by a club (once per flier)
      if (e.kind === 'bonk' && u && u.team === 'red' && u.type && u.type.flying && !T.homeRun.has(u)) {
        T.homeRun.add(u);
        count('homeRuns');
      }
      // The Wrecking Crane's launches
      if (e.kind === 'crane' && u && u.team === 'red' && e.from && e.from.team === 'blue') count('craneLaunches');
      break;
    // The newer cards' badge counters (meta/badges.js reads them from profile.stats)
    case 'slip':
      if (u && u.team === 'red') count('slips');
      break;
    case 'netted':
      if (u && u.team === 'red' && !T.homeRun.has(u)) {
        T.homeRun.add(u);
        count('homeRuns');
      }
      break;
    case 'pelicanDrop':
      if (u && u.team === 'blue') count('airMail');
      break;
    case 'spit':
      if (u && u.team === 'blue') count('jellySpits');
      break;
  }
}

/** +1 on a profile stat (one the meta game may not list yet: cleanStats keeps any number). */
function count(k) {
  const S = profile.stats;
  S[k] = (Number.isFinite(S[k]) ? S[k] : 0) + 1;
}

/** Enemies launched higher than a castle count as Frequent Flyers. */
function trackFlights(b) {
  if (game.mode !== 'match' || !game.match || game.match.phase === 'over') return;
  const T = game.track;
  for (const u of b.units) {
    if (u.team !== 'red' || T.flew.has(u) || u.held || u.dropping) continue;
    if (u.ground - u.hip.y > 480) {
      T.flew.add(u);
      profile.stats.highFlights++;
      fx.spawn('text', { x: u.head.x, y: u.head.y - 30, text: 'FREQUENT FLYER!', color: '#7fd3ff', size: 22 });
    }
  }
}

function onTowerDown(e) {
  const t = e.tower;
  const castle = t.kind === 'castle';
  fx.spawn('towerDown', { x: t.x, y: 9, w: castle ? 210 : 70, kind: t.kind });
  sfx('towerDown', soundOpts(e));
  shake(castle ? 1 : 0.8);
  // A crumbling tower (its castle fell, or a surrender) also reports: only a real kill scores
  const by = enemyOf(t.team);
  const scored = e.crowns > (game.lastCrowns[by] || 0);
  game.lastCrowns[by] = Math.max(game.lastCrowns[by] || 0, e.crowns);
  if (!scored) return;
  fx.spawn('crown', { x: t.x, y: -t.h - 30, count: castle ? 3 : 1 });
  if (game.mode === 'attract') return;
  setTimeout(() => sfx('crown', { foe: t.team === 'blue' }), 250);
  if (game.mode === 'match' && game.match && game.match.phase !== 'over' && updatePending(profile, game.pendingId, game.match.crowns)) persist();
  if (game.mode === 'match' && t.team === 'red') {
    if (game.match && game.match.endReason !== 'surrender') game.track.towers++;
    buzz([40, 50, 60]);
    coach.onCrown();
    if (!castle && game.match && game.match.phase !== 'over') banner('+1 👑', 'b-fight');
  } else buzz(40);
}

function handleEvents() {
  const b = game.battle;
  const demo = game.mode === 'attract';
  const match = game.mode === 'match';
  for (const e of b.events) {
    if (match) track(e);
    // The newer cards' effects (render/effects.js): true when it drew this event (a new event,
    // a hit of a new kind, a hit on a building or a small blast), so the old effect is skipped
    const drawn = fxForEvent(fx, e, pal);
    switch (e.type) {
      case 'hit': {
        const p = e.power;
        const heavy = HEAVY_HITS[e.kind];
        if (e.kind === 'bonk' || e.kind === 'spike' || heavy) {
          if (!drawn) {
            fx.spawn('impact', { x: e.x, y: e.y, power: p, dirX: e.dirX, dirY: e.dirY, kind: 'bonk' });
            if (e.unit) fx.spawn('dirt', { x: e.unit.hip.x, y: e.unit.ground, power: p, dirX: e.dirX });
          }
          sfx(heavy ? heavy.sound : 'bonk', soundOpts(e, { power: p }));
          if (e.kind === 'crane' && p >= 1) sfx('clank', soundOpts(e, { power: 0.6 }));
          shake((0.18 + p * 0.25) * (match ? 0.6 : 1));
          // Hit-stop for bonks that matter (kills, or near the middle of the screen); back off in mobs
          const now = game.realTime;
          game.bonkTimes = game.bonkTimes.filter((t) => now - t < 1);
          game.bonkTimes.push(now);
          const [bx] = camera.toScreen(e.x, e.y);
          const central = Math.abs(bx - W / 2) < W * 0.35;
          // (in a match the clock runs on sim time: freeze rarely, so 2:00 still feels like 2:00)
          const ok = match ? e.killed && p >= 0.9 : p >= 0.75 && (e.killed || central);
          if (!demo && ok && game.hitstopCool <= 0) {
            game.hitstop = 0.05 + Math.min(0.05, p * 0.03) + (e.killed ? 0.03 : 0);
            game.hitstopCool = match ? 1.2 : game.bonkTimes.length > 2 ? 0.6 : 0.28;
            buzz(p >= 1 ? 14 : 8);
          }
          if (e.killed || p >= 1.05) word(e.x, e.y - 26, heavy ? heavy.words : e.kind === 'spike' ? SPIKE_WORDS : BONK_WORDS, '#ffe14d', 20 + p * 6);
        } else if (e.kind === 'net') {
          sfx('netSwish', soundOpts(e, { power: p }));
          shake(0.05);
        } else if (e.kind === 'bump') {
          sfx('bloop', soundOpts(e, { power: 0.5 }));
          shake(0.08);
        } else if (e.kind === 'slash') {
          fx.spawn('impact', { x: e.x, y: e.y, power: p, dirX: e.dirX, dirY: e.dirY, kind: 'slash' });
          sfx('slash', soundOpts(e, { power: p }));
          shake((0.06 + p * 0.1) * (match ? 0.6 : 1));
        } else {
          fx.spawn('impact', { x: e.x, y: e.y, power: 0.4, dirX: e.dirX, dirY: e.dirY, kind: 'arrow' });
          sfx('arrowBody', soundOpts(e));
        }
        break;
      }
      case 'block':
        fx.spawn('block', { x: e.x, y: e.y, power: e.power, dirX: e.dirX, dirY: e.dirY });
        sfx(e.kind === 'arrow' ? 'arrowShield' : 'clank', soundOpts(e, { power: e.power }));
        if (e.kind !== 'arrow') shake(0.06);
        break;
      case 'whoosh':
        sfx('whoosh', soundOpts(e, { power: e.power }));
        break;
      case 'grunt':
        sfx('grunt', soundOpts(e));
        break;
      case 'bowDraw':
        sfx('bowDraw', soundOpts(e));
        break;
      case 'bowRelease':
        sfx('bowRelease', soundOpts(e));
        break;
      case 'arrowGround':
        fx.spawn('arrowGround', { x: e.x, y: e.y, dirX: e.dirX });
        sfx('arrowGround', soundOpts(e));
        break;
      case 'step':
        if (e.power > 0.35 && ((e.x * 13) | 0) % 3 === 0) fx.spawn('dust', { x: e.x, y: e.y, power: 0.25 * e.power, dirX: -(e.unit ? e.unit.f : 0) });
        if (camera.zoom > 0.8) sfx('step', soundOpts(e, { power: e.power }));
        break;
      case 'land':
        // A freshly dropped bean's first touchdown: the deploy ring
        if (e.unit && e.unit.deployT > 0 && !game.track.landed.has(e.unit)) {
          game.track.landed.add(e.unit);
          fx.spawn('deploy', { x: e.x, y: e.y, color: pal(e.unit.team).body, radius: e.unit.R * 1.6 });
        }
        fx.spawn('land', { x: e.x, y: e.y, power: e.power });
        if (e.power > 0.5) fx.spawn('dirt', { x: e.x, y: e.y, power: e.power * 0.6, dirX: 0 });
        sfx('land', soundOpts(e, { power: e.power }));
        shake(e.power * 0.12);
        break;
      case 'scream':
        sfx('scream', soundOpts(e));
        break;
      case 'hitVoice':
        sfx('hitVoice', soundOpts(e, { power: e.power }));
        break;
      case 'death':
        game.lastDeath = e.unit;
        sfx('death', soundOpts(e));
        break;
      case 'dizzy':
        fx.spawn('stars', { x: e.x, y: e.y });
        break;
      case 'cheer':
        sfx('cheer', soundOpts(e));
        break;
      case 'grab':
        sfx('grab', soundOpts(e));
        break;
      case 'drop':
        // (cards drop beans from the sky too: those land with 'land' and 'deploy')
        if (!e.unit || !e.unit.dropping) sfx('drop', soundOpts(e));
        break;
      case 'hatOff':
        sfx('pop', soundOpts(e));
        break;
      case 'battleStart':
        sfx('battleStart', {});
        shake(0.15);
        break;
      case 'explode': {
        if (e.small) {
          // A Juggler bomb (drawn by fxForEvent): a small pop, no hit-stop, no word
          sfx('boom', soundOpts(e, { power: 0.4 }));
          shake(0.18);
          break;
        }
        fx.spawn('explosion', { x: e.x, y: e.y, power: e.power || 1 });
        // The bomb's googly eyes go flying
        for (const s of [-1, 1]) fx.spawn('eyeball', { x: e.x + s * 4, y: e.y - 4, vx: s * (120 + Math.abs(Math.sin(e.x)) * 160), vy: -380 - Math.abs(Math.cos(e.x)) * 180, size: 5.5 });
        sfx('boom', soundOpts(e, { power: 1 }));
        shake(0.7);
        buzz(35);
        if (!demo && game.hitstopCool <= 0) {
          game.hitstop = 0.08;
          game.hitstopCool = match ? 1.2 : 0.5;
        }
        word(e.x, e.y - 40, ['BOOM!'], '#ff9a2e', 32, 0.7);
        break;
      }
      case 'quake':
        fx.spawn('quake', { x: e.x, y: e.y, power: 1 });
        sfx('quake', soundOpts(e, { power: 1 }));
        shake(0.45);
        buzz(22);
        if (!demo && !match && game.hitstopCool <= 0) {
          game.hitstop = 0.05;
          game.hitstopCool = 0.4;
        }
        break;
      case 'fuse':
        sfx('fuse', soundOpts(e));
        break;
      case 'battleEnd':
        if (game.mode === 'sandbox') finishSandbox(e.winner);
        break;

      // --- arena -------------------------------------------------------------------
      case 'cardPlayed': {
        const c = cardById(e.card);
        if (!c || c.kind !== 'unit') break; // (buildings: buildingPlaced; spells: spellCast)
        if (c.anywhere) sfx('umbrella', soundOpts(e)); // (they float down: no drop and plop)
        else if (c.flying) sfx(c.unit === 'pelican' ? 'squawk' : 'whirr', soundOpts(e));
        else sfx('deploy', soundOpts(e, { power: clamp((c.count || 1) * 0.3 + c.mana * 0.1, 0.4, 1.3) }));
        break;
      }
      case 'spellCast':
        if (e.spell === 'boulder' || e.spell === 'anvil') sfx('boulderFall', soundOpts(e));
        else if (e.spell === 'wheel') sfx('wheel', soundOpts(e));
        else if (e.spell === 'peels') sfx('whoosh', soundOpts(e, { power: 0.6 }));
        else if (e.spell === 'sneeze') sfx('inhale', soundOpts(e));
        else if (e.spell === 'soda') sfx('fizz', soundOpts(e));
        else if (e.spell === 'wrap') sfx('wrapOn', soundOpts(e));
        break;
      case 'rainVolley':
        sfx('rainVolley', soundOpts(e));
        break;
      case 'boulderImpact':
        fx.spawn('boulderImpact', { x: e.x, y: e.y, power: e.power });
        sfx('boulderImpact', soundOpts(e, { power: e.power }));
        shake(0.6);
        buzz(30);
        word(e.x, e.y - 60, ['KA-THUNK!', 'WHUMP!', 'CRASH!'], '#ffe14d', 30, 0.5);
        break;
      case 'towerShot':
        sfx('towerShot', soundOpts(e));
        break;
      case 'cannonFire':
        fx.spawn('cannonFire', { x: e.x, y: e.y, dirX: Math.cos(e.tower.aim), dirY: Math.sin(e.tower.aim) });
        sfx('cannon', soundOpts(e));
        shake(0.12);
        break;
      case 'cannonHit':
        fx.spawn('cannonHit', { x: e.x, y: e.y, power: e.power });
        sfx('boom', soundOpts(e, { power: 0.5 }));
        shake(0.15);
        break;
      case 'towerHit': {
        const p = e.power ?? 0.5;
        const tw = e.tower;
        if (!drawn) {
          const from = e.from;
          const fromX = from && from.hip ? from.hip.x : from && Number.isFinite(from.x) ? from.x : e.x;
          const dirX = Math.sign(tw.x - fromX) || (tw.team === 'blue' ? -1 : 1);
          fx.spawn('towerHit', { x: e.x, y: e.y, power: p, dirX, kind: e.kind });
        }
        // Stone towers thunk, the wooden buildings knock, the crane's iron clanks
        const bld = tw.kind === 'building';
        sfx(!bld ? 'towerHit' : tw.bid === 'wreckingCrane' ? 'clank' : 'woodHit', soundOpts(e, { power: p }));
        if (e.kind === 'bite') sfx('crunch', soundOpts(e, { power: p }));
        shake((0.06 + p * 0.12) * (bld ? 0.6 : 1));
        if (p >= 0.8 && TOWER_HIT_WORDS.has(e.kind)) word(e.x, e.y - 30, TOWER_WORDS, '#ffd27a', 22 + p * 6, 1.2);
        break;
      }
      case 'arrowTower':
        fx.spawn('towerHit', { x: e.x, y: e.y, power: 0.2, dirX: e.dirX, kind: 'arrow' });
        sfx('arrowGround', soundOpts(e, { vol: 0.5 }));
        break;
      case 'towerDown':
        onTowerDown(e);
        break;
      case 'castleAwake':
        fx.spawn('awake', { x: e.x - (e.tower.f || 1) * 24, y: e.y - 20 });
        sfx('castleAwake', soundOpts(e));
        break;
      case 'wheelHit': {
        const dirX = Math.sign(e.spell ? e.spell.vx : 1) || 1;
        fx.spawn('crumbs', { x: e.x, y: e.y, power: 0.9, dirX });
        fx.spawn('impact', { x: e.x, y: e.y, power: 0.8, dirX, kind: 'bonk' });
        sfx('bonk', soundOpts(e, { power: 0.8 }));
        break;
      }
      case 'wheelEnd':
        fx.spawn('cheeseBurst', { x: e.x, y: e.y });
        break;
      case 'doubleMana':
        if (match) {
          banner('×2 MANA!', 'b-mana');
          sfx('doubleMana', {});
        }
        break;
      case 'overtime':
        if (match) {
          banner('OVERTIME!', 'b-ot');
          sfx('overtime', {});
          setTimeout(() => game.mode === 'match' && game.match && game.match.phase === 'overtime' && subTip('First tower down wins!'), 1500);
        }
        break;
      case 'matchEnd':
        onMatchEnd(e);
        break;

      // --- the newer cards (their effects come from fxForEvent above) --------------
      case 'buildingPlaced':
        sfx('whoosh', soundOpts(e, { power: 0.6 })); // (the crate drops for LAND_T, then buildingLand)
        break;
      case 'buildingLand':
        sfx('crateLand', soundOpts(e, { power: e.power }));
        shake(0.1 + 0.12 * (e.power || 1));
        if (e.tower && e.tower.team === 'blue') buzz(15);
        break;
      case 'buildingDown': {
        // (never a crown: a building that crumbles or runs out of time just falls apart)
        const crane = e.bid === 'wreckingCrane';
        const wornOut = e.cause !== 'destroyed';
        sfx('planks', soundOpts(e, { power: wornOut ? 0.6 : 1.1, metal: crane }));
        if (crane) sfx('creak', soundOpts(e));
        shake(wornOut ? 0.1 : 0.4);
        if (!wornOut && e.tower) word(e.tower.x, -e.tower.h - 24, TOWER_WORDS, '#ffd27a', 26, 0.6);
        break;
      }
      case 'punchWindup':
        sfx('rattle', soundOpts(e));
        break;
      case 'punch':
        sfx('glove', soundOpts(e));
        break;
      case 'sproutPop':
        sfx('sproutPop', soundOpts(e));
        break;
      case 'craneSwing':
        sfx('whoosh', soundOpts(e, { power: clamp(e.power || 1, 0.4, 1.5) }));
        sfx('creak', soundOpts(e, { vol: 0.7 }));
        break;
      case 'liftOff':
        // The propeller cuts out (netted, flattened, fizzed); a Pelican complains
        if (e.unit && e.unit.type.id === 'pelican') sfx('squawk', soundOpts(e));
        else sfx('whirr', soundOpts(e, { down: true }));
        break;
      case 'netted':
        word(e.x, e.y - 34, ['GOTCHA!', 'SNAG!', 'CAUGHT!'], '#bfeaff', 22, 0.6);
        break;
      case 'crash':
        // (power is the impact like a landing's: 0..1.5)
        sfx('land', soundOpts(e, { power: clamp(e.power ?? 0.8, 0.5, 1.4) }));
        shake(0.08 + 0.08 * clamp(e.power ?? 0.8, 0, 1.5));
        break;
      case 'propOff':
        sfx('pop', soundOpts(e));
        sfx('whirr', soundOpts(e, { down: true, vol: 0.6 }));
        break;
      case 'dive':
        sfx('whoosh', soundOpts(e, { power: 1.3 }));
        break;
      case 'boing':
        sfx('boing', soundOpts(e, { power: 0.8 }));
        break;
      case 'stomp':
        word(e.x, e.y - 20, ['STOMP!', 'BOINK!'], '#ffe14d', 22);
        break;
      case 'juggleToss':
        sfx('whoosh', soundOpts(e, { power: 0.45 }));
        break;
      case 'fumble':
        sfx('drop', soundOpts(e));
        sfx('fuse', soundOpts(e));
        word(e.x, e.y - 50, ['OOPS!', 'UH-OH!'], '#ffb02e', 24, 0.5);
        break;
      case 'beat':
        sfx('drum', soundOpts(e));
        break;
      case 'swoop':
        sfx('squawk', soundOpts(e));
        sfx('whoosh', soundOpts(e, { power: 1 }));
        break;
      case 'scoop':
        sfx('grab', soundOpts(e));
        word(e.x, e.y - 44, ['YOINK!', 'GULP!'], '#ffe14d', 22, 0.6);
        break;
      case 'pelicanDrop':
        sfx('drop', soundOpts(e));
        sfx('squawk', soundOpts(e, { vol: 0.7 }));
        break;
      case 'letGo':
        sfx('drop', soundOpts(e));
        break;
      case 'engulf':
        sfx('bloop', soundOpts(e, { power: 1 }));
        word(e.x, e.y - 56, ['BLOOP', 'GLORP'], '#ffd6f2', 22, 0.6);
        break;
      case 'spit':
        sfx('ptoo', soundOpts(e));
        word(e.x, e.y - 44, ['PTOO!'], '#ffe14d', 24, 0.5);
        shake(0.1);
        break;
      case 'canopyFlip':
        sfx('umbrella', soundOpts(e, { flip: true }));
        break;
      case 'brollyLand':
        sfx('land', soundOpts(e, { power: 0.35 }));
        break;
      case 'wrapPop':
        sfx('bubblePop', soundOpts(e, { power: 0.6 }));
        break;
      case 'wrapEnd':
        if (e.popped) sfx('bubblePop', soundOpts(e, { power: 1.2 }));
        break;
      case 'slip':
        sfx('slip', soundOpts(e));
        word(e.x, e.y - 64, ['WHOOPS!', 'WHOA!', 'OOF!'], '#fff27a', 22, 0.6);
        break;
      case 'skid':
        sfx('skid', soundOpts(e));
        break;
      case 'peelKick':
        sfx('whoosh', soundOpts(e, { power: 0.25 }));
        break;
      case 'sneeze':
        sfx('achoo', soundOpts(e));
        shake(0.25);
        word(e.x, e.y - 90, ['ACHOO!'], '#e6ffc2', 30, 0.4);
        break;
      case 'sodaErupt':
        sfx('sodaPop', soundOpts(e));
        shake(0.35);
        buzz(20);
        word(e.x, e.y - 200, ['WHOOSH!', 'POP!'], '#c4f1ff', 30, 0.4);
        break;
      case 'anvilImpact':
        sfx('clang', soundOpts(e, { power: e.power }));
        shake(0.65);
        buzz(30);
        // (like a big bomb: a short freeze when it lands on something, rarely in a match)
        if (e.hits > 0 && !demo && game.hitstopCool <= 0) {
          game.hitstop = 0.07;
          game.hitstopCool = match ? 1.2 : 0.5;
        }
        word(e.x, e.y - 80, ['CLANG!'], '#ffffff', 32, 0.4);
        break;
    }
  }
  b.events.length = 0;
  trackFlights(b);
}

/** A second line under a banner, as a quiet tip. */
function subTip(text) {
  tip.show(text, W / 2, H * 0.38 + 40, false, 2.2);
}

// --- frame loop -----------------------------------------------------------------------

function timeScale() {
  let s = game.slowmo ? 0.3 : 1;
  if (game.finalSlowT > 0) s *= 0.22 + 0.78 * clamp(1 - game.finalSlowT / game.finalSlowDur, 0, 1) ** 3;
  return s;
}

/** One fixed step of whatever is running. */
function stepOnce() {
  if (game.match) {
    for (const bot of game.bots) bot.update(DT);
    game.match.step(DT);
  } else game.battle.step(DT);
}

let acc = 0;
let last = performance.now();
function frame(now) {
  // (up to 0.1 s a frame, the most the step loop catches up: real time down to 10 fps)
  const realDt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  try {
    tickFrame(realDt);
  } finally {
    requestAnimationFrame(frame);
  }
}

function tickFrame(realDt) {
  if (hub.isOpen()) hub.tick(realDt);
  if (unitsGfx.palettes.blue !== armyPalette(profile)) applyPalette(); // colour changed in the shop
  if (game.paused) {
    // Menu open: the game waits underneath
    render();
    return;
  }
  if (game.mode === 'attract' && hub.isOpen()) {
    // The hub's other tabs and the chest show are opaque: let the demo match wait (and the battery rest)
    if (hub.current() !== 'battle' || hub.covered()) {
      if (game.dirty) render();
      game.dirty = false;
      return;
    }
    // The demo is scenery: 30 frames a second are plenty (half the work on a 60 Hz screen)
    game.attractDt += realDt;
    if (game.attractDt < 1 / 32 && !game.dirty) return;
    realDt = Math.min(0.1, game.attractDt);
    game.attractDt = 0;
  }
  game.dirty = false;
  game.realTime += realDt;
  const b = game.battle;
  if (game.mode === 'match' && game.intro > 0) {
    game.intro -= realDt;
    if (game.intro <= 0) beginFight();
  }
  let simDt = 0;
  if (game.hitstopCool > 0) game.hitstopCool -= realDt;
  if (!(game.mode === 'match' && game.intro > 0)) {
    if (game.hitstop > 0) game.hitstop -= realDt;
    else {
      acc += realDt * timeScale();
      let n = 0;
      while (acc >= DT && n < 12) {
        stepOnce();
        acc -= DT;
        simDt += DT;
        n++;
      }
      if (n === 12) acc = 0;
    }
  }
  if (game.finalSlowT > 0) game.finalSlowT -= realDt;
  if (game.resultT > 0) {
    game.resultT -= realDt;
    if (game.resultT <= 0) {
      if (game.mode === 'match' && game.summary) mresult.show(game.summary);
      else if (game.mode === 'sandbox') {
        ui.showResult(b.winner);
        camera.groundTarget = 0.88; // winners in the lower third, under the banner
        audio.play(b.winner === 'draw' ? 'draw' : 'victory', {});
      }
    }
  }
  if (game.attractRestartT > 0) {
    game.attractRestartT -= realDt;
    if (game.attractRestartT <= 0 && game.mode === 'attract') startAttract();
  }
  if (game.mode === 'attract' && (game.frameT -= realDt) <= 0) {
    game.frameT = 0.5; // the hub's layout can change (tabs, resize): keep the demo framed between its bars
    frameArena(false);
  }
  handleEvents();
  fx.follow(b, simDt); // (wheel crumbs, cannon smoke, Juggler bomb sparks: Jugglers throw in the Sandbox too)
  // Effects keep animating through hit-stop: the starburst pops and shrinks while the bodies freeze
  fx.update(game.hitstop > 0 ? realDt * 0.6 : simDt);

  if (game.mode === 'sandbox') {
    if (camera.follow && b.phase !== 'place') followFight(b);
    else if (camera.follow) framePlacement(false);
  }
  camera.update(realDt);

  render();
  coach.tick(realDt); // (reads layout first, before the HUD writes this frame's styles)
  hud.tick();
  hand.tick();
  ui.tick();
}

/**
 * Draw between the last two sim steps (alpha = leftover time / DT) so slow
 * motion is smooth instead of juddering. Positions are swapped in for the
 * draw and restored right after, so the sim never sees them.
 */
const lerped = [];
function lerpIn(b, alpha) {
  lerped.length = 0;
  const k = 1 - alpha;
  if (k <= 0.001) return;
  const add = (p) => {
    lerped.push(p, p.x, p.y);
    p.x -= (p.x - p.px) * k;
    p.y -= (p.y - p.py) * k;
  };
  const vel = (o) => {
    lerped.push(o, o.x, o.y);
    o.x -= (o.vx || 0) * DT * k;
    o.y -= (o.vy || 0) * DT * k;
  };
  for (const u of b.units) if (!u.asleep) for (const p of u.parts) add(p);
  for (const it of b.items) {
    add(it.a);
    add(it.b);
  }
  for (const a of b.arrows) if (a.state === 'fly') vel(a);
  for (const s of b.shots) vel(s); // (cannonballs and Juggler bombs)
  for (const s of b.spells) if (((s.kind === 'boulder' || s.kind === 'anvil') && s.state === 'fall') || (s.kind === 'wheel' && !s.done)) vel(s);
  // The Wrecking Crane's ball swings on a pendulum (its last step's spot is kept)
  for (const t of b.towers) if (t.ball && t.alive && Number.isFinite(t.ball.px)) add(t.ball);
}
function lerpOut() {
  for (let i = 0; i < lerped.length; i += 3) {
    lerped[i].x = lerped[i + 1];
    lerped[i].y = lerped[i + 2];
  }
  lerped.length = 0;
}

function render() {
  const b = game.battle;
  const v = camera.view();
  const t = game.realTime;
  const arena = b.mode === 'arena';
  const placing = game.mode === 'sandbox' && b.phase === 'place';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  game.bg.drawBack(ctx, { w: W, h: H, dpr, cam: v, t });
  camera.apply(ctx, dpr);
  if (arena) towersGfx.draw(ctx, b, { t, dpr });
  if (placing) drawZones();
  fx.drawBack(ctx);
  if (arena) drawSpellsBack(ctx, b, t);
  lerpIn(b, game.paused ? 1 : clamp(acc / DT, 0, 1));
  unitsGfx.drawShadows(ctx, b);
  if (game.mode === 'match') unitsGfx.drawTeamRings(ctx, b, camera.zoom < 0.7 ? 0.55 : 0.35);
  unitsGfx.drawGroundArrows(ctx, b);
  unitsGfx.drawItems(ctx, b);
  unitsGfx.skyTop = game.mode === 'match' ? hudTopPx() * dpr : 0; // (a Brolly fades in below the HUD row)
  unitsGfx.drawUnits(ctx, b, b.time);
  unitsGfx.drawFlyingArrows(ctx, b);
  if (arena) drawSpells(ctx, b, t);
  drawShots(ctx, b); // (cannonballs; Juggler bombs in the Sandbox too)
  lerpOut();
  if (game.mode === 'match') drawAim();
  if (placing) drawGhost();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  game.bg.drawFront(ctx, { w: W, h: H, dpr, cam: v, t });
  camera.apply(ctx, dpr);
  fx.drawFront(ctx, false);
  if (arena) {
    if (unitsGfx.showHp) unitsGfx.drawHpBars(ctx, b, { dpr });
    towersGfx.drawBars(ctx, b, { t, dpr });
  }
  fx.drawWords(ctx); // (a BOING! or OOF! reads over the HP bars around it)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// --- the hub (menus) -------------------------------------------------------------------

hub = createHub({
  profile,
  persist,
  saveOk: () => !saveFailed,
  audio,
  now: () => Date.now(),
  onShow(name) {
    hubState = name;
    // A new version that waited for a modal (a chest show) to close: switch now
    if (name === 'hub' && pendingUpdate && !playing()) {
      applyPendingUpdate();
      return;
    }
    // A card or another tab is up: back steps back to the Battle tab first
    if (name === 'modal' || (name === 'hub' && hub && hub.current() !== 'battle')) armBack();
    else if (name === 'hub' && !playing()) disarmBack();
  },
  actions: {
    battle: startMatch,
    sandbox: playSandbox,
    setSetting,
    resetProgress() {
      const fresh = newProfile();
      fresh.settings = { ...profile.settings };
      replaceProfile(fresh);
      persist();
      applySettings();
      blockInput();
      input.reset();
      audio.resume();
      if (game.mode !== 'attract') startAttract();
    },
    installApp: () => promptInstall(),
    installMethod,
    applyPalette,
  },
});

// --- boot -------------------------------------------------------------------------------

hud.build();
hand.build();
pause.build();
vs.build();
mresult.build();
coach.build();
ui.build();
applySettings();
startAttract();
resize();
// Reloaded (or updated) away from the hub: the page sits on the history entry
// we pushed; mark it ours so showing the hub consumes it.
if (history.state && history.state.wobble) backArmed = backWanted = true;
hub.show('battle');
document.documentElement.classList.add('booted');
// A slow first load may have put up the "still loading" note (index.html): it's done now
const bootNote = $('boot-error');
if (bootNote && !bootNote.dataset.shown) bootNote.style.display = 'none';

// Debug / test hook (harmless in production): step the running game, inspect the match.
window.__wobble = {
  game,
  camera,
  fx,
  audio,
  get profile() {
    return profile;
  },
  get match() {
    return game.match;
  },
  get battle() {
    return game.battle;
  },
  hub,
  /** Advance the running game by n fixed steps right now (skips a VS intro). */
  step(n = 1) {
    if (game.mode === 'match') beginFight();
    for (let i = 0; i < n; i++) {
      stepOnce();
      if (i % 30 === 29) handleEvents();
    }
    handleEvents();
  },
  /** Jump to a mode the way the hub's buttons do: 'match' | 'sandbox' | 'hub'. */
  go(mode) {
    if (mode === 'match') startMatch();
    else if (mode === 'sandbox') playSandbox();
    else goHub();
  },
  /** Play your hand card i at world x as if dragged there; returns '' or why not. */
  play(i, x) {
    if (!inMatch()) return 'nomatch';
    const c = aim.check(i, x);
    if (!c.ok) return c.why || 'zone';
    return game.match.play('blue', i, c.x) ? '' : 'fail';
  },
};

// Offline app + updates: a new version downloads in the background. Switch to it
// (one reload) only while in the menus, never mid-game; otherwise on the way
// back to the menu. Progress is saved, so nothing is lost.
registerPWA({
  onUpdateReady(applyUpdate) {
    // (not mid-game, and not over a chest show or another card: the hub applies it when that closes)
    if (!playing() && !(hub.isOpen() && hub.hasModal())) applyUpdate();
    else pendingUpdate = applyUpdate;
  },
  onInstallChange() {
    hub.installChanged();
  },
});
requestAnimationFrame((t) => {
  last = t;
  frame(t);
});
