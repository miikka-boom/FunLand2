// Boot, resize/safe-area handling, screens and the frame loop.

import { loadSettings, saveSettings, worldSignature } from './settings.js';
import { computeLayout } from './layout.js';
import { Input } from './input/input.js';
import { Game } from './game/game.js';
import { Renderer } from './render/renderer.js';
import { Audio } from './audio.js';
import { SettingsPanel } from './settings-panel.js';
import { clamp } from './util.js';

const settings = loadSettings();
const canvas = document.getElementById('game');
const titleEl = document.getElementById('title');
const startBtn = document.getElementById('start');
const panelEl = document.getElementById('panel');
const probe = document.getElementById('safe-probe');

const audio = new Audio();
audio.setVolume(settings.volume);
const haptics = (ms) => {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    // unsupported
  }
};

const renderer = new Renderer(canvas);
const game = new Game(settings, audio, haptics);
const safe = { l: 0, r: 0, t: 0, b: 0 };
let layout = computeLayout(innerWidth, innerHeight, safe, settings);
const input = new Input(canvas, settings, () => layout);

let state = 'title'; // title | play | paused
const ui = { layout, fps: 60, frameMs: 16, hintAlpha: 1, input, forceSticks: false };

function readSafe() {
  const cs = getComputedStyle(probe);
  safe.t = parseFloat(cs.paddingTop) || 0;
  safe.r = parseFloat(cs.paddingRight) || 0;
  safe.b = parseFloat(cs.paddingBottom) || 0;
  safe.l = parseFloat(cs.paddingLeft) || 0;
}

function relayout() {
  const w = Math.max(1, Math.round(window.innerWidth));
  const h = Math.max(1, Math.round(window.innerHeight));
  readSafe();
  renderer.resize(w, h);
  game.setViewport(w, h);
  layout = computeLayout(w, h, safe, settings);
  ui.layout = layout;
}
relayout();
let resizeTimer = 0;
const onResize = () => {
  relayout();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(relayout, 300); // iOS reports final sizes late
};
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => {
  input.reset();
  onResize();
});
if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

// --- Fullscreen (Android/desktop; iOS uses Add to Home Screen) -----------------------

const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
function enterFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    })
    .catch(() => {});
}

// --- Screens -------------------------------------------------------------------------------

const panel = new SettingsPanel(panelEl, settings, {
  onClose: () => resume(),
  onChange: (key) => {
    const all = key === '*'; // presets / reset all
    if (key === 'volume' || all) audio.setVolume(settings.volume);
    // Level / world switches regenerate the map (only if something really changed).
    if (game.worldSig !== worldSignature(settings)) game.newRun(settings.seed);
    if (key === 'level' || all) syncLevelPicker();
    if (key === 'ally' || key === 'allyWeapon' || all) game.syncAlly();
    layout = computeLayout(layout.w, layout.h, safe, settings);
    ui.layout = layout;
  },
  onCallHorde: () => {
    resume();
    game.director.forceMob();
  },
  onSpawnHunter: () => {
    resume();
    game.director.forceHunter();
  },
  onSpawnTank: () => {
    resume();
    game.director.forceTank();
  },
  onRestart: () => {
    game.newRun(settings.seed);
    resume();
  },
  onNewMap: () => {
    settings.seed = (Math.random() * 1e9) | 0;
    saveSettings(settings);
    game.newRun(settings.seed);
    resume();
  },
  onFullscreen: () => enterFullscreen(),
});

function start() {
  if (state !== 'title') return;
  audio.unlock();
  if (isTouch) enterFullscreen();
  titleEl.classList.add('hidden');
  state = 'play';
  input.reset();
  last = performance.now();
}

function pause() {
  if (state !== 'play') return;
  audio.suspend(); // Tank theme etc. freeze with the game; Resume unlocks again
  state = 'paused';
  input.reset();
  input.touch.enabled = false;
  panel.open();
}

function resume() {
  panel.close();
  input.reset();
  input.touch.enabled = true;
  audio.unlock();
  state = 'play';
  last = performance.now();
}

startBtn.addEventListener('click', start);

// Title-card level picker (doesn't start the game; the background shows the choice).
const levelButtons = [...document.querySelectorAll('[data-level]')];
function syncLevelPicker() {
  for (const b of levelButtons) b.classList.toggle('active', b.dataset.level === settings.level);
}
for (const b of levelButtons) {
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (settings.level === b.dataset.level) return;
    settings.level = b.dataset.level;
    saveSettings(settings);
    game.newRun(settings.seed);
    syncLevelPicker();
  });
}
syncLevelPicker();
// "Tap to start" means anywhere on the card, not just the button.
titleEl.addEventListener('click', () => {
  if (state === 'title') start();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause();
    audio.suspend();
  } else if (state === 'play' || state === 'title') audio.resume();
});
window.addEventListener('blur', () => input.reset());
// iOS Safari: block pinch-zoom gesture events outright.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());

// Re-unlock audio on later interactions (pad-started runs, iOS interruptions).
const kickAudio = () => {
  if (state !== 'title' && (!audio.ctx || audio.ctx.state !== 'running')) audio.unlock();
};
canvas.addEventListener('touchend', kickAudio, { passive: true });
canvas.addEventListener('mousedown', kickAudio);
window.addEventListener('keydown', kickAudio);

// Tap anywhere to play again after an ending.
let restartQueued = false;
const maybeRestart = () => {
  if (state === 'play' && (game.won || game.lost) && game.endT > 1.4) restartQueued = true;
};
canvas.addEventListener('touchstart', maybeRestart, { passive: true });
canvas.addEventListener('mousedown', maybeRestart);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' || e.code === 'Space') {
    if (state === 'title') start();
    else maybeRestart();
  }
});

// --- Frame loop ----------------------------------------------------------------------------

let last = performance.now();
const STEP = 1 / 60;

function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(Math.max(raw, 0), 0.1);
  if (raw > 0) {
    ui.fps += (1 / Math.max(raw, 1e-3) - ui.fps) * 0.05;
    ui.frameMs += (raw * 1000 - ui.frameMs) * 0.05;
  }

  const f = input.sample();
  const padPress = input.source === 'gamepad' && f.events.length > 0;
  if (state === 'title') {
    if (padPress) start(); // sound unlocks on the next tap/click (pads aren't a user gesture)
    f.events = [];
  } else if (f.events.includes('pause')) {
    if (state === 'play') pause();
    else if (state === 'paused') resume();
  }
  if (padPress) maybeRestart();

  if (state === 'play') {
    if (restartQueued) {
      restartQueued = false;
      game.newRun(settings.seed);
      input.reset();
    }
    // Fixed-ish substeps keep collisions stable on slow frames; input events
    // are applied once, on the first substep.
    let remaining = dt;
    let first = true;
    while (remaining > 1e-6) {
      const h = Math.min(STEP, remaining);
      if (!first) f.events = [];
      game.update(h, f);
      first = false;
      remaining -= h;
    }
  }

  audio.listener.x = game.player.x;
  audio.listener.y = game.player.y;
  ui.hintAlpha = state === 'title' ? 1 : clamp(1 - (game.stats.time - 10) / 8, 0, 1);
  ui.forceSticks = state === 'title' && isTouch;
  ui.title = state === 'title';
  renderer.render(game, input, ui);
}
requestAnimationFrame(frame);

// Handy for tuning sessions and automated smoke tests.
window.__p0 = { game, settings, input, renderer, start, pause, resume };
document.documentElement.classList.add('booted');
