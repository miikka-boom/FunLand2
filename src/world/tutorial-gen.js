// The three tutorial lessons' maps, built by hand (no randomness: every
// player gets the same streets). Each is a short stretch of Center City at
// night: a safe room to start in, a few blocks, and a safe room at the end
// whose doorway stays shut (a gate across it) until the lesson's last step.
//
// Every map reads left to right, so on a phone held sideways the way on runs
// across the long side of the screen. Besides the usual map fields each has
// `tutorial`: the lesson number and the named places the lesson script uses
// (game/tutorial.js): rings to walk through, where zombies come from, the
// pen, the stash, the alarm car, the Witch's seat.

import { ob, safeRoom, border } from './gen-kit.js';

const SIDEWALK = 22;
const ROOFS = ['#3d4148', '#4a4540', '#3a4446', '#47423f', '#3f3b45', '#434a4f', '#4b4744'];
const CARS = ['#6d2e2e', '#2e4a6d', '#6b6b6b', '#3f5f3a', '#8a7b52', '#4a3a5c', '#7a4a22'];

// Every lesson is padded with a ring of city blocks on all sides, so the
// camera (it shows about 1000 x 470 units on a phone held sideways) never
// looks past the edge of the map, even from inside the safe rooms at the ends.
const PAD = { l: 480, t: 240, r: 440, b: 240 };

/** Move every point of the map (anything with x/y, x0/y0, x1/y1), once each. */
function shiftMap(m, dx, dy) {
  const seen = new Set();
  const visit = (o) => {
    if (!o || typeof o !== 'object' || seen.has(o)) return;
    seen.add(o);
    if (Array.isArray(o)) {
      for (const v of o) visit(v);
      return;
    }
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'number') {
        if (k === 'x' || k === 'x0' || k === 'x1') o[k] = v + dx;
        else if (k === 'y' || k === 'y0' || k === 'y1') o[k] = v + dy;
      } else if (v && typeof v === 'object') visit(v);
    }
  };
  for (const k of ['obstacles', 'blocks', 'streets', 'intersections', 'markings', 'lamps', 'pickups', 'decor', 'fires', 'stashes', 'startRoom', 'endRoom', 'start', 'tutorial']) visit(m[k]);
}

/** A small kit for laying out a map by hand. */
function kit(W, H, lesson) {
  const m = {
    seed: 900 + lesson,
    w: W,
    h: H,
    theme: 'tutorial', // drawn like the streets; nothing random is added to it
    obstacles: [],
    blocks: [],
    streets: [],
    intersections: [],
    markings: { dashes: [], crosswalks: [], parking: [] },
    lamps: [],
    pickups: [],
    decor: [],
    fires: [],
    witches: [],
    stashes: [],
    sealed: [],
    // A touch lighter than the real nights: new players should see what they're told about.
    darknessBoost: -0.14,
    wanderDensity: 0,
  };
  let n = 0;
  const K = {
    map: m,
    /** A city block: sidewalk all round, `type` paints the inside (buildings, parking, park, plaza, construction). */
    block(x, y, w, h, type = 'buildings') {
      const inner = { x: x + SIDEWALK, y: y + SIDEWALK, w: w - 2 * SIDEWALK, h: h - 2 * SIDEWALK };
      const b = { x, y, w, h, inner, type, i: n++, j: 0 };
      m.blocks.push(b);
      return b;
    },
    street(x, y, w, h, dir) {
      m.streets.push({ dir, x, y, w, h });
      if (dir === 'h') m.markings.dashes.push({ x0: x, y0: y + h / 2, x1: x + w, y1: y + h / 2 });
      else m.markings.dashes.push({ x0: x + w / 2, y0: y, x1: x + w / 2, y1: y + h });
    },
    building(x, y, w, h, extra = {}) {
      const k = m.obstacles.length;
      const o = ob('building', x, y, w, h, { color: ROOFS[(k * 5) % ROOFS.length], vents: (k % 3) + 1, seed: 1000 + k * 37, ...extra });
      m.obstacles.push(o);
      return o;
    },
    wall(x, y, w, h, extra = {}) {
      const o = ob('wall', x, y, w, h, { color: '#5b5852', ...extra });
      m.obstacles.push(o);
      return o;
    },
    car(x, y, vertical, extra = {}) {
      const o = ob('car', x, y, vertical ? 44 : 86, vertical ? 86 : 44, { color: CARS[(m.obstacles.length * 3) % CARS.length], vertical, front: 1, ...extra });
      m.obstacles.push(o);
      return o;
    },
    prop(kind, x, y, w, h, extra = {}) {
      const o = ob(kind, x, y, w, h, extra);
      m.obstacles.push(o);
      return o;
    },
    lamp(x, y, extra = {}) {
      m.lamps.push({ x, y, ...extra });
    },
    /** Spray paint (or marker) on the ground; the lore renderer draws it. */
    spray(x, y, text, color = '#efe9d6', size = 18, a = 0, marker = false) {
      m.decor.push({ type: 'graffiti', x, y, text, color, size, a, drip: false, marker });
    },
    /** A survivor's chalk arrow (pointing along a) with a crate scribbled at its tail. */
    chalk(x, y, a, sym = 'stash') {
      m.decor.push({ type: 'chalk', x, y, a, sym, s: 1 });
    },
    clutter(list) {
      for (const [type, x, y, s = 1, a = 0] of list) m.decor.push({ type, x, y, s, a });
    },
    startRoom(x, y, side) {
      const room = safeRoom(m.obstacles, m.pickups, x, y, side, false);
      m.startRoom = room;
      m.start = { x: room.interior.x + room.interior.w / 2, y: room.interior.y + room.interior.h / 2 + 10 };
      return room;
    },
    /**
     * The safe room at the end, its doorway shut by a gate until the lesson
     * opens it (navOpen: the arrow and the walking distance still see the way in).
     */
    endRoom(x, y, side) {
      const room = safeRoom(m.obstacles, m.pickups, x, y, side, true);
      const d = room.door;
      const gate = ob('gate', d.x + (side === 'left' ? -6 : 6), d.y, d.w, d.h, { move: true, shot: false, sight: false, navOpen: true, opens: true, tutorialGate: true });
      m.obstacles.push(gate);
      m.endRoom = room;
      return { room, gate };
    },
    /** Buildings over a rect, split along its long side (alleys between), on a block of sidewalk. */
    fill(x, y, w, h) {
      const b = K.block(x, y, w, h);
      const i = b.inner;
      const along = i.w >= i.h;
      const len = along ? i.w : i.h;
      const n = Math.max(1, Math.round(len / 460));
      const gap = 64;
      const piece = (len - gap * (n - 1)) / n;
      for (let k = 0; k < n; k++) {
        const a = k * (piece + gap);
        if (along) K.building(i.x + a, i.y, piece, i.h);
        else K.building(i.x, i.y + a, i.w, piece);
      }
    },
    /** Shift the lesson inward and wrap it in city blocks (see PAD). */
    finish() {
      const { l, t, r, b } = PAD;
      shiftMap(m, l, t);
      m.w = W + l + r;
      m.h = H + t + b;
      K.fill(0, 0, l, m.h);
      K.fill(l + W, 0, r, m.h);
      K.fill(l, 0, W, t);
      K.fill(l, t + H, W, b);
      border(m.obstacles, m.w, m.h);
      return m;
    },
  };
  return K;
}

/** Buildings filling a block's inside, split along x at the given fractions (alleys between). */
function rowOfBuildings(K, b, cuts = [], alley = 70) {
  const i = b.inner;
  const xs = [i.x, ...cuts.map((f) => i.x + i.w * f), i.x + i.w];
  for (let k = 0; k < xs.length - 1; k++) {
    const x0 = xs[k] + (k > 0 ? alley / 2 : 0);
    const x1 = xs[k + 1] - (k < xs.length - 2 ? alley / 2 : 0);
    if (x1 - x0 > 60) K.building(x0, i.y, x1 - x0, i.h);
  }
}

/** Street lamps along a horizontal street, alternating sides. */
function lampsAlong(K, x0, x1, yTop, yBottom, step = 300, first = 0) {
  let side = first;
  for (let x = x0; x <= x1; x += step) {
    K.lamp(x, side ? yBottom + 6 : yTop - 6);
    side ^= 1;
  }
}

// --- Lesson 1: Move & shoot -------------------------------------------------------------------
//
//   start room ── three rings (walk) ── the pen (aim, then fire) ── walkers up the street ── end room
//
// One street, west to east. Part way along, the street is walled off with
// sandbags from building to building, twice: the pen between them holds
// three zombies. Sandbags stop bodies, not bullets (you shoot over them), so
// the first shots you ever fire are safe ones. The pen is ahead of you, not
// above you: on a phone held sideways the room is left and right of you, and
// the coach's panel sits over the top of the screen.

export function lesson1() {
  const W = 2500;
  const H = 1160;
  const K = kit(W, H, 1);
  const S0 = 460; // the street: y from S0 to S1
  const S1 = 740;
  const yMid = (S0 + S1) / 2;
  K.street(0, S0, W, S1 - S0, 'h');

  // Both sides: rows of buildings (no alley opens onto the pen).
  rowOfBuildings(K, K.block(0, 0, 1100, S0), [0.36, 0.7]);
  rowOfBuildings(K, K.block(1100, 0, 1400, S0), [0.6]);
  rowOfBuildings(K, K.block(0, S1, 1300, H - S1), [0.5]);
  rowOfBuildings(K, K.block(1300, S1, 1200, H - S1), [0.55]);

  // The pen: two sandbag walls across the street, face to face of the buildings. The
  // middle stretch of each is pulled aside when the pen is empty (navOpen: zombies
  // inside press against it, and the arrow sees the way on).
  const top = S0 - SIDEWALK; // the buildings' faces
  const bot = S1 + SIDEWALK;
  const gy0 = yMid - 50;
  const gy1 = yMid + 50;
  const t = 20;
  const low = { move: true, shot: false, sight: false };
  const pen = { x: 1500, y: top, w: 240, h: bot - top };
  const gates = [];
  for (const fx of [pen.x, pen.x + pen.w - t]) {
    K.prop('sandbag', fx, top, t, gy0 - top, low);
    K.prop('sandbag', fx, gy1, t, bot - gy1, low);
    gates.push(K.prop('sandbag', fx, gy0, t, gy1 - gy0, { ...low, navOpen: true, opens: true }));
  }
  K.lamp(pen.x - 40, S1 + 6);
  K.prop('barrel', pen.x + 40, top + 18, 26, 26);
  K.prop('crate', pen.x + pen.w - 70, bot - 52, 34, 34);
  K.spray(pen.x - 120, yMid + 112, "TEO'S PEN", '#ff8f5a', 20, -0.04);
  K.spray(pen.x - 120, yMid + 136, "(DON'T FEED THEM)", '#efe9d6', 12, -0.04, true);

  // The street: cars to steer round, lamps, clutter.
  K.car(560, S0 + 30, false);
  K.car(830, S1 - 74, false);
  K.car(1900, S0 + 34, false);
  K.car(2080, S1 - 76, false, { color: '#3f5f3a' });
  lampsAlong(K, 330, 2300, S0, S1, 320);
  K.clutter([['puddle', 700, 640, 1.3, 0.3], ['trash', 980, 520], ['crack', 1300, 700, 1.4], ['trash', 1780, 690], ['puddle', 1990, 560, 1.1, 2], ['leaves', 440, 520, 1.2]]);

  const start = K.startRoom(40, 504, 'right');
  const { gate } = K.endRoom(W - 272, 504, 'left');
  K.spray(start.interior.x + start.interior.w / 2, start.interior.y + start.interior.h - 24, 'DAY 1. PRACTICE.', '#efe9d6', 15, 0, true);
  K.spray(W - 470, S1 - 34, 'SAFE ROOM →', '#7dffa1', 18, 0);

  K.map.tutorial = {
    lesson: 1,
    rings: [
      { x: 420, y: yMid, r: 46 },
      { x: 700, y: S0 + 76, r: 46 },
      { x: 960, y: S1 - 70, r: 46 },
    ],
    aimSpot: { x: 1320, y: yMid, r: 54 }, // where you stand to aim at the pen: it's just ahead, to the right
    pen: { ...pen, sleepers: [{ x: 1590, y: yMid - 70 }, { x: 1630, y: yMid + 20 }, { x: 1670, y: yMid + 90 }] },
    penGates: gates,
    // The walkers come up the street from the east, beyond the pen, out of sight.
    walkers: [{ x: 1880, y: yMid - 50 }, { x: 1950, y: yMid + 50 }, { x: 2010, y: yMid - 10 }, { x: 2000, y: yMid - 80 }, { x: 2060, y: yMid + 70 }],
    gate,
  };
  return K.finish();
}

// --- Lesson 2: Shove & reload -----------------------------------------------------------------
//
//   start room ── a narrow alley (shove one, then two) ── the yard (reload, swap, a crowd) ── end room
//
// The alley is narrow, so they can only come at you from the front: the
// first zombie you meet up close comes alone, and time slows as it reaches.

export function lesson2() {
  const W = 2500;
  const H = 1240;
  const K = kit(W, H, 2);
  const A0 = 540; // the alley: y from A0 to A1
  const A1 = 710;
  const yMid = (A0 + A1) / 2;

  // West: the block the start room is set into.
  K.block(0, 0, 300, H);
  K.building(22, 22, 260, 486);
  K.building(22, 742, 260, H - 22 - 742);
  // The alley between two long buildings.
  K.block(300, 0, 880, A0);
  K.block(300, A1, 880, H - A1);
  K.building(300, 22, 860, A0 - 22);
  K.building(300, A1, 860, H - 22 - A1);
  K.wall(272, 508, 28, A0 - 508, { color: '#4f4a44' });
  K.wall(272, A1, 28, 742 - A1, { color: '#4f4a44' });

  // The yard: an open lot east of the alley.
  K.block(1160, 120, 900, 1000, 'construction');
  K.block(1160, 0, 1340, 120);
  K.block(1160, 1120, 1340, 120);
  K.block(2060, 120, 440, 1000);
  K.building(1160, 22, 1318, 96);
  K.building(1160, 1122, 1318, 96);
  // East of the yard: buildings, with the end room set into them.
  K.building(2082, 120, 396, 400);
  K.building(2082, 730, 396, 390);
  K.wall(2060, 120, 22, 409, { color: '#4f4a44' });
  K.wall(2060, 721, 22, 399, { color: '#4f4a44' });
  // The yard's clutter: crates and pipes to move round, a dumpster, barrels.
  K.prop('crate', 1420, 300, 34, 34);
  K.prop('crate', 1456, 300, 34, 34);
  K.prop('crate', 1720, 900, 34, 34);
  K.prop('crate', 1310, 900, 34, 34);
  K.prop('crate', 1310, 936, 34, 34);
  K.prop('crate', 1600, 210, 130, 22, { pipe: true });
  K.prop('crate', 1880, 820, 22, 130, { pipe: true });
  K.prop('dumpster', 1900, 250, 62, 34, { color: '#6b5a2a' });
  K.prop('barrel', 1650, 430, 26, 26);
  K.prop('barrel', 1682, 444, 26, 26);

  K.lamp(560, A0 + 8);
  K.lamp(940, A1 - 8);
  for (const [x, y] of [[1330, 220], [1920, 420], [1370, 800], [1930, 1000]]) K.lamp(x, y, { r: 240, k: 0.62 });
  K.clutter([['trash', 420, 610], ['puddle', 760, 640, 1.2, 0.2], ['papers', 980, 600], ['crack', 640, 600, 1.2], ['puddle', 1500, 640, 1.4, 1], ['trash', 1760, 560], ['leaves', 1600, 980, 1.3]]);

  const start = K.startRoom(40, 529, 'right');
  const { gate } = K.endRoom(2060, 529, 'left');
  K.spray(start.interior.x + start.interior.w / 2, start.interior.y + start.interior.h - 24, 'SHOVE FIRST. ASK NEVER.', '#efe9d6', 13, 0, true);
  K.spray(780, A0 + 30, 'TOO CLOSE? SHOVE.', '#ff8f5a', 16, 0.03);
  K.spray(1560, 1030, 'LOU: 40 KILLS', '#7fb2ff', 16, -0.04);
  K.spray(1560, 1054, '(MAYBE 4)', '#efe9d6', 12, -0.04, true);
  K.map.pickups.push({ kind: 'medkit', x: 1800, y: yMid - 80 });

  K.map.tutorial = {
    lesson: 2,
    meet: { x: 560, y: yMid, r: 50 }, // a little way into the alley
    first: [{ x: 1220, y: yMid }], // round the corner at the alley's far end
    pair: [{ x: 1240, y: yMid - 40 }, { x: 1290, y: yMid + 40 }],
    yardIn: { x: 1360, y: yMid, r: 60 }, // out into the yard
    // Where the crowd can come from: the yard's mouth when you're down the alley, its far corners when you're out in it.
    crowd: [{ x: 1250, y: yMid - 40 }, { x: 1250, y: yMid + 40 }, { x: 1330, y: yMid }, { x: 1700, y: 300 }, { x: 1700, y: 960 }, { x: 1980, y: 200 }, { x: 1980, y: 1050 }, { x: 1600, y: 1060 }],
    gate,
  };
  return K.finish();
}

// --- Lesson 3: First run ----------------------------------------------------------------------
//
//   start room ── street A east (supplies up an alley; two zombies by an alarm car) ── street B
//   north, past the Witch in the plaza ── street C east (a horde) ── end room
//
// A real run in miniature, with what a first run throws at you explained as
// it comes: the green arrow, supplies, alarm cars, the Witch, a horde.

export function lesson3() {
  const W = 2900;
  const H = 1800;
  const K = kit(W, H, 3);
  const A0 = 1300; // street A (south, east-west)
  const A1 = 1560;
  const B0 = 1660; // street B (north-south)
  const B1 = 1920;
  const C0 = 300; // street C (north, east-west)
  const C1 = 560;
  const yA = (A0 + A1) / 2;
  const yC = (C0 + C1) / 2;
  const xB = (B0 + B1) / 2;
  K.street(0, A0, B1, A1 - A0, 'h');
  K.street(B0, C0, B1 - B0, A1 - C0, 'v');
  K.street(B0, C0, W - B0, C1 - C0, 'h');
  const M = K.map.markings;
  K.map.intersections.push({ x: B0, y: A0, w: B1 - B0, h: A1 - A0 }, { x: B0, y: C0, w: B1 - B0, h: C1 - C0 });
  M.crosswalks.push({ x: B0 - 22, y: A0, w: 26, h: A1 - A0, dir: 'v' }, { x: B0, y: A0 - 22, w: B1 - B0, h: 26, dir: 'h' });
  M.crosswalks.push({ x: B1 - 4, y: C0, w: 26, h: C1 - C0, dir: 'v' }, { x: B0, y: C1 - 4, w: B1 - B0, h: 26, dir: 'h' });

  // South of street A.
  rowOfBuildings(K, K.block(0, A1, B1, H - A1), [0.3, 0.62]);
  // North of street A, west of street B: a big block with an alley up to a courtyard (the supplies).
  K.block(0, 0, B0, A0);
  K.building(22, 22, 638, A0 - 44); // x 22..660
  K.building(660, 22, B0 - 22 - 660, 838); // x 660..1638, y 22..860
  K.building(750, 1000, B0 - 22 - 750, A0 - 22 - 1000); // x 750..1638, y 1000..1278
  K.building(1150, 860, B0 - 22 - 1150, 140); // closes the courtyard's east end
  const stash = { x: 980, y: 930 };
  K.prop('dumpster', 1060, 870, 62, 34, { color: '#3a3f5a' });
  K.prop('crate', 700, 870, 34, 34);
  // North of street C.
  rowOfBuildings(K, K.block(B0, 0, W - B0, C0), [0.45]);
  // East of street B, south of street C: the plaza (the Witch), buildings beyond.
  const plaza = K.block(B1, C1, W - B1, H - C1, 'plaza');
  K.building(2420, C1 + 22, W - 22 - 2420, H - C1 - 44);
  K.building(B1 + 22, 1320, 2420 - B1 - 22, H - 22 - 1320);
  K.prop('statue', 2180, 1060, 40, 40);
  for (const [px, py] of [[2040, 700], [2300, 700], [2300, 1220], [2080, 1240]]) K.prop('planter', px, py, 40, 40);
  K.prop('bench', 2150, 820, 52, 16);
  K.prop('bench', 2160, 1140, 52, 16);
  K.prop('tree', 2340, 900, 36, 36, { seed: 4411 });

  // The alarm car at the north curb of street A, and the cars round it.
  const alarm = K.car(1230, A0 + 30, false, { alarm: true, color: '#b8b8b2' });
  K.car(560, A1 - 76, false);
  K.car(1000, A1 - 78, false, { color: '#3f5f3a' });
  K.car(B1 - 74, 760, true);
  K.car(2260, C0 + 30, false);

  lampsAlong(K, 300, 1500, A0, A1, 300);
  K.lamp(B0 - 6, 1040);
  K.lamp(B0 - 6, 700);
  K.lamp(B1 + 6, 1180);
  lampsAlong(K, 2060, 2560, C0, C1, 250, 1);
  K.clutter([['puddle', 900, 1470, 1.4, 0.2], ['trash', 1100, 1500], ['crack', 1790, 1120, 1.4], ['puddle', 1760, 640, 1.1, 1.2], ['trash', 2400, 470], ['leaves', 2250, 960, 1.4], ['papers', 880, 950]]);

  const start = K.startRoom(40, A0 + 34, 'right');
  const { gate } = K.endRoom(W - 272, C0 + 34, 'left');
  K.spray(start.interior.x + start.interior.w / 2, start.interior.y + start.interior.h - 24, 'SAFE ROOM TO SAFE ROOM.', '#efe9d6', 13, 0, true);
  // Chalk arrows from the street up the alley to the supplies.
  K.chalk(705, A0 - 40, -Math.PI / 2);
  K.chalk(705, 1110, -Math.PI / 2);
  K.chalk(800, 930, 0);
  K.spray(1270, A0 - 36, "DON'T SHOOT THE BLINKING ONES", '#ffb347', 14, 0);
  // Up street B: the way round her, on the far side.
  for (const y of [1220, 1010, 800]) K.chalk(B0 + 56, y, -Math.PI / 2, 'way');
  K.spray(B0 + 60, 1330 - 40, 'SHH. CRYING. KEEP LEFT.', '#cdbfe6', 13, 0, true);
  K.spray(2560, C1 - 30, 'ALMOST THERE', '#7dffa1', 16, 0);

  K.map.tutorial = {
    lesson: 3,
    stash: { ...stash, loot: ['armor', 'hot'] },
    alley: { x: 705, y: yA - 40, r: 70 },
    alarm,
    // You wait just past the alarm car (it's on screen, to your left), the two come at you from
    // further on: the line of fire runs away from the car. It takes a careless shot to hit it.
    biters: [{ x: 1700, y: A0 + 70 }, { x: 1750, y: yA + 20 }],
    alarmNear: { x: 1460, y: A0 + 80, r: 60 },
    turn: { x: xB, y: yA, r: 90 }, // the corner: up street B
    // In the plaza beside street B: you come up level with her (ahead of you would be under the coach's panel).
    witch: { x: 1990, y: 1170, face: Math.PI * 0.85 },
    pastWitch: { x: xB - 20, y: yC + 40, r: 100 }, // the top of street B
    // Out of sight up street C, well clear of the end room's door.
    horde: [{ x: 2400, y: C0 + 50 }, { x: 2450, y: C1 - 50 }, { x: 2500, y: yC }],
    alarmWaves: [{ x: 1000, y: 930 }, { x: xB, y: 760 }, { x: 430, y: yA + 10 }],
    gate,
  };
  K.map.stashes.push({ id: 1, tier: 'stash', x: stash.x, y: stash.y, loot: ['armor', 'hot'], a: 0.12 });
  return K.finish();
}

export const LESSON_MAPS = [null, lesson1, lesson2, lesson3];

/** The map for lesson n (1..3). */
export function generateTutorial(n) {
  return (LESSON_MAPS[n] || lesson1)();
}
