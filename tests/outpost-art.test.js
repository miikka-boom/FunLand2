import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, HOME_TIERS, LANDMARKS, DECOR, KEEPSAKES, RUINS, FENCE_TIERS, TOWN_COLORS, SET_ORDER, ZONES, LOT, LOTS_ACROSS, CLASS_ORDER } from '../outpost/src/config.js';
import { buildingArt, homeArt, landmarkArt, fenceArt, BOSS_SPOT, bossProp } from '../outpost/src/town-art.js';
import { lotGroundSvg, ruinArt, mysteryArt, junkArt, sceneryBackdrop, bloomTiles } from '../outpost/src/ground-art.js';
import { existsSync } from 'node:fs';
import { souvenirSvg } from '../outpost/src/thrill-art.js';
import { generatePerson } from '../outpost/src/people.js';
import { mulberry32 } from '../outpost/src/util.js';
import * as A from '../outpost/src/art.js';

/** Well-formed SVG markup: tags balance, no undefined or NaN. */
function wellFormed(svg, what) {
  assert.equal(typeof svg, 'string', what);
  assert.ok(svg.trim().startsWith('<svg'), `${what}: starts with <svg`);
  assert.ok(!/undefined|NaN/.test(svg), `${what}: no undefined or NaN`);
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let m;
  while ((m = re.exec(svg))) {
    const [, close, tag, , self] = m;
    if (self) continue;
    if (close) {
      const open = stack.pop();
      assert.equal(open, tag, `${what}: </${tag}> closes <${open}>`);
    } else stack.push(tag);
  }
  assert.deepEqual(stack, [], `${what}: every tag closed`);
}

/** A footprint art: { svg, artH } with a viewBox (w + h) × 32 wide and artH tall. */
function footArt(art, w, h, what, maxKB = 16) {
  assert.ok(art && typeof art.svg === 'string' && art.artH > 0, `${what}: { svg, artH }`);
  wellFormed(art.svg, what);
  const vb = /viewBox="([-\d.]+)[ ,]+([-\d.]+)[ ,]+([-\d.]+)[ ,]+([-\d.]+)"/.exec(art.svg);
  assert.ok(vb, `${what}: a viewBox`);
  assert.equal(Number(vb[3]), (w + h) * 32, `${what}: width (w + h) × 32`);
  assert.ok(Math.abs(Number(vb[4]) - art.artH) < 0.5, `${what}: height = artH`);
  assert.ok(art.artH >= (w + h) * 16, `${what}: tall enough for its footprint`);
  assert.ok(art.svg.length < maxKB * 1024, `${what}: under ${maxKB} KB (${(art.svg.length / 1024).toFixed(1)})`);
}

const rng = mulberry32(5);
const people = CLASS_ORDER.flatMap((cls) => [generatePerson(rng, { id: 1, cls, rarity: 'rookie', level: 1 }), generatePerson(rng, { id: 2, cls, rarity: 'legend', level: 9, golden: true })]);

test('buildings at every level and both town colours; homes in every tier for every class', () => {
  for (const [id, B] of Object.entries(BUILDINGS))
    for (let lv = 1; lv <= 7; lv++)
      for (const color of [TOWN_COLORS[0], TOWN_COLORS[4]]) footArt(buildingArt(id, lv, { town: 'Pinecone Pals', color }), B.size, B.size, `${id} Lv ${lv}`);
  for (const p of people)
    for (const t of HOME_TIERS) {
      footArt(homeArt(p, t.id, {}), 2, 2, `${p.cls} ${t.id}`);
      footArt(homeArt(p, t.id, { roof: TOWN_COLORS[2], hearts: 5, golden: true, legend: true }), 2, 2, `${p.cls} ${t.id} decked out`);
    }
});

test('landmarks ruined and restored, with a boss spot and prop; fences on every side', () => {
  for (const id of Object.keys(LANDMARKS)) {
    for (const restored of [false, true]) footArt(landmarkArt(id, restored), 3, 3, `${id} ${restored ? 'restored' : 'ruined'}`, 24);
    const spot = BOSS_SPOT[id];
    assert.ok(spot && spot.x > 0 && spot.x < 192 && spot.y > 0, `${id}: boss spot inside the art`);
    const prop = bossProp(id);
    wellFormed(prop.trim().startsWith('<svg') ? prop : `<svg viewBox="0 0 40 56">${prop}</svg>`, `${id} boss prop`);
    assert.ok(A.bossProp(id).startsWith('<svg'), `${id}: the art door wraps the prop in an svg`);
  }
  for (const tier of FENCE_TIERS)
    for (const side of ['i0', 'i1', 'j0', 'j1'])
      for (const len of [1, 2, 7]) {
        const f = fenceArt(tier, side, len);
        const [w, h] = side[0] === 'i' ? [1, len] : [len, 1];
        assert.equal(f.w, w, `${tier} ${side} w`);
        assert.equal(f.h, h, `${tier} ${side} h`);
        footArt(f, w, h, `fence ${tier} ${side} ${len}`);
      }
});

test('ground for every lot owned, wild and hazed, paths joined; ruins, heaps, junk, scenery, bloom', () => {
  const pathAt = (i, j) => (i === 17 || j === 17 ? ['dirt', 'planks', 'brick'][(i + j) % 3] : null);
  for (let a = 0; a < LOTS_ACROSS; a++)
    for (let b = 0; b < LOTS_ACROSS; b++)
      for (const opts of [{ owned: true }, { owned: false }, { owned: false, haze: true }]) {
        const svg = lotGroundSvg(a, b, { ...opts, pathAt });
        wellFormed(svg, `lot ${a},${b}`);
        assert.ok(svg.includes(`viewBox="0 0 ${LOT * 64} ${LOT * 32}"`), `lot ${a},${b} viewBox`);
        assert.ok(svg.length < 16 * 1024, `lot ${a},${b} under 16 KB`);
      }
  for (const r of RUINS) footArt(ruinArt(r, { name: 'Burger Stand' }), 3, 3, `ruin ${r}`);
  footArt(mysteryArt(), 3, 3, 'mystery');
  for (let v = 0; v < 3; v++) footArt(junkArt(v), 1, 1, `junk ${v}`);
  const sc = sceneryBackdrop();
  wellFormed(sc.svg, 'scenery');
  assert.ok(sc.left <= -1500 && sc.left + sc.width >= 1500 && sc.top <= -350 && sc.top + sc.height >= 1450, 'the scenery covers the map and around it');
  const bl = bloomTiles(2, 2);
  wellFormed(bl, 'bloom');
  assert.equal((bl.match(/class="bloom"/g) || []).length, 49);
});

const HAS_DECOR = existsSync(new URL('../outpost/src/decor-art.js', import.meta.url));
const HAS_ICONS = existsSync(new URL('../outpost/src/town-icons.js', import.meta.url));

test('decorations, keepsakes, souvenir plinths, the statue, set badges and town icons', { skip: !HAS_DECOR || !HAS_ICONS ? 'decor art not drawn yet' : false }, async () => {
  const { decorArt, keepsakeArt, plinthArt, statueArt, setBadgeSvg } = await import('../outpost/src/decor-art.js');
  const { townIcon } = await import('../outpost/src/town-icons.js');
  for (const [k, d] of Object.entries(DECOR)) footArt(decorArt(k), d.size, d.size, `decor ${k}`);
  for (const [k, d] of Object.entries(KEEPSAKES)) footArt(keepsakeArt(k), d.size, d.size, `keepsake ${k}`);
  for (const z of ZONES) if (z.souvenir) footArt(plinthArt(souvenirSvg(z.souvenir)), 2, 2, `souvenir ${z.souvenir}`, 24);
  footArt(statueArt(), 2, 2, 'statue', 24);
  for (const s of SET_ORDER) wellFormed(setBadgeSvg(s), `set badge ${s}`);
  for (const n of ['build', 'home', 'move', 'box', 'eraser', 'ok', 'cancel', 'path', 'rescue', 'cache', 'set', 'landmark', 'mystery', 'junk', 'wish', 'flag', 'undo', 'focus', 'rename', 'lot', ...SET_ORDER]) {
    const svg = townIcon(n);
    wellFormed(svg, `icon ${n}`);
    assert.ok(svg.includes('viewBox="0 0 24 24"'), `icon ${n}: 24 × 24`);
  }
});

test('the art door: every module loaded, so no stand-in boxes on the map', { skip: !HAS_DECOR ? 'decor art not drawn yet' : false }, () => {
  assert.deepEqual(A.hasArt, { town: true, ground: true, decor: true, icons: true });
  // The wrappers hand back the real art.
  assert.ok(A.building('bigtop', 3, { name: 'Last Stop', color: TOWN_COLORS[0] }).svg.length > 1000);
  assert.ok(A.decor('bench').svg.length > 300);
});
