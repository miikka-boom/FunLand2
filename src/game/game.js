// Game state + per-frame orchestration.

import { generateCity } from '../world/map-gen.js';
import { generateBuilding } from '../world/building-gen.js';
import { World, SpatialHash, FlowField } from '../world/world.js';
import { Player, updatePlayer, shove, startReload, swapWeapon } from './player.js';
import { updateZombies, resolveCrowd, alertZombie } from './zombies.js';
import { updateSpecials, updateRocks, releasePin } from './specials.js';
import { Director } from './director.js';
import { Effects } from './effects.js';
import { dampFactor, pointInRect, rand } from '../util.js';

export class Game {
  constructor(settings, audio, haptics) {
    this.settings = settings;
    this.audio = audio;
    this._haptics = haptics;
    this.view = { w: 1, h: 1, scale: 1 }; // CSS px viewport + world->CSS scale
    this.newRun();
  }

  newRun(seed = this.settings.seed) {
    this.audio.alarmStop();
    this.audio.tankMusic(false);
    const gen = this.settings.level === 'interior' ? generateBuilding : generateCity;
    let map = gen(seed);
    let world = new World(map);
    // Paranoia: if the goal were ever unreachable, step the seed.
    for (let k = 1; k < 6; k++) {
      world.flow.compute(map.start.x, map.start.y);
      const er = map.endRoom.interior;
      if (Number.isFinite(world.flow.pathDist(er.x + er.w / 2, er.y + er.h / 2))) break;
      map = gen(seed + k);
      world = new World(map);
    }
    this.world = world;
    // Static field toward the goal: route progress (places the Tank) and the
    // walking distance shown on the safe-room arrow.
    this.goalField = new FlowField(world);
    const er = map.endRoom.interior;
    this.goalField.compute(er.x + er.w / 2, er.y + er.h / 2);
    this.routeLen = Math.max(1, this.goalField.pathDist(map.start.x, map.start.y));
    this.goalDist = this.routeLen;
    this.progress = 0;
    this.player = new Player(map.start.x, map.start.y);
    this.zombies = [];
    this.rocks = [];
    this.zhash = new SpatialHash(map.w, map.h, 48);
    this.effects = new Effects(map.w, map.h);
    // Any pickup that landed in an unreachable pocket is nudged to the nearest reachable spot.
    world.flow.compute(map.start.x, map.start.y);
    this.pickups = [];
    for (const p of map.pickups) {
      const spot = world.reachableSpot(p.x, p.y, world.flow);
      if (spot) this.pickups.push({ ...p, x: spot.x, y: spot.y, taken: false, bob: rand(0, 6) });
    }
    this.director = new Director(this);
    this.camera = { x: map.start.x, y: map.start.y, lookX: 0, lookY: 0, kickX: 0, kickY: 0, trauma: 0, shakeX: 0, shakeY: 0 };
    this.time = 0;
    this.flowT = 0;
    this.fireT = 0;
    this.won = false;
    this.lost = false;
    this.endT = 0;
    this.hurtFlash = 0;
    this.messages = [];
    this.stats = {
      kills: 0, shots: 0, hits: 0, shoves: 0, damage: 0, hordes: 0, time: 0,
      hunters: 0, skeets: 0, deadstops: 0, pins: 0, breakFrees: 0, tanks: 0, rocksShot: 0,
    };
    this.world.flow.compute(this.player.x, this.player.y);
    this.director.populate();
  }

  // --- Services used by entities -------------------------------------------

  haptic(ms, isShot = false) {
    const mode = this.settings.haptics;
    if (mode === 'off' || (isShot && mode !== 'full')) return;
    this._haptics(ms);
  }

  addTrauma(t) {
    this.camera.trauma = Math.min(1, this.camera.trauma + t * this.settings.screenShake);
  }

  kickCamera(x, y) {
    this.camera.kickX += x * this.settings.screenShake;
    this.camera.kickY += y * this.settings.screenShake;
  }

  announce(text, color = '#fff', dur = 2, size = 'big') {
    if (size === 'small') this.messages = this.messages.filter((m) => m.size !== 'small');
    this.messages.push({ text, color, t: 0, dur, size });
  }

  /** Gunfire etc.: idle zombies within the radius come running. */
  noise(x, y, radius) {
    const r2 = radius * radius;
    for (const z of this.zombies) {
      if (!z.alive || z.state !== 'idle') continue;
      const d2 = (z.x - x) ** 2 + (z.y - y) ** 2;
      if (d2 < r2) alertZombie(this, z, 0.1 + (Math.sqrt(d2) / radius) * 0.6 + rand(0, 0.3), false);
    }
  }

  hurtPlayer(dmg, z, opts = {}) {
    const p = this.player;
    if (!p.alive || this.won) return;
    if (!this.settings.godMode) p.hp -= dmg;
    this.stats.damage += dmg;
    const slow = opts.slow === undefined ? 0.35 : opts.slow;
    if (slow > 0) p.slowT = Math.max(p.slowT, slow);
    p.hurtT = 0.25;
    this.hurtFlash = Math.min(1, this.hurtFlash + (opts.pinned ? 0.18 : 0.45));
    this.addTrauma(opts.pinned ? 0.08 : 0.22);
    if (z) {
      const dx = p.x - z.x;
      const dy = p.y - z.y;
      const d = Math.hypot(dx, dy) || 1;
      if (!p.pinnedBy) {
        const knock = opts.knock === undefined ? 60 : opts.knock;
        p.vx += (dx / d) * knock;
        p.vy += (dy / d) * knock;
        if (opts.knockT) p.knockT = Math.max(p.knockT, opts.knockT);
      }
      this.effects.blood(p.x, p.y, dx / d, dy / d, 2, 120);
    }
    this.audio.hurt();
    this.haptic(35);
    this.director.addIntensity(dmg / 32);
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      this.lost = true;
      this.endT = 0;
      this.audio.death();
      this.haptic(200);
      this.announce('YOU DIED', '#ff5a4a', 999);
    }
  }

  // --- View helpers ----------------------------------------------------------

  setViewport(w, h) {
    this.view.w = w;
    this.view.h = h;
    this.view.scale = Math.min(w, h) / this.settings.viewSize;
  }

  worldToScreen(x, y) {
    const v = this.view;
    const c = this.camera;
    return { x: (x - c.x - c.shakeX) * v.scale + v.w / 2, y: (y - c.y - c.shakeY) * v.scale + v.h / 2 };
  }

  /** World rect currently on screen, padded. */
  viewRect(pad = 0) {
    const v = this.view;
    const c = this.camera;
    const hw = v.w / 2 / v.scale + pad;
    const hh = v.h / 2 / v.scale + pad;
    return { x: c.x - hw, y: c.y - hh, w: hw * 2, h: hh * 2 };
  }

  // --- Frame -------------------------------------------------------------------

  update(dt, input) {
    const S = this.settings;
    const p = this.player;
    this.time += dt;
    this.view.scale = Math.min(this.view.w, this.view.h) / S.viewSize;

    for (const ev of input.events) {
      if (this.won || this.lost) break;
      if (ev === 'shove') shove(this);
      else if (ev === 'reload') startReload(this, p);
      else if (ev === 'swap') swapWeapon(this, p);
    }

    if (!this.won && !this.lost) this.stats.time += dt;
    updatePlayer(this, dt, input);

    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.flowT = 0.25;
      this.world.flow.compute(p.x, p.y);
    }

    this.director.update(dt);
    updateZombies(this, dt);
    updateSpecials(this, dt);
    resolveCrowd(this);
    updateRocks(this, dt);
    const gd = this.goalField.pathDist(p.x, p.y);
    if (Number.isFinite(gd)) {
      this.goalDist = gd;
      this.progress = Math.min(1, Math.max(this.progress, 1 - gd / this.routeLen));
    }

    // Drop removed zombies in place.
    let j = 0;
    for (let i = 0; i < this.zombies.length; i++) if (this.zombies[i].alive) this.zombies[j++] = this.zombies[i];
    this.zombies.length = j;

    // Pickups.
    for (const k of this.pickups) {
      if (k.taken || !p.alive) continue;
      if (Math.hypot(k.x - p.x, k.y - p.y) < p.r + 14 && p.hp < p.maxHp) {
        k.taken = true;
        const heal = Math.round(Math.max(30, (p.maxHp - p.hp) * 0.8));
        p.hp = Math.min(p.maxHp, p.hp + heal);
        this.audio.pickup();
        this.haptic(15);
        this.announce(`+${heal} HP`, '#7dffa1', 1.1, 'small');
      }
    }

    // Burning wrecks: smoke + embers near the camera.
    this.fireT -= dt;
    if (this.fireT <= 0) {
      this.fireT = 0.1;
      const vr = this.viewRect(200);
      for (const f of this.world.map.fires) {
        if (!pointInRect(f.x, f.y, vr)) continue;
        this.effects.smoke(f.x, f.y - 6, rand(8, 14));
        if (Math.random() < 0.6) this.effects.ember(f.x, f.y);
      }
    }

    this.effects.update(dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.6);

    // Win: reach the end safe room.
    const er = this.world.map.endRoom.interior;
    if (!this.won && !this.lost && p.alive && pointInRect(p.x, p.y, er)) {
      if (p.pinnedBy) releasePin(this);
      this.won = true;
      this.endT = 0;
      this.audio.win();
      this.announce('SAFE ROOM', '#7dffa1', 999);
    }
    if (this.won || this.lost) this.endT += dt;

    for (const m of this.messages) m.t += dt;
    this.messages = this.messages.filter((m) => m.t < m.dur);

    this.updateCamera(dt, input);
  }

  updateCamera(dt, input) {
    const S = this.settings;
    const p = this.player;
    const c = this.camera;
    const viewWorld = S.viewSize;
    // Lead toward the aim (strongest while firing), lightly toward travel otherwise.
    let lx = 0;
    let ly = 0;
    if (p.aimActive || p.aimHoldT > 0) {
      const amt = S.lookAhead * viewWorld * (p.firing ? 1 : 0.7);
      lx = Math.cos(p.fireAngle) * amt;
      ly = Math.sin(p.fireAngle) * amt;
    } else {
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 1) {
        const amt = S.lookAhead * viewWorld * 0.45 * Math.min(1, sp / S.moveSpeed);
        lx = (p.vx / sp) * amt;
        ly = (p.vy / sp) * amt;
      }
    }
    const kl = dampFactor(3.2, dt);
    c.lookX += (lx - c.lookX) * kl;
    c.lookY += (ly - c.lookY) * kl;
    const k = dampFactor(S.cameraStiffness, dt);
    c.x += (p.x + c.lookX - c.x) * k;
    c.y += (p.y + c.lookY - c.y) * k;

    // Recoil kick springs back; trauma-based shake (trauma^2 feels right).
    const kk = Math.exp(-18 * dt);
    c.kickX *= kk;
    c.kickY *= kk;
    c.trauma = Math.max(0, c.trauma - dt * 1.7);
    const sh = c.trauma * c.trauma * 14;
    const t = this.time * 38;
    // kick is stored opposite to the shot, so the camera recoils backwards.
    c.shakeX = (Math.sin(t * 1.13) + Math.sin(t * 2.71) * 0.5) * sh * 0.66 + c.kickX;
    c.shakeY = (Math.cos(t * 1.37) + Math.sin(t * 3.07) * 0.5) * sh * 0.66 + c.kickY;
  }
}
