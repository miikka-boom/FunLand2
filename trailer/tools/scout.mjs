#!/usr/bin/env node
// Location scouting for the trailer: what's where on a map (posters, graffiti, alarm cars,
// Ben's traces, the Witch's seat, the Pier 9 flare...), with coordinates, so shots can be
// pointed at them.
//
//   node trailer/tools/scout.mjs city 1337 [filter]
//
// Runs the game's own map generation in Node (no browser), like the tests do.

const store = new Map();
const ctxStub = new Proxy({}, { get: (o, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
globalThis.document = { createElement: () => ({ width: 300, height: 150, style: {}, getContext: () => ctxStub }) };
globalThis.window = { devicePixelRatio: 1 };
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { Game } = await import('../../src/game/game.js');
const { DEFAULTS } = await import('../../src/settings.js');

const [level = 'city', seedArg = '1337', filter = ''] = process.argv.slice(2);
const audio = new Proxy({ listener: { x: 0, y: 0 } }, { get: (o, k) => (k in o ? o[k] : () => {}) });
const game = new Game({ ...DEFAULTS, level, seed: Number(seedArg), playtestPrompt: false }, audio, () => {});
const map = game.world.map;
const r = (v) => Math.round(v);
const out = [];
const add = (kind, x, y, what = '') => out.push({ kind, x: r(x), y: r(y), what });

add('start', map.start.x, map.start.y, `start room ${JSON.stringify(map.startRoom.interior)}`);
const er = map.endRoom.interior;
add('end', er.x + er.w / 2, er.y + er.h / 2, 'end room');
for (const p of map.posters || []) add('poster', p.x + p.w / 2, p.y + p.h / 2, `${p.design} side=${p.side}`);
for (const d of map.decor) {
  if (d.type === 'graffiti' || d.type === 'bentext' || d.type === 'doodle' || d.type === 'sign' || d.type === 'note') add(d.type, d.x, d.y, d.text || d.kind || '');
  else if (d.type.startsWith('ben') && d.type !== 'benarrow') add(d.type, d.x, d.y, d.kind || '');
}
for (const o of game.world.obstacles) {
  if (o.alarm) add(o.icecream ? 'icecream' : o.kind === 'alarmbox' ? 'alarmbox' : 'alarmcar', o.x + o.w / 2, o.y + o.h / 2, `${o.w}x${o.h}`);
  if (o.roofText) add('roof', o.x + o.w / 2, o.y + o.h / 2, o.roofText);
  if (o.boards) add('boards', o.x + o.w / 2, o.y + o.h / 2, '');
}
for (const f of map.fires || []) add('fire', f.x, f.y, f.barrel ? 'barrel' : 'wreck');
for (const w of map.witches || []) add('witch', w.x, w.y, '');
if (map.finale) {
  add('flare', map.finale.flare.x, map.finale.flare.y, '');
  add('gangway', map.finale.gangX, map.finale.board ? map.finale.board.y : 0, JSON.stringify(map.finale.pier));
}
if (map.ben) {
  const B = map.ben;
  if (B.nest) add('ben.nest', B.nest.x, B.nest.y, '');
  if (B.glimpse) add('ben.glimpse', B.glimpse.x, B.glimpse.y, '');
}
for (const l of map.lamps || []) if (l.tower) add('floodlight', l.x, l.y, '');

console.log(`${level} seed ${seedArg}: ${map.w} x ${map.h}, ${game.zombies.length} wanderers`);
for (const o of out) if (!filter || `${o.kind} ${o.what}`.toLowerCase().includes(filter.toLowerCase())) console.log(`${o.kind.padEnd(12)} ${String(o.x).padStart(5)} ${String(o.y).padStart(5)}  ${o.what}`);
