// The tutorial: Day 1, the squad's practice run. Hand-built and the same on
// every device and every run (the seed is only kept for the report). Three
// short streets joined by connectors, each connector shut by a steel gate in
// a wall that runs east-west, so the camera (looking north) sees the bars
// face on. A lesson opens the gate to the next street (src/game/tutorial.js
// runs them; src/render/tutorial-render.js draws the coaching). It's kept
// short on purpose: about four thousand units of walking, start to end.
//
//   north
//   ┌──────────────────────────────────────┐
//   │ ██████████████ [SAFE ROOM] ◄┐ C3 ████ │
//   │ █ S3 → → [car] → → → → → → ┴ G3 ████ │
//   │ █ G2 ████ door █████ alley █████████ │
//   │ █ S2 ← ← ← ← shove ← ← ← ← ┬ G1 ████ │
//   │ ███████████ [PEN] ████████ │ ███████ │
//   │ [START] → S1 → ring → → → ─┘ ███████ │
//   │ ████████████████████████████████████ │
//   └──────────────────────────────────────┘
//
// The start room is bottom left and the safe room top right, as on the
// Streets. Everything with a place in a lesson is in map.tutorial. The alarm
// car stands in the middle of row 3, a few steps from where you come in, in
// plain view: what comes for you comes along the street from the far end, so
// it's between you and them (shoot it and you know you did).
//
// The course is laid out on a 1472 x 1824 plan (the numbers below), then
// framed with more buildings all round (FRAME) and moved over by the frame,
// so the camera never looks past the edge of the map.

import { NAV_CELL } from './world.js';
import { ob, dice, safeRoom, border } from './gen-kit.js';

// The plan and its frame (Tutorial 2, world/tutorial2-gen.js, is laid out on the same).
export const PLAN_W = 1472;
export const PLAN_H = 1824;
export const FRAME = { l: 384, r: 384, t: 192, b: 192 }; // half a screen and more, on every side
export const TUT_W = PLAN_W + FRAME.l + FRAME.r;
export const TUT_H = PLAN_H + FRAME.t + FRAME.b;
export const SW = 22; // sidewalk

// Streets, curb to curb (what the lamps lean over and the lines are painted on).
const C1 = { dir: 'v', x: 1056, y: 1120, w: 224, h: 288 }; // row 1 -> row 2, east end
const C2 = { dir: 'v', x: 192, y: 608, w: 224, h: 288 }; // row 2 -> row 3, west end
const C3 = { dir: 'v', x: 1056, y: 42, w: 224, h: 342 }; // row 3 -> the safe room, east end
const EAST = C1.x + C1.w + SW; // where every street ends, at the east: the building line
const S1 = { dir: 'h', x: 394, y: 1408, w: EAST - 394, h: 224 };
const S2 = { dir: 'h', x: 170, y: 896, w: EAST - 170, h: 224 };
const S3 = { dir: 'h', x: 170, y: 384, w: EAST - 170, h: 224 };

// The safe rooms (232 x 192 outside; doors face east).
const START_ROOM = { x: 162, y: 1424 };
const END_ROOM = { x: C3.x - SW - 232, y: 96 }; // its door opens on the stub's sidewalk

// Holes in the buildings: alleys, a doorway, the pen (rects you can walk in).
// Edges line up where they can, so the buildings between them come out deep.
const SOUTH_ALLEY = { x: 900, y: 630, w: 96, h: 90 }; // row 3, south side
const SHOVE_DOOR = { x: 760, y: 800, w: 64, h: 74 }; // row 2, north side: the one you shove bursts out of it
const PEN = { x: 560, y: 1216, w: 352, h: 170 }; // row 1, the lot behind the fence

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
  SOUTH_ALLEY, SHOVE_DOOR, PEN,
];

/**
 * Where the buildings stand: everything that isn't open ground, in eight
 * regions (each cut up on its own, so one region's edges don't slice another's
 * buildings into strips).
 */
const BUILT = [
  { x: 0, y: 0, w: C3.x - SW, h: S3.y - SW }, // north of row 3 (an alley, the safe room)
  { x: C3.x - SW, y: 0, w: C3.w + 2 * SW, h: C3.y }, // the end of the stub to the safe room
  { x: EAST, y: 0, w: PLAN_W - EAST, h: PLAN_H }, // the east edge
  { x: 0, y: S3.y - SW, w: S3.x, h: S2.y + S2.h + SW - (S3.y - SW) }, // the west edge
  { x: C2.x + C2.w + SW, y: S3.y + S3.h + SW, w: EAST - (C2.x + C2.w + SW), h: S2.y - SW - (S3.y + S3.h + SW) }, // between rows 3 and 2
  { x: S1.x, y: S2.y + S2.h + SW, w: C1.x - SW - S1.x, h: S1.y - SW - (S2.y + S2.h + SW) }, // between rows 2 and 1 (the pen)
  { x: 0, y: S2.y + S2.h + SW, w: S1.x, h: PLAN_H - (S2.y + S2.h + SW) }, // around the start room
  { x: S1.x, y: S1.y + S1.h + SW, w: EAST - S1.x, h: PLAN_H - (S1.y + S1.h + SW) }, // south of row 1
  // The frame: the rest of the town, all round.
  { x: -FRAME.l, y: -FRAME.t, w: FRAME.l, h: PLAN_H + FRAME.t + FRAME.b },
  { x: PLAN_W, y: -FRAME.t, w: FRAME.r, h: PLAN_H + FRAME.t + FRAME.b },
  { x: 0, y: -FRAME.t, w: PLAN_W, h: FRAME.t },
  { x: 0, y: PLAN_H, w: PLAN_W, h: FRAME.b },
];

/** The ground under it all: strips of pavement between the streets (cosmetic: sidewalk + lot colour). */
const BLOCKS = [
  { x: 0, y: 0, w: C3.x, h: S3.y, sides: 'br', type: 'end' },
  { x: C3.x + C3.w, y: 0, w: PLAN_W - C3.x - C3.w, h: S3.y, sides: 'lb' },
  { x: C3.x, y: 0, w: C3.w, h: C3.y, sides: 'b' },
  { x: 0, y: C2.y, w: C2.x, h: C2.h, sides: 'tbr' },
  { x: C2.x + C2.w, y: C2.y, w: PLAN_W - C2.x - C2.w, h: C2.h, sides: 'tbl' },
  { x: 0, y: C1.y, w: C1.x, h: C1.h, sides: 'tbr' },
  { x: C1.x + C1.w, y: C1.y, w: PLAN_W - C1.x - C1.w, h: C1.h, sides: 'tbl' },
  { x: 0, y: S1.y, w: S1.x, h: S1.h, sides: '', type: 'start' },
  { x: 0, y: S1.y + S1.h, w: PLAN_W, h: PLAN_H - S1.y - S1.h, sides: 't' },
  { x: -FRAME.l, y: -FRAME.t, w: FRAME.l, h: PLAN_H + FRAME.t + FRAME.b, sides: '' },
  { x: PLAN_W, y: -FRAME.t, w: FRAME.r, h: PLAN_H + FRAME.t + FRAME.b, sides: '' },
  { x: 0, y: -FRAME.t, w: PLAN_W, h: FRAME.t, sides: '' },
  { x: 0, y: PLAN_H, w: PLAN_W, h: FRAME.b, sides: '' },
];

// The lot behind the fence is a building site (dirt), not a block of buildings.
const LOTS = [{ ...PEN, type: 'construction' }];

/** A gate in a wall across a connector (the wall runs from building line to building line). */
export function gateLine(cx0, cx1, y, open = 150) {
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

export const ROOFS = ['#3d4148', '#4a4540', '#3a4446', '#47423f', '#3f3b45', '#434a4f', '#4b4744'];

/**
 * Buildings on everything that isn't open ground: each region minus the
 * open rects, and long rects cut into a row of buildings that touch (130 to
 * 250 u each, never leaving a stub to get stuck by).
 */
export function cutBuildings(D, regions, open, obstacles) {
  for (const r of regions.flatMap((region) => builtRects(region, open))) {
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
}

/** The ground blocks (sidewalk on the sides named) and the lots, as the map has them. */
export function groundBlocks(blocks, lots) {
  const out = blocks.map((b) => {
    const l = b.sides.includes('l') ? SW : 0;
    const r = b.sides.includes('r') ? SW : 0;
    const t = b.sides.includes('t') ? SW : 0;
    const bb = b.sides.includes('b') ? SW : 0;
    return { x: b.x, y: b.y, w: b.w, h: b.h, inner: { x: b.x + l, y: b.y + t, w: b.w - l - r, h: b.h - t - bb }, type: b.type || 'buildings' };
  });
  for (const lot of lots) out.push({ x: lot.x, y: lot.y, w: lot.w, h: lot.h, inner: { x: lot.x, y: lot.y, w: lot.w, h: lot.h }, type: lot.type });
  return out;
}

/** Lamps along the rows (alternating sides, none in a connector's mouth) and one by each connector. skip(lamp) leaves one out. */
export function streetLamps(rows, connectors, lamps, skip = () => false) {
  const inMouth = (l) => connectors.some((c) => l.x > c.x - 30 && l.x < c.x + c.w + 30 && l.y > c.y - 30 && l.y < c.y + c.h + 30);
  for (const s of rows) {
    let side = 0;
    for (let x = s.x + 120; x < s.x + s.w - 60; x += 240) {
      side ^= 1;
      const l = { x, y: side ? s.y - 8 : s.y + s.h + 8 };
      if (inMouth(l) || skip(l)) continue;
      lamps.push(l);
    }
  }
  for (const c of connectors) {
    const l = { x: c.x - 8, y: c.y + c.h / 2 };
    if (!skip(l)) lamps.push(l);
  }
}

/** n bits of street clutter (puddles, cracks, trash, manholes) on the streets listed (repeat one to weight it). */
export function streetClutter(D, streets, n, decor) {
  for (let k = 0; k < n; k++) {
    const s = D.pick(streets);
    const x = D.r(s.x + 20, s.x + s.w - 20);
    const y = D.r(s.y + 16, s.y + s.h - 16);
    const t = D.rnd();
    decor.push({ type: t < 0.38 ? 'puddle' : t < 0.66 ? 'crack' : t < 0.9 ? 'trash' : 'manhole', x, y, s: D.r(0.7, 1.4), a: D.r(0, Math.PI) });
  }
}

/**
 * The only writing on the course: Ben was with them on day 1. One line in his
 * crayon, in the safe room at the end (nothing on the streets: the lessons'
 * own arrows and rings are all there is to read on the way).
 */
export const TUTORIAL_BEN = { x: END_ROOM.x + 116, y: 246, text: 'my turn tomorrow.' };

/**
 * Move everything on the map by (dx, dy): from the plan into the frame. Each
 * object moves once (the gate bars, the car and the fence are obstacles that
 * map.tutorial points at too). keys names map.tutorial's spots: one (an
 * object with x, y) or many (a list of them, or a list of lists).
 */
export function shiftMap(map, dx, dy, keys) {
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
  // Boarded rooms (their boards are obstacles; normal is a direction, not a place).
  for (const room of map.sealed || []) {
    for (const k of ['interior', 'door', 'outside', 'stash']) mv(room[k]);
    for (const q of room.sleepers) mv(q);
  }
  for (const f of map.floors || []) mv(f);
  const T = map.tutorial;
  for (const k of keys.one) mv(T[k]);
  for (const k of keys.many) for (const q of T[k].flat()) mv(q);
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
  cutBuildings(D, BUILT, OPEN, obstacles);

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

  // --- Row 3: the alarm car, parked across the north lane in front of the alley it hides ----------
  // A few steps up and to the right of where you come in from gate 2: the middle of
  // a phone's screen, clear of the buttons on the right.
  const car = ob('car', 372, S3.y + S3.h / 2 - 22, 86, 44, { color: '#b8b8b2', alarm: true, vertical: false, front: -1 });
  obstacles.push(car); // the only car on the course: the one not to shoot

  // --- Medkits: one in each room (safeRoom), one on each street with a fight ------------------------
  pickups.push({ kind: 'medkit', x: 1000, y: 884 });
  pickups.push({ kind: 'medkit', x: 600, y: 618 });

  // --- Light: lamps along the streets (alternating sides), a glow at every gate ------------------------
  streetLamps([S1, S2, S3], [C1, C2, C3], lamps);
  for (const g of [g1, g2, g3]) {
    // Light only (no tint: no coloured pool painted on the ground).
    glows.push({ x: g.x, y: g.y + 90, r: 210, k: 0.5 });
    glows.push({ x: g.x, y: g.y - 90, r: 170, k: 0.42 });
  }
  glows.push({ x: PEN.x + PEN.w / 2, y: PEN.y + PEN.h / 2, r: 230, k: 0.5 });

  // --- Paint, a little clutter, and Ben's one line ----------------------------------------------
  // Kept plain on purpose: what stands out on the way is what a lesson points at.
  const markings = { dashes: [], crosswalks: [], parking: [] };
  for (const s of [S1, S2, S3]) markings.dashes.push({ x0: s.x + 60, y0: s.y + s.h / 2, x1: C1.x - 20, y1: s.y + s.h / 2 });
  for (const c of [C1, C2, C3]) markings.dashes.push({ x0: c.x + c.w / 2, y0: c.y + 20, x1: c.x + c.w / 2, y1: c.y + c.h - 20 });
  streetClutter(D, [S1, S2, S3, C1, C2, C3], 16, decor);
  decor.push({ type: 'bentext', x: TUTORIAL_BEN.x, y: TUTORIAL_BEN.y, text: TUTORIAL_BEN.text, size: 10, a: -0.03 });

  // --- Ground --------------------------------------------------------------------------------
  const blocks = groundBlocks(BLOCKS, LOTS);

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
    stashes: [], // no crates to search: that comes later
    sealed: [],
    witches: [], // no Witch in the first tutorial: she comes later
    posters: [],
    dens: [],
    darknessBoost: -0.12, // dusk on day 1: a little lighter than the nights to come
    wanderDensity: 0,
    tutorial: {
      moveRing: { x: PEN.x + PEN.w / 2 - 40, y: 1490, r: 42 }, // right in front of the pen: they come to the fence to meet you
      pen: { ...PEN },
      penZombies,
      fence,
      gates: { g1, g2, g3 },
      shoveSpawn: { x: SHOVE_DOOR.x + SHOVE_DOOR.w / 2, y: SHOVE_DOOR.y + 30 }, // the one that bursts out at you
      shoveWalk: { x: SHOVE_DOOR.x + SHOVE_DOOR.w / 2 - 60, y: S2.y + S2.h / 2 }, // along the street to it
      // The crowds turn up where you can't see them (src/game/tutorial.js picks
      // the first group with a spot out of sight). The pack comes down row 2
      // from the far end, out of the stub before gate 2 (the corner hides it), so
      // you see them coming across the screen; if you're too close to that, up
      // through gate 1 behind you. The rush at the end comes up through gate 2,
      // behind you: that one you outrun.
      packSpawns: [
        [
          { x: C2.x + 58, y: 790 },
          { x: C2.x + C2.w - 58, y: 790 },
        ],
        [
          { x: C1.x + 54, y: 1560 },
          { x: C1.x + C1.w - 54, y: 1560 },
        ],
      ],
      car,
      // The four for the alarm lesson come along row 3 from the far end (the
      // stub below gate 3, the south alley), with the car between you and them.
      alarmSpawns: [
        { x: C3.x + C3.w / 2, y: C3.y + C3.h - 40 },
        { x: SOUTH_ALLEY.x + SOUTH_ALLEY.w / 2, y: SOUTH_ALLEY.y + 60 },
      ],
      panicSpawns: [
        { x: EAST - 50, y: 446 },
        { x: SOUTH_ALLEY.x + SOUTH_ALLEY.w / 2, y: SOUTH_ALLEY.y + 60 },
      ],
      rushSpawns: [
        [
          { x: C2.x + 60, y: 846 },
          { x: C2.x + C2.w - 60, y: 846 },
        ],
        [{ x: C2.x + C2.w / 2 + 40, y: 1010 }],
      ],
    },
  };
  shiftMap(map, FRAME.l, FRAME.t, { one: ['moveRing', 'pen', 'shoveSpawn', 'shoveWalk'], many: ['penZombies', 'packSpawns', 'alarmSpawns', 'panicSpawns', 'rushSpawns'] });
  border(obstacles, TUT_W, TUT_H);
  return map;
}

// Sanity for the editor: everything sits on the nav grid's 32 u cells where it matters.
if (TUT_W % NAV_CELL || TUT_H % NAV_CELL) throw new Error('tutorial map must be whole nav cells');
