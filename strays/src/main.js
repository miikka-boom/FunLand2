// Strays: boot. Loads the save, builds the toy, runs the loop.

import { Game, SEC, MIN } from './rules.js';
import { Clock } from './clock.js';
import { loadState, saveState, clearState, loadTuning, saveTuning, migrate } from './save.js';
import { Lcd, LCD_W, LCD_H } from './lcd.js';
import { Block, roomBox, GEO } from './block.js';
import { Sfx } from './audio.js';
import { Dev } from './dev.js';
import { SAY } from './words.js';

const params = new URLSearchParams(location.search);
const tuning = loadTuning();
const clock = new Clock();

// ?fresh starts a new block without touching the save until something happens;
// ?seed=7 makes that block the same every time (for the walkthrough scripts).
let state = params.has('fresh') ? null : loadState(Date.now());
if (state) clock.offset = state.clockOffset || 0;
const isNew = !state;
const seed = params.has('seed') ? Number(params.get('seed')) >>> 0 : (Math.random() * 0x100000000) >>> 0;
const game = state ? new Game(state, { clock, tuning }) : Game.start(seed, { clock, tuning });

const canvas = document.getElementById('lcd');
const lcd = new Lcd(canvas);
const sfx = new Sfx(tuning);

let leaving = false; // set by reset/load: the old block must not be saved over the new one
function save() {
  if (leaving) return;
  game.s.clockOffset = clock.offset;
  saveState(game.s);
}

const block = new Block({ game, lcd, sfx, tuning, save });
if (params.has('fast')) block.rate = Number(params.get('fast')) || 6;

// ------------------------------------------------------------------ layout

const toy = document.getElementById('toy');
function layout() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  const bezel = 16;
  let side;
  if (vw >= 1000 && vh >= 600) {
    // A big screen: the toy lies on the table, wrapped snugly around its screen.
    side = 132;
    const lip = 52;
    const css = lcd.fit(Math.min(vw - 80, 1340) - 2 * side - bezel, Math.min(vh - 80, 760) - 2 * lip - bezel, dpr);
    toy.style.width = `${Math.round(LCD_W * css + bezel + 2 * side)}px`;
    toy.style.height = `${Math.round(LCD_H * css + bezel + 2 * lip)}px`;
  } else {
    // A phone: the toy is the whole screen.
    toy.style.width = '';
    toy.style.height = '';
    const r = toy.getBoundingClientRect();
    const minSide = r.width < 720 ? 56 : 84;
    const css = lcd.fit(r.width - 2 * minSide - bezel, r.height - 20 - bezel, dpr);
    side = (r.width - (LCD_W * css + bezel)) / 2;
    // Held upright on something tall (a tablet): don't stretch into a slab.
    const snug = LCD_H * css + bezel + 96;
    if (vh > snug + 60) toy.style.height = `${Math.round(snug)}px`;
  }
  toy.style.setProperty('--side', `${Math.round(side)}px`);
  toy.classList.toggle('toy-narrow', side < 84);
}
layout();
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 200));

// ------------------------------------------------------------------- input

let down = false;
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  sfx.unlock();
  down = true;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* a synthetic pointer: fine */
  }
  const p = lcd.toLcd(e.clientX, e.clientY);
  block.tap(p.x, p.y);
});
canvas.addEventListener('pointermove', (e) => {
  if (!down) return;
  const p = lcd.toLcd(e.clientX, e.clientY);
  block.swipe(p.x, p.y);
});
const up = () => {
  down = false;
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
// Some phones only allow sound from the end of a touch.
for (const type of ['pointerup', 'touchend', 'click']) document.addEventListener(type, () => sfx.unlock(), { passive: true });

function key(el, name) {
  const act = () => {
    sfx.unlock();
    sfx.play('key');
    block.press(name);
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.classList.add('is-down');
    act();
  });
  const release = () => el.classList.remove('is-down');
  el.addEventListener('pointerup', release);
  el.addEventListener('pointerleave', release);
  el.addEventListener('pointercancel', release);
  // A click with no pointer behind it came from the keyboard.
  el.addEventListener('click', (e) => {
    if (e.detail === 0) act();
  });
}
const goKey = document.getElementById('key-go');
const bookKey = document.getElementById('key-book');
key(goKey, 'go');
key(bookKey, 'book');

const soundKey = document.getElementById('key-sound');
function showSound() {
  soundKey.setAttribute('aria-pressed', tuning.sound ? 'true' : 'false');
}
soundKey.addEventListener('click', () => {
  tuning.sound = !tuning.sound;
  saveTuning(tuning);
  showSound();
  sfx.unlock();
  sfx.play('boot');
});
showSound();

const dev = new Dev(document.getElementById('dev'), {
  game,
  clock,
  tuning,
  block,
  sfx,
  save,
  saveTuning: () => saveTuning(tuning),
  reset: () => {
    leaving = true;
    clearState();
    location.href = location.pathname;
  },
  load: (text) => {
    const next = migrate(JSON.parse(text), Date.now());
    if (!next) throw new Error('not a Strays save');
    leaving = true;
    saveState(next);
    location.href = location.pathname;
  },
});
document.getElementById('key-test').addEventListener('click', () => dev.toggle());

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.key === '`' || e.key === '§') dev.toggle();
  else if (e.key === 'Escape' && dev.open) dev.toggle();
  else if (e.key === ' ' || e.key === 'g' || e.key === 'G') {
    if (e.key === ' ' && document.activeElement && document.activeElement.tagName === 'BUTTON') return;
    e.preventDefault();
    sfx.unlock();
    block.press('go');
  } else if (e.key === 'Enter') {
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
    e.preventDefault();
    sfx.unlock();
    block.tapCursor();
  } else if (e.key.startsWith('Arrow')) {
    e.preventDefault();
    block.moveCursor(e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0, e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0);
  } else if (e.key === 'z' || e.key === 'Z') {
    sfx.unlock();
    block.tap(140, 70);
  } else if (e.key === 'b' || e.key === 'B') {
    sfx.unlock();
    block.press('book');
  } else if (e.key === 'm' || e.key === 'M') soundKey.click();
});

// -------------------------------------------------------------------- loop

const lamp = document.getElementById('lamp');
const live = document.getElementById('live');
let last = performance.now();
let raf = 0;
let lastLine = '';
let lastTitle = '';
function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(60, now - last);
  last = now;
  block.update(dt);
  block.draw();
  lcd.present();
  // The lamp on the shell, the tab title and the key that pulses.
  const want = block.started && !block.modal ? block.attention : 0;
  lamp.classList.toggle('is-on', want > 0);
  const title = want > 0 ? `(${want}) Strays` : 'Strays';
  if (title !== lastTitle) document.title = lastTitle = title;
  goKey.classList.toggle('is-hint', block.started && !block.modal && !block.lock && !block.pick && game.advice().do === 'go');
  const text = block.line.text;
  if (text !== lastLine && block.line.n >= text.length) {
    lastLine = text;
    live.textContent = text.replace(/¢/g, ' cans').replace(/♥/g, ' hearts').replace(/[★☆]/g, '*');
  }
}

function start() {
  if (raf) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}
function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
}

/** Back after a while: say what has been waiting. */
function comeBack(awayMs) {
  if (awayMs < 30 * SEC || !block.started || block.modal || block.lock) return;
  game.tick();
  block.syncActors(true);
  const n = block.attention;
  const z = game.s.zombies;
  if (n > 0) block.say(SAY.back(n), { ms: 3500 });
  else if (z > 0) block.say(SAY.backZombies(), { ms: 3500 });
  else block.say(SAY.backCosy(), { ms: 2500 });
  if (n > 0) sfx.play('chirp');
}

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    save();
    stop();
  } else {
    start();
    if (hiddenAt) comeBack(Date.now() - hiddenAt);
    hiddenAt = 0;
  }
});
window.addEventListener('pagehide', save);
setInterval(() => {
  if (document.visibilityState === 'visible') save();
}, 10 * SEC);

// -------------------------------------------------------------------- boot

async function boot() {
  start();
  document.documentElement.classList.add('booted');
  if (isNew && !params.has('notitle')) await block.showTitle();
  block.started = true;
  if (isNew) {
    block.say(SAY.start(), { ms: 3000 });
  } else {
    const away = Date.now() + clock.offset - (game.s.savedAt || 0);
    void away;
    comeBack(MIN);
  }
}
boot();

// For the walkthrough scripts and for poking at it from the console.
window.__strays = {
  game,
  block,
  clock,
  tuning,
  lcd,
  dev,
  sfx,
  save,
  /** Where a room's middle is on the page (CSS pixels). */
  roomPoint(i) {
    const b = roomBox(i);
    return this.point(b.x + b.w / 2, b.y + b.h / 2);
  },
  /** An LCD pixel as a point on the page. */
  point(x, y) {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (x / LCD_W) * r.width, y: r.top + (y / LCD_H) * r.height };
  },
  fencePoint() {
    return this.point(GEO.fenceX + 10, GEO.ground - 8);
  },
  doorPoint() {
    return this.point(7, GEO.ground - 8);
  },
  /** Is the toy idle (no scene playing)? */
  idle() {
    return block.started && !block.modal && !block.lock && !block.busy.size && !block.parts.length;
  },
};
