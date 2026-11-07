// Playtest kit: rate a run in three taps, copy or share a short report, keep a
// history on this device, and a daily map everyone plays (date-seeded).
//
// Pure helpers (report building, text, daily seed, storage) are exported for
// tests; ReportCard is the DOM card shown over the end screen.

import { diffFromDefaults } from './settings.js';

const HISTORY_KEY = 'funland2.p0.reports.v1';
const DAILY_KEY = 'funland2.p0.daily.v1';
const MAX_HISTORY = 40;

export const RATINGS = [
  { key: 'fun', label: 'Fun', options: [['meh', 'Meh'], ['good', 'Good'], ['great', 'Great']] },
  { key: 'difficulty', label: 'Difficulty', options: [['easy', 'Too easy'], ['right', 'About right'], ['hard', 'Too hard']] },
  { key: 'controls', label: 'Controls', options: [['bad', 'Fought me'], ['ok', 'OK'], ['great', 'Felt great']] },
];
export const LEVEL_NAMES = { city: 'Streets', interior: 'Building', docks: 'Pier 9' };

// --- Daily map ------------------------------------------------------------------------------

/** Local calendar date, e.g. "2026-11-07". */
export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "2026-11-07" -> "Sat 7 Nov" (in the player's locale). */
export function dateLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  try {
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return key;
  }
}

/** Same date, same seed, on every device (FNV-1a over the date string). */
export function dailySeed(key = todayKey()) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 1000000000;
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // storage blocked: the kit still works for this session
  }
}

/** Today's best on this device for a level: { time (fastest win), progress (furthest), runs }. */
export function dailyBest(level, key = todayKey()) {
  const d = readJSON(DAILY_KEY, null);
  if (!d || d.date !== key) return null;
  return d.levels[level] || null;
}

export function recordDaily(level, won, time, progress, key = todayKey()) {
  let d = readJSON(DAILY_KEY, null);
  if (!d || d.date !== key) d = { date: key, levels: {} };
  const b = d.levels[level] || { time: null, progress: 0, runs: 0 };
  b.runs++;
  if (won && (b.time === null || time < b.time)) b.time = +time.toFixed(1);
  b.progress = Math.max(b.progress, won ? 1 : +progress.toFixed(2));
  d.levels[level] = b;
  writeJSON(DAILY_KEY, d);
  return b;
}

// --- Reports -------------------------------------------------------------------------------

export const fmtTime = (t) => `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;

/** Everything worth knowing about a finished run (plain data). */
export function buildReport(game, { ratings = {}, perf = null, daily = null, device = null } = {}) {
  const st = game.stats;
  const S = game.settings;
  const L = game.loot;
  const E = game.events;
  const finale = E && E.finale;
  const finds = L && (L.totals.stash || L.totals.room || L.totals.secret)
    ? { supplies: `${st.stashes}/${L.totals.stash}`, rooms: `${st.rooms}/${L.totals.room}`, secret: L.totals.secret ? !!st.secrets : null }
    : null;
  return {
    v: 1,
    id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    when: new Date().toISOString(),
    level: game.level,
    seed: game.seed,
    daily,
    outcome: game.won ? 'won' : game.lost ? 'died' : 'quit',
    time: +st.time.toFixed(1),
    progress: +(game.won ? 1 : game.progress).toFixed(2),
    kills: st.kills,
    accuracy: st.shots ? +(st.hits / st.shots).toFixed(2) : 0,
    damageTaken: Math.round(st.damage),
    hordes: st.hordes,
    shoves: st.shoves,
    specials: { hunters: st.hunters, pins: st.pins, deadstops: st.deadstops, skeets: st.skeets, tanks: st.tanks, terrors: st.terrors || 0, terrorsFled: st.terrorsFled || 0, terrorHits: st.terrorHits || 0 },
    finds,
    world: {
      holdout: !!(E && E.holdout),
      routes: !!(E && E.breach),
      landmarks: !!(E && E.explosives && E.explosives.length),
      lore: !!S.lore,
      nightTerror: !!S.nightTerror,
      ben: !!S.ben,
    },
    events: {
      gateHeld: st.holdouts ? Math.round(st.holdoutTime) : null,
      shortcut: E && E.breach ? !!st.shortcut : null,
      explosions: st.explosions || 0,
      ferry: finale ? finale.state : null,
      ben: S.ben ? { bed: !!st.benNest, glimpse: !!st.benGlimpse } : null,
    },
    ally: game.ally ? { alive: game.ally.alive, kills: st.allyKills, saves: st.allySaves, revives: st.revives } : null,
    ratings,
    settings: diffFromDefaults(S),
    device,
    fps: perf,
  };
}

const RATING_WORDS = Object.fromEntries(RATINGS.map((r) => [r.key, Object.fromEntries(r.options)]));

/** A few lines anyone can read in a chat, then the full JSON on one line. */
export function reportText(r) {
  const lines = [];
  const when = r.when.slice(0, 16).replace('T', ' ');
  lines.push(`We Left Ben playtest · ${LEVEL_NAMES[r.level] || r.level} · seed ${r.seed}${r.daily ? ` (daily ${r.daily})` : ''} · ${when}`);
  const how = r.outcome === 'won' ? (r.level === 'docks' ? 'Made the ferry' : 'Won') : r.outcome === 'died' ? `Died at ${Math.round(r.progress * 100)}%` : 'Quit';
  lines.push(`${how} in ${fmtTime(r.time)} · ${r.kills} kills · ${Math.round(r.accuracy * 100)}% accuracy · ${r.damageTaken} damage taken · ${r.hordes} hordes`);
  const rated = RATINGS.filter((q) => r.ratings[q.key]).map((q) => `${q.label.toLowerCase()} ${RATING_WORDS[q.key][r.ratings[q.key]].toLowerCase()}`);
  lines.push(rated.length ? `Rated: ${rated.join(' · ')}` : 'Not rated');
  const bits = [];
  if (r.finds) bits.push(`supplies ${r.finds.supplies}`, `rooms ${r.finds.rooms}`, ...(r.finds.secret === null ? [] : [r.finds.secret ? 'secret found' : 'secret missed']));
  if (r.events.gateHeld !== null) bits.push(`gate held ${fmtTime(r.events.gateHeld)}`);
  if (r.events.shortcut !== null) bits.push(r.events.shortcut ? 'took the shortcut' : 'long way round');
  if (r.events.explosions) bits.push(`${r.events.explosions} explosion${r.events.explosions > 1 ? 's' : ''}`);
  if (r.events.ferry) bits.push(`ferry: ${r.events.ferry}`);
  if (r.events.ben) bits.push(`Ben's bed ${r.events.ben.bed ? 'found' : 'not found'}${r.events.ben.glimpse ? ', saw the eyes' : ''}`);
  if (r.specials.terrors || r.specials.terrorsFled || r.specials.terrorHits) bits.push(`night terror: ${r.specials.terrors} killed, ${r.specials.terrorsFled} driven off, hit you ${r.specials.terrorHits}×`);
  if (bits.length) lines.push(bits.join(' · '));
  if (r.device) {
    const fps = r.fps ? ` · ${r.fps.avg} fps avg, ${r.fps.low} low` : '';
    lines.push(`Device: ${r.device.os || ''} ${r.device.w}×${r.device.h} @${r.device.dpr}x ${r.device.touch ? 'touch' : 'mouse'}${fps}`.replace('  ', ' '));
  }
  const changed = Object.keys(r.settings);
  lines.push(changed.length ? `Changed settings: ${changed.join(', ')}` : 'Default settings');
  lines.push(JSON.stringify(r));
  return lines.join('\n');
}

/** Every saved run: the readable lines of each, then all of them as one JSON array. */
export function historyText(list) {
  const out = [`We Left Ben playtest reports · ${list.length} run${list.length === 1 ? '' : 's'}`];
  for (const r of list) out.push('', reportText(r).split('\n').slice(0, -1).join('\n'));
  out.push('', JSON.stringify(list));
  return out.join('\n');
}

/** Short OS name for reports (no full user-agent string). */
export function osName(nav = navigator) {
  const ua = nav.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'macOS';
  if (/Win/.test(ua)) return 'Windows';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'other';
}

export function loadHistory() {
  const h = readJSON(HISTORY_KEY, []);
  return Array.isArray(h) ? h : [];
}

/** Save (or update, by id) a report; keeps the newest MAX_HISTORY. */
export function saveReport(r) {
  const h = loadHistory().filter((q) => q.id !== r.id);
  h.push(r);
  while (h.length > MAX_HISTORY) h.shift();
  writeJSON(HISTORY_KEY, h);
  return h.length;
}

export function clearHistory() {
  writeJSON(HISTORY_KEY, []);
}

/** fps summary from frame times (s): average and the 5th-percentile ("low"). */
export function perfSummary(frames) {
  if (!frames || frames.length < 30) return null;
  const sorted = frames.slice().sort((a, b) => a - b);
  const avg = frames.reduce((s, x) => s + x, 0) / frames.length;
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return { avg: Math.round(1 / avg), low: Math.round(1 / p95), frames: frames.length };
}

/** Copy text: clipboard API, else the old execCommand route. Resolves true on success. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

// --- The card over the end screen ----------------------------------------------------------------

export class ReportCard {
  /** actions: { onPlayAgain(report) } */
  constructor(actions) {
    this.actions = actions;
    this.report = null;
    this.isOpen = false;
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    this.root = el('div', 'report hidden');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Rate this run');
    const card = el('div', 'report-card');
    const head = el('div', 'report-head');
    head.append(el('b', null, 'How was that run?'));
    this.tag = el('span', 'report-tag', '');
    head.append(this.tag);
    card.append(head);
    this.chips = {};
    for (const q of RATINGS) {
      const row = el('div', 'report-row');
      row.append(el('span', 'report-q', q.label));
      const opts = el('div', 'report-opts');
      this.chips[q.key] = [];
      for (const [v, label] of q.options) {
        const b = el('button', 'btn chip', label);
        b.type = 'button';
        b.dataset.rate = q.key;
        b.dataset.value = v;
        b.addEventListener('click', () => this.rate(q.key, v));
        opts.append(b);
        this.chips[q.key].push(b);
      }
      row.append(opts);
      card.append(row);
    }
    const acts = el('div', 'report-actions');
    this.copyBtn = el('button', 'btn', 'Copy report');
    this.copyBtn.type = 'button';
    this.copyBtn.addEventListener('click', () => this.copy());
    this.shareBtn = el('button', 'btn', 'Share');
    this.shareBtn.type = 'button';
    this.shareBtn.addEventListener('click', () => this.share());
    this.againBtn = el('button', 'btn primary', 'Play again');
    this.againBtn.type = 'button';
    this.againBtn.addEventListener('click', () => this.actions.onPlayAgain(this.report));
    acts.append(this.copyBtn, this.shareBtn, this.againBtn);
    card.append(acts);
    this.note = el('div', 'report-note', 'Saved on this device. Copy them all from the tuning panel (Playtest).');
    card.append(this.note);
    this.root.append(card);
    // Taps on the card never reach the game underneath.
    for (const ev of ['touchstart', 'mousedown', 'pointerdown']) this.root.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    document.body.append(this.root);
  }

  show(report, tag = '') {
    this.report = report;
    this.tag.textContent = tag;
    for (const q of RATINGS) for (const b of this.chips[q.key]) b.classList.toggle('picked', report.ratings[q.key] === b.dataset.value);
    this.shareBtn.style.display = navigator.share ? '' : 'none';
    this.copyBtn.textContent = 'Copy report';
    this.root.classList.remove('hidden');
    this.isOpen = true;
  }

  hide() {
    this.root.classList.add('hidden');
    this.isOpen = false;
  }

  /** A tap beside the card: make Play again pulse so it's obvious where to tap. */
  nudge() {
    if (!this.isOpen) return;
    this.againBtn.classList.remove('nudge');
    void this.againBtn.offsetWidth; // restart the animation
    this.againBtn.classList.add('nudge');
  }

  /** Where the card sits (CSS px), so the end-screen summary can make room for it. */
  rect() {
    const r = this.root.firstChild.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }

  rate(key, value) {
    if (!this.report) return;
    this.report.ratings[key] = this.report.ratings[key] === value ? undefined : value;
    if (this.report.ratings[key] === undefined) delete this.report.ratings[key];
    for (const b of this.chips[key]) b.classList.toggle('picked', this.report.ratings[key] === b.dataset.value);
    saveReport(this.report);
  }

  async copy() {
    if (!this.report) return;
    saveReport(this.report);
    const ok = await copyText(reportText(this.report));
    this.copyBtn.textContent = ok ? 'Copied ✓' : 'Copy failed';
  }

  async share() {
    if (!this.report || !navigator.share) return;
    saveReport(this.report);
    try {
      await navigator.share({ title: 'We Left Ben playtest', text: reportText(this.report) });
    } catch {
      // cancelled
    }
  }
}
