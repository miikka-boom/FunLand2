// The tutorial: Day 1, the squad's practice run. Hand-built and the same on
// every device and every run (the seed is only kept for the report). Three
// streets joined by short connectors, each connector shut by a steel gate in
// a wall that runs east-west, so the camera (looking north) sees the bars
// face on. A lesson opens the gate to the next street (src/game/tutorial.js
// runs them; src/render/tutorial-render.js draws the coaching).
//
//   north
//   ┌───────────────────────────────────────────────────────────────┐
//   │ ███████ yard ████████████ alley █[SAFE ROOM]┊C3 ███████████████ │
//   │ █  S3 → → → → → → → → → → alarm car → → horde ─┴─ G3 ███████████ │
//   │ █ G2 ████████████ pack alley ████ door ██ alley ████████████████ │
//   │ █  S2 ← ← stash nook ← ← ← both thumbs ← ← ← shove ─┬─ ███████████ │
//   │ ████████ nook ███████ [PEN] ████████████████████ G1 ███████████ │
//   │ [START] → S1 → move ring → pen → → → → → → → → → ─┘ ███████████ │
//   │ ███████████████████████████████████████████████████████████████ │
//   └───────────────────────────────────────────────────────────────┘
//
// The start room is bottom left and the safe room top right, as on the
// Streets. Everything with a place in a lesson is in map.tutorial.
//
// The course is laid out on a 2048 x 1824 plan (the numbers below), then
// framed with more buildings all round (FRAME) and moved over by the frame,
// so the camera never looks past the edge of the map.

import { NAV_CELL } from './world.js';
import { ob, dice, safeRoom, border } from './gen-kit.js';

const PLAN_W = 2048;
const PLAN_H = 1824;
const FRAME = { l: 384, r: 384, t: 192, b: 192 }; // half a screen and more, on every side
export const TUT_W = PLAN_W + FRAME.l + FRAME.r;
export const TUT_H = PLAN_H + FRAME.t + FRAME.b;
const SW = 22; // sidewalk

// Streets, curb to curb (what the lamps lean over and the lines are painted on).
const S1 = { dir: 'h', x: 394, y: 1408, w: 1484, h: 224 };
const S2 = { dir: 'h', x: 170, y: 896, w: 1708, h: 224 };
const S3 = { dir: 'h', x: 170, y: 384, w: 1708, h: 224 };
const C1 = { dir: 'v', x: 1632, y: 1120, w: 224, h: 288 };
const C2 = { dir: 'v', x: 192, y: 608, w: 224, h: 288 };
const C3 = { dir: 'v', x: 1632, y: 42, w: 224, h: 342 };

// The safe rooms (232 x 192 outside; doors face east).
const START_ROOM = { x: 162, y: 1424 };
const END_ROOM = { x: 1378, y: 96 };

// Holes in the buildings: alleys, nooks, the pen (rects you can walk in). Edges
// line up where they can, so the buildings between them come out deep.
const ALCOVE = { x: 624, y: 210, w: 224, h: 152 }; // a little yard off row 3 (bins, nobody in it)
const NORTH_ALLEY = { x: 1200, y: 210, w: 96, h: 152 }; // row 3, north side
const SOUTH_ALLEY = { x: 1472, y: 630, w: 96, h: 90 }; // row 3, south side
const PACK_ALLEY = { x: 960, y: 720, w: 96, h: 154 }; // row 2, north side
const SHOVE_DOOR = { x: 1328, y: 800, w: 64, h: 74 }; // row 2, north side
const STASH_NOOK = { x: 560, y: 1142, w: 96, h: 138 }; // row 2, south side
const PEN = { x: 864, y: 1216, w: 352, h: 170 }; // the lot behind the fence, row 1

/** Everything you can walk on: the streets with their sidewalks, the holes, the rooms. */
const OPEN = [
  { x: S3.x, y: S3.y - SW, w: S3.w, h: S3.h + 2 * SW },
  { x: C2.x - SW, y: C2.y + SW, w: C2.w + 2 * SW, h: C2.h - 2 * SW },
  { x: S2.x, y: S2.y - SW, w: S2.w, h: S2.h + 2 * SW },
  { x: C1.x - SW, y: C1.y + SW, w: C1.w + 2 * SW, h: C1.h - 2 * SW },
  { x: S1.x, y: S1.y - SW, w: S1.w, h: S1.h + 2 * SW },
  { x: C3.x - SW, y: C3.y, w: C3.w + 2 * SW, h: C3.h - SW },
  { ...START_ROOM, w: 232, h: 192 },
  { ...END_ROOM, w: 232, h: 192 },
  ALCOVE, NORTH_ALLEY, SOUTH_ALLEY, PACK_ALLEY, SHOVE_DOOR, STASH_NOOK, PEN,
];

/**
 * Where the buildings stand: everything that isn't open ground, in eight
 * regions (each cut up on its own, so one region's edges don't slice another's
 * buildings into strips).
 */
const BUILT = [
  { x: 0, y: 0, w: 1610, h: 362 }, // north of row 3 (the alcove, an alley, the safe room)
  { x: 1610, y: 0, w: 268, h: 42 }, // the end of the stub to the safe room
  { x: 1878, y: 0, w: 170, h: PLAN_H }, // the east edge
  { x: 0, y: 362, w: 170, h: 780 }, // the west edge
  { x: 438, y: 630, w: 1440, h: 244 }, // between rows 3 and 2
  { x: 394, y: 1142, w: 1216, h: 244 }, // between rows 2 and 1 (the nook, the pen)
  { x: 0, y: 1142, w: 394, h: 682 }, // around the start room
  { x: 394, y: 1654, w: 1484, h: 170 }, // south of row 1
  // The frame: the rest of the town, all round.
  { x: -FRAME.l, y: -FRAME.t, w: FRAME.l, h: PLAN_H + FRAME.t + FRAME.b },
  { x: PLAN_W, y: -FRAME.t, w: FRAME.r, h: PLAN_H + FRAME.t + FRAME.b },
  { x: 0, y: -FRAME.t, w: PLAN_W, h: FRAME.t },
  { x: 0, y: PLAN_H, w: PLAN_W, h: FRAME.b },
];

/** The ground under it all: strips of pavement between the streets (cosmetic: sidewalk + lot colour). */
const BLOCKS = [
  { x: 0, y: 0, w: 1632, h: 384, sides: 'br', type: 'end' },
  { x: 1856, y: 0, w: 192, h: 384, sides: 'lb' },
  { x: 1632, y: 0, w: 224, h: 42, sides: 'b' },
  { x: 0, y: 608, w: 192, h: 288, sides: 'tbr' },
  { x: 416, y: 608, w: 1632, h: 288, sides: 'tbl' },
  { x: 0, y: 1120, w: 1632, h: 288, sides: 'tbr' },
  { x: 1856, y: 1120, w: 192, h: 288, sides: 'tbl' },
  { x: 0, y: 1408, w: 394, h: 224, sides: '', type: 'start' },
  { x: 0, y: 1632, w: 2048, h: 192, sides: 't' },
  { x: -FRAME.l, y: -FRAME.t, w: FRAME.l, h: PLAN_H + FRAME.t + FRAME.b, sides: '' },
  { x: PLAN_W, y: -FRAME.t, w: FRAME.r, h: PLAN_H + FRAME.t + FRAME.b, sides: '' },
  { x: 0, y: -FRAME.t, w: PLAN_W, h: FRAME.t, sides: '' },
  { x: 0, y: PLAN_H, w: PLAN_W, h: FRAME.b, sides: '' },
];

// The lot behind the fence is a building site (dirt), not a block of buildings.
const LOTS = [{ ...PEN, type: 'construction' }];

/** A gate in a wall across a connector (the wall runs from building line to building line). */
function gateLine(cx0, cx1, y, open = 150) {
  const T = 16;
  const mid = (cx0 + cx1) / 2;
  const g0 = Math.round(mid - open / 2);
  const g1 = g0 + open;
  const solid = { move: true, shot: true, sight: true };
  const walls = [ob('qwall', cx0, y, g0 - cx0, T, solid), ob('qwall', g1, y, cx1 - g1, T, solid)];
  const bars = ob('gate', g0, y + 1, open, T - 2, { move: true, shot: false, sight: false, navOpen: true, opens: true });
  bars.x0 = bars.x;
  bars.w0 = bars.w;
  return { walls, bars, x: mid, y: y + T / 2, w: open };
}

/**
 * A region minus the open ground in it, cut into rects: the x and y of every
 * open edge make a grid; built cells merge into runs along x, and equal runs
 * merge down.
 */
export function builtRects(region, open) {
  const R = region;
  const inside = (v, a, b) => v >= a && v <= b;
  const xs = [...new Set([R.x, R.x + R.w, ...open.flatMap((o) => [o.x, o.x + o.w])])].filter((v) => inside(v, R.x, R.x + R.w)).sort((a, b) => a - b);
  const ys = [...new Set([R.y, R.y + R.h, ...open.flatMap((o) => [o.y, o.y + o.h])])].filter((v) => inside(v, R.y, R.y + R.h)).sort((a, b) => a - b);
  const isOpen = (x, y) => open.some((o) => x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h);
  const out = [];
  let prev = [];
  for (let j = 0; j < ys.length - 1; j++) {
    const y0 = ys[j];
    const y1 = ys[j + 1];
    const runs = [];
    let run = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const built = !isOpen((xs[i] + xs[i + 1]) / 2, (y0 + y1) / 2);
      if (built && run) run.x1 = xs[i + 1];
      else if (built) run = { x0: xs[i], x1: xs[i + 1] };
      if (!built && run) {
        runs.push(run);
        run = null;
      }
    }
    if (run) runs.push(run);
    const next = [];
    for (const r of runs) {
      const above = prev.find((q) => q.x0 === r.x0 && q.x1 === r.x1);
      if (above) {
        above.rect.h = y1 - above.rect.y;
        next.push(above);
      } else {
        const rect = { x: r.x0, y: y0, w: r.x1 - r.x0, h: y1 - y0 };
        out.push(rect);
        next.push({ ...r, rect });
      }
    }
    prev = next;
  }
  return out;
}

const ROOFS = ['#3d4148', '#4a4540', '#3a4446', '#47423f', '#3f3b45', '#434a4f', '#4b4744'];

/**
 * The squad's own writing, sprayed for the practice run (no line ever runs
 * into another: tests/tutorial.test.js). marker = a thinner pen, size in world units.
 */
export const TUTORIAL_WALLS = [
  // The start room (its medkit is in the top left corner).
  { x: 300, y: 1470, text: 'DAY 1. PRACTICE RUN.', size: 12, color: '#e8e8e0' },
  { x: 278, y: 1570, text: 'LEFT THUMB WALKS.', size: 11, color: '#f2c94c' },
  { x: 278, y: 1586, text: 'RIGHT THUMB TALKS. — LOU', size: 11, color: '#f2c94c' },
  // Row 1.
  { x: 1040, y: 1446, text: 'LIVE TARGETS. DON\'T ASK. — LOU', size: 12, color: '#f2c94c' },
  // Row 2.
  { x: 1500, y: 1088, text: 'SHOVE FIRST. ASK NEVER.', size: 14, color: '#e8e8e0' },
  { x: 1130, y: 1088, text: 'THEY COME IN PACKS. — MAGS', size: 12, color: '#9fd8ff' },
  { x: 608, y: 1110, text: 'GOOD STUFF', size: 13, color: '#e8e8e0' },
  // Row 3: the squad's oldest argument, the tip by the car, the way out.
  { x: 440, y: 580, text: 'WHO TOOK THE LAST CAN OF PEACHES', size: 13, color: '#e8e8e0' },
  { x: 470, y: 600, text: 'NOT ME — TEO', size: 11, color: '#9fd8ff' },
  { x: 1230, y: 590, text: 'RED LIGHT CARS = DINNER BELLS', size: 12, color: '#ffb37a' },
  { x: 1560, y: 414, text: 'HOLD THE LINE', size: 15, color: '#e8e8e0' },
  // The safe room (medkits in the top corners, its name across the middle).
  { x: 1494, y: 230, text: 'DAY 1: DONE. — ODILE', size: 11, color: '#e8e8e0' },
  { x: 1494, y: 246, text: 'YOU\'LL DO. — LOU', size: 11, color: '#f2c94c' },
];

/** Ben was with them on day 1. One line, in his crayon, under theirs. */
export const TUTORIAL_BEN = { x: 1494, y: 262, text: 'my turn tomorrow.' };

/**
 * Move everything on the map by (dx, dy): from the plan into the frame. Each
 * object moves once (the gate bars, the car and the fence are obstacles that
 * map.tutorial points at too).
 */
function shiftMap(map, dx, dy) {
  const done = new Set();
  const mv = (o) => {
    if (!o || done.has(o)) return;
    done.add(o);
    o.x += dx;
    o.y += dy;
    if (o.x0 !== undefined) o.x0 += dx; // a gate's bars remember where they were shut
  };
  for (const o of map.obstacles) mv(o);
  for (const b of map.blocks) {
    mv(b);
    mv(b.inner);
  }
  for (const list of [map.streets, map.lamps, map.pickups, map.decor, map.glows, map.stashes, map.witches]) for (const q of list) mv(q);
  for (const d of map.markings.dashes) {
    d.x0 += dx;
    d.x1 += dx;
    d.y0 += dy;
    d.y1 += dy;
  }
  mv(map.start);
  for (const room of [map.startRoom, map.endRoom]) for (const k of ['interior', 'door', 'outer']) mv(room[k]);
  const T = map.tutorial;
  for (const k of ['moveRing', 'pen', 'shoveSpawn', 'packSpawn']) mv(T[k]);
  for (const k of ['penZombies', 'alarmSpawns', 'panicSpawns', 'hordeSpawns']) for (const q of T[k]) mv(q);
  for (const g of Object.values(T.gates)) mv(g);
}

export function generateTutorial(seed = 1) {
  // Fixed dice: every player gets the same course, whatever the seed.
  const D = dice(0x5eed7);
  const obstacles = [];
  const pickups = [];
  const lamps = [];
  const decor = [];
  const glows = [];

  // --- The rooms -------------------------------------------------------------------------------
  const startRoom = safeRoom(obstacles, pickups, START_ROOM.x, START_ROOM.y, 'right', false);
  const endRoom = safeRoom(obstacles, pickups, END_ROOM.x, END_ROOM.y, 'right', true);
  const si = startRoom.interior;
  const start = { x: si.x + si.w / 2, y: si.y + si.h / 2 + 10 };

  // --- Buildings: everything that isn't open ground ---------------------------------------------
  for (const r of BUILT.flatMap((region) => builtRects(region, OPEN))) {
    // Long rects are cut into a row of buildings that touch (no slivers to get stuck in).
    const along = r.w >= r.h ? 'x' : 'y';
    const len = along === 'x' ? r.w : r.h;
    let pos = 0;
    while (pos < len) {
      let piece = Math.round(D.r(130, 250));
      if (len - pos - piece < 90) piece = len - pos; // never leave a stub
      const b = along === 'x' ? { x: r.x + pos, y: r.y, w: piece, h: r.h } : { x: r.x, y: r.y + pos, w: r.w, h: piece };
      obstacles.push(ob('building', b.x, b.y, b.w, b.h, { color: D.pick(ROOFS), vents: D.ri(0, 3), seed: D.ri(1, 1e6) }));
      pos += piece;
    }
  }

  // --- The pen: a building site behind a fence, three of them shut in ----------------------------
  // Thick enough that what presses on it can't reach through it.
  const fence = ob('fence', PEN.x, PEN.y + PEN.h - 10, PEN.w, 10);
  obstacles.push(fence);
  // Site junk along the back, out of the line of fire from the street.
  obstacles.push(ob('crate', PEN.x + 14, PEN.y + 10, 34, 34));
  obstacles.push(ob('crate', PEN.x + PEN.w - 48, PEN.y + 10, 34, 34));
  obstacles.push(ob('crate', PEN.x + 110, PEN.y + 8, 130, 22, { pipe: true }));
  // Six of them: plenty of practice before anything can reach you.
  const penZombies = [
    { x: PEN.x + 60, y: PEN.y + 84 },
    { x: PEN.x + 150, y: PEN.y + 68 },
    { x: PEN.x + 245, y: PEN.y + 80 },
    { x: PEN.x + 300, y: PEN.y + 126 },
    { x: PEN.x + 110, y: PEN.y + 128 },
    { x: PEN.x + 205, y: PEN.y + 132 },
  ];

  // --- The gates ---------------------------------------------------------------------------------
  const g1 = gateLine(C1.x - SW, C1.x + C1.w + SW, 1256);
  const g2 = gateLine(C2.x - SW, C2.x + C2.w + SW, 744);
  const g3 = gateLine(C3.x - SW, C3.x + C3.w + SW, 296);
  for (const g of [g1, g2, g3]) obstacles.push(...g.walls, g.bars);

  // --- Row 3: a yard with its bins; the alarm car, parked across the north lane just past the alley it hides
  obstacles.push(ob('dumpster', ALCOVE.x + 18, ALCOVE.y + 10, 62, 34, { color: '#2f4f3a' }));
  obstacles.push(ob('crate', ALCOVE.x + ALCOVE.w - 52, ALCOVE.y + 12, 34, 34));
  decor.push({ type: 'trash', x: ALCOVE.x + 112, y: ALCOVE.y + 40, s: 1.2 });
  const car = ob('car', 1214, 446, 86, 44, { color: '#b8b8b2', alarm: true, vertical: false, front: 1 });
  obstacles.push(car);
  // Two more cars for company (no alarm: one in each row, nowhere near a lesson).
  obstacles.push(ob('car', 1180, 1580, 86, 44, { color: '#6b6b6b', vertical: false, front: -1 }));
  obstacles.push(ob('car', 560, 912, 86, 44, { color: '#2e4a6d', vertical: false, front: 1 }));

  // --- The stash, and the chalk that leads to it ---------------------------------------------------
  const stash = { id: 1, tier: 'stash', x: STASH_NOOK.x + STASH_NOOK.w / 2, y: STASH_NOOK.y + STASH_NOOK.h - 34, loot: ['armor', 'hot'], a: 0.08 };
  for (const [x, y] of [[880, 1036], [750, 1066]]) {
    decor.push({ type: 'chalk', x, y, a: Math.atan2(stash.y - y, stash.x - x), sym: 'stash', s: 1 });
  }
  // The way to go, the first thing you see out of the door.
  decor.push({ type: 'spray', x: 520, y: 1594, text: 'THIS WAY', color: '#e8e8e0', a: 0, s: 0.9 });

  // --- Medkits: one in each room (safeRoom), one on each of the long fights' streets ------------------
  pickups.push({ kind: 'medkit', x: 1180, y: 884 });
  pickups.push({ kind: 'medkit', x: 1380, y: 618 });

  // --- Light: lamps along the streets (alternating sides), a glow at every gate ------------------------
  const inMouth = (l) => [C1, C2, C3].some((c) => l.x > c.x - 30 && l.x < c.x + c.w + 30 && l.y > c.y - 30 && l.y < c.y + c.h + 30);
  for (const s of [S1, S2, S3]) {
    let side = 0;
    for (let x = s.x + 120; x < s.x + s.w - 60; x += 240) {
      side ^= 1;
      const l = { x, y: side ? s.y - 8 : s.y + s.h + 8 };
      if (inMouth(l)) continue;
      lamps.push(l);
    }
  }
  for (const c of [C1, C2, C3]) lamps.push({ x: c.x - 8, y: c.y + c.h / 2 });
  for (const g of [g1, g2, g3]) {
    // Light only (no tint: no coloured pool painted on the ground).
    glows.push({ x: g.x, y: g.y + 90, r: 210, k: 0.5 });
    glows.push({ x: g.x, y: g.y - 90, r: 170, k: 0.42 });
  }
  glows.push({ x: PEN.x + PEN.w / 2, y: PEN.y + PEN.h / 2, r: 230, k: 0.5 });
  glows.push({ x: stash.x, y: stash.y - 30, r: 120, k: 0.35 });

  // --- Paint, clutter and the squad's writing --------------------------------------------------
  const markings = { dashes: [], crosswalks: [], parking: [] };
  for (const s of [S1, S2, S3]) markings.dashes.push({ x0: s.x + 60, y0: s.y + s.h / 2, x1: C1.x - 20, y1: s.y + s.h / 2 });
  for (const c of [C1, C2, C3]) markings.dashes.push({ x0: c.x + c.w / 2, y0: c.y + 20, x1: c.x + c.w / 2, y1: c.y + c.h - 20 });
  for (let k = 0; k < 70; k++) {
    const s = D.pick([S1, S2, S3, S1, S2, S3, C1, C2, C3]);
    const x = D.r(s.x + 20, s.x + s.w - 20);
    const y = D.r(s.y + 16, s.y + s.h - 16);
    const t = D.rnd();
    decor.push({ type: t < 0.38 ? 'puddle' : t < 0.66 ? 'crack' : t < 0.9 ? 'trash' : 'manhole', x, y, s: D.r(0.7, 1.4), a: D.r(0, Math.PI) });
  }
  for (const w of TUTORIAL_WALLS) decor.push({ type: 'graffiti', x: w.x, y: w.y, text: w.text, color: w.color, size: w.size, a: w.a || 0, drip: false, marker: w.size < 13 });
  decor.push({ type: 'bentext', x: TUTORIAL_BEN.x, y: TUTORIAL_BEN.y, text: TUTORIAL_BEN.text, size: 10, a: -0.03 });

  // --- Ground --------------------------------------------------------------------------------
  const blocks = BLOCKS.map((b) => {
    const l = b.sides.includes('l') ? SW : 0;
    const r = b.sides.includes('r') ? SW : 0;
    const t = b.sides.includes('t') ? SW : 0;
    const bb = b.sides.includes('b') ? SW : 0;
    return { x: b.x, y: b.y, w: b.w, h: b.h, inner: { x: b.x + l, y: b.y + t, w: b.w - l - r, h: b.h - t - bb }, type: b.type || 'buildings' };
  });
  for (const lot of LOTS) blocks.push({ x: lot.x, y: lot.y, w: lot.w, h: lot.h, inner: { x: lot.x, y: lot.y, w: lot.w, h: lot.h }, type: lot.type });

  const map = {
    seed,
    w: TUT_W,
    h: TUT_H,
    obstacles,
    blocks,
    // Copies: the map gets moved into its frame, the plan stays as it is.
    streets: [S1, S2, S3, C1, C2, C3].map((s) => ({ ...s })),
    intersections: [],
    markings,
    lamps,
    pickups,
    decor,
    fires: [],
    glows,
    start,
    startFacing: 0, // looking down the first street, out of the door
    startRoom,
    endRoom,
    stashes: [stash],
    sealed: [],
    witches: [], // no Witch in the first tutorial: she comes later
    posters: [],
    dens: [],
    darknessBoost: -0.12, // dusk on day 1: a little lighter than the nights to come
    wanderDensity: 0,
    tutorial: {
      moveRing: { x: 1000, y: 1490, r: 42 }, // right in front of the pen: they come to the fence to meet you
      pen: { ...PEN },
      penZombies,
      fence,
      gates: { g1, g2, g3 },
      shoveSpawn: { x: SHOVE_DOOR.x + SHOVE_DOOR.w / 2, y: SHOVE_DOOR.y + 30 },
      packSpawn: { x: PACK_ALLEY.x + PACK_ALLEY.w / 2, y: PACK_ALLEY.y + 40 },
      stash: stash.id,
      car,
      alarmSpawns: [
        { x: NORTH_ALLEY.x + NORTH_ALLEY.w / 2, y: NORTH_ALLEY.y + 36 },
        { x: SOUTH_ALLEY.x + SOUTH_ALLEY.w / 2, y: SOUTH_ALLEY.y + 60 },
      ],
      panicSpawns: [
        { x: 1830, y: 446 },
        { x: SOUTH_ALLEY.x + SOUTH_ALLEY.w / 2, y: SOUTH_ALLEY.y + 60 },
      ],
      hordeSpawns: [
        { x: 1830, y: 440 },
        { x: 1830, y: 560 },
        { x: SOUTH_ALLEY.x + SOUTH_ALLEY.w / 2, y: SOUTH_ALLEY.y + 60 },
      ],
    },
  };
  shiftMap(map, FRAME.l, FRAME.t);
  border(obstacles, TUT_W, TUT_H);
  return map;
}

// Sanity for the editor: everything sits on the nav grid's 32 u cells where it matters.
if (TUT_W % NAV_CELL || TUT_H % NAV_CELL) throw new Error('tutorial map must be whole nav cells');
