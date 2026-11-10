// Card detail text for the 18 newer cards: every number the detail sheet
// shows is read from the live sim tables, never copied into the UI. The tests
// patch table numbers in place, check the text follows, and put them back.
// Also the hub's demo match: it shows the arena's newest styles.
// Run: node --test tests/battle-meta-ui.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CARD_ORDER, MAX_LEVEL } from '../battle/src/sim/cards.js';
import { UNIT_TYPES, BEAT, MAX_JBOMBS } from '../battle/src/sim/unit-types.js';
import { SPELLS } from '../battle/src/sim/spells.js';
import { BUILDINGS } from '../battle/src/sim/buildings.js';
import { TOWER_TAKES } from '../battle/src/sim/towers.js';
import { cardStats, cardKindLine, demoStyle } from '../battle/src/ui/hub-kit.js';
import { ARCHETYPES, archetypesFor } from '../battle/src/meta/opponents.js';
import { rngFrom } from '../battle/src/meta/profile.js';

const NEWER = CARD_ORDER.slice(14);
const SPELL_KEY = { cheeseWheel: 'wheel' };

/** The tables a card's detail may read from. */
function sourcesOf(card) {
  const out = [card];
  if (card.kind === 'unit') {
    out.push(UNIT_TYPES[card.unit]);
    if (UNIT_TYPES[card.unit].beat) out.push(BEAT);
  } else if (card.kind === 'building') out.push(BUILDINGS[card.building]);
  else out.push(SPELLS[SPELL_KEY[card.spell] || card.spell], TOWER_TAKES);
  return out.filter(Boolean);
}

/** Every finite number in a table (nested objects and arrays too): [holder, key]. */
function numbers(obj, out = [], seen = new Set()) {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return out;
  seen.add(obj);
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) out.push([obj, k]);
    else if (v && typeof v === 'object') numbers(v, out, seen);
  }
  return out;
}

/** The detail sheet's text lines for a card: the kind line, then "label: value -> next" per row. */
function detailText(id, level) {
  const card = CARDS[id];
  return [cardKindLine(card), ...cardStats(id, level).map((r) => `${r.label}: ${r.value} -> ${r.next ?? '-'}`)];
}
const tokens = (s) => s.match(/\d+(?:\.\d+)?/g) || [];

/** Run fn with each [holder, key] patched to f(old), then put every value back. */
function patched(list, f, fn) {
  const old = list.map(([o, k]) => o[k]);
  try {
    list.forEach(([o, k], i) => (o[k] = f(old[i])));
    return fn();
  } finally {
    list.forEach(([o, k], i) => (o[k] = old[i]));
  }
}

test('card details: no number in a newer card\'s detail stays put when every table number it could read moves', () => {
  const snap = JSON.stringify([CARDS, UNIT_TYPES, SPELLS, BUILDINGS, TOWER_TAKES, BEAT]);
  for (const id of NEWER) {
    for (const level of [1, 4, MAX_LEVEL]) {
      const base = detailText(id, level);
      const list = sourcesOf(CARDS[id]).flatMap((t) => numbers(t));
      const moved = patched(list, (v) => v * 3 + 1.25, () => detailText(id, level));
      assert.equal(moved.length, base.length, `${id}: the same rows`);
      base.forEach((line, i) => {
        const a = tokens(line);
        const b = tokens(moved[i]);
        a.forEach((n, j) => assert.notEqual(b[j], n, `${id} L${level}: "${line}" keeps ${n} although every table number moved ("${moved[i]}")`));
      });
    }
  }
  assert.equal(JSON.stringify([CARDS, UNIT_TYPES, SPELLS, BUILDINGS, TOWER_TAKES, BEAT]), snap, 'every table is back as it was');
});

test('card details: each number row of a newer card follows one table value (patched, then put back)', () => {
  for (const id of NEWER) {
    const base = detailText(id, 1);
    const followed = base.map((line) => tokens(line).length === 0);
    for (const leaf of sourcesOf(CARDS[id]).flatMap((t) => numbers(t))) {
      const now = patched([leaf], (v) => v * 2 + 7, () => detailText(id, 1));
      now.forEach((line, i) => {
        if (line !== base[i]) followed[i] = true;
      });
    }
    base.forEach((line, i) => assert.ok(followed[i], `${id}: "${line}" changes with no table value`));
  }
});

test('card details: the Drummer, Juggler, buildings and newer spells read exactly what the sim uses', () => {
  const row = (id, label, lv = 1) => cardStats(id, lv).find((r) => r.label === label);
  // The beat: tempo and walking speed from BEAT (equal: one number; apart: both)
  assert.equal(row('tummyDrummer', 'Beat').value, `Friends ×${BEAT.tempo} faster`);
  patched([[BEAT, 'tempo'], [BEAT, 'move']], () => 1.75, () => assert.equal(row('tummyDrummer', 'Beat').value, 'Friends ×1.75 faster'));
  patched([[BEAT, 'move']], () => 1.2, () => assert.equal(row('tummyDrummer', 'Beat').value, `Friends swing ×${BEAT.tempo}, walk ×1.2`));
  assert.equal(row('tummyDrummer', 'Range').value, `Beat ${UNIT_TYPES.drummer.beat.radius}`);
  // Units and fliers
  for (const id of NEWER.filter((c) => CARDS[c].kind === 'unit')) {
    const t = UNIT_TYPES[CARDS[id].unit];
    assert.equal(row(id, 'Health').value, t.hp, id);
    assert.equal(row(id, 'Health', 2).value, Math.round(t.hp * 1.1), id);
    assert.ok(row(id, 'Units').value.startsWith('×' + CARDS[id].count), id);
  }
  assert.equal(row('bombJuggler', 'Bomb damage').value, UNIT_TYPES.juggler.bomb.damage);
  assert.equal(row('bombJuggler', 'Range').value, `${UNIT_TYPES.juggler.range[0]}–${UNIT_TYPES.juggler.range[1]}`);
  assert.equal(row('nutcracker', 'Bite damage').value, UNIT_TYPES.nutcracker.attack.damage);
  assert.equal(row('pogoBean', 'Bonk damage').value, UNIT_TYPES.pogo.hop.bonk.damage);
  assert.equal(row('pelican', 'Peck damage').value, UNIT_TYPES.pelican.dash.damage);
  assert.equal(row('propellerPals', 'Dive damage').value, UNIT_TYPES.copter.dash.damage);
  assert.equal(row('bigJelly', 'Bump damage').value, UNIT_TYPES.jelly.bump.damage);
  // Buildings: the kind line and the Lifetime row both follow life
  for (const id of NEWER.filter((c) => CARDS[c].kind === 'building')) {
    const B = BUILDINGS[CARDS[id].building];
    assert.equal(cardKindLine(CARDS[id]), `Building · lasts ${B.life} s`, id);
    assert.equal(row(id, 'Lifetime').value, `${B.life} s`, id);
    assert.equal(row(id, 'Health').value, B.hp, id);
    patched([[B, 'life']], () => 99, () => {
      assert.equal(cardKindLine(CARDS[id]), 'Building · lasts 99 s', id);
      assert.equal(row(id, 'Lifetime').value, '99 s', id);
    });
  }
  assert.equal(row('boingBox', 'Punch damage').value, BUILDINGS.boingBox.punch.damage);
  assert.equal(row('wreckingCrane', 'Swing damage').value, BUILDINGS.wreckingCrane.pendulum.damage);
  assert.equal(row('beanPatch', 'Spawns').value, `${UNIT_TYPES[BUILDINGS.beanPatch.spawn.unit].name} / ${BUILDINGS.beanPatch.spawn.every} s`);
  assert.equal(row('beanPatch', 'At once').value, `Up to ${BUILDINGS.beanPatch.spawn.max}`);
  // Spells: damage, tower share (stone), fuse, peels, wrap
  for (const id of ['bigSneeze', 'shakenSoda', 'anvil']) {
    const S = SPELLS[id];
    assert.equal(row(id, 'Damage').value, S.damage, id);
    assert.equal(row(id, 'Tower damage').value, Math.round(S.damage * TOWER_TAKES.spell), id);
    assert.equal(row(id, 'Radius').value, CARDS[id].radius, id);
  }
  assert.equal(row('shakenSoda', 'Pops after').value, `${SPELLS.shakenSoda.fuse} s`);
  assert.equal(row('bananaPeels', 'Slip damage').value, SPELLS.bananaPeels.damage);
  assert.equal(row('bananaPeels', 'Peels').value, `×${SPELLS.bananaPeels.peels}`);
  assert.equal(row('bananaPeels', 'Lasts').value, `${SPELLS.bananaPeels.life} s`);
  assert.equal(row('bubbleWrap', 'Absorbs').value, SPELLS.bubbleWrap.absorb);
  assert.equal(row('bubbleWrap', 'Lasts').value, `${SPELLS.bubbleWrap.time} s`);
});

test('card text: the counts a card\'s blurb spells out ("Three beans...") match its tables', () => {
  const WORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
  for (const id of CARD_ORDER) {
    const card = CARDS[id];
    const S = card.kind === 'spell' ? SPELLS[SPELL_KEY[card.spell] || card.spell] : null;
    const ok = new Set([1, card.count, S && S.peels, S && S.volleys, card.unit === 'juggler' ? MAX_JBOMBS : null].filter((n) => n != null));
    assert.ok(!/\d/.test(card.desc), `${id}: no digits in the blurb ("${card.desc}")`);
    for (const w of card.desc.toLowerCase().match(/\b(one|two|three|four|five|six|seven|eight)\b/g) || []) assert.ok(ok.has(WORD[w]), `${id}: "${w}" in "${card.desc}" matches nothing in its tables`);
  }
});

test('demo match: half the demo decks play the arena\'s newest style(s), Green Hills picks as before', () => {
  for (let arena = 0; arena < 5; arena++) {
    const all = archetypesFor(arena);
    const top = Math.max(0, ...all.map((id) => ARCHETYPES[id].arena || 0));
    let newest = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const id = demoStyle(arena, rngFrom(i, 'attract'));
      assert.ok(all.includes(id), `${arena}: ${id} is a style this arena may pick`);
      if (top && (ARCHETYPES[id].arena || 0) === top) newest++;
      // Green Hills: no newer style yet, so the very same pick as the ladder's (and the demo's before)
      if (!top) assert.equal(id, rngFrom(i, 'attract').pick(all));
    }
    if (top) assert.ok(Math.abs(newest / N - 0.5) < 0.04, `arena ${arena}: ${((100 * newest) / N).toFixed(1)}% newest`);
  }
});
