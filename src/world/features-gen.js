// World features, each optional and seeded from the map. They run before
// scavenging, on either level:
//
//   - Holdout: a quarantine wall splits the map from edge to edge (down a
//     street, or down a cross corridor indoors). The only way through is a
//     locked gate: start it at the control box, then hold out while it opens.
//   - Two routes: a second wall. Its open checkpoint sits at the opposite end
//     to the first wall's gate, so the safe way snakes up one side and down
//     the other. A boarded breach next to the first gate is the short way:
//     loud to break, a nest of sleepers behind it, alarm cars, no lights.
//   - Landmarks: streets get a gas station (shoot a pump: it blows), a crashed
//     helicopter and an army checkpoint; the building gets a rack of gas
//     cylinders, a field post and a collapsed ceiling.
//
// Every placement is checked on a strict nav grid (cells a body fits in): the
// safe room must stay reachable, or the piece is taken back out.

import { World, FlowField, NAV_CELL } from './world.js';
import { mulberry32, shuffle, rectsOverlap, pointInRect } from '../util.js';

const INF = 0x3fffffff;
const U = NAV_CELL / 10;

const CFG = {
  city: { wallT: 24, gateT: 14, open: 150, breach: 112 },
  interior: { wallT: 16, gateT: 12, open: 104, breach: 96 },
};
export const BREACH_HP = 240;
export const EXPLOSIVE_HP = 45;
const CAR_COLORS = ['#6d2e2e', '#2e4a6d', '#6b6b6b', '#3f5f3a', '#8a7b52', '#4a3a5c'];

export function addWorldFeatures(map, seed, opts = {}) {
  const rnd = mulberry32((Math.imul(seed | 0, 0x85ebca6b) ^ 0x2c1b3c6d) >>> 0);
  const interior = map.theme === 'interior';
  map.holdout = null;
  map.breach = null;
  map.checkpoints = [];
  map.nests = [];
  map.landmarks = [];
  map.explosives = [];
  map.canopies = [];
  map.glows = map.glows || [];
  map.floors = map.floors || [];
  if (opts.holdout || opts.routes) placeWalls(map, rnd, !!opts.holdout, !!opts.routes, interior);
  if (opts.landmarks) {
    if (interior) buildingLandmarks(map, rnd);
    else cityLandmarks(map, rnd);
  }
  map.features = { holdout: !!map.holdout, routes: !!map.breach, landmarks: map.landmarks.map((l) => l.kind) };
  return map;
}

// --- Shared helpers ---------------------------------------------------------------------------

const goalOf = (map) => {
  const er = map.endRoom.interior;
  return { x: er.x + er.w / 2, y: er.y + er.h / 2 };
};

/** Strict world of the map (+ extra obstacles); things that open in the run count as open. */
function strictWorld(map, extra = [], drop = null) {
  const gone = new Set(Array.isArray(drop) ? drop : drop ? [drop] : []);
  const obs = map.obstacles.filter((o) => !o.opens && !gone.has(o)).concat(extra);
  return new World({ ...map, obstacles: obs, sealed: [] }, { strict: true });
}

function fieldsOf(world, map) {
  const fs = new FlowField(world);
  fs.compute(map.start.x, map.start.y);
  const g = goalOf(map);
  const fg = new FlowField(world);
  fg.compute(g.x, g.y);
  const gi = world.nearestFree(world.navIndex(g.x, g.y));
  return { fs, fg, route: gi >= 0 ? fs.dist[gi] : INF };
}

function routeLen(world, map) {
  const f = new FlowField(world);
  f.compute(map.start.x, map.start.y);
  const g = goalOf(map);
  return f.pathDist(g.x, g.y);
}

/** Lowest detour and the progress there over free reachable cells inside rect. */
function rectStats(world, A, rect) {
  const cs = NAV_CELL;
  let best = INF;
  let prog = 0;
  const x0 = Math.max(0, Math.floor(rect.x / cs));
  const x1 = Math.min(world.navW - 1, Math.floor((rect.x + rect.w) / cs));
  const y0 = Math.max(0, Math.floor(rect.y / cs));
  const y1 = Math.min(world.navH - 1, Math.floor((rect.y + rect.h) / cs));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * world.navW + x;
      if (world.blocked[i] || A.fs.dist[i] >= INF || A.fg.dist[i] >= INF) continue;
      const det = (A.fs.dist[i] + A.fg.dist[i] - A.route) * U;
      if (det < best) {
        best = det;
        prog = A.fs.dist[i] / (A.fs.dist[i] + A.fg.dist[i]);
      }
    }
  }
  return { detour: best, prog };
}

const snapshot = (map) => ({
  landmarks: map.landmarks.slice(),
  checkpoints: map.checkpoints.slice(),
  nests: map.nests.slice(),
  lamps: map.lamps.map((l) => ({ ...l })),
  obstacles: map.obstacles.slice(),
  decor: map.decor.slice(),
  pickups: map.pickups.slice(),
  fires: map.fires.slice(),
  glows: map.glows.slice(),
  canopies: map.canopies.slice(),
  explosives: map.explosives.slice(),
  floors: map.floors.slice(),
  blocks: map.blocks.map((b) => b.type),
});
function restore(map, s) {
  for (const k of ['landmarks', 'checkpoints', 'nests', 'lamps', 'obstacles', 'decor', 'pickups', 'fires', 'glows', 'canopies', 'explosives', 'floors']) {
    map[k].length = 0;
    map[k].push(...s[k]);
  }
  map.blocks.forEach((b, i) => {
    b.type = s.blocks[i];
  });
}

/** Keep a landmark only if the safe room and its own spot are still reachable on foot. */
function landmarkOk(map, spot) {
  const w = strictWorld(map);
  const f = new FlowField(w);
  f.compute(map.start.x, map.start.y);
  const g = goalOf(map);
  if (!Number.isFinite(f.pathDist(g.x, g.y))) return false;
  return !spot || Number.isFinite(f.pathDist(spot.x, spot.y));
}

const ob = (kind, x, y, w, h, extra = {}) => ({ kind, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), ...extra });
const solid = { move: true, shot: true, sight: false };
const low = { move: true, shot: false, sight: false }; // sandbags & co: you shoot over them

function clearRect(map, rect, keep = () => false) {
  const out = map.obstacles.filter((o) => o.kind === 'border' || keep(o) || !rectsOverlap(o, rect, -1));
  map.obstacles.length = 0;
  map.obstacles.push(...out);
  const d = map.decor.filter((q) => !pointInRect(q.x, q.y, rect));
  map.decor.length = 0;
  map.decor.push(...d);
  const f = map.fires.filter((q) => !pointInRect(q.x, q.y, rect, 10));
  map.fires.length = 0;
  map.fires.push(...f);
  const p = map.pickups.filter((q) => !pointInRect(q.x, q.y, rect));
  map.pickups.length = 0;
  map.pickups.push(...p);
}

const spray = (map, x, y, text, color = '#e8e8e0', a = null, size = 1) => map.decor.push({ type: 'spray', x, y, text, color, a, s: size });

// --- Walls: holdout gate / two routes -------------------------------------------------------------
//
// A wall line runs top to bottom and cuts the map in two. Streets: a concrete
// wall down the middle of a north-south street; openings sit where the cross
// streets meet it. Building: the quarantine follows the wall on the east side
// of a cross corridor; every door in it is welded shut except the openings
// (the corridor itself stays full width).

function wallLines(map, interior) {
  if (interior) {
    const T = 14;
    return map.corridors
      .filter((c) => c.axis === 'v')
      .sort((a, b) => a.x - b.x)
      .map((c) => {
        const x = c.x + c.w;
        const y0 = c.y;
        const y1 = c.y + c.h;
        // The gaps in that wall (doors, the main hall crossing) are the possible openings.
        const cov = map.obstacles
          .filter((o) => o.move && o.kind !== 'border' && o.x < x + T - 2 && o.x + o.w > x + 2 && o.y < y1 && o.y + o.h > y0)
          .map((o) => [Math.max(y0, o.y), Math.min(y1, o.y + o.h)])
          .sort((a, b) => a[0] - b[0]);
        const gaps = [];
        let cur = y0;
        for (const [a, b] of cov) {
          if (a > cur + 1) gaps.push({ y0: cur, y1: a, cy: (cur + a) / 2 });
          cur = Math.max(cur, b);
        }
        if (y1 > cur + 1) gaps.push({ y0: cur, y1, cy: (cur + y1) / 2 });
        const slots = gaps.filter((g) => g.y1 - g.y0 >= 40);
        // Holes can also be knocked through near either end (a room is behind every stretch).
        const cutH = 90;
        const top = { y0: y0 + 40, y1: y0 + 40 + cutH, cut: true };
        const bot = { y0: y1 - 40 - cutH, y1: y1 - 40, cut: true };
        for (const q of [top, bot]) {
          q.cy = (q.y0 + q.y1) / 2;
          if (!slots.some((g) => g.y1 > q.y0 - 150 && g.y0 < q.y1 + 150)) slots.push(q);
        }
        slots.sort((a, b) => a.y0 - b.y0);
        const walls = map.obstacles.filter((o) => o.kind === 'wall' && o.x < x + T - 2 && o.x + o.w > x + 2 && o.y < y1 && o.y + o.h > y0);
        return { x, T, y0, y1, band: c, slots, walls };
      });
  }
  const hs = map.streets.filter((s) => s.dir === 'h').sort((a, b) => a.y - b.y);
  return map.streets
    .filter((s) => s.dir === 'v')
    .sort((a, b) => a.x - b.x)
    .map((s) => ({ x: Math.round(s.x + s.w / 2), T: CFG.city.wallT, y0: -40, y1: map.h + 40, band: s, slots: hs.map((h) => ({ cy: h.y + h.h / 2 })) }));
}

function clearBand(map, line) {
  // Streets only: no parked cars in a walled street (the halves stay clear to walk).
  const band = line.band;
  const wallRect = { x: line.x - line.T / 2 - 4, y: line.y0, w: line.T + 8, h: line.y1 - line.y0 };
  const out = [];
  for (const o of map.obstacles) {
    if (o.kind === 'car' && rectsOverlap(o, band, -2)) {
      const f = map.fires.filter((q) => !pointInRect(q.x, q.y, o, 6));
      map.fires.length = 0;
      map.fires.push(...f);
      continue;
    }
    out.push(o);
  }
  map.obstacles.length = 0;
  map.obstacles.push(...out);
  const d = map.decor.filter((q) => !pointInRect(q.x, q.y, wallRect, 16));
  map.decor.length = 0;
  map.decor.push(...d);
  for (const k of map.pickups) if (pointInRect(k.x, k.y, wallRect, 20)) k.x = line.x + (k.x < line.x ? -48 : 48);
}

const opening = (cy, w) => ({ y0: Math.round(cy - w / 2), y1: Math.round(cy + w / 2), cy: Math.round(cy) });

/**
 * Obstacles for one wall line. pick: { gate, check, breach } = slot indices (or
 * undefined). The gate itself is left out unless withGate (it opens in the run).
 */
function lineObstacles(line, pick, C, interior, { breachOpen = false, withGate = false } = {}) {
  const obs = [];
  const qw = (y0, y1) => {
    if (y1 - y0 >= 1) obs.push(ob('qwall', interior ? line.x : line.x - line.T / 2, y0, line.T, y1 - y0, { move: true, shot: true, sight: true, indoor: interior }));
  };
  const out = { obs, drop: [], gate: null, breach: null, open: {} };
  const holes = [];
  for (const [role, i] of Object.entries(pick)) {
    if (i === undefined || i === null) continue;
    const s = line.slots[i];
    let o;
    if (interior) o = role === 'gate' ? opening(s.cy, Math.min(C.open, s.y1 - s.y0)) : { y0: s.y0, y1: s.y1, cy: s.cy };
    else o = opening(s.cy, role === 'breach' ? C.breach : C.open);
    out.open[role] = o;
    holes.push({ role, o, s });
  }
  if (interior) {
    // Weld every gap shut except the openings (a gate narrower than its gap gets plugs either side).
    line.slots.forEach((s, i) => {
      const h = holes.find((q) => q.s === line.slots[i]);
      if (!h) {
        if (!s.cut) qw(s.y0, s.y1);
        return null;
      }
      if (s.cut) {
        // Knock a hole: the wall pieces across it are replaced by what's left above and below.
        for (const w of line.walls) {
          if (w.y >= s.y1 || w.y + w.h <= s.y0) continue;
          out.drop.push(w);
          if (s.y0 - w.y >= 1) obs.push({ ...w, h: s.y0 - w.y });
          if (w.y + w.h - s.y1 >= 1) obs.push({ ...w, y: s.y1, h: w.y + w.h - s.y1 });
        }
      }
      if (h.role === 'gate') {
        qw(s.y0, h.o.y0);
        qw(h.o.y1, s.y1);
      }
      return null;
    });
  } else {
    let cur = line.y0;
    for (const h of holes.slice().sort((a, b) => a.o.y0 - b.o.y0)) {
      qw(cur, h.o.y0);
      cur = h.o.y1;
    }
    qw(cur, line.y1);
  }
  const x = interior ? line.x : line.x - line.T / 2;
  const g = out.open.gate;
  if (g && withGate) {
    out.gate = ob('gate', interior ? line.x : line.x - C.gateT / 2, g.y0, interior ? line.T : C.gateT, g.y1 - g.y0, { move: true, shot: false, sight: false, navOpen: true, opens: true, indoor: interior });
    out.gate.y0 = out.gate.y;
    out.gate.h0 = out.gate.h;
    obs.push(out.gate);
  }
  const b = out.open.breach;
  if (b && !breachOpen) {
    out.breach = ob('boards', x, b.y0, line.T, b.y1 - b.y0, { move: true, shot: true, sight: true, boards: true, breach: true, heavy: true, vertical: true, hp: BREACH_HP, maxHp: BREACH_HP });
    obs.push(out.breach);
  }
  return out;
}

function placeWalls(map, rnd, holdout, routes, interior) {
  const C = CFG[interior ? 'interior' : 'city'];
  const lines = wallLines(map, interior);
  if (lines.length < (interior ? 4 : 7)) return;
  const snap = snapshot(map);
  const ends = (line) => {
    const n = line.slots.length;
    const spine = interior ? line.slots.reduce((bi, s, i) => (s.y1 - s.y0 > line.slots[bi].y1 - line.slots[bi].y0 ? i : bi), 0) : Math.min(1, n - 1);
    return { top: 0, bottom: n - 1, mid: spine };
  };
  const evalCfg = (cfg) => {
    const o1 = lineObstacles(lines[cfg.w1], { gate: cfg.g1 }, C, interior);
    const o2 = lineObstacles(lines[cfg.w2], { check: cfg.g2, breach: cfg.b2 }, C, interior);
    const L = routeLen(strictWorld(map, [...o1.obs, ...o2.obs], [...o1.drop, ...o2.drop]), map);
    const o2b = lineObstacles(lines[cfg.w2], { check: cfg.g2, breach: cfg.b2 }, C, interior, { breachOpen: true });
    const S = routeLen(strictWorld(map, [...o1.obs, ...o2b.obs], [...o1.drop, ...o2b.drop]), map);
    return { L, S, save: Number.isFinite(L) && Number.isFinite(S) ? (L - S) / L : -1 };
  };

  let cfg = null;
  if (routes) {
    const pairs = interior ? [[1, 2], [0, 2], [1, 3], [0, 3]] : [[2, 4]];
    let best = null;
    for (const [w1, w2] of pairs) {
      const a = ends(lines[w1]);
      const b = ends(lines[w2]);
      if (lines[w1].slots.length < 1 || lines[w2].slots.length < 2) continue;
      if (!interior) {
        clearBand(map, lines[w1]);
        clearBand(map, lines[w2]);
      }
      const tries = [
        { w1, g1: a.top, w2, g2: b.bottom, b2: b.top },
        { w1, g1: a.bottom, w2, g2: b.top, b2: b.bottom },
        { w1, g1: a.mid, w2, g2: b.bottom, b2: b.mid },
        { w1, g1: a.mid, w2, g2: b.top, b2: b.mid },
      ].filter((c) => c.g2 !== c.b2);
      for (const c of tries) {
        const r = evalCfg(c);
        if (r.save > (best ? best.save : 0)) best = { c, ...r };
      }
      if (best && best.save >= 0.2) break;
    }
    if (best && best.save >= 0.15) {
      cfg = best.c;
      map.routeInfo = { long: Math.round(best.L), short: Math.round(best.S) };
    } else restore(map, snap);
  }
  if (!cfg) {
    if (!holdout) return; // no wall worth having
    // One wall mid-route; indoors try the middle corridors first, the main hall crossing first.
    const order = interior ? (rnd() < 0.5 ? [1, 2, 0, 3] : [2, 1, 0, 3]) : [3];
    for (const w1 of order) {
      const line = lines[w1];
      if (!line.slots.length) continue;
      const e = ends(line);
      const slotOrder = interior ? [e.mid, ...line.slots.map((_, i) => i).filter((i) => i !== e.mid)] : [1 + Math.floor(rnd() * Math.max(1, line.slots.length - 2))];
      if (!interior) clearBand(map, line);
      for (const g1 of slotOrder) {
        const o1 = lineObstacles(line, { gate: g1 }, C, interior);
        if (Number.isFinite(routeLen(strictWorld(map, o1.obs, o1.drop), map))) {
          cfg = { w1, g1 };
          break;
        }
      }
      if (cfg) break;
    }
    if (!cfg) {
      restore(map, snap);
      return;
    }
  }
  placeChosenWalls(map, rnd, holdout, interior, C, lines, cfg);
  // Last word: the safe room must be reachable on foot (gate counted open, breach shut).
  if (!Number.isFinite(routeLen(strictWorld(map), map))) {
    restore(map, snap);
    map.holdout = null;
    map.breach = null;
    map.routeInfo = null;
  }
}

function applyLine(map, line, r) {
  if (r.drop.length) {
    const gone = new Set(r.drop);
    const keep = map.obstacles.filter((o) => !gone.has(o));
    map.obstacles.length = 0;
    map.obstacles.push(...keep);
  }
  map.obstacles.push(...r.obs);
  if (!map.doors) return;
  // Doors welded shut by the line, and holes knocked through it (so room logic counts them).
  for (const d of map.doors) {
    if (!d.vertical || Math.abs(d.x - line.x) > 1) continue;
    if (r.obs.some((o) => o.kind === 'qwall' && o.y < d.y + d.h && o.y + o.h > d.y)) {
      d.plugged = true;
      d.leaf = 0;
    }
  }
  for (const [, o] of Object.entries(r.open)) {
    const s = line.slots.find((q) => q.cut && q.y0 <= o.y0 && q.y1 >= o.y1);
    if (s) map.doors.push({ x: line.x, y: s.y0, w: line.T, h: s.y1 - s.y0, vertical: true, leaf: 0, cut: true });
  }
}

function placeChosenWalls(map, rnd, holdout, interior, C, lines, cfg) {
  const w1 = lines[cfg.w1];
  const startSide = Math.sign(map.start.x - w1.x) || -1;
  const r1 = lineObstacles(w1, holdout ? { gate: cfg.g1 } : { check: cfg.g1 }, C, interior, { withGate: holdout });
  applyLine(map, w1, r1);
  const o1 = holdout ? r1.open.gate : r1.open.check;
  // The face of the wall on a given side (the building's line is the corridor's east wall).
  const face = (line, side) => (interior ? line.x + ((side + 1) * line.T) / 2 : line.x + (side * line.T) / 2);
  if (holdout) {
    // Control box against the wall on the start side, beside the opening.
    const bw = interior ? 10 : 16;
    const bh = 26;
    const room = o1.y0 - 34 - bh > w1.y0 + 30;
    const by = room ? o1.y0 - 34 - bh : o1.y1 + 34;
    const fx = face(w1, startSide);
    const bx = startSide < 0 ? fx - bw : fx;
    const box = ob('switchbox', bx, by, bw, bh, { ...low });
    map.obstacles.push(box);
    map.holdout = {
      gate: r1.gate,
      box,
      use: { x: bx + bw / 2 + startSide * 30, y: by + bh / 2 },
      x: face(w1, 0),
      y: o1.cy,
      side: startSide,
      indoor: interior,
    };
    map.glows.push({ x: fx + startSide * 100, y: o1.cy, r: 260, k: 0.62, tint: 'rgba(255,214,150,0.10)' });
    map.glows.push({ x: face(w1, -startSide) - startSide * 100, y: o1.cy, r: 200, k: 0.5, tint: 'rgba(255,214,150,0.08)' });
    spray(map, fx + startSide * 62, o1.cy, 'GATE', '#ffd27a', null, 1.1);
  } else {
    map.checkpoints.push({ x: face(w1, 0), y: o1.cy, h: o1.y1 - o1.y0, indoor: interior });
    spray(map, face(w1, -1) - 66, o1.cy, 'CHECKPOINT', '#e8e8e0', null, 0.75);
    spray(map, face(w1, 1) + 66, o1.cy, 'CHECKPOINT', '#e8e8e0', null, 0.75);
    map.glows.push({ x: face(w1, 0), y: o1.cy, r: 220, k: 0.55, tint: 'rgba(210,230,255,0.08)' });
  }

  if (cfg.w2 === undefined) return;
  const w2 = lines[cfg.w2];
  const r2 = lineObstacles(w2, { check: cfg.g2, breach: cfg.b2 }, C, interior);
  applyLine(map, w2, r2);
  const g2 = r2.open.check;
  const b2 = r2.open.breach;
  map.checkpoints.push({ x: face(w2, 0), y: g2.cy, h: g2.y1 - g2.y0, indoor: interior });
  spray(map, face(w2, -1) - 66, g2.cy, 'CHECKPOINT', '#e8e8e0', null, 0.75);
  spray(map, face(w2, 1) + 66, g2.cy, 'CHECKPOINT', '#e8e8e0', null, 0.75);
  map.glows.push({ x: face(w2, 0), y: g2.cy, r: 220, k: 0.55, tint: 'rgba(210,230,255,0.08)' });

  // The breach: the near side (where the short way arrives) faces the first wall.
  const near = Math.sign(w1.x - w2.x) || -1;
  const far = -near;
  const nx = face(w2, near);
  const fx2 = face(w2, far);
  map.breach = { boards: r2.breach, x: face(w2, 0), y: b2.cy, near, front: { x: nx + near * 34, y: b2.cy }, far: { x: fx2 + far * 34, y: b2.cy } };
  const toGate = Math.sign(g2.cy - b2.cy) || 1;
  spray(map, nx + near * 52, b2.cy, 'DANGER', '#e0473a', null, 1.1);
  spray(map, nx + near * 52, b2.cy - toGate * 26, 'SHORT WAY (LOUD)', '#ffb37a', null, 0.6);
  spray(map, nx + near * 52, b2.cy + toGate * ((b2.y1 - b2.y0) / 2 + 70), 'GATE', '#e8e8e0', toGate > 0 ? Math.PI / 2 : -Math.PI / 2, 0.9);
  // No light near it.
  for (const l of map.lamps) if (Math.hypot(l.x - nx, l.y - b2.cy) < (interior ? 520 : 650)) l.broken = true;
  const glows = map.glows.filter((g) => Math.hypot(g.x - nx, g.y - b2.cy) > 300);
  map.glows.length = 0;
  map.glows.push(...glows);

  // Alarm cars just past the breach (streets).
  if (!interior) {
    const hs = map.streets.filter((s) => s.dir === 'h').sort((a, b) => a.y - b.y)[cfg.b2];
    let cars = 0;
    for (const off of [150, 260, 370]) {
      if (cars >= 2) break;
      for (const curb of cars % 2 ? [hs.y + hs.h - 52, hs.y + 8] : [hs.y + 8, hs.y + hs.h - 52]) {
        const x = far > 0 ? w2.x + off : w2.x - off - 86;
        const car = ob('car', x, curb, 86, 44, { ...solid, color: '#b8b8b2', alarm: true, vertical: false, front: far });
        if (map.obstacles.some((o) => o.kind !== 'border' && rectsOverlap(o, car, 14))) continue;
        map.obstacles.push(car);
        if (!Number.isFinite(routeLen(strictWorld(map, [], r2.breach), map))) {
          map.obstacles.pop();
          continue;
        }
        cars++;
        break;
      }
    }
  }

  // A nest of sleepers beyond the breach (reachable from it).
  const open = strictWorld(map, [], r2.breach);
  const f = new FlowField(open);
  f.compute(map.breach.far.x, map.breach.far.y);
  const want = interior ? 10 : 13;
  for (let k = 0; k < 500 && map.nests.length < want; k++) {
    const x = fx2 + far * (24 + rnd() * 280);
    const y = b2.cy + (rnd() - 0.5) * (interior ? 320 : 440);
    if (!open.isFree(x, y, 13) || f.pathDist(x, y) > 420) continue;
    if (map.nests.some((q) => Math.hypot(q.x - x, q.y - y) < 26)) continue;
    map.nests.push({ x, y });
  }
}

// --- City landmarks -------------------------------------------------------------------------------

function cityLandmarks(map, rnd) {
  const world = strictWorld(map);
  const A = fieldsOf(world, map);
  if (A.route >= INF) return;
  const g = goalOf(map);
  const usable = map.blocks.filter((b) => b.type !== 'start' && b.type !== 'end' && Math.hypot(b.x + b.w / 2 - map.start.x, b.y + b.h / 2 - map.start.y) > 900 && Math.hypot(b.x + b.w / 2 - g.x, b.y + b.h / 2 - g.y) > 700);
  const stats = new Map(usable.map((b) => [b, rectStats(world, A, b)]));
  const used = new Set();

  // Gas station: on the way (low detour), mid-run.
  const stations = shuffle(usable.filter((b) => b.inner.w >= 420 && b.inner.h >= 340 && stats.get(b).detour <= 320 && stats.get(b).prog > 0.22 && stats.get(b).prog < 0.8), rnd)
    .sort((a, b) => Math.abs(stats.get(a).prog - 0.5) - Math.abs(stats.get(b).prog - 0.5));
  for (const b of stations.slice(0, 4)) {
    const snap = snapshot(map);
    const spot = gasStation(map, b, rnd);
    if (landmarkOk(map, spot)) {
      used.add(b);
      break;
    }
    restore(map, snap);
  }

  // Crashed helicopter: in a park / plaza / lot / site, a little off the way.
  const heli = shuffle(usable.filter((b) => !used.has(b) && ['park', 'plaza', 'parking', 'construction'].includes(b.type) && b.inner.w >= 340 && b.inner.h >= 300 && stats.get(b).detour >= 120 && stats.get(b).detour < 1800 && stats.get(b).prog > 0.12 && stats.get(b).prog < 0.88), rnd);
  for (const b of heli.slice(0, 4)) {
    const snap = snapshot(map);
    const spot = helicopter(map, b, rnd);
    if (landmarkOk(map, spot)) {
      used.add(b);
      break;
    }
    restore(map, snap);
  }

  // Army checkpoint: across a street segment on the way.
  const segs = streetSegments(map).filter((s) => !map.obstacles.some((o) => o.kind === 'qwall' && rectsOverlap(o, s, 40)));
  const segStats = segs.map((s) => ({ s, ...rectStats(world, A, s) })).filter((q) => q.detour <= 160 && q.prog > 0.28 && q.prog < 0.78);
  for (const q of shuffle(segStats, rnd).slice(0, 5)) {
    if (map.landmarks.some((l) => Math.hypot(l.x - (q.s.x + q.s.w / 2), l.y - (q.s.y + q.s.h / 2)) < 700)) continue;
    const snap = snapshot(map);
    const spot = checkpoint(map, q.s, rnd);
    if (landmarkOk(map, spot)) break;
    restore(map, snap);
  }
}

function streetSegments(map) {
  const out = [];
  const its = map.intersections;
  for (const s of map.streets.filter((q) => q.dir === 'h')) {
    const row = its.filter((it) => Math.abs(it.y - s.y) < 2).sort((a, b) => a.x - b.x);
    for (let k = 0; k + 1 < row.length; k++) {
      const x0 = row[k].x + row[k].w;
      const x1 = row[k + 1].x;
      if (x1 - x0 >= 360) out.push({ x: x0, y: s.y, w: x1 - x0, h: s.h, street: s });
    }
  }
  return out;
}

function gasStation(map, b, rnd) {
  const I = b.inner;
  clearRect(map, I);
  b.type = 'station';
  const cx = I.x + I.w / 2;
  const shopW = Math.min(180, I.w * 0.42);
  map.obstacles.push(ob('building', cx - shopW / 2, I.y + 18, shopW, 84, { move: true, shot: true, sight: true, color: '#5a4636', vents: 1, seed: Math.floor(rnd() * 1e6) }));
  const cw = Math.min(300, I.w - 90);
  const ch = 170;
  const cy = I.y + Math.max(160, I.h * 0.6);
  const canopy = { x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch, group: 'station' };
  map.canopies.push(canopy);
  const pumps = [];
  for (const fx of [-0.25, 0.25]) {
    const ix = cx + fx * cw;
    map.decor.push({ type: 'island', x: ix, y: cy, w: 26, h: 104 });
    for (const fy of [-1, 1]) {
      const p = ob('pump', ix - 10, cy + fy * 26 - 15, 20, 30, { ...solid, explosive: 'station', hp: EXPLOSIVE_HP });
      pumps.push(p);
      map.obstacles.push(p);
    }
  }
  map.explosives.push({ id: 'station', x: cx, y: cy, R: 320, burnR: 170, burnT: 25, parts: pumps, canopy });
  // A car at a pump, another by the shop.
  map.obstacles.push(ob('car', cx + cw * 0.25 + 26, cy - 43, 44, 86, { ...solid, color: CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)], vertical: true, front: 1 }));
  map.obstacles.push(ob('car', cx - shopW / 2 - 70, I.y + 30, 44, 86, { ...solid, color: CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)], vertical: true, front: -1 }));
  map.glows.push({ x: cx - cw * 0.25, y: cy, r: 210, k: 0.55, tint: 'rgba(255,245,220,0.10)' });
  map.glows.push({ x: cx + cw * 0.25, y: cy, r: 210, k: 0.55, tint: 'rgba(255,245,220,0.10)' });
  map.decor.push({ type: 'pricesign', x: I.x + 24, y: I.y + I.h - 30 });
  map.landmarks.push({ kind: 'station', x: cx, y: cy, label: 'GAS STATION' });
  return { x: cx, y: cy + ch / 2 + 30 };
}

function helicopter(map, b, rnd) {
  const I = b.inner;
  const site = { x: I.x + I.w / 2 - 160, y: I.y + I.h / 2 - 120, w: 320, h: 240 };
  clearRect(map, site);
  const cx = site.x + site.w / 2;
  const cy = site.y + site.h / 2;
  const horiz = rnd() < 0.5;
  const dir = rnd() < 0.5 ? 1 : -1;
  const color = rnd() < 0.5 ? '#4b5a3a' : '#3d4650';
  // Fuselage (nose toward dir), broken tail boom a little apart.
  const fus = horiz ? ob('heli', cx - 64, cy - 24, 128, 48, { ...solid, part: 'body', dir, horiz, color }) : ob('heli', cx - 24, cy - 64, 48, 128, { ...solid, part: 'body', dir, horiz, color });
  const tail = horiz
    ? ob('heli', dir > 0 ? cx - 64 - 104 : cx + 64 + 14, cy - 6 + (rnd() - 0.5) * 20, 90, 12, { ...solid, part: 'tail', dir, horiz, color })
    : ob('heli', cx - 6 + (rnd() - 0.5) * 20, dir > 0 ? cy - 64 - 104 : cy + 64 + 14, 12, 90, { ...solid, part: 'tail', dir, horiz, color });
  map.obstacles.push(fus, tail);
  for (let k = 0; k < 3; k++) {
    const a = rnd() * Math.PI * 2;
    const d = 70 + rnd() * 70;
    map.decor.push({ type: 'rotor', x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, a: rnd() * Math.PI, len: 90 + rnd() * 30 });
  }
  map.decor.push({ type: 'scorch', x: cx, y: cy, s: 1.6 });
  for (let k = 0; k < 6; k++) map.decor.push({ type: 'scrap', x: cx + (rnd() - 0.5) * 260, y: cy + (rnd() - 0.5) * 200, a: rnd() * Math.PI, s: 0.6 + rnd() * 0.8 });
  // The engine still burns (light, smoke, embers).
  map.fires.push({ x: horiz ? cx - dir * 30 : cx, y: horiz ? cy : cy - dir * 30 });
  // What the crew carried.
  const sx = horiz ? cx : cx + 52;
  const sy = horiz ? cy + 52 : cy;
  map.pickups.push({ kind: 'medkit', x: sx - 22, y: sy });
  map.pickups.push({ kind: 'ammo', x: sx + 22, y: sy });
  map.landmarks.push({ kind: 'heli', x: cx, y: cy, label: 'CRASHED HELICOPTER' });
  return { x: sx, y: sy };
}

function checkpoint(map, seg, rnd) {
  const s = seg.street;
  const cx = seg.x + seg.w / 2;
  clearRect(map, { x: seg.x + 20, y: s.y, w: seg.w - 40, h: s.h }, (o) => o.kind !== 'car');
  const T = 14;
  // Sandbag emplacements at both curbs, opening onto the road; the middle lane stays open.
  for (const side of [-1, 1]) {
    const yb = side < 0 ? s.y + 46 : s.y + s.h - 46 - T;
    const yl = side < 0 ? s.y + 10 : s.y + s.h - 46;
    map.obstacles.push(ob('sandbag', cx - 60, yb, 120, T, { ...low }));
    map.obstacles.push(ob('sandbag', cx - 60, yl, T, 36, { ...low }));
    map.obstacles.push(ob('sandbag', cx + 60 - T, yl, T, 36, { ...low }));
  }
  // Jersey barriers make a chicane at both ends of the post.
  map.obstacles.push(ob('barrier', cx - 170, s.y + 30, 18, 70, { ...solid }));
  map.obstacles.push(ob('barrier', cx + 152, s.y + s.h - 100, 18, 70, { ...solid }));
  // Army truck parked along a curb, clear of the chicane.
  const left = rnd() < 0.5;
  const tx = left ? seg.x + 20 : seg.x + seg.w - 20 - 120;
  map.obstacles.push(ob('truck', tx, left ? s.y + s.h - 8 - 46 : s.y + 8, 120, 46, { ...solid, front: left ? 1 : -1 }));
  for (const side of [-1, 1]) map.glows.push({ x: cx, y: side < 0 ? s.y + 30 : s.y + s.h - 30, r: 240, k: 0.66, tint: 'rgba(225,240,255,0.10)' });
  map.decor.push({ type: 'wire', x: cx - 200, y: s.y + 4, w: 400, h: 6 });
  map.decor.push({ type: 'wire', x: cx - 200, y: s.y + s.h - 10, w: 400, h: 6 });
  spray(map, cx, s.y + s.h / 2, 'CHECKPOINT', '#e8e8e0', null, 0.9);
  map.pickups.push({ kind: 'ammo', x: cx - 30, y: s.y + 28 });
  map.pickups.push({ kind: 'medkit', x: cx + 30, y: s.y + s.h - 28 });
  map.landmarks.push({ kind: 'checkpoint', x: cx, y: s.y + s.h / 2, label: 'ARMY CHECKPOINT' });
  return { x: cx, y: s.y + 28 };
}

// --- Building landmarks ---------------------------------------------------------------------------

function buildingLandmarks(map, rnd) {
  const world = strictWorld(map);
  const A = fieldsOf(world, map);
  if (A.route >= INF) return;
  const g = goalOf(map);
  const rooms = map.rooms.filter((rm) => Math.hypot(rm.x + rm.w / 2 - map.start.x, rm.y + rm.h / 2 - map.start.y) > 800 && Math.hypot(rm.x + rm.w / 2 - g.x, rm.y + rm.h / 2 - g.y) > 600);
  const stats = new Map(rooms.map((rm) => [rm, rectStats(world, A, rm)]));
  const used = new Set();
  const tryPlace = (pool, fn) => {
    for (const rm of pool.slice(0, 5)) {
      if (used.has(rm)) continue;
      const snap = snapshot(map);
      const spot = fn(rm);
      if (spot && landmarkOk(map, spot)) {
        used.add(rm);
        return true;
      }
      restore(map, snap);
    }
    return false;
  };

  // Gas cylinders (explosive): storage-type rooms near the way.
  tryPlace(
    shuffle(rooms.filter((rm) => ['storage', 'warehouse', 'lab', 'office'].includes(rm.type) && rm.w * rm.h >= 40000 && stats.get(rm).detour <= 700 && stats.get(rm).prog > 0.2 && stats.get(rm).prog < 0.85), rnd),
    (rm) => cylinders(map, rm, rnd),
  );
  // Field post: a big room on the way.
  tryPlace(
    shuffle(rooms.filter((rm) => ['lobby', 'cafeteria', 'ward', 'openoffice', 'warehouse'].includes(rm.type) && rm.w >= 300 && rm.h >= 260 && stats.get(rm).detour <= 400 && stats.get(rm).prog > 0.25 && stats.get(rm).prog < 0.8), rnd),
    (rm) => fieldPost(map, rm),
  );
  // Collapsed ceiling: a big room, a little off the way.
  tryPlace(
    shuffle(rooms.filter((rm) => rm.w >= 280 && rm.h >= 240 && !['restroom', 'closet'].includes(rm.type) && stats.get(rm).detour < 1800 && stats.get(rm).prog > 0.12 && stats.get(rm).prog < 0.9), rnd),
    (rm) => collapse(map, rm, rnd),
  );
}

function cylinders(map, rm, rnd) {
  // A row of cylinders along the longer wall, clear of furniture.
  const horiz = rm.w >= rm.h;
  const n = 5;
  const span = n * 22;
  for (let k = 0; k < 20; k++) {
    const along = horiz ? rm.x + 30 + rnd() * (rm.w - 60 - span) : rm.y + 30 + rnd() * (rm.h - 60 - span);
    const side = rnd() < 0.5;
    const area = horiz ? { x: along - 6, y: side ? rm.y + 4 : rm.y + rm.h - 34, w: span + 12, h: 30 } : { x: side ? rm.x + 4 : rm.x + rm.w - 34, y: along - 6, w: 30, h: span + 12 };
    if (map.obstacles.some((o) => o.kind !== 'wall' && o.kind !== 'border' && rectsOverlap(o, area, 10))) continue;
    const parts = [];
    for (let i = 0; i < n; i++) {
      const x = horiz ? along + i * 22 : area.x + 7;
      const y = horiz ? area.y + 7 : along + i * 22;
      const c = ob('cylinder', x, y, 16, 16, { ...solid, explosive: `cyl${rm.x}`, hp: EXPLOSIVE_HP, tint: i % 2 ? '#3b6ea8' : '#b5432c' });
      parts.push(c);
      map.obstacles.push(c);
    }
    const ex = { id: `cyl${rm.x}`, x: area.x + area.w / 2, y: area.y + area.h / 2, R: 250, burnR: 130, burnT: 18, parts, canopy: null };
    map.explosives.push(ex);
    map.decor.push({ type: 'hazard', x: area.x - 4, y: area.y - 4, w: area.w + 8, h: area.h + 8 });
    map.landmarks.push({ kind: 'cylinders', x: ex.x, y: ex.y, label: 'GAS CYLINDERS' });
    return { x: ex.x + (horiz ? 0 : side ? 50 : -50), y: ex.y + (horiz ? (side ? 50 : -50) : 0) };
  }
  return null;
}

function fieldPost(map, rm) {
  const cx = rm.x + rm.w / 2;
  const cy = rm.y + rm.h / 2;
  const post = { x: cx - 90, y: cy - 70, w: 180, h: 140 };
  clearRect(map, { x: post.x - 30, y: post.y - 30, w: post.w + 60, h: post.h + 60 }, (o) => o.kind === 'wall' || o.kind === 'glass' || o.kind === 'pillar');
  const T = 14;
  // A ring of sandbags with gaps on two sides.
  map.obstacles.push(ob('sandbag', post.x, post.y, post.w, T, { ...low }));
  map.obstacles.push(ob('sandbag', post.x, post.y + post.h - T, post.w, T, { ...low }));
  map.obstacles.push(ob('sandbag', post.x, post.y + T, T, 34, { ...low }));
  map.obstacles.push(ob('sandbag', post.x, post.y + post.h - T - 34, T, 34, { ...low }));
  map.obstacles.push(ob('sandbag', post.x + post.w - T, post.y + T, T, 34, { ...low }));
  map.obstacles.push(ob('sandbag', post.x + post.w - T, post.y + post.h - T - 34, T, 34, { ...low }));
  map.obstacles.push(ob('crate', cx - 40, cy - 17, 34, 34, { ...solid }));
  map.glows.push({ x: cx, y: cy, r: 260, k: 0.7, tint: 'rgba(225,240,255,0.10)' });
  map.pickups.push({ kind: 'ammo', x: cx + 24, y: cy - 20 });
  map.pickups.push({ kind: 'medkit', x: cx + 24, y: cy + 22 });
  spray(map, cx, post.y + post.h + 26, 'FIELD POST', '#e8e8e0', null, 0.8);
  map.landmarks.push({ kind: 'fieldpost', x: cx, y: cy, label: 'FIELD POST' });
  return { x: cx + 24, y: cy };
}

function collapse(map, rm, rnd) {
  const cx = rm.x + rm.w * (0.35 + rnd() * 0.3);
  const cy = rm.y + rm.h * (0.35 + rnd() * 0.3);
  const area = { x: cx - 110, y: cy - 90, w: 220, h: 180 };
  clearRect(map, area, (o) => o.kind === 'wall' || o.kind === 'glass');
  // A heap of slabs: a rough ring, so you can still get round it.
  const n = 5;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd() * 0.6;
    const d = 26 + rnd() * 30;
    const w = 34 + rnd() * 36;
    const h = 26 + rnd() * 28;
    map.obstacles.push(ob('rubble', cx + Math.cos(a) * d - w / 2, cy + Math.sin(a) * d - h / 2, w, h, { ...solid, seed: Math.floor(rnd() * 1e6) }));
  }
  for (let k = 0; k < 10; k++) map.decor.push({ type: 'scrap', x: cx + (rnd() - 0.5) * 240, y: cy + (rnd() - 0.5) * 200, a: rnd() * Math.PI, s: 0.5 + rnd() * 0.7, grey: true });
  map.decor.push({ type: 'moon', x: cx, y: cy, s: 1 });
  map.glows.push({ x: cx, y: cy, r: 240, k: 0.8, tint: 'rgba(170,200,255,0.10)' });
  map.landmarks.push({ kind: 'collapse', x: cx, y: cy, label: 'COLLAPSED CEILING' });
  return { x: cx + 120, y: cy };
}
