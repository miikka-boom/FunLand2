// Inline SVG icons (24x24), multi-colour so they read at small sizes.
// Shared with Road to Evac, plus Hope Street's roles, run tags, beds and the gate.

const S = (body, vb = '0 0 24 24') => `<svg class="ico" viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const L = '#1b140f';

export const ICONS = {
  food: S(
    `<rect x="5" y="5" width="14" height="15" rx="2" fill="#c9cdd2" stroke="${L}" stroke-width="1.5"/>` +
      `<rect x="5" y="8.5" width="14" height="8" fill="#e8862d" stroke="${L}" stroke-width="1.2"/>` +
      `<path d="M8 12.5h8" stroke="#ffd36b" stroke-width="2" stroke-linecap="round"/>` +
      `<ellipse cx="12" cy="5.2" rx="7" ry="1.9" fill="#e4e7ea" stroke="${L}" stroke-width="1.2"/>`,
  ),
  wood: S(
    `<rect x="3" y="11" width="15" height="7" rx="3.5" fill="#9a6436" stroke="${L}" stroke-width="1.4"/>` +
      `<circle cx="18" cy="14.5" r="3.5" fill="#e2b47a" stroke="${L}" stroke-width="1.4"/><circle cx="18" cy="14.5" r="1.4" fill="none" stroke="#9a6436" stroke-width="1"/>` +
      `<rect x="6" y="5" width="13" height="6.5" rx="3.2" fill="#b07440" stroke="${L}" stroke-width="1.4"/>` +
      `<circle cx="19" cy="8.2" r="3.2" fill="#ecc28a" stroke="${L}" stroke-width="1.4"/><circle cx="19" cy="8.2" r="1.2" fill="none" stroke="#9a6436" stroke-width="1"/>`,
  ),
  scrap: S(
    `<path d="M12 2.8l1.7 2.3 2.8-.6.6 2.8 2.6 1.2-1 2.7 1.6 2.3-2.4 1.5-.1 2.9-2.8-.3-1.6 2.4-2.1-1.9-2.6 1.1-1-2.7-2.8-.6.6-2.8-2-2 2.1-1.9-.5-2.8 2.8-.4 1-2.7 2.6 1.2z" fill="#a9b6c1" stroke="${L}" stroke-width="1.3" stroke-linejoin="round"/>` +
      `<circle cx="12" cy="12" r="3.4" fill="#5d6873" stroke="${L}" stroke-width="1.3"/>`,
  ),
  gems: S(
    `<path d="M7 4h10l4 5-9 12L3 9z" fill="#3fd0f5" stroke="${L}" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<path d="M3 9h18M7 4l2.5 5L12 21M17 4l-2.5 5L12 21M9.5 9L12 4l2.5 5" fill="none" stroke="#0b6f8c" stroke-width="1" stroke-linejoin="round"/>` +
      `<path d="M7.5 5.5l1.6 2.6" stroke="#dffbff" stroke-width="1.4" stroke-linecap="round"/>`,
  ),
  survivor: S(
    `<circle cx="12" cy="7.5" r="4" fill="#e0b08a" stroke="${L}" stroke-width="1.4"/>` +
      `<path d="M4.5 21c0-4.6 3.4-7.5 7.5-7.5s7.5 2.9 7.5 7.5z" fill="#5f8fb0" stroke="${L}" stroke-width="1.4" stroke-linejoin="round"/>`,
  ),
  hammer: S(
    `<path d="M13.5 9.5l-9 9 2 2 9-9z" fill="#b07a45" stroke="${L}" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<path d="M10.5 4.5l4-1.5 6.5 6.5-2.5 2.5-2-2-2 2-3-3 2-2z" fill="#9aa6b1" stroke="${L}" stroke-width="1.4" stroke-linejoin="round"/>`,
  ),
  clock: S(`<circle cx="12" cy="12" r="8.5" fill="#e9edf1" stroke="${L}" stroke-width="1.5"/><path d="M12 7v5l3.5 2" fill="none" stroke="${L}" stroke-width="1.8" stroke-linecap="round"/>`),
  lock: S(
    `<path d="M8 10V7.5a4 4 0 0 1 8 0V10" fill="none" stroke="#c8ccd0" stroke-width="2.4"/>` +
      `<rect x="5" y="10" width="14" height="10" rx="2" fill="#e0a83a" stroke="${L}" stroke-width="1.4"/><circle cx="12" cy="14.5" r="1.6" fill="${L}"/>`,
  ),
  crate: S(
    `<rect x="3.5" y="6" width="17" height="14" rx="1.5" fill="#b07a45" stroke="${L}" stroke-width="1.5"/>` +
      `<path d="M3.5 10.5h17M3.5 15.5h17" stroke="#7d5230" stroke-width="1.3"/>` +
      `<rect x="10" y="6" width="4" height="14" fill="#e0a83a" stroke="${L}" stroke-width="1.2"/>`,
  ),
  airdrop: S(
    `<path d="M3 10a9 7 0 0 1 18 0c-1.5-1.3-3-1.3-4.5 0-1.5-1.3-3-1.3-4.5 0-1.5-1.3-3-1.3-4.5 0C6 8.7 4.5 8.7 3 10z" fill="#e65a3f" stroke="${L}" stroke-width="1.3" stroke-linejoin="round"/>` +
      `<path d="M3.5 10l5.5 6M20.5 10L15 16M12 10v6" stroke="#e9edf1" stroke-width="1"/>` +
      `<rect x="8" y="15.5" width="8" height="6" rx="1" fill="#6f8a4a" stroke="${L}" stroke-width="1.3"/><path d="M8 18.5h8" stroke="#4c6331" stroke-width="1"/>`,
  ),
  play: S(`<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="${L}" stroke-width="1.2" stroke-linejoin="round"/>`),
  power: S(
    `<path d="M12 2.5l7.5 3v6c0 4.7-3.2 8.4-7.5 10-4.3-1.6-7.5-5.3-7.5-10v-6z" fill="#ff8a4a" stroke="${L}" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<path d="M13 6l-4 7h3l-1 5 4.5-7.5h-3z" fill="#fff3c4" stroke="${L}" stroke-width="1" stroke-linejoin="round"/>`,
  ),
  hp: S(`<path d="M12 20.5S3.5 15 3.5 9a4.5 4.5 0 0 1 8.5-2.2A4.5 4.5 0 0 1 20.5 9c0 6-8.5 11.5-8.5 11.5z" fill="#e8504a" stroke="${L}" stroke-width="1.4" stroke-linejoin="round"/>`),
  dmg: S(
    `<circle cx="12" cy="12" r="7.5" fill="none" stroke="#ffb347" stroke-width="2"/><circle cx="12" cy="12" r="2.2" fill="#ffb347"/>` +
      `<path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5" stroke="#ffb347" stroke-width="2" stroke-linecap="round"/>`,
  ),
  medkit: S(
    `<rect x="3.5" y="7" width="17" height="13" rx="2" fill="#f1f1ea" stroke="${L}" stroke-width="1.4"/><path d="M9 7V5h6v2" fill="none" stroke="${L}" stroke-width="1.4"/>` +
      `<path d="M12 10v7M8.5 13.5h7" stroke="#e0463c" stroke-width="2.6"/>`,
  ),
  pipebomb: S(
    `<rect x="4" y="9" width="13" height="8" rx="1.5" fill="#8c979f" stroke="${L}" stroke-width="1.4"/><path d="M8 9v8M13 9v8" stroke="#5d6873" stroke-width="1.2"/>` +
      `<path d="M17 13c2 0 2.5-2 4-3" fill="none" stroke="#c9a36a" stroke-width="1.4"/><circle cx="21" cy="9.5" r="1.4" fill="#ffd36b"/><circle cx="7" cy="6" r="1.6" fill="#e0463c" stroke="${L}" stroke-width="1"/>`,
  ),
  molotov: S(
    `<path d="M10 9h4v2.5l2 2.5v6.5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 20.5V14l2-2.5z" fill="#6aa36a" stroke="${L}" stroke-width="1.3" stroke-linejoin="round"/>` +
      `<path d="M8 16h8" stroke="#3f6b3f" stroke-width="1.2"/><path d="M12 9c-2-2-1-4 0-6 .6 1.6 2.5 2.4 1.6 4.4" fill="#ffb347" stroke="${L}" stroke-width="1" stroke-linejoin="round"/>`,
  ),
  truck: S(
    `<path d="M2.5 15.5V9h10v6.5zM12.5 11h4.5l3 3v1.5h-7.5z" fill="#d06a3a" stroke="${L}" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<path d="M13.5 11.8h3l1.6 1.7h-4.6z" fill="#bfe4f2"/><circle cx="6.5" cy="16.5" r="2.2" fill="#2b2f33" stroke="${L}" stroke-width="1.2"/><circle cx="16.5" cy="16.5" r="2.2" fill="#2b2f33" stroke="${L}" stroke-width="1.2"/>`,
  ),
  radio: S(
    `<path d="M12 6l-4.5 15M12 6l4.5 15M9 15h6M10 11h4" fill="none" stroke="#a9b6c1" stroke-width="1.6"/>` +
      `<circle cx="12" cy="4.5" r="2" fill="#ff5a4a" stroke="${L}" stroke-width="1.2"/><path d="M6.5 2.5a8 8 0 0 0 0 4.5M17.5 2.5a8 8 0 0 1 0 4.5" fill="none" stroke="#ffd36b" stroke-width="1.3" stroke-linecap="round"/>`,
  ),
  star: S(`<path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" fill="#ffd36b" stroke="${L}" stroke-width="1.3" stroke-linejoin="round"/>`),
  check: S(`<path d="M4.5 12.5l5 5 10-11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`),
  close: S(`<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`),
  gear: S(
    `<path d="M10.3 2.5h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9-2.6-.5v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>` +
      `<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
  ),
  skull: S(
    `<path d="M12 3a7.5 7.5 0 0 0-7.5 7.5c0 2.6 1.3 4.2 2.5 5v3h10v-3c1.2-.8 2.5-2.4 2.5-5A7.5 7.5 0 0 0 12 3z" fill="#e9e4d6" stroke="${L}" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<circle cx="9" cy="11" r="2" fill="${L}"/><circle cx="15" cy="11" r="2" fill="${L}"/><path d="M10 18.5v-2M12 18.5v-2M14 18.5v-2" stroke="${L}" stroke-width="1.2"/>`,
  ),
  trophy: S(
    `<path d="M7 3.5h10v5a5 5 0 0 1-10 0z" fill="#ffd36b" stroke="${L}" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<path d="M7 5H4.5a3 3 0 0 0 3 4.5M17 5h2.5a3 3 0 0 1-3 4.5" fill="none" stroke="${L}" stroke-width="1.4"/><path d="M10.5 13.5h3v3.5h-3zM8 17h8v3.5H8z" fill="#d9a836" stroke="${L}" stroke-width="1.3"/>`,
  ),
  arrow: S(`<path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`),
  tent: S(
    `<path d="M2.5 19.5L12 4l9.5 15.5z" fill="#8f8466" stroke="${L}" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<path d="M12 4v15.5M9 19.5L12 12l3 7.5z" fill="#2c2620" stroke="${L}" stroke-width="1.2" stroke-linejoin="round"/>` +
      `<path d="M12 4V1.5l3 1.2-3 1.2" fill="#ff6b4a" stroke="${L}" stroke-width=".8"/>`,
  ),
  map: S(
    `<path d="M3 6l5.5-2 7 2.5L21 4.5v13.5l-5.5 2-7-2.5L3 19.5z" fill="#d8c99a" stroke="${L}" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<path d="M8.5 4v13.5M15.5 6.5V20" stroke="#a8996a" stroke-width="1.2"/><path d="M6 10.5l3 2 3.5-3 3 2.5 3-2" fill="none" stroke="#e0463c" stroke-width="1.4" stroke-dasharray="1.6 1.4"/>`,
  ),
  smg: S(`<path d="M3 9h13l2 1.5h3v2.5h-5l-1.5 1.5h-3l-.8 4h-2.6l.5-4H6l-1 2H3z" fill="#8c979f" stroke="${L}" stroke-width="1.2" stroke-linejoin="round"/>`),
  shotgun: S(`<path d="M2 10.5h15.5v2.2H12l-1 1.5H8.2l-2 3.8H3.4l1.8-4.3H2z" fill="#a07448" stroke="${L}" stroke-width="1.2" stroke-linejoin="round"/><path d="M17.5 10.5h4.5v1.4h-4.5z" fill="#8c979f" stroke="${L}" stroke-width="1"/>`),
  rifle: S(`<path d="M2 10h14l1.5-1h4.5v2h-4l-1 1.5h-3.5l-.6 4.5h-2.3l.4-4.5H7.2L5.5 16H3l1.5-4H2z" fill="#6f7a82" stroke="${L}" stroke-width="1.2" stroke-linejoin="round"/><path d="M9 7.5h4v2.5H9z" fill="#4d575e" stroke="${L}" stroke-width="1"/>`),
  hunting: S(`<path d="M1.5 11.5h16l4.5-.8v1.6l-4.5.8H9.5l-2 3.7H4.8l1.5-3.7H1.5z" fill="#8a5d36" stroke="${L}" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 8h6.5v2.2H8z" fill="#3b4248" stroke="${L}" stroke-width="1"/>`),
  info: S(`<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 10.5v6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="7.3" r="1.3" fill="currentColor"/>`),
  bolt: S(`<path d="M13.5 2.5L5 13.5h5.5l-1 8 8.5-11h-5.5z" fill="#ffd36b" stroke="${L}" stroke-width="1.3" stroke-linejoin="round"/>`),
  supplies: S(
    `<path d="M7 8V6a5 5 0 0 1 10 0v2" fill="none" stroke="${L}" stroke-width="1.6"/>` +
      `<rect x="4" y="7.5" width="16" height="13.5" rx="4" fill="#8a9a52" stroke="${L}" stroke-width="1.5"/>` +
      `<rect x="7.5" y="13" width="9" height="6" rx="1.6" fill="#6f7d40" stroke="${L}" stroke-width="1.2"/><path d="M12 13v2" stroke="${L}" stroke-width="1.2"/>` +
      `<path d="M6.5 10.5h11" stroke="#b9c47a" stroke-width="1.2" stroke-linecap="round"/>`,
  ),
  up: S(`<path d="M12 3.5l7.5 8h-4.5v9h-6v-9H4.5z" fill="#7dffa1" stroke="${L}" stroke-width="1.4" stroke-linejoin="round"/>`),
  horde: S(
    `<circle cx="7" cy="8" r="2.6" fill="#7a8f6a" stroke="${L}" stroke-width="1"/><circle cx="17" cy="8" r="2.6" fill="#7a8f6a" stroke="${L}" stroke-width="1"/><circle cx="12" cy="6.5" r="2.8" fill="#8a9f78" stroke="${L}" stroke-width="1"/>` +
      `<path d="M3 20c0-4 2-7 4-7s4 3 4 7zM13 20c0-4 2-7 4-7s4 3 4 7z" fill="#5a6a4a" stroke="${L}" stroke-width="1"/><path d="M7.5 20c0-5 2-8.5 4.5-8.5s4.5 3.5 4.5 8.5z" fill="#6a7a58" stroke="${L}" stroke-width="1"/>`,
  ),
  squad: S(
    `<circle cx="8" cy="8.5" r="3" fill="#e0b08a" stroke="${L}" stroke-width="1.1"/><circle cx="16" cy="8.5" r="3" fill="#c68e64" stroke="${L}" stroke-width="1.1"/>` +
      `<path d="M2.5 20c0-4 2.5-6.5 5.5-6.5s5.5 2.5 5.5 6.5z" fill="#e07a3a" stroke="${L}" stroke-width="1.1"/><path d="M10.5 20c0-4 2.5-6.5 5.5-6.5s5.5 2.5 5.5 6.5z" fill="#e8e8e0" stroke="${L}" stroke-width="1.1"/>`,
  ),
  starEmpty: S(`<path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.35)" stroke-width="1.3" stroke-linejoin="round"/>`),
  flag: S(`<path d="M6 21V3" stroke="${L}" stroke-width="2" stroke-linecap="round"/><path d="M6 4h12l-3 4 3 4H6z" fill="#7dffa1" stroke="${L}" stroke-width="1.3" stroke-linejoin="round"/>`),
  heli: S(
    `<path d="M2 5h20" stroke="${L}" stroke-width="2" stroke-linecap="round"/><path d="M12 5v3" stroke="${L}" stroke-width="2"/>` +
      `<path d="M4 12q1-4 8-4t7 5v3q-3 2-9 2t-6-3z" fill="#6f8a4a" stroke="${L}" stroke-width="1.3"/><path d="M19 12l4 1v2l-4 1" fill="#6f8a4a" stroke="${L}" stroke-width="1.2"/><path d="M6 20h12" stroke="${L}" stroke-width="1.6" stroke-linecap="round"/>`,
  ),
  bed: S(
    `<path d="M3 18V8" stroke="${L}" stroke-width="2" stroke-linecap="round"/><path d="M21 18v-4" stroke="${L}" stroke-width="2" stroke-linecap="round"/>` +
      `<rect x="3" y="12" width="18" height="4" rx="1" fill="#6f8fb8" stroke="${L}" stroke-width="1.3"/><rect x="4.5" y="9" width="5" height="3.2" rx="1.2" fill="#eef1f4" stroke="${L}" stroke-width="1.2"/>`,
  ),
  people: S(
    `<circle cx="8" cy="8.5" r="3.2" fill="#e0b08a" stroke="${L}" stroke-width="1.3"/><path d="M2.5 19c0-3.6 2.4-6 5.5-6s5.5 2.4 5.5 6z" fill="#5f8fb0" stroke="${L}" stroke-width="1.3" stroke-linejoin="round"/>` +
      `<circle cx="16" cy="7.5" r="3.2" fill="#c98e64" stroke="${L}" stroke-width="1.3"/><path d="M10.5 18.5c0-3.6 2.4-6 5.5-6s5.5 2.4 5.5 6z" fill="#e8774a" stroke="${L}" stroke-width="1.3" stroke-linejoin="round"/>`,
  ),
  gate: S(
    `<path d="M3 21V7l9-4 9 4v14" fill="#3b4250" stroke="${L}" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<path d="M6 21v-9h12v9" fill="#9a6a3a" stroke="${L}" stroke-width="1.3"/><path d="M12 12v9M6 15h12M6 18h12" stroke="${L}" stroke-width="1"/><circle cx="12" cy="8" r="1.4" fill="#ffd36b"/>`,
  ),
  fist: S(
    `<path d="M6 10.5c0-2 1.2-3 2.6-3h7.2c1.6 0 2.7 1.2 2.7 3v4.3c0 3.5-2.3 5.7-5.6 5.7h-1.6c-3 0-5.3-2-5.3-5.2z" fill="#e8774a" stroke="${L}" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<path d="M9.5 7.5v4M12.5 7.5v4M15.5 7.5v4M6 13.5c2 0 4 .4 5 2" fill="none" stroke="${L}" stroke-width="1.2" stroke-linecap="round"/>`,
  ),
  target: S(`<circle cx="12" cy="12" r="8.5" fill="#e9c04f" stroke="${L}" stroke-width="1.4"/><circle cx="12" cy="12" r="5" fill="#fff4cf" stroke="${L}" stroke-width="1.2"/><circle cx="12" cy="12" r="1.8" fill="${L}"/>`),
  cross: S(`<rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="#5ccf8c" stroke="${L}" stroke-width="1.4"/><path d="M12 7v10M7 12h10" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>`),
  boot: S(
    `<path d="M7 3.5h6v8.5l5.2 2.2c1.6.7 2.3 1.9 2.3 3.3v2H4.8l.7-3.2.5-7z" fill="#5aaeea" stroke="${L}" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<path d="M4.8 19.5h15.7M8 7h3M8 10h3" stroke="${L}" stroke-width="1.2" stroke-linecap="round"/>`,
  ),
  wrench: S(`<path d="M14.5 3.2a5 5 0 0 0-4.8 6.6l-6.3 6.3a2 2 0 0 0 2.8 2.8l6.3-6.3a5 5 0 0 0 6.6-4.8l-3 3-3-.6-.6-3z" fill="#b996f2" stroke="${L}" stroke-width="1.4" stroke-linejoin="round"/>`),
  door: S(`<rect x="5" y="3" width="14" height="18" rx="1.5" fill="#8a6038" stroke="${L}" stroke-width="1.4"/><rect x="8" y="6" width="8" height="5" fill="#6d4b2c" stroke="${L}" stroke-width="1"/><circle cx="15.5" cy="13.5" r="1.2" fill="#ffd36b"/>`),
  biohazard: S(
    `<circle cx="12" cy="12" r="9" fill="#5ccf8c" stroke="${L}" stroke-width="1.4"/>` +
      `<path d="M12 7.2a2.6 2.6 0 1 1 0 .01zM7.8 14.7a2.6 2.6 0 1 1 .01 0zM16.2 14.7a2.6 2.6 0 1 1 .01 0z" fill="${L}"/><circle cx="12" cy="12" r="1.8" fill="#5ccf8c" stroke="${L}" stroke-width="1"/>`,
  ),
  moon: S(`<path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.4 7 7 0 0 1-5-13.4z" fill="#ffe7a3" stroke="${L}" stroke-width="1.4" stroke-linejoin="round"/>`),
  cog: S(
    `<path d="M10.3 2.8h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9-2.6-.5v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8z" fill="#b996f2" stroke="${L}" stroke-width="1.3" stroke-linejoin="round"/>` +
      `<circle cx="12" cy="12" r="3.2" fill="#3b2f52" stroke="${L}" stroke-width="1.2"/>`,
  ),
  crown: S(`<path d="M3.5 17.5L2.5 7l5 4 4.5-6.5 4.5 6.5 5-4-1 10.5z" fill="#ffd36b" stroke="${L}" stroke-width="1.4" stroke-linejoin="round"/><path d="M4 20h16" stroke="${L}" stroke-width="1.8" stroke-linecap="round"/>`),
  bandage: S(`<g transform="rotate(-40 12 12)"><rect x="2.5" y="8.5" width="19" height="7" rx="3.5" fill="#e9d2b0" stroke="${L}" stroke-width="1.4"/><rect x="9" y="8.5" width="6" height="7" fill="#f4e6cf" stroke="${L}" stroke-width="1"/><circle cx="11" cy="11" r=".7" fill="#c7a982"/><circle cx="13" cy="13" r=".7" fill="#c7a982"/></g>`),
  heart: S(`<path d="M12 20.5S3.5 15 3.5 9a4.5 4.5 0 0 1 8.5-2.2A4.5 4.5 0 0 1 20.5 9c0 6-8.5 11.5-8.5 11.5z" fill="#ff7b8a" stroke="${L}" stroke-width="1.4" stroke-linejoin="round"/>`),
  xp: S(`<path d="M4 15l8-7 8 7" fill="none" stroke="#62e6ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20l8-7 8 7" fill="none" stroke="#62e6ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>`),
  swap: S(`<path d="M5 8h12l-3-3M19 16H7l3 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`),
  bye: S(`<path d="M7 12h12M11 7l-5 5 5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`),
};

export function icon(name, cls = '') {
  const svg = ICONS[name] || ICONS.info;
  return cls ? svg.replace('class="ico"', `class="ico ${cls}"`) : svg;
}
