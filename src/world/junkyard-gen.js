// Cracked Bell Auto Salvage: the junkyard map, down by the river in
// Southwest Philly. Seeded, west to east:
//
//   front lot + office | the yard: rows of stacked wrecks | the back lot
//
// You start in the office trailer's strongroom (south-west) and cross the
// yard to the old garage in the north-east. The yard is a grid of cells with
// lanes between every one of them (so the route always connects); each cell
// holds a stack of flattened cars, a scrap heap, tyres, dead appliances, a
// couple of buses or containers. In the middle is the clearing with the
// crusher and the magnet crane, lit by floodlights.

import { rectsOverlap, shuffle } from '../util.js';
import { ob, dice, safeRoom, SAFE_W, SAFE_H, doorApron, border, freeOf, scatterKits, CELL } from './gen-kit.js';

export const JUNK_W = 4992; // 156 nav cells
export const JUNK_H = 3200; // 100
const YARD_X0 = 992; // the yard starts here (31 cells)
const YARD_X1 = 4064; // ...and the back lot here (127)

const CAR_COLORS = ['#6d2e2e', '#2e4a6d', '#6b6b6b', '#3f5f3a', '#8a7b52', '#4a3a5c', '#2f2f2f', '#7a4a22', '#9a9a94', '#7c3a2a', '#5a6a70'];
const BOX_COLORS = ['#8c3b2e', '#2f5d7c', '#3f6b45', '#7a7d80', '#9a5a2a', '#24476b'];
const ROOFS = ['#4a4f55', '#55504a', '#3e4a52', '#5a4e44'];
const snap = (v) => Math.round(v / CELL) * CELL;

export function generateJunkyard(seed) {
  const D = dice((seed ^ 0x4a0cd) >>> 0);
  const { rnd, r, ri, chance, pick } = D;
  const W = JUNK_W;
  const H = JUNK_H;

  const obstacles = [];
  const blocks = [];
  const streets = [];
  const lamps = [];
  const pickups = [];
  const decor = [];
  const fires = [];
  const glows = [];
  const paving = []; // { x, y, w, h, style }: gravel, pad, oil
  const lanes = []; // every lane of the yard: { dir, x, y, w, h, wide } (tyre tracks)
  const markings = { dashes: [], crosswalks: [], parking: [] };
  const free = freeOf(obstacles);

  // --- The front lot: office (the start), customer parking, the workshop -----------------------
  const front = { x: 0, y: 0, w: YARD_X0 - 96, h: H };
  blocks.push({ ...front, inner: { ...front }, type: 'start', i: 0, j: 0 });
  paving.push({ x: front.x, y: front.y, w: front.w, h: front.h, style: 'gravel' });
  // The office: a trailer on blocks with a strongroom at one end. Door east, onto the yard road.
  const sx = snap(front.w - SAFE_W - 40);
  const sy = snap(H - SAFE_H - 300);
  const startRoom = safeRoom(obstacles, pickups, sx, sy, 'right', false);
  const start = { x: startRoom.interior.x + startRoom.interior.w / 2, y: startRoom.interior.y + startRoom.interior.h / 2 + 10 };
  obstacles.push(ob('building', sx - 250, sy + 20, 236, 96, { trailer: true, color: '#8a8d88', vents: 1, seed: ri(0, 1e6), nocarve: true }));
  decor.push({ type: 'sign', x: sx - 130, y: sy + 150, text: 'OFFICE' });
  // The workshop: three bays, big enough to have a back room somebody boarded up.
  const wy = snap(r(420, 620));
  obstacles.push(ob('building', 110, wy, 420, 250, { ware: true, workshop: true, color: pick(ROOFS), vents: 2, seed: ri(0, 1e6) }));
  paving.push({ x: 110, y: wy + 250, w: 420, h: 110, style: 'pad' });
  for (let k = 0; k < 3; k++) {
    if (!chance(0.6)) continue;
    const c = ob('car', 150 + k * 136, wy + 262, 44, 86, { color: pick(CAR_COLORS), vertical: true, front: -1, wreck: chance(0.3) });
    if (free(c, 6)) obstacles.push(c);
  }
  // Customer parking by the gate, the scale, a tow truck.
  const lot = { x: 120, y: H - 250, w: front.w - 320, h: 130 };
  for (let x = lot.x; x + 56 <= lot.x + lot.w; x += 58) {
    markings.parking.push({ x, y: lot.y + 16, w: 58, h: 92 });
    if (chance(0.35)) obstacles.push(ob('car', x + 7, lot.y + 20, 44, 84, { color: pick(CAR_COLORS), vertical: true, front: chance(0.5) ? 1 : -1 }));
  }
  const tow = ob('car', 160, snap(r(1500, 1900)), 58, 132, { truck: true, tow: true, color: '#c9a227', front: -1 });
  if (free(tow, 20)) obstacles.push(tow);
  paving.push({ x: front.w - 190, y: H - 560, w: 150, h: 90, style: 'scale' });
  decor.push({ type: 'paint', x: front.w - 115, y: H - 590, text: 'SCALE · STOP', size: 12, a: 0 });
  decor.push({ type: 'paint', x: 330, y: H - 90, text: 'CRACKED BELL AUTO SALVAGE', size: 22, a: 0 });
  decor.push({ type: 'paint', x: 330, y: H - 62, text: 'CASH FOR JUNK CARS · U-PULL-IT · BRING YOUR OWN TOOLS', size: 10, a: 0 });
  // Tyres and scrap along the west fence, a kennel.
  for (let y = 120; y < wy - 150; y += r(170, 240)) {
    const o = chance(0.5) ? ob('tires', snap(r(40, 300)), snap(y), 96, 96, { seed: ri(0, 1e6) }) : ob('scrap', snap(r(40, 280)), snap(y), 128, 96, { seed: ri(0, 1e6) });
    if (free(o, 60)) obstacles.push(o);
  }
  for (let y = wy + 460; y < H - 700; y += r(200, 300)) {
    const o = ob(chance(0.5) ? 'tires' : 'appliances', snap(r(40, 420)), snap(y), 128, 96, { seed: ri(0, 1e6) });
    if (free(o, 70) && !rectsOverlap(o, { x: sx - 300, y: sy - 80, w: 700, h: 420 })) obstacles.push(o);
  }
  decor.push({ type: 'doghouse', x: sx - 290, y: sy + 190 }, { type: 'paint', x: sx - 250, y: sy + 226, text: 'BEWARE OF DOG (HE\'S A SWEETHEART)', size: 9, a: 0 });

  // --- The yard road (between the front lot and the stacks) -----------------------------------------
  const road = { dir: 'v', x: front.w, y: 0, w: YARD_X0 - front.w, h: H, wide: true };
  streets.push(road);
  lanes.push(road);

  // --- The yard: cells of junk with a lane between every one --------------------------------------
  const colsY = [];
  for (let x = YARD_X0 + 32; x < YARD_X1 - 200;) {
    let cw = snap(r(180, 320));
    if (x + cw > YARD_X1 - 40) cw = snap(YARD_X1 - 40 - x);
    if (cw < 150) break;
    colsY.push([x, x + cw]);
    x += cw + (colsY.length === 3 || colsY.length === 7 ? 192 : snap(r(112, 140)));
  }
  const rowsY = [];
  for (let y = 96, k = 0; y < H - 240; k++) {
    let ch = snap(r(150, 240));
    if (y + ch > H - 90) ch = snap(H - 90 - y);
    if (ch < 128) break;
    rowsY.push([y, y + ch]);
    y += ch + (k === 3 ? 192 : snap(r(112, 136)));
  }
  // Lanes for the ground (tyre tracks) and for the lamp posts.
  for (let i = 0; i < colsY.length - 1; i++) lanes.push({ dir: 'v', x: colsY[i][1], y: 0, w: colsY[i + 1][0] - colsY[i][1], h: H, wide: colsY[i + 1][0] - colsY[i][1] > 150 });
  for (let j = 0; j < rowsY.length - 1; j++) lanes.push({ dir: 'h', x: YARD_X0, y: rowsY[j][1], w: YARD_X1 - YARD_X0, h: rowsY[j + 1][0] - rowsY[j][1], wide: rowsY[j + 1][0] - rowsY[j][1] > 150 });
  for (const l of lanes) if (l.wide && l !== road) streets.push(l);

  // The clearing: two columns by two rows near the middle, kept open for the crusher and the crane.
  const ci = Math.max(1, Math.min(colsY.length - 3, Math.floor(colsY.length / 2) - 1));
  const cj = Math.max(1, Math.min(rowsY.length - 3, Math.floor(rowsY.length / 2) - 1));
  const clearing = { x: colsY[ci][0], y: rowsY[cj][0], w: colsY[ci + 1][1] - colsY[ci][0], h: rowsY[cj + 1][1] - rowsY[cj][0] };
  const yard = { x: YARD_X0, y: 0, w: YARD_X1 - YARD_X0, h: H };
  blocks.push({ ...yard, inner: { ...yard }, type: 'yard', i: 1, j: 0 });
  blocks.push({ ...clearing, inner: { ...clearing }, type: 'clearing', i: 1, j: 1 });

  const stacks = [];
  const groundCars = [];
  const letters = 'ABCDEFGHJKLMNP';
  colsY.forEach(([x0, x1], i) => {
    // Row letters painted at the south end of each column.
    if (i < letters.length) decor.push({ type: 'paint', x: (x0 + x1) / 2, y: H - 50, text: `ROW ${letters[i]}`, size: 18, a: 0 });
    rowsY.forEach(([y0, y1], j) => {
      const cw = x1 - x0;
      const ch = y1 - y0;
      if (i >= ci && i <= ci + 1 && j >= cj && j <= cj + 1) return; // the clearing
      const roll = rnd();
      if (roll < 0.1) {
        // An open cell: a wreck or two on the ground, an oil stain.
        for (let k = 0, n = ri(1, 2); k < n; k++) {
          const vert = chance(0.5);
          const c = ob('car', x0 + r(10, cw - (vert ? 54 : 96)), y0 + r(10, ch - (vert ? 96 : 54)), vert ? 44 : 86, vert ? 86 : 44, { color: pick(CAR_COLORS), vertical: vert, front: chance(0.5) ? 1 : -1, hulk: chance(0.6) });
          if (free(c, 16)) {
            obstacles.push(c);
            groundCars.push(c);
          }
        }
        decor.push({ type: 'oil', x: x0 + cw / 2, y: y0 + ch / 2, s: r(0.9, 1.6), a: r(0, 3) });
        return;
      }
      if (roll < 0.6) {
        // Flattened cars, stacked: side by side in rows, two to four high.
        const vert = ch > cw ? chance(0.7) : chance(0.3);
        const across = vert ? Math.max(2, Math.min(5, Math.floor(cw / 50))) : Math.max(2, Math.min(4, Math.floor(ch / 50)));
        const along = vert ? Math.max(1, Math.min(2, Math.floor(ch / 96))) : Math.max(1, Math.min(3, Math.floor(cw / 96)));
        const w = vert ? across * 48 : along * 94;
        const h = vert ? along * 94 : across * 48;
        const s = ob('wrecks', x0 + Math.round(r(0, cw - w)), y0 + Math.round(r(0, ch - h)), w, h, { vert, across, along, layers: ri(2, 4), seed: ri(0, 1e6) });
        obstacles.push(s);
        stacks.push(s);
        return;
      }
      if (roll < 0.72) {
        obstacles.push(ob('scrap', x0 + r(0, Math.max(1, cw - 180)), y0 + r(0, Math.max(1, ch - 140)), Math.min(cw, ri(140, 200)), Math.min(ch, ri(110, 150)), { seed: ri(0, 1e6) }));
        return;
      }
      if (roll < 0.82) {
        obstacles.push(ob('tires', x0 + r(0, Math.max(1, cw - 150)), y0 + r(0, Math.max(1, ch - 130)), Math.min(cw, ri(120, 160)), Math.min(ch, ri(100, 140)), { seed: ri(0, 1e6) }));
        return;
      }
      if (roll < 0.89) {
        obstacles.push(ob('appliances', x0 + r(0, Math.max(1, cw - 160)), y0 + r(0, Math.max(1, ch - 120)), Math.min(cw, ri(128, 170)), Math.min(ch, ri(96, 128)), { seed: ri(0, 1e6) }));
        return;
      }
      if (roll < 0.95 && cw >= 170) {
        // Buses nobody is coming back for.
        for (let k = 0, n = Math.min(3, Math.floor(ch / 62)); k < n; k++) {
          const b = ob('car', x0 + r(0, cw - 162), y0 + 4 + k * 60, 160, 52, { bus: true, color: chance(0.7) ? '#d9a21c' : '#8a8f96', front: chance(0.5) ? 1 : -1, hulk: true });
          if (free(b, 4)) obstacles.push(b);
        }
        return;
      }
      // Parts stores: a couple of shipping containers.
      const n = Math.max(2, Math.min(3, Math.floor(ch / 56)));
      obstacles.push(ob('container', x0 + r(0, Math.max(1, cw - 144)), y0 + r(0, Math.max(1, ch - n * 56)), 144, n * 56, { dir: 'h', n, colors: Array.from({ length: n }, () => pick(BOX_COLORS)), seed: ri(0, 1e6), tall: false }));
    });
  });

  // --- The clearing: the crusher, the crane, cubes of what used to be cars -------------------------
  paving.push({ x: clearing.x - 20, y: clearing.y - 20, w: clearing.w + 40, h: clearing.h + 40, style: 'pad' });
  const crx = snap(clearing.x + clearing.w * 0.5 - 90);
  const cry = snap(clearing.y + clearing.h * 0.28);
  obstacles.push(ob('crusher', crx, cry, 180, 100, { seed: ri(0, 1e6) }));
  const crane = { x: snap(clearing.x + clearing.w * 0.22), y: snap(clearing.y + clearing.h * 0.68), boom: 0 };
  obstacles.push(ob('cranebase', crane.x - 24, crane.y - 24, 48, 48, { seed: ri(0, 1e6) }));
  crane.bx = crx + 60; // the boom reaches over the crusher's hopper
  crane.by = cry + 50;
  for (let k = 0, n = ri(4, 7); k < n; k++) {
    const c = ob('crate', clearing.x + clearing.w - r(70, 220), clearing.y + r(40, clearing.h - 80), 44, 30, { cube: true, color: pick(CAR_COLORS) });
    if (free(c, 14)) obstacles.push(c);
  }
  decor.push({ type: 'paint', x: crx + 90, y: cry + 132, text: 'CRUSHER · KEEP CLEAR', size: 14, a: 0 });
  decor.push({ type: 'oil', x: crx + 40, y: cry + 150, s: 1.8, a: 0.4 }, { type: 'oil', x: crane.x + 80, y: crane.y - 40, s: 1.3, a: 2 });
  for (const [fx, fy] of [[0.04, 0.06], [0.96, 0.94]]) lamps.push({ x: clearing.x + clearing.w * fx, y: clearing.y + clearing.h * fy, r: 280, k: 0.7, tower: true, broken: chance(0.2) });
  const bfx = clearing.x + clearing.w * 0.78;
  const bfy = clearing.y + clearing.h * 0.2;
  const fb = ob('barrel', bfx - 12, bfy - 12, 24, 24, { fire: true });
  if (free(fb, 24)) {
    obstacles.push(fb);
    fires.push({ x: bfx, y: bfy, barrel: true });
  }

  // --- The back lot: the old garage (the goal), a dog run, drums ------------------------------------
  const back = { x: YARD_X1 + 96, y: 0, w: W - YARD_X1 - 96, h: H };
  blocks.push({ ...back, inner: { ...back }, type: 'end', i: 2, j: 0 });
  paving.push({ x: back.x, y: back.y, w: back.w, h: back.h, style: 'gravel' });
  const backRoad = { dir: 'v', x: YARD_X1, y: 0, w: 96, h: H, wide: false };
  lanes.push(backRoad);
  const ex = snap(back.x + 20);
  const ey = snap(170);
  const endRoom = safeRoom(obstacles, pickups, ex, ey, 'left', true);
  obstacles.push(ob('building', ex + SAFE_W + 14, ey - 30, Math.min(300, W - (ex + SAFE_W + 14) - 60), 250, { ware: true, color: pick(ROOFS), vents: 1, seed: ri(0, 1e6) }));
  // Drums, a fenced run, more hulks down the east side.
  for (let y = ey + SAFE_H + 180; y < H - 200; y += r(190, 280)) {
    const t = rnd();
    const o = t < 0.35 ? ob('tires', snap(back.x + r(60, back.w - 220)), snap(y), 128, 96, { seed: ri(0, 1e6) })
      : t < 0.7 ? ob('scrap', snap(back.x + r(60, back.w - 240)), snap(y), 160, 128, { seed: ri(0, 1e6) })
        : ob('car', back.x + r(60, back.w - 260), y, 160, 52, { bus: true, color: '#8a8f96', front: 1, hulk: true });
    if (free(o, 70)) obstacles.push(o);
  }
  for (let k = 0; k < 5; k++) {
    const b = ob('barrel', back.x + 40 + k * 30, H - 150 + (k % 2) * 28, 24, 24);
    if (free(b, 2)) obstacles.push(b);
  }
  decor.push({ type: 'paint', x: back.x + back.w / 2, y: H - 60, text: 'RIVER ROAD GATE', size: 15, a: 0 });

  // --- Light: a few poles on the yard road and the wide lanes, most of them dead ---------------------
  for (const l of lanes) {
    if (!l.wide && l !== backRoad) continue;
    const len = l.dir === 'v' ? l.h : l.w;
    for (let p = 220, side = 0; p < len - 120; p += 520, side ^= 1) {
      const x = l.dir === 'v' ? (side ? l.x + 10 : l.x + l.w - 10) : l.x + p;
      const y = l.dir === 'v' ? l.y + p : side ? l.y + 10 : l.y + l.h - 10;
      if (rectsOverlap({ x: x - 10, y: y - 10, w: 20, h: 20 }, clearing, 40) || !free({ x: x - 8, y: y - 8, w: 16, h: 16 }, 6)) continue;
      lamps.push({ x, y, r: 190, k: 0.62, broken: chance(0.45) });
    }
  }

  // --- Wrecks left in the lanes (never across one), a few with their alarms still wired -------------
  for (const l of lanes) {
    const len = l.dir === 'v' ? l.h : l.w;
    for (let k = 0, n = ri(0, 2); k < n; k++) {
      const wd = l.dir === 'v' ? l.w : l.h;
      if (wd < 120) continue;
      const p = r(200, len - 300);
      const rect = l.dir === 'v' ? { x: l.x + (chance(0.5) ? 6 : wd - 50), y: l.y + p, w: 44, h: 86 } : { x: l.x + p, y: l.y + (chance(0.5) ? 6 : wd - 50), w: 86, h: 44 };
      if (!free(rect, 26) || rectsOverlap(rect, clearing, 30)) continue;
      if ([startRoom, endRoom].some((room) => rectsOverlap(doorApron(room, 220), rect))) continue;
      // Not where two lanes cross (it would pinch both).
      if (lanes.some((q) => q !== l && q.dir !== l.dir && rectsOverlap(q, rect, 30))) continue;
      const c = ob('car', rect.x, rect.y, rect.w, rect.h, { color: pick(CAR_COLORS), vertical: l.dir === 'v', front: chance(0.5) ? 1 : -1, hulk: chance(0.5) });
      obstacles.push(c);
      groundCars.push(c);
    }
  }
  let alarms = 0;
  for (const c of shuffle(groundCars.slice(), rnd)) {
    if (alarms >= 3) break;
    if (Math.hypot(c.x - start.x, c.y - start.y) < 900) continue;
    c.alarm = true;
    c.hulk = false;
    c.color = '#b8b8b2';
    alarms++;
  }
  // Two more fires out in the yard: something is always smouldering here.
  for (const c of shuffle(groundCars.slice(), rnd)) {
    if (fires.length >= 3) break;
    if (c.alarm || Math.hypot(c.x - start.x, c.y - start.y) < 800) continue;
    if (fires.some((f) => Math.hypot(f.x - c.x, f.y - c.y) < 1000)) continue;
    c.wreck = true;
    c.color = '#2a2420';
    fires.push({ x: c.x + c.w / 2, y: c.y + c.h / 2 });
  }

  // --- Medkits, clutter, the border -------------------------------------------------------------------
  scatterKits(D, obstacles, pickups, W, H, start, 10);
  for (let k = 0; k < 230; k++) {
    const x = r(0, W);
    const y = r(0, H);
    if (!free({ x: x - 10, y: y - 10, w: 20, h: 20 })) continue;
    const t = rnd();
    decor.push({ type: t < 0.28 ? 'puddle' : t < 0.5 ? 'oil' : t < 0.68 ? 'loosetire' : t < 0.82 ? 'hubcap' : t < 0.93 ? 'trash' : 'crack', x, y, s: r(0.7, 1.4), a: r(0, Math.PI) });
  }
  border(obstacles, W, H);

  return {
    seed,
    theme: 'junkyard',
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
    // Junkyard-only layout, for rendering.
    paving,
    lanes,
    clearing,
    crane,
    stacks: stacks.length,
  };
}
