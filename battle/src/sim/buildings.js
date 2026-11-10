// Buildings: cards you place in your own deploy zone that stand there and
// work for a while (punch, spawn Sprouts, swing a wrecking ball), then decay.
//
// A building is a Tower with kind 'building' (sim/towers.js). It lives in
// battle.towers, so walls, melee, pounces, arrows, blasts, quakes and spells
// all reach it with no extra code. It is wood, not stone: it takes
// BUILDING_TAKES of each kind of damage (see takesOf), it never shoots, and
// destroying it never gives crowns.
//
// Every number here is gameplay: the balance tests tune these constants.

import { WORLD } from '../config.js';
import { levelMul } from './cards.js';
import { Particle, Dist, segSeg } from './physics.js';
import { Tower, destroyTower } from './towers.js';

export { takesOf } from './towers.js';

const G = WORLD.gravity;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const tmp = { d2: 0, s: 0, t: 0, x1: 0, y1: 0, x2: 0, y2: 0 };

/** Share of each kind of damage a building takes (wood: splash and spells hurt more than stone). */
export const BUILDING_TAKES = { melee: 1, spike: 1, arrow: 1, blast: 0.75, quake: 0.75, spell: 0.75 };

export const MAX_BUILDINGS = 3; // standing buildings per side; a 4th crumbles the oldest
export const BUILD_SNAP = 80; // a building played on an illegal spot slides up to this far to a legal one...
export const BUILD_GAP = 12; // ...at least this far from every standing tower and building
export const LAND_T = 0.35; // seconds of the crate drop after placing; then it lands (buildingLand)
const LAND_POP = 220; // px/s: enemy beans under a landing building are popped up (the walls push them out)
const GLOVE_Y = -21; // the Boing Box glove's height (world y; render/buildings.js draws it there)
const GLOVE_R = 10; // its radius
const GLOVE_START = 6; // px past the face where it sits inside the slot (ext 0)...
const GLOVE_TRAVEL = 16; // ...and how far short of `reach` its centre stops (so its front reaches it)
const CRANE_FLIP = 160; // the cartwheel of a wrecking-ball hit...
const CRANE_SPIN = 0.5; // ...and its spin
const BALL_ITEM = { mass: 3, bounce: 0.2, friction: 0.03, life: 6 }; // the ball left by a toppled crane

// hp at level 1, footprint w x h (base on the ground), life (seconds until it
// has decayed to nothing), arm (seconds after placing before it starts working).
export const BUILDINGS = {
  boingBox: {
    name: 'Boing Box',
    hp: 380,
    w: 46,
    h: 46,
    life: 28,
    arm: 1.0,
    // A boxing glove on a spring: reach (px from the face), band (px around the glove's height)
    punch: { reach: 90, band: 34, windup: 0.2, out: 0.08, hold: 0.06, back: 0.5, recharge: 1.0, damage: 50, launch: [380, 300], stun: 0.6, flip: 150, maxHits: 2 },
  },
  beanPatch: {
    name: 'Bean Patch',
    hp: 360,
    w: 64,
    h: 40,
    life: 24,
    arm: 1.0,
    // A Sprout pops out every `every` s while fewer than `max` of its own are alive
    spawn: { unit: 'sprout', every: 3.0, max: 3, vx: [120, 200], vy: [300, 380], deployT: 0.6 },
  },
  wreckingCrane: {
    name: 'Wrecking Crane',
    hp: 850,
    w: 36,
    h: 170,
    life: 32,
    arm: 1.0,
    // A 1-DOF pendulum hanging from the jib: pumped while enemies are near, it golf-swings them away
    pendulum: { pivotUp: 170, pivotFwd: 34, L: 125, r: 20, sense: 190, pump: 9, maxAng: 1.2, damp: 0.4, minHit: 260, damage: 75, vRef: 430, dmgRange: [0.6, 1.25], up: 320, carry: 1.1, stun: 1.0, hitLoss: 0.85 },
  },
};

/** The BUILDINGS entry for an id, or null (own keys only). */
const defOf = (bid) => (typeof bid === 'string' && Object.prototype.hasOwnProperty.call(BUILDINGS, bid) ? BUILDINGS[bid] : null);

/**
 * A new building of card level `level` for `team` centred at x: a Tower of
 * kind 'building' with its definition and the state of its working parts
 * (t.punch / t.spawn / t.ball). Returns null for an unknown id.
 */
export function makeBuilding(bid, team, x, level, id) {
  const def = defOf(bid);
  if (!def) return null;
  const t = new Tower('building', team, x, level, id);
  t.bid = bid;
  t.def = def;
  t.w = def.w;
  t.h = def.h;
  t.hp = def.hp * levelMul(t.level);
  t.maxHp = t.hp;
  t.takes = BUILDING_TAKES;
  if (def.punch) t.punch = { phase: 'idle', t: 0, ext: 0, dir: t.f };
  if (def.spawn) t.spawn = { next: def.arm, kids: [] };
  if (def.pendulum) {
    const P = def.pendulum;
    const px = x + t.f * P.pivotFwd;
    const py = -P.pivotUp;
    const bx = px;
    const by = py + P.L; // hanging straight down, at chest height
    t.ball = { ang: 0, angV: 0, x: bx, y: by, vx: 0, vy: 0, px: bx, py: by, hits: new Set() };
  }
  return t;
}

/**
 * Per step for one standing building (from updateTowers): the crate drop
 * (landT counts up to LAND_T, then buildingLand), the decay (it loses
 * maxHp / life every second, silently, and is gone with cause 'decayed' at
 * 0), and once armed (def.arm s after placing) its working part: the Boing
 * Box glove, the Bean Patch spawner or the Wrecking Crane pendulum. Once the
 * match is over nothing new starts and nothing is hit (the glove goes home,
 * the ball swings down).
 */
export function updateBuilding(b, t, dt) {
  const def = t.def;
  t.age += dt;
  if (t.landT < LAND_T) {
    t.landT = Math.min(LAND_T, t.landT + dt);
    if (t.landT >= LAND_T - 1e-9) land(b, t, dt);
  }
  const live = b.phase === 'battle';
  if (live) {
    t.hp -= (t.maxHp / def.life) * dt;
    if (t.hp <= 0) {
      destroyTower(b, t, true, 'decayed');
      return;
    }
  }
  const armed = live && t.age >= def.arm;
  if (t.punch) punch(b, t, dt, armed);
  if (t.spawn && live) spawner(b, t, dt); // (its countdown runs from placing: the first pops at arming)
  if (t.ball) pendulum(b, t, dt, armed);
}

/**
 * The building hits the ground: enemy beans standing where it lands are
 * popped up. It has been a wall since it was placed, so the walls have
 * already put them out at its faces: every enemy on the ground whose body
 * touches the footprint (hip within w/2 + R) gets the pop.
 */
function land(b, t, dt) {
  t.landT = LAND_T;
  b.emit('buildingLand', t.x, 0, { tower: t, power: clamp(t.def.hp / 500, 0.5, 1.4) });
  for (const u of b.units) {
    if (u.team === t.team || !u.alive || u.gone || u.held || u.air || Math.abs(u.hip.x - t.x) >= t.w / 2 + u.R) continue;
    for (const p of u.parts) p.addVel(0, -LAND_POP, dt);
  }
}

/** A fallen building leaves what falls off it: the Wrecking Crane's ball drops and rolls (an item). */
export function wreckBuilding(b, t) {
  const B = t.ball;
  if (!B || !Number.isFinite(B.x) || !Number.isFinite(B.y)) return;
  const P = t.def.pendulum;
  const dt = b.dt;
  const mk = (dx) => {
    const p = new Particle(B.x + dx, B.y, BALL_ITEM.mass / 2, P.r);
    p.setVel(B.vx, B.vy, dt);
    p.ground = WORLD.groundY + WORLD.laneDepth * 0.5;
    p.bounce = BALL_ITEM.bounce;
    p.friction = BALL_ITEM.friction;
    return p;
  };
  const a = mk(-3);
  const c = mk(3);
  b.items.push({ kind: 'craneBall', team: t.team, f: t.f, R: P.r, r: P.r, a, b: c, con: new Dist(a, c, 6), age: 0, life: BALL_ITEM.life });
}

// --- Boing Box ---------------------------------------------------------------------

/** World x of the glove's centre at extension ext (0 in its slot, 1 at full reach). */
const gloveX = (t, P, dir, ext) => t.x + dir * (t.w / 2 + GLOVE_START + ext * Math.max(0, P.reach - GLOVE_TRAVEL));

/** An enemy bean on the ground in front of either face, within reach and the glove's band (the nearest). */
function boxTarget(b, t, P) {
  let best = null;
  let bd = Infinity;
  for (const u of b.units) {
    if (u.team === t.team || !u.alive || u.gone || u.held || u.air) continue;
    const d = Math.abs(u.hip.x - t.x) - t.w / 2;
    if (d > P.reach || Math.abs(u.hip.y - GLOVE_Y) > P.band) continue;
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}

/**
 * The glove: idle -> windup (the lid rattles) -> out (it sweeps from the face
 * to its reach, hitting up to maxHits beans once each) -> hold -> back (home on
 * its spring) -> recharge -> idle. t.punch.ext (0..1) is how far out it is.
 */
function punch(b, t, dt, armed) {
  const P = t.def.punch;
  const S = t.punch;
  S.t += dt;
  if (S.phase === 'idle') {
    S.t = 0;
    S.ext = 0;
    const e = armed ? boxTarget(b, t, P) : null;
    if (!e) return;
    S.dir = Math.sign(e.hip.x - t.x) || t.f;
    t.f = S.dir; // (it turns to face what it punches)
    S.phase = 'windup';
    b.emit('punchWindup', t.x, -t.h, { tower: t });
  } else if (S.phase === 'windup') {
    if (S.t < P.windup) return;
    S.t -= P.windup;
    S.phase = 'out';
    S.hits = [];
    S.ext = 0;
    b.emit('punch', t.x + S.dir * t.w / 2, GLOVE_Y, { tower: t, dir: S.dir });
  }
  if (S.phase === 'out') {
    const e0 = S.ext;
    S.ext = clamp(S.t / P.out, 0, 1);
    if (armed) glove(b, t, P, S, e0, S.ext);
    if (S.t < P.out) return;
    S.t -= P.out;
    S.phase = 'hold';
  }
  if (S.phase === 'hold') {
    S.ext = 1;
    if (S.t < P.hold) return;
    S.t -= P.hold;
    S.phase = 'back';
  }
  if (S.phase === 'back') {
    S.ext = clamp(1 - S.t / P.back, 0, 1);
    if (S.t < P.back) return;
    S.t -= P.back;
    S.ext = 0;
    S.phase = 'recharge';
  }
  if (S.phase === 'recharge' && S.t >= P.recharge) {
    S.t = 0;
    S.phase = 'idle';
  }
}

/** The glove's sweep this step (ext e0 -> e1) against enemy bodies: a capsule test, each bean once. */
function glove(b, t, P, S, e0, e1) {
  if (S.hits.length >= P.maxHits) return;
  const dir = S.dir;
  const x0 = gloveX(t, P, dir, e0);
  const x1 = gloveX(t, P, dir, e1);
  for (const e of b.units) {
    if (e.team === t.team || !e.alive || e.gone || e.held || e.air || S.hits.includes(e.id)) continue;
    if (Math.abs(e.hip.x - t.x) > t.w / 2 + P.reach + 60) continue;
    const rr = (GLOVE_R + e.R) ** 2;
    let hit = segSeg(x0, GLOVE_Y, x1, GLOVE_Y, e.hip.x, e.hip.y, e.chest.x, e.chest.y, tmp).d2 < rr;
    if (!hit) hit = segSeg(x0, GLOVE_Y, x1, GLOVE_Y, e.chest.x, e.chest.y, e.head.x, e.head.y, tmp).d2 < rr;
    if (!hit) continue;
    const hx = tmp.x2;
    const hy = tmp.y2;
    S.hits.push(e.id);
    e.takeHit(b, { damage: P.damage * t.dmgMul, dvx: dir * P.launch[0], dvy: -P.launch[1], x: hx, y: hy, stun: P.stun, kind: 'punch', from: t, shove: true, flip: P.flip, spin: 0.4 });
    b.stats.hits++;
    b.emit('hit', hx, hy, { kind: 'punch', power: 1.1, dirX: dir * 0.8, dirY: -0.6, unit: e, from: t, killed: !e.alive });
    if (S.hits.length >= P.maxHits) return;
  }
}

// --- Bean Patch --------------------------------------------------------------------

/**
 * t.spawn.next counts down to the next try: a Sprout pops out of the front of
 * the patch every `every` s while fewer than `max` of its own are alive (a
 * blocked try comes again 0.5 s later). The spawn itself runs at the end of
 * the step (battle.spawn), which files it in t.spawn.kids.
 */
function spawner(b, t, dt) {
  const P = t.def.spawn;
  const S = t.spawn;
  S.next -= dt;
  if (S.next > 0) return;
  // Only live kids count (a Sprout's corpse stays a while before removeUnit prunes it)
  if (S.kids.length) S.kids = S.kids.filter((id) => b.units.some((u) => u.id === id && u.alive));
  if (S.kids.length >= P.max) {
    S.next = 0.5;
    return;
  }
  const vx = b.rng.range(P.vx[0], P.vx[1]);
  const vy = b.rng.range(P.vy[0], P.vy[1]);
  b.spawn(P.unit, t.team, t.x + (t.f * t.w) / 3, { level: t.level, pop: [t.f * vx, -vy], deployT: P.deployT, from: t });
  S.next = P.every;
}

// --- Wrecking Crane ------------------------------------------------------------------

/** How far (rad) a pendulum at (ang, angV) will swing out: from its energy. */
function swingOf(ang, angV, w2) {
  const c = Math.cos(ang) - (angV * angV) / (2 * w2);
  return c <= -1 ? Math.PI : Math.acos(Math.min(1, c));
}

/**
 * The wrecking ball: a deterministic 1-DOF pendulum under the jib, pumped in
 * the direction it swings while an enemy is within `sense` of the pivot,
 * until its swing reaches maxAng. Moving at minHit or faster it hits every
 * enemy bean it sweeps through (ground or air) once per pass, on the stroke
 * that carries the bean away from the mast, and loses energy into each one
 * (hitLoss). It never touches its own side.
 */
function pendulum(b, t, dt, armed) {
  const P = t.def.pendulum;
  const B = t.ball;
  const w2 = G / P.L;
  const pivX = t.x + t.f * P.pivotFwd;
  const pivY = -P.pivotUp;
  let near = false;
  if (armed) {
    for (const u of b.units) {
      if (u.team !== t.team && u.alive && !u.gone && !u.held && Math.abs(u.hip.x - pivX) <= P.sense) {
        near = true;
        break;
      }
    }
  }
  const push = near && swingOf(B.ang, B.angV, w2) < P.maxAng ? P.pump * (Math.sign(B.angV) || t.f) : 0;
  const v0 = B.angV;
  const a0 = B.ang;
  B.angV += (-w2 * Math.sin(B.ang) + push) * dt;
  B.angV *= Math.exp(-P.damp * dt);
  B.ang += B.angV * dt;
  if (B.ang > Math.PI) B.ang -= 2 * Math.PI;
  else if (B.ang < -Math.PI) B.ang += 2 * Math.PI;
  if (v0 !== 0 && Math.sign(B.angV) !== Math.sign(v0)) B.hits.clear(); // a new pass
  B.px = B.x;
  B.py = B.y;
  B.x = pivX + P.L * Math.sin(B.ang);
  B.y = pivY + P.L * Math.cos(B.ang);
  B.vx = P.L * B.angV * Math.cos(B.ang);
  B.vy = -P.L * B.angV * Math.sin(B.ang);
  if (!armed) return;
  let v = Math.abs(B.angV) * P.L;
  if (v < P.minHit) return;
  if (a0 !== 0 && Math.sign(a0) !== Math.sign(B.ang) && Math.abs(B.ang) < 1) b.emit('craneSwing', B.x, B.y, { tower: t, power: v / P.vRef });
  for (const e of b.units) {
    if (e.team === t.team || !e.alive || e.gone || B.hits.has(e.id)) continue;
    if (Math.abs(e.hip.x - B.x) > P.L + 60) continue;
    if (B.vx * (e.hip.x - t.x) <= 0) continue; // only the stroke that carries it away from the mast (never into it)
    const rr = (P.r + e.R) ** 2;
    let hit = segSeg(B.px, B.py, B.x, B.y, e.hip.x, e.hip.y, e.chest.x, e.chest.y, tmp).d2 < rr;
    if (!hit) hit = segSeg(B.px, B.py, B.x, B.y, e.chest.x, e.chest.y, e.head.x, e.head.y, tmp).d2 < rr;
    if (!hit) continue;
    const hx = tmp.x2;
    const hy = tmp.y2;
    B.hits.add(e.id);
    const k = clamp(v / P.vRef, P.dmgRange[0], P.dmgRange[1]);
    const dir = Math.sign(B.vx) || t.f;
    e.takeHit(b, {
      damage: P.damage * t.dmgMul * k,
      dvx: B.vx * P.carry,
      dvy: B.vy * P.carry - P.up,
      x: hx,
      y: hy,
      stun: P.stun,
      kind: 'crane',
      from: t,
      shove: true,
      flip: CRANE_FLIP * dir * t.f, // (takeHit turns it by from.f: this way it follows the ball)
      spin: CRANE_SPIN,
    });
    b.stats.hits++;
    b.emit('hit', hx, hy, { kind: 'crane', power: clamp(k, 0.6, 1.5), dirX: dir * 0.8, dirY: -0.6, unit: e, from: t, killed: !e.alive });
    B.angV *= P.hitLoss; // the ball loses energy into the bean
    B.vx *= P.hitLoss;
    B.vy *= P.hitLoss;
    v *= P.hitLoss;
    if (v < P.minHit) return;
  }
}

/**
 * Where building `bid` fits if `team` plays it at x: the nearest centre within
 * BUILD_SNAP px (searched outward in 4 px steps) whose footprint is inside the
 * team's own deploy zone (never the pocket) and at least BUILD_GAP px clear of
 * every standing tower and building of either side. null if there is none.
 */
export function fitBuilding(b, team, bid, x) {
  const def = defOf(bid);
  if (!def || (team !== 'blue' && team !== 'red') || !Number.isFinite(x)) return null;
  const zone = WORLD.deploy[team];
  const half = def.w / 2;
  const fits = (cx) => {
    if (cx - half < zone[0] || cx + half > zone[1]) return false;
    for (const t of b.towers) if (t.alive && Math.abs(cx - t.x) - half - t.w / 2 < BUILD_GAP) return false;
    return true;
  };
  for (let d = 0; d <= BUILD_SNAP; d += 4) {
    if (fits(x + d)) return x + d;
    if (d && fits(x - d)) return x - d;
  }
  return null;
}
