// A simulated Last Stop player for the balance tool and the tests.
//
// Between nights it spends like a player who follows the hints:
//   1. send out the strongest survivor, and upgrade them while tonight's
//      chance is under TARGET
//   2. save for the next goal: a new home or the lot next door, whichever is
//      cheaper (a home needs room; the first home as soon as it's affordable)
//   3. a share of every night's coins (FUN) goes on decorations and on
//      levelling everyone else's homes, half each

import { Town, newTownState } from '../src/town.js';
import { FakeClock } from '../src/clock.js';
import { TUNING_DEFAULTS, DECOR, DECOR_ORDER, HOME_SIZE } from '../src/config.js';

const T0 = Date.UTC(2026, 0, 5, 7, 0, 0);

export function makeTown(seed, tuning = {}) {
  const clock = new FakeClock(T0);
  const state = newTownState(T0, seed);
  const town = new Town(state, { clock, tuning: { ...TUNING_DEFAULTS, ...tuning } });
  return { town, clock, state };
}

export const TARGET = 0.75;
export const FUN = 0.3;

/** One round of spending (as a player would between nights). wallet = { decor, homes } of coins set aside. */
export function spend(town, wallet) {
  const s = town.s;
  const strongest = town.strongest();
  if (strongest && strongest.id !== s.pick) town.setPick(strongest.id);
  for (let guard = 0; guard < 200; guard++) {
    const p = town.picked();
    // 1. Tonight's odds.
    if (town.chance(p) < TARGET && town.canUpgrade(p.id).ok) {
      town.upgrade(p.id);
      continue;
    }
    const free = s.coins - wallet.decor - wallet.homes;
    // 2. The next goal: a home or the lot next door, whichever is cheaper (a home needs room).
    const home = town.canBuildHome();
    const lot = town.suggestLot();
    const homeFirst = home.room !== false && (!lot || home.price <= town.landPrice() || (s.built === 0 && home.ok));
    if (homeFirst) {
      if (home.ok && (home.price <= free || s.built === 0)) {
        const at = town.freeSpot(HOME_SIZE);
        if (at && town.buildHome(at.i, at.j).ok) {
          const best = town.strongest();
          if (best.id !== s.pick) town.setPick(best.id);
          continue;
        }
      }
    } else if (lot && town.landPrice() <= free && town.canClear(lot.a, lot.b).ok) {
      town.clear(lot.a, lot.b);
      continue;
    }
    // 3. Fun money: someone else's home, then a decoration.
    const others = s.people.filter((q) => q.id !== p.id && q.level < p.level).sort((a, b) => a.level - b.level);
    const o = others[0];
    if (o && town.levelCost(o) <= wallet.homes && town.canUpgrade(o.id).ok) {
      wallet.homes -= town.levelCost(o);
      town.upgrade(o.id);
      continue;
    }
    const kinds = DECOR_ORDER.filter((k) => DECOR[k].price <= wallet.decor && town.canBuy(k).ok);
    if (kinds.length) {
      const k = kinds[kinds.length - 1];
      const at = town.freeSpot(DECOR[k].size);
      if (at && town.buy(k, at.i, at.j).ok) {
        wallet.decor -= DECOR[k].price;
        continue;
      }
    }
    break;
  }
  wallet.decor = Math.min(wallet.decor, s.coins);
  wallet.homes = Math.min(wallet.homes, s.coins - wallet.decor);
}

/**
 * Play `runs` nights from a fresh town. Returns per-run rows
 * { run, night, win, coins, people, lots, homesBuilt, pickLv, pickStars, chance, decor, spent }
 * and the run each milestone first happened.
 */
export function simulate({ seed = 1, runs = 200, tuning = {} } = {}) {
  const { town, state: s } = makeTown(seed, tuning);
  const rows = [];
  const first = {};
  const mark = (k, r) => {
    if (first[k] == null) first[k] = r;
  };
  const wallet = { decor: 0, homes: 0 };
  for (let r = 1; r <= runs; r++) {
    spend(town, wallet);
    const p = town.picked();
    const chance = town.chance(p);
    const res = town.play();
    wallet.decor += (res.coins * FUN) / 2;
    wallet.homes += (res.coins * FUN) / 2;
    if (s.built >= 1) mark('home1', r);
    if (s.built >= 3) mark('home3', r);
    if (town.lotCount() >= 2) mark('land1', r);
    if (town.lotCount() >= 5) mark('land4', r);
    if (town.lotCount() >= 25) mark('allLand', r);
    if (town.stationLevel() >= 3) mark('fixedUp', r);
    if (town.stationLevel() >= 5) mark('proud', r);
    if (town.stationLevel() >= 7) mark('gold', r);
    if (s.people.some((q) => q.rarity === 'legend')) mark('legend', r);
    if (s.people.some((q) => q.level >= 10)) mark('lv10', r);
    rows.push({
      run: r,
      night: res.night,
      win: res.win,
      coins: s.coins,
      people: s.people.length,
      lots: town.lotCount(),
      homesBuilt: s.built,
      pickLv: p.level,
      pickStars: p.rarity,
      chance,
      decor: s.objects.filter((o) => o.kind === 'decor').length,
      spent: { ...s.stats.spent },
      earned: s.stats.coinsEarned,
    });
  }
  return { rows, first, state: s };
}
