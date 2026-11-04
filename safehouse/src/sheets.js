// HTML for every layer: station sheets (Upgrade, Craft, Collect plus the
// station's own panel), the builds list, the Loadout Crate, mission prep,
// results, scenes, the stage card and the welcome-back summary. Pure string
// builders: main.js wires the [data-act] buttons to the Safehouse.

import {
  RESOURCES,
  RES_INFO,
  STATIONS,
  RECIPES,
  ITEMS,
  SLOTS,
  SLOT_INFO,
  CRATE_MAX,
  FREE_HEAL,
  WEAPONS,
  WEAPON_TIERS,
  ATTACHMENTS,
  SURVIVORS,
  SURVIVOR_ORDER,
  BOND,
  FRIENDS,
  CHAPTERS,
  SECTION_KINDS,
  STAGES,
  ORDERS,
} from './config.js';
import { BIOS, SCENES, BOND_CHAPTERS, CALL_TEXT, CHAPTER_TEXT, MOVE_IN } from './story.js';
import { riskLabel } from './mission-sim.js';
import { icon } from './icons.js';
import { portrait } from './portraits.js';
import { fmtNum, fmtTime, fmtDuration, pct } from './format.js';
import { esc, liveBar, staticBar } from './ui.js';

// --- Small pieces ------------------------------------------------------------------------------------

const PORTRAIT_OF = { you: 'you', bot: 'bot', rookie: 'friend_rookie', veteran: 'friend_veteran' };
const face = (id, cls = '') => `<span class="face ${cls}">${portrait(PORTRAIT_OF[id] || id)}</span>`;

function costHtml(sh, cost, { free = 'Free' } = {}) {
  const parts = Object.entries(cost || {}).filter(([, v]) => v > 0);
  if (!parts.length) return `<span class="cost free">${free}</span>`;
  const missing = sh.missingFor(cost);
  return `<span class="cost">${parts.map(([r, v]) => `<span class="c${missing[r] ? ' short' : ''}">${icon(r)}${fmtNum(v)}</span>`).join('')}</span>`;
}

function lootHtml(loot, { plus = true, cls = '' } = {}) {
  const parts = RESOURCES.filter((r) => (loot[r] || 0) > 0);
  if (!parts.length) return `<span class="loot ${cls}"><em>nothing</em></span>`;
  return `<span class="loot ${cls}">${parts.map((r) => `<span class="l" data-res="${r}">${icon(r)}<b>${plus ? '+' : ''}${fmtNum(loot[r])}</b></span>`).join('')}</span>`;
}

function btn(label, act, data = {}, { disabled = false, why = '', cls = '', sub = '' } = {}) {
  const attrs = Object.entries(data)
    .map(([k, v]) => ` data-${k}="${esc(v)}"`)
    .join('');
  return `<button class="btn ${cls}${disabled ? ' disabled' : ''}" type="button" data-act="${act}"${attrs}${why ? ` data-why="${esc(why)}"` : ''}><span class="lbl">${label}</span>${sub ? `<small>${sub}</small>` : ''}</button>`;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Plain-language reason a thing can't start. */
export function blockerText(b) {
  switch (b.type) {
    case 'busy':
      return 'Already being built';
    case 'unlock':
    case 'barricade':
      return `Needs Barricade Lv ${b.need}`;
    case 'chapters':
      return `Clear ${plural(b.need, 'chapter')} first (${b.have} so far)`;
    case 'slots':
      return `All ${plural(b.slots, 'build slot')} busy`;
    case 'resources':
      return `Need ${Object.entries(b.missing)
        .map(([r, v]) => `${fmtNum(v)} more ${RES_INFO[r].name}`)
        .join(', ')}`;
    case 'station':
      return 'Build the station first';
    case 'locked':
      return b.need ? `Needs station Lv ${b.need}` : 'Not unlocked yet';
    case 'queue':
      return `Queue full: ${plural(b.cap, 'waiting job')} at this level`;
    case 'crate':
      return `The crate holds ${CRATE_MAX} of each item`;
    case 'armory':
      return `Needs Armory Lv ${b.need}`;
    default:
      return b.type;
  }
}

function sec(title, body, cls = '') {
  return `<section class="sec ${cls}">${title ? `<h3>${title}</h3>` : ''}${body}</section>`;
}

// --- Station sheets ---------------------------------------------------------------------------------

/** What changes at the next level: [label, now, next] rows. */
function effectRows(sh, id, from, to) {
  const a = sh.row(id, from);
  const b = sh.row(id, to);
  const rows = [];
  const add = (label, x, y, fmt = (v) => v) => {
    if (x !== y) rows.push([label, fmt(x), fmt(y)]);
  };
  switch (id) {
    case 'barricade': {
      add('Parts cap', a.partsCap, b.partsCap);
      add('Supplies cap', a.suppliesCap, b.suppliesCap);
      add('Build slots', a.buildSlots, b.buildSlots);
      rows.push(['Stations up to', `Lv ${from + 1}`, `Lv ${to + 1}`]);
      const opens = Object.values(STATIONS).filter((s) => s.unlock === to && s.station !== 'barricade');
      if (opens.length) rows.push(['Unlocks', '', opens.map((s) => s.name).join(', ')]);
      break;
    }
    case 'generator':
      add('Power capacity', a.powerCap, b.powerCap);
      add('Fuel tank', a.fuelTank, b.fuelTank);
      break;
    case 'barracks':
      add('Bunks', a.bunks, b.bunks);
      add('Well Rested', a.rested, b.rested, (v) => `+${v}% bond XP`);
      if (b.bondChapters && !a.bondChapters) rows.push(['New', '', 'Bond chapters']);
      if (b.perkSlot && !a.perkSlot) rows.push(['New', '', 'A veteran perk for every survivor']);
      break;
    case 'workshop':
    case 'infirmary': {
      if (id === 'infirmary') add('Starting temp health', a.tempHp || 0, b.tempHp || 0, (v) => `+${v}`);
      add('Queue', from, to, (v) => plural(v, 'waiting job'));
      const recipes = STATIONS[id].jobs.filter((j) => j.unlockLevel === to);
      for (const r of recipes) rows.push(['New recipe', '', ITEMS[r.output.item].name]);
      if (b.attachment) rows.push(['Attachment', '', ATTACHMENTS[b.attachment].name]);
      break;
    }
    case 'armory':
      if (b.weapon) rows.push(['New gun', '', WEAPONS[b.weapon].name]);
      add('Weapon upgrades up to', a.maxTier, b.maxTier, (v) => WEAPON_TIERS[v - 1].name);
      add('Loadout presets', a.presets, b.presets);
      break;
    case 'radio':
      add('Chapters open', a.chapters, b.chapters, (v) => `1-${v}`);
      add('Daily order rewards', a.orderScale, b.orderScale, (v) => (v ? `×${v}` : 'none'));
      if (from === 0) rows.push(['New', '', 'Daily orders, rescue calls']);
      break;
    case 'scrapyard':
      add('Scrap per hour', a.scrapPerHour, b.scrapPerHour);
      add('Holds', a.scrapPerHour * STATIONS.scrapyard.storeHours, b.scrapPerHour * STATIONS.scrapyard.storeHours, (v) => `${v} (8 h)`);
      break;
    default:
      break;
  }
  return rows;
}

function upgradeSection(sh, id) {
  const st = sh.s.stations[id];
  const lvl = st.level;
  if (st.build) {
    const b = st.build;
    return sec(
      `${icon('hammer')} ${lvl === 0 ? 'Building' : `Upgrading to Lv ${b.to}`}`,
      `<div class="progress">${liveBar(b.start, b.end, 'big')}<span class="t">${icon('clock')}<b data-end="${b.end}"></b> left</span></div>` +
        `<p class="note">Timers keep running while the app is closed.</p>` +
        btn(`${icon('cancel')}Cancel and refund`, 'cancelBuild', { id }, { cls: 'ghost small' }),
      'up building',
    );
  }
  const info = sh.upgradeInfo(id);
  if (info.maxed) return sec(`${icon('star')} Max level`, '<p class="note">This station is fully upgraded.</p>', 'up');
  const rows = effectRows(sh, id, lvl, info.next)
    .map(([l, x, y]) => `<div class="eff"><span>${esc(l)}</span>${x !== '' ? `<s>${esc(x)}</s>` : ''}<b>${esc(y)}</b></div>`)
    .join('');
  const gates = [];
  const needB = sh.barricadeFor(id, info.next);
  if (id !== 'barricade') gates.push([`Barricade Lv ${needB}`, sh.barricade >= needB]);
  if (info.row.chaptersCleared > 0) gates.push([`${plural(info.row.chaptersCleared, 'chapter')} cleared`, sh.chaptersCleared() >= info.row.chaptersCleared]);
  if (info.time > 0) gates.push([`Free build slot`, sh.freeSlots() > 0]);
  const gateHtml = gates.map(([t, ok]) => `<span class="gate ${ok ? 'ok' : 'no'}">${icon(ok ? 'check' : 'lock')}${esc(t)}</span>`).join('');
  const label = lvl === 0 ? 'Build' : `Upgrade to Lv ${info.next}`;
  const why = info.blockers.length ? blockerText(info.blockers[0]) : '';
  return sec(
    `${icon('up')} ${lvl === 0 ? 'Build' : `Next: Lv ${info.next}`}`,
    `<div class="effs">${rows || '<div class="eff"><span>Level</span><b>+1</b></div>'}</div>` +
      `<div class="gates">${gateHtml}</div>` +
      `<div class="buyrow">${costHtml(sh, info.cost)}<span class="time">${icon('clock')}${fmtDuration(info.time)}</span></div>` +
      btn(label, 'upgrade', { id }, { disabled: !info.canStart, why, cls: 'primary wide', sub: info.canStart ? (info.time > 0 ? 'No power or Fuel needed' : 'Instant') : esc(why) }),
    'up',
  );
}

function jobRow(sh, j) {
  const r = RECIPES[j.recipe];
  const item = r.output.item;
  const s = sh.jobStatus(j);
  let mid;
  if (s.state === 'running') mid = `${liveBar(j.start, j.end)}<span class="t"><b data-end="${j.end}"></b></span>`;
  else if (s.state === 'power') mid = `<span class="why warn">${icon('power')}Waiting for ${s.need} power (${s.free} free)</span>`;
  else if (s.state === 'fuel') mid = `<span class="why bad">${icon('fuel')}Needs ${s.need} Fuel to start</span>`;
  else mid = `<span class="why">Next in line</span>`;
  const name = item ? ITEMS[item].name : 'Production run';
  return (
    `<div class="job ${s.state}"><span class="ji">${icon(item || 'scrap')}</span><span class="jn">${esc(name)}</span>${mid}` +
    `<button class="x" type="button" data-act="cancelJob" data-uid="${j.uid}" aria-label="Cancel">${icon('cancel')}</button></div>`
  );
}

function craftSection(sh, id) {
  const lvl = sh.level(id);
  if (!lvl) return '';
  const jobs = sh.jobsAt(id);
  const waiting = jobs.filter((j) => j.state === 'waiting').length;
  const draw = sh.drawOf(id);
  const q = jobs.length ? `<div class="queue">${jobs.map((j) => jobRow(sh, j)).join('')}</div>` : `<p class="note">Nothing in the queue. Crafts finish during your next mission.</p>`;
  const rec = STATIONS[id].jobs
    .map((j) => {
      const info = sh.recipeInfo(j.id);
      const it = ITEMS[info.item];
      const locked = !info.unlocked;
      const why = info.blockers.length ? blockerText(info.blockers[0]) : '';
      return (
        `<div class="recipe${locked ? ' locked' : ''}">` +
        `<span class="ri">${icon(info.item)}</span>` +
        `<span class="rt"><b>${esc(it.name)}</b><span class="slot s-${it.slot}">${esc(SLOT_INFO[it.slot].name)}</span><small>${esc(it.text)}</small>` +
        `<span class="meta">${costHtml(sh, j.cost)}<span class="m">${icon('clock')}${fmtDuration(info.time)}</span><span class="m${sh.s.res.fuel < j.fuel ? ' short' : ''}">${icon('fuel')}${j.fuel}</span></span></span>` +
        `<span class="rc"><span class="have">${info.have}${info.pending ? `<em>+${info.pending}</em>` : ''}<small>/${CRATE_MAX}</small></span>` +
        (locked
          ? `<span class="lockt">${icon('lock')}Lv ${j.unlockLevel}</span>`
          : btn('Craft', 'craft', { recipe: j.id }, { disabled: !info.canQueue, why, cls: 'small primary' })) +
        `</span></div>`
      );
    })
    .join('');
  return sec(
    `${icon('crate')} Craft <small>queue ${waiting}/${lvl} · draws ${icon('power')}${draw} while running</small>`,
    q + `<div class="recipes">${rec}</div>`,
    'craft',
  );
}

function yardSection(sh) {
  const y = sh.yardInfo();
  if (!y.level) return '';
  const pile = Math.floor(y.pile);
  let state;
  if (y.state === 'running') state = `Running · full in <b data-end="${y.run.end}"></b>`;
  else if (y.state === 'full') state = 'Full: stopped until collected';
  else if (y.state === 'waiting') state = y.status.state === 'fuel' ? 'Waiting for 1 Fuel to start' : `Waiting for power (${sh.powerFree()} free)`;
  else state = 'Stopped';
  const actions = [];
  if (pile >= 1) actions.push(btn(`${icon('scrap')}Collect +${fmtNum(pile)}`, 'collectYard', {}, { cls: 'primary', sub: y.state === 'full' && y.auto ? 'and start the next run (1 Fuel)' : '' }));
  if (y.run) actions.push(btn('Stop', 'stopYard', {}, { cls: 'ghost', sub: 'frees 1 power' }));
  else if (y.state !== 'full') actions.push(btn('Start', 'startYard', {}, { cls: pile >= 1 ? 'ghost' : 'primary', sub: `1 Fuel · draws ${icon('power')}1` }));
  return sec(
    `${icon('scrap')} Scrap pile`,
    `<div class="yard"><div class="big">${fmtNum(pile)}<small> / ${fmtNum(y.store)}</small></div><div class="yt">${icon('clock')}${y.rate} Scrap/h · ${state}</div>${staticBar(y.frac, 'big')}</div>` +
      `<div class="btnrow">${actions.join('')}</div>` +
      `<p class="note">A run burns 1 Fuel and draws 1 power until the pile holds 8 hours of Scrap. Collecting a full yard starts the next run. Stop it to free power for crafts.</p>`,
    'yardsec',
  );
}

function generatorSection(sh) {
  const cap = sh.powerCap();
  const used = sh.powerUsed();
  const running = sh.s.jobs.filter((j) => j.state === 'running');
  const segs = Array.from({ length: Math.max(1, cap) }, (_, i) => `<i class="${i < used ? 'on' : ''}"></i>`).join('');
  const list = running.length
    ? running
        .map((j) => {
          const item = RECIPES[j.recipe].output.item;
          return `<div class="drawrow">${icon(STATIONS[j.station].station)}<span>${esc(STATIONS[j.station].name)}: ${esc(item ? ITEMS[item].name : 'Scrap run')}</span><b>${icon('power')}${sh.drawOf(j.station)}</b></div>`;
        })
        .join('')
    : `<p class="note">Nothing is drawing power right now.</p>`;
  const tank = sh.cap('fuel');
  return sec(
    `${icon('power')} Power <small>${used}/${cap} in use</small>`,
    `<div class="segs big">${segs}</div>${list}` +
      `<div class="fuel">${icon('fuel')}<span>Fuel ${Math.floor(sh.s.res.fuel)}/${tank}</span>${staticBar(sh.s.res.fuel / Math.max(1, tank))}</div>` +
      `<p class="note">Every running job draws power; a job can't start if it would go over capacity. Starting one burns the Fuel in its recipe. Nothing drains while you're away, and builds need neither.</p>`,
  );
}

function barricadeSection(sh) {
  const rows = ['workshop', 'infirmary', 'armory', 'radio', 'scrapyard']
    .map((id) => {
      const ok = sh.barricade >= STATIONS[id].unlock;
      return `<span class="gate ${ok ? 'ok' : 'no'}">${icon(ok ? 'check' : 'lock')}${esc(STATIONS[id].name)} · Lv ${STATIONS[id].unlock}</span>`;
    })
    .join('');
  return sec(
    `${icon('shield')} Holds`,
    `<div class="effs">` +
      `<div class="eff"><span>Parts</span><b>${fmtNum(sh.s.res.parts)} / ${sh.cap('parts')}</b></div>` +
      `<div class="eff"><span>Supplies</span><b>${fmtNum(sh.s.res.supplies)} / ${sh.cap('supplies')}</b></div>` +
      `<div class="eff"><span>Scrap</span><b>no cap</b></div>` +
      `<div class="eff"><span>Build slots</span><b>${sh.builds().length} / ${sh.buildSlots()} busy</b></div>` +
      `<div class="eff"><span>Other stations up to</span><b>Lv ${sh.barricade + 1}</b></div></div>` +
      `<div class="gates">${rows}</div>` +
      `<p class="note">Payouts over a cap turn into Scrap at half value, so nothing is wasted.</p>`,
  );
}

function survivorCard(sh, id) {
  const def = SURVIVORS[id];
  const st = sh.survivorState(id);
  if (st === 'unknown') {
    const hint = def.arrives.chapter ? `Somewhere in Chapter ${def.arrives.chapter}…` : 'A voice on the radio, someday…';
    return `<div class="scard unknown">${face('bot', 'big dim')}<div class="sc"><b>???</b><small>${esc(hint)}</small></div></div>`;
  }
  const bond = sh.bondInfo(id);
  const inSquad = sh.squadIds().includes(id);
  const perkUp = bond.level >= BOND.perkUpAt;
  const vet = sh.veteranOn();
  const bondNext = bond.next === null ? 'Max' : `${fmtNum(bond.xp - bond.cur)}/${fmtNum(bond.next - bond.cur)} XP`;
  return (
    `<div class="scard ${st}">${face(id, 'big')}<div class="sc">` +
    `<div class="sn"><b>${esc(def.name)}</b><small>${esc(def.role)}</small></div>` +
    `<div class="bond">${icon('heart')}<span>Bond ${bond.level} · ${esc(bond.name)}</span>${staticBar(bond.frac, 'bondbar')}<em>${bondNext}</em></div>` +
    `<div class="perk"><b>${esc(def.perk.name)}${perkUp ? ' +' : ''}</b> ${esc(perkUp ? def.perk.up : def.perk.text)}</div>` +
    (vet ? `<div class="perk vet"><b>${esc(def.veteran.name)}</b> ${esc(def.veteran.text)}</div>` : '') +
    `<p class="line">"${esc(sh.survivorLine(id))}"</p>` +
    (st === 'waiting'
      ? `<div class="tagline warn">${icon('bed')}Needs a bunk: upgrade the Barracks</div>`
      : `<div class="sq">${inSquad ? `<span class="insq">${icon('check')}In the squad</span>` : btn('Bring along', 'pickSurvivor', { id }, { cls: 'small' })}</div>`) +
    `</div></div>`
  );
}

function barracksSection(sh) {
  const cards = SURVIVOR_ORDER.map((id) => survivorCard(sh, id)).join('');
  const bondCh = sh.specialMissions().filter((m) => m.kind === 'bond');
  const bc = bondCh.length
    ? sec(
        `${icon('heart')} Bond chapters`,
        bondCh
          .map((m) => `<div class="callcard">${face(m.who)}<div><b>${esc(m.name)}</b><small>${esc(BOND_CHAPTERS[m.who].intro)}</small></div>${btn('Play', 'prep', { id: m.id }, { cls: 'small primary' })}</div>`)
          .join(''),
      )
    : '';
  return (
    sec(
      `${icon('squad')} Survivors <small>${sh.housed().length}/${sh.bunks()} bunks · Well Rested +${sh.row('barracks').rested}% bond XP</small>`,
      `<div class="scards">${cards}</div><p class="note">Named survivors play as bot teammates, just below a real player. Bonds grow with every mission played together.</p>`,
    ) + bc
  );
}

function armorySection(sh) {
  const unlocked = sh.weaponsUnlocked();
  const rows = Object.keys(WEAPONS)
    .map((w) => {
      const has = unlocked.includes(w);
      if (!has) {
        const lvl = STATIONS.armory.levels.findIndex((r) => r.weapon === w) + 1;
        return `<div class="wrow locked">${icon(w)}<span class="wn"><b>${esc(WEAPONS[w].name)}</b><small>${esc(WEAPONS[w].text)}</small></span><span class="lockt">${icon('lock')}Armory Lv ${lvl}</span></div>`;
      }
      const info = sh.weaponUpgradeInfo(w);
      const tier = WEAPON_TIERS[info.tier - 1];
      const act = info.maxed
        ? `<span class="insq">${icon('star')}Max</span>`
        : btn(`${info.next.name}`, 'upgradeWeapon', { id: w }, { disabled: !info.canStart, why: info.blockers.length ? blockerText(info.blockers[0]) : '', cls: 'small primary', sub: costHtml(sh, info.next.cost) });
      return `<div class="wrow">${icon(w)}<span class="wn"><b>${esc(WEAPONS[w].name)} <em>${tier.name}</em></b><small>Power ${Math.round(sh.weaponPower(w))} · ${esc(WEAPONS[w].text)}</small></span>${act}</div>`;
    })
    .join('');
  const att = sh.attachments();
  return sec(
    `${icon('armory')} Weapons <small>upgrades are instant</small>`,
    `<div class="wrows">${rows}</div>` +
      `<p class="note">Attachments from the Workshop: ${att.length ? att.map((a) => esc(ATTACHMENTS[a].name)).join(', ') : 'none yet (Workshop Lv 3 and 5)'}. Loadout presets: ${sh.presetSlots()} (save them in mission prep).</p>`,
  );
}

function radioSection(sh) {
  const call = sh.rescueCall();
  const callHtml = call
    ? `<div class="callcard hot">${face('bot', 'dim')}<div><b>Rescue call: ${esc(sh.missionDef(`rescue_${call}`).name)}</b><small>${esc(CALL_TEXT[call])}</small></div>${btn('Answer', 'prep', { id: `rescue_${call}` }, { cls: 'small primary' })}</div>`
    : `<p class="note">${sh.level('radio') ? (sh.callBunks() > 0 ? 'No one is calling right now.' : 'Rescue calls come in when a Barracks bunk is free.') : ''}</p>`;
  const orders = sh.orders();
  const oh = orders.length
    ? orders
        .map((o) => {
          const f = o.progress / o.n;
          return (
            `<div class="order${o.done ? ' done' : ''}">${icon(o.done ? 'check' : 'order')}<span class="on"><b>${esc(sh.orderText(o))}</b>${staticBar(f)}<small>${fmtNum(o.progress)}/${fmtNum(o.n)}</small></span>` +
            `${lootHtml(o.reward, { cls: 'small' })}${o.done ? btn('Claim', 'claimOrder', { uid: o.uid }, { cls: 'small primary' }) : ''}</div>`
          );
        })
        .join('')
    : '<p class="note">No orders yet.</p>';
  const next = sh.s.orders.nextAt;
  return (
    sec(`${icon('radio')} Rescue calls`, callHtml) +
    sec(
      `${icon('order')} Daily orders <small>${orders.length}/${ORDERS.max}</small>`,
      oh + `<p class="note">One new order a day${next ? ` (next in <b data-end="${next}"></b>)` : ''}. They stack up to ${ORDERS.max}, so a missed day can be caught up. No streaks.</p>`,
    ) +
    sec(`${icon('map')} Chapters`, `<p class="note">Chapters 1-${sh.chapterLimit()} are open on the radio. ${sh.level('radio') < 5 ? `Lv ${sh.level('radio') + 1} picks up chapters up to ${sh.row('radio', sh.level('radio') + 1).chapters}.` : 'Every chapter is open.'}</p>`)
  );
}

/** A station's sheet: header, its own panel, crafting, then the upgrade. */
export function stationSheet(sh, id) {
  const def = STATIONS[id];
  const lvl = sh.level(id);
  const state = sh.stationState(id);
  let body = '';
  if (state === 'locked') {
    body = sec(`${icon('lock')} Locked`, `<p class="note">Board it up properly first: this station opens at <b>Barricade Lv ${def.unlock}</b>.</p>`);
  } else {
    if (lvl > 0) {
      if (id === 'scrapyard') body += yardSection(sh);
      if (id === 'generator') body += generatorSection(sh);
      if (id === 'barricade') body += barricadeSection(sh);
      if (id === 'barracks') body += barracksSection(sh);
      if (id === 'armory') body += armorySection(sh);
      if (id === 'radio') body += radioSection(sh);
      if (id === 'workshop' || id === 'infirmary') body += craftSection(sh, id);
    }
    body += upgradeSection(sh, id);
  }
  return (
    `<div class="sheet-head"><span class="sh-ic">${icon(id)}</span><div class="sh-t"><div class="kicker">${esc(def.question)}</div>` +
    `<h2>${esc(def.name)} <small>${lvl ? `Lv ${lvl}/5` : state === 'locked' ? 'Locked' : 'Not built'}</small></h2><p>${esc(def.desc)}</p></div></div>` +
    `<div class="sheet-body scroll">${body}</div>`
  );
}

// --- Builds and the crate ---------------------------------------------------------------------------------

export function buildsSheet(sh) {
  const builds = sh.builds();
  const rows = builds.length
    ? builds
        .map(
          (b) =>
            `<div class="job running"><span class="ji">${icon(b.id)}</span><span class="jn">${esc(STATIONS[b.id].name)} → Lv ${b.to}</span>${liveBar(b.start, b.end)}<span class="t"><b data-end="${b.end}"></b></span>` +
            `<button class="x" type="button" data-act="cancelBuild" data-id="${b.id}" aria-label="Cancel">${icon('cancel')}</button></div>`,
        )
        .join('')
    : '<p class="note">No builds running.</p>';
  const free = sh.freeSlots();
  const ready = Object.keys(STATIONS).filter((id) => sh.upgradeInfo(id).canStart);
  const tips = ready.length
    ? `<div class="gates">${ready.map((id) => `<button class="gate ok" type="button" data-act="open" data-id="${id}">${icon('up')}${esc(STATIONS[id].name)}</button>`).join('')}</div>`
    : '<p class="note">Nothing can start right now: missions bring the Scrap and Parts.</p>';
  const nextSlot = sh.buildSlots() === 1 ? 'A second slot comes at Barricade Lv 3.' : sh.buildSlots() === 2 ? 'A third slot comes at Barricade Lv 5.' : '';
  return (
    `<div class="sheet-head"><span class="sh-ic">${icon('hammer')}</span><div class="sh-t"><div class="kicker">One timer, one tap</div><h2>Builds <small>${builds.length}/${sh.buildSlots()} slots busy</small></h2><p>Upgrades run on real-time timers, also while the app is closed. Cancelling refunds everything.</p></div></div>` +
    `<div class="sheet-body scroll">${sec('', `<div class="queue">${rows}</div><p class="note">${nextSlot}</p>`)}${free > 0 ? sec(`${icon('up')} Ready to start`, tips) : ''}</div>`
  );
}

export function crateSheet(sh) {
  const L = sh.resolvedLoadout();
  const cols = SLOTS.map((slot) => {
    const want = sh.s.loadout[slot];
    const items = sh.itemsFor(slot);
    const chosen = L[slot];
    const opts = items
      .map((it) => {
        const station = RECIPES[it.id].station;
        return (
          `<button class="citem${chosen === it.id ? ' sel' : ''}${it.have ? '' : ' none'}" type="button" data-act="slot" data-slot="${slot}" data-item="${it.id}">` +
          `${icon(it.id)}<span><b>${esc(it.name)}</b><small>${esc(STATIONS[station].name)} Lv ${RECIPES[it.id].unlockLevel}</small></span><em>${it.have}/${CRATE_MAX}</em></button>`
        );
      })
      .join('');
    const freeHeal =
      slot === 'heal'
        ? `<button class="citem${chosen === FREE_HEAL ? ' sel' : ''}" type="button" data-act="slot" data-slot="heal" data-item="${FREE_HEAL}">${icon(FREE_HEAL)}<span><b>Bandage</b><small>Free, always</small></span><em>∞</em></button>`
        : '';
    const mode = want === null ? 'auto: best in stock' : want === 'none' ? 'left empty' : 'picked';
    return (
      `<div class="ccol"><div class="ch3">${icon(slot)}<b>${esc(SLOT_INFO[slot].name)}</b><small>${esc(SLOT_INFO[slot].hint)} · ${mode}</small></div>` +
      `${freeHeal}${opts}` +
      `<div class="btnrow">${btn('Auto', 'slot', { slot, item: 'auto' }, { cls: `small ${want === null ? 'on' : 'ghost'}` })}${slot !== 'heal' ? btn('None', 'slot', { slot, item: 'none' }, { cls: `small ${want === 'none' ? 'on' : 'ghost'}` }) : ''}</div></div>`
    );
  }).join('');
  return (
    `<div class="sheet-head"><span class="sh-ic">${icon('crate')}</span><div class="sh-t"><div class="kicker">What do we carry?</div><h2>Loadout Crate</h2><p>Finished crafts wait here, up to ${CRATE_MAX} of each. You carry one throwable, one heal and one boost; anything you don't use comes back.</p></div></div>` +
    `<div class="sheet-body scroll"><div class="ccols">${cols}</div>` +
    `<div class="btnrow">${btn(`${icon('workshop')}Workshop`, 'open', { id: 'workshop' }, { cls: 'ghost' })}${btn(`${icon('infirmary')}Infirmary`, 'open', { id: 'infirmary' }, { cls: 'ghost' })}</div></div>`
  );
}

// --- Mission prep ----------------------------------------------------------------------------------------------

function routeHtml(M, { report = null } = {}) {
  return (
    `<div class="route">` +
    M.sections
      .map((s, i) => {
        const r = report ? report.sections[i] : null;
        const st = r ? (r.cleared ? 'cleared' : 'failed') : report ? 'unreached' : '';
        const cans = M.fuelCans && M.fuelCans.section === i ? `<span class="cans" title="Fuel cans">${icon('fuel')}</span>` : '';
        return (
          `<span class="leg k-${s.kind} ${st}"><span class="lk">${s.kind === 'run' ? '' : icon(s.kind === 'horde' ? 'skull' : 'flag')}${esc(SECTION_KINDS[s.kind].name)}</span><small>${s.threat}</small>${cans}</span>` +
          `<span class="door ${st}">${icon('saferoom')}</span>`
        );
      })
      .join('') +
    `</div>`
  );
}

function missionHeader(sh, M) {
  let kicker;
  let blurb;
  if (M.kind === 'rescue') {
    kicker = 'Radio Room · rescue call';
    blurb = CALL_TEXT[M.who];
  } else if (M.kind === 'bond') {
    kicker = `Bond chapter · ${SURVIVORS[M.who].short}`;
    blurb = BOND_CHAPTERS[M.who].intro;
  } else {
    kicker = `Chapter ${M.chapter} · ${CHAPTERS[M.chapter - 1].name} · ${M.finale ? 'Finale' : `Mission ${M.index}`}`;
    blurb = CHAPTER_TEXT[M.chapter];
  }
  return `<div class="kicker">${esc(kicker)}</div><h2>${esc(M.name)}</h2><p class="blurb">${esc(blurb)}</p>`;
}

function missionList(sh, sel) {
  const specials = sh.specialMissions();
  let html = '';
  if (specials.length) {
    html += `<div class="ch special"><div class="ch-h">${icon('radio')}<b>Special</b></div>`;
    html += specials
      .map((m) => `<button class="ms${sel === m.id ? ' sel' : ''}" type="button" data-act="pick" data-id="${m.id}">${face(m.kind === 'rescue' ? 'bot' : m.who, 'tiny')}<span class="mn">${esc(m.name)}</span><span class="mw">${m.kind === 'rescue' ? 'rescue' : 'bond'}</span></button>`)
      .join('');
    html += '</div>';
  }
  let shownLocked = false;
  for (const ch of sh.chapters()) {
    if (!ch.open && !ch.cleared) {
      if (shownLocked) break;
      shownLocked = true;
      const why = ch.radioLocked ? `Radio Room Lv ${Math.max(1, Math.ceil((ch.n - 3) / 2))} picks it up` : `Clear Chapter ${ch.n - 1} first`;
      html += `<div class="ch locked"><div class="ch-h">${icon('lock')}<b>Ch ${ch.n}</b><span>${esc(ch.name)}</span></div><p class="note">${esc(why)}</p></div>`;
      continue;
    }
    // Cleared chapters fold into one line of replay buttons, unless one of theirs is picked.
    if (ch.cleared && !ch.missions.some((m) => m.id === sel)) {
      html +=
        `<div class="ch cleared fold"><div class="ch-h">${icon('check')}<b>Ch ${ch.n}</b><span>${esc(ch.name)}</span>` +
        ch.missions.map((m) => `<button class="mini" type="button" data-act="pick" data-id="${m.id}" title="${esc(m.name)}">${m.finale ? icon('flag') : m.index}</button>`).join('') +
        `</div></div>`;
      continue;
    }
    html += `<div class="ch${ch.cleared ? ' cleared' : ''}"><div class="ch-h">${icon(ch.cleared ? 'check' : 'chapter')}<b>Ch ${ch.n}</b><span>${esc(ch.name)}</span></div>`;
    html += ch.missions
      .map((m) => {
        const cls = `${sel === m.id ? ' sel' : ''}${m.wins ? ' won' : ''}${m.open ? '' : ' locked'}`;
        return `<button class="ms${cls}" type="button" data-act="pick" data-id="${m.id}"${m.open ? '' : ' disabled'}><span class="mi">${m.finale ? icon('flag') : m.index}</span><span class="mn">${esc(m.name)}</span><span class="mw">${m.wins ? `${icon('check')}${m.wins > 1 ? `×${m.wins}` : ''}` : m.open ? 'new' : icon('lock')}</span></button>`;
      })
      .join('');
    html += '</div>';
  }
  return html;
}

function memberCard(sh, m) {
  let sub;
  if (m.kind === 'you') sub = `${WEAPONS[m.weapon].name} ${WEAPON_TIERS[m.tier - 1].name}`;
  else if (m.kind === 'friend') sub = `Friend · ${FRIENDS[m.id].label}`;
  else if (m.kind === 'survivor') sub = `${SURVIVORS[m.id].role} · bond ${m.bond}`;
  else sub = 'Stand-in';
  return `<div class="member k-${m.kind}">${face(m.kind === 'survivor' ? m.id : m.kind === 'friend' ? m.id : m.kind)}<span class="mm"><b>${esc(m.name)}</b><small>${esc(sub)}</small></span><span class="pw">${Math.round(m.power)}</span></div>`;
}

export function prepPanel(sh, ctx) {
  const id = ctx.mission;
  const M = sh.missionDef(id);
  if (!M) return '<p>Mission not found.</p>';
  const open = sh.missionOpen(id);
  const L = sh.missionLoadout(id);
  const odds = sh.odds(id);
  const risk = riskLabel(odds.clear);
  const squad = L.members;

  // Squad pickers: survivors at home, and a simulated friend.
  const home = sh.housed();
  const inSquad = sh.squadIds();
  const roster = home.length > (L.friend ? 2 : 3) || L.friend
    ? `<div class="roster">${home.map((sid) => `<button class="rchip${inSquad.includes(sid) ? ' on' : ''}" type="button" data-act="pickSurvivor" data-id="${sid}">${face(sid, 'tiny')}${esc(SURVIVORS[sid].short)}</button>`).join('')}</div>`
    : '';
  const friendBtns = [
    `<button class="rchip${!L.friend ? ' on' : ''}" type="button" data-act="friend" data-kind="">${icon('you')}Solo</button>`,
    ...Object.entries(FRIENDS).map(([k, f]) => `<button class="rchip${L.friend === k ? ' on' : ''}" type="button" data-act="friend" data-kind="${k}">${face(k, 'tiny')}${esc(f.name)} <small>${esc(f.label.split(' ')[0])}</small></button>`),
  ].join('');
  const sh2 = L.shared;
  const from = (k) => (k === 'you' ? 'yours' : `${FRIENDS[k].name}'s`);
  const shared = `<div class="shared">${icon('heal')}Starting temp health <b>+${sh2.tempHp}</b> <small>(${from(sh2.tempFrom)})</small> · ${icon('bed')}Well Rested <b>+${sh2.rested}%</b> bond XP <small>(${from(sh2.restedFrom)})</small></div>`;

  // Loadout.
  const Lo = sh.resolvedLoadout();
  const weapons = sh
    .weaponsUnlocked()
    .map((w) => `<button class="rchip${Lo.weapon === w ? ' on' : ''}" type="button" data-act="weapon" data-id="${w}">${icon(w)}${esc(WEAPONS[w].name)} <small>${WEAPON_TIERS[sh.weaponTier(w) - 1].name}</small></button>`)
    .join('');
  const slots = SLOTS.map((slot) => {
    const cur = Lo[slot];
    const opts = sh.itemsFor(slot).filter((it) => it.have > 0);
    const chips = [
      ...(slot === 'heal' ? [{ id: FREE_HEAL, name: 'Bandage', have: '∞' }] : [{ id: 'none', name: 'Empty', have: '' }]),
      ...opts.map((it) => ({ id: it.id, name: it.name, have: it.have })),
    ]
      .map((o) => {
        const on = o.id === 'none' ? !cur : cur === o.id;
        return `<button class="rchip${on ? ' on' : ''}" type="button" data-act="slot" data-slot="${slot}" data-item="${o.id}">${o.id === 'none' ? '' : icon(o.id)}${esc(o.name)}${o.have !== '' ? ` <small>${o.have}</small>` : ''}</button>`;
      })
      .join('');
    return `<div class="slotrow"><span class="sl">${icon(slot)}<b>${esc(SLOT_INFO[slot].name)}</b><small>${esc(SLOT_INFO[slot].hint)}</small></span><span class="sc">${chips}</span></div>`;
  }).join('');
  const nPresets = sh.presetSlots();
  const presets = nPresets
    ? `<div class="presets"><span class="sl">${icon('armory')}<b>Presets</b></span>${Array.from({ length: nPresets }, (_, i) => {
        const p = sh.s.presets[i];
        return `<span class="pre">${btn(`${String.fromCharCode(65 + i)}`, 'applyPreset', { i }, { disabled: !p, why: 'Empty preset: save one first', cls: 'small' })}${btn('Save', 'savePreset', { i }, { cls: 'small ghost' })}</span>`;
      }).join('')}</div>`
    : '';

  const firstWin = L.firstClear && M.firstClear;
  const loot = { ...M.loot };
  const reward =
    (firstWin ? `<span class="bonus">${icon('star')}First clear ${lootHtml(M.firstClear)}</span>` : '') +
    (M.reward ? `<span class="bonus">${icon('heart')}Story reward ${lootHtml(M.reward)}</span>` : '') +
    (M.kind === 'rescue' ? `<span class="bonus">${icon('squad')}${esc(SURVIVORS[M.who].short)} joins</span>` : '') +
    (M.kind === 'story' && M.finale && CHAPTERS[M.chapter - 1].rescue && sh.survivorState(CHAPTERS[M.chapter - 1].rescue) === 'unknown' ? `<span class="bonus">${icon('squad')}Someone is waiting at the end</span>` : '');
  const startWhy = open ? '' : 'Not unlocked yet';
  const forced = sh.tuning.outcome !== 'auto' ? `<span class="forced">${sh.tuning.outcome === 'win' ? 'Forced: always clear' : 'Forced: always wipe'}</span>` : '';

  return (
    `<div class="prep">` +
    `<div class="prep-list scroll">${missionList(sh, id)}</div>` +
    `<div class="prep-main scroll">` +
    `<div class="pm-head">${missionHeader(sh, M)}</div>` +
    routeHtml(M) +
    `<div class="odds t-${risk.tone}"><span class="op">${sh.s.stats.missions === 0 ? '100%' : pct(odds.clear)}</span><span class="ot"><b>${esc(risk.text)}</b><small>clear chance · squad power ${L.power} vs ${M.threat}${forced}</small></span>` +
    `<span class="ol"><small>Full clear pays</small>${lootHtml(loot)}</span></div>` +
    (reward ? `<div class="rewards">${reward}</div>` : '') +
    `<h3>${icon('squad')} Squad</h3><div class="members">${squad.map((m) => memberCard(sh, m)).join('')}</div>` +
    roster +
    `<div class="roster friends"><span class="sl">${icon('friend')}<b>Co-op</b><small>simulated friend</small></span>${friendBtns}</div>` +
    shared +
    `<h3>${icon('crate')} Loadout</h3>` +
    `<div class="slotrow"><span class="sl">${icon(Lo.weapon)}<b>Gun</b><small>from the Armory</small></span><span class="sc">${weapons}</span></div>` +
    slots +
    presets +
    `<div class="startrow">${btn(`${icon('play')}Start simulation`, 'start', { id }, { disabled: !open, why: startWhy, cls: 'primary big', sub: `${fmtDuration(M.seconds)} mission · stand-in for the co-op game` })}</div>` +
    `</div></div>`
  );
}

// --- Results ------------------------------------------------------------------------------------------------------

export function resultsPanel(sh, report, summary) {
  const M = report.mission;
  const won = report.won;
  const rooms = report.sectionsCleared;
  const title = won ? 'MISSION CLEAR' : 'WIPED';
  const sub = won
    ? `${esc(M.name)} · every safe room reached`
    : `${esc(M.name)} · ${rooms ? `${plural(rooms, 'safe room')} banked before the wipe` : 'wiped before the first safe room'}`;
  const used = Object.entries(report.itemsUsed);
  const L = report.loadout || null;
  const carried = L ? Object.values(L.members[0].items).filter((x) => x && x !== FREE_HEAL) : [];
  const back = carried.filter((x) => !report.itemsUsed[x]);
  const items =
    (used.length ? `<span class="iu">${icon('check')}Used: ${used.map(([id, n]) => `${icon(id)}${esc(ITEMS[id].name)}${n > 1 ? ` ×${n}` : ''}`).join(' ')}</span>` : '') +
    (back.length ? `<span class="ib">${icon('crate')}Back in the crate: ${back.map((id) => `${icon(id)}${esc(ITEMS[id].name)}`).join(' ')}</span>` : '') +
    (!used.length && !back.length ? '<span class="ib">No crafted items carried. The free bandage is always there.</span>' : '');
  const over = Object.keys(summary.over || {}).length
    ? `<p class="note warn">${icon('warn')}Over the cap: ${Object.entries(summary.over)
        .map(([r, v]) => `${fmtNum(v)} ${RES_INFO[r].name}`)
        .join(', ')} became ${fmtNum(summary.overflowScrap)} Scrap.</p>`
    : '';
  const surv = report.squad.survivors
    .map((sid) => {
      const b = sh.bondInfo(sid);
      const up = summary.bondUps.find((u) => u.id === sid);
      return `<div class="sgain">${face(sid)}<span class="sgt"><b>${esc(SURVIVORS[sid].short)}</b><small>+${summary.bondXp} bond XP${up ? ` · <em>Bond ${up.level}!${up.perkUp ? ` ${esc(SURVIVORS[sid].perk.name)} improved` : ''}</em>` : ''}</small>${staticBar(b.frac, 'bondbar')}</span></div>`;
    })
    .join('');
  const line = report.squad.survivors.length ? `<p class="line">${face(report.squad.survivors[0], 'tiny')}"${esc(sh.survivorLine(report.squad.survivors[0]))}"</p>` : '';
  const news = [];
  if (summary.chapterCleared) news.push(`${icon('flag')}Chapter ${summary.chapterCleared} cleared! Upgrades that need ${plural(sh.chaptersCleared(), 'chapter')} are open.`);
  if (summary.firstWin && report.firstClear) news.push(`${icon('star')}First clear bonus: ${lootHtml(report.firstClear)}`);
  for (const sid of summary.rescued) news.push(`${icon('squad')}${esc(SURVIVORS[sid].name)} was rescued. They need a bunk: upgrade the Barracks.`);
  for (const sid of summary.movedIn) news.push(`${icon('bed')}${esc(SURVIVORS[sid].name)} moved into the Barracks.`);
  if (summary.bondStory) news.push(`${icon('heart')}${esc(BOND_CHAPTERS[summary.bondStory].name)}: ${esc(BOND_CHAPTERS[summary.bondStory].outro)}`);
  for (const uid of summary.ordersDone) {
    const o = sh.orders().find((x) => x.uid === uid);
    if (o) news.push(`${icon('order')}Order done: ${esc(sh.orderText(o))}. Claim it in the Radio Room.`);
  }
  const next = sh.nextMission();
  return (
    `<div class="res-head ${won ? 'won' : 'lost'}"><div class="stamp">${title}</div><p>${sub}</p></div>` +
    `<div class="scroll res-body">` +
    routeHtml(report.loadout ? report.loadout.mission : sh.missionDef(report.missionId), { report }) +
    `<div class="paid"><span class="pl">${icon('saferoom')}Banked, full share</span>${lootHtml(summary.got)}</div>` +
    over +
    `<div class="items">${items}</div>` +
    (surv ? `<div class="sgains">${surv}</div>` : '') +
    line +
    (news.length ? `<div class="news">${news.map((n) => `<p>${n}</p>`).join('')}</div>` : '') +
    `<p class="note">${icon('skull')}${fmtNum(report.kills)} infected · ${icon('clock')}${fmtTime(report.timeS)} · squad power ${report.power}</p>` +
    `</div>` +
    `<div class="btnrow end">${btn('Back to the Safehouse', 'close', {}, { cls: 'ghost' })}${btn(`${icon('play')}Next mission`, 'prep', { id: next }, { cls: 'primary' })}</div>`
  );
}

// --- Scenes, stages, welcome back -----------------------------------------------------------------------------------------

export function scenePanel(key) {
  const sc = SCENES[key];
  if (!sc) return null;
  const lines = sc.lines
    .map((l) => {
      const def = SURVIVORS[l.who];
      return `<div class="sline">${face(l.who, 'big')}<div class="sb"><b>${esc(def ? def.short : 'You')}</b><p>${esc(l.text)}</p></div></div>`;
    })
    .join('');
  const who = key.startsWith('rescue_') ? key.slice(7) : null;
  const bio = who ? `<p class="bio">${icon('info')}<span><b>${esc(SURVIVORS[who].name)}</b>, ${esc(SURVIVORS[who].role.toLowerCase())}. ${esc(BIOS[who])}</span></p>` : '';
  const perk = who ? `<p class="bio">${icon('star')}<span><b>${esc(SURVIVORS[who].perk.name)}:</b> ${esc(SURVIVORS[who].perk.text)}.</span></p>` : '';
  return (
    `<div class="scene"><div class="kicker">${esc(sc.kicker)}</div><h2>${esc(sc.title)}</h2>${lines}` +
    (sc.after ? `<p class="after">${icon('bed')}<span>${esc(sc.after)}</span></p>` : '') +
    `${bio}${perk}<div class="btnrow end">${btn('Continue', 'close', {}, { cls: 'primary' })}</div></div>`
  );
}

export function introPanel() {
  const sc = SCENES.intro;
  const lines = sc.lines.map((l) => `<div class="sline">${face(l.who, 'big')}<div class="sb"><b>Nadia</b><p>${esc(l.text)}</p></div></div>`).join('');
  return (
    `<div class="scene intro"><div class="kicker">FUNLAND2 · METAGAME PROTOTYPE 2</div><h1>SAFEHOUSE</h1>` +
    `<p class="lead">Between co-op missions, the Safehouse turns loot into permanent squad power. One screen, eight stations, a one-minute check-in: collect, queue, leave.</p>` +
    lines +
    `<div class="intro-grid">` +
    `<div>${icon('play')}<b>Play</b><span>PLAY runs a simulated 5-8 minute mission. Loot is banked at every safe room.</span></div>` +
    `<div>${icon('hammer')}<b>Build</b><span>Upgrades run on real timers, also while the app is closed.</span></div>` +
    `<div>${icon('power')}<b>Power &amp; Fuel</b><span>Crafts draw power while they run and burn Fuel to start.</span></div>` +
    `<div>${icon('squad')}<b>Survivors</b><span>Named teammates fill your squad. Bonds grow mission by mission.</span></div></div>` +
    `<div class="btnrow end">${btn('Move in', 'close', {}, { cls: 'primary big' })}</div>` +
    `<p class="hint">The gear (top right) opens the tuning drawer: time warp, cheats, outcomes and the pacing log.</p></div>`
  );
}

export function stagePanel(sh, index) {
  const def = STAGES[index];
  if (!def) {
    return (
      `<div class="scene stagecard"><div class="kicker">All stages done</div><h2>The long loop</h2>` +
      `<p class="lead">Level 5 stations, 24-hour timers and the last chapters. This is the long-term loop.</p>` +
      `<div class="btnrow end">${btn('Continue', 'close', {}, { cls: 'primary' })}</div></div>`
    );
  }
  const goals = def.goals.map((g) => `<li class="${sh.goalDone(g) ? 'done' : ''}">${icon(sh.goalDone(g) ? 'check' : 'dot')}${esc(g.text)}</li>`).join('');
  return (
    `<div class="scene stagecard"><div class="kicker">Stage ${index + 1} of ${STAGES.length} · ${esc(def.when)}</div><h2>${esc(def.name)}</h2>` +
    `<p class="idea">${icon('star')}<span><b>New idea</b>${esc(def.idea)}</span></p><ul class="goals">${goals}</ul>` +
    `<div class="btnrow end">${btn('Got it', 'close', {}, { cls: 'primary' })}</div></div>`
  );
}

export function welcomePanel(sh, { awayMs, events }) {
  const lines = [];
  const count = (type) => events.filter((e) => e.type === type);
  for (const e of count('built')) lines.push(`${icon(e.id)}${esc(STATIONS[e.id].name)} ${e.level === 1 ? 'built' : `reached Lv ${e.level}`}`);
  const crafted = {};
  for (const e of count('crafted')) crafted[e.item] = (crafted[e.item] || 0) + 1;
  for (const [item, n] of Object.entries(crafted)) lines.push(`${icon(item)}${n > 1 ? `${n}× ` : ''}${esc(ITEMS[item].name)} crafted, waiting in the crate`);
  if (count('yardFull').length) lines.push(`${icon('scrap')}The Scrap Yard filled up: ${fmtNum(sh.yardPile())} Scrap to collect`);
  else if (sh.level('scrapyard') && sh.yardPile() >= 1) lines.push(`${icon('scrap')}${fmtNum(sh.yardPile())} Scrap waiting in the yard`);
  for (const e of count('movedIn')) lines.push(`${icon('bed')}${esc(SURVIVORS[e.id].name)} moved into a bunk. ${esc(MOVE_IN[e.id] || '')}`);
  if (count('orderNew').length) lines.push(`${icon('order')}${plural(count('orderNew').length, 'new daily order')} on the radio`);
  const stalled = sh.s.jobs.filter((j) => j.state === 'waiting' && sh.jobStatus(j).state === 'fuel').length;
  if (stalled) lines.push(`${icon('fuel')}${plural(stalled, 'job')} waiting for Fuel: missions bring fuel cans`);
  if (!lines.length) lines.push(`${icon('check')}All quiet. Nothing decayed, nothing was lost.`);
  const canCollect = (sh.level('scrapyard') && sh.yardPile() >= 1) || sh.orders().some((o) => o.done);
  return (
    `<div class="scene welcome"><div class="kicker">Welcome back</div><h2>While you were away <small>${fmtTime(awayMs / 1000)}</small></h2>` +
    `<ul class="goals">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>` +
    `<div class="btnrow end">${canCollect ? btn(`${icon('scrap')}Collect everything`, 'collectAll', {}, { cls: 'primary' }) : ''}${btn('Continue', 'close', {}, { cls: canCollect ? 'ghost' : 'primary' })}</div></div>`
  );
}

export function powerHelp(sh) {
  return (
    `<div class="sheet-head"><span class="sh-ic">${icon('power')}</span><div class="sh-t"><div class="kicker">What can run at once?</div><h2>Power <small>${sh.powerUsed()}/${sh.powerCap()}</small></h2><p>The Generator's level sets how much power exists. Each running job draws its station's power; queued jobs start on their own when there is room.</p></div></div>` +
    `<div class="sheet-body scroll">${generatorSection(sh)}${btn(`${icon('generator')}Open the Generator`, 'open', { id: 'generator' }, { cls: 'ghost wide' })}</div>`
  );
}

export function resourceHelp(sh, r) {
  const info = RES_INFO[r];
  const cap = sh.cap(r);
  const capText = Number.isFinite(cap) ? `${fmtNum(sh.s.res[r])} / ${fmtNum(cap)} (${r === 'fuel' ? 'Generator tank' : 'Barricade storage'})` : `${fmtNum(sh.s.res[r])}, no cap`;
  return (
    `<div class="sheet-head"><span class="sh-ic">${icon(r)}</span><div class="sh-t"><div class="kicker">Resource</div><h2>${esc(info.name)} <small>${capText}</small></h2><p>Spent on: ${esc(info.spent)}. Earned from: ${esc(info.earned)}.</p></div></div>` +
    `<div class="sheet-body scroll">${sec('', `<p class="note">Everything picked up in a mission turns into resources when it ends and is banked at each safe room. Every player gets the full total. A payout over a cap turns into Scrap at half value.</p>`)}</div>`
  );
}
