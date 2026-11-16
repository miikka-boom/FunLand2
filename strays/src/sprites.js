// Strays: every pixel, as text. No DOM in here: sprites are rows of letters,
// one letter per pixel, and paint() turns them into colours. The page draws
// them on the little LCD (lcd.js); the tests check every row and letter.
//
// Letters: '.' is see-through. Lower/upper pairs are a colour and its shade.
// A few letters are roles that change per person (s skin, h hair, a outfit,
// p trousers, f shoes, x blanket); the rest are fixed inks.

/** The fixed inks. */
export const INK = {
  k: '#1b1a2b', // outline
  i: '#34314f', // soft black (hats, speakers)
  w: '#f7f3e8', // white
  W: '#cdc6bd',
  g: '#aab0c2', // steel
  G: '#737a92',
  r: '#dc4a3c', // red
  R: '#a23330',
  o: '#f08a3c', // orange
  y: '#f8d04c', // yellow
  Y: '#c9973a',
  l: '#a9dc5c', // lime
  n: '#52a65c', // green
  N: '#2f6b55',
  t: '#40b5a6', // teal
  d: '#86d4f0', // light blue
  b: '#4380d3', // blue
  B: '#2d4c90',
  v: '#9166c9', // violet
  V: '#5e4091',
  q: '#f4a0c4', // pink
  Q: '#da6890',
  u: '#a8744d', // brown
  U: '#6c4731',
  m: '#7c2f3b', // mouth
  e: '#1b1a2b', // eyes
  z: '#a3cc7a', // zombie green
  Z: '#739f5a',
};

/** Colours the scene uses by name. */
export const COL = {
  ink: INK.k,
  night: '#262540',
  dusk: '#3d3b62',
  slate: '#5a5a84',
  fog: '#9090b4',
  mist: '#c6c6dc',
  white: INK.w,
  cream: '#f7e6b8',
  red: INK.r,
  rose: '#f0688c',
  pink: INK.q,
  orange: INK.o,
  yellow: INK.y,
  gold: '#ffd94a',
  lime: INK.l,
  green: INK.n,
  teal: INK.t,
  sky: INK.d,
  blue: INK.b,
  violet: INK.v,
  wood: '#b78a5c',
  bark: '#7a5238',
  soil: '#3b2a33',
  common: '#c6c6dc',
  rare: '#5fb0ff',
  epic: '#c88cff',
  secret: '#8fe36a',
};

/** Rarity colours, for patches, frames and stars. */
export const RARITY_COL = { common: COL.common, rare: COL.rare, epic: COL.epic, secret: COL.secret };

/** Skin tones: s, its shade S, and the cheek c. */
export const SKIN = [
  { s: '#f8d8b6', S: '#e4b08a', c: '#f4a79c' },
  { s: '#ecbe93', S: '#cf9870', c: '#e88f80' },
  { s: '#cd9466', S: '#ac734c', c: '#c9735c' },
  { s: '#a06c48', S: '#7f5135', c: '#a85845' },
  { s: '#70492f', S: '#573624', c: '#8a4638' },
];
export const ZED_SKIN = { s: '#a8d07e', S: '#7fa860', c: '#8fbf6c' };

/** Hair colours: h and its shade H. */
export const HAIR = [
  { h: '#2c2636', H: '#1b1a2b' }, // black
  { h: '#5e3c2f', H: '#3f2823' }, // dark brown
  { h: '#8f5330', H: '#6a3a24' }, // chestnut
  { h: '#eac45c', H: '#c79a3c' }, // blond
  { h: '#dd7630', H: '#b3541f' }, // ginger
  { h: '#b9bacb', H: '#8f90a8' }, // grey
  { h: '#4fb7b0', H: '#35857f' }, // dyed teal
];
const HAIR_WHITE = { h: '#f1eee4', H: '#c9c4bb' };
const HAIR_GREY = { h: '#c9cad8', H: '#9a9bb2' };
const HAIR_PINK = { h: '#f07ab0', H: '#c2528a' };

// -------------------------------------------------------------- the body

/** Somebody standing: a big head, a small body, two short legs. */
export const BODY = [
  '................',
  '....kkkkkkkk....',
  '...kssssssssk...',
  '..kssssssssssk..',
  '..kssssssssssk..',
  '..kssessssessk..',
  '..kssessssessk..',
  '..kscsssssscsk..',
  '..kssssmmssssk..',
  '...kSSSSSSSSk...',
  '....kaaaaaak....',
  '...ksaaaaaask...',
  '...ksaaaaaask...',
  '....kAAAAAAk....',
  '....kppkkppk....',
  '....kffkkffk....',
];

/** The two leg rows (14, 15) of each step. */
export const LEGS = {
  stand: ['....kppkkppk....', '....kffkkffk....'],
  stepA: ['....kffkkppk....', '....kkk.kffk....'],
  stepB: ['....kppkkffk....', '....kffk.kkk....'],
};

/** Faces: pixels [row, col, letter] painted over the body's face. */
export const FACES = {
  plain: [],
  blink: [[5, 5, 's'], [5, 10, 's']],
  happy: [
    [6, 5, 's'], [6, 4, 'e'], [6, 6, 'e'],
    [6, 10, 's'], [6, 9, 'e'], [6, 11, 'e'],
    [7, 6, 'm'], [7, 9, 'm'],
  ],
  sad: [[8, 7, 's'], [8, 8, 's'], [7, 7, 'm'], [7, 8, 'm'], [8, 6, 'm'], [8, 9, 'm']],
  chompA: [[7, 7, 'm'], [7, 8, 'm']],
  chompB: [[8, 6, 'm'], [8, 9, 'm']],
  sleep: [
    [5, 5, 's'], [5, 10, 's'],
    [6, 4, 'e'], [6, 6, 'e'], [6, 9, 'e'], [6, 11, 'e'],
  ],
  wow: [[5, 6, 'e'], [6, 6, 'e'], [5, 9, 'e'], [6, 9, 'e'], [7, 7, 'm'], [7, 8, 'm']],
  ouch: [
    [5, 5, 's'], [5, 10, 's'],
    [6, 4, 'e'], [6, 6, 'e'], [6, 9, 'e'], [6, 11, 'e'],
    [8, 7, 's'], [8, 8, 's'], [7, 7, 'm'], [7, 8, 'm'], [8, 6, 'm'], [8, 9, 'm'],
    [2, 9, 'w'], [2, 10, 'w'], [3, 8, 'w'], [3, 9, 'r'], [3, 10, 'r'], [3, 11, 'w'], [4, 9, 'w'], [4, 10, 'w'],
  ],
};

/** Hair styles (rows 0-9 of the sprite). */
export const STYLES = [
  // 0: short and neat
  [
    '................',
    '....kkkkkkkk....',
    '...khhhhhhhhk...',
    '..khhhhhhhhhhk..',
    '..khhh....hhhk..',
    '..kh........hk..',
  ],
  // 1: long, to the chin
  [
    '................',
    '....kkkkkkkk....',
    '...khhhhhhhhk...',
    '..khhhhhhhhhhk..',
    '..khhhhh...hhk..',
    '..khh.......hk..',
    '..kh........hk..',
    '..kh........hk..',
    '..kH........Hk..',
  ],
  // 2: spiky
  [
    '....kk.kk.kk....',
    '...khhkhhkhhk...',
    '...khhhhhhhhk...',
    '..khhhhhhhhhhk..',
    '..khh.h..h.hhk..',
    '..kh........hk..',
  ],
  // 3: big and curly
  [
    '....kkkkkkkk....',
    '..kkhhhhhhhhkk..',
    '.khhhhhhhhhhhhk.',
    '.khhhhhhhhhhhhk.',
    '.khhh......hhhk.',
    '.khh........hhk.',
    '..k..........k..',
  ],
  // 4: a bun on top
  [
    '......kkkk......',
    '....kkhhhhkk....',
    '...khhhhhhhhk...',
    '..khhhhhhhhhhk..',
    '..khh......hhk..',
    '..kh........hk..',
  ],
];

/** A hero's cape, drawn behind the body. */
export const CAPE = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '..kkk...........',
  '.kyyk...........',
  '.kyYk...........',
  'kyyYk...........',
  'kyYYk...........',
  'kkkkk...........',
];

// ------------------------------------------------------------- the kinds
//
// Each kind: `pal` (their outfit colours: a A p f, and anything else),
// `head` (hat or headgear, rows from the top), `torso` (rows 10-13),
// `prop` (what a hero carries: rows, and where its top-left goes),
// `item` (the thing in their room: rows; `wall: n` hangs it n pixels above
// the floor), `wall` (their wallpaper and its darker band).
// `hair`: a fixed style/colour, or false when the headgear hides it all.

const NO_HEAD = [];

export const KIND_ART = {
  cook: {
    pal: { a: '#f7f3e8', A: '#cdc6bd', p: '#4a4a66', f: '#2c2636' },
    head: [
      '...kkkkkkkkkk...',
      '..kwwwwwwwwwwk..',
      '..kwwwwwwwwwwk..',
      '...kWWWWWWWWk...',
    ],
    torso: ['......rrrr......', '......k..k......', '......k..k......', '................'],
    prop: { at: [11, 5], rows: ['.kkk.', 'kGGGk', 'kGGGk', '.kkk.', '..k..', '..k..', '..k..'] },
    item: [
      '..W..W...',
      '...W.....',
      '.kkkkkk..',
      '.kggggk..',
      'kkkkkkkkk',
      'kGGGGGGGk',
      'kGrGGrGGk',
      'kGGGGGGGk',
      'kkkkkkkkk',
    ],
    wall: ['#f6e2b3', '#ebcc8c'],
  },
  nurse: {
    pal: { a: '#9fe0d2', A: '#74bfb1', p: '#74bfb1', f: '#f7f3e8' },
    head: [
      '.....kkkkkk.....',
      '....kwwrrwwk....',
      '....kwrrrrwk....',
      '....kwwrrwwk....',
    ],
    torso: ['......wwww......', '.......ww.......', '.........r......', '................'],
    prop: { at: [11, 8], rows: ['.kkk.', 'kwwwk', 'kwrwk', 'kwwwk', 'kkkkk'] },
    item: [
      'kkkkkkkk',
      'kwwwwwwk',
      'kwwrrwwk',
      'kwrrrrwk',
      'kwwrrwwk',
      'kwwwwwwk',
      'kkkkkkkk',
      'kWWkkWWk',
      'kWWkkWWk',
      'kkkkkkkk',
    ],
    wall: ['#d2ece5', '#b4dcd1'],
  },
  mechanic: {
    pal: { a: '#d9d5cc', A: '#b9b4aa', p: '#3f6fb8', f: '#2c2636' },
    head: [
      '................',
      '....kkkkkkkk....',
      '...kbbbbbbbbk...',
      '..kbbbbbbbbbbk..',
      '..kbbBBBBBBBBBk.',
    ],
    torso: ['.....b....b.....', '.....bbbbbb.....', '.....bbybbb.....', '.....BBBBBB.....'],
    prop: { at: [11, 6], rows: ['k.k..', 'kgk..', '.g...', '.g...', '.g...', 'kgk..', 'k.k..'] },
    item: [
      '..kkkkk..',
      '.k.....k.',
      'kkkkkkkkk',
      'krrrrrrrk',
      'krrryrrrk',
      'kRRRRRRRk',
      'kkkkkkkkk',
    ],
    wall: ['#ccd6e8', '#b0bdd8'],
  },
  student: {
    pal: { a: '#b8473f', A: '#8f3431', p: '#4a5a8c', f: '#f7f3e8' },
    head: [
      '................',
      '................',
      '................',
      '................',
      '....kkk..kkk....',
      '....w.wkkw.w....',
      '....w.w..w.w....',
    ],
    torso: ['......w..w......', '......w..w......', '......AAAA......', '................'],
    prop: { at: [11, 8], rows: ['kkkk.', 'kbbk.', 'kbwk.', 'kbbk.', 'kkkk.'] },
    item: [
      'UUUUUUUU',
      'UrbyrnbU',
      'UrbyrnbU',
      'UUUUUUUU',
      'UnrbbyrU',
      'UnrbbyrU',
      'UUUUUUUU',
      'UyynrbbU',
      'UyynrbbU',
      'UUUUUUUU',
    ],
    wall: ['#eadbf1', '#d6c0e4'],
  },
  jogger: {
    pal: { a: '#a9dc5c', A: '#7fb443', p: '#34314f', f: '#f08a3c' },
    head: [
      '................',
      '................',
      '................',
      '..krrrrrrrrrrk..',
      '.r..............',
      '.r..............',
    ],
    torso: ['................', '.....w....w.....', '.....w....w.....', '................'],
    prop: { at: [12, 8], rows: ['.kk.', '.dd.', 'kddk', 'kddk', 'kkkk'] },
    item: [
      'y.yyy.y',
      'yyyyyyy',
      '.yyyyy.',
      '..yYy..',
      '...y...',
      '..yyy..',
      '.UUUUU.',
      '.UUUUU.',
    ],
    wall: ['#e0f1c2', '#c8e19e'],
  },
  farmer: {
    pal: { a: '#d9584a', A: '#a8403a', p: '#3f6fb8', f: '#6c4731' },
    head: [
      '.....kkkkkk.....',
      '....kyyyyyyk....',
      '....kuuuuuuk....',
      'kYyyyyyyyyyyyyYk',
      '.kkk........kkk.',
    ],
    torso: ['.....b....b.....', '......bbbb......', '.....bbbbbb.....', '.....BBBBBB.....'],
    prop: { at: [12, 3], rows: ['g.g.', 'g.g.', 'ggg.', '.u..', '.u..', '.u..', '.u..', '.u..', '.u..', '.u..'] },
    item: [
      '..n...n..',
      '.nrn.nnn.',
      '.nnn.nrn.',
      '..n...n..',
      '..n...n..',
      'uuuuuuuuu',
      'uUUUUUUUu',
      'uuuuuuuuu',
    ],
    wall: ['#f1e5c0', '#dfcb92'],
  },
  knitter: {
    pal: { a: '#9166c9', A: '#6f4aa3', p: '#6c5a7c', f: '#34314f' },
    hair: { style: 4, colour: HAIR_GREY },
    head: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '....w.wkkw.w....',
      '....w.w..w.w....',
    ],
    torso: ['.....wwwwww.....', '......q..q......', '......q..q......', '................'],
    prop: { at: [11, 8], rows: ['..g.g', '.kqqk', 'kqQqk', 'kqqQk', '.kkk.'] },
    item: [
      '.kkkkk...',
      'kvvvvvk..',
      'kvvvvvk..',
      'kvvvvvkkk',
      'kVVVVVVVk',
      'kvvvvvvvk',
      'kk.....kk',
    ],
    wall: ['#f4d2d9', '#e7b6c2'],
  },
  skater: {
    pal: { a: '#f08a3c', A: '#c4692a', p: '#4a4a66', f: '#f7f3e8' },
    head: [
      '......kkkk......',
      '....kkttttkk....',
      '...kttttttttk...',
      '..kttttttttttk..',
      '..kwwwwwwwwwwk..',
    ],
    torso: ['................', '......wwww......', '................', '................'],
    prop: { at: [12, 5], rows: ['.k..', 'kok.', 'kok.', 'kok.', 'kok.', 'kok.', 'kok.', 'gkg.'] },
    item: [
      '.k.',
      'kok',
      'kyk',
      'kok',
      'kok',
      'kyk',
      'kok',
      'kok',
      'gkg',
      '.k.',
    ],
    wall: ['#fcdcb4', '#f3c08a'],
  },
  firefighter: {
    pal: { a: '#3a3a58', A: '#2a2a44', p: '#3a3a58', f: '#1b1a2b' },
    head: [
      '.....kkkkkk.....',
      '...kkrrrrrrkk...',
      '..krrrryyrrrrk..',
      '..krrrryyrrrrk..',
      '.kRRRRRRRRRRRRk.',
    ],
    torso: ['.....y....y.....', '................', '.....yyyyyy.....', '................'],
    prop: { at: [11, 4], rows: ['kkkk.', 'kggrk', 'kggrk', '.krk.', '..r..', '..r..', '..r..', '..r..', '..r..'] },
    item: [
      '..kkk..',
      '.krrrk.',
      '.krrrk.',
      'kkrrrkk',
      'krrRrrk',
      'kkrrrkk',
      '.krrrk.',
      '.krrrk.',
      'kkkkkkk',
    ],
    wall: ['#f8cdbd', '#efae9b'],
  },
  dj: {
    pal: { a: '#5e4091', A: '#46306e', p: '#34314f', f: '#f8d04c' },
    hair: { colour: HAIR_PINK },
    head: [
      '....kkkkkkkk....',
      '...kggggggggk...',
      '................',
      '................',
      '.kkk........kkk.',
      'kddk........kddk',
      'kddk........kddk',
      'kddk........kddk',
      '.kkk........kkk.',
    ],
    torso: ['................', '.......yy.......', '......yy........', '.......y........'],
    prop: { at: [10, 8], rows: ['kkkkkk', 'kiiiik', 'kigigk', 'kiiiik', 'kkkkkk'] },
    item: [
      'kkkkkkk',
      'kiiiiik',
      'kiigiik',
      'kiiiiik',
      'kigggik',
      'kigkgik',
      'kigggik',
      'kiiiiik',
      'kkkkkkk',
    ],
    wall: ['#d2caf3', '#b6aae7'],
  },
  clown: {
    pal: { a: '#f8d04c', A: '#d0a836', p: '#4380d3', f: '#dc4a3c' },
    hair: false,
    head: [
      '....kkkkkkkk....',
      '..kkrryybbnnkk..',
      '.krrryyybbbnnnk.',
      '.kyyybbbnnnrrrk.',
      '.kbbb......yyyk.',
      '.knn........rrk.',
      '..k..........k..',
      '.......rr.......',
    ],
    torso: ['....wwwwwwww....', '......r..r......', '.......r........', '................'],
    prop: { at: [11, 1], rows: ['.rrr.', 'rrwrr', 'rrrrr', '.rrr.', '..k..', '..k..', '.k...', '.k...', '..k..', '..k..'] },
    item: [
      '.rrr..bbb.',
      'rrwrrbbwbb',
      'rrrrrbbbbb',
      '.rrr..bbb.',
      '..k....k..',
      '..k...k...',
      '...k..k...',
      '...k.k....',
      '....kk....',
      '....k.....',
    ],
    wall: ['#fcecaa', '#f4d774'],
  },
  wrestler: {
    pal: { a: null, A: null, p: '#dc4a3c', f: '#f7f3e8' }, // bare chest: a/A are filled from the skin
    hair: false,
    head: [
      '................',
      '....kkkkkkkk....',
      '...krrrrrrrrk...',
      '..krrrryyrrrrk..',
      '..kryyyrryyyrk..',
      '..kry.yrry.yrk..',
      '..kry.yrry.yrk..',
      '..kryyyrryyyrk..',
      '..krrry..yrrrk..',
      '...krrrrrrrrk...',
    ],
    torso: ['................', '................', '................', '.....yyryyy.....'],
    prop: { at: [11, 10], rows: ['kkkkk', 'kyryk', 'kkkkk'] },
    item: [
      'kk.......kk',
      'kkgggggggkk',
      'kk.......kk',
      '..k.....k..',
      '..k.....k..',
      '..k.....k..',
    ],
    wall: ['#f3c6c6', '#e6a6a6'],
  },
  scientist: {
    pal: { a: '#f7f3e8', A: '#cdc6bd', p: '#4a4a66', f: '#2c2636' },
    hair: false,
    head: [
      '..k.kkkkkkkk.k..',
      '.kwkwwwwwwwwkwk.',
      '.kwwwwwwwwwwwwk.',
      '.kwwkkkkkkkkwwk.',
      '.kwknnk..knnkwk.',
      '.kw..........wk.',
      '..k..........k..',
    ],
    torso: ['.......bb.......', '.......bb.....r.', '................', '................'],
    prop: { at: [11, 6], rows: ['.kk..', '.kk..', '.kk..', 'kddk.', 'knnnk', 'knnnk', 'kkkkk'] },
    item: [
      '..n......',
      '.n...q...',
      '..k..k...',
      '..k..k...',
      '.knk.kqk.',
      'knnnkqqqk',
      'kkkkkkkkk',
      'UUUUUUUUU',
      '.U.....U.',
      '.U.....U.',
    ],
    wall: ['#cbeff1', '#a8e0e4'],
  },
  magician: {
    pal: { a: '#34314f', A: '#262540', p: '#34314f', f: '#1b1a2b' },
    head: [
      '....kkkkkkkk....',
      '....kiiiiiik....',
      '....krrrrrrk....',
      '.kiiiiiiiiiiiik.',
      '..kk........kk..',
    ],
    torso: ['......wrrw......', '.......ww.......', '.......ww.......', '................'],
    prop: { at: [12, 4], rows: ['.w..', '.w..', '.k..', '.k..', '.k..', '.k..', '.k..', '.k..'] },
    item: [
      '..w.w....',
      '..w.w....',
      '..www....',
      '.kkkkkkk.',
      '..kiiik..',
      '..kiiik..',
      '..krrrk..',
      '..kkkkk..',
    ],
    wall: ['#dcc7ec', '#c5a7de'],
  },
  astronaut: {
    pal: { a: '#f7f3e8', A: '#cdc6bd', p: '#f7f3e8', f: '#aab0c2' },
    head: [
      '....kkkkkkkk....',
      '..kkwwwwwwwwkk..',
      '.kwwwwwwwwwwwwk.',
      '.kwwkkkkkkkkwwk.',
      '.kwk......ddkwk.',
      '.kwk.......dkwk.',
      '.kwk........kwk.',
      '.kwk........kwk.',
      '.kwk........kwk.',
      '.kwwkkkkkkkkwwk.',
      '..kkwwwwwwwwkk..',
    ],
    torso: ['................', '....w.bbrb.w....', '....w.bbbb.w....', '................'],
    prop: { at: [12, 3], rows: ['krrk', 'krrk', 'kk..', 'k...', 'k...', 'k...', 'k...', 'k...', 'k...', 'k...'] },
    item: [
      '..r..',
      '.rrr.',
      '.www.',
      '.wdw.',
      '.www.',
      '.www.',
      'rwwwr',
      'rwwwr',
      'r.o.r',
      '..y..',
    ],
    wall: ['#cad5f3', '#acbbe9'],
  },
  mascot: {
    pal: { a: '#f8d04c', A: '#d0a836', p: '#f08a3c', f: '#f08a3c' },
    hair: false,
    head: [
      '......kkkk......',
      '.....krrrrk.....',
      '...kkyyyyyykk...',
      '..kyyyyyyyyyyk..',
      '..kyywwyywwyyk..',
      '..kyywkyywkyyk..',
      '..kyyyyooyyyyk..',
      '..kyyyyooyyyyk..',
      '..kyyyyyyyyyyk..',
      '...kkyyyyyykk...',
    ],
    torso: ['................', '....y.wwww.y....', '....y.wwww.y....', '................'],
    prop: { at: [11, 2], rows: ['.kyk.', '.kyk.', '.kyk.', '.kyk.', 'kyyyk', 'kyyyk', 'kyyyk', '.kyk.', '.kyk.'] },
    item: [
      'kkkkkkkkk',
      'krrrrrrk.',
      'krwwrrk..',
      'krrrrk...',
      'krrrk....',
      'krrk.....',
      'krk......',
      'kk.......',
    ],
    itemWall: 6,
    wall: ['#fee6ac', '#f6cf78'],
  },
  knight: {
    pal: { a: '#aab0c2', A: '#737a92', p: '#737a92', f: '#4a4a66' },
    hair: false,
    head: [
      '......krrk......',
      '....kkkrrkkk....',
      '...kggggggggk...',
      '..kggggggggggk..',
      '..kgGGGGGGGGgk..',
      '..kgkwkkkkwkgk..',
      '..kgGGGGGGGGgk..',
      '..kggkgkgkgggk..',
      '..kggggggggggk..',
      '...kggggggggk...',
    ],
    torso: ['......rrrr......', '....g.rwwr.g....', '....g.rrrr.g....', '................'],
    prop: { at: [12, 2], rows: ['.g..', '.g..', '.g..', '.g..', '.g..', '.g..', 'kyk.', '.u..', '.u..'] },
    item: [
      'kkkkkkk',
      'krrwrrk',
      'krrwrrk',
      'kwwwwwk',
      'krrwrrk',
      '.krwrk.',
      '..kwk..',
      '...k...',
    ],
    itemWall: 5,
    wall: ['#dcdee6', '#c2c5d2'],
  },
  zed: {
    pal: { a: '#8a6a52', A: '#6c4f3e', p: '#4a4a66', f: '#34314f' },
    skin: ZED_SKIN,
    head: [
      '.........q......',
      '........qyq.....',
      '.........q......',
      '................',
      '................',
      '.........ww.....',
      '.........wk.....',
      '................',
      '.......mw.......',
    ],
    torso: ['......rkkr......', '................', '.....y..........', '................'],
    prop: { at: [12, 6], rows: ['.q..', 'qyq.', '.q..', '.n..', '.nn.', '.n..', '.n..'] },
    item: [
      '..q..',
      '.qyq.',
      '..q..',
      '..n..',
      '.nn..',
      '..n..',
      'uuuuu',
      '.uuu.',
    ],
    wall: ['#d5e9c1', '#bbda9e'],
  },
};
void NO_HEAD;
void HAIR_WHITE;

// ------------------------------------------------------------ everybody else

/** A stray: a blanket, a hood, two eyes. `P` is the patch (the rarity's colour). */
export const STRAY_BODY = [
  '................',
  '.....kkkkkk.....',
  '...kkxxxxxxkk...',
  '..kxxxxxxxxxxk..',
  '..kxxiiiiiixxk..',
  '..kxiiiiiiiixk..',
  '..kxiiwiiwiixk..',
  '..kxiiwiiwiixk..',
  '..kxxiiiiiixxk..',
  '..kxxxxxxxxxxk..',
  '.kxxxxxxxxxxxXk.',
  '.kxxxxxPPxxxxXk.',
  '.kxxxxxPPxxxXXk.',
  '.kxxxxxxxxxXXXk.',
  '.kXXXXXXXXXXXXk.',
  '..kkffkkkkffkk..',
];
export const STRAY_PAL = { x: '#9a8068', X: '#775f4e', f: '#34314f' };
/** Stray faces: only the eyes show. */
export const STRAY_FACES = {
  plain: [],
  blink: [[6, 6, 'i'], [6, 9, 'i']],
  happy: [[7, 6, 'i'], [7, 9, 'i'], [7, 5, 'w'], [7, 7, 'w'], [7, 8, 'w'], [7, 10, 'w']],
  chompA: [[8, 7, 'w'], [8, 8, 'w']],
  chompB: [],
  sad: [[6, 6, 'i'], [6, 9, 'i']],
};

/** A hood flying off (when a stray shows who they are). */
export const HOOD = ['.kkkkkk.', 'kxxxxxxk', 'kxxiixxk', 'kxxxxxxk', '.kkXXkk.'];

/** Asleep in a bag. Two frames: a slow breath. */
export const BAG_A = [
  '................',
  '....kkkkkkkkkk..',
  '..kkxxxxxxxxxxk.',
  '.kiikxxxxPPxxxk.',
  '.kiikxxxxPPxxXk.',
  '..kkxxxxxxxxXXk.',
  '....kkkkkkkkkk..',
];
export const BAG_B = [
  '....kkkkkkkkkk..',
  '..kkxxxxxxxxxxk.',
  '.kiikxxxxxxxxxk.',
  '.kiikxxxxPPxxxk.',
  '.kiikxxxxPPxxXk.',
  '..kkxxxxxxxxXXk.',
  '....kkkkkkkkkk..',
];

/** A zombie at the fence, facing right (the scene flips it). Two frames. */
export const ZOMBIE_A = [
  '................',
  '....kk.kkkkk....',
  '...kzzkzzzzzk...',
  '..kzzzzzzzzzzk..',
  '..kzwwzzzzwwzk..',
  '..kzwkzzzzwkzk..',
  '..kzzzzzzzzzzk..',
  '..kZzmwmwmmzZk..',
  '..kZzmmmmmwzZk..',
  '...kZZZZZZZZk...',
  '....kGGGGGGkkkk.',
  '....kGgGGGzzzzk.',
  '....kGGGGGGkkkk.',
  '....kgGGGgGk....',
  '....kUUkkUUk....',
  '....kkkkkkkk....',
];
export const ZOMBIE_B = [
  '................',
  '................',
  '....kk.kkkkk....',
  '...kzzkzzzzzk...',
  '..kzzzzzzzzzzk..',
  '..kzwwzzzzwwzk..',
  '..kzwkzzzzwkzk..',
  '..kzzzzzzzzzzk..',
  '..kZzmwmwmmzZk..',
  '..kZzmmmmmwzZk..',
  '...kZZZZZZZZkkk.',
  '....kGgGGGzzzzk.',
  '....kGGGGGGkkkk.',
  '....kgGGGgGk....',
  '....kUUkkUUk....',
  '....kkkkkkkk....',
];

// ----------------------------------------------------------- rooms and things

/** A made bed (pillow, flat quilt) for a room somebody lives in. */
export const BED = [
  '.www...............',
  'kwwwkkkkkkkkkkkkkk.',
  'kqqqqqqqqqqqqqqqqqk',
  'kqQqqqQqqqQqqqQqqQk',
  'kkkkkkkkkkkkkkkkkkk',
];
/** The quilt pulled up over somebody asleep. */
export const QUILT = [
  '..kkkkkkkkkkkkkkk..',
  '.kqqqqqqqqqqqqqqqk.',
  'kqqQqqqQqqqQqqqQqqk',
  'kqqqqqqqqqqqqqqqqqk',
  'kqQqqqQqqqQqqqQqqqk',
  'kqqqqqqqqqqqqqqqqqk',
  'kkkkkkkkkkkkkkkkkkk',
];
/** A bare mattress, for a room nobody has moved into. */
export const MATTRESS = ['kkkkkkkkkkkkkk', 'kWWWWWWWWWWWWk', 'kkkkkkkkkkkkkk'];
/** A hero's rug. */
export const RUG = ['.yyyyyyyyyyyyy.', 'yrryyrryyrryyry'];

/** The ceiling lamp (lit, and off). */
export const LAMP = ['.k.', 'kyk', 'yyy'];
export const LAMP_OFF = ['.k.', 'kGk', '.G.'];

/** Boards across a closed room. */
export const BOARDS = [
  '.kkkkkkkkkkkkkkkkkkkkkkkkk.',
  'kuuuuuuuuuuuuuuuuuuuuuuuuuk',
  'kuUuuuuuuuuuuuuuuuuuuuuuUuk',
  'kUUUUUUUUUUUUUUUUUUUUUUUUUk',
  '.kkkkkkkkkkkkkkkkkkkkkkkkk.',
];
/** A single plank, flying off. */
export const PLANK = ['kkkkkkkkkkkk', 'kuUuuuuuuUuk', 'kkkkkkkkkkkk'];

/** Wish bubbles: the bubble itself, then what goes inside (7x7 at most). */
export const BUBBLE = [
  '.kkkkkkkkk.',
  'kwwwwwwwwwk',
  'kwwwwwwwwwk',
  'kwwwwwwwwwk',
  'kwwwwwwwwwk',
  'kwwwwwwwwwk',
  'kwwwwwwwwwk',
  'kwwwwwwwwwk',
  'kwwwwwwwwwk',
  '.kkkkwwkkk.',
  '....kwk....',
  '.....k.....',
];
export const ICONS = {
  can: ['.GGGGG.', 'GwwwwwG', 'rrrrrrr', 'rrwwrrr', 'rrwwrrr', 'rrrrrrr', '.GGGGG.'],
  heart: ['.rr.rr.', 'rqrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
  patch: ['..rrr..', '..rrr..', 'rrrrrrr', 'rrrrrrr', 'rrrrrrr', '..rrr..', '..rrr..'],
  grow: ['...o...', '...o...', '.o.y.o.', '..yyy..', 'ooywyoo', '..yyy..', '.o.y.o.'],
  wake: ['..rr...', '..rr...', '..rr...', '..rr...', '.......', '..rr...', '..rr...'],
  nocan: ['.GGGGG.', 'GWWWWWG', 'GGGGGGG', 'GGWWGGG', 'GGWWGGG', 'GGGGGGG', '.GGGGG.'],
  door: ['.uuuuu.', '.uUUUu.', '.uUUUu.', '.uUUyu.', '.uUUUu.', '.uUUUu.', '.uuuuu.'],
};

/** Small things that fly about. */
export const BITS = {
  heart: ['r.r', 'rrr', '.r.'],
  heartBig: ['.rr.rr.', 'rqrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
  can: ['GGG', 'rwr', 'rrr', 'GGG'],
  canTop: ['.GGGGG.', 'GwwwwwG', 'rrrrrrr', 'rwwrrrr', 'rrrrrrr', '.GGGGG.'],
  star: ['..y..', '.yyy.', 'yyyyy', '.yyy.', '.y.y.'],
  starDim: ['..G..', '.GGG.', 'GGGGG', '.GGG.', '.G.G.'],
  spark: ['.y.', 'ywy', '.y.'],
  dust: ['.W.', 'WWW', '.W.'],
  crumb: ['u'],
  zed: ['GG.', '.G.', 'GGG'],
  note: ['.kk', '.k.', 'kk.', 'kk.'],
  arrow: ['yyyyy', 'kyyyk', '.kyk.', '..k..'],
  plus: ['.w.', 'www', '.w.'],
  bonk: ['y...y', '.y.y.', '..w..', '.y.y.', 'y...y'],
  moon: ['.www.', 'wwwWw', 'wwwww', 'wWwww', '.www.'],
  sun: ['..y..', '.yyy.', 'yyyyy', '.yyy.', '..y..'],
  cloud: ['..www....', '.wwwwwww.', 'wwwwwwwww'],
};

/** The front door, the street lamp and the back fence. */
export const DOOR = ['kkkk', 'kuuk', 'kuuk', 'kuuk', 'kuyk', 'kuuk', 'kuuk', 'kuuk', 'kuuk', 'kuuk', 'kuuk', 'kuuk'];
export const STREET_LAMP = ['.kkk.', 'kyyyk', 'kyyyk', '.kkk.', '..k..', '..k..', '..k..', '..k..', '..k..', '..k..', '..k..', '..k..', '..k..', '..k..', '.kkk.'];
export const FENCE = [
  '.k...k...k...k...k...k',
  'kuk.kuk.kuk.kuk.kuk.ku',
  'kukkkukkkukkkukkkukkku',
  'kuuuuuuuuuuuuuuuuuuuuu',
  'kukkkukkkukkkukkkukkku',
  'kuk.kuk.kuk.kuk.kuk.ku',
  'kuk.kuk.kuk.kuk.kuk.ku',
];

// ------------------------------------------------------------------ painting

/**
 * Rows of letters into a sprite: { w, h, px } where px[y * w + x] is a
 * '#rrggbb' colour or null. Unknown letters throw: a typo should not ship.
 */
export function paint(rows, pal = INK) {
  const h = rows.length;
  const w = h ? rows[0].length : 0;
  const px = new Array(w * h).fill(null);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    if (row.length !== w) throw new Error(`sprite row ${y} is ${row.length} wide, not ${w}: "${row}"`);
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const col = pal[ch] ?? INK[ch];
      if (!col) throw new Error(`no colour for "${ch}" in "${row}"`);
      px[y * w + x] = col;
    }
  }
  return { w, h, px };
}

/** Paint rows over a sprite, with the top-left at (ox, oy). */
export function stamp(sprite, rows, pal, ox = 0, oy = 0) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const tx = ox + x;
      const ty = oy + y;
      if (tx < 0 || ty < 0 || tx >= sprite.w || ty >= sprite.h) continue;
      const col = pal[ch] ?? INK[ch];
      if (!col) throw new Error(`no colour for "${ch}" in "${row}"`);
      sprite.px[ty * sprite.w + tx] = col;
    }
  }
  return sprite;
}

function dots(sprite, list, pal) {
  for (const [y, x, ch] of list) {
    const col = pal[ch] ?? INK[ch];
    if (col && sprite.px[y * sprite.w + x] != null) sprite.px[y * sprite.w + x] = col;
  }
}

/** The colours of one person: skin, hair, and their kind's outfit. */
export function palOf(p) {
  const art = KIND_ART[p.kind];
  const skin = art.skin || SKIN[p.skin % SKIN.length];
  const hair = (art.hair && art.hair.colour) || HAIR[p.hair % HAIR.length];
  const pal = { ...skin, ...hair, ...art.pal };
  if (pal.a == null) pal.a = skin.s;
  if (pal.A == null) pal.A = skin.S;
  return pal;
}

/**
 * Somebody whose hood is off, as a 16x16 sprite.
 *   opts.face  'plain' | 'blink' | 'happy' | 'sad' | 'chompA' | 'chompB' | 'sleep' | 'wow' | 'ouch'
 *   opts.legs  'stand' | 'stepA' | 'stepB'
 *   opts.hero  cape and prop
 *   opts.down  squashed one pixel (a breath, a landing)
 */
export function personSprite(p, opts = {}) {
  const art = KIND_ART[p.kind];
  const pal = palOf(p);
  const face = FACES[opts.face] ? opts.face : 'plain';
  const out = paint(new Array(16).fill('................'), pal);
  if (opts.hero) stamp(out, CAPE, pal);
  stamp(out, BODY.slice(0, 14), pal);
  stamp(out, LEGS[opts.legs] || LEGS.stand, pal, 0, 14);
  dots(out, FACES[face], pal);
  stamp(out, art.torso, pal, 0, 10);
  if (art.hair !== false) {
    const style = art.hair && art.hair.style != null ? art.hair.style : p.style % STYLES.length;
    stamp(out, STYLES[style], pal);
  }
  stamp(out, art.head, pal);
  // Faces that close the eyes must win over glasses and the like.
  if (face === 'sleep' || face === 'ouch') dots(out, FACES[face].filter(([, , ch]) => ch === 'w' || ch === 'r'), pal);
  if (opts.hero && art.prop) stamp(out, art.prop.rows, pal, art.prop.at[0], art.prop.at[1]);
  return opts.down ? squash(out) : out;
}

/** A hooded stray. `patch` is the colour of the patch on the blanket. */
export function straySprite(patch, opts = {}) {
  const pal = { ...STRAY_PAL, P: patch };
  const out = paint(STRAY_BODY, pal);
  dots(out, STRAY_FACES[opts.face] || [], pal);
  return opts.down ? squash(out) : out;
}

/** One pixel shorter: everything above the feet moves down a row (the knees fold away). */
export function squash(sprite) {
  const { w, h, px } = sprite;
  const out = { w, h, px: new Array(w * h).fill(null) };
  for (let y = 1; y < h - 1; y++) for (let x = 0; x < w; x++) out.px[y * w + x] = px[(y - 1) * w + x];
  for (let x = 0; x < w; x++) out.px[(h - 1) * w + x] = px[(h - 1) * w + x];
  return out;
}

/** Just the head (rows 0-9), for somebody tucked up in bed. */
export function headSprite(p, opts = {}) {
  const full = personSprite(p, { face: opts.face || 'sleep' });
  return { w: 16, h: 10, px: full.px.slice(0, 16 * 10) };
}

/** Every pixel one colour: for flashes and silhouettes. */
export function silhouette(sprite, colour) {
  return { w: sprite.w, h: sprite.h, px: sprite.px.map((c) => (c ? colour : null)) };
}

/** Mirror left-right. */
export function flip(sprite) {
  const { w, h, px } = sprite;
  const out = { w, h, px: new Array(w * h) };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.px[y * w + x] = px[y * w + (w - 1 - x)];
  return out;
}
