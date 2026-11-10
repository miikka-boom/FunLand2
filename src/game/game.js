// Game state + per-frame orchestration.

import { generateCity } from '../world/map-gen.js';
import { generateBuilding } from '../world/building-gen.js';
import { generateDocks } from '../world/docks-gen.js';
import { finaleOpen } from './finale.js';
import { addScavenging } from '../world/scavenge-gen.js';
import { addWorldFeatures } from '../world/features-gen.js';
import { worldSignature } from '../settings.js';
import { World, SpatialHash, FlowField } from '../world/world.js';
import { Player, updatePlayer, shove, startReload, swapWeapon } from './player.js';
import { updateZombies, resolveCrowd, alertZombie, ZHASH_CELL } from './zombies.js';
import { updateSpecials, updateRocks, releasePin } from './specials.js';
import { Director } from './director.js';
import { Ally, updateAlly, hurtAlly, allySpotNear } from './ally.js';
import { Effects } from './effects.js';
import { initLoot, spawnSleepers, updateLoot } from './loot.js';
import { initWorldEvents, updateWorldEvents, spawnNest, openBreach, takeAmmo } from './world-events.js';
import { addLore } from '../world/lore-gen.js';
import { addBen } from '../world/ben-gen.js';
import { loadBenMemory, initBen, updateBen } from './ben.js';
import { DEG, dampFactor, pointInRect, rand } from '../util.js';
import { todayKey, dailySeed } from '../playtest.js';
import { IsoView, ISO_YAW, ISO_PITCH } from '../iso.js';

// The isometric view shows more ground up and down the screen than the flat
// one did (it is foreshortened), so it is zoomed in a little to keep the
// survivor a good size. Scales with the tilt; nothing at straight-down.
const ISO_ZOOM = 0.42;
// The camera aims a little above the feet, so the body is what's centred.
const CAMERA_LIFT = 18;
const kickTmp = { x: 0, y: 0 };

export class Game {
  constructor(settings, audio, haptics) {
    this.settings = settings;
    this.audio = audio;
    this._haptics = haptics;
    // The camera: CSS px viewport, world->CSS scale and the 3D projection.
    this.view = new IsoView();
    this.viewport = { w: 1, h: 1 };
    this.syncView();
    this.newRun();
  }

  newRun(seed = this.settings.seed) {
    this.audio.alarmStop();
    this.audio.tankMusic(false);
    this.level = this.settings.level;
    // The daily map: today's date picks the seed, the same on every device.
    this.dailyKey = this.settings.daily ? todayKey() : null;
    if (this.dailyKey) seed = dailySeed(this.dailyKey);
    this.seed = seed;
    this.runSerial = (this.runSerial || 0) + 1;
    const gen = this.level === 'interior' ? generateBuilding : this.level === 'docks' ? generateDocks : generateCity;
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
    // World features, then scavenging (both change the map, so rebuild the world).
    const S = this.settings;
    this.worldSig = worldSignature(S);
    const base = map.obstacles.slice();
    // (Pier 9 has its own finale instead of the holdout gate / routes / landmarks.)
    if (map.theme !== 'docks' && (S.holdout || S.routes || S.landmarks)) addWorldFeatures(map, map.seed, { holdout: S.holdout, routes: S.routes, landmarks: S.landmarks });
    if (S.stashes || S.boardedRooms || S.secret) addScavenging(map, map.seed, { stashes: S.stashes, rooms: S.boardedRooms, secret: S.secret });
    if (S.lore) addLore(map, map.seed); // graffiti, posters, dens: visual only
    this.benMemory = loadBenMemory();
    if (S.ben) addBen(map, map.seed, { memory: this.benMemory, level: this.level }); // signs of Ben: visual only
    if (map.obstacles.length !== base.length || map.obstacles.some((o, i) => o !== base[i])) world = new World(map);
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
    this.zhash = new SpatialHash(map.w, map.h, ZHASH_CELL);
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
    this.syncView();
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
      allyKills: 0, allySaves: 0, allyDowns: 0, revives: 0,
      stashes: 0, rooms: 0, secrets: 0, boards: 0,
      holdouts: 0, holdoutAt: 0, holdoutTime: 0, shortcut: 0, explosions: 0,
      terrors: 0, terrorsFled: 0, terrorHits: 0, terrorShoves: 0,
      flareAt: 0, ferry: 0, benNest: 0, benGlimpse: 0,
    };
    this.terrorSeen = false;
    this.boards = map.obstacles.filter((o) => o.boards); // boarded rooms + the breach
    initLoot(this, map);
    initWorldEvents(this, map);
    initBen(this, map, this.benMemory);
    this.killCredit = null; // 'ally' while the teammate's bullets/shoves land
    this.world.flow.compute(this.player.x, this.player.y);
    this.ally = null;
    this.syncAlly();
    this.director.populate();
    spawnSleepers(this);
    spawnNest(this);
  }

  /** The breach boards came down: the short way is open. */
  onBreach(o) {
    openBreach(this, o);
  }

  /** Spawn or remove the AI teammate to match the setting (a dead one stays dead until the next run). */
  syncAlly() {
    if (!this.settings.ally) {
      this.ally = null;
      return;
    }
    if (this.ally) {
      if (this.ally.weapon.def.id !== this.settings.allyWeapon) this.ally.setWeapon(this.settings.allyWeapon);
      return;
    }
    const p = this.player;
    const spot = allySpotNear(this, p.x, p.y, p.facing) || { x: p.x, y: p.y };
    this.ally = new Ally(spot.x, spot.y, this.settings.allyWeapon);
    this.ally.facing = p.facing;
    this.ally.aimAngle = p.facing;
  }

  hurtAlly(dmg, src, opts) {
    hurtAlly(this, dmg, src, opts);
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
    let soaked = 0;
    if (!this.settings.godMode) {
      // Armor takes the hit first.
      soaked = Math.min(p.armor, dmg);
      p.armor -= soaked;
      p.hp -= dmg - soaked;
    }
    this.stats.damage += dmg;
    const slow = opts.slow === undefined ? 0.35 : opts.slow;
    if (slow > 0) p.slowT = Math.max(p.slowT, slow);
    p.hurtT = 0.25;
    const flash = opts.pinned ? 0.18 : 0.45;
    this.hurtFlash = Math.min(1, this.hurtFlash + (soaked >= dmg && dmg > 0 ? flash * 0.35 : flash));
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
    if (soaked > 0 && soaked >= dmg) this.audio.armorHit();
    else this.audio.hurt();
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
    this.viewport.w = w;
    this.viewport.h = h;
    this.syncView();
  }

  /**
   * Bring the projection up to date with the settings and the camera. Runs
   * after every update and before every draw, so the tuning panel's camera
   * controls show at once, even while paused.
   */
  syncView() {
    const S = this.settings;
    const v = this.view;
    const top = S.camera === 'top';
    v.setAngles(top ? 0 : ISO_YAW, top ? Math.PI / 2 : S.cameraTilt === 35 ? ISO_PITCH : S.cameraTilt * DEG);
    const { w, h } = this.viewport;
    v.setViewport(w, h, (Math.min(w, h) / S.viewSize) * (1 + ISO_ZOOM * (1 - v.sp)));
    const c = this.camera;
    if (c) v.lookAt(c.x, c.y, c.shakeX, c.shakeY, v.flat ? 0 : CAMERA_LIFT);
  }

  /** CSS px of a world point (z = height above the ground). */
  worldToScreen(x, y, z = 0) {
    return this.view.project(x, y, z);
  }

  /** World rect that takes in all the ground on screen, padded (coarse: the real view is a slanted box inside it). */
  viewRect(pad = 0) {
    return this.view.groundBounds(pad, 0);
  }

  /** Is this ground point on screen (padded by `pad` world units)? */
  onScreen(x, y, pad = 0) {
    return this.view.onScreen(x, y, pad * this.view.scale);
  }

  // --- Frame -------------------------------------------------------------------

  update(dt, input) {
    const S = this.settings;
    const p = this.player;
    this.time += dt;

    for (const ev of input.events) {
      if (this.won || this.lost) break;
      if (ev === 'shove') shove(this);
      else if (ev === 'reload') startReload(this, p);
      else if (ev === 'swap') swapWeapon(this, p);
    }

    if (!this.won && !this.lost) this.stats.time += dt;
    updatePlayer(this, dt, input);
    updateAlly(this, dt);

    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.flowT = 0.25;
      this.world.flow.compute(p.x, p.y);
    }

    this.director.update(dt);
    updateZombies(this, dt);
    updateSpecials(this, dt);
    resolveCrowd(this, dt);
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

    updateLoot(this, dt);
    updateWorldEvents(this, dt);
    updateBen(this, dt);

    // Pickups.
    for (const k of this.pickups) {
      if (k.pop !== undefined && k.pop < 1) k.pop = Math.min(1, k.pop + dt * 3);
      if (k.taken || !p.alive) continue;
      if (k.kind === 'ammo') {
        if (Math.hypot(k.x - p.x, k.y - p.y) < p.r + 14) takeAmmo(this, k);
        continue;
      }
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
        this.effects.smoke(f.x, f.y, rand(8, 14), 34);
        if (Math.random() < 0.6) this.effects.ember(f.x, f.y, 26);
      }
    }

    this.effects.update(dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.6);

    // Win: reach the end safe room (Pier 9: the gangway, once the ferry is alongside).
    const er = this.world.map.endRoom.interior;
    if (!this.won && !this.lost && p.alive && pointInRect(p.x, p.y, er) && finaleOpen(this.events && this.events.finale)) {
      if (p.pinnedBy) releasePin(this);
      this.won = true;
      this.endT = 0;
      this.audio.win();
      this.announce(this.level === 'docks' ? 'ABOARD!' : 'SAFE ROOM', '#7dffa1', 999);
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
    const v = this.view;
    const viewWorld = S.viewSize;
    // Lead toward the aim (strongest while firing), lightly toward travel otherwise.
    // The lead is the same distance on screen whichever way you face, so on
    // the foreshortened axis it reaches further over the ground.
    let lx = 0;
    let ly = 0;
    const lead = (ax, ay, amt) => {
      const s = v.dirToScreen(ax, ay, kickTmp);
      const k = amt / Math.max(0.5, Math.hypot(s.x, s.y));
      lx = ax * k;
      ly = ay * k;
    };
    if (p.aimActive || p.aimHoldT > 0) {
      lead(Math.cos(p.fireAngle), Math.sin(p.fireAngle), S.lookAhead * viewWorld * (p.firing ? 1 : 0.7));
    } else {
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 1) lead(p.vx / sp, p.vy / sp, S.lookAhead * viewWorld * 0.45 * Math.min(1, sp / S.moveSpeed));
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
    // The shake is on the screen; the kick is stored on the ground, opposite
    // to the shot, so the camera recoils backwards along what you see.
    const kick = v.dirToScreen(c.kickX, c.kickY, kickTmp);
    c.shakeX = (Math.sin(t * 1.13) + Math.sin(t * 2.71) * 0.5) * sh * 0.66 + kick.x;
    c.shakeY = (Math.cos(t * 1.37) + Math.sin(t * 3.07) * 0.5) * sh * 0.66 + kick.y;
    this.syncView();
  }
}
