// Suburbia: a Delco subdivision, 2020. A seeded grid of quiet streets, each
// block two rows of house lots back to back:
//
//   sidewalk | front lawn, driveway | the house | fenced backyard || backyard | house | lawn | sidewalk
//
// Some blocks have a service alley between the rows (garages on it) instead
// of a shared back fence; one is a park with a ballfield, one a strip mall
// with its parking lot, one the elementary school. You start in a boarded-up
// garage in the south-west and head for the safe room in the north-east.
//
// Streets are always open, so the route connects. Backyards are a way through
// the blocks: every one opens beside its house, and many fences have a gate.
// Lot lines sit on nav-cell boundaries so the fences never smear over a path.

import { rectsOverlap, shuffle, clamp } from '../util.js';
import { ob, dice, safeRoom, SAFE_W, SAFE_H, doorApron, border, freeOf, scatterKits, CELL } from './gen-kit.js';

export const SUB_W = 5632; // 176 nav cells
export const SUB_H = 3456; // 108
const NX = 5;
const NY = 3;
const ROAD = 5; // cells
const SW = 20; // sidewalk
const FT = 6; // fence thickness

const ROOFS = ['#3d3a38', '#4a3f38', '#37404a', '#45423c', '#3a4640', '#4d4038', '#33363b'];
const SIDING = ['#d9d4c7', '#b9c4cc', '#c9b99a', '#a8b59c', '#8c4a3c', '#9b9a94', '#c7a98a', '#7f8c99', '#d6c9a0', '#93503f'];
const CAR_COLORS = ['#6d2e2e', '#2e4a6d', '#6b6b6b', '#3f5f3a', '#8a7b52', '#4a3a5c', '#2f2f2f', '#7a4a22', '#9a9a94', '#b9b6aa'];
export const SHOPS = ['HOAGIES', 'STATE STORE', 'BEER DISTRIBUTOR', 'PIZZA', 'NAILS', 'WATER ICE', 'LAUNDROMAT', 'PRETZELS', 'VIDEO'];
/** Sidewalk and driveway chalk: what the kids wrote that spring. */
export const CHALK_LINES = ['STAY HOME', 'WE MISS YOU', 'THANK YOU', 'BE KIND', '6 FT', 'HI GRANDMA', 'CLASS OF 2020', 'HONK 4 GRADS'];

function splitCells(total, n, gap, rnd) {
  const avail = total - (n - 1) * gap;
  const weights = Array.from({ length: n }, () => 0.9 + rnd() * 0.2);
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = [];
  let pos = 0;
  for (let i = 0; i < n; i++) {
    const w = i === n - 1 ? total - pos : Math.round((avail * weights[i]) / sum);
    out.push([pos * CELL, (pos + w) * CELL]);
    pos += w + gap;
  }
  return out;
}
const snap = (v) => Math.round(v / CELL) * CELL;

export function generateSuburbia(seed) {
  const D = dice((seed ^ 0x5b0b5) >>> 0);
  const { rnd, r, ri, chance, pick } = D;
  const W = SUB_W;
  const H = SUB_H;

  const obstacles = [];
  const blocks = [];
  const streets = [];
  const lamps = [];
  const pickups = [];
  const decor = [];
  const fires = [];
  const glows = [];
  const paving = []; // { x, y, w, h, style }: drive, walk, patio, deck, alley, lot, mulch, court
  const lots = []; // every house lot: { x, y, w, h, tint }
  const pools = [];
  const fields = []; // ballfields: { x, y, s } (home plate, size)
  const markings = { dashes: [], crosswalks: [], parking: [] };
  const free = freeOf(obstacles);

  // --- Streets ------------------------------------------------------------------------------
  const xs = splitCells(W / CELL, NX, ROAD, rnd);
  const ys = splitCells(H / CELL, NY, ROAD, rnd);
  for (let i = 0; i < NX - 1; i++) streets.push({ dir: 'v', x: xs[i][1], y: 0, w: xs[i + 1][0] - xs[i][1], h: H });
  for (let j = 0; j < NY - 1; j++) streets.push({ dir: 'h', x: 0, y: ys[j][1], w: W, h: ys[j + 1][0] - ys[j][1], main: j === 0 });
  const intersections = [];
  for (const sv of streets.filter((s) => s.dir === 'v')) for (const sh of streets.filter((s) => s.dir === 'h')) intersections.push({ x: sv.x, y: sh.y, w: sv.w, h: sh.h });
  const inIntersection = (rect, pad) => intersections.some((it) => rectsOverlap(it, rect, pad));
  // The pike (the one wide road) gets a centre line; the side streets don't.
  for (const s of streets) if (s.main) markings.dashes.push({ x0: s.x, y0: s.y + s.h / 2, x1: s.x + s.w, y1: s.y + s.h / 2 });
  for (const it of intersections) {
    markings.crosswalks.push({ x: it.x, y: it.y - 4, w: it.w, h: 22, dir: 'h' }, { x: it.x, y: it.y + it.h - 18, w: it.w, h: 22, dir: 'h' });
    markings.crosswalks.push({ x: it.x - 4, y: it.y, w: 22, h: it.h, dir: 'v' }, { x: it.x + it.w - 18, y: it.y, w: 22, h: it.h, dir: 'v' });
  }

  // --- Blocks -------------------------------------------------------------------------------
  const special = shuffle([[1, 0], [2, 0], [3, 0], [1, 1], [2, 1], [3, 1], [0, 1], [4, 1], [1, 2], [2, 2], [3, 2]], rnd);
  const typeAt = new Map();
  for (const [k, t] of ['park', 'mall', 'school'].entries()) typeAt.set(special[k].join(), t);
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NY; j++) {
      const b = { x: xs[i][0], y: ys[j][0], w: xs[i][1] - xs[i][0], h: ys[j][1] - ys[j][0] };
      let type = typeAt.get(`${i},${j}`) || (chance(0.3) ? 'alley' : 'houses');
      if (i === 0 && j === NY - 1) type = 'start';
      if (i === NX - 1 && j === 0) type = 'end';
      // Sidewalks only where a street runs past (edge blocks reach the map's border).
      const l = i > 0 ? SW : 0;
      const rr = i < NX - 1 ? SW : 0;
      const t = j > 0 ? SW : 0;
      const bb = j < NY - 1 ? SW : 0;
      blocks.push({ ...b, inner: { x: b.x + l, y: b.y + t, w: b.w - l - rr, h: b.h - t - bb }, type, i, j });
    }
  }

  // --- A house lot ------------------------------------------------------------------------------
  const houses = [];
  const driveCars = [];
  /** A fence run from a to b along one axis, with a gate left open if `gate`. */
  function fenceRun(horiz, fixed, a, b, style, gate) {
    const len = b - a;
    if (len < 40) return;
    if (gate && len > 190) {
      const g0 = snap(a + r(50, len - 146));
      const seg = (p, q) => {
        if (q - p > 14) obstacles.push(horiz ? ob('fence', p, fixed, q - p, FT, { style }) : ob('fence', fixed, p, FT, q - p, { style }));
      };
      seg(a, g0);
      seg(g0 + 96, b);
    } else obstacles.push(horiz ? ob('fence', a, fixed, len, FT, { style }) : ob('fence', fixed, a, FT, len, { style }));
  }

  /**
   * One lot: L (cell-aligned), the street to its north ('n') or south ('s').
   * opts.rear: the lot ends on an alley (a garage there, no shared fence).
   * opts.edgeW / edgeE: that side is a street (a corner lot).
   */
  function lot(L, facing, opts = {}) {
    const north = facing === 'n';
    const tint = ri(0, 3);
    lots.push({ x: L.x, y: L.y, w: L.w, h: L.h, tint });
    const style = chance(0.3) ? 'picket' : 'wood';
    const setback = SW + ri(72, 92);
    const hd = ri(108, 128);
    const sm = 34; // the narrow side
    const dp = 100; // the driveway side: wide enough to walk past a parked car
    const hw = clamp(L.w - sm - dp, 130, 196);
    const driveW = chance(0.5);
    const hx = driveW ? L.x + L.w - sm - hw : L.x + sm;
    const hy = north ? L.y + setback : L.y + L.h - setback - hd;
    const two = chance(0.42);
    const h = ob('building', hx, hy, hw, hd, {
      house: true, pitched: true, facing, storeys: two ? 2 : 1, color: pick(ROOFS), siding: pick(SIDING), seed: ri(0, 1e6), vents: 0, nocarve: true,
      twin: hw >= 176 && chance(0.4), boarded: chance(0.14), chimney: chance(0.6),
    });
    obstacles.push(h);
    houses.push(h);
    const frontY = north ? hy : hy + hd; // the wall with the front door
    const rearY = north ? hy + hd : hy;
    const curb = north ? L.y : L.y + L.h;
    const dir = north ? 1 : -1; // from the street into the lot
    const doorX = hx + hw * (h.twin ? 0.27 : 0.5);

    // The driveway, from the curb down the side of the house.
    const dx = driveW ? L.x + 14 : L.x + L.w - 14 - 68;
    const dEnd = opts.rear ? rearY + dir * 30 : rearY + dir * ri(30, 60);
    const drive = { x: dx, y: Math.min(curb, dEnd), w: 68, h: Math.abs(dEnd - curb), style: chance(0.5) ? 'drive' : 'asphalt' };
    paving.push(drive);
    // A walk from the door to the pavement (and one to the driveway).
    paving.push({ x: doorX - 8, y: Math.min(curb, frontY), w: 16, h: Math.abs(frontY - curb), style: 'walk' });
    if (chance(0.55)) {
      // A car, up against the lot line so there's room to walk by.
      const cx = driveW ? dx + 2 : dx + 68 - 46;
      const cy = north ? L.y + SW + 8 : L.y + L.h - SW - 8 - 86;
      const car = ob('car', cx, cy, 44, 86, { color: pick(CAR_COLORS), vertical: true, front: north ? -1 : 1 });
      if (free(car, 4)) {
        obstacles.push(car);
        driveCars.push(car);
      }
    }
    // A garage at the head of the driveway (on the alley, if there is one).
    if (opts.rear || chance(0.5)) {
      const gw = 76;
      const gd = 72;
      const gx = driveW ? L.x + 10 : L.x + L.w - 10 - gw;
      const gy = opts.rear ? (north ? L.y + L.h - gd - 6 : L.y + 6) : north ? dEnd + 6 : dEnd - 6 - gd;
      const g = ob('building', gx, gy, gw, gd, { garage: true, pitched: true, facing: opts.rear ? (north ? 's' : 'n') : facing, color: h.color, siding: h.siding, seed: h.seed + 3, vents: 0, nocarve: true });
      if (free(g, 20) && gy > L.y + 4 && gy + gd < L.y + L.h - 4) obstacles.push(g);
    }
    // Porch light, mailbox, the bins, a tree out front.
    if (chance(0.42)) lamps.push({ x: doorX + 14, y: frontY - dir * 10, r: 118, k: 0.5, style: 'porch', broken: chance(0.22), wall: north ? -1 : 1 });
    decor.push({ type: 'mailbox', x: driveW ? dx + 84 : dx - 16, y: curb + dir * (SW + 6) });
    if (chance(0.7)) decor.push({ type: 'bins', x: driveW ? hx - 12 : hx + hw + 12, y: rearY - dir * 26, n: ri(1, 3) });
    if (chance(0.4)) {
      const t = ob('tree', (driveW ? hx + hw * 0.6 : hx + hw * 0.2) - 18 + r(-16, 16), north ? L.y + SW + 14 : L.y + L.h - SW - 14 - 36, 36, 36, { seed: ri(0, 1e6) });
      if (free(t, 22)) obstacles.push(t);
    }
    for (let k = 0, n = ri(1, 3); k < n; k++) decor.push({ type: 'bush', x: hx + 18 + k * ((hw - 36) / Math.max(1, n - 1 || 1)) * (n > 1 ? 1 : 0.5), y: frontY - dir * 9, s: r(0.8, 1.2) });
    // That spring's yard signs and chalk.
    const roll = rnd();
    if (roll < 0.1) decor.push({ type: 'yardsign', x: doorX + (driveW ? 46 : -46), y: curb + dir * (SW + 26), c: 0, text: 'CLASS OF 2020' });
    else if (roll < 0.17) decor.push({ type: 'yardsign', x: doorX + (driveW ? 46 : -46), y: curb + dir * (SW + 26), c: 1, text: 'FOR SALE' });
    else if (roll < 0.24) decor.push({ type: 'yardsign', x: doorX + (driveW ? 46 : -46), y: curb + dir * (SW + 26), c: 2, text: 'HEROES WORK HERE' });
    else if (roll < 0.28) decor.push({ type: 'flamingo', x: doorX + (driveW ? 40 : -40), y: frontY - dir * 30 });
    if (chance(0.16)) decor.push({ type: 'chalkart', x: drive.x + 34, y: curb + dir * (SW + 120), art: pick(['hopscotch', 'rainbow', 'sun', 'hearts']), a: north ? 0 : Math.PI });
    else if (chance(0.12)) decor.push({ type: 'chalkart', x: doorX, y: curb + dir * 10, art: 'words', text: pick(CHALK_LINES), a: 0 });
    if (chance(0.1)) decor.push({ type: 'bike', x: doorX + r(-30, 30), y: frontY - dir * r(30, 50), a: r(0, 3) });

    // The backyard: fenced along the lot lines from the back of the house, with a gate now and then.
    const y0 = north ? rearY : L.y;
    const y1 = north ? L.y + L.h : rearY;
    const back = { x: L.x, y: y0, w: L.w, h: y1 - y0 };
    const wx = L.x + (opts.edgeW ? SW : 0);
    fenceRun(false, wx, y0 + (driveW ? (north ? 70 : 0) : 0), y1 - (driveW ? (north ? 0 : 70) : 0), opts.edgeW ? 'wood' : style, opts.edgeW ? chance(0.3) : chance(0.5));
    if (opts.edgeE) fenceRun(false, L.x + L.w - SW - FT, y0, y1, 'wood', chance(0.3));
    // Things in it.
    const inner = { x: back.x + 26, y: back.y + 30, w: back.w - 52, h: back.h - 60 };
    const things = shuffle(['pool', 'shed', 'trampoline', 'swing', 'patio', 'beds', 'tree', 'tree', 'doghouse', 'none'], rnd).slice(0, ri(2, 3));
    for (const t of things) {
      if (inner.w < 120 || inner.h < 120) break;
      if (t === 'pool') {
        const pw = snap(r(112, 150));
        const ph = snap(r(70, 100));
        const p = { x: snap(inner.x + r(20, Math.max(21, inner.w - pw - 20))), y: snap(inner.y + r(30, Math.max(31, inner.h - ph - 30))), w: pw, h: ph };
        if (!free(p, 40) || p.x + pw > inner.x + inner.w || p.y + ph > inner.y + inner.h) continue;
        obstacles.push(ob('pool', p.x, p.y, p.w, p.h));
        pools.push({ ...p, green: chance(0.5) });
        paving.push({ x: p.x - 14, y: p.y - 14, w: p.w + 28, h: p.h + 28, style: 'deck' });
      } else if (t === 'shed') {
        const s = ob('building', inner.x + (chance(0.5) ? 4 : inner.w - 70), north ? inner.y + inner.h - 62 : inner.y + 4, 66, 58, { shed: true, pitched: true, color: pick(ROOFS), siding: pick(['#7b5a3c', '#6f7a66', '#8c8a84']), seed: ri(0, 1e6), vents: 0, nocarve: true, facing: north ? 'n' : 's' });
        if (free(s, 26)) obstacles.push(s);
      } else if (t === 'trampoline') {
        const o = ob('playset', inner.x + r(20, inner.w - 80), inner.y + r(20, inner.h - 80), 58, 58, { play: 'trampoline' });
        if (free(o, 30)) obstacles.push(o);
      } else if (t === 'swing') {
        const o = ob('playset', inner.x + r(20, inner.w - 100), inner.y + r(20, inner.h - 60), 78, 34, { play: 'swing' });
        if (free(o, 30)) obstacles.push(o);
      } else if (t === 'patio') {
        const px = clamp(hx + hw / 2 - 50, inner.x, inner.x + inner.w - 100);
        const py = north ? rearY + 8 : rearY - 8 - 70;
        const pt = { x: px, y: py, w: 100, h: 70 };
        if (!free(pt, 6)) continue;
        paving.push({ ...pt, style: 'patio' });
        const tb = ob('table', px + 30, py + 16, 40, 40, { color: '#6a5a44' });
        if (free(tb, 16)) obstacles.push(tb);
        decor.push({ type: 'grill', x: px + 86, y: py + 34 });
      } else if (t === 'beds') {
        decor.push({ type: 'vegbeds', x: inner.x + r(40, inner.w - 60), y: north ? inner.y + inner.h - 30 : inner.y + 30, n: ri(2, 3) });
      } else if (t === 'tree') {
        const s = ri(34, 42);
        const o = ob('tree', inner.x + r(10, inner.w - s - 10), inner.y + r(10, inner.h - s - 10), s, s, { seed: ri(0, 1e6) });
        if (free(o, 34)) obstacles.push(o);
      } else if (t === 'doghouse') decor.push({ type: 'doghouse', x: inner.x + r(30, inner.w - 30), y: inner.y + r(30, inner.h - 30) });
    }
    return h;
  }

  /** Two rows of lots, back to back (or with an alley between them). keep(rect): skip a lot that overlaps. */
  function residential(b, alley, keepClear = []) {
    const n = Math.max(2, Math.round(b.w / 320));
    const cuts = Array.from({ length: n + 1 }, (_, k) => (k === 0 ? b.x : k === n ? b.x + b.w : snap(b.x + (b.w * k) / n)));
    const ah = alley ? CELL * 4 : 0;
    const depth = snap((b.h - ah) / 2);
    const rows = [{ y: b.y, h: depth, facing: 'n', edge: b.j === 0 }, { y: b.y + b.h - depth, h: depth, facing: 's', edge: b.j === NY - 1 }];
    const midY = b.y + depth;
    for (const row of rows) {
      for (let k = 0; k < n; k++) {
        const L = { x: cuts[k], y: row.y, w: cuts[k + 1] - cuts[k], h: row.h };
        if (keepClear.some((q) => rectsOverlap(q, L))) continue;
        // (A row on the map's edge has no street in front of it: it faces the other way, onto its backyard.)
        lot(L, row.facing, { rear: alley, edgeW: k === 0 && b.i > 0, edgeE: k === n - 1 && b.i < NX - 1 });
      }
    }
    if (alley) {
      const a = { x: b.x, y: midY, w: b.w, h: b.y + b.h - depth - midY, style: 'alley' };
      paving.push(a);
      // Back fences with a gate each, a dumpster, the odd parked wreck.
      for (const row of rows) {
        const fy = row.facing === 'n' ? midY - FT : a.y + a.h;
        for (let k = 0; k < n; k++) {
          const x0 = cuts[k] + (k === 0 && b.i > 0 ? SW : 0);
          const x1 = cuts[k + 1] - (k === n - 1 && b.i < NX - 1 ? SW : 0);
          if (keepClear.some((q) => rectsOverlap(q, { x: x0, y: fy - 40, w: x1 - x0, h: 80 }))) continue;
          // Leave the garage's mouth and a gate open.
          const segs = obstacles.filter((o) => o.garage && o.x >= x0 - 2 && o.x + o.w <= x1 + 2 && Math.abs((row.facing === 'n' ? o.y + o.h : o.y) - (row.facing === 'n' ? midY : a.y + a.h)) < 14);
          let cur = x0;
          for (const g of segs.sort((p, q) => p.x - q.x)) {
            fenceRun(true, fy, cur, g.x - 4, 'wood', false);
            cur = g.x + g.w + 4;
          }
          fenceRun(true, fy, cur, x1, 'wood', true);
        }
      }
      const dmp = ob('dumpster', a.x + r(120, a.w - 200), a.y + 8, 62, 34, { color: chance(0.5) ? '#2f4f3a' : '#3a3f5a' });
      if (free(dmp, 10)) obstacles.push(dmp);
      lamps.push({ x: a.x + a.w / 2, y: a.y + 6, broken: chance(0.4) });
    } else {
      // The shared back fence, a gate in about half the lots.
      for (let k = 0; k < n; k++) {
        const x0 = cuts[k] + (k === 0 && b.i > 0 ? SW : 0);
        const x1 = cuts[k + 1] - (k === n - 1 && b.i < NX - 1 ? SW : 0);
        if (keepClear.some((q) => rectsOverlap(q, { x: x0, y: midY - 40, w: x1 - x0, h: 80 }))) continue;
        fenceRun(true, midY - FT / 2, x0, x1, 'wood', chance(0.5));
      }
    }
  }

  function park(b) {
    const inn = { x: b.inner.x + 10, y: b.inner.y + 10, w: b.inner.w - 20, h: b.inner.h - 20 };
    // The playground: mulch, a climber, swings, a slide.
    const pg = { x: snap(inn.x + 40), y: snap(inn.y + 50), w: 320, h: 256, style: 'mulch' };
    paving.push(pg);
    for (const [fx, fy, w, h, play] of [[0.12, 0.14, 78, 34, 'swing'], [0.5, 0.42, 84, 62, 'climber'], [0.14, 0.66, 58, 58, 'merry'], [0.62, 0.1, 78, 34, 'swing']]) {
      obstacles.push(ob('playset', pg.x + pg.w * fx, pg.y + pg.h * fy, w, h, { play }));
    }
    for (const [fx, fy] of [[1.08, 0.3], [1.08, 0.7]]) obstacles.push(ob('bench', pg.x + pg.w * fx, pg.y + pg.h * fy - 26, 16, 52));
    // The ballfield in the far corner: home plate, the infield, a backstop.
    const s = Math.min(360, inn.w - 420, inn.h - 120);
    if (s > 200) {
      const hx = inn.x + inn.w - 70;
      const hy = inn.y + inn.h - 70;
      fields.push({ x: hx, y: hy, s });
      obstacles.push(ob('fence', hx + 26, hy - 90, FT, 120, { style: 'chain' }));
      obstacles.push(ob('fence', hx - 90, hy + 26, 120, FT, { style: 'chain' }));
      obstacles.push(ob('bench', hx - 210, hy + 30, 52, 16), ob('bench', hx + 30, hy - 210, 16, 52));
    }
    for (let k = 0, n = ri(8, 12); k < n; k++) {
      const sz = ri(34, 44);
      const t = ob('tree', inn.x + r(10, inn.w - sz - 10), inn.y + r(10, inn.h - sz - 10), sz, sz, { seed: ri(0, 1e6) });
      if (free(t, 44) && !rectsOverlap(t, pg, 30) && !fields.some((f) => t.x > f.x - f.s - 30 && t.y > f.y - f.s - 30)) obstacles.push(t);
    }
    decor.push({ type: 'paint', x: b.x + b.w / 2, y: b.y + SW + 22, text: 'PLAYGROUND CLOSED', size: 15, a: 0 });
    lamps.push({ x: pg.x + pg.w + 30, y: pg.y + pg.h / 2, broken: chance(0.3) });
  }

  function mall(b) {
    // The strip: one long building, shop fronts to the south, the lot in front of it.
    const inn = b.inner;
    const depth = 196;
    const sx = snap(inn.x + 30);
    const sw = snap(inn.w - 60);
    const sy = inn.y + 20;
    const shops = shuffle(SHOPS.slice(), rnd).slice(0, Math.max(3, Math.floor(sw / 150)));
    obstacles.push(ob('building', sx, sy, sw, depth, { mall: true, color: '#45474b', vents: 4, seed: ri(0, 1e6), shops }));
    paving.push({ x: sx, y: sy + depth, w: sw, h: 30, style: 'walk' });
    const uw = sw / shops.length;
    shops.forEach((name, k) => decor.push({ type: 'paint', x: sx + uw * (k + 0.5), y: sy + depth + 15, text: name, size: 12, a: 0 }));
    const lot0 = { x: inn.x + 10, y: sy + depth + 30, w: inn.w - 20, h: inn.y + inn.h - (sy + depth + 30) - 10, style: 'lot' };
    paving.push(lot0);
    // Rows of stalls, some cars, the carts nobody returned.
    const slotW = 56;
    const carH = 86;
    for (let y = lot0.y + 50; y + carH * 2 <= lot0.y + lot0.h - 40; y += carH * 2 + 110) {
      for (let row = 0; row < 2; row++) {
        const ry = y + row * carH;
        for (let x = lot0.x + 40; x + slotW <= lot0.x + lot0.w - 40; x += slotW) {
          markings.parking.push({ x, y: ry, w: slotW, h: carH });
          if (chance(0.28)) {
            const c = ob('car', x + 6, ry + 4, 44, carH - 8, { color: pick(CAR_COLORS), vertical: true, front: row === 0 ? 1 : -1 });
            obstacles.push(c);
            driveCars.push(c);
          } else if (chance(0.08)) decor.push({ type: 'cart', x: x + 28, y: ry + 40, a: r(0, 3) });
        }
      }
    }
    decor.push({ type: 'paint', x: lot0.x + lot0.w * 0.3, y: lot0.y + 24, text: 'CURBSIDE PICKUP', size: 14, a: 0 });
    decor.push({ type: 'paint', x: lot0.x + lot0.w * 0.72, y: lot0.y + 24, text: 'MASKS REQUIRED', size: 14, a: 0 });
    for (const fx of [0.25, 0.75]) lamps.push({ x: lot0.x + lot0.w * fx, y: lot0.y + lot0.h * 0.5, r: 230, k: 0.64, tower: true, broken: chance(0.25) });
  }

  function school(b) {
    const inn = b.inner;
    const bw = snap(Math.min(460, inn.w - 300));
    const bx = snap(inn.x + 60);
    const by = snap(inn.y + 70);
    obstacles.push(ob('building', bx, by, bw, 220, { school: true, color: '#4b4038', vents: 3, seed: ri(0, 1e6) }));
    obstacles.push(ob('building', bx, by + 220, 180, 190, { school: true, color: '#4b4038', vents: 2, seed: ri(0, 1e6), nocarve: true }));
    decor.push({ type: 'flagpole', x: bx + bw + 40, y: by + 250 });
    decor.push({ type: 'paint', x: bx + bw / 2 + 90, y: by + 250, text: 'ELM ST ELEMENTARY', size: 17, a: 0 });
    decor.push({ type: 'paint', x: bx + bw / 2 + 90, y: by + 272, text: 'REMOTE LEARNING UNTIL FURTHER NOTICE', size: 10, a: 0 });
    // The bus loop, three buses that never left.
    const loop = { x: bx + 200, y: by + 300, w: inn.x + inn.w - (bx + 200) - 30, h: 150, style: 'lot' };
    paving.push(loop);
    for (let k = 0; k < 3; k++) {
      const bus = ob('car', loop.x + 30 + k * 190, loop.y + 40 + (k % 2) * 46, 160, 52, { bus: true, color: '#d9a21c', front: 1 });
      if (bus.x + bus.w < loop.x + loop.w - 10 && free(bus, 10)) obstacles.push(bus);
    }
    // The yard: a court and the climbing frames.
    const court = { x: snap(bx + bw + 70), y: by, w: Math.min(260, inn.x + inn.w - (bx + bw + 70) - 20), h: 200, style: 'court' };
    if (court.w > 160) paving.push(court);
    const pg = { x: bx, y: by + 470, w: Math.min(360, inn.w - 100), h: Math.min(230, inn.y + inn.h - (by + 470) - 30), style: 'mulch' };
    if (pg.h > 140) {
      paving.push(pg);
      obstacles.push(ob('playset', pg.x + 40, pg.y + 30, 84, 62, { play: 'climber' }), ob('playset', pg.x + 190, pg.y + 40, 78, 34, { play: 'swing' }));
    }
    for (const [fx, fy] of [[0.86, 0.86], [0.7, 0.92], [0.94, 0.6]]) {
      const t = ob('tree', inn.x + inn.w * fx - 20, inn.y + inn.h * fy - 20, 40, 40, { seed: ri(0, 1e6) });
      if (free(t, 30)) obstacles.push(t);
    }
    lamps.push({ x: loop.x + loop.w / 2, y: loop.y - 10, broken: chance(0.25) });
  }

  // --- Fill the blocks ---------------------------------------------------------------------------
  let startRoom = null;
  let endRoom = null;
  let start = null;
  for (const b of blocks) {
    if (b.type === 'start') {
      // A garage somebody turned into a bunker, on the east side of the block: its door opens on the street.
      const x = b.x + b.w - SW - SAFE_W;
      const y = snap(b.y + b.h * 0.5 - SAFE_H / 2);
      startRoom = safeRoom(obstacles, pickups, x, y, 'right', false);
      start = { x: startRoom.interior.x + startRoom.interior.w / 2, y: startRoom.interior.y + startRoom.interior.h / 2 + 10 };
      paving.push({ x: x - 30, y: y - 30, w: SAFE_W + 30 + SW, h: SAFE_H + 60, style: 'drive' });
      residential(b, false, [{ x: x - 60, y: y - 60, w: SAFE_W + 120, h: SAFE_H + 120 }]);
    } else if (b.type === 'end') {
      const x = b.x + SW;
      const y = snap(b.y + b.h * 0.5 - SAFE_H / 2);
      endRoom = safeRoom(obstacles, pickups, x, y, 'left', true);
      paving.push({ x: b.x, y: y - 30, w: SAFE_W + 30 + SW, h: SAFE_H + 60, style: 'drive' });
      residential(b, false, [{ x: x - 60, y: y - 60, w: SAFE_W + 120, h: SAFE_H + 120 }]);
    } else if (b.type === 'park') park(b);
    else if (b.type === 'mall') mall(b);
    else if (b.type === 'school') school(b);
    else residential(b, b.type === 'alley');
  }

  // --- The streets: parked cars, a school bus, the ice-cream truck, lamps ----------------------------
  const keepOut = [startRoom, endRoom].map((room) => doorApron(room, 180));
  const streetCars = [];
  for (const s of streets) {
    const along = s.dir === 'v' ? ys : xs;
    for (const seg of along) {
      const segLen = seg[1] - seg[0];
      for (let k = 0, n = ri(0, 2); k < n; k++) {
        const lanePick = rnd();
        const wd = s.dir === 'v' ? s.w : s.h;
        const off = lanePick < 0.45 ? 28 : lanePick < 0.9 ? wd - 28 : wd / 2;
        const p = seg[0] + r(60, segLen - 160);
        const rect = s.dir === 'v' ? { x: s.x + off - 22, y: p, w: 44, h: 86 } : { x: p, y: s.y + off - 22, w: 86, h: 44 };
        const across = s.dir === 'v' ? { x: s.x, y: rect.y - 40, w: s.w, h: rect.h + 80 } : { x: rect.x - 40, y: s.y, w: rect.w + 80, h: s.h };
        if (streetCars.some((c) => rectsOverlap(c, across)) || inIntersection(rect, 30) || !free(rect, 20) || keepOut.some((q) => rectsOverlap(q, rect))) continue;
        const car = ob('car', rect.x, rect.y, rect.w, rect.h, { color: pick(CAR_COLORS), vertical: s.dir === 'v', front: chance(0.5) ? 1 : -1 });
        obstacles.push(car);
        streetCars.push(car);
      }
    }
  }
  // The ice-cream truck, still playing its tune if you shoot it (an alarm), and a bus across a lane.
  const hStreets = streets.filter((s) => s.dir === 'h');
  for (const [kind, s] of [['ice', pick(hStreets)], ['bus', pick(hStreets)]]) {
    for (let tries = 0; tries < 30; tries++) {
      const w = kind === 'bus' ? 160 : 112;
      const rect = { x: r(600, W - 800), y: s.y + (chance(0.5) ? 20 : s.h - 72), w, h: 52 };
      const across = { x: rect.x - 60, y: s.y, w: rect.w + 120, h: s.h };
      if (streetCars.some((c) => rectsOverlap(c, across)) || inIntersection(rect, 40) || !free(rect, 20) || keepOut.some((q) => rectsOverlap(q, rect))) continue;
      const o = kind === 'bus'
        ? ob('car', rect.x, rect.y, rect.w, rect.h, { bus: true, color: '#d9a21c', front: chance(0.5) ? 1 : -1 })
        : ob('car', rect.x, rect.y, rect.w, rect.h, { truck: true, icecream: true, alarm: true, color: '#e9e2d6', front: chance(0.5) ? 1 : -1 });
      obstacles.push(o);
      streetCars.push(o);
      break;
    }
  }
  // Car alarms: a few in driveways and on the street, far from the start and from each other.
  const alarmed = obstacles.filter((o) => o.alarm);
  for (const c of shuffle([...streetCars, ...driveCars], rnd)) {
    if (alarmed.length >= 4) break;
    if (c.alarm || c.bus || Math.hypot(c.x - start.x, c.y - start.y) < 900) continue;
    if (alarmed.some((a) => Math.hypot(a.x - c.x, a.y - c.y) < 1100)) continue;
    c.alarm = true;
    c.color = '#b8b8b2';
    alarmed.push(c);
  }
  // One wreck still burning, somewhere along the way.
  for (const c of shuffle(streetCars.slice(), rnd)) {
    if (c.alarm || c.bus || c.truck || Math.hypot(c.x - start.x, c.y - start.y) < 800) continue;
    c.wreck = true;
    c.color = '#2a2420';
    fires.push({ x: c.x + c.w / 2, y: c.y + c.h / 2 });
    break;
  }
  // Street lamps: fewer than downtown, and a good share are out.
  for (const s of streets) {
    const len = s.dir === 'v' ? s.h : s.w;
    for (let p = 180, side = 0; p < len - 80; p += 400, side ^= 1) {
      const lamp = s.dir === 'v' ? { x: side ? s.x - 6 : s.x + s.w + 6, y: s.y + p } : { x: s.x + p, y: side ? s.y - 6 : s.y + s.h + 6 };
      if (inIntersection({ x: lamp.x - 1, y: lamp.y - 1, w: 2, h: 2 }, 40) || !free({ x: lamp.x - 6, y: lamp.y - 6, w: 12, h: 12 })) continue;
      if (chance(0.3)) lamp.broken = true;
      lamps.push(lamp);
    }
  }

  // --- Medkits, clutter, the border ----------------------------------------------------------------
  scatterKits(D, obstacles, pickups, W, H, start, 11);
  for (let k = 0; k < 150; k++) {
    const x = r(0, W);
    const y = r(0, H);
    if (!free({ x: x - 10, y: y - 10, w: 20, h: 20 })) continue;
    const onRoad = streets.some((s) => x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h);
    const t = rnd();
    if (onRoad) decor.push({ type: t < 0.35 ? 'puddle' : t < 0.6 ? 'crack' : t < 0.8 ? 'trash' : 'manhole', x, y, s: r(0.7, 1.5), a: r(0, Math.PI) });
    else decor.push({ type: t < 0.5 ? 'leaves' : t < 0.8 ? 'tuft' : 'trash', x, y, s: r(0.7, 1.4), a: r(0, Math.PI) });
  }
  border(obstacles, W, H);

  return {
    seed,
    theme: 'suburbia',
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
    // Suburbia-only layout, for rendering.
    paving,
    lots,
    pools,
    fields,
    houses: houses.length,
  };
}
