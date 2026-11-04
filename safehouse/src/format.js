// Number and duration formatting for the Safehouse UI.

/** 950 -> "950", 1234 -> "1.2k", 12345 -> "12k". */
export function fmtNum(n) {
  n = Math.floor(n);
  const a = Math.abs(n);
  if (a < 1000) return String(n);
  if (a < 10000) return `${trim((n / 1000).toFixed(1))}k`;
  if (a < 1e6) return `${Math.floor(n / 1000)}k`;
  return `${trim((n / 1e6).toFixed(1))}M`;
}

function trim(s) {
  return s.endsWith('.0') ? s.slice(0, -2) : s;
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

/** Short duration for labels: "Instant", "45s", "10 min", "1 h", "1.5 h", "24 h", "2 days". */
export function fmtDuration(sec) {
  if (sec <= 0) return 'Instant';
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${trim((sec / 60).toFixed(sec % 60 ? 1 : 0))} min`;
  if (sec <= 86400) return `${trim((sec / 3600).toFixed(sec % 3600 ? 1 : 0))} h`;
  const d = sec / 86400;
  return `${trim(d.toFixed(d % 1 ? 1 : 0))} days`;
}

export function pct(v) {
  return `${Math.round(v * 100)}%`;
}

/** "a, b and c" */
export function listJoin(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
