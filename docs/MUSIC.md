# Music: the dynamic score for prototype 0

The zombie run plays a Left 4 Dead–style score: quiet dread while you explore, rising tension,
a horde cue when a mob hits, and set pieces for the Tank, the Witch and the Pier 9 finale. All
of it is instrumental orchestral horror rendered with YuE2 in the ai-music-studio project. The cues
are cut from HQ renders: the same takes re-synthesised at 64 steps instead of 32.

| File | Role |
|---|---|
| `assets/music/*.mp3` | 34 cues: MP3, VBR about 110 kbps stereo, 20 MB in total |
| `assets/music/cues.js` | Loop points per file. Generated; do not edit by hand |
| `src/game/music-director.js` | Decides which cue should play. Pure logic, tested in `tests/music.test.js` |
| `src/music-player.js` | Plays the cues through WebAudio: gapless loops, crossfades, stingers, a 150 MB decoded-audio cap |
| `src/main.js` | Calls both every frame |

The settings panel has a separate **Music** volume slider. It applies on top of the main volume, and 0 turns the music off. The old synth Tank theme in
`src/audio-synth.js` stays silent while file music is on. The sound effects have their own path and mix: see [SFX.md](SFX.md).

## What plays when

Higher rows win:

| Situation | Cue |
|---|---|
| Title screen | `menu`: the whistle theme, which carries Ben's tune |
| You died | `end_dead`, played once |
| Safe room reached / aboard the ferry | `end_saferoom` / `end_rescued`, played once |
| Pier 9: flare fired | `finale_hold`, then `finale_escape` for the last 24 s and while docked |
| Holdout gate running | `holdout` |
| The Tank is on you (within 1000 units) | `tank` |
| The Witch is up | `witch_angry`, which rings on for 6 s after |
| Car or fire alarm | `panic` |
| A mob ("HERE THEY COME!") | `horde_a`–`horde_d`, rotating per mob (the Building level adds `horde_chase`). It holds while 4+ zombies are close and lets go 22 s after the fighting thins |
| Seated Witch within 700 units | `witch_near` |
| A Tank is alive somewhere | `tank_near` |
| Director building up (intensity ≥ 0.45 or 3+ close) | `tension_a` / `tension_b` |
| Still in the start room | `saferoom` |
| Exploring | Dread bed: two per level, picked by run number (`bed_<level>_a` / `_b`) |

The specials fire short stingers on top of the music, which dips under them:
- **Hunter:** `sting_hunter`, when each Hunter first comes within 750 units.
- **Night Terror:** `sting_terror`, the first time each Terror is lit.

Beds sit at about half the level of the action cues. Action cues cut in within 0.4–1 s, and dread fades back over 5 s.

Only a few cues are decoded at a time. The player preloads the likely next ones every second (the next
horde in the rotation, the tension cue, the Tank or Witch cue when they're around) and drops the
least recently used ones above 150 MB, so phones don't hold the whole score in memory.

## Changing the music

Cues are cut from renders in the ai-music-studio project:
- The source list is `Outputs/who_ate_bob/l4d_game/picks.toml`. It points at the HQ renders in
  `Outputs/l4d_game_hq/renders/*__hq64.wav`.
- Render a new pick's HQ version first: add a `[[remaster]]` entry at 64 steps and run it with `studio.yue2_batch`.
- To rebuild, run `python -m studio.game_loops Outputs/who_ate_bob/l4d_game` with the YuE2 venv's python.

The tool finds bar-aligned seamless loops, levels every cue to the same loudness, encodes MP3,
copies the files here and rewrites `cues.js`. To add a cue the director doesn't know yet, also add it
to `music-director.js` and the test.

**License note:** YuE2's weights are CC BY-NC 4.0, so this music is fine for the prototype and
playtests but not for a commercial release.
