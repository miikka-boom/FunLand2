// One stick (settings.controls 'one'): the gun picks its own target and
// fires, so one thumb only has to move you.
//
//  - What it shoots: whatever is coming for you. Commons that have noticed
//    you, Hunters, the Tank and its rocks, a Night Terror while it's lit, a
//    Witch once she's up. A wanderer that hasn't noticed you is left alone
//    unless it's within autoIdle (gunfire would only bring the rest), and so
//    is a Witch left crying.
//  - Only what you can see: a clear line, on screen or just off its edge,
//    within autoReach of the gun's range.
//  - In what order: threats first (a rock in the air, a Hunter crouching or
//    leaping or riding the teammate, a Witch coming, a Night Terror's lunge,
//    anything on you), then the nearest. It keeps its target unless another
//    is clearly better, so it doesn't flicker in a crowd.
//  - It swings at autoTurn deg/s and fires once it's lined up; with
//    autoFire 'still' only while you stand still.
//  - Trigger discipline (autoSafety): a shot whose line would carry on into
//    an alarm car or fire alarm, a gas pump or cylinder, or boards is held,
//    unless the target is right on you.
//  - With nothing to shoot it tops the magazine up (autoReload), and keeps
//    your flashlight off a Witch left alone (avertWitch).

import { DEG, clamp, wrapAngle } from '../util.js';

export const AUTO = {
  pickEvery: 0.08, // s between target picks (a new threat is seen within this)
  onScreenPad: 40, // u: how far off the screen's edge a target may be
  dangerClose: 90, // u: a target this close is shot even if the line carries on into an alarm
  onYou: 110, // u: a common this close counts as on you
  keep: 0.22, // score bonus for the current target
  holdFacing: 0.45, // s you keep facing where the gun last pointed
  reloadIdle: 1.2, // s with nothing in reach before it tops up...
  reloadBelow: 0.6, // ...a magazine below this fraction
  witchRange: 340, // u: within this a Witch left alone is kept out of your beam...
  witchMargin: 0.66, // ...by this much (rad) either side of her; the beam's half-width is 0.56
};

const TOPK = 8;
const candZ = new Array(TOPK).fill(null);
const candS = new Float64Array(TOPK);

/** How far the gun reaches for a target. */
export function autoReach(p, S) {
  return p.weapon.def.range * S.autoReach;
}

/** How urgent a body is (lower = sooner), or null if it isn't a target at all. */
export function targetScore(z, d, reach, S) {
  let s = d / reach;
  switch (z.type) {
    case 'rock':
      return s - 0.9;
    case 'witch':
      return s - (z.mode === 'charge' ? 1.1 : 0.8); // up and coming: nothing matters more
    case 'hunter':
      if (z.mode === 'pin') return s - 1.2; // riding the teammate
      if (z.mode === 'crouch' || z.mode === 'leap') return s - 0.7;
      return s - 0.25;
    case 'tank':
      return s - 0.1;
    case 'terror':
      return s - (z.mode === 'windup' || z.mode === 'lunge' ? 0.8 : 0.3);
    default:
      if (z.state !== 'chase') {
        if (d > S.autoIdle) return null; // let distant wanderers be
        s += 0.3;
      }
      if (d < AUTO.onYou) s -= 0.4 * (1 - d / AUTO.onYou);
      return s;
  }
}

/** Would a shot from p toward z carry on into something it shouldn't (an alarm, a pump, boards)? */
export function lineIsTouchy(game, p, z) {
  const W = game.world;
  const dx = z.x - p.x;
  const dy = z.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  const hit = W.raycast(p.x, p.y, dx / d, dy / d, p.weapon.def.range, W.shotBlockers);
  return touchy(hit.obstacle);
}

/** An obstacle a stray bullet would set off. */
export function touchy(o) {
  if (!o) return false;
  if (o.alarm && !o.alarmOn && !o.alarmDone) return true;
  if (o.explosive && !(o.group && o.group.done)) return true;
  if (o.boards && !o.broken) return true;
  return false;
}

/** The best target in reach and in sight right now, or null. */
export function pickTarget(game, p, S, current = null) {
  const W = game.world;
  const reach = autoReach(p, S);
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
  const consider = (z) => {
    if (!z.alive || z.ghost || z.passive) return; // an unlit Night Terror isn't there; a Witch left alone stays left alone
    const dx = z.x - p.x;
    const dy = z.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > reach + z.r || d < 1) return;
    if (!game.onScreen(z.x, z.y, AUTO.onScreenPad)) return;
    let s = targetScore(z, d, reach, S);
    if (s === null) return;
    if (z === current) s -= AUTO.keep;
    offer(z, s);
  };
  for (const z of game.zombies) consider(z);
  for (const r of game.rocks) consider(r);
  let best = null;
  for (let i = 0; i < n; i++) {
    const z = candZ[i];
    candZ[i] = null;
    if (best) continue;
    if (!W.segmentClear(p.x, p.y, z.x, z.y, W.shotBlockers)) continue;
    if (S.autoSafety && Math.hypot(z.x - p.x, z.y - p.y) - z.r > AUTO.dangerClose && lineIsTouchy(game, p, z)) continue;
    best = z;
  }
  return best;
}

/**
 * Per frame, instead of reading an aim stick: picks (or keeps) a target and
 * swings the gun toward it. Sets p.autoTarget, p.aimAngle and p.fireAngle;
 * returns whether to pull the trigger this frame.
 */
export function updateAutoAim(game, p, dt, input) {
  const S = game.settings;
  let t = p.autoTarget;
  if (t && (!t.alive || t.ghost || t.passive)) t = null;
  p.autoPickT = (p.autoPickT || 0) - dt;
  if (!t || p.autoPickT <= 0) {
    p.autoPickT = AUTO.pickEvery;
    t = pickTarget(game, p, S, t);
  }
  p.autoTarget = t;
  if (!t) {
    p.autoIdleT = (p.autoIdleT || 0) + dt;
    return false;
  }
  p.autoIdleT = 0;
  const dx = t.x - p.x;
  const dy = t.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  const want = Math.atan2(dy, dx);
  const turn = S.autoTurn * DEG * dt;
  p.aimAngle += clamp(wrapAngle(want - p.aimAngle), -turn, turn);
  p.fireAngle = p.aimAngle;
  // Lined up: inside the target's own width, plus a little.
  const tol = Math.asin(Math.min(1, (t.r + 3) / d)) + 2 * DEG;
  if (Math.abs(wrapAngle(want - p.aimAngle)) > tol) return false;
  if (S.autoFire === 'still' && Math.hypot(input.move.x, input.move.y) > 0.05) return false;
  return true;
}

/** Turn the beam off a Witch left alone (only while the gun isn't pointing anywhere). */
export function avertFromWitch(game, p) {
  if (!game.settings.night) return;
  for (const w of game.witches) {
    if (!w.alive || !w.passive) continue;
    const dx = w.x - p.x;
    const dy = w.y - p.y;
    if (dx * dx + dy * dy > AUTO.witchRange * AUTO.witchRange) continue;
    const toHer = Math.atan2(dy, dx);
    const off = wrapAngle(p.facing - toHer);
    if (Math.abs(off) >= AUTO.witchMargin) continue;
    // Out of the beam, on the side you were already turning to.
    p.facing = toHer + (off >= 0 ? 1 : -1) * AUTO.witchMargin;
    p.aimAngle = p.facing;
    p.fireAngle = p.facing;
  }
}
