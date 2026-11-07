// Screen-space HUD in CSS pixels: sticks, buttons, health, ammo, threat
// arrows, safe-room compass, announcements, end screens, debug read-outs.

import { FONT, rrect, circle } from './draw-utils.js';
import { TAU, clamp } from '../util.js';
import { ALLY } from '../game/ally.js';
import { ARMOR_MAX, ADRENALINE_TIME } from '../game/loot.js';
import { drawBenPaper } from './ben-render.js';

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
  if (game.ally) drawAllyPanel(ctx, game, L);
  if (game.ally && game.ally.alive && !ui.title) drawAllyMarker(ctx, game, L);
  drawWeapon(ctx, game, L, ui);
  if (!ui.title) drawBuffs(ctx, game, L);
  drawStats(ctx, game, L);
  drawButtons(ctx, game, L, input.touch);

  if (input.source === 'touch' || ui.forceSticks) {
    drawStick(ctx, input.touch.move, 'move', S, L, input.touch, ui);
    drawStick(ctx, input.touch.aim, 'aim', S, L, input.touch, ui);
  }
  if (S.showTouches) drawTouchDebug(ctx, input.touch, L);

  drawBossBar(ctx, game, L);
  drawHoldoutBar(ctx, game, L);
  drawFerryBar(ctx, game, L);
  if (p.pinnedBy && p.alive) drawPinned(ctx, game, L);
  drawMessages(ctx, game, L);
  if (!ui.title) drawCaption(ctx, game, L);
  if (!ui.title && !game.won && !game.lost) drawBenPaper(ctx, game, L);
  if (game.won || game.lost) drawEnd(ctx, game, L, ui);
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
    const k = w.def.reloadType === 'shell' ? w.mag / w.cap : 1 - w.reloadT / total;
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
  const limping = p.hp < 40 && p.alive && !(p.adrenT > 0);
  const tag = game.settings.godMode ? 'HP · GOD' : limping ? 'HP · LIMPING' : 'HP';
  ctx.fillText(tag, b.x + 50, b.y + 17);
  const bx = b.x + 10;
  const by = b.y + 31;
  const bw = b.w - 20;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(bx, by, bw, 6);
  ctx.fillStyle = col;
  ctx.fillRect(bx, by, bw * clamp(f, 0, 1), 6);
  if (p.armor > 0) {
    // Armor: a blue strip under the bar, and its number after the tag.
    ctx.fillStyle = 'rgba(134,200,255,0.25)';
    ctx.fillRect(bx, by + 8, bw, 3);
    ctx.fillStyle = '#86c8ff';
    ctx.fillRect(bx, by + 8, bw * clamp(p.armor / ARMOR_MAX, 0, 1), 3);
    const tw = ctx.measureText(tag).width;
    const full = ` · ARMOR ${Math.ceil(p.armor)}`;
    const room = b.x + b.w - 8 - (b.x + 50 + tw);
    ctx.fillText(ctx.measureText(full).width <= room ? full : ` · ${Math.ceil(p.armor)}`, b.x + 50 + tw, b.y + 17);
  }
}

/** Scavenged buffs under the weapon panel: hot rounds, adrenaline, extended mags. */
function drawBuffs(ctx, game, L) {
  const p = game.player;
  const chips = [];
  if (p.hot > 0) chips.push({ text: `HOT ROUNDS ${p.hot}`, color: '#ffa451' });
  if (p.adrenT > 0) chips.push({ text: `ADRENALINE ${Math.ceil(p.adrenT)}s`, color: '#ffe066', k: p.adrenT / ADRENALINE_TIME });
  if (p.magMult > 1) chips.push({ text: 'EXT MAGS', color: '#9df0ff' });
  if (!chips.length) return;
  const b = L.byId.swap;
  let y = b.y + b.h + 6;
  ctx.font = `800 10px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (const c of chips) {
    const w = ctx.measureText(c.text).width + 16;
    const x = b.x + b.w - w;
    panel(ctx, x, y, w, 18);
    if (c.k !== undefined) {
      ctx.fillStyle = 'rgba(255,224,102,0.18)';
      ctx.fillRect(x + 2, y + 2, (w - 4) * clamp(c.k, 0, 1), 14);
    }
    ctx.fillStyle = c.color;
    ctx.fillText(c.text, x + w - 8, y + 9.5);
    y += 22;
  }
}

/** Teammate status under your health: HP, DOWN (bleeding out) or DIED. */
function drawAllyPanel(ctx, game, L) {
  const a = game.ally;
  const b = allyPanelRect(L);
  panel(ctx, b.x, b.y, b.w, b.h);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `800 10px ${FONT}`;
  const bx = b.x + 44;
  const bw = b.w - 44 - 34;
  const by = b.y + b.h / 2 - 3;
  if (!a.alive) {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('ALLY DIED', b.x + 10, b.y + b.h / 2);
    return;
  }
  if (a.down) {
    const pulse = 0.6 + Math.sin(game.time * 7) * 0.3;
    ctx.fillStyle = `rgba(255,110,90,${pulse})`;
    ctx.fillText('DOWN', b.x + 10, b.y + b.h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(bx, by, bw, 6);
    ctx.fillStyle = '#e2574c';
    ctx.fillRect(bx, by, bw * clamp(a.downHp / 100, 0, 1), 6);
    if (a.revive > 0) {
      ctx.fillStyle = '#8cffa0';
      ctx.fillRect(bx, by, bw * clamp(a.revive, 0, 1), 6);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = `rgba(255,140,120,${pulse})`;
    ctx.fillText(a.revive > 0 ? `${Math.round(a.revive * 100)}%` : 'HELP', b.x + b.w - 8, b.y + b.h / 2);
    return;
  }
  const f = clamp(a.hp / a.maxHp, 0, 1);
  const col = a.healT > 0 ? '#8cffa0' : f > 0.6 ? '#5fd38a' : f > 0.3 ? '#e8c25a' : '#e2574c';
  ctx.fillStyle = 'rgba(140,255,160,0.85)';
  ctx.fillText('ALLY', b.x + 10, b.y + b.h / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(bx, by, bw, 6);
  ctx.fillStyle = col;
  ctx.fillRect(bx, by, bw * f, 6);
  ctx.textAlign = 'right';
  ctx.fillStyle = col;
  ctx.fillText(a.healT > 0 ? '+' : String(Math.ceil(a.hp)), b.x + b.w - 8, b.y + b.h / 2);
}

function allyPanelRect(L) {
  return { x: L.hp.x, y: L.hp.y + L.hp.h + 6, w: L.hp.w, h: 22 };
}

/** Name tag over the teammate on screen; an edge arrow (red when it's down) when it's off screen. */
function drawAllyMarker(ctx, game, L) {
  const a = game.ally;
  const v = game.view;
  const cam = game.camera;
  const sx = (a.x - cam.x - cam.shakeX) * v.scale + v.w / 2;
  const sy = (a.y - cam.y - cam.shakeY) * v.scale + v.h / 2;
  const pulse = 0.6 + Math.sin(game.time * 7) * 0.3;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (sx > 0 && sx < L.w && sy > 0 && sy < L.h) {
    ctx.font = `800 10px ${FONT}`;
    if (a.down) {
      // Under the dashed revive circle (announcements sit above the centre).
      const y = sy + ALLY.reviveRange * v.scale + 12;
      ctx.fillStyle = `rgba(255,120,100,${pulse})`;
      ctx.fillText(a.revive > 0 ? `REVIVING ${Math.round(a.revive * 100)}%` : 'DOWN — STAND HERE', sx, y);
      return;
    }
    // Above its ring; a small health bar between the name and the ring when it's hurt.
    const top = sy - (a.r + 5) * v.scale;
    const hurt = a.hp < a.maxHp * 0.6;
    const y = top - (hurt ? 16 : 10);
    ctx.fillStyle = 'rgba(160,255,175,0.55)';
    ctx.fillText('ALLY', sx, y);
    if (hurt) {
      const w = 26;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(sx - w / 2, top - 8, w, 3);
      ctx.fillStyle = a.hp < 30 ? '#e2574c' : '#e8c25a';
      ctx.fillRect(sx - w / 2, top - 8, w * clamp(a.hp / a.maxHp, 0, 1), 3);
    }
    return;
  }
  const p = game.player;
  const px = (p.x - cam.x - cam.shakeX) * v.scale + v.w / 2;
  const py = (p.y - cam.y - cam.shakeY) * v.scale + v.h / 2;
  const ang = Math.atan2(sy - py, sx - px);
  const e = edgePoint(L, px, py, ang, 30);
  ctx.fillStyle = a.down ? `rgba(255,90,70,${pulse})` : 'rgba(140,255,160,0.75)';
  chevron(ctx, e.x, e.y, ang, a.down ? 13 : 10);
  ctx.font = `800 10px ${FONT}`;
  const m = Math.round(Math.hypot(a.x - p.x, a.y - p.y) / 24);
  ctx.fillText(a.down ? `ALLY DOWN ${m}m` : `ALLY ${m}m`, e.x - Math.cos(ang) * 30, e.y - Math.sin(ang) * 20);
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
  ctx.fillText(`/ ${w.cap}`, b.x + 14 + mw, b.y + 33);
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
  ctx.fillText(`${mm}:${ss}   ·   ${game.stats.kills} kills${game.dailyKey ? '   ·   daily' : ''}`, midX, L.safe.t + 14);
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
  // worldToScreen inlined: this runs for every hunting zombie, every frame.
  const v = game.view;
  const cam = game.camera;
  const ox = v.w / 2 - (cam.x + cam.shakeX) * v.scale;
  const oy = v.h / 2 - (cam.y + cam.shakeY) * v.scale;
  for (const z of game.zombies) {
    if (!z.alive || z.ghost || z.state !== 'chase') continue;
    const ddx = z.x - p.x;
    const ddy = z.y - p.y;
    const lim = z.type === 'common' ? 850 : 1300;
    if (ddx * ddx + ddy * ddy > lim * lim) continue;
    const d = Math.sqrt(ddx * ddx + ddy * ddy);
    const zsx = z.x * v.scale + ox;
    const zsy = z.y * v.scale + oy;
    if (zsx > 0 && zsx < L.w && zsy > 0 && zsy < L.h) continue;
    if (z.type !== 'common') {
      const ang = Math.atan2(zsy - ps.y, zsx - ps.x);
      const e = edgePoint(L, ps.x, ps.y, ang, z.type === 'tank' ? 26 : 22);
      const pulse = 0.7 + Math.sin(game.time * 8) * 0.3;
      ctx.fillStyle = z.type === 'tank' ? `rgba(255,40,30,${pulse})` : z.type === 'terror' ? `rgba(220,230,245,${pulse})` : `rgba(190,140,255,${pulse})`;
      chevron(ctx, e.x, e.y, ang, z.type === 'tank' ? 20 : 14);
      ctx.font = `800 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(z.type === 'tank' ? 'TANK' : z.type === 'terror' ? 'TERROR' : 'HUNTER', e.x - Math.cos(ang) * 28, e.y - Math.sin(ang) * 22);
      continue;
    }
    const ang = Math.atan2(zsy - ps.y, zsx - ps.x);
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
  const path = Number.isFinite(game.goalDist) ? game.goalDist : Math.hypot(gx - p.x, gy - p.y);
  const meters = Math.round(path / 24);
  ctx.font = `700 10px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(150,255,180,${pulse})`;
  const F = game.events && game.events.finale;
  const label = F ? (F.state === 'docked' ? 'GANGWAY' : 'PIER 9') : 'SAFE';
  ctx.fillText(`${label} ${meters}m`, e.x - Math.cos(ang) * (F ? 30 : 26), e.y - Math.sin(ang) * 20);
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

/** Word-wrap text to a width (at most maxLines lines; the last one gets an ellipsis if cut). */
function wrap(ctx, text, width, maxLines) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= width || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] += '…';
  }
  return lines;
}

/** What you're standing next to says (graffiti, a poster, a journal page). Bottom centre, between the sticks. */
function drawCaption(ctx, game, L) {
  const cap = game.caption;
  if (!cap || !cap.item || cap.a <= 0.02) return;
  const r = cap.item;
  const maxW = Math.min(440, L.w * 0.46);
  ctx.font = `600 13px ${FONT}`;
  const lines = wrap(ctx, r.text, maxW - 24, 3);
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  ctx.font = `800 9px ${FONT}`;
  const labelW = ctx.measureText(r.label).width;
  const w = Math.max(textW, labelW) + 24;
  const h = 22 + lines.length * 17;
  const x = L.w / 2 - w / 2;
  const y = L.h - L.safe.b - 14 - h;
  ctx.globalAlpha = cap.a;
  ctx.fillStyle = 'rgba(8,10,14,0.72)';
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  rrect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,210,122,0.85)';
  ctx.font = `800 9px ${FONT}`;
  ctx.fillText(r.label, L.w / 2, y + 11);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `600 13px ${FONT}`;
  lines.forEach((l, i) => ctx.fillText(l, L.w / 2, y + 27 + i * 17));
  ctx.globalAlpha = 1;
}

function drawEnd(ctx, game, L, ui) {
  const a = clamp((game.endT - 0.5) / 0.6, 0, 1);
  if (a <= 0) return;
  ctx.fillStyle = `rgba(4,5,8,${0.72 * a})`;
  ctx.fillRect(0, 0, L.w, L.h);
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // With the rating card up, the summary moves aside: left of it, or above it on narrow screens.
  const card = ui && ui.reportRect;
  let cx = L.w / 2;
  let cy = L.h * 0.3;
  let maxW = L.w - 32;
  let bottom = L.h - L.safe.b - 10;
  if (card) {
    if (card.left > L.w * 0.42) {
      cx = (L.safe.l + card.left) / 2;
      maxW = card.left - L.safe.l - 28;
      cy = Math.max(L.safe.t + 34, L.h * 0.22);
    } else {
      cy = Math.min(L.safe.t + 84, card.top * 0.3);
      bottom = card.top - 8;
    }
  }
  const title = game.won ? (game.level === 'docks' ? 'YOU MADE THE LAST FERRY' : 'SAFE ROOM REACHED') : 'YOU DIED';
  let tf = 34;
  ctx.font = `900 ${tf}px ${FONT}`;
  while (tf > 18 && ctx.measureText(title).width > maxW) ctx.font = `900 ${(tf -= 2)}px ${FONT}`;
  ctx.fillStyle = game.won ? '#7dffa1' : '#ff5a4a';
  ctx.fillText(title, cx, cy);
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
  if (st.hunters || st.pins || st.deadstops || st.tanks || game.director.tankSpawned) {
    lines.push(
      `hunters ${st.hunters} (skeets ${st.skeets}, deadstops ${st.deadstops}, pinned ${st.pins})   ·   tank ${st.tanks ? 'down' : game.director.tankSpawned ? 'survived' : '-'}`,
    );
  }
  if (game.loot) {
    const T = game.loot.totals;
    const parts = [];
    if (T.stash) parts.push(`supplies ${st.stashes}/${T.stash}`);
    if (T.room) parts.push(`boarded rooms ${st.rooms}/${T.room}`);
    if (T.secret) parts.push(st.secrets ? 'secret FOUND' : 'secret not found');
    if (parts.length) lines.push(parts.join('   ·   '));
  }
  const E = game.events;
  if (E && (E.holdout || E.breach || E.explosives.length)) {
    const parts = [];
    if (E.holdout) {
      const ht = st.holdoutTime;
      parts.push(st.holdouts ? `gate held ${Math.floor(ht / 60)}:${Math.floor(ht % 60).toString().padStart(2, '0')}` : E.holdout.state === 'running' ? 'gate still opening' : 'gate never opened');
    }
    if (E.breach) parts.push(st.shortcut ? 'took the shortcut' : 'went the long way');
    if (E.explosives.length) parts.push(`explosions ${st.explosions}`);
    lines.push(parts.join('   ·   '));
  }
  const F = E && E.finale;
  if (F) {
    const held = F.flareT >= 0 ? (game.won ? F.t : F.flareT) : 0;
    const mmss = `${Math.floor(held / 60)}:${Math.floor(held % 60).toString().padStart(2, '0')}`;
    lines.push(F.state === 'idle' ? 'the flare was never fired' : F.state === 'docked' ? `held the pier ${mmss}   ·   the ferry came` : `held the pier ${mmss}   ·   the ferry was ${Math.max(0, Math.ceil(F.dur - F.t))}s out`);
  }
  if (st.benNest || st.benGlimpse) {
    const parts = [];
    if (st.benNest) parts.push("found a bed that wasn't ours");
    if (st.benGlimpse) parts.push('something looked back');
    lines.push(parts.join('   ·   '));
  }
  if (st.terrors || st.terrorsFled || st.terrorHits) {
    lines.push(`night terror: killed ${st.terrors}   ·   drove off ${st.terrorsFled}   ·   it hit you ${st.terrorHits}×`);
  }
  if (game.ally) {
    const a = game.ally;
    const state = !a.alive ? 'died' : a.down ? 'down' : game.won ? 'made it' : 'alive';
    lines.push(`ally ${state}   ·   ally kills ${st.allyKills}   ·   saved you ${st.allySaves}×   ·   revives ${st.revives}`);
  }
  // Shrink to fit beside / above the card; drop the least important lines if still too tall.
  let fs = 14;
  ctx.font = `600 ${fs}px ${FONT}`;
  const widest = () => Math.max(...lines.map((l) => ctx.measureText(l).width));
  while (fs > 10 && widest() > maxW) ctx.font = `600 ${--fs}px ${FONT}`;
  const lh = Math.round(fs * 1.55);
  const y0 = cy + tf * 0.5 + 10 + lh * 0.5;
  while (lines.length > 2 && y0 + (lines.length - 1) * lh > bottom - lh * 0.5) lines.pop();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  lines.forEach((l, i) => ctx.fillText(l, cx, y0 + i * lh));
  if (game.endT > 1.4 && !card) {
    ctx.font = `700 15px ${FONT}`;
    ctx.fillStyle = `rgba(255,255,255,${0.6 + Math.sin(game.time * 4) * 0.3})`;
    ctx.fillText('tap to play again', cx, y0 + lines.length * lh + 18);
  }
  ctx.globalAlpha = 1;
}

function drawBossBar(ctx, game, L) {
  const d = game.director;
  if (!d.tankAlive) return;
  const t = d.tank;
  const w = Math.min(280, L.w * 0.34);
  const x = L.w / 2 - w / 2;
  const y = L.safe.t + 34;
  ctx.fillStyle = 'rgba(8,10,14,0.6)';
  ctx.fillRect(x - 4, y - 4, w + 8, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x, y, w, 10);
  ctx.fillStyle = t.hitFlash > 0 ? '#ff8a70' : '#d8392c';
  ctx.fillRect(x, y, w * clamp(t.hp / t.maxHp, 0, 1), 10);
  ctx.font = `900 10px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText('TANK', L.w / 2, y + 5.5);
}

/** While the holdout gate opens: a bar under the timer (below the Tank's, if it's up). */
function drawHoldoutBar(ctx, game, L) {
  const H = game.events && game.events.holdout;
  if (!H || H.state !== 'running' || game.won || game.lost) return;
  const w = Math.min(280, L.w * 0.34);
  const x = L.w / 2 - w / 2;
  const y = L.safe.t + 34 + (game.director.tankAlive ? 24 : 0);
  ctx.fillStyle = 'rgba(8,10,14,0.6)';
  ctx.fillRect(x - 4, y - 4, w + 8, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x, y, w, 10);
  ctx.fillStyle = H.f > 0 ? '#ffb347' : 'rgba(255,179,71,0.45)';
  ctx.fillRect(x, y, w * clamp(H.f, 0, 1), 10);
  ctx.font = `900 10px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(H.f > 0 ? `HOLD OUT · GATE ${Math.floor(H.f * 100)}%` : 'HOLD OUT · GATE STARTING', L.w / 2, y + 5.5);
}

/** Pier 9: the countdown to the ferry, then the call to board. */
function drawFerryBar(ctx, game, L) {
  const F = game.events && game.events.finale;
  if (!F || F.state === 'idle' || game.won || game.lost) return;
  const w = Math.min(280, L.w * 0.34);
  const x = L.w / 2 - w / 2;
  const y = L.safe.t + 34 + (game.director.tankAlive ? 24 : 0);
  const docked = F.state === 'docked';
  ctx.fillStyle = 'rgba(8,10,14,0.6)';
  ctx.fillRect(x - 4, y - 4, w + 8, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x, y, w, 10);
  ctx.fillStyle = docked ? `rgba(125,255,161,${0.75 + Math.sin(game.time * 8) * 0.25})` : '#7fc8ff';
  ctx.fillRect(x, y, w * clamp(F.f, 0, 1), 10);
  ctx.font = `900 10px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = docked ? '#103018' : '#fff';
  const left = Math.max(0, Math.ceil(F.dur - F.t));
  ctx.fillText(docked ? 'ALL ABOARD · GET TO THE GANGWAY' : `HOLD OUT · FERRY IN ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, L.w / 2, y + 5.5);
}

function drawPinned(ctx, game, L) {
  const p = game.player;
  const need = game.settings.hunterBreakTaps;
  const pulse = 0.75 + Math.sin(game.time * 14) * 0.25;
  const y = L.h * 0.62;
  const a = game.ally;
  if (a && a.alive && !a.down) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 11px ${FONT}`;
    ctx.fillStyle = 'rgba(160,255,175,0.8)';
    ctx.fillText('ALLY ON THE WAY', L.w / 2, y + 46);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 22px ${FONT}`;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText('TAP TO BREAK FREE!', L.w / 2 + 2, y + 2);
  ctx.fillStyle = `rgba(190,140,255,${pulse})`;
  ctx.fillText('TAP TO BREAK FREE!', L.w / 2, y);
  const gap = 18;
  const x0 = L.w / 2 - ((need - 1) * gap) / 2;
  for (let i = 0; i < need; i++) {
    const filled = p.struggle >= i + 1 ? 1 : clamp(p.struggle - i, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    circle(ctx, x0 + i * gap, y + 26, 6);
    ctx.fill();
    if (filled > 0) {
      ctx.fillStyle = `rgba(190,140,255,${0.35 + filled * 0.65})`;
      ctx.beginPath();
      circle(ctx, x0 + i * gap, y + 26, 6 * filled);
      ctx.fill();
    }
  }
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
    `${ui.fps.toFixed(0)} fps  ${ui.frameMs.toFixed(1)}ms  ·  zombies ${game.zombies.length}/${game.director.cap} (${chasing} hunting)  ·  particles ${game.effects.particles.length}`,
    `director ${d.phase}  intensity ${d.intensity.toFixed(2)}  next mob ${Math.max(0, d.mobT).toFixed(0)}s  near ${d.threatNear}  ·  hunter in ${Math.max(0, d.specialT).toFixed(0)}s  tank at ${Math.round(d.tankAt * 100)}% (route ${Math.round(game.progress * 100)}%)`,
    `input ${f.source}  move ${f.move.x.toFixed(2)},${f.move.y.toFixed(2)} (raw ${t.move.out.raw.toFixed(2)})  aim raw ${f.aimRaw.toFixed(2)}  fire ${f.fire ? 'Y' : '-'}  assist ${game.player.assist ? 'lock' : '-'}`,
  ];
  ctx.font = `600 11px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const y0 = (game.ally ? allyPanelRect(L).y + allyPanelRect(L).h : L.hp.y + L.hp.h) + 8;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(L.hp.x, y0 - 3, Math.min(L.w - L.hp.x * 2, 560), lines.length * 15 + 6);
  ctx.fillStyle = 'rgba(180,255,200,0.9)';
  lines.forEach((l, i) => ctx.fillText(l, L.hp.x + 6, y0 + i * 15));
}
