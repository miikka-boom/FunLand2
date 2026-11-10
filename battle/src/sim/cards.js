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
  legendary: { id: 'legendary', name: 'Legendary', color: '#2fd3c4', dark: '#147a72', glow: '#c8fff8' },
};

// kind 'unit': `unit` is a UNIT_TYPES id, `count` beans drop in a little
//   formation around the spot you picked (offsets in world px along x).
//   `flying`: the beans fly (the air layer); `anywhere`: they can be played
//   anywhere on the field and float down (Brolly Brigade).
// kind 'spell': `spell` names an effect in sim/spells.js, `radius` is its reach
//   (also drawn as the aiming circle).
// kind 'building': `building` is a BUILDINGS id (sim/buildings.js), placed in
//   your own deploy zone.
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

  // --- Pointy Pass (arena 1) -----------------------------------------------------
  brick: {
    id: 'brick',
    name: 'Brick',
    kind: 'unit',
    unit: 'brick',
    count: 1,
    mana: 5,
    rarity: 'epic',
    arena: 1,
    desc: 'A giant block with a hammer. Ignores beans, marches on towers and buildings.',
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

  // --- Boom Ridge (arena 2) ------------------------------------------------------
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

  // --- The 18 newer cards (docs/WOBBLE-WAR-CARDS.md), by arena -------------------

  // Green Hills (arena 0)
  sprouts: {
    id: 'sprouts',
    name: 'Sprouts',
    kind: 'unit',
    unit: 'sprout',
    count: 2,
    spread: [-10, 10],
    mana: 1,
    rarity: 'common',
    arena: 0,
    desc: 'Two tiny sprouts with toothpicks. One bonk sends them to the moon.',
  },
  bananaPeels: {
    id: 'bananaPeels',
    name: 'Banana Peels',
    kind: 'spell',
    spell: 'bananaPeels',
    radius: 90,
    mana: 2,
    rarity: 'common',
    arena: 0,
    desc: 'Five banana peels. Whoever steps on one goes feet-up. A classic.',
  },

  // Pointy Pass (arena 1)
  propellerPals: {
    id: 'propellerPals',
    name: 'Propeller Pals',
    kind: 'unit',
    unit: 'copter',
    count: 3,
    spread: [-24, 0, 24],
    flying: true,
    mana: 3,
    rarity: 'common',
    arena: 1,
    desc: 'Three beans in propeller caps. Turns out they DO fly. Heads first!',
  },
  pogoBean: {
    id: 'pogoBean',
    name: 'Pogo Bean',
    kind: 'unit',
    unit: 'pogo',
    count: 1,
    mana: 4,
    rarity: 'rare',
    arena: 1,
    desc: "Boings over beans, bonks towers and buildings. Can't stop, won't stop.",
  },
  netter: {
    id: 'netter',
    name: 'Butterfly Netter',
    kind: 'unit',
    unit: 'netter',
    count: 1,
    mana: 3,
    rarity: 'rare',
    arena: 1,
    desc: 'Catches flying beans like butterflies, then plants them in the dirt.',
  },

  // Boom Ridge (arena 2)
  bigSneeze: {
    id: 'bigSneeze',
    name: 'Big Sneeze',
    kind: 'spell',
    spell: 'bigSneeze',
    radius: 140,
    mana: 2,
    rarity: 'common',
    arena: 2,
    desc: 'Ah... ah... ACHOO! Blows enemies back, fliers too, and pops their hats.',
  },
  shakenSoda: {
    id: 'shakenSoda',
    name: 'Shaken Soda',
    kind: 'spell',
    spell: 'shakenSoda',
    radius: 75,
    mana: 3,
    rarity: 'epic',
    arena: 2,
    desc: 'Shake, shake, shake... POP! Everything on top goes straight up.',
  },
  bombJuggler: {
    id: 'bombJuggler',
    name: 'Bomb Juggler',
    kind: 'unit',
    unit: 'juggler',
    count: 1,
    mana: 5,
    rarity: 'legendary',
    arena: 2,
    desc: 'Juggles three lit bombs and lobs them at crowds. Do NOT knock it over.',
  },

  // Brick Fortress (arena 3)
  boingBox: {
    id: 'boingBox',
    name: 'Boing Box',
    kind: 'building',
    building: 'boingBox',
    mana: 3,
    rarity: 'common',
    arena: 3,
    desc: "A lovely present! Walk up and open it. (It's a boxing glove. On a spring.)",
  },
  beanPatch: {
    id: 'beanPatch',
    name: 'Bean Patch',
    kind: 'building',
    building: 'beanPatch',
    mana: 4,
    rarity: 'rare',
    arena: 3,
    desc: 'Plant it and Sprouts pop out of the dirt, shake it off and charge.',
  },
  anvil: {
    id: 'anvil',
    name: 'Anvil',
    kind: 'spell',
    spell: 'anvil',
    radius: 34,
    mana: 4,
    rarity: 'rare',
    arena: 3,
    desc: 'Look up. No, further up. CLANG! Squashes one big bean flat.',
  },
  nutcracker: {
    id: 'nutcracker',
    name: 'Nutcracker',
    kind: 'unit',
    unit: 'nutcracker',
    count: 1,
    mana: 4,
    rarity: 'epic',
    arena: 3,
    desc: 'One big CRUNCH at a time. Cracks shields, bricks and big beans.',
  },
  wreckingCrane: {
    id: 'wreckingCrane',
    name: 'Wrecking Crane',
    kind: 'building',
    building: 'wreckingCrane',
    mana: 6,
    rarity: 'legendary',
    arena: 3,
    desc: 'A crane with a swinging wrecking ball. Beans that wander close go FAR.',
  },

  // Wobble Summit (arena 4)
  brollyBrigade: {
    id: 'brollyBrigade',
    name: 'Brolly Brigade',
    kind: 'unit',
    unit: 'brolly',
    count: 3,
    spread: [-30, 0, 30],
    anywhere: true,
    mana: 4,
    rarity: 'rare',
    arena: 4,
    desc: 'Three beans, three umbrellas. They drop in anywhere... eventually.',
  },
  bubbleWrap: {
    id: 'bubbleWrap',
    name: 'Bubble Wrap',
    kind: 'spell',
    spell: 'bubbleWrap',
    radius: 120,
    mana: 3,
    rarity: 'epic',
    arena: 4,
    desc: 'Wraps your beans in bubble wrap. Every hit just goes pop-pop-pop.',
  },
  tummyDrummer: {
    id: 'tummyDrummer',
    name: 'Tummy Drummer',
    kind: 'unit',
    unit: 'drummer',
    count: 1,
    mana: 3, // (4 was too much for a bean that only drums: it never hits anything itself)
    rarity: 'epic',
    arena: 4,
    desc: 'BOOM-BOOM! Friends nearby march and swing faster to the beat.',
  },
  pelican: {
    id: 'pelican',
    name: 'Pelican',
    kind: 'unit',
    unit: 'pelican',
    count: 1,
    flying: true,
    mana: 5,
    rarity: 'legendary',
    arena: 4,
    desc: 'Scoops up a bean, flies it home and drops it from way up high.',
  },
  bigJelly: {
    id: 'bigJelly',
    name: 'Big Jelly',
    kind: 'unit',
    unit: 'jelly',
    count: 1,
    mana: 7, // (at 6 it was a must-have: a tank that also eats the defenders)
    rarity: 'legendary',
    arena: 4,
    desc: 'A huge wobbly jelly that swallows small beans whole, then spits them out.',
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
  // The newer 18: by arena, then by rarity
  'sprouts',
  'bananaPeels',
  'propellerPals',
  'pogoBean',
  'netter',
  'bigSneeze',
  'shakenSoda',
  'bombJuggler',
  'boingBox',
  'beanPatch',
  'anvil',
  'nutcracker',
  'wreckingCrane',
  'brollyBrigade',
  'bubbleWrap',
  'tummyDrummer',
  'pelican',
  'bigJelly',
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
