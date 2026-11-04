// Balance simulator: plays the camp with a scripted "regular player" and
// prints when each Command Post level is reached. Run: npm run camp:balance
// Options: --days=14 --sessions=5 --runs=2 --seed=1 --rush=2 (max gems per rush)

import { Camp, newState } from '../src/economy.js';
import { FakeClock } from '../src/clock.js';
import { BUILDINGS, BUILDING_ORDER, QUESTS, TUNING_DEFAULTS, RUBBLE } from '../src/config.js';
import { mulberry32 } from '../src/util.js';
import { winChance } from '../src/run-sim.js';
import { fmtTime } from '../src/format.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const DAYS = Number(args.days || 14);
const SESSIONS = Number(args.sessions || 5); // per day, spread over 08:00-23:00
const RUNS = Number(args.runs ?? 2); // per session
const RUSH = Number(args.rush || 2); // rush when it costs at most this many gems
const SEED = Number(args.seed || 1);
const VERBOSE = Number(args.verbose || 0); // print camp events for the first N minutes

const MIN_MS = 60e3;
const clock = new FakeClock(Date.UTC(2026, 0, 1, 8, 0, 0));
const t0 = clock.now();
const camp = new Camp(newState(t0), { clock, tuning: { ...TUNING_DEFAULTS }, rng: mulberry32(SEED) });
const log = [];
let runs = 0;
let wins = 0;
let sessions = 0;

function stamp() {
  return fmtTime((clock.now() - t0) / 1000).padStart(8);
}

function act() {
  camp.tick();
  flushEvents();
  while (camp.claimQuest().ok);
  for (const k of ['short', 'long']) if (camp.rewardInfo(k).ready) camp.claimReward(k);
  camp.collectAll();
  for (const e of [...camp.s.expeditions]) if (e.end <= clock.now()) camp.collectExpedition(e.uid);
  // Builders: quest target first, then the Command Post, then the cheapest upgrade.
  for (let guard = 0; guard < 8 && camp.freeBuilders() > 0; guard++) {
    const q = camp.questInfo();
    const cands = [];
    if (q && BUILDINGS[q.def.focus]) cands.push(q.def.focus);
    if (q && RUBBLE[q.def.focus]) cands.push(q.def.focus);
    cands.push('hq');
    const rest = BUILDING_ORDER.filter((id) => id !== 'hq')
      .map((id) => ({ id, info: camp.upgradeInfo(id) }))
      .filter((x) => !x.info.maxed)
      .sort((a, b) => sum(a.info.cost) - sum(b.info.cost))
      .map((x) => x.id);
    cands.push(...rest, ...Object.keys(RUBBLE));
    let started = false;
    for (const id of cands) {
      const r = RUBBLE[id] ? camp.startClear(id) : camp.startUpgrade(id);
      if (r.ok) {
        started = true;
        break;
      }
    }
    if (!started) break;
  }
  // Rush cheap timers.
  for (const j of camp.jobs()) {
    const cost = j.kind === 'rubble' ? camp.rushClearCost(j.id) : camp.rushCost(j.id);
    if (cost <= RUSH && camp.s.gems >= cost) j.kind === 'rubble' ? camp.rushClear(j.id) : camp.rush(j.id);
  }
  // Expeditions: longest that fits.
  for (const t of camp.expeditionTypes().reverse()) if (t.unlocked) camp.startExpedition(t.id);
  // Craft.
  for (const r of camp.recipes()) if (r.unlocked) camp.startCraft(r.id);
}

function flushEvents() {
  const ev = camp.drain();
  if (!VERBOSE || clock.now() - t0 > VERBOSE * MIN_MS) return;
  for (const e of ev) {
    if (e.type === 'built') console.log(`${stamp()}  built ${e.id} ${e.level}`);
    else if (e.type === 'buildStart') console.log(`${stamp()}  start ${e.id} -> ${e.level}`);
    else if (e.type === 'run') console.log(`${stamp()}  run ${e.zone} ${e.won ? 'won' : 'died'}`);
    else if (e.type === 'cleared') console.log(`${stamp()}  cleared ${e.area}`);
    else if (e.type === 'questClaim') console.log(`${stamp()}  quest ${e.index} claimed`);
  }
}

function sum(c) {
  return Object.values(c || {}).reduce((a, b) => a + b, 0);
}

function playRun() {
  const zones = camp.zones().filter((z) => z.unlocked);
  const lo = camp.loadout();
  let best = zones[0];
  for (const z of zones) if (winChance(lo.power, z.rec) >= 0.6) best = z;
  const r = camp.planRun(best.id, { outcome: 'auto' });
  // You are away from the camp for as long as the run lasts.
  clock.advance(r.result.timeS * 1000);
  camp.tick();
  camp.applyRun(r.result);
  runs++;
  if (r.result.won) wins++;
}

const seenHq = new Set([1]);
function checkHq() {
  if (!seenHq.has(camp.hq)) {
    seenHq.add(camp.hq);
    const m = camp.s.milestones.at(-1);
    const res = Object.entries(camp.s.res).map(([k, v]) => `${k[0]}${Math.floor(v)}`).join(' ');
    log.push(`Command Post ${camp.hq}  at ${fmtTime(m.t / 1000).padStart(8)}   runs ${String(runs).padStart(3)}  gems ${String(camp.s.gems).padStart(4)}  survivors ${camp.s.survivors}/${camp.beds()}  quest ${camp.s.quest}/${QUESTS.length}  ${res} cap ${camp.storageCap()}`);
  }
}

const sessionStarts = Array.from({ length: SESSIONS }, (_, i) => 8 * 60 + Math.round((i * 15 * 60) / Math.max(1, SESSIONS - 1)));
for (let day = 0; day < DAYS; day++) {
  for (const startMin of sessionStarts) {
    const at = t0 + day * 24 * 60 * MIN_MS + (startMin - 8 * 60) * MIN_MS;
    if (at > clock.now()) clock.t = at;
    sessions++;
    // A session: manage the camp, then runs with camp check-ins between them,
    // then a few more minutes of camp.
    act();
    for (let r = 0; r < RUNS; r++) {
      playRun();
      act();
      checkHq();
      clock.advance(MIN_MS);
      act();
    }
    for (let m = 0; m < 5; m++) {
      act();
      checkHq();
      clock.advance(MIN_MS);
    }
    act();
    checkHq();
  }
}
flushEvents();

console.log(`Balance sim: ${DAYS} days, ${SESSIONS} sessions/day, ${RUNS} runs/session, rush <= ${RUSH} gems, seed ${SEED}\n`);
for (const l of log) console.log(l);
const s = camp.s;
console.log(`\nAfter ${DAYS} days: Command Post ${camp.hq}, ${runs} runs (${Math.round((wins / Math.max(1, runs)) * 100)}% survived), gems ${s.gems} (spent ${s.stats.gemsSpent}, earned ${s.stats.gemsEarned})`);
console.log('Levels:', BUILDING_ORDER.map((id) => `${id} ${camp.level(id)}`).join(', '));
console.log('Resources:', Object.entries(s.res).map(([k, v]) => `${k} ${Math.floor(v)}`).join(', '), `cap ${camp.storageCap()}`);
console.log(`Objectives done: ${s.quest}/${QUESTS.length}`);
