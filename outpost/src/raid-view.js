// The simulated raid (about 5 s; tap for ×3, or Skip) and its results. A raid
// is three waves and each wave cleared lights a crown. The outcome is rolled
// first (meta.raid) and the playback matches it: the squad clears waves until
// the first one it can't, where the zombies bonk it. Counter hits flash ×1.5
// and zombies poof. A golden zombie may join wave 2. A clutch save on the big
// one plays in slow motion with a banner made from the survivor's name and
// prop. Results: crowns slam in, coins and Skulls fly to the HUD, milestones
// pop, a bad raid names one fix, and PLAY AGAIN is one tap away.

import { zoneBackdropSvg, zombieSvg, threatIconSvg } from './thrill-art.js';
import { figureSvg } from './portrait.js';
import { CLASSES, THREATS, ZONES, WAVES, GOLDEN_ZOMBIE, DECOR } from './config.js';
import { townIcon } from './art.js';
import { displayName } from './people.js';
import { name, coins as coinAmt, gems as gemAmt, threatChip } from './kit.js';
import { coinSvg } from './chest-art.js';
import { icon } from './icons.js';
import { crownPips } from './kit.js';
import { driver } from './opening.js';
import { ZBOX } from './thrill-art.js';
import { esc, wait } from './ui.js';

const VERB = { bat: 'BONKS', pan: 'PANS', foamhand: 'HIGH-FIVES', rifle: 'SNIPES', slingshot: 'SLINGS', blaster: 'SOAKS', medkit: 'OUT-HEALS', spray: 'SPRAYS', defib: 'ZAPS', bomb: 'BLOWS UP', wrench: 'WRENCHES', trap: 'TRAPS' };
const PLACE = ['INTO THE DUCK POND', 'OVER THE PICKET FENCE', 'INTO THE FOUNTAIN', 'INTO THE SEA', 'OUT OF THE STADIUM', 'ONTO THE LUGGAGE BELT'];
const TITLES = ['OUCH!', 'ONE CROWN', 'TWO CROWNS', 'THREE CROWNS!'];

export function clutchLine(p, threat, zone) {
  const prop = CLASSES[p.cls].props[p.look.prop];
  return `${displayName(p).toUpperCase()} ${VERB[prop] || 'BONKS'} THE ${THREATS[threat].one.toUpperCase()} ${PLACE[zone - 1] || PLACE[0]}!`;
}

export class RaidView {
  constructor(root, { meta, hud, fx, sound, haptic }) {
    Object.assign(this, { root, meta, hud, fx, sound, haptic });
  }

  /**
   * Play a raid result. hooks: { after: async () => void } runs once the rewards
   * landed (strays, zone splashes). Resolves with 'again' | 'park' | { fix }.
   */
  async play(r, hooks = {}) {
    const { meta, fx, sound } = this;
    const squad = r.squad.map((id) => meta.person(id)).filter(Boolean);
    const el = document.createElement('div');
    el.className = `raid z-${r.zone}`;
    const mem = new Map(r.members.map((m) => [m.id, m]));
    el.innerHTML =
      `<div class="rd-back">${zoneBackdropSvg(r.zone)}</div>` +
      `<div class="rd-top"><div class="rd-zone">${icon('zone')}<b>${esc(ZONES[r.zone - 1].name)}</b>${r.rally ? '<span class="rally">RALLY!</span>' : ''}</div><div class="rd-threats">${r.threats.map(threatChip).join('')}</div>` +
      `<div class="rd-crowns">${WAVES.map(() => `<i>${icon('crown')}</i>`).join('')}</div></div>` +
      `<div class="rd-field"><div class="rd-squad">${squad.map((p, i) => `<div class="rs" data-id="${p.id}" style="--i:${i}"><div class="rfig">${figureSvg(p, { pose: 'idle' })}</div>${mem.get(p.id) && mem.get(p.id).counter ? '<i class="rctr">×1.5</i>' : ''}</div>`).join('')}</div><div class="rd-zeds"></div></div>` +
      `<div class="rd-banner"></div><div class="rd-hint">Tap to speed up</div>` +
      (meta.s.stats.raids >= 3 ? `<button class="rd-skip" type="button" data-skip>Skip ${icon('skip')}</button>` : '');
    this.root.appendChild(el);
    this.root.classList.add('on');
    this.hud.freeze(['coins', 'gems', 'skulls']);
    this.hud.shown.coins = meta.s.coins - r.coins - this._milestoneCoins(r);
    this.hud.shown.gems = meta.s.gems - r.gems - this._milestoneGems(r) - r.zones.reduce((a, z) => a + z.gems, 0);
    this.hud.shown.skulls = r.skullsBefore;
    const drv = driver(el);
    let speed = 1;
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-act]') || e.target.closest('[data-skip]')) return;
      speed = 3;
      el.classList.add('fast');
    });
    const T = (ms) => (drv.fast ? Math.min(ms, 30) : ms / speed);
    const q = (s) => el.querySelector(s);
    const zeds = q('.rd-zeds');
    const crownEls = el.querySelectorAll('.rd-crowns i');
    const banner = (html, cls = '') => {
      const b = q('.rd-banner');
      b.className = `rd-banner show ${cls}`;
      b.innerHTML = html;
    };
    const unbanner = () => q('.rd-banner').classList.remove('show');
    requestAnimationFrame(() => el.classList.add('in'));
    sound('raidStart');
    banner(`<b>RAID!</b><span>${esc(ZONES[r.zone - 1].name)} · 3 waves</span>`, 'go');
    for (const s of el.querySelectorAll('.rs')) s.classList.add('run');
    await wait(T(700));
    unbanner();

    const threats = r.threats;
    const counterIds = r.members.filter((m) => m.counter).map((m) => m.id);
    const figs = () => [...el.querySelectorAll('.rs')];
    const spawn = (kind, i, n, big = false, golden = false) => {
      const z = document.createElement('div');
      z.className = `rz${big ? ' big' : ''}${golden ? ' golden' : ''}`;
      z.style.setProperty('--x', big ? '66%' : `${56 + (i / Math.max(1, n - 1)) * 32}%`);
      z.style.setProperty('--d', `${i * 90}ms`);
      const k = golden ? 'golden' : kind;
      const [bw, bh] = ZBOX[k] || ZBOX.walker;
      const scale = (big ? 2.1 : 1.25) * (window.innerHeight / 390);
      z.style.width = `${bw * scale}px`;
      z.style.height = `${bh * scale}px`;
      z.style.marginLeft = `${(-bw * scale) / 2}px`;
      z.innerHTML = zombieSvg(k, { flip: true, variant: i % 4 });
      zeds.appendChild(z);
      requestAnimationFrame(() => z.classList.add('walk'));
      return z;
    };
    const lunge = (id) => {
      const fig = id != null ? el.querySelector(`.rs[data-id="${id}"]`) : figs()[Math.floor(Math.random() * squad.length)];
      if (!fig) return;
      fig.classList.remove('hit');
      void fig.offsetWidth;
      fig.classList.add('hit');
    };
    const attack = async (z, kind) => {
      const ids = squad.map((p) => p.id);
      const ctr = counterIds.length && threats.includes(kind) ? counterIds : ids;
      const who = ctr[Math.floor(Math.random() * ctr.length)];
      lunge(who);
      sound('hit');
      if (counterIds.includes(who) && threats.includes(kind)) fx.float(z, '×1.5', 'ctr');
      z.classList.add('poof');
      fx.burst(z, ['#9fd46a', '#fffaf0', '#ffd36b'], 10, 50);
      sound('poof');
      await wait(T(120));
    };
    const crown = (k) => {
      const c = crownEls[k];
      if (!c) return;
      c.classList.add('on');
      fx.burst(c, ['#ffd34d', '#fff1a8', '#ffffff'], 14, 60);
      sound('ready');
      this.haptic(15);
    };
    const bonked = async (z) => {
      z.classList.add('swing');
      await wait(T(380));
      for (const s of figs()) s.classList.add('ko');
      sound('lose');
      this.haptic(20);
      await wait(T(450));
    };

    let coinPops = 0;
    for (let w = 0; w < WAVES.length; w++) {
      const cleared = r.crowns > w;
      const isBoss = w === WAVES.length - 1;
      const clutchHere = isBoss && r.clutch;
      banner(`<b>${isBoss ? 'THE BIG ONE' : `WAVE ${w + 1}`}</b>`, isBoss ? 'boss' : 'wave');
      if (isBoss) sound('knock', { n: 1 });
      await wait(T(380));
      unbanner();
      if (!isBoss) {
        const n = 3 + w;
        const list = Array.from({ length: n }, (_, i) => threats[i % threats.length]);
        const golden = w === 1 && r.goldenZombie;
        const zs = list.map((k, i) => ({ z: spawn(k, i, n + (golden ? 1 : 0)), k }));
        let gz = null;
        if (golden) {
          gz = spawn('golden', n, n + 1, false, true);
          banner(`${icon('star')}<b>GOLDEN ZOMBIE!</b><span>Clear this wave to bag it</span>`, 'gold');
          sound('golden');
        }
        await wait(T(720));
        if (cleared) {
          for (const { z, k } of zs) {
            await attack(z, k);
            if (coinPops++ % 2 === 0) fx.float(z, `${icon('coin')}`, 'coinpop');
          }
          if (gz) {
            unbanner();
            await attack(gz, 'golden');
            fx.burst(gz, ['#ffd34d', '#fff1a8', '#ffffff'], 26, 120);
            fx.float(gz, `+${GOLDEN_ZOMBIE.gems} ${icon('gem')}`, 'gem');
            sound('gem');
          }
          crown(w);
          await wait(T(260));
          zeds.innerHTML = '';
        } else {
          // Hit a couple, then the rest swarm the squad.
          for (const { z, k } of zs.slice(0, 1)) await attack(z, k);
          if (gz) {
            unbanner();
            gz.classList.add('escape');
          }
          await bonked(zs[zs.length - 1].z);
          break;
        }
      } else {
        const bossKind = threats[0];
        const boss = spawn(bossKind, 1, 3, true);
        banner(`${threatIconSvg(bossKind)}<b>BIG ${esc(THREATS[bossKind].one.toUpperCase())}!</b>`, 'boss');
        await wait(T(800));
        unbanner();
        if (cleared && !clutchHere) {
          for (let i = 0; i < 3; i++) {
            lunge(squad[i % squad.length].id);
            boss.classList.remove('ouch');
            void boss.offsetWidth;
            boss.classList.add('ouch');
            sound('hit');
            await wait(T(200));
          }
          boss.classList.add('poof');
          fx.burst(boss, ['#9fd46a', '#ffd36b', '#ff8ad8', '#62e6ff'], 30, 140);
          sound('poof');
          crown(w);
          await wait(T(250));
        } else if (clutchHere) {
          boss.classList.add('swing');
          el.classList.add('slowmo');
          sound('clutch');
          const hero = meta.person(r.clutchBy) || squad[0];
          await wait(drv.fast ? 30 : 900);
          banner(`<b>CLUTCH!</b><span>${esc(clutchLine(hero, bossKind, r.zone))}</span>`, 'clutch');
          const fig = el.querySelector(`.rs[data-id="${hero.id}"]`);
          if (fig) fig.classList.add('hero');
          await wait(drv.fast ? 30 : 1300);
          boss.classList.add('launch');
          sound('hit');
          fx.burst(boss, ['#ffd36b', '#ffffff', '#ff6b4a'], 30, 160);
          this.haptic(50);
          await wait(drv.fast ? 30 : 600);
          el.classList.remove('slowmo');
          crown(w);
        } else {
          lunge(squad[0].id);
          sound('hit');
          await wait(T(250));
          await bonked(boss);
        }
      }
    }
    if (r.crowns === WAVES.length) {
      banner(`<b>${r.clutch ? 'CLUTCH!' : 'THREE CROWNS!'}</b>`, 'win');
      for (const s of figs()) s.classList.add('cheer');
      sound('win');
      this.haptic(30);
    } else if (r.crowns > 0) {
      banner(`<b>${TITLES[r.crowns]}</b><span>The squad got bonked on wave ${r.crowns + 1}</span>`, 'part');
    } else {
      banner(`<b>OUCH!</b><span>The squad got bonked</span>`, 'loss');
    }
    await wait(drv.fast ? 30 : 850);
    unbanner();
    el.querySelector('.rd-hint') && el.querySelector('.rd-hint').remove();
    el.querySelector('.rd-skip') && el.querySelector('.rd-skip').remove();

    const res = await this._results(el, r, hooks);
    el.classList.remove('in');
    el.classList.add('out');
    await wait(240);
    el.remove();
    if (!this.root.children.length) this.root.classList.remove('on');
    return res;
  }

  _milestoneCoins(r) {
    return r.milestones.reduce((a, m) => a + (m.coins || 0) + (m.stacks ? m.stacks.reduce((b, s) => b + (s.coins || 0), 0) : 0), 0);
  }

  _milestoneGems(r) {
    return r.milestones.reduce((a, m) => a + (m.gems || 0), 0);
  }

  async _results(el, r, hooks) {
    const { meta, fx, sound } = this;
    const panel = document.createElement('div');
    const good = r.crowns >= 2;
    panel.className = `rd-res ${good ? 'won' : 'lost'} c${r.crowns}`;
    const lines = [];
    if (r.rally) lines.push(`<div class="rl">${icon('star')}<b>Rally</b> ×2 coins</div>`);
    if (r.bagged) lines.push(`<div class="rl gold">${icon('star')}<b>Golden zombie bagged!</b> ×2 coins, +${GOLDEN_ZOMBIE.gems} ${icon('gem')}</div>`);
    else if (r.goldenZombie) lines.push(`<div class="rl">${icon('star')}The golden zombie got away</div>`);
    if (r.gemNose) {
      const p = meta.person(r.gemNose);
      lines.push(`<div class="rl">${icon('gemnose')}<b>${p ? name(p) : ''}</b> sniffed out +3 ${icon('gem')}</div>`);
    }
    if (r.skullsAfter === r.floor && r.skulls > -10 && r.skulls <= 0) lines.push(`<div class="rl">${icon('zone')}You never drop below ${esc(ZONES[r.zone - 1].name)}</div>`);
    for (const m of r.milestones) {
      const what = m.kind === 'coins' ? coinAmt(m.coins) : m.kind === 'gems' ? gemAmt(m.gems) : m.kind === 'decor' ? `<span class="amt">${townIcon('set')}<b>${esc(DECOR[m.decor].name)}</b></span> in the box` : `<span class="amt">${icon('badge')}<b>+${m.badges}</b></span> each`;
      lines.push(`<div class="rl ms">${icon('skull')}<b>${m.at} Skulls!</b>${what}</div>`);
    }
    let fixHtml = '';
    if (!good) {
      const f = r.fix;
      let tip = '';
      let btn = '';
      if (f && f.kind === 'best') {
        tip = `Next up: ${THREATS[f.threat].name}. ${CLASSES[f.cls].plural} beat them.`;
        const nowP = Math.round(meta.raidPreview().three * 100);
        const bestP = Math.round(meta.raidPreview(meta.bestSquad().ids).three * 100);
        btn = `<button class="btn blue" type="button" data-act="fix">${icon('best')}Use the BEST squad ${icon('crown')}${nowP}→${bestP}%</button>`;
      } else if (f && f.kind === 'level') {
        const p = meta.person(f.id);
        tip = 'Stronger squads clear more waves.';
        if (p) btn = `<button class="btn green" type="button" data-act="fix">${icon('up')}Level up ${name(p)}</button>`;
      } else if (f && f.kind === 'build') {
        tip = 'A ride makes its whole class stronger.';
        btn = `<button class="btn green" type="button" data-act="fix">${icon('up')}Upgrade the ride</button>`;
      } else if (f && f.kind === 'coins') {
        tip = 'Someone is READY: a few more coins and they level up.';
      } else tip = 'Chests bring Badges for the squad. Level them up.';
      fixHtml = `<div class="fix"><span>${esc(tip)}</span>${btn}</div>`;
    }
    // What the Skulls are building toward.
    const L = meta.ladder();
    const nx = L.next3[0];
    const span = Math.max(1, L.barTo - L.barFrom);
    const prog = nx
      ? `<div class="rr-prog"><span>${icon('skull')}${L.skulls}</span><i><u data-to="${Math.max(0, Math.min(1, (L.skulls - L.barFrom) / span)).toFixed(3)}" style="transform:scaleX(${Math.max(0, Math.min(1, (r.skullsBefore - L.barFrom) / span)).toFixed(3)})"></u></i><span>${nx.at}: ${nx.kind === 'gate' ? `<b>${esc(nx.name)}</b>` : nx.kind === 'coins' ? `${icon('coin')}${nx.coins}` : nx.kind === 'gems' ? `${icon('gem')}${nx.gems}` : nx.kind === 'decor' ? `${townIcon('set')}${esc(DECOR[nx.decor].name)}` : `${icon('badge')}${nx.badges} each`}</span></div>`
      : '';
    const pre = meta.raidPreview();
    panel.innerHTML =
      `<div class="rr-title"><b>${r.clutch ? 'CLUTCH!' : TITLES[r.crowns]}</b></div>` +
      `<div class="rr-crowns">${WAVES.map(() => `<i>${icon('crown')}</i>`).join('')}</div>` +
      `<div class="rr-body"><div class="rr-rew"><div class="rr-coins">${coinAmt(r.coins)}</div><div class="rr-sk">${icon('skull')}<b>${r.skulls >= 0 ? '+' : ''}${r.skulls}</b></div>${r.gems ? `<div class="rr-gems">${gemAmt(r.gems)}</div>` : ''}</div>` +
      `<div class="rr-lines">${fixHtml}${lines.join('')}</div></div>${prog}` +
      `<div class="rr-next"><span class="kicker">Next</span>${r.next.map(threatChip).join('')}${pre.rally ? '<span class="rally">RALLY! easier, ×2 coins</span>' : ''}<span class="odds o-${pre.label.id}">${crownPips(pre.odds)}${pre.label.name}</span></div>` +
      `<div class="btns"><button class="btn" type="button" data-act="park">${icon('people')}PARK</button><button class="btn yellow big" type="button" data-act="again">${icon('play')}PLAY AGAIN</button></div>`;
    el.appendChild(panel);
    el.classList.add('res');
    panel.querySelectorAll('[data-act]').forEach((b) => (b.disabled = true));
    requestAnimationFrame(() => panel.classList.add('in'));
    await wait(320);
    // Crowns slam in, one by one.
    const cs = panel.querySelectorAll('.rr-crowns i');
    for (let k = 0; k < r.crowns; k++) {
      cs[k].classList.add('on');
      fx.burst(cs[k], ['#ffd34d', '#fff1a8', '#ffffff'], 12, 60);
      sound('ready');
      this.haptic(15);
      await wait(260);
    }
    // Coins and Skulls fly home.
    const coinsFrom = panel.querySelector('.rr-coins');
    await new Promise((resolve) => {
      const n = Math.min(10, Math.max(4, Math.round(Math.sqrt(r.coins))));
      let landed = 0;
      let shown = 0;
      fx.fly({
        from: coinsFrom,
        to: this.hud.target('coins'),
        html: coinSvg(),
        count: n,
        onEach: () => {
          landed++;
          const v = landed === n ? r.coins : Math.round((r.coins / n) * landed);
          this.hud.nudge('coins', v - shown);
          shown = v;
          sound('coin', { pitch: landed / n });
          this.hud.bump('coins');
        },
        onDone: resolve,
      });
    });
    this.hud.thaw(['skulls']);
    const bar = panel.querySelector('.rr-prog u');
    if (bar) requestAnimationFrame(() => (bar.style.transform = `scaleX(${bar.dataset.to})`));
    if (r.skulls) {
      fx.fly({ from: panel.querySelector('.rr-sk'), to: this.hud.target('skulls'), html: icon('skull'), count: 4, size: 24 });
      sound(r.skulls > 0 ? 'milestone' : 'farewell');
    }
    for (const node of panel.querySelectorAll('.rl')) {
      node.classList.add('show');
      if (node.classList.contains('ms')) {
        sound('milestone');
        fx.burst(node, ['#ffd36b', '#ffffff', '#62e6ff'], 14, 70);
      }
      await wait(220);
    }
    this.hud.thaw(['coins', 'gems', 'skulls']);
    if (hooks.after) await hooks.after();
    panel.querySelectorAll('[data-act]').forEach((b) => (b.disabled = false));
    return new Promise((resolve) => {
      panel.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b || b.disabled) return;
        if (b.dataset.act === 'fix') resolve({ fix: r.fix });
        else resolve(b.dataset.act);
      });
    });
  }
}
