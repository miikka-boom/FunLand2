// Draws the beans, their weapons, arrows and dropped gear. ctx is already in
// world space (camera applied). Everything reads straight from the sim.
//
// The newer ten (docs/WOBBLE-WAR-CARDS.md section 4) add two body shapes,
// 'bird' (the Pelican) and 'jelly' (the Big Jelly), and props drawn from the
// unit's own state: the Sprout's leaves and toothpick, the Propeller Pal's cap,
// the Pogo stick, the Netter's glasses and net, the Juggler's ruff and its
// loop of bombs, the Nutcracker's shako and jaw, the Brolly's umbrella (open,
// closed, inside out), the Drummer's drum and mallets. Statuses show on any
// unit: the Bubble Wrap sheet, the Anvil pancake, a fresh net tangle, and a
// held bean is drawn by its holder (inside the jelly, under the beak).

import { TEAMS } from '../config.js';
import { WEAPONS, UNIT_TYPES } from '../sim/unit-types.js';
import { itemShieldFrame } from '../sim/battle.js';
import { isFlier } from '../sim/unit.js';
import { drawHat, hatAnchor } from './hats.js';
import { drawPeelItem, drawWrapBubbles, wrapFrame, drawJBomb } from './spells.js';
import { drawCraneBall } from './buildings.js';

const HAT_AT = {}; // reused: no allocation per hat
const PT = [0, 0]; // reused point for the helpers below (read it at once: the next call overwrites it)
const FACE_EYES = [{ p: [0, 0], r: 0 }, { p: [0, 0], r: 0 }]; // reused by drawFace for every unit
const FACE = { x: 0, y: 0, fx: 0, fy: 0, ux: 0, uy: 0 }; // the head frame drawFace is working in
/** A point `fw` forward and `up` up in the current face frame, into out. */
function facePt(out, fw, up) {
  out[0] = FACE.x + FACE.fx * fw + FACE.ux * up;
  out[1] = FACE.y + FACE.fy * fw + FACE.uy * up;
  return out;
}
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

// The newer ten's colours (contract section 4 art notes)
const LEAF = { base: '#5fbf3a', dark: '#2f7a1e', light: '#9be06a', wilt: '#b8a83a' };
const PICK = { wood: '#d9b26a', dark: '#8a6a2e', olive: '#6f9a2a', pimento: '#e0352b' };
const CAP = { red: '#e94b3c', yellow: '#ffd23f', dark: '#9a2a22', hub: '#2c2f3a' };
const POGO = { steel: '#c9d1d9', dark: '#5a626c', light: '#f4f7fa', bar: '#e0352b', black: '#26262b' };
const NET = { pole: '#8f5a2c', poleDark: '#5a3415', mesh: '#ffffff' };
const SHAKO = { black: '#1e1e28', rim: '#3a3a4c', gold: '#e8c04a', goldDark: '#a07a1a', plume: '#d8322c' };
const JAW = { white: '#f2efe6', shade: '#c9c2b0', mouth: '#3a0e12' };
const DRUM = { head: '#f4ead8', rim: '#e8c04a', rimDark: '#a07a1a', cord: '#ffffff' };
const BEAK = { base: '#f2a93b', pouch: '#ffc46e', dark: '#b8661a', leg: '#e8923a' };
const BOMB_LOOP = 0.9; // seconds per lap of the Juggler's figure-eight (contract: period 0.9 s)
const NET_TANGLE = 0.3; // a freshly netted flier shows the mesh over it this long
const NET_IMMUNE = (UNIT_TYPES.netter && UNIT_TYPES.netter.attack.air.immune) || 3;
const BROLLY_R = 34; // open canopy radius: about 30 px wide on a phone at zoom 0.43
const FLOAT_IN = 0.35; // seconds a Brolly takes to fade in after it is played

export class UnitRenderer {
  /** opts: { showHp: small HP bars over hurt units (arena; the sandbox leaves them off) } */
  constructor(opts = {}) {
    this.trails = new Map(); // unit id -> recent weapon tip positions
    this.palettes = {}; // team -> palette override (your army colour)
    this.showHp = !!(opts && opts.showHp);
    // Device px from the top of the canvas covered by the match HUD's top row
    // (0: nothing). A Brolly floating in from the top fades in below it.
    this.skyTop = 0;
    this.floatSeen = new WeakMap(); // unit -> battle time it was first drawn floating
  }

  pal(team) {
    return this.palettes[team] || TEAMS[team];
  }

  /** Ground shadows for every unit and item (drawn before anything stands on the grass). */
  drawShadows(ctx, battle) {
    ctx.fillStyle = 'rgba(28, 52, 12, 0.28)';
    ctx.beginPath();
    let fliers = 0;
    for (const u of battle.units) {
      if (u.gone) continue;
      if (isFlier(u)) {
        fliers++;
        continue;
      }
      const h = clamp((u.ground - u.hip.y - u.standH) / 160, 0, 1);
      const rx = u.R * (u.alive ? 1.25 : 1.6) * (1 - h * 0.5);
      const cx = (u.hip.x + u.head.x * (u.alive ? 0 : 1)) / (u.alive ? 1 : 2);
      ctx.moveTo(cx + rx, u.ground + 1.5);
      ctx.ellipse(cx, u.ground + 1.5, rx, 3.6 * (1 - h * 0.6), 0, 0, TAU);
    }
    ctx.fill();
    if (fliers) this.drawFlierShadows(ctx, battle);
  }

  /**
   * Fliers (and Brollies floating down) cast a soft shadow that shrinks and
   * fades with height but never vanishes: on a phone it is how you read how
   * high something is, and where it will come down.
   */
  drawFlierShadows(ctx, battle) {
    const base = ctx.globalAlpha;
    ctx.fillStyle = 'rgb(22, 40, 8)';
    for (const u of battle.units) {
      if (u.gone || !isFlier(u)) continue;
      const k = clamp((u.ground - u.standH - u.hip.y) / 420, 0, 1);
      const wide = u.type.shape === 'bird' ? 2.3 : u.floatT > 0 ? 1.7 : 1.45;
      const rx = u.R * wide * (1 - 0.45 * k);
      const cx = u.alive ? (u.hip.x + u.chest.x) / 2 : (u.hip.x + u.head.x) / 2;
      ctx.globalAlpha = base * (u.alive ? 0.36 : 0.28) * (1 - 0.4 * k);
      ctx.beginPath();
      ctx.ellipse(cx, u.ground + 1.5, rx, 4.4 * (1 - 0.4 * k), 0, 0, TAU);
      ctx.fill();
      // A darker core so the spot reads at phone zoom (the grass has soft patches of its own)
      ctx.globalAlpha = base * 0.32 * (1 - 0.4 * k);
      ctx.beginPath();
      ctx.ellipse(cx, u.ground + 1.5, rx * 0.55, 2.4 * (1 - 0.4 * k), 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = base;
  }

  /**
   * A team-coloured ground ring under each living bean: at phone zoom a crowd
   * still reads as two sides (one fill per team, so it costs two paths a frame).
   */
  drawTeamRings(ctx, battle, alpha = 0.5) {
    for (const team of ['blue', 'red']) {
      ctx.fillStyle = this.pal(team).body;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      for (const u of battle.units) {
        if (!u.alive || u.gone || u.team !== team || u.dropping) continue;
        if ((isFlier(u) && u.alt > 40) || u.held) continue; // up there its shadow marks the spot
        const rx = u.R * 1.4;
        ctx.moveTo(u.hip.x + rx, u.ground + 2);
        ctx.ellipse(u.hip.x, u.ground + 2, rx, 4.5, 0, 0, TAU);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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
      else if (it.kind === 'sword') {
        if ((it.scale || 1) < 0.8) drawToothpick(ctx, it.a.x, it.a.y, it.b.x, it.b.y);
        else drawSword(ctx, it.a.x, it.a.y, it.b.x, it.b.y);
      } else if (it.kind === 'peel') drawPeelItem(ctx, it);
      else if (it.kind === 'propCap') {
        // Spins up and away, then flutters down like a maple seed: the blades slow as it settles
        const dx = it.b.x - it.a.x;
        const dy = it.b.y - it.a.y;
        const spin = clamp(1.6 - (it.age || 0) * 0.3, 0.15, 1.6);
        drawCopterCap(ctx, (it.a.x + it.b.x) / 2, (it.a.y + it.b.y) / 2, Math.atan2(-dx, dy), it.R || 10.5, it.f || 1, (it.age || 0) * 9 * spin, spin * 0.6);
      } else if (it.kind === 'pogo') drawPogoStick(ctx, it.a.x, it.a.y, it.b.x, it.b.y, -1);
      else if (it.kind === 'net') drawNet(ctx, it.a.x, it.a.y, it.b.x, it.b.y, it.age || 0);
      else if (it.kind === 'brolly') drawBrolly(ctx, it.a.x, it.a.y, it.b.x, it.b.y, this.pal(it.team), 'closed', 0);
      else if (it.kind === 'drum') drawDrumItem(ctx, it, this.pal(it.team));
      else if (it.kind === 'craneBall') {
        const a = it.a || it;
        const b = it.b || a;
        const x = (a.x + b.x) / 2;
        const y = (a.y + b.y) / 2;
        if (Number.isFinite(x) && Number.isFinite(y)) drawCraneBall(ctx, x, y, it.r || 20, b === a ? it.rot || 0 : Math.atan2(b.y - a.y, b.x - a.x));
      } else if (it.kind === 'bow') {
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
    let cam = null; // (the camera, read once a frame and only if a Brolly is floating in)
    // Corpses first, then the living, each back-to-front by lane
    for (let pass = 0; pass < 2; pass++) {
      for (const u of battle.units) {
        if ((pass === 0) === u.alive || u.gone) continue;
        if (heldInDrawing(u)) continue; // its holder draws it (inside the jelly, under the beak)
        // Arena corpses fade out (u.fade 1 -> 0) before they are removed
        let fade = u.fade == null ? 1 : u.fade;
        if (u.floatT > 0 && u.alive) fade *= this.floatInAlpha(ctx, u, time, cam || (cam = ctx.getTransform()));
        if (fade < 1) this.drawUnitAlpha(ctx, u, battle, time, fade);
        else this.drawUnit(ctx, u, battle, time);
      }
    }
  }

  /**
   * A Brolly that was just played drifts in from the top of the sky: it fades
   * in over its first moments, and stays faint until its umbrella is clear of
   * the HUD's top row (skyTop), so it never shows under the clock.
   */
  floatInAlpha(ctx, u, time, m = null) {
    let t0 = this.floatSeen.get(u);
    if (t0 == null || time < t0) this.floatSeen.set(u, (t0 = time));
    let a = clamp((time - t0) / FLOAT_IN, 0, 1);
    if (this.skyTop > 0) {
      if (!m) m = ctx.getTransform();
      const y = m.d * (u.head.y - u.R * 1.6) + m.f; // the umbrella, device px
      a = Math.min(a, clamp((y - this.skyTop) / (this.skyTop * 0.6), 0, 1));
    }
    return a;
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
    // Device-pixel box (the camera never rotates, but map all four corners anyway; no arrays per frame)
    let dx0 = Infinity;
    let dy0 = Infinity;
    let dx1 = -Infinity;
    let dy1 = -Infinity;
    for (let i = 0; i < 4; i++) {
      const wx = i & 1 ? x1 + pad : x0 - pad;
      const wy = i & 2 ? y1 + pad : y0 - pad;
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
      const top = Math.min(u.head.y, u.chest.y) - u.R * (u.hat ? 2.1 : PROP_TOP[u.type.id] || 1) - 8 * k;
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
    // Anvil: drawn as a pancake that peels itself back up (squashT 1 -> 0)
    const flat = u.squashT > 0 && pancake(ctx, u);
    const shape = u.type.shape;
    if (shape === 'bird') this.drawBird(ctx, u, battle, time, T);
    else if (shape === 'jelly') this.drawJelly(ctx, u, battle, time, T);
    else this.drawBody(ctx, u, battle, time, T);
    if (u.wrapHp > 0 && u.wrapMax > 0 && u.alive) {
      const w = wrapFrame(u); // the same frame and seed as the spell's puff, so the hand-over is seamless
      drawWrapBubbles(ctx, w.x, w.y, w.rx, w.ry, u.wrapHp / u.wrapMax, w.rot, (u.id * 7) | 0);
    }
    if (u.netImmuneT > NET_IMMUNE - NET_TANGLE) drawTangle(ctx, u);
    if (flat) ctx.restore();
  }

  /** Beans and the other filled shapes: legs, arms, weapon and props around the body. */
  drawBody(ctx, u, battle, time, T) {
    const f = u.f;
    const R = u.R;
    const hip = u.hip;
    const chest = u.chest;
    const mi = u.mainHand;
    const oi = 1 - mi;
    const limbW = Math.max(2.4, R * 0.3);
    const farCol = T.shade;
    const nearCol = T.limb;
    const size = R / 13; // hands and feet grow with the body
    const id = u.type.id;
    const weapon = u.type.weapon;
    const twoHanded = (weapon === 'club' || weapon === 'hammer' || weapon === 'net') && u.tip;
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
      if (id === 'drummer') drawMallet(ctx, u, 0);
      drawHand(ctx, u.hand[0], farCol, size);
    }
    if (weapon === 'sword' && u.tip) {
      this.trail(ctx, u, time);
      // (the Sprout's toothpick is a sword at half size)
      if (u.W.len < 20) drawToothpick(ctx, u.hand[mi].x, u.hand[mi].y, u.tip.x, u.tip.y);
      else drawSword(ctx, u.hand[mi].x, u.hand[mi].y, u.tip.x, u.tip.y);
    }

    if (weapon === 'bow') drawQuiver(ctx, u, T);

    // Arrows stuck in the body (drawn behind it so the buried part is hidden)
    for (const a of u.arrows) {
      const pz = battle.arrowPose(a);
      drawArrow(ctx, pz.x, pz.y, pz.ang, a.team, 1, 7);
    }

    // --- body -------------------------------------------------------------------
    if (u.type.shape === 'bean' || !u.type.shape) this.drawBean(ctx, u, T);
    else this.drawShape(ctx, u, T, time);
    if (id === 'juggler') {
      drawHarlequin(ctx, u, T);
      drawRuff(ctx, u);
    } else if (id === 'nutcracker') drawCoat(ctx, u);
    if (u.type.shield && !u.hat) drawHelmet(ctx, u);
    if (u.type.blast) drawFuse(ctx, u, time);
    this.drawFace(ctx, u, T, time);
    // Props that are the unit's own hat (noHat types)
    if (id === 'sprout') drawLeaves(ctx, u, battle);
    else if (id === 'copter' && u.alive) {
      const a = hatAnchor(u, HAT_AT); // (a dead one's cap has popped off: it is an item now)
      drawCopterCap(ctx, a.x, a.y, a.ang, R, f, u.time * 42, 1);
    } else if (id === 'nutcracker') drawShako(ctx, u);
    if (u.hat && !u.type.noHat) {
      const a = hatAnchor(u, HAT_AT); // seat per body shape, follows squash & stretch
      drawHat(ctx, u.hat, a.x, a.y, a.ang, u.R, T, time, u.f);
    }
    if (id === 'drummer') drawDrum(ctx, u, T);

    // --- near side: arm + held item ---------------------------------------------
    if (twoHanded) {
      this.trail(ctx, u, time);
      if (weapon === 'hammer') drawHammer(ctx, u.hand[mi].x, u.hand[mi].y, u.tip.x, u.tip.y);
      else if (weapon === 'net') drawNet(ctx, u.hand[mi].x, u.hand[mi].y, u.tip.x, u.tip.y, u.time);
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
    } else if (weapon === 'bow') {
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
    } else if (weapon === 'pogo' && u.tip) {
      if (u.alive) boingLines(ctx, u, battle);
      drawPogoStick(ctx, u.hand[mi].x, u.hand[mi].y, u.tip.x, u.tip.y, pegsAt(u));
      drawLimb(ctx, chest, u.elbow[mi], u.hand[mi], nearCol, limbW);
      drawHand(ctx, u.hand[mi], nearCol, size);
      drawHand(ctx, u.hand[oi], farCol, size); // both hands on the handlebar
    } else if (weapon === 'brolly' && u.tip) {
      drawBrolly(ctx, u.hand[mi].x, u.hand[mi].y, u.tip.x, u.tip.y, T, brollyState(u), u.time);
      drawLimb(ctx, chest, u.elbow[mi], u.hand[mi], nearCol, limbW);
      drawHand(ctx, u.hand[mi], nearCol, size);
    } else {
      drawLimb(ctx, chest, u.elbow[1], u.hand[1], nearCol, limbW);
      if (id === 'drummer') drawMallet(ctx, u, 1);
      drawHand(ctx, u.hand[1], nearCol, size);
    }
    if (id === 'juggler') drawJuggle(ctx, u);

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
    // 1) shade (full width)
    beanPath(ctx, hip, qx, qy, head);
    ctx.strokeStyle = hurt ? '#ffffff' : T.shade;
    ctx.lineWidth = R * 2;
    ctx.stroke();
    if (!hurt) {
      // 2) body colour, shifted toward the light
      ctx.translate(nx * R * 0.17, ny * R * 0.17);
      beanPath(ctx, hip, qx, qy, head);
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

  /**
   * The Pelican ('bird'): a plump teardrop body along hip -> head in team
   * colour with a white belly, a small head with a huge orange beak pouch,
   * the arms drawn as white-tipped wings that flap, and thin orange legs
   * tucked under it. A bean it holds dangles from the pouch.
   */
  drawBird(ctx, u, battle, time, T) {
    const R = u.R;
    const { hip, chest, head } = u;
    const ux = u.ux;
    const uy = u.uy;
    const fx = u.fwx;
    const fy = u.fwy;
    const hurt = u.hurtT > 0.05 && u.alive;
    const tint = u.hurtT > 0 && !hurt && u.alive;
    const body = hurt ? '#ffffff' : tint ? T.light : T.body;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const flap = birdFlap(u);
    // Legs: thin and orange, webbed feet
    for (let i = 0; i < 2; i++) {
      drawLimb(ctx, hip, u.knee[i], u.foot[i], i ? BEAK.leg : BEAK.dark, Math.max(1.8, R * 0.13));
      webFoot(ctx, u.foot[i], u.f, R);
    }
    birdWing(ctx, u, 0, T.shade, flap);
    birdTail(ctx, u, T, body);
    // Body: the bean's two-tone capsule from the tail end to the chest
    let nx = -uy;
    let ny = ux;
    if (nx * LIGHT_X + ny * LIGHT_Y < 0) {
      nx = -nx;
      ny = -ny;
    }
    const bx = hip.x - ux * R * 0.3;
    const by = hip.y - uy * R * 0.3;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(chest.x, chest.y);
    ctx.strokeStyle = hurt ? '#ffffff' : T.shade;
    ctx.lineWidth = R * 2;
    ctx.stroke();
    if (!hurt) {
      ctx.beginPath();
      ctx.moveTo(bx + nx * R * 0.17, by + ny * R * 0.17);
      ctx.lineTo(chest.x + nx * R * 0.17, chest.y + ny * R * 0.17);
      ctx.strokeStyle = body;
      ctx.lineWidth = R * 1.66;
      ctx.stroke();
      // White belly on the underside
      const mx = (bx + chest.x) / 2 + fx * R * 0.42;
      const my = (by + chest.y) / 2 + fy * R * 0.42;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(mx, my, Math.hypot(chest.x - bx, chest.y - by) / 2 + R * 0.45, R * 0.48, Math.atan2(uy, ux), 0, TAU);
      ctx.fill();
      // A highlight along the back
      ctx.strokeStyle = T.light;
      ctx.globalAlpha = A0 * 0.7;
      ctx.lineWidth = R * 0.4;
      ctx.beginPath();
      ctx.moveTo(bx - fx * R * 0.55 + ux * R * 0.2, by - fy * R * 0.55 + uy * R * 0.2);
      ctx.lineTo(chest.x - fx * R * 0.55, chest.y - fy * R * 0.55);
      ctx.stroke();
      ctx.globalAlpha = A0;
    }
    // A bean in its beak hangs by the chest from the pouch: over the body, under the head and bill
    const v = u.holding;
    const held = v && v.heldBy === u && !v.gone ? v : null;
    if (held) {
      const a0 = A0;
      this.drawUnit(ctx, held, battle, time);
      A0 = a0;
    }
    // Neck and a small round head
    const hx = head.x - fx * R * 0.18;
    const hy = head.y - fy * R * 0.18;
    ctx.strokeStyle = hurt ? '#ffffff' : T.shade;
    ctx.lineWidth = R * 1.25;
    ctx.beginPath();
    ctx.moveTo(chest.x, chest.y);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.strokeStyle = body;
    ctx.lineWidth = R * 0.98;
    ctx.stroke();
    ctx.fillStyle = hurt ? '#ffffff' : T.shade;
    ctx.beginPath();
    ctx.arc(hx, hy, R * 0.76, 0, TAU);
    ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(hx + nx * R * 0.1, hy + ny * R * 0.1, R * 0.62, 0, TAU);
    ctx.fill();
    drawBeak(ctx, u, hx, hy, R, held);
    birdEyes(ctx, u, hx, hy, R, T);
    birdWing(ctx, u, 1, body, flap);
    if (u.hat && !u.type.noHat) {
      const a = hatAnchor(u, HAT_AT);
      drawHat(ctx, u.hat, a.x, a.y, a.ang, u.R, T, time, u.f);
    }
    if (u.dizzy > 0 && u.alive) drawDizzy(ctx, u, time);
  }

  /**
   * The Big Jelly ('jelly'): a big translucent dome in team colour with mould
   * ridges, fruit set inside and googly eyes on the front; stubby feet peek
   * out under it. It jiggles with the body's squash and after every hit. A
   * swallowed bean (and any arrow stuck in it) sits between the back wall and
   * the front of the jelly.
   */
  drawJelly(ctx, u, battle, time, T) {
    const R = u.R;
    const hurt = u.hurtT > 0.05 && u.alive;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < 2; i++) {
      drawLimb(ctx, u.hip, u.knee[i], u.foot[i], i ? T.limb : T.shade, R * 0.34);
      drawFoot(ctx, u.foot[i], u.f, T.dark, R / 15);
    }
    const n = jellyOutline(u);
    // Back wall: the far inside of the mould
    ctx.save();
    applySquash(ctx, u);
    jellyPath(ctx, n);
    ctx.globalAlpha = A0 * 0.62;
    ctx.fillStyle = T.shade;
    ctx.fill();
    ctx.globalAlpha = A0;
    drawFruit(ctx, u);
    for (const a of u.arrows) {
      const pz = battle.arrowPose(a);
      drawArrow(ctx, pz.x, pz.y, pz.ang, a.team, 1, 0); // set inside it, like fruit in a mould
    }
    ctx.restore();
    // A swallowed bean, swimming in slow motion
    const v = u.holding;
    if (v && v.heldBy === u && !v.gone) {
      const a0 = A0;
      this.drawUnit(ctx, v, battle, time);
      A0 = a0;
    }
    // Front: translucent jelly, ridges, the rim and a highlight streak
    ctx.save();
    applySquash(ctx, u);
    jellyPath(ctx, n);
    ctx.globalAlpha = A0 * (hurt ? 0.8 : 0.55);
    ctx.fillStyle = hurt ? '#ffffff' : T.body;
    ctx.fill();
    ctx.globalAlpha = A0 * 0.9;
    ctx.strokeStyle = T.dark;
    ctx.lineWidth = Math.max(1.6, R * 0.08);
    ctx.stroke();
    jellyRidges(ctx, u, T);
    ctx.restore();
    ctx.globalAlpha = A0;
    this.drawFace(ctx, u, T, time, JELLY_FACE);
    if (u.hat && !u.type.noHat) {
      const a = hatAnchor(u, HAT_AT); // (seat 0.9R: on top of the dome)
      drawHat(ctx, u.hat, a.x, a.y, a.ang, u.R, T, time, u.f);
    }
    if (u.dizzy > 0 && u.alive) drawDizzy(ctx, u, time);
  }

  drawFace(ctx, u, T, time, face = u.type.face || ZERO_FACE) {
    const R = u.R;
    const head = u.head;
    const ux = u.ux;
    const uy = u.uy;
    const fx = u.fwx;
    const fy = u.fwy;
    // Body-frame point near the head -> world; shapes put the face lower or further forward
    const ofw = face.fw * R;
    const oup = face.up * R;
    // (points in the head's frame go into reused pairs: no closure or array per unit per frame)
    FACE.x = head.x + fx * ofw + ux * oup;
    FACE.y = head.y + fy * ofw + uy * oup;
    FACE.fx = fx;
    FACE.fy = fy;
    FACE.ux = ux;
    FACE.uy = uy;
    const P = facePt;
    const er = R * 0.42;
    const eyes = FACE_EYES;
    P(eyes[0].p, R * 0.22, R * 0.14);
    eyes[0].r = er * 0.9;
    P(eyes[1].p, R * 0.74, R * 0.04);
    eyes[1].r = er;
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
    if (u.type.id === 'netter') drawGlasses(ctx, eyes, R, fx, fy);
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
        P(PT, base - r * 0.8, upb + r * 0.25);
        ctx.moveTo(PT[0], PT[1]);
        P(PT, base + r * 0.8, upb - r * 0.3);
        ctx.lineTo(PT[0], PT[1]);
      }
      ctx.stroke();
      ctx.globalAlpha = A0;
    }
    // Mouth (the Nutcracker's is its big hinged jaw)
    if (u.type.id === 'nutcracker') {
      drawJaw(ctx, u, jawOpen(u));
      return;
    }
    const open = u.alive ? clamp(u.mouth * 5, 0, 1) : 0.45;
    if (open > 0.05) {
      P(PT, R * 0.58, -R * 0.55);
      ctx.save();
      ctx.translate(PT[0], PT[1]);
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

/**
 * A box around everything drawn for unit u (body, weapon, hat and props:
 * caps, shako, the juggling loop, an open umbrella, wings and beak), in
 * world px: out = { x0, y0, x1, y1 }. For fitting a unit into a picture.
 */
export function unitExtent(u, out = {}) {
  const R = u.R;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of u.parts) {
    if (p.x - R < x0) x0 = p.x - R;
    if (p.x + R > x1) x1 = p.x + R;
    if (p.y - R < y0) y0 = p.y - R;
    if (p.y + R > y1) y1 = p.y + R;
  }
  const top = u.head.y - R * (u.hat ? 2.4 : 1 + (PROP_TOP[u.type.id] || 0));
  if (top < y0) y0 = top;
  const id = u.type.id;
  if (u.type.shape === 'bird') {
    // Wings and the beak reach well past the body
    x0 -= R * 1.6;
    x1 += R * 1.6;
    y0 -= R * 1.4;
    y1 += R * 0.8;
  } else if (u.tip && id === 'brolly' && (u.floatT > 0 || u.flipped)) {
    x0 = Math.min(x0, u.tip.x - BROLLY_R);
    x1 = Math.max(x1, u.tip.x + BROLLY_R);
    y0 = Math.min(y0, u.tip.y - BROLLY_R * 0.7);
  } else if (u.tip && id === 'netter') {
    x0 = Math.min(x0, u.tip.x - 15);
    x1 = Math.max(x1, u.tip.x + 15);
    y0 = Math.min(y0, u.tip.y - 15);
  } else if (id === 'drummer') {
    const d = drumAt(u);
    x0 = Math.min(x0, d.x - d.r);
    x1 = Math.max(x1, d.x + d.r);
  }
  out.x0 = x0;
  out.y0 = y0;
  out.x1 = x1;
  out.y1 = y1;
  return out;
}

// --- the newer ten: shared bits ------------------------------------------------

/** How far above the head the HP bar sits (R) for units whose props stick up. */
const PROP_TOP = { sprout: 1.7, copter: 2, nutcracker: 2.6, juggler: 2.8 };
/** The Big Jelly's googly eyes sit a little lower on its dome. */
const JELLY_FACE = { fw: 0.04, up: -0.32 };

function mixHex(a, b, t) {
  const A = parseInt(a.slice(1), 16);
  const B = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((A >> s) & 255) + (((B >> s) & 255) - ((A >> s) & 255)) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** The bean's body line, hip to head through (qx, qy) (stroked thick by drawBean). */
function beanPath(ctx, hip, qx, qy, head) {
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.quadraticCurveTo(qx, qy, head.x, head.y);
}

/** A held bean whose holder draws it (between the jelly's layers, under the beak). */
function heldInDrawing(u) {
  const h = u.held && u.heldBy;
  return !!h && h.holding === u && !h.gone && (h.type.shape === 'jelly' || h.type.shape === 'bird');
}

/**
 * Anvil: squash the whole unit flat about its feet (ctx.save() included; the
 * caller restores). Flat for the first 0.3 s, then it peels back up with an
 * accordion wobble.
 */
function pancake(ctx, u) {
  const k = clamp(u.squashT / 0.7, 0, 1);
  const acc = k < 1 ? Math.sin(u.squashT * 38) * 0.14 * (1 - k) * Math.min(1, k * 3) : 0;
  const sy = 1 - 0.72 * k + acc;
  const sx = 1 + 0.55 * k - acc * 0.5;
  ctx.save();
  ctx.translate(u.hip.x, u.ground);
  ctx.scale(sx, sy);
  ctx.translate(-u.hip.x, -u.ground);
  return true;
}

/**
 * Hat-style frame at an anchor { x, y, ang } (as hatAnchor gives it): local
 * +x = forward (mirrored with the facing f), -y = up, units of s.
 */
function headFrame(ctx, a, s, f) {
  const sa = Math.sin(a.ang);
  const ca = Math.cos(a.ang);
  ctx.transform(-sa * s * f, ca * s * f, -ca * s, -sa * s, a.x, a.y);
}

/** Body frame at (x, y): local +x = the unit's forward, -y = its up, units of s. */
function bodyFrame(ctx, u, x, y, s) {
  ctx.transform(u.fwx * s, u.fwy * s, -u.ux * s, -u.uy * s, x, y);
}

/** Point on the bean's spine curve (hip -> chest -> head) at t, pushed `side` px across it. */
function spineAt(u, t, side, out) {
  const { hip, chest, head } = u;
  const qx = 2 * chest.x - (hip.x + head.x) / 2;
  const qy = 2 * chest.y - (hip.y + head.y) / 2;
  const mt = 1 - t;
  out.x = mt * mt * hip.x + 2 * mt * t * qx + t * t * head.x + u.fwx * side;
  out.y = mt * mt * hip.y + 2 * mt * t * qy + t * t * head.y + u.fwy * side;
  return out;
}
const SP = { x: 0, y: 0 };

/** Seconds a frame's step covers, for speeds read off the Verlet particles. */
const stepDt = (battle) => (battle && battle.dt) || 1 / 120;

// --- Sprout ---------------------------------------------------------------------

/** A toothpick with a cocktail olive near its point (the Sprout's half-size sword). */
function drawToothpick(ctx, hx, hy, tx, ty) {
  const dx = tx - hx;
  const dy = ty - hy;
  const L = Math.hypot(dx, dy) || 1;
  const ax = dx / L;
  const ay = dy / L;
  ctx.lineCap = 'round';
  ctx.strokeStyle = PICK.dark;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(hx - ax * 3, hy - ay * 3);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.strokeStyle = PICK.wood;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  const ox = tx - ax * 4;
  const oy = ty - ay * 4;
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.arc(ox, oy, 3.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = PICK.olive;
  ctx.beginPath();
  ctx.arc(ox, oy, 2.7, 0, TAU);
  ctx.fill();
  ctx.fillStyle = PICK.pimento;
  ctx.beginPath();
  ctx.arc(ox + ax * 1.1, oy + ay * 1.1, 1.1, 0, TAU);
  ctx.fill();
}

/** One leaf in a local frame: base (x, y), pointing at ang, length len, half width w. */
function leafShape(ctx, x, y, ang, len, w, fill, edge) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const tx = x + c * len;
  const ty = y + s * len;
  const mx = x + c * len * 0.45;
  const my = y + s * len * 0.45;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(mx - s * w, my + c * w, tx, ty);
  ctx.quadraticCurveTo(mx + s * w, my - c * w, x, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 0.13;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + c * len * 0.78, y + s * len * 0.78);
  ctx.lineWidth = 0.09;
  ctx.stroke();
}

/** Sprout: two big leaves on a short stem. They flap and stream back as it runs and wilt when it dies. */
function drawLeaves(ctx, u, battle) {
  const a = hatAnchor(u, HAT_AT);
  const run = u.alive ? clamp(Math.abs(u.hip.x - u.hip.px) / stepDt(battle) / 90, 0, 1) : 0;
  const wilt = u.alive ? 0 : clamp((u.deadT || 0) / 0.6, 0, 1);
  const flap = u.alive ? Math.sin(u.time * 19) * 0.3 * run + Math.sin(u.time * 2.7) * 0.07 : 0;
  // Angles in the head frame (0 = forward, -PI/2 = up); wilting droops them down the sides
  const front = -0.95 - 0.45 * run + flap + wilt * 1.6;
  const back = -2.2 - 0.3 * run - flap - wilt * 1.7;
  const fill = wilt > 0 ? mixHex(LEAF.base, LEAF.wilt, wilt) : LEAF.base;
  ctx.save();
  headFrame(ctx, a, u.R, u.f);
  ctx.lineCap = 'round';
  ctx.strokeStyle = LEAF.dark;
  ctx.lineWidth = 0.24;
  ctx.beginPath();
  ctx.moveTo(0, 0.1);
  ctx.quadraticCurveTo(0.08, -0.2, 0.02, -0.42 + wilt * 0.12);
  ctx.stroke();
  const sy = -0.42 + wilt * 0.12;
  leafShape(ctx, 0.02, sy, back, 1.45, 0.6, fill, LEAF.dark);
  leafShape(ctx, 0.02, sy, front, 1.55, 0.64, fill, LEAF.dark);
  if (!wilt) {
    // a light vein-side sheen on the front leaf
    ctx.strokeStyle = LEAF.light;
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    const c = Math.cos(front);
    const s = Math.sin(front);
    ctx.moveTo(0.02 + c * 0.35 + s * 0.22, sy + s * 0.35 - c * 0.22);
    ctx.lineTo(0.02 + c * 1.05 + s * 0.18, sy + s * 1.05 - c * 0.18);
    ctx.stroke();
  }
  ctx.restore();
}

// --- Propeller Pal -----------------------------------------------------------------

/**
 * The red-and-yellow propeller cap, sitting on anchor (x, y) with up angle
 * `ang` (as drawHat), size R, facing f. spin: the blades' angle (radians);
 * blur 0..1: how fast it whirrs (the disc). Also draws the popped-off 'propCap' item.
 */
const CAP_AT = { x: 0, y: 0, ang: 0 }; // reused anchor for drawCopterCap

// A frame along a stick held at (hx, hy) with unit axis (ax, ay) and length L:
// stickPt(s, w) is the point s of the way to the tip and w px across, written
// into PT (no closure or array per stick per frame).
const STICK = { x: 0, y: 0, ax: 0, ay: 0, nx: 0, ny: 0 };
function setStick(hx, hy, ax, ay, L) {
  STICK.x = hx;
  STICK.y = hy;
  STICK.ax = ax * L;
  STICK.ay = ay * L;
  STICK.nx = -ay;
  STICK.ny = ax;
}
function stickPt(s, w = 0) {
  PT[0] = STICK.x + STICK.ax * s + STICK.nx * w;
  PT[1] = STICK.y + STICK.ay * s + STICK.ny * w;
  return PT;
}

/** The propeller cap's dome, in the cap's frame. */
function capDome(ctx) {
  ctx.beginPath();
  ctx.moveTo(-0.98, 0.22);
  ctx.bezierCurveTo(-0.98, -0.42, -0.52, -0.68, 0, -0.68);
  ctx.bezierCurveTo(0.52, -0.68, 0.98, -0.42, 0.98, 0.22);
  ctx.quadraticCurveTo(0, 0.38, -0.98, 0.22);
  ctx.closePath();
}

export function drawCopterCap(ctx, x, y, ang, R, f, spin, blur = 1) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !(R > 0)) return;
  ctx.save();
  CAP_AT.x = x;
  CAP_AT.y = y;
  CAP_AT.ang = ang;
  headFrame(ctx, CAP_AT, R, f || 1);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const dome = capDome;
  // Visor out front
  ctx.fillStyle = CAP.red;
  ctx.beginPath();
  ctx.ellipse(0.78, 0.2, 0.55, 0.15, 0.08, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = CAP.dark;
  ctx.lineWidth = 0.09;
  ctx.stroke();
  dome(ctx);
  ctx.fillStyle = CAP.red;
  ctx.fill();
  ctx.save();
  dome(ctx);
  ctx.clip();
  ctx.fillStyle = CAP.yellow;
  for (let i = 0; i < 2; i++) {
    const x0 = i ? 0.22 : -0.66;
    const x1 = i ? 0.66 : -0.22;
    ctx.beginPath();
    ctx.moveTo(x0 * 1.5, 0.45);
    ctx.lineTo(x0 * 0.12, -0.72);
    ctx.lineTo(x1 * 0.12, -0.72);
    ctx.lineTo(x1 * 1.5, 0.45);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(40,10,10,0.18)';
  ctx.beginPath();
  ctx.ellipse(0.55, 0.15, 0.75, 0.55, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  dome(ctx);
  ctx.strokeStyle = CAP.dark;
  ctx.lineWidth = 0.1;
  ctx.stroke();
  // Stem and hub
  ctx.strokeStyle = CAP.hub;
  ctx.lineWidth = 0.14;
  ctx.beginPath();
  ctx.moveTo(0, -0.66);
  ctx.lineTo(0, -1.02);
  ctx.stroke();
  // The whirr: a blurred disc, then two blade strokes turning about the stem
  if (blur > 0.02) {
    ctx.fillStyle = `rgba(255,255,255,${0.45 * blur})`;
    ctx.beginPath();
    ctx.ellipse(0, -1.04, 1.75, 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `rgba(40,40,60,${0.35 * blur})`;
    ctx.lineWidth = 0.07;
    ctx.stroke();
  }
  const c = Math.cos(spin);
  const s = Math.sin(spin);
  for (let k = 0; k < 2; k++) {
    const sx = (k ? -c : c) * 1.6;
    const sy = -1.04 + (k ? -s : s) * 0.12;
    ctx.strokeStyle = CAP.hub;
    ctx.lineWidth = 0.34;
    ctx.beginPath();
    ctx.moveTo(0, -1.04);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    ctx.strokeStyle = k ? CAP.yellow : CAP.red;
    ctx.lineWidth = 0.2;
    ctx.stroke();
  }
  ctx.fillStyle = CAP.hub;
  ctx.beginPath();
  ctx.arc(0, -1.04, 0.15, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// --- Pogo Bean -------------------------------------------------------------------

/**
 * A pogo stick from its handlebar (hx, hy) down to the rubber foot (tx, ty):
 * a silver shaft with a black coil spring, black footpegs at pegT (0..1 along
 * it; -1 = the default spot) and a red handlebar.
 */
function drawPogoStick(ctx, hx, hy, tx, ty, pegT = -1) {
  const dx = tx - hx;
  const dy = ty - hy;
  const L = Math.hypot(dx, dy) || 1;
  const ax = dx / L;
  const ay = dy / L;
  const nx = -ay;
  const ny = ax;
  const pt = pegT >= 0 ? pegT : 0.5;
  setStick(hx, hy, ax, ay, L);
  const P = stickPt;
  ctx.lineCap = 'round';
  // Shaft
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 5.4;
  ctx.beginPath();
  ctx.moveTo(hx - ax * 3, hy - ay * 3);
  ctx.lineTo(tx - ax * 2, ty - ay * 2);
  ctx.stroke();
  ctx.strokeStyle = POGO.steel;
  ctx.lineWidth = 3.6;
  ctx.stroke();
  ctx.strokeStyle = POGO.light;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  P(0.05, -0.7);
  const l0x = PT[0];
  const l0y = PT[1];
  P(0.9, -0.7);
  const l1x = PT[0];
  const l1y = PT[1];
  ctx.moveTo(l0x, l0y);
  ctx.lineTo(l1x, l1y);
  ctx.stroke();
  // Coil spring between the pegs and the foot
  const t0 = Math.min(0.9, pt + 0.1);
  const t1 = 0.9;
  ctx.strokeStyle = POGO.black;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const turns = 9;
  for (let i = 0; i <= turns; i++) {
    P(t0 + ((t1 - t0) * i) / turns, i % 2 ? 3.6 : -3.6);
    const x = PT[0];
    const y = PT[1];
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // Rubber foot
  ctx.fillStyle = POGO.black;
  ctx.beginPath();
  ctx.arc(tx - ax * 1.5, ty - ay * 1.5, 3, 0, TAU);
  ctx.fill();
  // Footpegs and the handlebar, sticking out both sides
  pogoBar(ctx, pt, 6.5, 2.2, POGO.black);
  pogoBar(ctx, 0, 7.5, 2.8, POGO.bar);
}

/** A crossbar t of the way down the current stick (setStick), half px out each side. */
function pogoBar(ctx, t, half, w, col) {
  stickPt(t, -half);
  const x0 = PT[0];
  const y0 = PT[1];
  stickPt(t, half);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = w + 1.4;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(PT[0], PT[1]);
  ctx.stroke();
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.stroke();
}

/** Where a pogo's footpegs go: level with its feet, along the stick. */
function pegsAt(u) {
  const h = u.hand[u.mainHand];
  const t = u.tip;
  const dx = t.x - h.x;
  const dy = t.y - h.y;
  const L2 = dx * dx + dy * dy || 1;
  const fx = (u.foot[0].x + u.foot[1].x) / 2;
  const fy = (u.foot[0].y + u.foot[1].y) / 2;
  return clamp(((fx - h.x) * dx + (fy - h.y) * dy) / L2, 0.3, 0.75);
}

/** "BOING" lines: a few streaks trailing a pogo bean while it flies through a hop. */
function boingLines(ctx, u, battle) {
  const dt = stepDt(battle);
  const vx = (u.hip.x - u.hip.px) / dt;
  const vy = (u.hip.y - u.hip.py) / dt;
  const sp = Math.hypot(vx, vy);
  if (sp < 140 || u.alt < 14) return;
  const ux = vx / sp;
  const uy = vy / sp;
  const k = clamp((sp - 140) / 260, 0, 1);
  ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.35 * k})`;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  const x = u.tip ? u.tip.x : u.hip.x;
  const y = u.tip ? u.tip.y : u.hip.y;
  for (let i = -1; i <= 1; i++) {
    const o = i * 6;
    const len = (14 + 10 * k) * (1 - Math.abs(i) * 0.3);
    const sx = x - ux * 6 - uy * o;
    const sy = y - uy * 6 + ux * o;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - ux * len, sy - uy * len);
    ctx.stroke();
  }
}

// --- Butterfly Netter --------------------------------------------------------------

/**
 * Butterfly net from the hand (hx, hy) to the hoop's centre (tx, ty): a long
 * thin pole that runs back past the hands, a big white hoop with a faint
 * cross-hatch and a mesh bag that hangs from it and sways.
 */
function drawNet(ctx, hx, hy, tx, ty, t) {
  const W = WEAPONS.net;
  const dx = tx - hx;
  const dy = ty - hy;
  const L = Math.hypot(dx, dy) || 1;
  const ax = dx / L;
  const ay = dy / L;
  const r = W.tipR;
  ctx.lineCap = 'round';
  // Pole
  ctx.strokeStyle = NET.poleDark;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(hx - ax * (W.grip + 9), hy - ay * (W.grip + 9));
  ctx.lineTo(tx - ax * r * 0.92, ty - ay * r * 0.92);
  ctx.stroke();
  ctx.strokeStyle = NET.pole;
  ctx.lineWidth = 2;
  ctx.stroke();
  // The bag hangs from the hoop and trails the swing a little
  const sway = Math.sin(t * 3.1) * 3 - ax * 4;
  const bx = tx + sway * 1.4;
  const by = ty + r * 2.3;
  ctx.beginPath();
  ctx.moveTo(tx - r, ty);
  ctx.quadraticCurveTo(tx - r * 0.75 + sway, ty + r * 1.7, bx, by);
  ctx.quadraticCurveTo(tx + r * 0.75 + sway, ty + r * 1.7, tx + r, ty);
  ctx.arc(tx, ty, r, 0, Math.PI, false);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let k = -5; k <= 5; k++) {
    const o = k * 4.5;
    ctx.moveTo(tx + o - r * 1.5, ty - r);
    ctx.lineTo(tx + o + r * 1.5, ty + r * 2.6);
    ctx.moveTo(tx + o + r * 1.5, ty - r);
    ctx.lineTo(tx + o - r * 1.5, ty + r * 2.6);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tx - r, ty);
  ctx.quadraticCurveTo(tx - r * 0.75 + sway, ty + r * 1.7, bx, by);
  ctx.quadraticCurveTo(tx + r * 0.75 + sway, ty + r * 1.7, tx + r, ty);
  ctx.stroke();
  // Hoop
  ctx.beginPath();
  ctx.arc(tx, ty, r, 0, TAU);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3.6;
  ctx.stroke();
  ctx.strokeStyle = NET.mesh;
  ctx.lineWidth = 2.2;
  ctx.stroke();
}

/** A flier just caught: the mesh is still over it for a moment. */
function drawTangle(ctx, u) {
  const k = clamp((u.netImmuneT - (NET_IMMUNE - NET_TANGLE)) / NET_TANGLE, 0, 1);
  const c = u.chest;
  const r = u.R * 1.7;
  ctx.save();
  ctx.globalAlpha = A0 * Math.min(1, k * 2.5);
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = -4; i <= 4; i++) {
    const o = i * 5;
    ctx.moveTo(c.x + o - r, c.y - r);
    ctx.lineTo(c.x + o + r, c.y + r);
    ctx.moveTo(c.x + o + r, c.y - r);
    ctx.lineTo(c.x + o - r, c.y + r);
  }
  ctx.stroke();
  ctx.restore();
}

/** Netter: round wire glasses over the googly eyes. */
function drawGlasses(ctx, eyes, R, fx, fy) {
  const [e0, e1] = eyes;
  const r0 = e0.r * 1.16;
  const r1 = e1.r * 1.16;
  ctx.strokeStyle = '#3a2a1a';
  ctx.lineWidth = Math.max(1, R * 0.1);
  ctx.beginPath();
  ctx.arc(e0.p[0], e0.p[1], r0, 0, TAU);
  ctx.moveTo(e1.p[0] + r1, e1.p[1]);
  ctx.arc(e1.p[0], e1.p[1], r1, 0, TAU);
  // Bridge and the arm back over the ear
  const dx = e1.p[0] - e0.p[0];
  const dy = e1.p[1] - e0.p[1];
  const d = Math.hypot(dx, dy) || 1;
  ctx.moveTo(e0.p[0] + (dx / d) * r0, e0.p[1] + (dy / d) * r0);
  ctx.lineTo(e1.p[0] - (dx / d) * r1, e1.p[1] - (dy / d) * r1);
  ctx.moveTo(e0.p[0] - fx * r0, e0.p[1] - fy * r0);
  ctx.lineTo(e0.p[0] - fx * (r0 + R * 0.45), e0.p[1] - fy * (r0 + R * 0.45));
  ctx.stroke();
  // Glints
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = Math.max(0.7, R * 0.07);
  ctx.beginPath();
  for (const { p, r } of eyes) {
    ctx.moveTo(p[0] + Math.cos(-2.4) * r * 0.85, p[1] + Math.sin(-2.4) * r * 0.85);
    ctx.arc(p[0], p[1], r * 0.85, -2.4, -1.7);
  }
  ctx.stroke();
}

// --- Bomb Juggler ------------------------------------------------------------------

// The jester diamonds: [t along the spine, across (R), white] per diamond, flat
const HARLEQUIN = [0.08, -0.48, 1, 0.08, 0.48, 0, 0.36, -0.48, 0, 0.36, 0.48, 1, 0.22, 0, 1];

/** Jester diamonds on the body (team colour and white, like the Brick's mortar). */
function drawHarlequin(ctx, u, T) {
  if (u.hurtT > 0.05 && u.alive) return;
  const R = u.R;
  const ux = u.ux;
  const uy = u.uy;
  const nx = u.fwx;
  const ny = u.fwy;
  const hu = R * 0.42;
  const hw = R * 0.44;
  for (let i = 0; i < HARLEQUIN.length; i += 3) {
    const t = HARLEQUIN[i];
    const o = HARLEQUIN[i + 1];
    const white = HARLEQUIN[i + 2];
    const c = spineAt(u, t, o * R, SP);
    ctx.beginPath();
    ctx.moveTo(c.x + ux * hu, c.y + uy * hu);
    ctx.lineTo(c.x + nx * hw, c.y + ny * hw);
    ctx.lineTo(c.x - ux * hu, c.y - uy * hu);
    ctx.lineTo(c.x - nx * hw, c.y - ny * hw);
    ctx.closePath();
    ctx.fillStyle = white ? '#ffffff' : T.dark;
    ctx.globalAlpha = A0 * (white ? 0.92 : 0.55);
    ctx.fill();
  }
  ctx.globalAlpha = A0;
}

/** A white zig-zag jester ruff round the neck (seen edge-on, so it sticks out front and back). */
function drawRuff(ctx, u) {
  const R = u.R;
  const c = spineAt(u, 1, 0, SP);
  const cx = c.x - u.ux * R * 1.0;
  const cy = c.y - u.uy * R * 1.0;
  ctx.save();
  bodyFrame(ctx, u, cx, cy, R);
  const n = 16;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = i % 2 ? 0.74 : 1;
    const x = Math.cos(a) * 1.34 * k;
    const y = Math.sin(a) * 0.3 * k;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.09;
  ctx.lineJoin = 'round';
  ctx.stroke();
  // Pleats
  ctx.strokeStyle = 'rgba(120,120,140,0.55)';
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  for (let i = 1; i < n; i += 2) {
    const a = (i / n) * TAU;
    ctx.moveTo(Math.cos(a) * 0.98, Math.sin(a) * 0.22);
    ctx.lineTo(Math.cos(a) * 0.45, Math.sin(a) * 0.1);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * The juggling loop: three lit bombs on a figure-eight over the hands (one
 * lap per BOMB_LOOP s of the unit's clock). While it winds up a throw one
 * bomb is in its hand; after the throw a fresh one comes up from its belt.
 * Nothing orbits while it is down, held or dead (the real bombs fall as shots).
 */
function drawJuggle(ctx, u) {
  if (!u.alive || u.held || u.downT > 0 || u.conscious < 0.5) return;
  const a = u.act;
  const R = u.R;
  const h0 = u.hand[0];
  const h1 = u.hand[1];
  const cx = ((h0.x + h1.x) / 2 + u.head.x) / 2;
  const cy = Math.min(h0.y, h1.y, u.head.y - R * 0.6) - R * 1.45;
  const A = R * 1.15;
  const B = R * 0.95;
  const r = (u.type.bomb && u.type.bomb.r) || 6;
  const ph = u.time / BOMB_LOOP;
  // (bomb i's spot on the figure-eight: worked out in place, no closure or array per frame)
  let n = 3;
  if (a && (a.phase === 'draw' || a.phase === 'recover')) n = 2;
  for (let i = 0; i < n; i++) {
    const th = (ph + i / 3) * TAU;
    drawJBomb(ctx, cx + Math.sin(th) * A * u.f, cy + Math.sin(th) * Math.cos(th) * B - Math.cos(th) * B * 0.35, r, ph * 4 + i * 2, 0, u.time);
  }
  if (a && a.phase === 'draw') {
    const h = u.hand[u.mainHand];
    drawJBomb(ctx, h.x, h.y - r * 0.6, r, 0.3, 0, u.time);
  } else if (a && a.phase === 'recover') {
    // The fresh one, pulled from the belt up into the loop
    const k = clamp(a.t / ((u.type.attack && u.type.attack.recover) || 0.45), 0, 1);
    const e = 1 - (1 - k) * (1 - k);
    const th = (ph + 2 / 3) * TAU;
    const lx = cx + Math.sin(th) * A * u.f;
    const ly = cy + Math.sin(th) * Math.cos(th) * B - Math.cos(th) * B * 0.35;
    const bx = u.hip.x + u.fwx * R * 0.7;
    const by = u.hip.y + u.fwy * R * 0.7;
    drawJBomb(ctx, bx + (lx - bx) * e, by + (ly - by) * e - Math.sin(e * Math.PI) * R, r, e * 6, 0, u.time);
  }
}

// --- Nutcracker ----------------------------------------------------------------------

/** Nutcracker: a soldier's coat (the team-colour body) with a black belt and gold buttons. */
function drawCoat(ctx, u) {
  if (u.hurtT > 0.05 && u.alive) return;
  const R = u.R;
  const b = spineAt(u, 0.16, 0, SP);
  const bx = b.x;
  const by = b.y;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = SHAKO.black;
  ctx.lineWidth = R * 0.36;
  ctx.beginPath();
  ctx.moveTo(bx - u.fwx * R * 0.93, by - u.fwy * R * 0.93);
  ctx.lineTo(bx + u.fwx * R * 0.93, by + u.fwy * R * 0.93);
  ctx.stroke();
  ctx.lineCap = 'round';
  ctx.fillStyle = SHAKO.gold;
  ctx.strokeStyle = SHAKO.goldDark;
  ctx.lineWidth = Math.max(0.6, R * 0.05);
  ctx.beginPath();
  ctx.rect(bx + u.fwx * R * 0.55 - R * 0.17, by + u.fwy * R * 0.55 - R * 0.17, R * 0.34, R * 0.34);
  ctx.fill();
  ctx.stroke();
  for (const t of [0.32, 0.46, 0.6]) {
    const p = spineAt(u, t, R * 0.66, SP);
    ctx.beginPath();
    ctx.arc(p.x, p.y, R * 0.11, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}

/** Nutcracker: the tall black shako with a gold plate, a gold band, a peak and a red plume. */
function drawShako(ctx, u) {
  const a = hatAnchor(u, HAT_AT);
  ctx.save();
  headFrame(ctx, a, u.R, u.f);
  ctx.lineJoin = 'round';
  // Peak, under the front
  ctx.fillStyle = SHAKO.black;
  ctx.beginPath();
  ctx.moveTo(0.35, 0.22);
  ctx.quadraticCurveTo(1.05, 0.2, 1.32, 0.48);
  ctx.quadraticCurveTo(0.9, 0.44, 0.35, 0.4);
  ctx.closePath();
  ctx.fill();
  // The tall drum of the hat, a little wider at the top
  ctx.beginPath();
  ctx.moveTo(-0.92, 0.34);
  ctx.lineTo(-1.04, -1.86);
  ctx.quadraticCurveTo(0, -2.02, 1.04, -1.86);
  ctx.lineTo(0.92, 0.34);
  ctx.quadraticCurveTo(0, 0.46, -0.92, 0.34);
  ctx.closePath();
  ctx.fillStyle = SHAKO.black;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.09;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  ctx.beginPath();
  ctx.moveTo(-0.7, 0.3);
  ctx.lineTo(-0.8, -1.8);
  ctx.lineTo(-0.48, -1.84);
  ctx.lineTo(-0.42, 0.33);
  ctx.closePath();
  ctx.fill();
  // Top rim
  ctx.fillStyle = SHAKO.rim;
  ctx.beginPath();
  ctx.ellipse(0, -1.9, 1.04, 0.16, 0, 0, TAU);
  ctx.fill();
  // Gold band at the base and gold cord near the top
  ctx.fillStyle = SHAKO.gold;
  ctx.beginPath();
  ctx.moveTo(-0.93, 0.12);
  ctx.quadraticCurveTo(0, 0.24, 0.93, 0.12);
  ctx.lineTo(0.92, 0.32);
  ctx.quadraticCurveTo(0, 0.44, -0.92, 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = SHAKO.gold;
  ctx.lineWidth = 0.1;
  ctx.beginPath();
  ctx.moveTo(-1.0, -1.55);
  ctx.quadraticCurveTo(0, -1.42, 1.0, -1.55);
  ctx.stroke();
  // Gold plate on the front
  ctx.beginPath();
  ctx.moveTo(0.3, -1.25);
  ctx.lineTo(0.68, -1.02);
  ctx.lineTo(0.62, -0.48);
  ctx.quadraticCurveTo(0.42, -0.25, 0.3, -0.18);
  ctx.quadraticCurveTo(0.18, -0.25, -0.02, -0.48);
  ctx.lineTo(-0.08, -1.02);
  ctx.closePath();
  ctx.fillStyle = SHAKO.gold;
  ctx.fill();
  ctx.strokeStyle = SHAKO.goldDark;
  ctx.lineWidth = 0.07;
  ctx.stroke();
  // Red plume
  ctx.fillStyle = SHAKO.plume;
  ctx.beginPath();
  ctx.ellipse(-0.08, -2.32, 0.3, 0.5, -0.15, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#7a1612';
  ctx.lineWidth = 0.07;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(-0.18, -2.45, 0.08, 0.2, -0.15, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** How far the Nutcracker's jaw hangs open (0..1): wide in the windup, trembling at the top, shut on the bite. */
function jawOpen(u) {
  if (!u.alive) return 0.5;
  const a = u.act;
  const A = u.type.attack;
  if (a && A) {
    if (a.phase === 'windup') {
      if (a.t < A.windup) return 1 - (1 - a.t / A.windup) ** 2;
      return 0.94 + Math.sin(a.t * 95) * 0.06;
    }
    if (a.phase === 'strike') return clamp(1 - a.t / (A.strike * 0.4), 0, 1);
    return 0;
  }
  // It chatters while it walks
  return Math.abs(u.wantVx) > 1 ? Math.max(0, Math.sin(u.time * 15)) * 0.16 : 0;
}

/** The big square white jaw and beard, hinged under the eyes; open 0..1. */
function drawJaw(ctx, u, open) {
  const R = u.R;
  ctx.save();
  bodyFrame(ctx, u, u.head.x, u.head.y, R);
  ctx.lineJoin = 'round';
  const hx = -0.08;
  const hy = 0.44;
  const ang = open * 0.85;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  if (open > 0.03) {
    // The dark mouth behind it, and a row of square top teeth
    const fx = hx + (1.24 - hx) * c - (0.44 - hy) * s;
    const fy = hy + (1.24 - hx) * s + (0.44 - hy) * c;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(1.24, 0.44);
    ctx.lineTo(fx, fy);
    ctx.closePath();
    ctx.fillStyle = JAW.mouth;
    ctx.fill();
    ctx.fillStyle = JAW.white;
    for (let x = 0.28; x < 1.14; x += 0.27) ctx.fillRect(x, 0.43, 0.2, 0.17);
  }
  ctx.translate(hx, hy);
  ctx.rotate(ang);
  ctx.translate(-hx, -hy);
  // Beard: a zig-zag fringe under the jaw
  ctx.beginPath();
  ctx.moveTo(1.2, 1.1);
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const x = 1.2 - (1.32 * i) / n;
    ctx.lineTo(x + 0.13, 1.58 - (i % 2) * 0.05 - i * 0.02);
    ctx.lineTo(x, 1.22);
  }
  ctx.lineTo(-0.12, 1.0);
  ctx.closePath();
  ctx.fillStyle = JAW.white;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.08;
  ctx.stroke();
  // The jaw block
  ctx.beginPath();
  const x0 = -0.1;
  const y0 = 0.44;
  const x1 = 1.24;
  const y1 = 1.24;
  const rr = 0.16;
  ctx.moveTo(x0 + rr, y0);
  ctx.arcTo(x1, y0, x1, y1, rr);
  ctx.arcTo(x1, y1, x0, y1, rr);
  ctx.arcTo(x0, y1, x0, y0, rr);
  ctx.arcTo(x0, y0, x1, y0, rr);
  ctx.closePath();
  ctx.fillStyle = JAW.white;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = JAW.shade;
  ctx.fillRect(0.0, 1.02, 1.12, 0.12);
  if (open > 0.03) {
    ctx.fillStyle = '#ffffff';
    for (let x = 0.3; x < 1.14; x += 0.27) ctx.fillRect(x, 0.3, 0.2, 0.16);
  }
  // A curled moustache over the hinge
  ctx.fillStyle = JAW.white;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.ellipse(0.82, 0.48, 0.36, 0.13, -0.12, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// --- Brolly ----------------------------------------------------------------------------

/** Which umbrella to draw: open while floating, inside out once hit up there, else closed. */
function brollyState(u) {
  if (u.flipped) return u.alive && u.alt > 14 ? 'inside' : 'broken';
  return u.floatT > 0 && u.alive ? 'open' : 'closed';
}

/**
 * An umbrella from its hooked handle (hx, hy) to its tip (tx, ty), team
 * coloured. state: 'open' (a big striped canopy at the tip), 'inside' (blown
 * inside out: a cup with bent spokes), 'closed' (furled and poked like a
 * sword) or 'broken' (closed, with a bent spoke or two poking out).
 */
function drawBrolly(ctx, hx, hy, tx, ty, T, state, t = 0) {
  const dx = tx - hx;
  const dy = ty - hy;
  const L = Math.hypot(dx, dy) || 1;
  const ax = dx / L;
  const ay = dy / L;
  const nx = -ay;
  const ny = ax;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Shaft and the hooked wooden handle
  ctx.strokeStyle = '#3a3a46';
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.moveTo(hx - ax * 2, hy - ay * 2);
  ctx.lineTo(tx + ax * 3, ty + ay * 3);
  ctx.stroke();
  const kx = hx - ax * 5;
  const ky = hy - ay * 5;
  const hr = 3.4;
  const a0 = Math.atan2(-ny, -nx);
  ctx.strokeStyle = WOOD_DARK;
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(hx + ax * 1, hy + ay * 1);
  ctx.lineTo(kx, ky);
  ctx.arc(kx + nx * hr, ky + ny * hr, hr, a0, a0 + Math.PI, ax * ny - ay * nx > 0);
  ctx.stroke();
  ctx.strokeStyle = WOOD_LIGHT;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  if (state === 'open' || state === 'inside') {
    ctx.save();
    // Canopy frame: origin at the tip, +y back down the shaft, x across it
    ctx.transform(nx, ny, -ax, -ay, tx, ty);
    if (state === 'open') openCanopy(ctx, T);
    else insideOutCanopy(ctx, T, t);
    ctx.restore();
    return;
  }
  // Furled: a slim spindle along the shaft
  const s0 = 0.22;
  const s1 = 0.96;
  setStick(hx, hy, ax, ay, L);
  const P = stickPt;
  ctx.beginPath();
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const s = s0 + ((s1 - s0) * i) / N;
    const w = 4.2 * Math.sin((Math.PI * i) / N) ** 0.8 * (1 - (0.35 * i) / N);
    P(s, w);
    const x = PT[0];
    const y = PT[1];
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = N; i >= 0; i--) {
    const s = s0 + ((s1 - s0) * i) / N;
    const w = 4.2 * Math.sin((Math.PI * i) / N) ** 0.8 * (1 - (0.35 * i) / N);
    P(s, -w);
    const x = PT[0];
    const y = PT[1];
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = T.body;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // A white stripe wound round it, and the strap
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let k = 0; k < 2; k++) {
    const s = k ? 0.66 : 0.42;
    P(s - 0.05, -3);
    const x0 = PT[0];
    const y0 = PT[1];
    P(s + 0.05, 3);
    const x1 = PT[0];
    const y1 = PT[1];
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
  if (state === 'broken') {
    // Bent spokes poking out of the furl
    ctx.strokeStyle = '#3a3a46';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let k = 0; k < 2; k++) {
      const s = k ? 0.78 : 0.62;
      const side = k ? -1 : 1;
      P(s, side * 3);
      const x0 = PT[0];
      const y0 = PT[1];
      P(s + 0.12, side * 9);
      const x1 = PT[0];
      const y1 = PT[1];
      P(s + 0.02, side * 13);
      const x2 = PT[0];
      const y2 = PT[1];
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }
}

/** The open canopy's outline (tip at 0, 0; the rim BROLLY_R wide below it). */
function canopyDome(ctx) {
  const W = BROLLY_R;
  const rim = W * 0.46;
  ctx.beginPath();
  ctx.moveTo(-W, rim);
  ctx.bezierCurveTo(-W * 0.98, rim * 0.05, -W * 0.55, -W * 0.06, 0, -W * 0.06);
  ctx.bezierCurveTo(W * 0.55, -W * 0.06, W * 0.98, rim * 0.05, W, rim);
  const n = 6;
  for (let i = n - 1; i >= 0; i--) {
    const x = -W + (2 * W * i) / n;
    ctx.quadraticCurveTo(x + W / n, rim - W * 0.12, x, rim);
  }
  ctx.closePath();
}
/** The open canopy in its frame (tip at 0, 0; the rim BROLLY_R wide below it): eight panels, team colour and white. */
function openCanopy(ctx, T) {
  const W = BROLLY_R;
  const rim = W * 0.46;
  const dome = canopyDome;
  dome(ctx);
  ctx.fillStyle = T.body;
  ctx.fill();
  ctx.save();
  dome(ctx);
  ctx.clip();
  // White panels: wedges from the top to every other rim point (side view shows six of the eight)
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i += 2) {
    const x0 = -W + (2 * W * i) / 6;
    const x1 = -W + (2 * W * (i + 1)) / 6;
    ctx.beginPath();
    ctx.moveTo(0, -W * 0.2);
    ctx.lineTo(x0 * 1.04, rim + 2);
    ctx.lineTo(x1 * 1.04, rim + 2);
    ctx.closePath();
    ctx.fill();
  }
  // Shading on the far side and the underside showing at the rim
  ctx.fillStyle = 'rgba(20,10,40,0.18)';
  ctx.beginPath();
  ctx.ellipse(W * 0.55, rim * 0.6, W * 0.6, W * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(20,10,40,0.25)';
  ctx.fillRect(-W, rim - W * 0.1, 2 * W, W * 0.12);
  ctx.restore();
  dome(ctx);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // Rib tips and the ferrule
  ctx.fillStyle = OUTLINE;
  for (let i = 0; i <= 6; i++) {
    ctx.beginPath();
    ctx.arc(-W + (2 * W * i) / 6, rim, 1.3, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = '#3a3a46';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -W * 0.06);
  ctx.lineTo(0, -W * 0.24);
  ctx.stroke();
}

/** Blown inside out: a crumpled cup above the tip, its lining showing, with bent spokes. */
/** How high rib i's tip pokes up on a blown-out umbrella (W wide), flapping. */
const flipTipY = (W, t, i) => -W * (0.62 + 0.12 * Math.sin(i * 2.3 + 1)) + Math.sin(t * 9 + i) * 1.5;

function insideOutCanopy(ctx, T, t) {
  const W = BROLLY_R * 0.82;
  const n = 6;
  ctx.beginPath();
  ctx.moveTo(0, 4);
  for (let i = 0; i <= n; i++) ctx.lineTo(-W + (2 * W * i) / n, flipTipY(W, t, i));
  ctx.closePath();
  ctx.fillStyle = T.light;
  ctx.fill();
  ctx.fillStyle = '#f2f2f2';
  for (let i = 0; i < n; i += 2) {
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(-W + (2 * W * i) / n, flipTipY(W, t, i));
    ctx.lineTo(-W + (2 * W * (i + 1)) / n, flipTipY(W, t, i + 1));
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 4);
  for (let i = 0; i <= n; i++) ctx.lineTo(-W + (2 * W * i) / n, flipTipY(W, t, i));
  ctx.closePath();
  ctx.stroke();
  // Spokes, kinked and poking past the cloth
  ctx.strokeStyle = '#3a3a46';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const x = -W + (2 * W * i) / n;
    const y = flipTipY(W, t, i);
    ctx.moveTo(0, 4);
    ctx.lineTo(x * 0.55, y * 0.5 + 2);
    ctx.lineTo(x * 1.12 + (i % 2 ? 3 : -3), y - 5);
  }
  ctx.stroke();
}

// --- Tummy Drummer -----------------------------------------------------------------------

/** 0..1 for a moment after each beat (from the Drummer's beat clock, when the sim keeps one). */
function beatPulse(u) {
  const B = u.type.beat;
  if (!B || typeof u.beatClock !== 'number' || !u.alive) return 0;
  const p = (((u.beatClock % B.every) + B.every) % B.every) / B.every;
  return p < 0.3 ? 1 - p / 0.3 : 0;
}

/** The drum on the belly: centre of its front head, and its radius. */
function drumAt(u) {
  const c = spineAt(u, 0.28, u.R * 1.32, SP);
  return { x: c.x, y: c.y, r: u.R * 0.92 };
}

/** A bass drum on the belly, its white head facing the enemy (seen at three-quarters). */
function drawDrum(ctx, u, T) {
  const d = drumAt(u);
  const r = d.r;
  const k = beatPulse(u);
  ctx.save();
  bodyFrame(ctx, u, d.x, d.y, 1);
  ctx.lineJoin = 'round';
  // Shell: from the belly forward to the front head (the drum sticks well out in front)
  const bx = -u.R * 0.95;
  const fx = 0;
  ctx.beginPath();
  ctx.ellipse(bx, 0, r * 0.4, r, 0, Math.PI / 2, Math.PI * 1.5);
  ctx.lineTo(fx, -r);
  ctx.lineTo(fx, r);
  ctx.closePath();
  ctx.fillStyle = OUTLINE;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(bx, 0, r * 0.4 - 1, r - 1, 0, Math.PI / 2, Math.PI * 1.5);
  ctx.lineTo(fx, -r + 1);
  ctx.lineTo(fx, r - 1);
  ctx.closePath();
  ctx.fillStyle = T.dark;
  ctx.fill();
  ctx.fillStyle = T.shade;
  ctx.fillRect(bx, -r * 0.86, fx - bx, r * 0.55);
  // Zig-zag cord
  ctx.strokeStyle = DRUM.cord;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  const n = 4;
  for (let i = 0; i <= n; i++) {
    const x = bx + ((fx - bx) * i) / n;
    const y = (i % 2 ? 1 : -1) * r * 0.78;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // Gold hoops at both ends
  ctx.strokeStyle = DRUM.rim;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.ellipse(bx, 0, r * 0.4 - 1, r - 1, 0, Math.PI / 2, Math.PI * 1.5);
  ctx.stroke();
  // Front head (a beat makes it bulge and flash)
  const hr = r * 0.5 * (1 + 0.12 * k);
  ctx.beginPath();
  ctx.ellipse(fx, 0, hr, r, 0, 0, TAU);
  ctx.fillStyle = k > 0.5 ? '#ffffff' : DRUM.head;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = DRUM.rim;
  ctx.stroke();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = OUTLINE;
  ctx.beginPath();
  ctx.ellipse(fx, 0, hr + 1.3, r + 1.3, 0, 0, TAU);
  ctx.stroke();
  // A team star on the head (squeezed: we see it at three-quarters)
  ctx.save();
  ctx.translate(fx + hr * 0.08, 0);
  ctx.scale(0.55, 1);
  ctx.fillStyle = T.body;
  star(ctx, 0, 0, r * 0.34, -Math.PI / 2);
  ctx.fill();
  ctx.restore();
  if (k > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${0.8 * k})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(fx, 0, hr + 3 + 6 * (1 - k), r + 3 + 6 * (1 - k), 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/** A drum mallet in hand i: a stick aimed at the drumhead, with a fluffy white head. */
function drawMallet(ctx, u, i) {
  const h = u.hand[i];
  const e = u.elbow[i];
  const d = drumAt(u);
  const tx = d.x;
  const ty = d.y;
  let dx = tx - h.x + (h.x - e.x) * 0.5;
  let dy = ty - h.y + (h.y - e.y) * 0.5;
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  const len = u.R * 0.95;
  const mx = h.x + dx * len;
  const my = h.y + dy * len;
  ctx.lineCap = 'round';
  ctx.strokeStyle = WOOD_DARK;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(h.x - dx * 3, h.y - dy * 3);
  ctx.lineTo(mx, my);
  ctx.stroke();
  ctx.strokeStyle = '#d9b26a';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.arc(mx, my, u.R * 0.24 + 1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(mx, my, u.R * 0.24, 0, TAU);
  ctx.fill();
}

/** The dropped drum ('drum' item): it rolls away face-on, a disc that turns with its two particles. */
function drawDrumItem(ctx, it, T) {
  const a = it.a;
  const b = it.b;
  if (!a || !b) return;
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const rot = Math.atan2(b.y - a.y, b.x - a.x);
  const r = it.R > 0 ? it.R * 0.85 : Math.max(9, Math.hypot(b.x - a.x, b.y - a.y) / 2 + 3);
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.arc(x, y, r + 1.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = T.shade;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = DRUM.head;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.76, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = DRUM.rim;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Tension rods turn as it rolls
  ctx.fillStyle = DRUM.rimDark;
  for (let i = 0; i < 6; i++) {
    const q = rot + (i * TAU) / 6;
    ctx.beginPath();
    ctx.arc(x + Math.cos(q) * r * 0.9, y + Math.sin(q) * r * 0.9, 1.3, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = T.body;
  star(ctx, x, y, r * 0.38, rot - Math.PI / 2);
  ctx.fill();
}

// --- Pelican ('bird') ------------------------------------------------------------------

/**
 * The wings' angle while it flies under its own power (0 = folded back along
 * the body, PI/2 = straight up off its back), flapping about twice a second
 * (faster with a bean in its beak, folded in a dive). NaN when it doesn't fly
 * itself (knocked out, netted, dead): then the wings follow the arms.
 */
function birdFlap(u) {
  if (!u.alive || !u.lifting || !u.lifting()) {
    if (u.alive && u.act && u.act.phase === 'dash') return 0.12;
    return NaN;
  }
  if (u.act && u.act.phase === 'dash') return 0.12;
  const rate = u.holding ? 17 : 12.5;
  return 0.95 + 0.78 * Math.sin(u.time * rate);
}

/** One wing from the shoulder: team colour with white-tipped primaries. i = 0 far (behind the body), 1 near. */
function birdWing(ctx, u, i, fill, flap) {
  const R = u.R;
  const sx = u.chest.x - u.fwx * R * 0.38 - u.ux * R * 0.15;
  const sy = u.chest.y - u.fwy * R * 0.38 - u.uy * R * 0.15;
  let dx;
  let dy;
  if (Number.isFinite(flap)) {
    const a = flap + (i ? 0 : 0.16); // the far wing shows a little higher
    dx = -u.ux * Math.cos(a) - u.fwx * Math.sin(a);
    dy = -u.uy * Math.cos(a) - u.fwy * Math.sin(a);
  } else {
    const h = u.hand[i];
    dx = h.x - sx;
    dy = h.y - sy;
    const l = Math.hypot(dx, dy);
    if (l < 1e-3) {
      dx = -u.ux;
      dy = -u.uy;
    } else {
      dx /= l;
      dy /= l;
    }
  }
  const span = R * 2.5;
  const chord = R * 0.95;
  // The trailing edge is the side away from the head
  let px = -dy;
  let py = dx;
  if (px * u.ux + py * u.uy > 0) {
    px = -px;
    py = -py;
  }
  // (the wing's frame: axesPt(s, o) is s of the span out and o of the chord back, into PT)
  AXES.x = sx;
  AXES.y = sy;
  AXES.ax = dx * span;
  AXES.ay = dy * span;
  AXES.bx = px * chord;
  AXES.by = py * chord;
  ctx.lineJoin = 'round';
  // White primaries first, then the coloured coverts over the inner part
  wingOutline(ctx, 1);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  wingOutline(ctx, 0.66);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.stroke();
}

// A skewed frame for the bird's wing and beak: origin (x, y), axes (ax, ay) and (bx, by);
// axesPt(s, o) = origin + s * a + o * b, into PT
const AXES = { x: 0, y: 0, ax: 0, ay: 0, bx: 0, by: 0 };
function axesPt(s, o) {
  PT[0] = AXES.x + AXES.ax * s + AXES.bx * o;
  PT[1] = AXES.y + AXES.ay * s + AXES.by * o;
  return PT;
}

/** The wing's outline out to `upTo` of its span (1: the whole wing with its scalloped primaries). */
function wingOutline(ctx, upTo) {
  ctx.beginPath();
  axesPt(0, -0.3);
  ctx.moveTo(PT[0], PT[1]);
  axesPt(0.5 * upTo, -0.55);
  const cx = PT[0];
  const cy = PT[1];
  axesPt(upTo, upTo >= 1 ? 0.1 : -0.25);
  ctx.quadraticCurveTo(cx, cy, PT[0], PT[1]);
  if (upTo >= 1) {
    // Primaries: scalloped trailing edge back toward the root
    const n = 4;
    for (let k = 1; k <= n; k++) {
      const s = 1 - (0.42 * k) / n;
      const o = 0.25 + (0.6 * k) / n;
      axesPt(s + 0.06, o + 0.14);
      const qx = PT[0];
      const qy = PT[1];
      axesPt(s, o);
      ctx.quadraticCurveTo(qx, qy, PT[0], PT[1]);
    }
  } else {
    axesPt(upTo - 0.05, 0.88);
    ctx.lineTo(PT[0], PT[1]);
  }
  axesPt(0.3, 1.05);
  const qx = PT[0];
  const qy = PT[1];
  axesPt(0.05, 1);
  ctx.quadraticCurveTo(qx, qy, PT[0], PT[1]);
  ctx.closePath();
}

// The tail fan's feather tips: [back (R), toward the belly (R)] pairs, flat
const TAIL = [1.55, -0.05, 1.4, 0.2, 1.62, 0.32, 1.45, 0.55, 1.5, 0.8];

/** A short fan of tail feathers off the hips. */
function birdTail(ctx, u, T, body) {
  const R = u.R;
  const bx = u.hip.x - u.ux * R * 0.5;
  const by = u.hip.y - u.uy * R * 0.5;
  ctx.beginPath();
  ctx.moveTo(bx + u.fwx * R * 0.5, by + u.fwy * R * 0.5);
  for (let i = 0; i < TAIL.length; i += 2) {
    const b = TAIL[i];
    const o = TAIL[i + 1];
    ctx.lineTo(u.hip.x - u.ux * R * b - u.fwx * R * o, u.hip.y - u.uy * R * b - u.fwy * R * o);
  }
  ctx.lineTo(bx - u.fwx * R * 0.6, by - u.fwy * R * 0.6);
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = T.dark;
  ctx.lineWidth = 1.1;
  ctx.stroke();
}

/** Webbed orange foot. */
function webFoot(ctx, p, f, R) {
  const k = R / 16;
  ctx.fillStyle = BEAK.leg;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 1);
  ctx.lineTo(p.x + f * 6 * k, p.y + 1.5 * k);
  ctx.lineTo(p.x + f * 4 * k, p.y + 2.6 * k);
  ctx.lineTo(p.x - f * 1.5 * k, p.y + 2 * k);
  ctx.closePath();
  ctx.fill();
}

/** A quadratic curve through two points of the current AXES frame. */
function curveB(ctx, s0, o0, s1, o1) {
  axesPt(s0, o0);
  const qx = PT[0];
  const qy = PT[1];
  axesPt(s1, o1);
  ctx.quadraticCurveTo(qx, qy, PT[0], PT[1]);
}

/**
 * The huge beak: a long orange upper bill with a hooked tip and the pouch
 * sagging under it (fuller with a bean in it, dropping open when it yells).
 * It points along the body, tipped down a little toward the belly.
 */
function drawBeak(ctx, u, hx, hy, R, held = null) {
  // (with a bean in it the head bows: the bill tips down toward the load)
  const down = held ? 0.95 : 0.6;
  let dx = u.ux * 0.8 + u.fwx * down;
  let dy = u.uy * 0.8 + u.fwy * down;
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  // Toward the belly: the pouch hangs that way
  let px = -dy;
  let py = dx;
  if (px * u.fwx + py * u.fwy < 0) {
    px = -px;
    py = -py;
  }
  const len = R * 2.15;
  const open = u.alive ? clamp(u.mouth * 2.5, 0, 0.45) : 0.25;
  // (the bill's frame: B(s, o) is s of its length out from the base and o (R) toward the belly, into PT)
  AXES.x = hx + dx * R * 0.42;
  AXES.y = hy + dy * R * 0.42;
  AXES.ax = dx * len;
  AXES.ay = dy * len;
  AXES.bx = px * R;
  AXES.by = py * R;
  const B = axesPt;
  // Pouch (the lower bill swings open about the base)
  const sag = 0.62 + open * 0.6;
  B(0, 0.12);
  const ax = PT[0];
  const ay = PT[1];
  B(0.94, 0.12 + open * 0.9);
  const tx = PT[0];
  const ty = PT[1];
  B(0.45, 0.12 + sag * 1.9);
  let cx = PT[0];
  let cy = PT[1];
  if (held) {
    // Stretched round the bean's chest: the curve's middle passes just below the hold point
    const [hpx, hpy] = u.holdPoint();
    cx = 2 * (hpx + px * R * 0.45) - (ax + tx) / 2;
    cy = 2 * (hpy + py * R * 0.45) - (ay + ty) / 2;
  }
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(cx, cy, tx, ty);
  B(0.5, 0.08 + open * 0.45);
  ctx.lineTo(PT[0], PT[1]);
  ctx.closePath();
  ctx.fillStyle = BEAK.pouch;
  ctx.fill();
  ctx.strokeStyle = BEAK.dark;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // Upper bill with a hooked nail
  ctx.beginPath();
  B(-0.05, -0.36);
  ctx.moveTo(PT[0], PT[1]);
  curveB(ctx, 0.5, -0.3, 1, -0.04);
  curveB(ctx, 1.07, 0.1, 0.98, 0.24);
  B(0.9, 0.1);
  ctx.lineTo(PT[0], PT[1]);
  B(0, 0.16);
  ctx.lineTo(PT[0], PT[1]);
  ctx.closePath();
  ctx.fillStyle = BEAK.base;
  ctx.fill();
  ctx.strokeStyle = BEAK.dark;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  B(0.1, -0.2);
  ctx.moveTo(PT[0], PT[1]);
  B(0.75, -0.14);
  ctx.lineTo(PT[0], PT[1]);
  ctx.stroke();
}

/** Two googly eyes high on the bird's head, looking along the beak. */
function birdEyes(ctx, u, hx, hy, R, T) {
  const er = R * 0.42;
  const xEyes = !u.alive && u.deadT > 0.45;
  const blink = u.alive && u.blinkT < 0;
  for (let i = 0; i < 2; i++) {
    // the near eye a little up the head and back from the beak, the far one higher and bigger
    const up = i ? 0.3 : 0.02;
    const back = i ? 0.22 : 0.36;
    const x = hx + u.ux * R * up - u.fwx * R * back;
    const y = hy + u.uy * R * up - u.fwy * R * back;
    const r = R * (i ? 0.34 : 0.3);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = Math.max(0.8, R * 0.06);
    ctx.strokeStyle = EYE_LINE;
    ctx.stroke();
    if (xEyes) {
      const k = r * 0.55;
      ctx.lineWidth = Math.max(1.2, R * 0.12);
      ctx.beginPath();
      ctx.moveTo(x - k, y - k);
      ctx.lineTo(x + k, y + k);
      ctx.moveTo(x + k, y - k);
      ctx.lineTo(x - k, y + k);
      ctx.stroke();
      continue;
    }
    const e = u.eyes[i];
    const s = r / er;
    ctx.beginPath();
    ctx.arc(x + e.ox * s, y + e.oy * s, r * 0.5, 0, TAU);
    ctx.fillStyle = '#111018';
    ctx.fill();
    if (blink) drawLid(ctx, x, y, r, u.ux, u.uy, 1, T.body);
  }
}

// --- Big Jelly ('jelly') ------------------------------------------------------------------

const JELLY_N = 14; // points per side of the dome outline
const JELLY_PTS = new Float64Array((JELLY_N + 1) * 4);

/** Half width (in R) of the jelly mould at height s (0 = its base, 1 = the top of the dome). */
function jellyWidth(s) {
  if (s < 0.06) return 1.0 + (s / 0.06) * 0.12;
  if (s < 0.62) return 1.12 - ((s - 0.06) / 0.56) * 0.2;
  const k = (s - 0.62) / 0.38;
  return 0.92 * Math.sqrt(Math.max(0, 1 - k * k));
}

/**
 * A point of the jelly at height s and across-share c (-1 left edge .. +1
 * right edge), following the bent spine (the soft hip-head rod makes it
 * lean and wobble). jig adds a ripple.
 */
function jellyAt(u, s, c, jig, out) {
  const R = u.R;
  const { hip, chest, head } = u;
  const h = -0.6 * R + s * (u.L + 1.52 * R); // distance along the body from the hips
  const t = clamp(h / u.L, 0, 1);
  const qx = 2 * chest.x - (hip.x + head.x) / 2;
  const qy = 2 * chest.y - (hip.y + head.y) / 2;
  const mt = 1 - t;
  let x = mt * mt * hip.x + 2 * mt * t * qx + t * t * head.x;
  let y = mt * mt * hip.y + 2 * mt * t * qy + t * t * head.y;
  let tx = 2 * mt * (qx - hip.x) + 2 * t * (head.x - qx);
  let ty = 2 * mt * (qy - hip.y) + 2 * t * (head.y - qy);
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl;
  ty /= tl;
  const over = h < 0 ? h : h > u.L ? h - u.L : 0;
  x += tx * over;
  y += ty * over;
  const w = R * jellyWidth(s) * (1 + jig * Math.sin(s * 9 + u.time * 13 + c * 2)) * c;
  out.x = x - ty * w;
  out.y = y + tx * w;
  return out;
}

/** Fill JELLY_PTS with the dome outline (right side up, left side down). Returns the point count. */
function jellyOutline(u) {
  const jig = u.alive ? clamp(Math.abs(u.sq) * 0.9 + u.hurtT * 0.6, 0, 0.14) : 0;
  let k = 0;
  for (let i = 0; i <= JELLY_N; i++) {
    jellyAt(u, i / JELLY_N, 1, jig, SP);
    JELLY_PTS[k++] = SP.x;
    JELLY_PTS[k++] = SP.y;
  }
  for (let i = JELLY_N; i >= 0; i--) {
    jellyAt(u, i / JELLY_N, -1, jig, SP);
    JELLY_PTS[k++] = SP.x;
    JELLY_PTS[k++] = SP.y;
  }
  return k / 2;
}

function jellyPath(ctx, n) {
  ctx.beginPath();
  ctx.moveTo(JELLY_PTS[0], JELLY_PTS[1]);
  for (let i = 1; i < n; i++) ctx.lineTo(JELLY_PTS[i * 2], JELLY_PTS[i * 2 + 1]);
  ctx.closePath();
}

/** Mould grooves down the dome and a white highlight streak on the lit side. */
function jellyRidges(ctx, u, T) {
  const R = u.R;
  ctx.lineCap = 'round';
  for (const c of [-0.55, 0, 0.55]) {
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      jellyAt(u, 0.06 + (0.78 * i) / 8, c, 0, SP);
      if (i === 0) ctx.moveTo(SP.x, SP.y);
      else ctx.lineTo(SP.x, SP.y);
    }
    ctx.globalAlpha = A0 * 0.45;
    ctx.strokeStyle = T.light;
    ctx.lineWidth = R * 0.13;
    ctx.stroke();
    ctx.globalAlpha = A0 * 0.3;
    ctx.strokeStyle = T.dark;
    ctx.lineWidth = R * 0.04;
    ctx.stroke();
  }
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    jellyAt(u, 0.3 + (0.52 * i) / 6, -0.74, 0, SP);
    if (i === 0) ctx.moveTo(SP.x, SP.y);
    else ctx.lineTo(SP.x, SP.y);
  }
  ctx.globalAlpha = A0 * 0.7;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = R * 0.14;
  ctx.stroke();
  ctx.globalAlpha = A0;
}

/** Fruit set in the jelly: a cherry and an orange slice, lagging a touch behind its wobble. */
function drawFruit(ctx, u) {
  const R = u.R;
  const lag = u.alive ? Math.sin(u.time * 5) * 0.03 : 0;
  // Cherry
  jellyAt(u, 0.3 + lag, -0.38, 0, SP);
  const cx = SP.x;
  const cy = SP.y;
  ctx.strokeStyle = '#4a7a22';
  ctx.lineWidth = R * 0.06;
  ctx.beginPath();
  ctx.moveTo(cx, cy - R * 0.22);
  ctx.quadraticCurveTo(cx + R * 0.1, cy - R * 0.5, cx + R * 0.28, cy - R * 0.55);
  ctx.stroke();
  ctx.fillStyle = '#c8102e';
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.24, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(cx - R * 0.08, cy - R * 0.08, R * 0.07, 0, TAU);
  ctx.fill();
  // Orange slice
  jellyAt(u, 0.56 - lag, 0.36, 0, SP);
  const ox = SP.x;
  const oy = SP.y;
  const r = R * 0.3;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(Math.atan2(u.uy, u.ux) + 0.6);
  ctx.fillStyle = '#ff9a1f';
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, TAU);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd27a';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, Math.PI, TAU);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ff9a1f';
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    const a = Math.PI + (i * Math.PI) / 4;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78);
  }
  ctx.stroke();
  ctx.restore();
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
