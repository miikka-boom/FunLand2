import test from 'node:test';
import assert from 'node:assert/strict';
import { Safehouse, newState, nextMidnight } from '../safehouse/src/economy.js';
import { FakeClock } from '../safehouse/src/clock.js';
import { migrate } from '../safehouse/src/save.js';
import { STATIONS, RECIPES, CRATE_MAX, RES_INFO, OVERFLOW_RATE, ORDERS, BOND, TUNING_DEFAULTS, MIN, HOUR, DAY } from '../safehouse/src/config.js';
import { mulberry32 } from '../safehouse/src/util.js';

const T0 = Date.UTC(2026, 10, 3, 9, 0, 0);
const S = 1000;

function make(mutate, tuning = {}) {
  const clock = new FakeClock(T0);
  const state = newState(T0);
  if (mutate) mutate(state);
  const sh = new Safehouse(state, { clock, tuning: { ...TUNING_DEFAULTS, ...tuning }, rng: mulberry32(11) });
  return { sh, clock, state };
}

function rich(s) {
  s.res = { scrap: 1e6, parts: 1e6, supplies: 1e6, fuel: 1e6 };
}

/** Set station levels directly (tests only). */
function levels(s, map) {
  for (const [id, l] of Object.entries(map)) s.stations[id].level = l;
}

/** Mark story chapters 1..n cleared. */
function clearChapters(s, n) {
  for (let c = 1; c <= n; c++) for (let m = 1; m <= 3; m++) s.won[`c${c}m${m}`] = 1;
}

/** Start an upgrade and let its timer run out. */
function finish(sh, clock, id) {
  const r = sh.startUpgrade(id);
  assert.ok(r.ok, `startUpgrade(${id}) failed: ${r.reason}`);
  clock.warp(Math.max(0, r.end - clock.now()));
  sh.tick();
}

// --- Start and stage 1 -----------------------------------------------------------------

test('a new Safehouse has a pre-built Barracks, Nadia in her bunk and enough Scrap for the Barricade and Generator', () => {
  const { sh, state } = make();
  assert.equal(sh.level('barracks'), 1);
  assert.deepEqual(sh.housed(), ['nadia']);
  assert.equal(sh.stationState('workshop'), 'locked');
  const need = STATIONS.barricade.levels[0].cost.scrap + STATIONS.generator.levels[0].cost.scrap;
  assert.ok(state.res.scrap >= need);
  assert.equal(sh.stageInfo().next.text, 'Board up the Barricade');
});

test('level 1 builds are instant and do not need a free build slot', () => {
  const { sh } = make((s) => {
    rich(s);
    clearChapters(s, 3);
    levels(s, { barricade: 1, workshop: 1 });
  });
  assert.ok(sh.startUpgrade('workshop').ok); // Lv 2: a 10 min timer in the only slot
  assert.equal(sh.freeSlots(), 0);
  assert.equal(sh.upgradeInfo('barracks').blockers[0].type, 'slots');
  assert.ok(sh.startUpgrade('generator').ok); // Lv 1: instant
  assert.equal(sh.level('generator'), 1);
  assert.equal(sh.builds().length, 1);
});

test('the Barricade gate: a station can never be higher than the Barricade level + 1', () => {
  const { sh, clock } = make((s) => {
    rich(s);
    clearChapters(s, 12);
  });
  assert.ok(sh.startUpgrade('generator').ok); // Lv 1 is fine at Barricade 0
  assert.equal(sh.level('generator'), 1);
  const info = sh.upgradeInfo('generator');
  assert.equal(info.blockers[0].type, 'barricade');
  assert.equal(info.blockers[0].need, 1);
  assert.equal(sh.startUpgrade('generator').reason, 'barricade');
  finish(sh, clock, 'barricade');
  finish(sh, clock, 'generator');
  assert.equal(sh.level('generator'), 2);
  // Stations that unlock later need their Barricade level for level 1.
  assert.equal(sh.upgradeInfo('armory').blockers[0].type, 'unlock');
  assert.equal(sh.stationState('armory'), 'locked');
});

test('the campaign gate ties upgrades to chapters cleared, and the Barricade follows it too', () => {
  const { sh, clock } = make((s) => rich(s));
  finish(sh, clock, 'barricade');
  let info = sh.upgradeInfo('barricade');
  assert.deepEqual(info.blockers.map((b) => b.type), ['chapters']);
  assert.equal(info.blockers[0].need, 1);
  clearChapters(sh.s, 1);
  finish(sh, clock, 'barricade');
  assert.equal(sh.level('barricade'), 2);
  info = sh.upgradeInfo('barricade');
  assert.equal(info.blockers[0].need, 3);
});

test('build slots: one at the start, two at Barricade 3, three at Barricade 5', () => {
  const { sh } = make((s) => {
    rich(s);
    clearChapters(s, 12);
  });
  assert.equal(sh.buildSlots(), 1);
  levels(sh.s, { barricade: 3 });
  assert.equal(sh.buildSlots(), 2);
  levels(sh.s, { barricade: 5 });
  assert.equal(sh.buildSlots(), 3);
  levels(sh.s, { barricade: 2, generator: 1, barracks: 1 });
  assert.ok(sh.startUpgrade('generator').ok);
  const r = sh.startUpgrade('barracks');
  assert.equal(r.reason, 'slots');
});

test('cancelling a build refunds everything; builds need no power or Fuel', () => {
  const { sh, state } = make((s) => {
    clearChapters(s, 1);
    s.res = { scrap: 1000, parts: 50, supplies: 0, fuel: 0 };
  });
  levels(state, { barricade: 1, generator: 1 });
  const before = { ...state.res };
  const r = sh.startUpgrade('generator');
  assert.ok(r.ok, r.reason);
  assert.equal(state.res.scrap, before.scrap - STATIONS.generator.levels[1].cost.scrap);
  assert.equal(state.res.fuel, 0);
  assert.ok(sh.cancelBuild('generator').ok);
  assert.deepEqual(state.res, before);
  assert.equal(sh.builds().length, 0);
});

test('upgrades finish on a real-time timer, also while away', () => {
  const { sh, clock } = make((s) => {
    rich(s);
    clearChapters(s, 1);
  });
  levels(sh.s, { barricade: 1, workshop: 1 });
  const r = sh.startUpgrade('workshop');
  assert.ok(r.ok);
  assert.equal(r.end - T0, STATIONS.workshop.levels[1].buildSeconds * S);
  clock.warp(10 * MIN * S - 1);
  sh.tick();
  assert.equal(sh.level('workshop'), 1);
  clock.warp(1);
  sh.tick();
  assert.equal(sh.level('workshop'), 2);
  assert.ok(sh.drain().some((e) => e.type === 'built' && e.id === 'workshop' && e.level === 2));
});

// --- Resources ----------------------------------------------------------------------------

test('payouts above a soft cap convert to Scrap at half value; Scrap has no cap', () => {
  const { sh, state } = make((s) => {
    s.res = { scrap: 0, parts: 0, supplies: 0, fuel: 0 };
  });
  const capParts = sh.cap('parts');
  const capFuel = sh.cap('fuel');
  assert.equal(sh.cap('scrap'), Infinity);
  const g = sh.grant({ scrap: 5000, parts: capParts + 10, supplies: 3, fuel: capFuel + 4 });
  assert.equal(state.res.parts, capParts);
  assert.equal(state.res.fuel, capFuel);
  assert.equal(state.res.supplies, 3);
  const conv = Math.floor(10 * RES_INFO.parts.value * OVERFLOW_RATE + 4 * RES_INFO.fuel.value * OVERFLOW_RATE);
  assert.equal(g.scrap, conv);
  assert.equal(state.res.scrap, 5000 + conv);
  assert.deepEqual(g.over, { parts: 10, fuel: 4 });
});

test('caps rise with the Barricade (Parts, Supplies) and the Generator (Fuel tank)', () => {
  const { sh } = make();
  const p0 = sh.cap('parts');
  const f0 = sh.cap('fuel');
  levels(sh.s, { barricade: 2, generator: 3 });
  assert.equal(sh.cap('parts'), STATIONS.barricade.levels[1].partsCap);
  assert.ok(sh.cap('parts') > p0);
  assert.equal(sh.cap('fuel'), 70);
  assert.ok(sh.cap('fuel') > f0);
  assert.equal(sh.powerCap(), 5);
});

// --- Jobs, power and Fuel --------------------------------------------------------------------

function crafting(mutate) {
  return make((s) => {
    rich(s);
    s.res.fuel = 20;
    levels(s, { barricade: 1, generator: 1, workshop: 1, infirmary: 1 });
    if (mutate) mutate(s);
  });
}

test('starting a job spends its Fuel and draws power only while it runs', () => {
  const { sh, clock, state } = crafting();
  assert.equal(sh.powerUsed(), 0);
  const r = sh.queueCraft('pipe_bomb');
  assert.ok(r.ok);
  assert.equal(state.res.fuel, 20 - RECIPES.pipe_bomb.fuel);
  assert.equal(sh.powerUsed(), 2);
  clock.warp(RECIPES.pipe_bomb.seconds * S);
  sh.tick();
  assert.equal(sh.powerUsed(), 0);
  assert.equal(sh.crateCount('pipe_bomb'), 1);
});

test('at Generator 1 (capacity 3) an Infirmary and a Workshop craft cannot run together; the second starts when power frees up', () => {
  const { sh, clock } = crafting();
  sh.queueCraft('first_aid_kit');
  sh.queueCraft('pipe_bomb');
  const [kit] = sh.jobsAt('infirmary');
  const [bomb] = sh.jobsAt('workshop');
  assert.equal(kit.state, 'running');
  assert.equal(bomb.state, 'waiting');
  assert.equal(sh.jobStatus(bomb).state, 'power');
  // Away for an hour: the bomb starts the moment the kit finishes and both are done.
  clock.warp(HOUR * S);
  sh.tick();
  assert.equal(sh.crateCount('first_aid_kit'), 1);
  assert.equal(sh.crateCount('pipe_bomb'), 1);
  const starts = sh.drain().filter((e) => e.type === 'jobStart');
  assert.equal(starts[1].t, T0 + RECIPES.first_aid_kit.seconds * S, 'the waiting job started exactly when power freed up');
});

test('an empty tank: running jobs finish, new jobs wait, and nothing queued is lost', () => {
  const { sh, clock, state } = crafting((s) => {
    s.res.fuel = 1;
  });
  sh.queueCraft('pipe_bomb'); // takes the last Fuel
  sh.queueCraft('pipe_bomb'); // waits behind it
  assert.equal(state.res.fuel, 0);
  clock.warp(10 * MIN * S);
  sh.tick();
  const [job] = sh.jobsAt('workshop');
  assert.equal(sh.crateCount('pipe_bomb'), 1);
  assert.equal(job.state, 'waiting');
  assert.equal(sh.jobStatus(job).state, 'fuel');
  // Fuel from a mission payout starts it right away.
  sh.grant({ fuel: 3 });
  assert.equal(job.state, 'running');
});

test('a station runs one job at a time and its queue holds as many waiting jobs as its level', () => {
  const { sh, state } = crafting((s) => {
    s.stations.generator.level = 5;
  });
  assert.ok(sh.queueCraft('pipe_bomb').ok);
  assert.ok(sh.queueCraft('pipe_bomb').ok);
  const r = sh.queueCraft('pipe_bomb');
  assert.equal(r.reason, 'queue');
  assert.equal(sh.jobsAt('workshop').filter((j) => j.state === 'running').length, 1);
  levels(state, { workshop: 3 });
  assert.ok(sh.queueCraft('pipe_bomb').ok);
  assert.ok(sh.queueCraft('pipe_bomb').ok);
  assert.equal(sh.queueCraft('pipe_bomb').reason, 'queue');
});

test('recipes unlock with the station level', () => {
  const { sh, state } = crafting();
  assert.equal(sh.queueCraft('molotov').reason, 'locked');
  assert.equal(sh.queueCraft('defibrillator').reason, 'locked');
  levels(state, { workshop: 2 });
  assert.ok(sh.queueCraft('molotov').ok);
});

test('the Loadout Crate holds up to 10 of each item, counting what is still being made', () => {
  const { sh, state } = crafting((s) => {
    s.crate.pipe_bomb = CRATE_MAX - 1;
  });
  levels(state, { workshop: 3, generator: 5 });
  assert.ok(sh.queueCraft('pipe_bomb').ok);
  assert.equal(sh.queueCraft('pipe_bomb').reason, 'crate');
});

test('cancelling a craft refunds its cost, and its Fuel if it had started', () => {
  const { sh, state } = crafting();
  const before = { ...state.res };
  const r = sh.queueCraft('pipe_bomb');
  assert.ok(sh.cancelJob(r.uid).ok);
  assert.deepEqual(state.res, before);
  assert.equal(sh.powerUsed(), 0);
});

test('crafts started while away chain through the queue in order', () => {
  const { sh, clock } = crafting((s) => {
    s.stations.workshop.level = 2;
    s.stations.generator.level = 2;
  });
  sh.queueCraft('pipe_bomb');
  sh.queueCraft('molotov');
  sh.queueCraft('pipe_bomb');
  clock.warp(DAY * S);
  sh.tick();
  assert.equal(sh.crateCount('pipe_bomb'), 2);
  assert.equal(sh.crateCount('molotov'), 1);
  assert.equal(sh.s.jobs.length, 0);
});

// --- Scrap Yard ----------------------------------------------------------------------------

function yard(mutate) {
  return make((s) => {
    rich(s);
    s.res.fuel = 10;
    clearChapters(s, 3);
    levels(s, { barricade: 3, generator: 3 });
    if (mutate) mutate(s);
  });
}

test('the Scrap Yard starts a production run when built: 1 Fuel, 1 power, then Scrap per hour until 8 hours of output', () => {
  const { sh, clock, state } = yard();
  sh.startUpgrade('scrapyard');
  assert.equal(sh.level('scrapyard'), 1);
  const info = sh.yardInfo();
  assert.equal(info.state, 'running');
  assert.equal(sh.powerUsed(), 1);
  assert.equal(state.res.fuel, 9);
  const rate = STATIONS.scrapyard.levels[0].scrapPerHour;
  clock.warp(HOUR * S);
  assert.ok(Math.abs(sh.yardPile() - rate) < 1e-6);
  clock.warp(20 * HOUR * S);
  sh.tick();
  assert.equal(sh.yardInfo().state, 'full');
  assert.equal(sh.yardPile(), rate * 8);
  assert.equal(sh.powerUsed(), 0, 'a full yard stops and frees its power');
  assert.ok(sh.drain().some((e) => e.type === 'yardFull' && e.t === T0 + 8 * HOUR * S));
});

test('collecting a full yard banks the Scrap and starts the next run (one tap)', () => {
  const { sh, clock, state } = yard();
  sh.startUpgrade('scrapyard');
  clock.warp(9 * HOUR * S);
  sh.tick();
  const scrap0 = state.res.scrap;
  const r = sh.collectYard();
  assert.ok(r.ok);
  assert.equal(r.got, STATIONS.scrapyard.levels[0].scrapPerHour * 8);
  assert.equal(state.res.scrap, scrap0 + r.got);
  assert.equal(sh.yardInfo().state, 'running');
  assert.equal(state.res.fuel, 8);
});

test('collecting mid-run keeps the run going without more Fuel', () => {
  const { sh, clock, state } = yard();
  sh.startUpgrade('scrapyard');
  clock.warp(2 * HOUR * S);
  const r = sh.collectYard();
  assert.equal(r.got, 2 * STATIONS.scrapyard.levels[0].scrapPerHour);
  assert.equal(state.res.fuel, 9);
  assert.equal(sh.yardInfo().state, 'running');
  clock.warp(8 * HOUR * S - 1);
  sh.tick();
  assert.equal(sh.yardInfo().state, 'running');
  clock.warp(1);
  sh.tick();
  assert.equal(sh.yardInfo().state, 'full');
});

test('stopping the yard frees its power and keeps the pile; it waits for power when both crafting stations run', () => {
  const { sh, clock } = yard((s) => {
    s.stations.generator.level = 2; // capacity 4
    s.stations.workshop.level = 1;
    s.stations.infirmary.level = 1;
  });
  sh.startUpgrade('scrapyard');
  clock.warp(HOUR * S);
  sh.tick();
  assert.equal(sh.powerUsed(), 1);
  sh.queueCraft('pipe_bomb');
  sh.queueCraft('first_aid_kit');
  assert.equal(sh.jobStatus(sh.jobsAt('infirmary')[0]).state, 'power');
  assert.ok(sh.stopYard().ok);
  assert.equal(sh.jobsAt('infirmary')[0].state, 'running');
  assert.ok(Math.abs(sh.yardPile() - STATIONS.scrapyard.levels[0].scrapPerHour) < 1e-6, 'the pile is kept');
  assert.equal(sh.yardInfo().state, 'stopped');
  const r = sh.startYard();
  assert.ok(r.ok);
  assert.equal(sh.yardInfo().state, 'waiting');
  assert.equal(sh.yardInfo().status.state, 'power');
  clock.warp(HOUR * S);
  sh.tick();
  assert.equal(sh.yardInfo().state, 'running');
});

test('upgrading the yard mid-run earns at the old rate until it finishes, then at the new one', () => {
  const { sh, clock } = yard((s) => {
    s.stations.scrapyard.level = 1;
  });
  sh.startYard();
  const r = sh.startUpgrade('scrapyard');
  assert.ok(r.ok);
  const [r1, r2] = STATIONS.scrapyard.levels.map((l) => l.scrapPerHour);
  const t = (r.end - T0) / S / 3600;
  clock.warp(r.end - T0);
  sh.tick();
  assert.ok(Math.abs(sh.yardPile() - r1 * t) < 1e-6);
  clock.warp(HOUR * S);
  assert.ok(Math.abs(sh.yardPile() - (r1 * t + r2)) < 1e-6);
  assert.ok(r2 > r1);
});

// --- Loadout ------------------------------------------------------------------------------------

test('every player gets a free bandage; crafted items fill the slots and upgrade the heal', () => {
  const { sh, state } = make();
  assert.deepEqual(
    { t: sh.resolvedLoadout().throwable, h: sh.resolvedLoadout().heal, b: sh.resolvedLoadout().boost },
    { t: null, h: 'bandage', b: null },
  );
  state.crate.pipe_bomb = 2;
  state.crate.first_aid_kit = 1;
  state.crate.pain_pills = 1;
  const L = sh.resolvedLoadout();
  assert.equal(L.throwable, 'pipe_bomb');
  assert.equal(L.heal, 'first_aid_kit');
  assert.equal(L.boost, 'pain_pills');
  sh.setSlot('heal', 'bandage');
  assert.equal(sh.resolvedLoadout().heal, 'bandage');
  sh.setSlot('throwable', 'none');
  assert.equal(sh.resolvedLoadout().throwable, null);
});

test('used items leave the crate after a mission; unused items stay', () => {
  const { sh, state } = make((s) => {
    s.stats.missions = 1;
    s.crate.pipe_bomb = 2;
    s.crate.first_aid_kit = 1;
  });
  const r = sh.playMission('c1m1', { outcome: 'win', seed: 1 });
  assert.ok(r.ok);
  assert.deepEqual(r.report.itemsUsed, { pipe_bomb: 1 });
  assert.equal(state.crate.pipe_bomb, 1);
  assert.equal(state.crate.first_aid_kit, 1, 'heals are only used when a stretch goes wrong');
});

test('weapons unlock with the Armory and upgrade instantly up to its tier', () => {
  const { sh, state } = make((s) => rich(s));
  assert.deepEqual(sh.weaponsUnlocked(), ['smg']);
  levels(state, { armory: 1 });
  assert.deepEqual(sh.weaponsUnlocked(), ['smg', 'shotgun']);
  assert.equal(sh.bestWeapon(), 'shotgun');
  assert.ok(sh.upgradeWeapon('smg').ok);
  assert.equal(sh.weaponTier('smg'), 2);
  assert.equal(sh.upgradeWeapon('smg').reason, 'armory');
  levels(state, { armory: 3 });
  assert.ok(sh.upgradeWeapon('smg').ok);
  assert.equal(sh.weaponUpgradeInfo('smg').blockers[0].need, 4);
});

test('loadout presets come from the Armory', () => {
  const { sh, state } = make();
  assert.equal(sh.savePreset(0).reason, 'locked');
  levels(state, { armory: 2 });
  sh.setSlot('heal', 'bandage');
  assert.ok(sh.savePreset(1).ok);
  sh.setSlot('heal', 'auto');
  assert.ok(sh.applyPreset(1).ok);
  assert.equal(state.loadout.heal, 'bandage');
});

// --- Missions and banking --------------------------------------------------------------------------

test('a wipe banks every safe room reached before it and pays the full share to you', () => {
  const { sh, state } = make((s) => {
    s.stats.missions = 1;
    s.res = { scrap: 0, parts: 0, supplies: 0, fuel: 0 };
    clearChapters(s, 0);
    s.won.c1m1 = 1;
  });
  let r;
  for (let seed = 1; seed < 200; seed++) {
    r = sh.planMission('c1m2', { outcome: 'wipe', seed });
    if (r.report.sectionsCleared === 2) break;
  }
  assert.equal(r.report.won, false);
  assert.equal(r.report.sectionsCleared, 2);
  const banked = r.report.sections.filter((x) => x.cleared).reduce((a, x) => a + x.loot.scrap, 0);
  assert.equal(r.report.banked.scrap, banked);
  assert.equal(r.report.sections[2].loot, null);
  sh.applyMission(r.report);
  assert.equal(state.res.scrap, banked);
  assert.equal(sh.s.won.c1m2, undefined);
});

test('the very first mission always makes it home', () => {
  for (let seed = 1; seed < 30; seed++) {
    const { sh } = make((s) => {
      s.stations.generator.level = 0;
    }, { skill: 0.1 });
    assert.ok(sh.planMission('c1m1', { seed }).report.won);
  }
});

test('missions unlock in order; chapters 4+ need the Radio Room', () => {
  const { sh, state } = make();
  assert.ok(sh.missionOpen('c1m1'));
  assert.ok(!sh.missionOpen('c1m2'));
  state.won.c1m1 = 1;
  assert.ok(sh.missionOpen('c1m2'));
  clearChapters(state, 3);
  assert.ok(!sh.missionOpen('c4m1'));
  assert.ok(sh.chapters()[3].radioLocked);
  levels(state, { radio: 1 });
  assert.ok(sh.missionOpen('c4m1'));
  assert.equal(sh.chapterLimit(), 5);
});

test('scripted rescues: Theo arrives at the chapter 1 finale and moves in once the Barracks has a bunk', () => {
  const { sh, clock, state } = make((s) => {
    rich(s);
    s.stats.missions = 3;
    s.won.c1m1 = 1;
    s.won.c1m2 = 1;
    levels(s, { barricade: 1 });
  });
  const r = sh.playMission('c1m3', { outcome: 'win', seed: 3 });
  assert.equal(r.summary.chapterCleared, 1);
  assert.deepEqual(r.summary.rescued, ['theo']);
  assert.deepEqual(r.summary.scenes, ['rescue_theo']);
  assert.equal(sh.survivorState('theo'), 'waiting');
  assert.equal(sh.chaptersCleared(), 1);
  finish(sh, clock, 'barracks');
  assert.equal(sh.survivorState('theo'), 'housed');
  assert.ok(sh.squadIds().includes('theo'));
  assert.ok(state.stats.missions === 4);
});

test('survivors fill squad slots before generic bots; a friend takes a slot and shares the best strengths', () => {
  const { sh, state } = make((s) => {
    levels(s, { barracks: 3, infirmary: 2 });
    s.survivors.theo.state = 'housed';
  });
  let sq = sh.squad();
  assert.deepEqual(sq.map((m) => m.kind), ['you', 'survivor', 'survivor', 'bot']);
  const bot = sq.find((m) => m.kind === 'bot');
  const surv = sq.find((m) => m.kind === 'survivor');
  const you = sq[0];
  assert.ok(bot.power < surv.power && surv.power < you.power, 'bot < named survivor < human');
  sh.setFriend('veteran');
  sq = sh.squad();
  assert.deepEqual(sq.map((m) => m.kind), ['you', 'friend', 'survivor', 'survivor']);
  const shared = sh.sharedStrengths();
  assert.equal(shared.tempHp, STATIONS.infirmary.levels[3].tempHp, 'the friend has the better Infirmary');
  assert.equal(shared.tempFrom, 'veteran');
  sh.setFriend('rookie');
  assert.equal(sh.sharedStrengths().tempHp, STATIONS.infirmary.levels[1].tempHp, 'bonuses do not stack: yours is better');
  assert.ok(state.friend === 'rookie');
});

test('reserve bunks create choice: pick who comes along', () => {
  const { sh } = make((s) => {
    levels(s, { barracks: 4 });
    for (const id of ['theo', 'grace', 'lukas']) s.survivors[id].state = 'housed';
  });
  assert.deepEqual(sh.squadIds(), ['nadia', 'theo', 'grace']);
  sh.pickSurvivor('lukas');
  assert.deepEqual(sh.squadIds(), ['lukas', 'nadia', 'theo']);
});

test('bonds grow with missions together, faster when Well Rested, and upgrade the perk', () => {
  const { sh, state } = make((s) => {
    s.stats.missions = 1;
    levels(s, { barracks: 3 });
  });
  const r = sh.playMission('c1m1', { outcome: 'win', seed: 2 });
  assert.equal(state.survivors.nadia.xp, Math.round(BOND.xpPerMission * 1.3));
  assert.equal(r.summary.bondXp, Math.round(BOND.xpPerMission * 1.3));
  const v0 = sh.perkValue('nadia');
  state.survivors.nadia.xp = BOND.levels[BOND.perkUpAt];
  assert.ok(sh.perkValue('nadia') > v0);
});

test('rescue calls appear only when a bunk is free and the story survivors are housed', () => {
  const { sh, state } = make((s) => {
    levels(s, { barracks: 3, radio: 1 });
    clearChapters(s, 3);
    s.survivors.theo.state = 'housed';
    s.survivors.grace.state = 'housed';
  });
  assert.equal(sh.rescueCall(), null);
  levels(state, { barracks: 4 });
  assert.equal(sh.rescueCall(), 'lukas');
  assert.ok(sh.missionOpen('rescue_lukas'));
  state.stats.missions = 5;
  const r = sh.playMission('rescue_lukas', { outcome: 'win', seed: 4 });
  assert.deepEqual(r.summary.movedIn, ['lukas']);
  assert.equal(sh.rescueCall(), null, 'no free bunk, no call');
  levels(state, { barracks: 5 });
  assert.equal(sh.rescueCall(), 'mei');
});

test('bond chapters open at Barracks 4 for survivors with a strong enough bond', () => {
  const { sh, state } = make((s) => {
    levels(s, { barracks: 4 });
    s.stats.missions = 9;
    s.survivors.nadia.xp = BOND.levels[BOND.bondChapterAt];
  });
  assert.deepEqual(sh.specialMissions().map((m) => m.id), ['bond_nadia']);
  const r = sh.playMission('bond_nadia', { outcome: 'win', seed: 5 });
  assert.equal(r.summary.bondStory, 'nadia');
  assert.ok(state.survivors.nadia.bondDone);
  assert.deepEqual(sh.specialMissions(), []);
});

// --- Radio Room ---------------------------------------------------------------------------------------

test('daily orders: one when the Radio Room is built, one per day after, stacking up to three', () => {
  const { sh, clock, state } = make((s) => {
    rich(s);
    clearChapters(s, 1);
    levels(s, { barricade: 2 });
  });
  finish(sh, clock, 'radio');
  assert.equal(sh.orders().length, 1);
  assert.equal(state.orders.nextAt, nextMidnight(T0));
  clock.warp(5 * DAY * S);
  sh.tick();
  assert.equal(sh.orders().length, ORDERS.max);
  assert.ok(state.orders.nextAt > clock.now());
});

test('orders track missions and pay out once claimed', () => {
  const { sh, state } = make((s) => {
    s.stats.missions = 1;
    levels(s, { radio: 1 });
    s.orders.list.push({ uid: 99, type: 'wins', n: 1, who: null, progress: 0, done: false, at: T0, reward: { parts: 15 } });
  });
  assert.equal(sh.claimOrder(99).reason, 'notDone');
  sh.playMission('c1m1', { outcome: 'win', seed: 7 });
  assert.ok(state.orders.list[0].done);
  const parts = state.res.parts;
  const r = sh.claimOrder(99);
  assert.ok(r.ok);
  assert.equal(state.res.parts, Math.min(parts + 15, sh.cap('parts')));
  assert.equal(sh.orders().length, 0);
});

// --- Progression, time and saves --------------------------------------------------------------------------

test('stages advance as their goals are met and the pacing log records when', () => {
  const { sh, clock, state } = make((s) => {
    s.res.scrap = 1000;
    s.res.parts = 10;
  });
  sh.startUpgrade('barricade');
  sh.startUpgrade('generator');
  sh.startUpgrade('workshop');
  assert.equal(state.stage, 0);
  sh.queueCraft('pipe_bomb');
  clock.warp(5 * MIN * S);
  sh.tick();
  assert.equal(state.stage, 1);
  assert.equal(state.stageLog[1].t, RECIPES.pipe_bomb.seconds * S);
  assert.equal(sh.stageInfo().def.name, 'First timers');
});

test('the tuning multipliers scale timers started from then on', () => {
  const { sh } = make(
    (s) => {
      rich(s);
      clearChapters(s, 1);
      levels(s, { barricade: 1, generator: 1, workshop: 1 });
    },
    { buildTime: 0.5, craftTime: 0 },
  );
  const r = sh.startUpgrade('generator');
  assert.equal(r.end - T0, 5 * MIN * S);
  sh.queueCraft('pipe_bomb');
  assert.equal(sh.crateCount('pipe_bomb'), 1, 'zero-length crafts finish at once');
});

test('a save survives a round trip and old saves get new fields', () => {
  const { sh } = make();
  sh.startUpgrade('barricade');
  const json = JSON.parse(JSON.stringify(sh.s));
  delete json.orders;
  delete json.stats.fuelSpent;
  json.yard = null;
  const m = migrate(json, T0);
  assert.equal(m.stations.barricade.level, 1);
  assert.deepEqual(m.orders, { list: [], nextAt: 0 });
  assert.equal(m.stats.fuelSpent, 0);
  assert.equal(typeof m.yard.pile, 'number');
  assert.equal(migrate(null, T0).v, 1);
});

test('nothing decays: a month away loses nothing', () => {
  const { sh, clock, state } = crafting((s) => {
    s.res.fuel = 5;
  });
  sh.queueCraft('pipe_bomb');
  const before = JSON.stringify({ res: state.res, crate: state.crate });
  clock.warp(30 * DAY * S);
  sh.tick();
  assert.equal(sh.crateCount('pipe_bomb'), 1);
  const after = JSON.parse(JSON.stringify({ res: state.res }));
  assert.deepEqual(after.res, JSON.parse(before).res);
});
