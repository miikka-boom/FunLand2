// Scavenging visuals: supply crates, the secret manhole / floor hatch, survivor
// chalk arrows, boarded doorways and the planks left after breaking them, plus
// the bright pass (glints, search ring, open burst).

import { TAU, pointInRect, rectsOverlap } from '../util.js';
import { rrect, circle } from './draw-utils.js';

const WOODS = ['#7a5a36', '#8c6a40', '#6b4e2e', '#94744a'];

/** Floors of rooms carved into city buildings (under everything). */
export function drawFloors(ctx, map, vr) {
  if (!map.floors) return;
  for (const f of map.floors) {
    if (!rectsOverlap(f, vr)) continue;
    ctx.fillStyle = '#2d2924';
    ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const horiz = f.w >= f.h;
    if (horiz) for (let y = f.y + 14; y < f.y + f.h; y += 14) { ctx.moveTo(f.x, y); ctx.lineTo(f.x + f.w, y); }
    else for (let x = f.x + 14; x < f.x + f.w; x += 14) { ctx.moveTo(x, f.y); ctx.lineTo(x, f.y + f.h); }
    ctx.stroke();
  }
}

/** Survivor chalk: an arrow toward a find, with a crate (stash) or an X (boarded room) at its tail. */
export function drawChalk(ctx, d) {
  const ca = Math.cos(d.a);
  const sa = Math.sin(d.a);
  const L = 17;
  const tx = d.x + ca * L;
  const ty = d.y + sa * L;
  const bx = d.x - ca * L;
  const by = d.y - sa * L;
  ctx.strokeStyle = 'rgba(232,232,220,0.55)';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(tx, ty);
  for (const sgn of [-1, 1]) {
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - Math.cos(d.a + sgn * 0.6) * 11, ty - Math.sin(d.a + sgn * 0.6) * 11);
  }
  const sx = bx - ca * 12;
  const sy = by - sa * 12;
  if (d.sym === 'room') {
    for (const k of [0.785, -0.785]) {
      ctx.moveTo(sx - Math.cos(d.a + k) * 6, sy - Math.sin(d.a + k) * 6);
      ctx.lineTo(sx + Math.cos(d.a + k) * 6, sy + Math.sin(d.a + k) * 6);
    }
  } else {
    // A little crate: square + one slat.
    const ux = ca * 5;
    const uy = sa * 5;
    const vx = -sa * 5;
    const vy = ca * 5;
    ctx.moveTo(sx - ux - vx, sy - uy - vy);
    ctx.lineTo(sx + ux - vx, sy + uy - vy);
    ctx.lineTo(sx + ux + vx, sy + uy + vy);
    ctx.lineTo(sx - ux + vx, sy - uy + vy);
    ctx.closePath();
    ctx.moveTo(sx - ux - vx, sy - uy - vy);
    ctx.lineTo(sx + ux + vx, sy + uy + vy);
  }
  ctx.stroke();
}

/** Stashes, secrets and loose planks (drawn under the darkness: you need light to see them). */
export function drawLoot(ctx, game, vr) {
  const L = game.loot;
  if (!L) return;
  for (const k of L.planks) {
    if (!pointInRect(k.x, k.y, vr, 40)) continue;
    ctx.save();
    ctx.translate(k.x, k.y);
    ctx.rotate(k.a);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-k.len / 2 + 2, -1, k.len, 6);
    ctx.fillStyle = WOODS[Math.floor(k.len) % WOODS.length];
    ctx.fillRect(-k.len / 2, -3, k.len, 5);
    ctx.fillStyle = 'rgba(30,20,10,0.6)';
    ctx.fillRect(-k.len / 2 + 3, -1.5, 2, 2);
    ctx.fillRect(k.len / 2 - 5, -1.5, 2, 2);
    ctx.restore();
  }
  for (const s of L.stashes) {
    if (!pointInRect(s.x, s.y, vr, 40)) continue;
    if (s.tier === 'secret') {
      if (s.look === 'hatch') drawHatch(ctx, s);
      else drawManhole(ctx, s);
    } else drawCrate(ctx, s);
  }
}

function drawCrate(ctx, s) {
  const room = s.tier === 'room';
  const w = room ? 38 : 30;
  const h = room ? 24 : 20;
  const body = room ? '#4c5966' : '#4d5b2b';
  const lid = room ? '#5e6c79' : '#606f38';
  const band = room ? '#d27a2c' : '#c9a227';
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.a || 0);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
  ctx.fillStyle = body;
  ctx.beginPath();
  rrect(ctx, -w / 2, -h / 2, w, h, 3);
  ctx.fill();
  if (!s.opened) {
    ctx.fillStyle = lid;
    ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, h * 0.42);
    ctx.fillStyle = band;
    ctx.fillRect(-3, -h / 2, 6, h);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-w / 2 + 5, -1, 4, 3);
    ctx.fillRect(w / 2 - 9, -1, 4, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-w / 2 + 5, h / 2 - 6, 8, 2);
  } else {
    // Emptied: dark inside, lid flipped back.
    ctx.fillStyle = '#15160f';
    ctx.fillRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
    ctx.fillStyle = lid;
    ctx.fillRect(-w / 2, -h / 2 - h * 0.48, w, h * 0.44);
    ctx.fillStyle = band;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(-3, -h / 2 - h * 0.48, 6, h * 0.44);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** City secret: a manhole cover pushed slightly off its hole. */
function drawManhole(ctx, s) {
  const R = 12;
  const off = s.opened ? 22 : 4;
  const cx = s.x + Math.cos(s.a) * off;
  const cy = s.y + Math.sin(s.a) * off;
  ctx.fillStyle = '#040405';
  ctx.beginPath();
  circle(ctx, s.x, s.y, R);
  ctx.fill();
  ctx.fillStyle = '#3a3d41';
  ctx.beginPath();
  circle(ctx, cx, cy, R);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  circle(ctx, cx, cy, R - 1);
  ctx.moveTo(cx - 7, cy - 3);
  ctx.lineTo(cx + 7, cy - 3);
  ctx.moveTo(cx - 7, cy + 3);
  ctx.lineTo(cx + 7, cy + 3);
  ctx.stroke();
}

/** Building secret: a floor hatch left ajar. */
function drawHatch(ctx, s) {
  const S = 26;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(Math.round(s.a / (Math.PI / 2)) * (Math.PI / 2));
  ctx.fillStyle = '#040405';
  ctx.fillRect(-S / 2, -S / 2, S, S);
  const off = s.opened ? S + 2 : 4;
  ctx.fillStyle = '#464a4f';
  ctx.fillRect(-S / 2 + off, -S / 2, S, S);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let k = -S / 2 + 5; k < S / 2; k += 6) {
    ctx.moveTo(-S / 2 + off + 2, k);
    ctx.lineTo(S / 2 + off - 2, k);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-S / 2 + off + 2, -S / 2 + 2, 3, 3);
  ctx.fillRect(S / 2 + off - 5, S / 2 - 5, 3, 3);
  ctx.restore();
}

/** Planks nailed across a doorway (roof pass). Fewer planks as they take damage. */
export function drawBoards(ctx, o, t) {
  const vert = o.vertical;
  const n = Math.max(1, Math.ceil((o.hp / o.maxHp) * 4));
  const wob = o.hitT > 0 ? Math.sin(t * 70) * o.hitT * 10 : 0;
  ctx.fillStyle = '#0b0a09';
  ctx.fillRect(o.x, o.y, o.w, o.h);
  ctx.save();
  ctx.translate(o.x + o.w / 2 + (vert ? wob : 0), o.y + o.h / 2 + (vert ? 0 : wob));
  if (vert) ctx.rotate(Math.PI / 2);
  const len = (vert ? o.h : o.w) + 12;
  const th = vert ? o.w : o.h;
  const angles = [-0.16, 0.13, -0.05, 0.2];
  const offs = [-th * 0.22, th * 0.18, -th * 0.02, th * 0.3];
  for (let k = 0; k < n; k++) {
    ctx.save();
    ctx.translate(0, offs[k]);
    ctx.rotate(angles[k]);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-len / 2 + 1, -1.5, len, 6);
    ctx.fillStyle = WOODS[k];
    ctx.fillRect(-len / 2, -2.5, len, 5);
    ctx.fillStyle = 'rgba(25,18,10,0.7)';
    ctx.fillRect(-len / 2 + 3, -1, 2, 2);
    ctx.fillRect(len / 2 - 5, -1, 2, 2);
    ctx.restore();
  }
  ctx.restore();
}

/** Bright pass: glints you can spot in the dark (with line of sight), the search ring, the open burst. */
export function drawLootBright(ctx, game, vr) {
  const L = game.loot;
  if (!L) return;
  const t = game.time;
  const p = game.player;
  const W = game.world;
  for (const s of L.stashes) {
    if (!pointInRect(s.x, s.y, vr, 30)) continue;
    if (s.opened) {
      if (s.openT < 0.7) {
        const k = s.openT / 0.7;
        ctx.strokeStyle = s.tier === 'secret' ? `rgba(220,180,255,${1 - k})` : `rgba(255,220,130,${1 - k})`;
        ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath();
        circle(ctx, s.x, s.y, 12 + k * 70);
        ctx.stroke();
      }
      continue;
    }
    if (s.search > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      circle(ctx, s.x, s.y, 25);
      ctx.stroke();
      ctx.strokeStyle = s.tier === 'secret' ? '#d9b3ff' : '#ffd36a';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 25, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, s.search));
      ctx.stroke();
    }
    const secret = s.tier === 'secret';
    const period = secret ? 3.8 : 2.6;
    const ph = ((t + s.id * 0.731) % period) / period;
    const win = secret ? 0.07 : 0.1;
    if (ph >= win) continue;
    if (!W.segmentClear(p.x, p.y, s.x, s.y)) continue;
    const k = Math.sin((ph / win) * Math.PI);
    const gx = s.x + (secret ? 4 : -9);
    const gy = s.y + (secret ? -4 : -7);
    const size = (secret ? 7 : 10) * k;
    ctx.strokeStyle = secret ? `rgba(235,215,255,${0.9 * k})` : `rgba(255,248,215,${0.95 * k})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(gx - size, gy);
    ctx.lineTo(gx + size, gy);
    ctx.moveTo(gx, gy - size);
    ctx.lineTo(gx, gy + size);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${k})`;
    ctx.beginPath();
    circle(ctx, gx, gy, 1.6 * k + 0.4);
    ctx.fill();
  }
}
