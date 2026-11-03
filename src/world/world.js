// Collision, ray casts, navigation grid and the horde flow field.

import { clamp, rayRect } from '../util.js';

const BP_CELL = 128;
const BP_PAD = 34; // >= largest entity radius
export const NAV_CELL = 32;
const INF = 0x3fffffff;

const DIRS = [
  [1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10],
  [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14],
];

/** Push a circle entity {x, y, vx?, vy?} out of a rect. Returns true on contact. */
export function resolveCircleRect(e, r, o) {
  const cx = e.x < o.x ? o.x : e.x > o.x + o.w ? o.x + o.w : e.x;
  const cy = e.y < o.y ? o.y : e.y > o.y + o.h ? o.y + o.h : e.y;
  let nx = e.x - cx;
  let ny = e.y - cy;
  const d2 = nx * nx + ny * ny;
  if (d2 >= r * r) return false;
  let pen;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    nx /= d;
    ny /= d;
    pen = r - d;
  } else {
    // Centre inside the rect: leave through the nearest face.
    const l = e.x - o.x;
    const rr = o.x + o.w - e.x;
    const t = e.y - o.y;
    const b = o.y + o.h - e.y;
    const m = Math.min(l, rr, t, b);
    nx = 0;
    ny = 0;
    if (m === l) nx = -1;
    else if (m === rr) nx = 1;
    else if (m === t) ny = -1;
    else ny = 1;
    pen = m + r;
  }
  e.x += nx * pen;
  e.y += ny * pen;
  if (e.vx !== undefined) {
    const vn = e.vx * nx + e.vy * ny;
    if (vn < 0) {
      e.vx -= vn * nx;
      e.vy -= vn * ny;
    }
  }
  return true;
}

export class World {
  constructor(map) {
    this.map = map;
    this.w = map.w;
    this.h = map.h;
    this.obstacles = map.obstacles;
    this.moveBlockers = this.obstacles.filter((o) => o.move);
    this.shotBlockers = this.obstacles.filter((o) => o.shot);
    this.sightBlockers = this.obstacles.filter((o) => o.sight);

    // Broadphase: each cell lists blockers overlapping it (padded), so an
    // entity only needs to test its own cell.
    this.bpW = Math.ceil(this.w / BP_CELL);
    this.bpH = Math.ceil(this.h / BP_CELL);
    this.bp = Array.from({ length: this.bpW * this.bpH }, () => []);
    for (const o of this.moveBlockers) {
      const x0 = clamp(Math.floor((o.x - BP_PAD) / BP_CELL), 0, this.bpW - 1);
      const x1 = clamp(Math.floor((o.x + o.w + BP_PAD) / BP_CELL), 0, this.bpW - 1);
      const y0 = clamp(Math.floor((o.y - BP_PAD) / BP_CELL), 0, this.bpH - 1);
      const y1 = clamp(Math.floor((o.y + o.h + BP_PAD) / BP_CELL), 0, this.bpH - 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.bp[y * this.bpW + x].push(o);
    }

    this._buildNav();
    this.flow = new FlowField(this);
  }

  _buildNav() {
    const cs = NAV_CELL;
    this.navW = Math.ceil(this.w / cs);
    this.navH = Math.ceil(this.h / cs);
    const n = this.navW * this.navH;
    this.blocked = new Uint8Array(n);
    this.penalty = new Uint8Array(n);
    // Thin obstacles (walls, glass, fences, shelves: < one cell thick) block
    // every cell they touch, or they could slip between rows of cell centres
    // and the field would route bodies straight through them. Bulky props
    // (>= one cell thick) always cover a centre, so centre-based marking is
    // enough and keeps the gaps between scattered furniture walkable.
    for (const o of this.moveBlockers) {
      let x0;
      let x1;
      let y0;
      let y1;
      if (Math.min(o.w, o.h) < cs) {
        x0 = Math.floor(o.x / cs);
        x1 = Math.floor((o.x + o.w - 1e-6) / cs);
        y0 = Math.floor(o.y / cs);
        y1 = Math.floor((o.y + o.h - 1e-6) / cs);
      } else {
        const inf = 4;
        x0 = Math.ceil((o.x - inf) / cs - 0.5);
        x1 = Math.floor((o.x + o.w + inf) / cs - 0.5);
        y0 = Math.ceil((o.y - inf) / cs - 0.5);
        y1 = Math.floor((o.y + o.h + inf) / cs - 0.5);
      }
      x0 = Math.max(0, x0);
      y0 = Math.max(0, y0);
      x1 = Math.min(this.navW - 1, x1);
      y1 = Math.min(this.navH - 1, y1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.blocked[y * this.navW + x] = 1;
    }
    // Prefer the middle of corridors: small cost next to walls.
    for (let y = 0; y < this.navH; y++) {
      for (let x = 0; x < this.navW; x++) {
        const i = y * this.navW + x;
        if (this.blocked[i]) continue;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= this.navW || ny >= this.navH || this.blocked[ny * this.navW + nx]) {
            this.penalty[i] = 6;
            break;
          }
        }
      }
    }
  }

  navIndex(x, y) {
    const cx = clamp(Math.floor(x / NAV_CELL), 0, this.navW - 1);
    const cy = clamp(Math.floor(y / NAV_CELL), 0, this.navH - 1);
    return cy * this.navW + cx;
  }

  cellCenter(i, out) {
    out.x = ((i % this.navW) + 0.5) * NAV_CELL;
    out.y = (Math.floor(i / this.navW) + 0.5) * NAV_CELL;
    return out;
  }

  nearestFree(i, maxR = 4) {
    if (!this.blocked[i]) return i;
    const cx = i % this.navW;
    const cy = Math.floor(i / this.navW);
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= this.navW || y >= this.navH) continue;
          const j = y * this.navW + x;
          if (!this.blocked[j]) return j;
        }
      }
    }
    return -1;
  }

  /**
   * Nearest position to (x, y) that the field reaches (e.g. to rescue a pickup
   * that landed in a pocket). Returns null if nothing within maxR cells.
   */
  reachableSpot(x, y, field, maxR = 5) {
    const i0 = this.navIndex(x, y);
    if (!this.blocked[i0] && field.dist[i0] < INF) return { x, y };
    const cx = i0 % this.navW;
    const cy = Math.floor(i0 / this.navW);
    const c = { x: 0, y: 0 };
    for (let r = 1; r <= maxR; r++) {
      let best = null;
      let bd = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const gx = cx + dx;
          const gy = cy + dy;
          if (gx < 0 || gy < 0 || gx >= this.navW || gy >= this.navH) continue;
          const j = gy * this.navW + gx;
          if (this.blocked[j] || field.dist[j] >= INF) continue;
          this.cellCenter(j, c);
          const d = Math.hypot(c.x - x, c.y - y);
          if (d < bd) {
            bd = d;
            best = { x: c.x, y: c.y };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Resolve a circle against nearby movement blockers. */
  collide(e, r) {
    const cx = clamp(Math.floor(e.x / BP_CELL), 0, this.bpW - 1);
    const cy = clamp(Math.floor(e.y / BP_CELL), 0, this.bpH - 1);
    const list = this.bp[cy * this.bpW + cx];
    let hit = false;
    for (let i = 0; i < list.length; i++) if (resolveCircleRect(e, r, list[i])) hit = true;
    return hit;
  }

  /** True if a circle at (x, y) overlaps no movement blocker. */
  isFree(x, y, r) {
    if (x < r || y < r || x > this.w - r || y > this.h - r) return false;
    const cx = clamp(Math.floor(x / BP_CELL), 0, this.bpW - 1);
    const cy = clamp(Math.floor(y / BP_CELL), 0, this.bpH - 1);
    for (const o of this.bp[cy * this.bpW + cx]) {
      const px = clamp(x, o.x, o.x + o.w);
      const py = clamp(y, o.y, o.y + o.h);
      if ((x - px) ** 2 + (y - py) ** 2 < r * r) return false;
    }
    return true;
  }

  /** Cast a ray (unit dir) against a blocker list. */
  raycast(ox, oy, dx, dy, maxDist, list = this.shotBlockers) {
    const ddx = Math.abs(dx) < 1e-9 ? 1e-9 : dx;
    const ddy = Math.abs(dy) < 1e-9 ? 1e-9 : dy;
    const idx = 1 / ddx;
    const idy = 1 / ddy;
    const ex = ox + dx * maxDist;
    const ey = oy + dy * maxDist;
    const minX = Math.min(ox, ex);
    const maxX = Math.max(ox, ex);
    const minY = Math.min(oy, ey);
    const maxY = Math.max(oy, ey);
    let best = maxDist;
    let hit = null;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.x > maxX || o.x + o.w < minX || o.y > maxY || o.y + o.h < minY) continue;
      const t = rayRect(ox, oy, idx, idy, o, best);
      if (t < best) {
        best = t;
        hit = o;
      }
    }
    return { t: best, obstacle: hit };
  }

  segmentClear(x0, y0, x1, y1, list = this.sightBlockers) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d < 1e-6) return true;
    return this.raycast(x0, y0, (x1 - x0) / d, (y1 - y0) / d, d, list).obstacle === null;
  }
}

/**
 * Dijkstra flow field toward one target (the survivor). Edge costs are small
 * integers (10 / 14 + wall penalty), so a bucket queue (Dial's algorithm)
 * replaces the heap: O(cells), no log factor.
 */
const BUCKETS = 32; // must exceed the largest edge cost (14 + 6)

export class FlowField {
  constructor(world) {
    this.world = world;
    const n = world.navW * world.navH;
    this.dist = new Int32Array(n).fill(INF);
    this.head = new Int32Array(BUCKETS);
    this.entryNode = new Int32Array(n * 8 + 16);
    this.entryNext = new Int32Array(n * 8 + 16);
    this.target = -1;
    this._c = { x: 0, y: 0 };
  }

  compute(x, y) {
    const W = this.world;
    const t = W.nearestFree(W.navIndex(x, y));
    if (t < 0) return;
    this.target = t;
    const dist = this.dist;
    const blocked = W.blocked;
    const pen = W.penalty;
    const nw = W.navW;
    const nh = W.navH;
    const head = this.head;
    const eNode = this.entryNode;
    const eNext = this.entryNext;
    dist.fill(INF);
    head.fill(-1);
    let entries = 0;
    let pending = 0;
    const push = (c, node) => {
      const b = c % BUCKETS;
      eNode[entries] = node;
      eNext[entries] = head[b];
      head[b] = entries++;
      pending++;
    };
    dist[t] = 0;
    push(0, t);
    for (let cur = 0; pending > 0; cur++) {
      const b = cur % BUCKETS;
      let e = head[b];
      head[b] = -1;
      while (e !== -1) {
        const next = eNext[e];
        pending--;
        const i = eNode[e];
        e = next;
        if (dist[i] !== cur) continue; // stale entry
        const cx = i % nw;
        const cy = (i - cx) / nw;
        for (let k = 0; k < 8; k++) {
          const d = DIRS[k];
          const nx = cx + d[0];
          const ny = cy + d[1];
          if (nx < 0 || ny < 0 || nx >= nw || ny >= nh) continue;
          const j = ny * nw + nx;
          if (blocked[j]) continue;
          if (k >= 4 && (blocked[cy * nw + nx] || blocked[ny * nw + cx])) continue; // no corner cutting
          const nc = cur + d[2] + pen[j];
          if (nc < dist[j]) {
            dist[j] = nc;
            push(nc, j);
          }
        }
      }
    }
  }

  _best(i) {
    const W = this.world;
    const nw = W.navW;
    const nh = W.navH;
    const cx = i % nw;
    const cy = (i - cx) / nw;
    let best = -1;
    let bestD = this.dist[i];
    for (let k = 0; k < 8; k++) {
      const d = DIRS[k];
      const nx = cx + d[0];
      const ny = cy + d[1];
      if (nx < 0 || ny < 0 || nx >= nw || ny >= nh) continue;
      const j = ny * nw + nx;
      if (W.blocked[j]) continue;
      if (k >= 4 && (W.blocked[cy * nw + nx] || W.blocked[ny * nw + cx])) continue;
      if (this.dist[j] < bestD) {
        bestD = this.dist[j];
        best = j;
      }
    }
    return best;
  }

  /** Path cost from (x, y) to the target in world units (Infinity if unreachable). */
  pathDist(x, y) {
    const W = this.world;
    const i = W.nearestFree(W.navIndex(x, y), 2);
    if (i < 0 || this.dist[i] >= INF) return Infinity;
    return (this.dist[i] / 10) * NAV_CELL;
  }

  /** Steering direction toward the target with two-cell look-ahead. */
  dirAt(x, y, out) {
    const W = this.world;
    let i = W.navIndex(x, y);
    if (W.blocked[i] || this.dist[i] >= INF) {
      // Squeezed into a wall's margin: head for the best free neighbour.
      const nw = W.navW;
      const cx = i % nw;
      const cy = (i - cx) / nw;
      let best = -1;
      let bestD = INF;
      for (const d of DIRS) {
        const nx = cx + d[0];
        const ny = cy + d[1];
        if (nx < 0 || ny < 0 || nx >= nw || ny >= W.navH) continue;
        const j = ny * nw + nx;
        if (!W.blocked[j] && this.dist[j] < bestD) {
          bestD = this.dist[j];
          best = j;
        }
      }
      if (best < 0) return false;
      i = best;
    } else {
      const j = this._best(i);
      if (j < 0) return false;
      const k = this._best(j);
      i = k >= 0 ? k : j;
    }
    const c = W.cellCenter(i, this._c);
    const dx = c.x - x;
    const dy = c.y - y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return false;
    out.x = dx / d;
    out.y = dy / d;
    return true;
  }
}

/** Uniform grid for dynamic entities (rebuilt every frame). */
export class SpatialHash {
  constructor(w, h, cell) {
    this.cell = cell;
    this.cw = Math.ceil(w / cell) + 1;
    this.ch = Math.ceil(h / cell) + 1;
    this.head = new Int32Array(this.cw * this.ch).fill(-1);
    this.next = new Int32Array(512);
    this.items = [];
  }

  clear() {
    this.head.fill(-1);
    this.items.length = 0;
  }

  _cell(x, y) {
    const cx = clamp(Math.floor(x / this.cell), 0, this.cw - 1);
    const cy = clamp(Math.floor(y / this.cell), 0, this.ch - 1);
    return cy * this.cw + cx;
  }

  insert(item) {
    const idx = this.items.length;
    this.items.push(item);
    if (idx >= this.next.length) {
      const n = new Int32Array(this.next.length * 2);
      n.set(this.next);
      this.next = n;
    }
    const c = this._cell(item.x, item.y);
    this.next[idx] = this.head[c];
    this.head[c] = idx;
  }

  query(x, y, r, fn) {
    const x0 = clamp(Math.floor((x - r) / this.cell), 0, this.cw - 1);
    const x1 = clamp(Math.floor((x + r) / this.cell), 0, this.cw - 1);
    const y0 = clamp(Math.floor((y - r) / this.cell), 0, this.ch - 1);
    const y1 = clamp(Math.floor((y + r) / this.cell), 0, this.ch - 1);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (let i = this.head[cy * this.cw + cx]; i !== -1; i = this.next[i]) fn(this.items[i]);
      }
    }
  }
}
