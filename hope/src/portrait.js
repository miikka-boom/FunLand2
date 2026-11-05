// Procedural portraits and street figures, drawn from a person's `look`
// (people.js). Pure string builders: same look, same picture.

import { SKIN, HAIR_COLORS, EYES, SHIRTS } from './people.js';
import { ROLES } from './config.js';

const LINE = '#1d1612';

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const OUTFIT = {
  bruiser: '#3b2d26',
  shooter: '#57653c',
  medic: '#3f9a8c',
  scout: null, // hoodie in the person's shirt colour
  mechanic: '#36577f',
};

// --- Head geometry ----------------------------------------------------------------------

function headPath(face) {
  if (face === 'long') return { el: `<ellipse cx="50" cy="45" rx="18.5" ry="24.5"/>`, top: 20.5, w: 18.5 };
  if (face === 'square') return { el: `<path d="M31.5 33c0-9 8-13.5 18.5-13.5S68.5 24 68.5 33v13c0 13-8.5 22-18.5 22S31.5 59 31.5 46z"/>`, top: 19.5, w: 18.5 };
  return { el: `<ellipse cx="50" cy="45" rx="20" ry="23"/>`, top: 22, w: 20 };
}

/** Hair drawn behind the head (long styles). */
function hairBack(style, c) {
  switch (style) {
    case 'long':
      return `<path d="M27 40c0-17 10-24 23-24s23 7 23 24v34c-6 4-12 5-23 5s-17-1-23-5z" fill="${c}" stroke="${LINE}" stroke-width="1.6"/>`;
    case 'bob':
      return `<path d="M28 40c0-16 9-23 22-23s22 7 22 23v20c-5 4-12 5-22 5s-17-1-22-5z" fill="${c}" stroke="${LINE}" stroke-width="1.6"/>`;
    case 'afro':
      return `<circle cx="50" cy="38" r="29" fill="${c}" stroke="${LINE}" stroke-width="1.6"/>`;
    case 'pony':
      return `<path d="M64 30c9 2 13 10 11 22-1 8-5 13-9 15 2-8 2-16-2-22z" fill="${c}" stroke="${LINE}" stroke-width="1.6"/>`;
    case 'braids':
      return (
        `<path d="M30 44c-3 10-4 22-2 34" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round"/>` +
        `<path d="M70 44c3 10 4 22 2 34" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round"/>` +
        `<path d="M27.5 54l5 2M27 62l5 2M27 70l5 2M72.5 54l-5 2M73 62l-5 2M73 70l-5 2" stroke="${LINE}" stroke-width="1" opacity="0.5"/>`
      );
    case 'bun':
      return `<circle cx="50" cy="16" r="8" fill="${c}" stroke="${LINE}" stroke-width="1.6"/>`;
    default:
      return '';
  }
}

/** Hair on top of the head. */
function hairFront(style, c, hat) {
  if (hat === 'hood') return '';
  const s = `fill="${c}" stroke="${LINE}" stroke-width="1.6" stroke-linejoin="round"`;
  switch (style) {
    case 'bald':
      return `<path d="M40 27c4-2 9-2.5 13-1.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.35"/>`;
    case 'buzz':
      return `<path d="M30.5 42c-1-14 7-22 19.5-22s20.5 8 19.5 22c-3-6-8-9-19.5-9.5S33.5 36 30.5 42z" fill="${c}" opacity="0.75" stroke="${LINE}" stroke-width="1.2"/>`;
    case 'short':
      return `<path d="M29.5 44c-2-17 7-26 20.5-26s22.5 9 20.5 26c-2-6-5-9-8-10.5-3 3-8 4-13 3.5-5-.5-9-2-11-4-4 2-7 5-9 11z" ${s}/>`;
    case 'swept':
      return `<path d="M29.5 44c-2-17 8-26 21-26 13 0 21 9 20 25-3-7-7-11-12-12-7 0-17 3-22 1-3 3-5 7-7 12z" ${s}/><path d="M37 30c6 1 14-1 20-5" fill="none" stroke="${shade(c, 1.35)}" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>`;
    case 'curly':
      return `<path d="M29 44c-4-3-3-10 0-12-2-6 3-11 7-11 1-5 7-7 11-5 3-4 10-3 12 1 5-1 9 3 9 8 4 2 5 8 2 12 2 3 1 7-1 8-2-6-6-9-9-11-5 2-12 3-17 2-5 1-9 3-11 8z" ${s}/>`;
    case 'afro':
      return `<path d="M30 42c-1-12 6-19 20-19s21 7 20 19c-4-5-10-7-20-7s-16 2-20 7z" fill="${shade(c, 0.85)}" stroke="${LINE}" stroke-width="1.2"/>`;
    case 'mohawk':
      return `<path d="M44 34c0-10 2-18 6-24 4 6 6 14 6 24-3 1-9 1-12 0z" ${s}/><path d="M31 42c0-6 2-9 5-11M69 42c0-6-2-9-5-11" fill="none" stroke="${c}" stroke-width="2.5" opacity="0.6"/>`;
    case 'long':
    case 'bob':
      return `<path d="M29.5 46c-2-18 7-27 20.5-27s22.5 9 20.5 27c-3-8-7-13-11-15-3 3-6 4-9.5 4s-6.5-1-9.5-4c-4 2-8 7-11 15z" ${s}/><path d="M50 21v9" stroke="${LINE}" stroke-width="1.2" opacity="0.5"/>`;
    case 'pony':
    case 'bun':
    case 'braids':
      return `<path d="M30 44c-2-16 7-24 20-24s22 8 20 24c-3-7-7-11-11-12-3 2-6 2.5-9 2.5s-6-.5-9-2.5c-4 1-8 5-11 12z" ${s}/>`;
    default:
      return '';
  }
}

function hatSvg(hat, shirt) {
  switch (hat) {
    case 'beanie': {
      const c = shade(shirt, 1.1);
      return `<path d="M28.5 38c0-15 9-22 21.5-22s21.5 7 21.5 22z" fill="${c}" stroke="${LINE}" stroke-width="1.6"/><rect x="27.5" y="34" width="45" height="7" rx="3" fill="${shade(c, 0.8)}" stroke="${LINE}" stroke-width="1.4"/><path d="M34 35v5M39 35v5M44 35v5M49 35v5M54 35v5M59 35v5M64 35v5" stroke="${LINE}" stroke-width="0.8" opacity="0.35"/>`;
    }
    case 'cap': {
      const c = shade(shirt, 0.9);
      return `<path d="M29.5 36c0-13 9-19 20.5-19s20.5 6 20.5 19z" fill="${c}" stroke="${LINE}" stroke-width="1.6"/><path d="M29 35c10-2 32-2 43 0 4 1 9 3 11 6-8-1-18-2-25-2H29z" fill="${shade(c, 0.75)}" stroke="${LINE}" stroke-width="1.4" stroke-linejoin="round"/><circle cx="50" cy="18" r="1.6" fill="${shade(c, 0.6)}"/>`;
    }
    case 'bandana':
      return `<path d="M29 37c0-13 9-20 21-20s21 7 21 20c-6-2-14-3-21-3s-15 1-21 3z" fill="#b8352f" stroke="${LINE}" stroke-width="1.6"/><path d="M70 34l8 4-6 4z" fill="#b8352f" stroke="${LINE}" stroke-width="1.3"/><circle cx="40" cy="26" r="1" fill="#fff" opacity="0.7"/><circle cx="48" cy="23" r="1" fill="#fff" opacity="0.7"/><circle cx="57" cy="25" r="1" fill="#fff" opacity="0.7"/>`;
    case 'headband':
      return `<path d="M30.5 35c12-4 27-4 39 0v5c-12-4-27-4-39 0z" fill="#e8e3d8" stroke="${LINE}" stroke-width="1.3"/>`;
    case 'hood':
      return '';
    default:
      return '';
  }
}

function eyesSvg(look) {
  const iris = EYES[look.eyes];
  const eye = (x) => `<ellipse cx="${x}" cy="47" rx="2.5" ry="3" fill="${shade(iris, 0.75)}"/><circle cx="${x + 0.8}" cy="45.9" r="0.9" fill="#fff"/>`;
  return eye(42) + eye(58);
}

function browsSvg(look, hairC) {
  const c = look.old ? '#9a948c' : shade(hairC, look.hairColor >= 5 && look.hairColor <= 6 ? 0.7 : 0.9);
  const w = look.brows === 'thick' ? 2.8 : 1.9;
  const d = look.brows === 'arched' ? ['M38 41.5q4-3.5 8 0', 'M54 41.5q4-3.5 8 0'] : look.brows === 'thick' ? ['M37.5 41.5l8.5-1.2', 'M54 40.3l8.5 1.2'] : ['M38 41l8-.6', 'M54 40.4l8 .6'];
  return d.map((p) => `<path d="${p}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`).join('');
}

function mouthSvg(m) {
  switch (m) {
    case 'smile':
      return `<path d="M44 59q6 5 12 0" fill="none" stroke="${LINE}" stroke-width="1.8" stroke-linecap="round"/>`;
    case 'grin':
      return `<path d="M43 58.5q7 1 14 0-1.5 6-7 6t-7-6z" fill="#fff" stroke="${LINE}" stroke-width="1.6" stroke-linejoin="round"/>`;
    case 'smirk':
      return `<path d="M44.5 60q5 1.5 10.5-2.5" fill="none" stroke="${LINE}" stroke-width="1.8" stroke-linecap="round"/>`;
    case 'frown':
      return `<path d="M44 61.5q6-4 12 0" fill="none" stroke="${LINE}" stroke-width="1.8" stroke-linecap="round"/>`;
    default:
      return `<path d="M45 60.2h10" fill="none" stroke="${LINE}" stroke-width="1.8" stroke-linecap="round"/>`;
  }
}

function beardSvg(beard, c) {
  switch (beard) {
    case 'full':
      return `<path d="M31 47c0 12 7 22 19 22s19-10 19-22c-3 4-6 6-9 6-3-2-6-3-10-3s-7 1-10 3c-3 0-6-2-9-6z" fill="${c}" stroke="${LINE}" stroke-width="1.4" stroke-linejoin="round"/><path d="M45 59.5q5 2.5 10 0" fill="none" stroke="${LINE}" stroke-width="1.6" stroke-linecap="round"/>`;
    case 'stubble':
      return `<path d="M32 49c1 11 8 19 18 19s17-8 18-19c-3 3-6 5-9 5-3-2-6-3-9-3s-6 1-9 3c-3 0-6-2-9-5z" fill="${c}" opacity="0.28"/>`;
    case 'mustache':
      return `<path d="M42 56.5q8-4 16 0-3 2.5-8 1.2-5 1.3-8-1.2z" fill="${c}" stroke="${LINE}" stroke-width="1.2" stroke-linejoin="round"/>`;
    case 'goatee':
      return `<path d="M44 56.5q6-3 12 0" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/><path d="M46 63q4 6 8 0" fill="${c}" stroke="${LINE}" stroke-width="1.2"/>`;
    default:
      return '';
  }
}

function glassesSvg(g) {
  if (g === 'none') return '';
  if (g === 'shades') return `<path d="M35 43.5h12.5l-1 5.5c-.4 2-2 3-4 3h-3c-2 0-3.6-1-4-3zM52.5 43.5H65l-.5 5.5c-.4 2-2 3-4 3h-3c-2 0-3.6-1-4-3z" fill="#1b2027" stroke="${LINE}" stroke-width="1.2"/><path d="M47.5 45h5" stroke="${LINE}" stroke-width="1.4"/><path d="M37 45l3-1" stroke="#fff" stroke-width="1" opacity="0.5"/>`;
  if (g === 'round') return `<circle cx="42" cy="47" r="5.4" fill="#fff" fill-opacity="0.12" stroke="${LINE}" stroke-width="1.5"/><circle cx="58" cy="47" r="5.4" fill="#fff" fill-opacity="0.12" stroke="${LINE}" stroke-width="1.5"/><path d="M47.4 46.5q2.6-1.5 5.2 0" fill="none" stroke="${LINE}" stroke-width="1.4"/>`;
  return `<rect x="35.5" y="42.5" width="13" height="9" rx="2" fill="#fff" fill-opacity="0.12" stroke="${LINE}" stroke-width="1.5"/><rect x="51.5" y="42.5" width="13" height="9" rx="2" fill="#fff" fill-opacity="0.12" stroke="${LINE}" stroke-width="1.5"/><path d="M48.5 46h3" stroke="${LINE}" stroke-width="1.4"/>`;
}

function markSvg(mark) {
  switch (mark) {
    case 'scar':
      return `<path d="M59 37l5 11" stroke="#c97a6a" stroke-width="1.6" stroke-linecap="round"/><path d="M60.5 40.5l2-1M62 44l2-1" stroke="#c97a6a" stroke-width="1"/>`;
    case 'bandage':
      return `<g transform="rotate(-18 39 56)"><rect x="33" y="53.5" width="12" height="5" rx="1.5" fill="#e9d2b0" stroke="${LINE}" stroke-width="1"/><path d="M37 54.5v3M41 54.5v3" stroke="#c7a982" stroke-width="0.8"/></g>`;
    case 'freckles':
      return `<g fill="#8a5a3a" opacity="0.55"><circle cx="38" cy="53" r="0.8"/><circle cx="41" cy="54.5" r="0.8"/><circle cx="36" cy="55.5" r="0.7"/><circle cx="62" cy="53" r="0.8"/><circle cx="59" cy="54.5" r="0.8"/><circle cx="64" cy="55.5" r="0.7"/></g>`;
    case 'earring':
      return `<circle cx="30.5" cy="54" r="1.9" fill="none" stroke="#e8c04a" stroke-width="1.4"/>`;
    default:
      return '';
  }
}

function outfitSvg(role, shirt) {
  const body = 'M12 101c2-15 15-25 38-25s36 10 38 25z';
  switch (role) {
    case 'bruiser':
      return (
        `<path d="${body}" fill="${shirt}" stroke="${LINE}" stroke-width="1.6"/>` +
        `<path d="M12 101c2-15 15-25 31-25l7 25zM88 101c-2-15-15-25-31-25l-7 25z" fill="${OUTFIT.bruiser}" stroke="${LINE}" stroke-width="1.6" stroke-linejoin="round"/>` +
        `<path d="M43 76l-6 11 8 2M57 76l6 11-8 2" fill="none" stroke="${LINE}" stroke-width="1.4" stroke-linejoin="round"/><path d="M21 92l6 2" stroke="#6b5448" stroke-width="1.2"/>`
      );
    case 'shooter':
      return (
        `<path d="${body}" fill="${shirt}" stroke="${LINE}" stroke-width="1.6"/>` +
        `<path d="M27 101c0-11 3-19 9-23l14 3 14-3c6 4 9 12 9 23z" fill="${OUTFIT.shooter}" stroke="${LINE}" stroke-width="1.6" stroke-linejoin="round"/>` +
        `<rect x="33" y="88" width="10" height="9" rx="1.5" fill="${shade(OUTFIT.shooter, 0.8)}" stroke="${LINE}" stroke-width="1.2"/><rect x="57" y="88" width="10" height="9" rx="1.5" fill="${shade(OUTFIT.shooter, 0.8)}" stroke="${LINE}" stroke-width="1.2"/>`
      );
    case 'medic':
      return (
        `<path d="${body}" fill="${OUTFIT.medic}" stroke="${LINE}" stroke-width="1.6"/>` +
        `<path d="M42 76l8 12 8-12" fill="none" stroke="${LINE}" stroke-width="1.5" stroke-linejoin="round"/>` +
        `<rect x="62" y="86" width="10" height="10" rx="2" fill="#fff" stroke="${LINE}" stroke-width="1.2"/><path d="M67 88v6M64 91h6" stroke="#d6403a" stroke-width="2.2"/>`
      );
    case 'scout':
      return (
        `<path d="${body}" fill="${shirt}" stroke="${LINE}" stroke-width="1.6"/>` +
        `<path d="M30 80c4-6 11-8 20-8s16 2 20 8c-5 3-12 5-20 5s-15-2-20-5z" fill="${shade(shirt, 0.8)}" stroke="${LINE}" stroke-width="1.5"/>` +
        `<path d="M45 84v10M55 84v10" stroke="#e8e3d8" stroke-width="1.5" stroke-linecap="round"/>`
      );
    case 'mechanic':
      return (
        `<path d="${body}" fill="${shirt}" stroke="${LINE}" stroke-width="1.6"/>` +
        `<path d="M33 101V86h34v15z" fill="${OUTFIT.mechanic}" stroke="${LINE}" stroke-width="1.5"/>` +
        `<path d="M36 86l-4-10M64 86l4-10" stroke="${OUTFIT.mechanic}" stroke-width="5" stroke-linecap="round"/><circle cx="38" cy="89" r="1.5" fill="#d9c27a"/><circle cx="62" cy="89" r="1.5" fill="#d9c27a"/>` +
        `<rect x="44" y="90" width="12" height="7" rx="1.5" fill="${shade(OUTFIT.mechanic, 0.8)}" stroke="${LINE}" stroke-width="1.1"/>`
      );
    default:
      return `<path d="${body}" fill="${shirt}" stroke="${LINE}" stroke-width="1.6"/>`;
  }
}

/**
 * A person's portrait. Options: { hurt: true } adds a head bandage.
 * The SVG has class "portrait" and scales to its container.
 */
export function portraitSvg(p, { hurt = false, cls = '' } = {}) {
  const L = p.look;
  const skin = SKIN[L.skin];
  const hair = HAIR_COLORS[L.hairColor];
  const shirt = SHIRTS[L.shirt];
  const role = ROLES[p.role];
  const head = headPath(L.face);
  const hood = L.hat === 'hood' ? `<path d="M24 50c0-22 11-34 26-34s26 12 26 34c0 12-4 22-9 28H33c-5-6-9-16-9-28z" fill="${shade(shirt, 0.85)}" stroke="${LINE}" stroke-width="1.6"/>` : '';
  const old = L.old ? `<path d="M41 32.5q4-1.5 8 0M51 32.5q4-1.5 8 0" fill="none" stroke="${shade(skin, 0.7)}" stroke-width="1" stroke-linecap="round"/><path d="M34 48.5l2.5 1.5M66 48.5l-2.5 1.5" stroke="${shade(skin, 0.7)}" stroke-width="0.9" stroke-linecap="round"/>` : '';
  const bandage = hurt ? `<path d="M29.5 34c13-5 28-5 41 0l-1 7c-12-4-27-4-39 0z" fill="#f2efe8" stroke="${LINE}" stroke-width="1.3"/><circle cx="62" cy="36" r="2.2" fill="#d6403a" opacity="0.8"/>` : '';
  return (
    `<svg class="portrait ${cls}" viewBox="0 0 100 100" aria-hidden="true">` +
    `<rect width="100" height="100" fill="${shade(role.color, 0.32)}"/>` +
    `<circle cx="50" cy="42" r="40" fill="${shade(role.color, 0.45)}"/>` +
    hood +
    hairBack(L.hat === 'hood' ? 'none' : L.hair, hair) +
    `<rect x="43" y="62" width="14" height="16" fill="${shade(skin, 0.86)}"/>` +
    outfitSvg(p.role, shirt) +
    `<g fill="${skin}" stroke="${LINE}" stroke-width="1.6"><ellipse cx="${50 - head.w - 0.5}" cy="48" rx="3.5" ry="5"/><ellipse cx="${50 + head.w + 0.5}" cy="48" rx="3.5" ry="5"/>${head.el}</g>` +
    `<ellipse cx="40" cy="55" rx="3.5" ry="2" fill="#e0726a" opacity="0.18"/><ellipse cx="60" cy="55" rx="3.5" ry="2" fill="#e0726a" opacity="0.18"/>` +
    old +
    beardSvg(L.beard, hair) +
    eyesSvg(L) +
    browsSvg(L, hair) +
    `<path d="M50 48.5q-2.8 5.5 0 6.5" fill="none" stroke="${shade(skin, 0.6)}" stroke-width="1.5" stroke-linecap="round"/>` +
    (L.beard === 'full' ? '' : mouthSvg(L.mouth)) +
    markSvg(L.mark) +
    hairFront(L.hair, hair, L.hat) +
    hatSvg(L.hat, shirt) +
    glassesSvg(L.glasses) +
    bandage +
    `</svg>`
  );
}

/**
 * A small full-body figure for the street (viewBox 0 0 24 44): the same skin, hair,
 * outfit colour and a role prop, so you can tell people apart from afar.
 */
export function figureSvg(p, { hurt = false } = {}) {
  const L = p.look;
  const skin = SKIN[L.skin];
  const hair = HAIR_COLORS[L.hairColor];
  const shirt = SHIRTS[L.shirt];
  const top = OUTFIT[p.role] || shirt;
  const pants = p.role === 'mechanic' ? OUTFIT.mechanic : '#2c3038';
  const long = ['long', 'bob', 'braids'].includes(L.hair) && L.hat !== 'hood';
  const big = L.hair === 'afro';
  let hairTop = '';
  if (L.hat === 'cap' || L.hat === 'beanie' || L.hat === 'bandana') hairTop = `<path d="M7.2 7.5a4.8 4.8 0 0 1 9.6 0z" fill="${L.hat === 'bandana' ? '#b8352f' : shade(shirt, 0.9)}"/>` + (L.hat === 'cap' ? `<path d="M15 7.2h3" stroke="${shade(shirt, 0.7)}" stroke-width="1.4"/>` : '');
  else if (L.hat === 'hood') hairTop = `<path d="M6.6 9a5.4 5.4 0 0 1 10.8 0v3H6.6z" fill="${shade(shirt, 0.85)}"/>`;
  else if (L.hair !== 'bald') hairTop = big ? `<circle cx="12" cy="6.5" r="5.6" fill="${hair}"/>` : `<path d="M7 8.2a5 5 0 0 1 10 0c-1-1.6-3-2.2-5-2.2s-4 .6-5 2.2z" fill="${hair}"/>` + (L.hair === 'mohawk' ? `<path d="M11 3.2h2v2.5h-2z" fill="${hair}"/>` : '') + (L.hair === 'bun' ? `<circle cx="12" cy="2.6" r="1.8" fill="${hair}"/>` : '') + (L.hair === 'pony' ? `<path d="M16.5 8l2 4-1.6.4z" fill="${hair}"/>` : '');
  const back = long ? `<path d="M7.3 8h9.4v8H7.3z" fill="${hair}"/>` : '';
  let prop = '';
  if (p.role === 'medic') prop = `<rect x="14.2" y="17" width="3.6" height="3.6" rx="0.6" fill="#fff"/><path d="M16 17.6v2.4M14.8 18.8h2.4" stroke="#d6403a" stroke-width="0.9"/>`;
  else if (p.role === 'mechanic') prop = `<path d="M18.6 22l2.6 5" stroke="#b9c2cc" stroke-width="1.6" stroke-linecap="round"/><circle cx="21.3" cy="27.3" r="1.2" fill="none" stroke="#b9c2cc" stroke-width="1"/>`;
  else if (p.role === 'shooter') prop = `<path d="M4 14l15 11" stroke="#2b2b2b" stroke-width="1.6" stroke-linecap="round"/>`;
  else if (p.role === 'bruiser') prop = `<path d="M19 18l3 10" stroke="#9a6a3a" stroke-width="2" stroke-linecap="round"/>`;
  else if (p.role === 'scout') prop = `<rect x="3.2" y="15" width="4.6" height="7" rx="1.4" fill="${shade(shirt, 0.7)}" stroke="${LINE}" stroke-width="0.6"/>`;
  return (
    `<svg class="fig" viewBox="0 0 24 44" aria-hidden="true">` +
    `<ellipse cx="12" cy="42.5" rx="6" ry="1.4" fill="#000" opacity="0.35"/>` +
    back +
    `<g class="leg l"><path d="M9.5 29v11" stroke="${pants}" stroke-width="3.2" stroke-linecap="round"/></g>` +
    `<g class="leg r"><path d="M14.5 29v11" stroke="${pants}" stroke-width="3.2" stroke-linecap="round"/></g>` +
    `<g class="body"><path d="M6.5 15.5c0-2 2-3.5 5.5-3.5s5.5 1.5 5.5 3.5V30h-11z" fill="${top}" stroke="${LINE}" stroke-width="0.8"/>` +
    (p.role === 'mechanic' ? `<path d="M8 20h8v10H8z" fill="${OUTFIT.mechanic}"/><path d="M6.5 15.5h11" stroke="${shirt}" stroke-width="2"/>` : '') +
    `<path d="M6.8 16l-2 9M17.2 16l2 9" stroke="${top}" stroke-width="2.6" stroke-linecap="round"/>` +
    `<circle cx="4.7" cy="25.6" r="1.3" fill="${skin}"/><circle cx="19.3" cy="25.6" r="1.3" fill="${skin}"/>` +
    prop +
    `<circle cx="12" cy="8.5" r="4.6" fill="${skin}" stroke="${LINE}" stroke-width="0.8"/>` +
    hairTop +
    (hurt ? `<path d="M7.6 7.4h8.8v2.2H7.6z" fill="#f2efe8"/>` : '') +
    `</g></svg>`
  );
}
