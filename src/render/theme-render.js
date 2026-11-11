// What lies flat on the graveyard, suburbia and junkyard maps: the ground of
// each (grass, gravel, lawns, driveways, packed dirt), their paving, water,
// and the small things painted on it. Each theme can also add ground mist.
//
//   THEMES[map.theme] = { base, ground(ctx, game, vr, view), mist?(ctx, game, vr) }
//   drawThemeDecor(ctx, d, t, view)  -> true if it drew the decor entry
//
// Everything is drawn in world coordinates through the camera's ground
// transform (the renderer sets it), under the night overlay.

import { rectsOverlap, TAU } from '../util.js';
import { hash01 } from './draw-utils.js';

const SERIF = 'Georgia, "Times New Roman", "Palatino Linotype", serif';
const FONT_KID = '"Chalkboard SE", "Comic Sans MS", "Segoe Print", "Bradley Hand", "Marker Felt", cursive';

/** Deterministic speckle over a rect: n-ish dots per `cell` squared, only inside the view. */
function speckle(ctx, r, vr, cell, color, size = 2, salt = 0) {
  const x0 = Math.max(r.x, vr.x);
  const y0 = Math.max(r.y, vr.y);
  const x1 = Math.min(r.x + r.w, vr.x + vr.w);
  const y1 = Math.min(r.y + r.h, vr.y + vr.h);
  if (x1 <= x0 || y1 <= y0) return;
  ctx.fillStyle = color;
  for (let cy = Math.floor(y0 / cell); cy * cell < y1; cy++) {
    for (let cx = Math.floor(x0 / cell); cx * cell < x1; cx++) {
      const h = hash01(cx * 12.9898 + cy * 78.233 + salt);
      const x = (cx + h) * cell;
      const y = (cy + hash01(cx * 39.3468 + cy * 11.135 + salt)) * cell;
      if (x < r.x + 2 || y < r.y + 2 || x > r.x + r.w - 3 || y > r.y + r.h - 3) continue;
      ctx.fillRect(x, y, size + (h > 0.7 ? 1 : 0), size);
    }
  }
}

/** Grid joints over a paved rect (only what is in view). */
function joints(ctx, r, vr, step, color) {
  const x0 = Math.max(r.x, vr.x);
  const y0 = Math.max(r.y, vr.y);
  const x1 = Math.min(r.x + r.w, vr.x + vr.w);
  const y1 = Math.min(r.y + r.h, vr.y + vr.h);
  if (x1 <= x0 || y1 <= y0) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = r.x + Math.ceil((x0 - r.x) / step) * step; x < x1; x += step) {
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
  }
  for (let y = r.y + Math.ceil((y0 - r.y) / step) * step; y < y1; y += step) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
  }
  ctx.stroke();
}

// A soft blob, drawn scaled: ground mist without building a gradient per puff.
let puff = null;
function puffSprite() {
  if (puff) return puff;
  puff = document.createElement('canvas');
  puff.width = 96;
  puff.height = 96;
  const c = puff.getContext('2d');
  const g = c.createRadialGradient(48, 48, 0, 48, 48, 48);
  g.addColorStop(0, 'rgba(176,190,196,0.5)');
  g.addColorStop(0.55, 'rgba(176,190,196,0.22)');
  g.addColorStop(1, 'rgba(176,190,196,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 96, 96);
  return puff;
}

/** Slow ground mist: one drifting puff per lattice cell, a few on screen at a time. */
function mist(ctx, game, vr, cell = 400, strength = 0.2) {
  const img = puffSprite();
  if (!img || !ctx.drawImage) return;
  const t = game.time;
  ctx.globalAlpha = strength;
  for (let cy = Math.floor((vr.y - 260) / cell); cy * cell < vr.y + vr.h + 260; cy++) {
    for (let cx = Math.floor((vr.x - 260) / cell); cx * cell < vr.x + vr.w + 260; cx++) {
      const h1 = hash01(cx * 12.9898 + cy * 78.233);
      const h2 = hash01(cx * 4.898 + cy * 7.23 + 3);
      if (h1 < 0.18) continue; // clear patches
      const x = (cx + 0.5 + 0.34 * Math.sin(t * 0.06 + h1 * 6.283)) * cell;
      const y = (cy + 0.5 + 0.3 * Math.cos(t * 0.045 + h2 * 6.283)) * cell;
      const rw = 190 + h2 * 150;
      const rh = rw * (0.55 + h1 * 0.25);
      ctx.drawImage(img, x - rw, y - rh, rw * 2, rh * 2);
    }
  }
  ctx.globalAlpha = 1;
}

// --- Graveyard -------------------------------------------------------------------------------------

const GRASS = {
  graves: '#1d2a1f',
  mausoleums: '#1e2b20',
  woods: '#172219',
  pond: '#1e2c21',
  memorial: '#202e22',
  columbarium: '#1e2b20',
  chapel: '#1f2c21',
  service: '#1c261d',
  start: '#1d2a1f',
  end: '#1c281e',
};

const graveLists = new WeakMap();
/** The headstones of a map (found once). */
function gravesOf(map) {
  let list = graveLists.get(map);
  if (!list) {
    list = map.obstacles.filter((o) => o.kind === 'grave');
    graveLists.set(map, list);
  }
  return list;
}

function graveyardGround(ctx, game, vr) {
  const map = game.world.map;
  for (const b of map.blocks) {
    if (!rectsOverlap(b, vr)) continue;
    ctx.fillStyle = GRASS[b.type] || GRASS.graves;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    speckle(ctx, b, vr, 46, 'rgba(60,84,58,0.35)', 2, 7);
  }
  // The plot in front of each headstone: a low mound in the grass, bare earth where it is new.
  const x0 = vr.x - 30;
  const x1 = vr.x + vr.w + 30;
  const y0 = vr.y - 70;
  const y1 = vr.y + vr.h + 20;
  ctx.lineWidth = 1;
  for (const o of gravesOf(map)) {
    if (o.x < x0 || o.x > x1 || o.y < y0 || o.y > y1 || o.broken) continue;
    const px = o.x + o.w / 2 - 12;
    const py = o.y + o.h + 3;
    if (o.fresh) {
      ctx.fillStyle = 'rgba(64,50,34,0.75)';
      ctx.fillRect(px, py, 24, 50);
      ctx.fillStyle = 'rgba(92,74,52,0.5)';
      ctx.fillRect(px + 3, py + 4, 18, 3);
      ctx.fillRect(px + 5, py + 22, 15, 2);
    } else {
      ctx.fillStyle = 'rgba(120,150,110,0.07)';
      ctx.fillRect(px, py, 24, 50);
      ctx.strokeStyle = 'rgba(0,0,0,0.16)';
      ctx.strokeRect(px + 0.5, py + 0.5, 23, 49);
    }
  }
  // Gravel paths, a paler verge either side.
  for (const s of map.streets) {
    if (!rectsOverlap(s, vr)) continue;
    ctx.fillStyle = s.avenue ? '#3e3b35' : '#383630';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = 'rgba(120,112,96,0.22)';
    if (s.dir === 'v') {
      ctx.fillRect(s.x, s.y, 4, s.h);
      ctx.fillRect(s.x + s.w - 4, s.y, 4, s.h);
    } else {
      ctx.fillRect(s.x, s.y, s.w, 4);
      ctx.fillRect(s.x, s.y + s.h - 4, s.w, 4);
    }
    speckle(ctx, s, vr, 22, 'rgba(150,142,124,0.2)', 2, 1);
    speckle(ctx, s, vr, 31, 'rgba(0,0,0,0.22)', 2, 2);
  }
  for (const p of map.paving || []) {
    if (p.r) {
      if (!rectsOverlap({ x: p.cx - p.r, y: p.cy - p.r, w: p.r * 2, h: p.r * 2 }, vr)) continue;
      ctx.fillStyle = '#46453f';
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, p.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const f of [0.36, 0.68, 1]) {
        ctx.moveTo(p.cx + p.r * f, p.cy);
        ctx.arc(p.cx, p.cy, p.r * f, 0, TAU);
      }
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        ctx.moveTo(p.cx + Math.cos(a) * p.r * 0.36, p.cy + Math.sin(a) * p.r * 0.36);
        ctx.lineTo(p.cx + Math.cos(a) * p.r, p.cy + Math.sin(a) * p.r);
      }
      ctx.stroke();
      continue;
    }
    if (!rectsOverlap(p, vr)) continue;
    if (p.dirt) {
      ctx.fillStyle = '#2f2820';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      speckle(ctx, p, vr, 28, 'rgba(110,92,66,0.25)', 2, 5);
      continue;
    }
    ctx.fillStyle = '#44433d';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    joints(ctx, p, vr, 32, 'rgba(0,0,0,0.2)');
  }
  // The pond: a muddy bank, dark water, slow rings, lily pads.
  const t = game.time;
  for (const p of map.ponds || []) {
    if (!rectsOverlap(p, vr, 20)) continue;
    const oct = (g) => {
      const c = p.cut;
      ctx.beginPath();
      ctx.moveTo(p.x + c - g * 0.4, p.y - g);
      ctx.lineTo(p.x + p.w - c + g * 0.4, p.y - g);
      ctx.lineTo(p.x + p.w + g, p.y + c - g * 0.4);
      ctx.lineTo(p.x + p.w + g, p.y + p.h - c + g * 0.4);
      ctx.lineTo(p.x + p.w - c + g * 0.4, p.y + p.h + g);
      ctx.lineTo(p.x + c - g * 0.4, p.y + p.h + g);
      ctx.lineTo(p.x - g, p.y + p.h - c + g * 0.4);
      ctx.lineTo(p.x - g, p.y + c - g * 0.4);
      ctx.closePath();
    };
    ctx.fillStyle = '#2a2a20';
    oct(9);
    ctx.fill();
    ctx.fillStyle = '#152b34';
    oct(0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,190,200,0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const cx = p.x + p.w * (0.25 + 0.5 * hash01(p.x + k * 3.7));
      const cy = p.y + p.h * (0.25 + 0.5 * hash01(p.y + k * 9.1));
      const rr = 8 + ((t * 9 + k * 17) % 40);
      ctx.moveTo(cx + rr, cy);
      ctx.ellipse(cx, cy, rr, rr * 0.6, 0, 0, TAU);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(58,96,60,0.75)';
    for (let k = 0; k < 9; k++) {
      const cx = p.x + p.w * (0.14 + 0.72 * hash01(p.x * 0.3 + k * 5.3));
      const cy = p.y + p.h * (0.16 + 0.68 * hash01(p.y * 0.7 + k * 2.9));
      ctx.beginPath();
      ctx.arc(cx, cy, 5 + hash01(k) * 3, 0.5, TAU);
      ctx.lineTo(cx, cy);
      ctx.fill();
    }
  }
}

// --- Suburbia ---------------------------------------------------------------------------------------

const LAWNS = ['#1f3322', '#223826', '#1d3020', '#24391f'];
const PAVE = {
  drive: '#4a4a47',
  asphalt: '#2f3135',
  walk: '#45464a',
  patio: '#55493d',
  deck: '#6a6962',
  alley: '#2b2c2f',
  lot: '#2a2c30',
  mulch: '#3a2c20',
  court: '#2c3a47',
};

function suburbiaGround(ctx, game, vr) {
  const map = game.world.map;
  const t = game.time;
  // Blocks: a concrete sidewalk round each, grass inside.
  for (const b of map.blocks) {
    if (!rectsOverlap(b, vr)) continue;
    ctx.fillStyle = '#3c3e42';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    joints(ctx, b, vr, 48, 'rgba(0,0,0,0.16)');
    const i = b.inner;
    ctx.fillStyle = b.type === 'park' ? '#1e3520' : b.type === 'mall' || b.type === 'school' ? '#203024' : LAWNS[0];
    ctx.fillRect(i.x, i.y, i.w, i.h);
    ctx.strokeStyle = '#4c4f54';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
  }
  // Each lot mows its own lawn.
  for (const l of map.lots || []) {
    if (!rectsOverlap(l, vr)) continue;
    const b = map.blocks.find((q) => l.x >= q.x - 1 && l.x < q.x + q.w && l.y >= q.y - 1 && l.y < q.y + q.h);
    const i = b ? b.inner : l;
    const x0 = Math.max(l.x, i.x);
    const y0 = Math.max(l.y, i.y);
    const x1 = Math.min(l.x + l.w, i.x + i.w);
    const y1 = Math.min(l.y + l.h, i.y + i.h);
    ctx.fillStyle = LAWNS[l.tint % LAWNS.length];
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Mower stripes.
    ctx.fillStyle = 'rgba(255,255,255,0.018)';
    for (let x = x0 + (l.tint & 1 ? 12 : 0); x < x1; x += 24) ctx.fillRect(x, y0, Math.min(12, x1 - x), y1 - y0);
  }
  for (const p of map.paving || []) {
    if (!rectsOverlap(p, vr)) continue;
    ctx.fillStyle = PAVE[p.style] || PAVE.walk;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    if (p.style === 'drive' || p.style === 'walk' || p.style === 'deck') joints(ctx, p, vr, p.style === 'walk' ? 16 : 34, 'rgba(0,0,0,0.16)');
    else if (p.style === 'patio') joints(ctx, p, vr, 14, 'rgba(0,0,0,0.2)');
    else if (p.style === 'mulch') speckle(ctx, p, vr, 18, 'rgba(110,84,56,0.4)', 2, 9);
    else if (p.style === 'alley') {
      speckle(ctx, p, vr, 30, 'rgba(0,0,0,0.3)', 3, 4);
      ctx.fillStyle = 'rgba(70,84,62,0.5)';
      ctx.fillRect(p.x, p.y + p.h / 2 - 2, p.w, 4); // the grass strip down the middle
    } else if (p.style === 'court') {
      ctx.strokeStyle = 'rgba(230,230,220,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x + 8, p.y + 8, p.w - 16, p.h - 16);
      ctx.beginPath();
      ctx.moveTo(p.x + p.w / 2, p.y + 8);
      ctx.lineTo(p.x + p.w / 2, p.y + p.h - 8);
      ctx.moveTo(p.x + p.w / 2 + 26, p.y + p.h / 2);
      ctx.arc(p.x + p.w / 2, p.y + p.h / 2, 26, 0, TAU);
      for (const sx of [0, 1]) {
        const hx = sx ? p.x + p.w - 8 : p.x + 8;
        ctx.moveTo(hx, p.y + p.h / 2 - 34);
        ctx.arc(hx, p.y + p.h / 2, 34, -Math.PI / 2, Math.PI / 2, !!sx);
      }
      ctx.stroke();
    }
  }
  // The ballfield: infield dirt from home plate, the base paths, the mound.
  for (const f of map.fields || []) {
    if (!rectsOverlap({ x: f.x - f.s, y: f.y - f.s, w: f.s + 40, h: f.s + 40 }, vr)) continue;
    const d = f.s * 0.5; // home to first
    ctx.fillStyle = '#4a3a29';
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.arc(f.x, f.y, f.s * 0.78, Math.PI, Math.PI * 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#22381f';
    ctx.beginPath();
    ctx.moveTo(f.x - 16, f.y - 16);
    ctx.lineTo(f.x - d + 10, f.y - 16);
    ctx.lineTo(f.x - d + 10, f.y - d + 10);
    ctx.lineTo(f.x - 16, f.y - d + 10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(235,235,225,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(f.x - f.s, f.y);
    ctx.lineTo(f.x, f.y);
    ctx.lineTo(f.x, f.y - f.s);
    ctx.stroke();
    ctx.fillStyle = '#e6e3d6';
    for (const [bx, by] of [[0, 0], [-d, 0], [-d, -d], [0, -d]]) ctx.fillRect(f.x + bx - 5, f.y + by - 5, 10, 10);
    ctx.fillStyle = '#5a4733';
    ctx.beginPath();
    ctx.arc(f.x - d / 2, f.y - d / 2, 13, 0, TAU);
    ctx.fill();
  }
  // Pools: coping, water (green where nobody has been keeping it), a slow shimmer.
  for (const p of map.pools || []) {
    if (!rectsOverlap(p, vr, 10)) continue;
    ctx.fillStyle = '#d6d2c6';
    ctx.fillRect(p.x - 5, p.y - 5, p.w + 10, p.h + 10);
    ctx.fillStyle = p.green ? '#2c4a30' : '#1e6f86';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = p.green ? 'rgba(150,190,120,0.16)' : 'rgba(190,240,250,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const y = p.y + ((k + 0.5) / 4) * p.h + Math.sin(t * 0.8 + k) * 3;
      ctx.moveTo(p.x + 8, y);
      ctx.quadraticCurveTo(p.x + p.w / 2, y + 5 * Math.sin(t + k * 2), p.x + p.w - 8, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#aeb4ba';
    ctx.fillRect(p.x + p.w - 16, p.y - 6, 3, 14);
    ctx.fillRect(p.x + p.w - 8, p.y - 6, 3, 14);
  }
}

// --- Junkyard -----------------------------------------------------------------------------------------

function junkyardGround(ctx, game, vr) {
  const map = game.world.map;
  speckle(ctx, { x: 0, y: 0, w: map.w, h: map.h }, vr, 34, 'rgba(92,76,56,0.28)', 2, 3);
  for (const p of map.paving || []) {
    if (!rectsOverlap(p, vr)) continue;
    if (p.style === 'gravel') {
      ctx.fillStyle = '#322f2a';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      speckle(ctx, p, vr, 20, 'rgba(140,132,116,0.2)', 2, 1);
      speckle(ctx, p, vr, 29, 'rgba(0,0,0,0.25)', 2, 2);
    } else if (p.style === 'scale') {
      ctx.fillStyle = '#4a4d50';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = 'rgba(214,170,40,0.6)';
      ctx.lineWidth = 4;
      ctx.strokeRect(p.x + 3, p.y + 3, p.w - 6, p.h - 6);
      joints(ctx, p, vr, 25, 'rgba(0,0,0,0.25)');
    } else {
      ctx.fillStyle = '#3b3a37';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      joints(ctx, p, vr, 64, 'rgba(0,0,0,0.22)');
    }
  }
  // Tyre tracks down every lane.
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (const l of map.lanes || []) {
    if (!rectsOverlap(l, vr)) continue;
    if (l.dir === 'v') {
      const m = l.x + l.w / 2;
      ctx.fillRect(m - 30, Math.max(l.y, vr.y), 9, Math.min(l.h, vr.h + 40));
      ctx.fillRect(m + 21, Math.max(l.y, vr.y), 9, Math.min(l.h, vr.h + 40));
    } else {
      const m = l.y + l.h / 2;
      ctx.fillRect(Math.max(l.x, vr.x), m - 30, Math.min(l.w, vr.w + 40), 9);
      ctx.fillRect(Math.max(l.x, vr.x), m + 21, Math.min(l.w, vr.w + 40), 9);
    }
  }
}

// --- Decor ------------------------------------------------------------------------------------------

const FLOWERS = ['#d9534f', '#e6c84a', '#e8e6df', '#b06ad0', '#e58a3a'];

/** Flat decor of the three themes. Returns true if it drew the entry. */
export function drawThemeDecor(ctx, d, t) {
  switch (d.type) {
    case 'opengrave': {
      const x = d.x - d.w / 2;
      const y = d.y - d.h / 2;
      // Turned earth around it, the heap to one side, the dark of the hole.
      ctx.fillStyle = 'rgba(58,44,30,0.8)';
      ctx.fillRect(x - 5, y - 5, d.w + 10, d.h + 10);
      ctx.fillStyle = 'rgba(72,56,38,0.9)';
      ctx.beginPath();
      ctx.ellipse(x + d.w + 16, d.y, 13, d.h * 0.42, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#060707';
      ctx.fillRect(x, y, d.w, d.h);
      ctx.fillStyle = 'rgba(40,30,20,0.9)';
      ctx.fillRect(x, y, d.w, 5);
      return true;
    }
    case 'flowers': {
      ctx.fillStyle = 'rgba(40,70,40,0.9)';
      ctx.fillRect(d.x - 5, d.y - 1, 10, 3);
      ctx.fillStyle = FLOWERS[d.c % FLOWERS.length];
      for (let k = 0; k < 5; k++) ctx.fillRect(d.x - 6 + k * 2.6 + (hash01(d.x + k) - 0.5) * 2, d.y - 3 + (hash01(d.y + k * 3) - 0.5) * 4, 2.4 * d.s, 2.4 * d.s);
      return true;
    }
    case 'wreath':
      ctx.strokeStyle = 'rgba(46,84,48,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 5.5, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#b3352f';
      ctx.fillRect(d.x - 1.5, d.y + 4, 3, 3);
      return true;
    case 'ducks':
      for (let k = 0; k < 3; k++) {
        const x = d.x + k * 16 + Math.sin(t * 0.3 + k) * 10;
        const y = d.y + Math.cos(t * 0.22 + k * 2) * 8 + k * 5;
        ctx.fillStyle = k ? '#d9d6c8' : '#6a5a3c';
        ctx.beginPath();
        ctx.ellipse(x, y, 5, 3.4, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = k ? '#e0a23a' : '#2d4a30';
        ctx.fillRect(x + 4, y - 1.5, 3, 3);
      }
      return true;
    case 'epitaph': {
      // A ledger: a flat slab with something cut into it.
      const w = d.w;
      ctx.fillStyle = '#5f615b';
      ctx.fillRect(d.x - w / 2, d.y - 11, w, 22);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(d.x - w / 2 + 2.5, d.y - 8.5, w - 5, 17);
      ctx.font = `700 10.5px ${SERIF}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(14,15,13,0.82)';
      ctx.fillText(d.text, d.x, d.y + 0.5);
      return true;
    }
    case 'tuft':
      ctx.strokeStyle = 'rgba(70,100,62,0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let k = -2; k <= 2; k++) {
        ctx.moveTo(d.x + k * 2.5, d.y + 3);
        ctx.lineTo(d.x + k * 4, d.y - 4 - (k & 1) * 2);
      }
      ctx.stroke();
      return true;
    case 'loosetire':
      ctx.strokeStyle = 'rgba(14,15,17,0.9)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, 10 * d.s, 10 * d.s, 0, 0, TAU);
      ctx.stroke();
      return true;
    case 'hubcap':
      ctx.fillStyle = 'rgba(150,156,162,0.5)';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(60,64,70,0.7)';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 2.5, 0, TAU);
      ctx.fill();
      return true;
    case 'chalkart': {
      // What the kids drew on the driveway that spring.
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.a || 0);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      if (d.art === 'hopscotch') {
        ctx.strokeStyle = 'rgba(236,233,223,0.5)';
        ctx.font = `700 9px ${FONT_KID}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(236,233,223,0.5)';
        const cells = [[0, 0], [0, 1], [-0.5, 2], [0.5, 2], [0, 3], [-0.5, 4], [0.5, 4], [0, 5]];
        cells.forEach(([cx, cy], k) => {
          ctx.strokeRect(cx * 18 - 9, cy * 18 - 54, 18, 18);
          ctx.fillText(String(k + 1), cx * 18, cy * 18 - 45);
        });
      } else if (d.art === 'rainbow') {
        const cols = ['#e5484d', '#f2994a', '#f2c94c', '#7fd65a', '#4fc3d9', '#b06ad0'];
        cols.forEach((c, k) => {
          ctx.strokeStyle = c;
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.arc(0, 8, 30 - k * 4, Math.PI, TAU);
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
      } else if (d.art === 'sun') {
        ctx.strokeStyle = 'rgba(242,201,76,0.6)';
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, TAU);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU;
          ctx.moveTo(Math.cos(a) * 15, Math.sin(a) * 15);
          ctx.lineTo(Math.cos(a) * 23, Math.sin(a) * 23);
        }
        ctx.stroke();
      } else if (d.art === 'hearts') {
        for (const [hx, hy, c] of [[-16, 0, '#ef6fb0'], [6, -6, '#e5484d'], [20, 8, '#4fc3d9']]) {
          ctx.strokeStyle = c;
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.moveTo(hx, hy + 7);
          ctx.bezierCurveTo(hx - 12, hy - 4, hx - 3, hy - 11, hx, hy - 3);
          ctx.bezierCurveTo(hx + 3, hy - 11, hx + 12, hy - 4, hx, hy + 7);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.font = `700 12px ${FONT_KID}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = ['rgba(239,111,176,0.62)', 'rgba(79,195,217,0.62)', 'rgba(242,201,76,0.62)', 'rgba(127,214,90,0.62)'][Math.floor(hash01(d.x) * 4)];
        ctx.fillText(d.text, 0, 0);
      }
      ctx.restore();
      return true;
    }
    case 'bike': {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.a || 0);
      ctx.strokeStyle = 'rgba(20,22,26,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(-9, 0, 6, 0, TAU);
      ctx.moveTo(15, 0);
      ctx.arc(9, 0, 6, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = hash01(d.x) > 0.5 ? '#c0463c' : '#3c7bc0';
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(0, -4);
      ctx.lineTo(9, 0);
      ctx.moveTo(0, -4);
      ctx.lineTo(-2, 3);
      ctx.stroke();
      ctx.restore();
      return true;
    }
    case 'vegbeds':
      for (let k = 0; k < (d.n || 2); k++) {
        ctx.fillStyle = '#3a2c1e';
        ctx.fillRect(d.x - 26 + k * 34 - 17, d.y - 13, 30, 26);
        ctx.fillStyle = 'rgba(70,120,60,0.8)';
        for (let j = 0; j < 3; j++) ctx.fillRect(d.x - 26 + k * 34 - 14, d.y - 9 + j * 8, 24, 3);
      }
      return true;
    // Seen from straight above (when tilted these stand up: theme-models.js).
    case 'mailbox':
      ctx.fillStyle = '#2a2c30';
      ctx.fillRect(d.x - 3, d.y - 5, 7, 10);
      return true;
    case 'bins':
      for (let k = 0; k < (d.n || 1); k++) {
        ctx.fillStyle = ['#2f4a34', '#2a4f8a', '#3a3d42'][k % 3];
        ctx.fillRect(d.x - 15 + k * 16, d.y - 7, 14, 14);
      }
      return true;
    case 'bush':
      ctx.fillStyle = '#2d5231';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 9 * (d.s || 1), 0, TAU);
      ctx.fill();
      return true;
    case 'yardsign':
      ctx.fillStyle = ['#1f3f7a', '#a8322c', '#e9e6dc'][d.c % 3];
      ctx.fillRect(d.x - 13, d.y - 2, 26, 4);
      return true;
    case 'flamingo':
      ctx.fillStyle = '#ef6fb0';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 4, 0, TAU);
      ctx.fill();
      return true;
    case 'grill':
      ctx.fillStyle = '#1c1d20';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 8, 0, TAU);
      ctx.fill();
      return true;
    case 'doghouse':
      ctx.fillStyle = '#5a2f24';
      ctx.fillRect(d.x - 14, d.y - 12, 28, 24);
      return true;
    case 'cart':
      ctx.strokeStyle = '#aeb4ba';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(d.x - 9, d.y - 6, 18, 12);
      return true;
    case 'gflag':
      ctx.fillStyle = '#a8322c';
      ctx.fillRect(d.x, d.y - 2, 7, 4);
      return true;
    case 'flagpole':
      ctx.fillStyle = '#a9aaa6';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 3, 0, TAU);
      ctx.fill();
      return true;
    case 'urn':
      ctx.fillStyle = '#8a8b84';
      ctx.fillRect(d.x - 7, d.y - 7, 14, 14);
      ctx.fillStyle = '#2d4a2f';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 5, 0, TAU);
      ctx.fill();
      return true;
    case 'reeds':
      ctx.fillStyle = 'rgba(74,90,52,0.8)';
      for (let k = 0; k < 9; k++) ctx.fillRect(d.x + (hash01(d.x + k * 3.3) - 0.5) * 30, d.y + (hash01(d.y + k * 5.1) - 0.5) * 22, 2, 2);
      return true;
    default:
      return false;
  }
}

export const THEMES = {
  graveyard: { base: '#1b261d', ground: graveyardGround, mist: (ctx, game, vr) => mist(ctx, game, vr, 400, 0.42) },
  suburbia: { base: '#25272b', ground: suburbiaGround },
  junkyard: { base: '#2a2520', ground: junkyardGround },
};

