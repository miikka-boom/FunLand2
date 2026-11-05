// A match: two sides, a deck of cards each, mana, the clock and the crowns.
//
// The Match owns an arena Battle with four towers and is the only thing the
// UI (and the bots) talk to: play cards with play(), advance with step(). It
// is pure and deterministic: the same seed and the same plays at the same
// steps replay the same match.

import { WORLD, enemyOf } from '../config.js';
import { CARDS, HAND_SIZE, MAX_LEVEL, cardById } from './cards.js';
import { Battle, DT } from './battle.js';
import { castSpell } from './spells.js';
import { destroyTower } from './towers.js';
import { Rng } from './rng.js';

// Rules (seconds unless noted). Tunable.
export const REGULATION = 120; // the match clock
export const OVERTIME = 60; // tied at 0:00: sudden death, first tower down wins
export const MANA_START = 5;
export const MANA_MAX = 10;
export const MANA_TIME = 2.8; // seconds per mana...
export const DOUBLE_MANA_LEFT = 60; // ...twice as fast in the last 60 s of regulation and all of overtime
export const LANE_SPREAD = 1; // played units get random lanes in [0, LANE_SPREAD]
export const FORMATION_GAP = 24; // px between beans of a card that has no `spread`

const TEAMS = ['blue', 'red'];
const isTeam = (team) => team === 'blue' || team === 'red'; // (not just any key: '__proto__' is "in" every object)
/** A card or King Level from a profile: a whole number in [1, MAX_LEVEL] (missing or junk = 1). */
const cleanLevel = (l) => Math.max(1, Math.min(MAX_LEVEL, Math.floor(+l) || 1));

export class Match {
  /** opts: { seed, blue: Side, red: Side }; Side = { name, deck: [8 ids], levels: { id: level }, kingLevel, hats? } */
  constructor({ seed = 1, blue = {}, red = {} } = {}) {
    this.seed = seed >>> 0 || 1;
    this.rng = new Rng((this.seed * 2654435761) ^ 0x5bd1e995); // hand shuffles and drop lanes
    this.battle = new Battle(this.seed, { mode: 'arena' });
    this.crowns = this.battle.crowns; // the battle counts them as towers fall
    this.time = 0;
    this.phase = 'fight'; // fight | overtime | over
    this.doubleMana = false;
    this.winner = null;
    this.endTime = null;
    this.endReason = null; // 'castle' | 'time' | 'overtime' | 'tiebreak' | 'surrender'
    this.overtimeT = null; // when overtime started
    this.steps = 0;
    this.sides = {};
    for (const team of TEAMS) {
      const S = (team === 'blue' ? blue : red) || {};
      this.sides[team] = this.makeSide(team, S);
      this.battle.hats[team] = { ...(S.hats || {}) };
      const lvl = this.sides[team].kingLevel;
      this.battle.addTower('castle', team, WORLD.castleX[team], lvl);
      this.battle.addTower('guard', team, WORLD.towerX[team], lvl);
    }
  }

  makeSide(team, S) {
    const deck = (Array.isArray(S.deck) ? S.deck : []).filter((id) => cardById(id));
    // Deterministic shuffle (Fisher-Yates from the match seed): the first 4 are the hand
    const order = deck.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = (this.rng.next() * (i + 1)) | 0;
      [order[i], order[j]] = [order[j], order[i]];
    }
    const hand = order.slice(0, HAND_SIZE);
    const queue = order.slice(HAND_SIZE);
    return {
      team,
      name: S.name || (team === 'blue' ? 'Blue' : 'Red'),
      mana: MANA_START,
      hand,
      queue, // cards waiting behind the hand; queue[0] is shown as `next`
      next: queue[0] ?? null,
      crowns: 0,
      kingLevel: cleanLevel(S.kingLevel),
      levels: Object.fromEntries(deck.map((id) => [id, cleanLevel(S.levels && Object.prototype.hasOwnProperty.call(S.levels, id) ? S.levels[id] : 1)])),
      deck,
      played: 0, // cards played this match
      spellsPlayed: 0,
    };
  }

  /** Seconds left on the clock that's running (the overtime clock during overtime). */
  get timeLeft() {
    if (this.overtimeT != null) return Math.max(0, REGULATION + OVERTIME - this.time);
    return Math.max(0, REGULATION - this.time);
  }

  /** [x0, x1] where `team` may drop units right now (reaches into the pocket once the enemy Guard Tower is down). */
  zone(team) {
    if (!isTeam(team)) return [0, 0];
    const [a, b] = WORLD.deploy[team];
    const guard = this.battle.towers.find((t) => t.kind === 'guard' && t.team === enemyOf(team));
    if (guard && !guard.alive) return team === 'blue' ? [a, WORLD.pocket.blue] : [WORLD.pocket.red, b];
    return [a, b];
  }

  /** '' if `team` can play hand card i at x, else why not: 'over' | 'card' | 'mana' | 'zone'. */
  canPlay(team, i, x) {
    if (this.phase === 'over') return 'over';
    const side = isTeam(team) ? this.sides[team] : null;
    const card = side && Number.isInteger(i) ? cardById(side.hand[i]) : null;
    if (!card) return 'card';
    if (side.mana < card.mana) return 'mana';
    if (!Number.isFinite(x)) return 'zone';
    if (card.kind === 'spell') return x >= 0 && x <= WORLD.width ? '' : 'zone';
    const [z0, z1] = this.zone(team);
    return x >= z0 && x <= z1 ? '' : 'zone';
  }

  /** Play hand card i at world x. Returns true if it was played. */
  play(team, i, x) {
    if (this.canPlay(team, i, x)) return false;
    const side = this.sides[team];
    const id = side.hand[i];
    const card = CARDS[id];
    side.mana -= card.mana;
    // Classic cycle: the next card takes the slot, the played one goes to the back
    if (side.queue.length) {
      side.hand[i] = side.queue.shift();
      side.queue.push(id);
    }
    side.next = side.queue[0] ?? null;
    side.played++;
    const level = side.levels[id];
    this.battle.emit('cardPlayed', x, 0, { team, card: id, level });
    if (card.kind === 'spell') {
      side.spellsPlayed++;
      castSpell(this.battle, card, team, x, level);
    } else this.deploy(team, card, x, level);
    return true;
  }

  /** Where a unit card's beans land if played at x (world x each, inside the zone): for ghost previews too. */
  formation(team, cardId, x) {
    const card = cardById(cardId);
    if (!card || card.kind !== 'unit' || !isTeam(team)) return [];
    const n = card.count || 1;
    const offs = card.spread && card.spread.length >= n ? card.spread : Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * FORMATION_GAP);
    const [z0, z1] = this.zone(team);
    const dir = team === 'blue' ? 1 : -1;
    return offs.slice(0, n).map((o) => Math.min(z1, Math.max(z0, x + o * dir)));
  }

  /** Drop a unit card's beans in their formation around x (random lanes). */
  deploy(team, card, x, level) {
    const units = [];
    for (const ux of this.formation(team, card.id, x)) {
      const lane = this.rng.next() * LANE_SPREAD;
      const seed = (this.rng.next() * 2 ** 31) | 0;
      units.push(this.battle.addUnit(card.unit, team, ux, lane, seed, { level, drop: true }));
    }
    return units;
  }

  /** Give up: the other side wins with three crowns. */
  surrender(team) {
    if (this.phase === 'over' || !isTeam(team)) return false;
    const foe = enemyOf(team);
    this.crowns[foe] = 3; // (first, so the towerDown events already show the final count)
    for (const t of this.battle.towers) if (t.team === team && t.alive) destroyTower(this.battle, t, true);
    this.end(foe, 'surrender');
    return true;
  }

  /** One fixed step: the clock, mana, the battle (units, towers, spells), then the rules. */
  step(dt = DT) {
    if (!(dt > 0)) return; // a bad frame time (0, negative, NaN) would poison the clock and the mana for good
    const live = this.phase !== 'over';
    if (live) {
      this.time += dt;
      this.steps++;
      if (!this.doubleMana && this.time >= REGULATION - DOUBLE_MANA_LEFT) {
        this.doubleMana = true;
        this.battle.emit('doubleMana', WORLD.mid, -200, {});
      }
      const rate = (this.doubleMana ? 2 : 1) / MANA_TIME;
      for (const team of TEAMS) {
        const s = this.sides[team];
        s.mana = Math.min(MANA_MAX, s.mana + rate * dt);
        // Float steps of 1/336 drift (9 mana came out as 8.999999999999986): land whole drops exactly
        const whole = Math.round(s.mana);
        if (Math.abs(s.mana - whole) < 1e-9) s.mana = whole;
      }
    }
    this.battle.step(dt);
    for (const team of TEAMS) this.sides[team].crowns = this.crowns[team];
    if (live) this.checkEnd();
  }

  checkEnd() {
    const c = this.crowns;
    if (c.blue >= 3 || c.red >= 3) {
      // A castle fell: instant win (both in the same step: a draw)
      this.end(c.blue >= 3 && c.red >= 3 ? 'draw' : c.blue >= 3 ? 'blue' : 'red', 'castle');
      return;
    }
    if (this.phase === 'fight') {
      if (this.time < REGULATION) return;
      if (c.blue !== c.red) {
        this.end(c.blue > c.red ? 'blue' : 'red', 'time');
        return;
      }
      this.phase = 'overtime';
      this.overtimeT = this.time;
      this.battle.emit('overtime', WORLD.mid, -200, {});
      return;
    }
    if (this.phase === 'overtime') {
      if (c.blue !== c.red) {
        this.end(c.blue > c.red ? 'blue' : 'red', 'overtime');
        return;
      }
      if (this.time < REGULATION + OVERTIME) return;
      // Still tied: the side whose weakest standing tower is worse off loses
      const fb = this.weakest('blue');
      const fr = this.weakest('red');
      this.end(Math.abs(fb - fr) < 1e-9 ? 'draw' : fb > fr ? 'blue' : 'red', 'tiebreak');
    }
  }

  /** Health fraction of a side's weakest standing tower (0 if none stand). */
  weakest(team) {
    let f = Infinity;
    for (const t of this.battle.towers) if (t.team === team && t.alive) f = Math.min(f, t.hp / t.maxHp);
    return f === Infinity ? 0 : f;
  }

  end(winner, reason) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.winner = winner;
    this.endReason = reason;
    this.endTime = this.time;
    const b = this.battle;
    b.phase = 'over';
    b.winner = winner;
    for (const u of b.units) if (u.alive && u.team === winner) u.state = 'cheer';
    for (const team of TEAMS) this.sides[team].crowns = this.crowns[team];
    b.emit('matchEnd', WORLD.mid, -200, { winner, crowns: { ...this.crowns }, reason });
  }

  /** The result from one side's point of view. */
  result(team) {
    const foe = enemyOf(team);
    const outcome = this.winner == null ? null : this.winner === 'draw' ? 'draw' : this.winner === team ? 'win' : 'loss';
    return {
      outcome,
      crowns: this.crowns[team],
      enemyCrowns: this.crowns[foe],
      threeCrown: this.crowns[team] >= 3,
      duration: this.endTime ?? this.time,
    };
  }
}
