// Screen layout shared by the HUD renderer and the touch hit-testing, so what
// you see is exactly what you can press. All values are CSS pixels.

export function computeLayout(w, h, safe, s) {
  const pad = 10;
  const R = s.stickRadius;

  const gear = { id: 'pause', shape: 'circle', x: w - safe.r - pad - 22, y: safe.t + pad + 22, r: 22 };
  const swapW = Math.round(Math.min(176, Math.max(128, w * 0.19)));
  const swap = { id: 'swap', shape: 'rect', x: gear.x - gear.r - 10 - swapW, y: safe.t + pad, w: swapW, h: 46 };

  // Action buttons sit up-and-right of where the right thumb rests, so a
  // short reach hits them but a normal aim touch never lands on them.
  const btnR = 28;
  const reload = {
    id: 'reload',
    shape: 'circle',
    x: w - safe.r - 18 - btnR,
    // Scales with height so tablets keep the buttons above the resting thumb.
    y: h - safe.b - Math.max(188, R * 2 + 72, h * 0.45),
    r: btnR,
  };
  const shove = {
    id: 'shove',
    shape: 'circle',
    x: reload.x - 78,
    y: reload.y - 28,
    r: btnR,
    hidden: !s.shoveButton,
  };

  const stickY = h - safe.b - Math.max(104, R + 44, h * 0.2);
  const fixedMove = { x: safe.l + Math.max(112, R + 54), y: stickY };
  const fixedAim = { x: w - safe.r - Math.max(124, R + 66), y: stickY };

  return {
    w,
    h,
    safe,
    pad,
    splitX: w * s.zoneSplit,
    buttons: [gear, swap, reload, shove],
    byId: { pause: gear, swap, reload, shove },
    fixedMove,
    fixedAim,
    hp: { x: safe.l + pad, y: safe.t + pad, w: Math.min(190, w * 0.24), h: 46 },
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
