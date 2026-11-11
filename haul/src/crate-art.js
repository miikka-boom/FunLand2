// Long Haul: the crates of a haul and what comes out of them. Pure string
// builders (no DOM).
//
// A crate is one <svg> whose colours are CSS variables (--cr-a main, --cr-b
// dark, --cr-c light), so every crate looks the same olive drab until it is
// opened and the stylesheet turns it into what it was all along: wood, steel
// or gold. The lid is its own group (.cr-lid) for the stylesheet to throw.

import { OL, tone } from './figures.js';
import { BEN_COLOR } from './config.js';

const S = `stroke="${OL}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

/** A closed crate, 120 x 112, standing on y = 46. */
export function crateSvg() {
  const a = 'style="fill:var(--cr-a)"';
  const b = 'style="fill:var(--cr-b)"';
  const c = 'style="fill:var(--cr-c)"';
  return (
    `<svg class="crate-svg" viewBox="-60 -64 120 116" aria-hidden="true">` +
    `<ellipse class="cr-shadow" cx="0" cy="44" rx="50" ry="7" fill="#0c0a1c" opacity="0.45"/>` +
    // What's inside shines out once the lid is off.
    `<g class="cr-glow"><path d="M-40,-22 L-58,-64 H58 L40,-22 Z" style="fill:var(--cr-shine)" opacity="0.55"/><path d="M-22,-22 L-30,-64 H30 L22,-22 Z" style="fill:var(--cr-shine)" opacity="0.6"/></g>` +
    `<g class="cr-body">` +
    `<rect x="-46" y="-24" width="92" height="66" rx="7" ${a} ${S}/>` +
    `<path d="M-43,-21 h86 v9 h-86z" ${c} opacity="0.75"/>` +
    `<path d="M-43,30 h86 v9 h-86z" ${b} opacity="0.75"/>` +
    `<path d="M-46,-2 H46 M-46,20 H46" fill="none" stroke="${OL}" stroke-width="2.4" opacity="0.55"/>` +
    `<path d="M-46,-24 h14 v14 h-14z M32,-24 h14 v14 h-14z M-46,28 h14 v14 h-14z M32,28 h14 v14 h-14z" ${b} ${S} stroke-width="2.4"/>` +
    `<circle cx="-39" cy="-17" r="1.8" fill="${OL}"/><circle cx="39" cy="-17" r="1.8" fill="${OL}"/><circle cx="-39" cy="35" r="1.8" fill="${OL}"/><circle cx="39" cy="35" r="1.8" fill="${OL}"/>` +
    `<path class="cr-mark" d="M0,-9 L2.6,-2.8 L9,-2.8 L3.8,1.4 L5.6,8 L0,4.2 L-5.6,8 L-3.8,1.4 L-9,-2.8 L-2.6,-2.8 Z" transform="translate(0,9) scale(1.9)" fill="#f4f1ea" opacity="0.92"/>` +
    `<rect class="cr-dark" x="-40" y="-24" width="80" height="10" rx="3" fill="#15121f" ${S} stroke-width="2.4"/>` +
    `</g>` +
    `<g class="cr-lid">` +
    `<rect x="-51" y="-40" width="102" height="20" rx="6" ${a} ${S}/>` +
    `<path d="M-47,-37 h94 v6 h-94z" ${c} opacity="0.85"/>` +
    `<path d="M-20,-40 v20 M20,-40 v20" fill="none" stroke="${OL}" stroke-width="2.4" opacity="0.55"/>` +
    `<rect x="-8" y="-28" width="16" height="12" rx="3" fill="#2c2740" ${S} stroke-width="2.4"/>` +
    `</g>` +
    `</svg>`
  );
}

const can = (x, y, s = 1, label = '#d9483b') =>
  `<g transform="translate(${x},${y}) scale(${s})">` +
  `<path d="M-13,-17 V15 A13,5 0 0 0 13,15 V-17" fill="${label}" ${S}/>` +
  `<path d="M-13,-9 A13,5 0 0 0 13,-9 V5 A13,5 0 0 1 -13,5 Z" fill="#f4f1ea" ${S} stroke-width="2.4"/>` +
  `<circle cx="0" cy="3.6" r="4.2" fill="${label}"/>` +
  `<ellipse cx="0" cy="-17" rx="13" ry="5" fill="#c9d0de" ${S}/>` +
  `<ellipse cx="0" cy="-17" rx="7" ry="2.2" fill="none" stroke="${OL}" stroke-width="1.6" opacity="0.5"/>` +
  `</g>`;

/** Supplies as tins: one for a small find, a stack for a decent one, a heap for the gold crate. */
export function cansSvg(tier = 'wood') {
  let inner;
  if (tier === 'gold') inner = can(-26, 12, 0.9, '#3f8f6f') + can(26, 12, 0.9, '#f0b429') + can(0, 14, 0.95) + can(-13, -16, 0.9, '#4a8fe8') + can(13, -16, 0.9) + can(0, -42, 0.85, '#f0b429');
  else if (tier === 'steel') inner = can(-15, 12, 0.95, '#4a8fe8') + can(15, 12, 0.95) + can(0, -18, 0.95, '#f0b429');
  else inner = can(0, 2, 1.25);
  return `<svg class="loot-svg loot-cans" viewBox="-50 -66 100 100" aria-hidden="true">${inner}</svg>`;
}

/** The find of the day: a radio, its light already on. */
export function radioSvg() {
  return (
    `<svg class="loot-svg loot-radio" viewBox="-50 -66 100 100" aria-hidden="true">` +
    `<g class="lr-waves" fill="none" stroke="#8fe3d0" stroke-width="4" stroke-linecap="round"><path d="M20,-58 a16,16 0 0 1 0,22"/><path d="M30,-66 a28,28 0 0 1 0,38"/></g>` +
    `<path d="M10,-22 V-58" stroke="${OL}" stroke-width="7" stroke-linecap="round"/><path d="M10,-22 V-58" stroke="#c9d0de" stroke-width="3" stroke-linecap="round"/>` +
    `<circle cx="10" cy="-60" r="4.5" fill="#ff5a4a" ${S} stroke-width="2.4"/>` +
    `<rect x="-24" y="-26" width="48" height="58" rx="9" fill="#3f8f6f" ${S}/>` +
    `<path d="M-20,-22 h40 v8 h-40z" fill="${tone('#3f8f6f', 0.3)}" opacity="0.7"/>` +
    `<rect x="-16" y="-16" width="32" height="17" rx="3" fill="#15121f" ${S} stroke-width="2.4"/>` +
    `<path d="M-12,-7 l5,-5 l5,8 l5,-7 l5,6 l4,-3" fill="none" stroke="#8fe3d0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M-14,10 h28 M-14,17 h28 M-14,24 h28" stroke="#15121f" stroke-width="2.6" stroke-linecap="round"/>` +
    `<circle cx="-15" cy="-21" r="0" fill="none"/>` +
    `<rect x="-31" y="-10" width="8" height="20" rx="3" fill="#2c2740" ${S} stroke-width="2.4"/>` +
    `</svg>`
  );
}

/**
 * Two little eyes scratched into the wood. They always look at something:
 * `dx`, `dy` is the direction, any length. Nobody says who draws them.
 */
export function eyesSvg(dx = 1, dy = -1) {
  const len = Math.hypot(dx, dy) || 1;
  const px = (dx / len) * 2.6;
  const py = (dy / len) * 2.6;
  const eye = (cx) =>
    `<circle cx="${cx}" cy="0" r="6.4" fill="none" stroke="#f1e6c8" stroke-width="1.7" stroke-dasharray="9 1.6 12 1.2" opacity="0.9"/>` + `<circle cx="${(cx + px).toFixed(1)}" cy="${py.toFixed(1)}" r="2.2" fill="#f1e6c8" opacity="0.95"/>`;
  return `<svg class="ben-eyes" viewBox="-18 -9 36 18" aria-hidden="true">${eye(-8)}${eye(8)}</svg>`;
}

/** A few words in orange crayon (for the crate at the gate, when it is opened). */
export const crayon = (text) => `<span class="crayon" style="color:${BEN_COLOR}">${String(text).replace(/[<>&]/g, '')}</span>`;
