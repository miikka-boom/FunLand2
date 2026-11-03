// Live tuning values. Everything the feel depends on lives here so it can be
// tweaked on-device from the tuning panel (gear button) and copied out as JSON.

const STORAGE_KEY = 'funland2.p0.tuning.v1';

export const DEFAULTS = Object.freeze({
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

  // --- Camera -------------------------------------------------------------
  viewSize: 470, // world units visible across the short screen axis
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
  specials: true, // Hunter + Tank
  hunterBreakTaps: 5, // taps to break a Hunter pin
  deadstopWindow: 0.18, // seconds a shove stays live for knocking a pouncing Hunter down
  tankHealth: 1.0,
  tankSpeed: 1.0, // 1.0 = 182 u/s, just under your run speed: kite it, don't stop

  // --- Presentation -------------------------------------------------------
  night: true,
  darkness: 0.8,
  los: true,
  threatIndicators: true,
  haptics: 'light', // 'off' | 'light' | 'full'
  volume: 0.8,

  // --- Debug --------------------------------------------------------------
  showDebug: false,
  showTouches: false,
  seed: 1337,
});

const pct = (v) => `${Math.round(v * 100)}%`;
const secs = (v) => `${v.toFixed(2)}s`;
const deg = (v) => `${Math.round(v)}°`;
const mult = (v) => `×${v.toFixed(2)}`;
const MODE_OPTIONS = [
  ['dynamic', 'Dynamic – follows thumb'],
  ['floating', 'Floating – spawns at touch'],
  ['fixed', 'Fixed position'],
];

// Drives the tuning panel UI.
export const SCHEMA = [
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
    group: 'Camera',
    items: [
      { key: 'viewSize', label: 'View size (zoom)', type: 'range', min: 300, max: 800, step: 10, fmt: (v) => `${v}u` },
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
      { key: 'zombieSpeed', label: 'Zombie speed', type: 'range', min: 0.4, max: 1.6, step: 0.05, fmt: mult },
      { key: 'zombieDamage', label: 'Zombie damage', type: 'range', min: 0, max: 3, step: 0.1, fmt: mult },
      { key: 'hordeSize', label: 'Horde size', type: 'range', min: 0.25, max: 3, step: 0.05, fmt: mult },
      { key: 'wanderers', label: 'Wanderer density', type: 'range', min: 0, max: 3, step: 0.1, fmt: mult },
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
    group: 'Debug',
    items: [
      { key: 'showDebug', label: 'Debug read-out', type: 'toggle' },
      { key: 'showTouches', label: 'Show touches + zones', type: 'toggle' },
    ],
  },
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

export function loadSettings() {
  const s = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      for (const k of Object.keys(DEFAULTS)) {
        if (k in saved && typeof saved[k] === typeof DEFAULTS[k]) s[k] = saved[k];
      }
    }
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
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
