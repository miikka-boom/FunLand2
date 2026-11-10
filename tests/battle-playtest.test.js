// Fixes from the phone play-test of the 32 cards (render and menus only; no sim):
// a building's HP bar waits for its crate to land, the comic words draw over the
// HP bars, and the Anvil and Shaken Soda aims show what will land there.
// (node --test runs each file in its own process, so the fake DOM globals stay here.)
import test from 'node:test';
import assert from 'node:assert/strict';

/** A canvas 2D stub that counts its own calls (and drawImage targets). */
function mockCtx(canvas) {
  const grad = { addColorStop() {} };
  const t = { canvas, globalAlpha: 1, globalCompositeOperation: 'source-over', calls: {}, images: [] };
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'getTransform') return () => ({ a: 0.86, b: 0, c: 0, d: 0.86, e: 400, f: 300 });
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'createPattern') return () => ({});
      return (...args) => {
        o.calls[k] = (o.calls[k] || 0) + 1;
        if (k === 'drawImage') o.images.push(args[0]);
      };
    },
    set(o, k, v) {
      o[k] = v;
      return true;
    },
  });
}
function mockCanvas(w = 300, h = 150) {
  const c = { width: w, height: h };
  c.getContext = () => c._ctx || (c._ctx = mockCtx(c));
  return c;
}
globalThis.document = { createElement: () => mockCanvas() };

const R = new URL('../battle/src/', import.meta.url).href;
const { createTowerRenderer } = await import(R + 'render/towers.js');
const { LAND_T } = await import(R + 'render/buildings.js');
const { DeployGhosts, aimCheck, aimTip, ZONE_SNAP } = await import(R + 'render/spells.js');
const { Match } = await import(R + 'sim/match.js');
const { Battle, DT } = await import(R + 'sim/battle.js');
const { UNIT_ORDER } = await import(R + 'sim/unit-types.js');
const { readFileSync } = await import('node:fs');
// main.js runs only in a page: these tests read the very expressions it uses out of its source
const MAIN = readFileSync(new URL('../battle/src/main.js', import.meta.url), 'utf8');
/** The condition main.js plays the 'drop' sound under, as a function of the event. */
function dropSoundRule() {
  const m = /case 'drop':[\s\S]*?if \((.+)\) sfx\('drop'/.exec(MAIN);
  assert.ok(m, "main.js has a 'drop' case that plays sfx('drop')");
  return new Function('e', `return !!(${m[1]});`);
}
const { BUILD_SNAP, fitBuilding } = await import(R + 'sim/buildings.js');
const { Effects } = await import(R + 'render/effects.js');
const { UnitRenderer } = await import(R + 'render/units.js');

const ctxOf = () => mockCanvas(1688, 780).getContext('2d');

function guard(team = 'blue') {
  return { kind: 'guard', team, x: 335, w: 64, h: 150, hp: 420, maxHp: 420, alive: true, active: true, level: 1, arrows: [] };
}
function box(o = {}) {
  return {
    kind: 'building', bid: 'boingBox', def: { life: 25, arm: 1 }, building: true, isTower: true, team: 'blue', f: 1, x: 560, w: 46, h: 46,
    hp: 300, maxHp: 320, alive: true, active: true, level: 1, dmgMul: 1, range: 0, age: 5, landT: LAND_T, hitT: 99, downT: -1, arrows: [],
    punch: { phase: 'idle', t: 0, ext: 0, dir: 1 },
    ...o,
  };
}
/** How many HP bars drawBars blits onto the frame (one bar = one drawImage of its own canvas). */
function barsDrawn(towers) {
  const R = createTowerRenderer({ seed: 7 });
  const ctx = ctxOf();
  R.drawBars(ctx, { towers }, { t: 1, dpr: 1 });
  return ctx.images.length;
}

test('play-test: a building shows no HP bar while its crate is still falling, then the bar pops in', () => {
  assert.equal(barsDrawn([guard()]), 1);
  // placed a moment ago: the crate is up in the air
  assert.equal(barsDrawn([guard(), box({ age: 0.1, landT: 0.1 })]), 1);
  assert.equal(barsDrawn([guard(), box({ age: LAND_T - 0.01, landT: LAND_T - 0.01 })]), 1);
  // landed: the bar is there (fading in for a few frames, then for good)
  assert.equal(barsDrawn([guard(), box({ age: LAND_T + 0.05, landT: LAND_T })]), 2);
  assert.equal(barsDrawn([guard(), box({ age: 5, landT: LAND_T })]), 2);
  // a building that never tells its landT (older saves of a state): the bar shows
  assert.equal(barsDrawn([guard(), box({ landT: undefined, age: undefined })]), 2);
});

test('play-test: the comic words can be drawn on their own, after (over) the HP bars', () => {
  const fx = new Effects({ seed: 3 });
  fx.spawn('text', { x: 500, y: -80, text: 'BOING!', color: '#ffe14d', size: 22 });
  fx.spawn('impact', { x: 500, y: -40, power: 1, dirX: 1, dirY: 0 });
  fx.update(0.1);
  const all = ctxOf();
  fx.drawFront(all);
  assert.ok((all.calls.fillText || 0) > 0, 'drawFront still draws the words by default');
  const noWords = ctxOf();
  fx.drawFront(noWords, false);
  assert.equal(noWords.calls.fillText || 0, 0, 'drawFront(ctx, false) leaves the words out');
  assert.ok((noWords.calls.fill || 0) + (noWords.calls.stroke || 0) > 0, '...but still draws the impact burst');
  const words = ctxOf();
  fx.drawWords(words);
  assert.equal(words.calls.fillText, all.calls.fillText, 'drawWords draws exactly the words');
});

test('play-test: the Anvil and Shaken Soda aims draw what will land there, legal or not', () => {
  const ghosts = new DeployGhosts(new UnitRenderer({ seed: 1 }));
  const count = (id, ok) => {
    const ctx = ctxOf();
    ghosts.draw(ctx, id, 700, 'blue', { ok, t: 1.3 });
    return Object.values(ctx.calls).reduce((a, b) => a + b, 0);
  };
  const plain = count('arrowRain', true);
  for (const id of ['anvil', 'shakenSoda']) {
    for (const ok of [true, false]) assert.ok(count(id, ok) > plain + 5, `${id} (${ok ? 'ok' : 'not here'}) draws more than a plain spell circle`);
  }
});

test('play-test: dragging a card, the tip, the ghost and the play agree at every spot (no red tip on a card that plays)', () => {
  const DECK = ['wreckingCrane', 'boingBox', 'beanPatch', 'clubbers', 'brollyBrigade', 'anvil', 'archers', 'bomb'];
  for (const id of DECK) {
    const m = new Match({ seed: 4, blue: { deck: DECK }, red: { deck: DECK } });
    const side = m.sides.blue;
    side.hand = [id, ...DECK.filter((c) => c !== id).slice(0, 3)];
    const [z0, z1] = m.buildZone('blue');
    let plays = 0;
    let red = 0;
    for (let wx = z0 - BUILD_SNAP - ZONE_SNAP - 20; wx <= z1 + BUILD_SNAP + ZONE_SNAP + 20; wx += 1) {
      side.mana = 10;
      const c = aimCheck(m, 'blue', 0, wx);
      const tip = aimTip(c);
      assert.equal(c.ok, m.canPlay('blue', 0, c.x) === '', `${id} @${wx}`);
      if (c.ok) {
        plays++;
        assert.equal(tip, '', `${id} @${wx}: plays, so no "${tip}"`);
        assert.ok(c.inZone, `${id} @${wx}: it plays, so the ghost shows it in the zone`);
      } else {
        red++;
        assert.ok(tip, `${id} @${wx}: denied (${c.why}) with no word why`);
      }
    }
    const zoned = ['wreckingCrane', 'boingBox', 'beanPatch', 'clubbers', 'archers', 'bomb'].includes(id); // (the Brolly and the Anvil go anywhere here)
    assert.ok(plays > 100 && (red > 10) === zoned, `${id}: ${plays} spots play, ${red} don't`);
  }
  // A building dropped just past the midline: it slides back in, and the tip says nothing against it
  const m = new Match({ seed: 4, blue: { deck: DECK }, red: { deck: DECK } });
  m.sides.blue.hand = ['wreckingCrane', 'boingBox', 'beanPatch', 'clubbers'];
  m.sides.blue.mana = 10;
  const z1 = m.buildZone('blue')[1];
  for (const i of [0, 1, 2]) {
    const c = aimCheck(m, 'blue', i, z1 + ZONE_SNAP + 5);
    assert.deepEqual([c.ok, aimTip(c)], [true, ''], m.sides.blue.hand[i]);
  }
  assert.equal(aimTip(aimCheck(m, 'blue', 0, z1 + BUILD_SNAP + ZONE_SNAP + 60)), 'Build on your side');
  assert.equal(aimTip(aimCheck(m, 'blue', 3, z1 + ZONE_SNAP + 5)), 'Play units on your side');
  m.sides.blue.mana = 0;
  assert.ok(/^Not enough mana/.test(aimTip(aimCheck(m, 'blue', 0, z1 - 100))));
  // Short of mana just past the edge: the spot is fine (it slides in), so the tip names the mana, not the side
  m.sides.blue.mana = 1;
  for (const i of [0, 1, 2]) {
    let fit = 0;
    for (let dx = 0; dx <= BUILD_SNAP + ZONE_SNAP + 20; dx += 5) {
      const tip = aimTip(aimCheck(m, 'blue', i, z1 + dx));
      const fits = fitBuilding(m.battle, 'blue', m.sides.blue.hand[i], dx > 0 && dx < ZONE_SNAP ? z1 - 1 : z1 + dx) != null; // (as aimCheck snaps it)
      fit += fits;
      assert.equal(tip.startsWith('Not enough mana'), fits, `${m.sides.blue.hand[i]} @z1+${dx} with 1 mana: "${tip}"`);
    }
    assert.ok(fit > ZONE_SNAP / 5 + 1, `${m.sides.blue.hand[i]}: fits at only ${fit} spots past the edge`);
  }
  assert.equal(aimTip(aimCheck(m, 'blue', 0, z1 + BUILD_SNAP + ZONE_SNAP + 60)), 'Build on your side');
});

test('play-test: a Brolly floats down with its umbrella sound only, a hand-of-god drop still says "drop"', () => {
  const sounds = dropSoundRule();
  const DECK = ['brollyBrigade', 'clubbers', 'archers', 'bomb', 'squire', 'spikers', 'arrowRain', 'boulder'];
  const m = new Match({ seed: 9, blue: { deck: DECK }, red: { deck: DECK } });
  const drops = (id, team, x) => {
    const side = m.sides[team];
    side.hand[0] = id;
    side.mana = 10;
    m.battle.events.length = 0;
    assert.ok(m.play(team, 0, x), `${team} plays ${id}`);
    m.battle.step(DT);
    return m.battle.events.filter((e) => e.type === 'drop');
  };
  for (const [team, x] of [['blue', 900], ['red', 700]]) {
    const brolly = drops('brollyBrigade', team, x);
    assert.equal(brolly.length, 3, 'three Brollies float in');
    for (const e of brolly) assert.equal(sounds(e), false, `${team} Brolly: no drop sound`);
    for (const e of drops('clubbers', team, team === 'blue' ? 300 : 1300)) assert.equal(sounds(e), false, 'card beans land with deploy, not drop');
  }
  // The Sandbox's hand of god lets a bean go: that is the drop sound
  const b = new Battle(3);
  const u = b.addUnit('clubber', 'blue', 400);
  for (let i = 0; i < 60; i++) b.step(DT);
  b.grabAt(u.chest.x, u.chest.y);
  b.moveGrab(420, -200);
  for (let i = 0; i < 10; i++) b.step(DT);
  b.events.length = 0;
  b.release();
  const letGo = b.events.filter((e) => e.type === 'drop');
  assert.equal(letGo.length, 1);
  assert.equal(sounds(letGo[0]), true);
  assert.equal(sounds({ type: 'drop', x: 0, y: 0 }), true, 'a drop with no bean still sounds');
});

test('play-test: the Sandbox shows a key on a unit card only when that key picks it', () => {
  const tpl = /el\.innerHTML = (`.*class="key".*`);/.exec(MAIN);
  const keyRule = /if \((\/\^\[1-9\]\$\/\.test\(k\)[^)]*\)[^{]*)\{\s*game\.selected = UNIT_ORDER\[\+k - 1\]/.exec(MAIN);
  assert.ok(tpl && keyRule, 'main.js builds the unit cards and reads number keys');
  const label = new Function('i', 't', `return ${tpl[1]};`);
  const picks = new Function('k', 'UNIT_ORDER', `return !!(${keyRule[1].replace(/\)\s*$/, '')});`);
  assert.ok(UNIT_ORDER.length > 9);
  let shown = 0;
  UNIT_ORDER.forEach((id, i) => {
    const k = /<span class="key">(\d+)<\/span>/.exec(label(i, { name: id }));
    if (!k) return;
    shown++;
    assert.ok(picks(k[1], UNIT_ORDER), `the "${k[1]}" on ${id} is a key that works`);
    assert.equal(UNIT_ORDER[+k[1] - 1], id, `"${k[1]}" picks ${id}`);
  });
  assert.equal(shown, 9, 'keys 1 to 9, on the first nine cards');
});

/** Every declaration block of `selector` in a stylesheet (media blocks too), as text. */
function rules(css, selector) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m; (m = re.exec(css)); ) if (m[1].split(',').some((s) => s.trim() === selector)) out.push(m[2]);
  return out;
}

test('play-test: the Sandbox card row can be scrolled to its first card on an upright phone', () => {
  const css = readFileSync(new URL('../battle/style.css', import.meta.url), 'utf8');
  const all = rules(css, '.cards');
  assert.ok(all.some((r) => /overflow-x:\s*auto/.test(r)), 'the card row scrolls sideways');
  // (centring a row wider than its box pushes its start past where any scroll can reach)
  for (const r of all) assert.ok(!/justify-content:\s*center\b/.test(r), `.cards { ${r.trim()} } centres without "safe"`);
  assert.ok(all.some((r) => /justify-content:\s*safe center/.test(r)), 'narrow portrait still centres a row that fits');
});

test('play-test: a long card-detail value (the Drummer\'s Targets) wraps inside its stat box', () => {
  const css = readFileSync(new URL('../battle/hub.css', import.meta.url), 'utf8');
  const stat = rules(css, '.hb-stat b');
  assert.ok(stat.length >= 1);
  for (const r of stat) assert.ok(!/white-space:\s*nowrap/.test(r), `.hb-stat b { ${r.trim()} } keeps a long value on one line`);
});
