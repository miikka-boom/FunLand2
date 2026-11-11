// Pier 9: the docks finale map. A seeded harbour front, west to east:
//
//   warehouse lots | yard road | container yard | quay apron | water + piers
//
// You start in the harbour office (bottom left) and head for Pier 9, the long
// pier in the north-east. At its end: the flare post. Fire it, hold out until
// the ferry docks along the pier, then run for the gangway (the "end room" is
// the boarding spot at the foot of the gangway; it only counts once docked).
//
// Every lane in the container yard stays open (stacks sit in a grid of cells
// with lanes between all of them), so the route always connects.

import { mulberry32, rectsOverlap, shuffle } from '../util.js';

export const DOCKS_W = 5200;
export const DOCKS_H = 3200;
const STREET = 184;
const SIDEWALK = 22;
const WARE_X1 = 1420; // warehouse lots end here
const YARD_X0 = WARE_X1 + STREET; // the yard road runs between
const APRON_X = 3000; // the open quay apron (crane rails) from here to the water
export const QUAY_X = 3400; // the quay edge: water east of here
const CONT_W = 56; // a container's width; 20ft = 144 long, 40ft = 288

// move: blocks movement, shot: stops bullets, sight: blocks line of sight / light.
const KINDS = {
  building: { move: true, shot: true, sight: true },
  wall: { move: true, shot: true, sight: true },
  border: { move: true, shot: true, sight: true },
  container: { move: true, shot: true, sight: true },
  water: { move: true, shot: false, sight: false },
  car: { move: true, shot: true, sight: false },
  crate: { move: true, shot: true, sight: false },
  dumpster: { move: true, shot: true, sight: false },
  forklift: { move: true, shot: true, sight: false },
  craneleg: { move: true, shot: true, sight: false },
  bollard: { move: true, shot: false, sight: false },
  flarepost: { move: true, shot: false, sight: false },
  barrel: { move: true, shot: true, sight: false },
};

const ROOFS = ['#4a4f55', '#55504a', '#3e4a52', '#5a4e44', '#4d5248', '#47494f'];
const BOX_COLORS = ['#8c3b2e', '#2f5d7c', '#3f6b45', '#b5762c', '#2f7a78', '#6e4a7a', '#7a7d80', '#9a5a2a', '#24476b', '#a8433a'];
const CAR_COLORS = ['#6d2e2e', '#2e4a6d', '#6b6b6b', '#3f5f3a', '#8a7b52', '#2f2f2f', '#9a9a94'];

function ob(kind, x, y, w, h, extra = {}) {
  return { kind, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), ...KINDS[kind], ...extra };
}

export function generateDocks(seed) {
  const rnd = mulberry32((seed ^ 0x5eed9) >>> 0);
  const r = (a, b) => a + rnd() * (b - a);
  const ri = (a, b) => Math.floor(r(a, b + 1));
  const chance = (p) => rnd() < p;
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const W = DOCKS_W;
  const H = DOCKS_H;

  const obstacles = [];
  const blocks = [];
  const streets = [];
  const lamps = [];
  const pickups = [];
  const decor = [];
  const fires = [];
  const glows = [];
  const markings = { dashes: [], crosswalks: [], parking: [] };
  const lines = []; // long ground markings: crane rails, the quay edge, loading-dock stripes
  const free = (rect, pad = 0) => !obstacles.some((o) => rectsOverlap(o, rect, pad));

  // --- Water and piers ------------------------------------------------------------------
  // Piers 6-8 (south -> north) are short side trips; Pier 9 is the long one up north.
  const piers = [
    { name: '6', y: Math.round(r(2660, 2760)), w: 180, len: Math.round(r(600, 700)) },
    { name: '7', y: Math.round(r(1930, 2040)), w: 190, len: Math.round(r(700, 820)) },
    { name: '8', y: Math.round(r(1200, 1300)), w: 190, len: Math.round(r(640, 760)) },
    { name: '9', y: 420, w: 240, len: 1420, main: true },
  ].map((p) => ({ ...p, x: QUAY_X, h: p.w, w: p.len }));
  const pier9 = piers[3];
  const water = [];
  const byY = piers.slice().sort((a, b) => a.y - b.y);
  let y = 0;
  for (const p of byY) {
    if (p.y > y) water.push({ x: QUAY_X, y, w: W - QUAY_X, h: p.y - y });
    water.push({ x: p.x + p.w, y: p.y, w: W - (p.x + p.w), h: p.h });
    y = p.y + p.h;
  }
  if (y < H) water.push({ x: QUAY_X, y, w: W - QUAY_X, h: H - y });
  for (const w of water) obstacles.push(ob('water', w.x, w.y, w.w, w.h));

  // --- Warehouse district -------------------------------------------------------------------
  const cols = [[0, 620], [620 + STREET, WARE_X1]];
  const rows = [[0, 640], [640 + STREET, 1500], [1500 + STREET, 2340], [2340 + STREET, H]];
  for (const [x0, x1] of [[cols[0][1], cols[1][0]]]) streets.push({ dir: 'v', x: x0, y: 0, w: x1 - x0, h: H });
  streets.push({ dir: 'v', x: WARE_X1, y: 0, w: STREET, h: H }); // the yard road
  for (let j = 0; j < rows.length - 1; j++) streets.push({ dir: 'h', x: 0, y: rows[j][1], w: YARD_X0, h: rows[j + 1][0] - rows[j][1] });
  for (let i = 0; i < cols.length; i++) {
    for (let j = 0; j < rows.length; j++) {
      const b = { x: cols[i][0], y: rows[j][0], w: cols[i][1] - cols[i][0], h: rows[j][1] - rows[j][0] };
      const l = i > 0 ? SIDEWALK : 0;
      const rr = SIDEWALK; // every lot faces a street on its east side
      const t = j > 0 ? SIDEWALK : 0;
      const bb = j < rows.length - 1 ? SIDEWALK : 0;
      const inner = { x: b.x + l, y: b.y + t, w: b.w - l - rr, h: b.h - t - bb };
      let type = chance(0.72) ? 'warehouse' : 'truckyard';
      if (i === 0 && j === rows.length - 1) type = 'start';
      blocks.push({ ...b, inner, type, i, j });
    }
  }
  // Road markings: centre dashes on every street.
  for (const s of streets) {
    if (s.dir === 'v') markings.dashes.push({ x0: s.x + s.w / 2, y0: 20, x1: s.x + s.w / 2, y1: s.y + s.h - 20 });
    else markings.dashes.push({ x0: s.x + 20, y0: s.y + s.h / 2, x1: s.x + s.w - 20, y1: s.y + s.h / 2 });
  }

  function warehouse(rect) {
    // A big shed with a loading strip (trucks, pallets, a dumpster) along one long side.
    const side = rect.w >= rect.h ? (chance(0.5) ? 'top' : 'bottom') : chance(0.5) ? 'left' : 'right';
    const strip = Math.round(r(96, 130));
    const inset = 10;
    let bx = rect.x + inset;
    let by = rect.y + inset;
    let bw = rect.w - 2 * inset;
    let bh = rect.h - 2 * inset;
    if (side === 'top') { by += strip; bh -= strip; }
    if (side === 'bottom') bh -= strip;
    if (side === 'left') { bx += strip; bw -= strip; }
    if (side === 'right') bw -= strip;
    // Big lots get two sheds with an alley between them.
    const sheds = [];
    if (bh > 560 && bw >= 300) {
      const alley = ri(84, 110);
      const at = Math.round(bh * r(0.42, 0.58));
      sheds.push({ x: bx, y: by, w: bw, h: at - alley / 2 }, { x: bx, y: by + at + alley / 2, w: bw, h: bh - at - alley / 2 });
    } else sheds.push({ x: bx, y: by, w: bw, h: bh });
    for (const s of sheds) {
      if (s.w < 120 || s.h < 120) continue;
      obstacles.push(ob('building', s.x, s.y, s.w, s.h, { color: pick(ROOFS), vents: ri(1, 4), seed: ri(0, 1e6), ware: true }));
    }
    // The loading strip.
    const st = side === 'top' ? { x: rect.x, y: rect.y, w: rect.w, h: strip + inset }
      : side === 'bottom' ? { x: rect.x, y: rect.y + rect.h - strip - inset, w: rect.w, h: strip + inset }
      : side === 'left' ? { x: rect.x, y: rect.y, w: strip + inset, h: rect.h }
      : { x: rect.x + rect.w - strip - inset, y: rect.y, w: strip + inset, h: rect.h };
    const horiz = side === 'top' || side === 'bottom';
    const len = horiz ? st.w : st.h;
    for (let p = 40; p < len - 100; p += r(120, 210)) {
      const roll = rnd();
      if (roll < 0.3) {
        // A parked truck, nose out.
        const tw = horiz ? 58 : 132;
        const th = horiz ? 132 : 58;
        const tx = horiz ? st.x + p : st.x + (st.w - tw) / 2;
        const ty = horiz ? st.y + (st.h - th) / 2 : st.y + p;
        const c = ob('car', tx, ty, tw, th, { color: pick(CAR_COLORS), front: chance(0.5) ? 1 : -1, truck: true });
        if (free(c, 10)) obstacles.push(c);
      } else if (roll < 0.55) {
        const s = 34;
        const n = ri(1, 3);
        for (let k = 0; k < n; k++) {
          const cx = horiz ? st.x + p + k * (s + 4) : st.x + r(8, Math.max(9, st.w - s - 8));
          const cy = horiz ? st.y + r(8, Math.max(9, st.h - s - 8)) : st.y + p + k * (s + 4);
          const c = ob('crate', cx, cy, s, s);
          if (free(c, 6)) obstacles.push(c);
        }
      } else if (roll < 0.7) {
        const c = ob('dumpster', horiz ? st.x + p : st.x + 8, horiz ? st.y + 8 : st.y + p, horiz ? 62 : 34, horiz ? 34 : 62, { color: chance(0.5) ? '#2f4f3a' : '#3a3f5a' });
        if (free(c, 8)) obstacles.push(c);
      } else decor.push({ type: 'oil', x: horiz ? st.x + p + 30 : st.x + st.w / 2, y: horiz ? st.y + st.h / 2 : st.y + p + 30, s: r(0.8, 1.4), a: r(0, Math.PI) });
    }
    // Hazard stripes along the loading edge.
    lines.push({ type: 'dockedge', x: st.x, y: st.y, w: st.w, h: st.h, side });
  }

  function truckyard(rect) {
    // Rows of parked trailers with lanes between.
    const horiz = rect.w >= rect.h;
    const len = horiz ? rect.h : rect.w;
    for (let p = 40; p < len - 150; p += 210) {
      for (let q = 30; q < (horiz ? rect.w : rect.h) - 100; q += r(76, 96)) {
        if (chance(0.3)) continue;
        const tw = horiz ? 58 : 140;
        const th = horiz ? 140 : 58;
        const c = ob('car', horiz ? rect.x + q : rect.x + p, horiz ? rect.y + p : rect.y + q, tw, th, { color: pick(CAR_COLORS), front: chance(0.5) ? 1 : -1, truck: true });
        if (c.x + c.w > rect.x + rect.w - 10 || c.y + c.h > rect.y + rect.h - 10) continue;
        if (free(c, 12)) obstacles.push(c);
      }
    }
    decor.push({ type: 'oil', x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, s: 1.6, a: r(0, Math.PI) });
  }

  // The harbour office: the start safe room (door east), like the city's.
  let startRoom = null;
  let start = null;
  function safeRoom(rect) {
    const RW = 232;
    const RH = 192;
    const T = 16;
    const door = 88;
    const x = rect.x + rect.w - RW;
    const y0 = rect.y + 40;
    const color = '#3d5a45';
    const wall = (wx, wy, ww, wh) => obstacles.push(ob('wall', wx, wy, ww, wh, { color, safe: true }));
    wall(x, y0, RW, T);
    wall(x, y0 + RH - T, RW, T);
    const dy0 = y0 + (RH - door) / 2;
    wall(x, y0 + T, T, RH - 2 * T);
    wall(x + RW - T, y0 + T, T, dy0 - (y0 + T));
    wall(x + RW - T, dy0 + door, T, y0 + RH - T - (dy0 + door));
    const interior = { x: x + T, y: y0 + T, w: RW - 2 * T, h: RH - 2 * T };
    pickups.push({ kind: 'medkit', x: interior.x + 26, y: interior.y + 26 });
    // The rest of the lot: a customs shed and a parking strip.
    const gap = 74;
    const rest = { x: rect.x, y: rect.y, w: rect.w - RW - gap, h: rect.h };
    if (rest.w > 140) obstacles.push(ob('building', rest.x + 10, rest.y + 10, rest.w - 20, rest.h * 0.55, { color: pick(ROOFS), vents: 2, seed: ri(0, 1e6), ware: true }));
    const below = { x, y: y0 + RH + gap, w: RW, h: rect.y + rect.h - (y0 + RH + gap) - 10 };
    if (below.h > 140) obstacles.push(ob('building', below.x, below.y, below.w, below.h, { color: pick(ROOFS), vents: 1, seed: ri(0, 1e6) }));
    return { interior, door: { x: x + RW - T, y: dy0, w: T, h: door }, outer: { x, y: y0, w: RW, h: RH } };
  }

  for (const b of blocks) {
    if (b.type === 'start') {
      startRoom = safeRoom(b.inner);
      start = { x: startRoom.interior.x + startRoom.interior.w / 2, y: startRoom.interior.y + startRoom.interior.h / 2 + 10 };
    } else if (b.type === 'warehouse') warehouse(b.inner);
    else truckyard(b.inner);
  }

  // --- Container yard ------------------------------------------------------------------------
  // A grid of cells with lanes between every one; each cell holds a stack (or is left open).
  const yard = { x: YARD_X0, y: 0, w: APRON_X - YARD_X0, h: H };
  const colsY = [];
  for (let x = YARD_X0 + 50; x < APRON_X - 160;) {
    let cw = chance(0.6) ? 300 : 164;
    if (x + cw > APRON_X - 50) cw = 164;
    if (x + cw > APRON_X - 50) break;
    colsY.push([x, x + cw]);
    x += cw + ri(112, 136);
  }
  const rowsY = [];
  const avenues = new Set([ri(2, 3), ri(5, 6)]); // a couple of wide cross lanes
  for (let yy = 90, k = 0; yy < H - 200; k++) {
    const ch = ri(170, 240);
    if (yy + ch > H - 90) break;
    rowsY.push([yy, yy + ch]);
    yy += ch + (avenues.has(k) ? ri(190, 220) : ri(116, 140));
  }
  const stacks = [];
  for (const [cx0, cx1] of colsY) {
    for (const [cy0, cy1] of rowsY) {
      const cw = cx1 - cx0;
      const ch = cy1 - cy0;
      if (chance(0.13)) {
        // An open cell: a loose box, a reach stacker, pallets.
        if (chance(0.5)) {
          const c = ob('forklift', cx0 + r(10, cw - 70), cy0 + r(10, ch - 50), 60, 40, { color: '#c9a227', a: chance(0.5) ? 0 : Math.PI });
          obstacles.push(c);
        }
        decor.push({ type: 'oil', x: cx0 + cw / 2, y: cy0 + ch / 2, s: r(0.8, 1.5), a: r(0, Math.PI) });
        continue;
      }
      // Containers lying east-west (2-4 side by side), or a row of them turned north-south.
      const horiz = !(cw >= 300 && chance(0.28));
      const long = horiz && cw >= 290 && chance(0.7) ? 288 : 144;
      const n = horiz ? Math.max(2, Math.min(Math.floor(ch / CONT_W), ri(2, 4))) : Math.max(3, Math.min(Math.floor(cw / CONT_W), ri(3, 5)));
      const sw = horiz ? long : n * CONT_W;
      const sh = horiz ? n * CONT_W : 144;
      const sx = cx0 + Math.round(r(0, cw - sw));
      const sy = cy0 + Math.round(r(0, ch - sh));
      const colors = Array.from({ length: n }, () => pick(BOX_COLORS));
      const s = ob('container', sx, sy, sw, sh, { dir: horiz ? 'h' : 'v', n, colors, seed: ri(0, 1e6), tall: chance(0.35) });
      obstacles.push(s);
      stacks.push(s);
    }
  }
  // Light poles in some yard lanes.
  for (let k = 0; k < rowsY.length - 1; k++) {
    if (k % 2) continue;
    const ly = (rowsY[k][1] + rowsY[k + 1][0]) / 2;
    for (let x = YARD_X0 + 260; x < APRON_X - 100; x += 520) lamps.push({ x, y: ly, r: 210, k: 0.66, broken: chance(0.25) });
  }

  // --- Quay apron: rails, gantry cranes, light towers, bollards ---------------------------
  const railA = APRON_X + 70;
  const railB = QUAY_X - 70;
  lines.push({ type: 'rail', x: railA, y0: 0, y1: H }, { type: 'rail', x: railB, y0: 0, y1: H });
  const cranes = [];
  const mouths = piers.map((p) => [p.y - 40, p.y + p.h + 40]);
  for (const cy of [r(780, 980), r(1560, 1760), r(2360, 2560)]) {
    const span = 170;
    const legs = [[railA - 13, cy], [railB - 13, cy], [railA - 13, cy + span], [railB - 13, cy + span]];
    for (const [lx, ly] of legs) obstacles.push(ob('craneleg', lx, ly, 26, 26));
    cranes.push({ x0: railA, x1: railB, y: cy + 13, y1: cy + span + 13, boom: r(240, 340), color: chance(0.5) ? '#c6862c' : '#9e3a2e' });
  }
  for (const ty of [260, 1100, 1880, 2700]) lamps.push({ x: APRON_X + 200, y: ty, r: 270, k: 0.7, tower: true, broken: chance(0.2) });
  for (let by = 60; by < H - 40; by += 120) {
    if (mouths.some(([a, b]) => by > a && by < b)) continue;
    obstacles.push(ob('bollard', QUAY_X - 22, by, 14, 14));
  }
  // Painted pier numbers at each mouth.
  for (const p of piers) decor.push({ type: 'paint', x: QUAY_X - 150, y: p.y + p.h / 2, text: `PIER ${p.name}`, size: p.main ? 40 : 30, a: 0 });
  lines.push({ type: 'quayedge', x: QUAY_X, y0: 0, y1: H });

  // --- Piers: planks, bollards along the edges, lamps, a little cover --------------------------
  const p9end = pier9.x + pier9.w;
  const keepClear = [
    { x: p9end - 330 - 80, y: pier9.y - 10, w: 160, h: 110 }, // the gangway's foot
    { x: p9end - 150, y: pier9.y, w: 150, h: pier9.h }, // the flare post
  ];
  const clearOfFinale = (o) => !keepClear.some((k) => rectsOverlap(o, k));
  for (const p of piers) {
    for (let bx = p.x + 90; bx < p.x + p.w - 40; bx += p.main ? 150 : 170) {
      for (const b of [ob('bollard', bx, p.y + 4, 14, 14), ob('bollard', bx + 40, p.y + p.h - 18, 14, 14)]) if (clearOfFinale(b)) obstacles.push(b);
    }
    for (let lx = p.x + 160, s = 0; lx < p.x + p.w - 60; lx += 280, s ^= 1) lamps.push({ x: lx, y: s ? p.y + 6 : p.y + p.h - 6, r: 175, k: 0.66, pier: true, broken: !p.main && chance(0.35) });
    if (!p.main) {
      // A crate pile and a moored boat; the far end is a dead end (a good place for a find).
      const c = ob('crate', p.x + p.w * r(0.35, 0.6), p.y + p.h / 2 - 17 + r(-30, 30), 34, 34);
      if (free(c, 20)) obstacles.push(c);
      decor.push({ type: 'boat', x: p.x + p.w * r(0.3, 0.7), y: chance(0.5) ? p.y - 34 : p.y + p.h + 34, a: 0, s: r(0.8, 1.1), color: pick(['#c9c3b6', '#6d8a99', '#a3473a']) });
      decor.push({ type: 'nets', x: p.x + p.w * r(0.65, 0.85), y: p.y + p.h / 2 + r(-40, 40), s: r(0.8, 1.2), a: r(0, 3) });
    }
  }

  // Pier 9 itself: ticket booth at the land end, cover along the way, the flare post at the end.
  const p9 = pier9;
  const end = p9.x + p9.w;
  const midY = p9.y + p9.h / 2;
  obstacles.push(ob('building', p9.x + 120, p9.y + p9.h - 86, 96, 70, { color: '#5b6b74', vents: 0, seed: ri(0, 1e6), booth: true }));
  decor.push({ type: 'paint', x: p9.x + 470, y: midY, text: 'FERRY ▸', size: 26, a: 0 });
  const cover = [
    [0.32, -1], [0.46, 1], [0.6, -1], [0.72, 1], [0.84, -1],
  ];
  for (const [f, side] of cover) {
    const cx = p9.x + p9.w * f + r(-30, 30);
    const cy = side < 0 ? p9.y + 30 : p9.y + p9.h - 64;
    const n = ri(1, 2);
    for (let k = 0; k < n; k++) {
      const c = ob('crate', cx + k * 38, cy, 34, 34);
      if (free(c, 6) && clearOfFinale(c)) obstacles.push(c);
    }
  }
  const flare = { x: end - 70, y: midY };
  obstacles.push(ob('flarepost', flare.x - 11, flare.y - 11, 22, 22));
  pickups.push({ kind: 'medkit', x: end - 40, y: p9.y + 40 }, { kind: 'medkit', x: end - 40, y: p9.y + p9.h - 40 }, { kind: 'ammo', x: end - 130, y: p9.y + p9.h - 36 });
  // The ferry berths along the north side; the gangway comes down a bit back from the end.
  const ship = { x: end - 720, y: p9.y - 196, w: 700, h: 180 };
  const gangX = end - 330;
  const board = { x: gangX - 44, y: p9.y + 2, w: 88, h: 66 };
  const endRoom = { interior: board, outer: { x: board.x - 10, y: board.y - 10, w: board.w + 20, h: board.h + 20 }, door: { x: -999, y: -999, w: 0, h: 0 }, gangway: true };
  decor.push({ type: 'paint', x: gangX, y: p9.y + p9.h - 40, text: 'BOARDING', size: 18, a: 0 });

  // --- Street lamps in the warehouse district ------------------------------------------------
  for (const s of streets) {
    const len = s.dir === 'v' ? s.h : s.w;
    for (let p = 160, side = 0; p < len - 80; p += 340, side ^= 1) {
      const lamp = s.dir === 'v' ? { x: side ? s.x - 6 : s.x + s.w + 6, y: s.y + p } : { x: s.x + p, y: side ? s.y - 6 : s.y + s.h + 6 };
      if (chance(0.2)) lamp.broken = true;
      lamps.push(lamp);
    }
  }

  // --- Barrel fires (survivors kept warm here), medkits, clutter --------------------------------
  const fireSpots = shuffle([
    { x: APRON_X + r(120, 300), y: r(1300, 1500) },
    { x: APRON_X + r(120, 300), y: r(2100, 2300) },
    { x: WARE_X1 + STREET / 2 + r(-40, 40), y: r(1100, 1400) },
  ], rnd).slice(0, 2);
  for (const f of fireSpots) {
    const b = ob('barrel', f.x - 12, f.y - 12, 24, 24, { fire: true });
    if (!free(b, 20)) continue;
    obstacles.push(b);
    fires.push({ x: f.x, y: f.y, barrel: true });
  }
  let kits = 0;
  for (let k = 0; k < 400 && kits < 9; k++) {
    const x = r(80, QUAY_X - 40);
    const yy = r(80, H - 80);
    if (Math.hypot(x - start.x, yy - start.y) < 600) continue;
    if (!free({ x: x - 16, y: yy - 16, w: 32, h: 32 }, 8)) continue;
    if (pickups.some((q) => Math.hypot(q.x - x, q.y - yy) < 520)) continue;
    pickups.push({ kind: 'medkit', x, y: yy });
    kits++;
  }
  for (let k = 0; k < 180; k++) {
    const x = r(0, W);
    const yy = r(0, H);
    if (!free({ x: x - 10, y: yy - 10, w: 20, h: 20 })) continue;
    const t = rnd();
    const onPier = piers.some((p) => x > p.x && x < p.x + p.w && yy > p.y && yy < p.y + p.h);
    if (onPier) decor.push({ type: t < 0.4 ? 'rope' : t < 0.7 ? 'fishbox' : 'puddle', x, y: yy, s: r(0.7, 1.3), a: r(0, Math.PI) });
    else decor.push({ type: t < 0.35 ? 'puddle' : t < 0.6 ? 'crack' : t < 0.82 ? 'trash' : 'oil', x, y: yy, s: r(0.7, 1.5), a: r(0, Math.PI) });
  }

  // A couple of alarm trucks in the warehouse lots (shooting one starts a panic event).
  const alarmed = [];
  for (const c of shuffle(obstacles.filter((o) => o.kind === 'car'), rnd)) {
    if (alarmed.length >= 2) break;
    if (Math.hypot(c.x - start.x, c.y - start.y) < 900) continue;
    if (alarmed.some((a) => Math.hypot(a.x - c.x, a.y - c.y) < 1000)) continue; // spread out
    c.alarm = true;
    c.color = '#b8b8b2';
    alarmed.push(c);
  }

  // --- World border ----------------------------------------------------------------------------
  const B = 400;
  obstacles.push(ob('border', -B, -B, W + 2 * B, B));
  obstacles.push(ob('border', -B, H, W + 2 * B, B));
  obstacles.push(ob('border', -B, 0, B, H));
  obstacles.push(ob('border', W, 0, B, H, { sea: true })); // drawn as open water

  return {
    seed,
    theme: 'docks',
    w: W,
    h: H,
    obstacles,
    blocks,
    streets,
    intersections: [],
    markings,
    lamps,
    pickups,
    decor,
    fires,
    glows,
    start,
    startRoom,
    endRoom,
    // Docks-only layout, for rendering and the finale.
    water,
    piers,
    lines,
    yard,
    apron: { x: APRON_X, y: 0, w: QUAY_X - APRON_X, h: H },
    cranes,
    finale: { flare, use: { x: flare.x - 36, y: flare.y }, ship, gangX, board, pier: { x: p9.x, y: p9.y, w: p9.w, h: p9.h } },
  };
}
