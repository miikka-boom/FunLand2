# Twin-stick touch controls (Prototype 0)

This is the control scheme for the top-down horde game, with the default
values and the reasons behind them. Every number here can be changed live in
the in-game tuning panel (sliders button, top right). To lock in a different
feel, tune it on a phone, press **Copy tuning JSON**, and update the defaults in
`src/settings.js`.

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
| Aim smoothing | 0.02 s | The time constant is divided by deflection: angle noise from a thumb is about *pixel jitter ÷ deflection*, so small deflections get smoothed more and full deflection is nearly raw. A fresh touch snaps instantly with no lag. |
| Keep aim after release | 0.5 s | You keep facing where you shot, so the flashlight doesn't swing to your walking direction mid-fight. |
| Aim assist | 45%, 10° cone | Pulls the shot toward the best target in the cone. The cone widens for close (big) targets, the pull fades out at the cone edge, the target is sticky so it doesn't flicker in crowds, and it needs line of sight. The laser shows the assisted aim, so what you see is what you shoot. |
| Laser sight | on | Your thumb covers the action, so the laser does the precise aiming. The shotgun also shows its spread cone. |

The knob turns orange while firing, and the fire ring brightens.

## Shove (the L4D "get off me")

- **Tap the aim side** (≤ 220 ms, ≤ 14 px of travel, never reached the fire
  ring) = shove. Your thumb is already there, so it costs nothing to reach.
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

## Camera

- The visible world is **470 units across the short screen axis** on every
  device, so the field of view feels the same on phones and tablets.
- Look-ahead is 20% of the view: full while firing, 70% while aiming and 45%
  while just moving. You see more of where you're shooting.
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
5. The layout (`src/layout.js`) is shared by the HUD drawing and the hit
   testing, so what you see is exactly what you can press.
6. Safe-area insets (notches, home indicator) are read from CSS `env()` and
   respected by the HUD and the fixed stick positions.

## Fallbacks

- **Desktop:** WASD/arrows to move, mouse to aim, click to fire, Space / F /
  right-click to shove, R to reload, Q/E/wheel to swap, Esc for the panel.
- **Gamepad** (standard mapping): left stick moves; the right stick aims and
  auto-fires past the ring (or hold RT); RB/B shove, X reload, Y swap, Start
  opens the panel. It's useful as a reference for how twin-stick should feel.

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
