// Strays: every number and name in one place. No DOM in here.
//
// The whole game in one breath: strays follow your people home. Give each one
// a room. Feed them and hug them until they dare to show who they are. Then
// they go out for cans too.

/** The block is a grid of rooms: 4 across, 3 up. */
export const COLS = 4;
export const ROWS = 3;
export const ROOMS = COLS * ROWS;
/** The room by the front door (bottom left): the one that starts open. */
export const FIRST_ROOM = (ROWS - 1) * COLS;

/** How far along somebody is. */
export const BAG = 0; // asleep in a sleeping bag: nobody has seen them yet
export const STRAY = 1; // hooded and scared: who they are is still hidden
export const SOMEBODY = 2; // hood off: a cook, a clown, an astronaut...
export const HERO = 3; // grown into the block's pride
export const STAGE_NAMES = ['BAG', 'STRAY', 'SOMEBODY', 'HERO'];

/**
 * How rare a kind is. `weight` is the chance a new stray is of that rarity
 * (among the rarities that still have somebody the block hasn't met);
 * `bonus` is the extra cans one of them finds on every trip.
 */
export const RARITIES = {
  common: { name: 'COMMON', stars: 1, weight: 58, bonus: 0 },
  rare: { name: 'RARE', stars: 2, weight: 30, bonus: 1 },
  epic: { name: 'EPIC', stars: 3, weight: 10, bonus: 2 },
  secret: { name: 'SECRET', stars: 4, weight: 2, bonus: 3 },
};
export const RARITY_ORDER = ['common', 'rare', 'epic', 'secret'];

/**
 * Who a stray can turn out to be. Eighteen kinds for twelve rooms, and no
 * kind moves in twice: every block ends up with its own crowd.
 * `says` is what they say when the hood comes off.
 */
export const KINDS = [
  { id: 'cook', name: 'COOK', rarity: 'common', says: 'WHO IS HUNGRY?' },
  { id: 'nurse', name: 'NURSE', rarity: 'common', says: 'LET ME SEE THAT.' },
  { id: 'mechanic', name: 'MECHANIC', rarity: 'common', says: 'I CAN FIX IT.' },
  { id: 'student', name: 'STUDENT', rarity: 'common', says: 'IS THERE WIFI?' },
  { id: 'jogger', name: 'JOGGER', rarity: 'common', says: 'I NEVER STOPPED.' },
  { id: 'farmer', name: 'FARMER', rarity: 'common', says: 'GOT ANY SOIL?' },
  { id: 'knitter', name: 'KNITTER', rarity: 'common', says: 'YOU LOOK COLD, DEAR.' },
  { id: 'skater', name: 'SKATER', rarity: 'common', says: 'NICE STAIRS.' },
  { id: 'firefighter', name: 'FIREFIGHTER', rarity: 'rare', says: 'EVERYBODY OUT? GOOD.' },
  { id: 'dj', name: 'DJ', rarity: 'rare', says: 'ONE MORE SONG.' },
  { id: 'clown', name: 'CLOWN', rarity: 'rare', says: 'HONK.' },
  { id: 'wrestler', name: 'WRESTLER', rarity: 'rare', says: 'I FIGHT FOR THE BLOCK!' },
  { id: 'scientist', name: 'SCIENTIST', rarity: 'rare', says: 'I HAVE A THEORY.' },
  { id: 'magician', name: 'MAGICIAN', rarity: 'rare', says: 'PICK A CAN. ANY CAN.' },
  { id: 'astronaut', name: 'ASTRONAUT', rarity: 'epic', says: 'I LANDED A BIT LATE.' },
  { id: 'mascot', name: 'MASCOT', rarity: 'epic', says: 'THE ZIP IS STUCK.' },
  { id: 'knight', name: 'KNIGHT', rarity: 'epic', says: 'THE MUSEUM WAS CLOSED.' },
  { id: 'zed', name: 'NICE ZOMBIE', rarity: 'secret', says: 'HUG?' },
];
export const KIND_BY_ID = Object.fromEntries(KINDS.map((k) => [k.id, k]));

/** Short names, so "MIA THE FIREFIGHTER" still fits the little screen. */
export const NAMES = [
  'MIA', 'LEO', 'ADA', 'SAM', 'KAI', 'ZOE', 'MAX', 'IVY', 'REX', 'NOA', 'ELI', 'UMA',
  'JAX', 'RIO', 'LIV', 'BEA', 'GUS', 'KIT', 'TED', 'PIP', 'ROO', 'FIN', 'ANA', 'OLE',
  'EVE', 'IDA', 'LOU', 'MO', 'JO', 'ACE', 'BO', 'CAL', 'DOT', 'FAY', 'HAL', 'INA',
  'JEM', 'KEN', 'LEX', 'NED', 'PAZ', 'RAY', 'SID', 'TAJ', 'VAL', 'WES', 'YAN', 'ZAK',
  'ALMA', 'COCO', 'DUKE', 'FERN', 'GIGI', 'HUGO', 'IGGY', 'JUNO', 'KIKI', 'LULU',
  'MILO', 'NICO', 'OTTO', 'RUBY', 'SUKI', 'VERA', 'WREN', 'YOKO',
];

/** How many looks the art has to offer (see sprites.js). */
export const SKINS = 5;
export const HAIRS = 7;
export const STYLES = 5;
/** Little habits, for show: what they do when nobody is watching. */
export const QUIRKS = ['pacer', 'dancer', 'gazer', 'hummer', 'napper', 'stretcher'];

/**
 * The tuning. The testing drawer can change any of it; the balance tool
 * (npm run strays:balance) shows what a change does to the first days.
 * Times are minutes unless the name ends in Sec.
 */
export const DEFAULT_TUNING = {
  startCans: 3,

  // Hearts. A stray shows who they are at needReveal; a somebody is a hero at needHero.
  needReveal: 3,
  needHero: 14,
  mealHearts: 2,
  hugHearts: 1,
  patchHearts: 1,
  tripHearts: 1,
  greatHearts: 2,

  // Wishes.
  hungerMin: 150, // a somebody is hungry again this long after a meal
  strayHungerMin: 30, // a stray, sooner
  hugMin: 45, // wants a hug this long after the last one
  hugFirstSec: 4, // ...and this soon after climbing out of the bag

  // Trips: one goes out, then rests.
  restSomeMin: 20,
  restHeroMin: 30,
  restRampSec: [20, 60, 180, 480], // the first few trips need less rest
  gentleTrips: 3, // the first trips never go badly
  cansSome: [3, 5],
  cansHero: [6, 8],
  greatCans: 2,
  roughCans: 2,
  oddsSome: [25, 50, 25], // great, good, rough
  oddsHero: [50, 40, 10],

  // Strays follow people home.
  followChance: 0.6,
  followSure: 2, // the first trips always bring somebody
  followPity: 2, // ...and so does the trip after this many came back alone
  bagRampSec: [0, 5, 30, 120, 300], // how long a newcomer sleeps before they can be woken

  // Rooms: the price of the 1st, 2nd, 3rd... room.
  roomPrices: [0, 4, 7, 12, 18, 26, 36, 48, 60, 75, 90, 110],

  // Zombies at the back fence: bonk them, some drop a can.
  zombieFirstSec: 50,
  zombieMin: 6,
  zombieMax: 3,
  zombieCanChance: 0.5,
  zombiePity: 2,

  sound: true,
  haptics: true,
};

/** The sliders the testing drawer offers: [key, label, min, max, step]. */
export const TUNING_SLIDERS = [
  ['needHero', 'Hearts to hero', 4, 40, 1],
  ['hungerMin', 'Hungry again (min)', 1, 480, 1],
  ['hugMin', 'Hug again (min)', 1, 240, 1],
  ['restSomeMin', 'Rest after a trip (min)', 1, 120, 1],
  ['restHeroMin', 'Hero rest (min)', 1, 120, 1],
  ['followChance', 'A stray follows (chance)', 0, 1, 0.05],
  ['zombieMin', 'Zombie every (min)', 1, 60, 1],
  ['zombieCanChance', 'Zombie drops a can (chance)', 0, 1, 0.05],
];
