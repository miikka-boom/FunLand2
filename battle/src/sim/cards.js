// The cards. A card is what you play in a match: a few units dropped onto
// your side of the field, or a spell cast anywhere. This file is the shared
// contract between the match simulation (what a card does), the meta game
// (rarity, which arena unlocks it, upgrades) and the UI (name, cost, blurb).
//
// Every number here is gameplay: the match sim and the balance tests read
// them, so tune them here and nowhere else.

export const RARITIES = {
  common: { id: 'common', name: 'Common', color: '#9fb4c8', dark: '#5d7186', glow: '#e8f1fa' },
  rare: { id: 'rare', name: 'Rare', color: '#f0a43a', dark: '#a8641a', glow: '#ffe2b0' },
  epic: { id: 'epic', name: 'Epic', color: '#b05ce0', dark: '#6a2c94', glow: '#ecc9ff' },
};

// kind 'unit': `unit` is a UNIT_TYPES id, `count` beans drop in a little
//   formation around the spot you picked (offsets in world px along x).
// kind 'spell': `spell` names an effect in sim/spells.js, `radius` is its reach
//   (also drawn as the aiming circle).
// arena: index of the arena that unlocks the card (0 = you start with it).
export const CARDS = {
  clubbers: {
    id: 'clubbers',
    name: 'Clubbers',
    kind: 'unit',
    unit: 'clubber',
    count: 2,
    spread: [-16, 16],
    mana: 3,
    rarity: 'common',
    arena: 0,
    desc: 'Two beans with big wooden clubs. Bonk first, ask later.',
  },
  squire: {
    id: 'squire',
    name: 'Squire',
    kind: 'unit',
    unit: 'squire',
    count: 1,
    mana: 3,
    rarity: 'common',
    arena: 0,
    desc: 'Sword and shield. Raises it against arrows and soaks up hits.',
  },
  archers: {
    id: 'archers',
    name: 'Archers',
    kind: 'unit',
    unit: 'archer',
    count: 2,
    spread: [-14, 14],
    mana: 3,
    rarity: 'common',
    arena: 0,
    desc: 'Two archers who lob arrows from a safe distance. Squishy up close.',
  },
  spikers: {
    id: 'spikers',
    name: 'Spikers',
    kind: 'unit',
    unit: 'spiker',
    count: 3,
    spread: [-22, 0, 22],
    mana: 2,
    rarity: 'common',
    arena: 0,
    desc: 'Three small, fast, pointy friends that pounce point-first.',
  },
  bomb: {
    id: 'bomb',
    name: 'Bomb',
    kind: 'unit',
    unit: 'bomb',
    count: 1,
    mana: 2,
    rarity: 'common',
    arena: 0,
    desc: 'Waddles up, lights its fuse and goes BOOM. Great against crowds.',
  },
  arrowRain: {
    id: 'arrowRain',
    name: 'Arrow Rain',
    kind: 'spell',
    spell: 'arrowRain',
    radius: 130,
    mana: 3,
    rarity: 'common',
    arena: 0,
    desc: 'Three volleys of arrows from the sky. Clears out small fry.',
  },
  boulder: {
    id: 'boulder',
    name: 'Boulder',
    kind: 'spell',
    spell: 'boulder',
    radius: 105,
    mana: 4,
    rarity: 'rare',
    arena: 0,
    desc: 'A big rock falls from the sky. Everything under it goes flying.',
  },
  clubberGang: {
    id: 'clubberGang',
    name: 'Clubber Gang',
    kind: 'unit',
    unit: 'clubber',
    count: 4,
    spread: [-36, -12, 12, 36],
    mana: 5,
    rarity: 'rare',
    arena: 0,
    desc: 'Four Clubbers at once. A wall of bonks.',
  },

  // --- Arena 2: Pointy Pass -----------------------------------------------------
  brick: {
    id: 'brick',
    name: 'Brick',
    kind: 'unit',
    unit: 'brick',
    count: 1,
    mana: 5,
    rarity: 'epic',
    arena: 1,
    desc: 'A giant block with a hammer. Ignores beans and marches on towers.',
  },
  cheeseWheel: {
    id: 'cheeseWheel',
    name: 'Cheese Wheel',
    kind: 'spell',
    spell: 'cheeseWheel',
    radius: 40,
    mana: 3, // (2 was too much: one roll knocks a whole push down)
    rarity: 'epic',
    arena: 1,
    desc: 'A giant wheel of cheese rolls toward the enemy, bowling beans over.',
  },
  bruiser: {
    id: 'bruiser',
    name: 'Bruiser',
    kind: 'unit',
    unit: 'bruiser',
    count: 1,
    mana: 4,
    rarity: 'rare',
    arena: 1,
    desc: 'An extra-large bean with an extra-large club. Slow, but it hurts.',
  },

  // --- Arena 3: Boom Ridge ------------------------------------------------------
  bombSquad: {
    id: 'bombSquad',
    name: 'Bomb Squad',
    kind: 'unit',
    unit: 'bomb',
    count: 3,
    spread: [-40, 0, 40],
    mana: 4,
    rarity: 'rare',
    arena: 2,
    desc: 'Three bombs. Keep them apart, or one sets off the rest.',
  },
  megaBomb: {
    id: 'megaBomb',
    name: 'Mega Bomb',
    kind: 'unit',
    unit: 'megabomb',
    count: 1,
    mana: 3, // (its blast flings your own push too: it has to be cheap to be worth it)
    rarity: 'epic',
    arena: 2,
    desc: 'A huge, slow bomb with a huge, loud blast. Hurts towers too.',
  },
  shieldWall: {
    id: 'shieldWall',
    name: 'Shield Wall',
    kind: 'unit',
    unit: 'squire',
    count: 3,
    spread: [-28, 0, 28],
    mana: 7,
    rarity: 'epic',
    arena: 2,
    desc: 'Three Squires, shields up. Arrows bounce, clubs come down on top.',
  },
};

export const CARD_ORDER = [
  'clubbers',
  'squire',
  'archers',
  'spikers',
  'bomb',
  'arrowRain',
  'boulder',
  'clubberGang',
  'bruiser',
  'brick',
  'cheeseWheel',
  'bombSquad',
  'megaBomb',
  'shieldWall',
];

/** The 8 cards everyone starts with (all Arena 1 cards). */
export const STARTER_DECK = ['clubbers', 'squire', 'archers', 'spikers', 'bomb', 'arrowRain', 'boulder', 'clubberGang'];

export const DECK_SIZE = 8;
export const HAND_SIZE = 4;
export const MAX_LEVEL = 9;

/** Stat multiplier for a card (or tower) level: +10% per level, compounding. */
export const levelMul = (level) => 1.1 ** (Math.max(1, Math.min(MAX_LEVEL, level | 0 || 1)) - 1);

/** The card with this id, or null (own keys only: a saved deck with 'toString' in it is not a card). */
export const cardById = (id) => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(CARDS, id) ? CARDS[id] : null);
