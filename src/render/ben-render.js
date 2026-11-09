// We Left Ben: what Ben leaves behind, drawn. Placement: world/ben-gen.js;
// run time (glimpse, papers, whistle): game/ben.js.
//
// His look, so players learn to spot it: orange crayon, small lowercase
// words, and two little googly eyes (like the logo's) whose pupils always
// look at something. The eyes glow faintly in the dark.

import { TAU, pointInRect } from '../util.js';
import { circle, hash01 } from './draw-utils.js';
import { BEN_COLOR, SQUAD_DRAWING } from '../world/ben-content.js';

const CRAYON = '"Chalkboard SE", "Comic Sans MS", "Segoe Print", "Bradley Hand", "Marker Felt", cursive';
const KID = '"Chalkboard SE", "Comic Sans MS", "Segoe Print", "Marker Felt", system-ui, sans-serif';

/** Two little googly eyes, pupils toward `look`. Kept upright, like the logo's. */
export function drawEyes(ctx, x, y, look, s = 1, alpha = 1, outline = true) {
  const r = 4.4 * s;
  const gap = 5 * s;
  for (const side of [-1, 1]) {
    const ex = x + side * gap;
    ctx.fillStyle = `rgba(240,234,220,${0.95 * alpha})`;
    ctx.beginPath();
    circle(ctx, ex, y, r);
    ctx.fill();
    if (outline) {
      ctx.strokeStyle = `rgba(255,138,30,${0.9 * alpha})`;
      ctx.lineWidth = 1.1 * s;
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(14,14,16,${alpha})`;
    ctx.beginPath();
    circle(ctx, ex + Math.cos(look) * r * 0.42, y + Math.sin(look) * r * 0.42, r * 0.46);
    ctx.fill();
  }
}

function crayonText(ctx, text, size, alpha = 0.9) {
  ctx.font = `700 ${size}px ${CRAYON}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = BEN_COLOR;
  ctx.globalAlpha = alpha * 0.35;
  ctx.fillText(text, 0.6, 0.5);
  ctx.globalAlpha = alpha;
  ctx.fillText(text, 0, 0);
  ctx.globalAlpha = 1;
}

// --- Ground (under the darkness) -----------------------------------------------------------------

/** Returns true if it drew it. */
export function drawBenDecor(ctx, d, t) {
  switch (d.type) {
    case 'bentext':
      ctx.save();
      ctx.translate(d.x, d.y);
      if (d.a) ctx.rotate(d.a);
      crayonText(ctx, d.text, d.size);
      ctx.restore();
      return true;
    case 'beneyes':
      drawEyes(ctx, d.x, d.y, d.look, d.s || 1);
      return true;
    case 'benfort':
      drawFort(ctx, d);
      return true;
    case 'rabbit':
      drawRabbit(ctx, d);
      return true;
    case 'benchalk':
      // His map of this place / the squad drawing, in chalk on the ground.
      ctx.save();
      ctx.translate(d.x, d.y);
      if (d.a) ctx.rotate(d.a);
      ctx.translate(-d.w / 2, -d.h / 2);
      if (d.kind === 'map') drawMapSketch(ctx, d.sketch, d.theme, d.w, d.h);
      else drawSquad(ctx, d.w, d.h);
      ctx.restore();
      return true;
    case 'vent':
      drawVent(ctx, d);
      return true;
    case 'footprints':
      ctx.fillStyle = 'rgba(205,195,175,0.3)';
      for (const [x, y, a] of d.pts) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(1.6, 0, 5, 2.4, 0, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-4.6, 0, 2.1, 2, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      return true;
    case 'benarrow':
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.a);
      ctx.strokeStyle = BEN_COLOR;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-13, 1);
      ctx.quadraticCurveTo(0, -1.5, 13, 0);
      ctx.moveTo(13, 0);
      ctx.lineTo(6, -6);
      ctx.moveTo(13, 0);
      ctx.lineTo(6.5, 6);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
      return true;
    case 'raft': {
      const bob = Math.sin(t * 1.4 + d.x * 0.01) * 1.6;
      ctx.save();
      ctx.translate(d.x, d.y + bob);
      ctx.rotate(Math.sin(t * 0.7 + d.y) * 0.05);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-21, -12, 46, 30);
      ctx.fillStyle = '#7a5f40';
      ctx.fillRect(-24, -15, 48, 30);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = -15 + 7.5; y < 15; y += 7.5) {
        ctx.moveTo(-24, y);
        ctx.lineTo(24, y);
      }
      ctx.stroke();
      ctx.fillStyle = '#b8352a';
      ctx.beginPath();
      circle(ctx, 27, -9, 5);
      ctx.fill();
      ctx.translate(0, 1);
      crayonText(ctx, d.text, 7.5, 0.95);
      ctx.restore();
      return true;
    }
    default:
      return false;
  }
}

/** His bed: a cardboard fort (open toward +x in its own frame), a sleeping bag, a folded blanket, a candle jar, the tally. */
function drawFort(ctx, d) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.rotate(d.a || 0);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(-32, -28, 56, 62);
  // Floor: sleeping bag (pillow at the back), the square blanket at the foot.
  ctx.fillStyle = '#4b6a88';
  ctx.fillRect(-21, -12, 26, 24);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -16; x < 5; x += 5) {
    ctx.moveTo(x, -12);
    ctx.lineTo(x, 12);
  }
  ctx.stroke();
  ctx.fillStyle = '#d8d0bd';
  ctx.fillRect(-21, -9, 7, 18);
  ctx.fillStyle = '#8a4d3a';
  ctx.fillRect(6, -7, 11, 11);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.strokeRect(6.5, -6.5, 10, 10);
  ctx.beginPath();
  ctx.moveTo(6.5, -1.5);
  ctx.lineTo(16.5, -1.5);
  ctx.stroke();
  // Candle in a jar, back corner.
  ctx.fillStyle = 'rgba(200,230,240,0.35)';
  ctx.beginPath();
  circle(ctx, -18, -16, 3.6);
  ctx.fill();
  ctx.fillStyle = '#efe6cf';
  ctx.beginPath();
  circle(ctx, -18, -16, 2);
  ctx.fill();
  // A can by the bed.
  ctx.fillStyle = '#8f969c';
  ctx.beginPath();
  circle(ctx, -6, 16, 3);
  ctx.fill();
  ctx.fillStyle = '#5c6268';
  ctx.beginPath();
  circle(ctx, -6, 16, 1.8);
  ctx.fill();
  // Cardboard walls: back and both sides.
  const box = (x, y, w, h) => {
    ctx.fillStyle = '#9c7650';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(60,40,20,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = 'rgba(220,200,160,0.55)';
    if (w > h) ctx.fillRect(x + w / 2 - 1.5, y, 3, h);
    else ctx.fillRect(x, y + h / 2 - 1.5, w, 3);
  };
  box(-34, -30, 12, 60);
  box(-34, -30, 52, 11);
  box(-34, 19, 52, 11);
  // Nights slept: tally marks down the back wall, in orange.
  ctx.strokeStyle = BEN_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const n = d.slept || 20;
  for (let k = 0; k < n; k++) {
    const g = Math.floor(k / 5);
    const j = k % 5;
    const y = -26 + g * 8.5 + (j < 4 ? j * 1.6 : 0);
    if (y > 26) break;
    if (j < 4) {
      ctx.moveTo(-31, y);
      ctx.lineTo(-25, y);
    } else {
      ctx.moveTo(-31.5, -26 + g * 8.5 - 0.8);
      ctx.lineTo(-24.5, -26 + g * 8.5 + 5.6);
    }
  }
  ctx.stroke();
  // Drawings taped to the side walls.
  for (const [x, y, c] of [[-14, -27.5, '#5f8fd0'], [2, -27.5, '#e05a4a'], [-6, 21.5, '#59a85a']]) {
    ctx.fillStyle = '#f1ead8';
    ctx.fillRect(x, y, 9, 6);
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.moveTo(x + 1.5, y + 4);
    ctx.lineTo(x + 4, y + 1.5);
    ctx.lineTo(x + 7.5, y + 4.5);
    ctx.stroke();
  }
  ctx.restore();
}

/** The stuffed rabbit: one ear chewed short, sewn-on googly eyes. */
function drawRabbit(ctx, d) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.rotate(d.a || 0);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(1.5, 3, 8, 10, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#bcb1a3';
  ctx.beginPath();
  ctx.ellipse(0, 3, 6.5, 8, 0, 0, TAU); // body
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-3.5, -15, 2.3, 7, -0.15, 0, TAU); // the good ear
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(3.2, -12, 2.3, 4, 0.2, 0, TAU); // the chewed one
  ctx.fill();
  ctx.beginPath();
  circle(ctx, 0, -7, 5.5); // head
  ctx.fill();
  ctx.fillStyle = '#e5a9b0';
  ctx.beginPath();
  ctx.ellipse(-3.5, -15, 1, 4.5, -0.15, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#d98c96';
  ctx.beginPath();
  circle(ctx, 0, -5, 1);
  ctx.fill();
  // Stitches on the chewed ear.
  ctx.strokeStyle = 'rgba(60,40,40,0.6)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(1.6, -14.5);
  ctx.lineTo(4.6, -15.2);
  ctx.stroke();
  drawEyes(ctx, 0, -8.5, Math.PI / 2, 0.42, 1, false);
  ctx.restore();
}

/** A vent at the base of a wall (its opening along the wall; d.a points away from the wall). */
function drawVent(ctx, d) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.rotate(d.a);
  ctx.fillStyle = '#5a5e63';
  ctx.fillRect(-4, -13, 6, 26);
  ctx.fillStyle = '#0b0c0e';
  ctx.fillRect(-3, -11, 4, 22);
  const slats = (x, y) => {
    ctx.fillStyle = '#6d7277';
    ctx.fillRect(x, y, 6, 22);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    for (let k = 0; k < 6; k++) ctx.fillRect(x + 1, y + 2 + k * 3.4, 4, 1.4);
  };
  if (d.open) {
    // The grate on the floor, and its screws in a neat little row.
    ctx.save();
    ctx.translate(9, 0);
    ctx.rotate(0.12);
    slats(0, -11);
    ctx.restore();
    ctx.fillStyle = '#c9c4b8';
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      circle(ctx, 21, -4.5 + k * 3, 0.9);
      ctx.fill();
    }
  } else slats(-3, -11);
  ctx.restore();
}

// --- Over the darkness ---------------------------------------------------------------------------------

/** The eyes glow a little in the dark; the candle in his bed; the glimpse. */
export function drawBenBright(ctx, game, vr) {
  const map = game.world.map;
  if (!map.ben) return;
  const t = game.time;
  const p = game.player;
  const W = game.world;
  const night = game.settings.night;
  if (night) {
    const pulse = 0.14 + 0.06 * Math.sin(t * 1.3);
    for (const d of map.decor) {
      if (d.type !== 'beneyes' || !pointInRect(d.x, d.y, vr, 10)) continue;
      if (!W.segmentClear(p.x, p.y, d.x, d.y)) continue;
      const s = d.s || 1;
      for (const side of [-1, 1]) {
        ctx.fillStyle = `rgba(230,255,230,${pulse})`;
        ctx.beginPath();
        circle(ctx, d.x + side * 5 * s, d.y, 4.4 * s);
        ctx.fill();
      }
    }
  }
  const G = game.ben;
  const n = map.ben.nest;
  if (n && pointInRect(n.candle.x, n.candle.y, vr, 20) && W.segmentClear(p.x, p.y, n.candle.x, n.candle.y)) {
    const fl = 0.6 + 0.4 * Math.sin(t * 11 + 1.3) * Math.sin(t * 6.1);
    ctx.fillStyle = `rgba(255,190,110,${0.28 * fl})`;
    ctx.beginPath();
    circle(ctx, n.candle.x, n.candle.y, 8);
    ctx.fill();
    ctx.fillStyle = `rgba(255,236,170,${0.75 + 0.25 * fl})`;
    ctx.beginPath();
    circle(ctx, n.candle.x, n.candle.y - 0.5, 1.4 + fl * 0.8);
    ctx.fill();
  }
  // The glimpse: two eyes catching your light, then a blink, then nothing.
  const g = G && G.glimpse;
  if (g && (g.state === 'wait' || g.state === 'seen') && pointInRect(g.x, g.y, vr, 20)) {
    let a = g.state === 'wait' ? Math.min(1, g.lit * 1.4) : 1;
    let lid = 1;
    if (g.state === 'seen') lid = Math.max(0, 1 - g.t / 0.16);
    if (g.state === 'seen' && g.t > 0.16) a = 0;
    if (a > 0.03 && lid > 0) {
      const look = Math.atan2(p.y - g.y, p.x - g.x);
      ctx.save();
      ctx.translate(g.x, g.y - 8);
      ctx.scale(1, lid);
      drawEyes(ctx, 0, 0, look, 0.75, a, false);
      ctx.restore();
    }
  }
}

/** "ben was here" on roofs, shelf tops, container stacks, the quarantine wall and crane 3's boom (above everything). */
export function drawBenRoof(ctx, game, vr) {
  const map = game.world.map;
  if (!map.benRoof || !map.benRoof.length) return;
  const night = game.settings.night;
  for (const e of map.benRoof) {
    let x = e.x;
    let y = e.y;
    let size = e.size;
    let a = e.a || 0;
    if (e.type === 'boom') {
      const c = map.cranes && map.cranes[e.crane];
      if (!c) continue;
      x = c.x1 + c.boom * 0.55;
      y = (c.y + c.y1) / 2;
      size = 12;
      a = 0;
    }
    if (!pointInRect(x, y, vr, 120)) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.font = `700 ${size}px ${CRAYON}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = Math.max(2, size * 0.22);
    ctx.strokeText(e.text, 0, 0);
    ctx.fillStyle = BEN_COLOR;
    ctx.globalAlpha = night ? 0.8 : 0.95;
    ctx.fillText(e.text, 0, 0);
    ctx.globalAlpha = 1;
    if (!e.small) {
      const w = ctx.measureText(e.text).width;
      drawEyes(ctx, w / 2 + size * 0.75, 0, 0, size * 0.09, night ? 0.8 : 1);
    }
    ctx.restore();
  }
}

// --- His chalk drawings (on the ground by his bed) ------------------------------------------------------

const CHALK = 'rgba(232,228,214,0.78)';
const CHALK_DIM = 'rgba(232,228,214,0.45)';

function wobblyRect(ctx, x, y, w, h, seed) {
  const j = (k) => (hash01(seed * 7.13 + k * 3.7) - 0.5) * 2.4;
  ctx.moveTo(x + j(1), y + j(2));
  ctx.lineTo(x + w + j(3), y + j(4));
  ctx.lineTo(x + w + j(5), y + h + j(6));
  ctx.lineTo(x + j(7), y + h + j(8));
  ctx.closePath();
}

function kidLabel(ctx, text, x, y, size, color) {
  ctx.font = `700 ${size}px ${KID}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** His map of this place: chalk blocks, his marks in orange, and one place off the edge. */
function drawMapSketch(ctx, sk, theme, W, H) {
  if (!sk) return;
  const pad = 12;
  const bx0 = Math.min(0, sk.away.x);
  const bx1 = Math.max(sk.w, sk.away.x);
  const by0 = Math.min(0, sk.away.y);
  const by1 = Math.max(sk.h, sk.away.y);
  const s = Math.min((W - pad * 2) / (bx1 - bx0), (H - pad * 2) / (by1 - by0));
  const ox = pad + ((W - pad * 2) - (bx1 - bx0) * s) / 2 - bx0 * s;
  const oy = pad + ((H - pad * 2) - (by1 - by0) * s) / 2 - by0 * s;
  const X = (v) => ox + v * s;
  const Y = (v) => oy + v * s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (sk.quay !== null && sk.quay !== undefined) {
    // Wavy lines for the water.
    ctx.strokeStyle = 'rgba(150,195,235,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const wy = Y(sk.h * (0.12 + k * 0.18));
      const wx = X(sk.quay) + 8 + (k % 2) * 8;
      ctx.moveTo(wx, wy);
      ctx.quadraticCurveTo(wx + 4, wy - 3, wx + 8, wy);
      ctx.quadraticCurveTo(wx + 12, wy + 3, wx + 16, wy);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = CHALK_DIM;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  sk.rects.forEach((q, i) => wobblyRect(ctx, X(q[0]) + 1, Y(q[1]) + 1, q[2] * s - 2, q[3] * s - 2, i + 1));
  ctx.stroke();
  // His ways round: dotted orange from his bed to every pair of eyes.
  if (sk.nest) {
    ctx.strokeStyle = 'rgba(255,138,30,0.85)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (const e of [...sk.eyes, ...(sk.secret ? [sk.secret] : [])]) {
      ctx.moveTo(X(sk.nest.x), Y(sk.nest.y));
      ctx.quadraticCurveTo((X(sk.nest.x) + X(e.x)) / 2 + 8, (Y(sk.nest.y) + Y(e.y)) / 2 - 8, X(e.x), Y(e.y));
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Where you started (and left): three little figures.
  const sx = X(sk.start.x);
  const sy = Y(sk.start.y);
  ctx.strokeStyle = CHALK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const fx = sx - 7 + k * 7;
    ctx.moveTo(fx, sy - 7);
    ctx.lineTo(fx, sy + 2);
    ctx.moveTo(fx + 2.6, sy - 10);
    ctx.arc(fx, sy - 10, 2.6, 0, TAU);
  }
  ctx.stroke();
  kidLabel(ctx, 'you left', sx, sy + 12, 11, CHALK);
  // The way out.
  const gx = X(sk.goal.x);
  const gy = Y(sk.goal.y);
  ctx.beginPath();
  if (theme === 'docks') {
    ctx.moveTo(gx - 10, gy - 2);
    ctx.lineTo(gx + 10, gy - 2);
    ctx.lineTo(gx + 7, gy + 4);
    ctx.lineTo(gx - 7, gy + 4);
    ctx.closePath();
    ctx.moveTo(gx, gy - 2);
    ctx.lineTo(gx, gy - 11);
    ctx.lineTo(gx + 6, gy - 6);
  } else ctx.rect(gx - 6, gy - 8, 12, 14);
  ctx.stroke();
  kidLabel(ctx, theme === 'docks' ? 'boat' : theme === 'interior' ? 'exit' : 'safe?', gx, gy + 14, 11, CHALK);
  // His bed.
  if (sk.nest) {
    const nx = X(sk.nest.x);
    const ny = Y(sk.nest.y);
    ctx.strokeStyle = BEN_COLOR;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.rect(nx - 7, ny - 3.5, 14, 7);
    ctx.moveTo(nx - 7, ny - 3.5);
    ctx.lineTo(nx - 7, ny - 8);
    ctx.stroke();
    kidLabel(ctx, 'bed', nx, ny + 12, 11, BEN_COLOR);
  }
  // Something you missed.
  if (sk.secret) {
    const ex = X(sk.secret.x);
    const ey = Y(sk.secret.y);
    drawEyes(ctx, ex, ey - 6, Math.PI / 2, 0.7);
    ctx.strokeStyle = BEN_COLOR;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(ex - 3.5, ey + 1);
    ctx.lineTo(ex + 3.5, ey + 8);
    ctx.moveTo(ex + 3.5, ey + 1);
    ctx.lineTo(ex - 3.5, ey + 8);
    ctx.stroke();
  }
  // And off the edge of this map, the place nobody's found.
  const ax = X(sk.away.x);
  const ay = Y(sk.away.y);
  ctx.strokeStyle = BEN_COLOR;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  if (sk.away.kind === 'island') {
    ctx.ellipse(ax, ay + 4, 12, 5.5, 0, 0, TAU);
    ctx.moveTo(ax + 2, ay + 1);
    ctx.lineTo(ax + 2, ay - 11);
    ctx.lineTo(ax + 5.5, ay - 11);
    ctx.lineTo(ax + 5.5, ay + 1);
  } else if (sk.away.kind === 'stairs') {
    ctx.moveTo(ax - 11, ay - 7);
    for (let k = 0; k < 4; k++) {
      ctx.lineTo(ax - 11 + (k + 1) * 5.5, ay - 7 + k * 3.5);
      ctx.lineTo(ax - 11 + (k + 1) * 5.5, ay - 3.5 + k * 3.5);
    }
  } else {
    ctx.moveTo(ax - 7, ay + 6);
    ctx.lineTo(ax - 7, ay - 2);
    ctx.lineTo(ax, ay - 9);
    ctx.lineTo(ax + 7, ay - 2);
    ctx.lineTo(ax + 7, ay + 6);
    ctx.closePath();
  }
  ctx.stroke();
  kidLabel(ctx, '?', ax + 15, ay - 9, 16, BEN_COLOR);
}

/** "my squad": five holding hands and a dog, and one more standing apart (chalk). */
function drawSquad(ctx, W, H) {
  const ground = H * 0.74;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Sun, grass.
  ctx.strokeStyle = 'rgba(245,205,80,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  circle(ctx, 18, 16, 8);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    ctx.moveTo(18 + Math.cos(a) * 11, 16 + Math.sin(a) * 11);
    ctx.lineTo(18 + Math.cos(a) * 15, 16 + Math.sin(a) * 15);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120,200,110,0.75)';
  ctx.beginPath();
  ctx.moveTo(4, ground + 2);
  for (let x = 4; x < W - 6; x += 12) ctx.quadraticCurveTo(x + 3, ground - 2, x + 6, ground + 2);
  ctx.stroke();
  kidLabel(ctx, 'my squad', W * 0.42, 13, 16, CHALK);
  const cols = ['rgba(255,140,170,0.9)', 'rgba(140,190,255,0.9)', 'rgba(200,160,255,0.9)', 'rgba(140,230,150,0.9)', 'rgba(255,200,120,0.9)'];
  const fig = (x, color, head, label, apart = false) => {
    const top = ground - (apart ? 34 : 38);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    circle(ctx, x, top, head);
    ctx.moveTo(x, top + head);
    ctx.lineTo(x, ground - 14);
    ctx.lineTo(x - 6, ground);
    ctx.moveTo(x, ground - 14);
    ctx.lineTo(x + 6, ground);
    ctx.stroke();
    if (label) kidLabel(ctx, label, x, ground + 12, 10.5, CHALK);
    return top;
  };
  const n = SQUAD_DRAWING.names.length;
  const x0 = W * 0.09;
  const step = W * 0.112;
  for (let k = 0; k < n; k++) {
    const x = x0 + k * step;
    const c = cols[k % cols.length];
    const top = fig(x, c, 5.5, SQUAD_DRAWING.names[k]);
    // Smiles, and hands held.
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.arc(x, top + 0.5, 2.6, 0.2, Math.PI - 0.2);
    ctx.moveTo(x, top + 12);
    ctx.lineTo(x - step / 2, top + 16);
    ctx.moveTo(x, top + 12);
    ctx.lineTo(x + step / 2, top + 16);
    ctx.stroke();
  }
  // The dog.
  const dx = x0 + n * step;
  ctx.strokeStyle = 'rgba(215,175,130,0.9)';
  ctx.beginPath();
  ctx.ellipse(dx, ground - 7, 7, 4, 0, 0, TAU);
  ctx.moveTo(dx + 6, ground - 9);
  ctx.arc(dx + 9, ground - 11, 3, 0, TAU);
  ctx.moveTo(dx - 7, ground - 8);
  ctx.lineTo(dx - 11, ground - 13);
  ctx.moveTo(dx - 4, ground - 4);
  ctx.lineTo(dx - 4, ground);
  ctx.moveTo(dx + 4, ground - 4);
  ctx.lineTo(dx + 4, ground);
  ctx.stroke();
  kidLabel(ctx, SQUAD_DRAWING.dog, dx + 2, ground + 12, 9.5, CHALK);
  // One more, over there. No name. Arms down.
  const bx = W * 0.9;
  const top = fig(bx, BEN_COLOR, 4.8, null, true);
  ctx.strokeStyle = BEN_COLOR;
  ctx.beginPath();
  ctx.moveTo(bx, top + 10);
  ctx.lineTo(bx - 4, top + 20);
  ctx.moveTo(bx, top + 10);
  ctx.lineTo(bx + 4, top + 20);
  ctx.stroke();
  drawEyes(ctx, bx, top - 0.5, Math.PI, 0.42, 1, false);
}
