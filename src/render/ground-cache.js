// The ground, painted once into chunks and copied to the screen each frame.
//
// Filling the screen with repeating textures every frame costs a canvas drawn without a GPU
// some 20 ms; copying the same pixels from canvases already painted, one to one on whole device
// pixels, costs about what a flat fill did. So the static ground (streets, sidewalks, curbs,
// markings, the decor that lies still) is painted into square chunks of the map, CHUNK world
// units a side, at the camera's scale, and those are drawn instead. Only for a camera that
// looks along the streets (no turn: the ground maps to the screen by a scale and a shift);
// anything else, the renderer paints the ground itself as before.
//
// A chunk's pixels: chunk (i, j) starts at device pixel (round(K * i * C), round(L * j * C)) of
// the whole map at this scale (K, L: device px per world unit across and down), so neighbours
// meet on whole pixels with nothing doubled or missing between them. On screen every chunk is
// moved by the same whole-pixel camera offset, so the ground never shears at a chunk's edge.

export const CHUNK = 160;

export class GroundCache {
  constructor(makeCanvas = () => document.createElement('canvas')) {
    this.makeCanvas = makeCanvas;
    this.chunks = new Map(); // 'i,j' -> chunk
    this.spare = []; // canvases of chunks let go, to paint the next ones into
    this.key = '';
    this.frame = 0;
    this.max = 56; // chunks kept (about two screens' worth on a phone)
    this.painted = 0; // chunks painted this frame (stats)
    this.paintMs = 0;
  }

  clear() {
    for (const c of this.chunks.values()) this.spare.push(c.canvas);
    this.chunks.clear();
  }

  /** Can this camera use the cache (does the ground map to the screen without a turn)? */
  static fits(view) {
    return Math.abs(view.ay) < 1e-9 && Math.abs(view.bx) < 1e-9 && view.ax > 0 && view.by > 0;
  }

  /**
   * Draw the ground onto ctx (a canvas of device pixels) for camera view at dpr. key: what the
   * painted ground depends on besides the camera (the map, the look, the textures). paint(c, x0,
   * y0, x1, y1): paint the static ground of that world rect onto c, which is on a world -> chunk
   * pixel transform. prefetch: chunks next to the screen to paint ahead this frame. Returns
   * false when the camera doesn't fit (the caller paints the ground itself).
   */
  draw(ctx, view, dpr, key, paint, prefetch = 1) {
    if (!GroundCache.fits(view)) return false;
    const K = dpr * view.ax;
    const L = dpr * view.by;
    const k = `${key}|${K.toFixed(6)}|${L.toFixed(6)}`;
    if (k !== this.key) {
      this.clear();
      this.key = k;
    }
    this.frame++;
    this.painted = 0;
    this.paintMs = 0;
    const C = CHUNK;
    const OX = Math.round(dpr * view.ox);
    const OY = Math.round(dpr * view.oy);
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const i0 = Math.floor(-OX / K / C);
    const i1 = Math.floor((W - OX) / K / C);
    const j0 = Math.floor(-OY / L / C);
    const j1 = Math.floor((H - OY) / L / C);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = this._chunk(i, j, K, L, paint);
        ctx.drawImage(c.canvas, c.px + OX, c.py + OY);
      }
    }
    // Paint ahead: the ring of chunks round the screen, nearest the middle first.
    if (prefetch > 0) {
      const ci = (i0 + i1) / 2;
      const cj = (j0 + j1) / 2;
      let best = null;
      let bestD = Infinity;
      for (let j = j0 - 1; j <= j1 + 1; j++) {
        for (let i = i0 - 1; i <= i1 + 1; i++) {
          if (i >= i0 && i <= i1 && j >= j0 && j <= j1) continue;
          if (this.chunks.has(`${i},${j}`)) continue;
          const d = (i - ci) * (i - ci) + (j - cj) * (j - cj);
          if (d < bestD) {
            bestD = d;
            best = [i, j];
          }
        }
      }
      if (best) this._chunk(best[0], best[1], K, L, paint);
    }
    this._trim();
    return true;
  }

  _chunk(i, j, K, L, paint) {
    const id = `${i},${j}`;
    let c = this.chunks.get(id);
    if (c) {
      c.used = this.frame;
      return c;
    }
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const C = CHUNK;
    const px = Math.round(K * i * C);
    const py = Math.round(L * j * C);
    const w = Math.max(1, Math.round(K * (i + 1) * C) - px);
    const h = Math.max(1, Math.round(L * (j + 1) * C) - py);
    const canvas = this.spare.pop() || this.makeCanvas();
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const x = canvas.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, w, h);
    x.setTransform(K, 0, 0, L, -px, -py);
    // (A little past the chunk's edges, so the fills cover its edge pixels whole: a chunk's
    // edge falls between device pixels, and a half-covered pixel would show as a seam.)
    const m = 2 / Math.min(K, L);
    paint(x, i * C - m, j * C - m, (i + 1) * C + m, (j + 1) * C + m);
    c = { canvas, px, py, used: this.frame };
    this.chunks.set(id, c);
    this.painted++;
    if (t0) this.paintMs += performance.now() - t0;
    return c;
  }

  /** Let the chunks used longest ago go, past the limit. */
  _trim() {
    if (this.chunks.size <= this.max) return;
    const all = [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let n = all.length - this.max, k = 0; k < n; k++) {
      const [id, c] = all[k];
      if (c.used === this.frame) break; // never one on screen now
      this.chunks.delete(id);
      this.spare.push(c.canvas);
    }
  }
}
