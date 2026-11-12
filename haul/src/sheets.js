// Long Haul: what the sheets say. Each function returns the HTML of one sheet
// (main.js opens it with Sheets.open and handles its [data-act] buttons).

import { CAST, CAST_ORDER, CLASSES, RARITIES, AREAS, FERRY_STARS, RACK_SIZE, CALL_SECONDS, SQUAD_SIZE, MAX_LEVEL } from './config.js';
import { standLabel } from './rules.js';
import { figureSvg } from './figures.js';
import { icon } from './icons.js';
import { fmtNum, fmtLeft, fmtDuration } from './format.js';
import { face, amount, tokenBar, rarityTag, esc, shortName } from './ui.js';

const closeBtn = () => `<button class="x" type="button" data-act="close" aria-label="Close">${icon('close')}</button>`;

/** A figure standing on a disc of its rarity colour. */
export function stand(id, pose = 'idle', cls = '') {
  const dog = !!CAST[id].look.dog;
  return `<span class="stand r-${CAST[id].rarity} ${cls}"><svg viewBox="${dog ? '-50 -84 100 96' : '-50 -128 100 140'}" aria-hidden="true">${figureSvg(id, pose)}</svg></span>`;
}

// --- The welcome card ------------------------------------------------------------------------

export function welcomeSheet(game) {
  const faces = game.s.squad.map((id) => `<span class="who">${face(id)}<b>${esc(CAST[id].name)}</b><i>${CLASSES[CAST[id].cls].name}</i></span>`).join('');
  return (
    `<div class="welcome">` +
    `<div class="kicker">FUNLAND2 · METAGAME PROTOTYPE</div>` +
    `<h1 class="logo">LONG HAUL</h1>` +
    `<p class="tag">Three go out. Whoever’s still standing carries a crate home.</p>` +
    `<div class="whos">${faces}</div>` +
    `<button class="btn go big" type="button" data-act="start">${icon('play')}Let’s go!</button>` +
    `<p class="fine">Runs are simulated. The gear (top right) has testing tools.</p>` +
    `</div>`
  );
}

// --- One survivor ----------------------------------------------------------------------------

/**
 * @param ui { swapping: bool, cheer: bool }  swapping = picking who sits out for this one
 */
export function survivorSheet(game, id, ui = {}) {
  const c = CAST[id];
  const s = game.s;
  const info = game.levelInfo(id);
  const inSquad = s.squad.includes(id);
  const chance = inSquad ? game.standChance(id) : null;
  let action;
  if (info.max) action = `<div class="note good">Top level. Any more tokens turn into supplies.</div>`;
  else if (info.ok) action = `<button class="btn up big" type="button" data-act="level" data-id="${id}">${icon('up')}<span>LEVEL UP</span>${amount(info.cost)}</button>`;
  else if (!info.hasTokens) action = `<button class="btn up big off" type="button" disabled><span>LEVEL UP</span>${amount(info.cost)}</button><div class="note">${info.need - info.tokens} more token${info.need - info.tokens === 1 ? '' : 's'} to go. Crates and radio calls bring them.</div>`;
  else action = `<button class="btn up big off" type="button" disabled><span>LEVEL UP</span>${amount(info.cost, 'short')}</button><div class="note">${fmtNum(info.cost - s.supplies)} more supplies to go.</div>`;

  let squad;
  if (ui.swapping) {
    squad =
      `<div class="swap"><b>Who sits this one out?</b><div class="swap-row">` +
      s.squad.map((sid, slot) => `<button class="swap-face" type="button" data-act="swap" data-id="${id}" data-slot="${slot}">${face(sid, { level: game.level(sid) })}<span>${shortName(sid)}</span><i>${icon('power')}${game.power(sid)}</i></button>`).join('') +
      `</div><button class="btn plain" type="button" data-act="swap-cancel" data-id="${id}">Never mind</button></div>`;
  } else if (inSquad) squad = `<div class="in-squad">${icon('check')}<span>In the squad</span><small>${icon('danger')}${Math.round(game.danger())} out there:</small><i class="st st-${standLabel(chance).id}">${standLabel(chance).name}</i></div>`;
  else squad = `<button class="btn blue" type="button" data-act="swap-start" data-id="${id}">${icon('swap')}PUT IN THE SQUAD</button>`;

  return (
    closeBtn() +
    `<div class="surv r-${c.rarity}">` +
    `<div class="surv-left">${stand(id, ui.cheer ? 'cheer' : 'idle')}<div class="tags">${rarityTag(id)}<span class="cls">${CLASSES[c.cls].name}</span></div></div>` +
    `<div class="surv-right">` +
    `<h2>${esc(c.name)}</h2>` +
    `<p class="line">“${esc(c.line)}”</p>` +
    `<div class="stats">` +
    `<span class="stat"><small>LEVEL</small><b>${info.level}${info.max ? '' : `<em>/${MAX_LEVEL}</em>`}</b></span>` +
    `<span class="stat"><small>POWER</small><b>${icon('power')}<span data-pw>${info.power}</span>${info.max ? '' : `<em class="plus">→ ${info.nextPower}</em>`}</b></span>` +
    `<span class="stat wide"><small>TOKENS</small>${tokenBar(info)}</span>` +
    `</div>` +
    (ui.swapping ? squad : `<div class="acts">${action}${squad}</div>`) +
    `</div></div>`
  );
}

// --- Everyone --------------------------------------------------------------------------------

export function peopleSheet(game) {
  const s = game.s;
  const owned = game.owned();
  const reach = game.areaIndex();
  const best = game.bestSquad();
  const isBest = best.every((id) => s.squad.includes(id));
  const byPower = (a, b) => game.power(b) - game.power(a) || CAST_ORDER.indexOf(a) - CAST_ORDER.indexOf(b);
  const weakest = game.power(s.squad[game.weakestSlot()]);
  const card = (id) => {
    const c = CAST[id];
    const info = game.levelInfo(id);
    const inSquad = s.squad.includes(id);
    const stronger = !inSquad && info.power > weakest;
    return (
      `<button class="pcard r-${c.rarity}${inSquad ? ' is-squad' : ''}${info.ok ? ' can' : ''}" type="button" data-act="survivor" data-id="${id}">` +
      (inSquad ? `<i class="ribbon">SQUAD</i>` : stronger ? `<i class="ribbon stronger">STRONGER</i>` : '') +
      face(id, { level: info.level }) +
      `<b class="nm">${shortName(id)}</b>` +
      `<span class="pcard-row"><span class="pw">${icon('power')}<b>${info.power}</b></span></span>` +
      tokenBar(info, { compact: true }) +
      (info.ok ? `<span class="upbadge">${icon('up')}</span>` : '') +
      `</button>`
    );
  };
  const unknown = (id) => {
    const c = CAST[id];
    const out = c.area <= reach;
    return (
      `<div class="pcard unknown r-${c.rarity}">` +
      face(id, { unknown: true }) +
      `<b class="nm">${RARITIES[c.rarity].name}</b>` +
      `<span class="where">${out ? `${icon('radio')} Out there. Keep calling.` : `${icon('lock')} ${esc(AREAS[c.area].name)}`}</span>` +
      `</div>`
    );
  };
  const mine = [...s.squad, ...owned.filter((id) => !s.squad.includes(id)).sort(byPower)];
  const rest = CAST_ORDER.filter((id) => !s.cast[id]).sort((a, b) => CAST[a].area - CAST[b].area);
  return (
    closeBtn() +
    `<div class="people-sheet">` +
    `<div class="people-head"><h2>Everyone <em>${owned.length}/${CAST_ORDER.length}</em></h2>` +
    (owned.length > SQUAD_SIZE ? `<button class="btn blue small${isBest ? ' off' : ''}" type="button" data-act="best"${isBest ? ' disabled' : ''}>${icon('power')}${isBest ? 'STRONGEST THREE ARE IN' : 'SEND THE STRONGEST THREE'}</button>` : '') +
    `</div>` +
    `<div class="scroll"><div class="pgrid">${mine.map(card).join('')}${rest.map(unknown).join('')}</div></div>` +
    `</div>`
  );
}

// --- The road --------------------------------------------------------------------------------

export function roadSheet(game) {
  const s = game.s;
  const r = game.road();
  const stops = AREAS.map((a, i) => {
    const reached = i <= r.area;
    const here = i === r.area;
    const voices = CAST_ORDER.filter((id) => CAST[id].area === i && !['odile', 'teo', 'mags'].includes(id));
    return (
      `<div class="stop a-${a.id}${here ? ' here' : ''}${reached ? ' reached' : ''}">` +
      `<div class="stop-top"><i class="num">${i + 1}</i><b>${esc(a.name)}</b><small>${esc(a.sub)}</small></div>` +
      `<div class="stop-facts"><span class="fact">${icon('danger')}<b>${a.danger}</b><small>danger</small></span></div>` +
      `<div class="stop-voices">${voices.length ? `${icon('radio')}${voices.map((id) => face(id, { unknown: !s.cast[id], cls: 'tiny' })).join('')}` : `<small>${i === AREAS.length - 1 ? 'The ferry leaves from here.' : 'Nobody new out here.'}</small>`}</div>` +
      `<div class="stop-foot">${here ? `<span class="here-tag">${icon('check')}YOU ARE HERE</span>` : reached ? `<span class="done-tag">${icon('check')}</span>` : `<span class="gate">${icon('star')}<b>${a.stars}</b></span>`}</div>` +
      `</div>`
    );
  }).join('<i class="road-line"></i>');
  const ferry = `<i class="road-line"></i><div class="stop ferry${s.ferry ? ' reached' : ''}"><div class="stop-top"><i class="num">\u2693</i><b>The ferry</b><small>the LIBERTY BELLE</small></div><div class="stop-voices"><small>${s.ferry ? 'She came. You\u2019re on the next one.' : 'No flare, no ferry.'}</small></div><div class="stop-foot">${s.ferry ? `<span class="done-tag">${icon('check')}</span>` : `<span class="gate">${icon('star')}<b>${FERRY_STARS}</b></span>`}</div></div>`;
  const next = r.next ? r.next.name : 'the ferry';
  return (
    closeBtn() +
    `<div class="road-sheet">` +
    `<div class="people-head"><h2>The road to Pier 9</h2><span class="road-sum">${icon('star')}<b>${fmtNum(s.stars)}</b>${r.left > 0 ? `<small>of ${r.to} to ${esc(next)}</small>` : ''}</span></div>` +
    `<p class="road-how">Everyone still standing after a run carries a crate home. Each one is a star, and stars take you down the road. Further on: more danger, richer crates, new voices on the radio.</p>` +
    `<div class="scroll sideways"><div class="stops">${stops}${ferry}</div></div>` +
    `</div>`
  );
}

// --- The radio tent --------------------------------------------------------------------------

export function radioSheet(game) {
  const rack = game.rack();
  const slots = [];
  for (let i = 0; i < RACK_SIZE; i++) {
    const r = rack[i];
    if (!r) slots.push(`<div class="slot empty"><span class="slot-ic">${icon('radio')}</span><b>Empty</b><small>Find a radio in a crate</small></div>`);
    else if (r.state === 'answered') slots.push(`<button class="slot answered" type="button" data-act="radio"><span class="slot-ic">${icon('radio')}</span><b>Someone answered!</b><small>Tap to pick up</small></button>`);
    else if (r.state === 'calling') slots.push(`<div class="slot calling"><span class="slot-ic">${icon('radio')}</span><b>Calling…</b><small data-until="${r.readyAt}">${fmtLeft(r.left)}</small><span class="bar"><i style="width:${Math.round(r.t * 100)}%"></i></span></div>`);
    else slots.push(`<div class="slot queued"><span class="slot-ic">${icon('radio')}</span><b>Next in line</b><small data-until="${r.readyAt}">${fmtLeft(r.left)}</small></div>`);
  }
  const voices = game.voices();
  const unknown = voices.filter((id) => !game.has(id)).length;
  const full = game.rackRoom() <= 0;
  return (
    closeBtn() +
    `<div class="radio-sheet">` +
    `<h2>${icon('radio')}The radio tent</h2>` +
    `<p class="line">Every haul hides one radio while the rack has room. The tent calls with one at a time (${fmtDuration(CALL_SECONDS)} a call). Someone new moves in; someone you know sends tokens.</p>` +
    `<div class="slots">${slots.join('')}</div>` +
    `<div class="note${full ? ' warn' : ''}">${full ? 'The rack is full: no radios in the crates until a call is picked up. The gold crate takes their place.' : unknown ? `${unknown} voice${unknown === 1 ? '' : 's'} out there you haven’t met.` : 'You know everyone out here. New voices at the next stop on the road.'}</div>` +
    `</div>`
  );
}
