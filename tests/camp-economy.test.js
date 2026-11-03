import test from 'node:test';
import assert from 'node:assert/strict';
import { Camp, newState, gemCost, resGemCost } from '../camp/src/economy.js';
import { FakeClock } from '../camp/src/clock.js';
import { migrate } from '../camp/src/save.js';
import { BUILDINGS, REWARDS, FIRST_FILL, QUESTS, TUNING_DEFAULTS, HOUR, MIN } from '../camp/src/config.js';
import { mulberry32 } from '../camp/src/util.js';

const T0 = 1_700_000_000_000;
const S = 1000; // ms per second

function makeCamp(mutate) {
  const clock = new FakeClock(T0);
  const state = newState(T0);
  if (mutate) mutate(state);
  const camp = new Camp(state, { clock, tuning: { ...TUNING_DEFAULTS }, rng: mulberry32(7) });
  return { camp, clock, state };
}

/** Build/upgrade and let the timer run out. */
function finish(camp, clock, id) {
  const r = camp.startUpgrade(id, { withGems: true });
  assert.ok(r.ok, `startUpgrade(${id}) failed: ${r.reason}`);
  clock.warp(r.end - clock.now());
  camp.tick();
}

function rich(state) {
  state.res = { food: 1e6, wood: 1e6, scrap: 1e6 };
  state.gems = 1e6;
}

test('gem cost follows the anchor curve and never decreases', () => {
  assert.equal(gemCost(0), 0);
  assert.equal(gemCost(-5), 0);
  assert.equal(gemCost(1), 1);
  assert.equal(gemCost(60), 1);
  assert.equal(gemCost(HOUR), 20);
  assert.equal(gemCost(24 * HOUR), 260);
  assert.equal(gemCost(7 * 24 * HOUR), 1000);
  let prev = 0;
  for (let s = 1; s < 10 * 24 * HOUR; s = Math.ceil(s * 1.07)) {
    const g = gemCost(s);
    assert.ok(g >= prev, `gemCost(${s}) = ${g} < ${prev}`);
    prev = g;
  }
  assert.equal(gemCost(HOUR, 0.5), 10);
  assert.equal(gemCost(10, 0), 1, 'anything left to rush costs at least a gem');
});

test('buying missing resources is priced per resource and rounded up', () => {
  assert.equal(resGemCost({}), 0);
  assert.equal(resGemCost({ wood: 1 }), 1);
  assert.equal(resGemCost({ wood: 40 }), 1);
  assert.equal(resGemCost({ wood: 41 }), 2);
  assert.equal(resGemCost({ wood: 40, scrap: 20 }), 2);
});

test('building the first Garden pays, occupies the builder and finishes on time', () => {
  const { camp, clock, state } = makeCamp();
  const wood0 = state.res.wood;
  assert.equal(camp.plotState('garden'), 'available');
  const r = camp.startUpgrade('garden');
  assert.ok(r.ok);
  assert.equal(state.res.wood, wood0 - BUILDINGS.garden.levels[0].cost.wood);
  assert.equal(camp.plotState('garden'), 'constructing');
  assert.equal(camp.freeBuilders(), 0);
  // Only one builder at Command Post 1.
  assert.equal(camp.startUpgrade('lumber').reason, 'builders');

  clock.warp(BUILDINGS.garden.levels[0].time * S - 1);
  camp.tick();
  assert.equal(camp.level('garden'), 0);
  clock.warp(1);
  camp.tick();
  assert.equal(camp.level('garden'), 1);
  assert.equal(camp.freeBuilders(), 1);
  const ev = camp.drain().find((e) => e.type === 'built');
  assert.deepEqual([ev.id, ev.level, ev.first], ['garden', 1, true]);
  // A new producer starts partly full so the first collect is instant.
  const store = BUILDINGS.garden.levels[0].store;
  assert.ok(Math.abs(camp.pending('garden') - store * FIRST_FILL) < 1e-6);
});

test('production accrues per hour, caps at the building store and resumes after collect', () => {
  const { camp, clock } = makeCamp();
  finish(camp, clock, 'garden');
  camp.collect('garden');
  const { rate, store } = BUILDINGS.garden.levels[0];
  assert.ok(camp.pending('garden') < 1);
  clock.warp(0.5 * HOUR * S);
  assert.ok(Math.abs(camp.pending('garden') - rate * 0.5) < 1e-6);
  clock.warp(10 * HOUR * S);
  assert.equal(camp.pending('garden'), store);
  assert.ok(camp.pendingFrac('garden') === 1);
  assert.equal(camp.timeToFull('garden'), 0);
});

test('collecting stops at the storage cap and leaves the rest in the building', () => {
  const { camp, clock, state } = makeCamp();
  finish(camp, clock, 'garden');
  clock.warp(10 * HOUR * S); // full: 120 food
  const cap = camp.storageCap();
  state.res.food = cap - 50;
  const r = camp.collect('garden');
  assert.ok(r.ok);
  assert.equal(r.got, 50);
  assert.equal(state.res.food, cap);
  assert.ok(Math.abs(camp.pending('garden') - (BUILDINGS.garden.levels[0].store - 50)) < 1e-6);
  assert.equal(camp.collect('garden').reason, 'full');
  state.res.food = 0;
  assert.equal(camp.collect('garden').got, BUILDINGS.garden.levels[0].store - 50);
});

test('upgrading a producer banks its store, pauses production, and resumes at the new rate from the end time', () => {
  const { camp, clock, state } = makeCamp((s) => {
    rich(s);
    s.buildings.hq.level = 3;
    s.res.food = 0;
  });
  finish(camp, clock, 'garden');
  clock.warp(HOUR * S);
  const pendingBefore = Math.floor(camp.pending('garden'));
  const r = camp.startUpgrade('garden');
  assert.ok(r.ok);
  assert.equal(state.res.food, pendingBefore, 'stored food was collected first');
  clock.warp(2 * S);
  assert.equal(camp.pending('garden'), 0, 'no production while upgrading');
  // Come back long after the upgrade ended (offline): production counts from the end.
  const end = r.end;
  clock.t = end + 0.25 * HOUR * S;
  camp.tick();
  assert.equal(camp.level('garden'), 2);
  const rate2 = BUILDINGS.garden.levels[1].rate;
  assert.ok(Math.abs(camp.pending('garden') - rate2 * 0.25) < 1e-6);
});

test('building levels are gated by the Command Post level', () => {
  const { camp, clock } = makeCamp(rich);
  finish(camp, clock, 'garden');
  const info = camp.upgradeInfo('garden');
  assert.deepEqual(info.blockers, [{ type: 'hq', need: 2 }]);
  assert.equal(camp.startUpgrade('garden').reason, 'hq');
  assert.equal(camp.plotState('armory'), 'locked');
  finish(camp, clock, 'hq');
  assert.equal(camp.plotState('armory'), 'available');
  assert.ok(camp.startUpgrade('garden').ok);
});

test('Command Post 3 adds a builder; rubble hides area buildings until cleared', () => {
  const { camp, clock } = makeCamp(rich);
  finish(camp, clock, 'hq');
  finish(camp, clock, 'hq');
  assert.equal(camp.builders(), 2);
  assert.equal(camp.plotState('infirmary'), 'hidden');
  assert.equal(camp.upgradeInfo('infirmary').blockers[0].type, 'area');
  const r = camp.startClear('east');
  assert.ok(r.ok);
  assert.ok(camp.startUpgrade('garden').ok, 'second builder is free');
  assert.equal(camp.freeBuilders(), 0);
  clock.warp(camp.rubbleInfo('east').time * S);
  camp.tick();
  assert.equal(camp.s.rubble.east.done, true);
  assert.equal(camp.plotState('infirmary'), 'available');
  assert.equal(camp.plotState('garage'), 'locked', 'garage also needs Command Post 4');
});

test('Command Post 4 needs 4 survivors', () => {
  const { camp, clock, state } = makeCamp(rich);
  finish(camp, clock, 'hq');
  finish(camp, clock, 'hq');
  const info = camp.upgradeInfo('hq');
  assert.deepEqual(info.blockers, [{ type: 'survivors', need: 4, have: 2 }]);
  state.survivors = 4;
  assert.ok(camp.startUpgrade('hq').ok);
});

test('rushing costs gems for the remaining time and finishes immediately', () => {
  const { camp, clock, state } = makeCamp((s) => {
    s.res.wood = 1000;
  });
  finish(camp, clock, 'garden');
  assert.ok(camp.startUpgrade('hq').ok); // 60 s
  clock.warp(20 * S);
  const cost = camp.rushCost('hq');
  assert.equal(cost, gemCost(40));
  const gems0 = state.gems;
  assert.ok(camp.rush('hq').ok);
  assert.equal(camp.level('hq'), 2);
  assert.equal(state.gems, gems0 - cost);
  assert.equal(state.stats.gemsSpent, cost);
  const hqUp = camp.drain().find((e) => e.type === 'hqUp');
  assert.equal(hqUp.level, 2);
  assert.ok(hqUp.unlocks.some((u) => u.type === 'building' && u.id === 'armory'));
  // Not enough gems.
  state.gems = 0;
  state.res.wood = 1000;
  assert.ok(camp.startUpgrade('garden').ok);
  assert.equal(camp.rush('garden').reason, 'gems');
});

test('missing resources can be topped up with gems', () => {
  const { camp, state } = makeCamp((s) => {
    s.res.wood = 30; // garden costs 50
  });
  const info = camp.upgradeInfo('garden');
  assert.deepEqual(info.missing, { wood: 20 });
  assert.equal(info.missingGems, 1);
  assert.equal(camp.startUpgrade('garden').reason, 'resources');
  const gems0 = state.gems;
  assert.ok(camp.startUpgrade('garden', { withGems: true }).ok);
  assert.equal(state.res.wood, 0);
  assert.equal(state.gems, gems0 - 1);
});

test('the short reward is ready after its first delay, then repeats from each claim', () => {
  const { camp, clock, state } = makeCamp();
  assert.equal(camp.rewardInfo('short').ready, false);
  assert.equal(camp.claimReward('short').reason, 'notReady');
  assert.equal(camp.rushReward('short').reason, 'notSkippable');
  clock.warp(REWARDS.short.first * S);
  camp.tick();
  assert.ok(camp.drain().some((e) => e.type === 'rewardReady' && e.kind === 'short'));
  const food0 = state.res.food;
  const r = camp.claimReward('short');
  assert.ok(r.ok);
  assert.ok(state.res.food > food0);
  assert.equal(state.stats.crates, 1);
  const info = camp.rewardInfo('short');
  assert.equal(info.ready, false);
  assert.ok(Math.abs(info.remaining - TUNING_DEFAULTS.shortMinutes * 60) < 1e-6);
});

test('the long reward can be rushed with gems', () => {
  const { camp, state } = makeCamp();
  const info = camp.rewardInfo('long');
  assert.equal(info.ready, false);
  assert.equal(info.rushCost, gemCost(REWARDS.long.first));
  const gems0 = state.gems;
  const r = camp.rushReward('long');
  assert.equal(r.reason, 'gems', 'starting gems are not enough for a full 8 h rush');
  state.gems = 1000;
  const r2 = camp.rushReward('long');
  assert.ok(r2.ok);
  assert.ok(r2.loot.gems >= REWARDS.long.gems[0]);
  assert.equal(state.gems, 1000 - info.rushCost + r2.loot.gems);
  assert.ok(gems0 > 0);
});

test('a tuned reward interval applies to the running timer', () => {
  const { camp, clock } = makeCamp();
  clock.warp(REWARDS.short.first * S);
  camp.claimReward('short');
  camp.tuning.shortMinutes = 1;
  camp.retimeRewards();
  assert.ok(camp.rewardInfo('short').remaining <= 60);
});

test('the first run always survives; zones open with the Radio Tower', () => {
  const { camp, state } = makeCamp();
  assert.equal(camp.playRun('downtown').reason, 'locked');
  const r = camp.playRun('suburbs', { outcome: 'auto' });
  assert.ok(r.ok);
  assert.equal(r.result.won, true);
  assert.equal(state.stats.runs, 1);
  assert.equal(state.stats.zoneWins.suburbs, 1);
  assert.ok(r.result.firstClear);
  assert.ok(r.result.gems >= 10, 'first clear pays gems');
  assert.ok(r.result.loot.scrap > 0);
  // A forced loss keeps only part of the loot and pays no first-clear gems.
  const lost = camp.playRun('suburbs', { outcome: 'lose', seed: 3 });
  assert.equal(lost.result.won, false);
  assert.equal(lost.result.firstClear, false);
  assert.equal(state.stats.deaths, 1);
});

test('camp upgrades raise run power and the loadout the game would receive', () => {
  const { camp, clock } = makeCamp(rich);
  const base = camp.loadout();
  assert.deepEqual(base.weapons, ['smg']);
  assert.equal(base.maxHp, 100);
  finish(camp, clock, 'hq');
  finish(camp, clock, 'armory');
  finish(camp, clock, 'armory');
  const l = camp.loadout();
  assert.deepEqual(l.weapons, ['smg', 'shotgun']);
  assert.ok(Math.abs(l.damageMult - 1.1) < 1e-9);
  assert.ok(l.power > base.power);
});

test('survivors need beds; extra rescues move on', () => {
  const { camp, state } = makeCamp();
  assert.equal(camp.beds(), 3);
  const g = camp.grant({ survivors: 3 });
  assert.equal(g.survivors, 1);
  assert.equal(g.survivorsLost, 2);
  assert.equal(state.survivors, 3);
});

test('expeditions need the Garage, a free slot and a crew; they come back with loot', () => {
  const { camp, clock, state } = makeCamp((s) => {
    rich(s);
    s.survivors = 5;
  });
  assert.equal(camp.startExpedition('scout').reason, 'garage');
  for (let i = 0; i < 3; i++) finish(camp, clock, 'hq'); // Command Post 4
  assert.ok(camp.startClear('east', { withGems: true }).ok);
  camp.finishAll();
  finish(camp, clock, 'garage');
  assert.equal(camp.startExpedition('haul').reason, 'locked');
  const r = camp.startExpedition('supply');
  assert.ok(r.ok);
  assert.equal(camp.freeSurvivors(), 3);
  assert.equal(camp.startExpedition('scout').reason, 'slots');
  assert.equal(camp.collectExpedition(r.uid).reason, 'away');
  clock.warp(HOUR * S);
  camp.tick();
  assert.ok(camp.drain().some((e) => e.type === 'expeditionBack'));
  const food0 = state.res.food;
  const c = camp.collectExpedition(r.uid);
  assert.ok(c.ok);
  assert.ok(state.res.food > food0);
  assert.equal(camp.freeSurvivors(), 5);
  // Rushing.
  const r2 = camp.startExpedition('scout');
  const gems0 = state.gems;
  const cost = camp.rushExpeditionCost(r2.uid);
  assert.equal(cost, gemCost(15 * MIN));
  assert.ok(camp.rushExpedition(r2.uid).ok);
  assert.equal(state.gems, gems0 - cost);
  assert.ok(camp.collectExpedition(r2.uid).ok);
});

test('workshop crafts into stock; packed items add power and are used up by a run', () => {
  const { camp, clock, state } = makeCamp((s) => {
    rich(s);
    s.buildings.hq.level = 5;
    s.rubble.east.done = true;
    s.rubble.far.done = true;
  });
  assert.equal(camp.startCraft('medkit').reason, 'locked');
  finish(camp, clock, 'workshop');
  assert.equal(camp.startCraft('pipebomb').reason, 'locked');
  assert.ok(camp.startCraft('medkit').ok);
  assert.equal(camp.startCraft('medkit').reason, 'slots');
  clock.warp(camp.recipes()[0].time * S);
  camp.tick();
  assert.equal(state.items.medkit, 1);
  assert.equal(state.stats.crafts, 1);
  const without = camp.loadout({ medkit: 0 });
  const withKit = camp.loadout();
  assert.equal(withKit.items.medkit, 1);
  assert.ok(withKit.power > without.power);
  const run = camp.playRun('suburbs', { outcome: 'win' });
  assert.deepEqual(run.result.itemsUsed, { medkit: 1 });
  assert.equal(state.items.medkit, 0);
});

test('objectives advance in order and pay out on claim', () => {
  const { camp, clock, state } = makeCamp();
  let q = camp.questInfo();
  assert.equal(q.index, 0);
  assert.equal(q.done, false);
  assert.equal(camp.claimQuest().reason, 'notDone');
  finish(camp, clock, 'garden');
  q = camp.questInfo();
  assert.equal(q.done, true);
  assert.ok(camp.drain().some((e) => e.type === 'questDone'));
  const wood0 = state.res.wood;
  assert.ok(camp.claimQuest().ok);
  assert.equal(state.res.wood, wood0 + QUESTS[0].reward.wood);
  assert.equal(camp.questInfo().index, 1);
});

test('a long absence finishes chained timers in order and logs milestones at their real end times', () => {
  const { camp, clock, state } = makeCamp(rich);
  finish(camp, clock, 'hq'); // HQ 2
  const r = camp.startUpgrade('hq'); // HQ 3: 5 min
  const end = r.end;
  clock.warp(3 * HOUR * S);
  camp.tick();
  camp.tick(); // idempotent
  assert.equal(camp.level('hq'), 3);
  const m = state.milestones.at(-1);
  assert.equal(m.hq, 3);
  assert.equal(m.t, end - state.created);
  assert.equal(camp.drain().filter((e) => e.type === 'hqUp').length, 2);
});

test('build-time tuning scales new timers', () => {
  const { camp } = makeCamp();
  camp.tuning.buildTime = 0;
  assert.ok(camp.startUpgrade('garden').ok);
  assert.equal(camp.level('garden'), 1, 'zero-length timers finish at once');
});

test('old or partial saves are filled in, garbage starts fresh', () => {
  const fresh = migrate(null, T0);
  assert.equal(fresh.buildings.hq.level, 1);
  const partial = { res: { food: 5 }, buildings: { hq: { level: 4, at: T0, up: null } }, gems: 7 };
  const m = migrate(partial, T0);
  assert.equal(m.res.food, 5);
  assert.equal(m.res.wood, newState(T0).res.wood);
  assert.equal(m.buildings.hq.level, 4);
  assert.equal(m.buildings.garden.level, 0);
  assert.equal(m.gems, 7);
  assert.deepEqual(m.expeditions, []);
  assert.equal(m.rewards.long.told, false);
  const bad = migrate({ res: 'nope', buildings: { hq: { level: 'x' } } }, T0);
  assert.equal(typeof bad.res.food, 'number');
  assert.equal(bad.buildings.hq.level, 1);
  const camp = new Camp(m, { clock: new FakeClock(T0) });
  camp.tick();
  assert.equal(camp.hq, 4);
});
