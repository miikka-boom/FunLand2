// The Pier 9 finale (docks level; placement: world/docks-gen.js).
//
//   idle    walk to the end of Pier 9; stand at the flare post to fire it
//   called  the flare burns red overhead, the ferry answers with its horn and
//           everything on the docks heard it: waves come down the pier while
//           the clock runs (the "Ferry arrives after" setting). The ship sails
//           into view for the last stretch.
//   docked  the gangway comes down: get to it (that's the win)

import { clamp, rand } from '../util.js';

export const FERRY = {
  hold: 1.0, // s standing at the flare post to fire it
  reach: 44,
  prompt: 700, // u: the first "fire the flare" call-out
  arrive: 24, // s before docking that the ferry sails into view
  gangway: 1.2, // s for the gangway to come down
  answer: 1.8, // s after the flare until the ferry's horn answers
  flareLife: 30, // s the flare burns
};

export function initFinale(game, map) {
  const f = map.finale;
  if (!f) return null;
  const startX = map.w + 260; // out at sea, past the edge of the map
  return {
    ...f,
    state: 'idle',
    t: 0,
    dur: 60,
    hold: 0,
    prompted: false,
    waves: 0,
    nextWave: 0,
    f: 0,
    startX,
    shipX: startX,
    shipV: 0,
    gang: 0,
    flareT: -1, // time since the flare went up (-1: not yet)
    said: new Set(),
  };
}

/** The ferry's progress toward the berth (0 out at sea .. 1 alongside). */
function shipK(F) {
  if (F.state === 'docked') return 1;
  if (F.state !== 'called') return 0;
  const k = (F.t - (F.dur - FERRY.arrive)) / FERRY.arrive;
  return clamp(k, 0, 1);
}

const easeOut = (k) => 1 - (1 - k) ** 3;

export function updateFinale(game, F, dt) {
  const p = game.player;
  const D = game.director;
  if (F.flareT >= 0) F.flareT += dt;

  if (F.state === 'idle') {
    // The objective, once you're nearly there (the pier itself is painted PIER 9).
    if (!F.prompted && p.alive && Math.hypot(F.flare.x - p.x, F.flare.y - p.y) < FERRY.prompt) {
      F.prompted = true;
      game.announce('THE LAST FERRY STOPS HERE', '#ffd27a', 2.4);
      game.announce('FIRE THE FLARE AT THE END OF THE PIER, THEN HOLD OUT', 'rgba(255,236,200,0.9)', 3.4, 'small');
    }
    const near = p.alive && !p.pinnedBy && !game.won && Math.hypot(F.use.x - p.x, F.use.y - p.y) < FERRY.reach;
    if (near) {
      F.hold += dt / FERRY.hold;
      if (F.hold >= 1) fireFlare(game, F);
    } else F.hold = Math.max(0, F.hold - dt * 2);
    return;
  }

  if (F.state === 'called') {
    F.t += dt;
    F.f = clamp(F.t / F.dur, 0, 1);
    if (F.t >= FERRY.answer && !F.said.has('answer')) {
      F.said.add('answer');
      game.audio.ferryHorn(true);
      game.announce(`HALVARD STAR: WE SEE YOUR FLARE. ${Math.round(F.dur)} SECONDS, PIER 9.`, '#9fd8ff', 3.4, 'small');
    }
    if (F.t >= F.dur / 2 && F.dur >= 40 && !F.said.has('half')) {
      F.said.add('half');
      game.announce('HALVARD STAR: HALFWAY THERE. KEEP THAT PIER CLEAR.', '#9fd8ff', 3, 'small');
    }
    if (F.t >= F.dur - FERRY.arrive && !F.said.has('arrive')) {
      F.said.add('arrive');
      game.audio.ferryHorn(false);
      game.announce('HALVARD STAR: COMING ALONGSIDE, NORTH SIDE OF THE PIER.', '#9fd8ff', 3.2, 'small');
    }
    // Waves from land, down the pier.
    if (F.t >= F.nextWave && F.t < F.dur - 4) {
      F.nextWave = F.t + clamp(F.dur / 5, 8, 14);
      wave(game, F, rand(12, 18));
    }
    // Keep the director's own mobs out of it.
    D.mobT = Math.max(D.mobT, 20);
    D.trickleT = Math.max(D.trickleT, 6);
    if (F.t >= F.dur) dock(game, F);
  } else if (F.state === 'docked') {
    F.gang = Math.min(1, F.gang + dt / FERRY.gangway);
    D.mobT = Math.max(D.mobT, 20);
    D.trickleT = Math.max(D.trickleT, 6);
  }

  // The ship: out at sea, sailing in, alongside.
  const prev = F.shipX;
  F.shipX = F.startX + (F.ship.x - F.startX) * easeOut(shipK(F));
  F.shipV = dt > 0 ? (prev - F.shipX) / dt : 0;
}

function fireFlare(game, F) {
  const S = game.settings;
  F.state = 'called';
  F.t = 0;
  F.dur = Math.max(10, S.ferryTime);
  F.nextWave = 4;
  F.flareT = 0;
  F.hold = 1;
  game.audio.flare(F.flare.x, F.flare.y);
  game.noise(F.flare.x, F.flare.y, 1600);
  game.effects.light(F.flare.x, F.flare.y, 420, 0.5, 1);
  const D = game.director;
  if (D.phase === 'calm' || D.phase === 'relax') D.phase = 'build';
  D.mobT = Math.max(D.mobT, F.dur + 30);
  D.trickleT = Math.max(D.trickleT, F.dur + 10);
  game.stats.flareAt = game.stats.time;
  game.announce('FLARE UP!', '#ff6b5a', 2.2);
  game.announce('EVERYTHING ON THE DOCKS SAW THAT. HOLD OUT!', 'rgba(255,220,190,0.9)', 2.6, 'small');
  game.addTrauma(0.15);
  game.haptic(40);
}

function wave(game, F, n) {
  const S = game.settings;
  if (game.director.tankEngaged) return; // the Tank is the event: no waves on top of it
  const spot = game.director.queueHorde(Math.round(n * S.hordeSize), 2.4, 500, 1300, [320, 1800, 300]);
  if (spot) {
    game.audio.horde(spot.x, spot.y);
    game.stats.hordes++;
  }
  F.waves++;
}

function dock(game, F) {
  F.state = 'docked';
  F.f = 1;
  F.gang = 0;
  game.audio.ferryHorn(false);
  game.audio.gateOpen(F.gangX, F.pier.y);
  game.announce('ALL ABOARD!', '#7dffa1', 2.6);
  game.announce('THE GANGWAY IS DOWN: RUN!', 'rgba(210,255,220,0.95)', 2.6, 'small');
  game.stats.ferry = 1;
  game.haptic(50);
  wave(game, F, rand(18, 26)); // they saw the ship too
}

/** Can you leave yet? (The boarding spot only counts with the ferry alongside.) */
export function finaleOpen(F) {
  return !F || (F.state === 'docked' && F.gang >= 0.6);
}

/**
 * Lights the finale adds: the flare (red, swinging), the ferry's deck lamps
 * and its searchlight. Used by the lighting pass and the Night Terror.
 */
export function finaleLights(F, t, out = []) {
  out.length = 0;
  if (!F) return out;
  if (F.flareT >= 0 && F.flareT < FERRY.flareLife) {
    const k = F.flareT < 1 ? F.flareT : F.flareT > FERRY.flareLife - 4 ? (FERRY.flareLife - F.flareT) / 4 : 1;
    const fp = flarePos(F, t);
    out.push({ x: fp.x, y: fp.y, r: 520 * (0.95 + 0.05 * Math.sin(t * 17)), k: 0.8 * k, burn: 0.7 * k, red: true });
  }
  const sx = F.shipX;
  if (sx < F.startX - 40) {
    const S = F.ship;
    const cy = S.y + S.h / 2;
    for (const fx of [0.18, 0.45, 0.72]) out.push({ x: sx + S.w * fx, y: cy, r: 210, k: 0.7, burn: 0 });
    // The searchlight: sweeps the water on the way in, then holds on the pier.
    const ang = F.state === 'docked' ? Math.PI - 0.2 + 0.1 * Math.sin(t * 0.7) : Math.PI * 0.8 + 0.3 * Math.sin(t * 0.9);
    out.push({ x: sx + 60, y: cy + 30, r: 900, k: 0.6, cone: ang, half: 0.16, burn: 0.8 });
  }
  return out;
}

/** Where the flare hangs: shot up from the post, drifting with the wind. */
export function flarePos(F, t) {
  const a = Math.min(1, F.flareT / 1.2);
  return { x: F.flare.x - 40 * a + Math.sin(t * 0.6) * 18 * a, y: F.flare.y - 150 * a };
}
