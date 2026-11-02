// World renderer. Draw order:
//   ground -> blood decals -> low props -> pickups -> corpses -> zombies ->
//   survivor -> particles -> [darkness + LOS overlay] -> bright fx (tracers,
//   laser, flashes, fire) -> roofs -> HUD.

import { Lighting } from './lighting.js';
import { drawHud } from './hud.js';
import { rrect, circle, hash01 } from './draw-utils.js';
import { TAU, rectsOverlap, pointInRect } from '../util.js';

const GROUND = {
  street: '#24272b',
  sidewalk: '#33363a',
  curb: '#44474c',
  buildings: '#2a2c30',
  start: '#2a2c30',
  end: '#2a2c30',
  parking: '#27292d',
  park: '#1e2b1c',
  plaza: '#393632',
  construction: '#382f24',
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.lighting = new Lighting();
    this.dpr = 1;
    this.w = 1;
    this.h = 1;
  }

  resize(w, h) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.lighting.resize(w, h);
  }

  render(game, input, ui) {
    const ctx = this.ctx;
    const S = game.settings;
    const dpr = this.dpr;
    const v = game.view;
    const cam = game.camera;
    const camX = cam.x + cam.shakeX;
    const camY = cam.y + cam.shakeY;
    const s = v.scale;
    this.camX = camX;
    this.camY = camY;
    const setWorld = () => ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (v.w / 2 - camX * s), dpr * (v.h / 2 - camY * s));
    setWorld();
    const vr = { x: camX - v.w / 2 / s - 30, y: camY - v.h / 2 / s - 30, w: v.w / s + 60, h: v.h / s + 60 };
    this.vr = vr;

    ctx.fillStyle = '#060709';
    ctx.fillRect(vr.x, vr.y, vr.w, vr.h);
    this.drawGround(ctx, game, vr);

    // Blood decal layer (low-res world canvas, soft when upscaled).
    const fx = game.effects;
    const ds = fx.decalScale;
    const sx = Math.max(0, vr.x * ds);
    const sy = Math.max(0, vr.y * ds);
    const sw = Math.min(fx.decal.width - sx, vr.w * ds);
    const sh = Math.min(fx.decal.height - sy, vr.h * ds);
    if (sw > 0 && sh > 0) ctx.drawImage(fx.decal, sx, sy, sw, sh, sx / ds, sy / ds, sw / ds, sh / ds);

    this.drawProps(ctx, game, vr);
    this.drawPickups(ctx, game, vr);
    this.drawCorpses(ctx, game, vr);
    this.drawGroundParticles(ctx, game, vr);
    this.drawZombies(ctx, game, vr);
    this.drawPlayer(ctx, game);
    this.drawAirParticles(ctx, game, vr);

    if (S.night || S.los) {
      this.lighting.render(game, camX, camY, vr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.lighting.canvas, 0, 0, this.canvas.width, this.canvas.height);
      setWorld();
    }

    this.drawBright(ctx, game, vr);
    this.drawRoofs(ctx, game, vr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawHud(ctx, game, input, ui, this);
  }

  // --- Ground -------------------------------------------------------------------

  drawGround(ctx, game, vr) {
    const map = game.world.map;
    ctx.fillStyle = GROUND.street;
    ctx.fillRect(Math.max(0, vr.x), Math.max(0, vr.y), Math.min(map.w, vr.x + vr.w) - Math.max(0, vr.x), Math.min(map.h, vr.y + vr.h) - Math.max(0, vr.y));

    for (const b of map.blocks) {
      if (!rectsOverlap(b, vr)) continue;
      ctx.fillStyle = GROUND.sidewalk;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      const i = b.inner;
      ctx.fillStyle = GROUND[b.type] || GROUND.buildings;
      ctx.fillRect(i.x, i.y, i.w, i.h);
      ctx.strokeStyle = GROUND.curb;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      if (b.type === 'plaza') {
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = i.x + 40; x < i.x + i.w; x += 40) {
          ctx.moveTo(x, i.y);
          ctx.lineTo(x, i.y + i.h);
        }
        for (let y = i.y + 40; y < i.y + i.h; y += 40) {
          ctx.moveTo(i.x, y);
          ctx.lineTo(i.x + i.w, y);
        }
        ctx.stroke();
      }
    }

    // Safe room floors.
    for (const room of [map.startRoom, map.endRoom]) {
      const r = room.interior;
      if (!rectsOverlap(r, vr)) continue;
      ctx.fillStyle = '#3b3f3b';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#333733';
      for (let y = r.y; y < r.y + r.h; y += 24) {
        for (let x = r.x + (((y - r.y) / 24) % 2) * 24; x < r.x + r.w; x += 48) {
          ctx.fillRect(x, y, Math.min(24, r.x + r.w - x), Math.min(24, r.y + r.h - y));
        }
      }
    }
    const er = map.endRoom.interior;
    if (rectsOverlap(er, vr)) {
      ctx.fillStyle = 'rgba(90,255,140,0.12)';
      ctx.fillRect(er.x + 20, er.y + er.h / 2 - 22, er.w - 40, 44);
      ctx.fillStyle = 'rgba(120,255,160,0.5)';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SAFE ROOM', er.x + er.w / 2, er.y + er.h / 2 + 1);
    }

    const mk = map.markings;
    ctx.strokeStyle = 'rgba(190,160,70,0.45)';
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 24]);
    ctx.beginPath();
    for (const d of mk.dashes) {
      ctx.moveTo(d.x0, d.y0);
      ctx.lineTo(d.x1, d.y1);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(220,220,210,0.16)';
    for (const c of mk.crosswalks) {
      if (!rectsOverlap(c, vr)) continue;
      if (c.dir === 'h') for (let x = c.x + 8; x < c.x + c.w - 8; x += 18) ctx.fillRect(x, c.y, 9, c.h);
      else for (let y = c.y + 8; y < c.y + c.h - 8; y += 18) ctx.fillRect(c.x, y, c.w, 9);
    }
    ctx.strokeStyle = 'rgba(220,220,210,0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const p of mk.parking) {
      if (!rectsOverlap(p, vr)) continue;
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y + p.h);
    }
    ctx.stroke();

    for (const d of map.decor) {
      if (d.x < vr.x - 40 || d.x > vr.x + vr.w + 40 || d.y < vr.y - 40 || d.y > vr.y + vr.h + 40) continue;
      switch (d.type) {
        case 'puddle':
          ctx.fillStyle = 'rgba(70,90,110,0.18)';
          ctx.beginPath();
          ctx.ellipse(d.x, d.y, 26 * d.s, 14 * d.s, d.a, 0, TAU);
          ctx.fill();
          break;
        case 'crack':
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(d.x - 18 * d.s, d.y - 4);
          ctx.lineTo(d.x - 4, d.y + 3 * d.s);
          ctx.lineTo(d.x + 7, d.y - 2);
          ctx.lineTo(d.x + 20 * d.s, d.y + 5);
          ctx.stroke();
          break;
        case 'trash':
          ctx.fillStyle = 'rgba(160,150,130,0.35)';
          ctx.fillRect(d.x - 4, d.y - 3, 7, 5);
          ctx.fillRect(d.x + 6, d.y + 2, 4, 3);
          ctx.fillRect(d.x - 9, d.y + 5, 5, 3);
          break;
        case 'manhole':
          ctx.strokeStyle = 'rgba(0,0,0,0.45)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          circle(ctx, d.x, d.y, 11);
          ctx.stroke();
          break;
        case 'leaves':
          ctx.fillStyle = 'rgba(90,80,40,0.35)';
          for (let k = 0; k < 6; k++) ctx.fillRect(d.x + (hash01(d.x + k) - 0.5) * 40 * d.s, d.y + (hash01(d.y + k * 3) - 0.5) * 40 * d.s, 3, 2);
          break;
        default:
          break;
      }
    }
  }

  // --- Props (low obstacles, drawn under the darkness) ----------------------------

  drawProps(ctx, game, vr) {
    const t = game.time;
    for (const o of game.world.obstacles) {
      if (o.sight || !rectsOverlap(o, vr)) continue;
      switch (o.kind) {
        case 'car':
          this.drawCar(ctx, o, t);
          break;
        case 'crate':
          if (o.pipe) {
            ctx.fillStyle = '#4a5560';
            ctx.fillRect(o.x, o.y, o.w, o.h);
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            if (o.w > o.h) for (let x = o.x + 26; x < o.x + o.w; x += 26) { ctx.moveTo(x, o.y); ctx.lineTo(x, o.y + o.h); }
            else for (let y = o.y + 26; y < o.y + o.h; y += 26) { ctx.moveTo(o.x, y); ctx.lineTo(o.x + o.w, y); }
            ctx.stroke();
          } else {
            ctx.fillStyle = '#6b5233';
            ctx.fillRect(o.x, o.y, o.w, o.h);
            ctx.strokeStyle = 'rgba(30,20,10,0.6)';
            ctx.lineWidth = 2;
            ctx.strokeRect(o.x + 2, o.y + 2, o.w - 4, o.h - 4);
            ctx.beginPath();
            ctx.moveTo(o.x + 3, o.y + 3);
            ctx.lineTo(o.x + o.w - 3, o.y + o.h - 3);
            ctx.moveTo(o.x + o.w - 3, o.y + 3);
            ctx.lineTo(o.x + 3, o.y + o.h - 3);
            ctx.stroke();
          }
          break;
        case 'dumpster':
          ctx.fillStyle = o.color || '#2f4f3a';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(o.x + 3, o.y + 3, o.w / 2 - 4, o.h - 6);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(o.x + o.w / 2 + 1, o.y + 3, o.w / 2 - 4, o.h - 6);
          break;
        case 'fence':
          ctx.fillStyle = 'rgba(120,128,135,0.55)';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = '#7d858c';
          if (o.w > o.h) for (let x = o.x; x <= o.x + o.w; x += 32) ctx.fillRect(x - 2, o.y - 1, 4, o.h + 2);
          else for (let y = o.y; y <= o.y + o.h; y += 32) ctx.fillRect(o.x - 1, y - 2, o.w + 2, 4);
          break;
        case 'planter':
          ctx.fillStyle = '#56534d';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = '#2c4528';
          ctx.fillRect(o.x + 5, o.y + 5, o.w - 10, o.h - 10);
          break;
        case 'bench':
          ctx.fillStyle = '#5a4632';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 1;
          ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1);
          break;
        case 'tree': {
          const cx = o.x + o.w / 2;
          const cy = o.y + o.h / 2;
          ctx.fillStyle = '#16241a';
          ctx.beginPath();
          circle(ctx, cx + 3, cy + 4, o.w * 0.78);
          ctx.fill();
          ctx.fillStyle = '#23402a';
          ctx.beginPath();
          circle(ctx, cx, cy, o.w * 0.75);
          ctx.fill();
          ctx.fillStyle = '#2d5234';
          ctx.beginPath();
          circle(ctx, cx - 5, cy - 6, o.w * 0.42);
          ctx.fill();
          break;
        }
        case 'fountain': {
          const cx = o.x + o.w / 2;
          const cy = o.y + o.h / 2;
          ctx.fillStyle = '#4f5a60';
          ctx.beginPath();
          circle(ctx, cx, cy, o.w / 2);
          ctx.fill();
          ctx.fillStyle = '#25414f';
          ctx.beginPath();
          circle(ctx, cx, cy, o.w / 2 - 8);
          ctx.fill();
          ctx.fillStyle = '#5d6970';
          ctx.beginPath();
          circle(ctx, cx, cy, 9);
          ctx.fill();
          break;
        }
        case 'statue':
          ctx.fillStyle = '#4c4a46';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = '#625f59';
          ctx.beginPath();
          circle(ctx, o.x + o.w / 2, o.y + o.h / 2, o.w * 0.3);
          ctx.fill();
          break;
        default:
          break;
      }
    }
  }

  drawCar(ctx, o, t) {
    const vert = o.h > o.w;
    const L = vert ? o.h : o.w;
    const front = o.front || 1;
    // Positions along the car's length, measured from its front.
    const seg = (a, b, inset) => {
      const p0 = front > 0 ? L - b * L : a * L;
      const p1 = front > 0 ? L - a * L : b * L;
      return vert
        ? [o.x + inset, o.y + p0, o.w - inset * 2, p1 - p0]
        : [o.x + p0, o.y + inset, p1 - p0, o.h - inset * 2];
    };
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(o.x + 3, o.y + 4, o.w, o.h);
    ctx.fillStyle = o.color;
    ctx.beginPath();
    rrect(ctx, o.x, o.y, o.w, o.h, 8);
    ctx.fill();
    if (o.wreck) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(...seg(0.18, 0.85, 5));
      return;
    }
    ctx.fillStyle = '#1b2430';
    ctx.fillRect(...seg(0.24, 0.4, 5)); // windscreen
    ctx.fillRect(...seg(0.72, 0.84, 6)); // rear window
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(...seg(0.4, 0.72, 6)); // roof
    if (o.alarm && !o.alarmDone && !o.alarmOn) {
      // L4D tell: a blinking red light on the dash.
      const on = Math.sin(t * 6) > 0.3;
      if (on) {
        const r = seg(0.3, 0.34, o.w * 0.3);
        ctx.fillStyle = '#ff2a2a';
        ctx.fillRect(r[0], r[1], r[2], r[3]);
      }
    }
  }

  // --- Entities ----------------------------------------------------------------------

  drawPickups(ctx, game, vr) {
    for (const k of game.pickups) {
      if (k.taken || !pointInRect(k.x, k.y, vr)) continue;
      const bob = Math.sin(game.time * 3 + k.bob) * 1.5;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(k.x - 9, k.y - 5, 20, 14);
      ctx.fillStyle = '#e8e8e2';
      ctx.beginPath();
      rrect(ctx, k.x - 10, k.y - 8 + bob, 20, 15, 3);
      ctx.fill();
      ctx.fillStyle = '#d0302a';
      ctx.fillRect(k.x - 2, k.y - 6 + bob, 4, 11);
      ctx.fillRect(k.x - 6, k.y - 2.5 + bob, 12, 4);
    }
  }

  drawCorpses(ctx, game, vr) {
    for (const c of game.effects.corpses) {
      if (!pointInRect(c.x, c.y, vr)) continue;
      const fade = c.t > 48 ? Math.max(0, (50 - c.t) / 2) : 1;
      ctx.globalAlpha = 0.85 * fade;
      const ca = Math.cos(c.ang);
      const sa = Math.sin(c.ang);
      // Body, head flung in the hit direction, one arm splayed.
      ctx.fillStyle = c.shirt;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.r * 1.15, c.r * 0.8, c.ang, 0, TAU);
      ctx.fill();
      ctx.fillStyle = c.skin;
      ctx.beginPath();
      circle(ctx, c.x + ca * c.r * 1.2, c.y + sa * c.r * 1.2, c.r * 0.5);
      ctx.fill();
      ctx.strokeStyle = c.skin;
      ctx.lineWidth = c.r * 0.38;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(c.x - sa * c.r * 0.6 * c.flip, c.y + ca * c.r * 0.6 * c.flip);
      ctx.lineTo(c.x + (ca * 0.6 - sa * 1.3 * c.flip) * c.r, c.y + (sa * 0.6 + ca * 1.3 * c.flip) * c.r);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawGroundParticles(ctx, game, vr) {
    for (const p of game.effects.particles) {
      if (p.kind !== 'casing' || !pointInRect(p.x, p.y, vr)) continue;
      const a = p.life < 1 ? p.life : 1;
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.shell ? '#b02a22' : '#c9a33f';
      ctx.lineWidth = p.shell ? 2.6 : 1.6;
      const len = p.shell ? 3.2 : 2.2;
      const c = Math.cos(p.rot) * len;
      const s = Math.sin(p.rot) * len;
      ctx.beginPath();
      ctx.moveTo(p.x - c, p.y - s - p.z * 0.6);
      ctx.lineTo(p.x + c, p.y + s - p.z * 0.6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawZombies(ctx, game, vr) {
    ctx.lineCap = 'round';
    const t = game.time;
    for (const z of game.zombies) {
      if (!z.alive || z.x < vr.x || z.x > vr.x + vr.w || z.y < vr.y || z.y > vr.y + vr.h) continue;
      const r = z.r;
      let f = z.face;
      if (z.stagger > 0) f += Math.sin(t * 30 + z.id) * 0.35;
      const ca = Math.cos(f);
      const sa = Math.sin(f);
      const chasing = z.state === 'chase' && z.alertDelay <= 0;
      // Arms: reach forward while hunting, hang and sway while shambling.
      const swing = Math.sin(z.anim * (chasing ? 14 : 4)) * (chasing ? 0.25 : 0.4);
      const reach = (chasing ? 1.25 : 0.75) + (z.windup > 0 ? 0.45 : 0);
      const sideX = -sa * r * 0.62;
      const sideY = ca * r * 0.62;
      ctx.strokeStyle = z.skin;
      ctx.lineWidth = r * 0.42;
      ctx.beginPath();
      for (const side of [-1, 1]) {
        const sx = z.x + sideX * side;
        const sy = z.y + sideY * side;
        const sw = side * swing;
        const ex = sx + (ca - sa * sw * 0.6) * r * reach;
        const ey = sy + (sa + ca * sw * 0.6) * r * reach;
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
      }
      ctx.stroke();
      ctx.fillStyle = z.shirt;
      ctx.beginPath();
      ctx.ellipse(z.x, z.y, r * 0.78, r, f, 0, TAU);
      ctx.fill();
      ctx.fillStyle = z.skin;
      ctx.beginPath();
      circle(ctx, z.x + ca * r * 0.18, z.y + sa * r * 0.18, r * 0.52);
      ctx.fill();
      if (z.hitFlash > 0) {
        ctx.fillStyle = 'rgba(255,240,230,0.55)';
        ctx.beginPath();
        circle(ctx, z.x, z.y, r * 1.05);
        ctx.fill();
      }
    }
  }

  drawPlayer(ctx, game) {
    const p = game.player;
    if (!p.alive && game.endT > 0.8) {
      ctx.fillStyle = '#2d6f7a';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r * 1.2, p.r * 0.8, p.facing, 0, TAU);
      ctx.fill();
      return;
    }
    const f = p.facing;
    const ca = Math.cos(f);
    const sa = Math.sin(f);
    const r = p.r;
    const bob = Math.sin(p.walk) * 1.2;
    const rec = p.recoil * 4;

    // Survivor ring so you never lose yourself in a crowd.
    ctx.strokeStyle = p.hurtT > 0 ? 'rgba(255,90,80,0.8)' : 'rgba(120,230,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    circle(ctx, p.x, p.y, r + 5);
    ctx.stroke();

    const def = p.weapon.def;
    const gunLen = def.id === 'hunting' ? 26 : def.id === 'shotgun' ? 22 : def.id === 'rifle' ? 22 : 16;
    const gx = p.x + ca * (r * 0.4 - rec);
    const gy = p.y + sa * (r * 0.4 - rec);
    // Arms to the gun.
    ctx.strokeStyle = '#c99a78';
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x - sa * r * 0.7, p.y + ca * r * 0.7);
    ctx.lineTo(gx + ca * 8, gy + sa * 8);
    ctx.moveTo(p.x + sa * r * 0.7, p.y - ca * r * 0.7);
    ctx.lineTo(gx + ca * 3 + sa * 2, gy + sa * 3 - ca * 2);
    ctx.stroke();
    // Gun.
    ctx.strokeStyle = '#15171a';
    ctx.lineWidth = def.id === 'shotgun' ? 5 : 4;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + ca * gunLen, gy + sa * gunLen);
    ctx.stroke();
    // Backpack + body + head.
    ctx.fillStyle = '#3a3226';
    ctx.beginPath();
    ctx.ellipse(p.x - ca * r * 0.55, p.y - sa * r * 0.55 + bob * 0.2, r * 0.45, r * 0.62, f, 0, TAU);
    ctx.fill();
    ctx.fillStyle = p.hurtT > 0 ? '#9a3a36' : '#2f8291';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r * 0.8, r, f, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#6b4a2e';
    ctx.beginPath();
    circle(ctx, p.x + ca * r * 0.1, p.y + sa * r * 0.1, r * 0.5);
    ctx.fill();
    ctx.fillStyle = '#d2a582';
    ctx.beginPath();
    circle(ctx, p.x + ca * r * 0.25, p.y + sa * r * 0.25, r * 0.3);
    ctx.fill();
  }

  drawAirParticles(ctx, game, vr) {
    for (const p of game.effects.particles) {
      if (p.x < vr.x || p.x > vr.x + vr.w || p.y < vr.y || p.y > vr.y + vr.h) continue;
      if (p.kind === 'blood') {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2 - p.z * 0.5, p.size, p.size);
      } else if (p.kind === 'gib') {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2 - p.z * 0.5, p.size, p.size * 0.7);
      } else if (p.kind === 'smoke' || p.kind === 'dust') {
        const a = (p.life / p.max) * (p.kind === 'smoke' ? 0.22 : 0.18);
        ctx.fillStyle = p.kind === 'smoke' ? `rgba(60,60,62,${a})` : `rgba(150,140,120,${a})`;
        ctx.beginPath();
        circle(ctx, p.x, p.y, p.size);
        ctx.fill();
      }
    }
  }

  // --- Bright things drawn over the darkness -----------------------------------------

  drawBright(ctx, game, vr) {
    const S = game.settings;
    const fx = game.effects;
    const p = game.player;
    const t = game.time;

    // Laser sight / shotgun cone.
    if (S.laser && p.alive && (p.aimActive || p.aimHoldT > 0) && !game.won) {
      const def = p.weapon.def;
      const ca = Math.cos(p.fireAngle);
      const sa = Math.sin(p.fireAngle);
      const wall = game.world.raycast(p.x, p.y, ca, sa, def.range, game.world.shotBlockers);
      let tEnd = wall.t;
      for (const z of game.zombies) {
        if (!z.alive) continue;
        const fx2 = z.x - p.x;
        const fy2 = z.y - p.y;
        const along = fx2 * ca + fy2 * sa;
        if (along < 0 || along > tEnd) continue;
        if (Math.abs(fx2 * sa - fy2 * ca) < z.r) tEnd = Math.min(tEnd, along - z.r * 0.6);
      }
      const x0 = p.x + ca * (p.r + 12);
      const y0 = p.y + sa * (p.r + 12);
      const alpha = p.aimActive ? (p.firing ? 0.55 : 0.4) : 0.18;
      if (def.pellets > 1) {
        const spread = (def.spread * Math.PI) / 180;
        ctx.strokeStyle = `rgba(255,90,70,${alpha * 0.55})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const sgn of [-1, 1]) {
          ctx.moveTo(x0, y0);
          ctx.lineTo(p.x + Math.cos(p.fireAngle + sgn * spread) * def.range, p.y + Math.sin(p.fireAngle + sgn * spread) * def.range);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(255,60,50,${alpha})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(p.x + ca * tEnd, p.y + sa * tEnd);
      ctx.stroke();
      if (tEnd < def.range - 1) {
        ctx.fillStyle = `rgba(255,80,60,${alpha + 0.3})`;
        ctx.beginPath();
        circle(ctx, p.x + ca * tEnd, p.y + sa * tEnd, 2.2);
        ctx.fill();
      }
      if (p.assist && p.assist.alive) {
        ctx.strokeStyle = `rgba(255,120,90,${alpha * 0.7})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        circle(ctx, p.assist.x, p.assist.y, p.assist.r + 5);
        ctx.stroke();
      }
    }

    ctx.globalCompositeOperation = 'lighter';
    // Tracers.
    ctx.lineCap = 'round';
    for (const tr of fx.tracers) {
      const a = tr.life / tr.max;
      ctx.strokeStyle = `rgba(${tr.rgb[0]},${tr.rgb[1]},${tr.rgb[2]},${0.85 * a})`;
      ctx.lineWidth = tr.width;
      ctx.beginPath();
      // Tracer streaks toward the hit: tail catches up as it fades.
      const k = 1 - a;
      ctx.moveTo(tr.x0 + (tr.x1 - tr.x0) * k * 0.7, tr.y0 + (tr.y1 - tr.y0) * k * 0.7);
      ctx.lineTo(tr.x1, tr.y1);
      ctx.stroke();
    }
    // Muzzle flashes.
    for (const m of fx.flashes) {
      const a = m.life / m.max;
      const ca = Math.cos(m.ang);
      const sa = Math.sin(m.ang);
      const L = 16 * m.size;
      const W = 6 * m.size;
      ctx.fillStyle = `rgba(255,210,120,${0.9 * a})`;
      ctx.beginPath();
      ctx.moveTo(m.x - sa * W, m.y + ca * W);
      ctx.lineTo(m.x + ca * L, m.y + sa * L);
      ctx.lineTo(m.x + sa * W, m.y - ca * W);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(255,240,200,${a})`;
      ctx.beginPath();
      circle(ctx, m.x, m.y, 4 * m.size);
      ctx.fill();
    }
    // Sparks + embers.
    for (const s of fx.particles) {
      if (s.kind !== 'spark') continue;
      const a = Math.max(0, s.life / s.max);
      ctx.fillStyle = `rgba(255,${180 + ((s.size * 30) | 0)},90,${a})`;
      ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    }
    // Fires on wrecks.
    for (const f of game.world.map.fires) {
      if (!pointInRect(f.x, f.y, vr)) continue;
      for (let k = 0; k < 5; k++) {
        const fl = Math.sin(t * (9 + k * 2.3) + k * 1.7) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255,${120 + k * 20},40,${0.25 + fl * 0.25})`;
        ctx.beginPath();
        circle(ctx, f.x + Math.sin(k * 2.1) * 12, f.y + Math.cos(k * 1.3) * 18 - fl * 4, 6 + fl * 6);
        ctx.fill();
      }
    }
    // Lamp heads.
    for (const l of game.world.map.lamps) {
      if (!pointInRect(l.x, l.y, vr)) continue;
      const on = !l.broken || Math.sin(t * 13 + l.x) > 0.6;
      ctx.fillStyle = on ? 'rgba(255,210,150,0.55)' : 'rgba(80,80,80,0.4)';
      ctx.beginPath();
      circle(ctx, l.x, l.y, 3);
      ctx.fill();
    }
    // Alarm car going off: hazard lights.
    for (const o of game.world.obstacles) {
      if (!o.alarmOn || !rectsOverlap(o, vr)) continue;
      if (Math.sin(t * 10) > 0) {
        ctx.fillStyle = 'rgba(255,170,60,0.9)';
        for (const [cx, cy] of [[o.x + 5, o.y + 5], [o.x + o.w - 5, o.y + 5], [o.x + 5, o.y + o.h - 5], [o.x + o.w - 5, o.y + o.h - 5]]) {
          ctx.beginPath();
          circle(ctx, cx, cy, 4);
          ctx.fill();
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // Shove swoosh.
    for (const a of fx.arcs) {
      const k = a.life / a.max;
      ctx.fillStyle = `rgba(230,240,255,${0.22 * k})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.arc(a.x, a.y, a.reach * (1.05 - k * 0.2), a.ang - 1.1, a.ang + 1.1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * k})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.reach * (1.05 - k * 0.2), a.ang - 1.0, a.ang + 1.0);
      ctx.stroke();
    }
  }

  // --- Roofs and walls (above the darkness so the city stays readable) -------------

  drawRoofs(ctx, game, vr) {
    const night = game.settings.night;
    for (const o of game.world.sightBlockers) {
      if (!rectsOverlap(o, vr)) continue;
      if (o.kind === 'border') {
        ctx.fillStyle = '#060709';
        ctx.fillRect(o.x, o.y, o.w, o.h);
        continue;
      }
      if (o.kind === 'wall') {
        ctx.fillStyle = night ? (o._nightColor || (o._nightColor = shade(o.color, 0.8))) : o.color;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(o.x, o.y, o.w, Math.min(3, o.h));
        continue;
      }
      ctx.fillStyle = night ? (o._nightColor || (o._nightColor = shade(o.color, 0.74))) : o.color;
      ctx.fillRect(o.x, o.y, o.w, o.h);
      // Parapet + roof surface.
      ctx.strokeStyle = night ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 3;
      ctx.strokeRect(o.x + 1.5, o.y + 1.5, o.w - 3, o.h - 3);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(o.x + 6, o.y + 6, o.w - 12, o.h - 12);
      // Rooftop clutter: AC units / vents placed from the building's seed.
      const n = o.vents || 0;
      for (let k = 0; k < n; k++) {
        const hx = hash01(o.seed + k * 7.31);
        const hy = hash01(o.seed + k * 3.17 + 11);
        const w = 18 + hash01(o.seed + k) * 16;
        const h = 14 + hash01(o.seed + k + 5) * 12;
        const x = o.x + 12 + hx * Math.max(1, o.w - 24 - w);
        const y = o.y + 12 + hy * Math.max(1, o.h - 24 - h);
        ctx.fillStyle = night ? '#3a3d42' : '#5a5e64';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
    }
    // Safe room door frames (red steel).
    for (const room of [game.world.map.startRoom, game.world.map.endRoom]) {
      const d = room.door;
      if (!rectsOverlap(d, vr)) continue;
      ctx.fillStyle = '#8a2a24';
      ctx.fillRect(d.x - 1, d.y - 5, d.w + 2, 6);
      ctx.fillRect(d.x - 1, d.y + d.h - 1, d.w + 2, 6);
    }
  }
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

