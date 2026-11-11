// The Night Terror: a special you can only see in light.
//
//  - In the dark it is invisible: bullets pass through it, the laser, aim
//    assist and the teammate don't see it either. Lamps, muzzle flashes, fire
//    and your flashlight show it (and make it solid enough to shoot).
//  - It circles round to the side your flashlight isn't pointing, breathes in
//    (the cue: a hiss and a pale puff of breath in the dark) and lunges.
//    A shove as it arrives throws it off; so does turning your light on it.
//  - Light hurts it: caught in your beam (or the teammate's, or fire) it
//    flinches, smokes and backs off. Keep it lit long enough and it flees.
//  - Your heartbeat speeds up while it's close and unseen.

import { rand, wrapAngle, clamp, smoothstep, lampLit } from '../util.js';
import { newId, damageZombie } from './zombies.js';
import { finaleLights } from './finale.js';

export const TERROR = {
  hp: 180,
  r: 11,
  speed: 250, // stalking in the dark (you run at 190)
  orbitR: 200, // circles you about this far out, on your dark side
  strikeRange: 160, // starts its lunge from about here
  windup: 0.5, // the in-breath before the lunge (your cue)
  lungeSpeed: 640,
  lungeOvershoot: 60,
  damage: 18,
  shoveReach: 74, // your centre to its edge, while the shove window is open
  flinch: 0.42, // light this strong makes it recoil
  burnToFlee: 2.2, // seconds of full light (in total) until it gives up and flees
  hitLit: 0.3, // bullets pass through it below this much light
};

const tmp = { x: 0, y: 0 };
const light = { see: 0, burn: 0 };
const finaleTmp = [];

/** 0..1 of a cone light at bearing (dx, dy, d) from its source. */
function beam(face, dx, dy, d, half, range) {
  if (d > range) return 0;
  if (d < 1) return 1;
  const a = Math.abs(wrapAngle(Math.atan2(dy, dx) - face));
  if (a > half) return 0;
  return (1 - smoothstep(half * 0.55, half, a)) * (1 - smoothstep(range * 0.7, range, d));
}

/**
 * How lit the point is: `see` (0..1) is how visible something there is,
 * `burn` (0..1) how hard the light is on it (flashlights, fire, burning fuel;
 * lamps and muzzle flashes only show it). Mirrors the lighting renderer.
 */
export function lightAt(game, x, y) {
  const S = game.settings;
  light.see = 0;
  light.burn = 0;
  if (!S.night) {
    light.see = 1;
    return light;
  }
  const add = (see, burn) => {
    if (see > light.see) light.see = see;
    if (burn > light.burn) light.burn = burn;
  };
  const W = game.world;
  const map = W.map;
  const t = game.time;
  const p = game.player;
  if (p.alive) {
    const dx = x - p.x;
    const dy = y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 115) add(0.08 + 0.42 * (1 - d / 115), 0); // the all-round glow: only a hint of it
    const c = Math.max(0.85 * beam(p.facing, dx, dy, d, 0.56, 440), beam(p.facing, dx, dy, d, 0.3, 500));
    if (c > 0.02 && W.segmentClear(p.x, p.y, x, y)) add(c, c);
  }
  const a = game.ally;
  if (a && a.alive && !a.down) {
    const dx = x - a.x;
    const dy = y - a.y;
    const c = beam(a.facing, dx, dy, Math.hypot(dx, dy), 0.42, 380) * 0.85;
    if (c > 0.02 && W.segmentClear(a.x, a.y, x, y)) add(c, c * 0.9);
  }
  for (const l of map.lamps) {
    const r = l.r || 165;
    const dx = x - l.x;
    const dy = y - l.y;
    if (dx * dx + dy * dy > r * r) continue;
    if (!lampLit(l, t)) continue;
    add(Math.min(1, (1 - Math.hypot(dx, dy) / r) * 1.7), 0);
  }
  for (const f of map.fires) {
    const d = Math.hypot(x - f.x, y - f.y);
    if (d < 230) add(Math.min(1, (1 - d / 230) * 1.8), (1 - d / 230) * 0.8);
  }
  for (const g of map.glows || []) {
    const d = Math.hypot(x - g.x, y - g.y);
    if (d < g.r) add((1 - d / g.r) * g.k * 1.2, 0);
  }
  if (game.events) {
    for (const b of game.events.burns) {
      const R = b.r * 1.9;
      const d = Math.hypot(x - b.x, y - b.y);
      if (d < R) add(1 - d / R, (1 - d / R) * 0.9);
    }
  }
  if (game.events && game.events.finale) {
    // Pier 9: the flare burns it; the ferry's searchlight is as bad as your flashlight.
    for (const L of finaleLights(game.events.finale, t, finaleTmp)) {
      const dx = x - L.x;
      const dy = y - L.y;
      const d = Math.hypot(dx, dy);
      const k = L.cone !== undefined ? beam(L.cone, dx, dy, d, L.half, L.r) : d < L.r ? (1 - d / L.r) * L.k * 1.4 : 0;
      if (k > 0.02) add(Math.min(1, k), k * L.burn);
    }
  }
  for (const L of game.effects.lights) {
    const d = Math.hypot(x - L.x, y - L.y);
    if (d >= L.r) continue;
    const k = (1 - d / L.r) * L.k * (L.life / L.max);
    add(Math.min(1, k * 1.6), L.r > 220 ? k : 0); // explosions scorch it, muzzle flashes just show it
  }
  return light;
}

/** A lunge needs a body-wide lane. */
function clearLane(W, x0, y0, x1, y1, r) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = Math.hypot(dx, dy) || 1;
  const nx = (-dy / d) * r * 0.8;
  const ny = (dx / d) * r * 0.8;
  const L = W.moveBlockers;
  return W.segmentClear(x0, y0, x1, y1, L) && W.segmentClear(x0 + nx, y0 + ny, x1 + nx, y1 + ny, L) && W.segmentClear(x0 - nx, y0 - ny, x1 - nx, y1 - ny, L);
}

export class NightTerror {
  constructor(x, y) {
    this.id = newId();
    this.type = 'terror';
    this.mass = 1;
    this.knockScale = 0.5;
    this.staggerable = false; // it has its own flinch
    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.vx = 0;
    this.vy = 0;
    this.r = TERROR.r;
    this.hp = TERROR.hp;
    this.maxHp = TERROR.hp;
    this.alive = true;
    this.state = 'chase';
    this.alertDelay = 0;
    this.stagger = 0;
    this.mode = 'stalk'; // stalk | windup | lunge | recoil | retreat | flee
    this.modeT = 0;
    this.face = 0;
    this.hitFlash = 0;
    this.anim = rand(0, 10);
    this.skin = '#c8cdd6';
    this.shirt = '#1c1f26';
    this.lit = 0; // 0..1 how visible it is (smoothed)
    this.burn = 0; // 0..1 how hard the light is on it right now
    this.burnT = 0; // seconds of light taken (flees at TERROR.burnToFlee)
    this.ghost = true; // the laser, aim assist, bullets and the teammate pass over it
    this.attackCd = rand(2, 3.5);
    this.side = Math.random() < 0.5 ? 1 : -1;
    this.losT = 0;
    this.hasLOS = false;
    this.nearT = 0; // time spent close without an opening (it gets bolder)
    this.whisperT = rand(0.6, 1.6);
    this.beatT = 0.4;
    this.puffs = []; // breath puffs (the tell), drawn above the darkness
    this.lungeX = 1;
    this.lungeY = 0;
    this.lungeLeft = 0;
    this.noCollide = false;
  }

  onHit(game, dmg, stagger) {
    // A shove (or a big hit) knocks it out of its in-breath.
    if (stagger >= 0.5 && (this.mode === 'stalk' || this.mode === 'windup')) recoil(game, this, 0.6);
    else if (this.mode === 'windup' && dmg >= 40) recoil(game, this, 0.4);
  }

  onDeath(game) {
    game.stats.terrors++;
    game.audio.terrorDie(this.x, this.y);
    game.announce('NIGHT TERROR DOWN', '#cfe3ff', 1.4, 'small');
    for (let i = 0; i < 8; i++) game.effects.smoke(this.x + rand(-10, 10), this.y + rand(-10, 10), rand(10, 18), rand(8, 40));
  }
}

function puff(z, k) {
  const ca = Math.cos(z.face);
  const sa = Math.sin(z.face);
  z.puffs.push({ x: z.x + ca * z.r * 0.9, y: z.y + sa * z.r * 0.9, vx: ca * 18, vy: sa * 18, t: 0, k });
}

function recoil(game, z, t = rand(0.35, 0.5)) {
  const p = game.player;
  const dx = z.x - p.x;
  const dy = z.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  z.mode = 'recoil';
  z.modeT = t;
  z.noCollide = false;
  z.vx = (dx / d) * 300;
  z.vy = (dy / d) * 300;
  z.attackCd = Math.max(z.attackCd, 1.4);
  game.audio.terrorShriek(z.x, z.y);
}

function startFlee(game, z) {
  z.mode = 'flee';
  z.modeT = 5;
  z.noCollide = false;
  const p = game.player;
  if (game.won || !p.alive || !game.settings.night) return; // it just slips away
  game.stats.terrorsFled++;
  game.audio.terrorShriek(z.x, z.y, 1.3);
  game.announce('IT FLED THE LIGHT', '#cfe3ff', 1.4, 'small');
}

function strike(game, z) {
  game.hurtPlayer(TERROR.damage * game.settings.zombieDamage, z, { knock: 220, slow: 0.5, knockT: 0.18 });
  game.stats.terrorHits++;
  game.audio.terrorStrike(z.x, z.y);
  game.addTrauma(0.3);
  game.haptic(60);
  z.mode = 'retreat';
  z.modeT = rand(1.4, 2.2);
  z.attackCd = rand(4, 6);
  z.nearT = 0;
  z.noCollide = false;
  z.vx = -z.lungeX * 260;
  z.vy = -z.lungeY * 260;
}

function shovedOff(game, z) {
  const p = game.player;
  const dx = z.x - p.x;
  const dy = z.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  recoil(game, z, 1.1);
  z.vx = (dx / d) * 380;
  z.vy = (dy / d) * 380;
  z.attackCd = rand(3, 4.5);
  game.stats.terrorShoves++;
  game.announce('SHOVED IT OFF', '#cfe3ff', 1.1, 'small');
  game.audio.deadstop();
  game.addTrauma(0.2);
  game.haptic(30);
  damageZombie(game, z, 10, dx / d, dy / d, 0, 0, false);
}

function lunge(game, z, d) {
  const p = game.player;
  const t = d / TERROR.lungeSpeed;
  const tx = p.x + p.vx * t * 0.5;
  const ty = p.y + p.vy * t * 0.5;
  const lx = tx - z.x;
  const ly = ty - z.y;
  const l = Math.hypot(lx, ly) || 1;
  z.lungeX = lx / l;
  z.lungeY = ly / l;
  z.lungeLeft = l + TERROR.lungeOvershoot;
  z.face = Math.atan2(ly, lx);
  z.mode = 'lunge';
  z.noCollide = true;
  game.audio.terrorLunge(z.x, z.y);
}

export function updateTerror(game, z, dt) {
  const p = game.player;
  const W = game.world;
  const S = game.settings;
  z.hitFlash -= dt;
  z.anim += dt;
  z.attackCd -= dt;
  z.modeT -= dt;
  for (const b of z.puffs) {
    b.t += dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  while (z.puffs.length && z.puffs[0].t > 1.3) z.puffs.shift();

  // How lit it is: shows up fast, fades a little slower (no flicker under a strobing muzzle).
  const L = lightAt(game, z.x, z.y);
  const k = 1 - Math.exp(-(L.see > z.lit ? 16 : 5) * dt);
  z.lit += (L.see - z.lit) * k;
  z.burn = L.burn;
  z.ghost = z.lit < TERROR.hitLit;
  if (z.burn > 0.25 && z.mode !== 'flee') z.burnT += dt * z.burn;
  if (z.burn > 0.3 && Math.random() < dt * 22) game.effects.smoke(z.x + rand(-7, 7), z.y + rand(-7, 7), rand(5, 9), rand(20, 44));

  const dx = p.x - z.x;
  const dy = p.y - z.y;
  const d = Math.hypot(dx, dy) || 1e-6;

  if (z.mode !== 'flee' && (!S.night || game.won || !p.alive || z.burnT >= TERROR.burnToFlee)) startFlee(game, z);
  if ((z.mode === 'stalk' || z.mode === 'windup' || z.mode === 'lunge' || z.mode === 'retreat') && z.burn > TERROR.flinch) recoil(game, z);

  // Whispers while it stalks; your pulse while it's close and unseen.
  z.whisperT -= dt;
  if (z.whisperT <= 0 && z.mode !== 'flee') {
    z.whisperT = rand(2.2, 4.2);
    if (d < 750) {
      game.audio.terrorWhisper(z.x, z.y);
      puff(z, 0.22);
    }
  }
  if (p.alive && z.mode !== 'flee' && d < 340 && z.lit < 0.35) {
    z.beatT -= dt;
    if (z.beatT <= 0) {
      const near = 1 - d / 340;
      z.beatT = 1.05 - 0.55 * near;
      game.audio.heartbeat(0.3 + 0.7 * near);
    }
  }

  let wantX = 0;
  let wantY = 0;
  let steer = 8;
  switch (z.mode) {
    case 'stalk': {
      z.noCollide = false;
      z.losT -= dt;
      if (z.losT <= 0) {
        z.losT = 0.12;
        z.hasLOS = d < 520 && clearLane(W, z.x, z.y, p.x, p.y, z.r);
      }
      const bearing = Math.atan2(-dy, -dx); // where it is, seen from you
      const look = Math.abs(wrapAngle(bearing - p.facing)); // 0 = right in your beam
      if (z.hasLOS && d < 430) z.nearT += dt;
      const bold = z.nearT > 7; // you keep turning to face it: it stops waiting for your back
      const ready = z.attackCd <= 0 && p.alive && !p.pinnedBy && !game.won;
      if (ready && z.hasLOS && d < TERROR.strikeRange + 60 && look > (bold ? 0.62 : 0.95) && z.lit < 0.35) {
        z.mode = 'windup';
        z.modeT = TERROR.windup;
        game.audio.terrorInhale(z.x, z.y);
        puff(z, 0.55);
        break;
      }
      let mx;
      let my;
      if (z.hasLOS && d < 430) {
        // Circle round to the side you're not lighting (the short way never crosses your beam).
        const turn = wrapAngle(p.facing + Math.PI - bearing);
        if (Math.abs(turn) >= 0.25) z.side = Math.sign(turn);
        const ux = -dx / d;
        const uy = -dy / d;
        const want = ready ? TERROR.strikeRange * 0.85 : TERROR.orbitR;
        const radial = clamp((want - d) / 80, -1, 1); // + = away from you
        const tang = Math.abs(turn) > 0.3 ? 1 : 0.35;
        mx = -uy * z.side * tang + ux * radial;
        my = ux * z.side * tang + uy * radial;
      } else {
        // Far, or round a corner: follow the flow field, slipping sideways out of your beam.
        if (W.flow.dirAt(z.x, z.y, tmp)) {
          mx = tmp.x;
          my = tmp.y;
        } else {
          mx = dx / d;
          my = dy / d;
        }
        if (look < 0.7 && d < 560) {
          const s = Math.sign(wrapAngle(bearing - p.facing)) || z.side;
          mx += (dy / d) * s * 0.9;
          my += (-dx / d) * s * 0.9;
        }
      }
      const l = Math.hypot(mx, my) || 1;
      let sp = TERROR.speed * S.zombieSpeed;
      if (z.lit > 0.5 && z.burn < 0.2) sp *= 1.2; // darts across lamplight: a glimpse, then gone
      wantX = (mx / l) * sp;
      wantY = (my / l) * sp;
      break;
    }
    case 'windup': {
      steer = 14;
      z.face += wrapAngle(Math.atan2(dy, dx) - z.face) * Math.min(1, dt * 12);
      if (Math.random() < dt * 9) puff(z, 0.45);
      z.losT -= dt;
      if (z.losT <= 0) {
        z.losT = 0.1;
        z.hasLOS = clearLane(W, z.x, z.y, p.x, p.y, z.r);
      }
      if (!z.hasLOS || !p.alive || p.pinnedBy || d > TERROR.strikeRange + 160) {
        z.mode = 'stalk';
        z.attackCd = 0.8;
        break;
      }
      if (z.modeT <= 0) lunge(game, z, d);
      break;
    }
    case 'lunge': {
      const step = TERROR.lungeSpeed * dt;
      const n = Math.max(1, Math.ceil(step / 10)); // sub-steps: no tunnelling through you or a wall
      for (let i = 0; i < n && z.mode === 'lunge'; i++) {
        const s = step / n;
        z.x += z.lungeX * s;
        z.y += z.lungeY * s;
        z.lungeLeft -= s;
        if (W.collide(z, z.r)) {
          z.mode = 'retreat';
          z.modeT = rand(0.8, 1.2);
          z.attackCd = rand(2, 3);
          z.noCollide = false;
          game.audio.thud(z.x, z.y);
          break;
        }
        const ed = Math.hypot(p.x - z.x, p.y - z.y);
        if (p.alive && !game.won) {
          if (p.shoveActiveT > 0 && ed - z.r <= TERROR.shoveReach) {
            shovedOff(game, z);
            break;
          }
          if (ed < z.r + p.r + 4) {
            strike(game, z);
            break;
          }
        }
        if (z.lungeLeft <= 0) {
          z.mode = 'retreat';
          z.modeT = rand(0.9, 1.4);
          z.attackCd = rand(2.5, 4);
          z.noCollide = false;
          z.vx = z.lungeX * 140;
          z.vy = z.lungeY * 140;
          break;
        }
      }
      if (z.mode === 'lunge') {
        z.vx = z.lungeX * TERROR.lungeSpeed;
        z.vy = z.lungeY * TERROR.lungeSpeed;
      }
      return;
    }
    case 'recoil': {
      // Twitching backwards out of the light.
      steer = 3;
      z.noCollide = false;
      wantX = (-dx / d) * 140;
      wantY = (-dy / d) * 140;
      if (z.modeT <= 0) {
        if (z.burn > TERROR.flinch) z.modeT = 0.25;
        else {
          z.mode = 'retreat';
          z.modeT = rand(0.8, 1.4);
        }
      }
      break;
    }
    case 'retreat':
    case 'flee': {
      // Back off into the dark (away along the flow field, drifting sideways).
      z.noCollide = false;
      let mx = -dx / d;
      let my = -dy / d;
      if (W.flow.dirAt(z.x, z.y, tmp)) {
        mx = -tmp.x;
        my = -tmp.y;
      }
      mx += (-dy / d) * z.side * 0.45;
      my += (dx / d) * z.side * 0.45;
      const l = Math.hypot(mx, my) || 1;
      const sp = TERROR.speed * S.zombieSpeed * (z.mode === 'flee' ? 1.1 : 0.85);
      wantX = (mx / l) * sp;
      wantY = (my / l) * sp;
      if (z.mode === 'retreat' && z.modeT <= 0) z.mode = 'stalk';
      if (z.mode === 'flee' && (z.modeT <= 0 || (d > 620 && z.lit < 0.05))) z.alive = false; // gone (not a kill)
      break;
    }
    default:
      break;
  }

  const kk = 1 - Math.exp(-steer * dt);
  z.vx += (wantX - z.vx) * kk;
  z.vy += (wantY - z.vy) * kk;
  z.x += z.vx * dt;
  z.y += z.vy * dt;
  W.collide(z, z.r);
  if (z.mode !== 'recoil' && z.mode !== 'windup' && z.vx * z.vx + z.vy * z.vy > 100) {
    z.face += wrapAngle(Math.atan2(z.vy, z.vx) - z.face) * Math.min(1, dt * 10);
  }
}

export function spawnTerror(game, x, y) {
  const z = new NightTerror(x, y);
  game.zombies.push(z);
  if (!game.terrorSeen) {
    game.terrorSeen = true;
    game.announce('SOMETHING IN THE DARK: LIGHT IT UP', '#cfe3ff', 2.4, 'small');
  }
  return z;
}
