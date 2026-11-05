// Station 9 balance check: a simulated player (tools/player.mjs) plays sessions with
// runs decided by the odds. Prints when each building comes back.
//
//   npm run station9:balance           one seed, detailed
//   npm run station9:balance -- 20     20 seeds, the spread

import { CHAINS, BUILDINGS, BUILDING_INDEX } from '../src/config.js';
import { makePlayer, oneRun, between } from './player.mjs';

const seeds = Number(process.argv[2]) || 1;

function playOnce(seed) {
  const p = makePlayer({ seed });
  const { meta } = p;
  const back = [];
  for (let i = 0; i < 150 && !meta.s.sealed; i++) {
    between(p, i);
    const { run, out } = oneRun(p);
    if (out.reclaimed) {
      const crew = meta.bestCrew(meta.nextRun());
      back.push({ chain: run.chain, runs: meta.s.stats.runs, power: meta.crewPower(crew, meta.nextRun()), people: meta.s.people.length, beds: meta.beds(), levels: meta.roster().slice(0, 4).map((x) => x.level), scrap: meta.s.scrap });
    }
  }
  return { meta, back };
}

const name = (c) => BUILDINGS[BUILDING_INDEX[CHAINS[c].building]].name;
if (seeds === 1) {
  const { meta, back } = playOnce(1);
  console.log('Station 9 balance: always plays the next run with the best crew, seed 1\n');
  let prev = 0;
  for (const b of back) {
    console.log(`${name(b.chain).padEnd(15)} back after ${String(b.runs).padStart(3)} runs (+${String(b.runs - prev).padStart(2)})  crew power ${String(b.power).padStart(3)}  people ${b.people}/${b.beds}  levels ${b.levels.join(',')}  scrap ${b.scrap}`);
    prev = b.runs;
  }
  const st = meta.s.stats;
  console.log(`\n${meta.s.sealed ? 'Sealed' : 'NOT sealed'} after ${st.runs} runs (${st.wins} won, ${st.losses} lost), ~${Math.round((st.runs * 5) / 60 * 10) / 10} h of play`);
  console.log(`People ${meta.s.people.length}, visitors ${st.visitors}, taken in ${st.takenIn}, sent away ${st.sentAway}, rests ${st.rests}, level-ups ${st.levelUps}, convoys ${st.convoys}, upgrades ${st.upgrades}, scrap earned ${st.earned}`);
  console.log(`Buildings: ${Object.entries(meta.s.buildings).map(([k, v]) => `${k} ${v}`).join(', ')}`);
} else {
  const all = [];
  for (let s = 1; s <= seeds; s++) all.push(playOnce(s));
  const runs = all.map((r) => (r.meta.s.sealed ? r.meta.s.stats.runs : Infinity)).sort((a, b) => a - b);
  const q = (f) => runs[Math.min(runs.length - 1, Math.floor(f * (runs.length - 1)))];
  const losses = all.map((r) => r.meta.s.stats.losses).sort((a, b) => a - b);
  console.log(`${seeds} seeds: runs to seal the street  min ${runs[0]}  p25 ${q(0.25)}  median ${q(0.5)}  p75 ${q(0.75)}  max ${runs.at(-1)}  (median losses ${losses[Math.floor(losses.length / 2)]})`);
  for (let c = 0; c < CHAINS.length; c++) {
    const at = all.map((r) => (r.back.find((x) => x.chain === c) || { runs: Infinity }).runs).sort((a, b) => a - b);
    console.log(`  ${name(c).padEnd(15)} median run ${at[Math.floor((at.length - 1) / 2)]}  (p25 ${at[Math.floor((at.length - 1) * 0.25)]}, p75 ${at[Math.floor((at.length - 1) * 0.75)]})`);
  }
}
