// Modal contents. Every renderer is (camp, ctx) -> HTML string; buttons carry
// data-act + data-* and are handled by the dispatcher in main.js. Live
// countdowns use data-end / data-bar-start so they tick without re-rendering.

import {
  BUILDINGS,
  BUILDING_ORDER,
  RUBBLE,
  RES_INFO,
  RESOURCES,
  BASE_BEDS,
  WEAPONS,
  RECIPES,
  ZONES,
  REWARDS,
  REWARD_SCALE,
  EXPEDITIONS,
  POWER,
  CARRY_PER_ITEM,
} from './config.js';
import { buildingThumb, rubbleSvg } from './art.js';
import { icon } from './icons.js';
import { fmtNum, fmtTime, fmtDuration, pct } from './format.js';
import { winChance, riskLabel } from './run-sim.js';
import { resGemCost } from './economy.js';
import { esc } from './ui.js';

// --- Pieces ------------------------------------------------------------------------------------

const KIND_LABEL = {
  hq: 'Camp headquarters',
  producer: 'Production',
  storage: 'Storage',
  armory: 'Gives your runs: guns & damage',
  radio: 'Gives your runs: new zones',
  housing: 'Survivors',
  infirmary: 'Gives your runs: health & medkits',
  garage: 'Gives your runs: loot · Expeditions',
  workshop: 'Gives your runs: items',
};

export function lootChips(loot, { big = false, approx = false } = {}) {
  const out = [];
  for (const k of [...RESOURCES, 'gems']) {
    if (loot[k] > 0) out.push(`<span class="lc${big ? ' big' : ''}" style="--c:${RES_INFO[k].color}">${icon(k)}<b>${approx ? '≈' : '+'}${fmtNum(loot[k])}</b></span>`);
  }
  if (loot.survivors > 0) out.push(`<span class="lc${big ? ' big' : ''}" style="--c:#cfe3f2">${icon('survivor')}<b>+${loot.survivors}</b></span>`);
  return out.join('');
}

function costChips(cost, missing = {}) {
  const out = [];
  for (const r of RESOURCES) {
    if (!cost || !cost[r]) continue;
    out.push(`<span class="cc${missing[r] ? ' short' : ''}">${icon(r)}<b>${fmtNum(cost[r])}</b></span>`);
  }
  return out.join('') || '<span class="cc free">Free</span>';
}

function btn(label, act, data = {}, cls = '', gems = 0) {
  const attrs = Object.entries(data)
    .map(([k, v]) => ` data-${k}="${esc(v)}"`)
    .join('');
  const g = gems > 0 ? ` data-gems="${gems}"` : '';
  const gemTag = gems > 0 ? `<span class="gp">${icon('gems')}${gems}</span>` : '';
  return `<button class="btn ${cls}" type="button" data-act="${act}"${attrs}${g}><span class="lbl">${label}</span>${gemTag}</button>`;
}

function bar(start, end, cls = '') {
  return `<div class="pbar ${cls}" data-bar-start="${start}" data-bar-end="${end}"><i></i></div>`;
}

function countdown(end) {
  return `<span class="cd" data-end="${end}"></span>`;
}

function blockerText(b) {
  switch (b.type) {
    case 'busy':
      return 'Already being worked on';
    case 'area':
      return `Clear the ${RUBBLE[b.area].name} first`;
    case 'hq':
      return `Needs Command Post Lv ${b.need}`;
    case 'survivors':
      return `Needs ${b.need} survivors (you have ${b.have})`;
    case 'builders':
      return 'All builders are busy';
    default:
      return b.type;
  }
}

function statTable(rows) {
  if (!rows.length) return '';
  return `<div class="stats">${rows
    .map(([label, cur, next]) => `<div class="st"><span class="sl">${label}</span><span class="sv">${cur ?? '–'}</span>${next !== undefined && next !== null && next !== cur ? `<span class="sn">${icon('arrow')}${next}</span>` : ''}</div>`)
    .join('')}</div>`;
}

/** [label, current, next] rows describing what a building does. */
function effectRows(camp, id, cur, next) {
  const kind = BUILDINGS[id].kind;
  const v = (row, f) => (row ? f(row) : null);
  switch (kind) {
    case 'hq': {
      const wh = camp.level('warehouse') ? camp.row('warehouse').cap : 0;
      return [
        ['Storage (each)', v(cur, (r) => fmtNum(r.cap + wh)), v(next, (r) => fmtNum(r.cap + wh))],
        ['Builders', v(cur, (r) => r.builders), v(next, (r) => r.builders)],
      ];
    }
    case 'producer': {
      const res = RES_INFO[BUILDINGS[id].produces].name;
      return [
        [`${res} per hour`, v(cur, (r) => fmtNum(r.rate * camp.tuning.production)), v(next, (r) => fmtNum(r.rate * camp.tuning.production))],
        ['Holds', v(cur, (r) => `${fmtNum(r.store)} · ${fmtDuration((r.store / r.rate) * 3600)}`), v(next, (r) => `${fmtNum(r.store)} · ${fmtDuration((r.store / r.rate) * 3600)}`)],
      ];
    }
    case 'storage':
      return [['Extra storage (each)', v(cur, (r) => `+${fmtNum(r.cap)}`), v(next, (r) => `+${fmtNum(r.cap)}`)]];
    case 'armory':
      return [
        ['Damage', v(cur, (r) => `+${r.dmg}%`), v(next, (r) => `+${r.dmg}%`)],
        ...(next && next.weapon ? [['New gun', null, WEAPONS[next.weapon].name]] : []),
      ];
    case 'radio':
      return [
        ['Rescue chance', v(cur, (r) => `+${r.rescue}%`), v(next, (r) => `+${r.rescue}%`)],
        ...(next && next.zone ? [['Reveals', null, ZONES.find((z) => z.id === next.zone).name]] : []),
      ];
    case 'housing':
      return [['Beds', v(cur, (r) => BASE_BEDS + r.beds) ?? BASE_BEDS, v(next, (r) => BASE_BEDS + r.beds)]];
    case 'infirmary':
      return [
        ['Max health', v(cur, (r) => 100 + r.hp) ?? 100, v(next, (r) => 100 + r.hp)],
        ['Free medkits per run', v(cur, (r) => r.medkits) ?? 0, v(next, (r) => r.medkits)],
      ];
    case 'garage':
      return [
        ['Run loot', v(cur, (r) => `+${r.loot}%`), v(next, (r) => `+${r.loot}%`)],
        ['Expedition slots', v(cur, (r) => r.slots), v(next, (r) => r.slots)],
      ];
    case 'workshop':
      return [
        ['Craft slots', v(cur, (r) => r.slots), v(next, (r) => r.slots)],
        ['Craft speed', v(cur, (r) => `+${r.speed}%`), v(next, (r) => `+${r.speed}%`)],
        ...(next && next.recipe ? [['New recipe', null, RECIPES.find((x) => x.id === next.recipe).name]] : []),
      ];
    default:
      return [];
  }
}

function upgradeBlock(camp, info, { act = 'upgrade', idKey = 'id', idVal, label = 'Upgrade', head = '' } = {}) {
  let s = `<div class="up">`;
  s += `<div class="up-h">${head}<span class="up-time">${icon('clock')}${info.time > 0 ? fmtDuration(info.time) : 'Instant'}</span></div>`;
  s += `<div class="cost">${costChips(info.cost, info.missing)}</div>`;
  const hard = info.blockers.filter((b) => b.type !== 'builders');
  if (info.blockers.length) s += `<div class="blockers">${info.blockers.map((b) => `<span>${icon('lock')}${blockerText(b)}</span>`).join('')}</div>`;
  s += `<div class="btns up-btns">`;
  const data = { [idKey]: idVal };
  if (!info.blockers.length) {
    if (info.affordable) s += btn(label, act, data, 'primary');
    else s += btn(`Buy missing & ${label.toLowerCase()}`, act, { ...data, with: 'gems' }, 'gem', info.missingGems);
  } else if (hard.length === 0) {
    // Only the builders are in the way.
    const job = camp.jobs()[0];
    if (job) {
      const cost = job.kind === 'rubble' ? camp.rushClearCost(job.id) : camp.rushCost(job.id);
      s += btn(`Finish ${esc(job.name)} now`, job.kind === 'rubble' ? 'rushClear' : 'rush', job.kind === 'rubble' ? { area: job.id } : { id: job.id }, 'gem', cost);
    }
  } else s += btn(label, act, data, 'primary disabled');
  s += `</div></div>`;
  return s;
}

function progressBlock(title, up, rushAct, data, cost) {
  return (
    `<div class="prog"><div class="prog-h">${icon('hammer')}<span>${title}</span>${countdown(up.end)}</div>${bar(up.start, up.end)}` +
    `<div class="btns up-btns">${btn('Finish now', rushAct, data, 'gem', cost)}</div></div>`
  );
}

// --- Building panels ---------------------------------------------------------------------------------

export function plotPanel(camp, id, ctx) {
  const st = camp.plotState(id);
  if (st === 'hidden') return areaHiddenPanel(camp, id);
  if (st === 'locked') return lockedPanel(camp, id);
  return buildingPanel(camp, id, ctx);
}

/**
 * Two-column building layout: art + level on the left; details on the right,
 * with the main action pinned in a footer so it never scrolls away.
 */
function shell(id, lvl, kicker, extraCls, body, foot = '') {
  const def = BUILDINGS[id];
  const max = def.levels.length;
  return (
    `<div class="bp"><div class="bp-left ${extraCls}"><div class="bp-art">${buildingThumb(id, lvl || 1)}</div>` +
    `<div class="bp-lv">${lvl > 0 ? `Level <b>${lvl}</b><small>/${max}</small>` : 'Not built'}</div></div>` +
    `<div class="bp-right"><div class="bp-main scroll"><div class="bp-head"><div class="kicker">${kicker}</div><h2>${esc(def.name)}</h2><p class="desc">${esc(def.desc)}</p></div>${body}</div>` +
    (foot ? `<div class="bp-foot">${foot}</div>` : '') +
    `</div></div>`
  );
}

function buildingPanel(camp, id, ctx) {
  const def = BUILDINGS[id];
  const b = camp.s.buildings[id];
  const lvl = b.level;
  const info = camp.upgradeInfo(id);
  const cur = camp.row(id);
  const next = info.maxed ? null : info.row;
  let right = '';
  let foot = '';

  if (b.up) {
    foot = progressBlock(lvl === 0 ? 'Building' : `Upgrading to Lv ${b.up.to}`, b.up, 'rush', { id }, camp.rushCost(id));
  }
  if (def.kind === 'producer' && lvl > 0 && !b.up) {
    const p = camp.pending(id);
    const row = cur;
    const full = camp.timeToFull(id);
    const res = def.produces;
    const room = camp.storageCap() - Math.floor(camp.s.res[res]);
    right +=
      `<div class="collect" style="--c:${RES_INFO[res].color}">${icon(res)}<div><b>${fmtNum(p)}</b><small> / ${fmtNum(row.store)} waiting</small>` +
      `<div class="cl-sub">${full > 0 ? `Full in ${fmtTime(full)}` : 'Full: production has stopped'}${room <= 0 ? ' · Storage is full' : ''}</div></div>` +
      `${btn('Collect', 'collect', { id }, p >= 1 && room > 0 ? 'primary' : 'disabled')}</div>`;
  }
  // Level 0 previews what the first level does; otherwise current -> next.
  if (lvl === 0) right += statTable(effectRows(camp, id, null, def.levels[0]).map((r) => [r[0], r[2]]));
  else right += statTable(effectRows(camp, id, cur, next));
  right += kindSection(camp, id, ctx);

  if (!info.maxed && !b.up) {
    foot = upgradeBlock(camp, info, { idVal: id, label: lvl === 0 ? 'Build' : 'Upgrade', head: lvl === 0 ? 'Build' : `Upgrade to Lv ${info.next}` });
  } else if (info.maxed) foot = `<div class="maxed">${icon('star')}Max level</div>`;

  return shell(id, lvl, lvl === 0 ? 'New building' : KIND_LABEL[def.kind], lvl === 0 ? 'ghost' : '', right, foot);
}

function lockedPanel(camp, id) {
  const def = BUILDINGS[id];
  const rows = effectRows(camp, id, null, def.levels[0]).map((r) => [r[0], r[2]]);
  const body = `<div class="locked-note">${icon('lock')}<span>Unlocks at <b>Command Post Lv ${def.unlockHq}</b></span></div>` + statTable(rows);
  return shell(id, 0, 'Locked', 'silhouette', body, `<div class="btns">${btn('Go to the Command Post', 'goto', { id: 'hq' })}</div>`);
}

function areaHiddenPanel(camp, id) {
  const area = BUILDINGS[id].area;
  return shell(id, 0, 'Behind the rubble', 'silhouette', `<div class="locked-note">${icon('lock')}<span>Clear the <b>${esc(RUBBLE[area].name)}</b> to make room.</span></div>`, `<div class="btns">${btn('Go there', 'goto', { id: area })}</div>`);
}

function kindSection(camp, id, ctx) {
  const kind = BUILDINGS[id].kind;
  if (kind === 'hq') return hqSection(camp);
  if (kind === 'armory') return armorySection(camp);
  if (kind === 'radio') return radioSection(camp);
  if (kind === 'housing') return housingSection(camp);
  if (kind === 'garage' && camp.level('garage') > 0) return expeditionSection(camp);
  if (kind === 'workshop' && camp.level('workshop') > 0) return workshopSection(camp);
  if (kind === 'infirmary' && camp.level('infirmary') > 0) return `<div class="note">${icon('hp')}Every run now starts with <b>${100 + camp.row('infirmary').hp} max health</b>${camp.row('infirmary').medkits ? ` and <b>${camp.row('infirmary').medkits} free medkit${camp.row('infirmary').medkits > 1 ? 's' : ''}</b>` : ''}.</div>`;
  return '';
}

function hqSection(camp) {
  const nextLv = camp.hq + 1;
  let s = '';
  const day = Math.floor((camp.now() - camp.s.created) / 86400000) + 1;
  s += `<div class="note">${icon('tent')}Day ${day} of the outbreak · ${camp.s.survivors} survivors · ${camp.builders()} builder${camp.builders() > 1 ? 's' : ''}</div>`;
  if (nextLv <= BUILDINGS.hq.levels.length) {
    const un = camp.unlocksAt(nextLv);
    if (un.length) {
      s += `<div class="sec"><div class="sec-h">Lv ${nextLv} unlocks</div><div class="unlocks">${un.map(unlockTile).join('')}</div></div>`;
    }
  }
  return s;
}

export function unlockTile(u) {
  if (u.type === 'building') return `<div class="ut">${buildingThumb(u.id, 1)}<span>${esc(u.name)}</span><small>New building</small></div>`;
  if (u.type === 'rubble') return `<div class="ut">${icon('hammer')}<span>${esc(u.name)}</span><small>Can be cleared</small></div>`;
  if (u.type === 'builder') return `<div class="ut">${icon('hammer')}<span>Builder #${u.n}</span><small>Build two things at once</small></div>`;
  if (u.type === 'storage') return `<div class="ut">${icon('crate')}<span>Storage</span><small>${fmtNum(u.cap)} base</small></div>`;
  if (u.type === 'levels') return `<div class="ut">${icon('arrow')}<span>Higher levels</span><small>${u.ids.length} buildings</small></div>`;
  return '';
}

function armorySection(camp) {
  const have = camp.weapons();
  const lvlFor = {};
  BUILDINGS.armory.levels.forEach((r, i) => {
    if (r.weapon) lvlFor[r.weapon] = i + 1;
  });
  const items = Object.entries(WEAPONS)
    .map(([w, d]) => {
      const ok = have.includes(w);
      return `<div class="wp${ok ? '' : ' off'}">${icon(w)}<span>${esc(d.name)}</span><small>${ok ? 'In your loadout' : `Armory Lv ${lvlFor[w]}`}</small></div>`;
    })
    .join('');
  return `<div class="sec"><div class="sec-h">Guns for your runs</div><div class="wps">${items}</div></div>`;
}

function radioSection(camp) {
  const zones = camp.zones();
  const items = zones
    .map((z) => `<div class="wp${z.unlocked ? '' : ' off'}">${icon('map')}<span>${esc(z.name)}</span><small>${z.unlocked ? `Power ${z.rec}` : `Radio Lv ${z.radio}`}</small></div>`)
    .join('');
  return `<div class="sec"><div class="sec-h">Zones you can run</div><div class="wps">${items}</div></div>`;
}

function housingSection(camp) {
  const away = camp.crewAway();
  return `<div class="note">${icon('survivor')}${camp.s.survivors} survivors in ${camp.beds()} beds${away ? ` · ${away} out on expeditions` : ''}. Rescue more on runs; some airdrops and expeditions bring people home too.</div>`;
}

// --- Expeditions ------------------------------------------------------------------------------

export function expeditionSection(camp) {
  const now = camp.now();
  const slots = camp.expeditionSlots();
  const active = camp.s.expeditions;
  let s = `<div class="sec"><div class="sec-h">Expeditions <small>${active.length}/${slots} out · ${camp.freeSurvivors()} survivors free</small></div>`;
  for (const e of active) {
    const t = EXPEDITIONS.find((x) => x.id === e.type);
    const back = e.end <= now;
    s +=
      `<div class="card${back ? ' ready' : ''}"><div class="card-h">${icon('truck')}<b>${esc(t.name)}</b><span class="crew">${icon('survivor')}${e.crew}</span></div>` +
      (back
        ? `<div class="card-sub">Back home with loot!</div><div class="btns">${btn('Collect', 'collectExp', { uid: e.uid }, 'primary')}</div>`
        : `<div class="card-sub">Back in ${countdown(e.end)}</div>${bar(e.start, e.end)}<div class="btns">${btn('Call back now', 'rushExp', { uid: e.uid }, 'gem', camp.rushExpeditionCost(e.uid))}</div>`) +
      `</div>`;
  }
  const full = active.length >= slots;
  for (const t of camp.expeditionTypes()) {
    const est = {};
    for (const r of RESOURCES) est[r] = Math.round(t.loot[r] * t.scale);
    let action;
    if (!t.unlocked) action = `<span class="lockl">${icon('lock')}Garage Lv ${t.garage}</span>`;
    else if (full) action = btn('Send', 'sendExp', { type: t.id }, 'disabled');
    else if (camp.freeSurvivors() < t.crew) action = `<span class="lockl">${icon('survivor')}Needs ${t.crew} free</span>`;
    else action = btn('Send', 'sendExp', { type: t.id }, 'primary');
    s +=
      `<div class="card opt${t.unlocked ? '' : ' off'}"><div class="card-h">${icon('map')}<b>${esc(t.name)}</b><span class="crew">${icon('survivor')}${t.crew}</span><span class="crew">${icon('clock')}${fmtDuration(t.time)}</span></div>` +
      `<div class="card-sub">${lootChips(est, { approx: true })}${t.gemChance > 0 ? `<span class="lc" style="--c:${RES_INFO.gems.color}">${icon('gems')}<b>${t.gemChance >= 1 ? '' : '?'}${t.gems[0]}-${t.gems[1]}</b></span>` : ''}${t.survivorChance > 0 ? `<span class="lc">${icon('survivor')}<b>${pct(t.survivorChance)}</b></span>` : ''}</div>` +
      `<div class="btns">${action}</div></div>`;
  }
  return `${s}</div>`;
}

export function expeditionsPanel(camp) {
  if (camp.level('garage') === 0) return null;
  return `<div class="list-panel"><div class="lp-head">${icon('truck')}<div><div class="kicker">Garage Lv ${camp.level('garage')}</div><h2>Expeditions</h2></div></div><div class="scroll">${expeditionSection(camp)}</div></div>`;
}

// --- Workshop ---------------------------------------------------------------------------------

function workshopSection(camp) {
  const slots = camp.craftSlots();
  let s = `<div class="sec"><div class="sec-h">Crafting <small>${camp.s.crafts.length}/${slots} slots</small></div>`;
  for (const c of camp.s.crafts) {
    const rcp = RECIPES.find((x) => x.id === c.recipe);
    s += `<div class="card"><div class="card-h">${icon(c.recipe)}<b>${esc(rcp.name)}</b><span class="crew">${countdown(c.end)}</span></div>${bar(c.start, c.end)}<div class="btns">${btn('Finish now', 'rushCraft', { uid: c.uid }, 'gem', camp.rushCraftCost(c.uid))}</div></div>`;
  }
  const full = camp.s.crafts.length >= slots;
  for (const r of camp.recipes()) {
    const missingGems = resGemCost(r.missing);
    let action;
    if (!r.unlocked) action = `<span class="lockl">${icon('lock')}Workshop Lv ${r.unlockLevel}</span>`;
    else if (full) action = btn('Craft', 'craft', { recipe: r.id }, 'disabled');
    else if (missingGems) action = btn('Buy & craft', 'craft', { recipe: r.id, with: 'gems' }, 'gem', missingGems);
    else action = btn('Craft', 'craft', { recipe: r.id }, 'primary');
    s +=
      `<div class="card opt${r.unlocked ? '' : ' off'}"><div class="card-h">${icon(r.id)}<b>${esc(r.name)}</b><span class="crew">${icon('power')}+${r.power}</span><span class="crew">In stock ${r.have}</span></div>` +
      `<div class="card-sub"><span class="cost">${costChips(r.cost, r.missing)}</span><span class="crew">${icon('clock')}${fmtDuration(r.time)}</span></div><div class="btns">${action}</div></div>`;
  }
  return `${s}</div>`;
}

// --- Rubble ----------------------------------------------------------------------------------------

export function rubblePanel(camp, area) {
  const def = RUBBLE[area];
  const r = camp.s.rubble[area];
  const info = camp.rubbleInfo(area);
  const frees = BUILDING_ORDER.filter((id) => BUILDINGS[id].area === area);
  let right = `<div class="bp-head"><div class="kicker">Camp expansion</div><h2>${esc(def.name)}</h2><p class="desc">${esc(def.desc)}</p></div>`;
  right += `<div class="sec"><div class="sec-h">Makes room for</div><div class="unlocks">${frees.map((id) => `<div class="ut">${buildingThumb(id, 1)}<span>${esc(BUILDINGS[id].name)}</span><small>Camp Lv ${BUILDINGS[id].unlockHq}</small></div>`).join('')}</div></div>`;
  let foot;
  if (r.done) foot = `<div class="maxed">${icon('check')}Cleared</div>`;
  else if (r.up) foot = progressBlock('Clearing', r.up, 'rushClear', { area }, camp.rushClearCost(area));
  else foot = upgradeBlock(camp, info, { act: 'clear', idKey: 'area', idVal: area, label: 'Clear', head: 'Clear the area' });
  const art = rubbleSvg(area);
  return `<div class="bp"><div class="bp-left"><div class="bp-art">${art.html}</div></div><div class="bp-right"><div class="bp-main scroll">${right}</div><div class="bp-foot">${foot}</div></div></div>`;
}

// --- Builders -----------------------------------------------------------------------------------

export function buildersPanel(camp) {
  const jobs = camp.jobs();
  const total = camp.builders();
  let s = '';
  for (const j of jobs) {
    const cost = j.kind === 'rubble' ? camp.rushClearCost(j.id) : camp.rushCost(j.id);
    const title = j.kind === 'rubble' ? `Clearing ${esc(j.name)}` : `${esc(j.name)} → Lv ${j.to}`;
    s += `<div class="card"><div class="card-h">${icon('hammer')}<b>${title}</b><span class="crew">${countdown(j.end)}</span></div>${bar(j.start, j.end)}<div class="btns">${btn('Open', 'goto', { id: j.id })}${btn('Finish now', j.kind === 'rubble' ? 'rushClear' : 'rush', j.kind === 'rubble' ? { area: j.id } : { id: j.id }, 'gem', cost)}</div></div>`;
  }
  for (let i = jobs.length; i < total; i++) s += `<div class="card idle"><div class="card-h">${icon('hammer')}<b>Builder ${i + 1} is free</b></div><div class="card-sub">Tap a building in the camp to put them to work.</div></div>`;
  const ready = BUILDING_ORDER.filter((id) => camp.upgradeInfo(id).canStart && camp.plotState(id) !== 'locked');
  if (ready.length && jobs.length < total) {
    s += `<div class="sec"><div class="sec-h">Ready to build</div><div class="unlocks">${ready
      .map((id) => `<button class="ut tap" type="button" data-act="goto" data-id="${id}">${buildingThumb(id, Math.max(1, camp.level(id)))}<span>${esc(BUILDINGS[id].name)}</span><small>${camp.level(id) ? `→ Lv ${camp.level(id) + 1}` : 'Build'}</small></button>`)
      .join('')}</div></div>`;
  }
  const nextBuilderLv = BUILDINGS.hq.levels.findIndex((r) => r.builders > total) + 1;
  if (nextBuilderLv > 0) s += `<div class="note">${icon('info')}Another builder joins at Command Post Lv ${nextBuilderLv}.</div>`;
  return `<div class="list-panel"><div class="lp-head">${icon('hammer')}<div><div class="kicker">${jobs.length}/${total} busy</div><h2>Builders</h2></div></div><div class="scroll">${s}</div></div>`;
}

// --- Survivors ------------------------------------------------------------------------------------

export function survivorsPanel(camp) {
  const away = camp.crewAway();
  const s =
    `<div class="stats"><div class="st"><span class="sl">Survivors</span><span class="sv">${camp.s.survivors}</span></div>` +
    `<div class="st"><span class="sl">Beds</span><span class="sv">${camp.beds()}</span></div>` +
    `<div class="st"><span class="sl">Out on expeditions</span><span class="sv">${away}</span></div>` +
    `<div class="st"><span class="sl">Rescued so far</span><span class="sv">${camp.s.stats.rescued}</span></div></div>` +
    `<div class="note">${icon('info')}Survivors crew expeditions, and the Command Post needs more of them to grow (Lv 4 needs 4). Find them on runs (the Radio Tower raises the odds), in some airdrops and on long expeditions. Each needs a bed: build up the Bunkhouse.</div>` +
    `<div class="btns">${btn('Go to the Bunkhouse', 'goto', { id: 'bunkhouse' })}${btn('Play a run', 'play', {}, 'primary')}</div>`;
  return `<div class="list-panel"><div class="lp-head">${icon('survivor')}<div><div class="kicker">Your people</div><h2>Survivors</h2></div></div><div class="scroll">${s}</div></div>`;
}

// --- Loadout: what the camp gives the next run ----------------------------------------------------

export function loadoutPanel(camp) {
  const l = camp.loadout();
  const arm = camp.row('armory');
  const inf = camp.row('infirmary');
  const gar = camp.row('garage');
  const rad = camp.row('radio');
  const rows = [
    ['Base survivor', '', POWER.base],
    ['Guns', l.weapons.map((w) => WEAPONS[w].name).join(', '), l.weapons.reduce((a, w) => a + WEAPONS[w].power, 0)],
    [`Armory${arm ? ` Lv ${camp.level('armory')}` : ''}`, arm ? `+${arm.dmg}% damage` : 'Not built', arm ? Math.round(arm.dmg * POWER.perDmg) : 0],
    [`Infirmary${inf ? ` Lv ${camp.level('infirmary')}` : ''}`, inf ? `${l.maxHp} max health, ${l.medkits} medkit${l.medkits === 1 ? '' : 's'}` : 'Not built', inf ? inf.hp * POWER.perHp + inf.medkits * POWER.medkit : 0],
    ['Workshop items', Object.keys(l.items).length ? Object.entries(l.items).map(([k, n]) => `${n}× ${RECIPES.find((r) => r.id === k).name}`).join(', ') : 'None packed', Object.entries(l.items).reduce((a, [k, n]) => a + RECIPES.find((r) => r.id === k).power * n, 0)],
  ];
  let s = `<div class="power-big">${icon('power')}<b>${l.power}</b><small>run power</small></div>`;
  s += `<div class="stats">${rows.map(([a, b, c]) => `<div class="st"><span class="sl">${a}</span><span class="sv dim">${b}</span><span class="sn">+${c}</span></div>`).join('')}</div>`;
  s += `<div class="stats"><div class="st"><span class="sl">Garage: extra loot</span><span class="sv">${gar ? `+${gar.loot}%` : '–'}</span></div><div class="st"><span class="sl">Radio: rescue chance</span><span class="sv">${rad ? `+${rad.rescue}%` : '–'}</span></div><div class="st"><span class="sl">Zones open</span><span class="sv">${camp.zones().filter((z) => z.unlocked).length}/${ZONES.length}</span></div></div>`;
  s += `<div class="note">${icon('info')}This is the <b>RunLoadout</b> the camp would hand the action game: <code>${esc(JSON.stringify({ maxHp: l.maxHp, damageMult: Number(l.damageMult.toFixed(2)), weapons: l.weapons, medkits: l.medkits, items: l.items, lootMult: Number(l.lootMult.toFixed(2)) }))}</code></div>`;
  return `<div class="list-panel"><div class="lp-head">${icon('power')}<div><div class="kicker">Camp → game</div><h2>Your next run</h2></div></div><div class="scroll">${s}</div></div>`;
}

// --- Deploy (PLAY) ----------------------------------------------------------------------------------

export function deployPanel(camp, ctx) {
  const zones = camp.zones();
  const sel = zones.find((z) => z.id === ctx.zone && z.unlocked) || zones[0];
  const pack = ctx.pack;
  const l = camp.loadout(pack);
  const first = camp.s.stats.runs === 0 && camp.tuning.outcome === 'auto'; // the first run always makes it
  const chance = first ? 1 : winChance(l.power, sel.rec);
  const risk = riskLabel(chance);
  const list = zones
    .map((z) => {
      const c = z.unlocked ? (first ? 1 : winChance(l.power, z.rec)) : 0;
      const rl = riskLabel(c);
      return (
        `<button class="zone${z.id === sel.id ? ' sel' : ''}${z.unlocked ? '' : ' off'}" type="button" data-act="${z.unlocked ? 'zone' : 'zoneLocked'}" data-id="${z.id}">` +
        `<span class="zn">${esc(z.name)}</span>` +
        (z.unlocked ? `<span class="zr tone-${rl.tone}">${rl.text}</span>` : `<span class="zr">${icon('lock')}Radio Lv ${z.radio}</span>`) +
        (z.unlocked && !z.cleared ? `<span class="zf">${icon('gems')}${z.firstGems}</span>` : '') +
        `</button>`
      );
    })
    .join('');

  const est = {};
  for (const r of RESOURCES) est[r] = Math.round(sel.loot[r] * l.lootMult * camp.tuning.loot);
  const weaponIcons = l.weapons.map((w) => `<span class="ldi wpn">${icon(w)}<b>${esc(WEAPONS[w].name)}</b></span>`).join('');
  const items = camp
    .recipes()
    .filter((r) => r.have > 0)
    .map((r) => {
      const on = (pack ? pack[r.id] || 0 : CARRY_PER_ITEM) > 0;
      return `<button class="pack${on ? ' on' : ''}" type="button" data-act="pack" data-id="${r.id}">${icon(r.id)}<b>${r.have}</b><small>+${r.power}</small></button>`;
    })
    .join('');
  const outcome = camp.tuning.outcome;
  const seg = ['auto', 'win', 'lose'].map((o) => `<button class="seg${outcome === o ? ' on' : ''}" type="button" data-act="outcome" data-v="${o}">${o === 'auto' ? 'By power' : o === 'win' ? 'Always survive' : 'Always die'}</button>`).join('');

  const right =
    `<div class="kicker">Simulated run · the action game plugs in here</div><h2>${esc(sel.name)}</h2><p class="desc">${esc(sel.desc)}</p>` +
    `<div class="odds"><span>${icon('power')}<b>${l.power}</b><small>your power</small></span><span class="vs">vs</span><span><b>${sel.rec}</b><small>recommended</small></span><span class="risk tone-${risk.tone}">${risk.text}<small>${Math.round(chance * 100)}% to survive</small></span></div>` +
    `<div class="row-l"><span class="rl">If you survive</span>${lootChips(est, { approx: true })}${!sel.cleared ? `<span class="lc" style="--c:${RES_INFO.gems.color}">${icon('gems')}<b>+${sel.firstGems}</b><small>first time</small></span>` : ''}<span class="lc">${icon('survivor')}<b>${pct(Math.min(1, sel.rescue + l.rescueBonus))}</b></span></div>` +
    `<div class="row-l"><span class="rl">Loadout</span>${weaponIcons}<span class="ldi">${icon('hp')}<b>${l.maxHp}</b></span>${l.damageMult > 1 ? `<span class="ldi">${icon('dmg')}<b>+${Math.round((l.damageMult - 1) * 100)}%</b></span>` : ''}${l.medkits ? `<span class="ldi">${icon('medkit')}<b>${l.medkits}</b></span>` : ''}${items}</div>` +
    `<div class="row-l seg-row"><span class="rl">Outcome</span>${seg}</div>`;
  const foot = `<div class="btns">${btn(`${icon('play')} Start run`, 'startRun', { zone: sel.id }, 'primary big')}<span class="hint">${camp.tuning.runTime ? `~${fmtDuration(sel.duration)} of camp time passes while you are out` : 'No camp time passes'}</span></div>`;
  return `<div class="deploy"><div class="zones scroll">${list}</div><div class="bp-right"><div class="zone-detail bp-main scroll">${right}</div><div class="bp-foot">${foot}</div></div></div>`;
}

// --- Results --------------------------------------------------------------------------------------

export function resultsPanel(camp, r) {
  const g = r.granted;
  const zone = ZONES.find((z) => z.id === r.zone);
  const notes = [];
  if (r.firstClear) notes.push(`${icon('gems')}First time surviving ${esc(zone.name)}: +${zone.firstGems} gems`);
  if (r.loadout.lootMult > 1) notes.push(`${icon('truck')}Garage truck: +${Math.round((r.loadout.lootMult - 1) * 100)}% loot`);
  if (g.survivors) notes.push(`${icon('survivor')}A survivor joined the camp!`);
  if (g.survivorsLost) notes.push(`${icon('survivor')}You found a survivor, but there was no bed for them. Upgrade the Bunkhouse.`);
  const used = Object.entries(r.itemsUsed || {});
  if (used.length) notes.push(`${icon('medkit')}Used ${used.map(([k, n]) => `${n}× ${RECIPES.find((x) => x.id === k).name}`).join(', ')}`);
  if (!r.won) notes.push(`${icon('info')}You kept ${Math.round((0.2 + 0.5 * r.progress) * 100)}% of what you found. Upgrade the Armory and Infirmary for more run power.`);
  return (
    `<div class="results ${r.won ? 'won' : 'lost'}">` +
    `<div class="res-title">${r.won ? 'SURVIVED' : 'YOU DIED'}</div>` +
    `<div class="res-sub">${esc(zone.name)} · ${fmtTime(r.timeS)} · ${r.kills} kills · ${Math.round(r.progress * 100)}% of the route</div>` +
    `<div class="res-loot">${lootChips({ ...g, survivors: g.survivors }, { big: true }) || '<span class="dim">Nothing this time</span>'}</div>` +
    (notes.length ? `<div class="res-notes">${notes.map((n) => `<div>${n}</div>`).join('')}</div>` : '') +
    `<div class="btns">${btn('Collect', 'collectRun', {}, 'primary big')}${btn(`${icon('play')} Run again`, 'runAgain', { zone: r.zone }, 'big')}</div>` +
    `</div>`
  );
}

// --- Wait rewards ------------------------------------------------------------------------------------

export function rewardPanel(camp, kind, opened) {
  const def = REWARDS[kind];
  const info = camp.rewardInfo(kind);
  const scale = REWARD_SCALE[camp.hq] || 1;
  if (opened) {
    return (
      `<div class="reward-open ${kind}"><div class="ro-art">${icon(kind === 'short' ? 'crate' : 'airdrop')}</div>` +
      `<div class="kicker">${kind === 'short' ? 'Supply crate opened' : 'Airdrop recovered'}</div><h2>${esc(def.name)}</h2>` +
      `<div class="res-loot">${lootChips(opened, { big: true })}</div>` +
      (opened.survivorsLost ? `<div class="note">${icon('survivor')}A survivor came with it, but there was no bed. Upgrade the Bunkhouse.</div>` : '') +
      `<div class="btns">${btn('Collect', 'collectReward', { kind }, 'primary big')}</div></div>`
    );
  }
  const est = {};
  for (const r of RESOURCES) est[r] = Math.round(def.loot[r] * scale);
  let s =
    `<div class="reward-open ${kind} waiting"><div class="ro-art">${icon(kind === 'short' ? 'crate' : 'airdrop')}</div>` +
    `<div class="kicker">${kind === 'short' ? 'Every ' + fmtDuration(camp.rewardInterval(kind)) : 'Every ' + fmtDuration(camp.rewardInterval(kind))}</div><h2>${esc(def.name)}</h2><p class="desc">${esc(def.desc)}</p>` +
    `<div class="row-l"><span class="rl">Usually</span>${lootChips(est, { approx: true })}${def.gemChance > 0 ? `<span class="lc" style="--c:${RES_INFO.gems.color}">${icon('gems')}<b>${def.gems[0]}-${def.gems[1]}</b></span>` : ''}${def.survivorChance ? `<span class="lc">${icon('survivor')}<b>${pct(def.survivorChance)}</b></span>` : ''}</div>`;
  if (info.ready) s += `<div class="btns">${btn('Open', 'claimReward', { kind }, 'primary big')}</div>`;
  else {
    s += `<div class="ro-timer">${icon('clock')}Ready in ${countdown(camp.s.rewards[kind].readyAt)}</div>`;
    if (def.skippable) s += `<div class="btns">${btn('Open now', 'rushReward', { kind }, 'gem', info.rushCost)}</div>`;
    else s += `<div class="note">${icon('info')}Grows with your Command Post level. It doesn't stack: open it when it's ready.</div>`;
  }
  return `${s}</div>`;
}

// --- Level up / welcome back -----------------------------------------------------------------------

export function levelUpPanel(level, unlocks) {
  return (
    `<div class="levelup"><div class="lu-burst"></div><div class="kicker">Command Post upgraded</div><div class="lu-title">CAMP LEVEL ${level}</div>` +
    (unlocks.length ? `<div class="unlocks">${unlocks.map(unlockTile).join('')}</div>` : '') +
    `<div class="btns">${btn('Continue', 'close', {}, 'primary big')}</div></div>`
  );
}

export function welcomePanel(camp, sum) {
  const items = [];
  for (const e of sum.events) {
    if (e.type === 'built') items.push(`${icon('hammer')}${esc(BUILDINGS[e.id].name)} ${e.first ? 'built' : `upgraded to Lv ${e.level}`}`);
    else if (e.type === 'cleared') items.push(`${icon('hammer')}${esc(RUBBLE[e.area].name)} cleared`);
    else if (e.type === 'crafted') items.push(`${icon(e.recipe)}${esc(e.name)} crafted`);
    else if (e.type === 'expeditionBack') items.push(`${icon('truck')}${esc(EXPEDITIONS.find((x) => x.id === e.kind).name)} is back`);
  }
  for (const kind of ['short', 'long']) if (camp.rewardInfo(kind).ready) items.push(`${icon(kind === 'short' ? 'crate' : 'airdrop')}${REWARDS[kind].name} is ready`);
  const waiting = {};
  let any = false;
  for (const id of BUILDING_ORDER) {
    if (BUILDINGS[id].kind !== 'producer') continue;
    const p = Math.floor(camp.pending(id));
    if (p > 0) {
      waiting[BUILDINGS[id].produces] = (waiting[BUILDINGS[id].produces] || 0) + p;
      any = true;
    }
  }
  return (
    `<div class="welcome"><div class="kicker">While you were away</div><h2>Welcome back</h2><p class="desc">You were gone for <b>${fmtTime(sum.awayMs / 1000)}</b>. The camp kept working.</p>` +
    (any ? `<div class="row-l"><span class="rl">Ready to collect</span>${lootChips(waiting)}</div>` : '') +
    (items.length ? `<div class="wl">${items.map((x) => `<div>${x}</div>`).join('')}</div>` : '') +
    `<div class="btns">${any ? btn('Collect all', 'collectAll', {}, 'primary big') : ''}${btn('Continue', 'close', {}, any ? 'big' : 'primary big')}</div></div>`
  );
}
