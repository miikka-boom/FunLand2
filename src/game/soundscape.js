// The soundscape, read off the game: what the ground under a foot is made of, what a bullet hit,
// each level's ambience, and the sounds that sit in the world this frame (fires, floodlight
// generators, the Pier 9 flare and the ferry's engine, the horde running at you). Pure logic, like
// music-director.js: src/audio.js plays what this describes. Tested in tests/soundscape.test.js.

import { FERRY, flarePos } from './finale.js';

const inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The footstep surfaces there are sounds for. */
export const SURFACES = ['concrete', 'grass', 'gravel', 'dirt', 'wood', 'metal'];

/** What the ground under (x, y) is made of: one of SURFACES. */
export function surfaceAt(map, x, y) {
  switch (map.theme) {
    case 'docks':
      for (const p of map.piers || []) if (inRect(p, x, y)) return 'wood';
      return 'concrete';
    case 'graveyard':
      for (const p of map.paving || []) {
        if (p.r ? Math.hypot(x - p.cx, y - p.cy) < p.r : inRect(p, x, y)) return 'concrete';
      }
      for (const s of map.streets || []) if (inRect(s, x, y)) return 'gravel';
      return 'grass';
    case 'suburbia':
      for (const p of map.paving || []) {
        if (inRect(p, x, y)) return p.style === 'mulch' ? 'dirt' : p.style === 'deck' ? 'wood' : 'concrete';
      }
      // The ballfield's infield (home plate at f.x, f.y; the diamond runs up and to the left).
      for (const f of map.fields || []) if (x <= f.x && y <= f.y && Math.hypot(x - f.x, y - f.y) < f.s * 0.78) return 'dirt';
      for (const l of map.lots || []) if (inRect(l, x, y)) return 'grass';
      for (const b of map.blocks || []) if (inRect(b, x, y)) return b.inner && inRect(b.inner, x, y) ? 'grass' : 'concrete';
      return 'concrete'; // the streets
    case 'junkyard':
      for (const p of map.paving || []) {
        if (inRect(p, x, y)) return p.style === 'gravel' ? 'gravel' : p.style === 'scale' ? 'metal' : 'concrete';
      }
      return 'dirt';
    default:
      return 'concrete'; // the city's streets and sidewalks, the building's floors
  }
}

// What each kind of obstacle sounds like when a bullet stops on it (anything not listed: concrete).
const MATERIAL = {
  car: 'metal', dumpster: 'metal', container: 'metal', truck: 'metal', forklift: 'metal', craneleg: 'metal',
  cranebase: 'metal', wrecks: 'metal', crusher: 'metal', digger: 'metal', heli: 'metal', pump: 'metal', gate: 'metal',
  barrel: 'metallight', cylinder: 'metallight', vending: 'metallight', cabinet: 'metallight', alarmbox: 'metallight',
  switchbox: 'metallight', appliances: 'metallight', scrap: 'metallight', shelf: 'metallight',
  crate: 'wood', boards: 'wood', barricade: 'wood', bench: 'wood', table: 'wood', desk: 'wood',
  tires: 'dirt', mound: 'dirt', sandbag: 'dirt',
  statue: 'rock', obelisk: 'rock', grave: 'rock', tomb: 'rock', rubble: 'rock',
};

/** The bullet-impact material of an obstacle: concrete | metal | metallight | wood | dirt | rock. */
export function materialOf(o) {
  if (!o) return 'concrete';
  if (o.boards) return 'wood';
  return MATERIAL[o.kind] || 'concrete';
}

/**
 * Each level's ambience: looping beds (sound id, level), the synth "air" under them, the room the
 * reverb models, and the far-off one-shots that drift in now and then (src/audio.js: SWEETENERS).
 */
export const AMBIENCE = {
  city: { beds: [['amb.wind', 0.42]], air: 0.022, verb: 'street', sweet: ['far.scream', 'far.glass', 'far.thunder', 'far.boom', 'far.clank'] },
  interior: { beds: [['amb.room', 0.75]], air: 0.01, verb: 'room', sweet: ['far.bang', 'far.clank', 'far.groan', 'far.creak', 'far.door'] },
  docks: { beds: [['amb.water', 0.62], ['amb.wind', 0.3]], air: 0.018, verb: 'open', sweet: ['far.hull', 'far.creak', 'far.scream', 'far.thunder'] },
  suburbia: { beds: [['amb.night', 0.5], ['amb.wind', 0.14]], air: 0.014, verb: 'open', sweet: ['far.swing', 'far.scream', 'far.glass', 'far.creak'] },
  graveyard: { beds: [['amb.night', 0.4], ['amb.wind', 0.46]], air: 0.016, verb: 'open', sweet: ['far.crow', 'far.creak', 'far.thunder', 'far.groan'] },
  junkyard: { beds: [['amb.wind', 0.42], ['amb.night', 0.14]], air: 0.02, verb: 'yard', sweet: ['far.clank', 'far.hull', 'far.scream', 'far.thunder'] },
};

/** The room each reverb models: decay (s), early reflections [delay s, level], damping (0..1), wet level. */
export const VERB = {
  street: { decay: 1.7, early: [[0.021, 0.5], [0.043, 0.36], [0.067, 0.28], [0.11, 0.2]], damp: 0.55, level: 0.32 },
  room: { decay: 0.8, early: [[0.007, 0.6], [0.013, 0.5], [0.019, 0.42], [0.029, 0.3]], damp: 0.7, level: 0.36 },
  open: { decay: 2.4, early: [[0.06, 0.18], [0.14, 0.12]], damp: 0.45, level: 0.24 },
  yard: { decay: 1.4, early: [[0.017, 0.42], [0.031, 0.36], [0.052, 0.3], [0.085, 0.22]], damp: 0.5, level: 0.3 },
};

export const HORDE_R = 900; // u: chasers within this make the horde bed
const MAX_EMITTERS = 6;

/**
 * This frame's soundscape (written into `out`, which is reused). Emitters are loops placed in the
 * world: { key, id, x, y, gain, range, rate }, nearest first and only those in range. The horde is
 * how loud the crowd bed (voices, running feet: 0..1) is, and where it is.
 */
export function readScene(game, screen, out = { emitters: [], horde: { voices: 0, feet: 0, x: 0, y: 0 } }) {
  const p = game.player;
  const map = game.world.map;
  out.screen = screen;
  out.run = game.runSerial;
  out.level = game.level;
  out.x = p.x;
  out.y = p.y;
  out.dead = !!game.lost;
  out.won = !!game.won;
  const list = out.emitters;
  list.length = 0;
  const add = (key, id, x, y, gain, range, rate = 1) => {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < range && gain > 0.001) list.push({ key, id, x, y, gain, range, rate, d: d / range });
  };
  for (const f of map.fires || []) add(f, 'loop.fire', f.x, f.y, f.barrel ? 0.45 : 0.75, 560);
  const E = game.events;
  for (const b of (E && E.burns) || []) add(b, 'loop.fire', b.x, b.y, 1.1 * clamp01(b.t / 3), 800, 0.85);
  for (const l of map.lamps || []) if (l.tower && !l.broken) add(l, 'loop.generator', l.x, l.y, 0.32, 620);
  const F = E && E.finale;
  if (F && F.flareT >= 0 && F.flareT < FERRY.flareLife) {
    const k = F.flareT < 1 ? F.flareT : F.flareT > FERRY.flareLife - 4 ? (FERRY.flareLife - F.flareT) / 4 : 1;
    const fp = flarePos(F, game.time);
    add('flare', 'loop.flare', fp.x, fp.y, 0.55 * k, 1100);
  }
  if (F && F.shipX < F.startX - 40) add('ship', 'loop.engine', F.shipX + F.ship.w / 2, F.ship.y + F.ship.h / 2, 0.9, 2600, 0.55);
  list.sort((a, b) => a.d - b.d);
  if (list.length > MAX_EMITTERS) list.length = MAX_EMITTERS;

  // The horde: chasers near you, weighted by how near. The bed comes in once there's a crowd.
  let w = 0;
  let wf = 0;
  let sx = 0;
  let sy = 0;
  for (const z of game.zombies) {
    if (!z.alive || z.type !== 'common' || z.state !== 'chase') continue;
    const dx = z.x - p.x;
    const dy = z.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > HORDE_R * HORDE_R) continue;
    const k = 1 - Math.sqrt(d2) / HORDE_R;
    w += k;
    sx += dx * k;
    sy += dy * k;
    if (z.vx * z.vx + z.vy * z.vy > 3600) wf += k; // running, not pressed up against you
  }
  const H = out.horde;
  H.voices = clamp01((w - 1.5) / 10);
  H.feet = clamp01((wf - 1) / 8);
  H.x = p.x + (w > 0 ? sx / w : 0);
  H.y = p.y + (w > 0 ? sy / w : 0);
  return out;
}
