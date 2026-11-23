// The trailer's stage: the real game (src/), run frame by frame for the camera.
//
// Loaded by tools/trailer/capture.cjs into a page whose inline prelude has
// already swapped in a virtual clock (performance.now), a seeded Math.random
// and an AudioContext that is really an OfflineAudioContext. So every frame is
// one exact 1/30 s step, a shot replays the same way every time, and the
// game's own sound engine renders the shot's sound in lockstep with its
// pictures (the music is left out: the trailer has its own score).
//
// Nothing here changes how the game plays. The capture page only patches the
// HUD so parts of it can be hidden, and names the teammate (see capture.cjs).

import { DEFAULTS, levelKey } from '../../src/settings.js';
import { Game } from '../../src/game/game.js';
import { Renderer } from '../../src/render/renderer.js';
import { Audio } from '../../src/audio.js';
import { Input } from '../../src/input/input.js';
import { computeLayout } from '../../src/layout.js';
import { readScene } from '../../src/game/soundscape.js';
import { SfxBank, SFX_SPRITES } from '../../src/sfx-bank.js';
import { FONT } from '../../src/render/draw-utils.js';
import { Zombie } from '../../src/game/zombies.js';
import { spawnHunter, spawnTank } from '../../src/game/specials.js';
import { spawnWitch, startle } from '../../src/game/witch.js';
import { hurtAlly, allySpotNear, ALLY } from '../../src/game/ally.js';
import { detonate } from '../../src/game/world-events.js';
import { FlowField } from '../../src/world/world.js';
import { GUN_Z } from '../../src/game/player.js';

export const FPS = 30;
// CSS px; the page runs at devicePixelRatio 2, so the canvas is 1920x1080 (scouting uses a bigger page).
export const W = (window.__stageSize && window.__stageSize.w) || 960;
export const H = (window.__stageSize && window.__stageSize.h) || 540;
const RATE = 48000;

const canvas = document.getElementById('game');
const settings = { ...DEFAULTS, playtestPrompt: false, haptics: 'off', musicVolume: 0 };
const safe = { l: 0, r: 0, t: 0, b: 0 };
let layout = computeLayout(W, H, safe, settings);
const input = new Input(canvas, settings, () => layout);
const renderer = new Renderer(canvas);
renderer.resize(W, H);

// Every recorded effect, decoded once and shared by each shot's sound engine.
const decodeCtx = new OfflineAudioContext(2, RATE, RATE);
const bank = new SfxBank(() => decodeCtx);
const bankReady = Promise.all(Object.keys(SFX_SPRITES).map((k) => bank.load(k)));

/** A fresh sound engine on a fresh offline context, long enough for `seconds`. */
function newAudio(seconds) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE) + RATE, RATE);
  window.__nextCtx = ctx;
  const a = new Audio();
  a.bank = bank;
  a.fileMusic = true; // keeps the synth Tank theme quiet
  a.setVolume(settings.volume);
  a.unlock();
  a.setAmbience(settings.ambienceVolume);
  return a;
}

const game = new Game(settings, newAudio(1), () => {});
game.setViewport(W, H);
const scene = readScene(game, 'play');

/** The scripted thumbs of player one: what the input system would hand the game. */
const frameIn = {
  source: 'mouse',
  move: { x: 0, y: 0 },
  aimActive: false,
  aimX: 1,
  aimY: 0,
  aimRaw: 1,
  aimScreen: null,
  fire: false,
  assist: false,
  events: [],
};

const ui = { layout, fps: 60, frameMs: 16, hintAlpha: 0, input, forceSticks: false, reportRect: null, title: false, hud: {} };

// --- helpers for shots ---------------------------------------------------------------------

const tmp = { x: 0, y: 0 };
const fields = new Map();

/** A flow field toward a point, cached per rounded target. */
function fieldTo(x, y) {
  const key = `${Math.round(x / 16)},${Math.round(y / 16)}`;
  let f = fields.get(key);
  if (!f) {
    f = new FlowField(game.world);
    f.compute(x, y);
    fields.set(key, f);
  }
  return f;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * Player one's pilot. Each frame a shot says where to go and what to shoot;
 * the pilot turns that into stick input the way a thumb would.
 */
const pilot = {
  goal: null, // {x, y}: walk there (around walls, by the flow field)
  speed: 1, // stick deflection
  arrive: 14,
  aim: null, // {x, y} or an entity: aim at it
  fire: false,
  autoAim: false, // aim at (and shoot) the nearest threat
  autoRange: 420,
  filter: null, // which infected autoAim may pick
  shoveNext: false,
  reset() {
    this.goal = null;
    this.speed = 1;
    this.arrive = 14;
    this.aim = null;
    this.fire = false;
    this.autoAim = false;
    this.autoRange = 420;
    this.filter = null;
    this.shoveNext = false;
  },
};

/** The nearest live, targetable infected to a point (not a seated Witch). */
function nearestThreat(x, y, range, filter) {
  let best = null;
  let bd = range;
  for (const z of game.zombies) {
    if (!z.alive || z.ghost || z.passive) continue;
    if (filter && !filter(z)) continue;
    const d = Math.hypot(z.x - x, z.y - y);
    if (d < bd && game.world.segmentClear(x, y, z.x, z.y, game.world.shotBlockers)) {
      bd = d;
      best = z;
    }
  }
  return best;
}

function buildInput() {
  const p = game.player;
  const v = game.view;
  const f = frameIn;
  f.events = [];
  f.move.x = 0;
  f.move.y = 0;
  if (pilot.goal && p.alive) {
    const g = pilot.goal;
    const d = Math.hypot(g.x - p.x, g.y - p.y);
    if (d > pilot.arrive) {
      let dx = (g.x - p.x) / d;
      let dy = (g.y - p.y) / d;
      if (!game.world.segmentClear(p.x, p.y, g.x, g.y, game.world.moveBlockers)) {
        if (fieldTo(g.x, g.y).dirAt(p.x, p.y, tmp)) {
          dx = tmp.x;
          dy = tmp.y;
        }
      }
      const s = v.dirToScreen(dx, dy, tmp);
      const m = Math.hypot(s.x, s.y) || 1;
      const k = pilot.speed * Math.min(1, d / 60 + 0.35);
      f.move.x = (s.x / m) * k;
      f.move.y = (s.y / m) * k;
    }
  }
  let aim = pilot.aim;
  if (pilot.autoAim) {
    const z = nearestThreat(p.x, p.y, pilot.autoRange, pilot.filter);
    if (z) aim = z;
  }
  if (aim && p.alive) {
    const s = v.project(aim.x, aim.y, GUN_Z, { x: 0, y: 0 });
    f.aimScreen = s;
    f.aimActive = true;
    f.fire = pilot.fire || (pilot.autoAim && aim !== pilot.aim);
  } else {
    f.aimScreen = null;
    f.aimActive = false;
    f.fire = false;
  }
  // The mouse path aims at the cursor; with no cursor, input.sample would say "not aiming".
  if (!f.aimScreen) f.aimActive = false;
  if (pilot.shoveNext) {
    f.events.push('shove');
    pilot.shoveNext = false;
  }
  return f;
}

// --- the camera --------------------------------------------------------------------------

/**
 * cam.mode: 'game' (the game's own follow cam), or 'track' (a damped follow
 * of cam.target(): a function returning {x, y}), or 'fixed' (cam.x, cam.y).
 * cam.zoom: world units across the short side of the screen (the game's viewSize).
 */
const cam = { mode: 'game', target: null, x: 0, y: 0, k: 6, zoom: null, cx: 0, cy: 0, init: false };

function setZoom(z) {
  settings[levelKey('viewSize', game.level)] = z;
}

function applyCamera(dt) {
  const c = game.camera;
  if (cam.zoom) setZoom(typeof cam.zoom === 'function' ? cam.zoom(T.t) : cam.zoom);
  if (cam.mode === 'game') return;
  let tx = cam.x;
  let ty = cam.y;
  if (cam.mode === 'track' && cam.target) {
    const t = cam.target(T.t);
    tx = t.x;
    ty = t.y;
  }
  if (!cam.init) {
    cam.cx = tx;
    cam.cy = ty;
    cam.init = true;
  } else {
    const k = 1 - Math.exp(-cam.k * dt);
    cam.cx += (tx - cam.cx) * k;
    cam.cy += (ty - cam.cy) * k;
  }
  c.x = cam.cx;
  c.y = cam.cy;
  c.lookX = c.x - game.player.x;
  c.lookY = c.y - game.player.y;
}

// --- overlays drawn into the frame ---------------------------------------------------------

const tags = { on: false, p1: 'YOU', p2: 'SAM', size: 11, alpha: 1 };

function tag(ctx, x, y, z, text, color, bg) {
  const v = game.view;
  const sx = v.px(x, y);
  const sy = v.py(x, y, z);
  ctx.font = `800 ${tags.size}px ${FONT}`;
  const w = ctx.measureText(text).width + 12;
  const h = tags.size + 8;
  const bx = sx - w / 2;
  const by = sy - h - 7;
  ctx.globalAlpha = tags.alpha;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(bx, by, w, h, h / 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(sx - 4, by + h - 0.5);
  ctx.lineTo(sx + 4, by + h - 0.5);
  ctx.lineTo(sx, by + h + 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, sx, by + h / 2 + 0.5);
  ctx.globalAlpha = 1;
}

// --- thumbs on the glass: the HUD's own sticks, posed from what a survivor is doing -------

const sticks = { on: false };
const stickTmp = { x: 0, y: 0 };

/** Pose the HUD's sticks: move = a screen direction (or null), aim = a screen direction (or null). */
function poseSticks(move, aim, firing) {
  const t = input.touch;
  const R = settings.stickRadius;
  const L = layout;
  const pose = (st, base, dir, k) => {
    if (!dir) {
      st.active = false;
      st.firing = false;
      return;
    }
    st.active = true;
    st.base.x = base.x;
    st.base.y = base.y;
    st.pos.x = base.x + dir.x * R * k;
    st.pos.y = base.y + dir.y * R * k;
  };
  pose(t.move, L.fixedMove, move, 0.85);
  pose(t.aim, L.fixedAim, aim, firing ? 0.92 : 0.38);
  t.aim.firing = !!(aim && firing);
}

/** Screen directions from a survivor's motion and aim. */
function sticksFor(e, firing, aimAngle) {
  const v = game.view;
  let move = null;
  const sp = Math.hypot(e.vx, e.vy);
  if (sp > 25) {
    const s = v.dirToScreen(e.vx / sp, e.vy / sp, stickTmp);
    const m = Math.hypot(s.x, s.y) || 1;
    move = { x: s.x / m, y: s.y / m };
  }
  let aim = null;
  if (aimAngle !== null && aimAngle !== undefined) {
    const s = v.dirToScreen(Math.cos(aimAngle), Math.sin(aimAngle), stickTmp);
    const m = Math.hypot(s.x, s.y) || 1;
    aim = { x: s.x / m, y: s.y / m };
  }
  poseSticks(move, aim, firing);
}

function drawOverlay() {
  const ctx = renderer.ctx;
  const dpr = renderer.dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (tags.on && tags.alpha > 0.01) {
    const p = game.player;
    const a = game.ally;
    if (p.alive && !p.pinnedBy) tag(ctx, p.x, p.y, 50, tags.p1, '#0b2a33', 'rgba(110,220,255,0.92)');
    if (a && a.alive && !a.down) tag(ctx, a.x, a.y, 50, tags.p2, '#0f2a12', 'rgba(140,255,160,0.92)');
    else if (a && a.alive && a.down) tag(ctx, a.x, a.y, 20, tags.p2, '#2a0f0f', 'rgba(255,130,110,0.95)');
  }
  if (T.overlay) T.overlay(ctx, api);
}

// --- running a shot ------------------------------------------------------------------------

/** The shot being filmed. */
const T = { shot: null, k: 0, t: 0, frames: 0, audio: null, started: false, done: null, overlay: null, timeScale: 1 };

function stepSim(dt) {
  const inp = buildInput();
  let remaining = dt;
  let first = true;
  while (remaining > 1e-6) {
    const h = Math.min(1 / 60, remaining);
    if (!first) inp.events = [];
    game.update(h, inp);
    first = false;
    remaining -= h;
  }
}

/** Fast-forward without pictures or sound (sounds go to a context that never plays). */
function warm(seconds, tick) {
  const n = Math.round(seconds * FPS);
  for (let i = 0; i < n; i++) {
    window.__clock.advance(1000 / FPS);
    if (tick) tick(i / FPS);
    stepSim(1 / FPS);
  }
}

const api = {
  game,
  settings,
  pilot,
  cam,
  tags,
  ui,
  FPS,
  W,
  H,
  dist,
  lerp,
  ease,
  warm,
  nearestThreat,
  fieldTo,
  Zombie,
  spawnHunter,
  spawnTank,
  spawnWitch,
  startle,
  hurtAlly,
  allySpotNear,
  ALLY,
  detonate,
  /** A zombie at (x, y), chasing or idle. */
  zombie(x, y, alert = true) {
    const z = new Zombie(x, y, alert);
    game.zombies.push(z);
    return z;
  },
  /** A crowd of n around (x, y) within radius r, on free ground. */
  crowd(x, y, n, r = 80, alert = true) {
    const out = [];
    for (let k = 0; k < n * 6 && out.length < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * r;
      const zx = x + Math.cos(a) * d;
      const zy = y + Math.sin(a) * d;
      if (!game.world.isFree(zx, zy, 11)) continue;
      out.push(this.zombie(zx, zy, alert));
    }
    return out;
  },
  /** Put a survivor somewhere (and stop it). */
  place(e, x, y, facing) {
    e.x = x;
    e.y = y;
    e.vx = 0;
    e.vy = 0;
    if (facing !== undefined) {
      e.facing = facing;
      e.aimAngle = facing;
      if ('fireAngle' in e) e.fireAngle = facing;
    }
  },
  /** Clear every infected within r of (x, y) (or all of them). A seated Witch stays where she is. */
  clear(x, y, r) {
    for (const z of game.zombies) {
      if (z.type === 'witch') continue;
      if (x === undefined || Math.hypot(z.x - x, z.y - y) < r) z.alive = false;
    }
    game.zombies = game.zombies.filter((z) => z.alive);
  },
  /** No mobs, trickles or specials of the director's own: the shot decides what comes. */
  calm() {
    const d = game.director;
    d.mobT = 1e9;
    d.trickleT = 1e9;
    d.specialT = 1e9;
    d.tankSpawned = true;
    d.terrorT = 1e9;
    d.hunterSeen = true;
  },
  /** Call a mob from a spot (as the director would), with its sound and the call-out. */
  mob(x, y, n, over = 2.5, label = 'HERE THEY COME!') {
    game.director.queueGroup({ x, y }, n, over);
    game.audio.horde(x, y);
    if (label) game.announce(label, '#ff6b5a', 2.2);
  },
  snapCamera(x, y) {
    const c = game.camera;
    c.x = x;
    c.y = y;
    c.lookX = 0;
    c.lookY = 0;
    cam.cx = x;
    cam.cy = y;
    cam.init = true;
  },
};
window.trailer = api;

/** Shots register themselves here (tools/trailer/shots.js). */
const SHOTS = new Map();
export function shot(def) {
  SHOTS.set(def.name, def);
  window.__shotNames = [...SHOTS.keys()];
}

/**
 * Set up a shot: level, seed, settings, world. Fast-forwards through its warm-up
 * and returns how many frames it has.
 */
async function prepare(name) {
  await bankReady;
  const def = SHOTS.get(name);
  if (!def) throw new Error(`no shot ${name}`);
  window.__seed(def.rng || 7);
  window.__clock.set(0);
  Object.assign(settings, DEFAULTS, { playtestPrompt: false, haptics: 'off', musicVolume: 0 }, def.settings || {});
  settings.level = def.level || 'city';
  for (const [k, v] of Object.entries(def.camera || {})) settings[levelKey(k, settings.level)] = v;
  layout = computeLayout(W, H, safe, settings);
  ui.layout = layout;
  ui.hud = def.hud || { threats: false, objective: false, panels: false, marker: false, buttons: false, sticks: false, bars: false, pinned: false, messages: true, end: false };
  window.__friend = tags.p2;
  pilot.reset();
  ALLY.reviveTime = 3;
  ALLY.spotBack = 58;
  ALLY.spotSide = 52;
  Object.assign(cam, { mode: 'game', target: null, x: 0, y: 0, k: 6, zoom: null, init: false });
  Object.assign(tags, { on: true, p1: 'YOU', p2: 'SAM', size: 11, alpha: 1 });
  fields.clear();
  game.audio = newAudio(1); // the warm-up's sounds go nowhere
  game.newRun(def.seed || 1337);
  game.audio.view = game.view;
  T.shot = def;
  T.k = 0;
  T.t = 0;
  T.timeScale = 1;
  T.overlay = null;
  T.log = [];
  T.views = def.views || 1;
  T.frames = Math.round((def.seconds || 4) * FPS);
  sticks.on = !!def.sticks;
  alt.init = false;
  alt.hud = def.altHud || null;
  if (def.setup) def.setup(api, T);
  return { frames: T.frames, level: settings.level, views: T.views };
}

/** Start the shot's sound: a fresh engine on a context as long as the shot. */
function roll() {
  const a = newAudio(T.frames / FPS);
  a.view = game.view;
  a.occluder = (x0, y0, x1, y1) => !game.world.segmentClear(x0, y0, x1, y1);
  game.audio = a;
  T.audio = a;
  T.started = false;
  T.done = null;
}

/** One frame: the shot's script, the game, the camera, the picture, then this frame's sound. */
async function frame() {
  const def = T.shot;
  const dt = 1 / FPS;
  window.__clock.advance(1000 / FPS);
  if (def.tick) def.tick(api, T.t, T.k, T);
  stepSim(dt * T.timeScale);
  if (def.post) def.post(api, T.t, T.k, T);
  applyCamera(dt);
  const a = game.audio;
  a.listener.x = game.player.x;
  a.listener.y = game.player.y;
  a.update(dt, readScene(game, 'play', scene));
  const pl = game.player;
  ui.forceSticks = sticks.on;
  if (sticks.on) sticksFor(pl, pl.firing, pl.aimActive || pl.aimHoldT > 0 ? pl.fireAngle : null);
  renderer.render(game, input, ui);
  drawOverlay();
  if (T.views === 2) updateAltCam(dt);
  // Sound for [t, t + dt).
  const c = a.ctx;
  const next = (T.k + 1) / FPS;
  const p = c.__suspend(next);
  if (!T.started) {
    T.started = true;
    T.done = c.startRendering();
  } else c.__resume();
  await p;
  T.k++;
  T.t = T.k / FPS;
}

// --- player two's phone ----------------------------------------------------------------

/** Player two's own follow camera (like the game's: leads toward the aim). */
const alt = { x: 0, y: 0, lx: 0, ly: 0, init: false, hud: null };

function updateAltCam(dt) {
  const a = game.ally;
  if (!a) return;
  let lx = 0;
  let ly = 0;
  if (a.firing || a.target) {
    lx = Math.cos(a.aimAngle) * 80;
    ly = Math.sin(a.aimAngle) * 80;
  } else {
    const sp = Math.hypot(a.vx, a.vy);
    if (sp > 20) {
      lx = (a.vx / sp) * 40;
      ly = (a.vy / sp) * 40;
    }
  }
  if (!alt.init) {
    alt.x = a.x + lx;
    alt.y = a.y + ly;
    alt.init = true;
  }
  const kl = 1 - Math.exp(-3.2 * dt);
  alt.lx += (lx - alt.lx) * kl;
  alt.ly += (ly - alt.ly) * kl;
  const k = 1 - Math.exp(-settings.cameraStiffness * dt);
  alt.x += (a.x + alt.lx - alt.x) * k;
  alt.y += (a.y + alt.ly - alt.y) * k;
}

/** Draw the same moment again, through player two's camera (and thumbs). */
function renderAlt() {
  const c = game.camera;
  const save = { x: c.x, y: c.y };
  const a = game.ally;
  c.x = alt.x;
  c.y = alt.y;
  const hud = ui.hud;
  if (alt.hud) ui.hud = alt.hud;
  ui.forceSticks = sticks.on;
  if (sticks.on && a) sticksFor(a, a.firing, a.firing || a.target ? a.aimAngle : null);
  renderer.render(game, input, ui);
  drawOverlay();
  ui.hud = hud;
  c.x = save.x;
  c.y = save.y;
  game.syncView();
}

/** Ben writes something new, in crayon on the ground (rendered by the game, like his other lines). */
function crayon(x, y, text, size = 11, a = 0) {
  game.world.map.decor.push({ type: 'bentext', x, y, text, size, a });
}

/** Note when something happens, for the edit (out/shots/NAME.log.json). */
function note(what) {
  (T.log || (T.log = [])).push({ t: +T.t.toFixed(3), k: T.k, what });
}

/** The shot's sound as a 16-bit stereo WAV, base64. */
async function finish() {
  const c = T.audio.ctx;
  c.__resume();
  const buf = await T.done;
  const n = Math.min(buf.length, Math.round((T.frames / FPS) * RATE));
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const bytes = new Uint8Array(44 + n * 4);
  const dv = new DataView(bytes.buffer);
  const str = (o, s) => {
    for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i);
  };
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 2, true);
  dv.setUint32(24, RATE, true);
  dv.setUint32(28, RATE * 4, true);
  dv.setUint16(32, 4, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, L[i]));
    const r = Math.max(-1, Math.min(1, R[i]));
    dv.setInt16(o, l * 32767, true);
    dv.setInt16(o + 2, r * 32767, true);
    o += 4;
  }
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Map facts for scouting: rooms, start, goal, witches, Ben's chalk, fires, alarm cars. */
function facts() {
  const m = game.world.map;
  const pick = (o) => o && { x: Math.round(o.x), y: Math.round(o.y), w: o.w && Math.round(o.w), h: o.h && Math.round(o.h) };
  return {
    level: game.level,
    seed: game.seed,
    size: { w: m.w, h: m.h },
    start: pick(m.start),
    startRoom: pick(m.startRoom.interior),
    startDoor: m.startRoom.door,
    endRoom: pick(m.endRoom.interior),
    witches: (m.witches || []).map(pick),
    chalk: m.ben ? m.ben.chalk.map((c) => ({ kind: c.kind, x: Math.round(c.x), y: Math.round(c.y), a: c.a })) : [],
    nest: m.ben && m.ben.nest ? pick(m.ben.nest) : null,
    alarms: m.obstacles.filter((o) => o.alarm).map(pick),
    fires: (m.fires || []).map(pick),
    explosives: (game.events && game.events.explosives ? game.events.explosives : []).map((e) => pick(e)),
    flare: game.events && game.events.finale ? pick(game.events.finale.flare) : null,
    route: Math.round(game.routeLen),
  };
}

/**
 * A map seen from straight above, lights on, with a grid of world coordinates
 * and the places shots care about marked: for picking where to film.
 * `area` = {x, y, w, h} (world units) zooms in on part of the map.
 */
function scout(level, seed, opts = {}) {
  window.__seed(7);
  Object.assign(settings, DEFAULTS, { playtestPrompt: false, haptics: 'off', musicVolume: 0 }, opts.settings || {});
  settings.level = level;
  game.audio = newAudio(1);
  game.newRun(seed);
  const m = game.world.map;
  const area = opts.area || { x: 0, y: 0, w: m.w, h: m.h };
  settings[levelKey('camera', level)] = opts.view || 'top';
  settings.night = !!opts.night;
  const sizeK = Math.max(area.h, (area.w * H) / W);
  settings[levelKey('viewSize', level)] = sizeK;
  ui.hud = { threats: false, objective: false, panels: false, marker: false, buttons: false, sticks: false, bars: false, pinned: false, messages: false, end: false };
  const cx = area.x + area.w / 2;
  const cy = area.y + area.h / 2;
  api.place(game.player, cx, cy);
  game.zombies = [];
  if (game.ally) api.place(game.ally, cx + 30, cy);
  api.snapCamera(cx, cy);
  game.camera.trauma = 0;
  game.syncView();
  renderer.render(game, input, ui);
  const ctx = renderer.ctx;
  ctx.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);
  const v = game.view;
  const step = opts.grid || (area.w > 2500 ? 500 : area.w > 1200 ? 250 : 100);
  ctx.font = `700 11px ${FONT}`;
  ctx.lineWidth = 1;
  for (let x = Math.ceil(area.x / step) * step; x <= area.x + area.w; x += step) {
    ctx.strokeStyle = x % (step * 2) === 0 ? 'rgba(255,255,0,0.45)' : 'rgba(255,255,0,0.2)';
    ctx.beginPath();
    ctx.moveTo(v.px(x, area.y), v.py(x, area.y));
    ctx.lineTo(v.px(x, area.y + area.h), v.py(x, area.y + area.h));
    ctx.stroke();
    ctx.fillStyle = '#ff0';
    ctx.fillText(String(x), v.px(x, area.y) + 2, v.py(x, area.y) + 12);
  }
  for (let y = Math.ceil(area.y / step) * step; y <= area.y + area.h; y += step) {
    ctx.strokeStyle = y % (step * 2) === 0 ? 'rgba(255,255,0,0.45)' : 'rgba(255,255,0,0.2)';
    ctx.beginPath();
    ctx.moveTo(v.px(area.x, y), v.py(area.x, y));
    ctx.lineTo(v.px(area.x + area.w, y), v.py(area.x + area.w, y));
    ctx.stroke();
    ctx.fillStyle = '#ff0';
    ctx.fillText(String(y), v.px(area.x, y) + 2, v.py(area.x, y) - 2);
  }
  const f = facts();
  const mark = (x, y, label, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(v.px(x, y), v.py(x, y), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText(label, v.px(x, y) + 8, v.py(x, y) + 4);
    ctx.fillText(label, v.px(x, y) + 8, v.py(x, y) + 4);
  };
  mark(f.start.x, f.start.y, 'START', '#0f0');
  mark(f.endRoom.x + f.endRoom.w / 2, f.endRoom.y + f.endRoom.h / 2, 'END', '#0f0');
  for (const w of f.witches) mark(w.x, w.y, 'WITCH', '#f0f');
  for (const c of f.chalk) mark(c.x, c.y, `CHALK ${c.kind}`, '#fa0');
  if (f.nest) mark(f.nest.x, f.nest.y, 'NEST', '#fa0');
  for (const a of f.alarms) mark(a.x + (a.w || 0) / 2, a.y + (a.h || 0) / 2, 'ALARM', '#f33');
  if (f.flare) mark(f.flare.x, f.flare.y, 'FLARE', '#f33');
  for (const e of f.explosives) mark(e.x + (e.w || 0) / 2, e.y + (e.h || 0) / 2, 'BOOM', '#f80');
  return f;
}

Object.assign(api, { sticks, crayon, note, alt, T });

window.stage = { prepare, roll, frame, renderAlt, finish, facts, scout, api, T, game, renderer, canvas, settings, ready: () => bankReady };
