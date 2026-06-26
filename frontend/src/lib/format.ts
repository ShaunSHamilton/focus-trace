// Display formatters for bytes, durations, rates, percentages, timestamps.

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Bytes accumulated over `windowSecs` → a human rate. */
export function formatRate(bytes: number, windowSecs: number): string {
  if (windowSecs <= 0) return "0 B/s";
  return `${formatBytes(bytes / windowSecs)}/s`;
}

export function formatDuration(secs: number): string {
  secs = Math.max(0, Math.floor(secs));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatPercent(pct: number): string {
  return `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
}

export function formatClock(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}
