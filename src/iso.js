// The camera of the 3D view: an orthographic projection (isometric by default).
// Pure math, no DOM, so it is unit tested in Node (tests/iso.test.js).
//
// World axes: x right and y down on the map (as the simulation always had
// them), z up. The camera turns the ground by `yaw` and tilts by `pitch`:
//
//   screen x = ox + scale * ( x*cos(yaw) + y*sin(yaw) )
//   screen y = oy + scale * ((-x*sin(yaw) + y*cos(yaw)) * sin(pitch) - z*cos(pitch))
//
// pitch 90 deg looks straight down (the old top-down view: with yaw 0 the
// mapping is exactly the old one); pitch ~35.26 deg with yaw 45 deg is true
// isometric. Because the projection is orthographic, every flat surface maps
// to the screen by an affine transform, so the 2D drawing code can paint
// straight onto the ground, a roof or a wall (applyGround / applyFace).

export const ISO_YAW = Math.PI / 4;
export const ISO_PITCH = Math.atan(Math.SQRT1_2); // 35.264 deg: all three axes foreshorten equally
const TINY = 1e-6;

export class IsoView {
  constructor(yaw = ISO_YAW, pitch = ISO_PITCH) {
    this.w = 1; // viewport, CSS px
    this.h = 1;
    this.scale = 1; // CSS px per world unit (along the screen's x axis)
    this.ox = 0;
    this.oy = 0;
    this.yaw = NaN;
    this.pitch = NaN;
    this.setAngles(yaw, pitch);
  }

  /** Returns true if the angles changed. */
  setAngles(yaw, pitch) {
    if (yaw === this.yaw && pitch === this.pitch) return false;
    this.yaw = yaw;
    this.pitch = pitch;
    const snap = (v) => (Math.abs(v) < 1e-9 ? 0 : v);
    this.cy = snap(Math.cos(yaw));
    this.sy = snap(Math.sin(yaw));
    this.sp = Math.max(0.05, Math.sin(pitch));
    this.cp = snap(Math.cos(pitch));
    // Ground unit vector pointing at the camera, and which faces of an
    // axis-aligned box look at it (-1: the low side, +1: the high side).
    this.gx = -this.sy;
    this.gy = this.cy;
    this.faceX = this.gx > TINY ? 1 : this.gx < -TINY ? -1 : 0;
    this.faceY = this.gy > TINY ? 1 : this.gy < -TINY ? -1 : 0;
    this.flat = this.cp < 0.02; // straight down: heights don't show
    this.cot = this.cp / this.sp; // ground hidden behind each unit of height
    this._coef();
    return true;
  }

  setViewport(w, h, scale) {
    this.w = w;
    this.h = h;
    this.scale = scale;
    this._coef();
  }

  _coef() {
    const s = this.scale;
    this.ax = s * this.cy; // screen x per world x
    this.ay = s * this.sy; // screen x per world y
    this.bx = -s * this.sp * this.sy; // screen y per world x
    this.by = s * this.sp * this.cy; // screen y per world y
    this.bz = -s * this.cp; // screen y per world z
  }

  /** Put the ground point (x, y) at the middle of the screen (shake is in world-sized screen units). */
  lookAt(x, y, shakeX = 0, shakeY = 0, lift = 0) {
    this.ox = this.w / 2 - (this.ax * x + this.ay * y) - shakeX * this.scale;
    this.oy = this.h / 2 - (this.bx * x + this.by * y + this.bz * lift) - shakeY * this.scale;
  }

  px(x, y) {
    return this.ox + this.ax * x + this.ay * y;
  }

  py(x, y, z = 0) {
    return this.oy + this.bx * x + this.by * y + this.bz * z;
  }

  project(x, y, z = 0, out = { x: 0, y: 0 }) {
    out.x = this.ox + this.ax * x + this.ay * y;
    out.y = this.oy + this.bx * x + this.by * y + this.bz * z;
    return out;
  }

  /** The world point at height z under the screen point (sx, sy). */
  unproject(sx, sy, z = 0, out = { x: 0, y: 0 }) {
    const s = this.scale;
    const u = (sx - this.ox) / s;
    const v = ((sy - this.oy) / s + z * this.cp) / this.sp;
    out.x = u * this.cy - v * this.sy;
    out.y = u * this.sy + v * this.cy;
    return out;
  }

  /**
   * A stick or key direction on the screen -> the direction on the ground
   * that looks the same on screen. The length is kept (it is the stick's
   * deflection), only the heading changes.
   */
  dirToWorld(dx, dy, out = { x: 0, y: 0 }) {
    const m = Math.hypot(dx, dy);
    if (m < 1e-9) {
      out.x = 0;
      out.y = 0;
      return out;
    }
    const v = dy / this.sp;
    const x = dx * this.cy - v * this.sy;
    const y = dx * this.sy + v * this.cy;
    const k = m / Math.hypot(x, y);
    out.x = x * k;
    out.y = y * k;
    return out;
  }

  /** A ground vector as it appears on screen, in world-sized screen units (foreshortened). */
  dirToScreen(dx, dy, out = { x: 0, y: 0 }) {
    out.x = dx * this.cy + dy * this.sy;
    out.y = (-dx * this.sy + dy * this.cy) * this.sp;
    return out;
  }

  /** The heading on screen (radians) of a heading on the ground. */
  angleToScreen(a) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    return Math.atan2((-dx * this.sy + dy * this.cy) * this.sp, dx * this.cy + dy * this.sy);
  }

  /** Larger = nearer the camera (painter's order runs from small to large). */
  depth(x, y) {
    return x * this.gx + y * this.gy;
  }

  /**
   * World rect that covers every ground point on screen, padded by `pad`
   * world units. `tall` also takes in things below the bottom edge that
   * stand up to that high (their tops reach into the picture).
   */
  groundBounds(pad = 0, tall = 0, out = { x: 0, y: 0, w: 0, h: 0 }) {
    const below = this.h + tall * this.cp * this.scale;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let k = 0; k < 4; k++) {
      const p = this.unproject(k & 1 ? this.w : 0, k & 2 ? below : 0, 0, tmp);
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    out.x = x0 - pad;
    out.y = y0 - pad;
    out.w = x1 - x0 + pad * 2;
    out.h = y1 - y0 + pad * 2;
    return out;
  }

  /** Is the ground point on screen (within `pad` CSS px; `tall`: it stands this high)? */
  onScreen(x, y, pad = 0, tall = 0) {
    const sx = this.ox + this.ax * x + this.ay * y;
    if (sx < -pad || sx > this.w + pad) return false;
    const sy = this.oy + this.bx * x + this.by * y;
    return sy >= -pad && sy + this.bz * tall <= this.h + pad;
  }

  // --- Canvas transforms ------------------------------------------------------------------

  /** Draw in world (x, y) on the horizontal plane at height z. */
  applyGround(ctx, dpr = 1, z = 0) {
    ctx.setTransform(dpr * this.ax, dpr * this.bx, dpr * this.ay, dpr * this.by, dpr * this.ox, dpr * (this.oy + this.bz * z));
  }

  /**
   * Draw on a vertical face: local x runs along the ground from (x0, y0) in
   * the unit direction (dx, dy), local y runs DOWN the wall from height z0
   * (so local (s, -h) is the point s along the face, h above z0).
   */
  applyFace(ctx, dpr, x0, y0, dx, dy, z0 = 0) {
    ctx.setTransform(
      dpr * (this.ax * dx + this.ay * dy),
      dpr * (this.bx * dx + this.by * dy),
      0,
      dpr * -this.bz,
      dpr * (this.ox + this.ax * x0 + this.ay * y0),
      dpr * (this.oy + this.bx * x0 + this.by * y0 + this.bz * z0),
    );
  }

  /** Does the ground direction (dx, dy) run left-to-right on screen? (Text on a face should.) */
  runsRight(dx, dy) {
    return this.ax * dx + this.ay * dy > 0;
  }
}

const tmp = { x: 0, y: 0 };

// --- Painter's order for axis-aligned boxes ----------------------------------------------------
//
// Seen along a fixed direction, boxes that stand on the ground and don't
// overlap can always be drawn far-to-near: box A must come before box B when
// they share a strip of the screen and A lies wholly beyond B along x or y.
// A single "depth" number can't express that for long boxes (a wall is both
// nearer and farther than the things along it), so the statics get a real
// topological order once per map; movers are slotted into it every frame.

/** How far rect a lies beyond rect b from the camera (>= 0: a can never cover b). */
export function behindGap(view, a, b) {
  let s = -Infinity;
  if (view.faceX > 0) s = b.x - (a.x + a.w);
  else if (view.faceX < 0) s = a.x - (b.x + b.w);
  let t = -Infinity;
  if (view.faceY > 0) t = b.y - (a.y + a.h);
  else if (view.faceY < 0) t = a.y - (b.y + b.h);
  return s > t ? s : t;
}

/** The same for a rect and a point: >= 0 when the rect lies wholly beyond the point. */
export function behindPoint(view, a, x, y) {
  let s = -Infinity;
  if (view.faceX > 0) s = x - (a.x + a.w);
  else if (view.faceX < 0) s = a.x - x;
  let t = -Infinity;
  if (view.faceY > 0) t = y - (a.y + a.h);
  else if (view.faceY < 0) t = a.y - y;
  return s > t ? s : t;
}

/** ...and when the point lies beyond the rect. */
export function pointBehind(view, a, x, y) {
  let s = -Infinity;
  if (view.faceX > 0) s = a.x - x;
  else if (view.faceX < 0) s = x - (a.x + a.w);
  let t = -Infinity;
  if (view.faceY > 0) t = a.y - y;
  else if (view.faceY < 0) t = y - (a.y + a.h);
  return s > t ? s : t;
}

/** Extent of a rect across the screen (in world units along the screen's x axis). */
export function spanU(view, o, out) {
  const a = view.cy * o.x;
  const b = view.cy * (o.x + o.w);
  const c = view.sy * o.y;
  const d = view.sy * (o.y + o.h);
  out[0] = (a < b ? a : b) + (c < d ? c : d);
  out[1] = (a > b ? a : b) + (c > d ? c : d);
  return out;
}

/**
 * -1: a must be drawn before b, 1: after, 0: they never share a pixel column.
 * Rects that overlap on the ground (props pushed into a wall) fall back to
 * their centres.
 */
export function drawBefore(view, a, b) {
  const ua = spanU(view, a, pairA);
  const ub = spanU(view, b, pairB);
  if (ua[1] <= ub[0] + 0.5 || ub[1] <= ua[0] + 0.5) return 0;
  const ab = behindGap(view, a, b);
  const ba = behindGap(view, b, a);
  if (ab >= -OVERLAP && ab >= ba) return -1;
  if (ba >= -OVERLAP) return 1;
  const da = view.depth(a.x + a.w / 2, a.y + a.h / 2);
  const db = view.depth(b.x + b.w / 2, b.y + b.h / 2);
  return da < db ? -1 : da > db ? 1 : 0;
}

const OVERLAP = 3; // generators leave props a unit or two inside a wall now and then
const pairA = [0, 0];
const pairB = [0, 0];

/**
 * Painter's order for a set of rects {x, y, w, h}: returns an Int32Array of
 * ranks (0 = drawn first). Rects unrelated to each other come out far-to-near
 * by their centres.
 */
export function depthOrder(rects, view) {
  const n = rects.length;
  const rank = new Int32Array(n);
  if (!n) return rank;
  const u0 = new Float64Array(n);
  const u1 = new Float64Array(n);
  const key = new Float64Array(n);
  const span = [0, 0];
  for (let i = 0; i < n; i++) {
    const o = rects[i];
    spanU(view, o, span);
    u0[i] = span[0];
    u1[i] = span[1];
    key[i] = view.depth(o.x + o.w / 2, o.y + o.h / 2);
  }
  // Sweep across the screen: only rects sharing a strip are compared.
  const byU = new Int32Array(n);
  for (let i = 0; i < n; i++) byU[i] = i;
  byU.sort((p, q) => u0[p] - u0[q]);
  const head = new Int32Array(n).fill(-1);
  const indeg = new Int32Array(n);
  let cap = Math.max(64, n * 8);
  let to = new Int32Array(cap);
  let next = new Int32Array(cap);
  let m = 0;
  const edge = (a, b) => {
    if (m === cap) {
      cap *= 2;
      const t2 = new Int32Array(cap);
      t2.set(to);
      to = t2;
      const n2 = new Int32Array(cap);
      n2.set(next);
      next = n2;
    }
    to[m] = b;
    next[m] = head[a];
    head[a] = m++;
    indeg[b]++;
  };
  for (let p = 0; p < n; p++) {
    const i = byU[p];
    const a = rects[i];
    const end = u1[i] - 0.5;
    for (let q = p + 1; q < n; q++) {
      const j = byU[q];
      if (u0[j] >= end) break;
      if (u1[j] <= u0[i] + 0.5) continue;
      const b = rects[j];
      const ab = behindGap(view, a, b);
      const ba = behindGap(view, b, a);
      if (ab >= -OVERLAP && ab >= ba) edge(i, j);
      else if (ba >= -OVERLAP) edge(j, i);
      else if (key[i] < key[j]) edge(i, j);
      else edge(j, i);
    }
  }
  // Kahn's algorithm with a min-heap on the centre depth.
  const heap = new Int32Array(n);
  let hn = 0;
  const push = (v) => {
    let c = hn++;
    while (c > 0) {
      const par = (c - 1) >> 1;
      if (key[heap[par]] <= key[v]) break;
      heap[c] = heap[par];
      c = par;
    }
    heap[c] = v;
  };
  const pop = () => {
    const top = heap[0];
    const v = heap[--hn];
    let c = 0;
    for (;;) {
      let k = c * 2 + 1;
      if (k >= hn) break;
      if (k + 1 < hn && key[heap[k + 1]] < key[heap[k]]) k++;
      if (key[heap[k]] >= key[v]) break;
      heap[c] = heap[k];
      c = k;
    }
    heap[c] = v;
    return top;
  };
  for (let i = 0; i < n; i++) if (!indeg[i]) push(i);
  const done = new Uint8Array(n);
  let out = 0;
  while (out < n) {
    if (!hn) {
      // A cycle (only possible among rects that overlap each other): break it at the farthest one.
      let best = -1;
      for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || key[i] < key[best])) best = i;
      indeg[best] = 0;
      push(best);
    }
    const v = pop();
    if (done[v]) continue;
    done[v] = 1;
    rank[v] = out++;
    for (let e = head[v]; e !== -1; e = next[e]) {
      const t = to[e];
      if (!done[t] && --indeg[t] === 0) push(t);
    }
  }
  return rank;
}
