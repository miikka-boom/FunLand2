// Ben, at run time (placement: world/ben-gen.js).
//
//  - his bed: walk up to it and it counts as found (this device remembers);
//    a can by the bed is still steaming; somewhere out of sight, someone
//    whistles a few notes (once a run, while you're near but can't see it)
//  - the glimpse: once a run, two little eyes in your flashlight, off the
//    walk. Hold the beam on them and they blink and are gone; the spot has
//    fresh scratches in it. Walk up without a light and they're just gone.
//    (Nothing here shows text: what he leaves is drawn in the world.)
//  - memory (this device only): deaths, wins and beds found, so a line or two
//    on later runs knows what you did. Nothing ever says how he knows.

import { lightAt } from './terror.js';

const MEM_KEY = 'funland2.p0.ben.v1';

export function loadBenMemory() {
  try {
    const m = JSON.parse(localStorage.getItem(MEM_KEY) || 'null');
    if (m && typeof m === 'object') return { deaths: 0, wins: 0, nests: {}, ...m, nests: { ...(m.nests || {}) } };
  } catch {
    // storage blocked: he forgets
  }
  return { deaths: 0, wins: 0, nests: {} };
}

export function saveBenMemory(m) {
  try {
    localStorage.setItem(MEM_KEY, JSON.stringify(m));
  } catch {
    // ignore
  }
}

export function initBen(game, map, mem) {
  const B = map.ben;
  if (!B) {
    game.ben = null;
    return;
  }
  game.ben = {
    nest: B.nest,
    glimpse: B.glimpse ? { x: B.glimpse.x, y: B.glimpse.y, state: 'wait', litT: 0, t: 0, lit: 0 } : null,
    whistled: false,
    nestFound: false,
    steamT: 0,
    ended: false,
    mem,
  };
  // "you got out. why come back?" is said once.
  if (mem && mem.pendingBack === game.level && B.knows) {
    delete mem.pendingBack;
    saveBenMemory(mem);
  }
}

export function updateBen(game, dt) {
  const G = game.ben;
  if (!G) return;
  const p = game.player;
  const W = game.world;
  if (G.nest) {
    const n = G.nest;
    const d = Math.hypot(p.x - n.x, p.y - n.y);
    if (!G.nestFound && p.alive && d < 80) {
      G.nestFound = true;
      game.stats.benNest = 1;
      if (G.mem) {
        G.mem.nests[game.level] = (G.mem.nests[game.level] || 0) + 1;
        saveBenMemory(G.mem);
      }
    }
    // Someone whistling, close, out of sight. Once.
    if (!G.whistled && p.alive && d < 700 && d > 240 && !W.segmentClear(p.x, p.y, n.x, n.y)) {
      G.whistled = true;
      game.audio.benWhistle(n.x, n.y);
    }
    // The can by the bed is still warm.
    if (d < 480) {
      G.steamT -= dt;
      if (G.steamT <= 0) {
        G.steamT = 0.32;
        game.effects.steam(n.can.x, n.can.y, 5);
      }
    }
  }

  updateGlimpse(game, G, dt);

  // Remember how it went (for the lines that know).
  if (!G.ended && (game.won || game.lost)) {
    G.ended = true;
    if (G.mem) {
      if (game.won) {
        G.mem.wins++;
        G.mem.pendingBack = game.level;
      } else G.mem.deaths++;
      saveBenMemory(G.mem);
    }
  }
}

function updateGlimpse(game, G, dt) {
  const g = G.glimpse;
  if (!g || g.state === 'gone') return;
  const p = game.player;
  if (!game.settings.night || !p.alive) {
    g.lit = 0;
    return;
  }
  const d = Math.hypot(p.x - g.x, p.y - g.y);
  if (g.state === 'wait') {
    if (d < 140) {
      vanish(game, g); // walked right up to it: nothing there now
      return;
    }
    if (d > 560) {
      g.lit = 0;
      g.litT = 0;
      return;
    }
    const L = lightAt(game, g.x, g.y);
    const see = L.see;
    const burn = L.burn;
    const los = game.world.segmentClear(p.x, p.y, g.x, g.y);
    g.lit = los ? see : 0;
    if (los && burn > 0.3) {
      g.litT += dt;
      if (g.litT > 0.14) {
        g.state = 'seen';
        g.t = 0;
        game.stats.benGlimpse = 1;
        game.audio.benScuff(g.x, g.y);
      }
    } else g.litT = Math.max(0, g.litT - dt);
  } else if (g.state === 'seen') {
    g.t += dt;
    if (g.t > 0.5) vanish(game, g);
  }
}

/** Gone: and the spot has fresh scratches in it. */
function vanish(game, g) {
  g.state = 'gone';
  g.lit = 0;
  const p = game.player;
  const look = Math.atan2(g.y - p.y, g.x - p.x); // looking away from you, the way it went
  game.world.map.decor.push({ type: 'beneyes', x: g.x, y: g.y, look, s: 0.9, fresh: true });
}
