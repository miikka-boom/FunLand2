// Badges: little goals that reward playing (and laughing at the physics).
// Progress comes from profile.stats (counted from battle events and the meta
// game) or is derived (best trophies, King Level). Rewards are Jellybeans and
// some gold, claimed by tapping. Ids kept from the old achievements (same
// meaning) carry their claims over from v1 saves: see V1_BADGE_IDS.

import { ARENAS, kingLevelForXp } from './collection.js';
import { grant } from './profile.js';

const B = (id, icon, name, desc, goal, src, beans, gold = 0) => ({ id, icon, name, desc, goal, ...src, reward: gold ? { beans, gold } : { beans } });
const stat = (s) => ({ stat: s });

export const BADGES = [
  // Matches
  B('firstWin', '🥇', 'First Victory', 'Win a match', 1, stat('wins'), 50, 50),
  B('wins25', '🎖️', 'Seasoned Wobbler', 'Win 25 matches', 25, stat('wins'), 150, 200),
  B('wins100', '🏅', 'Unstoppable Wobble', 'Win 100 matches', 100, stat('wins'), 400, 1000),
  B('threeCrowns', '👑', 'Clean Sweep', 'Win with all 3 crowns', 1, stat('threeCrowns'), 100, 100),
  B('threeCrowns10', '💎', 'Sweep Machine', 'Win with all 3 crowns 10 times', 10, stat('threeCrowns'), 250, 400),
  B('towers', '🏚️', 'Demolition Crew', 'Destroy 25 towers', 25, stat('towers'), 150, 150),
  B('cardsPlayed', '🃏', 'Deck Hand', 'Play 500 cards', 500, stat('cardsPlayed'), 150, 150),
  B('spells', '🌠', 'Sky Caller', 'Cast 50 spells', 50, stat('spells'), 100, 100),
  // Physics fun (kept from the old achievements)
  B('knockdowns', '💫', 'Bonk Master', 'Knock down 100 enemy beans', 100, stat('knockdowns'), 150),
  B('kills', '🫘', 'Bean Counter', 'Defeat 300 enemy units', 300, stat('kills'), 200),
  B('flyer', '🚀', 'Frequent Flyer', 'Launch an enemy higher than a castle', 1, stat('highFlights'), 100),
  B('pincushion', '🎯', 'Pincushion', 'Stick 8 arrows in one enemy', 1, stat('pincushions'), 100),
  B('chain', '💥', 'Chain Reaction', '3 explosions within one second', 1, stat('chains'), 150),
  B('booms', '🧨', 'Kaboom Connoisseur', 'Set off 100 explosions', 100, stat('booms'), 150),
  B('boing', '🛡️', 'Boing!', 'Bounce a Spiker off one of your shields', 1, stat('boings'), 75),
  B('giants', '🧱', 'Giant Slayer', 'Defeat 10 enemy Bricks', 10, stat('bricksDefeated'), 200),
  B('yeet', '🫳', 'Yeet', 'Fling a bean across the Sandbox', 1, stat('yeets'), 50),
  // Collection
  B('dressUp', '🎩', 'Dressed to Bonk', 'Put a hat on a unit', 1, stat('hatsEquipped'), 50),
  B('chests', '🧰', 'Treasure Hunter', 'Open 20 chests', 20, stat('chests'), 100, 100),
  B('upgrades', '🔧', 'Tinkerer', 'Upgrade cards 10 times', 10, stat('upgrades'), 100, 100),
  B('king5', '🤴', 'Big Cheese', 'Reach King Level 5', 5, { derive: 'king' }, 200, 300),
  // Arenas (progress = best trophies toward the gate)
  ...ARENAS.slice(1).map((a, k) =>
    B(`arena${a.id}`, '🏟️', a.name, `Reach ${a.name}`, a.trophies, { derive: 'best' }, [100, 150, 200, 300][k] || 300, [100, 200, 300, 500][k] || 500),
  ),
];

function raw(p, b) {
  if (b.derive === 'best') return p.best;
  if (b.derive === 'king') return kingLevelForXp(p.king.xp);
  return p.stats[b.stat] || 0;
}

/** [{ ...badge, progress, done, claimed }] in display order (claimable first, claimed last). */
export function badgeStatus(p) {
  const list = BADGES.map((b) => {
    const progress = Math.min(b.goal, raw(p, b));
    const claimed = !!(p.badges[b.id] && p.badges[b.id].claimed);
    return { ...b, progress, done: progress >= b.goal, claimed };
  });
  const rank = (b) => (b.done && !b.claimed ? 0 : b.claimed ? 2 : 1);
  return list.sort((a, b) => rank(a) - rank(b));
}

/** How many badges are done and waiting to be claimed. */
export const claimableBadges = (p) => badgeStatus(p).filter((b) => b.done && !b.claimed).length;

/** Claim a finished badge: the grant() summary plus { id }, or null if not claimable. */
export function claimBadge(p, id) {
  const b = badgeStatus(p).find((x) => x.id === id);
  if (!b || !b.done || b.claimed) return null;
  p.badges[id] = { claimed: true };
  return { id, ...grant(p, b.reward) };
}
