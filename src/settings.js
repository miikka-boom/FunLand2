// Live tuning values. Everything the feel depends on lives here so it can be
// tweaked on-device from the tuning panel (gear button) and copied out as JSON.

const STORAGE_KEY = 'funland2.p0.tuning.v1';

/**
 * The map types, in the order the title card and the panel list them:
 * id (settings.level), name, a few words for the title card, and a line for
 * the panel. Roughly Philadelphia, 2020.
 */
export const LEVELS = [
  { id: 'city', name: 'Streets', sub: 'Center City, after dark', about: 'Center City at night' },
  { id: 'interior', name: 'Building', sub: 'an office floor', about: 'an office floor on Market St' },
  { id: 'docks', name: 'Pier 9', sub: 'docks · last ferry', about: 'the Delaware docks, ferry finale' },
  { id: 'suburbia', name: 'Suburbia', sub: 'lawns of Delco', about: 'a Delco subdivision' },
  { id: 'graveyard', name: 'Graveyard', sub: 'Wissahickon Hill', about: 'Wissahickon Hill Cemetery' },
  { id: 'junkyard', name: 'Junkyard', sub: 'Southwest Philly', about: 'a Southwest Philly salvage yard' },
];
export const LEVEL_IDS = LEVELS.map((l) => l.id);
export const LEVEL_NAMES = Object.fromEntries(LEVELS.map((l) => [l.id, l.name]));

// --- The camera, per map type ---------------------------------------------------------------
// Each map type keeps its own camera: the settings are stored as
// 'cameraTilt@interior', 'viewSize@docks' and so on (see levelKey / forLevel).
const CAMERA_DEFAULTS = {
  camera: 'iso', // 'iso' (3D) | 'top' (the same 3D world seen straight from above)
  cameraAligned: true, // 3D without the 45° turn: streets run along the screen, only south walls face you (off: isometric)
  cameraTilt: 25, // degrees above the horizon in the isometric view (35 = true isometric)
  cameraAlignedTilt: 75, // ...and with the streets along the screen: steep, so a wall doesn't hide the doorway in it
  viewSize: 470, // world units visible across the short screen axis
};
const CAMERA_BY_LEVEL = {
  // Corridors and rooms read best turned 45° (walls both ways show a face), from as high as the slider goes.
  interior: { cameraAligned: false, cameraTilt: 70 },
};
/** The settings that are kept per map type. */
export const LEVEL_KEYS = Object.keys(CAMERA_DEFAULTS);
/** Where a per-map-type setting is stored. */
export const levelKey = (key, level) => `${key}@${level}`;
/** A per-map-type setting for a level (the one being played unless given). */
export const forLevel = (S, key, level = S.level) => S[levelKey(key, LEVEL_NAMES[level] ? level : 'city')];
function cameraDefaults() {
  const out = {};
  for (const id of LEVEL_IDS) for (const k of LEVEL_KEYS) out[levelKey(k, id)] = (CAMERA_BY_LEVEL[id] && k in CAMERA_BY_LEVEL[id] ? CAMERA_BY_LEVEL[id] : CAMERA_DEFAULTS)[k];
  return out;
}

export const DEFAULTS = Object.freeze({
  level: 'city', // one of LEVELS
  ferryTime: 60, // Pier 9: seconds from the flare until the ferry docks

  // --- World: what each map has (changes restart the run) -----------------
  stashes: true, // supply stashes off the main route, with chalk arrows
  boardedRooms: true, // boarded-up rooms with a better stash (and company)
  secret: true, // one hidden stash per map
  holdout: false, // a wall across the map: start the gate, hold out while it opens
  holdoutTime: 30, // seconds the gate takes to open
  routes: false, // two ways through: the long way round, or a loud shortcut
  landmarks: false, // crashed helicopter, army checkpoint, a gas station that blows up
  lore: true, // graffiti, posters, rooftop messages, survivor dens and notes (visual only)
  ben: true, // signs of Ben, the one the squad left behind (visual + a few sounds)

  // --- Sticks -------------------------------------------------------------
  moveMode: 'dynamic', // 'dynamic' (base follows thumb) | 'floating' | 'fixed'
  aimMode: 'dynamic',
  stickRadius: 58, // CSS px of thumb travel for full deflection
  zoneSplit: 0.5, // fraction of screen width owned by the move stick
  moveDeadzone: 0.12, // radial, fraction of radius
  moveSaturation: 0.85, // deflection that already gives full speed
  moveCurve: 1.0, // response exponent (1 = linear, >1 = finer control near centre)

  // --- Aim & fire ---------------------------------------------------------
  aimDeadzone: 0.12, // below this the aim direction is not trusted
  fireThreshold: 0.45, // deflection where firing starts (inner ring = aim only)
  aimSmoothing: 0.02, // seconds; scaled up automatically at small deflections
  aimHold: 0.5, // seconds the survivor keeps facing the last aim after release
  aimAssist: 0.45, // 0..1 pull toward the best target inside the cone
  aimAssistCone: 10, // half-angle in degrees
  laser: true,

  // --- Shove --------------------------------------------------------------
  tapShove: true, // quick tap on the aim side = shove
  tapMaxMs: 220,
  tapMaxPx: 14,
  shoveButton: true,

  // --- Camera (view, angles and zoom are per map type: see cameraDefaults below) ---
  lookAhead: 0.2, // fraction of view size the camera leads toward the aim
  cameraStiffness: 8,
  screenShake: 1.0,

  // --- Survivor -----------------------------------------------------------
  moveSpeed: 190, // units / s
  accel: 2400,
  decel: 3000,
  godMode: false,

  // --- Horde --------------------------------------------------------------
  zombieSpeed: 1.0,
  zombieDamage: 1.0,
  hordeSize: 1.0,
  wanderers: 1.0,

  // --- Special infected ---------------------------------------------------
  specials: false, // Hunter + Tank (opt-in)
  hunterBreakTaps: 5, // taps to break a Hunter pin
  deadstopWindow: 0.18, // seconds a shove stays live for knocking a pouncing Hunter down
  tankHealth: 1.0,
  tankSpeed: 1.0, // 1.0 = 182 u/s, just under your run speed: kite it, don't stop
  nightTerror: false, // a stalker you only see in light: the flashlight is your weapon
  witch: true, // one sits crying somewhere near the way: leave her be
  witchPatience: 0.5, // how long she bears you in her space or your light on her (x1 = the base times in witch.js)
  witchHealth: 3.0, // x the base 900 HP

  // --- AI teammate --------------------------------------------------------
  ally: false, // a bot survivor that fights alongside you (off: solo is the baseline)
  allyWeapon: 'rifle', // smg | rifle | shotgun | hunting
  allyAccuracy: 0.7, // aim error and reaction time: 0 = sloppy, 1 = sharp

  // --- Presentation -------------------------------------------------------
  night: true,
  darkness: 0.6, // how much light the night takes away where nothing is lit
  los: false, // line-of-sight shadows: what's behind a building stays hidden until you round the corner
  threatIndicators: true,
  haptics: 'light', // 'off' | 'light' | 'full'
  volume: 0.8,

  // --- Playtest -----------------------------------------------------------
  playtestPrompt: true, // after each run: rate it in three taps, copy / share the report
  daily: false, // play today's map (same seed for everyone, changes at midnight)

  // --- Debug --------------------------------------------------------------
  showDebug: false,
  showTouches: false,
  seed: 1337,

  // --- Camera: view, angles and zoom, one set per map type ------------------
  ...cameraDefaults(),
});

const pct = (v) => `${Math.round(v * 100)}%`;
const secs = (v) => `${v.toFixed(2)}s`;
const deg = (v) => `${Math.round(v)}°`;
const mult = (v) => `×${v.toFixed(2)}`;
const multBig = (v) => (v >= 10 ? `×${v.toFixed(0)}` : v >= 2 ? `×${v.toFixed(1)}` : `×${v.toFixed(2)}`);
const MODE_OPTIONS = [
  ['dynamic', 'Dynamic – follows thumb'],
  ['floating', 'Floating – spawns at touch'],
  ['fixed', 'Fixed position'],
];

// Drives the tuning panel UI.
export const SCHEMA = [
  {
    group: 'Level',
    items: [
      {
        key: 'level',
        label: 'Level (restarts the run)',
        type: 'select',
        options: LEVELS.map((l) => [l.id, `${l.name} – ${l.about}`]),
      },
      { key: 'ferryTime', label: 'Pier 9: ferry arrives after', type: 'range', min: 30, max: 120, step: 10, fmt: (v) => `${v}s` },
    ],
  },
  {
    group: 'World (changes restart the run)',
    presets: 'world',
    items: [
      { key: 'stashes', label: 'Supply stashes + chalk arrows', type: 'toggle' },
      { key: 'boardedRooms', label: 'Boarded-up rooms', type: 'toggle' },
      { key: 'secret', label: 'Secret stash', type: 'toggle' },
      { key: 'holdout', label: 'Holdout gate mid-route', type: 'toggle' },
      { key: 'holdoutTime', label: 'Gate opening time', type: 'range', min: 15, max: 60, step: 5, fmt: (v) => `${v}s` },
      { key: 'routes', label: 'Two routes: long way or loud shortcut', type: 'toggle' },
      { key: 'landmarks', label: 'Landmarks: heli crash, checkpoint, gas station', type: 'toggle' },
      { key: 'lore', label: 'Graffiti, posters & survivor notes', type: 'toggle' },
      { key: 'ben', label: "Ben's traces (the one we left behind)", type: 'toggle' },
    ],
  },
  {
    group: 'Sticks',
    items: [
      { key: 'moveMode', label: 'Move stick', type: 'select', options: MODE_OPTIONS },
      { key: 'aimMode', label: 'Aim stick', type: 'select', options: MODE_OPTIONS },
      { key: 'stickRadius', label: 'Stick radius', type: 'range', min: 36, max: 110, step: 1, fmt: (v) => `${v}px` },
      { key: 'zoneSplit', label: 'Move / aim split', type: 'range', min: 0.3, max: 0.7, step: 0.01, fmt: pct },
      { key: 'moveDeadzone', label: 'Move dead zone', type: 'range', min: 0, max: 0.4, step: 0.01, fmt: pct },
      { key: 'moveSaturation', label: 'Full speed at', type: 'range', min: 0.4, max: 1, step: 0.01, fmt: pct },
      { key: 'moveCurve', label: 'Move response curve', type: 'range', min: 0.5, max: 3, step: 0.05, fmt: (v) => `^${v.toFixed(2)}` },
    ],
  },
  {
    group: 'Aim & fire',
    items: [
      { key: 'fireThreshold', label: 'Fire ring', type: 'range', min: 0, max: 0.95, step: 0.01, fmt: pct },
      { key: 'aimDeadzone', label: 'Aim dead zone', type: 'range', min: 0, max: 0.4, step: 0.01, fmt: pct },
      { key: 'aimAssist', label: 'Aim assist', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
      { key: 'aimAssistCone', label: 'Assist cone', type: 'range', min: 2, max: 30, step: 1, fmt: deg },
      { key: 'aimSmoothing', label: 'Aim smoothing', type: 'range', min: 0, max: 0.15, step: 0.005, fmt: secs },
      { key: 'aimHold', label: 'Keep aim after release', type: 'range', min: 0, max: 2, step: 0.05, fmt: secs },
      { key: 'laser', label: 'Laser sight', type: 'toggle' },
    ],
  },
  {
    group: 'Shove',
    items: [
      { key: 'tapShove', label: 'Tap aim side to shove', type: 'toggle' },
      { key: 'tapMaxMs', label: 'Tap max duration', type: 'range', min: 100, max: 400, step: 10, fmt: (v) => `${v}ms` },
      { key: 'tapMaxPx', label: 'Tap max travel', type: 'range', min: 4, max: 30, step: 1, fmt: (v) => `${v}px` },
      { key: 'shoveButton', label: 'Show shove button', type: 'toggle' },
    ],
  },
  {
    // perLevel: these are kept per map type (stored as key@level); the panel
    // shows and edits the ones of the map type being played.
    group: 'Camera',
    perLevel: true,
    note: 'Each map type keeps its own view, angles and zoom: these are the ones for the map you are on.',
    items: [
      {
        key: 'camera',
        perLevel: true,
        label: 'View',
        type: 'select',
        options: [
          ['iso', '3D'],
          ['top', 'Top-down – straight from above'],
        ],
      },
      { key: 'cameraAligned', perLevel: true, label: 'Streets along the screen (no 45° turn)', type: 'toggle' },
      { key: 'cameraTilt', perLevel: true, label: 'Isometric tilt (35° = true isometric)', type: 'range', min: 25, max: 70, step: 1, fmt: deg },
      { key: 'cameraAlignedTilt', perLevel: true, label: 'Tilt with streets along the screen', type: 'range', min: 30, max: 75, step: 1, fmt: deg },
      { key: 'viewSize', perLevel: true, label: 'View size (zoom)', type: 'range', min: 300, max: 800, step: 10, fmt: (v) => `${v}u` },
    ],
  },
  {
    group: 'Camera feel (every map)',
    items: [
      { key: 'lookAhead', label: 'Look-ahead', type: 'range', min: 0, max: 0.4, step: 0.01, fmt: pct },
      { key: 'cameraStiffness', label: 'Camera stiffness', type: 'range', min: 2, max: 25, step: 0.5, fmt: (v) => v.toFixed(1) },
      { key: 'screenShake', label: 'Screen shake', type: 'range', min: 0, max: 2, step: 0.05, fmt: mult },
    ],
  },
  {
    group: 'Survivor',
    items: [
      { key: 'moveSpeed', label: 'Run speed', type: 'range', min: 100, max: 320, step: 5, fmt: (v) => `${v}u/s` },
      { key: 'accel', label: 'Acceleration', type: 'range', min: 400, max: 8000, step: 100, fmt: (v) => `${v}` },
      { key: 'decel', label: 'Braking', type: 'range', min: 400, max: 8000, step: 100, fmt: (v) => `${v}` },
      { key: 'godMode', label: 'God mode', type: 'toggle' },
    ],
  },
  {
    group: 'Horde',
    items: [
      { key: 'zombieSpeed', label: 'Zombie speed', type: 'range', min: 0.4, max: 2.5, step: 0.05, fmt: mult },
      { key: 'zombieDamage', label: 'Zombie damage', type: 'range', min: 0, max: 5, step: 0.1, fmt: mult },
      // Log slider: fine control around x1, and still reaches massive hordes.
      { key: 'hordeSize', label: 'Horde size', type: 'range', min: 0.25, max: 25, log: true, fmt: multBig },
      { key: 'wanderers', label: 'Wanderer density', type: 'range', min: 0, max: 10, step: 0.1, fmt: multBig },
    ],
  },
  {
    group: 'Specials',
    items: [
      { key: 'specials', label: 'Hunter + Tank', type: 'toggle' },
      { key: 'hunterBreakTaps', label: 'Taps to break a Hunter pin', type: 'range', min: 2, max: 12, step: 1, fmt: (v) => `${v}` },
      { key: 'deadstopWindow', label: 'Deadstop shove window', type: 'range', min: 0, max: 0.4, step: 0.01, fmt: secs },
      { key: 'tankHealth', label: 'Tank health', type: 'range', min: 0.25, max: 3, step: 0.05, fmt: mult },
      { key: 'tankSpeed', label: 'Tank speed', type: 'range', min: 0.6, max: 1.5, step: 0.05, fmt: mult },
      { key: 'nightTerror', label: 'Night Terror (only seen in light)', type: 'toggle' },
      { key: 'witch', label: 'Witch: cries near the way, leave her be (restarts)', type: 'toggle' },
      { key: 'witchPatience', label: 'Witch patience', type: 'range', min: 0.4, max: 3, step: 0.1, fmt: mult },
      { key: 'witchHealth', label: 'Witch health', type: 'range', min: 0.25, max: 3, step: 0.05, fmt: mult },
    ],
  },
  {
    group: 'Teammate',
    items: [
      { key: 'ally', label: 'AI teammate (bot)', type: 'toggle' },
      {
        key: 'allyWeapon',
        label: 'Teammate weapon',
        type: 'select',
        options: [
          ['smg', 'SMG'],
          ['rifle', 'Assault rifle'],
          ['shotgun', 'Pump shotgun'],
          ['hunting', 'Hunting rifle'],
        ],
      },
      { key: 'allyAccuracy', label: 'Teammate accuracy', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
  {
    group: 'Presentation',
    items: [
      { key: 'night', label: 'Night + flashlight', type: 'toggle' },
      { key: 'darkness', label: 'Darkness', type: 'range', min: 0.4, max: 0.97, step: 0.01, fmt: pct },
      { key: 'los', label: 'Line-of-sight shadows', type: 'toggle' },
      { key: 'threatIndicators', label: 'Off-screen threat arrows', type: 'toggle' },
      {
        key: 'haptics',
        label: 'Haptics (Android)',
        type: 'select',
        options: [
          ['off', 'Off'],
          ['light', 'Light – hits & shove'],
          ['full', 'Full – also every shot'],
        ],
      },
      { key: 'volume', label: 'Volume', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
  {
    group: 'Playtest',
    extra: 'playtest',
    items: [
      { key: 'playtestPrompt', label: 'Rate each run (3 taps) + report', type: 'toggle' },
      { key: 'daily', label: 'Daily map: same for everyone today (restarts)', type: 'toggle' },
    ],
  },
  {
    group: 'Debug',
    items: [
      { key: 'showDebug', label: 'Debug read-out', type: 'toggle' },
      { key: 'showTouches', label: 'Show touches + zones', type: 'toggle' },
    ],
  },
];

/** Settings that change how a map is generated (holdoutTime / ferryTime only matter at run time). */
export const WORLD_KEYS = ['level', 'daily', 'stashes', 'boardedRooms', 'secret', 'holdout', 'routes', 'landmarks', 'lore', 'ben', 'witch'];
export const worldSignature = (S) => WORLD_KEYS.map((k) => String(S[k])).join('|');

/** One-tap world setups, so nobody has to flip six switches to try things. */
export const WORLD_PRESETS = [
  { name: 'Default', values: { stashes: true, boardedRooms: true, secret: true, holdout: false, routes: false, landmarks: false, lore: true, ben: true } },
  { name: 'Everything', values: { stashes: true, boardedRooms: true, secret: true, holdout: true, routes: true, landmarks: true, lore: true, ben: true } },
  { name: 'Bare map', values: { stashes: false, boardedRooms: false, secret: false, holdout: false, routes: false, landmarks: false, lore: false, ben: false } },
];

// One-tap control presets for quick A/B comparisons. Only control keys.
export const PRESETS = [
  { name: 'Recommended', values: pickControlDefaults() },
  { name: 'Fixed sticks', values: { ...pickControlDefaults(), moveMode: 'fixed', aimMode: 'fixed' } },
  { name: 'Floating', values: { ...pickControlDefaults(), moveMode: 'floating', aimMode: 'floating' } },
  {
    name: 'Arcade',
    values: { ...pickControlDefaults(), aimAssist: 0.85, aimAssistCone: 16, fireThreshold: 0.25, stickRadius: 50 },
  },
  {
    name: 'Raw',
    values: { ...pickControlDefaults(), aimAssist: 0, aimSmoothing: 0, moveSaturation: 1, fireThreshold: 0.6 },
  },
];

function pickControlDefaults() {
  const keys = [
    'moveMode', 'aimMode', 'stickRadius', 'zoneSplit', 'moveDeadzone', 'moveSaturation', 'moveCurve',
    'aimDeadzone', 'fireThreshold', 'aimSmoothing', 'aimHold', 'aimAssist', 'aimAssistCone',
  ];
  const out = {};
  for (const k of keys) out[k] = DEFAULTS[k];
  return out;
}

// Saves hold only what differs from the defaults (format 2), so a changed
// default reaches everyone who never touched that setting. Format 1 (no _v)
// stored every value; there, a value equal to a default that has changed
// since is dropped, so the new default applies (the teammate used to be on).
const SAVE_FORMAT = 2;
const CHANGED_DEFAULTS = { ally: true, specials: true, los: true, darkness: 0.8 };

/** Saved JSON -> the values to apply over the defaults. */
export function parseSaved(saved) {
  const out = {};
  if (!saved || typeof saved !== 'object') return out;
  const legacy = saved._v === undefined;
  for (const k of Object.keys(DEFAULTS)) {
    if (!(k in saved) || typeof saved[k] !== typeof DEFAULTS[k]) continue;
    if (legacy && k in CHANGED_DEFAULTS && saved[k] === CHANGED_DEFAULTS[k]) continue;
    out[k] = saved[k];
  }
  return out;
}

/** What saveSettings writes. */
export function serializeSettings(s) {
  return JSON.stringify({ _v: SAVE_FORMAT, ...diffFromDefaults(s) });
}

export function loadSettings() {
  const s = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(s, parseSaved(JSON.parse(raw)));
  } catch {
    // Private mode / blocked storage: run with defaults.
  }
  return s;
}

let saveTimer = 0;
export function saveSettings(s) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeSettings(s));
    } catch {
      // ignore
    }
  }, 150);
}

/** Only the values that differ from the defaults – handy to paste into chat/issues. */
export function diffFromDefaults(s) {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) if (s[k] !== DEFAULTS[k]) out[k] = s[k];
  return out;
}
