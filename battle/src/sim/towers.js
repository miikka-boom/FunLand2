// The towers of an arena match: a Guard Tower in front of each Castle.
//
// A tower is a wall of stone standing on the ground (base y = 0, centre x,
// hitbox w x h). Enemy beans can't walk through a standing one (Battle.towerWalls),
// weapons, pounces, arrows, blasts, quakes and spells damage it, and it shoots
// back: the Guard Tower fires real crossbow bolts (they live in battle.arrows,
// `from` = the tower), the Castle lobs cannonballs (battle.shots) once it is
// awake. Destroying a tower gives the other side crowns (battle.crowns).
//
// Every number here is gameplay: the balance tests tune these constants.

import { WORLD, enemyOf } from '../config.js';
import { levelMul } from './cards.js';

const G = WORLD.gravity;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Guard Tower at level 1 (hp and damage +10% per King Level). */
export const GUARD = {
  hp: 420, // (bot-vs-bot balance: defence is strong in one lane, so a tower can't be a fortress)
  w: 64,
  h: 150,
  range: 300, // along x from the tower's centre
  reload: 0.8, // seconds between bolts
  damage: 10, // a lone Clubber pair still reaches it and gets a few bonks in
  boltSpeed: 860, // px/s, a flat crossbow shot
  aimNoise: 0.02, // radians
  stun: 0.18,
  shieldPierce: 0.5, // share of a bolt's damage that goes through a raised shield
  crowns: 1,
};

/**
 * Castle at level 1. Asleep until its Guard Tower falls or it takes damage.
 * (Tuned with battle/tools/balance-arena.mjs so a push through the pocket can
 * finish it: at 1100 hp / 28 damage no castle fell in 0.6-vs-0.3 bot matches
 * and half of the even ones went to a 0-0 tiebreak.)
 */
export const CASTLE = {
  hp: 700,
  w: 170,
  h: 150,
  range: 300,
  reload: 1.5,
  damage: 18,
  splash: 40, // px around the impact (plus the bean's own radius)
  shotSpeed: 660,
  ballR: 7,
  knockUp: 460, // px/s: the satisfying hop of a cannonball landing among beans
  knockAway: 130,
  stun: 0.4,
  crowns: 3, // the castle is worth all three: destroying it wins the match
};

/** Share of each kind of damage a tower takes (stone shrugs off splash and spells). */
// (spell 0.5: a Boulder and an Arrow Rain can finish a tower that is nearly down)
export const TOWER_TAKES = { melee: 1, spike: 1, arrow: 1, blast: 0.5, quake: 0.5, spell: 0.5 };

/**
 * Share of a kind of damage that structure t takes. Stone (towers) takes
 * TOWER_TAKES, or the source's own override (X.vsTower, Q.vsTower,
 * attack.vsTower); a building is wood and takes its own table (t.takes, which
 * is BUILDING_TAKES from sim/buildings.js), overrides or not.
 */
export function takesOf(t, kind, override) {
  if (t.kind === 'building') return t.takes[kind] ?? 1;
  return override ?? TOWER_TAKES[kind] ?? 1;
}

export class Tower {
  /** hpMul: a practice tower (the Training Dummy's castle) has less health. */
  constructor(kind, team, x, level = 1, id = 0, hpMul = 1) {
    const S = kind === 'castle' ? CASTLE : GUARD;
    this.id = id;
    this.isTower = true; // units, towers and spells all show up as `target` / `from`
    this.team = team;
    this.kind = kind; // 'guard' | 'castle' | 'building'
    this.x = x;
    this.w = S.w;
    this.h = S.h;
    this.level = Math.max(1, level | 0 || 1);
    this.dmgMul = levelMul(this.level);
    this.hp = S.hp * this.dmgMul * (hpMul > 0 && hpMul <= 1 ? hpMul : 1);
    this.maxHp = this.hp;
    this.alive = true;
    this.active = kind === 'guard'; // castles sleep until woken
    this.f = team === 'blue' ? 1 : -1; // faces the enemy
    this.range = S.range;
    this.reload = S.reload;
    this.cool = S.reload * 0.5;
    this.target = null;
    this.aim = this.f > 0 ? 0.12 : Math.PI - 0.12; // radians: where the crossbow / cannon points
    this.shotT = 99; // seconds since the last shot (recoil)
    this.hitT = 99; // seconds since last damaged (flash / shake)
    this.downT = -1; // seconds since destroyed (collapse animation), -1 while standing
    this.arrows = []; // arrows stuck in it (also in battle.arrows, state 'tower')
    if (kind === 'building') {
      // Placed by a card (sim/buildings.js makeBuilding fills in bid, def, size,
      // health, damage table and its working parts). Never shoots, never sleeps.
      this.building = true;
      this.active = true;
      this.range = 0;
      this.reload = Infinity;
      this.age = 0; // seconds since placed (it decays over def.life)
      this.landT = 0; // seconds since placed, for the crate drop
    }
  }
}

/** Where a tower's crossbow / cannon sits (world px), for shots and for drawing. */
export function muzzle(t) {
  if (t.kind === 'castle') return { x: t.x + t.f * 34, y: -t.h - 10 };
  return { x: t.x, y: -t.h - 12 };
}

// --- geometry --------------------------------------------------------------------

/** Distance from a point to a tower's rectangle (0 inside). */
export function rectDist(t, x, y) {
  const dx = Math.max(0, Math.abs(x - t.x) - t.w / 2);
  const dy = y < -t.h ? -t.h - y : y > 0 ? y : 0;
  return Math.hypot(dx, dy);
}

/**
 * First point where segment (x0,y0)-(x1,y1) enters the box [bx0,bx1] x [by0,by1]
 * (Liang-Barsky), or null. A segment starting inside hits at its start.
 */
export function segRect(x0, y0, x1, y1, bx0, by0, bx1, by1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - bx0, bx1 - x0, y0 - by0, by1 - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return { x: x0 + dx * t0, y: y0 + dy * t0, t: t0 };
}

/**
 * Launch velocity for a shot at speed v from a point to one dx across and dy
 * down (y grows down): the flatter of the two ballistic solutions, or a 45
 * degree lob when the target is out of reach.
 */
export function aimShot(dx, dy, v) {
  const D = Math.max(1, Math.abs(dx));
  const a = (G * D * D) / (2 * v * v);
  const disc = D * D - 4 * a * (a - dy);
  const u = disc >= 0 ? (-D + Math.sqrt(disc)) / (2 * a) : -1; // tan of the angle, y-down
  const c = 1 / Math.sqrt(1 + u * u);
  return { vx: Math.sign(dx || 1) * v * c, vy: v * u * c, flight: D / (v * c) };
}

// --- damage ------------------------------------------------------------------------

/** Damage a tower. kind: the source ('club', 'arrow', 'blast', 'spell', ...). Returns the damage dealt. */
export function damageTower(b, t, dmg, x, y, kind = 'hit', from = null) {
  if (!t.alive || !(dmg > 0) || b.phase === 'over') return 0;
  t.hp -= dmg;
  t.hitT = 0;
  b.emit('towerHit', x, y, { tower: t, damage: dmg, kind, from, power: clamp(dmg / 60, 0.2, 1.5) });
  if (t.hp <= 0) destroyTower(b, t);
  else if (!t.active) wakeTower(b, t);
  return dmg;
}

export function wakeTower(b, t) {
  if (t.active || !t.alive) return;
  t.active = true;
  t.cool = Math.min(t.cool, 0.35); // up and shooting almost at once
  b.emit('castleAwake', t.x, -t.h, { tower: t });
}

/**
 * Bring a tower down. The other side gets its crowns (a castle = all 3), the
 * castle behind a fallen Guard Tower wakes up, and a fallen castle takes its
 * side's remaining tower with it. crumble = fall without giving crowns.
 */
export function destroyTower(b, t, crumble = false) {
  if (!t.alive) return;
  t.alive = false;
  t.hp = 0;
  t.active = false;
  t.downT = 0;
  t.target = null;
  const foe = enemyOf(t.team);
  if (!crumble) b.crowns[foe] = t.kind === 'castle' ? CASTLE.crowns : Math.min(CASTLE.crowns, b.crowns[foe] + GUARD.crowns);
  for (const a of t.arrows) a.fade = true;
  b.emit('towerDown', t.x, -t.h / 2, { tower: t, team: t.team, crowns: b.crowns[foe] });
  for (const o of b.towers) {
    if (o === t || o.team !== t.team || !o.alive) continue;
    if (t.kind === 'guard' && o.kind === 'castle') wakeTower(b, o);
    else if (t.kind === 'castle') destroyTower(b, o, true);
  }
}

// --- shooting ------------------------------------------------------------------------

function inRange(t, u) {
  return u && u.alive && !u.gone && !u.dropping && u.team !== t.team && Math.abs(u.hip.x - t.x) <= t.range;
}

/** Keep the current target while it's alive and in range (like a real tower), else the nearest. */
function pickTarget(b, t) {
  if (inRange(t, t.target)) return t.target;
  let best = null;
  let bd = Infinity;
  for (const u of b.units) {
    if (!inRange(t, u)) continue;
    const d = Math.abs(u.hip.x - t.x) + u.lane * 4;
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}

/** Aim point with lead: where the target's chest will be when the shot arrives. */
function lead(b, m, u, v) {
  const tvx = clamp(u.hip.vx(b.dt), -220, 220);
  let tx = u.chest.x;
  let sol = aimShot(tx - m.x, u.chest.y - m.y, v);
  for (let i = 0; i < 2; i++) {
    tx = u.chest.x + tvx * sol.flight;
    sol = aimShot(tx - m.x, u.chest.y - m.y, v);
  }
  return sol;
}

function fireBolt(b, t, u) {
  const m = muzzle(t);
  const sol = lead(b, m, u, GUARD.boltSpeed);
  const ang = Math.atan2(sol.vy, sol.vx) + b.rng.gauss() * GUARD.aimNoise;
  const sp = Math.hypot(sol.vx, sol.vy);
  t.aim = ang;
  b.arrows.push({
    x: m.x + Math.cos(ang) * 14,
    y: m.y + Math.sin(ang) * 14,
    vx: Math.cos(ang) * sp,
    vy: Math.sin(ang) * sp,
    ang,
    team: t.team,
    from: t,
    damage: GUARD.damage * t.dmgMul,
    stun: GUARD.stun,
    pierce: GUARD.shieldPierce,
    bolt: true,
    state: 'fly',
    ground: u.ground + 3,
    host: null,
    target: u,
    age: 0,
  });
  b.emit('towerShot', m.x, m.y, { tower: t, target: u });
}

function fireCannon(b, t, u) {
  const m = muzzle(t);
  const sol = lead(b, m, u, CASTLE.shotSpeed);
  t.aim = Math.atan2(sol.vy, sol.vx);
  b.shots.push({
    kind: 'cannon',
    team: t.team,
    x: m.x,
    y: m.y,
    vx: sol.vx,
    vy: sol.vy,
    r: CASTLE.ballR,
    ground: u.ground,
    damage: CASTLE.damage * t.dmgMul,
    from: t,
    age: 0,
  });
  b.emit('cannonFire', m.x, m.y, { tower: t, target: u });
}

/** Per step: tower timers, aiming and shooting, cannonballs in flight. */
export function updateTowers(b, dt) {
  const fighting = b.phase === 'battle';
  for (const t of b.towers) {
    t.shotT += dt;
    t.hitT += dt;
    if (!t.alive) {
      t.downT += dt;
      continue;
    }
    const idle = t.f > 0 ? 0.12 : Math.PI - 0.12;
    const u = fighting && t.active ? pickTarget(b, t) : null;
    t.target = u;
    if (t.cool > 0) t.cool -= dt;
    let want = idle;
    if (u) {
      const m = muzzle(t);
      want = Math.atan2(u.chest.y - m.y, u.chest.x - m.x);
      if (t.cool <= 0) {
        if (t.kind === 'castle') fireCannon(b, t, u);
        else fireBolt(b, t, u);
        t.cool = t.reload;
        t.shotT = 0;
        continue;
      }
    }
    // Swing the weapon smoothly toward the target (shortest way round)
    let d = want - t.aim;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    t.aim += d * Math.min(1, dt * 10);
  }
  if (b.shots.length) updateShots(b, dt);
}

/** Shots in flight, by kind: castle cannonballs ('cannon') and Bomb Juggler bombs ('jbomb'). */
function updateShots(b, dt) {
  for (let i = b.shots.length - 1; i >= 0; i--) {
    const s = b.shots[i];
    if (s.kind === 'jbomb') {
      const at = stepJBomb(b, s, dt);
      if (at) {
        b.shots.splice(i, 1);
        if (Number.isFinite(at.x) && Number.isFinite(at.y)) b.blastAt(at.x, at.y, s.X, s.team, s.dmgMul, null, { power: 0.5, small: true });
      }
      continue;
    }
    s.age += dt;
    s.vy += G * dt;
    const nx = s.x + s.vx * dt;
    const ny = s.y + s.vy * dt;
    let hx = null;
    let hy = 0;
    // A bean in the way takes it square on
    for (const e of b.units) {
      if (e.team === s.team || !e.alive || Math.abs(e.hip.x - nx) > 60) continue;
      if (closestOnBody(e, s.x, s.y, nx, ny) < (e.R + s.r) ** 2) {
        hx = hit.x;
        hy = hit.y;
        break;
      }
    }
    if (hx == null && ny >= s.ground - s.r) {
      const k = clamp((s.ground - s.r - s.y) / Math.max(1e-6, ny - s.y), 0, 1);
      hx = s.x + (nx - s.x) * k;
      hy = s.ground - s.r;
    }
    if (hx != null || s.age > 6 || !Number.isFinite(nx) || !Number.isFinite(ny)) {
      b.shots.splice(i, 1);
      if (hx != null) cannonBlast(b, s, hx, hy);
      continue;
    }
    s.x = nx;
    s.y = ny;
  }
}

/**
 * One step of a Bomb Juggler's bomb (shot kind 'jbomb', battle.fireBomb):
 * it falls, bursts on the first enemy body (fliers too) or enemy structure it
 * touches, else bounces once off the ground, rolls, and goes off its fuse s
 * after that first touch (a fumbled bomb's fuse is already burning), or at
 * maxAge. Returns where it bursts, or null while it's still going.
 */
function stepJBomb(b, s, dt) {
  const X = s.X;
  s.age += dt;
  s.vy += G * dt;
  const nx = s.x + s.vx * dt;
  const ny = s.y + s.vy * dt;
  for (const e of b.units) {
    if (e.team === s.team || !e.alive || Math.abs(e.hip.x - nx) > 60) continue;
    if (closestOnBody(e, s.x, s.y, nx, ny) < (e.R + s.r) ** 2) return { x: hit.x, y: hit.y };
  }
  for (const t of b.towers) {
    if (t.team === s.team || !t.alive || Math.abs(t.x - nx) > t.w / 2 + 40) continue;
    const h = segRect(s.x, s.y, nx, ny, t.x - t.w / 2 - s.r, -t.h - s.r, t.x + t.w / 2 + s.r, WORLD.laneDepth + 10);
    if (h) return { x: h.x, y: h.y };
  }
  s.x = nx;
  s.y = ny;
  const floor = s.ground - s.r;
  if (s.y >= floor) {
    s.y = floor;
    if (!s.bounced) {
      s.bounced = true;
      s.vy = -Math.abs(s.vy) * X.bounce;
      s.vx *= 0.75;
      if (s.fuseT < 0) s.fuseT = X.fuse;
    } else {
      s.vy = 0; // rolling
      s.vx *= Math.exp(-dt * 2.5);
    }
  }
  if (s.fuseT >= 0) {
    s.fuseT -= dt;
    if (s.fuseT <= 0) return { x: s.x, y: s.y };
  }
  if (s.age >= X.maxAge || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return { x: s.x, y: s.y };
  return null;
}

const hit = { x: 0, y: 0 };

/** Squared distance from segment (ax,ay)-(bx,by) to a bean's spine; closest spine point in `hit`. */
function closestOnBody(e, ax, ay, bx, by) {
  let best = Infinity;
  const segs = [e.hip, e.chest, e.chest, e.head];
  for (let k = 0; k < 4; k += 2) {
    const p = segs[k];
    const q = segs[k + 1];
    // Sample the shot's sweep: it moves < 10 px per step, so a few samples are plenty
    for (let j = 0; j <= 2; j++) {
      const x = ax + ((bx - ax) * j) / 2;
      const y = ay + ((by - ay) * j) / 2;
      const qx = q.x - p.x;
      const qy = q.y - p.y;
      const l = qx * qx + qy * qy || 1;
      const s = clamp(((x - p.x) * qx + (y - p.y) * qy) / l, 0, 1);
      const cx = p.x + qx * s;
      const cy = p.y + qy * s;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d < best) {
        best = d;
        hit.x = x;
        hit.y = y;
      }
    }
  }
  return best;
}

/** Cannonball lands: a small blast that hops every nearby enemy bean into the air. */
function cannonBlast(b, s, x, y) {
  const dt = b.dt;
  b.emit('cannonHit', x, y, { power: 0.8, team: s.team, tower: s.from });
  for (const e of b.units) {
    if (e.team === s.team || e.gone) continue;
    if (Math.abs(e.hip.x - x) > CASTLE.splash + 60) continue;
    let d = Infinity;
    for (const p of e.body) d = Math.min(d, Math.hypot(p.x - x, p.y - y));
    d = Math.max(0, d - e.R);
    if (d > CASTLE.splash) continue;
    const k = 1 - (0.5 * d) / CASTLE.splash; // full at the centre, half at the edge
    const dir = Math.sign(e.hip.x - x) || -s.from.f;
    const live = e.alive ? 1 : 0.6;
    e.takeHit(b, {
      damage: e.alive ? s.damage * k : 0,
      dvx: dir * CASTLE.knockAway * k * live,
      dvy: -CASTLE.knockUp * k * live,
      x,
      y,
      stun: CASTLE.stun * k,
      kind: 'cannon',
      from: s.from,
      spin: 0.35,
      flip: 60 * k,
    });
  }
  for (const it of b.items) {
    for (const p of [it.a, it.b]) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < CASTLE.splash + 20) p.addVel(0, -260, dt);
    }
  }
}
