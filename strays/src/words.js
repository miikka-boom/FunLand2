// Strays: everything the little screen says, in one place. No DOM in here.
// The screen is 152 pixels wide and the lettering has capitals only, so every
// line is short and plain. The tests write each of these with the longest
// name and kind and check that it fits (or is one of the few allowed to slide).

/** "45 SEC", "12 MIN", "2H 05M". */
export function span(ms) {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 60) return `${s} SEC`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} MIN`;
  return `${Math.floor(m / 60)}H ${String(m % 60).padStart(2, '0')}M`;
}

export const SAY = {
  // The first moments.
  start: () => 'SOMEBODY IS ASLEEP IN YOUR BLOCK',
  back: (n) => `WELCOME BACK. ${n === 1 ? 'SOMEBODY WANTS' : `${n} WANT`} YOU`,
  backZombies: () => 'WELCOME BACK. ZOMBIES!',
  backCosy: () => 'WELCOME BACK. ALL COSY',
  later: (label) => `${label} LATER...`,

  // The hint line: the one next thing worth doing.
  hintWake: () => 'SOMEBODY IS IN THE BAG. TAP IT',
  hintPatch: (name) => `${name} IS HURT. TAP TO PATCH UP`,
  hintShow: (name) => `${name} FEELS SAFE NOW. TAP!`,
  hintGrow: (name) => `${name} IS READY TO GROW. TAP!`,
  hintFeed: (name) => `${name} IS HUNGRY. TAP TO FEED`,
  hintHug: (name) => `${name} WANTS A HUG. TAP`,
  hintOpen: () => 'A STRAY AT THE DOOR. OPEN A ROOM',
  hintGo: () => 'PRESS GO OUT TO FIND CANS',
  hintBonk: () => 'ZOMBIES AT THE FENCE. BONK!',
  hintSave: (price) => `A STRAY WAITS. ROOMS COST ${price}¢`,
  hintDone: () => 'TWELVE HEROES. THE BLOCK IS SAFE',
  hintCosy: () => 'ALL COSY',
  hintWait: (ms) => `ALL COSY. BACK IN ${span(ms)}`,
  hintPick: () => 'WHO GOES OUT? TAP SOMEBODY',

  // Rooms.
  openAsk: (price) => `OPEN IT FOR ${price}¢? TAP AGAIN`,
  openPoor: (price, cans) => `THAT ROOM COSTS ${price}¢. YOU HAVE ${cans}¢`,
  openFar: () => 'OPEN A ROOM NEXT TO YOURS FIRST',
  openedFor: () => 'THE STRAY HAS A ROOM NOW. SHH',
  openedEmpty: () => 'A ROOM IS READY FOR A STRAY',
  emptyRoom: () => 'EMPTY. WAITING FOR A STRAY',
  doorTap: () => 'TAP A BOARDED ROOM TO OPEN IT',

  // Care.
  asleep: (ms) => `FAST ASLEEP. ${span(ms)} MORE`,
  resting: (name, ms) => `${name} IS RESTING. ${span(ms)} MORE`,
  noCans: (name) => `NO CANS FOR ${name}. PRESS GO OUT`,
  woke: (name) => `${name} CLIMBS OUT. A STRAY!`,
  fed: (name, n) => `YUM! ${name} +${n}♥`,
  hugged: (name, n) => `A HUG FOR ${name}. +${n}♥`,
  patched: (name, n) => `${name} IS PATCHED UP. +${n}♥`,
  aboutStray: (name, have, need) => `${name} THE STRAY ♥${have}/${need}`,
  aboutSomebody: (name, kind, have, need) => `${name} THE ${kind} ♥${have}/${need}`,
  aboutHero: (name, kind) => `${name} THE ${kind}. A HERO!`,

  // Growing.
  hoodDown: (name) => `${name} LETS THE HOOD DOWN...`,
  standsTall: (name) => `${name} STANDS TALL...`,
  firstFace: (name, kind) => `${name} THE ${kind} CAN GO OUT NOW`,
  newFace: (name, kind) => `${name} THE ${kind} IS HOME`,
  newHero: (name) => `${name} IS THE BLOCK'S HERO`,

  // Trips.
  goes: (name) => `${name} GOES OUT`,
  out: (name) => `${name} IS OUT`,
  skip: () => 'TAP: SKIP',
  nobodyGoes: () => 'NOBODY GOES OUT',
  tooScared: () => 'STRAYS ARE TOO SCARED TO GO OUT',
  patchFirst: () => 'PATCH SOMEBODY UP FIRST',
  allResting: (ms) => `ALL ARE RESTING. ${span(ms)} MORE`,
  cameBack: (name, cans) => `${name} IS BACK. +${cans}¢`,
  cameBackHurt: (name, cans) => `${name} CAME BACK HURT. +${cans}¢`,
  followedIn: (name) => `A STRAY FOLLOWED ${name} HOME!`,
  followedDoor: (name) => `A STRAY FOLLOWED ${name}. OPEN A ROOM!`,
  tripTitle: (outcome) => ({ great: 'GREAT TRIP!', good: 'GOOD TRIP', rough: 'ROUGH TRIP' })[outcome],
  tripHaul: (cans, hearts) => `+${cans}¢   +${hearts}♥`,
  tripHurt: (name) => `${name} NEEDS PATCHING UP`,
  tripBonus: (bonus, rarity) => `+${bonus}¢ FOR BEING ${rarity}`,
  tripRest: (name) => `${name} WILL NEED A REST`,
  tripFollow: () => 'SOMEBODY FOLLOWS!',

  // The fence.
  zombieFirst: () => 'A ZOMBIE AT THE FENCE! BONK IT',
  bonk: () => 'BONK!',
  bonkCan: () => 'BONK! IT DROPPED A CAN',
  fenceQuiet: () => 'THE FENCE IS QUIET',
  fenceNew: () => 'A FENCE. NOTHING BEHIND IT YET',

  // The cards.
  cardFirst: () => 'SO THAT IS WHO IT WAS!',
  cardNew: () => 'A NEW FACE IN THE BLOCK',
  cardHero: () => 'THE BLOCK HAS A HERO',
  cardIsA: (name) => `${name} IS A`,
  cardNowA: (name) => `${name} IS NOW A`,
  cardBonus: (bonus) => `FINDS +${bonus}¢ EVERY TRIP`,
  cardCommon: () => 'CAN GO OUT FOR CANS',
  cardHero1: () => 'FINDS MORE CANS',
  cardHero2: () => 'RARELY GETS HURT',
  cardHero3: () => 'NEEDS NO MORE CARE',
  tap: () => 'TAP',

  // The Book.
  book: (met, kinds) => `THE BOOK ${met}/${kinds}`,
  bookHeroes: (n) => `HEROES ${n}`,
  bookMet: (name, kind, stars, hero) => `${name ? `${name} THE ` : ''}${kind} ${'★'.repeat(stars)}${hero ? ' HERO' : ''}`,
  bookUnmet: (rarity, stars) => `NOT MET YET. ${rarity} ${'★'.repeat(stars)}`,

  // The title and the endings.
  title: () => 'STRAYS',
  motto: () => 'EVERY STRAY IS SOMEBODY',
  pressAny: () => 'PRESS ANY BUTTON',
  fullTitle: () => 'FULL HOUSE!',
  full1: () => 'TWELVE STRAYS, TWELVE SOMEBODIES',
  full2: () => 'NOW RAISE THEM INTO HEROES',
  heroesTitle: () => 'TWELVE HEROES!',
  heroes1: () => 'THE BLOCK IS SAFE. THAT IS THE TOY',
  heroes2: () => 'IT RUNS ON AS LONG AS YOU LIKE',
};

/**
 * Lines that are allowed to be wider than the status line: they slide.
 * (A long name with a long kind; nothing a player has to read in a hurry.)
 */
export const MAY_SLIDE = new Set(['aboutSomebody', 'firstFace', 'followedDoor', 'openPoor', 'bookMet']);
