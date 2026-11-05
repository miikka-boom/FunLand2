// Screen renderers: (meta, ...) -> HTML. Buttons carry data-act; main.js handles them.
// Kept small: who you are, the visitor at the gate, the crew, results, one building,
// your people, one person, reveals (with a word from Mae) and the convoy.

import { ROLES, TAGS, STARS, MAX_LEVEL, XP_TO_NEXT, MAX_FACILITY_LEVEL, RUN_TYPES, SQUAD_SIZE, FAVORED_BONUS } from './config.js';
import { basePower, fullName } from './people.js';
import { portraitSvg, maeSvg } from './portrait.js';
import { buildingSvg } from './art.js';
import { icon } from './icons.js';
import { fmtNum, fmtTime } from './format.js';
import { esc } from './ui.js';

export const scrap = (n, cls = '') => `<span class="cur scrap ${cls}">${icon('scrap')}<b>${fmtNum(n)}</b></span>`;
const ROLE_ICON = { fighter: 'fist', scout: 'boot', medic: 'cross' };
const TAG_ICON = { horde: 'horde', night: 'moon', toxic: 'biohazard' };
export const roleIcon = (role) => icon(ROLE_ICON[role]);

function btn(label, act, data = {}, cls = '') {
  const attrs = Object.entries(data)
    .map(([k, v]) => ` data-${k}="${esc(v)}"`)
    .join('');
  return `<button class="btn ${cls}" type="button" data-act="${act}"${attrs}>${label}</button>`;
}

export const starsHtml = (n) => `<span class="gstars" aria-label="${n} stars">${[1, 2, 3].map((k) => `<i class="${k <= n ? 'on' : ''}">★</i>`).join('')}</span>`;

function roleChip(role) {
  return `<span class="rchip r-${role}">${roleIcon(role)}<b>${ROLES[role].name}</b></span>`;
}

/** XP as pips: how far along to the next level. */
function xpPips(p, from = null) {
  if (p.level >= MAX_LEVEL) return `<span class="xpips max">MAX</span>`;
  const need = XP_TO_NEXT[p.level - 1];
  const fill = Math.min(need, p.xp);
  if (need > 10) return `<span class="xbar"><i style="width:${Math.round((fill / need) * 100)}%"></i></span>`;
  return `<span class="xpips">${Array.from({ length: need }, (_, k) => `<i class="${k < fill ? 'on' : ''}${from !== null && k >= from && k < fill ? ' new' : ''}"></i>`).join('')}</span>`;
}

function lvBadge(p) {
  return `<span class="lv">Lv ${p.level}</span>`;
}

// --- Who are you -----------------------------------------------------------------------------

export function pickYou(meta, picked) {
  const cards = meta.s.candidates
    .map(
      (p, k) =>
        `<button class="yc r-${p.role}${picked === k ? ' on' : ''}" type="button" data-act="pickYou" data-k="${k}">` +
        `<span class="yc-art">${portraitSvg(p)}</span><b class="yc-name">${esc(p.first)} ${esc(p.last)}</b><span class="yc-job">${p.age} · ${esc(p.job)}</span>` +
        `${roleChip(p.role)}<span class="yc-blurb">${esc(ROLES[p.role].blurb)}</span></button>`,
    )
    .join('');
  return (
    `<div class="sheet yousheet"><div class="kicker">Station 9</div><h2>Who are you?</h2>` +
    `<div class="ycs">${cards}</div>` +
    `<div class="sh-foot">${picked !== null && picked !== undefined ? btn(`${icon('check')} That's me`, 'iAm', {}, 'primary big') : '<span class="hint">Tap the one that’s you.</span>'}</div></div>`
  );
}

// --- The gate ---------------------------------------------------------------------------------

function originLine(p) {
  if (p.origin === 'rescue') return `${icon('heart')} You rescued them at ${esc(p.rescuedFrom)}`;
  if (p.origin === 'convoy') return `${icon('truck')} Came with the convoy`;
  return `${icon('gate')} Knocked on the gate`;
}

export function visitor(meta) {
  const g = meta.gateInfo();
  const p = g.visitors[0];
  if (!p) return null;
  const free = meta.freeBeds();
  const more = g.visitors.length > 1 ? `<span class="vmore">+${g.visitors.length - 1} more waiting</span>` : '';
  const take = free > 0 ? btn(`${icon('check')} Take in`, 'take', { id: p.id }, 'primary big') : btn(`${icon('bed')} No free bed`, 'noBed', { id: p.id }, 'warnb big');
  return (
    `<div class="sheet vsheet r-${p.role}">` +
    `<div class="v-art">${portraitSvg(p)}</div>` +
    `<div class="v-main"><div class="kicker">At the gate ${more}</div><h2>${esc(fullName(p))}</h2>` +
    `<p class="v-job">${p.age} · former ${esc(p.job.toLowerCase())}. ${esc(p.quirk)}</p>` +
    `<div class="v-role">${roleChip(p.role)}<span>${esc(ROLES[p.role].blurb)}</span></div>` +
    `<div class="v-stats"><span class="v-stars">${starsHtml(p.stars)}<small>${STARS[p.stars].name}</small></span><span class="v-pow">${icon('power')}<b>${basePower(p)}</b><small>power</small></span>${lvBadge(p)}</div>` +
    `<p class="v-quote">“${esc(p.quote)}”</p><div class="v-from">${originLine(p)}</div>` +
    `<div class="v-btns">${meta.s.tut.done ? btn('Not now', 'away', { id: p.id }, 'ghost') : ''}${take}</div>` +
    `<div class="v-beds ${free <= 0 ? 'full' : ''}">${icon('bed')} ${meta.s.people.length}/${meta.beds()} beds</div></div></div>`
  );
}

// --- The crew ---------------------------------------------------------------------------------

function personMini(meta, p, run, act, extra = '') {
  const pow = Math.round(meta.memberPower(p, run));
  const fav = ROLES[p.role].tag === run.tag;
  const resting = p.rest > 0;
  return (
    `<button class="pm r-${p.role}${fav ? ' fav' : ''}${resting ? ' resting' : ''}" type="button" data-act="${act}" data-id="${p.id}">` +
    `<span class="pm-art">${portraitSvg(p, { hurt: resting })}</span><b>${esc(p.first)}</b>` +
    `<span class="pm-row">${roleIcon(p.role)}${starsHtml(p.stars)}</span>` +
    `<span class="pm-pow">${icon('power')}<b>${pow}</b>${fav ? `<em>+${Math.round(FAVORED_BONUS * 100)}%</em>` : ''}</span>` +
    (resting ? `<span class="pm-rest">${icon('bandage')} Resting</span>` : '') +
    extra +
    `</button>`
  );
}

export function crew(meta, ctx) {
  const run = meta.nextRun();
  const tag = TAGS[run.tag];
  const ids = ctx.pick.filter((id) => meta.person(id));
  const o = meta.oddsFor(run, ids);
  const bench = meta
    .roster()
    .filter((p) => p.id !== meta.s.you && !ids.includes(p.id))
    .sort((a, b) => (a.rest > 0) - (b.rest > 0) || meta.memberPower(b, run) - meta.memberPower(a, run));
  const canAdd = bench.some((p) => p.rest <= 0);
  const slots = [];
  for (let k = 0; k < SQUAD_SIZE; k++) {
    const id = ids[k];
    if (k === 0) {
      const p = meta.you();
      slots.push(`<div class="slot you">${personMini(meta, p, run, 'noop', `<em class="crown">${icon('crown')}YOU</em>`)}</div>`);
    } else if (id !== undefined) slots.push(`<div class="slot">${personMini(meta, meta.person(id), run, 'drop', `<span class="sl-x">${icon('close')}</span>`)}</div>`);
    else slots.push(`<div class="slot empty"><span>+</span><small>${canAdd ? 'Tap someone below' : 'Take more people in'}</small></div>`);
  }
  const fill = Math.min(100, Math.round((o.power / Math.max(1, run.rec)) * 70));
  const where = run.patrol ? 'Patrol' : run.building.final ? `The Overpass · ${run.step + 1}/${run.steps}` : `${esc(run.building.name)} · ${run.step + 1}/${run.steps}`;
  return (
    `<div class="sheet crewsh">` +
    `<div class="cr-head"><div><div class="kicker">${where}</div><h2>${esc(run.name)}</h2></div>` +
    `<div class="favor t-${run.tag}">${icon(TAG_ICON[run.tag])}<span><b>${tag.name}</b><small>${roleIcon(tag.role)} ${ROLES[tag.role].name}s +${Math.round(FAVORED_BONUS * 100)}%</small></span></div></div>` +
    `<div class="slots">${slots.join('')}</div>` +
    (bench.length ? `<div class="bench">${bench.map((p) => personMini(meta, p, run, 'add')).join('')}</div>` : '') +
    `<div class="cr-foot"><div class="meter tone-${o.risk.tone}"><div class="mt-bar"><i style="width:${fill}%"></i><u style="left:70%"></u></div>` +
    `<span class="mt-l">${icon('power')}<b>${o.power}</b> vs <b>${run.rec}</b> needed${run.worn ? ` <em class="worn">thinned −${run.worn * 10}%</em>` : ''} · <b class="rk">${o.risk.label}</b></span></div>` +
    `${btn(`${icon('play')} GO`, 'start', {}, 'primary big go')}</div></div>`
  );
}

// --- Results ---------------------------------------------------------------------------------

export function results(meta, result, out) {
  const run = result.run;
  const won = out.won;
  const title = !won ? 'WE LOST THIS ONE' : out.sealed ? 'STREET SEALED' : out.reclaimed ? 'TAKEN BACK!' : run.type === 'rescue' ? 'RESCUED!' : 'MADE IT!';
  const rows = out.xp
    .map((x) => {
      const p = meta.person(x.id);
      if (!p) return '';
      const hurt = out.hurt === x.id;
      return (
        `<div class="xr${x.ups ? ' up' : ''}"><span class="xr-art">${portraitSvg(p, { hurt })}</span><span class="xr-b"><b>${esc(p.first)}</b>` +
        `${xpPips(p, x.ups ? 0 : x.from.xp)}<small>+${x.gained} XP${x.ups ? ` · <em>LEVEL ${p.level}!</em>` : ` · Lv ${p.level}`}</small></span>` +
        (hurt ? `<span class="xr-hurt">${icon('bandage')} Resting</span>` : '') +
        `</div>`
      );
    })
    .join('');
  const news = [];
  if (out.rescued) news.push(`<div class="r-new">${icon('heart')}<span><b>${esc(out.rescued.first)}</b> is waiting at the gate</span></div>`);
  if (out.arrived && out.arrived.length && !out.rescued) news.push(`<div class="r-new">${icon('gate')}<span>Someone knocked while you were out</span></div>`);
  if (!won && out.worn) news.push(`<div class="r-new">${icon('skull')}<span>We thinned them out: the next try needs <b>${out.worn * 10}%</b> less</span></div>`);
  if (out.medicSaved) news.push(`<div class="r-new">${icon('cross')}<span>Your Medic kept everyone on their feet</span></div>`);
  const back = out.back.map((id) => meta.person(id)).filter(Boolean);
  if (back.length) news.push(`<div class="r-new">${icon('check')}<span>${back.map((p) => esc(p.first)).join(', ')} rested up</span></div>`);
  const sub = `${esc(run.name)} · ${result.kills} kills · ${fmtTime(result.timeS)}${out.scouts ? ` · Scouts +${out.scouts * 20}% scrap` : ''}`;
  return (
    `<div class="res ${won ? 'won' : 'lost'}">` +
    `<div class="res-l"><div class="kicker">${esc(RUN_TYPES[run.type].label)}</div><div class="r-title">${title}</div>` +
    (won ? `<div class="r-stars">${[1, 2, 3].map((k) => `<i class="${k <= result.stars ? 'on' : ''}" style="--d:${0.15 + k * 0.22}s">${icon(k <= result.stars ? 'star' : 'starEmpty')}</i>`).join('')}</div>` : '') +
    `<div class="r-sub">${sub}</div><div class="r-total">${scrap(out.scrap, 'big')}</div>${news.join('')}` +
    `<div class="btns">${btn(`Continue ${icon('arrow')}`, 'close', {}, 'primary big')}</div></div>` +
    `<div class="res-r"><div class="sec-h">Who went</div>${rows}</div></div>`
  );
}

// --- One building ------------------------------------------------------------------------------

export function building(meta, id) {
  const b = meta.building(id);
  const lv = meta.level(id);
  const art = `<span class="b-art">${buildingSvg(b.id, lv > 0 ? lv * 2 - 1 : 0)}</span>`;
  if (lv <= 0 || b.final) {
    return `<div class="sheet bsheet">${art}<div class="b-main"><div class="kicker">Not ours yet</div><h2>${esc(b.name)}</h2><p class="desc">${esc(b.blurb)}</p><div class="b-lock">${icon('lock')} Take it back on the street first.</div></div></div>`;
  }
  const now = meta.effect(id);
  const cost = meta.upgradeCost(id);
  const nx = lv < MAX_FACILITY_LEVEL ? meta.effect(id, lv + 1) : null;
  const pips = `<span class="pips">${Array.from({ length: MAX_FACILITY_LEVEL }, (_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('')}</span>`;
  let foot;
  if (cost === null) foot = `<div class="maxed">${icon('star')} Fully built</div>`;
  else if (meta.s.scrap >= cost) foot = btn(`${icon('up')}<span>Upgrade</span>${scrap(cost)}`, 'up', { id }, 'primary big up');
  else foot = `<div class="need">${scrap(cost)}<small>${fmtNum(cost - meta.s.scrap)} more scrap</small></div>`;
  return (
    `<div class="sheet bsheet">${art}<div class="b-main"><div class="kicker">${esc(b.name)}</div><h2>${esc(b.facility)} <em>Lv ${lv}</em></h2>${pips}` +
    `<p class="desc">${esc(b.blurb)}</p><div class="b-eff"><b>${esc(b.unit(now))}</b>${nx !== null ? `<span class="nx">Next: ${esc(b.unit(nx))}</span>` : ''}</div>${foot}</div></div>`
  );
}

// --- Your people -------------------------------------------------------------------------------

export function people(meta) {
  const cards = meta
    .roster()
    .map((p) => {
      const you = p.id === meta.s.you;
      return (
        `<button class="pc r-${p.role}${p.rest > 0 ? ' resting' : ''}" type="button" data-act="person" data-id="${p.id}">` +
        `<span class="pc-art">${portraitSvg(p, { hurt: p.rest > 0 })}${you ? `<em class="crown">${icon('crown')}YOU</em>` : ''}</span>` +
        `<span class="pc-body"><b class="pc-name">${esc(p.first)}</b><span class="pc-role">${roleIcon(p.role)}${ROLES[p.role].name}</span>` +
        `<span class="pc-row">${starsHtml(p.stars)}${lvBadge(p)}</span>${xpPips(p)}</span></button>`
      );
    })
    .join('');
  return `<div class="sheet peoplesh"><div class="sh-head"><div><div class="kicker">Station 9</div><h2>Your people</h2></div><div class="beds">${icon('bed')}<b>${meta.s.people.length}/${meta.beds()}</b><small>beds</small></div></div><div class="pcs scroll">${cards}</div></div>`;
}

export function person(meta, id, confirm = false) {
  const p = meta.person(id);
  if (!p) return null;
  const you = p.id === meta.s.you;
  const foot = you
    ? ''
    : `<div class="ps-foot">${confirm ? `<span class="ps-sure">${esc(p.first)} leaves Station 9 for good.</span>${btn(`${icon('bye')} Yes, let ${esc(p.first)} go`, 'letGoYes', { id }, 'danger-solid')}` : btn(`${icon('bye')} Let go`, 'letGo', { id }, 'ghost small')}</div>`;
  const need = p.level >= MAX_LEVEL ? null : XP_TO_NEXT[p.level - 1];
  return (
    `<div class="sheet personsh r-${p.role}"><div class="ps-art">${portraitSvg(p, { hurt: p.rest > 0 })}${starsHtml(p.stars)}<small>${STARS[p.stars].name}</small></div>` +
    `<div class="ps-main"><div class="kicker">${you ? 'This is you' : p.origin === 'rescue' ? 'Rescued' : 'Took them in'}</div><h2>${esc(fullName(p))}</h2>` +
    `<p class="desc">${p.age} · former ${esc(p.job.toLowerCase())}. ${esc(p.quirk)}</p>` +
    `<div class="ps-role">${roleChip(p.role)}<span>${esc(ROLES[p.role].blurb)}</span></div>` +
    `<div class="ps-lv"><span class="ps-pow">${icon('power')}<b>${basePower(p)}</b><small>power</small></span><span class="ps-xp"><b>Level ${p.level}</b>${xpPips(p)}<small>${need ? `${p.xp}/${need} XP to level ${p.level + 1}` : 'Max level'}</small></span></div>` +
    (p.rest > 0 ? `<div class="status hurt">${icon('bandage')}<span><b>Resting</b> · back after the next run</span></div>` : `<div class="status ok">${icon('check')}<span><b>Ready</b> for the next run</span></div>`) +
    `<div class="ps-stats"><span><b>${p.runs || 0}</b> runs</span></div>${foot}</div></div>`
  );
}

// --- Reveals, convoy ----------------------------------------------------------------------------

const MAE_ON = {
  diner: "Rosie's is ours! Hot meals mean everyone who goes out learns faster.",
  hardware: 'Tools, nails, gear. Whoever goes out hits harder now.',
  gym: 'A gym! Whoever stays home can train now. Nobody falls behind.',
  radio: "We're on the air. More people will hear us, and better ones.",
};

export function reveal(meta, what) {
  const sayMae = (text, expr = 'proud') => `<div class="rv-mae"><span class="rv-face">${maeSvg(expr)}</span><p><b>Mae</b>${esc(text)}</p></div>`;
  if (what.kind === 'reclaim') {
    const b = meta.building(what.id);
    return (
      `<div class="reveal"><div class="rv-burst"></div><div class="kicker">Taken back</div><div class="rv-art bld-big">${buildingSvg(b.id, 1)}</div><h1>${esc(b.name)}</h1>` +
      `<div class="rv-perk">${icon('up')} New: <b>${esc(b.facility)}</b> · ${esc(b.unit(meta.effect(b.id)))}</div>` +
      sayMae(MAE_ON[b.id] || b.blurb) +
      `<div class="btns">${btn('Move in', 'close', {}, 'primary big')}</div></div>`
    );
  }
  if (what.kind === 'sealed') {
    const st = meta.s.stats;
    const you = meta.you();
    return (
      `<div class="reveal sealed"><div class="rv-burst"></div><h1>HOPE STREET IS SAFE</h1>` +
      `<p class="desc">${meta.s.people.length} people sleep at Station 9 tonight. ${st.runs} runs, ${fmtNum(st.kills)} infected.</p>` +
      sayMae(`You did it, ${you ? you.first : 'kid'}. Thirty years on the job and this is the best shift I ever had.`) +
      `<div class="btns">${btn('Keep going', 'close', {}, 'primary big')}</div></div>`
    );
  }
  return '';
}

export function convoy(meta, opened) {
  if (opened) {
    const p = opened.person;
    return (
      `<div class="reward-open"><div class="kicker">The convoy</div><h2>Scrap, and a new face</h2>` +
      `<div class="r-total">${scrap(opened.scrap, 'big')}</div>` +
      `<div class="cv-p">${portraitSvg(p)}<span><b>${esc(fullName(p))}</b><small>${starsHtml(p.stars)} ${ROLES[p.role].name} · Lv ${p.level}</small><em>Waiting at the gate</em></span></div>` +
      `<div class="btns">${btn('Collect', 'close', {}, 'primary big')}</div></div>`
    );
  }
  const info = meta.convoyInfo();
  return (
    `<div class="reward-wait"><div class="rw-art">${icon('truck')}</div><div class="kicker">Every 8 hours</div><h2>The convoy</h2>` +
    `<p class="desc">Old friends from the radio. They bring about ${scrap(info.scrap)} and someone skilled for the gate.</p>` +
    `<div class="rw-time">${icon('clock')} Here in <b data-end="${meta.s.convoy.readyAt}">${fmtTime(info.remaining)}</b></div>` +
    `<div class="btns">${btn('OK', 'close', {}, 'primary big')}</div></div>`
  );
}
