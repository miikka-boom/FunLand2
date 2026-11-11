// 3D shapes for the 2D canvas. Every shape is given in world units and
// projected by the camera (src/iso.js); the canvas transform is left alone
// (the caller keeps it at the device-pixel scale), so one path can mix
// several shapes and be filled once.
//
// An orthographic camera makes this cheap and exact:
//   - a box shows at most three faces (its top and the two walls that look at
//     the camera), each a parallelogram
//   - an upright cylinder is two ellipses and a band between them
//   - a ball is a circle, and a limb (a capsule) is a thick line with round ends

import { TAU } from '../util.js';

// --- Colour tones ------------------------------------------------------------------------
// tone(colour, k) is the colour at brightness k (0 = black, 1 = as given, a
// little over 1 = highlight), from a small table per colour so nothing is
// built per frame.

const STEPS = 32; // tones per unit of brightness
const MAX = 44; // up to k = 1.375
const cache = new Map();

function parse(color) {
  if (color[0] === '#') {
    if (color.length === 4) return [parseInt(color[1] + color[1], 16), parseInt(color[2] + color[2], 16), parseInt(color[3] + color[3], 16), 1];
    const n = parseInt(color.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(color);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  return null;
}

export function tones(color) {
  let t = cache.get(color);
  if (t) return t;
  const c = parse(color);
  t = new Array(MAX + 1);
  for (let i = 0; i <= MAX; i++) {
    if (!c) {
      t[i] = color;
      continue;
    }
    const k = i / STEPS;
    const r = Math.min(255, Math.round(c[0] * k));
    const g = Math.min(255, Math.round(c[1] * k));
    const b = Math.min(255, Math.round(c[2] * k));
    t[i] = c[3] < 1 ? `rgba(${r},${g},${b},${c[3]})` : `rgb(${r},${g},${b})`;
  }
  cache.set(color, t);
  return t;
}

export function tone(color, k) {
  const i = (k * STEPS + 0.5) | 0;
  return tones(color)[i < 0 ? 0 : i > MAX ? MAX : i];
}

/** Index of the tone for brightness k (to batch things that share a tone). */
export function toneIndex(k) {
  const i = (k * STEPS + 0.5) | 0;
  return i < 0 ? 0 : i > MAX ? MAX : i;
}


// --- Boxes (axis-aligned, standing on the ground rect x0..x1, y0..y1, from z0 up to z1) ---------

/** Top face (subpath only). */
export function boxTop(ctx, v, x0, y0, x1, y1, z) {
  ctx.moveTo(v.px(x0, y0), v.py(x0, y0, z));
  ctx.lineTo(v.px(x1, y0), v.py(x1, y0, z));
  ctx.lineTo(v.px(x1, y1), v.py(x1, y1, z));
  ctx.lineTo(v.px(x0, y1), v.py(x0, y1, z));
  ctx.closePath();
}

/** The wall along y that looks at the camera (subpath only; nothing if it's edge-on). */
export function boxFaceX(ctx, v, x0, y0, x1, y1, z0, z1) {
  if (!v.faceX) return;
  const x = v.faceX < 0 ? x0 : x1;
  const sx0 = v.px(x, y0);
  const sx1 = v.px(x, y1);
  ctx.moveTo(sx0, v.py(x, y0, z0));
  ctx.lineTo(sx1, v.py(x, y1, z0));
  ctx.lineTo(sx1, v.py(x, y1, z1));
  ctx.lineTo(sx0, v.py(x, y0, z1));
  ctx.closePath();
}

/** The wall along x that looks at the camera (subpath only). */
export function boxFaceY(ctx, v, x0, y0, x1, y1, z0, z1) {
  if (!v.faceY) return;
  const y = v.faceY > 0 ? y1 : y0;
  const sx0 = v.px(x0, y);
  const sx1 = v.px(x1, y);
  ctx.moveTo(sx0, v.py(x0, y, z0));
  ctx.lineTo(sx1, v.py(x1, y, z0));
  ctx.lineTo(sx1, v.py(x1, y, z1));
  ctx.lineTo(sx0, v.py(x0, y, z1));
  ctx.closePath();
}

/** The whole outline of the box on screen: a hexagon (subpath only). */
export function boxHull(ctx, v, x0, y0, x1, y1, z0, z1) {
  // (xf, yf): the corner nearest the camera; (xo, yo): the one farthest away.
  const xf = v.faceX < 0 ? x0 : x1;
  const xo = v.faceX < 0 ? x1 : x0;
  const yf = v.faceY > 0 ? y1 : y0;
  const yo = v.faceY > 0 ? y0 : y1;
  ctx.moveTo(v.px(xo, yf), v.py(xo, yf, z0));
  ctx.lineTo(v.px(xf, yf), v.py(xf, yf, z0));
  ctx.lineTo(v.px(xf, yo), v.py(xf, yo, z0));
  ctx.lineTo(v.px(xf, yo), v.py(xf, yo, z1));
  ctx.lineTo(v.px(xo, yo), v.py(xo, yo, z1));
  ctx.lineTo(v.px(xo, yf), v.py(xo, yf, z1));
  ctx.closePath();
}

/**
 * A filled box. The outline is filled with the x wall's colour first, so the
 * joints between faces show that colour (a thin dark edge) instead of a
 * hairline of whatever is behind.
 */
export function box(ctx, v, x0, y0, x1, y1, z0, z1, cTop, cX, cY) {
  if (v.flat || z1 <= z0) {
    ctx.fillStyle = cTop;
    ctx.beginPath();
    boxTop(ctx, v, x0, y0, x1, y1, z1);
    ctx.fill();
    return;
  }
  ctx.fillStyle = cX;
  ctx.beginPath();
  boxHull(ctx, v, x0, y0, x1, y1, z0, z1);
  ctx.fill();
  if (v.faceY) {
    ctx.fillStyle = cY;
    ctx.beginPath();
    boxFaceY(ctx, v, x0, y0, x1, y1, z0, z1);
    ctx.fill();
  }
  ctx.fillStyle = cTop;
  ctx.beginPath();
  boxTop(ctx, v, x0, y0, x1, y1, z1);
  ctx.fill();
}

/** The ground shadow of a box: its footprint swept along (dx, dy) (subpath only). */
export function boxShadow(ctx, v, x0, y0, x1, y1, dx, dy) {
  const xa = dx < 0 ? x1 : x0;
  const xb = dx < 0 ? x0 : x1;
  const ya = dy < 0 ? y1 : y0;
  const yb = dy < 0 ? y0 : y1;
  ctx.moveTo(v.px(xa, yb), v.py(xa, yb, 0));
  ctx.lineTo(v.px(xa, ya), v.py(xa, ya, 0));
  ctx.lineTo(v.px(xb, ya), v.py(xb, ya, 0));
  ctx.lineTo(v.px(xb + dx, ya + dy), v.py(xb + dx, ya + dy, 0));
  ctx.lineTo(v.px(xb + dx, yb + dy), v.py(xb + dx, yb + dy, 0));
  ctx.lineTo(v.px(xa + dx, yb + dy), v.py(xa + dx, yb + dy, 0));
  ctx.closePath();
}

// --- Round things ------------------------------------------------------------------------------

/** An upright cylinder: side filled with cSide, lid with cTop. */
export function cylinder(ctx, v, cx, cy, r, z0, z1, cTop, cSide) {
  const sx = v.px(cx, cy);
  const sy1 = v.py(cx, cy, z1);
  const rx = r * v.scale;
  const ry = rx * v.sp;
  if (!v.flat && z1 > z0) {
    const sy0 = v.py(cx, cy, z0);
    ctx.fillStyle = cSide;
    ctx.beginPath();
    ctx.ellipse(sx, sy0, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(sx - rx, sy1);
    ctx.ellipse(sx, sy1, rx, ry, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = cTop;
  ctx.beginPath();
  ctx.ellipse(sx, sy1, rx, ry, 0, 0, TAU);
  ctx.fill();
}

/** A circle lying flat at height z (subpath only). */
export function disc(ctx, v, cx, cy, r, z = 0) {
  const sx = v.px(cx, cy);
  const sy = v.py(cx, cy, z);
  const rx = r * v.scale;
  ctx.moveTo(sx + rx, sy);
  ctx.ellipse(sx, sy, rx, rx * v.sp, 0, 0, TAU);
}

/** A ball (subpath only). */
export function ball(ctx, v, x, y, z, r) {
  const sx = v.px(x, y);
  const sy = v.py(x, y, z);
  const rr = r * v.scale;
  ctx.moveTo(sx + rr, sy);
  ctx.arc(sx, sy, rr, 0, TAU);
}

/** A limb from one 3D point to another (subpath only: stroke it with round caps, 2 * radius * scale wide). */
export function limb(ctx, v, x0, y0, z0, x1, y1, z1) {
  ctx.moveTo(v.px(x0, y0), v.py(x0, y0, z0));
  ctx.lineTo(v.px(x1, y1), v.py(x1, y1, z1));
}

// --- Prisms (any convex footprint, e.g. a rotated crate or a hull) -----------------------------

/**
 * pts: [x0, y0, x1, y1, ...] convex, either winding. `side(nx, ny)` returns the
 * fill for a wall with that outward normal; only walls that look at the
 * camera are drawn.
 */
export function prism(ctx, v, pts, z0, z1, cTop, side) {
  const n = pts.length >> 1;
  if (!v.flat && z1 > z0) {
    let area = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
    }
    const sgn = area >= 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = pts[i * 2];
      const ay = pts[i * 2 + 1];
      const bx = pts[j * 2];
      const by = pts[j * 2 + 1];
      let nx = (by - ay) * sgn;
      let ny = -(bx - ax) * sgn;
      if (nx * v.gx + ny * v.gy <= 1e-6) continue;
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      const c = side(nx, ny);
      ctx.fillStyle = c;
      ctx.strokeStyle = c;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(v.px(ax, ay), v.py(ax, ay, z0));
      ctx.lineTo(v.px(bx, by), v.py(bx, by, z0));
      ctx.lineTo(v.px(bx, by), v.py(bx, by, z1));
      ctx.lineTo(v.px(ax, ay), v.py(ax, ay, z1));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.fillStyle = cTop;
  ctx.beginPath();
  polygon(ctx, v, pts, z1);
  ctx.fill();
}

/** A flat polygon at height z (subpath only). */
export function polygon(ctx, v, pts, z = 0) {
  const n = pts.length >> 1;
  ctx.moveTo(v.px(pts[0], pts[1]), v.py(pts[0], pts[1], z));
  for (let i = 1; i < n; i++) ctx.lineTo(v.px(pts[i * 2], pts[i * 2 + 1]), v.py(pts[i * 2], pts[i * 2 + 1], z));
  ctx.closePath();
}

/** A rect of size (w, h) centred on (cx, cy), turned by `a`: its four corners into `out`. */
export function turnedRect(cx, cy, w, h, a, out) {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const hx = w / 2;
  const hy = h / 2;
  out[0] = cx - ca * hx + sa * hy;
  out[1] = cy - sa * hx - ca * hy;
  out[2] = cx + ca * hx + sa * hy;
  out[3] = cy + sa * hx - ca * hy;
  out[4] = cx + ca * hx - sa * hy;
  out[5] = cy + sa * hx + ca * hy;
  out[6] = cx - ca * hx - sa * hy;
  out[7] = cy - sa * hx + ca * hy;
  return out;
}

/** A straight line between two 3D points (subpath only). */
export function line3(ctx, v, x0, y0, z0, x1, y1, z1) {
  ctx.moveTo(v.px(x0, y0), v.py(x0, y0, z0));
  ctx.lineTo(v.px(x1, y1), v.py(x1, y1, z1));
}

/** Any quad in space (subpath only). */
export function quad3(ctx, v, x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3) {
  ctx.moveTo(v.px(x0, y0), v.py(x0, y0, z0));
  ctx.lineTo(v.px(x1, y1), v.py(x1, y1, z1));
  ctx.lineTo(v.px(x2, y2), v.py(x2, y2, z2));
  ctx.lineTo(v.px(x3, y3), v.py(x3, y3, z3));
  ctx.closePath();
}
