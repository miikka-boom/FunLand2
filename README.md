# FunLand2

A series of small browser game prototypes. Each one is a static site with no
build step and no dependencies.

| Prototype | Folder | What it's testing |
|---|---|---|
| 0: HORDE | [`/`](index.html) | Twin-stick touch controls for zombie horde survival, in 3D |
| 1: WOBBLE WAR | [`battle/`](battle/) | A real-time card battler with funny, satisfying 2D physics units and a fair free-to-play meta game |
| Long Haul | [`haul/`](haul) | A simple metagame that crosses The Walking Dead: No Man's Land with Clash Royale: three go out, everyone still standing carries a crate home (stars = picks from nine crates), survivors are cards, radios call new people on a timer, and the road leads to Pier 9 |
| Thrill Hill | [`thrill/`](thrill) | A Clash-Royale-inspired metagame: two static chests, a theme-park base, randomly generated survivors, a squad of three, three-crown raids |
| Last Stop | [`outpost/`](outpost) | A simple base builder on an isometric town: one survivor goes out each night; build homes (someone new moves in), upgrade them (they grow), decorate, clear the lot next door |
| Hope Street | [`hope/`](hope) | A metagame with base building and randomly generated people: take them in, pick a crew of four for each run |
| Road to Evac | [`evac/`](evac) | A metagame for a co-op zombie survivor game (simulated runs) |
| Safehouse | [`safehouse/`](safehouse) | Another metagame: meta-progression for a co-op zombie mobile game |
| Camp | [`camp/`](camp) | The first metagame prototype: a survivor camp with base building |

# Prototype 1: "WOBBLE WAR"

A real-time card battler with wobbly ragdoll beans, played on a phone held
sideways in the browser. Drop cards of bean soldiers onto your half of the
field, bonk down the computer player's Guard Tower and Castle, and climb five
arenas, in a fair free-to-play meta game where everything that wins is earned
by playing. It started as a "place your army, press FIGHT" physics toy in the
spirit of Totally Accurate Battle Simulator; that toy is still in the game as
the **Sandbox**, and the physics beans are still the point: every unit is a
ragdoll that wobbles, cartwheels, flops and piles up.

Play it at `battle/` (locally: `npm start`, then open
`http://localhost:8080/battle/`). It is made for touch in landscape (844×390
and 667×375 phones first); a mouse works too. Held upright, a phone gets a
"turn your phone sideways" screen (a running match pauses). The design spec is
[`docs/WOBBLE-WAR-ARENA.md`](docs/WOBBLE-WAR-ARENA.md).

## How to play

- **The field:** you are blue on the left, a computer player is red on the
  right. Each side has a **Guard Tower** (worth 1 crown) in front of its
  **Castle** (all 3 crowns: it wins at once). A Castle sleeps until its Guard
  Tower falls or it is hit.
- **Playing a card:** drag it from your hand onto the field (see-through beans
  or the spell circle follow your finger, and the zone you may use lights up),
  or tap a card and then tap the field. Units go on your half (and further
  forward once their Guard Tower is down); spells go anywhere. A card that
  can't go there shakes back into your hand with the reason ("Not enough
  mana", "Play units on your side").
- **Mana** 💧: starts at 5, max 10, +1 every 2.8 s, and twice as fast in the
  last minute and in overtime. Deck of 8, hand of 4, the next card is shown; a
  played card goes to the back of the line.
- **The beans** drop from the sky where you play them, land with a wobble and
  a battle-cry hop, then fight the nearest enemy bean or march on the next
  tower. The Brick only goes for towers.
- **Winning:** after 2:00 the side with more crowns wins. A tie goes to up to
  1:00 of overtime where the first tower down wins; still tied, the side whose
  weakest tower has less health left (as a fraction) loses, and the result
  screen says so. An exact tie is a draw.
- **Levels:** each card level adds 10% health and damage; your towers fight at
  your King Level.
- **Pause** (❚❚ or the phone's back button) has Surrender, which takes two
  deliberate taps. Keys: `1`–`4` pick a card, `Esc` pause, `M` mute, `Space`
  skips the VS screen / closes the result.
- **First match:** against the Training Dummy, with a coach pointing at what to
  do. After it the menu points at the two free chests, then at upgrading a card.

## The cards

| Card | Mana | Rarity | Unlocks in | What it does |
|---|---|---|---|---|
| Clubbers | 3 | Common | Green Hills | Two beans with big wooden clubs: the overhead bonk sends beans cartwheeling |
| Squire | 3 | Common | Green Hills | Sword and shield: raises the shield against arrows, blocks hits from the front |
| Archers | 3 | Common | Green Hills | Two archers lobbing arrows that stick (and sometimes miss). Squishy up close |
| Spikers | 2 | Common | Green Hills | Three small, fast wedges that pounce point-first. A shield bounces them back |
| Bomb | 2 | Common | Green Hills | Waddles up, lights its fuse and goes BOOM; flings everything nearby |
| Arrow Rain | 3 | Common | Green Hills | Spell: three volleys of real arrows on a circle |
| Boulder | 4 | Rare | Green Hills | Spell: a rock falls on an arc; everything under it goes flying |
| Clubber Gang | 5 | Rare | Green Hills | Four Clubbers at once |
| Bruiser | 4 | Rare | Pointy Pass | An extra-large bean with an extra-large club |
| Brick | 5 | Epic | Pointy Pass | A giant walking block with a hammer; ignores beans, marches on towers, the slam shakes the ground |
| Cheese Wheel | 3 | Epic | Pointy Pass | Spell: a wheel of cheese rolls toward the enemy, bowling beans over and denting towers |
| Bomb Squad | 4 | Rare | Boom Ridge | Three bombs (keep them apart, or one sets off the rest) |
| Mega Bomb | 3 | Epic | Boom Ridge | A huge, slow bomb with a huge blast that hurts towers too |
| Shield Wall | 7 | Epic | Boom Ridge | Three Squires, shields up |

The eight Green Hills cards are your starting deck. Every number lives in
`battle/src/sim/cards.js` (cards), `sim/unit-types.js` (units), `sim/towers.js`,
`sim/spells.js` and `sim/match.js` (rules).

## A fair free-to-play game

Wobble War is a free game of the good kind: no money anywhere in power.

- **No** premium currency, energy, ads, paid timers or loot boxes. The
  optional Supporter Pack is cosmetic only and isn't connected to any payment.
- **Two earned currencies:** **gold** for card upgrades and shop cards (from
  matches, chests, the Trophy Trail, badges and the daily gift), and
  **Jellybeans** for looks only: army colours and hats (from badges, the Trail
  and Big Chests).
- **Two chests, always on the main menu, and no others:** the **Small Chest**
  refills every 3 hours (25–45 gold, about 8 cards in 2 stacks, 15% chance per
  stack of a rare one) and the **Big Chest** every 12 hours (120–200 gold,
  about 30 cards in 4 stacks with at least one rare stack, a 35% chance of an
  epic stack once you have epic cards unlocked, and 10 Jellybeans). Both are ready on your first visit. They never
  stack, never need a slot and can't be sped up, and matches never give chests.
  Opening one a little late costs nothing: up to a quarter of its timer of
  lateness comes off the next wait.
  They grow in higher arenas (+25% gold and +20% cards per arena), only drop
  cards you have unlocked, and a tap on a waiting chest shows its exact ranges
  and odds.
- **Matches pay trophies and gold:** a win is +27, +30 or +33 trophies (by
  crowns) and 12 gold + 4 per crown + 4 per arena after the first; a loss is
  −18 trophies and 3 gold (giving up pays no gold); a draw is 0 trophies and
  6 gold. A match left unfinished (a reload, the app closed) counts as a loss
  next time only if the bot was ahead on crowns; otherwise it is dropped.
- **Gentle losses:** you never drop out of an arena you reached (each arena's
  gate is a trophy floor).
- **Arenas:** Green Hills (0 trophies), Pointy Pass (300), Boom Ridge (650),
  Brick Fortress (1000) and Wobble Summit (1500), each with its own scenery.
  A new arena unlocks its cards in chests and the shop, and the **Trophy
  Trail** (32 rewards up to 1600 trophies, claimable forever by your best
  trophies) hands each new card out right after its gate, with enough copies
  to bring it to about level 4.
- **Honest opponents:** bots with names like Captain Bonk, labelled "computer
  player". Their card levels mirror your deck card by card (never above any
  of yours), capped at the level usual for your trophies, so upgrading past
  that is a real edge; their King Level works the same way, and their skill
  follows your trophies.
- **Upgrades** cost copies of the card plus gold, and earn King XP; each King
  Level makes your towers 10% stronger. Costs are always shown.
- **Daily shop** (by your local date): a free gift and three card offers for
  gold, one buy each. The **Wardrobe** sells hats for each unit type and army
  colours for Jellybeans, with a live preview. Hats use their own random
  numbers, so they never change how a battle goes.
- **Badges:** 25 goals such as Frequent Flyer, Pincushion, Chain Reaction and
  Giant Slayer, paying Jellybeans and some gold.
- **Old saves:** a save from the earlier campaign version keeps its
  Jellybeans, cosmetics, settings, stats and badges, and gets a veteran gift of
  20 gold per campaign star (up to 2000).
- More → "How it's fair" spells all of this out in the game.

## The menus

The hub has a top bar (King Level and XP, gold, Jellybeans, full screen,
settings) and five tabs:

- **Battle:** the arena banner (trophies and progress to the next arena), the
  big **BATTLE** button and the two chests. A bot-vs-bot match plays live
  behind it.
- **Cards:** your deck and collection. A card's sheet shows its stats (and what
  the next level adds), copies, Upgrade, and Use (then tap a deck card to swap
  it in). Locked cards show where they unlock.
- **Shop:** the daily gift, the card offers, the Wardrobe and the Supporter
  Pack. Purchases take two deliberate taps.
- **Trail:** the Trophy Trail, scrolling sideways, with arena gates.
- **More:** Badges, Settings (sound, volume, vibration, screen shake, install,
  reset progress), "How it's fair" and the Sandbox.

The phone's back button steps back inside the game (closes a card, returns to
the Battle tab, pauses a match); only on the bare main menu does it leave.
The game installs to the home screen, plays offline through a service worker,
and only updates itself while you are in the menus. Progress is saved in
`localStorage` (`wobblewar.profile.v1`, now version 2).

**Sandbox** (More → Sandbox): the original toy. Pick a unit card, tap the left
side for blue or the right side for red, press **FIGHT!**. Drag a bean to grab
and fling it (a lit bomb stays lit), drag elsewhere to pan, pinch or scroll to
zoom; 🐢 is slow motion. Keys: `1`–`8` pick a unit, `E` remove, `Space` fight,
`S` slow-mo, `F` auto camera, `R` reset.

## How the beans work

Every bean is a small Verlet ragdoll: hip, chest and head particles make the
bendy body, plus knees, feet, elbows, hands and a weapon tip. The "muscles"
are spring forces toward animated targets: hold the hips up, keep the head over
the hips, plant the feet in procedural steps, and swing the hands and weapon
through attack poses. Every muscle is scaled by the bean's **consciousness**. A
hit knocks some of it out, so the bean wobbles, sags or flops over. Then the
muscles fade back in and it gets up, dizzy. Dead means consciousness zero
forever: a limp ragdoll that drops its weapon.

The jokes come from that one rule plus a few extras:
- **Googly eyes:** each pupil is a little physics point pushed by gravity and
  the head's acceleration, so it jiggles with every step and spins when hit.
- **Faces:** angry brows when attacking, an "O" mouth for battle cries and
  screams, a smile when cheering, shocked eyes that turn into X's (tongue out)
  when dead.
- **Squash and stretch** follows the hips' vertical acceleration.
- **Bonks:** the clubber raises the club overhead, trembles for a beat, then
  steps into a swing that launches beans up and away with a cartwheel. Launched
  beans scream, stretch into sausages, windmill their arms and run in the air.
  Medium hits cause a stumble with windmilling arms; corpses give a last wobble
  and pile up.
- **Juice:** hit-stop on big hits, screen shake, comic starbursts and dirt
  clods, "BONK!" pop-ups, smooth slow motion (drawing blends between physics
  steps), a final-blow slow-mo that keeps the victim in the shot, and the
  winners hop and cheer.
- **Hand of god** (Sandbox): drag a bean to pick it up. It dangles and flails,
  and you can fling it.

## Code map (battle/)

```
battle/index.html, style.css     page shell, match HUD (hand, mana, crowns, clock), VS, result, pause, coach, sandbox HUD
battle/hub.css                   the menus' look (every class is hb-*)
battle/src/config.js             world layout (field, towers, zones) + team colours
battle/src/main.js               boot and game shell: modes (hub demo match / your match / sandbox), the frame loop,
                                 the hand (drag or tap to play), result screen, tutorial coach, back button,
                                 sim events -> effects, sound, haptics and badge stats; window.__wobble debug hook
battle/src/input.js              canvas touch / mouse: tap, aim, grab, pan, pinch, wheel
battle/src/audio.js              WebAudio synth: bonks, clanks, squeaky voices, towers, spells, chests, jingles
battle/src/pwa.js, battle/sw.js  install + offline + updates (bump VERSION in sw.js on every deploy)

battle/src/sim/                  the match, pure and seeded (no DOM)
  physics.js                     Verlet particles, constraints, ground, segment tests
  unit.js, unit-types.js         the ragdoll (skeleton, muscles, walking, attacks, AI) and the 8 unit types
  battle.js                      fixed 120 Hz step, hits, pounces, blasts, arrows; sandbox and arena modes
  towers.js, spells.js           Guard Towers and Castles; Boulder, Arrow Rain, Cheese Wheel
  cards.js                       the 14 cards (the contract between sim, meta and UI)
  match.js                       rules: mana, hand and deck cycle, zones, crowns, overtime, tiebreak, surrender
  bot.js                         the computer player (plays only through match.play(), never peeks)
battle/src/meta/                 the free-to-play meta game, pure functions of the profile
  profile.js                     the save (v2), migration from v1, currencies, rewards, notices, seeded RNG
  collection.js                  cards, levels, copies, upgrades, King Level, deck, arenas and unlocks
  ladder.js                      trophies, match rewards, arena floors, the Trophy Trail
  chests.js, shop.js, badges.js  the two menu chests, the daily shop, badges
  opponents.js, cosmetics.js     fair bot opponents (and the Training Dummy); colours and hats
battle/src/render/               canvas drawing
  units.js, hats.js              beans, weapons, arrows, faces, corpse fade, HP bars; the hats
  towers.js, spells.js           towers (damage, collapse, HP bars); spells, cannonballs, aim circle, deploy ghosts
  background.js, camera.js       sky, hills, castles, arena themes; framing, shake
  effects.js                     starbursts, dust, debris, confetti, comic words, crowns
  cards.js, chests.js            card faces (a real settled ragdoll as art); chest art and its opening
battle/src/ui/                   the menus (plain DOM)
  hub.js                         shell: top bar, tabs, Battle tab, modals, notices, tutorial hints, celebrations
  hub-kit.js                     DOM helper, icons, card tiles, reward views, card stats
  chest-open.js, cards-screen.js, trail-screen.js, shop-screen.js, more-screen.js   the screens
battle/tools/balance-arena.mjs   the balance tool (below)
```

The simulation and the meta game have no DOM code and replay identically from
the same seed, so they are tested headless in `tests/battle-*.test.js` (sim,
physics, arena rules, bot, meta, render smoke test, PWA). In the browser,
`window.__wobble` exposes the game: `step(n)` fast-forwards the running match,
`go('match' | 'sandbox' | 'hub')`, `play(i, x)` plays hand card `i` at world x.

## Balance tool

`node battle/tools/balance-arena.mjs` plays seeded bot-vs-bot matches and
prints tables: side symmetry and match shape (how matches end, towers
destroyed), skill against skill, a level up against none, every card's win rate
in random decks, the archetype decks against the starter deck, and a scripted
new player against the Training Dummy. `--n 24` for a bigger sample (about 5
minutes), `--only cards,mirror` for some sections, `--seed S`, `--skill K`,
`--json FILE`, and `--set GUARD.hp=600,CARDS.brick.mana=6` to try numbers
before changing them in the files (`WORLD.pocket.blue=1150` works too).

With today's numbers (`--n 8`, seed 1), equal-skill matches end by a castle
falling in about a quarter of cases and go to the tiebreak in about a fifth
(they used to be about half tiebreaks and no castles at all), a 0.6 bot takes
the castle of a 0.3 bot in about a third of matches, the scripted new player
takes the Training Dummy's practice castle almost every time, and one level up
still wins 94-100%. Every card's win rate sits between about 42% and 61%.

# Prototype 0: "WE LEFT BEN"

A 3D zombie horde survival game for mobile browsers, going for a
Left 4 Dead feel. **Prototype 0** is about nailing down the **twin-stick touch
controls** and how fighting a horde feels in single player. (It was called
HORDE until it got its name and logo, and it was flat and seen from straight
above until it got its third dimension.)

**The premise:** the squad (Odile, Teo, Mags, Lou, Biscuit the dog, and you)
left the first safe room on day 2. Ben wasn't with them. Since then: signs.
Small lowercase words in orange crayon, a stuffed rabbit with sewn-on eyes,
and two little eyes scratched near vents and hidden ways through. Nobody
explains who Ben is, how he got where he got, or whose side he's on.

**The setting:** roughly Philadelphia, 2020. The way out is a ferry from
Pier 9 on the Delaware, and the maps are the places on the way to it: the
lawns of Delco, a hillside cemetery, a salvage yard in Southwest Philly,
Center City after dark, an office floor on Market Street, the docks.

Play it on a phone in landscape. It runs as a static site with no build step
and no dependencies.

## What's in it

- **A world in 3D.** Buildings have facades,
  windows and parapet roofs, warehouses have pitched roofs, cars have cabins
  and wheels, the office floor is furnished down to the monitors, containers
  are stacked two high, the ferry has decks; survivors and the infected are
  little articulated figures that walk, reach, stagger, crouch and pounce.
  - It is still one plain 2D canvas, with no build step and no dependencies:
    the camera is orthographic, so every box is three parallelograms, every
    limb is a round-capped line and every painted surface (the graffiti, a
    poster on a wall, the words on a roof) is an affine transform away.
    [`src/iso.js`](src/iso.js) is the whole camera.
  - **Two 3D cameras, and every map type keeps its own.** On most maps the
    streets run along the screen: the camera looks north from high up (75°
    above the horizon), up on the stick is north, and you see roofs and the
    fronts of south-facing walls. The **Building** comes in the isometric
    view instead: the map turned 45°, seen from the south-west, with the west
    and south faces of everything showing, and from as high as that view
    goes (70°), which is how its corridors and rooms read best.
  - **The camera belongs to the map.** The **Camera** group in the tuning
    panel edits the camera of the map type you're playing (its heading says
    which: "Camera · Building"). View, the **Streets along the screen**
    switch, both tilts and the zoom are kept separately for Streets, the
    Building, Pier 9, Suburbia, the Graveyard and the Junkyard, so tuning one
    leaves the others alone. Look-ahead, follow stiffness and screen shake
    are one setting for all of them (**Camera feel**).
  - **Nothing hides you:** whatever stands between the camera and you fades
    out while you're behind it. A zombie you could see from above but the
    camera can't (it's round the back of a building) shows through as a red
    outline, so the view never costs you information the flat one gave. With
    line-of-sight shadows on, only the ones in your own sight do. Your
    teammate shows through in green.
  - **Night works in 3D:** the same lights fall on the ground and on
    whatever stands on it. Walls are lit along their length by your
    flashlight, bodies by the light at their feet. With **Line-of-sight
    shadows** on (under Presentation, off by default) bodies out of your
    sight aren't drawn at all, and fade in as they round a corner.
  - **Camera** in the tuning panel: **View** switches between *3D* and
    *Top-down* (the same world seen from straight above, flat, for comparing
    how the controls feel).
  - **Streets along the screen** (a switch under Camera, on by default
    everywhere but the Building) is the 3D view without a 45° turn: streets run left-right and up-down,
    the sticks are map directions, and the camera looks north. Its tilt has
    its own slider (30° to 75°; 75° by default, nearly overhead). The price:
    only walls that face south show their fronts. A wall that runs up the
    screen is seen along its length, so a boarded door in one is marked as
    on a floor plan (the dark of the doorway with the planks across, where
    the door is on the ground). The top-down view marks them the same way.
  - With the switch off you get the isometric view. **Isometric tilt** goes
    from 25° (low, cinematic) to 70° (nearly overhead, where the Building
    starts); 35° is true isometric.
- **Twin virtual sticks**: the left thumb moves and the right thumb aims.
  Push past the dashed fire ring to shoot; tap the aim side to **shove**.
  Sticks are screen directions: push up and you run up the screen (north
  with the streets along the screen; north-east in the isometric view, which
  is how the Building comes). The full
  spec and the reasoning are in [docs/CONTROLS.md](docs/CONTROLS.md).
- **Live feel tuning**: the sliders button (top right) pauses the game and
  opens every feel parameter: stick modes and size, dead zones, fire ring, aim
  assist, smoothing, camera, speed, horde size and so on. There are presets
  for A/B testing, and **Copy tuning JSON** copies only what you changed.
  Every setting you've changed gets a dot and its own **Default** button, and
  **Reset all to defaults** is at the bottom.
- **An AI teammate** (off by default; turn it on under **Teammate** in the
  tuning panel): a bot survivor (olive jacket, green ring) runs with you.
  It follows a step behind and shoots what threatens you first: a Tank's rock,
  a Hunter on you or about to pounce, then zombies on you. It shoves zombies off
  itself, shoves a Hunter off you, keeps its distance from the Tank and heals
  itself once. Zombies go for whichever of you is nearer. At 0 HP it goes
  **down** instead of dying and keeps shooting from the floor while it bleeds
  out (45 s). Stand next to it without shooting for 3 s to revive it. It never
  shoots through you and never sets off alarms. The **Teammate** section also
  sets its gun and accuracy.
- **Six map types**, picked on the title card or in the tuning panel:
  - **Streets:** a run across Center City after dark, from a safe room
    (bottom left) to the green safe room across town.
  - **Building:** one dark floor of an office/hospital-style building on
    Market Street: corridors, offices, wards, cafeterias, lobbies, warehouse aisles and
    restrooms, all furnished. Hallways are blocked by barricades of piled
    furniture, so the route winds through rooms and doorways. Some offices
    have glass fronts, so you see the horde before it reaches the door, and
    some rooms are pitch dark. A shootable fire alarm is the indoor version
    of the car alarm.
  - **Pier 9** (the finale): the docks on the Delaware. From the harbour office
    through the warehouse lots, a container yard (stacks in rows, every lane
    open, reach stackers parked across some), and the quay apron under the
    gantry cranes, to Pier 9, the long pier in the north-east. Piers 6 to 8
    are dead-end side trips (stashes like dead ends). At the end of Pier 9,
    stand at the **flare post** for a second to fire the flare. It burns red
    overhead and every drowser on the docks sees it: waves come down the pier
    while the ferry, the LIBERTY BELLE, answers on the radio and sails in
    (60 s by default; **Pier 9: ferry arrives after** in the **Level** group
    sets 30 to 120 s). When she's alongside, the gangway comes down a little
    way back along the pier: get to it ("ALL ABOARD!") to win. Her
    searchlight sweeps the pier while you run. The holdout gate, two routes
    and landmarks are Streets/Building features; Pier 9 has the ferry
    instead (stashes, boarded warehouse rooms, the secret and the graffiti
    all work there).
  - **Suburbia:** a Delco subdivision. Blocks of lots, each with a house
    (twins and singles, pitched roofs, a porch light still on here and
    there), a driveway, a garage and a fenced backyard: pools, sheds,
    trampolines, swing sets, vegetable beds. The fences have gates, so the
    backyards and the alleys behind them are shortcuts as well as dead ends
    ("CUT THROUGH THE YARDS"). One block is a park with a ballfield and a
    closed playground, one a strip mall behind its parking lot, one an
    elementary school with the buses still lined up. Somewhere an ice-cream
    truck is still playing: it is an alarm, like the cars with a red light.
  - **Graveyard:** Wissahickon Hill Cemetery (est. 1836; made up, like every
    venue here). Sections of headstones in rows between gravel paths, two
    avenues that cross by the chapel (the only ones with lanterns), rows of
    mausoleums, a pond, the war memorial, a columbarium court, woods, and
    the maintenance yard in the far corner. Headstones stop feet but neither
    bullets nor eyes: you shoot across the rows while the horde files
    through them. Ground mist, and darker than town.
  - **Junkyard:** Cracked Bell Auto Salvage, Southwest Philly. From the
    office trailer and the weighbridge through a grid of lanes between
    stacks of wrecks (two to four cars high: they block sight and bullets),
    heaps of scrap, tyres and dead appliances, to the clearing in the middle
    where the crusher stands under its crane, and out through the back lot.
    The rows are lettered, most of the lights are dead, and the floodlights
    over the crusher mark halfway.

  Suburbia, the Graveyard and the Junkyard have the scavenging, the writing
  and Ben like the rest, but no holdout gate, second route or landmarks
  (yet). All three come with the streets along the screen.

  On every level, a green arrow at the screen edge points to the goal (safe
  room, PIER 9, then GANGWAY) and shows the walking distance.
- **Scavenging off the route**: heading straight for the safe room isn't the
  only way through. Each map hides finds in the detours, spread along the run:
  - **Supply stashes** (olive crates, 4 in the building and 5 everywhere
    else) in alleys, courtyards, parking lots, backyards and back rooms. Stand on one for 0.7 s to
    search it.
  - **Boarded rooms** (2 per map in town, 1 or 2 elsewhere: the cemetery's
    office, the yard's workshop): a dead-end room with its door nailed shut.
    Shove the boards three times (or shoot them) to break in. It's loud, and
    whatever was shut in there comes out. Inside is a better stash.
  - **One secret per map**: a loose manhole cover (streets) or floor hatch
    (building) somewhere remote. Only a glint gives it away. It holds the best
    loot.
  - **Survivor chalk arrows** on the ground lead from the main route to the
    boarded rooms and about half of the stashes.
  - The loot lasts for the run: armor (soaks damage before HP), hot rounds
    (×1.5 damage, +1 pierce, orange tracers), adrenaline (20 s of speed, no
    slow-down from hits, quicker reloads and shoves), extended mags (+50%),
    +25 max HP, and medkits. The end screen shows what you found. Each part
    (stashes, boarded rooms, the secret) has its own switch under **World**
    in the tuning panel.
- **World features** (off by default, so new players aren't swamped: switch
  them on under **World** in the tuning panel, or tap **Everything**):
  - **Holdout gate:** a quarantine wall splits the map from edge to edge, down
    a street or along a corridor wall indoors, where every door is welded shut.
    The only way through is a locked gate. Stand at its control box to start
    it, then hold out: a siren calls waves from your side of the wall while the
    gate slides open (30 s by default; **Gate opening time** sets it).
  - **Two routes:** a second wall, with its open checkpoint at the far end, so
    the safe way snakes up one side and down the other. Next to it is a boarded
    **breach**: six shoves (or a lot of bullets), very loud, with a nest of
    sleepers right behind it, alarm cars and no light, but it saves a quarter
    to a third of the walk. "DANGER" and "GATE →" are sprayed beside it.
  - **Landmarks:** on the streets a gas station (shoot a pump: the whole
    station blows up, kills everything close and burns for 25 s), a crashed
    helicopter still burning with a medkit and an ammo can, and an army
    checkpoint across a street with sandbag cover, a chicane, floodlights and
    supplies. In the building: a rack of gas cylinders (they blow up too), a
    sandbagged field post and a collapsed ceiling under a shaft of moonlight.
  - **Default**, **Everything** and **Bare map** buttons set all the World
    switches at once.
- **A world to read** (on by default; **Graffiti, posters & survivor notes**
  under **World**): roughly Philadelphia, 2020, and on top of everything
  else that year "the Drowse": people who stopped sleeping. The place names
  are real; the sleep aid everybody blames (SLUMBRA, by Lullan Labs) and
  every venue are made up. The walls tell the rest:
  - **Graffiti** on streets and floors, half of it along the way: running
    jokes between survivors (Teo & Mags argue on every wall, Big Lou counts
    his kills generously), dark lines ("SLUMBRA DID THIS"), and tips that
    happen to be how the game works ("RED LIGHT CARS = DINNER BELLS",
    "SHOVE FIRST. ASK NEVER."), and the town itself ("GO BIRDS", "PPA STILL
    TICKETING", "YOU'RE ON MUTE", "EARLY TO BED, EARLY TO RISE — B.
    FRANKLIN"). Spray-painted "PIER 9 →" arrows point the way. No line ever
    runs into another.
  - **The safe rooms** have their own wall of messages: the first thing you
    read when a run starts, and a welcome at the end.
  - **Posters** hanging on building fronts and corridor walls (those on a
    wall that faces away from the camera lie on the ground at its foot): the
    sleep aid that started it all ("Sleep like the dead."), the city's
    stay-home and curfew notices, masks ("It will not help with this one."
    "WORTH A TRY"), six feet apart ("Farther, if they are drowsing."), the
    evacuation promise ("Delaware Ave · boats every hour." someone added
    "(LIE?)"), a missing dog, a cancelled gig at Penn's Landing, a postponed
    Broad Street run ("Run anyway."), office motivational posters with notes
    added.
  - **Rooftop messages** painted on the flat roofs: SOS, HELP, 4 ALIVE, GO
    BIRDS, SEND HOAGIES, PIER 9 →.
  - **Survivor dens**, hidden off the route and lit by candles: bedding, a
    stove, cans, a radio, the Tinkerer's gear-and-eye mark, scribbled advice,
    a joke wall, and a journal page with its line written out on the floor
    beside it (Odile's diary in the streets, office notes in the building,
    the harbour log on the docks, the caretaker's count in the cemetery, the
    yard log in the junkyard, a neighbour's diary in the suburbs).
  - **Little scenes**: a bus stop piled with suitcases, a lemonade stand, a
    car that says HONK IF ALIVE (DON'T), a wedding car (JUST MARRIED / STILL
    TOGETHER), a last stand, "MY YOGURT. I KNOW. — DEB" in front of a fridge,
    "NOW SERVING: NOBODY" by a ticket machine, office whiteboards.
  - **On the docks**: harbour graffiti ("NO FLARE, NO FERRY", "DROWSERS
    CAN'T SWIM. PROBABLY.", "GARY STILL OWES ME A BOAT"), the harbour
    master's log in a den (the LIBERTY BELLE keeps coming while anyone on
    Pier 9 has a flare), a ferry queue, a fish stall, and painted lines along
    the pier ("NO RUNNING ON THE GANGWAY" … "(RUN.)").
  - **Out of town** each place has its own lines, scenes and painted words.
    Suburbia: "HOA SAYS NO DROWSERS ON THE LAWN", "WE CLAPPED AT 7. THEY CAME
    AT 8.", "CLASS OF 2020" yard signs, chalk on the driveways, a lemonade
    stand ("HUGS FREE"). The Graveyard: "REST IN PEACE (NOBODY ELSE CAN)",
    "STONES STOP YOU. NOT BULLETS.", ledgers with epitaphs to read, a flower
    stall ("TODAY: FREE"). The Junkyard: "RUST NEVER SLEEPS. NEITHER DO
    THEY.", "U-PULL-IT. THEY-PULL-YOU.", "STACKS STOP BULLETS. USE THEM.".
  - **No inspect text:** everything is drawn in the world, big enough to read
    when your light is on it. There is no caption box and nothing to press,
    so every player sees the same things.
- **Ben's traces** (on by default; **Ben's traces (the one we left behind)**
  under **World**). Visual only, with a few sounds; nothing ever explains him:
  - **The first room:** under the squad's "DAY 1 HERE. DAY 2 LEAVING." someone
    wrote, in orange crayon, "day 3. you left." A stuffed rabbit sits in a
    corner (one ear chewed, new eyes sewn on).
  - **His bed**, hidden off the route on every level: a cardboard fort with a
    sleeping bag, a blanket folded into a perfect square, a candle still
    burning, a can still steaming, a tally of nights slept (nobody sleeps any
    more), the same rabbit (it got there first), and a medkit by the way in.
    Get close and someone whistles a few notes nearby, out of sight. On open
    ground nearby, two big chalk drawings:
    - **his map of this level**: where "you left", the way out, his bed, his
      dotted routes, a pair of eyes and an X on the secret stash, and one
      more place drawn off the edge of the map (a house, stairs going down,
      an island) with a question mark.
    - **"my squad"**: five holding hands (ODILE, TEO, MAGS, LOU, YOU) and
      Biscuit, and one more figure in orange, standing apart.
  - **Two little eyes** (the logo's googly eyes, scratched in): by the
    secret, along the way to his bed, outside boarded rooms, beside vents,
    inside the last safe room looking back out. The pupils always look at
    something. They glow faintly in the dark.
  - **"ben was here"** where nobody could reach: a rooftop, the top of a
    warehouse shelf, the top of the quarantine wall, crane 3's boom ("ben was
    here. day 1."), a container stack, a raft out on the water, inside a room
    nailed shut from the outside, and on the deck of the ferry when she comes
    in.
  - **"don't follow the noise"**, beside crayon arrows that point straight at
    an alarm car (on Pier 9: down the pier, toward the flare).
  - **Small footprints** that walk up to a wall and stop at an open vent
    whose screws are lined up on the floor in a neat little row.
  - **The squad about Ben** ("BEN?", "SORRY BEN", "BEN KNOWS THE WAY — TEO"…)
    and, underneath, his replies ("here", "it's ok", "i do"). A page per
    level: Odile on the night they left, Mags hearing whistling in the ducts,
    Lou waving at someone on crane 3.
  - **One lamp** near the way to his bed blinks the same three letters in
    Morse, over and over.
  - **The glimpse:** once a run, two little eyes catch your flashlight in the
    dark, off the walk. Hold the beam on them and they blink and are gone
    (small footsteps running off); the spot has fresh scratches.
  - **He notices** (this device only): find his bed again and there's a new
    line by it; die three times and "you died 3 times. i counted." is waiting
    outside the first room; win and come back and he asks why. The
    Tinkerer's gear-and-eye mark has a second eye added, and the Tinkerer
    isn't happy about it. The office roll call has one more name, in orange.
- **An AI Director**: build-up, peak and relax phases, wanderers, small groups,
  and mobs ("HERE THEY COME!") that spawn out of sight and come round corners.
  Shooting a car with a blinking red light sets off the **alarm**, which brings
  a three-wave panic event.
- **Massive hordes** for stress tests: in the tuning panel, **Horde size** goes
  up to ×25 (a log slider, so ×1–×3 still has fine steps), **Wanderer
  density** to ×10, and zombie speed and damage to ×2.5 and ×5. The zombie
  limit grows with the horde sliders (230 at the defaults, up to 3,000 alive),
  and big mobs pour in from several directions at once. Turn on **Debug
  read-out** to see the fps and how many zombies are alive out of the limit.
- **Common infected** that shamble, notice you, sprint in packs, path around
  buildings with a flow field, crowd you and claw. Getting hit slows you down,
  and under 40 HP you limp.
- **Special infected** (the Hunter and the Tank are off by default: **Hunter +
  Tank** under **Specials**):
  - The **Hunter** tests shove timing. It screeches, then pounces: shove it
    out of the air (deadstop), shoot it mid-air (skeet), or get pinned and
    tap to break free.
  - The **Tank** tests kiting. It's a boss with a telegraphed haymaker that
    sends you flying and rocks you can dodge or shoot down. It arrives once
    per run, mid-route, with a boss bar and its own music.
  - The **Night Terror** (off by default: **Night Terror** under
    **Specials**) tests the flashlight. A pale, long-limbed thing you can
    only see in light: in the dark it's invisible, bullets pass through it,
    and the laser, aim assist and the teammate don't see it either. Lamps,
    fire and muzzle flashes show it (and make it shootable). It circles to
    the side your flashlight isn't pointing; when it breathes in (a hiss and
    a pale puff of breath in the dark) it's about to lunge for 18 damage.
    Shove as it arrives to throw it off. Your flashlight (and the teammate's,
    fire, the Pier 9 flare and the ferry's searchlight) hurts it: caught in
    the beam it shrieks, smokes and backs off, and after about 2 s of light
    in total it flees. Your heartbeat speeds up while it's close and unseen.
    One at a time, nights only.
  - The spec is in [docs/CONTROLS.md](docs/CONTROLS.md#special-infected-stress-tests-for-the-controls),
    and the tuning panel has Spawn Hunter / Spawn Tank / Spawn Night Terror
    buttons.
- **Four guns** to compare feel: SMG, assault rifle (pierces 2), pump shotgun
  (loads shell by shell; firing interrupts the reload) and hunting rifle
  (pierces lines of zombies). Reloading is automatic when empty.
- **Night**: a flashlight cone, street lamps and burning wrecks. You can
  turn it off in the panel. **Line-of-sight shadows** (under Presentation,
  off by default) keep zombies behind buildings hidden until you round the
  corner.
- **Feedback**: synthesized sound (no audio files), haptics on Android, blood
  decals that stay, casings, tracers, screen shake and recoil, off-screen
  threat arrows.
- **Playtest kit** (the **Playtest** group in the tuning panel):
  - After each run a small card asks three quick questions: **fun** (meh /
    good / great), **difficulty** (too easy / about right / too hard) and
    **controls** (fought me / OK / felt great). Tap one per row, or none; the
    end-screen summary moves aside for it. **Play again** restarts (taps
    beside the card don't skip it; Enter, Space or a gamepad still do).
    **Rate each run** turns the card off.
  - **Copy report** (or **Share** where the phone offers it) gives a few
    readable lines plus one line of JSON: level, seed, outcome, time, kills,
    accuracy, damage, hordes, specials, finds, world events (gate, shortcut,
    explosions, the ferry), the ratings, the settings you changed, the
    device and the frame rate (average and 5% low).
  - Every finished run is kept on the device (the newest 40). **Copy all
    reports** in the panel copies them in one go; **Clear reports** empties
    the list.
  - **Daily map** (the chip under the level buttons, or the panel): today's
    date picks the seed, so everyone plays the same map today, on each level.
    The chip shows your best time (or furthest run) today. **New map** turns
    it off. The run timer says "daily" while it's on.

## Long Haul: No Man's Land × Clash Royale

[`haul/`](haul) is the newest metagame prototype, written from scratch: it
shares no code or systems with the others. The brief was "a simple and
satisfying combination of The Walking Dead: No Man's Land and Clash Royale".
Runs are simulated; the people and places are borrowed from We Left Ben (the
squad, the six maps as six stops on the road, drowsers).

- **Three go out. Whoever's still standing carries a crate home.** A run is
  worth 0 to 3 stars, one for each survivor on their feet at the end, and each
  star is one pick from **nine crates**. So Clash Royale's three crowns are No
  Man's Land's crate picks, and you can count them on screen.
- **Survivors are cards.** A fixed cast of twelve in four rarities. Crates
  hold supplies (the one currency) and tokens; a full token bar plus supplies
  is a level-up. Power against the stop's danger decides who stays standing,
  and every squad card says how that looks in a word: SOLID, GOOD, SHAKY or
  RISKY.
- **The radio rack is the chest slots.** Every haul hides one radio while the
  rack has room, and it is never missed three hauls running. The rack holds
  three and calls with one at a time, three hours a call. Someone answers: a
  new survivor moves into the camp (strong enough to go out that day), or
  someone you know sends a package.
- **The road is the ladder.** Stars add up through six stops to Pier 9; each
  is more dangerous, has richer crates and new voices on the radio. The camp
  moves with the squad: a new sky and skyline at every stop, a crate found on
  the way in.
- The camp is one scene: the radio tent, the fire, a tent for every two
  people, the squad by the truck. No buildings to upgrade, no energy, no
  premium currency.
- Once in a while: a gold crate, a Legendary on the radio, two little eyes
  scratched beside the best crate, a crate at the gate in orange crayon.
- The testing drawer (gear, top right) forces outcomes, jumps time for the
  radio, picks who answers, cheats and has live sliders. `npm run haul:balance`
  simulates ten days of play.

Open `/haul/` (on Pages: `https://miikka-boom.github.io/FunLand2/haul/`). The
design, numbers, pacing, what two reviews changed, and the code map are in
[docs/LONG-HAUL.md](docs/LONG-HAUL.md).

## Thrill Hill: a metagame prototype

[`thrill/`](thrill) is a separate page and a fresh take: it shares no systems
with the earlier metagame prototypes and isn't connected to the action game. A
**simulated PLAY button** stands in for a raid.

- A sunny theme park on a hill above a zombie town is your base. Randomly
  generated survivors (names, jobs, quirks, looks, a rare mascot head) live in
  it and wander about. Everyone a chest brings moves in.
- **Two static chests, no slots**: a Supply Crate every 2 hours and a Ticket
  Vault every 8 hours, both ready on the first visit. Knock three times: each
  knock may **Glow-Up** the chest to Silver, Gold or Rainbow. Then coins,
  Badges flying onto the squad's faces, and newcomer cards that flip with
  drama to match their rarity.
- **Badges** fill each survivor's own bar; READY plus coins levels them up.
  Rides make their class stronger, the Big Top makes raids pay more, chest
  levels make chests better. Every upgrade is instant.
- Pick a **squad of three**. Four classes counter four zombie threats. A raid
  is three waves, a **crown** for each one cleared; crowns pay Skulls and
  coins, and Skulls open six zones with gate gifts and milestones.
- The testing drawer (gear, top right) has time warp, forced chest grades and
  rarities, raid outcomes, cheats and live sliders. `npm run thrill:balance`
  simulates a week of play.

Open `/thrill/` (on Pages: `https://miikka-boom.github.io/FunLand2/thrill/`).
The design, numbers and pacing are in [docs/THRILL-HILL.md](docs/THRILL-HILL.md).

## Last Stop: a simple base builder

[`outpost/`](outpost) is a deliberately simple base-building metagame on an
isometric town. It isn't connected to the action game; nights are simulated.
(An earlier, much bigger version with Thrill Hill's whole loop is in git
history; playtesting said it was far too complex, so this one keeps the town
and cuts the rest.)

- **One currency, one survivor at a time.** PLAY sends tonight's survivor out:
  a win pays coins and moves you to the next night, a loss pays a third. Tap
  the face next to PLAY to send someone else.
- **Build a home and someone new moves in**: put it anywhere on your land and
  the stars knock in one by one (the first is a 3★ Hero).
- **Upgrade a home and it grows** with its survivor: tent, shack, log cabin,
  cottage, tower house, golden house. Stronger survivors win more nights.
- **Decorations are just for fun**, and residents use them. **Clear the lot
  next door** for more room: the ruin crumbles, grass blooms, the fence hops
  out, landmarks come back to life.
- The Gas Station and the fence fix themselves up as you win nights.
- Tap anything on the map for what you can do with it; long-press to drag it.
  The gear (top right) has testing tools. `npm run outpost:balance` prints the
  pacing.

Open `/outpost/` (on Pages: `https://miikka-boom.github.io/FunLand2/outpost/`).
The design, numbers and code map are in [docs/LAST-STOP.md](docs/LAST-STOP.md).

## Hope Street: a metagame prototype

[`hope/`](hope) is a separate page built around **base building** and
**randomly generated people**. It isn't connected to the action game: a
**simulated PLAY button** stands in for a run.

- You hold a firehouse on one street. Strangers come to the gate, each with
  a generated face, name, age, former job, role (Bruiser, Shooter, Medic,
  Scout or Mechanic), grade (★ to ★★★) and traits like Night owl or Clumsy.
  Take them in if you have a bed.
- For every run you pick a crew of up to four. Each run's tags favor certain
  roles and traits, and injuries rotate people out for a few days. People
  level up by playing; training at home helps the rest.
- Story runs reclaim the street one building at a time. Each building
  becomes a facility: beds, a kitchen (XP), a workshop (power), training, an
  infirmary and a radio (better visitors). Upgrades are instant.
- Two currencies (scrap and gems). Two wait rewards, both people: a visitor
  at the gate every 30 minutes and a convoy with a skilled survivor every 8
  hours.
- The testing drawer (gear, top right) has forced outcomes, time warp,
  cheats and live sliders. `npm run hope:balance` simulates days of play.

Open `/hope/` (on Pages: `https://miikka-boom.github.io/FunLand2/hope/`).
The design, numbers and the RunLoadout / RunResult contract with the game
are in [docs/HOPE-STREET.md](docs/HOPE-STREET.md).

## Road to Evac: a metagame prototype

[`evac/`](evac) is a separate page with a metagame for a co-op zombie
survivor game, prototyped on its own. It isn't connected to the action game:
a **simulated PLAY button** stands in for a run.

- One road through five districts to the evac chopper. Every stop you clear
  drives the van on and often hands you a new gun or rescues a survivor, who
  joins your squad of four.
- Runs earn **Supplies**, which buy instant upgrades (survivors and guns,
  levels 1–12). **Gems** pay for revives and for skipping the airdrop wait.
  Those are the only two currencies.
- PLAY always plays the next stop. The goal card shows the next reward, and
  a coach bubble names the best next step.
- Two wait rewards: a **Supply Crate** every 30 minutes and an **Airdrop**
  every 8 hours. Nothing else waits on a timer.
- The testing drawer (gear, top right) has forced outcomes, time warp,
  cheats, live economy sliders and a pacing log.
  `npm run evac:balance` simulates days of play.

Open `/evac/` (on Pages: `https://miikka-boom.github.io/FunLand2/evac/`).
The design, numbers and the RunLoadout / RunResult contract with the game
are in [docs/METAGAME.md](docs/METAGAME.md).

The first metagame prototype, a survivor camp with base building
([`camp/`](camp), [docs/METAGAME-CAMP.md](docs/METAGAME-CAMP.md)), is still
there for comparison at `/camp/`.

## Safehouse: another metagame prototype

[`safehouse/`](safehouse) is another separate page, built from the design doc
*Safehouse: Meta-Progression Design for a Co-op Zombie Mobile Game* and then
cut down to its core. It isn't connected to the action game or to the other
prototypes: a **PLAY** button runs a simulated mission in place of a real one.

- One screen: four rooms, each answering one question a squad asks before a
  mission. The Workshop is "what do we carry?", the Infirmary "how do we
  heal?", the Barracks "who comes with us?" and the Radio Room "where do we
  go next?". Next to them is the next mission with its chance and PLAY.
- One resource, Scrap. Missions bring it home, banked at every safe room, so
  a wipe keeps what you already brought in.
- Three levels per room on real-time timers, one upgrade at a time. Every
  level makes the squad stronger.
- Crafted throwables and heals go along on the next mission. Unused ones stay
  in the crate.
- Three named survivors: Nadia from the start, Theo and Grace rescued in
  chapter finales. They move in once the Barracks has a bunk.
- Twelve missions in four chapters, and a one-line hint for what to do next.

The gear (top right) has testing tools: skip time, add Scrap, force outcomes,
reset. Open `/safehouse/` (on Pages:
`https://miikka-boom.github.io/FunLand2/safehouse/`). The rules, numbers and
what was cut from the design doc are in [docs/SAFEHOUSE.md](docs/SAFEHOUSE.md).

## Run it

- **GitHub Pages:** `https://miikka-boom.github.io/FunLand2/` (HORDE) once
  this is on the default branch (the Pages workflow only deploys from there).
  WOBBLE WAR is at `/battle/`, and the metagame prototypes are at `/haul/`
  (Long Haul), `/thrill/` (Thrill Hill), `/outpost/` (Last Stop), `/hope/`
  (Hope Street), `/evac/` (Road to Evac), `/safehouse/` (the Safehouse) and
  `/camp/` (the v1 camp).
- **Locally:** `npm start` (or `python3 -m http.server 8080`), then open
  `http://localhost:8080`. To try it on a phone, open
  `http://<your-computer-ip>:8080` on the same network. Opening `index.html`
  straight from disk doesn't work, because browsers block ES modules on
  `file://`.
- **iPhone:** use Share → Add to Home Screen for true full screen. Android
  goes full screen when you tap Start.
- **Desktop:** WASD to move (screen directions, like the sticks), the mouse
  to aim, click to fire, Space to shove, R to reload, Q to swap, Esc for
  tuning. A gamepad works too.

## Code map

```
index.html, style.css      page shell, title card, tuning panel styles
src/main.js                boot, resize/safe areas, pause, frame loop
src/settings.js            every tunable value + panel schema + presets
src/settings-panel.js      tuning panel UI
src/layout.js              HUD/button/stick positions (shared by drawing + hit tests)
src/iso.js                 the camera: orthographic projection (yaw + tilt), project / unproject, stick and mouse mapping, and the painter's order for boxes (pure, unit tested)
src/input/                 stick-math (pure, unit tested), touch, desktop, gamepad
src/world/                 seeded generators for the six map types (city, building, docks; graveyard, suburbia and junkyard, which share gen-kit.js), Ben's traces (ben-content: every line; ben-gen: placement), world features (walls, gates, breach, landmarks), scavenging pass (stashes, boarded rooms, secret, chalk), world flavor (lore-content: every line of graffiti / poster / note; lore-gen: placement), collision, ray casts, flow field
src/game/                  player, AI teammate, weapons, zombies, specials (Hunter, Tank), the Night Terror (terror.js), Ben at run time (ben.js: his bed, the glimpse, what he remembers), director, loot, world events (holdout, breach, explosions), the Pier 9 finale (finale.js), effects (particles in 3D), game state + the view
src/render/renderer.js     the passes: ground -> night overlay -> everything that stands (far to near) -> overhead -> bright -> HUD
src/render/lighting.js     one list of lights: the ground overlay (night + line of sight) and the sampler that shades what stands on it
src/render/prims.js        3D shapes on the 2D canvas: boxes, cylinders, prisms, balls, limbs; colour tones
src/render/scene3d.js      the map prepared for 3D: heights, the painter's order, the grid, where movers slot in, what hides what
src/render/models.js       a 3D model for every kind of obstacle (buildings, walls, cars, furniture, containers...), lamp posts, door frames; hangs posters and rooftop words on what they belong to
src/render/theme-models.js the newer maps' models, added to the table in models.js: headstones, mausoleums, the chapel; houses, garages, the mall, buses; wreck stacks, the crusher and crane
src/render/theme-render.js the newer maps' ground (lawns and lots, grave plots and paths, the yard) and what lies on it
src/render/decor3d.js      the small things that stand up (chairs, signs, the lemonade stand, Ben's fort and rabbit, boats)
src/render/figures.js      survivors, the horde (batched), Hunter, Tank, Night Terror
src/render/*-render.js     what is painted flat (ground, graffiti, posters, chalk, Ben's crayon) and the big set pieces (docks: piers, cranes, the ferry; features: the canopy, fires, fireballs), hud.js
src/playtest.js            playtest kit: rating card, reports (copy / share / history), daily map seed
src/audio.js               WebAudio synth SFX
battle/                    WOBBLE WAR card battler (separate page; code map above)
haul/                      Long Haul metagame prototype: No Man's Land × Clash Royale (separate page; map in docs/LONG-HAUL.md)
thrill/                    Thrill Hill metagame prototype (separate page; map in docs/THRILL-HILL.md)
outpost/                   Last Stop, the simple isometric base builder (separate page; map in docs/LAST-STOP.md)
hope/                      Hope Street metagame prototype (separate page; map in docs/HOPE-STREET.md)
evac/                      Road to Evac metagame prototype (separate page; map in docs/METAGAME.md)
safehouse/                 Safehouse metagame prototype (separate page; map in docs/SAFEHOUSE.md)
camp/                      v1 camp metagame prototype (separate page; map in docs/METAGAME-CAMP.md)
tests/                     node --test unit tests (stick math, touch controller rules, the camera + painter's order, a smoke test that draws every map type under every camera on a mock canvas, the three newer maps (connected, seeded, their own invariants), settings saves and the per-map camera, horde scaling, scavenging, world-feature and world-flavor placement, Pier 9 map + finale, the Night Terror's light, Ben's traces + memory, playtest reports + daily seed, the metagames incl. Last Stop's iso engine and town rules and Long Haul's rules, art and sheets, Wobble War)
```

`window.__p0` exposes the game, settings and input in the browser console.

## Tests

```
npm test
```

## Deployment

[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
publishes the repository as a static site from the default branch. To set it
up once, go to **Settings → Pages → Source** and choose **GitHub Actions**.
`package.json` has no `build` script, so the workflow serves the files as they
are.
