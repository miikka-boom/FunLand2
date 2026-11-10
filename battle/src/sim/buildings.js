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
import { Tower } from './towers.js';

export { takesOf } from './towers.js';

/** Share of each kind of damage a building takes (wood: splash and spells hurt more than stone). */
export const BUILDING_TAKES = { melee: 1, spike: 1, arrow: 1, blast: 0.75, quake: 0.75, spell: 0.75 };

export const MAX_BUILDINGS = 3; // standing buildings per side; a 4th crumbles the oldest
export const BUILD_SNAP = 80; // a building played on an illegal spot slides up to this far to a legal one...
export const BUILD_GAP = 12; // ...at least this far from every standing tower and building

// hp at level 1, footprint w x h (base on the ground), life (seconds until it
// has decayed to nothing), arm (seconds after placing before it starts working).
export const BUILDINGS = {
  boingBox: {
    name: 'Boing Box',
    hp: 320,
    w: 46,
    h: 46,
    life: 25,
    arm: 1.0,
    // A boxing glove on a spring: reach (px from the face), band (px around the glove's height)
    punch: { reach: 90, band: 34, windup: 0.2, out: 0.08, hold: 0.06, back: 0.5, recharge: 1.0, damage: 40, launch: [380, 300], stun: 0.6, flip: 150, maxHits: 2 },
  },
  beanPatch: {
    name: 'Bean Patch',
    hp: 360,
    w: 64,
    h: 40,
    life: 24,
    arm: 1.0,
    // A Sprout pops out every `every` s while fewer than `max` of its own are alive
    spawn: { unit: 'sprout', every: 3.4, max: 3, vx: [120, 200], vy: [300, 380], deployT: 0.6 },
  },
  wreckingCrane: {
    name: 'Wrecking Crane',
    hp: 700,
    w: 36,
    h: 170,
    life: 28,
    arm: 1.0,
    // A 1-DOF pendulum hanging from the jib: pumped while enemies are near, it golf-swings them away
    pendulum: { pivotUp: 170, pivotFwd: 34, L: 125, r: 20, sense: 190, pump: 9, maxAng: 1.2, damp: 0.4, minHit: 260, damage: 60, vRef: 430, dmgRange: [0.6, 1.25], up: 320, carry: 1.1, stun: 1.0, hitLoss: 0.75 },
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

/** Per step for one standing building: drop, decay, arming and its working parts. */
export function updateBuilding(b, t, dt) {
  // (Not yet: the drop, decay, punch, spawner and pendulum come with the buildings themselves.)
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
