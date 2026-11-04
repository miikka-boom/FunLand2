// Consistency checks for camp/src/config.js, so tuning edits can't silently
// break progression (e.g. an upgrade that costs more than you can ever store).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESOURCES,
  BUILDINGS,
  BUILDING_ORDER,
  RUBBLE,
  ZONES,
  EXPEDITIONS,
  EXPEDITION_SCALE,
  RECIPES,
  REWARDS,
  REWARD_SCALE,
  QUESTS,
  WEAPONS,
  BASE_WEAPONS,
  BASE_BEDS,
} from '../camp/src/config.js';
import { WEAPONS as GAME_WEAPONS } from '../src/game/weapons.js';

const HQ_MAX = BUILDINGS.hq.levels.length;
const ids = Object.keys(BUILDINGS);

/** Highest level of `id` allowed at Command Post `hq` (0 if not unlocked). */
function maxLevelAt(id, hq) {
  const def = BUILDINGS[id];
  if (hq < def.unlockHq) return 0;
  let lvl = 0;
  def.levels.forEach((row, i) => {
    if ((row.hq || 0) <= hq) lvl = i + 1;
  });
  return lvl;
}

function storageAt(hq, warehouseLevel) {
  const base = BUILDINGS.hq.levels[hq - 1].cap;
  return base + (warehouseLevel > 0 ? BUILDINGS.warehouse.levels[warehouseLevel - 1].cap : 0);
}

test('every building is listed once in the display order', () => {
  assert.deepEqual([...BUILDING_ORDER].sort(), [...ids].sort());
});

test('level rows are complete and their Command Post requirements never go down', () => {
  for (const id of ids) {
    const def = BUILDINGS[id];
    assert.ok(def.levels.length >= 1, id);
    let prevHq = 0;
    def.levels.forEach((row, i) => {
      const where = `${id} L${i + 1}`;
      if (id === 'hq') {
        if (i === 0) assert.equal(row.cost, null, where);
        else assert.ok(row.cost && Object.keys(row.cost).length, where);
        assert.ok(row.cap > 0 && row.builders >= 1, where);
      } else {
        assert.ok(row.cost && Object.keys(row.cost).length, where);
        assert.ok(row.hq >= def.unlockHq && row.hq <= HQ_MAX, where);
        assert.ok(row.hq >= prevHq, `${where}: hq requirement went down`);
        prevHq = row.hq;
      }
      for (const r of Object.keys(row.cost || {})) assert.ok(RESOURCES.includes(r), `${where}: unknown resource ${r}`);
      assert.ok(row.time >= 0, where);
      if (i > 0) assert.ok(row.time >= def.levels[i - 1].time, `${where}: shorter than the level before`);
    });
    if (def.area) assert.ok(RUBBLE[def.area], `${id}: unknown area ${def.area}`);
    if (def.kind === 'producer') {
      assert.ok(RESOURCES.includes(def.produces), id);
      def.levels.forEach((row, i) => {
        assert.ok(row.rate > 0 && row.store > 0, `${id} L${i + 1}`);
        if (i > 0) assert.ok(row.rate > def.levels[i - 1].rate && row.store > def.levels[i - 1].store, `${id} L${i + 1} must improve`);
      });
    }
  }
});

test('every cost fits in storage at the Command Post level that allows it', () => {
  for (const id of ids) {
    BUILDINGS[id].levels.forEach((row, i) => {
      if (!row.cost) return;
      const hq = id === 'hq' ? i : Math.max(BUILDINGS[id].unlockHq, row.hq);
      // The warehouse can't count its own next level.
      const wh = id === 'warehouse' ? i : maxLevelAt('warehouse', hq);
      const cap = storageAt(hq, wh);
      for (const [r, n] of Object.entries(row.cost)) {
        assert.ok(n <= cap, `${id} L${i + 1} costs ${n} ${r} but storage at Command Post ${hq} is ${cap}`);
      }
    });
  }
  for (const [area, def] of Object.entries(RUBBLE)) {
    const cap = storageAt(def.hq, maxLevelAt('warehouse', def.hq));
    for (const n of Object.values(def.cost)) assert.ok(n <= cap, `rubble ${area}`);
  }
  const workshopHq = BUILDINGS.workshop.unlockHq;
  const cap = storageAt(workshopHq, maxLevelAt('warehouse', workshopHq));
  for (const rcp of RECIPES) for (const n of Object.values(rcp.cost)) assert.ok(n <= cap, `recipe ${rcp.id}`);
});

test('survivor requirements are reachable with the beds available at the time', () => {
  BUILDINGS.hq.levels.forEach((row, i) => {
    if (!row.needSurvivors) return;
    const hq = i; // upgrading from this level
    const beds = BASE_BEDS + (maxLevelAt('bunkhouse', hq) ? BUILDINGS.bunkhouse.levels[maxLevelAt('bunkhouse', hq) - 1].beds : 0);
    assert.ok(row.needSurvivors <= beds, `Command Post ${i + 1} needs ${row.needSurvivors} survivors, only ${beds} beds at ${hq}`);
  });
});

test('weapons, zones and recipes referenced by buildings exist', () => {
  for (const w of BASE_WEAPONS) assert.ok(WEAPONS[w]);
  for (const row of BUILDINGS.armory.levels) if (row.weapon) assert.ok(WEAPONS[row.weapon], row.weapon);
  for (const row of BUILDINGS.radio.levels) if (row.zone) assert.ok(ZONES.some((z) => z.id === row.zone), row.zone);
  for (const row of BUILDINGS.workshop.levels) if (row.recipe) assert.ok(RECIPES.some((r) => r.id === row.recipe), row.recipe);
  // Every zone but the first is revealed by a Radio Tower level, every recipe by a Workshop level.
  for (const z of ZONES) {
    if (z.radio === 0) continue;
    assert.equal(BUILDINGS.radio.levels[z.radio - 1].zone, z.id, `radio L${z.radio} should reveal ${z.id}`);
  }
  for (const r of RECIPES) assert.ok(BUILDINGS.workshop.levels.some((row) => row.recipe === r.id), r.id);
});

test('camp weapon ids match the action game weapon table', () => {
  const gameIds = GAME_WEAPONS.map((w) => w.id).sort();
  assert.deepEqual(Object.keys(WEAPONS).sort(), gameIds);
});

test('expeditions, rewards and scales cover every level', () => {
  const garageMax = BUILDINGS.garage.levels.length;
  for (const e of EXPEDITIONS) {
    assert.ok(e.garage >= 1 && e.garage <= garageMax, e.id);
    assert.ok(e.crew >= 1 && e.time > 0, e.id);
  }
  assert.ok(EXPEDITION_SCALE.length > HQ_MAX);
  assert.ok(REWARD_SCALE.length > HQ_MAX);
  assert.ok(REWARDS.short.interval < REWARDS.long.interval);
  // The largest crew must fit in the beds available when its garage level unlocks.
  for (const e of EXPEDITIONS) {
    const hq = BUILDINGS.garage.levels[e.garage - 1].hq;
    const bunk = maxLevelAt('bunkhouse', hq);
    const beds = BASE_BEDS + (bunk ? BUILDINGS.bunkhouse.levels[bunk - 1].beds : 0);
    assert.ok(e.crew <= beds, `${e.id} needs ${e.crew} crew, ${beds} beds at Command Post ${hq}`);
  }
});

test('objectives reference real things and can be done in order', () => {
  const statKeys = ['runs', 'wins', 'collects', 'crates', 'airdrops', 'expeditions', 'crafts', 'rescued'];
  let hqSoFar = 1;
  for (const [i, q] of QUESTS.entries()) {
    const g = q.goal;
    const where = `quest ${i}: ${q.text}`;
    if (g.level) {
      const [id, n] = g.level;
      assert.ok(BUILDINGS[id], where);
      assert.ok(n >= 1 && n <= BUILDINGS[id].levels.length, where);
      if (id === 'hq') {
        assert.ok(n >= hqSoFar, `${where}: Command Post goals should not go backwards`);
        hqSoFar = n;
      } else {
        const need = Math.max(BUILDINGS[id].unlockHq, BUILDINGS[id].levels[n - 1].hq);
        assert.ok(need <= hqSoFar, `${where}: needs Command Post ${need}, objectives so far only reach ${hqSoFar}`);
      }
    } else if (g.stat) assert.ok(statKeys.includes(g.stat[0]), where);
    else if (g.cleared) {
      assert.ok(RUBBLE[g.cleared], where);
      assert.ok(RUBBLE[g.cleared].hq <= hqSoFar, where);
    } else if (g.zoneWin) assert.ok(ZONES.some((z) => z.id === g.zoneWin[0]), where);
    else assert.ok(g.survivors > 0, where);
    for (const k of Object.keys(q.reward)) assert.ok(RESOURCES.includes(k) || k === 'gems', where);
    const focusOk = BUILDINGS[q.focus] || RUBBLE[q.focus] || ['play', 'short', 'long'].includes(q.focus);
    assert.ok(focusOk, `${where}: unknown focus ${q.focus}`);
  }
});
