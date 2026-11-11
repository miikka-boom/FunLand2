// Night + line of sight.
//
// One list of lights per frame feeds two things:
//   - the ground overlay, rendered at half resolution (soft edges for free)
//     and laid over the ground before anything that stands on it is drawn:
//       1. fill darkness
//       2. punch the lights out with destination-out (ambient bubble,
//          flashlight cone, lamps, fires, muzzle flashes, safe rooms...)
//       3. re-darken everything the survivor can't see: one shadow quad per
//          sight-blocking rect, cast away from the eye.
//   - sample() / visible() / lit(): the same sum worked out for one point, so
//     everything that stands up (walls, props, bodies) is shaded by the light
//     at its feet instead of by the ground that happens to be behind it on
//     screen.
// The lights live on the ground plane; the overlay is drawn through the
// camera's ground transform, so pools and cones foreshorten with the view.

import { pointInRect, rectsOverlap, lampLit } from '../util.js';
import { finaleLights } from '../game/finale.js';

const finaleTmp = [];

const RES = 0.5;
const FAR = 6000;
const RADIAL = 0;
const CONE = 1;
const RECT = 2;

export class Lighting {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.lights = [];
    this.n = 0;
    this.sight = []; // sight blockers near the view this frame
    this.night = true;
    this.los = false;
    this.dark = 0.8; // darkness where no light reaches
    this.hidden = 0.03; // what's left of the light out of the survivor's sight
    this.ex = 0;
    this.ey = 0;
  }

  resize(w, h) {
    this.canvas.width = Math.max(1, Math.ceil(w * RES));
    this.canvas.height = Math.max(1, Math.ceil(h * RES));
  }

  _light(type, x, y, r, k) {
    let L = this.lights[this.n];
    if (!L) L = this.lights[this.n] = { type: 0, x: 0, y: 0, r: 0, r2: 0, k: 0, ang: 0, half: 0, cos: 0, dx: 0, dy: 0, w: 0, h: 0 };
    this.n++;
    L.type = type;
    L.x = x;
    L.y = y;
    L.r = r;
    L.r2 = r * r;
    L.k = k;
    return L;
  }

  radial(x, y, r, k) {
    if (k > 0.01 && r > 0) this._light(RADIAL, x, y, r, k);
  }

  cone(x, y, ang, half, r, k) {
    if (k <= 0.01) return;
    const L = this._light(CONE, x, y, r, k);
    L.ang = ang;
    L.half = half;
    L.cos = Math.cos(half);
    L.dx = Math.cos(ang);
    L.dy = Math.sin(ang);
  }

  rect(x, y, w, h, k) {
    const L = this._light(RECT, x, y, 0, k);
    L.w = w;
    L.h = h;
  }

  /** Gather this frame's lights and sight blockers (vr: world rect around the view). */
  collect(game, vr) {
    const S = game.settings;
    const p = game.player;
    const t = game.time;
    const map = game.world.map;
    this.n = 0;
    this.night = !!S.night;
    this.los = !!S.los && p.alive;
    this.dark = S.night ? Math.min(0.97, S.darkness + (map.darknessBoost || 0)) : 0;
    this.hidden = S.night ? 0.03 : 0.3;
    this.ex = p.x;
    this.ey = p.y;

    const sight = this.sight;
    sight.length = 0;
    for (const o of game.world.sightBlockers) if (o.kind !== 'border' && rectsOverlap(o, vr)) sight.push(o);

    if (!S.night) return;
    // Survivor: small all-round bubble + flashlight.
    this.radial(p.x, p.y, 115, 0.9);
    if (p.alive) {
      const f = p.facing;
      this.cone(p.x, p.y, f, 0.56, 440, 0.7);
      this.cone(p.x, p.y, f, 0.4, 470, 0.6);
      this.cone(p.x, p.y, f, 0.24, 500, 0.55);
    }
    // The teammate carries a light too (dimmer); down, just a glow.
    const a = game.ally;
    if (a && a.alive && pointInRect(a.x, a.y, vr, 520)) {
      this.radial(a.x, a.y, a.down ? 70 : 85, 0.75);
      if (!a.down) {
        this.cone(a.x, a.y, a.facing, 0.42, 380, 0.55);
        this.cone(a.x, a.y, a.facing, 0.24, 420, 0.45);
      }
    }
    for (const l of map.lamps) {
      if (!pointInRect(l.x, l.y, vr, 170)) continue;
      if (!lampLit(l, t)) continue;
      this.radial(l.x, l.y, l.r || 165, l.k || 0.62);
    }
    for (const s of map.signs || []) {
      if (pointInRect(s.x, s.y, vr, 60)) this.radial(s.x, s.y, 46, 0.32);
    }
    for (const g of map.glows || []) {
      if (pointInRect(g.x, g.y, vr, 90)) this.radial(g.x, g.y, g.r, g.k);
    }
    for (const f of map.fires) {
      if (!pointInRect(f.x, f.y, vr, 260)) continue;
      const fl = Math.sin(t * 11) * 0.06 + Math.sin(t * 23 + 1) * 0.04;
      this.radial(f.x, f.y, 230 * (1 + fl), 0.85);
    }
    for (const room of [map.startRoom, map.endRoom]) {
      if (!rectsOverlap(room.outer, vr)) continue;
      const r = room.interior;
      this.rect(r.x, r.y, r.w, r.h, 0.55);
    }
    // Goal beacon: pulsing, visible from the street.
    const er = map.endRoom.interior;
    this.radial(er.x + er.w / 2, er.y + er.h / 2, 190, 0.45 + Math.sin(t * 2.5) * 0.15);
    for (const k of game.pickups) {
      if (!k.taken && pointInRect(k.x, k.y, vr, 40)) this.radial(k.x, k.y, 38, 0.45);
    }
    // Unopened stashes give off a faint glow (the secret doesn't: you have to spot its glint).
    if (game.loot) {
      for (const s of game.loot.stashes) {
        if (!s.opened && s.tier !== 'secret' && pointInRect(s.x, s.y, vr, 40)) this.radial(s.x, s.y, 30, 0.3);
      }
    }
    for (const o of game.world.obstacles) {
      if (o.alarmOn && Math.sin(t * 10) > 0 && rectsOverlap(o, vr, 150)) this.radial(o.x + o.w / 2, o.y + o.h / 2, 140, 0.75);
    }
    if (game.events) {
      for (const b of game.events.burns) {
        if (!pointInRect(b.x, b.y, vr, b.r * 2)) continue;
        const k = Math.min(1, b.t / 3);
        this.radial(b.x, b.y, b.r * 1.9 * (0.6 + 0.4 * k), 0.9 * (0.5 + 0.5 * k) * (0.9 + 0.1 * Math.sin(t * 12)));
      }
    }
    for (const L of game.effects.lights) this.radial(L.x, L.y, L.r, L.k * (L.life / L.max));
    // Pier 9: the flare overhead, the ferry's deck lights and searchlight.
    if (game.events && game.events.finale) {
      for (const L of finaleLights(game.events.finale, t, finaleTmp)) {
        if (L.cone !== undefined) this.cone(L.x, L.y, L.cone, L.half, L.r, L.k);
        else if (pointInRect(L.x, L.y, vr, L.r)) this.radial(L.x, L.y, L.r, L.k);
      }
    }
  }

  /** Paint the ground overlay for the lights gathered by collect(). */
  draw(game, view) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (this.night) {
      ctx.fillStyle = `rgba(3,5,10,${this.dark})`;
      ctx.fillRect(0, 0, W, H);
    }
    view.applyGround(ctx, RES, 0);

    if (this.night) {
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < this.n; i++) {
        const L = this.lights[i];
        if (L.type === RECT) {
          ctx.fillStyle = `rgba(0,0,0,${L.k})`;
          ctx.fillRect(L.x, L.y, L.w, L.h);
          continue;
        }
        const g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
        g.addColorStop(0, `rgba(0,0,0,${L.k})`);
        if (L.type === RADIAL) g.addColorStop(0.5, `rgba(0,0,0,${L.k * 0.75})`);
        else g.addColorStop(0.6, `rgba(0,0,0,${L.k * 0.85})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        if (L.type === RADIAL) ctx.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
        else {
          ctx.beginPath();
          ctx.moveTo(L.x, L.y);
          ctx.arc(L.x, L.y, L.r, L.ang - L.half, L.ang + L.half);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    if (this.los) {
      ctx.fillStyle = this.night ? 'rgba(2,3,7,0.97)' : 'rgba(2,3,7,0.7)';
      ctx.beginPath();
      for (const o of this.sight) this.shadow(ctx, this.ex, this.ey, o);
      ctx.fill();
    }
  }

  /** How bright the ground is at (x, y), 0..1, before line of sight. */
  sample(x, y) {
    if (!this.night) return 1;
    let dark = this.dark;
    const ls = this.lights;
    for (let i = 0; i < this.n; i++) {
      const L = ls[i];
      const dx = x - L.x;
      const dy = y - L.y;
      if (L.type === RECT) {
        if (dx >= 0 && dy >= 0 && dx <= L.w && dy <= L.h) dark *= 1 - L.k;
        continue;
      }
      const d2 = dx * dx + dy * dy;
      if (d2 >= L.r2) continue;
      const d = Math.sqrt(d2);
      const u = d / L.r;
      if (L.type === RADIAL) dark *= 1 - L.k * (u < 0.5 ? 1 - 0.5 * u : 1.5 * (1 - u));
      else if (d < 1 || dx * L.dx + dy * L.dy >= d * L.cos) dark *= 1 - L.k * (u < 0.6 ? 1 - 0.25 * u : 2.125 * (1 - u));
    }
    return 1 - dark;
  }

  /** Can the survivor see the ground point (x, y)? (Always true with line of sight off.) */
  visible(x, y) {
    if (!this.los) return true;
    const ex = this.ex;
    const ey = this.ey;
    const dx = x - ex;
    const dy = y - ey;
    const minX = dx < 0 ? x : ex;
    const maxX = dx < 0 ? ex : x;
    const minY = dy < 0 ? y : ey;
    const maxY = dy < 0 ? ey : y;
    const idx = 1 / (Math.abs(dx) < 1e-9 ? 1e-9 : dx);
    const idy = 1 / (Math.abs(dy) < 1e-9 ? 1e-9 : dy);
    const S = this.sight;
    for (let i = 0; i < S.length; i++) {
      const o = S[i];
      if (o.x > maxX || o.x + o.w < minX || o.y > maxY || o.y + o.h < minY) continue;
      let t1 = (o.x - ex) * idx;
      let t2 = (o.x + o.w - ex) * idx;
      let tmin = t1 < t2 ? t1 : t2;
      let tmax = t1 < t2 ? t2 : t1;
      t1 = (o.y - ey) * idy;
      t2 = (o.y + o.h - ey) * idy;
      const ymin = t1 < t2 ? t1 : t2;
      const ymax = t1 < t2 ? t2 : t1;
      if (ymin > tmin) tmin = ymin;
      if (ymax < tmax) tmax = ymax;
      if (tmax >= 0 && tmin <= tmax && tmin < 1) return false;
    }
    return true;
  }

  /** Brightness of something standing at (x, y): the light there, cut to almost nothing out of sight. */
  lit(x, y) {
    const b = this.sample(x, y);
    return this.visible(x, y) ? b : b * this.hidden;
  }

  /** Shadow quad behind an axis-aligned rect, seen from (px, py). */
  shadow(ctx, px, py, o) {
    const x0 = o.x;
    const y0 = o.y;
    const x1 = o.x + o.w;
    const y1 = o.y + o.h;
    let ax;
    let ay;
    let bx;
    let by;
    // Pick the two silhouette corners by which of the 8 regions the eye is in.
    if (px < x0) {
      if (py < y0) { ax = x1; ay = y0; bx = x0; by = y1; }
      else if (py > y1) { ax = x0; ay = y0; bx = x1; by = y1; }
      else { ax = x0; ay = y0; bx = x0; by = y1; }
    } else if (px > x1) {
      if (py < y0) { ax = x0; ay = y0; bx = x1; by = y1; }
      else if (py > y1) { ax = x1; ay = y0; bx = x0; by = y1; }
      else { ax = x1; ay = y0; bx = x1; by = y1; }
    } else if (py < y0) { ax = x0; ay = y0; bx = x1; by = y0; }
    else if (py > y1) { ax = x0; ay = y1; bx = x1; by = y1; }
    else return; // inside (shouldn't happen)

    // Consistent winding so nonzero fill unions overlapping quads.
    if ((ax - px) * (by - py) - (ay - py) * (bx - px) < 0) {
      let tmp = ax; ax = bx; bx = tmp;
      tmp = ay; ay = by; by = tmp;
    }
    const da = Math.hypot(ax - px, ay - py) || 1;
    const db = Math.hypot(bx - px, by - py) || 1;
    const fax = ax + ((ax - px) / da) * FAR;
    const fay = ay + ((ay - py) / da) * FAR;
    const fbx = bx + ((bx - px) / db) * FAR;
    const fby = by + ((by - py) / db) * FAR;
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(fbx, fby);
    ctx.lineTo(fax, fay);
    ctx.closePath();
  }
}
