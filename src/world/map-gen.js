// Seeded procedural city: a street grid with mixed blocks, parked cars,
// alarm cars, burning wrecks, street lamps and two safe rooms (start bottom
// left, goal top right). Streets are always left passable, so the route is
// guaranteed to connect.

import { mulberry32, rectsOverlap, shuffle } from '../util.js';

export const WORLD_W = 5800;
export const WORLD_H = 3600;
const NX = 8;
const NY = 5;
const STREET = 184;
const SIDEWALK = 22;

// move: blocks movement, shot: stops bullets, sight: blocks line of sight / light.
const KINDS = {
  building: { move: true, shot: true, sight: true },
  wall: { move: true, shot: true, sight: true },
  border: { move: true, shot: true, sight: true },
  car: { move: true, shot: true, sight: false },
  crate: { move: true, shot: true, sight: false },
  dumpster: { move: true, shot: true, sight: false },
  statue: { move: true, shot: true, sight: false },
  fence: { move: true, shot: false, sight: false },
  planter: { move: true, shot: false, sight: false },
  bench: { move: true, shot: false, sight: false },
  tree: { move: true, shot: false, sight: false },
  fountain: { move: true, shot: false, sight: false },
};

const ROOFS = ['#3d4148', '#4a4540', '#3a4446', '#47423f', '#3f3b45', '#434a4f', '#4b4744'];
const CAR_COLORS = ['#6d2e2e', '#2e4a6d', '#6b6b6b', '#3f5f3a', '#8a7b52', '#4a3a5c', '#2f2f2f', '#7a4a22', '#9a9a94'];

function ob(kind, x, y, w, h, extra = {}) {
  return { kind, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), ...KINDS[kind], ...extra };
}

function splitAxis(total, n, rnd) {
  const avail = total - (n - 1) * STREET;
  const weights = Array.from({ length: n }, () => 0.82 + rnd() * 0.36);
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = [];
  let pos = 0;
  for (let i = 0; i < n; i++) {
    const w = i === n - 1 ? total - pos : Math.round((avail * weights[i]) / sum);
    out.push([pos, pos + w]);
    pos += w + STREET;
  }
  return out;
}

export function generateCity(seed) {
  const rnd = mulberry32(seed);
  const r = (a, b) => a + rnd() * (b - a);
  const ri = (a, b) => Math.floor(r(a, b + 1));
  const chance = (p) => rnd() < p;

  const xs = splitAxis(WORLD_W, NX, rnd);
  const ys = splitAxis(WORLD_H, NY, rnd);
  const obstacles = [];
  const blocks = [];
  const streets = [];
  const lamps = [];
  const pickups = [];
  const decor = [];
  const markings = { dashes: [], crosswalks: [], parking: [] };
  const fires = [];
  let startRoom = null;
  let endRoom = null;
  let start = null;

  const free = (rect, pad = 0) => !obstacles.some((o) => rectsOverlap(o, rect, pad));

  // --- Streets -------------------------------------------------------------
  for (let i = 0; i < NX - 1; i++) {
    streets.push({ dir: 'v', x: xs[i][1], y: 0, w: xs[i + 1][0] - xs[i][1], h: WORLD_H });
  }
  for (let j = 0; j < NY - 1; j++) {
    streets.push({ dir: 'h', x: 0, y: ys[j][1], w: WORLD_W, h: ys[j + 1][0] - ys[j][1] });
  }

  // --- Blocks ----------------------------------------------------------------
  const typeTable = [
    ['buildings', 0.5],
    ['parking', 0.15],
    ['park', 0.14],
    ['plaza', 0.09],
    ['construction', 0.12],
  ];
  const pickType = () => {
    let x = rnd();
    for (const [t, w] of typeTable) {
      if ((x -= w) < 0) return t;
    }
    return 'buildings';
  };

  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NY; j++) {
      const b = { x: xs[i][0], y: ys[j][0], w: xs[i][1] - xs[i][0], h: ys[j][1] - ys[j][0] };
      // Sidewalks only on sides that face a street (edge blocks run to the border).
      const l = i > 0 ? SIDEWALK : 0;
      const rr = i < NX - 1 ? SIDEWALK : 0;
      const t = j > 0 ? SIDEWALK : 0;
      const bb = j < NY - 1 ? SIDEWALK : 0;
      const inner = { x: b.x + l, y: b.y + t, w: b.w - l - rr, h: b.h - t - bb };
      let type = pickType();
      if (i === 0 && j === NY - 1) type = 'start';
      if (i === NX - 1 && j === 0) type = 'end';
      blocks.push({ ...b, inner, type, i, j });
    }
  }

  // --- Block contents ------------------------------------------------------
  function building(rect) {
    const inset = () => (chance(0.5) ? ri(0, 14) : 0);
    const x0 = rect.x + inset();
    const y0 = rect.y + inset();
    const x1 = rect.x + rect.w - inset();
    const y1 = rect.y + rect.h - inset();
    if (x1 - x0 < 50 || y1 - y0 < 50) return;
    obstacles.push(
      ob('building', x0, y0, x1 - x0, y1 - y0, {
        color: ROOFS[ri(0, ROOFS.length - 1)],
        vents: ri(0, 3),
        seed: ri(0, 1e6),
      }),
    );
  }

  function courtyard(rect) {
    if (rect.w > 120 && rect.h > 90) {
      const dw = 62;
      const dh = 34;
      const dx = rect.x + r(10, rect.w - dw - 10);
      const dy = chance(0.5) ? rect.y + 8 : rect.y + rect.h - dh - 8;
      obstacles.push(ob('dumpster', dx, dy, dw, dh, { color: chance(0.5) ? '#2f4f3a' : '#3a3f5a' }));
    }
    const n = ri(0, 2);
    for (let k = 0; k < n; k++) {
      const s = 34;
      const c = ob('crate', rect.x + r(10, Math.max(11, rect.w - s - 10)), rect.y + r(10, Math.max(11, rect.h - s - 10)), s, s);
      if (free(c, 40)) obstacles.push(c);
    }
    decor.push({ type: 'trash', x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, s: r(0.8, 1.4) });
  }

  function fillBuildings(rect, depth = 0) {
    const min = 140;
    const canX = rect.w > min * 2 + 70;
    const canY = rect.h > min * 2 + 70;
    if ((!canX && !canY) || depth >= 3 || (depth >= 1 && chance(0.2))) {
      if (depth > 0 && chance(0.1)) courtyard(rect);
      else building(rect);
      return;
    }
    const splitX = canX && (!canY || (rect.w >= rect.h ? chance(0.8) : chance(0.2)));
    const alley = chance(0.72) ? ri(66, 96) : 0;
    if (splitX) {
      const at = rect.w * r(0.35, 0.65);
      fillBuildings({ x: rect.x, y: rect.y, w: at - alley / 2, h: rect.h }, depth + 1);
      fillBuildings({ x: rect.x + at + alley / 2, y: rect.y, w: rect.w - at - alley / 2, h: rect.h }, depth + 1);
    } else {
      const at = rect.h * r(0.35, 0.65);
      fillBuildings({ x: rect.x, y: rect.y, w: rect.w, h: at - alley / 2 }, depth + 1);
      fillBuildings({ x: rect.x, y: rect.y + at + alley / 2, w: rect.w, h: rect.h - at - alley / 2 }, depth + 1);
    }
  }

  function parking(rect) {
    const slotW = 56;
    const carW = 44;
    const carH = 86;
    const lane = 112;
    let y = rect.y + 40;
    while (y + carH * 2 <= rect.y + rect.h - 40) {
      for (let row = 0; row < 2; row++) {
        const ry = y + row * carH;
        for (let x = rect.x + 36; x + slotW <= rect.x + rect.w - 36; x += slotW) {
          markings.parking.push({ x, y: ry, w: slotW, h: carH });
          if (chance(0.5)) {
            obstacles.push(
              ob('car', x + (slotW - carW) / 2, ry + 4, carW, carH - 8, {
                color: CAR_COLORS[ri(0, CAR_COLORS.length - 1)],
                vertical: true,
                front: row === 0 ? 1 : -1,
              }),
            );
          }
        }
      }
      y += carH * 2 + lane;
    }
    // Attendant booth.
    const booth = ob('building', rect.x + 8, rect.y + rect.h - 58, 56, 50, { color: '#4a4d52', vents: 0, seed: 1 });
    if (free(booth, 10)) obstacles.push(booth);
  }

  function fenceRing(rect, gapMid = 150, gapCorner = 50) {
    const t = 6;
    const seg = (x, y, w, h) => {
      if (w > 12 && h > 0) obstacles.push(ob('fence', x, y, w, h));
      else if (h > 12 && w > 0) obstacles.push(ob('fence', x, y, w, h));
    };
    const sideH = (x0, x1, y) => {
      const mid = (x0 + x1) / 2;
      seg(x0 + gapCorner, y, mid - gapMid / 2 - (x0 + gapCorner), t);
      seg(mid + gapMid / 2, y, x1 - gapCorner - (mid + gapMid / 2), t);
    };
    const sideV = (y0, y1, x) => {
      const mid = (y0 + y1) / 2;
      seg(x, y0 + gapCorner, t, mid - gapMid / 2 - (y0 + gapCorner));
      seg(x, mid + gapMid / 2, t, y1 - gapCorner - (mid + gapMid / 2));
    };
    sideH(rect.x, rect.x + rect.w, rect.y);
    sideH(rect.x, rect.x + rect.w, rect.y + rect.h - t);
    sideV(rect.y, rect.y + rect.h, rect.x);
    sideV(rect.y, rect.y + rect.h, rect.x + rect.w - t);
  }

  function scatter(rect, kind, n, size, pad, extra = () => ({})) {
    let placed = 0;
    for (let k = 0; k < n * 8 && placed < n; k++) {
      const w = typeof size === 'function' ? size() : size;
      if (rect.w < w[0] + 2 * pad || rect.h < w[1] + 2 * pad) continue;
      const o = ob(kind, rect.x + r(pad, rect.w - w[0] - pad), rect.y + r(pad, rect.h - w[1] - pad), w[0], w[1], extra());
      if (free(o, 46)) {
        obstacles.push(o);
        placed++;
      }
    }
  }

  function park(rect) {
    fenceRing(rect, 150, 54);
    const inner = { x: rect.x + 30, y: rect.y + 30, w: rect.w - 60, h: rect.h - 60 };
    if (inner.w > 260 && inner.h > 260) {
      const s = 96;
      obstacles.push(ob('fountain', rect.x + rect.w / 2 - s / 2, rect.y + rect.h / 2 - s / 2, s, s));
    }
    scatter(inner, 'tree', ri(5, 10), [36, 36], 10, () => ({ seed: ri(0, 1e6) }));
    scatter(inner, 'bench', ri(2, 4), () => (chance(0.5) ? [52, 16] : [16, 52]), 20);
    for (let k = 0; k < 6; k++) decor.push({ type: 'leaves', x: inner.x + r(0, inner.w), y: inner.y + r(0, inner.h), s: r(0.8, 1.6) });
  }

  function plaza(rect) {
    const kw = 92;
    const kh = 66;
    obstacles.push(ob('building', rect.x + r(20, rect.w - kw - 20), rect.y + 20, kw, kh, { color: '#504a42', vents: 1, seed: ri(0, 1e6) }));
    obstacles.push(ob('statue', rect.x + rect.w / 2 - 20, rect.y + rect.h / 2 - 20, 40, 40));
    scatter(rect, 'planter', ri(4, 8), [40, 40], 26);
    scatter(rect, 'bench', ri(1, 3), () => (chance(0.5) ? [52, 16] : [16, 52]), 30);
  }

  function construction(rect) {
    fenceRing(rect, 130, 70);
    const inner = { x: rect.x + 40, y: rect.y + 40, w: rect.w - 80, h: rect.h - 80 };
    // An unfinished concrete shell: an L of walls with a wide opening.
    const wx = inner.x + r(0, inner.w * 0.25);
    const wy = inner.y + r(0, inner.h * 0.25);
    const ww = inner.w * r(0.45, 0.6);
    const wh = inner.h * r(0.45, 0.6);
    obstacles.push(ob('wall', wx, wy, ww, 16, { color: '#5b5852' }));
    obstacles.push(ob('wall', wx, wy, 16, wh, { color: '#5b5852' }));
    scatter(inner, 'crate', ri(4, 8), [34, 34], 10);
    scatter(inner, 'crate', ri(1, 3), () => (chance(0.5) ? [130, 22] : [22, 130]), 10, () => ({ pipe: true }));
    scatter(inner, 'dumpster', 1, [62, 34], 10, () => ({ color: '#6b5a2a' }));
  }

  function safeRoom(rect, doorSide, isEnd) {
    const W = 232;
    const H = 192;
    const T = 16;
    const door = 88;
    let x;
    let y;
    if (doorSide === 'right') {
      x = rect.x + rect.w - W;
      y = rect.y + 34;
    } else {
      x = rect.x;
      y = rect.y + rect.h - H - 34;
    }
    const color = '#3d5a45';
    const wall = (wx, wy, ww, wh) => obstacles.push(ob('wall', wx, wy, ww, wh, { color, safe: true }));
    wall(x, y, W, T); // top
    wall(x, y + H - T, W, T); // bottom
    const dy0 = y + (H - door) / 2;
    if (doorSide === 'right') {
      wall(x, y + T, T, H - 2 * T); // left
      wall(x + W - T, y + T, T, dy0 - (y + T)); // right upper
      wall(x + W - T, dy0 + door, T, y + H - T - (dy0 + door)); // right lower
    } else {
      wall(x + W - T, y + T, T, H - 2 * T); // right
      wall(x, y + T, T, dy0 - (y + T));
      wall(x, dy0 + door, T, y + H - T - (dy0 + door));
    }
    const interior = { x: x + T, y: y + T, w: W - 2 * T, h: H - 2 * T };
    const door1 = doorSide === 'right'
      ? { x: x + W - T, y: dy0, w: T, h: door }
      : { x, y: dy0, w: T, h: door };
    pickups.push({ kind: 'medkit', x: interior.x + 26, y: interior.y + 26 });
    if (isEnd) pickups.push({ kind: 'medkit', x: interior.x + interior.w - 26, y: interior.y + 26 });

    // Fill the rest of the block with buildings, keeping an alley around the room.
    const gap = 74;
    if (doorSide === 'right') {
      fillBuildings({ x: rect.x, y: rect.y, w: rect.w - W - gap, h: rect.h }, 1);
      fillBuildings({ x: x, y: y + H + gap, w: W, h: rect.y + rect.h - (y + H + gap) }, 1);
    } else {
      fillBuildings({ x: rect.x + W + gap, y: rect.y, w: rect.w - W - gap, h: rect.h }, 1);
      fillBuildings({ x: x, y: rect.y, w: W, h: y - gap - rect.y }, 1);
    }
    return { interior, door: door1, outer: { x, y, w: W, h: H } };
  }

  for (const b of blocks) {
    const inn = b.inner;
    switch (b.type) {
      case 'start':
        startRoom = safeRoom(inn, 'right', false);
        start = { x: startRoom.interior.x + startRoom.interior.w / 2, y: startRoom.interior.y + startRoom.interior.h / 2 + 10 };
        break;
      case 'end':
        endRoom = safeRoom(inn, 'left', true);
        break;
      case 'parking':
        parking(inn);
        break;
      case 'park':
        park(inn);
        break;
      case 'plaza':
        plaza(inn);
        break;
      case 'construction':
        construction(inn);
        break;
      default:
        fillBuildings(inn);
    }
  }

  // --- Street furniture ------------------------------------------------------
  const intersections = [];
  for (const sv of streets.filter((s) => s.dir === 'v')) {
    for (const sh of streets.filter((s) => s.dir === 'h')) {
      intersections.push({ x: sv.x, y: sh.y, w: sv.w, h: sh.h });
    }
  }
  const inIntersection = (rect, pad) => intersections.some((it) => rectsOverlap(it, rect, pad));

  // Never park in front of a safe-room door.
  const keepOut = [startRoom, endRoom].map((room) => {
    const d = room.door;
    return { x: d.x - 160, y: d.y - 70, w: d.w + 320, h: d.h + 140 };
  });
  const streetCars = [];
  const placeCar = (rect, extra) => {
    if (inIntersection(rect, 26) || !free(rect, 24)) return null;
    if (keepOut.some((k) => rectsOverlap(k, rect))) return null;
    const car = ob('car', rect.x, rect.y, rect.w, rect.h, { color: CAR_COLORS[ri(0, CAR_COLORS.length - 1)], ...extra });
    obstacles.push(car);
    streetCars.push(car);
    return car;
  };

  for (const s of streets) {
    const along = s.dir === 'v' ? ys : xs;
    for (const seg of along) {
      const segLen = seg[1] - seg[0];
      const n = ri(0, segLen > 520 ? 3 : 2);
      for (let k = 0; k < n; k++) {
        const lanePick = rnd();
        // Mostly parked at a curb, sometimes abandoned mid-lane.
        const off = lanePick < 0.4 ? 30 : lanePick < 0.8 ? s[s.dir === 'v' ? 'w' : 'h'] - 30 : chance(0.5) ? 72 : s[s.dir === 'v' ? 'w' : 'h'] - 72;
        const p = seg[0] + r(30, segLen - 120);
        const rect = s.dir === 'v'
          ? { x: s.x + off - 22, y: p, w: 44, h: 86 }
          : { x: p, y: s.y + off - 22, w: 86, h: 44 };
        // One car across the street at a time so it never gets blocked.
        const across = s.dir === 'v'
          ? { x: s.x, y: rect.y - 30, w: s.w, h: rect.h + 60 }
          : { x: rect.x - 30, y: s.y, w: rect.w + 60, h: s.h };
        if (streetCars.some((c) => rectsOverlap(c, across))) continue;
        placeCar(rect, { vertical: s.dir === 'v', front: chance(0.5) ? 1 : -1 });
      }
    }
    // Dashed centre line.
    if (s.dir === 'v') markings.dashes.push({ x0: s.x + s.w / 2, y0: s.y, x1: s.x + s.w / 2, y1: s.y + s.h });
    else markings.dashes.push({ x0: s.x, y0: s.y + s.h / 2, x1: s.x + s.w, y1: s.y + s.h / 2 });
  }

  // Crosswalk stripes on each side of every intersection.
  for (const it of intersections) {
    markings.crosswalks.push({ x: it.x, y: it.y - 4, w: it.w, h: 26, dir: 'h' });
    markings.crosswalks.push({ x: it.x, y: it.y + it.h - 22, w: it.w, h: 26, dir: 'h' });
    markings.crosswalks.push({ x: it.x - 4, y: it.y, w: 26, h: it.h, dir: 'v' });
    markings.crosswalks.push({ x: it.x + it.w - 22, y: it.y, w: 26, h: it.h, dir: 'v' });
  }

  // Alarm cars: far from the start, spread out. Shooting one starts a panic event.
  const shuffled = shuffle(streetCars.slice(), rnd);
  const alarms = [];
  for (const c of shuffled) {
    if (alarms.length >= 4) break;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    if (Math.hypot(cx - start.x, cy - start.y) < 900) continue;
    if (alarms.some((a) => Math.hypot(a.x + a.w / 2 - cx, a.y + a.h / 2 - cy) < 1100)) continue;
    c.alarm = true;
    c.color = '#b8b8b2';
    alarms.push(c);
  }
  // Burning wrecks: light sources and landmarks.
  for (const c of shuffled) {
    if (fires.length >= 3) break;
    if (c.alarm) continue;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    if (Math.hypot(cx - start.x, cy - start.y) < 700) continue;
    if (fires.some((f) => Math.hypot(f.x - cx, f.y - cy) < 1200)) continue;
    c.wreck = true;
    c.color = '#2a2420';
    fires.push({ x: cx, y: cy });
  }

  // Street lamps along every street, alternating sides.
  for (const s of streets) {
    const len = s.dir === 'v' ? s.h : s.w;
    let side = 0;
    for (let p = 160; p < len - 80; p += 330) {
      side ^= 1;
      const lamp = s.dir === 'v'
        ? { x: side ? s.x - 6 : s.x + s.w + 6, y: s.y + p }
        : { x: s.x + p, y: side ? s.y - 6 : s.y + s.h + 6 };
      if (inIntersection({ x: lamp.x - 1, y: lamp.y - 1, w: 2, h: 2 }, 40)) continue;
      if (chance(0.18)) lamp.broken = true;
      lamps.push(lamp);
    }
  }

  // Medkits scattered along sidewalks (the route is long and the horde bites).
  let kits = 0;
  for (let k = 0; k < 300 && kits < 14; k++) {
    const b = blocks[ri(0, blocks.length - 1)];
    if (b.type === 'start') continue;
    const side = ri(0, 3);
    const p = { x: 0, y: 0 };
    if (side === 0) { p.x = b.x + r(20, b.w - 20); p.y = b.y + SIDEWALK / 2; }
    if (side === 1) { p.x = b.x + r(20, b.w - 20); p.y = b.y + b.h - SIDEWALK / 2; }
    if (side === 2) { p.x = b.x + SIDEWALK / 2; p.y = b.y + r(20, b.h - 20); }
    if (side === 3) { p.x = b.x + b.w - SIDEWALK / 2; p.y = b.y + r(20, b.h - 20); }
    if (p.x < 30 || p.y < 30 || p.x > WORLD_W - 30 || p.y > WORLD_H - 30) continue;
    if (Math.hypot(p.x - start.x, p.y - start.y) < 600) continue;
    if (!free({ x: p.x - 14, y: p.y - 14, w: 28, h: 28 }, 6)) continue;
    if (pickups.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 500)) continue;
    pickups.push({ kind: 'medkit', x: p.x, y: p.y });
    kits++;
  }

  // Ground clutter (no collision).
  for (let k = 0; k < 160; k++) {
    const x = r(0, WORLD_W);
    const y = r(0, WORLD_H);
    if (!free({ x: x - 10, y: y - 10, w: 20, h: 20 })) continue;
    const t = rnd();
    decor.push({ type: t < 0.35 ? 'puddle' : t < 0.6 ? 'crack' : t < 0.8 ? 'trash' : 'manhole', x, y, s: r(0.7, 1.5), a: r(0, Math.PI) });
  }

  // World border.
  const B = 400;
  obstacles.push(ob('border', -B, -B, WORLD_W + 2 * B, B));
  obstacles.push(ob('border', -B, WORLD_H, WORLD_W + 2 * B, B));
  obstacles.push(ob('border', -B, 0, B, WORLD_H));
  obstacles.push(ob('border', WORLD_W, 0, B, WORLD_H));

  return {
    seed,
    w: WORLD_W,
    h: WORLD_H,
    obstacles,
    blocks,
    streets,
    intersections,
    markings,
    lamps,
    pickups,
    decor,
    fires,
    start,
    startRoom,
    endRoom,
  };
}
