// What a tutorial lesson draws (game/tutorial.js runs it):
//
//   - the coach: a panel at the top, between your health and your gun, with
//     the step's name, a counter, the progress dots and what to do;
//   - the gesture: a ghost thumb acting out what to do with your thumbs,
//     right where your thumbs rest (slide to walk, slide a little to aim,
//     past the dashed ring to fire, a quick tap to shove, a tap on a button).
//     It fades while you're doing it and comes back when you stop;
//   - on the ground, the ring to walk to (and the next ones, faintly);
//   - over the world, short labels on what the step is about (the zombie to
//     aim at, the alarm car, the Witch) and a ring round the green arrow.
//
// Touch is the first-class citizen here: keys and pads get the coach's words
// (written for them) but no ghost thumbs.

import { FONT, rrect, circle } from './draw-utils.js';
import { clamp, TAU } from '../util.js';
import { LESSONS } from '../game/tutorial.js';

const ACCENT = '#ffcf5a';
const GOOD = '#7dffa1';
const tmp = { x: 0, y: 0 };

// Fades kept from frame to frame (the HUD is drawn from scratch every frame).
const fade = { move: 0, aim: 0, kind: null, t0: 0 };

/** Where the coach panel goes: in the gap between the health and gun panels, or under them if that's too narrow. */
export function coachRect(L) {
  const gapL = L.hp.x + L.hp.w + 10;
  const gapR = L.byId.swap.x - 10;
  if (gapR - gapL >= 260) {
    const w = Math.min(gapR - gapL, 440);
    return { x: Math.round((gapL + gapR) / 2 - w / 2), y: L.safe.t + 8, w, top: true };
  }
  const w = Math.min(460, L.w - L.safe.l - L.safe.r - 20);
  return { x: Math.round(L.w / 2 - w / 2), y: L.hp.y + L.hp.h + 8, w, top: false };
}

/** Break text into lines that fit maxW (current ctx font). */
function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

/** The whole tutorial overlay (screen space, CSS px). Returns the coach panel's bottom edge. */
export function drawTutorialHud(ctx, game, input, ui, L) {
  const T = game.tutorial;
  if (!T || ui.title) return 0;
  if (game.won || game.lost) return 0;
  // Slow motion: the edges of the screen go cold while time drags.
  if (T.timeScale < 0.95) drawSlowMo(ctx, L, 1 - T.timeScale);
  drawLabels(ctx, game, L, T, ui);
  const touch = input.source === 'touch' || ui.forceSticks;
  if (touch) drawGesture(ctx, game, input, L, T);
  coachBottom = drawCoach(ctx, game, L, T);
  return coachBottom;
}

let slowGrad = null;
let slowKey = '';
function drawSlowMo(ctx, L, k) {
  const key = `${L.w}x${L.h}`;
  if (key !== slowKey) {
    slowGrad = ctx.createRadialGradient(L.w / 2, L.h / 2, Math.min(L.w, L.h) * 0.32, L.w / 2, L.h / 2, Math.max(L.w, L.h) * 0.7);
    slowGrad.addColorStop(0, 'rgba(90,150,255,0)');
    slowGrad.addColorStop(1, 'rgba(90,150,255,1)');
    slowKey = key;
  }
  ctx.globalAlpha = clamp(k * 0.42, 0, 0.36);
  ctx.fillStyle = slowGrad;
  ctx.fillRect(0, 0, L.w, L.h);
  ctx.globalAlpha = 1;
}

// --- The coach panel ----------------------------------------------------------------------

function drawCoach(ctx, game, L, T) {
  const s = T.step;
  if (!s) return 0;
  const box = coachRect(L);
  const pad = 10;
  const inner = box.w - pad * 2 - 4;
  ctx.font = `600 13px ${FONT}`;
  const lines = wrap(ctx, T.text(), inner);
  const h = 8 + 19 + 5 + lines.length * 17 + 8;
  // Slides in when the step (or its words) change.
  const k = clamp(T.textT / 0.28, 0, 1);
  const e = 1 - (1 - k) * (1 - k);
  const y = box.y - (1 - e) * 10;
  ctx.globalAlpha = e;
  ctx.fillStyle = 'rgba(8,10,14,0.8)';
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  rrect(ctx, box.x, y, box.w, h, 10);
  ctx.fill();
  ctx.stroke();
  const safe = s.id === 'saferoom';
  const col = safe ? GOOD : ACCENT;
  // Accent strip on the left; it flashes white as a new step arrives.
  ctx.fillStyle = k < 1 ? `rgba(255,255,255,${0.9 - 0.6 * k})` : col;
  ctx.beginPath();
  rrect(ctx, box.x + 3, y + 7, 3, h - 14, 1.5);
  ctx.fill();

  // Title + counter on the left, the progress dots on the right.
  const x0 = box.x + pad + 4;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `900 16px ${FONT}`;
  ctx.fillStyle = col;
  const ty = y + 8 + 10;
  ctx.fillText(s.title, x0, ty);
  let cx = x0 + ctx.measureText(s.title).width + 10;
  const count = T.count();
  if (count) {
    ctx.font = `800 14px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(count, cx, ty + 0.5);
    cx += ctx.measureText(count).width + 10;
  }
  const { i, n } = T.progress;
  const dotsW = n * 10;
  const dx0 = box.x + box.w - pad - dotsW + 5;
  if (dx0 > cx + 4) {
    for (let d = 0; d < n; d++) {
      ctx.fillStyle = d < i ? GOOD : d === i ? col : 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      circle(ctx, dx0 + d * 10, ty, d === i ? 3.6 : 3);
      ctx.fill();
    }
    // The lesson's number, small, before the dots.
    ctx.font = `800 9px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    const tag = `LESSON ${T.lesson}`;
    if (dx0 - 10 - ctx.measureText(tag).width > cx) ctx.fillText(tag, dx0 - 10, ty + 0.5);
  }
  ctx.textAlign = 'left';
  ctx.font = `600 13px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  lines.forEach((l, j) => ctx.fillText(l, x0, y + 8 + 19 + 5 + 8 + j * 17));
  ctx.globalAlpha = 1;
  return box.y + h;
}

// --- Labels over the world ----------------------------------------------------------------------

function pill(ctx, x, y, text, color, alpha = 1) {
  ctx.font = `900 10px ${FONT}`;
  const w = ctx.measureText(text).width + 14;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(8,10,14,0.78)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  rrect(ctx, x - w / 2, y - 9, w, 18, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
  // A little pointer down to what it's about.
  ctx.beginPath();
  ctx.moveTo(x - 5, y + 9);
  ctx.lineTo(x + 5, y + 9);
  ctx.lineTo(x, y + 15);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

const onScreen = (L, p, m = 10) => p.x > m && p.x < L.w - m && p.y > m && p.y < L.h - m;
let coachBottom = 0;
/** Under the top bar or the coach's panel: a label there would be hidden (or hide the HUD). */
function underHud(L, p) {
  if (p.y < L.hp.y + L.hp.h + 14) return true;
  const c = coachRect(L);
  return p.y < coachBottom + 12 && p.x > c.x - 50 && p.x < c.x + c.w + 50;
}

function drawLabels(ctx, game, L, T, ui) {
  const s = T.step;
  if (!s) return;
  const v = game.view;
  const bob = Math.sin(game.time * 4) * 2;
  // The ring's label, over the ring.
  const r = T.ring();
  if (r && s.label && !s.ringGoal) {
    const p = v.project(r.x, r.y, 46, tmp);
    if (onScreen(L, p, 20) && !underHud(L, p)) pill(ctx, p.x, p.y - 8 + bob, s.label, ACCENT);
  }
  // The zombie the step is about.
  const tagLabel = T.tagLabel();
  if (tagLabel) {
    const z = T.nearest(s.tag);
    if (z) {
      const p = v.project(z.x, z.y, 58, tmp);
      if (onScreen(L, p, 20) && !underHud(L, p)) pill(ctx, p.x, p.y - 10 + bob, tagLabel, '#ff8a6a');
    }
  }
  if (s.point === 'alarm' && !T.alarmed) {
    const c = T.spots.alarm;
    const p = v.project(c.x + c.w / 2, c.y + c.h / 2, 44, tmp);
    if (onScreen(L, p, 20) && !underHud(L, p)) pill(ctx, p.x, p.y - 8 + bob, "ALARM CAR · DON'T HIT IT", '#ffb347');
  }
  if (s.point === 'witch' && T.witch && T.witch.alive) {
    const w = T.witch;
    const p = v.project(w.x, w.y, 44, tmp);
    const sitting = w.mode === 'sit';
    if (onScreen(L, p, 20) && !underHud(L, p)) pill(ctx, p.x, p.y - 8 + bob, sitting ? 'WITCH · LEAVE HER BE' : 'SHOOT HER!', sitting ? '#d9c9ff' : '#ff5a4a');
  }
  if (s.point === 'arrow') drawArrowHalo(ctx, game, L, ui.objectiveAt);
}

/** A pulsing ring round the green safe-room arrow at the screen edge (e: where the HUD drew it). */
function drawArrowHalo(ctx, game, L, e) {
  if (!e) return;
  const k = (game.time * 1.4) % 1;
  ctx.strokeStyle = `rgba(125,255,161,${0.9 * (1 - k)})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  circle(ctx, e.x, e.y, 16 + k * 22);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(125,255,161,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  circle(ctx, e.x, e.y, 18);
  ctx.stroke();
  // "this one" toward the middle of the screen
  const dx = L.w / 2 - e.x;
  const dy = L.h / 2 - e.y;
  const d = Math.hypot(dx, dy) || 1;
  pill(ctx, e.x + (dx / d) * 62, e.y + (dy / d) * 40 - 6, 'FOLLOW THE ARROW', GOOD);
}

// --- The ghost thumb ----------------------------------------------------------------------------

/** A thumb pressing at (x, y): a fingertip with the rest of the thumb trailing off toward its corner. */
function thumb(ctx, x, y, side, press, alpha) {
  if (alpha <= 0.01) return;
  const ca = side < 0 ? -0.5 : 0.5; // the thumb lies down-left (left hand) or down-right
  const dx = ca;
  const dy = 0.86;
  const len = 62;
  const wid = 30 - press * 3;
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = wid + 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx * len, y + dy * len);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(235,240,245,0.38)';
  ctx.lineWidth = wid;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx * len, y + dy * len);
  ctx.stroke();
  // The nail.
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(x + dx * 6, y + dy * 6 - 2, 8, 6, Math.atan2(dy, dx), 0, TAU);
  ctx.fill();
  // The touch itself: a ring that tightens as the thumb presses.
  ctx.strokeStyle = `rgba(255,220,120,${0.55 + 0.4 * press})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  circle(ctx, x, y, 22 - press * 6);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
}

/** A stick base as the game draws it, for the ghost (with the dashed fire ring on the aim side). */
function ghostStick(ctx, b, k, R, ringK, firing, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  circle(ctx, b.x, b.y, R);
  ctx.fill();
  ctx.stroke();
  if (ringK) {
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = firing ? 'rgba(255,140,80,0.95)' : 'rgba(255,140,80,0.55)';
    ctx.lineWidth = firing ? 2.6 : 2;
    ctx.beginPath();
    circle(ctx, b.x, b.y, R * ringK);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = firing ? 'rgba(255,110,60,0.55)' : 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  circle(ctx, k.x, k.y, R * 0.42);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function caption(ctx, x, y, text, alpha, color = 'rgba(255,255,255,0.92)', align = 'center') {
  ctx.globalAlpha = alpha;
  ctx.font = `900 12px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2);

/**
 * A drag gesture, one loop: press at the base, slide out to `reach` (a share of the
 * radius) along dir, hold, lift. Returns where the thumb is and how hard it presses.
 */
function dragLoop(t, base, dir, R, reach) {
  const P = 2.3;
  const u = (t % P) / P;
  let a = 1;
  let out = 0;
  let press = 1;
  if (u < 0.1) {
    a = u / 0.1;
    press = u / 0.1;
  } else if (u < 0.42) out = ease((u - 0.1) / 0.32);
  else if (u < 0.82) out = 1;
  else {
    out = 1;
    a = 1 - (u - 0.82) / 0.18;
    press = a;
  }
  const d = out * R * reach;
  return { x: base.x + dir.x * d, y: base.y + dir.y * d, a, press, out };
}

/** Screen direction from the survivor to a world point (unit), or the fallback. */
function dirTo(game, x, y, fx = 0.7, fy = -0.7) {
  const v = game.view;
  const p = game.player;
  const a = v.project(p.x, p.y, 0, { x: 0, y: 0 });
  const b = v.project(x, y, 0, { x: 0, y: 0 });
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) {
    const f = Math.hypot(fx, fy);
    return { x: fx / f, y: fy / f };
  }
  return { x: dx / d, y: dy / d };
}

function drawGesture(ctx, game, input, L, T) {
  const kind = T.hint();
  const S = game.settings;
  const R = S.stickRadius;
  const touch = input.touch;
  const dt = 1 / 60;
  // Fade each thumb out while you're doing it yourself, back in when you stop.
  const moveWant = !!kind && (kind === 'move' || kind === 'both') && !touch.move.active;
  const aimWant = !!kind && (kind === 'aim' || kind === 'fire' || kind === 'both') && !(touch.aim.active && (kind === 'aim' || touch.aim.firing));
  fade.move += ((moveWant ? 1 : 0) - fade.move) * clamp(dt * (moveWant ? 4 : 10), 0, 1);
  fade.aim += ((aimWant ? 1 : 0) - fade.aim) * clamp(dt * (aimWant ? 4 : 10), 0, 1);
  if (kind !== fade.kind) {
    fade.kind = kind;
    fade.t0 = game.time;
  }
  // Real time, so the thumbs keep their pace in slow motion.
  const t = performance.now() / 1000;

  // Which way: toward the ring (walking), toward the zombie (aiming).
  const step = T.step;
  const ring = T.ring();
  const z = step && step.tag ? T.nearest(step.tag) : null;
  const toRing = ring ? dirTo(game, ring.x, ring.y) : { x: 0.71, y: -0.71 };
  const toZ = z ? dirTo(game, z.x, z.y) : { x: 0.71, y: -0.71 };

  if (fade.move > 0.01) {
    const base = L.fixedMove;
    const dir = kind === 'both' ? { x: -toZ.x, y: -toZ.y } : toRing;
    const g = dragLoop(t, base, dir, R, 0.9);
    ghostStick(ctx, base, g, R, 0, false, fade.move * g.a * 0.9);
    thumb(ctx, g.x, g.y, -1, g.press, fade.move * g.a);
    // Beside the stick, toward the middle of the screen (above it is where the action is).
    caption(ctx, base.x + R + 12, base.y, kind === 'both' ? 'WALK AWAY' : 'SLIDE TO WALK', fade.move, undefined, 'left');
  }
  if (fade.aim > 0.01) {
    const base = L.fixedAim;
    const ringK = Math.max(S.fireThreshold, S.aimDeadzone);
    const reach = kind === 'aim' ? Math.max(0.2, ringK * 0.62) : 0.95;
    const g = dragLoop(t + 0.35, base, toZ, R, reach);
    const firing = kind !== 'aim' && g.out * reach > ringK + 0.03;
    ghostStick(ctx, base, g, R, ringK, firing, fade.aim * g.a * 0.9);
    thumb(ctx, g.x, g.y, 1, g.press, fade.aim * g.a);
    const cap = kind === 'aim' ? 'SLIDE A LITTLE: AIM' : firing ? 'PAST THE RING: FIRE!' : 'PUSH PAST THE RING';
    caption(ctx, base.x - R - 12, base.y, cap, fade.aim, firing ? '#ffb38a' : 'rgba(255,255,255,0.92)', 'right');
  }
  if (kind === 'tap') {
    const b = { x: L.fixedAim.x - 10, y: L.fixedAim.y - 6 };
    tapLoop(ctx, t, b, 'TAP!', 1);
  }
  if (kind === 'reload' || kind === 'swap') {
    const b = L.byId[kind];
    const c = b.shape === 'circle' ? { x: b.x, y: b.y } : { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    // A pulsing outline round the button itself.
    const k = (t * 1.3) % 1;
    ctx.strokeStyle = `rgba(255,207,90,${0.95 - 0.8 * k})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (b.shape === 'circle') circle(ctx, b.x, b.y, b.r + 4 + k * 10);
    else rrect(ctx, b.x - 4 - k * 8, b.y - 4 - k * 8, b.w + 8 + k * 16, b.h + 8 + k * 16, 10 + k * 6);
    ctx.stroke();
    tapLoop(ctx, t, c, null, 1);
    const below = b.shape === 'circle' ? b.y + b.r + 20 : b.y + b.h + 18;
    // Under the button, kept on the screen (these buttons sit at its right edge).
    const text = kind === 'reload' ? 'TAP ⟳ TO RELOAD' : 'TAP TO SWAP';
    ctx.font = `900 12px ${FONT}`;
    const half = ctx.measureText(text).width / 2;
    caption(ctx, Math.min(c.x, L.w - L.safe.r - 8 - half), below, text, 1, '#ffe29a');
  }
}

/** A quick tap, over and over: press, lift, a ripple. */
function tapLoop(ctx, t, c, label, alpha) {
  const P = 1.1;
  const u = (t % P) / P;
  const press = u < 0.14 ? u / 0.14 : u < 0.24 ? 1 - (u - 0.14) / 0.1 : 0;
  const up = u < 0.24 ? 0 : clamp((u - 0.24) / 0.1, 0, 1);
  thumb(ctx, c.x + 4, c.y + 4 - up * 10, 1, press, alpha * (u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3));
  if (u > 0.14 && u < 0.7) {
    const k = (u - 0.14) / 0.56;
    ctx.strokeStyle = `rgba(255,220,120,${0.85 * (1 - k)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    circle(ctx, c.x, c.y, 18 + k * 36);
    ctx.stroke();
  }
  if (label) caption(ctx, c.x, c.y - 52, label, alpha, '#ffe29a');
}

// --- On the ground ------------------------------------------------------------------------------

/** The ring to walk to (and the ones after it, faint), drawn with the ground transform, after the night. */
export function drawTutorialWorld(ctx, game) {
  const T = game.tutorial;
  if (!T || game.won || game.lost) return;
  const s = T.step;
  if (!s) return;
  const t = game.time;
  const ring = T.ring();
  if (s.seq) {
    for (let k = T.seqI + 1; k < s.seq.length; k++) groundRing(ctx, s.seq[k], t, [255, 207, 90], 0.3);
  }
  if (ring) groundRing(ctx, ring, t, s.ringGoal ? [125, 255, 161] : [255, 207, 90], 1);
}

function groundRing(ctx, r, t, c, a) {
  const [R, G, B] = c;
  const pulse = 0.5 + 0.5 * Math.sin(t * 5);
  ctx.fillStyle = `rgba(${R},${G},${B},${(0.1 + 0.07 * pulse) * a})`;
  ctx.beginPath();
  circle(ctx, r.x, r.y, r.r);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(${R},${G},${B},${0.85 * a})`;
  ctx.beginPath();
  circle(ctx, r.x, r.y, r.r);
  ctx.stroke();
  if (a < 0.5) return;
  // A ripple going out, and a dashed inner ring turning.
  const k = (t * 0.9) % 1;
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(${R},${G},${B},${0.55 * (1 - k)})`;
  ctx.beginPath();
  circle(ctx, r.x, r.y, r.r * (1 + 0.6 * k));
  ctx.stroke();
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.rotate(t * 0.8);
  ctx.setLineDash([10, 9]);
  ctx.strokeStyle = `rgba(${R},${G},${B},0.6)`;
  ctx.beginPath();
  circle(ctx, 0, 0, r.r * 0.62);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** The end screen's lines for a finished lesson. */
export function lessonSummary(game) {
  const T = game.tutorial;
  const info = LESSONS[(T ? T.lesson : 1) - 1];
  return { title: T && T.lesson === LESSONS.length ? 'TUTORIAL COMPLETE' : `LESSON ${T ? T.lesson : 1} COMPLETE`, info };
}
