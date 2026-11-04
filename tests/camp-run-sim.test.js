import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateRun, winChance, riskLabel } from '../camp/src/run-sim.js';
import { ZONES, WIN_CHANCE } from '../camp/src/config.js';

const zone = ZONES[1];
const loadout = { power: zone.rec, lootMult: 1, rescueBonus: 0, items: {}, weapons: ['smg'], maxHp: 100, damageMult: 1, medkits: 0 };

test('win chance is anchored at the recommended power, monotonic and clamped', () => {
  assert.equal(winChance(150, 150), WIN_CHANCE.atRec);
  let prev = 0;
  for (let p = 0; p <= 600; p += 5) {
    const c = winChance(p, 150);
    assert.ok(c >= prev);
    assert.ok(c >= WIN_CHANCE.min && c <= WIN_CHANCE.max);
    prev = c;
  }
  assert.equal(riskLabel(0.9).text, 'Easy');
  assert.equal(riskLabel(0.3).text, 'Deadly');
});

test('same seed, same run', () => {
  const a = simulateRun({ zone, loadout, seed: 42 });
  const b = simulateRun({ zone, loadout, seed: 42 });
  assert.deepEqual(a, b);
});

test('forced outcomes win or lose regardless of power', () => {
  for (let seed = 0; seed < 20; seed++) {
    assert.equal(simulateRun({ zone, loadout: { ...loadout, power: 1 }, outcome: 'win', seed }).won, true);
    assert.equal(simulateRun({ zone, loadout: { ...loadout, power: 999 }, outcome: 'lose', seed }).won, false);
    assert.equal(simulateRun({ zone, loadout: { ...loadout, power: 1 }, forceWin: true, seed }).won, true);
  }
});

test('wins pay more than deaths and first clears pay gems once', () => {
  let winLoot = 0;
  let loseLoot = 0;
  for (let seed = 0; seed < 200; seed++) {
    const w = simulateRun({ zone, loadout, outcome: 'win', seed });
    const l = simulateRun({ zone, loadout, outcome: 'lose', seed });
    winLoot += w.loot.scrap;
    loseLoot += l.loot.scrap;
    assert.equal(w.progress, 1);
    assert.ok(l.progress > 0 && l.progress < 1);
    assert.equal(l.rescued, 0, 'the dead rescue nobody');
    assert.equal(l.firstClear, false);
  }
  assert.ok(loseLoot < winLoot * 0.75);
  const first = simulateRun({ zone, loadout, outcome: 'win', seed: 1, firstClear: true });
  assert.equal(first.firstClear, true);
  assert.ok(first.gems >= zone.firstGems);
});

test('the result says how much of the loot was kept', () => {
  for (let seed = 0; seed < 50; seed++) {
    const w = simulateRun({ zone, loadout, outcome: 'win', seed });
    const l = simulateRun({ zone, loadout, outcome: 'lose', seed });
    assert.equal(w.kept, 1);
    assert.ok(l.kept >= 0.2 && l.kept <= 0.7);
    assert.ok(Math.abs(l.kept - (0.2 + 0.5 * l.progress)) < 1e-9);
  }
});

test('higher power wins more often', () => {
  const rate = (power) => {
    let w = 0;
    for (let seed = 0; seed < 400; seed++) w += simulateRun({ zone, loadout: { ...loadout, power }, seed }).won ? 1 : 0;
    return w / 400;
  };
  assert.ok(rate(zone.rec * 1.3) > rate(zone.rec) + 0.1);
  assert.ok(rate(zone.rec) > rate(zone.rec * 0.6) + 0.1);
});

test('loot multiplier and packed items carry through', () => {
  const a = simulateRun({ zone, loadout, outcome: 'win', seed: 9 });
  const b = simulateRun({ zone, loadout: { ...loadout, lootMult: 2, items: { medkit: 1 } }, outcome: 'win', seed: 9 });
  assert.ok(b.loot.scrap > a.loot.scrap * 1.8);
  assert.deepEqual(b.itemsUsed, { medkit: 1 });
});

test('the run ticker is in order and ends on the outcome', () => {
  for (let seed = 0; seed < 30; seed++) {
    const r = simulateRun({ zone: ZONES[4], loadout, seed });
    for (let i = 1; i < r.events.length; i++) assert.ok(r.events[i].at >= r.events[i - 1].at);
    assert.ok(r.events.every((e) => e.at >= 0 && e.at <= 1));
    const last = r.events.at(-1).text;
    assert.match(last, r.won ? /Safe room/ : /Overwhelmed/);
  }
});
