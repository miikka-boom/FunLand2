// Modal sheets: a survivor's card, a building, a chest (contents, every odds
// table, pity, upgrade, open now) and the Skull ladder.
// Each is a render function (state -> html); main.js wires the buttons.

import { CLASSES, RARITIES, RARITY_ORDER, BUILDINGS, CHESTS, ZONES, GRADES, THREATS, GATE_GEMS, CROWN_REWARD } from './config.js';
import { buildingSvg, threatIconSvg } from './art.js';
import { chestSvg } from './chest-art.js';
import { portraitSvg } from './portrait.js';
import { displayName } from './people.js';
import { icon } from './icons.js';
import { fmtNum, fmtTime, fmtDuration } from './format.js';
import { face, rarityTag, classTag, coins, gems, name, full, perkLine, vibeLine, badgeBar, pw } from './kit.js';
import { esc } from './ui.js';

const pct = (v) => (v >= 0.1 ? `${Math.round(v * 100)}%` : v >= 0.01 ? `${(v * 100).toFixed(1)}%` : `1 in ${Math.round(1 / Math.max(v, 1e-9))}`);

// --- Survivor card ---------------------------------------------------------------------------------

export function survivorCard(meta, id, ui) {
  const p = meta.person(id);
  if (!p || !meta.isResident(id)) return null;
  const m = meta;
  const need = m.need(p);
  const cost = m.levelCost(p);
  const sib = p.family != null ? m.s.people.find((q) => q.id !== p.id && q.family === p.family) : null;
  let lvBtn;
  if (need === null) lvBtn = `<button class="btn" type="button" disabled>Max level</button>`;
  else if (p.badges < need) lvBtn = `<button class="btn" type="button" disabled>${icon('badge')}Needs ${need - p.badges} more Badges</button>`;
  else lvBtn = `<button class="btn green big${m.canLevel(p) ? ' glow' : ''}" type="button" data-act="level" data-id="${p.id}">${icon('up')}LEVEL UP ${coins(cost, m.s.coins < cost ? 'short' : '')}</button>`;
  // Chain level-ups: after this one, the next person who can level up is one tap away.
  if (!m.canLevel(p)) {
    const nxt = [...m.squadPeople(), ...m.s.people].find((q) => q.id !== p.id && m.canLevel(q));
    if (nxt) lvBtn += `<button class="btn green" type="button" data-act="card" data-id="${nxt.id}">${icon('arrowRight')}NEXT: ${name(nxt)}</button>`;
  }
  const inSquad = m.inSquad(p.id);
  let sq;
  if (inSquad) sq = `<button class="btn" type="button" data-act="squad" data-id="${p.id}">${icon('check')}In the squad · take out</button>`;
  else if (m.s.squad.length < 3) sq = `<button class="btn blue" type="button" data-act="squad" data-id="${p.id}">${icon('people')}Put in squad</button>`;
  else {
    const pre = m.raidPreview();
    const weak = m.person(pre.members.slice().sort((a, b) => a.power - b.power)[0].id);
    sq = `<button class="btn blue" type="button" data-act="squad" data-id="${p.id}">${icon('swap')}Swap in for ${name(weak)}</button>`;
  }
  const origin = { founder: 'Was here from the start', crate: 'Came in a Supply Crate', vault: 'Came in a Ticket Vault', stray: 'Followed the squad home', gate: 'A gift from a new zone' }[p.origin] || '';
  const next = need === null ? '' : ` <span class="next">→ ${Math.round(m.power(p, p.level + 1))} at Lv ${p.level + 1}</span>`;
  return (
    `<div class="card-sheet c-${p.cls}">` +
    `<div class="cs-left"><div class="cs-face r-${p.rarity}${p.golden ? ' golden' : ''}">${portraitSvg(p, { mood: 'happy' })}<i class="lv">Lv ${p.level}</i></div>` +
    `<div class="cs-tags">${rarityTag(p)}${classTag(p.cls)}</div></div>` +
    `<div class="cs-right scroll">` +
    `<div class="cs-name"><h2>${name(p)}</h2>${p.nick ? `<span class="sub">${full(p)}</span>` : `<span class="sub">${esc(p.last)}</span>`}</div>` +
    `<div class="cs-bio">${p.age} · ${esc(p.job)}${sib ? ` · ${icon('heart')}family of <b>${name(sib)}</b>` : ''}</div>` +
    `<div class="cs-quirk">“${esc(p.quirk)}”</div>` +
    `<div class="cs-lines">${perkLine(p)}${vibeLine(p)}<span class="cline">${threatIconSvg(CLASSES[p.cls].counters)}Counters <b>${THREATS[CLASSES[p.cls].counters].name}</b> (×1.5 power)</span></div>` +
    `<div class="cs-power">${pw(m.power(p))}<span class="pwl">power</span>${next}</div>` +
    badgeBar(p, m) +
    `<div class="btns">${lvBtn}${sq}</div>` +
    `<div class="cs-foot"><span class="note">${esc(origin)}</span><span class="note">${p.raids} raids · ${p.wins} with 3 crowns</span></div>` +
    `</div></div>`
  );
}

// --- Building sheet --------------------------------------------------------------------------------

export function buildingSheet(meta, id) {
  const m = meta;
  const B = BUILDINGS[id];
  if (B.kind === 'chest') return chestSheet(m, id, {});
  const lv = m.s.buildings[id] || 0;
  const up = m.canUpgrade(id);
  const now = lv > 0 ? m.buildingEffect(id, lv).text : 'Locked';
  const nextT = lv > 0 && lv < 7 ? m.buildingEffect(id, lv + 1).text : null;
  let btn;
  if (lv <= 0) btn = `<button class="btn" type="button" disabled>${icon('lock')}${esc(up.reason)}</button>`;
  else if (up.ok) btn = `<button class="btn green big glow" type="button" data-act="upgrade" data-id="${id}">${icon('up')}UPGRADE ${coins(up.cost)}</button>`;
  else if (up.max) btn = `<button class="btn" type="button" disabled>Max level</button>`;
  else if (up.capped) btn = `<button class="btn" type="button" disabled>${icon('lock')}${esc(up.reason)}</button>`;
  else btn = `<button class="btn" type="button" disabled>UPGRADE ${coins(m.upgradeCost(id), 'short')}</button>`;
  let who = '';
  if (B.kind === 'ride') {
    const ppl = m.s.people.filter((p) => p.cls === B.cls).sort((a, b) => m.power(b) - m.power(a));
    who = `<div class="who"><div class="kicker">${CLASSES[B.cls].plural} in the park</div><div class="row">${ppl.length ? ppl.map((p) => `<button class="mini" type="button" data-act="card" data-id="${p.id}">${face(p, { size: 44 })}<b>${name(p)}</b>${pw(m.power(p))}</button>`).join('') : `<span class="note">Nobody yet. ${CLASSES[B.cls].plural} come from chests.</span>`}</div></div>`;
  } else if (B.kind === 'coins') {
    who = `<div class="who"><div class="kicker">Everyone lives here</div><div class="bigline">${icon('people')}<b>${m.s.people.length}</b> survivors</div></div>`;
  }
  return (
    `<div class="bld-sheet">` +
    `<div class="bs-art">${buildingSvg(id, Math.max(1, lv), { locked: lv <= 0 })}</div>` +
    `<div class="bs-right scroll"><div class="kicker">${lv > 0 ? `Level ${lv} of ${m.maxBuildingLevel()} (zone cap)` : `Opens in Zone ${B.zone}`}</div><h2>${esc(B.name)}</h2><p class="desc">${esc(B.blurb)}</p>` +
    `<div class="effect"><span class="now">${esc(now)}</span>${nextT ? `<span class="arrow">${icon('arrowRight')}</span><span class="nxt">${esc(nextT)}</span>` : ''}</div>` +
    `<div class="btns">${btn}</div>${who}</div></div>`
  );
}

// --- Chest sheet -----------------------------------------------------------------------------------

export function chestSheet(meta, kind, ui) {
  const m = meta;
  const info = m.chestInfo(kind);
  const st = m.chestState(kind);
  const C = CHESTS[kind];
  const up = m.canUpgrade(kind);
  const bar = (r, v) => `<div class="oddrow r-${r}"><span>${RARITIES[r].name}</span><i><u style="transform:scaleX(${Math.min(1, v / 100).toFixed(3)})"></u></i><b>${v >= 1 || v === 0 ? Math.round(v) : v.toFixed(1)}%</b></div>`;
  const odds = RARITY_ORDER.filter((r) => info.odds[r] > 0).map((r) => bar(r, info.odds[r])).join('');
  let state;
  if (st.ready) state = `<button class="btn yellow big glow" type="button" data-act="openchest" data-k="${kind}">${icon('gift')}OPEN!</button>`;
  else if (ui.confirm && ui.confirm.kind === 'opennow' && ui.confirm.id === kind) {
    state = `<div class="confirm"><span>Open now for <b>${st.cost}</b> ${icon('gem')}?</span><button class="btn gem" type="button" data-act="opennow2" data-k="${kind}">Yes, open it</button><button class="btn" type="button" data-act="cancel">Wait</button></div>`;
  } else {
    state = `<div class="timer">${icon('clock')}Ready in <b data-end="${st.readyAt}">${fmtTime(st.msLeft / 1000)}</b></div><button class="btn gem" type="button" data-act="opennow" data-k="${kind}"${m.s.gems < st.cost ? ' disabled' : ''}>Open now ${gems(st.cost)}</button>`;
  }
  let upBtn;
  if (up.ok) upBtn = `<button class="btn green" type="button" data-act="upgrade" data-id="${kind}">${icon('up')}Lv ${info.level + 1} ${coins(up.cost)}</button>`;
  else if (up.max) upBtn = `<span class="note">Max level</span>`;
  else upBtn = `<button class="btn small" type="button" disabled>${up.capped ? `${icon('lock')}Lv ${info.level + 1} in Zone ${m.s.zone + 1}` : `Lv ${info.level + 1} ${coins(m.upgradeCost(kind), 'short')}`}</button>`;
  if (ui.confirm && ui.confirm.kind === 'opennow' && ui.confirm.id === kind) upBtn = '';
  const nx = info.next;
  const nextLine = nx ? `<div class="note">Lv ${nx.level}: ${fmtNum(Math.round(nx.coins * 0.85))}–${fmtNum(Math.round(nx.coins * 1.15))} coins, ${nx.badges}±${C.badgeSpread} Badges each${kind === 'crate' ? `, newcomer ${Math.round(nx.newcomer * 100)}%` : ''}, Glow-Up ${Math.round(nx.glow * 100)}% a knock</div>` : '';
  const newcomer = kind === 'crate' ? `${Math.round(info.newcomer * 100)}% chance of a newcomer` : `1 newcomer, Veteran or better${info.second ? ', plus a second' : ''}`;
  return (
    `<div class="chest-sheet k-${kind}">` +
    `<div class="ch-left"><div class="ch-art">${chestSvg(kind, { grade: 0, open: false, glow: st.ready ? 0.7 : 0 })}</div><div class="kicker">Level ${info.level} · every ${fmtDuration(info.period / 1000)}</div>${state}${upBtn}</div>` +
    `<div class="ch-right scroll"><h2>${esc(C.name)}</h2>` +
    `<div class="contents">` +
    `<div class="ci"><span class="amt coin">${icon('coin')}<b>${fmtNum(info.coins[0])}–${fmtNum(info.coins[1])}</b></span><span>coins</span></div>` +
    `<div class="ci">${icon('badge')}<span><b>${info.badges[0]}–${info.badges[1]}</b> Badges for each squad member</span></div>` +
    `<div class="ci">${icon('people')}<span>${newcomer}</span></div>` +
    `<div class="ci">${icon('gem')}<span>${info.gems.chance >= 1 ? `<b>${info.gems.lo}</b> gems` : `${Math.round(info.gems.chance * 100)}% chance of ${info.gems.lo}–${info.gems.hi} gems`}</span></div>` +
    (info.finisher ? `<div class="ci">${icon('badge')}<span><b>${kind === 'vault' ? 'Finisher' : 'Top-up'}:</b> ${info.finisher}+ Badges for the squad member closest to READY</span></div>` : '') +
    `</div>` +
    `<div class="kicker">Newcomer odds, Glow-Ups included</div><div class="oddlist">${odds}</div>` +
    (info.secondOdds ? `<div class="note">The second newcomer uses the Crate's odds.</div>` : '') +
    `<div class="kicker">Glow-Up: each of 3 knocks has a ${Math.round(info.glow * 100)}% chance</div>` +
    `<div class="glowodds"><span class="g1">Silver+ <b>${pct(info.grades.silver)}</b></span><span class="g2">Gold+ <b>${pct(info.grades.gold)}</b></span><span class="g3">Rainbow <b>${pct(info.grades.rainbow)}</b></span></div>` +
    `<div class="note">${GRADES.slice(1).map((g) => `${g.name}: ×${g.mult} loot, ${esc(g.line.toLowerCase())}`).join(' · ')}</div>` +
    `<div class="pity">${icon('crown')}A Legend in at most <b>${info.pityLeft}</b> more chest newcomers</div>` +
    `${nextLine}` +
    `</div></div>`
  );
}

// --- Ladder ----------------------------------------------------------------------------------------

export function ladderSheet(meta) {
  const L = meta.ladder();
  const rew = (it) => {
    if (it.kind === 'gate') return `<div class="lr gate">${icon('zone')}<b>${it.at}</b><span>Zone ${it.zone}: <b>${esc(it.name)}</b> · +${GATE_GEMS} ${icon('gem')}${it.gift ? ` · a ${it.gift.golden ? 'golden ' : ''}${RARITIES[it.gift.rarity].name}${it.gift.cls ? ' ' + CLASSES[it.gift.cls].name : ''} walks in` : ''}</span></div>`;
    const what = it.kind === 'coins' ? coins(it.coins) : it.kind === 'gems' ? gems(it.gems) : `<span class="amt">${icon('badge')}<b>${it.badges}</b></span> for each squad member`;
    return `<div class="lr">${icon('skull')}<b>${it.at}</b><span>${what}</span></div>`;
  };
  const zones = ZONES.map((z) => `<div class="zr${z.n <= L.zone ? ' lit' : ''}${z.n === L.zone ? ' cur' : ''}"><i>${z.n}</i><b>${esc(z.name)}</b><span>${z.gate}</span><em>${esc(z.opens)}</em></div>`).join('');
  return (
    `<div class="ladder-sheet"><div class="ls-left"><div class="kicker">Zone ${L.zone}</div><h2>${esc(L.name)}</h2>` +
    `<div class="bigline">${icon('skull')}<b>${L.skulls}</b> Skulls</div>` +
    `<p class="desc">Raids pay Skulls by crowns: ${CROWN_REWARD.skulls.map((v, i) => `${i}${icon('crown')} ${v > 0 ? '+' : ''}${v}`).join(' · ')}. You never drop below a zone you reached.${L.nextGate ? ` Next zone at <b>${L.nextGate}</b>.` : ''}</p>` +
    `<div class="kicker">Next rewards</div>${L.next3.map(rew).join('')}</div>` +
    `<div class="ls-right scroll"><div class="kicker">The Ferris wheel lights a gondola for each zone</div>${zones}</div></div>`
  );
}

export { pct };
