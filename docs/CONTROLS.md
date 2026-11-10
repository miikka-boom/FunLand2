# Twin-stick touch controls (Prototype 0)

This is the control scheme for the horde game (We Left Ben), with the default
values and the reasons behind them. The world is 3D;
[what the camera means for the sticks](#sticks-and-the-camera) is below.
Every number here can be changed live in the in-game tuning panel (sliders
button, top right). To lock in a different feel, tune it on a phone, press
**Copy tuning JSON**, and update the defaults in `src/settings.js`.

## Layout (landscape)

```
 ┌──────────────────────────────────────────────────────────────────┐
 │ [HP 100 ▬▬▬▬]          0:42 · 31 kills        [SMG 37/50 ⇄] [≡]  │
 │                                                                  │
 │                                                (SHOVE)           │
 │                                                        (⟳)       │
 │        MOVE ZONE                │          AIM ZONE              │
 │     (left 50% of screen)        │      (right 50% of screen)     │
 │          ◯                      │                  ◯ ┄ fire ring │
 │        thumb                    │                thumb           │
 └──────────────────────────────────────────────────────────────────┘
```

- The screen is split at `zoneSplit` (50%). **Where a finger lands decides
  which stick it drives.** After that it can cross the middle without dropping
  the stick.
- Buttons: tap the weapon panel to swap, `⟳` reloads, `SHOVE` shoves, `≡`
  pauses and opens the tuning panel. All buttons fire on **touch-down**, not
  on release.
- Faint "ghost" sticks show where thumbs usually rest (and where fixed sticks
  sit). Their labels fade out after about 15 seconds of play.

## Sticks and the camera

The world is 3D. Out of the box the camera looks north from high up (75°
above the horizon), so the streets run along the screen, left-right and
up-down. The other 3D camera is the isometric one: the map turned 45°, seen
from the south-west. Either way:

- **A stick is a direction on the screen.** Push up and you run up the
  screen; push right and you run right. With the streets along the screen
  that is north and east on the map; in the isometric view up is north-east.
  The aim stick works the same way: the laser leaves your gun at the angle
  your thumb makes on the glass. `src/iso.js` (`dirToWorld`) turns a screen
  direction into the heading on the ground that looks the same.
- **Speed is the same over the ground in every direction.** Up and down the
  screen the ground is foreshortened (hardly at 75°, by more than half in
  the isometric view at 25°), so you cover fewer pixels there for the same
  run speed, and guns reach further in pixels sideways than up. The camera's
  look-ahead makes up for it: it leads by the same distance on screen
  whichever way you aim.
- **The mouse** (desktop) aims at the spot under the cursor at gun height, so
  the laser runs through the cursor rather than through the ground behind it.
- **What the camera can't see, you're told:** a wall or building between the
  camera and you fades out; a zombie the camera can't see (one you can, when
  line-of-sight shadows are on) shows through as a red outline.
- **Streets along the screen** looks north, so you see roofs and
  south-facing walls; walls that run up the screen are seen along their
  length. It needs a steep tilt: from 35° a wall hides most of a doorway in
  it.

| Setting | Default | Why |
|---|---|---|
| View | **3D** | *Top-down* shows the same world from straight above, flat: the baseline to compare the feel against. |
| Streets along the screen | **on** | The 3D view without a 45° turn: streets run left-right and up-down, and sticks are map directions. Costs the west-facing walls: only south faces show. Off: the isometric view. |
| Tilt with streets along the screen | 75° | Nearly overhead: the ground is hardly squeezed, and a wall hides only 12 u of the 72-86 u doorway in it (at 35° it would hide 63 u). The top of the slider. |
| Isometric tilt | 25° | For the isometric view (the switch off). Low and cinematic; buildings hide a lot behind them. 35° is true isometric; higher is closer to the overhead view. The bottom of the slider. |

## Left stick: move

| Setting | Default | Why |
|---|---|---|
| Mode | **Dynamic** | The base appears under the thumb, so there is no target to hunt for. Past the rim the base is dragged along, so reversing direction responds at once instead of crossing the whole stick first. |
| Radius | 58 px | About 1 cm of thumb travel for full deflection on a phone. |
| Dead zone | 12% radial | Radial, not per-axis, so diagonals feel the same as cardinals. The output is rescaled after the dead zone, so there's no jump. |
| Full speed at | 85% | You reach full speed before the rim. Thumbs don't have to hunt for the edge. |
| Curve | linear (^1.0) | Analog speed stays readable. Use >1 for finer creeping. |
| Run speed | 190 u/s | Common infected run at 176–214 u/s. You can't outrun a horde, and that's the L4D point: you have to stand and fight or shove. |
| Accel / brake | 2400 / 3000 u/s² | Full speed in about 0.08 s. Braking and reversing are harder than accelerating, so dodges feel snappy. |

L4D rules kept on purpose: a hit slows you to 55% for 0.35 s (that's how a
horde catches you), and below 40 HP you limp at 80% speed.

## Right stick: aim + fire

| Setting | Default | Why |
|---|---|---|
| Mode | **Dynamic** | Same reasons as the move stick. |
| Aim dead zone | 12% | Below this the thumb's direction is too noisy to trust. |
| **Fire ring** | **45%** | Inside the dashed ring you only aim (the laser shows where). Push past it to fire. This gives you "aim first, then commit" with no extra button. A 6% hysteresis stops the trigger from flickering on the ring. |
| Aim smoothing | 0.02 s | The time constant is divided by deflection: angle noise from a thumb is about *pixel jitter ÷ deflection*, so small deflections get smoothed more and full deflection is nearly raw. Every new contact (even a quick re-aim during the hold) snaps instantly with no lag. |
| Keep aim after release | 0.5 s | You keep facing where you shot (including the aim-assist correction), so the flashlight doesn't swing to your walking direction mid-fight. |
| Aim assist | 45%, 10° cone | Pulls the shot toward the best target in the cone. The cone widens for close (big) targets, the pull fades out at the cone edge, the target is sticky so it doesn't flicker in crowds, and it needs line of sight. The laser shows the assisted aim, so what you see is what you shoot. |
| Laser sight | on | Your thumb covers the action, so the laser does the precise aiming. The shotgun also shows its spread cone. |

The knob turns orange while firing, and the fire ring brightens.

## Shove (the L4D "get off me")

- **Tap the aim side** (≤ 220 ms, ≤ 14 px of travel, never reached the fire
  ring) = shove. Your thumb is already there, so it costs nothing to reach.
  While a touch could still be a tap, it doesn't aim yet, so a tap that rolls
  a few pixels shoves without first turning you. A real aim moves past 14 px
  (or lasts longer than 220 ms) and engages immediately. Turning tap-shove off
  removes even that tiny wait.
- A **second finger tapping** the aim side while you aim also shoves (for claw
  grip).
- There's also a **SHOVE button** for comparison (you can hide it in the panel).
- Reach is 52 u from your centre to the zombie's edge (about 40 u past your
  body), with a 130° arc. Zombies already touching you are hit from any angle.
  The shove knocks commons back and staggers them for about 0.8 s. **Shove assist:** if a zombie is on you from the side,
  the shove swings to face it.
- Fatigue: rapid shoves add cooldown (0.42 s, up to 1.17 s), so you can't
  shove-lock a horde forever.
- In **fixed** aim mode a tap far from the base is a full deflection, so it
  fires instead of shoving. Tap near the base, or use the button or a second
  finger.

## Special infected: stress tests for the controls

The Hunter and the Tank are off by default (**Hunter + Tank** under
**Specials**).

### Hunter: shove timing

- It stalks and circles you, and growls when it's close.
- **Telegraph:** it stops, crouches and screeches for 0.75 s (0.42 s if
  you're right next to it). A dashed red line and a shrinking ring show the
  pounce coming. Off screen, a purple HUNTER arrow sits on the screen edge.
- **Pounce:** it leaps at 720 u/s and leads you by half your velocity, so
  stepping sideways during the screech dodges it.
- **Deadstop:** shove (tap, button, Space or RB) while it's within 104 u of
  you in mid-air. The shove stays live for `deadstopWindow` (0.18 s), so a
  shove that's slightly early still counts, for a total window of about
  0.3 s. It's knocked down and stunned for 1.6 s.
- **Skeet:** kill it in mid-air. Hitting it hard while it crouches (45+
  damage in one hit, or a shotgun stagger) cancels the pounce.
- **Pinned:** you can't move or shoot while it claws you for about 12 HP/s.
  Tap `hunterBreakTaps` (5) times to throw it off; any shove input counts.
  The meter only drains once you stop mashing.

### Tank: kiting while shooting backwards

- 2400 HP (× `tankHealth`) and 182 u/s (× `tankSpeed`), just under your
  190 u/s run. If you keep moving you can kite it; anything that slows you
  (hits, limping) lets it catch up. It turns slowly, so sharp jukes work.
- **Haymaker:** a 0.42 s wind-up (red wedge, red flash), then 24 damage that
  sends you flying (560 u/s, with almost no control for 0.45 s). Commons in
  the swing get thrown too.
- **Rock:** a 1 s wind-up with an orange dashed line, thrown from 280–820 u
  when it has a clear line to you. It leads you by 60%, so strafe to dodge
  it, or shoot it down (70 HP). Aim assist prioritises rocks and pouncing
  Hunters.
- You can't shove or stagger it, and bullets barely push it.
- One Tank per run, at a random point 38–58% of the way along the route.
  Mobs and Hunters pause while it's within about 1000 u of you, and a relax
  phase follows its death. While it's alive you get a boss bar,
  ground-shaking footsteps and its own music.

### Night Terror: the flashlight as a weapon

Off by default (**Night Terror** under **Specials**; it needs **Night** on).

- **You only see it in light.** Its visibility follows the lighting: your
  flashlight cone, lamps, fire, glows, muzzle flashes, explosions, the
  teammate's light, and on Pier 9 the flare and the ferry's searchlight.
  Right next to you, your all-round glow shows only a hint of it. Below 30%
  light it's a ghost: bullets pass through it, and the laser, aim assist,
  the threat arrows and the teammate ignore it.
- **It stalks your dark side:** it circles at about 200 u toward the side
  your flashlight isn't pointing (the short way round, so it never crosses
  the beam), sidesteps out of the beam when it comes closer, and darts across
  lamplight. It moves at 250 u/s, faster than you.
- **The lunge:** with a clear lane, inside about 220 u, unlit and behind you
  (more than 55° off your aim; after 7 s of you turning to face it, more than
  35°), it breathes in for 0.5 s (a rising hiss and a pale puff of breath,
  drawn over the darkness) and lunges at 640 u/s for 18 damage (× zombie
  damage). Then it backs off into the dark and tries again 4–6 s later.
- **Counters:** shove while it's lunging within 74 u of you to throw it off
  (no damage). Turn your light on it: past 42% "burn" it flinches, shrieks,
  smokes and backs off; a shove or a big hit also breaks its in-breath.
  After 2.2 s of light (weighted by how strong it is, in total) it flees and
  is gone. 180 HP if you'd rather shoot it while it's lit.
- **Tells for ears:** whispers every 2–4 s, and your heartbeat (louder and
  faster as it closes) while it's within 340 u and unseen.
- **Pacing:** one at a time. The first comes 30–48 s after you leave the
  safe room, the next 40–65 s after the last one died or fled (slower in the
  relax phase, paused while the Tank is on you). It spawns out of sight, in
  the dark, never under a lamp.

**Pacing:** the first Hunter comes after 18–28 s of build-up, and always by
22% of the route. After that, a new one comes every 25–45 s while none is
alive (the relax phase halves that clock). The tuning panel has **Spawn
Hunter**, **Spawn Tank** and **Spawn Night Terror** buttons for testing on
demand.

## AI teammate

A bot survivor can fight alongside you. It's off by default (solo is the
baseline): turn it on under **Teammate** in the tuning panel, which also sets
its gun and accuracy. It's there to test how the controls hold up with
someone else in the fight.

- **Follows** a spot behind and to one side of you, a little ahead of where
  you're going, so it keeps pace. It steps out of your line of fire when you
  aim its way. If it gets lost or stuck, it reappears next to you.
- **Shoots** in this order: a Tank's rock, a Hunter riding you, a Hunter
  crouching or mid-pounce, zombies on you, zombies on it, then anything else
  close. It never fires through you and never sets off car or fire alarms.
- **Shoves** zombies that get on it (with the same fatigue as yours), and
  shoves a Hunter off you when you're pinned ("ALLY SAVED YOU"). Often it just
  shoots the Hunter first.
- **Tank:** if the Tank is close or turning on it, it backs off. A Tank busy
  chasing you just gets shot in the back.
- **Heals** itself once (3 s) when it's under 40 HP and nothing is coming.
- **Down, not dead:** at 0 HP it drops and keeps shooting from the floor at
  short range while it bleeds out over 45 s (zombie hits speed that up).
  **Stand next to it without shooting for 3 s** to revive it at 40 HP. A dashed
  circle shows where to stand, and a green arc shows the progress. If nobody
  revives it, it dies for the rest of the run.
- Zombies go for whichever survivor is nearer. A Tank's punch and rocks hurt
  it too; Hunters only ever pounce on you.

## Scavenging: rewards for leaving the route

Each map hides finds off the straight line from the start to the safe room
(on by default; **Supply stashes**, **Boarded-up rooms** and **Secret stash**
under **World** in the tuning panel switch each part).
"Off the route" is measured as the detour: the walk start → find → safe room,
minus the walk start → safe room. Placement is seeded from the map, so the
same map always has the same finds.

- **Searching:** stand on a find to search it: 0.7 s for a stash, 0.9 s for a
  boarded room's case, 1.3 s for the secret. A gold ring shows the progress.
  You can shoot while you search. Stepping off pauses it (the progress drains
  slowly), and being pinned stops it.
- **Supply stashes:** 5 on the streets, 4 in the building, one per stretch of
  the route, each in the best nook there (alleys, courtyards, lots, back rooms;
  at least ~380 u of detour). One item each: armor +50, 60 hot rounds,
  adrenaline or a medkit, sometimes a medkit as well. They glow faintly and
  glint every few seconds when you have line of sight.
- **Boarded rooms (2 per map):** a dead-end room with its door nailed shut.
  On the streets it's carved into a building with a doorway on its open side;
  in the building it's a one-door room. Three shoves break the boards, and so
  do bullets (they take 40% of a bullet's damage). Each hit is a bit noisy, and
  breaking them is loud: it alerts zombies within 700 u. 2–3 zombies are shut
  in with the case. The case holds two good items (full armor, 150 hot rounds,
  extended mags, +25 max HP or adrenaline) plus a medkit.
- **The secret (1 per map):** a manhole cover pushed slightly off its hole
  (streets) or a floor hatch left ajar (building), far off the route (the
  building prefers a pitch-dark room). There's no glow and no arrow, only a
  faint glint every ~4 s. It holds extended mags or +25 max HP, plus full armor
  and 150 hot rounds.
- **Survivor chalk:** white arrows on the ground lead from the main route
  toward both boarded rooms (an X at the tail) and about half the stashes (a
  crate at the tail), one every ~300 u.
- **What the loot does (for the rest of the run):**
  - **Armor** (blue strip under your HP, up to 100) soaks damage before HP.
  - **Hot rounds** (orange tracers, counter under the gun panel) are spent one
    per trigger pull: ×1.5 damage and +1 pierce.
  - **Adrenaline** (20 s, yellow pulse): +22% run speed, no limp or slow-down
    from hits, reloads 40% faster, shoves recover 40% faster.
  - **Extended mags:** every magazine +50%, refilled on the spot. A second one
    turns into 150 hot rounds.
  - **+25 max HP** heals 25 too.
  - **Medkits** pop out next to the case and follow the normal rule (taken
    when you're hurt), so you can leave them for later.
- The end screen tallies supplies, boarded rooms and whether you found the
  secret.

## World features: holdout gate, two routes, landmarks

Off by default, so the base game stays readable: each has a switch under
**World** in the tuning panel (changing one restarts the run), and the
**Everything** button turns them all on. Placement is seeded from the map and
checked on a grid that only counts spots a body fits in: the safe room always
stays reachable, or the piece isn't placed.

- **Holdout gate.** A quarantine wall cuts the map from edge to edge, mid-route.
  On the streets it runs down the middle of a north-south street; indoors it
  follows the east wall of a cross corridor, where every door is welded shut
  (the corridor keeps its full width). The only way through is a locked gate.
  - "THE GATE IS LOCKED" shows when you get within ~480 u. A dashed ring marks
    where to stand at the yellow control box.
  - Stand in the ring for 1.2 s to start it. A siren goes off (it alerts
    everything within 1100 u), red beacons turn amber, and a bar under the
    timer counts the gate open: 2 s, then **Gate opening time** (30 s by
    default, 15–60 s). The gate slides open from the top, so you can squeeze
    through a little early.
  - A wave of 14–20 zombies (× horde size) arrives every quarter of the gate
    time (never closer than 6 s apart or further than 10 s). While the gate
    is shut, nothing spawns on the far side of the wall, so every wave comes
    from your side. The normal mob timer is held back until it's over, and a
    Tank on you pauses the waves.
  - The gate is bars: you can see and shoot through it, but nothing gets past
    until it's open.
- **Two routes.** A second wall, with its open checkpoint at the far end from
  the first wall's gate, so the safe way snakes up one side and down the
  other. A boarded **breach** in the second wall is the short way. Every map
  is checked to save at least 15% of the walk (about a third on the streets, a
  quarter indoors).
  - The breach takes six shoves (240 board HP; bullets do 40% damage, an
    explosion does a lot). It's loud (1000 u), and a nest of 10–13 sleepers
    waits right behind it. On the streets there are alarm cars just past it.
    Nearby lamps are dead.
  - "DANGER" is sprayed in front of it and "GATE" with an arrow points along
    the wall to the checkpoint. It's sprayed "DANGER" and "SHORT WAY (LOUD)",
    with "GATE" and an arrow pointing the long way round.
  - Once it's broken, the safe-room arrow and the zombies' pathing both use
    the short way.
  - With the holdout on as well, the first wall's gate is the holdout gate
    (unavoidable). The breach saves the walk after it.
- **Landmarks** (no call-outs: you recognise them by sight):
  - **Gas station** (streets, on the way): a lit canopy over four pumps. Shoot
    a pump (a couple of rifle bullets): the whole station explodes. The blast
    (320 u) kills commons close in, hurts specials, throws you (up to 60
    damage if you're too close), breaks boards and sets off other explosives
    in range. It leaves a fire that burns for 25 s and kills zombies that walk
    into it (it hurts you too).
  - **Crashed helicopter** (streets, a little off the way): a burning wreck
    with its tail torn off and rotor blades strewn around. Medkit and ammo
    can.
  - **Army checkpoint** (streets, across a street on the way): sandbag
    emplacements you can shoot over, jersey barriers in a chicane, an army
    truck, floodlights and barbed wire. Ammo can and medkit.
  - **Gas cylinders** (building): a rack of red and blue cylinders. Same as the
    pumps: a 250 u blast and an 18 s fire.
  - **Field post** (building, in a big room on the way): a sandbag ring with
    floodlights, a crate, an ammo can and a medkit.
  - **Collapsed ceiling** (building): a heap of slabs under a shaft of
    moonlight.
  - **Ammo cans** give 40 hot rounds (×1.5 damage, +1 pierce).

## Pier 9: the ferry finale

The third level (**Pier 9** on the title card, or **Level** in the panel).

- **Map:** warehouse lots (start: the harbour office, bottom left), the yard
  road, a container yard (a grid of stacks with a lane between every two, two
  wide cross lanes, reach stackers parked in some), the quay apron (crane
  rails, three gantry cranes whose legs you can walk between, light towers,
  bollards along the edge), and four piers out into the water. Water blocks
  movement but not bullets or sight. Pier 9 is the long one (1420 × 240 u)
  in the north-east, with a ticket booth, crate cover and lamps.
- **Finale:** stand at the flare post at the end of Pier 9 for 1 s. The flare
  goes up (a 1600 u noise, a red light over the pier end for 30 s), the
  ferry's horn answers, and the clock runs (**Pier 9: ferry arrives after**,
  60 s, 30–120). Waves of 12–18 (× horde size) come from land every
  `ferryTime / 5` s (8–14 s), out of sight 500–1300 u away along the walk;
  the director's own mobs wait. They pause while the Tank is on you. The
  ship sails into view for the last 24 s.
- **Boarding:** when she docks, a last wave of 18–26 comes, and the gangway
  comes down 330 u back from the end of the pier (1.2 s). Its foot (marked
  BOARD) is the goal once the gangway is mostly down. The safe-room arrow
  reads PIER 9, then GANGWAY.
- The holdout gate, two routes and landmarks don't apply on Pier 9; the
  finds and the graffiti do.

## Playtest kit

The **Playtest** group in the panel.

- **Rate each run** (on): after a win or a death, a card asks fun / difficulty
  / controls, three answers each, all optional. Re-tapping an answer clears
  it. While it's up, taps beside it don't restart (its **Play again** does;
  Enter, Space and a gamepad's A still restart).
- **Reports:** every finished run is saved on the device (newest 40), rated
  or not. **Copy report** / **Share** on the card, **Copy all reports** in
  the panel (falls back to a text box to select if the clipboard is
  blocked), **Clear reports**. A report is a few readable lines plus one
  JSON line with everything (including the changed settings, the OS and
  screen, and the fps average and 5% low over the run).
- **Daily map:** the seed comes from today's date (local calendar day), so
  everyone gets the same map on each level. The title chip shows today's best
  on this device (fastest win, otherwise furthest run). **New map** turns it
  off.

## Ben's traces

On by default (**Ben's traces (the one we left behind)** under **World**).
Visual only (decor, one candle glow, one medkit by his bed; no inspect text) plus a
whistle and a scuff of footsteps; seeded, placed after everything else so it
keeps clear of finds, features and graffiti. Every word is in
`src/world/ben-content.js`; placement in `src/world/ben-gen.js`; run time in
`src/game/ben.js`.

- **His look:** orange crayon (`#ff8a1e`), small lowercase words, and two
  googly eyes like the logo's. The pupils always point at what the mark is
  about. Eye marks glow faintly over the darkness (only with a clear line of
  sight).
- **His bed:** one per map, off the route (detour 650 u on the streets, 420 in
  the building, 600 at the docks), enclosed, dark if possible, at least
  1100 u from the start and away from the secret. Found = within 80 u (saved
  on the device). Out of sight within 700 u: the whistle, once a run. Within
  480 u: steam off the can. His map of the level (190 × 124 u) and the squad
  drawing (210 × 100 u) are chalked on open ground within ~500 u of the bed
  (turned, or a bit smaller, to fit).
- **Eyes:** 1 by the secret (within 80–140 u, looking at it), up to 3 every
  ~260 u from the walk to his bed, 1 outside each boarded room, 1 by the
  second vent, 1 inside the end safe room by the door.
- **The glimpse:** a spot 30–80% along the run, just off the walk, in the
  dark. Within 560 u, your beam on it for 0.14 s: the eyes blink and vanish
  with a scuff, leaving a fresh eye mark. Walk within 140 u without lighting
  it and it's just gone. Needs Night on.
- **Memory** (`localStorage`, this device): deaths, wins, beds found per
  level. Every third death: "you died N times. i counted." outside the first
  room. After a win, the next run on that level: "you got out. why come
  back?" (once). Second visit to a bed: "you found my bed again."; fourth on:
  "ok. you can stay. don't touch the rabbit."
- **The Morse lamp:** the lamp nearest where the walk turns off for his bed
  blinks B-E-N (unit 0.17 s, about 4.8 s a loop).

## World flavor: graffiti, posters, dens

On by default (**Graffiti, posters & survivor notes** under **World**). It's
visual only: no obstacles, so it never changes a route. Everything is placed
fresh from the map's seed, and every line lives in `src/world/lore-content.js`
for editing.

**The setting** (all original): Port Halvard, a harbor city. "The Drowse":
people who stopped sleeping, then stopped being people. Survivors call them
**drowsers**; the jumpy ones are **leapers**, the huge ones **brutes**.
Everybody blames **Slumbra**, Lullan Labs' sleep aid ("Sleep like the dead.").
Halvard Civil Response (HCR) put up curfew notices and promised boats at
**Pier 9**, every hour. The safe rooms are on the way to the pier, and the
survivors who got there first left their marks:

- **Odile** keeps a diary (her journal pages are in the street dens) and
  found a dog called **Biscuit** (whose MISSING posters are all over town).
- **Teo & Mags** argue on every wall ("WHO TOOK THE LAST CAN OF PEACHES" /
  "NOT ME — TEO" / "IT WAS TEO").
- **Big Lou** counts his kills generously ("LOU: 47 DROWSERS: 0").
- **The Tinkerer** builds hidden dens, signs with a gear with an eye in it,
  and leaves cryptic advice that happens to be exactly how the game works.
- In the building it's office and hospital life gone wrong: "HR IS ONE OF
  THEM", "REPLY ALL: RUN", Gary (employee of the month, slowest runner), the
  Slumbra trial's group B.

What a map gets:

- **Graffiti** (about 20 lines on the streets, 15 in the building): half
  along the way, half where you wander. Mostly jokes, some dark, some tips
  ("RED LIGHT CARS = DINNER BELLS", "LEAPERS JUMP. KNOCK 'EM OUT OF THE AIR.",
  "CHALK ARROWS LEAD TO GOOD STUFF", "SHINY IN THE DARK? LOOK CLOSER."). Two
  "PIER 9 →" (indoors "EXIT →") arrows point along the walk to the safe room.
  Plus loose doodles: smileys, a tic-tac-toe game, a cat, the Tinkerer's mark.
- **Safe-room walls:** five or so lines in each safe room. The start room's
  "PIER 9 →" points out of the door.
- **Posters** (12–18 on the streets, 8–11 indoors) in small groups on
  building fronts and corridor walls near the way.
- **Rooftop messages** (streets): four roofs near the way, one with a
  "PIER 9" arrow pointing at the goal.
- **Dens** (1–2 on the streets, 1 indoors) in a dead end or back room off the
  route, lit by candles you can spot from a distance: bedding, a stove, cans,
  a radio, the gear-and-eye mark, scribbled advice, two jokes on the "joke
  wall", and a journal page whose line is written out on the floor next to
  the camp (on two or three lines, or along an alley, if space is tight).
- **Scenes** (2–3): bus stop, lemonade stand, last stand, HONK IF ALIVE car,
  wedding car (streets); fridge note, whiteboards, reception desk (building).
- **No inspect text:** there is no caption box and no action to read
  anything. Every word is drawn in the world at a size you can read from
  above (graffiti 11–23 u, notes 11–14 u), so all players see the same
  things. The only on-screen texts are objectives (the holdout gate, the
  flare and the ferry), pickups and specials.

## Camera

- The view size is **470 units across the short screen axis** on every
  device, so the field of view feels the same on phones and tablets. That is
  exact in the top-down view; a tilted view is drawn larger the lower the
  camera (1% at 75°, 18% at true isometric, 24% at 25°), because the tilt
  squeezes the ground up and down the screen: it still shows more of it that
  way, and bodies stay readable.
- Look-ahead is 20% of the view: full while firing, 70% while aiming and 45%
  while just moving. You see more of where you're shooting. The lead is the
  same distance on screen whichever way you aim.
- Screen shake is trauma-based (trauma² feels right), tuned low for sustained
  SMG fire and punchy for the shotgun. The camera recoils back from each shot.

## Robustness rules (don't regress these)

1. Use Touch Events with `preventDefault` (only when cancelable) on the canvas.
   This blocks scrolling, pinch, double-tap zoom, the magnifier and synthetic
   mouse events. Pointer Events are only a fallback for touch-less browsers.
2. Every touch event re-checks the live `touches` list. A stick whose finger is
   gone is released, so a lost `touchend` can never leave a stick stuck.
3. All sticks are reset on pause, blur, tab hide, orientation change and
   restart.
4. `touchcancel` releases without triggering a tap-shove.
5. A touch id that starts again while a stick still owns it (its end event
   was lost) resets that stick first.
6. The layout (`src/layout.js`) is shared by the HUD drawing and the hit
   testing, so what you see is exactly what you can press.
7. Safe-area insets (notches, home indicator) are read from CSS `env()` and
   respected by the HUD and the fixed stick positions.

`tests/touch-controls.test.js` pins these rules down: `npm test`.

## Fallbacks

- **Desktop:** WASD/arrows to move, mouse to aim, click to fire, Space / F /
  right-click to shove, R to reload, Q/E/wheel to swap, Esc for the panel.
- **Gamepad** (standard mapping): left stick moves; the right stick aims and
  auto-fires past the ring, and RT fires along your facing even with the stick
  centred. RB/B shove, X reload, Y swap, Start opens the panel, A starts or
  plays again. It's useful as a reference for how twin-stick should feel.

## Presets (tuning panel)

- **Recommended:** the defaults above.
- **Fixed sticks:** classic pinned bases.
- **Floating:** spawns under the thumb but doesn't follow.
- **Arcade:** strong aim assist, low fire ring, smaller sticks.
- **Raw:** no assist, no smoothing, no saturation and a high fire ring. Use it
  to feel what the helpers are doing.

## Playtest checklist

- Can you circle-kite a mob while shooting behind you without the move stick
  drifting?
- Does the shove come out every time you tap, and never when you meant to aim?
- Do you ever fire when you only meant to aim? If so, raise the fire ring.
- Do thumbs land outside the stick near the screen edges? Try the radius and
  the split.
- In a dense horde, does aim assist help or steal your target? Compare 0% and
  45%.
- Dynamic vs floating vs fixed: which one do you stop noticing?
- Is the look-ahead comfortable, or does the camera swing too much?
- Can you deadstop a Hunter with a tap when you mean to? Does the 0.18 s
  window feel fair, too generous or too tight?
- Does mashing to break a pin feel fair at 5 taps, or panicky?
- Can you kite the Tank while shooting backwards without the move stick
  drifting? Can you read the rock throws in time to strafe?
- **Building level:** in tight corridors and doorways, does the look-ahead
  show enough of what's round the corner? Is shoving at a doorway (a
  chokepoint) reliable when the horde funnels in?
- **Massive hordes** (Horde size ×10–×25): does a shove still clear space in
  a packed crowd? Does aim assist still pick the zombie you meant, or does it
  jump around? Keep the debug read-out on and note the fps on your phone.
- **World flavor:** do people stop to read? Which lines get a laugh, and which
  tips actually teach something (alarm cars, deadstops)? Does anyone go
  looking for the candle-lit dens? Is the writing on the ground big enough to
  read on a phone, with the flashlight on it?
- **Holdout gate** (World → Holdout): is it clear where to stand? Is 30 s with
  the default waves tense or a slog? Try 20 s and 45 s.
- **Two routes:** do you understand the choice when you first see the breach?
  Which way do you take, and does the short way feel worth the nest?
- **Landmarks:** do you remember the gas station / helicopter afterwards? Did
  you lure a horde to the pumps on purpose?
- **Scavenging:** do you notice the chalk arrows, and do you follow them? Is a
  detour worth the extra hordes it costs? Does breaking into a boarded room
  feel risky but worth it? Did anyone find the secret without being told? Is
  standing still for 0.7 s to search tense, or just annoying?
- **Pier 9:** is the flare post easy to find? Is 60 s on the pier tense or a
  slog? Does the run back to the gangway feel like a dash or a death trap?
  Did anyone take a side pier for a stash?
- **Night Terror:** do players notice the breath puff and the heartbeat
  before the first hit? Does turning the flashlight on it feel like a
  weapon? Is it scary, or just annoying?
- **Ben:** what do players think happened to him? Do they notice that the
  eyes look at things, and follow them? Does anyone find his bed without
  being told, or read the map and go for the X? Did anyone notice the lamp?
  Ask "who is Ben?" after a session and write the answers down.
- **Rating card:** do people answer it, or skip straight to Play again? Copy
  the reports after a session and compare.
- **AI teammate:** does it get in your way, or stand in doorways you need?
  Is reviving (stand next to it, don't shoot, 3 s) easy to do in a fight? It
  often shoots Hunters before they pounce, so practise deadstops with it off
  (or its accuracy down).
