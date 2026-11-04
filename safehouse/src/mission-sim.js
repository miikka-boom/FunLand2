// Simulated co-op mission: stands in for the action game until the two are
// connected. It takes the MissionLoadout the Safehouse would hand the game
// (Safehouse#missionLoadout) and returns a MissionReport in the shape the
// game should send back (docs/SAFEHOUSE.md). Pure and seeded.
//
// A mission is a few stretches split by safe rooms. Each stretch is a roll of
// squad power against threat. Loot is banked at every safe room, so a wipe
// loses only the stretch it happened in. Items are used where they matter:
// throwables on the horde, boosts on the hardest stretch, heals only when a
// stretch goes wrong. Whatever is not used goes back to the crate.

import { CHANCE, SAVE_MAX, ITEMS, FREE_HEAL, SURVIVORS } from './config.js';
import { FEED, BANTER } from './story.js';
import { clamp, mulberry32, pick } from './util.js';

/** Chance to clear one stretch. */
export function stretchChance(power, threat, c = CHANCE) {
  return clamp(c.even + c.slope * (power / threat - 1), c.min, c.max);
}

/** Label for a whole-mission clear chance (the prep screen). */
export function riskLabel(p) {
  if (p >= 0.85) return { text: 'Safe', tone: 'good' };
  if (p >= 0.65) return { text: 'Fair', tone: 'ok' };
  if (p >= 0.4) return { text: 'Risky', tone: 'warn' };
  return { text: 'Deadly', tone: 'bad' };
}

const add = (map, k, n = 1) => {
  map[k] = (map[k] || 0) + n;
};
const pctText = (v) => `${Math.round(v * 100)}%`;
const whose = (m) => (m.kind === 'you' ? 'Your' : `${m.name}'s`);
const KILLS = { run: 14, horde: 26, finale: 34 };

/**
 * @param {object} o
 * @param {object} o.loadout   Safehouse#missionLoadout(id)
 * @param {'auto'|'win'|'wipe'} [o.outcome]  'wipe' fails a random stretch, ignoring heals
 * @param {number} [o.seed]
 * @param {boolean} [o.forceWin]  'auto' always clears (the very first mission)
 * @param {number} [o.lootMult]   tuning multiplier
 * @param {boolean} [o.quiet]     skip the feed text (odds estimates)
 */
export function simulateMission({ loadout, outcome = 'auto', seed, forceWin = false, lootMult = 1, quiet = false }) {
  const base = seed === undefined ? (Math.random() * 4294967296) >>> 0 : seed >>> 0;
  const rng = mulberry32(base); // outcomes
  const fl = mulberry32(base ^ 0x9e3779b9); // flavour text: never changes outcomes
  const L = loadout;
  const M = L.mission;
  const P = L.perks;
  const n = M.sections.length;
  const humans = L.members.filter((m) => m.items);
  const survivors = L.members.filter((m) => m.kind === 'survivor');
  const say = (ev, text, tone = 'ok', extra = {}) => {
    if (!quiet) ev.push({ text, tone, ...extra });
  };

  // Throwables go to the horde (or finale) stretch; boosts to the hardest
  // stretches, one stretch each while there are stretches left.
  const hordeAt = M.sections.findIndex((s) => s.kind !== 'run');
  const hardest = M.sections.map((_, i) => i).sort((a, b) => M.sections[b].threat - M.sections[a].threat || b - a);
  const boostAt = new Map();
  let k = 0;
  for (const h of humans) {
    if (!h.items.boost) continue;
    const i = hardest[k % n];
    k++;
    if (!boostAt.has(i)) boostAt.set(i, []);
    boostAt.get(i).push(h);
  }
  const heals = humans.map((h) => ({ member: h, id: h.items.heal || FREE_HEAL, used: false }));

  const itemsUsed = {}; // your own crafted items, taken out of the crate
  let thrown = 0;
  let healed = 0;
  let triage = P.triage > 0;
  const wipeAt = outcome === 'wipe' ? Math.floor(rng() * n) : -1;
  const banked = { scrap: 0, parts: 0, supplies: 0, fuel: 0 };
  let fuelAcc = 0;
  let fuelPaid = 0;
  let cleared = 0;
  let kills = 0;
  let fuelCans = 0;
  const sections = [];

  for (let i = 0; i < n; i++) {
    const sec = M.sections[i];
    const ev = [];
    let threat = sec.threat;
    let power = L.power;
    say(ev, pick(fl, i === 0 ? FEED.start : FEED.run), 'ok');

    if (i === hordeAt) {
      say(ev, pick(fl, FEED[sec.kind]), 'warn');
      for (const h of humans) {
        const id = h.items.throwable;
        if (!id) continue;
        const cut = Math.min(0.6, ITEMS[id].effect.threat * (1 + P.chemist));
        threat *= 1 - cut;
        const kept = h.own && P.improvised > 0 && rng() < P.improvised;
        if (h.own) {
          thrown++;
          if (!kept) add(itemsUsed, id);
        }
        say(ev, `${whose(h)} ${ITEMS[id].name.toLowerCase()}: -${pctText(cut)} threat${kept ? ' (Theo rigged a spare)' : ''}`, 'good', { item: id });
      }
      if (P.chemist > 0 && humans.some((h) => h.items.throwable)) say(ev, `Theo's mix: throwables +${pctText(P.chemist)}`, 'good', { who: 'theo' });
      if (P.overwatch > 0) say(ev, `Grace on overwatch: +${pctText(P.overwatch)} power`, 'good', { who: 'grace' });
    }
    if (sec.kind !== 'run' && P.overwatch > 0) power *= 1 + P.overwatch;
    if (P.steady > 0) power *= 1 + P.steady;
    for (const h of boostAt.get(i) || []) {
      const id = h.items.boost;
      power *= 1 + ITEMS[id].effect.power;
      if (h.own) add(itemsUsed, id);
      say(ev, `${whose(h)} ${ITEMS[id].name.toLowerCase()}: +${pctText(ITEMS[id].effect.power)} power`, 'good', { item: id });
    }

    const p = stretchChance(power, threat);
    let pass;
    if (outcome === 'win' || forceWin) pass = true;
    else if (i === wipeAt) pass = false;
    else {
      pass = rng() < p;
      if (!pass) {
        say(ev, 'Someone went down!', 'bad');
        for (const h of heals) {
          const it = ITEMS[h.id];
          if (h.used || !it.effect.save) continue;
          h.used = true;
          if (h.member.own) {
            healed++;
            if (!it.free) add(itemsUsed, h.id);
          }
          const save = Math.min(SAVE_MAX, it.effect.save * (1 + P.medic));
          pass = rng() < save;
          say(ev, `${whose(h.member)} ${it.name.toLowerCase()} (${pctText(save)} save)${pass ? '' : ': not enough'}`, pass ? 'good' : 'warn', { item: h.id });
          if (P.medic > 0) say(ev, `Nadia's Field Medic: heals +${pctText(P.medic)}`, 'good', { who: 'nadia' });
          if (pass) break;
        }
        if (!pass && triage) {
          triage = false;
          pass = rng() < P.triage;
          say(ev, `Nadia's triage${pass ? ' kept everyone up' : ' was not enough'}`, pass ? 'good' : 'warn', { who: 'nadia' });
        }
        if (!pass) {
          const d = heals.find((h) => !h.used && ITEMS[h.id].effect.revive);
          if (d) {
            d.used = true;
            if (d.member.own) {
              healed++;
              add(itemsUsed, d.id);
            }
            pass = true;
            say(ev, `${whose(d.member)} defibrillator: back on their feet!`, 'good', { item: d.id });
          }
        }
        if (pass) say(ev, pick(fl, FEED.saved), 'ok');
      }
    }

    const killMult = 1 + 0.08 * (M.chapter - 1);
    kills += Math.round(KILLS[sec.kind] * killMult * (0.8 + 0.4 * rng()) * (pass ? 1 : 0.5));

    if (!pass) {
      say(ev, pick(fl, FEED.fail), 'bad');
      sections.push({ index: i, kind: sec.kind, threat: Math.round(threat), power: Math.round(power), chance: p, cleared: false, loot: null, events: ev });
      break;
    }

    // Reached the safe room: this stretch's pickups are banked for good.
    const loot = {
      scrap: Math.round(sec.loot.scrap * lootMult * (0.9 + 0.2 * rng()) * (1 + P.scavenger)),
      parts: Math.round(sec.loot.parts * lootMult * (0.9 + 0.2 * rng()) * (1 + P.backroads)),
      supplies: Math.round(sec.loot.supplies * lootMult * (0.9 + 0.2 * rng()) * (1 + P.scavenger)),
      fuel: 0,
    };
    fuelAcc += sec.loot.fuel * lootMult;
    loot.fuel = Math.round(fuelAcc) - fuelPaid;
    fuelPaid += loot.fuel;
    if (M.fuelCans && M.fuelCans.section === i && (P.shortcut || rng() < p)) {
      const cans = Math.round(M.fuelCans.amount * lootMult);
      loot.fuel += cans;
      fuelCans++;
      say(ev, `Grabbed the fuel cans: +${cans} Fuel`, 'good', P.shortcut ? { who: 'mei' } : {});
    }
    if (i === 0 && P.siphon > 0) {
      loot.fuel += P.siphon;
      say(ev, `Lukas siphoned a tank: +${P.siphon} Fuel`, 'good', { who: 'lukas' });
    }
    for (const r of Object.keys(banked)) banked[r] += loot[r];
    cleared++;

    // Survivors chat more as bonds grow.
    if (!quiet && survivors.length) {
      const s = pick(fl, survivors);
      if (fl() < 0.25 + 0.12 * (s.bond || 0)) ev.push({ text: `${SURVIVORS[s.id].short}: "${pick(fl, BANTER[s.id])}"`, tone: 'say', who: s.id });
    }
    sections.push({ index: i, kind: sec.kind, threat: Math.round(threat), power: Math.round(power), chance: p, cleared: true, loot, events: ev });
  }

  const won = cleared === n;
  let firstClear = null;
  if (won && L.firstClear && M.firstClear) {
    firstClear = { ...M.firstClear };
    for (const [r, v] of Object.entries(firstClear)) banked[r] += v;
  }
  let reward = null;
  if (won && M.reward) {
    reward = { ...M.reward };
    for (const [r, v] of Object.entries(reward)) banked[r] += v;
  }
  const timeS = Math.round(M.seconds * (won ? 0.9 + 0.2 * rng() : (cleared + 0.5) / n));

  return {
    missionId: M.id,
    kind: M.kind,
    who: M.who || null,
    chapter: M.chapter,
    won,
    sectionsCleared: cleared,
    sectionsTotal: n,
    sections,
    banked,
    firstClear,
    reward,
    itemsUsed,
    thrown,
    healed,
    fuelCans,
    kills,
    timeS,
    power: L.power,
    squad: { survivors: survivors.map((s) => s.id), friend: L.friend || null },
    rested: L.shared.rested,
  };
}

/** Clear chance and average safe rooms reached, by simulating many times (deterministic). */
export function estimateOdds(loadout, { runs = 300, seed = 4242, outcome = 'auto' } = {}) {
  let wins = 0;
  let rooms = 0;
  for (let r = 0; r < runs; r++) {
    const rep = simulateMission({ loadout, seed: seed + r * 7919, outcome, quiet: true });
    if (rep.won) wins++;
    rooms += rep.sectionsCleared;
  }
  return { clear: wins / runs, safeRooms: rooms / runs };
}
