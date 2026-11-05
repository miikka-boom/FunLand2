// Card faces: a rarity frame, an illustration (a real settled ragdoll of the
// unit, or painted spell art) and the mana drop, painted onto a canvas for the
// hand, the deck and the collection. Faces are cached per card, size and
// options, so the UI can redraw a hand every frame for the cost of a drawImage.
//
//   drawCardArt(canvas, 'clubbers', { level: 3 });   // fills the canvas (device px)
//   const face = cardFace('boulder', 120, 156, { mini: true, dim: true });  // cached canvas
//
// opts: {
//   level     card level: a "Level N" ribbon at the bottom (not on mini cards)
//   locked    greyed out with a padlock (the UI says which arena unlocks it)
//   dim       not enough mana: darker and washed out
//   mini      hand size: thinner frame, no ribbon
//   name      true: the card's name on the ribbon (the level moves to a corner tab)
//   palette   army colours for the beans ({ body, shade, light, limb, dark })
//   hats      { unitTypeId: hatId } equipped hats
//   team      'blue' (default) or 'red'
// }

import { TEAMS } from '../config.js';
import { CARDS, RARITIES } from '../sim/cards.js';
import { Battle, DT } from '../sim/battle.js';
import { UnitRenderer, drawArrow } from './units.js';
import { drawBoulderShape, drawCheeseWheel } from './spells.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const FONT = '"Arial Black", "Segoe UI Black", system-ui, sans-serif';
const INK = '#2a1d14';
const MAX_FACES = 240;

const gfx = new UnitRenderer();
const faces = new Map(); // key -> canvas
const posed = new Map(); // `${unit}|${n}|${team}|${hat}` -> { b, units }

function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const A = rgbOf(a);
  const B = rgbOf(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function rgba(hex, a) {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function sparkle(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = i % 2 ? r * 0.28 : r;
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

// --- Illustrations -------------------------------------------------------------------

/** 1-3 settled beans of a unit card (a real ragdoll, like the old unit icons). */
function poseUnits(card, team, hat) {
  const n = clamp(card.count || 1, 1, 3);
  const key = `${card.unit}|${n}|${team}|${hat || ''}`;
  let p = posed.get(key);
  if (p) return p;
  const b = new Battle(5);
  if (hat && hat !== 'none') b.hats[team] = { [card.unit]: hat };
  const units = [];
  const probe = b.addUnit(card.unit, team, 0, 0, 77);
  const gap = probe ? probe.R * 1.9 + 8 : 30;
  const dir = team === 'red' ? -1 : 1;
  // Back row first (higher lane = nearer); the lead bean stands in front
  if (n === 1) units.push(probe);
  else {
    b.removeUnit(probe);
    const slots = n === 2 ? [[-0.55, 0], [0.55, 1]] : [[-1, 0.1], [1, 0.3], [0, 1]];
    slots.forEach(([o, lane], i) => units.push(b.addUnit(card.unit, team, o * gap * dir, lane, 77 + i * 31)));
  }
  for (let i = 0; i < 90; i++) b.step(DT);
  p = { b, units: units.filter(Boolean) };
  if (posed.size > 64) posed.clear();
  posed.set(key, p);
  return p;
}

function unitArt(g, card, ax, ay, aw, ah, opts) {
  const team = opts.team === 'red' ? 'red' : 'blue';
  const hat = opts.hats && opts.hats[card.unit];
  const { b, units } = poseUnits(card, team, hat);
  if (!units.length) return;
  // Fit everything (hats, weapons, the giant Brick) into the window
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const u of units) {
    const hatTop = u.hat ? u.R * 1.4 : 0;
    for (const p of u.parts) {
      x0 = Math.min(x0, p.x - u.R);
      x1 = Math.max(x1, p.x + u.R);
      y0 = Math.min(y0, p.y - u.R - (p === u.head ? hatTop : 0));
    }
    y1 = Math.max(y1, u.ground + 3);
  }
  const s = Math.min((aw * 0.84) / (x1 - x0), (ah * 0.8) / (y1 - y0));
  const cx = (x0 + x1) / 2;
  const base = ay + ah * 0.93; // where the grass is
  g.save();
  g.translate(ax + aw / 2, base);
  g.scale(s, s);
  g.translate(-cx, -y1);
  const keep = gfx.palettes[team];
  gfx.palettes[team] = opts.palette || keep || TEAMS[team];
  gfx.drawShadows(g, b);
  gfx.drawUnits(g, b, 0);
  gfx.palettes[team] = keep;
  g.restore();
}

function speedLines(g, x, y, dx, dy, n, len, gap, w) {
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * gap;
    const L = len * (1 - Math.abs(i - (n - 1) / 2) * 0.25);
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x - uy * o, y + ux * o);
    g.lineTo(x - uy * o - ux * L, y + ux * o - uy * L);
    g.stroke();
  }
}

function dustPuff(g, x, y, r) {
  g.fillStyle = '#d9c59b';
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.fillStyle = '#f1e7cb';
  g.beginPath();
  g.arc(x - r * 0.08, y - r * 0.17, r * 0.84, 0, TAU);
  g.fill();
}

function spellArt(g, card, ax, ay, aw, ah) {
  const k = Math.min(aw, ah);
  const gy = ay + ah * 0.9;
  if (card.spell === 'boulder') {
    const r = k * 0.27;
    const x = ax + aw * 0.56;
    const y = ay + ah * 0.42;
    g.fillStyle = 'rgba(28,52,12,0.35)';
    g.beginPath();
    g.ellipse(x + r * 0.15, gy, r * 1.05, r * 0.22, 0, 0, TAU);
    g.fill();
    speedLines(g, x - r * 0.7, y - r * 0.7, 1, 1.4, 3, r * 1.4, r * 0.55, Math.max(1.5, k * 0.025));
    drawBoulderShape(g, x, y, r, 0.4, 7);
    dustPuff(g, ax + aw * 0.22, gy - k * 0.03, k * 0.07);
    dustPuff(g, ax + aw * 0.82, gy - k * 0.02, k * 0.06);
  } else if (card.spell === 'arrowRain') {
    // A volley coming down at a slant, the first ones already stuck in the grass
    const s = k / 120;
    g.save();
    const flying = [[0.2, 0.18], [0.45, 0.08], [0.7, 0.2], [0.33, 0.42], [0.58, 0.35], [0.82, 0.45]];
    for (const [u, v] of flying) {
      const x = ax + aw * u;
      const y = ay + ah * v + 30 * s;
      g.save();
      g.translate(x, y);
      g.scale(s * 1.6, s * 1.6);
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(-Math.cos(1.25) * 32, -Math.sin(1.25) * 32);
      g.lineTo(-Math.cos(1.25) * 56, -Math.sin(1.25) * 56);
      g.stroke();
      drawArrow(g, 0, 0, 1.25, 'blue', 1, 0);
      g.restore();
    }
    for (const u of [0.24, 0.5, 0.76]) {
      g.save();
      g.translate(ax + aw * u, gy - 2 * s);
      g.scale(s * 1.6, s * 1.6);
      drawArrow(g, 0, 0, 1.3, 'blue', 1, 5);
      g.restore();
    }
    g.restore();
  } else {
    const r = k * 0.3;
    const x = ax + aw * 0.55;
    const y = gy - r;
    g.fillStyle = 'rgba(28,52,12,0.3)';
    g.beginPath();
    g.ellipse(x, gy + 1, r * 0.95, r * 0.2, 0, 0, TAU);
    g.fill();
    speedLines(g, x - r * 1.1, y, 1, 0, 3, r * 0.9, r * 0.5, Math.max(1.5, k * 0.025));
    drawCheeseWheel(g, x, y, r, 0.9);
    g.fillStyle = '#ffd34d';
    for (const [u, v, sz] of [[-1.35, 0.7, 0.07], [-1.6, 0.4, 0.05], [-1.2, 0.25, 0.04]]) {
      g.beginPath();
      g.rect(x + u * r, y + v * r, sz * k, sz * k);
      g.fill();
    }
  }
}

// --- The face ----------------------------------------------------------------------------

function manaDrop(g, x, y, r, mana) {
  const drop = (k) => {
    g.beginPath();
    g.moveTo(x, y - r * 1.35 * k);
    g.bezierCurveTo(x + r * 0.55 * k, y - r * 0.7 * k, x + r * k, y - r * 0.2 * k, x + r * k, y + r * 0.25 * k);
    g.arc(x, y + r * 0.25 * k, r * k, 0, Math.PI);
    g.bezierCurveTo(x - r * k, y - r * 0.2 * k, x - r * 0.55 * k, y - r * 0.7 * k, x, y - r * 1.35 * k);
    g.closePath();
  };
  drop(1.14);
  g.fillStyle = INK;
  g.fill();
  drop(1);
  const gr = g.createLinearGradient(x - r, y - r, x + r, y + r);
  gr.addColorStop(0, '#c49bff');
  gr.addColorStop(0.5, '#8b5cf0');
  gr.addColorStop(1, '#3d4fd6');
  g.fillStyle = gr;
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath();
  g.ellipse(x - r * 0.42, y - r * 0.25, r * 0.18, r * 0.36, 0.5, 0, TAU);
  g.fill();
  g.font = `900 ${Math.round(r * 1.25)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = r * 0.32;
  g.strokeStyle = '#25155e';
  g.strokeText(String(mana), x, y + r * 0.32);
  g.fillStyle = '#ffffff';
  g.fillText(String(mana), x, y + r * 0.32);
}

function padlock(g, x, y, s) {
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.lineWidth = s * 0.34;
  g.beginPath();
  g.arc(x, y - s * 0.35, s * 0.62, Math.PI, 0);
  g.lineTo(x + s * 0.62, y);
  g.moveTo(x - s * 0.62, y);
  g.lineTo(x - s * 0.62, y - s * 0.35);
  g.stroke();
  g.strokeStyle = '#d6dbe2';
  g.lineWidth = s * 0.18;
  g.stroke();
  g.fillStyle = INK;
  g.beginPath();
  rrect(g, x - s * 1.05, y - s * 0.12, s * 2.1, s * 1.6, s * 0.3);
  g.fill();
  const gr = g.createLinearGradient(0, y, 0, y + s * 1.4);
  gr.addColorStop(0, '#ffe58a');
  gr.addColorStop(1, '#d69a2a');
  g.fillStyle = gr;
  g.beginPath();
  rrect(g, x - s * 0.9, y + s * 0.02, s * 1.8, s * 1.32, s * 0.22);
  g.fill();
  g.fillStyle = INK;
  g.beginPath();
  g.arc(x, y + s * 0.55, s * 0.2, 0, TAU);
  g.rect(x - s * 0.08, y + s * 0.55, s * 0.16, s * 0.45);
  g.fill();
}

function ribbon(g, x, y, w, h, rar, text, size) {
  g.fillStyle = INK;
  g.beginPath();
  rrect(g, x - 1, y - 1, w + 2, h + 2, h * 0.35);
  g.fill();
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, mix(rar.dark, '#000000', 0.15));
  gr.addColorStop(1, mix(rar.dark, '#000000', 0.45));
  g.fillStyle = gr;
  g.beginPath();
  rrect(g, x, y, w, h, h * 0.32);
  g.fill();
  g.fillStyle = rgba(rar.glow, 0.25);
  g.fillRect(x + h * 0.3, y + 1, w - h * 0.6, h * 0.3);
  g.font = `900 ${Math.round(size)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.28;
  g.strokeStyle = INK;
  let t = text;
  while (t.length > 3 && g.measureText(t).width > w - h * 0.5) t = t.slice(0, -1);
  if (t !== text) t = t.slice(0, -1) + '.';
  g.strokeText(t, x + w / 2, y + h * 0.54);
  g.fillStyle = '#ffffff';
  g.fillText(t, x + w / 2, y + h * 0.54);
}

function paintFace(cv, card, opts) {
  const g = cv.getContext('2d');
  const W = cv.width;
  const H = cv.height;
  const u = W / 100; // design unit
  const rar = RARITIES[card.rarity] || RARITIES.common;
  const mini = !!opts.mini;
  g.clearRect(0, 0, W, H);
  g.save();
  // Frame: ink edge, rarity metal with a lit top-left, an inner bevel
  const R = (mini ? 9 : 10) * u;
  g.fillStyle = INK;
  g.beginPath();
  rrect(g, 0.5, 0.5, W - 1, H - 1, R);
  g.fill();
  const fg = g.createLinearGradient(0, 0, W, H);
  fg.addColorStop(0, rar.glow);
  fg.addColorStop(0.35, rar.color);
  fg.addColorStop(1, rar.dark);
  g.fillStyle = fg;
  const e = 2.2 * u;
  g.beginPath();
  rrect(g, e, e, W - 2 * e, H - 2 * e, R - e * 0.6);
  g.fill();
  // Art window
  const inset = (mini ? 6 : 7) * u;
  const bottom = mini || (!opts.level && !opts.name) ? inset : 22 * u;
  const ax = inset;
  const ay = inset;
  const aw = W - 2 * inset;
  const ah = H - inset - bottom;
  g.fillStyle = mix(rar.dark, '#000000', 0.35);
  g.beginPath();
  rrect(g, ax - 1.4 * u, ay - 1.4 * u, aw + 2.8 * u, ah + 2.8 * u, 7 * u);
  g.fill();
  g.save();
  g.beginPath();
  rrect(g, ax, ay, aw, ah, 6 * u);
  g.clip();
  const sky = g.createLinearGradient(0, ay, 0, ay + ah);
  sky.addColorStop(0, '#6fb2e4');
  sky.addColorStop(0.7, '#cfe9f4');
  g.fillStyle = sky;
  g.fillRect(ax, ay, aw, ah);
  const glow = g.createRadialGradient(ax + aw / 2, ay + ah * 0.55, 0, ax + aw / 2, ay + ah * 0.55, aw * 0.75);
  glow.addColorStop(0, rgba(rar.glow, 0.85));
  glow.addColorStop(1, rgba(rar.glow, 0));
  g.fillStyle = glow;
  g.fillRect(ax, ay, aw, ah);
  // Hills and the grass the beans stand on
  g.fillStyle = '#a8d272';
  g.beginPath();
  g.ellipse(ax + aw * 0.2, ay + ah * 0.92, aw * 0.55, ah * 0.22, 0, Math.PI, TAU);
  g.ellipse(ax + aw * 0.9, ay + ah * 0.95, aw * 0.5, ah * 0.2, 0, Math.PI, TAU);
  g.fill();
  const gg = g.createLinearGradient(0, ay + ah * 0.86, 0, ay + ah);
  gg.addColorStop(0, '#9fd05a');
  gg.addColorStop(1, '#6faa3c');
  g.fillStyle = gg;
  g.fillRect(ax, ay + ah * 0.88, aw, ah * 0.12);
  if (card.kind === 'unit') unitArt(g, card, ax, ay, aw, ah, opts);
  else spellArt(g, card, ax, ay, aw, ah);
  // Soft vignette inside the window
  const vg = g.createRadialGradient(ax + aw / 2, ay + ah / 2, Math.min(aw, ah) * 0.35, ax + aw / 2, ay + ah / 2, Math.max(aw, ah) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(20,10,40,0.28)');
  g.fillStyle = vg;
  g.fillRect(ax, ay, aw, ah);
  g.restore();
  // Bevel highlight on the frame
  g.strokeStyle = rgba('#ffffff', 0.45);
  g.lineWidth = 1.2 * u;
  g.beginPath();
  rrect(g, e + 1.2 * u, e + 1.2 * u, W - 2 * e - 2.4 * u, H - 2 * e - 2.4 * u, R - e);
  g.stroke();
  // Rarity flourishes: studs on rare, sparkles on epic
  if (card.rarity === 'rare' || card.rarity === 'epic') {
    const col = card.rarity === 'epic' ? '#fff3ff' : '#fff1c4';
    for (const [x, y] of [[e + 2.5 * u, H - e - 2.5 * u], [W - e - 2.5 * u, H - e - 2.5 * u], [W - e - 2.5 * u, e + 2.5 * u]]) {
      g.fillStyle = INK;
      if (card.rarity === 'epic') {
        sparkle(g, x, y, 4.2 * u);
        g.fill();
        g.fillStyle = col;
        sparkle(g, x, y, 3.2 * u);
        g.fill();
      } else {
        g.beginPath();
        g.arc(x, y, 2.2 * u, 0, TAU);
        g.fill();
        g.fillStyle = col;
        g.beginPath();
        g.arc(x - 0.3 * u, y - 0.3 * u, 1.4 * u, 0, TAU);
        g.fill();
      }
    }
  }
  // Ribbon: the level (or the name, with the level on a corner tab)
  if (!mini && (opts.level || opts.name)) {
    const text = opts.name ? card.name : `Level ${opts.level}`;
    ribbon(g, 5 * u, H - 19 * u, W - 10 * u, 14 * u, rar, text, (opts.name ? 9.5 : 10) * u);
    if (opts.name && opts.level) {
      const tw = 24 * u;
      ribbon(g, W - tw - 4 * u, 4 * u, tw, 11 * u, rar, `Lv${opts.level}`, 8 * u);
    }
  }
  // Mana drop, top left over the frame
  const mr = (mini ? 13.5 : 10.5) * u; // bigger on hand cards: the cost is what you read there
  manaDrop(g, mr + 2.5 * u, mr * 1.45 + 1.5 * u, mr, card.mana);
  g.restore();
}

/** Grey (locked) or dimmed (not enough mana) copy of a face, by pixels. */
function tint(src, kind) {
  const cv = document.createElement('canvas');
  cv.width = src.width;
  cv.height = src.height;
  const g = cv.getContext('2d');
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  const grey = kind === 'locked' ? 1 : 0.65;
  const dark = kind === 'locked' ? 0.62 : 0.58;
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    d[i] = (d[i] + (l - d[i]) * grey) * dark;
    d[i + 1] = (d[i + 1] + (l - d[i + 1]) * grey) * dark;
    d[i + 2] = (d[i + 2] + (l - d[i + 2]) * grey) * dark + (kind === 'locked' ? 6 : 14);
  }
  g.putImageData(img, 0, 0);
  if (kind === 'locked') {
    const u = cv.width / 100;
    padlock(g, cv.width / 2, cv.height * 0.44, 11 * u);
  }
  return cv;
}

function paletteKey(p) {
  return p ? `${p.body}${p.shade}${p.light}` : '';
}

/**
 * The cached face of a card at w x h device px (a canvas; don't draw on it).
 * Returns null for an unknown card or outside a browser.
 */
export function cardFace(cardId, w, h, opts = {}) {
  const card = CARDS[cardId];
  if (!card || typeof document === 'undefined') return null;
  w = Math.max(16, Math.round(w));
  h = Math.max(16, Math.round(h));
  const hats = opts.hats && card.unit ? opts.hats[card.unit] || '' : '';
  const base = `${cardId}|${w}x${h}|${opts.mini ? 1 : 0}|${opts.level || 0}|${opts.name ? 1 : 0}|${paletteKey(opts.palette)}|${hats}|${opts.team || ''}`;
  const mode = opts.locked ? 'locked' : opts.dim ? 'dim' : '';
  const key = base + '|' + mode;
  let cv = faces.get(key);
  if (cv) return cv;
  let src = faces.get(base + '|');
  if (!src) {
    src = document.createElement('canvas');
    src.width = w;
    src.height = h;
    paintFace(src, card, opts);
    remember(base + '|', src);
  }
  if (!mode) return src;
  cv = tint(src, mode);
  remember(key, cv);
  return cv;
}

function remember(key, cv) {
  if (faces.size >= MAX_FACES) faces.delete(faces.keys().next().value); // oldest first
  faces.set(key, cv);
}

/** Paint a card face onto `canvas` (filling it). Returns the canvas. */
export function drawCardArt(canvas, cardId, opts = {}) {
  if (!canvas) return canvas;
  const g = canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  const face = cardFace(cardId, canvas.width, canvas.height, opts);
  if (face) g.drawImage(face, 0, 0);
  return canvas;
}

/** Forget cached faces (e.g. after the army colour or a hat changes). */
export function clearCardCache() {
  faces.clear();
  posed.clear();
}
