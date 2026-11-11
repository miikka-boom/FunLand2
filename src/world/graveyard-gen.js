// Wissahickon Hill Cemetery: the graveyard map. A seeded Victorian garden
// cemetery on a grid of gravel paths, south-west to north-east:
//
//   gatehouse (start) ... chapel in the middle ... the receiving vault (goal)
//
// Sections between the paths: rows of headstones, mausoleum rows, the old
// woods, a pond, the war memorial, a columbarium court, the service yard.
// Few lamps: lanterns along the two avenues and little else, so the
// flashlight matters here.
//
// Headstones stop bodies, not bullets or sight. They sit one to a nav cell on
// a lattice (every other cell along a row, every third row), so the flow
// field always finds the lanes between them, and the paths are never closed:
// the route is guaranteed to connect.

import { rectsOverlap, shuffle } from '../util.js';
import { ob, dice, safeRoom, SAFE_W, SAFE_H, doorApron, border, freeOf, scatterKits, CELL } from './gen-kit.js';

export const GRAVE_W = 5184; // 162 nav cells
export const GRAVE_H = 3392; // 106
const NX = 6;
const NY = 4;
const PATH = 4; // cells
const AVENUE = 5;

const STONES = ['#8f9189', '#a8a79d', '#74776f', '#7d6f63', '#9a958a'];
const MARBLE = '#cfcfc6';
const CAR_COLORS = ['#2f2f33', '#6b6b6b', '#2e4a6d', '#6d2e2e', '#8a7b52', '#9a9a94'];

/** What's carved on the ledgers (flat slabs you can read from above). */
export const EPITAPHS = [
  'GARY. HE WAS SLOWER.',
  'I TOLD YOU I WAS TIRED',
  'R.I.P. SLEEP · 1836 – 2020',
  'BELOVED. PUNCTUAL. LATE.',
  'GONE BUT WALKING',
  'ASLEEP AT LAST',
  'UP AGAIN SOON',
  'RESERVED (NOT YET, THANKS) — LOU',
  'HERE LIES TEO\'S DIGNITY',
  'VACANT',
  'A PENNY FOR LUCK. LEAVE TWO.',
  'SHE NEVER MISSED A BUS',
];

/** n stretches of cells with the given gaps (cells) between them. */
function splitCells(total, n, gaps, rnd) {
  const avail = total - gaps.reduce((a, b) => a + b, 0);
  const weights = Array.from({ length: n }, () => 0.84 + rnd() * 0.32);
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = [];
  let pos = 0;
  for (let i = 0; i < n; i++) {
    const w = i === n - 1 ? total - pos : Math.round((avail * weights[i]) / sum);
    out.push([pos * CELL, (pos + w) * CELL]);
    pos += w + (gaps[i] || 0);
  }
  return out;
}

export function generateGraveyard(seed) {
  const D = dice((seed ^ 0x6ea7e) >>> 0);
  const { rnd, r, ri, chance, pick } = D;
  const W = GRAVE_W;
  const H = GRAVE_H;

  const obstacles = [];
  const blocks = [];
  const streets = [];
  const lamps = [];
  const pickups = [];
  const decor = [];
  const fires = [];
  const glows = [];
  const paving = []; // paved ground: { x, y, w, h } or { cx, cy, r }
  const ponds = [];
  const markings = { dashes: [], crosswalks: [], parking: [] };
  const free = freeOf(obstacles);

  // --- Paths --------------------------------------------------------------------------------
  // The gate avenue runs north from the main gate (after the first column);
  // the cross avenue runs east-west through the middle. Both are lit.
  const gapsX = Array.from({ length: NX - 1 }, (_, i) => (i === 0 ? AVENUE : PATH));
  const gapsY = Array.from({ length: NY - 1 }, (_, j) => (j === 1 ? AVENUE : PATH));
  const xs = splitCells(W / CELL, NX, gapsX, rnd);
  const ys = splitCells(H / CELL, NY, gapsY, rnd);
  for (let i = 0; i < NX - 1; i++) streets.push({ dir: 'v', x: xs[i][1], y: 0, w: xs[i + 1][0] - xs[i][1], h: H, avenue: i === 0 });
  for (let j = 0; j < NY - 1; j++) streets.push({ dir: 'h', x: 0, y: ys[j][1], w: W, h: ys[j + 1][0] - ys[j][1], avenue: j === 1 });
  const intersections = [];
  for (const sv of streets.filter((s) => s.dir === 'v')) for (const sh of streets.filter((s) => s.dir === 'h')) intersections.push({ x: sv.x, y: sh.y, w: sv.w, h: sh.h });

  // --- Sections -----------------------------------------------------------------------------
  const cx = 2 + (chance(0.5) ? 1 : 0); // the chapel sits by the cross avenue, mid-map
  const cy = chance(0.5) ? 1 : 2;
  const once = { pond: 1, memorial: 1, columbarium: 1, service: 1 };
  const table = [['graves', 0.5], ['mausoleums', 0.16], ['woods', 0.13], ['pond', 0.07], ['memorial', 0.07], ['columbarium', 0.07]];
  const pickType = () => {
    for (let k = 0; k < 12; k++) {
      let x = rnd();
      for (const [t, w] of table) {
        if ((x -= w) >= 0) continue;
        if (t in once) {
          if (!once[t]) break;
          once[t]--;
        }
        return t;
      }
    }
    return 'graves';
  };
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NY; j++) {
      const b = { x: xs[i][0], y: ys[j][0], w: xs[i][1] - xs[i][0], h: ys[j][1] - ys[j][0] };
      let type;
      if (i === 0 && j === NY - 1) type = 'start';
      else if (i === NX - 1 && j === 0) type = 'end';
      else if (i === cx && j === cy) type = 'chapel';
      else if (i === NX - 1 && j === NY - 1) type = 'service'; // the yard in the far south-east corner
      else type = pickType();
      blocks.push({ ...b, inner: { ...b }, type, i, j });
    }
  }
  // Whatever wasn't rolled gets one section each (taken from plain grave sections away from the ends).
  for (const t of ['pond', 'memorial', 'columbarium']) {
    if (!once[t]) continue;
    const cand = shuffle(blocks.filter((b) => b.type === 'graves' && b.i > 0 && b.i < NX - 1), rnd)[0];
    if (cand) cand.type = t;
  }
  // And never a cemetery without its rich dead or its trees: two sections of each at the least.
  for (const t of ['mausoleums', 'woods']) {
    for (let have = blocks.filter((b) => b.type === t).length; have < 2; have++) {
      const cand = shuffle(blocks.filter((b) => b.type === 'graves'), rnd)[0];
      if (cand) cand.type = t;
    }
  }

  // --- Building blocks -----------------------------------------------------------------------
  const reserved = []; // no headstones here
  const keepOut = (rect, pad = 0) => reserved.some((q) => rectsOverlap(q, rect, pad));
  let graveCount = 0;
  const candles = [];

  /** One headstone in the nav cell at (cx0, cy0), facing south. */
  function stone(cx0, cy0, opt = {}) {
    const w = opt.w || ri(20, 26);
    const d = opt.d || ri(10, 12);
    const o = ob('grave', cx0 + (CELL - w) / 2 + ri(-2, 2), cy0 + 8 + ri(-2, 2), w, d, {
      v: opt.v !== undefined ? opt.v : ri(0, 4), // rounded, cross, slab, pointed, shouldered
      hgt: opt.hgt || ri(26, 44),
      fresh: !opt.old && chance(0.16), // a plot that was dug not long ago
      color: opt.color || pick(STONES),
      lean: opt.old ? r(-0.22, 0.22) : chance(0.12) ? r(-0.1, 0.1) : 0,
      seed: ri(0, 1e6),
    });
    obstacles.push(o);
    graveCount++;
    return o;
  }

  /** Rows of headstones over a rect (cell-aligned), around whatever is reserved. */
  function rows(rect, opt = {}) {
    const skip = opt.skip === undefined ? 0.2 : opt.skip;
    const x0 = Math.ceil((rect.x + CELL) / CELL) * CELL;
    const y0 = Math.ceil((rect.y + CELL) / CELL) * CELL;
    for (let y = y0; y + CELL * 2 <= rect.y + rect.h; y += CELL * 3) {
      for (let x = x0; x + CELL * 2 <= rect.x + rect.w; x += CELL * 2) {
        const cellRect = { x, y, w: CELL, h: CELL };
        if (keepOut(cellRect, 6) || !free(cellRect, 2)) continue;
        if (rnd() < skip) {
          // A gap in the row: sometimes a plot nobody has filled back in.
          if (!opt.uniform && chance(0.07)) decor.push({ type: 'opengrave', x: x + CELL / 2, y: y + CELL + 22, w: 30, h: 58 });
          continue;
        }
        if (!opt.uniform && chance(0.035) && x + CELL * 2 <= rect.x + rect.w - CELL) {
          // A table tomb takes two cells.
          const t = { x: x + 6, y: y + 3, w: 52, h: 26 };
          if (!keepOut({ x, y, w: CELL * 2, h: CELL }, 6) && free({ x, y, w: CELL * 2, h: CELL }, 2)) {
            obstacles.push(ob('tomb', t.x, t.y, t.w, t.h, { color: pick(STONES), seed: ri(0, 1e6) }));
            x += CELL * 2;
            continue;
          }
        }
        const s = stone(x, y, opt.uniform ? { v: opt.uniform === 'cross' ? 1 : 2, w: 22, d: 10, hgt: 30, color: MARBLE } : { old: opt.old });
        if (opt.uniform) continue;
        const fx = s.x + s.w / 2;
        const fy = s.y + s.h + 9;
        const t = rnd();
        if (t < 0.13) decor.push({ type: 'flowers', x: fx + r(-4, 4), y: fy, c: ri(0, 4), s: r(0.8, 1.2) });
        else if (t < 0.17) decor.push({ type: 'gflag', x: s.x - 5, y: s.y + s.h + 3 });
        else if (t < 0.21) candles.push({ x: fx, y: fy });
        else if (t < 0.23) decor.push({ type: 'wreath', x: fx, y: fy + 2 });
      }
    }
  }

  function trees(rect, n, deadShare = 0.25, pad = 46) {
    let placed = 0;
    for (let k = 0; k < n * 10 && placed < n; k++) {
      const s = ri(34, 44);
      const o = ob('tree', rect.x + r(20, rect.w - s - 20), rect.y + r(20, rect.h - s - 20), s, s, { seed: ri(0, 1e6), dead: chance(deadShare) });
      if (!free(o, pad) || keepOut(o, 20)) continue;
      obstacles.push(o);
      reserved.push({ x: o.x - 30, y: o.y - 30, w: o.w + 60, h: o.h + 60 });
      placed++;
    }
  }

  const lantern = (x, y, extra = {}) => lamps.push({ x, y, r: 150, k: 0.58, style: 'lantern', ...extra });

  /** A stone mausoleum facing south (its door looks at the camera). */
  function mausoleum(x, y, w, d) {
    const o = ob('mausoleum', x, y, w, d, { color: pick(['#9b9a90', '#8a8b84', '#a39a8a', '#7f7a72']), seed: ri(0, 1e6), hgt: ri(54, 66) });
    obstacles.push(o);
    reserved.push({ x: x - 24, y: y - 24, w: w + 48, h: d + 60 });
    paving.push({ x: x + w / 2 - 18, y: y + d, w: 36, h: 30 });
    return o;
  }

  function graves(b) {
    if (chance(0.5)) trees(b, ri(2, 4), 0.2, 40);
    // Now and then a tall monument where a family could afford one.
    for (let k = 0, n = ri(0, 2); k < n; k++) {
      const mx = Math.floor((b.x + r(100, b.w - 140)) / CELL) * CELL;
      const my = Math.floor((b.y + r(100, b.h - 140)) / CELL) * CELL;
      const o = ob('obelisk', mx + 3, my + 3, 26, 26, { color: pick(STONES), hgt: ri(70, 100), seed: ri(0, 1e6) });
      if (!free(o, 40) || keepOut(o, 10)) continue;
      obstacles.push(o);
      reserved.push({ x: mx - CELL, y: my - CELL, w: CELL * 3, h: CELL * 3 });
    }
    rows(b);
  }

  function mausoleums(b) {
    // A row along the north side, a paved walk in front, family plots and rows below.
    const depth = ri(86, 108);
    const walk = { x: b.x + 20, y: b.y + 30 + depth, w: b.w - 40, h: 44 };
    paving.push(walk);
    reserved.push({ x: b.x, y: b.y, w: b.w, h: 30 + depth + 44 + 20 });
    for (let x = b.x + r(40, 70); x + 70 < b.x + b.w - 30;) {
      const w = ri(68, 98);
      if (x + w > b.x + b.w - 30) break;
      mausoleum(Math.round(x), b.y + 30 + ri(0, 8), w, depth - ri(0, 14));
      x += w + r(44, 66);
    }
    for (let k = 0; k < 2; k++) decor.push({ type: 'urn', x: walk.x + walk.w * (0.3 + 0.4 * k), y: walk.y + walk.h / 2 });
    // A fenced family plot with its own obelisk.
    const pw = CELL * 6;
    const px = Math.floor((b.x + r(60, Math.max(61, b.w - pw - 60))) / CELL) * CELL;
    const py = Math.floor((b.y + b.h - pw - r(60, 120)) / CELL) * CELL;
    const plot = { x: px, y: py, w: pw, h: pw };
    if (py > walk.y + walk.h + 80 && !keepOut(plot, 10)) {
      const t = 6;
      const gate = CELL * 2;
      obstacles.push(ob('fence', plot.x, plot.y, plot.w, t, { style: 'iron' }));
      obstacles.push(ob('fence', plot.x, plot.y, t, plot.h, { style: 'iron' }));
      obstacles.push(ob('fence', plot.x + plot.w - t, plot.y, t, plot.h, { style: 'iron' }));
      obstacles.push(ob('fence', plot.x, plot.y + plot.h - t, (plot.w - gate) / 2, t, { style: 'iron' }));
      obstacles.push(ob('fence', plot.x + (plot.w + gate) / 2, plot.y + plot.h - t, (plot.w - gate) / 2, t, { style: 'iron' }));
      obstacles.push(ob('obelisk', plot.x + plot.w / 2 - 14, plot.y + 34, 28, 28, { color: MARBLE, hgt: 92, seed: ri(0, 1e6) }));
      stone(plot.x + CELL, plot.y + CELL * 3, { old: true });
      stone(plot.x + CELL * 4, plot.y + CELL * 3, { old: true });
      reserved.push({ x: plot.x - CELL, y: plot.y - CELL, w: plot.w + 2 * CELL, h: plot.h + 2 * CELL });
    }
    rows(b);
  }

  function woods(b) {
    trees(b, ri(13, 19), 0.45, 54);
    // The old section: what stones are left lean every which way.
    const x0 = Math.ceil((b.x + CELL) / CELL) * CELL;
    const y0 = Math.ceil((b.y + CELL) / CELL) * CELL;
    for (let y = y0; y + CELL * 2 <= b.y + b.h; y += CELL * 3) {
      for (let x = x0; x + CELL * 2 <= b.x + b.w; x += CELL * 2) {
        if (!chance(0.2)) continue;
        const cellRect = { x, y, w: CELL, h: CELL };
        if (keepOut(cellRect, 0) || !free(cellRect, 2)) continue;
        stone(x, y, { old: true, color: pick(['#74776f', '#7d6f63', '#6a6c66']) });
      }
    }
    for (let k = 0; k < 10; k++) decor.push({ type: 'leaves', x: b.x + r(20, b.w - 20), y: b.y + r(20, b.h - 20), s: r(1, 2) });
    b.dark = true;
  }

  function pond(b) {
    const pw = Math.round(Math.min(b.w - 200, r(300, 400)) / CELL) * CELL;
    const ph = Math.round(Math.min(b.h - 240, r(200, 280)) / CELL) * CELL;
    const px = Math.round((b.x + (b.w - pw) / 2 + r(-40, 40)) / CELL) * CELL;
    const py = Math.round((b.y + (b.h - ph) / 2 + r(-40, 40)) / CELL) * CELL;
    // An octagon of water: two rects in a cross.
    const cut = CELL * 2;
    obstacles.push(ob('pond', px + cut, py, pw - 2 * cut, ph));
    obstacles.push(ob('pond', px, py + cut, pw, ph - 2 * cut));
    ponds.push({ x: px, y: py, w: pw, h: ph, cut });
    reserved.push({ x: px - 70, y: py - 70, w: pw + 140, h: ph + 140 });
    // Willows and benches around it.
    for (const [fx, fy] of [[-0.08, 0.2], [1.02, 0.7], [0.3, -0.25], [0.7, 1.12]]) {
      const s = 42;
      const o = ob('tree', px + pw * fx - s / 2, py + ph * fy - s / 2, s, s, { seed: ri(0, 1e6), willow: true });
      if (free(o, 30)) obstacles.push(o);
    }
    for (const [fx, fy, horiz] of [[0.5, -0.16, true], [0.5, 1.12, true]]) {
      const o = ob('bench', px + pw * fx - 26, py + ph * fy - 8, horiz ? 52 : 16, horiz ? 16 : 52);
      if (free(o, 20)) obstacles.push(o);
    }
    decor.push({ type: 'ducks', x: px + pw * 0.4, y: py + ph * 0.45 }, { type: 'reeds', x: px + cut * 0.6, y: py + cut * 0.6 }, { type: 'reeds', x: px + pw - cut * 0.5, y: py + ph - cut * 0.5 });
    rows(b);
  }

  function memorial(b) {
    const mx = Math.round((b.x + b.w / 2) / CELL) * CELL;
    const my = Math.round((b.y + b.h * 0.42) / CELL) * CELL;
    const R0 = 150;
    paving.push({ cx: mx, cy: my, r: R0, ring: true });
    obstacles.push(ob('obelisk', mx - 22, my - 22, 44, 44, { color: MARBLE, hgt: 128, seed: ri(0, 1e6), war: true }));
    for (const [dx, dy, horiz] of [[-1, 0, false], [1, 0, false], [0, -1, true], [0, 1, true]]) {
      obstacles.push(ob('bench', mx + dx * 104 - (horiz ? 26 : 8), my + dy * 104 - (horiz ? 8 : 26), horiz ? 52 : 16, horiz ? 16 : 52));
    }
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lantern(mx + dx * 122, my + dy * 122, { broken: chance(0.25) });
    decor.push({ type: 'wreath', x: mx - 10, y: my + 36 }, { type: 'wreath', x: mx + 12, y: my + 38 }, { type: 'flagpole', x: mx - 60, y: my - 96 }, { type: 'flagpole', x: mx + 60, y: my - 96 });
    reserved.push({ x: mx - R0 - 20, y: my - R0 - 20, w: 2 * R0 + 40, h: 2 * R0 + 40 });
    // The veterans' rows: white stones, all alike, in perfect lines.
    rows(b, { uniform: chance(0.5) ? 'cross' : 'slab', skip: 0.04 });
  }

  function columbarium(b) {
    // Niche walls in rows, faces to the south, a paved court between them.
    const court = { x: b.x + 60, y: b.y + 70, w: b.w - 120, h: Math.min(b.h - 260, 420) };
    paving.push(court);
    reserved.push({ x: court.x - 20, y: court.y - 20, w: court.w + 40, h: court.h + 60 });
    for (let y = court.y + 20; y + 20 < court.y + court.h; y += CELL * 3) {
      // Each row: two or three walls with gaps to walk through.
      let x = court.x + r(10, 50);
      while (x < court.x + court.w - 120) {
        const len = Math.min(r(150, 260), court.x + court.w - x - 10);
        if (len < 96) break;
        obstacles.push(ob('niche', Math.round(x), Math.round(y), Math.round(len), 20, { seed: ri(0, 1e6) }));
        x += len + r(78, 110);
      }
    }
    decor.push({ type: 'urn', x: court.x + 30, y: court.y + court.h - 8 }, { type: 'urn', x: court.x + court.w - 30, y: court.y + court.h - 8 });
    lantern(court.x + court.w / 2, court.y + court.h + 14, { broken: chance(0.3) });
    rows({ x: b.x, y: court.y + court.h + 40, w: b.w, h: b.y + b.h - (court.y + court.h + 40) });
  }

  function chapel(b) {
    // The chapel: nave running north, its gable and door to the south, a
    // bell tower at the corner. A paved forecourt with the hearse still waiting.
    const cw = 196;
    const ch = Math.min(310, b.h - 300);
    const x = Math.round((b.x + (b.w - cw) / 2) / CELL) * CELL;
    const y = b.y + 70;
    obstacles.push(ob('building', x, y, cw, ch, { color: '#3f4347', vents: 0, seed: ri(0, 1e6), chapel: true, pitched: true, nocarve: true }));
    obstacles.push(ob('building', x - 62, y + ch - 66, 60, 60, { color: '#3f4347', vents: 0, seed: ri(0, 1e6), steeple: true, pitched: true, nocarve: true }));
    const court = { x: x - 110, y: y + ch, w: cw + 220, h: 190 };
    paving.push(court);
    reserved.push({ x: court.x - 30, y: b.y, w: court.w + 60, h: 70 + ch + court.h + 30 });
    for (const sx of [-1, 1]) {
      obstacles.push(ob('bench', x + cw / 2 + sx * 120 - 8, court.y + 70, 16, 52));
      lantern(x + cw / 2 + sx * 76, court.y + 22);
    }
    // The hearse, nose to the path.
    const hearse = ob('car', court.x + court.w - 70, court.y + 74, 46, 98, { color: '#1c1c20', vertical: true, front: 1, hearse: true });
    if (free(hearse, 10)) obstacles.push(hearse);
    decor.push({ type: 'paint', x: x + cw / 2, y: court.y + 150, text: 'SERVICES SUSPENDED', size: 15, a: 0 });
    decor.push({ type: 'sign', x: x + cw / 2 - 150, y: court.y + 150, text: 'CHAPEL' });
    glows.push({ x: x + cw / 2, y: y + ch + 24, r: 120, k: 0.38, tint: 'rgba(255,196,120,0.10)' });
    trees({ x: b.x, y: b.y, w: b.w, h: b.h }, ri(3, 5), 0.15, 44);
    rows(b);
    return { x: x + cw / 2, y: court.y + court.h / 2 };
  }

  function service(b) {
    // The maintenance yard behind chain link: the office, a shed, the digger, earth and spare stones.
    const yard = { x: b.x + 40, y: b.y + 40, w: b.w - 80, h: b.h - 80 };
    const t = 6;
    const gate = 130;
    // Fence ring with a gate on the west side and one on the north.
    obstacles.push(ob('fence', yard.x, yard.y, (yard.w - gate) / 2, t));
    obstacles.push(ob('fence', yard.x + (yard.w + gate) / 2, yard.y, (yard.w - gate) / 2, t));
    obstacles.push(ob('fence', yard.x, yard.y + yard.h - t, yard.w, t));
    obstacles.push(ob('fence', yard.x, yard.y, t, (yard.h - gate) / 2));
    obstacles.push(ob('fence', yard.x, yard.y + (yard.h + gate) / 2, t, (yard.h - gate) / 2));
    obstacles.push(ob('fence', yard.x + yard.w - t, yard.y, t, yard.h));
    paving.push({ x: yard.x, y: yard.y, w: yard.w, h: yard.h, dirt: true });
    reserved.push({ x: b.x, y: b.y, w: b.w, h: b.h });
    // The office: big enough for somebody to have boarded themselves into, and
    // set three steps in from the fence on both sides (room to walk right round it).
    const ow = Math.min(280, yard.w - 260);
    obstacles.push(ob('building', yard.x + yard.w - ow - 102, yard.y + 102, ow, 200, { color: '#4a4640', vents: 2, seed: ri(0, 1e6), stone: true }));
    obstacles.push(ob('building', yard.x + 50, yard.y + yard.h - 150, 110, 84, { color: '#4d5248', vents: 0, seed: ri(0, 1e6), shed: true, pitched: true, nocarve: true, siding: '#6f7a66', facing: 's' }));
    const dig = ob('digger', yard.x + r(120, 200), yard.y + r(90, 150), 70, 44, { a: chance(0.5) ? 0 : 1 });
    if (free(dig, 20)) obstacles.push(dig);
    for (let k = 0, n = ri(3, 5); k < n; k++) {
      const m = ob('mound', yard.x + r(60, yard.w - ow - 160), yard.y + r(220, yard.h - 240), ri(56, 80), ri(44, 60), { seed: ri(0, 1e6) });
      if (free(m, 44)) obstacles.push(m);
    }
    for (let k = 0, n = ri(2, 4); k < n; k++) {
      const c = ob('crate', yard.x + yard.w - r(80, ow), yard.y + r(350, yard.h - 80), 34, 34);
      if (free(c, 30)) obstacles.push(c);
    }
    const truck = ob('car', yard.x + yard.w / 2 - 30, yard.y + yard.h - 120, 92, 46, { color: '#55604a', front: -1 });
    if (free(truck, 24)) obstacles.push(truck);
    const bx = yard.x + yard.w * 0.4;
    const by = yard.y + yard.h * 0.55;
    const barrel = ob('barrel', bx - 12, by - 12, 24, 24, { fire: true });
    if (free(barrel, 30)) {
      obstacles.push(barrel);
      fires.push({ x: bx, y: by, barrel: true });
    }
    decor.push({ type: 'oil', x: dig.x + 30, y: dig.y + 70, s: 1.2, a: r(0, 3) });
    lamps.push({ x: yard.x + 70, y: yard.y + 70, r: 260, k: 0.66, tower: true, broken: chance(0.3) });
  }

  // --- The two ends ---------------------------------------------------------------------------
  let startRoom = null;
  let endRoom = null;
  let start = null;
  let gateX = 0;
  for (const b of blocks) {
    if (b.type === 'start') {
      // The gatehouse, in the corner by the main gate: door to the avenue.
      const x = b.x + b.w - SAFE_W;
      const y = b.y + b.h - SAFE_H - 120;
      startRoom = safeRoom(obstacles, pickups, x, y, 'right', false);
      start = { x: startRoom.interior.x + startRoom.interior.w / 2, y: startRoom.interior.y + startRoom.interior.h / 2 + 10 };
      reserved.push({ x: x - 60, y: y - 60, w: SAFE_W + 120, h: SAFE_H + 200 });
      reserved.push(doorApron(startRoom));
      gateX = b.x + b.w;
      // Visitors' parking along the south wall, a lodge, then the first rows.
      const lot = { x: b.x + 40, y: b.y + b.h - 150, w: b.w - SAFE_W - 120, h: 120 };
      paving.push(lot);
      reserved.push({ x: lot.x - 10, y: lot.y - 20, w: lot.w + 20, h: lot.h + 60 });
      for (let x2 = lot.x + 16; x2 + 50 < lot.x + lot.w; x2 += 58) {
        markings.parking.push({ x: x2, y: lot.y + 16, w: 58, h: 92 });
        if (chance(0.4)) obstacles.push(ob('car', x2 + 7, lot.y + 20, 44, 84, { color: pick(CAR_COLORS), vertical: true, front: chance(0.5) ? 1 : -1 }));
      }
      trees(b, ri(2, 3), 0.1, 44);
      rows({ x: b.x, y: b.y, w: b.w, h: lot.y - 40 - b.y });
    } else if (b.type === 'end') {
      // The receiving vault at the north gate.
      const x = b.x;
      const y = b.y + 60;
      endRoom = safeRoom(obstacles, pickups, x, y, 'left', true); // its door opens west, onto the last path
      reserved.push({ x: x - 60, y: y - 60, w: SAFE_W + 120, h: SAFE_H + 120 });
      reserved.push(doorApron(endRoom));
    }
  }

  let chapelAt = null;
  for (const b of blocks) {
    switch (b.type) {
      case 'graves': graves(b); break;
      case 'mausoleums': mausoleums(b); break;
      case 'woods': woods(b); break;
      case 'pond': pond(b); break;
      case 'memorial': memorial(b); break;
      case 'columbarium': columbarium(b); break;
      case 'chapel': chapelAt = chapel(b); break;
      case 'service': service(b); break;
      case 'end': {
        // Old money around the vault: a mausoleum row to the east of it, rows below.
        const depth = 96;
        for (let x = b.x + SAFE_W + 90; x + 90 < b.x + b.w - 20; x += r(130, 170)) mausoleum(Math.round(x), b.y + 40, ri(70, 92), depth);
        trees(b, ri(2, 4), 0.3, 44);
        rows(b);
        break;
      }
      default:
    }
  }

  // --- The main gate: pillars and open iron gates at the foot of the avenue ------------------------
  const av = streets.find((s) => s.dir === 'v' && s.avenue);
  for (const sx of [0, 1]) obstacles.push(ob('obelisk', sx ? av.x + av.w + 2 : av.x - 30, H - 34, 28, 28, { color: '#8a8b84', hgt: 60, pillar: true, seed: 3 + sx }));
  decor.push({ type: 'paint', x: av.x + av.w / 2, y: H - 150, text: 'WISSAHICKON HILL', size: 24, a: -Math.PI / 2 });
  decor.push({ type: 'paint', x: av.x + av.w / 2 + 28, y: H - 150, text: 'CEMETERY · EST. 1836', size: 13, a: -Math.PI / 2 });

  // --- Lanterns along the avenues; a few (mostly dead) on the other paths ---------------------------
  const inIntersection = (x, y, pad) => intersections.some((it) => x > it.x - pad && x < it.x + it.w + pad && y > it.y - pad && y < it.y + it.h + pad);
  for (const s of streets) {
    const len = s.dir === 'v' ? s.h : s.w;
    const step = s.avenue ? 300 : 620;
    for (let p = 150, side = 0; p < len - 80; p += step, side ^= 1) {
      const x = s.dir === 'v' ? (side ? s.x - 8 : s.x + s.w + 8) : s.x + p;
      const y = s.dir === 'v' ? s.y + p : side ? s.y - 8 : s.y + s.h + 8;
      if (inIntersection(x, y, 30)) continue;
      if (!free({ x: x - 8, y: y - 8, w: 16, h: 16 }, 4)) continue;
      lantern(x, y, { broken: s.avenue ? chance(0.15) : chance(0.55) });
    }
  }

  // --- Cars left on the paths (the funeral that never finished), two with their alarms armed -------
  const pathCars = [];
  for (const s of streets) {
    const len = s.dir === 'v' ? s.h : s.w;
    for (let k = 0, n = ri(0, 2); k < n; k++) {
      const p = r(200, len - 300);
      const rect = s.dir === 'v' ? { x: s.x + (chance(0.5) ? 14 : s.w - 58), y: s.y + p, w: 44, h: 86 } : { x: s.x + p, y: s.y + (chance(0.5) ? 14 : s.h - 58), w: 86, h: 44 };
      if (inIntersection(rect.x + rect.w / 2, rect.y + rect.h / 2, 40) || !free(rect, 30)) continue;
      if ([startRoom, endRoom].some((room) => rectsOverlap(doorApron(room, 220), rect))) continue;
      const c = ob('car', rect.x, rect.y, rect.w, rect.h, { color: pick(CAR_COLORS), vertical: s.dir === 'v', front: chance(0.5) ? 1 : -1 });
      obstacles.push(c);
      pathCars.push(c);
    }
  }
  let alarms = 0;
  for (const c of shuffle(pathCars.slice(), rnd)) {
    if (alarms >= 2) break;
    if (Math.hypot(c.x - start.x, c.y - start.y) < 900) continue;
    c.alarm = true;
    c.color = '#b8b8b2';
    alarms++;
  }

  // --- Vigil candles: a few graves somebody still visits ------------------------------------------
  for (const c of shuffle(candles, rnd).slice(0, 26)) {
    decor.push({ type: 'candle', x: c.x, y: c.y });
    glows.push({ x: c.x, y: c.y, r: 58, k: 0.36, tint: 'rgba(255,170,90,0.10)' });
  }

  // --- Ledgers you can read: a handful of flat slabs along the paths -------------------------------
  const lines = shuffle(EPITAPHS.slice(), rnd);
  let li = 0;
  for (const b of shuffle(blocks.filter((q) => q.type === 'graves' || q.type === 'mausoleums' || q.type === 'pond'), rnd)) {
    if (li >= 8) break;
    // On the section's south edge, by the path, where everybody walks past.
    const text = lines[li];
    const w = text.length * 7.2 + 20;
    const x = b.x + r(w / 2 + 40, b.w - w / 2 - 40);
    const y = b.y + b.h - 18;
    const rect = { x: x - w / 2, y: y - 12, w, h: 24 };
    if (!free(rect, 6)) continue;
    decor.push({ type: 'epitaph', x, y, text, w });
    li++;
  }

  // --- Medkits, clutter, the border ----------------------------------------------------------------
  scatterKits(D, obstacles, pickups, W, H, start, 10);
  for (let k = 0; k < 170; k++) {
    const x = r(0, W);
    const y = r(0, H);
    if (!free({ x: x - 10, y: y - 10, w: 20, h: 20 })) continue;
    const onPath = streets.some((s) => x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h);
    const t = rnd();
    if (onPath) decor.push({ type: t < 0.45 ? 'puddle' : t < 0.75 ? 'leaves' : 'crack', x, y, s: r(0.7, 1.4), a: r(0, Math.PI) });
    else decor.push({ type: t < 0.6 ? 'leaves' : t < 0.8 ? 'tuft' : 'puddle', x, y, s: r(0.7, 1.5), a: r(0, Math.PI) });
  }
  border(obstacles, W, H);

  return {
    seed,
    theme: 'graveyard',
    w: W,
    h: H,
    obstacles,
    blocks,
    streets,
    intersections,
    markings,
    lamps,
    pickups,
    decor,
    fires,
    glows,
    start,
    startRoom,
    endRoom,
    darknessBoost: 0.03,
    // Graveyard-only layout, for rendering.
    paving,
    ponds,
    chapel: chapelAt,
    gate: { x: gateX, y: H },
    graves: graveCount,
  };
}
