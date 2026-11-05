// Wobble War meta game: profile, fair-F2P economy, daily challenge, trophies,
// cosmetics and the campaign level table. All pure functions, run headless.

import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD } from '../battle/src/config.js';
import { UNIT_TYPES } from '../battle/src/sim/unit-types.js';
import { LEVELS } from '../battle/src/meta/levels.js';
import { newProfile, migrate, loadProfile, saveProfile, addBeans, spendBeans, totalStars, PROFILE_KEY } from '../battle/src/meta/profile.js';
import { WORLDS, LEVELS_PER_WORLD, REWARDS, levelUnlocked, nextLevel, worldReached, unlockedUnits, starsFor, recordLevelWin, dailyChallenge, recordDailyWin, dateKey, worldOf } from '../battle/src/meta/economy.js';
import { TROPHIES, trophyStatus, claimable, claimTrophy } from '../battle/src/meta/trophies.js';
import { COLORS, buyItem, equipColor, equipHat, armyPalette, grantSupporter } from '../battle/src/meta/cosmetics.js';
import { HATS } from '../battle/src/render/hats.js';

const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};

/** Clear levels 0..n-1 with a given spend. */
function clearUpTo(p, n, spent = 999) {
  for (let i = 0; i < n; i++) recordLevelWin(p, i, spent, LEVELS[i]);
}

// --- profile ------------------------------------------------------------------------

test('profile: fresh, saved, loaded and migrated without losing progress', () => {
  const s = memStore();
  const p = newProfile();
  addBeans(p, 123);
  p.stars[3] = 2;
  p.cleared[3] = true;
  p.owned.hats.push('party');
  assert.ok(saveProfile(p, s));
  const q = loadProfile(s);
  assert.equal(q.beans, 123);
  assert.equal(q.earned, 123);
  assert.equal(q.stars[3], 2);
  assert.ok(q.owned.hats.includes('party') && q.owned.hats.includes('none'));

  // An older save missing whole sections gets them filled in
  const old = migrate({ beans: 50, stars: { 0: 3 }, stats: { wins: 4 } });
  assert.equal(old.beans, 50);
  assert.equal(old.stats.wins, 4);
  assert.equal(old.stats.knockdowns, 0);
  assert.equal(old.settings.volume, 0.8);
  assert.equal(old.equipped.hats.brick, 'none');
  assert.deepEqual(old.owned.colors, ['blue']);

  // Junk never crashes the game
  s.setItem(PROFILE_KEY, '{nope');
  assert.equal(loadProfile(s).beans, 0);
  assert.equal(loadProfile(null).beans, 0);
  assert.equal(migrate({ beans: -5 }).beans, 0);
  assert.equal(migrate('hello').beans, 0);
  // Odd types in a hand-edited or damaged save keep the rest of the progress
  const odd = migrate({ beans: 100, cleared: { 0: true }, owned: { hats: 5, colors: { a: 1 } } });
  assert.equal(odd.beans, 100);
  assert.ok(odd.cleared[0]);
  assert.deepEqual(odd.owned.hats, ['none']);
  assert.deepEqual(odd.owned.colors, ['blue']);
  const broken = { setItem() { throw new Error('quota'); } };
  assert.equal(saveProfile(p, broken), false);
});

test('jellybeans: earned adds up, spending needs enough', () => {
  const p = newProfile();
  assert.equal(addBeans(p, 10.7), 10);
  assert.equal(spendBeans(p, 11), false);
  assert.equal(p.beans, 10);
  assert.ok(spendBeans(p, 4));
  assert.equal(p.beans, 6);
  assert.equal(p.earned, 10, 'spending never lowers lifetime earnings');
  assert.equal(spendBeans(p, -1), false);
});

// --- levels ---------------------------------------------------------------------------

test('levels: 30 well-formed levels in 3 worlds with descending star thresholds', () => {
  assert.equal(LEVELS.length, WORLDS.length * LEVELS_PER_WORLD);
  const cheapest = Math.min(...Object.values(UNIT_TYPES).map((t) => t.cost));
  const hatIds = new Set(HATS.map((h) => h.id));
  LEVELS.forEach((L, i) => {
    assert.equal(L.world, worldOf(i), `${L.name} world`);
    assert.ok(L.name && L.tip, `level ${i} has a name and tip`);
    const [win, two, three] = L.stars;
    assert.equal(L.budget, win);
    assert.ok(win >= two && two >= three && three >= cheapest, `${L.name}: stars ${L.stars}`);
    assert.ok(L.red.length > 0);
    for (const r of L.red) {
      assert.ok(UNIT_TYPES[r.type], r.type);
      assert.ok(r.x >= WORLD.zone.red[0] && r.x <= WORLD.zone.red[1], `${L.name}: x ${r.x} outside red zone`);
    }
    if (L.redHat) assert.ok(hatIds.has(L.redHat), `${L.name}: unknown hat ${L.redHat}`);
  });
  for (const w of WORLDS) assert.ok(LEVELS[(w.id + 1) * LEVELS_PER_WORLD - 1].boss, `world ${w.id} ends with a boss`);
});

// --- progression -------------------------------------------------------------------

test('progression: levels open one by one and worlds unlock units by playing', () => {
  const p = newProfile();
  assert.ok(levelUnlocked(p, 0));
  assert.ok(!levelUnlocked(p, 1));
  assert.equal(nextLevel(p, LEVELS.length), 0);
  assert.deepEqual(unlockedUnits(p), ['clubber', 'squire', 'archer']);

  const r0 = recordLevelWin(p, 0, LEVELS[0].budget, LEVELS[0]);
  assert.equal(r0.stars, 1);
  assert.ok(r0.firstClear);
  assert.equal(r0.beans, REWARDS.firstClear[0] + REWARDS.perStar[0]);
  assert.ok(levelUnlocked(p, 1));
  assert.equal(nextLevel(p, LEVELS.length), 1);

  // Better stars later pay only for the new stars; a plain replay pays a little
  const r1 = recordLevelWin(p, 0, LEVELS[0].stars[2], LEVELS[0]);
  assert.equal(r1.stars, 3);
  assert.equal(r1.newStars, 2);
  assert.equal(r1.beans, 2 * REWARDS.perStar[0]);
  const r2 = recordLevelWin(p, 0, LEVELS[0].budget, LEVELS[0]);
  assert.equal(r2.beans, REWARDS.replayWin);
  assert.equal(p.stars[0], 3, 'best stars are kept');
  assert.equal(totalStars(p), 3);

  // Clearing the World 1 boss opens World 2 and its units
  clearUpTo(p, LEVELS_PER_WORLD - 1);
  const boss = recordLevelWin(p, LEVELS_PER_WORLD - 1, 999, LEVELS[LEVELS_PER_WORLD - 1]);
  assert.equal(boss.unlockedWorld, 1);
  assert.deepEqual(boss.newUnits, ['spiker', 'bomb']);
  assert.equal(worldReached(p), 1);
  assert.ok(unlockedUnits(p).includes('bomb'));
  assert.ok(!unlockedUnits(p).includes('brick'));
  clearUpTo(p, LEVELS.length);
  assert.deepEqual(unlockedUnits(p), ['clubber', 'squire', 'archer', 'spiker', 'bomb', 'brick']);
});

test('fair play: money and cosmetics never unlock power', () => {
  const rich = newProfile();
  addBeans(rich, 1e6);
  grantSupporter(rich);
  for (const h of HATS) buyItem(rich, 'hats', h);
  for (const c of COLORS) buyItem(rich, 'colors', c);
  const fresh = newProfile();
  assert.deepEqual(unlockedUnits(rich), unlockedUnits(fresh));
  assert.equal(levelUnlocked(rich, 1), false);
  assert.equal(worldReached(rich), 0);
});

test('stars: 1 for a win, more for spending less', () => {
  const t = [300, 250, 200];
  assert.equal(starsFor(300, t), 1);
  assert.equal(starsFor(251, t), 1);
  assert.equal(starsFor(250, t), 2);
  assert.equal(starsFor(200, t), 3);
  assert.equal(starsFor(10, t), 3);
});

// --- daily -------------------------------------------------------------------------

test('daily: same challenge all day, picked from worlds you reached, pays once', () => {
  const p = newProfile();
  const key = dateKey(new Date(2026, 10, 4));
  assert.equal(key, '2026-11-04');
  const a = dailyChallenge(p, key, LEVELS);
  const b = dailyChallenge(p, key, LEVELS);
  assert.equal(a.base, b.base);
  assert.equal(a.seed, b.seed);
  // A fresh player only gets World 1 levels, on every day
  for (let d = 1; d <= 28; d++) assert.ok(worldOf(dailyChallenge(p, `2026-02-${String(d).padStart(2, '0')}`, LEVELS).base) === 0);

  const r1 = recordDailyWin(p, key, a.level.budget, a.level);
  assert.ok(r1.first);
  assert.equal(r1.beans, REWARDS.daily + REWARDS.dailyPerStar);
  assert.equal(p.stats.dailies, 1);
  assert.equal(dailyChallenge(p, key, LEVELS).done, 1);
  const r2 = recordDailyWin(p, key, a.level.budget, a.level);
  assert.equal(r2.beans, 0, 'a second win the same day with no new stars pays nothing');
  const r3 = recordDailyWin(p, key, a.level.stars[2], a.level);
  assert.equal(r3.beans, 2 * REWARDS.dailyPerStar);
  assert.equal(p.stats.dailies, 1);
  // Missing days costs nothing: there is no streak to lose
  const later = recordDailyWin(p, '2026-11-20', a.level.budget, a.level);
  assert.equal(later.beans, REWARDS.daily + REWARDS.dailyPerStar);
});

// --- trophies ------------------------------------------------------------------------

test('trophies: progress, claim once, derived goals', () => {
  const ids = new Set(TROPHIES.map((t) => t.id));
  assert.equal(ids.size, TROPHIES.length, 'unique ids');
  const p = newProfile();
  for (const t of TROPHIES) if (t.stat) assert.ok(t.stat in p.stats, `${t.id} reads stats.${t.stat}`);
  assert.equal(claimable(p), 0);
  assert.equal(claimTrophy(p, 'firstWin'), 0);
  p.stats.wins = 1;
  p.stats.knockdowns = 40;
  assert.equal(claimable(p), 1);
  const st = trophyStatus(p);
  assert.equal(st[0].id, 'firstWin', 'claimable trophies come first');
  assert.equal(st.find((t) => t.id === 'knockdowns').progress, 40);
  const before = p.beans;
  assert.equal(claimTrophy(p, 'firstWin'), 50);
  assert.equal(p.beans, before + 50);
  assert.equal(claimTrophy(p, 'firstWin'), 0, 'only once');
  assert.equal(claimable(p), 0);
  clearUpTo(p, LEVELS_PER_WORLD);
  assert.ok(trophyStatus(p).find((t) => t.id === 'world1').done);
  assert.ok(!trophyStatus(p).find((t) => t.id === 'world2').done);
});

// --- cosmetics -----------------------------------------------------------------------

test('cosmetics: buy with Jellybeans (two-step in the UI), equip only what you own', () => {
  const p = newProfile();
  const party = HATS.find((h) => h.id === 'party');
  assert.equal(buyItem(p, 'hats', party), 'poor');
  addBeans(p, party.price);
  assert.equal(equipHat(p, 'clubber', 'party'), false);
  assert.equal(buyItem(p, 'hats', party), 'bought');
  assert.equal(p.beans, 0);
  assert.equal(buyItem(p, 'hats', party), 'owned');
  assert.ok(equipHat(p, 'clubber', 'party'));
  assert.equal(p.equipped.hats.clubber, 'party');
  assert.equal(p.stats.hatsEquipped, 1);
  assert.ok(equipHat(p, 'clubber', 'party'));
  assert.equal(p.stats.hatsEquipped, 1, 're-equipping the same hat is not a new one');

  const gold = COLORS.find((c) => c.supporter);
  const crown = HATS.find((h) => h.supporter);
  addBeans(p, 1e5);
  assert.equal(buyItem(p, 'colors', gold), 'supporter', 'supporter items are not for Jellybeans');
  assert.equal(buyItem(p, 'hats', crown), 'supporter');
  assert.equal(equipColor(p, 'gold'), false);
  grantSupporter(p);
  assert.ok(equipColor(p, 'gold'));
  assert.equal(armyPalette(p), gold.pal);
  p.equipped.color = 'teal'; // not owned (e.g. a hand-edited save): falls back to blue
  assert.equal(armyPalette(p), COLORS[0].pal);
});

test('cosmetics: catalogue is sane and readable against the red army', () => {
  const hatIds = HATS.map((h) => h.id);
  assert.equal(new Set(hatIds).size, hatIds.length);
  assert.equal(HATS[0].id, 'none');
  assert.equal(HATS[0].price, 0);
  for (const h of HATS) assert.ok(h.supporter || h.id === 'none' || h.price > 0, `${h.id} has a price`);
  assert.deepEqual(HATS.filter((h) => h.supporter).map((h) => h.id), ['goldcrown']);
  const hue = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if (mx === mn) return null;
    const d = mx - mn;
    let hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (hh * 60 + 360) % 360;
  };
  for (const c of COLORS) {
    for (const k of ['body', 'shade', 'light', 'limb', 'dark']) assert.match(c.pal[k], /^#[0-9a-f]{6}$/i, `${c.id}.${k}`);
    const h = hue(c.pal.body);
    if (h != null) assert.ok(h > 30 && h < 330, `${c.id} must not look like the red team (hue ${h.toFixed(0)})`);
  }
});
