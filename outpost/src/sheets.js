// Modal sheets: a survivor's card, a building, a chest (contents, every odds
// table, pity, upgrade, open now), the Skull ladder, and Last Stop's lot card,
// landmark, decoration and rename sheets.
// Each is a render function (state -> html); main.js wires the buttons.

import { CLASSES, RARITIES, RARITY_ORDER, BUILDINGS, CHESTS, ZONES, GRADES, THREATS, GATE_GEMS, CROWN_REWARD, LOTS, LOT_KINDS, LANDMARKS, DECOR, KEEPSAKES, SETS, HOME_TIERS, TOWN_COLORS, CACHE, LOT_GLOW, MYSTERY, WISH } from './config.js';
import { threatIconSvg } from './thrill-art.js';
import * as A from './art.js';
import { tierOf, ringOf } from './town.js';
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
  const origin = { founder: 'Was here from the start', crate: 'Came in a Supply Crate', vault: 'Came in the Bank Vault', stray: 'Followed the squad home', gate: 'A gift from a new zone', rescue: 'Rescued when a lot was cleared', trunk: 'Was hiding in a junk pile', mystery: 'Found in a mystery lot', radio: 'Answered the radio call' }[p.origin] || '';
  // Last Stop: where they live, their wish, their keepsake, lots named after them.
  const home = m.homeOf(p.id);
  const tier = HOME_TIERS[tierOf(p.level)];
  const nextTier = HOME_TIERS[tierOf(p.level) + 1];
  const lives = home ? `${A.townIcon('home')}Lives in a <b>${esc(tier.name.toLowerCase())}</b>${nextTier ? ` <span class="next">→ ${esc(nextTier.name.toLowerCase())} at Lv ${nextTier.from}</span>` : ''}` : `${A.townIcon('home')}Camping on the Gas Station roof`;
  const wish = m.s.wish && m.s.wish.id === p.id ? `<span class="cline wishl">${icon('heart')}${m.s.wish.set ? `Would love something <b>${esc(SETS[m.s.wish.set].name)}</b> by ${p.pronoun === 'she' ? 'her' : p.pronoun === 'he' ? 'his' : 'their'} home` : `Wants to live near <b>${name(m.person(m.s.wish.sib))}</b>`}</span>` : '';
  const ks = m.s.objects.find((o) => o.kind === 'keepsake' && o.owner === p.id) || m.s.box.find((x) => x.kind === 'keepsake' && x.owner === p.id);
  const keep = ks ? `<span class="cline">${A.townIcon('set')}${name(p)}'s ${esc(KEEPSAKES[ks.ref].name)}${ks.i === undefined ? ' (in the box)' : ''}</span>` : '';
  const named = Object.values(m.s.lots).filter((l) => l.mvp === p.id).map((l) => esc(l.name));
  const namedLine = named.length ? `<span class="cline">${A.townIcon('flag')}Named: <b>${named.join(', ')}</b></span>` : '';
  const hearts = p.hearts ? `<span class="cline">${icon('heart')}<b>${p.hearts}</b> wish${p.hearts > 1 ? 'es' : ''} granted</span>` : '';
  const next = need === null ? '' : ` <span class="next">→ ${Math.round(m.power(p, p.level + 1))} at Lv ${p.level + 1}</span>`;
  return (
    `<div class="card-sheet c-${p.cls}">` +
    `<div class="cs-left"><div class="cs-face r-${p.rarity}${p.golden ? ' golden' : ''}">${portraitSvg(p, { mood: 'happy' })}<i class="lv">Lv ${p.level}</i></div>` +
    `<div class="cs-tags">${rarityTag(p)}${classTag(p.cls)}</div></div>` +
    `<div class="cs-right scroll">` +
    `<div class="cs-name"><h2>${name(p)}</h2>${p.nick ? `<span class="sub">${full(p)}</span>` : `<span class="sub">${esc(p.last)}</span>`}</div>` +
    `<div class="cs-bio">${p.age} · ${esc(p.job)}${sib ? ` · ${icon('heart')}family of <b>${name(sib)}</b>` : ''}</div>` +
    `<div class="cs-quirk">“${esc(p.quirk)}”</div>` +
    `<div class="cs-lines">${wish}${perkLine(p)}${vibeLine(p)}<span class="cline">${threatIconSvg(CLASSES[p.cls].counters)}Counters <b>${THREATS[CLASSES[p.cls].counters].name}</b> (×1.5 power)</span><span class="cline">${lives}</span>${keep}${namedLine}${hearts}</div>` +
    `<div class="cs-power">${pw(m.power(p))}<span class="pwl">power</span>${next}</div>` +
    badgeBar(p, m) +
    `<div class="btns">${lvBtn}${sq}<button class="btn" type="button" data-act="showhome" data-id="${p.id}">${A.townIcon('focus')}${home ? 'Show home' : 'Find a spot'}</button></div>` +
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
    who = `<div class="who"><div class="kicker">${CLASSES[B.cls].plural} in town</div><div class="row">${ppl.length ? ppl.map((p) => `<button class="mini" type="button" data-act="card" data-id="${p.id}">${face(p, { size: 44 })}<b>${name(p)}</b>${pw(m.power(p))}</button>`).join('') : `<span class="note">Nobody yet. ${CLASSES[B.cls].plural} come from chests.</span>`}</div></div>`;
  } else if (B.kind === 'coins') {
    const tiers = ['Planks and tyres', 'Painted tin', 'Brick and lamps', 'String lights and flags'];
    who = `<div class="who"><div class="kicker">Your town</div><div class="bigline">${icon('people')}<b>${m.s.people.length}</b> survivors · ${A.townIcon('lot')}<b>${m.lotCount()}</b> lots</div><div class="note">The fence: ${tiers[m.fenceTier()]}. It grows with the Gas Station (Lv 3, 5 and 7).</div></div>`;
  }
  return (
    `<div class="bld-sheet">` +
    `<div class="bs-art iso">${A.building(id, Math.max(1, lv), m.s.town).svg}</div>` +
    `<div class="bs-right scroll"><div class="kicker">${lv > 0 ? `Level ${lv} of ${m.maxBuildingLevel()} (zone cap)` : `Opens in Zone ${B.zone}`}</div><h2>${esc(B.name)}</h2><p class="desc">${esc(B.blurb)}</p>` +
    `<div class="effect"><span class="now">${esc(now)}</span>${nextT ? `<span class="arrow">${icon('arrowRight')}</span><span class="nxt">${esc(nextT)}</span>` : ''}</div>` +
    `<div class="btns">${btn}${lv > 0 ? `<button class="btn" type="button" data-act="liftb" data-id="${id}">${A.townIcon('move')}Move</button>` : ''}</div>${who}</div></div>`
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
    const what = it.kind === 'coins' ? coins(it.coins) : it.kind === 'gems' ? gems(it.gems) : it.kind === 'decor' ? `${A.townIcon('set')}a <b>${esc(DECOR[it.decor].name)}</b>` : `<span class="amt">${icon('badge')}<b>${it.badges}</b></span> for each squad member`;
    return `<div class="lr">${icon('skull')}<b>${it.at}</b><span>${what}</span></div>`;
  };
  const zones = ZONES.map((z) => `<div class="zr${z.n <= L.zone ? ' lit' : ''}${z.n === L.zone ? ' cur' : ''}"><i>${z.n}</i><b>${esc(z.name)}</b><span>${z.gate}</span><em>${esc(z.opens)}</em></div>`).join('');
  return (
    `<div class="ladder-sheet"><div class="ls-left"><div class="kicker">Zone ${L.zone}</div><h2>${esc(L.name)}</h2>` +
    `<div class="bigline">${icon('skull')}<b>${L.skulls}</b> Skulls</div>` +
    `<p class="desc">Raids pay Skulls by crowns: ${CROWN_REWARD.skulls.map((v, i) => `${i}${icon('crown')} ${v > 0 ? '+' : ''}${v}`).join(' · ')}. You never drop below a zone you reached.${L.nextGate ? ` Next zone at <b>${L.nextGate}</b>.` : ''}</p>` +
    `<div class="kicker">Next rewards</div>${L.next3.map(rew).join('')}</div>` +
    `<div class="ls-right scroll"><div class="kicker">The station's pole flies a flag for each zone</div>${zones}</div></div>`
  );
}

// --- Lot card ---------------------------------------------------------------------------------------

const PRIZE_LINES = {
  R: (m, a, b) => `A survivor, Veteran or better${ringOf(a, b) >= 2 ? '. Starts at Silver: Hero or better' : ''}. A Glow-Up makes it a Hero, Rainbow a Legend.`,
  C: (m) => `About ${CACHE.coins(m.s.zone)} coins and ${CACHE.gems} gems, ×1.5 / ×2 / ×3 if it Glows Up.`,
  D: (m, a, b, L) => `The ${esc(DECOR[Object.keys(DECOR).find((k) => DECOR[k].set === L.set && DECOR[k].signature)].name)} and two ${esc(SETS[L.set].name)} pieces. Glow-Ups turn them rare.`,
  '?': () => `Who knows? A Legend, a golden Hero, a long-lost sibling, a giant decoration or 50 gems.`,
  L: (m, a, b, L) => `Restore it: <b>${esc(LANDMARKS[L.landmark].bonus)}</b>, forever. Plus 20 gems.`,
};

export function lotCard(meta, a, b) {
  const m = meta;
  const info = m.lotInfo(a, b);
  if (!info) return null;
  const L = LOTS[info.key];
  if (info.owned) {
    const r = info.record;
    const by = (r.by || []).map((id) => m.person(id)).filter(Boolean).map((p) => name(p));
    const lm = L.landmark ? `<div class="effect"><span class="now">${A.townIcon('landmark')}${esc(LANDMARKS[L.landmark].bonus)}</span></div>` : '';
    return (
      `<div class="lot-sheet owned"><div class="kicker">${L.kind === 'S' ? 'Home' : `Cleared day ${r.day}`}</div><h2>${esc(r.name)}</h2>` +
      (by.length ? `<p class="desc">Cleared by ${by.join(', ').replace(/, ([^,]*)$/, ' & $1')}.</p>` : `<p class="desc">${esc(L.teaser)}</p>`) +
      lm +
      `</div>`
    );
  }
  const kind = LOT_KINDS[L.kind];
  const c = info.can;
  let btn;
  if (c.ok) btn = `<button class="btn green big glow" type="button" data-act="clear" data-k="${info.key}">${A.townIcon('build')}CLEAR ${coins(info.price)}</button>`;
  else if (c.capped) btn = `<button class="btn" type="button" disabled>${icon('lock')}${esc(c.reason)}</button>`;
  else if (c.far) btn = `<button class="btn" type="button" disabled>${icon('lock')}Clear a lot next to it first</button>`;
  else btn = `<button class="btn" type="button" disabled>CLEAR ${coins(info.price, 'short')}</button>`;
  const knocks = L.kind === 'L' ? '' : `<div class="note">The prize knocks three times: each knock has a ${Math.round((LOT_GLOW + m.glowExtra()) * 100)}% Glow-Up chance.</div>`;
  void MYSTERY;
  return (
    `<div class="lot-sheet"><div class="kicker">${A.townIcon(({ R: 'rescue', C: 'cache', D: 'set', L: 'landmark', '?': 'mystery' })[L.kind])}${esc(kind.name)}</div><h2>${esc(L.name)}</h2>` +
    `<p class="teaser">“${esc(L.teaser)}”</p>` +
    `<div class="prize">${PRIZE_LINES[L.kind](m, a, b, L)}</div>${knocks}` +
    `<div class="btns">${btn}</div><div class="note">Land ${m.lotCount()}/${m.landCap()}. Every cleared lot leaves junk piles to pop.</div></div>`
  );
}

// --- Landmark, decoration, keepsake sheets -----------------------------------------------------------

export function landmarkSheet(meta, id) {
  const m = meta;
  const Lm = LANDMARKS[id];
  const r = m.s.restored[id];
  const by = r ? (r.by || []).map((x) => m.person(x)).filter(Boolean).map((p) => name(p)) : [];
  return (
    `<div class="bld-sheet"><div class="bs-art iso">${A.landmark(id, !!r).svg}</div><div class="bs-right scroll">` +
    `<div class="kicker">Landmark</div><h2>${esc(Lm.name)}</h2>` +
    `<div class="effect"><span class="now">${A.townIcon('landmark')}${esc(Lm.bonus)}</span></div>` +
    (r ? `<p class="desc">Restored day ${r.day}${by.length ? ` by ${by.join(', ').replace(/, ([^,]*)$/, ' & $1')}` : ''}. ${esc(Lm.banner)}</p>` : `<p class="desc">${esc(Lm.boss)} waves from the top.</p>`) +
    `</div></div>`
  );
}

export function decorSheet(meta, o) {
  const m = meta;
  let title;
  let line = '';
  let art;
  if (o.kind === 'decor') {
    const d = DECOR[o.ref];
    title = d.name;
    art = A.decor(o.ref);
    line = `<span class="setline">${A.setBadge(d.set)}<b>${esc(SETS[d.set].name)}</b> set${d.rare ? ' · rare' : d.signature ? ' · signature' : ''}</span>`;
    const w = m.s.wish;
    if (w && w.set === d.set) {
      const p = m.person(w.id);
      if (p) line += `<span class="cline wishl">${icon('heart')}<b>${name(p)}</b> wishes for one of these within ${WISH.range} tiles of ${p.pronoun === 'she' ? 'her' : p.pronoun === 'he' ? 'his' : 'their'} home.</span>`;
    }
  } else if (o.kind === 'keepsake') {
    const owner = m.person(o.owner);
    title = `${owner ? `${displayName(owner)}'s ` : ''}${KEEPSAKES[o.ref].name}`;
    art = A.keepsake(o.ref);
    line = `<span class="note">A keepsake. ${owner ? `${name(owner)} brought it when they moved in.` : ''}</span>`;
  } else if (o.kind === 'souvenir') {
    const z = ZONES.find((zz) => zz.souvenir === o.ref);
    title = `Souvenir from ${z ? z.name : 'the road'}`;
    art = A.souvenir(o.ref);
  } else if (o.kind === 'statue') {
    title = "Founders' Statue";
    art = A.statue();
    line = `<span class="note">${m.s.people
      .filter((p) => p.origin === 'founder')
      .map((p) => name(p))
      .join(', ')}, in gold. Day 7 and still standing.</span>`;
  } else return null;
  return (
    `<div class="bld-sheet small"><div class="bs-art iso">${art.svg}</div><div class="bs-right scroll"><h2>${esc(title)}</h2>${line}` +
    `<div class="btns"><button class="btn blue" type="button" data-act="liftobj" data-id="${o.id}">${A.townIcon('move')}Move</button><button class="btn" type="button" data-act="boxobj" data-id="${o.id}">${A.townIcon('box')}Box it</button></div></div></div>`
  );
}

// --- Rename -------------------------------------------------------------------------------------------

export function renameSheet(meta, ui) {
  const m = meta;
  const ideas = ui.nameIdeas || m.nameIdeas();
  ui.nameIdeas = ideas;
  const col = ui.nameColor || m.s.town.color;
  return (
    `<div class="rename-sheet"><div class="kicker">${A.townIcon('rename')}Name your town</div><h2>One gas station. One whole town to take back.</h2>` +
    `<div class="ideas">${ideas.map((n) => `<button class="btn${ui.nameDraft === n ? ' blue' : ''}" type="button" data-act="nameidea" data-k="${esc(n)}">${esc(n)}</button>`).join('')}<button class="btn small" type="button" data-act="namemore">${icon('swap')}More</button></div>` +
    `<input class="tname-in" type="text" maxlength="18" placeholder="Or type your own" value="${esc(ui.nameDraft || '')}">` +
    `<div class="colors">${TOWN_COLORS.map((c) => `<button type="button" class="sw${c === col ? ' on' : ''}" data-act="namecolor" data-k="${c}" style="background:${c}" aria-label="Flag colour"></button>`).join('')}</div>` +
    `<div class="btns"><button class="btn green big" type="button" data-act="namesave">${icon('check')}That's our town</button><button class="btn" type="button" data-act="nameskip">Skip</button></div></div>`
  );
}

export { pct };
