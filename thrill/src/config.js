// Thrill Hill: every piece of content and every number lives here. The rules
// (people.js, chests.js, raid.js, meta.js) read them; nothing else hard-codes a
// value. docs/THRILL-HILL.md explains the design.
//
// A sunny amusement park on a hill above a town full of zombies. Two static
// chests bring people and Badges; raids bring Coins and Skulls; Coins pay for
// everything.

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// --- Survivors ---------------------------------------------------------------------------

export const SQUAD_SIZE = 3;
export const MAX_LEVEL = 10;

/** Four classes. Each counters one threat (×COUNTER power on that raid) and has a ride. */
export const CLASSES = {
  brawler: { name: 'Brawler', plural: 'Brawlers', color: '#e8483f', dark: '#9e2a24', counters: 'runner', ride: 'striker', zone: 1, props: ['bat', 'pan', 'foamhand'], blurb: 'Bonks Runners before they get close.' },
  shooter: { name: 'Shooter', plural: 'Shooters', color: '#3d8bf0', dark: '#2357a6', counters: 'brute', ride: 'gallery', zone: 1, props: ['rifle', 'slingshot', 'blaster'], blurb: 'Drops Brutes from a safe distance.' },
  medic: { name: 'Medic', plural: 'Medics', color: '#36c06a', dark: '#1f7f43', counters: 'spitter', ride: 'tent', zone: 2, props: ['medkit', 'spray', 'defib'], blurb: 'Keeps the squad standing through Spitter acid.' },
  tinker: { name: 'Tinker', plural: 'Tinkers', color: '#f5b82e', dark: '#a87411', counters: 'horde', ride: 'garage', zone: 3, props: ['bomb', 'wrench', 'trap'], blurb: 'Rigs traps that flatten a whole Horde.' },
};
export const CLASS_ORDER = ['brawler', 'shooter', 'medic', 'tinker'];
export const COUNTER = 1.5;

/** Threats: what a raid throws at you. Each one is countered by one class. */
export const THREATS = {
  runner: { name: 'Runners', one: 'Runner', by: 'brawler', blurb: 'Fast and twitchy. Brawlers bonk them.' },
  brute: { name: 'Brutes', one: 'Brute', by: 'shooter', blurb: 'Big and slow. Shooters drop them from afar.' },
  spitter: { name: 'Spitters', one: 'Spitter', by: 'medic', blurb: 'Acid from range. Medics keep you up.' },
  horde: { name: 'Hordes', one: 'Horde', by: 'tinker', blurb: 'Too many to count. Tinkers trap them.' },
};
export const THREAT_ORDER = ['runner', 'brute', 'spitter', 'horde'];

/**
 * Rarity is a head start, not a different game: one shared level curve.
 * mult = power multiplier; arrive = level offset from the squad's average level;
 * perk = perk strength (×).
 */
export const RARITIES = {
  rookie: { name: 'Rookie', color: '#a3acb6', mult: 1.0, arrive: -2, perk: 0 },
  veteran: { name: 'Veteran', color: '#4aa3ff', mult: 1.15, arrive: -1, perk: 1 },
  hero: { name: 'Hero', color: '#b25cff', mult: 1.3, arrive: 0, perk: 2 },
  legend: { name: 'Legend', color: '#ffc23a', mult: 1.5, arrive: 1, perk: 3 },
};
export const RARITY_ORDER = ['rookie', 'veteran', 'hero', 'legend'];

/** Power = (BASE + GROWTH × (level − 1)) × rarity × (1 + ride) × golden. */
export const POWER = { base: 10, growth: 3, golden: 1.2 };
export const GOLDEN_CHANCE = 0.025;
/** Newcomers arrive with their Badge bar this full. */
export const ARRIVE_BADGES = 0.5;
/** Badges for someone already at max level turn into coins (no dead drops). */
export const MAXED_BADGE_COINS = 5;

/** To reach level L (index L − 2): Badges and coins. */
export const LEVEL_BADGES = [3, 8, 14, 22, 34, 50, 70, 95, 125];
export const LEVEL_COINS = [20, 50, 100, 200, 400, 650, 950, 1300, 1800];

/** Perks (Veteran and up; one each). `v` is the Veteran value; Hero ×2, Legend ×3. Squad only. */
export const PERKS = {
  lucky: { name: 'Lucky', v: 0.1, text: (v) => `+${Math.round(v * 100)}% raid coins` },
  cheer: { name: 'Cheer', v: 0.04, text: (v) => `+${Math.round(v * 100)}% squad power` },
  scavenger: { name: 'Scavenger', v: 0.03, text: (v) => `+${Math.round(v * 100)} pts stray chance on 3-crown raids` },
  gemnose: { name: 'Gem Nose', v: 0.05, text: (v) => `${Math.round(v * 100)}% chance of +3 gems on a 2+ crown raid` },
  clutch: { name: 'Clutch', v: 0.1, text: (v) => `+${Math.round(v * 100)} pts clutch-save chance` },
};
export const PERK_ORDER = ['lucky', 'cheer', 'scavenger', 'gemnose', 'clutch'];

/** Behaviour only: one idle animation and a favourite spot in the park. */
export const VIBES = {
  sunny: { name: 'Sunny', text: 'Waves at everyone. Brings gifts.' },
  sleepy: { name: 'Sleepy', text: 'Naps on the Big Top steps.' },
  showoff: { name: 'Show-off', text: 'Performs at their ride. A crowd gathers.' },
  jumpy: { name: 'Jumpy', text: 'Jumps when a zombie bumps the fence.' },
};
export const VIBE_ORDER = ['sunny', 'sleepy', 'showoff', 'jumpy'];

export const SIBLINGS = { minResidents: 4, chance: 0.08, power: 0.1 };

/**
 * What a generated look may hold. portrait.js draws every value; people.js
 * rolls them. hairColor: 0..5 natural (5 = grey/white), 6..9 dyed (Hero+).
 * mascot: 0 bear, 1 bunny, 2 duck (only when hat === 'mascot').
 */
export const LOOK = {
  bodies: ['slim', 'medium', 'big'],
  skins: 6,
  faces: ['round', 'oval', 'square'],
  hairStyles: ['short', 'buzz', 'curly', 'long', 'pony', 'bun', 'afro', 'mohawk', 'bald', 'pigtails'],
  hairNatural: 6,
  hairDyed: 4,
  grey: 5,
  hats: ['none', 'cap', 'headphones', 'bucket', 'flowers', 'hardhat', 'bandana', 'mascot'],
  eyes: ['dots', 'happy', 'wide', 'sleepy'],
  mouths: ['smile', 'grin', 'open', 'smirk', 'flat'],
  extras: ['none', 'glasses', 'shades', 'freckles', 'bandaid', 'mustache', 'beard', 'earring', 'eyepatch'],
  mascots: 3,
  mascotChance: 0.05,
};

// --- The park (buildings) ------------------------------------------------------------------

/**
 * Seven buildings, every upgrade instant and paid in coins. A building's max
 * level is your zone + 1 (up to MAX_BUILDING). `zone` = the zone that opens it.
 */
export const BUILDINGS = {
  crate: { name: 'Supply Crate', kind: 'chest', zone: 1, blurb: 'The short-wait chest. Higher levels: more loot, more newcomers, more Glow-Ups.' },
  vault: { name: 'Ticket Vault', kind: 'chest', zone: 1, blurb: 'The long-wait chest. Always a newcomer, Veteran or better.' },
  bigtop: { name: 'Big Top', kind: 'coins', zone: 1, blurb: 'The show tent. Every level makes raids pay more coins.' },
  striker: { name: 'High Striker', kind: 'ride', cls: 'brawler', zone: 1, blurb: 'Brawlers train here.' },
  gallery: { name: 'Shooting Gallery', kind: 'ride', cls: 'shooter', zone: 1, blurb: 'Shooters train here.' },
  tent: { name: 'First Aid Tent', kind: 'ride', cls: 'medic', zone: 2, blurb: 'Medics train here.' },
  garage: { name: 'Bumper Garage', kind: 'ride', cls: 'tinker', zone: 3, blurb: 'Tinkers train here.' },
};
export const BUILDING_ORDER = ['bigtop', 'striker', 'gallery', 'tent', 'garage', 'crate', 'vault'];
export const MAX_BUILDING = 7;
/** Coins to reach level L (index L − 2). */
export const BUILD_COST = [100, 250, 550, 1000, 1800, 3000];
/** Ride bonus for its class: +RIDE_BONUS × level. */
export const RIDE_BONUS = 0.1;
/** Big Top: raids pay +BIGTOP_COINS × (level − 1) more coins. */
export const BIGTOP_COINS = 0.1;
/** At most this many residents walk about the park at once (the squad always does). */
export const PARK_WALKERS = 22;

// --- Chests --------------------------------------------------------------------------------

/**
 * Two chests, static, never stacking. Contents scale with the chest's level.
 * odds: rarity weights at Lv 1 and how they move per level.
 */
export const CHESTS = {
  crate: {
    name: 'Supply Crate',
    short: 'Crate',
    period: 2 * HOUR,
    coins: (lv) => 40 * lv,
    coinSpread: 0.15,
    badges: (lv) => 2 + lv,
    badgeSpread: 1,
    newcomer: (lv) => 0.22 + 0.04 * lv,
    second: () => false,
    odds: { base: { rookie: 65, veteran: 28, hero: 6, legend: 1 }, per: { rookie: -4, veteran: 2, hero: 1.5, legend: 0.5 } },
    gems: { chance: 0.15, min: 2, max: 4 },
    gemCap: 12,
  },
  vault: {
    name: 'Ticket Vault',
    short: 'Vault',
    period: 8 * HOUR,
    coins: (lv) => 160 * lv,
    coinSpread: 0.15,
    badges: (lv) => 6 + 2 * lv,
    badgeSpread: 2,
    newcomer: () => 1,
    second: (lv) => lv >= 5, // a second newcomer at Crate odds
    odds: { base: { rookie: 0, veteran: 72, hero: 24, legend: 4 }, per: { rookie: 0, veteran: -3, hero: 2, legend: 1 } },
    gems: { chance: 1, min: 6, max: 6, perLevel: 1 },
    finisher: (lv) => 8 + 2 * lv,
    finisherTopUp: 20,
    gemCap: 48,
  },
};
export const CHEST_ORDER = ['crate', 'vault'];
/** A chest opened late takes up to this share of a period off the next wait. */
export const CHEST_GRACE = 0.25;
/** Open now: 1 gem per this many ms left, rounded up (capped per chest). */
export const OPEN_NOW_MS = 10 * MIN;

/** Glow-Up: three knocks, each an independent roll; the grade is how many hit. */
export const GLOW = { base: 0.12, perLevel: 0.01 };
export const GRADES = [
  { id: 'plain', name: 'Plain', mult: 1, floor: null },
  { id: 'silver', name: 'Silver', mult: 1.5, floor: 'veteran', banner: 'SILVER!', line: 'Veteran or better inside' },
  { id: 'gold', name: 'Gold', mult: 2, floor: 'hero', banner: 'GOLD!', line: 'Hero or better inside' },
  { id: 'rainbow', name: 'Rainbow', mult: 3, floor: 'legend', banner: 'RAINBOW!!', line: 'A LEGEND inside' },
];
export const KNOCKS = 3;
/** A Legend is guaranteed by the PITY-th chest newcomer without one. */
export const PITY = 30;

// --- Raids and the Skull ladder ----------------------------------------------------------

/**
 * Six zones. gate = Skulls needed; threat = the zone's threat number T;
 * threats = the threats that can come up; two = raids have two threats;
 * gift = the survivor who walks in at the gate (rarity, class or null for any, golden).
 */
export const ZONES = [
  { n: 1, name: 'Picnic Grove', gate: 0, threat: 36, threats: ['runner', 'brute'], two: false, gift: null, souvenir: null, opens: 'Brawlers and Shooters' },
  { n: 2, name: 'Suburbs', gate: 100, threat: 70, threats: ['runner', 'brute', 'spitter'], two: false, gift: { rarity: 'veteran', cls: 'medic', golden: false }, souvenir: 'donut', opens: 'Medics and the First Aid Tent' },
  { n: 3, name: 'Shopping Mall', gate: 350, threat: 95, threats: ['runner', 'brute', 'spitter', 'horde'], two: false, gift: { rarity: 'veteran', cls: 'tinker', golden: false }, souvenir: 'fountain', opens: 'Tinkers and the Bumper Garage' },
  { n: 4, name: 'Harbor', gate: 900, threat: 200, threats: ['runner', 'brute', 'spitter', 'horde'], two: true, gift: { rarity: 'legend', cls: null, golden: false }, souvenir: 'anchor', opens: 'Two threats per raid' },
  { n: 5, name: 'Stadium', gate: 1600, threat: 275, threats: ['runner', 'brute', 'spitter', 'horde'], two: true, gift: { rarity: 'hero', cls: null, golden: true }, souvenir: 'scoreboard', opens: 'Bigger crowds' },
  { n: 6, name: 'Airport', gate: 2500, threat: 370, threats: ['runner', 'brute', 'spitter', 'horde'], two: true, gift: { rarity: 'legend', cls: null, golden: true }, souvenir: 'jet', opens: 'The last zone. Fireworks!' },
];
export const GATE_GEMS = 20;

/**
 * A raid is three waves; each one cleared earns a crown. A wave's difficulty is
 * the zone threat T × diff. The raid stops at the first wave you can't clear.
 * Chance to clear a wave: p = clamp(A + B × (S / (T × diff) − 1), MIN, MAX).
 */
export const WAVES = [
  { name: 'Wave 1', diff: 0.5 },
  { name: 'Wave 2', diff: 0.75 },
  { name: 'The big one', diff: 1.0 },
];
export const WAVE_ODDS = { a: 0.5, b: 0.9, min: 0.05, max: 0.97 };
/** The label on PLAY comes from the chance of all three crowns. */
export const ODDS_LABELS = [
  { min: 0.6, id: 'easy', name: 'Easy' },
  { min: 0.35, id: 'good', name: 'Good' },
  { min: 0.15, id: 'tough', name: 'Tough' },
  { min: 0, id: 'risky', name: 'Risky' },
];
/** A near miss on the big one (r < p + window) can still be cleared: a second roll under chance + Clutch perks. */
export const CLUTCH = { window: 0.1, chance: 0.35 };
/** Rewards by crowns (index 0..3). */
export const CROWN_REWARD = {
  skulls: [-10, 10, 20, 30],
  coins: (zone, crowns) => (15 + 8 * zone) * [0.4, 0.7, 1, 1.3][crowns],
};
/** After LOSSES raids in a row with fewer than BAD crowns, the next raid is a Rally. */
export const RALLY = { losses: 2, bad: 2, threat: 0.8, coins: 2 };
/** Surprises in raids. */
export const STRAY = { chance: 0.04 }; // a newcomer follows you home after a 3-crown raid (Crate Lv 1 odds)
export const GOLDEN_ZOMBIE = { chance: 1 / 15, coins: 2, gems: 3 }; // shows up in wave 2; clear it to bag it
export const GEM_NOSE_GEMS = 3;

/**
 * Milestones every STEP Skulls between gates (not on a gate), claimed once each
 * by your best Skulls. They cycle: coins, a Badge stack for the squad, gems.
 * After the last gate the step is LATE_STEP.
 */
export const MILESTONES = {
  step: 50,
  lateStep: 100,
  cycle: ['coins', 'badges', 'gems'],
  coins: (zone) => 60 * zone,
  badges: (zone) => 4 + 2 * zone,
  gems: 10,
};

// --- Resident gifts --------------------------------------------------------------------------

/** Coming back after AWAY or more: a CHANCE that someone walks up with a gift. */
export const GIFT = {
  away: 60 * MIN,
  chance: 0.3,
  table: [
    { w: 60, kind: 'coins', min: 40, max: 100 },
    { w: 30, kind: 'badges', n: 6 },
    { w: 10, kind: 'gems', n: 3 },
  ],
};

// --- The start -------------------------------------------------------------------------------

/** Three founders, all Lv 1. Names and looks are generated; class, rarity and vibe are set. */
export const START = {
  coins: 100,
  gems: 30,
  founders: [
    { cls: 'brawler', rarity: 'rookie', vibe: 'sunny', perk: null },
    { cls: 'shooter', rarity: 'rookie', vibe: 'jumpy', perk: null },
    { cls: 'brawler', rarity: 'veteran', vibe: 'showoff', perk: 'cheer' },
  ],
  buildings: { crate: 1, vault: 1, bigtop: 1, striker: 1, gallery: 1, tent: 0, garage: 0 },
  firstThreat: 'runner',
  // The first session is scripted so everyone sees the big moments early:
  // the first Crate glows Silver on knock 2 and holds a Veteran Shooter (Lucky);
  // the first Vault glows Silver on knock 2, Gold on knock 3, and holds a Hero Shooter.
  script: {
    crate: { knocks: [false, true, false], newcomers: [{ rarity: 'veteran', cls: 'shooter', perk: 'lucky' }] },
    vault: { knocks: [false, true, true], newcomers: [{ rarity: 'hero', cls: 'shooter', perk: 'clutch' }] },
    secondThreat: 'brute',
  },
};

// --- Testing tuning (the drawer's live sliders) ------------------------------------------------

export const TUNING_DEFAULTS = {
  coins: 1, // raid and chest coins ×
  badges: 1, // chest Badges ×
  threat: 1, // zone threat ×
  glow: 0, // added to the Glow-Up chance per knock
  chestTime: 1, // chest timers ×
  outcome: 'auto', // 'auto' | 'win' | 'lose' | 'clutch'
  volume: 0.7,
  haptics: true,
};
