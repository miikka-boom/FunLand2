// Special infected. They live in game.zombies next to the commons, so bullets,
// aim assist, the spatial hash and crowd physics treat them like any body;
// their brains run here.
//
//  HUNTER  tests tap-shove timing. Stalks and circles, then crouches with a
//          screech (the telegraph) and pounces. Shove it as it lands on you
//          (DEADSTOP) or shoot it out of the air (SKEET). If it lands you are
//          pinned: tap to break free while it claws.
//  TANK    tests kiting while shooting backwards. Slow to turn, huge HP,
//          telegraphed haymaker that sends you flying, and rock throws you
//          can sidestep or shoot down.

import { rand, wrapAngle, clamp } from '../util.js';
import { newId, damageZombie } from './zombies.js';
import { updateTerror } from './terror.js';

const tmp = { x: 0, y: 0 };

// --- Hunter -------------------------------------------------------------------

export const HUNTER = {
  hp: 200,
  speed: 245,
  pounceMax: 430,
  crouch: 0.75, // telegraph (screech) before a pounce
  crouchClose: 0.42, // shorter when you're right next to it
  leapSpeed: 720,
  leapOvershoot: 70,
  clawEvery: 0.32,
  clawDamage: 4,
  pinDamage: 6,
  deadstopReach: 104, // your centre to its edge, while the shove window is open
};

export class Hunter {
  constructor(x, y) {
    this.id = newId();
    this.type = 'hunter';
    this.mass = 1.2;
    this.knockScale = 0.6;
    this.staggerable = false; // has its own stun
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.r = 11;
    this.hp = HUNTER.hp;
    this.maxHp = HUNTER.hp;
    this.alive = true;
    this.state = 'chase';
    this.alertDelay = 0;
    this.stagger = 0;
    this.mode = 'stalk'; // stalk | crouch | leap | pin | stunned
    this.modeT = 0;
    this.pounceCd = rand(1.2, 2.2);
    this.losT = 0;
    this.hasLOS = false;
    this.face = 0;
    this.hitFlash = 0;
    this.anim = rand(0, 10);
    this.skin = '#8a8f80';
    this.shirt = '#283044';
    this.growlT = rand(0.4, 1.6);
    this.leapX = 1;
    this.leapY = 0;
    this.leapLeft = 0;
    this.clawT = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.trail = [];
    this.noCollide = false;
  }

  stun(t) {
    this.mode = 'stunned';
    this.modeT = t;
    this.noCollide = false;
    this.trail.length = 0;
    this.pounceCd = Math.max(this.pounceCd, 1.6);
  }

  onHit(game, dmg, stagger) {
    // Shooting it mid-crouch breaks the pounce; a shove on the ground stuns it.
    if (this.mode === 'crouch' && (dmg >= 45 || stagger > 0)) {
      this.mode = 'stalk';
      this.pounceCd = 0.9;
    }
    if (stagger >= 0.5 && (this.mode === 'stalk' || this.mode === 'crouch')) this.stun(0.8);
  }

  onDeath(game) {
    const p = game.player;
    if (this.mode === 'leap') {
      game.stats.skeets++;
      game.announce('SKEET!', '#ffd36b', 1.3, 'small');
    }
    if (p.pinnedBy === this) releasePin(game);
    game.stats.hunters++;
    game.audio.hunterDie(this.x, this.y);
  }
}

/** A pounce needs a body-wide lane, not just a line of sight. */
function clearLane(W, x0, y0, x1, y1, r) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = Math.hypot(dx, dy) || 1;
  const nx = (-dy / d) * r * 0.8;
  const ny = (dx / d) * r * 0.8;
  const L = W.moveBlockers;
  return (
    W.segmentClear(x0, y0, x1, y1, L) &&
    W.segmentClear(x0 + nx, y0 + ny, x1 + nx, y1 + ny, L) &&
    W.segmentClear(x0 - nx, y0 - ny, x1 - nx, y1 - ny, L)
  );
}

function launch(game, h, d) {
  const p = game.player;
  const t = d / HUNTER.leapSpeed;
  // Half lead: it predicts you, but changing direction during the screech dodges.
  const tx = p.x + p.vx * t * 0.5;
  const ty = p.y + p.vy * t * 0.5;
  const lx = tx - h.x;
  const ly = ty - h.y;
  const l = Math.hypot(lx, ly) || 1;
  h.leapX = lx / l;
  h.leapY = ly / l;
  h.leapLeft = Math.min(l + HUNTER.leapOvershoot, HUNTER.pounceMax + 120);
  h.face = Math.atan2(ly, lx);
  h.mode = 'leap';
  h.noCollide = true;
  h.trail.length = 0;
  game.audio.hunterPounce(h.x, h.y);
}

export function deadstop(game, h) {
  const p = game.player;
  const dx = h.x - p.x;
  const dy = h.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  h.stun(1.6);
  h.vx = (dx / d) * 320;
  h.vy = (dy / d) * 320;
  h.pounceCd = 2.6;
  game.stats.deadstops++;
  game.announce('DEADSTOP!', '#9fd8ff', 1.2, 'small');
  game.audio.deadstop();
  game.addTrauma(0.25);
  game.haptic(30);
  damageZombie(game, h, 15, dx / d, dy / d, 0, 0, false);
}

function pin(game, h) {
  const p = game.player;
  h.mode = 'pin';
  h.noCollide = true;
  h.clawT = 0.25;
  h.trail.length = 0;
  p.pinnedBy = h;
  p.struggle = 0;
  p.vx = 0;
  p.vy = 0;
  p.firing = false;
  game.stats.pins++;
  game.audio.hunterPin();
  game.addTrauma(0.5);
  game.haptic(80);
  game.director.addIntensity(0.3);
  game.hurtPlayer(HUNTER.pinDamage * game.settings.zombieDamage, h, { knock: 0, slow: 0, pinned: true });
}

export function releasePin(game) {
  const p = game.player;
  p.pinnedBy = null;
  p.struggle = 0;
  p.pinImmuneT = 0.9;
}

/** One break-free press while pinned (every shove input counts). */
export function struggle(game) {
  const p = game.player;
  const h = p.pinnedBy;
  if (!h) return;
  p.struggle += 1;
  p.lastStruggle = game.time;
  game.addTrauma(0.07);
  game.haptic(12);
  game.audio.struggle();
  if (p.struggle >= game.settings.hunterBreakTaps) {
    releasePin(game);
    if (h.alive) {
      const a = h.face + Math.PI; // thrown back the way it came
      h.x = p.x + Math.cos(a) * (p.r + h.r + 6);
      h.y = p.y + Math.sin(a) * (p.r + h.r + 6);
      game.world.collide(h, h.r);
      h.stun(1.5);
      h.vx = Math.cos(a) * 360;
      h.vy = Math.sin(a) * 360;
      h.pounceCd = 3;
    }
    game.stats.breakFrees++;
    game.announce('BROKE FREE', '#9fd8ff', 1, 'small');
    game.audio.shove(true);
    game.addTrauma(0.2);
  }
}

function updateHunter(game, h, dt) {
  const p = game.player;
  const W = game.world;
  const S = game.settings;
  h.hitFlash -= dt;
  h.anim += dt;
  h.pounceCd -= dt;
  const dx = p.x - h.x;
  const dy = p.y - h.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  let wantX = 0;
  let wantY = 0;
  let steer = 8;

  switch (h.mode) {
    case 'stalk': {
      h.noCollide = false;
      h.losT -= dt;
      if (h.losT <= 0) {
        h.losT = 0.12;
        h.hasLOS = d < HUNTER.pounceMax + 80 && clearLane(W, h.x, h.y, p.x, p.y, h.r);
      }
      h.growlT -= dt;
      if (h.growlT <= 0) {
        h.growlT = rand(1.4, 2.8);
        if (d < 750) game.audio.hunterGrowl(h.x, h.y);
      }
      const canPounce = p.alive && !p.pinnedBy && p.pinImmuneT <= 0 && !game.won && h.pounceCd <= 0 && h.hasLOS && d <= HUNTER.pounceMax;
      if (canPounce) {
        h.mode = 'crouch';
        h.modeT = d < 160 ? HUNTER.crouchClose : HUNTER.crouch;
        game.audio.hunterScreech(h.x, h.y);
        break;
      }
      let mx = dx / d;
      let my = dy / d;
      if (!h.hasLOS && W.flow.dirAt(h.x, h.y, tmp)) {
        mx = tmp.x;
        my = tmp.y;
      }
      let sp = HUNTER.speed * S.zombieSpeed;
      if (h.hasLOS && d < 260) {
        // Circle you while the pounce recharges; back off if too close.
        const k = d < 160 ? -0.6 : 0.15;
        mx = (-dy / d) * h.strafe + (dx / d) * k;
        my = (dx / d) * h.strafe + (dy / d) * k;
        const l = Math.hypot(mx, my) || 1;
        mx /= l;
        my /= l;
        sp *= 0.8;
        if (Math.random() < dt * 0.4) h.strafe *= -1;
      }
      wantX = mx * sp;
      wantY = my * sp;
      break;
    }
    case 'crouch': {
      h.modeT -= dt;
      steer = 14;
      h.face += wrapAngle(Math.atan2(dy, dx) - h.face) * Math.min(1, dt * 12);
      h.losT -= dt;
      if (h.losT <= 0) {
        h.losT = 0.1;
        h.hasLOS = clearLane(W, h.x, h.y, p.x, p.y, h.r);
      }
      if (!h.hasLOS || !p.alive || p.pinnedBy || p.pinImmuneT > 0) {
        h.mode = 'stalk';
        h.pounceCd = 0.6;
        break;
      }
      if (h.modeT <= 0) launch(game, h, d);
      break;
    }
    case 'leap': {
      h.trail.push({ x: h.x, y: h.y });
      if (h.trail.length > 6) h.trail.shift();
      const step = HUNTER.leapSpeed * dt;
      const n = Math.max(1, Math.ceil(step / 10)); // sub-steps: no tunnelling through you or a wall
      for (let i = 0; i < n && h.mode === 'leap'; i++) {
        const s = step / n;
        h.x += h.leapX * s;
        h.y += h.leapY * s;
        h.leapLeft -= s;
        if (W.collide(h, h.r)) {
          h.stun(0.9); // slammed into a wall
          game.audio.thud(h.x, h.y);
          break;
        }
        const ed = Math.hypot(p.x - h.x, p.y - h.y);
        if (p.alive && !p.pinnedBy && p.pinImmuneT <= 0) {
          if (p.shoveActiveT > 0 && ed - h.r <= HUNTER.deadstopReach) {
            deadstop(game, h);
            break;
          }
          if (ed < h.r + p.r + 4) {
            pin(game, h);
            break;
          }
        }
        if (h.leapLeft <= 0) {
          h.stun(0.5); // whiffed: lands and recovers
          h.pounceCd = rand(1.8, 2.8);
          h.vx = h.leapX * 120;
          h.vy = h.leapY * 120;
          break;
        }
      }
      return;
    }
    case 'pin': {
      h.noCollide = true;
      h.x = p.x - Math.cos(h.face) * 5;
      h.y = p.y - Math.sin(h.face) * 5;
      h.clawT -= dt;
      if (h.clawT <= 0) {
        h.clawT = HUNTER.clawEvery;
        game.hurtPlayer(HUNTER.clawDamage * S.zombieDamage, h, { knock: 0, slow: 0, pinned: true });
        game.audio.claw();
      }
      if (!p.alive || game.won || p.pinnedBy !== h) {
        if (p.pinnedBy === h) releasePin(game);
        h.stun(1);
      }
      return;
    }
    case 'stunned': {
      h.modeT -= dt;
      steer = 3;
      if (h.modeT <= 0) h.mode = 'stalk';
      break;
    }
    default:
      break;
  }

  const k = 1 - Math.exp(-steer * dt);
  h.vx += (wantX - h.vx) * k;
  h.vy += (wantY - h.vy) * k;
  h.x += h.vx * dt;
  h.y += h.vy * dt;
  W.collide(h, h.r);
  if (h.mode === 'stalk' && h.vx * h.vx + h.vy * h.vy > 100) {
    h.face += wrapAngle(Math.atan2(h.vy, h.vx) - h.face) * Math.min(1, dt * 10);
  }
}

// --- Tank ---------------------------------------------------------------------

export const TANK = {
  hp: 2400,
  r: 24,
  speed: 182, // just under your run speed: kite it, but don't stop
  punchReach: 26,
  punchWindup: 0.42,
  punchDamage: 24,
  punchKnock: 560,
  punchCd: 1.1,
  rockMin: 280,
  rockMax: 820,
  rockWindup: 1.0,
  rockCd: [7, 10],
  rockSpeed: 560,
  rockDamage: 20,
  rockHp: 70,
};

export class Tank {
  constructor(x, y, hpMul = 1) {
    this.id = newId();
    this.type = 'tank';
    this.mass = 12;
    this.knockScale = 0.04;
    this.staggerable = false;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.r = TANK.r;
    this.hp = Math.round(TANK.hp * hpMul);
    this.maxHp = this.hp;
    this.alive = true;
    this.state = 'chase';
    this.alertDelay = 0;
    this.stagger = 0;
    this.mode = 'chase'; // chase | punch | throw
    this.modeT = 0;
    this.punchCd = 0;
    this.rockCd = rand(3, 5);
    this.losT = 0;
    this.hasLOS = false;
    this.shotLOS = false;
    this.face = 0;
    this.hitFlash = 0;
    this.anim = 0;
    this.stepT = 0;
    this.skin = '#a3968a';
    this.shirt = '#5a4a44';
    this.noCollide = false;
    this.spawnedAt = 0;
  }

  onDeath(game, dx, dy) {
    const t = game.time - this.spawnedAt;
    game.stats.tanks++;
    game.announce(`TANK DOWN · ${Math.round(t)}s`, '#ffd36b', 2.4);
    game.audio.tankMusic(false);
    game.audio.tankDie(this.x, this.y);
    game.effects.pool(this.x, this.y, 30);
    game.effects.gibs(this.x, this.y, dx, dy, 8);
    game.addTrauma(0.5);
    game.director.onTankDeath();
  }
}

function tankPunch(game, t) {
  const p = game.player;
  const S = game.settings;
  const dx = p.x - t.x;
  const dy = p.y - t.y;
  const d = Math.hypot(dx, dy) || 1;
  const reach = t.r + p.r + TANK.punchReach + 6;
  let hit = false;
  if (p.alive && d < reach && Math.abs(wrapAngle(Math.atan2(dy, dx) - t.face)) < 1.3) {
    hit = true;
    if (p.pinnedBy) {
      p.pinnedBy.stun(1.2);
      releasePin(game);
    }
    game.hurtPlayer(TANK.punchDamage * S.zombieDamage, t, { knock: TANK.punchKnock, knockT: 0.45, slow: 0.6 });
  }
  // The teammate gets the same haymaker if it's in the swing.
  const al = game.ally;
  if (al && al.alive && !al.down) {
    const ax = al.x - t.x;
    const ay = al.y - t.y;
    const ad = Math.hypot(ax, ay) || 1;
    if (ad < t.r + al.r + TANK.punchReach + 6 && Math.abs(wrapAngle(Math.atan2(ay, ax) - t.face)) < 1.3) {
      game.hurtAlly(TANK.punchDamage * S.zombieDamage, t, { knock: TANK.punchKnock * 0.8 });
    }
  }
  // Commons caught in the swing go flying.
  game.zhash.query(t.x, t.y, reach + 24, (z) => {
    if (!z.alive || z === t || z.type === 'tank') return;
    const zx = z.x - t.x;
    const zy = z.y - t.y;
    const zd = Math.hypot(zx, zy) || 1;
    if (zd - z.r > reach || Math.abs(wrapAngle(Math.atan2(zy, zx) - t.face)) > 1.3) return;
    damageZombie(game, z, 60, zx / zd, zy / zd, 520, 0.9);
  });
  game.effects.shoveArc(t.x, t.y, t.face, reach);
  game.audio.tankPunch(hit);
  game.addTrauma(hit ? 0.55 : 0.15);
  if (hit) game.haptic(70);
}

function throwRock(game, t) {
  const p = game.player;
  const sx = t.x + Math.cos(t.face) * (t.r + 8);
  const sy = t.y + Math.sin(t.face) * (t.r + 8);
  const d = Math.hypot(p.x - sx, p.y - sy);
  const flight = d / TANK.rockSpeed;
  // Leads you a little: strafing still beats it.
  const tx = p.x + p.vx * flight * 0.6;
  const ty = p.y + p.vy * flight * 0.6;
  const lx = tx - sx;
  const ly = ty - sy;
  const l = Math.hypot(lx, ly) || 1;
  const max = Math.min(TANK.rockMax + 200, l + 260);
  game.rocks.push({
    type: 'rock', alive: true, x: sx, y: sy, r: 13, hp: TANK.rockHp,
    vx: (lx / l) * TANK.rockSpeed, vy: (ly / l) * TANK.rockSpeed,
    dist: 0, max, rot: 0, spin: rand(-8, 8),
  });
  game.audio.rockThrow(t.x, t.y);
}

function updateTank(game, t, dt) {
  const p = game.player;
  const W = game.world;
  const S = game.settings;
  t.hitFlash -= dt;
  t.anim += dt;
  t.punchCd -= dt;
  t.rockCd -= dt;
  const dx = p.x - t.x;
  const dy = p.y - t.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  t.losT -= dt;
  if (t.losT <= 0) {
    t.losT = 0.2;
    t.hasLOS = d < 900 && W.segmentClear(t.x, t.y, p.x, p.y, W.moveBlockers);
    t.shotLOS = d < TANK.rockMax && W.segmentClear(t.x, t.y, p.x, p.y, W.shotBlockers);
  }
  const sp = TANK.speed * S.tankSpeed;
  let wantX = 0;
  let wantY = 0;
  let steer = 3.2; // heavy: turns slowly, so you can juke it

  switch (t.mode) {
    case 'chase': {
      let mx = dx / d;
      let my = dy / d;
      if (!t.hasLOS && W.flow.dirAt(t.x, t.y, tmp)) {
        mx = tmp.x;
        my = tmp.y;
      }
      wantX = mx * sp;
      wantY = my * sp;
      if (p.alive && !game.won) {
        if (d < t.r + p.r + TANK.punchReach && t.punchCd <= 0) {
          t.mode = 'punch';
          t.modeT = TANK.punchWindup;
          game.audio.tankGrunt(t.x, t.y);
        } else if (t.rockCd <= 0 && t.shotLOS && d > TANK.rockMin && d < TANK.rockMax) {
          t.mode = 'throw';
          t.modeT = TANK.rockWindup;
          game.audio.tankRoar(t.x, t.y, 0.55);
        }
      }
      break;
    }
    case 'punch': {
      t.modeT -= dt;
      wantX = (dx / d) * sp * 0.45; // lunges in during the wind-up
      wantY = (dy / d) * sp * 0.45;
      t.face += wrapAngle(Math.atan2(dy, dx) - t.face) * Math.min(1, dt * 6);
      if (t.modeT <= 0) {
        tankPunch(game, t);
        t.mode = 'chase';
        t.punchCd = TANK.punchCd;
      }
      break;
    }
    case 'throw': {
      t.modeT -= dt;
      steer = 8;
      t.face += wrapAngle(Math.atan2(dy, dx) - t.face) * Math.min(1, dt * 5);
      if (t.modeT <= 0) {
        throwRock(game, t);
        t.mode = 'chase';
        t.rockCd = rand(TANK.rockCd[0], TANK.rockCd[1]);
      }
      break;
    }
    default:
      break;
  }

  const k = 1 - Math.exp(-steer * dt);
  t.vx += (wantX - t.vx) * k;
  t.vy += (wantY - t.vy) * k;
  t.x += t.vx * dt;
  t.y += t.vy * dt;
  W.collide(t, t.r);
  const spd = Math.hypot(t.vx, t.vy);
  if (t.mode === 'chase' && spd > 20) t.face += wrapAngle(Math.atan2(t.vy, t.vx) - t.face) * Math.min(1, dt * 4);

  // Footsteps you feel before you see it.
  t.stepT -= dt * (0.3 + spd / sp);
  if (t.stepT <= 0) {
    t.stepT = 0.42;
    const near = clamp(1 - d / 750, 0, 1);
    if (near > 0) {
      game.addTrauma(0.07 * near);
      game.audio.tankStep(t.x, t.y);
      if (near > 0.55) game.haptic(8);
    }
  }
}

// --- Rocks ----------------------------------------------------------------------

export function shatterRock(game, r, x, y, shot = false) {
  r.alive = false;
  game.effects.debris(x, y, 10);
  game.audio.rockShatter(x, y);
  const near = clamp(1 - Math.hypot(game.player.x - x, game.player.y - y) / 500, 0, 1);
  game.addTrauma(0.12 * near);
  if (shot) {
    game.stats.rocksShot++;
    game.announce('ROCK SHOT', '#cfd8dc', 0.9, 'small');
  }
}

export function damageRock(game, r, dmg, dx, dy) {
  if (!r.alive) return;
  r.hp -= dmg;
  game.effects.sparks(r.x, r.y, -dx, -dy, 2);
  if (r.hp <= 0) shatterRock(game, r, r.x, r.y, true);
}

export function updateRocks(game, dt) {
  const p = game.player;
  const W = game.world;
  const S = game.settings;
  for (const r of game.rocks) {
    if (!r.alive) continue;
    const speed = Math.hypot(r.vx, r.vy) || 1;
    const step = speed * dt;
    const dx = r.vx / speed;
    const dy = r.vy / speed;
    const wall = W.raycast(r.x, r.y, dx, dy, step + r.r * 0.5, W.shotBlockers);
    // Swept circle vs the survivor along this step.
    const along = clamp((p.x - r.x) * dx + (p.y - r.y) * dy, 0, step);
    const cx = r.x + dx * along;
    const cy = r.y + dy * along;
    if (p.alive && Math.hypot(p.x - cx, p.y - cy) < r.r + p.r && (!wall.obstacle || along < wall.t)) {
      game.hurtPlayer(TANK.rockDamage * S.zombieDamage, { x: cx - dx * 10, y: cy - dy * 10 }, { knock: 380, knockT: 0.3, slow: 0.5 });
      shatterRock(game, r, cx, cy);
      continue;
    }
    const al = game.ally;
    if (al && al.alive && !al.down) {
      const aa = clamp((al.x - r.x) * dx + (al.y - r.y) * dy, 0, step);
      const ax = r.x + dx * aa;
      const ay = r.y + dy * aa;
      if (Math.hypot(al.x - ax, al.y - ay) < r.r + al.r && (!wall.obstacle || aa < wall.t)) {
        game.hurtAlly(TANK.rockDamage * S.zombieDamage, { x: ax - dx * 10, y: ay - dy * 10 }, { knock: 300 });
        shatterRock(game, r, ax, ay);
        continue;
      }
    }
    if (wall.obstacle) {
      shatterRock(game, r, r.x + dx * wall.t, r.y + dy * wall.t);
      continue;
    }
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.dist += step;
    r.rot += r.spin * dt;
    if (r.dist >= r.max) shatterRock(game, r, r.x, r.y);
  }
  let j = 0;
  for (let i = 0; i < game.rocks.length; i++) if (game.rocks[i].alive) game.rocks[j++] = game.rocks[i];
  game.rocks.length = j;
}

// --- Spawning + per-frame update ---------------------------------------------

export function spawnHunter(game, x, y) {
  const h = new Hunter(x, y);
  game.zombies.push(h);
  game.audio.hunterGrowl(x, y);
  return h;
}

export function spawnTank(game, x, y) {
  const t = new Tank(x, y, game.settings.tankHealth);
  t.spawnedAt = game.time;
  game.zombies.push(t);
  game.audio.tankRoar(x, y, 1);
  game.audio.tankMusic(true);
  game.announce('TANK!', '#ff5a4a', 2.6);
  game.addTrauma(0.3);
  return t;
}

export function updateSpecials(game, dt) {
  for (const z of game.zombies) {
    if (!z.alive) continue;
    if (z.type === 'hunter') updateHunter(game, z, dt);
    else if (z.type === 'tank') updateTank(game, z, dt);
    else if (z.type === 'terror') updateTerror(game, z, dt);
  }
}
