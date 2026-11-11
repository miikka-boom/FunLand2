// Scavenging visuals: supply crates (3D), the secret manhole / floor hatch,
// survivor chalk arrows, the planks left after breaking boards, plus the
// bright pass (glints, search ring, open burst). The boards themselves are an
// obstacle model (models.js).

import { TAU, pointInRect, rectsOverlap } from '../util.js';
import { circle } from './draw-utils.js';
import { prism, polygon, turnedRect, tone, ball } from './prims.js';

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

/** What lies flat: loose planks and the secret's cover (under the darkness: you need light to see them). */
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
    if (s.tier !== 'secret' || !pointInRect(s.x, s.y, vr, 40)) continue;
    if (s.look === 'hatch') drawHatch(ctx, s);
    else drawManhole(ctx, s);
  }
}

const crate = new Float64Array(8);
const lid = new Float64Array(8);

/** A supply crate at brightness b: olive (stash) or steel blue (boarded room), a coloured band, the lid thrown back once it's open. */
export function drawStash(R, s, b) {
  const { ctx, v } = R;
  const room = s.tier === 'room';
  const w = room ? 38 : 30;
  const h = room ? 24 : 20;
  const H = room ? 17 : 14;
  const body = room ? '#4c5966' : '#4d5b2b';
  const top = room ? '#5e6c79' : '#606f38';
  const band = room ? '#d27a2c' : '#c9a227';
  const a = s.a || 0;
  const side = (nx, ny) => tone(body, b * (0.62 + 0.3 * Math.max(0, nx * R.lx + ny * R.ly)));
  turnedRect(s.x, s.y, w, h, a, crate);
  if (s.opened) {
    // Emptied: dark inside, the lid lying behind it.
    prism(ctx, v, crate, 0, H, tone(body, b), side);
    turnedRect(s.x, s.y, w - 6, h - 6, a, lid);
    ctx.fillStyle = '#12130d';
    ctx.beginPath();
    polygon(ctx, v, lid, H);
    ctx.fill();
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    turnedRect(s.x + sa * h * 0.95, s.y - ca * h * 0.95, w, h * 0.8, a, lid);
    prism(ctx, v, lid, 0, 3, tone(top, b * 0.9), side);
    return;
  }
  prism(ctx, v, crate, 0, H, tone(top, b), side);
  // The band over the lid and down the front, and the latches.
  turnedRect(s.x, s.y, 6, h + 0.6, a, lid);
  prism(ctx, v, lid, 0, H + 0.4, tone(band, b), (nx, ny) => tone(band, b * (0.62 + 0.3 * Math.max(0, nx * R.lx + ny * R.ly))));
  ctx.fillStyle = tone('#f0ead8', b * 0.75);
  ctx.beginPath();
  ball(ctx, v, s.x + Math.cos(a) * w * 0.3, s.y + Math.sin(a) * w * 0.3, H + 0.5, 1.6);
  ball(ctx, v, s.x - Math.cos(a) * w * 0.3, s.y - Math.sin(a) * w * 0.3, H + 0.5, 1.6);
  ctx.fill();
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

/**
 * Bright pass: glints you can spot in the dark (with line of sight), the
 * search ring, the open burst. Called with the plain screen transform.
 */
export function drawLootBright(R, game, vr) {
  const L = game.loot;
  if (!L) return;
  const { ctx, v } = R;
  const t = game.time;
  const p = game.player;
  const W = game.world;
  for (const s of L.stashes) {
    if (!pointInRect(s.x, s.y, vr, 30)) continue;
    if (s.opened) {
      if (s.openT < 0.7) {
        const k = s.openT / 0.7;
        R.ground(0);
        ctx.strokeStyle = s.tier === 'secret' ? `rgba(220,180,255,${1 - k})` : `rgba(255,220,130,${1 - k})`;
        ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath();
        circle(ctx, s.x, s.y, 12 + k * 70);
        ctx.stroke();
        R.reset();
      }
      continue;
    }
    if (s.search > 0) {
      R.ground(0);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      circle(ctx, s.x, s.y, 25);
      ctx.stroke();
      ctx.strokeStyle = s.tier === 'secret' ? '#d9b3ff' : '#ffd36a';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 25, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, s.search));
      ctx.stroke();
      R.reset();
    }
    const secret = s.tier === 'secret';
    const period = secret ? 3.8 : 2.6;
    const ph = ((t + s.id * 0.731) % period) / period;
    const win = secret ? 0.07 : 0.1;
    if (ph >= win) continue;
    if (!W.segmentClear(p.x, p.y, s.x, s.y)) continue;
    const k = Math.sin((ph / win) * Math.PI);
    // The glint sits on the crate's lid (or on the cover of the secret).
    const gx = v.px(s.x + (secret ? 4 : -6), s.y + (secret ? -4 : -4));
    const gy = v.py(s.x + (secret ? 4 : -6), s.y + (secret ? -4 : -4), secret ? 1 : 15);
    const size = (secret ? 7 : 10) * k * Math.max(0.8, v.scale);
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
    ctx.arc(gx, gy, 1.6 * k + 0.4, 0, TAU);
    ctx.fill();
  }
}
