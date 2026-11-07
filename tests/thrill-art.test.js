import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PARK, parkBackSvg, wheelSvg, buildingSvg, souvenirSvg, busSvg, zombieSvg, zoneBackdropSvg, threatIconSvg } from '../thrill/src/art.js';
import { portraitSvg, figureSvg } from '../thrill/src/portrait.js';
import { chestSvg, badgeTokenSvg, coinSvg, gemSvg } from '../thrill/src/chest-art.js';
import { ICONS, icon } from '../thrill/src/icons.js';
import { Sfx } from '../thrill/src/audio.js';
import { generatePerson } from '../thrill/src/people.js';
import { mulberry32 } from '../thrill/src/util.js';
import { CLASS_ORDER, RARITY_ORDER, THREAT_ORDER, ZONES } from '../thrill/src/config.js';
import { Meta, newState } from '../thrill/src/meta.js';
import { FakeClock } from '../thrill/src/clock.js';
import { survivorCard, buildingSheet, chestSheet, ladderSheet } from '../thrill/src/sheets.js';

const ok = (svg, what) => {
  assert.equal(typeof svg, 'string', what);
  assert.ok(svg.includes('<svg'), `${what}: an svg`);
  assert.ok(!/undefined|NaN/.test(svg), `${what}: no undefined or NaN`);
};

test('the park, rides at every level, the wheel, souvenirs, zombies and backdrops draw cleanly', () => {
  for (let z = 1; z <= 6; z++) ok(parkBackSvg(z), `park ${z}`);
  for (let lit = 0; lit <= 6; lit++) ok(wheelSvg(lit), `wheel ${lit}`);
  for (const id of ['bigtop', 'striker', 'gallery', 'tent', 'garage']) {
    assert.ok(PARK.slots[id], `slot ${id}`);
    ok(buildingSvg(id, 1, { locked: true }), `${id} locked`);
    for (let lv = 1; lv <= 7; lv++) ok(buildingSvg(id, lv), `${id} ${lv}`);
  }
  for (const z of ZONES) {
    ok(zoneBackdropSvg(z.n), `backdrop ${z.n}`);
    if (z.souvenir) {
      assert.ok(PARK.souvenirs[z.souvenir], `souvenir slot ${z.souvenir}`);
      ok(souvenirSvg(z.souvenir), `souvenir ${z.souvenir}`);
    }
  }
  ok(busSvg(), 'bus');
  for (const k of ['walker', 'runner', 'brute', 'spitter', 'horde', 'golden']) {
    ok(zombieSvg(k), k);
    ok(zombieSvg(k, { flip: true, variant: 2 }), `${k} flipped`);
  }
  for (const t of THREAT_ORDER) ok(threatIconSvg(t), `threat ${t}`);
  const W = PARK.walk;
  assert.ok(W.x0 >= 0 && W.x1 <= PARK.w && W.y0 < W.y1 && W.y1 <= PARK.h, 'the walk band is inside the scene');
});

test('portraits and figures draw every generated person, in every mood and pose', () => {
  const rng = mulberry32(2026);
  for (let i = 0; i < 160; i++) {
    const p = generatePerson(rng, { id: i, cls: CLASS_ORDER[i % 4], rarity: RARITY_ORDER[(i >> 2) % 4], golden: i % 9 === 0 });
    ok(portraitSvg(p), `portrait ${i}`);
    for (const mood of ['happy', 'cheer', 'sad', 'wow']) ok(portraitSvg(p, { mood }), `portrait ${i} ${mood}`);
    for (const pose of ['idle', 'wave', 'sleep', 'cheer']) ok(figureSvg(p, { pose }), `figure ${i} ${pose}`);
  }
});

test('both chests in every grade, open and closed; tokens, coins, gems', () => {
  for (const kind of ['crate', 'vault'])
    for (let grade = 0; grade <= 3; grade++)
      for (const open of [false, true]) for (const glow of [0, 0.5, 1]) ok(chestSvg(kind, { grade, open, glow }), `${kind} ${grade} ${open} ${glow}`);
  for (const c of CLASS_ORDER) ok(badgeTokenSvg(c), `token ${c}`);
  ok(coinSvg(), 'coin');
  ok(gemSvg(), 'gem');
});

test('every icon the UI asks for exists', () => {
  const dir = new URL('../thrill/src/', import.meta.url);
  const names = new Set();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    for (const m of readFileSync(new URL(f, dir), 'utf8').matchAll(/icon\('([a-zA-Z]+)'\)/g)) names.add(m[1]);
  }
  for (const c of CLASS_ORDER) names.add(c);
  for (const v of ['sunny', 'sleepy', 'showoff', 'jumpy', 'lucky', 'cheer', 'scavenger', 'gemnose', 'clutch']) names.add(v);
  for (const n of names) {
    assert.ok(ICONS[n], `icon ${n}`);
    ok(icon(n), `icon ${n}`);
  }
});

test('sounds can be asked for without WebAudio (Node)', () => {
  const s = new Sfx();
  s.setVolume(0.5);
  for (const n of ['tap', 'open', 'knock', 'glow', 'burst', 'coin', 'gem', 'badge', 'ready', 'flip', 'drumroll', 'golden', 'moveIn', 'upgrade', 'levelUp', 'raidStart', 'hit', 'poof', 'win', 'lose', 'clutch', 'zone', 'cheer', 'bonk', 'milestone', 'whoosh', 'error', 'farewell']) {
    assert.doesNotThrow(() => s.play(n, { n: 2, grade: 2, rarity: 'legend', pitch: 0.5 }), n);
  }
});

test('the sheets render for a mid-game park without undefined or NaN', () => {
  const clock = new FakeClock(1_700_000_000_000);
  const meta = new Meta(newState(clock.now(), 77), { clock });
  meta.s.seen.noScript = true;
  meta.cheat('skulls', 950);
  for (let i = 0; i < 5; i++) {
    meta.cheat('chests');
    meta.openChest('crate');
    meta.openChest('vault');
  }
  const clean = (html, what) => {
    assert.equal(typeof html, 'string', what);
    assert.ok(!/undefined|NaN|\[object Object\]/.test(html), `${what}: clean`);
  };
  for (const p of meta.s.people) clean(survivorCard(meta, p.id, { confirm: null }), `card ${p.id}`);
  for (const id of ['bigtop', 'striker', 'gallery', 'tent', 'garage']) clean(buildingSheet(meta, id), `building ${id}`);
  for (const k of ['crate', 'vault']) {
    clean(chestSheet(meta, k, {}), `chest ${k}`);
    clean(chestSheet(meta, k, { confirm: { kind: 'opennow', id: k } }), `chest ${k} confirm`);
  }
  clean(ladderSheet(meta), 'ladder');
});
