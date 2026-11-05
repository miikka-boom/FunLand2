// Random survivors (simplified from Hope Street: three roles, no traits). Pure and
// seeded: generatePerson(rng, ...) always returns the same person for the same random
// stream. Each person reads as someone: "Aino Laine, 34, former paramedic. Talks to plants."

import { ROLE_ORDER, STARS, MAX_LEVEL } from './config.js';

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const chance = (rng, p) => rng() < p;

// --- Names ------------------------------------------------------------------------------

export const FIRST = {
  f: ['Aino', 'Sanna', 'Kaisa', 'Maya', 'Priya', 'Fatima', 'Lucia', 'Emma', 'Zoe', 'Hana', 'Amara', 'Ingrid', 'Sofia', 'Nadia', 'Grace', 'Leila', 'Mei', 'Rosa', 'Tove', 'Wanjiru', 'Elsa', 'Noor', 'Ayla', 'Iris', 'Marta', 'Yuki', 'Chiara', 'Freya', 'Lotta', 'Beatriz'],
  m: ['Ville', 'Eero', 'Juha', 'Mikko', 'Tomasz', 'Diego', 'Kenji', 'Omar', 'Marcus', 'Theo', 'Arjun', 'Kwame', 'Lars', 'Mateo', 'Felix', 'Hugo', 'Rafael', 'Sami', 'Jonah', 'Oskari', 'Tariq', 'Bruno', 'Emil', 'Kofi', 'Luca', 'Hiro', 'Anton', 'Dario', 'Pekka', 'Malik'],
  n: ['Alex', 'Sam', 'Robin', 'Kai', 'Jordan', 'Noa', 'Rene', 'Charlie', 'Sasha', 'Riley', 'Quinn', 'Eli', 'Toni', 'Ari', 'Jules'],
};
export const LAST = ['Virtanen', 'Laine', 'Korhonen', 'Nieminen', 'Salo', 'Heikkinen', 'Laaksonen', 'Okafor', 'Nowak', 'Ramos', 'Shah', 'Mori', 'Haddad', 'Silva', 'Kim', 'Novak', 'Jensen', 'Rossi', 'Mensah', "O'Brien", 'Duarte', 'Lindqvist', 'Abebe', 'Tanaka', 'Costa', 'Moreau', 'Becker', 'Nguyen', 'Hughes', 'Santos', 'Wolfe', 'Kowal', 'Byrne', 'Ahmed', 'Chen', 'Park', 'Moreno', 'Fischer', 'Adeyemi', 'Varga', 'Holm', 'Reyes'];

const NICKS = {
  fighter: ['Brick', 'Tank', 'Crowbar', 'Hawkeye', 'Hammer', 'Deadeye'],
  scout: ['Ghost', 'Sprint', 'Shadow', 'Roadrunner', 'Fox', 'Whisper'],
  medic: ['Doc', 'Stitches', 'Patch', 'Band-Aid', 'Nurse', 'Pulse'],
};

// --- Backgrounds -----------------------------------------------------------------------

export const JOBS = {
  fighter: ['Bouncer', 'Firefighter', 'Rugby coach', 'Bartender', 'Police officer', 'Hunter', 'Army reservist', 'Butcher', 'Security guard', 'Hockey player', 'Pro wrestler', 'Welder'],
  scout: ['Bike courier', 'Mail carrier', 'Parkour coach', 'Taxi driver', 'Orienteer', 'Pizza delivery', 'Marathon runner', 'Urban explorer', 'Dog walker', 'Park ranger', 'Electrician', 'Roadie'],
  medic: ['Nurse', 'Paramedic', 'Vet', 'Pharmacist', 'Dentist', 'Lifeguard', 'Med student', 'Care-home worker', 'Midwife', 'Physio'],
};

export const QUIRKS = [
  'Talks to plants.',
  'Collects bottle caps.',
  'Never misses a sunrise.',
  'Hums when nervous.',
  'Owes everyone money.',
  'Keeps a diary nobody may read.',
  'Can fall asleep anywhere.',
  'Makes terrible coffee, proudly.',
  'Knows every bus route by heart.',
  'Still wears the old work badge.',
  'Snores like a chainsaw.',
  'Tells the same three jokes.',
  'Brought a cat. The cat stays.',
  'Swears it was all a dream.',
  'Plays harmonica badly.',
  'Counts zombies out loud.',
  'Hoards hot sauce.',
  'Writes letters to nobody.',
  'Lost a bet, kept the haircut.',
  'Refuses to say their middle name.',
  'Reads the same paperback over and over.',
  'Bakes bread from almost nothing.',
  'Never sits with their back to a door.',
  'Teaches anyone who asks to whistle.',
  'Keeps the radio on, always.',
  'Paints murals on the barricades.',
  'Grew up three streets over.',
  'Has a lucky sock. One.',
  'Laughs at the worst moments.',
  'Sleeps with boots on.',
  'Fixes things nobody asked to fix.',
  'Names every crowbar.',
  'Misses pizza most of all.',
  'Sings in the shower, loudly.',
  'Speaks four languages, swears in six.',
  'Keeps score of everything.',
];

const PITCH = {
  fighter: ['I can hold a door shut all night.', 'Point me at the problem.', 'I hit what I aim at.', "I'll keep them off your back."],
  scout: ['I know a dozen ways in and out of here.', "I'm fast. Faster than them, anyway.", 'I can find food where there is none.', 'Nobody hears me coming.'],
  medic: ['I can patch up your people.', 'Anyone hurt in there? I can help.', 'I have a med kit and a strong stomach.', 'I kept a whole ward alive. Let me in.'],
};

// --- Looks -------------------------------------------------------------------------------

export const SKIN = ['#f6d7c3', '#efc3a4', '#e0a882', '#c98e64', '#a86f48', '#8a5636', '#6b3f26', '#4e2c1b'];
export const HAIR_COLORS = ['#1c1714', '#3b2619', '#5a3820', '#8a5a2e', '#b0773a', '#d9a65a', '#e8cf8a', '#a2401f', '#8e8e8e', '#d8d8d8', '#d0508a', '#4c7fd6', '#4fae7a'];
const HAIR_NATURAL = [0, 1, 2, 3, 4, 5, 6, 7];
const HAIR_DYED = [10, 11, 12];
export const EYES = ['#3b2a1e', '#5a3f2a', '#2f5a7a', '#3f6a3f', '#6a6a3a'];
export const SHIRTS = ['#3a5a8c', '#8c3a3a', '#3a7a5a', '#7a5a2e', '#5a3a7a', '#2e6a7a', '#8a6a2a', '#4a4a52', '#a05a2a', '#2e3e5a'];

const HAIR_STYLES = {
  f: ['long', 'pony', 'bun', 'bob', 'curly', 'braids', 'afro', 'short', 'swept', 'buzz'],
  m: ['short', 'buzz', 'swept', 'curly', 'bald', 'mohawk', 'afro', 'pony', 'long', 'bun'],
  n: ['short', 'swept', 'bob', 'curly', 'buzz', 'mohawk', 'pony', 'afro', 'long', 'braids'],
};
// Weights by position: earlier styles are more common.
const STYLE_W = [10, 9, 8, 7, 6, 5, 4, 3, 2, 2];

function pickWeighted(rng, list, weights) {
  let total = 0;
  for (let i = 0; i < list.length; i++) total += weights[i] || 1;
  let r = rng() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i] || 1;
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

function makeLook(rng, p, age, role) {
  const hair = pickWeighted(rng, HAIR_STYLES[p], STYLE_W);
  let hairColor;
  if (age >= 62) hairColor = chance(rng, 0.7) ? 9 : 8;
  else if (age >= 48) hairColor = chance(rng, 0.45) ? 8 : pick(rng, HAIR_NATURAL);
  else hairColor = chance(rng, 0.08) ? pick(rng, HAIR_DYED) : pick(rng, HAIR_NATURAL);
  const beardP = p === 'm' ? 0.55 : p === 'n' ? 0.12 : 0;
  const beard = chance(rng, beardP) ? pick(rng, ['stubble', 'full', 'mustache', 'goatee', 'stubble']) : 'none';
  const glasses = chance(rng, age >= 45 ? 0.35 : 0.16) ? pick(rng, ['round', 'square', 'square', 'shades']) : 'none';
  const hatPool = { fighter: ['beanie', 'bandana', 'cap'], medic: ['headband', 'cap'], scout: ['hood', 'bandana', 'beanie'] }[role];
  const hat = chance(rng, 0.3) ? pick(rng, hatPool) : 'none';
  const mark = chance(rng, 0.35) ? pick(rng, ['scar', 'bandage', 'freckles', 'earring', 'freckles', 'earring']) : 'none';
  return {
    skin: Math.floor(rng() * SKIN.length),
    face: pick(rng, ['round', 'long', 'square']),
    hair,
    hairColor,
    beard,
    glasses,
    hat,
    mark,
    eyes: Math.floor(rng() * EYES.length),
    brows: pick(rng, ['flat', 'arched', 'thick']),
    mouth: pick(rng, ['smile', 'flat', 'grin', 'smirk', 'flat']),
    shirt: Math.floor(rng() * SHIRTS.length),
    old: age >= 50,
  };
}

// --- The person --------------------------------------------------------------------------

/** Stars from odds [★, ★★, ★★★]. */
export function rollStars(rng, odds) {
  const r = rng();
  if (r < odds[2]) return 3;
  if (r < odds[2] + odds[1]) return 2;
  return 1;
}

/**
 * A new survivor. `role` is optional (random otherwise); `prefer` is a list of roles
 * to lean toward (the ones you don't have yet).
 */
export function generatePerson(rng, { id, stars, role = null, level = 1, prefer = [], preferChance = 0.5, origin = 'gate', day = 0, avoid = null } = {}) {
  const p = pickWeighted(rng, ['f', 'm', 'n'], [46, 46, 8]);
  if (!role) role = prefer.length && chance(rng, preferChance) ? pick(rng, prefer) : pick(rng, ROLE_ORDER);
  const age = 18 + Math.floor(Math.pow(rng(), 1.4) * 52);
  // Nobody shares a first name with someone already here (`avoid`): two Amaras is one too many.
  let first = pick(rng, FIRST[p]);
  for (let k = 0; k < 12 && avoid && avoid.has(first); k++) first = pick(rng, FIRST[p]);
  const last = pick(rng, LAST);
  const job = pick(rng, JOBS[role]);
  const quirk = pick(rng, QUIRKS);
  const look = makeLook(rng, p, age, role);
  const nick = stars === 3 && chance(rng, 0.6) ? pick(rng, NICKS[role]) : null;
  const quote = pick(rng, PITCH[role]);
  return {
    id,
    first,
    last,
    nick,
    age,
    job,
    quirk,
    quote,
    role,
    stars,
    level: Math.max(1, Math.min(MAX_LEVEL, level)),
    xp: 0,
    look,
    rest: 0,
    origin,
    joined: null,
    met: day,
    runs: 0,
    kills: 0,
  };
}

export const fullName = (p) => (p.nick ? `${p.first} "${p.nick}" ${p.last}` : `${p.first} ${p.last}`);
export const shortName = (p) => p.first;

/** Power of a person on their own: star base + per level. */
export function basePower(p, level = p.level) {
  const s = STARS[p.stars];
  return s.base + s.per * (level - 1);
}
