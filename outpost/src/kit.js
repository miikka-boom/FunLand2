// View helpers shared by every screen: faces in star frames, stars, amounts.
// Pure string builders.

import { CLASSES, RARITIES } from './config.js';
import { portraitSvg } from './portrait.js';
import { displayName, fullName } from './people.js';
import { icon, coinBody } from './icons.js';
import { fmtNum } from './format.js';
import { esc } from './ui.js';

/** A portrait in its star frame with the level badge. */
export function face(p, { size = 56, lv = true, mood, cls = '', extra = '' } = {}) {
  return (
    `<span class="face r-${p.rarity} ${cls}" data-id="${p.id}" style="--sz:${size}px;--cls:${CLASSES[p.cls].color}">` +
    portraitSvg(p, { mood, crop: size <= 64 ? 'face' : undefined }) +
    (lv ? `<i class="lv">${p.level}</i>` : '') +
    extra +
    `</span>`
  );
}

/** ★★★☆ and the name of the star count ("Hero"). */
export function stars(p, { label = true } = {}) {
  const n = RARITIES[p.rarity].stars;
  return `<span class="stars r-${p.rarity}"><span class="on">${'★'.repeat(n)}</span><span class="off">${'★'.repeat(4 - n)}</span>${label ? `<b>${RARITIES[p.rarity].name}</b>` : ''}</span>`;
}

export const coins = (n, cls = '') => `<span class="amt coin ${cls}">${icon('coin')}<b>${fmtNum(n)}</b></span>`;
export const name = (p) => esc(displayName(p));
export const full = (p) => esc(fullName(p));
export const power = (n) => `<span class="pw"><small>POWER</small><b>${Math.round(n)}</b></span>`;
/** A coin that flies to the wallet. */
export const coinSvg = () => `<svg class="loot-coin" viewBox="0 0 24 24" aria-hidden="true">${coinBody()}</svg>`;
