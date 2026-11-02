// Draws the beans, their weapons, arrows and dropped gear. ctx is already in
// world space (camera applied). Everything reads straight from the sim.

import { TEAMS } from '../config.js';
import { WEAPONS } from '../sim/unit-types.js';
import { itemShieldFrame } from '../sim/battle.js';

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
  constructor() {
    this.trails = new Map(); // unit id -> recent weapon tip positions
  }

  /** Ground shadows for every unit and item (drawn before anything stands on the grass). */
  drawShadows(ctx, battle) {
    ctx.fillStyle = 'rgba(28, 52, 12, 0.28)';
    ctx.beginPath();
    for (const u of battle.units) {
      const h = clamp((u.ground - u.hip.y - u.standH) / 160, 0, 1);
      const rx = u.R * (u.alive ? 1.25 : 1.6) * (1 - h * 0.5);
      const cx = (u.hip.x + u.head.x * (u.alive ? 0 : 1)) / (u.alive ? 1 : 2);
      ctx.moveTo(cx + rx, u.ground + 1.5);
      ctx.ellipse(cx, u.ground + 1.5, rx, 3.6 * (1 - h * 0.6), 0, 0, TAU);
    }
    ctx.fill();
  }

  drawGroundArrows(ctx, battle) {
    for (const a of battle.arrows) {
      if (a.state !== 'ground') continue;
      const pz = battle.arrowPose(a);
      drawArrow(ctx, pz.x, pz.y, pz.ang, a.team, a.alpha ?? 1, 0);
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
    for (const it of battle.items) {
      if (it.kind === 'club') drawClub(ctx, it.a.x, it.a.y, it.b.x, it.b.y);
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
          if (pz) drawArrow(ctx, pz.x, pz.y, pz.ang, ar.team, 1, 6);
        }
      }
    }
  }

  drawUnits(ctx, battle, time) {
    // Corpses first, then the living, each back-to-front by lane
    for (let pass = 0; pass < 2; pass++) {
      for (const u of battle.units) {
        if ((pass === 0) === u.alive) continue;
        this.drawUnit(ctx, u, battle, time);
      }
    }
  }

  drawUnit(ctx, u, battle, time) {
    const T = TEAMS[u.team];
    const f = u.f;
    const R = u.R;
    const hip = u.hip;
    const chest = u.chest;
    const head = u.head;
    const mi = u.mainHand;
    const oi = 1 - mi;
    const limbW = R * 0.3;
    const farCol = T.shade;
    const nearCol = T.limb;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // --- far side: legs, far arm, sword (in far hand) -----------------------
    drawLimb(ctx, hip, u.knee[0], u.foot[0], farCol, limbW * 1.1);
    drawFoot(ctx, u.foot[0], f, T.dark);
    drawLimb(ctx, hip, u.knee[1], u.foot[1], nearCol, limbW * 1.1);
    drawFoot(ctx, u.foot[1], f, T.dark);

    if (u.type.weapon === 'club' && u.tip) {
      // Off hand behind on the shaft
      drawLimb(ctx, chest, u.elbow[oi], u.hand[oi], farCol, limbW);
    } else {
      drawLimb(ctx, chest, u.elbow[0], u.hand[0], farCol, limbW);
      drawHand(ctx, u.hand[0], farCol);
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
    this.drawBean(ctx, u, T);
    if (u.type.shield) drawHelmet(ctx, u);
    this.drawFace(ctx, u, T, time);

    // --- near side: arm + held item ---------------------------------------------
    if (u.type.weapon === 'club' && u.tip) {
      this.trail(ctx, u, time);
      drawClub(ctx, u.hand[mi].x, u.hand[mi].y, u.tip.x, u.tip.y);
      drawLimb(ctx, chest, u.elbow[mi], u.hand[mi], nearCol, limbW);
      drawHand(ctx, u.hand[mi], nearCol);
      drawHand(ctx, u.hand[oi], farCol);
    } else if (u.type.shield) {
      drawLimb(ctx, chest, u.elbow[oi], u.hand[oi], nearCol, limbW);
      drawHand(ctx, u.hand[oi], nearCol);
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
      drawHand(ctx, u.hand[1], nearCol);
    } else {
      drawLimb(ctx, chest, u.elbow[1], u.hand[1], nearCol, limbW);
      drawHand(ctx, u.hand[1], nearCol);
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
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = R * 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
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
    // Body-frame point near the head -> world (with the same squash as the body)
    const P = (fw, up) => [head.x + fx * fw + ux * up, head.y + fy * fw + uy * up];
    const er = R * 0.42;
    const eyes = [
      { p: P(R * 0.22, R * 0.14), r: er * 0.9 },
      { p: P(R * 0.74, R * 0.04), r: er },
    ];
    // Dead: eyes stay open in shock for a beat, then the lids droop
    const blink = u.alive ? (u.blinkT < 0 ? 1 : 0) : u.deadT > 0.45 ? 0.55 : 0;
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
      ctx.globalAlpha = Math.min(1, u.brow * 1.5);
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
      ctx.globalAlpha = 1;
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
      ctx.lineWidth = (u.type.weapon === 'club' ? 9 : 4) * k;
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

function drawHand(ctx, h, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(h.x, h.y, 2.7, 0, TAU);
  ctx.fill();
}

function drawFoot(ctx, p, f, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(p.x + f * 2.2, p.y + 0.5, 4, 2.3, 0, 0, TAU);
  ctx.fill();
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
  if (alpha < 1) ctx.globalAlpha = alpha;
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
  if (alpha < 1) ctx.globalAlpha = 1;
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
