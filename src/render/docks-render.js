// Pier 9 (docks level): water and piers, the quay apron and container yard
// (ground), what's painted on container roofs, and the big things that carry
// their own lights and need to read from far off: the gantry cranes, the
// ferry and its gangway, the flare. Containers, crane legs, bollards and the
// like are obstacle models (models.js).

import { FONT, circle, hash01 } from './draw-utils.js';
import { TAU, rectsOverlap } from '../util.js';
import { FERRY, flarePos } from '../game/finale.js';
import { drawEyes, benText } from './ben-render.js';
import { box, cylinder, prism, polygon, tone, ball, line3, quad3 } from './prims.js';

const WATER = '#0a1720';
const PLANK = '#4b3c2d';
/** How far the water lies below the quay and the pier decks. */
export const WATER_Z = -22;

// --- Ground ------------------------------------------------------------------------------

export function drawDocksGround(ctx, game, vr) {
  const map = game.world.map;
  const t = game.time;
  const view = game.view;
  // A drop of d below the ground is, on screen, the same as this step over the ground toward the camera.
  const drop = -WATER_Z * view.cot;
  const dx = view.gx * drop;
  const dy = view.gy * drop;
  // Concrete: the container yard and the quay apron.
  for (const [r, c] of [[map.yard, '#2f3134'], [map.apron, '#36383b']]) {
    if (!rectsOverlap(r, vr)) continue;
    ctx.fillStyle = c;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  // Slab joints on the apron.
  const A = map.apron;
  if (rectsOverlap(A, vr)) {
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const y0 = Math.max(A.y, Math.floor(vr.y / 120) * 120);
    for (let y = y0; y < Math.min(A.y + A.h, vr.y + vr.h); y += 120) {
      ctx.moveTo(A.x, y);
      ctx.lineTo(A.x + A.w, y);
    }
    ctx.stroke();
  }
  // Open water (and on past the east edge of the map).
  ctx.fillStyle = WATER;
  for (const w of map.water) if (rectsOverlap(w, vr)) ctx.fillRect(w.x, w.y, w.w, w.h);
  const sea = { x: map.w, y: -400, w: 600, h: map.h + 800 };
  if (rectsOverlap(sea, vr)) ctx.fillRect(sea.x, sea.y, sea.w, sea.h);
  if (drop > 0.5 && view.faceX > 0 && map.water.length) {
    // Seen from the sea side: the quay wall.
    const qx0 = map.water[0].x;
    ctx.fillStyle = '#1a1c1f';
    ctx.beginPath();
    ctx.moveTo(qx0, 0);
    ctx.lineTo(qx0, map.h);
    ctx.lineTo(qx0 + dx, map.h + dy);
    ctx.lineTo(qx0 + dx, dy);
    ctx.closePath();
    ctx.fill();
  }
  // Swell: short pale strokes drifting on the water (only what's on screen).
  ctx.strokeStyle = 'rgba(120,170,200,0.10)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const qx = map.water.length ? map.water[0].x : map.w;
  const sx0 = Math.max(qx, Math.floor(vr.x / 70) * 70);
  const sy0 = Math.floor(vr.y / 46) * 46;
  for (let x = sx0; x < vr.x + vr.w; x += 70) {
    for (let y = sy0; y < vr.y + vr.h; y += 46) {
      const h = hash01(x * 0.013 + y * 0.071);
      const ox = x + h * 50 + Math.sin(t * 0.6 + h * 9) * 10;
      const oy = y + Math.cos(t * 0.8 + h * 7) * 4;
      if (onLand(map, ox, oy)) continue;
      const L = 8 + h * 14;
      ctx.moveTo(ox - L / 2 + dx, oy + dy);
      ctx.quadraticCurveTo(ox + dx, oy - 3 + dy, ox + L / 2 + dx, oy + dy);
    }
  }
  ctx.stroke();
  // Piers: the side that faces the camera drops to the water on its pilings; deck planks, edge beams.
  for (const p of map.piers) {
    const R = { x: p.x - 40, y: p.y - 40, w: p.w + 80, h: p.h + 80 };
    if (!rectsOverlap(R, vr)) continue;
    if (drop > 0.5) {
      ctx.fillStyle = '#14100c';
      ctx.beginPath();
      if (view.faceY) {
        const y = view.faceY > 0 ? p.y + p.h : p.y;
        ctx.moveTo(p.x, y);
        ctx.lineTo(p.x + p.w, y);
        ctx.lineTo(p.x + p.w + dx, y + dy);
        ctx.lineTo(p.x + dx, y + dy);
        ctx.closePath();
      }
      if (view.faceX > 0) {
        const x = p.x + p.w;
        ctx.moveTo(x, p.y);
        ctx.lineTo(x, p.y + p.h);
        ctx.lineTo(x + dx, p.y + p.h + dy);
        ctx.lineTo(x + dx, p.y + dy);
        ctx.closePath();
      }
      ctx.fill();
      if (view.faceY) {
        // Pilings, and the beam under the deck's edge.
        const y = view.faceY > 0 ? p.y + p.h : p.y;
        ctx.fillStyle = '#2b2219';
        ctx.beginPath();
        for (let x = p.x + 30; x < p.x + p.w; x += 70) {
          ctx.moveTo(x - 6, y);
          ctx.lineTo(x + 6, y);
          ctx.lineTo(x + 6 + dx * 1.15, y + dy * 1.15);
          ctx.lineTo(x - 6 + dx * 1.15, y + dy * 1.15);
          ctx.closePath();
        }
        ctx.fill();
        ctx.fillStyle = '#33291f';
        ctx.beginPath();
        ctx.moveTo(p.x, y);
        ctx.lineTo(p.x + p.w, y);
        ctx.lineTo(p.x + p.w + dx * 0.2, y + dy * 0.2);
        ctx.lineTo(p.x + dx * 0.2, y + dy * 0.2);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#1b1712';
      for (let x = p.x + 30; x < p.x + p.w; x += 70) {
        for (const y of [p.y - 5, p.y + p.h + 5]) {
          ctx.beginPath();
          circle(ctx, x, y, 6);
          ctx.fill();
        }
      }
    }
    ctx.fillStyle = PLANK;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const x0 = Math.max(p.x, Math.floor(vr.x / 16) * 16);
    for (let x = x0; x < Math.min(p.x + p.w, vr.x + vr.w); x += 16) {
      ctx.moveTo(x, p.y);
      ctx.lineTo(x, p.y + p.h);
    }
    ctx.stroke();
    // A few darker boards.
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let x = x0; x < Math.min(p.x + p.w, vr.x + vr.w); x += 16) if (hash01(x * 0.37 + p.y) < 0.18) ctx.fillRect(x, p.y, 16, p.h);
    ctx.fillStyle = '#2e251c';
    ctx.fillRect(p.x, p.y, p.w, 6);
    ctx.fillRect(p.x, p.y + p.h - 6, p.w, 6);
    ctx.fillRect(p.x + p.w - 6, p.y, 6, p.h);
  }
  // Long markings: crane rails, the quay edge, loading-dock stripes.
  for (const L of map.lines) {
    if (L.type === 'rail') {
      if (L.x < vr.x - 10 || L.x > vr.x + vr.w + 10) continue;
      ctx.fillStyle = '#4d4f52';
      ctx.fillRect(L.x - 4, Math.max(L.y0, vr.y), 3, Math.min(L.y1, vr.y + vr.h) - Math.max(L.y0, vr.y));
      ctx.fillRect(L.x + 1, Math.max(L.y0, vr.y), 3, Math.min(L.y1, vr.y + vr.h) - Math.max(L.y0, vr.y));
    } else if (L.type === 'quayedge') {
      if (L.x < vr.x - 20 || L.x > vr.x + vr.w + 20) continue;
      const ya = Math.max(L.y0, vr.y);
      const yb = Math.min(L.y1, vr.y + vr.h);
      ctx.fillStyle = 'rgba(214,170,40,0.55)';
      ctx.fillRect(L.x - 12, ya, 4, yb - ya);
      ctx.fillStyle = '#26282b';
      ctx.fillRect(L.x - 6, ya, 6, yb - ya);
    } else if (L.type === 'dockedge') {
      if (!rectsOverlap(L, vr)) continue;
      // Yellow/black stripes along the loading edge.
      const horiz = L.side === 'top' || L.side === 'bottom';
      const ex = L.side === 'right' ? L.x : L.side === 'left' ? L.x + L.w - 8 : L.x;
      const ey = L.side === 'bottom' ? L.y : L.side === 'top' ? L.y + L.h - 8 : L.y;
      ctx.save();
      ctx.beginPath();
      ctx.rect(ex, ey, horiz ? L.w : 8, horiz ? 8 : L.h);
      ctx.clip();
      ctx.fillStyle = 'rgba(200,160,40,0.5)';
      ctx.fillRect(ex, ey, horiz ? L.w : 8, horiz ? 8 : L.h);
      ctx.strokeStyle = 'rgba(20,20,20,0.6)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      const len = horiz ? L.w : L.h;
      for (let k = -10; k < len + 10; k += 16) {
        if (horiz) {
          ctx.moveTo(ex + k, ey + 8);
          ctx.lineTo(ex + k + 8, ey);
        } else {
          ctx.moveTo(ex, ey + k + 8);
          ctx.lineTo(ex + 8, ey + k);
        }
      }
      ctx.stroke();
      ctx.restore();
    }
  }
}

function onLand(map, x, y) {
  for (const p of map.piers) if (x > p.x - 6 && x < p.x + p.w + 6 && y > p.y - 8 && y < p.y + p.h + 8) return true;
  return false;
}

/** Ground decor that only the docks have. Returns true if it drew it. */
export function drawDocksDecor(ctx, d, t, view = null) {
  switch (d.type) {
    case 'paint': {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.a || 0);
      ctx.font = `900 ${d.size}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(225,215,190,0.22)';
      ctx.fillText(d.text, 0, 0);
      ctx.restore();
      return true;
    }
    case 'oil':
      ctx.fillStyle = 'rgba(8,8,10,0.35)';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, 22 * d.s, 13 * d.s, d.a, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(90,70,120,0.08)';
      ctx.beginPath();
      ctx.ellipse(d.x - 4, d.y - 2, 10 * d.s, 5 * d.s, d.a, 0, TAU);
      ctx.fill();
      return true;
    case 'rope': {
      ctx.strokeStyle = 'rgba(190,170,120,0.55)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, (5 + k * 3) * d.s, 0, TAU);
        ctx.stroke();
      }
      return true;
    }
    case 'fishbox':
      ctx.fillStyle = 'rgba(70,110,140,0.75)';
      ctx.fillRect(d.x - 10 * d.s, d.y - 7 * d.s, 20 * d.s, 14 * d.s);
      ctx.fillStyle = 'rgba(200,210,215,0.35)';
      ctx.fillRect(d.x - 7 * d.s, d.y - 4 * d.s, 14 * d.s, 8 * d.s);
      return true;
    case 'nets':
      ctx.strokeStyle = 'rgba(120,140,110,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = -2; k <= 2; k++) {
        ctx.moveTo(d.x - 22 * d.s, d.y + k * 6 * d.s);
        ctx.lineTo(d.x + 22 * d.s, d.y + k * 6 * d.s + 4);
        ctx.moveTo(d.x + k * 8 * d.s, d.y - 14 * d.s);
        ctx.lineTo(d.x + k * 8 * d.s + 3, d.y + 14 * d.s);
      }
      ctx.stroke();
      return true;
    case 'boat': {
      // A small moored workboat, bobbing.
      const bob = Math.sin(t * 1.3 + d.x) * 1.5;
      const low = view ? -WATER_Z * view.cot : 0; // it floats on the water, below the quay
      ctx.save();
      ctx.translate(d.x + (view ? view.gx * low : 0), d.y + bob + (view ? view.gy * low : 0));
      ctx.scale(d.s, d.s);
      ctx.fillStyle = '#141a1f';
      ctx.beginPath();
      ctx.ellipse(3, 4, 64, 22, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.moveTo(-62, 0);
      ctx.quadraticCurveTo(-40, -20, 30, -18);
      ctx.lineTo(56, -6);
      ctx.lineTo(56, 6);
      ctx.lineTo(30, 18);
      ctx.quadraticCurveTo(-40, 20, -62, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(-10, -10, 34, 20);
      ctx.fillStyle = '#d8d3c6';
      ctx.fillRect(-6, -8, 20, 16);
      ctx.restore();
      return true;
    }
    default:
      return false;
  }
}

// --- What's painted on a container stack's roofs (in world coordinates on the top plane) ---------

export function drawContainerTop(ctx, o) {
  const n = o.n || 1;
  const horiz = o.dir !== 'v';
  const size = horiz ? o.h / n : o.w / n;
  for (let k = 0; k < n; k++) {
    const x = horiz ? o.x : o.x + k * size;
    const y = horiz ? o.y + k * size : o.y;
    const w = horiz ? o.w : size;
    const h = horiz ? size : o.h;
    // Corrugated roof: ribs across the box.
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (horiz) for (let p = x + 8; p < x + w - 4; p += 9) { ctx.moveTo(p, y + 3); ctx.lineTo(p, y + h - 3); }
    else for (let p = y + 8; p < y + h - 4; p += 9) { ctx.moveTo(x + 3, p); ctx.lineTo(x + w - 3, p); }
    ctx.stroke();
    // Corner castings.
    ctx.fillStyle = 'rgba(20,20,20,0.6)';
    for (const [cx, cy] of [[x, y], [x + w - 5, y], [x, y + h - 5], [x + w - 5, y + h - 5]]) ctx.fillRect(cx, cy, 5, 5);
  }
  // A painted box number on one of them.
  const k = Math.floor(hash01(o.seed) * n);
  const cx = horiz ? o.x + o.w / 2 : o.x + (k + 0.5) * size;
  const cy = horiz ? o.y + (k + 0.5) * size : o.y + o.h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  if (!horiz) ctx.rotate(Math.PI / 2);
  ctx.font = `800 ${Math.round(size * 0.32)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(240,235,220,0.35)';
  ctx.fillText(`HLV ${String(Math.floor(hash01(o.seed + 3) * 9000) + 1000)}`, 0, 1);
  ctx.restore();
}

/** Warehouse roofs: long corrugation ridges; the ferry ticket booth says what it is. */
export function drawWarehouseRidges(ctx, o) {
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (o.w >= o.h) for (let y = o.y + 14; y < o.y + o.h - 8; y += 14) { ctx.moveTo(o.x + 4, y); ctx.lineTo(o.x + o.w - 4, y); }
  else for (let x = o.x + 14; x < o.x + o.w - 8; x += 14) { ctx.moveTo(x, o.y + 4); ctx.lineTo(x, o.y + o.h - 4); }
  ctx.stroke();
  if (o.booth) {
    ctx.font = `800 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,230,170,0.75)';
    ctx.fillText('FERRY', o.x + o.w / 2, o.y + o.h / 2 - 7);
    ctx.fillStyle = 'rgba(255,230,170,0.55)';
    ctx.fillText('TICKETS', o.x + o.w / 2, o.y + o.h / 2 + 8);
  }
}

// --- The gantry cranes (their legs are obstacles; this is everything they carry) ----------------

/** Drawn after the things on the ground: the girders are far overhead. */
export function drawCranes(R, game, vr, H) {
  const map = game.world.map;
  if (map.theme !== 'docks') return;
  const { ctx, v } = R;
  const t = game.time;
  map.cranes.forEach((c, i) => {
    const bx1 = c.x1 + c.boom;
    const my = (c.y + c.y1) / 2;
    const boxR = { x: c.x0 - 70, y: c.y - 30, w: bx1 - c.x0 + 100, h: c.y1 - c.y + 60 };
    // On screen it sits far above its feet: cull by where it shows, not by where it stands.
    const sxa = v.px(boxR.x, boxR.y + boxR.h);
    const sxb = v.px(boxR.x + boxR.w, boxR.y);
    const sya = v.py(boxR.x + boxR.w, boxR.y, H + 110);
    const syb = v.py(boxR.x, boxR.y + boxR.h, 0);
    if (Math.max(sxa, sxb) < -40 || Math.min(sxa, sxb) > v.w + 40 || Math.min(sya, syb) > v.h + 40 || Math.max(sya, syb) < -40) return;
    const k = R.roofK;
    if (v.flat) {
      // From straight above: the old plan view.
      R.ground(0);
      ctx.globalAlpha = R.night ? 0.78 : 1;
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(c.x0, c.y); ctx.lineTo(c.x1, c.y);
      ctx.moveTo(c.x0, c.y1); ctx.lineTo(c.x1, c.y1);
      ctx.moveTo(c.x0, c.y); ctx.lineTo(c.x0, c.y1);
      ctx.moveTo(c.x1, c.y); ctx.lineTo(c.x1, c.y1);
      ctx.stroke();
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x0 - 60, my - 11, bx1 - c.x0 + 60, 22);
      ctx.fillStyle = '#3f4246';
      ctx.fillRect(c.x0 - 46, my - 22, 46, 44);
      ctx.globalAlpha = 1;
      R.reset();
      return;
    }
    // See through it while it's over you.
    const over = R.hides({ x: c.x0 - 60, y: my - 26, w: bx1 - c.x0 + 60, h: 52 }, H + 4, H + 70) || R.hides({ x: c.x0 - 10, y: c.y - 10, w: c.x1 - c.x0 + 20, h: c.y1 - c.y + 20 }, H - 6, H + 8);
    ctx.globalAlpha = over ? 0.3 : 1;
    const col = tone(c.color, k);
    const dark = tone(c.color, k * 0.7);
    ctx.lineCap = 'butt';
    // Portal: girders along each pair of legs, the cross beams, bracing.
    ctx.strokeStyle = dark;
    ctx.lineWidth = 9 * v.scale;
    ctx.beginPath();
    line3(ctx, v, c.x0, c.y, H, c.x0, c.y1, H);
    line3(ctx, v, c.x1, c.y, H, c.x1, c.y1, H);
    ctx.stroke();
    ctx.lineWidth = 2.4 * v.scale;
    ctx.beginPath();
    line3(ctx, v, c.x0, c.y, H, c.x1, c.y1, H);
    line3(ctx, v, c.x1, c.y, H, c.x0, c.y1, H);
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = 10 * v.scale;
    ctx.beginPath();
    line3(ctx, v, c.x0, c.y, H, c.x1, c.y, H);
    line3(ctx, v, c.x0, c.y1, H, c.x1, c.y1, H);
    ctx.stroke();
    // The boom: a long truss reaching east past the quay edge, the machinery house on its landward end.
    const bz0 = H + 10;
    const bz1 = H + 30;
    box(ctx, v, c.x0 - 60, my - 10, bx1, my + 10, bz0, bz1, tone(c.color, k * 1.1), dark, tone(c.color, k * 0.9));
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const yf = v.faceY > 0 ? my + 10 : my - 10;
    for (let x = c.x0 - 60; x < bx1 - 10; x += 26) {
      line3(ctx, v, x, yf, bz0, x + 13, yf, bz1);
      line3(ctx, v, x + 13, yf, bz1, x + 26, yf, bz0);
    }
    ctx.stroke();
    box(ctx, v, c.x0 - 50, my - 24, c.x0 + 4, my + 24, bz1, bz1 + 34, tone('#4a4d52', k), tone('#2b2d30', k), tone('#3a3d41', k));
    R.ground(bz1 + 34);
    ctx.font = `900 22px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(235,230,215,0.55)';
    ctx.fillText(String(i + 1), c.x0 - 23, my + 1);
    R.reset();
    // The mast and the stays that hold the boom up.
    ctx.strokeStyle = col;
    ctx.lineWidth = 4 * v.scale;
    ctx.beginPath();
    line3(ctx, v, c.x1, my - 8, bz1, c.x1, my, bz1 + 86);
    line3(ctx, v, c.x1, my + 8, bz1, c.x1, my, bz1 + 86);
    ctx.stroke();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.6 * v.scale;
    ctx.beginPath();
    line3(ctx, v, c.x1, my, bz1 + 86, bx1 - 12, my, bz1);
    line3(ctx, v, c.x1, my, bz1 + 86, c.x1 + c.boom * 0.5, my, bz1);
    line3(ctx, v, c.x1, my, bz1 + 86, c.x0 - 40, my, bz1 + 34);
    ctx.stroke();
    // The trolley creeping along the boom, its spreader hanging.
    const tx = c.x1 + c.boom * (0.4 + 0.3 * Math.sin(t * 0.07 + c.y));
    ctx.strokeStyle = 'rgba(20,20,22,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const s of [-9, 9]) line3(ctx, v, tx + s, my, bz0 - 8, tx + s, my, H - 70);
    ctx.stroke();
    box(ctx, v, tx - 14, my - 14, tx + 14, my + 14, bz0 - 12, bz0, tone('#34373b', k), tone('#1c1e21', k), tone('#26282b', k));
    box(ctx, v, tx - 30, my - 12, tx + 30, my + 12, H - 76, H - 70, tone('#c9a227', k), tone('#7a6418', k), tone('#a3841e', k));
    const ben = (map.benRoof || []).find((e) => e.type === 'boom' && e.crane === i);
    if (ben) {
      R.ground(bz1 + 0.5);
      benText(ctx, ben, R.night, c.x1 + c.boom * 0.55, my, 12, 0);
      R.reset();
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    // Red aircraft-warning light at the tip.
    if (Math.sin(t * 2.4 + c.y) > 0.2) {
      const lx = v.px(bx1 - 6, my);
      const ly = v.py(bx1 - 6, my, bz1 + 4);
      ctx.fillStyle = 'rgba(255,60,50,0.95)';
      ctx.beginPath();
      ctx.arc(lx, ly, 3.5, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 26);
      g.addColorStop(0, 'rgba(255,60,50,0.4)');
      g.addColorStop(1, 'rgba(255,60,50,0)');
      ctx.fillStyle = g;
      ctx.fillRect(lx - 26, ly - 26, 52, 52);
      ctx.globalCompositeOperation = 'source-over';
    }
  });
}

// --- The ferry -----------------------------------------------------------------------------------

const hull = new Float64Array(14);
const DECK = 34;

/**
 * The HALVARD STAR: bow west, superstructure aft, lit windows, a wake while
 * moving, the gangway once she's alongside. She lies beyond the pier, so she
 * is drawn before everything that stands on it.
 */
export function drawFerry(R, game, vr) {
  const F = game.events && game.events.finale;
  if (!F) return;
  const S = F.ship;
  const x = F.shipX;
  if (x >= F.startX - 40) return;
  const { ctx, v } = R;
  const t = game.time;
  const y = S.y;
  const w = S.w;
  const h = S.h;
  if (!rectsOverlap({ x: x - 200, y: y - 260, w: w + 640, h: h + 420 }, vr)) return;
  const bob = Math.sin(t * 0.9) * 1.2;
  const cy = y + h / 2;
  const wz = v.flat ? 0 : WATER_Z;
  const k = 0.82; // she carries her own lights
  // Wake behind (east) while she moves.
  const sp = Math.min(1, F.shipV / 60);
  if (sp > 0.02) {
    R.ground(wz);
    ctx.fillStyle = `rgba(200,225,235,${0.12 * sp})`;
    ctx.beginPath();
    ctx.moveTo(x + w - 10, cy - h * 0.4);
    ctx.lineTo(x + w + 380 * sp, cy - h * 0.75);
    ctx.lineTo(x + w + 380 * sp, cy + h * 0.75);
    ctx.lineTo(x + w - 10, cy + h * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(230,240,245,${0.35 * sp})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 40, cy - h / 2 - 4);
    ctx.lineTo(x + w + 300 * sp, cy - h * 0.7);
    ctx.moveTo(x + 40, cy + h / 2 + 4);
    ctx.lineTo(x + w + 300 * sp, cy + h * 0.7);
    ctx.stroke();
    R.reset();
  }
  // Hull: pointed bow to the west, square stern.
  hull[0] = x; hull[1] = cy;
  hull[2] = x + 46; hull[3] = cy - h * 0.34;
  hull[4] = x + 150; hull[5] = cy - h / 2;
  hull[6] = x + w; hull[7] = cy - h / 2;
  hull[8] = x + w; hull[9] = cy + h / 2;
  hull[10] = x + 150; hull[11] = cy + h / 2;
  hull[12] = x + 46; hull[13] = cy + h * 0.34;
  const deck = DECK + bob;
  const navy = (nx, ny) => tone('#1f2f45', k * (0.7 + 0.4 * Math.max(0, nx * R.lx + ny * R.ly)));
  prism(ctx, v, hull, wz, deck, tone('#7d7a72', k), navy);
  if (!v.flat) {
    // Boot stripe, name on the bow, the rail.
    const ys = v.faceY > 0 ? cy + h / 2 : cy - h / 2;
    ctx.fillStyle = tone('#8a2a24', k);
    ctx.beginPath();
    quad3(ctx, v, x + 150, ys, wz + 6, x + w, ys, wz + 6, x + w, ys, wz + 12, x + 150, ys, wz + 12);
    ctx.fill();
    if (v.runsRight(1, 0)) R.face(x + 150, ys, 1, 0, 0);
    else R.face(x + w, ys, -1, 0, 0);
    ctx.font = `900 15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(240,240,232,0.9)';
    ctx.fillText('HALVARD STAR', v.runsRight(1, 0) ? 16 : w - 150 - 150, -(deck - 16));
    R.reset();
    ctx.strokeStyle = 'rgba(235,235,225,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    polygon(ctx, v, hull, deck + 7);
    ctx.stroke();
  }
  // Superstructure aft: white decks, rows of lit windows, the bridge facing forward.
  const sx = x + w * 0.42;
  const sw = w * 0.5;
  const tiers = [
    [sx, cy - h * 0.33, sx + sw, cy + h * 0.33, deck, deck + 40, '#d9d6cc'],
    [sx + 30, cy - h * 0.24, sx + sw - 30, cy + h * 0.24, deck + 40, deck + 66, '#c4c0b4'],
    [sx + 34, cy - h * 0.2, sx + 78, cy + h * 0.2, deck + 66, deck + 84, '#d9d6cc'],
  ];
  for (const [ax, ay, bx, by, z0, z1, c] of tiers) {
    box(ctx, v, ax, ay, bx, by, z0, z1, tone(c, k), tone(c, k * 0.66), tone(c, k * 0.86));
    if (v.flat) continue;
    const yf = v.faceY > 0 ? by : ay;
    const n = Math.max(3, Math.round((bx - ax) / 25));
    for (let q = 0; q < n; q++) {
      const wx = ax + 10 + q * ((bx - ax - 20) / n);
      const lit = hash01(q * 3.1 + z0) < 0.8;
      ctx.fillStyle = lit ? 'rgba(255,224,140,0.95)' : 'rgba(60,70,80,0.9)';
      ctx.beginPath();
      quad3(ctx, v, wx, yf, z0 + 12, wx + 9, yf, z0 + 12, wx + 9, yf, z0 + 20, wx, yf, z0 + 20);
      ctx.fill();
    }
    if (v.faceX) {
      // Windows on the end that shows (the bridge looks forward).
      const xf = v.faceX < 0 ? ax : bx;
      ctx.fillStyle = z1 > deck + 70 ? 'rgba(150,200,230,0.8)' : '#2a3a4a';
      ctx.beginPath();
      quad3(ctx, v, xf, ay + 6, z0 + 10, xf, by - 6, z0 + 10, xf, by - 6, z0 + 19, xf, ay + 6, z0 + 19);
      ctx.fill();
    }
  }
  // Lifeboats along the side that shows, the funnel.
  if (!v.flat) {
    const side = v.faceY > 0 ? 1 : -1;
    for (let q = 0; q < 3; q++) {
      const lx = sx + 40 + q * 90;
      const ly = cy + side * (h / 2 - 16);
      box(ctx, v, lx, ly - 6, lx + 62, ly + 6, deck + 12, deck + 22, tone('#e07a2a', k), tone('#a65418', k), tone('#c96a22', k));
    }
  }
  const fx = sx + sw * 0.62 + 27;
  cylinder(ctx, v, fx, cy, 21, deck + 66, deck + 108, tone('#16181b', k), tone('#b8352a', k * 0.9));
  // Somebody got here first.
  if (game.world.map.ben) {
    R.ground(deck + 0.3);
    ctx.save();
    ctx.translate(x + 96, cy - 10);
    ctx.font = `700 11px "Chalkboard SE", "Comic Sans MS", "Segoe Print", cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2.5;
    ctx.strokeText('ben was here', 0, 0);
    ctx.fillStyle = '#ff8a1e';
    ctx.fillText('ben was here', 0, 0);
    ctx.restore();
    drawEyes(ctx, x + 96, cy + 6, Math.PI, 0.6);
    R.reset();
  }
  // Navigation lights: red to port (south, facing west), green to starboard; the searchlight.
  for (const [ly, col] of [[cy + h / 2 - 8, 'rgba(255,60,50,0.95)'], [cy - h / 2 + 8, 'rgba(80,255,120,0.95)']]) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ball(ctx, v, x + 150, ly, deck + 9, 3);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,250,225,0.95)';
  ctx.beginPath();
  ball(ctx, v, x + 60, cy + 30, deck + 16, 4);
  ctx.fill();
  // The gangway: lowered from the deck onto the pier once alongside.
  if (F.state === 'docked') {
    const gx = F.gangX;
    const top = cy + h / 2 - 8;
    const bottom = F.pier.y + 34;
    const g = F.gang;
    const ey = top + (bottom - top) * g;
    const ez = v.flat ? 0 : deck * (1 - g) + 1.5 * g;
    const dz = v.flat ? 0 : deck;
    ctx.fillStyle = tone('#9b9a92', 0.9);
    ctx.beginPath();
    quad3(ctx, v, gx - 24, top, dz, gx + 24, top, dz, gx + 24, ey, ez, gx - 24, ey, ez);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let u = 0.06; u < 1; u += 0.09) line3(ctx, v, gx - 22, top + (ey - top) * u, dz + (ez - dz) * u, gx + 22, top + (ey - top) * u, dz + (ez - dz) * u);
    ctx.stroke();
    ctx.strokeStyle = '#e8e4d8';
    ctx.lineWidth = 2 * v.scale;
    ctx.beginPath();
    for (const s of [-25, 25]) {
      line3(ctx, v, gx + s, top, dz + 12, gx + s, ey, ez + 12);
      line3(ctx, v, gx + s, top, dz, gx + s, top, dz + 12);
      line3(ctx, v, gx + s, ey, ez, gx + s, ey, ez + 12);
    }
    ctx.stroke();
  }
}

// --- Over the night: the flare, and where to stand ------------------------------------------------

/** Called with the plain screen transform; R.ground(z) paints on the ground. */
export function drawDocksBright(R, game, vr) {
  const map = game.world.map;
  if (map.theme !== 'docks') return;
  const { ctx, v } = R;
  const t = game.time;
  const F = game.events && game.events.finale;
  if (!F) return;
  // The red wash of the flare on the ground, and the flare itself hanging over it.
  if (F.flareT >= 0 && F.flareT < FERRY.flareLife) {
    const fp = flarePos(F, t);
    const k = F.flareT < 1 ? F.flareT : F.flareT > FERRY.flareLife - 4 ? (FERRY.flareLife - F.flareT) / 4 : 1;
    R.ground(0);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(fp.x, fp.y, 0, fp.x, fp.y, 420);
    g.addColorStop(0, `rgba(255,60,40,${0.22 * k})`);
    g.addColorStop(1, 'rgba(255,40,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(fp.x - 420, fp.y - 420, 840, 840);
    ctx.globalCompositeOperation = 'source-over';
    R.reset();
    const fz = v.flat ? 0 : 170 * Math.min(1, F.flareT / 1.2);
    const sx = v.px(fp.x, fp.y);
    const sy = v.py(fp.x, fp.y, fz);
    if (F.flareT < 1.2) {
      ctx.strokeStyle = 'rgba(255,200,160,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(v.px(F.flare.x, F.flare.y), v.py(F.flare.x, F.flare.y, v.flat ? 0 : 46));
      ctx.lineTo(sx, sy);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, 46);
    halo.addColorStop(0, `rgba(255,120,90,${0.55 * k})`);
    halo.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(sx - 46, sy - 46, 92, 92);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(255,${190 + Math.sin(t * 30) * 40},150,${0.9 * k})`;
    ctx.beginPath();
    ctx.arc(sx, sy, 5 + Math.sin(t * 23) * 1.2, 0, TAU);
    ctx.fill();
    if (Math.random() < 0.5) game.effects.ember(fp.x + (Math.random() - 0.5) * 6, fp.y, fz);
  }
  // The flare post: where to stand (before the flare), with the hold ring.
  if (F.state === 'idle') {
    const pulse = 0.5 + Math.sin(t * 4) * 0.25;
    R.ground(0);
    ctx.strokeStyle = `rgba(255,120,90,${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    circle(ctx, F.use.x, F.use.y, 22);
    ctx.stroke();
    if (F.hold > 0) {
      ctx.strokeStyle = '#ffd27a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(F.use.x, F.use.y, 28, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, F.hold));
      ctx.stroke();
    }
    R.reset();
    ctx.font = `800 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(255,200,170,${0.6 + pulse * 0.4})`;
    ctx.fillText('FLARE', v.px(F.flare.x, F.flare.y), v.py(F.flare.x, F.flare.y, v.flat ? 0 : 58) - (v.flat ? 30 : 6));
  }
  // Where to board, once it's down.
  if (F.state === 'docked') {
    const b = F.board;
    const pulse = 0.5 + Math.sin(t * 5) * 0.3;
    R.ground(0);
    ctx.strokeStyle = `rgba(125,255,161,${0.5 + pulse * 0.4})`;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -t * 30;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([]);
    R.reset();
    ctx.font = `900 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(160,255,185,${0.7 + pulse * 0.3})`;
    ctx.fillText('BOARD', v.px(b.x + b.w / 2, b.y + b.h + 14), v.py(b.x + b.w / 2, b.y + b.h + 14, 0));
  }
}
