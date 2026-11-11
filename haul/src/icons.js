// Long Haul: the small icons of the interface, as inline SVG strings on a
// 24 x 24 grid. Same hand as the rest of the art: one dark outline, flat fills.

import { OL } from './figures.js';

const S = `stroke="${OL}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;

const BODIES = {
  /** A tin of something: the one currency. */
  supplies:
    `<ellipse cx="12" cy="18.5" rx="7.5" ry="3" fill="#8d97ab" ${S}/>` +
    `<path d="M4.5,6.5 V18.5 A7.5,3 0 0 0 19.5,18.5 V6.5" fill="#d9483b" ${S}/>` +
    `<path d="M4.5,10 A7.5,3 0 0 0 19.5,10 V15 A7.5,3 0 0 1 4.5,15 Z" fill="#f4f1ea" ${S}/>` +
    `<circle cx="12" cy="14.6" r="2.3" fill="#d9483b"/>` +
    `<ellipse cx="12" cy="6.5" rx="7.5" ry="3" fill="#c9d0de" ${S}/>` +
    `<ellipse cx="12" cy="6.5" rx="4" ry="1.3" fill="none" stroke="${OL}" stroke-width="1.2" opacity="0.5"/>`,
  star: `<path d="M12,2.2 L15,8.6 L22,9.5 L16.8,14.3 L18.2,21.3 L12,17.8 L5.8,21.3 L7.2,14.3 L2,9.5 L9,8.6 Z" fill="#ffd23a" ${S}/><path d="M12,5.4 L13.9,9.7 L18,10.3" fill="none" stroke="#fff6c8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  starOff: `<path d="M12,2.2 L15,8.6 L22,9.5 L16.8,14.3 L18.2,21.3 L12,17.8 L5.8,21.3 L7.2,14.3 L2,9.5 L9,8.6 Z" fill="#1b1730" fill-opacity="0.28" stroke="${OL}" stroke-width="2" stroke-linejoin="round" stroke-opacity="0.55"/>`,
  /** Danger: a drowser's face, eyes wide open. */
  danger:
    `<path d="M4,11 Q4,2.5 12,2.5 Q20,2.5 20,11 Q20,15.5 17,17 V20.5 H7 V17 Q4,15.5 4,11 Z" fill="#b7d6ad" ${S}/>` +
    `<circle cx="8.6" cy="11" r="2.7" fill="#1b1730"/><circle cx="15.4" cy="11" r="2.7" fill="#1b1730"/>` +
    `<circle cx="9.3" cy="10.3" r="0.9" fill="#fff"/><circle cx="16.1" cy="10.3" r="0.9" fill="#fff"/>` +
    `<path d="M10,20.5 V17.5 M12,20.5 V17.5 M14,20.5 V17.5" stroke="${OL}" stroke-width="1.5"/>` +
    `<path d="M5.6,7.6 l3.4,1.2 M18.4,7.6 l-3.4,1.2" stroke="${OL}" stroke-width="1.8" stroke-linecap="round"/>`,
  /** Power: a fist. */
  power:
    `<path d="M5,10.5 Q5,6 8,6 Q9,3.8 11.4,5 Q13.2,3.4 15,5.2 Q17.6,4.6 18.2,7.6 Q20.4,8.6 19.6,12 L18.6,17 Q18,20.5 14,20.5 H10 Q6,20.5 5.6,16.5 Z" fill="#ffb347" ${S}/>` +
    `<path d="M8.4,6.4 V11 M11.6,5.4 V10.6 M14.8,5.6 V10.8" stroke="${OL}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="M5.4,12.2 Q9,10.6 12.6,12.4 Q14.4,13.4 13.4,15.6" fill="none" stroke="${OL}" stroke-width="1.8" stroke-linecap="round"/>`,
  radio:
    `<path d="M15.5,8 V2.5" stroke="${OL}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<rect x="6" y="7" width="12" height="15" rx="3" fill="#3f8f6f" ${S}/>` +
    `<rect x="8.2" y="9.4" width="7.6" height="4.4" rx="1" fill="#15121f"/>` +
    `<path d="M9,16.4 h6 M9,19 h6" stroke="#15121f" stroke-width="1.5" stroke-linecap="round"/>` +
    `<circle cx="10" cy="11.6" r="1" fill="#8fe3d0"/>`,
  /** A token: what a survivor levels up on. */
  token: `<circle cx="12" cy="12" r="9.5" fill="#f0b429" ${S}/><circle cx="12" cy="12" r="6" fill="#ffe08a" stroke="${OL}" stroke-width="1.4"/><path d="M12,8 L13.2,10.7 L16,11 L13.9,12.9 L14.5,15.8 L12,14.3 L9.5,15.8 L10.1,12.9 L8,11 L10.8,10.7 Z" fill="#f0b429"/>`,
  gear: `<path d="M10.2,2.5 h3.6 l0.6,2.7 l2,0.9 l2.4,-1.5 l2.5,2.5 l-1.5,2.4 l0.9,2 l2.7,0.6 v3.6 l-2.7,0.6 l-0.9,2 l1.5,2.4 l-2.5,2.5 l-2.4,-1.5 l-2,0.9 l-0.6,2.7 h-3.6 l-0.6,-2.7 l-2,-0.9 l-2.4,1.5 l-2.5,-2.5 l1.5,-2.4 l-0.9,-2 l-2.7,-0.6 v-3.6 l2.7,-0.6 l0.9,-2 l-1.5,-2.4 l2.5,-2.5 l2.4,1.5 l2,-0.9 z" transform="translate(12 12) scale(0.86) translate(-12 -13.7)" fill="#c9d0de" ${S}/><circle cx="12" cy="12" r="3.2" fill="#f4f1ea" ${S}/>`,
  play: `<path d="M7,4.2 L20,12 L7,19.8 Z" fill="#fff" ${S}/>`,
  lock: `<path d="M7.5,11 V8 a4.5,4.5 0 0 1 9,0 V11" fill="none" stroke="${OL}" stroke-width="2.6" stroke-linecap="round"/><rect x="5" y="10.5" width="14" height="10.5" rx="3" fill="#c9d0de" ${S}/><circle cx="12" cy="15.6" r="1.8" fill="${OL}"/>`,
  up: `<path d="M12,3 L20,12 H15.4 V20.5 H8.6 V12 H4 Z" fill="#5fe06a" ${S}/>`,
  check: `<path d="M4.5,12.5 L10,18 L20,6.5" fill="none" stroke="${OL}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5,12.5 L10,18 L20,6.5" fill="none" stroke="#5fe06a" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  close: `<path d="M6,6 L18,18 M18,6 L6,18" stroke="${OL}" stroke-width="3.4" stroke-linecap="round"/>`,
  /** Everyone in the camp. */
  people:
    `<circle cx="16.5" cy="8" r="3.6" fill="#f2c4a0" ${S}/><path d="M10.5,20.5 Q10.5,13 16.5,13 Q22.5,13 22.5,20.5 Z" fill="#4a8fe8" ${S}/>` +
    `<circle cx="8.5" cy="9" r="4.2" fill="#8d5a3b" ${S}/><path d="M1.5,21.5 Q1.5,14 8.5,14 Q15.5,14 15.5,21.5 Z" fill="#e8643f" ${S}/>`,
  /** The road: a signpost. */
  road: `<path d="M11,3 V21.5" stroke="${OL}" stroke-width="3" stroke-linecap="round"/><path d="M4,5 H17 L21,8.2 L17,11.5 H4 Z" fill="#5fc08a" ${S}/><path d="M19,13 H8 L4.5,15.8 L8,18.5 H19 Z" fill="#f1e6c8" ${S}/>`,
  clock: `<circle cx="12" cy="12" r="9.5" fill="#f4f1ea" ${S}/><path d="M12,6.5 V12 L15.6,14.2" fill="none" stroke="${OL}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  swap: `<path d="M4,8.5 H17 M13.5,4.5 L17.5,8.5 L13.5,12.5 M20,15.5 H7 M10.5,11.5 L6.5,15.5 L10.5,19.5" fill="none" stroke="${OL}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  crate:
    `<rect x="3" y="6" width="18" height="14" rx="2.5" fill="#7d8a4f" ${S}/><path d="M3,10.6 H21 M3,15.4 H21" stroke="${OL}" stroke-width="1.4" opacity="0.6"/>` +
    `<path d="M12,9 L13,11.4 L15.6,11.6 L13.6,13.3 L14.2,15.9 L12,14.5 L9.8,15.9 L10.4,13.3 L8.4,11.6 L11,11.4 Z" fill="#f4f1ea"/>`,
  sound: `<path d="M3.5,9.5 H7.5 L12.5,5 V19 L7.5,14.5 H3.5 Z" fill="#f4f1ea" ${S}/><path d="M15.5,9 Q18,12 15.5,15 M18,6.5 Q22,12 18,17.5" fill="none" stroke="${OL}" stroke-width="2" stroke-linecap="round"/>`,
  /** The hand that points the way in the first session. */
  hand: `<path d="M9.2,12.5 V4.6 a1.9,1.9 0 0 1 3.8,0 V10 l5.4,1.1 a2.4,2.4 0 0 1 1.9,2.7 l-0.8,5 a3.4,3.4 0 0 1 -3.4,2.9 H11.6 a3.4,3.4 0 0 1 -2.7,-1.3 L4.6,15 a1.7,1.7 0 0 1 2.5,-2.3 Z" fill="#fff" ${S}/>`,
};

/** `<svg class="ic ic-name">`, sized by the stylesheet (1em square by default). */
export function icon(name, cls = '') {
  const body = BODIES[name];
  if (!body) return '';
  return `<svg class="ic ic-${name}${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

export const ICON_NAMES = Object.keys(BODIES);
