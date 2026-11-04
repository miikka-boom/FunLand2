// Shared constants for Prototype 1 (BATTLE). Every module reads the world
// layout and team colours from here, so the scenery, physics and camera agree.
//
// Coordinates: world pixels, y grows DOWN (canvas convention). The walking
// line (lane 0) is y = 0, so everything in the air has a negative y.

export const WORLD = {
  width: 2000,
  // Units stand on "lanes" between y = 0 and y = laneDepth. Lanes only add a
  // little depth to crowds (draw order + a few px of height); fights are 2D.
  groundY: 0,
  laneDepth: 18,
  // Visual grass band: far edge at grassTop, front lip at grassFront. The dirt
  // cross-section starts below grassFront and goes down forever.
  grassTop: -16,
  grassFront: 34,
  // Castle centres (each castle is ~220 px wide, ~230 px tall incl. flag).
  castleX: { blue: 115, red: 1885 },
  // Where each side may place units.
  zone: { blue: [240, 900], red: [1100, 1760] },
  gravity: 1150,
};

export const TEAMS = {
  blue: {
    name: 'BLUE',
    dir: 1, // faces right
    body: '#2b6be0',
    shade: '#1a47a6',
    light: '#5d97f7',
    limb: '#2259c4',
    dark: '#123275',
  },
  red: {
    name: 'RED',
    dir: -1, // faces left
    body: '#e4433b',
    shade: '#b02924',
    light: '#f7776c',
    limb: '#cc342d',
    dark: '#7a1714',
  },
};

export const enemyOf = (team) => (team === 'blue' ? 'red' : 'blue');
