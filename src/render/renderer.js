// World renderer: the game in 3D (isometric by default; see src/iso.js).
//
//   ground      everything that lies flat (streets, floors, paint, graffiti,
//               blood, corpses), painted in world coordinates through the
//               camera's ground transform, then the shadows things cast
//   night       the darkness + line-of-sight overlay over the ground (lighting.js)
//   standing    everything with height, far to near: buildings, walls, props,
//               bodies. Statics come in a painter's order worked out once per
//               map; movers are slotted into it. Each is shaded by the light
//               at its feet.
//   overhead    what hangs above it all (gas station canopy, crane girders)
//   bright      what shines through the dark: tracers, the laser, flames,
//               lamps, telegraphs
//   HUD
//
// The same passes draw the straight-down view (settings.camera = 'top'): the
// camera just looks along the walls, so only tops show.

import { Lighting } from './lighting.js';
import { drawHud } from './hud.js';
import { circle, hash01 } from './draw-utils.js';
import { ALLY } from '../game/ally.js';
import { GUN_Z } from '../game/player.js';
import { TAU, rectsOverlap, pointInRect, lampLit, clamp } from '../util.js';
import { Scene, boxHides } from './scene3d.js';
import { CRANE_H } from './models.js';
import { tone, box, boxShadow, disc, ball, line3 } from './prims.js';
import { Horde, drawSurvivor, drawLying, drawHunter, drawTank, drawTerror, drawRock, ghostPath, hunterLift, hunterEyes, PLAYER_LOOK, ALLY_LOOK } from './figures.js';
import { drawFloors, drawChalk, drawLoot, drawStash, drawLootBright } from './loot-render.js';
import { drawCanopies, drawFeatureDecor, drawFeaturesBright } from './features-render.js';
import { drawLoreDecor, drawPosters, roofText, drawLoreBright } from './lore-render.js';
import { drawDocksGround, drawDocksDecor, drawCranes, drawFerry, drawDocksBright } from './docks-render.js';
import { drawBenDecor, drawBenBright, drawBenLoose, benText, drawFort } from './ben-render.js';

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

// What's in the painter's list.
const T_STATIC = 0;
const T_ZOMBIE = 1;
const T_SPECIAL = 2;
const T_PLAYER = 3;
const T_ALLY = 4;
const T_PICKUP = 5;
const T_STASH = 6;
const T_PROP = 7;
const T_ROCK = 8;
// Sort key: a static's rank, or (the rank a mover goes after + 1/2) and then its depth.
const SLOT = 65536;
const DEPTH0 = 12000;

/** One splayed corpse arm (subpath only; the caller strokes). */
function corpseArm(ctx, c, ca, sa) {
  ctx.moveTo(c.x - sa * c.r * 0.6 * c.flip, c.y + ca * c.r * 0.6 * c.flip);
  ctx.lineTo(c.x + (ca * 0.6 - sa * 1.3 * c.flip) * c.r, c.y + (sa * 0.6 + ca * 1.3 * c.flip) * c.r);
}

const eyes = { x: 0, y: 0, z: 0 };

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.lighting = new Lighting();
    this.horde = new Horde();
    this.scene = null;
    this.corpseVis = [];
    this.list = []; // this frame's painter's list
    this.pool = [];
    this.pn = 0;
    this.shadows = []; // x, y, r of everything that walks
    this.xray = [];
    this.over = []; // props that hang overhead
    this.lampsOn = [];
    this.vr = { x: 0, y: 0, w: 0, h: 0 };
    this.vrTall = { x: 0, y: 0, w: 0, h: 0 };
    this.stained = { x: 0, y: 0, w: 0, h: 0 };
    this.dpr = 1;
    this.w = 1;
    this.h = 1;
    this.frame = 0;
    this.last = 0;
    const self = this;
    // What the models draw with (see models.js).
    this.R = {
      ctx: this.ctx,
      v: null,
      dpr: 1,
      game: null,
      t: 0,
      L: this.lighting,
      night: true,
      fX: 0.6,
      fY: 0.86,
      amb: 0.36,
      roofK: 0.62,
      alpha: 1,
      lx: 0,
      ly: 1,
      cur: null,
      struct(b) {
        return this.amb + (1 - this.amb) * b;
      },
      ground(z) {
        this.v.applyGround(this.ctx, this.dpr, z);
      },
      face(x0, y0, dx, dy, z0) {
        this.v.applyFace(this.ctx, this.dpr, x0, y0, dx, dy, z0);
      },
      reset() {
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      },
      roofText(ctx, r) {
        roofText(ctx, r, this.night);
      },
      benText(ctx, e) {
        benText(ctx, e, this.night);
      },
      /** Is the survivor hidden behind a box over this footprint, between these heights? */
      hides(o, z0, z1) {
        const p = self.eye;
        return !!p && boxHides(this.v, o, z0, z1, p.x, p.y, 24);
      },
    };
    this.eye = null;
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
    game.syncView();
    const ctx = this.ctx;
    const S = game.settings;
    const dpr = this.dpr;
    const v = game.view;
    const R = this.R;
    const L = this.lighting;
    const now = performance.now();
    const dt = clamp((now - (this.last || now)) / 1000, 0, 0.1);
    this.last = now;
    this.frame++;

    if (!this.scene || this.scene.world !== game.world) this.scene = new Scene(game.world, v);
    this.scene.sync(v);

    // World rects around the view: for what lies flat, and (reaching further toward the camera) for what stands tall.
    const vr = v.groundBounds(40, 0, this.vr);
    const vrTall = v.groundBounds(30, 250, this.vrTall);

    R.v = v;
    R.dpr = dpr;
    R.game = game;
    R.t = game.time;
    R.night = !!S.night;
    // The key light comes from the right of the screen, a little toward the camera:
    // the wall on that side is the bright one, shadows fall to the left.
    const lx = v.cy + 0.2 * v.gx;
    const ly = v.sy + 0.2 * v.gy;
    const ll = Math.hypot(lx, ly) || 1;
    R.lx = lx / ll;
    R.ly = ly / ll;
    R.fX = 0.58 + 0.36 * Math.max(0, v.faceX * R.lx);
    R.fY = 0.58 + 0.36 * Math.max(0, v.faceY * R.ly);
    R.amb = S.night ? 0.4 : 0.5;
    R.roofK = S.night ? 0.64 : 1;
    R.alpha = 1;
    this.eye = game.player.alive ? game.player : null;

    L.collect(game, vrTall);

    // --- Ground --------------------------------------------------------------------------
    R.reset();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#060709';
    ctx.fillRect(0, 0, v.w, v.h);
    v.applyGround(ctx, dpr, 0);
    ctx.lineCap = 'round';
    this.drawGround(ctx, game, vr);

    // Blood decal layer (low-res world canvas, soft when upscaled): only the part of it that has stains.
    const fx = game.effects;
    const st = fx.stainedRect(vr, this.stained);
    if (st) {
      const ds = fx.decalScale;
      const sx = Math.max(0, Math.floor(st.x * ds));
      const sy = Math.max(0, Math.floor(st.y * ds));
      const sw = Math.min(fx.decal.width - sx, Math.ceil(st.w * ds));
      const sh = Math.min(fx.decal.height - sy, Math.ceil(st.h * ds));
      if (sw > 0 && sh > 0) ctx.drawImage(fx.decal, sx, sy, sw, sh, sx / ds, sy / ds, sw / ds, sh / ds);
    }

    drawPosters(ctx, game, vr, v);
    drawLoot(ctx, game, vr);
    drawBenLoose(ctx, game, vr);
    this.drawCorpses(ctx, game, vr);
    this.drawGroundParticles(ctx, game, vr);

    // Who and what stands where (needs the lights: things out of sight are left out).
    this.gather(game, vrTall, dt);
    this.drawRings(ctx, game);
    R.reset();
    this.drawShadows(ctx, v, R);

    // --- Night + line of sight over the ground -------------------------------------------
    if (S.night || S.los) {
      L.draw(game, v);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(L.canvas, 0, 0, this.canvas.width, this.canvas.height);
      R.reset();
    }

    // --- Everything that stands up ---------------------------------------------------------
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawFerry(R, game, vrTall);
    this.drawStanding(game);
    drawCanopies(R, game, vrTall);
    for (const p of this.over) p.draw(R, p);
    drawCranes(R, game, vrTall, CRANE_H);
    this.drawXray(ctx, v);
    this.drawAirParticles(ctx, game, v, L);

    // --- What shines through the dark ------------------------------------------------------
    this.drawBright(ctx, game, vr);
    drawLootBright(R, game, vr);
    drawFeaturesBright(R, game, vr);
    drawDocksBright(R, game, vr);
    drawLoreBright(R, game, vr);
    R.ground(0);
    this.drawBuffAura(ctx, game);
    R.reset();
    drawBenBright(R, game, vr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
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

    // Curbs: the pavement stands a step above the road on the sides that face the camera.
    const view = game.view;
    if (!interior && !view.flat) {
      const drop = 3.2 * view.cot;
      const dx = view.gx * drop;
      const dy = view.gy * drop;
      ctx.fillStyle = '#1b1d20';
      ctx.beginPath();
      for (const b of map.blocks) {
        if (!rectsOverlap(b, vr, 8)) continue;
        if (view.faceY) {
          const y = view.faceY > 0 ? b.y + b.h : b.y;
          ctx.moveTo(b.x, y);
          ctx.lineTo(b.x + b.w, y);
          ctx.lineTo(b.x + b.w + dx, y + dy);
          ctx.lineTo(b.x + dx, y + dy);
          ctx.closePath();
        }
        if (view.faceX) {
          const x = view.faceX < 0 ? b.x : b.x + b.w;
          ctx.moveTo(x, b.y);
          ctx.lineTo(x, b.y + b.h);
          ctx.lineTo(x + dx, b.y + b.h + dy);
          ctx.lineTo(x + dx, b.y + dy);
          ctx.closePath();
        }
      }
      ctx.fill();
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

    const tilted = !game.view.flat;
    for (const d of map.decor) {
      if (d.x < vr.x - 40 || d.x > vr.x + vr.w + 40 || d.y < vr.y - 40 || d.y > vr.y + vr.h + 40) continue;
      if (tilted && d._3d) {
        // It stands up (decor3d.js); only what lies on the floor of Ben's fort is painted here.
        if (d.type === 'benfort') drawFort(ctx, d, 'floor');
        continue;
      }
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
          if (!drawLoreDecor(ctx, d) && !drawBenDecor(ctx, d, game.time) && !drawDocksDecor(ctx, d, game.time, game.view)) drawFeatureDecor(ctx, d);
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

  // --- Flat on the ground: corpses, spent casings, rings -------------------------------

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
    // Spent casings that have come to rest (the ones in the air are drawn with the other flying bits).
    for (const p of game.effects.particles) {
      if (p.kind !== 'casing' || p.z > 0 || !pointInRect(p.x, p.y, vr)) continue;
      const a = p.life < 1 ? p.life : 1;
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.shell ? '#b02a22' : '#c9a33f';
      ctx.lineWidth = p.shell ? 2.6 : 1.6;
      const len = p.shell ? 3.2 : 2.2;
      const c = Math.cos(p.rot) * len;
      const s = Math.sin(p.rot) * len;
      ctx.beginPath();
      ctx.moveTo(p.x - c, p.y - s);
      ctx.lineTo(p.x + c, p.y + s);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Rings on the ground so you never lose a survivor in a crowd (ground transform). */
  drawRings(ctx, game) {
    const p = game.player;
    ctx.lineWidth = 1.5;
    if (p.alive && !p.pinnedBy) {
      ctx.strokeStyle = p.hurtT > 0 ? 'rgba(255,90,80,0.8)' : PLAYER_LOOK.ring;
      ctx.beginPath();
      circle(ctx, p.x, p.y, p.r + 5);
      ctx.stroke();
    }
    const a = game.ally;
    if (a && a.alive && !a.down && a._vis > 0.4) {
      ctx.strokeStyle = a.hurtT > 0 ? 'rgba(255,90,80,0.8)' : ALLY_LOOK.ring;
      ctx.beginPath();
      circle(ctx, a.x, a.y, a.r + 5);
      ctx.stroke();
    }
  }

  // --- The painter's list ------------------------------------------------------------------

  _item(k, t, o, b, d) {
    let it = this.pool[this.pn];
    if (!it) it = this.pool[this.pn] = { k: 0, t: 0, o: null, b: 0, d: 0 };
    this.pn++;
    it.k = k;
    it.t = t;
    it.o = o;
    it.b = b;
    it.d = d;
    this.list.push(it);
  }

  /** Something that isn't part of the map: it goes right after the last static it stands in front of. */
  _mover(t, o, x, y, r, b) {
    const v = this.R.v;
    const d = v.depth(x, y);
    this._item((this.scene.slot(v, x, y, r) + 0.5) * SLOT + d + DEPTH0, t, o, b, d);
  }

  /** Line of sight eases in and out (a body doesn't pop as it rounds a corner). Returns 0..1. */
  _seen(o, x, y, dt) {
    const seen = this.lighting.visible(x, y) ? 1 : 0;
    let vis = o._seenF === this.frame - 1 ? o._vis : seen;
    vis += (seen - vis) * Math.min(1, dt * 14);
    o._vis = vis;
    o._seenF = this.frame;
    return vis;
  }

  gather(game, vr, dt) {
    const v = game.view;
    const L = this.lighting;
    const scene = this.scene;
    const p = game.player;
    const list = this.list;
    list.length = 0;
    this.pn = 0;
    const sh = this.shadows;
    sh.length = 0;
    const xray = this.xray;
    xray.length = 0;
    const over = this.over;
    over.length = 0;
    const lamps = this.lampsOn;
    lamps.length = 0;
    const hid = L.hidden;

    // Statics on screen. A tall one standing between the camera and the survivor fades out.
    const vis = scene.cull(v, vr);
    const eye = this.eye;
    const fadeK = Math.min(1, dt * 9);
    const ex = v.cy * 9; // a shoulder's width across the screen, on the ground
    const ey = v.sy * 9;
    for (let i = 0; i < vis.length; i++) {
      const o = vis[i];
      const rec = o._r3;
      let target = 1;
      if (eye && rec.fades && !v.flat) {
        if (boxHides(v, o, 0, rec.h, eye.x, eye.y, 24) || boxHides(v, o, 0, rec.h, eye.x + ex, eye.y + ey, 24) || boxHides(v, o, 0, rec.h, eye.x - ex, eye.y - ey, 24)) target = 0.22;
      }
      rec.a += (target - rec.a) * fadeK;
      if (rec.a > 0.995) rec.a = 1;
      this._item(rec.rank * SLOT, T_STATIC, o, 0, 0);
    }

    // Lamp posts, gate posts, door frames.
    const props = this.propList || (this.propList = []);
    props.length = 0;
    scene.cullProps(v, vr, props);
    for (let i = 0; i < props.length; i++) {
      const q = props[i];
      if (q.decor && v.flat) continue; // from straight above the flat drawing is the right one
      if (q.lamp && game.settings.night && lampLit(q.lamp, game.time)) lamps.push(q);
      if (q.over) {
        over.push(q);
        continue;
      }
      const d = v.depth(q.x, q.y);
      this._item((q.lo + 0.5) * SLOT + d + DEPTH0, T_PROP, q, 0, d);
    }

    // The infected.
    for (const z of game.zombies) {
      if (!z.alive || !v.onScreen(z.x, z.y, 50, 80)) continue;
      const seen = this._seen(z, z.x, z.y, dt);
      const b = L.sample(z.x, z.y) * (hid + (1 - hid) * seen);
      if (z.type === 'common') {
        if (b < 0.032) continue;
        this._mover(T_ZOMBIE, z, z.x, z.y, z.r, b);
        if (seen > 0.3) sh.push(z.x, z.y, z.r);
      } else {
        if (z.type === 'hunter' && z.mode === 'pin') continue; // drawn with the survivor it's on
        if (z.type === 'terror' ? seen < 0.05 : b < 0.032) continue;
        this._mover(T_SPECIAL, z, z.x, z.y, z.r, b);
        if (seen > 0.3 && z.type !== 'terror') sh.push(z.x, z.y, z.r * (z.type === 'tank' ? 1.15 : 1));
      }
      // You could see it from above, but something stands between it and the camera.
      if (seen > 0.6 && b > 0.06 && z.type !== 'terror' && scene.hider(v, z.x, z.y, z.type === 'tank' ? 44 : 24, true)) xray.push(z);
    }

    // Survivors.
    this._mover(T_PLAYER, p, p.x, p.y, p.r, Math.max(0.3, L.sample(p.x, p.y)));
    sh.push(p.x, p.y, p.r);
    const a = game.ally;
    if (a && v.onScreen(a.x, a.y, 50, 60)) {
      const seen = this._seen(a, a.x, a.y, dt);
      const b = L.sample(a.x, a.y) * (hid + (1 - hid) * seen);
      if (b >= 0.032) {
        this._mover(T_ALLY, a, a.x, a.y, a.r, b);
        if (seen > 0.3) sh.push(a.x, a.y, a.r);
        if (a.alive && seen > 0.6 && scene.hider(v, a.x, a.y, 24, true)) xray.push(a);
      }
    } else if (a) a._vis = 0;

    // Things to pick up, crates to search, rocks in the air.
    for (const k of game.pickups) {
      if (k.taken || !v.onScreen(k.x, k.y, 30, 20)) continue;
      const b = L.lit(k.x, k.y);
      if (b < 0.032) continue;
      this._mover(T_PICKUP, k, k.x, k.y, 10, b);
      sh.push(k.x, k.y, 9);
    }
    if (game.loot) {
      for (const s of game.loot.stashes) {
        if (s.tier === 'secret' || !v.onScreen(s.x, s.y, 40, 20)) continue;
        const b = L.lit(s.x, s.y);
        if (b < 0.032) continue;
        this._mover(T_STASH, s, s.x, s.y, 16, b);
        sh.push(s.x, s.y, 15);
      }
    }
    for (const r of game.rocks) {
      if (!r.alive || !v.onScreen(r.x, r.y, 40, 80)) continue;
      this._mover(T_ROCK, r, r.x, r.y, r.r, Math.max(0.2, L.lit(r.x, r.y)));
      sh.push(r.x, r.y, r.r * 0.8);
    }
  }

  /** What things cast on the ground: every static away from the key light, a blob under everything that walks. */
  drawShadows(ctx, v, R) {
    const dx = -R.lx;
    const dy = -R.ly;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    const vis = this.scene.visible;
    for (let i = 0; i < vis.length; i++) {
      const o = vis[i];
      const rec = o._r3;
      if (!rec.shadow || rec.h < 8) continue;
      const len = Math.min(rec.h * 0.5, 50);
      boxShadow(ctx, v, o.x, o.y, o.x + o.w, o.y + o.h, dx * len, dy * len);
    }
    ctx.fill();
    ctx.beginPath();
    const sh = this.shadows;
    for (let i = 0; i < sh.length; i += 3) disc(ctx, v, sh[i] + dx * 5, sh[i + 1] + dy * 5, sh[i + 2] * 0.95, 0);
    ctx.fill();
  }

  drawStanding(game) {
    const list = this.list;
    list.sort((a, b) => a.k - b.k);
    const horde = this.horde;
    const R = this.R;
    const ctx = this.ctx;
    const v = R.v;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (it.t === T_ZOMBIE) {
        if (!horde.fits(it.d)) horde.flush(R);
        horde.add(R, it.o, it.b, it.d);
        continue;
      }
      horde.flush(R);
      const o = it.o;
      switch (it.t) {
        case T_STATIC: {
          const rec = o._r3;
          R.cur = rec;
          R.alpha = rec.a;
          if (rec.a < 1) ctx.globalAlpha = rec.a;
          rec.draw(R, o, rec);
          if (rec.a < 1) ctx.globalAlpha = 1;
          R.alpha = 1;
          break;
        }
        case T_PROP:
          o.draw(R, o);
          break;
        case T_SPECIAL:
          if (o.type === 'hunter') drawHunter(R, o, it.b);
          else if (o.type === 'tank') drawTank(R, o, it.b);
          else if (o.type === 'terror') {
            ctx.globalAlpha = Math.min(1, o._vis * 1.2);
            drawTerror(R, o);
            ctx.globalAlpha = 1;
          }
          break;
        case T_PLAYER:
          this.drawPlayer(R, game, it.b);
          break;
        case T_ALLY:
          this.drawAlly(R, game, it.b);
          break;
        case T_PICKUP:
          this.drawPickup(R, o, it.b);
          break;
        case T_STASH:
          drawStash(R, o, it.b);
          break;
        case T_ROCK: {
          const h = v.flat ? 0 : Math.sin(Math.min(1, o.dist / o.max) * Math.PI) * 34 + 22; // thrown in an arc
          drawRock(R, o.x, o.y, h, o.r, o.rot, it.b);
          break;
        }
        default:
          break;
      }
    }
    horde.flush(R);
    ctx.lineCap = 'round';
  }

  drawPlayer(R, game, b) {
    const p = game.player;
    if (p.pinnedBy && p.alive) {
      drawLying(R, p, PLAYER_LOOK.body, PLAYER_LOOK.skin, PLAYER_LOOK.legs, b);
      if (p.pinnedBy.alive) drawHunter(R, p.pinnedBy, Math.max(b, 0.5));
      return;
    }
    if (!p.alive && game.endT > 0.8) {
      drawLying(R, p, '#2d6f7a', '#9c7d66', '#232a36', b * 0.8);
      return;
    }
    drawSurvivor(R, p, PLAYER_LOOK, b);
  }

  /** The AI teammate: same build, olive jacket, green ring; lying when down. */
  drawAlly(R, game, b) {
    const a = game.ally;
    if (!a.alive) drawLying(R, a, '#3d4422', '#8f6f58', '#2a2820', b * 0.8);
    else if (a.down) drawLying(R, a, ALLY_LOOK.body, ALLY_LOOK.skin, ALLY_LOOK.legs, b);
    else drawSurvivor(R, a, ALLY_LOOK, b);
  }

  /** Medkits and ammo cans: small boxes hovering a little off the ground. */
  drawPickup(R, k, b) {
    const { ctx, v } = R;
    // Spilled from a stash: pops out (overshoots, then settles).
    let sc = 1;
    if (k.pop !== undefined && k.pop < 1) sc = 0.2 + k.pop * 0.8 + Math.sin(k.pop * Math.PI) * 0.35;
    const z0 = v.flat ? 0 : 3.5 + Math.sin(R.t * 3 + k.bob) * 1.5;
    if (k.kind === 'ammo') {
      const hw = 11 * sc;
      const hh = 7.5 * sc;
      const z1 = z0 + 11 * sc;
      box(ctx, v, k.x - hw, k.y - hh, k.x + hw, k.y + hh, z0, z1, tone('#5a6832', b), tone('#4e5b2c', b * R.fX), tone('#4e5b2c', b * R.fY));
      R.ground(z1);
      ctx.fillStyle = tone('#d6a92c', b);
      ctx.fillRect(k.x - hw, k.y - 1.5 * sc, hw * 2, 3 * sc);
      ctx.fillStyle = tone('#2b2f22', b);
      ctx.fillRect(k.x - 4 * sc, k.y - hh + 1, 8 * sc, 3 * sc);
      R.reset();
      return;
    }
    const hw = 10 * sc;
    const hh = 7.5 * sc;
    const z1 = z0 + 8 * sc;
    box(ctx, v, k.x - hw, k.y - hh, k.x + hw, k.y + hh, z0, z1, tone('#e8e8e2', b), tone('#d2d2cb', b * R.fX), tone('#d2d2cb', b * R.fY));
    R.ground(z1);
    ctx.fillStyle = tone('#d0302a', b);
    ctx.fillRect(k.x - 2 * sc, k.y - 5.5 * sc, 4 * sc, 11 * sc);
    ctx.fillRect(k.x - 6 * sc, k.y - 2 * sc, 12 * sc, 4 * sc);
    R.reset();
  }

  /** Bodies in your line of sight that something hides from the camera: faint outlines through it. */
  drawXray(ctx, v) {
    const xr = this.xray;
    if (!xr.length) return;
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      // Infected in red, the teammate in green.
      let any = false;
      for (const z of xr) {
        if ((z.type === undefined) !== (pass === 1)) continue;
        if (!any) {
          any = true;
          ctx.strokeStyle = pass ? 'rgba(140,255,160,0.34)' : 'rgba(255,92,76,0.3)';
          ctx.fillStyle = ctx.strokeStyle;
          ctx.lineWidth = 11 * v.scale;
          ctx.beginPath();
        }
        ghostPath(ctx, v, z, z.type === 'hunter' ? hunterLift(z) : 0);
      }
      if (!any) continue;
      ctx.stroke();
      ctx.beginPath();
      for (const z of xr) {
        if ((z.type === undefined) !== (pass === 1)) continue;
        const k = z.r / 11;
        ball(ctx, v, z.x, z.y, 37 * k + (z.type === 'hunter' ? hunterLift(z) : 0), 5.4 * k);
      }
      ctx.fill();
    }
  }

  /** Blood, gibs, debris and casings in flight; smoke, dust and steam. Shaded by the light where they are. */
  drawAirParticles(ctx, game, v, L) {
    const s = v.scale;
    for (const p of game.effects.particles) {
      const k = p.kind;
      if (k === 'spark' || (k === 'casing' && p.z <= 0)) continue;
      const sx = v.px(p.x, p.y);
      if (sx < -30 || sx > v.w + 30) continue;
      const sy = v.py(p.x, p.y, p.z || 0);
      if (sy < -30 || sy > v.h + 30) continue;
      const b = L.sample(p.x, p.y);
      if (k === 'blood') {
        const d = p.size * s;
        ctx.fillStyle = tone(p.color, b);
        ctx.fillRect(sx - d / 2, sy - d / 2, d, d);
      } else if (k === 'gib' || k === 'debris') {
        const d = p.size * s;
        if (k === 'debris') ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.fillStyle = tone(p.color, b);
        ctx.fillRect(sx - d / 2, sy - d / 2, d, d * 0.75);
        ctx.globalAlpha = 1;
      } else if (k === 'casing') {
        ctx.strokeStyle = tone(p.shell ? '#b02a22' : '#c9a33f', Math.max(b, 0.3));
        ctx.lineWidth = (p.shell ? 2.6 : 1.6) * s;
        const len = (p.shell ? 3.2 : 2.2) * s;
        ctx.beginPath();
        ctx.moveTo(sx - Math.cos(p.rot) * len, sy - Math.sin(p.rot) * len);
        ctx.lineTo(sx + Math.cos(p.rot) * len, sy + Math.sin(p.rot) * len);
        ctx.stroke();
      } else if (k === 'smoke' || k === 'dust' || k === 'steam') {
        const a = (p.life / p.max) * (k === 'smoke' ? 0.22 : k === 'steam' ? 0.2 : 0.18) * (0.3 + 0.7 * b);
        ctx.fillStyle = k === 'smoke' ? `rgba(60,60,62,${a})` : k === 'steam' ? `rgba(225,232,240,${a})` : `rgba(150,140,120,${a})`;
        ctx.beginPath();
        ctx.arc(sx, sy, p.size * s, 0, TAU);
        ctx.fill();
      }
    }
  }

  /** Adrenaline: a quick yellow pulse around you while it lasts (ground transform). */
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

  // --- Bright things drawn over the darkness -----------------------------------------

  drawBright(ctx, game, vr) {
    const S = game.settings;
    const fx = game.effects;
    const p = game.player;
    const t = game.time;
    const R = this.R;
    const v = R.v;
    const s = v.scale;
    const gz = v.flat ? 0 : GUN_Z;
    const map = game.world.map;

    // Laser sight / shotgun cone, at gun height.
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
        for (const sgn of [-1, 1]) line3(ctx, v, x0, y0, gz, p.x + Math.cos(p.fireAngle + sgn * spread) * def.range, p.y + Math.sin(p.fireAngle + sgn * spread) * def.range, gz);
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(255,60,50,${alpha})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      line3(ctx, v, x0, y0, gz, p.x + ca * tEnd, p.y + sa * tEnd, gz);
      ctx.stroke();
      if (tEnd < def.range - 1) {
        ctx.fillStyle = `rgba(255,80,60,${alpha + 0.3})`;
        ctx.beginPath();
        ball(ctx, v, p.x + ca * tEnd, p.y + sa * tEnd, gz, 2.2);
        ctx.fill();
      }
      if (p.assist && p.assist.alive) {
        ctx.strokeStyle = `rgba(255,120,90,${alpha * 0.7})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        disc(ctx, v, p.assist.x, p.assist.y, p.assist.r + 5, 1);
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
      ctx.lineWidth = tr.width * Math.max(0.8, s);
      ctx.beginPath();
      // Tracer streaks toward the hit: tail catches up as it fades.
      const k = 1 - a;
      line3(ctx, v, tr.x0 + (tr.x1 - tr.x0) * k * 0.7, tr.y0 + (tr.y1 - tr.y0) * k * 0.7, gz, tr.x1, tr.y1, gz);
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
      ctx.moveTo(v.px(m.x - sa * W, m.y + ca * W), v.py(m.x - sa * W, m.y + ca * W, gz));
      ctx.lineTo(v.px(m.x + ca * L, m.y + sa * L), v.py(m.x + ca * L, m.y + sa * L, gz));
      ctx.lineTo(v.px(m.x + sa * W, m.y - ca * W), v.py(m.x + sa * W, m.y - ca * W, gz));
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(255,240,200,${a})`;
      ctx.beginPath();
      ball(ctx, v, m.x, m.y, gz, 4 * m.size);
      ctx.fill();
    }
    // Sparks + embers.
    for (const q of fx.particles) {
      if (q.kind !== 'spark') continue;
      const a = Math.max(0, q.life / q.max);
      const d = q.size * Math.max(1, s);
      ctx.fillStyle = `rgba(255,${180 + ((q.size * 30) | 0)},90,${a})`;
      ctx.fillRect(v.px(q.x, q.y) - d / 2, v.py(q.x, q.y, v.flat ? 0 : q.z || 0) - d / 2, d, d);
    }
    // Fires: on wrecks, in barrels.
    const interior = map.theme === 'interior';
    for (const f of map.fires) {
      if (!pointInRect(f.x, f.y, vr)) continue;
      const base = v.flat ? 0 : f.barrel || interior ? 30 : 20;
      for (let k = 0; k < 6; k++) {
        const fl = Math.sin(t * (9 + k * 2.3) + k * 1.7) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255,${120 + k * 20},40,${0.25 + fl * 0.25})`;
        ctx.beginPath();
        const spread = f.barrel || interior ? 0.5 : 1;
        ball(ctx, v, f.x + Math.sin(k * 2.1) * 12 * spread, f.y + Math.cos(k * 1.3) * 14 * spread, base + (v.flat ? 0 : k * 5 + fl * 7), Math.max(2, 7 + fl * 6 - k));
        ctx.fill();
      }
    }
    // Lamps that are on: a glow around the head of the post / the strip light.
    for (const q of this.lampsOn) {
      const gx = v.px(q.gx, q.gy);
      const gy = v.py(q.gx, q.gy, v.flat ? 0 : q.gz);
      const r = (q.glow || 20) * Math.max(0.8, s);
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
      const col = q.lamp.interior ? '205,225,255' : '255,214,150';
      g.addColorStop(0, `rgba(${col},0.55)`);
      g.addColorStop(0.3, `rgba(${col},0.2)`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
    }
    // Exit signs over the doors.
    if (map.signs) {
      for (const q of map.signs) {
        if (!pointInRect(q.x, q.y, vr, 20)) continue;
        const gx = v.px(q.x, q.y);
        const gy = v.py(q.x, q.y, v.flat ? 0 : 50);
        ctx.fillStyle = 'rgba(60,255,120,0.18)';
        ctx.beginPath();
        ctx.arc(gx, gy, 16 * s, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(90,255,140,0.9)';
        ctx.fillRect(gx - 8 * s, gy - 3 * s, 16 * s, 6 * s);
      }
    }
    // Coloured pools of light on the ground (vending machines, dens, floodlights).
    if (map.glows) {
      R.ground(0);
      for (const g2 of map.glows) {
        if (!pointInRect(g2.x, g2.y, vr, 40)) continue;
        ctx.fillStyle = g2.tint;
        ctx.beginPath();
        circle(ctx, g2.x, g2.y, 22);
        ctx.fill();
      }
      R.reset();
    }
    // Alarms: the blinking red light on the dash (the tell), hazard lights / the strobe once it's going off.
    for (const o of this.scene.visible) {
      if (!o.alarm) continue;
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      if (o.kind === 'alarmbox') {
        if (o.alarmOn && Math.sin(t * 14) > 0) {
          ctx.fillStyle = 'rgba(255,60,50,0.35)';
          ctx.beginPath();
          ball(ctx, v, cx, cy, v.flat ? 0 : 34, 60);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,230,230,0.95)';
          ctx.beginPath();
          ball(ctx, v, cx, cy, v.flat ? 0 : 34, 7);
          ctx.fill();
        }
        continue;
      }
      if (o.alarmOn) {
        if (Math.sin(t * 10) > 0) {
          ctx.fillStyle = 'rgba(255,170,60,0.9)';
          ctx.beginPath();
          for (const [qx, qy] of [[o.x + 5, o.y + 5], [o.x + o.w - 5, o.y + 5], [o.x + 5, o.y + o.h - 5], [o.x + o.w - 5, o.y + o.h - 5]]) ball(ctx, v, qx, qy, v.flat ? 0 : 16, 4);
          ctx.fill();
        }
      } else if (!o.alarmDone && Math.sin(t * 6) > 0.3) {
        // L4D tell: a blinking red light behind the windscreen.
        const vert = o.h > o.w;
        const len = vert ? o.h : o.w;
        const at = (o.front || 1) > 0 ? len * 0.7 : len * 0.3;
        ctx.fillStyle = '#ff2a2a';
        ctx.beginPath();
        ball(ctx, v, vert ? cx : o.x + at, vert ? o.y + at : cy, v.flat ? 0 : (o.truck ? 41 : 33) + 1, 2.6);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,40,40,0.25)';
        ctx.beginPath();
        ball(ctx, v, vert ? cx : o.x + at, vert ? o.y + at : cy, v.flat ? 0 : (o.truck ? 41 : 33) + 1, 8);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // Shove swoosh, at arm height.
    if (fx.arcs.length) {
      R.ground(v.flat ? 0 : 20);
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
      R.reset();
    }
  }

  /** The teammate down: a pulsing ring you can find in the dark, and the revive progress. */
  drawAllyTells(ctx, game, vr) {
    const a = game.ally;
    if (!a || !a.alive || !a.down || !pointInRect(a.x, a.y, vr, 40)) return;
    const t = game.time;
    const R = this.R;
    R.ground(0);
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
    R.reset();
  }

  /** Telegraphs drawn over the darkness: you must be able to read them in time. */
  drawSpecialTells(ctx, game, vr) {
    const p = game.player;
    const t = game.time;
    const R = this.R;
    const v = R.v;
    for (const z of game.zombies) {
      // Generous cull: the telegraph line reaches you even if the thrower is off-screen.
      if (!z.alive || z.type === 'common' || !pointInRect(z.x, z.y, vr, 900)) continue;
      const seen = v.onScreen(z.x, z.y, 40, 60) && game.world.segmentClear(p.x, p.y, z.x, z.y);
      if (z.type === 'hunter') {
        if (z.mode === 'crouch') {
          // Pounce line + a closing ring on the ground: the shove-timing cue.
          const k = Math.max(0, z.modeT) / 0.75;
          R.ground(v.flat ? 0 : 2);
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
          R.reset();
        } else if (z.mode === 'leap') {
          const lift = v.flat ? 0 : 12 + hunterLift(z);
          for (let i = 0; i < z.trail.length; i++) {
            const g = z.trail[i];
            ctx.fillStyle = `rgba(150,170,255,${(i / z.trail.length) * 0.25})`;
            ctx.beginPath();
            ball(ctx, v, g.x, g.y, lift, z.r * 0.9);
            ctx.fill();
          }
        }
        if (seen && z.mode !== 'pin') {
          // Its eyes catch the light.
          hunterEyes(v, z, eyes);
          const ex = v.px(eyes.x, eyes.y);
          const ey = v.py(eyes.x, eyes.y, v.flat ? 0 : eyes.z);
          ctx.fillStyle = 'rgba(230,240,255,0.95)';
          ctx.beginPath();
          ctx.arc(ex - 2.6, ey, 1.6, 0, TAU);
          ctx.moveTo(ex + 4.2, ey);
          ctx.arc(ex + 2.6, ey, 1.6, 0, TAU);
          ctx.fill();
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
          ball(ctx, v, b.x, b.y, v.flat ? 0 : 38 + k * 6, 3 + k * 12);
          ctx.fill();
        }
      } else if (z.type === 'tank') {
        if (z.mode === 'throw') {
          R.ground(v.flat ? 0 : 2);
          ctx.setLineDash([12, 10]);
          ctx.lineDashOffset = -t * 50;
          ctx.strokeStyle = `rgba(255,170,60,${0.4 + Math.sin(t * 18) * 0.15})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(z.x, z.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.setLineDash([]);
          R.reset();
        } else if (z.mode === 'punch') {
          // Where the haymaker will land.
          const reach = z.r + p.r + 32;
          R.ground(v.flat ? 0 : 1);
          ctx.fillStyle = `rgba(255,50,30,${0.12 + (1 - z.modeT / 0.42) * 0.22})`;
          ctx.beginPath();
          ctx.moveTo(z.x, z.y);
          ctx.arc(z.x, z.y, reach, z.face - 1.3, z.face + 1.3);
          ctx.closePath();
          ctx.fill();
          R.reset();
        }
        if (seen) {
          const hx = z.x + Math.cos(z.face) * 18;
          const hy = z.y + Math.sin(z.face) * 18;
          const ex = v.px(hx, hy);
          const ey = v.py(hx, hy, v.flat ? 0 : 61);
          ctx.fillStyle = 'rgba(255,90,60,0.9)';
          ctx.beginPath();
          ctx.arc(ex - 3, ey, 1.8, 0, TAU);
          ctx.moveTo(ex + 4.8, ey);
          ctx.arc(ex + 3, ey, 1.8, 0, TAU);
          ctx.fill();
        }
      }
    }
  }
}
