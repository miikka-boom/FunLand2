// Head-and-shoulders portraits (64x64) for the survivors, the player, friends
// and the generic bot. Each one sits on its own soft background disc in the
// character's accent colour; the UI clips them to a circle, so the face stays
// centred (top of the head ~y8, shoulders filling the bottom).

const O = '#15110d';
const NS = ' stroke="none"';

/** Accent colour per character, for portrait frames and name tags. */
export const PORTRAIT_COLORS = {
  nadia: '#4fb8d8',
  theo: '#7bc55a',
  grace: '#c2a25a',
  lukas: '#d9534f',
  mei: '#f2c94c',
  you: '#ff8a2a',
  bot: '#8c99a6',
  friend_rookie: '#5b8dff',
  friend_veteran: '#3d6fd9',
};

const P = (d, fill, ex = '') => `<path d="${d}" fill="${fill}"${ex}/>`;
const C = (cx, cy, r, fill, ex = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${ex}/>`;
const E = (cx, cy, rx, ry, fill, ex = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${ex}/>`;
const S = (d, color, w = 1.5, ex = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}"${ex}/>`;
const dots = (pts, color, size) => `<path d="${pts.map(([x, y]) => `M${x} ${y}h0`).join('')}" stroke="${color}" stroke-width="${size}"/>`;

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

// --- Shared anatomy ----------------------------------------------------------------------------

const BUST = 'M4 64c.6-8.6 6-14.4 14.6-16.4 3.4-.8 7.6-1.4 13.4-1.4s10 .6 13.4 1.4C54 49.6 59.4 55.4 60 64z';
const WIDE = 'M1 64c.8-9.4 6.6-15.2 16-17.2 3.8-.8 8.6-1.4 15-1.4s11.2.6 15 1.4c9.4 2 15.2 7.8 16 17.2z';

const neck = (shade) => P('M26.4 36h11.2v10.4c-1.6 1.8-3.6 2.6-5.6 2.6s-4-.8-5.6-2.6z', shade);
const head = (skin) => E(21.2, 29.6, 2.6, 3.6, skin) + E(42.8, 29.6, 2.6, 3.6, skin) + E(32, 28, 11, 13.2, skin);
const nose = (shade) => S('M32.6 30.4c.5 1.7.5 2.9-1 3.4', shade, 1.2);
const blush = (c) => E(25.4, 33.4, 2.4, 1.3, c, NS + ' opacity=".35"') + E(38.6, 33.4, 2.4, 1.3, c, NS + ' opacity=".35"');

function eyes(ry = 1.75, col = '#271a14', y = 29.2) {
  return E(27.4, y, 1.4, ry, col, NS) + E(36.6, y, 1.4, ry, col, NS) + dots([[27.9, y - 0.6], [37.1, y - 0.6]], '#fff', 0.9);
}

const MOUTH = {
  smile: 'M28.6 35.6c2 1.6 4.8 1.6 6.8 0',
  grin: 'M28.2 35.2c2.2 2.4 5.4 2.4 7.6 0',
  flat: 'M29 36.2h6',
  calm: 'M29 36c1.8.9 4.2.9 6 0',
};
const mouth = (kind, col = '#5a2a22', w = 1.4) => S(MOUTH[kind], col, w);

// --- Characters --------------------------------------------------------------------------------

const DRAW = {
  // Paramedic: navy EMT jacket with a reflective stripe, stethoscope, hair up in a bun.
  nadia() {
    const skin = '#a86b48';
    const shade = '#8a5537';
    const hair = '#2a1a14';
    return (
      C(32, 10.4, 6.2, hair) +
      S('M27.4 13.6c2.8-1.4 6.4-1.4 9.2 0', '#b5523b', 1.8) +
      neck(shade) +
      P(BUST, '#24365a') +
      P('M23 47.4l9 7.6 9-7.6-2.8-1.6L32 50.4l-6.2-4.6z', '#2f4670') +
      P('M6.4 55.6h51.2l1 3.8H5.4z', '#c9d4da', ' stroke-width="1.2"') +
      S('M6 57.5h52', '#d8e85a', 0.9) +
      S('M25 45.6c-2.2 4-1.8 9.2 1.6 12.6M39 45.6c2 3 2.2 6.8 1 9.8', '#2b2f36', 2) +
      C(40.2, 57.4, 2.4, '#c9d2da', ' stroke-width="1.2"') +
      head(skin) +
      P('M20.6 28.4c-1-9 4.4-14.8 11.4-14.8s12.4 5.8 11.4 14.8c-1.8-5.6-6-8.8-11.4-8.8s-9.6 3.2-11.4 8.8z', hair) +
      S('M21.4 22.6c-1.8 2.4.4 4.2-.8 6.6M42.6 22.6c1.8 2.4-.4 4.2.8 6.6', hair, 1.6) +
      S('M24.4 25.4c1.6-.9 3.4-1 5-.4M34.6 25c1.6-.6 3.4-.5 5 .4', hair, 1.6) +
      eyes() +
      nose(shade) +
      mouth('calm') +
      C(21.4, 32.4, 0.9, '#f2c14e', ' stroke-width=".8"') +
      C(42.6, 32.4, 0.9, '#f2c14e', ' stroke-width=".8"')
    );
  },

  // Chemistry teacher: messy ginger hair, stubble, round glasses, goggles up, green cardigan.
  theo() {
    const skin = '#f1c9a5';
    const shade = '#d9a57f';
    const hair = '#d2702f';
    return (
      neck(shade) +
      P(BUST, '#5f8a4a') +
      P('M25.6 46.4L32 58l6.4-11.6c-2-.6-4-.8-6.4-.8s-4.4.2-6.4.8z', '#dfe8f0') +
      P('M25.6 46.4l3 4.8 3.4-3.2-3.2-3zM38.4 46.4l-3 4.8-3.4-3.2 3.2-3z', '#f4f7fa', ' stroke-width="1.2"') +
      S('M32 58v6', '#3f5f30', 1) +
      dots([[29.6, 59], [29.2, 62.6]], '#e9e4d6', 1.8) +
      S('M23.4 47.2L32 63.6M40.6 47.2L32 63.6', '#4b7039', 1.2) +
      head(skin) +
      P('M21.6 31.6c.8 6 4.8 10.2 10.4 10.2s9.6-4.2 10.4-10.2c-1.6 2.4-4.4 3.6-6 3.4-1.4-1-2.8-1.4-4.4-1.4s-3 .4-4.4 1.4c-1.6.2-4.4-1-6-3.4z', '#b8774a', NS + ' opacity=".38"') +
      P('M20.4 27.4c-1.4-7 1.4-13.2 6.8-15.2l-.6-2.4 3.6 1.2 1.6-2.8 2.2 2.4 2.6-2 .8 3 3-.6-.6 2.8c3.4 2.4 4.6 7.4 3.8 13.6-.8-2.8-2-5-3.6-6.4l-.8 2.2-1.6-2.8-2 2.2-1-2.6-2.4 1.8-.6-2.4-2.6 1.8.2-2.4c-2.6 1.6-4.4 4.6-6.8 8.6z', hair) +
      S('M20.8 19.6c7-3.2 15.4-3.2 22.4 0', '#2b2f36', 2.4) +
      `<rect x="24" y="14.6" width="7.2" height="5" rx="2" fill="#9fd8ff" stroke-width="1.2"/><rect x="32.8" y="14.6" width="7.2" height="5" rx="2" fill="#9fd8ff" stroke-width="1.2"/>` +
      S('M25 16.4h2.4M33.8 16.4h2.4', '#fff', 0.9, ' stroke-opacity=".8"') +
      S('M24.2 24.4c1.6-1.1 3.4-1.3 5-.7M34.8 23.7c1.6-.6 3.4-.4 5 .7', '#b5571f', 1.6) +
      eyes(1.6) +
      `<g fill="#fff" fill-opacity=".22" stroke-width="1.3">${C(27.4, 29.4, 3.9, '#fff')}${C(36.6, 29.4, 3.9, '#fff')}</g>` +
      S('M31.3 29.2c.4-.6 1-.6 1.4 0M23.5 28.6l-2-.8M40.5 28.6l2-.8', O, 1.2) +
      nose(shade) +
      mouth('smile', '#7a3a2a')
    );
  },

  // Retired range officer: close-cropped grey-flecked hair, olive field jacket, ear defenders round the neck.
  grace() {
    const skin = '#5e3a26';
    const shade = '#4a2c1c';
    return (
      neck(shade) +
      P(BUST, '#5d6b3a') +
      P('M26 46.6L32 52l6-5.4-1-1.8h-10z', '#8a7d55') +
      P('M25.6 46.2l-4.4 9.4 6-1.6 4.8-2zM38.4 46.2l4.4 9.4-6-1.6-4.8-2z', '#6b7a44') +
      S('M12 57.6h9M43 57.6h9', '#46522c', 1.2) +
      S('M19.6 46.4c3.4 3.6 21.4 3.6 24.8 0', '#23272d', 2.4) +
      `<rect x="14.6" y="42" width="8.4" height="11" rx="3.4" fill="#3e4826"/><rect x="41" y="42" width="8.4" height="11" rx="3.4" fill="#3e4826"/>` +
      S('M16.6 44.6v5.8M47.4 44.6v5.8', '#c2a25a', 1.2) +
      head(skin) +
      P('M20.9 28.4c-.9-9.2 4.2-14.8 11.1-14.8s12 5.6 11.1 14.8c-.5-2.6-1.3-4.6-2.5-6.2-2.2-1.6-5-2.4-8.6-2.4s-6.4.8-8.6 2.4c-1.2 1.6-2 3.6-2.5 6.2z', '#2b2725') +
      dots([[26, 17.4], [30.4, 15.6], [35.4, 15.8], [39.4, 18], [23.4, 21.4], [41.4, 22]], '#8f8a82', 0.9) +
      S('M23.8 25.8l5.6-.6 1.2.9M40.2 25.8l-5.6-.6-1.2.9', '#1d1612', 1.8) +
      eyes(1.35, '#1a110c', 29.4) +
      S('M26.4 33.6c-.6 1.4-.6 2.4 0 3.4M37.6 33.6c.6 1.4.6 2.4 0 3.4', shade, 1) +
      nose('#3a2216') +
      mouth('flat', '#2a1610', 1.6) +
      C(21.4, 32.6, 0.9, '#e9e4d6', ' stroke-width=".8"')
    );
  },

  // Long-haul trucker: trucker cap, big blond beard, red plaid flannel.
  lukas() {
    const skin = '#d39062';
    const shade = '#b5734a';
    const beard = '#e0b354';
    return (
      neck(shade) +
      P(WIDE, '#c0392b') +
      S('M14 48v16M23 46.4V64M41 46.4V64M50 48v16M4 56.6h56', '#7a1f19', 2.2, ' stroke-opacity=".7"') +
      S('M18.6 47.2V64M45.4 47.2V64M3 61h58', '#f08a74', 0.9, ' stroke-opacity=".55"') +
      P('M24.4 46l7.6 9 7.6-9-2.2-1.2L32 50.6l-5.4-5.8z', '#a8302a') +
      head(skin) +
      S('M21 23.4c-1 2.4-1 4.6-.4 6.6M43 23.4c1 2.4 1 4.6.4 6.6', beard, 2.2) +
      P('M20.6 28.6c0 10 3.4 18.4 11.4 22 8-3.6 11.4-12 11.4-22-1.2 3-3 4.6-5 4.8-1.8-2.2-3.8-3-6.4-3s-4.6.8-6.4 3c-2-.2-3.8-1.8-5-4.8z', beard) +
      S('M27 40.6c1.4 2.6 3 4 5 5M37 40.6c-1.4 2.6-3 4-5 5', '#c39640', 1.1) +
      P('M26.6 34.6c1.8-1.6 3.8-1.6 5.4 0 1.6-1.6 3.6-1.6 5.4 0-1.6 1.8-3.8 2.2-5.4 1.2-1.6 1-3.8.6-5.4-1.2z', '#c39640', ' stroke-width="1.2"') +
      S('M30.4 37.6h3.2', '#5a2a22', 1.3) +
      eyes(1.6) +
      S('M24 25.2c1.6-1 3.6-1.2 5.4-.4M34.6 24.8c1.8-.8 3.8-.6 5.4.4', '#b8862e', 2) +
      nose(shade) +
      P('M19.6 24c0-8.4 5.4-13.4 12.4-13.4S44.4 15.6 44.4 24z', '#2b3c5a') +
      P('M23.6 23.4c0-6.4 3.6-11 8.4-11s8.4 4.6 8.4 11z', '#efe6cf', ' stroke-width="1.2"') +
      P('M27.6 18h8.8v3h-8.8z', '#e07a2e', ' stroke-width="1"') +
      P('M18.2 24.4c3.6-1.6 24-1.6 27.6 0 .2 1.6-.6 2.6-1.8 3-5.2-1.4-18.8-1.4-24 0-1.2-.4-2-1.4-1.8-3z', '#24344f')
    );
  },

  // Bike courier: black bob with a teal streak, yellow windbreaker, messenger strap, cycling cap.
  mei() {
    const skin = '#f0cfae';
    const shade = '#d8ae88';
    const hair = '#1a1a22';
    return (
      P('M18.6 41c-1.2-4.6-1.8-9.6-1.6-14.6.4-9.4 6.2-15.6 15-15.6s14.6 6.2 15 15.6c.2 5-.4 10-1.6 14.6z', hair) +
      neck(shade) +
      P(BUST, '#f2c94c') +
      P('M24 45.8c1.4 3 14.6 3 16 0l-.6-4.2c-2 2-12.8 2-14.8 0z', '#f6d873', ' stroke-width="1.3"') +
      S('M32 48.6V64', '#9a7a1e', 1.2) +
      S('M17 53.6c3.4.4 6.6 1.6 8.4 3M47 53.6c-3.4.4-6.6 1.6-8.4 3', '#c9a032', 1.1) +
      S('M44.6 46.6L20 64', O, 6.4) +
      S('M44.6 46.6L20 64', '#2b2f36', 4) +
      P('M31.2 52.6l4-2.8 2.2 3.2-4 2.8z', '#c9d2da', ' stroke-width="1.1"') +
      head(skin) +
      P('M20.6 25.6c.4-7 5-11.4 11.4-11.4s11 4.4 11.4 11.4c-3.4-1.6-7-2-11.4-2s-8 .4-11.4 2z', hair) +
      P('M20.4 24.6c-1 5.6-.8 11 .6 16.4h3.4c-1.4-5-1.6-10.4-.6-16.2zM43.6 24.6c1 5.6.8 11-.6 16.4h-3.4c1.4-5 1.6-10.4.6-16.2z', hair) +
      P('M26.4 15.2c-1.6 2.6-2.6 5.6-2.8 9l3.2-.6c.2-3.2.8-5.8 2-8z', '#2ec4b6', ' stroke-width="1"') +
      P('M22.6 15.6c.4-4.6 4.4-7.6 9.4-7.6s9 3 9.4 7.6c-3-.8-6.2-1.2-9.4-1.2s-6.4.4-9.4 1.2z', '#f4f7fa', ' stroke-width="1.3"') +
      S('M32 8.4v6', '#2ec4b6', 2.4) +
      P('M26.6 14.6c1.6-2.6 9.2-2.6 10.8 0l.6-2.6c-2.6-2-9.4-2-12 0z', '#2b2f36', ' stroke-width="1.1"') +
      S('M24.6 25.8c1.6-.8 3.4-.9 5-.3M34.4 25.5c1.6-.6 3.4-.5 5 .3', hair, 1.5) +
      eyes(1.7) +
      blush('#e8806a') +
      nose(shade) +
      mouth('grin', '#7a2e2a')
    );
  },

  // The player: hood up, face in shadow, bandana over the mouth, orange trim.
  you() {
    return (
      P('M3 64c1-9 6.4-14.4 14.6-16.4h28.8C53.6 49.6 59 55 61 64z', '#3a3f47') +
      P('M32 6.6c-11 0-17.4 8.6-17.4 19.4 0 6.2 1.8 11.4 4.6 15-1.2 2.8-3 5-5.4 6.8h36.4c-2.4-1.8-4.2-4-5.4-6.8 2.8-3.6 4.6-8.8 4.6-15 0-10.8-6.4-19.4-17.4-19.4z', '#454b54') +
      S('M17 22c1.6-6 5.6-10.6 11-12.4', '#fff', 1.4, ' stroke-opacity=".18"') +
      P('M32 13.4c-7.6 0-11.8 6-11.8 13.6 0 5.6 2.4 10.2 5.6 12.8h12.4c3.2-2.6 5.6-7.2 5.6-12.8 0-7.6-4.2-13.6-11.8-13.6z', '#17120f', ' stroke="#ff8a2a" stroke-width="2.2"') +
      P('M22.6 24.6c2.4-4.6 5.6-6.6 9.4-6.6s7 2 9.4 6.6c-2.8-1.6-6-2.4-9.4-2.4s-6.6.8-9.4 2.4z', '#3a2a22', NS + ' opacity=".8"') +
      E(27.6, 27.6, 1.6, 1.1, '#f1e6d2', NS) +
      E(36.4, 27.6, 1.6, 1.1, '#f1e6d2', NS) +
      P('M21.4 30.2c3.2 1.8 6.6 2.6 10.6 2.6s7.4-.8 10.6-2.6c-.2 4-1.4 7-3.4 9.2H24.8c-2-2.2-3.2-5.2-3.4-9.2z', '#55605a') +
      dots([[25, 34], [29, 35.4], [33, 35.6], [37, 35], [40, 33.6], [27, 37.6], [31, 38.2], [35, 38], [38.6, 36.8]], '#8f9a90', 1.1) +
      S('M27.6 46v9.2M36.4 46v9.2', '#ff8a2a', 1.6) +
      dots([[27.6, 56], [36.4, 56]], '#c9d2da', 2.4) +
      S('M32 49v15', '#23272d', 1.2) +
      S('M14.2 56c2 .8 4 2.2 5.2 4M49.8 56c-2 .8-4 2.2-5.2 4', '#ff8a2a', 1.6)
    );
  },

  // Generic stand-in survivor: plain grey cap and jacket, simple face.
  bot() {
    const skin = '#bdb5ab';
    const shade = '#a39a8f';
    return (
      neck(shade) +
      P(BUST, '#6f7a85') +
      P('M25 46.4l7 6 7-6-1.6-1.4H26.6z', '#59636e') +
      S('M32 52.4V64', '#4a535c', 1.2) +
      head(skin) +
      eyes(1.5, '#3a3f47') +
      S('M24.6 25.6h4.6M34.8 25.6h4.6', '#7b8692', 1.4) +
      nose(shade) +
      mouth('flat', '#6b625a') +
      P('M20.4 24.4c0-7.6 5-12.2 11.6-12.2s11.6 4.6 11.6 12.2z', '#7b8692') +
      S('M32 12.4v11.8', '#5f6b77', 1) +
      C(32, 12.4, 1.2, '#5f6b77', ' stroke-width="1"') +
      P('M19 24.2c4-1.4 22-1.4 26 0 .2 1.8-.6 2.8-2 3.2-5.4-1.2-16.6-1.2-22 0-1.4-.4-2.2-1.4-2-3.2z', '#5f6b77')
    );
  },

  // A friend just starting out: blue hoodie, gaming headset with mic, short brown hair.
  friend_rookie() {
    const skin = '#f2cfb0';
    const shade = '#dcae8a';
    const hair = '#6b4426';
    return (
      neck(shade) +
      P(BUST, '#3d7bd9') +
      P('M20 47.2c2.6 4.2 7 6.4 12 6.4s9.4-2.2 12-6.4c-3.6-1-7.6-1.6-12-1.6s-8.4.6-12 1.6z', '#5b8dff') +
      S('M28.6 52.6v6M35.4 52.6v6', '#f4f7fa', 1.3) +
      head(skin) +
      P('M20.6 26.2c-.8-8 4-13.2 11.4-13.2 5 0 9 2 10.6 6.4.6 1.6.8 3.6.4 6.6-1.6-3-4-5-7-5.6-3-.6-6.4-.2-9 .8-2.4 1-4.4 2.6-6.4 5z', hair) +
      P('M27.6 13.8c2-2.6 6.4-3.2 9-1.4-2.6.2-4.6 1-5.8 2.6z', hair) +
      S('M24.6 25c1.6-.8 3.4-.9 5-.3M34.4 24.7c1.6-.6 3.4-.5 5 .3', '#5a3820', 1.5) +
      eyes(1.7) +
      blush('#e8806a') +
      nose(shade) +
      mouth('grin', '#7a2e2a') +
      S('M19.4 27.4c0-10 5.6-16.2 12.6-16.2s12.6 6.2 12.6 16.2', '#23272d', 2.6) +
      `<rect x="16.6" y="24.4" width="6.4" height="10" rx="2.8" fill="#23272d"/><rect x="41" y="24.4" width="6.4" height="10" rx="2.8" fill="#23272d"/>` +
      S('M18.4 27v4.8M45.6 27v4.8', '#5b8dff', 1.2) +
      S('M20.6 33.6c.8 3.2 3.4 4.6 6.8 4.2', O, 1.6) +
      C(27.8, 37.8, 1.4, '#5fd3e6', ' stroke-width="1"')
    );
  },

  // A seasoned friend: beanie, beard, blue tactical vest, headset with mic.
  friend_veteran() {
    const skin = '#5a3523';
    const shade = '#472718';
    const beard = '#271b15';
    return (
      neck(shade) +
      P(BUST, '#2b2f36') +
      P('M10.6 51.4c2-2 4.6-3.2 8-3.8l4.6-1.2L27 52v12H11.4zM53.4 51.4c-2-2-4.6-3.2-8-3.8l-4.6-1.2L37 52v12h15.6z', '#2f5aa8') +
      `<g fill="#284d90" stroke-width="1.2"><rect x="14" y="54.6" width="8" height="7" rx="1"/><rect x="42" y="54.6" width="8" height="7" rx="1"/></g>` +
      P('M43 50.6h6v3h-6z', '#9fb8e0', ' stroke-width="1"') +
      head(skin) +
      P('M21.2 29c.2 8.2 4.6 13.6 10.8 13.6S42.6 37.2 42.8 29c-1.2 2.6-3 3.6-5 3.8-1.4-1.6-3.4-2.4-5.8-2.4s-4.4.8-5.8 2.4c-2-.2-3.8-1.2-5-3.8z', beard) +
      S('M29.2 36.4c1.8.9 3.8.9 5.6 0', '#c98a6a', 1.3) +
      eyes(1.55, '#120b08') +
      S('M24.4 25.8c1.6-.9 3.6-1.1 5.2-.4M34.4 25.4c1.6-.7 3.6-.5 5.2.4', beard, 1.8) +
      nose('#3a2014') +
      P('M20 24.6c0-8.4 5.4-14 12-14s12 5.6 12 14z', '#24365a') +
      P('M19 21.6c4.4-1.4 21.6-1.4 26 0v4.6c-4.4-1.4-21.6-1.4-26 0z', '#2f4670') +
      S('M23 21v4.4M27 20.6V25M31 20.4v4.4M35 20.5v4.4M39 20.7v4.4M43 21v4.4', '#1d2b48', 0.9) +
      S('M19.6 27.8c0-11 5.4-18.6 12.4-18.6s12.4 7.6 12.4 18.6', '#1b1e22', 2.4) +
      `<rect x="16.6" y="24.6" width="6.4" height="10" rx="2.8" fill="#1b1e22"/><rect x="41" y="24.6" width="6.4" height="10" rx="2.8" fill="#1b1e22"/>` +
      S('M20.6 33.8c.8 3.2 3.4 4.6 6.8 4.2', O, 1.6) +
      C(27.8, 38, 1.4, '#3a3f47', ' stroke-width="1"')
    );
  },
};

/** A 64x64 head-and-shoulders portrait; unknown ids get the generic bot. */
export function portrait(id, { cls = '' } = {}) {
  const key = DRAW[id] ? id : 'bot';
  const accent = PORTRAIT_COLORS[key];
  return (
    `<svg class="portrait${cls ? ' ' + cls : ''}" viewBox="0 0 64 64" aria-hidden="true">` +
    `<rect width="64" height="64" fill="${mix(accent, '#0f1216', 0.8)}"/>` +
    `<circle cx="32" cy="29" r="26" fill="${mix(accent, '#0f1216', 0.6)}"/>` +
    `<g stroke="${O}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">${DRAW[key]()}</g></svg>`
  );
}
