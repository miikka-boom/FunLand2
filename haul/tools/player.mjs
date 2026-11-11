// A simulated Long Haul player for the balance tool and the tests.
//
// A day is SESSIONS sessions of RUNS runs, a few hours apart. In a session the
// player does what the hints say:
//   1. picks up every answered radio call (and the crate at the gate)
//   2. levels up anyone who can, squad first
//   3. sends the strongest three
//   4. plays, and opens crates at random (the picks are blind)
// `lazy` never levels anyone up or changes the squad.

import { Game, newState } from '../src/rules.js';
import { FakeClock } from '../src/clock.js';
import { TUNING_DEFAULTS, GRID, AREAS, CAST, FERRY_STARS } from '../src/config.js';
import { mulberry32, mean } from '../src/util.js';

const T0 = Date.UTC(2026, 0, 5, 7, 0, 0);
const HOUR = 3600 * 1000;

export function makeGame(seed = 1, tuning = {}) {
  const clock = new FakeClock(T0);
  const state = newState(T0, seed);
  const game = new Game(state, { clock, tuning: { ...TUNING_DEFAULTS, ...tuning } });
  return { game, clock, state };
}

/** Everything a player does between runs. Returns what happened. */
export function tend(game, { lazy = false } = {}) {
  const out = { calls: [], levels: [], gift: null, swaps: [] };
  while (game.answered() > 0) out.calls.push(game.answer());
  if (game.s.gift) out.gift = game.takeGift();
  if (lazy) return out;
  for (let guard = 0; guard < 100; guard++) {
    const ready = game.readyList();
    if (!ready.length) break;
    // The squad first, weakest first; then the bench.
    const squad = ready.filter((id) => game.s.squad.includes(id)).sort((a, b) => game.power(a) - game.power(b));
    out.levels.push(game.levelUp(squad[0] || ready[0]));
  }
  out.swaps = game.useBest();
  return out;
}

/** Open the haul's crates at random. */
export function pickAll(game, rng) {
  const h = game.s.haul;
  const got = [];
  if (!h) return got;
  while (h.picked.length < h.picks) {
    const free = [];
    for (let i = 0; i < GRID; i++) if (!h.picked.includes(i)) free.push(i);
    got.push(game.pick(free[Math.floor(rng() * free.length)]));
  }
  game.finishHaul();
  return got;
}

/**
 * Play `days` days from a fresh save. Returns one row per run, one per day,
 * and when things first happened.
 */
export function simulate({ seed = 1, days = 10, sessions = 4, runs = 4, gap = 4, night = 12, runMinutes = 4, lazy = false, tuning = {} } = {}) {
  const { game, clock, state: s } = makeGame(seed, tuning);
  const rng = mulberry32(seed * 7919 + 13);
  const rows = [];
  const dayRows = [];
  const first = {};
  const arrivals = []; // { area, run, day, expected }
  const leaving = {}; // area -> expected stars on the last run there
  const found = {}; // id -> { call, run, day }
  let rackFull = 0;
  let short = 0; // runs started with a full bar in the squad and not enough supplies for it
  let run = 0;
  const mark = (k, v) => {
    if (first[k] == null) first[k] = v;
  };
  const note = (t, day) => {
    for (const c of t.calls) {
      if (c.isNew) {
        found[c.id] = { call: s.calls, run, day };
        mark('newcomer', run);
        if (c.rarity === 'legendary') mark('legendary', run);
        if (c.rarity === 'epic') mark('epic', run);
      }
    }
    if (t.levels.length) mark('levelUp', run);
  };
  for (let day = 1; day <= days; day++) {
    for (let k = 0; k < sessions; k++) {
      clock.warp((k === 0 && day > 1 ? night : k === 0 ? 0 : gap) * HOUR);
      game.comeBack();
      for (let r = 0; r < runs; r++) {
        note(tend(game, { lazy }), day);
        while (game.pendingArea() != null) {
          const a = game.arrive();
          arrivals.push({ area: a.area, run, day, expected: null });
        }
        // A new stop: note the odds on the first run there, with the squad as it now is.
        const here = game.areaIndex();
        const arr = arrivals.find((x) => x.area === here && x.expected == null);
        if (arr) arr.expected = game.expectedStars();
        leaving[here] = game.expectedStars();
        if (game.rackRoom() <= 0) rackFull++;
        if (s.squad.some((id) => game.levelInfo(id).ready && !game.levelInfo(id).hasSupplies)) short++;
        const expected = game.expectedStars();
        const res = game.play();
        clock.warp(runMinutes * 60 * 1000);
        run++;
        const got = pickAll(game, rng);
        if (got.some((g) => g.radio)) mark('radio', run);
        if (s.stars >= FERRY_STARS) mark('ferry', run);
        if (game.owned().some((id) => s.cast[id].level >= 10)) mark('lv10', run);
        rows.push({
          run,
          day,
          area: res.area,
          stars: res.stars,
          expected,
          total: s.stars,
          supplies: s.supplies,
          people: game.owned().length,
          squadLv: mean(s.squad.map((id) => s.cast[id].level)),
          squadPower: game.squadPower(),
          rack: s.rack.length,
        });
      }
      note(tend(game, { lazy }), day);
    }
    dayRows.push({
      day,
      runs: run,
      area: game.areaIndex(),
      stars: s.stars,
      people: game.owned().length,
      squadLv: mean(s.squad.map((id) => s.cast[id].level)),
      earned: s.stats.earned,
      spent: s.stats.spent,
      supplies: s.supplies,
      radios: s.stats.radios,
      calls: s.calls,
      byStars: [...s.stats.stars],
      ready: game.owned().filter((id) => game.levelInfo(id).ready && !game.levelInfo(id).hasSupplies).length,
    });
  }
  return { rows, dayRows, first, arrivals, leaving, found, rackFull, short, state: s, game };
}

export { AREAS, CAST };
