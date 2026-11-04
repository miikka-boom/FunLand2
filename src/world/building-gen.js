// Seeded interior level: one dark building floor, L4D style.
//
//   +--------------------------------------------------------------+
//   | rooms ... | X | rooms ...  | X | rooms ... | X | rooms ...      |
//   |           | X |            | X |           | X |                |
//   |[SAFE]  vestibule ====== spine corridor ====== vestibule  [SAFE]|
//   |           | X |            | X |           | X |                |
//   | rooms ... | X | rooms ...  | X | rooms ... | X | rooms ...      |
//   +--------------------------------------------------------------+
//                  X = cross corridors (4 of them on the full floor)
//
// Blocks between corridors are split into rooms (BSP). Every split wall gets a
// door (so each block is internally connected), and each block opens onto a
// corridor through at least one door. Splits never land on an existing door.
// Output matches the city map format, so World/director/renderer just work.

import { mulberry32, rectsOverlap, shuffle } from '../util.js';
import { World } from './world.js';

export const BUILDING_W = 5200;
export const BUILDING_H = 2800;
const OUT = 24; // exterior wall
const T = 14; // interior wall
const SAFE_W = 232;
const SAFE_H = 200;

// move: blocks movement, shot: stops bullets, sight: blocks line of sight / light.
const KINDS = {
  wall: { move: true, shot: true, sight: true },
  pillar: { move: true, shot: true, sight: true },
  shelf: { move: true, shot: true, sight: true },
  border: { move: true, shot: true, sight: true },
  barricade: { move: true, shot: true, sight: false }, // piled furniture: see through the gaps, can't pass
  glass: { move: true, shot: false, sight: false },
  desk: { move: true, shot: false, sight: false },
  table: { move: true, shot: false, sight: false },
  bed: { move: true, shot: false, sight: false },
  counter: { move: true, shot: false, sight: false },
  couch: { move: true, shot: false, sight: false },
  plant: { move: true, shot: false, sight: false },
  cabinet: { move: true, shot: true, sight: false },
  vending: { move: true, shot: true, sight: false },
  barrel: { move: true, shot: true, sight: false },
  alarmbox: { move: true, shot: true, sight: false },
  crate: { move: true, shot: true, sight: false },
};

const WALL = '#5a5650';
const OUTER = '#46433e';
const SAFE = '#3d5a45';

export function generateBuilding(seed) {
  const rnd = mulberry32(((seed * 2654435761) ^ 0x5bd1e995) >>> 0);
  const r = (a, b) => a + rnd() * (b - a);
  const ri = (a, b) => Math.floor(r(a, b + 1));
  const chance = (p) => rnd() < p;
  const pickW = (table) => {
    let total = 0;
    for (const [, w] of table) total += w;
    let x = rnd() * total;
    for (const [v, w] of table) if ((x -= w) < 0) return v;
    return table[0][0];
  };

  const W = BUILDING_W;
  const H = BUILDING_H;
  const obstacles = [];
  const rooms = [];
  const corridors = [];
  const blocks = [];
  const doors = [];
  const lamps = [];
  const signs = [];
  const pickups = [];
  const decor = [];
  const fires = [];
  const glows = []; // vending machines: small coloured light sources
  const clear = []; // keep-out zones in front of doors

  const ob = (kind, x, y, w, h, extra = {}) => {
    const o = { kind, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), ...KINDS[kind], ...extra };
    obstacles.push(o);
    return o;
  };
  // Furniture may touch walls (it stands against them) but keeps aisles to other props.
  const free = (rect, pad = 0) =>
    !obstacles.some((o) => rectsOverlap(o, rect, o.kind === 'wall' || o.kind === 'glass' ? 0 : pad)) && !clear.some((c) => rectsOverlap(c, rect));

  /** Axis-aligned wall from a to b along x (h) or y (v), with door / glass spans. */
  function wallRun(dir, fixed, a, b, gaps = [], glass = [], color = WALL, thick = T) {
    const cuts = [...gaps.map((g) => ({ ...g, t: 'door' })), ...glass.map((g) => ({ ...g, t: 'glass' }))].sort((p, q) => p.a - q.a);
    let cur = a;
    const emit = (kind, s, e) => {
      if (e - s < 2) return;
      if (dir === 'h') ob(kind, s, fixed, e - s, thick, { color });
      else ob(kind, fixed, s, thick, e - s, { color });
    };
    for (const c of cuts) {
      const s = Math.max(a, c.a);
      const e = Math.min(b, c.b);
      if (e <= s) continue;
      emit('wall', cur, s);
      if (c.t === 'glass') emit('glass', s, e);
      cur = Math.max(cur, e);
    }
    emit('wall', cur, b);
  }

  function addDoor(dir, fixed, a, b, thick = T) {
    // dir: orientation of the wall the door sits in.
    const d = dir === 'h'
      ? { x: a, y: fixed, w: b - a, h: thick, vertical: false }
      : { x: fixed, y: a, w: thick, h: b - a, vertical: true };
    d.leaf = chance(0.55) ? (chance(0.5) ? 1 : -1) : 0; // an open door slab, drawn only
    doors.push(d);
    const reach = 66;
    clear.push(dir === 'h'
      ? { x: a - 8, y: fixed - reach, w: b - a + 16, h: thick + reach * 2 }
      : { x: fixed - reach, y: a - 8, w: thick + reach * 2, h: b - a + 16 });
    return d;
  }

  // --- Shell ----------------------------------------------------------------------
  ob('wall', 0, 0, W, OUT, { color: OUTER, exterior: true });
  ob('wall', 0, H - OUT, W, OUT, { color: OUTER, exterior: true });
  ob('wall', 0, OUT, OUT, H - 2 * OUT, { color: OUTER, exterior: true });
  ob('wall', W - OUT, OUT, OUT, H - 2 * OUT, { color: OUTER, exterior: true });

  // --- Corridors --------------------------------------------------------------------
  const cy = Math.round(H / 2 + r(-140, 140));
  const SW = ri(116, 136);
  const spineTop = Math.round(cy - SW / 2);
  const spineBot = spineTop + SW;
  const bandTopEnd = cy - SAFE_H / 2;
  const bandBotEnd = cy + SAFE_H / 2;
  const n = 4; // cross corridors
  const xa = OUT + SAFE_W;
  const xb = W - OUT - SAFE_W;
  const cross = [];
  for (let i = 1; i <= n; i++) {
    const cw = ri(104, 124);
    const cx = xa + ((xb - xa) * i) / (n + 1) + r(-90, 90);
    cross.push({ x: Math.round(cx - cw / 2), w: cw });
  }
  const cols = [];
  let left = OUT;
  for (let i = 0; i <= n; i++) {
    const right = i < n ? cross[i].x : W - OUT;
    cols.push({ i, x: left, w: right - left, edge: i === 0 || i === n });
    if (i < n) left = cross[i].x + cross[i].w;
  }
  for (const c of cross) corridors.push({ x: c.x, y: OUT, w: c.w, h: H - 2 * OUT, axis: 'v' });
  for (const col of cols) {
    if (col.i === 0) corridors.push({ x: xa, y: bandTopEnd, w: col.x + col.w - xa, h: SAFE_H, axis: 'h', vestibule: true });
    else if (col.i === n) corridors.push({ x: col.x, y: bandTopEnd, w: xb - col.x, h: SAFE_H, axis: 'h', vestibule: true });
    else corridors.push({ x: col.x, y: spineTop, w: col.w, h: SW, axis: 'h' });
  }

  // --- Safe rooms -----------------------------------------------------------------------
  function safeRoom(x, doorSide, isEnd) {
    const y = bandTopEnd;
    const W2 = SAFE_W;
    const H2 = SAFE_H;
    const t = 16;
    const door = 88;
    const wall = (wx, wy, ww, wh) => ob('wall', wx, wy, ww, wh, { color: SAFE, safe: true });
    wall(x, y, W2, t);
    wall(x, y + H2 - t, W2, t);
    const dy0 = y + (H2 - door) / 2;
    if (doorSide === 'right') {
      wall(x, y + t, t, H2 - 2 * t);
      wall(x + W2 - t, y + t, t, dy0 - (y + t));
      wall(x + W2 - t, dy0 + door, t, y + H2 - t - (dy0 + door));
    } else {
      wall(x + W2 - t, y + t, t, H2 - 2 * t);
      wall(x, y + t, t, dy0 - (y + t));
      wall(x, dy0 + door, t, y + H2 - t - (dy0 + door));
    }
    const interior = { x: x + t, y: y + t, w: W2 - 2 * t, h: H2 - 2 * t };
    const doorRect = doorSide === 'right' ? { x: x + W2 - t, y: dy0, w: t, h: door } : { x, y: dy0, w: t, h: door };
    clear.push({ x: doorRect.x - 90, y: doorRect.y - 10, w: doorRect.w + 180, h: doorRect.h + 20 });
    pickups.push({ kind: 'medkit', x: interior.x + 26, y: interior.y + 26 });
    if (isEnd) pickups.push({ kind: 'medkit', x: interior.x + interior.w - 26, y: interior.y + 26 });
    return { interior, door: doorRect, outer: { x, y, w: W2, h: H2 } };
  }
  const startRoom = safeRoom(OUT, 'right', false);
  const endRoom = safeRoom(W - OUT - SAFE_W, 'left', true);
  const start = { x: startRoom.interior.x + startRoom.interior.w / 2, y: startRoom.interior.y + startRoom.interior.h / 2 + 10 };

  // --- Blocks -> rooms --------------------------------------------------------------------
  // Room furniture is placed later; first carve every block so all walls exist.
  const leaves = [];
  for (const col of cols) {
    const tBand = col.edge ? bandTopEnd : spineTop;
    const bBand = col.edge ? bandBotEnd : spineBot;
    for (const half of ['top', 'bottom']) {
      const B = half === 'top'
        ? { x: col.x, y: OUT, w: col.w, h: tBand - OUT }
        : { x: col.x, y: bBand, w: col.w, h: H - OUT - bBand };
      // Which sides face a corridor (and over which span doors are allowed).
      const sides = {
        top: half === 'bottom' ? { span: [B.x, B.x + B.w] } : null,
        bottom: half === 'top' ? { span: [B.x, B.x + B.w] } : null,
        left: col.i > 0 ? { span: [B.y, B.y + B.h] } : null,
        right: col.i < n ? { span: [B.y, B.y + B.h] } : null,
      };
      // Next to the safe rooms the band wall backs onto the safe room, not a corridor.
      if (col.i === 0) for (const s of ['top', 'bottom']) if (sides[s]) sides[s].span = [xa + 10, B.x + B.w];
      if (col.i === n) for (const s of ['top', 'bottom']) if (sides[s]) sides[s].span = [B.x, xb - 10];
      const inner = {
        x: B.x + (sides.left ? T : 0),
        y: B.y + (sides.top ? T : 0),
        w: B.w - (sides.left ? T : 0) - (sides.right ? T : 0),
        h: B.h - (sides.top ? T : 0) - (sides.bottom ? T : 0),
      };
      const block = { ...B, inner, sides, rooms: [] };
      blocks.push(block);
      bsp(block, inner, 0, { top: [], bottom: [], left: [], right: [] });
      for (const rm of block.rooms) leaves.push(rm);
      corridorDoors(block);
    }
  }

  function bsp(block, rect, depth, bounds) {
    const minRoom = 190;
    const canX = rect.w >= minRoom * 2 + T;
    const canY = rect.h >= minRoom * 2 + T;
    const area = rect.w * rect.h;
    const keepHall = depth >= 1 && area > 260000 && area < 900000 && chance(0.38);
    const stop = (!canX && !canY) || depth >= 4 || keepHall || (depth >= 2 && area < 230000 && chance(0.35));
    if (!stop) {
      let splitX = canX && (!canY || (rect.w > rect.h * 1.15 ? true : rect.h > rect.w * 1.15 ? false : chance(0.5)));
      for (let attempt = 0; attempt < 14; attempt++) {
        if (attempt === 7 && canX && canY) splitX = !splitX;
        // Both halves stay >= minRoom, so every later wall is long enough for a door.
        const lo = (splitX ? rect.x : rect.y) + minRoom + T / 2;
        const hi = (splitX ? rect.x + rect.w : rect.y + rect.h) - minRoom - T / 2;
        const ext = splitX ? rect.w : rect.h;
        const pos = Math.round(Math.min(hi, Math.max(lo, (splitX ? rect.x : rect.y) + ext * r(0.33, 0.67))));
        const blockers = splitX ? [...bounds.top, ...bounds.bottom] : [...bounds.left, ...bounds.right];
        if (blockers.some((d) => pos + T / 2 + 20 > d.a && pos - T / 2 - 20 < d.b)) continue;
        if (splitX) {
          const wx = pos - Math.round(T / 2);
          const gaps = pickDoors(rect.y, rect.y + rect.h);
          for (const g of gaps) addDoor('v', wx, g.a, g.b);
          wallRun('v', wx, rect.y, rect.y + rect.h, gaps);
          bsp(block, { x: rect.x, y: rect.y, w: wx - rect.x, h: rect.h }, depth + 1, { ...bounds, right: gaps });
          bsp(block, { x: wx + T, y: rect.y, w: rect.x + rect.w - (wx + T), h: rect.h }, depth + 1, { ...bounds, left: gaps });
        } else {
          const wy = pos - Math.round(T / 2);
          const gaps = pickDoors(rect.x, rect.x + rect.w);
          for (const g of gaps) addDoor('h', wy, g.a, g.b);
          wallRun('h', wy, rect.x, rect.x + rect.w, gaps);
          bsp(block, { x: rect.x, y: rect.y, w: rect.w, h: wy - rect.y }, depth + 1, { ...bounds, bottom: gaps });
          bsp(block, { x: rect.x, y: wy + T, w: rect.w, h: rect.y + rect.h - (wy + T) }, depth + 1, { ...bounds, top: gaps });
        }
        return;
      }
    }
    block.rooms.push({ ...rect, doors: 0 });
  }

  function pickDoors(a, b) {
    const len = b - a;
    const one = (lo, hi) => {
      const dw = ri(72, 86);
      if (hi - lo < dw + 52) return null;
      const u = Math.round(r(lo + 26, hi - 26 - dw));
      return { a: u, b: u + dw };
    };
    const out = [];
    if (len > 640 && chance(0.4)) {
      const mid = (a + b) / 2;
      const d1 = one(a, mid);
      const d2 = one(mid, b);
      if (d1) out.push(d1);
      if (d2) out.push(d2);
    }
    if (!out.length) {
      const d = one(a, b);
      if (d) out.push(d);
      else if (len >= 96) {
        // Short wall: a narrower door rather than a sealed room.
        const dw = Math.min(80, len - 24);
        const u = Math.round(a + (len - dw) / 2);
        out.push({ a: u, b: u + dw });
      }
    }
    return out;
  }

  /** Doors from rooms onto the corridors around a block; then the corridor-side walls. */
  function corridorDoors(block) {
    const I = block.inner;
    const per = { top: [], bottom: [], left: [], right: [] };
    const glass = { top: [], bottom: [], left: [], right: [] };
    const candidates = [];
    for (const rm of block.rooms) {
      for (const side of ['top', 'bottom', 'left', 'right']) {
        const s = block.sides[side];
        if (!s) continue;
        const touches =
          (side === 'top' && rm.y === I.y) || (side === 'bottom' && rm.y + rm.h === I.y + I.h) ||
          (side === 'left' && rm.x === I.x) || (side === 'right' && rm.x + rm.w === I.x + I.w);
        if (!touches) continue;
        const horiz = side === 'top' || side === 'bottom';
        const lo = Math.max(horiz ? rm.x : rm.y, s.span[0]);
        const hi = Math.min(horiz ? rm.x + rm.w : rm.y + rm.h, s.span[1]);
        if (hi - lo < 110) continue;
        candidates.push({ rm, side, lo, hi });
      }
    }
    let made = 0;
    const make = (c) => {
      const dw = Math.min(ri(74, 88), c.hi - c.lo - 24);
      const u = Math.round(r(c.lo + 12, Math.max(c.lo + 12, c.hi - 12 - dw)));
      per[c.side].push({ a: u, b: u + dw });
      c.rm.doors++;
      c.rm.corridor = true;
      made++;
    };
    for (const c of candidates) if (chance(0.45)) make(c);
    // Most corridor-facing sides get at least one door (routes around barricades).
    for (const side of ['top', 'bottom', 'left', 'right']) {
      if (per[side].length) continue;
      const onSide = candidates.filter((c) => c.side === side);
      if (onSide.length && chance(0.8)) make(onSide[Math.floor(rnd() * onSide.length)]);
    }
    if (!made && candidates.length) make(candidates.reduce((p, q) => (q.hi - q.lo > p.hi - p.lo ? q : p)));
    // Glass partitions: some rooms show the corridor what's inside (and vice versa).
    for (const c of candidates) {
      if (chance(0.22)) {
        glass[c.side].push({ a: c.lo + 24, b: c.hi - 24 });
        c.rm.glass = true;
      }
    }
    const B = block;
    for (const side of ['top', 'bottom', 'left', 'right']) {
      if (!block.sides[side]) continue;
      // Doors and glass must not overlap each other.
      const gl = glass[side].flatMap((g) => {
        let segs = [g];
        for (const d of per[side]) {
          segs = segs.flatMap((s) => (d.b <= s.a || d.a >= s.b ? [s] : [{ a: s.a, b: d.a - 6 }, { a: d.b + 6, b: s.b }]).filter((q) => q.b - q.a > 30));
        }
        return segs;
      });
      if (side === 'top') { wallRun('h', B.y, B.x, B.x + B.w, per.top, gl); per.top.forEach((g) => addDoor('h', B.y, g.a, g.b)); }
      if (side === 'bottom') { wallRun('h', B.y + B.h - T, B.x, B.x + B.w, per.bottom, gl); per.bottom.forEach((g) => addDoor('h', B.y + B.h - T, g.a, g.b)); }
      if (side === 'left') { wallRun('v', B.x, B.y, B.y + B.h, per.left, gl); per.left.forEach((g) => addDoor('v', B.x, g.a, g.b)); }
      if (side === 'right') { wallRun('v', B.x + B.w - T, B.y, B.y + B.h, per.right, gl); per.right.forEach((g) => addDoor('v', B.x + B.w - T, g.a, g.b)); }
    }
  }

  // --- Barricades: the spine is choked with debris, so the route detours through rooms ----
  const barricades = [];
  for (const col of cols) {
    if (col.edge) continue;
    const bw = ri(44, 58);
    for (let k = 0; k < 12; k++) {
      const bx = Math.round(col.x + col.w * r(0.25, 0.75) - bw / 2);
      const rect = { x: bx, y: spineTop, w: bw, h: SW };
      // Keep clear of doors that open onto this stretch of corridor.
      if (doors.some((d) => rectsOverlap(d, { x: bx - 70, y: spineTop - 20, w: bw + 140, h: SW + 40 }))) continue;
      barricades.push(ob('barricade', rect.x, rect.y, rect.w, rect.h, { seed: ri(0, 1e6) }));
      clear.push({ x: bx - 50, y: spineTop, w: bw + 100, h: SW });
      break;
    }
  }

  // --- Room types + furniture --------------------------------------------------------------
  const TYPES_SMALL = [['restroom', 3], ['storage', 3], ['closet', 2]];
  const TYPES_MID = [['office', 5], ['ward', 2], ['conference', 2], ['storage', 2], ['lab', 1]];
  const TYPES_BIG = [['cafeteria', 2], ['lobby', 2], ['ward', 2], ['warehouse', 2], ['openoffice', 3]];

  const place = (rm, kind, w, h, x, y, extra) => {
    const o = { x, y, w, h };
    if (x < rm.x + 6 || y < rm.y + 6 || x + w > rm.x + rm.w - 6 || y + h > rm.y + rm.h - 6) return null;
    if (!free(o, 14)) return null;
    return ob(kind, x, y, w, h, extra);
  };
  const scatter = (rm, kind, n, w, h, pad = 20, extra = () => ({})) => {
    let k = 0;
    for (let i = 0; i < n * 10 && k < n; i++) {
      const ww = typeof w === 'function' ? w() : w;
      const hh = typeof h === 'function' ? h() : h;
      if (rm.w < ww + 2 * pad || rm.h < hh + 2 * pad) return k;
      if (place(rm, kind, ww, hh, rm.x + r(pad, rm.w - ww - pad), rm.y + r(pad, rm.h - hh - pad), extra())) k++;
    }
    return k;
  };
  const along = (rm, kind, long, short, gap, side, extra = () => ({})) => {
    // A row of furniture against one wall.
    const horiz = side === 'top' || side === 'bottom';
    const span = horiz ? rm.w : rm.h;
    const w = horiz ? long : short;
    const h = horiz ? short : long;
    for (let p = 24; p + long < span - 24; p += long + gap) {
      const x = horiz ? rm.x + p : side === 'left' ? rm.x + 10 : rm.x + rm.w - 10 - w;
      const y = horiz ? (side === 'top' ? rm.y + 10 : rm.y + rm.h - 10 - h) : rm.y + p;
      place(rm, kind, w, h, x, y, extra());
    }
  };
  const decorIn = (rm, type, n) => {
    for (let k = 0; k < n; k++) decor.push({ type, x: rm.x + r(16, rm.w - 16), y: rm.y + r(16, rm.h - 16), s: r(0.7, 1.4), a: r(0, Math.PI) });
  };

  for (const rm of leaves) {
    const area = rm.w * rm.h;
    rm.type = rm.w < 240 && rm.h < 240 ? pickW(TYPES_SMALL) : area > 260000 && rm.w > 300 && rm.h > 300 ? pickW(TYPES_BIG) : pickW(TYPES_MID);
    if (rm.glass && rm.type !== 'office' && rm.type !== 'openoffice' && rm.type !== 'lab' && rm.type !== 'conference') {
      // Glass only reads as an office front; leave it, but make the room an office if it's mid-sized.
      if (area <= 260000 && rm.w >= 240) rm.type = 'office';
    }
    rooms.push(rm);
    const sides = ['top', 'bottom', 'left', 'right'];
    const longSide = rm.w >= rm.h ? 'top' : 'left';
    switch (rm.type) {
      case 'office':
        along(rm, 'desk', 64, 34, ri(40, 70), sides[ri(0, 3)]);
        scatter(rm, 'cabinet', ri(1, 2), 30, 22, 14);
        if (chance(0.5)) scatter(rm, 'plant', 1, 24, 24, 12);
        decorIn(rm, 'papers', ri(2, 5));
        decorIn(rm, 'chair', ri(1, 3));
        break;
      case 'openoffice': {
        for (let y = rm.y + 50; y + 34 < rm.y + rm.h - 50; y += 120) {
          for (let x = rm.x + 50; x + 128 < rm.x + rm.w - 50; x += 190) {
            if (chance(0.82)) place(rm, 'desk', 128, 34, x, y);
          }
        }
        scatter(rm, 'cabinet', ri(2, 4), 30, 22, 14);
        decorIn(rm, 'papers', ri(5, 9));
        decorIn(rm, 'chair', ri(4, 8));
        break;
      }
      case 'conference': {
        const tw = Math.min(rm.w * 0.55, 260);
        const th = Math.min(rm.h * 0.32, 90);
        place(rm, 'table', tw, th, rm.x + (rm.w - tw) / 2, rm.y + (rm.h - th) / 2);
        decorIn(rm, 'chair', ri(3, 6));
        break;
      }
      case 'ward':
        along(rm, 'bed', 92, 46, ri(46, 70), longSide);
        if (rm.w > 300 && rm.h > 300) along(rm, 'bed', 92, 46, ri(46, 70), longSide === 'top' ? 'bottom' : 'right');
        if (rm.w > 520 && rm.h > 420) {
          // Big wards: a centre row too, with aisles either side.
          if (longSide === 'top') for (let x = rm.x + 60; x + 46 < rm.x + rm.w - 60; x += 116) place(rm, 'bed', 46, 92, x, rm.y + rm.h / 2 - 46);
          else for (let y = rm.y + 60; y + 46 < rm.y + rm.h - 60; y += 116) place(rm, 'bed', 92, 46, rm.x + rm.w / 2 - 46, y);
        }
        scatter(rm, 'cabinet', ri(1, 3), 26, 22, 12);
        decorIn(rm, 'blood', ri(1, 3));
        break;
      case 'cafeteria': {
        for (let y = rm.y + 70; y + 44 < rm.y + rm.h - 60; y += 104) {
          for (let x = rm.x + 60; x + 74 < rm.x + rm.w - 60; x += 130) if (chance(0.85)) place(rm, 'table', 74, 44, x, y);
        }
        along(rm, 'counter', 150, 30, 0, rm.w >= rm.h ? 'top' : 'left');
        if (chance(0.6)) scatter(rm, 'vending', 1, 40, 30, 14);
        decorIn(rm, 'trash', ri(3, 6));
        break;
      }
      case 'lobby': {
        place(rm, 'counter', Math.min(220, rm.w * 0.4), 30, rm.x + rm.w * 0.3, rm.y + rm.h * 0.25);
        scatter(rm, 'couch', ri(2, 4), () => (chance(0.5) ? 92 : 34), () => (chance(0.5) ? 34 : 92), 40);
        scatter(rm, 'plant', ri(2, 4), 26, 26, 20);
        if (rm.w > 420 && rm.h > 360) {
          for (const fx of [0.33, 0.67]) for (const fy of [0.33, 0.67]) place(rm, 'pillar', 36, 36, rm.x + rm.w * fx - 18, rm.y + rm.h * fy - 18);
        }
        decorIn(rm, 'papers', ri(2, 4));
        break;
      }
      case 'warehouse': {
        const vertical = rm.h > rm.w;
        if (vertical) {
          for (let x = rm.x + 60; x + 26 < rm.x + rm.w - 60; x += 100) place(rm, 'shelf', 26, Math.max(80, rm.h - 200), x, rm.y + 100);
        } else {
          for (let y = rm.y + 60; y + 26 < rm.y + rm.h - 60; y += 100) place(rm, 'shelf', Math.max(80, rm.w - 200), 26, rm.x + 100, y);
        }
        scatter(rm, 'crate', ri(2, 5), 34, 34, 20);
        break;
      }
      case 'storage':
        along(rm, 'shelf', 110, 26, ri(30, 60), sides[ri(0, 3)]);
        scatter(rm, 'crate', ri(1, 3), 34, 34, 16);
        break;
      case 'lab':
        along(rm, 'counter', 140, 30, ri(50, 80), longSide);
        scatter(rm, 'cabinet', ri(1, 3), 28, 22, 12);
        decorIn(rm, 'papers', ri(1, 3));
        break;
      case 'restroom': {
        // Stall partitions against one wall.
        const vertical = rm.w < rm.h;
        for (let p = 30; p < (vertical ? rm.h : rm.w) - 60; p += 62) {
          if (vertical) place(rm, 'wall', 62, 8, rm.x + 6, rm.y + p, { color: '#6b6a66', stall: true });
          else place(rm, 'wall', 8, 62, rm.x + p, rm.y + 6, { color: '#6b6a66', stall: true });
        }
        decorIn(rm, 'puddle', ri(1, 2));
        break;
      }
      default:
        scatter(rm, 'cabinet', ri(0, 2), 28, 22, 12);
        decorIn(rm, 'trash', ri(0, 2));
    }
  }

  // --- Lights, signs, props in corridors -------------------------------------------------------
  for (const c of corridors) {
    const lengthwise = c.axis === 'h' ? c.w : c.h;
    for (let p = 110; p < lengthwise - 60; p += ri(220, 280)) {
      const lx = c.axis === 'h' ? c.x + p : c.x + c.w / 2;
      const ly = c.axis === 'h' ? c.y + c.h / 2 : c.y + p;
      lamps.push({ x: lx, y: ly, r: 155, k: 0.72, interior: true, broken: chance(0.2), axis: c.axis });
    }
    if (c.axis === 'v') {
      signs.push({ x: c.x + c.w / 2, y: c.y + 14 }, { x: c.x + c.w / 2, y: c.y + c.h - 14 });
    }
  }
  for (const rm of rooms) {
    if (chance(0.28)) continue; // some rooms are pitch dark
    const nx = Math.max(1, Math.round(rm.w / 300));
    const ny = Math.max(1, Math.round(rm.h / 300));
    for (let ix = 0; ix < nx; ix++) {
      for (let iy = 0; iy < ny; iy++) {
        lamps.push({ x: rm.x + (rm.w * (ix + 0.5)) / nx, y: rm.y + (rm.h * (iy + 0.5)) / ny, r: 150, k: 0.7, interior: true, broken: chance(0.15), axis: rm.w >= rm.h ? 'h' : 'v' });
      }
    }
  }
  signs.push({ x: endRoom.door.x - 40, y: endRoom.door.y - 12, safe: true }, { x: startRoom.door.x + 40, y: startRoom.door.y - 12, safe: true });

  // Vending machines and a couple of fire-alarm boxes along corridor walls.
  const corridorWallSpots = [];
  for (const o of obstacles) {
    if (o.kind !== 'wall' || o.safe || o.exterior || o.stall) continue;
    const horiz = o.w > o.h;
    if ((horiz ? o.w : o.h) < 120) continue;
    for (const c of corridors) {
      // Wall segment lying on this corridor's edge?
      if (horiz && o.x >= c.x - 2 && o.x + o.w <= c.x + c.w + 2) {
        if (Math.abs(o.y + o.h - c.y) <= 1) corridorWallSpots.push({ o, side: 'below', c });
        if (Math.abs(o.y - (c.y + c.h)) <= 1) corridorWallSpots.push({ o, side: 'above', c });
      }
      if (!horiz && o.y >= c.y - 2 && o.y + o.h <= c.y + c.h + 2) {
        if (Math.abs(o.x + o.w - c.x) <= 1) corridorWallSpots.push({ o, side: 'right', c });
        if (Math.abs(o.x - (c.x + c.w)) <= 1) corridorWallSpots.push({ o, side: 'left', c });
      }
    }
  }
  const spotRect = (s, w, d) => {
    const o = s.o;
    const horiz = o.w > o.h;
    const mid = horiz ? o.x + o.w * r(0.3, 0.7) : o.y + o.h * r(0.3, 0.7);
    if (s.side === 'below') return { x: mid - w / 2, y: o.y + o.h, w, h: d };
    if (s.side === 'above') return { x: mid - w / 2, y: o.y - d, w, h: d };
    if (s.side === 'right') return { x: o.x + o.w, y: mid - w / 2, w: d, h: w };
    return { x: o.x - d, y: mid - w / 2, w: d, h: w };
  };
  const shuffled = shuffle(corridorWallSpots, rnd);
  let alarms = 0;
  let vend = 0;
  for (const s of shuffled) {
    if (alarms < 2) {
      const a = spotRect(s, 18, 12);
      if (Math.hypot(a.x - start.x, a.y - start.y) > 900 && free(a, 30) && !obstacles.some((o) => o.alarm && Math.hypot(o.x - a.x, o.y - a.y) < 1200)) {
        ob('alarmbox', a.x, a.y, a.w, a.h, { alarm: true });
        alarms++;
        continue;
      }
    }
    if (vend < 5) {
      const v = spotRect(s, 40, 28);
      if (free(v, 40)) {
        const tint = ['rgba(255,120,110,0.13)', 'rgba(120,180,255,0.13)', 'rgba(130,255,150,0.12)'][vend % 3];
        ob('vending', v.x, v.y, v.w, v.h, { color: ['#7a2a2a', '#2a4a7a', '#3a6a3a'][vend % 3] });
        glows.push({ x: v.x + v.w / 2, y: v.y + v.h / 2, r: 75, k: 0.42, tint });
        vend++;
      }
    }
  }

  // Burning barrels in a couple of big rooms: light sources + landmarks.
  for (const rm of shuffle(rooms.filter((q) => q.type === 'warehouse' || q.type === 'cafeteria' || q.type === 'lobby'), rnd)) {
    if (fires.length >= 2) break;
    const b = { x: rm.x + r(60, rm.w - 88), y: rm.y + r(60, rm.h - 88), w: 28, h: 28 };
    if (!free(b, 30)) continue;
    ob('barrel', b.x, b.y, b.w, b.h);
    fires.push({ x: b.x + 14, y: b.y + 14 });
  }

  // Medkits in random rooms.
  let kits = 0;
  for (const rm of shuffle(rooms.slice(), rnd)) {
    if (kits >= 11) break;
    const p = { x: rm.x + r(30, rm.w - 30), y: rm.y + r(30, rm.h - 30) };
    if (!free({ x: p.x - 14, y: p.y - 14, w: 28, h: 28 }, 6)) continue;
    if (Math.hypot(p.x - start.x, p.y - start.y) < 500) continue;
    if (pickups.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 420)) continue;
    pickups.push({ kind: 'medkit', x: p.x, y: p.y });
    kits++;
  }

  // Corridor clutter.
  for (const c of corridors) {
    const n2 = Math.round((c.w * c.h) / 40000);
    for (let k = 0; k < n2; k++) decor.push({ type: chance(0.5) ? 'papers' : 'trash', x: c.x + r(10, c.w - 10), y: c.y + r(10, c.h - 10), s: r(0.7, 1.3), a: r(0, Math.PI) });
  }

  // The route must stay open: check with the real nav grid, lift barricades if needed.
  const goalOpen = () => {
    const w = new World({ w: W, h: H, obstacles });
    w.flow.compute(start.x, start.y);
    const er = endRoom.interior;
    return Number.isFinite(w.flow.pathDist(er.x + er.w / 2, er.y + er.h / 2));
  };
  while (barricades.length && !goalOpen()) {
    const b = barricades.pop();
    obstacles.splice(obstacles.indexOf(b), 1);
  }

  // Outside the shell: solid border for safety.
  const BO = 400;
  ob('border', -BO, -BO, W + 2 * BO, BO);
  ob('border', -BO, H, W + 2 * BO, BO);
  ob('border', -BO, 0, BO, H);
  ob('border', W, 0, BO, H);

  return {
    seed,
    theme: 'interior',
    w: W,
    h: H,
    obstacles,
    rooms,
    corridors,
    blocks,
    doors,
    signs,
    glows,
    streets: [],
    intersections: [],
    markings: { dashes: [], crosswalks: [], parking: [] },
    lamps,
    pickups,
    decor,
    fires,
    start,
    startRoom,
    endRoom,
    wanderDensity: 1.35, // interiors are crowded
    darknessBoost: 0.05,
  };
}
