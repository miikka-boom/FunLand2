# Safehouse metagame (prototype)

A small metagame prototype built from the design doc *Safehouse:
Meta-Progression Design for a Co-op Zombie Mobile Game*. It lives in
[`safehouse/`](../safehouse) and runs as its own page: `/safehouse/` on GitHub
Pages, or `http://localhost:8080/safehouse/` with `npm start`.

It isn't connected to the action game: **PLAY** runs a simulated mission in
place of a real one.

The first build followed the whole doc (8 stations × 5 levels, four
resources, power and Fuel, bonds, daily orders, co-op…) and played as far too
complex. This version keeps the loop the doc's MVP set out to test: mission →
craft and upgrade → a better mission. It cuts everything else.

## The loop

1. **Play** the next mission. Scrap is banked at each of its three safe
   rooms, so a wipe keeps what was already banked.
2. **Spend** Scrap: build or upgrade a room, or craft a throwable or a heal.
3. **Play** again, stronger. Short crafts finish during the mission (a
   mission moves the clock on by its 5-7 minutes), and long upgrades finish
   between sessions.

## The rules

- **One resource: Scrap.**
- **Four rooms**, each answering one of the questions the doc says a squad
  asks before a mission:

  | Room | Question | What its levels give |
  |---|---|---|
  | Workshop | What do we carry? | Throwables: pipe bomb, molotov, lure flare |
  | Infirmary | How do we heal? | Heals: pain pills, first-aid kit, defibrillator |
  | Barracks | Who comes with us? | 1, 2, 3 bunks (pre-built at level 1) |
  | Radio Room | Where do we go next? | Opens chapters 2, 3 and 4 |

- **Three levels per room**, on the doc's base ladder: 100 Scrap and
  instant, 250 and 10 minutes, 600 and 1 hour. One upgrade runs at a time;
  the instant first levels don't wait for it. Every level adds +4 squad
  strength.
- **Crafting**: each crafting room makes its best item, one at a time. The
  crate holds up to 3 throwables and 3 heals. A mission takes the best of
  each along:
  - the throwable is used on the hardest stretch and cuts its danger by
    15%, 22% or 30%;
  - the heal is used only if a stretch goes wrong, and saves it 35% or 65%
    of the time (the defibrillator always saves it);
  - whatever isn't used stays in the crate.
- **Squad**: you (40 strength), plus up to three named survivors (30 each),
  plus bots (20) in any empty slots. Each survivor has one perk:
  - Nadia, a paramedic, is there from the start. Heals save 20% more often.
  - Theo, a chemistry teacher, is rescued in the chapter 1 finale.
    Throwables work 50% better.
  - Grace, a range officer, is rescued in the chapter 2 finale. +10% squad
    strength.

  A rescued survivor waits until the Barracks has a bunk for them.
- **Missions**: 12 missions in 4 chapters, played in order, from danger 95
  up to 190. The card shows the clear chance, worked out by simulating the
  mission 200 times. While the Radio Room hasn't opened the next chapter,
  PLAY replays the last mission for Scrap.
- **Nothing decays.** Timers also finish while the page is closed. The first
  mission always clears.

## The simulated mission

[`mission-sim.js`](../safehouse/src/mission-sim.js) is pure and seeded.

- Each mission has three stretches: Streets, Horde, then Way out (or
  Finale, which is harder).
- Each stretch clears with chance `0.8 + (strength / danger − 1)`, clamped
  to 5-97%.
- Every stretch that clears banks its share of the Scrap: 30%, 30% and 40%.

## What was cut from the design doc

Each of these could come back one at a time if playtests ask for it:

- the Barricade gate, the Generator with power capacity and Fuel, the
  Armory and its weapon upgrades, and the Scrap Yard;
- Parts, Supplies, Fuel, storage caps and overflow;
- boosts, loadout presets and job queues;
- bonds, reserve bunks, bond chapters, Radio Room daily orders and rescue
  calls;
- the simulated co-op friend and the build-finished notification;
- the five-stage progression flow, replaced by a one-line hint.

## Pacing

`npm run safehouse:balance` plays a scripted player.

- **One sitting of 15 missions:** about 1.5 hours of in-game time. It clears
  chapters 1-3. Chapter 4 waits for the 1-hour Radio Room upgrade, which
  finishes between sessions.
- **Three short sessions a day:** all 12 missions are cleared on day 2,
  with about one wipe in ten missions.

## Testing tools

The gear (top right) can:

- skip 10 minutes or an hour;
- add 500 Scrap;
- finish all timers;
- force missions to always clear or always wipe;
- reset progress.

[`tests/safehouse.test.js`](../tests/safehouse.test.js) covers the rules, the
simulator and the content tables, and has a scripted player finish the whole
campaign.

## Code map

```
safehouse/index.html, safehouse.css   page shell and styles (landscape and portrait)
safehouse/src/config.js        all numbers: rooms, items, survivors, missions
safehouse/src/story.js         intro, rescues, survivor lines, mission feed
safehouse/src/economy.js       state + rules (pure, no DOM, unit tested)
safehouse/src/mission-sim.js   simulated mission
safehouse/src/main.js          boot, frame loop, saving, actions
safehouse/src/view.js          the one screen: rooms, Scrap, next-mission card, hint
safehouse/src/sheets.js        room sheet, results, rescue scene, intro, testing tools
safehouse/src/mission-view.js  mission playback
safehouse/src/ui.js, fx.js, audio.js            layers and toasts; flying Scrap; sounds
safehouse/src/art.js, portraits.js, icons.js    procedural SVG rooms, faces, icons
safehouse/tools/balance-sim.mjs                 pacing check (npm run safehouse:balance)
```

`window.__safehouse` exposes the Safehouse, the clock and the actions in the
browser console.
