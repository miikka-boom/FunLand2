// The 3D models: one per obstacle kind, drawn with the shapes in prims.js.
//
// modelFor(o) gives an obstacle its height and its draw function (kept on the
// obstacle by scene3d.js). A model is called with the render context R:
//   R.ctx, R.v (the camera), R.dpr, R.t (time), R.game, R.L (the lights),
//   R.fX / R.fY   how bright the two visible walls are next to a top face
//   R.roofK       how bright roofs and wall tops stay (they never go black,
//                 so the layout reads in the dark, as it always did)
//   R.struct(b)   the brightness of a wall whose foot gets light b
//   R.ground(z) / R.face(...) / R.reset()   paint on a floor / on a wall / back to plain
// Structures (sight blockers) are lit along each wall from the light at its
// foot; props get one brightness for the whole thing.

import { box, boxTop, boxFaceY, boxHull, cylinder, disc, ball, limb, prism, turnedRect, tone, line3, quad3 } from './prims.js';
import { hash01, circle, FONT } from './draw-utils.js';
import { TAU, lampLit, clamp, pointInRect } from '../util.js';
import { drawContainerTop, drawWarehouseRidges } from './docks-render.js';
import { stripes } from './features-render.js';
import { drawCarScrawl, drawPosterArt } from './lore-render.js';
import { buildDecorProps } from './decor3d.js';

const pts = new Float64Array(16);
const samp = new Float32Array(12);

function strHash(s) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

const DARKS = Array.from({ length: 33 }, (_, i) => `rgba(0,0,0,${(i / 32).toFixed(3)})`);
/** A black veil that leaves brightness k (to shade art painted at full brightness). */
export const veil = (k) => DARKS[clamp(Math.round((1 - k) * 32), 0, 32)];

// --- Shared pieces -----------------------------------------------------------------------------

/**
 * How lit a prop is (it is nearly invisible out of sight): the light at its
 * middle and toward its four corners, averaged, so something half round a
 * corner is half lit instead of blinking in and out.
 */
export function propLight(R, o) {
  const L = R.L;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  if (o.w < 30 && o.h < 30) return L.lit(cx, cy);
  const ex = o.w * 0.36;
  const ey = o.h * 0.36;
  return (L.lit(cx, cy) * 2 + L.lit(cx - ex, cy - ey) + L.lit(cx + ex, cy - ey) + L.lit(cx - ex, cy + ey) + L.lit(cx + ex, cy + ey)) / 6;
}

/** A box in one colour at brightness b. */
export function pbox(R, x0, y0, x1, y1, z0, z1, color, b) {
  box(R.ctx, R.v, x0, y0, x1, y1, z0, z1, tone(color, b), tone(color, b * R.fX), tone(color, b * R.fY));
}

/**
 * Fill for a wall whose foot runs from (xa, ya) to (xb, yb) and looks out
 * along (nx, ny): the light just in front of it, sampled along its length
 * (a flat tone when it is even, a gradient across the screen when it isn't).
 */
function wallFill(R, color, k, xa, ya, xb, yb, nx, ny) {
  const L = R.L;
  const len = Math.abs(xb - xa) + Math.abs(yb - ya);
  const ox = nx * 4;
  const oy = ny * 4;
  if (len < 44) return tone(color, k * R.struct(L.lit((xa + xb) / 2 + ox, (ya + yb) / 2 + oy)));
  const n = Math.min(10, 2 + ((len / 64) | 0));
  // Keep the end samples off the corners (they'd sit inside the next wall).
  const inset = Math.min(8, len * 0.1) / len;
  let lo = 9;
  let hi = -9;
  for (let i = 0; i < n; i++) {
    const u = inset + (1 - 2 * inset) * (i / (n - 1));
    const s = R.struct(L.lit(xa + (xb - xa) * u + ox, ya + (yb - ya) * u + oy));
    samp[i] = s;
    if (s < lo) lo = s;
    if (s > hi) hi = s;
  }
  if (hi - lo < 0.05) return tone(color, (k * (lo + hi)) / 2);
  const sa = R.v.px(xa, ya);
  const sb = R.v.px(xb, yb);
  if (Math.abs(sb - sa) < 1) return tone(color, (k * (lo + hi)) / 2);
  const g = R.ctx.createLinearGradient(sa, 0, sb, 0);
  for (let i = 0; i < n; i++) g.addColorStop(i / (n - 1), tone(color, k * samp[i]));
  return g;
}

/** The two visible walls of a structure, lit along their length (the top is the caller's). */
export function litWalls(R, x0, y0, x1, y1, z0, z1, color) {
  const { ctx, v } = R;
  if (v.flat) return;
  const xf = v.faceX < 0 ? x0 : x1;
  const yf = v.faceY > 0 ? y1 : y0;
  ctx.fillStyle = v.faceX ? wallFill(R, color, R.fX, xf, y0, xf, y1, v.faceX, 0) : tone(color, R.fX * R.amb);
  ctx.beginPath();
  boxHull(ctx, v, x0, y0, x1, y1, z0, z1);
  ctx.fill();
  if (v.faceY) {
    ctx.fillStyle = wallFill(R, color, R.fY, x0, yf, x1, yf, 0, v.faceY);
    ctx.beginPath();
    boxFaceY(ctx, v, x0, y0, x1, y1, z0, z1);
    ctx.fill();
  }
}

export function topFill(R, x0, y0, x1, y1, z, style) {
  const { ctx, v } = R;
  ctx.fillStyle = style;
  ctx.beginPath();
  boxTop(ctx, v, x0, y0, x1, y1, z);
  ctx.fill();
}

/**
 * Paint on the visible wall along x (the one that looks at the camera):
 * fn(ctx, len) draws in wall space, x from 0 to len along the wall reading
 * left to right, y = -height. Returns false if that wall is edge-on.
 */
export function onFaceY(R, x0, y0, x1, y1, fn) {
  const v = R.v;
  if (!v.faceY || v.flat) return false;
  const y = v.faceY > 0 ? y1 : y0;
  if (v.runsRight(1, 0)) R.face(x0, y, 1, 0, 0);
  else R.face(x1, y, -1, 0, 0);
  fn(R.ctx, x1 - x0, v.runsRight(1, 0));
  R.reset();
  return true;
}

/** The same for the visible wall along y. */
export function onFaceX(R, x0, y0, x1, y1, fn) {
  const v = R.v;
  if (!v.faceX || v.flat) return false;
  const x = v.faceX < 0 ? x0 : x1;
  if (v.runsRight(0, 1)) R.face(x, y0, 0, 1, 0);
  else R.face(x, y1, 0, -1, 0);
  fn(R.ctx, y1 - y0, v.runsRight(0, 1));
  R.reset();
  return true;
}

// --- Buildings ---------------------------------------------------------------------------------

const FACADES = ['#77604f', '#62656b', '#7b735f', '#664f47', '#686d5d', '#7c766d', '#5c6672', '#716253'];
const WAREHOUSE = ['#5e6468', '#6a6258', '#566068', '#6b5a4c'];

function buildingModel(o, map) {
  const hc = strHash(o.color || '#444');
  const own = hash01((o.seed || 1) % 977); // the same for every piece of a carved-up building
  const kiosk = o.booth || Math.max(o.w, o.h) < 110;
  let h;
  if (kiosk) h = 52 + own * 10;
  else if (o.ware) h = 78 + own * 22;
  else h = 76 + own * 56;
  const data = {
    wall: o.ware ? WAREHOUSE[hc % WAREHOUSE.length] : FACADES[(hc + Math.floor(own * 3)) % FACADES.length],
    kiosk,
    gable: !!o.ware && !o.booth && Math.min(o.w, o.h) >= 150,
    rise: 14 + own * 8,
    floors: Math.max(1, Math.floor((h - 14) / 34)),
  };
  if (map.theme !== 'docks' && map.theme !== 'interior' && !kiosk) data.shop = own > 0.55;
  return { h, draw: drawBuilding, data };
}

function windows(ctx, len, h, floors, seed, lit, t) {
  // Rows of windows along a wall `len` long; a rare one still has a light on.
  const ww = 13;
  const wh = 17;
  const step = 27;
  const n = Math.floor((len - 16) / step);
  if (n < 1) return;
  const x0 = (len - (n - 1) * step - ww) / 2;
  ctx.fillStyle = 'rgba(9,13,22,0.55)';
  ctx.beginPath();
  for (let f = 0; f < floors; f++) {
    const z = 44 + f * 34;
    if (z > h - 8) break;
    for (let k = 0; k < n; k++) if (hash01(seed + k * 7.31 + f * 3.17) > 0.12) ctx.rect(x0 + k * step, -z, ww, wh);
  }
  ctx.fill();
  if (!lit) return;
  for (let f = 0; f < floors; f++) {
    const z = 44 + f * 34;
    if (z > h - 8) break;
    for (let k = 0; k < n; k++) {
      const hh = hash01(seed + k * 3.97 + f * 9.13 + 4);
      if (hh > 0.035) continue;
      const fl = 0.55 + 0.25 * Math.sin(t * (1.3 + hh * 40) + k) * Math.sin(t * 0.7 + f);
      ctx.fillStyle = `rgba(255,196,112,${fl.toFixed(2)})`;
      ctx.fillRect(x0 + k * step, -z, ww, wh);
      ctx.fillStyle = 'rgba(30,22,14,0.55)';
      ctx.fillRect(x0 + k * step + ww / 2 - 0.6, -z, 1.2, wh);
    }
  }
}

function drawBuilding(R, o, rec) {
  const { ctx, v } = R;
  const d = rec.data;
  const x0 = o.x;
  const y0 = o.y;
  const x1 = o.x + o.w;
  const y1 = o.y + o.h;
  const H = rec.h;
  const night = R.night;
  litWalls(R, x0, y0, x1, y1, 0, H, d.wall);
  if (!v.flat && R.alpha > 0.5) {
    const seed = (o.seed || 1) * 0.013;
    const face = (ctx2, len, k) => {
      // A footing course, windows, and on longer walls a door or a shuttered shop front.
      ctx2.fillStyle = 'rgba(0,0,0,0.22)';
      ctx2.fillRect(0, -7, len, 7);
      if (d.kiosk) {
        ctx2.fillStyle = 'rgba(9,13,22,0.5)';
        if (len > 40) ctx2.fillRect(len * 0.2, -34, len * 0.6, 20);
        return;
      }
      windows(ctx2, len, H, d.floors, seed + k, night, R.t);
      if (o.ware) {
        // Loading doors.
        ctx2.fillStyle = 'rgba(14,16,20,0.5)';
        for (let x = 30; x + 44 < len - 20; x += 120) ctx2.fillRect(x, -40, 44, 40);
        return;
      }
      if (len < 70) return;
      const dx = 14 + hash01(seed + k * 5 + 1) * (len - 50);
      ctx2.fillStyle = 'rgba(12,12,14,0.62)';
      ctx2.fillRect(dx, -31, 19, 31);
      if (d.shop && len > 150) {
        const sx = dx > len / 2 ? 14 : dx + 32;
        const sw = Math.min(70, len - sx - 14);
        if (sw > 30) {
          ctx2.fillStyle = 'rgba(16,22,30,0.55)';
          ctx2.fillRect(sx, -30, sw, 24);
          ctx2.fillStyle = 'rgba(150,60,50,0.35)';
          ctx2.fillRect(sx - 2, -36, sw + 4, 5);
        }
      }
    };
    onFaceX(R, x0, y0, x1, y1, (c, len) => face(c, len, 1));
    onFaceY(R, x0, y0, x1, y1, (c, len) => face(c, len, 2));
    wallPosters(R, o, rec);
  }
  // Roof.
  const roofK = R.roofK;
  if (d.gable && !v.flat && !rec.art) {
    gableRoof(R, o, H, d.rise, roofK);
    return;
  }
  const P = Math.min(6, o.w * 0.12, o.h * 0.12); // parapet
  const drop = d.kiosk ? 0 : 5;
  topFill(R, x0, y0, x1, y1, H, tone(o.color, roofK * 1.12));
  if (!v.flat && drop && o.w > 40 && o.h > 40) {
    // The roof sits a little below the parapet: its two far inner walls show.
    const xi = v.faceX < 0 ? x1 - P : x0 + P;
    const yi = v.faceY > 0 ? y0 + P : y1 - P;
    ctx.fillStyle = tone(o.color, roofK * 0.66);
    ctx.beginPath();
    if (v.faceY) quad3(ctx, v, x0 + P, yi, H - drop, x1 - P, yi, H - drop, x1 - P, yi, H, x0 + P, yi, H);
    if (v.faceX) quad3(ctx, v, xi, y0 + P, H - drop, xi, y1 - P, H - drop, xi, y1 - P, H, xi, y0 + P, H);
    ctx.fill();
    topFill(R, x0 + P, y0 + P, x1 - P, y1 - P, H - drop, tone(o.color, roofK * 0.9));
  }
  // Rooftop clutter: AC units / vents placed from the building's seed.
  const n = o.vents || 0;
  for (let k = 0; k < n; k++) {
    const hx = hash01(o.seed + k * 7.31);
    const hy = hash01(o.seed + k * 3.17 + 11);
    const w = 18 + hash01(o.seed + k) * 16;
    const hh = 14 + hash01(o.seed + k + 5) * 12;
    const x = o.x + 12 + hx * Math.max(1, o.w - 24 - w);
    const y = o.y + 12 + hy * Math.max(1, o.h - 24 - hh);
    pbox(R, x, y, x + w, y + hh, H - drop, H - drop + 9 + hash01(o.seed + k * 2.3) * 6, night ? '#5c6068' : '#6a6e75', roofK * 0.95);
  }
  if (rec.art || o.booth) {
    R.ground(H - drop);
    if (o.booth) drawWarehouseRidges(ctx, o);
    if (rec.art) for (const fn of rec.art) fn(ctx, R);
    R.reset();
  }
}

/** A low pitched roof with its ridge along the long side (warehouses). */
function gableRoof(R, o, H, rise, k) {
  const { ctx, v } = R;
  const x0 = o.x;
  const y0 = o.y;
  const x1 = o.x + o.w;
  const y1 = o.y + o.h;
  const top = H + rise;
  const c = o.color;
  ctx.lineWidth = 1;
  if (o.w >= o.h) {
    const ym = (y0 + y1) / 2;
    const near = v.faceY > 0 ? y1 : y0;
    const far = v.faceY > 0 ? y0 : y1;
    ctx.fillStyle = tone(c, k * 0.8);
    ctx.beginPath();
    quad3(ctx, v, x0, far, H, x1, far, H, x1, ym, top, x0, ym, top);
    ctx.fill();
    ctx.fillStyle = tone(c, k * 1.08);
    ctx.beginPath();
    quad3(ctx, v, x0, near, H, x1, near, H, x1, ym, top, x0, ym, top);
    ctx.fill();
    // The gable end that looks at the camera, in the wall's colour.
    if (v.faceX) {
      const x = v.faceX < 0 ? x0 : x1;
      ctx.fillStyle = tone(R.cur.data.wall, R.fX * R.struct(R.L.lit(x + v.faceX * 4, ym)));
      ctx.beginPath();
      ctx.moveTo(v.px(x, y0), v.py(x, y0, H));
      ctx.lineTo(v.px(x, y1), v.py(x, y1, H));
      ctx.lineTo(v.px(x, ym), v.py(x, ym, top));
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    for (let x = x0 + 14; x < x1 - 4; x += 16) {
      line3(ctx, v, x, near, H, x, ym, top);
      line3(ctx, v, x, far, H, x, ym, top);
    }
    ctx.stroke();
    ctx.strokeStyle = tone(c, k * 1.3);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    line3(ctx, v, x0, ym, top, x1, ym, top);
    ctx.stroke();
  } else {
    const xm = (x0 + x1) / 2;
    const near = v.faceX < 0 ? x0 : x1;
    const far = v.faceX < 0 ? x1 : x0;
    ctx.fillStyle = tone(c, k * 0.86);
    ctx.beginPath();
    quad3(ctx, v, far, y0, H, far, y1, H, xm, y1, top, xm, y0, top);
    ctx.fill();
    ctx.fillStyle = tone(c, k * 0.98);
    ctx.beginPath();
    quad3(ctx, v, near, y0, H, near, y1, H, xm, y1, top, xm, y0, top);
    ctx.fill();
    if (v.faceY) {
      const y = v.faceY > 0 ? y1 : y0;
      ctx.fillStyle = tone(R.cur.data.wall, R.fY * R.struct(R.L.lit(xm, y + v.faceY * 4)));
      ctx.beginPath();
      ctx.moveTo(v.px(x0, y), v.py(x0, y, H));
      ctx.lineTo(v.px(x1, y), v.py(x1, y, H));
      ctx.lineTo(v.px(xm, y), v.py(xm, y, top));
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    for (let y = y0 + 14; y < y1 - 4; y += 16) {
      line3(ctx, v, near, y, H, xm, y, top);
      line3(ctx, v, far, y, H, xm, y, top);
    }
    ctx.stroke();
    ctx.strokeStyle = tone(c, k * 1.3);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    line3(ctx, v, xm, y0, top, xm, y1, top);
    ctx.stroke();
  }
}

// --- Posters on walls --------------------------------------------------------------------------

/** Posters that scene prep hung on this obstacle's visible walls (lore-gen places them on the ground beside it). */
export function wallPosters(R, o, rec) {
  if (!rec.posters) return;
  const { ctx, v } = R;
  for (const q of rec.posters) {
    const p = q.p;
    // Only walls that look at the camera carry them; the rest stay on the ground (lore-render).
    const onX = q.axis === 'x';
    if (onX ? v.faceX !== q.out : v.faceY !== q.out) continue;
    const dir = onX ? (v.runsRight(0, 1) ? 1 : -1) : v.runsRight(1, 0) ? 1 : -1;
    const fx = onX ? q.face : q.mid;
    const fy = onX ? q.mid : q.face;
    const k = R.struct(R.L.lit(fx + (onX ? q.out * 5 : 0), fy + (onX ? 0 : q.out * 5)));
    R.face(fx, fy, onX ? 0 : dir, onX ? dir : 0, q.z);
    ctx.scale(q.s, q.s);
    ctx.rotate(p.rot || 0);
    drawPosterArt(ctx, p, q.w, q.h);
    ctx.fillStyle = veil(Math.min(1, k * 1.15));
    ctx.fillRect(-q.w / 2 - 1, -q.h / 2 - 1, q.w + 3, q.h + 3);
    R.reset();
  }
}

// --- Walls and other structures ----------------------------------------------------------------

function wallModel(o, map) {
  let h = map.theme === 'interior' ? 44 : 52;
  let wall = o.color || '#5a5650';
  if (o.safe) h = 46;
  else if (o.stall) h = 32;
  else if (o.exterior) h = 54;
  else if (o.facade) {
    // The front of a room carved into a building: as tall as, and the colour of, the building it belongs to.
    h = 76;
    for (const b of map.obstacles) {
      if (b.kind === 'building' && b.color === o.color && b.x <= o.x + o.w + 1 && b.x + b.w >= o.x - 1 && b.y <= o.y + o.h + 1 && b.y + b.h >= o.y - 1) {
        const m = buildingModel(b, map);
        h = m.h;
        wall = m.data.wall;
        break;
      }
    }
  }
  return { h, draw: drawWall, data: { wall } };
}

function drawWall(R, o, rec) {
  const x0 = o.x;
  const y0 = o.y;
  const x1 = o.x + o.w;
  const y1 = o.y + o.h;
  const c = rec.data.wall;
  litWalls(R, x0, y0, x1, y1, 0, rec.h, c);
  if (R.alpha > 0.5) wallPosters(R, o, rec);
  topFill(R, x0, y0, x1, y1, rec.h, tone(c, R.roofK * (o.facade ? 1.0 : 1.12)));
  if (rec.art) {
    R.ground(rec.h);
    for (const fn of rec.art) fn(R.ctx, R);
    R.reset();
  }
}

function drawPillar(R, o, rec) {
  const c = '#6a665f';
  litWalls(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, rec.h, c);
  topFill(R, o.x, o.y, o.x + o.w, o.y + o.h, rec.h, tone(c, R.roofK * 1.1));
  topFill(R, o.x + 6, o.y + 6, o.x + o.w - 6, o.y + o.h - 6, rec.h, tone(c, R.roofK * 0.82));
  if (rec.art) {
    R.ground(rec.h);
    for (const fn of rec.art) fn(R.ctx, R);
    R.reset();
  }
}

function drawShelf(R, o, rec) {
  const { ctx } = R;
  const c = '#43474d';
  const x0 = o.x;
  const y0 = o.y;
  const x1 = o.x + o.w;
  const y1 = o.y + o.h;
  litWalls(R, x0, y0, x1, y1, 0, rec.h, c);
  // Shelf boards and boxes on the long wall that shows.
  const goods = (ctx2, len) => {
    ctx2.fillStyle = 'rgba(0,0,0,0.3)';
    for (const z of [17, 34]) ctx2.fillRect(0, -z - 1, len, 2);
    for (let p = 4, k = 0; p < len - 12; p += 22, k++) {
      const hh = hash01(o.x * 0.37 + o.y * 0.11 + k);
      if (hh < 0.25) continue;
      ctx2.fillStyle = hh < 0.6 ? 'rgba(125,96,60,0.7)' : 'rgba(140,122,86,0.7)';
      ctx2.fillRect(p, -(hh < 0.6 ? 15 : 32), 16, 12);
    }
  };
  if (o.w >= o.h) onFaceY(R, x0, y0, x1, y1, goods);
  else onFaceX(R, x0, y0, x1, y1, goods);
  topFill(R, x0, y0, x1, y1, rec.h, tone(c, R.roofK));
  // What's stacked on top (as it was drawn from above).
  R.ground(rec.h);
  const horiz = o.w >= o.h;
  const len = horiz ? o.w : o.h;
  for (let p = 4, k = 0; p < len - 10; p += 22, k++) {
    const hh = hash01(o.x * 0.37 + o.y * 0.11 + k);
    if (hh < 0.25) continue;
    ctx.fillStyle = tone(hh < 0.6 ? '#6b5233' : '#7a6a4a', R.roofK);
    if (horiz) ctx.fillRect(o.x + p, o.y + 4, 18, o.h - 8);
    else ctx.fillRect(o.x + 4, o.y + p, o.w - 8, 18);
  }
  if (rec.art) for (const fn of rec.art) fn(ctx, R);
  R.reset();
}

function drawGlass(R, o, rec) {
  const { ctx, v } = R;
  const x0 = o.x;
  const y0 = o.y;
  const x1 = o.x + o.w;
  const y1 = o.y + o.h;
  const H = rec.h;
  const b = R.struct(R.L.sample(o.x + o.w / 2, o.y + o.h / 2));
  // A low sill, the pane, a bright top edge.
  pbox(R, x0, y0, x1, y1, 0, 9, '#4d4a45', b);
  if (!v.flat) {
    ctx.fillStyle = `rgba(150,205,235,${(0.1 + 0.1 * b).toFixed(3)})`;
    ctx.beginPath();
    boxHull(ctx, v, x0, y0, x1, y1, 9, H);
    ctx.fill();
    // Mullions.
    ctx.strokeStyle = `rgba(190,225,245,${(0.2 + 0.25 * b).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const horiz = o.w >= o.h;
    const len = horiz ? o.w : o.h;
    const n = Math.max(1, Math.round(len / 46));
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      if (horiz) line3(ctx, v, x0 + o.w * u, (y0 + y1) / 2, 9, x0 + o.w * u, (y0 + y1) / 2, H);
      else line3(ctx, v, (x0 + x1) / 2, y0 + o.h * u, 9, (x0 + x1) / 2, y0 + o.h * u, H);
    }
    ctx.stroke();
  }
  topFill(R, x0, y0, x1, y1, H, `rgba(200,235,250,${(0.25 + 0.3 * b).toFixed(3)})`);
}

/** The quarantine wall: concrete outdoors, welded steel shutters indoors. */
function drawQwall(R, o, rec) {
  const { ctx, v } = R;
  const x0 = o.x;
  const y0 = o.y;
  const x1 = o.x + o.w;
  const y1 = o.y + o.h;
  const H = rec.h;
  const vert = o.h >= o.w;
  const c = o.indoor ? '#4b5058' : '#6b6a64';
  litWalls(R, x0, y0, x1, y1, 0, H, c);
  const mapH = R.game.world.map.h;
  const face = (ctx2, len, fwd) => {
    ctx2.strokeStyle = 'rgba(0,0,0,0.32)';
    ctx2.lineWidth = 1.4;
    ctx2.beginPath();
    if (o.indoor) {
      // Shutter slats.
      for (let z = 6; z < H; z += 7) { ctx2.moveTo(0, -z); ctx2.lineTo(len, -z); }
    } else {
      for (let s = 24; s < len; s += 48) { ctx2.moveTo(s, 0); ctx2.lineTo(s, -H); }
      ctx2.moveTo(0, -H + 10);
      ctx2.lineTo(len, -H + 10);
    }
    ctx2.stroke();
    // Hazard ends where the wall meets an opening.
    const e = Math.min(o.indoor ? 16 : 22, len / 2);
    const lowEnd = vert ? o.y > 0 : true;
    const highEnd = vert ? o.y + o.h < mapH : true;
    if (fwd ? lowEnd : highEnd) stripes(ctx2, 0, -H, e, H, 0.8);
    if (fwd ? highEnd : lowEnd) stripes(ctx2, len - e, -H, e, H, 0.8);
    if (!o.indoor) {
      ctx2.fillStyle = 'rgba(230,200,90,0.5)';
      ctx2.font = `900 22px ${FONT}`;
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      const a0 = vert ? y0 : x0;
      for (let p = Math.ceil((a0 + 150) / 520) * 520; p < a0 + len - 150; p += 520) ctx2.fillText('QUARANTINE', fwd ? p - a0 : len - (p - a0), -H * 0.52);
    }
  };
  if (R.alpha > 0.5) {
    if (vert) onFaceX(R, x0, y0, x1, y1, face);
    else onFaceY(R, x0, y0, x1, y1, face);
  }
  topFill(R, x0, y0, x1, y1, H, tone(c, R.roofK * 1.12));
  if (!o.indoor && !v.flat) {
    // A rail along the top.
    ctx.strokeStyle = tone('#7b7a73', R.roofK * 1.25);
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (vert) line3(ctx, v, (x0 + x1) / 2, y0, H, (x0 + x1) / 2, y1, H);
    else line3(ctx, v, x0, (y0 + y1) / 2, H, x1, (y0 + y1) / 2, H);
    ctx.stroke();
  }
  if (rec.art) {
    R.ground(H);
    for (const fn of rec.art) fn(ctx, R);
    R.reset();
  }
}

/** The holdout gate: steel bars that slide away as it opens (its rect shrinks). */
function drawGate(R, o, rec) {
  const { ctx, v } = R;
  if (o.h < 1 || o.w < 1) return;
  const x0 = o.x;
  const y0 = o.y;
  const x1 = o.x + o.w;
  const y1 = o.y + o.h;
  const H = rec.h;
  const b = R.struct(R.L.sample(o.x + o.w / 2, o.y + o.h / 2));
  if (v.flat) {
    topFill(R, x0, y0, x1, y1, H, tone('#7d838b', b));
    return;
  }
  ctx.fillStyle = `rgba(110,118,128,${(0.28 * b + 0.1).toFixed(3)})`;
  ctx.beginPath();
  boxHull(ctx, v, x0, y0, x1, y1, 0, H);
  ctx.fill();
  const vert = o.h >= o.w;
  const xm = (x0 + x1) / 2;
  const ym = (y0 + y1) / 2;
  ctx.strokeStyle = tone('#8d939b', b);
  ctx.lineWidth = Math.max(1, 2.2 * v.scale);
  ctx.beginPath();
  if (vert) {
    for (let y = y0 + 5; y < y1; y += 9) line3(ctx, v, xm, y, 0, xm, y, H);
    for (const z of [6, H * 0.5, H - 2]) line3(ctx, v, xm, y0, z, xm, y1, z);
  } else {
    for (let x = x0 + 5; x < x1; x += 9) line3(ctx, v, x, ym, 0, x, ym, H);
    for (const z of [6, H * 0.5, H - 2]) line3(ctx, v, x0, ym, z, x1, ym, z);
  }
  ctx.stroke();
}

const WOODS = ['#7a5a36', '#8c6a40', '#6b4e2e', '#94744a'];

/**
 * How brightly the boards are lit: by the light just in front of the face
 * that shows, or by the better lit side when the camera sees neither face
 * (it looks straight down, or along the wall).
 */
function boardsLight(R, o) {
  const v = R.v;
  const vert = o.vertical;
  const mx = o.x + o.w / 2;
  const my = o.y + o.h / 2;
  const f = v.flat ? 0 : vert ? v.faceX : v.faceY;
  if (f) return R.struct(R.L.lit(mx + (vert ? f * 12 : 0), my + (vert ? 0 : f * 12)));
  const d = (vert ? o.w : o.h) / 2 + 10;
  const a = R.L.lit(mx - (vert ? d : 0), my - (vert ? 0 : d));
  const c = R.L.lit(mx + (vert ? d : 0), my + (vert ? 0 : d));
  return R.struct(a > c ? a : c);
}

/** The planks seen from above: lying across the gap, on the plane at height z. */
function planksAcross(R, o, z, b) {
  const { ctx } = R;
  const vert = o.vertical;
  const n = Math.max(1, Math.ceil((o.hp / o.maxHp) * 4));
  const wob = o.hitT > 0 ? Math.sin(R.t * 70) * o.hitT * 6 : 0;
  R.ground(z);
  ctx.save();
  ctx.translate(o.x + o.w / 2 + (vert ? wob : 0), o.y + o.h / 2 + (vert ? 0 : wob));
  if (vert) ctx.rotate(Math.PI / 2);
  const len = (vert ? o.h : o.w) + 12;
  const th = vert ? o.w : o.h;
  const angles = [-0.16, 0.13, -0.05, 0.2];
  const offs = [-th * 0.22, th * 0.18, -th * 0.02, th * 0.3];
  for (let k = 0; k < n; k++) {
    ctx.save();
    ctx.translate(0, offs[k]);
    ctx.rotate(angles[k]);
    ctx.fillStyle = tone(WOODS[k], b);
    ctx.fillRect(-len / 2, -2.5, len, 5);
    ctx.restore();
  }
  ctx.restore();
  R.reset();
}

/** Planks nailed across a doorway. Fewer planks as they take damage. */
function drawBoardsModel(R, o, rec) {
  const { ctx, v } = R;
  const x0 = o.x;
  const y0 = o.y;
  const x1 = o.x + o.w;
  const y1 = o.y + o.h;
  const H = rec.h;
  const vert = o.vertical;
  const n = Math.max(1, Math.ceil((o.hp / o.maxHp) * 4));
  const wob = o.hitT > 0 ? Math.sin(R.t * 70) * o.hitT * 6 : 0;
  // The dark of the doorway.
  if (v.flat) topFill(R, x0, y0, x1, y1, 0, '#0b0a09');
  else box(ctx, v, x0, y0, x1, y1, 0, H, '#131210', '#090807', '#0c0b0a');
  const b = boardsLight(R, o);
  const planks = (ctx2, len) => {
    const zs = o.heavy ? [10, 24, 38, 52] : [9, 20, 31, 41];
    const tilt = [-0.1, 0.08, -0.04, 0.12];
    for (let k = 0; k < n; k++) {
      ctx2.save();
      ctx2.translate(len / 2 + wob, -Math.min(H - 5, zs[k] * (H < 44 ? H / 46 : 1)));
      ctx2.rotate(tilt[k]);
      ctx2.fillStyle = 'rgba(0,0,0,0.4)';
      ctx2.fillRect(-len / 2 - 5, -2, len + 12, o.heavy ? 9 : 7);
      ctx2.fillStyle = tone(WOODS[k], b);
      ctx2.fillRect(-len / 2 - 6, -3.5, len + 12, o.heavy ? 8.5 : 6.5);
      ctx2.fillStyle = 'rgba(20,14,8,0.7)';
      ctx2.fillRect(-len / 2 - 2, -1, 2, 2);
      ctx2.fillRect(len / 2, -1, 2, 2);
      ctx2.restore();
    }
  };
  const drawn = vert ? onFaceX(R, x0, y0, x1, y1, planks) : onFaceY(R, x0, y0, x1, y1, planks);
  // Seen from straight above (or edge-on): the planks lie across the gap. Under
  // a lintel they would be out of sight: the doorway's plan mark shows them.
  if (!drawn && !rec.lintel) planksAcross(R, o, v.flat ? 0 : H, b);
}

// --- Shipping containers -----------------------------------------------------------------------

function drawContainerModel(R, o, rec) {
  const { ctx, v } = R;
  const n = o.n || 1;
  const horiz = o.dir !== 'v';
  const size = horiz ? o.h / n : o.w / n;
  const H1 = 60;
  const tiers = o.tall ? 2 : 1;
  // Far boxes first.
  const order = [];
  for (let k = 0; k < n; k++) order.push(k);
  const nearFirst = horiz ? v.faceY > 0 : v.faceX > 0;
  if (!nearFirst) order.reverse();
  for (let tier = 0; tier < tiers; tier++) {
    for (const k of order) {
      const x0 = horiz ? o.x : o.x + k * size;
      const y0 = horiz ? o.y + k * size : o.y;
      const x1 = horiz ? o.x + o.w : x0 + size;
      const y1 = horiz ? y0 + size : o.y + o.h;
      const base = o.colors[(k + tier * 3) % o.colors.length];
      const z0 = tier * H1;
      const z1 = z0 + H1;
      litWalls(R, x0 + 0.5, y0 + 0.5, x1 - 0.5, y1 - 0.5, z0, z1, base);
      if (!v.flat && R.alpha > 0.5) {
        // Corrugated sides, the doors on the short end.
        const ribs = (ctx2, len) => {
          ctx2.strokeStyle = 'rgba(0,0,0,0.2)';
          ctx2.lineWidth = 1.5;
          ctx2.beginPath();
          for (let s = 6; s < len - 3; s += 9) { ctx2.moveTo(s, -z0 - 3); ctx2.lineTo(s, -z1 + 3); }
          ctx2.stroke();
          ctx2.strokeStyle = 'rgba(0,0,0,0.42)';
          ctx2.lineWidth = 1;
          ctx2.strokeRect(0.5, -z1 + 0.5, len - 1, H1 - 1);
        };
        const doors = (ctx2, len) => {
          ctx2.strokeStyle = 'rgba(0,0,0,0.45)';
          ctx2.lineWidth = 1.2;
          ctx2.strokeRect(2, -z1 + 3, len - 4, H1 - 6);
          ctx2.beginPath();
          ctx2.moveTo(len / 2, -z0 - 3);
          ctx2.lineTo(len / 2, -z1 + 3);
          for (const s of [len * 0.3, len * 0.7]) { ctx2.moveTo(s, -z0 - 8); ctx2.lineTo(s, -z1 + 8); }
          ctx2.stroke();
        };
        onFaceY(R, x0, y0, x1, y1, horiz ? ribs : doors);
        onFaceX(R, x0, y0, x1, y1, horiz ? doors : ribs);
      }
      topFill(R, x0 + 0.5, y0 + 0.5, x1 - 0.5, y1 - 0.5, z1, tone(base, R.roofK * (tier ? 1.05 : 0.98)));
    }
  }
  if (R.alpha > 0.5) {
    R.ground(tiers * H1);
    drawContainerTop(ctx, o);
    if (rec.art) for (const fn of rec.art) fn(ctx, R);
    R.reset();
  }
}

// --- Vehicles ----------------------------------------------------------------------------------

function drawCarModel(R, o, rec) {
  const { ctx, v } = R;
  const b = propLight(R, o);
  if (b < 0.032) return;
  const vert = o.h > o.w;
  const len = vert ? o.h : o.w;
  const front = o.front || 1;
  // A box given by positions along the car measured from its front (0..1), an inset from the sides, and heights.
  const part = (a0, a1, inset, z0, z1, color, k = 1) => {
    const p0 = front > 0 ? len - a1 * len : a0 * len;
    const p1 = front > 0 ? len - a0 * len : a1 * len;
    if (vert) pbox(R, o.x + inset, o.y + p0, o.x + o.w - inset, o.y + p1, z0, z1, color, b * k);
    else pbox(R, o.x + p0, o.y + inset, o.x + p1, o.y + o.h - inset, z0, z1, color, b * k);
  };
  if (o.truck) {
    // A box truck: cab up front, the cargo box behind it.
    part(0.03, 0.97, 2, 0, 9, '#16171a');
    part(0, 0.24, 3, 7, 40, o.color);
    part(0.02, 0.2, 5, 22, 41, '#1b2430');
    part(0.27, 1, 1, 9, 58, '#8d8f8c', 0.92);
    if (!v.flat) {
      const side = (ctx2, l) => {
        ctx2.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx2.lineWidth = 1;
        ctx2.beginPath();
        for (let s = l * 0.3; s < l; s += 14) { ctx2.moveTo(s, -12); ctx2.lineTo(s, -56); }
        ctx2.stroke();
      };
      if (R.alpha > 0.5) {
        if (vert) onFaceX(R, o.x + 1, o.y + (front > 0 ? 0 : len * 0.27), o.x + o.w - 1, o.y + (front > 0 ? len * 0.73 : len), (c, l) => side(c, l));
        else onFaceY(R, o.x + (front > 0 ? 0 : len * 0.27), o.y + 1, o.x + (front > 0 ? len * 0.73 : len), o.y + o.h - 1, (c, l) => side(c, l));
      }
    }
    return;
  }
  const wreck = o.wreck;
  const body = wreck ? '#2a2420' : o.color;
  // Wheels (a dark sill with the tyres standing proud), body, cabin, roof.
  part(0.04, 0.96, 1.5, 0, 8, '#121316');
  for (const a of [0.12, 0.72]) part(a, a + 0.17, -0.8, 0, 12, '#0e0f11');
  part(0, 1, 0, 6, 20, body);
  if (wreck) {
    part(0.2, 0.86, 4, 20, 26, '#1a1614');
    part(0.26, 0.8, 7, 20, 21, '#0c0a09');
    return;
  }
  part(0.24, 0.86, 3.5, 20, 32, '#1b2430');
  part(0.36, 0.76, 4.5, 32, 33, body, 1.08);
  if (v.flat) return;
  // Lights on whichever end shows.
  const endShows = vert ? v.faceY : v.faceX;
  if (endShows) {
    const frontShows = vert ? (front > 0) === (v.faceY > 0) : (front > 0) === (v.faceX > 0);
    ctx.fillStyle = frontShows ? tone('#d9d2a6', Math.max(b, 0.25)) : tone('#8a1f1f', Math.max(b, 0.3));
    ctx.beginPath();
    for (const s of [0.14, 0.86]) {
      if (vert) {
        const y = v.faceY > 0 ? o.y + o.h : o.y;
        const x = o.x + o.w * s;
        quad3(ctx, v, x - 4, y, 12, x + 4, y, 12, x + 4, y, 17, x - 4, y, 17);
      } else {
        const x = v.faceX < 0 ? o.x : o.x + o.w;
        const y = o.y + o.h * s;
        quad3(ctx, v, x, y - 4, 12, x, y + 4, 12, x, y + 4, 17, x, y - 4, 17);
      }
    }
    ctx.fill();
  }
  if (o.scrawl && R.alpha > 0.5) {
    R.ground(33.2);
    drawCarScrawl(ctx, o);
    R.reset();
  }
}

function drawArmyTruck(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx } = R;
  const cabW = 34;
  const front = o.front > 0;
  const cabX = front ? o.x + o.w - cabW : o.x;
  const bedX = front ? o.x : o.x + cabW + 4;
  const bedW = o.w - cabW - 4;
  pbox(R, o.x + 4, o.y + 1, o.x + o.w - 4, o.y + o.h - 1, 0, 9, '#111214', b);
  pbox(R, bedX, o.y + 1, bedX + bedW, o.y + o.h - 1, 8, 24, '#3c4a30', b);
  pbox(R, bedX + 1, o.y + 2, bedX + bedW - 1, o.y + o.h - 2, 24, 46, '#4a573a', b * 0.95);
  pbox(R, cabX, o.y, cabX + cabW, o.y + o.h, 8, 40, '#4b5a3a', b);
  pbox(R, front ? cabX + cabW - 14 : cabX + 2, o.y + 4, front ? cabX + cabW - 2 : cabX + 14, o.y + o.h - 4, 26, 41, '#1d2a36', b);
  R.ground(46);
  ctx.fillStyle = tone('#e8e8e0', b * 0.9);
  ctx.font = `900 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', bedX + bedW / 2, o.y + o.h / 2);
  R.reset();
}

function drawForklift(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const flip = o.a ? -1 : 1;
  const cx = o.x + o.w / 2;
  // A reach stacker: low yellow body, the cab at one end, the boom raised over the other.
  pbox(R, o.x + 3, o.y - 2, o.x + o.w - 3, o.y + o.h + 2, 0, 11, '#111214', b);
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 9, 28, o.color, b);
  const cabX = flip > 0 ? o.x + 4 : o.x + o.w - 24;
  pbox(R, cabX, o.y + 6, cabX + 20, o.y + o.h - 6, 28, 48, '#2c3a44', b);
  ctx.strokeStyle = tone('#3a3a3a', b);
  ctx.lineWidth = 5 * v.scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  limb(ctx, v, cx - flip * 6, o.y + o.h / 2, 30, cx + flip * (o.w / 2 + 16), o.y + o.h / 2, 58);
  ctx.stroke();
}

function drawHeli(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const c = o.color || '#4b5a3a';
  if (o.part === 'body') {
    // Fuselage on its skids, the glass nose, the rotor mast, scorched.
    ctx.strokeStyle = tone('#222', b);
    ctx.lineWidth = 2.5 * v.scale;
    ctx.beginPath();
    if (o.horiz) {
      line3(ctx, v, o.x + 10, o.y - 4, 2, o.x + o.w - 10, o.y - 4, 2);
      line3(ctx, v, o.x + 10, o.y + o.h + 4, 2, o.x + o.w - 10, o.y + o.h + 4, 2);
    } else {
      line3(ctx, v, o.x - 4, o.y + 10, 2, o.x - 4, o.y + o.h - 10, 2);
      line3(ctx, v, o.x + o.w + 4, o.y + 10, 2, o.x + o.w + 4, o.y + o.h - 10, 2);
    }
    ctx.stroke();
    pbox(R, o.x + 3, o.y + 3, o.x + o.w - 3, o.y + o.h - 3, 5, 14, c, b * 0.8);
    pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 14, 42, c, b);
    const g = 26;
    if (o.horiz) pbox(R, o.dir > 0 ? o.x + o.w - g : o.x, o.y + 5, o.dir > 0 ? o.x + o.w : o.x + g, o.y + o.h - 5, 16, 43, '#1d2a36', b);
    else pbox(R, o.x + 5, o.dir > 0 ? o.y + o.h - g : o.y, o.x + o.w - 5, o.dir > 0 ? o.y + o.h : o.y + g, 16, 43, '#1d2a36', b);
    cylinder(ctx, v, o.x + o.w / 2, o.y + o.h / 2, 7, 42, 52, tone('#2a2a2a', b), tone('#1c1c1c', b));
    R.ground(42.3);
    ctx.fillStyle = 'rgba(20,16,12,0.45)';
    ctx.beginPath();
    circle(ctx, o.x + o.w * 0.35, o.y + o.h * 0.4, Math.min(o.w, o.h) * 0.3);
    ctx.fill();
    R.reset();
    return;
  }
  // Tail boom with its fin at the far end.
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 20, 33, c, b);
  if (o.horiz) pbox(R, o.dir > 0 ? o.x : o.x + o.w - 10, o.y + o.h / 2 - 2, o.dir > 0 ? o.x + 10 : o.x + o.w, o.y + o.h / 2 + 2, 20, 56, c, b * 0.85);
  else pbox(R, o.x + o.w / 2 - 2, o.dir > 0 ? o.y : o.y + o.h - 10, o.x + o.w / 2 + 2, o.dir > 0 ? o.y + 10 : o.y + o.h, 20, 56, c, b * 0.85);
}

// --- Street and yard props ---------------------------------------------------------------------

function drawCrate(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx } = R;
  if (o.pipe) {
    // A stack of pipes / rebar.
    pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, 16, '#4a5560', b);
    R.ground(16);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (o.w > o.h) for (let y = o.y + 5.5; y < o.y + o.h; y += 5.5) { ctx.moveTo(o.x, y); ctx.lineTo(o.x + o.w, y); }
    else for (let x = o.x + 5.5; x < o.x + o.w; x += 5.5) { ctx.moveTo(x, o.y); ctx.lineTo(x, o.y + o.h); }
    ctx.stroke();
    R.reset();
    return;
  }
  const H = 28;
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, H, '#6b5233', b);
  const slats = (ctx2, len) => {
    ctx2.strokeStyle = 'rgba(30,20,10,0.5)';
    ctx2.lineWidth = 2;
    ctx2.strokeRect(2, -H + 2, len - 4, H - 4);
    ctx2.beginPath();
    ctx2.moveTo(3, -3);
    ctx2.lineTo(len - 3, -H + 3);
    ctx2.stroke();
  };
  if (R.alpha > 0.5) {
    onFaceX(R, o.x, o.y, o.x + o.w, o.y + o.h, slats);
    onFaceY(R, o.x, o.y, o.x + o.w, o.y + o.h, slats);
    R.ground(H);
    ctx.strokeStyle = 'rgba(30,20,10,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(o.x + 2, o.y + 2, o.w - 4, o.h - 4);
    ctx.beginPath();
    ctx.moveTo(o.x + 3, o.y + 3);
    ctx.lineTo(o.x + o.w - 3, o.y + o.h - 3);
    ctx.moveTo(o.x + o.w - 3, o.y + 3);
    ctx.lineTo(o.x + 3, o.y + o.h - 3);
    ctx.stroke();
    R.reset();
  }
}

function drawDumpster(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const c = o.color || '#2f4f3a';
  const H = 32;
  pbox(R, o.x + 1, o.y + 1, o.x + o.w - 1, o.y + o.h - 1, 0, H - 4, c, b * 0.9);
  // Two lids, one propped a little higher.
  const horiz = o.w >= o.h;
  if (horiz) {
    pbox(R, o.x, o.y, o.x + o.w / 2, o.y + o.h, H - 4, H - 1, c, b * 0.72);
    pbox(R, o.x + o.w / 2, o.y, o.x + o.w, o.y + o.h, H - 4, H + 1, c, b * 1.12);
  } else {
    pbox(R, o.x, o.y, o.x + o.w, o.y + o.h / 2, H - 4, H - 1, c, b * 0.72);
    pbox(R, o.x, o.y + o.h / 2, o.x + o.w, o.y + o.h, H - 4, H + 1, c, b * 1.12);
  }
}

function drawFence(R, o) {
  const { ctx, v } = R;
  const b = Math.max(R.L.lit(o.x + o.w / 2, o.y + o.h / 2), 0);
  if (b < 0.032) return;
  const H = 40;
  const horiz = o.w > o.h;
  const xm = o.x + o.w / 2;
  const ym = o.y + o.h / 2;
  if (v.flat) {
    topFill(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, tone('#7d858c', b * 0.7));
    return;
  }
  // Chain link: a faint sheet, posts and a top rail.
  ctx.fillStyle = `rgba(150,160,170,${(0.16 * b).toFixed(3)})`;
  ctx.beginPath();
  if (horiz) quad3(ctx, v, o.x, ym, 0, o.x + o.w, ym, 0, o.x + o.w, ym, H, o.x, ym, H);
  else quad3(ctx, v, xm, o.y, 0, xm, o.y + o.h, 0, xm, o.y + o.h, H, xm, o.y, H);
  ctx.fill();
  ctx.strokeStyle = tone('#8b939a', b);
  ctx.lineWidth = Math.max(1, 2 * v.scale);
  ctx.lineCap = 'butt';
  ctx.beginPath();
  if (horiz) {
    for (let x = o.x; x <= o.x + o.w + 0.5; x += o.w / Math.max(1, Math.round(o.w / 32))) line3(ctx, v, x, ym, 0, x, ym, H + 2);
    line3(ctx, v, o.x, ym, H, o.x + o.w, ym, H);
  } else {
    for (let y = o.y; y <= o.y + o.h + 0.5; y += o.h / Math.max(1, Math.round(o.h / 32))) line3(ctx, v, xm, y, 0, xm, y, H + 2);
    line3(ctx, v, xm, o.y, H, xm, o.y + o.h, H);
  }
  ctx.stroke();
  ctx.lineCap = 'round';
}

function drawPlanter(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, 15, '#56534d', b);
  topFill(R, o.x + 5, o.y + 5, o.x + o.w - 5, o.y + o.h - 5, 15, tone('#2a2620', b));
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  ctx.fillStyle = tone('#234026', b);
  ctx.beginPath();
  ball(ctx, v, cx - 6, cy + 3, 22, 10);
  ball(ctx, v, cx + 7, cy - 4, 23, 9);
  ctx.fill();
  ctx.fillStyle = tone('#2f5433', b);
  ctx.beginPath();
  ball(ctx, v, cx, cy, 28, 9);
  ctx.fill();
}

function drawBench(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const horiz = o.w >= o.h;
  const c = '#5a4632';
  if (horiz) {
    pbox(R, o.x + 3, o.y + 2, o.x + 7, o.y + o.h - 2, 0, 11, '#2a2a2c', b);
    pbox(R, o.x + o.w - 7, o.y + 2, o.x + o.w - 3, o.y + o.h - 2, 0, 11, '#2a2a2c', b);
    pbox(R, o.x, o.y, o.x + o.w, o.y + 3, 11, 25, c, b * 0.9);
    pbox(R, o.x, o.y + 2, o.x + o.w, o.y + o.h, 11, 14, c, b);
  } else {
    pbox(R, o.x + 2, o.y + 3, o.x + o.w - 2, o.y + 7, 0, 11, '#2a2a2c', b);
    pbox(R, o.x + 2, o.y + o.h - 7, o.x + o.w - 2, o.y + o.h - 3, 0, 11, '#2a2a2c', b);
    pbox(R, o.x + o.w - 3, o.y, o.x + o.w, o.y + o.h, 11, 25, c, b * 0.9);
    pbox(R, o.x, o.y, o.x + o.w - 2, o.y + o.h, 11, 14, c, b);
  }
}

function drawTree(R, o) {
  const { ctx, v } = R;
  const b = propLight(R, o);
  if (b < 0.032) return;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const s = o.w / 36;
  const sway = Math.sin(R.t * 0.8 + (o.seed || 1)) * 1.2;
  cylinder(ctx, v, cx, cy, 5 * s, 0, 34 * s, tone('#3b2c20', b), tone('#33261c', b * 0.9));
  // The crown: dark underside, the mass of it, a lighter cap.
  ctx.fillStyle = tone('#16241a', b);
  ctx.beginPath();
  ball(ctx, v, cx + 3, cy + 4, 44 * s, 27 * s);
  ctx.fill();
  ctx.fillStyle = tone('#23402a', b);
  ctx.beginPath();
  ball(ctx, v, cx + sway * 0.5, cy, 52 * s, 26 * s);
  ball(ctx, v, cx - 12 * s + sway, cy + 6 * s, 47 * s, 16 * s);
  ball(ctx, v, cx + 13 * s + sway, cy - 4 * s, 49 * s, 15 * s);
  ctx.fill();
  ctx.fillStyle = tone('#2d5234', b);
  ctx.beginPath();
  ball(ctx, v, cx - 5 * s + sway, cy - 6 * s, 62 * s, 15 * s);
  ctx.fill();
}

function drawFountain(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const r = o.w / 2;
  cylinder(ctx, v, cx, cy, r, 0, 13, tone('#5d686e', b), tone('#4f5a60', b * 0.75));
  ctx.fillStyle = tone('#25414f', b);
  ctx.beginPath();
  disc(ctx, v, cx, cy, r - 8, 11);
  ctx.fill();
  cylinder(ctx, v, cx, cy, 9, 11, 28, tone('#687379', b), tone('#56616a', b * 0.8));
  cylinder(ctx, v, cx, cy, 15, 28, 31, tone('#687379', b), tone('#56616a', b * 0.8));
}

function drawStatue(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, 26, '#55524d', b);
  pbox(R, o.x + 6, o.y + 6, o.x + o.w - 6, o.y + o.h - 6, 26, 31, '#625f59', b);
  // Somebody important, arm raised.
  ctx.strokeStyle = tone('#6c6962', b);
  ctx.lineCap = 'round';
  ctx.lineWidth = 12 * v.scale;
  ctx.beginPath();
  limb(ctx, v, cx, cy, 36, cx, cy, 58);
  ctx.stroke();
  ctx.lineWidth = 4.5 * v.scale;
  ctx.beginPath();
  limb(ctx, v, cx + 4, cy + 3, 58, cx + 13, cy + 8, 72);
  ctx.stroke();
  ctx.fillStyle = tone('#74716a', b);
  ctx.beginPath();
  ball(ctx, v, cx, cy, 68, 6);
  ctx.fill();
}

function drawBarrel(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const r = o.w / 2 - 1;
  cylinder(ctx, v, cx, cy, r, 0, 30, tone('#4a3626', b), tone('#6b4a2a', b * 0.85));
  ctx.fillStyle = o.fire || R.game.world.map.fires.some((f) => Math.abs(f.x - cx) < 4 && Math.abs(f.y - cy) < 4) ? tone('#ff9a3c', 1) : tone('#1a120c', b);
  ctx.beginPath();
  disc(ctx, v, cx, cy, r - 3, 29.5);
  ctx.fill();
}

function drawBollard(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  cylinder(ctx, v, cx, cy, o.w * 0.4, 0, 13, tone('#3b3f45', b), tone('#26292e', b));
  cylinder(ctx, v, cx, cy, o.w * 0.58, 13, 17, tone('#4a4f56', b), tone('#30343a', b));
}

function drawCraneLeg(R, o, rec) {
  const c = rec.data.color;
  litWalls(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, rec.h, c);
  if (!R.v.flat) {
    // Bogie at the foot.
    pbox(R, o.x - 3, o.y - 3, o.x + o.w + 3, o.y + o.h + 3, 0, 12, '#2a2b2e', R.struct(R.L.lit(o.x + o.w / 2, o.y + o.h + 6)));
  }
  topFill(R, o.x, o.y, o.x + o.w, o.y + o.h, rec.h, tone(c, R.roofK));
}

function drawFlarePost(R, o) {
  const b = Math.max(0.25, propLight(R, o));
  const { ctx, v } = R;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  pbox(R, o.x - 2, o.y - 2, o.x + o.w + 2, o.y + o.h + 2, 0, 5, '#1e2124', b);
  pbox(R, o.x + 4, o.y + 4, o.x + o.w - 4, o.y + o.h - 4, 5, 38, '#b8352a', b);
  pbox(R, o.x + 3, o.y + 3, o.x + o.w - 3, o.y + o.h - 3, 22, 27, '#e8e2d2', b);
  cylinder(ctx, v, cx, cy, 5, 38, 46, tone('#2a2d31', b), tone('#1e2124', b));
}

// --- Indoor furniture --------------------------------------------------------------------------

function drawDesk(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const c = '#5b4a3a';
  const horiz = o.w >= o.h;
  // Two pedestals, the top, monitors.
  if (horiz) {
    pbox(R, o.x + 2, o.y + 3, o.x + 16, o.y + o.h - 3, 0, 21, '#4a3c2f', b);
    pbox(R, o.x + o.w - 16, o.y + 3, o.x + o.w - 2, o.y + o.h - 3, 0, 21, '#4a3c2f', b);
  } else {
    pbox(R, o.x + 3, o.y + 2, o.x + o.w - 3, o.y + 16, 0, 21, '#4a3c2f', b);
    pbox(R, o.x + 3, o.y + o.h - 16, o.x + o.w - 3, o.y + o.h - 2, 0, 21, '#4a3c2f', b);
  }
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 21, 24, c, b);
  const n = Math.max(1, Math.round((horiz ? o.w : o.h) / 64));
  for (let k = 0; k < n; k++) {
    const mx = horiz ? o.x + ((k + 0.5) * o.w) / n : o.x + o.w / 2;
    const my = horiz ? o.y + o.h / 2 : o.y + ((k + 0.5) * o.h) / n;
    if (horiz) {
      pbox(R, mx - 4, my - 6, mx + 4, my - 3, 24, 27, '#1c1f24', b);
      pbox(R, mx - 9, my - 7, mx + 9, my - 5, 26, 38, '#1c1f24', b);
    } else {
      pbox(R, mx + 3, my - 4, mx + 6, my + 4, 24, 27, '#1c1f24', b);
      pbox(R, mx + 5, my - 9, mx + 7, my + 9, 26, 38, '#1c1f24', b);
    }
  }
}

function drawTable(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  if (!v.flat) {
    ctx.strokeStyle = tone('#3a3c40', b);
    ctx.lineWidth = Math.max(1, 3 * v.scale);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    for (const [x, y] of [[o.x + 5, o.y + 5], [o.x + o.w - 5, o.y + 5], [o.x + 5, o.y + o.h - 5], [o.x + o.w - 5, o.y + o.h - 5]]) line3(ctx, v, x, y, 0, x, y, 22);
    ctx.stroke();
    ctx.lineCap = 'round';
  }
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 22, 25, '#5a5d61', b);
  topFill(R, o.x + 2, o.y + 2, o.x + o.w - 2, o.y + 5, 25, tone('#6c7075', b));
}

function drawBed(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx } = R;
  const horiz = o.w >= o.h;
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, 11, '#6d7376', b);
  pbox(R, o.x + 3, o.y + 3, o.x + o.w - 3, o.y + o.h - 3, 11, 16, '#b9bdb8', b);
  if (horiz) {
    pbox(R, o.x, o.y, o.x + 3, o.y + o.h, 0, 27, '#5a6063', b);
    pbox(R, o.x + 6, o.y + 7, o.x + 22, o.y + o.h - 7, 16, 19, '#dcdcd6', b);
  } else {
    pbox(R, o.x, o.y, o.x + o.w, o.y + 3, 0, 27, '#5a6063', b);
    pbox(R, o.x + 7, o.y + 6, o.x + o.w - 7, o.y + 22, 16, 19, '#dcdcd6', b);
  }
  if (hash01(o.x + o.y) < 0.4) {
    R.ground(16.2);
    ctx.fillStyle = `rgba(110,20,16,${(0.6 * Math.min(1, b + 0.2)).toFixed(2)})`;
    ctx.beginPath();
    circle(ctx, o.x + o.w * 0.55, o.y + o.h * 0.55, Math.min(o.w, o.h) * 0.22);
    ctx.fill();
    R.reset();
  }
}

function drawCounter(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, 28, '#4a3d33', b);
  pbox(R, o.x - 1, o.y - 1, o.x + o.w + 1, o.y + o.h + 1, 28, 31, '#6a5a4c', b);
}

function drawCouch(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const c = '#4a2e2e';
  const horiz = o.w >= o.h;
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, 13, c, b);
  if (horiz) {
    pbox(R, o.x, o.y, o.x + o.w, o.y + 9, 13, 27, c, b * 0.9);
    pbox(R, o.x, o.y + 9, o.x + 7, o.y + o.h, 13, 20, c, b * 0.95);
    pbox(R, o.x + o.w - 7, o.y + 9, o.x + o.w, o.y + o.h, 13, 20, c, b * 0.95);
    for (let k = 0; k < 3; k++) pbox(R, o.x + 8 + (k * (o.w - 16)) / 3, o.y + 10, o.x + 7 + ((k + 1) * (o.w - 16)) / 3, o.y + o.h - 1, 13, 16, '#5a3838', b);
  } else {
    pbox(R, o.x + o.w - 9, o.y, o.x + o.w, o.y + o.h, 13, 27, c, b * 0.9);
    pbox(R, o.x, o.y, o.x + o.w - 9, o.y + 7, 13, 20, c, b * 0.95);
    pbox(R, o.x, o.y + o.h - 7, o.x + o.w - 9, o.y + o.h, 13, 20, c, b * 0.95);
    for (let k = 0; k < 3; k++) pbox(R, o.x + 1, o.y + 8 + (k * (o.h - 16)) / 3, o.x + o.w - 10, o.y + 7 + ((k + 1) * (o.h - 16)) / 3, 13, 16, '#5a3838', b);
  }
}

function drawPlant(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  cylinder(ctx, v, cx, cy, o.w * 0.32, 0, 13, tone('#3a2f25', b), tone('#5b4a3a', b * 0.85));
  ctx.fillStyle = tone('#27452c', b);
  ctx.beginPath();
  for (let k = 0; k < 5; k++) ball(ctx, v, cx + Math.cos(k * 1.26) * o.w * 0.3, cy + Math.sin(k * 1.26) * o.w * 0.3, 22 + (k % 2) * 5, o.w * 0.26);
  ctx.fill();
  ctx.fillStyle = tone('#356039', b);
  ctx.beginPath();
  ball(ctx, v, cx, cy, 33, o.w * 0.25);
  ctx.fill();
}

function drawCabinet(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const H = 42;
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, H, '#6a6e72', b);
  const drawers = (ctx2, len) => {
    ctx2.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    for (const z of [14, 28]) { ctx2.moveTo(1, -z); ctx2.lineTo(len - 1, -z); }
    ctx2.stroke();
    ctx2.fillStyle = 'rgba(255,255,255,0.25)';
    for (const z of [8, 22, 36]) ctx2.fillRect(len / 2 - 3, -z, 6, 1.4);
  };
  if (R.alpha > 0.5) {
    if (o.w >= o.h) onFaceY(R, o.x, o.y, o.x + o.w, o.y + o.h, drawers);
    else onFaceX(R, o.x, o.y, o.x + o.w, o.y + o.h, drawers);
  }
}

function drawVending(R, o) {
  const b = Math.max(0.3, propLight(R, o));
  const H = 56;
  const c = o.color || '#7a2a2a';
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, H, c, b);
  // The lit front: still humming.
  const front = (ctx2, len) => {
    ctx2.fillStyle = 'rgba(10,12,16,0.75)';
    ctx2.fillRect(3, -H + 4, len - 6, H - 14);
    ctx2.fillStyle = 'rgba(190,225,255,0.5)';
    ctx2.fillRect(5, -H + 6, len * 0.62, H - 24);
    ctx2.fillStyle = 'rgba(255,255,255,0.35)';
    for (let k = 0; k < 4; k++) ctx2.fillRect(7, -H + 10 + k * 8, len * 0.5, 1.5);
    ctx2.fillStyle = 'rgba(255,214,120,0.8)';
    ctx2.fillRect(len * 0.75, -H + 10, 4, 4);
  };
  if (o.w >= o.h) onFaceY(R, o.x, o.y, o.x + o.w, o.y + o.h, front);
  else onFaceX(R, o.x, o.y, o.x + o.w, o.y + o.h, front);
}

function drawAlarmBox(R, o) {
  const b = Math.max(0.35, propLight(R, o));
  // On the wall at shoulder height, bell and all.
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 24, 40, o.alarmDone ? '#5a2a26' : '#b02020', b);
  const { ctx, v } = R;
  ctx.fillStyle = tone('#f1f1ec', b * 0.9);
  ctx.beginPath();
  ball(ctx, v, o.x + o.w / 2, o.y + o.h / 2, 40.5, 2.6);
  ctx.fill();
}

const JUNK = ['#5b4a3a', '#6a6e72', '#4a3d33', '#5a5d61', '#6b5233'];
const junkOrder = [];

function drawBarricade(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  // A jumble of desks, doors and cabinets jammed across the hall.
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, 10, '#2e2924', b);
  junkOrder.length = 0;
  for (let k = 0; k < 9; k++) {
    const hx = hash01(o.seed + k * 1.7);
    const hy = hash01(o.seed + k * 2.3 + 4);
    const pw = Math.min(o.w, 14 + hash01(o.seed + k * 3.1) * (o.w * 0.7));
    const ph = 10 + hash01(o.seed + k * 4.9) * 26;
    const x = o.x + hx * (o.w - pw);
    const y = o.y + hy * (o.h - ph);
    junkOrder.push({ x, y, w: pw, h: ph, z: 8 + hash01(o.seed + k * 6.1) * 14, top: 22 + hash01(o.seed + k * 8.3) * 24, c: JUNK[k % JUNK.length], d: v.depth(x + pw / 2, y + ph / 2) });
  }
  junkOrder.sort((p, q) => p.d - q.d);
  for (const j of junkOrder) pbox(R, j.x, j.y, j.x + j.w, j.y + j.h, j.z, j.top, j.c, b);
  ctx.strokeStyle = tone('#7a6a4a', b);
  ctx.lineWidth = 4 * v.scale;
  ctx.beginPath();
  limb(ctx, v, o.x + 2, o.y + o.h * 0.2, 14, o.x + o.w - 2, o.y + o.h * 0.55, 44);
  limb(ctx, v, o.x + o.w - 2, o.y + o.h * 0.35, 10, o.x + 2, o.y + o.h * 0.85, 40);
  ctx.stroke();
}

// --- World features ----------------------------------------------------------------------------

function drawSwitchBox(R, o) {
  const b = Math.max(0.3, propLight(R, o));
  const { ctx, v } = R;
  const H = R.game.events && R.game.events.holdout;
  pbox(R, o.x + o.w / 2 - 2, o.y + o.h / 2 - 2, o.x + o.w / 2 + 2, o.y + o.h / 2 + 2, 0, 22, '#2a2c30', b);
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 22, 40, '#c9a227', b);
  const state = H ? H.state : 'idle';
  const on = state !== 'idle' || Math.sin(R.t * 5) > 0;
  ctx.fillStyle = state === 'open' ? '#5dff8a' : state === 'running' ? '#ffb347' : on ? '#ff3b30' : '#5a1a16';
  ctx.beginPath();
  ball(ctx, v, o.x + o.w / 2, o.y + o.h / 2, 42, 3);
  ctx.fill();
}

function drawPump(R, o) {
  const b = Math.max(0.2, propLight(R, o));
  const { ctx, v } = R;
  const c = o.hitT > 0 ? '#ffffff' : '#cfcfc8';
  pbox(R, o.x - 2, o.y - 2, o.x + o.w + 2, o.y + o.h + 2, 0, 5, '#5b5b57', b);
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 5, 44, c, b);
  pbox(R, o.x - 0.5, o.y - 0.5, o.x + o.w + 0.5, o.y + o.h + 0.5, 12, 22, '#b8322a', b);
  pbox(R, o.x + 1, o.y + 1, o.x + o.w - 1, o.y + o.h - 1, 44, 48, '#b8322a', b);
  ctx.strokeStyle = tone('#1b1b1b', b);
  ctx.lineWidth = 2 * v.scale;
  ctx.beginPath();
  const hx = v.faceX < 0 ? o.x : o.x + o.w;
  ctx.moveTo(v.px(hx, o.y + o.h * 0.5), v.py(hx, o.y + o.h * 0.5, 34));
  ctx.quadraticCurveTo(v.px(hx + v.faceX * 9, o.y + o.h * 0.7), v.py(hx + v.faceX * 9, o.y + o.h * 0.7, 14), v.px(hx + v.faceX * 2, o.y + o.h), v.py(hx + v.faceX * 2, o.y + o.h, 26));
  ctx.stroke();
}

function drawGasCylinder(R, o) {
  const b = Math.max(0.2, propLight(R, o));
  const { ctx, v } = R;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const c = o.hitT > 0 ? '#ffffff' : o.tint || '#b5432c';
  cylinder(ctx, v, cx, cy, o.w / 2, 0, 36, tone(c, b * 1.1), tone(c, b * 0.8));
  cylinder(ctx, v, cx, cy, 3.5, 36, 42, tone('#3a3a3a', b), tone('#2a2a2a', b));
}

function drawSandbag(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx } = R;
  const H = 23;
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, H, '#7d7052', b);
  const bags = (ctx2, len) => {
    ctx2.strokeStyle = 'rgba(40,34,20,0.4)';
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    for (const z of [8, 16]) { ctx2.moveTo(0, -z); ctx2.lineTo(len, -z); }
    for (let row = 0; row < 3; row++) for (let s = row % 2 ? 8 : 16; s < len; s += 16) { ctx2.moveTo(s, -row * 8); ctx2.lineTo(s, -row * 8 - 8); }
    ctx2.stroke();
  };
  if (R.alpha > 0.5) {
    onFaceX(R, o.x, o.y, o.x + o.w, o.y + o.h, bags);
    onFaceY(R, o.x, o.y, o.x + o.w, o.y + o.h, bags);
    R.ground(H);
    ctx.fillStyle = tone('#968762', b);
    const vert = o.h > o.w;
    const len = vert ? o.h : o.w;
    for (let p = 0; p < len - 4; p += 16) {
      if (vert) ctx.fillRect(o.x + 2, o.y + p + 2, o.w - 4, 12);
      else ctx.fillRect(o.x + p + 2, o.y + 2, 12, o.h - 4);
    }
    R.reset();
  }
}

function drawBarrier(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx } = R;
  const H = 28;
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, H, '#8c8b85', b);
  const bands = (ctx2, len) => {
    ctx2.fillStyle = tone('#b13a30', b * 0.85);
    for (let p = 6; p < len - 6; p += 22) ctx2.fillRect(p, -H + 6, 8, 10);
  };
  if (R.alpha > 0.5) {
    if (o.h > o.w) onFaceX(R, o.x, o.y, o.x + o.w, o.y + o.h, bands);
    else onFaceY(R, o.x, o.y, o.x + o.w, o.y + o.h, bands);
    R.ground(H);
    ctx.fillStyle = tone('#b13a30', b);
    const vert = o.h > o.w;
    for (let p = 6; p < (vert ? o.h : o.w) - 6; p += 22) {
      if (vert) ctx.fillRect(o.x, o.y + p, o.w, 8);
      else ctx.fillRect(o.x + p, o.y, 8, o.h);
    }
    R.reset();
  }
}

function drawRubble(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const s = o.seed || 1;
  const sideTone = (nx, ny) => tone('#6f6a63', b * (0.6 + 0.3 * Math.max(0, nx * R.lx + ny * R.ly)));
  pts[0] = o.x + hash01(s) * 8; pts[1] = o.y;
  pts[2] = o.x + o.w; pts[3] = o.y + hash01(s + 1) * 8;
  pts[4] = o.x + o.w - hash01(s + 2) * 8; pts[5] = o.y + o.h;
  pts[6] = o.x; pts[7] = o.y + o.h - hash01(s + 3) * 8;
  prism(R.ctx, R.v, pts.subarray(0, 8), 0, 15, tone('#6f6a63', b), sideTone);
  const cx = o.x + o.w * (0.35 + hash01(s + 5) * 0.3);
  const cy = o.y + o.h * (0.35 + hash01(s + 6) * 0.3);
  turnedRect(cx, cy, o.w * 0.45, o.h * 0.4, hash01(s + 7) * 3, pts);
  prism(R.ctx, R.v, pts.subarray(0, 8), 15, 26, tone('#7b766e', b), sideTone);
}

// --- The table ---------------------------------------------------------------------------------

/** The wall (or quarantine wall) a doorway's boards sit in. */
function wallAround(o, map) {
  for (const w of map.obstacles) {
    if ((w.kind !== 'wall' && w.kind !== 'qwall') || w === o) continue;
    if (w.x <= o.x + o.w + 1 && w.x + w.w >= o.x - 1 && w.y <= o.y + o.h + 1 && w.y + w.h >= o.y - 1) return w;
  }
  return null;
}

function simple(h, draw, extra) {
  return () => ({ h, draw, ...extra });
}

const MODELS = {
  building: buildingModel,
  wall: wallModel,
  pillar: simple(58, drawPillar),
  shelf: simple(50, drawShelf),
  glass: (o, map) => ({ h: map.theme === 'interior' ? 44 : 48, draw: drawGlass, fades: false }),
  qwall: (o) => ({ h: o.indoor ? 48 : 86, draw: drawQwall }),
  gate: (o) => ({ h: o.indoor ? 46 : 72, draw: drawGate, fades: false }),
  boards: (o, map) => {
    // A doorway in a wall: the boards are as tall as a door; a tall wall carries on above it (see lintels).
    const w = wallAround(o, map);
    const wallH = w ? MODELS[w.kind](w, map).h : map.theme === 'interior' ? 44 : 60;
    return { h: Math.min(wallH, o.breach ? 62 : 50), draw: drawBoardsModel };
  },
  container: (o) => ({ h: o.tall ? 120 : 60, draw: drawContainerModel }),
  car: (o) => ({ h: o.truck ? 58 : 33, draw: drawCarModel }),
  truck: simple(46, drawArmyTruck),
  forklift: simple(48, drawForklift),
  heli: (o) => ({ h: o.part === 'body' ? 52 : 56, draw: drawHeli }),
  crate: (o) => ({ h: o.pipe ? 16 : 28, draw: drawCrate }),
  dumpster: simple(33, drawDumpster),
  fence: simple(42, drawFence, { fades: false }),
  planter: simple(30, drawPlanter),
  bench: simple(25, drawBench),
  tree: (o) => ({ h: 78 * (o.w / 36), draw: drawTree }),
  fountain: simple(31, drawFountain),
  statue: simple(76, drawStatue),
  barrel: simple(30, drawBarrel),
  bollard: simple(17, drawBollard),
  craneleg: (o, map) => {
    // Which crane it carries: the nearest one.
    let best = null;
    let bd = Infinity;
    for (const c of map.cranes || []) {
      const d = Math.min(Math.abs(c.y - o.y - 13), Math.abs(c.y1 - o.y - 13));
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return { h: CRANE_H, draw: drawCraneLeg, data: { color: best ? best.color : '#c6862c' } };
  },
  flarepost: simple(46, drawFlarePost),
  desk: simple(38, drawDesk),
  table: simple(25, drawTable),
  bed: simple(27, drawBed),
  counter: simple(31, drawCounter),
  couch: simple(27, drawCouch),
  plant: simple(40, drawPlant),
  cabinet: simple(42, drawCabinet),
  vending: simple(56, drawVending),
  alarmbox: simple(40, drawAlarmBox, { fades: false }),
  barricade: simple(46, drawBarricade),
  switchbox: simple(42, drawSwitchBox, { fades: false }),
  pump: simple(48, drawPump),
  cylinder: simple(42, drawGasCylinder),
  sandbag: simple(23, drawSandbag),
  barrier: simple(28, drawBarrier),
  rubble: simple(26, drawRubble),
};

/** How high the gantry cranes carry their girders. */
export const CRANE_H = 230;

/**
 * A map type's own models (theme-models.js): kind -> (o, map) => ({ h, draw, ... }),
 * added to the table (or put in front of what is there: see modelOf).
 */
export function registerModels(table) {
  Object.assign(MODELS, table);
}
/** The model registered for a kind, to wrap it (a house is a building with another look). */
export const modelOf = (kind) => MODELS[kind];
const PROP_MAKERS = [];
/** A map type's own props (drawn, not obstacles): fn(scene, view, out) pushes them. */
export function registerProps(fn) {
  PROP_MAKERS.push(fn);
}
const LAMP_STYLES = {};
/** A lamp with l.style gets its post from here: style -> (lamp) => ({ r, h, draw, gx, gy, gz, glow }). */
export function registerLamp(style, fn) {
  LAMP_STYLES[style] = fn;
}

function drawUnknown(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, 24, o.color || '#55585c', b);
}

/** Whether a kind has a model of its own (anything else is drawn as a plain low box). */
export const hasModel = (kind) => kind in MODELS;

export function modelFor(o, map) {
  const f = MODELS[o.kind];
  return f ? f(o, map) : { h: 24, draw: drawUnknown };
}

// --- Props: drawn, but not obstacles ------------------------------------------------------------
// Lamp posts, gate posts and the like. Each is {x, y, r, h, draw(R, p)}; the
// scene gives it its slot in the painter's order once (it never moves).

function drawLampPost(R, p) {
  const { ctx, v } = R;
  const b = R.struct(R.L.lit(p.x, p.y)) * 0.9;
  const on = lampLit(p.lamp, R.t);
  const H = p.h;
  if (v.flat) {
    ctx.fillStyle = tone('#55585d', b);
    ctx.beginPath();
    ball(ctx, v, p.x, p.y, 0, 3.5);
    ctx.fill();
    return;
  }
  // Base, pole, the arm out over the street, the lamp head.
  cylinder(ctx, v, p.x, p.y, 4, 0, 7, tone('#4a4d52', b), tone('#3a3d42', b));
  ctx.strokeStyle = tone('#5d6167', b);
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.2, 2.6 * v.scale);
  ctx.beginPath();
  limb(ctx, v, p.x, p.y, 6, p.x, p.y, H);
  limb(ctx, v, p.x, p.y, H, p.x + p.ax * 20, p.y + p.ay * 20, H + 3);
  ctx.stroke();
  const hx = p.x + p.ax * 20;
  const hy = p.y + p.ay * 20;
  ctx.fillStyle = on ? '#ffe7b0' : tone('#3a3c40', b);
  ctx.beginPath();
  ctx.ellipse(v.px(hx, hy), v.py(hx, hy, H + 1), 6 * v.scale, 2.6 * v.scale, 0, 0, TAU);
  ctx.fill();
}

function drawLightTower(R, p) {
  const { ctx, v } = R;
  const b = R.struct(R.L.lit(p.x, p.y)) * 0.9;
  const on = lampLit(p.lamp, R.t);
  const H = p.h;
  if (v.flat) return;
  pbox(R, p.x - 7, p.y - 7, p.x + 7, p.y + 7, 0, 10, '#3a3d42', b);
  // A lattice mast with a bank of floodlights.
  ctx.strokeStyle = tone('#6a6e74', b);
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, 1.6 * v.scale);
  ctx.beginPath();
  for (const s of [-4, 4]) limb(ctx, v, p.x + s, p.y, 8, p.x + s * 0.5, p.y, H);
  for (let z = 20; z < H - 10; z += 24) {
    limb(ctx, v, p.x - 4, p.y, z, p.x + 4, p.y, z + 12);
    limb(ctx, v, p.x + 4, p.y, z + 12, p.x - 4, p.y, z + 24);
  }
  ctx.stroke();
  ctx.fillStyle = on ? '#fff3c8' : tone('#3a3c40', b);
  ctx.beginPath();
  for (const s of [-9, 0, 9]) ctx.rect(v.px(p.x, p.y) + s * v.scale - 3 * v.scale, v.py(p.x, p.y, H + 6), 6 * v.scale, 5 * v.scale);
  ctx.fill();
}

function drawPierLamp(R, p) {
  const { ctx, v } = R;
  const b = R.struct(R.L.lit(p.x, p.y)) * 0.9;
  const on = lampLit(p.lamp, R.t);
  if (v.flat) return;
  ctx.strokeStyle = tone('#55585d', b);
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.2, 2.4 * v.scale);
  ctx.beginPath();
  limb(ctx, v, p.x, p.y, 0, p.x, p.y, p.h);
  ctx.stroke();
  ctx.fillStyle = on ? '#ffe7b0' : tone('#3a3c40', b);
  ctx.beginPath();
  ball(ctx, v, p.x, p.y, p.h + 3, 4);
  ctx.fill();
}

/** Strip lights hanging over the rooms and halls (there is no ceiling to hold them, so just the fitting). */
function drawStripLight(R, p) {
  const { ctx, v } = R;
  if (v.flat) return;
  const on = lampLit(p.lamp, R.t);
  const dx = p.lamp.axis === 'v' ? 0 : 12;
  const dy = p.lamp.axis === 'v' ? 12 : 0;
  ctx.strokeStyle = on ? 'rgba(232,242,255,0.95)' : 'rgba(86,90,96,0.8)';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, 3.2 * v.scale);
  ctx.beginPath();
  limb(ctx, v, p.x - dx, p.y - dy, p.h, p.x + dx, p.y + dy, p.h);
  ctx.stroke();
}

function drawGatePost(R, p) {
  const b = R.struct(R.L.lit(p.x, p.y));
  pbox(R, p.x - 9, p.y - 6, p.x + 9, p.y + 6, 0, p.h, '#2b2f35', b);
  const band = (ctx2, len) => stripes(ctx2, 1, -p.h + 4, len - 2, 12, 0.9);
  onFaceX(R, p.x - 9, p.y - 6, p.x + 9, p.y + 6, band);
  onFaceY(R, p.x - 9, p.y - 6, p.x + 9, p.y + 6, band);
}

/** Red steel frames of the safe-room doors, and the jambs of every doorway. */
function drawJamb(R, p) {
  const b = R.struct(R.L.lit(p.x, p.y));
  pbox(R, p.x - p.hw, p.y - p.hh, p.x + p.hw, p.y + p.hh, 0, p.h, p.color, b);
}

export function buildProps(scene, view) {
  const map = scene.map;
  const out = [];
  const interior = map.theme === 'interior';
  for (const l of map.lamps) {
    if (l.style && LAMP_STYLES[l.style]) {
      out.push({ x: l.x, y: l.y, gx: l.x, gy: l.y, gz: 60, glow: 20, lamp: l, ...LAMP_STYLES[l.style](l) });
      continue;
    }
    if (l.interior) {
      out.push({ x: l.x, y: l.y, r: 10, h: 62, lamp: l, draw: drawStripLight, over: true, gx: l.x, gy: l.y, gz: 62, glow: 26 });
      continue;
    }
    if (l.tower) {
      out.push({ x: l.x, y: l.y, r: 8, h: 150, lamp: l, draw: drawLightTower, gx: l.x, gy: l.y, gz: 158, glow: 34 });
      continue;
    }
    if (l.pier) {
      out.push({ x: l.x, y: l.y, r: 3, h: 52, lamp: l, draw: drawPierLamp, gx: l.x, gy: l.y, gz: 55, glow: 20 });
      continue;
    }
    // The arm points out over the nearest street.
    let ax = 0;
    let ay = 0;
    let bd = Infinity;
    for (const s of map.streets) {
      const cx = clamp(l.x, s.x, s.x + s.w);
      const cy = clamp(l.y, s.y, s.y + s.h);
      const d = Math.hypot(cx - l.x, cy - l.y);
      if (d >= bd) continue;
      bd = d;
      if (s.dir === 'v') { ax = l.x < s.x + s.w / 2 ? 1 : -1; ay = 0; } else { ax = 0; ay = l.y < s.y + s.h / 2 ? 1 : -1; }
    }
    out.push({ x: l.x, y: l.y, r: 4, h: 96, lamp: l, ax, ay, draw: drawLampPost, gx: l.x + ax * 20, gy: l.y + ay * 20, gz: 96, glow: 24 });
  }
  for (const c of map.checkpoints || []) {
    const h = c.h || c.w || 120;
    for (const sy of [-1, 1]) out.push({ x: c.x, y: c.y + (sy * h) / 2, r: 9, h: c.indoor ? 50 : 60, draw: drawGatePost });
  }
  // Door jambs so openings read as doorways.
  const wallH = interior ? 44 : 52;
  for (const d of map.doors || []) {
    if (d.vertical) {
      out.push({ x: d.x + d.w / 2, y: d.y - 1, r: 4, hw: d.w / 2 + 2, hh: 2, h: wallH + 2, color: '#2f2c29', draw: drawJamb });
      out.push({ x: d.x + d.w / 2, y: d.y + d.h + 1, r: 4, hw: d.w / 2 + 2, hh: 2, h: wallH + 2, color: '#2f2c29', draw: drawJamb });
    } else {
      out.push({ x: d.x - 1, y: d.y + d.h / 2, r: 4, hw: 2, hh: d.h / 2 + 2, h: wallH + 2, color: '#2f2c29', draw: drawJamb });
      out.push({ x: d.x + d.w + 1, y: d.y + d.h / 2, r: 4, hw: 2, hh: d.h / 2 + 2, h: wallH + 2, color: '#2f2c29', draw: drawJamb });
    }
  }
  // Safe room door frames (red steel).
  for (const room of [map.startRoom, map.endRoom]) {
    const d = room.door;
    if (!d || d.w <= 0) continue;
    out.push({ x: d.x + d.w / 2, y: d.y - 2, r: 4, hw: d.w / 2 + 1, hh: 3, h: 50, color: '#8a2a24', draw: drawJamb });
    out.push({ x: d.x + d.w / 2, y: d.y + d.h + 2, r: 4, hw: d.w / 2 + 1, hh: 3, h: 50, color: '#8a2a24', draw: drawJamb });
  }
  // Boarded doorways in tall walls: the wall carries on over the door (and stays when the boards go).
  for (const o of scene.boarded) {
    const w = wallAround(o, map);
    if (!w) continue;
    const m = MODELS[w.kind](w, map);
    const door = o._r3 ? o._r3.h : 50;
    if (m.h < door + 6) continue;
    const color = w.kind === 'qwall' ? '#6b6a64' : m.data.wall;
    if (o._r3) o._r3.lintel = true;
    out.push({
      x: o.x + o.w / 2, y: o.y + o.h / 2, r: Math.max(o.w, o.h) / 2, h: m.h, z0: door,
      rect: { x: o.x, y: o.y, w: o.w, h: o.h }, color, draw: drawLintel,
      boards: o, door: (o.sealed && o.sealed.door) || o,
    });
  }
  for (const q of buildDecorProps(scene, view)) out.push(q);
  for (const fn of PROP_MAKERS) fn(scene, view, out);
  attachArt(scene, view);
  return out;
}

function drawLintel(R, p) {
  const { ctx, v } = R;
  const o = p.rect;
  const fade = R.hides(o, p.z0, p.h);
  if (fade) ctx.globalAlpha = 0.22;
  litWalls(R, o.x, o.y, o.x + o.w, o.y + o.h, p.z0, p.h, p.color);
  topFill(R, o.x, o.y, o.x + o.w, o.y + o.h, p.h, tone(p.color, R.roofK * 1.05));
  if (fade) ctx.globalAlpha = 1;
  // From straight above, or along the wall, the doorway under it is out of
  // sight: it gets a mark in plan once everything standing is drawn.
  if (v.flat || !(p.boards.vertical ? v.faceX : v.faceY)) R.plans.push(p);
}

/**
 * Doorways the camera can't see into (see drawLintel), as on a floor plan:
 * the dark of the opening where the door really is on the ground, and the
 * planks across it while it is still boarded up.
 */
export function drawDoorPlans(R, eye) {
  const list = R.plans;
  if (!list.length) return;
  const { ctx } = R;
  for (const p of list) {
    const d = p.door;
    // Someone in the doorway is drawn before the wall that hides them: don't paint them out.
    const inside = eye && eye.x > d.x - 12 && eye.x < d.x + d.w + 12 && eye.y > d.y - 12 && eye.y < d.y + d.h + 12;
    ctx.globalAlpha = inside ? 0.3 : 1;
    R.ground(0);
    ctx.fillStyle = '#0b0a09';
    ctx.fillRect(d.x, d.y, d.w, d.h);
    R.reset();
    if (!p.boards.broken) planksAcross(R, p.boards, 0, boardsLight(R, p.boards));
    ctx.globalAlpha = 1;
  }
  list.length = 0;
}

/**
 * Hang what the world passes drew flat next to (or on top of) obstacles onto
 * the obstacles themselves: posters on the walls they lean against, and the
 * words on roofs, shelf tops, container stacks and the quarantine wall.
 */
function attachArt(scene, view) {
  const map = scene.map;
  const obs = scene.statics;
  for (const p of map.posters || []) {
    p._wall = null;
    // lore-gen lays a poster on the ground against the face it belongs to.
    const horiz = p.side === 'n' || p.side === 's';
    const out = p.side === 'n' || p.side === 'w' ? -1 : 1;
    const face = p.side === 'n' ? p.y + p.h : p.side === 's' ? p.y : p.side === 'w' ? p.x + p.w : p.x;
    const mid = horiz ? p.x + p.w / 2 : p.y + p.h / 2;
    for (const o of obs) {
      if (o.kind !== 'building' && o.kind !== 'wall') continue;
      const edge = p.side === 'n' ? o.y : p.side === 's' ? o.y + o.h : p.side === 'w' ? o.x : o.x + o.w;
      if (Math.abs(edge - face) > 1.5) continue;
      if (horiz ? mid < o.x || mid > o.x + o.w : mid < o.y || mid > o.y + o.h) continue;
      const rec = o._r3;
      // Portrait on the walls that run north-south, landscape on the others, as drawn.
      const w = p.w;
      const h = p.h;
      const s = Math.min(o.kind === 'building' ? 1.3 : 1, (rec.h - 5) / h);
      const z = Math.min(rec.h - (h * s) / 2 - 2, o.kind === 'building' ? 34 : rec.h / 2);
      (rec.posters || (rec.posters = [])).push({ p, axis: horiz ? 'y' : 'x', out, face, mid, w, h, s, z });
      p._wall = { axis: horiz ? 'y' : 'x', out };
      break;
    }
  }
  const top = (x, y) => {
    for (const o of obs) if (o._r3.h >= 30 && o.sight && pointInRect(x, y, o)) return o;
    return null;
  };
  for (const r of map.roofArt || []) {
    const o = top(r.x, r.y);
    r._on = !!o;
    if (o) (o._r3.art || (o._r3.art = [])).push((ctx, R) => R.roofText(ctx, r));
  }
  for (const e of map.benRoof || []) {
    e._on = false;
    if (e.type === 'boom') continue;
    const o = top(e.x, e.y);
    if (!o) continue;
    e._on = true;
    (o._r3.art || (o._r3.art = [])).push((ctx, R) => R.benText(ctx, e));
  }
  void view;
}
