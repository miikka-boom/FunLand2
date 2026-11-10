// 3D models for the graveyard, suburbia and the junkyard: registered with the
// model table in models.js (registerModels / registerProps / registerLamp), so
// the scene and the renderer treat them like any other obstacle or prop.
//
// Everything that has a front (a headstone's face, a mausoleum's door, a
// house's porch) looks south where it can: these maps are played from the
// south by default, so that is the face the camera sees.

import { box, cylinder, disc, ball, limb, line3, quad3, tone } from './prims.js';
import { hash01 } from './draw-utils.js';
import { lampLit } from '../util.js';
import { stripes } from './features-render.js';
import {
  propLight, pbox, litWalls, topFill, onFaceX, onFaceY, wallPosters, registerModels, registerProps, registerLamp, modelOf,
} from './models.js';

const fxs = new Float64Array(16);
const fys = new Float64Array(16);
const bxs = new Float64Array(16);
const bys = new Float64Array(16);

// --- A pitched roof over a box ------------------------------------------------------------------

/**
 * A gable roof over [x0, x1] x [y0, y1] from eaves height H up to H + rise.
 * axis 'x': the ridge runs east-west (slopes face north and south);
 * axis 'y': it runs north-south, and the gable ends face north and south.
 * `over` is how far the eaves hang past the walls. wall: the gable ends' colour.
 */
export function pitchedRoof(R, x0, y0, x1, y1, H, rise, axis, roof, wall, over = 4, k = R.roofK) {
  const { ctx, v } = R;
  if (v.flat) {
    topFill(R, x0 - over, y0 - over, x1 + over, y1 + over, H, tone(roof, k));
    ctx.strokeStyle = tone(roof, k * 1.3);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (axis === 'x') line3(ctx, v, x0 - over, (y0 + y1) / 2, H, x1 + over, (y0 + y1) / 2, H);
    else line3(ctx, v, (x0 + x1) / 2, y0 - over, H, (x0 + x1) / 2, y1 + over, H);
    ctx.stroke();
    return;
  }
  const top = H + rise;
  if (axis === 'x') {
    const ym = (y0 + y1) / 2;
    const near = v.faceY > 0 ? y1 + over : y0 - over;
    const far = v.faceY > 0 ? y0 - over : y1 + over;
    const a = x0 - over;
    const b = x1 + over;
    ctx.fillStyle = tone(roof, k * 0.78);
    ctx.beginPath();
    quad3(ctx, v, a, far, H, b, far, H, b, ym, top, a, ym, top);
    ctx.fill();
    // The gable end that looks at the camera.
    if (v.faceX) {
      const x = v.faceX < 0 ? x0 : x1;
      ctx.fillStyle = tone(wall, R.fX * R.struct(R.L.lit(x + v.faceX * 4, ym)));
      ctx.beginPath();
      ctx.moveTo(v.px(x, y0), v.py(x, y0, H));
      ctx.lineTo(v.px(x, y1), v.py(x, y1, H));
      ctx.lineTo(v.px(x, ym), v.py(x, ym, top));
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = tone(roof, k * 1.06);
    ctx.beginPath();
    quad3(ctx, v, a, near, H, b, near, H, b, ym, top, a, ym, top);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let f = 0.33; f < 1; f += 0.33) line3(ctx, v, a, near + (ym - near) * f, H + rise * f, b, near + (ym - near) * f, H + rise * f);
    ctx.stroke();
    ctx.strokeStyle = tone(roof, k * 1.35);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    line3(ctx, v, a, ym, top, b, ym, top);
    ctx.stroke();
  } else {
    const xm = (x0 + x1) / 2;
    const near = v.faceX < 0 ? x0 - over : x1 + over;
    const far = v.faceX < 0 ? x1 + over : x0 - over;
    const a = y0 - over;
    const b = y1 + over;
    ctx.fillStyle = tone(roof, k * (v.faceX ? 0.8 : 0.92));
    ctx.beginPath();
    quad3(ctx, v, far, a, H, far, b, H, xm, b, top, xm, a, top);
    ctx.fill();
    ctx.fillStyle = tone(roof, k * (v.faceX ? 1.04 : 0.92));
    ctx.beginPath();
    quad3(ctx, v, near, a, H, near, b, H, xm, b, top, xm, a, top);
    ctx.fill();
    if (v.faceY) {
      const y = v.faceY > 0 ? y1 : y0;
      ctx.fillStyle = tone(wall, R.fY * R.struct(R.L.lit(xm, y + v.faceY * 4)));
      ctx.beginPath();
      ctx.moveTo(v.px(x0, y), v.py(x0, y, H));
      ctx.lineTo(v.px(x1, y), v.py(x1, y, H));
      ctx.lineTo(v.px(xm, y), v.py(xm, y, top));
      ctx.closePath();
      ctx.fill();
      // The verge: the roof's edge over the gable.
      ctx.strokeStyle = tone(roof, k * 1.2);
      ctx.lineWidth = Math.max(1.5, 3 * v.scale);
      ctx.beginPath();
      const ye = v.faceY > 0 ? y1 + over : y0 - over;
      line3(ctx, v, x0 - over, ye, H - 1, xm, ye, top);
      line3(ctx, v, xm, ye, top, x1 + over, ye, H - 1);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let f = 0.33; f < 1; f += 0.33) {
      line3(ctx, v, near + (xm - near) * f, a, H + rise * f, near + (xm - near) * f, b, H + rise * f);
      line3(ctx, v, far + (xm - far) * f, a, H + rise * f, far + (xm - far) * f, b, H + rise * f);
    }
    ctx.stroke();
    ctx.strokeStyle = tone(roof, k * 1.35);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    line3(ctx, v, xm, a, top, xm, b, top);
    ctx.stroke();
  }
}

/** A four-sided spire from a square at height z0 up to a point. */
function spire(R, x0, y0, x1, y1, z0, z1, color, k) {
  const { ctx, v } = R;
  if (v.flat) return;
  const xm = (x0 + x1) / 2;
  const ym = (y0 + y1) / 2;
  const tri = (ax, ay, bx, by, shade) => {
    ctx.fillStyle = tone(color, k * shade);
    ctx.beginPath();
    ctx.moveTo(v.px(ax, ay), v.py(ax, ay, z0));
    ctx.lineTo(v.px(bx, by), v.py(bx, by, z0));
    ctx.lineTo(v.px(xm, ym), v.py(xm, ym, z1));
    ctx.closePath();
    ctx.fill();
  };
  // Far sides first, then the two that look at the camera.
  tri(x0, y0, x1, y0, 0.7);
  tri(v.faceX < 0 ? x1 : x0, y0, v.faceX < 0 ? x1 : x0, y1, 0.75);
  if (v.faceX) tri(v.faceX < 0 ? x0 : x1, y0, v.faceX < 0 ? x0 : x1, y1, 0.9);
  tri(x0, v.faceY > 0 ? y1 : y0, x1, v.faceY > 0 ? y1 : y0, 1.1);
}

// --- Graveyard -----------------------------------------------------------------------------------

// Headstone outlines: [across 0..1, up 0..1], from the foot on one side round to the other.
const PROFILES = [
  [[0, 0], [0, 0.7], [0.1, 0.88], [0.3, 0.98], [0.5, 1], [0.7, 0.98], [0.9, 0.88], [1, 0.7], [1, 0]], // rounded
  [[0.34, 0], [0.34, 0.56], [0, 0.56], [0, 0.78], [0.34, 0.78], [0.34, 1], [0.66, 1], [0.66, 0.78], [1, 0.78], [1, 0.56], [0.66, 0.56], [0.66, 0]], // cross
  [[0, 0], [0, 1], [1, 1], [1, 0]], // slab
  [[0, 0], [0, 0.72], [0.5, 1], [1, 0.72], [1, 0]], // pointed
  [[0, 0], [0, 0.74], [0.2, 0.74], [0.3, 0.92], [0.5, 1], [0.7, 0.92], [0.8, 0.74], [1, 0.74], [1, 0]], // shouldered
];

/** A headstone: its outline pushed through the thickness of the stone, face to the south. */
function drawGrave(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  if (v.flat) {
    topFill(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, tone(o.color, b));
    return;
  }
  const P = PROFILES[o.v] || PROFILES[0];
  const n = P.length;
  const H = o.hgt;
  const cx = o.x + o.w / 2;
  const ca = Math.cos(o.lean || 0);
  const sa = Math.sin(o.lean || 0);
  const yf = v.faceY >= 0 ? o.y + o.h : o.y; // the face the camera sees
  const yb = v.faceY >= 0 ? o.y : o.y + o.h;
  for (let i = 0; i < n; i++) {
    const s = (P[i][0] - 0.5) * o.w;
    const z = P[i][1] * H;
    const x = cx + s * ca + z * sa;
    const zz = Math.max(0, z * ca - s * sa);
    fxs[i] = v.px(x, yf);
    fys[i] = v.py(x, yf, zz);
    bxs[i] = v.px(x, yb);
    bys[i] = v.py(x, yb, zz);
  }
  // The back and the thickness (top and sides) in one tone, the face over it.
  ctx.fillStyle = tone(o.color, b * 1.02);
  ctx.beginPath();
  ctx.moveTo(bxs[0], bys[0]);
  for (let i = 1; i < n; i++) ctx.lineTo(bxs[i], bys[i]);
  ctx.closePath();
  for (let i = 0; i < n - 1; i++) {
    ctx.moveTo(fxs[i], fys[i]);
    ctx.lineTo(fxs[i + 1], fys[i + 1]);
    ctx.lineTo(bxs[i + 1], bys[i + 1]);
    ctx.lineTo(bxs[i], bys[i]);
    ctx.closePath();
  }
  ctx.fill();
  ctx.fillStyle = tone(o.color, b * (v.faceY ? R.fY : R.fX) * 1.12);
  ctx.beginPath();
  ctx.moveTo(fxs[0], fys[0]);
  for (let i = 1; i < n; i++) ctx.lineTo(fxs[i], fys[i]);
  ctx.closePath();
  ctx.fill();
  // What it says (too small to read: two lines).
  if (o.v !== 1 && v.faceY && v.scale > 0.6 && R.alpha > 0.5 && !o.lean) {
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    line3(ctx, v, cx - o.w * 0.28, yf, H * 0.6, cx + o.w * 0.28, yf, H * 0.6);
    line3(ctx, v, cx - o.w * 0.2, yf, H * 0.44, cx + o.w * 0.2, yf, H * 0.44);
    ctx.stroke();
  }
}

/** A table tomb: a ledger on a plinth. */
function drawTomb(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  pbox(R, o.x + 4, o.y + 3, o.x + o.w - 4, o.y + o.h - 3, 0, 17, o.color, b * 0.86);
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 17, 23, o.color, b * 1.06);
  if (R.alpha > 0.5) {
    const { ctx } = R;
    R.ground(23);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(o.x + 4, o.y + 4, o.w - 8, o.h - 8);
    R.reset();
  }
}

/** An obelisk on a stepped base (or a gate pillar with a ball on top). */
function drawObelisk(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const H = o.hgt;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const c = o.color;
  if (o.pillar) {
    pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, H - 8, c, b);
    pbox(R, o.x - 2, o.y - 2, o.x + o.w + 2, o.y + o.h + 2, H - 8, H - 3, c, b * 1.1);
    ctx.fillStyle = tone(c, b * 1.15);
    ctx.beginPath();
    ball(ctx, v, cx, cy, H + 3, 7);
    ctx.fill();
    return;
  }
  const base = o.war ? 16 : 10;
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, base * 0.5, c, b * 0.9);
  const i1 = o.w * 0.14;
  pbox(R, o.x + i1, o.y + i1, o.x + o.w - i1, o.y + o.h - i1, base * 0.5, base, c, b * 0.96);
  // The shaft narrows in three steps, then the point.
  const half = o.w * 0.26;
  const steps = [[1, base, base + (H - base) * 0.4], [0.86, base + (H - base) * 0.4, base + (H - base) * 0.72], [0.72, base + (H - base) * 0.72, H * 0.93]];
  for (const [k, z0, z1] of steps) pbox(R, cx - half * k, cy - half * k, cx + half * k, cy + half * k, z0, z1, c, b * 1.04);
  spire(R, cx - half * 0.72, cy - half * 0.72, cx + half * 0.72, cy + half * 0.72, H * 0.93, H, c, b * 1.05);
  if (o.war && R.alpha > 0.5) {
    // A bronze plate on the face.
    onFaceY(R, cx - half, cy - half, cx + half, cy + half, (c2, len) => {
      c2.fillStyle = `rgba(120,96,52,${(0.75 * Math.min(1, b + 0.2)).toFixed(2)})`;
      c2.fillRect(len * 0.22, -base - 26, len * 0.56, 16);
    });
  }
}

/** A stone mausoleum: columns and a bronze door to the south, a pediment over them. */
function drawMausoleum(R, o, rec) {
  const { ctx } = R;
  const x0 = o.x;
  const y0 = o.y;
  const x1 = o.x + o.w;
  const y1 = o.y + o.h;
  const H = rec.h - 14;
  litWalls(R, x0, y0, x1, y1, 0, H, o.color);
  if (!R.v.flat && R.alpha > 0.5) {
    onFaceY(R, x0, y0, x1, y1, (c, len) => {
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.fillRect(0, -5, len, 5);
      // The door, a step, two columns either side.
      const dw = Math.min(22, len * 0.3);
      c.fillStyle = 'rgba(38,46,40,0.9)';
      c.fillRect(len / 2 - dw / 2, -36, dw, 36);
      c.fillStyle = 'rgba(150,170,150,0.25)';
      c.fillRect(len / 2 - 0.6, -34, 1.2, 32);
      c.fillStyle = 'rgba(255,255,255,0.13)';
      for (const f of [0.1, 0.28, 0.72, 0.9]) c.fillRect(len * f - 3, -H + 4, 6, H - 4);
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.fillRect(0, -H, len, 4);
    });
    onFaceX(R, x0, y0, x1, y1, (c, len) => {
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.fillRect(0, -5, len, 5);
      c.fillStyle = 'rgba(0,0,0,0.12)';
      for (let s = 16; s < len - 8; s += 22) c.fillRect(s, -H + 8, 8, H - 16);
    });
  }
  pitchedRoof(R, x0, y0, x1, y1, H, 14, 'y', '#5a5d58', o.color, 3);
  if (rec.art) {
    R.ground(H);
    for (const fn of rec.art) fn(ctx, R);
    R.reset();
  }
}

/** A columbarium wall: rows of little bronze doors. */
function drawNiche(R, o, rec) {
  const H = rec.h;
  const c = '#8b8980';
  litWalls(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, H, c);
  if (!R.v.flat && R.alpha > 0.5) {
    const face = (c2, len) => {
      c2.fillStyle = 'rgba(70,58,38,0.55)';
      for (let z = 10; z + 9 < H - 4; z += 12) for (let s = 6; s + 9 < len - 4; s += 13) if (hash01(o.seed + s * 0.37 + z) > 0.1) c2.fillRect(s, -z - 9, 9, 9);
    };
    onFaceY(R, o.x, o.y, o.x + o.w, o.y + o.h, face);
    onFaceX(R, o.x, o.y, o.x + o.w, o.y + o.h, face);
  }
  topFill(R, o.x - 1, o.y - 1, o.x + o.w + 1, o.y + o.h + 1, H, tone(c, R.roofK * 1.15));
}

/** A heap of earth. */
function drawMound(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const rr = Math.min(o.w, o.h) / 2;
  ctx.fillStyle = tone('#2e2419', b);
  ctx.beginPath();
  disc(ctx, v, cx, cy, rr * 1.15, 0);
  ctx.fill();
  ctx.fillStyle = tone('#3d3022', b);
  ctx.beginPath();
  ball(ctx, v, cx - o.w * 0.16, cy + 2, 7, rr * 0.7);
  ball(ctx, v, cx + o.w * 0.18, cy - 2, 8, rr * 0.66);
  ctx.fill();
  ctx.fillStyle = tone('#4a3a29', b);
  ctx.beginPath();
  ball(ctx, v, cx, cy - 1, 14, rr * 0.55);
  ctx.fill();
}

/** A small excavator: tracks, the house, the arm folded out to the bucket. */
function drawDigger(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const dir = o.a ? -1 : 1;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  pbox(R, o.x + 2, o.y, o.x + o.w - 2, o.y + 10, 0, 12, '#1c1d1f', b);
  pbox(R, o.x + 2, o.y + o.h - 10, o.x + o.w - 2, o.y + o.h, 0, 12, '#1c1d1f', b);
  pbox(R, cx - 22, o.y + 5, cx + 22, o.y + o.h - 5, 12, 30, '#c79a22', b);
  pbox(R, cx - dir * 4 - 9, o.y + 8, cx - dir * 4 + 9, cy + 2, 30, 46, '#2a3440', b);
  if (v.flat) return;
  ctx.strokeStyle = tone('#b88a1c', b);
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, 5 * v.scale);
  ctx.beginPath();
  limb(ctx, v, cx + dir * 12, cy + 8, 30, cx + dir * 34, cy + 8, 58);
  limb(ctx, v, cx + dir * 34, cy + 8, 58, cx + dir * 52, cy + 8, 20);
  ctx.stroke();
  pbox(R, cx + dir * 52 - 7, cy + 1, cx + dir * 52 + 7, cy + 15, 4, 18, '#3a3c40', b);
}

/** Iron railings: bars, two rails, spear points. */
function drawIronFence(R, o) {
  const { ctx, v } = R;
  const b = Math.max(R.L.lit(o.x + o.w / 2, o.y + o.h / 2), 0);
  if (b < 0.032) return;
  const H = 36;
  const horiz = o.w > o.h;
  const xm = o.x + o.w / 2;
  const ym = o.y + o.h / 2;
  if (v.flat) {
    topFill(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, tone('#3a3d42', b * 0.8));
    return;
  }
  ctx.strokeStyle = tone('#2a2c30', Math.max(b, 0.12) * 1.5);
  ctx.lineCap = 'butt';
  ctx.lineWidth = Math.max(1, 1.3 * v.scale);
  ctx.beginPath();
  const len = horiz ? o.w : o.h;
  const n = Math.max(2, Math.round(len / 9));
  for (let i = 0; i <= n; i++) {
    const p = (i / n) * len;
    if (horiz) line3(ctx, v, o.x + p, ym, 0, o.x + p, ym, H + (i % 4 ? 0 : 4));
    else line3(ctx, v, xm, o.y + p, 0, xm, o.y + p, H + (i % 4 ? 0 : 4));
  }
  ctx.stroke();
  ctx.lineWidth = Math.max(1, 2 * v.scale);
  ctx.beginPath();
  for (const z of [7, H - 5]) {
    if (horiz) line3(ctx, v, o.x, ym, z, o.x + o.w, ym, z);
    else line3(ctx, v, xm, o.y, z, xm, o.y + o.h, z);
  }
  ctx.stroke();
  ctx.lineCap = 'round';
}

/** A bare tree: the trunk and what is left of the branches. */
function drawDeadTree(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const s = o.w / 36;
  const sd = o.seed || 1;
  cylinder(ctx, v, cx, cy, 5 * s, 0, 40 * s, tone('#3a3029', b), tone('#2e2620', b * 0.9));
  if (v.flat) return;
  ctx.strokeStyle = tone('#3a3029', b);
  ctx.lineCap = 'round';
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + hash01(sd + k) * 1.2;
    const reach = (16 + hash01(sd + k * 3.1) * 16) * s;
    const z0 = (30 + k * 3) * s;
    const z1 = z0 + (14 + hash01(sd + k * 7.7) * 20) * s;
    const ex = cx + Math.cos(a) * reach;
    const ey = cy + Math.sin(a) * reach * 0.8;
    ctx.lineWidth = Math.max(1, 3.4 * s * v.scale);
    ctx.beginPath();
    limb(ctx, v, cx, cy, z0, ex, ey, z1);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, 1.6 * s * v.scale);
    ctx.beginPath();
    limb(ctx, v, ex, ey, z1, ex + Math.cos(a + 0.7) * reach * 0.6, ey + Math.sin(a + 0.7) * reach * 0.5, z1 + 12 * s);
    limb(ctx, v, ex, ey, z1, ex + Math.cos(a - 0.6) * reach * 0.5, ey + Math.sin(a - 0.6) * reach * 0.4, z1 + 8 * s);
    ctx.stroke();
  }
}

/** A weeping willow: a wide crown that hangs. */
function drawWillow(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const s = o.w / 36;
  const sway = Math.sin(R.t * 0.6 + (o.seed || 1)) * 1.6;
  cylinder(ctx, v, cx, cy, 5 * s, 0, 30 * s, tone('#3b2c20', b), tone('#33261c', b * 0.9));
  ctx.fillStyle = tone('#1c2e1c', b);
  ctx.beginPath();
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    ball(ctx, v, cx + Math.cos(a) * 24 * s + sway, cy + Math.sin(a) * 20 * s, 26 * s, 13 * s);
  }
  ctx.fill();
  ctx.fillStyle = tone('#2c4a2c', b);
  ctx.beginPath();
  ball(ctx, v, cx + sway * 0.5, cy, 48 * s, 26 * s);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.4;
    ball(ctx, v, cx + Math.cos(a) * 18 * s + sway, cy + Math.sin(a) * 15 * s, 40 * s, 14 * s);
  }
  ctx.fill();
  ctx.fillStyle = tone('#3a5f38', b);
  ctx.beginPath();
  ball(ctx, v, cx - 4 * s + sway * 0.5, cy - 5 * s, 58 * s, 14 * s);
  ctx.fill();
}

const CHAPEL_STONE = '#8d8a80';

/** The chapel: stone walls, lancet windows, a steep slate roof, the gable and its door to the south. */
function drawChapel(R, o, rec) {
  const x0 = o.x;
  const y0 = o.y;
  const x1 = o.x + o.w;
  const y1 = o.y + o.h;
  const H = 62;
  const night = R.night;
  litWalls(R, x0, y0, x1, y1, 0, H, CHAPEL_STONE);
  if (!R.v.flat && R.alpha > 0.5) {
    onFaceX(R, x0, y0, x1, y1, (c, len) => {
      c.fillStyle = 'rgba(0,0,0,0.22)';
      c.fillRect(0, -6, len, 6);
      for (let s = 26; s + 14 < len - 16; s += 46) {
        c.fillStyle = night ? 'rgba(255,190,110,0.5)' : 'rgba(16,22,34,0.6)';
        c.beginPath();
        c.moveTo(s, -14);
        c.lineTo(s, -40);
        c.lineTo(s + 7, -50);
        c.lineTo(s + 14, -40);
        c.lineTo(s + 14, -14);
        c.closePath();
        c.fill();
        // Buttresses between them.
        c.fillStyle = 'rgba(0,0,0,0.14)';
        c.fillRect(s + 24, -H, 7, H);
      }
    });
    onFaceY(R, x0, y0, x1, y1, (c, len) => {
      c.fillStyle = 'rgba(0,0,0,0.22)';
      c.fillRect(0, -6, len, 6);
      // The west door (it faces south here), pointed, with its step.
      c.fillStyle = 'rgba(40,26,18,0.92)';
      c.beginPath();
      c.moveTo(len / 2 - 16, 0);
      c.lineTo(len / 2 - 16, -34);
      c.lineTo(len / 2, -48);
      c.lineTo(len / 2 + 16, -34);
      c.lineTo(len / 2 + 16, 0);
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(160,130,80,0.35)';
      c.fillRect(len / 2 - 0.7, -44, 1.4, 44);
      for (const f of [0.2, 0.8]) {
        c.fillStyle = night ? 'rgba(255,190,110,0.45)' : 'rgba(16,22,34,0.6)';
        c.beginPath();
        c.moveTo(len * f - 6, -14);
        c.lineTo(len * f - 6, -38);
        c.lineTo(len * f, -47);
        c.lineTo(len * f + 6, -38);
        c.lineTo(len * f + 6, -14);
        c.closePath();
        c.fill();
      }
    });
  }
  const rise = 54;
  pitchedRoof(R, x0, y0, x1, y1, H, rise, 'y', o.color, CHAPEL_STONE, 5);
  // The rose window in the gable.
  const { ctx, v } = R;
  if (!v.flat && v.faceY && R.alpha > 0.5) {
    const y = v.faceY > 0 ? y1 : y0;
    const xm = (x0 + x1) / 2;
    const sx = v.px(xm, y);
    const sy = v.py(xm, y, H + rise * 0.3);
    const rr = 13 * v.scale;
    ctx.fillStyle = night ? 'rgba(255,170,110,0.75)' : 'rgba(22,28,44,0.75)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, rr, rr * v.cp, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,26,22,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx - rr, sy);
    ctx.lineTo(sx + rr, sy);
    ctx.moveTo(sx, sy - rr * v.cp);
    ctx.lineTo(sx, sy + rr * v.cp);
    ctx.stroke();
  }
}

/** The bell tower: louvres up top, a slate spire. */
function drawSteeple(R, o) {
  const x0 = o.x;
  const y0 = o.y;
  const x1 = o.x + o.w;
  const y1 = o.y + o.h;
  const H = 122;
  litWalls(R, x0, y0, x1, y1, 0, H, CHAPEL_STONE);
  if (!R.v.flat && R.alpha > 0.5) {
    const face = (c, len) => {
      c.fillStyle = 'rgba(0,0,0,0.22)';
      c.fillRect(0, -6, len, 6);
      c.fillStyle = 'rgba(14,16,20,0.7)';
      c.fillRect(len / 2 - 8, -H + 14, 16, 26);
      c.fillStyle = 'rgba(255,255,255,0.1)';
      for (let z = 18; z < 38; z += 6) c.fillRect(len / 2 - 8, -H + z, 16, 1.5);
      c.fillStyle = 'rgba(16,22,34,0.55)';
      c.fillRect(len / 2 - 4, -70, 8, 22);
    };
    onFaceX(R, x0, y0, x1, y1, face);
    onFaceY(R, x0, y0, x1, y1, face);
  }
  topFill(R, x0 - 2, y0 - 2, x1 + 2, y1 + 2, H, tone(CHAPEL_STONE, R.roofK * 1.05));
  spire(R, x0 + 2, y0 + 2, x1 - 2, y1 - 2, H, H + 62, o.color, R.roofK);
}

/** An old lantern on a post. */
function drawLantern(R, p) {
  const { ctx, v } = R;
  const b = R.struct(R.L.lit(p.x, p.y)) * 0.9;
  const on = lampLit(p.lamp, R.t);
  if (v.flat) {
    ctx.fillStyle = on && R.night ? '#ffd9a0' : tone('#3a3d42', b);
    ctx.beginPath();
    disc(ctx, v, p.x, p.y, 4, 0);
    ctx.fill();
    return;
  }
  ctx.strokeStyle = tone('#2f3236', Math.max(b, 0.2));
  ctx.lineCap = 'butt';
  ctx.lineWidth = Math.max(1.5, 3 * v.scale);
  ctx.beginPath();
  line3(ctx, v, p.x, p.y, 0, p.x, p.y, 50);
  ctx.stroke();
  ctx.lineCap = 'round';
  box(ctx, v, p.x - 4.5, p.y - 4.5, p.x + 4.5, p.y + 4.5, 50, 62, on && R.night ? '#ffe2ae' : tone('#565a60', b), on && R.night ? '#ffc97a' : tone('#44484e', b), on && R.night ? '#ffd592' : tone('#4c5056', b));
  box(ctx, v, p.x - 6, p.y - 6, p.x + 6, p.y + 6, 62, 65, tone('#2a2c30', Math.max(b, 0.25)), tone('#222428', Math.max(b, 0.25)), tone('#26282c', Math.max(b, 0.25)));
}

// --- Suburbia ---------------------------------------------------------------------------------------

/** Windows along a house wall: len long, one row per storey; boarded ones get planks. */
function houseWindows(c, len, storeys, seed, boarded, lit, skipFrom = -1, skipTo = -1) {
  const n = Math.max(1, Math.floor((len - 20) / 46));
  const x0 = (len - (n - 1) * 46 - 18) / 2;
  for (let f = 0; f < storeys; f++) {
    const z = 30 + f * 28;
    for (let k = 0; k < n; k++) {
      const x = x0 + k * 46;
      if (f === 0 && x + 18 > skipFrom && x < skipTo) continue;
      const on = lit && hash01(seed + k * 3.3 + f * 7.7) < 0.07;
      c.fillStyle = on ? 'rgba(255,196,112,0.75)' : 'rgba(12,18,28,0.6)';
      c.fillRect(x, -z, 18, 18);
      c.fillStyle = 'rgba(255,255,255,0.22)';
      c.fillRect(x - 1.5, -z - 1.5, 21, 1.5);
      c.fillRect(x - 1.5, -z + 18, 21, 1.5);
      if (boarded && f === 0) {
        c.fillStyle = 'rgba(122,92,56,0.9)';
        c.fillRect(x - 3, -z + 3, 24, 4);
        c.fillRect(x - 3, -z + 11, 24, 4);
      }
    }
  }
}

/** A house: siding, a pitched roof along the street, the porch and front door on its street side. */
function drawHouse(R, o, rec) {
  const { ctx, v } = R;
  const x0 = o.x;
  const y0 = o.y;
  const x1 = o.x + o.w;
  const y1 = o.y + o.h;
  const H = rec.data.wallH;
  const rise = rec.data.rise;
  const front = (o.facing === 's') === (v.faceY > 0); // is the wall the camera sees the front?
  litWalls(R, x0, y0, x1, y1, 0, H, o.siding);
  if (!v.flat && R.alpha > 0.5) {
    const seed = (o.seed || 1) * 0.017;
    onFaceY(R, x0, y0, x1, y1, (c, len) => {
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.fillRect(0, -5, len, 5);
      const doors = o.twin ? [0.27, 0.73] : [0.5];
      if (front) {
        for (const f of doors) {
          const dx = len * f;
          c.fillStyle = o.boarded ? 'rgba(96,72,44,0.95)' : 'rgba(58,34,28,0.92)';
          c.fillRect(dx - 8, -30, 16, 30);
          c.fillStyle = 'rgba(255,255,255,0.3)';
          c.fillRect(dx - 10, -32, 20, 2);
          if (o.boarded) {
            c.fillStyle = 'rgba(140,108,66,0.95)';
            c.fillRect(dx - 12, -22, 24, 4);
            c.fillRect(dx - 12, -12, 24, 4);
          }
        }
        houseWindows(c, len, o.storeys, seed, o.boarded, R.night, len * doors[0] - 22, len * doors[doors.length - 1] + 22);
        if (o.twin) {
          c.fillStyle = 'rgba(0,0,0,0.25)';
          c.fillRect(len / 2 - 0.75, -H, 1.5, H);
        }
      } else {
        // The back: a door at one end, windows, the meter.
        c.fillStyle = 'rgba(40,40,44,0.85)';
        c.fillRect(len * 0.14, -28, 14, 28);
        houseWindows(c, len, o.storeys, seed + 5, o.boarded, R.night, len * 0.14 - 8, len * 0.14 + 22);
      }
    });
    onFaceX(R, x0, y0, x1, y1, (c, len) => {
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.fillRect(0, -5, len, 5);
      houseWindows(c, len, o.storeys, seed + 9, o.boarded, R.night);
    });
    wallPosters(R, o, rec);
  }
  pitchedRoof(R, x0, y0, x1, y1, H, rise, o.w >= o.h ? 'x' : 'y', o.color, o.siding, 6);
  if (v.flat) return;
  if (o.chimney) {
    const cx = x0 + o.w * (0.2 + 0.6 * hash01(o.seed + 2));
    const cy = (y0 + y1) / 2 + (o.facing === 's' ? -10 : 10);
    pbox(R, cx - 7, cy - 6, cx + 7, cy + 6, H + rise * 0.5, H + rise + 12, '#6d4a40', R.roofK);
  }
  // The porch: a slab, two posts and a little roof over the front door.
  if (front && R.alpha > 0.5) {
    const b = R.struct(R.L.lit((x0 + x1) / 2, v.faceY > 0 ? y1 + 16 : y0 - 16));
    const yf = v.faceY > 0 ? y1 : y0;
    const out = v.faceY > 0 ? 1 : -1;
    for (const f of o.twin ? [0.27, 0.73] : [0.5]) {
      const px = x0 + o.w * f;
      const ya = Math.min(yf, yf + out * 16);
      const yb = Math.max(yf, yf + out * 16);
      pbox(R, px - 24, ya, px + 24, yb, 0, 5, '#8d8b84', b);
      ctx.strokeStyle = tone('#e4e0d6', b);
      ctx.lineWidth = Math.max(1, 2.2 * v.scale);
      ctx.beginPath();
      line3(ctx, v, px - 21, yf + out * 14, 5, px - 21, yf + out * 14, 36);
      line3(ctx, v, px + 21, yf + out * 14, 5, px + 21, yf + out * 14, 36);
      ctx.stroke();
      pbox(R, px - 26, ya, px + 26, yb + (out > 0 ? 2 : 0), 36, 40, o.color, R.roofK * 1.1);
    }
  }
}

/** A garage or a garden shed: low walls, a roof, the door on its open side. */
function drawOuthouse(R, o, rec) {
  const { v } = R;
  const x0 = o.x;
  const y0 = o.y;
  const x1 = o.x + o.w;
  const y1 = o.y + o.h;
  const H = rec.data.wallH;
  litWalls(R, x0, y0, x1, y1, 0, H, o.siding);
  if (!v.flat && R.alpha > 0.5) {
    const front = (o.facing === 's') === (v.faceY > 0);
    onFaceY(R, x0, y0, x1, y1, (c, len) => {
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.fillRect(0, -4, len, 4);
      if (!front) return;
      if (o.garage) {
        // The up-and-over door: panels.
        c.fillStyle = 'rgba(232,230,222,0.9)';
        c.fillRect(8, -H + 6, len - 16, H - 6);
        c.fillStyle = 'rgba(0,0,0,0.16)';
        for (let z = 8; z < H - 6; z += 7) c.fillRect(8, -z, len - 16, 1.2);
      } else {
        c.fillStyle = 'rgba(40,30,22,0.85)';
        c.fillRect(len / 2 - 9, -H + 4, 18, H - 4);
      }
    });
  }
  pitchedRoof(R, x0, y0, x1, y1, H, rec.data.rise, o.w >= o.h ? 'x' : 'y', o.color, o.siding, 4);
}

const AWNINGS = ['#a8322c', '#2a5f8a', '#2e7d4a', '#c9a227', '#7a3f8a', '#c66a2c', '#2d7f86', '#8a8f96', '#b0486a'];

/** The strip mall: brick, a row of shop fronts with their sign bands to the south, a flat roof. */
function drawMall(R, o, rec) {
  const { ctx, v } = R;
  const x0 = o.x;
  const y0 = o.y;
  const x1 = o.x + o.w;
  const y1 = o.y + o.h;
  const H = rec.h;
  litWalls(R, x0, y0, x1, y1, 0, H, '#6b5a4c');
  if (!v.flat && R.alpha > 0.5) {
    const units = Math.max(1, Math.round(o.w / 150));
    onFaceY(R, x0, y0, x1, y1, (c, len) => {
      const uw = len / units;
      for (let k = 0; k < units; k++) {
        const gx = Math.round((o.x + k * uw) / 150); // the same shop keeps its colour if the building is carved up
        c.fillStyle = 'rgba(14,22,32,0.7)';
        c.fillRect(k * uw + 8, -30, uw - 16, 26);
        c.fillStyle = 'rgba(30,30,34,0.9)';
        c.fillRect(k * uw + uw / 2 - 8, -30, 16, 30);
        c.fillStyle = AWNINGS[(gx + (o.seed || 0)) % AWNINGS.length];
        c.globalAlpha = 0.85;
        c.fillRect(k * uw + 5, -44, uw - 10, 11);
        c.globalAlpha = 1;
        c.fillStyle = 'rgba(255,255,255,0.55)';
        c.fillRect(k * uw + uw * 0.25, -40, uw * 0.5, 3);
      }
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.fillRect(0, -4, len, 4);
    });
    onFaceX(R, x0, y0, x1, y1, (c, len) => {
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.fillRect(0, -4, len, 4);
      c.fillStyle = 'rgba(12,12,14,0.6)';
      c.fillRect(len * 0.4, -30, 18, 30);
    });
    wallPosters(R, o, rec);
  }
  topFill(R, x0, y0, x1, y1, H, tone(o.color, R.roofK * 1.1));
  topFill(R, x0 + 5, y0 + 5, x1 - 5, y1 - 5, H, tone(o.color, R.roofK * 0.9));
  for (let k = 0, n = o.vents || 0; k < n; k++) {
    const w = 20 + hash01(o.seed + k) * 14;
    const x = o.x + 14 + hash01(o.seed + k * 7.31) * Math.max(1, o.w - 28 - w);
    const y = o.y + 14 + hash01(o.seed + k * 3.17 + 11) * Math.max(1, o.h - 44);
    pbox(R, x, y, x + w, y + 16, H, H + 10, '#686c73', R.roofK * 0.95);
  }
  if (rec.art) {
    R.ground(H);
    for (const fn of rec.art) fn(ctx, R);
    R.reset();
  }
}

function drawPlankFence(R, o) {
  const { ctx, v } = R;
  const b = Math.max(R.L.lit(o.x + o.w / 2, o.y + o.h / 2), 0);
  if (b < 0.032) return;
  const picket = o.style === 'picket';
  const H = picket ? 24 : 40;
  const color = picket ? '#dedbd0' : '#6e5a44';
  const horiz = o.w > o.h;
  const xm = o.x + o.w / 2;
  const ym = o.y + o.h / 2;
  if (v.flat) {
    topFill(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, tone(color, b * 0.85));
    return;
  }
  if (!picket) {
    // A board fence: one sheet, the gaps between boards, a cap.
    ctx.fillStyle = tone(color, b * (horiz ? R.fY : R.fX) * 1.1);
    ctx.beginPath();
    if (horiz) quad3(ctx, v, o.x, ym, 0, o.x + o.w, ym, 0, o.x + o.w, ym, H, o.x, ym, H);
    else quad3(ctx, v, xm, o.y, 0, xm, o.y + o.h, 0, xm, o.y + o.h, H, xm, o.y, H);
    ctx.fill();
  }
  ctx.strokeStyle = picket ? tone(color, b) : 'rgba(0,0,0,0.22)';
  ctx.lineCap = 'butt';
  ctx.lineWidth = Math.max(1, (picket ? 2.4 : 1) * v.scale);
  ctx.beginPath();
  const len = horiz ? o.w : o.h;
  const n = Math.max(2, Math.round(len / (picket ? 8 : 10)));
  for (let i = 0; i <= n; i++) {
    const p = (i / n) * len;
    if (horiz) line3(ctx, v, o.x + p, ym, 0, o.x + p, ym, H);
    else line3(ctx, v, xm, o.y + p, 0, xm, o.y + p, H);
  }
  ctx.stroke();
  ctx.strokeStyle = tone(color, b * 1.15);
  ctx.lineWidth = Math.max(1, 2 * v.scale);
  ctx.beginPath();
  for (const z of picket ? [7, 17] : [H]) {
    if (horiz) line3(ctx, v, o.x, ym, z, o.x + o.w, ym, z);
    else line3(ctx, v, xm, o.y, z, xm, o.y + o.h, z);
  }
  ctx.stroke();
  ctx.lineCap = 'round';
}

/** Backyard and playground equipment. */
function drawPlayset(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  if (o.play === 'trampoline') {
    const rr = o.w / 2 - 2;
    cylinder(ctx, v, cx, cy, rr, 0, 13, tone('#2c4a7a', b), tone('#3a3d42', b * 0.8));
    ctx.fillStyle = tone('#15161a', b);
    ctx.beginPath();
    disc(ctx, v, cx, cy, rr - 6, 13);
    ctx.fill();
    return;
  }
  if (o.play === 'merry') {
    const rr = o.w / 2 - 2;
    cylinder(ctx, v, cx, cy, rr, 0, 7, tone('#a8322c', b), tone('#7c2520', b * 0.85));
    ctx.strokeStyle = tone('#d9d6c8', b);
    ctx.lineWidth = Math.max(1, 2 * v.scale);
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      line3(ctx, v, cx, cy, 7, cx, cy, 24);
      line3(ctx, v, cx, cy, 24, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 20);
      line3(ctx, v, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 20, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 7);
    }
    ctx.stroke();
    return;
  }
  if (o.play === 'climber') {
    // A deck on posts with a roof, and the slide coming off it.
    const d0 = o.x + 4;
    const d1 = o.x + 44;
    for (const [px, py] of [[d0, o.y + 4], [d1, o.y + 4], [d0, o.y + o.h - 4], [d1, o.y + o.h - 4]]) pbox(R, px - 2, py - 2, px + 2, py + 2, 0, 44, '#7b5a3c', b);
    pbox(R, d0, o.y + 4, d1, o.y + o.h - 4, 22, 25, '#8c6a44', b);
    ctx.fillStyle = tone('#d9a21c', b);
    ctx.beginPath();
    quad3(ctx, v, d1, cy - 9, 24, o.x + o.w, cy - 9, 2, o.x + o.w, cy + 9, 2, d1, cy + 9, 24);
    ctx.fill();
    pbox(R, d0 - 3, o.y + 1, d1 + 3, o.y + o.h - 1, 44, 47, '#2e7d4a', b * 1.05);
    return;
  }
  // Swings: two A-frames, a bar, the seats on their chains.
  const horiz = o.w >= o.h;
  const A = horiz ? [o.x + 3, o.x + o.w - 3] : [o.y + 3, o.y + o.h - 3];
  const m = horiz ? cy : cx;
  const sp = (horiz ? o.h : o.w) / 2 - 2;
  ctx.strokeStyle = tone('#7d858c', b);
  ctx.lineWidth = Math.max(1, 2.4 * v.scale);
  ctx.beginPath();
  for (const a of A) {
    if (horiz) {
      line3(ctx, v, a, m - sp, 0, a, m, 44);
      line3(ctx, v, a, m + sp, 0, a, m, 44);
    } else {
      line3(ctx, v, m - sp, a, 0, m, a, 44);
      line3(ctx, v, m + sp, a, 0, m, a, 44);
    }
  }
  if (horiz) line3(ctx, v, A[0], m, 44, A[1], m, 44);
  else line3(ctx, v, m, A[0], 44, m, A[1], 44);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, 1 * v.scale);
  for (const f of [0.33, 0.67]) {
    const p = A[0] + (A[1] - A[0]) * f;
    const sw = Math.sin(R.t * 1.4 + p) * 5;
    ctx.strokeStyle = tone('#9aa0a6', b);
    ctx.beginPath();
    if (horiz) {
      line3(ctx, v, p - 5, m, 44, p - 5, m + sw, 12);
      line3(ctx, v, p + 5, m, 44, p + 5, m + sw, 12);
    } else {
      line3(ctx, v, m, p - 5, 44, m + sw, p - 5, 12);
      line3(ctx, v, m, p + 5, 44, m + sw, p + 5, 12);
    }
    ctx.stroke();
    if (horiz) pbox(R, p - 6, m + sw - 3, p + 6, m + sw + 3, 11, 13, '#a8322c', b);
    else pbox(R, m + sw - 3, p - 6, m + sw + 3, p + 6, 11, 13, '#a8322c', b);
  }
}

/** A school bus, abandoned. */
function drawBus(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const horiz = o.w >= o.h;
  const len = horiz ? o.w : o.h;
  const c = o.color;
  const part = (a0, a1, inset, z0, z1, color, k = 1) => {
    const f0 = o.front > 0 ? 1 - a1 : a0;
    const f1 = o.front > 0 ? 1 - a0 : a1;
    if (horiz) pbox(R, o.x + len * f0, o.y + inset, o.x + len * f1, o.y + o.h - inset, z0, z1, color, b * k);
    else pbox(R, o.x + inset, o.y + len * f0, o.x + o.w - inset, o.y + len * f1, z0, z1, color, b * k);
  };
  part(0.03, 0.97, 3, 0, 9, '#141518');
  part(0.14, 1, 1, 8, 46, c);
  part(0, 0.14, 5, 8, 26, c, 0.95);
  part(0.16, 0.98, 0, 28, 38, '#1b2430');
  part(0.14, 1, 2, 46, 48, '#e2ae24', 1.08);
  if (v.flat || R.alpha <= 0.5) return;
  const stripe = (c2, l) => {
    c2.fillStyle = 'rgba(16,16,18,0.8)';
    c2.fillRect(l * 0.16, -22, l * 0.82, 2.5);
    c2.fillRect(l * 0.16, -15, l * 0.82, 2);
  };
  if (horiz) onFaceY(R, o.x, o.y, o.x + o.w, o.y + o.h, (c2, l, fwd) => { if ((o.front > 0) === fwd) { c2.save(); c2.translate(l, 0); c2.scale(-1, 1); stripe(c2, l); c2.restore(); } else stripe(c2, l); });
  else onFaceX(R, o.x, o.y, o.x + o.w, o.y + o.h, (c2, l) => stripe(c2, l));
  void ctx;
}

/** A light by a front door. */
function drawPorchLight(R, p) {
  const { ctx, v } = R;
  if (v.flat) return;
  const on = lampLit(p.lamp, R.t) && R.night;
  const b = R.struct(R.L.lit(p.x, p.y));
  ctx.fillStyle = on ? '#ffe2ae' : tone('#55585d', b);
  ctx.beginPath();
  ball(ctx, v, p.x, p.y + (p.lamp.wall || 0) * 8, 27, 2.6);
  ctx.fill();
}

function mailbox(R, p) {
  const b = lit(R, p);
  if (b < 0.032) return;
  const { ctx, v } = R;
  ctx.strokeStyle = tone('#5a4632', b);
  ctx.lineWidth = Math.max(1, 2 * v.scale);
  ctx.beginPath();
  line3(ctx, v, p.x, p.y, 0, p.x, p.y, 15);
  ctx.stroke();
  pbox(R, p.x - 3.5, p.y - 5, p.x + 3.5, p.y + 5, 15, 21, hash01(p.x) > 0.5 ? '#2a2c30' : '#b9b9b0', b);
  pbox(R, p.x + 3.5, p.y - 1, p.x + 4.5, p.y + 1, 17, 23, '#a8322c', b);
}

function bins(R, p) {
  const b = lit(R, p);
  if (b < 0.032) return;
  const cols = ['#2f4a34', '#2a4f8a', '#3a3d42'];
  for (let k = 0; k < (p.d.n || 1); k++) pbox(R, p.x - 7 + k * 16 - 8, p.y - 7, p.x + 7 + k * 16 - 8, p.y + 7, 0, 22, cols[k % 3], b);
}

function bush(R, p) {
  const b = lit(R, p);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const s = p.d.s || 1;
  ctx.fillStyle = tone('#1f3a22', b);
  ctx.beginPath();
  ball(ctx, v, p.x - 4 * s, p.y, 7 * s, 8 * s);
  ball(ctx, v, p.x + 5 * s, p.y + 1, 8 * s, 8 * s);
  ctx.fill();
  ctx.fillStyle = tone('#2d5231', b);
  ctx.beginPath();
  ball(ctx, v, p.x, p.y - 1, 12 * s, 7 * s);
  ctx.fill();
}

const SIGN_COLORS = [['#1f3f7a', '#ffd400'], ['#a8322c', '#ffffff'], ['#e9e6dc', '#2a5f8a']];
function yardsign(R, p) {
  const b = lit(R, p);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const [bg, fg] = SIGN_COLORS[p.d.c % SIGN_COLORS.length];
  ctx.strokeStyle = tone('#9aa0a6', b);
  ctx.lineWidth = Math.max(1, 1.2 * v.scale);
  ctx.beginPath();
  line3(ctx, v, p.x - 9, p.y, 0, p.x - 9, p.y, 10);
  line3(ctx, v, p.x + 9, p.y, 0, p.x + 9, p.y, 10);
  ctx.stroke();
  ctx.fillStyle = tone(bg, b);
  ctx.beginPath();
  quad3(ctx, v, p.x - 13, p.y, 9, p.x + 13, p.y, 9, p.x + 13, p.y, 24, p.x - 13, p.y, 24);
  ctx.fill();
  ctx.fillStyle = tone(fg, b);
  ctx.beginPath();
  quad3(ctx, v, p.x - 9, p.y, 17, p.x + 9, p.y, 17, p.x + 9, p.y, 20, p.x - 9, p.y, 20);
  quad3(ctx, v, p.x - 6, p.y, 12, p.x + 6, p.y, 12, p.x + 6, p.y, 14, p.x - 6, p.y, 14);
  ctx.fill();
}

function flamingo(R, p) {
  const b = lit(R, p);
  if (b < 0.032) return;
  const { ctx, v } = R;
  ctx.strokeStyle = tone('#2a2c30', b);
  ctx.lineWidth = Math.max(1, 1 * v.scale);
  ctx.beginPath();
  line3(ctx, v, p.x, p.y, 0, p.x, p.y, 12);
  ctx.stroke();
  ctx.fillStyle = tone('#ef6fb0', b);
  ctx.beginPath();
  ball(ctx, v, p.x, p.y, 14, 4);
  ball(ctx, v, p.x + 4, p.y, 21, 2);
  ctx.fill();
  ctx.strokeStyle = tone('#ef6fb0', b);
  ctx.lineWidth = Math.max(1, 1.4 * v.scale);
  ctx.beginPath();
  line3(ctx, v, p.x + 2, p.y, 15, p.x + 4, p.y, 21);
  ctx.stroke();
}

function grill(R, p) {
  const b = lit(R, p);
  if (b < 0.032) return;
  const { ctx, v } = R;
  ctx.strokeStyle = tone('#3a3d42', b);
  ctx.lineWidth = Math.max(1, 1.4 * v.scale);
  ctx.beginPath();
  for (const [dx, dy] of [[-5, -4], [5, -4], [0, 5]]) line3(ctx, v, p.x + dx, p.y + dy, 0, p.x, p.y, 16);
  ctx.stroke();
  cylinder(ctx, v, p.x, p.y, 8, 16, 22, tone('#1c1d20', b), tone('#141518', b));
  ctx.fillStyle = tone('#26282c', b);
  ctx.beginPath();
  ball(ctx, v, p.x, p.y, 24, 7);
  ctx.fill();
}

function doghouse(R, p) {
  const b = lit(R, p);
  if (b < 0.032) return;
  pbox(R, p.x - 13, p.y - 11, p.x + 13, p.y + 11, 0, 16, '#8c5a3c', b);
  const save = R.cur;
  R.cur = { data: { wall: '#8c5a3c' } };
  pitchedRoof(R, p.x - 13, p.y - 11, p.x + 13, p.y + 11, 16, 9, 'y', '#5a2f24', '#8c5a3c', 3, Math.max(b, 0.1));
  R.cur = save;
  if (!R.v.flat) {
    onFaceY(R, p.x - 13, p.y - 11, p.x + 13, p.y + 11, (c, len) => {
      c.fillStyle = 'rgba(12,10,8,0.9)';
      c.fillRect(len / 2 - 5, -12, 10, 12);
    });
  }
}

function cart(R, p) {
  const b = lit(R, p);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const a = p.d.a || 0;
  const ca = Math.cos(a) * 9;
  const sa = Math.sin(a) * 9;
  ctx.strokeStyle = tone('#aeb4ba', b);
  ctx.lineWidth = Math.max(1, 1.2 * v.scale);
  ctx.beginPath();
  for (const z of [9, 19]) {
    line3(ctx, v, p.x - ca - sa * 0.6, p.y - sa + ca * 0.6, z, p.x + ca - sa * 0.6, p.y + sa + ca * 0.6, z);
    line3(ctx, v, p.x + ca - sa * 0.6, p.y + sa + ca * 0.6, z, p.x + ca + sa * 0.6, p.y + sa - ca * 0.6, z);
    line3(ctx, v, p.x + ca + sa * 0.6, p.y + sa - ca * 0.6, z, p.x - ca + sa * 0.6, p.y - sa - ca * 0.6, z);
    line3(ctx, v, p.x - ca + sa * 0.6, p.y - sa - ca * 0.6, z, p.x - ca - sa * 0.6, p.y - sa + ca * 0.6, z);
  }
  for (const [ex, ey] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) line3(ctx, v, p.x + ex * ca - ey * sa * 0.6, p.y + ex * sa + ey * ca * 0.6, 3, p.x + ex * ca - ey * sa * 0.6, p.y + ex * sa + ey * ca * 0.6, 19);
  ctx.stroke();
}

// --- Junkyard -----------------------------------------------------------------------------------------

const RUSTS = ['#6d2e2e', '#2e4a6d', '#6b6b6b', '#3f5f3a', '#8a7b52', '#4a3a5c', '#3a3a3c', '#7a4a22', '#9a9a94', '#7c3a2a', '#5a6a70', '#6b4a34'];
const rust = (seed) => RUSTS[Math.floor(hash01(seed) * RUSTS.length) % RUSTS.length];

/** A stack of flattened cars: slabs of them, the top layer car by car. */
function drawWrecks(R, o, rec) {
  const { ctx, v } = R;
  const x0 = o.x;
  const y0 = o.y;
  const x1 = o.x + o.w;
  const y1 = o.y + o.h;
  const LH = 19; // a layer
  const layers = o.layers;
  const sd = o.seed || 1;
  const b = R.struct(Math.max(R.L.lit(x0 + o.w / 2, y1 + 10), R.L.lit(x0 - 10, y0 + o.h / 2)));
  if (v.flat) {
    topFill(R, x0, y0, x1, y1, 0, tone('#3a3632', R.roofK));
  }
  // Lower layers: one slab each, the cars' ends and sides painted on its faces.
  const nx = o.vert ? o.across : o.along;
  const ny = o.vert ? o.along : o.across;
  const cw = o.w / nx;
  const ch = o.h / ny;
  for (let L = 0; L < layers - 1 && !v.flat; L++) {
    const z0 = L * LH;
    litWalls(R, x0 + 1, y0 + 1, x1 - 1, y1 - 1, z0, z0 + LH - 2, '#4a433c');
    if (R.alpha > 0.5) {
      onFaceY(R, x0, y0, x1, y1, (c, len, fwd) => {
        for (let k = 0; k < nx; k++) {
          const kk = fwd ? k : nx - 1 - k;
          c.fillStyle = rust(sd + kk * 3.1 + L * 17);
          c.globalAlpha = 0.8 * Math.min(1, b + 0.25);
          c.fillRect(k * cw + 2, -z0 - LH + 3, cw - 4, LH - 5);
          c.globalAlpha = 1;
          c.fillStyle = 'rgba(10,12,16,0.6)';
          c.fillRect(k * cw + cw * 0.2, -z0 - LH + 5, cw * 0.6, 4);
        }
      });
      onFaceX(R, x0, y0, x1, y1, (c, len, fwd) => {
        for (let k = 0; k < ny; k++) {
          const kk = fwd ? k : ny - 1 - k;
          c.fillStyle = rust(sd + kk * 5.7 + L * 13 + 40);
          c.globalAlpha = 0.8 * Math.min(1, b + 0.25);
          c.fillRect(k * ch + 2, -z0 - LH + 3, ch - 4, LH - 5);
          c.globalAlpha = 1;
          c.fillStyle = 'rgba(10,12,16,0.6)';
          c.fillRect(k * ch + ch * 0.2, -z0 - LH + 5, ch * 0.6, 4);
        }
      });
    }
  }
  // The top layer: each car a flattened box of its own, a few missing, none quite straight.
  const zt = (layers - 1) * LH;
  const cars = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) cars.push([i, j]);
  // Far ones first.
  cars.sort((p, q) => (p[0] * cw * v.gx + p[1] * ch * v.gy) - (q[0] * cw * v.gx + q[1] * ch * v.gy));
  for (const [i, j] of cars) {
    const h1 = hash01(sd + i * 7.31 + j * 3.17);
    const gone = h1 < 0.14 && layers > 2;
    const jx = (hash01(sd + i * 1.7 + j * 9.1) - 0.5) * 6;
    const jy = (hash01(sd + i * 4.3 + j * 2.9) - 0.5) * 6;
    const ax = x0 + i * cw + 3 + jx;
    const ay = y0 + j * ch + 3 + jy;
    const bx = ax + cw - 6;
    const by = ay + ch - 6;
    const z0 = gone ? zt - LH : zt;
    if (z0 < 0) continue;
    const col = rust(sd + i * 3.1 + j * 5.7 + 99);
    if (v.flat) {
      topFill(R, ax, ay, bx, by, 0, tone(col, R.roofK));
      continue;
    }
    box(ctx, v, ax, ay, bx, by, z0, z0 + 15, tone(col, R.roofK * 1.05), tone(col, b * R.fX), tone(col, b * R.fY));
    if (R.alpha > 0.5) {
      // What is left of the glass.
      R.ground(z0 + 15);
      ctx.fillStyle = 'rgba(12,16,22,0.7)';
      if (o.vert) {
        ctx.fillRect(ax + 5, ay + (by - ay) * 0.22, bx - ax - 10, (by - ay) * 0.14);
        ctx.fillRect(ax + 5, ay + (by - ay) * 0.62, bx - ax - 10, (by - ay) * 0.1);
      } else {
        ctx.fillRect(ax + (bx - ax) * 0.22, ay + 5, (bx - ax) * 0.14, by - ay - 10);
        ctx.fillRect(ax + (bx - ax) * 0.62, ay + 5, (bx - ax) * 0.1, by - ay - 10);
      }
      R.reset();
    }
  }
  if (rec.art) {
    R.ground(zt + 15);
    for (const fn of rec.art) fn(ctx, R);
    R.reset();
  }
}

/** A heap of scrap: sheet, engine blocks, the odd beam sticking out. */
function drawScrap(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const sd = o.seed || 1;
  pbox(R, o.x + 4, o.y + 4, o.x + o.w - 4, o.y + o.h - 4, 0, 12, '#3f352b', b);
  const n = 7;
  const order = [];
  for (let k = 0; k < n; k++) {
    const w = o.w * (0.24 + hash01(sd + k) * 0.22);
    const h = o.h * (0.24 + hash01(sd + k * 2.3) * 0.22);
    const x = o.x + 8 + hash01(sd + k * 7.1) * Math.max(1, o.w - 16 - w);
    const y = o.y + 8 + hash01(sd + k * 4.9) * Math.max(1, o.h - 16 - h);
    order.push([x, y, w, h, k]);
  }
  order.sort((p, q) => (p[0] * v.gx + p[1] * v.gy) - (q[0] * v.gx + q[1] * v.gy));
  const cols = ['#6b4a34', '#5a5d61', '#7a5a3c', '#3f4447', '#74513a', '#4f565c', '#8a6a44'];
  for (const [x, y, w, h, k] of order) {
    const z0 = 8 + hash01(sd + k * 9.7) * 14;
    pbox(R, x, y, x + w, y + h, z0, z0 + 12 + hash01(sd + k * 3.3) * 18, cols[k % cols.length], b);
  }
  if (v.flat) return;
  ctx.strokeStyle = tone('#55504a', b);
  ctx.lineCap = 'butt';
  ctx.lineWidth = Math.max(1, 3 * v.scale);
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const x = o.x + o.w * (0.2 + hash01(sd + k * 11) * 0.6);
    const y = o.y + o.h * (0.2 + hash01(sd + k * 13) * 0.6);
    limb(ctx, v, x, y, 14, x + (hash01(sd + k * 17) - 0.5) * 50, y + (hash01(sd + k * 19) - 0.5) * 36, 44 + hash01(sd + k) * 20);
  }
  ctx.stroke();
  ctx.lineCap = 'round';
}

/** Tyres, stacked. */
function drawTires(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const sd = o.seed || 1;
  const step = 30;
  const nx = Math.max(1, Math.floor(o.w / step));
  const ny = Math.max(1, Math.floor(o.h / step));
  const ox = o.x + (o.w - nx * step) / 2 + step / 2;
  const oy = o.y + (o.h - ny * step) / 2 + step / 2;
  const list = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) list.push([i, j]);
  list.sort((p, q) => (p[0] * v.gx + p[1] * v.gy) - (q[0] * v.gx + q[1] * v.gy));
  for (const [i, j] of list) {
    const k = 1 + Math.floor(hash01(sd + i * 3.7 + j * 9.3) * 4.2);
    const cx = ox + i * step + (hash01(sd + i + j * 5) - 0.5) * 4;
    const cy = oy + j * step + (hash01(sd + i * 7 + j) - 0.5) * 4;
    cylinder(ctx, v, cx, cy, 13.5, 0, k * 8, tone('#232427', b), tone('#141517', b * 0.9));
    ctx.fillStyle = tone('#08090a', b);
    ctx.beginPath();
    disc(ctx, v, cx, cy, 6.5, k * 8);
    ctx.fill();
  }
}

/** Dead white goods: fridges standing, washers, one or two on their sides. */
function drawAppliances(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  const { v } = R;
  const sd = o.seed || 1;
  const step = 34;
  const nx = Math.max(1, Math.floor(o.w / step));
  const ny = Math.max(1, Math.floor(o.h / step));
  const ox = o.x + (o.w - nx * step) / 2;
  const oy = o.y + (o.h - ny * step) / 2;
  const cols = ['#d9d9d2', '#c9c2a8', '#b9bcc0', '#8a9a7a', '#d2cfc4'];
  const list = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) list.push([i, j]);
  list.sort((p, q) => (p[0] * v.gx + p[1] * v.gy) - (q[0] * v.gx + q[1] * v.gy));
  for (const [i, j] of list) {
    const h = hash01(sd + i * 5.1 + j * 2.3);
    if (h < 0.12) continue;
    const tall = h > 0.6;
    const x = ox + i * step + 3 + (hash01(sd + i + j * 3) - 0.5) * 4;
    const y = oy + j * step + 3 + (hash01(sd + i * 2 + j) - 0.5) * 4;
    pbox(R, x, y, x + step - 7, y + step - 7, 0, tall ? 46 : h > 0.35 ? 28 : 20, cols[Math.floor(h * 97) % cols.length], b);
  }
}

/** The car crusher: a bed between two hydraulic towers, the plate hanging over what it last ate. */
function drawCrusher(R, o) {
  const { ctx, v } = R;
  const x0 = o.x;
  const y0 = o.y;
  const x1 = o.x + o.w;
  const y1 = o.y + o.h;
  const b = R.struct(R.L.lit((x0 + x1) / 2, y1 + 12));
  pbox(R, x0, y0, x1, y1, 0, 20, '#2f4a3a', b);
  if (!v.flat && R.alpha > 0.5) {
    onFaceY(R, x0, y0, x1, y1, (c, len) => stripes(c, 0, -20, len, 8, 0.85));
  }
  // The last car, flat.
  pbox(R, x0 + 34, y0 + 14, x1 - 34, y1 - 14, 20, 28, '#7c3a2a', b);
  // Towers, the plate, the beam.
  pbox(R, x0, y0 + 6, x0 + 26, y1 - 6, 20, 84, '#c9a227', b);
  pbox(R, x1 - 26, y0 + 6, x1, y1 - 6, 20, 84, '#c9a227', b);
  pbox(R, x0 + 28, y0 + 10, x1 - 28, y1 - 10, 46, 56, '#5a5d61', b);
  pbox(R, x0, y0 + 22, x1, y1 - 22, 72, 84, '#3a3d42', b);
  if (v.flat) return;
  ctx.strokeStyle = tone('#aeb4ba', b);
  ctx.lineWidth = Math.max(1.5, 4 * v.scale);
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (const f of [0.33, 0.67]) line3(ctx, v, x0 + o.w * f, (y0 + y1) / 2, 56, x0 + o.w * f, (y0 + y1) / 2, 72);
  ctx.stroke();
  ctx.lineCap = 'round';
}

const CRANE_TOP = 150;

/** The crane's tower: four legs, bracing, the cab. (Its boom is a prop: it hangs over everything.) */
function drawCraneTower(R, o) {
  const { ctx, v } = R;
  const b = R.struct(R.L.lit(o.x + o.w / 2, o.y + o.h + 10));
  const x0 = o.x + 4;
  const y0 = o.y + 4;
  const x1 = o.x + o.w - 4;
  const y1 = o.y + o.h - 4;
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, 8, '#55585c', b);
  if (!v.flat) {
    ctx.strokeStyle = tone('#c6862c', b);
    ctx.lineCap = 'butt';
    ctx.lineWidth = Math.max(1.2, 3 * v.scale);
    ctx.beginPath();
    for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) line3(ctx, v, x, y, 8, x, y, CRANE_TOP - 22);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, 1.4 * v.scale);
    ctx.beginPath();
    for (let z = 8; z < CRANE_TOP - 40; z += 30) {
      line3(ctx, v, x0, y1, z, x1, y1, z + 30);
      line3(ctx, v, x1, y1, z, x0, y1, z + 30);
      line3(ctx, v, x0, y0, z, x0, y1, z + 30);
      line3(ctx, v, x0, y1, z, x0, y0, z + 30);
    }
    ctx.stroke();
    ctx.lineCap = 'round';
  }
  pbox(R, o.x - 2, o.y - 2, o.x + o.w + 2, o.y + o.h + 2, CRANE_TOP - 22, CRANE_TOP, '#c6862c', Math.max(b, R.roofK * 0.8));
}

/** The boom, the cable, the magnet and the car it never put down. */
function drawBoom(R, p) {
  const { ctx, v } = R;
  if (v.flat) return;
  const c = p.crane;
  const k = Math.max(R.roofK * 0.9, 0.35);
  const z = CRANE_TOP - 6;
  const sway = Math.sin(R.t * 0.7) * 3;
  ctx.strokeStyle = tone('#c6862c', k);
  ctx.lineCap = 'butt';
  ctx.lineWidth = Math.max(2, 7 * v.scale);
  ctx.beginPath();
  line3(ctx, v, c.x, c.y, z, c.bx, c.by, z + 10);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(20,20,22,0.8)';
  ctx.lineWidth = Math.max(1, 1.4 * v.scale);
  ctx.beginPath();
  line3(ctx, v, c.bx, c.by, z + 10, c.bx + sway, c.by, 92);
  ctx.stroke();
  ctx.lineCap = 'round';
  cylinder(ctx, v, c.bx + sway, c.by, 17, 84, 92, tone('#3a3d42', k), tone('#2a2c30', k));
  box(ctx, v, c.bx + sway - 42, c.by - 21, c.bx + sway + 42, c.by + 21, 66, 84, tone('#2e4a6d', k), tone('#2e4a6d', k * R.fX), tone('#2e4a6d', k * R.fY));
}

/** What the crusher makes: a cube that was a car. */
function drawCube(R, o) {
  const b = propLight(R, o);
  if (b < 0.032) return;
  pbox(R, o.x, o.y, o.x + o.w, o.y + o.h, 0, 24, o.color || '#6b6b6b', b);
  if (R.v.flat || R.alpha <= 0.5) return;
  const lines = (c, len) => {
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    c.lineWidth = 1;
    c.beginPath();
    for (let z = 6; z < 24; z += 6) {
      c.moveTo(0, -z);
      c.lineTo(len, -z + (z % 12 ? 2 : -2));
    }
    c.stroke();
  };
  onFaceX(R, o.x, o.y, o.x + o.w, o.y + o.h, lines);
  onFaceY(R, o.x, o.y, o.x + o.w, o.y + o.h, lines);
}

/** The office: a site trailer up on blocks. */
function drawTrailer(R, o, rec) {
  const { ctx } = R;
  const x0 = o.x;
  const y0 = o.y;
  const x1 = o.x + o.w;
  const y1 = o.y + o.h;
  const H = rec.h;
  const b = R.struct(R.L.lit((x0 + x1) / 2, y1 + 10));
  for (const f of [0.1, 0.5, 0.9]) pbox(R, x0 + o.w * f - 8, y0 + 8, x0 + o.w * f + 8, y1 - 8, 0, 8, '#55585c', b);
  litWalls(R, x0, y0, x1, y1, 8, H, '#b9bbb4');
  if (!R.v.flat && R.alpha > 0.5) {
    onFaceY(R, x0, y0, x1, y1, (c, len) => {
      c.translate(0, -8);
      c.fillStyle = 'rgba(0,0,0,0.12)';
      for (let s = 6; s < len; s += 8) c.fillRect(s, -(H - 8), 1, H - 8);
      c.fillStyle = 'rgba(40,44,50,0.9)';
      c.fillRect(len * 0.44, -28, 16, 28);
      c.fillStyle = 'rgba(14,20,30,0.7)';
      for (const f of [0.12, 0.26, 0.66, 0.82]) c.fillRect(len * f, -26, 20, 13);
      c.fillStyle = 'rgba(120,124,128,0.9)';
      c.fillRect(len * 0.44 - 4, 0, 24, 8);
    });
    onFaceX(R, x0, y0, x1, y1, (c, len) => {
      c.translate(0, -8);
      c.fillStyle = 'rgba(14,20,30,0.7)';
      c.fillRect(len * 0.3, -26, len * 0.4, 13);
    });
    wallPosters(R, o, rec);
  }
  topFill(R, x0, y0, x1, y1, H, tone('#8a8d88', R.roofK * 1.1));
  pbox(R, x0 + o.w * 0.7, y0 + 20, x0 + o.w * 0.7 + 26, y0 + 44, H, H + 9, '#686c73', R.roofK);
  if (rec.art) {
    R.ground(H);
    for (const fn of rec.art) fn(ctx, R);
    R.reset();
  }
}

// --- Small props that stand up (decor, not obstacles) ---------------------------------------------

const lit = (R, p) => R.L.lit(p.x, p.y);

function flagPin(R, p) {
  const b = lit(R, p);
  if (b < 0.032) return;
  const { ctx, v } = R;
  ctx.strokeStyle = tone('#b9b9b0', b);
  ctx.lineWidth = Math.max(1, 1.2 * v.scale);
  ctx.beginPath();
  line3(ctx, v, p.x, p.y, 0, p.x, p.y, 16);
  ctx.stroke();
  const w = Math.sin(R.t * 3 + p.x) * 0.8;
  ctx.fillStyle = tone('#a8322c', b);
  ctx.beginPath();
  quad3(ctx, v, p.x, p.y, 10, p.x + 8, p.y + w, 10, p.x + 8, p.y + w, 16, p.x, p.y, 16);
  ctx.fill();
  ctx.fillStyle = tone('#2a3f7a', b);
  ctx.beginPath();
  quad3(ctx, v, p.x, p.y, 13, p.x + 3.5, p.y + w * 0.4, 13, p.x + 3.5, p.y + w * 0.4, 16, p.x, p.y, 16);
  ctx.fill();
}

function flagpole(R, p) {
  const b = Math.max(lit(R, p), 0.1);
  const { ctx, v } = R;
  ctx.strokeStyle = tone('#a9aaa6', b);
  ctx.lineWidth = Math.max(1.5, 2.4 * v.scale);
  ctx.beginPath();
  line3(ctx, v, p.x, p.y, 0, p.x, p.y, 118);
  ctx.stroke();
  // Half-mast.
  const w = Math.sin(R.t * 1.7 + p.x) * 2;
  ctx.fillStyle = tone('#a8322c', b);
  ctx.beginPath();
  quad3(ctx, v, p.x, p.y, 62, p.x + 30, p.y + w, 60, p.x + 30, p.y + w, 78, p.x, p.y, 80);
  ctx.fill();
  ctx.fillStyle = tone('#2a3f7a', b);
  ctx.beginPath();
  quad3(ctx, v, p.x, p.y, 71, p.x + 12, p.y + w * 0.4, 70.4, p.x + 12, p.y + w * 0.4, 79, p.x, p.y, 80);
  ctx.fill();
}

function urn(R, p) {
  const b = lit(R, p);
  if (b < 0.032) return;
  const { ctx, v } = R;
  pbox(R, p.x - 7, p.y - 7, p.x + 7, p.y + 7, 0, 14, '#8a8b84', b);
  cylinder(ctx, v, p.x, p.y, 6, 14, 26, tone('#9a9b93', b), tone('#84857e', b * 0.85));
  ctx.fillStyle = tone('#2d4a2f', b);
  ctx.beginPath();
  ball(ctx, v, p.x, p.y, 30, 6);
  ctx.fill();
}

function reeds(R, p) {
  const b = lit(R, p);
  if (b < 0.032) return;
  const { ctx, v } = R;
  ctx.strokeStyle = tone('#4a5a34', b);
  ctx.lineWidth = Math.max(1, 1.4 * v.scale);
  ctx.beginPath();
  for (let k = 0; k < 9; k++) {
    const dx = (hash01(p.x + k * 3.3) - 0.5) * 30;
    const dy = (hash01(p.y + k * 5.1) - 0.5) * 22;
    const sway = Math.sin(R.t * 1.3 + k) * 2;
    line3(ctx, v, p.x + dx, p.y + dy, 0, p.x + dx + sway, p.y + dy, 16 + hash01(k + p.x) * 12);
  }
  ctx.stroke();
}

const DECOR_PROPS = {
  gflag: { r: 6, h: 16, draw: flagPin },
  flagpole: { r: 6, h: 118, draw: flagpole },
  urn: { r: 9, h: 34, draw: urn },
  reeds: { r: 18, h: 26, draw: reeds },
  mailbox: { r: 5, h: 23, draw: mailbox },
  bins: { r: 16, h: 22, draw: bins },
  bush: { r: 12, h: 18, draw: bush },
  yardsign: { r: 13, h: 24, draw: yardsign },
  flamingo: { r: 5, h: 23, draw: flamingo },
  grill: { r: 9, h: 30, draw: grill },
  doghouse: { r: 16, h: 25, draw: doghouse },
  cart: { r: 11, h: 19, draw: cart },
};

// --- Registration ---------------------------------------------------------------------------------

const baseBuilding = modelOf('building');
const baseCar = modelOf('car');
const baseCrate = modelOf('crate');
const baseFence = modelOf('fence');
const baseTree = modelOf('tree');

registerModels({
  grave: (o) => ({ h: o.hgt, draw: drawGrave, fades: false, shadow: o.hgt > 30 }),
  tomb: () => ({ h: 23, draw: drawTomb }),
  obelisk: (o) => ({ h: o.hgt, draw: drawObelisk, fades: false }),
  mausoleum: (o) => ({ h: o.hgt + 14, draw: drawMausoleum }),
  niche: () => ({ h: 46, draw: drawNiche }),
  mound: () => ({ h: 22, draw: drawMound }),
  digger: () => ({ h: 58, draw: drawDigger }),
  building: (o, map) => {
    if (o.chapel) return { h: 116, draw: drawChapel, data: { wall: CHAPEL_STONE } };
    if (o.steeple) return { h: 184, draw: drawSteeple, data: { wall: CHAPEL_STONE } };
    if (o.house) {
      const wallH = o.storeys === 2 ? 64 : 40;
      const rise = 20 + hash01((o.seed || 1) % 977) * 10;
      return { h: wallH + rise, draw: drawHouse, data: { wall: o.siding, wallH, rise } };
    }
    if (o.garage) return { h: 44, draw: drawOuthouse, data: { wall: o.siding, wallH: 32, rise: 12 } };
    if (o.shed) return { h: 38, draw: drawOuthouse, data: { wall: o.siding || '#6f7a66', wallH: 26, rise: 12 } };
    if (o.mall) return { h: 54, draw: drawMall, data: { wall: '#6b5a4c' } };
    if (o.trailer) return { h: 46, draw: drawTrailer, data: { wall: '#b9bbb4' } };
    return baseBuilding(o, map);
  },
  wrecks: (o) => ({ h: o.layers * 19, draw: drawWrecks }),
  scrap: () => ({ h: 52, draw: drawScrap }),
  tires: () => ({ h: 36, draw: drawTires }),
  appliances: () => ({ h: 46, draw: drawAppliances }),
  crusher: () => ({ h: 84, draw: drawCrusher }),
  cranebase: () => ({ h: CRANE_TOP, draw: drawCraneTower, fades: false }),
  crate: (o, map) => (o.cube ? { h: 24, draw: drawCube } : baseCrate(o, map)),
  fence: (o, map) => (o.style === 'iron' ? { h: 40, draw: drawIronFence, fades: false } : o.style === 'wood' || o.style === 'picket' ? { h: o.style === 'picket' ? 24 : 40, draw: drawPlankFence, fades: false } : baseFence(o, map)),
  playset: (o) => ({ h: o.play === 'trampoline' ? 14 : o.play === 'merry' ? 24 : 47, draw: drawPlayset, fades: false }),
  car: (o, map) => (o.bus ? { h: 48, draw: drawBus } : baseCar(o, map)),
  tree: (o, map) => (o.dead ? { h: 80 * (o.w / 36), draw: drawDeadTree, fades: false } : o.willow ? { h: 72 * (o.w / 36), draw: drawWillow } : baseTree(o, map)),
});

registerLamp('lantern', () => ({ r: 5, h: 65, draw: drawLantern, gz: 56, glow: 18 }));
registerLamp('porch', (l) => ({ r: 4, h: 30, draw: drawPorchLight, gy: l.y + (l.wall || 0) * 8, gz: 27, glow: 15 }));

registerProps((scene, view, out) => {
  const c = scene.map.crane;
  if (c) out.push({ x: c.x, y: c.y, r: 24, h: CRANE_TOP + 10, over: true, draw: drawBoom, crane: c });
  for (const d of scene.map.decor) {
    const P = DECOR_PROPS[d.type];
    if (!P) continue;
    d._3d = true;
    out.push({ x: d.x, y: d.y, r: P.r, h: P.h, draw: P.draw, d, decor: true });
  }
});

