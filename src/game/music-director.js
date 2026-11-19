// The music director: reads the run each frame and decides which music cue should play,
// Left 4 Dead style. Quiet dread beds while you explore (one of two per level, by run),
// a tension cue as the threat rises, a horde cue per mob (rotating, so mobs don't all sound
// the same), panic for alarms, the Tank's theme while it's on you, the Witch's strings when
// you're near her and her own cue once she's up, short stingers for specials, the finale,
// and a one-shot ending. Pure logic (no WebAudio): src/music-player.js plays what this picks.

import { FERRY } from './finale.js';

export const LEVEL_BEDS = {
  city: ['bed_city_a', 'bed_city_b'],
  interior: ['bed_interior_a', 'bed_interior_b'],
  docks: ['bed_docks_a', 'bed_docks_b'],
  suburbia: ['bed_suburbia_a', 'bed_suburbia_b'],
  graveyard: ['bed_graveyard_a', 'bed_graveyard_b'],
  junkyard: ['bed_junkyard_a', 'bed_junkyard_b'],
};
export const HORDES = ['horde_a', 'horde_b', 'horde_c', 'horde_d'];
const INDOOR_HORDES = ['horde_chase', 'horde_a', 'horde_b', 'horde_c', 'horde_d'];
export const TENSIONS = ['tension_a', 'tension_b'];

/** Mix level per cue (the files are all mastered to the same loudness): beds sit low under the game. */
export function cueLevel(id) {
  if (!id) return 0;
  if (id.startsWith('bed_')) return 0.5;
  if (id.startsWith('tension')) return 0.62;
  if (id === 'saferoom' || id === 'witch_near' || id === 'tank_near') return 0.6;
  if (id === 'menu' || id.startsWith('end_')) return 0.75;
  return 0.8; // horde, panic, tank, witch_angry, holdout, finale
}

/** How long the crossfade into a cue takes (s): action cuts in fast, dread creeps back slowly. */
export function cueFade(id) {
  if (!id) return 2;
  if (id === 'tank' || id === 'witch_angry' || id === 'panic') return 0.4;
  if (id.startsWith('horde') || id.startsWith('finale')) return 1;
  if (id.startsWith('end_')) return 0.8;
  if (id.startsWith('bed_')) return 5;
  return 2.5;
}

const WITCH_NEAR = 700; // px: her strings fade in about where her crying is heard
const HUNTER_NEAR = 750;
const HORDE_HOLD = 22; // s a mob's cue keeps going once the fighting has thinned out
const BUSY = 4; // chasers within reach that keep a horde cue going

/** Plain numbers and flags the director needs, read off a live Game (screen: title | play | paused). */
export function readGame(game, screen) {
  const D = game.director;
  const p = game.player;
  let witch = null;
  let witchD = Infinity;
  for (const w of game.witches || []) {
    if (!w.alive) continue;
    if (w.mode === 'rise' || w.mode === 'charge' || w.mode === 'attack' || w.mode === 'stumble') {
      witch = 'angry';
      break;
    }
    if (w.mode === 'sit') witchD = Math.min(witchD, Math.hypot(w.x - p.x, w.y - p.y));
  }
  if (!witch && witchD < WITCH_NEAR) witch = 'near';
  const hunters = [];
  for (const z of game.zombies) {
    if (z.alive && z.type === 'hunter' && Math.hypot(z.x - p.x, z.y - p.y) < HUNTER_NEAR) hunters.push(z);
  }
  const T = D.terror;
  const F = game.events && game.events.finale;
  let finale = null;
  if (F && F.state === 'docked') finale = 'escape';
  else if (F && F.state === 'called') finale = F.t >= F.dur - FERRY.arrive ? 'escape' : 'hold';
  const H = game.events && game.events.holdout;
  return {
    screen,
    run: game.runSerial,
    level: game.level,
    won: game.won,
    lost: game.lost,
    phase: D.phase,
    intensity: D.intensity,
    threatNear: D.threatNear,
    hordes: game.stats.hordes,
    alarm: !!D.alarm,
    tank: D.tankEngaged ? 'engaged' : D.tankAlive ? 'alive' : null,
    witch,
    hunters,
    terror: T && T.alive && T.lit > 0.35 ? T : null,
    finale,
    holdout: !!(H && H.state === 'running'),
  };
}

export class MusicDirector {
  constructor() {
    this.run = null;
    this.cue = null;
    this.stingers = [];
    this.hordeT = 0;
    this.hordeCue = null;
    this.hordeN = 0;
    this.lastHordes = 0;
    this.tensionT = 0;
    this.tensionN = 0;
    this.witchT = 0;
    this.stingT = 0;
    this.seen = new WeakSet();
  }

  _newRun(s) {
    this.run = s.run;
    this.hordeT = 0;
    this.hordeCue = null;
    this.lastHordes = s.hordes;
    this.tensionT = 0;
    this.witchT = 0;
    this.stingT = 0;
  }

  bed(s) {
    const beds = LEVEL_BEDS[s.level] || LEVEL_BEDS.city;
    return beds[Math.abs(s.run | 0) % beds.length];
  }

  tension(s) {
    return TENSIONS[(Math.abs(s.run | 0) + this.tensionN) % TENSIONS.length];
  }

  /**
   * One step. Returns { cue, stingers }: the cue that should be playing now (null = silence)
   * and any one-shot stingers to fire this frame.
   */
  update(dt, s) {
    this.stingers = [];
    if (s.screen === 'title') return this._out('menu');
    if (s.screen === 'paused') return this._out(this.cue);
    if (s.run !== this.run) this._newRun(s);

    if (s.lost) return this._out('end_dead');
    if (s.won) return this._out(s.level === 'docks' ? 'end_rescued' : 'end_saferoom');

    // A new mob: the next horde cue in the rotation, held while the fighting lasts.
    if (s.hordes > this.lastHordes) {
      const list = s.level === 'interior' ? INDOOR_HORDES : HORDES;
      this.hordeCue = list[this.hordeN++ % list.length];
      this.hordeT = HORDE_HOLD;
    }
    this.lastHordes = s.hordes;
    if (s.alarm) this.hordeT = Math.max(this.hordeT, HORDE_HOLD);
    if (this.hordeT > 0 && s.threatNear < BUSY && !s.alarm) this.hordeT -= dt;
    if (s.phase === 'calm') this.hordeT = 0;

    if (s.witch === 'angry') this.witchT = 6;
    else this.witchT = Math.max(0, this.witchT - dt);

    const rising = s.phase === 'build' && (s.intensity >= 0.45 || s.threatNear >= 3);
    const peak = s.phase === 'peak';
    if (rising || peak) {
      if (this.tensionT <= 0) this.tensionN++;
      this.tensionT = 10;
    } else this.tensionT = Math.max(0, this.tensionT - dt);

    this._specials(dt, s);

    let cue;
    if (s.finale) cue = s.finale === 'escape' ? 'finale_escape' : 'finale_hold';
    else if (s.holdout) cue = 'holdout';
    else if (s.tank === 'engaged') cue = 'tank';
    else if (this.witchT > 0) cue = 'witch_angry';
    else if (s.alarm) cue = 'panic';
    else if (this.hordeT > 0 && this.hordeCue) cue = this.hordeCue;
    else if (s.witch === 'near') cue = 'witch_near';
    else if (s.tank === 'alive') cue = 'tank_near';
    else if (this.tensionT > 0) cue = this.tension(s);
    else if (s.phase === 'calm') cue = 'saferoom';
    else cue = this.bed(s);
    if (cue === 'panic' && this.cue && this.cue.startsWith('horde') && this.hordeT > 0) cue = this.cue; // a mob already raging stays
    return this._out(cue);
  }

  _specials(dt, s) {
    this.stingT = Math.max(0, this.stingT - dt);
    for (const h of s.hunters) {
      if (this.seen.has(h)) continue;
      this.seen.add(h);
      if (this.stingT <= 0) {
        this.stingers.push('sting_hunter');
        this.stingT = 12;
      }
    }
    if (s.terror && !this.seen.has(s.terror)) {
      this.seen.add(s.terror);
      if (this.stingT <= 0) {
        this.stingers.push('sting_terror');
        this.stingT = 12;
      }
    }
  }

  _out(cue) {
    this.cue = cue;
    return { cue, stingers: this.stingers };
  }

  /** Cues worth having decoded before they're needed, most likely first. */
  preload(s) {
    if (s.screen === 'title') return ['menu', 'saferoom', this.bed(s)];
    const list = [];
    if (s.phase === 'calm') list.push(this.bed(s));
    const hordes = s.level === 'interior' ? INDOOR_HORDES : HORDES;
    list.push(hordes[this.hordeN % hordes.length], this.tension(s));
    if (s.tank) list.push('tank');
    if (s.witch) list.push('witch_angry');
    if (s.finale === 'hold') list.push('finale_escape');
    if (s.finale) list.push('end_rescued');
    return list;
  }
}
