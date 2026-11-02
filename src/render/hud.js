// Screen-space HUD in CSS pixels: sticks, buttons, health, ammo, threat
// arrows, safe-room compass, announcements, end screens, debug read-outs.

import { FONT, rrect, circle } from './draw-utils.js';
import { TAU, clamp } from '../util.js';

let vignette = null;
let vignetteKey = '';

export function drawHud(ctx, game, input, ui, renderer) {
  const S = game.settings;
  const L = ui.layout;
  const w = L.w;
  const h = L.h;
  const p = game.player;

  // --- Damage / low health vignette --------------------------------------------
  const hpf = p.hp / p.maxHp;
  let va = game.hurtFlash * 0.55;
  if (p.alive && hpf < 0.35) va += (0.35 - hpf) * (0.55 + 0.45 * Math.sin(game.time * 6.5)) * 0.9;
  if (va > 0.01) {
    const key = `${w}x${h}`;
    if (key !== vignetteKey) {
      vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
      vignette.addColorStop(0, 'rgba(150,0,0,0)');
      vignette.addColorStop(1, 'rgba(150,0,0,1)');
      vignetteKey = key;
    }
    ctx.globalAlpha = clamp(va, 0, 0.85);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  if (S.threatIndicators && p.alive && !ui.title) drawThreats(ctx, game, L);
  if (!game.won && !game.lost && !ui.title) drawObjective(ctx, game, L);

  drawHealth(ctx, game, L);
  drawWeapon(ctx, game, L, ui);
  drawStats(ctx, game, L);
  drawButtons(ctx, game, L, input.touch);

  if (input.source === 'touch' || ui.forceSticks) {
    drawStick(ctx, input.touch.move, 'move', S, L, input.touch, ui);
    drawStick(ctx, input.touch.aim, 'aim', S, L, input.touch, ui);
  }
  if (S.showTouches) drawTouchDebug(ctx, input.touch, L);

  drawMessages(ctx, game, L);
  if (game.won || game.lost) drawEnd(ctx, game, L);
  if (S.showDebug) drawDebug(ctx, game, input, ui, L);
}

// --- Sticks --------------------------------------------------------------------------

function drawStick(ctx, st, kind, S, L, touch, ui) {
  const R = S.stickRadius;
  const isAim = kind === 'aim';
  const mode = isAim ? S.aimMode : S.moveMode;
  const ringR = R * Math.max(S.fireThreshold, S.aimDeadzone);
  ctx.lineWidth = 2;

  if (!st.active) {
    // Ghost: where the stick is (fixed) or where your thumb naturally lands.
    const g = isAim ? L.fixedAim : L.fixedMove;
    const a = mode === 'fixed' ? 0.3 : 0.1 + 0.25 * ui.hintAlpha;
    ctx.strokeStyle = `rgba(255,255,255,${a})`;
    ctx.fillStyle = `rgba(255,255,255,${a * 0.18})`;
    ctx.beginPath();
    circle(ctx, g.x, g.y, R);
    ctx.fill();
    ctx.stroke();
    if (isAim && S.fireThreshold > S.aimDeadzone) {
      ctx.setLineDash([5, 6]);
      ctx.strokeStyle = `rgba(255,140,80,${a * 0.9})`;
      ctx.beginPath();
      circle(ctx, g.x, g.y, ringR);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = `rgba(255,255,255,${a * 1.6})`;
    ctx.beginPath();
    circle(ctx, g.x, g.y, R * 0.42);
    ctx.fill();
    if (ui.hintAlpha > 0.02) {
      ctx.fillStyle = `rgba(255,255,255,${0.75 * ui.hintAlpha})`;
      ctx.font = `600 12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(isAim ? 'AIM  ·  past ring = FIRE' : 'MOVE', g.x, g.y + R + 8);
      if (isAim && S.tapShove) ctx.fillText('tap = SHOVE', g.x, g.y + R + 24);
    }
    return;
  }

  const b = st.base;
  const k = touch.knob(st);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  circle(ctx, b.x, b.y, R);
  ctx.fill();
  ctx.stroke();
  const dz = isAim ? S.aimDeadzone : S.moveDeadzone;
  if (dz > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    circle(ctx, b.x, b.y, R * dz);
    ctx.stroke();
  }
  if (isAim && S.fireThreshold > S.aimDeadzone) {
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = st.firing ? 'rgba(255,140,80,0.75)' : 'rgba(255,140,80,0.38)';
    ctx.beginPath();
    circle(ctx, b.x, b.y, ringR);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(k.x, k.y);
  ctx.stroke();
  ctx.lineWidth = 2;
  const firing = isAim && st.firing;
  ctx.fillStyle = firing ? 'rgba(255,110,60,0.6)' : 'rgba(255,255,255,0.3)';
  ctx.strokeStyle = firing ? 'rgba(255,170,120,0.9)' : 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  circle(ctx, k.x, k.y, R * 0.42);
  ctx.fill();
  ctx.stroke();
}

// --- Buttons ---------------------------------------------------------------------------

function drawButtons(ctx, game, L, touch) {
  const p = game.player;
  const pressed = touch.pressed;
  const B = L.byId;

  // Tuning panel.
  const g = B.pause;
  btnCircle(ctx, g, pressed.has('pause'));
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = -1; i <= 1; i++) {
    ctx.moveTo(g.x - 9, g.y + i * 6);
    ctx.lineTo(g.x + 9, g.y + i * 6);
  }
  ctx.stroke();
  ctx.fillStyle = '#fff';
  for (const [dx, dy] of [[-3, -6], [4, 0], [-1, 6]]) {
    ctx.beginPath();
    circle(ctx, g.x + dx, g.y + dy, 2.6);
    ctx.fill();
  }

  // Reload.
  const r = B.reload;
  const w = p.weapon;
  btnCircle(ctx, r, pressed.has('reload'));
  if (w.reloading) {
    const total = w.def.reloadType === 'shell' ? w.def.reload : w.def.reload;
    const k = w.def.reloadType === 'shell' ? w.mag / w.def.mag : 1 - w.reloadT / total;
    ctx.strokeStyle = 'rgba(255,210,120,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r - 3, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(k, 0, 1));
    ctx.stroke();
  }
  ctx.strokeStyle = w.mag === 0 && !w.reloading ? '#ffcf6a' : 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(r.x, r.y, 9, -Math.PI * 0.2, Math.PI * 1.45);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(r.x + 9 * Math.cos(-Math.PI * 0.2) - 5, r.y + 9 * Math.sin(-Math.PI * 0.2) - 1);
  ctx.lineTo(r.x + 9 * Math.cos(-Math.PI * 0.2) + 1, r.y + 9 * Math.sin(-Math.PI * 0.2) + 1);
  ctx.lineTo(r.x + 9 * Math.cos(-Math.PI * 0.2) + 2, r.y + 9 * Math.sin(-Math.PI * 0.2) - 6);
  ctx.stroke();

  // Shove.
  const s = B.shove;
  if (!s.hidden) {
    btnCircle(ctx, s, pressed.has('shove'));
    if (p.shoveCd > 0) {
      ctx.strokeStyle = 'rgba(160,200,255,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r - 3, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.shoveCd / p.shoveCdMax));
      ctx.stroke();
    }
    ctx.fillStyle = p.shoveCd > 0 ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.9)';
    ctx.font = `700 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SHOVE', s.x, s.y + 1);
  }
}

function btnCircle(ctx, b, down) {
  ctx.fillStyle = down ? 'rgba(255,255,255,0.28)' : 'rgba(10,12,16,0.45)';
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  circle(ctx, b.x, b.y, b.r);
  ctx.fill();
  ctx.stroke();
}

// --- Status panels -------------------------------------------------------------------------

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8,10,14,0.55)';
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  rrect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

function drawHealth(ctx, game, L) {
  const p = game.player;
  const b = L.hp;
  panel(ctx, b.x, b.y, b.w, b.h);
  const hp = Math.ceil(p.hp);
  const f = p.hp / p.maxHp;
  const col = f > 0.6 ? '#5fd38a' : f > 0.3 ? '#e8c25a' : '#e2574c';
  ctx.fillStyle = col;
  ctx.font = `800 20px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(hp), b.x + 10, b.y + 17);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `600 10px ${FONT}`;
  const tag = game.settings.godMode ? 'HP · GOD' : p.hp < 40 && p.alive ? 'HP · LIMPING' : 'HP';
  ctx.fillText(tag, b.x + 50, b.y + 17);
  const bx = b.x + 10;
  const by = b.y + 31;
  const bw = b.w - 20;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(bx, by, bw, 6);
  ctx.fillStyle = col;
  ctx.fillRect(bx, by, bw * clamp(f, 0, 1), 6);
}

function drawWeapon(ctx, game, L, ui) {
  const p = game.player;
  const w = p.weapon;
  const b = L.byId.swap;
  panel(ctx, b.x, b.y, b.w, b.h);
  if (ui.input.touch.pressed.has('swap')) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    rrect(ctx, b.x, b.y, b.w, b.h, 8);
    ctx.fill();
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `700 10px ${FONT}`;
  ctx.fillText(w.def.name.toUpperCase(), b.x + 10, b.y + 13);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText(`${p.wi + 1}/${p.weapons.length} ⇄`, b.x + b.w - 8, b.y + 13);
  ctx.textAlign = 'left';
  ctx.font = `800 19px ${FONT}`;
  ctx.fillStyle = w.mag === 0 ? '#ffb25a' : '#fff';
  const magTxt = String(w.mag);
  ctx.fillText(magTxt, b.x + 10, b.y + 32);
  const mw = ctx.measureText(magTxt).width;
  ctx.font = `600 12px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText(`/ ${w.def.mag}`, b.x + 14 + mw, b.y + 33);
  if (w.reloading) {
    ctx.fillStyle = '#ffd27a';
    ctx.font = `700 10px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText('RELOADING', b.x + b.w - 8, b.y + 33);
  }
}

function drawStats(ctx, game, L) {
  const t = game.stats.time;
  const mm = Math.floor(t / 60);
  const ss = Math.floor(t % 60).toString().padStart(2, '0');
  ctx.font = `700 12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  const midX = (L.hp.x + L.hp.w + L.byId.swap.x) / 2;
  ctx.fillText(`${mm}:${ss}   ·   ${game.stats.kills} kills`, midX, L.safe.t + 14);
}

// --- Edge indicators ---------------------------------------------------------------------

function edgePoint(L, sx, sy, ang, inset) {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const x0 = L.safe.l + inset;
  const x1 = L.w - L.safe.r - inset;
  const y0 = L.safe.t + inset + 50;
  const y1 = L.h - L.safe.b - inset;
  let t = Infinity;
  if (ca > 1e-6) t = Math.min(t, (x1 - sx) / ca);
  if (ca < -1e-6) t = Math.min(t, (x0 - sx) / ca);
  if (sa > 1e-6) t = Math.min(t, (y1 - sy) / sa);
  if (sa < -1e-6) t = Math.min(t, (y0 - sy) / sa);
  if (!Number.isFinite(t) || t < 0) t = 0;
  return { x: sx + ca * t, y: sy + sa * t };
}

function chevron(ctx, x, y, ang, size) {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  ctx.beginPath();
  ctx.moveTo(x + ca * size, y + sa * size);
  ctx.lineTo(x - ca * size * 0.6 - sa * size * 0.8, y - sa * size * 0.6 + ca * size * 0.8);
  ctx.lineTo(x - ca * size * 0.2, y - sa * size * 0.2);
  ctx.lineTo(x - ca * size * 0.6 + sa * size * 0.8, y - sa * size * 0.6 - ca * size * 0.8);
  ctx.closePath();
  ctx.fill();
}

const sectors = new Float32Array(24);

function drawThreats(ctx, game, L) {
  const p = game.player;
  const ps = game.worldToScreen(p.x, p.y);
  sectors.fill(0);
  let any = false;
  for (const z of game.zombies) {
    if (!z.alive || z.state !== 'chase') continue;
    const d = Math.hypot(z.x - p.x, z.y - p.y);
    if (d > 850) continue;
    const zs = game.worldToScreen(z.x, z.y);
    if (zs.x > 0 && zs.x < L.w && zs.y > 0 && zs.y < L.h) continue;
    const ang = Math.atan2(zs.y - ps.y, zs.x - ps.x);
    const s = Math.floor(((ang + Math.PI) / TAU) * 24) % 24;
    sectors[s] += 1.2 - d / 850;
    any = true;
  }
  if (!any) return;
  for (let s = 0; s < 24; s++) {
    const wgt = sectors[s];
    if (wgt <= 0) continue;
    const ang = ((s + 0.5) / 24) * TAU - Math.PI;
    const e = edgePoint(L, ps.x, ps.y, ang, 18);
    ctx.fillStyle = `rgba(255,70,50,${clamp(0.3 + wgt * 0.25, 0.3, 0.95)})`;
    chevron(ctx, e.x, e.y, ang, clamp(8 + wgt * 2.5, 8, 16));
  }
}

function drawObjective(ctx, game, L) {
  const er = game.world.map.endRoom.interior;
  const gx = er.x + er.w / 2;
  const gy = er.y + er.h / 2;
  const gs = game.worldToScreen(gx, gy);
  const p = game.player;
  const ps = game.worldToScreen(p.x, p.y);
  if (gs.x > 30 && gs.x < L.w - 30 && gs.y > 60 && gs.y < L.h - 30) return;
  const ang = Math.atan2(gs.y - ps.y, gs.x - ps.x);
  const e = edgePoint(L, ps.x, ps.y, ang, 40);
  const pulse = 0.65 + Math.sin(game.time * 3) * 0.2;
  ctx.fillStyle = `rgba(110,255,150,${pulse})`;
  chevron(ctx, e.x, e.y, ang, 11);
  const meters = Math.round(Math.hypot(gx - p.x, gy - p.y) / 24);
  ctx.font = `700 10px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(150,255,180,${pulse})`;
  ctx.fillText(`SAFE ${meters}m`, e.x - Math.cos(ang) * 26, e.y - Math.sin(ang) * 20);
}

// --- Text ----------------------------------------------------------------------------------

function drawMessages(ctx, game, L) {
  let yBig = L.h * 0.26;
  let ySmall = L.h * 0.38;
  for (const m of game.messages) {
    if (m.dur > 100) continue; // end-screen titles are drawn by drawEnd
    const fin = Math.min(1, m.t / 0.12);
    const fout = Math.min(1, (m.dur - m.t) / 0.4);
    const a = Math.max(0, Math.min(fin, fout));
    const big = m.size !== 'small';
    const scale = big ? 1 + (1 - fin) * 0.25 : 1;
    ctx.font = `900 ${Math.round((big ? 28 : 15) * scale)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = big ? yBig : ySmall;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(m.text, L.w / 2 + 2, y + 2);
    ctx.fillStyle = m.color;
    ctx.fillText(m.text, L.w / 2, y);
    ctx.globalAlpha = 1;
    if (big) yBig += 36;
    else ySmall += 20;
  }
}

function drawEnd(ctx, game, L) {
  const a = clamp((game.endT - 0.5) / 0.6, 0, 1);
  if (a <= 0) return;
  ctx.fillStyle = `rgba(4,5,8,${0.72 * a})`;
  ctx.fillRect(0, 0, L.w, L.h);
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 34px ${FONT}`;
  ctx.fillStyle = game.won ? '#7dffa1' : '#ff5a4a';
  const cy = L.h * 0.3;
  ctx.fillText(game.won ? 'SAFE ROOM REACHED' : 'YOU DIED', L.w / 2, cy);
  const st = game.stats;
  const acc = st.shots ? Math.round((st.hits / st.shots) * 100) : 0;
  const mm = Math.floor(st.time / 60);
  const ss = Math.floor(st.time % 60).toString().padStart(2, '0');
  ctx.font = `600 14px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const lines = [
    `time ${mm}:${ss}   ·   kills ${st.kills}   ·   accuracy ${acc}%`,
    `shoves ${st.shoves}   ·   damage taken ${Math.round(st.damage)}   ·   hordes ${st.hordes}`,
  ];
  lines.forEach((l, i) => ctx.fillText(l, L.w / 2, cy + 44 + i * 22));
  if (game.endT > 1.4) {
    ctx.font = `700 15px ${FONT}`;
    ctx.fillStyle = `rgba(255,255,255,${0.6 + Math.sin(game.time * 4) * 0.3})`;
    ctx.fillText('tap to play again', L.w / 2, cy + 110);
  }
  ctx.globalAlpha = 1;
}

function drawTouchDebug(ctx, touch, L) {
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = 'rgba(120,200,255,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(L.splitX, 0);
  ctx.lineTo(L.splitX, L.h);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(120,200,255,0.4)';
  for (const b of L.buttons) {
    if (b.hidden) continue;
    ctx.beginPath();
    if (b.shape === 'circle') circle(ctx, b.x, b.y, b.r + 8);
    else ctx.rect(b.x - 8, b.y - 8, b.w + 16, b.h + 16);
    ctx.stroke();
  }
  for (const s of [touch.move, touch.aim]) {
    if (!s.active) continue;
    ctx.fillStyle = 'rgba(120,200,255,0.8)';
    ctx.beginPath();
    circle(ctx, s.pos.x, s.pos.y, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,200,255,0.5)';
    ctx.beginPath();
    circle(ctx, s.start.x, s.start.y, 3);
    ctx.stroke();
  }
  const now = performance.now();
  for (const t of touch.taps) {
    const age = (now - t.t) / 600;
    if (age > 1) continue;
    ctx.strokeStyle = `rgba(255,255,120,${1 - age})`;
    ctx.beginPath();
    circle(ctx, t.x, t.y, 10 + age * 30);
    ctx.stroke();
  }
}

function drawDebug(ctx, game, input, ui, L) {
  const d = game.director;
  const f = input.frame;
  const t = input.touch;
  const chasing = game.zombies.reduce((n, z) => n + (z.state === 'chase' ? 1 : 0), 0);
  const lines = [
    `${ui.fps.toFixed(0)} fps  ${ui.frameMs.toFixed(1)}ms  ·  zombies ${game.zombies.length} (${chasing} hunting)  ·  particles ${game.effects.particles.length}`,
    `director ${d.phase}  intensity ${d.intensity.toFixed(2)}  next mob ${Math.max(0, d.mobT).toFixed(0)}s  near ${d.threatNear}`,
    `input ${f.source}  move ${f.move.x.toFixed(2)},${f.move.y.toFixed(2)} (raw ${t.move.out.raw.toFixed(2)})  aim raw ${f.aimRaw.toFixed(2)}  fire ${f.fire ? 'Y' : '-'}  assist ${game.player.assist ? 'lock' : '-'}`,
  ];
  ctx.font = `600 11px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const y0 = L.hp.y + L.hp.h + 8;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(L.hp.x, y0 - 3, Math.min(L.w - L.hp.x * 2, 560), lines.length * 15 + 6);
  ctx.fillStyle = 'rgba(180,255,200,0.9)';
  lines.forEach((l, i) => ctx.fillText(l, L.hp.x + 6, y0 + i * 15));
}
