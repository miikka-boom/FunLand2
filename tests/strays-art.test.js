import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import * as S from '../strays/src/sprites.js';
import { GLYPHS, PICTURES, FONT_HEIGHT, textWidth, writable, layout, glyph } from '../strays/src/font.js';
import { SAY, MAY_SLIDE, span } from '../strays/src/words.js';
import { KINDS, RARITIES, RARITY_ORDER, NAMES, SKINS, HAIRS, STYLES, COLS, ROWS, ROOMS } from '../strays/src/config.js';
import { GEO, roomBox, roomAt, skyAt } from '../strays/src/block.js';
import { LCD_W, LCD_H } from '../strays/src/lcd.js';

const root = new URL('../strays/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');
const HEX = /^#[0-9a-f]{6}$/;
const person = (kind, n = 0) => ({ kind, skin: n % SKINS, hair: n % HAIRS, style: n % STYLES });
const roles = { s: '#000000', S: '#000000', c: '#000000', h: '#000000', H: '#000000', a: '#000000', A: '#000000', p: '#000000', f: '#000000', x: '#000000', X: '#000000', P: '#000000' };

/** Rows are the same width and every letter has a colour. */
function wellDrawn(name, rows, width) {
  assert.ok(Array.isArray(rows) && rows.length > 0, `${name} has rows`);
  const w = width ?? rows[0].length;
  rows.forEach((row, i) => assert.equal(row.length, w, `${name} row ${i} is ${row.length} wide, not ${w}: "${row}"`));
  assert.doesNotThrow(() => S.paint(rows, roles), `${name} paints`);
}

// ---------------------------------------------------------------- sprites

test('strays art: every ink and colour is a real colour', () => {
  for (const [k, v] of Object.entries(S.INK)) assert.match(v, HEX, `ink ${k}`);
  for (const [k, v] of Object.entries(S.COL)) assert.match(v, HEX, `colour ${k}`);
  for (const r of RARITY_ORDER) assert.match(S.RARITY_COL[r], HEX);
  assert.equal(new Set(RARITY_ORDER.map((r) => S.RARITY_COL[r])).size, RARITY_ORDER.length, 'each rarity has its own colour');
  assert.equal(S.SKIN.length, SKINS);
  assert.equal(S.HAIR.length, HAIRS);
  assert.equal(S.STYLES.length, STYLES);
  for (const tone of [...S.SKIN, S.ZED_SKIN]) for (const k of ['s', 'S', 'c']) assert.match(tone[k], HEX);
  for (const hair of S.HAIR) for (const k of ['h', 'H']) assert.match(hair[k], HEX);
});

test('strays art: the body, its legs, its hair and its faces are well drawn', () => {
  wellDrawn('BODY', S.BODY, 16);
  assert.equal(S.BODY.length, 16);
  for (const [name, rows] of Object.entries(S.LEGS)) {
    wellDrawn(`LEGS.${name}`, rows, 16);
    assert.equal(rows.length, 2);
  }
  S.STYLES.forEach((rows, i) => {
    wellDrawn(`STYLES[${i}]`, rows, 16);
    assert.ok(rows.length <= 10, 'hair stays on the head');
  });
  wellDrawn('CAPE', S.CAPE, 16);
  for (const [name, list] of Object.entries(S.FACES)) {
    for (const [y, x, ch] of list) {
      assert.ok(y >= 1 && y <= 8 && x >= 3 && x <= 12, `face ${name} stays on the face (${y},${x})`);
      assert.ok(S.INK[ch] || roles[ch], `face ${name} letter ${ch}`);
    }
  }
  for (const [name, list] of Object.entries(S.STRAY_FACES)) {
    for (const [y, x] of list) assert.ok(y >= 4 && y <= 8 && x >= 4 && x <= 11, `stray face ${name} stays inside the hood`);
  }
});

test('strays art: every kind has a hat, an outfit, something to carry, something for the room, and wallpaper', () => {
  assert.deepEqual(Object.keys(S.KIND_ART).sort(), KINDS.map((k) => k.id).sort());
  for (const k of KINDS) {
    const art = S.KIND_ART[k.id];
    wellDrawn(`${k.id}.head`, art.head, 16);
    assert.ok(art.head.length <= 11, `${k.id} headgear stays above the shoulders`);
    wellDrawn(`${k.id}.torso`, art.torso, 16);
    assert.equal(art.torso.length, 4, `${k.id} torso is the four body rows`);
    wellDrawn(`${k.id}.prop`, art.prop.rows);
    const [px, py] = art.prop.at;
    assert.ok(px >= 9 && px + art.prop.rows[0].length <= 16, `${k.id} prop is held at the side`);
    assert.ok(py >= 0 && py + art.prop.rows.length <= 16, `${k.id} prop fits the sprite`);
    wellDrawn(`${k.id}.item`, art.item);
    assert.ok(art.item[0].length <= 11, `${k.id} item leaves room to stand`);
    assert.ok(art.item.length + (art.itemWall || 0) <= GEO.ih - 2, `${k.id} item fits under the ceiling`);
    assert.equal(art.wall.length, 2);
    for (const c of art.wall) assert.match(c, HEX);
    for (const key of ['p', 'f']) assert.match(art.pal[key], HEX, `${k.id} pal.${key}`);
  }
});

test('strays art: every kind draws with every face, as a somebody and as a hero', () => {
  for (const k of KINDS) {
    for (const face of Object.keys(S.FACES)) {
      for (const hero of [false, true]) {
        for (const legs of Object.keys(S.LEGS)) {
          const sp = S.personSprite(person(k.id, 3), { face, hero, legs });
          assert.equal(sp.w, 16);
          assert.equal(sp.h, 16);
          const lit = sp.px.filter(Boolean);
          assert.ok(lit.length > 110, `${k.id} is there`);
          for (const c of lit) assert.match(c, HEX);
        }
      }
    }
    // A hero looks different from a somebody: the cape and what they carry.
    const plain = S.personSprite(person(k.id));
    const hero = S.personSprite(person(k.id), { hero: true });
    const changed = plain.px.filter((c, i) => c !== hero.px[i]).length;
    assert.ok(changed >= 12, `${k.id} hero adds something you can see (${changed} pixels)`);
  }
});

test('strays art: no two kinds look alike, whatever the skin and hair', () => {
  for (let look = 0; look < 5; look++) {
    const seen = new Map();
    for (const k of KINDS) {
      const key = S.personSprite(person(k.id, look)).px.join(',');
      assert.ok(!seen.has(key), `${k.id} looks like ${seen.get(key)}`);
      seen.set(key, k.id);
    }
    // And they differ by more than a pixel or two.
    for (let a = 0; a < KINDS.length; a++) {
      for (let b = a + 1; b < KINDS.length; b++) {
        const pa = S.personSprite(person(KINDS[a].id, look)).px;
        const pb = S.personSprite(person(KINDS[b].id, look)).px;
        const diff = pa.filter((c, i) => c !== pb[i]).length;
        assert.ok(diff >= 14, `${KINDS[a].id} vs ${KINDS[b].id}: only ${diff} pixels apart`);
      }
    }
  }
});

test('strays art: skins, hair colours and hair styles all show', () => {
  const base = S.personSprite({ kind: 'student', skin: 0, hair: 0, style: 0 }).px.join(',');
  for (let i = 1; i < SKINS; i++) assert.notEqual(S.personSprite({ kind: 'student', skin: i, hair: 0, style: 0 }).px.join(','), base, `skin ${i}`);
  for (let i = 1; i < HAIRS; i++) assert.notEqual(S.personSprite({ kind: 'student', skin: 0, hair: i, style: 0 }).px.join(','), base, `hair ${i}`);
  for (let i = 1; i < STYLES; i++) assert.notEqual(S.personSprite({ kind: 'student', skin: 0, hair: 0, style: i }).px.join(','), base, `style ${i}`);
});

test('strays art: a stray hides who they are; only the patch gives the rarity away', () => {
  wellDrawn('STRAY_BODY', S.STRAY_BODY, 16);
  const a = S.straySprite(S.RARITY_COL.common);
  const b = S.straySprite(S.RARITY_COL.epic);
  const diff = a.px.map((c, i) => (c !== b.px[i] ? i : -1)).filter((i) => i >= 0);
  assert.equal(diff.length, 4, 'only the 2x2 patch differs');
  for (const i of diff) assert.equal(a.px[i], S.RARITY_COL.common);
  for (const face of Object.keys(S.STRAY_FACES)) assert.equal(S.straySprite(S.RARITY_COL.rare, { face }).w, 16);
  // No kind's own colours leak into the blanket.
  const colours = new Set(a.px.filter(Boolean));
  assert.ok(colours.size <= 7);
});

test('strays art: bags, zombies, furniture, bubbles and bits are well drawn', () => {
  for (const name of ['BAG_A', 'BAG_B', 'ZOMBIE_A', 'ZOMBIE_B']) wellDrawn(name, S[name], 16);
  assert.equal(S.ZOMBIE_A.length, 16);
  assert.equal(S.ZOMBIE_B.length, 16);
  for (const name of ['HOOD', 'BED', 'QUILT', 'MATTRESS', 'RUG', 'LAMP', 'LAMP_OFF', 'BOARDS', 'PLANK', 'BUBBLE', 'DOOR', 'STREET_LAMP', 'FENCE']) wellDrawn(name, S[name]);
  assert.equal(S.BOARDS[0].length, GEO.iw, 'boards span a room');
  assert.ok(S.BED[0].length <= GEO.iw && S.QUILT[0].length <= GEO.iw);
  assert.equal(S.FENCE[0].length, LCD_W - GEO.fenceX, 'the fence closes the yard');
  for (const [name, rows] of Object.entries(S.ICONS)) {
    wellDrawn(`ICONS.${name}`, rows);
    assert.ok(rows[0].length <= 9 && rows.length <= 8, `icon ${name} fits a bubble`);
  }
  assert.ok(S.BUBBLE[0].length + 15 <= GEO.iw, 'a bubble fits beside whoever is asking');
  for (const [name, rows] of Object.entries(S.BITS)) wellDrawn(`BITS.${name}`, rows);
});

test('strays art: paint refuses a typo, flip and squash behave', () => {
  assert.throws(() => S.paint(['k?k']), /no colour/);
  assert.throws(() => S.paint(['kk', 'k']), /wide/);
  const sp = S.personSprite(person('cook'), { hero: true });
  assert.deepEqual(S.flip(S.flip(sp)).px, sp.px);
  assert.notDeepEqual(S.flip(sp).px, sp.px);
  const down = S.squash(sp);
  assert.deepEqual(down.px.slice(15 * 16), sp.px.slice(15 * 16), 'the feet stay put');
  assert.deepEqual(down.px.slice(16, 15 * 16), sp.px.slice(0, 14 * 16), 'the rest moves down a row');
  const white = S.silhouette(sp, '#ffffff');
  assert.equal(white.px.filter(Boolean).length, sp.px.filter(Boolean).length);
  assert.ok(white.px.every((c) => c === null || c === '#ffffff'));
  const head = S.headSprite(person('nurse'));
  assert.equal(head.h, 10);
  assert.equal(head.px.length, 160);
});

// ------------------------------------------------------------------- font

test('strays font: every glyph is five rows, evenly wide, and distinct', () => {
  const seen = new Map();
  for (const [ch, rows] of Object.entries(GLYPHS)) {
    assert.equal(rows.length, FONT_HEIGHT, `glyph ${ch}`);
    for (const row of rows) {
      assert.equal(row.length, rows[0].length, `glyph ${ch}`);
      assert.match(row, /^[#.]+$/);
    }
    const key = rows.join('/');
    if (ch !== ' ' && ch !== 'O' && ch !== '0') {
      assert.ok(!seen.has(key), `glyph ${ch} looks like ${seen.get(key)}`);
      seen.set(key, ch);
    }
  }
  for (const [ch, rows] of Object.entries(PICTURES)) {
    assert.equal(rows.length, FONT_HEIGHT, `picture ${ch}`);
    assert.doesNotThrow(() => S.paint(rows));
  }
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') assert.ok(GLYPHS[ch], `has ${ch}`);
  assert.notDeepEqual(GLYPHS.O, GLYPHS[0], 'O and 0 can be told apart');
});

test('strays font: widths and layout agree', () => {
  assert.equal(textWidth(''), 0);
  assert.equal(textWidth('A'), 3);
  assert.equal(textWidth('AB'), 7);
  assert.equal(textWidth('AB', 2), 14);
  assert.equal(textWidth('M'), 5);
  assert.equal(textWidth('¢1'), 4 + 1 + 3);
  assert.deepEqual(glyph('~'), GLYPHS['?'], 'an unknown character becomes ?');
  assert.equal(writable('HELLO, YOU! +3¢ ♥'), true);
  assert.equal(writable('hello'), false);
  let maxX = 0;
  let pics = 0;
  const w = layout('A¢', 10, 5, 1, (x, y, pw, ph, pic) => {
    maxX = Math.max(maxX, x + pw);
    assert.ok(y >= 5 && y < 10 && ph === 1);
    if (pic) pics++;
  });
  assert.equal(w, textWidth('A¢'));
  assert.equal(maxX, 10 + textWidth('A¢'));
  assert.ok(pics > 0, 'pictures keep their own colours');
});

// ------------------------------------------------------------------ words

const LONG_NAME = NAMES.reduce((a, b) => (textWidth(b) > textWidth(a) ? b : a));
const LONG_KIND = KINDS.map((k) => k.name).reduce((a, b) => (textWidth(b) > textWidth(a) ? b : a));
/** Worst-case arguments for each line. */
const ARGS = {
  back: [12],
  later: ['8 HOURS'],
  hintPatch: [LONG_NAME],
  hintShow: [LONG_NAME],
  hintGrow: [LONG_NAME],
  hintFeed: [LONG_NAME],
  hintHug: [LONG_NAME],
  hintSave: [110],
  hintWait: [11 * 3600 * 1000 + 59 * 60 * 1000],
  openAsk: [110],
  openPoor: [110, 109],
  asleep: [59 * 60 * 1000],
  resting: [LONG_NAME, 29 * 60 * 1000],
  noCans: [LONG_NAME],
  woke: [LONG_NAME],
  fed: [LONG_NAME, 2],
  hugged: [LONG_NAME, 1],
  patched: [LONG_NAME, 1],
  aboutStray: [LONG_NAME, 2, 3],
  aboutSomebody: [LONG_NAME, LONG_KIND, 13, 14],
  aboutHero: [LONG_NAME, LONG_KIND],
  hoodDown: [LONG_NAME],
  standsTall: [LONG_NAME],
  firstFace: [LONG_NAME, LONG_KIND],
  newFace: [LONG_NAME, LONG_KIND],
  newHero: [LONG_NAME],
  goes: [LONG_NAME],
  out: [LONG_NAME],
  allResting: [29 * 60 * 1000],
  cameBack: [LONG_NAME, 14],
  cameBackHurt: [LONG_NAME, 14],
  followedIn: [LONG_NAME],
  followedDoor: [LONG_NAME],
  tripTitle: ['great'],
  tripHaul: [14, 2],
  tripHurt: [LONG_NAME],
  tripBonus: [3, 'SECRET'],
  tripRest: [LONG_NAME],
  cardIsA: [LONG_NAME],
  cardNowA: [LONG_NAME],
  cardBonus: [3],
  book: [18, 18],
  bookHeroes: [12],
  bookMet: [LONG_NAME, LONG_KIND, 4, true],
  bookUnmet: ['SECRET', 4],
};
/** Where each line is written, and how wide that place is (LCD pixels). */
const STATUS = LCD_W - (4 + textWidth('¢999') + 5) - 2; // the status line, beside a three-figure can count
const CARD = LCD_W - 72 - 1; // the right-hand column of a card
const PANEL = LCD_W - 38 - 4; // the trip result panel
const WIDTH_OF = {
  cardIsA: CARD,
  cardNowA: CARD,
  cardBonus: CARD,
  cardCommon: CARD,
  cardHero1: CARD,
  cardHero2: CARD,
  cardHero3: CARD,
  cardFirst: LCD_W - 4,
  cardNew: LCD_W - 4,
  cardHero: LCD_W - 4,
  tripHaul: PANEL,
  tripHurt: PANEL,
  tripBonus: PANEL,
  tripRest: PANEL,
  tripFollow: PANEL,
  motto: LCD_W - 4,
  pressAny: LCD_W - 4,
  full1: LCD_W - 4,
  full2: LCD_W - 4,
  heroes1: LCD_W - 4,
  heroes2: LCD_W - 4,
  book: LCD_W - 4 - textWidth('HEROES 12') - 4,
  bookMet: LCD_W - 4,
  bookUnmet: LCD_W - 4,
  out: LCD_W - 4 - textWidth('¢99') - 4,
};

test('strays words: the screen can write every line', () => {
  for (const [key, fn] of Object.entries(SAY)) {
    const text = fn(...(ARGS[key] || []));
    assert.equal(typeof text, 'string', key);
    assert.ok(text.length > 0, key);
    assert.ok(writable(text), `${key}: "${text}" has a character the font lacks`);
    assert.equal(text, text.toUpperCase(), `${key} is in capitals`);
  }
  for (const k of KINDS) {
    assert.ok(writable(k.name), k.name);
    assert.ok(writable(`'${k.says}'`), k.says);
  }
  for (const n of NAMES) assert.ok(writable(n));
  for (const r of RARITY_ORDER) assert.ok(writable(RARITIES[r].name));
  for (const word of ['BONK!', 'OUCH!', '!', '+12']) assert.ok(writable(word));
});

test('strays words: every line fits where it is written (a few may slide)', () => {
  for (const [key, fn] of Object.entries(SAY)) {
    if (key === 'title' || key === 'fullTitle' || key === 'heroesTitle' || key === 'tripTitle' || key === 'tap' || key === 'skip') continue;
    const text = fn(...(ARGS[key] || []));
    const room = WIDTH_OF[key] ?? STATUS;
    const w = textWidth(text);
    if (MAY_SLIDE.has(key)) {
      assert.ok(w <= room * 1.45, `${key} slides, but not for long: "${text}" is ${w}px in ${room}px`);
      continue;
    }
    assert.ok(w <= room, `${key}: "${text}" is ${w}px wide, the place is ${room}px`);
  }
  // Big lettering.
  assert.ok(textWidth(SAY.title(), 4) <= LCD_W - 8);
  assert.ok(textWidth(SAY.fullTitle(), 2) <= LCD_W - 4);
  assert.ok(textWidth(SAY.heroesTitle(), 2) <= LCD_W - 4);
  for (const o of ['great', 'good', 'rough']) assert.ok(textWidth(SAY.tripTitle(o), 2) <= PANEL, o);
  // A kind's name is written big on its card when it fits, small when it doesn't; either way it fits.
  for (const k of KINDS) {
    assert.ok(textWidth(k.name, 1) <= CARD, k.name);
    assert.ok(textWidth(`'${k.says}'`) <= CARD, `${k.id} says "${k.says}" (${textWidth(`'${k.says}'`)}px of ${CARD})`);
  }
  for (const key of MAY_SLIDE) assert.ok(SAY[key], `${key} is a real line`);
});

test('strays words: spans of time read naturally', () => {
  assert.equal(span(500), '1 SEC');
  assert.equal(span(45 * 1000), '45 SEC');
  assert.equal(span(60 * 1000), '1 MIN');
  assert.equal(span(12 * 60 * 1000 - 1), '12 MIN');
  assert.equal(span(125 * 60 * 1000), '2H 05M');
});

// ----------------------------------------------------------------- screen

test('strays screen: the twelve rooms tile the block and every pixel of a room finds its room', () => {
  assert.equal(LCD_W, 152);
  assert.equal(LCD_H, 84);
  assert.ok(GEO.x0 + COLS * GEO.cw <= GEO.fenceX, 'the block ends before the fence');
  assert.equal(GEO.y0 + ROWS * GEO.ch, GEO.ground, 'the block stands on the ground');
  assert.ok(GEO.iw < GEO.cw && GEO.ih + 2 < GEO.ch, 'walls and the heart bar have their own pixels');
  assert.ok(GEO.ih >= 16 + 5, 'a 16px somebody and a little headroom');
  for (let i = 0; i < ROOMS; i++) {
    const b = roomBox(i);
    assert.ok(b.x >= GEO.x0 && b.x + b.w <= LCD_W && b.y >= GEO.barH && b.y + b.h + 2 <= GEO.ground);
    for (const [x, y] of [[b.x, b.y], [b.x + b.w - 1, b.y + b.h - 1], [b.x + b.w / 2, b.y + b.h / 2]]) assert.equal(roomAt(x, y), i);
  }
  assert.equal(roomAt(2, 40), -1, 'the front yard is not a room');
  assert.equal(roomAt(140, 40), -1, 'nor is the fence');
  assert.equal(roomAt(60, 2), -1, 'nor the status line');
});

test('strays screen: the sky follows the clock', () => {
  assert.ok(skyAt(0).night && skyAt(23).night && skyAt(4).night);
  assert.ok(!skyAt(12).night && skyAt(12).sun);
  assert.ok(skyAt(19).dusk);
  for (let h = 0; h < 24; h++) {
    assert.match(skyAt(h).top, HEX);
    assert.match(skyAt(h).low, HEX);
  }
});

// ------------------------------------------------------------------- page

test('strays page: index.html points at files that exist and has every part the code asks for', () => {
  const html = read('index.html');
  assert.match(html, /<meta charset="utf-8">/);
  for (const m of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
    assert.ok(existsSync(new URL(m[1], root)), `${m[1]} exists`);
  }
  for (const id of ['toy', 'lcd', 'key-go', 'key-book', 'key-sound', 'key-test', 'lamp', 'live', 'dev', 'rotate', 'boot-error']) {
    assert.ok(html.includes(`id="${id}"`), `#${id}`);
  }
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'no id twice');
  // Everything the scripts look up is there.
  const code = ['src/main.js', 'src/dev.js'].map(read).join('\n');
  for (const m of code.matchAll(/getElementById\('([^']+)'\)/g)) assert.ok(ids.includes(m[1]), `#${m[1]} is in the page`);
  assert.match(html, /<script type="module" src="src\/main\.js"><\/script>/);
  // Tags are balanced.
  const opens = (html.match(/<(div|main|button|span|p|canvas)\b/g) || []).length;
  const closes = (html.match(/<\/(div|main|button|span|p|canvas)>/g) || []).length;
  assert.equal(opens, closes);
});

test('strays page: every class in the stylesheet is the toy\'s own, and every class used is styled', () => {
  const css = read('strays.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const classes = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]).filter((c) => !/^\d/.test(c)));
  for (const c of classes) assert.ok(/^(toy-|is-)/.test(c), `.${c} starts with toy- (or is a state: is-)`);
  const used = new Set();
  for (const src of [read('index.html'), read('src/dev.js'), read('src/main.js')]) {
    for (const m of src.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (c && !c.includes('$')) used.add(c);
    for (const m of src.matchAll(/classList\.(?:add|remove|toggle)\('([^']+)'/g)) used.add(m[1]);
  }
  for (const c of used) {
    if (c === 'booted') continue; // read by the boot script, not styled
    assert.ok(classes.has(c), `.${c} is used and so must be styled`);
  }
  assert.ok(css.includes('image-rendering: pixelated'), 'the screen keeps its hard pixels');
  assert.ok(/@media \(orientation: portrait\)/.test(css), 'a phone held upright is told to turn');
  const braces = (css.match(/{/g) || []).length - (css.match(/}/g) || []).length;
  assert.equal(braces, 0, 'braces balance');
});

test('strays page: the manifest and the icon are in order', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.short_name, 'Strays');
  assert.equal(m.orientation, 'landscape');
  assert.equal(m.start_url, './');
  for (const icon of m.icons) assert.ok(existsSync(new URL(icon.src, root)), icon.src);
  const svg = read('icon.svg');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/svg>\s*$/);
  assert.equal((svg.match(/<g\b/g) || []).length, (svg.match(/<\/g>/g) || []).length);
});

test('strays page: built from scratch (no code shared with the other prototypes)', () => {
  const dir = new URL('src/', root);
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 12);
  for (const f of [...files.map((x) => `src/${x}`), 'tools/player.mjs', 'tools/balance-sim.mjs']) {
    const src = read(f);
    for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
      const spec = m[1];
      if (spec.startsWith('node:')) continue;
      assert.ok(spec.startsWith('./') || spec.startsWith('../src/'), `${f} imports ${spec}`);
      assert.ok(existsSync(new URL(spec, new URL(f, root))), `${f}: ${spec} exists`);
    }
  }
  // The rules, the art and the words never touch the page.
  for (const f of ['rules.js', 'config.js', 'util.js', 'sprites.js', 'font.js', 'words.js']) {
    const src = read(`src/${f}`).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/\b(document|window|localStorage|Math\.random|Date\.now)\b/.test(src), `${f} is pure`);
  }
});
