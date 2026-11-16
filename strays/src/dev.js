// Strays: the testing drawer. Behind the TEST pinhole on the shell (or the
// ` key): jump time, force what happens next, hand out cans, move the sliders.

import { ROOMS, BAG, STRAY, SOMEBODY, HERO, KINDS, DEFAULT_TUNING, TUNING_SLIDERS } from './config.js';
import { neighbours, SEC, MIN, HOUR, DAY } from './rules.js';
import { SAY } from './words.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const JUMPS = [
  ['+1 min', MIN],
  ['+10 min', 10 * MIN],
  ['+1 hour', HOUR],
  ['+3 hours', 3 * HOUR],
  ['+8 hours', 8 * HOUR],
  ['+1 day', DAY],
];

export class Dev {
  /** @param ctx { game, clock, tuning, block, sfx, save, saveTuning, reset, load } */
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
    this.open = false;
    this.note = '';
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-do]');
      if (b) this.act(b.dataset.do, b.dataset.arg);
    });
    root.addEventListener('input', (e) => {
      const el = e.target;
      if (el.dataset && el.dataset.tune) {
        ctx.tuning[el.dataset.tune] = Number(el.value);
        ctx.saveTuning();
        const out = root.querySelector(`output[data-for="${el.dataset.tune}"]`);
        if (out) out.textContent = el.value;
      }
    });
    root.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset && el.dataset.pick === 'kind') {
        if (el.value) ctx.game.s.force.kind = el.value;
        else delete ctx.game.s.force.kind;
        ctx.save();
        this.say(el.value ? `The next stray will be a ${el.value}.` : 'The next stray is up to chance again.');
      }
    });
  }

  toggle() {
    this.open = !this.open;
    this.root.hidden = !this.open;
    if (this.open) this.render();
  }

  say(text) {
    this.note = text;
    this.render();
  }

  /** Is a scene playing? Cheats wait for it, or the screen and the rules would disagree. */
  busy() {
    const b = this.ctx.block;
    return !b.started || b.modal || b.lock || b.busy.size > 0;
  }

  /** After a cheat: make the screen match the rules again. */
  settle() {
    const { block, game, save } = this.ctx;
    game.tick();
    block.late.clear();
    block.syncActors(true);
    block.cansShown = game.s.cans;
    block.line.advice = true;
    block.adviceAt = 0;
    save();
  }

  act(what, arg) {
    const { game, clock, tuning, block, sfx, save } = this.ctx;
    const s = game.s;
    const now = game.now();
    if (what === 'close') return this.toggle();
    if (what === 'copy') {
      const text = JSON.stringify({ ...s, clockOffset: clock.offset });
      const box = this.root.querySelector('textarea');
      box.value = text;
      box.select();
      try {
        navigator.clipboard.writeText(text).then(
          () => this.sayKeep('Copied.'),
          () => this.sayKeep('Select the text and copy it.'),
        );
      } catch {
        this.sayKeep('Select the text and copy it.');
      }
      return undefined;
    }
    if (what === 'load') {
      try {
        this.ctx.load(this.root.querySelector('textarea').value);
      } catch (e) {
        this.say(`That did not load: ${e.message}`);
      }
      return undefined;
    }
    if (what === 'reset') {
      if (arg !== 'sure') {
        this.resetAsk = true;
        return this.say('Start a new block? Everybody here is gone. Press again to do it.');
      }
      return this.ctx.reset();
    }
    if (what === 'defaults') {
      for (const k of Object.keys(DEFAULT_TUNING)) if (typeof DEFAULT_TUNING[k] !== 'object' && k !== 'sound' && k !== 'haptics') tuning[k] = DEFAULT_TUNING[k];
      this.ctx.saveTuning();
      return this.say('Sliders are back to the defaults.');
    }
    if (what === 'toggle') {
      tuning[arg] = !tuning[arg];
      this.ctx.saveTuning();
      if (arg === 'sound') document.getElementById('key-sound').setAttribute('aria-pressed', tuning.sound ? 'true' : 'false');
      return this.say(`${arg === 'sound' ? 'Sound' : 'Buzzing'} is ${tuning[arg] ? 'on' : 'off'}.`);
    }
    if (what === 'rate') {
      block.rate = Number(arg);
      return this.say(block.rate > 1 ? `Scenes play ${block.rate}x faster.` : 'Scenes play at normal speed.');
    }
    if (what === 'outcome') {
      if (s.force.outcome === arg) delete s.force.outcome;
      else s.force.outcome = arg;
      save();
      return this.say(s.force.outcome ? `The next trip will be ${arg}.` : 'The next trip is up to chance again.');
    }
    if (what === 'rarity') {
      if (s.force.rarity === arg) delete s.force.rarity;
      else s.force.rarity = arg;
      save();
      return this.say(s.force.rarity ? `The next stray will be ${arg}.` : 'The next stray is up to chance again.');
    }
    if (what === 'follow') {
      if (s.force.follow === true) delete s.force.follow;
      else s.force.follow = true;
      save();
      return this.say(s.force.follow ? 'Somebody follows the next trip home (if the door is free).' : 'Followers are up to chance again.');
    }

    // Everything below changes the block itself: not in the middle of a scene.
    if (this.busy()) return this.say('Something is playing on the screen. Try again when it is done.');
    switch (what) {
      case 'jump': {
        const ms = Number(arg) || 0;
        const jump = JUMPS.find((j) => j[1] === ms);
        const label = jump ? jump[0].slice(1) : `${Math.round(ms / MIN)} min`;
        clock.warp(ms);
        this.settle();
        block.say(SAY.later(label.toUpperCase()), { ms: 1800 });
        sfx.play('wipe');
        return this.say(`Jumped ${label} ahead.`);
      }
      case 'cans':
        s.cans += Number(arg);
        this.settle();
        return this.say(`+${arg} cans.`);
      case 'zombie':
        if (!s.zombieAt) s.zombieAt = now;
        s.zombies = Math.min(tuning.zombieMax, s.zombies + 1);
        this.settle();
        return this.say('A zombie is at the fence.');
      case 'stray': {
        if (s.door) return this.say('Somebody is already waiting at the door.');
        if (Object.keys(s.people).length >= ROOMS) return this.say('The block is full.');
        const f = game._newcomer(now);
        s.door = f.id;
        const room = game.freeRoom();
        if (room >= 0) game._moveIn(f, room, now);
        this.settle();
        return this.say(room >= 0 ? 'A stray moved into the free room.' : 'A stray is waiting at the door.');
      }
      case 'bars':
        for (const p of game.residents()) if (p.stage === STRAY || p.stage === SOMEBODY) p.hearts = Math.max(p.hearts, game.need(p) - (arg === 'almost' ? 1 : 0));
        this.settle();
        return this.say(arg === 'almost' ? 'Every heart bar is one heart from full.' : 'Every heart bar is full: tap them.');
      case 'hungry':
        for (const p of game.residents()) {
          if (p.stage === STRAY || p.stage === SOMEBODY) {
            p.hungryAt = now;
            p.hugAt = now;
          }
        }
        this.settle();
        return this.say('Everybody is hungry and wants a hug.');
      case 'rested':
        for (const p of game.residents()) {
          p.restUntil = 0;
          p.hurt = false;
          if (p.stage === BAG) p.wakeAt = now;
        }
        this.settle();
        return this.say('Everybody is rested; the bags can be woken.');
      case 'hurt': {
        const p = game.residents().find((q) => q.stage >= SOMEBODY && !q.hurt);
        if (!p) return this.say('Nobody to hurt.');
        p.hurt = true;
        this.settle();
        return this.say(`${p.name} needs patching up.`);
      }
      case 'fill': {
        // Twelve somebodies, the quick way.
        for (let guard = 0; guard < 40 && Object.keys(s.people).length < ROOMS; guard++) {
          if (game.freeRoom() < 0 && !s.door) {
            const i = s.rooms.findIndex((r, k) => !r.open && neighbours(k).some((j) => s.rooms[j].open));
            if (i >= 0) s.rooms[i].open = true;
          }
          if (s.door) {
            const room = game.freeRoom();
            if (room >= 0) game._moveIn(s.people[s.door], room, now);
            else {
              const i = s.rooms.findIndex((r, k) => !r.open && neighbours(k).some((j) => s.rooms[j].open));
              s.rooms[i].open = true;
              game._moveIn(s.people[s.door], i, now);
            }
            continue;
          }
          const f = game._newcomer(now);
          game._moveIn(f, game.freeRoom(), now);
        }
        for (const p of game.residents()) {
          if (p.stage < SOMEBODY) {
            p.stage = SOMEBODY;
            p.hearts = 0;
            p.hungryAt = now + tuning.hungerMin * MIN;
            p.hugAt = now + tuning.hugMin * MIN;
            if (!s.met.includes(p.kind)) s.met.push(p.kind);
          }
          if (arg === 'heroes' && p.stage === SOMEBODY) p.hearts = game.need(p);
        }
        if (!s.zombieAt) s.zombieAt = now + tuning.zombieFirstSec * SEC;
        s.seen.full = arg !== 'heroes' ? true : s.seen.full;
        this.settle();
        return this.say(arg === 'heroes' ? 'Twelve somebodies, every bar full: tap them all for the ending.' : 'The block is full: twelve somebodies.');
      }
      default:
        return undefined;
    }
  }

  /** Change the note without redrawing (so the textarea keeps its selection). */
  sayKeep(text) {
    this.note = text;
    const el = this.root.querySelector('.toy-dev-note');
    if (el) el.textContent = text;
  }

  render() {
    const { game, tuning, block } = this.ctx;
    const s = game.s;
    const tally = game.tally();
    const set = (on) => (on ? ' class="is-set"' : '');
    const btn = (label, what, arg, on) => `<button type="button" data-do="${what}"${arg != null ? ` data-arg="${esc(arg)}"` : ''}${set(on)}>${esc(label)}</button>`;
    const here = new Set(Object.values(s.people).map((p) => p.kind));
    const sliders = TUNING_SLIDERS.map(
      ([key, label, lo, hi, step]) =>
        `<label>${esc(label)} <output data-for="${key}">${tuning[key]}</output><input type="range" data-tune="${key}" min="${lo}" max="${hi}" step="${step}" value="${tuning[key]}"></label>`,
    ).join('');
    this.root.innerHTML =
      `<button type="button" class="toy-dev-close" data-do="close" aria-label="Close">x</button>` +
      `<h2>Testing tools</h2>` +
      `<p>${tally.people} of ${ROOMS} rooms lived in, ${tally.heroes} heroes, ${s.met.length} of ${KINDS.length} kinds met, ${s.trips} trips, ${s.cans} cans.</p>` +
      `<p class="toy-dev-note">${esc(this.note)}</p>` +
      `<h3>Let time pass</h3><div class="toy-dev-row">${JUMPS.map(([label, ms]) => btn(label, 'jump', ms)).join('')}</div>` +
      `<p>Everybody keeps living while the toy is away: bellies rumble, naps end, zombies gather.</p>` +
      `<h3>Scenes</h3><div class="toy-dev-row">${btn('Normal speed', 'rate', 1, block.rate === 1)}${btn('4x faster', 'rate', 4, block.rate === 4)}</div>` +
      `<h3>Hand out</h3><div class="toy-dev-row">` +
      btn('+10 cans', 'cans', 10) +
      btn('+100 cans', 'cans', 100) +
      btn('A stray at the door', 'stray') +
      btn('A zombie', 'zombie') +
      btn('Everybody hungry', 'hungry') +
      btn('Everybody rested', 'rested') +
      btn('Hurt somebody', 'hurt') +
      btn('Fill every heart bar', 'bars') +
      btn('Bars one short', 'bars', 'almost') +
      `</div>` +
      `<h3>The next trip</h3><div class="toy-dev-row">` +
      btn('Great', 'outcome', 'great', s.force.outcome === 'great') +
      btn('Good', 'outcome', 'good', s.force.outcome === 'good') +
      btn('Rough', 'outcome', 'rough', s.force.outcome === 'rough') +
      btn('Somebody follows', 'follow', null, s.force.follow === true) +
      `</div>` +
      `<h3>The next stray</h3><div class="toy-dev-row">` +
      ['common', 'rare', 'epic', 'secret'].map((r) => btn(r[0].toUpperCase() + r.slice(1), 'rarity', r, s.force.rarity === r)).join('') +
      `<select data-pick="kind" aria-label="Which kind"><option value="">Any kind</option>${KINDS.filter((k) => !here.has(k.id))
        .map((k) => `<option value="${k.id}"${s.force.kind === k.id ? ' selected' : ''}>${esc(k.name.toLowerCase())} (${k.rarity})</option>`)
        .join('')}</select>` +
      `</div>` +
      `<h3>Skip ahead</h3><div class="toy-dev-row">${btn('Fill the block', 'fill')}${btn('Fill it, bars full (the ending)', 'fill', 'heroes')}</div>` +
      `<h3>Tuning</h3>${sliders}<div class="toy-dev-row">${btn('Back to defaults', 'defaults')}</div>` +
      `<h3>Sound</h3><div class="toy-dev-row">${btn(tuning.sound ? 'Sound: on' : 'Sound: off', 'toggle', 'sound', tuning.sound)}${btn(tuning.haptics ? 'Buzz: on' : 'Buzz: off', 'toggle', 'haptics', tuning.haptics)}</div>` +
      `<h3>The save</h3><textarea aria-label="Save data" spellcheck="false"></textarea>` +
      `<div class="toy-dev-row">${btn('Copy save', 'copy')}${btn('Load save', 'load')}` +
      `<button type="button" class="toy-dev-danger" data-do="reset" data-arg="${this.resetAsk ? 'sure' : ''}">${this.resetAsk ? 'Yes, start a new block' : 'New block'}</button></div>` +
      `<p>Keys: arrows and Enter tap a room, Space go out, Z bonk, B the Book, M sound, \` this drawer.</p>`;
    this.resetAsk = false;
  }
}

void HERO;
