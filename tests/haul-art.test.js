import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { figureSvg, portraitSvg, silhouetteSvg, drowserSvg, DROWSER_KINDS, DROWSERS_BY_AREA, POSE_NAMES, figureHeight, miniCrate, tone } from '../haul/src/figures.js';
import { campSvg, SCENE, SPOTS, tentSvg, rackSvg, giftSvg, skySvg, citySvg, CAMP_SKIES } from '../haul/src/camp-art.js';
import { crateSvg, cansSvg, radioSvg, eyesSvg, crayon } from '../haul/src/crate-art.js';
import { backdropSvg, STAGE, AREA_IDS } from '../haul/src/area-art.js';
import { icon, ICON_NAMES } from '../haul/src/icons.js';
import { SOUND_NAMES, Sfx } from '../haul/src/audio.js';
import { welcomeSheet, survivorSheet, peopleSheet, roadSheet, radioSheet, stand } from '../haul/src/sheets.js';
import { face, tokenBar, stars } from '../haul/src/ui.js';
import { Game, newState } from '../haul/src/rules.js';
import { CAST, CAST_ORDER, AREAS, GIFT, BARKS, HOME_TALK, RACK_SIZE, SQUAD_SIZE, TUNING_DEFAULTS, MAX_LEVEL } from '../haul/src/config.js';

const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);

/** Tags balance, attributes are quoted, and nothing unprintable leaked into the markup. */
function wellFormed(markup, what) {
  assert.equal(typeof markup, 'string', `${what}: a string`);
  assert.ok(markup.length > 0, `${what}: not empty`);
  for (const bad of ['undefined', 'NaN', 'null', '[object', 'Infinity']) assert.ok(!markup.includes(bad), `${what}: no "${bad}"`);
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/g;
  let m;
  let last = 0;
  while ((m = re.exec(markup))) {
    const between = markup.slice(last, m.index);
    assert.ok(!between.includes('<'), `${what}: a stray "<" before ${m[0].slice(0, 40)}`);
    last = re.lastIndex;
    const [, close, tag, attrs, self] = m;
    assert.equal((attrs.match(/"/g) || []).length % 2, 0, `${what}: quotes balance in <${tag}>`);
    if (close) assert.equal(stack.pop(), tag, `${what}: </${tag}> closes the tag that is open`);
    else if (!self && !VOID.has(tag)) stack.push(tag);
  }
  assert.ok(!markup.slice(last).includes('<'), `${what}: no stray "<" at the end`);
  assert.deepEqual(stack, [], `${what}: every tag is closed`);
}

const T0 = Date.UTC(2026, 5, 1, 9);
function make() {
  const s = newState(T0, 7);
  const g = new Game(s, { clock: { now: () => T0 }, tuning: { ...TUNING_DEFAULTS } });
  return { g, s };
}

test('every survivor draws in every pose, and as a face and a shape', () => {
  assert.ok(POSE_NAMES.includes('idle') && POSE_NAMES.includes('carry') && POSE_NAMES.includes('down'));
  for (const id of CAST_ORDER) {
    for (const pose of POSE_NAMES) wellFormed(figureSvg(id, pose), `${id} ${pose}`);
    wellFormed(portraitSvg(id), `${id} portrait`);
    wellFormed(portraitSvg(id, { mood: 'happy' }), `${id} happy portrait`);
    wellFormed(silhouetteSvg(id), `${id} silhouette`);
    assert.ok(silhouetteSvg(id).includes('silhouette'));
    assert.ok(figureSvg(id, 'carry').includes('f-crate'), `${id} carries a crate`);
    assert.ok(figureSvg(id, 'down').includes('f-dizzy'), `${id} sees stars`);
    assert.ok(figureHeight(id) > 40 && figureHeight(id) < 140);
  }
  assert.equal(figureSvg('nobody'), '');
  assert.notEqual(figureSvg('odile'), figureSvg('teo'));
  assert.ok(figureSvg('biscuit').includes('f-tail'), 'the dog has a tail to wag');
  // Everyone has their own look: no two portraits are the same picture.
  assert.equal(new Set(CAST_ORDER.map((id) => portraitSvg(id))).size, CAST_ORDER.length);
  // Unknown poses fall back to standing.
  wellFormed(figureSvg('odile', 'moonwalk'), 'an unknown pose');
});

test('drowsers: every kind, walking and down, and some for every stop on the road', () => {
  for (const kind of DROWSER_KINDS) {
    for (let n = 0; n < 3; n++) {
      wellFormed(drowserSvg(kind, n, 'walk'), `${kind} walking`);
      wellFormed(drowserSvg(kind, n, 'down'), `${kind} down`);
    }
  }
  for (const a of AREAS) {
    const kinds = DROWSERS_BY_AREA[a.id];
    assert.ok(Array.isArray(kinds) && kinds.length >= 2, `${a.id} has drowsers`);
    for (const k of kinds) assert.ok(DROWSER_KINDS.includes(k), `${k} is drawn`);
  }
  wellFormed(drowserSvg('nonsense', 0), 'an unknown kind');
  wellFormed(miniCrate(), 'the carried crate');
  assert.equal(tone('#000000', 1), '#ffffff');
  assert.equal(tone('#ffffff', 0), '#ffffff');
});

test('the camp: one scene, with room for everyone and everything where it can be seen', () => {
  const svg = campSvg();
  wellFormed(svg, 'the camp');
  for (const id of ['c-world', 'c-tents', 'c-rack', 'c-people-back', 'c-people', 'c-gift', 'c-truck', 'c-fire']) assert.ok(svg.includes(`id="${id}"`), `#${id}`);
  for (const act of ['radio', 'fire', 'truck', 'gift']) assert.ok(svg.includes(`data-act="${act}"`), `tap target: ${act}`);
  assert.ok(svg.includes('viewBox="0 0 1200 540"'));
  assert.equal(SPOTS.squad.length, SQUAD_SIZE);
  assert.ok(SPOTS.bench.length >= CAST_ORDER.length - SQUAD_SIZE, 'a place by the fire for everyone not in the squad');
  assert.ok(SPOTS.tents.length >= Math.ceil(CAST_ORDER.length / 2), 'a tent for every two');
  const inView = (p, what) => {
    assert.ok(p.x > SCENE.safe.x0 + 20 && p.x < SCENE.safe.x1 - 20, `${what} is inside the part every screen shows (x ${p.x})`);
    assert.ok(p.y > SCENE.safe.top && p.y < SCENE.h - 100, `${what} is above the buttons (y ${p.y})`);
  };
  SPOTS.squad.forEach((p, i) => inView(p, `squad spot ${i}`));
  SPOTS.bench.forEach((p, i) => inView(p, `bench spot ${i}`));
  SPOTS.tents.forEach((p, i) => inView(p, `tent ${i}`));
  inView(SPOTS.rack, 'the rack');
  inView(SPOTS.gift, 'the crate at the gate');
  // Nobody stands on anybody else.
  const all = [...SPOTS.squad, ...SPOTS.bench];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(Math.hypot(all[i].x - all[j].x, (all[i].y - all[j].y) * 2) > 40, `spots ${i} and ${j} are apart`);
  for (let n = 0; n < 8; n++) wellFormed(tentSvg(n, '#4a9dff'), `tent ${n}`);
});

test('the camp moves down the road: a sky and a horizon for every stop', () => {
  assert.equal(CAMP_SKIES, AREAS.length);
  const skies = new Set();
  const cities = new Set();
  for (let k = 0; k < AREAS.length; k++) {
    const sky = skySvg(k);
    const city = citySvg(k);
    wellFormed(sky, `sky ${k}`);
    wellFormed(city, `horizon ${k}`);
    assert.ok(sky.includes(`url(#c-sky-${k})`));
    assert.ok(city.includes(`url(#c-haze-${k})`));
    skies.add(sky);
    cities.add(city);
    assert.ok((city.match(/<(path|rect|circle|g|text)\b/g) || []).length < 900, `horizon ${k} stays light`);
  }
  assert.equal(skies.size, AREAS.length, 'no two skies alike');
  assert.equal(cities.size, AREAS.length, 'no two horizons alike');
  const camp = campSvg();
  for (let k = 0; k < AREAS.length; k++) assert.ok(camp.includes(`id="c-sky-${k}"`) && camp.includes(`id="c-haze-${k}"`), `gradients for stop ${k + 1}`);
  // Out-of-range stops fall back to the nearest one instead of drawing nothing.
  assert.equal(skySvg(99), skySvg(AREAS.length - 1));
  assert.equal(citySvg(-3), citySvg(0));
});

test('the rack and the crate at the gate', () => {
  wellFormed(rackSvg([]), 'an empty rack');
  const full = rackSvg([{ state: 'answered' }, { state: 'calling' }, { state: 'queued' }]);
  wellFormed(full, 'a full rack');
  for (const st of ['answered', 'calling', 'queued']) assert.ok(full.includes(`st-${st}`));
  assert.equal((rackSvg([{ state: 'calling' }]).match(/stroke-dasharray/g) || []).length, RACK_SIZE - 1, 'empty hooks are dashed outlines');
  for (const line of GIFT.lines) {
    const svg = giftSvg(line);
    wellFormed(svg, `gift: ${line}`);
    const texts = svg.match(/<text[^>]*>([^<]*)<\/text>/g) || [];
    assert.ok(texts.length >= 1 && texts.length <= 2, 'one or two lines of crayon');
    for (const t of texts) assert.ok(t.replace(/<[^>]+>/g, '').length <= 14, `"${t.replace(/<[^>]+>/g, '')}" fits on the label`);
  }
  assert.ok(!giftSvg('<b>&x').includes('<b>'), 'no markup from a save');
});

test('crates, what is in them, and the eyes', () => {
  const c = crateSvg();
  wellFormed(c, 'a crate');
  for (const cls of ['cr-lid', 'cr-body', 'cr-glow', 'cr-dark']) assert.ok(c.includes(cls));
  assert.ok(c.includes('var(--cr-a)'), 'coloured by the stylesheet, so every closed crate looks the same');
  for (const tier of ['wood', 'steel', 'gold']) wellFormed(cansSvg(tier), `cans: ${tier}`);
  assert.ok(cansSvg('gold').length > cansSvg('steel').length && cansSvg('steel').length > cansSvg('wood').length, 'more tins in better crates');
  wellFormed(radioSvg(), 'the radio');
  for (const [dx, dy] of [[1, -1], [0, 0], [-3, 4]]) wellFormed(eyesSvg(dx, dy), 'the eyes');
  assert.notEqual(eyesSvg(1, 0), eyesSvg(-1, 0), 'they look where they are told');
  assert.ok(!crayon('<i>x').includes('<i>'));
});

test('a backdrop for every stop on the road', () => {
  assert.deepEqual(AREA_IDS, AREAS.map((a) => a.id));
  assert.equal(STAGE.lanes.length, 3);
  const seen = new Set();
  for (const a of AREAS) {
    const bd = backdropSvg(a.id);
    wellFormed(bd.back, `${a.id} back`);
    wellFormed(bd.front, `${a.id} front`);
    assert.ok(!seen.has(bd.back));
    seen.add(bd.back);
    for (const m of bd.back.matchAll(/ id="([^"]+)"/g)) assert.ok(m[1].startsWith(`${a.id}-`), `${a.id}: gradient id ${m[1]} carries the stop's name`);
    for (const m of (bd.back + bd.front).matchAll(/url\(#([^)]+)\)/g)) assert.ok(bd.back.includes(`id="${m[1]}"`), `${a.id}: ${m[1]} is defined`);
    assert.ok((bd.back.match(/<(path|rect|circle|ellipse|polygon|line|text|g|use)\b/g) || []).length < 320, `${a.id} stays light`);
  }
  assert.equal(backdropSvg('nowhere').back, backdropSvg('suburbia').back);
});

test('icons, and the little pieces of the interface', () => {
  for (const name of ICON_NAMES) wellFormed(icon(name), `icon ${name}`);
  assert.equal(icon('nope'), '');
  wellFormed(face('odile', { level: 3 }), 'a face');
  wellFormed(face('tinkerer', { unknown: true, cls: 'tiny' }), 'an unknown face');
  wellFormed(stars(2), 'stars');
  wellFormed(tokenBar({ max: false, tokens: 1, need: 4, ready: false }), 'a token bar');
  assert.ok(tokenBar({ max: true }).includes('MAX'));
  assert.ok(tokenBar({ max: false, tokens: 9, need: 4, ready: true }).includes('width:100%'));
  for (const id of CAST_ORDER) wellFormed(stand(id, 'wave', 'big'), `${id} on a stand`);
});

test('the sheets say what the rules say', () => {
  const { g, s } = make();
  wellFormed(welcomeSheet(g), 'welcome');
  for (const id of s.squad) assert.ok(welcomeSheet(g).includes(CAST[id].name));
  // A survivor: not enough tokens, then not enough supplies, then ready, then the top.
  let html = survivorSheet(g, 'odile', {});
  wellFormed(html, 'survivor: no tokens');
  assert.ok(html.includes('more token') && html.includes('disabled'));
  s.cast.odile.tokens = 2;
  html = survivorSheet(g, 'odile', {});
  assert.ok(html.includes('more supplies') && html.includes('disabled'));
  s.supplies = 500;
  html = survivorSheet(g, 'odile', {});
  wellFormed(html, 'survivor: ready');
  assert.ok(html.includes('data-act="level"') && !html.includes('disabled'));
  assert.ok(html.includes('In the squad'));
  s.cast.odile.level = MAX_LEVEL;
  html = survivorSheet(g, 'odile', {});
  wellFormed(html, 'survivor: top level');
  assert.ok(html.includes('Top level') && !html.includes('data-act="level"'));
  // Someone on the bench: the way into the squad.
  g.cheat('everyone');
  html = survivorSheet(g, 'lou', {});
  assert.ok(html.includes('data-act="swap-start"'));
  html = survivorSheet(g, 'lou', { swapping: true });
  wellFormed(html, 'survivor: swapping');
  assert.equal((html.match(/data-act="swap"/g) || []).length, SQUAD_SIZE);
  wellFormed(survivorSheet(g, 'biscuit', { cheer: true }), 'the dog, cheering');

  const fresh = make();
  let people = peopleSheet(fresh.g);
  wellFormed(people, 'everyone, at the start');
  assert.equal((people.match(/class="pcard unknown/g) || []).length, CAST_ORDER.length - SQUAD_SIZE);
  assert.ok(!people.includes('data-act="best"'), 'no "strongest three" with only three');
  assert.ok(people.includes('Out there. Keep calling.'), 'voices at the first stop can be reached');
  assert.ok(people.includes(AREAS[3].name), 'the others say where their voice turns up');
  people = peopleSheet(g);
  wellFormed(people, 'everyone, later');
  assert.equal((people.match(/data-act="survivor"/g) || []).length, CAST_ORDER.length);
  assert.ok(people.includes('data-act="best"'));

  const road = roadSheet(g);
  wellFormed(road, 'the road');
  for (const a of AREAS) assert.ok(road.includes(a.name));
  assert.equal((road.match(/YOU ARE HERE/g) || []).length, 1);
  s.stars = AREAS[5].stars;
  assert.ok(roadSheet(g).includes('The ferry'));

  wellFormed(radioSheet(g), 'the radio tent, empty');
  assert.equal((radioSheet(g).match(/class="slot empty"/g) || []).length, RACK_SIZE);
  g.cheat('radio');
  g.cheat('radio');
  g.cheat('radio');
  const tent = radioSheet(g);
  wellFormed(tent, 'the radio tent, full');
  assert.ok(tent.includes('Calling') && tent.includes('Next in line') && tent.includes('rack is full'));
});

test('camp talk and sounds: every line has a speaker, every sound played is one the synth knows', () => {
  for (const b of BARKS) {
    assert.ok(CAST[b.who], `${b.who} is in the cast`);
    assert.ok(b.say.length <= 36, `"${b.say}" fits in a bubble`);
    if (b.then) assert.ok(CAST[b.then[0]] && b.then[1].length <= 36);
  }
  for (const k of ['down', 'dog', 'all', 'none']) {
    assert.ok(HOME_TALK[k].length >= 1, `something to say: ${k}`);
    for (const line of HOME_TALK[k]) assert.ok(line.length <= 36, `"${line}" fits in a bubble`);
  }
  assert.equal(new Set(SOUND_NAMES).size, SOUND_NAMES.length);
  const dir = new URL('../haul/src/', import.meta.url);
  const used = new Set();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js') || f === 'audio.js') continue;
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/(?:sfx\.play|\bplay)\('([a-zA-Z]+)'/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 20, 'the views make noise');
  for (const name of used) assert.ok(SOUND_NAMES.includes(name), `"${name}" is a sound`);
  // In node there is no WebAudio: every call is a quiet no-op.
  const sfx = new Sfx();
  sfx.setVolume(0.5);
  sfx.unlock();
  for (const name of SOUND_NAMES) sfx.play(name, {});
  sfx.play('no-such-sound');
});

test('the page: every module it loads exists, and every action a button can ask for is handled', () => {
  const root = new URL('../haul/', import.meta.url);
  const html = readFileSync(new URL('index.html', root), 'utf8');
  for (const id of ['camp', 'pins', 'hud', 'stage', 'modals', 'fx', 'toasts', 'dev', 'rotate', 'boot-error']) assert.ok(html.includes(`id="${id}"`), `#${id}`);
  for (const f of ['haul.css', 'manifest.webmanifest', 'icon.svg', 'src/main.js']) readFileSync(new URL(f, root));
  JSON.parse(readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
  const srcDir = new URL('src/', root);
  const files = readdirSync(srcDir).filter((f) => f.endsWith('.js'));
  const main = readFileSync(new URL('main.js', srcDir), 'utf8');
  const acts = new Set();
  for (const f of files) {
    const src = readFileSync(new URL(f, srcDir), 'utf8');
    for (const m of src.matchAll(/from '\.\/([\w-]+\.js)'/g)) assert.ok(files.includes(m[1]), `${f} imports ${m[1]}`);
    for (const m of src.matchAll(/data-act="([a-z-]+)"/g)) acts.add(m[1]);
  }
  acts.delete('close'); // the sheets close themselves
  for (const act of acts) assert.ok(main.includes(`case '${act}':`), `main.js handles "${act}"`);
  // No prototype borrows from another: this one is written from scratch.
  for (const f of files) assert.ok(!/from '\.\.\/\.\.\//.test(readFileSync(new URL(f, srcDir), 'utf8')), `${f} stays inside haul/`);
});
