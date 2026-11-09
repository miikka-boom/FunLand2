// World flavor visuals: spray paint and marker text, doodles, posters on
// walls, rooftop messages, survivor dens (bedding, candles, stove, cans,
// radio, notes) and small scenes (bus stop, lemonade stand, last stand,
// fridge note, whiteboard, take-a-number). Placement: world/lore-gen.js.

import { TAU, pointInRect } from '../util.js';
import { rrect, circle, hash01 } from './draw-utils.js';
import { POSTERS, whiteboardLen } from '../world/lore-content.js';

const SPRAY_FONT = 'Impact, "Arial Black", "Helvetica Neue", system-ui, sans-serif';
const MARKER_FONT = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", "Segoe Print", system-ui, sans-serif';
const PRINT_FONT = '"Helvetica Neue", Arial, system-ui, sans-serif';

// --- Ground (under the darkness: you need light to read it) -------------------------------------

/** Returns true if it drew something (so the caller can skip other handlers). */
export function drawLoreDecor(ctx, d) {
  switch (d.type) {
    case 'graffiti':
      drawGraffiti(ctx, d);
      return true;
    case 'doodle':
      drawDoodle(ctx, d);
      return true;
    case 'note':
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.a || 0);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-5, -6, 13, 16);
      ctx.fillStyle = '#efe9d6';
      ctx.fillRect(-6, -8, 13, 16);
      ctx.fillStyle = 'rgba(40,40,60,0.6)';
      for (let k = 0; k < 5; k++) ctx.fillRect(-4, -5 + k * 3, 9 - (k === 4 ? 4 : 0), 0.8);
      ctx.restore();
      return true;
    case 'mattress': {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.a || 0);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-15, -30, 34, 64);
      ctx.fillStyle = '#8fa0b0';
      ctx.fillRect(-17, -32, 34, 64);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let x = -14; x < 17; x += 7) ctx.fillRect(x, -32, 3, 64);
      ctx.fillStyle = '#d9d5c8';
      ctx.fillRect(-13, -29, 26, 12);
      ctx.fillStyle = '#6b3b3b';
      ctx.fillRect(-17, 4, 34, 28);
      ctx.restore();
      return true;
    }
    case 'candle':
      ctx.fillStyle = '#e8e2cc';
      ctx.beginPath();
      circle(ctx, d.x, d.y, 3);
      ctx.fill();
      return true;
    case 'stove':
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(d.x - 8, d.y - 8, 16, 16);
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      circle(ctx, d.x, d.y, 5);
      ctx.stroke();
      ctx.fillStyle = '#6b6b6b';
      ctx.fillRect(d.x + 9, d.y - 4, 7, 8);
      return true;
    case 'cans': {
      const n = d.trail ? 6 : 7;
      for (let k = 0; k < n; k++) {
        const hx = d.trail ? (k - n / 2) * 7 : (hash01(d.x + k * 1.3) - 0.5) * 22 * (d.s || 1);
        const hy = d.trail ? Math.sin(k * 1.7) * 6 : (hash01(d.y + k * 2.1) - 0.5) * 16 * (d.s || 1);
        ctx.fillStyle = k % 3 ? '#a9adb1' : '#c0392b';
        ctx.beginPath();
        circle(ctx, d.x + hx, d.y + hy, 3.2);
        ctx.fill();
        if (d.trail) {
          ctx.strokeStyle = 'rgba(220,220,220,0.5)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(d.x + hx, d.y + hy);
          ctx.lineTo(d.x + hx * 0.2, d.y);
          ctx.stroke();
        }
      }
      return true;
    }
    case 'radio':
      ctx.fillStyle = '#3b3f45';
      ctx.fillRect(d.x - 10, d.y - 6, 20, 12);
      ctx.fillStyle = '#c9a227';
      ctx.beginPath();
      circle(ctx, d.x - 4, d.y, 3);
      ctx.fill();
      ctx.strokeStyle = '#9a9a9a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(d.x + 6, d.y - 6);
      ctx.lineTo(d.x + 14, d.y - 18);
      ctx.stroke();
      return true;
    case 'suitcase':
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.scale(d.s || 1, d.s || 1);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-8, -5, 18, 13);
      ctx.fillStyle = d.c || '#7a4a2a';
      ctx.beginPath();
      rrect(ctx, -9, -7, 18, 13, 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(-3, -9, 6, 2);
      ctx.restore();
      return true;
    case 'sign':
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(d.x - 1, d.y - 2, 2, 10);
      ctx.fillStyle = '#d6d2c4';
      ctx.fillRect(d.x - 20, d.y - 9, 40, 9);
      ctx.fillStyle = '#1b1b1b';
      ctx.font = `800 6px ${PRINT_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.text, d.x, d.y - 4.5);
      return true;
    case 'stand':
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(d.x - 20, d.y - 8, 42, 20);
      ctx.fillStyle = '#d9c27a';
      ctx.fillRect(d.x - 22, d.y - 10, 42, 18);
      ctx.fillStyle = '#e8d84a';
      ctx.fillRect(d.x - 18, d.y - 6, 8, 8);
      ctx.fillStyle = '#c94a4a';
      ctx.font = `900 5px ${PRINT_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LEMONADE', d.x + 2, d.y - 2);
      return true;
    case 'casings':
      ctx.fillStyle = '#c9a33f';
      for (let k = 0; k < 16; k++) {
        const hx = (hash01(d.x + k * 3.3) - 0.5) * 34 * (d.s || 1);
        const hy = (hash01(d.y + k * 1.9) - 0.5) * 26 * (d.s || 1);
        ctx.fillRect(d.x + hx, d.y + hy, 2.4, 1.2);
      }
      return true;
    case 'junk':
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.fillStyle = '#5b4a3a';
      ctx.rotate(0.4);
      ctx.fillRect(-20, -4, 40, 8);
      ctx.rotate(-0.9);
      ctx.fillStyle = '#4a3d33';
      ctx.fillRect(-16, -3, 32, 6);
      ctx.restore();
      return true;
    case 'fridge':
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(d.x - 13, d.y - 9, 28, 22);
      ctx.fillStyle = '#e7e7e2';
      ctx.fillRect(d.x - 14, d.y - 11, 28, 22);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(d.x - 14, d.y - 2, 28, 1.5);
      ctx.fillStyle = '#f2d94c';
      ctx.fillRect(d.x + 3, d.y + 1, 7, 7);
      return true;
    case 'ticket':
      ctx.fillStyle = '#b3261e';
      ctx.fillRect(d.x - 4, d.y - 4, 8, 8);
      ctx.fillStyle = '#efe9d6';
      for (let k = 0; k < 5; k++) ctx.fillRect(d.x - 18 + k * 9 + hash01(k + d.x) * 4, d.y + 10 + hash01(k * 2 + d.y) * 6, 4, 3);
      return true;
    case 'whiteboard': {
      // The words are on the board, big enough to read from above.
      ctx.font = `700 10px ${MARKER_FONT}`;
      const len = Math.max(70, whiteboardLen(d.text));
      const w = d.horiz ? len : 15;
      const h = d.horiz ? 15 : len;
      ctx.fillStyle = '#9aa0a6';
      ctx.fillRect(d.x - w / 2 - 1, d.y - h / 2 - 1, w + 2, h + 2);
      ctx.fillStyle = '#f4f4f0';
      ctx.fillRect(d.x - w / 2, d.y - h / 2, w, h);
      ctx.save();
      ctx.translate(d.x, d.y);
      if (!d.horiz) ctx.rotate(Math.PI / 2);
      ctx.fillStyle = 'rgba(30,60,160,0.9)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.text || '', 0, 0.5);
      ctx.restore();
      return true;
    }
    default:
      return false;
  }
}

function drawGraffiti(ctx, d) {
  ctx.save();
  ctx.translate(d.x, d.y);
  if (d.a) ctx.rotate(d.a);
  const size = Math.round(d.size);
  ctx.font = `${d.marker ? 700 : 400} ${size}px ${d.marker ? MARKER_FONT : SPRAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = d.color;
  if (!d.marker) {
    // Overspray halo.
    ctx.globalAlpha = 0.22;
    ctx.fillText(d.text, 1.3, 1.1);
    ctx.fillText(d.text, -1, -0.9);
  }
  ctx.globalAlpha = d.marker ? 0.78 : 0.85;
  ctx.fillText(d.text, 0, 0);
  if (d.drip) {
    const w = ctx.measureText(d.text).width;
    ctx.globalAlpha = 0.6;
    for (let k = 0; k < 4; k++) {
      const hx = (hash01(d.x * 0.7 + k * 13.1) - 0.5) * w * 0.9;
      const len = 3 + hash01(d.y + k * 7.7) * size * 0.6;
      ctx.fillRect(hx, size * 0.32, 1.4, len);
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawDoodle(ctx, d) {
  const s = d.s || 1;
  ctx.save();
  ctx.translate(d.x, d.y);
  if (d.a) ctx.rotate(d.a);
  ctx.scale(s, s);
  ctx.strokeStyle = d.color;
  ctx.fillStyle = d.color;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 2.2 / Math.sqrt(s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (d.art) {
    case 'smiley':
    case 'deadsmiley': {
      circle(ctx, 0, 0, 13);
      ctx.stroke();
      ctx.beginPath();
      if (d.art === 'smiley') {
        circle(ctx, -4.5, -3, 1.6);
        circle(ctx, 4.5, -3, 1.6);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 1, 7, 0.2, Math.PI - 0.2);
      } else {
        for (const ex of [-4.5, 4.5]) {
          ctx.moveTo(ex - 2.5, -5.5);
          ctx.lineTo(ex + 2.5, -0.5);
          ctx.moveTo(ex + 2.5, -5.5);
          ctx.lineTo(ex - 2.5, -0.5);
        }
        ctx.moveTo(-6, 6);
        ctx.lineTo(6, 6);
      }
      ctx.stroke();
      break;
    }
    case 'drowser':
      circle(ctx, 0, -6, 8);
      ctx.moveTo(-6, -9);
      ctx.lineTo(-2, -7);
      ctx.moveTo(2, -7);
      ctx.lineTo(6, -9);
      ctx.moveTo(0, 2);
      ctx.lineTo(0, 16);
      ctx.moveTo(0, 6);
      ctx.lineTo(16, 4);
      ctx.moveTo(0, 8);
      ctx.lineTo(15, 9);
      ctx.moveTo(0, 16);
      ctx.lineTo(-6, 26);
      ctx.moveTo(0, 16);
      ctx.lineTo(6, 26);
      ctx.stroke();
      ctx.beginPath();
      circle(ctx, 0, -2, 2);
      ctx.fill();
      break;
    case 'crown':
      ctx.moveTo(-12, 6);
      ctx.lineTo(-12, -6);
      ctx.lineTo(-6, 0);
      ctx.lineTo(0, -9);
      ctx.lineTo(6, 0);
      ctx.lineTo(12, -6);
      ctx.lineTo(12, 6);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'ttt':
      ctx.moveTo(-4, -12);
      ctx.lineTo(-4, 12);
      ctx.moveTo(4, -12);
      ctx.lineTo(4, 12);
      ctx.moveTo(-12, -4);
      ctx.lineTo(12, -4);
      ctx.moveTo(-12, 4);
      ctx.lineTo(12, 4);
      ctx.moveTo(-10, -10);
      ctx.lineTo(-6, -6);
      ctx.moveTo(-6, -10);
      ctx.lineTo(-10, -6);
      ctx.moveTo(6, 6);
      ctx.lineTo(10, 10);
      ctx.moveTo(10, 6);
      ctx.lineTo(6, 10);
      ctx.stroke();
      ctx.beginPath();
      circle(ctx, 0, 0, 2.4);
      circle(ctx, 8, -8, 2.4);
      ctx.stroke();
      break;
    case 'runner':
      circle(ctx, 4, -12, 3.5);
      ctx.moveTo(3, -8);
      ctx.lineTo(-1, 3);
      ctx.moveTo(1, -4);
      ctx.lineTo(9, -1);
      ctx.moveTo(1, -4);
      ctx.lineTo(-7, -6);
      ctx.moveTo(-1, 3);
      ctx.lineTo(6, 10);
      ctx.moveTo(-1, 3);
      ctx.lineTo(-8, 8);
      ctx.moveTo(-16, -4);
      ctx.lineTo(-11, -4);
      ctx.moveTo(-17, 1);
      ctx.lineTo(-12, 1);
      ctx.stroke();
      break;
    case 'cat':
      circle(ctx, 0, 0, 10);
      ctx.moveTo(-9, -4);
      ctx.lineTo(-7, -14);
      ctx.lineTo(-2, -9);
      ctx.moveTo(9, -4);
      ctx.lineTo(7, -14);
      ctx.lineTo(2, -9);
      ctx.moveTo(-4, 3);
      ctx.lineTo(-15, 1);
      ctx.moveTo(-4, 5);
      ctx.lineTo(-15, 7);
      ctx.moveTo(4, 3);
      ctx.lineTo(15, 1);
      ctx.moveTo(4, 5);
      ctx.lineTo(15, 7);
      ctx.stroke();
      break;
    case 'sun':
      circle(ctx, 0, 0, 8);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        ctx.moveTo(Math.cos(a) * 11, Math.sin(a) * 11);
        ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16);
      }
      ctx.stroke();
      ctx.fillRect(-7, -3, 6, 3);
      ctx.fillRect(1, -3, 6, 3);
      break;
    case 'gear': {
      // The Tinkerer's mark: a gear with an eye in it.
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        ctx.moveTo(Math.cos(a) * 11, Math.sin(a) * 11);
        ctx.lineTo(Math.cos(a) * 15, Math.sin(a) * 15);
      }
      ctx.stroke();
      ctx.beginPath();
      circle(ctx, 0, 0, 11);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.quadraticCurveTo(0, -6, 7, 0);
      ctx.quadraticCurveTo(0, 6, -7, 0);
      ctx.stroke();
      ctx.beginPath();
      circle(ctx, 0, 0, 2);
      ctx.fill();
      break;
    }
    case 'heart':
      ctx.moveTo(0, 8);
      ctx.bezierCurveTo(-14, -2, -8, -12, 0, -5);
      ctx.bezierCurveTo(8, -12, 14, -2, 0, 8);
      ctx.stroke();
      break;
    case 'tally':
      for (let g = 0; g < 3; g++) {
        const ox = -26 + g * 20;
        for (let k = 0; k < 4; k++) {
          ctx.moveTo(ox + k * 3.5, -7);
          ctx.lineTo(ox + k * 3.5, 7);
        }
        ctx.moveTo(ox - 2, 5);
        ctx.lineTo(ox + 13, -5);
      }
      ctx.stroke();
      break;
    case 'youarehere':
      circle(ctx, 0, 0, 9);
      ctx.stroke();
      ctx.beginPath();
      circle(ctx, 0, 0, 2.5);
      ctx.fill();
      break;
    case 'arrow':
      ctx.moveTo(-14, 0);
      ctx.lineTo(14, 0);
      ctx.moveTo(14, 0);
      ctx.lineTo(7, -6);
      ctx.moveTo(14, 0);
      ctx.lineTo(7, 6);
      ctx.stroke();
      break;
    default:
      break;
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// --- Posters (on walls, under the darkness) -----------------------------------------------------

export function drawPosters(ctx, game, vr) {
  const map = game.world.map;
  if (!map.posters) return;
  for (const p of map.posters) {
    if (!pointInRect(p.x, p.y, vr, 40)) continue;
    const d = POSTERS[p.design];
    if (!d) continue;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(p.rot || 0);
    const w = p.w;
    const h = p.h;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-w / 2 + 1.5, -h / 2 + 1.5, w, h);
    ctx.fillStyle = d.bg;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    // Headline, fitted to the width.
    const fs = Math.min(h * 0.24, (w * 0.95) / Math.max(4, d.head.length * 0.58));
    ctx.fillStyle = d.fg;
    ctx.font = `900 ${fs.toFixed(1)}px ${PRINT_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.head, 0, -h / 2 + fs * 0.75 + 1);
    posterIcon(ctx, d.icon, 0, h * 0.12, Math.min(w, h) * 0.32, d.fg);
    if (d.sub) {
      ctx.globalAlpha = 0.7;
      ctx.fillRect(-w * 0.35, h / 2 - 3.5, w * 0.7, 1);
      ctx.globalAlpha = 1;
    }
    if (d.scrawl) {
      ctx.save();
      ctx.rotate(-0.35);
      ctx.fillStyle = '#d11f1f';
      ctx.font = `700 ${(fs * 0.9).toFixed(1)}px ${MARKER_FONT}`;
      ctx.fillText(d.scrawl, 0, h * 0.08);
      ctx.restore();
    }
    if (p.torn) {
      // A corner peeled away.
      ctx.fillStyle = 'rgba(20,20,20,0.85)';
      const t = 5 + p.torn * 7;
      ctx.beginPath();
      ctx.moveTo(w / 2, h / 2);
      ctx.lineTo(w / 2 - t, h / 2);
      ctx.lineTo(w / 2, h / 2 - t);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

function posterIcon(ctx, icon, x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.8, r * 0.18);
  ctx.beginPath();
  switch (icon) {
    case 'moon':
      ctx.arc(0, 0, r, 0.6, TAU - 0.6);
      ctx.arc(r * 0.45, 0, r * 0.75, TAU - 0.9, 0.9, true);
      ctx.fill();
      break;
    case 'bolt':
      ctx.moveTo(r * 0.2, -r);
      ctx.lineTo(-r * 0.5, r * 0.1);
      ctx.lineTo(0, r * 0.1);
      ctx.lineTo(-r * 0.2, r);
      ctx.lineTo(r * 0.5, -r * 0.1);
      ctx.lineTo(0, -r * 0.1);
      ctx.closePath();
      ctx.fill();
      break;
    case 'crown':
      ctx.moveTo(-r, r * 0.5);
      ctx.lineTo(-r, -r * 0.4);
      ctx.lineTo(-r * 0.5, 0);
      ctx.lineTo(0, -r * 0.7);
      ctx.lineTo(r * 0.5, 0);
      ctx.lineTo(r, -r * 0.4);
      ctx.lineTo(r, r * 0.5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'stamp':
      circle(ctx, 0, 0, r * 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, 0);
      ctx.lineTo(r * 0.5, 0);
      ctx.stroke();
      break;
    case 'boat':
      ctx.moveTo(-r, 0);
      ctx.lineTo(r, 0);
      ctx.lineTo(r * 0.6, r * 0.5);
      ctx.lineTo(-r * 0.6, r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-r * 0.05, -r, r * 0.12, r);
      break;
    case 'face':
    case 'cat':
    case 'dog':
      circle(ctx, 0, 0, r * 0.8);
      ctx.fill();
      if (icon !== 'face') {
        ctx.beginPath();
        ctx.moveTo(-r * 0.7, -r * 0.3);
        ctx.lineTo(-r * 0.6, -r * (icon === 'cat' ? 1.2 : 0.9));
        ctx.lineTo(-r * 0.2, -r * 0.7);
        ctx.moveTo(r * 0.7, -r * 0.3);
        ctx.lineTo(r * 0.6, -r * (icon === 'cat' ? 1.2 : 0.9));
        ctx.lineTo(r * 0.2, -r * 0.7);
        ctx.fill();
      }
      break;
    case 'star':
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU - Math.PI / 2;
        const rr = k % 2 ? r * 0.45 : r;
        if (k) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case 'radio':
      ctx.fillRect(-r, -r * 0.4, r * 2, r);
      ctx.moveTo(r * 0.5, -r * 0.4);
      ctx.lineTo(r, -r);
      ctx.stroke();
      break;
    case 'pizza':
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.8, r * 0.6);
      ctx.lineTo(-r * 0.8, r * 0.6);
      ctx.closePath();
      ctx.fill();
      break;
    case 'shoe':
      ctx.moveTo(-r, -r * 0.3);
      ctx.lineTo(-r * 0.2, -r * 0.3);
      ctx.lineTo(r, r * 0.2);
      ctx.lineTo(r, r * 0.5);
      ctx.lineTo(-r, r * 0.5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'runner':
      circle(ctx, r * 0.3, -r * 0.7, r * 0.25);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 0.2, -r * 0.4);
      ctx.lineTo(-r * 0.1, r * 0.3);
      ctx.lineTo(r * 0.5, r);
      ctx.moveTo(-r * 0.1, r * 0.3);
      ctx.lineTo(-r * 0.7, r * 0.8);
      ctx.moveTo(-r * 0.6, -r * 0.2);
      ctx.lineTo(r * 0.7, -r * 0.1);
      ctx.stroke();
      break;
    case 'drop':
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(r, r * 0.3, 0, r * 0.8);
      ctx.quadraticCurveTo(-r, r * 0.3, 0, -r);
      ctx.fill();
      break;
    case 'flask':
      ctx.moveTo(-r * 0.25, -r);
      ctx.lineTo(r * 0.25, -r);
      ctx.lineTo(r * 0.25, -r * 0.2);
      ctx.lineTo(r * 0.8, r * 0.8);
      ctx.lineTo(-r * 0.8, r * 0.8);
      ctx.lineTo(-r * 0.25, -r * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      circle(ctx, 0, 0, r * 0.6);
      ctx.fill();
  }
  ctx.restore();
}

// --- Rooftop messages (roof pass: visible from the sky, faint at night) ---------------------------

export function drawRoofArt(ctx, game, vr) {
  const map = game.world.map;
  if (!map.roofArt) return;
  const night = game.settings.night;
  for (const r of map.roofArt) {
    if (!pointInRect(r.x, r.y, vr, Math.max(r.w, r.h))) continue;
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.a || 0);
    const len = Math.max(2, r.text.length);
    const fs = Math.min(r.h * (r.arrow !== null && r.arrow !== undefined ? 0.4 : 0.55), (r.w * 0.82) / (len * 0.62));
    ctx.font = `${fs.toFixed(0)}px ${SPRAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = night ? 'rgba(235,232,220,0.42)' : 'rgba(245,242,230,0.75)';
    const ty = r.arrow !== null && r.arrow !== undefined ? -fs * 0.35 : 0;
    ctx.fillText(r.text, 0, ty);
    if (r.arrow !== null && r.arrow !== undefined) {
      const a = r.arrow - (r.a || 0);
      const L = Math.min(r.w, r.h) * 0.28;
      const ax = 0;
      const ay = fs * 0.55;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = fs * 0.14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax - Math.cos(a) * L, ay - Math.sin(a) * L);
      ctx.lineTo(ax + Math.cos(a) * L, ay + Math.sin(a) * L);
      for (const sgn of [-1, 1]) {
        ctx.moveTo(ax + Math.cos(a) * L, ay + Math.sin(a) * L);
        ctx.lineTo(ax + Math.cos(a) * L - Math.cos(a + sgn * 0.6) * L * 0.45, ay + Math.sin(a) * L - Math.sin(a + sgn * 0.6) * L * 0.45);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Words scrawled across a car roof (drawn by the renderer right after the car). */
export function drawCarScrawl(ctx, o) {
  if (!o.scrawl) return;
  const vert = o.h > o.w;
  ctx.save();
  ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
  if (vert) ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = o.color === '#efeeea' ? '#c0392b' : 'rgba(240,240,232,0.85)';
  ctx.font = `700 8px ${MARKER_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(o.scrawl, 0, o.scrawl2 ? -4 : 0);
  if (o.scrawl2) {
    ctx.font = `700 6px ${MARKER_FONT}`;
    ctx.fillText(o.scrawl2, 0, 5);
  }
  ctx.restore();
}

// --- Bright pass: candle flames and the stove in dens ---------------------------------------------

export function drawLoreBright(ctx, game, vr) {
  const map = game.world.map;
  if (!map.dens || !map.dens.length) return;
  const t = game.time;
  for (const d of map.decor) {
    if (d.type !== 'candle' && d.type !== 'stove') continue;
    if (!pointInRect(d.x, d.y, vr, 20)) continue;
    const fl = 0.6 + 0.4 * Math.sin(t * 13 + d.x * 0.7) * Math.sin(t * 7.3 + d.y);
    if (d.type === 'candle') {
      ctx.fillStyle = `rgba(255,200,110,${0.25 * fl})`;
      ctx.beginPath();
      circle(ctx, d.x, d.y - 1, 7);
      ctx.fill();
      ctx.fillStyle = `rgba(255,236,170,${0.8 + 0.2 * fl})`;
      ctx.beginPath();
      circle(ctx, d.x, d.y - 1, 1.6 + fl);
      ctx.fill();
    } else {
      ctx.fillStyle = `rgba(110,170,255,${0.5 + 0.3 * fl})`;
      ctx.beginPath();
      circle(ctx, d.x, d.y, 3 + fl);
      ctx.fill();
    }
  }
}
