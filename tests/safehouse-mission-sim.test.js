import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateMission, estimateOdds, stretchChance, riskLabel } from '../safehouse/src/mission-sim.js';
import { Safehouse, newState } from '../safehouse/src/economy.js';
import { FakeClock } from '../safehouse/src/clock.js';
import { CHANCE, MISSIONS, ITEMS, TUNING_DEFAULTS } from '../safehouse/src/config.js';
import { mulberry32 } from '../safehouse/src/util.js';

const T0 = Date.UTC(2026, 10, 3, 9, 0, 0);

/** A Safehouse past its first mission, so outcomes are not forced. */
function make(mutate) {
  const state = newState(T0);
  state.stats.missions = 1;
  if (mutate) mutate(state);
  return new Safehouse(state, { clock: new FakeClock(T0), tuning: { ...TUNING_DEFAULTS }, rng: mulberry32(5) });
}

/** A loadout for mission `id` with your power set directly. */
function loadoutWith(sh, id, { power, perks = {}, items = {} } = {}) {
  const L = sh.missionLoadout(id);
  if (power !== undefined) L.power = power;
  Object.assign(L.perks, perks);
  Object.assign(L.members[0].items, items);
  return L;
}

test('stretch chance: even power clears most of the time, and more power never hurts', () => {
  assert.equal(stretchChance(100, 100), CHANCE.even);
  assert.equal(stretchChance(1000, 100), CHANCE.max);
  assert.equal(stretchChance(1, 100), CHANCE.min);
  let prev = 0;
  for (let p = 10; p <= 300; p += 5) {
    const c = stretchChance(p, 120);
    assert.ok(c >= prev);
    prev = c;
  }
  assert.equal(riskLabel(0.9).tone, 'good');
  assert.equal(riskLabel(0.2).tone, 'bad');
});

test('the same seed gives the same mission', () => {
  const sh = make();
  const L = sh.missionLoadout('c1m1');
  const a = simulateMission({ loadout: L, seed: 77 });
  const b = simulateMission({ loadout: L, seed: 77 });
  assert.deepEqual(a, b);
});

test('quiet mode (odds estimates) never changes the outcome', () => {
  const sh = make((s) => (s.won.c1m1 = 1));
  const L = loadoutWith(sh, 'c1m2', { power: 90 });
  for (let seed = 1; seed < 40; seed++) {
    const loud = simulateMission({ loadout: L, seed });
    const quiet = simulateMission({ loadout: L, seed, quiet: true });
    assert.equal(loud.won, quiet.won);
    assert.deepEqual(loud.banked, quiet.banked);
  }
});

test('banked loot is exactly what the cleared stretches found, plus the first-clear bonus', () => {
  const sh = make((s) => (s.won.c1m1 = 1));
  for (let seed = 1; seed < 60; seed++) {
    const r = simulateMission({ loadout: loadoutWith(sh, 'c1m2', { power: 95 }), seed });
    const sum = { scrap: 0, parts: 0, supplies: 0, fuel: 0 };
    for (const s of r.sections) if (s.cleared) for (const k of Object.keys(sum)) sum[k] += s.loot[k];
    if (r.firstClear) sum.parts += r.firstClear.parts;
    assert.deepEqual(r.banked, sum);
    assert.equal(r.sectionsCleared, r.sections.filter((s) => s.cleared).length);
    if (!r.won) assert.equal(r.sections.at(-1).cleared, false);
  }
});

test('fuel splits over the stretches without losing any to rounding', () => {
  const sh = make((s) => (s.won.c1m1 = s.won.c1m2 = 1));
  const L = loadoutWith(sh, 'c1m3');
  L.perks.siphon = 0;
  const r = simulateMission({ loadout: L, seed: 3, outcome: 'win' });
  const cans = r.fuelCans ? MISSIONS.c1m3.fuelCans.amount : 0;
  assert.equal(r.banked.fuel, MISSIONS.c1m3.loot.fuel + cans);
});

test('throwables are used on the horde, boosts on the hardest stretch, heals only when something goes wrong', () => {
  const sh = make((s) => (s.won.c1m1 = 1));
  const L = loadoutWith(sh, 'c1m2', { power: 500, items: { throwable: 'pipe_bomb', heal: 'first_aid_kit', boost: 'pain_pills' } });
  const r = simulateMission({ loadout: L, seed: 9 });
  assert.ok(r.won);
  assert.deepEqual(r.itemsUsed, { pipe_bomb: 1, pain_pills: 1 });
  assert.equal(r.healed, 0);
  const horde = r.sections.findIndex((s) => s.kind === 'horde');
  assert.ok(r.sections[horde].events.some((e) => e.item === 'pipe_bomb'));
  assert.ok(r.sections[horde].threat < MISSIONS.c1m2.sections[horde].threat);
});

test('a wipe before the horde brings the throwable home', () => {
  const sh = make((s) => (s.won.c1m1 = s.won.c1m2 = 1));
  const L = loadoutWith(sh, 'c1m3', { items: { throwable: 'molotov' } });
  let r;
  for (let seed = 1; seed < 200; seed++) {
    r = simulateMission({ loadout: L, seed, outcome: 'wipe' });
    if (r.sectionsCleared === 0) break;
  }
  assert.equal(r.sectionsCleared, 0);
  assert.equal(r.itemsUsed.molotov, undefined);
  assert.equal(r.thrown, 0);
});

test('a defibrillator always saves one stretch; the free bandage is never taken from the crate', () => {
  const sh = make((s) => (s.won.c1m1 = s.won.c1m2 = 1));
  let saves = 0;
  for (let seed = 1; seed < 150; seed++) {
    const r = simulateMission({ loadout: loadoutWith(sh, 'c1m3', { power: 70, items: { heal: 'defibrillator' } }), seed });
    if (r.itemsUsed.defibrillator) {
      saves++;
      assert.ok(r.sections.some((s) => s.events.some((e) => e.item === 'defibrillator')));
    }
    const b = simulateMission({ loadout: loadoutWith(sh, 'c1m3', { power: 70, items: { heal: 'bandage' } }), seed });
    assert.equal(b.itemsUsed.bandage, undefined);
  }
  assert.ok(saves > 10);
});

test('crafted items and perks raise the clear chance', () => {
  const sh = make((s) => (s.won.c1m1 = s.won.c1m2 = 1));
  const odds = (opts) => estimateOdds(loadoutWith(sh, 'c1m3', { power: 105, ...opts }), { runs: 600 }).clear;
  const bare = odds({ items: { throwable: null, heal: 'bandage', boost: null } });
  const kitted = odds({ items: { throwable: 'pipe_bomb', heal: 'first_aid_kit', boost: 'pain_pills' } });
  const medic = odds({ items: { throwable: null, heal: 'bandage', boost: null }, perks: { medic: 0.75 } });
  assert.ok(kitted > bare + 0.08, `kitted ${kitted} vs bare ${bare}`);
  assert.ok(medic > bare, `medic ${medic} vs bare ${bare}`);
  let prev = 0;
  for (const power of [60, 90, 120, 150]) {
    const o = odds({ power });
    assert.ok(o >= prev);
    prev = o;
  }
});

test('forced outcomes for testing: always clear, or always wipe', () => {
  const sh = make((s) => (s.won.c1m1 = 1));
  for (let seed = 1; seed < 20; seed++) {
    assert.ok(simulateMission({ loadout: loadoutWith(sh, 'c1m2', { power: 1 }), seed, outcome: 'win' }).won);
    assert.ok(!simulateMission({ loadout: loadoutWith(sh, 'c1m2', { power: 999 }), seed, outcome: 'wipe' }).won);
  }
});

test('a friend brings their own items: none of them leave your crate', () => {
  const sh = make((s) => {
    s.won.c1m1 = 1;
    s.friend = 'veteran';
  });
  const L = sh.missionLoadout('c1m2');
  assert.equal(L.members[1].kind, 'friend');
  const r = simulateMission({ loadout: L, seed: 4, outcome: 'win' });
  assert.deepEqual(r.itemsUsed, {});
  assert.ok(r.sections.some((s) => s.events.some((e) => e.text.startsWith("Alex's"))));
  assert.equal(r.squad.friend, 'veteran');
});

test('survivor perks show up in the mission: Lukas siphons Fuel, Mei finds more', () => {
  const sh = make((s) => (s.won.c1m1 = 1));
  const base = simulateMission({ loadout: loadoutWith(sh, 'c1m2', { power: 999 }), seed: 8 });
  const lukas = simulateMission({ loadout: loadoutWith(sh, 'c1m2', { power: 999, perks: { siphon: 2 } }), seed: 8 });
  const mei = simulateMission({ loadout: loadoutWith(sh, 'c1m2', { power: 999, perks: { scavenger: 0.25 } }), seed: 8 });
  assert.equal(lukas.banked.fuel, base.banked.fuel + 2);
  assert.ok(mei.banked.scrap > base.banked.scrap);
  assert.ok(Object.values(ITEMS).length > 0);
});
