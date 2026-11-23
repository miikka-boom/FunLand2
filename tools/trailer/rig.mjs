// A camera rig for We Left Ben: loads the game in headless Chromium and films it frame by frame.
//
// - The game's files are served straight from the repo through Playwright (no web server).
// - Time is fake: requestAnimationFrame and performance.now only move when the rig says so, so a
//   frame is exactly 1/30 s of game time however slow the render is, and slow motion is free.
// - Math.random is seeded, so the same shot replays the same way.
// - No AudioContext: the trailer has its own soundtrack. Sound calls are logged instead (T.log),
//   so the edit can place hits where the game would have played them.
// - The HUD is replaced by a cinematic one (only the big callouts, scaled up), the survivor is
//   driven by an autopilot, and the camera can be taken over (yaw, pitch, zoom, framing).
//
// Usage: see shots.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Playwright is a global install here (NODE_PATH), which ESM imports don't search.
const { chromium } = createRequire(import.meta.url)('playwright');

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'http://funland.local';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
};

/** The HUD in cinematic mode: the damage vignette, the big callouts (scaled), optional bars. */
function patchHud(src) {
  const out = src.replace('export function drawHud(', 'function drawHudOrig(');
  if (out === src) throw new Error('hud.js: drawHud not found');
  return `${out}
export function drawHud(ctx, game, input, ui, renderer) {
  const T = globalThis.__T;
  if (!T || !T.cine) return drawHudOrig(ctx, game, input, ui, renderer);
  const L = ui.layout;
  const w = L.w;
  const h = L.h;
  const p = game.player;
  const hpf = p.hp / p.maxHp;
  let va = game.hurtFlash * 0.55 * (T.vignette ?? 1);
  if (p.alive && hpf < 0.35) va += (0.35 - hpf) * (0.55 + 0.45 * Math.sin(game.time * 6.5)) * 0.9;
  if (va > 0.01) {
    const key = w + 'x' + h;
    if (key !== vignetteKey) {
      vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
      vignette.addColorStop(0, 'rgba(150,0,0,0)');
      vignette.addColorStop(1, 'rgba(150,0,0,1)');
      vignetteKey = key;
    }
    ctx.globalAlpha = clamp(va, 0, 0.85);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
  if (T.boss) drawBossBar(ctx, game, L);
  if (T.ferryBar) drawFerryBar(ctx, game, L);
  if (T.messages) {
    // T.messages: true (all), 'big' (the big callouts only); T.hide: a regexp source of lines to leave out.
    const all = game.messages;
    const hide = T.hide ? new RegExp(T.hide, 'i') : null;
    game.messages = all.filter((m) => (T.messages !== 'big' || m.size !== 'small') && !(hide && hide.test(m.text)));
    const k = T.msgScale || 1;
    ctx.save();
    ctx.scale(k, k);
    drawMessages(ctx, game, { ...L, w: w / k, h: h / k });
    ctx.restore();
    game.messages = all;
  }
}
`;
}

/** Runs in the page before any of its scripts: fake clock, seeded random, settings, no audio. */
function initPage({ settings, seed }) {
  let now = 1000;
  const queue = [];
  performance.now = () => now;
  const dateBase = Date.UTC(2020, 9, 31, 23, 0, 0); // a fixed night
  Date.now = () => dateBase + now;
  window.requestAnimationFrame = (cb) => {
    queue.push(cb);
    return queue.length;
  };
  window.cancelAnimationFrame = () => {};
  window.__tick = (ms) => {
    now += ms;
    const cbs = queue.splice(0, queue.length);
    for (const cb of cbs) cb(now);
  };
  let s = seed >>> 0;
  Math.random = function random() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.__reseed = (v) => {
    s = v >>> 0;
  };
  try {
    localStorage.clear();
    localStorage.setItem('funland2.p0.tuning.v1', JSON.stringify({ _v: 2, ...settings }));
  } catch {
    // private mode: defaults
  }
  window.AudioContext = undefined;
  window.webkitAudioContext = undefined;
}

/** Runs in the page once the game has booted: the autopilot, the camera, the cinematic switches. */
async function installRuntime() {
  const P = window.__p0;
  const g = P.game;
  // The game's own modules (the same instances the game uses), for spawning things on cue.
  const mods = {
    specials: await import('/src/game/specials.js'),
    witch: await import('/src/game/witch.js'),
    events: await import('/src/game/world-events.js'),
    zombies: await import('/src/game/zombies.js'),
    ally: await import('/src/game/ally.js'),
  };
  const T = (window.__T = {
    mods,
    cine: true,
    messages: true,
    msgScale: 2,
    boss: false,
    ferryBar: false,
    vignette: 1,
    render: true,
    allyGod: true,
    st: 0, // shot time: game seconds since the shot's setup
    frameNo: 0,
    log: [],
    auto: null, // autopilot config (null: stand still)
    cam: null, // camera override (null: the game's own camera)
    script: null, // per-frame shot script (game, T, dt)
    vars: {},
  });

  // --- Sound calls -> log -------------------------------------------------------------------
  const A = P.audio;
  const LOGGED = ['shot', 'allyShot', 'explosion', 'tankRoar', 'tankPunch', 'tankDie', 'tankStep', 'rockThrow', 'rockShatter',
    'witchScream', 'witchSlash', 'witchGrowl', 'witchDie', 'horde', 'alarm', 'flare', 'ferryHorn', 'radio', 'hunterScreech',
    'hunterPounce', 'hunterDie', 'deadstop', 'terrorShriek', 'terrorLunge', 'death', 'hurt', 'win', 'shove', 'gateOpen',
    'boardBreak', 'allyDown', 'pickup', 'reloadStart', 'splat', 'zombieAttack', 'snarl', 'stashOpen', 'thud'];
  for (const name of LOGGED) {
    const orig = A[name];
    if (typeof orig !== 'function') continue;
    A[name] = function logged(...args) {
      const g2 = P.game;
      const p = g2.player;
      const plain = args.filter((x) => typeof x === 'number' || typeof x === 'string' || typeof x === 'boolean');
      const e = { f: T.frameNo, t: +g2.time.toFixed(3), n: name, a: plain.slice(0, 4) };
      // Where it happened, relative to the survivor (for loudness by distance in the mix).
      if (typeof args[0] === 'number' && typeof args[1] === 'number' && name !== 'alarm') e.d = Math.round(Math.hypot(args[0] - p.x, args[1] - p.y));
      T.log.push(e);
      return orig.apply(this, args);
    };
  }
  P.audio.unlock = () => {};

  // --- Rendering can be switched off for pre-roll --------------------------------------------
  const R = P.renderer;
  const render = R.render.bind(R);
  R.render = (game, input, ui) => {
    if (T.render) render(game, input, ui);
  };

  // --- Autopilot: the survivor ---------------------------------------------------------------
  const tmp = { x: 0, y: 0 };
  const tmp2 = { x: 0, y: 0 };
  const frame = { source: 'gamepad', move: { x: 0, y: 0 }, aimActive: false, aimX: 1, aimY: 0, aimRaw: 0, aimScreen: null, fire: false, assist: true, events: [] };
  const fields = new Map();
  T.fieldTo = (x, y) => {
    const key = `${Math.round(x)},${Math.round(y)}`;
    if (!fields.has(key) || fields.get(key).world !== P.game.world) {
      const F = new P.game.goalField.constructor(P.game.world);
      F.compute(x, y);
      fields.set(key, F);
    }
    return fields.get(key);
  };
  const isTarget = (z, A2) => {
    if (!z.alive || z.ghost) return false;
    if (z.type === 'witch') return !!A2.shootWitch;
    if (z.passive) return false;
    if (z.type === 'terror' && !z.lit) return false;
    return true;
  };
  function pickTarget(game, A2) {
    const p = game.player;
    const W = game.world;
    let best = null;
    let bestS = Infinity;
    const range = A2.range || 420;
    for (const z of game.zombies) {
      if (!isTarget(z, A2)) continue;
      const dx = z.x - p.x;
      const dy = z.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > range) continue;
      // Closer first, chasers before idlers, specials first, and something in front of us a bit before behind.
      let s = d;
      if (z.state === 'idle') s += A2.idlePenalty ?? 260;
      if (z.type === 'tank' || z.type === 'hunter') s -= 220;
      if (z.type === 'witch' && A2.shootWitch) s -= 400;
      const ang = Math.atan2(dy, dx);
      const df = Math.abs(((ang - p.fireAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      s += df * 30;
      if (s >= bestS) continue;
      if (!W.segmentClear(p.x, p.y, z.x, z.y, W.shotBlockers)) continue;
      best = z;
      bestS = s;
    }
    return best;
  }
  function crowded(game, r) {
    const p = game.player;
    let n = 0;
    for (const z of game.zombies) {
      if (!z.alive || z.passive || z.ghost || z.type === 'witch') continue;
      if ((z.x - p.x) ** 2 + (z.y - p.y) ** 2 < r * r) n++;
    }
    return n;
  }
  T.autoFrame = () => {
    const f = frame;
    const game = P.game;
    const A2 = T.auto;
    const p = game.player;
    const v = game.view;
    f.move.x = 0;
    f.move.y = 0;
    f.aimActive = false;
    f.aimRaw = 0;
    f.fire = false;
    f.events = [];
    if (!A2 || !p.alive) return f;
    // Movement: toward the goal, to a point, or along a heading.
    let mx = 0;
    let my = 0;
    if (A2.move === 'goal') {
      if (game.goalField.dirAt(p.x, p.y, tmp)) {
        mx = tmp.x;
        my = tmp.y;
      }
    } else if (A2.move === 'to') {
      const d = Math.hypot(A2.x - p.x, A2.y - p.y);
      if (d > (A2.arrive ?? 24)) {
        const W = game.world;
        if (W.segmentClear(p.x, p.y, A2.x, A2.y, W.moveBlockers)) {
          mx = (A2.x - p.x) / d;
          my = (A2.y - p.y) / d;
        } else if (T.fieldTo(A2.x, A2.y).dirAt(p.x, p.y, tmp)) {
          mx = tmp.x;
          my = tmp.y;
        }
      }
    } else if (A2.move === 'heading') {
      mx = Math.cos(A2.heading);
      my = Math.sin(A2.heading);
    }
    const sp = A2.speed ?? 1;
    if (mx || my) {
      const s = v.dirToScreen(mx, my, tmp2);
      const l = Math.hypot(s.x, s.y) || 1;
      f.move.x = (s.x / l) * sp;
      f.move.y = (s.y / l) * sp;
    }
    // Aim and fire at the best target in reach (or at a fixed point: a pump, an alarm car).
    if (A2.aimAt) {
      const ang = Math.atan2(A2.aimAt.y - p.y, A2.aimAt.x - p.x);
      const s = v.dirToScreen(Math.cos(ang), Math.sin(ang), tmp2);
      const l = Math.hypot(s.x, s.y) || 1;
      f.aimActive = true;
      f.aimX = s.x / l;
      f.aimY = s.y / l;
      f.aimRaw = 1;
      f.fire = A2.fireAt !== false;
      f.assist = false;
    } else if (A2.fire !== false) {
      f.assist = true;
      const z = pickTarget(game, A2);
      T.vars.target = z;
      if (z) {
        const ang = Math.atan2(z.y - p.y, z.x - p.x);
        const s = v.dirToScreen(Math.cos(ang), Math.sin(ang), tmp2);
        const l = Math.hypot(s.x, s.y) || 1;
        f.aimActive = true;
        f.aimX = s.x / l;
        f.aimY = s.y / l;
        f.aimRaw = 1;
        f.fire = true;
      }
    } else if (A2.aimHeading !== undefined) {
      const s = v.dirToScreen(Math.cos(A2.aimHeading), Math.sin(A2.aimHeading), tmp2);
      const l = Math.hypot(s.x, s.y) || 1;
      f.aimActive = true;
      f.aimX = s.x / l;
      f.aimY = s.y / l;
      f.aimRaw = 1;
    }
    // Shove what's on us.
    if (A2.shove !== false && p.shoveCd <= 0 && p.shoveFatigue < 0.55 && crowded(game, 44) >= (A2.shoveAt ?? 1)) f.events.push('shove');
    if (p.pinnedBy) f.events.push('shove'); // mash out of a Hunter
    return f;
  };
  P.input.sample = () => T.autoFrame();

  // --- Camera override ------------------------------------------------------------------------
  const syncView = g.syncView.bind(g);
  g.syncView = function syncViewT() {
    syncView();
    const C = T.cam;
    if (!C || C.x === undefined) return;
    const v = this.view;
    v.setAngles(C.yaw, C.pitch);
    const { w, h } = this.viewport;
    v.setViewport(w, h, (Math.min(w, h) / C.viewSize) * (1 + 0.42 * (1 - v.sp)));
    const c = this.camera;
    const sh = C.shake ?? 1;
    v.lookAt(C.x, C.y, c.shakeX * sh, c.shakeY * sh, C.lift ?? 18);
  };
  const updateCamera = g.updateCamera.bind(g);
  g.updateCamera = function updateCameraT(dt, input) {
    updateCamera(dt, input);
    const C = T.cam;
    if (!C) return;
    const p = this.player;
    const a = this.ally;
    let tx = p.x;
    let ty = p.y;
    if (C.mode === 'fixed') {
      tx = C.tx;
      ty = C.ty;
    } else if (C.mode === 'pair' && a && a.alive) {
      const k = C.pairK ?? 0.5;
      tx = p.x + (a.x - p.x) * k;
      ty = p.y + (a.y - p.y) * k;
    } else if (C.mode === 'thing' && C.thing) {
      tx = C.thing.x;
      ty = C.thing.y;
    }
    if (C.lead) {
      // + leads ahead of where they're running, - trails behind them (the horde's side).
      const s = Math.hypot(p.vx, p.vy);
      if (s > 30) {
        C.hx = C.hx === undefined ? p.vx / s : C.hx + (p.vx / s - C.hx) * Math.min(1, dt * 2);
        C.hy = C.hy === undefined ? p.vy / s : C.hy + (p.vy / s - C.hy) * Math.min(1, dt * 2);
      }
      if (C.hx !== undefined) {
        tx += C.hx * C.lead;
        ty += C.hy * C.lead;
      }
    }
    tx += C.offX || 0;
    ty += C.offY || 0;
    if (C.x === undefined || C.snap) {
      C.x = tx;
      C.y = ty;
      C.snap = false;
    }
    const k = 1 - Math.exp(-(C.stiff ?? 5) * dt);
    C.x += (tx - C.x) * k;
    C.y += (ty - C.y) * k;
    this.syncView();
  };

  /** Put the two survivors at (x, y), facing `ang`, the teammate a step behind; the camera jumps there. */
  T.place = (x, y, ang = 0, allyBack = 60, allySide = 40) => {
    const game = P.game;
    const p = game.player;
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.facing = ang;
    p.aimAngle = ang;
    p.fireAngle = ang;
    const a = game.ally;
    if (a) {
      let ax = x - Math.cos(ang) * allyBack - Math.sin(ang) * allySide;
      let ay = y - Math.sin(ang) * allyBack + Math.cos(ang) * allySide;
      if (!game.world.isFree(ax, ay, a.r + 2)) {
        const s = mods.ally.allySpotNear(game, x, y, ang);
        if (s) {
          ax = s.x;
          ay = s.y;
        }
      }
      a.x = ax;
      a.y = ay;
      a.vx = 0;
      a.vy = 0;
      a.facing = ang;
      a.aimAngle = ang;
      a.lastX = ax;
      a.lastY = ay;
      a.stuckT = 0;
    }
    game.world.flow.compute(x, y);
    game.camera.x = x;
    game.camera.y = y;
    game.camera.lookX = 0;
    game.camera.lookY = 0;
    if (T.cam) T.cam.snap = true;
  };
  /** A crowd of n infected in a disc around (x, y); alerted ones come running at once. */
  T.crowd = (x, y, n, radius = 160, alerted = true) => {
    const game = P.game;
    let made = 0;
    for (let k = 0; k < n * 6 && made < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      const zx = x + Math.cos(a) * r;
      const zy = y + Math.sin(a) * r;
      if (!game.world.isFree(zx, zy, 11) || game.world.sealedAt(zx, zy)) continue;
      const z = new mods.zombies.Zombie(zx, zy, alerted);
      if (alerted) z.alertDelay = Math.random() * 0.6;
      game.zombies.push(z);
      made++;
    }
    return made;
  };
  /** Keep the teammate standing (hits still land and knock it about) unless T.allyGod is off. */
  const hurtAlly = g.hurtAlly.bind(g);
  g.hurtAlly = function hurtAllyT(dmg, src, opts) {
    const a = this.ally;
    if (T.allyGod && a && !a.down) dmg = Math.min(dmg, Math.max(0, a.hp - 20));
    return hurtAlly(dmg, src, opts);
  };
  /** A point `frac` of the way along the route to the goal, and the heading there. */
  T.routePoint = (frac) => {
    const game = P.game;
    const F = game.goalField;
    const m = game.world.map;
    let x = m.start.x;
    let y = m.start.y;
    const goal = game.routeLen * (1 - frac);
    const d = { x: 1, y: 0 };
    for (let i = 0; i < 4000; i++) {
      if (F.pathDist(x, y) <= goal) break;
      if (!F.dirAt(x, y, d)) break;
      x += d.x * 12;
      y += d.y * 12;
    }
    return { x, y, dir: Math.atan2(d.y, d.x) };
  };
  /** Clear the infected (not specials) out of a disc: a stage for a set piece. */
  T.clear = (x, y, r) => {
    for (const z of P.game.zombies) if (z.alive && z.type === 'common' && (z.x - x) ** 2 + (z.y - y) ** 2 < r * r) z.alive = false;
  };
  /** The camera yaw that looks from (fx, fy) toward (tx, ty) along the ground. */
  T.yawFrom = (fx, fy, tx, ty) => {
    const gx = fx - tx;
    const gy = fy - ty;
    return Math.atan2(-gx, gy);
  };
  /** Zombies within r of (x, y) (alive, not the Witch). */
  T.countNear = (x, y, r) => {
    let n = 0;
    for (const z of P.game.zombies) if (z.alive && z.type !== 'witch' && (z.x - x) ** 2 + (z.y - y) ** 2 < r * r) n++;
    return n;
  };

  T.step = (dtSec, capture, quality) => {
    T.frameNo++;
    const game = P.game;
    if (T.script) T.script(game, T, dtSec, T.st, T.vars);
    T.st += dtSec;
    window.__tick(dtSec * 1000);
    if (!capture) return null;
    return document.getElementById('game').toDataURL('image/jpeg', quality);
  };

  // Into the game: no title card, no rating card.
  P.settings.playtestPrompt = false;
  P.start();
  return true;
}

/** A function's source as an expression (method shorthand `name(a) {}` becomes `function name(a) {}`). */
export function fnSource(fn) {
  const src = fn.toString().trim();
  if (/^(async\s+)?function\b/.test(src) || /^(async\s*)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(src)) return src;
  if (/^async\s+/.test(src)) return `async function ${src.replace(/^async\s+/, '')}`;
  return `function ${src}`;
}

export class Rig {
  constructor({ width = 960, height = 540, scale = 2, quality = 0.93, verbose = false } = {}) {
    Object.assign(this, { width, height, scale, quality, verbose });
  }

  async open(settings = {}, seed = 1) {
    this.browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
    this.context = await this.browser.newContext({ viewport: { width: this.width, height: this.height }, deviceScaleFactor: this.scale });
    await this.context.route(`${ORIGIN}/**`, (route) => {
      const url = new URL(route.request().url());
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        return route.fulfill({ status: 404, body: 'not found' });
      }
      let body = fs.readFileSync(file);
      if (rel === '/src/render/hud.js') body = Buffer.from(patchHud(body.toString('utf8')));
      return route.fulfill({ status: 200, body, headers: { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' } });
    });
    await this.context.addInitScript(initPage, { settings, seed });
    this.page = await this.context.newPage();
    this.page.on('pageerror', (e) => console.error('[page error]', e.message));
    this.page.on('console', (m) => {
      if (this.verbose || m.type() === 'error') console.log(`[page ${m.type()}]`, m.text());
    });
    await this.page.goto(`${ORIGIN}/index.html`);
    await this.page.waitForFunction(() => document.documentElement.classList.contains('booted'), null, { timeout: 30000 });
    await this.page.evaluate(installRuntime);
    return this;
  }

  /** Run a function in the page: (game, T, arg) => value. */
  async run(fn, arg) {
    return this.page.evaluate(
      ([src, a]) => {
        // eslint-disable-next-line no-new-func
        const f = new Function(`return (${src})`)();
        return f(window.__p0.game, window.__T, a, window.__p0);
      },
      [fnSource(fn), arg],
    );
  }

  /** Install a per-frame script: (game, T, dt) => void (it sees T.vars and T.time0). */
  async script(fn, vars = {}) {
    await this.page.evaluate(
      ([src, v]) => {
        // eslint-disable-next-line no-new-func
        const f = src ? new Function(`return (${src})`)() : null;
        Object.assign(window.__T.vars, v);
        window.__T.script = f;
      },
      [fn ? fnSource(fn) : null, vars],
    );
  }

  /** A fresh run: settings on top of what's set, a map seed and a random seed. */
  async newRun({ settings = {}, seed = 1337, rseed = 1 } = {}) {
    await this.page.evaluate(
      ([s, sd, rs]) => {
        const P = window.__p0;
        Object.assign(P.settings, s);
        window.__reseed(rs);
        P.newRun(sd);
        const T = window.__T;
        T.log.length = 0;
        T.frameNo = 0;
        T.st = 0;
        T.cam = null;
        T.auto = null;
        T.script = null;
        T.vars = {};
        T.allyGod = true;
        T.messages = false;
        T.hide = 'CRYING|IN PEACE|WITCH|SHE HEARD|SITS NEARBY|HEALED|\\+\\d+ HP|STASH|FOUND|ARMOR|ROUNDS|ADRENALINE|MAGS|MEDKIT|AMMO';
        T.vignette = 0.35;
        T.msgScale = 2;
        T.boss = false;
        T.ferryBar = false;
      },
      [settings, seed, rseed],
    );
  }

  /** Advance the game without filming (rendering off unless asked). */
  async preroll(seconds, { dt = 1 / 20, render = false } = {}) {
    await this.page.evaluate(
      ([secs, d, r]) => {
        const T = window.__T;
        T.render = r;
        let t = 0;
        while (t < secs - 1e-9) {
          T.step(Math.min(d, secs - t), false);
          t += d;
        }
        T.render = true;
      },
      [seconds, dt, render],
    );
  }

  /**
   * Film `frames` frames into dir/NNNNN.jpg. `speed` (or speed(i) -> number) is game seconds per
   * second of film: 1 = real time, 0.3 = slow motion. Returns the sound log for the shot.
   */
  async film(dir, frames, { fps = 30, speed = 1, onFrame = null, from = 0 } = {}) {
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < frames; i++) {
      const sp = typeof speed === 'function' ? speed(i) : speed;
      const data = await this.page.evaluate(([d, q]) => window.__T.step(d, true, q), [sp / fps, this.quality]);
      fs.writeFileSync(path.join(dir, `${String(from + i).padStart(5, '0')}.jpg`), Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
      if (onFrame) await onFrame(i);
    }
    return this.page.evaluate(() => window.__T.log.slice());
  }

  async still(file) {
    const data = await this.page.evaluate(([q]) => {
      window.__T.step(1 / 60, false);
      return document.getElementById('game').toDataURL('image/jpeg', q);
    }, [this.quality]);
    fs.writeFileSync(file, Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
  }

  async close() {
    if (this.browser) await this.browser.close();
  }
}
