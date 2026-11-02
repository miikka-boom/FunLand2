// Pure virtual-stick math. No DOM here so it can be unit tested in Node.
//
// Conventions: screen pixels in, normalised vectors out. "raw" is the thumb's
// deflection as a fraction of the stick radius (0..1, clamped). "mag" is the
// shaped output after dead zone, saturation and response curve.

/**
 * Shape a stick deflection.
 * - Radial dead zone (not per-axis) so diagonals behave like cardinals.
 * - Rescaled after the dead zone so output starts at 0 instead of jumping.
 * - Saturation: deflection >= `saturation` already yields full output, so the
 *   thumb never has to hunt for the rim to get full speed.
 */
export function shapeStick(dx, dy, radius, deadzone, saturation, curve) {
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6 || radius <= 0) return { x: 0, y: 0, mag: 0, raw: 0, nx: 0, ny: 0 };
  const raw = Math.min(dist / radius, 1);
  const nx = dx / dist;
  const ny = dy / dist;
  let mag = 0;
  if (raw > deadzone) {
    const span = Math.max(1e-6, saturation - deadzone);
    const t = Math.min((raw - deadzone) / span, 1);
    mag = curve === 1 ? t : Math.pow(t, curve);
  }
  return { x: nx * mag, y: ny * mag, mag, raw, nx, ny };
}

/**
 * Dynamic ("follow") stick: when the thumb travels past the rim, drag the
 * base along so the thumb sits exactly on the rim. Reversing direction then
 * responds immediately instead of first crossing the whole stick.
 * Mutates `base`. Returns true if the base moved.
 */
export function dragBase(base, px, py, radius) {
  const dx = px - base.x;
  const dy = py - base.y;
  const d = Math.hypot(dx, dy);
  if (d <= radius || d < 1e-6) return false;
  const k = (d - radius) / d;
  base.x += dx * k;
  base.y += dy * k;
  return true;
}

/** Fire on/off with hysteresis so the trigger doesn't flicker on the ring. */
export function fireState(wasFiring, raw, threshold, deadzone, hysteresis = 0.06) {
  // A ring at/below the dead zone means "fire as soon as the aim is valid".
  const on = Math.max(threshold, deadzone + 1e-3);
  if (wasFiring) return raw >= on - hysteresis;
  return raw >= on;
}

/** A tap: short, didn't travel, never reached the fire ring. */
export function isTap(durationMs, travelPx, crossedFireRing, maxMs, maxPx) {
  return !crossedFireRing && durationMs <= maxMs && travelPx <= maxPx;
}

/**
 * Aim smoothing time constant. Angular noise from a thumb is roughly
 * (pixel jitter / deflection), so smooth more at small deflections and
 * barely at all at full deflection.
 */
export function aimTau(baseTau, raw) {
  if (baseTau <= 0) return 0;
  return baseTau / Math.max(raw, 0.25);
}

/** Exponential angle smoothing that takes the short way round. */
export function smoothAngle(current, target, dt, tau) {
  let d = target - current;
  d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  if (tau <= 0) return current + d;
  const k = 1 - Math.exp(-dt / tau);
  return current + d * k;
}
