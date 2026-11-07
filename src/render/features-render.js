// World-feature visuals: the quarantine wall, gates and control box, the breach
// (drawn as heavy boards by loot-render), gas station / helicopter / army
// checkpoint / field post / collapsed ceiling, spray paint, and the bright pass
// (holdout lights and marker, fires, explosion fireballs).

import { TAU, pointInRect, rectsOverlap, clamp } from '../util.js';
import { rrect, circle, hash01, FONT } from './draw-utils.js';

function stripes(ctx, x, y, w, h, a = 1) {
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

// --- Roof pass (sight blockers) ----------------------------------------------------------------

/** The quarantine wall: concrete outdoors, welded steel shutters indoors. */
export function drawQwall(ctx, o, night, mapH) {
  const vert = o.h >= o.w;
  if (o.indoor) {
    ctx.fillStyle = night ? '#3c4148' : '#4b5058';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (vert) for (let y = o.y + 6; y < o.y + o.h; y += 8) { ctx.moveTo(o.x + 1, y); ctx.lineTo(o.x + o.w - 1, y); }
    else for (let x = o.x + 6; x < o.x + o.w; x += 8) { ctx.moveTo(x, o.y + 1); ctx.lineTo(x, o.y + o.h - 1); }
    ctx.stroke();
    const e = Math.min(16, (vert ? o.h : o.w) / 2);
    if (vert) {
      stripes(ctx, o.x, o.y, o.w, e, 0.85);
      stripes(ctx, o.x, o.y + o.h - e, o.w, e, 0.85);
    } else {
      stripes(ctx, o.x, o.y, e, o.h, 0.85);
      stripes(ctx, o.x + o.w - e, o.y, e, o.h, 0.85);
    }
    return;
  }
  ctx.fillStyle = night ? '#55554f' : '#6b6a64';
  ctx.fillRect(o.x, o.y, o.w, o.h);
  ctx.fillStyle = night ? '#62625b' : '#7b7a73';
  if (vert) ctx.fillRect(o.x + o.w / 2 - 5, o.y, 10, o.h);
  else ctx.fillRect(o.x, o.y + o.h / 2 - 5, o.w, 10);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (vert) for (let y = Math.ceil(o.y / 48) * 48; y < o.y + o.h; y += 48) { ctx.moveTo(o.x, y); ctx.lineTo(o.x + o.w, y); }
  else for (let x = Math.ceil(o.x / 48) * 48; x < o.x + o.w; x += 48) { ctx.moveTo(x, o.y); ctx.lineTo(x, o.y + o.h); }
  ctx.stroke();
  // Hazard ends where the wall meets an opening, and QUARANTINE stencils along it.
  const e = 22;
  if (vert) {
    if (o.y > 0) stripes(ctx, o.x, o.y, o.w, e, 0.8);
    if (o.y + o.h < mapH) stripes(ctx, o.x, o.y + o.h - e, o.w, e, 0.8);
    ctx.save();
    ctx.fillStyle = 'rgba(230,200,90,0.55)';
    ctx.font = `900 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let y = Math.ceil((o.y + 120) / 640) * 640; y < o.y + o.h - 120; y += 640) {
      ctx.save();
      ctx.translate(o.x + o.w / 2, y);
      ctx.rotate(Math.PI / 2);
      ctx.fillText('QUARANTINE', 0, 1);
      ctx.restore();
    }
    ctx.restore();
  }
}

/** Gas station canopies (translucent; see-through when you're under one; wrecked once blown). */
export function drawCanopies(ctx, game, vr) {
  const map = game.world.map;
  if (!map.canopies || !map.canopies.length) return;
  const p = game.player;
  const ex = game.events ? game.events.explosives : [];
  for (const c of map.canopies) {
    if (!rectsOverlap(c, vr)) continue;
    const blown = ex.some((e) => e.id === c.group && e.done);
    if (blown) {
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
      continue;
    }
    const under = pointInRect(p.x, p.y, c, 10);
    ctx.globalAlpha = under ? 0.18 : 0.42;
    ctx.fillStyle = game.settings.night ? '#a9a8a2' : '#d9d8d2';
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.fillStyle = '#b8322a';
    ctx.fillRect(c.x, c.y, c.w, 10);
    ctx.fillRect(c.x, c.y + c.h - 10, c.w, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.font = `900 30px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAS', c.x + c.w / 2, c.y + c.h / 2);
    ctx.globalAlpha = 1;
  }
}

// --- Props (under the darkness) ----------------------------------------------------------------

export function drawFeatureProp(ctx, o, game) {
  const t = game.time;
  switch (o.kind) {
    case 'gate': {
      if (o.h < 1 || o.w < 1) return;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(o.x + 2, o.y + 3, o.w, o.h);
      ctx.fillStyle = '#7d838b';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = '#2b2f35';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const vert = o.h >= o.w;
      if (vert) for (let y = o.y + 5; y < o.y + o.h; y += 9) { ctx.moveTo(o.x, y); ctx.lineTo(o.x + o.w, y); }
      else for (let x = o.x + 5; x < o.x + o.w; x += 9) { ctx.moveTo(x, o.y); ctx.lineTo(x, o.y + o.h); }
      ctx.stroke();
      if (vert && o.h > 30) stripes(ctx, o.x, o.y + o.h - 14, o.w, 14, 0.9);
      return;
    }
    case 'switchbox': {
      const H = game.events && game.events.holdout;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(o.x + 2, o.y + 3, o.w, o.h);
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = '#222';
      ctx.fillRect(o.x + 2, o.y + 4, o.w - 4, 6);
      const state = H ? H.state : 'idle';
      const on = state !== 'idle' || Math.sin(t * 5) > 0;
      ctx.fillStyle = state === 'open' ? '#5dff8a' : state === 'running' ? '#ffb347' : on ? '#ff3b30' : '#5a1a16';
      ctx.beginPath();
      circle(ctx, o.x + o.w / 2, o.y + o.h - 7, 3);
      ctx.fill();
      return;
    }
    case 'pump': {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(o.x + 2, o.y + 3, o.w, o.h);
      ctx.fillStyle = o.hitT > 0 ? '#ffffff' : '#cfcfc8';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = '#b8322a';
      ctx.fillRect(o.x, o.y + o.h * 0.6, o.w, o.h * 0.22);
      ctx.fillStyle = '#20252b';
      ctx.fillRect(o.x + 3, o.y + 4, o.w - 6, 7);
      ctx.strokeStyle = '#1b1b1b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(o.x + o.w, o.y + o.h * 0.4);
      ctx.quadraticCurveTo(o.x + o.w + 8, o.y + o.h * 0.6, o.x + o.w + 2, o.y + o.h);
      ctx.stroke();
      return;
    }
    case 'cylinder': {
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      circle(ctx, cx + 2, cy + 3, o.w / 2);
      ctx.fill();
      ctx.fillStyle = o.hitT > 0 ? '#ffffff' : o.tint || '#b5432c';
      ctx.beginPath();
      circle(ctx, cx, cy, o.w / 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      circle(ctx, cx, cy, o.w / 2 - 3);
      ctx.stroke();
      ctx.fillStyle = '#2a2a2a';
      ctx.beginPath();
      circle(ctx, cx, cy, 3);
      ctx.fill();
      return;
    }
    case 'heli': {
      const body = o.part === 'body';
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(o.x + 4, o.y + 5, o.w, o.h);
      ctx.fillStyle = o.color || '#4b5a3a';
      ctx.beginPath();
      rrect(ctx, o.x, o.y, o.w, o.h, body ? 18 : 4);
      ctx.fill();
      if (!body) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        if (o.horiz) ctx.fillRect(o.dir > 0 ? o.x : o.x + o.w - 10, o.y - 8, 10, o.h + 16);
        else ctx.fillRect(o.x - 8, o.dir > 0 ? o.y : o.y + o.h - 10, o.w + 16, 10);
        return;
      }
      // Cockpit glass at the nose, hub and skids, scorched patches.
      ctx.fillStyle = '#1d2a36';
      if (o.horiz) ctx.fillRect(o.dir > 0 ? o.x + o.w - 30 : o.x + 6, o.y + 8, 24, o.h - 16);
      else ctx.fillRect(o.x + 8, o.dir > 0 ? o.y + o.h - 30 : o.y + 6, o.w - 16, 24);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      circle(ctx, o.x + o.w / 2, o.y + o.h / 2, 9);
      ctx.fill();
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (o.horiz) {
        ctx.moveTo(o.x + 10, o.y - 4);
        ctx.lineTo(o.x + o.w - 10, o.y - 4);
        ctx.moveTo(o.x + 10, o.y + o.h + 4);
        ctx.lineTo(o.x + o.w - 10, o.y + o.h + 4);
      } else {
        ctx.moveTo(o.x - 4, o.y + 10);
        ctx.lineTo(o.x - 4, o.y + o.h - 10);
        ctx.moveTo(o.x + o.w + 4, o.y + 10);
        ctx.lineTo(o.x + o.w + 4, o.y + o.h - 10);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(20,16,12,0.45)';
      ctx.beginPath();
      circle(ctx, o.x + o.w * 0.35, o.y + o.h * 0.4, Math.min(o.w, o.h) * 0.3);
      ctx.fill();
      return;
    }
    case 'sandbag': {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(o.x + 2, o.y + 3, o.w, o.h);
      ctx.fillStyle = '#7d7052';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = '#968762';
      const vert = o.h > o.w;
      const len = vert ? o.h : o.w;
      for (let k = 0, p = 0; p < len - 4; k++, p += 16) {
        const off = k % 2 ? 8 : 0;
        if (vert) ctx.fillRect(o.x + 2, o.y + p + 2 + (off ? 0 : 0), o.w - 4, 12);
        else ctx.fillRect(o.x + p + 2, o.y + 2, 12, o.h - 4);
      }
      ctx.strokeStyle = 'rgba(40,34,20,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1);
      return;
    }
    case 'barrier': {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(o.x + 2, o.y + 3, o.w, o.h);
      ctx.fillStyle = '#8c8b85';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = '#b13a30';
      const vert = o.h > o.w;
      for (let p = 6; p < (vert ? o.h : o.w) - 6; p += 22) {
        if (vert) ctx.fillRect(o.x, o.y + p, o.w, 8);
        else ctx.fillRect(o.x + p, o.y, 8, o.h);
      }
      return;
    }
    case 'truck': {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(o.x + 3, o.y + 4, o.w, o.h);
      const cabW = 34;
      const cabX = o.front > 0 ? o.x + o.w - cabW : o.x;
      const bedX = o.front > 0 ? o.x : o.x + cabW + 4;
      ctx.fillStyle = '#4b5a3a';
      ctx.beginPath();
      rrect(ctx, cabX, o.y, cabW, o.h, 6);
      ctx.fill();
      ctx.fillStyle = '#1d2a36';
      ctx.fillRect(o.front > 0 ? cabX + cabW - 12 : cabX + 4, o.y + 6, 8, o.h - 12);
      ctx.fillStyle = '#3c4a30';
      ctx.fillRect(bedX, o.y + 1, o.w - cabW - 4, o.h - 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = bedX + 14; x < bedX + o.w - cabW - 8; x += 16) {
        ctx.moveTo(x, o.y + 2);
        ctx.lineTo(x, o.y + o.h - 2);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `900 9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', bedX + (o.w - cabW - 4) / 2, o.y + o.h / 2);
      return;
    }
    case 'rubble': {
      const s = o.seed || 1;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(o.x + 3, o.y + 4, o.w, o.h);
      ctx.fillStyle = '#6f6a63';
      ctx.beginPath();
      ctx.moveTo(o.x + hash01(s) * 8, o.y);
      ctx.lineTo(o.x + o.w, o.y + hash01(s + 1) * 8);
      ctx.lineTo(o.x + o.w - hash01(s + 2) * 8, o.y + o.h);
      ctx.lineTo(o.x, o.y + o.h - hash01(s + 3) * 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(o.x + 4, o.y + 4, o.w * 0.5, o.h * 0.35);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(o.x + o.w * 0.2, o.y + o.h * 0.3);
      ctx.lineTo(o.x + o.w * 0.55, o.y + o.h * 0.65);
      ctx.lineTo(o.x + o.w * 0.8, o.y + o.h * 0.5);
      ctx.stroke();
      return;
    }
    default:
      break;
  }
}

/** Ammo can pickup. */
export function drawAmmo(ctx, k, bob) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(k.x - 10, k.y - 5, 22, 15);
  ctx.fillStyle = '#4e5b2c';
  ctx.beginPath();
  rrect(ctx, k.x - 11, k.y - 8 + bob, 22, 15, 2);
  ctx.fill();
  ctx.fillStyle = '#d6a92c';
  ctx.fillRect(k.x - 11, k.y - 3 + bob, 22, 3);
  ctx.fillStyle = '#2b2f22';
  ctx.fillRect(k.x - 4, k.y - 10 + bob, 8, 3);
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

/** Checkpoint gate posts (open gateways in the wall). */
export function drawCheckpoints(ctx, game, vr) {
  const map = game.world.map;
  for (const c of map.checkpoints || []) {
    if (!pointInRect(c.x, c.y, vr, 120)) continue;
    const h = c.h || c.w || 120;
    for (const sy of [-1, 1]) {
      const y = c.y + (sy * h) / 2;
      ctx.fillStyle = '#2b2f35';
      ctx.fillRect(c.x - 9, y - 6, 18, 12);
      stripes(ctx, c.x - 7, y - 4, 14, 8, 0.9);
    }
  }
}

// --- Bright pass -------------------------------------------------------------------------------

export function drawFeaturesBright(ctx, game, vr) {
  const E = game.events;
  if (!E) return;
  const t = game.time;
  const H = E.holdout;
  if (H && pointInRect(H.x, H.y, vr, 400)) {
    // Beacons on the gate posts: red while locked, amber spinning while it opens, green when open.
    const g = H.gate;
    const top = g.y0;
    const bot = g.y0 + g.h0;
    const col = H.state === 'open' ? '120,255,150' : H.state === 'running' ? '255,180,60' : '255,70,60';
    const pulse = H.state === 'running' ? 0.5 + 0.5 * Math.sin(t * 9) : H.state === 'open' ? 0.8 : 0.35 + 0.35 * Math.sin(t * 3);
    for (const y of [top - 8, bot + 8]) {
      ctx.fillStyle = `rgba(${col},${0.25 * pulse})`;
      ctx.beginPath();
      circle(ctx, H.x, y, 26);
      ctx.fill();
      ctx.fillStyle = `rgba(${col},${0.6 + 0.4 * pulse})`;
      ctx.beginPath();
      circle(ctx, H.x, y, 5);
      ctx.fill();
    }
    if (H.state === 'idle') {
      // Where to stand: a ring at the control box (+ progress while you hold).
      const u = H.use;
      const k = 0.5 + 0.5 * Math.sin(t * 4);
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
      ctx.fillStyle = `rgba(255,224,150,${0.55 + 0.3 * k})`;
      ctx.font = `800 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('GATE CONTROL', u.x, u.y - 42);
    }
  }
  // Fires left by explosions.
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
      circle(ctx, b.x + Math.cos(a) * d, b.y + Math.sin(a) * d - fl * 5, 9 + fl * 9);
      ctx.fill();
    }
  }
  // Explosion fireballs.
  for (const bl of game.effects.blasts) {
    if (!pointInRect(bl.x, bl.y, vr, bl.r)) continue;
    const k = 1 - bl.life / bl.max;
    const r = bl.r * (0.25 + 0.75 * Math.sqrt(k));
    const g = ctx.createRadialGradient(bl.x, bl.y, 0, bl.x, bl.y, r);
    g.addColorStop(0, `rgba(255,250,220,${0.95 * (1 - k)})`);
    g.addColorStop(0.35, `rgba(255,170,60,${0.8 * (1 - k)})`);
    g.addColorStop(1, 'rgba(160,40,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    circle(ctx, bl.x, bl.y, r);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,220,160,${0.5 * (1 - k)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    circle(ctx, bl.x, bl.y, bl.r * (0.4 + 0.9 * k));
    ctx.stroke();
  }
}
