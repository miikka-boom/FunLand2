// The stage: everything one shot of the trailer needs.
//
//   Take    one shot, live: its own Game (map, seed, settings), the squad of four dressed
//           and placed, a camera rig, the lead survivor's autopilot and the shot's script.
//           It steps the simulation on the film clock (with slow motion where the shot asks)
//           and runs a few seconds before its first frame (prewarm), with the sound off, so
//           the action is already going when the cut lands.
//   Lead    the autopilot that plays the lead survivor (game.player) through the same input
//           frame a thumb or a pad would give it: walk somewhere, shoot what comes, shove
//           what gets close.
//   Rig     the camera: where it looks, how close (viewSize), its tilt and its turn (yaw),
//           plus the game's own shake.
//
// The other three survivors are the game's AI teammates (src/game/ally.js), as many as the
// engine now allows (game.allies). Nothing here changes how the game plays: it is filmed.

import { clock, reseed, useDice, hashSeed } from './clock.js';
import { Game } from '../../src/game/game.js';
import { DEFAULTS } from '../../src/settings.js';
import { FlowField } from '../../src/world/world.js';
import { WEAPONS } from '../../src/game/weapons.js';
import { PLAYER_LOOK, ALLY_LOOK } from '../../src/render/figures.js';
import { DEG, clamp, wrapAngle } from '../../src/util.js';

// --- The squad -----------------------------------------------------------------------------

export const LOOKS = {
  teo: { ...PLAYER_LOOK }, // the teal jacket the game gives you
  mags: { ...ALLY_LOOK }, // the teammate's olive one
  odile: { ring: 'rgba(214,168,255,0.55)', arms: '#c79a7c', pack: '#33283a', body: '#7c50a6', hair: '#17110e', skin: '#b4805f', legs: '#2b2838', dead: '#4b3463' },
  lou: { ring: 'rgba(255,212,112,0.55)', arms: '#a9785a', pack: '#3b3022', body: '#b98c2a', hair: '#2e2219', skin: '#9a6a4b', legs: '#30323a', dead: '#6e5620' },
};

/** Who's who (Lou is big). Any of them can lead (game.player); the others are AI teammates. */
export const SQUAD = [
  { id: 'teo', name: 'TEO', look: LOOKS.teo, weapon: 'smg' },
  { id: 'mags', name: 'MAGS', look: LOOKS.mags, weapon: 'shotgun' },
  { id: 'odile', name: 'ODILE', look: LOOKS.odile, weapon: 'rifle' },
  { id: 'lou', name: 'LOU', look: LOOKS.lou, weapon: 'hunting', r: 13.5 },
];

/** Where the followers walk, in order: behind and beside the lead's heading (side 0: right behind). */
export const SLOTS = [
  { back: 46, side: 44 },
  { back: 46, side: -44 },
  { back: 92, side: 0 },
];

/** Settings every shot starts from (a shot's own `settings` go on top). */
const BASE = {
  playtestPrompt: false,
  daily: false,
  ally: false, // the stage brings its own squad
  laser: false, // no laser sights on film
  haptics: 'off',
  godMode: true, // the lead never dies on camera
  showDebug: false,
  threatIndicators: false,
};

const SILENT = new Proxy({ listener: { x: 0, y: 0 } }, { get: (o, k) => (k in o ? o[k] : () => null) });

const ease = {
  linear: (u) => u,
  in: (u) => u * u * u,
  out: (u) => 1 - (1 - u) ** 3,
  inOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
  sine: (u) => 0.5 - Math.cos(Math.PI * u) / 2,
};
export const EASE = ease;
const lerp = (a, b, u) => a + (b - a) * u;

/** A camera value: a number, [from, to] over the shot, or a function of (u, lt). */
function value(spec, u, lt, fallback) {
  if (spec === undefined || spec === null) return fallback;
  if (typeof spec === 'function') return spec(u, lt);
  if (Array.isArray(spec)) return lerp(spec[0], spec[1], u);
  return spec;
}

// --- The camera -----------------------------------------------------------------------------

export class Rig {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.viewSize = 470;
    this.tilt = 75; // degrees above the horizon (90: straight down)
    this.yaw = 0; // degrees: 0 streets along the screen, 45 the isometric turn
    this.lift = 18;
    this.shakeX = 0;
    this.shakeY = 0;
    this.placed = false;
  }

  /** Push this rig into the game's view (replaces Game.syncView for a take). */
  apply(game) {
    const v = game.view;
    v.setAngles(this.yaw * DEG, this.tilt * DEG);
    const { w, h } = game.viewport;
    v.setViewport(w, h, Math.min(w, h) / this.viewSize);
    v.lookAt(this.x, this.y, this.shakeX, this.shakeY, v.flat ? 0 : this.lift);
  }
}

// --- The lead's autopilot -------------------------------------------------------------------

const tmp = { x: 0, y: 0 };

export class Lead {
  constructor(game) {
    this.game = game;
    this.flow = null;
    this.flowGoal = null;
    this.aim = game.player.facing;
    this.target = null;
    this.thinkT = 0;
    this.plan = { goal: null, speed: 1, arrive: 24, fire: true, shove: true, face: null, aimAt: null, shootIdle: false, wobble: 1 };
    this.frameOut = { source: 'gamepad', move: { x: 0, y: 0 }, aimActive: false, aimX: 1, aimY: 0, aimRaw: 1, aimScreen: null, fire: false, assist: true, events: [] };
  }

  /** Change what it's doing: { goal: {x, y} | null, speed, fire, shove, face (rad), aimAt ({x, y} | zombie), ... }. */
  set(plan) {
    Object.assign(this.plan, plan);
  }

  _dirTo(gx, gy, out) {
    const g = this.game;
    const p = g.player;
    const W = g.world;
    if (W.segmentClear(p.x, p.y, gx, gy, W.moveBlockers)) {
      const d = Math.hypot(gx - p.x, gy - p.y) || 1;
      out.x = (gx - p.x) / d;
      out.y = (gy - p.y) / d;
      return true;
    }
    if (!this.flow) this.flow = new FlowField(W);
    if (!this.flowGoal || this.flowGoal.x !== gx || this.flowGoal.y !== gy) {
      this.flow.compute(gx, gy);
      this.flowGoal = { x: gx, y: gy };
    }
    return this.flow.dirAt(p.x, p.y, out);
  }

  _pick() {
    const g = this.game;
    const p = g.player;
    const P = this.plan;
    const range = p.weapon.def.range * 0.92;
    const cands = [];
    for (const z of g.zombies) {
      if (!z.alive || z.ghost || z.passive) continue;
      if (z.type === 'common' && z.state !== 'chase' && !P.shootIdle) continue;
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      if (d > range) continue;
      let s = d / range;
      if (z.type !== 'common') s -= 0.5;
      if (d < 90) s -= 0.4;
      cands.push([s, z]);
    }
    for (const r of g.rocks) if (r.alive && Math.hypot(r.x - p.x, r.y - p.y) < range) cands.push([-1, r]);
    cands.sort((a, b) => a[0] - b[0]);
    const W = g.world;
    for (let i = 0; i < Math.min(cands.length, 6); i++) {
      const z = cands[i][1];
      if (W.segmentClear(p.x, p.y, z.x, z.y, W.shotBlockers)) return z;
    }
    return null;
  }

  /** This step's input frame. */
  frame(dt) {
    const g = this.game;
    const p = g.player;
    const P = this.plan;
    const f = this.frameOut;
    const v = g.view;
    f.events = [];
    f.move.x = 0;
    f.move.y = 0;
    f.fire = false;
    f.aimActive = false;
    if (!p.alive) return f;

    // Walk.
    let wx = 0;
    let wy = 0;
    if (P.goal && !p.pinnedBy) {
      const d = Math.hypot(P.goal.x - p.x, P.goal.y - p.y);
      if (d > P.arrive && this._dirTo(P.goal.x, P.goal.y, tmp)) {
        const k = P.speed * clamp(d / 60, 0.35, 1);
        wx = tmp.x * k;
        wy = tmp.y * k;
      }
    }
    if (wx || wy) {
      const s = v.dirToScreen(wx, wy, tmp);
      const m = Math.hypot(s.x, s.y) || 1;
      const k = Math.hypot(wx, wy);
      f.move.x = (s.x / m) * k;
      f.move.y = (s.y / m) * k;
    }

    // Aim and shoot.
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.12;
      this.target = P.fire ? this._pick() : null;
    }
    let want = null;
    let tol = 0;
    const t = P.aimAt && (P.aimAt.alive === undefined || P.aimAt.alive) ? P.aimAt : this.target && this.target.alive ? this.target : null;
    if (t) {
      const d = Math.hypot(t.x - p.x, t.y - p.y) || 1;
      want = Math.atan2(t.y - p.y, t.x - p.x);
      tol = Math.asin(Math.min(1, ((t.r || 14) + 3) / d)) + 2 * DEG;
    } else if (P.face !== null && P.face !== undefined) want = P.face;
    if (want !== null) {
      const turn = 11 * dt;
      this.aim += clamp(wrapAngle(want - this.aim), -turn, turn);
      // A thumb is never perfectly still.
      const wob = P.wobble * (Math.sin(g.time * 7.3) * 0.6 + Math.sin(g.time * 3.1) * 0.4) * 1.2 * DEG;
      const s = v.dirToScreen(Math.cos(this.aim + wob), Math.sin(this.aim + wob), tmp);
      const m = Math.hypot(s.x, s.y) || 1;
      f.aimActive = true;
      f.aimX = s.x / m;
      f.aimY = s.y / m;
      f.fire = !!t && (P.fire || P.aimAt) && Math.abs(wrapAngle(want - this.aim)) < tol && !p.pinnedBy;
    } else {
      this.aim = p.facing;
    }

    // Shove what's on you (and struggle out from under a Hunter).
    if (P.shove) {
      if (p.pinnedBy) {
        if (Math.random() < dt * 9) f.events.push('shove');
      } else if (p.shoveCd <= 0) {
        let close = false;
        g.zhash.query(p.x, p.y, 50, (z) => {
          if (close || !z.alive || z.noCollide || z.passive || z.type === 'tank') return;
          if (Math.hypot(z.x - p.x, z.y - p.y) - z.r < p.r + 9) close = true;
        });
        if (close) f.events.push('shove');
      }
    }
    return f;
  }
}

// --- A take ----------------------------------------------------------------------------------

export class Take {
  /**
   * @param shot     the shot (shots.js)
   * @param index    its place in the film (each take is a new "run" for the sound)
   * @param audio    the game sound (src/audio.js Audio) the take plays through
   * @param viewport { w, h } CSS px
   */
  constructor(shot, index, audio, viewport) {
    this.shot = shot;
    this.audio = audio;
    this.dice = reseed(hashSeed(shot.id) ^ (shot.rng || 0));
    const settings = { ...DEFAULTS, ...BASE, level: shot.level || 'city', seed: shot.seed === undefined ? 1337 : shot.seed, ...(shot.settings || {}) };
    const game = new Game(settings, SILENT, () => {});
    this.game = game;
    game.runSerial = 1000 + index;
    game.setViewport(viewport.w, viewport.h);
    const rig = (this.rig = new Rig());
    game.syncView = () => rig.apply(game);
    game.updateCamera = () => {};
    this.lead = new Lead(game);
    this.squad = [];
    this.lt = -(shot.prewarm || 0); // film-local time (s from the cut; negative while prewarming)
    this.simT = this.lt;
    this.fired = new Set();
    this.ctx = { take: this, game, lead: this.lead, squad: this.squad, rig, shot, data: {} };

    if (shot.director === false) game.director.update = () => {};
    else if (shot.director === 'quiet') {
      // The Director keeps the wanderers topped up but throws no mobs of its own.
      const D = game.director;
      const update = D.update.bind(D);
      D.update = (dt) => {
        D.mobT = 999;
        D.trickleT = 999;
        update(dt);
      };
    }
    if (shot.clearZombies) game.zombies = game.zombies.filter((z) => z.type === 'witch');

    this.placeSquad();
    if (shot.setup) shot.setup(this.ctx);
    this.cameraStep(0, true);

    // Prewarm, silent.
    while (this.lt < -1e-9) this.step(Math.min(1 / 60, -this.lt));
    game.audio = audio || SILENT;
  }

  /** The squad, dressed and in formation, at shot.squad.at (default: the start room). */
  placeSquad() {
    const g = this.game;
    const shot = this.shot;
    const spec = shot.squad || {};
    const map = g.world.map;
    const at = typeof spec.at === 'function' ? spec.at(this.ctx) : spec.at || { x: map.start.x, y: map.start.y };
    const facing = at.facing !== undefined ? at.facing : spec.facing !== undefined ? spec.facing : -Math.PI / 2;
    const members = (spec.members || SQUAD.map((m) => m.id)).map((id) => SQUAD.find((m) => m.id === id));
    const p = g.player;
    p.x = at.x;
    p.y = at.y;
    p.facing = facing;
    p.aimAngle = facing;
    p.fireAngle = facing;
    this.lead.aim = facing;
    if (!members.length) return;
    const lead = members[0];
    p.look = lead.look;
    p.name = lead.name;
    const wid = (spec.weapons && spec.weapons[lead.id]) || lead.weapon;
    p.wi = Math.max(0, WEAPONS.findIndex((w) => w.id === wid));
    this.squad.push(p);
    const ca = Math.cos(facing);
    const sa = Math.sin(facing);
    members.slice(1).forEach((m, i) => {
      const { back, side } = SLOTS[i % SLOTS.length];
      const off = spec.offsets && spec.offsets[m.id];
      let x = off ? at.x + off[0] : at.x - ca * back - sa * side;
      let y = off ? at.y + off[1] : at.y - sa * back + ca * side;
      if (!g.world.isFree(x, y, (m.r || 12) + 2)) {
        const s = g.world.reachableSpot(x, y, g.world.flow);
        if (s) {
          x = s.x;
          y = s.y;
        }
      }
      const a = g.addAlly((spec.weapons && spec.weapons[m.id]) || m.weapon, { x, y });
      a.look = m.look;
      a.name = m.name;
      a.spotBack = back;
      a.spotSide = Math.abs(side);
      a.side = side < 0 ? -1 : 1;
      a.facing = facing;
      a.aimAngle = facing;
      if (m.r) a.r = m.r;
      a.hp = a.maxHp = spec.allyHp || 400; // they only go down when a shot says so
      if (spec.hold) {
        // Staged: it stays where it was put (still turns, aims and shoots).
        a.spotT = 1e9;
        a.spotX = x;
        a.spotY = y;
      }
      this.squad.push(a);
    });
    for (const s of this.squad) s.squadId = (SQUAD.find((m) => m.name === s.name) || {}).id;
  }

  /** A survivor of the squad by id ('teo', 'mags', 'odile', 'lou'). */
  who(id) {
    return this.squad.find((s) => s.squadId === id) || null;
  }

  /** Where the squad is (the survivors still standing). */
  centroid(out = { x: 0, y: 0 }) {
    let n = 0;
    out.x = 0;
    out.y = 0;
    for (const s of this.squad) {
      if (!s.alive) continue;
      out.x += s.x;
      out.y += s.y;
      n++;
    }
    if (!n) {
      out.x = this.game.player.x;
      out.y = this.game.player.y;
    } else {
      out.x /= n;
      out.y /= n;
    }
    return out;
  }

  /** One step of film time (dt seconds on screen; the shot's rate makes it slower or faster in the game). */
  step(dt) {
    const shot = this.shot;
    const g = this.game;
    const rate = shot.rate ? shot.rate(this.lt, this.ctx) : 1;
    const sdt = dt * rate;
    // Script cues are on the film clock (lt), so they land on the music.
    if (shot.cues) {
      for (const c of shot.cues) {
        if (this.fired.has(c) || c.t > this.lt + dt * 0.5) continue;
        this.fired.add(c);
        c.run(this.ctx);
      }
    }
    if (shot.update) shot.update(this.ctx, this.lt, sdt);
    if (sdt > 0) {
      const input = this.lead.frame(sdt);
      g.update(sdt, input);
      g.camera.trauma = Math.max(0, g.camera.trauma - sdt * 1.7); // (Game.updateCamera did this)
      if (shot.after) shot.after(this.ctx, this.lt, sdt);
    }
    // The squad stays on its feet unless a shot puts someone down.
    for (const a of g.allies) if (a.alive && !a.down && a.hp < 120 && !a.mayFall) a.hp = 120;
    this.lt += dt;
    this.simT += sdt;
    this.cameraStep(dt, false);
  }

  /** Advance to film-local time lt, setting the film clock for whatever sounds the game makes. */
  advanceTo(lt, filmStart) {
    useDice(this.dice);
    while (this.lt < lt - 1e-9) {
      const dt = Math.min(1 / 60, lt - this.lt);
      clock.t = filmStart + this.lt + dt;
      this.step(dt);
    }
  }

  /** Keep the frame on the map: unproject its corners and slide the camera back in. */
  clampToMap() {
    const g = this.game;
    const rig = this.rig;
    const v = g.view;
    const W = g.world.w;
    const H = g.world.h;
    const sx = rig.shakeX;
    const sy = rig.shakeY;
    rig.shakeX = 0;
    rig.shakeY = 0;
    for (let pass = 0; pass < 2; pass++) {
      rig.apply(g);
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const [px, py] of [[0, 0], [v.w, 0], [0, v.h], [v.w, v.h]]) {
        const p = v.unproject(px, py, 0, tmp);
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      }
      let dx = 0;
      let dy = 0;
      if (x1 - x0 < W) dx = x0 < 0 ? -x0 : x1 > W ? W - x1 : 0;
      if (y1 - y0 < H) dy = y0 < 0 ? -y0 : y1 > H ? H - y1 : 0;
      if (!dx && !dy) break;
      rig.x += dx;
      rig.y += dy;
    }
    rig.shakeX = sx;
    rig.shakeY = sy;
  }

  /** Point the camera (once per step, so a render that starts mid-shot frames it the same). */
  cameraStep(dt, snap) {
    const shot = this.shot;
    const g = this.game;
    const rig = this.rig;
    const C = typeof shot.camera === 'function' ? shot.camera(this.ctx, this.lt) : shot.camera || {};
    const dur = shot.dur || 1;
    const lt = Math.max(0, this.lt);
    const u = (C.ease ? ease[C.ease] || ease.inOut : ease.inOut)(clamp(lt / dur, 0, 1));
    // What it looks at.
    let tx;
    let ty;
    const f = C.follow === undefined ? 'squad' : C.follow;
    if (f === 'squad') ({ x: tx, y: ty } = this.centroid(tmp));
    else if (f === 'lead') ({ x: tx, y: ty } = g.player);
    else if (typeof f === 'function') ({ x: tx, y: ty } = f(this.ctx, u, lt));
    else if (f.from) {
      tx = lerp(f.from.x, f.to.x, u);
      ty = lerp(f.from.y, f.to.y, u);
    } else ({ x: tx, y: ty } = f);
    if (C.offset) {
      tx += value(C.offset[0], u, lt, 0);
      ty += value(C.offset[1], u, lt, 0);
    }
    const k = snap || !rig.placed || !C.smooth ? 1 : 1 - Math.exp(-C.smooth * dt);
    rig.x += (tx - rig.x) * k;
    rig.y += (ty - rig.y) * k;
    rig.placed = true;
    // (A 9:16 cut sees less from side to side: pull back a little, so a shot framed for 16:9 still holds.)
    const portrait = g.viewport.h > g.viewport.w;
    rig.viewSize = value(C.zoom, u, lt, 470) * (portrait ? C.portraitZoom || 1.22 : 1);
    rig.tilt = value(C.tilt, u, lt, 75);
    rig.yaw = value(C.yaw, u, lt, 0);
    rig.lift = value(C.lift, u, lt, 18);
    if (C.clamp !== false) this.clampToMap();
    // The game's own shake (trauma), scaled per shot.
    const c = g.camera;
    const sh = c.trauma * c.trauma * 14 * (C.shake === undefined ? 1 : C.shake);
    const t = g.time * 38;
    rig.shakeX = (Math.sin(t * 1.13) + Math.sin(t * 2.71) * 0.5) * sh * 0.66;
    rig.shakeY = (Math.cos(t * 1.37) + Math.sin(t * 3.07) * 0.5) * sh * 0.66;
  }
}
