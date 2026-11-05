// Computer opponents. Every match is against a bot (the UI never pretends
// otherwise), matched fairly: its cards are the ones unlocked at your arena,
// its card levels follow your deck level (with a gentle floor per arena), its
// King Level is near yours and its skill follows your trophies.
//
//   makeOpponent(p, seed = p.stats.matches) -> { name, deck, levels, kingLevel, skill, hats, archetype, arena, tutorial, bot: true }
//
// Same (profile, seed), same opponent; the default seed (matches played so
// far) gives a new opponent each match.
// deck/levels/kingLevel/hats are a sim/match.js Side; skill goes to the Bot.
// Hats are flavour only (cosmetics never change a battle).

import { CARDS, DECK_SIZE, MAX_LEVEL } from '../sim/cards.js';
import { HATS } from '../render/hats.js';
import { ARENAS, arenaIndex, cardsUpTo, deckLevel, kingLevelForXp, MAX_KING_LEVEL } from './collection.js';
import { UNIT_IDS, rngFrom } from './profile.js';

export const BOT_NAMES = [
  'Captain Bonk', 'Sir Wobblesworth', 'Baron von Bean', 'Duke Dumpling', 'Lady Jellyroll', 'Professor Pudding', 'Admiral Noodle', 'Granny Gravy',
  'Sergeant Squish', 'Count Kidneybean', 'Madame Marmalade', 'Pickle Pete', 'General Jiggle', 'Doctor Dropkick', 'Bonkers McGee', 'Wiggly Wendy',
  'Lord Lentil', 'Major Mayhem', 'Chef Chickpea', 'The Great Garbanzo', 'Mustard Max', 'Uncle Udon', 'Biscuit Boss', 'Colonel Cobbler',
  'Waffle Wizard', 'Nana Noodlearms', 'Squire Squash', 'Turbo Tofu', 'Pudding Pirate', 'Jellybean Jack', 'Sir Bonks-a-Lot', 'Wobbly Walter',
  'Queen Quiche', 'Rusty Ravioli', 'Gumdrop Gus', 'Captain Custard', 'Lumpy Larry', 'Dame Doughnut', 'Flapjack Fred', 'Mighty Meatball',
  'Bouncy Bea', 'Kernel Popcorn',
];

// Card level floor per arena (gentle: you won't meet level-1 bots at the top).
export const LEVEL_FLOOR = [1, 1, 2, 3, 4];

// Deck styles, cards in order of preference. Cards not unlocked yet are
// skipped and the deck is topped up from the rest of the unlocked pool.
export const ARCHETYPES = {
  bonk: { name: 'Bonk Rush', cards: ['bruiser', 'clubberGang', 'clubbers', 'spikers', 'squire', 'archers', 'arrowRain', 'boulder'] },
  siege: { name: 'Siege', cards: ['brick', 'archers', 'cheeseWheel', 'spikers', 'arrowRain', 'squire', 'bomb', 'boulder'] },
  boom: { name: 'Big Boom', cards: ['megaBomb', 'bombSquad', 'bomb', 'shieldWall', 'archers', 'arrowRain', 'spikers', 'boulder'] },
  turtle: { name: 'Turtle', cards: ['shieldWall', 'squire', 'archers', 'boulder', 'arrowRain', 'bruiser', 'clubbers', 'cheeseWheel'] },
  swarm: { name: 'Swarm', cards: ['spikers', 'clubbers', 'clubberGang', 'bombSquad', 'archers', 'arrowRain', 'cheeseWheel', 'bomb'] },
};

export const TUTORIAL_OPPONENT = {
  name: 'Training Dummy',
  deck: ['clubbers', 'squire', 'archers', 'spikers', 'bomb', 'clubberGang', 'arrowRain', 'boulder'],
  skill: 0.05,
};

const HAT_IDS = HATS.filter((h) => !h.supporter && h.id !== 'none').map((h) => h.id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** A sensible 8-card deck for an archetype from the cards an arena unlocked. */
export function buildDeck(arena, archetype, rng) {
  const pool = cardsUpTo(arena);
  const deck = ARCHETYPES[archetype].cards.filter((id) => pool.includes(id)).slice(0, DECK_SIZE);
  const rest = rng.shuffle(pool.filter((id) => !deck.includes(id)));
  while (deck.length < DECK_SIZE && rest.length) deck.push(rest.pop());
  // Always at least one spell (every pool has plenty of units).
  const spells = (d) => d.filter((id) => CARDS[id].kind === 'spell');
  if (!spells(deck).length) {
    const s = pool.find((id) => CARDS[id].kind === 'spell' && !deck.includes(id));
    if (s) deck[deck.length - 1] = s;
  }
  return rng.shuffle(deck);
}

export function makeOpponent(p, seed = p.stats.matches) {
  const rng = rngFrom(p.seed, 'opponent', seed);
  if (p.tutorial === 0) {
    const t = TUTORIAL_OPPONENT;
    return {
      name: t.name,
      deck: t.deck.slice(),
      levels: Object.fromEntries(t.deck.map((id) => [id, 1])),
      kingLevel: 1,
      skill: t.skill,
      hats: Object.fromEntries(UNIT_IDS.map((u) => [u, 'cone'])),
      archetype: 'tutorial',
      arena: 0,
      tutorial: true,
      bot: true,
    };
  }
  const arena = arenaIndex(p.trophies);
  const archetype = rng.pick(Object.keys(ARCHETYPES));
  const deck = buildDeck(arena, archetype, rng);

  // Levels: around your deck level, never under the arena floor.
  const floor = LEVEL_FLOOR[Math.min(arena, LEVEL_FLOOR.length - 1)];
  // Not above your average (rounding toward you): in bot-vs-bot sims one level up
  // wins ~95% of matches, so a random +1 would decide the match before it starts.
  // A few cards a level lower give you a small edge instead.
  const base = clamp(Math.round(deckLevel(p) - 0.25), floor, MAX_LEVEL);
  const levels = {};
  for (const id of deck) levels[id] = clamp(base - (rng.chance(0.25) ? 1 : 0), floor, MAX_LEVEL);
  const king = kingLevelForXp(p.king.xp);
  const kingLevel = clamp(king - (rng.chance(0.2) ? 1 : 0), 1, MAX_KING_LEVEL);

  // Skill: 0.3 at 0 trophies up to 0.9 at the top arena, a little noise.
  const top = ARENAS[ARENAS.length - 1].trophies;
  const skill = Math.round(clamp(0.3 + 0.6 * Math.min(1, p.trophies / top) + (rng.next() - 0.5) * 0.1, 0.25, 0.95) * 100) / 100;

  // Flavour: a themed hat for most of the army, a few odd ones out.
  const theme = rng.pick(HAT_IDS);
  const hats = {};
  for (const u of UNIT_IDS) {
    const r = rng.next();
    hats[u] = r < 0.5 ? theme : r < 0.7 ? rng.pick(HAT_IDS) : 'none';
  }
  return { name: rng.pick(BOT_NAMES), deck, levels, kingLevel, skill, hats, archetype, arena, tutorial: false, bot: true };
}
