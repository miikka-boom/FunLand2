// Screen renderers: (meta, ...) -> HTML. Buttons carry data-act; main.js
// handles them. Everything says plainly what a tap will do, and anything
// you can't do yet says why.

import { CAMPAIGNS, CHAPTER_TYPES, SURVIVORS, SURVIVOR_ORDER, WEAPONS, WEAPON_ORDER, MAX_LEVEL, STAR_MULT, FIRST_CLEAR_BONUS, COOP_BONUS, REWARDS, TOTAL_CHAPTERS } from './config.js';
import { portraitSvg, gunSvg } from './art.js';
import { icon } from './icons.js';
import { fmtNum, fmtTime } from './format.js';
import { esc } from './ui.js';

export const sup = (n, cls = '') => `<span class="cur sup ${cls}">${icon('supplies')}<b>${fmtNum(n)}</b></span>`;
export const gem = (n, cls = '') => `<span class="cur gem ${cls}">${icon('gems')}<b>${fmtNum(n)}</b></span>`;
const starsHtml = (n, cls = '') => `<span class="stars3 ${cls}">${[1, 2, 3].map((k) => icon(k <= n ? 'star' : 'starEmpty')).join('')}</span>`;

function btn(label, act, data = {}, cls = '') {
  const attrs = Object.entries(data)
    .map(([k, v]) => ` data-${k}="${esc(v)}"`)
    .join('');
  return `<button class="btn ${cls}" type="button" data-act="${act}"${attrs}>${label}</button>`;
}

function unlockName(u) {
  if (!u) return '';
  if (u.weapon) return WEAPONS[u.weapon].name;
  if (u.survivor) return `${SURVIVORS[u.survivor].name} (${SURVIVORS[u.survivor].role})`;
  return 'The evac chopper';
}

function unlockIcon(u) {
  if (!u) return '';
  if (u.weapon) return `<span class="u-art gunr">${gunSvg(u.weapon)}</span>`;
  if (u.survivor) return `<span class="u-art face">${portraitSvg(u.survivor)}</span>`;
  return `<span class="u-art">${icon('heli')}</span>`;
}

// --- Briefing ------------------------------------------------------------------------------------

export function briefing(meta, i, ctx) {
  const ch = meta.chapter(i);
  const t = CHAPTER_TYPES[ch.type];
  const o = meta.oddsFor(i);
  const p = meta.power();
  const squad = p.squad;
  const friends = ctx.friends || 0;
  const k = i % 5;
  const loot = meta.lootBonus();
  const mult = (1 + loot) * (1 + COOP_BONUS * friends);
  const est = (stars) => Math.round(ch.supplies * STAR_MULT[stars] * mult);

  // Squad: you, then bots; friends replace bots/empties from the end.
  const slots = [];
  for (let s = 0; s < 4; s++) {
    const id = squad[s];
    const isFriend = s >= 4 - friends;
    if (s === 0) slots.push(`<div class="slot you">${portraitSvg(id)}<b>${SURVIVORS[id].name}</b><small>You</small></div>`);
    else if (isFriend) slots.push(`<div class="slot friend"><span class="ph">${icon('survivor')}</span><b>Friend</b><small>Co-op</small></div>`);
    else if (id) slots.push(`<div class="slot bot">${portraitSvg(id)}<b>${SURVIVORS[id].name}</b><small>Bot · Lv ${meta.s.survivors[id]}</small></div>`);
    else slots.push(`<div class="slot empty"><span class="ph">?</span><b>Empty</b><small>Rescue more</small></div>`);
  }
  const mains = meta.rescued().map((id) => `<button class="chip${id === meta.s.main ? ' on' : ''}" type="button" data-act="pickMain" data-id="${id}">${portraitSvg(id)}<span>${SURVIVORS[id].name}</span></button>`).join('');
  const guns = meta.found().map((id) => `<button class="chip gunc${id === meta.s.weapon ? ' on' : ''}" type="button" data-act="pickGun" data-id="${id}">${gunSvg(id)}<span>${WEAPONS[id].name} <em>${meta.s.weapons[id]}</em></span></button>`).join('');

  const firstClear = ch.state !== 'done';
  let rewards = `<div class="rw-row"><span class="rl">Supplies</span>${[1, 2, 3].map((s) => `<span class="rw">${starsHtml(s, 'mini')}${sup(est(s))}</span>`).join('')}</div>`;
  if (firstClear) {
    rewards += `<div class="rw-row first"><span class="rl">First clear</span>${sup(Math.round(ch.supplies * FIRST_CLEAR_BONUS))}${ch.gems ? gem(ch.gems) : ''}${ch.unlock ? `<span class="rw-unlock">${unlockIcon(ch.unlock)}<b>${esc(unlockName(ch.unlock))}</b></span>` : ''}</div>`;
  }

  const advice = o.chance < 0.55 && meta.bestUpgrade();
  const body =
    `<div class="kicker">${esc(ch.campaign.name)} · ${ch.finale ? 'Finale' : `Chapter ${k + 1} of 4`}${ch.state === 'done' ? ' · replay' : ''}</div>` +
    `<h2>${esc(ch.name)}</h2><p class="desc">${esc(ch.def.text)}</p>` +
    `<div class="goalline">${icon(t.icon)}<b>${t.label}:</b> ${t.goal}</div>` +
    `<div class="odds tone-${o.risk.tone}"><span class="pw">${icon('power')}<b>${p.total}</b><small>your power</small></span><span class="vs">vs</span><span class="pw"><b>${ch.rec}</b><small>needed</small></span><span class="risk"><b>${o.risk.label}</b><small>${Math.round(o.chance * 100)}% to survive</small></span></div>` +
    rewards +
    (meta.rescued().length > 1 || friends > 0
      ? `<div class="sec-h">Squad <button class="mini-btn" type="button" data-act="friends">${icon('squad')} Co-op friends: ${friends}/3 <small>(simulated, +10% each)</small></button></div><div class="slots">${slots.join('')}</div>`
      : `<div class="sec-h">Squad <button class="mini-btn" type="button" data-act="friends">${icon('squad')} Co-op friends: ${friends}/3 <small>(simulated)</small></button></div>`) +
    (meta.rescued().length > 1 ? `<div class="sec-h">Play as</div><div class="chips">${mains}</div>` : '') +
    (meta.found().length > 1 ? `<div class="sec-h">Gun</div><div class="chips">${guns}</div>` : '');
  // The footer always says what would help most, with a button for it.
  const a = meta.advice();
  let hint;
  let extra = '';
  if (advice) {
    const name = advice.kind === 'survivor' ? SURVIVORS[advice.id].name : WEAPONS[advice.id].name;
    hint = `Tough one. Upgrade ${esc(name)}: +${advice.gain} power.`;
    extra = btn(`${icon('up')} Upgrade first`, 'upgrades', {}, 'ghost');
  } else if (a.kind === 'replay' && i === meta.playTarget() && a.i !== i) {
    hint = 'Too tough for now. Farm supplies on a stop you know.';
    extra = btn(`${icon('play')} ${esc(meta.chapter(a.i).name)}`, 'retry', { i: a.i }, 'ghost');
  } else if (o.chance < 0.55) {
    const nu = meta.nextUpgrade();
    hint = nu && nu.missing > 0 ? `Tough one. Next upgrade in ${nu.missing} supplies.` : 'Tough one. Bring friends?';
  } else {
    hint = ch.state === 'done' ? `Best: ${'★'.repeat(ch.stars)}${'☆'.repeat(3 - ch.stars)}` : 'Clear it to move the van on.';
  }
  const foot = extra + btn(`${icon('play')} ${ch.state === 'done' ? 'Replay' : 'Start'}`, 'start', { i }, 'primary big');
  return `<div class="brief"><div class="b-main scroll">${body}</div><div class="b-foot"><span class="hint">${hint}</span>${foot}</div></div>`;
}

// --- Results -------------------------------------------------------------------------------------

function lostButtons(meta, a, i) {
  const retry = (primary) => btn('Retry', 'retry', { i }, primary ? 'primary' : '');
  const back = btn('Back to the road', 'close');
  if (meta.bestUpgrade()) return btn(`${icon('up')} Upgrade`, 'upgrades', {}, 'primary') + retry(false) + back;
  if (a.kind === 'replay' && a.i !== i) return retry(false) + btn(`${icon('play')} ${esc(meta.chapter(a.i).name)}`, 'retry', { i: a.i }, 'primary') + back;
  return retry(true) + back;
}

export function results(meta, result, out) {
  const ch = meta.chapter(result.index);
  if (!out.won) {
    const p = meta.power().total;
    const a = meta.advice();
    let line;
    if (a.kind === 'upgrade' || a.kind === 'replay') {
      line = `<b>${esc(a.text)}</b>.`;
    } else {
      const nu = meta.nextUpgrade();
      const retry = `Retry: ${Math.round(meta.oddsFor(result.index).chance * 100)}% to survive.`;
      line = nu && nu.missing > 0 ? `Next upgrade in <b>${nu.missing}</b> supplies. ${retry}` : retry;
    }
    const tip = `<div class="tip">${icon('info')}<span>Power ${p} vs ${ch.rec} needed. ${line}</span></div>`;
    return (
      `<div class="res lost"><div class="kicker">${esc(ch.label)}</div><div class="r-title">YOU DIED</div>` +
      `<div class="r-sub">${esc(ch.name)} · made it ${Math.round(result.progress * 100)}% of the way · ${result.kills} kills</div>` +
      `<div class="r-total">${sup(out.supplies, 'big')}<small>kept</small></div>${tip}` +
      `<div class="btns">${lostButtons(meta, a, result.index)}</div></div>`
    );
  }
  const lines = out.lines.map((l, k) => `<div class="r-line" style="--d:${0.5 + k * 0.18}s"><span>${esc(l.label)}</span>${sup(l.value)}</div>`).join('');
  const news = out.unlocks
    .map((u) => `<div class="r-new">${u.kind === 'weapon' ? icon(WEAPONS[u.id].game || 'smg') : u.kind === 'survivor' ? icon('survivor') : icon('heli')}<span>New: <b>${u.kind === 'weapon' ? WEAPONS[u.id].name : u.kind === 'survivor' ? SURVIVORS[u.id].name : 'Evac'}</b></span></div>`)
    .join('');
  return (
    `<div class="res won"><div class="kicker">${esc(ch.label)}${out.firstClear ? ' · first clear' : ''}</div>` +
    `<div class="r-title">${ch.finale ? 'FINALE CLEARED' : 'SAFE ROOM'}</div>` +
    `<div class="r-stars">${[1, 2, 3].map((k) => `<i class="${k <= result.stars ? 'on' : ''}" style="--d:${0.15 + k * 0.22}s">${icon(k <= result.stars ? 'star' : 'starEmpty')}</i>`).join('')}</div>` +
    `<div class="r-sub">${esc(ch.name)} · ${result.kills} kills · ${fmtTime(result.timeS)}${result.incaps ? ` · ${result.incaps} down` : ' · nobody went down'}${result.revived ? ' · revived' : ''}</div>` +
    `<div class="r-lines">${lines}</div>` +
    `<div class="r-total">${sup(out.supplies, 'big')}${out.gems ? gem(out.gems, 'big') : ''}</div>${news}` +
    (out.mastery ? `<div class="r-new">${icon('trophy')}<span>${esc(out.mastery.campaign)} mastered: <b>3 stars everywhere</b></span></div>` : '') +
    // A first clear drives the van on and may reveal unlocks: Continue only, so nothing gets skipped.
    `<div class="btns">${out.advanced || out.unlocks.length ? '' : btn('Replay', 'retry', { i: result.index })}${btn(`Continue ${icon('arrow')}`, 'close', {}, 'primary big')}</div></div>`
  );
}

// --- Upgrades ------------------------------------------------------------------------------------

function pips(level) {
  let s = '';
  for (let k = 1; k <= MAX_LEVEL; k++) s += `<i class="${k <= level ? 'on' : ''}"></i>`;
  return `<span class="pips">${s}</span>`;
}

function where(kind, id) {
  for (const [ci, c] of CAMPAIGNS.entries()) {
    for (const ch of c.chapters) {
      const u = ch.unlock || {};
      if ((kind === 'weapon' && u.weapon === id) || (kind === 'survivor' && u.survivor === id)) return `${ch.name} (${c.name}${ch.type === 'finale' ? ' finale' : ''})`;
    }
    void ci;
  }
  return '';
}

function upButton(meta, kind, id) {
  const cost = meta.upgradeCost(kind, id);
  if (cost === null) return `<div class="maxed">${icon('star')} Max level</div>`;
  if (meta.s.supplies >= cost) return btn(`${icon('up')}<span>Upgrade</span>${sup(cost)}`, 'up', { kind, id }, 'primary up');
  return `<div class="need">${sup(cost)}<small>Need ${fmtNum(cost - meta.s.supplies)} more</small></div>`;
}

/** The advice line on the upgrade screen; when the best upgrade is on the other tab it takes you there. */
function tipHtml(tip, tab) {
  if (tip.kind === 'upgrade') {
    const other = tip.item.kind === 'weapon' ? 'guns' : 'survivors';
    if (other !== tab) return `<button class="u-tip go" type="button" data-act="tab" data-id="${other}">${icon('up')} ${esc(tip.text)} ${icon('arrow')}</button>`;
    return `<span class="u-tip">${icon('up')} ${esc(tip.text)}</span>`;
  }
  if (tip.kind === 'play') return `<span class="u-tip">${icon('play')} Ready: ${esc(tip.text)}</span>`;
  return `<span class="u-tip">${esc(tip.text)}</span>`;
}

export function upgrades(meta, tab) {
  const best = meta.advice().kind === 'upgrade' ? meta.advice().item : meta.bestUpgrade();
  const p = meta.power();
  // Each tab counts the upgrades you can afford right now.
  const can = meta.affordable().filter((u) => u.gain > 0);
  const count = { survivors: can.filter((u) => u.kind === 'survivor').length, guns: can.filter((u) => u.kind === 'weapon').length };
  const tabs = ['survivors', 'guns']
    .map((t) => `<button class="tab${tab === t ? ' on' : ''}" type="button" data-act="tab" data-id="${t}">${t === 'survivors' ? `${icon('squad')} Squad` : `${icon('smg')} Guns`}${count[t] ? `<span class="t-n">${count[t]}</span>` : ''}</button>`)
    .join('');
  let cards = '';
  if (tab === 'survivors') {
    for (const id of SURVIVOR_ORDER) {
      const d = SURVIVORS[id];
      const lvl = meta.s.survivors[id];
      if (lvl <= 0) {
        cards += `<div class="card locked"><div class="c-art sil">${portraitSvg(id)}</div><div class="c-name">${d.name}<small>${d.role}</small></div><div class="c-lock">${icon('lock')}<span>Rescue at <b>${esc(where('survivor', id))}</b></span></div><div class="c-perk">${d.perk} +${d.perkPer}%/level</div></div>`;
        continue;
      }
      const isMain = id === meta.s.main;
      const inSquad = p.squad.includes(id);
      const now = meta.survivorPower(id, isMain);
      const nxt = lvl < MAX_LEVEL ? meta.survivorPower(id, isMain, lvl + 1) : null;
      const isBest = best && best.kind === 'survivor' && best.id === id;
      cards +=
        `<div class="card${isMain ? ' main' : ''}${isBest ? ' best' : ''}">${isBest ? '<span class="ribbon">BEST</span>' : ''}<div class="c-art">${portraitSvg(id)}</div>` +
        `<div class="c-name">${d.name}<small>${d.role}${isMain ? ' · you' : inSquad ? ' · in squad' : ' · reserve'}</small></div>` +
        `<div class="c-lv">Lv ${lvl}${pips(lvl)}</div>` +
        `<div class="c-stat">${icon('power')}<b>${inSquad ? `+${now}` : '—'}</b>${nxt !== null && inSquad ? `<span class="nx">→ +${nxt}</span>` : ''}<small>${isMain ? 'as you' : inSquad ? 'as bot' : 'not in squad'}</small></div>` +
        `<div class="c-perk">${d.perk} <b>+${d.perkPer * lvl}%</b>${lvl < MAX_LEVEL ? `<span class="nx">→ +${d.perkPer * (lvl + 1)}%</span>` : ''}</div>` +
        `${upButton(meta, 'survivor', id)}` +
        `${isMain ? '<span class="sel-on">✓ You</span>' : btn('Play as', 'pickMain', { id }, 'sel')}</div>`;
    }
  } else {
    for (const id of WEAPON_ORDER) {
      const d = WEAPONS[id];
      const lvl = meta.s.weapons[id];
      if (lvl <= 0) {
        cards += `<div class="card locked gunc"><div class="c-art sil">${gunSvg(id)}</div><div class="c-name">${d.name}<small>${d.game ? 'Not found yet' : 'Proposed gun'}</small></div><div class="c-lock">${icon('lock')}<span>Found at <b>${esc(where('weapon', id))}</b></span></div><div class="c-perk">${esc(d.blurb)}</div></div>`;
        continue;
      }
      const eq = id === meta.s.weapon;
      const isBest = best && best.kind === 'weapon' && best.id === id;
      const now = meta.weaponPower(id);
      cards +=
        `<div class="card gunc${eq ? ' main' : ''}${isBest ? ' best' : ''}">${isBest ? '<span class="ribbon">BEST</span>' : ''}<div class="c-art">${gunSvg(id)}</div>` +
        `<div class="c-name">${d.name}<small>${eq ? 'equipped' : 'in reserve'}${d.game ? '' : ' · proposed'}</small></div>` +
        `<div class="c-lv">Lv ${lvl}${pips(lvl)}</div>` +
        `<div class="c-stat">${icon('power')}<b>+${now}</b>${lvl < MAX_LEVEL ? `<span class="nx">→ +${meta.weaponPower(id, lvl + 1)}</span>` : ''}<small>${eq ? 'equipped' : 'if equipped'}</small></div>` +
        `<div class="c-perk">${esc(d.blurb)}</div>` +
        `${upButton(meta, 'weapon', id)}` +
        `${eq ? '<span class="sel-on">✓ Equipped</span>' : btn('Equip', 'pickGun', { id }, 'sel')}</div>`;
    }
  }
  const tip = meta.advice();
  return (
    `<div class="upg"><div class="u-head"><div><div class="kicker">Spend supplies, get stronger. Instantly.</div><h2>Squad & Guns</h2></div>` +
    `<div class="u-cur">${icon('power')}<b class="pw">${p.total}</b><small>power</small>${sup(meta.s.supplies, 'big')}</div></div>` +
    `<div class="tabs">${tabs}${tipHtml(tip, tab)}</div>` +
    `<div class="cards scroll">${cards}</div></div>`
  );
}

// --- Reveals --------------------------------------------------------------------------------------

export function reveal(meta, u, extra = {}) {
  if (u.kind === 'weapon') {
    const d = WEAPONS[u.id];
    const gain = meta.weaponPower(u.id) - meta.weaponPower(meta.s.weapon);
    return (
      `<div class="reveal"><div class="rv-burst"></div><div class="kicker">New gun</div><div class="rv-art gunr">${gunSvg(u.id)}</div><h1>${d.name}</h1>` +
      `<p class="desc">${esc(d.blurb)} Arrives at level ${u.level}, like your best gun.</p>` +
      `<div class="btns">${gain > 0 ? btn(`Equip · +${gain} power`, 'equipNew', { id: u.id }, 'primary big') : btn('Equip', 'equipNew', { id: u.id }, 'primary big')}${btn('Later', 'close')}</div></div>`
    );
  }
  if (u.kind === 'survivor') {
    const d = SURVIVORS[u.id];
    return (
      `<div class="reveal"><div class="rv-burst"></div><div class="kicker">Survivor rescued</div><div class="rv-art face">${portraitSvg(u.id)}</div><h1>${d.name}</h1>` +
      `<p class="desc"><b>${d.role}.</b> ${esc(d.bio)}</p><div class="perkline">${icon('squad')} Joins your squad: <b>${d.perk} +${d.perkPer}%</b> per level</div>` +
      `<div class="btns">${btn('Continue', 'close', {}, 'primary big')}</div></div>`
    );
  }
  if (u.kind === 'district') {
    const c = CAMPAIGNS[u.ci];
    const next = CAMPAIGNS[u.ci + 1];
    const p = meta.campaignProgress(u.ci);
    return (
      `<div class="reveal"><div class="rv-burst green"></div><div class="kicker">District reclaimed</div><h1>${esc(c.name).toUpperCase()}</h1>` +
      `<div class="r-stars big">${starsHtml(Math.round(p.stars / 5))}</div><p class="desc">${p.stars}/${p.maxStars} stars. ${p.stars < p.maxStars ? 'Get 3 stars on every stop here for a mastery bonus.' : ''}</p>` +
      (next ? `<p class="next">${icon('arrow')} Next: <b>${esc(next.name)}</b>. ${esc(next.blurb)}</p>` : '') +
      `<div class="btns">${btn('Drive on', 'close', {}, 'primary big')}</div></div>`
    );
  }
  if (u.kind === 'evac') {
    const st = meta.s.stats;
    return (
      `<div class="reveal"><div class="rv-burst green"></div><div class="kicker">The chopper made it</div><h1>YOU MADE IT</h1>` +
      `<p class="desc">${st.runs} runs, ${fmtNum(st.kills)} infected, ${meta.s.stars.reduce((a, b) => a + b, 0)}/${TOTAL_CHAPTERS * 3} stars.</p>` +
      `<p class="next">Keep going: 3 stars on every stop of a district pays a mastery bonus.</p><div class="btns">${btn('Keep playing', 'close', {}, 'primary big')}</div></div>`
    );
  }
  return '';
}

// --- Wait rewards ----------------------------------------------------------------------------------

export function reward(meta, kind, opened) {
  const def = REWARDS[kind];
  const ic = icon(kind === 'short' ? 'crate' : 'airdrop');
  if (opened) {
    return (
      `<div class="reward-open ${kind}"><div class="ro-art">${ic}</div><div class="kicker">${kind === 'short' ? 'Crate opened' : 'Airdrop recovered'}</div><h2>${def.name}</h2>` +
      `<div class="r-total">${sup(opened.supplies, 'big')}${opened.gems ? gem(opened.gems, 'big') : ''}</div>` +
      `<div class="btns">${btn('Collect', 'close', {}, 'primary big')}</div></div>`
    );
  }
  const info = meta.rewardInfo(kind);
  const est = meta.rewardValue(kind);
  let s =
    `<div class="reward-open ${kind} waiting"><div class="ro-art">${ic}</div><div class="kicker">Every ${kind === 'short' ? `${meta.tuning.shortMinutes} min` : `${meta.tuning.longHours} h`}</div><h2>${def.name}</h2>` +
    `<p class="desc">About ${sup(Math.round(est))}${kind === 'long' ? ` and ${gem(def.gems[0])}–${def.gems[1]} gems` : ''}. Grows as you go down the road.</p>` +
    `<div class="ro-timer">${icon('clock')}Ready in <span class="cd" data-end="${meta.s.rewards[kind].readyAt}"></span></div>`;
  if (kind === 'long') s += `<div class="btns">${btn(`Open now ${gem(info.rushCost)}`, 'rushAsk', { kind }, 'gem')}</div>`;
  return `${s}</div>`;
}

export function confirmGems(text, gems, act, data = {}) {
  return (
    `<div class="confirm"><h2>${esc(text)}</h2><p class="desc">This spends ${gem(gems)}.</p>` +
    `<div class="btns">${btn('Cancel', 'close')}${btn(`Yes, spend ${gem(gems)}`, act, data, 'gem big')}</div></div>`
  );
}

export function intro() {
  return (
    `<div class="intro"><div class="kicker">FUNLAND2 · METAGAME PROTOTYPE 2</div><h1>ROAD TO EVAC</h1>` +
    `<p>The city fell overnight. An evac chopper is waiting at the military base, five districts away. Get your squad there.</p>` +
    `<div class="intro-steps"><div>${icon('play')}<b>Play the next stop</b><span>Each run is a chapter. Clear it and the van drives on.</span></div>` +
    `<div>${icon('up')}<b>Upgrade instantly</b><span>Spend supplies on your squad and guns. No waiting.</span></div>` +
    `<div>${icon('survivor')}<b>Rescue survivors</b><span>Every finale frees someone. They join your squad.</span></div></div>` +
    `<div class="btns">${btn('Start', 'close', {}, 'primary big')}</div><p class="hint">Runs are simulated here. The gear (top right) has testing tools.</p></div>`
  );
}
