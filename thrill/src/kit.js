// View helpers shared by every screen: faces in rarity frames, tags, Badge
// bars, amounts. Pure string builders.

import { CLASSES, RARITIES, PERKS, VIBES, THREATS } from './config.js';
import { portraitSvg } from './portrait.js';
import { threatIconSvg } from './art.js';
import { displayName, fullName } from './people.js';
import { perkValue } from './raid.js';
import { icon } from './icons.js';
import { fmtNum } from './format.js';
import { esc } from './ui.js';

/** A portrait in its rarity frame with the level badge. */
export function face(p, { size = 56, lv = true, mood, cls = '', extra = '' } = {}) {
  return (
    `<span class="face r-${p.rarity}${p.golden ? ' golden' : ''} ${cls}" data-id="${p.id}" style="--sz:${size}px;--cls:${CLASSES[p.cls].color}">` +
    portraitSvg(p, { mood, crop: size <= 64 ? 'face' : undefined }) +
    (lv ? `<i class="lv">${p.level}</i>` : '') +
    extra +
    `</span>`
  );
}

export const rarityTag = (p) => `<span class="rtag r-${p.rarity}">${p.golden ? '★ Golden ' : ''}${RARITIES[p.rarity].name}</span>`;
export const classTag = (cls) => `<span class="ctag c-${cls}">${icon(cls)}${CLASSES[cls].name}</span>`;
export const threatChip = (t) => `<span class="chip t-${t}">${threatIconSvg(t)}<b>${THREATS[t].name}</b></span>`;
export const coins = (n, cls = '') => `<span class="amt coin ${cls}">${icon('coin')}<b>${fmtNum(n)}</b></span>`;
export const gems = (n, cls = '') => `<span class="amt gem ${cls}">${icon('gem')}<b>${fmtNum(n)}</b></span>`;
export const skulls = (n, cls = '') => `<span class="amt skull ${cls}">${icon('skull')}<b>${fmtNum(n)}</b></span>`;
export const name = (p) => esc(displayName(p));
export const full = (p) => esc(fullName(p));

export function perkLine(p) {
  const P = p.perk ? PERKS[p.perk] : null;
  if (!P) return '';
  return `<span class="perk">${icon(p.perk)}<b>${P.name}</b> ${esc(P.text(perkValue(p)))}</span>`;
}

export const vibeLine = (p) => `<span class="vibe">${icon(p.vibe)}<b>${VIBES[p.vibe].name}</b> ${esc(VIBES[p.vibe].text)}</span>`;

/** The Badge bar: "7 / 12" with READY when full. */
export function badgeBar(p, meta, { before = null } = {}) {
  const need = meta.need(p);
  if (need === null) return `<div class="bbar max"><i style="transform:scaleX(1)"></i><span>MAX LEVEL</span></div>`;
  const v = before ?? p.badges;
  const f = Math.min(1, v / need);
  const ready = v >= need;
  const k = meta.readyLevels(p);
  return `<div class="bbar${ready ? ' full' : ''}"><i style="transform:scaleX(${f.toFixed(3)})"></i><span>${icon('badge')}${v} / ${need}${ready ? ` · READY${k > 1 ? ` ×${k}` : ''}` : ''}</span></div>`;
}

export const pw = (n) => `<span class="pw">${icon('star')}<b>${Math.round(n)}</b></span>`;
