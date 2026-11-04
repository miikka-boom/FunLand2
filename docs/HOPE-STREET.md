# Hope Street (metagame prototype)

A landscape, mobile-first metagame for a co-op zombie survivor game,
prototyped **on its own**: a **simulated PLAY button** stands in for the
action game. It lives in [`hope/`](../hope) and runs as a separate page at
`/hope/` (on Pages: `https://miikka-boom.github.io/FunLand2/hope/`, locally
`http://localhost:8080/hope/` with `npm start`).

You hold an old firehouse on one city street. Strangers come to your gate,
each one randomly generated. You take them in if you have a bed. For every
run you pick a crew of up to four of your people. Story runs reclaim the
street one building at a time, and every building you take back becomes a
facility for your people.

The brief was **base building**, **taking people in**, **randomly generated
characters**, and **choosing who you play with in the next run**. The other
prototypes are [Road to Evac](METAGAME.md) at `/evac/` (a journey with
instant upgrades), the [Safehouse](SAFEHOUSE.md) at `/safehouse/` and the
v1 [camp](METAGAME-CAMP.md) at `/camp/`. Hope Street shares no rules with
them.

## What it keeps from Road to Evac

The Road to Evac feedback was "simple and understandable". Hope Street keeps
what made it so:

- **There's one obvious next step.** PLAY opens today's runs, with the story
  run first. The goal card names the building being reclaimed, the step
  (1–3) and what it unlocks. A coach bubble names the best next step after
  a few idle seconds: someone at the gate, beds, an upgrade, the story, or a
  scavenge when the story is too hard.
- **Building is instant.** Facilities upgrade the moment you pay, and
  nothing you build waits on a timer.
- **There are two currencies.** **Scrap** comes from runs and pays for
  facilities. **Gems** pay for revives, healing someone now, calling a
  visitor now, and bringing the convoy early.
- **Every button acts or says why it can't.** Anything irreversible
  (letting someone go) or costing gems asks first, in a dialog that names
  the person or the price.

## The loop

```
   strangers at the gate ──► take them in (needs a free bed)
            ▲                          │
            │                          ▼
   rescues, convoy, radio      pick a crew of up to 4 for a run
            ▲                          │
            │                          ▼
   facilities ◄── scrap ◄──── the run: XP for the crew, maybe injuries
                                story runs reclaim the next building
```

1. **The gate.** A visitor card shows the person's face, name, age, former
   job, role, grade, level, power, traits and one line of what they say.
   You choose **Take in** or **Turn away**. With no free bed, **Make room**
   offers the next bed upgrade, or a swap with someone you'd let go.
2. **PLAY** opens the runs board: the story run plus two scavenges, a quick
   one and a big haul. Each card shows the run's tags and the roles they
   favor, your best crew's power against the power needed, your odds, and
   the rewards.
3. **Crew.** Four slots, pre-filled with last time's crew topped up with the
   best fit. Tap someone below to add them, tap a crew member to drop them,
   and tap the crown to choose who you play. Each portrait shows why they
   fit, for example "Scout +25%" or "Night owl +25%". The power meter and
   your odds update live, and **Best crew** shows how much power it would
   gain.
4. **The run** is simulated. You see the crew's portraits and health, and a
   story ticker written from their names, roles and traits ("Aino patched
   up Ville in a stairwell"). If the crew wipes after 30% of the route, a
   revive offer appears.
5. **Results** show stars and scrap on one side, and each crew member's XP
   bar filling up on the other, with level-ups and injuries. Someone
   rescued or found waits at the gate, and visitors who knocked during the
   run are listed too.
6. **Reclaim.** After the third story run for a building, the camera pans
   to it. The fog lifts, the lights come on, the barricade moves one
   building down, and a reveal card names the new facility.

## People

Everyone is generated from a seeded random stream (`hope/src/people.js`):

- A first and last name from an international pool, Finnish names
  included. About 60% of Elites (★★★) also get a nickname, like "Doc" or
  "Wrench".
- An age from 18 to 70, a former job that fits their role (a nurse becomes
  a Medic, a bike courier a Scout), a quirk ("Brought a cat. The cat
  stays.") and a pitch line for the gate.
- A **look**: skin tone, face shape, 12 hairstyles, natural or dyed hair
  colour, beards, glasses, hats, scars, freckles and earrings. People over
  50 get wrinkles and, more often, grey hair. Their clothes follow their
  role: scrubs, a tactical vest, overalls, a hoodie or a leather jacket.
  `hope/src/portrait.js` draws a portrait and a small street figure from
  the same look, so you can spot people in the yard.
- One of **five roles**. Each run tag favors one role, and every crew
  member with that role gets **+25% power** on the run:

  | Role | Favored by | Also |
  | --- | --- | --- |
  | Bruiser | Indoors | |
  | Shooter | Horde | |
  | Medic | Toxic | The whole crew gets hurt 40% less (up to 2 medics) |
  | Scout | Night | +10% scrap per Scout (up to 2) |
  | Mechanic | Machines | |

- A **grade**: ★ Survivor, ★★ Skilled or ★★★ Elite. Power is grade base +
  growth × (level − 1): 20 + 5, 26 + 6.5 or 32 + 8, up to level 10.
- **Traits**:
  - Elites have two good ones.
  - The others get one to three, mostly good, sometimes a bad one.
  - Clashing traits never meet (no Night owl who is also Loud).

  | Trait | Effect |
  | --- | --- |
  | Night owl, Steady hands, Tunnel rat, Iron lungs, Tinkerer | +25% power on runs with their tag (Night, Horde, Indoors, Toxic, Machines) |
  | Lucky | +15% scrap on their runs |
  | Quick learner | +30% XP |
  | Tough | half as likely to get hurt |
  | Born leader | +6% power for the whole crew |
  | Loud, Claustrophobic, Squeamish | −20% power on their tag's runs |
  | Clumsy | gets hurt more often |
  | Stubborn | −20% XP |

- **Levels come from playing.** The crew gets XP from every run, more for
  more stars. With the Gym, people who stay home train every day. People
  never cost scrap.
- **Injuries** are the reason to have more than four people. Whoever goes
  down in a lost run is hurt for 2–3 days. A won run has a 10% chance per
  member of a 1-day knock.
  - **A day passes with each run.** Hurt people heal at home and can't be
    picked until they do.
  - Gems heal someone right away (3 per day left).
  - The Infirmary makes injuries rarer and shorter.

Newcomers arrive one level behind your best four, so they can catch up.
They also lean toward roles you don't have yet, and your first two visitors
always do.

## The street

Eight buildings, left to right. The Firehouse is yours from the start.
Each of the others is reclaimed by a chain of three story runs (a run, a
rescue, a reclaim), and becomes a facility at level 1. Facilities go to
level 5, and every upgrade is instant.

| Building | Facility | Effect (level 1 → 5) | Story runs |
| --- | --- | --- | --- |
| Firehouse | Bunks | 4 → 8 beds | yours from the start |
| Rosie's Diner | Kitchen | +10% → +50% XP for everyone | Back Alley · Walk-in Freezer · Rosie's Last Stand |
| Hardware Store | Workshop | +5% → +25% crew power | Parking Lot · Stockroom · Closing Time |
| Iron Gym | Training | 15 → 70 XP a day for everyone at home | Rooftop Track · Locker Room · Heavyweight |
| Mercy Clinic | Infirmary | 15% → 45% fewer injuries; heal 1–2 days faster from level 2 | Ambulance Bay · Isolation Ward · Code Black |
| Starlite Motel | Rooms | +3 → +12 beds | Neon Lot · Room 17 · Checkout |
| K-HOPE Radio | Radio | visitors every 25 → 13 min, 3–4 can wait, Elites 8% → 25% | Transmitter Field · Studio B · On Air |
| The Overpass | (the end) | seals Hope Street | Traffic Jam · School Bus · Seal the Street |

What you see on the street:

- The **barricade** in front of each building shows its facility level. It
  starts as junk and crates, then becomes a wooden palisade, sheet metal,
  metal with spikes, and finally concrete.
- Facility levels also add things to the building itself: string lights
  and sandbags, rooftop gear (a water tank, solar panels or planters), a
  floodlight, and a flag.
- Each facility gets a yard prop: picnic tables and a grill, a workbench, a
  punching bag, cots and an IV stand, a laundry line, or a speaker.
- Your people wander the yard and gather at the fire. Visitors wait outside
  the gate and walk in when you take them. Someone you let go walks out.
- The infected shamble on the street and beyond the frontier barricade.

**Rescue runs** (the second run of each chain) always bring a Skilled or
Elite survivor to the gate. **Scavenges** have a chance: 8% on a quick run,
30% on a big haul. A big haul also has a 25% chance of 2–4 gems. Scavenges
never move the story, but they always pay scrap and XP, and the one you
played is replaced by a new site.

## Wait rewards

There are two, and both bring people:

- **A visitor at the gate**, the short wait: every 30 minutes, faster with
  the Radio. The first one comes after a minute and the second three
  minutes later. Two can wait (three or four with the Radio). They never
  leave on their own, so missing one costs nothing. You can call someone
  right away for 5 gems.
- **The convoy**, the long wait: every 8 hours. It brings about 1.5 runs'
  worth of scrap, 5–10 gems, and a Skilled or Elite survivor, a level ahead
  of your newcomers. Rushing it costs 4 gems per hour left.

A run also moves the street's clock forward by its length, about five
minutes. That's how long a real run takes, so visitors arrive at the same
pace relative to your runs as they would in the shipped game, even though a
simulated run takes seconds.

## Odds, rewards and pacing

- Chance to survive = `0.62 + 1.1 × (crew power / needed − 1)`, clamped to
  8–98%. Stars come from the same ratio plus some noise. The very first run
  always survives with 3 stars.
- Scrap: each chain has a base (30 → 140); a reclaim pays ×1.8. Stars
  multiply it by ×1, ×1.25 or ×1.5, then Scouts, Lucky and co-op friends
  add their bonuses. A death keeps 15% + 35% × the share of the route you
  covered. Reclaims also pay gems (15 → 60).
- **Recommended power** per story run is derived from a target pace
  (`hope/tools/derive-recs.mjs`). A simulated player plays a fixed schedule
  and its best-crew power becomes the recommendation. The result is
  smoothed, with a bump at each reclaim.
- `npm run hope:balance` checks the pacing with a simulated player
  (`hope/tools/player.mjs`). It does 3 sessions a day of 5 runs each. It
  takes visitors in while it has beds and swaps when a clearly better one
  comes along. It spends scrap as the coach suggests, brings the best crew,
  plays the story at 55% odds or better, and otherwise scavenges.

  Over 20 seeds:

  ```
  Rosie's Diner    reclaimed at run  3
  Hardware Store   reclaimed at run 11
  Iron Gym         reclaimed at run 16
  Mercy Clinic     reclaimed at run 24
  Starlite Motel   reclaimed at run 32
  K-HOPE Radio     reclaimed at run 39
  The Overpass     reclaimed at run 48 (median; 41–67)
  ```

  That's about 4 hours of real play. By then the street holds about 15
  people, out of 20–25 visitors.

## Meta ↔ game contract

This is where the action game plugs in.

- `Meta#loadout(key, ids, friends)` builds a **RunLoadout** for a run.
- The meta banks a **RunResult** with `Meta#applyRun()`.
- The simulator (`hope/src/run-sim.js`) produces the same RunResult the
  game should send.

**RunLoadout** (meta → game):

```json
{
  "run": { "key": "story", "kind": "story", "name": "Walk-in Freezer", "type": "rescue", "tags": ["indoors"], "level": "interior", "rec": 95 },
  "you": { "id": 3, "name": "Aino Laine", "role": "medic", "grade": 2, "level": 4, "traits": ["nightOwl"] },
  "bots": [{ "id": 1, "name": "Ville \"Wrench\" Salo", "role": "mechanic", "grade": 3, "level": 5, "traits": ["tinkerer", "tough"] }],
  "friends": 1,
  "favored": ["bruiser"],
  "workshop": 0.1,
  "power": 182
}
```

**RunResult** (game → meta):

```json
{ "won": true, "stars": 2, "progress": 1, "kills": 81, "killsBy": { "3": 40, "1": 31 }, "timeS": 324, "downed": [], "friends": 1, "squad": [3, 1] }
```

`downed` lists who went down in a lost run; they're the ones who get hurt.
`squad` is your people in the run, the one you played first.

How the action game would use the contract:

- `run.level` picks the map: `interior` (the Building level) for Indoors
  runs, `city` (Streets) otherwise. `run.type` picks the mode:
  - `run`: reach the safe room
  - `rescue`: find the survivor, bring them home
  - `finale`: clear the building and hold it
  - `scavenge`: grab and go

  `rec` sets the Director's difficulty.
- `you` is the character you play. `bots` are your AI teammates, swapped
  for real players in co-op.
  - A role is a loadout: a Bruiser shoves harder, a Medic carries kits, a
    Scout moves faster, a Mechanic gets traps, a Shooter gets a better gun.
  - `favored` roles get the +25% the meta already counts in `power`.
- Tag traits (Night owl, Tunnel rat, etc.) can become small in-game
  bonuses on their tag's runs. Lucky, Quick learner, Tough and Born leader
  are applied by the meta.
- **Stars** in the real game should come from how the run went, not from
  power: for example, 1★ for reaching the end, plus one star for nobody
  going down and one for beating par time. Power and `rec` are only the
  simulator's stand-in for skill.
- **Injuries**: report who went down (`downed`). The meta decides how long
  they're out.

## Testing tools

The gear (top right) or the <kbd>`</kbd> key opens a drawer with:

- **Runs**: by power, always survive, or always die.
- **Time**: warp +10 min, +1 h, +8 h or +1 day; **Visitor now**;
  **Convoy ready**.
- **Cheats**:
  - +500 scrap
  - +50 gems
  - win the next story run
  - reclaim the next building
  - everyone +2 levels
  - heal everyone
  - max beds
- **Economy (live)** sliders: run rewards, upgrade costs, recommended power,
  XP, time between visitors, time between convoys and volume.
- **Pacing log** for each building: the run, day, play time and street time
  when it was reclaimed, plus people stats.
- **Save**: copy, load, or reset (two steps).

`window.__hope` exposes the meta, clock, street, HUD and actions in the
console.

## Playtest checklist

- Is a new face at the gate exciting? Do you read their card, or skim it?
- Do you ever turn someone away? Do you ever let someone go? How does that
  feel?
- Do you change the crew for a run on purpose, for the favored roles, a
  trait, or to level up someone new? Or do you leave the suggested crew?
- Does an injury make you rotate people, or does it feel like a punishment?
- Do the beds limit feel like a goal ("build the Motel") or a wall?
- Does a reclaim feel like a moment: the pan, the lights, the barricade
  moving?
- Which facility do you upgrade first, and why?
- Does the street feel like *your* place by the third building?

## Code map

```
hope/index.html, hope.css   page shell and styles (shared parts come from Road to Evac)
hope/src/config.js          all content and numbers: roles, tags, traits, grades, buildings, story, scavenges, rewards
hope/src/people.js          the person generator: names, jobs, quirks, looks, traits (pure, seeded)
hope/src/meta.js            the rules (pure, no DOM): people, the gate, beds, facilities, runs, injuries, convoy, advice, loadout
hope/src/run-sim.js         simulated run -> RunResult, with a ticker written from the crew's names and traits
hope/src/portrait.js        portraits and street figures drawn from a person's look
hope/src/art.js             the street: buildings by level, barricades, props, skyline, zombies
hope/src/street.js          the scrolling street: walkers, visitors, fog, the reclaim cinematic
hope/src/hud.js             day, beds, scrap and gems, the gate and convoy, PEOPLE / BUILD / goal / PLAY, the coach
hope/src/screens.js         gate, make room, people, person, build, runs, crew, results, reveals, convoy, intro
hope/src/main.js            wiring and the frame loop
hope/src/run-view.js, ui.js, fx.js, audio.js, icons.js, dev.js, save.js, clock.js, util.js, format.js
hope/tools/                 player.mjs (the simulated player), balance-sim.mjs (npm run hope:balance), derive-recs.mjs
tests/hope-*.test.js        rules, generator, art
```
