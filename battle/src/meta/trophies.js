// Trophies: little goals that reward playing with (and laughing at) the
// physics. Progress comes from profile.stats (counted from battle events) or
// is derived from campaign progress. Rewards are claimed by tapping.

import { addBeans } from './profile.js';

export const TROPHIES = [
  { id: 'firstWin', icon: '🏆', name: 'First Victory', desc: 'Win a battle', goal: 1, stat: 'wins', reward: 50 },
  { id: 'knockdowns', icon: '💫', name: 'Bonk Master', desc: 'Knock down 100 enemy beans', goal: 100, stat: 'knockdowns', reward: 150 },
  { id: 'kills', icon: '🫘', name: 'Bean Counter', desc: 'Defeat 300 enemy units', goal: 300, stat: 'kills', reward: 200 },
  { id: 'flyer', icon: '🚀', name: 'Frequent Flyer', desc: 'Launch an enemy higher than a castle', goal: 1, stat: 'highFlights', reward: 100 },
  { id: 'pincushion', icon: '🎯', name: 'Pincushion', desc: 'Stick 8 arrows in one enemy', goal: 1, stat: 'pincushions', reward: 100 },
  { id: 'chain', icon: '💥', name: 'Chain Reaction', desc: '3 explosions within one second', goal: 1, stat: 'chains', reward: 150 },
  { id: 'boing', icon: '🛡️', name: 'Boing!', desc: 'Bounce a Spiker off one of your shields', goal: 1, stat: 'boings', reward: 75 },
  { id: 'giants', icon: '🧱', name: 'Giant Slayer', desc: 'Defeat 10 enemy Bricks', goal: 10, stat: 'bricksDefeated', reward: 200 },
  { id: 'flawless', icon: '✨', name: 'Flawless', desc: 'Win a level without losing a unit', goal: 1, stat: 'flawless', reward: 150 },
  { id: 'stars', icon: '⭐', name: 'Penny Pincher', desc: 'Earn 3 stars on 10 levels', goal: 10, derive: 'threeStars', reward: 200 },
  { id: 'world1', icon: '🌿', name: 'Green Hills', desc: 'Clear World 1', goal: 1, derive: 'world1', reward: 150 },
  { id: 'world2', icon: '🔺', name: 'Pointy Pass', desc: 'Clear World 2', goal: 1, derive: 'world2', reward: 200 },
  { id: 'world3', icon: '🏰', name: 'Brick Fortress', desc: 'Clear World 3', goal: 1, derive: 'world3', reward: 300 },
  { id: 'dailies', icon: '📅', name: 'Regular', desc: 'Win 5 daily challenges', goal: 5, stat: 'dailies', reward: 150 },
  { id: 'dressUp', icon: '🎩', name: 'Dressed to Bonk', desc: 'Put a hat on a unit', goal: 1, stat: 'hatsEquipped', reward: 50 },
  { id: 'yeet', icon: '🫳', name: 'Yeet', desc: 'Fling a bean across the Sandbox', goal: 1, stat: 'yeets', reward: 50 },
];

function derived(p, key) {
  if (key === 'threeStars') return Object.values(p.stars).filter((s) => s >= 3).length;
  if (key === 'world1') return p.cleared[9] ? 1 : 0;
  if (key === 'world2') return p.cleared[19] ? 1 : 0;
  if (key === 'world3') return p.cleared[29] ? 1 : 0;
  return 0;
}

/** [{ ...trophy, progress, done, claimed }] in display order (claimable first). */
export function trophyStatus(p) {
  const list = TROPHIES.map((t) => {
    const raw = t.derive ? derived(p, t.derive) : p.stats[t.stat] || 0;
    const progress = Math.min(t.goal, raw);
    const claimed = !!(p.trophies[t.id] && p.trophies[t.id].claimed);
    return { ...t, progress, done: progress >= t.goal, claimed };
  });
  const rank = (t) => (t.done && !t.claimed ? 0 : t.claimed ? 2 : 1);
  return list.sort((a, b) => rank(a) - rank(b));
}

export function claimable(p) {
  return trophyStatus(p).filter((t) => t.done && !t.claimed).length;
}

/** Claim a finished trophy: returns the Jellybeans paid (0 if not claimable). */
export function claimTrophy(p, id) {
  const t = trophyStatus(p).find((x) => x.id === id);
  if (!t || !t.done || t.claimed) return 0;
  p.trophies[id] = { claimed: true };
  return addBeans(p, t.reward);
}
