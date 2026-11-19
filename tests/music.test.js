import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { MusicDirector, readGame, LEVEL_BEDS, HORDES, TENSIONS, cueLevel, cueFade } from '../src/game/music-director.js';
import { CUES } from '../assets/music/cues.js';
import { LEVEL_IDS } from '../src/settings.js';

const DIR = new URL('../assets/music/', import.meta.url);

/** A run snapshot as readGame() returns it, exploring quietly unless told otherwise. */
function snap(extra = {}) {
  return {
    screen: 'play', run: 1, level: 'city', won: false, lost: false, phase: 'build', intensity: 0, threatNear: 0,
    hordes: 0, alarm: false, tank: null, witch: null, hunters: [], terror: null, finale: null, holdout: false, ...extra,
  };
}

/** Run the director for `secs` at 60 fps on the same snapshot; returns the last output. */
function run(md, s, secs = 1 / 60) {
  let out;
  for (let t = 0; t < secs; t += 1 / 60) out = md.update(1 / 60, s);
  return out;
}

test('every cue the director can ask for ships, with sane loop points', () => {
  const ids = new Set(CUES.map((c) => c.id));
  const wanted = [
    'menu', 'saferoom', 'end_dead', 'end_saferoom', 'end_rescued', 'tank', 'tank_near', 'witch_near', 'witch_angry',
    'panic', 'holdout', 'finale_hold', 'finale_escape', 'sting_hunter', 'sting_terror', 'horde_chase',
    ...HORDES, ...TENSIONS, ...Object.values(LEVEL_BEDS).flat(),
  ];
  for (const id of wanted) assert.ok(ids.has(id), `missing cue ${id}`);
  for (const c of CUES) {
    assert.ok(existsSync(new URL(c.file, DIR)), `missing file ${c.file}`);
    assert.ok(statSync(new URL(c.file, DIR)).size > 20000, `${c.file} looks empty`);
    if (c.mode === 'loop') {
      assert.ok(c.loopStart >= 0 && c.loopEnd > c.loopStart + 10 && c.loopEnd <= c.seconds, `${c.id} loop points`);
    }
  }
  for (const level of LEVEL_IDS) assert.ok(LEVEL_BEDS[level], `no dread beds for level ${level}`);
});

test('title plays the menu theme; the start room its safe-room cue; leaving it the level bed', () => {
  const md = new MusicDirector();
  assert.equal(run(md, snap({ screen: 'title' })).cue, 'menu');
  assert.equal(run(md, snap({ phase: 'calm' })).cue, 'saferoom');
  const bed = run(md, snap({ phase: 'build', level: 'graveyard' })).cue;
  assert.ok(LEVEL_BEDS.graveyard.includes(bed));
  // The other run number gets the level's other bed.
  assert.notEqual(run(new MusicDirector(), snap({ run: 2, level: 'graveyard' })).cue, bed);
});

test('a mob brings a horde cue that holds through the fight, then the bed creeps back', () => {
  const md = new MusicDirector();
  run(md, snap());
  const out = run(md, snap({ hordes: 1, threatNear: 8 }));
  assert.ok(out.cue.startsWith('horde_'));
  // Still busy after a long fight: the horde cue stays.
  assert.equal(run(md, snap({ hordes: 1, threatNear: 8 }), 60).cue, out.cue);
  // Calm again: it holds a little, then lets go.
  assert.equal(run(md, snap({ hordes: 1, threatNear: 0 }), 5).cue, out.cue);
  assert.ok(run(md, snap({ hordes: 1, threatNear: 0 }), 40).cue.startsWith('bed_'));
  // The next mob gets a different horde cue.
  assert.notEqual(run(md, snap({ hordes: 2, threatNear: 8 })).cue, out.cue);
});

test('rising threat plays tension; alarms panic; the Tank and the Witch take over', () => {
  const md = new MusicDirector();
  assert.ok(run(md, snap({ intensity: 0.6 })).cue.startsWith('tension_'));
  assert.equal(run(md, snap({ alarm: true, hordes: 1 })).cue, 'panic');
  assert.equal(run(md, snap({ tank: 'engaged', hordes: 1 })).cue, 'tank');
  assert.equal(run(new MusicDirector(), snap({ tank: 'alive' })).cue, 'tank_near');
  assert.equal(run(new MusicDirector(), snap({ witch: 'near' })).cue, 'witch_near');
  const w = new MusicDirector();
  assert.equal(run(w, snap({ witch: 'angry' })).cue, 'witch_angry');
  assert.equal(run(w, snap({ witch: null }), 2).cue, 'witch_angry'); // she was just up: it rings on
  assert.ok(run(w, snap({ witch: null }), 30).cue.startsWith('bed_'));
});

test('finale, holdout and endings', () => {
  assert.equal(run(new MusicDirector(), snap({ level: 'docks', finale: 'hold', tank: 'engaged' })).cue, 'finale_hold');
  assert.equal(run(new MusicDirector(), snap({ level: 'docks', finale: 'escape' })).cue, 'finale_escape');
  assert.equal(run(new MusicDirector(), snap({ holdout: true })).cue, 'holdout');
  assert.equal(run(new MusicDirector(), snap({ lost: true, tank: 'engaged' })).cue, 'end_dead');
  assert.equal(run(new MusicDirector(), snap({ won: true })).cue, 'end_saferoom');
  assert.equal(run(new MusicDirector(), snap({ won: true, level: 'docks' })).cue, 'end_rescued');
});

test('a new run starts clean (no horde cue carried over), and pausing keeps the cue', () => {
  const md = new MusicDirector();
  run(md, snap({ hordes: 3, threatNear: 9 }));
  run(md, snap({ hordes: 4, threatNear: 9 }));
  assert.ok(md.cue.startsWith('horde_'));
  assert.equal(run(md, snap({ screen: 'paused', hordes: 4 })).cue, md.cue);
  assert.equal(run(md, snap({ run: 2, phase: 'calm', hordes: 0 })).cue, 'saferoom');
});

test('specials fire one stinger each when they first come close', () => {
  const md = new MusicDirector();
  const hunter = {};
  assert.deepEqual(run(md, snap({ hunters: [hunter] })).stingers, ['sting_hunter']);
  assert.deepEqual(run(md, snap({ hunters: [hunter] }), 30).stingers, []);
  const terror = {};
  assert.deepEqual(run(md, snap({ terror })).stingers, ['sting_terror']);
});

test('readGame reads a live game', () => {
  const witch = { alive: true, mode: 'sit', x: 300, y: 0 };
  const hunter = { alive: true, type: 'hunter', x: 200, y: 0 };
  const game = {
    runSerial: 3, level: 'docks', won: false, lost: false, stats: { hordes: 2 }, player: { x: 0, y: 0 },
    director: { phase: 'build', intensity: 0.3, threatNear: 1, alarm: null, tankEngaged: false, tankAlive: true, terror: null },
    witches: [witch], zombies: [hunter, { alive: true, type: 'common', x: 0, y: 0 }],
    events: { finale: { state: 'called', t: 10, dur: 90 }, holdout: null },
  };
  const s = readGame(game, 'play');
  assert.equal(s.witch, 'near');
  assert.equal(s.tank, 'alive');
  assert.deepEqual(s.hunters, [hunter]);
  assert.equal(s.finale, 'hold');
  game.events.finale.t = 80; // the ferry is coming in
  assert.equal(readGame(game, 'play').finale, 'escape');
  witch.mode = 'charge';
  assert.equal(readGame(game, 'play').witch, 'angry');
});

test('mix levels and fades: beds sit under the action, action cuts in fast', () => {
  assert.ok(cueLevel('bed_city_a') < cueLevel('horde_a'));
  assert.ok(cueFade('tank') < 1 && cueFade('bed_city_a') > 3);
  assert.equal(cueLevel(null), 0);
});
