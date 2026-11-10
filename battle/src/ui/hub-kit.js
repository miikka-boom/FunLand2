// Shared bits for the hub (the menus around the matches): a tiny DOM builder,
// number / time formats, inline SVG icons, card tiles (legendaries shine),
// reward views, unit and hat icons, and the stats a card detail shows. No
// state of its own besides a few small canvas caches.

import { CARDS, RARITIES, levelMul, MAX_LEVEL, cardById } from '../sim/cards.js';
import { UNIT_TYPES, BEAT } from '../sim/unit-types.js';
import { SPELLS } from '../sim/spells.js';
import { TOWER_TAKES } from '../sim/towers.js';
import { BUILDINGS } from '../sim/buildings.js';
import { Battle, DT } from '../sim/battle.js';
import { UnitRenderer } from '../render/units.js';
import { cardFace, drawLegendarySheen } from '../render/cards.js';
import { HATS, drawHat } from '../render/hats.js';
import { ARENAS, AIR_ANSWERS } from '../meta/collection.js';
import { ARCHETYPES, archetypesFor } from '../meta/opponents.js';
import { COLORS } from '../meta/cosmetics.js';

export { CARDS, RARITIES, MAX_LEVEL, cardById, ARENAS, HATS, COLORS };

export const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'html') el.innerHTML = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const DPR = () => Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
export const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
/** Short form for the wallet pills: 12,345 / 123.4k / 1.2M. */
export const fmtShort = (n) => {
  n = Math.round(Number(n) || 0);
  if (n < 100000) return fmt(n);
  if (n < 1e6) return (n / 1000).toFixed(n < 1e5 ? 1 : 0).replace(/\.0$/, '') + 'k';
  return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
};
/** "2h 14m", "14m 5s", "45s". */
export function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  if (hh > 0) return `${hh}h ${mm}m`;
  if (mm > 0) return `${mm}m ${s % 60}s`;
  return `${s}s`;
}
export const arenaLabel = (i) => `Arena ${i + 1}`;

// --- icons (inline SVG: crisp at any size, no emoji font needed) --------------------------

const INK = '#3a2816';
const sword = (rot) =>
  `<g transform="rotate(${rot} 16 16)"><path d="M14.6 2.5h2.8l.1 16.5h-3z" fill="#eef3f8" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>` +
  `<path d="M16 3.5v14" stroke="#b9c6d3" stroke-width="0.9"/><rect x="10" y="18.6" width="12" height="3" rx="1.4" fill="#f3b52f" stroke="${INK}" stroke-width="1.4"/>` +
  `<rect x="14.8" y="21.4" width="2.4" height="5.4" fill="#8a4f22" stroke="${INK}" stroke-width="1.2"/><circle cx="16" cy="28.2" r="1.9" fill="#f3b52f" stroke="${INK}" stroke-width="1.2"/></g>`;
const ICONS = {
  battle: `<svg viewBox="0 0 32 32">${sword(45)}${sword(-45)}</svg>`,
  cards:
    `<svg viewBox="0 0 32 32"><g stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"><rect x="4" y="7" width="14" height="19" rx="2.6" fill="#b05ce0" transform="rotate(-14 11 16)"/>` +
    `<rect x="13" y="6" width="14" height="19" rx="2.6" fill="#2b6be0" transform="rotate(10 20 15)"/></g>` +
    `<path d="M20.4 10.6c2 2.6 3 4.2 3 5.6a3 3 0 0 1-6 0c0-1.4 1-3 3-5.6z" fill="#fff" opacity=".9" transform="rotate(10 20 15)"/></svg>`,
  shop:
    `<svg viewBox="0 0 32 32"><g stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"><rect x="5" y="14" width="22" height="13" rx="1.5" fill="#c98a4b"/>` +
    `<rect x="12.5" y="18" width="7" height="9" fill="#7a4e27"/><path d="M3.5 13.5 6 5h20l2.5 8.5z" fill="#fff6e6"/>` +
    `<path d="M3.5 13.5h5l1-8.5H6zM13.5 13.5h5l-.6-8.5h-3.8zM23.5 13.5h5L26 5h-3.5z" fill="#e4433b"/>` +
    `<path d="M3.5 13.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" fill="#fff6e6"/></g></svg>`,
  trail:
    `<svg viewBox="0 0 32 32"><path d="M3 27c5-1 6-6 12-6s7-4 13-5" fill="none" stroke="#e3cfa6" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M3 27c5-1 6-6 12-6s7-4 13-5" fill="none" stroke="${INK}" stroke-width="1.2" stroke-dasharray="2 2.6" stroke-linecap="round"/>` +
    `<g stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"><path d="M21 17V3.5" fill="none"/><path d="M21 4h8.5l-2.6 3.4 2.6 3.4H21z" fill="#3fae4f"/></g>` +
    `<circle cx="9" cy="23" r="2.6" fill="#f3b52f" stroke="${INK}" stroke-width="1.3"/></svg>`,
  more:
    `<svg viewBox="0 0 32 32"><g stroke="${INK}" stroke-width="1.5"><circle cx="7" cy="16" r="3.6" fill="#f6ead0"/><circle cx="16" cy="16" r="3.6" fill="#f6ead0"/>` +
    `<circle cx="25" cy="16" r="3.6" fill="#f6ead0"/></g></svg>`,
  gear:
    `<svg viewBox="0 0 32 32"><path fill="#9aa0ad" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" d="M13.6 3h4.8l.7 3.6 2.4 1 3-2.1 3.4 3.4-2.1 3 1 2.4 3.6.7v4.8l-3.6.7-1 2.4 2.1 3-3.4 3.4-3-2.1-2.4 1-.7 3.6h-4.8l-.7-3.6-2.4-1-3 2.1-3.4-3.4 2.1-3-1-2.4L3 18.4v-4.8l3.6-.7 1-2.4-2.1-3 3.4-3.4 3 2.1 2.4-1z"/>` +
    `<circle cx="16" cy="16" r="4.6" fill="#f6ead0" stroke="${INK}" stroke-width="1.6"/></svg>`,
  full:
    `<svg viewBox="0 0 32 32"><path d="M5 12V5h7M20 5h7v7M27 20v7h-7M12 27H5v-7" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  trophy:
    `<svg viewBox="0 0 32 32"><g stroke="${INK}" stroke-width="1.7" stroke-linejoin="round"><path d="M8 5h-4v2.5A5 5 0 0 0 9 12.5M24 5h4v2.5a5 5 0 0 1-5 5" fill="none"/>` +
    `<path d="M8 3.5h16v6a8 8 0 0 1-16 0z" fill="#f3b52f"/><path d="M14 17h4v4.5h-4z" fill="#d79a1c"/><path d="M9.5 28.5h13l-1.4-4.5h-10.2z" fill="#a8641a"/></g>` +
    `<path d="M11 6v3.5a5 5 0 0 0 2.5 4.3" fill="none" stroke="#fff3c4" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  drop: `<svg viewBox="0 0 32 32"><path d="M16 3c5.4 7.2 9 12 9 16.2a9 9 0 0 1-18 0C7 15 10.6 10.2 16 3z" fill="#9b5cf0" stroke="#2a1d50" stroke-width="2"/><path d="M11.5 19a4.5 4.5 0 0 0 3 4.3" fill="none" stroke="#e6d4ff" stroke-width="2" stroke-linecap="round"/></svg>`,
  lock:
    `<svg viewBox="0 0 32 32"><path d="M10 14v-3.5a6 6 0 0 1 12 0V14" fill="none" stroke="${INK}" stroke-width="3"/><rect x="6.5" y="13.5" width="19" height="14" rx="3" fill="#9aa0ad" stroke="${INK}" stroke-width="1.8"/>` +
    `<circle cx="16" cy="19.5" r="2.2" fill="${INK}"/><path d="M16 20.5v3.5" stroke="${INK}" stroke-width="2"/></svg>`,
  crown:
    `<svg viewBox="0 0 32 32"><path d="M4 11l6 5 6-9 6 9 6-5-2.5 14h-19z" fill="#f3b52f" stroke="${INK}" stroke-width="1.7" stroke-linejoin="round"/><path d="M7 21.5h18" stroke="#a8641a" stroke-width="1.6"/></svg>`,
  gift:
    `<svg viewBox="0 0 32 32"><g stroke="${INK}" stroke-width="1.7" stroke-linejoin="round"><rect x="5" y="14" width="22" height="14" rx="1.5" fill="#e4433b"/><rect x="3.5" y="9.5" width="25" height="5.5" rx="1.5" fill="#f7776c"/>` +
    `<path d="M13.6 9.5h4.8V28h-4.8z" fill="#f3b52f"/><path d="M16 9.5c-3-5-8.5-5-7.5-1.6.6 1.8 4 1.8 7.5 1.6zM16 9.5c3-5 8.5-5 7.5-1.6-.6 1.8-4 1.8-7.5 1.6z" fill="#f3b52f"/></g></svg>`,
  check: `<svg viewBox="0 0 32 32"><path d="M6 17l6.5 6.5L26.5 8.5" fill="none" stroke="#2f8a3d" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  up: `<svg viewBox="0 0 32 32"><path d="M16 4 27 16h-6.5v12h-9V16H5z" fill="#4cc75a" stroke="#1d5a24" stroke-width="2" stroke-linejoin="round"/></svg>`,
  close: `<svg viewBox="0 0 32 32"><path d="M8 8l16 16M24 8 8 24" stroke="${INK}" stroke-width="4" stroke-linecap="round"/></svg>`,
  heart: `<svg viewBox="0 0 32 32"><path d="M16 27S4 19.5 4 11.5A6 6 0 0 1 16 9a6 6 0 0 1 12 2.5C28 19.5 16 27 16 27z" fill="#e2559d" stroke="${INK}" stroke-width="1.7"/></svg>`,
  sandbox:
    `<svg viewBox="0 0 32 32"><g stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"><path d="M3 27c2-6 7-9 13-9s11 3 13 9z" fill="#f2cf3a"/><path d="M19 18 22 6l5 2z" fill="#e4433b"/>` +
    `<path d="M10 14h7l-1 5h-5z" fill="#2b6be0"/></g></svg>`,
  scroll:
    `<svg viewBox="0 0 32 32"><g stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"><path d="M8 5h17v20a3 3 0 0 1-3 3H8z" fill="#f6ead0"/><path d="M5 8a3 3 0 0 1 3-3v6H5z" fill="#e3cfa6"/>` +
    `<path d="M12 11h9M12 15h9M12 19h6" fill="none"/></g></svg>`,
  badge:
    `<svg viewBox="0 0 32 32"><g stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"><path d="M10 3h5l-2 10h-4zM22 3h-5l2 10h4z" fill="#2b6be0"/>` +
    `<circle cx="16" cy="20" r="8.5" fill="#f3b52f"/></g><path d="M16 15.5l1.4 2.9 3.1.4-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.4z" fill="#fff3c4"/></svg>`,
  clock: `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#fff8e8" stroke="${INK}" stroke-width="2.4"/><path d="M16 9v7.5l5 3" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/></svg>`,
};

/** An inline SVG icon element: <i class="hb-ic hb-ic-NAME">. */
export function icon(name, cls = '') {
  const el = document.createElement('i');
  el.className = `hb-ic hb-ic-${name}${cls ? ' ' + cls : ''}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = ICONS[name] || '';
  return el;
}
export const coin = (cls = '') => h('i', { class: 'hb-coin' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' });
export const bean = (cls = '') => h('i', { class: 'hb-bean' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' });

// --- canvases ------------------------------------------------------------------------

/** A canvas of css w x h px at device resolution. */
export function canvas(w, hgt, cls = '') {
  const d = DPR();
  const cv = h('canvas', { class: cls, width: Math.round(w * d), height: Math.round(hgt * d) });
  cv.style.width = w + 'px';
  cv.style.height = hgt + 'px';
  return cv;
}

/**
 * A card face canvas (render/cards.js, cached faces). A legendary face that
 * isn't locked or dimmed gets the slow sheen (tickSheens) unless opts.sheen is false.
 */
export function cardCanvas(id, w, opts = {}, cls = 'hb-cardcv') {
  const hgt = Math.round(w * CARD_RATIO);
  const cv = canvas(w, hgt, cls);
  const face = cardFace(id, cv.width, cv.height, opts);
  if (face) cv.getContext('2d').drawImage(face, 0, 0);
  const card = cardById(id);
  if (face && card && card.rarity === 'legendary' && !opts.locked && !opts.dim && opts.sheen !== false && w >= 40) {
    if (shiny.size > 60) for (const c of shiny) if (!c.isConnected) shiny.delete(c);
    shiny.set(cv, { face, opts });
  }
  return cv;
}
export const CARD_RATIO = 1.3;

// Legendary faces on screen: the rainbow sheen sweeps over them (2 s a pass).
const shiny = new Map(); // canvas -> { face, opts }
const SHEEN_FPS = 30;
let sheenT = 0;
/** Redraw the sheen on every legendary face on screen (hub.tick, `t` in seconds). */
export function tickSheens(t) {
  if (!shiny.size || t - sheenT < 1 / SHEEN_FPS) return;
  sheenT = t;
  for (const [cv, s] of shiny) {
    if (!cv.isConnected) {
      shiny.delete(cv); // (screens re-render with new canvases)
      continue;
    }
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(s.face, 0, 0);
    drawLegendarySheen(g, 0, 0, cv.width, cv.height, t, s.opts);
  }
}

/** Card size (css px) for the current screen: `k` = share of the screen height. */
export function cardW(k = 0.165, lo = 50, hi = 96) {
  const H = typeof window !== 'undefined' ? window.innerHeight : 390;
  return Math.round(clamp(H * k, lo, hi));
}

const iconGfx = new UnitRenderer();
const unitIcons = new Map(); // key -> canvas

/** A settled bean (with hat and army colours) drawn into `cv`, cached per look. */
export function unitIcon(cv, typeId, opts = {}) {
  const team = opts.team || 'blue';
  const pal = opts.palette || null;
  const key = `${typeId}|${team}|${opts.hat || ''}|${pal ? pal.body + pal.shade : ''}|${cv.width}x${cv.height}`;
  let src = unitIcons.get(key);
  if (!src) {
    src = document.createElement('canvas');
    src.width = cv.width;
    src.height = cv.height;
    try {
      const b = new Battle(5);
      if (opts.hat && opts.hat !== 'none') b.hats[team] = { [typeId]: opts.hat };
      const u = b.addUnit(typeId, team, 0, 0, 77);
      if (u) {
        for (let i = 0; i < 90; i++) b.step(DT);
        b.events.length = 0;
        const c = src.getContext('2d');
        // Fit tall units (the giant Brick) and their hats into the square
        const hatTop = u.hat ? u.R * 1.3 : 0;
        const height = u.ground - (Math.min(u.head.y - hatTop, u.tip ? u.tip.y : u.head.y) - u.R) + 6;
        const s = (cv.width / 80) * Math.min(1, 74 / height);
        c.setTransform(s, 0, 0, s, cv.width / 2 - u.hip.x * s + 4 * s * (team === 'red' ? -1 : 1), cv.height - 8 * (cv.width / 80));
        const keep = iconGfx.palettes[team];
        if (pal) iconGfx.palettes[team] = pal;
        iconGfx.drawUnit(c, u, b, 0);
        iconGfx.palettes[team] = keep;
      }
    } catch {
      // an icon must never break the menu
    }
    if (unitIcons.size > 120) unitIcons.clear();
    unitIcons.set(key, src);
  }
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  g.drawImage(src, 0, 0);
  return cv;
}

/** A hat on a plain head (so it reads as a hat). 'none' draws a crossed circle. */
export function hatIcon(cv, id, pal) {
  const c = cv.getContext('2d');
  const W = cv.width;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, W, cv.height);
  if (id === 'none') {
    c.strokeStyle = 'rgba(58,40,22,0.35)';
    c.lineWidth = W * 0.05;
    c.beginPath();
    c.arc(W / 2, W / 2, W * 0.26, 0, Math.PI * 2);
    c.moveTo(W * 0.32, W * 0.68);
    c.lineTo(W * 0.68, W * 0.32);
    c.stroke();
    return cv;
  }
  const p = pal || COLORS[0].pal;
  const s = W / 44;
  c.setTransform(s, 0, 0, s, W / 2, W * 0.78);
  c.fillStyle = p.body;
  c.beginPath();
  c.arc(0, 4, 13, Math.PI, 0);
  c.lineTo(13, 10);
  c.lineTo(-13, 10);
  c.closePath();
  c.fill();
  drawHat(c, id, 0, 4 - 13 * 0.92, -Math.PI / 2, 13, p, 0);
  c.setTransform(1, 0, 0, 1, 0, 0);
  return cv;
}
export const hatById = (id) => HATS.find((x) => x.id === id) || null;

// --- reward views ----------------------------------------------------------------------

/** "+50" chip with a coin / bean / trophy. */
export function amountChip(kind, n, cls = '') {
  const ic = kind === 'gold' ? coin() : kind === 'beans' ? bean() : icon('trophy');
  return h('span', { class: `hb-amt hb-amt-${kind}${cls ? ' ' + cls : ''}` }, ic, h('b', {}, (n > 0 ? '+' : '') + fmt(n)));
}

/** A small card with its count, its name and NEW! / upgrade badges (chest summary, rewards). */
export function gainTile(c, w) {
  const card = CARDS[c.id];
  const tile = h('div', { class: `hb-gain r-${c.rarity}`, style: `max-width:${Math.round(w + 16)}px` }, cardCanvas(c.id, w, { mini: true }), h('b', { class: 'hb-gain-n' }, '×' + fmt(c.n)), h('small', { class: 'hb-gain-name' }, card ? card.name : c.id));
  if (c.isNew) tile.append(h('span', { class: 'hb-new' }, 'NEW!'));
  // (green only when it can really be upgraded: copies AND gold)
  else if (c.canUpgrade || (c.canUpgrade == null && c.canUpgradeAfter)) tile.append(h('span', { class: 'hb-upready' }, icon('up'), 'Upgrade'));
  else if (c.canUpgradeAfter) tile.append(h('span', { class: 'hb-upready short' }, 'Copies ✓'));
  return tile;
}

/** Everything in a grant() summary as chips and tiles. */
export function rewardView(g, w = cardW(0.2, 54, 90)) {
  const box = h('div', { class: 'hb-rewards' });
  if (g.gold) box.append(amountChip('gold', g.gold, 'big'));
  if (g.beans) box.append(amountChip('beans', g.beans, 'big'));
  for (const c of g.cards || []) box.append(gainTile(c, w));
  if (g.hat) {
    const cv = canvas(w * 0.9, w * 0.9);
    hatIcon(cv, g.hat);
    const hat = hatById(g.hat);
    box.append(h('div', { class: 'hb-gain hb-gain-hat' }, cv, h('b', {}, hat ? hat.name : 'Hat')));
  }
  if (g.color) {
    const col = COLORS.find((x) => x.id === g.color);
    box.append(h('div', { class: 'hb-gain hb-gain-hat' }, h('i', { class: 'hb-swatch', style: `background:${col ? col.pal.body : '#888'}` }), h('b', {}, col ? col.name : 'Colour')));
  }
  return box;
}

// --- card stats --------------------------------------------------------------------------

const SPELL_KEY = { cheeseWheel: 'wheel' };
const speedWord = (v) => (v < 50 ? 'Slow' : v < 70 ? 'Medium' : v < 89 ? 'Fast' : 'Very fast');

/** What a unit type goes for: high fliers too, structures only, nothing at all, or the ground. */
function targetsWord(t) {
  if (t.hitsAir) return 'Air & ground';
  if (t.targets === 'structures' || t.targets === 'towers') return 'Buildings & towers';
  if (!t.attack && !t.dash && !t.blast && !t.hop && !t.engulf && !t.scoop) return 'Nothing (buffs friends)';
  return 'Ground';
}

/** The hit a unit type deals that its card shows: [label, damage] or null. */
function unitDamage(t) {
  if (t.bomb && t.attack && t.attack.toss) return ['Bomb damage', t.bomb.damage];
  if (t.attack && t.attack.damage) return [t.attack.bite ? 'Bite damage' : 'Damage', t.attack.damage];
  if (t.dash && t.dash.damage) return [t.scoop ? 'Peck damage' : t.dash.kind === 'dive' ? 'Dive damage' : 'Damage', t.dash.damage];
  if (t.blast && t.blast.damage) return ['Blast damage', t.blast.damage];
  if (t.hop && t.hop.bonk) return ['Bonk damage', t.hop.bonk.damage];
  if (t.bump && t.bump.damage) return ['Bump damage', t.bump.damage];
  return null;
}

/** What the Drummer's beat does to friends nearby (BEAT: swing tempo and walking speed). */
function beatWords() {
  const x = (v) => '×' + +v.toFixed(2);
  return BEAT.tempo === BEAT.move ? `Friends ${x(BEAT.tempo)} faster` : `Friends swing ${x(BEAT.tempo)}, walk ${x(BEAT.move)}`;
}

/**
 * Rows for the card detail: [{ label, value, next }] at `level`; next = the
 * value one level up (null when maxed or not scaling).
 */
export function cardStats(id, level) {
  const card = cardById(id);
  if (!card) return [];
  const lv = clamp(level || 1, 1, MAX_LEVEL);
  const m = levelMul(lv);
  const m2 = lv < MAX_LEVEL ? levelMul(lv + 1) : null;
  const sc = (v) => Math.round(v * m);
  const nx = (v) => (m2 ? Math.round(v * m2) : null);
  const rows = [];
  if (card.kind === 'unit') {
    const t = UNIT_TYPES[card.unit];
    if (!t) return rows;
    rows.push({ label: 'Health', value: sc(t.hp), next: nx(t.hp) });
    const dmg = unitDamage(t);
    if (dmg) rows.push({ label: dmg[0], value: sc(dmg[1]), next: nx(dmg[1]) });
    else if (t.beat) rows.push({ label: 'Beat', value: beatWords() });
    rows.push({ label: 'Speed', value: speedWord(t.speed) + (t.flying ? ' · flies' : '') });
    rows.push({ label: 'Range', value: t.ranged && t.range ? `${t.range[0]}–${t.range[1]}` : t.blast ? `Blast ${t.blast.radius}` : t.beat ? `Beat ${t.beat.radius}` : 'Melee' });
    rows.push({ label: 'Units', value: '×' + (card.count || 1) + (card.anywhere ? ' · anywhere' : '') });
    rows.push({ label: 'Targets', value: targetsWord(t) });
  } else if (card.kind === 'building') {
    const B = BUILDINGS[card.building];
    if (!B) return rows;
    rows.push({ label: 'Health', value: sc(B.hp), next: nx(B.hp) });
    rows.push({ label: 'Lifetime', value: `${B.life} s` });
    if (B.punch) {
      rows.push({ label: 'Punch damage', value: sc(B.punch.damage), next: nx(B.punch.damage) });
      rows.push({ label: 'Reach', value: B.punch.reach });
    } else if (B.pendulum) {
      rows.push({ label: 'Swing damage', value: sc(B.pendulum.damage), next: nx(B.pendulum.damage) });
      rows.push({ label: 'Reach', value: B.pendulum.sense });
    }
    if (B.spawn) {
      const kid = UNIT_TYPES[B.spawn.unit];
      rows.push({ label: 'Spawns', value: `${kid ? kid.name : B.spawn.unit} / ${B.spawn.every} s` });
      rows.push({ label: 'At once', value: `Up to ${B.spawn.max}` });
    }
    rows.push({ label: 'Targets', value: 'Ground' });
  } else {
    const S = SPELLS[SPELL_KEY[card.spell] || card.spell];
    if (!S) return rows;
    const tw = TOWER_TAKES.spell || 0.35;
    if (card.spell === 'bubbleWrap') {
      // (it helps your own side: no damage at all)
      rows.push({ label: 'Absorbs', value: sc(S.absorb), next: nx(S.absorb) });
      rows.push({ label: 'Lasts', value: `${S.time} s` });
      rows.push({ label: 'Radius', value: card.radius });
      rows.push({ label: 'Targets', value: 'Your own beans' });
      return rows;
    }
    const volleys = S.volleys || 1;
    const per = S.damage;
    rows.push({
      label: card.spell === 'bananaPeels' ? 'Slip damage' : 'Damage',
      value: volleys > 1 ? `${volleys} × ${sc(per)}` : sc(per),
      next: m2 ? (volleys > 1 ? `${volleys} × ${nx(per)}` : nx(per)) : null,
    });
    if (card.spell === 'bananaPeels') {
      rows.push({ label: 'Peels', value: `×${S.peels}` });
      rows.push({ label: 'Lasts', value: `${S.life} s` });
    } else rows.push({ label: 'Tower damage', value: volleys > 1 ? `${volleys} × ${sc(per * tw)}` : sc(per * tw), next: m2 ? (volleys > 1 ? `${volleys} × ${nx(per * tw)}` : nx(per * tw)) : null });
    if (card.spell === 'shakenSoda') rows.push({ label: 'Pops after', value: `${S.fuse} s` });
    rows.push({ label: S.dist ? 'Rolls' : 'Radius', value: S.dist ? `${S.dist} px` : card.radius });
    rows.push({ label: 'Targets', value: AIR_ANSWERS.includes(card.id) ? 'Air & ground' : 'Ground' }); // (the air answers reach high fliers)
  }
  return rows;
}

// --- the hub's demo match ---------------------------------------------------------------

const DEMO_NEWEST = 0.5; // share of demo decks that play the arena's newest style(s)

/**
 * The style one side of the hub's demo match plays at `arena`: half the time
 * one of the newest styles that arena has unlocked (so a Wobble Summit demo
 * shows Summit cards), otherwise any of the others. An arena with no newer
 * style (Green Hills) picks exactly as before. Ladder opponents never use this.
 */
export function demoStyle(arena, rng) {
  const all = archetypesFor(arena);
  let top = 0;
  for (const id of all) top = Math.max(top, ARCHETYPES[id].arena || 0);
  if (!top) return rng.pick(all);
  const newest = all.filter((id) => (ARCHETYPES[id].arena || 0) === top);
  const rest = all.filter((id) => (ARCHETYPES[id].arena || 0) !== top);
  return rng.chance(DEMO_NEWEST) || !rest.length ? rng.pick(newest) : rng.pick(rest);
}

/** The small line under a card's name: what kind of card it is. */
export function cardKindLine(card) {
  if (card.kind === 'spell') return 'Spell · cast anywhere';
  if (card.kind === 'building') {
    const B = BUILDINGS[card.building];
    return B ? `Building · lasts ${B.life} s` : 'Building';
  }
  if (card.flying) return 'Unit card · flies';
  if (card.anywhere) return 'Unit card · lands anywhere';
  return `Unit card · ${card.count > 1 ? card.count + ' beans' : '1 bean'}`;
}
