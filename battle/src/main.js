// Wobble War: boot, game flow (title -> placement -> battle -> result), input,
// turning sim events into effects / sound / camera, and the frame loop.

import { WORLD, TEAMS } from './config.js';
import { Battle, DT } from './sim/battle.js';
import { UNIT_TYPES, UNIT_ORDER } from './sim/unit-types.js';
import { Camera } from './render/camera.js';
import { UnitRenderer } from './render/units.js';
import { createBackground } from './render/background.js';
import { Effects } from './render/effects.js';
import { BattleAudio } from './audio.js';
import { Input } from './input.js';
import { ROUNDS } from './campaign.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const $ = (id) => document.getElementById(id);

// --- persistent settings ------------------------------------------------------

const SAVE_KEY = 'wobblewar.v1';
const save = { unlocked: 0, muted: false };
try {
  Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'));
} catch {
  // private mode etc.
}
function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // ignore
  }
}

// --- core objects ---------------------------------------------------------------

const canvas = $('game');
const ctx = canvas.getContext('2d');
const camera = new Camera();
const unitsGfx = new UnitRenderer();
const bg = createBackground({ seed: 7 });
const fx = new Effects({ seed: 11 });
const audio = new BattleAudio();
audio.setMuted(!!save.muted);

const game = {
  mode: null, // campaign | sandbox
  round: Math.min(save.unlocked, ROUNDS.length - 1),
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
  simDtFrame: 0,
  grabNoticeShown: false,
  lastWordT: -1,
  paused: false, // menu open over a running game
  inputBlockUntil: 0, // swallow taps that fall through from a just-closed overlay
  pickRound: 0, // campaign round chosen on the title card
  lastDeath: null,
  finalVictim: null,
  bonkTimes: [],
  zoneToastT: -9,
};
window.__ww = { game, camera, fx, audio };

let W = 1;
let H = 1;
let dpr = 1;
function resize() {
  W = Math.max(1, window.innerWidth);
  H = Math.max(1, window.innerHeight);
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
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
  camera.frame(WORLD.zone.blue[0] - 90, WORLD.zone.red[1] + 90, instant, 1.35);
}

// --- flow ---------------------------------------------------------------------------

const uiSeed = () => (Math.random() * 2 ** 31) | 0;

function newBattle() {
  fx.clear();
  game.battle = new Battle(uiSeed());
  game.resultT = -1;
  game.finalSlowT = 0;
  game.hitstop = 0;
  game.erase = false;
  game.finalVictim = null;
  game.lastDeath = null;
  camera.groundTarget = 0.74;
  camera.fast = false;
  unitsGfx.trails.clear();
}

/** Ignore canvas taps for a moment (a double-tap on a button mustn't place a bean). */
function blockInput(ms = 350) {
  game.inputBlockUntil = performance.now() + ms;
}

function enterPlacement(snapshot) {
  newBattle();
  const b = game.battle;
  if (game.mode === 'campaign') {
    const r = ROUNDS[game.round];
    r.red.forEach((s, i) => b.addUnit(s.type, 'red', s.x, (i * 0.383 + 0.2) % 1, 1000 + i));
  }
  if (snapshot) for (const s of snapshot) if (game.mode === 'sandbox' || s.team === 'blue') b.addUnit(s.type, s.team, s.x, s.lane, s.seed);
  // Let everyone settle into their stance before the player looks
  for (let i = 0; i < 30; i++) b.step(DT);
  b.events.length = 0;
  framePlacement(true);
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
  audio.unlock();
  b.start();
  game.erase = false;
  camera.follow = true;
  camera.groundTarget = 0.78;
  ui.showBattle();
}

function startMode(mode) {
  audio.unlock();
  audio.play('ui');
  blockInput();
  game.mode = mode;
  game.snapshot = null;
  game.slowmo = false;
  game.paused = false;
  audio.resume();
  $('title').classList.add('hidden');
  if (mode === 'campaign') game.round = clamp(game.pickRound, 0, unlockedRound());
  enterPlacement(null);
  announceRound();
}

/** Highest campaign round the player may pick (0-based). */
function unlockedRound() {
  return Math.min(save.unlocked, ROUNDS.length - 1);
}

function resumeGame() {
  if (!game.mode) return;
  audio.play('ui');
  blockInput();
  game.paused = false;
  audio.resume();
  $('title').classList.add('hidden');
}

function announceRound() {
  if (game.mode === 'campaign') {
    const r = ROUNDS[game.round];
    toast(`Round ${game.round + 1}: ${r.name}`, r.tip, 2.6);
  } else toast('Sandbox', 'Tap the left side for blue, the right side for red', 2.4);
}

function finishBattle(winner) {
  game.finalSlowT = 1.5;
  game.resultT = 2.1;
  const b = game.battle;
  // Confetti over the winners
  if (winner === 'blue' || winner === 'red') {
    const cols = [TEAMS[winner].body, TEAMS[winner].light, '#ffd84a', '#ffffff'];
    for (const u of b.units) if (u.alive && u.team === winner) fx.spawn('confetti', { x: u.head.x, y: u.head.y - 30, colors: cols });
  }
  if (game.mode === 'campaign' && winner === 'blue') {
    save.unlocked = Math.max(save.unlocked, Math.min(game.round + 1, ROUNDS.length - 1));
    if (game.round === ROUNDS.length - 1) save.completed = true;
    game.pickRound = Math.min(game.round + 1, ROUNDS.length - 1);
    persist();
  }
  // Keep the survivors and the final victim in frame through the slow-mo
  game.finalVictim = game.lastDeath;
  camera.fast = true;
}

// --- UI -------------------------------------------------------------------------------

const ui = {
  cards: new Map(),
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
    mute: $('mute-btn'),
  },
  last: {},

  build() {
    const box = $('cards');
    UNIT_ORDER.forEach((id, i) => {
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
      drawIcon(el.querySelector('canvas'), id);
    });
    const E = this.els;
    E.fight.addEventListener('click', startFight);
    E.erase.addEventListener('click', () => {
      game.erase = !game.erase;
      audio.play('ui');
      this.refresh();
    });
    $('clear').addEventListener('click', () => {
      const b = game.battle;
      if (b.phase !== 'place') return;
      for (const u of b.units.slice()) if (game.mode === 'sandbox' || u.team === 'blue') {
        fx.spawn('poof', { x: u.chest.x, y: u.chest.y, color: TEAMS[u.team].body });
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
      audio.play('ui');
      blockInput();
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
      game.round = Math.min(game.round + 1, ROUNDS.length - 1);
      game.snapshot = null;
      enterPlacement(null);
      announceRound();
    });
    $('play-campaign').addEventListener('click', () => startMode('campaign'));
    $('play-sandbox').addEventListener('click', () => startMode('sandbox'));
    $('resume').addEventListener('click', resumeGame);
    $('round-prev').addEventListener('click', () => {
      game.pickRound = Math.max(0, game.pickRound - 1);
      audio.play('ui');
      refreshRoundPicker();
    });
    $('round-next').addEventListener('click', () => {
      game.pickRound = Math.min(unlockedRound(), game.pickRound + 1);
      audio.play('ui');
      refreshRoundPicker();
    });
    $('reframe').addEventListener('click', () => {
      audio.play('ui');
      framePlacement(false);
    });
    $('menu-btn').addEventListener('click', () => {
      audio.play('ui');
      showTitle();
    });
    E.mute.addEventListener('click', toggleMute);
    this.refreshMute();
  },

  showPlacement() {
    this.els.dock.classList.remove('hidden');
    this.els.battleCtl.classList.add('hidden');
    this.els.result.classList.add('hidden');
    this.refresh();
  },

  showBattle() {
    this.els.dock.classList.add('hidden');
    this.els.battleCtl.classList.remove('hidden');
    this.els.result.classList.add('hidden');
    this.refresh();
  },

  showResult(winner) {
    const E = this.els;
    E.battleCtl.classList.add('hidden');
    E.result.classList.remove('hidden');
    const title = $('result-title');
    const won = winner === 'blue';
    title.className = 'ribbon' + (winner === 'red' ? ' red' : winner === 'draw' ? ' draw' : '');
    let sub = '';
    if (game.mode === 'campaign') {
      title.textContent = winner === 'draw' ? 'DRAW' : won ? 'VICTORY!' : 'DEFEAT';
      const last = game.round >= ROUNDS.length - 1;
      sub = won ? (last ? 'You beat the whole campaign! Try the Sandbox.' : `Round ${game.round + 1} cleared`) : 'Try a different army';
      $('next').classList.toggle('hidden', !won || last);
    } else {
      title.textContent = winner === 'draw' ? 'DRAW' : `${TEAMS[winner].name} WINS!`;
      $('next').classList.add('hidden');
    }
    const b = game.battle;
    const left = b.count(winner === 'red' ? 'red' : 'blue');
    if (winner !== 'draw') sub += `${sub ? ' · ' : ''}${left} left standing · ${Math.round(b.battleTime)}s`;
    $('result-sub').textContent = sub;
  },

  refresh() {
    const b = game.battle;
    const placing = b.phase === 'place';
    const remaining = this.goldLeft();
    for (const [id, el] of this.cards) {
      el.classList.toggle('selected', id === game.selected && !game.erase);
      el.classList.toggle('poor', game.mode === 'campaign' && UNIT_TYPES[id].cost > remaining);
    }
    this.els.erase.classList.toggle('on', game.erase);
    this.els.slow.classList.toggle('on', game.slowmo);
    const ready = b.count('blue') > 0 && b.count('red') > 0;
    this.els.fight.classList.toggle('pulse', placing && ready);
    this.els.badge.textContent = game.mode === 'campaign' ? `ROUND ${game.round + 1}` : game.mode === 'sandbox' ? 'SANDBOX' : 'WOBBLE WAR';
  },

  goldLeft() {
    if (game.mode !== 'campaign') return Infinity;
    return ROUNDS[game.round].budget - game.battle.cost('blue');
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
    if (!game.mode) sub = '';
    else if (b.phase === 'place') {
      if (game.mode === 'campaign') {
        const left = this.goldLeft();
        const r = ROUNDS[game.round];
        sub = `<span class="gold">● ${left}</span> / ${r.budget} gold · ${r.name}`;
      } else sub = `Sandbox · ${b.count('blue')} vs ${b.count('red')}`;
    } else if (b.phase === 'battle') {
      const s = Math.floor(b.battleTime);
      sub = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}${game.slowmo ? ' · slow-mo' : ''}`;
    }
    set('sub', sub, (v) => (this.els.sub.innerHTML = v));
  },

  refreshMute() {
    this.els.mute.textContent = audio.muted ? '🔇' : '🔊';
  },
};

/** Draw a unit card icon by settling a real unit and rendering it. */
function drawIcon(cv, typeId) {
  const b = new Battle(5);
  const u = b.addUnit(typeId, 'blue', 0, 0, 77);
  for (let i = 0; i < 90; i++) b.step(DT);
  const c = cv.getContext('2d');
  const s = cv.width / 80;
  c.setTransform(s, 0, 0, s, cv.width / 2 - u.hip.x * s + 4 * s, cv.height - 8 * s);
  unitsGfx.drawUnit(c, u, b, 0);
}

// Preview units for the placement ghost
const ghosts = {};
function ghostUnit(typeId, team) {
  const k = typeId + team;
  if (!ghosts[k]) {
    const b = new Battle(3);
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
  audio.setMuted(!audio.muted);
  save.muted = audio.muted;
  persist();
  ui.refreshMute();
}

let toastTimer = 0;
function toast(big, small, secs = 2) {
  const el = $('toast');
  el.innerHTML = `<div class="big">${big}</div>${small ? `<div class="small">${small}</div>` : ''}`;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), secs * 1000);
}

function showTitle() {
  if (game.mode) {
    game.paused = true;
    audio.suspend();
    input.reset();
  }
  $('resume').classList.toggle('hidden', !game.mode);
  game.pickRound = clamp(game.pickRound, 0, unlockedRound());
  refreshRoundPicker();
  $('title').classList.remove('hidden');
}

function refreshRoundPicker() {
  const top = unlockedRound();
  $('campaign-progress').textContent = save.completed && game.pickRound === top ? `Complete! Replay round ${game.pickRound + 1}` : `Round ${game.pickRound + 1} of ${ROUNDS.length}`;
  $('round-picker').classList.toggle('hidden', top === 0);
  $('round-prev').disabled = game.pickRound <= 0;
  $('round-next').disabled = game.pickRound >= top;
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
      if (game.mode === 'campaign' && wx > WORLD.zone.red[0]) toast('That\'s red\'s side', 'Place on the blue side (left)', 1.3);
      else toast('Not here', 'Place inside the dashed zone', 1.3);
    }
    return;
  }
  if (game.mode === 'campaign' && type.cost > ui.goldLeft()) {
    toast('Not enough gold', `${type.name} costs ${type.cost}`, 1.3);
    audio.play('ui');
    return;
  }
  if (b.count(team, false) >= 60) {
    toast('That\'s a lot of beans', 'Max 60 per side', 1.3);
    return;
  }
  const u = b.addUnit(game.selected, team, wx, laneFor(wy));
  // Drop in from a little height: a tiny landing wobble
  for (const p of u.parts) p.teleport(0, -26);
  fx.spawn('poof', { x: u.chest.x, y: u.chest.y + 10, color: TEAMS[team].body });
  audio.play('place', { pitch: u.voice, pan: panOf(sx) });
  ui.refresh();
}

function tryRemove(sx, sy) {
  const b = game.battle;
  if (b.phase !== 'place') return;
  const [wx, wy] = camera.toWorld(sx, sy);
  const u = b.unitAt(wx, wy, (u) => game.mode === 'sandbox' || u.team === 'blue', pickSlack());
  if (!u) return;
  fx.spawn('poof', { x: u.chest.x, y: u.chest.y, color: TEAMS[u.team].body });
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
    return game.paused || performance.now() < game.inputBlockUntil;
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
    game.battle.release(); // a bean dropped outside its zone waddles back in by itself
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
  if (!$('title').classList.contains('hidden')) {
    if (k === 'escape') resumeGame();
    else if ((k === 'enter' || k === ' ') && document.activeElement && document.activeElement.tagName === 'BUTTON') return; // the button handles it
    else if (k === 'enter' || k === ' ') {
      e.preventDefault();
      if (game.mode) resumeGame();
      else startMode('campaign');
    }
    return;
  }
  if (k >= '1' && k <= '3') {
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
    else if (!ui.els.result.classList.contains('hidden')) $(game.mode === 'campaign' && b.winner === 'blue' && !$('next').classList.contains('hidden') ? 'next' : 'retry').click();
  } else if (k === 's') toggleSlow();
  else if (k === 'f') camera.follow = true;
  else if (k === 'r') {
    if (b.phase !== 'place') enterPlacement(game.snapshot);
  } else if (k === 'm') toggleMute();
  else if (k === 'escape') showTitle();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audio.suspend();
    input.reset();
  } else audio.resume();
});
window.addEventListener('blur', () => input.reset());

// --- sim events -> juice ------------------------------------------------------------

const BONK_WORDS = ['BONK!', 'POW!', 'WHAM!', 'THWACK!', 'BOINK!'];
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

function handleEvents() {
  const b = game.battle;
  for (const e of b.events) {
    switch (e.type) {
      case 'hit': {
        const p = e.power;
        if (e.kind === 'bonk') {
          fx.spawn('impact', { x: e.x, y: e.y, power: p, dirX: e.dirX, dirY: e.dirY, kind: 'bonk' });
          if (e.unit) fx.spawn('dirt', { x: e.unit.hip.x, y: e.unit.ground, power: p, dirX: e.dirX });
          audio.play('bonk', soundOpts(e, { power: p }));
          camera.shake(0.18 + p * 0.25);
          // Hit-stop for bonks that matter (kills, or near the middle of the screen); back off in mobs
          const now = game.realTime;
          game.bonkTimes = game.bonkTimes.filter((t) => now - t < 1);
          game.bonkTimes.push(now);
          const [bx] = camera.toScreen(e.x, e.y);
          const central = Math.abs(bx - W / 2) < W * 0.35;
          if (p >= 0.75 && (e.killed || central) && game.hitstopCool <= 0) {
            game.hitstop = 0.05 + Math.min(0.05, p * 0.03) + (e.killed ? 0.03 : 0);
            game.hitstopCool = game.bonkTimes.length > 2 ? 0.6 : 0.28;
          }
          if ((e.killed || p >= 1.05) && game.realTime - game.lastWordT > 0.9) {
            game.lastWordT = game.realTime;
            wordI = (wordI + 1 + ((e.x * 7) | 0) % 3) % BONK_WORDS.length;
            fx.spawn('text', { x: e.x, y: e.y - 26, text: BONK_WORDS[wordI], color: '#ffe14d', size: 20 + p * 6 });
          }
        } else if (e.kind === 'slash') {
          fx.spawn('impact', { x: e.x, y: e.y, power: p, dirX: e.dirX, dirY: e.dirY, kind: 'slash' });
          audio.play('slash', soundOpts(e, { power: p }));
          camera.shake(0.06 + p * 0.1);
        } else {
          fx.spawn('impact', { x: e.x, y: e.y, power: 0.4, dirX: e.dirX, dirY: e.dirY, kind: 'arrow' });
          audio.play('arrowBody', soundOpts(e));
        }
        break;
      }
      case 'block':
        fx.spawn('block', { x: e.x, y: e.y, power: e.power, dirX: e.dirX, dirY: e.dirY });
        audio.play(e.kind === 'arrow' ? 'arrowShield' : 'clank', soundOpts(e, { power: e.power }));
        if (e.kind !== 'arrow') camera.shake(0.06);
        break;
      case 'whoosh':
        audio.play('whoosh', soundOpts(e, { power: e.power }));
        break;
      case 'grunt':
        audio.play('grunt', soundOpts(e));
        break;
      case 'bowDraw':
        audio.play('bowDraw', soundOpts(e));
        break;
      case 'bowRelease':
        audio.play('bowRelease', soundOpts(e));
        break;
      case 'arrowGround':
        fx.spawn('arrowGround', { x: e.x, y: e.y, dirX: e.dirX });
        audio.play('arrowGround', soundOpts(e));
        break;
      case 'step':
        if (e.power > 0.35 && ((e.x * 13) | 0) % 3 === 0) fx.spawn('dust', { x: e.x, y: e.y, power: 0.25 * e.power, dirX: -(e.unit ? e.unit.f : 0) });
        if (camera.zoom > 0.8) audio.play('step', soundOpts(e, { power: e.power }));
        break;
      case 'land':
        fx.spawn('land', { x: e.x, y: e.y, power: e.power });
        if (e.power > 0.5) fx.spawn('dirt', { x: e.x, y: e.y, power: e.power * 0.6, dirX: 0 });
        audio.play('land', soundOpts(e, { power: e.power }));
        camera.shake(e.power * 0.12);
        break;
      case 'scream':
        audio.play('scream', soundOpts(e));
        break;
      case 'hitVoice':
        audio.play('hitVoice', soundOpts(e, { power: e.power }));
        break;
      case 'death':
        game.lastDeath = e.unit;
        audio.play('death', soundOpts(e));
        break;
      case 'dizzy':
        fx.spawn('stars', { x: e.x, y: e.y });
        break;
      case 'cheer':
        audio.play('cheer', soundOpts(e));
        break;
      case 'grab':
        audio.play('grab', soundOpts(e));
        break;
      case 'drop':
        audio.play('drop', soundOpts(e));
        break;
      case 'battleStart':
        audio.play('battleStart', {});
        camera.shake(0.15);
        break;
      case 'battleEnd':
        finishBattle(e.winner);
        break;
    }
  }
  b.events.length = 0;
}

// --- frame loop -----------------------------------------------------------------------

function timeScale() {
  let s = game.slowmo ? 0.3 : 1;
  if (game.finalSlowT > 0) s *= 0.22 + 0.78 * clamp(1 - game.finalSlowT / 1.5, 0, 1) ** 3;
  return s;
}

let acc = 0;
let last = performance.now();
function frame(now) {
  const realDt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (game.paused) {
    // Menu open: the battle waits underneath
    render();
    requestAnimationFrame(frame);
    return;
  }
  game.realTime += realDt;
  const b = game.battle;
  let simDt = 0;
  if (game.hitstopCool > 0) game.hitstopCool -= realDt;
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
    if (game.resultT <= 0) {
      ui.showResult(b.winner);
      camera.groundTarget = 0.88; // winners in the lower third, under the banner
      audio.play(game.mode === 'sandbox' || b.winner === 'blue' ? 'victory' : 'defeat', {});
    }
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
  if (b.phase === 'over' && game.resultT <= 0) maxZ = Math.min(maxZ, camera.h / 470);
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
  if (b.phase === 'place') drawZones();
  fx.drawBack(ctx);
  lerpIn(b, clamp(acc / DT, 0, 1));
  unitsGfx.drawShadows(ctx, b);
  unitsGfx.drawGroundArrows(ctx, b);
  unitsGfx.drawItems(ctx, b);
  unitsGfx.drawUnits(ctx, b, b.time);
  unitsGfx.drawFlyingArrows(ctx, b);
  lerpOut();
  if (b.phase === 'place') drawGhost();
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
    const col = TEAMS[team].body;
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
  const ok = !!teamForX(wx) && (game.mode !== 'campaign' || UNIT_TYPES[game.selected].cost <= ui.goldLeft());
  const { b: gb, u } = ghostUnit(game.selected, team);
  const lane = laneFor(wy);
  const gy = lane == null ? WORLD.laneDepth * 0.5 : lane * WORLD.laneDepth;
  ctx.save();
  ctx.globalAlpha = ok ? 0.5 : 0.22;
  ctx.translate(wx - u.hip.x, gy - u.ground);
  unitsGfx.drawUnit(ctx, u, gb, game.realTime);
  ctx.restore();
}

// --- boot -------------------------------------------------------------------------------

ui.build();
resize();
enterPlacement(null);
showTitle();
document.documentElement.classList.add('booted');
requestAnimationFrame((t) => {
  last = t;
  frame(t);
});
