// World-feature visuals that aren't obstacle models (those are in models.js):
// the gas station canopy, flat ground decor (spray paint, scorch marks, rotor
// blades...), and the bright pass (holdout lights and marker, fires,
// explosion fireballs).

import { TAU, pointInRect, rectsOverlap, clamp } from '../util.js';
import { rrect, circle, hash01, FONT } from './draw-utils.js';
import { boxTop, boxFaceX, boxFaceY, tone, ball, disc, line3 } from './prims.js';

export function stripes(ctx, x, y, w, h, a = 1) {
  // Yellow / black hazard stripes clipped to a rect.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = `rgba(214,170,40,${a})`;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = `rgba(20,20,20,${a})`;
  const s = 8;
  for (let k = -h - w; k < w + h; k += s * 2) {
    ctx.beginPath();
    ctx.moveTo(x + k, y);
    ctx.lineTo(x + k + s, y);
    ctx.lineTo(x + k + s + h, y + h);
    ctx.lineTo(x + k + h, y + h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// --- The gas station canopy (drawn after everything that stands under it) -------------------------

const CANOPY_Z = 66;

/** Translucent, see-through when you're under it, wrecked once the station has blown. */
export function drawCanopies(R, game, vr) {
  const map = game.world.map;
  if (!map.canopies || !map.canopies.length) return;
  const { ctx, v } = R;
  const p = game.player;
  const ex = game.events ? game.events.explosives : [];
  for (const c of map.canopies) {
    if (!rectsOverlap(c, vr, 80)) continue;
    const blown = ex.some((e) => e.id === c.group && e.done);
    if (blown) {
      // What's left: twisted beams on the ground.
      R.ground(0);
      ctx.strokeStyle = 'rgba(30,24,20,0.85)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x + c.w * 0.45, c.y + c.h * 0.3);
      ctx.moveTo(c.x + c.w, c.y + c.h);
      ctx.lineTo(c.x + c.w * 0.6, c.y + c.h * 0.55);
      ctx.moveTo(c.x + c.w, c.y);
      ctx.lineTo(c.x + c.w * 0.8, c.y + c.h * 0.35);
      ctx.stroke();
      R.reset();
      continue;
    }
    const under = pointInRect(p.x, p.y, c, 10) || R.hides(c, CANOPY_Z, CANOPY_Z + 8);
    const b = R.roofK;
    // Four posts, then the slab.
    if (!v.flat) {
      ctx.strokeStyle = tone('#8d8c86', b);
      ctx.lineWidth = Math.max(1.5, 4 * v.scale);
      ctx.lineCap = 'butt';
      ctx.beginPath();
      for (const [x, y] of [[c.x + 14, c.y + 14], [c.x + c.w - 14, c.y + 14], [c.x + 14, c.y + c.h - 14], [c.x + c.w - 14, c.y + c.h - 14]]) line3(ctx, v, x, y, 0, x, y, CANOPY_Z);
      ctx.stroke();
      ctx.lineCap = 'round';
    }
    ctx.globalAlpha = under ? 0.2 : v.flat ? 0.42 : 0.8;
    const col = game.settings.night ? '#a9a8a2' : '#d9d8d2';
    // Face by face (no outline underneath): it's see-through, and overlapping fills would show.
    if (!v.flat) {
      ctx.fillStyle = tone('#b8322a', b * 0.8);
      ctx.beginPath();
      boxFaceX(ctx, v, c.x, c.y, c.x + c.w, c.y + c.h, CANOPY_Z, CANOPY_Z + 8);
      ctx.fill();
      ctx.fillStyle = tone('#b8322a', b);
      ctx.beginPath();
      boxFaceY(ctx, v, c.x, c.y, c.x + c.w, c.y + c.h, CANOPY_Z, CANOPY_Z + 8);
      ctx.fill();
    }
    ctx.fillStyle = tone(col, b * 1.1);
    ctx.beginPath();
    boxTop(ctx, v, c.x, c.y, c.x + c.w, c.y + c.h, CANOPY_Z + 8);
    ctx.fill();
    R.ground(CANOPY_Z + 8);
    ctx.fillStyle = tone('#b8322a', b);
    ctx.fillRect(c.x, c.y, c.w, 8);
    ctx.fillRect(c.x, c.y + c.h - 8, c.w, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.font = `900 30px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAS', c.x + c.w / 2, c.y + c.h / 2);
    R.reset();
    ctx.globalAlpha = 1;
  }
}

// --- Ground decor ----------------------------------------------------------------------------

export function drawFeatureDecor(ctx, d) {
  switch (d.type) {
    case 'spray': {
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = d.color;
      ctx.font = `900 ${Math.round(18 * (d.s || 1))}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.text, d.x, d.y);
      if (d.a !== null && d.a !== undefined) {
        // An arrow beside the word, pointing the way.
        const ax = d.x + Math.cos(d.a) * 26;
        const ay = d.y + Math.sin(d.a) * 26;
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ax - Math.cos(d.a) * 4, ay - Math.sin(d.a) * 4);
        ctx.lineTo(ax + Math.cos(d.a) * 30, ay + Math.sin(d.a) * 30);
        for (const sgn of [-1, 1]) {
          ctx.moveTo(ax + Math.cos(d.a) * 30, ay + Math.sin(d.a) * 30);
          ctx.lineTo(ax + Math.cos(d.a) * 30 - Math.cos(d.a + sgn * 0.6) * 12, ay + Math.sin(d.a) * 30 - Math.sin(d.a + sgn * 0.6) * 12);
        }
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    case 'island':
      ctx.fillStyle = '#5b5b57';
      ctx.beginPath();
      rrect(ctx, d.x - d.w / 2, d.y - d.h / 2, d.w, d.h, 6);
      ctx.fill();
      return;
    case 'pricesign':
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(d.x - 2, d.y - 2, 4, 14);
      ctx.fillStyle = '#b8322a';
      ctx.fillRect(d.x - 16, d.y - 26, 32, 24);
      ctx.fillStyle = '#fff';
      ctx.font = `900 9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('GAS', d.x, d.y - 18);
      ctx.fillStyle = '#ffd36a';
      ctx.fillText('3.99', d.x, d.y - 8);
      return;
    case 'rotor': {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.a);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-d.len / 2 + 3, -2, d.len, 8);
      ctx.fillStyle = '#2b2e30';
      ctx.fillRect(-d.len / 2, -4, d.len, 7);
      ctx.restore();
      return;
    }
    case 'scorch': {
      const r = 90 * (d.s || 1);
      const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, r);
      g.addColorStop(0, 'rgba(8,6,4,0.75)');
      g.addColorStop(1, 'rgba(8,6,4,0)');
      ctx.fillStyle = g;
      ctx.fillRect(d.x - r, d.y - r, r * 2, r * 2);
      return;
    }
    case 'scrap':
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.a);
      ctx.fillStyle = d.grey ? 'rgba(120,115,108,0.8)' : 'rgba(70,80,60,0.85)';
      ctx.beginPath();
      ctx.moveTo(-10 * d.s, -4 * d.s);
      ctx.lineTo(9 * d.s, -6 * d.s);
      ctx.lineTo(6 * d.s, 5 * d.s);
      ctx.lineTo(-7 * d.s, 4 * d.s);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    case 'wire': {
      ctx.strokeStyle = 'rgba(150,150,150,0.6)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const y = d.y + d.h / 2;
      for (let x = d.x; x < d.x + d.w; x += 10) {
        ctx.moveTo(x, y - 3);
        ctx.lineTo(x + 5, y + 3);
        ctx.lineTo(x + 10, y - 3);
      }
      ctx.stroke();
      return;
    }
    case 'hazard':
      stripes(ctx, d.x, d.y, d.w, 5, 0.6);
      stripes(ctx, d.x, d.y + d.h - 5, d.w, 5, 0.6);
      return;
    case 'moon': {
      const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, 120);
      g.addColorStop(0, 'rgba(170,190,220,0.22)');
      g.addColorStop(1, 'rgba(170,190,220,0)');
      ctx.fillStyle = g;
      ctx.fillRect(d.x - 120, d.y - 120, 240, 240);
      return;
    }
    default:
      break;
  }
}

// --- Bright pass -------------------------------------------------------------------------------

/** Called with the plain screen transform; R.ground(z) paints on the ground. */
export function drawFeaturesBright(R, game, vr) {
  const E = game.events;
  if (!E) return;
  const { ctx, v } = R;
  const t = game.time;
  const H = E.holdout;
  if (H && pointInRect(H.x, H.y, vr, 400)) {
    // Beacons on the gate posts: red while locked, amber spinning while it opens, green when open.
    const g = H.gate;
    const top = g.y0;
    const bot = g.y0 + g.h0;
    const col = H.state === 'open' ? '120,255,150' : H.state === 'running' ? '255,180,60' : '255,70,60';
    const pulse = H.state === 'running' ? 0.5 + 0.5 * Math.sin(t * 9) : H.state === 'open' ? 0.8 : 0.35 + 0.35 * Math.sin(t * 3);
    const z = v.flat ? 0 : g.indoor ? 52 : 78;
    for (const y of [top - 8, bot + 8]) {
      ctx.fillStyle = `rgba(${col},${0.25 * pulse})`;
      ctx.beginPath();
      ball(ctx, v, H.x, y, z, 26);
      ctx.fill();
      ctx.fillStyle = `rgba(${col},${0.6 + 0.4 * pulse})`;
      ctx.beginPath();
      ball(ctx, v, H.x, y, z, 5);
      ctx.fill();
    }
    if (H.state === 'idle') {
      // Where to stand: a ring at the control box (+ progress while you hold).
      const u = H.use;
      const k = 0.5 + 0.5 * Math.sin(t * 4);
      R.ground(0);
      ctx.strokeStyle = `rgba(255,214,110,${0.35 + 0.35 * k})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      circle(ctx, u.x, u.y, 30);
      ctx.stroke();
      ctx.setLineDash([]);
      if (H.hold > 0) {
        ctx.strokeStyle = '#ffd36a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(u.x, u.y, 30, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(H.hold, 0, 1));
        ctx.stroke();
      }
      R.reset();
      ctx.fillStyle = `rgba(255,224,150,${0.55 + 0.3 * k})`;
      ctx.font = `800 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('GATE CONTROL', v.px(u.x, u.y), v.py(u.x, u.y, 58) - 4);
    }
  }
  // Fires left by explosions: flames standing on the burning ground.
  ctx.globalCompositeOperation = 'lighter';
  for (const b of E.burns) {
    if (!pointInRect(b.x, b.y, vr, b.r + 40)) continue;
    const k = clamp(b.t / 3, 0, 1);
    const r = b.r * (0.55 + 0.45 * k);
    for (let i = 0; i < 14; i++) {
      const a = hash01(i * 3.7) * TAU + t * 0.2;
      const d = Math.sqrt(hash01(i * 7.1)) * r * 0.85;
      const fl = Math.sin(t * (8 + i) + i * 1.7) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(255,${110 + ((i * 13) % 80)},40,${(0.22 + fl * 0.25) * (0.4 + 0.6 * k)})`;
      ctx.beginPath();
      ball(ctx, v, b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, 8 + fl * 10, 9 + fl * 9);
      ball(ctx, v, b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, 20 + fl * 18, 5 + fl * 5);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  // Explosion fireballs: a ball of fire and the shock ring racing out over the ground.
  for (const bl of game.effects.blasts) {
    if (!pointInRect(bl.x, bl.y, vr, bl.r)) continue;
    const k = 1 - bl.life / bl.max;
    const r = bl.r * (0.25 + 0.75 * Math.sqrt(k)) * v.scale;
    const sx = v.px(bl.x, bl.y);
    const sy = v.py(bl.x, bl.y, bl.r * 0.18 * (v.flat ? 0 : 1));
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, `rgba(255,250,220,${0.95 * (1 - k)})`);
    g.addColorStop(0.35, `rgba(255,170,60,${0.8 * (1 - k)})`);
    g.addColorStop(1, 'rgba(160,40,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,220,160,${0.5 * (1 - k)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    disc(ctx, v, bl.x, bl.y, bl.r * (0.4 + 0.9 * k), 0);
    ctx.stroke();
  }
}
