// Last Stop: every piece of content and every number lives here. The rules
// (people.js, chests.js, raid.js, meta.js, town.js) read them; nothing else
// hard-codes a value. docs/LAST-STOP.md explains the design.
//
// A Thrill Hill variation. You hold one gas station in a lakeside town full of
// goofy zombies. Clear the lots around you, put everything where you like, and
// watch every survivor's home grow as they level up. The chests, Badges, squad
// and crown raids are Thrill Hill's, unchanged.

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
  gemnose: { name: 'Gem Nose', v: 0.05, text: (v) => `${Math.round(v * 100)}% chance of +3 gems on a 2+ crown raid` },
  clutch: { name: 'Clutch', v: 0.1, text: (v) => `+${Math.round(v * 100)} pts clutch-save chance` },
};
export const PERK_ORDER = ['lucky', 'cheer', 'gemnose', 'clutch'];

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
  crate: { name: 'Drop Pad', kind: 'chest', zone: 1, size: 2, blurb: 'Supply Crates land here. Higher levels: more loot, more newcomers, more Glow-Ups.' },
  vault: { name: 'Bank Vault', kind: 'chest', zone: 1, size: 2, blurb: 'The long-wait chest. Always a newcomer, Veteran or better.' },
  bigtop: { name: 'Gas Station', kind: 'coins', zone: 1, size: 3, blurb: 'Your headquarters. Every level makes raids pay more, and the fence grows with it.' },
  striker: { name: 'Batting Cage', kind: 'ride', cls: 'brawler', zone: 1, size: 2, blurb: 'Brawlers train here.' },
  gallery: { name: 'Tin Can Range', kind: 'ride', cls: 'shooter', zone: 1, size: 2, blurb: 'Shooters train here.' },
  tent: { name: 'Ice Cream Clinic', kind: 'ride', cls: 'medic', zone: 2, size: 2, blurb: 'Medics train here.' },
  garage: { name: 'Junk Garage', kind: 'ride', cls: 'tinker', zone: 3, size: 2, blurb: 'Tinkers train here.' },
};
/** Look stages by level: patched (1-2), fixed up (3-4), proud (5-7). */
export const STAGES = [null, 1, 1, 2, 2, 3, 3, 3];
export const STAGE_NAMES = ['', 'Patched', 'Fixed up', 'Proud'];
export const BUILDING_ORDER = ['bigtop', 'striker', 'gallery', 'tent', 'garage', 'crate', 'vault'];
export const MAX_BUILDING = 7;
/** Coins to reach level L (index L − 2). */
export const BUILD_COST = [100, 250, 550, 1000, 1800, 3000];
/** Ride bonus for its class: +RIDE_BONUS × level. */
export const RIDE_BONUS = 0.1;
/** Big Top: raids pay +BIGTOP_COINS × (level − 1) more coins. */
export const BIGTOP_COINS = 0.1;
/** At most this many residents walk about the town at once (the squad always does). */
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
    // A little top-up for the squad member closest to READY (topped up to what
    // they need if that is within max(8, a quarter of their bar)).
    finisher: (lv) => 2 + lv,
    finisherTopUp: (need) => Math.max(8, Math.round(need * 0.25)),
    // The first refills are quick (onboarding): waits after openings 1..4.
    ramp: [3 * MIN, 5 * MIN, 10 * MIN, 20 * MIN],
  },
  vault: {
    name: 'Bank Vault',
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
    finisherTopUp: (need) => Math.max(20, Math.round(need * 0.4)),
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
/** A Legend is guaranteed by the PITY-th chest newcomer without one (the very first by FIRST_PITY). */
export const PITY = 30;
export const FIRST_PITY = 8;
/** First-time surprises come early: a golden survivor by the Nth newcomer, a sibling by the Nth once 4+ live in the park. */
export const FIRST_GOLDEN = 6;
export const FIRST_SIBLING = 5;

// --- Raids and the Skull ladder ----------------------------------------------------------

/**
 * Six zones. gate = Skulls needed; threat = the zone's threat number T;
 * threats = the threats that can come up; two = raids have two threats;
 * gift = the survivor who walks in at the gate (rarity, class or null for any, golden).
 */
export const ZONES = [
  { n: 1, name: 'Picnic Grove', gate: 0, threat: 36, threats: ['runner', 'brute'], two: false, gift: null, souvenir: null, opens: 'Brawlers and Shooters' },
  { n: 2, name: 'Suburbs', gate: 100, threat: 70, threats: ['runner', 'brute', 'spitter'], two: false, gift: { rarity: 'veteran', cls: 'medic', golden: false }, souvenir: 'donut', opens: 'Medics and the Ice Cream Clinic' },
  { n: 3, name: 'Shopping Mall', gate: 350, threat: 95, threats: ['runner', 'brute', 'spitter', 'horde'], two: false, gift: { rarity: 'veteran', cls: 'tinker', golden: false }, souvenir: 'fountain', opens: 'Tinkers and the Junk Garage' },
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
  { name: 'The big one', diff: 1.0, max: 0.85 },
];
export const WAVE_ODDS = { a: 0.5, b: 0.9, min: 0.05, max: 0.95 };
/** A raid's threats hold for this many raids, so the squad can stay a team. */
export const THREAT_STREAK = 3;
/** BEST pulses when it beats the current squad by this much. */
export const BEST_MARGIN = 1.1;
/** The label on PLAY comes from the chance of all three crowns. */
export const ODDS_LABELS = [
  { min: 0.6, id: 'easy', name: 'Easy' },
  { min: 0.35, id: 'good', name: 'Good' },
  { min: 0.15, id: 'tough', name: 'Tough' },
  { min: 0, id: 'risky', name: 'Risky' },
];
/** A near miss on the big one (r < p + window) can still be cleared: a second roll under chance + Clutch perks. */
export const CLUTCH = { window: 0.1, chance: 0.5 };
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
 * by your best Skulls. They cycle: coins, a Badge stack for the squad, gems, a decoration.
 * After the last gate the step is LATE_STEP.
 */
export const MILESTONES = {
  step: 50,
  lateStep: 100,
  cycle: ['coins', 'badges', 'gems', 'decor'],
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
  coins: 1.5, // raid and chest coins × (Last Stop pays more: about a third goes on land; see outpost:balance)
  badges: 1, // chest Badges ×
  threat: 1, // zone threat ×
  glow: 0, // added to the Glow-Up chance per knock
  chestTime: 1, // chest timers ×
  outcome: 'auto', // 'auto' | 'win' | 'lose' | 'clutch'
  volume: 0.7,
  haptics: true,
};


// --- The town (Last Stop) --------------------------------------------------------------------

/** A 35×35 map in a 5×5 grid of 7×7 lots. Lot (a, b) covers i ∈ [7a, 7a+7), j ∈ [7b, 7b+7). */
export const LOT = 7;
export const LOTS_ACROSS = 5;
export const MAP = LOT * LOTS_ACROSS;
export const START_LOT = [2, 2];

/**
 * Every lot: kind R rescue, C cache, D decoration set, L landmark, ? mystery,
 * S the start. ruin = which ruined building stands in it while wild.
 */
export const LOTS = {
  '0,0': { kind: '?', name: 'Old Quarry', teaser: 'Something glints at the bottom of the pit.' },
  '1,0': { kind: 'L', name: 'Radio Mast', landmark: 'radio', teaser: 'The DJ is still spinning records up there.' },
  '2,0': { kind: 'D', name: 'Pine Grove', set: 'cozy', ruin: 'house', teaser: 'A treehouse, half hidden in the pines.' },
  '3,0': { kind: 'C', name: 'Bus Depot', ruin: 'garage', teaser: 'Lockers. Lots of lockers.' },
  '4,0': { kind: '?', name: 'Scrapyard', teaser: 'Under the tarp: something big.' },
  '0,1': { kind: 'C', name: 'Lumber Yard', ruin: 'silo', teaser: 'The foreman kept a cash box.' },
  '1,1': { kind: 'L', name: 'Water Tower', landmark: 'tower', teaser: 'The Plumber waves from the top. Rudely.' },
  '2,1': { kind: 'C', name: 'Burger Stand', ruin: 'stand', teaser: 'The till is still full.' },
  '3,1': { kind: 'C', name: 'Car Lot', ruin: 'garage', teaser: 'Keys, cash, and a very shiny car.' },
  '4,1': { kind: 'L', name: 'Fire Station', landmark: 'fire', teaser: 'The Fire Chief guards the big red truck.' },
  '0,2': { kind: 'R', name: 'School', ruin: 'house', teaser: 'Chalk on the window: HELP. ALSO, SNACKS?' },
  '1,2': { kind: 'R', name: 'Diner', ruin: 'shopfront', teaser: "Someone's banging on the freezer." },
  '2,2': { kind: 'S', name: 'Last Stop', teaser: 'Home.' },
  '3,2': { kind: 'R', name: 'Motel', ruin: 'house', teaser: 'Room 6 has a DO NOT DISTURB sign. And snoring.' },
  '4,2': { kind: 'R', name: 'Pharmacy', ruin: 'shopfront', teaser: 'A voice behind the counter: "We are OPEN."' },
  '0,3': { kind: 'L', name: 'Fairground Wheel', landmark: 'wheel', teaser: 'The Carny keeps the wheel turning.' },
  '1,3': { kind: 'D', name: 'Playground', set: 'lookout', ruin: 'stage', teaser: 'A rocket slide, rusty but proud.' },
  '2,3': { kind: 'D', name: 'Mini Golf', set: 'party', ruin: 'stand', teaser: 'The windmill hole still turns.' },
  '3,3': { kind: 'L', name: 'Drive-in', landmark: 'drivein', teaser: 'The Projectionist is showing zombie films. To zombies.' },
  '4,3': { kind: 'D', name: 'Farm Stand', set: 'garden', ruin: 'stand', teaser: 'Pumpkins! Huge ones.' },
  '0,4': { kind: '?', name: 'Hidden Cove', teaser: 'Footprints lead to the water.' },
  '1,4': { kind: 'R', name: 'Campground', ruin: 'stage', teaser: 'A tent is zipped shut. It zips back.' },
  '2,4': { kind: 'C', name: 'Boat Rental', ruin: 'stand', teaser: 'The rental desk has a lockbox.' },
  '3,4': { kind: 'L', name: 'Lighthouse Pier', landmark: 'light', teaser: 'Old Salt has the lamp. And the snacks.' },
  '4,4': { kind: '?', name: 'Water Park', teaser: 'Something squeaks on the big slide.' },
};
export const LOT_KINDS = {
  R: { name: 'Rescue', prize: 'A survivor' },
  C: { name: 'Cache', prize: 'Coins and gems' },
  D: { name: 'Decoration set', prize: 'Decorations' },
  L: { name: 'Landmark', prize: 'A permanent bonus' },
  '?': { name: 'Mystery', prize: 'Who knows?' },
};
export const RUINS = ['shopfront', 'house', 'stand', 'stage', 'silo', 'garage'];

/** Price of the Nth lot you own (N = 2 is the first clear), then +500 each. */
export const LOT_PRICES = [0, 0, 50, 150, 300, 450, 650, 850, 1100, 1400, 1700, 2000, 2400, 2800];
export const LOT_PRICE_AFTER = 500;
/** How many lots you may own, by zone; then +1 per late milestone (past the last gate), up to the max. */
export const LAND_CAP = [3, 5, 7, 10, 13, 16];
export const LAND_MAX = 25;

/** A clear's prize knocks three times like a chest, each with this Glow-Up chance. */
export const LOT_GLOW = 0.15;
export const CACHE = { coins: (zone) => 100 * zone, gems: 10 };
export const LANDMARK_GEMS = 20;
/** Mystery lots: one of these (weights). */
export const MYSTERY = [
  { w: 15, kind: 'legend' },
  { w: 15, kind: 'goldenHero' },
  { w: 20, kind: 'sibling' },
  { w: 30, kind: 'giant' },
  { w: 20, kind: 'gems', gems: 50 },
];
export const MYSTERY_GRADE_GEMS = 10;

/** Six landmarks (3×3, fixed): restored, each gives one bonus forever. */
export const LANDMARKS = {
  tower: { name: 'Water Tower', boss: 'the Plumber', bonus: 'Supply Crate refills every 1 h 45 m', banner: 'THE PLUMBER IS FLUSHED!', cratePeriod: 105 },
  drivein: { name: 'Drive-in', boss: 'the Projectionist', bonus: '+10% raid coins', banner: 'THE PROJECTIONIST: THE END!', coins: 0.1 },
  radio: { name: 'Radio Mast', boss: 'the DJ', bonus: 'Strays follow you home twice as often, and a Hero answers the call', banner: 'THE DJ IS OFF THE AIR!', strays: 2 },
  fire: { name: 'Fire Station', boss: 'the Fire Chief', bonus: '+5% squad power', banner: 'THE FIRE CHIEF IS HOSED!', power: 0.05 },
  wheel: { name: 'Fairground Wheel', boss: 'the Carny', bonus: '+2 pts Glow-Up chance per knock', banner: 'THE CARNY TAKES A SPIN!', glow: 0.02 },
  light: { name: 'Lighthouse Pier', boss: 'Old Salt', bonus: 'Bank Vault refills every 7 h', banner: 'OLD SALT WALKS THE PLANK!', vaultPeriod: 420 },
};

/** The start lot's layout in local tiles (u → i, v → j). */
export const START_LAYOUT = {
  buildings: [
    { id: 'bigtop', u: 0, v: 0 },
    { id: 'crate', u: 3, v: 0 },
    { id: 'vault', u: 5, v: 0 },
    { id: 'striker', u: 0, v: 3 },
    { id: 'gallery', u: 0, v: 5 },
  ],
  homes: [
    { u: 3, v: 3 },
    { u: 5, v: 3 },
    { u: 3, v: 5 },
  ],
  decor: [{ kind: 'campfire', u: 2, v: 4 }],
  paths: [
    [2, 3],
    [2, 4],
    [2, 5],
    [2, 6],
    [3, 2],
    [4, 2],
    [5, 2],
    [6, 2],
  ],
};

/** One home per survivor (2×2, free, automatic); its look follows the owner's level. */
export const HOME_SIZE = 2;
export const HOME_TIERS = [
  { from: 1, id: 'tent', name: 'Tent' },
  { from: 2, id: 'shack', name: 'Shack' },
  { from: 4, id: 'cabin', name: 'Log cabin' },
  { from: 6, id: 'cottage', name: 'Cottage' },
  { from: 8, id: 'tower', name: 'Tower house' },
  { from: 10, id: 'gold', name: 'Golden house' },
];

/** Four decoration sets, each tied to a vibe and to wishes. */
export const SETS = {
  cozy: { name: 'Cozy', vibe: 'sleepy', color: '#c98a4b' },
  garden: { name: 'Garden', vibe: 'sunny', color: '#36c06a' },
  party: { name: 'Party', vibe: 'showoff', color: '#ff6fb5' },
  lookout: { name: 'Lookout', vibe: 'jumpy', color: '#3d8bf0' },
};
export const SET_ORDER = ['cozy', 'garden', 'party', 'lookout'];

/**
 * Decorations: no stats, just looks and wishes. size in tiles (square).
 * price null = can't be bought (found in junk, sets, mysteries).
 */
export const DECOR = {
  bench: { name: 'Bench', set: 'cozy', size: 1, price: 40, zone: 1 },
  campfire: { name: 'Campfire', set: 'cozy', size: 1, price: 50, zone: 2 },
  hammock: { name: 'Hammock', set: 'cozy', size: 1, price: 60, zone: 2 },
  hottub: { name: 'Bathtub Hot Tub', set: 'cozy', size: 2, price: null, rare: true },
  treehouse: { name: 'Treehouse', set: 'cozy', size: 2, price: null, signature: true },
  planter: { name: 'Planter', set: 'garden', size: 1, price: 40, zone: 1 },
  sunflowers: { name: 'Sunflowers', set: 'garden', size: 1, price: 50, zone: 2 },
  veggie: { name: 'Veggie Patch', set: 'garden', size: 2, price: 90, zone: 3 },
  gnome: { name: 'Golden Gnome', set: 'garden', size: 1, price: null, rare: true },
  pumpkins: { name: 'Pumpkin Patch', set: 'garden', size: 2, price: null, signature: true },
  flamingo: { name: 'Lawn Flamingo', set: 'party', size: 1, price: 40, zone: 1 },
  trampoline: { name: 'Trampoline', set: 'party', size: 1, price: 70, zone: 2 },
  stage: { name: 'Pallet Stage', set: 'party', size: 2, price: 120, zone: 3 },
  disco: { name: 'Disco Ball Pole', set: 'party', size: 1, price: null, rare: true },
  windmill: { name: 'Windmill Hole', set: 'party', size: 2, price: null, signature: true },
  flagpole: { name: 'Flag Pole', set: 'lookout', size: 1, price: 40, zone: 1 },
  searchlight: { name: 'Searchlight', set: 'lookout', size: 1, price: 70, zone: 2 },
  ladder: { name: 'Lookout Ladder', set: 'lookout', size: 1, price: 80, zone: 2 },
  scarecrow: { name: 'Scarecrow in a Tutu', set: 'lookout', size: 1, price: null, rare: true },
  rocketslide: { name: 'Rocket Slide', set: 'lookout', size: 2, price: null, signature: true },
};
export const DECOR_ORDER = Object.keys(DECOR);
/** Keepsakes: every Hero, Legend and golden newcomer brings one with their name on it. */
export const KEEPSAKES = {
  jukebox: { name: 'Jukebox', size: 1 },
  arcade: { name: 'Arcade Cabinet', size: 1 },
  grill: { name: 'Grill', size: 1 },
  rocker: { name: 'Rocking Chair', size: 1 },
  telescope: { name: 'Telescope', size: 1 },
  gnomes: { name: 'Gnome Army', size: 1 },
  carousel: { name: 'Mini Carousel', size: 2, legend: true },
  greenhouse: { name: 'Greenhouse', size: 2, legend: true },
};
/** Zone souvenirs (2×2 plinths) parachute in at each gate. */
export const SOUVENIR_SIZE = 2;
export const STATUE_DAY = 7;

/** Paths: free, painted with a finger; walkers prefer them. */
export const PATHS = {
  dirt: { name: 'Dirt', zone: 1 },
  planks: { name: 'Planks', zone: 2 },
  brick: { name: 'Brick', zone: 3 },
};
export const PATH_ORDER = ['dirt', 'planks', 'brick'];

/** A cleared lot leaves junk piles; tap one to pop it. */
export const JUNK = {
  perLot: 4,
  table: [
    { w: 70, kind: 'coins' },
    { w: 15, kind: 'gems', min: 2, max: 4 },
    { w: 12, kind: 'common' },
    { w: 3, kind: 'rare' },
  ],
  coins: (zone) => 10 + 10 * zone,
  coinSpread: 0.25,
  // "Someone's in the trunk!": a survivor in a pile (the first by FIRST_TRUNK, never more than TRUNK_MAX apart).
  trunk: 0.03,
  firstTrunk: 12,
  trunkMax: 40,
};

/** Wishes: one at a time, for a decoration set near the wisher's home. */
export const WISH = {
  range: 2, // tiles from the home's footprint
  badges: (zone) => 4 + 2 * zone,
  after: 20 * MIN, // after the last was granted
  awayAfter: HOUR, // or on returning after this long
  squadWeight: 3,
  starWeight: 2,
  siblingChance: 0.15,
};


/** Town names: three suggestions from these parts, or type your own. */
export const TOWN_PARTS = {
  a: ['Pinecone', 'Lucky', 'Sunny', 'Maple', 'Brave', 'Second', 'Cozy', 'Bright', 'Last', 'Little', 'Lakeside', 'Hopeful'],
  b: ['Stop', 'Haven', 'Hollow', 'Rest', 'Town', 'Corner', 'Landing', 'Ridge', 'Crossing', 'Springs', 'Pines', 'Harbor'],
};
export const TOWN_COLORS = ['#e8483f', '#3d8bf0', '#36c06a', '#f5b82e', '#b25cff', '#ff6fb5'];
/** Fence tier follows the Gas Station's look stage (1..3) plus string lights at Lv 7. */
export const FENCE_TIERS = ['planks', 'tin', 'brick', 'lights'];

/**
 * People found in the town (rescues, trunks, mysteries, the radio call) arrive
 * this many levels below a chest newcomer of the same rarity: they've been
 * hiding a while. It keeps the squad's level on Thrill Hill's pace.
 */
export const FOUND_ARRIVE = -1;

/** Auto-placement: a newcomer's home lands on the free 2×2 spot that scores best. */
export const HOME_SCORE = { path: 3, neighbour: 2, sibling: 4, perTile: -0.2 };
/** Roof campers shown on the Gas Station before "+N". */
export const ROOF_TENTS = 4;
/** Keepsakes come with every Hero, Legend and golden newcomer. */
export const KEEPSAKE_SMALL = ['jukebox', 'arcade', 'grill', 'rocker', 'telescope', 'gnomes'];
export const KEEPSAKE_LEGEND = ['carousel', 'greenhouse'];

/** Coming back after GIFT.away: visitors at the fence. */
export const VISITORS = {
  costume: { chance: 0.2, coins: (zone) => 20 * zone, decorChance: 0.5 }, // BONK: a common decoration or coins
  golden: { chance: 1 / 3, away: 2 * HOUR, gems: 5, taps: 3 }, // at most one a day
};
