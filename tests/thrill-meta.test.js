import test from 'node:test';
import assert from 'node:assert/strict';
import { Meta, newState, milestoneAt, zoneAtSkulls } from '../thrill/src/meta.js';
import { FakeClock } from '../thrill/src/clock.js';
import { migrate } from '../thrill/src/save.js';
import { generatePerson, displayName } from '../thrill/src/people.js';
import { squadPower, crownOdds, waveChance, oddsLabel, basePower, threatFor } from '../thrill/src/raid.js';
import { rarityOdds, gradeAtLeast, glowChance, nextReadyAt, openNowCost } from '../thrill/src/chests.js';
import { mulberry32 } from '../thrill/src/util.js';
import { CLASSES, CLASS_ORDER, LOOK, RARITIES, CHESTS, ZONES, LEVEL_BADGES, LEVEL_COINS, MAX_LEVEL, PITY, TUNING_DEFAULTS, START, MAXED_BADGE_COINS, COUNTER, GATE_GEMS, MILESTONES, CROWN_REWARD, BIGTOP_COINS } from '../thrill/src/config.js';

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;

function make(seed = 7, mutate) {
  const clock = new FakeClock(T0);
  const state = newState(T0, seed);
  if (mutate) mutate(state);
  const meta = new Meta(state, { clock, tuning: { ...TUNING_DEFAULTS } });
  return { meta, clock, state };
}

/** A survivor built to order, living in the park. */
function add(meta, { cls = 'shooter', rarity = 'rookie', level = 1, perk = null, golden = false, badges = 0 } = {}) {
  const p = generatePerson(mulberry32(meta.s.nextId * 977), { id: meta.s.nextId++, cls, rarity, level, perk, golden });
  p.badges = badges;
  meta.s.people.push(p);
  return p;
}

/** Skip the scripted first chests and the forced first raid. */
function unscripted(meta) {
  meta.s.seen.noScript = true;
  meta.s.raids = 1;
}

test('a fresh park: three generated founders in the squad, both chests ready', () => {
  const { meta, state } = make();
  assert.equal(state.people.length, 3);
  assert.deepEqual(state.people.map((p) => [p.cls, p.rarity, p.level]), START.founders.map((f) => [f.cls, f.rarity, 1]));
  assert.deepEqual(state.squad, state.people.map((p) => p.id));
  assert.equal(new Set(state.people.map((p) => p.first)).size, 3, 'founders have different first names');
  assert.ok(meta.chestState('crate').ready);
  assert.ok(meta.chestState('vault').ready);
  assert.deepEqual(state.threats, ['runner']);
  assert.equal(state.zone, 1);
  assert.equal(state.coins, START.coins);
});

test('the generator is seeded and only produces values the portraits can draw', () => {
  const a = generatePerson(mulberry32(5), { id: 1, cls: 'medic', rarity: 'hero' });
  const b = generatePerson(mulberry32(5), { id: 1, cls: 'medic', rarity: 'hero' });
  assert.deepEqual(a, b);
  const rng = mulberry32(99);
  for (let i = 0; i < 400; i++) {
    const cls = CLASS_ORDER[i % 4];
    const rarity = Object.keys(RARITIES)[i % 4];
    const p = generatePerson(rng, { id: i, cls, rarity });
    const L = p.look;
    assert.ok(LOOK.bodies.includes(L.body));
    assert.ok(L.skin >= 0 && L.skin < LOOK.skins);
    assert.ok(LOOK.faces.includes(L.face));
    assert.ok(LOOK.hairStyles.includes(L.hair));
    assert.ok(L.hairColor >= 0 && L.hairColor < LOOK.hairNatural + LOOK.hairDyed);
    if (L.hairColor >= LOOK.hairNatural) assert.ok(RARITIES[rarity].perk >= 2, 'dyed hair is for Heroes and Legends');
    assert.ok(LOOK.hats.includes(L.hat));
    assert.ok(L.mascot >= 0 && L.mascot < LOOK.mascots);
    assert.ok(LOOK.eyes.includes(L.eyes));
    assert.ok(LOOK.mouths.includes(L.mouth));
    assert.ok(LOOK.extras.includes(L.extra));
    assert.ok(L.prop >= 0 && L.prop < CLASSES[cls].props.length);
    assert.ok(p.age >= 16 && p.age <= 76);
    if (rarity === 'legend') assert.ok(p.nick, 'Legends always have a nickname');
    if (rarity === 'rookie') assert.equal(p.perk, null);
    else assert.ok(p.perk);
  }
});

test('siblings share a surname, a hat and a family', () => {
  const base = generatePerson(mulberry32(1), { id: 1, cls: 'brawler', rarity: 'rookie' });
  const sib = generatePerson(mulberry32(2), { id: 2, cls: 'shooter', rarity: 'veteran', sibling: base });
  assert.equal(sib.last, base.last);
  assert.equal(sib.look.hat, base.look.hat);
  assert.equal(sib.siblingOf, 1);
  assert.equal(sib.family, 1);
});

test('display names: nicknames and elders', () => {
  assert.equal(displayName({ first: 'Sal', nick: 'Hotshot', elder: null }), 'Hotshot Sal');
  assert.equal(displayName({ first: 'Ilse', nick: 'Turbo', elder: 'Gran' }), 'Turbo Gran');
  assert.equal(displayName({ first: 'Dot', nick: null }), 'Dot');
});

test('chest timers: lateness grace up to a quarter, clamped if the clock goes back, gems to open now', () => {
  const period = 2 * HOUR;
  assert.equal(nextReadyAt(period, 0, 0), period);
  assert.equal(nextReadyAt(period, 0, 10 * MIN), 10 * MIN + period - 10 * MIN);
  assert.equal(nextReadyAt(period, 0, 60 * MIN), 60 * MIN + period - 30 * MIN, 'grace is capped at a quarter period');
  assert.equal(nextReadyAt(period, 0, 3 * HOUR), 3 * HOUR + period, 'a whole period late gets no grace');
  assert.equal(openNowCost('crate', 2 * HOUR), 12);
  assert.equal(openNowCost('crate', 9 * MIN), 1);
  assert.equal(openNowCost('vault', 8 * HOUR), 48);
  assert.equal(openNowCost('vault', 0), 0);

  const { meta, clock, state } = make();
  unscripted(meta);
  assert.ok(meta.openChest('crate').ok);
  assert.equal(meta.openChest('crate').ok, false, 'a chest never stacks');
  assert.equal(meta.chestState('crate').msLeft, 2 * HOUR);
  clock.warp(-5 * HOUR); // device clock rollback
  assert.equal(meta.chestState('crate').msLeft, 2 * HOUR, 'a rollback never makes the wait longer');
  clock.warp(30 * MIN);
  const before = state.gems;
  const cost = meta.openNowCost('crate');
  assert.ok(cost > 0);
  assert.ok(meta.openNow('crate').ok);
  assert.equal(state.gems, before - cost);
  assert.ok(meta.chestState('crate').ready);
  state.gems = 0;
  assert.ok(meta.openChest('crate').ok);
  assert.equal(meta.openNow('crate').ok, false, 'needs gems');
});

test('the first Crate and Vault are scripted: Silver with a Veteran Shooter, Gold with a Hero Shooter and a finisher', () => {
  const { meta, state } = make(3);
  const crate = meta.openChest('crate');
  assert.deepEqual(crate.knocks, START.script.crate.knocks);
  assert.equal(crate.grade, 1);
  assert.equal(crate.newcomers.length, 1);
  const kai = crate.newcomers[0].person;
  assert.equal(kai.rarity, 'veteran');
  assert.equal(kai.cls, 'shooter');
  assert.equal(kai.perk, 'lucky');
  assert.ok(crate.newcomers[0].placed);
  assert.equal(crate.stacks.length, 3, 'one Badge stack per squad member');
  assert.ok(crate.stacks.every((s) => s.ready), 'the founders are READY after the first Crate');
  const vault = meta.openChest('vault');
  assert.equal(vault.grade, 2);
  const sal = vault.newcomers[0].person;
  assert.equal(sal.rarity, 'hero');
  assert.equal(sal.cls, 'shooter');
  assert.ok(vault.finisher && vault.finisher.finisher);
  assert.ok(vault.finisher.ready, 'every Vault ends on a READY');
  assert.equal(state.people.length, 5);
});

test('Glow-Up odds match the posted table, and seeded chests follow them', () => {
  const lv1 = gradeAtLeast(glowChance(1));
  assert.ok(Math.abs(lv1[1] - 0.32) < 0.005);
  assert.ok(Math.abs(lv1[2] - 0.04) < 0.002);
  assert.ok(Math.abs(1 / lv1[3] - 580) < 10);
  const lv7 = gradeAtLeast(glowChance(7));
  assert.ok(Math.abs(lv7[1] - 0.45) < 0.01);
  assert.ok(Math.abs(lv7[2] - 0.086) < 0.003);

  const { meta, clock, state } = make(11);
  unscripted(meta);
  let silverPlus = 0;
  const N = 1500;
  for (let i = 0; i < N; i++) {
    const r = meta.openChest('crate');
    assert.ok(r.ok, r.reason);
    if (r.grade >= 1) silverPlus++;
    // keep the park small so the test stays quick
    while (state.people.length > 12) state.people.pop();
    clock.warp(3 * HOUR);
  }
  assert.ok(Math.abs(silverPlus / N - lv1[1]) < 0.04, `silver+ ${silverPlus / N}`);
});

test('a better grade raises the newcomer: Silver at least Veteran, Gold at least Hero, Rainbow a Legend', () => {
  for (const [grade, floor] of [[1, 'veteran'], [2, 'hero'], [3, 'legend']]) {
    const { meta } = make(20 + grade);
    unscripted(meta);
    meta.force.grade = grade;
    const r = meta.openChest('crate');
    assert.equal(r.grade, grade);
    assert.ok(r.newcomers.length >= 1, 'a Silver Crate always has someone');
    const rk = ['rookie', 'veteran', 'hero', 'legend'];
    assert.ok(rk.indexOf(r.newcomers[0].person.rarity) >= rk.indexOf(floor));
  }
});

test('rarity odds by level match the spec, and the Legend pity fires by the 30th newcomer', () => {
  assert.deepEqual(Object.values(rarityOdds('crate', 1)).map((x) => Math.round(x)), [65, 28, 6, 1]);
  assert.deepEqual(Object.values(rarityOdds('crate', 7)).map((x) => Math.round(x)), [41, 40, 15, 4]);
  assert.deepEqual(Object.values(rarityOdds('vault', 1)).map((x) => Math.round(x)), [0, 72, 24, 4]);
  assert.deepEqual(Object.values(rarityOdds('vault', 7)).map((x) => Math.round(x)), [0, 54, 36, 10]);

  const { meta, clock, state } = make(5);
  unscripted(meta);
  state.pity = PITY - 1;
  meta.tuning.glow = -1; // no Glow-Ups
  state.buildings.crate = 7;
  let r;
  for (let i = 0; i < 20; i++) {
    r = meta.openChest('crate');
    if (r.newcomers.length) break;
    clock.warp(3 * HOUR);
  }
  assert.equal(r.newcomers[0].person.rarity, 'legend');
  assert.equal(state.pity, 0);
});

test('Badges fill a personal bar; READY plus coins levels up; extra Badges carry over; max level turns Badges into coins', () => {
  const { meta, state } = make();
  const p = state.people[0];
  p.badges = LEVEL_BADGES[0] + LEVEL_BADGES[1] + 1;
  assert.ok(meta.isReady(p));
  assert.equal(meta.readyLevels(p), 2);
  state.coins = 0;
  assert.equal(meta.levelUp(p.id).ok, false);
  state.coins = 1000;
  const r = meta.levelUp(p.id);
  assert.ok(r.ok);
  assert.equal(p.level, 2);
  assert.equal(state.coins, 1000 - LEVEL_COINS[0]);
  assert.equal(p.badges, LEVEL_BADGES[1] + 1);
  assert.ok(r.stillReady);
  assert.ok(r.powerAfter > r.powerBefore);
  p.level = MAX_LEVEL;
  const coins = state.coins;
  const st = meta._giveBadges(p, 10);
  assert.ok(st.maxed);
  assert.equal(state.coins, coins + 10 * MAXED_BADGE_COINS);
  assert.equal(meta.levelUp(p.id).ok, false);
});

test('power: rarity, ride and golden multiply; a Lv 6 Rookie beats a Lv 1 Legend; counters are ×1.5', () => {
  const b = { striker: 1, gallery: 1, tent: 0, garage: 0 };
  const rookie6 = { cls: 'brawler', rarity: 'rookie', level: 6, golden: false };
  const legend1 = { cls: 'brawler', rarity: 'legend', level: 1, golden: false };
  assert.ok(basePower(rookie6, b) > basePower(legend1, b));
  assert.equal(basePower({ cls: 'medic', rarity: 'rookie', level: 1 }, b), 10, 'a locked ride gives nothing');
  assert.ok(Math.abs(basePower({ ...legend1, golden: true }, b) - basePower(legend1, b) * 1.2) < 1e-9);
  const sp = squadPower([{ id: 1, ...rookie6 }, { id: 2, cls: 'shooter', rarity: 'rookie', level: 6 }], ['runner'], b);
  assert.ok(sp.members[0].counter && !sp.members[1].counter);
  assert.ok(Math.abs(sp.members[0].power / sp.members[0].base - COUNTER) < 1e-9);
  assert.equal(waveChance(1000, 10), 0.97);
  assert.equal(waveChance(0, 10), 0.05);
  assert.equal(oddsLabel(0.7).id, 'easy');
  assert.equal(oddsLabel(0.4).id, 'good');
  assert.equal(oddsLabel(0.2).id, 'tough');
  assert.equal(oddsLabel(0.1).id, 'risky');
  assert.equal(threatFor(1), 36);
  assert.equal(threatFor(1, { rally: true }), 36 * 0.8);
});

test('newcomers arrive relative to the squad\'s average level with a half-full bar', () => {
  const { meta, state } = make();
  unscripted(meta);
  for (const p of state.people) p.level = 6;
  for (const [rarity, lv] of [['rookie', 4], ['veteran', 5], ['hero', 6], ['legend', 7]]) {
    const p = meta._makeNewcomer(mulberry32(lv), { rarity, sibling: false }, 'test');
    assert.equal(p.level, lv, rarity);
    assert.equal(p.badges, Math.floor(LEVEL_BADGES[lv - 1] / 2));
  }
});

test('everyone moves in; the Vault finisher tops up whoever is closest to READY', () => {
  const { meta, state } = make(9);
  unscripted(meta);
  for (let i = 0; i < 20; i++) add(meta, { cls: 'medic' });
  const before = state.people.length;
  meta.force.rarity = 'hero';
  const r = meta.openChest('vault');
  assert.ok(r.ok);
  assert.ok(r.newcomers.every((n) => n.placed));
  assert.equal(state.people.length, before + r.newcomers.length, 'no cap: the park keeps everyone');
  assert.ok(r.finisher && r.finisher.finisher);
  const target = meta.person(r.finisher.id);
  assert.ok(target);
  assert.ok(r.finisher.ready, 'the finisher lands on a READY');
});

test('the Big Top makes raids pay more coins', () => {
  const { meta, state } = make();
  unscripted(meta);
  meta.tuning.outcome = 'win';
  const a = meta.raid();
  assert.equal(a.coins, Math.round(CROWN_REWARD.coins(1, 3) * (a.bagged ? 2 : 1)));
  state.buildings.bigtop = 4;
  const b = meta.raid();
  assert.equal(b.coins, Math.round(CROWN_REWARD.coins(1, 3) * (1 + BIGTOP_COINS * 3) * (b.bagged ? 2 : 1)));
});

test('raids: three waves, a crown each; the first raid is a 3-crown win; Skulls never drop below the zone gate; a Rally after two bad raids', () => {
  const { meta, state } = make();
  meta.tuning.outcome = 'lose';
  const first = meta.raid();
  assert.equal(first.crowns, 3);
  assert.ok(first.won && first.first);
  assert.equal(state.skulls, CROWN_REWARD.skulls[3]);
  assert.deepEqual(state.threats, [START.script.secondThreat]);
  const l1 = meta.raid();
  assert.equal(l1.crowns, 0);
  assert.equal(state.skulls, CROWN_REWARD.skulls[3] + CROWN_REWARD.skulls[0]);
  assert.equal(l1.coins, Math.round(CROWN_REWARD.coins(1, 0)));
  assert.ok(l1.fix, 'a bad raid names one fix');
  meta.tuning.outcome = 'one';
  assert.equal(meta.raid().crowns, 1);
  assert.ok(meta.isRally());
  const pre = meta.raidPreview();
  assert.ok(pre.rally);
  assert.ok(Math.abs(pre.T - ZONES[0].threat * 0.8) < 1e-9);
  meta.tuning.outcome = 'lose';
  for (let i = 0; i < 6; i++) meta.raid();
  assert.equal(state.skulls, 0, 'never below Zone 1 gate');
  meta.tuning.outcome = 'two';
  const w = meta.raid();
  assert.ok(w.rally);
  assert.equal(w.crowns, 2);
  assert.equal(w.coins, Math.round(CROWN_REWARD.coins(1, 2) * 2 * (w.bagged ? 2 : 1)));
  assert.ok(!meta.isRally(), 'two crowns ends the Rally');
});

test('crowns stop at the first missed wave and follow the posted odds', () => {
  const o = crownOdds(36, 36);
  assert.deepEqual(o.waves.map((x) => Math.round(x * 100)), [97, 80, 50]);
  assert.ok(Math.abs(o.three - 0.97 * 0.8 * 0.5) < 1e-9);
  assert.ok(Math.abs(o.dist.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const { meta, state } = make(31);
  unscripted(meta);
  state.threats = ['runner'];
  const pre = meta.raidPreview();
  const N = 2000;
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < N; i++) {
    state.skulls = 0;
    state.best = 10_000; // no milestones
    state.milestones = 10_000;
    state.losses = 0;
    state.threats = ['runner'];
    counts[meta.raid().crowns]++;
  }
  const expect = crownOdds(pre.S, pre.T).dist;
  // Clutch saves turn some 2-crown raids into 3 crowns, so compare 0 and 1 crowns.
  assert.ok(Math.abs(counts[0] / N - expect[0]) < 0.03);
  assert.ok(Math.abs(counts[1] / N - expect[1]) < 0.04);
});

test('threats never repeat a single threat twice in a row; Zone 4 raids have two different threats', () => {
  const { meta, state } = make();
  unscripted(meta);
  meta.tuning.outcome = 'lose';
  let prev = state.threats.join();
  for (let i = 0; i < 40; i++) {
    meta.raid();
    assert.notEqual(state.threats.join(), prev);
    prev = state.threats.join();
  }
  meta.cheat('skulls', ZONES[3].gate + 10);
  assert.equal(state.zone, 4);
  for (let i = 0; i < 20; i++) {
    meta.raid();
    assert.equal(state.threats.length, 2);
    assert.notEqual(state.threats[0], state.threats[1]);
  }
});

test('zones: gems, rides open at Lv 1, a gate gift walks in, the building cap rises, a new threat comes with its counter', () => {
  const { meta, state } = make();
  unscripted(meta);
  meta.tuning.outcome = 'win';
  state.skulls = 90;
  state.best = 90;
  state.milestones = 1;
  const gems = state.gems;
  assert.equal(meta.maxBuildingLevel(), 2);
  const r = meta.raid();
  assert.equal(r.zones.length, 1);
  const z = r.zones[0];
  assert.equal(z.zone, 2);
  assert.equal(state.buildings.tent, 1);
  assert.deepEqual(z.unlocked, ['tent']);
  assert.equal(z.gift.person.cls, 'medic');
  assert.equal(z.gift.person.rarity, 'veteran');
  assert.deepEqual(state.threats, ['spitter']);
  assert.ok(state.gems >= gems + GATE_GEMS);
  assert.equal(meta.maxBuildingLevel(), 3);
  assert.equal(meta.canUpgrade('garage').locked, true);
});

test('milestones: every 50 Skulls between gates, cycling coins, Badges and gems, each claimed once', () => {
  assert.equal(milestoneAt(0), 50);
  assert.equal(milestoneAt(1), 150);
  assert.equal(milestoneAt(2), 200);
  assert.equal(milestoneAt(3), 250);
  assert.equal(milestoneAt(4), 300);
  assert.equal(milestoneAt(5), 400);
  assert.equal(zoneAtSkulls(99), 1);
  assert.equal(zoneAtSkulls(100), 2);
  const { meta, state } = make();
  unscripted(meta);
  meta.tuning.outcome = 'win';
  state.skulls = 20;
  state.best = 20;
  const coins = state.coins;
  const r = meta.raid();
  assert.equal(r.milestones.length, 1);
  assert.equal(r.milestones[0].kind, MILESTONES.cycle[0]);
  assert.ok(state.coins >= coins + MILESTONES.coins(1) + Math.round(CROWN_REWARD.coins(1, 3)));
  meta.tuning.outcome = 'lose';
  meta.raid();
  meta.tuning.outcome = 'win';
  const again = meta.raid();
  assert.equal(again.milestones.length, 0, 'a milestone pays once');
});

test('BEST finds the counters; nextStep points at the one thing to do', () => {
  const { meta, state } = make();
  unscripted(meta);
  state.threats = ['brute'];
  const s1 = add(meta, { cls: 'shooter', rarity: 'hero', level: 2 });
  const s2 = add(meta, { cls: 'shooter', rarity: 'veteran', level: 2 });
  const g = meta.bestGain();
  assert.ok(g.better);
  assert.ok(g.ids.includes(s1.id) && g.ids.includes(s2.id));
  assert.equal(meta.nextStep().kind, 'chest');
  meta.openChest('crate');
  meta.openChest('vault');
  const step = meta.nextStep();
  assert.ok(['ready', 'best', 'build'].includes(step.kind), step.kind);
  state.coins = 0;
  for (const p of state.people) p.badges = 0;
  meta.useBest();
  assert.equal(meta.nextStep().kind, 'play');
});

test('gifts: coming back after an hour away may bring one; claiming pays once', () => {
  const { meta, clock, state } = make();
  clock.warp(30 * MIN);
  assert.equal(meta.arrive(), null, 'not away long enough');
  meta.force.gift = true;
  clock.warp(2 * HOUR);
  const g = meta.arrive();
  assert.ok(g && state.gift);
  const coins = state.coins;
  const gems = state.gems;
  const r = meta.claimGift();
  assert.ok(r.ok);
  assert.ok(state.coins > coins || state.gems > gems || (r.stack && r.stack.n > 0));
  assert.equal(meta.claimGift().ok, false);
});

test('saves round-trip and old saves get new fields', () => {
  const { meta, state } = make();
  meta.raid();
  const json = JSON.parse(JSON.stringify(state));
  delete json.stats.gifts;
  delete json.seen;
  delete json.people[0].family;
  const back = migrate(json, T0);
  assert.equal(back.skulls, state.skulls);
  assert.equal(back.stats.gifts, 0);
  assert.deepEqual(back.seen, {});
  assert.equal(back.people[0].family, null);
  assert.equal(back.people.length, 3);
  const junk = migrate({ nope: 1 }, T0);
  assert.equal(junk.people.length, 3);
});
