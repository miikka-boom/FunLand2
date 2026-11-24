// The tutorial's coaching (src/game/tutorial.js runs the lessons):
//   - in the world (bright pass): the ring to walk to, beacons on the gates
//     (red shut, amber opening, green open), brackets on the targets in the
//     pen, a red pulse round the alarm car while its lesson is on
//   - on the HUD, first of all (touch): a picture of how to hold the phone, on
//     its side with a thumb on each stick, and where the thumbs go;
//   - on the HUD: the lesson card at the bottom, between the thumbs (what you
//     need to see is mostly ahead of you, up the screen, so the card stays out
//     of its way), and for touch a ghost thumb doing the gesture on the half of
//     the screen it belongs to (move on the left; aim, fire and tap on the
//     right; both at once to walk back while you shoot), or a pulse round
//     the button to press.
// The ghost stands aside while your own thumb is on that stick.

import { FONT, rrect, circle } from './draw-utils.js';
import { ball } from './prims.js';
import { TAU, clamp } from '../util.js';

const GREEN = '125,255,161';
const AMBER = '255,190,90';
const RED = '255,80,64';
const ORANGE = '255,140,80';

// --- In the world ----------------------------------------------------------------------------

/** Rings, beacons and target brackets. Called in the bright pass with the plain screen transform. */
export function drawTutorialBright(R, game, vr) {
  const T = game.tutorial;
  if (!T) return;
  const { ctx, v } = R;
  const t = game.time;

  // Beacons on the wall ends either side of every gate.
  for (const G of Object.values(T.gates)) {
    if (G.x < vr.x - 200 || G.x > vr.x + vr.w + 200 || G.y < vr.y - 200 || G.y > vr.y + vr.h + 200) continue;
    const b = G.bars;
    const col = G.state === 'open' ? GREEN : G.state === 'opening' ? AMBER : RED;
    const pulse = G.state === 'opening' ? 0.5 + 0.5 * Math.sin(t * 12) : G.state === 'open' ? 0.85 : 0.4 + 0.3 * Math.sin(t * 3);
    const z = v.flat ? 0 : 90;
    for (const x of [b.x0 - 6, b.x0 + b.w0 + 6]) {
      ctx.fillStyle = `rgba(${col},${0.22 * pulse})`;
      ctx.beginPath();
      ball(ctx, v, x, G.y, z, 24);
      ctx.fill();
      ctx.fillStyle = `rgba(${col},${0.6 + 0.4 * pulse})`;
      ctx.beginPath();
      ball(ctx, v, x, G.y, z, 5);
      ctx.fill();
    }
  }

  if (T.over) return;
  const a = T.arrow();
  // Where to walk: a ring on the ground, and what it's for.
  if (a && a.ring) {
    const k = 0.5 + 0.5 * Math.sin(t * 4);
    R.ground(0);
    ctx.strokeStyle = `rgba(${GREEN},${0.35 + 0.4 * k})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 7]);
    ctx.beginPath();
    circle(ctx, a.x, a.y, a.r || 40);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(${GREEN},${0.06 + 0.06 * k})`;
    ctx.beginPath();
    circle(ctx, a.x, a.y, (a.r || 40) * (0.55 + 0.45 * ((t * 0.8) % 1)));
    ctx.fill();
    R.reset();
    if (a.label) {
      ctx.font = `800 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(${GREEN},${0.6 + 0.3 * k})`;
      ctx.fillText(a.label, v.px(a.x, a.y), v.py(a.x, a.y, 0) - (a.r || 40) * v.scale * v.sp - 12);
    }
  }

  const id = T.step.id;
  // The alarm lesson: a slow red pulse round the car, until it has gone off.
  const car = T.L.car;
  if (id === 'alarm' && T.pause <= 0 && car && !car.alarmOn && !car.alarmDone) {
    const k = 0.5 + 0.5 * Math.sin(t * 4);
    R.ground(0);
    ctx.strokeStyle = `rgba(${RED},${0.3 + 0.35 * k})`;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    circle(ctx, car.x + car.w / 2, car.y + car.h / 2, 62 + 4 * k);
    ctx.stroke();
    ctx.setLineDash([]);
    R.reset();
  }

  // The targets in the pen: corner brackets, bright on the one your laser is on.
  if ((id === 'aim' || id === 'fire') && T.pause <= 0) {
    for (const z of T.pen) {
      if (!z.alive) continue;
      const sx = v.px(z.x, z.y);
      const sy = v.py(z.x, z.y, 16);
      const on = T.aimed === z;
      const s = (on ? 15 : 17) + Math.sin(t * 5 + z.id) * 1.5;
      const L = 6;
      ctx.strokeStyle = on ? `rgba(${ORANGE},0.95)` : 'rgba(255,255,255,0.6)';
      ctx.lineWidth = on ? 2.4 : 1.6;
      ctx.beginPath();
      for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.moveTo(sx + dx * s, sy + dy * s - dy * L);
        ctx.lineTo(sx + dx * s, sy + dy * s);
        ctx.lineTo(sx + dx * s - dx * L, sy + dy * s);
      }
      ctx.stroke();
    }
  }
}

// --- On the HUD ----------------------------------------------------------------------------

/** The lesson card, and the ghost thumbs for touch. */
export function drawTutorialHud(ctx, game, input, ui, L) {
  const T = game.tutorial;
  if (!T || ui.title || game.lost || game.won) return;
  const touch = input.source === 'touch' || ui.forceSticks;
  const view = T.view(input.source === 'touch' ? 'touch' : input.source);
  drawCard(ctx, game, view, L);
  if (view.coach) coach(ctx, game, input, view, L, touch);
}

/** Where the card goes: bottom centre, between the two thumbs' sticks (lineH: the text's line height). */
export function cardRect(L, R, lines, lineH = 17) {
  const x0 = L.fixedMove.x + R + 14;
  const x1 = L.fixedAim.x - R - 14;
  const w = Math.max(220, Math.min(440, x1 - x0));
  const h = 10 + 22 + lines * lineH + 8;
  return { x: Math.round((x0 + x1) / 2 - w / 2), y: Math.round(L.h - L.safe.b - 10 - h), w, h };
}

/**
 * The card's words, wrapped to its width: 13 px on up to four lines, or a
 * size smaller when a small phone needs more. Never cut short.
 */
export function cardText(ctx, text, maxW) {
  for (const size of [13, 12, 11]) {
    ctx.font = `600 ${size}px ${FONT}`;
    const lines = wrap(ctx, text, maxW);
    if (lines.length <= 4 || size === 11) return { lines, size, lineH: size + 4 };
  }
  return null; // (not reached)
}

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function drawCard(ctx, game, view, L) {
  const pad = 12;
  const R = game.settings.stickRadius;
  const { w } = cardRect(L, R, 1);
  const { lines, size, lineH } = cardText(ctx, view.text, w - pad * 2);
  const { x, y, h } = cardRect(L, R, lines.length, lineH);
  const done = view.done;
  const pulse = 0.5 + 0.5 * Math.sin(game.time * 3);

  ctx.fillStyle = done ? 'rgba(10,26,16,0.8)' : 'rgba(8,10,14,0.74)';
  ctx.strokeStyle = done ? `rgba(${GREEN},0.8)` : 'rgba(255,255,255,0.16)';
  ctx.lineWidth = done ? 2 : 1;
  ctx.beginPath();
  rrect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
  // An accent down the left edge: you've got something to do.
  if (!done) {
    ctx.fillStyle = `rgba(${ORANGE},${0.55 + 0.3 * pulse})`;
    ctx.fillRect(x + 1, y + 9, 3, h - 18);
  }

  // The lesson, and how far through you are.
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `900 16px ${FONT}`;
  ctx.fillStyle = done ? `rgb(${GREEN})` : '#fff';
  const title = done ? `✓ ${view.title}` : view.title;
  ctx.fillText(title, x + pad, y + 10 + 11);
  let tx = x + pad + ctx.measureText(title).width + 10;
  if (view.count && !done) {
    ctx.font = `800 13px ${FONT}`;
    ctx.fillStyle = `rgb(${AMBER})`;
    ctx.fillText(view.count, tx, y + 10 + 12);
    tx += ctx.measureText(view.count).width + 10;
  }
  // The lessons, as dots (filled = done), in the top right of the card.
  const gap = 8;
  const dotsW = (view.of - 1) * gap;
  const dx0 = x + w - pad - dotsW;
  if (dx0 > tx) {
    for (let i = 0; i < view.of; i++) {
      ctx.fillStyle = i < view.lessons ? `rgba(${GREEN},0.9)` : 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      circle(ctx, dx0 + i * gap, y + 10 + 11, i < view.lessons ? 2.6 : 2.2);
      ctx.fill();
    }
  }

  ctx.font = `600 ${size}px ${FONT}`;
  ctx.fillStyle = done ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.88)';
  lines.forEach((l, i) => ctx.fillText(l, x + pad, y + 10 + 22 + lineH / 2 + 1 + i * lineH));
}

// --- How to hold the phone -------------------------------------------------------------------

const INK = '40,44,52'; // the ghost thumbs' dark

/** A rounded rect turned by `a` about its centre (cx, cy), as the current path. */
function blob(ctx, cx, cy, w, h, r, a) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.beginPath();
  rrect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.restore();
}

/** A round-ended bar from (x0, y0) to (x1, y1), w thick (as a thick stroke). */
function bar(ctx, x0, y0, x1, y1, w, style) {
  ctx.strokeStyle = style;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** Where the picture of how to hold the phone goes: the middle of the screen, between the HUD and the card, short of the buttons on the right. */
export function holdRect(L, card) {
  const top = L.safe.t + 56;
  const bottom = card.y - 10;
  let right = L.w;
  for (const b of [L.byId.shove, L.byId.reload]) if (b && !b.hidden) right = Math.min(right, b.x - b.r - 8);
  const W = Math.max(110, Math.min(300, L.w * 0.44, (bottom - top) / 0.66, (right - L.w / 2) / 0.56));
  return { x: L.w / 2 - 0.56 * W, y: top + Math.max(0, (bottom - top - 0.66 * W) / 2), w: 1.12 * W, h: 0.66 * W, W };
}

/**
 * How to hold the phone, for anyone who has never played this way: the phone
 * on its side, a hand round each end, the thumbs on the two sticks (pressing
 * now and then). Drawn like the ghost thumbs (dark, outlined in white), on a
 * dark panel.
 */
function holdPicture(ctx, P, t) {
  const W = P.W;
  const PW = 0.8 * W;
  const PH = 0.4 * W;
  const cx = P.x + P.w / 2;
  const cy = P.y + 0.08 * W + PH / 2;
  const x0 = cx - PW / 2;
  const y0 = cy - PH / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,14,0.68)';
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  rrect(ctx, P.x, P.y, P.w, P.h, 14);
  ctx.fill();
  ctx.stroke();
  ctx.clip(); // the forearms run out of the bottom of the panel

  // The hands round the ends (outlines first, then the dark: one silhouette each).
  const hands = [-1, 1].map((s) => {
    const ex = cx + (s * PW) / 2;
    return {
      arm: [ex + s * 0.1 * W, cy + 0.5 * W, ex + s * 0.005 * W, cy + PH / 2 + 0.03 * W, 0.17 * W],
      palm: [ex + s * 0.015 * W, cy + 0.045 * W, 0.15 * W, PH + 0.09 * W, 0.07 * W, -s * 0.1],
    };
  });
  for (const pass of [0, 1]) {
    for (const h of hands) {
      const [ax0, ay0, ax1, ay1, aw] = h.arm;
      bar(ctx, ax0, ay0, ax1, ay1, aw + (pass ? 0 : 4), pass ? `rgb(${INK})` : 'rgba(255,255,255,0.8)');
      blob(ctx, ...h.palm);
      if (pass) {
        ctx.fillStyle = `rgb(${INK})`;
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }
  }

  // The phone, on its side.
  ctx.fillStyle = '#0e1015';
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  rrect(ctx, x0, y0, PW, PH, 0.065 * W);
  ctx.fill();
  ctx.stroke();
  const sx = x0 + 0.035 * W;
  const sy = y0 + 0.028 * W;
  const sw = PW - 0.07 * W;
  const sh = PH - 0.056 * W;
  const glass = ctx.createLinearGradient(sx, sy, sx, sy + sh);
  glass.addColorStop(0, '#26364a');
  glass.addColorStop(1, '#151c26');
  ctx.fillStyle = glass;
  ctx.beginPath();
  rrect(ctx, sx, sy, sw, sh, 0.03 * W);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  circle(ctx, x0 + 0.017 * W, cy, 0.006 * W); // the camera
  ctx.fill();
  // On the screen: a street, someone on it, and the two sticks.
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(sx, cy - 0.06 * W, sw, 0.07 * W);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  circle(ctx, cx, cy - 0.025 * W, 0.013 * W);
  ctx.fill();
  const stick = [-1, 1].map((s) => ({ x: cx + s * 0.25 * W, y: cy + 0.075 * W }));
  ctx.lineWidth = 1.5;
  for (const [i, q] of stick.entries()) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    circle(ctx, q.x, q.y, 0.06 * W);
    ctx.stroke();
    if (i === 1) {
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      circle(ctx, q.x, q.y, 0.042 * W);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // The thumbs, from the heel of each hand onto its stick, pressing in turn.
  const thumbs = [-1, 1].map((s, i) => {
    const ph = (t * 0.8 + i * 0.5) % 1;
    const press = ph < 0.2 ? Math.sin((ph / 0.2) * Math.PI) : 0;
    const ex = cx + (s * PW) / 2;
    return { base: [ex - s * 0.045 * W, cy + PH / 2 - 0.005 * W], tip: [stick[i].x, stick[i].y + press * 0.006 * W], ph, s };
  });
  for (const pass of [0, 1]) {
    for (const th of thumbs) bar(ctx, th.base[0], th.base[1], th.tip[0], th.tip[1], 0.072 * W + (pass ? 0 : 3), pass ? `rgb(${INK})` : 'rgba(255,255,255,0.85)');
  }
  for (const th of thumbs) {
    const a = Math.atan2(th.base[1] - th.tip[1], th.base[0] - th.tip[0]);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.ellipse(th.tip[0] + Math.cos(a) * 0.012 * W, th.tip[1] + Math.sin(a) * 0.012 * W, 0.016 * W, 0.022 * W, a + Math.PI / 2, 0, TAU);
    ctx.fill();
    // A ripple under the thumb as it presses.
    if (th.ph < 0.5) {
      const k = th.ph / 0.5;
      ctx.strokeStyle = `rgba(${GREEN},${0.7 * (1 - k)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      circle(ctx, th.tip[0], th.tip[1], 0.05 * W + 0.04 * W * k);
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
  ctx.restore();
}

// --- The ghost thumb ---------------------------------------------------------------------

/**
 * A thumb seen from above: the tip at (x, y), the rest of it reaching down to
 * the bottom corner of its side (side -1 left, 1 right). press 0..1 squashes
 * the tip and rings it.
 */
function thumb(ctx, x, y, side, alpha, press = 0) {
  if (alpha <= 0.01) return;
  const bx = x + side * 30;
  const by = y + 52;
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(255,255,255,${0.55 * alpha})`;
  ctx.lineWidth = 36;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.strokeStyle = `rgba(40,44,52,${0.55 * alpha})`;
  ctx.lineWidth = 33;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(bx, by);
  ctx.stroke();
  // The nail.
  ctx.fillStyle = `rgba(255,255,255,${0.22 * alpha})`;
  ctx.beginPath();
  ctx.ellipse(x + side * 3, y + 3, 7, 9, side * 0.5, 0, TAU);
  ctx.fill();
  if (press > 0.01) {
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * alpha * press})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    circle(ctx, x, y, 18 + 10 * (1 - press));
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

function label(ctx, text, x, y, alpha, color = '255,255,255') {
  ctx.font = `800 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 14;
  ctx.fillStyle = `rgba(8,10,14,${0.6 * alpha})`;
  ctx.beginPath();
  rrect(ctx, x - w / 2, y - 9, w, 18, 9);
  ctx.fill();
  ctx.fillStyle = `rgba(${color},${0.95 * alpha})`;
  ctx.fillText(text, x, y + 0.5);
}

/** A screen direction (unit) from the survivor toward a world point, or `dflt`. */
function screenDir(game, q, dflt) {
  if (!q) return dflt;
  const p = game.player;
  const a = game.worldToScreen(p.x, p.y);
  const b = game.worldToScreen(q.x, q.y);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  return d > 4 ? { x: dx / d, y: dy / d } : dflt;
}

/** Ease a 0..1 phase in and out. */
const ease = (f) => f * f * (3 - 2 * f);

/** The left ghost: a thumb lands on the stick and slides toward `dir` (a unit vector on screen). */
function moveGhost(ctx, g, dir, R, alpha, text, t, S) {
  const ph = (t / 1.7) % 1;
  const reach = ph < 0.2 ? 0 : ph < 0.6 ? ease((ph - 0.2) / 0.4) : 1;
  const fade = ph < 0.08 ? ph / 0.08 : ph > 0.85 ? (1 - ph) / 0.15 : 1;
  ring(ctx, g.x, g.y, R, alpha * fade, false, false, S);
  thumb(ctx, g.x + dir.x * R * 0.8 * reach, g.y + dir.y * R * 0.8 * reach, -1, alpha * fade, ph < 0.2 ? ph / 0.2 : 1);
  label(ctx, text, g.x, g.y + R + 22, alpha);
}

/** The right ghost toward `dir`: aiming (out to just inside the dashed ring, sweeping) or firing (past it, the ring lit). */
function aimGhost(ctx, g, dir, R, alpha, fire, text, t, S) {
  const ph = (t / (fire ? 1.5 : 2.2)) % 1;
  const fade = ph < 0.08 ? ph / 0.08 : ph > 0.85 ? (1 - ph) / 0.15 : 1;
  let ang = Math.atan2(dir.y, dir.x);
  let r;
  if (fire) r = R * 0.9 * (ph < 0.3 ? ease(ph / 0.3) : 1);
  else {
    r = R * Math.max(S.fireThreshold - 0.1, 0.2) * (ph < 0.25 ? ease(ph / 0.25) : 1);
    if (ph > 0.25) ang += Math.sin((ph - 0.25) * TAU * 1.2) * 0.35;
  }
  const past = fire && r > R * S.fireThreshold;
  ring(ctx, g.x, g.y, R, alpha * fade, true, past, S);
  thumb(ctx, g.x + Math.cos(ang) * r, g.y + Math.sin(ang) * r, 1, alpha * fade, 1);
  label(ctx, text, g.x, g.y + R + 22, alpha, past ? ORANGE : '255,255,255');
}

function coach(ctx, game, input, view, L, touch) {
  const T = game.tutorial;
  const S = game.settings;
  const R = S.stickRadius;
  const tp = input.touch;
  const t = game.time;
  const kind = view.coach;
  // The buttons pulse for everybody (they can be clicked too); the thumbs are for touch.
  if (kind === 'reload' || (kind === 'tap' && S.shoveButton && touch)) {
    const b = L.byId[kind === 'tap' ? 'shove' : 'reload'];
    if (b && !b.hidden) {
      const k = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.strokeStyle = `rgba(${AMBER},${0.45 + 0.45 * k})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      circle(ctx, b.x, b.y, b.r + 5 + 4 * k);
      ctx.stroke();
      if (touch && kind === 'reload') {
        const ph = (t * 1.1) % 1;
        const down = ph > 0.3 && ph < 0.55 ? 1 : 0;
        thumb(ctx, b.x + 4, b.y + 6 + (1 - down) * 8, 1, 0.9, down);
        label(ctx, 'TAP', b.x, b.y + b.r + 22, 0.9, AMBER);
      }
    }
  }
  if (!touch) return;
  if (kind === 'hold') {
    // The picture, and on the real screen where each thumb goes (green once it's there).
    holdPicture(ctx, holdRect(L, cardRect(L, R, 2)), t);
    for (const [g, side, on] of [[L.fixedMove, -1, tp.move.active], [L.fixedAim, 1, tp.aim.active]]) {
      if (on) {
        ctx.strokeStyle = `rgba(${GREEN},0.9)`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        circle(ctx, g.x, g.y, R * 0.72);
        ctx.stroke();
        continue;
      }
      const k = 0.5 + 0.5 * Math.sin(t * 4 + side);
      ctx.strokeStyle = `rgba(255,255,255,${0.3 + 0.35 * k})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      circle(ctx, g.x, g.y, R * (0.68 + 0.08 * k));
      ctx.stroke();
      ctx.setLineDash([]);
      const ph = (t * 1.1 + (side > 0 ? 0.5 : 0)) % 1;
      thumb(ctx, g.x, g.y, side, 0.85, ph < 0.3 ? 1 : 0);
    }
    return;
  }
  // Each ghost fades while your own thumb is on that stick.
  const moveA = tp.move.active ? 0.15 : 1;
  const aimA = tp.aim.active ? 0.15 : 1;

  if (kind === 'move') {
    moveGhost(ctx, L.fixedMove, screenDir(game, T.arrow(), { x: 1, y: 0 }), R, moveA, 'SLIDE', t, S);
    return;
  }
  if (kind === 'aim' || kind === 'fire') {
    const z = T.step.id === 'aim' || T.step.id === 'fire' ? T.pen.find((q) => q.alive) : nearestOn(game, T.group);
    const fire = kind === 'fire';
    aimGhost(ctx, L.fixedAim, screenDir(game, z, { x: 0.6, y: -0.8 }), R, aimA, fire, fire ? 'FIRE' : 'AIM', t, S);
    return;
  }
  if (kind === 'kite') {
    // Both thumbs at once: the left one walks you away from them while the right one shoots at them.
    const toward = screenDir(game, nearestOn(game, T.group) || T.L.packSpawns[0][0], { x: -1, y: 0 });
    moveGhost(ctx, L.fixedMove, { x: -toward.x, y: -toward.y }, R, moveA, 'BACK OFF', t, S);
    aimGhost(ctx, L.fixedAim, toward, R, aimA, true, 'FIRE', t, S);
    return;
  }
  if (kind === 'tap') {
    const g = L.fixedAim;
    const a = tp.aim.active && tp.aim.crossedFire ? 0.25 : 1;
    const ph = (t / 0.9) % 1;
    const down = ph < 0.16;
    if (!down) {
      const k = (ph - 0.16) / 0.84;
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * a * (1 - k)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      circle(ctx, g.x, g.y, 14 + k * 40);
      ctx.stroke();
    }
    thumb(ctx, g.x, g.y + (down ? 0 : 7), 1, a, down ? 1 : 0);
    label(ctx, 'TAP', g.x, g.y + R + 22, a);
  }
}

function nearestOn(game, list) {
  const p = game.player;
  let best = null;
  let bd = Infinity;
  for (const z of list) {
    if (!z.alive) continue;
    const d = Math.hypot(z.x - p.x, z.y - p.y);
    if (d < bd) {
      bd = d;
      best = z;
    }
  }
  return best;
}

/** The stick under the ghost: its rim, and on the aim stick the dashed fire ring (lit orange once the thumb is past it). */
function ring(ctx, x, y, R, alpha, aim, hot, S) {
  ctx.strokeStyle = `rgba(255,255,255,${0.35 * alpha})`;
  ctx.fillStyle = `rgba(255,255,255,${0.05 * alpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  circle(ctx, x, y, R);
  ctx.fill();
  ctx.stroke();
  if (aim && S.fireThreshold > S.aimDeadzone) {
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = hot ? `rgba(${ORANGE},${0.95 * alpha})` : `rgba(${ORANGE},${0.4 * alpha})`;
    ctx.lineWidth = hot ? 3 : 2;
    ctx.beginPath();
    circle(ctx, x, y, R * clamp(S.fireThreshold, 0.1, 0.95));
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
