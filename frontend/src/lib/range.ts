export type RangeKey = "1h" | "24h" | "7d" | "30d";

export interface Range {
  key: RangeKey;
  label: string;
  secs: number;
  bucket: number; // server-side downsample bucket (seconds)
}

export const RANGES: Range[] = [
  { key: "1h", label: "1H", secs: 3600, bucket: 5 },
  { key: "24h", label: "24H", secs: 86_400, bucket: 300 },
  { key: "7d", label: "7D", secs: 604_800, bucket: 3600 },
  { key: "30d", label: "30D", secs: 2_592_000, bucket: 21_600 },
];

export function rangeBounds(secs: number): { from: number; to: number } {
  const to = Math.floor(Date.now() / 1000);
  return { from: to - secs, to };
}

export type FocusRangeKey = "1h" | "2h" | "6h" | "12h" | "1d" | "2d" | "7d" | "30d";

export interface FocusRange {
  key: FocusRangeKey;
  label: string;
  secs: number;
  bucket: number; // ~60-120 points per range
}

export const FOCUS_RANGES: FocusRange[] = [
  { key: "1h", label: "1h", secs: 3600, bucket: 60 },
  { key: "2h", label: "2h", secs: 7200, bucket: 120 },
  { key: "6h", label: "6h", secs: 21_600, bucket: 300 },
  { key: "12h", label: "12h", secs: 43_200, bucket: 600 },
  { key: "1d", label: "1d", secs: 86_400, bucket: 1200 },
  { key: "2d", label: "2d", secs: 172_800, bucket: 2400 },
  { key: "7d", label: "7d", secs: 604_800, bucket: 7200 },
  { key: "30d", label: "30d", secs: 2_592_000, bucket: 21_600 },
];
