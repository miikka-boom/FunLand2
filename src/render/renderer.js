// World renderer. Draw order:
//   ground -> blood decals -> low props -> pickups -> corpses -> zombies ->
//   survivor -> particles -> [darkness + LOS overlay] -> bright fx (tracers,
//   laser, flashes, fire) -> roofs -> HUD.

import { Lighting } from './lighting.js';
import { drawHud } from './hud.js';
import { rrect, circle, hash01 } from './draw-utils.js';
import { SKINS, SHIRTS } from '../game/zombies.js';
import { ALLY } from '../game/ally.js';
import { TAU, rectsOverlap, pointInRect, lampLit } from '../util.js';
import { drawFloors, drawChalk, drawLoot, drawLootBright, drawBoards } from './loot-render.js';
import { drawQwall, drawCanopies, drawFeatureProp, drawFeatureDecor, drawCheckpoints, drawFeaturesBright, drawAmmo } from './features-render.js';
import { drawLoreDecor, drawPosters, drawRoofArt, drawCarScrawl, drawLoreBright } from './lore-render.js';
import { drawDocksGround, drawDocksDecor, drawDocksProp, drawContainer, drawWarehouseRidges, drawDocksBright } from './docks-render.js';
import { drawBenDecor, drawBenBright, drawBenRoof } from './ben-render.js';

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
  station: '#2b2d31',
};

// Interior floors by room type: base colour + optional pattern.
const FLOORS = {
  office: { color: '#2f3239' },
  openoffice: { color: '#30333a', grid: 96, alpha: 0.04 },
  conference: { color: '#2d2f36' },
  ward: { color: '#3a3e3e', grid: 40, alpha: 0.06 },
  lab: { color: '#3b3f40', grid: 40, alpha: 0.06 },
  cafeteria: { color: '#3a3a37', checker: 40, color2: '#323230' },
  lobby: { color: '#3d3a36', grid: 80, alpha: 0.07 },
  warehouse: { color: '#363430', grid: 128, alpha: 0.05 },
  storage: { color: '#34322e' },
  restroom: { color: '#384042', grid: 20, alpha: 0.08 },
  closet: { color: '#302e2b' },
};

// Survivor looks: you (teal jacket) and the AI teammate (olive jacket).
const PLAYER_LOOK = {
  ring: 'rgba(120,230,255,0.35)',
  arms: '#c99a78',
  pack: '#3a3226',
  body: '#2f8291',
  hair: '#6b4a2e',
  skin: '#d2a582',
};
const ALLY_LOOK = {
  ring: 'rgba(140,255,160,0.45)',
  arms: '#b78a66',
  pack: '#2c3424',
  body: '#78872f',
  hair: '#2a1d14',
  skin: '#c49270',
};

/** A standing survivor (you or the teammate): ring, arms, gun, pack, body, head. */
function drawSurvivor(ctx, p, look) {
  const f = p.facing;
  const ca = Math.cos(f);
  const sa = Math.sin(f);
  const r = p.r;
  const bob = Math.sin(p.walk) * 1.2;
  const rec = p.recoil * 4;

  // Ring so you never lose a survivor in a crowd.
  ctx.strokeStyle = p.hurtT > 0 ? 'rgba(255,90,80,0.8)' : look.ring;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  circle(ctx, p.x, p.y, r + 5);
  ctx.stroke();

  const def = p.weapon.def;
  const gunLen = def.id === 'hunting' ? 26 : def.id === 'shotgun' ? 22 : def.id === 'rifle' ? 22 : 16;
  const gx = p.x + ca * (r * 0.4 - rec);
  const gy = p.y + sa * (r * 0.4 - rec);
  // Arms to the gun.
  ctx.strokeStyle = look.arms;
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
  ctx.fillStyle = look.pack;
  ctx.beginPath();
  ctx.ellipse(p.x - ca * r * 0.55, p.y - sa * r * 0.55 + bob * 0.2, r * 0.45, r * 0.62, f, 0, TAU);
  ctx.fill();
  ctx.fillStyle = p.hurtT > 0 ? '#9a3a36' : look.body;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, r * 0.8, r, f, 0, TAU);
  ctx.fill();
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  circle(ctx, p.x + ca * r * 0.1, p.y + sa * r * 0.1, r * 0.5);
  ctx.fill();
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  circle(ctx, p.x + ca * r * 0.25, p.y + sa * r * 0.25, r * 0.3);
  ctx.fill();
}

/** On the floor (pinned, or the teammate down). */
function drawLying(ctx, p, body, skin) {
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, p.r * 1.25, p.r * 0.85, p.facing, 0, TAU);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  circle(ctx, p.x + Math.cos(p.facing) * p.r * 1.1, p.y + Math.sin(p.facing) * p.r * 1.1, p.r * 0.42);
  ctx.fill();
}

/** One splayed corpse arm (subpath only; the caller strokes). */
function corpseArm(ctx, c, ca, sa) {
  ctx.moveTo(c.x - sa * c.r * 0.6 * c.flip, c.y + ca * c.r * 0.6 * c.flip);
  ctx.lineTo(c.x + (ca * 0.6 - sa * 1.3 * c.flip) * c.r, c.y + (sa * 0.6 + ca * 1.3 * c.flip) * c.r);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.lighting = new Lighting();
    // Per-frame scratch for batching the horde by colour (grows as needed).
    this.zb = { zs: [], f: new Float64Array(256), ca: new Float64Array(256), sa: new Float64Array(256), sw: new Float64Array(256), reach: new Float64Array(256) };
    this.corpseVis = [];
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
    ctx.lineCap = 'round';
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
    drawPosters(ctx, game, vr);
    drawCheckpoints(ctx, game, vr);
    drawLoot(ctx, game, vr);
    this.drawPickups(ctx, game, vr);
    this.drawCorpses(ctx, game, vr);
    this.drawGroundParticles(ctx, game, vr);
    this.drawZombies(ctx, game, vr);
    this.drawAlly(ctx, game, vr);
    this.drawPlayer(ctx, game);
    const pin = game.player.pinnedBy;
    if (pin && pin.alive) this.drawHunter(ctx, pin, game.time);
    this.drawRocks(ctx, game, vr);
    this.drawAirParticles(ctx, game, vr);

    if (S.night || S.los) {
      this.lighting.render(game, camX, camY, vr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.lighting.canvas, 0, 0, this.canvas.width, this.canvas.height);
      setWorld();
    }

    this.drawBright(ctx, game, vr);
    drawLootBright(ctx, game, vr);
    drawFeaturesBright(ctx, game, vr);
    drawDocksBright(ctx, game, vr);
    drawLoreBright(ctx, game, vr);
    drawBenBright(ctx, game, vr);
    this.drawBuffAura(ctx, game);
    this.drawRoofs(ctx, game, vr);
    drawBenRoof(ctx, game, vr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawHud(ctx, game, input, ui, this);
  }

  // --- Ground -------------------------------------------------------------------

  drawGround(ctx, game, vr) {
    const map = game.world.map;
    const interior = map.theme === 'interior';
    ctx.fillStyle = interior ? '#2b2c2f' : GROUND.street;
    ctx.fillRect(Math.max(0, vr.x), Math.max(0, vr.y), Math.min(map.w, vr.x + vr.w) - Math.max(0, vr.x), Math.min(map.h, vr.y + vr.h) - Math.max(0, vr.y));
    if (interior) this.drawInteriorFloors(ctx, map, vr);
    if (map.theme === 'docks') drawDocksGround(ctx, game, vr);

    for (const b of interior ? [] : map.blocks) {
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

    drawFloors(ctx, map, vr);

    // Safe room floors.
    for (const room of [map.startRoom, map.endRoom]) {
      const r = room.interior;
      if (room.gangway || !rectsOverlap(r, vr)) continue; // Pier 9: the "end room" is the gangway's foot
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
    if (!map.endRoom.gangway && rectsOverlap(er, vr)) {
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
        case 'papers':
          ctx.fillStyle = 'rgba(220,215,200,0.32)';
          for (let k = 0; k < 4; k++) {
            const px = d.x + (hash01(d.x * 1.3 + k) - 0.5) * 30 * d.s;
            const py = d.y + (hash01(d.y * 0.7 + k * 5) - 0.5) * 30 * d.s;
            ctx.fillRect(px, py, 7, 9);
          }
          break;
        case 'chair':
          ctx.fillStyle = 'rgba(30,32,36,0.8)';
          ctx.fillRect(d.x - 6, d.y - 6, 12, 12);
          ctx.fillStyle = 'rgba(70,74,80,0.8)';
          ctx.fillRect(d.x - 6, d.y - 8, 12, 3);
          break;
        case 'blood':
          ctx.fillStyle = 'rgba(80,12,10,0.45)';
          ctx.beginPath();
          ctx.ellipse(d.x, d.y, 22 * d.s, 9 * d.s, d.a, 0, TAU);
          ctx.fill();
          break;
        case 'chalk':
          drawChalk(ctx, d);
          break;
        default:
          if (!drawLoreDecor(ctx, d) && !drawBenDecor(ctx, d, game.time) && !drawDocksDecor(ctx, d, game.time)) drawFeatureDecor(ctx, d);
          break;
      }
    }
  }

  drawInteriorFloors(ctx, map, vr) {
    for (const b of map.blocks) {
      if (!rectsOverlap(b, vr)) continue;
      ctx.fillStyle = '#2b2c2f';
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    for (const c of map.corridors) {
      if (!rectsOverlap(c, vr)) continue;
      ctx.fillStyle = '#35383b';
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = c.x + 64; x < c.x + c.w; x += 64) {
        ctx.moveTo(x, c.y);
        ctx.lineTo(x, c.y + c.h);
      }
      for (let y = c.y + 64; y < c.y + c.h; y += 64) {
        ctx.moveTo(c.x, y);
        ctx.lineTo(c.x + c.w, y);
      }
      ctx.stroke();
    }
    for (const rm of map.rooms) {
      if (!rectsOverlap(rm, vr)) continue;
      const f = FLOORS[rm.type] || FLOORS.office;
      ctx.fillStyle = f.color;
      ctx.fillRect(rm.x, rm.y, rm.w, rm.h);
      // Only pattern what's on screen.
      const x0 = Math.max(rm.x, vr.x);
      const y0 = Math.max(rm.y, vr.y);
      const x1 = Math.min(rm.x + rm.w, vr.x + vr.w);
      const y1 = Math.min(rm.y + rm.h, vr.y + vr.h);
      if (f.checker) {
        const s = f.checker;
        ctx.fillStyle = f.color2;
        for (let y = rm.y + Math.floor((y0 - rm.y) / s) * s; y < y1; y += s) {
          for (let x = rm.x + Math.floor((x0 - rm.x) / s) * s; x < x1; x += s) {
            if ((Math.round((x - rm.x) / s) + Math.round((y - rm.y) / s)) % 2) ctx.fillRect(x, y, Math.min(s, rm.x + rm.w - x), Math.min(s, rm.y + rm.h - y));
          }
        }
      } else if (f.grid) {
        const s = f.grid;
        ctx.strokeStyle = `rgba(255,255,255,${f.alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = rm.x + Math.ceil((x0 - rm.x) / s) * s; x < x1; x += s) {
          ctx.moveTo(x, y0);
          ctx.lineTo(x, y1);
        }
        for (let y = rm.y + Math.ceil((y0 - rm.y) / s) * s; y < y1; y += s) {
          ctx.moveTo(x0, y);
          ctx.lineTo(x1, y);
        }
        ctx.stroke();
      }
    }
    // Thresholds so doorways show floor, not the void under the wall line.
    ctx.fillStyle = '#323437';
    for (const d of map.doors) if (rectsOverlap(d, vr)) ctx.fillRect(d.x, d.y, d.w, d.h);
  }

  // --- Props (low obstacles, drawn under the darkness) ----------------------------

  drawProps(ctx, game, vr) {
    const t = game.time;
    for (const o of game.world.obstacles) {
      if (o.sight || !rectsOverlap(o, vr)) continue;
      switch (o.kind) {
        case 'car':
          this.drawCar(ctx, o, t);
          drawCarScrawl(ctx, o);
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
        case 'desk': {
          ctx.fillStyle = '#5b4a3a';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(o.x, o.y + o.h - 3, o.w, 3);
          const horiz = o.w >= o.h;
          const n = Math.max(1, Math.round((horiz ? o.w : o.h) / 64));
          ctx.fillStyle = '#1c1f24';
          for (let k = 0; k < n; k++) {
            const mx = horiz ? o.x + ((k + 0.5) * o.w) / n - 9 : o.x + o.w / 2 - 4;
            const my = horiz ? o.y + o.h / 2 - 4 : o.y + ((k + 0.5) * o.h) / n - 9;
            ctx.fillRect(mx, my, horiz ? 18 : 8, horiz ? 8 : 18);
          }
          break;
        }
        case 'table':
          ctx.fillStyle = '#5a5d61';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(o.x + 2, o.y + 2, o.w - 4, 3);
          break;
        case 'bed': {
          ctx.fillStyle = '#6d7376';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = '#b9bdb8';
          ctx.fillRect(o.x + 3, o.y + 3, o.w - 6, o.h - 6);
          ctx.fillStyle = '#dcdcd6';
          if (o.w >= o.h) ctx.fillRect(o.x + 5, o.y + 6, 16, o.h - 12);
          else ctx.fillRect(o.x + 6, o.y + 5, o.w - 12, 16);
          if (hash01(o.x + o.y) < 0.4) {
            ctx.fillStyle = 'rgba(110,20,16,0.6)';
            ctx.beginPath();
            circle(ctx, o.x + o.w * 0.55, o.y + o.h * 0.55, Math.min(o.w, o.h) * 0.22);
            ctx.fill();
          }
          break;
        }
        case 'counter':
          ctx.fillStyle = '#4a3d33';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          if (o.w >= o.h) ctx.fillRect(o.x, o.y + 3, o.w, 4);
          else ctx.fillRect(o.x + 3, o.y, 4, o.h);
          break;
        case 'couch':
          ctx.fillStyle = '#4a2e2e';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          if (o.w >= o.h) for (let x = o.x + o.w / 3; x < o.x + o.w - 4; x += o.w / 3) { ctx.moveTo(x, o.y + 4); ctx.lineTo(x, o.y + o.h - 4); }
          else for (let y = o.y + o.h / 3; y < o.y + o.h - 4; y += o.h / 3) { ctx.moveTo(o.x + 4, y); ctx.lineTo(o.x + o.w - 4, y); }
          ctx.stroke();
          break;
        case 'plant': {
          const cx = o.x + o.w / 2;
          const cy = o.y + o.h / 2;
          ctx.fillStyle = '#5b4a3a';
          ctx.beginPath();
          circle(ctx, cx, cy, o.w * 0.4);
          ctx.fill();
          ctx.fillStyle = '#2f5034';
          for (let k = 0; k < 5; k++) {
            ctx.beginPath();
            circle(ctx, cx + Math.cos(k * 1.26) * o.w * 0.28, cy + Math.sin(k * 1.26) * o.w * 0.28, o.w * 0.24);
            ctx.fill();
          }
          break;
        }
        case 'cabinet':
          ctx.fillStyle = '#6a6e72';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          if (o.w >= o.h) for (let x = o.x + o.w / 3; x < o.x + o.w - 2; x += o.w / 3) { ctx.moveTo(x, o.y); ctx.lineTo(x, o.y + o.h); }
          else for (let y = o.y + o.h / 3; y < o.y + o.h - 2; y += o.h / 3) { ctx.moveTo(o.x, y); ctx.lineTo(o.x + o.w, y); }
          ctx.stroke();
          break;
        case 'vending':
          ctx.fillStyle = o.color || '#7a2a2a';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(o.x + 3, o.y + 3, o.w - 6, o.h - 6);
          break;
        case 'barrel':
          ctx.fillStyle = '#6b4a2a';
          ctx.beginPath();
          circle(ctx, o.x + o.w / 2, o.y + o.h / 2, o.w / 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          circle(ctx, o.x + o.w / 2, o.y + o.h / 2, o.w / 2 - 4);
          ctx.stroke();
          break;
        case 'alarmbox':
          ctx.fillStyle = o.alarmDone ? '#5a2a26' : '#b02020';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillRect(o.x + o.w / 2 - 2, o.y + o.h / 2 - 2, 4, 4);
          break;
        case 'barricade': {
          // A jumble of desks, doors and cabinets jammed across the hall.
          ctx.fillStyle = '#2e2924';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          const cols = ['#5b4a3a', '#6a6e72', '#4a3d33', '#5a5d61', '#6b5233'];
          for (let k = 0; k < 9; k++) {
            const hx = hash01(o.seed + k * 1.7);
            const hy = hash01(o.seed + k * 2.3 + 4);
            const pw = 14 + hash01(o.seed + k * 3.1) * (o.w * 0.7);
            const ph = 10 + hash01(o.seed + k * 4.9) * 26;
            ctx.fillStyle = cols[k % cols.length];
            ctx.fillRect(o.x + hx * (o.w - pw), o.y + hy * (o.h - ph), pw, ph);
          }
          ctx.strokeStyle = '#7a6a4a';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(o.x + 2, o.y + o.h * 0.2);
          ctx.lineTo(o.x + o.w - 2, o.y + o.h * 0.55);
          ctx.moveTo(o.x + o.w - 2, o.y + o.h * 0.35);
          ctx.lineTo(o.x + 2, o.y + o.h * 0.85);
          ctx.stroke();
          break;
        }
        case 'glass':
          ctx.fillStyle = 'rgba(150,210,240,0.16)';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = 'rgba(190,235,255,0.45)';
          if (o.w >= o.h) ctx.fillRect(o.x, o.y + o.h / 2 - 0.5, o.w, 1);
          else ctx.fillRect(o.x + o.w / 2 - 0.5, o.y, 1, o.h);
          break;
        default:
          if (!drawDocksProp(ctx, o)) drawFeatureProp(ctx, o, game);
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
      // Spilled from a stash: pops out (overshoots, then settles).
      const popping = k.pop !== undefined && k.pop < 1;
      if (popping) {
        const u = k.pop;
        const sc = 0.2 + u * 0.8 + Math.sin(u * Math.PI) * 0.35;
        ctx.save();
        ctx.translate(k.x, k.y);
        ctx.scale(sc, sc);
        ctx.translate(-k.x, -k.y);
      }
      const bob = Math.sin(game.time * 3 + k.bob) * 1.5;
      if (k.kind === 'ammo') {
        drawAmmo(ctx, k, bob);
        if (popping) ctx.restore();
        continue;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(k.x - 9, k.y - 5, 20, 14);
      ctx.fillStyle = '#e8e8e2';
      ctx.beginPath();
      rrect(ctx, k.x - 10, k.y - 8 + bob, 20, 15, 3);
      ctx.fill();
      ctx.fillStyle = '#d0302a';
      ctx.fillRect(k.x - 2, k.y - 6 + bob, 4, 11);
      ctx.fillRect(k.x - 6, k.y - 2.5 + bob, 12, 4);
      if (popping) ctx.restore();
    }
  }

  /** Adrenaline: a quick yellow pulse around you while it lasts. */
  drawBuffAura(ctx, game) {
    const p = game.player;
    if (!p.alive || !(p.adrenT > 0)) return;
    const fade = Math.min(1, p.adrenT / 2); // fades out over its last 2 s
    const k = (game.time * 2.2) % 1;
    ctx.strokeStyle = `rgba(255,224,102,${(1 - k) * 0.45 * fade})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    circle(ctx, p.x, p.y, p.r + 4 + k * 16);
    ctx.stroke();
  }

  drawCorpses(ctx, game, vr) {
    const vis = this.corpseVis;
    vis.length = 0;
    for (const c of game.effects.corpses) if (pointInRect(c.x, c.y, vr)) vis.push(c);
    if (!vis.length) return;
    // Body, head flung in the hit direction, one arm splayed. Settled corpses
    // are batched by colour (one fill per colour); fading ones go one by one.
    const one = (c) => {
      const ca = Math.cos(c.ang);
      const sa = Math.sin(c.ang);
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
      ctx.beginPath();
      corpseArm(ctx, c, ca, sa);
      ctx.stroke();
    };
    for (const c of vis) {
      if (c.t <= 48) continue;
      ctx.globalAlpha = 0.85 * Math.max(0, (50 - c.t) / 2);
      one(c);
    }
    ctx.globalAlpha = 0.85;
    const done = this._corpseColors || (this._corpseColors = new Set());
    done.clear();
    for (const c0 of vis) {
      if (c0.t > 48 || done.has(c0.shirt)) continue;
      done.add(c0.shirt);
      ctx.fillStyle = c0.shirt;
      ctx.beginPath();
      for (const c of vis) {
        if (c.t > 48 || c.shirt !== c0.shirt) continue;
        ctx.moveTo(c.x + Math.cos(c.ang) * c.r * 1.15, c.y + Math.sin(c.ang) * c.r * 1.15);
        ctx.ellipse(c.x, c.y, c.r * 1.15, c.r * 0.8, c.ang, 0, TAU);
      }
      ctx.fill();
    }
    done.clear();
    for (const c0 of vis) {
      if (c0.t > 48 || done.has(c0.skin)) continue;
      done.add(c0.skin);
      ctx.fillStyle = c0.skin;
      ctx.beginPath();
      for (const c of vis) {
        if (c.t > 48 || c.skin !== c0.skin) continue;
        circle(ctx, c.x + Math.cos(c.ang) * c.r * 1.2, c.y + Math.sin(c.ang) * c.r * 1.2, c.r * 0.5);
      }
      ctx.fill();
      ctx.strokeStyle = c0.skin;
      ctx.lineWidth = c0.r * 0.38;
      ctx.beginPath();
      for (const c of vis) {
        if (c.t > 48 || c.skin !== c0.skin) continue;
        corpseArm(ctx, c, Math.cos(c.ang), Math.sin(c.ang));
      }
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
    const t = game.time;
    const x0 = vr.x;
    const x1 = vr.x + vr.w;
    const y0 = vr.y;
    const y1 = vr.y + vr.h;
    // Commons are batched by colour: a few dozen canvas calls for any horde
    // size instead of three per zombie. Layers: arms, bodies, heads, hit flashes.
    const b = this.zb;
    let n = 0;
    let specials = false;
    let flashes = false;
    for (const z of game.zombies) {
      if (!z.alive || z.x < x0 || z.x > x1 || z.y < y0 || z.y > y1) continue;
      if (z.type !== 'common') {
        specials = true;
        continue;
      }
      if (n >= b.ca.length) {
        const grow = (a) => {
          const g = new Float64Array(a.length * 2);
          g.set(a);
          return g;
        };
        b.f = grow(b.f);
        b.ca = grow(b.ca);
        b.sa = grow(b.sa);
        b.sw = grow(b.sw);
        b.reach = grow(b.reach);
      }
      let f = z.face;
      if (z.stagger > 0) f += Math.sin(t * 30 + z.id) * 0.35;
      const chasing = z.state === 'chase' && z.alertDelay <= 0;
      b.zs[n] = z;
      b.f[n] = f;
      b.ca[n] = Math.cos(f);
      b.sa[n] = Math.sin(f);
      // Arms: reach forward while hunting, hang and sway while shambling.
      b.sw[n] = Math.sin(z.anim * (chasing ? 14 : 4)) * (chasing ? 0.25 : 0.4) * 0.6;
      b.reach[n] = (chasing ? 1.25 : 0.75) + (z.windup > 0 ? 0.45 : 0);
      if (z.hitFlash > 0) flashes = true;
      n++;
    }
    const zs = b.zs;
    const { f, ca, sa, sw, reach } = b;
    if (n > 0) {
      ctx.lineWidth = 0.42 * 11; // one width per batch (radii are 10-12)
      for (let k = 0; k < SKINS.length; k++) {
        let any = false;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const z = zs[i];
          if (z.skinI !== k) continue;
          any = true;
          const r = z.r;
          const sideX = -sa[i] * r * 0.62;
          const sideY = ca[i] * r * 0.62;
          const rr = r * reach[i];
          for (let side = -1; side <= 1; side += 2) {
            const sx = z.x + sideX * side;
            const sy = z.y + sideY * side;
            const s2 = side * sw[i];
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + (ca[i] - sa[i] * s2) * rr, sy + (sa[i] + ca[i] * s2) * rr);
          }
        }
        if (any) {
          ctx.strokeStyle = SKINS[k];
          ctx.stroke();
        }
      }
      for (let k = 0; k < SHIRTS.length; k++) {
        let any = false;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const z = zs[i];
          if (z.shirtI !== k) continue;
          any = true;
          const r = z.r;
          ctx.moveTo(z.x + ca[i] * r * 0.78, z.y + sa[i] * r * 0.78);
          ctx.ellipse(z.x, z.y, r * 0.78, r, f[i], 0, TAU);
        }
        if (any) {
          ctx.fillStyle = SHIRTS[k];
          ctx.fill();
        }
      }
      for (let k = 0; k < SKINS.length; k++) {
        let any = false;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const z = zs[i];
          if (z.skinI !== k) continue;
          any = true;
          const r = z.r;
          circle(ctx, z.x + ca[i] * r * 0.18, z.y + sa[i] * r * 0.18, r * 0.52);
        }
        if (any) {
          ctx.fillStyle = SKINS[k];
          ctx.fill();
        }
      }
      if (flashes) {
        ctx.fillStyle = 'rgba(255,240,230,0.55)';
        ctx.beginPath();
        for (let i = 0; i < n; i++) if (zs[i].hitFlash > 0) circle(ctx, zs[i].x, zs[i].y, zs[i].r * 1.05);
        ctx.fill();
      }
      for (let i = 0; i < n; i++) zs[i] = null; // don't keep dead zombies alive
    }
    if (!specials) return;
    // Specials on top, with their own animated drawing.
    for (const z of game.zombies) {
      if (!z.alive || z.type === 'common' || z.x < x0 || z.x > x1 || z.y < y0 || z.y > y1) continue;
      if (z.type === 'hunter') {
        if (z.mode !== 'pin') this.drawHunter(ctx, z, t);
      } else if (z.type === 'tank') this.drawTank(ctx, z, t);
      else if (z.type === 'terror') this.drawTerror(ctx, z, t);
    }
  }

  /** Night Terror: a pale, long-limbed, eyeless thing, only as visible as it is lit. */
  drawTerror(ctx, z, t) {
    let a = Math.min(1, z.lit * 1.15);
    if (z.mode === 'flee') a *= Math.min(1, z.modeT / 1.5);
    if (a < 0.02) return;
    const r = z.r * 1.3; // drawn bigger than its body: long limbs
    const f = z.face + (z.mode === 'recoil' ? Math.sin(t * 47 + z.id) * 0.3 : 0);
    const ca = Math.cos(f);
    const sa = Math.sin(f);
    const x = z.x + (z.mode === 'recoil' ? Math.sin(t * 61) * 1.5 : 0);
    const y = z.y;
    const walk = Math.sin(z.anim * 9) * 0.35;
    const reach = z.mode === 'windup' ? 0.55 : z.mode === 'lunge' ? 2.1 : z.mode === 'recoil' ? 0.3 : 1.25;
    ctx.globalAlpha = a;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Legs trailing, arms bent out to the side then reaching forward.
    ctx.strokeStyle = '#9aa0aa';
    ctx.lineWidth = r * 0.2;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      const hx = x - ca * r * 0.45 - sa * r * 0.3 * side;
      const hy = y - sa * r * 0.45 + ca * r * 0.3 * side;
      const st = walk * side;
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - ca * r * (1.1 + st) - sa * r * 0.35 * side, hy - sa * r * (1.1 + st) + ca * r * 0.35 * side);
    }
    ctx.stroke();
    ctx.strokeStyle = z.skin;
    ctx.lineWidth = r * 0.22;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      const sx = x + ca * r * 0.25 - sa * r * 0.5 * side;
      const sy = y + sa * r * 0.25 + ca * r * 0.5 * side;
      const ex = sx + ca * r * 0.3 - sa * r * 0.75 * side;
      const ey = sy + sa * r * 0.3 + ca * r * 0.75 * side;
      const sw = z.mode === 'stalk' ? -walk * side * 0.5 : 0;
      const hx = ex + ca * r * (reach + sw) + sa * r * 0.25 * side;
      const hy = ey + sa * r * (reach + sw) - ca * r * 0.25 * side;
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.lineTo(hx, hy);
      // Three long fingers.
      for (const k of [-0.5, 0, 0.5]) {
        const fa = f + k * 0.5;
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + Math.cos(fa) * r * 0.45, hy + Math.sin(fa) * r * 0.45);
      }
    }
    ctx.stroke();
    // Narrow torso, ribs showing.
    ctx.fillStyle = '#a7adb7';
    ctx.beginPath();
    ctx.ellipse(x - ca * r * 0.1, y - sa * r * 0.1, r * 0.95, r * 0.48, f, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,44,52,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const k of [-0.35, 0, 0.35]) {
      const cx = x + ca * r * k;
      const cy = y + sa * r * k;
      ctx.moveTo(cx - sa * r * 0.38, cy + ca * r * 0.38);
      ctx.lineTo(cx + sa * r * 0.38, cy - ca * r * 0.38);
    }
    ctx.stroke();
    // Long eyeless head; the mouth gapes when it breathes in, lunges or shrieks.
    const hx = x + ca * r * 0.85;
    const hy = y + sa * r * 0.85;
    ctx.fillStyle = z.skin;
    ctx.beginPath();
    ctx.ellipse(hx, hy, r * 0.6, r * 0.38, f, 0, TAU);
    ctx.fill();
    const open = z.mode === 'windup' || z.mode === 'lunge' || z.mode === 'recoil' ? 1 : 0.35 + Math.sin(t * 3 + z.id) * 0.1;
    ctx.fillStyle = '#07080b';
    ctx.beginPath();
    ctx.ellipse(hx + ca * r * 0.3, hy + sa * r * 0.3, r * (0.14 + 0.16 * open), r * (0.1 + 0.18 * open), f, 0, TAU);
    ctx.fill();
    if (z.hitFlash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      circle(ctx, x, y, r * 1.15);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawHunter(ctx, h, t) {
    const r = h.r;
    let f = h.face;
    if (h.mode === 'stunned') f += Math.sin(t * 22 + h.id) * 0.4;
    const ca = Math.cos(f);
    const sa = Math.sin(f);
    // Crouched = squat and wide; mid-air = stretched along the pounce.
    let along = r * 1.05;
    let across = r * 0.85;
    if (h.mode === 'crouch') {
      along = r * 0.8;
      across = r * 1.12;
    } else if (h.mode === 'leap') {
      along = r * 1.45;
      across = r * 0.75;
    }
    const lift = h.mode === 'leap' ? 6 : 0;
    if (lift) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(h.x + 4, h.y + 7, along, across, f, 0, TAU);
      ctx.fill();
    }
    const x = h.x;
    const y = h.y - lift;
    // Claws: tucked while stalking, reaching while crouched / flying / pinning.
    const reach = h.mode === 'stalk' || h.mode === 'stunned' ? 0.55 : h.mode === 'pin' ? 0.9 + Math.sin(t * 30) * 0.35 : 1.35;
    ctx.strokeStyle = h.skin;
    ctx.lineCap = 'round';
    ctx.lineWidth = r * 0.36;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      const sx = x - sa * r * 0.55 * side;
      const sy = y + ca * r * 0.55 * side;
      const flail = h.mode === 'pin' ? Math.sin(t * 28 + side) * 0.5 : 0;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (ca - sa * flail * side) * r * reach, sy + (sa + ca * flail * side) * r * reach);
    }
    ctx.stroke();
    ctx.fillStyle = h.shirt;
    ctx.beginPath();
    ctx.ellipse(x, y, along * 0.82, across, f, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1a1f2b'; // hood
    ctx.beginPath();
    circle(ctx, x + ca * r * 0.25, y + sa * r * 0.25, r * 0.55);
    ctx.fill();
    if (h.hitFlash > 0) {
      ctx.fillStyle = 'rgba(255,240,230,0.55)';
      ctx.beginPath();
      circle(ctx, x, y, r * 1.1);
      ctx.fill();
    }
  }

  drawTank(ctx, k, t) {
    const r = k.r;
    const f = k.face;
    const ca = Math.cos(f);
    const sa = Math.sin(f);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(k.x + 5, k.y + 7, r * 1.05, r * 1.2, f, 0, TAU);
    ctx.fill();
    const walk = Math.sin(k.anim * 7) * 0.35;
    const wind = k.mode === 'punch' ? 1 - k.modeT / 0.42 : 0;
    const throwing = k.mode === 'throw';
    ctx.lineCap = 'round';
    ctx.strokeStyle = k.skin;
    ctx.lineWidth = r * 0.5;
    const fists = [];
    for (const side of [-1, 1]) {
      const sx = k.x - sa * r * 0.95 * side;
      const sy = k.y + ca * r * 0.95 * side;
      let reach = 0.9 + walk * side * 0.5;
      let spread = 0.15;
      if (throwing) {
        reach = 1.1;
        spread = -0.35; // both hands up together, holding the rock
      } else if (k.mode === 'punch' && side === 1) {
        reach = wind < 0.75 ? 0.2 - wind * 0.6 : 1.9; // haul back... then the haymaker
      }
      const ex = sx + (ca + -sa * spread * side) * r * reach;
      const ey = sy + (sa + ca * spread * side) * r * reach;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      fists.push([ex, ey]);
    }
    ctx.fillStyle = k.skin;
    for (const [fx, fy] of fists) {
      ctx.beginPath();
      circle(ctx, fx, fy, r * 0.4);
      ctx.fill();
    }
    // Hulking shoulders, torn shirt, tiny head.
    ctx.fillStyle = k.skin;
    ctx.beginPath();
    ctx.ellipse(k.x, k.y, r * 0.78, r * 1.18, f, 0, TAU);
    ctx.fill();
    ctx.fillStyle = k.shirt;
    ctx.beginPath();
    ctx.ellipse(k.x - ca * r * 0.25, k.y - sa * r * 0.25, r * 0.45, r * 0.9, f, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#8c7f73';
    ctx.beginPath();
    circle(ctx, k.x + ca * r * 0.42, k.y + sa * r * 0.42, r * 0.34);
    ctx.fill();
    if (throwing) {
      const rx = k.x + ca * r * 1.25;
      const ry = k.y + sa * r * 1.25;
      const grow = Math.min(1, (1 - k.modeT) * 1.6);
      this.drawRockShape(ctx, rx, ry, 13 * (0.6 + grow * 0.4), t * 2);
    }
    if (k.hitFlash > 0 || wind > 0) {
      ctx.fillStyle = wind > 0 ? `rgba(255,60,40,${0.25 + wind * 0.3})` : 'rgba(255,240,230,0.4)';
      ctx.beginPath();
      ctx.ellipse(k.x, k.y, r * 0.85, r * 1.25, f, 0, TAU);
      ctx.fill();
    }
  }

  drawRockShape(ctx, x, y, r, rot) {
    ctx.fillStyle = '#6f6a63';
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = rot + (i / 7) * TAU;
      const rr = r * (0.82 + hash01(i * 3.7) * 0.3);
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    circle(ctx, x + Math.cos(rot) * r * 0.3, y + Math.sin(rot) * r * 0.3, r * 0.35);
    ctx.fill();
  }

  drawRocks(ctx, game, vr) {
    for (const r of game.rocks) {
      if (!r.alive || !pointInRect(r.x, r.y, vr, 40)) continue;
      const h = Math.sin(Math.min(1, r.dist / r.max) * Math.PI) * 34 + 6; // thrown in an arc
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r * 0.9, r.r * 0.6, 0, 0, TAU);
      ctx.fill();
      this.drawRockShape(ctx, r.x, r.y - h, r.r, r.rot);
    }
    for (const p of game.effects.particles) {
      if (p.kind !== 'debris' || !pointInRect(p.x, p.y, vr)) continue;
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2 - p.z * 0.5, p.size, p.size * 0.8);
    }
    ctx.globalAlpha = 1;
  }

  drawPlayer(ctx, game) {
    const p = game.player;
    if (p.pinnedBy && p.alive) {
      drawLying(ctx, p, PLAYER_LOOK.body, PLAYER_LOOK.skin);
      return;
    }
    if (!p.alive && game.endT > 0.8) {
      ctx.fillStyle = '#2d6f7a';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r * 1.2, p.r * 0.8, p.facing, 0, TAU);
      ctx.fill();
      return;
    }
    drawSurvivor(ctx, p, PLAYER_LOOK);
  }

  /** The AI teammate: same build, olive jacket, green ring; lying when down. */
  drawAlly(ctx, game, vr) {
    const a = game.ally;
    if (!a || !pointInRect(a.x, a.y, vr, 20)) return;
    if (!a.alive) {
      ctx.fillStyle = '#3d4422';
      ctx.beginPath();
      ctx.ellipse(a.x, a.y, a.r * 1.2, a.r * 0.8, a.facing, 0, TAU);
      ctx.fill();
      return;
    }
    if (a.down) {
      drawLying(ctx, a, ALLY_LOOK.body, ALLY_LOOK.skin);
      return;
    }
    drawSurvivor(ctx, a, ALLY_LOOK);
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
      } else if (p.kind === 'smoke' || p.kind === 'dust' || p.kind === 'steam') {
        const a = (p.life / p.max) * (p.kind === 'smoke' ? 0.22 : p.kind === 'steam' ? 0.2 : 0.18);
        ctx.fillStyle = p.kind === 'smoke' ? `rgba(60,60,62,${a})` : p.kind === 'steam' ? `rgba(225,232,240,${a})` : `rgba(150,140,120,${a})`;
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
        if (!z.alive || z.ghost) continue;
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

    this.drawSpecialTells(ctx, game, vr);
    this.drawAllyTells(ctx, game, vr);

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
    // Lamp heads (street lamps) / fluorescent fixtures (interiors).
    for (const l of game.world.map.lamps) {
      if (!pointInRect(l.x, l.y, vr)) continue;
      const on = lampLit(l, t);
      if (l.interior) {
        ctx.fillStyle = on ? 'rgba(220,235,255,0.6)' : 'rgba(70,74,80,0.5)';
        if (l.axis === 'v') ctx.fillRect(l.x - 3, l.y - 11, 6, 22);
        else ctx.fillRect(l.x - 11, l.y - 3, 22, 6);
        continue;
      }
      ctx.fillStyle = on ? 'rgba(255,210,150,0.55)' : 'rgba(80,80,80,0.4)';
      ctx.beginPath();
      circle(ctx, l.x, l.y, 3);
      ctx.fill();
    }
    const map = game.world.map;
    if (map.signs) {
      for (const s of map.signs) {
        if (!pointInRect(s.x, s.y, vr, 20)) continue;
        ctx.fillStyle = 'rgba(60,255,120,0.18)';
        ctx.beginPath();
        circle(ctx, s.x, s.y, 16);
        ctx.fill();
        ctx.fillStyle = 'rgba(90,255,140,0.9)';
        ctx.fillRect(s.x - 8, s.y - 3, 16, 6);
      }
    }
    if (map.glows) {
      for (const g2 of map.glows) {
        if (!pointInRect(g2.x, g2.y, vr, 40)) continue;
        ctx.fillStyle = g2.tint;
        ctx.beginPath();
        circle(ctx, g2.x, g2.y, 22);
        ctx.fill();
      }
    }
    // Alarm going off: car hazard lights / fire-alarm strobe.
    for (const o of game.world.obstacles) {
      if (!o.alarmOn || !rectsOverlap(o, vr, 120)) continue;
      if (o.kind === 'alarmbox') {
        const on = Math.sin(t * 14) > 0;
        if (on) {
          ctx.fillStyle = 'rgba(255,60,50,0.35)';
          ctx.beginPath();
          circle(ctx, o.x + o.w / 2, o.y + o.h / 2, 60);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,230,230,0.95)';
          ctx.fillRect(o.x, o.y, o.w, o.h);
        }
        continue;
      }
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

  /** The teammate down: a pulsing ring you can find in the dark, and the revive progress. */
  drawAllyTells(ctx, game, vr) {
    const a = game.ally;
    if (!a || !a.alive || !a.down || !pointInRect(a.x, a.y, vr, 40)) return;
    const t = game.time;
    const pulse = 0.55 + Math.sin(t * 6) * 0.25;
    ctx.strokeStyle = `rgba(255,90,70,${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    circle(ctx, a.x, a.y, a.r + 9 + Math.sin(t * 6) * 2);
    ctx.stroke();
    // Revive radius (where to stand) + progress arc.
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(140,255,160,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    circle(ctx, a.x, a.y, ALLY.reviveRange);
    ctx.stroke();
    ctx.setLineDash([]);
    if (a.revive > 0) {
      ctx.strokeStyle = 'rgba(140,255,160,0.95)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r + 16, -Math.PI / 2, -Math.PI / 2 + a.revive * TAU);
      ctx.stroke();
    }
  }

  /** Telegraphs drawn over the darkness: you must be able to read them in time. */
  drawSpecialTells(ctx, game, vr) {
    const p = game.player;
    const t = game.time;
    for (const z of game.zombies) {
      // Generous cull: the telegraph line reaches you even if the thrower is off-screen.
      if (!z.alive || z.type === 'common' || !pointInRect(z.x, z.y, vr, 900)) continue;
      const seen = pointInRect(z.x, z.y, vr, 40) && game.world.segmentClear(p.x, p.y, z.x, z.y);
      if (z.type === 'hunter') {
        if (z.mode === 'crouch') {
          // Pounce line + a closing ring: the shove-timing cue.
          const k = Math.max(0, z.modeT) / 0.75;
          ctx.setLineDash([10, 8]);
          ctx.lineDashOffset = -t * 60;
          ctx.strokeStyle = `rgba(255,70,60,${0.55 + Math.sin(t * 30) * 0.2})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(z.x, z.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = 'rgba(255,90,70,0.8)';
          ctx.beginPath();
          circle(ctx, z.x, z.y, z.r + 6 + k * 26);
          ctx.stroke();
        } else if (z.mode === 'leap') {
          for (let i = 0; i < z.trail.length; i++) {
            const g = z.trail[i];
            ctx.fillStyle = `rgba(150,170,255,${(i / z.trail.length) * 0.25})`;
            ctx.beginPath();
            circle(ctx, g.x, g.y - 6, z.r * 0.9);
            ctx.fill();
          }
        }
        if (seen && z.mode !== 'pin') {
          const ca = Math.cos(z.face);
          const sa = Math.sin(z.face);
          const ex = z.x + ca * z.r * 0.55;
          const ey = z.y + sa * z.r * 0.55 - (z.mode === 'leap' ? 6 : 0);
          ctx.fillStyle = 'rgba(230,240,255,0.95)';
          for (const side of [-1, 1]) {
            ctx.beginPath();
            circle(ctx, ex - sa * 3 * side, ey + ca * 3 * side, 1.6);
            ctx.fill();
          }
        }
      } else if (z.type === 'terror') {
        // Its breath shows in the dark: faint while it whispers, a burst right before it lunges.
        if (!seen) continue; // not through walls
        for (const b of z.puffs) {
          const k = b.t / 1.3;
          const al = b.k * (1 - k);
          if (al < 0.01) continue;
          ctx.fillStyle = `rgba(215,226,240,${al})`;
          ctx.beginPath();
          circle(ctx, b.x, b.y, 3 + k * 12);
          ctx.fill();
        }
      } else if (z.type === 'tank') {
        if (z.mode === 'throw') {
          ctx.setLineDash([12, 10]);
          ctx.lineDashOffset = -t * 50;
          ctx.strokeStyle = `rgba(255,170,60,${0.4 + Math.sin(t * 18) * 0.15})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(z.x, z.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (z.mode === 'punch') {
          const reach = z.r + p.r + 32;
          ctx.fillStyle = `rgba(255,50,30,${0.12 + (1 - z.modeT / 0.42) * 0.22})`;
          ctx.beginPath();
          ctx.moveTo(z.x, z.y);
          ctx.arc(z.x, z.y, reach, z.face - 1.3, z.face + 1.3);
          ctx.closePath();
          ctx.fill();
        }
        if (seen) {
          const ca = Math.cos(z.face);
          const sa = Math.sin(z.face);
          ctx.fillStyle = 'rgba(255,90,60,0.9)';
          for (const side of [-1, 1]) {
            ctx.beginPath();
            circle(ctx, z.x + ca * z.r * 0.6 - sa * 3.5 * side, z.y + sa * z.r * 0.6 + ca * 3.5 * side, 1.8);
            ctx.fill();
          }
        }
      }
    }
  }

  // --- Roofs and walls (above the darkness so the city stays readable) -------------

  drawRoofs(ctx, game, vr) {
    const night = game.settings.night;
    for (const o of game.world.sightBlockers) {
      if (!rectsOverlap(o, vr)) continue;
      if (o.kind === 'border') {
        if (o.sea) continue; // Pier 9: open water past the east edge
        ctx.fillStyle = '#060709';
        ctx.fillRect(o.x, o.y, o.w, o.h);
        continue;
      }
      if (o.kind === 'container') {
        drawContainer(ctx, o, night);
        continue;
      }
      if (o.kind === 'wall') {
        ctx.fillStyle = night ? (o._nightColor || (o._nightColor = shade(o.color, 0.8))) : o.color;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(o.x, o.y, o.w, Math.min(3, o.h));
        continue;
      }
      if (o.kind === 'boards') {
        drawBoards(ctx, o, game.time);
        continue;
      }
      if (o.kind === 'qwall') {
        drawQwall(ctx, o, night, game.world.map.h);
        continue;
      }
      if (o.kind === 'pillar') {
        ctx.fillStyle = night ? '#57544e' : '#6a665f';
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(o.x + 6, o.y + 6, o.w - 12, o.h - 12);
        continue;
      }
      if (o.kind === 'shelf') {
        ctx.fillStyle = night ? '#373a40' : '#43474d';
        ctx.fillRect(o.x, o.y, o.w, o.h);
        const horiz = o.w >= o.h;
        const len = horiz ? o.w : o.h;
        for (let p = 4, k = 0; p < len - 10; p += 22, k++) {
          const h = hash01(o.x * 0.37 + o.y * 0.11 + k);
          if (h < 0.25) continue;
          ctx.fillStyle = h < 0.6 ? '#6b5233' : '#7a6a4a';
          if (horiz) ctx.fillRect(o.x + p, o.y + 4, 18, o.h - 8);
          else ctx.fillRect(o.x + 4, o.y + p, o.w - 8, 18);
        }
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
      if (o.ware || o.booth) drawWarehouseRidges(ctx, o);
    }
    drawRoofArt(ctx, game, vr);
    drawCanopies(ctx, game, vr);
    // Door jambs so openings read as doorways.
    const doors = game.world.map.doors;
    if (doors) {
      ctx.fillStyle = '#2a2826';
      for (const d of doors) {
        if (!rectsOverlap(d, vr)) continue;
        if (d.vertical) {
          ctx.fillRect(d.x - 2, d.y - 3, d.w + 4, 4);
          ctx.fillRect(d.x - 2, d.y + d.h - 1, d.w + 4, 4);
        } else {
          ctx.fillRect(d.x - 3, d.y - 2, 4, d.h + 4);
          ctx.fillRect(d.x + d.w - 1, d.y - 2, 4, d.h + 4);
        }
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

