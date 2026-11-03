// Balance simulator for Road to Evac: a scripted player who plays the next
// stop when the odds are decent, replays for supplies when stuck, buys the
// best upgrades and opens wait rewards. Prints runs/time per district.
// Run: npm run evac:balance -- --sessions=3 --runs=5 --seed=1 --play=0.55

import { Meta, newState } from '../src/meta.js';
import { FakeClock } from '../src/clock.js';
import { CAMPAIGNS, TOTAL_CHAPTERS, TUNING_DEFAULTS, SURVIVOR_ORDER, WEAPON_ORDER } from '../src/config.js';
import { mulberry32 } from '../src/util.js';
import { fmtTime } from '../src/format.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const SESSIONS = Number(args.sessions ?? 3); // per day
const RUNS = Number(args.runs ?? 5); // per session
const SEED = Number(args.seed ?? 1);
const PLAY_AT = Number(args.play ?? 0.55); // go for the next stop at this win chance
const RUN_MIN = 6; // minutes per run in the real game
const DAYS = Number(args.days ?? 30);

const clock = new FakeClock(Date.UTC(2026, 0, 1, 9));
const t0 = clock.now();
const tuning = { ...TUNING_DEFAULTS };
for (const k of ['difficulty', 'supplies', 'costs']) if (args[k]) tuning[k] = Number(args[k]);
const meta = new Meta(newState(t0), { clock, tuning, rng: mulberry32(SEED) });
const QUIET = !!args.quiet;
const s = meta.s;
let runs = 0;
const rows = [];
let lastLog = 0;

function bestLoadout() {
  let main = s.main;
  for (const id of meta.rescued()) if (s.survivors[id] > s.survivors[main]) main = id;
  let weapon = s.weapon;
  for (const id of meta.found()) if (meta.weaponPower(id) > meta.weaponPower(weapon)) weapon = id;
  meta.setMain(main);
  meta.setWeapon(weapon);
}

function shop() {
  bestLoadout();
  for (let k = 0; k < 50; k++) {
    const u = meta.bestUpgrade();
    if (!u) break;
    meta.upgrade(u.kind, u.id);
    bestLoadout();
  }
}

function claims() {
  for (const k of ['short', 'long']) if (meta.rewardInfo(k).ready) meta.claimReward(k);
}

function oneRun() {
  shop();
  const next = meta.playTarget();
  let target = next;
  if (!s.evac && meta.oddsFor(next).chance < PLAY_AT) {
    const r = meta._bestReplay();
    if (r !== null && meta.oddsFor(r).chance > 0.5) target = r;
  }
  const plan = meta.planRun(target);
  const res = plan.result;
  if (!res.won && meta.canRevive(res) && s.gems >= 25 && target === next) meta.revive(res);
  meta.applyRun(res);
  runs++;
  clock.advance(RUN_MIN * 60e3);
  claims();
  if (s.log.length > lastLog) {
    const l = s.log.at(-1);
    lastLog = s.log.length;
    rows.push(
      `${CAMPAIGNS[l.campaign].name.padEnd(15)} cleared after ${String(l.runs).padStart(3)} runs  (+${String(l.runs - (rows.lastRuns || 0)).padStart(2)})  day ${Math.floor((clock.now() - t0) / 864e5) + 1}  power ${meta.power().total}  gems ${s.gems}  supplies left ${s.supplies}`,
    );
    rows.lastRuns = l.runs;
  }
}

const sessionStarts = Array.from({ length: SESSIONS }, (_, i) => Math.round((i * 12 * 60) / Math.max(1, SESSIONS - 1)));
outer: for (let day = 0; day < DAYS; day++) {
  for (const startMin of sessionStarts) {
    const at = t0 + day * 864e5 + startMin * 60e3;
    if (at > clock.now()) clock.t = at;
    claims();
    for (let r = 0; r < RUNS; r++) {
      oneRun();
      if (s.evac) break outer;
    }
  }
}

if (QUIET) {
  const per = rows.map((r) => r.match(/\(\+\s*(\d+)\)/)[1]).join('/');
  console.log(`d=${tuning.difficulty} s=${tuning.supplies} c=${tuning.costs}: ${s.evac ? 'evac' : 'NOT'} ${runs} runs [${per}] deaths ${s.stats.deaths}`);
  process.exit(0);
}
console.log(`Road to Evac balance: ${SESSIONS} sessions/day x ${RUNS} runs, play the next stop at >= ${Math.round(PLAY_AT * 100)}% odds, seed ${SEED}\n`);
for (const r of rows) console.log(r);
const st = s.stats;
console.log(`\n${s.evac ? 'Evac reached' : 'Not finished'} after ${runs} runs (${st.wins} survived, ${st.deaths} died, ${st.revives} revives), ~${fmtTime(runs * RUN_MIN * 60)} of play`);
console.log(`Stars ${s.stars.reduce((a, b) => a + b, 0)}/${TOTAL_CHAPTERS * 3}, upgrades bought ${st.upgrades}, supplies earned ${st.earned}, gems ${s.gems} (earned ${st.gemsEarned}, spent ${st.gemsSpent})`);
console.log('Survivors:', SURVIVOR_ORDER.map((id) => `${id} ${s.survivors[id]}`).join(', '));
console.log('Weapons:  ', WEAPON_ORDER.map((id) => `${id} ${s.weapons[id]}`).join(', '));
