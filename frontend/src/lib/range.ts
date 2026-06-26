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
