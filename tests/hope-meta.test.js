import test from 'node:test';
import assert from 'node:assert/strict';
import { Meta, newState, nice } from '../hope/src/meta.js';
import { FakeClock } from '../hope/src/clock.js';
import { migrate } from '../hope/src/save.js';
import { generatePerson, basePower, rollTraits } from '../hope/src/people.js';
import { simulateRun } from '../hope/src/run-sim.js';
import { BUILDINGS, CHAINS, STORY_TOTAL, RUNS_PER_CHAIN, GATE, CONVOY, TUNING_DEFAULTS, TRAITS, TRAIT_CLASH, GRADES, MAX_LEVEL, XP_TO_NEXT, FAVORED_BONUS, SQUAD_SIZE, INJURY, MAX_FACILITY_LEVEL } from '../hope/src/config.js';
import { mulberry32 } from '../hope/src/util.js';

const T0 = 1_700_000_000_000;

function make(seed = 5, mutate) {
  const clock = new FakeClock(T0);
  const rng = mulberry32(seed);
  const state = newState(T0, rng);
  if (mutate) mutate(state);
  const meta = new Meta(state, { clock, tuning: { ...TUNING_DEFAULTS }, rng });
  return { meta, clock, state };
}

/** A person built to order, already living on the street. */
function addPerson(meta, { role = 'shooter', grade = 2, level = 1, traits = [] } = {}) {
  const p = generatePerson(mulberry32(meta.s.nextId * 31), { id: meta.s.nextId++, grade, role, level });
  p.traits = traits;
  p.joined = meta.s.day;
  meta.s.people.push(p);
  return p;
}

function play(meta, key, ids, outcome = 'win', seed = 1) {
  const r = meta.planRun(key, ids, { outcome, seed });
  assert.ok(r.ok, r.reason);
  return { result: r.result, out: meta.applyRun(r.result) };
}

test('a fresh street: two founders with different roles, four beds, the firehouse', () => {
  const { meta, state } = make();
  assert.equal(state.people.length, 2);
  assert.notEqual(state.people[0].role, state.people[1].role);
  assert.deepEqual(state.people.map((p) => p.grade), [2, 1]);
  assert.equal(meta.beds(), 4);
  assert.equal(meta.freeBeds(), 2);
  assert.equal(state.buildings.firehouse, 1);
  assert.equal(state.buildings.diner, 0);
  assert.deepEqual(state.squad, state.people.map((p) => p.id));
  assert.equal(state.story, 0);
  assert.equal(state.scavenges.length, 2);
});

test('visitors: the first after a minute, the second soon after, then one per interval until the gate is full', () => {
  const { meta, clock, state } = make();
  meta.tick();
  assert.equal(state.gate.visitors.length, 0);
  clock.warp(GATE.first * 1000);
  meta.tick();
  assert.equal(state.gate.visitors.length, 1);
  clock.warp((GATE.second - GATE.first) * 1000);
  meta.tick();
  assert.equal(state.gate.visitors.length, 2);
  // Full (capacity 2): nobody else comes, however long you wait.
  clock.warp(10 * GATE.every * 60 * 1000);
  meta.tick();
  assert.equal(state.gate.visitors.length, 2);
  // Turning one away restarts a full interval.
  meta.turnAway(state.gate.visitors[0].id);
  clock.warp(GATE.every * 60 * 1000 - 1000);
  meta.tick();
  assert.equal(state.gate.visitors.length, 1);
  clock.warp(2000);
  meta.tick();
  assert.equal(state.gate.visitors.length, 2);
});

test('gems call someone to the gate now, unless the gate is full', () => {
  const { meta, state } = make();
  state.gems = GATE.callGems;
  const r = meta.callNow();
  assert.ok(r.ok);
  assert.equal(state.gems, 0);
  assert.equal(state.gate.visitors.length, 1);
  assert.equal(meta.callNow().reason, 'gems');
  state.gems = 100;
  meta.callNow();
  assert.equal(meta.callNow().reason, 'gateFull');
});

test('taking someone in needs a free bed; letting someone go frees one; swap does both', () => {
  const { meta, state } = make();
  addPerson(meta);
  addPerson(meta); // 4/4 beds
  const v = meta.callVisitor();
  assert.equal(meta.takeIn(v.id).reason, 'beds');
  const weakest = meta.roster().at(-1);
  const r = meta.swap(v.id, weakest.id);
  assert.ok(r.ok);
  assert.ok(state.people.some((p) => p.id === v.id));
  assert.ok(!state.people.some((p) => p.id === weakest.id));
  assert.equal(state.gate.visitors.length, 0);
  assert.equal(state.stats.takenIn, 1);
  assert.equal(state.stats.letGo, 1);
  // You always keep someone.
  while (state.people.length > 1) meta.letGo(state.people[0].id);
  assert.equal(meta.letGo(state.people[0].id).reason, 'last');
});

test('upgrades are instant, cost scrap, and stop at the max level; unreclaimed buildings are locked', () => {
  const { meta, state } = make();
  assert.equal(meta.upgrade('diner').reason, 'locked');
  const cost = meta.upgradeCost('firehouse');
  assert.equal(cost, nice(BUILDINGS[0].costs[1]));
  assert.equal(meta.upgrade('firehouse').reason, 'scrap');
  state.scrap = 10_000;
  assert.ok(meta.upgrade('firehouse').ok);
  assert.equal(state.scrap, 10_000 - cost);
  assert.equal(meta.beds(), BUILDINGS[0].values[1]);
  while (meta.upgradeCost('firehouse') !== null) meta.upgrade('firehouse');
  assert.equal(meta.level('firehouse'), MAX_FACILITY_LEVEL);
  assert.equal(meta.upgrade('firehouse').reason, 'maxed');
});

test('the Motel adds beds on top of the Firehouse bunks', () => {
  const { meta, state } = make();
  state.buildings.motel = 2;
  const motel = BUILDINGS.find((b) => b.id === 'motel');
  assert.equal(meta.beds(), BUILDINGS[0].values[0] + motel.values[1]);
});

test('the first story run always survives with three stars and moves the story on', () => {
  const { meta, state } = make();
  const r = meta.planRun('story', state.squad.slice());
  assert.ok(r.ok);
  assert.equal(r.result.won, true);
  assert.equal(r.result.stars, 3);
  const out = meta.applyRun(r.result);
  assert.equal(out.advanced, true);
  assert.equal(state.story, 1);
  assert.equal(state.day, 2);
  assert.ok(out.scrap > 0);
});

test('a rescue run brings a skilled survivor to the gate; a finale reclaims its building at level 1', () => {
  const { meta, state } = make();
  state.story = 1; // Walk-in Freezer (rescue)
  const { out } = play(meta, 'story', state.squad.slice());
  assert.ok(out.rescued, 'someone was rescued');
  assert.ok(out.rescued.grade >= 2);
  assert.ok(state.gate.visitors.some((p) => p.id === out.rescued.id));
  const { out: fin } = play(meta, 'story', state.squad.slice());
  assert.equal(fin.reclaimed, 'diner');
  assert.equal(state.buildings.diner, 1);
  assert.equal(state.log.length, 1);
  assert.ok(fin.gems > 0, 'finales pay gems');
});

test('the last finale seals the street; story runs end there, scavenges go on', () => {
  const { meta, state } = make();
  state.story = STORY_TOTAL - 1;
  for (const p of state.people) p.injured = 0;
  const { out } = play(meta, 'story', state.squad.slice());
  assert.equal(out.sealed, true);
  assert.equal(state.sealed, true);
  assert.equal(meta.storyRun(), null);
  assert.equal(meta.canPlay('story').reason, 'sealed');
  assert.ok(meta.canPlay('scav0').ok);
});

test('crew power: favored role, tag traits, workshop, born leader and friends', () => {
  const { meta, state } = make();
  state.people.length = 0;
  const scout = addPerson(meta, { role: 'scout', grade: 2, level: 3 });
  const owl = addPerson(meta, { role: 'bruiser', grade: 2, level: 3, traits: ['nightOwl'] });
  const loud = addPerson(meta, { role: 'bruiser', grade: 2, level: 3, traits: ['loud'] });
  const night = { tags: ['night'], rec: 100 };
  const base = basePower(scout);
  assert.equal(meta.memberPower(scout, night), base * (1 + FAVORED_BONUS));
  assert.equal(meta.memberPower(owl, night), base * (1 + TRAITS.nightOwl.power));
  assert.equal(meta.memberPower(loud, night), base * (1 + TRAITS.loud.power));
  const sum = meta.memberPower(scout, night) + meta.memberPower(owl, night);
  assert.equal(meta.squadPower([scout.id, owl.id], night), Math.round(sum));
  state.buildings.hardware = 2;
  assert.equal(meta.squadPower([scout.id, owl.id], night), Math.round(sum * (1 + meta.workshop())));
  const lead = addPerson(meta, { role: 'medic', grade: 1, level: 1, traits: ['leader'] });
  const withLead = meta.squadPower([scout.id, owl.id, lead.id], night);
  assert.equal(withLead, Math.round((sum + meta.memberPower(lead, night)) * (1 + meta.workshop() + TRAITS.leader.squad)));
  assert.ok(meta.squadPower([scout.id], night, 1) > meta.squadPower([scout.id], night), 'a friend adds power');
  // For a night run the Scout and the Night owl beat the Loud one of the same level.
  assert.deepEqual(meta.bestSquad(night, 2).sort(), [scout.id, owl.id].sort());
});

test('a crew needs at least one person, no more than four with friends, nobody injured', () => {
  const { meta, state } = make();
  const ids = state.squad.slice();
  assert.equal(meta.planRun('story', []).reason, 'empty');
  assert.equal(meta.planRun('story', ids, { friends: 3 }).reason, 'full');
  state.people[0].injured = 2;
  assert.equal(meta.planRun('story', ids).reason, 'injured');
  assert.ok(meta.planRun('story', [ids[1]], { friends: 3 }).ok);
});

test('a lost run hurts whoever went down; injuries heal one day per run; the infirmary heals faster', () => {
  const { meta, state } = make();
  state.stats.runs = 5;
  const ids = state.squad.slice();
  const { result, out } = play(meta, 'story', ids, 'lose', 3);
  assert.equal(out.won, false);
  assert.ok(result.downed.length >= 1);
  for (const id of result.downed) {
    const p = meta.person(id);
    assert.ok(p.injured >= INJURY.downedDays[0] && p.injured <= INJURY.downedDays[1]);
  }
  const hurt = meta.person(result.downed[0]);
  const days = hurt.injured;
  const fit = state.people.filter((p) => p.injured <= 0).map((p) => p.id);
  if (!fit.length) addPerson(meta);
  const crew = state.people.filter((p) => p.injured <= 0).map((p) => p.id);
  play(meta, 'scav0', crew, 'win', 9);
  assert.equal(hurt.injured, days - 1);
  // With an infirmary at level 4, a downed person is out for a day or two less.
  const { meta: m2, state: s2 } = make(11);
  s2.stats.runs = 5;
  s2.buildings.clinic = 4;
  const r2 = play(m2, 'story', s2.squad.slice(), 'lose', 3);
  for (const id of r2.result.downed) assert.ok(m2.person(id).injured <= INJURY.downedDays[1] - 2);
});

test('healing now costs gems per day left', () => {
  const { meta, state } = make();
  const p = state.people[0];
  p.injured = 2;
  assert.equal(meta.healCost(p), 2 * INJURY.healGemsPerDay);
  state.gems = 1;
  assert.equal(meta.heal(p.id).reason, 'gems');
  state.gems = 100;
  assert.ok(meta.heal(p.id).ok);
  assert.equal(p.injured, 0);
  assert.equal(meta.heal(p.id).reason, 'healthy');
});

test('XP: the crew levels up by playing; the kitchen speeds it up; training levels the people at home', () => {
  const { meta, state } = make();
  state.stats.runs = 1;
  const stay = addPerson(meta, { role: 'medic', grade: 1, level: 1 });
  const ids = state.squad.slice();
  const { out } = play(meta, 'scav0', ids, 'win', 2);
  assert.equal(out.xp.length, ids.length);
  for (const x of out.xp) assert.ok(x.gained > 0);
  assert.equal(out.home.length, 0, 'no gym yet: nobody trains at home');
  assert.equal(stay.xp, 0);
  state.buildings.gym = 1;
  state.buildings.diner = 1;
  const { out: o2 } = play(meta, 'scav0', ids, 'win', 2);
  const h = o2.home.find((x) => x.id === stay.id);
  assert.ok(h && h.gained > 0);
  // Level ups carry over the rest of the XP; the max level stops XP.
  const p = state.people[0];
  p.level = 1;
  p.xp = 0;
  const ups = meta.giveXp(p, XP_TO_NEXT[0] + XP_TO_NEXT[1] + 5);
  assert.equal(ups, 2);
  assert.equal(p.level, 3);
  assert.equal(p.xp, 5);
  p.level = MAX_LEVEL;
  p.xp = 0;
  assert.equal(meta.giveXp(p, 1000), 0);
});

test('scavenges: two offers, a quick one and a big haul; the one you played is replaced', () => {
  const { meta, state } = make();
  state.stats.runs = 3;
  const quick = meta.run('scav0');
  const haul = meta.run('scav1');
  assert.equal(quick.scav, 'quick');
  assert.equal(haul.scav, 'haul');
  assert.ok(quick.rec < haul.rec);
  assert.ok(quick.scrap < haul.scrap);
  const before = state.scavenges[0].site;
  play(meta, 'scav0', state.squad.slice(), 'win', 4);
  assert.notEqual(state.scavenges[0].site, before);
  assert.notEqual(state.scavenges[0].site, state.scavenges[1].site);
  assert.equal(state.story, 0, 'scavenges never move the story');
});

test('the convoy comes every 8 hours with a skilled survivor, scrap and gems; it can be rushed', () => {
  const { meta, clock, state } = make();
  assert.equal(meta.claimConvoy().reason, 'notReady');
  const info = meta.convoyInfo();
  assert.equal(info.rushCost, Math.ceil((CONVOY.every / 3600) * 4));
  clock.warp(CONVOY.first * 1000);
  meta.tick();
  const r = meta.claimConvoy();
  assert.ok(r.ok);
  assert.ok(r.person.grade >= 2);
  assert.ok(state.gate.visitors.some((p) => p.id === r.person.id));
  assert.ok(r.scrap > 0 && r.gems >= CONVOY.gems[0]);
  state.gems = 0;
  assert.equal(meta.rushConvoy().reason, 'gems');
  state.gems = 100;
  const rush = meta.rushConvoy();
  assert.ok(rush.ok && rush.rushed > 0);
});

test('advice: the gate first, beds when full, then the story; a scavenge when the story is too hard', () => {
  const { meta, state } = make();
  const v = meta.callVisitor();
  assert.equal(meta.advice().kind, 'gate');
  meta.takeIn(v.id);
  addPerson(meta);
  meta.callVisitor(); // full, someone waiting
  state.scrap = 1000;
  const a = meta.advice();
  assert.equal(a.kind, 'build');
  assert.equal(a.item.why, 'beds');
  state.gate.visitors.length = 0;
  state.scrap = 0;
  state.stats.runs = 10;
  assert.equal(meta.advice().kind, 'play');
  meta.tuning.difficulty = 6;
  assert.equal(meta.advice().kind, 'scavenge');
});

test('the loadout hands the game the run, who you play, the bots and the favored roles', () => {
  const { meta, state } = make();
  state.story = 1; // Walk-in Freezer: indoors
  const ids = state.squad.slice();
  const L = meta.loadout('story', ids);
  assert.equal(L.run.name, CHAINS[0].runs[1].name);
  assert.equal(L.run.level, 'interior');
  assert.equal(L.you.id, ids[0]);
  assert.equal(L.bots.length, ids.length - 1);
  assert.deepEqual(L.favored, ['bruiser']);
  assert.equal(L.power, meta.squadPower(ids, meta.run('story')));
});

test('a revive turns a death into a win for gems, once, after 30% of the way', () => {
  const { meta, state } = make();
  state.stats.runs = 3;
  const ids = state.squad.slice();
  let result;
  for (let seed = 1; seed < 50; seed++) {
    result = meta.planRun('story', ids, { outcome: 'lose', seed }).result;
    if (result.progress >= 0.3) break;
  }
  state.gems = 100;
  assert.ok(meta.canRevive(result));
  assert.ok(meta.revive(result).ok);
  assert.equal(result.won, true);
  assert.deepEqual(result.downed, []);
  assert.equal(meta.canRevive(result), false);
  const out = meta.applyRun(result);
  assert.equal(out.won, true);
  assert.equal(state.story, 1);
});

test('migration keeps people and fills new fields', () => {
  const { state } = make();
  const old = JSON.parse(JSON.stringify(state));
  delete old.convoy;
  delete old.stats.levelUps;
  delete old.people[0].kills;
  const s = migrate(old, T0);
  assert.equal(s.people.length, state.people.length);
  assert.equal(s.people[0].first, state.people[0].first);
  assert.ok(s.convoy && s.convoy.readyAt > 0);
  assert.equal(s.stats.levelUps, 0);
  assert.equal(s.people[0].kills, 0);
  assert.ok(migrate(null, T0).people.length === 2);
});

test('people: the same seed makes the same person; traits never clash; grades set the trait mix', () => {
  const a = generatePerson(mulberry32(42), { id: 1, grade: 2 });
  const b = generatePerson(mulberry32(42), { id: 1, grade: 2 });
  assert.deepEqual(a, b);
  const rng = mulberry32(3);
  for (let i = 0; i < 400; i++) {
    const grade = 1 + (i % 3);
    const t = rollTraits(rng, grade);
    assert.ok(t.length >= 1 && t.length <= 3);
    assert.equal(new Set(t).size, t.length);
    for (const [x, y] of TRAIT_CLASH) assert.ok(!(t.includes(x) && t.includes(y)), `${x} + ${y}`);
    if (grade === 3) assert.ok(t.every((k) => TRAITS[k].good), 'elites have only good traits');
  }
  const p = generatePerson(mulberry32(9), { id: 2, grade: 3, level: 4 });
  assert.equal(basePower(p), Math.round(GRADES[3].base + GRADES[3].growth * 3));
});

test('newcomers lean toward roles you are missing and arrive a level behind your best four', () => {
  const { meta, state } = make();
  for (const p of state.people) p.level = 5;
  assert.equal(meta.recruitLevel(), 4);
  const missing = meta.missingRoles();
  assert.equal(missing.length, 3);
  let hits = 0;
  for (let i = 0; i < 200; i++) if (missing.includes(meta.callVisitor().role)) hits++;
  assert.ok(hits / 200 > 0.65, `missing roles were ${hits}/200`);
});

test('simulateRun reports who went down on a wipe and splits the kills', () => {
  const crew = [
    { id: 1, first: 'A', role: 'medic', traits: ['nightOwl'] },
    { id: 2, first: 'B', role: 'scout', traits: [] },
  ];
  const run = { key: 'story', name: 'X', type: 'run', tags: ['night'], chain: 0 };
  const lost = simulateRun({ run, crew, power: 10, rec: 100, outcome: 'lose', seed: 4 });
  assert.equal(lost.won, false);
  assert.ok(lost.downed.length >= 1 && lost.downed.every((id) => id === 1 || id === 2));
  assert.match(lost.events.at(-1).text, /Overwhelmed/);
  const won = simulateRun({ run, crew, power: 200, rec: 100, outcome: 'win', seed: 4 });
  assert.equal(won.downed.length, 0);
  assert.ok(Object.values(won.killsBy).every((k) => k >= 0));
  assert.equal(SQUAD_SIZE, 4);
});

test('content: every building but the firehouse has a chain of three runs with rising recommended power', () => {
  const chained = CHAINS.map((c) => c.building);
  for (const b of BUILDINGS) {
    if (b.start) assert.ok(!chained.includes(b.id));
    else assert.ok(chained.includes(b.id), `${b.id} has a chain`);
  }
  let last = 0;
  for (const c of CHAINS) {
    assert.equal(c.runs.length, RUNS_PER_CHAIN);
    assert.equal(c.runs[2].type, 'finale');
    assert.equal(c.runs[1].type, 'rescue');
    for (const r of c.runs) {
      assert.ok(r.rec > last, `${r.name} rec rises`);
      last = r.rec;
      assert.ok(r.text.length < 90);
    }
  }
});
