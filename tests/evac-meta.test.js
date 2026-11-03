import test from 'node:test';
import assert from 'node:assert/strict';
import { Meta, newState, nice } from '../evac/src/meta.js';
import { FakeClock } from '../evac/src/clock.js';
import { migrate } from '../evac/src/save.js';
import { simulateRun, odds, starsFor } from '../evac/src/run-sim.js';
import { CAMPAIGNS, TOTAL_CHAPTERS, LEVEL_COST, WEAPONS, SURVIVORS, POWER, REWARDS, REVIVE, STAR_MULT, TUNING_DEFAULTS, ODDS, MAX_LEVEL } from '../evac/src/config.js';
import { mulberry32 } from '../evac/src/util.js';

const T0 = 1_700_000_000_000;

function make(mutate) {
  const clock = new FakeClock(T0);
  const state = newState(T0);
  if (mutate) mutate(state);
  const meta = new Meta(state, { clock, tuning: { ...TUNING_DEFAULTS }, rng: mulberry32(5) });
  return { meta, clock, state };
}

/** Play the given stop and bank it with a forced outcome. */
function play(meta, i, outcome = 'win', seed = 1) {
  const r = meta.planRun(i, { outcome, seed });
  assert.ok(r.ok, r.reason);
  return { result: r.result, out: meta.applyRun(r.result) };
}

test('a fresh save starts at the first stop with Rook and the SMG', () => {
  const { meta, state } = make();
  assert.equal(state.next, 0);
  assert.deepEqual(meta.rescued(), ['rook']);
  assert.deepEqual(meta.found(), ['smg']);
  assert.equal(meta.chapter(0).state, 'next');
  assert.equal(meta.chapter(1).state, 'locked');
  assert.equal(meta.power().total, POWER.mainBase + WEAPONS.smg.base);
  assert.equal(meta.canPlay(1), false);
  assert.equal(meta.planRun(1).reason, 'locked');
});

test('the very first run always survives with three stars and pays a first clear', () => {
  const { meta, state } = make();
  const r = meta.planRun(0);
  assert.equal(r.result.won, true);
  assert.equal(r.result.stars, 3);
  const out = meta.applyRun(r.result);
  const base = meta.chapter(0).supplies;
  assert.equal(out.firstClear, true);
  assert.equal(out.supplies, Math.round(base * STAR_MULT[3]) + base);
  assert.equal(state.supplies, out.supplies);
  assert.equal(state.next, 1);
  assert.equal(out.advanced, true);
  assert.equal(meta.chapter(0).state, 'done');
  assert.equal(meta.chapter(1).state, 'next');
});

test('replays keep the best stars and never pay the first-clear bonus twice', () => {
  const { meta, state } = make();
  meta.applyRun(meta.planRun(0).result); // the first run: always 3 stars
  const before = state.supplies;
  const r = meta.planRun(0, { outcome: 'win', seed: 2 });
  r.result.stars = 1;
  const out = meta.applyRun(r.result);
  assert.equal(out.firstClear, false);
  assert.equal(out.supplies, meta.chapter(0).supplies);
  assert.equal(state.stars[0], 3, 'best stars kept');
  assert.equal(state.supplies, before + out.supplies);
  assert.equal(state.next, 1, 'a replay does not move the van');
});

test('a death keeps part of the reward and does not advance', () => {
  const { meta, state } = make();
  play(meta, 0);
  const { result, out } = play(meta, 1, 'lose', 3);
  assert.equal(result.won, false);
  assert.equal(out.advanced, false);
  assert.equal(state.next, 1);
  assert.ok(out.supplies > 0 && out.supplies < meta.chapter(1).supplies);
  assert.equal(state.stars[1], 0);
});

test('upgrades are instant, cost supplies and raise power', () => {
  const { meta, state } = make((s) => (s.supplies = 1000));
  const cost = meta.upgradeCost('weapon', 'smg');
  assert.equal(cost, nice(LEVEL_COST[0] * WEAPONS.smg.costMult));
  const p0 = meta.power().total;
  const r = meta.upgrade('weapon', 'smg');
  assert.ok(r.ok);
  assert.equal(state.weapons.smg, 2);
  assert.equal(state.supplies, 1000 - cost);
  assert.equal(meta.power().total, p0 + POWER.weaponPerLevel);
  const r2 = meta.upgrade('survivor', 'rook');
  assert.ok(r2.ok);
  assert.equal(r2.after - r2.before, POWER.mainPerLevel);
  assert.equal(meta.upgrade('weapon', 'shotgun').reason, 'locked');
  state.supplies = 0;
  const r3 = meta.upgrade('weapon', 'smg');
  assert.equal(r3.reason, 'supplies');
  assert.ok(r3.need > 0);
});

test('levels stop at the cap', () => {
  const { meta, state } = make((s) => (s.supplies = 1e6));
  for (let k = 0; k < 20; k++) meta.upgrade('weapon', 'smg');
  assert.equal(state.weapons.smg, MAX_LEVEL);
  assert.equal(meta.upgradeCost('weapon', 'smg'), null);
  assert.equal(meta.upgrade('weapon', 'smg').reason, 'maxed');
});

test('clearing the road unlocks guns at your best gun level and rescues survivors', () => {
  const { meta, state } = make((s) => (s.supplies = 1e6));
  for (let k = 0; k < 3; k++) meta.upgrade('weapon', 'smg'); // SMG 4
  play(meta, 0);
  play(meta, 1);
  const { out } = play(meta, 2); // Gun Shop
  assert.deepEqual(out.unlocks, [{ kind: 'weapon', id: 'shotgun', level: 4 }]);
  assert.ok(meta.weaponPower('shotgun') > meta.weaponPower('smg'), 'a new gun is always an upgrade');
  play(meta, 3);
  const fin = play(meta, 4);
  assert.deepEqual(fin.out.unlocks, [{ kind: 'survivor', id: 'doc', level: 1 }]);
  assert.equal(fin.out.campaignDone, true);
  assert.equal(fin.out.gems, CAMPAIGNS[0].chapters[4].gems);
  assert.deepEqual(meta.squad(), ['rook', 'doc']);
  assert.equal(state.log.length, 1);
});

test('the squad is you plus the three best others, and every member adds power and perks', () => {
  const { meta, state } = make((s) => {
    s.survivors = { rook: 3, doc: 2, mags: 5, sparks: 1, juno: 4 };
  });
  assert.deepEqual(meta.squad(), ['rook', 'mags', 'juno', 'doc']);
  const p = meta.power();
  const expected = POWER.mainBase + 2 * POWER.mainPerLevel + WEAPONS.smg.base + [5, 4, 2].reduce((a, l) => a + POWER.botBase + (l - 1) * POWER.botPerLevel, 0);
  assert.equal(p.total, expected);
  const perks = meta.perks();
  assert.equal(perks['Squad damage'], SURVIVORS.mags.perkPer * 5);
  assert.equal(perks['Supplies found'], SURVIVORS.juno.perkPer * 4);
  assert.equal(perks['Squad reload speed'], undefined, 'Sparks is not in the squad');
  assert.ok(meta.setMain('sparks').ok);
  assert.deepEqual(meta.squad(), ['sparks', 'mags', 'juno', 'rook']);
  assert.equal(meta.setMain('nobody').reason, 'locked');
  state.survivors.doc = 0;
  assert.equal(meta.setMain('doc').reason, 'locked');
});

test("Juno's perk and co-op friends add supplies on top", () => {
  const { meta } = make((s) => {
    s.survivors.juno = 5;
    s.stars[0] = 3;
    s.next = 1;
  });
  const r = meta.planRun(0, { outcome: 'win', seed: 4, friends: 2 });
  r.result.stars = 1;
  const out = meta.applyRun(r.result);
  const base = meta.chapter(0).supplies;
  const juno = Math.round(base * SURVIVORS.juno.perkPer * 5 / 100);
  const coop = Math.round((base + juno) * 0.1 * 2);
  assert.equal(out.supplies, base + juno + coop);
  assert.equal(out.lines.length, 3);
});

test('reviving spends gems and turns a late death into a survival', () => {
  const { meta, state } = make();
  play(meta, 0);
  const r = meta.planRun(1, { outcome: 'lose', seed: 9 });
  r.result.progress = 0.7;
  assert.ok(meta.canRevive(r.result));
  const gems = state.gems;
  assert.ok(meta.revive(r.result).ok);
  assert.equal(state.gems, gems - REVIVE.gems[0]);
  assert.equal(r.result.won, true);
  assert.ok(r.result.stars >= 1);
  assert.equal(meta.revive(r.result).reason, 'won');
  const out = meta.applyRun(r.result);
  assert.equal(out.advanced, true);
  // Too early in the run, or no gems: no revive.
  const early = meta.planRun(2, { outcome: 'lose', seed: 9 }).result;
  early.progress = 0.1;
  assert.equal(meta.canRevive(early), false);
  state.gems = 0;
  const late = meta.planRun(2, { outcome: 'lose', seed: 9 }).result;
  late.progress = 0.8;
  assert.equal(meta.canRevive(late), false);
});

test('three stars on every stop of a district pays mastery once', () => {
  const { meta, state } = make();
  for (let i = 0; i < 5; i++) {
    const r = meta.planRun(i, { outcome: 'win', seed: i });
    r.result.stars = i === 4 ? 2 : 3;
    meta.applyRun(r.result);
  }
  assert.equal(state.mastery.suburbs, undefined);
  const r = meta.planRun(4, { outcome: 'win', seed: 7 });
  r.result.stars = 3;
  const out = meta.applyRun(r.result);
  assert.ok(out.mastery);
  assert.equal(state.mastery.suburbs, true);
  const again = meta.planRun(4, { outcome: 'win', seed: 8 });
  again.result.stars = 3;
  assert.equal(meta.applyRun(again.result).mastery, null);
});

test('clearing the last finale reaches the evac', () => {
  const { meta, state } = make();
  for (let i = 0; i < TOTAL_CHAPTERS; i++) meta.skipChapter(1);
  assert.equal(state.evac, true);
  assert.equal(state.next, TOTAL_CHAPTERS);
  assert.equal(meta.playTarget(), TOTAL_CHAPTERS - 1);
  assert.equal(meta.rescued().length, 5);
  assert.equal(meta.found().length, 6);
  assert.equal(meta.advice().kind, 'replay');
});

test('advice: upgrade when it matters, replay when stuck, else play', () => {
  const { meta, state } = make();
  assert.equal(meta.advice().kind, 'play');
  meta.applyRun(meta.planRun(0).result); // enough supplies for upgrades now
  assert.equal(meta.advice().kind, 'upgrade');
  // Buy what the advice says until it says play: the second stop needs upgrades first.
  for (let k = 0; k < 10 && meta.advice().kind === 'upgrade'; k++) {
    const u = meta.advice().item;
    assert.ok(meta.upgrade(u.kind, u.id).ok);
  }
  assert.equal(meta.advice().kind, 'play');
  assert.ok(meta.oddsFor(1).chance >= 0.6, 'after the advised upgrades the next stop is fair');
  meta.tuning.difficulty = 4; // the next stop is now far too hard
  const a = meta.advice();
  assert.equal(a.kind, 'replay');
  assert.equal(a.i, 0);
});

test('the crate is ready after its first delay and then every interval; the airdrop can be rushed', () => {
  const { meta, clock, state } = make();
  assert.equal(meta.claimReward('short').reason, 'notReady');
  clock.warp(REWARDS.short.first * 1000);
  meta.tick();
  assert.ok(meta.drain().some((e) => e.type === 'rewardReady' && e.kind === 'short'));
  const c = meta.claimReward('short');
  assert.ok(c.ok && c.supplies > 0);
  assert.ok(Math.abs(meta.rewardInfo('short').remaining - TUNING_DEFAULTS.shortMinutes * 60) < 1e-6);
  assert.equal(meta.rushReward('short').reason, 'notSkippable');
  const cost = meta.rewardInfo('long').rushCost;
  assert.ok(cost > 0);
  state.gems = cost - 1;
  assert.equal(meta.rushReward('long').reason, 'gems');
  state.gems = cost + 5;
  const r = meta.rushReward('long');
  assert.ok(r.ok);
  assert.equal(r.rushed, cost);
  assert.ok(r.supplies > c.supplies, 'the airdrop is the big one');
});

test('the simulator: same seed same run, power helps, stars follow the margin', () => {
  const ch = CAMPAIGNS[1].chapters[2];
  const base = { index: 7, chapter: ch, campaign: 1, power: 150, rec: 146, squad: ['rook', 'doc'] };
  assert.deepEqual(simulateRun({ ...base, seed: 3 }), simulateRun({ ...base, seed: 3 }));
  const rate = (power) => {
    let w = 0;
    for (let seed = 0; seed < 300; seed++) w += simulateRun({ ...base, power, seed }).won ? 1 : 0;
    return w / 300;
  };
  assert.ok(rate(200) > rate(146) + 0.15);
  assert.ok(rate(146) > rate(100) + 0.15);
  assert.equal(starsFor(1.3, 0), 3);
  assert.equal(starsFor(1.1, 0), 2);
  assert.equal(starsFor(1.0, 0), 1);
  assert.equal(odds(146, 146).chance, ODDS.atRec);
  for (let seed = 0; seed < 40; seed++) {
    const r = simulateRun({ ...base, seed });
    for (let k = 1; k < r.events.length; k++) assert.ok(r.events[k].at >= r.events[k - 1].at);
    assert.match(r.events.at(-1).text, r.won ? /Safe room|Flawless/ : /Overwhelmed/);
    if (!r.won) assert.equal(r.stars, 0);
  }
});

test('saves: missing fields are filled in, new road stops are padded', () => {
  const m = migrate({ supplies: 77, stars: [3, 2], survivors: { rook: 4 } });
  assert.equal(m.supplies, 77);
  assert.equal(m.stars.length, TOTAL_CHAPTERS);
  assert.deepEqual(m.stars.slice(0, 3), [3, 2, 0]);
  assert.equal(m.survivors.rook, 4);
  assert.equal(m.survivors.doc, 0);
  assert.equal(m.weapons.smg, 1);
  const bad = migrate('nope');
  assert.equal(bad.next, 0);
});
