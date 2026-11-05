// Draws the beans, their weapons, arrows and dropped gear. ctx is already in
// world space (camera applied). Everything reads straight from the sim.

import { TEAMS } from '../config.js';
import { WEAPONS } from '../sim/unit-types.js';
import { itemShieldFrame } from '../sim/battle.js';
import { drawHat, hatAnchor } from './hats.js';

const HAT_AT = {}; // reused: no allocation per hat
let A0 = 1; // the caller's globalAlpha while a unit is drawn (parts that set their own alpha multiply it)
let scratch = null; // offscreen canvas for drawing a see-through unit in one piece

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const LIGHT_X = -0.6; // light comes from the upper left
const LIGHT_Y = -0.8;

const WOOD = '#8f5a2c';
const WOOD_DARK = '#5a3415';
const WOOD_LIGHT = '#b9824c';
const STEEL = '#dfe5ec';
const STEEL_DARK = '#7d8896';
const OUTLINE = '#2a1d14';
const EYE_LINE = '#1d1a24';

export class UnitRenderer {
  /** opts: { showHp: small HP bars over hurt units (arena; the sandbox leaves them off) } */
  constructor(opts = {}) {
    this.trails = new Map(); // unit id -> recent weapon tip positions
    this.palettes = {}; // team -> palette override (your army colour)
    this.showHp = !!(opts && opts.showHp);
  }

  pal(team) {
    return this.palettes[team] || TEAMS[team];
  }

  /** Ground shadows for every unit and item (drawn before anything stands on the grass). */
  drawShadows(ctx, battle) {
    ctx.fillStyle = 'rgba(28, 52, 12, 0.28)';
    ctx.beginPath();
    for (const u of battle.units) {
      if (u.gone) continue;
      const h = clamp((u.ground - u.hip.y - u.standH) / 160, 0, 1);
      const rx = u.R * (u.alive ? 1.25 : 1.6) * (1 - h * 0.5);
      const cx = (u.hip.x + u.head.x * (u.alive ? 0 : 1)) / (u.alive ? 1 : 2);
      ctx.moveTo(cx + rx, u.ground + 1.5);
      ctx.ellipse(cx, u.ground + 1.5, rx, 3.6 * (1 - h * 0.6), 0, 0, TAU);
    }
    ctx.fill();
  }

  /** Arrows stuck in the dirt, and in tower walls (draw after the towers: the tip is buried in the stone). */
  drawGroundArrows(ctx, battle) {
    for (const a of battle.arrows) {
      if (a.state !== 'ground' && a.state !== 'tower') continue;
      const pz = battle.arrowPose(a);
      if (!pz) continue;
      const al = clamp(a.alpha ?? 1, 0, 1);
      if (al <= 0) continue;
      drawArrow(ctx, pz.x, pz.y, pz.ang, a.team, al, a.state === 'tower' ? 6 : 0);
    }
  }

  drawFlyingArrows(ctx, battle) {
    for (const a of battle.arrows) {
      if (a.state !== 'fly') continue;
      // Faint streak behind so arrows read at phone zoom
      const sp = Math.hypot(a.vx, a.vy) || 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const tx = a.x - Math.cos(a.ang) * 30;
      const ty = a.y - Math.sin(a.ang) * 30;
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - (a.vx / sp) * 26, ty - (a.vy / sp) * 26);
      ctx.stroke();
      drawArrow(ctx, a.x, a.y, a.ang, a.team, 1, 0);
    }
  }

  drawItems(ctx, battle) {
    const base = ctx.globalAlpha;
    for (const it of battle.items) {
      // Arena: dropped gear fades away with the corpses
      const fade = it.fade == null ? 1 : clamp(it.fade, 0, 1);
      if (fade <= 0) continue;
      ctx.globalAlpha = base * fade;
      if (it.kind === 'club') drawClub(ctx, it.a.x, it.a.y, it.b.x, it.b.y);
      else if (it.kind === 'hammer') drawHammer(ctx, it.a.x, it.a.y, it.b.x, it.b.y);
      else if (it.kind === 'hat') {
        // Up is the brim turned a quarter: hats tumble and can land upside down
        const dx = it.b.x - it.a.x;
        const dy = it.b.y - it.a.y;
        drawHat(ctx, it.hat, (it.a.x + it.b.x) / 2, (it.a.y + it.b.y) / 2, Math.atan2(-dx, dy), it.R, this.pal(it.team), it.age || 0, it.f || 1);
      }
      else if (it.kind === 'sword') drawSword(ctx, it.a.x, it.a.y, it.b.x, it.b.y);
      else if (it.kind === 'bow') {
        const mx = (it.a.x + it.b.x) / 2;
        const my = (it.a.y + it.b.y) / 2;
        const dx = it.b.x - it.a.x;
        const dy = it.b.y - it.a.y;
        const l = Math.hypot(dx, dy) || 1;
        // belly sticks out perpendicular to the limbs
        const nx = (-dy / l) * (it.side || 1);
        const ny = (dx / l) * (it.side || 1);
        drawBow(ctx, mx, my, nx, ny, -dx / l, -dy / l, 0, null, null, it.team);
      } else if (it.kind === 'shield') {
        const sh = itemShieldFrame(it);
        drawShield(ctx, sh, it.side || 1);
        for (const ar of battle.arrows) if (ar.item === it) {
          const pz = battle.arrowPose(ar);
          if (pz) drawArrow(ctx, pz.x, pz.y, pz.ang, ar.team, fade, 6);
        }
      }
    }
    ctx.globalAlpha = base;
  }

  drawUnits(ctx, battle, time) {
    // Corpses first, then the living, each back-to-front by lane
    for (let pass = 0; pass < 2; pass++) {
      for (const u of battle.units) {
        if ((pass === 0) === u.alive || u.gone) continue;
        // Arena corpses fade out (u.fade 1 -> 0) before they are removed
        const fade = u.fade == null ? 1 : u.fade;
        if (fade < 1) this.drawUnitAlpha(ctx, u, battle, time, fade);
        else this.drawUnit(ctx, u, battle, time);
      }
    }
  }

  /**
   * Draw a unit see-through as one piece (no limbs showing through the body):
   * it is drawn into an offscreen canvas at the same scale, then composited
   * with `alpha`. Used for fading corpses and deploy ghosts.
   */
  drawUnitAlpha(ctx, u, battle, time, alpha) {
    if (!(alpha > 0.004)) return;
    const base = ctx.globalAlpha;
    if (alpha >= 0.996) {
      this.drawUnit(ctx, u, battle, time);
      return;
    }
    const m = ctx.getTransform();
    const cv = ctx.canvas;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of u.parts) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    const pad = u.R * 1.8 + 34; // hats, weapons, stuck arrows
    // Device-pixel box (the camera never rotates, but map all four corners anyway)
    let dx0 = Infinity;
    let dy0 = Infinity;
    let dx1 = -Infinity;
    let dy1 = -Infinity;
    for (const [wx, wy] of [[x0 - pad, y0 - pad], [x1 + pad, y0 - pad], [x0 - pad, y1 + pad], [x1 + pad, y1 + pad]]) {
      const X = m.a * wx + m.c * wy + m.e;
      const Y = m.b * wx + m.d * wy + m.f;
      if (X < dx0) dx0 = X;
      if (X > dx1) dx1 = X;
      if (Y < dy0) dy0 = Y;
      if (Y > dy1) dy1 = Y;
    }
    const bx = Math.max(0, Math.floor(dx0));
    const by = Math.max(0, Math.floor(dy0));
    const bw = Math.min(cv ? cv.width : 4096, Math.ceil(dx1)) - bx;
    const bh = Math.min(cv ? cv.height : 4096, Math.ceil(dy1)) - by;
    if (bw <= 0 || bh <= 0) return;
    if (bw > 1400 || bh > 1400 || typeof document === 'undefined') {
      // Huge on screen (or no DOM): plain alpha is good enough
      ctx.globalAlpha = base * alpha;
      this.drawUnit(ctx, u, battle, time);
      ctx.globalAlpha = base;
      return;
    }
    if (!scratch) scratch = document.createElement('canvas');
    if (scratch.width < bw || scratch.height < bh) {
      scratch.width = Math.max(scratch.width, bw, 64);
      scratch.height = Math.max(scratch.height, bh, 64);
    }
    const sg = scratch.getContext('2d');
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.globalAlpha = 1;
    sg.clearRect(0, 0, bw, bh);
    sg.setTransform(m.a, m.b, m.c, m.d, m.e - bx, m.f - by);
    this.drawUnit(sg, u, battle, time);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = base * alpha;
    ctx.drawImage(scratch, 0, 0, bw, bh, bx, by, bw, bh);
    ctx.restore();
  }

  /**
   * Small HP bars over hurt living units (only when showHp is on). Call after
   * the units (and the front grass). view.dpr: the canvas pixel ratio.
   */
  drawHpBars(ctx, battle, view = {}) {
    if (!this.showHp || !battle) return;
    const m = ctx.getTransform();
    const dpr = Number.isFinite(view && view.dpr) ? view.dpr : Math.min(globalThis.devicePixelRatio || 1, 2);
    const zoom = Math.hypot(m.a, m.b) / dpr || 1;
    const k = clamp((0.9 / zoom) ** 0.6, 1, 1.8); // keep them readable when zoomed far out
    const px = 1 / zoom; // one CSS px in world units
    const base = ctx.globalAlpha;
    for (const u of battle.units) {
      if (!u.alive || u.gone || u.dropping || !(u.maxHp > 0) || !(u.hp < u.maxHp)) continue;
      const frac = clamp(u.hp / u.maxHp, 0, 1);
      const T = this.pal(u.team);
      const w = clamp(u.R * 2.2, 24, 50) * k;
      const h = 4.4 * k;
      const top = Math.min(u.head.y, u.chest.y) - u.R * (u.hat ? 2.1 : 1) - 8 * k;
      const x = u.chest.x - w / 2;
      const y = top - h / 2;
      const e = 1.3 * px;
      ctx.fillStyle = 'rgba(26,20,38,0.82)';
      ctx.fillRect(x - e, y - e, w + 2 * e, h + 2 * e);
      ctx.fillStyle = '#4a4360';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = u.hurtT > 0.05 ? '#ffffff' : T.body;
      ctx.fillRect(x, y, w * frac, h);
      ctx.fillStyle = T.light;
      ctx.globalAlpha = base * 0.7;
      ctx.fillRect(x, y, w * frac, h * 0.35);
      ctx.globalAlpha = base;
    }
  }

  drawUnit(ctx, u, battle, time) {
    A0 = ctx.globalAlpha;
    const T = this.pal(u.team);
    const f = u.f;
    const R = u.R;
    const hip = u.hip;
    const chest = u.chest;
    const head = u.head;
    const mi = u.mainHand;
    const oi = 1 - mi;
    const limbW = Math.max(2.4, R * 0.3);
    const farCol = T.shade;
    const nearCol = T.limb;
    const size = R / 13; // hands and feet grow with the body
    const twoHanded = (u.type.weapon === 'club' || u.type.weapon === 'hammer') && u.tip;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // --- far side: legs, far arm, sword (in far hand) -----------------------
    drawLimb(ctx, hip, u.knee[0], u.foot[0], farCol, limbW * 1.1);
    drawFoot(ctx, u.foot[0], f, T.dark, size);
    drawLimb(ctx, hip, u.knee[1], u.foot[1], nearCol, limbW * 1.1);
    drawFoot(ctx, u.foot[1], f, T.dark, size);

    if (twoHanded) {
      // Off hand behind on the shaft
      drawLimb(ctx, chest, u.elbow[oi], u.hand[oi], farCol, limbW);
    } else {
      drawLimb(ctx, chest, u.elbow[0], u.hand[0], farCol, limbW);
      drawHand(ctx, u.hand[0], farCol, size);
    }
    if (u.type.weapon === 'sword' && u.tip) {
      this.trail(ctx, u, time);
      drawSword(ctx, u.hand[mi].x, u.hand[mi].y, u.tip.x, u.tip.y);
    }

    if (u.type.weapon === 'bow') drawQuiver(ctx, u, T);

    // Arrows stuck in the body (drawn behind it so the buried part is hidden)
    for (const a of u.arrows) {
      const pz = battle.arrowPose(a);
      drawArrow(ctx, pz.x, pz.y, pz.ang, a.team, 1, 7);
    }

    // --- body -------------------------------------------------------------------
    if (u.type.shape === 'bean' || !u.type.shape) this.drawBean(ctx, u, T);
    else this.drawShape(ctx, u, T, time);
    if (u.type.shield && !u.hat) drawHelmet(ctx, u);
    if (u.type.blast) drawFuse(ctx, u, time);
    this.drawFace(ctx, u, T, time);
    if (u.hat) {
      const a = hatAnchor(u, HAT_AT); // seat per body shape, follows squash & stretch
      drawHat(ctx, u.hat, a.x, a.y, a.ang, u.R, T, time, u.f);
    }

    // --- near side: arm + held item ---------------------------------------------
    if (twoHanded) {
      this.trail(ctx, u, time);
      if (u.type.weapon === 'hammer') drawHammer(ctx, u.hand[mi].x, u.hand[mi].y, u.tip.x, u.tip.y);
      else drawClub(ctx, u.hand[mi].x, u.hand[mi].y, u.tip.x, u.tip.y);
      drawLimb(ctx, chest, u.elbow[mi], u.hand[mi], nearCol, limbW);
      drawHand(ctx, u.hand[mi], nearCol, size);
      drawHand(ctx, u.hand[oi], farCol, size);
    } else if (u.type.shield) {
      drawLimb(ctx, chest, u.elbow[oi], u.hand[oi], nearCol, limbW);
      drawHand(ctx, u.hand[oi], nearCol, size);
      if (u.alive) {
        const sh = u.shieldFrameRaw();
        drawShield(ctx, sh, f);
        for (const a of u.shieldArrows) {
          const pz = battle.arrowPose(a);
          if (pz) drawArrow(ctx, pz.x, pz.y, pz.ang, a.team, 1, 6);
        }
      }
    } else if (u.type.weapon === 'bow') {
      drawLimb(ctx, chest, u.elbow[1], u.hand[1], nearCol, limbW);
      if (u.alive) {
        const bh = u.hand[1];
        let ang = u.aimAng;
        if (!u.act) ang = Math.atan2(u.fwy - u.uy * 0.25, u.fwx - u.ux * 0.25);
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        const sh = u.hand[0];
        const drawing = u.bowDraw > 0.02;
        drawBow(ctx, bh.x, bh.y, dx, dy, -dy * f, dx * f, u.bowDraw, drawing ? sh : null, drawing && u.nocked ? u.team : null, u.team);
      }
      drawHand(ctx, u.hand[1], nearCol, size);
    } else {
      drawLimb(ctx, chest, u.elbow[1], u.hand[1], nearCol, limbW);
      drawHand(ctx, u.hand[1], nearCol, size);
    }

    if (u.dizzy > 0 && u.alive) drawDizzy(ctx, u, time);
  }

  drawBean(ctx, u, T) {
    const R = u.R;
    const hip = u.hip;
    const chest = u.chest;
    const head = u.head;
    // Quadratic through the chest at t = 0.5
    const qx = 2 * chest.x - (hip.x + head.x) / 2;
    const qy = 2 * chest.y - (hip.y + head.y) / 2;
    // Light-side normal
    let nx = -u.uy;
    let ny = u.ux;
    if (nx * LIGHT_X + ny * LIGHT_Y < 0) {
      nx = -nx;
      ny = -ny;
    }
    ctx.save();
    // Squash & stretch around the hips along the body axis
    const sq = u.sq;
    if (Math.abs(sq) > 0.004) {
      const c = u.ux;
      const s = u.uy;
      const a = 1 - sq * 0.85; // along the spine
      const b = 1 + sq; // across
      // M = R * diag(a, b) * R^T in the body frame
      const m11 = c * c * a + s * s * b;
      const m12 = c * s * (a - b);
      const m22 = s * s * a + c * c * b;
      ctx.translate(hip.x, hip.y);
      ctx.transform(m11, m12, m12, m22, 0, 0);
      ctx.translate(-hip.x, -hip.y);
    }
    const hurt = u.hurtT > 0.05 && u.alive; // white flash, then a light tint
    const tint = u.hurtT > 0 && !hurt && u.alive;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(hip.x, hip.y);
      ctx.quadraticCurveTo(qx, qy, head.x, head.y);
    };
    // 1) shade (full width)
    path();
    ctx.strokeStyle = hurt ? '#ffffff' : T.shade;
    ctx.lineWidth = R * 2;
    ctx.stroke();
    if (!hurt) {
      // 2) body colour, shifted toward the light
      ctx.translate(nx * R * 0.17, ny * R * 0.17);
      path();
      ctx.strokeStyle = tint ? T.light : T.body;
      ctx.lineWidth = R * 1.66;
      ctx.stroke();
      // 3) highlight streak on the upper part
      ctx.translate(nx * R * 0.3, ny * R * 0.3);
      ctx.beginPath();
      const t0 = 0.3;
      const t1 = 0.92;
      for (let i = 0; i <= 6; i++) {
        const t = t0 + ((t1 - t0) * i) / 6;
        const mt = 1 - t;
        const x = mt * mt * hip.x + 2 * mt * t * qx + t * t * head.x;
        const y = mt * mt * hip.y + 2 * mt * t * qy + t * t * head.y;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = T.light;
      ctx.globalAlpha = A0 * 0.7;
      ctx.lineWidth = R * 0.5;
      ctx.stroke();
      ctx.globalAlpha = A0;
    }
    ctx.restore();
  }

  /** Bricks, triangles and balls: filled shapes with the same two-tone lighting as the beans. */
  drawShape(ctx, u, T, time) {
    const R = u.R;
    let nx = -u.uy;
    let ny = u.ux;
    if (nx * LIGHT_X + ny * LIGHT_Y < 0) {
      nx = -nx;
      ny = -ny;
    }
    ctx.save();
    applySquash(ctx, u);
    const hurt = u.hurtT > 0.05 && u.alive;
    const tint = u.hurtT > 0 && !hurt && u.alive;
    let base = tint ? T.light : T.body;
    // A lit bomb blinks faster and faster
    if (u.type.blast && ((u.act && u.act.phase === 'fuse') || u.deathFuse > 0) && Math.sin(time * (10 + 40 * u.fuseT)) > 0.2) base = u.fuseT > 0.6 ? '#ffffff' : '#ff8a5c';
    shapePath(ctx, u);
    ctx.fillStyle = hurt ? '#ffffff' : T.shade;
    ctx.fill();
    if (!hurt) {
      ctx.save();
      shapePath(ctx, u);
      ctx.clip();
      ctx.translate(nx * R * 0.2, ny * R * 0.2);
      shapePath(ctx, u);
      ctx.fillStyle = base;
      ctx.fill();
      ctx.translate(-nx * R * 0.2, -ny * R * 0.2);
      if (u.type.shape === 'brick') drawMortar(ctx, u, T);
      // Soft highlight on the lit upper side
      const c = u.chest;
      const up = u.type.shape === 'ball' ? R * 0.35 : u.L * 0.3;
      ctx.globalAlpha = A0 * 0.55;
      ctx.fillStyle = T.light;
      ctx.beginPath();
      ctx.ellipse(c.x + nx * R * 0.45 + u.ux * up, c.y + ny * R * 0.45 + u.uy * up, R * 0.22, u.type.shape === 'brick' ? R * 0.9 : R * 0.38, Math.atan2(u.uy, u.ux), 0, TAU);
      ctx.fill();
      ctx.globalAlpha = A0;
      ctx.restore();
    }
    ctx.restore();
  }

  drawFace(ctx, u, T, time) {
    const R = u.R;
    const head = u.head;
    const ux = u.ux;
    const uy = u.uy;
    const fx = u.fwx;
    const fy = u.fwy;
    // Body-frame point near the head -> world; shapes put the face lower or further forward
    const face = u.type.face || ZERO_FACE;
    const ofw = face.fw * R;
    const oup = face.up * R;
    const P = (fw, up) => [head.x + fx * (fw + ofw) + ux * (up + oup), head.y + fy * (fw + ofw) + uy * (up + oup)];
    const er = R * 0.42;
    const eyes = [
      { p: P(R * 0.22, R * 0.14), r: er * 0.9 },
      { p: P(R * 0.74, R * 0.04), r: er },
    ];
    // Dead: eyes stay open in shock for a beat, then turn into cartoon X's
    const blink = u.alive && u.blinkT < 0 ? 1 : 0;
    const xEyes = !u.alive && u.deadT > 0.45;
    for (let i = 0; i < 2; i++) {
      const { p, r } = eyes[i];
      const e = u.eyes[i];
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = Math.max(0.8, R * 0.07);
      ctx.strokeStyle = EYE_LINE;
      ctx.stroke();
      if (xEyes) {
        const k = r * 0.55;
        ctx.lineWidth = Math.max(1.2, R * 0.14);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p[0] - k, p[1] - k);
        ctx.lineTo(p[0] + k, p[1] + k);
        ctx.moveTo(p[0] + k, p[1] - k);
        ctx.lineTo(p[0] - k, p[1] + k);
        ctx.stroke();
        continue;
      }
      const s = r / er;
      ctx.beginPath();
      ctx.arc(p[0] + e.ox * s, p[1] + e.oy * s, r * 0.5, 0, TAU);
      ctx.fillStyle = '#111018';
      ctx.fill();
      // tiny catchlight
      ctx.beginPath();
      ctx.arc(p[0] + e.ox * s - r * 0.18, p[1] + e.oy * s - r * 0.2, r * 0.14, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
      if (blink > 0) drawLid(ctx, p[0], p[1], r, ux, uy, blink, T.body);
    }
    // Angry brows during attacks / battle cry
    if (u.brow > 0.05 && u.alive) {
      ctx.strokeStyle = EYE_LINE;
      ctx.lineWidth = Math.max(1, R * 0.16);
      ctx.globalAlpha = A0 * Math.min(1, u.brow * 1.5);
      ctx.beginPath();
      for (let i = 0; i < 2; i++) {
        const { r } = eyes[i];
        const base = i === 0 ? R * 0.22 : R * 0.74;
        const upb = (i === 0 ? R * 0.14 : R * 0.04) + r + R * 0.12;
        const [ax, ay] = P(base - r * 0.8, upb + r * 0.25);
        const [bx, by] = P(base + r * 0.8, upb - r * 0.3);
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
      ctx.globalAlpha = A0;
    }
    // Mouth
    const open = u.alive ? clamp(u.mouth * 5, 0, 1) : 0.45;
    if (open > 0.05) {
      const [mx, my] = P(R * 0.58, -R * 0.55);
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.atan2(uy, ux) + Math.PI / 2);
      if (u.mouthKind === 'smile' && u.alive) {
        ctx.beginPath();
        ctx.arc(0, -R * 0.05, R * 0.26 * open, 0, Math.PI);
        ctx.closePath();
        ctx.fillStyle = '#3a0e12';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, R * 0.1 * open, R * 0.13 * open, 0, Math.PI);
        ctx.fillStyle = '#ff7f8c';
        ctx.fill();
      } else {
        const w = R * 0.17 * (0.6 + 0.4 * open);
        const h = R * 0.24 * open + R * 0.04;
        ctx.beginPath();
        ctx.ellipse(0, 0, w, h, 0, 0, TAU);
        ctx.fillStyle = '#3a0e12';
        ctx.fill();
        if (!u.alive && u.deadT > 0.45) {
          // Tongue lolling out
          ctx.beginPath();
          ctx.ellipse(0, h * 0.75, w * 0.75, h * 0.55, 0, 0, TAU);
          ctx.fillStyle = '#ff7f8c';
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  /** Short fading trail behind a swinging weapon tip. */
  trail(ctx, u, time) {
    let tr = this.trails.get(u.id);
    const swinging = u.act && (u.act.phase === 'strike' || (u.act.phase === 'recover' && u.act.t < 0.06));
    if (!swinging || !u.tip) {
      if (tr) tr.length = 0;
      return;
    }
    if (!tr) {
      tr = [];
      this.trails.set(u.id, tr);
    }
    const last = tr[tr.length - 1];
    if (!last || last.t !== time) tr.push({ x: u.tip.x, y: u.tip.y, t: time });
    if (tr.length > 7) tr.shift();
    if (tr.length < 2) return;
    ctx.lineCap = 'round';
    for (let i = 1; i < tr.length; i++) {
      const k = i / tr.length;
      ctx.strokeStyle = `rgba(255,255,255,${0.45 * k})`;
      ctx.lineWidth = (u.type.weapon === 'hammer' ? 14 : u.type.weapon === 'club' ? 9 : 4) * k;
      ctx.beginPath();
      ctx.moveTo(tr[i - 1].x, tr[i - 1].y);
      ctx.lineTo(tr[i].x, tr[i].y);
      ctx.stroke();
    }
  }
}

// --- parts ------------------------------------------------------------------

function drawLimb(ctx, a, b, c, col, w) {
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.stroke();
}

function drawHand(ctx, h, col, size = 1) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(h.x, h.y, 2.7 * Math.max(0.85, size), 0, TAU);
  ctx.fill();
}

function drawFoot(ctx, p, f, col, size = 1) {
  const k = Math.max(0.8, size);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(p.x + f * 2.2 * k, p.y + 0.5, 4 * k, 2.3 * k, 0, 0, TAU);
  ctx.fill();
}

const ZERO_FACE = { fw: 0, up: 0 };

/** Squash & stretch around the hips along the body axis (shared by every shape). */
function applySquash(ctx, u) {
  const sq = u.sq;
  if (Math.abs(sq) <= 0.004) return;
  const c = u.ux;
  const s = u.uy;
  const a = 1 - sq * 0.85; // along the spine
  const b = 1 + sq; // across
  const m11 = c * c * a + s * s * b;
  const m12 = c * s * (a - b);
  const m22 = s * s * a + c * c * b;
  ctx.translate(u.hip.x, u.hip.y);
  ctx.transform(m11, m12, m12, m22, 0, 0);
  ctx.translate(-u.hip.x, -u.hip.y);
}

/** Outline of a non-bean body, following the ragdoll's spine. */
function shapePath(ctx, u) {
  const R = u.R;
  const { hip, chest, head } = u;
  const ux = u.ux;
  const uy = u.uy;
  const nx = -uy;
  const ny = ux;
  ctx.beginPath();
  if (u.type.shape === 'ball') {
    ctx.arc(chest.x, chest.y, R * 1.06, 0, TAU);
    return;
  }
  if (u.type.shape === 'triangle') {
    // A rounded wedge: point at the top (it leads when the spiker pounces)
    const ax = head.x + ux * R * 1.05;
    const ay = head.y + uy * R * 1.05;
    const bx = hip.x - ux * R * 0.8;
    const by = hip.y - uy * R * 0.8;
    const w = R * 1.25;
    const rr = R * 0.32;
    ctx.moveTo(bx, by);
    ctx.arcTo(bx + nx * w, by + ny * w, ax, ay, rr);
    ctx.arcTo(ax, ay, bx - nx * w, by - ny * w, rr * 0.7);
    ctx.arcTo(bx - nx * w, by - ny * w, bx, by, rr);
    ctx.closePath();
    return;
  }
  // Brick: a tall block that bends a little with the spine
  const e = R * 0.95;
  const bx = hip.x - ux * e;
  const by = hip.y - uy * e;
  const tx = head.x + ux * e;
  const ty = head.y + uy * e;
  const P = [
    [bx - nx * R, by - ny * R],
    [bx + nx * R, by + ny * R],
    [chest.x + nx * R, chest.y + ny * R],
    [tx + nx * R, ty + ny * R],
    [tx - nx * R, ty - ny * R],
    [chest.x - nx * R, chest.y - ny * R],
  ];
  const rad = R * 0.36;
  ctx.moveTo((P[5][0] + P[0][0]) / 2, (P[5][1] + P[0][1]) / 2);
  ctx.arcTo(P[0][0], P[0][1], P[1][0], P[1][1], rad);
  ctx.arcTo(P[1][0], P[1][1], P[2][0], P[2][1], rad);
  ctx.arcTo(P[2][0], P[2][1], P[3][0], P[3][1], 1);
  ctx.arcTo(P[3][0], P[3][1], P[4][0], P[4][1], rad);
  ctx.arcTo(P[4][0], P[4][1], P[5][0], P[5][1], rad);
  ctx.arcTo(P[5][0], P[5][1], P[0][0], P[0][1], 1);
  ctx.closePath();
}

/** Brick: mortar lines so it reads as a brick (drawn inside the body clip). */
function drawMortar(ctx, u, T) {
  const R = u.R;
  const ux = u.ux;
  const uy = u.uy;
  const nx = -uy;
  const ny = ux;
  const bx = u.hip.x - ux * R;
  const by = u.hip.y - uy * R;
  const H = u.L + 2 * R;
  ctx.strokeStyle = T.shade;
  ctx.globalAlpha = A0 * 0.5;
  ctx.lineWidth = R * 0.08;
  ctx.beginPath();
  const rows = 4;
  for (let i = 1; i < rows; i++) {
    const t = (H * i) / rows;
    const cx = bx + ux * t;
    const cy = by + uy * t;
    ctx.moveTo(cx - nx * R * 1.2, cy - ny * R * 1.2);
    ctx.lineTo(cx + nx * R * 1.2, cy + ny * R * 1.2);
  }
  for (let i = 0; i < rows; i++) {
    const t0 = (H * i) / rows;
    const off = (i % 2 ? 0.35 : -0.35) * R;
    const x0 = bx + ux * t0 + nx * off;
    const y0 = by + uy * t0 + ny * off;
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + (ux * H) / rows, y0 + (uy * H) / rows);
  }
  ctx.stroke();
  ctx.globalAlpha = A0;
}

/** Bomb: a fuse on top; once lit it burns down with a fizzing spark. */
function drawFuse(ctx, u, time) {
  if (!u.alive && !(u.deathFuse > 0)) return;
  const R = u.R;
  const c = u.chest;
  const ux = u.ux;
  const uy = u.uy;
  const nx = -uy;
  const ny = ux;
  const lit = (u.act && u.act.phase === 'fuse') || u.deathFuse > 0;
  const len = R * 0.95 * (lit ? 1 - 0.75 * u.fuseT : 1);
  const sx = c.x + ux * R * 0.98;
  const sy = c.y + uy * R * 0.98;
  const wob = Math.sin(time * 5 + u.id) * 2;
  const ex = sx + ux * len - nx * (len * 0.35 + wob);
  const ey = sy + uy * len - ny * (len * 0.35 + wob);
  // Metal cap
  ctx.fillStyle = '#7d8590';
  ctx.beginPath();
  ctx.ellipse(sx, sy, R * 0.32, R * 0.16, Math.atan2(ny, nx), 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#4a3a24';
  ctx.lineWidth = Math.max(1.6, R * 0.16);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(sx + ux * len * 0.6 + nx * len * 0.25, sy + uy * len * 0.6 + ny * len * 0.25, ex, ey);
  ctx.stroke();
  if (!lit) return;
  // Fizzing spark
  const n = 7;
  const flick = ((time * 30) | 0) & 1;
  for (let k = 0; k < 2; k++) {
    ctx.fillStyle = k ? '#fff6c2' : flick ? '#ffb02e' : '#ff7a1a';
    const r0 = (k ? 2.2 : 4.6) * (1 + 0.25 * Math.sin(time * 47));
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i * Math.PI) / n + time * 9;
      const r = i % 2 ? r0 * 0.4 : r0;
      ctx.lineTo(ex + Math.cos(a) * r, ey + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
}

function drawLid(ctx, x, y, r, ux, uy, k, col) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r + 0.3, 0, TAU);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(uy, ux) + Math.PI / 2); // local -y = up
  ctx.fillStyle = col;
  const edge = -r + 2 * r * k;
  ctx.fillRect(-r - 1, -r - 1, 2 * r + 2, edge + r + 1);
  ctx.strokeStyle = EYE_LINE;
  ctx.lineWidth = Math.max(0.8, r * 0.18);
  ctx.beginPath();
  ctx.moveTo(-r, edge);
  ctx.lineTo(r, edge);
  ctx.stroke();
  ctx.restore();
}

/** Squire: a steel cap with a little plume (the googly eyes are glued on over the rim). */
function drawHelmet(ctx, u) {
  const R = u.R;
  const h = u.head;
  const a = Math.atan2(u.uy, u.ux);
  const span = 1.08;
  ctx.beginPath();
  ctx.arc(h.x, h.y, R + 0.6, a - span, a + span);
  ctx.closePath();
  ctx.fillStyle = '#aeb7c2';
  ctx.fill();
  ctx.strokeStyle = '#5f6b78';
  ctx.lineWidth = Math.max(1, R * 0.09);
  ctx.stroke();
  // Shine
  ctx.beginPath();
  ctx.arc(h.x, h.y, R * 0.72, a - span * 0.85, a - span * 0.25);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = R * 0.14;
  ctx.stroke();
  // Plume
  const tx = h.x + u.ux * (R + 0.5);
  const ty = h.y + u.uy * (R + 0.5);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.quadraticCurveTo(tx + u.ux * 7 - u.fwx * 3, ty + u.uy * 7 - u.fwy * 3, tx - u.fwx * 9 + u.ux * 3, ty - u.fwy * 9 + u.uy * 3);
  ctx.strokeStyle = '#f2c94c';
  ctx.lineWidth = R * 0.32;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Archer: a quiver peeking out behind the back. */
function drawQuiver(ctx, u, T) {
  const c = u.chest;
  const bx = c.x - u.fwx * u.R * 0.75;
  const by = c.y - u.fwy * u.R * 0.75;
  // Tilted back along the spine
  const ax = u.ux - u.fwx * 0.45;
  const ay = u.uy - u.fwy * 0.45;
  const l = Math.hypot(ax, ay) || 1;
  const dx = ax / l;
  const dy = ay / l;
  const x0 = bx - dx * 4;
  const y0 = by - dy * 4;
  const x1 = bx + dx * 17;
  const y1 = by + dy * 17;
  // Fletchings sticking out of the top
  for (let i = -1; i <= 1; i++) {
    const ox = -dy * i * 2.6;
    const oy = dx * i * 2.6;
    ctx.strokeStyle = '#c9a06a';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x1 + ox, y1 + oy);
    ctx.lineTo(x1 + ox + dx * 7, y1 + oy + dy * 7);
    ctx.stroke();
    ctx.fillStyle = i ? T.light : '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x1 + ox + dx * 7, y1 + oy + dy * 7, 1.6, 3, Math.atan2(dy, dx) + Math.PI / 2, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = '#5a3415';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = '#8f5a2c';
  ctx.lineWidth = 4.6;
  ctx.stroke();
}

function drawDizzy(ctx, u, time) {
  const n = 3;
  const cx = u.head.x + u.ux * (u.R + 9);
  const cy = u.head.y + u.uy * (u.R + 9);
  const a0 = time * 6;
  ctx.fillStyle = '#ffd84a';
  ctx.strokeStyle = '#a0701a';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * TAU) / n;
    const x = cx + Math.cos(a) * 12;
    const y = cy + Math.sin(a) * 4;
    star(ctx, x, y, 3.4, a * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function star(ctx, x, y, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

export function drawArrow(ctx, x, y, ang, team, alpha = 1, hide = 0) {
  // (x, y) is the tip. `hide` px of the front are buried (not drawn).
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const L = 30;
  const a0 = ctx.globalAlpha;
  if (alpha < 1) ctx.globalAlpha = a0 * alpha;
  const hx = x - c * hide;
  const hy = y - s * hide;
  const tx = x - c * L;
  const ty = y - s * L;
  ctx.strokeStyle = '#c9a06a';
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  if (!hide) {
    ctx.fillStyle = '#4b4f57';
    ctx.beginPath();
    ctx.moveTo(x + c * 2, y + s * 2);
    ctx.lineTo(x - c * 4 - s * 2.6, y - s * 4 + c * 2.6);
    ctx.lineTo(x - c * 4 + s * 2.6, y - s * 4 - c * 2.6);
    ctx.closePath();
    ctx.fill();
  }
  // Fletching in team colour
  ctx.fillStyle = TEAMS[team].body;
  for (const side of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(tx + c * 7, ty + s * 7);
    ctx.lineTo(tx - c * 1 - s * 3.6 * side, ty - s * 1 + c * 3.6 * side);
    ctx.lineTo(tx + c * 1, ty + s * 1);
    ctx.closePath();
    ctx.fill();
  }
  if (alpha < 1) ctx.globalAlpha = a0;
}

export function drawClub(ctx, hx, hy, tx, ty) {
  const dx = tx - hx;
  const dy = ty - hy;
  const L = Math.hypot(dx, dy) || 1;
  const ax = dx / L;
  const ay = dy / L;
  const nx = -ay;
  const ny = ax;
  const W = WEAPONS.club;
  const len = W.len;
  // Handle starts a bit behind the hand; head swells toward the tip
  const back = 7;
  const pts = [];
  const N = 7;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const d = -back + (len + back) * t;
    const w = 1.9 + Math.pow(t, 2.2) * 5.6;
    pts.push([hx + ax * d, hy + ay * d, w]);
  }
  ctx.beginPath();
  for (let i = 0; i <= N; i++) ctx.lineTo(pts[i][0] + nx * pts[i][2], pts[i][1] + ny * pts[i][2]);
  const tip = pts[N];
  ctx.arc(tip[0], tip[1], tip[2], Math.atan2(ny, nx), Math.atan2(ny, nx) + Math.PI, true);
  for (let i = N; i >= 0; i--) ctx.lineTo(pts[i][0] - nx * pts[i][2], pts[i][1] - ny * pts[i][2]);
  ctx.closePath();
  ctx.fillStyle = WOOD;
  ctx.fill();
  ctx.strokeStyle = WOOD_DARK;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // Highlight + a couple of knots
  ctx.strokeStyle = WOOD_LIGHT;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 2; i <= N; i++) {
    const p = pts[i];
    const o = p[2] * 0.45;
    if (i === 2) ctx.moveTo(p[0] + nx * o, p[1] + ny * o);
    else ctx.lineTo(p[0] + nx * o, p[1] + ny * o);
  }
  ctx.stroke();
  ctx.fillStyle = WOOD_DARK;
  const k1 = pts[5];
  ctx.beginPath();
  ctx.ellipse(k1[0] - nx * 1.5, k1[1] - ny * 1.5, 1.4, 0.9, Math.atan2(ay, ax), 0, TAU);
  ctx.fill();
  const k2 = pts[N - 1];
  ctx.beginPath();
  ctx.ellipse(k2[0] - nx * 2.5 + ax * 2, k2[1] - ny * 2.5 + ay * 2, 1.2, 0.8, Math.atan2(ay, ax), 0, TAU);
  ctx.fill();
}

/** Brick's hammer: a long handle and a big iron head across the tip. */
export function drawHammer(ctx, hx, hy, tx, ty) {
  const dx = tx - hx;
  const dy = ty - hy;
  const L = Math.hypot(dx, dy) || 1;
  const ax = dx / L;
  const ay = dy / L;
  const nx = -ay;
  const ny = ax;
  ctx.lineCap = 'round';
  ctx.strokeStyle = WOOD_DARK;
  ctx.lineWidth = 5.4;
  ctx.beginPath();
  ctx.moveTo(hx - ax * 9, hy - ay * 9);
  ctx.lineTo(tx - ax * 6, ty - ay * 6);
  ctx.stroke();
  ctx.strokeStyle = WOOD;
  ctx.lineWidth = 3.4;
  ctx.stroke();
  // Head
  const hl = 15; // half length across the handle
  const hw = 9; // half width along it
  const P = (u, v) => [tx + nx * u + ax * v, ty + ny * u + ay * v];
  const c = [P(-hl, -hw), P(hl, -hw), P(hl, hw), P(-hl, hw)];
  ctx.beginPath();
  ctx.moveTo(c[0][0], c[0][1]);
  for (let i = 1; i < 4; i++) ctx.lineTo(c[i][0], c[i][1]);
  ctx.closePath();
  ctx.fillStyle = '#8b939e';
  ctx.fill();
  ctx.strokeStyle = '#4f5763';
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.stroke();
  // Bands and a shine
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (const u of [-hl * 0.62, hl * 0.62]) {
    const [x0, y0] = P(u, -hw);
    const [x1, y1] = P(u, hw);
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
  const [s0x, s0y] = P(-hl * 0.85, -hw * 0.5);
  const [s1x, s1y] = P(hl * 0.85, -hw * 0.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(s0x, s0y);
  ctx.lineTo(s1x, s1y);
  ctx.stroke();
}

export function drawSword(ctx, hx, hy, tx, ty) {
  const dx = tx - hx;
  const dy = ty - hy;
  const L = Math.hypot(dx, dy) || 1;
  const ax = dx / L;
  const ay = dy / L;
  const nx = -ay;
  const ny = ax;
  const len = WEAPONS.sword.len;
  // Grip + pommel
  ctx.strokeStyle = '#5b3a1e';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hx - ax * 5, hy - ay * 5);
  ctx.lineTo(hx + ax * 2, hy + ay * 2);
  ctx.stroke();
  ctx.fillStyle = '#c9a24a';
  ctx.beginPath();
  ctx.arc(hx - ax * 6, hy - ay * 6, 1.8, 0, TAU);
  ctx.fill();
  // Blade
  const b0 = 3.5;
  ctx.beginPath();
  ctx.moveTo(hx + ax * b0 + nx * 2.1, hy + ay * b0 + ny * 2.1);
  ctx.lineTo(hx + ax * (len - 4) + nx * 1.9, hy + ay * (len - 4) + ny * 1.9);
  ctx.lineTo(hx + ax * len, hy + ay * len);
  ctx.lineTo(hx + ax * (len - 4) - nx * 1.9, hy + ay * (len - 4) - ny * 1.9);
  ctx.lineTo(hx + ax * b0 - nx * 2.1, hy + ay * b0 - ny * 2.1);
  ctx.closePath();
  ctx.fillStyle = STEEL;
  ctx.fill();
  ctx.strokeStyle = STEEL_DARK;
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(hx + ax * (b0 + 1) + nx * 0.8, hy + ay * (b0 + 1) + ny * 0.8);
  ctx.lineTo(hx + ax * (len - 5) + nx * 0.6, hy + ay * (len - 5) + ny * 0.6);
  ctx.stroke();
  // Crossguard
  ctx.strokeStyle = '#c9a24a';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(hx + ax * 3 + nx * 5, hy + ay * 3 + ny * 5);
  ctx.lineTo(hx + ax * 3 - nx * 5, hy + ay * 3 - ny * 5);
  ctx.stroke();
}

export function drawShield(ctx, sh, f) {
  // A round wooden shield seen at three-quarters: an ellipse along its axis
  const ang = Math.atan2(sh.ay, sh.ax);
  ctx.save();
  ctx.translate(sh.x, sh.y);
  ctx.rotate(ang);
  const ry = 16; // along the axis
  const rx = 8.5; // foreshortened
  // rim thickness (edge seen from the side) toward the body
  ctx.fillStyle = '#6b4520';
  ctx.beginPath();
  ctx.ellipse(0, -f * 1.6 * 0, ry, rx, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, ry - 0.5, rx - 0.5, 0, 0, TAU);
  ctx.fillStyle = '#a56b35';
  ctx.fill();
  // Planks
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(70,40,15,0.55)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (let i = -2; i <= 2; i++) {
    ctx.moveTo(-ry, i * 3.6);
    ctx.lineTo(ry, i * 3.6);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,220,170,0.18)';
  ctx.fillRect(-ry, -rx, ry * 2, rx * 0.7);
  ctx.restore();
  // Steel rim + boss
  ctx.strokeStyle = '#9aa4b0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, ry - 1, rx - 1, 0, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#cfd6de';
  ctx.beginPath();
  ctx.ellipse(0, 0, 3.6, 2.6, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#6f7a86';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.restore();
}

/**
 * Bow held at (gx, gy). (ax, ay) = aim direction, (px, py) = along the limbs.
 * draw 0..1 bends the limbs; stringHand pulls the string; nockTeam draws an arrow.
 */
export function drawBow(ctx, gx, gy, ax, ay, px, py, draw, stringHand, nockTeam, team) {
  const half = WEAPONS.bow.half;
  const back = 5 + draw * 4;
  const t1x = gx + px * half - ax * back;
  const t1y = gy + py * half - ay * back;
  const t2x = gx - px * half - ax * back;
  const t2y = gy - py * half - ay * back;
  // String
  let sx = (t1x + t2x) / 2;
  let sy = (t1y + t2y) / 2;
  if (stringHand) {
    sx = stringHand.x;
    sy = stringHand.y;
  }
  ctx.strokeStyle = 'rgba(245,240,225,0.95)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(t1x, t1y);
  ctx.lineTo(sx, sy);
  ctx.lineTo(t2x, t2y);
  ctx.stroke();
  if (nockTeam) {
    const L = 30;
    drawArrow(ctx, sx + ax * L, sy + ay * L, Math.atan2(ay, ax), nockTeam, 1, 0);
  }
  // Limbs (one curve through the grip)
  const cx = 2 * gx - (t1x + t2x) / 2;
  const cy = 2 * gy - (t1y + t2y) / 2;
  ctx.strokeStyle = WOOD_DARK;
  ctx.lineWidth = 3.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(t1x, t1y);
  ctx.quadraticCurveTo(cx, cy, t2x, t2y);
  ctx.stroke();
  ctx.strokeStyle = WOOD_LIGHT;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // Leather grip
  ctx.strokeStyle = '#5a2f17';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(gx + px * 2.5, gy + py * 2.5);
  ctx.lineTo(gx - px * 2.5, gy - py * 2.5);
  ctx.stroke();
}

export { OUTLINE };

export { hatAnchor };
