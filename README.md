# FunLand2

A series of small browser game prototypes. Each one is a static site with no
build step and no dependencies.

| Prototype | Folder | What it's testing |
|---|---|---|
| 0: HORDE | [`/`](index.html) | Twin-stick touch controls for top-down zombie horde survival |
| 1: WOBBLE WAR | [`battle/`](battle/) | A real-time card battler with funny, satisfying 2D physics units and a fair free-to-play meta game |
| Thrill Hill | [`thrill/`](thrill) | A Clash-Royale-inspired metagame: two static chests, a theme-park base, randomly generated survivors, a squad of three, three-crown raids |
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

# Prototype 0: "HORDE"

A top-down 2D zombie horde survival game for mobile browsers, going for a
Left 4 Dead feel. **Prototype 0** is about nailing down the **twin-stick touch
controls** and how fighting a horde feels in single player.

Play it on a phone in landscape. It runs as a static site with no build step
and no dependencies.

## What's in it

- **Twin virtual sticks**: the left thumb moves and the right thumb aims.
  Push past the dashed fire ring to shoot; tap the aim side to **shove**. The
  full spec and the reasoning are in [docs/CONTROLS.md](docs/CONTROLS.md).
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
- **Three levels**, picked on the title card or in the tuning panel:
  - **Streets:** a run across a dark city, from a safe room (bottom left) to
    the green safe room across town.
  - **Building:** one dark floor of an office/hospital-style building:
    corridors, offices, wards, cafeterias, lobbies, warehouse aisles and
    restrooms, all furnished. Hallways are blocked by barricades of piled
    furniture, so the route winds through rooms and doorways. Some offices
    have glass fronts, so you see the horde before it reaches the door, and
    some rooms are pitch dark. A shootable fire alarm is the indoor version
    of the car alarm.
  - **Pier 9** (the finale): Port Halvard's docks. From the harbour office
    through the warehouse lots, a container yard (stacks in rows, every lane
    open, reach stackers parked across some), and the quay apron under the
    gantry cranes, to Pier 9, the long pier in the north-east. Piers 6 to 8
    are dead-end side trips (stashes like dead ends). At the end of Pier 9,
    stand at the **flare post** for a second to fire the flare. It burns red
    overhead and every drowser on the docks sees it: waves come down the pier
    while the ferry, the HALVARD STAR, answers on the radio and sails in
    (60 s by default; **Pier 9: ferry arrives after** in the **Level** group
    sets 30 to 120 s). When she's alongside, the gangway comes down a little
    way back along the pier: get to it ("ALL ABOARD!") to win. Her
    searchlight sweeps the pier while you run. The holdout gate, two routes
    and landmarks are Streets/Building features; Pier 9 has the ferry
    instead (stashes, boarded warehouse rooms, the secret and the graffiti
    all work there).

  On every level, a green arrow at the screen edge points to the goal (safe
  room, PIER 9, then GANGWAY) and shows the walking distance.
- **Scavenging off the route**: heading straight for the safe room isn't the
  only way through. Each map hides finds in the detours, spread along the run:
  - **Supply stashes** (olive crates, 5 on the streets, 4 in the building) in
    alleys, courtyards, parking lots and back rooms. Stand on one for 0.7 s to
    search it.
  - **Boarded rooms** (2 per map): a dead-end room with its door nailed shut.
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
  under **World**): Port Halvard, a harbor city taken by "the Drowse", people
  who stopped sleeping. The walls tell the rest:
  - **Graffiti** on streets and floors, half of it along the way: running
    jokes between survivors (Teo & Mags argue on every wall, Big Lou counts
    his kills generously), dark lines ("SLUMBRA DID THIS"), and tips that
    happen to be how the game works ("RED LIGHT CARS = DINNER BELLS",
    "SHOVE FIRST. ASK NEVER."). Spray-painted "PIER 9 →" arrows point the way.
  - **The safe rooms** have their own wall of messages: the first thing you
    read when a run starts, and a welcome at the end.
  - **Posters** on building fronts and corridor walls: the sleep aid that
    started it all ("Sleep like the dead."), curfew notices, the evacuation
    promise ("Boats every hour." someone added "(LIE?)"), a missing dog, a
    cancelled gig, office motivational posters with notes added.
  - **Rooftop messages** you see from above: SOS, HELP, 4 ALIVE, PIER 9 →.
  - **Survivor dens**, hidden off the route and lit by candles: bedding, a
    stove, cans, a radio, the Tinkerer's gear-and-eye mark, scribbled advice,
    a joke wall, and a journal page (Odile's diary in the streets, office and
    lab notes in the building).
  - **Little scenes**: a bus stop piled with suitcases, a lemonade stand, a
    car that says HONK IF ALIVE (DON'T), a last stand, a fridge note about a
    stolen yogurt, a reception desk still "now serving: nobody".
  - **On the docks**: harbour graffiti ("NO FLARE, NO FERRY", "DROWSERS
    CAN'T SWIM. PROBABLY.", "GARY STILL OWES ME A BOAT"), the harbour
    master's log in a den (the HALVARD STAR keeps coming while anyone on
    Pier 9 has a flare), a ferry queue, a fish stall, and painted lines along
    the pier ("NO RUNNING ON THE GANGWAY" … "(RUN.)").
  - Walk up to anything with words on it and its text shows at the bottom of
    the screen.
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
- **Special infected**:
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
- **Night**: a flashlight cone, street lamps, burning wrecks and
  line-of-sight shadows, so zombies behind buildings stay hidden until you
  round the corner. You can turn it off in the panel.
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
  WOBBLE WAR is at `/battle/`, and the metagame prototypes are at `/thrill/`
  (Thrill Hill), `/hope/` (Hope Street), `/evac/` (Road to Evac), `/safehouse/` (the Safehouse) and
  `/camp/` (the v1 camp).
- **Locally:** `npm start` (or `python3 -m http.server 8080`), then open
  `http://localhost:8080`. To try it on a phone, open
  `http://<your-computer-ip>:8080` on the same network. Opening `index.html`
  straight from disk doesn't work, because browsers block ES modules on
  `file://`.
- **iPhone:** use Share → Add to Home Screen for true full screen. Android
  goes full screen when you tap Start.
- **Desktop:** WASD to move, the mouse to aim, click to fire, Space to shove,
  R to reload, Q to swap, Esc for tuning. A gamepad works too.

## Code map

```
index.html, style.css      page shell, title card, tuning panel styles
src/main.js                boot, resize/safe areas, pause, frame loop
src/settings.js            every tunable value + panel schema + presets
src/settings-panel.js      tuning panel UI
src/layout.js              HUD/button/stick positions (shared by drawing + hit tests)
src/input/                 stick-math (pure, unit tested), touch, desktop, gamepad
src/world/                 seeded city + building + docks (Pier 9) generators, world features (walls, gates, breach, landmarks), scavenging pass (stashes, boarded rooms, secret, chalk), world flavor (lore-content: every line of graffiti / poster / note; lore-gen: placement), collision, ray casts, flow field
src/game/                  player, AI teammate, weapons, zombies, specials (Hunter, Tank), the Night Terror (terror.js), director, loot, world events (holdout, breach, explosions), the Pier 9 finale (finale.js), effects, game state
src/render/                renderer, lighting (night + LOS), HUD (incl. reading captions), loot, world-feature, graffiti/poster and docks (water, containers, cranes, ferry) drawing
src/playtest.js            playtest kit: rating card, reports (copy / share / history), daily map seed
src/audio.js               WebAudio synth SFX
battle/                    WOBBLE WAR card battler (separate page; code map above)
thrill/                    Thrill Hill metagame prototype (separate page; map in docs/THRILL-HILL.md)
hope/                      Hope Street metagame prototype (separate page; map in docs/HOPE-STREET.md)
evac/                      Road to Evac metagame prototype (separate page; map in docs/METAGAME.md)
safehouse/                 Safehouse metagame prototype (separate page; map in docs/SAFEHOUSE.md)
camp/                      v1 camp metagame prototype (separate page; map in docs/METAGAME-CAMP.md)
tests/                     node --test unit tests (stick math, touch controller rules, settings saves, horde scaling, scavenging, world-feature and world-flavor placement, Pier 9 map + finale, the Night Terror's light, playtest reports + daily seed, the five metagames, Wobble War)
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
