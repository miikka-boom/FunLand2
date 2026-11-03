// Consistency checks for evac/src/config.js so tuning edits can't break the road.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGNS, CHAPTERS_PER_CAMPAIGN, CHAPTER_TYPES, SURVIVORS, SURVIVOR_ORDER, WEAPONS, WEAPON_ORDER, LEVEL_COST, MAX_LEVEL, STAR_MULT } from '../evac/src/config.js';
import { WEAPONS as GAME_WEAPONS } from '../src/game/weapons.js';

test('every district has four chapters and a finale, getting harder and richer', () => {
  let prevChapterRec = 0; // finales are spikes: the next district starts above its 4th chapter
  let prevSupplies = 0;
  for (const c of CAMPAIGNS) {
    assert.equal(c.chapters.length, CHAPTERS_PER_CAMPAIGN, c.id);
    let prevRec = prevChapterRec;
    c.chapters.forEach((ch, k) => {
      assert.ok(CHAPTER_TYPES[ch.type], `${c.id} ${ch.name}: type`);
      assert.equal(ch.type === 'finale', k === CHAPTERS_PER_CAMPAIGN - 1, `${c.id} ${ch.name}: finale last`);
      assert.ok(ch.rec > prevRec, `${c.id} ${ch.name}: recommended power must rise`);
      prevRec = ch.rec;
      if (k === CHAPTERS_PER_CAMPAIGN - 2) prevChapterRec = ch.rec;
      if (ch.type !== 'finale') {
        assert.ok(ch.supplies >= prevSupplies, `${c.id} ${ch.name}: rewards must not drop`);
        prevSupplies = ch.supplies;
      }
      assert.ok(ch.text && ch.text.length < 90, `${c.id} ${ch.name}: short briefing text`);
    });
  }
});

test('the road unlocks every gun and survivor exactly once, and ends at the evac', () => {
  const weapons = new Set(WEAPON_ORDER.filter((id) => WEAPONS[id].start));
  const survivors = new Set(SURVIVOR_ORDER.filter((id) => SURVIVORS[id].start));
  let evac = 0;
  for (const c of CAMPAIGNS) {
    for (const ch of c.chapters) {
      const u = ch.unlock;
      if (!u) continue;
      if (u.weapon) {
        assert.ok(WEAPONS[u.weapon] && !weapons.has(u.weapon), u.weapon);
        weapons.add(u.weapon);
      }
      if (u.survivor) {
        assert.ok(SURVIVORS[u.survivor] && !survivors.has(u.survivor), u.survivor);
        survivors.add(u.survivor);
      }
      if (u.evac) evac++;
    }
  }
  assert.equal(weapons.size, WEAPON_ORDER.length);
  assert.equal(survivors.size, SURVIVOR_ORDER.length);
  assert.equal(evac, 1);
  assert.ok(CAMPAIGNS.at(-1).chapters.at(-1).unlock.evac);
});

test('each new gun is stronger than the one before it', () => {
  for (let k = 1; k < WEAPON_ORDER.length; k++) assert.ok(WEAPONS[WEAPON_ORDER[k]].base > WEAPONS[WEAPON_ORDER[k - 1]].base);
});

test('guns marked as game weapons match the action game table', () => {
  const ids = GAME_WEAPONS.map((w) => w.id);
  for (const id of WEAPON_ORDER) if (WEAPONS[id].game) assert.ok(ids.includes(WEAPONS[id].game), id);
  for (const id of ids) assert.ok(WEAPON_ORDER.some((w) => WEAPONS[w].game === id), `game weapon ${id} is on the road`);
});

test('level costs rise and cover every level', () => {
  assert.equal(LEVEL_COST.length, MAX_LEVEL - 1);
  for (let k = 1; k < LEVEL_COST.length; k++) assert.ok(LEVEL_COST[k] > LEVEL_COST[k - 1]);
  assert.deepEqual(STAR_MULT.length, 4);
});
