// Strays: the full-screen moments. Who a stray turned out to be, the Book of
// everybody met so far, the title, and the two endings.
// Each is a little object the block shows until it calls this.done().

import { KINDS, KIND_BY_ID, RARITIES, SOMEBODY, HERO, ROOMS } from './config.js';
import * as S from './sprites.js';
import { COL, RARITY_COL } from './sprites.js';
import { LCD_W, LCD_H } from './lcd.js';
import { textWidth } from './font.js';
import { buzz } from './audio.js';
import { SAY } from './words.js';

/** A soft round glow, drawn in rows. */
function disc(lcd, cx, cy, r, colour, alpha = 1) {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    lcd.rect(cx - half, cy + y, half * 2 + 1, 1, colour, alpha);
  }
}

/** Somebody showed who they are, or grew into a hero. */
export class RevealCard {
  constructor(block, p, res) {
    this.full = true;
    this.block = block;
    this.p = p;
    this.res = res;
    this.kind = KIND_BY_ID[p.kind];
    this.rarity = this.kind.rarity;
    this.hero = res.stage >= HERO;
    this.t = 0;
    this.bits = [];
  }

  start() {
    const b = this.block;
    if (this.hero) b.sfx.play('hero');
    else b.sfx.play('reveal', { rarity: this.rarity });
    if (this.hero || this.rarity === 'epic' || this.rarity === 'secret') {
      b.shake = 260;
      buzz([30, 50, 30, 50, 60], b.tuning.haptics);
    }
    const colours = this.hero ? [COL.gold, COL.white, COL.orange] : [RARITY_COL[this.rarity], COL.white, COL.gold];
    const n = this.hero ? 34 : { common: 14, rare: 24, epic: 36, secret: 44 }[this.rarity];
    for (let k = 0; k < n; k++) {
      this.bits.push({
        x: Math.random() * LCD_W,
        y: -Math.random() * 60,
        v: 14 + Math.random() * 26,
        sway: Math.random() * 6.28,
        colour: colours[k % colours.length],
      });
    }
  }

  update(dt) {
    const step = dt * this.block.rate;
    const before = this.t;
    this.t += step;
    for (const c of this.bits) {
      c.y += (c.v * step) / 1000;
      if (c.y > LCD_H) c.y = -4;
    }
    // The name types itself out, with a tick per letter.
    const title = this.hero ? 'HERO!' : this.kind.name;
    const shown = (t) => Math.max(0, Math.min(title.length, Math.floor((t - 350) / 70)));
    if (shown(this.t) > shown(before)) this.block.sfx.play('type');
    // The stars drop in one by one.
    const stars = RARITIES[this.rarity].stars;
    const star = (t) => Math.max(0, Math.min(stars, Math.floor((t - 350 - title.length * 70 - 150) / 170)));
    if (!this.hero && star(this.t) > star(before)) this.block.sfx.play('heart', { i: star(this.t) + 2 });
  }

  tap() {
    if (this.t > 1100) {
      this.block.sfx.play('tap');
      this.done();
    } else this.t = Math.max(this.t, 1100); // a tap hurries the lettering along
  }

  press() {
    this.tap();
  }

  draw(lcd) {
    const b = this.block;
    const t = this.t;
    const p = this.p;
    const rc = this.hero ? COL.gold : RARITY_COL[this.rarity];
    lcd.clear('#1b1a2b');
    // A glow behind them, breathing.
    const pulse = Math.floor(t / 300) % 2;
    disc(lcd, 38, 46, 30 + pulse, rc, 0.22);
    disc(lcd, 38, 46, 23 + pulse, rc, 0.3);
    disc(lcd, 38, 46, 16, COL.white, 0.25);
    for (const c of this.bits) lcd.rect(c.x + Math.sin(c.sway + t / 300) * 2, c.y, 1, 2, c.colour);
    // Them, three times the size, bouncing.
    const beat = Math.floor(t / 280) % 2;
    const sp = b.bank.person(p, { face: t < 500 ? 'wow' : 'happy', hero: this.hero, down: beat === 1 });
    lcd.draw(sp, 14, 22 - (beat ? 0 : 2), 3);
    // The words.
    const head = this.hero ? SAY.cardHero() : b.game.s.met.length === 1 ? SAY.cardFirst() : SAY.cardNew();
    lcd.text(head, LCD_W / 2, 4, rc, { align: 'center' });
    const x = 72;
    const title = this.hero ? 'HERO!' : this.kind.name;
    lcd.text(this.hero ? SAY.cardNowA(p.name) : SAY.cardIsA(p.name), x, 20, COL.cream);
    const n = Math.max(0, Math.min(title.length, Math.floor((t - 350) / 70)));
    const scale = textWidth(title, 2) <= LCD_W - x - 2 ? 2 : 1;
    lcd.text(title.slice(0, n), x, 29, rc, { scale, shadow: '#000000' });
    const after = 350 + title.length * 70 + 150;
    const y2 = scale === 2 ? 44 : 38;
    if (this.hero) {
      if (t > after) lcd.text(SAY.cardHero1(), x, y2, COL.white);
      if (t > after + 250) lcd.text(SAY.cardHero2(), x, y2 + 8, COL.white);
      if (t > after + 500) lcd.text(SAY.cardHero3(), x, y2 + 16, COL.fog);
    } else {
      const stars = RARITIES[this.rarity].stars;
      const lit = Math.max(0, Math.min(stars, Math.floor((t - after) / 170)));
      let sx = x;
      for (let k = 0; k < stars; k++) {
        if (k < lit) lcd.text('★', sx, y2, COL.gold);
        sx += 6;
      }
      if (lit >= stars) lcd.text(RARITIES[this.rarity].name, sx + 2, y2, rc);
      const bonus = RARITIES[this.rarity].bonus;
      if (t > after + stars * 170 + 100) {
        lcd.text(bonus ? SAY.cardBonus(bonus) : SAY.cardCommon(), x, y2 + 9, COL.white);
      }
      if (t > after + stars * 170 + 300) lcd.text(`'${this.kind.says}'`, x, y2 + 19, COL.fog);
    }
    if (t > 1100 && Math.floor(t / 380) % 2 === 0) lcd.text(SAY.tap(), LCD_W - 3, 77, COL.slate, { align: 'right' });
  }
}

/** The Book: every kind there is, and which of them the block has met. */
export class BookScreen {
  constructor(block) {
    this.full = true;
    this.block = block;
    this.t = 0;
    this.sel = -1;
  }

  update(dt) {
    this.t += dt;
  }

  cell(k) {
    return { x: 1 + (k % 6) * 25, y: 8 + Math.floor(k / 6) * 25, w: 25, h: 25 };
  }

  tap(x, y) {
    const b = this.block;
    if (y < 7) {
      this.close();
      return;
    }
    const c = Math.floor((x - 1) / 25);
    const r = Math.floor((y - 8) / 25);
    const k = r * 6 + c;
    if (c < 0 || c >= 6 || r < 0 || r >= 3 || k >= KINDS.length) return;
    this.sel = k;
    b.sfx.play('tap');
  }

  press(key) {
    if (key === 'book') this.close();
    else if (key === 'go') this.close();
  }

  close() {
    this.block.sfx.play('page');
    this.done();
  }

  /** The resident of a kind, if the block has met one. */
  who(kindId) {
    return Object.values(this.block.game.s.people).find((p) => p.kind === kindId && p.stage >= SOMEBODY) || null;
  }

  draw(lcd) {
    const b = this.block;
    const s = b.game.s;
    lcd.clear('#22213a');
    lcd.rect(0, 0, LCD_W, 7, COL.ink);
    if (this.sel >= 0) {
      const kind = KINDS[this.sel];
      const r = RARITIES[kind.rarity];
      const p = this.who(kind.id);
      const met = s.met.includes(kind.id);
      const text = met ? SAY.bookMet(p ? p.name : '', kind.name, r.stars, s.heroes.includes(kind.id)) : SAY.bookUnmet(r.name, r.stars);
      lcd.text(text, 2, 1, met ? RARITY_COL[kind.rarity] : COL.fog);
    } else {
      lcd.text(SAY.book(s.met.length, KINDS.length), 2, 1, COL.cream);
      lcd.text(SAY.bookHeroes(s.heroes.length), LCD_W - 2, 1, COL.gold, { align: 'right' });
    }
    KINDS.forEach((kind, k) => {
      const { x, y } = this.cell(k);
      const met = s.met.includes(kind.id);
      const rc = RARITY_COL[kind.rarity];
      lcd.rect(x, y, 24, 24, this.sel === k ? COL.white : met ? rc : '#3a3960');
      if (met) {
        const art = S.KIND_ART[kind.id];
        lcd.rect(x + 1, y + 1, 22, 22, art.wall[0]);
        lcd.rect(x + 1, y + 17, 22, 6, art.wall[1]);
        const p = this.who(kind.id) || { kind: kind.id, skin: k % 5, hair: k % 7, style: k % 5 };
        const hero = s.heroes.includes(kind.id);
        const down = Math.floor((this.t + k * 130) / 520) % 2 === 1;
        lcd.draw(b.bank.person(p, { face: this.sel === k ? 'happy' : 'plain', hero, down }), x + 4, y + 6);
        if (hero) lcd.draw(b.bank.art('BITS', 'star'), x + 18, y + 2);
      } else {
        lcd.rect(x + 1, y + 1, 22, 22, '#2b2a47');
        lcd.text('?', x + 9, y + 7, '#4a4972', { scale: 2 });
        // A corner in the rarity's colour: something to look forward to.
        lcd.rect(x + 1, y + 1, 3, 1, rc);
        lcd.rect(x + 1, y + 1, 1, 3, rc);
      }
    });
  }
}

/** The first screen of a new toy. */
export class TitleScreen {
  constructor(block) {
    this.full = true;
    this.block = block;
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
  }

  tap() {
    if (this.t < 300) return;
    this.block.sfx.play('boot');
    this.done();
  }

  press() {
    this.tap();
  }

  draw(lcd) {
    const b = this.block;
    const t = this.t;
    lcd.clear('#1b1a2b');
    // Rooms lighting up behind the name, like windows at night.
    for (let k = 0; k < 24; k++) {
      const x = 4 + (k % 12) * 12;
      const y = 4 + Math.floor(k / 12) * 68;
      const lit = Math.floor(t / 500 + k * 1.7) % 5 === 0;
      lcd.rect(x, y, 8, 8, lit ? '#f8d04c' : '#2b2a47');
    }
    const w = textWidth(SAY.title(), 4);
    lcd.text(SAY.title(), (LCD_W - w) / 2, 17, COL.red, { scale: 4 });
    lcd.text(SAY.title(), (LCD_W - w) / 2, 16, COL.cream, { scale: 4 });
    const kinds = ['common', 'rare', 'epic', 'secret'];
    kinds.forEach((r, k) => {
      const down = Math.floor((t + k * 170) / 420) % 2 === 1;
      const blink = Math.floor((t + k * 900) / 160) % 19 === 0;
      lcd.draw(b.bank.stray(r, { down, face: blink ? 'blink' : 'plain' }), 36 + k * 21, 40);
    });
    lcd.text(SAY.motto(), LCD_W / 2, 60, COL.fog, { align: 'center' });
    if (Math.floor(t / 450) % 2 === 0) lcd.text(SAY.pressAny(), LCD_W / 2, 68, COL.gold, { align: 'center' });
  }
}

/** Twelve somebodies ("full"), and later twelve heroes ("allHeroes"). */
export class Finale {
  constructor(block, which) {
    this.full = true;
    this.block = block;
    this.which = which;
    this.t = 0;
    this.people = block.game.residents().slice(0, ROOMS);
  }

  start() {
    this.block.sfx.play('full');
    buzz([40, 60, 40, 60, 80], this.block.tuning.haptics);
  }

  update(dt) {
    this.t += dt * this.block.rate;
  }

  tap() {
    if (this.t > 1500) this.done();
  }

  press() {
    this.tap();
  }

  draw(lcd) {
    const b = this.block;
    const t = this.t;
    const heroes = this.which === 'allHeroes';
    lcd.clear(heroes ? '#3b2a1f' : '#1f2a4a');
    for (let k = 0; k < 40; k++) {
      const x = (k * 37 + Math.floor(t / 40) * (1 + (k % 3))) % LCD_W;
      const y = (k * 23 + Math.floor(t / 30)) % LCD_H;
      lcd.rect(x, y, 1, 2, [COL.gold, COL.white, COL.rose, COL.sky][k % 4]);
    }
    lcd.text(heroes ? SAY.heroesTitle() : SAY.fullTitle(), LCD_W / 2, 5, COL.gold, { align: 'center', scale: 2, shadow: COL.ink });
    this.people.forEach((p, k) => {
      const x = 12 + (k % 6) * 22;
      const y = 22 + Math.floor(k / 6) * 20;
      const hop = Math.floor((t - k * 90) / 240) % 4 === 0 ? -3 : 0;
      lcd.draw(b.bank.person(p, { face: 'happy', hero: p.stage >= HERO }), x, y + hop);
    });
    lcd.text(heroes ? SAY.heroes1() : SAY.full1(), LCD_W / 2, 64, COL.white, { align: 'center' });
    lcd.text(heroes ? SAY.heroes2() : SAY.full2(), LCD_W / 2, 71, COL.fog, { align: 'center' });
    if (t > 1500 && Math.floor(t / 380) % 2 === 0) lcd.text(SAY.tap(), LCD_W / 2, 78, COL.gold, { align: 'center' });
  }
}
