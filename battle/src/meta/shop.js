// The daily shop (by the player's local date): a free gift once a day and 3
// card offers for gold, each buyable once per day. Gold only, never money.
// Cosmetics (colours, hats) are in cosmetics.js.
//
// The day's stock is rolled from (p.seed, date, arena) where the arena is
// remembered when the day starts (p.shop.arena), so reaching a new arena
// mid-day doesn't reshuffle offers you were looking at. A clock moved back a
// day or two keeps the newer day's shop (no second free gift that way); a
// clock moved further back is taken as a clock that was wrong before, and the
// shop follows it. (So someone who keeps moving their device clock by days can
// collect extra gifts, like they could with any timer kept on the device. This
// is an offline game against bots: only an honest clock is protected.)

import { CARDS } from '../sim/cards.js';
import { bestArena, cardsUpTo } from './collection.js';
import { grant, rngFrom, spendGold } from './profile.js';

export const SHOP = {
  offers: 3,
  price: { common: 10, rare: 60, epic: 300 }, // gold per card
  count: { common: [10, 20], rare: [2, 5], epic: [1, 1] },
};

// Callers pass `now`; a missing one means the real clock (never 1970).
const clock = (now) => (Number.isFinite(now) ? now : Date.now());

/** Local calendar date of a timestamp, 'YYYY-MM-DD'. */
export function dayKey(now) {
  const d = new Date(clock(now));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DOWN = { legendary: 'epic', epic: 'rare', rare: 'common', common: null };

const dayNum = (key) => {
  const m = /^(\d+)-(\d\d)-(\d\d)$/.exec(key);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : NaN;
};

/**
 * Start a new day when the date changed (writes p.shop). Returns the shop's day.
 * A clock moved back by a day or two keeps the newer day's shop; further back
 * than that the clock was simply wrong before, so the shop follows it.
 */
function rollover(p, now) {
  const day = dayKey(now);
  const back = dayNum(p.shop.day) - dayNum(day);
  if (day !== p.shop.day && !(back > 0 && back <= 2)) p.shop = { day, bought: [], free: false, arena: bestArena(p) };
  return p.shop.day;
}

function stock(p, day, arena) {
  const rng = rngFrom(p.seed, 'shop', day);
  const pool = { common: [], rare: [], epic: [], legendary: [] };
  for (const id of cardsUpTo(arena)) pool[CARDS[id].rarity].push(id);

  // The free gift: mostly gold, sometimes common cards, now and then a rare.
  const roll = rng.next();
  const goldN = Math.round(rng.int(20, 40) * (1 + 0.25 * arena));
  const commonN = Math.round(rng.int(5, 10) * (1 + 0.2 * arena));
  const commonId = rng.pick(pool.common);
  const rareId = pool.rare.length ? rng.pick(pool.rare) : null;
  let free;
  if (roll < 0.55) free = { gold: goldN };
  else if (roll < 0.9 || !rareId) free = { cards: { [commonId]: commonN } };
  else free = { cards: { [rareId]: rng.int(1, 2) } };

  // Offers: a common, a common-or-rare, a rare-or-epic; all different cards.
  const want = ['common', rng.chance(0.5) ? 'rare' : 'common', rng.chance(0.4) ? 'epic' : 'rare'];
  const offers = [];
  want.forEach((r0, i) => {
    let r = r0;
    while (r && !pool[r].some((id) => !offers.some((o) => o.cardId === id))) r = DOWN[r];
    const fresh = r ? pool[r].filter((id) => !offers.some((o) => o.cardId === id)) : [];
    const n = r ? rng.int(...SHOP.count[r]) : 0;
    const cardId = fresh.length ? rng.pick(fresh) : null;
    if (cardId) offers.push({ i, cardId, rarity: r, count: n, price: n * SHOP.price[r] });
  });
  return { free, offers };
}

/**
 * Today's shop: { day, free: { reward, claimed }, offers: [{ i, cardId, rarity, count, price, bought }] }.
 * reward is a grant() reward ({ gold } or { cards: { id: n } }). Rolls the
 * day over when the local date changed (writes p.shop; save afterwards).
 */
export function shopToday(p, now) {
  const day = rollover(p, now);
  const s = stock(p, day, Math.min(p.shop.arena, bestArena(p)));
  return {
    day,
    free: { reward: s.free, claimed: p.shop.free },
    offers: s.offers.map((o) => ({ ...o, bought: p.shop.bought.includes(o.i) })),
  };
}

/** Claim today's free gift: grant() summary, or null if already claimed. */
export function claimFree(p, now) {
  const s = shopToday(p, now);
  if (s.free.claimed) return null;
  p.shop.free = true;
  return grant(p, s.free.reward);
}

/**
 * Buy offer i with gold. Returns the grant() summary plus { price, offer }, or
 * a reason string: 'gone' (no such offer today), 'bought' (already bought
 * today), 'poor' (not enough gold).
 */
export function buyOffer(p, i, now) {
  const s = shopToday(p, now);
  const o = s.offers.find((x) => x.i === i);
  if (!o) return 'gone';
  if (o.bought) return 'bought';
  if (!spendGold(p, o.price)) return 'poor';
  p.shop.bought.push(i);
  return { ...grant(p, { cards: { [o.cardId]: o.count } }), price: o.price, offer: i };
}

/** ms until the shop restocks (local midnight). */
export function msToRestock(now) {
  const d = new Date(clock(now));
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - d.getTime();
}
