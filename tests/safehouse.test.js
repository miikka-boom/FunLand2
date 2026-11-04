// Safehouse (simple version): rules, the simulated mission and the content tables.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Safehouse, newState } from '../safehouse/src/economy.js';
import { simulateMission, stretchChance } from '../safehouse/src/mission-sim.js';
import { FakeClock } from '../safehouse/src/clock.js';
import { migrate } from '../safehouse/src/save.js';
import { STATIONS, STATION_ORDER, ITEMS, MISSIONS, CHAPTERS, CRATE_MAX, SURVIVORS, CHANCE, MIN, HOUR } from '../safehouse/src/config.js';
import { RESCUES, LINES, BANTER } from '../safehouse/src/story.js';
import { WEAPONS as GAME_WEAPONS } from '../src/game/weapons.js';
import { mulberry32 } from '../safehouse/src/util.js';

const T0 = Date.UTC(2026, 10, 4, 9, 0, 0);
const S = 1000;

function make(mutate, tuning = {}) {
  const clock = new FakeClock(T0);
  const state = newState(T0);
  if (mutate) mutate(state);
  return { sh: new Safehouse(state, { clock, rng: mulberry32(3), tuning }), clock, state };
}

// --- Rooms --------------------------------------------------------------------------------

test('you start with the Barracks and Nadia, nothing else, and PLAY ready', () => {
  const { sh, state } = make();
  assert.deepEqual(state.levels, { workshop: 0, infirmary: 0, barracks: 1, radio: 0 });
  assert.deepEqual(sh.home(), ['nadia']);
  assert.equal(sh.nextMission().mission.name, 'Fire Escape');
  assert.equal(sh.hint().focus, 'play');
});

test('first levels are instant; later ones run on a timer, one at a time, also while away', () => {
  const { sh, clock, state } = make((s) => (s.scrap = 2000));
  assert.ok(sh.startUpgrade('workshop').instant);
  assert.ok(sh.startUpgrade('infirmary').instant);
  const r = sh.startUpgrade('workshop');
  assert.equal(r.end - T0, 10 * MIN * S);
  const busy = sh.upgradeInfo('barracks');
  assert.ok(!busy.canStart && /One upgrade at a time/.test(busy.why));
  assert.ok(sh.startUpgrade('radio').instant, 'an instant first level does not wait for the running upgrade');
  clock.warp(10 * MIN * S);
  sh.tick();
  assert.equal(state.levels.workshop, 2);
  assert.ok(sh.upgradeInfo('barracks').canStart);
  assert.equal(state.scrap, 2000 - 100 - 100 - 250 - 100);
});

test('upgrades cost Scrap and stop at level 3', () => {
  const { sh, state } = make((s) => (s.scrap = 50));
  const u = sh.upgradeInfo('workshop');
  assert.ok(!u.canStart && /50 more Scrap/.test(u.why));
  state.levels.workshop = 3;
  assert.ok(sh.upgradeInfo('workshop').maxed);
});

test('every station level adds squad strength', () => {
  const { sh, state } = make();
  const s0 = sh.strength();
  state.levels.workshop = 2;
  assert.equal(sh.strength(), s0 + 8);
});

// --- Crafting -------------------------------------------------------------------------------

test('a station crafts its current item, one at a time, into a crate that holds 3 of each kind', () => {
  const { sh, clock, state } = make((s) => {
    s.scrap = 1000;
    s.levels.workshop = 1;
  });
  assert.ok(sh.startCraft('workshop').ok);
  assert.ok(!sh.craftInfo('workshop').canStart, 'one at a time');
  clock.warp(ITEMS.pipe_bomb.time * S);
  sh.tick();
  assert.equal(state.crate.pipe_bomb, 1);
  state.crate.pipe_bomb = CRATE_MAX - 1;
  assert.ok(sh.startCraft('workshop').ok);
  assert.ok(!sh.craftInfo('workshop').canStart, 'the craft in progress counts against the crate');
  clock.warp(HOUR * S);
  sh.tick();
  assert.equal(sh.stock('throw'), CRATE_MAX);
  assert.match(sh.craftInfo('workshop').why, /crate is full/);
});

test('upgrading a station switches it to a better item, and missions take the best one', () => {
  const { sh, state } = make((s) => {
    s.levels.workshop = 2;
    s.crate.pipe_bomb = 1;
    s.crate.molotov = 1;
    s.crate.pain_pills = 2;
  });
  assert.equal(sh.craftInfo('workshop').item, 'molotov');
  const L = sh.loadout();
  assert.equal(L.throwable, 'molotov');
  assert.equal(L.heal, 'pain_pills');
  assert.ok(state.crate.pipe_bomb === 1);
});

// --- Missions -----------------------------------------------------------------------------------

test('the very first mission always makes it home and pays Scrap', () => {
  for (let seed = 1; seed < 20; seed++) {
    const { sh, state } = make();
    const r = sh.playMission({ seed });
    assert.ok(r.report.won);
    assert.ok(state.scrap > 0);
    assert.equal(state.cleared, 1);
  }
});

test('a wipe keeps the Scrap banked at the safe rooms reached before it', () => {
  const { sh, state } = make((s) => (s.stats.missions = 1));
  let r;
  for (let seed = 1; seed < 100; seed++) {
    r = sh.planMission({ seed, outcome: 'wipe' });
    if (r.report.rooms === 2) break;
  }
  assert.equal(r.report.won, false);
  const banked = r.report.stretches.filter((x) => x.cleared).reduce((a, x) => a + x.scrap, 0);
  assert.equal(r.report.scrap, banked);
  assert.ok(banked > 0);
  sh.applyMission(r.report);
  assert.equal(state.scrap, banked);
  assert.equal(state.cleared, 0, 'a wipe does not clear the mission');
});

test('items are used where they matter; unused ones stay in the crate', () => {
  const { sh, state } = make((s) => {
    s.stats.missions = 1;
    s.crate.pipe_bomb = 2;
    s.crate.first_aid_kit = 1;
  });
  const r = sh.playMission({ seed: 5, outcome: 'win' });
  assert.deepEqual(r.summary.used, ['pipe_bomb'], 'the throwable goes on the horde; no heal needed');
  assert.equal(state.crate.pipe_bomb, 1);
  assert.equal(state.crate.first_aid_kit, 1);
});

test('a defibrillator always saves a bad stretch; a throwable cuts the danger', () => {
  const { sh } = make((s) => (s.stats.missions = 1));
  const L = sh.loadout();
  L.strength = 30;
  L.heal = 'defibrillator';
  let saves = 0;
  for (let seed = 1; seed < 40; seed++) {
    const r = simulateMission({ loadout: L, seed });
    if (r.used.defibrillator) saves++;
    assert.ok(r.rooms >= 1 || !r.used.defibrillator);
  }
  assert.ok(saves > 20);
  const T = sh.loadout();
  T.throwable = 'lure_flare';
  const r = simulateMission({ loadout: T, seed: 1, outcome: 'win' });
  const horde = r.stretches[1];
  assert.ok(horde.danger < MISSIONS[0].danger * 1.1);
});

test('the same seed plays the same mission, and more strength never hurts', () => {
  const { sh } = make((s) => (s.stats.missions = 1));
  const L = sh.loadout();
  assert.deepEqual(simulateMission({ loadout: L, seed: 9 }), simulateMission({ loadout: L, seed: 9 }));
  assert.equal(stretchChance(100, 100), CHANCE.even);
  let prev = 0;
  for (let s = 20; s < 300; s += 10) {
    const c = stretchChance(s, 120);
    assert.ok(c >= prev);
    prev = c;
  }
});

test('missions go in order; the Radio Room opens chapters 2 to 4; meanwhile PLAY replays', () => {
  const { sh, state } = make((s) => {
    s.stats.missions = 3;
    s.cleared = 3;
    Object.assign(s.levels, { workshop: 1, infirmary: 1 });
    Object.assign(s.crate, { pipe_bomb: 1, pain_pills: 1 });
  });
  let nm = sh.nextMission();
  assert.ok(nm.replay);
  assert.equal(nm.lockedChapter, 2);
  assert.equal(nm.mission.name, 'Lincoln High');
  assert.equal(sh.hint().focus, 'radio');
  state.levels.radio = 1;
  nm = sh.nextMission();
  assert.ok(!nm.replay);
  assert.equal(nm.mission.name, 'Parking Garage');
  state.cleared = MISSIONS.length;
  assert.ok(sh.nextMission().done);
});

test('replays pay but never clear the next mission or rescue anyone twice', () => {
  const { sh, state } = make((s) => {
    s.stats.missions = 5;
    s.cleared = 3;
    s.survivors.theo = 'home';
  });
  const r = sh.playMission({ seed: 2, outcome: 'win' });
  assert.ok(r.report.replay);
  assert.equal(state.cleared, 3);
  assert.equal(r.summary.rescued, null);
  assert.ok(state.scrap > 0);
});

test('Theo is rescued at the chapter 1 finale and joins once the Barracks has a bunk', () => {
  const { sh, clock, state } = make((s) => {
    s.stats.missions = 2;
    s.cleared = 2;
    s.scrap = 1000;
    Object.assign(s.levels, { workshop: 1, infirmary: 1, radio: 1 });
    Object.assign(s.crate, { pipe_bomb: 2, pain_pills: 2 });
  });
  const r = sh.playMission({ seed: 1, outcome: 'win' });
  assert.equal(r.summary.rescued, 'theo');
  assert.ok(r.summary.waiting);
  assert.equal(r.summary.chapterDone, 1);
  assert.deepEqual(sh.waiting(), ['theo']);
  assert.equal(sh.hint().focus, 'barracks');
  const s0 = sh.strength();
  sh.startUpgrade('barracks');
  clock.warp(10 * MIN * S);
  sh.tick();
  assert.deepEqual(sh.home(), ['nadia', 'theo']);
  assert.ok(sh.strength() > s0);
  assert.ok(sh.drain().some((e) => e.type === 'movedIn' && e.id === 'theo'));
  assert.equal(state.survivors.theo, 'home');
});

test('survivor perks: Nadia helps heals, Theo helps throwables, Grace adds strength', () => {
  const { sh, state } = make();
  assert.equal(sh.perks().medic, SURVIVORS.nadia.medic);
  assert.equal(sh.perks().chemist, 0);
  const s0 = sh.strength();
  state.survivors.grace = 'home';
  state.levels.barracks = 2;
  assert.ok(sh.strength() > s0 * 1.1);
});

// --- Saves and content -----------------------------------------------------------------------------

test('nothing decays, and a save survives a round trip with new fields filled in', () => {
  const { sh, clock, state } = make((s) => {
    s.scrap = 300;
    s.levels.workshop = 1;
  });
  sh.startCraft('workshop');
  clock.warp(30 * 24 * HOUR * S);
  sh.tick();
  assert.equal(state.crate.pipe_bomb, 1);
  assert.equal(state.scrap, 280);
  const json = JSON.parse(JSON.stringify(state));
  delete json.stats;
  const m = migrate(json, T0);
  assert.equal(m.levels.workshop, 1);
  assert.equal(m.stats.missions, 0);
  assert.equal(migrate(null, T0).v, 2);
});

test('content: four stations of three levels on the doc ladder, items, missions, story', () => {
  assert.deepEqual(STATION_ORDER, ['workshop', 'infirmary', 'barracks', 'radio']);
  for (const id of STATION_ORDER) {
    const lv = STATIONS[id].levels;
    assert.equal(lv.length, 3, id);
    assert.deepEqual(lv.map((l) => l.time), [0, 10 * MIN, 1 * HOUR], id);
    if (id !== 'barracks') assert.deepEqual(lv.map((l) => l.cost), [100, 250, 600], id);
    for (const l of lv) if (l.item) assert.ok(ITEMS[l.item], `${id}: ${l.item}`);
  }
  assert.equal(MISSIONS.length, 12);
  assert.equal(CHAPTERS.length, 4);
  MISSIONS.forEach((m, i) => {
    assert.equal(m.index, i);
    if (i) assert.ok(m.danger > MISSIONS[i - 1].danger, m.name);
    assert.equal(!!m.finale, i % 3 === 2, m.name);
    if (m.rescue) assert.ok(SURVIVORS[m.rescue] && RESCUES[m.rescue], m.name);
  });
  for (const id of Object.keys(SURVIVORS)) assert.ok(LINES[id] && BANTER[id], id);
  assert.ok(GAME_WEAPONS.length > 0);
});

test('a regular player can finish the whole campaign', () => {
  const { sh, clock, state } = make();
  for (let i = 0; i < 80 && state.cleared < MISSIONS.length; i++) {
    sh.tick();
    for (const id of ['workshop', 'infirmary']) if (sh.craftInfo(id).canStart) sh.startCraft(id);
    const h = sh.hint();
    for (const id of [h.focus, ...STATION_ORDER]) if (STATIONS[id] && sh.upgradeInfo(id).canStart) sh.startUpgrade(id);
    const r = sh.planMission();
    clock.advance((r.report.seconds + 3 * 3600) * S); // a few hours between missions
    sh.tick();
    sh.applyMission(r.report);
  }
  assert.equal(state.cleared, MISSIONS.length);
  assert.deepEqual(sh.home(), ['nadia', 'theo', 'grace']);
});
