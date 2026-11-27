// Tutorial 3: Day 3, the Hunter. Hand-built on Day 2's plan (the same three
// streets, each walked left to right and joined to the next by a gated
// connector; world/tutorial-gen.js has the helpers and the frame), and the
// same on every device. What's on it is the first special infected, a lesson
// a street (src/game/tutorial-day3.js has them):
//   - row 1: one comes out of a dark alley. Knock it out of the air (the
//     world slows from its scream, and stops with it in reach of a shove);
//   - row 2: one jumps you from a doorway as you pass it: break free;
//   - row 3: one more out of an alley at the far end, with no help; then a
//     medkit past the last gate, on the way to the safe room.
//
//   north
//   ┌────────────────────────────────────────────────────┐
//   │ ████████████████████ alley ███ C3┊[SAFE ROOM] ███ │
//   │ ██████████████████ S3 → → → → → → ─┴G3 ██████████ │
//   │ ████████ door ████ G2┬ ██████████████████████████ │
//   │ ███████ S2 → → → → → ┘ ██████████████████████████ │
//   │ ████ alley ████ G1┬ ██████████████████████████████ │
//   │ [START] → → → → → ┘ ███████████████████████████████ │
//   │ ████████████████████████████████████████████████████ │
//   └────────────────────────────────────────────────────┘
//
// Every spot a lesson uses is in map.tutorial. Hunters need room: a clear
// lane to leap along (they won't pounce through anything) and space to circle
// in, so the streets are kept open; nothing stands in the middle of them.

import { NAV_CELL } from './world.js';
import { dice, safeRoom, border } from './gen-kit.js';
import { PLAN_H, FRAME, SW, gateLine, cutBuildings, groundBlocks, streetLamps, streetClutter, shiftMap } from './tutorial-gen.js';

// Day 2's plan.
const PLAN_W = 2976;
export const TUT3_W = PLAN_W + FRAME.l + FRAME.r;
export const TUT3_H = PLAN_H + FRAME.t + FRAME.b;

// Streets, curb to curb. Each connector goes up from the east end of its row
// to the west end of the next one.
const C1 = { dir: 'v', x: 1056, y: 1120, w: 224, h: 288 }; // row 1 -> row 2
const C2 = { dir: 'v', x: 1788, y: 608, w: 224, h: 288 }; // row 2 -> row 3
const C3 = { dir: 'v', x: 2320, y: 42, w: 224, h: 342 }; // row 3 -> the safe room
const S1 = { dir: 'h', x: 394, y: 1408, w: C1.x + C1.w + SW - 394, h: 224 }; // from the start room's door
const S2 = { dir: 'h', x: C1.x - SW, y: 896, w: C2.x + C2.w + SW - (C1.x - SW), h: 224 };
const S3 = { dir: 'h', x: C2.x - SW, y: 384, w: C3.x + C3.w + SW - (C2.x - SW), h: 224 };

// The safe rooms (232 x 192 outside).
const START_ROOM = { x: 162, y: 1424 }; // door east, onto row 1
const END_ROOM = { x: C3.x + C3.w + SW, y: 96 }; // door west, onto the stub's sidewalk

// Where they come from: holes in the buildings, opening on the street.
const ALLEY1 = { x: 840, y: 1250, w: 96, h: 136 }; // row 1, north side
const DOOR2 = { x: 1460, y: 800, w: 72, h: 74 }; // row 2, north side: a doorway, right on your way
const ALLEY3 = { x: 2090, y: 228, w: 96, h: 134 }; // row 3, north side, near the far end

/** Everything you can walk on: the streets with their sidewalks, the holes, the rooms. */
const OPEN = [
  { x: S1.x, y: S1.y - SW, w: S1.w, h: S1.h + 2 * SW },
  { x: C1.x - SW, y: C1.y + SW, w: C1.w + 2 * SW, h: C1.h - 2 * SW },
  { x: S2.x, y: S2.y - SW, w: S2.w, h: S2.h + 2 * SW },
  { x: C2.x - SW, y: C2.y + SW, w: C2.w + 2 * SW, h: C2.h - 2 * SW },
  { x: S3.x, y: S3.y - SW, w: S3.w, h: S3.h + 2 * SW },
  { x: C3.x - SW, y: C3.y, w: C3.w + 2 * SW, h: C3.h - SW },
  { ...START_ROOM, w: 232, h: 192 },
  { ...END_ROOM, w: 232, h: 192 },
  ALLEY1, DOOR2, ALLEY3,
];

/**
 * Where the buildings stand, band by band down the map (each band split at
 * the streets that cross it, so a block's buildings are as deep as the block).
 */
const BUILT = [
  // North of row 3 (its alley); the end of the stub; east of the stub (the safe room).
  { x: 0, y: 0, w: C3.x - SW, h: S3.y - SW },
  { x: C3.x - SW, y: 0, w: C3.w + 2 * SW, h: C3.y },
  { x: C3.x + C3.w + SW, y: 0, w: PLAN_W - (C3.x + C3.w + SW), h: S3.y - SW },
  // Row 3's height, west and east of it.
  { x: 0, y: S3.y - SW, w: S3.x, h: S3.h + 2 * SW },
  { x: S3.x + S3.w, y: S3.y - SW, w: PLAN_W - (S3.x + S3.w), h: S3.h + 2 * SW },
  // Between rows 3 and 2: west of C2 (row 2's doorway), east of it.
  { x: 0, y: S3.y + S3.h + SW, w: C2.x - SW, h: S2.y - SW - (S3.y + S3.h + SW) },
  { x: C2.x + C2.w + SW, y: S3.y + S3.h + SW, w: PLAN_W - (C2.x + C2.w + SW), h: S2.y - SW - (S3.y + S3.h + SW) },
  // Row 2's height, west and east of it.
  { x: 0, y: S2.y - SW, w: S2.x, h: S2.h + 2 * SW },
  { x: S2.x + S2.w, y: S2.y - SW, w: PLAN_W - (S2.x + S2.w), h: S2.h + 2 * SW },
  // Between rows 2 and 1: west of C1 (row 1's alley), east of it.
  { x: S1.x, y: S2.y + S2.h + SW, w: C1.x - SW - S1.x, h: S1.y - SW - (S2.y + S2.h + SW) },
  { x: C1.x + C1.w + SW, y: S2.y + S2.h + SW, w: PLAN_W - (C1.x + C1.w + SW), h: S1.y - SW - (S2.y + S2.h + SW) },
  // Round the start room, from row 2's height to the bottom (one region: no strips above or below it).
  { x: 0, y: S2.y + S2.h + SW, w: S1.x, h: PLAN_H - (S2.y + S2.h + SW) },
  // Row 1's height, east of the row.
  { x: S1.x + S1.w, y: S1.y - SW, w: PLAN_W - (S1.x + S1.w), h: S1.h + 2 * SW },
  // South of row 1.
  { x: S1.x, y: S1.y + S1.h + SW, w: PLAN_W - S1.x, h: PLAN_H - (S1.y + S1.h + SW) },
  // The frame: the rest of the town, all round.
  { x: -FRAME.l, y: -FRAME.t, w: FRAME.l, h: PLAN_H + FRAME.t + FRAME.b },
  { x: PLAN_W, y: -FRAME.t, w: FRAME.r, h: PLAN_H + FRAME.t + FRAME.b },
  { x: 0, y: -FRAME.t, w: PLAN_W, h: FRAME.t },
  { x: 0, y: PLAN_H, w: PLAN_W, h: FRAME.b },
];

/** The ground under it all (cosmetic: sidewalk on the sides that face a street, lot colour inside). */
const BLOCKS = [
  // Down to row 3: west of it; north of it; the end of the stub; east of the stub (the safe room).
  { x: 0, y: 0, w: S3.x, h: S3.y, sides: '' },
  { x: S3.x, y: 0, w: C3.x - S3.x, h: S3.y, sides: 'br' },
  { x: C3.x, y: 0, w: C3.w, h: C3.y, sides: 'b' },
  { x: C3.x + C3.w, y: 0, w: PLAN_W - C3.x - C3.w, h: S3.y, sides: 'l', type: 'end' },
  // Row 3's height.
  { x: 0, y: S3.y, w: S3.x, h: S3.h, sides: '' },
  { x: S3.x + S3.w, y: S3.y, w: PLAN_W - S3.x - S3.w, h: S3.h, sides: '' },
  // C2's height: the doorway's block north of row 2, the block south of row 3.
  { x: 0, y: C2.y, w: S2.x, h: C2.h, sides: '' },
  { x: S2.x, y: C2.y, w: C2.x - S2.x, h: C2.h, sides: 'rb' },
  { x: C2.x + C2.w, y: C2.y, w: S3.x + S3.w - (C2.x + C2.w), h: C2.h, sides: 'lt' },
  { x: S3.x + S3.w, y: C2.y, w: PLAN_W - S3.x - S3.w, h: C2.h, sides: '' },
  // Row 2's height.
  { x: 0, y: S2.y, w: S2.x, h: S2.h, sides: '' },
  { x: S2.x + S2.w, y: S2.y, w: PLAN_W - S2.x - S2.w, h: S2.h, sides: '' },
  // C1's height: the alley's block north of row 1, the block south of row 2.
  { x: 0, y: C1.y, w: S1.x, h: C1.h, sides: '' },
  { x: S1.x, y: C1.y, w: C1.x - S1.x, h: C1.h, sides: 'rb' },
  { x: C1.x + C1.w, y: C1.y, w: S2.x + S2.w - (C1.x + C1.w), h: C1.h, sides: 'lt' },
  { x: S2.x + S2.w, y: C1.y, w: PLAN_W - S2.x - S2.w, h: C1.h, sides: '' },
  // Row 1's height: the start room's block, and east of the row.
  { x: 0, y: S1.y, w: S1.x, h: S1.h, sides: '', type: 'start' },
  { x: S1.x + S1.w, y: S1.y, w: PLAN_W - S1.x - S1.w, h: S1.h, sides: '' },
  // South of row 1.
  { x: 0, y: S1.y + S1.h, w: S1.x, h: PLAN_H - S1.y - S1.h, sides: '' },
  { x: S1.x, y: S1.y + S1.h, w: S1.w, h: PLAN_H - S1.y - S1.h, sides: 't' },
  { x: S1.x + S1.w, y: S1.y + S1.h, w: PLAN_W - S1.x - S1.w, h: PLAN_H - S1.y - S1.h, sides: '' },
  // The frame.
  { x: -FRAME.l, y: -FRAME.t, w: FRAME.l, h: PLAN_H + FRAME.t + FRAME.b, sides: '' },
  { x: PLAN_W, y: -FRAME.t, w: FRAME.r, h: PLAN_H + FRAME.t + FRAME.b, sides: '' },
  { x: 0, y: -FRAME.t, w: PLAN_W, h: FRAME.t, sides: '' },
  { x: 0, y: PLAN_H, w: PLAN_W, h: FRAME.b, sides: '' },
];

/** The only writing on the course: Ben, in his crayon, in the safe room at the end. */
export const DAY3_BEN = { x: END_ROOM.x + 116, y: 246, text: 'they scream before they jump.' };

export function generateTutorial3(seed = 1) {
  // Fixed dice: every player gets the same course, whatever the seed.
  const D = dice(0xda73);
  const obstacles = [];
  const pickups = [];
  const lamps = [];
  const decor = [];
  const glows = [];

  // --- The rooms -------------------------------------------------------------------------------
  const startRoom = safeRoom(obstacles, pickups, START_ROOM.x, START_ROOM.y, 'right', false);
  const endRoom = safeRoom(obstacles, pickups, END_ROOM.x, END_ROOM.y, 'left', true);
  const si = startRoom.interior;
  const start = { x: si.x + si.w / 2, y: si.y + si.h / 2 + 10 };

  // --- Buildings: everything that isn't open ground ---------------------------------------------
  cutBuildings(D, BUILT, OPEN, obstacles);

  // --- The gates ---------------------------------------------------------------------------------
  const g1 = gateLine(C1.x - SW, C1.x + C1.w + SW, 1256);
  const g2 = gateLine(C2.x - SW, C2.x + C2.w + SW, 744);
  const g3 = gateLine(C3.x - SW, C3.x + C3.w + SW, 296);
  for (const g of [g1, g2, g3]) obstacles.push(...g.walls, g.bars);

  // --- A medkit past the last gate, on the way to the safe room (the heal lesson) -----------------
  const medkit = { x: C3.x + C3.w / 2, y: 214 };
  pickups.push({ kind: 'medkit', ...medkit });

  // --- Light: lamps along the streets, a glow at every gate; the alleys and the doorway left dark ---
  streetLamps([S1, S2, S3], [C1, C2, C3], lamps);
  for (const g of [g1, g2, g3]) {
    glows.push({ x: g.x, y: g.y + 90, r: 210, k: 0.5 });
    glows.push({ x: g.x, y: g.y - 90, r: 170, k: 0.42 });
  }

  // --- Paint, a little clutter, and Ben's one line ----------------------------------------------
  const markings = { dashes: [], crosswalks: [], parking: [] };
  for (const [s, c] of [[S1, C1], [S2, C2], [S3, C3]]) markings.dashes.push({ x0: s.x + 60, y0: s.y + s.h / 2, x1: c.x - 20, y1: s.y + s.h / 2 });
  for (const c of [C1, C2, C3]) markings.dashes.push({ x0: c.x + c.w / 2, y0: c.y + 20, x1: c.x + c.w / 2, y1: c.y + c.h - 20 });
  streetClutter(D, [S1, S2, S3, C1, C2, C3], 16, decor);
  decor.push({ type: 'bentext', x: DAY3_BEN.x, y: DAY3_BEN.y, text: DAY3_BEN.text, size: 10, a: -0.03 });

  const map = {
    seed,
    w: TUT3_W,
    h: TUT3_H,
    obstacles,
    blocks: groundBlocks(BLOCKS, []),
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
    stashes: [],
    sealed: [],
    witches: [], // she won't be on by default: no Witch in the tutorials
    posters: [],
    dens: [],
    darknessBoost: -0.06, // night 3: a little lighter than the Streets, so a Hunter's tell reads
    wanderDensity: 0,
    tutorial: {
      day: 3,
      gates: { g1, g2, g3 },
      // Row 1: the first comes out of the back of the alley once you're out on the street.
      hunter1: { x: ALLEY1.x + ALLEY1.w / 2, y: ALLEY1.y + 34 },
      hunter1Walk: { x: 640, y: S1.y + S1.h / 2 }, // where the arrow takes you (it finds you before you're there)
      // Row 2: the doorway it jumps you from, and where you are when it does.
      door2: { x: DOOR2.x + DOOR2.w / 2, y: DOOR2.y + 30 },
      ambushWalk: { x: DOOR2.x + DOOR2.w / 2, y: S2.y + 80 },
      // Row 3: the last one, out of the alley near the far end.
      hunter3: { x: ALLEY3.x + ALLEY3.w / 2, y: ALLEY3.y + 34 },
      medkit,
    },
  };
  shiftMap(map, FRAME.l, FRAME.t, { one: ['hunter1', 'hunter1Walk', 'door2', 'ambushWalk', 'hunter3', 'medkit'], many: [] });
  border(obstacles, TUT3_W, TUT3_H);
  return map;
}

// Sanity for the editor: everything sits on the nav grid's 32 u cells where it matters.
if (TUT3_W % NAV_CELL || TUT3_H % NAV_CELL) throw new Error('tutorial 3 map must be whole nav cells');
