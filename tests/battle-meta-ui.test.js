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
import { Battle, DT } from '../battle/src/sim/battle.js';
import { cardStats, cardKindLine, demoStyle, legendWords, newCardsLine, firstTipLines, andList } from '../battle/src/ui/hub-kit.js';
import { ARENAS } from '../battle/src/meta/collection.js';
import { firstsOf } from '../battle/src/meta/profile.js';
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

/** A still enemy `unit` with its hip `d` px in front of a blue crane's face: { hit, air } after up to 10 s (hit: the ball hit it; air: it was high air then). */
function craneVs(unit, d, seed = 7) {
  const b = new Battle(seed, { mode: 'arena' });
  const crane = b.addBuilding('wreckingCrane', 'blue', 500, 1);
  const u = b.addUnit(unit, 'red', crane.x + crane.f * (crane.w / 2 + d), 0.5);
  u.speed = 0;
  u.hp = u.maxHp = 1e6;
  for (let i = 0; i < 10 / DT; i++) {
    u.cooldown = 1e9;
    b.step(DT);
    const hit = b.events.some((e) => e.type === 'hit' && e.kind === 'crane' && e.unit === u);
    b.events.length = 0;
    if (hit) return { hit: true, air: u.air };
  }
  return { hit: false, air: u.air };
}

test('card details: the Crane\'s Reach is how far its ball hits, not where it wakes, and it hits fliers it sweeps', () => {
  const B = BUILDINGS.wreckingCrane;
  const reach = cardStats('wreckingCrane', 1).find((r) => r.label === 'Reach').value;
  assert.ok(reach < B.pendulum.sense - B.w / 2, `Reach ${reach} is inside the wake-up range`);
  assert.ok(reach <= B.pendulum.pivotFwd + B.pendulum.L * Math.sin(B.pendulum.maxAng) + B.pendulum.r - B.w / 2, 'and never past the full swing');
  // In play (hip from the mast's face, the Box's measure): well inside it is hit, past it never
  // (a big Bruiser is hit a little farther out than a Clubber or an Archer)
  for (const [unit, past] of [['clubber', 25], ['archer', 25], ['bruiser', 40]]) {
    assert.equal(craneVs(unit, reach - 30).hit, true, `${unit} at Reach - 30`);
    assert.equal(craneVs(unit, reach + past).hit, false, `${unit} at Reach + ${past}`);
  }
  // Targets: the ball sweeps Propeller Pals out of the air at their cruise height
  assert.equal(cardStats('wreckingCrane', 1).find((r) => r.label === 'Targets').value, 'Air & ground');
  assert.deepEqual(craneVs('copter', reach - 30), { hit: true, air: true }, 'a Pal in high air is hit');
});

test('celebrations and tips: one card reads singular, two to six plural', () => {
  const NAMES = ['Wrecking Crane', 'Pelican', 'Big Jelly', 'Bomb Juggler', 'Boing Box', 'Bean Patch'];
  for (let n = 1; n <= 6; n++) {
    const names = NAMES.slice(0, n);
    const [lead, text] = legendWords(names, false, 5);
    assert.equal(lead, n > 1 ? 'Legendaries! ' : 'A Legendary! ', `${n}`);
    assert.equal(text, `${andList(names)} ${n > 1 ? 'join' : 'joins'} the Big Chests and the shop.`, `${n}`);
    assert.ok(legendWords(names, true, 5)[1].startsWith(`${andList(names)}: in Big Chests (5%)`), `${n}`);
    assert.ok(newCardsLine(n).startsWith(n > 1 ? 'New cards! ' : 'A new card! '), `${n}`);
  }
  assert.equal(andList(NAMES.slice(0, 3)), 'Wrecking Crane, Pelican and Big Jelly');
  assert.equal(legendWords([], false, 5), null);
  // Every arena that unlocks a Legendary, as the celebration says it
  const said = [];
  for (let i = 0; i < ARENAS.length; i++) {
    const legs = CARD_ORDER.filter((id) => CARDS[id].arena === i && CARDS[id].rarity === 'legendary').map((id) => CARDS[id].name);
    const first = !CARD_ORDER.some((id) => CARDS[id].rarity === 'legendary' && CARDS[id].arena < i);
    if (legs.length) said.push(legendWords(legs, first, 5).join(''));
  }
  assert.ok(said.includes('A Legendary! Wrecking Crane joins the Big Chests and the shop.'), said.join(' | '));
  assert.ok(said.includes('Legendaries! Pelican and Big Jelly join the Big Chests and the shop.'), said.join(' | '));
  // The first-flier tip: "fly ... them" for a group, "flies ... it" for one, whatever the count
  for (let count = 1; count <= 6; count++) {
    const t = firstTipLines({ ...CARDS.propellerPals, count }, 5).flier;
    assert.ok(count > 1 ? / fly! .* hit them:/.test(t) : / flies! .* hit it:/.test(t), `${count}: ${t}`);
  }
  for (const id of CARD_ORDER) {
    const card = CARDS[id];
    const lines = firstTipLines(card, 5);
    for (const k of firstsOf(card)) assert.ok(lines[k].startsWith(card.name + ' ') && !/undefined|NaN/.test(lines[k]), `${id} ${k}: ${lines[k]}`);
    if (card.flying) assert.ok(lines.flier.includes(card.count > 1 ? ' fly!' : ' flies!'), id);
  }
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
