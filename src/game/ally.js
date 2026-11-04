// The AI teammate: a second survivor (a bot) that sticks with you and fights.
//  - Follows a spot behind and beside you; hurries when left behind, warps
//    back next to you if it's lost or stuck (like L4D bots do).
//  - Shoots what threatens you first: a Tank's rock, a Hunter on you, a Hunter
//    about to pounce, zombies on you, then zombies on it. Never through you,
//    and it never trips car alarms or fire alarms.
//  - Shoves zombies off itself, and shoves a Hunter off you when you're pinned.
//  - Keeps its distance from the Tank and patches itself up once when it's
//    hurt and things are quiet.
//  - At 0 HP it goes DOWN instead of dying: it keeps shooting from the floor
//    while it bleeds out. Stand next to it (without shooting) to revive it.
// Zombies go for whichever survivor is nearer (see updateZombies).

import { WEAPONS } from './weapons.js';
import { DEG, clamp, rand, randSpread, wrapAngle } from '../util.js';
import { damageZombie } from './zombies.js';
import { hitscan, SHOVE_REACH, SHOVE_HALF_ANGLE } from './player.js';
import { releasePin } from './specials.js';

export const ALLY = {
  r: 12,
  hp: 100,
  spotBack: 58, // its spot: this far behind you...
  spotSide: 52, // ...and this far to one side
  arrive: 30, // close enough to its spot
  sprintAt: 380, // path distance to you: hurry
  warpAt: 1300, // path distance to you: it's lost, bring it back
  aggro: 220, // zombies closer to it than to you (and this close) go for it
  reviveTime: 3, // seconds standing next to it, not shooting
  reviveRange: 52, // your centre to its centre
  bleedOut: 45, // seconds down before it dies (zombie hits speed it up)
  reviveHp: 40,
  healBelow: 40,
  healTime: 3,
  turnRate: 11, // rad/s while aiming
  kiteTank: 330, // keeps at least this far from a Tank
};

export class Ally {
  constructor(x, y, weaponId) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.r = ALLY.r;
    this.hp = ALLY.hp;
    this.maxHp = ALLY.hp;
    this.alive = true;
    this.down = false;
    this.downHp = 0; // bleed-out meter while down, 100 -> 0
    this.revive = 0; // 0..1 while you stand next to it
    this.facing = -Math.PI / 2;
    this.aimAngle = this.facing;
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.spotX = x;
    this.spotY = y;
    this.spotT = 0;
    this.cooldown = 0;
    this.bloom = 0;
    this.recoil = 0;
    this.firing = false;
    this.shoveCd = 0;
    this.shoveFatigue = 0;
    this.lastShove = -10;
    this.target = null;
    this.thinkT = 0;
    this.idleT = 0;
    this.aimErr = 0;
    this.aimErrT = 0;
    this.directT = 0;
    this.direct = false;
    this.medkits = 1;
    this.healT = 0;
    this.hurtT = 0;
    this.walk = 0;
    this.checkT = 0.5;
    this.lastX = x;
    this.lastY = y;
    this.stuckT = 0;
    this.setWeapon(weaponId);
  }

  setWeapon(id) {
    const def = WEAPONS.find((w) => w.id === id) || WEAPONS[1];
    this.weapon = { def, mag: def.mag, reloading: false, reloadT: 0 };
    this.cooldown = 0;
    this.bloom = 0;
  }
}

const tmp = { x: 0, y: 0 };
const TOPK = 6;
const candZ = new Array(TOPK).fill(null);
const candS = new Float64Array(TOPK);

// --- Placement ----------------------------------------------------------------------

/**
 * A free, reachable spot 40-160u from (x, y) with a clear line to it (same
 * room), preferring behind `facing`. Null if there's no room at all.
 */
export function allySpotNear(game, x, y, facing = 0) {
  const W = game.world;
  let best = null;
  let bestScore = -Infinity;
  for (let k = 0; k < 40; k++) {
    const a = facing + Math.PI + randSpread() * Math.PI;
    const rr = 40 + (k / 40) * 120;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (!W.isFree(px, py, ALLY.r + 3) || !W.segmentClear(x, y, px, py, W.moveBlockers)) continue;
    // Behind you and close beats in front and far.
    const score = -Math.cos(a - facing) - rr / 160;
    if (score > bestScore) {
      bestScore = score;
      best = { x: px, y: py };
    }
  }
  return best;
}

function warpNearPlayer(game, a) {
  const p = game.player;
  const spot = allySpotNear(game, p.x, p.y, p.facing);
  if (!spot) return;
  game.effects.sparks(a.x, a.y, 0, -1, 0); // a puff where it was
  a.x = spot.x;
  a.y = spot.y;
  a.vx = 0;
  a.vy = 0;
  a.stuckT = 0;
  a.lastX = a.x;
  a.lastY = a.y;
}

// --- Damage / down / revive ---------------------------------------------------------

export function hurtAlly(game, dmg, src, opts = {}) {
  const a = game.ally;
  if (!a || !a.alive || game.won) return;
  a.hurtT = 0.25;
  if (src) {
    const dx = a.x - src.x;
    const dy = a.y - src.y;
    const d = Math.hypot(dx, dy) || 1;
    const knock = a.down ? 0 : opts.knock === undefined ? 50 : opts.knock;
    a.vx += (dx / d) * knock;
    a.vy += (dy / d) * knock;
    game.effects.blood(a.x, a.y, dx / d, dy / d, 2, 120);
  }
  if (a.down) {
    a.downHp -= dmg * 1.5;
    if (a.downHp <= 0) allyDies(game, a);
    return;
  }
  a.hp -= dmg;
  a.healT = 0;
  if (a.hp > 0) return;
  a.hp = 0;
  a.down = true;
  a.downHp = 100;
  a.revive = 0;
  a.target = null;
  a.firing = false;
  game.stats.allyDowns++;
  game.announce('ALLY DOWN — revive them', '#ff8a6a', 2.4, 'small');
  game.audio.allyDown(a.x, a.y);
  game.director.addIntensity(0.25);
}

function allyDies(game, a) {
  a.alive = false;
  a.down = false;
  a.downHp = 0;
  a.revive = 0;
  a.firing = false;
  game.announce('ALLY DIED', '#ff5a4a', 2, 'small');
  game.audio.allyDown(a.x, a.y);
}

function reviveAlly(game, a) {
  a.down = false;
  a.hp = ALLY.reviveHp;
  a.revive = 0;
  a.downHp = 0;
  game.stats.revives++;
  game.announce('ALLY BACK UP', '#7dffa1', 1.3, 'small');
  game.audio.pickup();
}

// --- Weapon ---------------------------------------------------------------------------

function startReload(a) {
  const w = a.weapon;
  if (w.reloading || w.mag >= w.def.mag) return;
  w.reloading = true;
  w.reloadT = w.def.reloadType === 'shell' ? w.def.reload + 0.15 : w.def.reload;
}

function updateWeapon(a, dt) {
  const w = a.weapon;
  if (!w.reloading) return;
  w.reloadT -= dt;
  if (w.reloadT > 0) return;
  if (w.def.reloadType === 'shell') {
    w.mag++;
    if (w.mag >= w.def.mag) w.reloading = false;
    else w.reloadT += w.def.reload;
  } else {
    w.mag = w.def.mag;
    w.reloading = false;
  }
}

function fire(game, a) {
  const w = a.weapon;
  const def = w.def;
  if (w.reloading) {
    if (def.reloadType === 'shell' && w.mag > 0) w.reloading = false;
    else return false;
  }
  if (w.mag <= 0) {
    startReload(a);
    return false;
  }
  a.cooldown += (1 / def.rate) * (a.down ? 2.2 : 1);
  w.mag--;
  const spd = Math.hypot(a.vx, a.vy);
  const moveFrac = clamp(spd / game.settings.moveSpeed, 0, 1);
  const spread = (def.spread + a.bloom + def.moveSpread * moveFrac) * DEG * (a.down ? 1.6 : 1);
  const ca = Math.cos(a.aimAngle);
  const sa = Math.sin(a.aimAngle);
  const mx = a.x + ca * (a.r + 12);
  const my = a.y + sa * (a.r + 12);
  game.killCredit = 'ally';
  for (let i = 0; i < def.pellets; i++) {
    let ang;
    if (def.pellets > 1) {
      const f = i / (def.pellets - 1) - 0.5;
      ang = a.aimAngle + f * 2 * spread * 0.85 + randSpread() * spread * 0.25;
    } else ang = a.aimAngle + randSpread() * spread;
    hitscan(game, a, mx, my, ang, def, false);
  }
  game.killCredit = null;
  a.bloom = Math.min(def.bloomMax, a.bloom + def.bloom);
  a.recoil = Math.min(1, a.recoil + def.kick / 10);
  game.effects.muzzle(mx, my, a.aimAngle, def.pellets > 1 ? 1.2 : 0.8);
  game.effects.casing(a.x + ca * 6, a.y + sa * 6, a.aimAngle, def.pellets > 1);
  game.audio.allyShot(def.sound, a.x, a.y);
  game.noise(a.x, a.y, def.noise);
  if (w.mag === 0) startReload(a);
  return true;
}

// --- Targets --------------------------------------------------------------------------

/** Best thing to shoot that it has a clear shot at, or null. */
function pickTarget(game, a, rangeMul = 1) {
  const p = game.player;
  const W = game.world;
  const def = a.weapon.def;
  const range = def.range * (def.pellets > 1 ? 0.7 : 0.92) * rangeMul;
  const r2 = range * range;
  let n = 0;
  const offer = (z, s) => {
    if (n === TOPK && s >= candS[n - 1]) return;
    let i = n < TOPK ? n++ : n - 1;
    while (i > 0 && candS[i - 1] > s) {
      candS[i] = candS[i - 1];
      candZ[i] = candZ[i - 1];
      i--;
    }
    candS[i] = s;
    candZ[i] = z;
  };
  for (const z of game.zombies) {
    if (!z.alive) continue;
    const dx = z.x - a.x;
    const dy = z.y - a.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    const d = Math.sqrt(d2);
    let s = d / range;
    if (z.type === 'hunter') {
      if (z.mode === 'pin') s -= 1.2; // on you: top priority
      else if (z.mode === 'crouch' || z.mode === 'leap') s -= 0.7; // about to be
      else s -= 0.25;
    } else if (z.type === 'tank') {
      s -= 0.1;
    } else {
      if (z.state !== 'chase') {
        if (d > 170) continue; // let distant wanderers be
        s += 0.35;
      }
      const px = z.x - p.x;
      const py = z.y - p.y;
      const pd = Math.sqrt(px * px + py * py);
      if (pd < 140) s -= 0.35 * (1 - pd / 140); // on you
      if (d < 70) s -= 0.4 * (1 - d / 70); // on it
    }
    offer(z, s);
  }
  for (const r of game.rocks) {
    if (!r.alive) continue;
    const d = Math.hypot(r.x - a.x, r.y - a.y);
    if (d <= range) offer(r, -0.9 + d / range);
  }
  let best = null;
  for (let i = 0; i < n; i++) {
    const z = candZ[i];
    if (!best && W.segmentClear(a.x, a.y, z.x, z.y, W.shotBlockers)) best = z;
    candZ[i] = null;
  }
  return best;
}

/** You (or your hitbox) on the line of fire within maxD. */
function playerInLine(game, a, maxD) {
  const p = game.player;
  if (!p.alive) return false;
  const ca = Math.cos(a.aimAngle);
  const sa = Math.sin(a.aimAngle);
  const fx = p.x - a.x;
  const fy = p.y - a.y;
  const along = fx * ca + fy * sa;
  if (along < 0 || along > maxD) return false;
  return Math.abs(fx * sa - fy * ca) < p.r + 8;
}

/** Aim at the current target and fire when lined up. Returns true if firing. */
function combat(game, a, dt, rangeMul = 1) {
  const S = game.settings;
  const acc = clamp(S.allyAccuracy, 0, 1);
  a.thinkT -= dt;
  if (a.thinkT <= 0) {
    // Sharper bots re-evaluate (and react) faster.
    a.thinkT = 0.1 + (1 - acc) * 0.25;
    a.target = pickTarget(game, a, rangeMul);
  }
  const t = a.target && a.target.alive ? a.target : null;
  if (!t) {
    a.target = null;
    return false;
  }
  a.aimErrT -= dt;
  if (a.aimErrT <= 0) {
    a.aimErrT = rand(0.25, 0.6);
    a.aimErr = randSpread() * (1 - acc) * 7 * DEG;
  }
  const tx = t.x - a.x;
  const ty = t.y - a.y;
  const td = Math.hypot(tx, ty) || 1;
  const exact = Math.atan2(ty, tx);
  const turn = ALLY.turnRate * (0.6 + acc * 0.4) * dt;
  a.aimAngle += clamp(wrapAngle(exact + a.aimErr - a.aimAngle), -turn, turn);
  a.facing = a.aimAngle;
  const def = a.weapon.def;
  if (td > def.range * rangeMul) return false;
  const tol = Math.asin(Math.min(1, (t.r + 3) / td)) + 1.5 * DEG + Math.abs(a.aimErr);
  if (Math.abs(wrapAngle(exact - a.aimAngle)) > tol) return false;
  // Never through you (except at a Hunter riding you: that's what it's for).
  const pin = game.player.pinnedBy;
  if (t !== pin && playerInLine(game, a, td)) return false;
  return true;
}

// --- Shoves ---------------------------------------------------------------------------

function shoveAt(game, a, ang) {
  a.shoveFatigue = game.time - a.lastShove < 1.1 ? Math.min(a.shoveFatigue + 0.14, 0.75) : a.shoveFatigue;
  a.lastShove = game.time;
  a.shoveCd = 0.42 + a.shoveFatigue;
  a.facing = ang;
  a.aimAngle = ang;
  let hits = 0;
  game.killCredit = 'ally';
  game.zhash.query(a.x, a.y, SHOVE_REACH + 40, (z) => {
    if (!z.alive || z.noCollide) return;
    const dx = z.x - a.x;
    const dy = z.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d - z.r > SHOVE_REACH) return;
    if (Math.abs(wrapAngle(Math.atan2(dy, dx) - ang)) > SHOVE_HALF_ANGLE && d > a.r + z.r + 4) return;
    hits++;
    if (z.type === 'tank') return;
    z.windup = 0;
    z.attackCd = Math.max(z.attackCd || 0, 0.5);
    damageZombie(game, z, 8, dx / d, dy / d, 340, rand(0.75, 0.95), false);
  });
  game.killCredit = null;
  game.effects.shoveArc(a.x, a.y, ang, SHOVE_REACH + a.r);
  if (hits) game.audio.thud(a.x, a.y);
}

/** Shove a Hunter off you (the L4D teammate save). */
function pullOff(game, a, h) {
  const p = game.player;
  const dx = h.x - a.x;
  const dy = h.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  releasePin(game);
  // Knocked off you, away from the ally.
  h.x = p.x + ux * (p.r + h.r + 8);
  h.y = p.y + uy * (p.r + h.r + 8);
  game.world.collide(h, h.r);
  h.stun(1.6);
  h.vx = ux * 360;
  h.vy = uy * 360;
  h.pounceCd = 3;
  a.shoveCd = 0.6;
  a.facing = Math.atan2(dy, dx);
  a.aimAngle = a.facing;
  game.effects.shoveArc(a.x, a.y, a.facing, SHOVE_REACH + a.r);
  game.stats.allySaves++;
  game.announce('ALLY SAVED YOU', '#9fd8ff', 1.3, 'small');
  game.audio.shove(true);
  game.addTrauma(0.15);
}

// --- Movement helpers -------------------------------------------------------------------

/** Unit direction toward (x, y): straight if the way is clear, else along the flow field (it leads to you). */
function steerTo(game, a, x, y, dt, out) {
  const W = game.world;
  a.directT -= dt;
  if (a.directT <= 0) {
    a.directT = 0.2;
    a.direct = W.segmentClear(a.x, a.y, x, y, W.moveBlockers);
  }
  const dx = x - a.x;
  const dy = y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  if (a.direct || !W.flow.dirAt(a.x, a.y, out)) {
    out.x = dx / d;
    out.y = dy / d;
  }
  return d;
}

function nearestZombie(game, a, radius) {
  let best = null;
  let bd = radius;
  game.zhash.query(a.x, a.y, radius, (z) => {
    if (!z.alive || z.noCollide) return;
    const d = Math.hypot(z.x - a.x, z.y - a.y) - z.r;
    if (d < bd) {
      bd = d;
      best = z;
    }
  });
  return best ? { z: best, d: bd } : null;
}

function threatWithin(game, a, radius) {
  const r2 = radius * radius;
  for (const z of game.zombies) {
    if (!z.alive || z.state !== 'chase') continue;
    if ((z.x - a.x) ** 2 + (z.y - a.y) ** 2 < r2) return true;
  }
  return false;
}

// --- Per frame -----------------------------------------------------------------------------

export function updateAlly(game, dt) {
  const a = game.ally;
  if (!a || !a.alive) return;
  const p = game.player;
  const S = game.settings;
  const W = game.world;
  a.hurtT -= dt;
  a.shoveCd -= dt;
  a.recoil *= Math.exp(-14 * dt);
  a.shoveFatigue = Math.max(0, a.shoveFatigue - dt * 0.35);
  updateWeapon(a, dt);

  if (a.down) {
    updateDown(game, a, dt);
    return;
  }

  // --- Where to be --------------------------------------------------------------------
  const pin = p.pinnedBy && p.pinnedBy.alive ? p.pinnedBy : null;
  const tank = game.director.tankAlive ? game.director.tank : null;
  const tankD = tank ? Math.hypot(tank.x - a.x, tank.y - a.y) : Infinity;
  const tankOnIt = !!tank && Math.abs(wrapAngle(Math.atan2(a.y - tank.y, a.x - tank.x) - tank.face)) < 1.2;
  let speed = S.moveSpeed * (a.hp < 40 ? 0.85 : 1);
  let wantX = 0;
  let wantY = 0;
  let moving = false;

  // Patch itself up when hurt and nothing's coming (you're on your own meanwhile).
  const healing = a.medkits > 0 && a.hp < ALLY.healBelow && !pin && !threatWithin(game, a, 260);
  if (healing) {
    a.healT += dt;
    if (a.healT >= ALLY.healTime) {
      a.hp = Math.min(a.maxHp, a.hp + Math.max(30, (a.maxHp - a.hp) * 0.8));
      a.medkits--;
      a.healT = 0;
      game.announce('ALLY HEALED', '#7dffa1', 1, 'small');
      game.audio.pickup();
    }
  } else a.healT = 0;

  if (pin) {
    // You're pinned: run in and shove it off you.
    const d = steerTo(game, a, pin.x, pin.y, dt, tmp);
    wantX = tmp.x * speed * 1.08;
    wantY = tmp.y * speed * 1.08;
    moving = true;
    if (d - pin.r <= SHOVE_REACH + 2 && a.shoveCd <= 0) pullOff(game, a, pin);
  } else if (tank && (tankD < 170 || (tankD < ALLY.kiteTank && tankOnIt))) {
    // The Tank is on it: back off, leaning toward you, sliding along walls.
    // (A Tank busy chasing you just gets shot in the back.)
    let bx = 0;
    let by = 0;
    let bestScore = -Infinity;
    const awayA = Math.atan2(a.y - tank.y, a.x - tank.x);
    for (let k = -3; k <= 3; k++) {
      const ang = awayA + k * 0.45;
      const cx = Math.cos(ang);
      const cy = Math.sin(ang);
      const free = W.raycast(a.x, a.y, cx, cy, 70, W.moveBlockers).t;
      const tp = Math.hypot(p.x - a.x, p.y - a.y) || 1;
      const score = free / 70 - Math.abs(k) * 0.12 + 0.25 * ((p.x - a.x) * cx + (p.y - a.y) * cy) / tp;
      if (score > bestScore) {
        bestScore = score;
        bx = cx;
        by = cy;
      }
    }
    wantX = bx * speed;
    wantY = by * speed;
    moving = true;
  } else if (!healing) {
    // Follow: a spot behind and beside you (re-picked a few times a second).
    a.spotT -= dt;
    if (a.spotT <= 0) {
      a.spotT = 0.25;
      const sp = Math.hypot(p.vx, p.vy);
      const hx = sp > 40 ? p.vx / sp : Math.cos(p.facing);
      const hy = sp > 40 ? p.vy / sp : Math.sin(p.facing);
      // Lead your movement a little so it keeps pace instead of trailing.
      const lx = p.x + p.vx * 0.35;
      const ly = p.y + p.vy * 0.35;
      let sx = lx - hx * ALLY.spotBack - hy * ALLY.spotSide * a.side;
      let sy = ly - hy * ALLY.spotBack + hx * ALLY.spotSide * a.side;
      if (!W.isFree(sx, sy, a.r + 2) || !W.segmentClear(p.x, p.y, sx, sy, W.moveBlockers)) {
        a.side = -a.side; // try the other side next time; tuck in right behind you now
        sx = p.x - hx * 40;
        sy = p.y - hy * 40;
      }
      // Out of your line of fire: if you're aiming at its spot, swap sides.
      if (p.aimActive || p.firing) {
        const fa = p.fireAngle;
        const fx = sx - p.x;
        const fy = sy - p.y;
        const along = fx * Math.cos(fa) + fy * Math.sin(fa);
        if (along > 0 && Math.abs(fx * Math.sin(fa) - fy * Math.cos(fa)) < 40) a.side = -a.side;
      }
      a.spotX = sx;
      a.spotY = sy;
    }
    const d = steerTo(game, a, a.spotX, a.spotY, dt, tmp);
    if (d > ALLY.arrive) {
      // Ease into its spot; a bit faster than you when it has ground to make up.
      const pd = W.flow.pathDist(a.x, a.y);
      const k = pd > ALLY.sprintAt ? 1.2 : d > 90 ? 1.15 : clamp((d - 10) / 50, 0.3, 1);
      wantX = tmp.x * speed * k;
      wantY = tmp.y * speed * k;
      moving = true;
    }
  }

  // Swing wide of a Tank it has to pass.
  if (tank && tankD < 240 && !pin) {
    const k = (1 - tankD / 240) * speed;
    wantX += ((a.x - tank.x) / tankD) * k;
    wantY += ((a.y - tank.y) / tankD) * k;
    moving = true;
  }

  // Don't stand in your line of fire.
  if (!pin && (p.aimActive || p.firing)) {
    const fa = p.fireAngle;
    const ca = Math.cos(fa);
    const sa = Math.sin(fa);
    const fx = a.x - p.x;
    const fy = a.y - p.y;
    const along = fx * ca + fy * sa;
    const off = fx * sa - fy * ca;
    if (along > 0 && along < 500 && Math.abs(off) < a.r + 14) {
      const s = off >= 0 ? 1 : -1;
      wantX += sa * s * speed * 0.9;
      wantY += -ca * s * speed * 0.9;
      moving = true;
    }
  }

  // Something on it and it can't shove yet: back away from it.
  const near = nearestZombie(game, a, 60);
  if (near && near.d < 18 && !pin) {
    const dx = a.x - near.z.x;
    const dy = a.y - near.z.y;
    const d = Math.hypot(dx, dy) || 1;
    wantX += (dx / d) * speed * 0.5;
    wantY += (dy / d) * speed * 0.5;
    moving = true;
  }
  // Shove whatever is on it (rate limited like yours).
  if (near && near.d < a.r + 10 && a.shoveCd <= 0 && near.z.type !== 'tank') {
    shoveAt(game, a, Math.atan2(near.z.y - a.y, near.z.x - a.x));
  }

  const wl = Math.hypot(wantX, wantY);
  if (wl > speed * 1.2) {
    wantX *= (speed * 1.2) / wl;
    wantY *= (speed * 1.2) / wl;
  }
  const k = 1 - Math.exp(-12 * dt);
  a.vx += (wantX - a.vx) * k;
  a.vy += (wantY - a.vy) * k;
  a.x += a.vx * dt;
  a.y += a.vy * dt;
  W.collide(a, a.r);
  W.collide(a, a.r);
  const spd = Math.hypot(a.vx, a.vy);
  a.walk += spd * dt * 0.06;

  // --- Shooting -----------------------------------------------------------------------
  a.firing = !healing && combat(game, a, dt);
  if (!a.target) {
    a.idleT += dt;
    // Look where it's going, or where you're looking.
    const look = spd > 30 ? Math.atan2(a.vy, a.vx) : p.facing;
    a.facing += wrapAngle(look - a.facing) * Math.min(1, dt * 6);
    a.aimAngle = a.facing;
    const w = a.weapon;
    if (a.idleT > 1.5 && !w.reloading && w.mag < w.def.mag * 0.5) startReload(a);
  } else a.idleT = 0;
  if (a.firing) {
    a.cooldown -= dt;
    let guard = 0;
    while (a.cooldown <= 0 && guard++ < 4) {
      if (!fire(game, a)) {
        a.cooldown = Math.max(a.cooldown, 0);
        break;
      }
    }
  } else {
    a.cooldown = Math.max(0, a.cooldown - dt);
    a.bloom = Math.max(0, a.bloom - a.weapon.def.bloomDecay * dt);
  }

  // --- Lost or stuck: bring it back next to you ------------------------------------------
  a.checkT -= dt;
  if (a.checkT <= 0) {
    a.checkT = 0.5;
    const moved = Math.hypot(a.x - a.lastX, a.y - a.lastY);
    a.lastX = a.x;
    a.lastY = a.y;
    a.stuckT = moving && moved < 8 ? a.stuckT + 0.5 : 0;
    const pd = W.flow.pathDist(a.x, a.y);
    const dp = Math.hypot(p.x - a.x, p.y - a.y);
    if (p.alive && (!Number.isFinite(pd) || pd > ALLY.warpAt || (a.stuckT >= 3 && dp > 160))) warpNearPlayer(game, a);
  }
}

function updateDown(game, a, dt) {
  const p = game.player;
  const f = Math.exp(-8 * dt);
  a.vx *= f;
  a.vy *= f;
  a.x += a.vx * dt;
  a.y += a.vy * dt;
  game.world.collide(a, a.r);
  if (!game.won) a.downHp -= dt * (100 / ALLY.bleedOut);
  if (a.downHp <= 0) {
    allyDies(game, a);
    return;
  }
  // You revive it by standing next to it without shooting.
  const d = Math.hypot(p.x - a.x, p.y - a.y);
  if (p.alive && !p.pinnedBy && !p.firing && d <= ALLY.reviveRange) {
    a.revive += dt / ALLY.reviveTime;
    if (a.revive >= 1) {
      reviveAlly(game, a);
      return;
    }
  } else a.revive = Math.max(0, a.revive - dt * 1.5);
  // Still fights from the floor: shorter range, slower and sloppier (see fire()).
  a.firing = combat(game, a, dt, 0.6);
  if (a.firing) {
    a.cooldown -= dt;
    let guard = 0;
    while (a.cooldown <= 0 && guard++ < 2) {
      if (!fire(game, a)) {
        a.cooldown = Math.max(a.cooldown, 0);
        break;
      }
    }
  } else a.cooldown = Math.max(0, a.cooldown - dt);
}
