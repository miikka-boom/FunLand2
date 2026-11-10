// The CPU budget of the 32-card set (docs/WOBBLE-WAR-CARDS.md 6.5): the scripted worst cases
// (two Bean Patches a side; Big Jelly, Drummer, Juggler and Bomb Squad against a Wrecking Crane
// and Peels; Propeller Pals, a Pelican, Brollies and Sneezes) each run 60 simulated seconds and
// may cost no more CPU than the budget allows. Machines differ, so the threshold is relative:
// a busy match of the 14 original cards runs in the same process as the yardstick. The budget
// is about 2.2 CPU-s per simulated minute on average and 3.0 for the worst minute, where such
// a busy match takes about 2. The scenarios are the balance tool's (--only perf).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERF, runPerf } from '../battle/tools/balance-arena.mjs';

const WORST = 3.0 / 2.0; // each worst case's minute against the busy baseline's
const AVERAGE = 2.2 / 2.0; // the worst cases on average
const CASES = ['patches', 'jelly', 'air'];

/** CPU-s of 60 simulated s of each scenario, after a warm-up (a cold first match costs about twice as much). */
function measure() {
  for (const sc of Object.values(PERF)) runPerf(sc, { seconds: 8 });
  const runs = { baseline: runPerf(PERF.baseline, { seconds: 60 }) };
  for (const id of CASES) runs[id] = runPerf(PERF[id], { seconds: 60 });
  return runs;
}
const ratios = (runs) => Object.fromEntries(CASES.map((id) => [id, runs[id].peak / runs.baseline.peak]));
const mean = (o) => Object.values(o).reduce((a, b) => a + b, 0) / Object.values(o).length;

let runs = measure();
let rel = ratios(runs);
// A busy neighbour can slow one run down: measure again once before calling it over budget
if (Object.values(rel).some((r) => r > WORST) || mean(rel) > AVERAGE) {
  const again = measure();
  const rel2 = ratios(again);
  if (mean(rel2) < mean(rel)) {
    runs = again;
    rel = rel2;
  }
}
const report = () => CASES.map((id) => `${id} ${runs[id].peak.toFixed(2)} (x${rel[id].toFixed(2)})`).join(', ') + ` vs baseline ${runs.baseline.peak.toFixed(2)} CPU-s`;

test('perf: each scripted worst case runs 60 simulated s within the worst-minute budget (relative to a busy 14-card match)', () => {
  for (const id of CASES) assert.ok(rel[id] <= WORST, `${id} is over budget: ${report()}`);
});

test('perf: the scripted worst cases stay within the average budget together', () => {
  assert.ok(mean(rel) <= AVERAGE, `x${mean(rel).toFixed(2)} of the baseline on average: ${report()}`);
});

test('perf: every scenario ran its plays and stayed finite (the load is real)', () => {
  for (const [id, r] of Object.entries(runs)) {
    assert.ok(r.finite, `${id}: every bean and tower ends with finite numbers`);
    assert.ok(r.played >= PERF[id].plays.length * 3, `${id}: its plays went in (${r.played})`);
  }
  const E = (id, type) => runs[id].events[type] || 0;
  assert.ok(E('baseline', 'explode') >= 10 && E('baseline', 'hit') >= 100, 'the baseline is a busy fight: bombs and blows');
  assert.ok(E('patches', 'sproutPop') >= 20 && E('patches', 'buildingLand') >= 8, 'the Bean Patches go up and keep popping Sprouts');
  assert.ok(E('jelly', 'beat') >= 50 && E('jelly', 'juggleToss') >= 10 && E('jelly', 'craneSwing') >= 10, 'the Drummer drums, the Juggler throws, the crane swings');
  assert.ok(E('jelly', 'slip') >= 5 && E('jelly', 'engulf') >= 1, 'peels trip beans and a Big Jelly swallows one');
  assert.ok(E('air', 'dive') >= 50 && E('air', 'sneeze') >= 6 && E('air', 'scoop') >= 2, 'Propeller Pals dive, Sneezes blow, a Pelican scoops');
  assert.ok(runs.air.peakUnits >= 40, `the air scenario fills the field (${runs.air.peakUnits} beans at once)`);
});
