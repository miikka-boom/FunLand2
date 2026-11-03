// Every Safehouse number and piece of content lives here, so tuning never
// needs code changes (design doc: "Everything is data"). Times are seconds.
// Station tables follow the doc's data shape: { station, levels: [{ level,
// buildSeconds, cost, chaptersCleared, powerDraw, ... }], jobs: [{ id,
// unlockLevel, seconds, cost, fuel, output }] }.
// tests/safehouse-content.test.js keeps the tables consistent.
// All values are starting points for tuning, not tested figures.

export const MIN = 60;
export const HOUR = 3600;
export const DAY = 24 * HOUR;

// --- Resources ------------------------------------------------------------------------------
// `value` is the worth of one unit in Scrap. A payout above a storage cap
// converts to Scrap at OVERFLOW_RATE of that value, so nothing is wasted.

export const RESOURCES = ['scrap', 'parts', 'supplies', 'fuel'];

export const RES_INFO = {
  scrap: { name: 'Scrap', color: '#c9d2da', value: 1, spent: 'Station upgrades, most crafts', earned: 'Every mission, Scrap Yard' },
  parts: { name: 'Parts', color: '#6fc8ff', value: 5, spent: 'High station levels, weapon upgrades, electronics', earned: 'Mission crates' },
  supplies: { name: 'Supplies', color: '#8fe08a', value: 2, spent: 'Medical and ammo recipes', earned: 'Mission pickups' },
  fuel: { name: 'Fuel', color: '#ffad4d', value: 4, spent: 'Starting any craft or production job', earned: 'Fuel cans in missions' },
};

export const OVERFLOW_RATE = 0.5;

/** What you have when you move in: enough to board up the door and start the Generator. */
export const START = { res: { scrap: 250, parts: 0, supplies: 20, fuel: 6 } };

// --- Upgrade rules ----------------------------------------------------------------------------
// The base ladder. Each station multiplies its costs by `factor` (0.5x-2x).
// Maxing one station takes 0 + 10 min + 1 h + 6 h + 24 h, about 31 hours of timers.

export const LADDER = [
  { level: 1, buildSeconds: 0, scrap: 100, parts: 0, chaptersCleared: 0 },
  { level: 2, buildSeconds: 10 * MIN, scrap: 250, parts: 10, chaptersCleared: 1 },
  { level: 3, buildSeconds: 1 * HOUR, scrap: 600, parts: 30, chaptersCleared: 3 },
  { level: 4, buildSeconds: 6 * HOUR, scrap: 1500, parts: 80, chaptersCleared: 6 },
  { level: 5, buildSeconds: 24 * HOUR, scrap: 3500, parts: 200, chaptersCleared: 10 },
];

/** A station can never be higher than the Barricade level + this. */
export const BARRICADE_LEAD = 1;

const round5 = (v) => Math.round(v / 5) * 5;

/** Level rows for a station: the base ladder times `factor`, plus per-level effects. */
function ladder(factor, powerDraw, effects) {
  return LADDER.map((step, i) => {
    const cost = {};
    const scrap = round5(step.scrap * factor);
    const parts = Math.round(step.parts * factor);
    if (scrap > 0) cost.scrap = scrap;
    if (parts > 0) cost.parts = parts;
    return { level: step.level, buildSeconds: step.buildSeconds, cost, chaptersCleared: step.chaptersCleared, powerDraw, ...(effects[i] || {}) };
  });
}

// --- Stations -----------------------------------------------------------------------------------
// unlock: Barricade level needed to build level 1. `base` holds the effect
// values while the station is still unbuilt (level 0). `start` stations are
// pre-built for free.

export const STATIONS = {
  barricade: {
    station: 'barricade',
    name: 'Barricade',
    question: 'How big can the Safehouse grow?',
    desc: 'Caps every other station at Barricade level + 1. Raises storage caps and unlocks new stations.',
    unlock: 0,
    factor: 1.5,
    base: { partsCap: 30, suppliesCap: 60, buildSlots: 1 },
    levels: ladder(1.5, 0, [
      { partsCap: 60, suppliesCap: 150, buildSlots: 1 },
      { partsCap: 150, suppliesCap: 300, buildSlots: 1 },
      { partsCap: 300, suppliesCap: 500, buildSlots: 2 },
      { partsCap: 500, suppliesCap: 750, buildSlots: 2 },
      { partsCap: 800, suppliesCap: 1000, buildSlots: 3 },
    ]),
    jobs: [],
  },

  generator: {
    station: 'generator',
    name: 'Generator',
    question: 'What can run at once?',
    desc: 'Sets power capacity and Fuel tank size. Every running job draws power; starting one burns Fuel.',
    unlock: 0,
    factor: 1,
    base: { powerCap: 0, fuelTank: 10 },
    levels: ladder(1, 0, [
      { powerCap: 3, fuelTank: 20 },
      { powerCap: 4, fuelTank: 40 },
      { powerCap: 5, fuelTank: 70 },
      { powerCap: 6, fuelTank: 110 },
      { powerCap: 8, fuelTank: 160 },
    ]),
    jobs: [],
  },

  barracks: {
    station: 'barracks',
    name: 'Barracks',
    question: 'Who comes with us?',
    desc: 'Houses named survivors who play as bot teammates, one bunk per level. Well Rested survivors bond faster.',
    unlock: 0,
    factor: 1,
    start: 1,
    base: { bunks: 0, rested: 0 },
    levels: ladder(1, 0, [
      { bunks: 1, rested: 10 },
      { bunks: 2, rested: 20 },
      { bunks: 3, rested: 30 },
      { bunks: 4, rested: 40, bondChapters: true },
      { bunks: 5, rested: 50, perkSlot: true },
    ]),
    jobs: [],
  },

  workshop: {
    station: 'workshop',
    name: 'Workshop',
    question: 'What do we carry?',
    desc: 'Crafts throwables and ammo packs for the loadout. Unlocks weapon attachments.',
    unlock: 1,
    factor: 0.75,
    base: {},
    levels: ladder(0.75, 2, [{}, {}, { attachment: 'laser' }, {}, { attachment: 'drum' }]),
    jobs: [
      { id: 'pipe_bomb', unlockLevel: 1, seconds: 2 * MIN, cost: { scrap: 20, parts: 5 }, fuel: 1, output: { item: 'pipe_bomb', slot: 'throwable', count: 1 } },
      { id: 'molotov', unlockLevel: 2, seconds: 3 * MIN, cost: { scrap: 15, supplies: 5 }, fuel: 1, output: { item: 'molotov', slot: 'throwable', count: 1 } },
      { id: 'lure_flare', unlockLevel: 3, seconds: 5 * MIN, cost: { scrap: 25, parts: 10 }, fuel: 2, output: { item: 'lure_flare', slot: 'throwable', count: 1 } },
      { id: 'ammo_pack', unlockLevel: 4, seconds: 6 * MIN, cost: { scrap: 30, parts: 10, supplies: 10 }, fuel: 2, output: { item: 'ammo_pack', slot: 'boost', count: 1 } },
    ],
  },

  infirmary: {
    station: 'infirmary',
    name: 'Infirmary',
    question: 'How do we heal?',
    desc: 'Crafts first-aid kits, pills, adrenaline and defibrillators. Higher levels add starting temporary health.',
    unlock: 1,
    factor: 1,
    base: { tempHp: 0 },
    levels: ladder(1, 2, [{ tempHp: 0 }, { tempHp: 10 }, { tempHp: 20 }, { tempHp: 30 }, { tempHp: 50 }]),
    jobs: [
      { id: 'first_aid_kit', unlockLevel: 1, seconds: 3 * MIN, cost: { supplies: 20 }, fuel: 1, output: { item: 'first_aid_kit', slot: 'heal', count: 1 } },
      { id: 'pain_pills', unlockLevel: 2, seconds: 2 * MIN, cost: { supplies: 10 }, fuel: 1, output: { item: 'pain_pills', slot: 'boost', count: 1 } },
      { id: 'adrenaline', unlockLevel: 3, seconds: 4 * MIN, cost: { supplies: 15, parts: 5 }, fuel: 1, output: { item: 'adrenaline', slot: 'boost', count: 1 } },
      { id: 'defibrillator', unlockLevel: 4, seconds: 15 * MIN, cost: { supplies: 30, parts: 20 }, fuel: 3, output: { item: 'defibrillator', slot: 'heal', count: 1 } },
    ],
  },

  armory: {
    station: 'armory',
    name: 'Armory',
    question: 'What do we shoot with?',
    desc: 'Permanent weapon unlocks and weapon upgrades. Adds loadout presets.',
    unlock: 2,
    factor: 1.25,
    base: { maxTier: 1, presets: 0 },
    levels: ladder(1.25, 0, [
      { weapon: 'shotgun', maxTier: 2, presets: 1 },
      { weapon: 'rifle', maxTier: 2, presets: 2 },
      { weapon: 'hunting', maxTier: 3, presets: 2 },
      { maxTier: 4, presets: 3 },
      { maxTier: 5, presets: 3 },
    ]),
    jobs: [],
  },

  radio: {
    station: 'radio',
    name: 'Radio Room',
    question: 'Where do we go next?',
    desc: 'Opens new chapters and daily orders. Rescue calls come in whenever a Barracks bunk is free.',
    unlock: 2,
    factor: 1,
    base: { chapters: 3, orderScale: 0 },
    levels: ladder(1, 0, [
      { chapters: 5, orderScale: 1 },
      { chapters: 7, orderScale: 1.25 },
      { chapters: 9, orderScale: 1.5 },
      { chapters: 11, orderScale: 1.75 },
      { chapters: 12, orderScale: 2 },
    ]),
    jobs: [],
  },

  scrapyard: {
    station: 'scrapyard',
    name: 'Scrap Yard',
    question: 'What keeps coming in while we are out?',
    desc: 'Produces Scrap passively while it runs. Stops after 8 hours of output until it is collected.',
    unlock: 3,
    factor: 0.5,
    base: { scrapPerHour: 0 },
    storeHours: 8,
    levels: ladder(0.5, 1, [{ scrapPerHour: 30 }, { scrapPerHour: 36 }, { scrapPerHour: 42 }, { scrapPerHour: 48 }, { scrapPerHour: 54 }]),
    // A production run: 1 Fuel to start, draws 1 power, runs until the pile is full.
    jobs: [{ id: 'scrap_run', unlockLevel: 1, seconds: null, cost: {}, fuel: 1, output: { res: 'scrap' } }],
  },
};

/** Lists and menus. */
export const STATION_ORDER = ['barricade', 'generator', 'barracks', 'workshop', 'infirmary', 'armory', 'radio', 'scrapyard'];

/** Every job by id, with its station. */
export const RECIPES = Object.fromEntries(
  Object.values(STATIONS).flatMap((st) => st.jobs.map((j) => [j.id, { ...j, station: st.station }])),
);

// --- Loadout ---------------------------------------------------------------------------------------
// Three mission slots per player. The heal slot always holds at least the free
// bandage. Items wait in the Loadout Crate, up to CRATE_MAX per type; anything
// not used in a mission goes back into it.

export const SLOTS = ['throwable', 'heal', 'boost'];
export const SLOT_INFO = {
  throwable: { name: 'Throwable', hint: 'Used on the horde' },
  heal: { name: 'Heal', hint: 'Used when a stretch goes wrong' },
  boost: { name: 'Boost', hint: 'Used on the hardest stretch' },
};
export const CRATE_MAX = 10;
export const FREE_HEAL = 'bandage';

// effect.threat: cuts the horde stretch's threat. effect.save: chance to save
// a stretch that went wrong. effect.revive: always saves one (used last).
// effect.power: squad power bonus on the hardest stretch.
export const ITEMS = {
  pipe_bomb: { name: 'Pipe bomb', slot: 'throwable', effect: { threat: 0.12 }, text: '-12% threat when the horde comes' },
  molotov: { name: 'Molotov', slot: 'throwable', effect: { threat: 0.16 }, text: '-16% threat when the horde comes' },
  lure_flare: { name: 'Lure flare', slot: 'throwable', effect: { threat: 0.2 }, text: '-20% threat when the horde comes' },
  bandage: { name: 'Bandage', slot: 'heal', free: true, effect: { save: 0.3 }, text: 'Free for everyone. Saves a stretch that goes wrong 30% of the time' },
  first_aid_kit: { name: 'First-aid kit', slot: 'heal', effect: { save: 0.6 }, text: 'Saves a stretch that goes wrong 60% of the time' },
  defibrillator: { name: 'Defibrillator', slot: 'heal', effect: { revive: true }, text: 'Revives a downed teammate: always saves one stretch' },
  pain_pills: { name: 'Pain pills', slot: 'boost', effect: { power: 0.08 }, text: '+8% squad power on the hardest stretch' },
  adrenaline: { name: 'Adrenaline shot', slot: 'boost', effect: { power: 0.15 }, text: '+15% squad power on the hardest stretch' },
  ammo_pack: { name: 'Ammo pack', slot: 'boost', effect: { power: 0.2 }, text: 'Incendiary rounds: +20% squad power on the hardest stretch' },
};

// --- Weapons (ids match src/game/weapons.js in the action game) --------------------------------------
// Unlocks come from Armory levels. Upgrades are instant (the Armory runs no
// jobs) and cap at the Armory's maxTier.

export const WEAPONS = {
  smg: { name: 'SMG', power: 8, text: 'Fast and forgiving' },
  shotgun: { name: 'Pump Shotgun', power: 12, text: 'Clears a doorway' },
  rifle: { name: 'Assault Rifle', power: 16, text: 'Pierces two' },
  hunting: { name: 'Hunting Rifle', power: 20, text: 'Pierces whole lines' },
};
export const WEAPON_ORDER = ['smg', 'shotgun', 'rifle', 'hunting'];
export const BASE_WEAPONS = ['smg'];

export const WEAPON_TIERS = [
  { tier: 1, name: 'Mk I', mult: 1, cost: null },
  { tier: 2, name: 'Mk II', mult: 1.25, cost: { scrap: 120, parts: 10 } },
  { tier: 3, name: 'Mk III', mult: 1.5, cost: { scrap: 300, parts: 25 } },
  { tier: 4, name: 'Mk IV', mult: 1.75, cost: { scrap: 700, parts: 60 } },
  { tier: 5, name: 'Mk V', mult: 2, cost: { scrap: 1500, parts: 120 } },
];

/** Workshop unlocks: permanent, apply to every gun. */
export const ATTACHMENTS = {
  laser: { name: 'Laser sights', mult: 1.1, text: '+10% weapon power on every gun' },
  drum: { name: 'Drum magazines', mult: 1.1, text: '+10% weapon power on every gun' },
};

// --- Squad --------------------------------------------------------------------------------------------
// Four survivors per squad: you plus three. Named survivors fill empty slots
// and play as bots, tuned just below a competent human; generic bots cover
// only slots no survivor has filled yet.

export const SQUAD_SIZE = 4;

export const POWER = {
  you: 40, // a competent human, before the gun
  friend: 40, // a friend, before their gun
  survivor: 30, // a named survivor at bond 0
  perBond: 2, // so bond 5 = 40: still below a human with a gun
  bot: 20, // generic stand-in
  perTempHp: 0.1, // per point of starting temporary health, per squad member
};

/** Simulated friends for co-op. Their Safehouse feeds the shared strengths. */
export const FRIENDS = {
  rookie: {
    name: 'Sam',
    label: 'New friend',
    text: 'Moved in last week: Barricade 1.',
    portrait: 'friend_rookie',
    weapon: 'shotgun',
    tier: 1,
    infirmary: 1,
    barracks: 1,
    items: { throwable: 'pipe_bomb', heal: 'bandage', boost: null },
  },
  veteran: {
    name: 'Alex',
    label: 'Veteran friend',
    text: 'A month in: Barricade 4, Infirmary 4, Barracks 4.',
    portrait: 'friend_veteran',
    weapon: 'rifle',
    tier: 3,
    infirmary: 4,
    barracks: 4,
    items: { throwable: 'molotov', heal: 'first_aid_kit', boost: 'adrenaline' },
  },
};

// --- Named survivors ------------------------------------------------------------------------------------
// Written by the developers: players never rename or create them. Names,
// bios, lines and scenes are in story.js. `arrives`: start | chapter n
// (scripted finale rescue) | radio (rescue call when a bunk is free).

export const SURVIVORS = {
  nadia: {
    name: 'Nadia Reyes',
    short: 'Nadia',
    role: 'Paramedic',
    arrives: { start: true },
    perk: { id: 'medic', name: 'Field Medic', text: 'Heal items work 25% better', up: 'Heal items work 40% better', values: [0.25, 0.4] },
    veteran: { id: 'triage', name: 'Triage', text: 'Once per mission, an extra 25% chance to save a stretch that goes wrong', value: 0.25 },
  },
  theo: {
    name: 'Theo Marsh',
    short: 'Theo',
    role: 'Chemistry teacher',
    arrives: { chapter: 1 },
    perk: { id: 'chemist', name: 'Chemist', text: 'Throwables are 25% stronger', up: 'Throwables are 40% stronger', values: [0.25, 0.4] },
    veteran: { id: 'improvised', name: 'Improvised', text: 'One throwable in three comes back unused', value: 1 / 3 },
  },
  grace: {
    name: 'Grace Adeyemi',
    short: 'Grace',
    role: 'Range officer',
    arrives: { chapter: 3 },
    perk: { id: 'overwatch', name: 'Overwatch', text: '+10% squad power when the horde or finale hits', up: '+15% squad power when the horde or finale hits', values: [0.1, 0.15] },
    veteran: { id: 'steady', name: 'Steady Hands', text: '+5% squad power on every stretch', value: 0.05 },
  },
  lukas: {
    name: 'Lukas Brandt',
    short: 'Lukas',
    role: 'Long-haul trucker',
    arrives: { radio: true },
    perk: { id: 'siphon', name: 'Siphon', text: 'Brings home +2 Fuel from every mission', up: 'Brings home +3 Fuel from every mission', values: [2, 3] },
    veteran: { id: 'backroads', name: 'Back Roads', text: '+20% Parts from every safe room', value: 0.2 },
  },
  mei: {
    name: 'Mei Tanaka',
    short: 'Mei',
    role: 'Bike courier',
    arrives: { radio: true },
    perk: { id: 'scavenger', name: 'Scavenger', text: '+15% Scrap and Supplies from pickups', up: '+25% Scrap and Supplies from pickups', values: [0.15, 0.25] },
    veteran: { id: 'shortcut', name: 'Shortcut', text: 'Always finds the fuel cans', value: 1 },
  },
};
export const SURVIVOR_ORDER = ['nadia', 'theo', 'grace', 'lukas', 'mei'];

/** Bond: missions played side by side. XP thresholds for levels 0..5. */
export const BOND = {
  xpPerMission: 100,
  wipeShare: 0.5, // a wiped mission still counts for half
  levels: [0, 250, 750, 1600, 2800, 4400],
  names: ['Strangers', 'Acquainted', 'Friendly', 'Trusted', 'Close', 'Family'],
  perkUpAt: 3, // the small perk upgrade
  bondChapterAt: 3, // bond level for a bond chapter (Barracks 4)
  bondChapterXp: 600,
};

// --- Missions ----------------------------------------------------------------------------------------------
// A chapter is three missions; the third is the finale. Missions are split
// into stretches by safe rooms, and loot is banked at each safe room. Each
// mission has one horde (or finale) stretch, where throwables are used.

export const SECTION_KINDS = {
  run: { name: 'Stretch', threat: 1, loot: 1 },
  horde: { name: 'Horde', threat: 1.12, loot: 1.2 },
  finale: { name: 'Finale', threat: 1.2, loot: 1.5 },
};

export const MISSION_SHAPES = [
  { sections: ['run', 'horde'], threat: 0.95, loot: 0.8, seconds: 300, fuelCans: 0 },
  { sections: ['run', 'horde', 'run'], threat: 1, loot: 1, seconds: 360, fuelCans: 2 },
  { sections: ['run', 'run', 'finale'], threat: 1.06, loot: 1.25, seconds: 420, fuelCans: 1 },
];

export const CURVE = {
  // Recommended squad power per chapter. A step at chapter 4 (the first chapter
  // the Radio Room opens) makes the mid-game ask for Safehouse upgrades.
  threat: [100, 110, 122, 145, 160, 178, 192, 206, 228, 246, 262, 280],
  scrap: { base: 140, growth: 1.07 },
  parts: { base: 8, growth: 1.1 },
  supplies: { base: 30, growth: 1.08 },
  fuel: { base: 3, every: 3 }, // +1 Fuel every 3 chapters
  fuelCans: { base: 3, every: 4 },
  firstClearParts: 2, // per chapter number, once per mission
  seconds: 5, // extra mission seconds per chapter (missions stay 5-8 minutes)
};

export const CHAPTERS = [
  { n: 1, name: 'Moving In', missions: ['Fire Escape', 'Corner Store', 'Lincoln High'], rescue: 'theo' },
  { n: 2, name: 'Dead Air', missions: ['Overpass', 'Rail Yard', 'KXRT Tower'] },
  { n: 3, name: 'Ward Seven', missions: ['Parking Garage', 'Emergency Room', 'Rooftop Helipad'], rescue: 'grace' },
  { n: 4, name: 'Low Water', missions: ['Canal Walk', 'Pump Station', 'Floodgates'] },
  { n: 5, name: 'Night Market', missions: ['Back Alleys', 'Food Hall', 'Market Fire'] },
  { n: 6, name: 'Freight', missions: ['Truck Stop', 'Rail Bridge', 'Fuel Depot'] },
  { n: 7, name: 'Cold Storage', missions: ['Loading Docks', 'Freezer Aisles', 'Ice Plant'] },
  { n: 8, name: 'Blackout', missions: ['Substation', 'Service Tunnels', 'Power Plant'] },
  { n: 9, name: 'Old Town', missions: ['Church Square', 'Clock Tower', 'Bell Tower'] },
  { n: 10, name: 'Quarantine', missions: ['Checkpoint', 'Field Hospital', 'Containment'] },
  { n: 11, name: 'Bridges Out', missions: ['Toll Plaza', 'Suspension Bridge', 'Ferry Dock'] },
  { n: 12, name: 'Last Light', missions: ['Airfield Road', 'Hangars', 'Control Tower'] },
];

const grow = (c, base, growth) => base * Math.pow(growth, c - 1);
const lootFor = (c, mult) => ({
  scrap: round5(grow(c, CURVE.scrap.base, CURVE.scrap.growth) * mult),
  parts: Math.round(grow(c, CURVE.parts.base, CURVE.parts.growth) * mult),
  supplies: round5(grow(c, CURVE.supplies.base, CURVE.supplies.growth) * mult),
  fuel: CURVE.fuel.base + Math.floor((c - 1) / CURVE.fuel.every),
});

/** Section list for a mission: kind, threat and its share of the loot. */
function sectionsFor(kinds, threat, loot) {
  const w = kinds.map((k) => SECTION_KINDS[k].loot);
  const total = w.reduce((a, b) => a + b, 0);
  return kinds.map((kind, i) => {
    const share = {};
    for (const r of ['scrap', 'parts', 'supplies', 'fuel']) share[r] = (loot[r] * w[i]) / total;
    return { kind, threat: Math.round(threat * SECTION_KINDS[kind].threat), loot: share };
  });
}

function buildMissions() {
  const out = {};
  for (const ch of CHAPTERS) {
    const T = CURVE.threat[ch.n - 1];
    ch.missions.forEach((name, i) => {
      const shape = MISSION_SHAPES[i];
      const id = `c${ch.n}m${i + 1}`;
      const loot = lootFor(ch.n, shape.loot);
      const threat = Math.round(T * shape.threat);
      out[id] = {
        id,
        kind: 'story',
        chapter: ch.n,
        index: i + 1,
        name,
        finale: i === MISSION_SHAPES.length - 1,
        threat,
        sections: sectionsFor(shape.sections, threat, loot),
        loot,
        fuelCans: shape.fuelCans > 0 ? { section: shape.fuelCans - 1, amount: CURVE.fuelCans.base + Math.floor((ch.n - 1) / CURVE.fuelCans.every) } : null,
        firstClear: { parts: CURVE.firstClearParts * ch.n },
        seconds: shape.seconds + CURVE.seconds * (ch.n - 1),
      };
    });
  }
  return out;
}

export const MISSIONS = buildMissions();

/** Special missions scale to the squad's furthest chapter. */
export const SPECIAL = {
  rescue: { sections: ['run', 'horde'], threat: 0.95, loot: 0.6, seconds: 300 },
  bond: { sections: ['run', 'horde'], threat: 1, loot: 0.9, seconds: 330, reward: { parts: 30, supplies: 40, fuel: 6 } },
};

/** Radio Room rescue calls: one per radio survivor, offered while a bunk is free. */
export const RESCUE_CALLS = {
  lukas: { name: 'Channel 19' },
  mei: { name: 'Mirror Flashes' },
};

/**
 * A rescue call or bond chapter, scaled to `chapter` (the squad's furthest
 * open chapter). `who` is the survivor it is about.
 */
export function specialMission(kind, who, chapter, name) {
  const shape = SPECIAL[kind];
  const c = Math.max(1, Math.min(CHAPTERS.length, chapter));
  const threat = Math.round(CURVE.threat[c - 1] * shape.threat);
  const loot = lootFor(c, shape.loot);
  return {
    id: `${kind}_${who}`,
    kind,
    who,
    chapter: c,
    index: 0,
    name,
    finale: false,
    threat,
    sections: sectionsFor(shape.sections, threat, loot),
    loot,
    fuelCans: null,
    firstClear: null,
    reward: shape.reward || null,
    seconds: shape.seconds + CURVE.seconds * (c - 1),
  };
}

/** Chance to clear one stretch: even + slope * (power / threat - 1), clamped. */
export const CHANCE = { even: 0.8, slope: 1, min: 0.05, max: 0.97 };

/** Heal items (and perks) never save more often than this; a defibrillator always does. */
export const SAVE_MAX = 0.95;

// --- Radio Room daily orders ----------------------------------------------------------------------------------
// One arrives each day (safehouse clock midnight) and they stack up to `max`,
// so a missed day can be caught up. No streaks, no penalties.

export const ORDERS = {
  max: 3,
  types: [
    { type: 'wins', text: 'Clear {n} missions', textOne: 'Clear a mission', n: [1, 2] },
    { type: 'saferooms', text: 'Reach {n} safe rooms', n: [4, 6] },
    { type: 'throwables', text: 'Use {n} throwables', textOne: 'Use a throwable', n: [1, 2] },
    { type: 'fuelcans', text: 'Grab fuel cans on a mission', n: [1] },
    { type: 'noheal', text: 'Clear a mission without using a heal', n: [1] },
    { type: 'with', text: 'Clear a mission with {who}', n: [1] },
    { type: 'kills', text: 'Take down {n} infected', n: [150, 250] },
  ],
  reward: { parts: 12, supplies: 25, fuel: 4 },
};

// --- Progression flow ---------------------------------------------------------------------------------------------
// The Safehouse teaches itself in stages, each adding one new idea. A goal:
// level [station, n] | crafted n | housed n. `when` is the doc's typical timing
// at about three missions a day (compare with `npm run safehouse:balance`).

export const STAGES = [
  {
    name: 'Move in',
    when: 'Missions 1-3',
    idea: 'Loot becomes a pipe bomb, and a named teammate fights beside you.',
    goals: [
      { level: ['barricade', 1], text: 'Board up the Barricade' },
      { level: ['generator', 1], text: 'Build the Generator' },
      { level: ['workshop', 1], text: 'Build the Workshop' },
      { crafted: 1, text: 'Craft a pipe bomb', focus: 'workshop' },
    ],
  },
  {
    name: 'First timers',
    when: 'Days 1-2',
    idea: 'Timers run while you are away, so you can start a build and close the app.',
    goals: [
      { level: ['infirmary', 1], text: 'Build the Infirmary' },
      { level: ['workshop', 2], text: 'Upgrade the Workshop to Lv 2' },
      { level: ['barracks', 2], text: 'Upgrade the Barracks to Lv 2' },
      { housed: 2, text: 'Rescue a second survivor (Chapter 1 finale)' },
    ],
  },
  {
    name: 'Choose a path',
    when: 'Days 3-5',
    idea: 'Permanent weapons, new chapters, daily orders, and a full squad of named teammates.',
    goals: [
      { level: ['barricade', 2], text: 'Upgrade the Barricade to Lv 2' },
      { level: ['armory', 1], text: 'Build the Armory' },
      { level: ['radio', 1], text: 'Build the Radio Room' },
      { level: ['barracks', 3], text: 'Upgrade the Barracks to Lv 3' },
      { housed: 3, text: 'Rescue a third survivor (Chapter 3 finale)' },
      { level: ['generator', 2], text: 'Upgrade the Generator to Lv 2' },
    ],
  },
  {
    name: 'Run on autopilot',
    when: 'Week 2',
    idea: 'Power capacity forces choices between jobs, and a second build slot keeps two timers going.',
    goals: [
      { level: ['barricade', 3], text: 'Upgrade the Barricade to Lv 3' },
      { level: ['scrapyard', 1], text: 'Build the Scrap Yard' },
    ],
  },
  {
    name: 'Deepen the bonds',
    when: 'Weeks 3-4',
    idea: 'Overnight timers, and choosing who joins the squad.',
    goals: [
      { level: ['barricade', 4], text: 'Upgrade the Barricade to Lv 4' },
      { level: ['barracks', 4], text: 'Upgrade the Barracks to Lv 4' },
    ],
  },
  {
    name: 'The long haul',
    when: 'After the first month',
    idea: 'A third build slot, bigger storage and 24-hour upgrades.',
    goals: [{ level: ['barricade', 5], text: 'Upgrade the Barricade to Lv 5' }],
  },
];

// --- Live tuning (dev panel) -----------------------------------------------------------------------------------------

export const TUNING_DEFAULTS = Object.freeze({
  buildTime: 1, // x build timers started from now on
  craftTime: 1, // x craft timers started from now on
  loot: 1, // x mission loot
  skill: 1, // simulated player skill: x your own power
  outcome: 'auto', // simulated missions: 'auto' | 'win' | 'wipe'
  missionTime: true, // a simulated mission moves the safehouse clock on by its length
  awayMinutes: 3, // show the welcome-back summary after this long away
  notify: false, // browser notification when a build finishes (best effort)
  volume: 0.7,
  haptics: true,
});
