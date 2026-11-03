// Common infected: shamble while idle, sprint in packs once alerted, follow the
// flow field around buildings, crowd and claw. Shoves stagger them.
// Special infected (specials.js) share the array, hash and crowd physics; they
// plug in through type/mass/knockScale and optional onHit/onDeath hooks.

import { rand, pick, TAU, wrapAngle } from '../util.js';

const SKINS = ['#8d9a7e', '#9a917c', '#7f8c84', '#a39a86', '#86907a', '#958a7c'];
const SHIRTS = ['#4a4f63', '#5c3b33', '#3e5241', '#6b6252', '#2f3540', '#6a4a5a', '#7b6a3a', '#3a3a3a', '#8a8378', '#4b2f2f'];
const HIT_DAMAGE = 5;
let nextId = 1;
export const newId = () => nextId++;

export class Zombie {
  constructor(x, y, alerted = false) {
    this.id = nextId++;
    this.type = 'common';
    this.mass = 1;
    this.knockScale = 1;
    this.staggerable = true;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.r = rand(10, 12);
    this.hp = 50;
    this.alive = true;
    this.state = alerted ? 'chase' : 'idle';
    this.speed = rand(176, 214);
    this.walk = rand(18, 36);
    this.heading = rand(0, TAU);
    this.face = this.heading;
    this.wanderT = rand(0.3, 3);
    this.wanderStop = Math.random() < 0.4;
    this.alertDelay = alerted ? rand(0, 0.25) : 0;
    this.attackCd = rand(0, 0.4);
    this.windup = 0;
    this.stagger = 0;
    this.hitFlash = 0;
    this.losT = rand(0, 0.3);
    this.hasLOS = false;
    this.anim = rand(0, 10);
    this.skin = pick(SKINS);
    this.shirt = pick(SHIRTS);
    this.groanT = rand(3, 14);
    this.idleT = 0;
  }
}

export function alertZombie(game, z, delay = 0, chain = true) {
  if (!z.alive || z.state === 'chase') return;
  z.state = 'chase';
  z.alertDelay = delay;
  if (Math.random() < 0.3) game.audio.snarl(z.x, z.y);
  if (!chain) return;
  // Packs react together.
  game.zhash.query(z.x, z.y, 150, (o) => {
    if (o !== z && o.state === 'idle') alertZombie(game, o, delay + rand(0.1, 0.45), false);
  });
}

const tmpDir = { x: 0, y: 0 };

export function updateZombies(game, dt) {
  const { player: p, world, settings: S, zombies } = game;
  const hash = game.zhash;
  hash.clear();
  for (const z of zombies) if (z.alive) hash.insert(z);

  const reach = (z) => z.r + p.r + 8;

  for (const z of zombies) {
    if (!z.alive || z.type !== 'common') continue;
    z.hitFlash -= dt;
    z.attackCd -= dt;
    z.anim += dt;
    const dx = p.x - z.x;
    const dy = p.y - z.y;
    const d = Math.hypot(dx, dy) || 1e-6;
    let wantX = 0;
    let wantY = 0;
    let steer = 4;

    if (z.stagger > 0) {
      z.stagger -= dt;
      z.windup = 0;
      steer = 3;
    } else if (z.state === 'idle') {
      z.wanderT -= dt;
      z.idleT += dt;
      if (z.wanderT <= 0) {
        z.wanderT = rand(1.5, 4.5);
        z.wanderStop = Math.random() < 0.35;
        z.heading += rand(-1.3, 1.3);
      }
      if (!z.wanderStop) {
        wantX = Math.cos(z.heading) * z.walk;
        wantY = Math.sin(z.heading) * z.walk;
      }
      // Notice the survivor: very close, or in sight within range.
      if (p.alive) {
        z.losT -= dt;
        if (d < 70) alertZombie(game, z, rand(0.05, 0.3));
        else if (d < 250 && z.losT <= 0) {
          z.losT = rand(0.25, 0.45);
          if (world.segmentClear(z.x, z.y, p.x, p.y)) alertZombie(game, z, rand(0.1, 0.4));
        }
      }
      z.groanT -= dt;
      if (z.groanT <= 0) {
        z.groanT = rand(6, 16);
        if (d < 520) game.audio.groan(z.x, z.y);
      }
    } else if (z.alertDelay > 0) {
      z.alertDelay -= dt;
      z.face += wrapAngle(Math.atan2(dy, dx) - z.face) * Math.min(1, dt * 8);
    } else {
      // Chase.
      z.losT -= dt;
      if (z.losT <= 0) {
        z.losT = rand(0.16, 0.3);
        z.hasLOS = d < 650 && world.segmentClear(z.x, z.y, p.x, p.y, world.moveBlockers);
      }
      let mx = dx / d;
      let my = dy / d;
      if (!z.hasLOS && d > 36 && world.flow.dirAt(z.x, z.y, tmpDir)) {
        mx = tmpDir.x;
        my = tmpDir.y;
      }
      let sp = z.speed * S.zombieSpeed;
      // Ease in on contact so the crowd presses instead of jittering.
      if (d < reach(z) + 4) sp *= 0.35;
      wantX = mx * sp;
      wantY = my * sp;
      steer = 7;

      if (p.alive && d < reach(z) && z.windup <= 0 && z.attackCd <= 0) {
        z.windup = 0.3;
      }
      if (z.windup > 0) {
        z.windup -= dt;
        if (z.windup <= 0) {
          z.attackCd = rand(0.8, 1.2);
          if (p.alive && d < reach(z) + 8) game.hurtPlayer(HIT_DAMAGE * S.zombieDamage, z);
        }
      }
      z.groanT -= dt;
      if (z.groanT <= 0) {
        z.groanT = rand(3, 8);
        if (d < 420) game.audio.snarl(z.x, z.y);
      }
    }

    const k = 1 - Math.exp(-steer * dt);
    z.vx += (wantX - z.vx) * k;
    z.vy += (wantY - z.vy) * k;
    z.x += z.vx * dt;
    z.y += z.vy * dt;
    if (world.collide(z, z.r) && z.state === 'idle') z.heading += Math.PI * rand(0.6, 1.4);

    const sp2 = z.vx * z.vx + z.vy * z.vy;
    if (z.state === 'chase' && d < 120) z.face += wrapAngle(Math.atan2(dy, dx) - z.face) * Math.min(1, dt * 10);
    else if (sp2 > 25) z.face += wrapAngle(Math.atan2(z.vy, z.vx) - z.face) * Math.min(1, dt * 8);
  }
}

/**
 * Crowd physics for everything in the zombie array, after all AI moved:
 * mass-weighted separation, bodies pressing on the survivor, walls.
 * Bodies flagged noCollide (a Hunter mid-pounce or pinning) are skipped.
 */
export function resolveCrowd(game) {
  const { player: p, world, zombies } = game;
  const hash = game.zhash;

  for (const z of zombies) {
    if (!z.alive || z.noCollide) continue;
    hash.query(z.x, z.y, z.r + 26, (o) => {
      if (o.id <= z.id || !o.alive || o.noCollide) return;
      const dx = o.x - z.x;
      const dy = o.y - z.y;
      const min = z.r + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 1e-6) return;
      const d = Math.sqrt(d2);
      const pen = (min - d) / d;
      // Heavier bodies yield less (a Tank walks through a crowd).
      const wz = o.mass / (z.mass + o.mass);
      const wo = z.mass / (z.mass + o.mass);
      z.x -= dx * pen * wz;
      z.y -= dy * pen * wz;
      o.x += dx * pen * wo;
      o.y += dy * pen * wo;
    });
  }

  // Bodies vs survivor: commons yield most but a crowd still shoves you;
  // a Tank shoulders you aside. (Not while a Hunter has you pinned.)
  if (p.alive && !p.pinnedBy) {
    let pushX = 0;
    let pushY = 0;
    let cap = 3;
    hash.query(p.x, p.y, 60, (z) => {
      if (!z.alive || z.noCollide) return;
      const dx = z.x - p.x;
      const dy = z.y - p.y;
      const min = z.r + p.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 1e-6) return;
      const d = Math.sqrt(d2);
      const pen = min - d;
      const share = z.mass > 3 ? 0.75 : 0.15;
      if (z.mass > 3) cap = 14;
      z.x += (dx / d) * pen * (1 - share);
      z.y += (dy / d) * pen * (1 - share);
      pushX -= (dx / d) * pen * share;
      pushY -= (dy / d) * pen * share;
    });
    const pl = Math.hypot(pushX, pushY);
    if (pl > cap) {
      pushX *= cap / pl;
      pushY *= cap / pl;
    }
    p.x += pushX;
    p.y += pushY;
  }

  // Re-resolve walls after the pushes.
  for (const z of zombies) if (z.alive && !z.noCollide) world.collide(z, z.r);
}

export function damageZombie(game, z, dmg, dx, dy, knock, stagger, bleed = true) {
  if (!z.alive) return false;
  z.hp -= dmg;
  z.hitFlash = 0.08;
  z.vx += dx * knock * z.knockScale;
  z.vy += dy * knock * z.knockScale;
  if (stagger > 0 && z.staggerable) z.stagger = Math.max(z.stagger, stagger);
  if (z.state === 'idle') alertZombie(game, z, 0);
  if (bleed) game.effects.blood(z.x, z.y, dx, dy, z.type === 'tank' ? 2 : 3, 170);
  if (z.onHit && z.hp > 0) z.onHit(game, dmg, stagger, dx, dy);
  if (z.hp <= 0) {
    killZombie(game, z, dx, dy, knock * 1.6 + 60);
    return true;
  }
  return false;
}

export function killZombie(game, z, dx, dy, force) {
  z.alive = false;
  game.stats.kills++;
  if (z.onDeath) z.onDeath(game, dx, dy);
  const fx = game.effects;
  fx.blood(z.x, z.y, dx, dy, 9, 220);
  if (force > 300 || Math.random() < 0.35) fx.gibs(z.x, z.y, dx, dy, force > 300 ? 4 : 2);
  fx.pool(z.x + dx * 10, z.y + dy * 10, z.r * 1.1);
  fx.corpse(z, dx, dy, force);
  game.audio.splat(z.x, z.y);
  const p = game.player;
  if (Math.hypot(p.x - z.x, p.y - z.y) < 240) game.director.addIntensity(0.02);
}
