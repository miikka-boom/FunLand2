// Wobble War: boot, game flow (hub -> placement -> battle -> result), input,
// turning sim events into effects / sound / haptics / camera, progression
// (profile, rewards, trophies) and the frame loop. The menus live in
// ui/meta-ui.js; the fair-F2P rules live in meta/.

import { WORLD, TEAMS } from './config.js';
import { Battle, DT } from './sim/battle.js';
import { UNIT_TYPES, UNIT_ORDER } from './sim/unit-types.js';
import { Camera } from './render/camera.js';
import { UnitRenderer } from './render/units.js';
import { createBackground } from './render/background.js';
import { Effects } from './render/effects.js';
import { BattleAudio } from './audio.js';
import { Input } from './input.js';
import { LEVELS } from './meta/levels.js';
import { loadProfile, saveProfile, newProfile, PROFILE_KEY } from './meta/profile.js';
import { WORLDS, unlockedUnits, recordLevelWin, recordDailyWin, dailyChallenge, dateKey, starsFor, worldOf } from './meta/economy.js';
import { claimable } from './meta/trophies.js';
import { armyPalette } from './meta/cosmetics.js';
import { HATS } from './render/hats.js';
import { createMetaUI } from './ui/meta-ui.js';
import { registerPWA, canInstall, promptInstall, installMethod } from './pwa.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const $ = (id) => document.getElementById(id);

// --- profile ------------------------------------------------------------------------

const store = (() => {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked storage: play on, just without saving
  }
})();
let profile = loadProfile(store);
// Carry the sound setting over from the pre-F2P save
try {
  const old = store && JSON.parse(store.getItem('wobblewar.v1') || 'null');
  if (old && !profile.stats.battles && old.muted) profile.settings.sound = false;
} catch {
  // ignore
}
function persist() {
  saveProfile(profile, store);
}

/** Swap in another profile without replacing the object (the menus hold a reference to it). */
function replaceProfile(next) {
  for (const k of Object.keys(profile)) delete profile[k];
  Object.assign(profile, next);
}

// --- core objects ---------------------------------------------------------------

const canvas = $('game');
const ctx = canvas.getContext('2d');
const camera = new Camera();
const unitsGfx = new UnitRenderer();
const bg = createBackground({ seed: 7 });
const fx = new Effects({ seed: 11 });
const audio = new BattleAudio();

const game = {
  mode: null, // attract (hub background) | campaign | daily | sandbox
  level: 0, // campaign level index
  daily: null, // today's challenge
  battle: new Battle(1),
  snapshot: null, // placement to restore on retry / reset
  selected: 'clubber',
  erase: false,
  slowmo: false,
  finalSlowT: 0,
  hitstop: 0,
  hitstopCool: 0,
  resultT: -1,
  hover: null,
  realTime: 0,
  grabNoticeShown: false,
  lastWordT: -1,
  paused: false, // menu open over a running game
  inputBlockUntil: 0, // swallow taps that fall through from a just-closed overlay
  lastDeath: null,
  finalVictim: null,
  bonkTimes: [],
  zoneToastT: -9,
  spent: 0, // gold spent on the army that's fighting
  reward: null, // what the last win paid out (for the result screen)
  track: null, // per-battle bookkeeping for trophies
  attractRestartT: -1,
};
window.__ww = { game, camera, fx, audio, get profile() {
  return profile;
} };

const playing = () => game.mode && game.mode !== 'attract';
const blueName = () => (game.mode === 'sandbox' || game.mode === 'attract' ? 'BLUE' : 'YOU');

/** Team colours: the player's army wears the colour they picked. */
function pal(team) {
  return team === 'blue' ? armyPalette(profile) : TEAMS[team];
}

let W = 1;
let H = 1;
let dpr = 1;
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
  if (game.battle.phase === 'place' && camera.follow) framePlacement(true);
  else camera.clampView();
}
window.addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

function framePlacement(instant) {
  camera.follow = true;
  // Portrait campaign: only blue's side matters, so show it big enough to tap
  if (W < H && game.mode !== 'sandbox') camera.frame(WORLD.zone.blue[0] - 60, WORLD.zone.blue[1] + 60, instant, 1.35);
  else camera.frame(WORLD.zone.blue[0] - 90, WORLD.zone.red[1] + 90, instant, 1.35);
}

// --- settings, haptics -------------------------------------------------------------

function applySettings() {
  const S = profile.settings;
  audio.setMuted(!S.sound);
  audio.setVolume(S.volume);
  ui.refreshMute();
  const p = armyPalette(profile);
  const root = document.documentElement.style;
  root.setProperty('--army', p.body);
  root.setProperty('--army-dark', p.dark);
  root.setProperty('--army-light', p.light);
  unitsGfx.palettes.blue = p;
}

function setSetting(k, v) {
  profile.settings[k] = v;
  persist();
  applySettings();
  if (k === 'haptics' && v) buzz(20);
}

/** Short vibration on Android (iOS Safari has none). Only for the player's own battles. */
function buzz(pattern) {
  if (!profile.settings.haptics || game.mode === 'attract' || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

function shake(a) {
  if (!profile.settings.shake) return;
  camera.shake(game.mode === 'attract' ? a * 0.4 : a);
}

// --- flow ---------------------------------------------------------------------------

const uiSeed = () => (Math.random() * 2 ** 31) | 0;

function currentLevel() {
  if (game.mode === 'campaign') return LEVELS[game.level];
  if (game.mode === 'daily') return game.daily.level;
  return null;
}

function availableUnits() {
  return game.mode === 'attract' ? UNIT_ORDER.slice() : unlockedUnits(profile);
}

function newBattle(seed = uiSeed()) {
  fx.clear();
  game.battle = new Battle(seed);
  game.resultT = -1;
  game.finalSlowT = 0;
  game.hitstop = 0;
  game.erase = false;
  game.finalVictim = null;
  game.lastDeath = null;
  game.reward = null;
  game.attractRestartT = -1;
  game.track = { explodes: [], chained: false, flew: new Set(), pinned: new Set(), boinged: false };
  camera.groundTarget = 0.74;
  camera.fast = false;
  unitsGfx.trails.clear();
  unitsGfx.palettes.blue = armyPalette(profile);
  game.battle.hats.blue = { ...profile.equipped.hats };
}

/** Ignore canvas taps for a moment (a double-tap on a button mustn't place a bean). */
function blockInput(ms = 350) {
  game.inputBlockUntil = performance.now() + ms;
}

function enterPlacement(snapshot) {
  newBattle(game.mode === 'daily' ? game.daily.seed : undefined);
  const b = game.battle;
  const L = currentLevel();
  if (L) {
    b.hats.red = L.redHat ? { all: L.redHat } : game.mode === 'daily' && game.daily.hat ? { all: game.daily.hat } : {};
    L.red.forEach((s, i) => b.addUnit(s.type, 'red', s.x, (i * 0.383 + 0.2) % 1, 1000 + i));
  }
  const avail = availableUnits();
  if (!avail.includes(game.selected)) game.selected = avail[0];
  if (snapshot) for (const s of snapshot) if ((game.mode === 'sandbox' || s.team === 'blue') && avail.includes(s.type)) b.addUnit(s.type, s.team, s.x, s.lane, s.seed);
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
    toast(b.count('blue') ? 'Red needs some beans' : 'Place some beans first!', game.mode === 'sandbox' ? 'Tap the right side for red, left for blue' : 'Pick a unit and tap the blue side', 1.6);
    audio.play('ui');
    return;
  }
  b.enforceZones();
  game.snapshot = b.snapshot().filter((s) => game.mode === 'sandbox' || s.team === 'blue');
  game.spent = b.cost('blue');
  audio.unlock();
  b.start();
  game.erase = false;
  camera.follow = true;
  camera.groundTarget = 0.78;
  buzz(25);
  ui.showBattle();
  if (game.mode === 'campaign' && game.level === 0 && !profile.tutorial) {
    profile.tutorial = 1;
    persist();
    ui.timers.push(setTimeout(() => toast('Watch them go!', 'Drag to look around · 🐢 for slow-mo', 2.6), 900));
  }
}

/** Leave the menus and start playing a mode. */
function beginMode(mode) {
  audio.unlock();
  audio.play('ui');
  blockInput();
  game.mode = mode;
  game.snapshot = null;
  game.slowmo = false;
  game.paused = false;
  audio.resume();
  meta.hideAll();
  document.body.classList.remove('in-hub');
  armBack();
}

/**
 * Android back button / back gesture: step back inside the game (battle ->
 * pause menu -> resume; any menu -> hub) instead of leaving the page. Only
 * the hub lets the browser go back for real.
 */
let backArmed = false;
let ignoreNextPop = false;
/** Back on the hub: drop our extra history entry, so the next back press leaves for real. */
function disarmBack() {
  if (!backArmed) return;
  backArmed = false;
  ignoreNextPop = true;
  try {
    history.back();
  } catch {
    ignoreNextPop = false;
  }
}
function armBack() {
  if (backArmed) return;
  try {
    history.pushState({ wobble: 1 }, '');
    backArmed = true;
  } catch {
    // ignore
  }
}
window.addEventListener('popstate', () => {
  if (ignoreNextPop) {
    ignoreNextPop = false;
    return;
  }
  backArmed = false;
  const cur = meta.current();
  if (cur === 'pause') {
    resumeGame();
    armBack();
  } else if (playing() && !cur) {
    pauseGame();
    armBack();
  } else if (cur === 'settings' && playing()) {
    meta.show('pause');
    armBack();
  } else if (cur && cur !== 'hub') {
    audio.play('ui');
    meta.show('hub');
  } else if (!cur && !playing()) meta.show('hub');
});

function playLevel(i) {
  beginMode('campaign');
  game.level = clamp(i, 0, LEVELS.length - 1);
  enterPlacement(null);
  announce();
}

function playDaily() {
  const d = dailyChallenge(profile, dateKey(new Date()), LEVELS);
  const hats = HATS.filter((h) => h.id !== 'none' && !h.supporter);
  d.hat = hats[d.seed % hats.length].id; // today's enemies dress up
  beginMode('daily');
  game.daily = d;
  enterPlacement(null);
  announce();
}

function playSandbox() {
  beginMode('sandbox');
  enterPlacement(null);
  announce();
}

function announce() {
  if (game.mode === 'campaign') {
    const L = LEVELS[game.level];
    toast(`${L.boss ? 'BOSS · ' : ''}Level ${game.level + 1}: ${L.name}`, L.tip, 2.8);
  } else if (game.mode === 'daily') {
    const d = game.daily;
    toast('Daily challenge', d.done ? `Done today (${'★'.repeat(d.done)}) · more stars still pay` : `First win today: +80 Jellybeans and +10 per star`, 2.8);
  } else toast('Sandbox', 'Tap the left side for blue, the right side for red', 2.4);
}

function resumeGame() {
  if (!playing()) return;
  audio.play('ui');
  blockInput();
  game.paused = false;
  audio.resume();
  meta.hideAll();
}

function pauseGame() {
  if (!playing()) return;
  audio.play('ui');
  game.paused = true;
  input.reset();
  meta.show('pause');
}

let pendingUpdate = null;

function goHub() {
  persist(); // trophy stats counted mid-battle
  if (pendingUpdate) {
    pendingUpdate();
    pendingUpdate = null;
    return;
  }
  blockInput();
  game.paused = false;
  input.reset();
  audio.resume();
  startAttract();
  meta.show('hub');
}

/**
 * The hub's living background: two random armies (every unit type, so new
 * players get a peek at what's ahead) fight on loop, silently.
 */
function startAttract() {
  game.mode = 'attract';
  game.paused = false;
  game.slowmo = false;
  document.body.classList.add('in-hub');
  newBattle();
  const b = game.battle;
  b.hats.red = { all: Math.random() < 0.5 ? 'viking' : 'none' };
  for (const team of ['blue', 'red']) {
    let gold = 520 + Math.random() * 180;
    const [z0, z1] = WORLD.zone[team];
    let guard = 0;
    while (gold > 40 && guard++ < 40) {
      const id = UNIT_ORDER[(Math.random() * UNIT_ORDER.length) | 0];
      const t = UNIT_TYPES[id];
      if (t.cost > gold) continue;
      gold -= t.cost;
      const ranged = t.ranged;
      const front = team === 'blue' ? z1 - 40 : z0 + 40;
      const back = team === 'blue' ? z0 + 160 : z1 - 160;
      const x = ranged ? back + (Math.random() - 0.5) * 120 : front + (back - front) * Math.random() * 0.55;
      b.addUnit(id, team, x, Math.random());
    }
  }
  for (let i = 0; i < 30; i++) b.step(DT);
  b.events.length = 0;
  b.start();
  b.events.length = 0;
  camera.follow = true;
  camera.groundTarget = 0.7;
  ui.showAttract();
}

function finishBattle(winner) {
  game.finalSlowT = 1.5;
  game.resultT = 2.1;
  const b = game.battle;
  // Confetti over the winners
  if (winner === 'blue' || winner === 'red') {
    const P = pal(winner);
    const cols = [P.body, P.light, '#ffd84a', '#ffffff'];
    for (const u of b.units) if (u.alive && u.team === winner) fx.spawn('confetti', { x: u.head.x, y: u.head.y - 30, colors: cols });
  }
  // Keep the survivors and the final victim in frame through the slow-mo
  game.finalVictim = game.lastDeath;
  camera.fast = true;
  if (game.mode === 'attract') {
    game.attractRestartT = 4.5;
    return;
  }
  const S = profile.stats;
  S.battles++;
  const won = winner === 'blue';
  if (won && game.mode !== 'sandbox') {
    S.wins++;
    if (b.units.every((u) => u.team !== 'blue' || u.alive)) S.flawless++;
    if (game.mode === 'campaign') game.reward = { kind: 'level', ...recordLevelWin(profile, game.level, game.spent, LEVELS[game.level]) };
    else game.reward = { kind: 'daily', ...recordDailyWin(profile, game.daily.key, game.spent, game.daily.level) };
    buzz([30, 60, 40]);
  }
  persist();
  meta.refresh();
}

// --- UI -------------------------------------------------------------------------------

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
    cam: $('cam'),
    sub: $('hud-sub'),
    badge: $('round-badge'),
    barB: $('bar-blue'),
    barR: $('bar-red'),
    cntB: $('count-blue'),
    cntR: $('count-red'),
    tagB: $('tag-blue'),
    mute: $('mute-btn'),
    coach: $('coach'),
  },
  last: {},
  timers: [],

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
      for (const u of b.units.slice())
        if (game.mode === 'sandbox' || u.team === 'blue') {
          fx.spawn('poof', { x: u.chest.x, y: u.chest.y, color: pal(u.team).body });
          b.removeUnit(u);
        }
      audio.play('remove');
      this.refresh();
    });
    E.slow.addEventListener('click', toggleSlow);
    E.cam.addEventListener('click', () => {
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
      audio.play('ui');
      blockInput();
      enterPlacement(game.snapshot);
      startFight();
    });
    $('edit').addEventListener('click', () => {
      audio.play('ui');
      blockInput();
      enterPlacement(game.snapshot);
    });
    $('next').addEventListener('click', () => {
      audio.play('ui');
      blockInput();
      game.level = Math.min(game.level + 1, LEVELS.length - 1);
      game.snapshot = null;
      enterPlacement(null);
      announce();
    });
    $('home').addEventListener('click', () => {
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

  /** Unit cards for the units you've unlocked (rebuilt when that or your look changes). */
  buildCards() {
    const avail = availableUnits();
    const sig = avail.join() + '|' + profile.equipped.color + '|' + JSON.stringify(profile.equipped.hats);
    if (sig === this.cardSig) return;
    this.cardSig = sig;
    const box = $('cards');
    box.innerHTML = '';
    this.cards.clear();
    avail.forEach((id, i) => {
      const t = UNIT_TYPES[id];
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'card-unit';
      el.title = `${t.name}: ${t.blurb}`;
      el.innerHTML = `<span class="key">${i + 1}</span><canvas width="112" height="112"></canvas><span class="name">${t.name}</span><span class="cost">${t.cost} gold</span>`;
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
    for (const t of this.timers) clearTimeout(t);
    this.timers.length = 0;
    this.els.dock.classList.add('hidden');
    this.els.battleCtl.classList.add('hidden');
    this.els.result.classList.add('hidden');
  },

  showAttract() {
    this.hideAllGameUI();
    this.refresh();
  },

  /** FIGHT and Reset share a corner: ignore a tap right after one replaced the other. */
  justSwapped() {
    return performance.now() - this.swapAt < 450;
  },
  swapAt: -1e9,

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
    E.battleCtl.classList.add('hidden');
    E.result.classList.remove('hidden');
    const title = $('result-title');
    const won = winner === 'blue';
    const starsEl = $('result-stars');
    const rewardEl = $('result-reward');
    const notes = $('result-notes');
    starsEl.innerHTML = '';
    rewardEl.innerHTML = '';
    notes.innerHTML = '';
    title.className = 'ribbon' + (winner === 'red' ? ' red' : winner === 'draw' ? ' draw' : '');
    let sub = '';
    const b = game.battle;
    const L = currentLevel();
    const last = game.mode === 'campaign' && game.level >= LEVELS.length - 1;
    $('next').classList.toggle('hidden', !(game.mode === 'campaign' && won && !last));
    $('edit').classList.toggle('hidden', false);
    if (game.mode === 'sandbox') {
      title.textContent = winner === 'draw' ? 'DRAW' : `${TEAMS[winner].name} WINS!`;
    } else {
      title.textContent = winner === 'draw' ? 'DRAW' : won ? 'VICTORY!' : 'DEFEAT';
      if (!won) sub = L && L.tip ? `Tip: ${L.tip}` : 'Try a different army';
    }
    if (winner !== 'draw') {
      const left = b.count(winner === 'red' ? 'red' : 'blue');
      sub += `${sub ? ' · ' : ''}${left} left standing · ${Math.round(b.battleTime)}s`;
    }
    $('result-sub').textContent = sub;

    const R = game.reward;
    if (won && R && L) {
      // Stars pop in one by one, then the Jellybeans count up
      const slots = [];
      for (let i = 0; i < 3; i++) {
        const s = document.createElement('span');
        s.className = 'rstar';
        s.textContent = '★';
        starsEl.appendChild(s);
        slots.push(s);
      }
      for (let i = 0; i < R.stars; i++)
        this.timers.push(
          setTimeout(() => {
            slots[i].classList.add('on');
            audio.play('star', { pitch: 0.3 + i * 0.35 });
            buzz(12);
          }, 450 + i * 380),
        );
      const tReward = 450 + R.stars * 380 + 150;
      if (R.beans > 0) {
        rewardEl.innerHTML = `<span class="pill beans"><i class="bean"></i><b>+0</b></span>`;
        const num = rewardEl.querySelector('b');
        const steps = Math.min(12, R.beans);
        for (let k = 1; k <= steps; k++)
          this.timers.push(
            setTimeout(() => {
              num.textContent = '+' + Math.round((R.beans * k) / steps);
              if (k % 3 === 1 || k === steps) audio.play('coin', { pitch: 0.4 + k / steps / 2 });
            }, tReward + k * 55),
          );
      }
      const add = (html, cls = '') => {
        const el = document.createElement('div');
        el.className = 'rnote ' + cls;
        el.innerHTML = html;
        notes.appendChild(el);
      };
      if (R.kind === 'level' && R.unlockedWorld >= 0) {
        const names = R.newUnits.map((id) => UNIT_TYPES[id].name).join(' & ');
        add(`🎉 New world: <b>${WORLDS[R.unlockedWorld].name}</b>${names ? ` · new units: <b>${names}</b>` : ''}`, 'big');
      }
      if (R.kind === 'level' && R.stars < 3) add(`★★★ for spending ≤ ${L.stars[2]} gold (you spent ${game.spent})`);
      if (R.kind === 'daily' && !R.first) add('Daily already won today · more stars still pay');
      if (last && R.firstClear) add('🏰 You conquered every level! Chase ★★★ or try the Sandbox.', 'big');
      if (claimable(profile)) add('🏆 Trophy ready · claim it in the menu');
      this.timers.push(setTimeout(() => notes.classList.add('show'), tReward + 400));
      notes.classList.remove('show');
    } else notes.classList.remove('show');
  },

  refresh() {
    const b = game.battle;
    const placing = b.phase === 'place';
    const remaining = this.goldLeft();
    for (const [id, el] of this.cards) {
      el.classList.toggle('selected', id === game.selected && !game.erase);
      el.classList.toggle('poor', !!currentLevel() && UNIT_TYPES[id].cost > remaining);
    }
    this.els.erase.classList.toggle('on', game.erase);
    this.els.slow.classList.toggle('on', game.slowmo);
    const ready = b.count('blue') > 0 && b.count('red') > 0;
    this.els.fight.classList.toggle('pulse', placing && ready);
    this.els.badge.textContent = game.mode === 'campaign' ? `${LEVELS[game.level].boss ? 'BOSS ' : 'LEVEL '}${game.level + 1}` : game.mode === 'daily' ? 'DAILY' : game.mode === 'sandbox' ? 'SANDBOX' : 'WOBBLE WAR';
    this.els.tagB.textContent = blueName();
  },

  goldLeft() {
    const L = currentLevel();
    if (!L) return Infinity;
    return L.budget - game.battle.cost('blue');
  },

  /** Cheap per-frame HUD: only touches the DOM when something changed. */
  tick() {
    const b = game.battle;
    const L = this.last;
    const hb = b.teamHp('blue');
    const hr = b.teamHp('red');
    const fb = hb.max ? hb.hp / hb.max : 0;
    const fr = hr.max ? hr.hp / hr.max : 0;
    const set = (k, v, fn) => {
      if (L[k] !== v) {
        L[k] = v;
        fn(v);
      }
    };
    set('fb', Math.round(fb * 200), (v) => (this.els.barB.style.transform = `scaleX(${v / 200})`));
    set('fr', Math.round(fr * 200), (v) => (this.els.barR.style.transform = `scaleX(${v / 200})`));
    set('cb', b.count('blue'), (v) => (this.els.cntB.textContent = v));
    set('cr', b.count('red'), (v) => (this.els.cntR.textContent = v));
    set('reframe', b.phase === 'place' && !camera.follow, (v) => $('reframe').classList.toggle('hidden', !v));
    let sub = '';
    const lvl = currentLevel();
    if (!playing()) sub = '';
    else if (b.phase === 'place') {
      if (lvl) {
        const spent = b.cost('blue');
        const left = lvl.budget - spent;
        const st = spent > 0 ? starsFor(spent, lvl.stars) : 3;
        sub = `<span class="gold">● ${left}</span> / ${lvl.budget} gold · <span class="stars">${'★'.repeat(st)}<i>${'★'.repeat(3 - st)}</i></span>`;
      } else sub = `Sandbox · ${b.count('blue')} vs ${b.count('red')}`;
    } else if (b.phase === 'battle') {
      const s = Math.floor(b.battleTime);
      sub = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}${game.slowmo ? ' · slow-mo' : ''}`;
    }
    set('sub', sub, (v) => (this.els.sub.innerHTML = v));
    this.coach();
  },

  /** First level: point at what to do next. */
  coach() {
    const el = this.els.coach;
    const b = game.battle;
    let step = null;
    if (game.mode === 'campaign' && game.level === 0 && !profile.tutorial && b.phase === 'place' && !game.paused) {
      const n = b.count('blue');
      if (n === 0) step = 'zone';
      else if (this.goldLeft() >= UNIT_TYPES.clubber.cost && n < 3) step = 'more';
      else step = 'fight';
    }
    if (this.last.coach !== step) {
      this.last.coach = step;
      el.classList.toggle('hidden', !step);
      el.className = 'coach' + (step ? ' c-' + step : ' hidden');
      if (step === 'zone') el.querySelector('.say').textContent = 'Tap the blue zone to place a Clubber';
      if (step === 'more') el.querySelector('.say').textContent = 'Nice! Add more while you have gold';
      if (step === 'fight') el.querySelector('.say').textContent = 'Now press FIGHT!';
    }
    if (!step) return;
    let x;
    let y;
    if (step === 'fight') {
      const r = this.els.fight.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top;
    } else {
      [x, y] = camera.toScreen((WORLD.zone.blue[0] + WORLD.zone.blue[1]) / 2 + 40, WORLD.laneDepth * 0.5);
    }
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  },

  refreshMute() {
    this.els.mute.textContent = audio.muted ? '🔇' : '🔊';
  },
};

/**
 * Draw a unit icon by settling a real unit and rendering it.
 * opts: { team, hat, palette }
 */
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
  const keep = unitsGfx.palettes[team];
  if (opts.palette) unitsGfx.palettes[team] = opts.palette;
  else if (team === 'blue') unitsGfx.palettes.blue = armyPalette(profile);
  unitsGfx.drawUnit(c, u, b, 0);
  unitsGfx.palettes[team] = keep;
}

// Preview units for the placement ghost
const ghosts = {};
function ghostUnit(typeId, team) {
  const k = typeId + team + (team === 'blue' ? profile.equipped.hats[typeId] : '');
  if (!ghosts[k]) {
    const b = new Battle(3);
    if (team === 'blue') b.hats.blue = { ...profile.equipped.hats };
    const u = b.addUnit(typeId, team, 0, 0.5, 99);
    for (let i = 0; i < 90; i++) b.step(DT);
    ghosts[k] = { b, u };
  }
  return ghosts[k];
}

function toggleSlow() {
  game.slowmo = !game.slowmo;
  audio.play('ui');
  ui.refresh();
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

// --- placement rules -------------------------------------------------------------

/** Which team may place at world x (or null). */
function teamForX(x) {
  const zb = WORLD.zone.blue;
  const zr = WORLD.zone.red;
  if (x >= zb[0] && x <= zb[1]) return 'blue';
  if (game.mode === 'sandbox' && x >= zr[0] && x <= zr[1]) return 'red';
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
    if (team === 'red' && game.mode !== 'sandbox') continue;
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
  const type = UNIT_TYPES[game.selected];
  if (!team) {
    if (game.realTime - game.zoneToastT > 1.5) {
      game.zoneToastT = game.realTime;
      if (game.mode !== 'sandbox' && wx > WORLD.zone.red[0]) toast("That's red's side", 'Place on the blue side (left)', 1.3);
      else toast('Not here', 'Place inside the dashed zone', 1.3);
    }
    return;
  }
  if (currentLevel() && type.cost > ui.goldLeft()) {
    toast('Not enough gold', `${type.name} costs ${type.cost}`, 1.3);
    audio.play('ui');
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
  const u = b.unitAt(wx, wy, (u) => game.mode === 'sandbox' || u.team === 'blue', pickSlack());
  if (!u) return;
  fx.spawn('poof', { x: u.chest.x, y: u.chest.y, color: pal(u.team).body });
  b.removeUnit(u);
  audio.play('remove', { pan: panOf(sx) });
  ui.refresh();
}

function canGrab(u) {
  const b = game.battle;
  if (game.mode === 'sandbox') return true;
  return b.phase === 'place' && u.team === 'blue';
}

// --- input -------------------------------------------------------------------------

const input = new Input(canvas, {
  blocked() {
    return game.paused || !playing() || meta.isOpen() || performance.now() < game.inputBlockUntil;
  },
  /** Is there a grabbable bean here? (The grab itself only starts once the finger moves.) */
  canGrab(sx, sy) {
    const b = game.battle;
    if (game.erase && b.phase === 'place') return false;
    const [wx, wy] = camera.toWorld(sx, sy);
    return !!b.unitAt(wx, wy, canGrab, pickSlack());
  },
  tap(sx, sy) {
    audio.unlock();
    if (game.battle.phase !== 'place') return;
    if (game.erase) tryRemove(sx, sy);
    else tryPlace(sx, sy);
  },
  alt(sx, sy) {
    tryRemove(sx, sy);
  },
  grabStart(sx, sy) {
    const b = game.battle;
    if (game.erase && b.phase === 'place') return false;
    const [wx, wy] = camera.toWorld(sx, sy);
    // Generous finger-sized target while placing; in battle only the body itself (so drags still pan)
    const slack = pickSlack();
    const hit = b.unitAt(wx, wy, null, slack);
    if (!hit) return false;
    if (!canGrab(hit)) {
      if (!game.grabNoticeShown && b.phase !== 'place') {
        game.grabNoticeShown = true;
        toast('No cheating!', 'Grabbing during battles is for Sandbox mode', 1.6);
      }
      return false;
    }
    audio.unlock();
    const u = b.grabAt(wx, wy, canGrab, slack);
    return !!u;
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
        if (profile.stats.yeets === 1) toast('YEET!', 'Trophy unlocked: claim it in the menu', 1.8);
      }
    }
  },
  pan(dx) {
    camera.pan(dx);
  },
  zoom(f, sx) {
    camera.zoomAt(f, sx);
  },
  hover(sx, sy) {
    game.hover = sx == null ? null : { sx, sy };
  },
});

window.addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const b = game.battle;
  const k = e.key.toLowerCase();
  if (meta.isOpen()) {
    if (k === 'escape') {
      const cur = meta.current();
      if (cur === 'pause') resumeGame();
      else if (cur !== 'hub') {
        audio.play('ui');
        if (playing()) meta.show('pause');
        else meta.show('hub');
      }
    }
    return;
  }
  if (!playing()) return;
  const avail = availableUnits();
  if (k >= '1' && k <= String(avail.length)) {
    game.selected = avail[+k - 1];
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
    else if (!ui.els.result.classList.contains('hidden')) $(!$('next').classList.contains('hidden') ? 'next' : 'retry').click();
  } else if (k === 's') toggleSlow();
  else if (k === 'f') camera.follow = true;
  else if (k === 'r') {
    if (b.phase !== 'place') enterPlacement(game.snapshot);
  } else if (k === 'm') toggleMute();
  else if (k === 'escape') pauseGame();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    persist(); // the app may be closed from the background
    audio.suspend();
    input.reset();
  } else audio.resume();
});
window.addEventListener('blur', () => input.reset());
window.addEventListener('pagehide', persist);
// Another copy of the game (a second tab, or the installed app) saved: adopt its
// profile instead of overwriting it with ours on our next save.
window.addEventListener('storage', (e) => {
  if (e.key !== PROFILE_KEY || e.newValue == null) return;
  replaceProfile(loadProfile(store));
  applySettings();
  ui.cardSig = '';
  if (game.battle.phase === 'place' && playing()) ui.buildCards();
  meta.refresh();
});

// --- sim events -> juice ------------------------------------------------------------

const BONK_WORDS = ['BONK!', 'POW!', 'WHAM!', 'THWACK!', 'BOINK!'];
const SPIKE_WORDS = ['POKE!', 'YOINK!', 'BOING!', 'ZING!'];
let wordI = 0;

function panOf(sx) {
  return clamp((sx / W - 0.5) * 1.6, -1, 1);
}

function soundOpts(e, extra = {}) {
  const [sx] = camera.toScreen(e.x, e.y);
  const off = Math.max(0, Math.abs(sx - W / 2) - W / 2);
  const vol = clamp(1 - off / W, 0.2, 1) * clamp(0.55 + camera.zoom * 0.4, 0.55, 1);
  const rate = timeScale();
  const o = { pan: panOf(sx), vol, rate, ...extra };
  if (e.unit) o.pitch = e.unit.voice;
  return o;
}

/** Sound for the player's battles; the hub's background battle stays silent. */
function sfx(name, o) {
  if (game.mode !== 'attract') audio.play(name, o);
}

/** Trophy bookkeeping from sim events (not for the hub's demo battle). */
function track(e) {
  if (game.mode !== 'campaign' && game.mode !== 'daily') return; // the Sandbox is for fun: both armies are yours
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
        if (u.type.id === 'brick') S.bricksDefeated++;
      }
      break;
    case 'explode': {
      S.booms++;
      const t = game.battle.time;
      T.explodes = T.explodes.filter((x) => t - x < 1);
      T.explodes.push(t);
      if (T.explodes.length >= 3 && !T.chained) {
        T.chained = true;
        S.chains++;
        toast('CHAIN REACTION!', null, 1.4);
      }
      break;
    }
    case 'block':
      if (!T.boinged && e.from && e.from.type.id === 'spiker' && u && u.team === 'blue') {
        T.boinged = true;
        S.boings++;
      }
      break;
    case 'hit':
      if (e.kind === 'arrow' && u && u.team === 'red' && u.arrows.length >= 8 && !T.pinned.has(u)) {
        T.pinned.add(u);
        S.pincushions++;
      }
      break;
  }
}

/** Enemies launched higher than a castle count as Frequent Flyers. */
function trackFlights(b) {
  if ((game.mode !== 'campaign' && game.mode !== 'daily') || b.phase !== 'battle') return;
  const T = game.track;
  for (const u of b.units) {
    if (u.team !== 'red' || T.flew.has(u) || u.held) continue;
    if (u.ground - u.hip.y > 480) {
      T.flew.add(u);
      profile.stats.highFlights++;
      if (profile.stats.highFlights === 1) fx.spawn('text', { x: u.head.x, y: u.head.y - 30, text: 'FREQUENT FLYER!', color: '#7fd3ff', size: 22 });
    }
  }
}

function handleEvents() {
  const b = game.battle;
  const demo = game.mode === 'attract';
  for (const e of b.events) {
    track(e);
    switch (e.type) {
      case 'hit': {
        const p = e.power;
        if (e.kind === 'bonk' || e.kind === 'spike') {
          fx.spawn('impact', { x: e.x, y: e.y, power: p, dirX: e.dirX, dirY: e.dirY, kind: 'bonk' });
          if (e.unit) fx.spawn('dirt', { x: e.unit.hip.x, y: e.unit.ground, power: p, dirX: e.dirX });
          sfx('bonk', soundOpts(e, { power: p }));
          shake(0.18 + p * 0.25);
          // Hit-stop for bonks that matter (kills, or near the middle of the screen); back off in mobs
          const now = game.realTime;
          game.bonkTimes = game.bonkTimes.filter((t) => now - t < 1);
          game.bonkTimes.push(now);
          const [bx] = camera.toScreen(e.x, e.y);
          const central = Math.abs(bx - W / 2) < W * 0.35;
          if (!demo && p >= 0.75 && (e.killed || central) && game.hitstopCool <= 0) {
            game.hitstop = 0.05 + Math.min(0.05, p * 0.03) + (e.killed ? 0.03 : 0);
            game.hitstopCool = game.bonkTimes.length > 2 ? 0.6 : 0.28;
            buzz(p >= 1 ? 14 : 8);
          }
          if ((e.killed || p >= 1.05) && game.realTime - game.lastWordT > 0.9) {
            game.lastWordT = game.realTime;
            const words = e.kind === 'spike' ? SPIKE_WORDS : BONK_WORDS;
            wordI = (wordI + 1 + (((e.x * 7) | 0) % 3)) % words.length;
            fx.spawn('text', { x: e.x, y: e.y - 26, text: words[wordI], color: '#ffe14d', size: 20 + p * 6 });
          }
        } else if (e.kind === 'slash') {
          fx.spawn('impact', { x: e.x, y: e.y, power: p, dirX: e.dirX, dirY: e.dirY, kind: 'slash' });
          sfx('slash', soundOpts(e, { power: p }));
          shake(0.06 + p * 0.1);
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
        sfx('drop', soundOpts(e));
        break;
      case 'hatOff':
        sfx('pop', soundOpts(e));
        break;
      case 'battleStart':
        sfx('battleStart', {});
        shake(0.15);
        break;
      case 'explode': {
        fx.spawn('explosion', { x: e.x, y: e.y, power: 1 });
        // The bomb's googly eyes go flying
        for (const s of [-1, 1]) fx.spawn('eyeball', { x: e.x + s * 4, y: e.y - 4, vx: s * (120 + Math.abs(Math.sin(e.x)) * 160), vy: -380 - Math.abs(Math.cos(e.x)) * 180, size: 5.5 });
        sfx('boom', soundOpts(e, { power: 1 }));
        shake(0.7);
        buzz(35);
        if (!demo && game.hitstopCool <= 0) {
          game.hitstop = 0.08;
          game.hitstopCool = 0.5;
        }
        // One comic word at a time (BOOM shares the timer with the bonk words)
        if (game.realTime - game.lastWordT > 0.7) {
          game.lastWordT = game.realTime;
          fx.spawn('text', { x: e.x, y: e.y - 40, text: 'BOOM!', color: '#ff9a2e', size: 32 });
        }
        break;
      }
      case 'quake':
        fx.spawn('quake', { x: e.x, y: e.y, power: 1 });
        sfx('quake', soundOpts(e, { power: 1 }));
        shake(0.45);
        buzz(22);
        if (!demo && game.hitstopCool <= 0) {
          game.hitstop = 0.05;
          game.hitstopCool = 0.4;
        }
        break;
      case 'fuse':
        sfx('fuse', soundOpts(e));
        break;
      case 'battleEnd':
        finishBattle(e.winner);
        break;
    }
  }
  b.events.length = 0;
  trackFlights(b);
}

// --- frame loop -----------------------------------------------------------------------

function timeScale() {
  let s = game.slowmo ? 0.3 : 1;
  if (game.finalSlowT > 0) s *= 0.22 + 0.78 * clamp(1 - game.finalSlowT / 1.5, 0, 1) ** 3;
  return s;
}

/** Full-screen menus hide the battlefield: skip simulating and drawing it. */
function fieldHidden() {
  const cur = meta.current();
  return cur === 'map' || cur === 'wardrobe' || cur === 'trophies' || cur === 'settings';
}

let acc = 0;
let last = performance.now();
function frame(now) {
  const realDt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  meta.tick(realDt);
  if (unitsGfx.palettes.blue !== armyPalette(profile)) applySettings(); // colour changed in the wardrobe
  if (fieldHidden()) {
    requestAnimationFrame(frame);
    return;
  }
  if (game.paused) {
    // Menu open: the battle waits underneath
    render();
    requestAnimationFrame(frame);
    return;
  }
  game.realTime += realDt;
  const b = game.battle;
  if (game.hitstopCool > 0) game.hitstopCool -= realDt;
  let simDt = 0;
  if (game.hitstop > 0) game.hitstop -= realDt;
  else {
    acc += realDt * timeScale();
    let n = 0;
    while (acc >= DT && n < 10) {
      b.step(DT);
      acc -= DT;
      simDt += DT;
      n++;
    }
    if (n === 10) acc = 0;
  }
  if (game.finalSlowT > 0) game.finalSlowT -= realDt;
  if (game.resultT > 0) {
    game.resultT -= realDt;
    if (game.resultT <= 0 && playing()) {
      ui.showResult(b.winner);
      camera.groundTarget = 0.88; // winners in the lower third, under the banner
      audio.play(game.mode === 'sandbox' || b.winner === 'blue' ? 'victory' : 'defeat', {});
    }
  }
  if (game.attractRestartT > 0) {
    game.attractRestartT -= realDt;
    if (game.attractRestartT <= 0 && game.mode === 'attract') startAttract();
  }
  handleEvents();
  // Effects keep animating through hit-stop: the starburst pops and shrinks while the bodies freeze
  fx.update(game.hitstop > 0 ? realDt * 0.6 : simDt);

  // Camera: follow the fight
  if (camera.follow && b.phase !== 'place') followFight(b);
  else if (camera.follow) framePlacement(false);
  camera.update(realDt);

  render();
  ui.tick();
  requestAnimationFrame(frame);
}

/**
 * Auto camera: frame the fight close enough to read faces. Lean toward the
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
  if (b.phase === 'over' && game.resultT <= 0 && playing()) maxZ = Math.min(maxZ, camera.h / 470);
  camera.frame(cx - span / 2, cx + span / 2, false, maxZ);
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
  for (const u of b.units) if (!u.asleep) for (const p of u.parts) add(p);
  for (const it of b.items) {
    add(it.a);
    add(it.b);
  }
  for (const a of b.arrows) {
    if (a.state !== 'fly') continue;
    lerped.push(a, a.x, a.y);
    a.x -= a.vx * DT * k;
    a.y -= a.vy * DT * k;
  }
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
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bg.drawBack(ctx, { w: W, h: H, dpr, cam: v, t: game.realTime });
  camera.apply(ctx, dpr);
  if (b.phase === 'place' && playing()) drawZones();
  fx.drawBack(ctx);
  lerpIn(b, clamp(acc / DT, 0, 1));
  unitsGfx.drawShadows(ctx, b);
  unitsGfx.drawGroundArrows(ctx, b);
  unitsGfx.drawItems(ctx, b);
  unitsGfx.drawUnits(ctx, b, b.time);
  unitsGfx.drawFlyingArrows(ctx, b);
  lerpOut();
  if (b.phase === 'place' && playing()) drawGhost();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bg.drawFront(ctx, { w: W, h: H, dpr, cam: v, t: game.realTime });
  camera.apply(ctx, dpr);
  fx.drawFront(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawZones() {
  const t = game.realTime;
  for (const team of ['blue', 'red']) {
    const [x0, x1] = WORLD.zone[team];
    const active = game.mode === 'sandbox' || team === 'blue';
    const col = pal(team).body;
    ctx.globalAlpha = active ? 0.16 : 0.07;
    ctx.fillStyle = col;
    ctx.fillRect(x0, WORLD.grassTop + 2, x1 - x0, WORLD.grassFront - WORLD.grassTop - 2);
    // Soft column so the zone reads in the air too
    const g = ctx.createLinearGradient(0, -170, 0, WORLD.grassTop);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, col);
    ctx.globalAlpha = active ? 0.1 : 0.04;
    ctx.fillStyle = g;
    ctx.fillRect(x0, -170, x1 - x0, 170 + WORLD.grassTop);
    ctx.globalAlpha = active ? 0.7 : 0.25;
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
  const ok = !!teamForX(wx) && (!currentLevel() || UNIT_TYPES[game.selected].cost <= ui.goldLeft());
  const { b: gb, u } = ghostUnit(game.selected, team);
  const lane = laneFor(wy);
  const gy = lane == null ? WORLD.laneDepth * 0.5 : lane * WORLD.laneDepth;
  ctx.save();
  ctx.globalAlpha = ok ? 0.5 : 0.22;
  ctx.translate(wx - u.hip.x, gy - u.ground);
  unitsGfx.drawUnit(ctx, u, gb, game.realTime);
  ctx.restore();
}

// --- menus ---------------------------------------------------------------------------

const meta = createMetaUI({
  profile,
  levels: LEVELS,
  persist,
  audio,
  icon: drawIcon,
  onShow(name) {
    if (name === 'hub') disarmBack();
    else armBack();
  },
  actions: {
    playLevel,
    playDaily,
    playSandbox,
    resume: resumeGame,
    restartLevel() {
      blockInput();
      game.paused = false;
      input.reset();
      audio.resume();
      meta.hideAll();
      persist();
      enterPlacement(game.snapshot);
    },
    quitToHub: goHub,
    setSetting,
    resetProgress() {
      const fresh = newProfile();
      fresh.settings = { ...profile.settings };
      replaceProfile(fresh);
      persist();
      applySettings();
      ui.cardSig = '';
      blockInput();
      input.reset();
      audio.resume();
      startAttract(); // also clears a pause (reset can be reached from the pause menu)
    },
    canInstall,
    installMethod,
    installApp: () => promptInstall(),
  },
});

// --- boot -------------------------------------------------------------------------------

ui.build();
applySettings();
resize();
startAttract();
meta.show('hub');
document.documentElement.classList.add('booted');
// Offline app + updates: a new version downloads in the background. Switch to it
// (one reload) only while in the menus, never mid-battle; otherwise on the way
// back to the menu. Progress is saved, so nothing is lost.
registerPWA({
  onUpdateReady(applyUpdate) {
    if (!playing()) applyUpdate();
    else pendingUpdate = applyUpdate;
  },
  onInstallChange() {
    meta.installChanged();
  },
});
requestAnimationFrame((t) => {
  last = t;
  frame(t);
});
