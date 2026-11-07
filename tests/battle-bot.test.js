import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, REGULATION, OVERTIME, MANA_MAX } from '../battle/src/sim/match.js';
import { DT } from '../battle/src/sim/battle.js';
import { Bot, BOT_TUNING } from '../battle/src/sim/bot.js';
import { CARDS, STARTER_DECK } from '../battle/src/sim/cards.js';
import { WORLD } from '../battle/src/config.js';

const DECK_B = ['bruiser', 'brick', 'archers', 'megaBomb', 'bombSquad', 'cheeseWheel', 'shieldWall', 'spikers'];
const DECK_C = ['clubbers', 'squire', 'spikers', 'bomb', 'arrowRain', 'boulder', 'cheeseWheel', 'clubberGang'];
const TEAMS = ['blue', 'red'];

function match(seed, blue = STARTER_DECK, red = STARTER_DECK, level = 1) {
  const side = (deck) => ({ deck, levels: Object.fromEntries(deck.map((id) => [id, level])), kingLevel: level });
  return new Match({ seed, blue: side(blue), red: side(red) });
}

/**
 * Watch every match.play() call: was it legal (canPlay '' at the moment of the
 * call), where did it go, and did it succeed.
 */
function spyPlays(m) {
  const calls = [];
  const play = m.play.bind(m);
  m.play = (team, i, x) => {
    const id = m.sides[team].hand[i];
    const why = m.canPlay(team, i, x);
    const zone = m.zone(team);
    const mana = m.sides[team].mana;
    const ok = play(team, i, x);
    calls.push({ t: m.time, team, id, x, why, ok, zone, mana });
    return ok;
  };
  return calls;
}

/** Step bots + match for `secs` (or to the end); fn(m) after every step may return false to stop. */
function run(m, bots, secs = REGULATION + OVERTIME + 1, fn = null) {
  for (let s = 0; s < secs / DT && m.phase !== 'over'; s++) {
    for (const b of bots) b.update(DT);
    m.step();
    m.battle.events.length = 0;
    if (fn && fn(m) === false) break;
  }
}

const fingerprint = (m, bots) =>
  [
    m.winner,
    m.time.toFixed(4),
    JSON.stringify(m.crowns),
    m.battle.towers.map((t) => t.hp.toFixed(4)).join(),
    m.battle.units.map((u) => `${u.type.id}:${u.hip.x.toFixed(3)}`).join('|'),
    ...bots.map((b) => b.log.map((l) => `${l.t.toFixed(3)}:${l.card}:${l.x.toFixed(2)}`).join(',')),
  ].join(' / ');

test('skill scales reaction time, looks, placement noise and choice noise; the Training Dummy plays by its own rules', () => {
  const m = match(1);
  const at = (skill) => new Bot(m, 'red', { skill, seed: 3 });
  const lo = at(0);
  const hi = at(1);
  assert.ok(Math.abs(lo.react - BOT_TUNING.react[0]) < 1e-9 && Math.abs(hi.react - BOT_TUNING.react[1]) < 1e-9);
  assert.ok(lo.react >= 1.4 && lo.react <= 1.6 && hi.react >= 0.25 && hi.react <= 0.35, `react ${lo.react} .. ${hi.react}`);
  let prev = null;
  for (const k of [0, 0.25, 0.5, 0.75, 1]) {
    const b = at(k);
    if (prev) {
      assert.ok(b.react < prev.react && b.tickT < prev.tickT && b.noise < prev.noise && b.choiceNoise < prev.choiceNoise, `skill ${k}`);
      assert.ok(b.spellValue >= prev.spellValue, 'better players wait for better spells');
    }
    prev = b;
  }
  const dummy = at(0.05);
  assert.ok(dummy.dummy && !at(0.3).dummy);
  assert.ok(dummy.gap >= 4, `the dummy waits ${dummy.gap} s between cards`);
  assert.equal(at(-1).skill, 0);
  assert.equal(at(7).skill, 1);
});

test('bots only make legal plays (mana, zone, card), through match.play(), and mana stays in [0, 10]', () => {
  const cases = [
    [11, STARTER_DECK, STARTER_DECK, 0.05, 1],
    [12, DECK_B, STARTER_DECK, 0.5, 0.3],
    [13, DECK_C, DECK_B, 0.9, 0.7],
  ];
  for (const [seed, bd, rd, sb, sr] of cases) {
    const m = match(seed, bd, rd);
    const calls = spyPlays(m);
    const bots = [new Bot(m, 'blue', { skill: sb, seed: seed * 2 }), new Bot(m, 'red', { skill: sr, seed: seed * 2 + 1 })];
    let lo = Infinity;
    let hi = -Infinity;
    const played = { blue: 0, red: 0 };
    run(m, bots, 100, () => {
      for (const t of TEAMS) {
        lo = Math.min(lo, m.sides[t].mana);
        hi = Math.max(hi, m.sides[t].mana);
        played[t] = m.sides[t].played;
      }
    });
    assert.ok(calls.length > 10, `seed ${seed}: only ${calls.length} plays`);
    for (const c of calls) {
      assert.equal(c.why, '', `seed ${seed}: illegal play ${JSON.stringify(c)}`);
      assert.ok(c.ok);
      const card = CARDS[c.id];
      assert.ok(c.mana >= card.mana, 'paid for');
      if (card.kind === 'spell') assert.ok(c.x >= 0 && c.x <= WORLD.width);
      else assert.ok(c.x >= c.zone[0] && c.x <= c.zone[1], `unit card ${c.id} at ${c.x} outside ${c.zone}`);
    }
    assert.ok(lo >= 0 && hi <= MANA_MAX + 1e-9, `mana went ${lo} .. ${hi}`);
    // Every card a side played went through the spied play() (no back doors)
    for (const [i, b] of bots.entries()) {
      const team = TEAMS[i];
      assert.equal(calls.filter((c) => c.team === team).length, played[team]);
      assert.equal(b.stats.plays, played[team]);
      assert.equal(b.log.length, played[team]);
    }
    // The dummy never casts spells
    for (const b of bots) if (b.dummy) assert.ok(!b.log.some((l) => CARDS[l.card].kind === 'spell'), 'dummy cast a spell');
  }
});

test('determinism: same match, team and seed -> same plays; another bot seed plays differently', () => {
  const play = (botSeed) => {
    const m = match(21, STARTER_DECK, DECK_C);
    const bots = [new Bot(m, 'blue', { skill: 0.7, seed: botSeed }), new Bot(m, 'red', { skill: 0.4, seed: 99 })];
    run(m, bots, 45);
    return fingerprint(m, bots);
  };
  const a = play(5);
  assert.equal(play(5), a);
  assert.notEqual(play(6), a);
});

test('no peeking: the other side\'s hidden hand, queue and mana bar never change what a bot does', () => {
  const play = (tamper) => {
    const m = match(25, STARTER_DECK, DECK_B);
    const bot = new Bot(m, 'blue', { skill: 0.8, seed: 9 });
    // Red never plays here; its secrets get scrambled every step in the tampered run
    run(m, [bot], 40, () => {
      if (!tamper) return;
      const r = m.sides.red;
      r.mana = (m.steps * 7) % 11;
      const all = [...r.hand, ...r.queue].reverse();
      r.hand = all.slice(0, 4);
      r.queue = all.slice(4);
      r.next = r.queue[0];
    });
    return bot.log.map((l) => `${l.t.toFixed(3)}:${l.card}:${l.x.toFixed(2)}`).join(',');
  };
  const honest = play(false);
  assert.ok(honest.length > 0);
  assert.equal(play(true), honest);
});

test('a full bot-vs-bot match ends with a result and finite state, and a careful bot never sits on full mana for long', () => {
  const m = match(31, STARTER_DECK, DECK_B, 2);
  const bots = [new Bot(m, 'blue', { skill: 0.8, seed: 1 }), new Bot(m, 'red', { skill: 0.8, seed: 2 })];
  let maxUnits = 0;
  run(m, bots, REGULATION + OVERTIME + 5, () => {
    maxUnits = Math.max(maxUnits, m.battle.units.length);
  });
  assert.equal(m.phase, 'over');
  assert.ok(['blue', 'red', 'draw'].includes(m.winner));
  assert.ok(m.time <= REGULATION + OVERTIME + DT * 2);
  assert.ok(m.battle.units.every((u) => u.parts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))));
  assert.ok(m.battle.towers.every((t) => Number.isFinite(t.hp)));
  assert.ok(maxUnits < 70, `${maxUnits} units at once`);
  for (const b of bots) {
    assert.ok(b.stats.plays > 12, `${b.team} played only ${b.stats.plays} cards`);
    assert.ok(b.stats.full < 10, `${b.team} sat at full mana for ${b.stats.full.toFixed(1)} s`);
  }
});

test('defence: enemy beans coming over get an answer between them and the tower, in time', () => {
  const m = match(41, STARTER_DECK, ['clubbers', 'squire', 'spikers', 'clubberGang', 'archers', 'bomb', 'arrowRain', 'boulder']);
  const bot = new Bot(m, 'red', { skill: 0.9, seed: 4 });
  const s = m.sides.blue;
  s.mana = 10;
  // Blue drops a Clubber Gang at the bridge: it walks on red's Guard Tower
  s.hand[0] = 'clubberGang';
  assert.ok(m.play('blue', 0, 700));
  let answered = null;
  run(m, [bot], 12, () => {
    const l = bot.log.find((p) => CARDS[p.card].kind === 'unit' || p.why === 'defend' || p.why === 'spell');
    if (l) {
      answered = l;
      return false;
    }
  });
  assert.ok(answered, 'no answer to a Clubber Gang');
  const lead = Math.max(...m.battle.units.filter((u) => u.team === 'blue' && u.alive).map((u) => u.hip.x), 0);
  if (CARDS[answered.card].kind === 'unit') {
    assert.ok(answered.x > WORLD.towerX.red - 120 && answered.x < 1300, `answered at ${answered.x}`);
    assert.ok(lead === 0 || answered.x >= lead - 40, `defender dropped behind the attackers (${answered.x} vs ${lead})`);
  }
  assert.ok(answered.t < 9, `answered only at ${answered.t.toFixed(1)} s`);
});

test('spells: a big cluster gets a spell, a low tower gets finished, and the Training Dummy never casts', () => {
  // A cluster of swarm beans on red's half
  const m = match(51, STARTER_DECK, STARTER_DECK);
  const red = m.sides.red;
  red.hand = ['arrowRain', 'boulder', 'squire', 'bomb'];
  red.mana = 10;
  for (const [i, x] of [880, 900, 915, 930, 950].entries()) m.battle.addUnit(i % 2 ? 'archer' : 'spiker', 'blue', x, 0.5);
  const bot = new Bot(m, 'red', { skill: 0.8, seed: 5 });
  run(m, [bot], 3, () => bot.stats.spells === 0);
  const cast = bot.log.find((l) => CARDS[l.card].kind === 'spell');
  assert.ok(cast, 'no spell on a juicy cluster');
  assert.ok(Math.abs(cast.x - 915) < 160, `spell at ${cast.x}`);

  // A Guard Tower on its last legs: the spell goes on it
  const f = match(52, STARTER_DECK, STARTER_DECK);
  const g = f.battle.towers.find((t) => t.team === 'blue' && t.kind === 'guard');
  g.hp = 10;
  f.sides.red.hand = ['boulder', 'squire', 'archers', 'bomb'];
  f.sides.red.mana = 6;
  const fin = new Bot(f, 'red', { skill: 0.7, seed: 6 });
  run(f, [fin], 3, () => g.alive);
  assert.equal(fin.log[0] && fin.log[0].card, 'boulder');
  assert.ok(!g.alive, 'the boulder finished the tower');
  assert.equal(f.crowns.red, 1);

  // Same cluster, the dummy: only units, slowly
  const d = match(53, STARTER_DECK, STARTER_DECK);
  d.sides.red.hand = ['arrowRain', 'boulder', 'squire', 'bomb'];
  for (const x of [880, 900, 920]) d.battle.addUnit('spiker', 'blue', x, 0.5);
  const dummy = new Bot(d, 'red', { skill: 0.05, seed: 7 });
  run(d, [dummy], 20);
  assert.ok(dummy.log.every((l) => CARDS[l.card].kind === 'unit'), 'the dummy cast a spell');
  assert.ok(dummy.log.length <= 4, `the dummy played ${dummy.log.length} cards in 20 s`);
});

test('skill wins: a 0.6 bot beats the Training Dummy in a small seeded series', () => {
  let wins = 0;
  const n = 4;
  for (let k = 0; k < n; k++) {
    const m = match(60 + k);
    const good = k % 2 ? 'red' : 'blue';
    const bots = TEAMS.map((t) => new Bot(m, t, { skill: t === good ? 0.6 : 0.05, seed: 70 + k }));
    run(m, bots);
    if (m.winner === good) wins++;
  }
  assert.ok(wins >= n - 1, `the 0.6 bot won ${wins} of ${n} against the dummy`);
});
