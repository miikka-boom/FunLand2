// HTML for the layers: a station sheet, mission results, the rescue scene,
// the intro and the testing tools. Pure string builders; main.js wires the
// [data-act] buttons to the Safehouse.

import { STATIONS, ITEMS, SURVIVORS, SURVIVOR_ORDER, CHAPTERS, MISSIONS, CRATE_MAX, STRENGTH_PER_LEVEL } from './config.js';
import { INTRO, RESCUES, LINES } from './story.js';
import { icon } from './icons.js';
import { faceHtml } from './view.js';
import { fmtDuration, fmtTime } from './format.js';
import { esc, liveBar } from './ui.js';

const KIND = { workshop: 'throw', infirmary: 'heal' };

function btn(label, act, data = {}, { disabled = false, why = '', cls = '', sub = '' } = {}) {
  const attrs = Object.entries(data)
    .map(([k, v]) => ` data-${k}="${esc(v)}"`)
    .join('');
  return (
    `<button class="btn ${cls}${disabled ? ' disabled' : ''}" type="button" data-act="${act}"${attrs}${why ? ` data-why="${esc(why)}"` : ''}>` +
    `<span class="lbl">${label}</span>${sub ? `<small>${sub}</small>` : ''}</button>`
  );
}

const scrap = (n) => `${icon('scrap')}${n}`;

/** One line on what a level brings. */
function levelText(id, lvl) {
  const row = STATIONS[id].levels[lvl - 1];
  if (row.item) return `${ITEMS[row.item].name}: ${ITEMS[row.item].text.toLowerCase()}`;
  if (row.bunks) return `${row.bunks} bunk${row.bunks > 1 ? 's' : ''}`;
  if (row.chapters) return `Opens Chapter ${row.chapters}`;
  return '';
}

function craftSection(sh, id) {
  const c = sh.craftInfo(id);
  if (!c.built) return '';
  const it = ITEMS[c.item];
  const run = c.running;
  const action = run
    ? `<div class="progress">${liveBar(run.start, run.end, 'big')}<span class="t">${icon('clock')}<b data-end="${run.end}"></b></span></div>`
    : btn(`${icon(c.item)}Craft ${esc(it.name.toLowerCase())}`, 'craft', { id }, { disabled: !c.canStart, why: c.why, cls: 'primary wide', sub: `${scrap(it.cost)} · ${fmtDuration(it.time)}` });
  return (
    `<section class="sec"><h3>${icon(c.item)}${esc(it.name)}</h3>` +
    `<p class="note">${esc(it.text)}. In the crate: <b>${c.have}/${CRATE_MAX}</b>. The next mission takes the best one along; unused ones stay.</p>` +
    `${action}</section>`
  );
}

function barracksSection(sh) {
  const cards = SURVIVOR_ORDER.map((id) => {
    const st = sh.s.survivors[id];
    const def = SURVIVORS[id];
    if (st === 'unknown') {
      const m = MISSIONS.find((x) => x.rescue === id);
      return `<div class="scard unknown">${faceHtml('bot', 'big dim')}<div><b>???</b><small>Waiting somewhere in Chapter ${m ? m.chapter : '?'}</small></div></div>`;
    }
    return (
      `<div class="scard ${st}">${faceHtml(id, 'big')}<div><b>${esc(def.name)}</b> <small>${esc(def.role)}</small>` +
      `<p class="perk">${icon('star')}${esc(def.perk)}</p>` +
      (st === 'waiting' ? `<p class="warnline">${icon('bed')}Needs a bunk: upgrade the Barracks</p>` : `<p class="line">"${esc(LINES[id])}"</p>`) +
      `</div></div>`
    );
  }).join('');
  return `<section class="sec"><h3>${icon('squad')}Survivors <small>${sh.home().length}/${sh.bunks()} bunks</small></h3>${cards}<p class="note">Everyone with a bunk joins the squad. Empty slots get a bot.</p></section>`;
}

function radioSection(sh) {
  const open = sh.chaptersOpen();
  const rows = CHAPTERS.map((ch) => {
    const done = sh.s.cleared >= ch.n * 3;
    const state = done ? `${icon('check')}Cleared` : ch.n <= open ? 'Open' : `${icon('lock')}Radio Lv ${ch.n - 1}`;
    return `<div class="chrow${done ? ' done' : ch.n <= open ? '' : ' locked'}"><b>Chapter ${ch.n}</b><span>${esc(ch.name)}</span><em>${state}</em></div>`;
  }).join('');
  return `<section class="sec"><h3>${icon('map')}Chapters</h3>${rows}</section>`;
}

export function stationSheet(sh, id) {
  const def = STATIONS[id];
  const lvl = sh.level(id);
  const u = sh.upgradeInfo(id);
  const b = sh.s.build && sh.s.build.id === id ? sh.s.build : null;
  let body = '';
  if (KIND[id]) body += craftSection(sh, id);
  if (id === 'barracks') body += barracksSection(sh);
  if (id === 'radio' && lvl > 0) body += radioSection(sh);

  let up;
  if (b) {
    up =
      `<section class="sec"><h3>${icon('hammer')}${lvl === 0 ? 'Building' : `Upgrading to Lv ${b.to}`}</h3>` +
      `<div class="progress">${liveBar(b.start, b.end, 'big')}<span class="t">${icon('clock')}<b data-end="${b.end}"></b></span></div>` +
      `<p class="note">Timers keep running while the app is closed.</p></section>`;
  } else if (u.maxed) {
    up = `<section class="sec"><h3>${icon('star')}Max level</h3><p class="note">${esc(levelText(id, lvl))}.</p></section>`;
  } else {
    const label = lvl === 0 ? 'Build' : `Upgrade to Lv ${u.next}`;
    up =
      `<section class="sec"><h3>${icon('up')}${lvl === 0 ? 'Build it' : `Level ${u.next}`}</h3>` +
      `<p class="note">${esc(levelText(id, u.next))} · +${STRENGTH_PER_LEVEL} squad strength.</p>` +
      btn(label, 'upgrade', { id }, { disabled: !u.canStart, why: u.why, cls: 'primary wide', sub: u.canStart || u.why.startsWith('Need') ? `${scrap(u.cost)} · ${fmtDuration(u.time)}` : esc(u.why) }) +
      `</section>`;
  }
  return (
    `<div class="sheet-head">${icon(id)}<div><div class="kicker">${esc(def.question)}</div>` +
    `<h2>${esc(def.name)} <small>${lvl ? `Lv ${lvl}/3` : 'Not built'}</small></h2><p>${esc(def.does)}</p></div></div>` +
    `<div class="sheet-body scroll">${body}${up}</div>`
  );
}

export function resultsPanel(sh, report, summary, loadout) {
  const M = MISSIONS.find((m) => m.id === report.missionId);
  const won = report.won;
  const sub = won
    ? `${esc(M.name)} · all ${report.total} safe rooms reached`
    : `${esc(M.name)} · ${report.rooms ? `${report.rooms} of ${report.total} safe rooms reached` : 'wiped before the first safe room'}`;
  const used = summary.used.map((id) => `${icon(id)}${esc(ITEMS[id].name)}`).join(' ');
  const kept = [loadout.throwable, loadout.heal].filter((id) => id && !summary.used.includes(id));
  const news = [];
  if (summary.chapterDone) news.push(`${icon('flag')}Chapter ${summary.chapterDone} cleared!`);
  if (summary.rescued) {
    const n = SURVIVORS[summary.rescued].name;
    news.push(summary.waiting ? `${icon('squad')}You found ${n}! ${n} needs a bunk: upgrade the Barracks.` : `${icon('squad')}${n} joins the squad!`);
  }
  if (summary.allDone) news.push(`${icon('star')}Every mission cleared. The Safehouse made it.`);
  return (
    `<div class="res-head ${won ? 'won' : 'lost'}"><div class="stamp">${won ? 'MISSION CLEAR' : 'WIPED'}</div><p>${sub}</p></div>` +
    `<div class="res-body">` +
    `<div class="paid">${icon('saferoom')}<span>Banked</span><b>+${report.scrap}</b>${icon('scrap')}<span>Scrap</span></div>` +
    (!won && report.rooms ? `<p class="note center">Loot is banked at every safe room, so a wipe keeps what you already brought in.</p>` : '') +
    (used || kept.length
      ? `<p class="items">${used ? `Used: ${used}` : ''}${used && kept.length ? ' · ' : ''}${kept.length ? `Back in the crate: ${kept.map((id) => `${icon(id)}${esc(ITEMS[id].name)}`).join(' ')}` : ''}</p>`
      : '') +
    news.map((n) => `<p class="news">${n}</p>`).join('') +
    `</div><div class="btnrow end">${btn('Continue', 'close', {}, { cls: 'primary' })}</div>`
  );
}

export function rescuePanel(id) {
  const sc = RESCUES[id];
  const def = SURVIVORS[id];
  const lines = sc.lines.map((l) => `<div class="sline">${faceHtml(l.who, 'big')}<div class="sb"><b>${esc(SURVIVORS[l.who].name)}</b><p>${esc(l.text)}</p></div></div>`).join('');
  return (
    `<div class="scene"><div class="kicker">Chapter finale</div><h2>${esc(sc.title)}</h2>${lines}` +
    `<p class="perk">${icon('star')}<b>${esc(def.name)}, ${esc(def.role.toLowerCase())}:</b>&nbsp;${esc(def.perk)}.</p>` +
    `<div class="btnrow end">${btn('Continue', 'close', {}, { cls: 'primary' })}</div></div>`
  );
}

export function introPanel() {
  const lines = INTRO.map((l) => `<div class="sline">${faceHtml(l.who, 'big')}<div class="sb"><b>Nadia</b><p>${esc(l.text)}</p></div></div>`).join('');
  return (
    `<div class="scene intro"><h1>SAFEHOUSE</h1>${lines}` +
    `<ol class="how"><li>${icon('play')}<span><b>Play</b> a mission. Scrap is banked at every safe room.</span></li>` +
    `<li>${icon('hammer')}<span><b>Build</b> and upgrade four rooms. Every level makes the squad stronger.</span></li>` +
    `<li>${icon('pipe_bomb')}<span><b>Craft</b> throwables and heals. The next mission takes them along.</span></li></ol>` +
    `<div class="btnrow end">${btn('Start', 'close', {}, { cls: 'primary big' })}</div></div>`
  );
}

export function scrapInfo() {
  return (
    `<div class="scene"><div class="kicker">The only resource</div><h2>${icon('scrap')}Scrap</h2>` +
    `<p class="lead">Missions bring Scrap home: whatever the squad picked up is banked at each safe room, even if the mission goes wrong later. Spend it on building and upgrading rooms, and on crafting.</p>` +
    `<div class="btnrow end">${btn('OK', 'close', {}, { cls: 'primary' })}</div></div>`
  );
}

export function devPanel(sh, clock) {
  const o = sh.tuning.outcome || 'auto';
  const opt = (v, l) => btn(l, 'outcome', { v }, { cls: `small${o === v ? ' on' : ' ghost'}` });
  return (
    `<div class="scene dev"><div class="kicker">Prototype</div><h2>Testing tools</h2>` +
    `<p class="note">The clock is ${clock.offset > 1000 ? `${fmtTime(clock.offset / 1000)} ahead of real time` : 'on real time'}. Timers also run while the page is closed.</p>` +
    `<div class="btnrow">${btn('Skip 10 min', 'warp', { s: 600 })}${btn('Skip 1 hour', 'warp', { s: 3600 })}${btn('+500 Scrap', 'cheat')}${btn('Finish timers', 'finish')}</div>` +
    `<h3>Missions</h3><div class="btnrow">${opt('auto', 'By chance')}${opt('win', 'Always clear')}${opt('wipe', 'Always wipe')}</div>` +
    `<h3>Save</h3><div class="btnrow">${btn('Reset progress', 'reset', {}, { cls: 'danger' })}</div>` +
    `<p class="note">Missions played ${sh.s.stats.missions} (${sh.s.stats.wins} cleared) · Scrap earned ${sh.s.stats.scrapEarned} · crafted ${sh.s.stats.crafted}</p></div>`
  );
}
