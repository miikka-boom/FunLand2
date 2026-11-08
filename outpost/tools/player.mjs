// A simulated Last Stop player for the balance tool and the tests.
//
// Thrill Hill's player (4 sessions a day of 4 raids: open chests, level up,
// upgrade, take BEST, raid), plus the town: land first (rescues and landmark
// routes first) up to LAND_BUDGET of the coins earned, then Thrill Hill's
// order (level-ups, buildings) out of what is left after saving for the next
// lot the budget allows. It pops every junk pile, places
// kits and found decorations, and grant each wish the cheapest way (a boxed
// piece, else the cheapest common of that set, else move one into range).

import { Town, newTownState, gapBetween } from '../src/town.js';
import { FakeClock } from '../src/clock.js';
import { TUNING_DEFAULTS, CLASSES, DECOR, WISH, HOME_TIERS, LOTS } from '../src/config.js';
import { tierOf } from '../src/town.js';

const HOUR = 3600 * 1000;
const T0 = Date.UTC(2026, 0, 5, 7, 0, 0); // a Monday, 07:00

export function makeTown(seed, tuning = {}) {
  const clock = new FakeClock(T0);
  const state = newTownState(T0, seed);
  state.seen.noScript = false;
  const meta = new Town(state, { clock, tuning: { ...TUNING_DEFAULTS, ...tuning } });
  return { meta, clock, state };
}

const BUILD_ORDER = ['crate', 'vault', 'bigtop', 'striker', 'gallery', 'tent', 'garage'];

/** The next READY level-up in the squad (what land must not eat into): someone READY or nearly. */
function reserve(meta) {
  const costs = meta
    .squadPeople()
    .filter((p) => meta.need(p) != null && p.badges >= meta.need(p) * 0.7)
    .map((p) => meta.levelCost(p));
  return costs.length ? Math.min(...costs) : 0;
}

/** The share of coins earned this player is happy to put into land. */
export const LAND_BUDGET = 0.33;
/** Save up for the next lot the budget allows (instead of spending it first). */
export let SAVE = true;
export const setSave = (v) => (SAVE = v);

function spend(meta, log) {
  const s = meta.s;
  for (let guard = 0; guard < 300; guard++) {
    // 1. Land first, within the budget (rescues and landmark routes first).
    const lot = meta.suggestLot();
    const price = meta.nextLotPrice();
    const room = meta.lotCount() < meta.landCap() && meta.frontier().some((f) => f.can.ok || f.can.short);
    const within = room && s.town.stats.landCoins + price <= LAND_BUDGET * Math.max(s.stats.coinsEarned, 1) + 50;
    if (lot && within) {
      const r = meta.clear(lot.a, lot.b);
      if (r.ok) {
        log.clears.push({ day: meta.day(), key: lot.key, kind: LOTS[lot.key].kind, price: r.price });
        continue;
      }
    }
    // 2. Thrill Hill's order with the rest, saving for a lot the budget allows:
    //    level-ups (the squad first), then buildings (the squad's rides first).
    const spare = s.coins - (within && SAVE ? price : 0);
    const order = [...meta.squadPeople(), ...s.people.filter((p) => !meta.inSquad(p.id))];
    const lv = order.find((p) => meta.canLevel(p) && meta.levelCost(p) <= spare);
    if (lv) {
      meta.levelUp(lv.id);
      continue;
    }
    const rides = [...new Set(meta.squadPeople().map((p) => CLASSES[p.cls].ride))];
    const build = [...rides, ...BUILD_ORDER].find((id) => meta.canUpgrade(id).ok && meta.upgradeCost(id) <= spare);
    if (build) {
      meta.upgrade(build);
      continue;
    }
    break;
  }
}

/** A spot for a footprint within the wish range of a home, or null. */
function spotNear(meta, home, size, ignore = null) {
  const R = WISH.range;
  for (let i = home.i - R - size + 1; i <= home.i + home.size + R - 1; i++)
    for (let j = home.j - R - size + 1; j <= home.j + home.size + R - 1; j++) {
      if (gapBetween({ i, j, w: size, h: size }, { i: home.i, j: home.j, w: home.size, h: home.size }) > R) continue;
      if (meta.canPlaceAt(i, j, size, ignore).ok) return { i, j };
    }
  return null;
}

function grantWish(meta, log) {
  const s = meta.s;
  const w = s.wish;
  if (!w) return;
  const home = meta.homeOf(w.id);
  if (!home) return;
  if (w.sib != null) {
    const other = meta.homeOf(w.sib);
    if (!other) return;
    const at = spotNear(meta, other, home.size, home.id);
    if (at) meta.move(home.id, at.i, at.j);
    return;
  }
  // A boxed piece of that set.
  const bi = s.box.findIndex((x) => x.kind === 'decor' && DECOR[x.ref].set === w.set);
  if (bi >= 0) {
    const at = spotNear(meta, home, DECOR[s.box[bi].ref].size);
    if (at && meta.unbox(bi, at.i, at.j).ok) return;
  }
  // The cheapest common of that set (only if it leaves a level-up affordable).
  const buy = Object.keys(DECOR)
    .filter((k) => DECOR[k].set === w.set && meta.canBuy(k).ok)
    .sort((a, b) => DECOR[a].price - DECOR[b].price)[0];
  if (buy && s.coins - DECOR[buy].price >= reserve(meta)) {
    const at = spotNear(meta, home, DECOR[buy].size);
    if (at && meta.buy(buy, at.i, at.j).ok) {
      log.wishCoins += DECOR[buy].price;
      return;
    }
  }
  // Move one that stands elsewhere.
  const o = s.objects.find((x) => x.kind === 'decor' && DECOR[x.ref].set === w.set);
  if (o) {
    const at = spotNear(meta, home, o.size, o.id);
    if (at) meta.move(o.id, at.i, at.j);
  }
}

function tidy(meta) {
  const s = meta.s;
  while (s.junk.length) meta.popJunk(s.junk[0].id);
  for (let k = 0; k < 10 && s.kits.length; k++) {
    const at = meta.freeSpot(meta.sizeOf(s.kits[0]), { avoidPaths: true });
    if (!at || !meta.placeKit(at.i, at.j).ok) break;
  }
  // Found decorations go out (anywhere free) so they count toward the town.
  for (let k = s.box.length - 1; k >= 0; k--) {
    const at = meta.freeSpot(meta.sizeOf(s.box[k]), { avoidPaths: true });
    if (at) meta.unbox(k, at.i, at.j);
  }
}

/** Simulate `days` of play. Returns { daily, clears, state, meta }. */
export function simulate({ seed = 1, days = 7, hours = [8, 12, 18, 22], raids = 4, tuning = {} } = {}) {
  const { meta, clock, state } = makeTown(seed, tuning);
  const log = { clears: [], wishCoins: 0 };
  const daily = [];
  const zoneDay = { 1: 0 };
  for (let d = 0; d < days; d++) {
    for (const hr of hours) {
      const target = T0 + d * 24 * HOUR + (hr - 7) * HOUR;
      if (clock.now() < target) clock.t = target;
      meta.arrive();
      if (state.gift) meta.claimGift();
      if (state.visitor) while (state.visitor) meta.bonkVisitor();
      for (const k of ['crate', 'vault']) if (meta.chestState(k).ready) meta.openChest(k);
      spend(meta, log);
      tidy(meta);
      grantWish(meta, log);
      for (let i = 0; i < raids; i++) {
        meta.useBest();
        const r = meta.raid();
        clock.t += 5 * 60 * 1000;
        for (const z of r.zones) zoneDay[z.zone] = d + 1;
        spend(meta, log);
        for (const k of ['crate', 'vault']) if (meta.chestState(k).ready) meta.openChest(k);
        tidy(meta);
        meta.tick();
        grantWish(meta, log);
      }
    }
    const sq = meta.squadPeople();
    const homes = HOME_TIERS.map(() => 0);
    for (const p of sq) homes[tierOf(p.level)]++;
    daily.push({
      day: d + 1,
      raids: state.raids,
      zone: state.zone,
      lots: meta.lotCount(),
      cap: meta.landCap(),
      people: state.people.length,
      squadLv: sq.reduce((a, p) => a + p.level, 0) / Math.max(1, sq.length),
      squadHome: HOME_TIERS[tierOf(Math.round(sq.reduce((a, p) => a + p.level, 0) / Math.max(1, sq.length)))].name,
      landmarks: state.town.stats.landmarks,
      decor: state.objects.filter((o) => o.kind === 'decor').length,
      wishes: state.town.stats.wishes,
      junk: state.town.stats.junk,
      trunks: state.town.stats.trunks,
      earned: state.stats.coinsEarned,
      land: state.town.stats.landCoins,
      campers: meta.campers().length,
      objects: state.objects.length,
    });
  }
  return { daily, clears: log.clears, zoneDay, state, meta, wishCoins: log.wishCoins };
}
