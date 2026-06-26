export const COLORS = {
  cpu: "#4f9dff",
  mem: "#a78bfa",
  wifi: "#22d3ee",
  eth: "#f59e0b",
  netIn: "#34d399",
  netOut: "#fb7185",
  accent: "#4f9dff",
} as const;

/** Distinct, stable color for the Nth series (golden-angle hue spacing). */
export function seriesColor(i: number): string {
  const hue = (i * 137.508) % 360;
  const sat = 62 + ((i * 17) % 18); // 62–80%
  const light = 56 + ((i * 11) % 12); // 56–68%
  return `hsl(${hue.toFixed(0)} ${sat}% ${light}%)`;
}
