// Consistency checks for safehouse/src/config.js and story.js, so tuning edits
// can't silently break progression, and so the tables keep matching the design
// doc where it gives numbers.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESOURCES,
  STATIONS,
  STATION_ORDER,
  LADDER,
  RECIPES,
  ITEMS,
  SLOTS,
  WEAPONS,
  WEAPON_ORDER,
  WEAPON_TIERS,
  ATTACHMENTS,
  SURVIVORS,
  SURVIVOR_ORDER,
  CHAPTERS,
  MISSIONS,
  SECTION_KINDS,
  RESCUE_CALLS,
  STAGES,
  ORDERS,
  FRIENDS,
  POWER,
  BOND,
} from '../safehouse/src/config.js';
import { BIOS, LINES, BANTER, BOND_CHAPTERS, CALL_TEXT, CHAPTER_TEXT, SCENES, MOVE_IN } from '../safehouse/src/story.js';
import { WEAPONS as GAME_WEAPONS } from '../src/game/weapons.js';

const ids = Object.keys(STATIONS);
const MAX = 5;

test('eight stations, each with five levels, listed once in the display order', () => {
  assert.equal(ids.length, 8);
  assert.deepEqual([...STATION_ORDER].sort(), [...ids].sort());
  for (const id of ids) {
    assert.equal(STATIONS[id].station, id);
    assert.equal(STATIONS[id].levels.length, MAX, id);
  }
});

test('station levels follow the base ladder times a factor between 0.5x and 2x', () => {
  for (const id of ids) {
    const def = STATIONS[id];
    assert.ok(def.factor >= 0.5 && def.factor <= 2, id);
    def.levels.forEach((row, i) => {
      const step = LADDER[i];
      const where = `${id} L${i + 1}`;
      assert.equal(row.level, i + 1, where);
      assert.equal(row.buildSeconds, step.buildSeconds, where);
      assert.equal(row.chaptersCleared, step.chaptersCleared, where);
      assert.ok(Math.abs((row.cost.scrap || 0) - step.scrap * def.factor) <= 2.5, where);
      assert.ok(Math.abs((row.cost.parts || 0) - step.parts * def.factor) <= 0.5, where);
      for (const r of Object.keys(row.cost)) assert.ok(RESOURCES.includes(r), where);
    });
  }
  // Maxing one station takes about 31 hours of timers.
  const hours = LADDER.reduce((a, s) => a + s.buildSeconds, 0) / 3600;
  assert.ok(hours > 30.5 && hours < 31.5, `${hours} h`);
});

test('unlocks and power draw match the station table', () => {
  const want = {
    barricade: [0, 0],
    generator: [0, 0],
    barracks: [0, 0],
    workshop: [1, 2],
    infirmary: [1, 2],
    armory: [2, 0],
    radio: [2, 0],
    scrapyard: [3, 1],
  };
  for (const [id, [unlock, draw]] of Object.entries(want)) {
    assert.equal(STATIONS[id].unlock, unlock, id);
    for (const row of STATIONS[id].levels) assert.equal(row.powerDraw, draw, id);
  }
  assert.equal(STATIONS.barracks.start, 1, 'the Barracks is pre-built');
});

test('the Generator table: power capacity and Fuel tank', () => {
  assert.deepEqual(
    STATIONS.generator.levels.map((r) => [r.powerCap, r.fuelTank]),
    [[3, 20], [4, 40], [5, 70], [6, 110], [8, 160]],
  );
});

test('Barracks: one bunk per level, bond chapters at 4, a perk slot at 5', () => {
  assert.deepEqual(STATIONS.barracks.levels.map((r) => r.bunks), [1, 2, 3, 4, 5]);
  assert.ok(STATIONS.barracks.levels[3].bondChapters);
  assert.ok(STATIONS.barracks.levels[4].perkSlot);
});

test('build slots: one at the start, two at Barricade 3, three at Barricade 5', () => {
  assert.equal(STATIONS.barricade.base.buildSlots, 1);
  assert.deepEqual(STATIONS.barricade.levels.map((r) => r.buildSlots), [1, 1, 2, 2, 3]);
});

test('storage caps only go up, and every Parts and Supplies cost fits the cap at the Barricade level that allows it', () => {
  const caps = [STATIONS.barricade.base, ...STATIONS.barricade.levels];
  for (let b = 1; b < caps.length; b++) {
    assert.ok(caps[b].partsCap >= caps[b - 1].partsCap && caps[b].suppliesCap >= caps[b - 1].suppliesCap);
  }
  for (const id of ids) {
    STATIONS[id].levels.forEach((row, i) => {
      const lvl = i + 1;
      // The Barricade level when this upgrade can first start.
      const b = id === 'barricade' ? lvl - 1 : Math.max(STATIONS[id].unlock, lvl - 1);
      assert.ok((row.cost.parts || 0) <= caps[b].partsCap, `${id} L${lvl} parts ${row.cost.parts} > cap ${caps[b].partsCap} at Barricade ${b}`);
    });
  }
  for (const r of Object.values(RECIPES)) {
    const b = STATIONS[r.station].unlock;
    assert.ok((r.cost.parts || 0) <= caps[b].partsCap, r.id);
    assert.ok((r.cost.supplies || 0) <= caps[b].suppliesCap, r.id);
  }
  WEAPON_TIERS.forEach((t) => {
    if (!t.cost) return;
    const armory = STATIONS.armory.levels.findIndex((r) => r.maxTier >= t.tier) + 1;
    const b = Math.max(STATIONS.armory.unlock, armory - 1);
    assert.ok(t.cost.parts <= caps[b].partsCap, t.name);
  });
});

test('the crafting table matches the doc, and every crafted item has one recipe', () => {
  const doc = {
    pipe_bomb: ['throwable', 'workshop', 1, { scrap: 20, parts: 5 }, 120, 1],
    molotov: ['throwable', 'workshop', 2, { scrap: 15, supplies: 5 }, 180, 1],
    lure_flare: ['throwable', 'workshop', 3, { scrap: 25, parts: 10 }, 300, 2],
    first_aid_kit: ['heal', 'infirmary', 1, { supplies: 20 }, 180, 1],
    defibrillator: ['heal', 'infirmary', 4, { supplies: 30, parts: 20 }, 900, 3],
    pain_pills: ['boost', 'infirmary', 2, { supplies: 10 }, 120, 1],
    adrenaline: ['boost', 'infirmary', 3, { supplies: 15, parts: 5 }, 240, 1],
  };
  for (const [id, [slot, station, lvl, cost, secs, fuel]] of Object.entries(doc)) {
    const r = RECIPES[id];
    assert.ok(r, id);
    assert.deepEqual([r.output.slot, r.station, r.unlockLevel, r.cost, r.seconds, r.fuel], [slot, station, lvl, cost, secs, fuel], id);
  }
  for (const r of Object.values(RECIPES)) {
    assert.ok(r.fuel >= 1 && r.fuel <= 5, `${r.id}: Fuel 1-5`);
    assert.ok(r.unlockLevel >= 1 && r.unlockLevel <= MAX, r.id);
    if (r.output.item) {
      assert.ok(ITEMS[r.output.item], r.id);
      assert.equal(ITEMS[r.output.item].slot, r.output.slot, r.id);
    }
  }
  for (const [id, it] of Object.entries(ITEMS)) {
    assert.ok(SLOTS.includes(it.slot), id);
    const makers = Object.values(RECIPES).filter((r) => r.output.item === id);
    assert.equal(makers.length, it.free ? 0 : 1, id);
  }
  for (const id of ids) for (const row of STATIONS[id].levels) if (row.attachment) assert.ok(ATTACHMENTS[row.attachment], id);
});

test('weapon ids match the action game', () => {
  const game = new Set(GAME_WEAPONS.map((w) => w.id));
  for (const id of WEAPON_ORDER) assert.ok(game.has(id), id);
  assert.deepEqual([...WEAPON_ORDER].sort(), Object.keys(WEAPONS).sort());
  for (const row of STATIONS.armory.levels) if (row.weapon) assert.ok(WEAPONS[row.weapon]);
  for (const f of Object.values(FRIENDS)) assert.ok(WEAPONS[f.weapon] && WEAPON_TIERS[f.tier - 1]);
});

test('named survivors are tuned below a competent human, above a generic bot', () => {
  const maxBond = BOND.levels.length - 1;
  const human = POWER.you + Math.min(...Object.values(WEAPONS).map((w) => w.power));
  assert.ok(POWER.survivor + POWER.perBond * maxBond < human);
  assert.ok(POWER.bot < POWER.survivor);
});

test('chapters: three missions each, the finale last, one horde or finale stretch, 5-8 minutes', () => {
  assert.equal(CHAPTERS.length, 12);
  for (const ch of CHAPTERS) {
    assert.equal(ch.missions.length, 3);
    assert.ok(CHAPTER_TEXT[ch.n], `chapter ${ch.n} text`);
    if (ch.rescue) assert.ok(SURVIVORS[ch.rescue].arrives.chapter === ch.n);
  }
  for (const m of Object.values(MISSIONS)) {
    assert.ok(m.seconds >= 300 && m.seconds <= 480, `${m.id} ${m.seconds}s`);
    assert.equal(m.sections.filter((s) => s.kind !== 'run').length, 1, m.id);
    for (const s of m.sections) assert.ok(SECTION_KINDS[s.kind] && s.threat > 0, m.id);
    assert.equal(m.finale, m.index === 3, m.id);
    if (m.finale) assert.equal(m.sections.at(-1).kind, 'finale', m.id);
    if (m.fuelCans) assert.ok(m.fuelCans.section < m.sections.length, m.id);
  }
  // Threat rises with every chapter.
  for (let c = 2; c <= 12; c++) assert.ok(MISSIONS[`c${c}m1`].threat > MISSIONS[`c${c - 1}m1`].threat);
});

test('the Radio Room can open every chapter the gates ask for, with no deadlock', () => {
  const radio = [STATIONS.radio.base, ...STATIONS.radio.levels].map((r) => r.chapters);
  // Clear everything open, then build the highest Radio level the gates allow, repeat.
  let cleared = 0;
  let level = 0;
  for (let guard = 0; guard < 20; guard++) {
    cleared = Math.max(cleared, Math.min(CHAPTERS.length, radio[level]));
    while (level < MAX && LADDER[level].chaptersCleared <= cleared) level++;
  }
  assert.equal(cleared, CHAPTERS.length);
  assert.ok(LADDER.every((s) => s.chaptersCleared <= CHAPTERS.length));
});

test('every survivor has a story: bio, lines, banter, a bond chapter and a way to arrive', () => {
  const perks = new Set();
  for (const id of SURVIVOR_ORDER) {
    const s = SURVIVORS[id];
    assert.ok(BIOS[id] && LINES[id] && BANTER[id] && BOND_CHAPTERS[id], id);
    for (const k of ['first', 'win', 'wipe', 'close', 'throw', 'idle', 'waiting']) assert.ok(LINES[id][k], `${id}.${k}`);
    assert.ok(!perks.has(s.perk.id) && !perks.has(s.veteran.id), id);
    perks.add(s.perk.id);
    perks.add(s.veteran.id);
    assert.equal(s.perk.values.length, 2);
    if (s.arrives.radio) assert.ok(RESCUE_CALLS[id] && CALL_TEXT[id], id);
    if (!s.arrives.start) assert.ok(SCENES[`rescue_${id}`], id);
    if (!s.arrives.start) assert.ok(MOVE_IN[id], id);
  }
  // Survivors arrive one bunk at a time: start + story rescues + radio calls fit five bunks.
  assert.equal(SURVIVOR_ORDER.length, STATIONS.barracks.levels.at(-1).bunks);
});

test('stage goals and orders refer to things that exist', () => {
  for (const st of STAGES) {
    assert.ok(st.name && st.idea && st.when && st.goals.length);
    for (const g of st.goals) {
      if (g.level) {
        assert.ok(STATIONS[g.level[0]], g.text);
        assert.ok(g.level[1] >= 1 && g.level[1] <= MAX, g.text);
      }
      if (g.housed) assert.ok(g.housed <= SURVIVOR_ORDER.length);
    }
  }
  for (const o of ORDERS.types) assert.ok(o.text && o.n.length, o.type);
});
