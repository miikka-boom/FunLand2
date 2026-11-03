// Road to Evac: all content and numbers. Tuning lives here.
//
// The road: 5 districts (campaigns), each 4 chapters + a finale, like a
// Left 4 Dead campaign. Clear the next stop to move the squad's van on.
// Two currencies only: Supplies (earned on runs, spent on instant upgrades)
// and Gems (rare; rush the airdrop, revive in a run).

export const MIN = 60;
export const HOUR = 3600;

// --- Survivors: the co-op squad ----------------------------------------------------------
// You play one; the best three others ride along as bots (friends in co-op).
// Every survivor in the squad adds their perk for the whole team.

export const SURVIVORS = {
  rook: {
    name: 'Rook',
    role: 'Pointman',
    bio: 'Ex-courier. Knows every shortcut in this city.',
    perk: 'Squad move speed',
    perkPer: 3, // % per level
    costMult: 1,
    start: true,
  },
  doc: {
    name: 'Doc',
    role: 'Medic',
    bio: 'ER nurse. Stayed behind for her patients.',
    perk: 'Squad max health',
    perkPer: 4,
    costMult: 1.15,
  },
  mags: {
    name: 'Mags',
    role: 'Gunner',
    bio: 'Range officer. Never misses twice.',
    perk: 'Squad damage',
    perkPer: 3,
    costMult: 1.3,
  },
  sparks: {
    name: 'Sparks',
    role: 'Engineer',
    bio: 'Can wire a pipe bomb out of anything.',
    perk: 'Squad reload speed',
    perkPer: 4,
    costMult: 1.45,
  },
  juno: {
    name: 'Juno',
    role: 'Scavenger',
    bio: 'Finds food where there is none.',
    perk: 'Supplies found',
    perkPer: 4,
    costMult: 1.6,
  },
};

export const SURVIVOR_ORDER = ['rook', 'doc', 'mags', 'sparks', 'juno'];
export const SQUAD_SIZE = 4;

// --- Weapons (ids with `game` match src/game/weapons.js; the rest are proposals) ----------

export const WEAPONS = {
  smg: { name: 'SMG', game: 'smg', base: 30, costMult: 1, start: true, blurb: 'Light and fast. Sprays a crowd.' },
  shotgun: { name: 'Pump Shotgun', game: 'shotgun', base: 40, costMult: 1.25, blurb: 'Clears a doorway in one pump.' },
  rifle: { name: 'Assault Rifle', game: 'rifle', base: 52, costMult: 1.55, blurb: 'Pierces two at a time.' },
  hunting: { name: 'Hunting Rifle', game: 'hunting', base: 64, costMult: 1.9, blurb: 'One shot, one Hunter.' },
  auto: { name: 'Auto Shotgun', game: null, base: 78, costMult: 2.3, blurb: 'A pump shotgun that never stops.' },
  lmg: { name: 'Machine Gun', game: null, base: 92, costMult: 2.7, blurb: 'The Tank problem, solved.' },
};

export const WEAPON_ORDER = ['smg', 'shotgun', 'rifle', 'hunting', 'auto', 'lmg'];

export const MAX_LEVEL = 12;

/** Supplies to go from level n to n+1 (index n-1), before the item's costMult. */
export const LEVEL_COST = [30, 55, 90, 140, 210, 300, 420, 580, 800, 1100, 1500];

/** Power: what the simulated run compares to a chapter's recommended power. */
export const POWER = {
  mainBase: 30, // your survivor at level 1
  mainPerLevel: 14,
  weaponPerLevel: 15, // on top of the weapon's base
  botBase: 10, // each other squad member at level 1
  botPerLevel: 5,
};

// --- The road --------------------------------------------------------------------------------
// rec = recommended power; supplies = reward for a 1-star clear.
// Types: run (reach the safe room), horde (hold out), rescue (find someone), finale.

export const CAMPAIGNS = [
  {
    id: 'suburbs',
    name: 'Suburbs',
    blurb: 'Quiet streets that went loud overnight.',
    chapters: [
      { name: 'Wake-Up Call', type: 'run', rec: 55, supplies: 40, text: 'Get out of the house and down the block to the safe room.' },
      { name: 'Picket Fences', type: 'run', rec: 85, supplies: 45, text: 'Cut through the back yards. Keep off the main road.' },
      { name: 'Gun Shop', type: 'rescue', rec: 115, supplies: 50, unlock: { weapon: 'shotgun' }, text: "Hank's Guns is still standing. Take what's left." },
      { name: 'Highway Jam', type: 'horde', rec: 140, supplies: 55, text: 'A wall of wrecks and a car alarm. Hold the overpass.' },
      { name: 'Gas Station', type: 'finale', rec: 165, supplies: 100, unlock: { survivor: 'doc' }, gems: 20, text: 'Doc is trapped in the gas station. So is a Tank.' },
    ],
  },
  {
    id: 'downtown',
    name: 'Downtown',
    blurb: 'Neon, sirens and a lot of windows.',
    chapters: [
      { name: 'Subway Stairs', type: 'run', rec: 190, supplies: 70, text: 'Up from the metro into the dark.' },
      { name: 'Neon Alley', type: 'horde', rec: 205, supplies: 75, text: 'Every sign in the alley is still buzzing. So are they.' },
      { name: 'Precinct 9', type: 'rescue', rec: 225, supplies: 80, unlock: { weapon: 'rifle' }, text: "The police armory. Nobody's guarding it now." },
      { name: 'Car Alarm Ave', type: 'run', rec: 240, supplies: 90, text: 'One wrong shot and the whole avenue comes running.' },
      { name: 'Rooftop Flare', type: 'finale', rec: 270, supplies: 170, unlock: { survivor: 'mags' }, gems: 25, text: 'Light the flare on the roof. Mags is holding the stairwell.' },
    ],
  },
  {
    id: 'industrial',
    name: 'Industrial',
    blurb: 'Rust, rail yards and something big.',
    chapters: [
      { name: 'Rail Yard', type: 'run', rec: 290, supplies: 115, text: 'Follow the tracks between the boxcars.' },
      { name: 'Cannery', type: 'horde', rec: 305, supplies: 125, text: 'The conveyor still runs. Hold the floor while it does.' },
      { name: 'Foundry', type: 'rescue', rec: 325, supplies: 135, unlock: { weapon: 'hunting' }, text: 'A hunter left his rifle in the foreman\'s office.' },
      { name: 'Crane Row', type: 'run', rec: 345, supplies: 145, text: 'Climb the cranes and keep moving.' },
      { name: 'Bridge Down', type: 'finale', rec: 375, supplies: 270, unlock: { survivor: 'sparks' }, gems: 30, text: 'Sparks can lower the bridge. Keep them alive while they work.' },
    ],
  },
  {
    id: 'hospital',
    name: 'Mercy Hospital',
    blurb: 'Where they took the first cases.',
    chapters: [
      { name: 'Parking Deck', type: 'run', rec: 395, supplies: 175, text: 'Five floors of cars, alarms and worse.' },
      { name: 'ER Lobby', type: 'horde', rec: 410, supplies: 190, text: 'The waiting room is full. Hold the doors.' },
      { name: 'Pharmacy', type: 'rescue', rec: 425, supplies: 205, unlock: { weapon: 'auto' }, text: 'The security office had an auto shotgun. And a lock.' },
      { name: 'Quarantine', type: 'run', rec: 450, supplies: 220, text: 'Through the sealed wing. The seals did not hold.' },
      { name: 'Helipad Hold', type: 'finale', rec: 490, supplies: 400, unlock: { survivor: 'juno' }, gems: 35, text: 'Juno has a radio and a way out. Hold the helipad.' },
    ],
  },
  {
    id: 'military',
    name: 'Military Base',
    blurb: 'The evac point. If anyone is still there.',
    chapters: [
      { name: 'Checkpoint Zulu', type: 'run', rec: 480, supplies: 250, text: 'Past the abandoned checkpoint and the burned trucks.' },
      { name: 'Barracks', type: 'horde', rec: 495, supplies: 270, text: 'The soldiers are still here. They are not soldiers anymore.' },
      { name: 'Armory Vault', type: 'rescue', rec: 510, supplies: 290, unlock: { weapon: 'lmg' }, text: 'The vault door is open. Somebody left in a hurry.' },
      { name: 'Runway', type: 'run', rec: 525, supplies: 310, text: 'Two kilometers of open tarmac.' },
      { name: 'Evac', type: 'finale', rec: 565, supplies: 600, unlock: { evac: true }, gems: 60, text: 'The chopper is coming. Hold out until it lands.' },
    ],
  },
];

export const CHAPTERS_PER_CAMPAIGN = 5;
export const TOTAL_CHAPTERS = CAMPAIGNS.length * CHAPTERS_PER_CAMPAIGN;

export const CHAPTER_TYPES = {
  run: { label: 'Run', goal: 'Reach the safe room', icon: 'arrow' },
  horde: { label: 'Horde', goal: 'Survive the horde', icon: 'horde' },
  rescue: { label: 'Supply run', goal: 'Find the stash, reach the safe room', icon: 'crate' },
  finale: { label: 'Finale', goal: 'Beat the Tank, hold out for rescue', icon: 'skull' },
};

// --- Rewards -------------------------------------------------------------------------------

/** Supplies multiplier by stars (index = stars). 0 = died. */
export const STAR_MULT = [0, 1, 1.3, 1.6];

/** First time a chapter is cleared it pays its base reward again on top. */
export const FIRST_CLEAR_BONUS = 1;

/** A death keeps this share of the base reward, plus the share of the route covered. */
export const DEATH_KEEP = { base: 0.15, perProgress: 0.35 };

/** All 5 chapters of a district at 3 stars. */
export const MASTERY_REWARD = { gems: 25, suppliesMult: 2 }; // supplies = 2x the finale's base

/** Simulated co-op: each friend instead of a bot. */
export const COOP_BONUS = 0.1;

/** Win chance at the recommended power, and how fast it moves with the power ratio. */
export const ODDS = { atRec: 0.62, slope: 1.1, min: 0.08, max: 0.98, star2: 1.05, star3: 1.25, noise: 0.12 };

/** Getting back up in a run costs more gems the further down the road you are. */
export const REVIVE = { gems: [10, 15, 20, 25, 30], minProgress: 0.3 };

export const START = { supplies: 0, gems: 30 };

// --- Wait rewards ----------------------------------------------------------------------------
// Size is in "chapters": multiples of the average 1-star reward in the district you're in.

export const REWARDS = {
  short: { name: 'Supply Crate', interval: 30 * MIN, first: 3 * MIN, chapters: 0.6, gemChance: 0.08, gems: [1, 2] },
  long: { name: 'Airdrop', interval: 8 * HOUR, first: 8 * HOUR, chapters: 3, gemChance: 1, gems: [5, 10] },
};

/** Rushing the airdrop: gems per remaining hour (rounded up), at least 1. */
export const RUSH_GEMS_PER_HOUR = 4;

export const TUNING_DEFAULTS = Object.freeze({
  supplies: 1, // x run rewards
  costs: 1, // x upgrade costs
  difficulty: 1, // x recommended power
  shortMinutes: REWARDS.short.interval / MIN,
  longHours: REWARDS.long.interval / HOUR,
  outcome: 'auto', // 'auto' | 'win' | 'lose'
  volume: 0.7,
  haptics: true,
});
