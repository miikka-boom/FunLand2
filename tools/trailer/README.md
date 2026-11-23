# We Left Ben: the 2-player co-op trailer

[`trailer/we-left-ben-coop-trailer.mp4`](../../trailer/we-left-ben-coop-trailer.mp4): 1:29, 1920×1080, 30 fps,
−14 LUFS. [`trailer/poster.jpg`](../../trailer/poster.jpg) is a still of the title card.

It sells the co-op version to two audiences at once:

- **New players**, who mostly play their friends in competitive games: it opens on
  *"You've beaten your friends a thousand times. / Ever saved one?"*, and its pitch in the
  middle is *"No trophies. No ranked. No randoms. Just you and your best friend."* The
  competitor is never named on screen.
- **People who know the game**: *"Now in 2-player co-op"*, *"Your teammate isn't a bot
  anymore"*, and the world they know (the first safe room's wall, the Witch, the Tank, the gas
  station, Pier 9, Ben's chalk drawing, and his orange crayon at the very end).

## The cut

| Time | Picture | On screen |
|---|---|---|
| 0:00 | Black | *You've beaten your friends a thousand times.* / *Ever saved one?* |
| 0:04 | A Hunter pins you; Sam sprints back and shoves it off | |
| 0:10 | Logo | NOW IN 2-PLAYER CO-OP |
| 0:13 | Both of you leave the first safe room (DAY 1 HERE. DAY 2 LEAVING. / day 3. you left.) | YOUR TEAMMATE ISN'T A BOT ANYMORE. |
| 0:20 | Two phones, each through its own survivor's camera | TWO PHONES. ONE NIGHT. |
| 0:26 | Back to back at a crossroads, HERE THEY COME! | WATCH EACH OTHER'S BACKS. |
| 0:29 | Sam goes down by a burning car; you pick Sam up | PICK EACH OTHER UP. |
| 0:34 | Creeping past the Witch... Sam wakes her (on the bar where the score comes back in) | DON'T WAKE HER. / SAM WOKE HER. |
| 0:42 | The Tank; a car alarm; the horde through the gas station, and the pump | |
| 0:51 | Pier 9: the flare, the LIBERTY BELLE comes in, ALL ABOARD! | GET EACH OTHER HOME. |
| 0:58 | Graveyard, Suburbia, the Junkyard, the office floor | NO TROPHIES. / NO RANKED. / NO RANDOMS. / JUST YOU AND YOUR BEST FRIEND. |
| 1:07 | Ben's chalk: "my squad", and one more standing apart | *We left Ben.* |
| 1:14 | Black | *Don't leave your friend.* |
| 1:17 | Logo | 2-PLAYER CO-OP · GRAB A FRIEND. |
| 1:23 | Outside the first safe room, in orange crayon: *can i come too?* (and someone whistles) | |

## How it's made

Everything in the picture is the game, filmed frame by frame; everything you hear is the game's.

- `capture.cjs` opens the real game in headless Chromium (Playwright) on a stage page
  (`stage.js`) with a virtual clock and a seeded `Math.random`, so every frame is exactly 1/30 s
  and a shot replays the same way every time. The game's own sound engine runs on an
  `OfflineAudioContext` in step with the frames, so each shot comes with its own sound, in sync.
  No server: the page's requests are answered from the repository.
- `shots.js` stages each shot: level, seed, settings, where people stand, what comes at them,
  and a camera. Player one ("YOU") is driven by a scripted pilot; player two ("SAM") is the
  game's own AI teammate, which already plays like a friend would: it covers you, pulls a Hunter
  off you, goes down and needs picking up. The HUD's "ALLY" reads "SAM" (patched as the page
  loads; the game in the repository is untouched).
- Most shots use the game's isometric 3D camera ("Streets along the screen" off) and a darker
  night than the default.
- `edit.py` cuts the shots against the game's main theme (`assets/music/menu.mp3`, the whistle
  theme that carries Ben's tune: 75 bpm, a bar every 3.2 s), with the Hunter's sting, hits built
  from the recorded effects, captions and the logo cards, then sets the loudness (−14 LUFS,
  peaks under −1 dBTP).

```
node tools/trailer/capture.cjs              # film every shot -> tools/trailer/out/shots/
node tools/trailer/capture.cjs witch        # just one
node tools/trailer/capture.cjs --preview --every 15 witch   # quick JPEG stills to check staging
node tools/trailer/capture.cjs --scout city:1337 --set '{"landmarks":true}' --area 1400,2000,2200,1100
python3 tools/trailer/edit.py               # cut -> tools/trailer/out/we-left-ben-coop-trailer.mp4
python3 tools/trailer/edit.py --sheet       # contact sheet of the cut
python3 tools/trailer/edit.py --frames 11.5,22 # full-size stills of the cut
```

Filming takes about 8 minutes and the cut about 2½. Needs Playwright with Chromium, ffmpeg, and
Python 3 with numpy and Pillow. Fonts come from Google Fonts on first run (Anton for captions,
Gochi Hand standing in for Ben's crayon font, which this machine doesn't have; both OFL) plus
Inter.

## Before it goes public

- **The music is licensed for the prototype only.** The score was made with YuE2 (weights CC
  BY-NC 4.0, see [docs/MUSIC.md](../../docs/MUSIC.md)): fine for pitching and playtests, not for
  paid ads or a store page. Swap the score in `edit.py` (`render_audio`) and re-run it; the cut
  sits on a 75 bpm bar grid.
- **The co-op is staged.** There is no networked 2-player mode yet: Sam is the AI teammate
  standing in for a friend, and the two-phone shot is the same moment rendered through both
  survivors' cameras. It shows how co-op would play, not a build anyone can download.
