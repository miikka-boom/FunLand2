// Number and duration formatting.

/** 950 -> "950", 1234 -> "1.2k", 12345 -> "12k", 1.5e6 -> "1.5M". */
export function fmtNum(n) {
  n = Math.floor(n);
  const a = Math.abs(n);
  if (a < 1000) return String(n);
  if (a < 10000) return `${trim((n / 1000).toFixed(1))}k`;
  if (a < 1e6) return `${Math.floor(n / 1000)}k`;
  if (a < 1e7) return `${trim((n / 1e6).toFixed(1))}M`;
  return `${Math.floor(n / 1e6)}M`;
}

function trim(s) {
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** Full number with thin grouping: 12345 -> "12 345". */
export function fmtFull(n) {
  return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Seconds -> "12s", "4m 05s", "2h 05m", "1d 4h". Rounds up so 0.2s reads "1s". */
export function fmtTime(sec) {
  let s = Math.max(0, Math.ceil(sec));
  if (s < 60) return `${s}s`;
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const p2 = (v) => String(v).padStart(2, '0');
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return `${h}h ${p2(m)}m`;
  return `${m}m ${p2(s)}s`;
}

/** Short human duration for descriptions: "45s", "4 min", "1.5 h", "2 days". */
export function fmtDuration(sec) {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${trim((sec / 60).toFixed(sec % 60 ? 1 : 0))} min`;
  if (sec < 86400) return `${trim((sec / 3600).toFixed(sec % 3600 ? 1 : 0))} h`;
  const d = sec / 86400;
  return `${trim(d.toFixed(d % 1 ? 1 : 0))} ${d === 1 ? 'day' : 'days'}`;
}

export function pct(v) {
  return `${Math.round(v * 100)}%`;
}
