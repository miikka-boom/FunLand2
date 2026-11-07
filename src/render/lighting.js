// Night + line-of-sight overlay, rendered at half resolution (soft edges for
// free) and stretched over the scene.
//   1. fill darkness
//   2. punch lights out with destination-out (ambient bubble, flashlight cone,
//      lamps, fires, muzzle flashes, safe rooms...)
//   3. re-darken everything the survivor can't see: one shadow quad per
//      sight-blocking rect, cast away from the eye.

import { pointInRect, rectsOverlap } from '../util.js';

const RES = 0.5;
const FAR = 6000;

export class Lighting {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  resize(w, h) {
    this.canvas.width = Math.max(1, Math.ceil(w * RES));
    this.canvas.height = Math.max(1, Math.ceil(h * RES));
  }

  render(game, camX, camY, vr) {
    const S = game.settings;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const s = game.view.scale * RES;
    const p = game.player;
    const t = game.time;

    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (S.night) {
      ctx.fillStyle = `rgba(3,5,10,${Math.min(0.97, S.darkness + (game.world.map.darknessBoost || 0))})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.setTransform(s, 0, 0, s, W / 2 - camX * s, H / 2 - camY * s);

    if (S.night) {
      ctx.globalCompositeOperation = 'destination-out';
      const map = game.world.map;
      // Survivor: small all-round bubble + flashlight.
      this.radial(ctx, p.x, p.y, 115, 0.9);
      if (p.alive) {
        const f = p.facing;
        this.cone(ctx, p.x, p.y, f, 0.56, 440, 0.7);
        this.cone(ctx, p.x, p.y, f, 0.4, 470, 0.6);
        this.cone(ctx, p.x, p.y, f, 0.24, 500, 0.55);
      }
      // The teammate carries a light too (dimmer); down, just a glow.
      const a = game.ally;
      if (a && a.alive && pointInRect(a.x, a.y, vr, 520)) {
        this.radial(ctx, a.x, a.y, a.down ? 70 : 85, 0.75);
        if (!a.down) {
          this.cone(ctx, a.x, a.y, a.facing, 0.42, 380, 0.55);
          this.cone(ctx, a.x, a.y, a.facing, 0.24, 420, 0.45);
        }
      }
      for (const l of map.lamps) {
        if (!pointInRect(l.x, l.y, vr, 170)) continue;
        if (l.broken && Math.sin(t * 13 + l.x) <= 0.6) continue;
        this.radial(ctx, l.x, l.y, l.r || 165, l.k || 0.62);
      }
      for (const s of map.signs || []) {
        if (pointInRect(s.x, s.y, vr, 60)) this.radial(ctx, s.x, s.y, 46, 0.32);
      }
      for (const g of map.glows || []) {
        if (pointInRect(g.x, g.y, vr, 90)) this.radial(ctx, g.x, g.y, g.r, g.k);
      }
      for (const f of map.fires) {
        if (!pointInRect(f.x, f.y, vr, 260)) continue;
        const fl = Math.sin(t * 11) * 0.06 + Math.sin(t * 23 + 1) * 0.04;
        this.radial(ctx, f.x, f.y, 230 * (1 + fl), 0.85);
      }
      for (const room of [map.startRoom, map.endRoom]) {
        if (!rectsOverlap(room.outer, vr)) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        const r = room.interior;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      // Goal beacon: pulsing, visible from the street.
      const er = map.endRoom.interior;
      this.radial(ctx, er.x + er.w / 2, er.y + er.h / 2, 190, 0.45 + Math.sin(t * 2.5) * 0.15);
      for (const k of game.pickups) {
        if (!k.taken && pointInRect(k.x, k.y, vr, 40)) this.radial(ctx, k.x, k.y, 38, 0.45);
      }
      // Unopened stashes give off a faint glow (the secret doesn't: you have to spot its glint).
      if (game.loot) {
        for (const s of game.loot.stashes) {
          if (!s.opened && s.tier !== 'secret' && pointInRect(s.x, s.y, vr, 40)) this.radial(ctx, s.x, s.y, 30, 0.3);
        }
      }
      for (const o of game.world.obstacles) {
        if (o.alarmOn && Math.sin(t * 10) > 0 && rectsOverlap(o, vr, 150)) this.radial(ctx, o.x + o.w / 2, o.y + o.h / 2, 140, 0.75);
      }
      if (game.events) {
        for (const b of game.events.burns) {
          if (!pointInRect(b.x, b.y, vr, b.r * 2)) continue;
          const k = Math.min(1, b.t / 3);
          this.radial(ctx, b.x, b.y, b.r * 1.9 * (0.6 + 0.4 * k), 0.9 * (0.5 + 0.5 * k) * (0.9 + 0.1 * Math.sin(t * 12)));
        }
      }
      for (const L of game.effects.lights) this.radial(ctx, L.x, L.y, L.r, L.k * (L.life / L.max));
      ctx.globalCompositeOperation = 'source-over';
    }

    if (S.los && p.alive) {
      ctx.fillStyle = S.night ? 'rgba(2,3,7,0.97)' : 'rgba(2,3,7,0.7)';
      ctx.beginPath();
      for (const o of game.world.sightBlockers) {
        if (o.kind === 'border' || !rectsOverlap(o, vr)) continue;
        this.shadow(ctx, p.x, p.y, o);
      }
      ctx.fill();
    }
  }

  radial(ctx, x, y, r, k) {
    if (k <= 0.01) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${k})`);
    g.addColorStop(0.5, `rgba(0,0,0,${k * 0.75})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  cone(ctx, x, y, ang, half, r, k) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${k})`);
    g.addColorStop(0.6, `rgba(0,0,0,${k * 0.85})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, ang - half, ang + half);
    ctx.closePath();
    ctx.fill();
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
