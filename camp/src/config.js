// All camp content and economy numbers live here, so the metagame can be tuned
// without touching logic. Times are in seconds and production is per hour.
// tests/camp-content.test.js checks that the tables stay consistent (every
// cost fits in storage at the camp level that unlocks it, ids resolve, etc.).

export const MIN = 60;
export const HOUR = 3600;
export const DAY = 24 * HOUR;

// --- Resources -------------------------------------------------------------------------

export const RESOURCES = ['food', 'wood', 'scrap'];

export const RES_INFO = {
  food: { name: 'Food', color: '#f2b84b' },
  wood: { name: 'Wood', color: '#d08f55' },
  scrap: { name: 'Scrap', color: '#a9bccb' },
  gems: { name: 'Gems', color: '#62e6ff' },
};

export const START = {
  res: { food: 120, wood: 160, scrap: 40 },
  gems: 50,
  survivors: 2,
};

/** Survivors the Command Post houses before any Bunkhouse beds. */
export const BASE_BEDS = 3;

/** A freshly built producer starts this full, so the first collect is instant. */
export const FIRST_FILL = 0.4;

// --- Weapons (ids match src/game/weapons.js in the action game) ------------------------

export const WEAPONS = {
  smg: { name: 'SMG', power: 0 },
  shotgun: { name: 'Pump Shotgun', power: 20 },
  rifle: { name: 'Assault Rifle', power: 30 },
  hunting: { name: 'Hunting Rifle', power: 40 },
};
export const BASE_WEAPONS = ['smg'];

/** Run power: a single number the simulated run compares to a zone's rating. */
export const POWER = {
  base: 100,
  perHp: 1, // per point of max HP above 100
  perDmg: 1.6, // per % of bonus damage
  medkit: 10, // per free Infirmary medkit
};

// --- Buildings ---------------------------------------------------------------------------
// Each level row: hq = Command Post level needed, cost, time, then the effect.
// `area` buildings sit behind rubble that has to be cleared first.

export const BUILDINGS = {
  hq: {
    name: 'Command Post',
    desc: 'The heart of the camp. Upgrade it to unlock buildings, builders and higher levels.',
    kind: 'hq',
    unlockHq: 0,
    start: 1,
    levels: [
      { cost: null, time: 0, cap: 400, builders: 1, needSurvivors: 0 },
      { cost: { wood: 100 }, time: 60, cap: 700, builders: 1, needSurvivors: 0 },
      { cost: { wood: 400, food: 200, scrap: 100 }, time: 5 * MIN, cap: 1000, builders: 2, needSurvivors: 0 },
      { cost: { wood: 1200, food: 800, scrap: 450 }, time: 30 * MIN, cap: 1600, builders: 2, needSurvivors: 4 },
      { cost: { wood: 3000, food: 2000, scrap: 1300 }, time: 2 * HOUR, cap: 2600, builders: 2, needSurvivors: 6 },
      { cost: { wood: 7000, food: 5000, scrap: 3500 }, time: 5 * HOUR, cap: 4500, builders: 3, needSurvivors: 8 },
      { cost: { wood: 14000, food: 10000, scrap: 7000 }, time: 10 * HOUR, cap: 8000, builders: 3, needSurvivors: 10 },
      { cost: { wood: 26000, food: 19000, scrap: 13000 }, time: 16 * HOUR, cap: 14000, builders: 3, needSurvivors: 12 },
    ],
  },

  garden: {
    name: 'Garden',
    desc: 'Raised beds and rain barrels. Grows food while you are away.',
    kind: 'producer',
    produces: 'food',
    unlockHq: 1,
    levels: [
      { hq: 1, cost: { wood: 50 }, time: 10, rate: 120, store: 120 },
      { hq: 2, cost: { wood: 120 }, time: 45, rate: 180, store: 270 },
      { hq: 3, cost: { wood: 260, scrap: 60 }, time: 4 * MIN, rate: 260, store: 520 },
      { hq: 4, cost: { wood: 600, scrap: 180 }, time: 15 * MIN, rate: 360, store: 1080 },
      { hq: 5, cost: { wood: 1300, scrap: 400 }, time: 50 * MIN, rate: 480, store: 1920 },
      { hq: 6, cost: { wood: 2800, scrap: 900 }, time: 2 * HOUR, rate: 640, store: 3840 },
      { hq: 7, cost: { wood: 5800, scrap: 1900 }, time: 4 * HOUR, rate: 840, store: 6700 },
      { hq: 8, cost: { wood: 11000, scrap: 3800 }, time: 7 * HOUR, rate: 1100, store: 11000 },
    ],
  },

  lumber: {
    name: 'Lumber Yard',
    desc: 'Survivors strip fences and fallen trees for wood, the camp\'s main building material.',
    kind: 'producer',
    produces: 'wood',
    unlockHq: 1,
    levels: [
      { hq: 1, cost: { food: 50 }, time: 10, rate: 150, store: 150 },
      { hq: 2, cost: { food: 120 }, time: 45, rate: 220, store: 330 },
      { hq: 3, cost: { food: 260, scrap: 60 }, time: 4 * MIN, rate: 320, store: 640 },
      { hq: 4, cost: { food: 600, scrap: 180 }, time: 15 * MIN, rate: 440, store: 1320 },
      { hq: 5, cost: { food: 1300, scrap: 400 }, time: 50 * MIN, rate: 590, store: 2360 },
      { hq: 6, cost: { food: 2800, scrap: 900 }, time: 2 * HOUR, rate: 780, store: 4680 },
      { hq: 7, cost: { food: 5800, scrap: 1900 }, time: 4 * HOUR, rate: 1020, store: 8160 },
      { hq: 8, cost: { food: 11000, scrap: 3800 }, time: 7 * HOUR, rate: 1330, store: 13300 },
    ],
  },

  scrapyard: {
    name: 'Scrapyard',
    desc: 'Strips wrecks for metal. Slow: most scrap comes home from runs.',
    kind: 'producer',
    produces: 'scrap',
    unlockHq: 2,
    levels: [
      { hq: 2, cost: { wood: 150, food: 80 }, time: 1 * MIN, rate: 50, store: 100 },
      { hq: 3, cost: { wood: 300, food: 160 }, time: 3 * MIN, rate: 75, store: 225 },
      { hq: 4, cost: { wood: 650, food: 350 }, time: 10 * MIN, rate: 105, store: 420 },
      { hq: 5, cost: { wood: 1400, food: 750 }, time: 35 * MIN, rate: 145, store: 725 },
      { hq: 6, cost: { wood: 3000, food: 1600 }, time: 1.5 * HOUR, rate: 195, store: 1170 },
      { hq: 7, cost: { wood: 6200, food: 3300 }, time: 3.5 * HOUR, rate: 260, store: 2080 },
      { hq: 8, cost: { wood: 12000, food: 6500 }, time: 6 * HOUR, rate: 340, store: 3400 },
    ],
  },

  warehouse: {
    name: 'Warehouse',
    desc: 'Raises how much food, wood and scrap the camp can hold.',
    kind: 'storage',
    unlockHq: 2,
    levels: [
      { hq: 2, cost: { wood: 120, scrap: 40 }, time: 45, cap: 600 },
      { hq: 3, cost: { wood: 300, scrap: 100 }, time: 3 * MIN, cap: 1200 },
      { hq: 4, cost: { wood: 700, scrap: 250 }, time: 10 * MIN, cap: 2400 },
      { hq: 5, cost: { wood: 1600, scrap: 600 }, time: 35 * MIN, cap: 4500 },
      { hq: 6, cost: { wood: 3800, scrap: 1400 }, time: 1.5 * HOUR, cap: 9500 },
      { hq: 7, cost: { wood: 8500, scrap: 3200 }, time: 3.5 * HOUR, cap: 18000 },
      { hq: 8, cost: { wood: 17000, scrap: 6500 }, time: 6 * HOUR, cap: 30000 },
    ],
  },

  armory: {
    name: 'Armory',
    desc: 'Unlocks guns for your runs and makes every gun hit harder.',
    kind: 'armory',
    unlockHq: 2,
    levels: [
      { hq: 2, cost: { scrap: 100, wood: 80 }, time: 1 * MIN, dmg: 5 },
      { hq: 2, cost: { scrap: 220, wood: 160 }, time: 3 * MIN, dmg: 10, weapon: 'shotgun' },
      { hq: 3, cost: { scrap: 480, wood: 320 }, time: 8 * MIN, dmg: 15 },
      { hq: 4, cost: { scrap: 1100, wood: 700 }, time: 30 * MIN, dmg: 20, weapon: 'rifle' },
      { hq: 5, cost: { scrap: 2400, wood: 1500 }, time: 1.5 * HOUR, dmg: 25 },
      { hq: 6, cost: { scrap: 5000, wood: 3200 }, time: 3.5 * HOUR, dmg: 30, weapon: 'hunting' },
      { hq: 7, cost: { scrap: 10000, wood: 6500 }, time: 6 * HOUR, dmg: 35 },
      { hq: 8, cost: { scrap: 19000, wood: 12000 }, time: 9 * HOUR, dmg: 40 },
    ],
  },

  radio: {
    name: 'Radio Tower',
    desc: 'Picks up chatter about new places to scavenge, and survivors calling for help.',
    kind: 'radio',
    unlockHq: 2,
    levels: [
      { hq: 2, cost: { scrap: 120, wood: 100 }, time: 1 * MIN, zone: 'downtown', rescue: 0 },
      { hq: 3, cost: { scrap: 400, wood: 300 }, time: 6 * MIN, zone: 'industrial', rescue: 5 },
      { hq: 5, cost: { scrap: 1800, wood: 1300 }, time: 1 * HOUR, zone: 'hospital', rescue: 10 },
      { hq: 7, cost: { scrap: 6000, wood: 4500 }, time: 4 * HOUR, zone: 'military', rescue: 15 },
      { hq: 8, cost: { scrap: 12000, wood: 9000 }, time: 7 * HOUR, rescue: 20 },
    ],
  },

  bunkhouse: {
    name: 'Bunkhouse',
    desc: 'Beds for the people you rescue. More survivors means more expedition crews.',
    kind: 'housing',
    unlockHq: 3,
    levels: [
      { hq: 3, cost: { wood: 200, food: 150 }, time: 2 * MIN, beds: 2 },
      { hq: 4, cost: { wood: 500, food: 350 }, time: 8 * MIN, beds: 4 },
      { hq: 5, cost: { wood: 1100, food: 800 }, time: 25 * MIN, beds: 6 },
      { hq: 6, cost: { wood: 2500, food: 1800 }, time: 1.5 * HOUR, beds: 8 },
      { hq: 7, cost: { wood: 5200, food: 3800 }, time: 3 * HOUR, beds: 10 },
      { hq: 8, cost: { wood: 10000, food: 7500 }, time: 5 * HOUR, beds: 12 },
    ],
  },

  infirmary: {
    name: 'Infirmary',
    desc: 'Patches you up between runs: more max health, and free medkits.',
    kind: 'infirmary',
    unlockHq: 3,
    area: 'east',
    levels: [
      { hq: 3, cost: { food: 200, scrap: 100 }, time: 2 * MIN, hp: 15, medkits: 0 },
      { hq: 4, cost: { food: 500, scrap: 250 }, time: 8 * MIN, hp: 30, medkits: 1 },
      { hq: 5, cost: { food: 1100, scrap: 550 }, time: 30 * MIN, hp: 45, medkits: 1 },
      { hq: 6, cost: { food: 2500, scrap: 1200 }, time: 1.5 * HOUR, hp: 60, medkits: 1 },
      { hq: 7, cost: { food: 5200, scrap: 2600 }, time: 3.5 * HOUR, hp: 75, medkits: 2 },
      { hq: 8, cost: { food: 10000, scrap: 5000 }, time: 6 * HOUR, hp: 90, medkits: 2 },
    ],
  },

  garage: {
    name: 'Garage',
    desc: 'A truck that hauls more loot home from runs, and crews out on expeditions.',
    kind: 'garage',
    unlockHq: 4,
    area: 'east',
    levels: [
      { hq: 4, cost: { scrap: 500, wood: 400 }, time: 10 * MIN, loot: 10, slots: 1 },
      { hq: 5, cost: { scrap: 1200, wood: 1000 }, time: 40 * MIN, loot: 20, slots: 1 },
      { hq: 6, cost: { scrap: 2800, wood: 2200 }, time: 2 * HOUR, loot: 30, slots: 2 },
      { hq: 7, cost: { scrap: 6000, wood: 4800 }, time: 4 * HOUR, loot: 40, slots: 2 },
      { hq: 8, cost: { scrap: 12000, wood: 9500 }, time: 7 * HOUR, loot: 50, slots: 3 },
    ],
  },

  workshop: {
    name: 'Workshop',
    desc: 'Crafts medkits and throwables to take on your next run.',
    kind: 'workshop',
    unlockHq: 5,
    area: 'far',
    levels: [
      { hq: 5, cost: { scrap: 1000, wood: 700 }, time: 30 * MIN, slots: 1, speed: 0, recipe: 'medkit' },
      { hq: 6, cost: { scrap: 2500, wood: 1700 }, time: 2 * HOUR, slots: 2, speed: 10, recipe: 'pipebomb' },
      { hq: 7, cost: { scrap: 5500, wood: 3800 }, time: 4 * HOUR, slots: 2, speed: 20, recipe: 'molotov' },
      { hq: 8, cost: { scrap: 11000, wood: 7500 }, time: 7 * HOUR, slots: 3, speed: 30 },
    ],
  },
};

/** Display order (build menus, lists). */
export const BUILDING_ORDER = [
  'hq', 'garden', 'lumber', 'armory', 'radio', 'scrapyard', 'warehouse', 'bunkhouse', 'infirmary', 'garage', 'workshop',
];

// --- Rubble: camp expansions ------------------------------------------------------------

export const RUBBLE = {
  east: {
    name: 'Wrecked Cars',
    desc: 'A pile-up blocks the east yard. Clear it to make room for more buildings.',
    hq: 3,
    cost: { wood: 300, food: 200 },
    time: 5 * MIN,
  },
  far: {
    name: 'Collapsed Shed',
    desc: 'Beyond the east yard: a collapsed shed with a solid concrete floor.',
    hq: 5,
    cost: { wood: 1600, scrap: 700 },
    time: 40 * MIN,
  },
};

// --- Runs (the action game; simulated in this prototype) ---------------------------------
// rec = recommended run power. `radio` = Radio Tower level that reveals the zone.
// Loot is for a win; a death keeps part of it (see run-sim.js).

export const ZONES = [
  {
    id: 'suburbs',
    name: 'Suburbs',
    desc: 'Quiet streets and scattered infected. A good place to learn the ropes.',
    rec: 90,
    radio: 0,
    loot: { scrap: 80, wood: 60, food: 50 },
    rescue: 0.25,
    firstGems: 10,
    kills: 45,
    duration: 300,
  },
  {
    id: 'downtown',
    name: 'Downtown',
    desc: 'Dense blocks, car alarms and the first Hunters.',
    rec: 150,
    radio: 1,
    loot: { scrap: 180, wood: 120, food: 100 },
    rescue: 0.3,
    firstGems: 20,
    kills: 80,
    duration: 360,
  },
  {
    id: 'industrial',
    name: 'Industrial Park',
    desc: 'Warehouses full of scrap. Something big lives among them.',
    rec: 210,
    radio: 2,
    loot: { scrap: 400, wood: 260, food: 220 },
    rescue: 0.3,
    firstGems: 30,
    kills: 120,
    duration: 420,
  },
  {
    id: 'hospital',
    name: 'Mercy Hospital',
    desc: 'Medicine and survivors, guarded by the worst of the infected.',
    rec: 290,
    radio: 3,
    loot: { scrap: 800, wood: 520, food: 440 },
    rescue: 0.4,
    firstGems: 40,
    kills: 160,
    duration: 480,
  },
  {
    id: 'military',
    name: 'Military Base',
    desc: 'The jackpot. Nobody has come back from it yet.',
    rec: 380,
    radio: 4,
    loot: { scrap: 1500, wood: 950, food: 800 },
    rescue: 0.45,
    firstGems: 60,
    kills: 220,
    duration: 540,
  },
];

/** Win chance = 0.75 at the recommended power, ±0.8 per 100% power difference. */
export const WIN_CHANCE = { atRec: 0.75, slope: 0.8, min: 0.05, max: 0.97 };

// --- Expeditions (Garage): idle trips by survivor crews ------------------------------------

export const EXPEDITIONS = [
  { id: 'scout', name: 'Scout the Block', time: 15 * MIN, crew: 1, garage: 1, loot: { food: 80, wood: 80, scrap: 30 }, gemChance: 0, gems: [0, 0], survivorChance: 0 },
  { id: 'supply', name: 'Supply Run', time: 1 * HOUR, crew: 2, garage: 1, loot: { food: 250, wood: 250, scrap: 120 }, gemChance: 0.25, gems: [1, 3], survivorChance: 0.05 },
  { id: 'haul', name: 'Long Haul', time: 4 * HOUR, crew: 3, garage: 2, loot: { food: 800, wood: 800, scrap: 400 }, gemChance: 0.5, gems: [2, 5], survivorChance: 0.15 },
  { id: 'raid', name: 'Deep Raid', time: 8 * HOUR, crew: 4, garage: 3, loot: { food: 1500, wood: 1500, scrap: 800 }, gemChance: 1, gems: [4, 8], survivorChance: 0.3 },
];

/** Expedition loot multiplier by Command Post level (index = level). */
export const EXPEDITION_SCALE = [0, 1, 1, 1, 1, 1.3, 1.8, 2.4, 3.2];

// --- Workshop recipes: consumables packed for the next run ----------------------------------

export const RECIPES = [
  { id: 'medkit', name: 'Medkit', desc: 'Heals you once during a run.', cost: { food: 150, scrap: 50 }, time: 8 * MIN, power: 12 },
  { id: 'pipebomb', name: 'Pipe Bomb', desc: 'Beeps, pulls the horde in, then goes off.', cost: { scrap: 220, wood: 80 }, time: 15 * MIN, power: 18 },
  { id: 'molotov', name: 'Molotov', desc: 'A wall of fire between you and them.', cost: { scrap: 160, wood: 120, food: 120 }, time: 25 * MIN, power: 24 },
];

/** How many of each crafted item one run can carry. */
export const CARRY_PER_ITEM = 1;

// --- Wait rewards in the camp screen ---------------------------------------------------------
// interval / first are defaults; the tuning panel can change them live.

export const REWARDS = {
  short: {
    name: 'Supply Crate',
    desc: 'Scavengers drop off whatever they found nearby.',
    interval: 10 * MIN,
    first: 2 * MIN,
    loot: { food: 40, wood: 50, scrap: 20 },
    gemChance: 0.15,
    gems: [1, 3],
    survivorChance: 0,
    skippable: false,
  },
  long: {
    name: 'Airdrop',
    desc: 'A supply plane passes over the camp a few times a day.',
    interval: 8 * HOUR,
    first: 8 * HOUR,
    loot: { food: 300, wood: 300, scrap: 200 },
    gemChance: 1,
    gems: [15, 25],
    survivorChance: 0.3,
    skippable: true,
  },
};

/** Wait-reward size by Command Post level (index = level). */
export const REWARD_SCALE = [0, 1, 1.5, 2.2, 3.2, 4.6, 6.5, 9, 12.5];

// --- Hard currency --------------------------------------------------------------------------
// Rushing a timer: piecewise-linear through these [seconds, gems] anchors (the
// classic mobile curve: a minute is 1 gem, an hour 20, a day 260, a week 1000).

export const GEM_ANCHORS = [
  [0, 0],
  [60, 1],
  [HOUR, 20],
  [DAY, 260],
  [7 * DAY, 1000],
];

/** Buying missing resources: units per gem. */
export const GEMS_PER_RES = { food: 40, wood: 40, scrap: 20 };

/** Gem spends at or above this ask for a second tap to confirm. */
export const CONFIRM_GEMS = 15;

// --- Objectives -------------------------------------------------------------------------------
// One at a time, in order. Goals: level [building, n] | stat [key, n] |
// survivors n | cleared area | zoneWin [zone, n]. `focus` is where "Go" takes you.

export const QUESTS = [
  { text: 'Build a Garden', goal: { level: ['garden', 1] }, reward: { wood: 60 }, focus: 'garden' },
  { text: 'Build a Lumber Yard', goal: { level: ['lumber', 1] }, reward: { food: 60 }, focus: 'lumber' },
  { text: 'Collect from a building', goal: { stat: ['collects', 1] }, reward: { gems: 10 }, focus: 'garden' },
  { text: 'Go on a run', goal: { stat: ['runs', 1] }, reward: { gems: 10 }, focus: 'play' },
  { text: 'Upgrade the Command Post to Lv 2', goal: { level: ['hq', 2] }, reward: { gems: 20 }, focus: 'hq' },
  { text: 'Build the Armory', goal: { level: ['armory', 1] }, reward: { scrap: 80 }, focus: 'armory' },
  { text: 'Open a Supply Crate', goal: { stat: ['crates', 1] }, reward: { gems: 10 }, focus: 'short' },
  { text: 'Build the Radio Tower', goal: { level: ['radio', 1] }, reward: { wood: 120 }, focus: 'radio' },
  { text: 'Survive a run Downtown', goal: { zoneWin: ['downtown', 1] }, reward: { gems: 20 }, focus: 'play' },
  { text: 'Upgrade the Armory to Lv 2', goal: { level: ['armory', 2] }, reward: { food: 150 }, focus: 'armory' },
  { text: 'Build the Scrapyard', goal: { level: ['scrapyard', 1] }, reward: { wood: 150 }, focus: 'scrapyard' },
  { text: 'Build the Warehouse', goal: { level: ['warehouse', 1] }, reward: { scrap: 120 }, focus: 'warehouse' },
  { text: 'Upgrade the Command Post to Lv 3', goal: { level: ['hq', 3] }, reward: { gems: 30 }, focus: 'hq' },
  { text: 'Clear the wrecked cars', goal: { cleared: 'east' }, reward: { wood: 250 }, focus: 'east' },
  { text: 'Build the Infirmary', goal: { level: ['infirmary', 1] }, reward: { food: 250 }, focus: 'infirmary' },
  { text: 'Build the Bunkhouse', goal: { level: ['bunkhouse', 1] }, reward: { gems: 15 }, focus: 'bunkhouse' },
  { text: 'Grow the camp to 4 survivors', goal: { survivors: 4 }, reward: { gems: 20 }, focus: 'play' },
  { text: 'Upgrade the Garden to Lv 3', goal: { level: ['garden', 3] }, reward: { scrap: 200 }, focus: 'garden' },
  { text: 'Upgrade the Warehouse to Lv 2', goal: { level: ['warehouse', 2] }, reward: { wood: 300 }, focus: 'warehouse' },
  { text: 'Upgrade the Command Post to Lv 4', goal: { level: ['hq', 4] }, reward: { gems: 40 }, focus: 'hq' },
  { text: 'Build the Garage', goal: { level: ['garage', 1] }, reward: { food: 400 }, focus: 'garage' },
  { text: 'Send out an expedition', goal: { stat: ['expeditions', 1] }, reward: { gems: 15 }, focus: 'garage' },
  { text: 'Upgrade the Radio Tower to Lv 2', goal: { level: ['radio', 2] }, reward: { scrap: 300 }, focus: 'radio' },
  { text: 'Survive the Industrial Park', goal: { zoneWin: ['industrial', 1] }, reward: { gems: 25 }, focus: 'play' },
  { text: 'Upgrade the Armory to Lv 4', goal: { level: ['armory', 4] }, reward: { wood: 600 }, focus: 'armory' },
  { text: 'Upgrade the Command Post to Lv 5', goal: { level: ['hq', 5] }, reward: { gems: 50 }, focus: 'hq' },
  { text: 'Clear the collapsed shed', goal: { cleared: 'far' }, reward: { scrap: 500 }, focus: 'far' },
  { text: 'Build the Workshop', goal: { level: ['workshop', 1] }, reward: { gems: 25 }, focus: 'workshop' },
  { text: 'Craft a Medkit', goal: { stat: ['crafts', 1] }, reward: { food: 600 }, focus: 'workshop' },
  { text: 'Upgrade the Radio Tower to Lv 3', goal: { level: ['radio', 3] }, reward: { scrap: 800 }, focus: 'radio' },
  { text: 'Survive Mercy Hospital', goal: { zoneWin: ['hospital', 1] }, reward: { gems: 40 }, focus: 'play' },
  { text: 'Upgrade the Command Post to Lv 6', goal: { level: ['hq', 6] }, reward: { gems: 60 }, focus: 'hq' },
  { text: 'Upgrade the Armory to Lv 6', goal: { level: ['armory', 6] }, reward: { gems: 40 }, focus: 'armory' },
  { text: 'Upgrade the Command Post to Lv 7', goal: { level: ['hq', 7] }, reward: { gems: 80 }, focus: 'hq' },
  { text: 'Survive the Military Base', goal: { zoneWin: ['military', 1] }, reward: { gems: 60 }, focus: 'play' },
  { text: 'Upgrade the Command Post to Lv 8', goal: { level: ['hq', 8] }, reward: { gems: 100 }, focus: 'hq' },
];

// --- Live tuning (dev panel) -------------------------------------------------------------------

export const TUNING_DEFAULTS = Object.freeze({
  buildTime: 1, // × every build / clear / craft / expedition timer started from now on
  production: 1, // × producer rates
  loot: 1, // × run loot
  gemCost: 1, // × rush prices
  shortMinutes: REWARDS.short.interval / MIN,
  longHours: REWARDS.long.interval / HOUR,
  outcome: 'auto', // simulated runs: 'auto' | 'win' | 'lose'
  runTime: true, // a simulated run moves the camp clock forward by the run's length
  awayMinutes: 3, // show the welcome-back summary after this long away
  volume: 0.7,
  haptics: true,
});
