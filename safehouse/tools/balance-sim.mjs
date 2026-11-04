// Balance check: a scripted player plays the Safehouse and the log shows how
// the campaign goes. Run: npm run safehouse:balance
// Options: --sessions=3 (per day) --missions=4 (per session) --days=5 --seed=1 --verbose=1

import { Safehouse, newState, CRAFTERS } from '../src/economy.js';
import { FakeClock } from '../src/clock.js';
import { STATION_ORDER, MISSIONS } from '../src/config.js';
import { mulberry32 } from '../src/util.js';
import { fmtTime } from '../src/format.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const SESSIONS = Number(args.sessions || 3);
const PER = Number(args.missions || 4);
const DAYS = Number(args.days || 5);
const SEED = Number(args.seed || 1);
const VERBOSE = Number(args.verbose || 0);

const clock = new FakeClock(Date.UTC(2026, 0, 5, 8, 0, 0));
const t0 = clock.now();
const sh = new Safehouse(newState(t0), { clock, rng: mulberry32(SEED) });
const when = () => fmtTime((clock.now() - t0) / 1000);
const done = {};

/** A check-in: craft what's missing, start the cheapest useful upgrade. */
function checkIn() {
  sh.tick();
  for (const id of CRAFTERS) if (sh.craftInfo(id).canStart) sh.startCraft(id);
  const order = sh.hint().focus !== 'play' ? [sh.hint().focus, ...STATION_ORDER] : STATION_ORDER;
  for (const id of order) {
    if (!STATION_ORDER.includes(id)) continue;
    const u = sh.upgradeInfo(id);
    if (u.canStart) {
      sh.startUpgrade(id);
      if (VERBOSE) console.log(`${when().padStart(8)}  build ${id} -> ${u.next}`);
      break;
    }
  }
}

for (let day = 0; day < DAYS; day++) {
  for (let s = 0; s < SESSIONS; s++) {
    const at = t0 + day * 86400e3 + s * Math.round((14 * 3600e3) / Math.max(1, SESSIONS - 1 || 1));
    if (at > clock.now()) clock.t = at;
    for (let m = 0; m < PER; m++) {
      checkIn();
      const odds = sh.odds();
      const r = sh.planMission();
      clock.advance(r.report.seconds * 1000);
      sh.tick();
      const sum = sh.applyMission(r.report);
      if (VERBOSE) console.log(`${when().padStart(8)}  ${r.report.replay ? 'replay' : 'play  '} ${r.loadout.mission.name.padEnd(16)} ${r.report.won ? 'clear' : `wiped after ${r.report.rooms}`}  +${r.report.scrap} scrap  odds ${Math.round(odds * 100)}%  strength ${r.loadout.strength}`);
      if (sum.firstClear) done[r.report.missionId] = { t: when(), missions: sh.s.stats.missions };
      checkIn();
      clock.advance(60e3);
    }
  }
}

console.log(`Safehouse balance: ${DAYS} days, ${SESSIONS} sessions a day, ${PER} missions each, seed ${SEED}\n`);
for (const m of MISSIONS) {
  const d = done[m.id];
  console.log(`${String(m.index + 1).padStart(2)}. ${m.name.padEnd(16)} ch ${m.chapter}  danger ${String(m.danger).padStart(3)}  ${d ? `cleared at ${d.t.padStart(8)} (mission ${d.missions})` : 'not cleared'}`);
}
const s = sh.s;
console.log(`\nMissions ${s.stats.missions} (${s.stats.wins} cleared, ${s.stats.wipes} wiped), Scrap ${Math.floor(s.scrap)} (earned ${s.stats.scrapEarned}), crafted ${s.stats.crafted}`);
console.log('Levels:', STATION_ORDER.map((id) => `${id} ${sh.level(id)}`).join(', '), `· strength ${sh.strength()} · home ${sh.home().join(', ')}`);
