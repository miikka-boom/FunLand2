// A simulated player for Strays: does what the hint line says, the way a
// person would, and takes about as long over it. The tests use it to prove a
// block can always be finished; the balance tool uses it to time the days.

import { Game, SEC, MIN, HOUR, DAY } from '../src/rules.js';
import { FakeClock } from '../src/clock.js';
import { DEFAULT_TUNING, ROOMS, SOMEBODY, HERO } from '../src/config.js';

/** How long a person takes over each thing (ms). */
const TAKES = { wake: 2500, patch: 1500, grow: 5000, feed: 1800, hug: 1200, open: 3000, go: 8000, bonk: 900 };

export function newGame(seed = 1, tuning = {}, t0 = 8 * HOUR) {
  const clock = new FakeClock(t0);
  const t = { ...structuredClone(DEFAULT_TUNING), ...tuning };
  return { game: Game.start(seed, { clock, tuning: t }), clock, tuning: t };
}

/** The first boarded room that can be opened, or -1. */
export function openable(game) {
  for (let i = 0; i < ROOMS; i++) if (game.canOpen(i).ok) return i;
  return -1;
}

/**
 * Do one thing, if there is one. Returns what was done (the advice's `do`),
 * or null when there is nothing to do but wait.
 * `eager`: also open a room ahead of time when the cans allow it.
 */
export function step(game, clock, { eager = true, log = null } = {}) {
  game.tick();
  const a = game.advice();
  const note = (what, res) => {
    clock.warp(TAKES[what] || 1000);
    if (log) log.push({ at: clock.now(), what, ...res });
    return what;
  };
  switch (a.do) {
    case 'wake':
      return note('wake', game.wake(a.id));
    case 'patch':
      return note('patch', game.patch(a.id));
    case 'grow':
      return note('grow', game.grow(a.id));
    case 'feed':
      return note('feed', game.feed(a.id));
    case 'hug':
      return note('hug', game.hug(a.id));
    case 'open':
      return note('open', game.open(openable(game)));
    case 'go':
      return note('go', game.goOut(a.id));
    case 'bonk':
      return note('bonk', game.bonk());
    default: {
      // Nothing is asking. With cans to spare, get the next room ready.
      const price = game.price();
      const mouths = game.residents().filter((p) => p.stage < HERO).length;
      if (eager && price != null && game.s.cans >= price + mouths && game.freeRoom() < 0 && openable(game) >= 0) {
        return note('open', game.open(openable(game)));
      }
      return null;
    }
  }
}

/**
 * One sitting: do everything there is to do; when it runs dry, wait for the
 * next thing as long as it is at most `patience` away and the sitting isn't
 * over. Returns how many things were done.
 */
export function sitting(game, clock, { maxMs = 5 * MIN, patience = 45 * SEC, eager = true, log = null } = {}) {
  const end = clock.now() + maxMs;
  let done = 0;
  for (let guard = 0; guard < 5000 && clock.now() < end; guard++) {
    if (step(game, clock, { eager, log })) {
      done++;
      continue;
    }
    const at = game.nextAt();
    if (at == null || at - clock.now() > patience || at > end) break;
    clock.warp(at - clock.now());
  }
  return done;
}

/** When, in a day, each kind of player picks the toy up (hours), and for how long (minutes). */
export const HABITS = {
  // Three looks a day: breakfast, lunch, evening.
  casual: { first: 8, hours: [8, 13, 20], minutes: 4, patience: 30 * SEC },
  // Every couple of hours while awake.
  keen: { first: 12, hours: [8, 10, 12, 14, 16, 18, 20, 22], minutes: 5, patience: 60 * SEC },
  // Can't put it down on day one, then hourly.
  binge: { first: 25, hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22], minutes: 6, patience: 2 * MIN },
};

/**
 * Play `days` days the way a habit says. Returns the milestones, as hours
 * since the first tap: { shown: [h, ...], rooms: [h, ...], heroes: [h, ...],
 * full, allHeroes, ... }.
 */
export function playDays(seed, habit, days, tuning = {}) {
  const h = HABITS[habit];
  const { game, clock } = newGame(seed, tuning, h.hours[0] * HOUR);
  const t0 = clock.now();
  const out = { shown: [], rooms: [0], heroes: [], full: null, allHeroes: null, sittings: 0, things: 0, dry: 0 };
  const hours = () => (clock.now() - t0) / HOUR;
  const look = () => {
    const tally = game.tally();
    while (out.shown.length < tally.somebodies + tally.heroes) out.shown.push(hours());
    while (out.rooms.length < tally.rooms) out.rooms.push(hours());
    while (out.heroes.length < tally.heroes) out.heroes.push(hours());
    if (tally.full && out.full == null) out.full = hours();
    if (tally.allHeroes && out.allHeroes == null) out.allHeroes = hours();
  };
  let first = true;
  for (let d = 0; d < days; d++) {
    for (const hr of h.hours) {
      const start = d * DAY + hr * HOUR;
      if (clock.now() < start) clock.warp(start - clock.now());
      const end = clock.now() + (first ? h.first : h.minutes) * MIN;
      first = false;
      out.sittings++;
      let did = 0;
      for (let guard = 0; guard < 5000 && clock.now() < end; guard++) {
        if (step(game, clock)) {
          did++;
          look();
          continue;
        }
        const at = game.nextAt();
        if (at == null || at - clock.now() > h.patience || at > end) break;
        clock.warp(at - clock.now());
      }
      out.things += did;
      if (!did) out.dry++;
      if (out.allHeroes != null) break;
    }
    if (out.allHeroes != null) break;
  }
  out.cans = game.s.cans;
  out.found = game.s.stats.cans;
  out.meals = game.s.stats.meals;
  out.trips = game.s.trips;
  out.bonks = game.s.bonks;
  out.kinds = game.residents().filter((p) => p.stage >= SOMEBODY).map((p) => p.kind);
  out.game = game;
  return out;
}
