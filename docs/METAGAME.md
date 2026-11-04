# Survivor camp metagame (prototype)

A landscape, mobile-first base-building metagame for HORDE, prototyped **on
its own**: the action game is not connected. A **simulated PLAY button**
stands in for a run, so the camp loop can be tuned until it is satisfying
by itself. It lives in [`camp/`](../camp) and runs as a separate page:
`/camp/` on GitHub Pages, or `http://localhost:8080/camp/` with `npm start`.

## The loops

```
          ┌──────────── PLAY (simulated run) ─────────────┐
          │                                               ▼
   run power, guns, HP,                     scrap · wood · food · gems
   medkits, items, new zones                survivors (rescued on runs)
          ▲                                               │
          └────── build & upgrade the camp ◄──────────────┘
                     (timers · builders · gems)

   idle: producers fill up · builds, clearing, expeditions, crafting run
         on timers · the Supply Crate and Airdrop wait for you
```

- **Core loop.** Runs bring home resources and survivors. Spend them on
  buildings. Buildings make the next run stronger (Armory, Infirmary,
  Workshop), reveal harder zones with better loot (Radio Tower) and haul
  more of it home (Garage).
- **Idle loop.** The Garden, Lumber Yard and Scrapyard produce while you're
  away, until their store is full. Builds, rubble clearing, expeditions and
  crafting all run on timers. Every timer can be **rushed with gems**, and
  missing resources can be **bought with gems**.
- **Reasons to come back.** The **Supply Crate** (short: every 10 min) and
  the **Airdrop** (long: every 8 h) wait in the camp (left HUD, and dropped
  into the camp itself). There are also full producers, finished timers and
  a **welcome-back summary** of what happened while you were gone.
- **Direction.** 36 objectives in a row take you through every unlock and
  pay gems along the way. The first five play out in the first few
  minutes.
- **Why the game matters.** Scrap mostly comes from runs. Survivors gate
  Command Post levels 4 to 8, and they mostly come from runs. In the balance
  sim, a player who never runs maxes the camp **about 1.7× slower**.

## Unlock schedule

| Camp level | Regular player* | Unlocks |
|---|---|---|
| 1 | start | Garden (food), Lumber Yard (wood) |
| 2 | ~6 min | Armory (guns + damage), Radio Tower (zones), Scrapyard (scrap), Warehouse (storage) |
| 3 | 18 min with 4 runs, else session 2 | 2nd builder, Bunkhouse (beds), clear the Wrecked Cars → Infirmary (HP + medkits) |
| 4 | end of day 1 | Garage (+run loot, expeditions). Needs 4 survivors. |
| 5 | day 2 | clear the Collapsed Shed → Workshop (crafted items). Needs 6 survivors. |
| 6 | day 3 | 3rd builder. Needs 8 survivors. |
| 7 | day 5 | Needs 10 survivors. |
| 8 | day 7 | Needs 12 survivors. |

\* `npm run camp:balance`: 5 sessions a day, 2 runs a session, rushing only
timers that cost 2 gems or less.

Each Command Post level also raises building level caps, so there's always
something new to put a builder on. **Zones:** Suburbs (start), Downtown
(Radio 1), Industrial Park (Radio 2), Mercy Hospital (Radio 3), Military
Base (Radio 4). **Guns:** SMG (start), Pump Shotgun (Armory 2), Assault
Rifle (Armory 4), Hunting Rifle (Armory 6). These are the action game's
weapon ids, and a test checks that they match `src/game/weapons.js`.

## Systems

- **Resources:** food, wood, scrap, plus **gems** (hard currency) and
  **survivors**. Storage (Command Post + Warehouse) caps what you can
  *collect* from producers. Rewards (runs, crates, airdrops, objectives,
  expeditions) can go over the cap, so earned loot is never lost.
- **Producers:** rate per hour and a store (1 h at level 1, up to 10 h).
  A new producer starts 40% full, so the first collect is instant.
  Upgrading pauses production; whatever is stored is banked first.
- **Builders:** 1, then 2 at Command Post 3, then 3 at Command Post 6. Rubble
  clearing also takes a builder.
- **Rushing:** gems = piecewise-linear through 1 min → 1, 1 h → 20,
  1 day → 260, 1 week → 1000 (`GEM_ANCHORS`). Missing resources cost
  1 gem per 40 food/wood or 20 scrap. Spends of 15+ gems need a second tap.
- **Expeditions (Garage):** send a crew of survivors on a 15 min / 1 h /
  4 h / 8 h trip. Loot is rolled at departure and scales with camp level.
  The longer trips can bring gems or a survivor back. Slots come from the
  Garage level.
- **Workshop:** craft Medkits, Pipe Bombs and Molotovs on timers. The deploy
  screen packs up to one of each into the next run (+power), and the run
  uses them up.
- **Survivors:** need beds (Command Post 3 + Bunkhouse). You get them on
  runs (zone chance + Radio bonus), from 30% of airdrops and from long
  expeditions. With no free bed, the survivor moves on and the UI tells you.

## Camp ↔ game contract

This is the seam where the real game plugs in. `Camp#loadout()` builds a
**RunLoadout**, and the camp banks a **RunResult** with `Camp#applyRun()`.
The simulator (`camp/src/run-sim.js`) produces the same RunResult the game
should send.

**RunLoadout** (camp → game), also shown in the in-camp *Your next run* panel:

```json
{
  "maxHp": 130,
  "damageMult": 1.15,
  "weapons": ["smg", "shotgun"],
  "medkits": 1,
  "items": { "pipebomb": 1 },
  "lootMult": 1.2,
  "rescueBonus": 0.05,
  "power": 184
}
```

**RunResult** (game → camp):

```json
{
  "zone": "downtown",
  "won": true,
  "progress": 1,
  "kills": 64,
  "timeS": 312,
  "loot": { "scrap": 180, "wood": 120, "food": 100 },
  "kept": 1,
  "gems": 20,
  "rescued": 1,
  "itemsUsed": { "pipebomb": 1 }
}
```

`kept` is the share of the route's loot that made it home (1 on a win).

How the action game would use it:

- `weapons` limits which guns you can swap between. `maxHp` and
  `damageMult` scale the player and weapon tables. `medkits` and `items`
  spawn as carried consumables.
- The zone picks the map seed and Director tuning. Its `loot` table is the
  target total for physical pickups placed along the route, and `lootMult`
  scales them.
- On death, keep what was carried and report the share as `kept`. The
  simulator models that as `20% + 50% × route progress`.
- Survivors are found and escorted on the route (`rescueBonus` raises the
  chance one spawns).
- `power` and the zone's `rec` are only the simulator's stand-in for skill.
  In the real game they'd just be a difficulty hint.

## The simulated run

- Win chance = `0.75 + 0.8 × (power − rec) / rec`, clamped to 5–97%
  (`WIN_CHANCE`). The deploy screen shows it as Easy / Fair / Risky / Deadly.
  The very first run always survives. For testing, the outcome can be forced
  to *Always survive* or *Always die*.
- First-time survival of a zone pays gems. A lucky stash gives 1–3 gems 6% of
  the time.
- **A run moves the camp clock on by its length** (~5–9 minutes, toggle in
  tuning). That's what the real game would do: timers keep running while you
  play, so starting an upgrade and then playing a run feels like it does in
  the final game. It also stops instant simulated runs from making the
  economy feel faster than it will be.

## Tuning and testing

- **All content and numbers** are in [`camp/src/config.js`](../camp/src/config.js):
  buildings with per-level cost, time and effect, zones, expeditions,
  recipes, rewards, objectives and gem pricing.
  `tests/camp-content.test.js` guards the tables. It checks that every cost
  fits in storage at the camp level that unlocks it, that survivor
  requirements fit the available beds, that objectives can be done in order
  and that ids resolve.
- **Tuning drawer** (gear, top right, or the `` ` `` key):
  - time warp (+1 min … +1 day) and fast-forward (×10, ×60, ×600)
  - cheats
  - live multipliers for build time, production, run loot and rush price,
    plus the crate and airdrop intervals
  - default run outcome
  - a **pacing log** of when each camp level was reached, in camp time and
    in time actually spent in the camp
  - save export, import and reset
- **Balance simulator:** `npm run camp:balance -- --days=10 --sessions=5 --runs=2 --rush=2`
  plays a scripted regular player and prints when each level is reached.
  Some reference results:

| Profile | Camp 4 | Camp 6 | Camp 8 |
|---|---|---|---|
| 5 sessions/day, 2 runs each | 12 h | 2.5 days | 6 days |
| 3 sessions/day, 2 runs each | 1.3 days | 3.8 days | 8.7 days |
| 5 sessions/day, never runs | 1.5 days | 5.2 days | 10.7 days |
| 5 sessions/day, rushes everything | 11 h | 2 days | 5.5 days |

After the mid-game, resources rather than time are the main limit, so
rushing only speeds things up a little. If timers should be the main
pressure on spenders, lower the costs or raise the times of level 6–8.

## Playtest checklist

- Does the first session (10–20 min) feel like a cascade of unlocks? Is the
  Camp Level 2 and 3 reveal exciting?
- Do you know what to do next without the objective banner? With it?
- Does a run feel worth it compared with just waiting? Is a death
  frustrating, or fair?
- Do you notice and care about the run power going up? Do the gun unlocks
  land?
- Is the Supply Crate interval a nice "while I'm here" bonus, or a chore?
  Is the Airdrop a reason to come back?
- When do you first want to spend gems? Does a rush ever feel like a bad
  deal, or a must?
- Is storage ever annoying ("full")? Does the Warehouse feel needed?
- After being away: does the welcome-back summary make you want to play?
- Mid-game (camp level 4–6 via time warp): are there always useful things
  to do with builders, expeditions and crafting?

## Code map

```
camp/index.html, camp.css   page shell and styles
camp/src/config.js          all content and numbers (edit me)
camp/src/economy.js         Camp state + rules (pure, no DOM, unit tested)
camp/src/run-sim.js         simulated run: RunLoadout -> RunResult
camp/src/clock.js           camp clock: real time + warp offset (saved)
camp/src/save.js            localStorage save/tuning with forward-filling migration
camp/src/main.js            boot, frame loop, offline catch-up, action dispatcher
camp/src/scene.js           camp panorama: plots, rubble, bubbles, survivors, drops
camp/src/art.js, icons.js   procedural SVG art (3 tiers per building) and icons
camp/src/hud.js             top bar, wait rewards, chips, objective, PLAY
camp/src/panels.js          every modal's HTML
camp/src/ui.js              modal manager, gem confirmation, toasts
camp/src/run-view.js        the simulated run overlay
camp/src/fx.js, audio.js    flying loot, floaters, bursts; WebAudio UI sounds
camp/src/dev-panel.js       tuning drawer
camp/tools/balance-sim.mjs  pacing simulator (npm run camp:balance)
tests/camp-*.test.js        economy, simulator and content tests
```

`window.__camp` exposes the camp, the clock, the tuning and the action
dispatcher in the browser console.
