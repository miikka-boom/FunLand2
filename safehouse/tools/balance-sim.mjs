// Balance simulator: plays the Safehouse with a scripted regular player and
// prints when each progression stage completes, next to the design doc's
// typical timing. Run: npm run safehouse:balance
// Options: --days=40 --sessions=3 --missions=1 --seed=1 --skill=1 --friend=veteran --verbose=1

import { Safehouse, newState } from '../src/economy.js';
import { FakeClock } from '../src/clock.js';
import { STAGES, STATION_ORDER, SLOTS, TUNING_DEFAULTS, CHAPTERS } from '../src/config.js';
import { mulberry32 } from '../src/util.js';
import { fmtTime } from '../src/format.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const DAYS = Number(args.days || 40);
const SESSIONS = Number(args.sessions || 3); // per day, spread over 08:00-21:00
const MISSIONS = Number(args.missions ?? 1); // per session
const SEED = Number(args.seed || 1);
const SKILL = Number(args.skill || 1);
const FRIEND = args.friend || null;
const VERBOSE = Number(args.verbose || 0);

const MIN_MS = 60e3;
const DAY_MS = 24 * 60 * MIN_MS;
const clock = new FakeClock(Date.UTC(2026, 0, 5, 8, 0, 0));
const t0 = clock.now();
const sh = new Safehouse(newState(t0), { clock, tuning: { ...TUNING_DEFAULTS, skill: SKILL }, rng: mulberry32(SEED) });
if (FRIEND) sh.setFriend(FRIEND);
const PRIORITY = ['barricade', 'barracks', 'generator', 'radio', 'infirmary', 'workshop', 'armory', 'scrapyard'];
const marks = [];
let missions = 0;
let wins = 0;

const when = (t) => {
  const d = (t - t0) / DAY_MS;
  return d < 1 ? fmtTime((t - t0) / 1000) : `day ${(d + 1).toFixed(1)}`;
};
const log = (text) => {
  if (VERBOSE) console.log(`${when(clock.now()).padStart(9)}  ${text}`);
};

/**
 * Scrap/Parts to hold back. A regular player saves for the next stage goal
 * that only lacks resources, and always keeps Parts for the next Barricade
 * level (the main gate), since Parts only come from missions.
 */
function reserve() {
  const keep = { scrap: 0, parts: 0 };
  const st = sh.stageInfo();
  if (st) {
    for (const g of st.goals) {
      if (g.done || !g.g.level) continue;
      const info = sh.upgradeInfo(g.g.level[0]);
      if (info.maxed) continue;
      if (info.blockers.every((b) => b.type === 'resources' || b.type === 'slots')) {
        keep.scrap = info.cost.scrap || 0;
        keep.parts = info.cost.parts || 0;
        break;
      }
    }
  }
  const b = sh.upgradeInfo('barricade');
  if (sh.barricade >= 3 && !b.maxed) keep.parts = Math.max(keep.parts, b.cost.parts || 0);
  return keep;
}

function affordableWith(cost, keep) {
  return (sh.s.res.scrap - (cost.scrap || 0) >= keep.scrap) && (sh.s.res.parts - (cost.parts || 0) >= keep.parts);
}

function checkIn() {
  sh.tick();
  for (const o of [...sh.orders()]) if (o.done) sh.claimOrder(o.uid);
  if (sh.level('scrapyard')) sh.collectYard();
  // Builds: stage goals first, then by priority, keeping the next goal affordable.
  for (let guard = 0; guard < 6 && sh.freeSlots() > 0; guard++) {
    const st = sh.stageInfo();
    const goals = st ? st.goals.filter((g) => !g.done && g.g.level).map((g) => g.g.level[0]) : [];
    const keep = reserve();
    let started = false;
    for (const id of [...goals, ...PRIORITY]) {
      const info = sh.upgradeInfo(id);
      if (!info.canStart) continue;
      if (!goals.includes(id) && !affordableWith(info.cost, keep)) continue;
      sh.startUpgrade(id);
      log(`build ${id} -> ${info.next}`);
      started = true;
      break;
    }
    if (!started) break;
  }
  // Crafts: keep two of the best item for each slot in the crate.
  for (const slot of SLOTS) {
    const best = sh
      .itemsFor(slot)
      .map((it) => sh.recipeInfo(it.id)) // recipe ids are the item ids
      .filter((r) => r.unlocked)
      .pop();
    if (!best) continue;
    if (best.have + best.pending < 2 && best.canQueue && affordableWith(best.cost, reserve())) sh.queueCraft(best.id);
  }
  // Weapons: upgrade the gun you use when there is spare Scrap.
  const w = sh.resolvedLoadout().weapon;
  const wi = sh.weaponUpgradeInfo(w);
  if (wi.canStart && affordableWith(wi.next.cost, reserve())) sh.upgradeWeapon(w);
}

function chooseMission() {
  const special = sh.specialMissions().find((m) => sh.odds(m.id, 150).clear >= 0.6);
  if (special) return special.id;
  const next = sh.nextMission();
  if (!sh.s.won[next] && sh.odds(next, 150).clear >= 0.5) return next;
  let farm = null;
  for (const ch of sh.chapters()) for (const m of ch.missions) if (m.open && m.wins > 0 && sh.odds(m.id, 150).clear >= 0.75) farm = m.id;
  return farm || next;
}

function playMission() {
  const id = chooseMission();
  const r = sh.planMission(id);
  clock.advance(r.report.timeS * 1000); // the Safehouse keeps going while you play
  sh.tick();
  const sum = sh.applyMission(r.report);
  missions++;
  if (r.report.won) wins++;
  log(`mission ${id} ${r.report.won ? 'cleared' : `wiped after ${r.report.sectionsCleared}`}  power ${r.report.power}${sum.chapterCleared ? `  CHAPTER ${sum.chapterCleared} CLEARED` : ''}`);
}

function record() {
  for (const e of sh.drain()) {
    if (e.type === 'stage') marks.push({ kind: 'stage', index: e.index, t: e.t ?? clock.now(), missions });
    if (e.type === 'chapter') marks.push({ kind: 'chapter', n: e.n, t: clock.now(), missions, power: sh.missionLoadout('c1m1').power });
    if (e.type === 'movedIn' || (e.type === 'rescued' && !e.waiting)) marks.push({ kind: 'survivor', id: e.id, t: e.t ?? clock.now(), missions });
  }
}

const starts = Array.from({ length: SESSIONS }, (_, i) => Math.round(SESSIONS === 1 ? 12 * 60 : 8 * 60 + (i * 13 * 60) / (SESSIONS - 1)));
for (let day = 0; day < DAYS; day++) {
  for (const startMin of starts) {
    const at = t0 + day * DAY_MS + (startMin - 8 * 60) * MIN_MS;
    if (at > clock.now()) clock.t = at;
    checkIn();
    record();
    for (let m = 0; m < MISSIONS; m++) {
      playMission();
      checkIn();
      record();
    }
    clock.advance(MIN_MS);
    checkIn();
    record();
  }
}

console.log(`Safehouse balance sim: ${DAYS} days, ${SESSIONS} sessions/day x ${MISSIONS} mission(s), skill ${SKILL}${FRIEND ? `, with a ${FRIEND} friend` : ', solo'}, seed ${SEED}\n`);
console.log('Stage                     done at      missions   doc timing');
for (const m of marks.filter((x) => x.kind === 'stage')) {
  const def = STAGES[m.index - 1];
  console.log(`${String(m.index).padStart(2)}. ${def.name.padEnd(20)}  ${when(m.t).padStart(9)}   ${String(m.missions).padStart(6)}     ${def.when}`);
}
const chapters = marks.filter((x) => x.kind === 'chapter').map((m) => `${m.n}: ${when(m.t)} (power ${m.power})`);
console.log(`\nChapters cleared  ${chapters.join(' · ')}`);
const surv = marks.filter((x) => x.kind === 'survivor').map((m) => `${m.id} ${when(m.t)}`);
console.log(`Survivors housed  nadia start · ${surv.join(' · ')}`);
const s = sh.s;
console.log(`\nAfter ${DAYS} days: ${missions} missions (${Math.round((wins / Math.max(1, missions)) * 100)}% cleared), ${sh.chaptersCleared()}/${CHAPTERS.length} chapters, stage ${s.stage}/${STAGES.length}`);
console.log('Stations:', STATION_ORDER.map((id) => `${id} ${sh.level(id)}`).join(', '));
console.log('Wallet:', Object.entries(s.res).map(([k, v]) => `${k} ${Math.floor(v)}`).join(', '), `(overflow to Scrap: ${s.stats.overflowScrap})`);
console.log(`Crafted ${s.stats.crafted}, items used ${s.stats.itemsUsed}, Fuel spent ${s.stats.fuelSpent}, yard Scrap ${s.stats.yardScrap}, orders ${s.stats.ordersDone}`);
console.log('Weapons:', Object.entries(s.weapons).map(([k, v]) => `${k} Mk ${v}`).join(', '), `· squad power now ${sh.missionLoadout(sh.nextMission()).power}`);
console.log('Bonds:', sh.housed().map((id) => `${id} ${sh.bondLevel(id)}`).join(', '));
