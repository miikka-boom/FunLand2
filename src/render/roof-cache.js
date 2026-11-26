// Roofs, painted once into pictures of their own and copied each frame.
//
// A roof is lit evenly (the night's roof light, not the lamps'), so all of it (its textured
// surface, the parapet, what stands on it) looks the same every frame until the camera's
// scale or tilt, the night look, or the textures change. For a camera that looks along the
// streets a roof is then an upright rectangle on screen, only moving with the camera: it is
// painted once into a canvas of its own (by the same drawing code, through a copy of the camera
// moved so the roof starts at the canvas's corner) and copied one to one on whole device pixels
// inside the building's own draw call, so it stays sorted with everything else.

const PAD = 2; // device px round the picture

export class RoofCache {
  constructor(makeCanvas = () => document.createElement('canvas')) {
    this.makeCanvas = makeCanvas;
    this.map = new Map(); // building -> { canvas, w, h, used }
    this.spare = [];
    this.key = '';
    this.frame = 0;
    this.px = 0; // pixels held
    this.maxPx = 5e6; // about 20 MB
    this.made = 0; // pictures made this frame (stats)
  }

  /** Can this camera use the pictures (the ground maps to the screen without a turn, heights show)? */
  static fits(v) {
    return !v.flat && Math.abs(v.ay) < 1e-9 && Math.abs(v.bx) < 1e-9 && v.ax > 0 && v.by > 0;
  }

  clear() {
    for (const e of this.map.values()) this.spare.push(e.canvas);
    this.map.clear();
    this.px = 0;
  }

  /** Each frame, before any roof is drawn: key is everything the pictures depend on. */
  begin(key) {
    if (key !== this.key) {
      this.clear();
      this.key = key;
    }
    this.frame++;
    this.made = 0;
    this._trim();
  }

  /**
   * Draw building o's roof: the world box x0..x1, y0..y1 between heights z0 and z1 holds all of
   * it. paint(R2) paints it through R2 (R with its own canvas and camera). R: the renderer's
   * drawing context (ctx, v, dpr, reset()).
   */
  draw(R, o, x0, y0, x1, y1, z0, z1, paint) {
    const v = R.v;
    const dpr = R.dpr;
    const sx0 = v.px(x0, y0);
    const sy0 = v.py(x0, y0, z1);
    let e = this.map.get(o);
    if (!e) {
      const sx1 = v.px(x1, y0);
      const sy1 = v.py(x0, y1, z0);
      const w = Math.ceil((sx1 - sx0) * dpr) + 2 * PAD;
      const h = Math.ceil((sy1 - sy0) * dpr) + 2 * PAD;
      const canvas = this.spare.pop() || this.makeCanvas();
      canvas.width = Math.max(1, w);
      canvas.height = Math.max(1, h);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      // The camera, moved so the box's corner is at (PAD, PAD): independent of where the camera
      // is looking, so the picture holds as it moves.
      const vv = Object.create(v);
      vv.ox = v.ox - sx0 + PAD / dpr;
      vv.oy = v.oy - sy0 + PAD / dpr;
      const R2 = Object.create(R);
      R2.ctx = ctx;
      R2.v = vv;
      R2.alpha = 1;
      R2.caching = true;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(R2);
      e = { canvas, w: canvas.width, h: canvas.height, used: this.frame };
      this.map.set(o, e);
      this.px += e.w * e.h;
      this.made++;
    }
    e.used = this.frame;
    const ctx = R.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(e.canvas, Math.round(sx0 * dpr) - PAD, Math.round(sy0 * dpr) - PAD);
    R.reset();
  }

  /** Over budget: let the pictures used longest ago go (never this frame's). */
  _trim() {
    if (this.px <= this.maxPx) return;
    const all = [...this.map.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [o, e] of all) {
      if (this.px <= this.maxPx * 0.8 || e.used >= this.frame - 1) break;
      this.map.delete(o);
      this.spare.push(e.canvas);
      this.px -= e.w * e.h;
    }
  }
}
