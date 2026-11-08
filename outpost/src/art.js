// Art for the town map, in one place: the iso art modules (town-art.js,
// ground-art.js, decor-art.js, town-icons.js) behind small wrappers that cache
// by key. If a module fails to load, plain iso boxes stand in so the map still
// draws.

import { tileToWorld } from './iso.js';
import { DECOR, KEEPSAKES, BUILDINGS, LOT, LOTS, LOTS_ACROSS, CLASSES, SETS, RUINS, FENCE_TIERS } from './config.js';
import { souvenirSvg } from './thrill-art.js';

const load = async (path) => {
  try {
    return await import(path);
  } catch (e) {
    if (typeof console !== 'undefined') console.warn(`art: ${path} did not load (${e && e.message})`);
    return null;
  }
};
const T = await load('./town-art.js');
const G = await load('./ground-art.js');
const D = await load('./decor-art.js');
const I = await load('./town-icons.js');

/** A plain iso box on a w × h footprint (the stand-in). */
export function boxArt(w, h, height, color = '#c9b48a', label = '') {
  const W = (w + h) * 32;
  const artH = (w + h) * 16 + height;
  const top = artH - (w + h) * 16; // footprint top corner y
  const T0 = [h * 32, top - height];
  const R = [W, artH - h * 16 - height];
  const B = [w * 32, artH - height];
  const L = [0, artH - w * 16 - height];
  const p = (pts) => pts.map((q) => q.join(',')).join(' ');
  const down = (q) => [q[0], q[1] + height];
  return {
    svg:
      `<svg viewBox="0 0 ${W} ${artH}" overflow="visible" xmlns="http://www.w3.org/2000/svg" stroke="#2a1b12" stroke-width="2.5" stroke-linejoin="round">` +
      `<polygon points="${p([L, B, down(B), down(L)])}" fill="${color}"/>` +
      `<polygon points="${p([B, R, down(R), down(B)])}" fill="${color}" style="filter:brightness(0.8)"/>` +
      `<polygon points="${p([T0, R, B, L])}" fill="${color}" style="filter:brightness(1.15)"/>` +
      (label ? `<text x="${W / 2}" y="${artH - height / 2}" font-family="system-ui" font-weight="900" font-size="12" text-anchor="middle" fill="#2a1b12" stroke="none">${label}</text>` : '') +
      `</svg>`,
    artH,
  };
}

const cache = new Map();
const memo = (key, fn) => {
  if (cache.has(key)) return cache.get(key);
  let v;
  try {
    v = fn();
  } catch (e) {
    if (typeof console !== 'undefined') console.warn(`art: ${key} threw`, e);
    v = null;
  }
  cache.set(key, v);
  if (cache.size > 900) cache.delete(cache.keys().next().value);
  return v;
};

export const hasArt = { town: !!T, ground: !!G, decor: !!D, icons: !!I };

/** Town art with its animations embedded (map objects are images, out of the page CSS's reach). */
const anim = (art) => (art && T && T.withAnimation ? { ...art, svg: T.withAnimation(art.svg) } : art);

/** The anchors town-art exposes (bus spot, roof campers, door and walker spots). */
export const ANCHORS = (T && T.ANCHORS) || {};

export function building(id, level, town, flags = 0) {
  const n = BUILDINGS[id].size;
  return memo(`b|${id}|${level}|${town.name}|${town.color}|${flags}`, () => (T && T.buildingArt ? anim(T.buildingArt(id, level, { town: town.name, color: town.color, flags })) : null)) || boxArt(n, n, 40 + n * 10, '#e9c46a', BUILDINGS[id].name.split(' ')[0]);
}

export function home(person, tier, { roof, hearts = 0, legend = false } = {}) {
  const key = `h|${person.id}|${tier}|${roof}|${hearts}|${legend}|${person.golden}|${person.level}`;
  return memo(key, () => (T && T.homeArt ? anim(T.homeArt(person, tier, { roof, hearts, golden: !!person.golden, legend })) : null)) || boxArt(2, 2, 30 + tierHeight(tier), CLASSES[person.cls].color);
}

export function campTent(color) {
  return memo(`ct|${color}`, () => (T && T.campTentArt ? T.campTentArt(color) : '')) || '';
}

const tierHeight = (tier) => ({ tent: 0, shack: 8, cabin: 14, cottage: 18, tower: 34, gold: 34 })[tier] || 0;

export function landmark(id, restored, town = null) {
  const t = restored && town ? town : null;
  return memo(`l|${id}|${restored}|${t ? `${t.name}|${t.color}` : ''}`, () => (T && T.landmarkArt ? anim(T.landmarkArt(id, restored, t ? { town: t.name, color: t.color } : {})) : null)) || boxArt(3, 3, 90, restored ? '#ffd36b' : '#8f8a6a', id);
}

export function bossSpot(id) {
  return (T && T.BOSS_SPOT && T.BOSS_SPOT[id]) || null;
}

/** The boss's costume prop as an SVG in the 40 × 56 walker-zombie space. */
export function bossProp(id) {
  return (
    memo(`bp|${id}`, () => {
      const g = T && T.bossProp ? T.bossProp(id) : '';
      if (!g) return '';
      return g.trim().startsWith('<svg') ? g : `<svg viewBox="0 0 40 56" overflow="visible" xmlns="http://www.w3.org/2000/svg">${g}</svg>`;
    }) || ''
  );
}

export function fence(tier, side, len, color = null, seed = 0) {
  const t = FENCE_TIERS[tier] || FENCE_TIERS[0];
  return memo(`f|${t}|${side}|${len}|${color}|${seed}`, () => (T && T.fenceArt ? anim(T.fenceArt(t, side, len, { color, seed })) : null));
}

export function decor(kind) {
  const n = DECOR[kind] ? DECOR[kind].size : 1;
  return memo(`d|${kind}`, () => (D && D.decorArt ? D.decorArt(kind) : null)) || boxArt(n, n, 16, DECOR[kind] ? SETS[DECOR[kind].set].color : '#ccc');
}

export function keepsake(kind) {
  const n = KEEPSAKES[kind] ? KEEPSAKES[kind].size : 1;
  return memo(`k|${kind}`, () => (D && D.keepsakeArt ? D.keepsakeArt(kind) : null)) || boxArt(n, n, 22, '#ffd36b');
}

export function souvenir(id) {
  return memo(`s|${id}`, () => (D && D.plinthArt ? D.plinthArt(souvenirSvg(id)) : null)) || boxArt(2, 2, 24, '#bdbdbd');
}

export function statue() {
  return memo('statue', () => (D && D.statueArt ? D.statueArt() : null)) || boxArt(2, 2, 50, '#ffc23a');
}

export function setBadge(set) {
  return memo(`sb|${set}`, () => (D && D.setBadgeSvg ? D.setBadgeSvg(set) : '')) || `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="${SETS[set] ? SETS[set].color : '#ccc'}" stroke="#2a1b12" stroke-width="2"/></svg>`;
}

export function ruin(key) {
  const L = LOTS[key];
  const arche = (L && L.ruin) || RUINS[0];
  return memo(`r|${key}`, () => (G && G.ruinArt ? G.ruinArt(arche, { name: shortName(L ? L.name : '') }) : null)) || boxArt(3, 3, 46, '#8f8a6a', shortName(L ? L.name : ''));
}

const shortName = (n) => {
  const u = n.toUpperCase().replace(/^THE /, '');
  return u.length <= 14 ? u : u.split(' ').slice(-1)[0].slice(0, 12);
};

export function mystery() {
  return memo('mystery', () => (G && G.mysteryArt ? G.mysteryArt() : null)) || boxArt(3, 3, 40, '#5aa0d8', '?');
}

export function junk(v) {
  return memo(`j|${v}`, () => (G && G.junkArt ? G.junkArt(v) : null)) || boxArt(1, 1, 12, '#a07a4a');
}

/** One lot's ground image (owned grass or the wild), paths joined across lots. */
export function lotGround(a, b, { owned, haze, pathAt, key }) {
  if (G && G.lotGroundSvg) {
    try {
      return G.lotGroundSvg(a, b, { owned, haze, pathAt, seed: a * 31 + b * 7 + 1 });
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('art: lotGround threw', e);
    }
  }
  void key;
  // Stand-in: 49 diamonds.
  let out = '';
  for (let u = 0; u < LOT; u++)
    for (let v = 0; v < LOT; v++) {
      const x = (u - v) * 32 + 224;
      const y = (u + v) * 16;
      const p = pathAt(a * LOT + u, b * LOT + v);
      const fill = p ? '#c99a5b' : owned ? ((u + v) % 2 ? '#8fd16a' : '#86c860') : haze ? '#b8b89a' : '#8e9a5c';
      out += `<polygon points="${x},${y} ${x + 32},${y + 16} ${x},${y + 32} ${x - 32},${y + 16}" fill="${fill}"/>`;
    }
  return `<svg viewBox="0 0 448 224" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
}

export function bloomTiles(a, b) {
  if (G && G.bloomTiles) return G.bloomTiles(a, b);
  let out = '';
  for (let u = 0; u < LOT; u++)
    for (let v = 0; v < LOT; v++) {
      const x = (u - v) * 32 + 224;
      const y = (u + v) * 16;
      const d = Math.max(Math.abs(u - 3), Math.abs(v - 3));
      out += `<polygon class="bloom" style="--d:${d}" points="${x},${y} ${x + 32},${y + 16} ${x},${y + 32} ${x - 32},${y + 16}" fill="#8fd16a"/>`;
    }
  return `<svg viewBox="0 0 448 224" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
}

/** The land around the map (one static image) and its world rect. */
export function scenery() {
  const s = memo('scenery', () => (G && G.sceneryBackdrop ? G.sceneryBackdrop() : null));
  if (s) return s;
  const M = LOT * LOTS_ACROSS;
  const top = tileToWorld(0, 0);
  void top;
  return { svg: `<svg viewBox="-1500 -350 3000 1800" xmlns="http://www.w3.org/2000/svg"><rect x="-1500" y="-350" width="3000" height="1800" fill="#7fae5a"/></svg>`, left: -1500, top: -350, width: 3000, height: 1800, M };
}

/** Town icons (BUILD, the sets, move, box…), falling back to a dot. */
export function townIcon(name) {
  if (I && I.townIcon) {
    const s = I.townIcon(name);
    if (s) return s;
  }
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="currentColor"/></svg>`;
}
