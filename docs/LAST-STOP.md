# Last Stop (a simple base-building metagame prototype)

A landscape, mobile-first, free-to-play **metagame** prototype. Nights are
**simulated**, and nothing here is connected to the HORDE action game. It lives
in [`outpost/`](../outpost) and runs at `/outpost/` (on Pages:
`https://miikka-boom.github.io/FunLand2/outpost/`, locally
`http://localhost:8080/outpost/` with `npm start`).

> One gas station. One survivor. Build a town.

## The brief

The first Last Stop put Thrill Hill's whole loop (two chests, Badges, a squad
of three, crowns, zones) on an isometric town you expand lot by lot. Playtest
feedback: "It is way way way too complex. Simplify it in every way possible.
And player is only playing with one character at a time. We want a satisfying
simple base building experience."

So this version keeps the town (the iso map, homes that grow, lots to clear,
residents wandering about, zombies at the fence) and cuts everything else. The
bigger version is in git history (the merge of PR #3).

## The whole game

There is one currency (coins) and five things to do:

| | What you do | What happens |
|---|---|---|
| **PLAY** | Send tonight's survivor out | A win: coins and the next night. A loss: a third of the coins, same night again. |
| **UPGRADE** | Tap a home, tap UPGRADE | Its survivor gets stronger and **the home grows**: tent, shack, log cabin, cottage, tower house, golden house (a heart plaque marks the level in between). |
| **NEW HOME** | BUILD, pick New home, put it anywhere on your land | **Someone new moves in**: the stars knock in one by one, then their face. The first is always a 3★ Hero. |
| **DECORATE** | BUILD, pick a decoration, put it anywhere | Nothing but fun: people sit on benches, soak in the hot tub, bounce on the trampoline. |
| **LAND** | Tap a price tag on the lot next door, tap CLEAR | It's yours: the ruin crumbles, grass blooms, the fence hops out. Landmarks are restored; four corner lots hide a coin surprise. |

And one thing that happens by itself: **the Gas Station fixes itself up** as
you win nights (a new look every 5 nights: Patched, Fixed up at night 11, Proud
at night 21, gold trim at night 31), and the fence goes with it (planks, tin,
brick, string lights).

Anything you've placed can be moved: long-press and drag it, or tap it and
tap Move. There's no selling, no box and no undo.

## One survivor at a time

The face next to PLAY is whoever goes out tonight. Tap it for **Who goes out
tonight?**: everyone, strongest first, with their power and tonight's odds
(Easy, Good, Tough, Risky). Tap someone to send them. A newcomer who'd do
better than tonight's pick offers **SEND OUT TONIGHT** when they move in.

Survivors are generated (name, look, job, a quirk, a line): stars (1★ Rookie
to 4★ Legend) and level are all that matter. The class (Brawler, Shooter,
Medic, Tinker) is the outfit colour and the prop.

## The screen

- Top left: coins. Top right: the gear (testing tools).
- Bottom left: **BUILD**. Bottom right: tonight's survivor and **PLAY**
  ("NIGHT 7 · GOOD").
- Tap anything on the map and a bar slides up along the bottom with what you
  can do with it: a home (UPGRADE, SEND OUT, Move), a decoration or the
  station (Move), a lot (CLEAR). The camera glides it into view above the bar,
  so you watch the home grow as you upgrade. Tap the ✕, the ground or Back to
  close it.
- An ↑ floats over tonight's survivor's home when their upgrade is affordable.
- For the first nights a hand points at the next thing to do: PLAY, the first
  new home, an upgrade when tonight looks tough, the lot next door when
  there's no room. It stops once you've played 15 nights, built 2 homes and
  cleared a lot.

## Numbers

All in [`outpost/src/config.js`](../outpost/src/config.js).

- **Power** = round((10 + 4 × (level − 1)) × stars), stars ×1 / ×1.2 / ×1.45 /
  ×1.75 for 1★..4★.
- **Night N's threat** = 7 × √N (quick at first, slower later).
- **Chance** = clamp(0.5 + 1.1 × (power / threat − 1), 5%, 95%). Night 1 is a
  sure win. Labels: Easy ≥ 80%, Good ≥ 55%, Tough ≥ 30%, else Risky.
- **Pay**: a win 15 + 5 × N coins, a loss a third of that.
- **Upgrades** to Lv 2..10: 20, 35, 60, 95, 140, 200, 280, 380, 500.
- **Homes**: 80, 120, 180, 260, 360, 480, 620, 780, 960, 1160, then +220
  each. Who moves in: 50% 1★, 30% 2★, 15% 3★, 5% 4★, at one level below your
  best survivor. The first is a 3★ Hero; a 4★ Legend comes by the 8th home
  if none has yet.
- **Land**: 120, 220, 350, 500, 680, 880, 1100, 1350, 1620, 1900, 2200,
  2500, then +320 each. A surprise lot pays back 60–140% of its price.
- **Decorations**: 25 (bench, planter) up to 650 (the carousel), 18 kinds.
- Start: 60 coins, a 1★ Rookie in a tent, a campfire, a bench and a planter.

## Pacing

`npm run outpost:balance` plays 20 seeded players who follow the hints:
keep tonight's odds at 75%+ with upgrades, alternate new homes and land
(whichever is cheaper), and spend 30% of every night's coins on decorations
and on the others' homes. Medians:

| Nights played | Night | People | Lots | Decorations | Tonight's survivor |
|---|---|---|---|---|---|
| 5 | 5 | 2 | 1 | 3 | 3★ Lv 2 |
| 15 | 14 | 3 | 2 | 6 | 3★ Lv 5 |
| 30 | 26 | 5 | 3 | 13 | 3★ Lv 6 |
| 60 | 51 | 8 | 6 | 38 | 3★ Lv 9 |
| 100 | 84 | 12 | 9 | 74 | 4★ Lv 10 |
| 150 | 119 | 16 | 12 | 123 | 4★ Lv 10 |

First new home by night 4, first lot by night 14, the station Fixed up at 11
and Proud at 22, a Legend by about 66. About 80% of nights are won; past
night 100 the threat catches up even with a Legend at Lv 10 and wins thin
out (losses still pay, so the town keeps growing). Coins go about a quarter
each on levels, homes and land, and 15% on decorations.

## What was cut from the first Last Stop

Chests and their timers, gems, Badges and READY, the squad of three, classes
as counters and threats, crowns, Skulls, zones and gates, milestones, perks,
vibes as a mechanic, siblings, golden survivors, Rally and Clutch, BEST,
strays, gifts, junk piles, trunk survivors, wishes, keepsakes with names,
the box, kits, decoration sets and rares, paths and painting, Undo,
landmark bonuses, lot prizes and Glow-Ups, MVP lot names, roof campers,
visitors, town naming, the Crew screen, the Skull ladder and the founders'
statue.

## Code map

```
outpost/
  index.html, outpost.css     the page and its styles
  src/config.js               every number and every piece of content
  src/town.js                 the rules (no DOM): nights, upgrades, homes, decorations, land, moving, hints, cheats
  src/people.js               the survivor generator (names, looks, jobs, quirks)
  src/main.js                 boot, the frame loop and every flow (select, play, build, clear, move, hints)
  src/map.js                  the town map: ground, wild lots, objects, fence, tags, walkers, zombies, placing and lifting
  src/isoview.js, iso.js      the iso engine: camera, gestures, depth order, hit tests, the placement ghost
  src/hud.js                  coins, the gear, BUILD, tonight's survivor and PLAY, the hint hand
  src/build.js                the BUILD row
  src/sheets.js               the selection bar and the people list
  src/run.js                  the night out and the move-in reveal
  src/save.js, dev.js         the save (localStorage) and the testing drawer
  src/art.js                  the door to the art modules (town-art, ground-art, decor-art, town-icons)
  src/portrait.js, thrill-art.js, icons.js, fx.js, audio.js, ui.js, path.js, util.js, clock.js, format.js
  tools/player.mjs            the simulated player
  tools/balance-sim.mjs       npm run outpost:balance
```

Tests: `tests/outpost-town.test.js` (the rules, saves and pacing),
`tests/outpost-art.test.js` (every piece of art is well-formed),
`tests/outpost-iso.test.js` (the iso engine).

## Testing tools

The gear (or the `` ` `` key): always win or always lose, the stars of the next
newcomer, +5 or +20 nights, coins, everyone +1 level, clear the next lot or
every lot, +3 people, live sliders for coins and threat, stats, and copy, load
or reset the save. `window.__outpost` has the town in the console.
