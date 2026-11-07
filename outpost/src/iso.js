// Isometric math, pure (no DOM): a 2:1 diamond grid. Tile (i, j) has its
// top corner at world point ((i - j) * TW/2, (i + j) * TH/2); i grows down to
// the right, j down to the left. Objects stand on footprints of w × h tiles
// and are drawn in depth order (the front-most tile they cover).

export const TW = 64; // tile width in world px
export const TH = 32; // tile height in world px
const HW = TW / 2;
const HH = TH / 2;

/** World point of the top corner of tile (i, j) (fractional i, j allowed). */
export function tileToWorld(i, j) {
  return { x: (i - j) * HW, y: (i + j) * HH };
}

/** Fractional tile coordinates under a world point. */
export function worldToTile(x, y) {
  const a = x / HW;
  const b = y / HH;
  return { i: (a + b) / 2, j: (b - a) / 2 };
}

/** The tile (integer) under a world point. */
export function tileAt(x, y) {
  const t = worldToTile(x, y);
  return { i: Math.floor(t.i), j: Math.floor(t.j) };
}

/** Centre of a footprint on the ground (world). */
export function footCenter(i, j, w = 1, h = 1) {
  return tileToWorld(i + w / 2, j + h / 2);
}

/** Bottom corner of a footprint (where a building's art stands). */
export function footBottom(i, j, w = 1, h = 1) {
  return tileToWorld(i + w, j + h);
}

/**
 * The bounding box of a footprint's diamond in world px:
 * { left, top, width, height } with width = (w + h) * TW/2.
 */
export function footBox(i, j, w = 1, h = 1) {
  const top = tileToWorld(i, j);
  const left = tileToWorld(i, j + h).x;
  const right = tileToWorld(i + w, j).x;
  const bottom = tileToWorld(i + w, j + h).y;
  return { left, top: top.y, width: right - left, height: bottom - top.y };
}

/** Draw order: things whose front corner is further down the screen go on top. */
export function depth(i, j, w = 1, h = 1) {
  return i + w + (j + h);
}

/** SVG points string for a footprint's diamond, relative to an origin. */
export function diamondPoints(i, j, w = 1, h = 1, ox = 0, oy = 0) {
  const p = [tileToWorld(i, j), tileToWorld(i + w, j), tileToWorld(i + w, j + h), tileToWorld(i, j + h)];
  return p.map((q) => `${(q.x - ox).toFixed(1)},${(q.y - oy).toFixed(1)}`).join(' ');
}

/** The world bounds of a cols × rows map. */
export function mapBounds(cols, rows) {
  return { left: -rows * HW, right: cols * HW, top: 0, bottom: (cols + rows) * HH };
}

/** Do two footprints overlap? */
export function overlaps(a, b) {
  return a.i < b.i + b.w && b.i < a.i + a.w && a.j < b.j + b.h && b.j < a.j + a.h;
}

/** Every tile of a footprint. */
export function tilesOf(i, j, w = 1, h = 1) {
  const out = [];
  for (let a = i; a < i + w; a++) for (let b = j; b < j + h; b++) out.push([a, b]);
  return out;
}

/**
 * A camera over the world: screen = (world - (x, y)) * zoom + viewport centre.
 * Bounds keep the map on screen; zoom is clamped.
 */
export class Camera {
  constructor({ x = 0, y = 0, zoom = 1, min = 0.45, max = 1.8 } = {}) {
    this.x = x;
    this.y = y;
    this.zoom = zoom;
    this.min = min;
    this.max = max;
    this.vw = 844;
    this.vh = 390;
    this.bounds = null; // world rect the centre may roam
    this.limit = null; // or a function (x, y) -> { x, y } that keeps the centre in bounds
  }

  setViewport(w, h) {
    this.vw = w;
    this.vh = h;
    this.clamp();
  }

  worldToScreen(x, y) {
    return { x: (x - this.x) * this.zoom + this.vw / 2, y: (y - this.y) * this.zoom + this.vh / 2 };
  }

  screenToWorld(sx, sy) {
    return { x: (sx - this.vw / 2) / this.zoom + this.x, y: (sy - this.vh / 2) / this.zoom + this.y };
  }

  panBy(dxScreen, dyScreen) {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.clamp();
  }

  /** Zoom by a factor keeping the screen point (sx, sy) fixed. */
  zoomAt(factor, sx, sy) {
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.min(this.max, Math.max(this.min, this.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  clamp() {
    if (this.limit) {
      const p = this.limit(this.x, this.y);
      this.x = p.x;
      this.y = p.y;
      return;
    }
    const b = this.bounds;
    if (!b) return;
    this.x = Math.min(b.right, Math.max(b.left, this.x));
    this.y = Math.min(b.bottom, Math.max(b.top, this.y));
  }

  /** CSS transform for the world layer (origin top-left). */
  css() {
    const tx = this.vw / 2 - this.x * this.zoom;
    const ty = this.vh / 2 - this.y * this.zoom;
    return `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${this.zoom.toFixed(4)})`;
  }
}
