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

The world is 3D. On most maps the camera looks north from high up (75°
above the horizon), so the streets run along the screen, left-right and
up-down. The other 3D camera is the isometric one: the map turned 45°, seen
from the south-west. **Every map type keeps its own camera**: the Building
starts in the isometric view at its highest tilt (70°), the other five with
the streets along the screen. Either way:

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

The **Camera** group in the panel shows and changes the camera of the map
type being played (its heading names it: "Camera · Streets"); each of the
six keeps its own values, saved as `key@map` (`cameraTilt@interior`). The
defaults:

| Setting | Default | Why |
|---|---|---|
| View | **3D** | *Top-down* shows the same world from straight above, flat: the baseline to compare the feel against. |
| Streets along the screen | **on** (Building: **off**) | The 3D view without a 45° turn: streets run left-right and up-down, and sticks are map directions. Costs the west-facing walls: only south faces show. Off: the isometric view, where both the west and the south walls of a room show, which is what an office floor of small rooms needs. |
| Tilt with streets along the screen | 75° | Nearly overhead: the ground is hardly squeezed, and a wall hides only 12 u of the 72-86 u doorway in it (at 35° it would hide 63 u). The top of the slider. |
| Isometric tilt | 25° (Building: **70°**) | For the isometric view (the switch off). Low is cinematic, but buildings hide a lot behind them; 35° is true isometric; 70°, the top of the slider, is nearly overhead: indoors the walls then hide little of the rooms behind them. |
| View size | 470 u | Zoom, per map type like the rest. |

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

## The tutorial: teaching the thumbs

**Tutorial** on the title card (first in the list, and in the panel's
**Level**). The first time the game opens on a touch device (no finished run
on it, never been through the tutorial) it is picked for you, with a "start
here" badge; it isn't saved, so picking another map is all it takes to skip
it. Once you reach its safe room the device remembers, and the next run is
the Streets.

It's a hand-built course (`src/world/tutorial-gen.js`), the same every time:
three short streets joined by short connectors, each shut by a gate in a wall
that runs east-west, so the camera, looking north, sees the bars face on.
It's kept short on purpose: eight lessons, about 3,800 u of walking (a bot
does it in under a minute, a first-timer in a couple of minutes). The
lessons are in `src/game/tutorial.js` (every word the player reads is in
`STEPS`, at the top), and the coaching is drawn by
`src/render/tutorial-render.js`.

| Lesson | What you do | Done when |
|---|---|---|
| (Hold your phone like this) | Touch only, not counted as a lesson: a black screen with a big photo of a phone held on its side, a hand at each end, the thumbs on the glass, and that one line | A tap anywhere (it fades into the game) |
| Move | Slide the left thumb, walk to the ring | You're in it |
| Aim | Right thumb inside the dashed ring, laser on a target behind the fence | 0.45 s of laser on one (or you've already hit one) |
| Fire | Push past the ring | The six in the pen are down |
| Reload | The world stops and the screen goes dark but for ⟳: tap it | Reloading: gate 1 opens |
| Shove | Walk on along the street; one bursts out of a door as you come by. The world slows as it closes in and stops once it's in reach, dark but for you, it and SHOVE: tap it. Then shoot it | It's down |
| Both thumbs | Five come down the street: walk back with the left thumb while you shoot with the right | Down: gate 2 opens |
| Don't shoot the car | The alarm car is in plain view a few steps from where you come in (ringed in red); four come along the street from beyond it | Down, and any alarm over: gate 3 opens |
| Run for it | A crowd comes up through gate 2 behind you; make for the safe room | You're in: the run is won |

- **As little to read as can be.** Nothing at the bottom of the screen
  (that's where the thumbs are): at most one short line at the top, centred
  on a dark pill, level with the health and gun panels (between them once
  they're up), as big as fits from 19 px down to 13, and under the panels
  on the smallest phones if it can't fit between them (`lineLayout`,
  tested down to 568 x 320: never cut short). Many steps say nothing at all:
  the gates and the walk to the door have only the arrow. A count goes on
  the end of the line, in amber ("2/6"); a lesson done shows a green ✓ for
  0.6 s. The words follow the device you last used: touch ("Tap to
  reload."), mouse and keys ("Press R to reload.") or a pad ("Press X to
  reload."). In the tutorials the clock and kill count are left off the top
  (the line has it), and nothing is written under the sticks: the ghost
  thumbs show it.
- **A button to press: the world waits for you** (`Tutorial.ask`). For ⟳
  and SHOVE the world slows to a stop (over 0.25 s; with a zombie coming at
  you, as it closes in, stopped once it's in shove reach), the screen goes
  dark but for the button (and you, and the one on you), a ring beats round
  the button and another goes out from it, and for touch a thumb taps it,
  resting off to one side so its label shows. Until you press it nothing
  else gets through (the game loop asks `Tutorial.events()`); a shove
  pressed before the one coming at you is in reach is held, and goes the
  moment it can land. Pressed, the dark lifts and the world is back up to
  speed in 0.3 s. A heartbeat sounds while the world waits with one on you.
  The scale is `Tutorial.timeScale()`; the lessons' timers, the nudges, the
  HUD's fade-ins and the coaching's animation run on real seconds
  (`Tutorial.clock`), so they carry on while the world waits. Day 2 lights
  SHOVE the same way at the boards: the world waits for the first shove once
  one would land (close, and facing them), then goes on with SHOVE still lit
  for the other two (`stop` set as it goes).
- **The gun always works.** Nothing empties it behind your back. The reload
  lesson comes straight after the shooting, with the gun part used (the
  ammo count isn't on screen yet, so it's set to 14 short of full if it's
  fuller than that). The shove lesson's zombie can't be shot down before
  the shove (bullets hit it, but it keeps its health until it's been
  shoved), so the shove is what works. A gun that clicks empty reloads
  itself, as everywhere: ⟳ is for topping up between fights.
- **How to hold it** (touch only, before the first lesson): a screen of its
  own. Black, a big photo of two hands holding a phone on its side, the
  thumbs on the glass (the phone a little over half the screen wide on a
  phone, the forearms coming up from below the bottom edge, the photo's own
  edges faded to black), a green ripple going out from each thumb in turn,
  and one line above it, "HOLD YOUR PHONE LIKE THIS". Nothing else is drawn (hud.js
  stops there: no HUD, sticks, buttons, arrow or line) until you tap
  anywhere; then it fades out over the game in the ✓ pause and the first
  lesson comes up (`drawTutorialIntro` / `introLayout` in
  tutorial-render.js, `Tutorial.intro()`). A tap where the pause or reload
  button would be only ends it (main.js turns any event into a plain tap
  while it's up). The input frame says which thumbs are down
  (`thumbs.left`, `thumbs.right`) and whether any finger came down since the
  last frame (`thumbs.landed`: a tap too quick for any frame to see it held
  still counts); the step has a `skip` for any other input, checked every
  frame, so with a mouse or a pad it goes at once.
- **The HUD, a part at a time** (both days): after the first screen only the
  two sticks show (with the tutorial's own line, arrows and rings); ⟳ comes
  in with the reload lesson, SHOVE when the shove is asked for (in the
  light), and everything else (health, ammo, the pause button, the threat
  arrows) with "both thumbs". Each part fades in over 0.5 s. A step's `hud`
  says what comes in (`HUD_PARTS` and `Tutorial.hud()` in tutorial.js, drawn
  by hud.js; the shove lesson calls `revealUpTo('shove')` as it asks). Day 2
  does the same: the sticks alone for the crates and the chalk, SHOVE alone
  (`reveal('shove')`) when it lights up at the boards, the rest for the
  fight; a course whose steps never say shows it all from the start. What hasn't
  come in can't be pressed either: `applyHudReveal` in layout.js marks those
  buttons hidden every frame, and the hit test skips hidden buttons (a touch
  there is just a touch on that side of the screen).
- **Nudges: doing it wrong.** Nothing can break the tutorial, but some wrong
  gestures stall a lesson for good (found by running wrong players through
  the game loop: tests reproduce each one). Each lesson lists `nudges`, each
  a condition on what the player has been doing this lesson (`Tutorial.watch`:
  thumbs down and for how long, taps that went nowhere, aiming that never
  fired, shoves that missed, standing still, not firing, second winds, no
  progress toward the lesson's spot) and one line. The first that applies
  takes the line, in amber, for 4 s; the same one can come back after 8 s.
  The first screen's ("Tap the screen to start.", after 6 s) appears under
  the phone and stays.

  | Lesson | Doing it wrong | Told |
  |---|---|---|
  | First screen | Nothing tapped for 6 s | Tap the screen to start. |
  | Move | Two short taps on the left / thumb down, not sliding / dragging the right thumb alone | Keep your thumb down and slide it. / Now slide it toward the ring. / Walk with your LEFT thumb. |
  | Aim | Tapping / no right thumb for 5 s | Don't tap: keep your right thumb down. / Use your RIGHT thumb now. |
  | Fire | Aiming 2.5 s without pushing past the ring / tapping | Push your thumb further, past the ring. / A tap shoves. Push past the ring. |
  | Reload | 5 s and no reload | Tap the round ⟳ button. |
  | The gates, the walk to the door | 8 s without getting closer to where the arrow points | Follow the green arrow. |
  | Shove | 4.5 s stopped and no shove / 4 s without shooting it after | Tap the SHOVE button. / Push past the ring to shoot. |
  | Both thumbs | Not firing with them within 450 u / standing still with one within 110 u | Right thumb: keep shooting! / Left thumb: back off! |
  | Run for it | 5 s without getting closer to the door | Don't fight: run for it! |
  | Day 2 | 12 s on the chalk / two shoves that miss the boards / 4.5 s stopped at the boards and no shove / 10 s on the secret / 8 s at an open gate or on the way to the boards | Look for white arrows. / Get right up to them. / Tap the SHOVE button. / Check the dead end. / Follow the green arrow. |

  Mouse and pad get their own words where it matters ("Click to shoot.").
  The report (Playtest) counts them under `tutorial.nudges`, and the
  readable line lists them, most first: that's where to add a guide.
- **Ghost thumbs** (touch only): a photo of a real thumb, nail up, its base
  fading out (the right one as it is, the left one mirrored), with a soft
  shadow under it, 48 px wide at the nail, on the half of the
  screen the gesture belongs to, at the resting stick positions: a thumb
  that lands and slides toward where you're going; one that stays inside
  the dashed ring and sweeps (aim); one that pushes past it while the ring
  lights orange (fire); and both at once for the pack (the left thumb
  slides away from them, the right one fires at them). No words under them.
  Each fades while your own thumb is on that stick, so it never covers the
  real one; while a button is asked for, the prompt takes their place (its
  tapping thumb is the same photo). A thin white ring round the fingertip
  says it's pressing.
- **The pictures** are in `assets/tutorial` (`hands.webp`, 37 KB, and
  `thumb.webp`, 21 KB, with transparency), made with Scenario's GPT Image
  2.5 model (Boom Corp's Default Project) and cut to size: the hands' edges
  faded to black, the thumb's base faded out along it. Where the phone, the
  fingers and the thumbs' pads are in the photo, and where the thumb's nail
  is, are written next to them in tutorial-render.js (`HANDS`, `THUMB`).
  Until they have loaded, and where there are no images (the tests), simple
  drawings of the same things stand in.
- **Where to go:** a big green arrow bobs over the lesson's spot while it's
  on screen (the ring, a gate's way through, the way to the door, a crate,
  the safe room); off screen, a big green edge arrow points at it (in the
  tutorials without words or metres). In the world: a bright dashed ring
  where to walk, brackets on the targets in the pen (orange on the one your
  laser is on), a red dashed pulse round the alarm car while its lesson is
  on, and red / amber / green beacons on the gates. None of it while
  there's a fight on.
- **Nothing on the walls:** no writing on the streets, no painted THIS WAY
  or SAFE ROOM, one car (the one not to shoot) and a little clutter, so
  what stands out on the way is what a lesson points at. Ben's one crayon
  line is in the safe room at the end. No "GATE OPEN" or second line under
  a call-out either.
- **What it holds back:** swapping, all the way through: the final game
  won't have weapon changing, so the tutorial plays with one gun (the gun
  panel doesn't swap and doesn't show the ⇄; pressing it clicks).
- **What it leaves out:** the Witch (too much for a first run), searching
  crates, the Hunter, the Tank and the Night Terror, the teammate.
- **Where the crowds come from:** a spot you can't see (off screen, or far
  off round a corner; `Tutorial.unseen` picks), so nobody pops up in plain
  view. The pack comes down row 2 from the far end, round the corner by gate
  2, so you see it coming across the screen; if you're already down that
  end, it comes up through gate 1 instead. The rush at the end comes up
  through gate 2, behind you: you outrun it.
- **Forgiving on purpose:** nobody dies. At 0 HP you get a second wind
  (55% HP, everything within 180 u thrown back and staggered, "CLOSE ONE!");
  the report counts them. Shoot the car and the game says so ("YOU SHOT THE
  CAR!": in the tutorials only your own shots set one off); the alarm brings
  two small waves (5, then 3) and goes quiet after 9 s instead of a panic
  event. A Witch seated from the
  tuning panel swipes once (or chases you for 5 s) and runs off.
  The director spawns nothing of its own (no wanderers, mobs, Hunters, Tank
  or Night Terror, whatever the panel says), and there's no teammate.
- **Tuning:** the numbers are at the top of `tutorial.js` (`AIM_HOLD`,
  `PAUSE`, `GATE_OPEN`, `RESCUE_HP`, `RESCUE_PUSH`, `PROMPT_IN`,
  `PROMPT_OUT`, `SLOW_FROM`, `BURST`); how many come in each fight is in its
  step.
- **The report** (Playtest) has a `tutorial` part: the lesson you reached,
  how many of them, the close calls, whether the alarm went off, and the
  seconds per lesson. The readable line names the three longest: that's
  where people get stuck.

### Tutorial 2: Day 2, the supply run

**Tutorial 2** on the title card, next to the first. Won Day 1 and its end
card leads here (**Play Tutorial 2**), and the next time the game opens it
is picked, with a "next" badge, until Day 2 is done too; after Day 2 comes
the Streets. The course (`src/world/tutorial2-gen.js`) shares Day 1's
helpers and frame, on a wider plan: every street is walked left to right,
each ending in a connector up to the next, which carries on to the right
(start room bottom left, safe room top right). The lessons are in
`src/game/tutorial-day2.js`, run by the same `Tutorial` (map.tutorial.day
picks the list), with Day 1's coaching all the way: one short line at the top
or none, the arrows, the ghost thumbs, the HUD a part at a time, and the
world stopping for a button. It teaches scavenging, on by default on the
Streets, with the game's own crates and boarded room (game/loot.js), so they
behave exactly as they will later. No Witch (the plan is for her to be off
by default).

| Lesson | What you do | Done when |
|---|---|---|
| Supplies | Stand on the crate outside the door | It opens (ARMOR +50) |
| Chalk arrows | Follow the chalk to a crate round a corner in a yard | It opens (HOT ROUNDS ×60): gate 1 opens |
| Break in | Walk up to a nailed door (no words: the arrow and a ring); SHOVE comes in, lit, the world waits for the first shove, then two more (or shoot them) | They break (loud) |
| The good stuff | The three shut in come out, the noise brings three down the street; then search the crate inside | All six down and the crate open (EXTENDED MAGS): gate 2 opens |
| The secret | A glint down a dead end: stand on the loose manhole | It opens (+25 MAX HP, FULL ARMOR, HOT ROUNDS ×150): gate 3 opens |
| Safe room | Get in | The run is won |

- **The counts:** the boards in shoves (0/3, worked out from their hit
  points, so shots count too; shown once SHOVE is lit), the fight as six.
- **What a crate says** when it opens: what it gave (ARMOR +50), and
  nothing more; the Streets' second line, how many of the map's you've
  found, is left out in the tutorials.
- **What the noise brings** comes down row 2 from the far end, round the
  corner before gate 2 (`Tutorial.unseen`, like Day 1's pack), so you see
  it coming across the screen; or up through gate 1 if you're already down
  that end.
- **The secret** gets the arrow but no ring on the ground: the glint is what
  to look for. Two of Ben's little eyes are on it.
- **Nothing on the walls** but the chalk arrows (they're the lesson): no
  writing, no painted words, no cars; Ben's one crayon line is in the safe
  room at the end.
- **Done** is remembered per day (`tutorialDone(day)`; Day 2's key is
  `funland2.p0.tutorial2.v1`). The report's line says "Tutorial 2".

## Special infected: stress tests for the controls

The Hunter and the Tank are off by default (**Hunter + Tank** under
**Specials**), and so is the Night Terror. The Witch is on.

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

### The Witch: leave her be

On by default (**Witch** under **Specials**; switching it restarts the run,
because where she sits is part of the map). One per map. Everything about
her is in `src/game/witch.js`; where she sits, in `src/world/witch-gen.js`.

- **Where:** a seeded pass seats her at least 950 u along the walk from the
  start and 750 u from the goal, on open ground with room around her: four
  maps in five within 110 u of the way, otherwise up to 340 u off it. She
  keeps clear of stashes (230 u), medkits, fires, alarms, anything that
  explodes, the holdout switch (620 u), the breach, checkpoints, landmarks
  and the pier at the end of Pier 9. With her whole space walled off, the
  goal must still be reachable for at most 430 u of extra walking; a map
  with no such spot has no Witch (rare: the Building with every world
  feature on).
- **Finding her:** sobbing every 1.5–2.7 s and a tune she hums (from about
  800 u), the light of her phone (a 92 u pool that also makes her visible in
  the dark), "SOMEONE IS CRYING" at 640 u, and after that a "CRYING" pointer
  at the screen edge while she is off screen within 720 u, for whoever plays
  with the sound off. Usually a sprayed warning 240–640 u before her.
- **Her space** is 170 u: a dashed ring, drawn once you are within about
  340 u. Inside it, with a clear line between you (a wall hides you), her
  patience runs out in 0.8 s at 62 u or closer, about 2 s at 100 u and
  5–6 s at 130 u; at the very edge she only stirs.
- **Your flashlight** (nights) on her from within 300 u: 2.2 s close up,
  about 4 s from 230 u. Aim somewhere else and it stops. Further off than
  300 u she would be off your screen, so it doesn't count.
- **Shots** fired within 200 u of her each cost a little patience (7.5% for
  an SMG round at point-blank; more for louder guns, less with distance).
  The teammate's gun doesn't count.
- **Patience** is the ring: the solid arc is what's gone. 1.1 s after the
  last bother it starts to come back (7 s from the brink). At 18% she lifts
  her head ("SHE HEARD YOU…"); the tune stops, her eyes show, and she
  growls. **Witch patience** scales all of it.
- **Startled** by a full ring, or at once by any damage or a shove: 0.95 s
  on her feet, screaming (she doesn't move yet: shoot, or run), then she
  runs down whoever did it at 285 u/s (× zombie speed; you run at 190). The
  first swipe does 45, the rest 18 every 0.42 s (× zombie damage). A shove
  as she comes in makes her stumble for 0.45 s, once every 2.4 s. 900 HP
  (× **Witch health**), and bullets barely push her back. If she lands
  nothing for 22 s, or the teammate she came for is down, she runs off.
- **Caught sitting** from within 120 u, whatever hits her in that instant
  counts ×6: a pump shotgun's full pattern (within about 85 u) kills her
  outright. From further off the same blast only wakes her.
- **Left alone** she is passive: aim assist, the teammate (its bullets pass
  through her), the threat arrows and the Tank's swing all ignore her. Get
  460 u further along the walk than she is, with her still seated, and it's
  "LEFT HER IN PEACE".
- **The phone** stays where she dropped it, lit for about 16 s.
- **No recordings:** her voice is synthesised like every other sound here.

**Pacing:** the first Hunter comes after 18–28 s of build-up, and always by
22% of the route. After that, a new one comes every 25–45 s while none is
alive (the relax phase halves that clock). The tuning panel has **Spawn
Hunter**, **Spawn Tank**, **Spawn Night Terror** and **Spawn Witch** buttons
for testing on demand (the Witch is seated about 330 u ahead of you).

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
  close. It never fires through you, never sets off car or fire alarms, and
  never wakes the Witch (it doesn't aim at her, and its bullets pass through
  her while she sits). Once she is up, she is its first target.
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

One of the six map types (**Pier 9** on the title card, or **Level** in the
panel).

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

## Out of town: Suburbia, the Graveyard, the Junkyard

Three more map types, each a seeded generator of its own
(`src/world/suburbia-gen.js`, `graveyard-gen.js`, `junkyard-gen.js`; what
they share is in `gen-kit.js`) with its own ground, models and lines. All
three start with the streets along the screen, take the finds, the writing
and Ben with the streets' numbers, and have no holdout gate, second route or
landmarks. On every seed the goal can be walked to and at least 98.5% of
the open ground is connected (tested with a body's width, not a point).

- **Suburbia** (5632 × 3456 u): 5 × 3 blocks between streets with sidewalks.
  Most blocks are two rows of lots back to back, some with an alley between
  the rows: a house (one or two storeys under a pitched roof, 60–94 u tall,
  solid), a driveway, a garage, a porch light on some, a fenced backyard.
  Fences are thin (they stop feet, not bullets or sight) and have 96 u
  gates, so every yard can be walked into and the yards are a second way
  through each block. One block each is the park (a ballfield, a closed
  playground), the strip mall (a row of shops behind a parking lot with
  light towers) and the school (buses in the lane). Alarms: parked cars as
  in town, and the ice-cream truck.
- **Graveyard** (5184 × 3392 u): 6 × 4 sections between gravel paths.
  Lanterns stand along the gate avenue and the cross avenue and hardly
  anywhere else, and the night is darker here. Headstones (800–1000 of
  them) stand one to a 32 u cell, every second cell along a row and every
  third row, so a body always passes between two stones and a lane runs
  between rows; they stop feet, not bullets or sight. Mausoleums, the
  chapel and the columbarium walls are solid. The pond is water: it blocks
  feet only. The office in the maintenance yard is the one building a
  boarded room can be in.
- **Junkyard** (4992 × 3200 u): the front lot (office trailer, weighbridge,
  workshop), then a grid of yard cells with a lane between every two (some
  wide enough to be roads), then the back lot. A cell holds stacks of
  wrecks (94 × 48 u a car, 2–4 high: solid, they block bullets and sight),
  or scrap heaps, tyre stacks, appliances, containers, a bus. The clearing
  in the middle has the crusher, the crane and the floodlights. Wrecks left
  in the lanes never close one. Few lamps work.

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
- **His bed:** one per map, off the route (detour 420 u in the building, 600
  at the docks, 650 everywhere else), enclosed, dark if possible, at least
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

**The setting:** roughly Philadelphia, 2020. On top of everything else that
year came "the Drowse": people who stopped sleeping, then stopped being
people. Survivors call them **drowsers**; the jumpy ones are **leapers**,
the huge ones **brutes**. Everybody blames **Slumbra**, Lullan Labs' sleep
aid ("Sleep like the dead."). The city put up stay-home and curfew notices
and promised boats across the Delaware from **Pier 9**, every hour. The safe
rooms are on the way to the pier, from the Delco lawns through the cemetery
and the salvage yards to Center City.

What is real and what isn't: the place names are real and used loosely
(Center City, Market St, Broad St, Delaware Ave, Penn's Landing, Delco,
Southwest Philly, the Schuylkill, 311). Slumbra, Lullan Labs and every
venue are made up (Wissahickon Hill Cemetery, Cracked Bell Auto Salvage, Elm
St Elementary, the ferry LIBERTY BELLE, the shops), and no real brand or
person is named, Ben Franklin aside. The year shows in the notices (masks,
six feet, essential trips, curbside pickup, remote learning, a postponed
Broad Street run) and in what people wrote ("YOU'RE ON MUTE", "CLASS OF
2020: WE MADE IT (SOME)"). The survivors who got there first left their
marks:

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

- **Graffiti** (about 20 lines outdoors, 15 in the building): half along
  the way, half where you wander. Out of town and on the docks a place's own
  lines come first, then a few from town. No line is ever written over
  another (or over the words a map came with: road paint, ledgers, chalk). Mostly jokes, some dark, some tips
  ("RED LIGHT CARS = DINNER BELLS", "LEAPERS JUMP. KNOCK 'EM OUT OF THE AIR.",
  "CHALK ARROWS LEAD TO GOOD STUFF", "SHINY IN THE DARK? LOOK CLOSER."). Two
  "PIER 9 →" (indoors "EXIT →") arrows point along the walk to the safe room.
  Plus loose doodles: smileys, a tic-tac-toe game, a cat, the Tinkerer's mark.
- **Safe-room walls:** five or so lines in each safe room. The start room's
  "PIER 9 →" points out of the door.
- **Posters** (12–18 on the streets, 8–11 indoors, 10–15 in the suburbs, a
  handful on the chapel or the yard's trailer) in small groups on building
  fronts and corridor walls near the way.
- **Rooftop messages** (streets): four roofs near the way, one with a
  "PIER 9" arrow pointing at the goal.
- **Dens** (1–2 on the streets, 1 indoors) in a dead end or back room off the
  route, lit by candles you can spot from a distance: bedding, a stove, cans,
  a radio, the gear-and-eye mark, scribbled advice, two jokes on the "joke
  wall", and a journal page whose line is written out on the floor next to
  the camp (on two or three lines, or along an alley, if space is tight).
- **Scenes** (2–3): bus stop, lemonade stand, last stand, HONK IF ALIVE car,
  wedding car (streets); fridge note, whiteboards, reception desk (building).
  Out of town the same scenes in local dress: the school bus stop by the
  road, the flower stall at the cemetery ("TODAY: FREE"), hubcaps for sale.
- **No inspect text:** there is no caption box and no action to read
  anything. Every word is drawn in the world at a size you can read from
  above (graffiti 11–23 u, notes 11–14 u), so all players see the same
  things. The only on-screen texts are objectives (the holdout gate, the
  flare and the ferry), pickups and specials.

## Camera

- The view size is **470 units across the short screen axis** on every
  device (and by default on every map type; it is a per-map setting like
  the view and the tilts), so the field of view feels the same on phones
  and tablets. That is
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

- **Tutorial** (hand someone a phone and say nothing): do they read the
  line at the top, or copy the ghost thumb? Does the dashed ring make sense
  after the aim lesson, or only after fire? When the world stops, do they
  find the lit button at once, or tap around first (the no-reload and
  no-shove nudges say)? Does the zombie bursting out read as "too close", and
  do they know to shoot it after? Does anyone stand at an open gate without
  the words (the lost nudge)? Do they really use both thumbs on the pack, or stand and shoot?
  Do they run for the safe room at the end, or turn and fight? Which lessons
  are slowest (the report's longest line)? Who sets off the alarm, and does
  the next car survive in their first real run?
- **Tutorial 2**: do they follow the chalk, or need the edge arrow? Do they
  shove the boards or shoot them, and does "loud" register? Do they spot
  the glint by themselves, or follow the arrow to it?
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
- **The Witch:** do players stop when they hear her, or walk straight in?
  Do they read the ring without being told? Does keeping the light off her
  with the right stick come naturally? When she is up: a plan, or panic?
  Did anyone try the shotgun at arm's length?
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
