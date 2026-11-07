// World features at run time (placement: world/features-gen.js):
//   - the holdout gate: stand at the control box, then hold out against the
//     waves (they come from your side of the wall) while the gate slides open
//   - the breach: called out when you first see it; breaking it opens the
//     short way (the nav grid and the safe-room arrow follow) and wakes the nest
//   - explosive landmarks (gas pumps, cylinders): a blast, then a fire that
//     burns for a while (zombies walking into it burn too)
//   - landmark call-outs and the ammo cans

import { clamp, pointInRect, rand } from '../util.js';
import { Zombie, alertZombie, damageZombie } from './zombies.js';
import { damageBoards } from './loot.js';

export const HOLDOUT = {
  hold: 1.2, // s standing at the control box to start it
  reach: 40,
  delay: 2, // s of siren before the gate moves
  prompt: 480, // u: "the gate is locked" call-out
};
const BURN_DPS = { zombie: 90, player: 12 };
const AMMO_ROUNDS = 40;

export function initWorldEvents(game, map) {
  const h = map.holdout;
  game.events = {
    holdout: h ? { ...h, state: 'idle', t: 0, hold: 0, prompted: false, waves: 0, nextWave: 1, f: 0 } : null,
    breach: map.breach ? { ...map.breach, seen: false, open: false } : null,
    explosives: (map.explosives || []).map((e) => ({ ...e, done: false })),
    burns: [],
    seen: new Set(),
    smokeT: 0,
  };
  for (const e of game.events.explosives) for (const part of e.parts) part.group = e;
}

/** The sleepers nesting beyond the breach (idle until the noise). */
export function spawnNest(game) {
  for (const n of game.world.map.nests || []) if (game.world.isFree(n.x, n.y, 11)) game.zombies.push(new Zombie(n.x, n.y, false));
}

/** While the holdout gate is shut, nothing spawns on the far side of the wall (it would only queue at the bars). */
export function spawnBlocked(game, x, y) {
  const H = game.events && game.events.holdout;
  if (!H || H.state === 'open') return false;
  return (Math.sign(x - H.x) || 1) !== (Math.sign(game.player.x - H.x) || 1);
}

export function updateWorldEvents(game, dt) {
  const E = game.events;
  if (!E) return;
  const p = game.player;
  if (E.holdout) updateHoldout(game, E.holdout, dt);

  const B = E.breach;
  if (B && !B.seen && !B.open && p.alive) {
    if (Math.hypot(B.front.x - p.x, B.front.y - p.y) < 520 && game.world.segmentClear(p.x, p.y, B.front.x, B.front.y)) {
      B.seen = true;
      game.announce('A BREACH: THE SHORT WAY', '#ffb37a', 2.4);
      game.announce('BREAK IT DOWN (LOUD), OR GO ROUND BY THE CHECKPOINT', 'rgba(255,232,205,0.9)', 3.2, 'small');
    }
  }

  // Landmark call-outs, once each.
  for (const l of game.world.map.landmarks || []) {
    if (E.seen.has(l) || !p.alive) continue;
    if (Math.hypot(l.x - p.x, l.y - p.y) < 400) {
      E.seen.add(l);
      game.announce(l.label, '#cfd8dc', 1.8, 'small');
    }
  }

  // Fires left by explosions.
  for (const b of E.burns) {
    b.t -= dt;
    const k = clamp(b.t / 3, 0, 1); // dies down over its last 3 s
    const r = b.r * (0.55 + 0.45 * k);
    game.zhash.query(b.x, b.y, r, (z) => {
      if (!z.alive || Math.hypot(z.x - b.x, z.y - b.y) > r) return;
      damageZombie(game, z, BURN_DPS.zombie * dt, 0, 0, 0, 0, false);
    });
    // Survivors in the fire take a tick of damage four times a second.
    b.hurtT = (b.hurtT || 0) - dt;
    if (b.hurtT <= 0) {
      b.hurtT = 0.25;
      if (p.alive && Math.hypot(p.x - b.x, p.y - b.y) < r) game.hurtPlayer(BURN_DPS.player * 0.25, null, { slow: 0 });
      const a = game.ally;
      if (a && a.alive && !a.down && Math.hypot(a.x - b.x, a.y - b.y) < r) game.hurtAlly(BURN_DPS.player * 0.25, null, { knock: 0 });
    }
  }
  E.burns = E.burns.filter((b) => b.t > 0);
  E.smokeT -= dt;
  if (E.smokeT <= 0 && E.burns.length) {
    E.smokeT = 0.08;
    const vr = game.viewRect(200);
    for (const b of E.burns) {
      if (!pointInRect(b.x, b.y, vr, b.r)) continue;
      const a = rand(0, Math.PI * 2);
      const d = rand(0, b.r * 0.8);
      game.effects.smoke(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d - 6, rand(10, 18));
      game.effects.ember(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d);
    }
  }
}

// --- Holdout ---------------------------------------------------------------------------------

function updateHoldout(game, H, dt) {
  const p = game.player;
  if (H.state === 'idle') {
    if (!H.prompted && p.alive && Math.hypot(H.x - p.x, H.y - p.y) < HOLDOUT.prompt) {
      H.prompted = true;
      game.announce('THE GATE IS LOCKED', '#ffd27a', 2.4);
      game.announce('START IT AT THE CONTROL BOX, THEN HOLD OUT', 'rgba(255,236,200,0.9)', 3.2, 'small');
    }
    const near = p.alive && !p.pinnedBy && !game.won && Math.hypot(H.use.x - p.x, H.use.y - p.y) < HOLDOUT.reach;
    if (near) {
      H.hold += dt / HOLDOUT.hold;
      if (H.hold >= 1) startHoldout(game, H);
    } else H.hold = Math.max(0, H.hold - dt * 2);
    return;
  }
  if (H.state !== 'running') return;
  H.t += dt;
  const dur = Math.max(5, game.settings.holdoutTime);
  H.f = clamp((H.t - HOLDOUT.delay) / dur, 0, 1);
  // The gate slides down into the wall: the opening grows from the top.
  const g = H.gate;
  g.y = g.y0 + g.h0 * H.f;
  g.h = g.h0 * (1 - H.f);
  if (H.t >= H.nextWave && H.f < 0.9) {
    H.nextWave = H.t + clamp(dur / 4, 6, 10);
    holdoutWave(game, H);
  }
  if (H.f >= 1) openGate(game, H);
}

function startHoldout(game, H) {
  const dur = Math.max(5, game.settings.holdoutTime);
  H.state = 'running';
  H.t = 0;
  H.nextWave = 1;
  game.audio.switchOn();
  game.audio.alarm(H.x, H.y, dur + HOLDOUT.delay + 0.5, 'siren');
  game.noise(H.x, H.y, 1100);
  const D = game.director;
  if (D.phase === 'calm' || D.phase === 'relax') D.phase = 'build';
  D.mobT = Math.max(D.mobT, dur + 25); // the holdout is the event: no extra mobs on top
  D.trickleT = Math.max(D.trickleT, dur + 8);
  game.stats.holdoutAt = game.stats.time;
  game.announce('HOLD OUT!', '#ff6b5a', 2.4);
  game.announce('THE GATE IS OPENING', 'rgba(255,220,190,0.9)', 2.4, 'small');
  game.haptic(40);
}

function holdoutWave(game, H) {
  const S = game.settings;
  if (game.director.tankEngaged) return; // the Tank is the event: no waves on top of it
  const n = Math.round(rand(14, 20) * S.hordeSize);
  const spot = game.director.queueHorde(n, 2.4, 420, 1200, [280, 1800, 300]);
  if (spot) {
    game.audio.horde(spot.x, spot.y);
    game.stats.hordes++;
  }
  H.waves++;
}

function openGate(game, H) {
  H.state = 'open';
  H.f = 1;
  game.world.removeObstacle(H.gate);
  game.audio.alarmStop();
  game.audio.gateOpen(H.x, H.y);
  game.announce('GATE OPEN: GO!', '#7dffa1', 2.4);
  game.stats.holdouts++;
  game.stats.holdoutTime = game.stats.time - game.stats.holdoutAt;
  const D = game.director;
  D.mobT = Math.max(D.mobT, rand(18, 28));
}

// --- Breach ----------------------------------------------------------------------------------

/** The breach boards just broke: the short way is open. */
export function openBreach(game, o) {
  const W = game.world;
  W.refreshNav(o);
  const er = W.map.endRoom.interior;
  game.goalField.compute(er.x + er.w / 2, er.y + er.h / 2);
  W.flow.compute(game.player.x, game.player.y);
  const B = game.events && game.events.breach;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  game.noise(cx, cy, 1000);
  if (B) {
    B.open = true;
    for (const z of game.zombies) {
      if (z.alive && z.state === 'idle' && Math.hypot(z.x - B.far.x, z.y - B.far.y) < 480) alertZombie(game, z, rand(0.1, 0.7), false);
    }
  }
  game.stats.shortcut = 1;
  game.announce('THE BREACH IS OPEN', '#ffb37a', 2.2);
}

// --- Explosives ------------------------------------------------------------------------------

/** A bullet (or a blast) hit an explosive part. */
export function damageExplosive(game, part, dmg) {
  const e = part.group;
  if (!e || e.done) return;
  part.hp -= dmg;
  part.hitT = 0.15;
  game.effects.sparks(part.x + part.w / 2, part.y + part.h / 2, 0, -1, 3);
  if (part.hp <= 0) detonate(game, e);
}

export function detonate(game, e) {
  if (e.done) return;
  e.done = true;
  for (const part of e.parts) game.world.removeObstacle(part);
  explode(game, e.x, e.y, e.R);
  game.events.burns.push({ x: e.x, y: e.y, r: e.burnR, t: e.burnT, max: e.burnT });
  game.stats.explosions++;
}

/** Blast at (x, y): kills commons close in, hurts specials, throws you, breaks boards, sets off others. */
export function explode(game, x, y, R) {
  game.zhash.query(x, y, R, (z) => {
    if (!z.alive) return;
    const dx = z.x - x;
    const dy = z.y - y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > R) return;
    const k = 1 - d / R;
    damageZombie(game, z, 60 + 520 * k, dx / d, dy / d, 220 + 520 * k, 0.3 + k, true);
  });
  const p = game.player;
  const pd = Math.hypot(p.x - x, p.y - y);
  if (p.alive && pd < R * 0.85) {
    const k = 1 - pd / (R * 0.85);
    game.hurtPlayer(Math.round(10 + 50 * k), { x, y }, { knock: 260 + 420 * k, knockT: 0.25 + 0.3 * k, slow: 0.4 });
  }
  const a = game.ally;
  if (a && a.alive) {
    const ad = Math.hypot(a.x - x, a.y - y);
    if (ad < R * 0.85) game.hurtAlly(Math.round(10 + 50 * (1 - ad / (R * 0.85))), { x, y }, { knock: 300 });
  }
  for (const o of game.boards || []) {
    if (o.broken) continue;
    const cx = clamp(x, o.x, o.x + o.w);
    const cy = clamp(y, o.y, o.y + o.h);
    const d = Math.hypot(cx - x, cy - y);
    if (d < R) damageBoards(game, o, 320 * (1 - d / R), (cx - x) / (d || 1), (cy - y) / (d || 1), cx, cy);
  }
  game.effects.explosion(x, y, R);
  game.audio.explosion(x, y);
  game.addTrauma(clamp(1 - pd / 1400, 0.15, 1) * 0.95);
  game.haptic(pd < 600 ? 120 : 40);
  game.noise(x, y, 1300);
  game.director.addIntensity(0.4);
  // Chain reaction.
  for (const e of game.events.explosives) {
    if (e.done) continue;
    if (Math.hypot(e.x - x, e.y - y) < R * 0.9) detonate(game, e);
  }
}

// --- Reading: graffiti, posters, notes -------------------------------------------------------

const READ_R = 95;

/** The nearest thing to read (in sight, within reach) fades in as a caption. */
export function updateCaption(game, dt) {
  const map = game.world.map;
  const p = game.player;
  const cap = game.caption || (game.caption = { item: null, a: 0 });
  let best = null;
  let bd = READ_R * READ_R;
  if (map.readables && p.alive && !game.won && !game.lost) {
    for (const r of map.readables) {
      const dx = r.rx - p.x;
      const dy = r.ry - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= bd || !game.world.segmentClear(p.x, p.y, r.rx, r.ry)) continue;
      bd = d2;
      best = r;
    }
  }
  if (best && best !== cap.item) {
    // Let the old one fade before switching.
    if (cap.a > 0.05) cap.a = Math.max(0, cap.a - dt * 7);
    else {
      cap.item = best;
      cap.a = 0;
    }
  } else if (best) cap.a = Math.min(1, cap.a + dt * 5);
  else cap.a = Math.max(0, cap.a - dt * 3);
}

// --- Ammo cans -------------------------------------------------------------------------------

export function takeAmmo(game, k) {
  k.taken = true;
  game.player.hot += AMMO_ROUNDS;
  game.audio.pickup();
  game.haptic(15);
  game.announce(`+${AMMO_ROUNDS} HOT ROUNDS`, '#ffa451', 1.2, 'small');
}
