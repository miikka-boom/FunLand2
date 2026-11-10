// Golden replays: six fixed matches with the 14 original cards, summed up at
// 30, 60 and 120 s. Recorded on the code before the 18 new cards arrived, they
// prove that the new engine work leaves every existing card exactly as it was.
//
// Never edit the expected lines below to make a change pass. Re-record them
// (GOLDEN_PRINT=1 node --test tests/battle-golden.test.js prints fresh ones)
// only in a commit that changes an existing card's number on purpose, and say
// why in that commit.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../battle/src/sim/match.js';
import { DT } from '../battle/src/sim/battle.js';
import { Bot } from '../battle/src/sim/bot.js';
import { CARDS } from '../battle/src/sim/cards.js';
import { Rng } from '../battle/src/sim/rng.js';

const ORIGINAL = ['clubbers', 'squire', 'archers', 'spikers', 'bomb', 'arrowRain', 'boulder', 'clubberGang', 'bruiser', 'brick', 'cheeseWheel', 'bombSquad', 'megaBomb', 'shieldWall'];
const DECK_A = ['clubbers', 'squire', 'archers', 'spikers', 'bomb', 'arrowRain', 'boulder', 'clubberGang'];
const DECK_B = ['bruiser', 'brick', 'archers', 'megaBomb', 'bombSquad', 'cheeseWheel', 'shieldWall', 'spikers'];
const DECK_C = ['clubbers', 'squire', 'spikers', 'bomb', 'arrowRain', 'boulder', 'cheeseWheel', 'clubberGang'];
const DECK_D = ['brick', 'bruiser', 'megaBomb', 'shieldWall', 'archers', 'bombSquad', 'boulder', 'arrowRain'];
const CHECKS = [30, 60, 120];

const side = (deck, level = 1, extra = {}) => ({ deck, levels: Object.fromEntries(deck.map((id) => [id, level])), kingLevel: level, ...extra });

/** A scripted player: every `every` s it plays a hand card picked by its own Rng, at a seeded spot. */
function timer(m, team, seed, every) {
  const rng = new Rng(seed);
  const s = m.sides[team];
  const foe = team === 'blue' ? 'red' : 'blue';
  const period = Math.round(every / DT);
  const phase = team === 'blue' ? 0 : Math.round(period / 2);
  return (step) => {
    if (step % period !== phase) return;
    const i = (rng.next() * 4) | 0;
    const card = CARDS[s.hand[i]];
    let x;
    if (card.kind === 'spell') {
      const es = m.battle.units.filter((u) => u.alive && u.team === foe);
      x = es.length ? es[(rng.next() * es.length) | 0].hip.x : m.battle.towers.find((t) => t.team === foe && t.kind === 'guard').x;
    } else {
      const [z0, z1] = m.zone(team);
      x = z0 + rng.next() * (z1 - z0);
    }
    m.play(team, i, x);
  };
}

/**
 * A scripted player that works through its deck in order: the next card on
 * its list as soon as it is in hand and affordable. Units go to the bridge or
 * behind the tower in turn; spells land on the enemy bean closest to our side.
 */
function inOrder(m, team, deck) {
  const s = m.sides[team];
  const foe = team === 'blue' ? 'red' : 'blue';
  const dir = team === 'blue' ? 1 : -1;
  let k = 0;
  let n = 0;
  return (step) => {
    if (step % 12) return;
    const id = deck[k % deck.length];
    const i = s.hand.indexOf(id);
    if (i < 0) {
      k++; // not in hand yet: skip it this time round
      return;
    }
    const card = CARDS[id];
    if (s.mana < card.mana) return;
    let x;
    if (card.kind === 'spell') {
      let best = null;
      for (const u of m.battle.units) if (u.alive && u.team === foe && (!best || u.hip.x * dir < best.hip.x * dir)) best = u;
      if (!best) return; // nothing to hit: wait
      x = best.hip.x;
    } else {
      const [z0, z1] = m.zone(team);
      x = n++ % 2 ? (dir > 0 ? z1 - 30 : z0 + 30) : (dir > 0 ? z0 + 230 : z1 - 230);
    }
    if (m.play(team, i, x)) k++;
  };
}

const MATCHES = [
  {
    name: 'bots: starter deck vs heavies',
    make: () => {
      const m = new Match({ seed: 1101, blue: side(DECK_A), red: side(DECK_B) });
      return { m, players: [new Bot(m, 'blue', { skill: 0.6, seed: 11 }), new Bot(m, 'red', { skill: 0.6, seed: 12 })] };
    },
  },
  {
    name: 'bots: uneven skill and levels, hats on',
    make: () => {
      const m = new Match({
        seed: 2202,
        blue: side(DECK_B, 3, { hats: { all: 'party', brick: 'crown' } }),
        red: side(DECK_C, 2, { hats: { clubber: 'viking', squire: 'party' } }),
      });
      return { m, players: [new Bot(m, 'blue', { skill: 0.85, seed: 21 }), new Bot(m, 'red', { skill: 0.45, seed: 22 })] };
    },
  },
  {
    name: 'bots: careless hothead vs patient expert',
    make: () => {
      const m = new Match({ seed: 3303, blue: side(DECK_D, 2), red: side(DECK_A, 2) });
      return { m, players: [new Bot(m, 'blue', { skill: 0.25, seed: 31, aggro: 0.9 }), new Bot(m, 'red', { skill: 0.9, seed: 32, aggro: 0.1 })] };
    },
  },
  {
    name: 'scripted: timer plays',
    make: () => {
      const m = new Match({ seed: 4404, blue: side(DECK_A, 1, { levels: { clubbers: 3 }, kingLevel: 2 }), red: side(DECK_B, 1, { kingLevel: 2 }) });
      return { m, players: [timer(m, 'blue', 4405, 2.2), timer(m, 'red', 4406, 2.6)] };
    },
  },
  {
    name: 'scripted: each deck in order',
    make: () => {
      const m = new Match({ seed: 5505, blue: side(DECK_D), red: side(DECK_C) });
      return { m, players: [inOrder(m, 'blue', DECK_D), inOrder(m, 'red', DECK_C)] };
    },
  },
  {
    name: 'scripted vs bot',
    make: () => {
      const m = new Match({ seed: 6606, blue: side(DECK_C, 2), red: side(DECK_B, 2) });
      return { m, players: [timer(m, 'blue', 6607, 2.8), new Bot(m, 'red', { skill: 0.7, seed: 62 })] };
    },
  },
];

// Recorded on the original 14-card code. See the note at the top before touching these.
const GOLDEN = {
  'bots: starter deck vs heavies': [
    't30 units=14 hipX=10624.698038 hipY=-335.555625 hp=959.543739 towers=700,420,700,420 crowns=0-0 plays=5+4 events=775#16fd92b3',
    't60 units=11 hipX=7463.630641 hipY=-576.140364 hp=1683.793444 towers=700,420,700,321.118319 crowns=0-0 plays=8+8 events=1540#eb90b22b',
    't120 units=17 hipX=15957.600779 hipY=-145.466513 hp=415.173558 towers=700,420,700,0 crowns=1-0 plays=23+21 events=4898#2f39827d',
  ],
  'bots: uneven skill and levels, hats on': [
    't30 units=13 hipX=14579.52771 hipY=-679.170013 hp=1345.74 towers=794.75,508.2,745.8,239.198579 crowns=0-0 plays=4+4 events=496#408f7917',
    't60 units=4 hipX=2996.24338 hipY=-84.126511 hp=348.373884 towers=794.75,508.2,745.8,139.293033 crowns=0-0 plays=6+6 events=1605#cc8150e5',
    't120 units=6 hipX=7785.266102 hipY=-130.519407 hp=1427.724193 towers=794.75,440.988965,0,0 crowns=3-0 plays=18+21 events=3535#d0f644b3',
  ],
  'bots: careless hothead vs patient expert': [
    't30 units=3 hipX=3088.052652 hipY=-26.296546 hp=115.5 towers=770,462,770,462 crowns=0-0 plays=3+4 events=356#56cd74ac',
    't60 units=12 hipX=3360.129279 hipY=-189.03915 hp=958.115807 towers=610.254703,0,770,179.716786 crowns=0-1 plays=5+8 events=1368#04055d56',
    't120 units=5 hipX=2913.845944 hipY=-86.48829 hp=1020.9205 towers=0,0,770,86.200774 crowns=0-3 plays=12+18 events=2820#3f0db5d7',
  ],
  'scripted: timer plays': [
    't30 units=10 hipX=9074.142583 hipY=-1012.473694 hp=337.399374 towers=750,462,770,248.849113 crowns=0-0 plays=5+5 events=920#87421a0d',
    't60 units=7 hipX=6139.116641 hipY=-87.570789 hp=337.681878 towers=750,462,770,180.648835 crowns=0-0 plays=9+7 events=1535#d546b50c',
    't120 units=20 hipX=15930.80536 hipY=-440.033517 hp=1207.321617 towers=710,375.770389,687.081175,0 crowns=1-0 plays=24+19 events=4136#3081e4b0',
  ],
  'scripted: each deck in order': [
    't30 units=4 hipX=3169.541404 hipY=-58.522728 hp=175.773999 towers=700,327.781789,700,420 crowns=0-0 plays=3+5 events=791#8c9d0409',
    't60 units=4 hipX=5725.243671 hipY=-45.239303 hp=0 towers=700,327.781789,668.5,341 crowns=0-0 plays=6+8 events=1064#0b4974ae',
    't120 units=6 hipX=5675.986137 hipY=-433.625915 hp=1295.476559 towers=700,276.281789,621,0 crowns=1-0 plays=17+22 events=3140#8679d64d',
  ],
  'scripted vs bot': [
    't30 units=4 hipX=2243.221895 hipY=-94.545864 hp=399.625463 towers=770,462,748,405.35 crowns=0-0 plays=5+3 events=693#5ca380ad',
    't60 units=5 hipX=3649.973037 hipY=-91.777323 hp=517.850018 towers=770,0,748,405.35 crowns=0-1 plays=8+6 events=1444#a3bc7656',
    't120 units=9 hipX=3967.207761 hipY=-602.724714 hp=1472.058185 towers=229.715344,0,748,206.681655 crowns=0-1 plays=22+20 events=3089#a5789503',
  ],
};

const round = (v) => Math.round(v * 1e6) / 1e6;

/** FNV-1a over a string, as 8 hex digits. */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** One line per checkpoint: units, rounded sums of hips and hp, tower hp, crowns, plays and a hash of the event-type counts. */
function summary(t, m, counts) {
  const b = m.battle;
  let hx = 0;
  let hy = 0;
  let hp = 0;
  for (const u of b.units) {
    hx += u.hip.x;
    hy += u.hip.y;
    hp += u.hp;
  }
  const ev = Object.keys(counts)
    .sort()
    .map((k) => `${k}:${counts[k]}`)
    .join(',');
  const total = Object.values(counts).reduce((a, n) => a + n, 0);
  const towers = b.towers.map((tw) => round(tw.hp)).join(',');
  return `t${t} units=${b.units.length} hipX=${round(hx)} hipY=${round(hy)} hp=${round(hp)} towers=${towers} crowns=${m.crowns.blue}-${m.crowns.red} plays=${m.sides.blue.played}+${m.sides.red.played} events=${total}#${hash(ev)}`;
}

/** Play a golden match to 120 s (it keeps stepping after a castle falls), summing up at each checkpoint. */
function replay(spec) {
  const { m, players } = spec.make();
  const counts = {};
  const played = new Set();
  const lines = [];
  const last = Math.round(CHECKS[CHECKS.length - 1] / DT);
  for (let step = 0; step < last; step++) {
    for (const p of players) {
      if (typeof p === 'function') p(step);
      else p.update(DT);
    }
    m.step();
    for (const e of m.battle.events) {
      counts[e.type] = (counts[e.type] || 0) + 1;
      if (e.type === 'cardPlayed') played.add(e.card);
    }
    m.battle.events.length = 0;
    const done = step + 1;
    for (const t of CHECKS) if (done === Math.round(t / DT)) lines.push(summary(t, m, counts));
  }
  return { lines, played, m };
}

test('golden replays: the six recorded matches play out exactly as recorded', () => {
  const played = new Set();
  const fresh = {};
  for (const spec of MATCHES) {
    const r = replay(spec);
    for (const id of r.played) played.add(id);
    fresh[spec.name] = r.lines;
  }
  if (process.env.GOLDEN_PRINT) console.log(JSON.stringify(fresh, null, 2));
  for (const spec of MATCHES) {
    assert.ok(GOLDEN[spec.name], `no recording for "${spec.name}"`);
    assert.deepEqual(fresh[spec.name], GOLDEN[spec.name], spec.name);
  }
  for (const id of ORIGINAL) assert.ok(played.has(id), `${id} was played in a golden match`);
});
