// The trailer: boot, the film (which shot is on at a given moment), playback and capture.
//
//   trailer/              plays it live in the browser (click to start: sound needs a tap)
//   trailer/?capture=1    is filmed by trailer/tools/render.mjs: frame by frame on the film
//                         clock (window.__trailer), the sound rendered offline in sync
//
// Everything on screen is the game itself (src/render/renderer.js, HUD off) running scripted
// shots (shots.js); the titles, letterbox and grade go on top (titles.js).

import { clock, wallNow } from './clock.js'; // first: seeds Math.random and takes over performance.now
import { Renderer } from '../../src/render/renderer.js';
import { Scene } from '../../src/render/scene3d.js';
import { readScene } from '../../src/game/soundscape.js';
import { Take } from './stage.js';
import { FILM, DURATION, SFX, CUT } from './shots.js';
import { Titles } from './titles.js';
import { makeSound } from './score.js';

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');
const FPS = Number(params.get('fps')) || 30;
const canvas = document.getElementById('film');
const status = document.getElementById('status');
const playBtn = document.getElementById('play');
if (CUT !== 'full') {
  // The short cut carries no logo and no title.
  document.title = `Trailer · ${Math.round(DURATION)} s`;
  playBtn.querySelector('img').remove();
}

// --- Viewport: 16:9, as big as fits (capture: exactly the window) -------------------------------

const view = { w: 1280, h: 720 };
function fit() {
  const W = Math.max(1, innerWidth);
  const H = Math.max(1, innerHeight);
  const k = Math.min(W / 16, H / 9);
  view.w = CAPTURE ? W : Math.floor(16 * k);
  view.h = CAPTURE ? H : Math.floor(9 * k);
  renderer.resize(view.w, view.h);
  if (film.take) film.take.game.setViewport(view.w, view.h);
}

const renderer = new Renderer(canvas);
renderer.drawXray = () => {}; // (the see-through outlines are for playing, not for film)
const titles = new Titles();
const ui = { layout: null, fps: 60, frameMs: 16, hintAlpha: 0, input: null, forceSticks: false, title: false, hud: false };
const noInput = { touch: { move: { active: false }, aim: { active: false } }, source: 'gamepad' };

// --- The film -------------------------------------------------------------------------------------

const film = {
  sound: null,
  take: null,
  shotI: -1,
  ready: null, // live: every shot built ahead (no stall at a cut), by index
  scene: undefined,
  lastT: 0,
  sfxI: 0,
  sfxT: -1,

  shotAt(T) {
    for (let i = FILM.length - 1; i >= 0; i--) if (T >= FILM[i].at - 1e-9) return i;
    return 0;
  },

  /** Bring the film to time T (seconds): the right shot, simulated up to T. */
  advance(T) {
    // Sounds that belong to the film rather than a shot (the logo's slam, a whistle in the dark).
    if (T < this.sfxT) this.sfxI = SFX.findIndex((c) => c.at >= T - 1e-9);
    if (this.sfxI < 0) this.sfxI = SFX.length;
    while (this.sound && this.sfxI < SFX.length && SFX[this.sfxI].at <= T + 1e-9) {
      clock.t = SFX[this.sfxI].at;
      SFX[this.sfxI].run(this.sound.audio);
      this.sfxI++;
    }
    this.sfxT = T;
    const i = this.shotAt(T);
    const shot = FILM[i];
    if (i !== this.shotI || (this.take && T < shot.at + this.take.lt - 1e-6)) {
      this.shotI = i;
      this.take = null;
      clock.t = shot.at;
      if (this.ready && this.ready[i]) {
        this.take = this.ready[i];
        this.ready[i] = null;
        renderer.scene = this.take.scene;
      } else if (!shot.black) this.take = new Take(shot, i, this.sound ? this.sound.audio : null, view);
    }
    if (this.take) {
      this.take.advanceTo(T - shot.at, shot.at);
      this.take.game.setViewport(view.w, view.h);
    }
    clock.t = T;
  },

  /** Draw the frame at time T (after advance). */
  draw(T) {
    const ctx = renderer.ctx;
    const take = this.take;
    if (take) {
      renderer.render(take.game, noInput, ui);
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);
    titles.draw(ctx, view.w, view.h, T, take);
  },

  /** The game's sound follows the camera (and goes quiet on black: no world, no crowd, no air). */
  listen(T) {
    const S = this.sound;
    const take = this.take;
    if (!S) return;
    if (!take) {
      const a = S.audio;
      const dt = Math.max(0, Math.min(0.1, T - this.lastT));
      this.lastT = T;
      if (!this.scene) return;
      a.wantBeds = [];
      this.quiet = this.quiet || { emitters: [], horde: { voices: 0, feet: 0, x: 0, y: 0 } };
      Object.assign(this.quiet, { screen: 'black', run: this.scene.run, level: this.scene.level, x: a.listener.x, y: a.listener.y, dead: false, won: false });
      a.update(dt || 1 / FPS, this.quiet);
      return;
    }
    const a = S.audio;
    const g = take.game;
    a.view = g.view;
    a.occluder = (x0, y0, x1, y1) => !g.world.segmentClear(x0, y0, x1, y1);
    a.listener.x = take.rig.x;
    a.listener.y = take.rig.y;
    const dt = Math.max(0, Math.min(0.1, T - this.lastT));
    this.lastT = T;
    this.scene = readScene(g, 'play', this.scene);
    a.update(dt || 1 / FPS, this.scene);
  },

  frame(T) {
    this.advance(T);
    this.listen(T);
    this.draw(T);
  },
};

// --- Boot -----------------------------------------------------------------------------------------

async function loadFonts() {
  const fams = ['40px "Trailer Display"', '40px "Trailer Type"', '40px "Trailer Crayon"', '40px "Trailer Marker"', '40px "Chalkboard SE"', '40px "Marker Felt"', '40px "Comic Sans MS"'];
  await Promise.all(fams.map((f) => document.fonts.load(f).catch(() => null)));
  await titles.load();
}

fit();
window.addEventListener('resize', fit);

const ready = (async () => {
  await loadFonts();
  if (CAPTURE) {
    film.sound = await makeSound('capture', DURATION);
    film.sound.schedule(0);
  }
  return true;
})();

// Capture: the render tool drives frames one at a time.
window.__trailer = {
  ready,
  cut: CUT,
  duration: DURATION,
  fps: FPS,
  shots: FILM.map((s) => ({ id: s.id, at: s.at, dur: s.dur, level: s.level || null })),
  /** Film the frame at time T (frames must come in order; a jump back restarts its shot). */
  frame(T) {
    film.frame(T);
    return true;
  },
  /** The current frame, as an image (data URL). */
  grab(type = 'image/jpeg', quality = 0.95) {
    return canvas.toDataURL(type, quality);
  },
  /** Render the whole sound track (capture only); then fetch it with audioChunk(i). */
  async renderAudio() {
    if (!film.sound) return 0;
    const wav = await film.sound.render();
    this._wav = wav;
    return Math.ceil(wav.length / CHUNK);
  },
  audioChunk(i) {
    const part = this._wav.subarray(i * CHUNK, (i + 1) * CHUNK);
    let s = '';
    for (let k = 0; k < part.length; k += 0x8000) s += String.fromCharCode.apply(null, part.subarray(k, k + 0x8000));
    return btoa(s);
  },
  /**
   * Run one shot without filming it and log what happens every `every` seconds (for timing cues
   * while writing shots): the specials, who is down or pinned, how many are chasing.
   */
  trace(id, every = 0.1) {
    const i = FILM.findIndex((s) => s.id === id);
    const shot = FILM[i];
    const take = new Take(shot, i, null, view);
    const g = take.game;
    const out = [];
    let next = 0;
    while (take.lt < shot.dur - 1e-6) {
      take.advanceTo(Math.min(shot.dur, take.lt + 1 / 60), shot.at);
      if (take.lt + 1e-6 < next) continue;
      next += every;
      const sp = g.zombies.filter((z) => z.alive && z.type !== 'common').map((z) => `${z.type}:${z.mode || z.state}@${Math.round(z.x)},${Math.round(z.y)}`);
      const chasing = g.zombies.filter((z) => z.alive && z.state === 'chase').length;
      const sq = take.squad.map((s) => `${s.name}${s.down ? '(down ' + Math.round((s.revive || 0) * 100) + '%)' : ''}${s.pinnedBy ? '(PINNED)' : ''}@${Math.round(s.x)},${Math.round(s.y)}`);
      out.push(`${take.lt.toFixed(2)} chase=${chasing} ${sp.join(' ')} | ${sq.join(' ')} | cam ${Math.round(take.rig.x)},${Math.round(take.rig.y)}`);
    }
    return out.join('\n');
  },
  /** Where things are (for finding shots while writing them). */
  debug() {
    const t = film.take;
    if (!t) return null;
    const g = t.game;
    return { shot: t.shot.id, lt: t.lt, rig: { ...t.rig }, squad: t.squad.map((s) => ({ name: s.name, x: Math.round(s.x), y: Math.round(s.y), hp: s.hp, down: !!s.down })), zombies: g.zombies.length };
  },
  film,
};
const CHUNK = 3 * 1024 * 1024;

// --- Live playback -----------------------------------------------------------------------------------

if (!CAPTURE) {
  playBtn.classList.remove('hidden');
  let t0 = 0;
  let paused = false;
  let pausedAt = 0;
  let running = false;
  let building = false;
  const start = async () => {
    playBtn.classList.add('hidden');
    status.textContent = 'loading…';
    await ready;
    if (!film.sound) film.sound = await makeSound('live', DURATION);
    const ctx = film.sound.ctx;
    if (ctx.state === 'suspended') await ctx.resume();
    await restart();
    if (!running) {
      running = true;
      requestAnimationFrame(loop);
    }
  };
  /** Build every shot (and its 3D scene) now, so playing never waits on one. */
  const buildAll = async () => {
    film.ready = [];
    for (let i = 0; i < FILM.length; i++) {
      const shot = FILM[i];
      if (shot.black) continue;
      status.textContent = `getting the shots ready… ${i + 1}/${FILM.length}`;
      await new Promise((ok) => setTimeout(ok, 0));
      const take = new Take(shot, i, film.sound.audio, view);
      take.game.syncView();
      take.scene = new Scene(take.game.world, take.game.view);
      film.ready[i] = take;
    }
    status.textContent = '';
  };
  const restart = async () => {
    if (building) return;
    building = true;
    const ctx = film.sound.ctx;
    await ctx.suspend();
    await buildAll();
    await ctx.resume();
    building = false;
    t0 = ctx.currentTime + 0.15;
    film.sound.schedule(t0);
    film.shotI = -1;
    paused = false;
    if (ctx.state === 'suspended') ctx.resume();
  };
  let shown = 0;
  const loop = () => {
    requestAnimationFrame(loop);
    if (building) return;
    const ctx = film.sound.ctx;
    const T = paused ? pausedAt : Math.max(0, ctx.currentTime - t0);
    if (T >= DURATION) {
      film.frame(DURATION - 1e-3);
      playBtn.classList.remove('hidden');
      playBtn.querySelector('b').textContent = '▶ PLAY AGAIN';
      return;
    }
    const w0 = wallNow();
    film.frame(T);
    const ms = wallNow() - w0;
    shown += (ms - shown) * 0.1;
    status.textContent = params.has('debug') ? `${T.toFixed(2)}s · ${FILM[film.shotI].id} · ${shown.toFixed(0)} ms/frame` : '';
  };
  playBtn.addEventListener('click', start);
  window.addEventListener('keydown', (e) => {
    if (!film.sound) return;
    if (e.code === 'KeyR') restart();
    if (e.code === 'Space') {
      const ctx = film.sound.ctx;
      if (!paused) {
        pausedAt = Math.max(0, ctx.currentTime - t0);
        paused = true;
        ctx.suspend();
      } else {
        paused = false;
        ctx.resume();
      }
      e.preventDefault();
    }
  });
}
