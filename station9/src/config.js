// Station 9: all content and numbers. A simpler, guided take on Hope Street.
// docs/STATION-9.md explains the design.
//
// You hold the old firehouse with Mae, its retired captain. Strangers come to the
// gate; take them in while you have beds. PLAY always plays the next run on the
// street: you go, and you pick up to three people to go with you. Every third run
// takes a building back, and it becomes something for your people.

// --- People -----------------------------------------------------------------------------

export const SQUAD_SIZE = 4; // you + three
export const MAX_LEVEL = 5;
/** XP to go from level L to L+1 (index L-1). XP comes in small whole numbers. */
export const XP_TO_NEXT = [2, 8, 16, 30];
export const XP = { win: 2, loss: 1 };

/** Three roles. Each run favors one of them (+50% power for everyone with it). */
export const ROLES = {
  fighter: { name: 'Fighter', color: '#e8774a', tag: 'horde', blurb: 'Hits hardest. Shines against a horde.' },
  scout: { name: 'Scout', color: '#5aaeea', tag: 'night', blurb: 'Sees in the dark, and finds extra scrap.' },
  medic: { name: 'Medic', color: '#5ccf8c', tag: 'toxic', blurb: 'Breathes easy in toxic air. Nobody stays hurt.' },
};
export const ROLE_ORDER = ['fighter', 'scout', 'medic'];

export const TAGS = {
  horde: { name: 'Horde', role: 'fighter', line: 'A big horde: Fighters shine.' },
  night: { name: 'Night', role: 'scout', line: 'Pitch dark: Scouts see best.' },
  toxic: { name: 'Toxic', role: 'medic', line: 'Toxic air: Medics breathe easy.' },
};
export const FAVORED_BONUS = 0.5;
/** Every Scout in the crew finds this much more scrap (up to two Scouts). */
export const SCOUT_SCRAP = 0.2;

/** Stars = potential. Power = base + per × (level − 1). */
export const STARS = {
  1: { name: 'Survivor', base: 10, per: 5 },
  2: { name: 'Skilled', base: 14, per: 6 },
  3: { name: 'Elite', base: 18, per: 7 },
};

// --- The street ---------------------------------------------------------------------------

/**
 * Buildings, left to right. Station 9 is yours from the start; every other one is
 * taken back by its runs and becomes a facility at level 1 (of 3).
 * `values[l-1]` is the effect at level l; `costs[l-1]` is the scrap to reach level l.
 */
export const BUILDINGS = [
  {
    id: 'firehouse',
    name: 'Station 9',
    facility: 'Bunks',
    start: true,
    values: [3, 5, 7],
    costs: [0, 15, 50],
    blurb: 'Home. Every bed is someone we can take in.',
    unit: (v) => `${v} beds`,
  },
  {
    id: 'diner',
    name: "Rosie's Diner",
    facility: 'Kitchen',
    values: [1, 2, 3],
    costs: [0, 30, 70],
    blurb: 'Hot meals. Everyone who goes out learns faster.',
    unit: (v) => `+${v} XP for the crew after every run`,
  },
  {
    id: 'hardware',
    name: 'Hardware Store',
    facility: 'Workshop',
    values: [0.1, 0.2, 0.3],
    costs: [0, 40, 90],
    blurb: 'Better gear. More power on every run.',
    unit: (v) => `+${Math.round(v * 100)}% crew power`,
  },
  {
    id: 'gym',
    name: 'Iron Gym',
    facility: 'Training',
    values: [1, 2, 3],
    costs: [0, 50, 110],
    blurb: 'Whoever stays home trains. Nobody falls behind.',
    unit: (v) => `+${v} XP after every run for everyone at home`,
  },
  {
    id: 'radio',
    name: 'K-HOPE Radio',
    facility: 'Radio',
    values: [
      { every: 9, odds: [0.5, 0.35, 0.15] },
      { every: 7, odds: [0.4, 0.38, 0.22] },
      { every: 5, odds: [0.3, 0.4, 0.3] },
    ],
    costs: [0, 60, 130],
    blurb: 'Our broadcast brings more people, and better ones.',
    unit: (v) => `a visitor every ${v.every} min, ${Math.round(v.odds[2] * 100)}% Elite`,
  },
  {
    id: 'overpass',
    name: 'The Overpass',
    final: true,
    blurb: 'Bring it down and Hope Street is sealed. Safe.',
  },
];
export const MAX_FACILITY_LEVEL = 3;
export const BUILDING_INDEX = Object.fromEntries(BUILDINGS.map((b, i) => [b.id, i]));

/** Without the Radio: a visitor every 12 minutes, two can wait. */
export const GATE = { every: 12, capacity: 2, odds: [0.6, 0.32, 0.08] };

// --- Runs -----------------------------------------------------------------------------------

export const RUN_TYPES = {
  run: { label: 'Run', goal: 'Reach the safe room' },
  rescue: { label: 'Rescue', goal: 'Find the survivor, bring them home' },
  finale: { label: 'Take it back', goal: 'Clear the building and hold it' },
};

/** The story: one line of runs down the street. The last run of a chain takes the building back. */
export const CHAINS = [
  {
    building: 'diner',
    scrap: 10,
    runs: [
      { name: 'Back Alley', type: 'run', tag: 'night', rec: 25, text: 'Bins, rats and something bigger behind the diner.' },
      { name: "Rosie's Last Stand", type: 'finale', tag: 'horde', rec: 40, text: 'The dining room is full of them. Take it back.' },
    ],
  },
  {
    building: 'hardware',
    scrap: 14,
    runs: [
      { name: 'Parking Lot', type: 'run', tag: 'toxic', rec: 62, text: 'A gas leak, and a lot full of them.' },
      { name: 'Stockroom', type: 'rescue', tag: 'night', rec: 76, text: 'Someone barricaded the stockroom. Still alive?' },
      { name: 'Closing Time', type: 'finale', tag: 'horde', rec: 104, text: 'Lock the doors behind you. For good.' },
    ],
  },
  {
    building: 'gym',
    scrap: 18,
    runs: [
      { name: 'Rooftop Track', type: 'run', tag: 'night', rec: 128, text: 'Cross the rooftops in the dark.' },
      { name: 'Locker Room', type: 'rescue', tag: 'toxic', rec: 146, text: 'Burst steam pipes, and someone locked in the sauna.' },
      { name: 'Heavyweight', type: 'finale', tag: 'horde', rec: 168, text: 'A Tank made the boxing ring its home.' },
    ],
  },
  {
    building: 'radio',
    scrap: 22,
    runs: [
      { name: 'Transmitter Field', type: 'run', tag: 'toxic', rec: 180, text: 'Leaking batteries and sparking cables.' },
      { name: 'Studio B', type: 'rescue', tag: 'night', rec: 190, text: 'Someone is still broadcasting from Studio B.' },
      { name: 'On Air', type: 'finale', tag: 'horde', rec: 206, text: "Get the transmitter running. They'll hear it too." },
    ],
  },
  {
    building: 'overpass',
    scrap: 26,
    runs: [
      { name: 'Traffic Jam', type: 'run', tag: 'night', rec: 212, text: 'A mile of cars. Something moves under every one.' },
      { name: 'School Bus', type: 'rescue', tag: 'toxic', rec: 220, text: 'A school bus full of survivors, stuck in the smoke.' },
      { name: 'Seal the Street', type: 'finale', tag: 'horde', rec: 232, text: 'Bring the overpass down. Hope Street holds.' },
    ],
  },
];
export const STORY = CHAINS.flatMap((c, ci) => c.runs.map((r, k) => ({ ...r, chain: ci, step: k, steps: c.runs.length, building: c.building, baseScrap: c.scrap })));
export const STORY_TOTAL = STORY.length;

export const FINALE_SCRAP = 2;
export const STAR_SCRAP = [0, 1, 1.25, 1.5];
/** A lost run still brings home half the scrap. */
export const LOSS_SCRAP = 0.5;
/** Who rescues bring: Skilled or Elite. */
export const RESCUE_ODDS = [0, 0.75, 0.25];

/** Survive chance from power vs needed. */
export const ODDS = { atRec: 0.62, slope: 1.1, min: 0.08, max: 0.98, star2: 1.1, star3: 1.3, noise: 0.1 };

/** A run takes this long on the street's clock (that's how long a real run takes). */
export const RUN_MINUTES = 5;

// --- Wait rewards ---------------------------------------------------------------------------

/** The long wait: a convoy with scrap and a skilled survivor. The first one comes early, so Mae can show it. */
export const CONVOY = { first: 25 * 60, every: 8 * 3600, scrapRuns: 2, odds: [0, 0.7, 0.3] };

export const TUNING_DEFAULTS = {
  scrap: 1,
  costs: 1,
  difficulty: 1,
  gate: 1, // × time between visitors
  outcome: 'auto', // 'auto' | 'win' | 'lose'
  volume: 0.7,
  voice: true, // Mae's voice blips
  haptics: true,
};
