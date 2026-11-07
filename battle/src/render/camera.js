// Side-view camera: smooth auto-framing of the fight, manual pan/zoom, and
// trauma-style screen shake.

import { WORLD } from '../config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Arena framing for a w x h (CSS px) screen: the whole field plus `pad` world
 * px each side fills the width, and the ground sits as low as the bottom HUD
 * allows, so the castles' HP bars stay clear of the top HUD and the extra room
 * goes to the sky. opts: { hudTop, hudBottom (CSS px the HUD covers), pad
 * (world px, default 30), above (world px needed above the ground: castle,
 * flag and HP bars, default 290), below (world px of grass/dirt to keep in
 * view, default 44) }. Returns { x, zoom, groundFrac } (groundFrac as in Camera).
 * 844x390 with hudTop 40 / hudBottom 96 gives zoom ~0.54; 667x375 ~0.43.
 */
export function arenaFraming(w, h, opts = {}) {
  const pad = Number.isFinite(opts.pad) ? opts.pad : 30;
  const above = Number.isFinite(opts.above) ? opts.above : 290;
  const below = Number.isFinite(opts.below) ? opts.below : 44;
  const top = Math.max(0, opts.hudTop || 0);
  const bottom = Math.max(0, opts.hudBottom || 0);
  const band = Math.max(40, h - top - bottom);
  const zoom = Math.max(0.05, Math.min(w / (WORLD.width + 2 * pad), band / (above + below)));
  const ground = top + band - below * zoom; // screen y of the middle of the lanes
  return { x: WORLD.width / 2, zoom, groundFrac: clamp(ground / Math.max(1, h), 0.3, 0.95) };
}

export class Camera {
  constructor() {
    this.x = WORLD.width / 2;
    this.y = -120;
    this.zoom = 0.8;
    this.tx = this.x;
    this.tzoom = this.zoom;
    this.w = 1;
    this.h = 1;
    this.follow = true;
    this.trauma = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.groundFrac = 0.74; // where the ground line sits on screen (0 = top)
    this.groundTarget = 0.74;
    this.fast = false; // snappier tracking for the final-blow slow-mo
    this.t = 0;
  }

  setView(w, h) {
    this.w = w;
    this.h = h;
  }

  get minZoom() {
    return clamp(Math.min(this.w / (WORLD.width + 500), this.h / 900), 0.18, 1);
  }

  get maxZoom() {
    // Close-ups: units ~1/3 of the screen height at most
    return clamp(this.h / 210, 1.2, 4);
  }

  /** The zoom at which a world span fits the screen width. */
  fitZoom(span) {
    return clamp(this.w / span, this.minZoom, this.maxZoom);
  }

  /** Camera y that puts the ground line at groundFrac of the screen height. */
  yFor(zoom) {
    const groundMid = WORLD.laneDepth * 0.5;
    return groundMid - (this.groundFrac - 0.5) * (this.h / zoom);
  }

  frame(x0, x1, instant = false, maxZoom = Infinity) {
    const span = Math.max(80, x1 - x0);
    this.tx = (x0 + x1) / 2;
    this.tzoom = Math.min(this.fitZoom(span), maxZoom);
    if (instant) {
      this.x = this.tx;
      this.zoom = this.tzoom;
    }
  }

  /** Frame the whole arena (see arenaFraming) and stop auto-following. instant: no easing. */
  frameArena(opts = {}, instant = false) {
    const f = arenaFraming(this.w, this.h, opts);
    this.follow = false;
    this.tx = f.x;
    this.tzoom = f.zoom;
    this.groundTarget = f.groundFrac;
    if (instant) {
      this.x = f.x;
      this.zoom = f.zoom;
      this.groundFrac = f.groundFrac;
      this.y = this.yFor(this.zoom);
    }
    return f;
  }

  pan(dxScreen) {
    this.follow = false;
    this.tx -= dxScreen / this.zoom;
    this.x = this.tx;
    this.clampX();
  }

  zoomAt(factor, sx) {
    this.follow = false;
    const wx = this.x + (sx - this.w / 2) / this.zoom;
    const z = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    this.zoom = this.tzoom = z;
    // Keep the world point under the cursor fixed
    this.x = this.tx = wx - (sx - this.w / 2) / z;
    this.clampX();
  }

  clampX() {
    const half = this.w / 2 / this.zoom;
    const lo = -250 + half;
    const hi = WORLD.width + 250 - half;
    this.x = lo > hi ? WORLD.width / 2 : clamp(this.x, lo, hi);
    this.tx = lo > hi ? WORLD.width / 2 : clamp(this.tx, lo, hi);
  }

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** After a resize: keep the user's view, just bring it back inside the limits. */
  clampView() {
    this.zoom = clamp(this.zoom, this.minZoom, this.maxZoom);
    this.tzoom = clamp(this.tzoom, this.minZoom, this.maxZoom);
    this.clampX();
    this.y = this.yFor(this.zoom);
  }

  update(dt) {
    this.t += dt;
    const k = 1 - Math.exp(-dt * (this.fast ? 6 : 2.6));
    const kz = 1 - Math.exp(-dt * (this.fast ? 5 : 1.8));
    this.groundFrac += (this.groundTarget - this.groundFrac) * (1 - Math.exp(-dt * 2.5));
    this.x += (this.tx - this.x) * k;
    // Zoom in log space so it feels even
    this.zoom = Math.exp(Math.log(this.zoom) + (Math.log(this.tzoom) - Math.log(this.zoom)) * kz);
    this.clampX();
    this.y = this.yFor(this.zoom);
    // Shake: trauma^2, decays
    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    const s = this.trauma * this.trauma * 14;
    const t = this.t * 60;
    this.shakeX = s * (Math.sin(t * 1.13) * 0.6 + Math.sin(t * 2.71 + 1.3) * 0.4);
    this.shakeY = s * (Math.sin(t * 1.37 + 2.1) * 0.6 + Math.sin(t * 3.17) * 0.4);
  }

  /** Camera for the scenery (shake included so the world shakes together). */
  view() {
    return { x: this.x - this.shakeX / this.zoom, y: this.y - this.shakeY / this.zoom, zoom: this.zoom };
  }

  apply(ctx, dpr) {
    const v = this.view();
    const z = v.zoom * dpr;
    ctx.setTransform(z, 0, 0, z, dpr * (this.w / 2) - v.x * z, dpr * (this.h / 2) - v.y * z);
  }

  toWorld(sx, sy) {
    return [this.x + (sx - this.w / 2) / this.zoom, this.y + (sy - this.h / 2) / this.zoom];
  }

  toScreen(wx, wy) {
    return [(wx - this.x) * this.zoom + this.w / 2, (wy - this.y) * this.zoom + this.h / 2];
  }
}
