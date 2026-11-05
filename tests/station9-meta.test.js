import test from 'node:test';
import assert from 'node:assert/strict';
import { Meta, newState } from '../station9/src/meta.js';
import { FakeClock } from '../station9/src/clock.js';
import { generatePerson, basePower } from '../station9/src/people.js';
import { simulateRun } from '../station9/src/run-sim.js';
import { BUILDINGS, CHAINS, STORY, STORY_TOTAL, GATE, CONVOY, TUNING_DEFAULTS, MAX_LEVEL, XP_TO_NEXT, XP, FAVORED_BONUS, SCOUT_SCRAP, ROLE_ORDER, RUN_MINUTES, STARS, MAX_FACILITY_LEVEL } from '../station9/src/config.js';
import { mulberry32 } from '../station9/src/util.js';

const T0 = 1_700_000_000_000;

function make(seed = 5) {
  const clock = new FakeClock(T0);
  const rng = mulberry32(seed);
  const meta = new Meta(newState(T0, rng), { clock, tuning: { ...TUNING_DEFAULTS }, rng });
  return { meta, clock, state: meta.s };
}

/** A street past the guided start: you, a few people, the gate open. */
function started(seed = 5, { people = 3 } = {}) {
  const t = make(seed);
  t.meta.chooseYou(0);
  if (people > t.meta.beds()) t.state.buildings.firehouse = 3;
  for (let k = 1; k < people; k++) assert.ok(t.meta.takeIn(t.meta.arrive({ role: ROLE_ORDER[k % 3], stars: 2, level: 1 }).id).ok);
  return t;
}

function add(meta, { role = 'fighter', stars = 2, level = 1 } = {}) {
  const p = generatePerson(mulberry32(meta.s.nextId * 17), { id: meta.s.nextId++, stars, role, level });
  meta.s.people.push(p);
  return p;
}

function play(meta, outcome = 'win', ids = null, seed = 1) {
  const run = meta.nextRun();
  const r = meta.planRun(ids || meta.bestCrew(run), { outcome, seed });
  assert.ok(r.ok, r.reason);
  return { run, result: r.result, out: meta.applyRun(r.result) };
}

test('a new street: three people you could be, one per role, all Skilled; three beds', () => {
  const { meta, state } = make();
  assert.equal(state.candidates.length, 3);
  assert.deepEqual(state.candidates.map((p) => p.role).sort(), ROLE_ORDER.slice().sort());
  assert.ok(state.candidates.every((p) => p.stars === 2 && p.level === 1));
  assert.equal(state.people.length, 0);
  assert.equal(state.you, null);
  assert.equal(meta.beds(), BUILDINGS[0].values[0]);
  assert.equal(meta.planRun([]).reason, 'you');
});

test('choosing who you are puts you on the street, once', () => {
  const { meta, state } = make();
  const c = state.candidates[1];
  assert.ok(meta.chooseYou(1).ok);
  assert.equal(state.you, c.id);
  assert.equal(meta.you().first, c.first);
  assert.equal(state.candidates.length, 0);
  assert.equal(meta.chooseYou(0).reason, 'chosen');
});

test('the gate stays shut until Mae opens it; then a visitor per interval, two can wait', () => {
  const { meta, clock, state } = started();
  clock.warp(5 * GATE.every * 60 * 1000);
  meta.tick();
  assert.equal(state.gate.visitors.length, 0, 'no walk-ins during the guided start');
  meta.openGate();
  clock.warp(GATE.every * 60 * 1000 - 1000);
  meta.tick();
  assert.equal(state.gate.visitors.length, 0);
  clock.warp(1000);
  meta.tick();
  assert.equal(state.gate.visitors.length, 1);
  clock.warp(10 * GATE.every * 60 * 1000);
  meta.tick();
  assert.equal(state.gate.visitors.length, GATE.capacity);
  // A full gate pauses; sending someone away restarts a full interval.
  meta.sendAway(state.gate.visitors[0].id);
  clock.warp(GATE.every * 60 * 1000 - 1000);
  meta.tick();
  assert.equal(state.gate.visitors.length, 1);
  clock.warp(1000);
  meta.tick();
  assert.equal(state.gate.visitors.length, 2);
});

test('taking someone in needs a free bed; Bunks upgrades add beds', () => {
  const { meta, state } = started(5, { people: 3 }); // 3/3
  const v = meta.arrive({ role: 'medic', stars: 1 });
  assert.equal(meta.takeIn(v.id).reason, 'beds');
  assert.equal(meta.upgrade('firehouse').reason, 'scrap');
  state.scrap = 100;
  assert.ok(meta.upgrade('firehouse').ok);
  assert.equal(meta.beds(), BUILDINGS[0].values[1]);
  assert.ok(meta.takeIn(v.id).ok);
  assert.equal(state.people.length, 4);
});

test('the crew is always you first, then up to three teammates who are not resting', () => {
  const { meta, state } = started(5, { people: 4 });
  const mates = state.people.filter((p) => p.id !== state.you).map((p) => p.id);
  assert.equal(meta.planRun(mates).reason, 'you');
  assert.ok(meta.planRun([state.you]).ok, 'you can go alone');
  add(meta);
  const all = [state.you, ...state.people.filter((p) => p.id !== state.you).map((p) => p.id)];
  assert.equal(meta.planRun(all).reason, 'crew', 'five is too many');
  meta.person(mates[0]).rest = 1;
  assert.equal(meta.planRun([state.you, mates[0]]).reason, 'resting');
  assert.ok(!meta.bestCrew(meta.nextRun()).includes(mates[0]));
});

test('the guided start: the first two runs always make it, with three stars, and the diner comes back', () => {
  const { meta, state } = started(5, { people: 2 });
  const a = play(meta, 'auto');
  assert.equal(a.result.won, true);
  assert.equal(a.result.stars, 3);
  const b = play(meta, 'auto');
  assert.equal(b.result.won, true);
  assert.equal(b.out.reclaimed, 'diner');
  assert.equal(state.buildings.diner, 1);
  assert.equal(state.story, 2);
});

test('each run favors one role: +50% power; the Workshop adds to the whole crew', () => {
  const { meta, state } = started(5, { people: 1 });
  const scout = add(meta, { role: 'scout', stars: 2, level: 2 });
  const fighter = add(meta, { role: 'fighter', stars: 2, level: 2 });
  const night = { tag: 'night', rec: 50 };
  assert.equal(meta.memberPower(scout, night), basePower(scout) * (1 + FAVORED_BONUS));
  assert.equal(meta.memberPower(fighter, night), basePower(fighter));
  const ids = [state.you, scout.id, fighter.id];
  const sum = ids.map((id) => meta.person(id)).reduce((a, p) => a + meta.memberPower(p, night), 0);
  assert.equal(meta.crewPower(ids, night), Math.round(sum));
  state.buildings.hardware = 3;
  assert.equal(meta.crewPower(ids, night), Math.round(sum * (1 + BUILDINGS.find((b) => b.id === 'hardware').values[2])));
  // The best crew for a night run takes the scout before an equal fighter.
  const crew = meta.bestCrew({ tag: 'night' });
  assert.equal(crew[0], state.you);
  assert.ok(crew.indexOf(scout.id) < crew.indexOf(fighter.id));
});

test('a lost run: one teammate (never you) rests for the next run, unless a Medic came; they are back after it', () => {
  const { meta, state } = started(5, { people: 1 });
  state.story = 2;
  const f1 = add(meta, { role: 'fighter' });
  const f2 = add(meta, { role: 'fighter' });
  const { out } = play(meta, 'lose', [state.you, f1.id, f2.id]);
  assert.ok(out.hurt === f1.id || out.hurt === f2.id);
  assert.notEqual(out.hurt, state.you);
  const hurt = meta.person(out.hurt);
  assert.equal(hurt.rest, 1);
  const fit = [state.you, out.hurt === f1.id ? f2.id : f1.id];
  const next = play(meta, 'win', fit);
  assert.equal(hurt.rest, 0);
  assert.ok(next.out.back.includes(hurt.id));
  // With a Medic along, nobody gets hurt.
  const medic = add(meta, { role: 'medic' });
  const m = play(meta, 'lose', [state.you, f1.id, medic.id]);
  assert.equal(m.out.hurt, null);
  assert.equal(m.out.medicSaved, true);
});

test('XP: the crew gets XP every run (more for a win, plus the Kitchen); people at home train with the Gym', () => {
  const { meta, state } = started(5, { people: 1 });
  state.story = 2;
  const stay = add(meta, { role: 'medic' });
  const goer = add(meta, { role: 'fighter' });
  let r = play(meta, 'win', [state.you, goer.id]);
  assert.equal(r.out.xp.find((x) => x.id === goer.id).gained, XP.win);
  assert.equal(r.out.home.length, 0);
  state.buildings.diner = 2;
  state.buildings.gym = 1;
  r = play(meta, 'lose', [state.you, goer.id]);
  assert.equal(r.out.xp.find((x) => x.id === goer.id).gained, XP.loss + 2);
  assert.equal(r.out.home.find((h) => h.id === stay.id).gained, 1);
  // Levels carry the rest of the XP over and stop at the max.
  const p = meta.you();
  p.level = 1;
  p.xp = 0;
  assert.equal(meta.giveXp(p, XP_TO_NEXT[0] + XP_TO_NEXT[1] + 1), 2);
  assert.equal(p.level, 3);
  assert.equal(p.xp, 1);
  p.level = MAX_LEVEL;
  assert.equal(meta.giveXp(p, 99), 0);
});

test('scrap: stars multiply it, every Scout adds 20% (up to two), a loss brings home half', () => {
  const { meta, state } = started(5, { people: 1 });
  state.story = 2; // Parking Lot, base scrap
  const run = meta.nextRun();
  const a = add(meta, { role: 'scout' });
  const b = add(meta, { role: 'scout' });
  const c = add(meta, { role: 'scout' });
  let r = meta.planRun([state.you, a.id, b.id, c.id], { outcome: 'win', seed: 3 });
  r.result.stars = 1;
  let out = meta.applyRun(r.result);
  assert.equal(out.scrap, Math.round(run.scrap * (1 + 2 * SCOUT_SCRAP) / 1));
  state.story = 2;
  const lost = meta.planRun([state.you], { outcome: 'lose', seed: 3 });
  out = meta.applyRun(lost.result);
  assert.equal(out.scrap, Math.max(1, Math.round(run.scrap * 0.5)));
});

test('rescues bring a Skilled or Elite survivor to the gate; the last run seals the street; then patrols', () => {
  const { meta, state } = started(5, { people: 4 });
  state.story = 3; // Stockroom (rescue)
  assert.equal(meta.nextRun().type, 'rescue');
  const { out } = play(meta, 'win');
  assert.ok(out.rescued && out.rescued.stars >= 2);
  assert.ok(state.gate.visitors.some((p) => p.id === out.rescued.id));
  state.story = STORY_TOTAL - 1;
  const last = play(meta, 'win');
  assert.equal(last.out.sealed, true);
  assert.equal(state.sealed, true);
  const patrol = meta.nextRun();
  assert.equal(patrol.patrol, true);
  const p = play(meta, 'win');
  assert.ok(p.out.scrap > 0);
  assert.equal(state.story, STORY_TOTAL);
});

test('a run moves the street clock on by a few minutes', () => {
  const { meta, clock } = started();
  const t = clock.now();
  play(meta, 'win');
  assert.equal(clock.now() - t, RUN_MINUTES * 60 * 1000);
});

test('buildings: three levels each, instant, locked until taken back', () => {
  const { meta, state } = started();
  assert.equal(meta.upgrade('hardware').reason, 'locked');
  state.buildings.hardware = 1;
  state.scrap = 1000;
  while (meta.upgradeCost('hardware') !== null) assert.ok(meta.upgrade('hardware').ok);
  assert.equal(meta.level('hardware'), MAX_FACILITY_LEVEL);
  assert.equal(meta.upgrade('hardware').reason, 'maxed');
  assert.equal(meta.workshop(), BUILDINGS.find((b) => b.id === 'hardware').values[2]);
});

test('the convoy starts after the guided start, comes early once, then every 8 hours, with scrap and someone skilled', () => {
  const { meta, clock, state } = started();
  assert.equal(meta.convoyInfo().on, false);
  meta.startConvoy();
  assert.equal(meta.claimConvoy().reason, 'notReady');
  clock.warp(CONVOY.first * 1000);
  meta.tick();
  const r = meta.claimConvoy();
  assert.ok(r.ok && r.scrap > 0 && r.person.stars >= 2);
  assert.ok(state.gate.visitors.some((p) => p.id === r.person.id));
  assert.equal(Math.round((state.convoy.readyAt - clock.now()) / 1000), CONVOY.every);
});

test("Mae's hint: the gate first, then beds, the convoy, any upgrade we can afford, else play", () => {
  const { meta, state } = started(5, { people: 2 });
  const v = meta.arrive({ role: 'medic', stars: 1 });
  assert.equal(meta.advice().kind, 'gate');
  meta.takeIn(v.id);
  meta.arrive({ role: 'scout', stars: 1 });
  state.scrap = 20;
  const a = meta.advice();
  assert.equal(a.kind, 'build');
  assert.equal(a.id, 'firehouse');
  state.gate.visitors.length = 0;
  assert.equal(meta.advice().kind, 'build', 'scrap for the Bunks and nothing else to do: build');
  state.scrap = 0;
  assert.equal(meta.advice().kind, 'play');
  assert.match(meta.advice().text, /Rosie/);
  meta.startConvoy();
  state.convoy.readyAt = meta.now();
  assert.equal(meta.advice().kind, 'convoy');
});

test('the loadout hands the game the run, you, your teammates and the favored role', () => {
  const { meta, state } = started(5, { people: 3 });
  const ids = meta.bestCrew(meta.nextRun());
  const L = meta.loadout(ids);
  assert.equal(L.run.name, STORY[0].name);
  assert.equal(L.you.id, state.you);
  assert.equal(L.teammates.length, ids.length - 1);
  assert.equal(L.favored, 'scout');
  assert.equal(L.power, meta.crewPower(ids, meta.nextRun()));
});

test('simulateRun is seeded and tells the story with the crew names', () => {
  const crew = [
    { id: 1, first: 'Aino', role: 'scout' },
    { id: 2, first: 'Ville', role: 'medic' },
  ];
  const run = { name: 'X', type: 'run', tag: 'night', chain: 0 };
  const a = simulateRun({ run, crew, power: 50, rec: 40, seed: 9 });
  const b = simulateRun({ run, crew, power: 50, rec: 40, seed: 9 });
  assert.deepEqual(a, b);
  assert.ok(a.events.some((e) => /Aino|Ville/.test(e.text)));
  const lost = simulateRun({ run, crew, power: 5, rec: 40, outcome: 'lose', seed: 2 });
  assert.equal(lost.won, false);
  assert.match(lost.events.at(-1).text, /fall back/);
});

test('content: every building after the firehouse has a chain; needed power rises run by run; stars rise in power', () => {
  const chained = CHAINS.map((c) => c.building);
  for (const b of BUILDINGS) if (!b.start) assert.ok(chained.includes(b.id), b.id);
  let last = 0;
  for (const r of STORY) {
    assert.ok(r.rec > last, `${r.name} needs more than the run before`);
    last = r.rec;
    assert.ok(r.text.length < 70, `${r.name}: short text`);
  }
  for (const c of CHAINS) assert.equal(c.runs.at(-1).type, 'finale');
  assert.ok(STARS[1].base < STARS[2].base && STARS[2].base < STARS[3].base);
});

test('letting someone go frees their bed; you can never be let go', () => {
  const { meta } = started(7, { people: 3 });
  const mate = meta.roster().find((p) => p.id !== meta.s.you);
  meta.s.crew = [mate.id];
  assert.equal(meta.freeBeds(), 0);
  assert.equal(meta.letGo(meta.s.you).reason, 'you');
  const r = meta.letGo(mate.id);
  assert.ok(r.ok);
  assert.equal(meta.person(mate.id), null);
  assert.deepEqual(meta.s.crew, []);
  assert.equal(meta.freeBeds(), 1);
  assert.equal(meta.s.stats.letGo, 1);
  assert.equal(meta.letGo(mate.id).reason, 'gone');
});

test('nobody shares a first name with someone already at Station 9 or at the gate', () => {
  const { meta } = started(11, { people: 7 });
  for (let k = 0; k < 2; k++) meta.arrive({});
  const names = [...meta.s.people, ...meta.s.gate.visitors].map((p) => p.first);
  assert.equal(new Set(names).size, names.length, names.join(', '));
  const fresh = make(3).state.candidates.map((p) => p.first);
  assert.equal(new Set(fresh).size, 3);
});

test('a slower or faster gate (testing slider) brings the next visitor no later than one new interval', () => {
  const { meta, clock } = started(5, { people: 2 });
  meta.openGate();
  const before = meta.s.gate.nextAt;
  meta.tuning.gate = 0.1;
  meta.retime();
  assert.ok(meta.s.gate.nextAt < before);
  assert.equal(meta.s.gate.nextAt, clock.now() + meta.gateInterval());
});

test('everyone who goes on a run has it counted', () => {
  const { meta } = started(5, { people: 3 });
  const { result } = play(meta, 'win');
  for (const id of result.crew) assert.equal(meta.person(id).runs, 1);
});

test('every loss thins them out: the next try at the same run needs 10% less, up to 30%; a win resets it', () => {
  const { meta } = started(5, { people: 3 });
  play(meta, 'win');
  play(meta, 'win');
  const base = meta.nextRun();
  assert.equal(base.worn, 0);
  const { out } = play(meta, 'lose');
  assert.equal(out.worn, 1);
  assert.equal(meta.nextRun().rec, Math.round(STORY[base.i].rec * 0.9));
  for (let k = 0; k < 4; k++) play(meta, 'lose');
  assert.equal(meta.nextRun().worn, 3);
  assert.equal(meta.nextRun().rec, Math.round(STORY[base.i].rec * 0.7));
  play(meta, 'win');
  const next = meta.nextRun();
  assert.equal(next.i, base.i + 1);
  assert.equal(next.worn, 0);
  assert.equal(next.rec, STORY[next.i].rec);
});

test('newcomers lean toward the roles you have fewest of', () => {
  const { meta } = started(9, { people: 1 });
  const you = meta.you().role;
  for (let k = 0; k < 4; k++) add(meta, { role: you });
  const others = ROLE_ORDER.filter((r) => r !== you);
  assert.deepEqual(meta.neededRoles(), others);
  let lean = 0;
  for (let k = 0; k < 200; k++) if (others.includes(meta._newcomer({ odds: GATE.odds, origin: 'gate' }).role)) lean++;
  assert.ok(lean > 140, `${lean}/200 of the roles we lack`);
});
