// Strays: the block, as it looks on the little screen. Twelve rooms, whoever
// lives in them, what they want, and what happens when you tap.
//
// The rules (rules.js) change at once when something is tapped; this file
// plays the little scene that goes with it, so what you see can lag a moment
// behind what is true (the hearts fly in one by one, the cans count up).

import { COLS, ROWS, ROOMS, BAG, STRAY, SOMEBODY, HERO, KIND_BY_ID, RARITIES } from './config.js';
import * as S from './sprites.js';
import { COL, RARITY_COL } from './sprites.js';
import { LCD_W, LCD_H } from './lcd.js';
import { textWidth } from './font.js';
import { buzz } from './audio.js';
import { SAY, span } from './words.js';
import { Outing } from './outing.js';
import { RevealCard, BookScreen, TitleScreen, Finale } from './cards.js';

/** Where things are on the 152x84 screen. */
export const GEO = {
  barH: 7, // the status line across the top
  x0: 16, // left edge of the first room
  y0: 8, // top edge of the first row
  cw: 28, // a room and its wall
  ch: 24, // a room, its heart bar and its floor
  iw: 27, // inside a room
  ih: 21,
  ground: 80,
  fenceX: 130,
};

export function roomBox(i) {
  return { x: GEO.x0 + (i % COLS) * GEO.cw, y: GEO.y0 + Math.floor(i / COLS) * GEO.ch, w: GEO.iw, h: GEO.ih };
}

/** The room under an LCD pixel, or -1. */
export function roomAt(x, y) {
  const c = Math.floor((x - GEO.x0) / GEO.cw);
  const r = Math.floor((y - GEO.y0) / GEO.ch);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
  return r * COLS + c;
}

const NEUTRAL_WALL = ['#e4ddcf', '#d1c7b4'];
const ASKS = new Set(['wake', 'hurt', 'grow', 'hungry', 'hug']);
const ICON_OF = { wake: 'wake', hurt: 'patch', grow: 'grow', hungry: 'can', hug: 'heart', door: 'door' };

/** The sky behind the block, by the hour. */
export function skyAt(hour) {
  if (hour < 5 || hour >= 21) return { top: '#17162e', low: '#2b2a52', stars: true, night: true };
  if (hour < 8) return { top: '#f3ad8c', low: '#f9d5a8', sun: true };
  if (hour < 17) return { top: '#7cc6eb', low: '#b9e4f5', sun: true, clouds: true };
  return { top: '#5f4c92', low: '#f19c6c', stars: false, dusk: true };
}

/** Sprites, painted once and kept. */
class Bank {
  constructor() {
    this.map = new Map();
    this.whites = new WeakMap();
  }

  get(key, make) {
    let v = this.map.get(key);
    if (!v) {
      v = make();
      this.map.set(key, v);
    }
    return v;
  }

  /** A sprite from sprites.js by export name (and optional sub-key). */
  art(name, sub, pal) {
    return this.get(`A|${name}|${sub || ''}|${pal ? JSON.stringify(pal) : ''}`, () => S.paint(sub ? S[name][sub] : S[name], pal));
  }

  person(p, o = {}) {
    const key = `P|${p.kind}|${p.skin}|${p.hair}|${p.style}|${o.face || ''}|${o.legs || ''}|${o.hero ? 1 : 0}|${o.down ? 1 : 0}|${o.flip ? 1 : 0}`;
    return this.get(key, () => {
      const sp = S.personSprite(p, o);
      return o.flip ? S.flip(sp) : sp;
    });
  }

  stray(rarity, o = {}) {
    const key = `S|${rarity}|${o.face || ''}|${o.down ? 1 : 0}|${o.flip ? 1 : 0}`;
    return this.get(key, () => {
      const sp = S.straySprite(RARITY_COL[rarity], o);
      return o.flip ? S.flip(sp) : sp;
    });
  }

  bag(rarity, frame) {
    return this.get(`B|${rarity}|${frame}`, () => S.paint(frame ? S.BAG_B : S.BAG_A, { ...S.STRAY_PAL, P: RARITY_COL[rarity] }));
  }

  head(p) {
    return this.get(`H|${p.kind}|${p.skin}|${p.hair}|${p.style}`, () => S.headSprite(p));
  }

  zombie(frame, flipped) {
    return this.get(`Z|${frame}|${flipped ? 1 : 0}`, () => {
      const sp = S.paint(frame ? S.ZOMBIE_B : S.ZOMBIE_A);
      return flipped ? S.flip(sp) : sp;
    });
  }

  white(sprite, colour = COL.white) {
    let w = this.whites.get(sprite);
    if (!w) {
      w = S.silhouette(sprite, colour);
      this.whites.set(sprite, w);
    }
    return w;
  }
}

/** Somebody on screen: where they stand and what they are up to. */
class Actor {
  constructor(p, rnd) {
    this.id = p.id;
    this.x = 3 + rnd() * 6; // left edge of the 16px sprite, from the room's left wall
    this.dir = rnd() < 0.5 ? 1 : -1;
    this.stage = p.stage; // what the screen shows; lags behind the rules during a scene
    this.hearts = p.hearts;
    this.wish = null; // the wish on show
    this.face = null;
    this.faceUntil = 0;
    this.y = 0;
    this.vy = 0;
    this.squash = 0;
    this.step = 0;
    this.pause = 400 + rnd() * 2500;
    this.target = null;
    this.blink = 800 + rnd() * 3000;
    this.phase = rnd() * 1000;
    this.flash = false;
    this.hidden = false;
    this.wiggle = 0;
    this.bubT = 0; // when the bubble popped in
    this.barFlash = 0;
  }
}

export class Block {
  /** @param ctx { game, lcd, sfx, tuning, save, rnd } */
  constructor(ctx) {
    this.game = ctx.game;
    this.lcd = ctx.lcd;
    this.sfx = ctx.sfx;
    this.tuning = ctx.tuning;
    this.save = ctx.save || (() => {});
    this.rnd = ctx.rnd || Math.random;
    this.bank = new Bank();
    this.time = 0;
    this.rate = 1; // the testing drawer can hurry the little scenes
    this.waits = [];
    this.actors = new Map();
    this.parts = [];
    this.busy = new Set(); // rooms in the middle of a scene
    this.lock = 0; // > 0: a bigger scene is playing; taps wait
    this.cansShown = this.game.s.cans;
    this.cansBump = 0;
    this.line = { text: '', n: 0, until: 0, colour: COL.cream, advice: true, scroll: 0, hold: 0 };
    this.adviceAt = 0;
    this.ask = null; // { room, until }: a room waiting for its second tap
    this.pick = false; // choosing who goes out
    this.modal = null;
    this.zeds = []; // zombies at the fence, front first
    this.doorX = -18; // the waiting stray walks in from off screen
    this.doorId = null;
    this.late = new Set(); // people the rules already know but the screen hasn't shown yet
    this.sel = null;
    this.cover = 0; // the wipe between scenes, 0..1
    this.attention = 0; // how many wishes are waiting (for the lamp on the shell)
    this.shake = 0;
    this.chirpAt = 0;
    this.started = false;
    this.syncActors(true);
    for (let i = 0; i < this.game.s.zombies; i++) this.zeds.push({ x: this.zedSlot(i), fly: null, phase: this.rnd() * 800 });
  }

  // ------------------------------------------------------------------ time

  /** Resolves after `ms` of screen time (shorter when hurried). */
  wait(ms) {
    return new Promise((res) => this.waits.push({ at: this.time + ms / this.rate, res }));
  }

  /** Call fn(k) with k from 0 to 1 over `ms`. */
  async tween(ms, fn) {
    const t0 = this.time;
    const dur = ms / this.rate;
    for (;;) {
      const k = Math.min(1, (this.time - t0) / dur);
      fn(k);
      if (k >= 1) return;
      await this.wait(0);
    }
  }

  update(dt) {
    this.time += dt;
    if (this.waits.length) {
      const due = this.waits.filter((w) => w.at <= this.time);
      if (due.length) {
        this.waits = this.waits.filter((w) => w.at > this.time);
        for (const w of due) w.res();
      }
    }
    if (this.modal && this.modal.update) this.modal.update(dt);
    const arrived = this.game.tick().zombies;
    for (let i = 0; i < arrived; i++) this.zombieArrives();
    this.syncActors(false);
    this.updateActors(dt);
    this.updateZeds(dt);
    this.updateParts(dt);
    this.updateLine(dt);
    if (this.ask && this.time > this.ask.until) this.ask = null;
    if (this.sel && this.time > this.sel.until) this.sel = null;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    this.lcd.shake = this.shake > 0 ? 1 : 0;
    if (Math.abs(this.cansShown - this.game.s.cans) > 0 && !this.lock && !this.busy.size && !this.parts.some((p) => p.cans)) {
      this.cansShown = this.game.s.cans; // never leave the counter wrong for long
    }
  }

  // ---------------------------------------------------------------- actors

  /** Make sure everybody the rules know has somebody on screen. */
  syncActors(first) {
    const s = this.game.s;
    const now = this.game.now();
    const seen = new Set();
    let attention = 0;
    for (let i = 0; i < ROOMS; i++) {
      const id = s.rooms[i].who;
      if (!id || this.late.has(id)) continue;
      const p = s.people[id];
      seen.add(id);
      let a = this.actors.get(id);
      if (!a) {
        a = new Actor(p, this.rnd);
        this.actors.set(id, a);
      }
      a.room = i;
      if (this.busy.has(i)) continue;
      a.stage = p.stage;
      a.hearts = p.hearts;
      const wish = this.game.wish(p, now);
      if (wish !== a.wish) {
        const asking = ASKS.has(wish);
        a.wish = wish;
        a.bubT = this.time;
        a.target = null;
        if (asking && !first && !this.lock && this.started) this.chirp();
      }
      if (ASKS.has(a.wish)) attention++;
    }
    for (const id of [...this.actors.keys()]) if (!seen.has(id)) this.actors.delete(id);
    // The stray at the door (a scene may be holding their picture there a moment longer).
    if (!this.doorHold) {
      const door = s.door && !this.late.has(s.door) ? s.door : null;
      if (door !== this.doorId) {
        this.doorId = door;
        if (door) this.doorX = first ? -1 : -18;
      }
    }
    if (s.door) attention++;
    this.attention = attention;
  }

  /** A soft "somebody wants something", not more than once every few seconds. */
  chirp() {
    if (this.time < this.chirpAt) return;
    this.chirpAt = this.time + 4000;
    this.sfx.play('chirp');
  }

  updateActors(dt) {
    for (const a of this.actors.values()) {
      if (a.faceUntil && this.time > a.faceUntil) {
        a.face = null;
        a.faceUntil = 0;
      }
      a.blink -= dt;
      if (a.blink < -130) a.blink = 1500 + this.rnd() * 3500;
      if (a.squash > 0) a.squash -= dt;
      if (a.wiggle > 0) a.wiggle -= dt;
      if (a.barFlash > 0) a.barFlash -= dt;
      // Hops.
      if (a.y < 0 || a.vy < 0) {
        a.vy += 320 * (dt / 1000);
        a.y += a.vy * (dt / 1000);
        if (a.y >= 0) {
          a.y = 0;
          a.vy = 0;
          a.squash = 110;
        }
      }
      if (this.busy.has(a.room) || a.stage === BAG || a.wish === 'rest') continue;
      // Somebody with a wish comes to the front of the room and waits.
      const goal = ASKS.has(a.wish) ? -1 : a.target;
      if (goal == null) {
        a.pause -= dt;
        if (a.pause <= 0) {
          a.target = -2 + this.rnd() * 13;
          if (a.stage === STRAY) a.target = -1 + this.rnd() * 5; // strays keep to their corner
        }
        continue;
      }
      const dx = goal - a.x;
      if (Math.abs(dx) < 0.4) {
        a.x = goal;
        a.step = 0;
        if (ASKS.has(a.wish)) a.dir = 1;
        else {
          a.target = null;
          a.pause = 1200 + this.rnd() * 4200;
          if (this.rnd() < 0.25) this.hop(a, 42);
        }
        continue;
      }
      a.dir = dx > 0 ? 1 : -1;
      a.x += a.dir * Math.min(Math.abs(dx), (a.stage === STRAY ? 6 : 9) * (dt / 1000));
      a.step += dt;
    }
    // The stray at the door walks up to it.
    if (this.doorId && this.doorX < -1) this.doorX = Math.min(-1, this.doorX + 22 * (dt / 1000));
  }

  hop(a, v = 52) {
    if (a.y < 0) return;
    a.vy = -v;
    a.y = -0.01;
  }

  // --------------------------------------------------------------- zombies

  zedSlot(i) {
    return 128 + i * 5;
  }

  zombieArrives() {
    if (this.zeds.filter((z) => !z.fly).length >= this.tuning.zombieMax) return;
    this.zeds.push({ x: LCD_W + 2, fly: null, phase: this.rnd() * 800 });
    if (!this.lock && this.started) this.sfx.play('zombie');
    if (!this.game.s.seen.zombie && !this.lock && !this.modal) {
      this.game.s.seen.zombie = true;
      this.say(SAY.zombieFirst(), { ms: 6000 });
    }
  }

  updateZeds(dt) {
    let slot = 0;
    for (const z of this.zeds) {
      if (z.fly) {
        z.fly.t += dt;
        continue;
      }
      const want = this.zedSlot(slot++);
      if (z.x > want) z.x = Math.max(want, z.x - 9 * (dt / 1000));
      else if (z.x < want) z.x = Math.min(want, z.x + 9 * (dt / 1000));
    }
    this.zeds = this.zeds.filter((z) => !z.fly || z.fly.t < 900);
    // The rules are the truth: if the count drifts (a save was loaded), follow it.
    const standing = this.zeds.filter((z) => !z.fly).length;
    if (standing < this.game.s.zombies) this.zeds.push({ x: LCD_W + 2, fly: null, phase: this.rnd() * 800 });
    else if (standing > this.game.s.zombies) this.zeds.splice(this.zeds.findIndex((z) => !z.fly), 1);
  }

  // ------------------------------------------------------------- particles

  /** A sprite that flies from A to B in an arc, then calls `then`. */
  fly(sprite, from, to, ms, o = {}) {
    return new Promise((res) => {
      this.parts.push({
        sprite,
        from,
        to,
        dur: ms / this.rate,
        age: -(o.delay || 0) / this.rate,
        arc: o.arc || 0,
        cans: !!o.cans,
        then: () => {
          if (o.then) o.then();
          res();
        },
      });
    });
  }

  /** Loose bits: thrown up, falling down. */
  burst(sprite, x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const ang = o.up ? -Math.PI / 2 + (this.rnd() - 0.5) * (o.spread ?? 1.6) : this.rnd() * Math.PI * 2;
      const v = (o.speed || 34) * (0.5 + this.rnd() * 0.7);
      this.parts.push({
        sprite,
        x,
        y,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v,
        g: o.g ?? 90,
        age: 0,
        life: (o.life || 520) * (0.7 + this.rnd() * 0.5),
      });
    }
  }

  /** A little number that floats up. */
  float(text, x, y, colour = COL.white) {
    this.parts.push({ text, x, y, vy: -14, age: 0, life: 900, colour });
  }

  updateParts(dt) {
    if (!this.parts.length) return;
    const done = [];
    for (const p of this.parts) {
      p.age += dt;
      if (p.from) {
        if (p.age >= p.dur) done.push(p);
      } else {
        const k = dt / 1000;
        if (p.vx != null) {
          p.vy += (p.g || 0) * k;
          p.x += p.vx * k;
        }
        p.y += p.vy * k;
        if (p.age >= p.life) done.push(p);
      }
    }
    if (done.length) {
      this.parts = this.parts.filter((p) => !done.includes(p));
      for (const p of done) if (p.then) p.then();
    }
  }

  // ---------------------------------------------------------------- the line

  /** Write on the status line. It types itself out, stays a while, then the hint comes back. */
  say(text, o = {}) {
    this.line = {
      text,
      n: o.instant ? text.length : 0,
      until: this.time + (o.ms || 3800) + text.length * 28,
      colour: o.colour || COL.cream,
      advice: false,
      scroll: 0,
      hold: 0,
    };
  }

  /** The hint: the one next thing worth doing. */
  adviceText() {
    const g = this.game;
    const now = g.now();
    const a = g.advice(now);
    const name = a.id ? g.person(a.id).name : '';
    switch (a.do) {
      case 'wake':
        return SAY.hintWake();
      case 'patch':
        return SAY.hintPatch(name);
      case 'grow':
        return g.person(a.id).stage === STRAY ? SAY.hintShow(name) : SAY.hintGrow(name);
      case 'feed':
        return SAY.hintFeed(name);
      case 'hug':
        return SAY.hintHug(name);
      case 'open':
        return SAY.hintOpen();
      case 'go':
        return SAY.hintGo();
      case 'bonk':
        return SAY.hintBonk();
      case 'save':
        return SAY.hintSave(a.price);
      default: {
        const tally = g.tally();
        if (tally.allHeroes) return SAY.hintDone();
        if (a.at == null) return SAY.hintCosy();
        if (a.at - now < 12000) return ''; // something is about to happen: let it
        return SAY.hintWait(a.at - now);
      }
    }
  }

  updateLine(dt) {
    const l = this.line;
    if (!l.advice && this.time > l.until && !this.lock) {
      l.advice = true;
      this.adviceAt = 0;
    }
    if (l.advice) {
      if (this.time >= this.adviceAt) {
        this.adviceAt = this.time + 700;
        const text = this.pick ? SAY.hintPick() : this.adviceText();
        if (text !== l.text) {
          l.text = text;
          l.n = text.length;
          l.scroll = 0;
          l.hold = 0;
        }
      }
      l.colour = '#b6b6d6';
    } else if (l.n < l.text.length) {
      const before = Math.floor(l.n);
      l.n = Math.min(l.text.length, l.n + dt * 0.045 * this.rate);
      if (Math.floor(l.n) > before && Math.floor(l.n) % 2 === 0) this.sfx.play('type');
    }
    // A line too long for the screen slides along.
    const room = LCD_W - this.lineX() - 2;
    const over = textWidth(l.text.slice(0, Math.floor(l.n))) - room;
    if (over > 0) {
      l.hold += dt;
      if (l.hold > 900) l.scroll = Math.min(over, l.scroll + dt * 0.03);
      if (l.scroll >= over && l.hold > 900 + over / 0.03 + 1400) {
        l.scroll = 0;
        l.hold = 0;
      }
    } else l.scroll = 0;
  }

  lineX() {
    return 4 + textWidth(`¢${Math.max(0, Math.round(this.cansShown))}`) + 5;
  }

  // ------------------------------------------------------------------ taps

  /** A tap at LCD pixel (x, y). */
  tap(x, y) {
    if (this.modal) {
      if (this.modal.tap) this.modal.tap(x, y);
      return;
    }
    if (this.lock || this.time < (this.graceUntil || 0)) return;
    if (y < GEO.barH) {
      this.sfx.play('tap');
      this.say(this.adviceText(), { instant: true });
      return;
    }
    const i = roomAt(x, y);
    if (this.pick) {
      const id = i >= 0 ? this.game.s.rooms[i].who : null;
      if (id && this.game.eligible().includes(id)) this.trip(id);
      else {
        this.pick = false;
        this.sfx.play('tap');
        this.say(SAY.nobodyGoes(), { ms: 1200 });
      }
      return;
    }
    if (i >= 0) this.tapRoom(i);
    else if (x >= 128 && y >= 44) this.tapFence();
    else if (x < GEO.x0 && y >= 52) this.tapDoor();
  }

  /** Sliding a finger across the rooms feeds, hugs and patches as it goes. */
  swipe(x, y) {
    if (this.modal || this.lock || this.pick) return;
    const i = roomAt(x, y);
    if (i < 0 || this.busy.has(i)) return;
    const act = this.game.roomAction(i).act;
    if (act === 'feed' || act === 'hug' || act === 'patch') this.tapRoom(i);
  }

  /** A shell button: 'go' or 'book'. */
  press(key) {
    if (this.modal) {
      if (this.modal.press) this.modal.press(key);
      return;
    }
    if (this.lock) return;
    if (key === 'book') this.openBook();
    else if (key === 'go') this.goPressed();
  }

  tapRoom(i) {
    if (this.busy.has(i)) return;
    const g = this.game;
    const now = g.now();
    const act = g.roomAction(i, now);
    const p = act.id ? g.person(act.id) : null;
    this.sel = { room: i, until: this.time + 450 };
    switch (act.act) {
      case 'open':
        if (this.ask && this.ask.room === i) this.doOpen(i);
        else {
          this.ask = { room: i, until: this.time + 3500, price: act.price };
          this.sfx.play('ask');
          this.say(SAY.openAsk(act.price), { ms: 2600, instant: true });
        }
        break;
      case 'poor':
        this.ask = { room: i, until: this.time + 1500, price: act.price, poor: true };
        this.nope(SAY.openPoor(act.price, g.s.cans));
        break;
      case 'far':
        this.nope(SAY.openFar());
        break;
      case 'empty':
        this.sfx.play('tap');
        this.say(SAY.emptyRoom());
        break;
      case 'asleep': {
        const a = this.actors.get(act.id);
        if (a) a.wiggle = 300;
        this.sfx.play('snore');
        this.say(SAY.asleep(act.ms));
        break;
      }
      case 'resting':
        this.sfx.play('snore');
        this.say(SAY.resting(p.name, act.ms));
        break;
      case 'wake':
        this.doWake(i, p);
        break;
      case 'patch':
        this.doPatch(i, p);
        break;
      case 'grow':
        this.doGrow(i, p);
        break;
      case 'feed':
        this.doFeed(i, p);
        break;
      case 'nocans':
        this.nope(SAY.noCans(p.name));
        break;
      case 'hug':
        this.doHug(i, p);
        break;
      case 'hello': {
        const a = this.actors.get(act.id);
        if (a) {
          this.hop(a);
          a.face = 'happy';
          a.faceUntil = this.time + 700;
        }
        this.sfx.play('hop');
        this.say(this.about(p), { instant: true });
        break;
      }
      default:
        break;
    }
  }

  /** "KAI THE COOK ♥5/14" */
  about(p) {
    const info = this.game.info(p);
    if (p.stage === STRAY) return SAY.aboutStray(p.name, info.hearts, info.need);
    const kind = KIND_BY_ID[p.kind].name;
    if (p.stage >= HERO) return SAY.aboutHero(p.name, kind);
    return SAY.aboutSomebody(p.name, kind, info.hearts, info.need);
  }

  nope(text) {
    this.sfx.play('nope');
    buzz(30, this.tuning.haptics);
    this.shake = 140;
    this.say(text, { colour: COL.rose, instant: true });
  }

  tapFence() {
    const res = this.game.bonk();
    if (!res.ok) {
      this.sfx.play('tap');
      this.say(this.game.s.zombieAt ? SAY.fenceQuiet() : SAY.fenceNew(), { ms: 1500 });
      return;
    }
    const z = this.zeds.find((q) => !q.fly);
    this.sfx.play('bonk');
    buzz(18, this.tuning.haptics);
    this.shake = 90;
    if (z) {
      z.fly = { t: 0, x: z.x };
      const zx = z.x + 8;
      const zy = GEO.ground - 12;
      this.burst(this.bank.art('BITS', 'bonk'), zx - 2, zy - 2, 1, { speed: 0, g: 0, life: 260 });
      this.burst(this.bank.art('BITS', 'spark'), zx, zy, 5, { speed: 44, life: 380 });
      if (res.can) {
        this.fly(this.bank.art('BITS', 'canTop'), [zx - 3, zy - 3], [2, 1], 520, {
          arc: 18,
          delay: 120,
          cans: true,
          then: () => this.gain(1),
        });
      }
    }
    if (!res.can) this.cansShown = Math.min(this.cansShown, this.game.s.cans);
    this.say(res.can ? SAY.bonkCan() : SAY.bonk(), { ms: 1400, instant: true });
    this.save();
  }

  tapDoor() {
    if (!this.doorId) return;
    this.sfx.play('tap');
    const price = this.game.price();
    this.say(this.game.s.cans >= price ? SAY.doorTap() : SAY.hintSave(price), { instant: true });
  }

  /** The counter goes up by n, with a ding. */
  gain(n) {
    this.cansShown = Math.min(this.game.s.cans, this.cansShown + n);
    this.cansBump = this.time;
    this.sfx.play('can');
  }

  // ------------------------------------------------------------ little scenes

  mouthOf(a, box) {
    return [box.x + Math.round(a.x) + 6, box.y + box.h - 16 + 6];
  }

  /** Hearts rise from somebody and drop into the bar under their room. */
  async hearts(i, a, n) {
    const box = roomBox(i);
    const jobs = [];
    for (let k = 0; k < n; k++) {
      const from = [box.x + Math.round(a.x) + 6 + (k % 2 ? 4 : -3), box.y + box.h - 14];
      const need = this.needShown(a) || 1;
      const to = [box.x + Math.min(box.w - 3, Math.round(((a.hearts + k + 0.5) / need) * box.w)), box.y + box.h];
      jobs.push(
        this.fly(this.bank.art('BITS', 'heart'), from, to, 420, {
          arc: 9,
          delay: k * 130,
          then: () => {
            a.hearts += 1;
            a.barFlash = 200;
            this.sfx.play('heart', { i: Math.min(7, a.hearts) });
          },
        }),
      );
    }
    await Promise.all(jobs);
  }

  needShown(a) {
    if (a.stage === STRAY) return this.tuning.needReveal;
    if (a.stage === SOMEBODY) return this.tuning.needHero;
    return 0;
  }

  /** After a little scene: say what happened, and whether the bar is full. */
  after(i, p, res, text) {
    this.busy.delete(i);
    if (res.ready) {
      this.sfx.play('ready');
      this.say(p.stage === STRAY ? SAY.hintShow(p.name) : SAY.hintGrow(p.name), { colour: COL.gold });
    } else this.say(text);
    this.save();
  }

  async doFeed(i, p) {
    const res = this.game.feed(p.id);
    if (!res.ok) return;
    const a = this.actors.get(p.id);
    const box = roomBox(i);
    this.busy.add(i);
    a.wish = null;
    this.cansShown = Math.max(0, this.cansShown - 1);
    this.cansBump = this.time;
    this.sfx.play('canOut');
    buzz(10, this.tuning.haptics);
    await this.fly(this.bank.art('BITS', 'canTop'), [2, 1], this.mouthOf(a, box).map((v, k) => v - (k ? 3 : 3)), 300, { arc: 10, cans: true });
    for (let k = 0; k < 4; k++) {
      a.face = k % 2 ? 'chompB' : 'chompA';
      a.faceUntil = 0;
      a.squash = k % 2 ? 0 : 90;
      this.sfx.play('chomp');
      const [mx, my] = this.mouthOf(a, box);
      this.burst(this.bank.art('BITS', 'crumb'), mx + 1, my + 1, 2, { speed: 22, life: 300, g: 120 });
      await this.wait(105);
    }
    a.face = 'happy';
    a.faceUntil = this.time + 1000;
    this.hop(a);
    await this.hearts(i, a, res.hearts);
    this.after(i, p, res, SAY.fed(p.name, res.hearts));
  }

  async doHug(i, p) {
    const res = this.game.hug(p.id);
    if (!res.ok) return;
    const a = this.actors.get(p.id);
    const box = roomBox(i);
    this.busy.add(i);
    a.wish = null;
    this.sfx.play('hug');
    buzz([10, 40, 10], this.tuning.haptics);
    a.face = 'happy';
    a.faceUntil = this.time + 1100;
    const hx = box.x + Math.round(a.x) + 4;
    const hy = box.y + box.h - 16 - 4;
    this.parts.push({ sprite: this.bank.art('BITS', 'heartBig'), x: hx, y: hy, vy: -9, age: 0, life: 520 });
    a.squash = 160;
    await this.wait(170);
    this.hop(a, 44);
    await this.wait(240);
    await this.hearts(i, a, res.hearts);
    this.after(i, p, res, SAY.hugged(p.name, res.hearts));
  }

  async doPatch(i, p) {
    const res = this.game.patch(p.id);
    if (!res.ok) return;
    const a = this.actors.get(p.id);
    const box = roomBox(i);
    this.busy.add(i);
    a.wish = null;
    this.sfx.play('patch');
    a.face = 'blink';
    a.faceUntil = this.time + 300;
    this.burst(this.bank.art('BITS', 'plus'), box.x + Math.round(a.x) + 7, box.y + box.h - 12, 4, { up: true, speed: 30, g: 40, life: 500 });
    await this.wait(320);
    a.face = 'happy';
    a.faceUntil = this.time + 900;
    this.hop(a);
    await this.hearts(i, a, res.hearts);
    this.after(i, p, res, SAY.patched(p.name, res.hearts));
  }

  async doWake(i, p) {
    const res = this.game.wake(p.id);
    if (!res.ok) return;
    const a = this.actors.get(p.id);
    const box = roomBox(i);
    this.busy.add(i);
    a.wish = null;
    a.wiggle = 420;
    this.sfx.play('zip');
    buzz(15, this.tuning.haptics);
    await this.wait(430);
    a.stage = STRAY;
    a.x = 1;
    a.dir = 1;
    this.sfx.play('pop');
    this.hop(a, 60);
    this.burst(this.bank.art('BITS', 'dust'), box.x + 8, box.y + box.h - 4, 5, { up: true, speed: 26, g: 30, life: 420 });
    await this.wait(380);
    this.busy.delete(i);
    this.say(SAY.woke(p.name));
    this.save();
  }

  /** The bar is full: flashes, then the hood comes off (or the cape goes on), then the card. */
  async doGrow(i, p) {
    const was = p.stage;
    const res = this.game.grow(p.id);
    if (!res.ok) return;
    this.save();
    const a = this.actors.get(p.id);
    const box = roomBox(i);
    this.busy.add(i);
    this.lock++;
    a.wish = null;
    a.x = Math.max(0, Math.min(10, a.x));
    this.say(was === STRAY ? SAY.hoodDown(p.name) : SAY.standsTall(p.name), { ms: 4000, instant: true, colour: COL.gold });
    for (let k = 0; k < 7; k++) {
      a.flash = k % 2 === 0;
      this.sfx.play('flash', { i: k });
      await this.wait(130 - k * 10);
    }
    a.flash = false;
    const cx = box.x + Math.round(a.x) + 8;
    const cy = box.y + box.h - 10;
    if (was === STRAY) {
      this.parts.push({ sprite: this.bank.art('HOOD', null, S.STRAY_PAL), x: cx - 4, y: cy - 8, vx: -26, vy: -58, g: 150, age: 0, life: 900 });
    }
    a.stage = res.stage;
    a.hearts = 0;
    a.face = 'wow';
    a.faceUntil = this.time + 700;
    this.hop(a, 62);
    this.sfx.play('pop');
    buzz([20, 30, 40], this.tuning.haptics);
    this.burst(this.bank.art('BITS', 'spark'), cx, cy, 9, { speed: 50, life: 520, g: 30 });
    await this.wait(520);
    await this.show(new RevealCard(this, p, res));
    this.busy.delete(i);
    this.lock--;
    const kind = KIND_BY_ID[p.kind];
    if (res.stage === SOMEBODY) {
      const first = this.game.s.met.length === 1;
      this.say(first ? SAY.firstFace(p.name, kind.name) : SAY.newFace(p.name, kind.name), { colour: COL.gold });
    } else this.say(SAY.newHero(p.name), { colour: COL.gold });
    this.checkFinale();
  }

  /** Twelve somebodies, and later twelve heroes: each is celebrated once. */
  async checkFinale() {
    const s = this.game.s;
    const tally = this.game.tally();
    const which = tally.allHeroes && !s.seen.allHeroes ? 'allHeroes' : tally.full && !s.seen.full ? 'full' : null;
    if (!which) return;
    s.seen[which] = true;
    if (which === 'allHeroes') s.seen.full = true;
    this.save();
    this.lock++;
    await this.wait(700);
    await this.show(new Finale(this, which));
    this.lock--;
  }

  async doOpen(i) {
    const hadDoor = this.game.s.door;
    if (hadDoor) {
      this.late.add(hadDoor);
      this.doorHold = true; // they stay in view at the door until they hop in
    }
    const res = this.game.open(i);
    if (!res.ok) {
      this.late.delete(hadDoor);
      this.doorHold = false;
      return;
    }
    this.save();
    this.ask = null;
    const box = roomBox(i);
    this.busy.add(i);
    this.opening = { room: i, t: 0 };
    // The cans go in.
    const n = Math.min(res.price, 6);
    for (let k = 0; k < n; k++) {
      this.fly(this.bank.art('BITS', 'can'), [3, 2], [box.x + 6 + ((k * 5) % 16), box.y + 8 + ((k * 3) % 6)], 260, { arc: 6, delay: k * 45, cans: true });
    }
    await this.tween(Math.max(300, n * 45 + 260), (k) => {
      this.cansShown = Math.round(this.game.s.cans + res.price * (1 - k));
    });
    this.cansShown = this.game.s.cans;
    this.sfx.play('open');
    buzz([15, 40, 25], this.tuning.haptics);
    this.shake = 160;
    const plank = this.bank.art('PLANK');
    this.parts.push({ sprite: plank, x: box.x + 2, y: box.y + 3, vx: -40, vy: -50, g: 220, age: 0, life: 800 });
    this.parts.push({ sprite: plank, x: box.x + 12, y: box.y + 12, vx: 46, vy: -36, g: 220, age: 0, life: 800 });
    this.burst(this.bank.art('BITS', 'dust'), box.x + 13, box.y + 11, 8, { speed: 40, g: 20, life: 520 });
    this.opening = null;
    this.justOpened = { room: i, until: this.time + 500 };
    await this.wait(520);
    this.busy.delete(i);
    if (res.movedIn) {
      await this.moveIn(res.movedIn, i);
      this.say(SAY.openedFor());
    } else this.say(SAY.openedEmpty());
  }

  /** The stray at the door hops over into room i and curls up. */
  async moveIn(id, i) {
    const box = roomBox(i);
    const from = [Math.round(this.doorX), GEO.ground - 16];
    this.doorId = null; // gone from the door (the rules already say so)
    this.doorHold = false;
    this.sfx.play('follow');
    const p = this.game.person(id);
    const rarity = KIND_BY_ID[p.kind].rarity;
    await this.fly(this.bank.stray(rarity, { face: 'happy' }), from, [box.x + 1, box.y + box.h - 16], 620, { arc: 22 });
    this.late.delete(id);
    this.syncActors(true);
    const a = this.actors.get(id);
    if (a) a.wiggle = 300;
    this.burst(this.bank.art('BITS', 'dust'), box.x + 8, box.y + box.h - 3, 5, { up: true, speed: 24, g: 30, life: 400 });
    this.sfx.play('pop');
    await this.wait(300);
  }

  // ------------------------------------------------------------------ trips

  goPressed() {
    const g = this.game;
    const able = g.eligible();
    if (this.pick) {
      this.pick = false;
      this.say(SAY.nobodyGoes(), { ms: 1200 });
      return;
    }
    if (!able.length) {
      const why = g.noTripWhy();
      if (why.why === 'strays') this.nope(SAY.tooScared());
      else if (why.why === 'hurt') this.nope(SAY.patchFirst());
      else this.nope(SAY.allResting(why.at - g.now()));
      return;
    }
    if (able.length === 1) {
      this.trip(able[0]);
      return;
    }
    this.pick = true;
    this.sfx.play('ask');
    this.line.advice = true;
    this.adviceAt = 0;
  }

  /** One goes out: the walk to the door, the outing, the walk home with whatever they found. */
  async trip(id) {
    const g = this.game;
    const p = g.person(id);
    const i = g.roomOf(id);
    const a = this.actors.get(id);
    const box = roomBox(i);
    this.pick = false;
    this.lock++;
    this.busy.add(i);
    const stageWas = p.stage;
    const res = g.goOut(id);
    if (!res.ok) {
      this.lock--;
      this.busy.delete(i);
      return;
    }
    if (res.follower) this.late.add(res.follower.id);
    this.save();
    a.wish = null;
    a.face = 'happy';
    a.faceUntil = this.time + 600;
    this.hop(a, 60);
    this.sfx.play('go');
    this.say(SAY.goes(p.name), { instant: true, ms: 1500 });
    await this.wait(480);
    this.burst(this.bank.art('BITS', 'dust'), box.x + Math.round(a.x) + 8, box.y + box.h - 3, 4, { up: true, speed: 22, g: 30, life: 380 });
    a.hidden = true;
    await this.wipe(true);
    const outing = new Outing(this, p, res, { hero: stageWas >= HERO, first: res.n === 0 });
    await this.show(outing, true);
    a.hidden = false;
    a.x = 0;
    a.dir = 1;
    await this.wipe(false);
    // Home: the cans go into the counter, the hearts into the bar.
    this.sfx.play('pop');
    this.hop(a, 50);
    a.face = res.hurt ? 'ouch' : 'happy';
    a.faceUntil = this.time + 1200;
    const shown = Math.min(res.cans, 8);
    const jobs = [];
    for (let k = 0; k < shown; k++) {
      const share = Math.floor(res.cans / shown) + (k < res.cans % shown ? 1 : 0);
      jobs.push(
        this.fly(this.bank.art('BITS', 'canTop'), [box.x + 4 + ((k * 3) % 9), box.y + box.h - 12], [2, 1], 420, {
          arc: 12,
          delay: k * 70,
          cans: true,
          then: () => this.gain(share),
        }),
      );
    }
    await Promise.all(jobs);
    this.cansShown = g.s.cans - 0;
    await this.hearts(i, a, res.hearts);
    this.busy.delete(i);
    let text = res.hurt ? SAY.cameBackHurt(p.name, res.cans) : SAY.cameBack(p.name, res.cans);
    if (res.follower) {
      this.sfx.play('follow');
      if (res.follower.room >= 0) {
        // There is a room ready: they walk up to the door, then hop straight in.
        this.doorHold = true;
        this.doorId = res.follower.id;
        this.doorX = -18;
        await this.tween(700, (k) => {
          this.doorX = -18 + 17 * k;
        });
        await this.wait(250);
        await this.moveIn(res.follower.id, res.follower.room);
        text = SAY.followedIn(p.name);
      } else {
        this.late.delete(res.follower.id);
        this.syncActors(false);
        await this.wait(900);
        text = SAY.followedDoor(p.name);
      }
    }
    this.lock--;
    this.say(text, { colour: res.follower ? COL.gold : COL.cream, ms: 4500 });
    if (res.ready) this.sfx.play('ready');
    this.save();
  }

  /** The screen closes like a shutter (true) or opens again (false). */
  async wipe(close) {
    this.sfx.play('wipe');
    await this.tween(240, (k) => {
      this.cover = close ? k : 1 - k;
    });
  }

  /** Put a full-screen scene up and wait until it is done. */
  show(modal, covered = false) {
    return new Promise((res) => {
      this.modal = modal;
      if (covered) this.cover = 0;
      modal.done = (value) => {
        if (this.modal === modal) this.modal = null;
        this.graceUntil = this.time + 260;
        res(value);
      };
      if (modal.start) modal.start();
    });
  }

  openBook() {
    this.sfx.play('page');
    this.show(new BookScreen(this));
  }

  showTitle() {
    return this.show(new TitleScreen(this));
  }

  // ---------------------------------------------------------------- drawing

  draw() {
    const lcd = this.lcd;
    if (this.modal && this.modal.full) {
      this.modal.draw(lcd);
    } else {
      this.drawSky(lcd);
      this.drawYards(lcd);
      this.drawBuilding(lcd);
      this.drawParts(lcd);
      this.drawBar(lcd);
      if (this.modal) this.modal.draw(lcd);
    }
    if (this.cover > 0) this.drawCover(lcd);
  }

  drawCover(lcd) {
    // Blinds: eight bars that close from the top of each.
    const bars = 6;
    const bh = LCD_H / bars;
    for (let b = 0; b < bars; b++) lcd.rect(0, Math.floor(b * bh), LCD_W, Math.ceil(bh * this.cover), COL.ink);
  }

  drawSky(lcd) {
    const hour = new Date(this.game.now()).getHours();
    const sky = skyAt(hour);
    lcd.rect(0, 0, LCD_W, 44, sky.top);
    lcd.rect(0, 44, LCD_W, LCD_H - 44, sky.low);
    for (let x = 0; x < LCD_W; x += 2) lcd.rect(x + (0 % 2), 43, 1, 1, sky.low);
    for (let x = 1; x < LCD_W; x += 2) lcd.rect(x, 44, 1, 1, sky.top);
    if (sky.stars || sky.dusk) {
      const tw = Math.floor(this.time / 600);
      const stars = [[3, 12], [9, 20], [6, 33], [135, 14], [147, 24], [139, 36], [144, 9], [11, 44], [149, 46]];
      stars.forEach(([x, y], k) => {
        if ((tw + k) % 5 !== 0) lcd.rect(x, y, 1, 1, sky.dusk ? '#f9e0b0' : COL.white);
      });
    }
    if (sky.night) lcd.draw(this.bank.art('BITS', 'moon'), 140, 12);
    else if (sky.sun) lcd.draw(this.bank.art('BITS', 'sun'), 141, 12);
    if (sky.clouds) {
      const cx = ((this.time / 900) % (LCD_W + 30)) - 15;
      lcd.draw(this.bank.art('BITS', 'cloud'), Math.round(cx), 26);
    }
    // The street.
    lcd.rect(0, GEO.ground, LCD_W, LCD_H - GEO.ground, '#4c4b68');
    lcd.rect(0, GEO.ground, LCD_W, 1, '#6c6b8a');
    for (const x of [1, 6, 10, 136, 143, 149]) lcd.rect(x, GEO.ground - 1, 2, 1, COL.green);
  }

  drawYards(lcd) {
    const g = this.game;
    // Left: the front door, and whoever waits at it.
    lcd.draw(this.bank.art('DOOR'), 12, GEO.ground - 12);
    if (this.doorId) {
      const p = g.person(this.doorId);
      if (p) {
        const rarity = KIND_BY_ID[p.kind].rarity;
        const shiver = Math.floor(this.time / 110) % 7 === 0 ? 1 : 0;
        const blink = Math.floor(this.time / 150) % 22 === 0;
        const walking = this.doorX < -1;
        const down = walking ? Math.floor(this.time / 130) % 2 === 0 : Math.floor(this.time / 520) % 2 === 0;
        lcd.draw(this.bank.stray(rarity, { face: blink ? 'blink' : 'plain', down }), Math.round(this.doorX) + shiver, GEO.ground - 16);
        if (!walking && !this.lock) {
          const bob = Math.floor(this.time / 420) % 2;
          lcd.draw(this.bank.art('BUBBLE'), 1, GEO.ground - 30 - bob);
          const icon = this.bank.art('ICONS', 'door');
          lcd.draw(icon, 1 + 2, GEO.ground - 30 - bob + 1);
        }
      }
    }
    // Right: the back fence, and the zombies behind it.
    const frame = Math.floor(this.time / 420) % 2;
    for (let k = this.zeds.length - 1; k >= 0; k--) {
      const z = this.zeds[k];
      if (z.fly) {
        const t = z.fly.t / 1000;
        const x = z.fly.x + 46 * t;
        const y = GEO.ground - 16 - 90 * t + 150 * t * t;
        const spin = Math.floor(z.fly.t / 70) % 2 === 0;
        const sp = this.bank.zombie(spin ? 1 : 0, spin);
        lcd.draw(z.fly.t < 90 ? this.bank.white(sp) : sp, Math.round(x), Math.round(y));
      } else {
        const f = (Math.floor((this.time + z.phase) / 420) % 2) ^ (k % 2);
        lcd.draw(this.bank.zombie(f, true), Math.round(z.x), GEO.ground - 16);
      }
    }
    void frame;
    lcd.draw(this.bank.art('FENCE'), GEO.fenceX, GEO.ground - 7);
  }

  drawBuilding(lcd) {
    const s = this.game.s;
    const left = GEO.x0 - 2;
    const right = GEO.x0 + COLS * GEO.cw;
    // The shell of the block.
    lcd.rect(left, GEO.barH, right - left + 2, GEO.ground - GEO.barH, COL.ink);
    for (let i = 0; i < ROOMS; i++) this.drawRoom(lcd, i, s.rooms[i]);
    // Bubbles sit over the walls, so they are drawn after every room.
    for (const a of this.actors.values()) this.drawBubble(lcd, a);
    if (this.pick) this.drawPick(lcd);
  }

  drawRoom(lcd, i, room) {
    const box = roomBox(i);
    const { x, y, w, h } = box;
    if (!room.open) {
      this.drawClosed(lcd, i, box);
      return;
    }
    const a = room.who ? this.actors.get(room.who) : null;
    const p = a ? this.game.s.people[room.who] : null;
    const flash = this.justOpened && this.justOpened.room === i && this.time < this.justOpened.until;
    if (!a) {
      // Open, but nobody home: dim, a bare mattress, the lamp off.
      lcd.rect(x, y, w, h, flash ? COL.white : '#4d4c74');
      lcd.rect(x, y + h - 6, w, 6, flash ? COL.white : '#45446a');
      lcd.draw(this.bank.art('LAMP_OFF'), x + 12, y);
      lcd.draw(this.bank.art('MATTRESS'), x + 1, y + h - 3);
      lcd.rect(x, y + h, w, 2, '#6a5a52');
      return;
    }
    const shown = a.stage >= SOMEBODY;
    const wall = shown ? S.KIND_ART[p.kind].wall : NEUTRAL_WALL;
    lcd.rect(x, y, w, h, flash ? COL.white : wall[0]);
    lcd.rect(x, y + h - 6, w, 6, wall[1]);
    lcd.rect(x, y, w, 1, wall[1]);
    lcd.draw(this.bank.art('LAMP'), x + 12, y);
    lcd.clip(x, y, w, h, () => {
      if (shown) {
        const art = S.KIND_ART[p.kind];
        const item = this.bank.get(`I|${p.kind}`, () => S.paint(art.item));
        lcd.draw(item, x + w - item.w - 1, y + h - item.h - (art.itemWall || 0));
      }
      if (a.stage >= HERO) {
        lcd.draw(this.bank.art('BITS', 'star'), x + 1, y + 2);
        lcd.draw(this.bank.art('RUG'), x + 6, y + h - 2);
      }
      this.drawActor(lcd, a, p, box);
    });
    this.drawHeartBar(lcd, a, box);
    if (this.sel && this.sel.room === i) this.drawCorners(lcd, box, COL.white);
  }

  drawClosed(lcd, i, box) {
    const { x, y, w, h } = box;
    const can = this.game.canOpen(i);
    const near = can.ok || can.why === 'cans';
    lcd.rect(x, y, w, h + 2, near ? '#2c2b47' : '#201f35');
    let ox = 0;
    const asking = this.ask && this.ask.room === i;
    if (asking && this.ask.poor) ox = Math.floor(this.time / 50) % 2 ? 1 : -1;
    const opening = this.opening && this.opening.room === i;
    if (opening) ox = Math.floor(this.time / 40) % 2 ? 1 : -1;
    const boards = this.bank.art('BOARDS');
    lcd.draw(boards, x + ox, y + 2, 1, near ? 1 : 0.55);
    lcd.draw(boards, x - ox, y + 12, 1, near ? 1 : 0.55);
    if (asking) {
      // The price, on a tag.
      const label = `${this.ask.price}¢`;
      const tw = textWidth(label);
      const tx = x + Math.floor((w - tw) / 2);
      const pulse = Math.floor(this.time / 220) % 2;
      lcd.rect(tx - 3, y + 6, tw + 6, 9, COL.ink);
      lcd.rect(tx - 2, y + 7, tw + 4, 7, this.ask.poor ? COL.rose : pulse ? COL.gold : COL.cream);
      lcd.text(label, tx, y + 8, COL.ink);
    } else if (can.ok && (this.game.s.door || this.game.freeRoom() < 0) && Math.floor(this.time / 600) % 2 === 0) {
      // A room that could be opened right now beckons.
      const plus = this.bank.art('BITS', 'plus');
      lcd.rect(x + 11, y + 8, 5, 5, COL.ink);
      lcd.draw(plus, x + 12, y + 9);
    }
  }

  drawActor(lcd, a, p, box) {
    if (a.hidden) return;
    const { x, y, h } = box;
    const rarity = KIND_BY_ID[p.kind].rarity;
    const floor = y + h;
    if (a.stage === BAG) {
      const frame = Math.floor((this.time + a.phase) / 800) % 2;
      const ready = a.wish === 'wake';
      let ox = 0;
      if (a.wiggle > 0) ox = Math.floor(this.time / 45) % 2 ? 1 : -1;
      else if (ready && Math.floor(this.time / 90) % 12 < 4) ox = Math.floor(this.time / 90) % 2 ? 1 : 0;
      lcd.draw(this.bank.bag(rarity, frame), x + 1 + ox, floor - 7);
      if (!ready) this.drawZs(lcd, x + 15, floor - 9, a.phase);
      return;
    }
    lcd.draw(this.bank.art('BED'), x, floor - 5);
    if (a.wish === 'rest' && !this.busy.has(a.room)) {
      // Tucked up: the quilt over everything but the head.
      const breath = Math.floor((this.time + a.phase) / 900) % 2;
      const sp = a.stage === STRAY ? this.bank.stray(rarity, { face: 'blink' }) : this.bank.person(p, { face: 'sleep', hero: false });
      lcd.draw(sp, x - 1, floor - 16 - 2 + breath);
      lcd.draw(this.bank.art('QUILT'), x, floor - 7);
      this.drawZs(lcd, x + 14, floor - 14, a.phase);
      return;
    }
    const asking = ASKS.has(a.wish) && !this.busy.has(a.room);
    const walking = a.step > 0 && a.y === 0;
    const flipped = a.dir < 0;
    let face = a.face;
    if (!face) {
      if (a.wish === 'hurt') face = 'ouch';
      else if (a.wish === 'hungry') face = 'sad';
      else if (a.wish === 'grow') face = 'happy';
      else if (a.blink < 0) face = 'blink';
      else face = 'plain';
    }
    const beat = asking ? 330 : 560;
    const down = a.squash > 0 || (!walking && a.y === 0 && Math.floor((this.time + a.phase) / beat) % 2 === 1);
    let sp;
    if (a.stage === STRAY) {
      const sf = face === 'ouch' || face === 'wow' ? 'plain' : face === 'sleep' ? 'blink' : face;
      sp = this.bank.stray(rarity, { face: sf, down: down || (walking && Math.floor(a.step / 150) % 2 === 1), flip: flipped });
    } else {
      const legs = walking ? (Math.floor(a.step / 150) % 2 ? 'stepB' : 'stepA') : 'stand';
      sp = this.bank.person(p, { face, legs, hero: a.stage >= HERO, down, flip: flipped });
    }
    // A stray that hasn't been fed yet shivers.
    const shiver = a.stage === STRAY && a.wish === 'hungry' && Math.floor(this.time / 100) % 6 === 0 ? 1 : 0;
    const sx = x + Math.round(a.x) + shiver;
    const sy = floor - 16 + Math.round(a.y);
    lcd.draw(a.flash ? this.bank.white(sp) : sp, sx, sy);
    // A full bar glitters.
    if (a.wish === 'grow' && !this.busy.has(a.room) && Math.floor(this.time / 160) % 3 === 0) {
      const k = Math.floor(this.time / 160);
      lcd.draw(this.bank.art('BITS', 'spark'), sx + ((k * 7) % 13), sy + ((k * 5) % 11));
    }
  }

  drawZs(lcd, x, y, phase) {
    const z = this.bank.art('BITS', 'zed');
    for (let k = 0; k < 2; k++) {
      const t = ((this.time + phase) / 1800 + k * 0.5) % 1;
      if (t > 0.85) continue;
      lcd.draw(z, Math.round(x + t * 5 + (k ? 2 : 0)), Math.round(y - t * 9));
    }
  }

  drawBubble(lcd, a) {
    if (a.hidden || this.busy.has(a.room) || !ASKS.has(a.wish) || this.pick) return;
    const box = roomBox(a.room);
    const age = this.time - a.bubT;
    const bob = Math.floor((this.time + a.phase) / 400) % 2;
    const bx = box.x + 15;
    const by = box.y + (age < 90 ? 3 : age < 180 ? -1 : 0) + bob;
    if (age < 90) {
      lcd.draw(this.bank.art('BITS', 'plus'), bx + 4, by + 3);
      return;
    }
    lcd.draw(this.bank.art('BUBBLE'), bx, by);
    let name = ICON_OF[a.wish];
    if (a.wish === 'hungry' && this.game.s.cans < 1) name = 'nocan';
    // "Ready" bubbles blink to be noticed.
    if ((a.wish === 'wake' || a.wish === 'grow') && Math.floor((this.time + a.phase) / 130) % 6 === 5) return;
    const icon = this.bank.art('ICONS', name);
    lcd.draw(icon, bx + Math.floor((11 - icon.w) / 2), by + 1 + Math.floor((8 - icon.h) / 2));
  }

  /** The heart bar: the strip of floor under a room fills up, heart by heart. */
  drawHeartBar(lcd, a, box) {
    const { x, y, w, h } = box;
    const by = y + h;
    if (a.stage === BAG) {
      lcd.rect(x, by, w, 2, '#8a7566');
      return;
    }
    if (a.stage >= HERO) {
      lcd.rect(x, by, w, 2, COL.gold);
      const glint = Math.floor(this.time / 90) % 60;
      if (glint < w) lcd.rect(x + glint, by, 2, 2, COL.white);
      return;
    }
    const need = this.needShown(a);
    const have = Math.min(need, a.hearts);
    lcd.rect(x, by, w, 2, '#6b5a66');
    const full = have >= need;
    const lit = a.barFlash > 0 ? COL.white : full ? (Math.floor(this.time / 200) % 2 ? COL.gold : COL.rose) : COL.rose;
    for (let k = 0; k < need; k++) {
      const x0 = Math.round((k * (w + 1)) / need);
      const x1 = Math.round(((k + 1) * (w + 1)) / need) - (need <= 14 ? 1 : 0);
      if (x1 <= x0) continue;
      lcd.rect(x + x0, by, Math.min(x1, w) - x0, 2, k < have ? lit : '#8f7c88');
    }
  }

  drawCorners(lcd, box, colour) {
    const { x, y, w, h } = box;
    for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w - 1, y, -1, 1], [x, y + h - 1, 1, -1], [x + w - 1, y + h - 1, -1, -1]]) {
      lcd.rect(Math.min(cx, cx + dx * 2), cy, 3, 1, colour);
      lcd.rect(cx, Math.min(cy, cy + dy * 2), 1, 3, colour);
    }
  }

  /** Choosing who goes out: everybody who can't is dimmed, the rest get an arrow. */
  drawPick(lcd) {
    const able = new Set(this.game.eligible());
    for (let i = 0; i < ROOMS; i++) {
      const room = this.game.s.rooms[i];
      const box = roomBox(i);
      if (room.who && able.has(room.who)) {
        const a = this.actors.get(room.who);
        const bob = Math.floor(this.time / 220) % 2;
        if (a) lcd.draw(this.bank.art('BITS', 'arrow'), box.x + Math.round(a.x) + 5, box.y + bob);
        this.drawCorners(lcd, box, Math.floor(this.time / 220) % 2 ? COL.gold : COL.white);
      } else lcd.rect(box.x, box.y, box.w, box.h + 2, COL.ink, 0.6);
    }
  }

  drawParts(lcd) {
    for (const p of this.parts) {
      if (p.age < 0) continue;
      if (p.from) {
        const k = Math.min(1, p.age / p.dur);
        const e = k * k * (3 - 2 * k);
        const x = p.from[0] + (p.to[0] - p.from[0]) * e;
        const y = p.from[1] + (p.to[1] - p.from[1]) * e - Math.sin(Math.PI * k) * p.arc;
        lcd.draw(p.sprite, x, y);
      } else if (p.text) {
        lcd.text(p.text, p.x, p.y, p.colour, { align: 'center', shadow: COL.ink });
      } else {
        lcd.draw(p.sprite, p.x, p.y);
      }
    }
  }

  /** The status line: the cans, then whatever there is to say. */
  drawBar(lcd) {
    lcd.rect(0, 0, LCD_W, GEO.barH, COL.ink);
    const bump = this.time - this.cansBump < 120 ? -1 : 0;
    const count = `¢${Math.max(0, Math.round(this.cansShown))}`;
    lcd.text(count, 2, 1 + bump, bump ? COL.gold : COL.white);
    const l = this.line;
    const x0 = this.lineX();
    const text = l.text.slice(0, Math.floor(l.n));
    lcd.clip(x0, 0, LCD_W - x0 - 1, GEO.barH, () => {
      lcd.text(text, x0 - Math.round(l.scroll), 1, l.colour);
    });
  }
}

export { RARITIES, LCD_H };
