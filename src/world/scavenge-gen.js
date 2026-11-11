// Scavenging: rewards for leaving the straight line to the safe room.
//
//   - Supply stashes in nooks off the main route (alleys, courtyards, lots,
//     back rooms), spread along the run. Some have a trail of survivor chalk
//     arrows starting from the route.
//   - Boarded rooms: a dead-end room whose door is nailed shut. Shove or shoot
//     the boards (loud), deal with whatever is shut in there, take the good
//     stash. City: carved into a building; Building level: a one-door room.
//   - One secret per map: a loose manhole cover / floor hatch somewhere
//     remote, given away only by a glint. The best loot.
//
// "Off the route" = detour: path(start -> x) + path(x -> goal) - route length.
// Runs as a pass over a finished map (any generator, after the world
// features), seeded from the map seed, so the base map is identical with it
// off. opts picks the parts: { stashes, rooms, secret } (all on by default).

import { World, FlowField, NAV_CELL } from './world.js';
import { mulberry32, shuffle, rectsOverlap, pointInRect, clamp } from '../util.js';

const INF = 0x3fffffff;
const U = NAV_CELL / 10; // flow-field cost units -> world units (10 per straight cell)

export const BOARD_HP = 110;
// Carved facade walls and leftover building pieces are at least one nav cell
// thick, so the nav grid marks them by cell centre like the building they came
// from: carving can only ever unblock cells, never block a street or alley.
const FACADE_T = NAV_CELL;
const MIN_PIECE = NAV_CELL + 2;
const BOARD_T = 14;
const DOOR_W = 74;

/** Weighted loot tables (ids are defined in game/loot.js). */
export const LOOT_TABLES = {
  stash: [['armor', 3], ['hot', 3], ['adrenaline', 2], ['medkit', 2]],
  room: [['armorbig', 2], ['hotbig', 2], ['extmags', 2], ['vitality', 2], ['adrenaline', 1]],
  secretRare: [['extmags', 1], ['vitality', 1]],
};

export const TUNE = {
  city: { stashes: 5, rooms: 2, minDetour: 380, roomDetour: 320, secretDetour: 750 },
  interior: { stashes: 4, rooms: 2, minDetour: 300, roomDetour: 260, secretDetour: 520 },
};

export function addScavenging(map, seed, opts = {}) {
  const want = { stashes: opts.stashes !== false, rooms: opts.rooms !== false, secret: opts.secret !== false };
  const rnd = mulberry32((Math.imul(seed | 0, 0x9e3779b1) ^ 0x51ed270b) >>> 0);
  const r = (a, b) => a + rnd() * (b - a);
  const interior = map.theme === 'interior';
  const T = TUNE[interior ? 'interior' : 'city'];

  // Analysis on the untouched map: carving only ever turns solid building
  // into room, so free space stays free and these fields stay valid outside.
  // Strict: a find must be reachable by a body, not just by the nav grid
  // (which can see a passage in a sliver between two buildings). Things that
  // open during the run (the holdout gate) count as open.
  const world = new World({ ...map, obstacles: map.obstacles.filter((o) => !o.opens), sealed: [] }, { strict: true });
  const A = analyse(world, map);
  const er = map.endRoom.interior;
  const goal = { x: er.x + er.w / 2, y: er.y + er.h / 2 };
  const keep = []; // spots taken so far (for spacing)
  const farFrom = (x, y, d) => keep.every((k) => Math.hypot(k.x - x, k.y - y) >= d);
  const awayFromEnds = (x, y, ds = 900, dg = 500) =>
    Math.hypot(x - map.start.x, y - map.start.y) >= ds && Math.hypot(x - goal.x, y - goal.y) >= dg;

  map.stashes = [];
  map.sealed = [];
  map.floors = map.floors || [];
  let nextId = 1;
  const roll = (table) => {
    let total = 0;
    for (const [, w] of table) total += w;
    let x = rnd() * total;
    for (const [id, w] of table) if ((x -= w) < 0) return id;
    return table[0][0];
  };
  const rollDistinct = (table, n) => {
    const out = [];
    for (let k = 0; k < 20 && out.length < n; k++) {
      const id = roll(table);
      if (!out.includes(id)) out.push(id);
    }
    return out;
  };

  // --- Boarded rooms ------------------------------------------------------------------
  const rooms = !want.rooms ? [] : interior ? sealInteriorRooms(map, world, A, rnd, T, awayFromEnds) : carveCityRooms(map, world, A, rnd, T, awayFromEnds);
  for (const room of rooms) {
    const loot = rollDistinct(LOOT_TABLES.room, 2);
    loot.push('medkit');
    map.stashes.push({ id: nextId++, tier: 'room', x: room.stash.x, y: room.stash.y, loot, room: map.sealed.length });
    map.sealed.push(room);
    keep.push(room.outside, room.stash);
  }

  // --- Candidate nooks ------------------------------------------------------------------
  const inArea = interior
    ? (x, y) => map.rooms.some((rm) => pointInRect(x, y, rm, -8))
    : (x, y) => map.blocks.some((b) => b.type !== 'start' && b.type !== 'end' && pointInRect(x, y, b.inner, -6));
  const sealedRect = (x, y, pad) => map.sealed.some((s) => pointInRect(x, y, s.interior, pad) || pointInRect(x, y, s.boards, pad + 30));
  const cands = [];
  const c = { x: 0, y: 0 };
  for (let i = 0; i < world.blocked.length; i++) {
    if (world.blocked[i] || A.fs.dist[i] >= INF || A.fg.dist[i] >= INF) continue;
    const det = detour(A, i);
    if (det < T.minDetour) continue;
    world.cellCenter(i, c);
    if (!awayFromEnds(c.x, c.y, 800, 450)) continue;
    if (!world.isFree(c.x, c.y, 18) || sealedRect(c.x, c.y, 40)) continue;
    const enc = enclosure(world, i);
    if (enc < 5) continue; // open street / hall: not a find
    cands.push({ i, x: c.x, y: c.y, det, enc, prog: A.fs.dist[i] / (A.fs.dist[i] + A.fg.dist[i]), area: inArea(c.x, c.y) });
  }

  // --- The secret ------------------------------------------------------------------------
  const dark = interior ? map.rooms.filter((q) => !map.lamps.some((l) => pointInRect(l.x, l.y, q))) : [];
  const darkRoom = (x, y) => dark.some((q) => pointInRect(x, y, q));
  const secretPool = cands
    .filter((q) => q.det >= T.secretDetour && q.prog > 0.15 && q.prog < 0.92 && world.isFree(q.x, q.y, 22))
    .map((q) => ({ q, s: Math.min(q.det, 2600) / 2600 + (darkRoom(q.x, q.y) ? 0.5 : 0) + (q.area ? 0.2 : 0) + rnd() * 0.6 }))
    .sort((a, b) => b.s - a.s);
  for (const { q } of want.secret ? secretPool : []) {
    if (!farFrom(q.x, q.y, 700)) continue;
    const loot = [roll(LOOT_TABLES.secretRare), 'armorbig', 'hotbig'];
    map.stashes.push({ id: nextId++, tier: 'secret', x: q.x, y: q.y, loot, look: interior ? 'hatch' : 'manhole', a: r(0, Math.PI * 2) });
    keep.push(q);
    break;
  }

  // --- Supply stashes: one per stretch of the route, in the best nook there ------------------
  const n = want.stashes ? T.stashes : 0;
  const scored = cands.map((q) => ({
    q,
    s: q.enc / 24 + (q.area ? 0.6 : 0) + clamp(q.det / 1200, 0, 1) * 0.5 - (q.det > 2600 ? 0.6 : 0) + rnd() * 0.45,
  }));
  const placed = [];
  for (let k = 0; k < n; k++) {
    const lo = 0.06 + (k / n) * 0.9;
    const hi = 0.06 + ((k + 1) / n) * 0.9;
    let best = null;
    for (const e of scored) {
      if (e.q.prog < lo || e.q.prog >= hi || (best && e.s <= best.s)) continue;
      if (!farFrom(e.q.x, e.q.y, 650)) continue;
      best = e;
    }
    if (!best) continue;
    placed.push(best.q);
    keep.push(best.q);
  }
  // Fill any empty stretch from the rest of the map.
  for (const e of scored.sort((a, b) => b.s - a.s)) {
    if (placed.length >= n) break;
    if (!farFrom(e.q.x, e.q.y, 650)) continue;
    placed.push(e.q);
    keep.push(e.q);
  }
  for (const q of placed) {
    const loot = [roll(LOOT_TABLES.stash)];
    if (loot[0] !== 'medkit' && rnd() < 0.3) loot.push('medkit');
    map.stashes.push({ id: nextId++, tier: 'stash', x: q.x, y: q.y, loot, a: r(-0.25, 0.25) });
  }

  // --- Chalk trails from the route --------------------------------------------------------------
  const marks = [];
  const field = new FlowField(world); // reused for every trail
  const regular = map.stashes.filter((s) => s.tier === 'stash');
  // About half the stashes are signposted; boarded rooms always are.
  const trailed = shuffle(regular.slice(), rnd).slice(0, Math.ceil(regular.length / 2));
  for (const s of trailed) chalkTrail(world, A, field, s.x, s.y, 'stash', marks);
  for (const room of map.sealed) chalkTrail(world, A, field, room.outside.x, room.outside.y, 'room', marks);
  for (const m of marks) map.decor.push(m);
  map.scavenge = { seed, stashes: map.stashes.length, rooms: map.sealed.length, marks: marks.length };
  return map;
}

// --- Route analysis ---------------------------------------------------------------------------

/** Distances from the start and to the goal on this world (exported for tests). */
export function analyse(world, map) {
  const fs = new FlowField(world);
  fs.compute(map.start.x, map.start.y);
  const er = map.endRoom.interior;
  const gx = er.x + er.w / 2;
  const gy = er.y + er.h / 2;
  const fg = new FlowField(world);
  fg.compute(gx, gy);
  const gi = world.nearestFree(world.navIndex(gx, gy));
  return { fs, fg, route: fs.dist[gi] };
}

/** Extra walking (world units) to visit cell i on the way from start to goal. */
export function detour(A, i) {
  return Math.max(0, (A.fs.dist[i] + A.fg.dist[i] - A.route) * U);
}

/** Blocked cells in the 5x5 around i (0 = open plaza, 24 = sealed in). */
function enclosure(world, i) {
  const nw = world.navW;
  const cx = i % nw;
  const cy = (i - cx) / nw;
  let n = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dy) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= nw || y >= world.navH || world.blocked[y * nw + x]) n++;
    }
  }
  return n;
}

/** A free spot just outside a door (centre + outward normal), checked against the analysis world. */
function outsideOf(world, A, dx, dy, nx, ny) {
  for (const k of [34, 48, 64]) {
    const x = dx + nx * k;
    const y = dy + ny * k;
    const i = world.navIndex(x, y);
    if (world.blocked[i] || A.fs.dist[i] >= INF || !world.isFree(x, y, 14)) continue;
    // Nothing between the door and that spot: a fence a few steps off the wall
    // would put "outside" on its far side, and the door in a dead sliver.
    if (!world.segmentClear(dx + nx * 3, dy + ny * 3, x, y, world.moveBlockers)) return null;
    return { x, y, i };
  }
  return null;
}

function boardsFor(rect, vertical) {
  return {
    kind: 'boards',
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.w),
    h: Math.round(rect.h),
    move: true,
    shot: true,
    sight: true,
    navOpen: true, // the flow field sees a doorway; only bodies are stopped
    boards: true,
    vertical,
    hp: BOARD_HP,
    maxHp: BOARD_HP,
  };
}

// --- City: carve a room into a building, door on its open face ------------------------------------

function carveCityRooms(map, world, A, rnd, T, awayFromEnds) {
  const r = (a, b) => a + rnd() * (b - a);
  const out = [];
  const buildings = shuffle(
    map.obstacles.filter((o) => o.kind === 'building' && !o.safe && !o.nocarve && Math.max(o.w, o.h) >= 230 && Math.min(o.w, o.h) >= 180),
    rnd,
  );
  for (const b of buildings) {
    if (out.length >= T.rooms) break;
    if (!awayFromEnds(b.x + b.w / 2, b.y + b.h / 2, 1000, 600)) continue;
    if (out.some((q) => Math.hypot(q.outside.x - (b.x + b.w / 2), q.outside.y - (b.y + b.h / 2)) < 1300)) continue;
    for (const face of shuffle(['top', 'bottom', 'left', 'right'], rnd)) {
      const horiz = face === 'top' || face === 'bottom';
      const along = horiz ? b.w : b.h;
      const perp = horiz ? b.h : b.w;
      if (along < 230 || perp < 180) continue;
      const L = Math.round(clamp(along * r(0.4, 0.55), 170, 230));
      const D = Math.round(clamp(perp * r(0.45, 0.6), 130, 170));
      if (along - L < 2 * MIN_PIECE + 4 || perp - D < MIN_PIECE + 8) continue;
      const a0 = Math.round((horiz ? b.x : b.y) + r(MIN_PIECE, along - L - MIN_PIECE));
      const d0 = Math.round(a0 + r(40, L - 40 - DOOR_W));
      // Door centre on the face and the outward normal.
      const nx = face === 'left' ? -1 : face === 'right' ? 1 : 0;
      const ny = face === 'top' ? -1 : face === 'bottom' ? 1 : 0;
      const fx = face === 'left' ? b.x : face === 'right' ? b.x + b.w : d0 + DOOR_W / 2;
      const fy = face === 'top' ? b.y : face === 'bottom' ? b.y + b.h : d0 + DOOR_W / 2;
      const outside = outsideOf(world, A, fx, fy, nx, ny);
      if (!outside || detour(A, outside.i) < T.roomDetour) continue;
      // Room rect R inside the building, touching the chosen face.
      const R = horiz
        ? { x: a0, y: face === 'top' ? b.y : b.y + b.h - D, w: L, h: D }
        : { x: face === 'left' ? b.x : b.x + b.w - D, y: a0, w: D, h: L };
      // Replace the building with the pieces around R.
      const pieces = [
        { x: b.x, y: b.y, w: R.x - b.x, h: b.h },
        { x: R.x + R.w, y: b.y, w: b.x + b.w - (R.x + R.w), h: b.h },
        { x: R.x, y: b.y, w: R.w, h: R.y - b.y },
        { x: R.x, y: R.y + R.h, w: R.w, h: b.y + b.h - (R.y + R.h) },
      ].filter((q) => q.w >= 1 && q.h >= 1);
      map.obstacles.splice(map.obstacles.indexOf(b), 1);
      pieces.forEach((q, k) => {
        map.obstacles.push({
          ...b,
          ...q,
          seed: b.seed + k * 977,
          vents: q.w * q.h > 22000 ? Math.min(b.vents || 0, 2) : 0,
          _nightColor: undefined,
        });
      });
      // The facade (the building's own colour) with a doorway; boards across its outer edge.
      const wall = (x, y, w, h) => {
        if (w >= 1 && h >= 1) map.obstacles.push({ kind: 'wall', x, y, w, h, move: true, shot: true, sight: true, color: b.color, facade: true });
      };
      let door;
      let inner;
      let plank;
      if (horiz) {
        const wy = face === 'top' ? R.y : R.y + R.h - FACADE_T;
        wall(R.x, wy, d0 - R.x, FACADE_T);
        wall(d0 + DOOR_W, wy, R.x + R.w - (d0 + DOOR_W), FACADE_T);
        door = { x: d0, y: wy, w: DOOR_W, h: FACADE_T };
        plank = { x: d0, y: face === 'top' ? wy : wy + FACADE_T - BOARD_T, w: DOOR_W, h: BOARD_T };
        inner = { x: R.x, y: face === 'top' ? R.y + FACADE_T : R.y, w: R.w, h: R.h - FACADE_T };
      } else {
        const wx = face === 'left' ? R.x : R.x + R.w - FACADE_T;
        wall(wx, R.y, FACADE_T, d0 - R.y);
        wall(wx, d0 + DOOR_W, FACADE_T, R.y + R.h - (d0 + DOOR_W));
        door = { x: wx, y: d0, w: FACADE_T, h: DOOR_W };
        plank = { x: face === 'left' ? wx : wx + FACADE_T - BOARD_T, y: d0, w: BOARD_T, h: DOOR_W };
        inner = { x: face === 'left' ? R.x + FACADE_T : R.x, y: R.y, w: R.w - FACADE_T, h: R.h };
      }
      const boards = boardsFor(plank, !horiz);
      map.floors.push({ ...door, type: 'boarded' }); // the doorway's floor
      map.obstacles.push(boards);
      map.floors.push({ ...inner, type: 'boarded' });
      // Stash against the back wall, opposite the door.
      const back = 28;
      const stash = {
        x: nx ? (nx > 0 ? inner.x + back : inner.x + inner.w - back) : clamp(d0 + DOOR_W / 2 + r(-40, 40), inner.x + 30, inner.x + inner.w - 30),
        y: ny ? (ny > 0 ? inner.y + back : inner.y + inner.h - back) : clamp(d0 + DOOR_W / 2 + r(-40, 40), inner.y + 30, inner.y + inner.h - 30),
      };
      const room = { interior: inner, door, boards, outside: { x: outside.x, y: outside.y }, normal: { x: nx, y: ny }, stash, sleepers: sleepers(inner, stash, rnd), open: false };
      boards.sealed = room;
      out.push(room);
      break;
    }
  }
  return out;
}

// --- Building level: board up a one-door room ---------------------------------------------------

function sealInteriorRooms(map, world, A, rnd, T, awayFromEnds) {
  const out = [];
  const doorsOf = (rm) =>
    map.doors.filter((d) => {
      if (d.plugged) return false;
      if (d.vertical) {
        const touches = Math.abs(d.x + d.w - rm.x) <= 2 || Math.abs(d.x - (rm.x + rm.w)) <= 2;
        return touches && d.y >= rm.y - 2 && d.y + d.h <= rm.y + rm.h + 2;
      }
      const touches = Math.abs(d.y + d.h - rm.y) <= 2 || Math.abs(d.y - (rm.y + rm.h)) <= 2;
      return touches && d.x >= rm.x - 2 && d.x + d.w <= rm.x + rm.w + 2;
    });
  const pool = shuffle(map.rooms.filter((rm) => rm.w * rm.h <= 200000 && rm.w >= 150 && rm.h >= 150), rnd);
  for (const rm of pool) {
    if (out.length >= T.rooms) break;
    const ds = doorsOf(rm);
    if (ds.length !== 1) continue;
    if (map.fires.some((f) => pointInRect(f.x, f.y, rm, 10))) continue;
    if (map.obstacles.some((o) => o.alarm && rectsOverlap(o, rm, 30))) continue;
    if (!awayFromEnds(rm.x + rm.w / 2, rm.y + rm.h / 2, 1000, 600)) continue;
    const d = ds[0];
    const cx = d.x + d.w / 2;
    const cy = d.y + d.h / 2;
    // Outward = away from the room's centre.
    const nx = d.vertical ? Math.sign(cx - (rm.x + rm.w / 2)) : 0;
    const ny = d.vertical ? 0 : Math.sign(cy - (rm.y + rm.h / 2));
    const outside = outsideOf(world, A, cx, cy, nx, ny);
    if (!outside || detour(A, outside.i) < T.roomDetour) continue;
    if (out.some((q) => Math.hypot(q.outside.x - outside.x, q.outside.y - outside.y) < 1100)) continue;
    // A clear spot for the stash, away from the door.
    let stash = null;
    for (let k = 0; k < 60 && !stash; k++) {
      const x = rm.x + 30 + rnd() * (rm.w - 60);
      const y = rm.y + 30 + rnd() * (rm.h - 60);
      if (Math.hypot(x - cx, y - cy) < Math.min(rm.w, rm.h) * 0.45) continue;
      const i = world.navIndex(x, y);
      if (world.blocked[i] || A.fs.dist[i] >= INF || !world.isFree(x, y, 16)) continue;
      stash = { x, y };
    }
    if (!stash) continue;
    d.leaf = 0; // no open door slab: it's nailed shut
    d.boarded = true;
    const boards = boardsFor(d, d.vertical);
    map.obstacles.push(boards);
    const room = { interior: { x: rm.x, y: rm.y, w: rm.w, h: rm.h }, door: d, boards, outside: { x: outside.x, y: outside.y }, normal: { x: nx, y: ny }, stash, sleepers: sleepers(rm, stash, rnd, world), open: false };
    boards.sealed = room;
    rm.sealed = true;
    out.push(room);
  }
  return out;
}

/** 2-3 idle zombies shut in with the stash (positions only; spawned by the game). */
function sleepers(rect, stash, rnd, world = null) {
  const n = 2 + Math.floor(rnd() * 2);
  const out = [];
  for (let k = 0; k < 40 && out.length < n; k++) {
    const x = rect.x + 24 + rnd() * (rect.w - 48);
    const y = rect.y + 24 + rnd() * (rect.h - 48);
    if (Math.hypot(x - stash.x, y - stash.y) < 30) continue;
    if (world && !world.isFree(x, y, 12)) continue;
    out.push({ x, y });
  }
  return out;
}

// --- Chalk arrows -------------------------------------------------------------------------------

const ROUTE_TOL = 70; // within this detour a cell counts as "on the route"
const TRAIL_MAX = 1700;
const TRAIL_STEP = 300;

/** Arrows from the nearest point of the route toward (tx, ty), every TRAIL_STEP units. */
function chalkTrail(world, A, f, tx, ty, sym, marks) {
  f.compute(tx, ty);
  let best = -1;
  let bd = INF;
  for (let i = 0; i < world.blocked.length; i++) {
    if (world.blocked[i] || f.dist[i] >= bd || A.fs.dist[i] >= INF) continue;
    if (detour(A, i) > ROUTE_TOL) continue;
    bd = f.dist[i];
    best = i;
  }
  if (best < 0 || bd * U > TRAIL_MAX || bd * U < 240) return;
  const c = { x: 0, y: 0 };
  const ahead = { x: 0, y: 0 };
  let i = best;
  let since = TRAIL_STEP; // first arrow right at the branch
  for (let guard = 0; guard < 400 && f.dist[i] * U > 190; guard++) {
    const j = steepest(world, f, i);
    if (j < 0) break;
    if (since >= TRAIL_STEP) {
      // Point along the path a couple of cells ahead (smooths the 8-way steps).
      let k = j;
      for (let s = 0; s < 3; s++) {
        const kk = steepest(world, f, k);
        if (kk < 0) break;
        k = kk;
      }
      world.cellCenter(i, c);
      world.cellCenter(k, ahead);
      const a = Math.atan2(ahead.y - c.y, ahead.x - c.x);
      const dup = marks.some((m) => Math.hypot(m.x - c.x, m.y - c.y) < 80);
      if (!dup) marks.push({ type: 'chalk', x: c.x, y: c.y, a, sym, s: 1 });
      since = 0;
    }
    since += (Math.abs((j % world.navW) - (i % world.navW)) + Math.abs(Math.floor(j / world.navW) - Math.floor(i / world.navW)) === 2 ? 14 : 10) * U;
    i = j;
  }
}

function steepest(world, f, i) {
  const nw = world.navW;
  const cx = i % nw;
  const cy = (i - cx) / nw;
  let best = -1;
  let bd = f.dist[i];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= nw || y >= world.navH) continue;
      const j = y * nw + x;
      if (world.blocked[j]) continue;
      if (dx && dy && (world.blocked[cy * nw + x] || world.blocked[y * nw + cx])) continue;
      if (f.dist[j] < bd) {
        bd = f.dist[j];
        best = j;
      }
    }
  }
  return best;
}
