# The We Left Ben trailer

A 1:46 music-video trailer for prototype 0 (and a 30-second spot cut down from it): two survivors (you and the AI teammate) running and
fighting their way from Center City to the last ferry at Pier 9, cut to an angry, epic 140 BPM track.
Every frame is the game itself, running and filmed frame by frame. The scenes are staged with the
game's own systems (bigger crowds, a Tank or a mob on cue, god mode), and the titles, grade and
flashes are added in the edit.

| File | Role |
|---|---|
| `tools/trailer/rig.mjs` | The camera rig: runs the game in headless Chromium on a fake clock and films it |
| `tools/trailer/shots.mjs` | The shot list: 22 staged scenes across five maps (`npm run trailer:shots`) |
| `tools/trailer/beats.py` | Beat and energy analysis of the soundtrack, in plain numpy |
| `tools/trailer/edit.py` | The edit: cuts, titles, grade, flashes, shake, the sound mix (`npm run trailer:edit`, `npm run trailer:spot`) |
| `tools/trailer/soundtrack.mp3` | The music (106 s, 139.75 BPM) |
| `tools/trailer/soundtrack.json` | How the music was generated: model, sections, seed |

The render (about 66 MB) is not in git. `trailer-shots/` (the filmed frames, about 1.2 GB) and
`trailer*.mp4` are ignored.

## Making it again

```
npm run trailer:shots   # films every shot into trailer-shots/ (about 4 minutes; Chromium + Playwright)
npm run trailer:edit    # cuts trailer.mp4 (about 6 minutes; Python 3 with numpy and Pillow, ffmpeg)
npm run trailer:spot    # cuts trailer-30s.mp4, the 30-second spot (about 2 minutes)
```

`node tools/trailer/shots.mjs --preview --out DIR pier_flare orbit` films some shots at a third
of the frames, with a contact sheet per shot (`DIR/<shot>.jpg`) and the shot's sound log
(`DIR/<shot>.json`). `python3 tools/trailer/edit.py --stills DIR` writes a frame every half second
of the cut instead of a video, to check the edit. `--from` and `--to` render part of it, and
`--video-only` / `--audio-only` let you render in parts and join them with ffmpeg's concat demuxer.

## How the rig films the game

- **Served from the repo.** Playwright answers the page's requests from the working tree, so no
  web server is needed. On the way through, `src/render/hud.js` gets a cinematic mode: the damage
  vignette and the game's big callouts (scaled up, optionally only the big ones, minus the lines in
  `T.hide`), and none of the sticks, buttons or panels.
- **A fake clock.** `requestAnimationFrame` and `performance.now` only move when the rig says so. A
  film frame is exactly 1/30 s of game time however slow it is to draw, and slow motion is a
  smaller step (`speed` in a shot). `Math.random` is seeded, so a shot replays the same way.
- **No audio context.** The game's sound calls are logged instead (`T.log`), with the frame they
  happened on: that's how the edit knows the explosion in `gas_station` is at 2.13 s.
- **Two survivors.** The teammate is the game's own AI (`ally: true`). You are an autopilot
  (`T.auto`): walk to the goal, a point or a heading, aim at the best target in reach (or a fixed
  point: a pump, an alarm car), shove what's on you. God mode keeps you up; the teammate is kept
  on its feet too (`T.allyGod`), except in `ally_down`.
- **A camera of its own.** `T.cam` overrides the game's camera: follow you, the pair or a thing
  (the Tank), or hold still; any yaw (the renderer copes with every angle, so `orbit` circles the
  fight), pitch and zoom, a lead ahead of or behind the runners.
- **Set pieces on cue.** Helpers place the survivors (`T.place`), spawn crowds (`T.crowd`), clear a
  stage (`T.clear`), find a point along the route (`T.routePoint`) and reach the game's own
  modules (`T.mods`): `spawnTank`, `startle` for the Witch, `detonate` for the gas station.

## The cut

The soundtrack's bars land on 18.52 + k × 1.7175 s (`beats.py` finds the beat grid; the downbeats
are the beats where the low end hits hardest). The edit follows its sections:

| Time | Music | Picture |
|---|---|---|
| 0:00 | Four booms, then near silence | The city at night; "day 3. you left." on the safe-room floor; Ben's "my squad" drawing; the two step out. "THE LAST FERRY LEAVES FROM PIER 9." |
| 0:18 | The build | "HERE THEY COME!", then the run through four maps. "THEY DON'T SLEEP." "THEY DON'T STOP." A car alarm. "NEITHER DO WE." The Tank in slow motion |
| 0:39 | The drop | The gas station blows on the downbeat. The Tank, the orbit, the Witch, one cut a bar. "TWO AGAINST" / "EVERYTHING." |
| 1:06 | The breakdown | The teammate goes down. "NOT AGAIN." Up again on the hit at 1:09.9 |
| 1:13 | The climax | Pier 9: "FLARE UP!", the waves down the pier, the LIBERTY BELLE comes alongside. "HOLD THE LINE." "NOBODY GETS LEFT BEHIND." "ALL ABOARD!" |
| 1:40 | The last hit | The logo. "HE KEEPS LEAVING SIGNS." Then, in orange: "ben was here" |

### The 30-second spot

`--cut 30` (`npm run trailer:spot`) is its own edit list in `edit.py`, on a cut-down of the same
music. Four pieces of the soundtrack, joined on downbeats: the build's first boom (17.92–21.94 s),
the bar before the drop and six bars of the drop (37.38–49.38 s), the climax's first four bars
(73.38–80.24 s), and its last two bars with the final hit and the ring-out (97.38–104.51 s). At
each join the next piece comes in 10 ms early with a 10 ms equal-power crossfade, so the downbeat
lands whole, and a hit (the Tank's roar, the climax's flash, a shotgun) sits on top of it.
Picture: "HERE THEY COME!", the graveyard run, the Tank, the gas station on the drop, the Tank
fight, the orbit, the Witch, "TWO AGAINST" / "EVERYTHING.", "FLARE UP!", the ferry, "NOBODY GETS
LEFT BEHIND.", "ALL ABOARD!", the logo. Exactly 30.0 s, about −14 LUFS.

Sound: the music at −2.5 dB, a few of the game's own recorded effects on the hits (a horde's
screams, the Tank's roar slowed down, the explosion, the Witch's scream, punches, the flare,
thunder under the logo), through a limiter: about −15 LUFS, −1 dBTP.

## The music

Generated with ElevenLabs Music Advanced v2.5 through Scenario (`soundtrack.json` has the exact
sections and the seed; the same settings make the same track). Two takes were made; this one
(seed 1103) sits right on 140 BPM, has four booms in the intro for title cards, a near-silent gap
before the build, and the loudest, brightest climax. Its use follows ElevenLabs' terms
(https://elevenlabs.io/terms) and the plan of the account that made it.
