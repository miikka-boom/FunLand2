# Safehouse metagame (prototype)

A second, separate metagame prototype, built from the design doc
*Safehouse: Meta-Progression Design for a Co-op Zombie Mobile Game*. It lives
in [`safehouse/`](../safehouse) and runs as its own page: `/safehouse/` on
GitHub Pages, or `http://localhost:8080/safehouse/` with `npm start`.

It is **not connected to the action game** and does not link to it. The
**PLAY** button runs a **simulated co-op mission** in its place, so the
Safehouse loop can be played and tuned on its own. The camp prototype in
[`camp/`](../camp) is unrelated; the two share no code.

## The loop

```
   1. Gear up            pick a mission, the squad and three loadout slots
   2. Play the mission   5-8 minutes, stretches split by safe rooms   (simulated here)
   3. Bank the loot      every safe room banks that stretch's pickups for good
   ─────────────────────────── the Safehouse ───────────────────────────
   4. Collect            payouts, the Scrap Yard pile, daily orders
   5. Queue              start a build, queue crafts (timers do the waiting)
   6. Choose the next mission  ──► back to 1
```

A check-in takes about a minute: collect, queue, leave. Short crafts finish
during the next mission (a simulated mission moves the clock on by its
length), and long builds finish between sessions, also while the page is
closed.

## What is in it

Everything the doc describes except the social hooks, so all five stages of
the progression flow can be played. The doc's MVP (seven stations at three
levels) would stop at stage 3. Each line below says how a part of the doc
was implemented.

- **One screen, eight stations.** A cross-section of the building: 4×2 rooms
  in landscape, 2×4 in portrait. Tapping a room opens its sheet (Upgrade,
  Craft, Collect, plus the station's own panel): a bottom sheet in portrait
  and a side sheet in landscape. The Scrap Yard pile can be collected
  straight from the room with one tap.
- **Four resources.** Scrap, Parts, Supplies and Fuel. Mission loot
  converts automatically, is banked at every safe room, and every player
  gets the full total. Soft caps: a payout over a cap converts to Scrap at
  half value.
- **Power and Fuel.** The Generator table matches the doc exactly. Running
  jobs draw power, and starting a job burns its recipe's Fuel. Nothing
  drains in real time, and builds need neither power nor Fuel. With an
  empty tank, running jobs finish and new jobs wait.
- **Upgrades.** The base ladder times a per-station factor. Each upgrade
  needs resources, the Barricade gate (stations can be at most Barricade
  level + 1) and the chapter gate (1, 3, 6, 10 chapters), then runs a
  real-time timer. Build slots are 1, then 2 at Barricade 3, then 3 at
  Barricade 5. Cancelling refunds everything.
- **Crafting.** The doc's recipe table, plus one decision (see below). Each
  station runs one job at a time and holds as many waiting jobs as its
  level. Waiting jobs start on their own the moment power and Fuel allow,
  also while you are away. The Loadout Crate holds 10 of each item.
- **Three mission slots.** One throwable, one heal and one boost. Everyone
  gets a free bandage. Unused items go back to the crate.
- **Named survivors.** Five written characters with portraits, roles,
  signature perks, bios, Barracks reactions to the latest mission, and
  banter during missions. Nadia is introduced by name in the opening scene
  and fights in mission 1. Theo and Grace arrive in scripted chapter
  finales. Lukas and Mei answer Radio Room rescue calls when a bunk is
  free. Bonds grow with missions played together, and there is no
  permadeath.
- **Radio Room.** Opens chapters 4-12. Daily orders stack up to three, so
  there are no streaks to lose. Rescue calls come in when a bunk is free.
- **Co-op.** The prep screen can add a simulated friend (a new player or a
  veteran) who takes a squad slot and brings their own items. The squad
  uses the best starting temp health and the best Well Rested bonus among
  its humans; bonuses don't stack.
- **Progression flow.** The doc's five stages, plus "the long haul", are
  tracked. A guide banner points at the next goal, a card introduces each
  stage's "new idea", and the pacing log records when each stage was
  reached.
- **Mobile.** Every action takes at most two taps, and nothing uses
  drag-and-drop. There is a welcome-back summary after an absence. The one
  notification in the MVP is build-finished: opt-in, at most once a day,
  best effort (see below).
- **Left out**, as in the doc's MVP: social hooks (visiting a friend's
  Safehouse, Fuel gifts) and the Scrap Yard notification. Monetization and
  premium currency are out of scope; the doc keeps them out of this layer.

## Design decisions

The doc leaves these open or unspecified, so I made a call on each. All
of them are data in `config.js` or one obvious spot in `economy.js`.

| Topic | Decision |
|---|---|
| Scope | The full doc (8 stations × 5 levels, Radio Room, reserve bunks, bond chapters) instead of the MVP's 7 × 3, so stages 4-5 and the long haul can be tested. Social hooks are left out. |
| Orientation | Both. Portrait gets the doc's bottom sheet; landscape (the action game's orientation) gets a side sheet. |
| Cost factors | Barricade 1.5×, Armory 1.25×, Generator, Barracks, Infirmary and Radio Room 1× (the Infirmary matches the doc's data example), Workshop 0.75×, Scrap Yard 0.5×. |
| Storage caps | The Barricade caps Parts and Supplies, and the Generator's tank caps Fuel. Scrap has no cap: it is where overflow goes, so "nothing is wasted" holds. Overflow values: 1 Part = 5 Scrap, 1 Supply = 2, 1 Fuel = 4, at half value. |
| Start | 250 Scrap, 20 Supplies and 6 Fuel: enough for the Barricade and the Generator before mission 1. The Workshop and the first pipe bomb come from mission 1's loot, which is how "loot becomes a pipe bomb" is taught. |
| First mission | Always clears, so the tutorial mission can't fail. |
| Instant builds | Level 1 builds take no time, so they don't need a free build slot. |
| Paying for jobs | Resources are paid when you queue a job, and Fuel when it starts. Cancelling refunds everything, including Fuel if the job had started. Stations keep crafting while they are being upgraded. |
| Auto-start order | When power or Fuel frees up, waiting jobs start oldest first, skipping any job that still doesn't fit. Offline progress replays this in exact time order. |
| Crate cap | Counts items still in production, so a craft can't be queued past 10. |
| Scrap Yard | A production run costs 1 Fuel and draws 1 power until the pile holds 8 hours of output. Collecting a full yard starts the next run (one tap); collecting mid-run keeps it going. Stop frees its power for crafts; the pile is kept and the Fuel already burned is not refunded. It starts on its own when first built. Rates are 30, 36, 42, 48 and 54 per hour. |
| Ammo packs | The doc lists them under the Workshop but not in the craft table, so they are a Workshop 4 boost (+20% power on the hardest stretch). |
| Weapon attachments | Laser sights (Workshop 3) and drum magazines (Workshop 5), each +10% weapon power on every gun. |
| Armory | Pump Shotgun at Lv 1, Assault Rifle at Lv 2, Hunting Rifle at Lv 3 (the action game's weapon ids). Upgrades Mk II-Mk V are instant purchases, because the Armory runs no jobs; the Armory level caps the tier. Presets: 1, 2, 2, 3, 3. |
| Infirmary | Starting temporary health +0, +10, +20, +30, +50. |
| Well Rested | The doc has no XP besides bonds, so Well Rested is +10% bond XP per Barracks level. In co-op, the best Well Rested among the humans applies. |
| Survivor arrival | Rescued survivors wait for a bunk ("Theo needs a bunk") and join the squad once the Barracks has one. Story survivors waiting for a bunk come before rescue calls. |
| Perks | Each survivor has a signature perk, a small upgrade at bond 3, and a veteran perk that Barracks 5's perk slot turns on. |
| Bonds | +100 XP per mission together (50 on a wipe), times Well Rested. Levels at 250, 750, 1600, 2800 and 4400 XP. Each level is +2 survivor power, capped below a human with a gun. |
| Bond chapters | At Barracks 4 and bond 3: one short story mission per survivor, worth +600 bond XP and some resources. |
| Chapters | 12 chapters of 3 missions each, the third being the finale. "Chapters cleared" counts finales won. Chapters 1-3 are open from the start, and each Radio Room level opens two more (all 12 at Lv 5). |
| Daily orders | One arrives when the Radio Room is built, then one each midnight on the Safehouse clock, stacking to three. Rewards scale with the Radio Room level. |
| Notifications | Build-finished only (the MVP), opt-in in the tuning drawer, at most once a day. A static page can't push while it is closed, so this uses the web Notification API while the page stays open in the background. A shipped game would send it from the server. |
| Clock | Local time plus a warp offset that is saved with the Safehouse. The doc's server-side clock is a backend concern. |

## Numbers

All numbers are in [`safehouse/src/config.js`](../safehouse/src/config.js).
Like the doc's, they are starting values for tuning.

**Stations** (S = Scrap, P = Parts). Build times follow the ladder: instant,
10 min, 1 h, 6 h, 24 h. Chapter gates: 0, 1, 3, 6, 10.

| Station | Factor | Unlock (Barricade) | Draw | Lv 1 | Lv 2 | Lv 3 | Lv 4 | Lv 5 |
|---|---|---|---|---|---|---|---|---|
| Barricade | 1.5x | start | 0 | 150 S | 375 S + 15 P | 900 S + 45 P | 2250 S + 120 P | 5250 S + 300 P |
| Generator | 1x | start | 0 | 100 S | 250 S + 10 P | 600 S + 30 P | 1500 S + 80 P | 3500 S + 200 P |
| Barracks | 1x | start | 0 | pre-built | 250 S + 10 P | 600 S + 30 P | 1500 S + 80 P | 3500 S + 200 P |
| Workshop | 0.75x | 1 | 2 | 75 S | 190 S + 8 P | 450 S + 23 P | 1125 S + 60 P | 2625 S + 150 P |
| Infirmary | 1x | 1 | 2 | 100 S | 250 S + 10 P | 600 S + 30 P | 1500 S + 80 P | 3500 S + 200 P |
| Armory | 1.25x | 2 | 0 | 125 S | 315 S + 13 P | 750 S + 38 P | 1875 S + 100 P | 4375 S + 250 P |
| Radio Room | 1x | 2 | 0 | 100 S | 250 S + 10 P | 600 S + 30 P | 1500 S + 80 P | 3500 S + 200 P |
| Scrap Yard | 0.5x | 3 | 1 | 50 S | 125 S + 5 P | 300 S + 15 P | 750 S + 40 P | 1750 S + 100 P |

**Storage** by Barricade level 0-5: Parts 30, 60, 150, 300, 500, 800;
Supplies 60, 150, 300, 500, 750, 1000. Fuel tank by Generator level 0-5:
10, 20, 40, 70, 110, 160.

**Chapters.** The recommended squad power and the payout for a full clear
of mission 1 / mission 2 / the finale:

| Chapter | Power | Scrap | Parts | Supplies | Fuel |
|---|---|---|---|---|---|
| 1. Moving In | 100 | 110 / 140 / 175 | 6 / 8 / 10 | 25 / 30 / 40 | 3 |
| 2. Dead Air | 110 | 120 / 150 / 185 | 7 / 9 / 11 | 25 / 30 / 40 | 3 |
| 3. Ward Seven | 122 | 130 / 160 / 200 | 8 / 10 / 12 | 30 / 35 / 45 | 3 |
| 4. Low Water | 145 | 135 / 170 / 215 | 9 / 11 / 13 | 30 / 40 / 45 | 4 |
| 5. Night Market | 160 | 145 / 185 / 230 | 9 / 12 / 15 | 35 / 40 / 50 | 4 |
| 6. Freight | 178 | 155 / 195 / 245 | 10 / 13 / 16 | 35 / 45 / 55 | 4 |
| 7. Cold Storage | 192 | 170 / 210 / 265 | 11 / 14 / 18 | 40 / 50 / 60 | 5 |
| 8. Blackout | 206 | 180 / 225 / 280 | 12 / 16 / 19 | 40 / 50 / 65 | 5 |
| 9. Old Town | 228 | 190 / 240 / 300 | 14 / 17 / 21 | 45 / 55 / 70 | 5 |
| 10. Quarantine | 246 | 205 / 255 / 320 | 15 / 19 / 24 | 50 / 60 / 75 | 6 |
| 11. Bridges Out | 262 | 220 / 275 / 345 | 17 / 21 / 26 | 50 / 65 / 80 | 6 |
| 12. Last Light | 280 | 235 / 295 / 370 | 18 / 23 / 29 | 55 / 70 / 85 | 6 |

There is also first-clear Parts (2 × chapter) and optional fuel cans in
mission 2 and the finale.

## The simulated mission

[`mission-sim.js`](../safehouse/src/mission-sim.js) is pure and seeded. A
mission is 2-3 stretches, one of them the horde (or the finale).

- **Squad power** is the sum of the four members plus starting temp health
  (0.1 power per point per member). You are 40 × skill plus your gun (power
  × tier × attachments). A friend is 40 plus their gun. A named survivor is
  30 + 2 per bond level, so they top out at 40, below a human with a gun.
  A bot is 20.
- Each stretch clears with `0.8 + (power / threat − 1)`, clamped to 5-97%.
- **Items are used where they matter.**
  - Throwables cut the horde stretch's threat (pipe bomb 12%, molotov 16%,
    lure flare 20%).
  - Boosts add power on the hardest stretch (pills 8%, adrenaline 15%, ammo
    pack 20%).
  - Heals are used only when a stretch goes wrong: the bandage saves 30%,
    the first-aid kit 60%, and the defibrillator always saves, used last.
  - Anything unused stays in the crate.
- **Perks.** Nadia makes heals work better, Theo makes throwables stronger,
  Grace adds power on the horde and finale, Lukas siphons Fuel, Mei finds
  more Scrap and Supplies. Veteran perks (Barracks 5) add one more each.
- **Safe-room banking.** A wipe loses only the stretch it happened in,
  never the whole run.
- The tuning drawer can force every mission to clear or to wipe in a random
  stretch. The prep screen estimates the clear chance by simulating the
  mission 300 times.

## Safehouse ↔ game contract

This is the seam where the co-op game would plug in. The Safehouse builds a
**MissionLoadout** (`Safehouse#missionLoadout(id)`) and banks a
**MissionReport** (`Safehouse#applyMission(report)`). The simulator returns
the same shape the game should send.

**MissionLoadout** (Safehouse → game), trimmed:

```json
{
  "mission": { "id": "c2m2", "chapter": 2, "sections": [{ "kind": "run", "threat": 110 }, { "kind": "horde", "threat": 123 }, { "kind": "run", "threat": 110 }], "fuelCans": { "section": 1, "amount": 3 } },
  "members": [
    { "kind": "you", "power": 48, "weapon": "smg", "tier": 1, "items": { "throwable": "pipe_bomb", "heal": "first_aid_kit", "boost": "pain_pills" } },
    { "kind": "survivor", "id": "nadia", "power": 32, "bond": 1 },
    { "kind": "survivor", "id": "theo", "power": 30, "bond": 0 },
    { "kind": "bot", "power": 20 }
  ],
  "shared": { "tempHp": 10, "rested": 20 },
  "perks": { "medic": 0.25, "chemist": 0.25 },
  "power": 134,
  "friend": null,
  "firstClear": true
}
```

**MissionReport** (game → Safehouse), trimmed:

```json
{
  "missionId": "c2m2",
  "won": true,
  "sectionsCleared": 3,
  "sectionsTotal": 3,
  "sections": [{ "kind": "run", "cleared": true, "loot": { "scrap": 48, "parts": 3, "supplies": 10, "fuel": 1 } }, "…"],
  "banked": { "scrap": 153, "parts": 13, "supplies": 30, "fuel": 6 },
  "firstClear": { "parts": 4 },
  "itemsUsed": { "pipe_bomb": 1, "pain_pills": 1 },
  "thrown": 1,
  "healed": 0,
  "fuelCans": 1,
  "kills": 53,
  "timeS": 351,
  "squad": { "survivors": ["nadia", "theo"], "friend": null },
  "rested": 20
}
```

How the action game would use it:

- `members` spawn as the squad: you, friends and named survivors as bots.
- `items` are the three slots. A real mission reports what was actually
  used.
- `shared.tempHp` is everyone's starting temporary health.
- Safe rooms bank `sections[i].loot`, and `banked` is the sum.
- `threat` and `power` are only the simulator's stand-in for skill and
  difficulty.

## Tuning and testing

- **Tuning drawer** (gear, top right, or the `` ` `` key):
  - time warp (+1 min … +1 day) and fast-forward (×10, ×60, ×600)
  - cheats: resources, finish all timers, clear the next chapter, bond XP
  - live multipliers for build time, craft time, mission loot and simulated
    skill
  - forced mission outcome
  - whether missions move the clock on
  - the build-finished notification, haptics and volume
  - the **pacing log** (when each stage was completed, in Safehouse time
    and in time spent on the page, next to the doc's timing) and stats
  - save export, import and reset
- **Tests:**
  - `tests/safehouse-economy.test.js` covers the rules: gates, build slots,
    refunds, caps and overflow, power, Fuel, queues and auto-start while
    away, the yard, the crate, banking, rescues, squads, bonds, orders,
    stages and saves.
  - `tests/safehouse-mission-sim.test.js` covers the simulator.
  - `tests/safehouse-content.test.js` checks the tables against the doc
    (the ladder and factors, the Generator table, unlocks and power draw,
    build slots, the recipe table, weapon ids that match the action game,
    and costs that fit their caps).
- **Balance simulator:** `npm run safehouse:balance -- --days=60 --sessions=3 --missions=1 --seed=1 [--skill=0.8] [--friend=veteran]`
  plays a scripted regular player: it builds toward the stage goals, saves
  Parts for the Barricade, keeps two of each item crafted, collects the
  yard, claims orders, and plays the next mission when the clear chance is
  at least 50% (otherwise it replays one at 75% or more).

When each stage is completed (median of seeds 1-3; "day 3" means during
the third day):

| Profile | 1. Move in | 2. First timers | 3. Choose a path | 4. Autopilot | 5. Bonds | 6. Long haul |
|---|---|---|---|---|---|---|
| Doc's typical timing | missions 1-3 | days 1-2 | days 3-5 | week 2 | weeks 3-4 | after month 1 |
| 3 missions a day (default) | mission 1 | day 2.6 | day 6 | day 7.3 | day 11.5 | day 28 |
| 2 missions a day | mission 1 | day 3.6 | day 8 | day 11 | day 16.3 | day 36 |
| 5 missions a day | mission 1 | day 2 | day 3.6 | day 4.5 | day 8.5 | day 21 |
| 3 a day with a veteran friend | mission 1 | day 2.3 | day 5 | day 6.5 | day 10.3 | day 26 |
| 3 a day, skill ×0.8 | mission 1 | day 2.6 | day 6 | day 7.5 | day 11.8 | day 29 |

What the simulator shows (findings for the next tuning pass):

- **Stages 1-4 land on the doc's timing, and stage 6 lands close to it.
  Stage 5 comes a few days early.** Barricade 4 needs six chapters, and the
  squad clears chapter 6 around day 9, so the Barricade 4 and Barracks 4
  upgrades land around day 11-12. Harder chapters 5-6 or a later chapter
  gate would push it toward weeks 3-4.
- **Parts set the late-game pace; Scrap piles up.** By day 40 a regular
  player holds over 30,000 unspent Scrap, most of it from the Scrap Yard,
  while Parts sit near zero. The doc's ladder costs Scrap and Parts at about
  17.5 : 1, but income runs closer to 25 : 1 once the yard runs around the
  clock. Options: a late Scrap sink, a lower yard rate, or Scrap-heavier
  level 5 costs.
- **Crafts and perks carry the late game.** With a full loadout and bonded
  survivors, chapter 10 clears at about 0.8× its recommended power, so
  crafting matters more than raw upgrades late on. Watch whether players
  feel this.
- **Friends help without being needed.** A veteran friend saves 1-2 days
  over a month, so it is a real upgrade but not a requirement.
- **Reserve survivors only bond if picked.** Lukas and Mei stay at bond 0
  unless the player rotates the squad. That is the reserve choice working,
  but it may need a nudge, such as a bond chapter teaser.

## Playtest checklist

From the doc:

- Do players start a craft or a build before leaving the Safehouse?
- Do they understand power capacity without a tutorial? Watch for "Waiting
  for power" and whether they use the yard's Stop.
- Can they recall the names of their first two survivors after the first
  session?
- Do they return for a second session on the same day?

Added for this build:

- Does the guide banner plus the stage card teach each new idea, or is the
  banner the only thing read?
- Does banking at safe rooms make a wipe feel fair?
- Is the clear-chance estimate trusted? Do players replay easy missions or
  push the next one?
- Does adding a friend feel like an upgrade without making survivors feel
  pointless?
- After an absence, does the welcome-back summary plus "Collect everything"
  make the one-minute check-in?

## Code map

```
safehouse/index.html, safehouse.css   page shell and styles (landscape and portrait)
safehouse/src/config.js        all content and numbers (doc data shape)
safehouse/src/story.js         survivor bios, scenes, Barracks lines, banter, chapter text
safehouse/src/economy.js       Safehouse state + rules (pure, no DOM, unit tested)
safehouse/src/mission-sim.js   simulated mission: MissionLoadout -> MissionReport
safehouse/src/clock.js         clock: real time + warp offset (saved)
safehouse/src/save.js          localStorage save/tuning with forward-filling migration
safehouse/src/main.js          boot, frame loop, offline catch-up, actions, notifications
safehouse/src/base-view.js     the building: eight rooms, statuses, one-tap yard collect
safehouse/src/hud.js           resources and caps, power meter, stage, builds, crate, squad, guide, PLAY
safehouse/src/sheets.js        every sheet and modal: stations, crate, prep, results, scenes
safehouse/src/mission-view.js  the simulated mission overlay
safehouse/src/ui.js            layer manager (sheet / modal / full), live timers, toasts
safehouse/src/art.js, portraits.js, icons.js   procedural SVG rooms, survivor portraits, icons
safehouse/src/fx.js, audio.js  flying loot and bursts; WebAudio UI sounds and generator hum
safehouse/src/dev-panel.js     tuning drawer
safehouse/tools/balance-sim.mjs   pacing simulator (npm run safehouse:balance)
tests/safehouse-*.test.js      economy, simulator and content tests
```

`window.__safehouse` exposes the Safehouse, the clock, the tuning and the
action dispatcher in the browser console.
