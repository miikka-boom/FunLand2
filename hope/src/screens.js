// Screen renderers: (meta, ...) -> HTML. Buttons carry data-act; main.js handles
// them. Every button says what a tap does; anything you can't do yet says why.

import { ROLES, ROLE_ORDER, TAGS, TRAITS, GRADES, MAX_LEVEL, XP_TO_NEXT, BUILDINGS, MAX_FACILITY_LEVEL, RUN_TYPES, SQUAD_SIZE, COOP_BONUS, CHAINS, RUNS_PER_CHAIN } from './config.js';
import { basePower, fullName } from './people.js';
import { portraitSvg } from './portrait.js';
import { buildingSvg } from './art.js';
import { icon } from './icons.js';
import { fmtNum, fmtTime } from './format.js';
import { esc } from './ui.js';

export const scrap = (n, cls = '') => `<span class="cur scrap ${cls}">${icon('scrap')}<b>${fmtNum(n)}</b></span>`;
export const gem = (n, cls = '') => `<span class="cur gem ${cls}">${icon('gems')}<b>${fmtNum(n)}</b></span>`;
const ROLE_ICON = { bruiser: 'fist', shooter: 'target', medic: 'cross', scout: 'boot', mechanic: 'wrench' };
const TAG_ICON = { indoors: 'door', horde: 'horde', toxic: 'biohazard', night: 'moon', machines: 'cog' };
export const roleIcon = (role) => icon(ROLE_ICON[role]);

function btn(label, act, data = {}, cls = '') {
  const attrs = Object.entries(data)
    .map(([k, v]) => ` data-${k}="${esc(v)}"`)
    .join('');
  return `<button class="btn ${cls}" type="button" data-act="${act}"${attrs}>${label}</button>`;
}

const starsHtml = (n, max = 3) => `<span class="gstars">${Array.from({ length: max }, (_, k) => `<i class="${k < n ? 'on' : ''}">★</i>`).join('')}</span>`;

function roleChip(role, extra = '') {
  return `<span class="rchip r-${role}">${roleIcon(role)}<b>${ROLES[role].name}</b>${extra}</span>`;
}

function traitChips(p, run = null, withText = false) {
  return p.traits
    .map((t) => {
      const d = TRAITS[t];
      const live = run && d.tag && run.tags.includes(d.tag);
      return `<span class="tchip ${d.good ? 'good' : 'bad'}${live ? ' live' : ''}" title="${esc(d.text)}"><b>${esc(d.name)}</b>${withText ? `<small>${esc(d.text)}</small>` : ''}</span>`;
    })
    .join('');
}

function tagChips(run) {
  return run.tags.map((t) => `<span class="tag t-${t}">${icon(TAG_ICON[t])}<b>${TAGS[t].name}</b><small>${roleIcon(TAGS[t].role)} ${ROLES[TAGS[t].role].name}s +25%</small></span>`).join('');
}

function xpBar(p) {
  const need = p.level >= MAX_LEVEL ? null : XP_TO_NEXT[p.level - 1];
  const pct = need ? Math.round((p.xp / need) * 100) : 100;
  return `<span class="xpbar"><i style="width:${pct}%"></i></span>`;
}

/** Compact person card for lists. `run` shows that run's power and fit. */
function personCard(meta, p, { run = null, act = 'person', sel = false, extra = '' } = {}) {
  const pow = run ? Math.round(meta.memberPower(p, run)) : basePower(p);
  const fit = run ? meta.fit(p, run) : [];
  const hurt = p.injured > 0;
  return (
    `<button class="pc r-${p.role}${sel ? ' sel' : ''}${hurt ? ' hurt' : ''}" type="button" data-act="${act}" data-id="${p.id}">` +
    `<span class="pc-art">${portraitSvg(p, { hurt })}${hurt ? `<em class="hurtb">${icon('bandage')}${p.injured}d</em>` : ''}</span>` +
    `<span class="pc-body"><b class="pc-name">${esc(p.first)}</b>` +
    `<span class="pc-role">${roleIcon(p.role)}${ROLES[p.role].name} · Lv ${p.level}</span>` +
    `<span class="pc-row">${starsHtml(p.grade)}<span class="pc-pow">${icon('power')}<b>${pow}</b></span></span>` +
    (fit.length ? `<span class="pc-fit">${fit.map((f) => `<i class="${f.good ? 'g' : 'b'}">${esc(f.text)}</i>`).join('')}</span>` : `<span class="pc-traits">${traitChips(p, run)}</span>`) +
    `</span>${extra}</button>`
  );
}

// --- The gate ---------------------------------------------------------------------------

function originLine(p) {
  if (p.origin === 'rescue') return `${icon('heart')} Rescued at ${esc(p.rescuedFrom)}`;
  if (p.origin === 'scavenge') return `${icon('heart')} Found at the ${esc(p.rescuedFrom)}`;
  if (p.origin === 'convoy') return `${icon('truck')} Came with the convoy`;
  return `${icon('gate')} Knocked on the gate`;
}

function visitorCard(meta, p) {
  const free = meta.freeBeds() > 0;
  return (
    `<div class="vc r-${p.role}" data-id="${p.id}">` +
    `<div class="vc-top"><span class="vc-art">${portraitSvg(p)}</span><div class="vc-id"><b class="vc-name">${esc(fullName(p))}</b><span class="vc-job">${p.age} · ${esc(p.job)}</span>` +
    `<span class="vc-meta">${roleChip(p.role)}<span class="vc-gr">${starsHtml(p.grade)}<small>${GRADES[p.grade].name}</small></span></span>` +
    `<span class="vc-stats"><span>${icon('power')}<b>${basePower(p)}</b><small>power</small></span><span>${icon('xp')}<b>Lv ${p.level}</b></span></span></div></div>` +
    `<div class="vc-traits">${traitChips(p, null, true)}</div>` +
    `<p class="vc-quote">“${esc(p.quote)}” <small>${originLine(p)}</small></p>` +
    `<div class="vc-btns">${btn('Turn away', 'away', { id: p.id }, 'ghost')}${free ? btn(`${icon('check')} Take in`, 'take', { id: p.id }, 'primary') : btn(`${icon('bed')} Make room`, 'room', { id: p.id }, 'warnb')}</div>` +
    `</div>`
  );
}

export function gate(meta) {
  const g = meta.gateInfo();
  const free = meta.freeBeds();
  const head =
    `<div class="sh-head"><div><div class="kicker">The gate</div><h2>${g.visitors.length ? (g.visitors.length === 1 ? 'Someone is at the gate' : `${g.visitors.length} people at the gate`) : 'Nobody at the gate'}</h2></div>` +
    `<div class="beds ${free <= 0 ? 'full' : ''}">${icon('bed')}<b>${meta.s.people.length}/${meta.beds()}</b><small>${free > 0 ? `${free} free bed${free > 1 ? 's' : ''}` : 'No free bed'}</small></div></div>`;
  const cards = g.visitors.length ? `<div class="vcs scroll">${g.visitors.map((p) => visitorCard(meta, p)).join('')}</div>` : `<div class="empty">${icon('gate')}<p>Visitors find their way here on their own. Rescue runs bring people too.</p></div>`;
  const next = g.full ? `The gate is full. Take someone in or turn them away.` : `Next visitor in <b data-end="${meta.s.gate.nextAt}">${fmtTime(g.nextIn)}</b>`;
  const call = g.full ? '' : btn(`${icon('radio')} Call someone now ${gem(meta.callCost())}`, 'callAsk', {}, 'gem small');
  return `<div class="sheet gatesh">${head}${cards}<div class="sh-foot"><span class="hint">${next}</span>${call}</div></div>`;
}

/** No free bed: build more, or let someone go to make room. */
export function makeRoom(meta, visitorId) {
  const v = meta.s.gate.visitors.find((p) => p.id === visitorId);
  if (!v) return null;
  const bedUps = ['firehouse', 'motel']
    .filter((id) => meta.level(id) > 0 && meta.upgradeCost(id) !== null)
    .map((id) => {
      const b = meta.building(id);
      const cost = meta.upgradeCost(id);
      const now = meta.effect(id);
      const nx = meta.effect(id, meta.level(id) + 1);
      return `<div class="mr-up">${icon('bed')}<span><b>${b.facility} Lv ${meta.level(id) + 1}</b><small>+${nx - now} bed${nx - now > 1 ? 's' : ''}</small></span>${meta.s.scrap >= cost ? btn(`${icon('up')} Upgrade ${scrap(cost)}`, 'up', { id, back: 'room', v: visitorId }, 'primary') : `<span class="need">${scrap(cost)}<small>Need ${fmtNum(cost - meta.s.scrap)} more</small></span>`}</div>`;
    })
    .join('');
  const list = meta
    .roster()
    .slice()
    .reverse()
    .map((p) => personCard(meta, p, { act: 'swapAsk', extra: `<span class="pc-go">${icon('swap')} Swap</span>` }))
    .join('');
  return (
    `<div class="sheet roomsh"><div class="sh-head"><div><div class="kicker">No free bed</div><h2>Make room for ${esc(v.first)}</h2></div><span class="mr-v">${portraitSvg(v)}<b>${basePower(v)}</b></span></div>` +
    `<div class="mr-body scroll"><p class="desc">Build more beds, or let someone go. People you let go leave for good.</p>${bedUps || ''}<div class="sec-h">Or swap someone for ${esc(v.first)}</div><div class="pcs">${list}</div></div></div>`
  );
}

// --- People -------------------------------------------------------------------------------

export function people(meta, ctx) {
  const f = ctx.filter || 'all';
  const list = meta.roster().filter((p) => f === 'all' || p.role === f);
  const count = (r) => meta.s.people.filter((p) => p.role === r).length;
  const chips = ['all', ...ROLE_ORDER]
    .map((r) => `<button class="fchip${f === r ? ' on' : ''}" type="button" data-act="filter" data-role="${r}">${r === 'all' ? `All <small>${meta.s.people.length}</small>` : `${roleIcon(r)}<small>${count(r)}</small>`}</button>`)
    .join('');
  const free = meta.freeBeds();
  return (
    `<div class="sheet peoplesh"><div class="sh-head"><div><div class="kicker">Hope Street</div><h2>Your people</h2></div>` +
    `<div class="beds ${free <= 0 ? 'full' : ''}">${icon('bed')}<b>${meta.s.people.length}/${meta.beds()}</b><small>beds</small></div></div>` +
    `<div class="fchips">${chips}</div>` +
    `<div class="pcs grid scroll">${list.map((p) => personCard(meta, p)).join('') || '<p class="desc">Nobody with that role yet.</p>'}</div></div>`
  );
}

export function person(meta, id) {
  const p = meta.person(id);
  if (!p) return null;
  const need = p.level >= MAX_LEVEL ? null : XP_TO_NEXT[p.level - 1];
  const status = p.injured > 0 ? `<div class="status hurt">${icon('bandage')}<span><b>Hurt</b> · back in ${p.injured} day${p.injured > 1 ? 's' : ''} (a day passes with each run)</span>${btn(`Heal now ${gem(meta.healCost(p))}`, 'healAsk', { id }, 'gem small')}</div>` : `<div class="status ok">${icon('check')}<span><b>Ready</b> for the next run</span></div>`;
  const role = ROLES[p.role];
  return (
    `<div class="sheet personsh r-${p.role}"><div class="ps-art">${portraitSvg(p, { hurt: p.injured > 0 })}${starsHtml(p.grade)}<small>${GRADES[p.grade].name}</small></div>` +
    `<div class="ps-main scroll"><div class="kicker">${p.origin === 'founder' ? 'Founder' : `Joined on day ${p.joined}`}</div><h2>${esc(fullName(p))}</h2>` +
    `<p class="desc">${p.age} · former ${esc(p.job.toLowerCase())}. ${esc(p.quirk)}</p>` +
    `<div class="ps-role">${roleChip(p.role)}<span>${esc(role.blurb)}</span></div>` +
    `<div class="ps-lv"><span class="ps-pow">${icon('power')}<b>${basePower(p)}</b><small>power</small></span><span class="ps-xp"><b>Level ${p.level}</b>${xpBar(p)}<small>${need ? `${p.xp}/${need} XP` : 'Max level'}</small></span></div>` +
    `<div class="sec-h">Traits</div><div class="ps-traits">${traitChips(p, null, true)}</div>` +
    status +
    `<div class="ps-stats"><span><b>${p.runs}</b> runs</span><span><b>${fmtNum(p.kills)}</b> kills</span></div>` +
    `<div class="ps-foot">${btn(`${icon('bye')} Let go`, 'letGoAsk', { id }, 'ghost danger small')}</div></div></div>`
  );
}

// --- Build --------------------------------------------------------------------------------

function storyLeft(meta, buildingId) {
  const c = CHAINS.findIndex((x) => x.building === buildingId);
  if (c < 0) return null;
  const done = meta.s.story - c * RUNS_PER_CHAIN;
  return { runs: RUNS_PER_CHAIN - Math.max(0, Math.min(RUNS_PER_CHAIN, done)), current: done >= 0 && done < RUNS_PER_CHAIN };
}

export function build(meta) {
  const best = meta.advice().kind === 'build' ? meta.advice().item.id : null;
  const cards = BUILDINGS.filter((b) => !b.final)
    .map((b) => {
      const lv = meta.level(b.id);
      const art = `<span class="bc-art">${buildingSvg(b.id, Math.max(lv, 0))}</span>`;
      if (lv <= 0) {
        const left = storyLeft(meta, b.id);
        return `<div class="bc locked">${art}<div class="bc-name">${b.facility}<small>${esc(b.name)}</small></div><p class="bc-eff">${esc(b.blurb)}</p><div class="bc-lock">${icon('lock')}<span>${left && left.current ? `Reclaim it: <b>${left.runs} run${left.runs > 1 ? 's' : ''} to go</b>` : 'Reclaim it later on the street'}</span></div></div>`;
      }
      const now = meta.effect(b.id);
      const cost = meta.upgradeCost(b.id);
      const nx = lv < MAX_FACILITY_LEVEL ? meta.effect(b.id, lv + 1) : null;
      const pips = `<span class="pips">${Array.from({ length: MAX_FACILITY_LEVEL }, (_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('')}</span>`;
      let foot;
      if (cost === null) foot = `<div class="maxed">${icon('star')} Max level</div>`;
      else if (meta.s.scrap >= cost) foot = btn(`${icon('up')}<span>Upgrade</span>${scrap(cost)}`, 'up', { id: b.id }, 'primary up');
      else foot = `<div class="need">${scrap(cost)}<small>Need ${fmtNum(cost - meta.s.scrap)} more</small></div>`;
      return (
        `<div class="bc${b.id === best ? ' best' : ''}" data-id="${b.id}">${b.id === best ? '<span class="ribbon">BEST</span>' : ''}${art}` +
        `<div class="bc-name">${b.facility} <em>Lv ${lv}</em><small>${esc(b.name)}</small></div>${pips}` +
        `<div class="bc-eff"><b>${esc(b.unit(now))}</b>${nx !== null ? `<span class="nx">→ ${esc(b.unit(nx))}</span>` : ''}</div>` +
        `${foot}<button class="bc-see" type="button" data-act="focusB" data-id="${b.id}">See it</button></div>`
      );
    })
    .join('');
  const tip = meta.advice();
  return (
    `<div class="sheet buildsh"><div class="sh-head"><div><div class="kicker">Upgrades are instant</div><h2>Build up the street</h2></div><div class="sh-cur">${scrap(meta.s.scrap, 'big')}</div></div>` +
    `<div class="u-tip">${tip.kind === 'build' ? `${icon('up')} ${esc(tip.text)}` : `${icon('info')} Every building you reclaim becomes a new facility here.`}</div>` +
    `<div class="bcs scroll">${cards}</div></div>`
  );
}

// --- Runs ---------------------------------------------------------------------------------

function rewardsHtml(meta, run) {
  let s = scrap(run.scrap);
  if (run.gems && run.gemChance >= 1) s += gem(run.gems);
  else if (run.gemChance) s += `<span class="maybe">${icon('gems')}<small>${Math.round(run.gemChance * 100)}%</small></span>`;
  if (run.survivor >= 1) s += `<span class="rw-p">${icon('survivor')}<small>Rescue</small></span>`;
  else if (run.survivor) s += `<span class="maybe">${icon('survivor')}<small>${Math.round(run.survivor * 100)}%</small></span>`;
  s += `<span class="rw-xp">${icon('xp')}<small>${run.xp} XP</small></span>`;
  return s;
}

function runCard(meta, run) {
  const o = meta.bestOdds(run);
  const story = run.kind === 'story';
  const kicker = story ? (run.building.final ? `Last stand · ${run.step + 1}/3` : `Reclaim · ${esc(run.building.name)} · ${run.step + 1}/3`) : `Scavenge · ${run.label}`;
  const unlock = run.reclaims ? `<div class="rc-unlock">${run.building.final ? `${icon('trophy')} Seals Hope Street` : `${icon('flag')} Reclaims the ${esc(run.building.name)}: <b>${esc(run.building.facility)}</b>`}</div>` : '';
  return (
    `<div class="rc${story ? ' story' : ''}">` +
    `<div class="rc-h"><div class="kicker">${kicker}</div><h3>${esc(run.name)}</h3><p class="desc">${esc(run.text)}</p></div>` +
    `<div class="tags">${tagChips(run)}</div>` +
    `<div class="odds tone-${o.risk.tone}"><span class="pw">${icon('power')}<b>${o.power}</b><small>best crew</small></span><span class="vs">vs</span><span class="pw"><b>${run.rec}</b><small>needed</small></span><span class="risk"><b>${o.risk.label}</b><small>${Math.round(o.chance * 100)}%</small></span></div>` +
    `<div class="rc-rw">${rewardsHtml(meta, run)}</div>${unlock}` +
    btn(`${icon('people')} Pick crew`, 'pickRun', { key: run.key }, story ? 'primary' : '') +
    `</div>`
  );
}

export function runs(meta) {
  const list = meta.runs();
  return `<div class="sheet runssh"><div class="sh-head"><div><div class="kicker">Day ${meta.s.day}</div><h2>Where to today?</h2></div></div><div class="rcs scroll">${list.map((r) => runCard(meta, r)).join('')}</div></div>`;
}

// --- Crew ---------------------------------------------------------------------------------

export function crew(meta, ctx) {
  const run = meta.run(ctx.runKey);
  if (!run) return null;
  const friends = ctx.friends || 0;
  const pick = ctx.pick.filter((id) => meta.person(id));
  const o = meta.oddsFor(run, pick, friends);
  const size = SQUAD_SIZE;
  const slots = [];
  for (let k = 0; k < size; k++) {
    const isFriend = k >= size - friends;
    const id = pick[k];
    if (isFriend) slots.push(`<div class="slot friend"><span class="sl-art">${icon('survivor')}</span><b>Friend</b><small>Co-op · ${Math.round(meta.friendPower())}</small></div>`);
    else if (id !== undefined) {
      const p = meta.person(id);
      const fit = meta.fit(p, run);
      slots.push(
        `<button class="slot r-${p.role}${k === 0 ? ' lead' : ''}" type="button" data-act="drop" data-id="${id}"><span class="sl-art">${portraitSvg(p)}</span>` +
          `<b>${esc(p.first)}</b><small>${roleIcon(p.role)} ${icon('power')}${Math.round(meta.memberPower(p, run))}</small>` +
          (fit.length ? `<span class="sl-fit">${fit.map((f) => `<i class="${f.good ? 'g' : 'b'}">${esc(f.text)}</i>`).join('')}</span>` : '') +
          (k === 0 ? `<em class="crown">${icon('crown')}YOU</em>` : `<span class="mk-lead" data-act="lead" data-id="${id}" role="button" aria-label="Play as ${esc(p.first)}">${icon('crown')}</span>`) +
          `<span class="sl-x">${icon('close')}</span></button>`,
      );
    } else slots.push(`<div class="slot empty"><span class="sl-art">+</span><b>Empty</b><small>Tap someone below</small></div>`);
  }
  const bench = meta
    .roster()
    .filter((p) => !pick.includes(p.id))
    .sort((a, b) => (a.injured > 0) - (b.injured > 0) || meta.memberPower(b, run) - meta.memberPower(a, run));
  const best = meta.bestSquad(run, size - friends);
  const bestPow = meta.squadPower(best, run, friends);
  const isBest = bestPow <= o.power;
  const fill = Math.min(100, Math.round((o.power / Math.max(1, run.rec)) * 70));
  return (
    `<div class="sheet crewsh">` +
    `<div class="cr-head"><div><div class="kicker">${run.kind === 'story' ? esc(run.label) : `Scavenge · ${esc(run.label)}`}</div><h2>${esc(run.name)}</h2></div><div class="tags">${tagChips(run)}</div></div>` +
    `<div class="slots">${slots.join('')}</div>` +
    `<div class="sec-h">Your people <small>tap to add · tap the crew to drop · ${icon('crown')} = who you play</small></div>` +
    `<div class="pcs strip scroll">${bench.map((p) => personCard(meta, p, { run, act: 'add' })).join('') || '<p class="desc">Everyone is in the crew.</p>'}</div>` +
    `<div class="cr-foot"><div class="meter tone-${o.risk.tone}"><div class="mt-bar"><i style="width:${fill}%"></i><u style="left:70%"></u></div><span class="mt-l">${icon('power')}<b>${o.power}</b> vs <b>${run.rec}</b> needed · <b class="rk">${o.risk.label} ${Math.round(o.chance * 100)}%</b></span></div>` +
    `<div class="cr-btns">${isBest ? '' : btn(`Best crew +${bestPow - o.power}`, 'best', {}, 'ghost small')}<button class="mini-btn" type="button" data-act="friends">${icon('squad')} Friends ${friends}/3 <small>+${Math.round(COOP_BONUS * 100)}% scrap each</small></button>${btn(`${icon('play')} Start`, 'start', {}, `primary big${pick.length ? '' : ' off'}`)}</div></div>` +
    `</div>`
  );
}

// --- Results ------------------------------------------------------------------------------

export function results(meta, result, out) {
  const run = result.run;
  const won = out.won;
  const title = !won ? 'YOU DIED' : out.sealed ? 'STREET SEALED' : out.reclaimed ? 'RECLAIMED' : run.type === 'rescue' ? 'RESCUED' : 'SAFE ROOM';
  const xp = out.xp
    .map((x) => {
      const p = meta.person(x.id);
      if (!p) return '';
      const need0 = XP_TO_NEXT[x.from.level - 1] || 1;
      const need1 = p.level >= MAX_LEVEL ? 1 : XP_TO_NEXT[p.level - 1];
      const from = Math.round((x.from.xp / need0) * 100);
      const to = p.level >= MAX_LEVEL ? 100 : Math.round((p.xp / need1) * 100);
      const inj = out.injured.find((i) => i.id === x.id);
      return (
        `<div class="xr${x.ups ? ' up' : ''}" style="--d:${0.3}s"><span class="xr-art">${portraitSvg(p, { hurt: !!inj })}</span><span class="xr-b"><b>${esc(p.first)}</b>` +
        `<span class="xpbar anim" style="--from:${x.ups ? 0 : from}%;--to:${to}%"><i></i></span><small>+${x.gained} XP${x.ups ? ` · <em>LEVEL ${p.level}!</em>` : ` · Lv ${p.level}`}</small></span>` +
        (inj ? `<span class="xr-hurt">${icon('bandage')}${inj.days}d</span>` : '') +
        `</div>`
      );
    })
    .join('');
  const news = [];
  if (out.rescued) news.push(`<div class="r-new">${icon('heart')}<span><b>${esc(out.rescued.first)}</b> is waiting at the gate</span></div>`);
  if (out.found) news.push(`<div class="r-new">${icon('heart')}<span>Found <b>${esc(out.found.first)}</b> hiding out. At the gate now</span></div>`);
  if (out.arrived && out.arrived.length) news.push(`<div class="r-new">${icon('gate')}<span>${out.arrived.length === 1 ? 'Someone knocked' : `${out.arrived.length} people knocked`} while you were out</span></div>`);
  const trained = out.home.filter((h) => h.ups > 0).length;
  if (trained) news.push(`<div class="r-new">${icon('up')}<span>${trained} at home leveled up training</span></div>`);
  const healed = out.healed.map((id) => meta.person(id)).filter(Boolean);
  if (healed.length) news.push(`<div class="r-new">${icon('check')}<span>${healed.map((p) => esc(p.first)).join(', ')} ${healed.length > 1 ? 'are' : 'is'} back on their feet</span></div>`);
  const lines = out.lines.map((l, k) => `<div class="r-line" style="--d:${0.4 + k * 0.15}s"><span>${esc(l.label)}</span>${scrap(l.value)}</div>`).join('');
  const sub = `${esc(run.name)} · ${result.kills} kills · ${fmtTime(result.timeS)}${!won ? ` · made it ${Math.round(result.progress * 100)}%` : result.revived ? ' · revived' : ''}`;
  const btns = won ? btn(`Continue ${icon('arrow')}`, 'close', {}, 'primary big') : `${btn('Back to the street', 'close')}${btn('Try again', 'again', { key: run.key }, 'primary')}`;
  return (
    `<div class="res ${won ? 'won' : 'lost'}">` +
    `<div class="res-l"><div class="kicker">Day ${out.day - 1} · ${esc(RUN_TYPES[run.type].label)}</div><div class="r-title">${title}</div>` +
    (won ? `<div class="r-stars">${[1, 2, 3].map((k) => `<i class="${k <= result.stars ? 'on' : ''}" style="--d:${0.15 + k * 0.22}s">${icon(k <= result.stars ? 'star' : 'starEmpty')}</i>`).join('')}</div>` : '') +
    `<div class="r-sub">${sub}</div><div class="r-lines">${lines}</div>` +
    `<div class="r-total">${scrap(out.scrap, 'big')}${out.gems ? gem(out.gems, 'big') : ''}</div>${news.join('')}<div class="btns">${btns}</div></div>` +
    `<div class="res-r"><div class="sec-h">The crew</div>${xp}</div></div>`
  );
}

// --- Reveals ------------------------------------------------------------------------------

export function reveal(meta, what) {
  if (what.kind === 'reclaim') {
    const b = meta.building(what.id);
    return (
      `<div class="reveal"><div class="rv-burst"></div><div class="kicker">Reclaimed</div><div class="rv-art bld-big">${buildingSvg(b.id, 1)}</div><h1>${esc(b.name)}</h1>` +
      `<p class="desc">${esc(b.blurb)}</p><div class="rv-perk">${icon('up')} New facility: <b>${esc(b.facility)}</b> · ${esc(b.unit(meta.effect(b.id)))}</div>` +
      `<div class="btns">${btn('Move in', 'close', {}, 'primary big')}</div></div>`
    );
  }
  if (what.kind === 'sealed') {
    const st = meta.s.stats;
    return (
      `<div class="reveal sealed"><div class="rv-burst"></div><div class="kicker">Day ${meta.s.day}</div><h1>HOPE STREET IS SAFE</h1>` +
      `<p class="desc">The overpass is down. ${meta.s.people.length} people sleep behind your walls tonight. ${st.takenIn} taken in, ${st.runs} runs, ${fmtNum(st.kills)} infected.</p>` +
      `<p class="next">Keep going: scavenge, train your people, max out every building.</p><div class="btns">${btn('Keep going', 'close', {}, 'primary big')}</div></div>`
    );
  }
  return '';
}

// --- Convoy (long wait) ---------------------------------------------------------------------

export function convoy(meta, opened) {
  const info = meta.convoyInfo();
  if (opened) {
    const p = opened.person;
    return (
      `<div class="reward-open"><div class="kicker">The convoy</div><h2>Supplies, and a new face</h2>` +
      `<div class="r-total">${scrap(opened.scrap, 'big')}${gem(opened.gems, 'big')}</div>` +
      `<div class="cv-p">${portraitSvg(p)}<span><b>${esc(fullName(p))}</b><small>${starsHtml(p.grade)} ${ROLES[p.role].name} · Lv ${p.level}</small><em>Waiting at the gate</em></span></div>` +
      `<div class="btns">${btn('Collect', 'close', {}, 'primary big')}</div></div>`
    );
  }
  return (
    `<div class="reward-wait"><div class="rw-art">${icon('truck')}</div><div class="kicker">Every 8 h</div><h2>The convoy</h2>` +
    `<p class="desc">About ${scrap(info.scrap)} and ${gem(5)}–10 gems, and a <b>Skilled or Elite</b> survivor at your gate.</p>` +
    `<div class="rw-time">${icon('clock')} Arrives in <b data-end="${meta.s.convoy.readyAt}">${fmtTime(info.remaining)}</b></div>` +
    `<div class="btns">${btn(`Bring it now ${gem(info.rushCost)}`, 'rushAsk', {}, 'gem big')}</div></div>`
  );
}

export function confirm({ kicker = '', title, text = '', yes, act, data = {}, cls = 'primary' }) {
  return `<div class="confirm">${kicker ? `<div class="kicker">${kicker}</div>` : ''}<h2>${title}</h2>${text ? `<p class="desc">${text}</p>` : ''}<div class="btns">${btn('Cancel', 'close')}${btn(yes, act, data, `${cls} big`)}</div></div>`;
}

export function intro(meta) {
  const f = meta.s.people;
  return (
    `<div class="intro"><div class="kicker">FUNLAND2 · METAGAME PROTOTYPE</div><h1>HOPE STREET</h1>` +
    `<p>Day one. You and ${esc(f[1] ? f[1].first : 'a friend')} hold the old firehouse. Strangers will come to the gate. Take them in, pick a crew, and take the street back, one building at a time.</p>` +
    `<div class="intro-faces">${f.map((p) => `<span>${portraitSvg(p)}<b>${esc(p.first)}</b><small>${ROLES[p.role].name}</small></span>`).join('')}</div>` +
    `<div class="intro-steps"><div>${icon('gate')}<b>Take people in</b><span>Everyone is different. Beds are limited.</span></div>` +
    `<div>${icon('people')}<b>Pick your crew</b><span>Up to four per run. Roles and traits matter.</span></div>` +
    `<div>${icon('hammer')}<b>Build the street</b><span>Reclaimed buildings become facilities.</span></div></div>` +
    `<div class="btns">${btn('Start', 'close', {}, 'primary big')}</div><p class="hint">Runs are simulated here. The gear (top right) has testing tools.</p></div>`
  );
}
