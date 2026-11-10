#!/usr/bin/env node
// Arena balance report: seeded bot-vs-bot matches (sim/bot.js) and tables.
//
// Usage (from the repo root):
//   node battle/tools/balance-arena.mjs                 # everything, small sample (--n 8)
//   node battle/tools/balance-arena.mjs --n 40          # bigger sample (n scales every section)
//   node battle/tools/balance-arena.mjs --only mirror,skill --n 30
//   node battle/tools/balance-arena.mjs --only perf     # CPU of the scripted worst cases (no bots)
//   node battle/tools/balance-arena.mjs --json out.json # also write every match result
//
// Flags:
//   --n N        sample size unit (default 8). Matches per section: mirror 4N, skill 2N per pair,
//                levels 2N per pair, cards 12N (random decks), decks 2N per deck, newbie 2N.
//   --jobs J     worker processes (default 2, max 2: the sims are CPU-bound)
//   --seed S     base seed (default 1); every match is reproducible from it
//   --skill K    the "equal skill" used by mirror / levels / cards / decks (default 0.6)
//   --only LIST  sections: mirror, skill, levels, cards, decks, newbie, perf (perf only when named)
//   --json FILE  write all match results as JSON
//   --set LIST   try numbers before committing them, e.g. --set GUARD.hp=800,CARDS.brick.mana=6
//                (roots: GUARD, CASTLE, TOWER_TAKES, SPELLS, UNIT_TYPES, CARDS, BOT_TUNING, WORLD,
//                BUILDINGS, BUILDING_TAKES, BEAT, e.g. WORLD.pocket.blue=1150,
//                BUILDINGS.boingBox.punch.recharge=2.2, UNIT_TYPES.pogo.hop.vx=150)
//
// A match is ~0.3-1 s of CPU (a full 3:00 match is 21,600 fixed steps). Workers
// run node --single-threaded (no GC / JIT helper threads), so --jobs 2 really
// uses two cores: --n 8 (304 matches) takes ~1.5 minutes, --n 24 ~5.
//
// Reading the tables: "A wins" counts draws as half, [lo-hi] is a 95% Wilson
// interval. The card table pits random legal decks (8 cards, 1-3 spells, at
// least one air answer) against each other and, per card, scores the side that
// has it in matches where only one side does. Every match also measures its
// CPU: the card table's last line is the average CPU-s per simulated minute.
//
// --only perf runs the scripted worst cases of the cards contract (6.5), with
// no bots: the same plays on a timer, both sides, for two simulated minutes,
// and prints the CPU-s of each simulated minute (budget: about 2.2 on average,
// 3.0 for the worst minute, on a machine where the busy 14-card baseline takes
// about 2). tests/battle-perf.test.js runs the same scenarios.
//
// Sides swap every other match (the same config plays blue, then red), so
// side bias cancels out of the comparisons; the mirror section measures it.

import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Match } from '../src/sim/match.js';
import { DT } from '../src/sim/battle.js';
import { Bot, BOT_TUNING } from '../src/sim/bot.js';
import { CARDS, CARD_ORDER, STARTER_DECK } from '../src/sim/cards.js';
import { GUARD, CASTLE, TOWER_TAKES } from '../src/sim/towers.js';
import { BUILDINGS, BUILDING_TAKES } from '../src/sim/buildings.js';
import { SPELLS } from '../src/sim/spells.js';
import { UNIT_TYPES, BEAT } from '../src/sim/unit-types.js';
import { Rng } from '../src/sim/rng.js';
import { WORLD } from '../src/config.js';
import { ARCHETYPES, AIR_ANSWERS } from '../src/meta/opponents.js';

const SELF = fileURLToPath(import.meta.url);

// Decks for "starter vs the styles": the starter deck and every deck style the ladder
// bots use (meta/opponents.js ARCHETYPES, read from there so the two never drift), with
// every card unlocked. bonk, siege, boom, turtle and swarm hold the original cards (the
// Turtle's Nutcracker aside); the rest are built around the 18 newer cards (contract 7).
export const DECKS = { starter: STARTER_DECK, ...Object.fromEntries(Object.entries(ARCHETYPES).map(([id, A]) => [id, A.cards.slice()])) };

// Cards that answer fliers (cards contract 7, meta/collection.js): every random deck holds at least one
export { AIR_ANSWERS };

// --- one match ------------------------------------------------------------------------

/**
 * A "new player" who only drags unit cards (Clubbers first) onto the middle of
 * their half whenever they can afford one, a little after it's affordable.
 */
class Newbie {
  constructor(m, team, seed) {
    this.m = m;
    this.team = team;
    this.rng = new Rng(seed);
    this.wait = 1 + this.rng.next() * 2;
  }

  update(dt) {
    const m = this.m;
    if (m.phase === 'over') return;
    this.wait -= dt;
    if (this.wait > 0) return;
    const s = m.sides[this.team];
    const units = s.hand.map((id, i) => ({ id, i })).filter(({ id }) => CARDS[id].kind === 'unit' && CARDS[id].mana <= s.mana);
    if (!units.length) return;
    const pick = units.find((h) => h.id === 'clubbers' || h.id === 'clubberGang') || units[(this.rng.next() * units.length) | 0];
    const [a, b] = m.zone(this.team);
    const k = 0.35 + this.rng.next() * 0.6; // somewhere in the front part of their half
    const x = this.team === 'blue' ? a + (b - a) * k : b - (b - a) * k;
    if (m.play(this.team, pick.i, x)) this.wait = 1 + this.rng.next() * 3;
  }
}

const levelsOf = (deck, level) => Object.fromEntries(deck.map((id) => [id, level]));

/**
 * job: { id, seed, blue: P, red: P }, P = { deck, level, king?, skill?, aggro?, tuning?, newbie?, castle? }
 * Returns { id, winner, reason, time, crowns, down: towers destroyed, hp: { 'blue-guard': health fraction, ... },
 *   played: { team: { cardId: times } }, full: { team: seconds spent at full mana } }.
 */
export function runMatch(job) {
  const side = (P, team) => ({ name: team, deck: P.deck, levels: levelsOf(P.deck, P.level || 1), kingLevel: P.king || P.level || 1, castle: P.castle });
  const m = new Match({ seed: job.seed, blue: side(job.blue, 'blue'), red: side(job.red, 'red') });
  const ctl = ['blue', 'red'].map((team) => {
    const P = job[team];
    const seed = (job.seed * 7919 + (team === 'blue' ? 1 : 2)) >>> 0;
    return P.newbie ? new Newbie(m, team, seed) : new Bot(m, team, { skill: P.skill ?? 0.6, seed, aggro: P.aggro ?? null, tuning: P.tuning || null });
  });
  const played = { blue: {}, red: {} };
  const c0 = process.cpuUsage();
  while (m.phase !== 'over') {
    for (const c of ctl) c.update(DT);
    m.step();
    for (const e of m.battle.events) if (e.type === 'cardPlayed') played[e.team][e.card] = (played[e.team][e.card] || 0) + 1;
    m.battle.events.length = 0;
    if (m.time > 400) throw new Error(`match ${job.id} never ended`);
  }
  const c = process.cpuUsage(c0);
  // (towers only: buildings come and go and never count)
  const towers = m.battle.towers.filter((t) => t.kind !== 'building');
  const down = towers.filter((t) => !t.alive).length;
  const hp = Object.fromEntries(towers.map((t) => [`${t.team}-${t.kind}`, Math.round((1000 * t.hp) / t.maxHp) / 1000]));
  return {
    id: job.id,
    winner: m.winner,
    reason: m.endReason,
    time: Math.round(m.time * 100) / 100,
    crowns: { ...m.crowns },
    down,
    hp,
    played,
    full: Object.fromEntries(ctl.map((c) => [c.team, c.stats ? Math.round(c.stats.full * 10) / 10 : 0])),
    cpu: Math.round(((c.user + c.system) / 1e6 / Math.max(1e-9, m.time / 60)) * 1000) / 1000, // CPU-s per simulated minute
  };
}

// --- perf: the scripted worst cases (cards contract 6.5) ------------------------------------

/**
 * Each scenario replays `plays` every `every` seconds: [t, team, card, x], where x is a world x
 * or 'foe' (the enemy bean nearest the caster's castle, else the middle). Both sides play
 * mirrored versions, no bots, so the load is the scenario's and nothing else's.
 */
const mirror = (plays) => plays.flatMap(([t, team, card, x]) => [
  [t, team, card, x],
  [t, team === 'blue' ? 'red' : 'blue', card, typeof x === 'number' ? WORLD.width - x : x],
]);
export const PERF = {
  baseline: {
    name: 'busy match, the 14 original cards',
    every: 10,
    plays: mirror([[0, 'blue', 'clubberGang', 600], [1, 'blue', 'archers', 450], [3, 'blue', 'bombSquad', 620], [5, 'blue', 'shieldWall', 560], [7, 'blue', 'arrowRain', 'foe'], [8, 'blue', 'bruiser', 640]]),
  },
  patches: {
    name: 'two Bean Patches per side, Sprouts and a Clubber Gang',
    every: 12,
    plays: mirror([[0, 'blue', 'beanPatch', 520], [0.5, 'blue', 'beanPatch', 650], [2, 'blue', 'sprouts', 600], [4, 'blue', 'clubberGang', 600], [8, 'blue', 'sprouts', 620]]),
  },
  jelly: {
    name: 'Big Jelly, Drummer, Juggler and Bomb Squad vs a Wrecking Crane and Peels',
    every: 14,
    plays: mirror([[0, 'blue', 'wreckingCrane', 600], [1, 'blue', 'bigJelly', 560], [2, 'blue', 'tummyDrummer', 500], [3, 'blue', 'bombJuggler', 450], [5, 'blue', 'bombSquad', 600], [6, 'blue', 'bananaPeels', 'foe'], [10, 'blue', 'bananaPeels', 'foe']]),
  },
  air: {
    name: 'two Propeller Pals per side, a Pelican, Brollies and Sneezes',
    every: 10,
    plays: mirror([[0, 'blue', 'propellerPals', 600], [1, 'blue', 'propellerPals', 520], [2, 'blue', 'pelican', 560], [3, 'blue', 'brollyBrigade', 1020], [5, 'blue', 'bigSneeze', 'foe'], [8, 'blue', 'bigSneeze', 'foe']]),
  },
};

/** World x for a scripted play: a number, or 'foe' (the enemy bean nearest our castle). */
function playX(m, team, x) {
  if (typeof x === 'number') return x;
  const f = team === 'blue' ? 1 : -1;
  let best = null;
  for (const u of m.battle.units) if (u.alive && u.team !== team && !u.dropping && (best === null || u.hip.x * f < best * f)) best = u.hip.x;
  return best ?? WORLD.mid;
}

/**
 * Run a PERF scenario for `seconds` simulated seconds. Returns { cpu: [CPU-s of each simulated
 * minute], avg, peak, played, peakUnits, finite, events: { type: count } } (finite: every bean and building ended with
 * finite numbers). The towers get 20x their health, so no castle falls and the fight never stops.
 */
export function runPerf(sc, { seed = 1, seconds = 120, minute = 60, level = 1 } = {}) {
  const cards = [...new Set(sc.plays.map((p) => p[2]))];
  const side = (team) => ({ name: team, deck: cards.slice(0, 8), levels: Object.fromEntries(cards.map((id) => [id, level])), kingLevel: level });
  const m = new Match({ seed, blue: side('blue'), red: side('red') });
  // Towers that never fall: the fight stays on (a fallen castle would end it and the beans would cheer)
  for (const t of m.battle.towers) t.hp = t.maxHp *= 20;
  const plays = sc.plays.slice().sort((a, b) => a[0] - b[0]);
  const steps = Math.round(seconds / DT);
  const perMin = Math.round(minute / DT);
  const cpu = [];
  let played = 0;
  let peakUnits = 0;
  const events = {}; // how many of each event: proof the scenario did what it says
  let k = 0; // next play in this cycle
  let c0 = process.cpuUsage();
  for (let i = 0; i < steps; i++) {
    const t = (i * DT) % sc.every;
    if (t < DT / 2) k = 0; // a new cycle
    while (k < plays.length && plays[k][0] <= t + 1e-9) {
      const [, team, card, x] = plays[k++];
      const s = m.sides[team];
      s.mana = 10;
      s.hand[0] = card;
      if (m.play(team, 0, playX(m, team, x))) played++;
    }
    m.step();
    for (const e of m.battle.events) events[e.type] = (events[e.type] || 0) + 1;
    m.battle.events.length = 0;
    if (m.battle.units.length > peakUnits) peakUnits = m.battle.units.length;
    if ((i + 1) % perMin === 0) {
      const c = process.cpuUsage(c0);
      cpu.push((c.user + c.system) / 1e6);
      c0 = process.cpuUsage();
    }
  }
  const finite = m.battle.units.every((u) => u.parts.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))) && m.battle.towers.every((t) => Number.isFinite(t.hp));
  return { cpu, avg: cpu.reduce((a, b) => a + b, 0) / Math.max(1, cpu.length), peak: Math.max(...cpu), played, peakUnits, finite, events };
}

// --- workers ------------------------------------------------------------------------------

const ROOTS = { GUARD, CASTLE, TOWER_TAKES, SPELLS, UNIT_TYPES, CARDS, BOT_TUNING, WORLD, BUILDINGS, BUILDING_TAKES, BEAT };

/** Apply --set patches ('GUARD.hp=800,CARDS.brick.mana=6') to the live tuning objects. */
function applySets(list) {
  for (const kv of (list || '').split(',').filter(Boolean)) {
    const [path, val] = kv.split('=');
    const keys = path.split('.');
    let o = ROOTS[keys.shift()];
    while (o && keys.length > 1) o = o[keys.shift()];
    if (!o || !(keys[0] in o) || !Number.isFinite(+val)) throw new Error(`--set: can't set ${kv}`);
    o[keys[0]] = +val;
  }
}

if (process.argv.includes('--worker')) {
  process.on('message', (msg) => {
    if (msg === 'exit') process.exit(0);
    if (msg && msg.sets != null) return applySets(msg.sets);
    try {
      process.send({ ok: runMatch(msg) });
    } catch (err) {
      process.send({ err: String(err && err.stack ? err.stack : err), id: msg.id });
    }
  });
} else if (process.argv[1] === SELF) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

function runAll(jobs, nJobs, sets) {
  return new Promise((resolve, reject) => {
    const results = new Array(jobs.length);
    let next = 0;
    let done = 0;
    let lastPrint = 0;
    const byId = new Map(jobs.map((j, i) => [j.id, i]));
    const workers = [];
    if (!jobs.length) return resolve(results);
    const feed = (w) => {
      if (next < jobs.length) w.send(jobs[next++]);
      else w.send('exit');
    };
    for (let k = 0; k < Math.min(nJobs, jobs.length); k++) {
      const w = fork(SELF, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'], execArgv: ['--single-threaded'] });
      workers.push(w);
      w.send({ sets: sets || '' });
      w.on('message', (msg) => {
        if (msg.err) return reject(new Error(`job ${msg.id}: ${msg.err}`));
        results[byId.get(msg.ok.id)] = msg.ok;
        done++;
        if (process.stderr.isTTY && Date.now() - lastPrint > 1000) {
          lastPrint = Date.now();
          process.stderr.write(`\r  ${done}/${jobs.length} matches`);
        }
        if (done === jobs.length) {
          if (process.stderr.isTTY) process.stderr.write('\r' + ' '.repeat(30) + '\r');
          resolve(results);
        }
        feed(w);
      });
      w.on('error', reject);
      feed(w);
    }
  });
}

// --- statistics -------------------------------------------------------------------------------

/** Wilson 95% interval for k successes in n. */
function wilson(k, n) {
  if (!n) return [0, 1];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

const pct = (x) => `${(x * 100).toFixed(0)}%`.padStart(4);
const median = (a) => {
  if (!a.length) return NaN;
  const s = a.slice().sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Win rate of config "A" over a set of results where job.a names A's team. Draws count half. */
function score(results, jobs) {
  let w = 0;
  let d = 0;
  let n = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const a = jobs[i].a;
    n++;
    if (r.winner === 'draw') d++;
    else if (r.winner === a) w++;
  }
  const s = w + d / 2;
  const [lo, hi] = wilson(s, n);
  return { n, w, d, l: n - w - d, rate: n ? s / n : 0, lo, hi };
}

const fmtScore = (s) => `${pct(s.rate)}  [${pct(s.lo)}-${pct(s.hi)}]  (${s.w}-${s.d}-${s.l} of ${s.n})`;

function outcomeStats(results) {
  const n = results.length;
  const reasons = {};
  for (const r of results) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
  const downs = results.map((r) => r.down);
  const hist = [0, 1, 2, 3, 4].map((k) => downs.filter((d) => d === k).length);
  const draws = results.filter((r) => r.winner === 'draw').length;
  const early = results.filter((r) => r.time < 120 - 1e-6).length;
  const full = median(results.flatMap((r) => [r.full.blue, r.full.red]));
  const lost = (kind) => results.reduce((a, r) => a + (1 - r.hp[`blue-${kind}`]) + (1 - r.hp[`red-${kind}`]), 0) / Math.max(1, 2 * n);
  const meanDown = downs.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const medianTime = median(results.map((r) => r.time));
  return { n, reasons, guardLost: lost('guard'), castleLost: lost('castle'), medianDown: median(downs), meanDown, hist, draws, early, medianTime, full };
}

function printOutcomes(title, results) {
  const o = outcomeStats(results);
  console.log(`  ${title}: ${o.n} matches`);
  console.log(`    end reasons   ${Object.entries(o.reasons).map(([k, v]) => `${k} ${pct(v / o.n).trim()}`).join(', ')}`);
  console.log(`    reach 2:00    ${pct(1 - o.early / o.n).trim()} (ended early by castle: ${o.early})`);
  console.log(`    towers down   median ${o.medianDown}, mean ${o.meanDown.toFixed(2)}; per match 0/1/2/3/4: ${o.hist.join('/')}`);
  console.log(`    tower health  lost on average: Guard Towers ${pct(o.guardLost).trim()}, Castles ${pct(o.castleLost).trim()}`);
  console.log(`    draws         ${pct(o.draws / o.n).trim()}   median length ${o.medianTime.toFixed(0)} s   median time at full mana per side ${o.full} s`);
}

// --- the report ----------------------------------------------------------------------------------

function parseArgs(argv) {
  const a = { n: 8, jobs: 2, seed: 1, skill: 0.6, only: null, json: null, set: '' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--n') a.n = Math.max(1, +v | 0);
    else if (k === '--jobs') a.jobs = Math.max(1, Math.min(2, +v | 0));
    else if (k === '--seed') a.seed = +v | 0 || 1;
    else if (k === '--skill') a.skill = +v;
    else if (k === '--only') a.only = new Set(v.split(','));
    else if (k === '--json') a.json = v;
    else if (k === '--set') a.set = v;
    else continue;
    i++;
  }
  return a;
}

/** Jobs for config A vs config B, A playing blue in even matches and red in odd ones. */
function pairJobs(tag, n, seed0, A, B) {
  const jobs = [];
  for (let k = 0; k < n; k++) {
    const aBlue = k % 2 === 0;
    jobs.push({ id: `${tag}#${k}`, seed: seed0 + k, a: aBlue ? 'blue' : 'red', blue: aBlue ? A : B, red: aBlue ? B : A });
  }
  return jobs;
}

/**
 * A random legal deck: 8 different cards, 1-3 spells (the rest units and buildings), and at
 * least one air answer (AIR_ANSWERS), so no deck is shut out of the air game: without one,
 * a random card of the same kind (spell or not) makes way for a random answer.
 */
export function randomDeck(rng) {
  const spells = CARD_ORDER.filter((id) => CARDS[id].kind === 'spell');
  const others = CARD_ORDER.filter((id) => CARDS[id].kind !== 'spell');
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (rng.next() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const ns = 1 + ((rng.next() * 3) | 0);
  const deck = [...shuffle(spells.slice()).slice(0, ns), ...shuffle(others.slice()).slice(0, 8 - ns)];
  if (!deck.some((id) => AIR_ANSWERS.includes(id))) {
    const a = AIR_ANSWERS[(rng.next() * AIR_ANSWERS.length) | 0];
    const spell = CARDS[a].kind === 'spell';
    const same = deck.map((id, i) => i).filter((i) => (CARDS[deck[i]].kind === 'spell') === spell);
    deck[same[(rng.next() * same.length) | 0]] = a;
  }
  return deck;
}

async function main() {
  const A = parseArgs(process.argv.slice(2));
  const want = (s) => !A.only || A.only.has(s);
  if (A.only && A.only.has('perf')) {
    applySets(A.set);
    perfReport(A);
    if (A.only.size === 1) return;
  }
  const K = A.skill;
  const sections = [];
  const t0 = Date.now();
  let seed = A.seed * 100000;
  const add = (name, jobs) => {
    sections.push({ name, jobs });
    seed += 1000;
  };
  const S = (deck, skill = K, level = 1, extra = {}) => ({ deck, skill, level, ...extra });

  if (want('mirror')) add('mirror', pairJobs('mirror', 4 * A.n, seed, S(STARTER_DECK), S(STARTER_DECK)));
  if (want('skill')) {
    add('skill 0.9 vs 0.3', pairJobs('s93', 2 * A.n, seed, S(STARTER_DECK, 0.9), S(STARTER_DECK, 0.3)));
    add('skill 0.5 vs 0.05', pairJobs('s505', 2 * A.n, seed, S(STARTER_DECK, 0.5), S(STARTER_DECK, 0.05)));
    add('skill 0.6 vs 0.3', pairJobs('s63', 2 * A.n, seed, S(STARTER_DECK, 0.6), S(STARTER_DECK, 0.3)));
    add('skill 0.3 vs 0.05', pairJobs('s305', 2 * A.n, seed, S(STARTER_DECK, 0.3), S(STARTER_DECK, 0.05)));
  }
  // (the Training Dummy: meta/opponents.js TUTORIAL_OPPONENT, skill 0.05 and a half-health practice castle)
  if (want('newbie')) add('newbie vs Training Dummy (0.05)', pairJobs('newbie', 2 * A.n, seed, S(STARTER_DECK, 0, 1, { newbie: true }), S(STARTER_DECK, 0.05, 1, { castle: 0.5 })));
  if (want('levels')) {
    add('level 2 vs level 1', pairJobs('lv21', 2 * A.n, seed, S(STARTER_DECK, K, 2), S(STARTER_DECK, K, 1)));
    add('level 6 vs level 5', pairJobs('lv65', 2 * A.n, seed, S(STARTER_DECK, K, 6), S(STARTER_DECK, K, 5)));
  }
  if (want('decks')) {
    for (const id of Object.keys(DECKS)) if (id !== 'starter') add(`${id} vs starter`, pairJobs(`deck-${id}`, 2 * A.n, seed, S(DECKS[id]), S(STARTER_DECK)));
  }
  if (want('cards')) {
    const rng = new Rng(seed);
    const jobs = [];
    for (let k = 0; k < 12 * A.n; k++) jobs.push({ id: `cards#${k}`, seed: seed + k, a: 'blue', blue: S(randomDeck(rng)), red: S(randomDeck(rng)) });
    add('cards', jobs);
  }

  const all = sections.flatMap((s) => s.jobs);
  applySets(A.set); // (checks the list before the workers start)
  console.log(`Wobble War arena balance: ${all.length} matches, ${A.jobs} worker(s), seed ${A.seed}, equal skill ${K}${A.set ? `, set ${A.set}` : ''}`);
  const res = await runAll(all, A.jobs, A.set);
  let at = 0;
  for (const s of sections) {
    s.results = res.slice(at, at + s.jobs.length);
    at += s.jobs.length;
  }
  const get = (name) => sections.find((s) => s.name === name);

  console.log('');
  const mirror = get('mirror');
  if (mirror) {
    console.log('== Mirror (starter deck, level 1, equal skill): side symmetry ==');
    const blue = score(mirror.results, mirror.jobs.map(() => ({ a: 'blue' })));
    console.log(`  blue win rate   ${fmtScore(blue)}`);
    printOutcomes('outcomes', mirror.results);
    console.log('');
  }

  const pairs = sections.filter((s) => s.name !== 'mirror' && s.name !== 'cards');
  if (pairs.length) {
    console.log('== Head to head (A vs B, sides alternate; draws count half) ==');
    for (const s of pairs) {
      const o = outcomeStats(s.results);
      const r = (k) => pct((o.reasons[k] || 0) / o.n).trim();
      console.log(`  ${s.name.padEnd(34)} A wins ${fmtScore(score(s.results, s.jobs))}   castle ${r('castle')}, tiebreak ${r('tiebreak')}, towers ${o.meanDown.toFixed(2)}`);
    }
    console.log('');
  }

  const cards = get('cards');
  if (cards) {
    console.log('== Cards: random decks, the side with the card vs the side without it ==');
    console.log('  card             mana  with-vs-without          n    plays/match');
    const rows = [];
    for (const id of CARD_ORDER) {
      let w = 0;
      let n = 0;
      let plays = 0;
      let had = 0;
      cards.results.forEach((r, i) => {
        const j = cards.jobs[i];
        const inB = j.blue.deck.includes(id);
        const inR = j.red.deck.includes(id);
        for (const t of ['blue', 'red']) {
          if (j[t].deck.includes(id)) {
            had++;
            plays += r.played[t][id] || 0;
          }
        }
        if (inB === inR) return;
        const t = inB ? 'blue' : 'red';
        n++;
        if (r.winner === t) w++;
        else if (r.winner === 'draw') w += 0.5;
      });
      const [lo, hi] = wilson(w, n);
      rows.push({ id, rate: n ? w / n : 0, lo, hi, n, ppm: had ? plays / had : 0 });
    }
    for (const r of rows) {
      const c = CARDS[r.id];
      const mana = String(c.mana).padStart(4);
      // (a rarity letter, and a mark for the 18 newer cards: they are the ones to tune first)
      const tag = `${c.rarity[0].toUpperCase()}${CARD_ORDER.indexOf(r.id) >= 14 ? '*' : ' '}`;
      console.log(`  ${r.id.padEnd(14)} ${tag}${mana}  ${pct(r.rate)} [${pct(r.lo)}-${pct(r.hi)}]   ${String(r.n).padStart(5)}    ${r.ppm.toFixed(1)}`);
    }
    console.log('  (C/R/E/L = rarity, * = one of the 18 newer cards; targets: 40-60%, legendaries 45-55%)');
    printOutcomes('random-deck outcomes', cards.results);
    const cpu = cards.results.map((r) => r.cpu).filter(Number.isFinite);
    if (cpu.length) console.log(`    CPU           ${(cpu.reduce((a, b) => a + b, 0) / cpu.length).toFixed(2)} CPU-s per simulated minute on average, worst match ${Math.max(...cpu).toFixed(2)} (budget 2.2 / 3.0)`);
    console.log('');
  }

  const everything = sections.filter((s) => !/skill|newbie/.test(s.name)).flatMap((s) => s.results);
  if (everything.length) {
    console.log('== All equal-skill matches ==');
    printOutcomes('outcomes', everything);
  }
  console.log(`\n${all.length} matches in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (A.json) writeFileSync(A.json, JSON.stringify(sections.map((s) => ({ name: s.name, jobs: s.jobs, results: s.results })), null, 1));
}

/** --only perf: each PERF scenario for two simulated minutes in this process (after a warm-up). */
function perfReport(A) {
  console.log(`Wobble War perf: the scripted worst cases (cards contract 6.5), seed ${A.seed}${A.set ? `, set ${A.set}` : ''}`);
  console.log('  CPU-s per simulated minute (minute 1 / minute 2), budget 2.2 on average and 3.0 for the worst minute');
  for (const sc of Object.values(PERF)) runPerf(sc, { seed: A.seed, seconds: 10 }); // (JIT warm-up)
  const base = runPerf(PERF.baseline, { seed: A.seed });
  for (const [id, sc] of Object.entries(PERF)) {
    const r = id === 'baseline' ? base : runPerf(sc, { seed: A.seed });
    const rel = id === 'baseline' ? '' : `   x${(r.peak / base.peak).toFixed(2)} of the baseline's worst minute`;
    console.log(`  ${id.padEnd(9)} ${r.cpu.map((c) => c.toFixed(2)).join(' / ')}  peak units ${String(r.peakUnits).padStart(3)}  plays ${r.played}${r.finite ? '' : '  NON-FINITE!'}${rel}`);
    console.log(`            (${sc.name})`);
  }
}
