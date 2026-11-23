// Tutorial 2: Day 2, the supply run. Hand-built like Day 1, on the same plan
// and frame (world/tutorial-gen.js, whose helpers it shares), and the same on
// every device. The streets are Day 1's turned round, the start room bottom
// right and the safe room top left, and what's on them is what Day 1 left out:
//   - row 1: a supply crate at the door, and a trail of chalk arrows to a
//     second one in a yard off the street (gate 1 opens once you have it);
//   - row 2: a room with its door nailed shut. Break in (shove the boards),
//     deal with what comes out and with what the noise brings, and take the
//     better stash inside (gate 2);
//   - row 3: the Witch, crying on the near sidewalk. Keep to the far side and
//     your light off her (gate 3, then the safe room). A loose manhole down a
//     dead end on the far side is the secret, if you look.
// src/game/tutorial-day2.js has the lessons.
//
//   north
//   ┌──────────────────────────────────────┐
//   │ ███ C3 ┊[SAFE ROOM] ████████████████ │
//   │ ███ G3 ┴ ← ← (WITCH) ← ← ← ← S3 ┐ ██ │
//   │ ███ secret ███ [ROOM] ███████ G2 ┤ ██ │
//   │ ███ G1 ┬ → → → boards → → → S2 ┘ ██ │
//   │ ███████│ ██ [YARD] █████████████████ │
//   │ ███    └ ← chalk ← ← ← crate [START] │
//   │ ████████████████████████████████████ │
//   └──────────────────────────────────────┘
//
// Everything with a place in a lesson is in map.tutorial; the crates are
// ordinary stashes (game/loot.js), the room an ordinary boarded room and the
// Witch an ordinary Witch (game/witch.js), so they behave as they will on the
// Streets.

import { NAV_CELL } from './world.js';
import { ob, dice, safeRoom, border } from './gen-kit.js';
import { boardsFor } from './scavenge-gen.js';
import { PLAN_W, PLAN_H, FRAME, TUT_W, TUT_H, SW, ROOFS, gateLine, cutBuildings, groundBlocks, streetLamps, streetClutter, shiftMap } from './tutorial-gen.js';

// Streets, curb to curb.
const C1 = { dir: 'v', x: 192, y: 1120, w: 224, h: 288 }; // row 1 -> row 2, west end
const C2 = { dir: 'v', x: 1056, y: 608, w: 224, h: 288 }; // row 2 -> row 3, east end
const C3 = { dir: 'v', x: 192, y: 42, w: 224, h: 342 }; // row 3 -> the safe room, west end
const WEST = C1.x - SW; // where every street ends, at the west: the building line
const EAST = C2.x + C2.w + SW; // where rows 2 and 3 end, at the east
const DOOR_X = 1078; // row 1 starts at the start room's door
const S1 = { dir: 'h', x: WEST, y: 1408, w: DOOR_X - WEST, h: 224 };
const S2 = { dir: 'h', x: WEST, y: 896, w: EAST - WEST, h: 224 };
const S3 = { dir: 'h', x: WEST, y: 384, w: EAST - WEST, h: 224 };

// The safe rooms (232 x 192 outside; doors face west).
const START_ROOM = { x: DOOR_X, y: 1424 };
const END_ROOM = { x: C3.x + C3.w + SW, y: 96 }; // its door opens on the stub's sidewalk

// Holes in the buildings (rects you can walk in).
const YARD_WAY = { x: 640, y: 1290, w: 96, h: 96 }; // row 1, north side: the way into the yard
const YARD = { x: 504, y: 1200, w: 328, h: 90 }; // the yard behind it, its crate round the corner
const ROOM = { x: 600, y: 704, w: 224, h: 170 }; // row 2, north side: the boarded-up room, facade on the street
const DEAD_END = { x: 420, y: 630, w: 96, h: 124 }; // row 3, the far side: a dead end with a loose manhole

// The room's facade and doorway (as the Streets carve them: scavenge-gen.js).
const FACADE = NAV_CELL;
const DOOR_W = 74;
const BOARD_T = 14;

// Where she sits: row 3's near (north) sidewalk, half way along. The far
// sidewalk is out of her space (170) and out of the way of your light.
const SEAT = { x: 700, y: 378, face: 1.9 };

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
  YARD_WAY, YARD, ROOM, DEAD_END,
];

/** Where the buildings stand: Day 1's regions, turned round. */
const BUILT = [
  { x: C3.x + C3.w + SW, y: 0, w: PLAN_W - (C3.x + C3.w + SW), h: S3.y - SW }, // north of row 3 (the safe room)
  { x: C3.x - SW, y: 0, w: C3.w + 2 * SW, h: C3.y }, // the end of the stub to the safe room
  { x: 0, y: 0, w: WEST, h: PLAN_H }, // the west edge
  { x: EAST, y: S3.y - SW, w: PLAN_W - EAST, h: S2.y + S2.h + SW - (S3.y - SW) }, // the east edge
  { x: WEST, y: S3.y + S3.h + SW, w: C2.x - SW - WEST, h: S2.y - SW - (S3.y + S3.h + SW) }, // between rows 3 and 2 (the room, the dead end)
  { x: C1.x + C1.w + SW, y: S2.y + S2.h + SW, w: DOOR_X - (C1.x + C1.w + SW), h: S1.y - SW - (S2.y + S2.h + SW) }, // between rows 2 and 1 (the yard)
  { x: DOOR_X, y: S2.y + S2.h + SW, w: PLAN_W - DOOR_X, h: PLAN_H - (S2.y + S2.h + SW) }, // around the start room
  { x: WEST, y: S1.y + S1.h + SW, w: DOOR_X - WEST, h: PLAN_H - (S1.y + S1.h + SW) }, // south of row 1
  // The frame: the rest of the town, all round.
  { x: -FRAME.l, y: -FRAME.t, w: FRAME.l, h: PLAN_H + FRAME.t + FRAME.b },
  { x: PLAN_W, y: -FRAME.t, w: FRAME.r, h: PLAN_H + FRAME.t + FRAME.b },
  { x: 0, y: -FRAME.t, w: PLAN_W, h: FRAME.t },
  { x: 0, y: PLAN_H, w: PLAN_W, h: FRAME.b },
];

/** The ground under it all (cosmetic: sidewalk + lot colour). */
const BLOCKS = [
  { x: C3.x + C3.w, y: 0, w: PLAN_W - C3.x - C3.w, h: S3.y, sides: 'bl', type: 'end' },
  { x: 0, y: 0, w: C3.x, h: S3.y, sides: 'rb' },
  { x: C3.x, y: 0, w: C3.w, h: C3.y, sides: 'b' },
  { x: C2.x + C2.w, y: C2.y, w: PLAN_W - C2.x - C2.w, h: C2.h, sides: 'tbl' },
  { x: 0, y: C2.y, w: C2.x, h: C2.h, sides: 'tbr' },
  { x: C1.x + C1.w, y: C1.y, w: PLAN_W - C1.x - C1.w, h: C1.h, sides: 'tbl' },
  { x: 0, y: C1.y, w: C1.x, h: C1.h, sides: 'tbr' },
  { x: S1.x + S1.w, y: S1.y, w: PLAN_W - S1.x - S1.w, h: S1.h, sides: '', type: 'start' },
  { x: 0, y: S1.y + S1.h, w: PLAN_W, h: PLAN_H - S1.y - S1.h, sides: 't' },
  { x: -FRAME.l, y: -FRAME.t, w: FRAME.l, h: PLAN_H + FRAME.t + FRAME.b, sides: '' },
  { x: PLAN_W, y: -FRAME.t, w: FRAME.r, h: PLAN_H + FRAME.t + FRAME.b, sides: '' },
  { x: 0, y: -FRAME.t, w: PLAN_W, h: FRAME.t, sides: '' },
  { x: 0, y: PLAN_H, w: PLAN_W, h: FRAME.b, sides: '' },
];

// The yard is a little lot behind the buildings.
const LOTS = [{ ...YARD, type: 'parking' }];

/**
 * The squad's writing for day 2 (no line runs into another: tests). Most of
 * it is on the far side of the street, where you'll be walking.
 */
export const DAY2_WALLS = [
  // The start room.
  { x: DOOR_X + 116, y: 1470, text: 'DAY 2. SUPPLY RUN.', size: 12, color: '#e8e8e0' },
  { x: DOOR_X + 116, y: 1574, text: 'LOOK OFF THE WAY. — ODILE', size: 11, color: '#9fd8ff' },
  // Row 1: the chalk, and the yard.
  { x: 860, y: 1428, text: 'FOLLOW THE CHALK. — TEO', size: 12, color: '#f2c94c' },
  { x: 700, y: 1218, text: "TEO'S. HANDS OFF.", size: 11, color: '#f2c94c' },
  // Row 2: across from the nailed door, and the oldest argument going.
  { x: ROOM.x + ROOM.w / 2, y: 1088, text: 'NAILED SHUT = SOMETHING INSIDE', size: 13, color: '#e8e8e0' },
  { x: ROOM.x + ROOM.w / 2, y: 1106, text: 'BOTH KINDS OF SOMETHING. — MAGS', size: 11, color: '#9fd8ff' },
  { x: 420, y: 922, text: 'MAGS OWES ME A CAN OF PEACHES — TEO', size: 11, color: '#f2c94c' },
  // Row 3: on the far side, where you'll be walking.
  { x: 960, y: 590, text: "IF SHE'S CRYING, LET HER CRY", size: 13, color: '#cdbfe6' },
  { x: 560, y: 592, text: 'FAR SIDE. LIGHT OFF HER. — ODILE', size: 11, color: '#9fd8ff' },
  // The safe room.
  { x: END_ROOM.x + 116, y: 230, text: 'DAY 2: DONE. — ODILE', size: 11, color: '#e8e8e0' },
  { x: END_ROOM.x + 116, y: 246, text: 'TOMORROW: NO GATES. — LOU', size: 11, color: '#f2c94c' },
];

/** Ben's turn (day 1 he wrote "my turn tomorrow."): one line at each end, in his crayon. */
export const DAY2_BEN = [
  { x: DOOR_X + 116, y: 1590, text: 'my turn.' },
  { x: END_ROOM.x + 116, y: 262, text: 'i was quiet too.' },
];

export function generateTutorial2(seed = 1) {
  // Fixed dice: every player gets the same course, whatever the seed.
  const D = dice(0xda72);
  const obstacles = [];
  const pickups = [];
  const lamps = [];
  const decor = [];
  const glows = [];

  // --- The rooms -------------------------------------------------------------------------------
  const startRoom = safeRoom(obstacles, pickups, START_ROOM.x, START_ROOM.y, 'left', false);
  const endRoom = safeRoom(obstacles, pickups, END_ROOM.x, END_ROOM.y, 'left', true);
  const si = startRoom.interior;
  const start = { x: si.x + si.w / 2, y: si.y + si.h / 2 + 10 };

  // --- Buildings: everything that isn't open ground ---------------------------------------------
  cutBuildings(D, BUILT, OPEN, obstacles);

  // --- Row 2: the boarded-up room. Its facade on the street, with a doorway and boards across it -----
  const roof = D.pick(ROOFS);
  const fy = ROOM.y + ROOM.h - FACADE;
  const d0 = ROOM.x + (ROOM.w - DOOR_W) / 2;
  const facade = (x, w) => obstacles.push(ob('wall', x, fy, w, FACADE, { color: roof, facade: true }));
  facade(ROOM.x, d0 - ROOM.x);
  facade(d0 + DOOR_W, ROOM.x + ROOM.w - (d0 + DOOR_W));
  const door = { x: d0, y: fy, w: DOOR_W, h: FACADE };
  const boards = boardsFor({ x: d0, y: fy + FACADE - BOARD_T, w: DOOR_W, h: BOARD_T }, false);
  obstacles.push(boards);
  const inner = { x: ROOM.x, y: ROOM.y, w: ROOM.w, h: ROOM.h - FACADE };
  const floors = [{ ...door, type: 'boarded' }, { ...inner, type: 'boarded' }];
  // The better stash against the back wall, and three shut in with it.
  const roomCrate = { id: 3, tier: 'room', x: d0 + DOOR_W / 2, y: inner.y + 28, loot: ['extmags'], room: 0, a: -0.06 };
  const room = {
    interior: inner,
    door,
    boards,
    outside: { x: d0 + DOOR_W / 2, y: ROOM.y + ROOM.h + 44 },
    normal: { x: 0, y: 1 },
    stash: { x: roomCrate.x, y: roomCrate.y },
    sleepers: [
      { x: inner.x + 40, y: inner.y + 86 },
      { x: inner.x + inner.w - 40, y: inner.y + 76 },
      { x: d0 + DOOR_W / 2 + 6, y: inner.y + 104 },
    ],
    open: false,
  };
  boards.sealed = room;

  // --- Row 1: a crate at the door, and chalk to the one in the yard ------------------------------------
  const doorCrate = { id: 1, tier: 'stash', x: DOOR_X - 96, y: 1520, loot: ['armor'], a: 0.1 };
  const yardCrate = { id: 2, tier: 'stash', x: YARD.x + 40, y: YARD.y + 40, loot: ['hot'], a: -0.12 };
  // Survivor chalk: each arrow points at the next, the last at the crate.
  const trail = [
    { x: 880, y: 1470 }, // on the street, just past the door crate
    { x: YARD_WAY.x + YARD_WAY.w / 2, y: 1440 }, // by the way in
    { x: YARD_WAY.x + YARD_WAY.w / 2, y: 1322 }, // in it
    { x: 616, y: 1246 }, // round the corner
  ];
  trail.forEach((q, i) => {
    const n = trail[i + 1] || yardCrate;
    decor.push({ type: 'chalk', x: q.x, y: q.y, a: Math.atan2(n.y - q.y, n.x - q.x), sym: 'stash', s: 1 });
  });
  // The yard's bins, at the far end from its crate (and out of the way in).
  obstacles.push(ob('dumpster', YARD.x + YARD.w - 74, YARD.y + 8, 62, 34, { color: '#2f4f3a' }));
  obstacles.push(ob('crate', YARD.x + YARD.w - 46, YARD.y + 50, 34, 34));
  decor.push({ type: 'trash', x: YARD.x + YARD.w - 110, y: YARD.y + 30, s: 1.1 });

  // --- Row 3: the secret down the dead end on the far side (and two little eyes on it) ----------------
  const secret = { id: 4, tier: 'secret', x: DEAD_END.x + DEAD_END.w / 2, y: DEAD_END.y + DEAD_END.h - 30, loot: ['vitality', 'armorbig', 'hotbig'], look: 'manhole', a: 0.5 };
  const ey = { x: DEAD_END.x + 20, y: DEAD_END.y + 36 };
  decor.push({ type: 'beneyes', x: ey.x, y: ey.y, look: Math.atan2(secret.y - ey.y, secret.x - ey.x), s: 0.9 });

  // --- The gates ---------------------------------------------------------------------------------
  const g1 = gateLine(C1.x - SW, C1.x + C1.w + SW, 1256);
  const g2 = gateLine(C2.x - SW, C2.x + C2.w + SW, 744);
  const g3 = gateLine(C3.x - SW, C3.x + C3.w + SW, 296);
  for (const g of [g1, g2, g3]) obstacles.push(...g.walls, g.bars);

  // --- Cars (no alarms today), a medkit for after the fight, and the way to go ---------------------
  obstacles.push(ob('car', 260, 1582, 86, 44, { color: '#6b6b6b', vertical: false, front: 1 }));
  obstacles.push(ob('car', 1150, 1064, 86, 44, { color: '#7a3b32', vertical: false, front: -1 }));
  pickups.push({ kind: 'medkit', x: 960, y: 1131 });
  decor.push({ type: 'spray', x: 950, y: 1598, text: 'THIS WAY', color: '#e8e8e0', a: Math.PI, s: 0.9 });

  // --- Light: lamps along the streets (none near her: her phone is the light there), glows at the gates --
  const nearHer = (l) => Math.hypot(l.x - SEAT.x, l.y - SEAT.y) < 240;
  streetLamps([S1, S2, S3], [C1, C2, C3], lamps, nearHer);
  for (const g of [g1, g2, g3]) {
    glows.push({ x: g.x, y: g.y + 90, r: 210, k: 0.5 });
    glows.push({ x: g.x, y: g.y - 90, r: 170, k: 0.42 });
  }
  glows.push({ x: yardCrate.x + 40, y: yardCrate.y + 4, r: 130, k: 0.34 }); // a bulb over the yard
  glows.push({ x: d0 + DOOR_W / 2, y: ROOM.y + ROOM.h + 36, r: 160, k: 0.42 }); // and one over the nailed door

  // --- Paint, clutter and the squad's writing --------------------------------------------------
  const markings = { dashes: [], crosswalks: [], parking: [] };
  for (const s of [S1, S2, S3]) markings.dashes.push({ x0: s.x + 60, y0: s.y + s.h / 2, x1: Math.min(s.x + s.w, C2.x) - 20, y1: s.y + s.h / 2 });
  for (const c of [C1, C2, C3]) markings.dashes.push({ x0: c.x + c.w / 2, y0: c.y + 20, x1: c.x + c.w / 2, y1: c.y + c.h - 20 });
  streetClutter(D, [S1, S2, S3, S1, S2, S3, C1, C2, C3], 48, decor);
  for (const w of DAY2_WALLS) decor.push({ type: 'graffiti', x: w.x, y: w.y, text: w.text, color: w.color, size: w.size, a: w.a || 0, drip: false, marker: w.size < 13 });
  for (const b of DAY2_BEN) decor.push({ type: 'bentext', x: b.x, y: b.y, text: b.text, size: 10, a: -0.03 });

  const map = {
    seed,
    w: TUT_W,
    h: TUT_H,
    obstacles,
    blocks: groundBlocks(BLOCKS, LOTS),
    // Copies: the map gets moved into its frame, the plan stays as it is.
    streets: [S1, S2, S3, C1, C2, C3].map((s) => ({ ...s })),
    intersections: [],
    markings,
    lamps,
    pickups,
    decor,
    fires: [],
    glows,
    floors,
    start,
    startFacing: Math.PI, // looking down the first street, out of the door (west)
    startRoom,
    endRoom,
    stashes: [doorCrate, yardCrate, roomCrate, secret],
    sealed: [room],
    witches: [{ x: SEAT.x, y: SEAT.y, face: SEAT.face }],
    posters: [],
    dens: [],
    darknessBoost: 0, // night 2: as dark as the nights to come
    wanderDensity: 0,
    tutorial: {
      day: 2,
      crates: { door: doorCrate.id, yard: yardCrate.id, room: roomCrate.id, secret: secret.id },
      gates: { g1, g2, g3 },
      boards,
      room: { ...inner },
      seat: { x: SEAT.x, y: SEAT.y },
      // Past her on the far side: where the lesson points you.
      farSide: { x: C3.x + C3.w / 2 + 26, y: S3.y + S3.h - 12, r: 44 },
      // What the noise brings when the boards come down: down row 2 from the far
      // end (round the corner before gate 2), or else up through gate 1.
      companySpawns: [
        [
          { x: C2.x + 54, y: 800 },
          { x: C2.x + C2.w - 54, y: 800 },
        ],
        [
          { x: C1.x + 58, y: 1520 },
          { x: C1.x + C1.w - 58, y: 1520 },
        ],
      ],
    },
  };
  shiftMap(map, FRAME.l, FRAME.t, { one: ['room', 'seat', 'farSide'], many: ['companySpawns'] });
  border(obstacles, TUT_W, TUT_H);
  return map;
}
