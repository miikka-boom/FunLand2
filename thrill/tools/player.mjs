// A simulated Thrill Hill player for the balance tool and the tests.
//
// Plays SESSIONS a day at fixed hours. Each session: open every ready chest,
// level up whoever is READY (squad first) while coins last, upgrade buildings
// (the squad's rides first, then the chests, then the Big Top), take the BEST
// squad and play RAIDS raids. 'lazy' never levels or builds (it still opens
// chests and plays), to check that a stalled player can still climb.

import { Meta, newState } from '../src/meta.js';
import { FakeClock } from '../src/clock.js';
import { TUNING_DEFAULTS, CLASSES, ZONES } from '../src/config.js';

const HOUR = 3600 * 1000;
const T0 = Date.UTC(2026, 0, 5, 7, 0, 0); // a Monday, 07:00

export function makeGame(seed, tuning = {}) {
  const clock = new FakeClock(T0);
  const state = newState(T0, seed);
  const meta = new Meta(state, { clock, tuning: { ...TUNING_DEFAULTS, ...tuning } });
  return { meta, clock, state };
}

function spend(meta) {
  const s = meta.s;
  let did = true;
  while (did) {
    did = false;
    const order = [...meta.squadPeople(), ...s.people.filter((p) => !meta.inSquad(p.id))];
    for (const p of order) {
      if (meta.canLevel(p)) {
        meta.levelUp(p.id);
        did = true;
        break;
      }
    }
    if (did) continue;
    const rides = [...new Set(meta.squadPeople().map((p) => CLASSES[p.cls].ride))];
    for (const id of [...rides, 'crate', 'vault', 'bigtop', 'striker', 'gallery', 'tent', 'garage']) {
      if (meta.canUpgrade(id).ok) {
        meta.upgrade(id);
        did = true;
        break;
      }
    }
  }
}

/**
 * Simulate `days` of play. Returns { zones: [{ zone, raid, day, three, threeLeave }], final, samples }.
 * three = the 3-crown chance with the best squad on arrival in the zone; threeLeave = the
 * same just before leaving it.
 */
export function simulate({ seed = 1, days = 7, hours = [8, 12, 18, 22], raids = 4, strategy = 'normal', tuning = {} } = {}) {
  const { meta, clock, state } = makeGame(seed, tuning);
  const zones = [{ zone: 1, raid: 0, day: 0, three: null, threeLeave: null }];
  const daily = [];
  let lastThree = null;
  for (let d = 0; d < days; d++) {
    for (const hr of hours) {
      const target = T0 + d * 24 * HOUR + (hr - 7) * HOUR;
      if (clock.now() < target) clock.t = target;
      meta.arrive();
      if (state.gift) meta.claimGift();
      for (const k of ['crate', 'vault']) if (meta.chestState(k).ready) meta.openChest(k);
      if (strategy !== 'lazy') spend(meta);
      for (let i = 0; i < raids; i++) {
        meta.useBest();
        const pre = meta.raidPreview();
        if (zones[zones.length - 1].three === null) {
          zones[zones.length - 1].three = pre.three;
          zones[zones.length - 1].S = pre.S;
        }
        lastThree = pre.three;
        const r = meta.raid();
        clock.t += 5 * 60 * 1000; // a raid takes a few minutes of real life
        for (const z of r.zones) {
          zones[zones.length - 1].threeLeave = lastThree;
          zones.push({ zone: z.zone, raid: state.raids, day: d + 1, three: null, threeLeave: null });
        }
        if (strategy !== 'lazy') spend(meta);
        for (const k of ['crate', 'vault']) if (meta.chestState(k).ready) meta.openChest(k);
      }
    }
    const sq = meta.squadPeople();
    daily.push({
      day: d + 1,
      raids: state.raids,
      skulls: state.skulls,
      zone: state.zone,
      people: state.people.length,
      squadLv: sq.reduce((a, p) => a + p.level, 0) / Math.max(1, sq.length),
      buildings: { ...state.buildings },
      coins: state.coins,
      earned: state.stats.coinsEarned,
      chests: { ...state.stats.chests },
      crowns: state.stats.crowns.slice(),
      grades: state.stats.grades.slice(),
      newcomers: { ...state.stats.newcomers },
      three: meta.raidPreview(meta.bestSquad().ids).three,
    });
  }
  return { zones, daily, state, meta };
}

export { ZONES };
