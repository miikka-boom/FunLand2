// Shared pieces for the outdoor map generators (graveyard, suburbia,
// junkyard): seeded helpers, obstacle records, the safe rooms, the border,
// and the nav-grid lattice that small props are placed on.

import { mulberry32, rectsOverlap } from '../util.js';
import { NAV_CELL } from './world.js';

// move: blocks movement, shot: stops bullets, sight: blocks line of sight / light.
// (flat: painted with the ground, nothing stands there: a pond, a pool.)
export const KINDS = {
  // The ones every map has.
  building: { move: true, shot: true, sight: true },
  wall: { move: true, shot: true, sight: true },
  border: { move: true, shot: true, sight: true },
  car: { move: true, shot: true, sight: false },
  crate: { move: true, shot: true, sight: false },
  dumpster: { move: true, shot: true, sight: false },
  statue: { move: true, shot: true, sight: false },
  barrel: { move: true, shot: true, sight: false },
  container: { move: true, shot: true, sight: true },
  fence: { move: true, shot: false, sight: false },
  planter: { move: true, shot: false, sight: false },
  bench: { move: true, shot: false, sight: false },
  tree: { move: true, shot: false, sight: false },
  fountain: { move: true, shot: false, sight: false },
  table: { move: true, shot: false, sight: false },
  // Graveyard.
  grave: { move: true, shot: false, sight: false }, // a headstone
  tomb: { move: true, shot: false, sight: false }, // a table tomb / ledger on a plinth
  obelisk: { move: true, shot: true, sight: false },
  mausoleum: { move: true, shot: true, sight: true },
  niche: { move: true, shot: true, sight: true }, // a columbarium wall
  mound: { move: true, shot: false, sight: false }, // a heap of earth
  pond: { move: true, shot: false, sight: false, flat: true },
  digger: { move: true, shot: true, sight: false },
  // Suburbia.
  hedge: { move: true, shot: false, sight: false },
  pool: { move: true, shot: false, sight: false, flat: true },
  playset: { move: true, shot: false, sight: false },
  // Junkyard.
  wrecks: { move: true, shot: true, sight: true }, // a stack of flattened cars
  scrap: { move: true, shot: true, sight: false }, // a heap of scrap
  tires: { move: true, shot: true, sight: false },
  appliances: { move: true, shot: true, sight: false },
  crusher: { move: true, shot: true, sight: true },
  cranebase: { move: true, shot: true, sight: false },
};

export function ob(kind, x, y, w, h, extra = {}) {
  return { kind, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), ...KINDS[kind], ...extra };
}

/** Seeded helpers: r(a, b), ri(a, b) inclusive, chance(p), pick(arr), rnd. */
export function dice(seed) {
  const rnd = mulberry32(seed >>> 0);
  const r = (a, b) => a + rnd() * (b - a);
  return { rnd, r, ri: (a, b) => Math.floor(r(a, b + 1)), chance: (p) => rnd() < p, pick: (arr) => arr[Math.floor(rnd() * arr.length)] };
}

/** Split `total` into n stretches with `gap` between them, each a bit different. */
export function splitAxis(total, n, gap, rnd, spread = 0.36) {
  const avail = total - (n - 1) * gap;
  const weights = Array.from({ length: n }, () => 1 - spread / 2 + rnd() * spread);
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = [];
  let pos = 0;
  for (let i = 0; i < n; i++) {
    const w = i === n - 1 ? total - pos : Math.round((avail * weights[i]) / sum);
    out.push([pos, pos + w]);
    pos += w + gap;
  }
  return out;
}

/** Snap to the nav grid: the low corner of the cell that holds v. */
export const cell0 = (v) => Math.floor(v / NAV_CELL) * NAV_CELL;
export const CELL = NAV_CELL;

/**
 * The green safe room every run starts and ends in: 232 x 192 with a door in
 * its east ('right') or west ('left') wall. Pushes its walls and a medkit (two
 * at the end); returns { interior, door, outer }.
 */
export function safeRoom(obstacles, pickups, x, y, doorSide, isEnd) {
  const W = 232;
  const H = 192;
  const T = 16;
  const door = 88;
  x = Math.round(x);
  y = Math.round(y);
  const color = '#3d5a45';
  const wall = (wx, wy, ww, wh) => obstacles.push(ob('wall', wx, wy, ww, wh, { color, safe: true }));
  wall(x, y, W, T); // top
  wall(x, y + H - T, W, T); // bottom
  const dy0 = y + (H - door) / 2;
  if (doorSide === 'right') {
    wall(x, y + T, T, H - 2 * T);
    wall(x + W - T, y + T, T, dy0 - (y + T));
    wall(x + W - T, dy0 + door, T, y + H - T - (dy0 + door));
  } else {
    wall(x + W - T, y + T, T, H - 2 * T);
    wall(x, y + T, T, dy0 - (y + T));
    wall(x, dy0 + door, T, y + H - T - (dy0 + door));
  }
  const interior = { x: x + T, y: y + T, w: W - 2 * T, h: H - 2 * T };
  const door1 = doorSide === 'right' ? { x: x + W - T, y: dy0, w: T, h: door } : { x, y: dy0, w: T, h: door };
  pickups.push({ kind: 'medkit', x: interior.x + 26, y: interior.y + 26 });
  if (isEnd) pickups.push({ kind: 'medkit', x: interior.x + interior.w - 26, y: interior.y + 26 });
  return { interior, door: door1, outer: { x, y, w: W, h: H } };
}
export const SAFE_W = 232;
export const SAFE_H = 192;

/** The space in front of a safe-room door that must stay clear. */
export function doorApron(room, reach = 170) {
  const d = room.door;
  return { x: d.x - reach, y: d.y - 60, w: d.w + 2 * reach, h: d.h + 120 };
}

/** The four border slabs around a W x H map. */
export function border(obstacles, W, H, extra = {}) {
  const B = 400;
  obstacles.push(ob('border', -B, -B, W + 2 * B, B, extra));
  obstacles.push(ob('border', -B, H, W + 2 * B, B, extra));
  obstacles.push(ob('border', -B, 0, B, H, extra));
  obstacles.push(ob('border', W, 0, B, H, extra));
}

/** Is `rect` clear of every obstacle so far (padded)? */
export const freeOf = (obstacles) => (rect, pad = 0) => !obstacles.some((o) => rectsOverlap(o, rect, pad));

/**
 * Medkits spread over the map: n of them, on free ground, away from the start
 * and from each other. `ok(x, y)` can veto a spot.
 */
export function scatterKits(D, obstacles, pickups, W, H, start, n, ok = () => true) {
  const free = freeOf(obstacles);
  let kits = 0;
  for (let k = 0; k < 500 && kits < n; k++) {
    const x = D.r(80, W - 80);
    const y = D.r(80, H - 80);
    if (Math.hypot(x - start.x, y - start.y) < 600 || !ok(x, y)) continue;
    if (!free({ x: x - 16, y: y - 16, w: 32, h: 32 }, 8)) continue;
    if (pickups.some((q) => Math.hypot(q.x - x, q.y - y) < 520)) continue;
    pickups.push({ kind: 'medkit', x, y });
    kits++;
  }
}
