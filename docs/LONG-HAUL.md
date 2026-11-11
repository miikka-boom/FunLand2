# Long Haul (a metagame prototype: No Man's Land × Clash Royale)

A landscape, mobile-first, free-to-play **metagame** prototype, written from
scratch: it shares no code or systems with the earlier metagame prototypes.
Runs are **simulated**. It lives in [`haul/`](../haul) and runs at `/haul/` (on
Pages: `https://miikka-boom.github.io/FunLand2/haul/`, locally
`http://localhost:8080/haul/` with `npm start`).

> Three go out. Whoever's still standing carries a crate home.

## The brief, and the idea

The brief was "a simple and satisfying combination of The Walking Dead: No
Man's Land and Clash Royale". Each game has a few things everyone remembers:

| The Walking Dead: No Man's Land | Clash Royale |
|---|---|
| A camp you come home to | Cards you collect copies of and level up with gold |
| A squad of three survivors with classes | Three crowns a battle |
| Nine crates after a mission, pick three | Chests in slots, opening on a timer |
| Radio calls that bring new survivors | Trophies that open arenas, arenas that unlock cards |

Long Haul keeps all eight by letting each rule do two jobs:

- **Stars are the survivors still standing, and each one is a crate pick.**
  Three go out; everyone on their feet at the end carries one crate home. So
  Clash Royale's three crowns are No Man's Land's three picks from nine, and
  you can see why: count the people standing.
- **Survivors are cards.** A fixed cast of twelve (No Man's Land's heroes),
  levelled with their own tokens plus supplies (Clash Royale's copies plus
  gold), in four rarities.
- **The radio rack is the chest slots.** Radios turn up in crates, the rack
  holds three and calls with one at a time, and a call takes hours. What comes
  out is a person.
- **The road is the ladder.** Stars add up and take you through six stops;
  each one is more dangerous, has richer crates, and puts new voices on the
  radio.

And it stays simple by leaving out everything else (see
[What was left out](#what-was-left-out-on-purpose)): one currency, no
buildings to upgrade, no energy, no premium currency, no counters to learn.

## The whole game

| | What you do | What happens |
|---|---|---|
| **PLAY** | Send the squad of three out | A run of about six seconds. Everyone still standing at the end is a star: 0 to 3. |
| **PICK** | Tap crates on the pallet, one per star | Each opens at once: supplies, tokens for someone, or the radio. |
| **LEVEL UP** | Tap a survivor whose token bar is full | Tokens and supplies are spent; their power goes up, so they stay standing more often. |
| **ANSWER** | Tap the radio tent when someone answers | A new survivor moves in, or someone you know sends tokens. |

One thing happens by itself: **the road**. Stars add up; at 12, 40, 90, 160 and
250 the squad moves on to the next stop.

```
            ┌────────────────────────────── stars ──► the road: 6 stops, then the ferry
            │                                             (danger ↑, crates ↑, new voices)
  PLAY ─► who's standing? ─► PICK that many of 9 crates
   ▲                             │        │         │
   │                         supplies   tokens    a radio ─► the rack (3) ─► a call (3 h)
   │                             └────┬───┘                                     │
   └──── stronger squad ◄──── LEVEL UP ◄──── tokens ◄──── someone you know ◄────┤
                                                          someone new moves in ◄┘
```

## The run

`Game.play()` decides it; the six seconds you watch only show it.

- Power = round((10 + 4 × (level − 1)) × rarity), rarity being ×1 Common,
  ×1.15 Rare, ×1.3 Epic, ×1.5 Legendary. A Common is 10 at level 1 and 46 at
  level 10; a levelled Common beats a fresh Legendary.
- Each stop has a **danger** number. For each of the three:
  effective power = 75% their own + 25% the squad's average (the others watch
  your back), and the chance they are still standing is
  `clamp(0.5 + 1.2 × (effective / danger − 1), 8%, 95%)`. Power equal to the
  danger is a coin flip; a third more is as safe as it gets.
- The squad cards show power in a colour: green (Solid, 85%+), olive (Good,
  60%+), orange (Shaky, 35%+), red (Risky). PLAY shows the danger. So the
  whole question before a run is "is my number bigger than that number?".
- The very first run always brings all three home.
- Nobody standing: no crates, no stars, a handful of scraps (6 × the stop's
  loot). It happens on about 2% of runs.
- Because each survivor's own power decides whether *they* come back, a squad
  with one weak member reliably loses that member's crate. Levelling evenly
  beats pouring everything into one hero.

In the playback the squad runs in, drowsers (people who stopped sleeping, in
whatever they were wearing) shuffle in from the right and get dropped: rifles
and revolvers crack, the staple gun staples, hockey sticks and shovels swing,
Biscuit bites ankles. Whoever was fated to go down is swarmed near the end and
sits out the rest seeing stars. Everyone else lifts a crate over their head
and a star slams in for each. From the second run on, a tap skips it.

## The haul: nine crates

| Crates | What is inside |
|---|---|
| 3 small | 8–12 supplies × the stop's loot |
| 2 medium | 20–28 supplies × loot |
| 3 token stacks | 2–3 tokens for one survivor, growing to 4–5 by Pier 9 (× 0.75 for a Rare, × 0.5 Epic, × 0.25 Legendary, never fewer than 1). 65% of the time for someone in the squad, otherwise for someone else in the camp. |
| 1 special | **A radio**, while the rack has room. With the rack full: the **gold crate**, 60–80 supplies × loot. |

- All nine look the same until opened. A crate turns out to be **wood**,
  **steel** or **gold** as its lid flies off; what was inside is yours at once
  and flies to the wallet or to the survivor's bar.
- So every haul hides one radio (or one gold crate), and three picks find it
  one time in three. Stars are chances.
- When the picks are used up, the crates left behind show what they held
  (dimmed). That teaches the odds and makes a third star worth wanting; the
  testing drawer can turn it off to compare.
- On 4% of hauls one small crate is a second gold one.
- The first haul is scripted, whichever crates are tapped: supplies, then two
  tokens that fill the first survivor's bar, then the radio. One of each, and
  a level-up waiting back at camp.
- Tokens for someone at the top level turn into supplies.
- The summary's left button is the best next step: LEVEL UP (someone's name)
  when anyone can, CAMP otherwise. The right one is PLAY AGAIN.

## Survivors

Twelve fixed people, two of each class. Class is the weapon and how they fight
in the playback; power is what counts. They are the people of this repo's
action game, *We Left Ben*: the squad, and the ones who signed the walls.

| | Class | Rarity | Voice first heard at | |
|---|---|---|---|---|
| Odile | Hunter | Common | in the camp from the start | "Day 41. Still writing it all down." |
| Teo | Scout | Common | in the camp from the start | "I can hotwire that. (He can't. — Mags)" |
| Mags | Bruiser | Common | in the camp from the start | "I was here first." |
| Gary | Warrior | Common | Suburbia | "Employee of the month. Again." |
| Deb | Assault | Common | Suburbia | "That was MY yogurt." |
| Big Lou | Shooter | Rare | Suburbia (always the first call) | "That's 113. I counted." |
| The Caretaker | Warrior | Rare | The Graveyard | "Plot 14 is empty again." |
| Rusty | Bruiser | Rare | The Junkyard | "U-pull-it. I-bonk-it." |
| Biscuit | Scout | Epic | The Junkyard | "Good boy. Snores. Bites ankles." |
| DJ Dawn | Shooter | Epic | Center City | "Traffic and drowsers on the 2s." |
| The Tinkerer | Assault | Legendary | Center City | "Loud = bad. Cans = dinner." |
| The Harbour Master | Hunter | Rare | Market Street | "No flare, no ferry." |

| To reach level | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|
| Tokens | 2 | 3 | 4 | 6 | 8 | 10 | 13 | 16 | 20 |
| Supplies | 15 | 30 | 65 | 120 | 200 | 310 | 460 | 660 | 920 |

- Tokens are personal (Odile's tokens level Odile). Spare ones carry over.
- **The squad**: three cards along the bottom. Tap one for its sheet. To swap
  someone in: EVERYONE, tap their card, PUT IN THE SQUAD, tap who sits out.
  EVERYONE also has SEND THE STRONGEST THREE, and marks anyone on the bench who
  is STRONGER than the weakest of the squad.
- Rarer survivors are stronger at the same level and get smaller token stacks,
  so they level more slowly: a Legendary is a long project, a Common is quick.

## The radio

- The rack holds **three radios**. The tent calls with one at a time, in the
  order they were found; a call takes **3 hours** (the first three ever take 12
  seconds, 90 seconds and 10 minutes, so the first session sees two or three
  answers). Calls go on while you are away, so six hours later there can be
  two answers waiting.
- A call that has its answer keeps its place on the rack until you tap it. With
  three on the rack no radios turn up in crates: play as much as you like, but
  new people come at the radio's pace. That is the Clash Royale chest-slot
  rule, with nothing to start by hand and nothing to choose.
- **Who answers.** A rarity is rolled by weight (Common 55, Rare 30, Epic 12,
  Legendary 3, among the rarities out there so far), then someone of that
  rarity whose voice is at a stop you have reached.
  - Someone new moves in, about a level below the squad's average (Epics and
    the Legendary at the average), so they are worth trying at once.
  - Someone you know sends a package: three crate-stacks of their tokens.
- **Sure things.** The first call is always Big Lou. The first three calls,
  and the first call after each new stop, reach someone new while anyone is
  out there (never the Legendary: that one is luck, or the pity count of 14
  calls after Center City).
- The reveal: static and half a sentence, a shape in the rarity's colour (it
  rumbles for an Epic and takes its time for the Legendary), then who it is,
  with INTO THE SQUAD (for the weakest) when they are stronger.

## The road to Pier 9

The six stops are the six maps of *We Left Ben*, in the order the squad meets
them on the way to the ferry.

| Stop | Stars | Danger | Crates | New voices |
|---|---|---|---|---|
| 1 Suburbia (the lawns of Delco) | 0 | 8 | ×1 | Gary, Deb, Big Lou |
| 2 The Graveyard (Wissahickon Hill) | 12 | 14 | ×1.6 | The Caretaker |
| 3 The Junkyard (Cracked Bell Auto Salvage) | 40 | 21 | ×2.4 | Rusty, Biscuit |
| 4 Center City (after dark) | 90 | 28 | ×3.5 | DJ Dawn, The Tinkerer |
| 5 Market Street (the 14th floor) | 160 | 36 | ×5 | The Harbour Master |
| 6 Pier 9 (the last ferry) | 250 | 44 | ×7 | |
| The ferry (the LIBERTY BELLE) | 360 | | | the end of the prototype; play goes on |

Stars are never lost. A new stop is a step up (about 1.8 stars a run on
arrival, where the last runs at the stop before brought 2.8), and it pays for
itself: richer crates, and the next call reaches someone new.

## The camp

One scene at dusk that fits the whole screen: the radio tent and its mast on
the left (waves at the top while a call is going, a bubble with the time left,
SOMEONE ANSWERED! when it is done), the fire in the middle with everyone not in
the squad around it, a tent for every two people, the squad by the truck on the
right, and the gate with PIER 9 sprayed on a plank. People say things now and
then ("113." "Lou can't count."). Tap anyone for their sheet, the tent for the
rack, the truck to play.

The HUD: where you are on the road (top left), supplies and the gear (top
right), EVERYONE, the three squad cards and PLAY (bottom).

A hand points the way in the first session only (PLAY, the level-up, the radio,
a stronger newcomer); it stops after four runs, two level-ups and a call. After
that the glows do it: a green card with an arrow can level up, the radio bubble
bounces, EVERYONE gets a dot.

## Surprises

| Moment | How often |
|---|---|
| The radio in a crate | every haul hides one while the rack has room: 1 pick in 9 |
| The gold crate | every haul while the rack is full, and a second one on 4% of hauls |
| Two little eyes scratched into the pallet, beside the special crate and looking at it | 7% of hauls. Nobody says who draws them. |
| An Epic on the radio | 12 in 100 calls once one is out there |
| The Legendary | 3 in 100, or by the 14th call after Center City |
| A crate at the gate with a few words on it in orange crayon ("found this.") | 30% of returns after an hour or more away |

The last two rows of flavour come from *We Left Ben*: Ben's crayon, and the
eyes that always look at something. Like there, nothing explains them.

## Pacing

`npm run haul:balance` plays 20 seeded players for 10 days of 4 sessions × 4
runs. Between runs they answer every call, level up whoever can (squad first)
and send the strongest three; they pick crates blind.

```
Stop                 opens at run (day)      stars a run on arrival   on leaving
1 Suburbia             0 (0-0) day 1           2.4                      2.8
2 The Graveyard        5 (4-6) day 1           1.7                      2.8
3 The Junkyard        17 (14-21) day 2         1.7                      2.8
4 Center City         39 (34-56) day 3         1.8                      2.7
5 Market Street       68 (61-84) day 5         1.8                      2.8
6 Pier 9             106 (99-123) day 7        2.0                        -
  the ferry          150 (148-157)   (14 of 20 seeds within 10 days)

Day  runs  stop  stars  people  squad Lv  earned  spent  in hand  radios  calls  runs by stars 0/1/2/3
  1    16     2     39       7       3.3     501    275      281       5      4  0/2/6/9
  2    32     3     72       8       5.0    1349    865      461       9      7  1/5/12/14
  3    48     4    109       9       6.0    2493   1975      683      13     12  1/7/16/24
  5    80     5    188      11       7.3    5528   5160      416      21     19  2/10/29/41
  7   112     6    266      12       8.0   10171   9090      645      29     27  3/14/39/58
 10   160     6    381      12       9.3   19269  17785      658      40     38  3/19/60/82
```

- A new stop on days 1, 2, 3, 5 and 7; the ferry around day 10.
- About 2.3 stars a run; half the runs bring all three home, 2% bring nobody.
- A level-up after the first run, someone new by the second, the first Epic
  around run 36, the Legendary around run 96, the whole cast by day 7.
- Supplies are the tighter half of a level-up about a fifth of the time (a
  full bar waiting for supplies on 21% of runs); otherwise tokens are.
- At this pace the rack is full on 4% of runs. Forty runs in one sitting fills
  it on half of them: the rack paces people who binge and stays out of the way
  of everyone else.
- `--lazy` never levels up or changes the squad: Suburbia goes fine, the
  Graveyard brings half a star a run, and the Junkyard takes four days.
- `--seeds`, `--days`, `--sessions` and `--runs` change the run.

## What was left out, on purpose

Camp buildings and upgrades, building timers, energy (gas), injuries and the
hospital, weapons and armour, traits, classes as counters, a premium currency,
speeding anything up, opening more crates for a price (No Man's Land's "open 3
more" would sit on the haul screen; the radio rack is where a speed-up would
go), a shop, quests, a pass, guilds, losing stars, picking which stop to play.

Things it would be natural to try next: one line of text per survivor that
does something you can see (a Scout who peeks into a crate before you pick),
and a slow second sink for supplies in the camp.

## Testing tools

The gear (top right) or the `` ` `` key:

- **Runs**: by the odds, or exactly 3, 2, 1 or 0 standing on every run; two
  little eyes on the next haul; a second gold crate.
- **The radio**: +10 minutes, +1 hour, +3 hours, +1 day; every call answered
  now; +1 radio; who answers the next call (someone new, or a rarity).
- **Cheats**: supplies, fill the squad's bars, everyone +1 level, everyone
  moves in, +5 stars, to the next stop, a crate at the gate.
- **Economy (live)**: sliders for supplies, tokens, danger, call time, volume;
  switches for showing the crates left behind and for haptics.
- Stats, and copy / load / reset for the save.

Keys: Space or Enter plays, Esc closes, M mutes. `window.__haul` has the game
in the console.

## Playtest checklist

- Is it clear, without being told, why you got two picks and not three?
- Do you look at the number on PLAY and the numbers on your cards before a run?
- Does picking feel like yours, or like a formality? Do you hunt for the radio?
- Does seeing what was in the other crates make you want the third star, or
  just annoy you? (Turn it off in the drawer and compare.)
- When someone goes down, do you level them up, swap them out, or shrug?
- Do you remember anyone's name? Who do you want to answer next?
- Does "SOMEONE ANSWERED!" pull you back in a few hours?
- Did you notice the eyes? Did you follow them?

## Code map

```
haul/
  index.html, haul.css        the page and its styles
  src/config.js               every number and every piece of content
  src/rules.js                the rules (no DOM): runs, crates, levels, the squad, the radio, the road, hints, cheats
  src/save.js, clock.js       the save (localStorage, with repair) and the game clock
  src/main.js                 boot, and every flow between the screens
  src/camp.js, camp-art.js    the camp: fitting the scene, who stands where, the rack and its bubble; the scene itself
  src/hud.js                  the road chip, supplies, EVERYONE, the squad cards, PLAY, the pointing hand
  src/sheets.js               the welcome card, a survivor, everyone, the road, the radio tent
  src/run-view.js             the run you watch (a small timeline; skipping is the same timeline, fast)
  src/pick-view.js            the haul: nine crates
  src/moments.js              someone answered, a new stop, the ferry
  src/figures.js              the twelve survivors, the drowsers and the dog, from the looks in config.js
  src/area-art.js             a backdrop for each stop
  src/crate-art.js, icons.js  crates, tins, the radio, the eyes; interface icons
  src/audio.js                every sound, synthesised (no files)
  src/fx.js, ui.js            flying loot, bursts, confetti; the DOM toolkit and shared pieces
  src/dev.js                  the testing drawer
  src/util.js, format.js      seeded random streams; numbers and times as text
  tools/player.mjs            the simulated player
  tools/balance-sim.mjs       npm run haul:balance
```

Tests: `tests/haul-rules.test.js` (the rules, saves and pacing) and
`tests/haul-art.test.js` (every piece of art and every sheet is well-formed,
every sound played exists, every button's action is handled).
