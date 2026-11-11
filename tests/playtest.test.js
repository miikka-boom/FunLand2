import test from 'node:test';
import assert from 'node:assert/strict';
import { todayKey, dailySeed, buildReport, reportText, perfSummary, historyText, saveReport, loadHistory, clearHistory, recordDaily, dailyBest, RATINGS } from '../src/playtest.js';
import { DEFAULTS } from '../src/settings.js';

// In-memory localStorage for the history / daily-best helpers.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

test('daily map: one seed per calendar day, the same everywhere', () => {
  assert.equal(todayKey(new Date(2026, 10, 7, 23, 59)), '2026-11-07');
  assert.equal(todayKey(new Date(2026, 0, 2)), '2026-01-02');
  assert.equal(dailySeed('2026-11-07'), dailySeed('2026-11-07'));
  assert.notEqual(dailySeed('2026-11-07'), dailySeed('2026-11-08'));
  const s = dailySeed('2026-11-07');
  assert.ok(Number.isInteger(s) && s >= 0 && s < 1e9);
});

test("daily best: fastest win, furthest run, per level, reset the next day", () => {
  store.clear();
  assert.equal(dailyBest('city', '2026-11-07'), null);
  recordDaily('city', false, 80, 0.4, '2026-11-07');
  recordDaily('city', true, 190.33, 1, '2026-11-07');
  recordDaily('city', true, 210, 1, '2026-11-07');
  const b = dailyBest('city', '2026-11-07');
  assert.deepEqual(b, { time: 190.3, progress: 1, runs: 3 });
  assert.equal(dailyBest('docks', '2026-11-07'), null);
  assert.equal(dailyBest('city', '2026-11-08'), null);
});

function fakeGame() {
  return {
    level: 'docks',
    seed: 1337,
    won: false,
    lost: true,
    progress: 0.734,
    settings: { ...DEFAULTS, level: 'docks', nightTerror: true },
    stats: { time: 151.27, kills: 88, shots: 400, hits: 172, damage: 140.4, hordes: 4, shoves: 12, hunters: 1, pins: 1, deadstops: 0, skeets: 0, tanks: 0, stashes: 2, rooms: 1, secrets: 0, terrors: 1, terrorsFled: 1, terrorHits: 2, holdouts: 0, explosions: 0, allyKills: 0, allySaves: 0, revives: 0 },
    loot: { totals: { stash: 5, room: 2, secret: 1 } },
    events: { holdout: null, breach: null, explosives: [], finale: { state: 'called' } },
    ally: null,
  };
}

test('report: everything worth knowing, readable lines + one JSON line that parses back', () => {
  const r = buildReport(fakeGame(), { ratings: { fun: 'great', controls: 'ok' }, perf: { avg: 58, low: 41, frames: 900 }, device: { os: 'iOS', w: 844, h: 390, dpr: 3, touch: true } });
  assert.equal(r.outcome, 'died');
  assert.equal(r.level, 'docks');
  assert.equal(r.accuracy, 0.43);
  assert.deepEqual(r.finds, { supplies: '2/5', rooms: '1/2', secret: false });
  assert.equal(r.events.ferry, 'called');
  assert.deepEqual(r.settings, { level: 'docks', nightTerror: true });
  const text = reportText(r);
  const lines = text.split('\n');
  assert.match(lines[0], /Pier 9 · seed 1337/);
  assert.match(lines[1], /Died at 73% in 2:31 · 88 kills · 43% accuracy/);
  assert.match(text, /Rated: fun great · controls ok/);
  assert.match(text, /ferry: called/);
  assert.match(text, /night terror: 1 killed, 1 driven off, hit you 2×/);
  assert.match(text, /iOS 844×390 @3x touch · 58 fps avg, 41 low/);
  assert.match(text, /Changed settings: level, nightTerror/);
  assert.deepEqual(JSON.parse(lines[lines.length - 1]), r);
  // Three questions, three answers each.
  assert.equal(RATINGS.length, 3);
  for (const q of RATINGS) assert.equal(q.options.length, 3);
});

test('report history: saved per run (re-rating updates it), copy-all text, clear', () => {
  store.clear();
  const a = buildReport(fakeGame());
  const b = buildReport({ ...fakeGame(), won: true, lost: false });
  saveReport(a);
  saveReport(b);
  a.ratings.fun = 'meh';
  saveReport(a);
  const h = loadHistory();
  assert.equal(h.length, 2);
  assert.equal(h.find((q) => q.id === a.id).ratings.fun, 'meh');
  const all = historyText(h);
  assert.match(all, /^We Left Ben playtest reports · 2 runs/);
  assert.match(all, /Made the ferry/);
  assert.equal(JSON.parse(all.split('\n').pop()).length, 2);
  clearHistory();
  assert.equal(loadHistory().length, 0);
  for (let k = 0; k < 50; k++) saveReport(buildReport(fakeGame()));
  assert.equal(loadHistory().length, 40, 'keeps the newest 40');
});

test('fps summary: average and 5% low from frame times', () => {
  assert.equal(perfSummary([0.016]), null);
  const frames = Array.from({ length: 100 }, (_, i) => (i < 95 ? 1 / 60 : 1 / 20));
  const p = perfSummary(frames);
  assert.equal(p.low, 20);
  assert.ok(p.avg >= 50 && p.avg <= 58);
});
