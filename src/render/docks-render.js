// Pier 9 (docks level): water and piers, the quay apron and container yard,
// containers, cranes, the flare and the ferry. Ground and props sit under the
// night overlay; the cranes, the ferry, the gangway and the flare are drawn
// over it (they carry their own lights and need to read from far off).

import { FONT, circle, hash01, rrect } from './draw-utils.js';
import { TAU, rectsOverlap } from '../util.js';
import { FERRY, flarePos } from '../game/finale.js';
import { drawEyes } from './ben-render.js';

const WATER = '#0a1720';
const PLANK = '#4b3c2d';

// --- Ground ------------------------------------------------------------------------------

export function drawDocksGround(ctx, game, vr) {
  const map = game.world.map;
  const t = game.time;
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
      ctx.moveTo(ox - L / 2, oy);
      ctx.quadraticCurveTo(ox, oy - 3, ox + L / 2, oy);
    }
  }
  ctx.stroke();
  // Piers: pilings in the water, deck planks, edge beams.
  for (const p of map.piers) {
    const R = { x: p.x, y: p.y - 12, w: p.w + 12, h: p.h + 24 };
    if (!rectsOverlap(R, vr)) continue;
    ctx.fillStyle = '#1b1712';
    for (let x = p.x + 30; x < p.x + p.w; x += 70) {
      for (const y of [p.y - 5, p.y + p.h + 5]) {
        ctx.beginPath();
        circle(ctx, x, y, 6);
        ctx.fill();
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
export function drawDocksDecor(ctx, d, t) {
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
      ctx.save();
      ctx.translate(d.x, d.y + bob);
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

// --- Props (under the night overlay) ----------------------------------------------------------

/** Docks-only obstacles. Returns true if it drew it. */
export function drawDocksProp(ctx, o) {
  switch (o.kind) {
    case 'water':
      return true; // drawn with the ground
    case 'bollard': {
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      ctx.fillStyle = '#1c1e21';
      ctx.beginPath();
      circle(ctx, cx, cy, o.w * 0.62);
      ctx.fill();
      ctx.fillStyle = '#3b3f45';
      ctx.beginPath();
      circle(ctx, cx, cy, o.w * 0.45);
      ctx.fill();
      return true;
    }
    case 'craneleg':
      ctx.fillStyle = '#2a2b2e';
      ctx.fillRect(o.x - 3, o.y - 3, o.w + 6, o.h + 6);
      ctx.fillStyle = '#6a5a3a';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(o.x + 5, o.y + 5, o.w - 10, o.h - 10);
      return true;
    case 'forklift': {
      // A reach stacker: yellow body, cab, the boom along its length.
      ctx.save();
      ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
      if (o.a) ctx.rotate(o.a);
      ctx.fillStyle = '#16181b';
      ctx.fillRect(-o.w / 2 - 2, -o.h / 2 - 3, o.w + 4, o.h + 6);
      ctx.fillStyle = o.color;
      ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-o.w / 2 + 6, -o.h / 2 + 5, 18, o.h - 10);
      ctx.fillStyle = '#2c3a44';
      ctx.fillRect(-o.w / 2 + 8, -o.h / 2 + 8, 14, o.h - 16);
      ctx.fillStyle = '#2b2b2b';
      ctx.fillRect(4, -3, o.w / 2 + 6, 6);
      ctx.restore();
      return true;
    }
    case 'flarepost': {
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      ctx.fillStyle = '#1e2124';
      ctx.fillRect(o.x - 2, o.y - 2, o.w + 4, o.h + 4);
      ctx.fillStyle = '#b8352a';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = '#e8e2d2';
      ctx.fillRect(o.x + 3, cy - 2, o.w - 6, 4);
      ctx.fillStyle = '#1e2124';
      ctx.beginPath();
      circle(ctx, cx, cy, 4);
      ctx.fill();
      return true;
    }
    default:
      return false;
  }
}

// --- Containers (sight blockers: drawn with the roofs) -----------------------------------------

export function drawContainer(ctx, o, night) {
  const n = o.n || 1;
  const horiz = o.dir !== 'v';
  const size = horiz ? o.h / n : o.w / n;
  for (let k = 0; k < n; k++) {
    const x = horiz ? o.x : o.x + k * size;
    const y = horiz ? o.y + k * size : o.y;
    const w = horiz ? o.w : size;
    const h = horiz ? size : o.h;
    const base = o.colors[k % o.colors.length];
    ctx.fillStyle = base;
    ctx.fillRect(x, y, w, h);
    if (night) {
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(x, y, w, h);
    }
    // Corrugated roof: ribs across the box.
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (horiz) for (let p = x + 8; p < x + w - 4; p += 9) { ctx.moveTo(p, y + 3); ctx.lineTo(p, y + h - 3); }
    else for (let p = y + 8; p < y + h - 4; p += 9) { ctx.moveTo(x + 3, p); ctx.lineTo(x + w - 3, p); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // Corner castings.
    ctx.fillStyle = 'rgba(20,20,20,0.6)';
    for (const [cx, cy] of [[x, y], [x + w - 5, y], [x, y + h - 5], [x + w - 5, y + h - 5]]) ctx.fillRect(cx, cy, 5, 5);
  }
  // Stacked two high: a lighter top tier and a hard shadow.
  if (o.tall) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(o.x, o.y, o.w, o.h);
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

/** Warehouse roofs: long corrugation ridges (drawn over the generic roof). */
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

// --- Over the night: cranes, the ferry, the gangway, the flare -----------------------------------

export function drawDocksBright(ctx, game, vr) {
  const map = game.world.map;
  if (map.theme !== 'docks') return;
  const t = game.time;
  const F = game.events && game.events.finale;
  const night = game.settings.night;
  map.cranes.forEach((c, i) => drawCrane(ctx, c, t, vr, night, i + 1));
  if (!F) return;
  // The red wash of the flare.
  if (F.flareT >= 0 && F.flareT < FERRY.flareLife) {
    const fp = flarePos(F, t);
    const k = F.flareT < 1 ? F.flareT : F.flareT > FERRY.flareLife - 4 ? (FERRY.flareLife - F.flareT) / 4 : 1;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(fp.x, fp.y, 0, fp.x, fp.y, 420);
    g.addColorStop(0, `rgba(255,60,40,${0.22 * k})`);
    g.addColorStop(1, 'rgba(255,40,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(fp.x - 420, fp.y - 420, 840, 840);
    ctx.globalCompositeOperation = 'source-over';
    // The flare itself (and its trail on the way up).
    if (F.flareT < 1.2) {
      ctx.strokeStyle = 'rgba(255,200,160,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(F.flare.x, F.flare.y);
      ctx.lineTo(fp.x, fp.y);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(255,${190 + Math.sin(t * 30) * 40},150,${0.9 * k})`;
    ctx.beginPath();
    circle(ctx, fp.x, fp.y, 5 + Math.sin(t * 23) * 1.2);
    ctx.fill();
    if (Math.random() < 0.5) game.effects.ember(fp.x + (Math.random() - 0.5) * 6, fp.y);
  }
  drawFerry(ctx, F, t, vr, !!map.ben);
  // The flare post: where to stand (before the flare), with the hold ring.
  if (F.state === 'idle') {
    const pulse = 0.5 + Math.sin(t * 4) * 0.25;
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
    ctx.font = `800 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(255,200,170,${0.6 + pulse * 0.4})`;
    ctx.fillText('FLARE', F.flare.x, F.flare.y - 30);
  }
  // Where to board, once it's down.
  if (F.state === 'docked') {
    const b = F.board;
    const pulse = 0.5 + Math.sin(t * 5) * 0.3;
    ctx.strokeStyle = `rgba(125,255,161,${0.5 + pulse * 0.4})`;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -t * 30;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([]);
    ctx.font = `900 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(160,255,185,${0.7 + pulse * 0.3})`;
    ctx.fillText('BOARD', b.x + b.w / 2, b.y + b.h + 14);
  }
}

function drawCrane(ctx, c, t, vr, night, num) {
  const box = { x: c.x0 - 30, y: c.y - 30, w: c.x1 - c.x0 + c.boom + 60, h: c.y1 - c.y + 60 };
  if (!rectsOverlap(box, vr)) return;
  const dark = night ? 0.78 : 1;
  ctx.globalAlpha = dark;
  // Girders along each pair of legs, the cross beams, and the boom out over the water.
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(c.x0, c.y);
  ctx.lineTo(c.x1, c.y);
  ctx.moveTo(c.x0, c.y1);
  ctx.lineTo(c.x1, c.y1);
  ctx.stroke();
  ctx.strokeStyle = c.color;
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(c.x0, c.y);
  ctx.lineTo(c.x1, c.y);
  ctx.moveTo(c.x0, c.y1);
  ctx.lineTo(c.x1, c.y1);
  ctx.moveTo(c.x0, c.y);
  ctx.lineTo(c.x0, c.y1);
  ctx.moveTo(c.x1, c.y);
  ctx.lineTo(c.x1, c.y1);
  ctx.stroke();
  // Bracing.
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(c.x0, c.y);
  ctx.lineTo(c.x1, c.y1);
  ctx.moveTo(c.x1, c.y);
  ctx.lineTo(c.x0, c.y1);
  ctx.stroke();
  // The boom: a long truss reaching east past the quay edge.
  const my = (c.y + c.y1) / 2;
  const bx1 = c.x1 + c.boom;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(c.x0 - 60, my - 15, bx1 - c.x0 + 60, 30);
  ctx.fillStyle = c.color;
  ctx.fillRect(c.x0 - 60, my - 11, bx1 - c.x0 + 60, 22);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = c.x0 - 60; x < bx1; x += 22) {
    ctx.moveTo(x, my - 11);
    ctx.lineTo(x + 11, my + 11);
    ctx.lineTo(x + 22, my - 11);
  }
  ctx.stroke();
  // The machinery house and the trolley.
  ctx.fillStyle = '#2b2d30';
  ctx.fillRect(c.x0 - 50, my - 26, 54, 52);
  ctx.fillStyle = '#3f4246';
  ctx.fillRect(c.x0 - 46, my - 22, 46, 44);
  // Stencilled crane number.
  ctx.font = `900 22px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(235,230,215,0.55)';
  ctx.fillText(String(num), c.x0 - 23, my + 1);
  const tx = c.x1 + c.boom * (0.4 + 0.3 * Math.sin(t * 0.07 + c.y));
  ctx.fillStyle = '#26282b';
  ctx.fillRect(tx - 14, my - 16, 28, 32);
  ctx.globalAlpha = 1;
  // Red aircraft-warning light at the tip.
  if (Math.sin(t * 2.4 + c.y) > 0.2) {
    ctx.fillStyle = 'rgba(255,60,50,0.95)';
    ctx.beginPath();
    circle(ctx, bx1 - 6, my, 3.5);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(bx1 - 6, my, 0, bx1 - 6, my, 26);
    g.addColorStop(0, 'rgba(255,60,50,0.4)');
    g.addColorStop(1, 'rgba(255,60,50,0)');
    ctx.fillStyle = g;
    ctx.fillRect(bx1 - 32, my - 26, 52, 52);
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** The HALVARD STAR: bow west, superstructure aft, lit windows, a wake while moving. */
function drawFerry(ctx, F, t, vr, benMark = false) {
  const S = F.ship;
  const x = F.shipX;
  if (x >= F.startX - 40) return;
  const y = S.y;
  const w = S.w;
  const h = S.h;
  if (!rectsOverlap({ x: x - 160, y: y - 60, w: w + 400, h: h + 120 }, vr)) return;
  const bob = Math.sin(t * 0.9) * 1.2;
  const cy = y + h / 2 + bob;
  // Wake behind (east) while she moves.
  const v = Math.min(1, F.shipV / 60);
  if (v > 0.02) {
    ctx.fillStyle = `rgba(200,225,235,${0.12 * v})`;
    ctx.beginPath();
    ctx.moveTo(x + w - 10, cy - h * 0.4);
    ctx.lineTo(x + w + 380 * v, cy - h * 0.75);
    ctx.lineTo(x + w + 380 * v, cy + h * 0.75);
    ctx.lineTo(x + w - 10, cy + h * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(230,240,245,${0.35 * v})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 40, cy - h / 2 - 4);
    ctx.lineTo(x + w + 300 * v, cy - h * 0.7);
    ctx.moveTo(x + 40, cy + h / 2 + 4);
    ctx.lineTo(x + w + 300 * v, cy + h * 0.7);
    ctx.stroke();
  }
  // Hull: pointed bow to the west, square stern.
  const hull = () => {
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.quadraticCurveTo(x + 40, cy - h / 2, x + 150, cy - h / 2);
    ctx.lineTo(x + w, cy - h / 2);
    ctx.lineTo(x + w, cy + h / 2);
    ctx.lineTo(x + 150, cy + h / 2);
    ctx.quadraticCurveTo(x + 40, cy + h / 2, x, cy);
    ctx.closePath();
  };
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.save();
  ctx.translate(8, 10);
  hull();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#1f2f45';
  hull();
  ctx.fill();
  // Deck.
  ctx.fillStyle = '#7d7a72';
  ctx.beginPath();
  ctx.moveTo(x + 18, cy);
  ctx.quadraticCurveTo(x + 50, cy - h / 2 + 12, x + 150, cy - h / 2 + 12);
  ctx.lineTo(x + w - 12, cy - h / 2 + 12);
  ctx.lineTo(x + w - 12, cy + h / 2 - 12);
  ctx.lineTo(x + 150, cy + h / 2 - 12);
  ctx.quadraticCurveTo(x + 50, cy + h / 2 - 12, x + 18, cy);
  ctx.closePath();
  ctx.fill();
  // Railing.
  ctx.strokeStyle = 'rgba(235,235,225,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Superstructure aft: white decks, rows of lit windows, the bridge facing forward.
  const sx = x + w * 0.42;
  const sw = w * 0.5;
  ctx.fillStyle = '#d9d6cc';
  ctx.beginPath();
  rrect(ctx, sx, cy - h * 0.33, sw, h * 0.66, 10);
  ctx.fill();
  ctx.fillStyle = '#c4c0b4';
  ctx.beginPath();
  rrect(ctx, sx + 30, cy - h * 0.24, sw - 60, h * 0.48, 8);
  ctx.fill();
  for (const side of [-1, 1]) {
    for (let k = 0; k < 14; k++) {
      const wx = sx + 14 + k * ((sw - 28) / 14);
      const lit = hash01(k * 3.1 + side) < 0.8;
      ctx.fillStyle = lit ? 'rgba(255,224,140,0.95)' : 'rgba(60,70,80,0.9)';
      ctx.fillRect(wx, cy + side * h * 0.29 - 3, 9, 6);
    }
  }
  ctx.fillStyle = '#2a3a4a';
  ctx.fillRect(sx + 4, cy - h * 0.2, 10, h * 0.4); // bridge windows
  // Funnel.
  ctx.fillStyle = '#b8352a';
  ctx.beginPath();
  rrect(ctx, sx + sw * 0.62, cy - 22, 54, 44, 10);
  ctx.fill();
  ctx.fillStyle = '#16181b';
  ctx.beginPath();
  rrect(ctx, sx + sw * 0.62 + 8, cy - 14, 38, 28, 7);
  ctx.fill();
  // Lifeboats along both sides.
  ctx.fillStyle = '#e07a2a';
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      rrect(ctx, sx + 40 + k * 90, cy + side * (h / 2 - 22) - 7, 62, 14, 7);
      ctx.fill();
    }
  }
  // Name on the bow (both sides read from the pier: the south one).
  ctx.font = `900 15px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(240,240,232,0.9)';
  ctx.fillText('HALVARD STAR', x + 110, cy + h / 2 - 3);
  // Somebody got here first.
  if (benMark) {
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
  }
  // Navigation lights: red to port (south, facing west), green to starboard.
  for (const [ly, col] of [[cy + h / 2 - 8, 'rgba(255,60,50,'], [cy - h / 2 + 8, 'rgba(80,255,120,']]) {
    ctx.fillStyle = `${col}0.95)`;
    ctx.beginPath();
    circle(ctx, x + 150, ly, 3);
    ctx.fill();
  }
  // The gangway: lowered from the deck onto the pier once alongside.
  if (F.state === 'docked') {
    const gx = F.gangX;
    const top = cy + h / 2 - 30;
    const bottom = F.pier.y + 34;
    const len = (bottom - top) * F.gang;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(gx - 22, top + 4, 50, len);
    ctx.fillStyle = '#9b9a92';
    ctx.fillRect(gx - 24, top, 48, len);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let yy = top + 6; yy < top + len; yy += 7) {
      ctx.moveTo(gx - 22, yy);
      ctx.lineTo(gx + 22, yy);
    }
    ctx.stroke();
    ctx.fillStyle = '#e8e4d8';
    ctx.fillRect(gx - 26, top, 3, len);
    ctx.fillRect(gx + 23, top, 3, len);
  }
}
