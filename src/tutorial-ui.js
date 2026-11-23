// The card over a finished lesson's end screen: what you just learned (ticked
// off one by one), and where to go next: the next lesson, or after the last
// one a real run. Replay and the main menu are always there too.

import { LESSONS, LESSON_COUNT } from './game/tutorial.js';
import { LEVEL_NAMES } from './settings.js';

export class LessonCard {
  /** actions: { onNext(n), onReplay(), onMenu(), onPlay() } */
  constructor(actions) {
    this.actions = actions;
    this.isOpen = false;
    this.lesson = 0;
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    this.root = el('div', 'report lesson-card hidden');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Lesson complete');
    const card = el('div', 'report-card');
    const head = el('div', 'report-head');
    this.title = el('b', null, 'You learned');
    this.tag = el('span', 'report-tag', '');
    head.append(this.title, this.tag);
    this.list = el('ul', 'lesson-learned');
    this.up = el('div', 'lesson-next', '');
    const acts = el('div', 'report-actions');
    const btn = (label, cls, fn) => {
      const b = el('button', cls, label);
      b.type = 'button';
      b.addEventListener('click', fn);
      acts.append(b);
      return b;
    };
    this.menuBtn = btn('Menu', 'btn', () => this.actions.onMenu());
    this.replayBtn = btn('Replay', 'btn', () => this.actions.onReplay());
    this.nextBtn = btn('Next lesson', 'btn primary', () => this.primary());
    card.append(head, this.list, this.up, acts);
    this.root.append(card);
    for (const ev of ['touchstart', 'mousedown', 'pointerdown']) this.root.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    document.body.append(this.root);
  }

  /** n: the lesson just finished; level: the map a real run would be (settings.level). */
  show(n, level) {
    this.lesson = n;
    const info = LESSONS[n - 1];
    const last = n >= LESSON_COUNT;
    this.tag.textContent = `Lesson ${n} of ${LESSON_COUNT} · ${info.name}`;
    this.list.textContent = '';
    info.learned.forEach((t, i) => {
      const li = document.createElement('li');
      li.textContent = t;
      li.style.animationDelay = `${0.15 + i * 0.12}s`;
      this.list.append(li);
    });
    if (last) {
      this.up.textContent = `That's everything. Next: a real run on the ${LEVEL_NAMES[level] || 'Streets'}. Reach the safe room!`;
      this.nextBtn.textContent = 'Play for real';
    } else {
      const nx = LESSONS[n];
      this.up.textContent = `Up next: Lesson ${n + 1} · ${nx.name} (${nx.blurb.toLowerCase()}).`;
      this.nextBtn.textContent = `Lesson ${n + 1}`;
    }
    this.root.classList.remove('hidden');
    this.isOpen = true;
  }

  hide() {
    this.root.classList.add('hidden');
    this.isOpen = false;
  }

  /** The big button: the next lesson, or after the last one a real run. */
  primary() {
    if (this.lesson >= LESSON_COUNT) this.actions.onPlay();
    else this.actions.onNext(this.lesson + 1);
  }

  /** A tap beside the card: make the big button pulse. */
  nudge() {
    if (!this.isOpen) return;
    this.nextBtn.classList.remove('nudge');
    void this.nextBtn.offsetWidth;
    this.nextBtn.classList.add('nudge');
  }

  /** Where the card sits (CSS px), so the end-screen title can make room for it. */
  rect() {
    const r = this.root.firstChild.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }
}
