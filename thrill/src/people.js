// Random survivors. Pure and seeded: generatePerson(rng, ...) always returns
// the same person for the same random stream. Class, rarity, perk and level
// come from the caller (chests, gates, the start); everything that makes them
// someone (name, age, old job, quirk, vibe, look) is rolled here.

import { CLASSES, LOOK, PERK_ORDER, VIBE_ORDER, RARITIES } from './config.js';

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const chance = (rng, p) => rng() < p;

function weighted(rng, list, weights) {
  let total = 0;
  for (let i = 0; i < list.length; i++) total += weights[i] ?? 1;
  let r = rng() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i] ?? 1;
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

// --- Names ------------------------------------------------------------------------------------

export const FIRST = {
  f: ['Aino', 'Dot', 'Rosa', 'Ana', 'Mia', 'Sanna', 'Kaisa', 'Maya', 'Priya', 'Fatima', 'Lucia', 'Zoe', 'Hana', 'Amara', 'Ingrid', 'Nadia', 'Leila', 'Mei', 'Tove', 'Elsa', 'Noor', 'Ayla', 'Iris', 'Marta', 'Yuki', 'Freya', 'Lotta', 'Bea', 'Pia', 'Vera', 'Gigi', 'Ola'],
  m: ['Pete', 'Kai', 'Ville', 'Eero', 'Juha', 'Mikko', 'Tomasz', 'Diego', 'Kenji', 'Omar', 'Theo', 'Arjun', 'Kwame', 'Lars', 'Mateo', 'Felix', 'Hugo', 'Sami', 'Jonah', 'Tariq', 'Bruno', 'Emil', 'Kofi', 'Luca', 'Hiro', 'Anton', 'Pekka', 'Malik', 'Otto', 'Raul', 'Ezra', 'Gus'],
  n: ['Sal', 'Alex', 'Sam', 'Robin', 'Jordan', 'Noa', 'Rene', 'Charlie', 'Sasha', 'Riley', 'Quinn', 'Eli', 'Toni', 'Ari', 'Jules', 'Max'],
};
export const LAST = ['Virtanen', 'Laine', 'Korhonen', 'Nieminen', 'Salo', 'Heikkinen', 'Okafor', 'Nowak', 'Ramos', 'Shah', 'Mori', 'Haddad', 'Silva', 'Kim', 'Novak', 'Jensen', 'Rossi', 'Mensah', "O'Brien", 'Duarte', 'Lindqvist', 'Abebe', 'Tanaka', 'Costa', 'Moreau', 'Becker', 'Nguyen', 'Hughes', 'Santos', 'Wolfe', 'Byrne', 'Ahmed', 'Chen', 'Park', 'Moreno', 'Fischer', 'Adeyemi', 'Varga', 'Holm', 'Reyes', 'Kask', 'Bianchi'];

const NICKS = {
  brawler: ['Big', 'Bonk', 'Iron', 'Crusher', 'Mad', 'Knuckles'],
  shooter: ['Hotshot', 'Deadeye', 'Quickdraw', 'Sharp', 'Bullseye', 'Ace'],
  medic: ['Doc', 'Patch', 'Nurse', 'Stitches', 'Angel', 'Pulse'],
  tinker: ['Sparky', 'Gizmo', 'Boom-Boom', 'Turbo', 'Fuse', 'Rocket'],
};
const ELDER = { f: 'Gran', m: 'Grandpa', n: 'Grandie' };

// --- Backgrounds -------------------------------------------------------------------------------

export const JOBS = {
  brawler: ['Fry cook', 'Bouncer', 'Mascot (still in the suit)', 'Roller derby jammer', 'Pro wrestler', 'Bumper car champ', 'Furniture mover', 'Rodeo clown'],
  shooter: ['Carnival game host', 'Paintball ref', 'Archery coach', 'Skeet champion', 'Arcade high scorer', 'Darts pro', 'Park ranger', 'Water-gun fight legend'],
  medic: ['Lifeguard', 'Paramedic', 'School nurse', 'Vet', 'Dentist', 'First-aid volunteer', 'Pharmacist', 'Swim coach'],
  tinker: ['Ride mechanic', 'Stunt driver', 'Fireworks tech', 'Coaster engineer', 'Electrician', 'Go-kart builder', 'Toy inventor', 'Pinball repairer'],
};

export const QUIRKS = [
  'Afraid of clowns. Lives in a theme park.',
  'Has ridden the coaster 400 times. Still screams.',
  'Collects the tickets nobody needs anymore.',
  'Wins every staring contest. Even with zombies.',
  'Keeps a lucky rubber duck in a pocket.',
  'Hums the carousel song all day.',
  'Can fall asleep on a moving ride.',
  'Makes cotton candy out of almost nothing.',
  'Names every zombie at the fence.',
  'Still wears the old staff badge.',
  'Snores like a broken calliope.',
  'Tells the same three jokes. They work.',
  'Brought a goldfish. The goldfish stays.',
  'Thinks this is all a very long dream.',
  'Plays the kazoo, badly, bravely.',
  'Counts zombies out loud, in Finnish.',
  'Hoards ketchup packets.',
  'Writes postcards to nobody.',
  'Lost a bet. Kept the haircut.',
  'Refuses to say their middle name.',
  'Reads the same comic every night.',
  'Bakes waffles at midnight.',
  'Never sits with their back to the fence.',
  'Teaches anyone who asks to juggle.',
  'Talks to the Ferris wheel. It listens.',
  'Paints faces on the bumper cars.',
  'Grew up three streets down the hill.',
  'Has a lucky sock. One.',
  'Laughs at the worst moments.',
  'Sleeps in their sneakers.',
  'Fixes things nobody asked to fix.',
  'Names every bat they swing.',
  'Misses pizza most of all.',
  'Sings in the shower, loudly.',
  'Swears in six languages.',
  'Keeps score of absolutely everything.',
  'Won a giant teddy once. Brought it.',
  'Wants to ride the coaster one more time.',
  'Can whistle with two fingers. Very loud.',
  'Insists the haunted house is actually haunted.',
];

const PITCH = {
  brawler: ['Point me at the problem.', 'I bonk. That is the whole plan.', 'Fences are for climbing. Theirs, not ours.', 'You need muscle? You got it.'],
  shooter: ['I never miss. Ask the ducks.', 'Give me a roof and a view.', "I'll keep them off your back.", 'Three balls, three cans. Every time.'],
  medic: ['Anyone hurt? I can help.', 'Sit still. This will sting.', 'I have plasters and a strong stomach.', 'Nobody falls on my watch.'],
  tinker: ['Got a wrench? I can fix anything.', 'Your gate squeaks. I can fix that.', 'I can get the lights back on.', 'Give me junk and an hour.'],
};

// --- Looks -------------------------------------------------------------------------------------

const STYLE_W = {
  f: [6, 3, 7, 9, 8, 7, 4, 2, 1, 6],
  m: [10, 9, 6, 3, 2, 2, 4, 4, 6, 0],
  n: [8, 7, 7, 5, 4, 4, 4, 4, 3, 3],
};

function makeLook(rng, { p, age, cls, rarity, vibe }) {
  const body = weighted(rng, LOOK.bodies, cls === 'brawler' ? [1, 3, 4] : [3, 4, 2]);
  const styleW = STYLE_W[p].slice();
  if (age >= 55 && p === 'm') styleW[8] += 8; // bald
  if (age >= 40) styleW[9] = 0; // pigtails
  const hair = weighted(rng, LOOK.hairStyles, styleW);
  let hairColor;
  if (age >= 55 && chance(rng, 0.6)) hairColor = LOOK.grey;
  else if (RARITIES[rarity].perk >= 2 && chance(rng, 0.25)) hairColor = LOOK.hairNatural + Math.floor(rng() * LOOK.hairDyed);
  else hairColor = Math.floor(rng() * (LOOK.hairNatural - 1));
  let hat = 'none';
  let mascot = 0;
  if (chance(rng, LOOK.mascotChance)) {
    hat = 'mascot';
    mascot = Math.floor(rng() * LOOK.mascots);
  } else if (chance(rng, 0.42)) {
    const pool = { brawler: ['cap', 'bandana', 'headphones', 'bucket'], shooter: ['cap', 'bucket', 'headphones', 'bandana'], medic: ['flowers', 'cap', 'bucket', 'headphones'], tinker: ['hardhat', 'hardhat', 'cap', 'bandana'] }[cls];
    hat = pick(rng, pool);
  }
  const extrasPool = ['glasses', 'shades', 'freckles', 'bandaid', 'earring', 'eyepatch'];
  if (p !== 'f') extrasPool.push('mustache', 'beard', 'beard');
  let extra = 'none';
  if (chance(rng, age >= 45 ? 0.55 : 0.4)) extra = pick(rng, extrasPool);
  if (extra === 'eyepatch' && !chance(rng, 0.4)) extra = 'none'; // rarer
  let eyes = pick(rng, LOOK.eyes);
  if (vibe === 'sleepy' && chance(rng, 0.6)) eyes = 'sleepy';
  if (vibe === 'sunny' && chance(rng, 0.5)) eyes = 'happy';
  if (vibe === 'jumpy' && chance(rng, 0.5)) eyes = 'wide';
  let mouth = pick(rng, LOOK.mouths);
  if (vibe === 'showoff' && chance(rng, 0.5)) mouth = 'smirk';
  return {
    body,
    skin: Math.floor(rng() * LOOK.skins),
    face: pick(rng, LOOK.faces),
    hair,
    hairColor,
    hat,
    mascot,
    eyes,
    mouth,
    extra,
    outfit: rng() < 0.5 ? 0 : 1,
    prop: Math.floor(rng() * CLASSES[cls].props.length),
    old: age >= 55,
  };
}

// --- The person ---------------------------------------------------------------------------------

/**
 * A new survivor. cls and rarity are required. `sibling` (a resident) makes them
 * family: same surname, same hat and hair colour. `perk` undefined = roll one
 * for Veteran+ (null = none).
 */
export function generatePerson(rng, { id, cls, rarity, level = 1, perk, vibe, golden = false, sibling = null, origin = 'chest', at = 0 } = {}) {
  const p = weighted(rng, ['f', 'm', 'n'], [46, 46, 8]);
  const age = 16 + Math.floor(Math.pow(rng(), 1.35) * 60);
  const first = pick(rng, FIRST[p]);
  const last = sibling ? sibling.last : pick(rng, LAST);
  const job = pick(rng, JOBS[cls]);
  const quirk = pick(rng, QUIRKS);
  const quote = pick(rng, PITCH[cls]);
  if (!vibe) vibe = pick(rng, VIBE_ORDER);
  if (perk === undefined) perk = RARITIES[rarity].perk > 0 ? pick(rng, PERK_ORDER) : null;
  const look = makeLook(rng, { p, age, cls, rarity, vibe });
  if (sibling) {
    look.hat = sibling.look.hat;
    look.mascot = sibling.look.mascot;
    look.hairColor = sibling.look.hairColor;
    look.skin = sibling.look.skin;
  }
  let nick = null;
  if (rarity === 'legend' || (rarity === 'hero' && chance(rng, 0.5))) nick = pick(rng, NICKS[cls]);
  const elder = !!nick && age >= 62 && chance(rng, 0.5);
  return {
    id,
    first,
    last,
    nick,
    elder: elder ? ELDER[p] : null,
    pronoun: p,
    age,
    job,
    quirk,
    quote,
    vibe,
    cls,
    rarity,
    perk,
    level,
    badges: 0,
    golden: !!golden,
    siblingOf: sibling ? sibling.id : null,
    // Family id shared by siblings (the caller marks the sibling with it too).
    family: sibling ? (sibling.family ?? sibling.id) : null,
    look,
    origin,
    joined: at,
    raids: 0,
    wins: 0,
  };
}

/** "Hotshot Sal", "Turbo Gran", or just "Dot". */
export function displayName(p) {
  if (p.nick && p.elder) return `${p.nick} ${p.elder}`;
  if (p.nick) return `${p.nick} ${p.first}`;
  return p.first;
}

export const fullName = (p) => `${p.first} ${p.last}`;

/** "Dot's little brother!" style line for a sibling reveal. */
export function siblingLine(p, sib, rng = Math.random) {
  const older = p.age > sib.age;
  const word = { f: 'sister', m: 'brother', n: 'sibling' }[p.pronoun];
  const adj = Math.abs(p.age - sib.age) <= 1 ? 'twin' : older ? 'big' : 'little';
  void rng;
  return `${sib.first}'s ${adj} ${word}!`;
}
