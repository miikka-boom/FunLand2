// Computer opponents. Every match is against a bot (the UI never pretends
// otherwise), matched fairly: its cards are the ones unlocked at your arena,
// its card levels mirror your deck card by card (your best level for its best
// card, and so on), but never above the level expected at your trophy count
// (LEVEL_CURVE), so upgrading beyond it is a real edge; its King Level works
// the same way and its skill follows your trophies. It is never above you:
// not on any card, not by rounding, not by the arena floor.
//
//   makeOpponent(p, seed = p.stats.matches) -> { name, deck, levels, kingLevel, skill, hats, archetype, arena, tutorial, bot: true }
//
// Same (profile, seed), same opponent; the default seed (matches played so
// far) gives a new opponent each match.
// deck/levels/kingLevel/hats are a sim/match.js Side; skill goes to the Bot.
// Hats are flavour only (cosmetics never change a battle).

import { CARDS, DECK_SIZE, MAX_LEVEL } from '../sim/cards.js';
import { HATS } from '../render/hats.js';
import { AIR_ANSWERS, ARENAS, arenaIndex, cardsUpTo, kingLevelForXp, MAX_KING_LEVEL } from './collection.js';
import { UNIT_IDS, rngFrom } from './profile.js';

export const BOT_NAMES = [
  'Captain Bonk', 'Sir Wobblesworth', 'Baron von Bean', 'Duke Dumpling', 'Lady Jellyroll', 'Professor Pudding', 'Admiral Noodle', 'Granny Gravy',
  'Sergeant Squish', 'Count Kidneybean', 'Madame Marmalade', 'Pickle Pete', 'General Jiggle', 'Doctor Dropkick', 'Bonkers McGee', 'Wiggly Wendy',
  'Lord Lentil', 'Major Mayhem', 'Chef Chickpea', 'The Great Garbanzo', 'Mustard Max', 'Uncle Udon', 'Biscuit Boss', 'Colonel Cobbler',
  'Waffle Wizard', 'Nana Noodlearms', 'Squire Squash', 'Turbo Tofu', 'Pudding Pirate', 'Jellybean Jack', 'Sir Bonks-a-Lot', 'Wobbly Walter',
  'Queen Quiche', 'Rusty Ravioli', 'Gumdrop Gus', 'Captain Custard', 'Lumpy Larry', 'Dame Doughnut', 'Flapjack Fred', 'Mighty Meatball',
  'Bouncy Bea', 'Kernel Popcorn',
];

// Card level floor per arena (gentle: you won't meet level-1 bots at the top,
// unless your own cards are level 1: the floor never goes above your level).
export const LEVEL_FLOOR = [1, 1, 2, 3, 4];
// The card (and King) level a bot brings at a trophy count, at most: about
// the median player's deck there. [trophies, level], straight lines between.
// Under it the bot mirrors you; above it your upgrades are your edge.
export const LEVEL_CURVE = [[0, 2], [300, 4], [650, 5], [1000, 6], [1500, 7], [2500, 9]];

// Deck styles, cards in order of preference. Cards not unlocked yet are
// skipped and the deck is topped up from the rest of the unlocked pool.
// `arena`: the arena a style suits from (its first card unlocks there); it is
// not picked before then. The first five suit every arena. Every style holds
// an answer to fliers (AIR_ANSWERS) wherever fliers are unlocked.
export const ARCHETYPES = {
  bonk: { name: 'Bonk Rush', cards: ['bruiser', 'clubberGang', 'clubbers', 'spikers', 'squire', 'archers', 'arrowRain', 'boulder'] },
  siege: { name: 'Siege', cards: ['brick', 'archers', 'cheeseWheel', 'spikers', 'arrowRain', 'squire', 'bomb', 'boulder'] },
  boom: { name: 'Big Boom', cards: ['megaBomb', 'bombSquad', 'bomb', 'shieldWall', 'archers', 'arrowRain', 'spikers', 'boulder'] },
  turtle: { name: 'Turtle', cards: ['shieldWall', 'squire', 'archers', 'boulder', 'arrowRain', 'bruiser', 'clubbers', 'cheeseWheel'] },
  swarm: { name: 'Swarm', cards: ['spikers', 'clubbers', 'clubberGang', 'bombSquad', 'archers', 'arrowRain', 'cheeseWheel', 'bomb'] },
  // The newer cards' styles (docs/WOBBLE-WAR-CARDS.md section 7)
  hop: { name: 'Hop Cycle', arena: 1, cards: ['pogoBean', 'sprouts', 'bananaPeels', 'spikers', 'bomb', 'netter', 'archers', 'arrowRain'] },
  fizz: { name: 'Fizz Pop', arena: 2, cards: ['bombJuggler', 'shakenSoda', 'bigSneeze', 'megaBomb', 'squire', 'propellerPals', 'sprouts', 'archers'] },
  fortress: { name: 'Fortress', arena: 3, cards: ['wreckingCrane', 'beanPatch', 'boingBox', 'brick', 'anvil', 'archers', 'bananaPeels', 'arrowRain'] },
  sky: { name: 'Sky Circus', arena: 4, cards: ['pelican', 'propellerPals', 'brollyBrigade', 'netter', 'bombJuggler', 'bigSneeze', 'squire', 'arrowRain'] },
  parade: { name: 'Jelly Parade', arena: 4, cards: ['bigJelly', 'tummyDrummer', 'bubbleWrap', 'clubberGang', 'bombJuggler', 'archers', 'sprouts', 'boulder'] },
};

export { AIR_ANSWERS };

/** The archetype ids a bot may pick at an arena (a style waits for its first card). */
export const archetypesFor = (arena) =>
  Object.keys(ARCHETYPES).filter((id) => {
    const A = ARCHETYPES[id];
    return !A.arena || (A.arena <= arena && CARDS[A.cards[0]].arena <= arena);
  });

export const TUTORIAL_OPPONENT = {
  name: 'Training Dummy',
  deck: ['clubbers', 'squire', 'archers', 'spikers', 'bomb', 'clubberGang', 'arrowRain', 'boulder'],
  skill: 0.05,
  castle: 0.5, // a practice castle with half the health: the first match can end with it falling
};

const HAT_IDS = HATS.filter((h) => !h.supporter && h.id !== 'none').map((h) => h.id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The level cap for a trophy count (fractional: 4.5 = half the cards at 5). */
export function levelCap(trophies) {
  const t = Math.max(0, Number(trophies) || 0);
  const C = LEVEL_CURVE;
  for (let i = 1; i < C.length; i++) {
    const [t1, l1] = C[i];
    if (t <= t1) {
      const [t0, l0] = C[i - 1];
      return l0 + ((l1 - l0) * (t - t0)) / (t1 - t0);
    }
  }
  return C[C.length - 1][1];
}

/**
 * Your levels, high to low, each capped by the curve: { levels: [8], king }.
 * A fractional cap rounds up for a share of the cards (from rng).
 */
function capped(p, rng) {
  const cap = levelCap(p.trophies);
  const roll = () => Math.floor(cap) + (rng.next() < cap - Math.floor(cap) ? 1 : 0);
  const mine = p.deck.map((id) => (p.cards[id] ? p.cards[id].level : 1)).sort((a, b) => b - a);
  while (mine.length < DECK_SIZE) mine.push(mine.length ? mine[mine.length - 1] : 1);
  return { mine, levels: mine.map((l) => Math.min(l, roll())), king: Math.min(kingLevelForXp(p.king.xp), roll()) };
}

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
      castle: t.castle,
      hats: Object.fromEntries(UNIT_IDS.map((u) => [u, 'cone'])),
      archetype: 'tutorial',
      arena: 0,
      tutorial: true,
      bot: true,
    };
  }
  const arena = arenaIndex(p.trophies);
  const archetype = rng.pick(archetypesFor(arena));
  const deck = buildDeck(arena, archetype, rng);

  // Levels: card by card your own (best for best), capped by the curve for your
  // trophies. Never above yours: in bot-vs-bot sims one level up wins ~95% of
  // matches, so a random +1 would decide the match before it starts. A few cards
  // a level lower give you a small edge instead; the arena floor only stops
  // those drops (it is never above your own card).
  // (Mirroring card by card, not the deck's average: a level-1 card in your deck
  // gives the bot a level-1 card too, rather than weakening all eight of its.)
  const floor = LEVEL_FLOOR[Math.min(arena, LEVEL_FLOOR.length - 1)];
  const lv = capped(p, rng);
  const levels = {};
  deck.forEach((id, k) => {
    const cap = lv.levels[k];
    levels[id] = clamp(cap - (rng.chance(0.25) ? 1 : 0), Math.min(floor, lv.mine[k]), MAX_LEVEL);
  });
  const kingLevel = clamp(lv.king - (rng.chance(0.2) ? 1 : 0), 1, MAX_KING_LEVEL);

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
