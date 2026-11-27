// The tutorial's coaching (src/game/tutorial.js runs the lessons):
//   - in the world (bright pass): the ring to walk to, beacons on the gates
//     (red shut, amber opening, green open), brackets on the targets in the
//     pen, a red pulse round the alarm car while its lesson is on;
//   - first of all (touch), a screen of its own: black, a big photo of how
//     to hold the phone (on its side, a thumb on each side of the screen) and
//     one line, until you tap (drawTutorialIntro, called by hud.js);
//   - on the HUD, as little writing as can be: at most one short line at the
//     top of the screen (nothing at the bottom, where the thumbs are). The
//     rest is shown: a big arrow bobbing over where to go, a ghost thumb doing
//     the gesture on the half of the screen it belongs to (move on the left;
//     aim and fire on the right; both at once to walk back while you shoot),
//     and, for a button you have to press, the screen gone dark but for that
//     button (and you), with a thumb tapping it.
// The ghost stands aside while your own thumb is on that stick.
//
// The hands and the thumb are photos (assets/tutorial, made with Scenario's
// GPT Image 2.5 model); until they have loaded, and wherever there are no
// images (the tests), simple drawings of them stand in.

import { FONT, rrect, circle } from './draw-utils.js';
import { ball } from './prims.js';
import { TAU, clamp } from '../util.js';
import { PROMPT_IN, PROMPT_OUT } from '../game/tutorial.js';

const GREEN = '125,255,161';
const AMBER = '255,190,90';
const RED = '255,80,64';
const ORANGE = '255,140,80';

// --- The pictures --------------------------------------------------------------------------

/**
 * The first screen's photo: two hands holding a phone on its side, the thumbs
 * on the glass, on black (its edges faded to black). Where things are in it,
 * in its own pixels: the phone, the tops of the fingers over it, and the two
 * thumbs' pads on the screen.
 */
export const HANDS = {
  src: 'assets/tutorial/hands.webp',
  w: 1536,
  h: 874,
  phone: { x0: 352, y0: 122, x1: 1190, y1: 510 },
  fingers: 75,
  thumbs: [
    { x: 512, y: 345 },
    { x: 1030, y: 350 },
  ],
};

/**
 * The ghost thumb: a right thumb seen from above, nail up, reaching up and to
 * the left, its base faded out (mirrored, it's the left one). In its own
 * pixels: the middle of the nail (where it touches) and the thumb's width there.
 */
export const THUMB = { src: 'assets/tutorial/thumb.webp', w: 255, h: 313, nail: { x: 63, y: 58.4 }, width: 140.7 };

const pictures = {};
if (typeof Image !== 'undefined') {
  for (const [k, P] of Object.entries({ hands: HANDS, thumb: THUMB })) {
    const im = new Image();
    im.decoding = 'async';
    im.src = P.src;
    pictures[k] = im;
  }
}

/** A picture once it has loaded (null before then, or if it never does: the drawing stands in). */
function picture(k) {
  const im = pictures[k];
  return im && im.complete && im.naturalWidth > 0 ? im : null;
}

/** For tests: stand-ins for the pictures ({ hands, thumb }; null takes one away again). */
export function setTutorialPictures(p) {
  Object.assign(pictures, p);
}

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
  // Where to walk: a ring on the ground (the arrow over it is on the HUD).
  if (a && a.ring) {
    const k = 0.5 + 0.5 * Math.sin(t * 4);
    const r = a.r || 40;
    R.ground(0);
    ctx.fillStyle = `rgba(${GREEN},${0.12 + 0.08 * k})`;
    ctx.beginPath();
    circle(ctx, a.x, a.y, r);
    ctx.fill();
    ctx.strokeStyle = `rgba(${GREEN},${0.6 + 0.35 * k})`;
    ctx.lineWidth = 4.5;
    ctx.setLineDash([10, 7]);
    ctx.beginPath();
    circle(ctx, a.x, a.y, r);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(${GREEN},${0.1 + 0.08 * k})`;
    ctx.beginPath();
    circle(ctx, a.x, a.y, r * (0.45 + 0.55 * ((t * 0.8) % 1)));
    ctx.fill();
    R.reset();
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

/**
 * Over the game: the arrow over where to go, the ghost thumbs (touch), a
 * prompt's dark with its button lit, and the one line at the top.
 */
export function drawTutorialHud(ctx, game, input, ui, L) {
  const T = game.tutorial;
  if (!T || ui.title || game.lost || game.won) return;
  if (T.intro() > 0) return; // the first screen (how to hold the phone) has the screen to itself
  const touch = input.source === 'touch' || ui.forceSticks;
  const view = T.view(input.source === 'touch' ? 'touch' : input.source);
  goHere(ctx, game, L);
  if (view.coach && touch) coach(ctx, game, input, view, L);
  if (T.prompt) drawPrompt(ctx, game, L, touch);
  drawLine(ctx, game, view, L);
}

// --- The line at the top ------------------------------------------------------------------------

const LINE_MAX = 19; // px: the line's size, at most...
const LINE_MIN = 13; // ...and at least

/**
 * Where the line goes and how big: top centre, level with the health and gun
 * panels (between them, once they're on screen: panels), as big as fits
 * from 19 px down to 13; if it can't fit between them, under them, across the
 * screen. Returns { x (the centre), y (the middle), w, h, size }.
 */
export function lineLayout(ctx, L, text, panels) {
  const y = L.safe.t + L.pad + 23; // level with the panels' middle
  const fit = (room) => {
    for (let size = LINE_MAX; size >= LINE_MIN; size--) {
      ctx.font = `800 ${size}px ${FONT}`;
      const w = ctx.measureText(text).width + size * 2.6;
      if (w <= room) return { size, w };
    }
    return null;
  };
  const x0 = panels ? L.hp.x + L.hp.w + 10 : L.safe.l + 16;
  const x1 = panels ? L.byId.swap.x - 10 : L.w - L.safe.r - 16;
  const mid = L.w / 2;
  // Centred on the screen if it fits so; else centred in the room it has.
  let f = fit(2 * Math.min(mid - x0, x1 - mid));
  if (f) return { x: mid, y, w: f.w, h: f.size + 14, size: f.size };
  f = fit(x1 - x0);
  if (f) return { x: (x0 + x1) / 2, y, w: f.w, h: f.size + 14, size: f.size };
  const room = L.w - L.safe.l - L.safe.r - 32;
  f = fit(room) || { size: LINE_MIN, w: room };
  const h = f.size + 14;
  return { x: mid, y: L.hp.y + L.hp.h + 10 + h / 2, w: Math.min(f.w, room), h, size: f.size };
}

/** The line: what to do (white), a nudge (amber), the count (amber), or a ✓ (green) when a lesson's done. */
function drawLine(ctx, game, view, L) {
  const T = game.tutorial;
  if (!view.text && !view.done) return;
  const main = view.done ? '✓' : view.text;
  const count = view.done ? '' : view.count || '';
  const full = count ? `${main}   ${count}` : main;
  const B = lineLayout(ctx, L, full, T.hud().all > 0);
  const k = 0.5 + 0.5 * Math.sin(T.clock * 4);
  ctx.fillStyle = view.done ? 'rgba(10,30,16,0.8)' : 'rgba(8,10,14,0.7)';
  ctx.strokeStyle = view.done ? `rgba(${GREEN},0.85)` : view.nudge ? `rgba(${AMBER},${0.55 + 0.4 * k})` : 'rgba(255,255,255,0.16)';
  ctx.lineWidth = view.done || view.nudge ? 2 : 1;
  ctx.beginPath();
  rrect(ctx, B.x - B.w / 2, B.y - B.h / 2, B.w, B.h, B.h / 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = `800 ${B.size}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  let x = B.x - ctx.measureText(full).width / 2;
  ctx.fillStyle = view.done ? `rgb(${GREEN})` : view.nudge ? `rgb(${AMBER})` : '#fff';
  ctx.fillText(main, x, B.y + 1);
  if (count) {
    x += ctx.measureText(`${main}   `).width;
    ctx.fillStyle = `rgb(${AMBER})`;
    ctx.fillText(count, x, B.y + 1);
  }
}

// --- Where to go ------------------------------------------------------------------------------

/** A fat arrow pointing down, its tip at (x, y). */
function arrowDown(ctx, x, y, size, alpha = 1) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size, y - size);
  ctx.lineTo(x - size * 0.42, y - size);
  ctx.lineTo(x - size * 0.42, y - size * 1.9);
  ctx.lineTo(x + size * 0.42, y - size * 1.9);
  ctx.lineTo(x + size * 0.42, y - size);
  ctx.lineTo(x + size, y - size);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = `rgba(0,0,0,${0.55 * alpha})`;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = `rgba(${GREEN},${alpha})`;
  ctx.fill();
  ctx.lineJoin = 'miter';
}

/** A big arrow bobbing over where the lesson wants you, while that's on screen (off it, hud.js points the way from the edge). */
function goHere(ctx, game, L) {
  const T = game.tutorial;
  if (T.prompt || T.pause > 0 || T.over) return;
  const a = T.arrow();
  if (!a || a.marker === false) return;
  const s = game.worldToScreen(a.x, a.y, 0);
  if (s.x < 24 || s.x > L.w - 24 || s.y < 60 || s.y > L.h - 8) return;
  const v = game.view;
  const lift = (a.ring ? (a.r || 40) * v.scale * v.sp : 0) + 14;
  const bob = Math.abs(Math.sin(T.clock * 3.4)) * 12;
  arrowDown(ctx, s.x, s.y - lift - bob, 17);
}

// --- A button to press ------------------------------------------------------------------------

/** Where a prompt's button is: ⟳, or SHOVE (with the SHOVE button turned off, the right side, where a tap shoves). */
export function promptSpot(L, kind, S) {
  if (kind === 'reload') return { x: L.byId.reload.x, y: L.byId.reload.y, r: L.byId.reload.r };
  if (S.shoveButton) return { x: L.byId.shove.x, y: L.byId.shove.y, r: L.byId.shove.r };
  return { x: L.fixedAim.x, y: L.fixedAim.y, r: 36 };
}

/**
 * A prompt: the screen dark but for its button and you (and the one on you),
 * a ring beating round the button and another going out from it, and (touch)
 * a thumb tapping it. Fades in as the world stops, out as it starts again.
 */
function drawPrompt(ctx, game, L, touch) {
  const T = game.tutorial;
  const P = T.prompt;
  const a = P.answered ? 1 - clamp(P.out / PROMPT_OUT, 0, 1) : clamp(P.t / PROMPT_IN, 0, 1);
  if (a <= 0) return;
  const b = promptSpot(L, P.kind, game.settings);
  const p = game.player;
  const ps = game.worldToScreen(p.x, p.y, 14);
  let you = { x: ps.x, y: ps.y, r: 58 };
  if (P.threat && P.threat.alive) {
    const zs = game.worldToScreen(P.threat.x, P.threat.y, 14);
    const d = Math.hypot(zs.x - ps.x, zs.y - ps.y);
    you = { x: (ps.x + zs.x) / 2, y: (ps.y + zs.y) / 2, r: Math.max(58, d / 2 + 42) };
  }
  const holes = [{ x: b.x, y: b.y, r: b.r + 16 }];
  if (Math.hypot(you.x - b.x, you.y - b.y) > you.r + b.r + 16) holes.push(you);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.beginPath();
  ctx.rect(0, 0, L.w, L.h);
  for (const h of holes) {
    ctx.moveTo(h.x + h.r, h.y);
    ctx.arc(h.x, h.y, h.r, 0, TAU);
  }
  ctx.fill('evenodd');
  const c = T.clock;
  const k = 0.5 + 0.5 * Math.sin(c * 8);
  ctx.strokeStyle = `rgba(${AMBER},${0.65 + 0.35 * k})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  circle(ctx, b.x, b.y, b.r + 6 + 4 * k);
  ctx.stroke();
  const ph = (c * 1.3) % 1;
  ctx.strokeStyle = `rgba(${AMBER},${0.7 * (1 - ph)})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  circle(ctx, b.x, b.y, b.r + 8 + 34 * ph);
  ctx.stroke();
  if (P.pin) {
    // Pinned: the break-free dots over the button (clear of the thumb tapping it), filling as you tap
    // (and draining if you stop).
    const n = game.settings.hunterBreakTaps;
    const k = game.player.struggle || 0;
    const gap = 16;
    const y = b.y - b.r - 18;
    for (let i = 0; i < n; i++) {
      const x = b.x - ((n - 1) * gap) / 2 + i * gap;
      const f = clamp(k - i, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      circle(ctx, x, y, 6);
      ctx.fill();
      if (f > 0) {
        ctx.fillStyle = `rgba(${AMBER},${0.4 + 0.6 * f})`;
        ctx.beginPath();
        circle(ctx, x, y, 6 * f);
        ctx.fill();
      }
    }
  }
  if (touch) {
    // Resting off to the side (the button's label in plain view), then down on it: quick taps while pinned.
    const tp = (c * (P.pin ? 3.2 : 1.2)) % 1;
    const down = tp > 0.3 && tp < 0.55;
    thumb(ctx, b.x + (down ? 3 : 16), b.y + (down ? 8 : b.r + 12), 1, 1, down ? 1 : 0, 1.15);
  }
  ctx.restore();
}

// --- How to hold the phone (Tutorial 1's first screen) -------------------------------------

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

/**
 * Where the first screen puts things on a w x h screen. The photo (HANDS) is
 * scaled so the phone in it is as wide as 0.56 of the screen (at most 1.08 h
 * and 576 px), its top a quarter of the way down; and more, if that's what it
 * takes for the photo to reach the bottom of the screen (the forearms come up
 * from below it), but never so the phone is wider than 0.9 of the screen.
 * Returns the photo's place and scale (x, y, s, W, H), the phone's middle and
 * size (cx, cy, PW, PH), the thumbs' pads and the tops of the fingers on
 * screen, and the one line above it all (titleY, size).
 */
export function introLayout(w, h) {
  const P = HANDS.phone;
  const pw = P.x1 - P.x0;
  const top = h * 0.24;
  let s = Math.min(w * 0.56, h * 1.08, 576) / pw;
  s = Math.min(Math.max(s, (h - top) / (HANDS.h - P.y0)), (w * 0.9) / pw);
  const x = w / 2 - ((P.x0 + P.x1) / 2) * s;
  const y = top - P.y0 * s;
  let size = Math.round(clamp(h * 0.065, 18, 34));
  // The line fits across the screen (a size smaller where it has to).
  while (size > 14 && size * 0.62 * 26 > w * 0.9) size -= 1;
  const PH = (P.y1 - P.y0) * s;
  const fingers = y + HANDS.fingers * s;
  return {
    x,
    y,
    s,
    W: HANDS.w * s,
    H: HANDS.h * s,
    PW: pw * s,
    PH,
    cx: w / 2,
    cy: top + PH / 2,
    thumbs: HANDS.thumbs.map((q) => ({ x: x + q.x * s, y: y + q.y * s })),
    fingers,
    titleY: Math.min(h * 0.12, top - size, fingers - size * 0.8),
    size,
  };
}

/** The photo's thumbs pressing in turn: a ripple out from each pad on the glass. */
function touches(ctx, I, t) {
  I.thumbs.forEach((q, i) => {
    const ph = (t * 0.8 + i * 0.5) % 1;
    if (ph >= 0.5) return;
    const k = ph / 0.5;
    ctx.strokeStyle = `rgba(${GREEN},${0.8 * (1 - k)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    circle(ctx, q.x, q.y, I.PW * (0.08 + 0.06 * k));
    ctx.stroke();
  });
}

/**
 * The drawing that stands in for the photo until it has loaded: a phone on
 * its side, held in both hands, the thumbs on the two sticks (pressing in
 * turn, a ripple under each), dark and outlined in white. W is the drawing's
 * width (the phone 0.8 of it); the forearms come up from below `floor`.
 */
function phoneInHands(ctx, cx, cy, W, t, floor) {
  const PW = 0.8 * W;
  const PH = 0.4 * W;
  const x0 = cx - PW / 2;
  const y0 = cy - PH / 2;
  // The hands round the ends (outlines first, then the dark: one silhouette each).
  const hands = [-1, 1].map((s) => {
    const ex = cx + (s * PW) / 2;
    const hx = ex + s * 0.005 * W;
    const hy = cy + PH / 2 + 0.03 * W;
    const fy = floor + 0.12 * W; // past the bottom of the screen
    return {
      arm: [hx + s * 0.35 * (fy - hy), fy, hx, hy, 0.17 * W],
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

  // The phone.
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
    return { base: [ex - s * 0.045 * W, cy + PH / 2 - 0.005 * W], tip: [stick[i].x, stick[i].y + press * 0.006 * W], ph };
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
}

/**
 * Tutorial 1's first screen, on a phone or tablet: black, a big picture of
 * how to hold it, and its one line ("HOLD YOUR PHONE LIKE THIS"). Nothing
 * else until you tap (hud.js draws nothing under it); then it fades into the
 * game. Returns how opaque it was (1: it covered everything; 0: not shown).
 */
export function drawTutorialIntro(ctx, game, w, h) {
  const T = game.tutorial;
  const a = T ? T.intro() : 0;
  if (a <= 0) return 0;
  const I = introLayout(w, h);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const im = picture('hands');
  if (im) {
    ctx.drawImage(im, I.x, I.y, I.W, I.H);
    touches(ctx, I, T.clock);
  } else phoneInHands(ctx, I.cx, I.cy, I.PW / 0.8, T.clock, h);
  ctx.font = `900 ${I.size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(T.step.title, I.cx, I.titleY);
  // Still there after a while, with nothing tapped: say how to go on (the step's nudge).
  if (T.nudge && T.nudge.key === 'hold.no-tap') {
    const k = Math.min(1, T.nudge.t / 0.4);
    ctx.globalAlpha = a * k;
    ctx.font = `700 ${Math.round(I.size * 0.62)}px ${FONT}`;
    ctx.fillStyle = `rgb(${AMBER})`;
    // Just under the phone, between the hands.
    ctx.fillText(T.nudge.n.text.touch, I.cx, Math.min(h - I.size, I.cy + I.PH / 2 + Math.max(I.size * 1.3, I.PW * 0.11)));
  }
  ctx.restore();
  return a;
}

// --- The ghost thumb ---------------------------------------------------------------------

/**
 * A thumb seen from above, its pad at (x, y), reaching down to the bottom
 * corner of its side (side -1 left, 1 right), s times its size (40 px wide at
 * the nail). press 0..1 squashes it a little and rings the pad. The photo
 * (THUMB, mirrored for the left), with a soft shadow under it, or until that
 * has loaded a drawing of one.
 */
function thumb(ctx, x, y, side, alpha, press = 0, s = 1) {
  if (alpha <= 0.01) return;
  const im = picture('thumb');
  if (im) {
    const k = ((40 * s) / THUMB.width) * (1 - 0.05 * press);
    ctx.save();
    ctx.globalAlpha *= Math.min(1, alpha);
    ctx.translate(x, y);
    if (side < 0) ctx.scale(-1, 1);
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10 * s;
    ctx.shadowOffsetY = 4 * s;
    ctx.drawImage(im, -THUMB.nail.x * k, -THUMB.nail.y * k, THUMB.w * k, THUMB.h * k);
    ctx.restore();
  } else {
    const bx = x + side * 30 * s;
    const by = y + 52 * s;
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(255,255,255,${0.8 * alpha})`;
    ctx.lineWidth = 37 * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.strokeStyle = `rgba(40,44,52,${0.8 * alpha})`;
    ctx.lineWidth = 33 * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(bx, by);
    ctx.stroke();
    // The nail.
    ctx.fillStyle = `rgba(255,255,255,${0.3 * alpha})`;
    ctx.beginPath();
    ctx.ellipse(x + side * 3 * s, y + 3 * s, 7 * s, 9 * s, side * 0.5, 0, TAU);
    ctx.fill();
    ctx.lineCap = 'butt';
  }
  if (press > 0.01) {
    // Round the fingertip (the photo's is wider than the drawing's), not on the nail.
    const r = im ? 27 + 8 * (1 - press) : 18 + 10 * (1 - press);
    ctx.strokeStyle = `rgba(255,255,255,${(im ? 0.6 : 0.8) * alpha * press})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    circle(ctx, x, y, r * s);
    ctx.stroke();
  }
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

const GHOST = 1.2; // the ghost thumbs, times life size

/** The left ghost: a thumb lands on the stick and slides toward `dir` (a unit vector on screen). */
function moveGhost(ctx, g, dir, R, alpha, t, S) {
  const ph = (t / 1.7) % 1;
  const reach = ph < 0.2 ? 0 : ph < 0.6 ? ease((ph - 0.2) / 0.4) : 1;
  const fade = ph < 0.08 ? ph / 0.08 : ph > 0.85 ? (1 - ph) / 0.15 : 1;
  ring(ctx, g.x, g.y, R, alpha * fade, false, false, S);
  thumb(ctx, g.x + dir.x * R * 0.8 * reach, g.y + dir.y * R * 0.8 * reach, -1, alpha * fade, ph < 0.2 ? ph / 0.2 : 1, GHOST);
}

/** The right ghost toward `dir`: aiming (out to just inside the dashed ring, sweeping) or firing (past it, the ring lit). */
function aimGhost(ctx, g, dir, R, alpha, fire, t, S) {
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
  thumb(ctx, g.x + Math.cos(ang) * r, g.y + Math.sin(ang) * r, 1, alpha * fade, 1, GHOST);
}

/** The ghost thumbs (touch only): the gesture this lesson wants, on the stick it wants it on. */
function coach(ctx, game, input, view, L) {
  const T = game.tutorial;
  const S = game.settings;
  const R = S.stickRadius;
  const tp = input.touch;
  const t = T.clock;
  const kind = view.coach;
  // Each ghost fades while your own thumb is on that stick.
  const moveA = tp.move.active ? 0.15 : 1;
  const aimA = tp.aim.active ? 0.15 : 1;
  if (kind === 'move') {
    moveGhost(ctx, L.fixedMove, screenDir(game, T.arrow(), { x: 1, y: 0 }), R, moveA, t, S);
    return;
  }
  if (kind === 'aim' || kind === 'fire') {
    const z = T.step.id === 'aim' || T.step.id === 'fire' ? T.pen.find((q) => q.alive) : nearestOn(game, T.group);
    aimGhost(ctx, L.fixedAim, screenDir(game, z, { x: 0.6, y: -0.8 }), R, aimA, kind === 'fire', t, S);
    return;
  }
  if (kind === 'kite') {
    // Both thumbs at once: the left one walks you away from them while the right one shoots at them.
    const toward = screenDir(game, nearestOn(game, T.group) || T.L.packSpawns[0][0], { x: -1, y: 0 });
    moveGhost(ctx, L.fixedMove, { x: -toward.x, y: -toward.y }, R, moveA, t, S);
    aimGhost(ctx, L.fixedAim, toward, R, aimA, true, t, S);
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
  ctx.strokeStyle = `rgba(255,255,255,${0.55 * alpha})`;
  ctx.fillStyle = `rgba(255,255,255,${0.08 * alpha})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  circle(ctx, x, y, R);
  ctx.fill();
  ctx.stroke();
  if (aim && S.fireThreshold > S.aimDeadzone) {
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = hot ? `rgba(${ORANGE},${0.95 * alpha})` : `rgba(${ORANGE},${0.6 * alpha})`;
    ctx.lineWidth = hot ? 3.5 : 2.5;
    ctx.beginPath();
    circle(ctx, x, y, R * clamp(S.fireThreshold, 0.1, 0.95));
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
