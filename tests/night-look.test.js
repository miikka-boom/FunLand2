// The night's look per map type (src/render/night-look.js): the purple-and-amber prototype on
// Streets and the classic blue-black elsewhere; the ground's overlay under it (lighting.js); how
// things standing in the dark lean purple and in the light lean warm (prims.js tone()), and the
// zombies' sprites darkening the same way (zombie-art.js putSprite, darkenStyles).
import test from 'node:test';
import assert from 'node:assert/strict';

// A canvas whose context writes down what is painted with: fills (and the gradients' stops).
const painted = [];
function recordingCtx(canvas) {
  const o = { canvas, globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1 };
  const gradient = () => {
    const g = { stops: [] };
    g.addColorStop = (at, c) => g.stops.push(c);
    return g;
  };
  return new Proxy(o, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => gradient();
      return (...a) => {
        if (k === 'fill' || k === 'fillRect') painted.push({ op: t.globalCompositeOperation, style: t.fillStyle, kind: String(k), a });
      };
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}
globalThis.document = {
  createElement: () => {
    const c = { width: 1, height: 1 };
    c.getContext = () => c._ctx || (c._ctx = recordingCtx(c));
    return c;
  },
};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { DEFAULTS, SCHEMA, LEVEL_IDS, LEVEL_KEYS, forLevel, levelKey, parseSaved } = await import('../src/settings.js');
const { NIGHT_LOOKS, nightLookFor } = await import('../src/render/night-look.js');
const { tone, setTonePalette } = await import('../src/render/prims.js');
const { putSprite, darkenStyles } = await import('../src/render/zombie-art.js');
const { RIM_COLOUR } = await import('../src/render/zombie-bake.js');
const { Lighting } = await import('../src/render/lighting.js');

const PURPLE = NIGHT_LOOKS.purple;
const NOIR = NIGHT_LOOKS.noir;
const LOOKS = Object.values(NIGHT_LOOKS).filter(Boolean);
const LEVELS = 10;
const parse = (s) => s.match(/[\d.]+/g).map(Number);

test('the night look is kept per map type: Streets dark with warm lamps, everywhere else as it was', () => {
  assert.ok(LEVEL_KEYS.includes('nightLook'));
  for (const id of LEVEL_IDS) assert.equal(forLevel(DEFAULTS, 'nightLook', id), id === 'city' ? 'noir' : 'classic', id);
  const item = SCHEMA.flatMap((g) => g.items).find((i) => i.key === 'nightLook');
  assert.ok(item && item.perLevel && item.type === 'select', 'a per-map choice in the panel');
  assert.deepEqual(item.options.map((o) => o[0]).sort(), Object.keys(NIGHT_LOOKS).sort(), 'one option per look');
  // A choice for one map is saved for that map alone.
  const back = { ...DEFAULTS, ...parseSaved({ _v: 99, [levelKey('nightLook', 'docks')]: 'purple', [levelKey('nightLook', 'city')]: 'classic' }) };
  assert.equal(forLevel(back, 'nightLook', 'docks'), 'purple');
  assert.equal(forLevel(back, 'nightLook', 'city'), 'classic');
  assert.equal(forLevel(back, 'nightLook', 'interior'), 'classic');
});

test('the look in play: the dark-street one on Streets at night; none by day, on the other maps, or for a look that does not exist', () => {
  const S = (o) => ({ ...DEFAULTS, ...o });
  assert.equal(nightLookFor(S({ level: 'city', night: true })), NOIR);
  assert.equal(nightLookFor(S({ level: 'city', night: true, [levelKey('nightLook', 'city')]: 'purple' })), PURPLE);
  assert.equal(nightLookFor(S({ level: 'city', night: false })), null, 'by day');
  assert.equal(nightLookFor(S({ level: 'docks', night: true })), null, 'classic');
  for (const id of ['nope', 'toString', '__proto__', 'constructor']) assert.equal(nightLookFor(S({ level: 'city', night: true, [levelKey('nightLook', 'city')]: id })), null, id);
  // What a look holds.
  for (const L of LOOKS) {
    for (const k of ['dark', 'deep']) assert.match(L[k], /^\d+,\d+,\d+$/, `${L.id}.${k}`);
    for (const k of ['shade', 'warm', 'coral', 'beamColor', 'rose', 'rim']) assert.ok(L[k].length === 3 && L[k].every((c) => c >= 0 && c <= 255), `${L.id}.${k}`);
    assert.ok(L.shade[2] > L.shade[0] && L.shade[0] > L.shade[1], `${L.id}: the shade is a violet`);
    assert.ok(L.warm[0] > L.warm[1] && L.warm[1] > L.warm[2], `${L.id}: the light an amber`);
    for (const k of ['shadeMix', 'warmMix', 'pool', 'beam', 'shafts']) assert.ok(L[k] >= 0 && L[k] <= 1, `${L.id}.${k}`);
    assert.ok(!L.zombieFloor || (L.zombieFloor > 0 && L.zombieFloor < 1), `${L.id}.zombieFloor`);
    for (const c of [...Object.values(L.ground), ...L.roofs]) assert.match(c, /^#[0-9a-f]{6}$/, L.id);
    for (const k of ['street', 'sidewalk', 'curb', 'buildings', 'parking', 'park', 'plaza']) assert.ok(L.ground[k], `${L.id}.ground.${k}`);
    assert.ok(Object.isFrozen(L) && Object.isFrozen(L.ground) && Object.isFrozen(L.roofs), L.id);
  }
  // The dark streets: darker than the purple ones, and the zombies kept bright on them.
  const lum = (hex) => [1, 3, 5].reduce((a, i) => a + parseInt(hex.slice(i, i + 2), 16), 0);
  const dark = (L) => L.dark.split(',').reduce((a, c) => a + +c, 0);
  assert.ok(dark(NOIR) < dark(PURPLE) && lum(NOIR.ground.street) < lum(PURPLE.ground.street));
  assert.ok(NOIR.zombieFloor >= 0.6, 'the zombies pop');
});

test('tone(): under the purple look the shadows lean violet and the light amber; back to classic, the old tones exactly', () => {
  const grey = '#808080';
  const classic = [0.1, 0.3, 0.5, 0.8, 1].map((k) => tone(grey, k));
  assert.deepEqual(parse(tone(grey, 0.5)), [64, 64, 64]);
  setTonePalette(PURPLE);
  try {
    const [r, g, b] = parse(tone(grey, 0.15));
    assert.ok(b > r && r > g, `in the dark, violet: ${r},${g},${b}`);
    const [r1, g1, b1] = parse(tone(grey, 1));
    assert.ok(r1 > g1 && g1 > b1, `in full light, warm: ${r1},${g1},${b1}`);
    const [r2, g2, b2] = parse(tone(grey, 0.5));
    assert.ok(b2 > r2 && Math.abs(r2 + g2 + b2 - 192) < 40, 'half lit: about as bright, a little violet');
    // Colours with alpha keep it.
    assert.match(tone('rgba(200,100,50,0.5)', 0.4), /^rgba\(\d+,\d+,\d+,0\.5\)$/);
  } finally {
    setTonePalette(null);
  }
  assert.deepEqual([0.1, 0.3, 0.5, 0.8, 1].map((k) => tone(grey, k)), classic, 'the cached tones were made again');
});

// tone()'s formula, at any brightness (its tables hold it at steps of 1/32).
const ref = (c, k, look) =>
  c.map((x, i) => {
    let v = x * k;
    if (look) {
      const d = (k < 1 ? 1 - k : 0) * look.shadeMix;
      v += (look.shade[i] - v) * d;
      const w = (k > 0.55 ? Math.min(1, (k - 0.55) / 0.45) : 0) * look.warmMix;
      v += (look.warm[i] * Math.min(1, k) - v) * w;
    }
    return Math.min(255, v);
  });

test('the zombies darken to a level the way tone() darkens the walls, under either look', () => {
  for (const look of [null, PURPLE]) {
    const styles = darkenStyles(look);
    assert.equal(styles.length, LEVELS + 1);
    const name = look ? look.id : 'classic';
    setTonePalette(look);
    try {
      for (const hex of ['#808080', '#c0603a', '#3a8c40', '#e8e0d0']) {
        const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        // The walls...
        for (let i = 0; i <= 32; i++) {
          const want = ref(c, i / 32, look);
          parse(tone(hex, i / 32)).forEach((x, j) => assert.ok(Math.abs(x - want[j]) <= 1, `${name} tone ${hex} at ${i}/32`));
        }
        // ...and what the fills (source-atop) leave of colour c at each level.
        for (let lv = 0; lv <= LEVELS; lv++) {
          let px = c.slice();
          for (const f of [styles[lv].fill, styles[lv].warm]) {
            if (!f) continue;
            const [r, g, b, a] = parse(f);
            px = px.map((x, i) => x * (1 - a) + [r, g, b][i] * a);
          }
          const want = ref(c, lv / LEVELS, look);
          px.forEach((x, i) => assert.ok(Math.abs(x - want[i]) <= 1.5, `${name} ${hex} level ${lv}: ${px.map(Math.round)} vs ${want.map(Math.round)}`));
        }
      }
    } finally {
      setTonePalette(null);
    }
  }
  assert.deepEqual(darkenStyles(null)[LEVELS], { fill: null, warm: null }, 'classic, fully lit: as baked');
  assert.equal(darkenStyles(PURPLE)[LEVELS].fill, null);
  assert.ok(darkenStyles(PURPLE)[LEVELS].warm, 'purple, fully lit: a touch of the amber');
});

test('putSprite: the darkened copies lean toward the look\'s shade, their moonlit rim its own; as baked, untouched', () => {
  // Two pixels: a lit grey with no rim, and one all rim.
  const rgba = new Uint8ClampedArray([200, 120, 80, 255, 100, 100, 100, 128]);
  const rim = new Uint8ClampedArray([0, 255]);
  const run = (k, look) => {
    const d = new Uint8ClampedArray(2 * 4);
    putSprite(d, 2, rgba, 2, 1, 0, 0, k, rim, look);
    return d;
  };
  assert.deepEqual([...run(1, PURPLE)], [...rgba], 'fully lit: as baked');
  assert.deepEqual([...run(1, null)], [...rgba]);
  // The silhouette: the shade, as far as the look takes it (black without one); alpha as it was.
  const sil = run(0, PURPLE);
  PURPLE.shade.forEach((c, i) => assert.ok(Math.abs(sil[i] - c * PURPLE.shadeMix) <= 0.5, `channel ${i}`));
  assert.equal(sil[3], 255);
  assert.equal(sil[7], 128);
  assert.deepEqual([...run(0, null).slice(0, 3)], [0, 0, 0]);
  // Between: as tone() has it, and the rim.
  const k = 0.3;
  const dd = (1 - k) * PURPLE.shadeMix;
  const mid = run(k, PURPLE);
  [200, 120, 80].forEach((c, i) => assert.ok(Math.abs(mid[i] - (c * k * (1 - dd) + PURPLE.shade[i] * dd)) <= 1, `channel ${i}`));
  const moonP = run(k, PURPLE).slice(4, 7);
  const moonC = run(k, null).slice(4, 7);
  assert.ok(moonP[2] > moonP[1], 'a lavender rim under the purple look');
  assert.ok(moonC[1] > moonC[2] && moonC[1] - moonC[0] > 0, 'the old green-white one without');
  assert.ok(RIM_COLOUR[1] > RIM_COLOUR[2]);
});

test('the overlay: under the purple look the dark is violet, the warm lights tint it amber and the lamps throw shafts; the classic one is as it was', () => {
  const view = { applyGround() {} };
  const paint = (look) => {
    const L = new Lighting();
    L.resize(400, 200);
    L.night = true;
    L.dark = 0.6;
    L.look = look;
    L.n = 0;
    L.radial(100, 100, 115, 0.9, 0.4); // the survivor's bubble
    L.cone(100, 100, 0, 0.56, 440, 0.7, 1); // the flashlight
    const lamp = L.radial(300, 50, 165, 0.62, 1);
    lamp.shaft = true;
    L.radial(200, 150, 38, 0.45); // a pickup's glint: not warm
    painted.length = 0;
    L.draw({}, view);
    return painted.slice();
  };
  const purple = paint(PURPLE);
  assert.equal(purple[0].style, `rgba(${PURPLE.dark},0.6)`, 'the dark: violet');
  const holes = purple.filter((p) => p.op === 'destination-out');
  assert.equal(holes.length, 4, 'every light takes the dark away');
  const warm = purple.filter((p) => p.op === 'source-over' && p.style.stops);
  assert.equal(warm.length, 3 + 1, 'the three warm lights tint it, and the lamp throws a shaft');
  const amber = PURPLE.warm.join(',');
  assert.ok(warm.every((p) => p.style.stops.some((c) => c.includes(amber))), 'amber');
  assert.ok(warm.some((p) => p.style.stops.some((c) => c.includes(PURPLE.rose.join(',')))), 'the shaft turns rose');
  assert.ok(warm.some((p) => p.style.stops.some((c) => c.includes(PURPLE.coral.join(',')))), 'the pools coral at their rims');
  // Classic: blue-black, the lights only take it away.
  const classic = paint(null);
  assert.equal(classic[0].style, 'rgba(3,5,10,0.6)');
  assert.equal(classic.filter((p) => p.op === 'destination-out').length, 4);
  assert.equal(classic.filter((p) => p.op === 'source-over' && p.style.stops).length, 0);
  // No shafts: none drawn.
  const still = paint({ ...PURPLE, shafts: 0 });
  assert.equal(still.filter((p) => p.op === 'source-over' && p.style.stops).length, 3);
});
