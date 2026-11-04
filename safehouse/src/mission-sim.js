// Simulated mission: stands in for the co-op game. Pure and seeded.
//
// A mission is three stretches split by safe rooms. Each stretch is a roll of
// squad strength against danger. The Scrap found in a stretch is banked at
// its safe room, so a wipe keeps everything banked before it. The squad
// throws its best throwable on the hardest stretch and uses its best heal
// only when a stretch goes wrong; whatever isn't used stays in the crate.

import { CHANCE, SAVE_MAX, ITEMS, STRETCHES, SURVIVORS } from './config.js';
import { FEED, BANTER } from './story.js';
import { clamp, mulberry32, pick } from './util.js';

export function stretchChance(strength, danger) {
  return clamp(CHANCE.even + (strength / danger - 1), CHANCE.min, CHANCE.max);
}

export function chanceLabel(p) {
  if (p >= 0.85) return { text: 'Good', tone: 'good' };
  if (p >= 0.65) return { text: 'Fair', tone: 'ok' };
  if (p >= 0.4) return { text: 'Risky', tone: 'warn' };
  return { text: 'Deadly', tone: 'bad' };
}

/**
 * @param {object} o
 * @param {object} o.loadout  Safehouse#loadout(): { mission, strength, throwable, heal, squad, perks }
 * @param {number} o.seed
 * @param {'auto'|'win'|'wipe'} [o.outcome]  'wipe' fails a random stretch, ignoring heals
 * @param {boolean} [o.forceWin]  the very first mission always clears
 * @param {boolean} [o.quiet]     skip the feed text (odds estimates)
 */
export function simulateMission({ loadout, seed, outcome = 'auto', forceWin = false, quiet = false }) {
  const rng = mulberry32(seed >>> 0); // outcomes
  const fl = mulberry32((seed ^ 0x9e3779b9) >>> 0); // flavour only
  const L = loadout;
  const M = L.mission;
  const shape = M.finale ? STRETCHES.finale : STRETCHES.normal;
  let hardest = 0;
  shape.forEach((s, i) => {
    if (s.danger > shape[hardest].danger) hardest = i;
  });
  const wipeAt = outcome === 'wipe' ? Math.floor(rng() * shape.length) : -1;
  let heal = L.heal;
  const used = {};
  const stretches = [];
  let scrap = 0;
  let rooms = 0;

  for (let i = 0; i < shape.length; i++) {
    const st = shape[i];
    const events = [];
    const say = (text, tone = 'ok', extra = {}) => {
      if (!quiet) events.push({ text, tone, ...extra });
    };
    let danger = M.danger * st.danger;
    say(pick(fl, FEED[st.kind]), st.kind === 'horde' || st.kind === 'finale' ? 'warn' : 'ok');
    if (i === hardest && L.throwable) {
      const it = ITEMS[L.throwable];
      const cut = Math.min(0.6, it.effect * (1 + L.perks.chemist));
      danger *= 1 - cut;
      used[L.throwable] = 1;
      say(`${it.name}! ${Math.round(cut * 100)}% fewer of them`, 'good', { item: L.throwable });
    }
    const chance = stretchChance(L.strength, danger);
    let pass;
    if (outcome === 'win' || forceWin) pass = true;
    else if (i === wipeAt) pass = false;
    else {
      pass = rng() < chance;
      if (!pass && heal) {
        const it = ITEMS[heal];
        const save = it.effect >= 1 ? 1 : Math.min(SAVE_MAX, it.effect + L.perks.medic);
        used[heal] = 1;
        pass = rng() < save;
        say(`Someone went down. ${it.name}${pass ? ': back up!' : ': not enough…'}`, pass ? 'good' : 'bad', { item: heal });
        heal = null;
      }
    }
    if (!pass) {
      say(pick(fl, FEED.fail), 'bad');
      stretches.push({ kind: st.kind, name: st.name, danger: Math.round(danger), chance, cleared: false, scrap: 0, events });
      break;
    }
    const got = Math.round(M.scrap * st.share * (0.9 + 0.2 * rng()));
    scrap += got;
    rooms++;
    if (!quiet && L.squad.length && fl() < 0.4) {
      const who = pick(fl, L.squad);
      say(`${SURVIVORS[who].name}: "${pick(fl, BANTER[who])}"`, 'say', { who });
    }
    stretches.push({ kind: st.kind, name: st.name, danger: Math.round(danger), chance, cleared: true, scrap: got, events });
  }

  const won = rooms === shape.length;
  const full = 300 + 10 * M.index + Math.round(60 * rng());
  return {
    missionId: M.id,
    won,
    rooms,
    total: shape.length,
    stretches,
    scrap,
    used,
    seconds: won ? full : Math.round((full * (rooms + 0.5)) / shape.length),
  };
}

/** Clear chance by simulating many times (deterministic). */
export function estimateOdds(loadout, { runs = 200, seed = 4242 } = {}) {
  let wins = 0;
  for (let r = 0; r < runs; r++) if (simulateMission({ loadout, seed: seed + r * 7919, quiet: true }).won) wins++;
  return wins / runs;
}
