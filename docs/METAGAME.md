# Road to Evac (metagame v2)

A landscape, mobile-first metagame for a co-op zombie survivor game,
prototyped **on its own**: a **simulated PLAY button** stands in for the
action game. It lives in [`evac/`](../evac) and runs as a separate page at
`/evac/` (on Pages: `https://miikka-boom.github.io/FunLand2/evac/`, locally
`http://localhost:8080/evac/` with `npm start`).

Your squad fights its way across a ruined city in a van, one stop at a
time, toward the evac chopper. Every cleared stop moves the van on, rolls
back the fog and often hands you a new gun or a new survivor. Supplies from
each run buy instant upgrades, so you're stronger for the next stop.

v1, the survivor camp, is still playable at `/camp/` for comparison
([METAGAME-CAMP.md](METAGAME-CAMP.md)).

## What changed from v1, and why

| v1 playtest feedback | v2 answer |
| --- | --- |
| "Idles feel too forced" | Nothing you build waits on a timer, and upgrades are instant. Only two things run on the clock, the Supply Crate and the Airdrop, and both are bonuses. They never gate progress. |
| "Direction is not clear" | There's one road to one goal (the evac), and PLAY always plays the next stop. The goal card names the next reward and how many stops away it is. After a few idle seconds, a coach bubble names the single best next step and points at its button. |
| "Some build buttons are not working" | Every button does what its label says, or immediately explains why it can't. There are no "tap again" confirms, no timers hidden in buttons, and no dimmed buttons without a reason. Gems are spent only through a dialog that shows the cost. |
| "Overwhelmed by the amount of resources" | There are two currencies. **Supplies** come from runs and buy upgrades. **Gems** pay for revives and for skipping the Airdrop wait. |

## The loop

1. **PLAY** opens the next stop's briefing. It shows:
   - your power against the power needed, and your chance to survive (Easy / Fair / Hard / Deadly)
   - the supplies you'd earn for 1, 2 or 3 stars
   - the first-clear reward (extra supplies, gems, and a gun or a survivor)
   - your squad and the co-op friends toggle
2. **The run is simulated.** The squad has portraits, health bars and a story ticker. Tap to fast-forward. If you go down after 30% of the route, you're offered a revive for gems.
3. **Results** show the stars, a cascade of supply lines (chapter reward, star bonus, Scavenger bonus, co-op bonus, first clear) and any gems.
4. **A first clear** sets off this sequence:
   - The van drives to the next stop and the fog rolls back.
   - A reveal card shows the unlock. A new gun has a one-tap "Equip · +N power". A rescued survivor joins the squad.
   - After a finale, a "district reclaimed" card shows your star count.
5. **Upgrades are instant.** Spending supplies raises your power, and you move on to the next stop.

The very first run always survives with 3 stars, so the first upgrade comes
right away.

When you die, you keep 15% + 35% × route progress of the chapter's supplies.
The results screen then tells you what helps most: the best upgrade, how
many supplies until the next one, or a cleared stop to farm. There's a
button for each.

## The road

Five districts with five stops each, 25 stops in total. The third stop in
each district is a supply run that finds a new gun. The fifth is a finale
that rescues a survivor; the last one is the evac itself.

| District | Stops (recommended power) | Unlocks |
| --- | --- | --- |
| Suburbs | Wake-Up Call 55 · Picket Fences 85 · Gun Shop 115 · Highway Jam 140 · Gas Station 165 | Pump Shotgun (Gun Shop), **Doc** (finale, +20 gems) |
| Downtown | Subway Stairs 190 · Neon Alley 205 · Precinct 9 225 · Car Alarm Ave 240 · Rooftop Flare 270 | Assault Rifle, **Mags** (+25 gems) |
| Industrial | Rail Yard 290 · Cannery 305 · Foundry 325 · Crane Row 345 · Bridge Down 375 | Hunting Rifle, **Sparks** (+30 gems) |
| Mercy Hospital | Parking Deck 395 · ER Lobby 410 · Pharmacy 425 · Quarantine 450 · Helipad Hold 490 | Auto Shotgun, **Juno** (+35 gems) |
| Military Base | Checkpoint Zulu 480 · Barracks 495 · Armory Vault 510 · Runway 525 · Evac 565 | Machine Gun, **the evac** (+60 gems) |

Chapter types are **Run** (reach the safe room), **Horde** (survive the
horde), **Supply run** (find the stash, then reach the safe room) and
**Finale** (beat the Tank and hold out for rescue).

After the evac, the road stays open. The coach then suggests upgrades,
because more power means more stars, and stops still short of 3 stars. Getting 3 stars on every stop of a district pays a mastery
bonus of 25 gems plus twice the finale's supplies.

## Power, squad and guns

- **Power** is the sum of:
  - your survivor: 30 + 14 per level
  - your gun: its base + 15 per level
  - every bot in the squad: 10 + 5 per level

  Everything goes to level 12.
- **Squad**: you plus up to three rescued survivors riding along as bots.
  Each survivor adds their perk for the whole squad, per level:

  | Survivor | Role | Perk per level |
  | --- | --- | --- |
  | Rook | Pointman | move speed +3% |
  | Doc | Medic | max health +4% |
  | Mags | Gunner | damage +3% |
  | Sparks | Engineer | reload speed +4% |
  | Juno | Scavenger | supplies found +4% |

- **Co-op friends** (simulated, up to 3) replace bots from the end of the
  squad. Each one adds +10% supplies and +3% power.
- **Guns**: SMG 30, Pump Shotgun 40, Assault Rifle 52, Hunting Rifle 64,
  Auto Shotgun 78, Machine Gun 92 (base power). A new gun arrives at the
  level of your best gun, so it's always an upgrade. You never have to start
  over at level 1.
- **Costs** run from 30 supplies (level 2) to 1500 (level 12), times a
  multiplier per item. Later survivors and guns cost more, but give more.

## Odds and stars

- Chance to survive = `0.62 + 1.1 × (power / rec − 1)`, clamped to 8–98%
  (`ODDS`).
- Stars for a survived run come from `power / rec` plus noise (σ 0.12):
  - 3★ at 1.25 or more
  - 2★ at 1.05 or more
  - 1★ otherwise
- Star multipliers on supplies are ×1, ×1.3 and ×1.6. A first clear adds
  the chapter's supplies once more.
- **Revive**: 10 / 15 / 20 / 25 / 30 gems by district, once per run, after
  30% of the route. A revived run counts as survived with 1★ (2★ when power
  was well above the recommendation).

## Wait rewards

There are only two, and neither blocks anything.

- **Supply Crate**, the short wait: every 30 minutes, with the first one 3
  minutes in. It holds about 0.6 of a stop's supplies for your current
  district, with an 8% chance of 1–2 gems. It can't be skipped, because it's
  short.
- **Airdrop**, the long wait: every 8 hours. It holds about 3 stops' worth
  of supplies plus 5–10 gems. You can skip the wait for 4 gems per hour
  left, through a confirm dialog that shows the price.

Both scale with your current district, so they stay worth opening.

## Pacing

Recommended power per stop is derived from a target pace
(`evac/tools/derive-recs.mjs`). The balance simulation checks it:
`npm run evac:balance`. The simulated player does 3 sessions a day of 5 runs
each, buys the best upgrades, plays the next stop at 55% odds or better, and
otherwise farms the best replay.

```
Suburbs         cleared after   6 runs  day 1
Downtown        cleared after  13 runs  day 1
Industrial      cleared after  20 runs  day 2
Mercy Hospital  cleared after  29 runs  day 2
Military Base   cleared after  41 runs  day 3
Evac after 41 runs (31 survived, 10 died, 8 revives), ~4 h of play
```

The **Economy** sliders in the testing drawer change rewards, costs and
recommended power live.

## Meta ↔ game contract

This is the seam where the real game plugs in.

- `Meta#loadout()` builds a **RunLoadout** for the next run.
- The meta banks a **RunResult** with `Meta#applyRun()`.
- The simulator (`evac/src/run-sim.js`) produces the same RunResult the game
  should send.

**RunLoadout** (meta → game). Perks are fractions, so `0.12` means +12%:

```json
{
  "chapter": { "index": 7, "campaign": "downtown", "name": "Precinct 9", "type": "rescue", "rec": 225 },
  "survivor": { "id": "rook", "level": 6 },
  "weapon": { "id": "shotgun", "game": "shotgun", "level": 6 },
  "squad": [{ "id": "doc", "level": 4 }],
  "perks": { "moveSpeed": 0.18, "maxHealth": 0.16 },
  "power": 240
}
```

**RunResult** (game → meta):

```json
{
  "index": 7,
  "won": true,
  "stars": 2,
  "progress": 1,
  "kills": 81,
  "timeS": 324,
  "incaps": 1,
  "friends": 0,
  "main": "rook"
}
```

`progress` is how far along the route the squad got (0–1, and 1 on a win).
It sets how many supplies a death keeps.

How the action game would use the contract:

- `chapter.type` picks the mode:
  - `run`: A to B, to a safe room
  - `horde`: hold a spot
  - `rescue`: find the stash, then reach the safe room
  - `finale`: a Tank, then hold out

  `chapter.campaign` picks the map theme, and `rec` sets the Director's
  difficulty.
- `survivor` is the character you play. `squad` lists the AI teammates, who
  are swapped for real players in co-op. `perks` multiply the squad's move
  speed, max health, damage and reload speed. The `supplies` perk is applied
  by the meta, not the game.
- `weapon.game` maps to the game's weapon table. SMG, shotgun, rifle and
  hunting rifle exist today. `auto` and `lmg` are proposals (`game: null`).
  `weapon.level` would scale damage.
- **Stars** in the real game should come from performance, not from power:
  for example, 1★ for reaching the end, plus one star for nobody going down
  and one for beating par time. Power and `rec` are only the simulator's
  stand-in for skill.
- **Revive**: when the whole squad is down after 30% of the route, the game
  pauses and asks. The meta charges the gems (`Meta#revive`), and the run
  continues.

## Testing tools

The gear (top right) or the <kbd>`</kbd> key opens a drawer with:

- **Runs**: by power (the odds shown on each stop), always survive, or
  always die.
- **Time**: warp +10 min, +1 h, +8 h or +1 day, and "Rewards ready".
- **Cheats**:
  - +500 supplies
  - +50 gems
  - clear the next stop with ★★★
  - clear the district
  - max the squad and guns
- **Economy (live)** sliders:
  - run rewards
  - upgrade costs
  - recommended power
  - crate and airdrop intervals
  - volume

  There's also a haptics switch.
- **Pacing log** for each district: runs, play time and real time it took to
  clear.
- **Save**: copy and load the save as JSON, or reset progress (two steps).

`window.__evac` exposes the meta, clock, road, HUD and actions in the
console.

## Playtest checklist

- After five minutes, can you say what you're working toward?
- Did you ever not know what to tap next? Did the coach bubble help, or get
  in the way?
- Did any button seem to do nothing?
- Does a first clear feel like a moment: the drive, the fog lifting, the
  reveal?
- When you died, did you know why, and what to do about it?
- Does the 30-minute crate bring you back? Does the airdrop feel worth a
  daily check?
- Would you spend gems on a revive at a finale? On skipping an airdrop?
- Where does it start to feel grindy? Note the district and the run count
  from the pacing log.

## Code map

```
evac/index.html, evac.css   page shell and styles
evac/src/config.js          all content and numbers: survivors, guns, districts, stops, odds, rewards
evac/src/meta.js            the rules (pure, no DOM): power, upgrades, runs, unlocks, rewards, advice, loadout
evac/src/run-sim.js         simulated run -> RunResult (seeded, pure)
evac/src/save.js            localStorage save + migration; tuning
evac/src/clock.js           real clock with a warp offset; FakeClock for tests
evac/src/main.js            wiring: actions, run -> results -> drive -> reveals, frame loop
evac/src/road.js            the scrolling road: districts, stops, van, squad, zombies, fog, drive cinematic
evac/src/hud.js             power, currencies, crate/airdrop, UPGRADE, goal card, PLAY, coach
evac/src/screens.js         briefing, results, upgrades, reveals, rewards, gem confirm, intro
evac/src/run-view.js        the simulated run screen (portraits, HP, ticker, revive prompt)
evac/src/art.js, icons.js   inline SVG art and icons
evac/src/ui.js, fx.js, audio.js, dev.js   modals and toasts, flying loot, synth sounds, testing drawer
evac/tools/                 balance-sim.mjs (npm run evac:balance), derive-recs.mjs
tests/evac-*.test.js        rules, content and simulator tests
```
