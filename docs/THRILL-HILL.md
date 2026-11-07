# Thrill Hill (metagame prototype)

A landscape, mobile-first, free-to-play **metagame** prototype, built on its
own: raids are **simulated**, and nothing here is connected to the HORDE action
game or to the other prototypes. It lives in [`thrill/`](../thrill) and runs at
`/thrill/` (on Pages: `https://miikka-boom.github.io/FunLand2/thrill/`, locally
`http://localhost:8080/thrill/` with `npm start`).

> A sunny theme park on a hill above a town full of zombies. Two chests bring
> people and Badges. Raids bring coins and Skulls. Coins pay for everything.

## The brief, and what this one does differently

The brief was a metagame **inspired by Clash Royale** with **a static short-wait
chest and a static long-wait chest instead of chest slots**, **base building**,
**randomly generated characters who live in the base**, and **choosing who you
play with each run** from them. It should feel **satisfying, simple,
rewarding and surprising from time to time**.

The earlier zombie metagame prototypes (Hope Street, Road to Evac, the
Safehouse, the camp) didn't satisfy, so Thrill Hill deliberately does not reuse
their systems:

- **No beds, no turning people away, no farewells.** Everyone a chest brings
  moves in, the way a new card joins a Clash Royale collection.
- **No "survive or die" run.** A raid is three waves and every wave you clear
  earns a **crown** (0–3), Clash Royale style. Partial raids still pay.
- **No XP from runs, no coach that follows you around.** Levels come from
  personal **Badge bars** filled by chests (the Clash Royale card-copy loop),
  and the pointing hand only guides the first session.
- A new place and tone: bright, chunky and toy-like, in daylight.

The design came out of a panel of four independent proposals (simplicity,
surprise, base building, Clash Royale fidelity), scored by three judges and
merged; the rules were then reworked after the feedback above.

## The loop

```
   Supply Crate (2 h)  ─┐                      ┌─► level up (Badges + coins)
   Ticket Vault (8 h)  ─┴─► newcomers move in ─┤
                            Badges for the squad └─► squad of 3 ─► RAID (3 waves)
                                                                     │
   buildings (coins) ◄──── coins ◄──── crowns ─► Skulls ─► zones, milestones, gate gifts
```

1. **Open** a chest that says OPEN!: knock three times, collect, meet the newcomer.
2. **Level up** anyone with a green arrow (their Badge bar is full: READY).
3. **Upgrade** a building with a green arrow over it. Upgrades are instant.
4. **Check the squad**: the next threat sits above PLAY, counters glow ×1.5,
   and **BEST** pulses when a stronger squad is available.
5. **PLAY** a raid (about 6 seconds; tap to speed up, Skip from the 3rd raid).
6. **PLAY AGAIN** from the results, or go back to the park.

A 3-minute session is a chest, a level-up or two, a building and 4–5 raids.

## The two chests

Both live in the bottom corners of the main screen, CR style, but there are no
slots and no queue: raids never give chests, a chest never stacks, and both are
ready on the first visit. Opening one late costs nothing: up to a quarter of a
period of lateness comes off the next wait. A device clock that jumps back can
never make a wait longer. Tapping a waiting chest opens its sheet: contents,
every odds table, the Legend pity count, **Upgrade** and **Open now** (1 gem
per 10 minutes left).

| | **Supply Crate** (short) | **Ticket Vault** (long) |
|---|---|---|
| Timer | 2 h | 8 h |
| Coins | 40 × level (±15%) | 160 × level (±15%) |
| Badges | a stack for each squad member: 2 + level (±1) | a stack for each squad member: 6 + 2 × level (±2) |
| Newcomers | 22% + 4% per level chance of one | one, Veteran or better; a second (Crate odds) from Lv 5 |
| Rarity odds | Lv 1 65 / 28 / 6 / 1 → Lv 7 41 / 40 / 15 / 4 | Lv 1 – / 72 / 24 / 4 → Lv 7 – / 54 / 36 / 10 |
| Gems | 15% chance of 2–4 | 6 + level |
| Finisher | | 8 + 2 × level Badges for whoever is closest to READY (topped up to exactly what they need, if 20 or less): every Vault ends on a READY |
| Open now cap | 12 gems | 48 gems |

**Glow-Up.** The three knocks each have a 12% chance (+1% per chest level) to
lift the chest a grade. The grade is rolled when you tap and only revealed by
the knocks.

| Grade | Loot | Newcomer | Odds at Lv 1 |
|---|---|---|---|
| Silver | ×1.5 | at least Veteran (a Crate with nobody inside gets someone) | 32% Silver or better |
| Gold | ×2 | at least Hero | 4% |
| Rainbow | ×3 | a Legend | 1 in 579 |

A Legend is guaranteed by the 30th chest newcomer without one.

**The opening, beat by beat:** the park dims and residents crowd the edges;
"Tap to knock!" ×3 (thunk, bounce, light from the seams; a Glow-Up flashes the
chest to its new skin with a banner and a chord); the lid bursts; coins roll
into the wallet; Badge stacks fly onto the squad's faces (READY stamps); each
newcomer card drops face down with an honest rarity glow and flips with drama
to match (a Hero rumbles, a Legend gets a blackout, a drumroll and two spins, a
golden survivor gets "…wait."); MOVES IN!; the Vault's finisher; a summary
whose big button is the best next step ("LEVEL UP Mikko").

## Survivors

Everyone is generated from a seeded stream (`thrill/src/people.js`): name
(international pool, Finnish names included), age, old job that fits the class
("Fry cook", "Rodeo clown", "Coaster engineer"), a quirk line, a vibe, and a
look (3 builds, 6 skin tones, 3 face shapes, 10 hairstyles, natural or dyed
hair, 8 hats including a rare mascot head, eyes, mouths, glasses, freckles,
beards, an eyepatch…, and a class prop). Legends, and half the Heroes, get a
nickname ("Hotshot Sal", "Turbo Gran"). `thrill/src/portrait.js` draws the
card portrait and the little park figure from the same look.

| Class | Counters (×1.5 power) | Ride | Opens |
|---|---|---|---|
| Brawler | Runners | High Striker | start |
| Shooter | Brutes | Shooting Gallery | start |
| Medic | Spitters | First Aid Tent | Zone 2 |
| Tinker | Hordes | Bumper Garage | Zone 3 |

| Rarity | Power × | Arrives at | Perk |
|---|---|---|---|
| Rookie | 1.0 | squad average level − 2 | none |
| Veteran | 1.15 | − 1 | ×1 |
| Hero | 1.3 | same | ×2 |
| Legend | 1.5 | + 1 | ×3 |

Power = (10 + 3 × (level − 1)) × rarity × (1 + 10% per ride level) × 1.2 if
golden. A levelled Rookie still beats a fresh Legend, so nobody is fodder.
Newcomers arrive with a half-full Badge bar and lean toward the classes you
have fewest of.

**Perks** (one each, Veteran and up, squad only; Veteran value shown, ×2 Hero,
×3 Legend): Lucky (+10% raid coins), Cheer (+4% squad power), Scavenger (+3 pts
stray chance), Gem Nose (5% chance of +3 gems on a 2+ crown raid), Clutch (+10
pts clutch-save chance). **Vibes** are behaviour only: Sunny waves and brings
gifts, Sleepy naps on the Big Top steps, Show-offs perform at their ride, Jumpy
ones jump when a zombie bumps the wall.

**Badges and levels.** Badges are personal: chests give them to whoever is in
the squad, so who you play with is who grows. A full bar is READY; LEVEL UP
spends the Badges plus coins. Extra Badges carry over ("READY ×2"); Badges for
someone at Lv 10 turn into coins.

| To level | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|
| Badges | 3 | 8 | 14 | 22 | 34 | 50 | 70 | 95 | 125 |
| Coins | 20 | 50 | 100 | 200 | 400 | 650 | 950 | 1,300 | 1,800 |

## The park (base building)

One landscape scene that never scrolls: the Ferris wheel in the middle lights a
gondola for each zone reached, rides change look at Lv 3 and Lv 5 (patched
junk → fresh paint and bulbs → neon, flags and confetti cannons), locked rides
wait under a tarp, the squad waits by the tram, everyone wanders by their vibe,
zombies bump the bumper-car wall (tap one: BONK, it falls over), and each zone
drops a souvenir (a giant donut, a mall fountain, an anchor, a scoreboard, a
jet nose cone). Tap a building to see what the next level does.

| Building | Does | Opens |
|---|---|---|
| Supply Crate / Ticket Vault | better chests (more loot, newcomers, Glow-Ups) | start |
| Big Top | +10% raid coins per level above 1 | start |
| High Striker, Shooting Gallery | +10% Brawler / Shooter power per level | start |
| First Aid Tent | +10% Medic power per level | Zone 2 |
| Bumper Garage | +10% Tinker power per level | Zone 3 |

Every upgrade is instant: 100, 250, 550, 1,000, 1,800, 3,000 coins for levels
2–7. A building's max level is your zone + 1.

## Raids, crowns and the Skull ladder

A raid is three waves at 50%, 75% and 100% of the zone's threat T. The chance
to clear a wave is `clamp(0.5 + 0.9 × (S / (T × wave) − 1), 5%, 97%)`, where S
is the squad's power; the raid stops at the first wave it can't clear. Each
cleared wave is a crown. PLAY shows three crowns filled by their chances and a
label from the chance of all three (Easy 60%+, Good 35%+, Tough 15%+, Risky).
The crew screen shows each wave's chance.

| Crowns | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Skulls | −10 | +10 | +20 | +30 |
| Coins (× zone base 15 + 8 × zone) | ×0.4 | ×0.7 | ×1 | ×1.3 |

- **Clutch:** a near miss on the big one (within 10 points) is saved 35% of
  the time (+ Clutch perks): slow motion and a banner made from the hero's
  name and prop ("MIKKO BONKS THE RUNNER INTO THE DUCK POND!").
- **Rally:** after two raids in a row with fewer than two crowns, the next one
  is easier (threat ×0.8) and pays double coins.
- **The first raid** always gets three crowns.
- A bad raid names **one fix** with a button: swap in a counter, level someone
  up, or upgrade their ride.

| Zone | Skulls | Threat | Opens | Gate gift |
|---|---|---|---|---|
| 1 Picnic Grove | 0 | 36 | Brawlers, Shooters; Runners, Brutes | |
| 2 Suburbs | 100 | 70 | Medics, First Aid Tent; Spitters | a Veteran Medic |
| 3 Shopping Mall | 350 | 95 | Tinkers, Bumper Garage; Hordes | a Veteran Tinker |
| 4 Harbor | 900 | 200 | two threats per raid | a Legend |
| 5 Stadium | 1,600 | 275 | | a golden Hero |
| 6 Airport | 2,500 | 370 | the last zone | a golden Legend |

Every gate also gives 20 gems, +1 building max level, a souvenir and a lit
gondola. You never drop below a zone you reached. **Milestones** every 50
Skulls between gates (every 100 after the last) cycle through coins (60 ×
zone), a Badge stack for each squad member (4 + 2 × zone) and 10 gems.

## Currencies and free-to-play

- **Coins** (raids, chests, milestones, gifts) pay for every level-up and
  building: the bottleneck, as gold is in Clash Royale.
- **Badges** are personal, on each survivor's bar, never in the wallet.
- **Gems** (the Vault, milestones, gates, golden zombies, Gem Nose, gifts) do
  one thing: open a chest now. A shipped game would sell gems only; the
  prototype has no store.
- **Skulls** are a score and never spent.

## Surprises

| Moment | How often |
|---|---|
| Silver Glow-Up | 32% of chests (45% at Lv 7) |
| Gold Glow-Up | 4% (8.6% at Lv 7) |
| Rainbow Glow-Up: a guaranteed Legend | 1 in 579 (1 in 170 at Lv 7) |
| A Legend | 1–4% of Crate newcomers, 4–10% of Vault newcomers, pity at 30, two gate gifts |
| A golden survivor ("…wait.", ×1.2 power) | 2.5% of newcomers |
| Siblings (same surname and hat, +10% together in a squad) | 8% of newcomers once 4+ people live in the park |
| A mascot head | 5% of people |
| A golden zombie in wave 2: ×2 coins and +3 gems if you clear it | 1 raid in 15 |
| A stray follows you home | 4% of 3-crown raids (+ Scavenger) |
| A clutch save | near misses on the big one |
| A resident walks up with a gift | 30% of returns after an hour away |

## Pacing

`npm run thrill:balance` simulates players (4 sessions a day of 4 raids, who
open every chest, level up whoever is READY, upgrade, take BEST and play).
Over 20 seeds:

```
Zone              opens at raid (day)    3-crown chance on arrival   on leaving
2 Suburbs              4 (4-4) day 1     48%                         91%
3 Shopping Mall       13 (12-14) day 1   40%                         91%
4 Harbor              33 (31-37) day 3   33%                         70%
5 Stadium             66 (59-69) day 5   31%                         64%
6 Airport            105 (97-110) day 7  34%

Day  raids  zone  people  squad Lv  coins earned
  1     16     3      10       4.3          1957
  3     48     4      21       6.3          8178
  7    112     6      43       8.7         25506
```

The odds dip at every gate and climb back as you level and build. `--lazy`
plays someone who never levels or builds: they still climb, slowly, at a few
percent per raid. `--seeds`, `--days` and `--raids` change the run.

## Testing tools

The gear (top right) or the <kbd>`</kbd> key opens the drawer: time warp (+10
min to +1 day, chests ready now), the next chest's grade and newcomer rarity,
golden, sibling, raid outcomes (by the odds, 3/2/1/0 crowns, clutch), a golden
zombie, a stray, a gift now, cheats (coins, gems, Badges, squad READY, max
buildings, set Skulls to any gate), live sliders (coins, Badges, threat,
Glow-Up chance, chest timers, volume), stats, the zone pacing log and save
tools (copy, load, two-step reset). <kbd>M</kbd> mutes. `window.__thrill`
exposes the rules, clock, HUD and park.

## Playtest checklist

- Does the first chest opening make you grin? Do you look forward to the knocks?
- Do you read a newcomer's card, or skim it? Do you remember anyone's name?
- Do you change the squad on purpose (a counter, a sibling, someone close to
  READY), or just hit BEST?
- Does chasing three crowns pull you into "one more raid"?
- Which building do you upgrade first, and why?
- Do the 2 h and 8 h chests bring you back, or feel like a wall?
- Did anything surprise you in the first 15 minutes? In the first day?

## Code map

```
thrill/index.html, thrill.css   page shell and styles
thrill/src/config.js            every number and piece of content
thrill/src/people.js            the survivor generator (pure, seeded)
thrill/src/raid.js, chests.js   power, crown odds; chest odds, Glow-Up odds, timers
thrill/src/meta.js              the rules (no DOM): chests, survivors, levels, buildings, raids, the ladder, gifts, advice
thrill/src/save.js              localStorage save + migration
thrill/src/art.js               the park, rides by level, the wheel, souvenirs, zombies, raid backdrops
thrill/src/portrait.js          portraits and park figures from a look
thrill/src/chest-art.js         both chests in every grade, Badge tokens, coins, gems
thrill/src/icons.js, audio.js   UI icons; WebAudio-synthesised sounds
thrill/src/park.js, hud.js      the living park; the top bar and the bottom row
thrill/src/opening.js           the chest opening and the newcomer reveal
thrill/src/raid-view.js         the raid playback and results
thrill/src/crew.js, sheets.js   the crew screen; survivor, building, chest and ladder sheets
thrill/src/main.js, dev.js      wiring and the frame loop; the testing drawer
thrill/tools/                   player.mjs (the simulated player), balance-sim.mjs
tests/thrill-*.test.js          rules and art smoke tests
```
