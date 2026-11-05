# Station 9 (metagame prototype)

A simpler, guided take on [Hope Street](HOPE-STREET.md), with a tutor
character. Like the other metagame prototypes it runs on its own: a
**simulated PLAY button** stands in for the action game. It lives in
[`station9/`](../station9) and runs as a separate page at `/station9/` (on
Pages: `https://miikka-boom.github.io/FunLand2/station9/`, locally
`http://localhost:8080/station9/` with `npm start`).

The brief: make a variation of Hope Street that is **even simpler**, with
**more onboarding**, and test **a tutor character who introduces things**.
The aim is a meta that feels immersive and satisfying, and is easy to get
into.

## The idea in one paragraph

You come to at Station 9, an old firehouse on Hope Street. **Mae**, its
retired fire captain, and **Biscuit**, her dog, took you in. Mae shows you
around one thing at a time, then steps back. She keeps a hint bar on screen
and gives one-time tips when something new happens. Strangers knock on the
gate; take them in while you have beds. **PLAY always plays the next run on
the street**: you go, plus up to three of your people. Every few runs a
building comes back, and it becomes something for your people.

## Simpler than Hope Street

| | Hope Street | Station 9 |
|---|---|---|
| Who you play | anyone in the crew | **you**: a character you pick at the start, always in the crew |
| Roles | 5 (Bruiser, Shooter, Medic, Scout, Mechanic) | **3** (Fighter, Scout, Medic) |
| Traits | 14 | none |
| Currencies | scrap and gems | **scrap only** |
| Buildings | 8, 5 levels each | **5** (plus the overpass), **3 levels** each |
| What PLAY does | opens a board: story run plus two scavenges | **plays the next run**, no board |
| Run tags | several per run, favoring roles and traits | **one** per run (Night, Horde, Toxic), favoring one role |
| Getting hurt | injured for days; heal with gems | **rests for one run**, never you; a Medic on the crew prevents it |
| Full beds | make room, swap, let go | upgrade the Bunks, or let someone go from their card |
| Gem sinks | revive, heal, call a visitor, rush the convoy | none |
| HUD at the start | everything | **nothing**: each piece appears when Mae introduces it |
| Direction | a coach bubble after a few idle seconds | **Mae**: a guided start, her hint bar, tips |

What stays from Hope Street: generated people with faces and stories, the
gate, beds as the limit, picking who goes, the street you take back one
building at a time, instant upgrades, and the reclaim moment (the pan, the
lights, the barricade moving).

## Mae

Mae is how the player learns, and also the warmth of the place. Everything
she does goes through `station9/src/tutor.js`:

- **Her speech box.** Her face, her name and one short line at a time. The
  text types out with a quiet murmur of a voice (synthesized, one blip per
  syllable, a different pitch each time) and her face changes with the line:
  smile, talking, proud, worried, a wink. Tap to finish the line, tap again
  for the next.
- **The spotlight.** When she talks about something, the rest of the screen
  dims, a gold ring pulses around the thing and a hand points at it. When she
  wants you to *tap* it ("Tap PLAY"), only that thing can be tapped. If its
  screen gets closed early, she opens it again; she never leaves you stuck.
- **Her box moves** to the top or bottom of the screen, wherever it covers
  what she points at least.
- **On the street** she walks around the yard near the fire, with Biscuit at
  her heels. Tap her for the next step; tap Biscuit and he barks (and she has
  something to say about him). When someone reaches the gate, Biscuit runs
  over and barks.

### The guided start

The first session is scripted, in six checkpoints. Each one knows whether
it's already done, so a reload carries on where you left off. Testers can
**Skip intro** (the pill on her speech box, or the testing drawer).

| # | Checkpoint | What happens | Done when |
|---|---|---|---|
| 1 | Hello | Mae introduces herself and Biscuit, then "Who are you?": three people to choose from, one of each role. | you've picked who you are |
| 2 | The gate | A knock, Biscuit barks. Tap the stranger. Mae explains their role and stars, then "Take them in". The beds counter appears. | 2 people |
| 3 | The first run | The diner. PLAY appears. The crew screen: you always go, the run favors Scouts. GO. Results: XP, then scrap (the scrap counter appears). | the first run is won |
| 4 | Full house | A second, Skilled stranger. Three people, three beds: "We're full." Tap the firehouse, upgrade the Bunks. | Bunks level 2 |
| 5 | The diner | PLAY, the horde favors Fighters, GO. The diner comes back with the reclaim cinematic and a reveal, with a word from Mae. | the diner is yours |
| 6 | That's the job | The gate opens for walk-ins (its timer appears) and the convoy starts. Mae's hint bar appears: "Tap me any time." | done |

The first two runs always succeed with three stars, so the first upgrade
(15 scrap) is always affordable and the first building always comes back.

### What appears when

| HUD piece | Appears |
|---|---|
| Beds (top left) | after you pick who you are |
| PLAY (bottom right) | when Mae first points at it |
| Scrap (top) | on the first results screen |
| The gate (left) | at the end of the guided start |
| Mae's hint bar (bottom left) | at the end of the guided start |
| The convoy (left) | when the first convoy arrives, or after six runs as a promise |

### One-time tips

After the guided start Mae only speaks when something is new, once each:

| Tip | When |
|---|---|
| A hard run | the crew screen shows Hard or Deadly odds: what the bar means and what to do about it |
| The first loss | after its results: you keep half the scrap and the XP; who got hurt and that a Medic stops that |
| Resting | the first crew screen with someone resting |
| An Elite | the first three-star visitor |
| No bed | the first time you try to take someone in with no bed: the Bunks screen opens |
| Bunks maxed | no bed and nothing left to build: let someone go from their card |
| A rescue | the first person rescued on a run is waiting at the gate |
| An upgrade | after a few runs, the first time a facility upgrade is affordable |
| The convoy | when it first arrives: "Tap the truck" |
| Max level | the first person to reach level 5 |
| Welcome back | after 15 minutes or more away: who's at the gate, or the convoy |

### The hint bar

Mae's face and her best next step, always on screen at the bottom left. Tap
it (or Mae on the street) and she says it out loud and points at it: someone
at the gate, the Bunks when you're out of beds, the convoy, an upgrade you
can afford (upgrades are instant and permanent, so scrap is best spent right
away), or the next run. The line goes away on your next tap
anywhere, and that tap still counts.

## The loop

```
   strangers at the gate ──► take them in (needs a free bed)
            ▲                          │
            │                          ▼
   rescues, the convoy         PLAY: you + up to three people
            ▲                          │
            │                          ▼
   upgrades ◄──── scrap ◄──── the run: XP for everyone who went
                              every few runs a building comes back
```

1. **The gate.** A visitor card: face, name, age, former job, role and
   what it's good for, stars, power, one line of what they say. **Take in**
   (needs a free bed) or **Not now**. With no free bed the button opens the
   Bunks instead.
2. **PLAY** opens the crew screen for the next run, already filled with
   Mae's pick: you plus the three best people for this run. The banner names
   the run's tag and the role it favors; a bar shows the crew's power
   against what the run needs, labeled Easy, Fair, Hard or Deadly. Tap a
   teammate to drop them, tap someone on the bench to bring them. **GO**.
3. **The run** plays as a short simulated ticker (tap to fast-forward).
4. **Results**: the title, stars, scrap, and everyone who went with their
   XP pips filling up and any level-ups. Taking a building back plays the
   cinematic and a reveal with a word from Mae.

## People

- **Three roles.** Each run has one tag, and the role it favors gets
  **+50% power**:
  - **Fighter**: Horde runs. Hits hardest.
  - **Scout**: Night runs. Each Scout in the crew finds **+20% scrap** (up to
    two).
  - **Medic**: Toxic runs. With a Medic in the crew, nobody gets hurt on a
    lost run.
- **Stars** are potential: Survivor ★, Skilled ★★, Elite ★★★. Power is
  `base + per × (level − 1)`: ★ 10 + 5, ★★ 14 + 6, ★★★ 18 + 7.
- **Levels 1–5.** XP to the next level: 2, 8, 16, 30. A run gives everyone
  who went 2 XP (1 on a loss), plus the Kitchen's bonus. Training gives
  everyone at home XP after every run.
- **You** are one of three Skilled people offered at the start, one per
  role. You always go on runs and you never get hurt.
- Newcomers arrive a level behind your best people, so they're useful soon.
  No two people share a first name.
- **Losing a run** sends one teammate (never you) to rest for the next run,
  unless a Medic came along.

## The street

| Building | Facility | Levels 1 / 2 / 3 | Upgrade costs |
|---|---|---|---|
| Station 9 (yours) | Bunks | 3 / 5 / 7 beds | 15, 50 |
| Rosie's Diner | Kitchen | +1 / +2 / +3 XP for the crew after every run | 30, 70 |
| Hardware Store | Workshop | +10 / +20 / +30% crew power | 40, 90 |
| Iron Gym | Training | +1 / +2 / +3 XP for everyone at home | 50, 110 |
| K-HOPE Radio | Radio | a visitor every 9 / 7 / 5 minutes, 15 / 22 / 30% Elite | 60, 130 |
| The Overpass | | bring it down and the street is sealed | |

### The story

14 runs, one after another. The last run of each building takes it back.

| Building | Runs (tag, power needed) | Scrap per run |
|---|---|---|
| Rosie's Diner | Back Alley (Night, 25), **Rosie's Last Stand** (Horde, 40) | 10 |
| Hardware Store | Parking Lot (Toxic, 62), Stockroom (rescue, Night, 76), **Closing Time** (Horde, 104) | 14 |
| Iron Gym | Rooftop Track (Night, 128), Locker Room (rescue, Toxic, 146), **Heavyweight** (Horde, 168) | 18 |
| K-HOPE Radio | Transmitter Field (Toxic, 180), Studio B (rescue, Night, 190), **On Air** (Horde, 206) | 22 |
| The Overpass | Traffic Jam (Night, 212), School Bus (rescue, Toxic, 220), **Seal the Street** (Horde, 232) | 26 |

Finales pay double. Stars multiply the scrap (×1, ×1.25, ×1.5) and a lost
run brings home half. Rescues bring someone Skilled (75%) or Elite (25%) to
the gate. After the street is sealed, PLAY keeps playing patrols.

### Visitors and the convoy

- **The gate**: a walk-in every 12 minutes (60% ★, 32% ★★, 8% ★★★); the
  Radio makes it faster and better. Two can wait. A run takes five minutes
  of street time, so someone new turns up every two or three runs.
- **The convoy**: the first one comes 25 minutes after the guided start, then
  every 8 hours. It brings about two runs' worth of scrap and someone Skilled
  (70%) or Elite (30%) at the level of your best people.

## Odds and pacing

Survive chance = `0.62 + 1.1 × (power / needed − 1)`, between 8% and 98%.
The crew screen shows it as a bar against the needed mark, labeled Easy,
Fair, Hard or Deadly.

`npm run station9:balance` plays the street with a simulated player who
does what Mae suggests and has three sessions a day. Over 40 seeds:

| Building back | Median run (p25–p75) |
|---|---|
| Rosie's Diner | 2 (the guided start) |
| Hardware Store | 6 (6–7) |
| Iron Gym | 10 (10–11) |
| K-HOPE Radio | 15 (14–16) |
| The Overpass (sealed) | 19 (18–21) |

So the street is sealed after about 19 runs (16–29), with around five
losses on the way. That's about one and a half hours of real runs at five
minutes each. Station 9 is meant to be short and complete: a first session
that ends with a building back and a full idea of the loop, then a handful
of sessions to finish.

## Meta ↔ game contract

This is where the action game plugs in.

- `Meta#loadout(ids)` builds a **RunLoadout** for the next run, `ids` being
  the crew with you first.
- The meta banks a **RunResult** with `Meta#applyRun()`.
- The simulator (`station9/src/run-sim.js`) produces the same RunResult the
  game should send.

**RunLoadout** (meta → game):

```json
{
  "run": { "name": "Parking Lot", "type": "run", "tag": "toxic", "level": "city", "rec": 62 },
  "you": { "id": 2, "name": "Toni Rossi", "role": "medic", "stars": 2, "level": 3 },
  "teammates": [{ "id": 5, "name": "Malik Okafor", "role": "scout", "stars": 1, "level": 2 }],
  "favored": "medic",
  "workshop": 0.1,
  "power": 70
}
```

**RunResult** (game → meta):

```json
{ "won": true, "stars": 2, "progress": 1, "kills": 81, "timeS": 324, "crew": [2, 5] }
```

How the game would use it:

- `run.level` picks the map (`city` streets for runs, `interior` for rescues
  and finales); `run.type` picks the goal: reach the safe room, find the
  survivor, or clear the building and hold it. `rec` sets the Director's
  difficulty.
- `you` is the character you play; `teammates` are AI bots, swapped for
  real players in co-op. A role is a loadout: Fighters shove and hit harder,
  Scouts move faster and spot loot, Medics carry kits.
- The `favored` role gets the +50% the meta already counts in `power`. In the
  game, the tag can be the level's twist: darkness, a big horde, gas.
- **Stars** in the real game should come from how the run went (for
  example, one for reaching the end, one for nobody going down, one for par
  time), not from power.

## Testing tools

The gear (top right) or the <kbd>`</kbd> key opens a drawer with:

- **Mae**: skip the guided start, start over (two steps), Mae's voice on/off.
- **Runs**: by power (the first two always make it), always make it, always
  lose.
- **Time**: +5 min, +30 min, +8 h; **Visitor now**; **Convoy now**.
- **Cheats**: +100 scrap, win the next run, take back the next building,
  everyone +1 level, max Bunks.
- **Economy (live)** sliders: run rewards, upgrade costs, power needed, time
  between visitors and volume; haptics on/off.
- **Pacing log**: the run and play time when each building came back, plus
  stats.
- **Save**: copy and load.

`window.__s9` exposes the meta, clock, street, HUD, Mae and actions in the
console.

## Playtest checklist

- Does Mae feel like a person or like a tutorial? Is her voice charming or
  annoying? Do you read her lines?
- Is there a moment in the guided start where you want to do something she
  hasn't let you do yet? Where do you first want to skip?
- After the guided start, do you know what to do without her? How often do
  you tap her hint bar?
- Do the one-time tips arrive at the right moment, or interrupt?
- Does picking who you are matter to you? Do you notice yourself on the
  street and in the crew?
- Is anything from Hope Street missed: traits, gems, the runs board, more
  roles?
- Does a building coming back still feel like a moment?

## Code map

```
station9/index.html, s9.css   page shell and styles (the base comes from Hope Street; the Station 9 section is at the end)
station9/src/config.js        all content and numbers: roles, tags, stars, buildings, story, rewards, odds, the convoy
station9/src/people.js        the person generator: names, jobs, quirks, looks (pure, seeded)
station9/src/meta.js          the rules (pure, no DOM): you, people, the gate, beds, facilities, runs, resting, convoy, advice, loadout
station9/src/run-sim.js       simulated run -> RunResult, with a ticker written from the crew's names
station9/src/tutor.js         Mae: speech box, spotlight, the guided start's checkpoints, tips, the hint bar's answer
station9/src/portrait.js      portraits and street figures, Mae (five expressions) and Biscuit
station9/src/art.js           the street: buildings by level, barricades, props, skyline, zombies
station9/src/street.js        the scrolling street: walkers, Mae and Biscuit, visitors, fog, the reclaim cinematic
station9/src/hud.js           beds, scrap, the gate and the convoy, Mae's hint bar, PLAY; each piece revealed when introduced
station9/src/screens.js       who are you, the visitor, the crew, results, a building, people, a person, reveals, the convoy
station9/src/main.js          wiring, when Mae gives tips, the run flow and the frame loop
station9/src/run-view.js, ui.js, fx.js, audio.js, icons.js, dev.js, save.js, clock.js, util.js, format.js
station9/tools/               player.mjs (the simulated player), balance-sim.mjs (npm run station9:balance), derive-recs.mjs
tests/station9-meta.test.js   the rules
```
