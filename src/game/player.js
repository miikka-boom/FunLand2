// The survivor: movement, aim (+assist), firing, reload, swap, shove.

import { WEAPONS } from './weapons.js';
import { aimTau, smoothAngle } from '../input/stick-math.js';
import { DEG, clamp, rand, randSpread, rayCircle, smoothstep, wrapAngle } from '../util.js';
import { damageZombie, alertZombie } from './zombies.js';
import { HUNTER, deadstop, struggle, damageRock } from './specials.js';
import { hotDef, shootBoards, shoveBoards } from './loot.js';
import { damageExplosive } from './world-events.js';

export const SHOVE_REACH = 52;
export const SHOVE_HALF_ANGLE = 65 * DEG;

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.r = 12;
    this.hp = 100;
    this.maxHp = 100;
    this.alive = true;
    this.facing = -Math.PI / 2;
    this.aimAngle = this.facing;
    this.fireAngle = this.facing;
    this.aimActive = false;
    this.aimHoldT = 0;
    this.aimRaw = 0;
    // cap = magazine size (EXTENDED MAGS raises it for the run).
    this.weapons = WEAPONS.map((def) => ({ def, mag: def.mag, cap: def.mag, reloading: false, reloadT: 0 }));
    this.wi = 0;
    this.cooldown = 0;
    this.bloom = 0;
    this.swapT = 0;
    this.shoveCd = 0;
    this.shoveCdMax = 0.5;
    this.shoveFatigue = 0;
    this.lastShove = -10;
    this.slowT = 0;
    this.hurtT = 0;
    this.recoil = 0;
    this.firing = false;
    this.walk = 0;
    this.assist = null; // current aim-assist target
    this.pinnedBy = null; // Hunter riding you
    this.struggle = 0;
    this.lastStruggle = -10;
    this.pinImmuneT = 0;
    this.knockT = 0; // sent flying: little control for a moment
    this.shoveActiveT = 0; // shove still "live" for deadstopping a pouncing Hunter
    // Scavenged for the run (see loot.js).
    this.armor = 0; // soaks damage before HP
    this.hot = 0; // hot rounds left: x1.5 damage, +1 pierce
    this.adrenT = 0; // adrenaline seconds left
    this.magMult = 1;
  }

  get weapon() {
    return this.weapons[this.wi];
  }
}

export function updatePlayer(game, dt, input) {
  const p = game.player;
  const S = game.settings;
  if (!p.alive) return;

  p.slowT -= dt;
  p.hurtT -= dt;
  p.swapT -= dt;
  p.shoveCd -= dt;
  p.recoil *= Math.exp(-14 * dt);
  p.adrenT = Math.max(0, p.adrenT - dt);
  const adren = p.adrenT > 0;
  p.shoveFatigue = Math.max(0, p.shoveFatigue - dt * (adren ? 0.8 : 0.35));
  p.knockT -= dt;
  p.pinImmuneT -= dt;
  p.shoveActiveT -= dt;

  // Pinned by a Hunter: no moving, no shooting, only struggling (shove input).
  if (p.pinnedBy) {
    p.vx = 0;
    p.vy = 0;
    p.firing = false;
    // The meter only drains once you stop mashing, so N quick taps = N.
    if (game.time - p.lastStruggle > 0.45) p.struggle = Math.max(0, p.struggle - dt * 1.5);
    const h = p.pinnedBy;
    p.facing = Math.atan2(h.y - p.y, h.x - p.x) + Math.PI;
    return;
  }

  // --- Movement ------------------------------------------------------------------
  let speed = S.moveSpeed;
  if (adren) speed *= 1.22; // adrenaline: faster, and hits don't slow you
  else {
    if (p.hp < 40) speed *= 0.8; // limping
    if (p.slowT > 0) speed *= 0.55; // tagged by a hit
  }
  const control = p.knockT > 0 ? 0.15 : 1; // knocked flying by a Tank
  const tx = input.move.x * speed * control;
  const ty = input.move.y * speed * control;
  // Accelerate toward the target velocity; brake harder when reversing/stopping.
  const dvx = tx - p.vx;
  const dvy = ty - p.vy;
  const dv = Math.hypot(dvx, dvy);
  if (dv > 1e-6) {
    const braking = p.vx * tx + p.vy * ty < 0 || tx * tx + ty * ty < p.vx * p.vx + p.vy * p.vy;
    const rate = (p.knockT > 0 ? 700 : braking ? S.decel : S.accel) * dt;
    const k = Math.min(1, rate / dv);
    p.vx += dvx * k;
    p.vy += dvy * k;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  game.world.collide(p, p.r);
  game.world.collide(p, p.r);
  const spd = Math.hypot(p.vx, p.vy);
  p.walk += spd * dt * 0.06;

  // --- Aim ---------------------------------------------------------------------------
  let aimActive = input.aimActive;
  let targetAngle = p.aimAngle;
  if (input.aimScreen) {
    const s = game.worldToScreen(p.x, p.y);
    const ax = input.aimScreen.x - s.x;
    const ay = input.aimScreen.y - s.y;
    aimActive = Math.hypot(ax, ay) > 6;
    if (aimActive) targetAngle = Math.atan2(ay, ax);
  } else if (aimActive) {
    targetAngle = Math.atan2(input.aimY, input.aimX);
  }

  if (aimActive) {
    if (!p.aimActive) p.aimAngle = targetAngle; // new contact (even inside the hold window): snap, no lag
    else if (input.source === 'touch') p.aimAngle = smoothAngle(p.aimAngle, targetAngle, dt, aimTau(S.aimSmoothing, input.aimRaw));
    else p.aimAngle = targetAngle;
    p.aimHoldT = S.aimHold;
  } else {
    if (p.aimActive) p.aimAngle = p.fireAngle; // release: hold the assisted angle, no jump
    p.aimHoldT -= dt;
  }
  p.aimActive = aimActive;
  p.aimRaw = input.aimRaw;

  p.fireAngle = p.aimAngle;
  p.assist = null;
  if (aimActive && input.assist && S.aimAssist > 0) applyAimAssist(game, p);

  // Facing: aim while aiming (and briefly after), otherwise turn toward travel.
  if (aimActive || p.aimHoldT > 0) {
    p.facing = p.fireAngle;
  } else if (spd > 20) {
    const mv = Math.atan2(p.vy, p.vx);
    p.facing += wrapAngle(mv - p.facing) * Math.min(1, dt * 10);
    p.aimAngle = p.facing;
    p.fireAngle = p.facing;
  }

  // --- Weapon -----------------------------------------------------------------------
  const w = p.weapon;
  const def = w.def;
  if (w.reloading) {
    w.reloadT -= dt;
    if (w.reloadT <= 0) {
      if (def.reloadType === 'shell') {
        w.mag++;
        game.audio.shell();
        if (w.mag >= w.cap) {
          w.reloading = false;
          game.audio.pump();
        } else w.reloadT += def.reload * reloadScale(p);
      } else {
        w.mag = w.cap;
        w.reloading = false;
        game.audio.reloadDone();
      }
    }
  }

  p.firing = input.fire && (aimActive || input.source === 'gamepad');
  if (p.firing) {
    p.cooldown -= dt;
    let guard = 0;
    while (p.cooldown <= 0 && guard++ < 4) {
      if (!fire(game, p)) {
        p.cooldown = Math.max(p.cooldown, 0);
        break;
      }
    }
  } else {
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.bloom = Math.max(0, p.bloom - def.bloomDecay * dt);
  }
}

function applyAimAssist(game, p) {
  const S = game.settings;
  const cone = S.aimAssistCone * DEG;
  const range = p.weapon.def.range;
  let best = null;
  let bestScore = Infinity;
  let bestAng = 0;
  const targets = game.rocks.length ? game.zombies.concat(game.rocks) : game.zombies;
  const ax = Math.cos(p.aimAngle);
  const ay = Math.sin(p.aimAngle);
  for (const z of targets) {
    if (!z.alive || z.ghost) continue; // an unlit Night Terror isn't there to aim at
    const dx = z.x - p.x;
    const dy = z.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > range * range || d2 < 1) continue;
    // Behind you can't be inside the cone (only something touching you can be that wide).
    if (dx * ax + dy * ay < 0 && d2 > 6 * z.r * z.r) continue;
    const d = Math.sqrt(d2);
    const a = Math.atan2(dy, dx);
    const diff = Math.abs(wrapAngle(a - p.aimAngle));
    // Close targets are big: widen the cone by their angular size.
    const allowed = cone + Math.asin(Math.min(1, (z.r * 1.2) / d));
    if (diff > allowed) continue;
    let score = diff / allowed + 0.35 * (d / range);
    if (z === p.lastAssist) score -= 0.15; // sticky: no flicker in crowds
    // Threats first: a crouching/pouncing Hunter, an incoming rock, the Tank.
    if (z.type === 'rock') score -= 0.35;
    else if (z.type === 'hunter' && (z.mode === 'crouch' || z.mode === 'leap')) score -= 0.3;
    else if (z.type === 'tank') score -= 0.1;
    if (score < bestScore) {
      if (!game.world.segmentClear(p.x, p.y, z.x, z.y, game.world.shotBlockers)) continue;
      bestScore = score;
      best = z;
      bestAng = a;
    }
  }
  p.lastAssist = best;
  if (!best) return;
  const diff = wrapAngle(bestAng - p.aimAngle);
  const allowed = cone + Math.asin(Math.min(1, (best.r * 1.2) / Math.hypot(best.x - p.x, best.y - p.y)));
  // Full pull near the centre of the cone, fading out at its edge.
  const pull = S.aimAssist * (1 - smoothstep(0.55, 1, Math.abs(diff) / allowed));
  p.fireAngle = p.aimAngle + diff * pull;
  p.assist = best;
}

/** Adrenaline reloads faster. */
const reloadScale = (p) => (p.adrenT > 0 ? 0.6 : 1);

export function startReload(game, p) {
  const w = p.weapon;
  if (w.reloading || w.mag >= w.cap) return;
  w.reloading = true;
  w.reloadT = (w.def.reloadType === 'shell' ? w.def.reload + 0.15 : w.def.reload) * reloadScale(p);
  game.audio.reloadStart();
}

export function swapWeapon(game, p) {
  p.weapon.reloading = false;
  p.wi = (p.wi + 1) % p.weapons.length;
  p.swapT = 0.35;
  p.bloom = 0;
  p.cooldown = Math.max(p.cooldown, 0);
  game.audio.swap();
  game.announce(p.weapon.def.name.toUpperCase(), '#cfd8dc', 0.9, 'small');
  if (p.weapon.mag === 0) startReload(game, p);
}

function fire(game, p) {
  const S = game.settings;
  const w = p.weapon;
  const def = w.def;
  if (p.swapT > 0) return false;
  if (w.reloading) {
    if (def.reloadType === 'shell' && w.mag > 0) w.reloading = false; // pump: firing interrupts loading
    else return false;
  }
  if (w.mag <= 0) {
    startReload(game, p);
    game.audio.dryFire();
    return false;
  }
  p.cooldown += 1 / def.rate;
  w.mag--;
  game.stats.shots++;
  // Hot rounds: one per trigger pull (a shotgun blast is one round).
  const sdef = p.hot > 0 ? hotDef(def) : def;
  if (p.hot > 0) p.hot--;

  const spd = Math.hypot(p.vx, p.vy);
  const moveFrac = clamp(spd / S.moveSpeed, 0, 1);
  const spread = (def.spread + p.bloom + def.moveSpread * moveFrac) * DEG;
  const ca = Math.cos(p.fireAngle);
  const sa = Math.sin(p.fireAngle);
  const mx = p.x + ca * (p.r + 12);
  const my = p.y + sa * (p.r + 12);

  let anyHit = false;
  for (let i = 0; i < def.pellets; i++) {
    let ang;
    if (def.pellets > 1) {
      // Even pattern + a little noise: reliable, readable shotgun cone.
      const f = i / (def.pellets - 1) - 0.5;
      ang = p.fireAngle + f * 2 * spread * 0.85 + randSpread() * spread * 0.25;
    } else {
      ang = p.fireAngle + randSpread() * spread;
    }
    if (hitscan(game, p, mx, my, ang, sdef)) anyHit = true;
  }
  if (anyHit) game.stats.hits++;
  p.bloom = Math.min(def.bloomMax, p.bloom + def.bloom);
  p.recoil = Math.min(1, p.recoil + def.kick / 10);

  const fx = game.effects;
  fx.muzzle(mx, my, p.fireAngle, def.pellets > 1 ? 1.4 : def.id === 'hunting' ? 1.2 : 0.9);
  fx.casing(p.x + ca * 6, p.y + sa * 6, p.fireAngle, def.pellets > 1);
  game.addTrauma(def.trauma);
  game.kickCamera(-ca * def.kick, -sa * def.kick);
  game.audio.shot(def.sound);
  game.haptic(def.pellets > 1 ? 18 : 7, true);
  game.noise(p.x, p.y, def.noise);
  if (w.mag === 0) startReload(game, p);
  return true;
}

const hitList = [];

/**
 * One bullet from shooter p along ang: hits zombies/rocks (piercing per the
 * weapon), draws the tracer, sparks off walls. Shots that stop on an alarm
 * car / fire alarm set it off, and on boards chip them, unless alarms is
 * false (the AI teammate never trips alarms or breaks into rooms).
 */
export function hitscan(game, p, mx, my, ang, def, alarms = true) {
  const world = game.world;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  // Trace from the body (not the muzzle) so hugging a wall can't shoot through it.
  const wall = world.raycast(p.x, p.y, dx, dy, def.range, world.shotBlockers);
  const maxT = wall.t;
  hitList.length = 0;
  for (const z of game.zombies) {
    if (!z.alive || z.ghost) continue; // bullets pass through a Night Terror in the dark
    const fx = z.x - p.x;
    const fy = z.y - p.y;
    const along = fx * dx + fy * dy;
    if (along < -z.r || along > maxT + z.r) continue;
    if (Math.abs(fx * dy - fy * dx) > z.r + 2) continue;
    const t = rayCircle(p.x, p.y, dx, dy, z.x, z.y, z.r + 2);
    if (t < maxT) hitList.push({ z, t });
  }
  for (const r of game.rocks) {
    if (!r.alive) continue;
    const t = rayCircle(p.x, p.y, dx, dy, r.x, r.y, r.r + 3);
    if (t < maxT) hitList.push({ z: r, t });
  }
  hitList.sort((a, b) => a.t - b.t);

  let endT = maxT;
  let stopped = false;
  const n = Math.min(def.pierce, hitList.length);
  for (let i = 0; i < n; i++) {
    const { z, t } = hitList[i];
    let dmg = def.dmg;
    if (def.falloff) dmg *= clamp(1.25 - t / def.range, 0.3, 1);
    if (i > 0) dmg *= 0.8; // each body soaks a bit
    if (z.type === 'rock') damageRock(game, z, dmg, dx, dy);
    else damageZombie(game, z, dmg, dx, dy, def.knock, def.stagger);
    if (i === n - 1 && hitList.length >= def.pierce) {
      endT = t;
      stopped = true;
    }
  }

  const startT = Math.min(p.r + 12, endT);
  const x0 = p.x + dx * startT;
  const y0 = p.y + dy * startT;
  const x1 = p.x + dx * endT;
  const y1 = p.y + dy * endT;
  game.effects.tracer(x0, y0, x1, y1, def.tracer, def.pellets > 1 ? 1.1 : def.id === 'hunting' ? 2.4 : 1.6);

  if (!stopped && wall.obstacle) {
    // Spark off the surface, facing back toward the shooter.
    game.effects.sparks(x1 - dx * 2, y1 - dy * 2, -dx, -dy, def.pellets > 1 ? 2 : 4);
    if (alarms && wall.obstacle.alarm) game.director.triggerAlarm(wall.obstacle);
    if (alarms && wall.obstacle.boards) shootBoards(game, wall.obstacle, def, dx, dy, x1, y1);
    if (alarms && wall.obstacle.explosive) damageExplosive(game, wall.obstacle, def.dmg);
  }
  return n > 0;
}

export function shove(game) {
  const p = game.player;
  if (!p.alive) return;
  if (p.pinnedBy) {
    struggle(game); // every shove input is a break-free press
    return;
  }
  if (p.shoveCd > 0) return;
  const now = game.time;
  // Rapid shoves tire you out (L4D-style), so it can't be spammed forever.
  p.shoveFatigue = now - p.lastShove < 1.1 ? Math.min(p.shoveFatigue + 0.14, 0.75) : p.shoveFatigue;
  p.lastShove = now;
  p.shoveCdMax = (0.42 + p.shoveFatigue) * (p.adrenT > 0 ? 0.6 : 1);
  p.shoveCd = p.shoveCdMax;
  // The shove stays live briefly, so a Hunter arriving a moment later is still stopped.
  p.shoveActiveT = game.settings.deadstopWindow;

  // A Hunter in the air within reach gets knocked out of the sky.
  let ang = p.facing;
  let flyer = null;
  for (const z of game.zombies) {
    if (z.alive && z.type === 'hunter' && z.mode === 'leap' && Math.hypot(z.x - p.x, z.y - p.y) - z.r <= HUNTER.deadstopReach) {
      flyer = z;
      break;
    }
  }
  if (flyer) {
    ang = Math.atan2(flyer.y - p.y, flyer.x - p.x);
    deadstop(game, flyer);
  }

  // Shove where you face, but swing toward a zombie that's on you from the side.
  let nearest = null;
  let nd = Infinity;
  game.zhash.query(p.x, p.y, SHOVE_REACH + 20, (z) => {
    if (!z.alive || flyer) return;
    const d = Math.hypot(z.x - p.x, z.y - p.y) - z.r;
    if (d < nd) {
      nd = d;
      nearest = z;
    }
  });
  if (nearest && nd < SHOVE_REACH) {
    const a = Math.atan2(nearest.y - p.y, nearest.x - p.x);
    if (Math.abs(wrapAngle(a - ang)) > SHOVE_HALF_ANGLE * 0.8) ang = a;
  }
  p.facing = ang;
  p.aimAngle = ang;
  p.fireAngle = ang;
  p.aimHoldT = Math.max(p.aimHoldT, 0.35);

  let hits = flyer ? 1 : 0;
  game.zhash.query(p.x, p.y, SHOVE_REACH + 40, (z) => {
    if (!z.alive || z.noCollide) return;
    const dx = z.x - p.x;
    const dy = z.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d - z.r > SHOVE_REACH) return;
    const diff = Math.abs(wrapAngle(Math.atan2(dy, dx) - ang));
    if (diff > SHOVE_HALF_ANGLE && d > p.r + z.r + 4) return;
    hits++;
    if (z.type === 'tank') return; // you can't shove a Tank
    z.windup = 0;
    z.attackCd = Math.max(z.attackCd, 0.5);
    damageZombie(game, z, 8, dx / d, dy / d, 340, rand(0.75, 0.95), false);
    alertZombie(game, z, 0);
  });
  hits += shoveBoards(game, p, ang, SHOVE_REACH, SHOVE_HALF_ANGLE);
  game.stats.shoves++;
  game.effects.shoveArc(p.x, p.y, ang, SHOVE_REACH + p.r);
  game.audio.shove(hits > 0);
  game.addTrauma(hits ? 0.16 : 0.05);
  game.haptic(hits ? 22 : 10);
}
