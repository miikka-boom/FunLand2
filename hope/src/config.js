// Hope Street: all content and numbers live here. The rules (meta.js) read them;
// nothing else hard-codes a value. docs/HOPE-STREET.md explains the design.
//
// One street, one firehouse. Strangers come to the gate; you take them in if you
// have beds. Each run, pick up to four of your people. Reclaim the street one
// building at a time; every building you take becomes a facility for your people.

// --- People -----------------------------------------------------------------------------

export const SQUAD_SIZE = 4;
export const MAX_LEVEL = 10;

/** Five roles, one per run tag: a run that is "Night" favors Scouts, and so on. */
export const ROLES = {
  bruiser: { name: 'Bruiser', color: '#e8774a', blurb: 'Holds the doorway and shoves them back.', favored: 'indoors' },
  shooter: { name: 'Shooter', color: '#e9c04f', blurb: 'Keeps the horde at range.', favored: 'horde' },
  medic: { name: 'Medic', color: '#5ccf8c', blurb: 'Patches people up. The whole crew gets hurt less.', favored: 'toxic', squad: 'injury' },
  scout: { name: 'Scout', color: '#5aaeea', blurb: 'Finds the way, and the good stuff. More scrap.', favored: 'night', squad: 'scrap' },
  mechanic: { name: 'Mechanic', color: '#b996f2', blurb: 'Fixes, rigs and blows things up.', favored: 'machines' },
};
export const ROLE_ORDER = ['bruiser', 'shooter', 'medic', 'scout', 'mechanic'];

/** Run tags. Each one favors a role (+FAVORED_BONUS power for every member with it). */
export const TAGS = {
  indoors: { name: 'Indoors', role: 'bruiser' },
  horde: { name: 'Horde', role: 'shooter' },
  toxic: { name: 'Toxic', role: 'medic' },
  night: { name: 'Night', role: 'scout' },
  machines: { name: 'Machines', role: 'mechanic' },
};
export const FAVORED_BONUS = 0.25;
/** Squad-wide role effects: per member with the role, up to 2 members. */
export const ROLE_SQUAD = { medicInjury: 0.6, scoutScrap: 0.1 };

/**
 * Traits: small, readable effects. `tag` traits change power on runs with that tag;
 * the rest touch scrap, XP, injuries or the whole squad. `clash` pairs never meet.
 */
export const TRAITS = {
  nightOwl: { name: 'Night owl', good: true, tag: 'night', power: 0.25, text: '+25% power at Night' },
  steady: { name: 'Steady hands', good: true, tag: 'horde', power: 0.25, text: '+25% power vs a Horde' },
  tunnelRat: { name: 'Tunnel rat', good: true, tag: 'indoors', power: 0.25, text: '+25% power Indoors' },
  ironLungs: { name: 'Iron lungs', good: true, tag: 'toxic', power: 0.25, text: '+25% power in Toxic air' },
  tinkerer: { name: 'Tinkerer', good: true, tag: 'machines', power: 0.25, text: '+25% power around Machines' },
  lucky: { name: 'Lucky', good: true, scrap: 0.15, text: '+15% scrap on their runs' },
  quick: { name: 'Quick learner', good: true, xp: 0.3, text: '+30% XP' },
  tough: { name: 'Tough', good: true, injury: 0.5, text: 'Half as likely to get hurt' },
  leader: { name: 'Born leader', good: true, squad: 0.06, text: '+6% power for the whole crew' },
  loud: { name: 'Loud', good: false, tag: 'night', power: -0.2, text: '−20% power at Night' },
  claustro: { name: 'Claustrophobic', good: false, tag: 'indoors', power: -0.2, text: '−20% power Indoors' },
  squeamish: { name: 'Squeamish', good: false, tag: 'toxic', power: -0.2, text: '−20% power in Toxic air' },
  clumsy: { name: 'Clumsy', good: false, injury: 1.6, text: 'Gets hurt more often' },
  stubborn: { name: 'Stubborn', good: false, xp: -0.2, text: '−20% XP' },
};
export const TRAIT_CLASH = [
  ['nightOwl', 'loud'],
  ['tunnelRat', 'claustro'],
  ['ironLungs', 'squeamish'],
  ['quick', 'stubborn'],
  ['tough', 'clumsy'],
];

/** Grade = potential. Power = base + growth × (level − 1). */
export const GRADES = {
  1: { name: 'Survivor', base: 20, growth: 5 },
  2: { name: 'Skilled', base: 26, growth: 6.5 },
  3: { name: 'Elite', base: 32, growth: 8 },
};
/** How traits are rolled per grade: [good traits, chance of a bad one, chance of an extra good one]. */
export const GRADE_TRAITS = {
  1: { good: 0, bad: 0.35, extraGood: 0.65 },
  2: { good: 1, bad: 0.4, extraGood: 0.3 },
  3: { good: 2, bad: 0, extraGood: 0 },
};

/** XP to go from level L to L+1 (index L-1). */
export const XP_TO_NEXT = [120, 180, 260, 360, 480, 620, 780, 960, 1160];

// --- The street ---------------------------------------------------------------------------

/**
 * Buildings, left to right. The Firehouse is yours from the start; every other
 * one is reclaimed by its story chain and becomes a facility at level 1.
 * `values[l-1]` is the effect at level l; `costs[l-1]` is the scrap to reach level l.
 */
export const BUILDINGS = [
  {
    id: 'firehouse',
    name: 'Firehouse',
    facility: 'Bunks',
    start: true,
    effect: 'beds',
    values: [4, 5, 6, 7, 8],
    costs: [0, 40, 90, 170, 280],
    blurb: 'Station 9. Home. Everyone sleeps in the bunks upstairs.',
    unit: (v) => `${v} beds`,
  },
  {
    id: 'diner',
    name: "Rosie's Diner",
    facility: 'Kitchen',
    effect: 'xp',
    values: [0.1, 0.2, 0.3, 0.4, 0.5],
    costs: [0, 70, 150, 270, 430],
    blurb: 'Hot food. Everyone learns faster on a full stomach.',
    unit: (v) => `+${Math.round(v * 100)}% XP`,
  },
  {
    id: 'hardware',
    name: 'Hardware Store',
    facility: 'Workshop',
    effect: 'power',
    values: [0.05, 0.1, 0.15, 0.2, 0.25],
    costs: [0, 90, 190, 340, 540],
    blurb: 'Better gear for whoever goes out. More power for every run.',
    unit: (v) => `+${Math.round(v * 100)}% crew power`,
  },
  {
    id: 'gym',
    name: 'Iron Gym',
    facility: 'Training',
    effect: 'homeXp',
    values: [15, 25, 35, 50, 70],
    costs: [0, 100, 210, 370, 590],
    blurb: 'People who stay home train. Nobody falls behind.',
    unit: (v) => `+${v} XP a day at home`,
  },
  {
    id: 'clinic',
    name: 'Mercy Clinic',
    facility: 'Infirmary',
    effect: 'heal',
    values: [
      { faster: 0, safer: 0.15 },
      { faster: 1, safer: 0.2 },
      { faster: 1, safer: 0.3 },
      { faster: 2, safer: 0.35 },
      { faster: 2, safer: 0.45 },
    ],
    costs: [0, 110, 230, 400, 640],
    blurb: 'Hurt people heal faster, and fewer get hurt.',
    unit: (v) => (v.faster ? `Heals ${v.faster} day${v.faster > 1 ? 's' : ''} faster, ${Math.round(v.safer * 100)}% fewer injuries` : `${Math.round(v.safer * 100)}% fewer injuries`),
  },
  {
    id: 'motel',
    name: 'Starlite Motel',
    facility: 'Rooms',
    effect: 'beds',
    values: [3, 5, 7, 9, 12],
    costs: [0, 120, 250, 430, 680],
    blurb: 'Forty rooms. Room for a lot more people.',
    unit: (v) => `+${v} beds`,
  },
  {
    id: 'radio',
    name: 'K-HOPE Radio',
    facility: 'Radio',
    effect: 'radio',
    values: [
      { every: 25, gate: 3, odds: [0.58, 0.34, 0.08] },
      { every: 22, gate: 3, odds: [0.52, 0.37, 0.11] },
      { every: 19, gate: 3, odds: [0.46, 0.39, 0.15] },
      { every: 16, gate: 4, odds: [0.4, 0.4, 0.2] },
      { every: 13, gate: 4, odds: [0.34, 0.41, 0.25] },
    ],
    costs: [0, 130, 270, 460, 720],
    blurb: 'Your broadcast brings more people, and better ones.',
    unit: (v) => `Visitor every ${v.every} min, ${Math.round(v.odds[2] * 100)}% Elite`,
  },
  {
    id: 'overpass',
    name: 'The Overpass',
    final: true,
    blurb: 'Bring it down and Hope Street is sealed. Safe.',
  },
];
export const MAX_FACILITY_LEVEL = 5;
export const BUILDING_INDEX = Object.fromEntries(BUILDINGS.map((b, i) => [b.id, i]));

/** Without a radio: a visitor every 30 min, two can wait at the gate. */
export const GATE = { every: 30, gate: 2, odds: [0.68, 0.27, 0.05], first: 60, second: 240, callGems: 5 };

// --- Runs -----------------------------------------------------------------------------------

/** Story: one chain of three runs per building; the third reclaims it. */
export const RUN_TYPES = {
  run: { label: 'Run', goal: 'Reach the safe room' },
  rescue: { label: 'Rescue', goal: 'Find the survivor, bring them home' },
  finale: { label: 'Reclaim', goal: 'Clear the building and hold it' },
  scavenge: { label: 'Scavenge', goal: 'Grab what you can, get out' },
};

export const CHAINS = [
  {
    building: 'diner',
    scrap: 30,
    gems: 15,
    runs: [
      { name: 'Back Alley', type: 'run', tags: ['night'], rec: 45, text: 'Dumpsters, rats and something bigger behind the diner.' },
      { name: 'Walk-in Freezer', type: 'rescue', tags: ['indoors'], rec: 95, text: 'Someone has been hiding in the freezer for three days.' },
      { name: "Rosie's Last Stand", type: 'finale', tags: ['horde', 'indoors'], rec: 125, text: 'The dining room is full of them. Take it back.' },
    ],
  },
  {
    building: 'hardware',
    scrap: 42,
    gems: 18,
    runs: [
      { name: 'Parking Lot', type: 'run', tags: ['machines'], rec: 135, text: "Car alarms everywhere. Don't touch the red ones." },
      { name: 'Stockroom', type: 'rescue', tags: ['indoors', 'machines'], rec: 160, text: 'The owner barricaded the stockroom. Still alive?' },
      { name: 'Closing Time', type: 'finale', tags: ['horde'], rec: 185, text: 'Lock the doors behind you. For good.' },
    ],
  },
  {
    building: 'gym',
    scrap: 56,
    gems: 20,
    runs: [
      { name: 'Rooftop Track', type: 'run', tags: ['night'], rec: 215, text: 'Cross the rooftops in the dark.' },
      { name: 'Locker Room', type: 'rescue', tags: ['toxic', 'indoors'], rec: 250, text: 'Burst steam pipes, and someone locked in the sauna.' },
      { name: 'Heavyweight', type: 'finale', tags: ['horde', 'indoors'], rec: 285, text: 'A Tank made the boxing ring its home.' },
    ],
  },
  {
    building: 'clinic',
    scrap: 72,
    gems: 25,
    runs: [
      { name: 'Ambulance Bay', type: 'run', tags: ['machines', 'night'], rec: 305, text: 'Dead ambulances, live problems.' },
      { name: 'Isolation Ward', type: 'rescue', tags: ['toxic'], rec: 330, text: 'Masks on. A nurse is holding out in isolation.' },
      { name: 'Code Black', type: 'finale', tags: ['toxic', 'horde'], rec: 360, text: 'Every room, every floor. Clear the clinic.' },
    ],
  },
  {
    building: 'motel',
    scrap: 92,
    gems: 30,
    runs: [
      { name: 'Neon Lot', type: 'run', tags: ['night'], rec: 365, text: 'The VACANCY sign still buzzes. So do they.' },
      { name: 'Room 17', type: 'rescue', tags: ['indoors'], rec: 395, text: 'Knocking from Room 17. Three knocks, then three more.' },
      { name: 'Checkout', type: 'finale', tags: ['horde', 'night'], rec: 430, text: 'Two floors, forty rooms, one long night.' },
    ],
  },
  {
    building: 'radio',
    scrap: 115,
    gems: 35,
    runs: [
      { name: 'Transmitter Field', type: 'run', tags: ['machines'], rec: 450, text: 'Power cables, and a fence that still bites.' },
      { name: 'Studio B', type: 'rescue', tags: ['indoors', 'night'], rec: 490, text: 'Someone is still broadcasting from Studio B.' },
      { name: 'On Air', type: 'finale', tags: ['machines', 'horde'], rec: 530, text: "Get the transmitter running. They'll hear it too." },
    ],
  },
  {
    building: 'overpass',
    scrap: 140,
    gems: 60,
    runs: [
      { name: 'Traffic Jam', type: 'run', tags: ['machines', 'night'], rec: 540, text: 'A mile of cars. Something moves under every one.' },
      { name: 'School Bus', type: 'rescue', tags: ['toxic'], rec: 560, text: 'A school bus full of survivors, stuck in the smoke.' },
      { name: 'Seal the Street', type: 'finale', tags: ['horde', 'night'], rec: 595, text: 'Bring the overpass down. Hope Street holds.' },
    ],
  },
];
export const RUNS_PER_CHAIN = 3;
export const STORY_TOTAL = CHAINS.length * RUNS_PER_CHAIN;
/** Finales pay this much more scrap than the chain's base. */
export const FINALE_SCRAP = 1.8;
/** The rescued survivor's grade odds [★, ★★, ★★★]. */
export const RESCUE_ODDS = [0, 0.8, 0.2];

/** Scavenge sites: two offers at a time, rerolled when played. */
export const SCAVENGE_SITES = [
  { name: 'Laundromat', tags: ['indoors'] },
  { name: 'Bus Depot', tags: ['machines'] },
  { name: 'Pharmacy', tags: ['toxic', 'indoors'] },
  { name: 'Parking Garage', tags: ['night', 'machines'] },
  { name: 'Gas Station', tags: ['horde'] },
  { name: 'Bowling Alley', tags: ['indoors', 'night'] },
  { name: 'Junkyard', tags: ['machines', 'horde'] },
  { name: 'Storm Drains', tags: ['toxic', 'night'] },
  { name: 'Supermarket', tags: ['horde', 'indoors'] },
  { name: 'Pawn Shop', tags: ['indoors'] },
  { name: 'Construction Site', tags: ['machines'] },
  { name: 'Chapel', tags: ['night'] },
  { name: 'Car Wash', tags: ['machines', 'toxic'] },
  { name: 'Library', tags: ['indoors', 'night'] },
  { name: 'Water Plant', tags: ['toxic'] },
  { name: 'Food Trucks', tags: ['horde'] },
  { name: 'Rail Yard', tags: ['machines', 'night'] },
  { name: 'School Gym', tags: ['indoors', 'horde'] },
];
/** Two kinds of scavenge: rec and reward relative to the current story chain. */
export const SCAVENGE = {
  quick: { label: 'Quick run', rec: 0.72, scrap: 0.8, xp: 0.8, survivor: 0.08, gems: 0 },
  haul: { label: 'Big haul', rec: 0.95, scrap: 1.35, xp: 1.1, survivor: 0.3, gems: 0.25 },
};

/** XP per run by chain (index = chain), before stars and bonuses. */
export const RUN_XP = [40, 48, 57, 68, 80, 94, 110];
export const STAR_MULT = { scrap: [0, 1, 1.25, 1.5], xp: [0, 1, 1.15, 1.3] };
/** A death keeps this much of the run's scrap: base + perProgress × how far you got. */
export const DEATH_KEEP = { base: 0.15, perProgress: 0.35 };
export const DEATH_XP = { base: 0.3, perProgress: 0.4 };
export const COOP_BONUS = 0.1;

/** Survive chance from power vs recommended (same model as Road to Evac). */
export const ODDS = { atRec: 0.62, slope: 1.1, min: 0.08, max: 0.98, star2: 1.05, star3: 1.25, noise: 0.12 };

/** Injuries: the reason to have more than four people. Days tick once per run. */
export const INJURY = { win: 0.1, downedDays: [2, 3], winDays: 1, healGemsPerDay: 3 };
export const REVIVE = { gems: [8, 10, 12, 15, 18, 22, 25], minProgress: 0.3 };

// --- Wait rewards ---------------------------------------------------------------------------

/** The long wait: a convoy every 8 hours with a skilled survivor, scrap and gems. */
export const CONVOY = { every: 8 * 3600, first: 8 * 3600, scrapRuns: 1.5, gems: [5, 10], odds: [0, 0.7, 0.3] };
export const RUSH_GEMS_PER_HOUR = 4;

export const START = { scrap: 0, gems: 30, founders: [2, 1] };

export const TUNING_DEFAULTS = {
  scrap: 1, // run rewards
  costs: 1, // upgrade costs
  difficulty: 1, // recommended power
  xp: 1,
  gate: 1, // × time between visitors
  convoy: 1, // × time between convoys
  outcome: 'auto', // 'auto' | 'win' | 'lose'
  volume: 0.7,
  haptics: true,
};
