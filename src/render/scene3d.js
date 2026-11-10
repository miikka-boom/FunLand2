// What stands in the world, prepared for the 3D pass.
//
// Built once per map (and again if the camera turns): every obstacle gets a
// height and a model (models.js), a painter's rank among the other statics
// (iso.js: depthOrder) and a place in a coarse grid. Each frame the scene
// hands out the statics on screen, tells movers where they slot into the
// painter's order, and answers "is this point hidden behind something?" (for
// fading what stands in front of the survivor, and for the see-through
// outlines of zombies you could see from above but the camera can't).

import { depthOrder, spanU, behindPoint, pointBehind } from '../iso.js';
import { clamp } from '../util.js';
import { modelFor, buildProps } from './models.js';

const CELL = 128;
const NEAR = 110; // a mover only ever overlaps statics this close behind it on screen
const span = [0, 0];

export class Scene {
  constructor(world, view) {
    this.world = world;
    this.map = world.map;
    this.stamp = 0;
    this.statics = [];
    this.props = [];
    this.visible = [];
    this.tall = [];
    this.gw = Math.ceil((world.w + 2 * CELL) / CELL);
    this.gh = Math.ceil((world.h + 2 * CELL) / CELL);
    this.build(view);
  }

  cellX(x) {
    return clamp(Math.floor(x / CELL) + 1, 0, this.gw - 1);
  }

  cellY(y) {
    return clamp(Math.floor(y / CELL) + 1, 0, this.gh - 1);
  }

  build(view) {
    const world = this.world;
    this.yaw = view.yaw;
    this.count = world.obstacles.length;
    const st = (this.statics = []);
    for (const o of world.obstacles) {
      if (o.kind === 'border' || o.kind === 'water') continue;
      if (!o._r3) {
        const m = modelFor(o, this.map);
        // a: how solid it is drawn (fades when it hides the survivor); stamp: seen this frame.
        o._r3 = { h: m.h, draw: m.draw, tall: m.h >= 30, fades: m.fades !== false && m.h >= 30, shadow: m.shadow !== false, rank: 0, a: 1, hide: 0, stamp: 0, u0: 0, u1: 0, data: m.data || null, posters: null, art: null };
      }
      // What hangs on it (posters, rooftop words) is put back by buildProps.
      o._r3.posters = null;
      o._r3.art = null;
      st.push(o);
    }
    const rank = depthOrder(st, view);
    for (let i = 0; i < st.length; i++) {
      const r = st[i]._r3;
      r.rank = rank[i];
      spanU(view, st[i], span);
      r.u0 = span[0];
      r.u1 = span[1];
    }
    this._grid();
    // Things that are drawn but aren't obstacles (lamp posts, gate posts, small decor...).
    this.props = buildProps(this, view);
    for (const p of this.props) p.lo = this.slot(view, p.x, p.y, p.r || 6);
    this.pgrid = Array.from({ length: this.gw * this.gh }, () => null);
    for (const p of this.props) {
      const i = this.cellY(p.y) * this.gw + this.cellX(p.x);
      (this.pgrid[i] || (this.pgrid[i] = [])).push(p);
    }
  }

  _grid() {
    // near[]: statics within NEAR of the cell (for slotting movers); cells[]: statics touching it.
    this.cells = Array.from({ length: this.gw * this.gh }, () => null);
    this.near = Array.from({ length: this.gw * this.gh }, () => null);
    const put = (grid, o, pad) => {
      const x0 = this.cellX(o.x - pad);
      const x1 = this.cellX(o.x + o.w + pad);
      const y0 = this.cellY(o.y - pad);
      const y1 = this.cellY(o.y + o.h + pad);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * this.gw + x;
          (grid[i] || (grid[i] = [])).push(o);
        }
      }
    };
    for (const o of this.statics) {
      put(this.cells, o, 0);
      put(this.near, o, NEAR);
    }
  }

  /** Keep up with the world: obstacles that were removed (boards broken, a gate opened), a turned camera. */
  sync(view) {
    if (this.yaw !== view.yaw) this.build(view);
    else if (this.count !== this.world.obstacles.length) {
      this.count = this.world.obstacles.length;
      const live = new Set(this.world.obstacles);
      this.statics = this.statics.filter((o) => live.has(o));
      this._grid();
    }
  }

  /**
   * The statics on screen, in no particular order (sort by _r3.rank), into
   * this.visible; the tall ones among them into this.tall.
   */
  cull(view, vr) {
    const out = this.visible;
    const tall = this.tall;
    out.length = 0;
    tall.length = 0;
    const stamp = ++this.stamp;
    const x0 = this.cellX(vr.x);
    const x1 = this.cellX(vr.x + vr.w);
    const y0 = this.cellY(vr.y);
    const y1 = this.cellY(vr.y + vr.h);
    const s = view.scale;
    const W = view.w;
    const H = view.h;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = this.cells[cy * this.gw + cx];
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const o = list[i];
          const r = o._r3;
          if (r.stamp === stamp) continue;
          r.stamp = stamp;
          // Its outline on screen against the screen rect.
          if (view.ox + r.u1 * s < -24 || view.ox + r.u0 * s > W + 24) continue;
          const xa = o.x;
          const xb = o.x + o.w;
          const ya = o.y;
          const yb = o.y + o.h;
          const va = view.bx * xa;
          const vb = view.bx * xb;
          const vc = view.by * ya;
          const vd = view.by * yb;
          const top = view.oy + (va < vb ? va : vb) + (vc < vd ? vc : vd) + view.bz * (r.h + 40);
          const bot = view.oy + (va > vb ? va : vb) + (vc > vd ? vc : vd);
          if (bot < -24 || top > H + 24) continue;
          out.push(o);
          if (r.tall) tall.push(o);
        }
      }
    }
    return out;
  }

  /** The props (lamp posts etc.) whose cell is on screen, appended to `out`. */
  cullProps(view, vr, out) {
    const x0 = this.cellX(vr.x);
    const x1 = this.cellX(vr.x + vr.w);
    const y0 = this.cellY(vr.y);
    const y1 = this.cellY(vr.y + vr.h);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = this.pgrid[cy * this.gw + cx];
        if (!list) continue;
        for (let i = 0; i < list.length; i++) if (view.onScreen(list[i].x, list[i].y, 60, list[i].h || 0)) out.push(list[i]);
      }
    }
    return out;
  }

  /**
   * Where a mover standing at (x, y) goes in the painter's order: the rank of
   * the last static it must be drawn after (-1: before them all). It is
   * drawn right after that one; movers sharing a slot sort by depth.
   */
  slot(view, x, y, r) {
    const list = this.near[this.cellY(y) * this.gw + this.cellX(x)];
    if (!list) return -1;
    const u = x * view.cy + y * view.sy;
    const pad = r * 0.8;
    let lo = -1;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      const rec = o._r3;
      if (rec.rank <= lo || u + pad <= rec.u0 || u - pad >= rec.u1) continue;
      if (behindPoint(view, o, x, y) >= pointBehind(view, o, x, y)) lo = rec.rank;
    }
    return lo;
  }

  /**
   * The tall static (from this frame's cull) that hides the point (x, y, z)
   * from the camera, or null. `solidOnly` skips statics that are faded out
   * right now.
   */
  hider(view, x, y, z, solidOnly = false) {
    if (view.flat) return null;
    const u = x * view.cy + y * view.sy;
    const tall = this.tall;
    for (let i = 0; i < tall.length; i++) {
      const o = tall[i];
      const rec = o._r3;
      if (rec.h <= z || u <= rec.u0 || u >= rec.u1) continue;
      if (solidOnly && rec.a < 0.6) continue;
      if (boxHides(view, o, 0, rec.h, x, y, z)) return o;
    }
    return null;
  }
}

/**
 * Does a box over the footprint o, from height z0 to z1, hide the point
 * (x, y, z) from the camera? The ray from the point toward the camera climbs
 * tan(pitch) per unit of ground; it is hidden if it is inside the footprint
 * anywhere between those two heights.
 */
export function boxHides(view, o, z0, z1, x, y, z) {
  if (view.flat || z1 <= z) return false;
  const gx = view.gx;
  const gy = view.gy;
  const igx = 1 / (Math.abs(gx) < 1e-9 ? 1e-9 : gx);
  const igy = 1 / (Math.abs(gy) < 1e-9 ? 1e-9 : gy);
  let t1 = (o.x - x) * igx;
  let t2 = (o.x + o.w - x) * igx;
  let tmin = t1 < t2 ? t1 : t2;
  let tmax = t1 < t2 ? t2 : t1;
  t1 = (o.y - y) * igy;
  t2 = (o.y + o.h - y) * igy;
  const ymin = t1 < t2 ? t1 : t2;
  const ymax = t1 < t2 ? t2 : t1;
  if (ymin > tmin) tmin = ymin;
  if (ymax < tmax) tmax = ymax;
  if (tmax < 0 || tmin > tmax) return false;
  const lo = Math.max(0, (z0 - z) * view.cot);
  const hi = (z1 - z) * view.cot;
  return tmin < hi && tmax > lo;
}
