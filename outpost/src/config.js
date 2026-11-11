// Last Stop: every number and every piece of content. town.js holds the rules,
// docs/LAST-STOP.md explains the design.
//
// The whole game:
//   PLAY      one survivor goes out for the night. Win: the next night, and coins.
//             Lose: a third of the coins, try again.
//   UPGRADE   tap a home: its survivor levels up (stronger, and the home grows).
//   NEW HOME  build one anywhere on your land: someone new moves in.
//   DECORATE  benches, flamingos, a carousel... just for fun.
//   LAND      clear the lot next door for more room.
// The Gas Station and the fence fix themselves up as you win nights.

// --- Survivors -------------------------------------------------------------------------------

export const MAX_LEVEL = 10;

/** Classes are looks only (outfit colour and a prop). */
export const CLASSES = {
  brawler: { name: 'Brawler', color: '#e8483f', dark: '#9e2a24', props: ['bat', 'pan', 'foamhand'] },
  shooter: { name: 'Shooter', color: '#3d8bf0', dark: '#2357a6', props: ['rifle', 'slingshot', 'blaster'] },
  medic: { name: 'Medic', color: '#36c06a', dark: '#1f7f43', props: ['medkit', 'spray', 'defib'] },
  tinker: { name: 'Tinker', color: '#f5b82e', dark: '#a87411', props: ['bomb', 'wrench', 'trap'] },
};
export const CLASS_ORDER = ['brawler', 'shooter', 'medic', 'tinker'];

/** Stars: a stronger start. `mult` scales power; `perk` is only the portrait's flair. */
export const RARITIES = {
  rookie: { name: 'Rookie', stars: 1, color: '#a3acb6', mult: 1.0, perk: 0 },
  veteran: { name: 'Veteran', stars: 2, color: '#4aa3ff', mult: 1.2, perk: 1 },
  hero: { name: 'Hero', stars: 3, color: '#b25cff', mult: 1.45, perk: 2 },
  legend: { name: 'Legend', stars: 4, color: '#ffc23a', mult: 1.75, perk: 3 },
};
export const RARITY_ORDER = ['rookie', 'veteran', 'hero', 'legend'];
// people.js still rolls these for flavour (they change nothing).
export const PERK_ORDER = ['lucky', 'cheer', 'gemnose', 'clutch'];
export const VIBE_ORDER = ['sunny', 'sleepy', 'showoff', 'jumpy'];

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

/** Power = round((base + growth × (level − 1)) × stars mult). */
export const POWER = { base: 10, growth: 4 };

/** Coins to reach level L (index L − 2). */
export const LEVEL_COST = [20, 35, 60, 95, 140, 200, 280, 380, 500];

// --- Nights ----------------------------------------------------------------------------------

/**
 * Night N's threat: base × N^curve. It climbs fast at first and slower later,
 * so a maxed survivor keeps winning for a long while.
 */
export const THREAT = { base: 7, curve: 0.5 };
/** Win chance: clamp(0.5 + slope × (power / threat − 1), min, max). */
export const ODDS = { slope: 1.1, min: 0.05, max: 0.95 };
export const ODDS_LABELS = [
  { min: 0.8, id: 'easy', name: 'Easy' },
  { min: 0.55, id: 'good', name: 'Good' },
  { min: 0.3, id: 'tough', name: 'Tough' },
  { min: 0, id: 'risky', name: 'Risky' },
];
/** A win pays base + perNight × N coins; a loss pays a third of that. */
export const PAY = { base: 15, perNight: 5, loss: 1 / 3 };

// --- Homes -------------------------------------------------------------------------------------

/** One 2×2 home per survivor. Its look follows the level. */
export const HOME_SIZE = 2;
export const HOME_TIERS = [
  { from: 1, id: 'tent', name: 'Tent' },
  { from: 2, id: 'shack', name: 'Shack' },
  { from: 4, id: 'cabin', name: 'Log cabin' },
  { from: 6, id: 'cottage', name: 'Cottage' },
  { from: 8, id: 'tower', name: 'Tower house' },
  { from: 10, id: 'gold', name: 'Golden house' },
];
/** Price of the Nth home you build (then + HOME_PRICE_STEP each). */
export const HOME_PRICES = [80, 120, 180, 260, 360, 480, 620, 780, 960, 1160];
export const HOME_PRICE_STEP = 220;
/** Who moves into a new home (weights). The first is always a Hero; a Legend comes by the LEGEND_BY-th. */
export const NEWCOMER_ODDS = { rookie: 50, veteran: 30, hero: 15, legend: 5 };
export const FIRST_NEWCOMER = 'hero';
export const LEGEND_BY = 8;

// --- The Gas Station -------------------------------------------------------------------------

/** It fixes itself up: one look level per this many nights won (Lv 1..7). */
export const STATION_STEP = 5;
export const STATION_MAX = 7;
/** Art look stages by station level: Patched (1–2), Fixed up (3–4), Proud (5–7; gold trim at 7). */
export const STAGES = [null, 1, 1, 2, 2, 3, 3, 3];
export const STAGE_NAMES = ['', 'Patched', 'Fixed up', 'Proud'];
/** The fence follows the station: planks, tin, brick, string lights. */
export const FENCE_TIERS = ['planks', 'tin', 'brick', 'lights'];

// --- Decorations ----------------------------------------------------------------------------------

/**
 * Just for fun. `art`: which art module draws it (decor-art's decorations or
 * keepsakes). size in tiles (square).
 */
export const DECOR = {
  bench: { name: 'Bench', size: 1, price: 25, art: 'decor' },
  planter: { name: 'Planter', size: 1, price: 25, art: 'decor' },
  flamingo: { name: 'Lawn Flamingo', size: 1, price: 30, art: 'decor' },
  campfire: { name: 'Campfire', size: 1, price: 40, art: 'decor' },
  sunflowers: { name: 'Sunflowers', size: 1, price: 40, art: 'decor' },
  flagpole: { name: 'Flag Pole', size: 1, price: 50, art: 'decor' },
  hammock: { name: 'Hammock', size: 1, price: 60, art: 'decor' },
  grill: { name: 'Grill', size: 1, price: 70, art: 'keepsake' },
  trampoline: { name: 'Trampoline', size: 1, price: 80, art: 'decor' },
  searchlight: { name: 'Searchlight', size: 1, price: 100, art: 'decor' },
  jukebox: { name: 'Jukebox', size: 1, price: 120, art: 'keepsake' },
  veggie: { name: 'Veggie Patch', size: 2, price: 150, art: 'decor' },
  hottub: { name: 'Bathtub Hot Tub', size: 2, price: 200, art: 'decor' },
  stage: { name: 'Pallet Stage', size: 2, price: 260, art: 'decor' },
  windmill: { name: 'Mini Golf Windmill', size: 2, price: 340, art: 'decor' },
  rocketslide: { name: 'Rocket Slide', size: 2, price: 420, art: 'decor' },
  treehouse: { name: 'Treehouse', size: 2, price: 500, art: 'decor' },
  carousel: { name: 'Mini Carousel', size: 2, price: 650, art: 'keepsake' },
};
export const DECOR_ORDER = Object.keys(DECOR).sort((a, b) => DECOR[a].price - DECOR[b].price);
// decor-art.js reads these for fallbacks and set badges.
export const KEEPSAKES = Object.fromEntries(Object.entries(DECOR).filter(([, d]) => d.art === 'keepsake'));
export const SETS = {};

// --- The town ------------------------------------------------------------------------------------

/** A 35×35 map in a 5×5 grid of 7×7 lots. Lot (a, b) covers i ∈ [7a, 7a+7), j ∈ [7b, 7b+7). */
export const LOT = 7;
export const LOTS_ACROSS = 5;
export const MAP = LOT * LOTS_ACROSS;
export const START_LOT = [2, 2];

/**
 * Every lot. kind: 'S' the start, 'R' a ruin (just land), 'L' a landmark
 * (restored when you clear it), '?' a surprise (coins when you clear it).
 * ruin = which ruined building stands there while it's wild.
 */
export const LOTS = {
  '0,0': { kind: '?', name: 'Old Quarry', teaser: 'Something glints at the bottom of the pit.' },
  '1,0': { kind: 'L', name: 'Radio Mast', landmark: 'radio', teaser: 'The DJ is still spinning records up there.' },
  '2,0': { kind: 'R', name: 'Pine Grove', ruin: 'house', teaser: 'A cabin, half hidden in the pines.' },
  '3,0': { kind: 'R', name: 'Bus Depot', ruin: 'garage', teaser: 'Lockers. Lots of lockers.' },
  '4,0': { kind: '?', name: 'Scrapyard', teaser: 'Under the tarp: something big.' },
  '0,1': { kind: 'R', name: 'Lumber Yard', ruin: 'silo', teaser: 'Stacks of planks, free to a good home.' },
  '1,1': { kind: 'L', name: 'Water Tower', landmark: 'tower', teaser: 'The Plumber waves from the top. Rudely.' },
  '2,1': { kind: 'R', name: 'Burger Stand', ruin: 'stand', teaser: 'It still smells of fries.' },
  '3,1': { kind: 'R', name: 'Car Lot', ruin: 'garage', teaser: 'A very shiny car, and a very flat tyre.' },
  '4,1': { kind: 'L', name: 'Fire Station', landmark: 'fire', teaser: 'The Fire Chief guards the big red truck.' },
  '0,2': { kind: 'R', name: 'School', ruin: 'house', teaser: 'Chalk on the window: HELP. ALSO, SNACKS?' },
  '1,2': { kind: 'R', name: 'Diner', ruin: 'shopfront', teaser: 'Pie in the window. Probably fine.' },
  '2,2': { kind: 'S', name: 'Last Stop', teaser: 'Home.' },
  '3,2': { kind: 'R', name: 'Motel', ruin: 'house', teaser: 'Room 6 has a DO NOT DISTURB sign. And snoring.' },
  '4,2': { kind: 'R', name: 'Pharmacy', ruin: 'shopfront', teaser: 'A voice behind the counter: "We are OPEN."' },
  '0,3': { kind: 'L', name: 'Fairground Wheel', landmark: 'wheel', teaser: 'The Carny keeps the wheel turning.' },
  '1,3': { kind: 'R', name: 'Playground', ruin: 'stage', teaser: 'A rocket slide, rusty but proud.' },
  '2,3': { kind: 'R', name: 'Mini Golf', ruin: 'stand', teaser: 'The windmill hole still turns.' },
  '3,3': { kind: 'L', name: 'Drive-in', landmark: 'drivein', teaser: 'The Projectionist is showing zombie films. To zombies.' },
  '4,3': { kind: 'R', name: 'Farm Stand', ruin: 'stand', teaser: 'Pumpkins! Huge ones.' },
  '0,4': { kind: '?', name: 'Hidden Cove', teaser: 'Footprints lead to the water.' },
  '1,4': { kind: 'R', name: 'Campground', ruin: 'stage', teaser: 'A tent is zipped shut. It zips back.' },
  '2,4': { kind: 'R', name: 'Boat Rental', ruin: 'stand', teaser: 'Pedal boats shaped like swans.' },
  '3,4': { kind: 'L', name: 'Lighthouse Pier', landmark: 'light', teaser: 'Old Salt has the lamp. And the snacks.' },
  '4,4': { kind: '?', name: 'Water Park', teaser: 'Something squeaks on the big slide.' },
};
export const RUINS = ['shopfront', 'house', 'stand', 'stage', 'silo', 'garage'];

/** Price of the Nth extra lot (then + LAND_PRICE_STEP each). */
export const LAND_PRICES = [120, 220, 350, 500, 680, 880, 1100, 1350, 1620, 1900, 2200, 2500];
export const LAND_PRICE_STEP = 320;
/** A surprise lot pays back this share of its price, and more (between min and max). */
export const SURPRISE = { min: 0.6, max: 1.4 };

/** Six landmarks (3×3), restored when their lot is cleared. Looks only. */
export const LANDMARKS = {
  tower: { name: 'Water Tower', boss: 'the Plumber', banner: 'THE PLUMBER IS FLUSHED!' },
  drivein: { name: 'Drive-in', boss: 'the Projectionist', banner: 'THE PROJECTIONIST: THE END!' },
  radio: { name: 'Radio Mast', boss: 'the DJ', banner: 'THE DJ IS OFF THE AIR!' },
  fire: { name: 'Fire Station', boss: 'the Fire Chief', banner: 'THE FIRE CHIEF IS HOSED!' },
  wheel: { name: 'Fairground Wheel', boss: 'the Carny', banner: 'THE CARNY TAKES A SPIN!' },
  light: { name: 'Lighthouse Pier', boss: 'Old Salt', banner: 'OLD SALT WALKS THE PLANK!' },
};
/** Where a landmark stands in its lot (lot-local tiles). */
export const LANDMARK_AT = [2, 2];

// --- The start -------------------------------------------------------------------------------------

/** One Rookie in a tent, by the Gas Station. Layout in start-lot tiles (u → i, v → j). */
export const START = {
  coins: 60,
  survivor: { cls: 'brawler', rarity: 'rookie', vibe: 'sunny' },
  station: { u: 0, v: 0, size: 3 },
  home: { u: 4, v: 0 },
  decor: [
    { kind: 'campfire', u: 4, v: 4 },
    { kind: 'bench', u: 5, v: 4 },
    { kind: 'planter', u: 0, v: 4 },
  ],
};

/** The town's name on the Gas Station sign, and its paint. */
export const TOWN = { name: 'Last Stop', color: '#e8483f' };

// --- Testing tuning (the drawer's sliders) ------------------------------------------------------------

export const TUNING_DEFAULTS = {
  coins: 1, // coins from nights ×
  threat: 1, // night threat ×
  outcome: 'auto', // 'auto' | 'win' | 'lose'
  volume: 0.7,
  haptics: true,
};
