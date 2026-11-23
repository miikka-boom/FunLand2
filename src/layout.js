// Screen layout shared by the HUD renderer and the touch hit-testing, so what
// you see is exactly what you can press. All values are CSS pixels.
//
// Two control schemes (settings.controls):
//  - twin: a move stick on the left part of the screen, an aim stick on the
//    right, with reload and shove buttons up and right of the aim thumb.
//  - one:  one move stick anywhere on the screen; the gun aims and fires by
//    itself. A big SHOVE button sits in the bottom right corner, where a
//    right thumb reaches it, with reload above it.
// On narrow (portrait) screens the top bar takes two rows: health and the
// gun on the first, the clock and kills under it, then the boss/event bars.

/** Narrower than this, the top bar is laid out for a phone held upright. */
export const NARROW = 560;

export function computeLayout(w, h, safe, s) {
  const pad = 10;
  const R = s.stickRadius;
  const one = s.controls === 'one';
  const narrow = w < NARROW;

  const gearR = narrow ? 20 : 22;
  const gear = { id: 'pause', shape: 'circle', x: w - safe.r - pad - gearR, y: safe.t + pad + gearR, r: gearR };

  // Top bar: health on the left, the gun panel left of the pause button.
  const inner = w - safe.l - safe.r - pad * 2;
  let hpW;
  let swapW;
  if (narrow) {
    // Split what's left of the pause button between the two panels.
    const room = inner - gear.r * 2 - 8 - 8;
    hpW = Math.round(Math.min(176, room * 0.52));
    swapW = Math.round(Math.min(168, room - hpW));
  } else {
    hpW = Math.min(190, w * 0.24);
    swapW = Math.round(Math.min(176, Math.max(128, w * 0.19)));
  }
  const swap = { id: 'swap', shape: 'rect', x: gear.x - gear.r - (narrow ? 8 : 10) - swapW, y: safe.t + pad, w: swapW, h: 46 };
  const hp = { x: safe.l + pad, y: safe.t + pad, w: hpW, h: 46 };
  const topBottom = hp.y + hp.h;

  // The clock and kills: between the panels, or under them on a narrow screen.
  const stats = narrow ? { x: w / 2, y: topBottom + 8 } : { x: (hp.x + hp.w + swap.x) / 2, y: safe.t + 14 };
  // Boss / holdout / ferry bars.
  const bar = narrow ? { y: stats.y + 26, w: Math.min(280, inner - 40) } : { y: safe.t + 34, w: Math.min(280, w * 0.34) };
  // Edge arrows stay below the top bar.
  const topInset = narrow ? stats.y + 16 - safe.t : 50;

  let reload;
  let shove;
  let fixedMove;
  let fixedAim;
  if (one) {
    // One stick: SHOVE in the bottom right corner, reload above it. The stick
    // can start anywhere else, so its resting place is bottom centre-left.
    const shR = narrow ? 36 : 34;
    shove = {
      id: 'shove',
      shape: 'circle',
      x: w - safe.r - 18 - shR,
      y: h - safe.b - Math.max(30, h * 0.045) - shR,
      r: shR,
      hidden: !s.shoveButton,
    };
    const rR = 24;
    reload = {
      id: 'reload',
      shape: 'circle',
      x: shove.x + (narrow ? 4 : -shR - 16 - rR),
      y: narrow ? shove.y - shR - 22 - rR : shove.y + shR - rR,
      r: rR,
    };
    const stickY = h - safe.b - Math.max(110, R + 52, h * (narrow ? 0.15 : 0.2));
    fixedMove = { x: narrow ? Math.max(safe.l + R + 24, w * 0.4) : safe.l + Math.max(112, R + 54), y: stickY };
    fixedAim = { x: shove.x, y: shove.y }; // unused: there is no aim stick
  } else {
    // Action buttons sit up-and-right of where the right thumb rests, so a
    // short reach hits them but a normal aim touch never lands on them.
    const btnR = 28;
    reload = {
      id: 'reload',
      shape: 'circle',
      x: w - safe.r - 18 - btnR,
      // Scales with height so tablets keep the buttons above the resting thumb.
      y: h - safe.b - Math.max(188, R * 2 + 72, h * 0.45),
      r: btnR,
    };
    shove = {
      id: 'shove',
      shape: 'circle',
      x: reload.x - 78,
      y: reload.y - 28,
      r: btnR,
      hidden: !s.shoveButton,
    };
    const stickY = h - safe.b - Math.max(104, R + 44, h * 0.2);
    fixedMove = { x: safe.l + Math.max(112, R + 54), y: stickY };
    fixedAim = { x: w - safe.r - Math.max(124, R + 66), y: stickY };
  }

  return {
    w,
    h,
    safe,
    pad,
    one,
    narrow,
    // One stick: every touch that misses a button is the move stick's.
    splitX: one ? w : w * s.zoneSplit,
    buttons: [gear, swap, reload, shove],
    byId: { pause: gear, swap, reload, shove },
    fixedMove,
    fixedAim,
    hp,
    stats,
    bar,
    topInset,
  };
}

export function hitButton(b, x, y, slop = 8) {
  if (b.hidden) return false;
  if (b.shape === 'circle') {
    const dx = x - b.x;
    const dy = y - b.y;
    return dx * dx + dy * dy <= (b.r + slop) * (b.r + slop);
  }
  return x >= b.x - slop && x <= b.x + b.w + slop && y >= b.y - slop && y <= b.y + b.h + slop;
}
