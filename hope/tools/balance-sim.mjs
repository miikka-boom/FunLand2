// Hope Street balance check: a simulated player (tools/player.mjs) plays days of
// sessions with runs decided by the odds. Prints when each building is reclaimed.
//
//   npm run hope:balance              one seed, detailed
//   npm run hope:balance -- 20        20 seeds, the spread of runs to seal the street

import { CHAINS, BUILDINGS, BUILDING_INDEX } from '../src/config.js';
import { makePlayer, oneRun, between, crewStats } from './player.mjs';

const seeds = Number(process.argv[2]) || 1;
const MAX_RUNS = 200;

function playOnce(seed, verbose) {
  const p = makePlayer({ seed });
  const { meta } = p;
  const reclaims = [];
  let i = 0;
  for (; i < MAX_RUNS && !meta.s.sealed; i++) {
    between(p, i);
    const r = oneRun(p);
    if (r.out.reclaimed) {
      const c = crewStats(meta);
      reclaims.push({ chain: r.run.chain, runs: meta.s.stats.runs, day: Math.floor(i / 15) + 1, ...c, scrap: meta.s.scrap, gems: meta.s.gems });
    }
  }
  return { meta, reclaims, runs: meta.s.stats.runs };
}

if (seeds === 1) {
  const { meta, reclaims, runs } = playOnce(1, true);
  console.log('Hope Street balance: 3 sessions/day x 5 runs, story at >= 55% odds, seed 1\n');
  let prev = 0;
  for (const r of reclaims) {
    const b = BUILDINGS[BUILDING_INDEX[CHAINS[r.chain].building]];
    console.log(
      `${b.name.padEnd(15)} reclaimed after ${String(r.runs).padStart(3)} runs  (+${String(r.runs - prev).padStart(2)})  day ${r.day}  crew ${String(r.power).padStart(3)}  people ${r.people}/${r.beds}  levels ${r.levels.join(',')}  grades ${r.grades.join('')}  scrap ${r.scrap}  gems ${r.gems}`,
    );
    prev = r.runs;
  }
  const st = meta.s.stats;
  console.log(`\n${meta.s.sealed ? 'Sealed' : 'NOT sealed'} after ${runs} runs (${st.wins} survived, ${st.deaths} died, ${st.revives} revives), ~${Math.round((runs * 5) / 60)} h of play, day ${meta.s.day}`);
  console.log(`People: ${meta.s.people.length} on the street, ${st.visitors} visitors, ${st.takenIn} taken in, ${st.turnedAway} turned away, ${st.letGo} let go; ${st.injuries} injuries, ${st.levelUps} level-ups, ${st.convoys} convoys`);
  console.log(`Scrap earned ${st.earned}, upgrades ${st.upgrades}; gems earned ${st.gemsEarned}, spent ${st.gemsSpent}, left ${meta.s.gems}`);
  console.log(`Facilities: ${Object.entries(meta.s.buildings).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  const roles = {};
  for (const x of meta.s.people) roles[x.role] = (roles[x.role] || 0) + 1;
  console.log(`Roles: ${Object.entries(roles).map(([k, v]) => `${k} ${v}`).join(', ')}`);
} else {
  const all = [];
  for (let s = 1; s <= seeds; s++) all.push(playOnce(s, false));
  const runs = all.map((r) => (r.meta.s.sealed ? r.runs : Infinity)).sort((a, b) => a - b);
  const q = (f) => runs[Math.min(runs.length - 1, Math.floor(f * (runs.length - 1)))];
  console.log(`${seeds} seeds: runs to seal the street  min ${runs[0]}  p25 ${q(0.25)}  median ${q(0.5)}  p75 ${q(0.75)}  max ${runs.at(-1)}`);
  for (let c = 0; c < CHAINS.length; c++) {
    const at = all.map((r) => (r.reclaims.find((x) => x.chain === c) || { runs: Infinity }).runs).sort((a, b) => a - b);
    const b = BUILDINGS[BUILDING_INDEX[CHAINS[c].building]];
    console.log(`  ${b.name.padEnd(15)} median run ${at[Math.floor((at.length - 1) / 2)]}  (p25 ${at[Math.floor((at.length - 1) * 0.25)]}, p75 ${at[Math.floor((at.length - 1) * 0.75)]})`);
  }
}
