// Last Stop: boot, frame loop, saving, and the flow between the town map, the
// chests, the crew, raids, clearing lots, placing things and every sheet.
// Raids are simulated; this prototype is not connected to the action game.

import { Town, newTownState } from './town.js';
import { Clock } from './clock.js';
import { loadState, saveState, clearState, clearTuning, migrate, loadTuning, saveTuning, SAVE_KEY } from './save.js';
import { BUILDINGS, CLASSES, ZONES, THREATS, TUNING_DEFAULTS, RARITIES, GATE_GEMS, DECOR, KEEPSAKES, LOTS, LANDMARKS, LOT, SETS, GRADES, HOME_TIERS } from './config.js';
import { TownMap } from './map.js';
import { BuildDrawer } from './build.js';
import { Hud } from './hud.js';
import { Modals, Toasts, esc, wait } from './ui.js';
import { survivorCard, buildingSheet, chestSheet, ladderSheet, lotCard, landmarkSheet, decorSheet, renameSheet } from './sheets.js';
import { ChestOpening, revealNewcomer, driver, fadeStamp } from './opening.js';
import { RaidView } from './raid-view.js';
import { Crew } from './crew.js';
import { Fx } from './fx.js';
import { Sfx } from './audio.js';
import { Dev } from './dev.js';
import { icon } from './icons.js';
import * as A from './art.js';
import { zoneBackdropSvg } from './thrill-art.js';
import { coinSvg, gemSvg } from './chest-art.js';
import { face, name, threatChip } from './kit.js';
import { lotKey, tierOf } from './town.js';
import { tileToWorld } from './iso.js';

// --- State -------------------------------------------------------------------------------------------

const tuning = loadTuning();
let state = loadState();
const firstVisit = !state;
if (!state) state = newTownState(Date.now());
const clock = new Clock(state.clockOffset || 0);
const meta = new Town(state, { clock, tuning });

const $ = (id) => document.getElementById(id);
const sfx = new Sfx();
sfx.setVolume(tuning.volume);
const sound = (n, o) => sfx.play(n, o);
const toasts = new Toasts($('toasts'));
const fx = new Fx($('fx'));
const ui = { confirm: null, chestSheet: null, undo: null };
let busy = false;
let resetting = false;
let staleTab = false;

/** Busy: a sequence is playing. Taps are locked; walkers keep walking only if `walk`. */
function setBusy(v, { walk = false } = {}) {
  busy = v;
  document.body.classList.toggle('busy', v);
  map.locked = v;
  map.paused = v && !walk;
}

const haptic = (ms) => {
  if (!tuning.haptics) return;
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    // unsupported
  }
};

function save() {
  if (resetting || staleTab) return;
  state.clockOffset = clock.offset;
  if (!document.hidden) meta.touch();
  saveState(state);
}

addEventListener('storage', (e) => {
  if (e.key !== SAVE_KEY || resetting || staleTab) return;
  staleTab = true;
  if (!document.hidden) showStale();
});
function showStale() {
  if (document.getElementById('stale')) return;
  const el = document.createElement('div');
  el.id = 'stale';
  el.innerHTML = `<div class="tc-in"><h2>Playing in another tab</h2><p>Last Stop was saved from another tab or window.</p><button class="btn yellow big" type="button">Play here</button></div>`;
  el.addEventListener('click', () => location.reload());
  document.body.appendChild(el);
}

const modals = new Modals($('modals'), { onAct: (a, d, el) => act(a, d, el), now: () => meta.now(), sound });
const hud = new Hud($('hud'), meta, (a, d, el) => act(a, d, el));
const map = new TownMap($('map'), meta, {
  sound,
  fx,
  onObject: (o, el) => guard(() => tapObject(o, el)),
  onPerson: (id) => guard(() => openCard(id)),
  onLot: (a, b) => guard(() => openLot(a, b)),
  onJunk: (id, el) => guard(() => popJunk(id, el)),
  onWish: () => guard(() => wishTap()),
  onGift: (el) => guard(() => claimGift(el)),
  onChest: (k) => guard(() => chestTap(k)),
  onCampers: () => guard(() => openDrawer('homes')),
  onVisitor: (el) => guard(() => bonkVisitor(el)),
  onGround: (i, j) => guard(() => tapGround(i, j)),
  onKit: (kit) => showKit(kit),
  onPlaceOk: () => placeOk(),
  onLift: () => !busy,
  onLifted: (o) => {
    hud.setMode('lift');
    hud.showBox(meta.isBoxable(o));
    drawer.hide(true);
  },
  onDropped: () => afterPlaceUi(),
  onMoved: (r, o) => moved(r, o),
  onBox: (o) => boxObject(o),
  onPaintFail: (r) => toasts.show(esc(r.reason), 'warn'),
  onPainted: () => save(),
  onCamera: () => {},
});
const drawer = new BuildDrawer($('drawer'), meta, (k, d, el) => drawerPick(k, d, el));
const overlay = $('overlay');
const opening = new ChestOpening(overlay, { meta, hud, park: map, fx, sound, haptic });
const raidView = new RaidView(overlay, { meta, hud, fx, sound, haptic });
const crew = new Crew(overlay, {
  meta,
  sound,
  fx,
  onCard: (id) => openCard(id),
  onGo: () => startRaid(),
  onChange: () => {
    save();
    refresh();
  },
});
const dev = new Dev($('dev'), {
  meta,
  clock,
  toast: (m) => toasts.show(esc(m)),
  onTuning: (key) => {
    if (key === '*defaults') Object.assign(tuning, TUNING_DEFAULTS);
    saveTuning(tuning);
    sfx.setVolume(tuning.volume);
    refresh();
  },
  onCheat: (fn) => {
    const r = fn();
    save();
    refresh(true);
    if (r && r.zones && r.zones.length) {
      dev.hide();
      setBusy(true);
      (async () => {
        try {
          for (const z of r.zones) await zoneSplash(z);
        } catch (e) {
          recover(e);
        } finally {
          setBusy(false);
          save();
          refresh(true);
        }
      })();
    }
    if (r && r.clearedLot) map.resetZeds();
    return r;
  },
  onReset: () => {
    resetting = true;
    clearState();
    clearTuning();
    location.reload();
  },
  onExport: async () => {
    save();
    try {
      await navigator.clipboard.writeText(JSON.stringify(state));
      toasts.show('Save copied');
    } catch {
      const box = $('dev').querySelector('.savebox');
      box.classList.remove('hidden');
      box.value = JSON.stringify(state);
      box.select();
    }
  },
  onImport: (txt) => {
    try {
      const obj = JSON.parse(txt);
      if (!obj || !Array.isArray(obj.people) || !obj.people.length) throw new Error('not a save');
      const s = migrate(obj);
      resetting = true;
      saveState(s);
      location.reload();
    } catch {
      toasts.show('That save did not load', 'warn');
    }
  },
  town: true,
});

{
  const mo = modals.open.bind(modals);
  modals.open = (...args) => {
    arm();
    return mo(...args);
  };
  const co = crew.open.bind(crew);
  crew.open = () => {
    arm();
    closeDrawer();
    co();
  };
  const ds = dev.show.bind(dev);
  dev.show = () => {
    arm();
    ds();
  };
  // Back closes the drawer, a ghost or a lifted thing too.
  const dop = drawer.open.bind(drawer);
  drawer.open = (...a) => {
    arm();
    return dop(...a);
  };
  const sp = map.startPlace.bind(map);
  map.startPlace = (...a) => {
    arm();
    return sp(...a);
  };
  const lf = map.lift.bind(map);
  map.lift = (...a) => {
    arm();
    return lf(...a);
  };
  // Housewarming visits wait for the Crew screen to close (GO! still starts the raid first).
  const cc = crew.close.bind(crew);
  crew.close = (...a) => {
    const r = cc(...a);
    Promise.resolve(r).then(() =>
      setTimeout(() => {
        if (!busy && !crew.isOpen && !modals.isOpen && ui.housewarm && ui.housewarm.length) housewarming();
      }, 0),
    );
    return r;
  };
}

function refresh(full = false) {
  map.step = meta.nextStep();
  map.hotLot = map.step.kind === 'lot' ? map.step.key : null;
  hud.update();
  map.update(full);
  if (drawer.isOpen) drawer.render();
  if (modals.isOpen) modals.render();
  if (crew.isOpen) crew.render();
}

function guard(fn) {
  if (busy || crew.isOpen) return;
  sfx.unlock();
  fn();
}

function recover(e) {
  console.error(e);
  overlay.innerHTML = '';
  overlay.classList.remove('on');
  hud.thaw();
  map.paused = false;
  map.locked = false;
  toasts.show('Oops, that went wrong. The game carries on.', 'warn');
}

const DOUBLE_TAP = 380;
let lastAct = { key: '', t: 0 };

// --- Actions ----------------------------------------------------------------------------------------

function act(a, d, el) {
  sfx.unlock();
  const id = d && d.id !== undefined ? (Number.isNaN(Number(d.id)) ? d.id : Number(d.id)) : null;
  if (a !== 'hint') {
    const key = `${a}:${id ?? (d && d.k) ?? ''}`;
    const now = performance.now();
    if (key === lastAct.key && now - lastAct.t < DOUBLE_TAP) return;
    lastAct = { key, t: now };
  }
  switch (a) {
    case 'hint':
      return showHint();
    case 'dev':
      return dev.toggle();
    case 'ladder':
      if (!busy) openLadder();
      return;
    case 'rename':
      if (!busy) openRename();
      return;
    case 'chest':
      if (!busy && !crew.isOpen) chestTap(d.k);
      return;
    case 'build':
      if (busy) return;
      if (drawer.isOpen) return closeDrawer();
      return openDrawer();
    case 'crew':
      if (!busy) {
        modals.close();
        crew.open();
      }
      return;
    case 'home': {
      const st = meta.station();
      map.glide(st.i + 3.5, st.j + 3.5, { zoom: Math.max(0.85, map.view.cam.zoom) });
      return;
    }
    case 'undo':
      return undoMove();
    case 'face': {
      if (busy) return;
      const p = meta.person(id);
      if (p && meta.canLevel(p)) return openCard(id);
      modals.close();
      crew.open();
      return;
    }
    case 'best':
      return useBest(el);
    case 'play':
      if (!busy) startRaid();
      return;
    case 'card':
      return openCard(id);
    case 'level':
      return levelUp(id, el);
    case 'squad': {
      const p = meta.person(id);
      const wasIn = meta.inSquad(id);
      const before = meta.s.squad.slice();
      const r = wasIn ? meta.toggleSquad(id) : meta.s.squad.length < 3 ? meta.toggleSquad(id) : replaceWeakest(id);
      if (!r.ok) {
        sound('error');
        toasts.show(esc(r.reason), 'warn');
      } else {
        sound('tap');
        const out = before.find((x) => !meta.s.squad.includes(x) && x !== id);
        const o = out != null ? meta.person(out) : null;
        toasts.show(wasIn ? `<b>${name(p)}</b> left the squad` : `<b>${name(p)}</b> joins the squad${o ? ` (for ${name(o)})` : ''}`);
      }
      save();
      return refresh();
    }
    case 'showhome':
      modals.close();
      return showHome(id);
    case 'cancel':
      ui.confirm = null;
      return modals.render();
    case 'upgrade':
      return upgrade(id, el);
    case 'liftb': {
      modals.close();
      const o = meta.s.objects.find((x) => x.kind === 'building' && x.ref === id);
      if (o) liftByTap(o);
      return;
    }
    case 'liftobj': {
      modals.close();
      const o = meta.object(id);
      if (o) liftByTap(o);
      return;
    }
    case 'boxobj': {
      modals.close();
      const o = meta.object(id);
      if (o) boxObject(o);
      return;
    }
    case 'clear': {
      const [a2, b2] = d.k.split(',').map(Number);
      modals.close();
      return clearLot(a2, b2);
    }
    case 'openchest':
      modals.close();
      return chestTap(d.k);
    case 'opennow':
      ui.confirm = { kind: 'opennow', id: d.k };
      modals.render();
      modals.guard(450);
      return;
    case 'opennow2': {
      const r = meta.openNow(d.k);
      ui.confirm = null;
      if (!r.ok) {
        sound('error');
        toasts.show(esc(r.reason), 'warn');
        return modals.render();
      }
      sound('gem');
      save();
      modals.close();
      return chestTap(d.k);
    }
    case 'nameidea':
      ui.nameDraft = d.k;
      sound('tap');
      return modals.render();
    case 'namemore':
      meta.s.seen.nameRolls = (meta.s.seen.nameRolls || 0) + 1;
      ui.nameIdeas = meta.nameIdeas();
      return modals.render();
    case 'namecolor':
      ui.nameColor = d.k;
      sound('tap');
      return modals.render();
    case 'namesave':
      return saveName();
    case 'nameskip':
      meta.s.town.named = true;
      save();
      return modals.close();
    default:
  }
}

function replaceWeakest(id) {
  const pre = meta.raidPreview();
  const weakest = pre.members.slice().sort((a, b) => a.power - b.power)[0];
  const slot = meta.s.squad.indexOf(weakest.id);
  return meta.putInSlot(id, slot);
}

function useBest(el) {
  const before = meta.raidPreview().S;
  const r = meta.useBest();
  if (!r.ok) return;
  const after = meta.raidPreview().S;
  sound('levelUp');
  if (el) {
    fx.burst(el, ['#ffd36b', '#62e6ff', '#ffffff'], 16, 70);
    if (after > before) fx.float(el, `${icon('crown')}${Math.round(meta.raidPreview().three * 100)}%`, 'good');
  }
  save();
  refresh();
}

function levelUp(id, el) {
  const r = meta.levelUp(id);
  if (!r.ok) {
    sound('error');
    toasts.show(esc(r.reason), 'warn');
    if (el) fx.shake(el);
    return;
  }
  sound('levelUp');
  haptic(30);
  save();
  refresh();
  const faceEl = $('modals').querySelector('.cs-face') || el;
  fx.burst(faceEl, ['#7dffa1', '#ffd36b', '#ffffff'], 30, 130);
  fx.stamp(faceEl, `Lv ${r.to}!`, 'ready');
  fx.pop(faceEl, 1.1);
  const pwEl = $('modals').querySelector('.cs-power .pw b');
  if (pwEl) {
    const from = Math.round(r.powerBefore);
    const to = Math.round(r.powerAfter);
    for (let v = from; v <= to; v++)
      setTimeout(
        () => {
          pwEl.textContent = String(v);
          if (v > from) sound('coin', { pitch: (v - from) / Math.max(1, to - from) });
        },
        (v - from) * Math.min(90, 420 / Math.max(1, to - from)),
      );
  }
  map.cheerPerson(id);
  if (r.home) ui.housewarm = [...(ui.housewarm || []).filter((x) => x !== id), id];
}

/** After tier-changing level-ups, the camera visits each new home (at most 4). */
async function housewarming() {
  clearTimeout(ui.housewarmT);
  if (busy || crew.isOpen || modals.isOpen) return; // later, when the map is back
  const ids = (ui.housewarm || []).slice(-4);
  ui.housewarm = [];
  if (!ids.length) return;
  setBusy(true, { walk: true });
  try {
    for (const id of ids) {
      const h = meta.homeOf(id);
      const p = meta.person(id);
      if (!h || !p) continue;
      await map.glide(h.i + 1, h.j + 1, { ms: 450, zoom: Math.max(1, map.view.cam.zoom) });
      map.update();
      const el = map.homeEl(id);
      if (el) {
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
        fx.confetti(el, 26);
        fx.float(el.getBoundingClientRect(), `<b>${name(p)}</b>: ${esc(HOME_TIERS[tierOf(p.level)].name)}!`, 'good');
      }
      sound('cheer', { level: 1 });
      map.cheerAt(h);
      await wait(650);
    }
  } finally {
    setBusy(false);
    ui.hintGlide = null; // the camera moved: a hint may glide again
  }
}

/** Back on the map after a sequence: housewarming visits first, else glide to the next step. */
function afterSequence() {
  if (ui.housewarm && ui.housewarm.length) housewarming();
  else glideToStep();
}

function upgrade(id, el) {
  const r = meta.upgrade(id);
  if (!r.ok) {
    sound('error');
    toasts.show(esc(r.reason), 'warn');
    if (el) fx.shake(el);
    return;
  }
  sound('upgrade');
  haptic(30);
  const B = BUILDINGS[id];
  const tierBefore = meta.fenceTier();
  save();
  refresh();
  const target = map.buildingEl(id) || el;
  if (target) {
    fx.confetti(target, 40);
    fx.float(target.getBoundingClientRect(), B.kind === 'ride' ? `+10% ${CLASSES[B.cls].plural}` : B.kind === 'coins' ? '+10% raid coins' : `Lv ${r.level}!`, 'good');
  }
  const o = meta.s.objects.find((x) => x.kind === 'building' && x.ref === id);
  if (o) map.cheerAt(o, B.cls || null);
  if (id === 'bigtop' && meta.fenceTier() !== tierBefore) toasts.show(`${A.townIcon('lot')}The whole fence upgrades with the Gas Station!`, 'gift');
}

// --- Sheets -------------------------------------------------------------------------------------------

function openCard(id) {
  ui.confirm = null;
  modals.open(() => survivorCard(meta, id, ui), {
    cls: 'm-card',
    onClose: (replaced) => {
      if (!replaced && ui.housewarm && ui.housewarm.length && !crew.isOpen) {
        clearTimeout(ui.housewarmT);
        ui.housewarmT = setTimeout(() => housewarming(), 250);
      }
    },
  });
}

function openBuilding(id) {
  ui.confirm = null;
  if (BUILDINGS[id].kind === 'chest') return openChestSheet(id);
  modals.open(() => buildingSheet(meta, id), { cls: 'm-bld' });
}

function openChestSheet(kind) {
  ui.confirm = null;
  ui.chestSheet = { kind, ready: meta.chestState(kind).ready };
  modals.open(() => chestSheet(meta, kind, ui), { cls: 'm-chest', onClose: () => (ui.chestSheet = null) });
}

function openLadder() {
  modals.open(() => ladderSheet(meta), { cls: 'm-ladder' });
}

function openLot(a, b) {
  if (!LOTS[lotKey(a, b)]) return;
  modals.open(() => lotCard(meta, a, b), { cls: 'm-lot' });
  sound('tap');
}

function openRename() {
  ui.nameDraft = meta.s.town.named ? meta.s.town.name : '';
  ui.nameColor = meta.s.town.color;
  ui.nameIdeas = null;
  modals.open(() => renameSheet(meta, ui), { cls: 'm-rename' });
}

// What you type in the name box survives re-renders (an idea, More, a colour).
$('modals').addEventListener('input', (e) => {
  if (e.target && e.target.classList && e.target.classList.contains('tname-in')) ui.nameDraft = e.target.value;
});

function saveName() {
  const inp = $('modals').querySelector('.tname-in');
  const n = inp ? inp.value.trim() || meta.s.town.name : ui.nameDraft || meta.s.town.name;
  const r = meta.rename(n, ui.nameColor);
  if (!r.ok) {
    sound('error');
    return toasts.show(esc(r.reason), 'warn');
  }
  modals.close();
  sound('cheer', { level: 2 });
  save();
  refresh();
  const el = map.buildingEl('bigtop');
  if (el) fx.confetti(el, 40);
  toasts.show(`Welcome to <b>${esc(r.name)}</b>!`, 'gift', 3000);
}

function tapObject(o, el) {
  if (!o) return;
  if (o.kind === 'building') return openBuilding(o.ref);
  if (o.kind === 'home') return openCard(o.ref);
  if (o.kind === 'landmark') return modals.open(() => landmarkSheet(meta, o.ref), { cls: 'm-bld' });
  modals.open(() => decorSheet(meta, o), { cls: 'm-bld m-small' });
  void el;
}

function tapGround(i, j) {
  const { a, b } = { a: Math.floor(i / LOT), b: Math.floor(j / LOT) };
  const rec = meta.s.lots[lotKey(a, b)];
  if (!rec) return;
  toasts.show(`${A.townIcon('lot')}<b>${esc(rec.name)}</b>${rec.kind ? `, cleared day ${rec.day}` : ''}`, '', 1800);
}

async function showHome(id) {
  const h = meta.homeOf(id);
  if (!h) {
    // A roof camper: lift a fresh home to place.
    const p = meta.person(id);
    if (!p) return;
    return placeNew({ kind: 'home', ref: id, size: 2, art: A.home(p, HOME_TIERS[tierOf(p.level)].id, {}) });
  }
  await map.glide(h.i + 1, h.j + 1, { zoom: Math.max(1, map.view.cam.zoom) });
  const el = map.homeEl(id);
  if (el) fx.pop(el, 1.08);
}

// --- The BUILD drawer, placing, moving ------------------------------------------------------------------

function openDrawer(tab = null) {
  modals.close();
  if (!tab && meta.s.wish && meta.s.wish.set) tab = 'decor';
  if (tab && tab !== 'paths') stopPaint();
  drawer.open(tab);
  hud.setMode('drawer');
  sound('open');
}

function closeDrawer() {
  if (!drawer.isOpen) return;
  map.endPaint();
  drawer.paint = null;
  drawer.close();
  hud.setMode('');
}

function drawerPick(k, d) {
  sfx.unlock();
  const m = meta;
  if (k === 'close') return closeDrawer();
  if (k === 'buy') {
    const c = m.canBuy(d.k);
    if (!c.ok) {
      sound('error');
      return toasts.show(esc(c.reason), 'warn');
    }
    return placeNew({ kind: 'buy', ref: d.k, size: DECOR[d.k].size, art: A.decor(d.k), set: DECOR[d.k].set, price: c.price });
  }
  if (k === 'unbox') {
    const item = m.s.box[Number(d.i)];
    if (!item) return;
    const art = item.kind === 'decor' ? A.decor(item.ref) : item.kind === 'keepsake' ? A.keepsake(item.ref, (meta.person(item.owner) || {}).first || '') : item.kind === 'souvenir' ? A.souvenir(item.ref, meta.s.best) : A.statue(founders());
    return placeNew({ kind: 'unbox', index: Number(d.i), item, size: m.sizeOf(item), art, set: item.kind === 'decor' ? DECOR[item.ref].set : null });
  }
  if (k === 'kit') {
    const kit = m.s.kits[Number(d.i)];
    if (!kit) return;
    return placeNew({ kind: 'kit', index: Number(d.i), size: m.sizeOf(kit), art: kitArt(kit) });
  }
  if (k === 'lift') {
    const o = m.object(Number(d.id));
    if (o) liftByTap(o);
    return;
  }
  if (k === 'home') return showHomeFromDrawer(Number(d.id));
  if (k === 'paint') {
    const type = d.k || null;
    drawer.paint = d.k;
    if (map.painting) map.setPaint(type);
    else map.startPaint(type);
    hud.setMode('paint');
    drawer.render();
    if (meta.once('cap.paint')) toasts.show('Paint with one finger. Two fingers move the map.', '', 2600);
    return;
  }
  if (k === 'paintdone') {
    map.endPaint();
    drawer.paint = null;
    hud.setMode('drawer');
    drawer.render();
    save();
    refresh();
  }
}

function showHomeFromDrawer(id) {
  const h = meta.homeOf(id);
  if (h) return liftByTap(h);
  const p = meta.person(id);
  if (!p) return;
  placeNew({ kind: 'home', ref: id, size: 2, art: A.home(p, HOME_TIERS[tierOf(p.level)].id, {}) });
}

function kitArt(kit) {
  if (kit.kind === 'building') return A.building(kit.ref, 1, meta.s.town);
  if (kit.kind === 'souvenir') return A.souvenir(kit.ref, meta.s.best);
  return A.statue(founders());
}

/** The three founders (for their golden statue). */
function founders() {
  return meta.s.people.filter((p) => p.origin === 'founder').slice(0, 3);
}

/** A free spot in the open wish's range (when placing a piece of the wished set). */
function wishSpot(set, size) {
  const w = meta.s.wish;
  if (!w || !w.set || w.set !== set) return null;
  const h = meta.homeOf(w.id);
  if (!h) return null;
  const spots = meta.wishSpots(h, size);
  if (spots.length) return spots[0];
  const p = meta.person(w.id);
  toasts.show(`${icon('heart')}Nothing fits within 2 tiles of <b>${p ? name(p) : 'their'}</b>'s home, so this one won't grant the wish. Move something away first (long-press it).`, 'warn', 4200);
  return null;
}

/** Leave path painting (placing, moving and other tabs need one-finger drags back). */
function stopPaint() {
  if (!map.painting) return;
  map.endPaint();
  drawer.paint = null;
}

/** Place something new: the drawer and HUD slide away, the ghost appears near the centre. */
function placeNew(spec) {
  stopPaint();
  drawer.hide(true);
  hud.setMode('place');
  map.noKit = true;
  map.startPlace({
    size: spec.size,
    art: spec.art,
    set: spec.set || null,
    at: spec.at || wishSpot(spec.set, spec.size),
    noCancel: spec.noCancel,
    onOk: (i, j) => {
      let r;
      if (spec.kind === 'buy') r = meta.buy(spec.ref, i, j);
      else if (spec.kind === 'unbox') r = meta.unbox(spec.index, i, j);
      else if (spec.kind === 'kit') r = meta.placeKit(i, j, spec.index);
      else if (spec.kind === 'home') r = meta.placeHome(spec.ref, i, j);
      if (!r || !r.ok) {
        sound('error');
        if (r) toasts.show(esc(r.reason), 'warn');
        return r;
      }
      sound('thud');
      haptic(20);
      afterLanding(r);
      afterPlaceUi();
      save();
      refresh();
      return r;
    },
    onCancel: () => {
      if (spec.snooze) ui.kitSnooze = meta.s.kits.length;
      afterPlaceUi();
    },
  });
}

function placeOk() {
  map.placeOk();
}

function afterPlaceUi() {
  map.noKit = false;
  hud.showBox(false);
  if (drawer.isOpen) {
    drawer.hide(false);
    hud.setMode(map.painting ? 'paint' : 'drawer');
    drawer.render();
  } else hud.setMode('');
  refresh();
}

/** Junk popped under a drop, and a wish granted by the drop or move. */
function afterLanding(r) {
  const popped = r.popped || [];
  for (const p of popped) junkLoot(p, null);
  if (r.wish) grantWish(r.wish);
  junkFollowUp(popped);
  if (r.keepsake) toasts.show(`${A.townIcon('set')}The keepsake came out of the box, by the new home.`, '', 2400);
}

/** What popped junk brings beyond loot: trunk survivors and the scripted first wish. */
async function junkFollowUp(list) {
  const ncs = list.filter((p) => p.newcomer).map((p) => p.newcomer);
  const first = list.map((p) => p.wish).find((w) => w && w.first);
  if (ncs.length) {
    // Clear the screen like a chest does: no drawer or ghost under the reveal.
    closeDrawer();
    if (map.placing) map.placeCancel();
    arm();
    setBusy(true);
    try {
      await showNewcomers(ncs, "Someone's in the trunk!");
    } catch (e) {
      recover(e);
    } finally {
      setBusy(false);
      refresh();
    }
  }
  // Only while it is still open (a drop can start it and grant it at once).
  if (first && meta.s.wish === first) {
    setTimeout(() => toasts.show(`${icon('heart')}<b>${name(meta.person(first.id))}</b>: “Something fun by my tent?”`, 'gift', 3600), ncs.length ? 200 : 900);
  }
}

function liftByTap(o) {
  if (!meta.isMovable(o) || busy) return;
  stopPaint();
  closeDrawerSoft();
  map.glide(o.i + o.size / 2, o.j + o.size / 2, { ms: 350 });
  map.lift(o, { byTap: true });
  hud.setMode('place');
  hud.showBox(meta.isBoxable(o));
}

function closeDrawerSoft() {
  if (drawer.isOpen) drawer.hide(true);
}

/** Moved: a 5 s Undo chip. */
function moved(r, o) {
  ui.undo = { id: o.id, from: r.from, t: performance.now() };
  hud.showUndo(true);
  clearTimeout(ui.undoT);
  ui.undoT = setTimeout(() => {
    ui.undo = null;
    hud.showUndo(false);
  }, 5000);
  afterLanding(r);
  afterPlaceUi();
  save();
  refresh();
}

function undoMove() {
  const u = ui.undo;
  if (!u) return;
  ui.undo = null;
  hud.showUndo(false);
  const r = meta.move(u.id, u.from.i, u.from.j);
  if (r.ok) {
    sound('whoosh');
    save();
    refresh();
  }
}

function boxObject(o) {
  const r = meta.toBox(o.id);
  if (!r.ok) {
    sound('error');
    return toasts.show(esc(r.reason), 'warn');
  }
  sound('close');
  afterPlaceUi();
  save();
  refresh();
  toasts.show(`${A.townIcon('box')}In the box. BUILD → Decor puts it back.`, '', 2200);
}

/** The waiting kit: a green ghost near the station; ✓ places it. */
function showKit(kit) {
  if (busy || map.placing || modals.isOpen || drawer.isOpen || crew.isOpen || $('title-card')) return;
  if (ui.kitSnooze === meta.s.kits.length) return; // ✕ put it off: it waits in BUILD
  if (meta.s.raids === 0) return; // the first raid comes first
  const size = meta.sizeOf(kit);
  const st = meta.station();
  const at = meta.freeSpot(size, { near: { i: st.i + 1, j: st.j + 1 }, avoidPaths: true }) || meta.freeSpot(size, {});
  if (!at) return;
  placeNew({ kind: 'kit', index: 0, size, art: kitArt(kit), at, snooze: true });
  if (meta.once(`cap.kit.${kit.kind}`)) toasts.show(`${A.townIcon('build')}${kit.kind === 'building' ? `The <b>${esc(BUILDINGS[kit.ref].name)}</b> flew in!` : kit.kind === 'statue' ? "Founders' Day! The statue flew in." : 'A souvenir flew in!'} Drag it where you like, then ✓.`, 'gift', 3600);
}

// --- Lots -----------------------------------------------------------------------------------------------

async function clearLot(a, b) {
  if (busy) return;
  const before = meta.s.coins;
  const L = LOTS[lotKey(a, b)];
  const r = meta.clear(a, b);
  if (!r.ok) {
    sound('error');
    return toasts.show(esc(r.reason), 'warn');
  }
  save();
  arm();
  setBusy(true, { walk: true });
  hud.hideHand();
  closeDrawer();
  hud.freeze(['coins', 'gems']);
  hud.shown.coins = before - r.price;
  try {
    await playClear(r, L);
  } catch (e) {
    recover(e);
  } finally {
    hud.thaw(['coins', 'gems']);
    setBusy(false);
    map.resetZeds();
    save();
    refresh(true);
  }
  if (r.wish) grantWish(r.wish);
  maybeNameTown();
}

/** The clear: BONK, bloom, the fence hops, the sign rises, the prize knocks, the ruin crumbles. */
async function playClear(r, L) {
  const { a, b } = r;
  const c = { i: a * LOT + 3.5, j: b * LOT + 3.5 };
  // Tap to speed it up.
  ui.fast = false;
  const speed = () => (ui.fast = true);
  document.addEventListener('pointerdown', speed);
  const cw = (ms) => wait(ui.fast ? Math.min(ms, 60) : ms);
  ui.cw = cw;
  map.view.unpin(`t:${r.key}`);
  try {
    await clearBeats(r, L, c, cw);
  } finally {
    document.removeEventListener('pointerdown', speed);
    ui.cw = null;
  }
}

async function clearBeats(r, L, c, cw) {
  const { a, b } = r;
  await map.glide(c.i, c.j, { zoom: Math.max(0.75, Math.min(1, map.view.cam.zoom)), ms: 450 });
  // 1. The squad sprints out and BONKs.
  map.squadRun(a, b);
  sound('raidStart');
  await cw(450);
  const wild = map.wildEl(a, b);
  if (wild) {
    const rr = wild.getBoundingClientRect();
    for (let k = 0; k < 3; k++) {
      setTimeout(() => {
        sound('bonk');
        fx.float({ x: rr.left + rr.width * (0.3 + 0.2 * k), y: rr.top + rr.height * 0.4 }, 'BONK!', 'bonk');
      }, k * 220);
    }
    if (L.kind === 'L') {
      const boss = wild.querySelector('.boss');
      if (boss) boss.classList.add('ko');
    }
  }
  await cw(500);
  // 2. The weeds sweep away, grass blooms.
  map.crumble(a, b);
  sound('bloom');
  map.bloom(a, b);
  await cw(300);
  map.update();
  await cw(500);
  // 3. The fence hops out.
  sound('thud');
  await cw(200);
  // 4. The sign.
  map.sign(a, b, r.name);
  sound('milestone');
  if (L.kind === 'L') {
    const Lm = LANDMARKS[L.landmark];
    fx.confetti(null, 80);
    sound('zone');
    toasts.show(`<b>${esc(Lm.banner)}</b><br>${esc(Lm.bonus)}`, 'gift', 4200);
    fx.fly({ from: map.screenAt(c.i, c.j), to: hud.target('gems'), html: gemSvg(), count: 5, onEach: () => sound('gem') });
    hud.thaw(['gems']);
  }
  await cw(600);
  // 5. The prize knocks (not landmarks).
  if (r.knocks.length) await prizeKnocks(r, c);
  // 6. The first junk pile.
  if (r.firstPile) {
    const fp = r.firstPile;
    junkLoot(fp, map.screenAt(fp.i + 0.5, fp.j + 0.5));
  }
  hud.thaw(['coins', 'gems']);
  // Newcomers (the rescue, someone in the pile, a radio hero, a mystery).
  if (r.newcomers.length) await showNewcomers(r.newcomers, r.newcomers.length === 1 && r.newcomers[0].person.origin === 'trunk' ? 'Someone was hiding in the pile!' : `${esc(LOTS[r.key].name)}: someone's here!`);
  // Placed set pieces.
  if (r.placed && r.placed.length) {
    const names = r.placed.map((p) => DECOR[p.kind].name);
    toasts.show(`${A.townIcon('set')}New in ${esc(LOTS[r.key].name)}: <b>${names.map(esc).join(', ')}</b>${r.placed.some((p) => p.boxed) ? ' (some in the box)' : ''}`, 'gift', 3400);
  }
  if (r.campers.length) toasts.show(`${A.townIcon('home')}<b>${r.campers.length}</b> roof camper${r.campers.length > 1 ? 's' : ''} moved into new homes`, '', 2600);
  // The hand shows a junk pile, session 1 only.
  if (meta.once('hint.junk') && meta.s.junk.length) ui.junkHint = meta.s.junk[0].id;
}

/** Three knocks like a chest, each a Glow-Up chance; then the prize pops. */
async function prizeKnocks(r, c) {
  const pt = map.screenAt(c.i, c.j);
  const el = document.createElement('div');
  el.className = 'prizebox';
  el.style.left = `${pt.x}px`;
  el.style.top = `${pt.y - 60}px`;
  const ic = { R: 'rescue', C: 'cache', D: 'set', '?': 'mystery' }[LOTS[r.key].kind];
  el.innerHTML = `<div class="pb-in">${A.townIcon(ic)}</div>`;
  $('fx').appendChild(el);
  let grade = r.grade - r.knocks.filter(Boolean).length; // outer rescues start at Silver
  if (grade > 0) el.dataset.grade = String(grade);
  const cw = ui.cw || wait;
  for (let k = 0; k < r.knocks.length; k++) {
    await cw(380);
    el.classList.remove('knock');
    void el.offsetWidth;
    el.classList.add('knock');
    sound('knock', { n: k + 1 });
    if (r.knocks[k]) {
      grade++;
      el.dataset.grade = String(grade);
      sound('glow', { grade });
      fx.burst(el, grade >= 3 ? ['#ff6fb5', '#62e6ff', '#ffd36b', '#7dffa1'] : grade === 2 ? ['#ffd36b', '#fff2b0'] : ['#dfe7ef', '#ffffff'], 18, 80);
      fx.stamp(el, GRADES[grade].banner, `g${grade}`);
    }
  }
  await cw(350);
  sound('burst');
  fx.burst(el, ['#ffd36b', '#ff8ad8', '#62e6ff', '#7dffa1'], 26, 110);
  const P = r.prize;
  if (P && P.kind === 'cache') {
    fx.fly({ from: el.getBoundingClientRect(), to: hud.target('coins'), html: coinSvg(), count: 8, onEach: () => sound('coin', { pitch: Math.random() }) });
    fx.fly({ from: el.getBoundingClientRect(), to: hud.target('gems'), html: gemSvg(), count: 4 });
    toasts.show(`${icon('coin')}<b>${P.coins}</b> coins and ${icon('gem')}<b>${P.gems}</b> gems`, 'gift');
  } else if (P && P.kind === 'mystery' && P.roll === 'gems') {
    fx.fly({ from: el.getBoundingClientRect(), to: hud.target('gems'), html: gemSvg(), count: 6, onEach: () => sound('gem') });
    toasts.show(`${icon('gem')}<b>${P.gems}</b> gems in the mystery heap!`, 'gift');
  } else if (P && P.kind === 'mystery' && P.gems) fx.fly({ from: el.getBoundingClientRect(), to: hud.target('gems'), html: gemSvg(), count: 3 });
  el.classList.add('out');
  await wait(300);
  el.remove();
}

/** Pop a junk pile (free). */
function popJunk(id, el) {
  const pile = meta.s.junk.find((k) => k.id === id);
  if (!pile) return;
  const r = meta.popJunk(id);
  if (!r.ok) return;
  const at = el ? el.getBoundingClientRect() : map.screenAt(pile.i + 0.5, pile.j + 0.5);
  junkLoot(r, at);
  save();
  refresh();
  junkFollowUp([r]);
}

function junkLoot(r, at) {
  const from = at || map.screenAt(r.i + 0.5, r.j + 0.5);
  sound('pop');
  fx.burst(from, ['#c9b48a', '#ffd36b', '#ffffff'], 14, 60);
  if (r.coins) {
    fx.fly({ from, to: hud.target('coins'), html: coinSvg(), count: 4, onEach: () => sound('coin', { pitch: Math.random() }) });
    fx.float(from, `+${r.coins}`, 'good');
  }
  if (r.gems) fx.fly({ from, to: hud.target('gems'), html: gemSvg(), count: 3, onEach: () => sound('gem') });
  if (r.decor) {
    fx.float(from, `${r.rare ? 'RARE! ' : ''}${esc(DECOR[r.decor].name)}`, 'gift');
    sound(r.rare ? 'golden' : 'badge');
    const b = hud.target('build');
    if (b) fx.fly({ from, to: b, html: A.townIcon('box'), count: 1, size: 28 });
  }
}

// --- Wishes, visitors ------------------------------------------------------------------------------------

async function wishTap() {
  const w = meta.s.wish;
  if (!w) return;
  const p = meta.person(w.id);
  const h = meta.homeOf(w.id);
  if (h) await map.glide(h.i + 1, h.j + 1, { ms: 450, zoom: Math.max(0.9, map.view.cam.zoom) });
  ui.hintGlide = null;
  if (w.set) {
    toasts.show(`${icon('heart')}<b>${name(p)}</b> would love something <b>${esc(SETS[w.set].name)}</b> within 2 tiles of home.`, 'gift', 3400);
    openDrawer('decor');
  } else {
    const q = meta.person(w.sib);
    toasts.show(`${icon('heart')}<b>${name(p)}</b> wants to live near <b>${name(q)}</b>. Move one home next to the other.`, 'gift', 3600);
    openDrawer('homes');
  }
}

function grantWish(g) {
  const p = meta.person(g.id);
  if (!p) return;
  sound('wish');
  haptic(30);
  const el = map.homeEl(g.id);
  const at = el ? el.getBoundingClientRect() : null;
  if (at) {
    fx.burst(at, ['#ff6fb5', '#ffd36b', '#ffffff'], 24, 90);
    fx.float(at, `${icon('heart')}<b>${name(p)}</b> +${g.badges} ${icon('badge')}`, 'heart');
  }
  map.cheerPerson(g.id);
  toasts.show(`${icon('heart')}Wish granted! <b>${name(p)}</b> gets ${g.badges} Badges${g.stack && g.stack.ready ? ' and is READY' : ''}.`, 'gift', 3200);
  save();
  refresh();
  if (meta.s.town.stats.wishes === 1) setTimeout(maybeNameTown, 2600);
}

function maybeNameTown() {
  if (meta.s.town.named || busy || modals.isOpen) return;
  if (meta.s.town.stats.wishes < 1 && meta.s.stats.raids < 3) return;
  if (!meta.once('ask.name')) return;
  openRename();
}

function bonkVisitor(el) {
  const r = meta.bonkVisitor();
  if (!r.ok) return;
  sound('bonk');
  haptic(15);
  const at = el ? el.getBoundingClientRect() : null;
  if (at) fx.float({ x: at.left + at.width / 2, y: at.top }, 'BONK!', 'bonk');
  if (r.done) {
    if (r.gems) fx.fly({ from: at, to: hud.target('gems'), html: gemSvg(), count: 5, onEach: () => sound('gem') });
    if (r.coins) fx.fly({ from: at, to: hud.target('coins'), html: coinSvg(), count: 5, onEach: () => sound('coin', { pitch: Math.random() }) });
    if (r.decor) toasts.show(`${A.townIcon('set')}It dropped a <b>${esc(DECOR[r.decor].name)}</b>! (in the box)`, 'gift');
  }
  save();
  refresh();
}

// --- Chests -------------------------------------------------------------------------------------------

async function chestTap(kind) {
  if (busy) return;
  const st = meta.chestState(kind);
  if (!st.ready) return openChestSheet(kind);
  const res = meta.openChest(kind);
  if (!res.ok) {
    sound('error');
    return toasts.show(esc(res.reason), 'warn');
  }
  save();
  arm();
  setBusy(true);
  hud.hideHand();
  modals.close();
  closeDrawer();
  let out = { next: null };
  try {
    out = await opening.play(res);
  } catch (e) {
    recover(e);
  } finally {
    setBusy(false);
    save();
    refresh();
  }
  newcomerToasts(res.newcomers);
  if (out.next === 'level') openCard(out.id);
  else if (out.next === 'best') useBest(hud.target('best'));
}

/** After newcomers: where their tent landed, keepsakes, roof campers. */
function newcomerToasts(list) {
  for (const nc of list || []) {
    const p = nc.person;
    if (nc.camper) toasts.show(`${A.townIcon('home')}<b>${name(p)}</b> camps on the Gas Station roof until there's room. Clear a lot!`, '', 3200);
    if (nc.keepsake) toasts.show(`${A.townIcon('set')}<b>${name(p)}</b> brought ${p.pronoun === 'she' ? 'her' : p.pronoun === 'he' ? 'his' : 'their'} <b>${esc(KEEPSAKES[nc.keepsake.kind].name)}</b>${nc.keepsake.boxed ? ' (in the box)' : ''}`, 'gift', 3000);
  }
}

async function showNewcomers(list, title) {
  const el = document.createElement('div');
  el.className = 'reveal-ov';
  el.innerHTML = `<div class="op-dim"></div><div class="rv-title">${title}</div><div class="op-stage"></div><div class="op-hint"></div>`;
  overlay.appendChild(el);
  overlay.classList.add('on');
  requestAnimationFrame(() => el.classList.add('in'));
  const drv = driver(el);
  const stage = el.querySelector('.op-stage');
  for (const nc of list) {
    stage.innerHTML = '';
    const p = nc.person;
    const card = await revealNewcomer(stage, p, { meta, fx, sound, drv });
    fadeStamp(fx.stamp(card, 'MOVES IN!', 'in'));
    sound('moveIn');
    map.update();
    map.arrive(p.id);
    await drv.pause(500);
    el.querySelector('.op-hint').textContent = 'Tap to continue';
    await drv.tap();
    el.querySelector('.op-hint').textContent = '';
  }
  el.classList.remove('in');
  el.classList.add('out');
  await wait(240);
  el.remove();
  if (!overlay.children.length) overlay.classList.remove('on');
  save();
  refresh();
  newcomerToasts(list);
  // Parachute: show where the newest one landed.
  const last = list[list.length - 1];
  if (last && last.home) {
    await map.showTile(last.home.i + 1, last.home.j + 1, { ms: 450 });
    ui.hintGlide = null; // the game moved the camera: a hint may glide again
    const he = map.homeEl(last.person.id);
    if (he) {
      he.classList.remove('drop');
      void he.offsetWidth;
      he.classList.add('drop');
    }
  }
}

// --- Raids --------------------------------------------------------------------------------------------

async function startRaid() {
  if (busy) return;
  clearTimeout(ui.housewarmT); // a queued housewarming waits for the raid to end
  modals.close();
  closeDrawer();
  const r = meta.raid();
  if (!r.ok) {
    sound('error');
    return toasts.show(esc(r.reason), 'warn');
  }
  save();
  arm();
  setBusy(true);
  hud.hideHand();
  map.busGo(true);
  let res = 'park';
  try {
    res = await raidView.play(r, {
      after: async () => {
        if (r.stray) await showNewcomers([r.stray], 'A stray rode home on the bus roof!');
        for (const z of r.zones) await zoneSplash(z);
      },
    });
  } catch (e) {
    recover(e);
  } finally {
    map.busGo(false);
    setBusy(false);
    save();
    refresh(true);
  }
  // Coins fly into the station.
  const st = map.buildingEl('bigtop');
  if (st && r.coins) fx.burst(st, ['#ffd36b', '#fff2b0'], 12, 50);
  if (res === 'again') startRaid();
  else if (res && res.fix) applyFix(res.fix);
  else afterSequence();
  maybeNameTown();
}

/** After results: the camera glides to the next step if it's off-screen. */
function glideToStep() {
  const t = stepTile(meta.nextStep());
  if (t) map.showTile(t.i, t.j, { ms: 600 });
}

function applyFix(f) {
  if (f.kind === 'best') return useBest(hud.target('best'));
  if (f.kind === 'level') openCard(f.id);
  else if (f.kind === 'build') openBuilding(f.id);
}

async function zoneSplash(z) {
  hud.update();
  const el = document.createElement('div');
  el.className = 'zone-splash';
  const Z = ZONES[z.zone - 1];
  const items = [`<div class="zi">${icon('gem')}<b>+${GATE_GEMS} gems</b></div>`, `<div class="zi">${icon('up')}<b>Buildings up to Lv ${z.maxLevel}</b></div>`];
  if (z.lots > 0) items.push(`<div class="zi">${A.townIcon('lot')}<b>+${z.lots} lots</b><span>Own up to ${z.landCap}</span></div>`);
  for (const id of z.unlocked) items.push(`<div class="zi big"><span class="zart iso">${A.building(id, 1, meta.s.town).svg}</span><b>${esc(BUILDINGS[id].name)} flies in</b></div>`);
  for (const t of z.newThreats) items.push(`<div class="zi">${threatChip(t)}<b>New: ${esc(THREATS[t].name)}</b><span>${CLASSES[THREATS[t].by].plural} counter them</span></div>`);
  if (z.souvenir) items.push(`<div class="zi"><span class="zsv iso">${A.souvenir(z.souvenir).svg}</span><b>A souvenir for the town</b></div>`);
  if (z.gift) {
    const gp = z.gift.person;
    items.push(`<div class="zi">${icon('gift')}<b>A ${gp.golden ? 'golden ' : ''}${RARITIES[gp.rarity].name} ${CLASSES[gp.cls].name} walks in</b><span>counters ${THREATS[CLASSES[gp.cls].counters].name}</span></div>`);
  }
  el.innerHTML = `<div class="zs-back">${zoneBackdropSvg(z.zone)}</div><div class="zs-in"><div class="kicker">Zone ${z.zone} reached</div><h1>${esc(Z.name)}</h1>` + `<div class="zs-items">${items.join('')}</div><div class="op-hint">Tap to continue</div></div>`;
  overlay.appendChild(el);
  overlay.classList.add('on');
  requestAnimationFrame(() => el.classList.add('in'));
  sound('zone');
  haptic(60);
  fx.confetti(null, 90);
  const drv = driver(el);
  await drv.pause(900);
  await drv.tap();
  el.classList.remove('in');
  el.classList.add('out');
  await wait(260);
  el.remove();
  map.update(true);
  if (z.gift) await showNewcomers([z.gift], `A gift from ${esc(Z.name)}!`);
}

// --- Gifts, hints, captions ------------------------------------------------------------------------------

function claimGift(el) {
  const g = meta.s.gift;
  if (!g) return;
  const who = meta.person(g.id);
  const r = meta.claimGift();
  if (!r.ok) return;
  sound(r.kind === 'gems' ? 'gem' : r.kind === 'coins' ? 'coin' : 'badge');
  haptic(20);
  const from = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 10, height: 10 };
  if (r.kind === 'coins') fx.fly({ from, to: hud.target('coins'), html: coinSvg(), count: 6, onEach: () => sound('coin', { pitch: Math.random() }) });
  else if (r.kind === 'gems') fx.fly({ from, to: hud.target('gems'), html: gemSvg(), count: 3 });
  fx.burst(from, ['#ffd36b', '#ff8ad8', '#62e6ff'], 16, 70);
  const what = r.kind === 'coins' ? `${r.amount} coins` : r.kind === 'gems' ? `${r.amount} gems` : `${r.amount} Badges for themselves`;
  toasts.show(`${icon('gift')}<b>${who ? name(who) : 'Someone'}</b> brought ${what}!${who ? ` <i>“${esc(who.quirk)}”</i>` : ''}`, 'gift', 3600);
  save();
  refresh();
}

let captionTimer = 0;
let captionUntil = 0;
function caption(html, near = null) {
  const r = near ? near.getBoundingClientRect() : { left: innerWidth / 2 - 10, top: innerHeight * 0.3, width: 20, height: 20, bottom: innerHeight * 0.3 + 20 };
  hud.hideHand();
  hud.caption(html, r);
  captionUntil = performance.now() + 4200;
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => hud.el.caption.classList.remove('show'), 4200);
}
void caption;

/** Where on the map a next step is (tile), or null if it lives in the HUD. */
function stepTile(step) {
  const m = meta;
  if (step.kind === 'lot') return { i: step.a * LOT + 3.5, j: step.b * LOT + 3.5 };
  if (step.kind === 'build') {
    const o = m.s.objects.find((x) => x.kind === 'building' && x.ref === step.id);
    return o ? { i: o.i + o.size / 2, j: o.j + o.size / 2 } : null;
  }
  if (step.kind === 'ready' && !m.inSquad(step.id)) {
    const h = m.homeOf(step.id);
    return h ? { i: h.i + 1, j: h.j + 1 } : null;
  }
  if (step.kind === 'gift') {
    const w = map.walkers.get(step.id);
    if (w) return { i: w.fi, j: w.fj };
    const h = m.homeOf(step.id);
    return h ? { i: h.i + 1, j: h.j + 1 } : null;
  }
  return null;
}

/** The idle hand guides the first session; after that the bubbles do the job. */
const ONBOARDING_RAIDS = 8;
function showHint() {
  if (busy || modals.isOpen || crew.isOpen || dev.open || drawer.isOpen || map.placing || $('title-card')) return;
  if (meta.s.stats.raids >= ONBOARDING_RAIDS && meta.s.stats.levelUps >= 3 && meta.s.town.stats.lots >= 2) return;
  // Session 1: the hand shows a junk pile once (junk never gets the arrow).
  if (ui.junkHint) {
    const k = meta.s.junk.find((x) => x.id === ui.junkHint) || meta.s.junk[0];
    const el = k && map.junkEl(k.id);
    if (!el) ui.junkHint = null;
    else {
      if (!inSafe(el) && !ui.junkGlided) {
        ui.junkGlided = true;
        if (!map.view.pointers.size) map.glide(k.i + 0.5, k.j + 0.5, { ms: 500 });
        hud.idle = (hud.hintDelay || 1400) - 700; // point once it's there
        return;
      }
      ui.junkHint = null;
      if (inSafe(el)) return hud.pointAt(el, 'Junk! Tap a pile to pop it.', true);
      hud.idle = (hud.hintDelay || 1400) - 700;
      return;
    }
  }
  const step = meta.nextStep();
  let el = null;
  let label = '';
  if (step.kind === 'chest') el = hud.target(step.id);
  else if (step.kind === 'ready') {
    el = meta.inSquad(step.id) ? hud.target(step.id) : map.pinEl(`r:${step.id}`) || hud.target('crew');
    const p = meta.person(step.id);
    if (p && meta.s.stats.levelUps < 3) label = `<b>${name(p)}</b> is READY. Tap to level up.`;
  } else if (step.kind === 'gift') el = map.giftEl();
  else if (step.kind === 'kit') el = map.pinEl('placebtns') || hud.target('build');
  else if (step.kind === 'best') {
    el = hud.target('best');
    if (meta.s.stats.raids < 4) label = 'BEST picks the strongest squad for this threat.';
  } else if (step.kind === 'build') el = map.pinEl(`b:${(meta.s.objects.find((o) => o.kind === 'building' && o.ref === step.id) || {}).id}`) || map.buildingEl(step.id);
  else if (step.kind === 'lot') {
    el = map.tagEl(step.a, step.b);
    if (meta.s.town.stats.lots === 0) label = `Clear the <b>${esc(LOTS[step.key].name)}</b>: it's yours instantly.`;
  } else if (step.kind === 'play') {
    el = hud.target('play');
    if (meta.s.raids === 0) {
      const dot = meta.s.people[0];
      label = `<b>${name(dot)}:</b> Zombies at the fence! Let's bonk some.`;
    } else if (meta.s.raids === 1) label = 'Three waves, a crown for each one you clear.';
  }
  // A map target hidden under the HUD or off-screen: bring it into view, once per step
  // (never a tug-of-war with a player who is panning), centring the target itself.
  const t = stepTile(step);
  if (el && t && map.root.contains(el) && !inSafe(el)) {
    const key = JSON.stringify(step);
    if (ui.hintGlide !== key && !map.view.pointers.size) {
      ui.hintGlide = key;
      const r = el.getBoundingClientRect();
      const w = tileToWorld(t.i, t.j);
      const sc = map.view.cam.worldToScreen(w.x, w.y);
      const dy = (r.top + r.bottom) / 2 - map.root.getBoundingClientRect().top - sc.y; // a pin sits above its tile
      map.glide(t.i, t.j, { ms: 500, dy });
      hud.idle = (hud.hintDelay || 1400) - 700; // point once it's there
      return;
    }
    hud.idle = (hud.hintDelay || 1400) - 700; // still hidden: the edge pointer does the job (check again later)
    return;
  }
  if (el) hud.pointAt(el, label, true);
}

/** Is an element inside the map's clear area (not under the HUD)? */
function inSafe(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.top > 54 && r.bottom < innerHeight - 84 && r.left > 8 && r.right < innerWidth - 8;
}

// --- Title card (first visit) --------------------------------------------------------------------------

function titleCard() {
  const el = document.createElement('div');
  el.id = 'title-card';
  const founders = meta.s.people.map((p) => `<span class="tc-p">${face(p, { size: 64, lv: false })}<b>${name(p)}</b><small>${CLASSES[p.cls].name}</small></span>`).join('');
  el.innerHTML =
    `<div class="tc-in"><div class="kicker">FunLand2 · metagame prototype</div><h1>LAST STOP</h1>` +
    `<p>One gas station. One whole town to take back.</p><div class="tc-ppl">${founders}</div>` +
    `<button class="btn yellow big" type="button">${icon('play')}Let's go!</button>` +
    `<p class="note">Raids are simulated. The gear (top right) has testing tools.</p></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  el.addEventListener('click', () => {
    sfx.unlock();
    sound('open');
    el.classList.remove('in');
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
    hud.poke();
    hud.idle = 2500;
  });
}

// --- Back button, keys, visibility ---------------------------------------------------------------------

function back() {
  if (dev.open) {
    dev.hide();
    return true;
  }
  if (map.placing) {
    map.placeCancel();
    afterPlaceUi();
    return true;
  }
  if (modals.back()) return true;
  if (drawer.isOpen) {
    closeDrawer();
    return true;
  }
  if (crew.isOpen) {
    crew.close();
    return true;
  }
  return false;
}

let armed = false;
function arm() {
  if (armed) return;
  try {
    history.pushState({ outpost: 1 }, '');
    armed = true;
  } catch {
    // no history API
  }
}
addEventListener('popstate', () => {
  armed = false;
  if (back() || busy) arm();
});
arm();

addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.key === '`') dev.toggle();
  else if (e.key === 'Escape') back();
  else if (e.key === 'm' || e.key === 'M') {
    tuning.volume = tuning.volume > 0 ? 0 : TUNING_DEFAULTS.volume;
    sfx.setVolume(tuning.volume);
    saveTuning(tuning);
    toasts.show(tuning.volume ? 'Sound on' : 'Sound off');
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    save();
    sfx.suspend();
  } else {
    if (staleTab) {
      location.reload();
      return;
    }
    sfx.resume();
    const g = meta.arrive();
    if (g) toasts.show(`${icon('gift')}Someone has a gift for you`, 'gift');
    save();
    refresh();
  }
});
addEventListener('pagehide', save);
// Touching the map counts as activity: the hand steps aside.
$('map').addEventListener('pointerdown', () => {
  hud.poke();
  // The player is looking around: don't pull the camera back for this step.
  ui.hintGlide = JSON.stringify(meta.nextStep());
  ui.junkGlided = true;
});
$('map').addEventListener('pointerup', () => hud.poke());

// --- Frame loop ---------------------------------------------------------------------------------------

let last = performance.now();
let tickT = 0;
let slowT = 0;
function frame(now) {
  const dt = Math.min(100, now - last);
  last = now;
  clock.advance(dt);
  const canHint = !busy && !modals.isOpen && !crew.isOpen && !dev.open && !drawer.isOpen && !map.placing && !overlay.classList.contains('on') && !(ui.housewarm && ui.housewarm.length) && !$('title-card') && performance.now() > captionUntil;
  hud.hintDelay = meta.s.stats.raids < 3 ? 1400 : 4000;
  hud.animate(dt, canHint);
  map.tick(dt);
  tickT += dt;
  if (tickT > 250) {
    tickT = 0;
    modals.tick();
    if (ui.chestSheet && modals.isOpen) {
      const ready = meta.chestState(ui.chestSheet.kind).ready;
      if (ready !== ui.chestSheet.ready) {
        ui.chestSheet.ready = ready;
        ui.confirm = null;
        modals.render();
      }
    }
    // Off-screen next step: an edge pointer. The station off-screen: the home button.
    const st = meta.station();
    hud.showHome(st && !map.view.onScreen(st.i + 1.5, st.j + 1.5, -60) && !busy);
    const step = map.step || meta.nextStep();
    const t = !busy && !map.placing && !modals.isOpen && !overlay.classList.contains('on') ? stepTile(step) : null;
    if (t && !map.view.onScreen(t.i, t.j, 40)) hud.edgeAt(map.view.tileScreen(t.i, t.j));
    else hud.edgeAt(null);
  }
  slowT += dt;
  if (slowT > 5000) {
    slowT = 0;
    const w = meta.tick();
    if (w) {
      save();
      refresh();
    } else if (!busy) {
      map.step = meta.nextStep();
      hud.update();
      map.update();
    }
  }
  requestAnimationFrame(frame);
}

// --- Boot ----------------------------------------------------------------------------------------------

refresh(true);
if (firstVisit) titleCard();
else {
  const g = meta.arrive();
  if (g) setTimeout(() => toasts.show(`${icon('gift')}Someone has a gift for you`, 'gift'), 800);
}
save();
setInterval(() => {
  if (!document.hidden) save();
}, 10000);
document.documentElement.classList.add('booted');
requestAnimationFrame(frame);

window.__outpost = { meta, clock, hud, map, drawer, act, sfx, fx, refresh, startRaid, chestTap, clearLot, popJunk, get state() { return meta.s; } };
