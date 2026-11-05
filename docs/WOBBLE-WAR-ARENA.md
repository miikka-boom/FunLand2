# Wobble War: Arena — design spec

Wobble War turns from a "place your army, press FIGHT" puzzle game into a
real-time card battler with a fair free-to-play meta game. It is played on a
phone held sideways (landscape) in the browser and installs as a PWA.

The genre (card-deploy tower battles with an arena ladder and card upgrades)
is a well-known one; everything here is our own: the wobbly ragdoll beans, the
cards, the names, the art, the rules' details. Do not use names, art, music,
characters or card names from any existing game. Words to avoid in UI text:
"Elixir", "Princess", "King Tower", "Clash", "Royale", "Crown Chest",
"Trophy Road", "Gems".

## 1. Principles ("the good kind" of free-to-play)

- No real money anywhere in power progression. No premium currency, no energy,
  no ads, no paid timers, no paid loot boxes. The optional Supporter Pack is
  cosmetic only and is not connected to payments (placeholder, as today).
- Two earned currencies:
  - **Gold** (🪙) — card upgrades and shop cards. Earned from matches, chests,
    the Trophy Trail, badges and the daily free gift.
  - **Jellybeans** (the existing bean currency) — cosmetics only (army colours,
    hats). Earned from badges, the Trophy Trail and Big Chests.
- **No chests from matches.** There are exactly two chests, always on the main
  menu: a **Small Chest** that refills every 3 hours and a **Big Chest** that
  refills every 12 hours. Both are ready on the first visit. They never stack,
  never need a slot, and cannot be sped up. Matches pay gold and trophies.
- Opponents are computer players (bots) with names like "Captain Bonk". The UI
  never claims they are real people. Matchmaking is fair: bot card levels follow
  your own deck level (with a gentle floor per arena), bot skill follows trophies.
- Losing is gentle: you never drop out of an arena you reached (trophy floor at
  each arena gate), and losses still pay a little gold.
- Everything is honest and visible: chest contents ranges, upgrade costs, drop
  odds per rarity.

## 2. Names

| Thing | Name |
| --- | --- |
| In-battle resource | **Mana** (💧, purple-blue drops, max 10) |
| Front tower | **Guard Tower** (1 crown) |
| Back tower | **Castle** (all 3 crowns; destroying it wins at once) |
| Ladder points | **Trophies** 🏆 |
| Ladder reward track | **Trophy Trail** |
| Achievements (old "trophies") | **Badges** |
| Player level | **King Level** (raises your towers' level) |
| Chests | **Small Chest**, **Big Chest** |

## 3. The match (sim)

Landscape side view. Blue (you) on the left, red (bot) on the right.

Layout (world px, `config.js` → `WORLD`): field width 1500. Castles at x 100 /
1400, Guard Towers at x 330 / 1170, middle line at x 750. Units are played on
your half (`WORLD.deploy`: blue [40, 720], red [780, 1460]); once the enemy
Guard Tower falls your unit zone reaches to `WORLD.pocket` (blue up to 1050,
red down to 450). Spells can be cast anywhere in [0, 1500].

Rules (`sim/match.js`, numbers tunable):

- Regulation 2:00. If crowns are tied at 0:00, **overtime** up to 1:00: the
  first tower destroyed wins. If overtime ends tied, the side whose weakest
  standing tower has the lower HP fraction loses; exact tie = draw.
- Mana starts at 5, max 10, +1 every 2.8 s; **double mana** (+1 every 1.4 s)
  in the last 60 s of regulation and in overtime.
- Deck of 8 cards; hand of 4; the next card is shown. Playing a card puts it
  at the back of the queue (classic cycle).
- Crowns: Guard Tower = 1. Castle = 3 total and ends the match (its side's
  remaining tower crumbles).
- Castle is **asleep** (doesn't shoot) until its Guard Tower falls or the castle
  itself takes damage.
- Card and tower levels: +10% HP and damage per level (`levelMul`). Tower
  level = the side's King Level.
- Units drop from the sky where you play them (spawn ~300 px up, fall, land
  with a wobble and a dust puff), then do a battle-cry hop and go. They cannot
  act until ~1 s after the card was played.
- Unit AI: target the nearest enemy unit within sight along x (melee ~230 px,
  ranged = preferred range + 60); otherwise march to the next standing enemy
  tower (Guard Tower first) and attack it. The **Brick** targets towers only.
- Dead units fade out after ~4 s and are removed (matches stay light); dropped
  weapons fade too.
- Bots play by the same rules through the same `match.play()` call.

### 3.1 Simulation interfaces (consumed by render and UI)

`Battle` (sim/battle.js) gains an arena mode; old sandbox behaviour stays.

```
battle.mode            'sandbox' | 'arena'
battle.towers          Tower[]  (empty in sandbox)
battle.spells          Spell[]  (active spell entities, for drawing)
battle.shots           Shot[]   (castle cannonballs in flight)
battle.addUnit(typeId, team, x, lane?, seed?, opts?)   opts: { level, drop }
unit.level, unit.dmgMul         stat scaling
unit.fade              1 → 0 while a corpse fades out (draw alpha); removed at 0
unit.deployT           > 0 while a freshly dropped unit is not yet active
```

Tower (sim/towers.js), plain fields the renderer reads:

```
{ id, team, kind: 'guard' | 'castle', x, w, h,   // centre x, hitbox width/height; base on the ground (y = 0)
  hp, maxHp, alive, active, level,
  aim,        // radians: where the crossbow / cannon points (for drawing)
  shotT,      // seconds since the last shot (recoil)
  hitT,       // seconds since last damaged (flash / shake)
  downT }     // seconds since destroyed (collapse animation), -1 while standing
```

Spell entities (sim/spells.js) — each has `{ kind, team, x, y, t, ... }`:

- `boulder`: `{ r, rot, vx, vy, state: 'fall' | 'rest', tx }` falls on an arc to `tx`,
  impact = big launch + damage in `radius`, reduced damage to towers.
- `arrowRain`: `{ radius, volley }` three volleys; real arrows fall from the sky
  and stick; every enemy in the circle takes the volley damage.
- `wheel` (Cheese Wheel): `{ r, rot, vx, dist, hit }` rolls toward the enemy
  ~520 px bowling beans over (each hit once), dents towers it passes.

Shots: `{ kind: 'cannon', team, x, y, vx, vy, r }`.

Events (all through `battle.emit`, one stream; existing events unchanged):
`cardPlayed {team, card, x}`, `drop {unit}` (on landing use existing `land`),
`towerShot {tower}`, `cannonFire {tower}`, `cannonHit {x, y, power}`,
`towerHit {tower, damage, x, y}`, `towerDown {tower, team, crowns}`,
`castleAwake {tower}`, `spellCast {team, spell, x}`, `boulderImpact {x, y, power}`,
`rainVolley {x, radius}`, `wheelHit {x, y, unit}`, `wheelEnd {x, y}`,
`doubleMana {}`, `overtime {}`, `matchEnd {winner, crowns}`.

`Match` (sim/match.js):

```
const m = new Match({ seed, blue: Side, red: Side })
Side = { name, deck: [8 card ids], levels: { cardId: level }, kingLevel, hats?: { unitTypeId: hatId } }
m.battle                    the Battle (arena mode, 4 towers)
m.step(dt = DT)             one fixed step (mana, units, spells, end checks)
m.sides.blue / .red         { name, mana, hand: [4 ids], next, crowns, kingLevel, levels, deck, played }
m.time, m.timeLeft          seconds; timeLeft counts the overtime clock during overtime
m.phase                     'fight' | 'overtime' | 'over'
m.doubleMana                bool
m.zone(team)                [x0, x1] where units may be played right now
m.canPlay(team, i, x)       '' if ok, else 'mana' | 'zone' | 'over' | 'card'
m.play(team, i, x)          true if played
m.surrender(team)
m.winner                    'blue' | 'red' | 'draw' | null
m.crowns                    { blue, red }
m.result(team)              { outcome: 'win'|'loss'|'draw', crowns, enemyCrowns, threeCrown, duration }
```

`Bot` (sim/bot.js): `new Bot(match, team, { skill: 0..1, seed })`,
`bot.update(dt)` every step. Deterministic, no cheating, plays only through
`match.play()`. Skill changes reaction time, placement accuracy, mana
discipline and counter choice.

### 3.2 Cards

Defined in `battle/src/sim/cards.js` (the shared contract): 14 cards, rarity,
mana, unit/spell, unlock arena. New unit types for it: **Bruiser** (an
extra-large club bean) and **Mega Bomb** (an extra-large bomb).

## 4. Meta game (pure modules, all take the profile `p` and, where time matters, `now` ms)

Profile v2 (same localStorage key `wobblewar.profile.v1`, field `v: 2`):

```
{ v: 2, name: 'You',
  gold, goldEarned, beans, earned,             // beans/earned = Jellybeans (kept from v1)
  cards: { cardId: { level, count } },          // owned cards only
  deck: [8 card ids],
  king: { level, xp },
  trophies, best,                               // best = highest trophies ever
  road: { claimed: { milestoneAt: true } },
  chests: { small: { readyAt }, big: { readyAt }, opened: { small, big } },
  shop: { day, bought: [offer indices], free: bool },
  badges: { id: { claimed: true } },
  stats: { ...v1 stats, matches, losses, draws, threeCrowns, towers, cardsPlayed, spells, chests, upgrades },
  owned, equipped,                              // cosmetics, as v1 (+ hats for new unit types)
  tutorial, settings, supporter,
  notices: [ { kind, ... } ] }                  // one-off messages for the UI (e.g. veteran gift)
```

Migration v1 → v2 keeps Jellybeans, cosmetics, settings, supporter, stats and
claimed achievements that still exist as badges; it gives a **veteran gift** of
gold for campaign stars (20 per star, max 2000) as a notice. Campaign data
(levels, stars, daily) is dropped. Tutorial restarts.

Modules:

- `meta/collection.js` — owned cards, levels, copies, upgrades (gold + copies),
  King Level XP, deck editing, unlocked cards by arena.
  - Copies to go from level L to L+1 (index L-1) — common `[2,4,10,20,50,100,200,400]`,
    rare `[1,2,4,10,20,50,100,200]`, epic `[1,1,2,4,10,20,40,80]`.
  - Gold — common `[5,20,50,150,400,1000,2000,4000]`, rare `[20,50,150,400,1000,2000,4000,8000]`,
    epic `[50,150,400,1000,2000,4000,8000,15000]`. Max level 9.
  - King XP per upgrade (to new level 2..9): `[4,5,6,10,25,50,100,200]`; King Level
    thresholds (cumulative XP to reach level 2..9): `[20,60,140,300,600,1200,2400,4800]`.
- `meta/ladder.js` — arenas, trophies, Trophy Trail, match rewards.
  - Arenas: Green Hills 0, Pointy Pass 300, Boom Ridge 650, Brick Fortress 1000,
    Wobble Summit 1500. Card unlocks follow `card.arena` vs the best arena reached.
  - Win +30 trophies (±3 from crowns), loss −18 (never below the floor of the
    arena you are in), draw 0. Gold: win 12 + 4/crown + 4/arena; loss 3; draw 6.
  - Trophy Trail: ~30 milestones up to 1600 with gold, Jellybeans, cards,
    hats; claimable once reached (by best trophies), forever.
- `meta/chests.js` — the two menu chests.
  - Small: every 3 h; ~25–45 gold, ~8 cards in 2 stacks; 15% chance a stack is rare.
  - Big: every 12 h; ~120–200 gold, ~30 cards in 4 stacks with ≥1 rare stack,
    35% chance of an epic stack, +10 Jellybeans.
  - Both scale up with arena (+25% gold, +20% cards per arena). Only cards
    unlocked for you drop. Contents are deterministic from the profile's
    chest counter (testable). Clock moved back → timers clamp, never grow.
- `meta/shop.js` — daily shop (local date): a free gift once a day and 3 card
  offers for gold (one buy each per day). Cosmetics stay in `meta/cosmetics.js`.
- `meta/badges.js` — achievements (replaces trophies.js): stat goals paying
  Jellybeans (and some gold).
- `meta/opponents.js` — `makeOpponent(p, seed)` → `{ name, deck, levels, kingLevel, skill, hats }`.
  Tutorial (first match): an easy "Training Dummy".

## 5. Rendering

- `render/towers.js` — Guard Towers (stone tower with a crossbow on top, team
  banner) and Castles (reuse the existing castle art), damage states (cracks,
  smoke), hit flash, collapse into rubble with dust; HP bars with level badge
  above each tower; sleeping castle shows "z z".
- `render/spells.js` — boulder (shadow growing where it will land), cheese wheel,
  arrow-rain aiming, cannonballs; deploy ghosts and aiming circles helpers.
- `render/cards.js` — card art on a canvas: rarity frame, unit illustration
  (a real settled ragdoll, like the old unit icons) or spell art, mana drop.
- `render/chests.js` — Small and Big Chest art (canvas), with shake, lid open
  and glow for the opening animation.
- `render/units.js` — corpse fade alpha, small HP bars over hurt units.
- `render/background.js` — option to leave out the castles (towers.js draws
  them), a middle-line marker, arena themes (tints per arena).

## 6. UI (landscape phone first: 844×390 and 667×375 are the key sizes)

- **Hub** (main menu): top bar — King Level badge + XP, name, gold, Jellybeans,
  settings. Centre — arena banner (name, trophies, progress to next arena),
  big **BATTLE** button, the **Small Chest** on its left and the **Big Chest**
  on its right (countdown or "OPEN!"). Bottom tabs: Shop · Cards · Battle ·
  Trail · More. A bot-vs-bot match plays live behind the hub.
- **Cards**: the deck (8) and the collection; card details with stats,
  upgrade (gold + copies), swap into deck. Locked cards show their arena.
- **Chest opening**: tap → shake → lid pops → gold, Jellybeans, then each card
  stack flies out (new card / ready to upgrade highlights).
- **Trail**: horizontal scrolling Trophy Trail with arena gates and claim buttons.
- **Shop**: free daily gift, daily card offers, cosmetics (colours, hats),
  Supporter Pack (cosmetic placeholder).
- **More**: Badges, Sandbox (the old free-placement toy), Settings, Install.
- **Battle**: top — names, crowns, timer, double-mana banner. Bottom — next
  card, hand of 4, mana bar. Drag a card onto the field (or tap card, tap
  field); ghost units / spell circle follow the finger; the playable zone
  lights up. Pause menu with Surrender.
- **Result**: victory/defeat/draw, crowns, trophies ±, gold, new arena splash.
- Tutorial: first match against the Training Dummy with coach tips; then the
  hub points at the chests.

## 7. Engineering rules

- Plain ES modules, no build step, no dependencies. Two-space indent, single
  quotes, semicolons, long lines OK (~160).
- Simulation and meta stay pure (no DOM), deterministic from seeds, tested with
  `node --test`.
- Every file under `battle/src` must be in `battle/sw.js` PRECACHE and the SW
  `VERSION` bumped on each deploy (a test enforces the first).
- Cosmetics never change a battle's outcome (separate RNG streams).
