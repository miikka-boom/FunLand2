import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePerson } from '../hope/src/people.js';
import { portraitSvg, figureSvg } from '../hope/src/portrait.js';
import { buildingSvg, wallSvg, skylineSvg, groundSvg, yardPropSvg, zombieSvg, buildingHeight } from '../hope/src/art.js';
import { BUILDINGS, ROLE_ORDER } from '../hope/src/config.js';
import { mulberry32 } from '../hope/src/util.js';

const balanced = (svg) => (svg.match(/<svg/g) || []).length === (svg.match(/<\/svg>/g) || []).length;

test('every generated person draws a portrait and a street figure, the same way every time', () => {
  const rng = mulberry32(21);
  for (let i = 0; i < 300; i++) {
    const p = generatePerson(rng, { id: i, grade: 1 + (i % 3), level: 1 + (i % 10) });
    const a = portraitSvg(p);
    assert.ok(a.startsWith('<svg class="portrait'), 'portrait svg');
    assert.ok(balanced(a));
    assert.ok(!a.includes('undefined') && !a.includes('NaN'), `portrait ${i} has no holes`);
    assert.equal(a, portraitSvg(p), 'pure');
    const hurt = portraitSvg(p, { hurt: true });
    assert.notEqual(hurt, a, 'a hurt person wears a bandage');
    const f = figureSvg(p);
    assert.ok(f.startsWith('<svg class="fig"') && balanced(f));
    assert.ok(!f.includes('undefined') && !f.includes('NaN'), `figure ${i} has no holes`);
  }
});

test('people look like their role and age: roles cover all five, older people go grey', () => {
  const rng = mulberry32(8);
  const roles = new Set();
  let old = 0;
  let grey = 0;
  for (let i = 0; i < 400; i++) {
    const p = generatePerson(rng, { id: i, grade: 2 });
    roles.add(p.role);
    if (p.age >= 62) {
      old++;
      if (p.look.hairColor >= 8 && p.look.hairColor <= 9) grey++;
    }
    assert.ok(p.age >= 18 && p.age <= 70);
    assert.ok(p.first && p.last && p.job && p.quirk && p.quote);
  }
  assert.deepEqual([...roles].sort(), ROLE_ORDER.slice().sort());
  if (old) assert.ok(grey / old > 0.9, 'most people over 62 have grey or white hair');
});

test('every building draws at every level, unclaimed and lit; walls at every level, with and without the gate', () => {
  for (const b of BUILDINGS) {
    assert.ok(buildingHeight(b.id) > 80);
    for (let lv = 0; lv <= 5; lv++) {
      const s = buildingSvg(b.id, lv);
      assert.ok(s.startsWith('<svg') && balanced(s), `${b.id} L${lv}`);
      assert.ok(!s.includes('undefined') && !s.includes('NaN'), `${b.id} L${lv} has no holes`);
    }
    assert.notEqual(buildingSvg(b.id, 0), buildingSvg(b.id, 1), `${b.id} lights up when reclaimed`);
    if (!b.final) assert.notEqual(buildingSvg(b.id, 1), buildingSvg(b.id, 5), `${b.id} changes with upgrades`);
  }
  for (let lv = 1; lv <= 5; lv++) {
    assert.ok(balanced(wallSvg(lv)) && balanced(wallSvg(lv, { gate: true })) && balanced(wallSvg(lv, { gate: true, open: true })));
  }
  assert.ok(balanced(skylineSvg()) && balanced(groundSvg()) && balanced(zombieSvg(3)));
  for (const b of BUILDINGS) if (!b.start && !b.final) assert.ok(yardPropSvg(b.id).length > 0, `${b.id} has a yard prop`);
});
