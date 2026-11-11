// Long Haul: every number and every piece of content. rules.js holds the rules,
// docs/LONG-HAUL.md explains the design.
//
// The whole game:
//   PLAY      three survivors go out. Everyone still standing at the end
//             carries one crate home: 0 to 3 stars.
//   PICK      nine crates on the pallet, one pick per star: supplies, tokens,
//             and somewhere among them a radio.
//   LEVEL UP  tokens + supplies make a survivor stronger.
//   RADIO     the rack holds three radios and calls with one at a time.
//             Someone answers: a new survivor, or tokens from one you know.
//   THE ROAD  stars take you down the road to Pier 9. Each stop is more
//             dangerous, has richer crates and new voices on the radio.
//
// What comes from where:
//   The Walking Dead: No Man's Land   the camp, a squad of three, classes,
//                                     nine crates after a mission, radio calls
//   Clash Royale                      survivors as cards (tokens + supplies to
//                                     level up), three stars, slots on a timer
//                                     (the radio rack), a ladder of areas that
//                                     each unlock new cards

// --- Survivors -------------------------------------------------------------------------------

export const MAX_LEVEL = 10;
export const SQUAD_SIZE = 3;

/** Classes are looks only: the weapon, and how they fight in the run you watch. */
export const CLASSES = {
  scout: { name: 'Scout', color: '#3fbf7f', melee: true },
  bruiser: { name: 'Bruiser', color: '#e8643f', melee: true },
  warrior: { name: 'Warrior', color: '#d9a52b', melee: true },
  shooter: { name: 'Shooter', color: '#4a8fe8', melee: false },
  hunter: { name: 'Hunter', color: '#7a9a3a', melee: false },
  assault: { name: 'Assault', color: '#b06adf', melee: false },
};

/**
 * Rarity: a stronger start (`mult` scales power) and smaller token stacks
 * (`stack` scales how many tokens turn up at once). `call` is the weight of a
 * radio call reaching someone of that rarity.
 */
export const RARITIES = {
  common: { name: 'Common', color: '#9aa7b8', dark: '#5d6b7e', mult: 1.0, stack: 1.0, call: 55 },
  rare: { name: 'Rare', color: '#4a9dff', dark: '#1f5fb8', mult: 1.15, stack: 0.75, call: 30 },
  epic: { name: 'Epic', color: '#b86bff', dark: '#6f2fb8', mult: 1.3, stack: 0.5, call: 12 },
  legendary: { name: 'Legendary', color: '#ffc531', dark: '#b87a00', mult: 1.5, stack: 0.25, call: 3 },
};
export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];

/**
 * The cast: twelve fixed survivors (cards), two of each class. `area` is the
 * stop on the road where their voice first turns up on the radio (0 = from the
 * start). `look` is read by figures.js. They are the people of We Left Ben's
 * world: the squad, and the ones who signed the walls.
 */
export const CAST = {
  odile: {
    name: 'Odile',
    cls: 'hunter',
    rarity: 'common',
    area: 0,
    line: 'Day 41. Still writing it all down.',
    look: { skin: '#8d5a3b', hair: 'puff', hairColor: '#2b1d1a', top: '#5f8a4e', bottom: '#3d4763', prop: 'rifle', extra: 'journal' },
  },
  teo: {
    name: 'Teo',
    cls: 'scout',
    rarity: 'common',
    area: 0,
    line: 'I can hotwire that. (He can’t. — Mags)',
    look: { skin: '#d9a273', hair: 'messy', hairColor: '#221a1f', top: '#d9483b', bottom: '#40507a', prop: 'crowbar', extra: 'hood' },
  },
  mags: {
    name: 'Mags',
    cls: 'bruiser',
    rarity: 'common',
    area: 0,
    line: 'I was here first.',
    look: { skin: '#f2c4a0', hair: 'pony', hairColor: '#d9682a', top: '#3f6fb0', bottom: '#2f3550', prop: 'hockey', extra: 'freckles' },
  },
  gary: {
    name: 'Gary',
    cls: 'warrior',
    rarity: 'common',
    area: 0,
    line: 'Employee of the month. Again.',
    look: { skin: '#f0c8a8', hair: 'combover', hairColor: '#8a6a4a', top: '#e9edf2', bottom: '#59606e', prop: 'golfclub', extra: 'tie' },
  },
  deb: {
    name: 'Deb',
    cls: 'assault',
    rarity: 'common',
    area: 0,
    line: 'That was MY yogurt.',
    look: { skin: '#e9b995', hair: 'bob', hairColor: '#b9bcc4', top: '#c9628f', bottom: '#4a4466', prop: 'stapler', extra: 'glasses' },
  },
  lou: {
    name: 'Big Lou',
    cls: 'shooter',
    rarity: 'rare',
    area: 0,
    line: 'That’s 113. I counted.',
    look: { skin: '#c98d62', hair: 'bald', hairColor: '#c9c4bd', top: '#1f6b5a', bottom: '#3a3f4f', prop: 'revolver', extra: 'moustache', build: 'big' },
  },
  caretaker: {
    name: 'The Caretaker',
    cls: 'warrior',
    rarity: 'rare',
    area: 1,
    line: 'Plot 14 is empty again.',
    look: { skin: '#e3c2a2', hair: 'long', hairColor: '#d8d4cc', top: '#4b4f5c', bottom: '#2c2f3a', prop: 'shovel', extra: 'brimhat' },
  },
  rusty: {
    name: 'Rusty',
    cls: 'bruiser',
    rarity: 'rare',
    area: 2,
    line: 'U-pull-it. I-bonk-it.',
    look: { skin: '#a56b45', hair: 'buzz', hairColor: '#1f1a1a', top: '#c9722b', bottom: '#3b4252', prop: 'wrench', extra: 'weldmask', build: 'big' },
  },
  biscuit: {
    name: 'Biscuit',
    cls: 'scout',
    rarity: 'epic',
    area: 2,
    line: 'Good boy. Snores. Bites ankles.',
    look: { dog: true, fur: '#d9a05a', furDark: '#a86f33', top: '#d9483b' },
  },
  dawn: {
    name: 'DJ Dawn',
    cls: 'shooter',
    rarity: 'epic',
    area: 3,
    line: 'Traffic and drowsers on the 2s.',
    look: { skin: '#6f4630', hair: 'afro', hairColor: '#2a1c22', top: '#f0b429', bottom: '#2f2a4a', prop: 'tcannon', extra: 'headphones' },
  },
  tinkerer: {
    name: 'The Tinkerer',
    cls: 'assault',
    rarity: 'legendary',
    area: 3,
    line: 'Loud = bad. Cans = dinner.',
    look: { skin: '#d6a77c', hair: 'hood', hairColor: '#3a3340', top: '#5a4a78', bottom: '#2a2638', prop: 'nailgun', extra: 'goggles' },
  },
  harbour: {
    name: 'The Harbour Master',
    cls: 'hunter',
    rarity: 'rare',
    area: 4,
    line: 'No flare, no ferry.',
    look: { skin: '#eac3a3', hair: 'short', hairColor: '#eeeae2', top: '#f2c230', bottom: '#2f4a6b', prop: 'harpoon', extra: 'captain' },
  },
};
export const CAST_ORDER = ['odile', 'teo', 'mags', 'gary', 'deb', 'lou', 'caretaker', 'rusty', 'biscuit', 'dawn', 'harbour', 'tinkerer'];

/** Power = round((base + growth × (level − 1)) × rarity mult). */
export const POWER = { base: 10, growth: 4 };

/** Tokens and supplies to reach level L (index L − 2). */
export const TOKENS_TO_LEVEL = [2, 3, 4, 6, 8, 10, 13, 16, 20];
export const SUPPLIES_TO_LEVEL = [15, 30, 65, 120, 200, 310, 460, 660, 920];
/** Tokens for someone at the top level turn into supplies (per token, × the area's loot). */
export const TOKEN_REFUND = 6;

// --- The start -------------------------------------------------------------------------------

export const START = {
  supplies: 0,
  squad: ['odile', 'teo', 'mags'],
  /** The first calls always reach someone new (while anyone is out there). */
  freshCalls: 3,
  /** Who answers the very first call. */
  firstCall: 'lou',
};

// --- The road --------------------------------------------------------------------------------

/**
 * Six stops on the way to the ferry: the six places of We Left Ben. `stars` is
 * the total it takes to get there, `danger` what a survivor's power is held
 * against, `loot` scales what the crates hold.
 */
export const AREAS = [
  { id: 'suburbia', name: 'Suburbia', sub: 'the lawns of Delco', stars: 0, danger: 8, loot: 1 },
  { id: 'graveyard', name: 'The Graveyard', sub: 'Wissahickon Hill', stars: 12, danger: 14, loot: 1.6 },
  { id: 'junkyard', name: 'The Junkyard', sub: 'Cracked Bell Auto Salvage', stars: 40, danger: 21, loot: 2.4 },
  { id: 'streets', name: 'Center City', sub: 'after dark', stars: 90, danger: 28, loot: 3.5 },
  { id: 'office', name: 'Market Street', sub: 'the 14th floor', stars: 160, danger: 36, loot: 5 },
  { id: 'docks', name: 'Pier 9', sub: 'the last ferry', stars: 250, danger: 44, loot: 7 },
];
/** The end of the road: the LIBERTY BELLE answers. The prototype goes on after it. */
export const FERRY_STARS = 360;
/** Each new stop makes this many calls reach someone new (while anyone is out there). */
export const FRESH_PER_AREA = 1;

// --- The run ---------------------------------------------------------------------------------

/**
 * Will a survivor still be standing? Their power counts for `own` of it and the
 * squad's average for the rest (the others watch your back):
 *   chance = clamp(0.5 + slope × (effective / danger − 1), min, max)
 * So power = danger is a coin flip, and a third more is about as safe as it gets.
 */
export const STAND = { own: 0.75, slope: 1.2, min: 0.08, max: 0.95 };
export const STAND_LABELS = [
  { min: 0.85, id: 'solid', name: 'Solid' },
  { min: 0.6, id: 'good', name: 'Good' },
  { min: 0.35, id: 'shaky', name: 'Shaky' },
  { min: 0, id: 'risky', name: 'Risky' },
];
/** Nobody standing: no crates, a handful of scraps (× the area's loot). */
export const SCRAPS = 6;

// --- The crates ------------------------------------------------------------------------------

export const GRID = 9;
/**
 * What the nine crates are. The special one is a radio while the rack has
 * room, and the gold crate otherwise. Supplies are [min, max] × the area's
 * loot; a token stack is tokens.base + tokens.perArea × area, ±1, × the
 * survivor's rarity stack (never less than 1).
 */
export const CRATES = {
  small: { count: 3, supplies: [8, 12], tier: 'wood' },
  medium: { count: 2, supplies: [20, 28], tier: 'steel' },
  tokens: { count: 3, base: 2, perArea: 0.5 },
  gold: { supplies: [60, 80], tier: 'gold' },
  /** A token crate is for someone in the squad this often; otherwise for anyone else in the camp. */
  squadShare: 0.65,
  /** Once in a while a small crate is a second gold one. */
  luckyGold: 0.04,
  /** And once in a while two little eyes on the pallet look straight at the special crate. */
  eyes: 0.07,
};

// --- The radio -------------------------------------------------------------------------------

export const RACK_SIZE = 3;
/** How long a call takes (seconds). The first few are quick, to teach the loop. */
export const CALL_SECONDS = 3 * 3600;
export const FIRST_CALLS = [12, 90, 600];
/** Someone you know answers: tokens, this many times a crate's stack. */
export const CALL_STACK = 3;
/** The Legendary answers by this many calls after their voice is first out there. */
export const LEGEND_PITY = 14;
/** Newcomers arrive this far below the squad's average level (never under 1). */
export const ARRIVE_BELOW = { common: 1, rare: 1, epic: 0, legendary: 0 };

// --- Camp talk -------------------------------------------------------------------------------

/**
 * What people say around the fire, now and then, when nothing else is going
 * on. `then` is who answers, if they are in the camp. Flavour only.
 */
export const BARKS = [
  { who: 'odile', say: 'Day 41. Quiet.' },
  { who: 'odile', say: 'Writing that down.' },
  { who: 'odile', say: 'Biscuit howled at the radio again.' },
  { who: 'teo', say: 'I could drive.', then: ['mags', 'No.'] },
  { who: 'teo', say: 'I can fix the radio.', then: ['mags', 'It isn\u2019t broken.'] },
  { who: 'teo', say: 'Was that whistling?', then: ['mags', 'It\u2019s the pipes.'] },
  { who: 'mags', say: 'First watch is mine.' },
  { who: 'mags', say: 'Teo mowed the lot. Why.', then: ['teo', 'Nobody asked.'] },
  { who: 'lou', say: '113.', then: ['mags', 'Lou can\u2019t count.'] },
  { who: 'lou', say: '114. That one counted.' },
  { who: 'lou', say: 'Held this fire two days once.' },
  { who: 'gary', say: 'Per my last email\u2026' },
  { who: 'gary', say: 'Is the printer still jammed?' },
  { who: 'deb', say: 'Who took my yogurt.', then: ['gary', '\u2026'] },
  { who: 'deb', say: 'I labelled it.' },
  { who: 'caretaker', say: 'Plot 14 is empty again.' },
  { who: 'caretaker', say: 'I keep count.' },
  { who: 'rusty', say: 'Crusher still works.' },
  { who: 'rusty', say: 'Got a spare alternator.' },
  { who: 'biscuit', say: 'Woof.' },
  { who: 'biscuit', say: '*snores*' },
  { who: 'dawn', say: 'Traffic: light. Drowsers: heavy.' },
  { who: 'dawn', say: '98.4, all night long.' },
  { who: 'harbour', say: 'No flare, no ferry.' },
  { who: 'harbour', say: 'She sails at dusk.' },
  { who: 'tinkerer', say: 'Loud = bad.' },
  { who: 'tinkerer', say: 'Who keeps adding eyes to my mark?' },
];

// --- A crate at the gate ---------------------------------------------------------------------

/**
 * After an hour or more away there is sometimes a crate at the gate, with a
 * few words on it in orange crayon. Nobody says who leaves them. (We Left Ben:
 * every line raises a question and none answers one.)
 */
export const GIFT = {
  afterRuns: 3,
  awayMs: 60 * 60 * 1000,
  chance: 0.3,
  supplies: [25, 40], // × the area's loot
  lines: ['found this.', 'you dropped it.', 'for the dog.', 'it was in the walls.', 'don’t say thank you.', 'i was here first.'],
};
export const BEN_COLOR = '#ff8a1e';

// --- Testing ---------------------------------------------------------------------------------

export const TUNING_DEFAULTS = {
  supplies: 1, // × supplies in crates
  tokens: 1, // × tokens in crates and calls
  danger: 1, // × every area's danger
  callTime: 1, // × how long a call takes
  outcome: 'auto', // 'auto' | '3' | '2' | '1' | '0': how many are left standing
  peek: true, // show what was in the crates you left behind
  volume: 0.6,
  haptics: true,
};
