// What you see when you tap something: the selection bar along the bottom (a
// home, a decoration, the Gas Station, a landmark, a lot) and the people list
// ("Who goes out tonight?"). Each is a render function (state -> html);
// main.js wires the buttons (data-act).

import { CLASSES, DECOR, HOME_TIERS, LANDMARKS, STAGE_NAMES, STATION_STEP, STATION_MAX } from './config.js';
import { tierOf, stageOf, oddsLabel, chanceOf } from './town.js';
import * as A from './art.js';
import { icon } from './icons.js';
import { face, stars, coins, name, power } from './kit.js';
import { esc } from './ui.js';

const moveBtn = (o) => `<button class="btn" type="button" data-act="move" data-id="${o.id}">${A.townIcon('move')}Move</button>`;

/** The bar for a selection: { kind: 'obj', id } or { kind: 'lot', a, b }. null if it's gone. */
export function selBar(town, sel) {
  const html = barFor(town, sel);
  return html && html.replace(/<\/div>$/, `<button class="sel-x" type="button" data-act="deselect" aria-label="Close">${icon('close')}</button></div>`);
}

function barFor(town, sel) {
  if (!sel) return null;
  if (sel.kind === 'lot') return lotBar(town, sel.a, sel.b);
  const o = town.object(sel.id);
  if (!o) return null;
  if (o.kind === 'home') return homeBar(town, o);
  if (o.kind === 'station') return stationBar(town, o);
  if (o.kind === 'landmark') return landmarkBar(town, o);
  return decorBar(town, o);
}

function homeBar(town, o) {
  const p = town.person(o.ref);
  if (!p) return null;
  const s = town.s;
  const t = tierOf(p.level);
  const pick = town.picked();
  const isPick = pick && pick.id === p.id;
  let up;
  const c = town.canUpgrade(p.id);
  if (c.max) up = `<button class="btn" type="button" disabled>${icon('star')}Max level</button>`;
  else {
    const nt = tierOf(p.level + 1);
    const grows = nt !== t ? `→ ${esc(HOME_TIERS[nt].name)}!` : `→ Lv ${p.level + 1}`;
    up = `<button class="btn green big${c.ok ? ' glow' : ''}" type="button" data-act="upgrade" data-id="${p.id}"${c.ok ? '' : ' data-short="1"'}>${icon('up')}<span class="bl"><b>UPGRADE</b><small>${grows}</small></span>${coins(town.levelCost(p), c.ok ? '' : 'short')}</button>`;
  }
  const next = p.level < 10 ? `<span class="nx">→ ${town.power(p, p.level + 1)}</span>` : '';
  const chance = town.chance(p);
  const lab = oddsLabel(chance);
  const go = isPick
    ? `<span class="going">${icon('check')}Goes out tonight <em class="odds o-${s.runs === 0 ? 'easy' : lab.id}">${s.runs === 0 ? 'Easy' : lab.name}</em></span>`
    : `<button class="btn blue" type="button" data-act="pick" data-id="${p.id}">${icon('play')}<span class="bl"><b>SEND OUT</b><small>tonight: ${lab.name}</small></span></button>`;
  return (
    `<div class="sel-in k-home">` +
    `<div class="sel-who">${face(p, { size: 64, mood: 'happy' })}<div class="sel-t"><h3>${name(p)}</h3><div class="sub">${stars(p)}<span class="cls" style="--c:${CLASSES[p.cls].color}">${esc(CLASSES[p.cls].name)}</span></div>` +
    `<div class="sub2">${esc(p.job)}, ${p.age} · ${esc(HOME_TIERS[t].name)}</div></div>` +
    `<div class="sel-pw">${power(town.power(p))}${next}</div></div>` +
    `<div class="sel-acts">${up}${go}${moveBtn(o)}</div>` +
    `</div>`
  );
}

function stationBar(town, o) {
  const lv = town.stationLevel();
  const stage = STAGE_NAMES[stageOf(lv)];
  const nextAt = lv < STATION_MAX ? 1 + lv * STATION_STEP : null;
  return (
    `<div class="sel-in k-station"><div class="sel-who"><span class="sel-ic">${A.townIcon('flag')}</span><div class="sel-t"><h3>Gas Station</h3><div class="sub"><b>${esc(stage)}</b>${lv >= STATION_MAX ? ' · with gold trim' : ''}</div>` +
    `<div class="sub2">${nextAt ? `It fixes itself up as you win nights. Next look on <b>Night ${nextAt}</b>.` : 'As good as it gets. Look at it shine.'}</div></div></div>` +
    `<div class="sel-acts">${moveBtn(o)}</div></div>`
  );
}

function landmarkBar(town, o) {
  const L = LANDMARKS[o.ref];
  return (
    `<div class="sel-in k-landmark"><div class="sel-who"><span class="sel-ic">${A.townIcon('landmark')}</span><div class="sel-t"><h3>${esc(L.name)}</h3><div class="sub">Restored</div>` +
    `<div class="sub2">${esc(L.boss.charAt(0).toUpperCase() + L.boss.slice(1))} is gone for good.</div></div></div>` +
    `<div class="sel-acts">${moveBtn(o)}</div></div>`
  );
}

function decorBar(town, o) {
  const d = DECOR[o.ref];
  return (
    `<div class="sel-in k-decor"><div class="sel-who"><span class="sel-art">${A.decoration(o.ref).svg}</span><div class="sel-t"><h3>${esc(d ? d.name : o.ref)}</h3>` +
    `<div class="sub2">Just for fun. People love it.</div></div></div>` +
    `<div class="sel-acts">${moveBtn(o)}</div></div>`
  );
}

function lotBar(town, a, b) {
  const info = town.lotInfo(a, b);
  if (!info || info.owned) return null;
  const what = info.kind === 'L' ? `Restores the <b>${esc(info.landmarkInfo.name)}</b>` : info.kind === '?' ? 'A surprise inside!' : 'More room to build';
  let btn;
  if (!info.frontier) btn = `<span class="going">${A.townIcon('lot')}Clear a lot next to it first</span>`;
  else {
    const can = info.can.ok;
    btn = `<button class="btn green big${can ? ' glow' : ''}" type="button" data-act="clear" data-a="${a}" data-b="${b}"${can ? '' : ' data-short="1"'}>${A.townIcon('lot')}<span class="bl"><b>CLEAR</b><small>it's yours</small></span>${coins(info.price, can ? '' : 'short')}</button>`;
  }
  return (
    `<div class="sel-in k-lot"><div class="sel-who"><span class="sel-ic">${A.townIcon(info.kind === 'L' ? 'landmark' : info.kind === '?' ? 'mystery' : 'lot')}</span><div class="sel-t"><h3>${esc(info.name)}</h3><div class="sub">${what}</div>` +
    `<div class="sub2">${esc(info.teaser)}</div></div></div>` +
    `<div class="sel-acts">${btn}</div></div>`
  );
}

// --- Who goes out tonight? ------------------------------------------------------------------------------

export function peopleSheet(town) {
  const s = town.s;
  const pick = town.picked();
  const T = town.threat();
  const rows = s.people
    .slice()
    .sort((x, y) => town.power(y) - town.power(x) || y.id - x.id)
    .map((p) => {
      const ch = s.runs === 0 ? 1 : chanceOf(town.power(p), T);
      const lab = oddsLabel(ch);
      const on = pick && pick.id === p.id;
      return (
        `<button class="prow${on ? ' on' : ''}" type="button" data-act="pick" data-id="${p.id}">` +
        `${face(p, { size: 48 })}<span class="pn"><b>${name(p)}</b>${stars(p, { label: false })}</span>` +
        `${power(town.power(p))}<em class="odds o-${lab.id}">${lab.name}</em>${on ? `<i class="ck">${icon('check')}</i>` : ''}</button>`
      );
    })
    .join('');
  return `<div class="people-sheet"><h2>Who goes out tonight?</h2><p class="sub">Night ${s.night}. Stronger survivors have better odds.</p><div class="prows scroll">${rows}</div></div>`;
}

