# Last Stop (an isometric base-building variation of Thrill Hill)

A landscape, mobile-first, free-to-play **metagame** prototype. Raids are
**simulated**, and nothing here is connected to the HORDE action game. It lives
in [`outpost/`](../outpost) and runs at `/outpost/` (on Pages:
`https://miikka-boom.github.io/FunLand2/outpost/`, locally
`http://localhost:8080/outpost/` with `npm start`).

> Turn a lonely gas station into a bright little town in the zombie pines.
> Clear the lots around you, put everything where you like, and watch every
> survivor's home grow as they level up.

## The brief

"We want players to be able to get really invested in building their own base.
Start a new variation that has an isometric top-down map of a zombie
apocalypse survivor base that you can expand."

Last Stop keeps everything that worked in [Thrill Hill](THRILL-HILL.md) (two
static chests, Badges, a squad of three, three-crown raids, zones) and replaces
the fixed park with a town you lay out yourself. The design came out of a
panel of four proposals scored by three judges; the winner ("Last Stop") was
merged with the best ideas of the others (wishes, keepsakes, owner-styled
homes and Undo from "Patchwork Fort"; MVP-named lots, landmark bosses and the
camera glide from "Brightside").

What makes it a base you care about:

- **It's yours to arrange.** Anything goes anywhere on your land as long as it
  doesn't overlap; moving is free, with Undo. Paths are painted with a finger.
- **It's full of your people.** Everyone gets a home that grows with them, with
  their hat as a weathervane, their class prop on the porch, a heart plaque per
  wish granted and siblings sharing a roof colour.
- **It remembers.** Lots are named after the squad's MVP ("Mabel's Diner"),
  landmarks say who restored them and when, keepsakes carry their owner's name,
  and on day 7 the founders get a golden statue.
- **It grows visibly.** Grass blooms over every lot you clear, the fence and
  the station grow through three looks, and six landmarks light up.

## The base in five rules

1. Tap a lot next to your land and pay coins: it's yours instantly. Your zone
   sets how many lots you can own.
2. Anything goes anywhere on your land as long as it doesn't overlap. Moving is
   free.
3. Everyone who moves in gets a home automatically, and it grows with their
   level.
4. Cleared lots leave junk piles. Tap one to pop it, free.
5. One survivor at a time wishes for something from a set to go by their home.
   Put one there and they get Badges.

There are no builders, no timers beyond the two chests, and no producers,
defence, beds or storage.

## The map

A 35×35 tile map (2:1 isometric, 64×32 px tiles at zoom 1) in a 5×5 grid of
7×7 lots. Lot (a, b) covers i ∈ [7a, 7a+7), j ∈ [7b, 7b+7). You start in the
middle with **Last Stop**: the Gas Station (3×3), the Drop Pad and the Bank
Vault (the two chests), the Batting Cage and the Tin Can Range (class yards),
three founder tents, a campfire and a dirt path, with one free 2×2 plot.

| b \ a | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| **0** | ? Old Quarry | L Radio Mast | D Pine Grove | C Bus Depot | ? Scrapyard |
| **1** | C Lumber Yard | L Water Tower | C Burger Stand | C Car Lot | L Fire Station |
| **2** | R School | R Diner | **Last Stop** | R Motel | R Pharmacy |
| **3** | L Fairground Wheel | D Playground | D Mini Golf | L Drive-in | D Farm Stand |
| **4** | ? Hidden Cove | R Campground | C Boat Rental | L Lighthouse Pier | ? Water Park |

R rescue, C cache, D decoration set, L landmark, ? mystery. Lots next to your
land float a tag with their kind and price; farther lots show only a name under
a haze. Locked lots hold a ruin (6 archetypes with a name sign), a ruined
landmark with its boss waving from the roof, or a tarp heap with a "?".

### Clearing a lot

The price depends on how many lots you own: 50, 150, 300, 450, 650, 850, 1,100,
1,400, 1,700, 2,000, 2,400, 2,800, then +500 each. The land cap is 3 / 5 / 7 /
10 / 13 / 16 lots for zones 1–6, then +1 per milestone past the last gate, up
to 25.

The clear takes about four seconds (tap to speed it up): the squad sprints out
and BONKs the zombies, grass blooms tile by tile, the fence hops out, a sign
rises with the MVP's name (the squad member with the most crowns since the last
clear; ties go to the higher level, then the newer), the prize knocks three
times like a chest (15% Glow-Up chance each), and the ruin crumbles into four
junk piles (the squad pops the first). Roof campers then move into new homes.

| Prize | Plain | Glow-Ups |
|---|---|---|
| Rescue | a newcomer at Bank Vault odds (Veteran+); outer-ring rescues start at Silver | Silver/Gold: Hero+; Rainbow: a Legend |
| Cache | 100 × zone coins + 10 gems | ×1.5 / ×2 / ×3 |
| Decoration set | the lot's signature piece + 2 commons, standing on the lot | Silver: a common becomes the set's rare; Gold: both; Rainbow: + a Golden Gnome |
| Mystery | Legend 15%, golden Hero 15%, a resident's sibling (Hero) 20%, a giant decoration 30%, 50 gems 20% | +10 gems per grade |
| Landmark | restored: its bonus forever + 20 gems (no knocks) | |

The first clear always brings someone: the lot's own rescue, or a survivor
hiding in the pile the squad bonks. People found in town (rescues, trunks,
mysteries, the radio call) arrive one level below a chest newcomer of the same
rarity: they've been hiding a while.

### Landmarks

| Landmark | Boss | Restored, forever |
|---|---|---|
| Water Tower | the Plumber | the Supply Crate refills every 1 h 45 m |
| Drive-in | the Projectionist | +10% raid coins |
| Radio Mast | the DJ | strays follow you home twice as often, and a Hero answers the call |
| Fire Station | the Fire Chief | +5% squad power |
| Fairground Wheel | the Carny | +2 points Glow-Up chance per knock (chests and lots) |
| Lighthouse Pier | Old Salt | the Bank Vault refills every 7 h |

These reach Thrill Hill's rules through hooks in `meta.js` (`glowExtra`,
`strayChance`, `powerMult`, `coinBonus`, `chestPeriod`), so the chest sheets,
odds and raid previews show them.

## Buildings, homes, decorations

**Buildings** keep Thrill Hill's ids, levels 1–7, instant upgrades and the
max level of zone + 1. Each has three looks (Patched Lv 1–2, Fixed up 3–4,
Proud 5–7), a pennant per level and gold trim at 7. The Gas Station (the Big
Top's role: +10% raid coins per level) also sets the fence: planks and tyres,
painted tin, brick and lamps, string lights and flags. The Ice Cream Clinic
(Medics) and the Junk Garage (Tinkers) fly in as kits at zones 2 and 3.

**Homes** are 2×2, free and automatic. A newcomer's home lands on the best free
spot: +3 touching a path, +2 per home within a tile (streets fill up), +4 next
to a sibling, −0.2 per tile from the station, never on a path or the
station's forecourt. With no room, people camp on the Gas Station's roof and
move down after the next clear (or when you place their home from BUILD →
Homes). Tiers follow the owner's level:

| Lv | 1 | 2–3 | 4–5 | 6–7 | 8–9 | 10 |
|---|---|---|---|---|---|---|
| Home | tent | shack | log cabin | cottage | tower house | golden house |

A level-up that changes the tier gets a **housewarming**: the camera visits the
home as it pops into its new look and the neighbours cheer.

**Decorations** have no stats. Each belongs to a set tied to a vibe:

| Set (vibe) | Commons (coins) | Rare (junk, finds) | Signature (set lot) |
|---|---|---|---|
| Cozy (Sleepy) | Bench 40, Campfire 50, Hammock 60 | Bathtub Hot Tub | Treehouse |
| Garden (Sunny) | Planter 40, Sunflowers 50, Veggie Patch 90 | Golden Gnome | Pumpkin Patch |
| Party (Show-off) | Flamingo 40, Trampoline 70, Pallet Stage 120 | Disco Ball Pole | Windmill Hole |
| Lookout (Jumpy) | Flag Pole 40, Searchlight 70, Lookout Ladder 80 | Scarecrow in a Tutu | Rocket Slide |

The 40-coin pieces sell from Zone 1, the rest from Zone 2, the 2×2 ones from
Zone 3. Every Hero, Legend and golden newcomer brings a **keepsake** with their
name on it (Jukebox, Arcade Cabinet, Grill, Rocking Chair, Telescope, Gnome
Army; Legends a Mini Carousel or a Greenhouse), placed by their home. Zone
gates fly in **souvenirs** on plinths, and day 7 brings the **Founders'
Statue**. Decorations, keepsakes, souvenirs and the statue can go in the box.

**Placing**: an object must sit entirely on your land and not overlap anything.
Paths never block (things sit on top). Dropping something on a junk pile pops
it.

## Wishes, junk, visitors

**Wishes.** One is open at a time and never expires: "Aino would love
something Garden by her cabin." It's granted the moment any piece of that set
stands within 2 tiles of her home, bought, unboxed or **moved** there for free:
4 + 2 × zone Badges, a heart and a plaque. The squad is three times as likely
to wish, Heroes and Legends twice, nobody twice in a row, and only for sets the
home lacks. A sibling may instead wish to live near their family. A new wish
comes 20 minutes after the last is granted, or on returning after an hour. Tap
the bubble and BUILD opens on Decor with a ♥ on matching cards; the ♥ over her
home glows while you drag a match in range. Wishes never get the arrow.

**Junk.** 70% coins (10 + 10 × zone ±25%), 15% 2–4 gems, 12% a common
decoration, 3% a rare one; separately a 3% "someone's in the trunk!" survivor
(the first by the 12th pile, never more than 40 apart). The first pile you pop
yourself holds a Lawn Flamingo and starts the first wish (Party).

**Visitors** (on returning after an hour): a costume zombie at the fence (1 in
5; BONK it for a common decoration or 20 × zone coins) or a golden zombie (1 in
3 after 2 h+, at most one a day; three taps for 5 gems).

## The next step

One bouncing arrow (with an edge pointer when off-screen): a ready chest, a
READY person you can afford, a gift, a kit waiting to be placed, BEST, the
cheaper of the best building upgrade and the next lot (rescues first, then
toward the nearest landmark), PLAY. Junk, wishes and decorations never get the
arrow; the hand guides the first session only.

## Economy and pacing

Thrill Hill's currencies, nothing new: coins pay for everything (land too),
gems only open chests early, Badges are personal, Skulls are a score. Raid and
chest coins are ×1.5 Thrill Hill's (`TUNING_DEFAULTS.coins`) because about a
third goes on land. The milestone cycle gains a decoration: coins → Badges →
gems → a decoration.

`npm run outpost:balance` plays 20 seeds for 7 days (4 sessions a day of 4
raids). The simulated player puts land first, up to a third of the coins it
has earned, then follows Thrill Hill's spending order; it pops all junk, places
kits and found decorations, and grants wishes the cheapest way. It then plays
Thrill Hill's own player on the same seeds and checks that the squad's level
and every zone day stay within ±5%, and that land takes 25–35% of coins.

| Day | raids | zone | lots (cap) | people | squad Lv | landmarks | decorations | wishes | junk | coins earned | on land |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 16 | 3 | 5 (7) | 17 | 4.7 | 0 | 7 | 6 | 16 | 3,550 | 950 (26%) |
| 3 | 48 | 4 | 8 (10) | 29 | 6.7 | 3 | 15 | 11 | 28 | 13,000 | 3,550 (27%) |
| 7 | 112 | 6 | 12 (18) | 54 | 9.0 | 6 | 29 | 15 | 44 | 39,400 | 11,050 (28%) |

Squad level on day 7 is 9.0 in both games, and zones open on the same days
(2 and 3 on day 1, 4 on day 3, 5 on day 4, 6 on day 7). The remaining 13 lots
cost about 75,000 coins: a weeks-long tail.

## Screens and controls

The map is the home screen; Thrill Hill's Crew, Raid and chest Opening screens
are unchanged.

- **HUD** (floating pills): the town's flag and name (tap to rename), the zone
  and Skull bar (the ladder), coins, gems, the gear. Along the bottom: the
  Supply Crate, BUILD, the squad's faces with the threat and PLAY, CREW, the
  Bank Vault. A home button appears when the station is off-screen.
- **Gestures**: drag pans (with inertia), pinch or the wheel zooms 0.35–1.8,
  a double tap zooms 0.9 ↔ 1.4, a tap opens what's there (a person's card, a
  building's sheet, a lot card, pops junk, BONKs a zombie), and a long press
  (0.35 s) lifts anything movable. Let go on green to move it; on red it slides
  home. Drop a boxable thing on "Box it" to put it away.
- **BUILD** is a short drawer with four tabs: Buildings (move them; kits
  waiting), Homes (everyone, roof campers first), Decor (the box, then every
  decoration with its price or where to find it) and Paths (Dirt, Planks,
  Brick, the Eraser; paint with one finger, pan with two).
- **Placing** something new: it appears on a free spot near the screen centre
  over a green or red footprint; drag it (it floats above your finger), then ✓.
- **Naming**: after the first wish (or the third raid) the game asks for the
  town's name (three suggestions or your own) and a flag colour; the Gas
  Station's sign shows it from the Fixed-up look on.

The testing drawer (gear, or the ` key) has Thrill Hill's tools plus: clear the
next lot or every lot, a wish now, a trunk survivor next, +5 people, a costume
or golden zombie, and Founders' Day.

## Code map

```
outpost/index.html, outpost.css   the page and its styles (Thrill Hill's, plus the map, HUD, drawer)
outpost/src/
  config.js          every number and piece of content (Thrill Hill's, plus the town's tables)
  meta.js            Thrill Hill's rules (chests, Badges, squad, raids, zones) with landmark hooks
  town.js            the town rules: lots, clearing, placement, homes, junk, wishes, landmarks, kits, visitors, nextStep
  save.js            localStorage (funland2.outpost.v1), migration
  iso.js             isometric math and the camera (pure)
  isoview.js         the iso view: world layer, objects by depth, walkers, ghost, pins, gestures
  path.js            A* for walkers (paths cost 1, grass 3)
  map.js             the town map: ground, wild, objects, fence, tags, bubbles, walkers, placing, painting
  art.js             one door to the art modules, cached, with stand-in boxes if one fails to load
  town-art.js        buildings (3 looks), homes (6 tiers, owner touches), landmarks (+ bosses), fences
  ground-art.js      lot ground (grass, the wild, joined paths, haze), ruins, mystery heap, junk, scenery, bloom
  decor-art.js       decorations, keepsakes, souvenir plinths, the statue, set badges
  town-icons.js      the town's UI icons
  hud.js, build.js   the floating HUD and the BUILD drawer
  sheets.js          survivor card, building/chest/ladder sheets, lot card, landmark/decor/rename sheets
  main.js            boot, the frame loop and every flow (clear, place, move, wishes, raids, chests)
  people.js, raid.js, chests.js, opening.js, raid-view.js, crew.js, kit.js, ui.js, fx.js,
  audio.js, portrait.js, chest-art.js, icons.js, thrill-art.js, clock.js, format.js, util.js, dev.js
                     carried over from Thrill Hill (thrill-art.js = its art.js)
outpost/tools/       player.mjs (the simulated player) and balance-sim.mjs
tests/outpost-iso.test.js, tests/outpost-town.test.js
```

`window.__outpost` exposes the rules, the map and the HUD in the browser
console.

## What was cut, and why

- Permits, paid shacks, beds or any cap on people: everyone moves in.
- Builders, build timers, producers, harvests, storage and base defence: the
  only timers are the two chests.
- Land won by raid flags or districts: it would rewrite the accepted Skull
  ladder and take the building choices away.
- Paid or multi-tap junk: junk is free and never gets the arrow.
- Per-object paint and flipping, night art variants and the postcard export:
  one town colour instead, to keep the art cache small (possible follow-ups).
