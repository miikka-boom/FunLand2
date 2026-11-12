// Numbers and durations as text.

/** 950 -> "950", 1234 -> "1.2k", 12345 -> "12k", 1.5e6 -> "1.5M". */
export function fmtNum(n) {
  n = Math.floor(n);
  const a = Math.abs(n);
  if (a < 1000) return String(n);
  if (a < 10000) return `${trim((n / 1000).toFixed(1))}k`;
  if (a < 1e6) return `${Math.floor(n / 1000)}k`;
  return `${trim((n / 1e6).toFixed(1))}M`;
}

const trim = (s) => (s.endsWith('.0') ? s.slice(0, -2) : s);

/** Milliseconds left -> "12s", "4:05", "1:59:07". Rounds up, so 200 ms reads "1s". */
export function fmtLeft(ms) {
  let s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const p2 = (v) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${p2(m)}:${p2(s)}` : `${m}:${p2(s)}`;
}

/** Seconds as a plain duration for descriptions: "12 s", "10 min", "2 h". */
export function fmtDuration(sec) {
  if (sec < 60) return `${Math.round(sec)} s`;
  if (sec < 3600) return `${trim((sec / 60).toFixed(sec % 60 ? 1 : 0))} min`;
  return `${trim((sec / 3600).toFixed(sec % 3600 ? 1 : 0))} h`;
}
