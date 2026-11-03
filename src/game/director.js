// A small "AI Director": paces the run through build-up -> peak -> relax,
// keeps wanderers around, throws mobs ("HERE THEY COME") from out of sight,
// and turns alarm cars into panic events. Starts when you leave the safe room.
// Specials: a Hunter now and then (one at a time), and one Tank per run at a
// random point along the route (mobs pause while it's alive, like L4D).

import { rand, randInt, pointInRect } from '../util.js';
import { Zombie, alertZombie } from './zombies.js';
import { spawnHunter, spawnTank } from './specials.js';
import { NAV_CELL } from '../world/world.js';

const INF = 0x3fffffff;
export const MAX_ZOMBIES = 230;

export class Director {
  constructor(game) {
    this.game = game;
    this.phase = 'calm'; // calm (still in the start room) | build | peak | relax
    this.phaseT = 0;
    this.intensity = 0;
    this.mobT = rand(18, 28); // first mob soon after leaving the safe room
    this.trickleT = rand(8, 14);
    this.upkeepT = 0.5;
    this.threatNear = 0;
    this.queue = [];
    this.alarm = null;
    this.specialT = rand(18, 28); // first Hunter (or by 22% of the route, whichever first)
    this.hunterSeen = false;
    this.tankAt = rand(0.38, 0.58); // fraction of the route where the Tank shows up
    this.tankSpawned = false;
    this.tank = null;
    this._c = { x: 0, y: 0 };
  }

  get tankAlive() {
    return !!(this.tank && this.tank.alive);
  }

  /** The Tank is on you (not left behind somewhere): pause mobs and Hunters. */
  get tankEngaged() {
    if (!this.tankAlive) return false;
    const p = this.game.player;
    return Math.hypot(this.tank.x - p.x, this.tank.y - p.y) < 1000;
  }

  addIntensity(v) {
    this.intensity = Math.min(1.25, this.intensity + v);
  }

  /** Initial wanderers spread over the whole route, none near the start. */
  populate() {
    const g = this.game;
    const density = ((g.world.w * g.world.h) / (4200 * 2800)) * (g.world.map.wanderDensity || 1);
    const n = Math.min(MAX_ZOMBIES - 50, Math.round(70 * density * g.settings.wanderers));
    const { start, startRoom, endRoom } = g.world.map;
    let placed = 0;
    for (let k = 0; k < n * 10 && placed < n; k++) {
      const x = rand(40, g.world.w - 40);
      const y = rand(40, g.world.h - 40);
      if (Math.hypot(x - start.x, y - start.y) < 650) continue;
      if (pointInRect(x, y, startRoom.outer, 40) || pointInRect(x, y, endRoom.outer, 20)) continue;
      if (!g.world.isFree(x, y, 12)) continue;
      const group = Math.random() < 0.3 ? randInt(2, 5) : 1;
      for (let j = 0; j < group && placed < n; j++) {
        const zx = x + rand(-40, 40);
        const zy = y + rand(-40, 40);
        if (!g.world.isFree(zx, zy, 11)) continue;
        g.zombies.push(new Zombie(zx, zy, false));
        placed++;
      }
    }
  }

  update(dt) {
    const g = this.game;
    const p = g.player;

    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.t -= dt;
      if (q.t <= 0) {
        this.queue[i] = this.queue[this.queue.length - 1];
        this.queue.pop();
        this.spawnAt(q.x, q.y, q.alert);
      }
    }

    this.upkeepT -= dt;
    if (this.upkeepT <= 0) {
      this.upkeepT = 0.5;
      this.upkeep();
    }
    this.intensity = Math.max(0, this.intensity - dt * (this.threatNear > 0 ? 0.03 : 0.09));

    if (this.alarm) this.updateAlarm(dt);

    if (this.phase === 'calm') {
      if (p.alive && !pointInRect(p.x, p.y, g.world.map.startRoom.interior)) this.phase = 'build';
      return;
    }
    if (g.won) return;

    if (g.settings.specials) this.updateSpecials(dt);
    const tank = this.tankEngaged;

    switch (this.phase) {
      case 'build':
        if (tank) break; // the Tank fight is the event: no mobs on top of it
        this.mobT -= dt;
        this.trickleT -= dt;
        if (this.trickleT <= 0) {
          this.trickleT = rand(10, 18);
          const spot = this.findSpawn(550, 1200);
          if (spot) this.queueGroup(spot, Math.round(randInt(2, 5) * Math.max(0.5, g.settings.hordeSize)), 1.2);
        }
        if (this.mobT <= 0) {
          this.mobT = rand(45, 75);
          this.spawnMob();
        }
        if (this.intensity >= 1) {
          this.phase = 'peak';
          this.phaseT = rand(3, 5);
        }
        break;
      case 'peak':
        this.phaseT -= dt;
        if (this.phaseT <= 0) {
          this.phase = 'relax';
          this.phaseT = rand(18, 30);
        }
        break;
      case 'relax':
        this.phaseT -= dt;
        if (this.phaseT <= 0 && this.threatNear < 4) {
          this.phase = 'build';
          this.mobT = Math.max(this.mobT, rand(15, 30));
        }
        break;
      default:
        break;
    }
  }

  updateSpecials(dt) {
    const g = this.game;
    let hunters = 0;
    for (const z of g.zombies) if (z.alive && z.type === 'hunter') hunters++;
    // Relax slows the clock (a breather) rather than freezing it; a Tank on you pauses it.
    if (hunters === 0 && !this.tankEngaged) this.specialT -= dt * (this.phase === 'relax' ? 0.5 : 1);
    if (!this.hunterSeen && hunters === 0 && g.progress >= 0.22 && !this.tankEngaged) this.specialT = 0;
    if (this.specialT <= 0) {
      if (this.spawnHunterNow()) {
        this.hunterSeen = true;
        this.specialT = rand(25, 45);
      } else this.specialT = 4;
    }
    if (!this.tankSpawned && g.progress >= this.tankAt && this.spawnTankNow()) this.tankSpawned = true;
  }

  spawnHunterNow(force = false) {
    const spot = this.findSpawn(force ? 320 : 450, force ? 700 : 950) || (force ? this.findSpawn(200, 1400, 400) : null);
    if (!spot) return false;
    spawnHunter(this.game, spot.x, spot.y);
    return true;
  }

  spawnTankNow(force = false) {
    if (this.tankAlive) return false;
    const spot = this.findSpawn(force ? 380 : 500, force ? 800 : 950) || (force ? this.findSpawn(250, 1500, 400) : null);
    if (!spot) return false;
    this.tank = spawnTank(this.game, spot.x, spot.y);
    if (this.phase === 'relax' || this.phase === 'peak') this.phase = 'build';
    return true;
  }

  onTankDeath() {
    // Breather after the boss.
    this.phase = 'relax';
    this.phaseT = rand(16, 24);
    this.intensity = Math.min(this.intensity, 0.6);
    this.mobT = Math.max(this.mobT, rand(20, 35));
  }

  /** Tuning panel: spawn now (also starts the director if still in the safe room). */
  forceHunter() {
    if (this.phase === 'calm') this.phase = 'build';
    const ok = this.spawnHunterNow(true);
    if (ok) this.hunterSeen = true;
    return ok;
  }

  forceTank() {
    if (this.phase === 'calm') this.phase = 'build';
    const ok = this.spawnTankNow(true);
    if (ok) this.tankSpawned = true;
    return ok;
  }

  upkeep() {
    const g = this.game;
    const p = g.player;
    const S = g.settings;
    const view = g.viewRect(160);
    let idleNear = 0;
    let near = 0;
    const crowded = g.zombies.length > MAX_ZOMBIES - 40;
    for (const z of g.zombies) {
      if (!z.alive) continue;
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      const inView = pointInRect(z.x, z.y, view);
      if (z.state === 'idle') {
        // Far wanderers stay (they populate the route) unless hordes need room.
        if (crowded && d > 2600 && !inView) {
          z.alive = false;
          continue;
        }
        if (d < 1600) idleNear++;
      } else {
        if (d > 2800 && !inView && z.type !== 'tank') {
          z.alive = false;
          continue;
        }
        if (d < 450) near++;
      }
    }
    this.threatNear = near;
    const target = Math.round(22 * S.wanderers);
    if (idleNear < target && g.zombies.length < MAX_ZOMBIES - 30) {
      const spot = this.findSpawn(700, 1700);
      if (spot) {
        const n = randInt(1, 3);
        for (let i = 0; i < n; i++) this.spawnAt(spot.x, spot.y, false);
      }
    }
  }

  /** Random reachable nav cell, at a path distance band, out of the survivor's sight. */
  findSpawn(minD, maxD, tries = 160) {
    const g = this.game;
    const W = g.world;
    const f = W.flow;
    const p = g.player;
    const view = g.viewRect(90);
    const { startRoom, endRoom } = W.map;
    const n = W.blocked.length;
    const c = this._c;
    for (let k = 0; k < tries; k++) {
      const i = (Math.random() * n) | 0;
      if (W.blocked[i]) continue;
      const dd = f.dist[i];
      if (dd >= INF) continue;
      const pd = (dd / 10) * NAV_CELL;
      if (pd < minD || pd > maxD) continue;
      W.cellCenter(i, c);
      if (pointInRect(c.x, c.y, startRoom.outer, 30) || pointInRect(c.x, c.y, endRoom.outer, 30)) continue;
      if (pointInRect(c.x, c.y, view)) {
        if (Math.hypot(c.x - p.x, c.y - p.y) < 380) continue;
        if (W.segmentClear(p.x, p.y, c.x, c.y)) continue;
      }
      return { x: c.x, y: c.y };
    }
    return null;
  }

  queueGroup(spot, n, over, alert = true) {
    for (let i = 0; i < n; i++) {
      this.queue.push({ x: spot.x, y: spot.y, t: (i / Math.max(1, n)) * over + rand(0, 0.25), alert });
    }
  }

  spawnAt(x, y, alert) {
    const g = this.game;
    if (g.zombies.length >= MAX_ZOMBIES) return null;
    let zx = x;
    let zy = y;
    for (let k = 0; k < 8; k++) {
      const tx = x + rand(-46, 46);
      const ty = y + rand(-46, 46);
      if (g.world.isFree(tx, ty, 11)) {
        zx = tx;
        zy = ty;
        break;
      }
    }
    const z = new Zombie(zx, zy, alert);
    g.zombies.push(z);
    return z;
  }

  spawnMob(sizeMul = 1, label = 'HERE THEY COME!') {
    const g = this.game;
    const n = Math.round(rand(16, 24) * g.settings.hordeSize * sizeMul);
    const spot = this.findSpawn(650, 1300) || this.findSpawn(420, 1900, 300);
    if (!spot) return false;
    this.queueGroup(spot, n, 2.8, true);
    g.audio.horde(spot.x, spot.y);
    if (label) g.announce(label, '#ff6b5a', 2.2);
    g.stats.hordes++;
    return true;
  }

  triggerAlarm(car) {
    if (car.alarmOn || car.alarmDone) return;
    const g = this.game;
    car.alarmOn = true;
    this.alarm = { car, t: 0, wave: 0 };
    if (this.phase === 'calm' || this.phase === 'relax') this.phase = 'build';
    const fire = car.kind === 'alarmbox';
    g.audio.alarm(car.x + car.w / 2, car.y + car.h / 2, 15, fire ? 'fire' : 'car');
    g.announce(fire ? 'FIRE ALARM!' : 'CAR ALARM!', '#ffb347', 2.5);
    g.noise(car.x + car.w / 2, car.y + car.h / 2, 950);
  }

  updateAlarm(dt) {
    const a = this.alarm;
    a.t += dt;
    const waves = [0.9, 7.5, 13.5];
    while (a.wave < waves.length && a.t >= waves[a.wave]) {
      this.spawnMob(1.1, a.wave === 0 ? 'PANIC EVENT — HOLD ON!' : null);
      a.wave++;
    }
    if (a.t > 15) {
      a.car.alarmOn = false;
      a.car.alarmDone = true;
      this.game.audio.alarmStop();
      this.alarm = null;
    }
  }

  /** Debug / tuning: call a mob right now. */
  forceMob() {
    if (this.phase === 'calm') this.phase = 'build';
    return this.spawnMob(1, 'HERE THEY COME!');
  }
}

export { alertZombie };
