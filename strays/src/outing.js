// Strays: one goes out. A few seconds of street: cans to pick up, a zombie in
// the way, and now and then a hooded stray who decides to follow. What
// happens was already settled by the rules (Game.goOut); this only shows it.
// In the real game this is where a round of the action game would be.

import * as S from './sprites.js';
import { COL, RARITY_COL } from './sprites.js';
import { LCD_W, LCD_H } from './lcd.js';
import { KIND_BY_ID } from './config.js';
import { skyAt } from './block.js';
import { buzz } from './audio.js';
import { SAY } from './words.js';

const GROUND = 66;
const RUNNER_X = 34;
const SPEED = 62; // street pixels per second
const MEET = 2600; // when the zombie reaches the runner
const FOLLOW = MEET + 450; // when a stray comes running up from behind
const END = 3900; // when the result comes up


export class Outing {
  constructor(block, p, res, o = {}) {
    this.full = true;
    this.block = block;
    this.p = p;
    this.res = res;
    this.hero = !!o.hero;
    this.first = !!o.first;
    this.t = 0;
    this.found = 0;
    this.floats = [];
    this.result = 0; // ms since the result came up (0: not yet)
    this.hit = 0;
    this.hop = 0;
    this.zState = 'coming';
    this.zFly = 0;
    this.followed = false;
    // The cans lie along the street; each pickup is worth a share of the haul.
    const n = Math.min(res.cans, 5);
    this.pick = [];
    for (let k = 0; k < n; k++) {
      const share = Math.floor(res.cans / n) + (k < res.cans % n ? 1 : 0);
      const at = 450 + (k * (END - 1100)) / Math.max(1, n - 1 || 1);
      this.pick.push({ at: n === 1 ? 1200 : at, share, got: false });
    }
    // A skyline, the same for the same person and trip.
    let seed = (res.n + 1) * 7919;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    this.towers = [];
    for (let x = 0; x < 420; ) {
      const w = 10 + Math.floor(rnd() * 14);
      this.towers.push({ x, w, h: 12 + Math.floor(rnd() * 26), lit: Math.floor(rnd() * 5) });
      x += w + 1 + Math.floor(rnd() * 5);
    }
    this.props = [];
    for (let x = 90; x < 520; x += 46 + Math.floor(rnd() * 40)) this.props.push({ x, kind: Math.floor(rnd() * 3) });
  }

  start() {
    this.block.cover = 1;
    this.block.tween(240, (k) => {
      this.block.cover = 1 - k;
    });
  }

  float(text, x, y, colour) {
    this.floats.push({ text, x, y, age: 0, colour });
  }

  update(dt) {
    const b = this.block;
    const step = dt * b.rate;
    const before = this.t;
    if (!this.result) this.t += step;
    for (const f of this.floats) f.age += step;
    this.floats = this.floats.filter((f) => f.age < 800);
    if (this.hit > 0) this.hit -= step;
    if (this.hop > 0) this.hop -= step;
    if (this.zFly) this.zFly += step;

    if (this.result) {
      this.result += step;
      if (this.result > 2600 && !this.closing) this.finish();
      return;
    }
    // Footsteps.
    if (Math.floor(this.t / 220) !== Math.floor(before / 220)) b.sfx.play('step');
    // Cans.
    for (const c of this.pick) {
      if (!c.got && this.t >= c.at) {
        c.got = true;
        this.found += c.share;
        b.sfx.play('can');
        this.float(`+${c.share}`, RUNNER_X + 8, GROUND - 22, COL.gold);
      }
    }
    // The zombie.
    if (this.zState === 'coming' && this.t >= MEET) {
      const out = this.res.outcome;
      if (out === 'great') {
        this.zState = 'bonked';
        this.zFly = 1;
        this.hop = 260;
        b.sfx.play('bonk');
        buzz(18, b.tuning.haptics);
        b.shake = 90;
        this.float('BONK!', RUNNER_X + 22, GROUND - 24, COL.white);
      } else if (out === 'good') {
        this.zState = 'passed';
        this.hop = 420;
        b.sfx.play('hop');
      } else {
        this.zState = 'passed';
        this.hit = 700;
        b.sfx.play('ouch');
        buzz([30, 40, 30], b.tuning.haptics);
        b.shake = 220;
        this.float('OUCH!', RUNNER_X + 8, GROUND - 24, COL.rose);
      }
    }
    // The stray.
    if (this.res.follower && !this.followed && this.t >= FOLLOW) {
      this.followed = true;
      this.followT = this.t;
      b.sfx.play('follow');
      this.float('!', 14, GROUND - 22, COL.gold);
    }
    if (this.t >= END) this.showResult();
  }

  showResult() {
    if (this.result) return;
    for (const c of this.pick) if (!c.got) c.got = true;
    this.found = this.res.cans;
    this.zState = this.zState === 'coming' ? 'gone' : this.zState;
    this.followed = !!this.res.follower;
    if (this.followed && this.followT == null) this.followT = -9999;
    this.result = 1;
    this.block.sfx.play(this.res.outcome);
  }

  finish() {
    if (this.closing) return;
    this.closing = true;
    this.block.cover = 0;
    this.block
      .tween(220, (k) => {
        this.block.cover = k;
      })
      .then(() => this.done(this.res));
  }

  tap() {
    if (this.result) {
      if (this.result > 350) this.finish();
    } else if (!this.first && this.t > 300) this.showResult(); // the first trip is watched; later ones can be hurried
  }

  press() {
    this.tap();
  }

  draw(lcd) {
    const b = this.block;
    const bank = b.bank;
    const t = this.t;
    const scroll = (t / 1000) * SPEED;
    const hour = new Date(b.game.now()).getHours();
    const sky = skyAt(hour);
    lcd.rect(0, 0, LCD_W, GROUND, sky.top);
    lcd.rect(0, 36, LCD_W, GROUND - 36, sky.low);
    if (sky.night) lcd.draw(bank.art('BITS', 'moon'), 120, 12);
    else if (sky.sun) lcd.draw(bank.art('BITS', 'sun'), 121, 12);
    // The far town, slow.
    const far = sky.night ? '#23224a' : sky.dusk ? '#4a3d78' : '#8fb9d8';
    const farLit = sky.night || sky.dusk ? '#f8d04c' : '#b9d9ee';
    for (const tw of this.towers) {
      const x = Math.round(((tw.x - scroll * 0.3) % 420 + 420) % 420) - 30;
      if (x > LCD_W || x + tw.w < 0) continue;
      lcd.rect(x, GROUND - tw.h, tw.w, tw.h, far);
      for (let k = 0; k < tw.lit; k++) lcd.rect(x + 2 + ((k * 5) % Math.max(1, tw.w - 4)), GROUND - tw.h + 3 + ((k * 7) % Math.max(1, tw.h - 6)), 2, 2, farLit);
    }
    // The street.
    lcd.rect(0, GROUND, LCD_W, LCD_H - GROUND, '#4c4b68');
    lcd.rect(0, GROUND, LCD_W, 1, '#6c6b8a');
    for (let x = -((Math.round(scroll)) % 16); x < LCD_W; x += 16) lcd.rect(x, GROUND + 8, 8, 1, '#7c7b9a');
    // Things by the road.
    for (const pr of this.props) {
      const x = Math.round(pr.x - scroll);
      if (x > LCD_W || x < -16) continue;
      if (pr.kind === 0) lcd.draw(bank.art('STREET_LAMP'), x, GROUND - 15);
      else if (pr.kind === 1) {
        lcd.rect(x, GROUND - 8, 7, 8, COL.ink);
        lcd.rect(x + 1, GROUND - 7, 5, 6, '#5a7a66');
        lcd.rect(x, GROUND - 9, 7, 1, COL.ink);
      } else {
        lcd.rect(x, GROUND - 4, 9, 4, '#3f8a54');
        lcd.rect(x + 2, GROUND - 6, 5, 2, '#3f8a54');
        lcd.rect(x + 3, GROUND - 5, 1, 1, COL.red);
      }
    }
    // Cans waiting to be found.
    const can = bank.art('BITS', 'canTop');
    for (const c of this.pick) {
      if (c.got) continue;
      const x = Math.round(RUNNER_X + 10 + ((c.at - t) / 1000) * SPEED);
      if (x < LCD_W) lcd.draw(can, x, GROUND - 6);
    }
    // The stray who follows: waiting by the road, then running behind.
    if (this.res.follower) {
      const rarity = KIND_BY_ID[b.game.person(this.res.follower.id).kind].rarity;
      const down = Math.floor(t / 130) % 2 === 0;
      if (this.followed) {
        // Running to catch up, then keeping a few steps behind.
        const k = this.result ? 1 : Math.min(1, (t - (this.followT ?? t)) / 500);
        lcd.draw(bank.stray(rarity, { down: this.result ? false : down, face: 'happy' }), Math.round(-16 + 26 * k), GROUND - 16);
      }
    }
    // The zombie.
    if (this.zState === 'coming' || this.zState === 'passed') {
      const x = Math.round(RUNNER_X + 12 + ((MEET - t) / 1000) * (SPEED + 14));
      if (x < LCD_W && x > -18) lcd.draw(bank.zombie(Math.floor(t / 260) % 2, true), x, GROUND - 16);
    } else if (this.zState === 'bonked') {
      const k = this.zFly / 1000;
      const sp = bank.zombie(Math.floor(this.zFly / 70) % 2, Math.floor(this.zFly / 70) % 2 === 0);
      lcd.draw(this.zFly < 90 ? bank.white(sp) : sp, Math.round(RUNNER_X + 12 + 70 * k), Math.round(GROUND - 16 - 100 * k + 170 * k * k));
    }
    // The runner.
    const legs = this.result ? 'stand' : Math.floor(t / 110) % 2 ? 'stepB' : 'stepA';
    const face = this.res.outcome === 'rough' && (this.hit > 0 || this.zState === 'passed') ? 'ouch' : this.result ? 'happy' : 'plain';
    let y = GROUND - 16;
    if (this.hop > 0) {
      const dur = this.res.outcome === 'good' ? 420 : 260;
      y -= Math.round(Math.sin((Math.PI * (dur - this.hop)) / dur) * (this.res.outcome === 'good' ? 13 : 6));
    } else if (!this.result && Math.floor(t / 110) % 2) y -= 1;
    const sp = bank.person(this.p, { legs, face, hero: this.hero });
    if (!(this.hit > 0 && Math.floor(this.hit / 70) % 2)) lcd.draw(sp, RUNNER_X, y);
    // Numbers that float up.
    for (const f of this.floats) lcd.text(f.text, f.x, f.y - Math.round(f.age / 60), f.colour, { align: 'center', shadow: COL.ink });
    // The line across the top.
    lcd.rect(0, 0, LCD_W, 7, COL.ink);
    lcd.text(SAY.out(this.p.name), 2, 1, COL.cream);
    lcd.text(`¢${this.found}`, LCD_W - 2, 1, COL.gold, { align: 'right' });
    if (!this.result && !this.first && Math.floor(t / 400) % 2) lcd.text(SAY.skip(), LCD_W / 2, 1, COL.slate, { align: 'center' });
    if (this.result) this.drawResult(lcd);
  }

  drawResult(lcd) {
    const res = this.res;
    const k = Math.min(1, this.result / 220);
    const h = 44;
    const y = Math.round(LCD_H - (h + 12) * k);
    const colour = res.outcome === 'great' ? COL.gold : res.outcome === 'rough' ? COL.rose : COL.cream;
    lcd.rect(18, y, LCD_W - 36, h, COL.ink);
    lcd.rect(19, y + 1, LCD_W - 38, h - 2, '#2f2e4d');
    lcd.rect(19, y + 1, LCD_W - 38, 13, colour);
    lcd.text(SAY.tripTitle(res.outcome), LCD_W / 2, y + 3, COL.ink, { align: 'center', scale: 2 });
    const line1 = SAY.tripHaul(res.cans, res.hearts);
    lcd.text(line1, LCD_W / 2, y + 18, COL.white, { align: 'center' });
    let line2 = res.hurt ? SAY.tripHurt(this.p.name) : res.bonus ? SAY.tripBonus(res.bonus, RARITY_NAME[KIND_BY_ID[this.p.kind].rarity]) : SAY.tripRest(this.p.name);
    let c2 = res.hurt ? COL.rose : COL.fog;
    if (res.follower) {
      line2 = SAY.tripFollow();
      c2 = RARITY_COL.common;
      if (Math.floor(this.result / 200) % 2) c2 = COL.gold;
    }
    lcd.text(line2, LCD_W / 2, y + 27, c2, { align: 'center' });
    if (this.result > 500 && Math.floor(this.result / 350) % 2 === 0) lcd.text(SAY.tap(), LCD_W / 2, y + 36, COL.fog, { align: 'center' });
  }
}

const RARITY_NAME = { common: 'COMMON', rare: 'RARE', epic: 'EPIC', secret: 'SECRET' };
void S;
